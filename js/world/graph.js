// WorldGraph: the corridor road graph in memory (D7 a). Nodes, edges, the ride
// as a path through them, the ride junctions with their per-pass barriers, and
// the edge samples of whatever chunks are resident. No THREE and no DOM.
//
// The ride's samples are built here from the edges, exactly as the importer
// builds them (tools/world/stations.mjs rideSamples): one run, the join sample
// of every edge counted once, a reversed edge turned half a circle. Its `s`
// is the metres along that run.
class WorldGraph {
    // Metres of a side edge that is built beside a junction as a stub
    static get STUB_M() { return 60; }

    constructor(data) {
        this.data = data;
        this.edges = data.edges;
        this.nodes = data.nodes;
        this.junctions = data.junctions;
        this.junctionById = new Map(this.junctions.map(j => [j.id, j]));
        this.rideEdgeIds = new Set(data.ride.path.map(use => use.edgeId));
        this.samplesCache = new Map();
    }

    edge(id) { return this.edges[id]; }

    // Samples of an edge, or null while its chunks are missing. A complete answer is kept.
    samples(edgeId) {
        let found = this.samplesCache.get(edgeId);
        if (found) return found;
        found = this.data.edgeSamples(edgeId);
        if (found && this.rideEdgeIds.has(edgeId)) this.samplesCache.set(edgeId, found);
        return found;
    }

    // Arrays of the whole ride: {s, x, z, y, heading, width, flags} with a
    // continuous (unwrapped) heading. Returns null if a ride chunk is missing.
    rideSamples() {
        const rows = [];
        let s = 0;
        let previousHeading = null;
        for (let k = 0; k < this.data.ride.path.length; k++) {
            const use = this.data.ride.path[k];
            const e = this.samples(use.edgeId);
            if (!e) return null;
            const n = this.edges[use.edgeId].count;
            for (let j = k === 0 ? 0 : 1; j < n; j++) {
                const i = use.dir === 1 ? j : n - 1 - j;
                if (rows.length) {
                    const q = rows[rows.length - 1];
                    s += Math.hypot(e.x[i] - q.x, e.z[i] - q.z);
                }
                let heading = e.heading[i] + (use.dir === 1 ? 0 : Math.PI);
                if (previousHeading !== null) {
                    // Continue from the heading before: a lerp across the +-pi seam must not spin the long way
                    while (heading - previousHeading > Math.PI) heading -= 2 * Math.PI;
                    while (heading - previousHeading < -Math.PI) heading += 2 * Math.PI;
                }
                previousHeading = heading;
                rows.push({ s, x: e.x[i], z: e.z[i], y: e.y[i], heading, width: e.width[i], flags: e.flags[i], edgeId: use.edgeId });
            }
        }
        const count = rows.length;
        const out = {
            count, s: new Float64Array(count), x: new Float64Array(count), z: new Float64Array(count), y: new Float64Array(count),
            heading: new Float64Array(count), width: new Float32Array(count), flags: new Uint8Array(count), edgeId: new Uint32Array(count)
        };
        rows.forEach((r, i) => { for (const key of Object.keys(out)) if (key !== 'count') out[key][i] = r[key]; });
        return out;
    }

    // The junction pass nearest the s the rider has reached (the high-water
    // mark), for each junction within `range` metres of it
    nearestPasses(s, range) {
        const out = [];
        for (const junction of this.junctions) {
            let best = null;
            junction.passes.forEach((pass, index) => {
                const d = Math.abs(pass.sIn - s);
                if (!best || d < best.d) best = { junction, pass, index, d };
            });
            if (best && best.d <= range) out.push(best);
        }
        return out;
    }

    // Barrier poses of the passes the rider is at: each is {edgeId, x, z, heading, junctionId, width}
    barriersFor(s, range = 1000) {
        const out = [];
        for (const { junction, pass } of this.nearestPasses(s, range)) {
            for (const barrier of pass.barriers) {
                out.push({ ...barrier, junctionId: junction.id, node: junction.node, width: this.stubWidth(barrier.edgeId) });
            }
        }
        return out;
    }

    stubWidth(edgeId) {
        const e = this.samples(edgeId);
        if (!e) return 6;
        let sum = 0;
        for (let i = 0; i < e.width.length; i++) sum += e.width[i];
        return e.width.length ? sum / e.width.length : 6;
    }

    // The first `lengthM` of an edge from `nodeId`, as sample arrays in the
    // direction away from the node; null while the edge is not resident
    stub(edgeId, nodeId, lengthM = WorldGraph.STUB_M) {
        const e = this.samples(edgeId);
        if (!e) return null;
        const edge = this.edges[edgeId];
        const n = edge.count;
        const forward = edge.a === nodeId;
        const rows = [];
        let run = 0;
        for (let j = 0; j < n; j++) {
            const i = forward ? j : n - 1 - j;
            if (rows.length) run += Math.hypot(e.x[i] - e.x[rows[rows.length - 1]], e.z[i] - e.z[rows[rows.length - 1]]);
            rows.push(i);
            if (run >= lengthM) break;
        }
        return rows.map(i => ({ x: e.x[i], z: e.z[i], y: e.y[i], heading: e.heading[i] + (forward ? 0 : Math.PI), width: e.width[i], flags: e.flags[i] }));
    }

    // The turn a pass makes: angle from the way the rider arrives to the way
    // it leaves, positive to the right (a heading turns right as it grows)
    static turnOf(junction, pass) {
        if (pass.inEdge === null || pass.inEdge === undefined) return null;
        const incoming = junction.incident.find(i => i.edgeId === pass.inEdge);
        const outgoing = junction.incident.find(i => i.edgeId === pass.outEdge);
        if (!incoming || !outgoing) return null;
        let delta = outgoing.heading - (incoming.heading + Math.PI);
        while (delta > Math.PI) delta -= 2 * Math.PI;
        while (delta < -Math.PI) delta += 2 * Math.PI;
        return delta;
    }
}
