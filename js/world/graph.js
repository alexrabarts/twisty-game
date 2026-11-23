// WorldGraph: the corridor road graph in memory (D7 a). Nodes, edges, the ride
// as a path through them, the ride junctions and the side roads that leave them,
// and the edge samples of whatever chunks are resident. No THREE and no DOM.
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

    // The side roads that leave the ride at its junctions: edge id to the junction's node. Each is drawn from the node
    // as a stub (stub), the rest of its edge on from the stub's end; a rider may ride any of them (nothing closes one)
    sideStubs() {
        if (!this.stubNodes) {
            this.stubNodes = new Map();
            for (const junction of this.junctions) {
                for (const { edgeId } of junction.incident) if (!this.rideEdgeIds.has(edgeId)) this.stubNodes.set(edgeId, junction.node);
            }
        }
        return this.stubNodes;
    }

    // The node's other edge where the road only goes on through it (degree 2), or null
    onwardEdge(edgeId, nodeId) {
        if (!this.nodes || !this.nodes.degree || this.nodes.degree[nodeId] !== 2) return null;
        if (!this.byNode) {
            this.byNode = new Map();
            for (const e of this.edges) for (const n of [e.a, e.b]) {
                if (!this.byNode.has(n)) this.byNode.set(n, []);
                this.byNode.get(n).push(e);
            }
        }
        const next = (this.byNode.get(nodeId) || []).find(e => e.id !== edgeId);
        return next && !next.onRide ? next : null;
    }

    // The side road from a junction along `edgeId`, on through the nodes it only passes (degree 2), up to `lengthM`:
    // [{x, z, y, heading, width, bits, edgeId, run}] away from the node; `complete` false while an edge of it is not resident
    chainFrom(edgeId, nodeId, lengthM) {
        const rows = [];
        let run = 0, edge = this.edges[edgeId], from = nodeId;
        const used = new Set();
        while (edge && !used.has(edge.id)) {
            used.add(edge.id);
            const e = this.samples(edge.id);
            if (!e) return { rows, complete: false };
            const forward = edge.a === from;
            for (let j = rows.length ? 1 : 0; j < edge.count; j++) {
                const i = forward ? j : edge.count - 1 - j;
                if (rows.length) run += Math.hypot(e.x[i] - rows[rows.length - 1].x, e.z[i] - rows[rows.length - 1].z);
                rows.push({ x: e.x[i], z: e.z[i], y: e.y[i], heading: e.heading[i] + (forward ? 0 : Math.PI), width: e.width[i], bits: e.flags[i], edgeId: edge.id, run });
                if (run >= lengthM) return { rows, complete: true };
            }
            const far = forward ? edge.b : edge.a;
            from = far;
            edge = this.onwardEdge(edge.id, far);
        }
        return { rows, complete: true };
    }

    // The mean width of an edge, 6 m while it is not resident
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
    // it leaves, positive to the left (a heading turns left as it grows: Route.turnSide)
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
