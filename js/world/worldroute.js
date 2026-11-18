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

    // Metres from a segment's chord within which nearestSegment frames a point in the drawn ribbon (beyond, the chord)
    static get FRAME_REACH_M() { return 40; }

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

    // A smooth curvature profile for the hairpin assist: the signed curvature over a `span` centred on each
    // sample, then a [1 2 1] pass along the ride, built once per span and interpolated linearly between the
    // samples, so it has no steps where the 4 m polyline turns from one segment to the next
    smoothCurvatureAt(s, span) {
        // One profile per span: the assist and the camera each read their own tuned span, and neither may rebuild the other's
        if (!this.smoothCurvature) this.smoothCurvature = new Map();
        let values = this.smoothCurvature.get(span);
        if (!values) {
            const count = this.points.length;
            const raw = new Float64Array(count);
            values = new Float64Array(count);
            for (let i = 0; i < count; i++) raw[i] = this.headingChange(this.sArray[i] - span / 2, this.sArray[i] + span / 2) / span;
            for (let i = 0; i < count; i++) values[i] = (raw[Math.max(0, i - 1)] + 2 * raw[i] + raw[Math.min(count - 1, i + 1)]) / 4;
            this.smoothCurvature.set(span, values);
        }
        const last = this.points.length - 1;
        if (last < 1) return 0;
        const clamped = Math.max(0, Math.min(this.length, s));
        const i = Math.min(last - 1, this.indexAt(clamped));
        const run = this.sArray[i + 1] - this.sArray[i];
        const t = run > 0 ? (clamped - this.sArray[i]) / run : 0;
        return values[i] + (values[i + 1] - values[i]) * t;
    }

    // The road frame at (x, z) on a smooth centreline: a cubic through the samples with each sample's heading
    // as its tangent, so the frame has no kinks at the samples. From the projection's s (which jumps a little
    // on the inside of a turn, where the nearest polyline segment changes) a few Newton steps find the point
    // whose tangent is square to the bike. Fills out {s, heading, lateral} and returns it.
    smoothFrame(x, z, s0, out = {}) {
        const last = this.points.length - 1;
        let s = Math.max(0, Math.min(this.length, s0));
        for (let step = 0; step < 4 && last >= 1; step++) {
            this.curveAt(s, out);
            const along = (x - out.px) * Math.sin(out.heading) + (z - out.pz) * Math.cos(out.heading);
            const next = Math.max(0, Math.min(this.length, s + along));
            if (Math.abs(next - s) < 1e-4) break;
            s = next;
        }
        if (last >= 1) this.curveAt(s, out);
        else { out.px = x; out.pz = z; out.heading = 0; }
        out.s = s;
        out.lateral = (x - out.px) * Math.cos(out.heading) - (z - out.pz) * Math.sin(out.heading);
        return out;
    }

    // The cubic Hermite centreline at s: {px, pz, heading}
    curveAt(s, out) {
        const last = this.points.length - 1;
        const i = Math.min(last - 1, this.indexAt(Math.max(0, Math.min(this.length, s))));
        const a = this.points[i], b = this.points[i + 1];
        const run = this.sArray[i + 1] - this.sArray[i];
        const t = run > 0 ? Math.max(0, Math.min(1, (s - this.sArray[i]) / run)) : 0;
        const tax = Math.sin(a.heading) * run, taz = Math.cos(a.heading) * run;
        const tbx = Math.sin(b.heading) * run, tbz = Math.cos(b.heading) * run;
        const t2 = t * t, t3 = t2 * t;
        const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
        out.px = h00 * a.x + h10 * tax + h01 * b.x + h11 * tbx;
        out.pz = h00 * a.z + h10 * taz + h01 * b.z + h11 * tbz;
        const d00 = 6 * t2 - 6 * t, d10 = 3 * t2 - 4 * t + 1, d01 = -6 * t2 + 6 * t, d11 = 3 * t2 - 2 * t;
        const dx = d00 * a.x + d10 * tax + d01 * b.x + d11 * tbx;
        const dz = d00 * a.z + d10 * taz + d01 * b.z + d11 * tbz;
        out.heading = dx === 0 && dz === 0 ? a.heading : Math.atan2(dx, dz);
        return out;
    }

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
        return WorldRoute.laneFor(this.sample(s, this.ruleScratch).width);
    }

    static laneFor(width) {
        return Math.max(0, Math.min(width * 0.42, width / 2 - Route.CAR_HALF_WIDTH - WorldRoute.LANE_EDGE_MARGIN_M));
    }

    // The lane line a traffic vehicle drives, at u (a sample index and the fraction to the next: traffic's
    // currentSegment + segmentProgress). Each row's lane point is where the ribbon draws that lateral, P_k + l_k n_k
    // with n_k the row's own normal (RoadMesh.nearRibbon, the frame nearestSegment projects in) and l_k the lane of
    // a vehicle going in `direction` at that row's width (Route.keepRight). Those points joined straight are the drawn
    // lane, but its heading steps at every row: up to 0.66 rad in the held 6 m hairpins, which a car's body showed as a
    // snap across the bend. The line driven is their uniform cubic B-spline instead: curvature-continuous, so the
    // heading and the yaw rate have no step, and it keeps inside each corner of the drawn lane (by about a sixth of
    // the corner's turn times the row spacing), so every wheel stays on the drawn carriageway
    // (tests/unit/world-traffic.test.js). `extra` moves the line across (a rider passing), with `extraRate` its
    // change per unit of u.
    // Fills out {x, y, z, heading (the line's tangent toward increasing u), curvature (per metre, positive where the
    // heading grows with u), metres (metres of line per unit of u), lateral} and returns it.
    laneCurve(u, direction, extra = 0, extraRate = 0, out = {}) {
        const pts = this.points;
        const last = pts.length - 1;
        const at = Math.max(0, Math.min(last, u));
        const i = Math.max(0, Math.min(last - 1, Math.floor(at)));
        const t = at - i, t2 = t * t, t3 = t2 * t, m = 1 - t;
        const w = [m * m * m / 6, (3 * t3 - 6 * t2 + 4) / 6, (-3 * t3 + 3 * t2 + 3 * t + 1) / 6, t3 / 6];
        const d = [-m * m / 2, (3 * t2 - 4 * t) / 2, (-3 * t2 + 2 * t + 1) / 2, t2 / 2];
        const dd = [m, 3 * t - 2, 1 - 3 * t, t];
        const side = Route.keepRight(direction);
        let x = 0, z = 0, dx = 0, dz = 0, ddx = 0, ddz = 0, nx = 0, nz = 0, ndx = 0, ndz = 0, lane = 0;
        for (let k = 0; k < 4; k++) {
            const p = pts[Math.max(0, Math.min(last, i - 1 + k))];
            const cx = Math.cos(p.heading), cz = -Math.sin(p.heading);
            const l = side * WorldRoute.laneFor(p.width);
            const qx = p.x + l * cx, qz = p.z + l * cz;
            x += w[k] * qx; z += w[k] * qz;
            dx += d[k] * qx; dz += d[k] * qz;
            ddx += dd[k] * qx; ddz += dd[k] * qz;
            nx += w[k] * cx; nz += w[k] * cz;
            ndx += d[k] * cx; ndz += d[k] * cz;
            lane += w[k] * l;
        }
        x += extra * nx; z += extra * nz;
        dx += extra * ndx + extraRate * nx; dz += extra * ndz + extraRate * nz;
        const run = Math.hypot(dx, dz);
        const a = pts[i], b = pts[i + 1] || a;
        out.x = x;
        out.z = z;
        out.y = a.y + (b.y - a.y) * t;
        out.heading = run > 0 ? Math.atan2(dx, dz) : a.heading;
        out.curvature = run > 1e-9 ? (dz * ddx - dx * ddz) / (run * run * run) : 0;
        out.metres = run;
        out.lateral = lane + extra;
        return out;
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
                const turn = Route.turnSide(delta, 0.35);
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

    // Where (x, z) lies on the ride, in the frame the ribbon is drawn in (RoadMesh.nearRibbon): each row puts its
    // columns at p + offset * n along its own normal n, and a quad between rows a and b is bilinear, so the drawn
    // point at (t, offset) is P(t) + offset * N(t) with P and N the linear blends of the rows' points and normals.
    // Solving x = P(t) + l * N(t) gives the drawn column `lateral` = l and the progress at t: the road band
    // |lateral| <= width / 2 is the drawn carriageway to the centimetre, and s runs on without a step across a
    // sample. The chord's nearest point (the old frame) puts the band up to a fifth of a metre off the drawn edge
    // in a held hairpin and makes s jump by 2 l tan(turn / 2) at each sample on the inside of a bend: 2 m a sample
    // at the inner edge of a 6 m hairpin sampled every 4 m, which the cut rule read as a cut across stacked road.
    // A point no segment of the range frames (past the ends, or beyond the fold on the inside of a bend) takes the
    // chord's nearest point as before.
    nearestSegment(x, z, from, to, out) {
        let best = Infinity;
        let bestIndex = from;
        let bestT = 0;
        let frameD2 = Infinity, frameIndex = -1, frameT = 0, frameL = 0;
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
            // Only a segment near the chord's best can frame the point: the frame is the chord's up to the turn
            if (d2 > WorldRoute.FRAME_REACH_M * WorldRoute.FRAME_REACH_M) continue;
            const hit = WorldRoute.frame(a, b, x - a.x, z - a.z);
            if (!hit) continue;
            const fx = a.x + dx * hit.t - x, fz = a.z + dz * hit.t - z;
            const f2 = fx * fx + fz * fz;
            if (f2 < frameD2) {
                frameD2 = f2;
                frameIndex = i;
                frameT = hit.t;
                frameL = hit.l;
            }
        }
        // The frame's centre point is never much further than the chord's nearest point: a frame from a segment well
        // beyond it (past the route's ends, or another leg) is not the drawn road here
        const framed = frameIndex >= 0 && Math.sqrt(frameD2) <= Math.sqrt(best) * 1.25 + 0.5;
        if (framed) {
            bestIndex = frameIndex;
            bestT = frameT;
        }
        const bestL = frameL;
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
        out.lateral = framed ? bestL : (x - out.x) * Math.cos(heading) - (z - out.z) * Math.sin(heading);
        out.distance = framed ? Math.abs(bestL) : Math.sqrt(best);
        return out;
    }

    // The ribbon frame of the segment a-b at (wx, wz) = (x, z) - a: {t, l} with t in [0, 1] and (x, z) = P(t) +
    // l N(t), or null when the segment's quad strip does not hold the point. The cross product of (w - t d) and
    // N(t) = n_a + t (n_b - n_a) is a quadratic in t; of its roots in [0, 1] the one nearest the centre is the
    // drawn one (a second root lies past the fold on the inside of the bend)
    static frame(a, b, wx, wz) {
        const dx = b.x - a.x, dz = b.z - a.z;
        const nax = Math.cos(a.heading), naz = -Math.sin(a.heading);
        const ex = Math.cos(b.heading) - nax, ez = -Math.sin(b.heading) - naz;
        const cross = (ux, uz, vx, vz) => ux * vz - uz * vx;
        const A = -cross(dx, dz, ex, ez);
        const B = cross(wx, wz, ex, ez) - cross(dx, dz, nax, naz);
        const C = cross(wx, wz, nax, naz);
        const eps = 1e-9;
        let r0 = NaN, r1 = NaN;
        if (Math.abs(A) < 1e-12) {
            if (Math.abs(B) < 1e-12) return null;
            r0 = -C / B;
        } else {
            const disc = B * B - 4 * A * C;
            if (disc < 0) return null;
            const root = Math.sqrt(disc);
            // The stable pair: no cancellation when B is large against A (a nearly straight segment)
            const q = -0.5 * (B + (B >= 0 ? root : -root));
            r0 = q / A;
            r1 = q !== 0 ? C / q : NaN;
        }
        let found = null;
        for (const t of [r0, r1]) {
            if (!(t >= -eps && t <= 1 + eps)) continue;
            const u = Math.max(0, Math.min(1, t));
            const nx = nax + u * ex, nz = naz + u * ez;
            const n2 = nx * nx + nz * nz;
            if (n2 < 1e-9) continue;
            const l = ((wx - u * dx) * nx + (wz - u * dz) * nz) / n2;
            if (!found || Math.abs(l) < Math.abs(found.l)) found = { t: u, l };
        }
        return found;
    }
}
