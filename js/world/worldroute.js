// WorldRoute: the route contract (js/world/route.js) over the ride of a world:
// the mapped road samples, about 4 m apart but not evenly (an edge ends where
// it ends). Progress is metres along the ride. A "unit" of the legacy
// consumers is one sample, so `toUnits` and `fromUnits` interpolate through
// the sample list rather than divide by a constant.
//
// project() is the continuity projection of the contract: it looks only
// PROJECT_WINDOW_M either side of the previous answer, and goes to a 64 m
// spatial hash over the whole ride only when the point is further than a road
// width from everything in that window. That is how a rider on one leg of a
// stacked hairpin never snaps to the leg 25 m away.
class WorldRoute extends PolylineRoute {
    // Metres across a cell of the cold-lookup hash
    static get HASH_M() { return 64; }

    // Metres of road over the road at a tunnel or gallery
    static get ROOF_M() { return 6.5; }

    // The road a traffic car's body keeps clear of on its outer side, in metres
    static get LANE_EDGE_MARGIN_M() { return 0.2; }

    // Flag bits of a sample (tools/world/profile.mjs FLAG)
    static get FLAG() { return { tunnel: 1, bridge: 2, gallery: 4, cobbles: 8 }; }

    // {tunnel, bridge, gallery, cobbles} for a flag byte; the objects are shared and frozen
    static flagsOf(bits) {
        if (!WorldRoute.flagTable) {
            WorldRoute.flagTable = [];
            for (let b = 0; b < 16; b++) {
                WorldRoute.flagTable.push(Object.freeze({ tunnel: !!(b & 1), bridge: !!(b & 2), gallery: !!(b & 4), cobbles: !!(b & 8) }));
            }
        }
        return WorldRoute.flagTable[bits & 15];
    }

    // samples: {count, s, x, y, z, heading, width, flags} typed arrays (WorldGraph.rideSamples)
    constructor(samples, { stations = [], stages = [], graph = null } = {}) {
        const points = [];
        for (let i = 0; i < samples.count; i++) {
            points.push({
                x: samples.x[i], y: samples.y[i], z: samples.z[i], heading: samples.heading[i], width: samples.width[i],
                s: samples.s[i], bits: samples.flags[i], flags: WorldRoute.flagsOf(samples.flags[i]), edgeId: samples.edgeId ? samples.edgeId[i] : -1
            });
        }
        super(points, 4, { stations, stages });
        this.sArray = samples.s;
        this.graph = graph;
        this.buildHash();
        this.ruleScratch = {};
        this.turnFrom = {};
        this.turnTo = {};
    }

    get length() { return this.points.length ? this.sArray[this.points.length - 1] : 0; }

    toUnits(s) {
        const last = this.points.length - 1;
        if (last < 1) return 0;
        const clamped = Math.max(0, Math.min(this.length, s));
        const i = Math.min(last - 1, this.indexAt(clamped));
        const span = this.sArray[i + 1] - this.sArray[i];
        return i + (span > 0 ? (clamped - this.sArray[i]) / span : 0);
    }

    fromUnits(units) {
        const last = this.points.length - 1;
        if (last < 1) return 0;
        const u = Math.max(0, Math.min(last, units));
        const i = Math.min(last - 1, Math.floor(u));
        return this.sArray[i] + (this.sArray[i + 1] - this.sArray[i]) * (u - i);
    }

    // The index of the last sample at or before s
    indexAt(s) {
        const arr = this.sArray;
        let lo = 0, hi = arr.length - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (arr[mid] <= s) lo = mid; else hi = mid - 1;
        }
        return lo;
    }

    sample(s, out = {}) {
        const last = this.points.length - 1;
        const clamped = Math.max(0, Math.min(this.length, s));
        const i = Math.min(last - 1, this.indexAt(clamped));
        const a = this.points[i];
        const b = this.points[i + 1] || a;
        const span = this.sArray[i + 1] - this.sArray[i];
        const t = span > 0 ? (clamped - this.sArray[i]) / span : 0;
        out.x = a.x + (b.x - a.x) * t;
        out.y = a.y + (b.y - a.y) * t;
        out.z = a.z + (b.z - a.z) * t;
        out.heading = a.heading + (b.heading - a.heading) * t;
        out.width = a.width + (b.width - a.width) * t;
        out.grade = span > 0 ? (b.y - a.y) / span : 0;
        out.flags = a.flags;
        return out;
    }

    heightRange(s0, s1) {
        const lo = Math.min(s0, s1), hi = Math.max(s0, s1);
        const ends = [this.sample(lo, this.ruleScratch).y, this.sample(hi, this.ruleScratch).y];
        let min = Math.min(...ends);
        let max = Math.max(...ends);
        for (let i = this.indexAt(lo) + 1; i < this.points.length && this.sArray[i] <= hi; i++) {
            min = Math.min(min, this.points[i].y);
            max = Math.max(max, this.points[i].y);
        }
        return { min, max };
    }

    ceilingAt(s) {
        const point = this.points[Math.min(this.points.length - 1, this.indexAt(Math.max(0, Math.min(this.length, s))))];
        return point && (point.bits & (WorldRoute.FLAG.tunnel | WorldRoute.FLAG.gallery)) ? WorldRoute.ROOF_M : undefined;
    }

    // The signed heading change from s0 to s1 (positive toward +lateral), wrapped to [-pi, pi]: the one sampler of
    // "how far the road turns ahead" that the cut rule, the camera and the test pilot all read
    headingChange(s0, s1) {
        let turn = this.sample(s1, this.turnTo).heading - this.sample(s0, this.turnFrom).heading;
        while (turn > Math.PI) turn -= 2 * Math.PI;
        while (turn < -Math.PI) turn += 2 * Math.PI;
        return turn;
    }

    // The signed heading change per metre over the `span` metres after s
    curvatureAt(s, span) { return this.headingChange(s, s + span) / span; }

    // Runs of the ride that carry `kind` (tunnel, bridge, gallery or cobbles): [{s0, s1}]
    ranges(kind) {
        const bit = WorldRoute.FLAG[kind];
        const out = [];
        if (!bit) return out;
        let open = null;
        for (let i = 0; i < this.points.length; i++) {
            const on = (this.points[i].bits & bit) !== 0;
            if (on && open === null) open = this.sArray[i];
            if (!on && open !== null) { out.push({ s0: open, s1: this.sArray[i] }); open = null; }
        }
        if (open !== null) out.push({ s0: open, s1: this.length });
        return out;
    }

    // Traffic keeps to the outer part of each half of the road. The rider's line wanders by up to about 2 m round a
    // hairpin, and a car is hit within 2.2 m, so a lane in the middle of the half (2.5 m on a 10 m road) was hit on a
    // bend. The lane goes out to 0.42 of the width, but never so far that the car's body comes within
    // LANE_EDGE_MARGIN_M of the road's edge: on a 10 m road that is 3.99 m off the centre, and every road narrower
    // than about 12.6 m is held by the edge rather than by the 0.42.
    laneOffset(s) {
        const width = this.sample(s, this.ruleScratch).width;
        return Math.max(0, Math.min(width * 0.42, width / 2 - Route.CAR_HALF_WIDTH - WorldRoute.LANE_EDGE_MARGIN_M));
    }

    // The two lanes traffic uses while roadworks take the rest of the road: where each stays, as an offset from the centre
    detourOffsets(s) {
        const width = this.sample(s, this.ruleScratch).width;
        return { left: -width * 0.22, right: width * 0.45 };
    }

    // The next ride junctions within `distance` of s: [{junctionId, s, name, turn, keep, distance}]
    // `turn` is the way the road goes (left, right or straight); `keep` is set only for a fork that
    // bears away gently, the branch to keep ("keep left")
    junctionsAhead(s, distance) {
        if (!this.graph) return [];
        const out = [];
        for (const junction of this.graph.junctions) {
            for (const pass of junction.passes) {
                if (pass.sIn <= s || pass.sIn > s + distance) continue;
                const delta = WorldGraph.turnOf(junction, pass);
                if (delta === null) continue;
                const turn = Math.abs(delta) < 0.35 ? 'straight' : delta > 0 ? 'right' : 'left';
                const keep = turn !== 'straight' && Math.abs(delta) < 1.0 ? turn : null;
                out.push({ junctionId: junction.id, s: pass.sIn, name: junction.name, turn, keep, distance: pass.sIn - s });
            }
        }
        return out.sort((p, q) => p.s - q.s);
    }

    buildHash() {
        this.hash = new Map();
        const cell = WorldRoute.HASH_M;
        for (let i = 0; i + 1 < this.points.length; i++) {
            const a = this.points[i], b = this.points[i + 1];
            const reach = Math.max(a.width, b.width) / 2;
            const x0 = Math.floor((Math.min(a.x, b.x) - reach) / cell), x1 = Math.floor((Math.max(a.x, b.x) + reach) / cell);
            const z0 = Math.floor((Math.min(a.z, b.z) - reach) / cell), z1 = Math.floor((Math.max(a.z, b.z) + reach) / cell);
            for (let cx = x0; cx <= x1; cx++) {
                for (let cz = z0; cz <= z1; cz++) {
                    const key = cx * 65536 + cz;
                    let list = this.hash.get(key);
                    if (!list) this.hash.set(key, (list = []));
                    list.push(i);
                }
            }
        }
    }

    // Segments in the hash cells within `rings` cells of (x, z)
    // The ride segments listed in the hash cell that holds (x, z), or undefined: every segment whose road band reaches
    // into the cell is in it. The route's own array, so read it and never change it; no allocation, for per-vertex use.
    cellSegments(x, z) {
        const cell = WorldRoute.HASH_M;
        return this.hash.get(Math.floor(x / cell) * 65536 + Math.floor(z / cell));
    }

    hashCandidates(x, z, rings) {
        const cell = WorldRoute.HASH_M;
        const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
        const found = new Set();
        for (let dx = -rings; dx <= rings; dx++) {
            for (let dz = -rings; dz <= rings; dz++) {
                const list = this.hash.get((cx + dx) * 65536 + (cz + dz));
                if (list) for (const i of list) found.add(i);
            }
        }
        return found;
    }

    project(x, z, hint, out = {}) {
        const count = this.points.length;
        if (count < 2) {
            out.index = -1;
            return out;
        }
        const last = count - 2;
        if (hint && hint.index >= 0) {
            const centre = Math.min(hint.index, last);
            const s0 = this.sArray[centre] - Route.PROJECT_WINDOW_M;
            const s1 = this.sArray[centre] + Route.PROJECT_WINDOW_M;
            const from = Math.max(0, this.indexAt(Math.max(0, s0)));
            const to = Math.min(last, this.indexAt(Math.min(this.length, s1)) + 1);
            this.nearestSegment(x, z, from, to, out);
            if (out.distance > Route.COLD_LOOKUP_WIDTHS * this.points[out.index].width) this.coldLookup(x, z, out);
        } else {
            this.coldLookup(x, z, out, true);
        }
        out.flags = this.points[out.index].flags;
        out.forwardDot = hint && hint.heading !== undefined ? Math.cos(hint.heading - out.heading) : 0;
        return out;
    }

    // The nearest segment of the whole ride, through the hash: a segment found
    // within `rings` cells and nearer than `rings` cell widths cannot be beaten
    // by one in a cell not yet looked in. `whole` scans every segment (a first
    // fix, where the answer must be exact).
    coldLookup(x, z, out, whole = false) {
        if (!whole) {
            const scratch = this.coldScratch || (this.coldScratch = {});
            for (let rings = 1; rings <= 3; rings++) {
                const found = [...this.hashCandidates(x, z, rings)].sort((p, q) => p - q);
                let bestD = Infinity;
                let bestI = -1;
                for (const i of found) {
                    this.nearestSegment(x, z, i, i, scratch);
                    if (scratch.distance < bestD) { bestD = scratch.distance; bestI = i; }
                }
                if (bestI >= 0 && bestD <= rings * WorldRoute.HASH_M) return this.nearestSegment(x, z, bestI, bestI, out);
            }
        }
        return this.nearestSegment(x, z, 0, this.points.length - 2, out);
    }

    nearestSegment(x, z, from, to, out) {
        let best = Infinity;
        let bestIndex = from;
        let bestT = 0;
        for (let i = from; i <= to; i++) {
            const a = this.points[i];
            const b = this.points[i + 1];
            const dx = b.x - a.x;
            const dz = b.z - a.z;
            const run = dx * dx + dz * dz;
            const t = run === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / run));
            const px = a.x + dx * t - x;
            const pz = a.z + dz * t - z;
            const d2 = px * px + pz * pz;
            if (d2 < best) {
                best = d2;
                bestIndex = i;
                bestT = t;
            }
        }
        const a = this.points[bestIndex];
        const b = this.points[bestIndex + 1];
        const heading = a.heading + (b.heading - a.heading) * bestT;
        out.index = bestIndex;
        out.along = bestT;
        out.x = a.x + (b.x - a.x) * bestT;
        out.z = a.z + (b.z - a.z) * bestT;
        out.y = a.y + (b.y - a.y) * bestT;
        out.heading = heading;
        out.width = a.width + (b.width - a.width) * bestT;
        out.s = this.sArray[bestIndex] + (this.sArray[bestIndex + 1] - this.sArray[bestIndex]) * bestT;
        out.lateral = (x - out.x) * Math.cos(heading) - (z - out.z) * Math.sin(heading);
        out.distance = Math.sqrt(best);
        return out;
    }
}
