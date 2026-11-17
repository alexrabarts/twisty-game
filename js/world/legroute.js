// LegRoute: the route contract over environment.roadPath, the 20 m segments
// every leg is built from. It reproduces what the game always read from the
// road path, to the bit: the vehicle's nearest-vertex picker, the (segment,
// progress) lerp traffic rides on, the road height range the atmosphere reads,
// and the roof of a tunnel. Retired with the legs.
class LegRoute extends Route {
    static get SEGMENT_M() { return 20; }

    constructor(environment) {
        super();
        this.environment = environment;
    }

    get unitM() { return LegRoute.SEGMENT_M; }

    get unitCount() { return this.environment.roadPath.length; }

    get length() { return Math.max(0, this.environment.roadPath.length - 1) * LegRoute.SEGMENT_M; }

    pointAtUnit(i) { return this.environment.roadPath[i]; }

    // The road at s, linear between the two vertices round it. A vertex
    // answers with its own values.
    sample(s, out = {}) {
        const path = this.environment.roadPath;
        const last = path.length - 1;
        const at = Math.max(0, Math.min(last, s / LegRoute.SEGMENT_M));
        const i = Math.floor(at);
        const t = at - i;
        if (t === 0) return this.copyVertex(path[i], out);
        return this.sampleAt(i, t, out);
    }

    // The road `t` of the way from vertex `segment` to the next, the lerp
    // traffic has always used, with the vertex-to-vertex run (dx, dz) and turn.
    // `segment` wraps round a looping path.
    sampleAt(segment, t, out = {}) {
        const path = this.environment.roadPath;
        const total = path.length;
        const wrapped = Math.floor(segment) % total;
        const index = wrapped < 0 ? wrapped + total : wrapped;
        const from = path[index];
        const to = path[(index + 1) % total];
        out.x = from.x + (to.x - from.x) * t;
        out.y = from.y + (to.y - from.y) * t;
        out.z = from.z + (to.z - from.z) * t;
        let turn = to.heading - from.heading;
        if (turn > Math.PI) turn -= 2 * Math.PI;
        if (turn < -Math.PI) turn += 2 * Math.PI;
        out.heading = from.heading + turn * t;
        out.width = this.environment.roadWidth;
        // The way the road runs from this vertex to the next, and how far
        // its heading turns on the way: what traffic faces and leans by
        out.dx = to.x - from.x;
        out.dz = to.z - from.z;
        out.turn = turn;
        return out;
    }

    copyVertex(vertex, out) {
        out.x = vertex.x;
        out.y = vertex.y;
        out.z = vertex.z;
        out.heading = vertex.heading;
        out.width = this.environment.roadWidth;
        return out;
    }

    // The nearest vertex to (x, z) within `radius` vertices of the hint's
    // index, or over the whole road when there is no hint. A vertex is the
    // answer, never a point between two: a wrong pick sticks, which is why
    // the vehicle searches only near where it was.
    project(x, z, hint, out = {}, radius = 10) {
        const path = this.environment.roadPath;
        out.index = -1;
        if (!path || path.length === 0) return out;

        let best = Infinity;
        let nearest = null;
        if (hint) {
            const start = Math.max(0, hint.index - radius);
            const end = Math.min(path.length - 1, hint.index + radius);
            for (let index = start; index <= end; index++) {
                const vertex = path[index];
                const distance = Math.sqrt(Math.pow(x - vertex.x, 2) + Math.pow(z - vertex.z, 2));
                if (distance < best) {
                    best = distance;
                    nearest = vertex;
                    out.index = index;
                }
            }
        } else {
            for (let index = 0; index < path.length; index++) {
                const vertex = path[index];
                const dx = x - vertex.x;
                const dz = z - vertex.z;
                const distSq = dx * dx + dz * dz;
                if (distSq < best) {
                    best = distSq;
                    nearest = vertex;
                    out.index = index;
                }
            }
            best = Math.sqrt(best);
        }
        if (!nearest) return out;

        out.distance = best;
        out.s = out.index * LegRoute.SEGMENT_M;
        out.along = 0;
        out.forwardDot = 0;
        out.x = nearest.x;
        out.y = nearest.y;
        out.z = nearest.z;
        out.heading = nearest.heading;
        out.width = this.environment.roadWidth;
        // Signed distance from the centre line, positive to the right of the road
        out.lateral = (x - nearest.x) * Math.cos(nearest.heading) + (z - nearest.z) * -Math.sin(nearest.heading);
        return out;
    }

    // The road height over the vertices in [s0, s1], and at the ends when
    // they fall between two
    heightRange(s0, s1) {
        const path = this.environment.roadPath;
        const from = s0 / LegRoute.SEGMENT_M;
        const to = Math.min(s1 / LegRoute.SEGMENT_M, path.length - 1);
        let min = Infinity;
        let max = -Infinity;
        const take = y => {
            min = Math.min(min, y);
            max = Math.max(max, y);
        };
        for (let i = Math.max(0, Math.ceil(from)); i <= Math.floor(to); i++) take(path[i].y || 0);
        if (from <= to && from % 1 !== 0) take(this.sample(s0).y || 0);
        if (from <= to && to % 1 !== 0) take(this.sample(s1).y || 0);
        return Number.isFinite(min) ? { min, max } : { min: 0, max: 0 };
    }

    ceilingAt(s) {
        const environment = this.environment;
        if (!environment.setPieces || !environment.setPieces.length) return undefined;
        return Terrain.ceilingAt(environment.terrain, Math.floor(s / LegRoute.SEGMENT_M));
    }

    // Traffic keeps to ±3 m of the centre line on every leg
    laneOffset() { return 3; }

    // Where traffic passes roadworks: between the containers and the centre
    // cones on the left, wide of the zone on the right
    detourOffsets() { return { left: -2.2, right: 5 }; }

    // A leg has no side roads
    offRoute() { return false; }
}
