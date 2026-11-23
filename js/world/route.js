// The route contract: what the game asks of "the road the rider follows".
// A leg answers it from its road path of 20 m segments (LegRoute,
// js/world/legroute.js); the world answers it from mapped road samples.
// No THREE and no DOM, so it loads in the node harness.
//
// Progress is one metric quantity, `s` (metres along the route). Code that
// still thinks in whole progress steps (the atmosphere track, the section
// builder, traffic windows) converts at the edge with toUnits/fromUnits: a
// "unit" is `unitM` metres.
//
// project() is a continuity projection. It searches within PROJECT_WINDOW_M
// either side of the previous answer (the `hint`), so a rider on one leg of a
// stacked hairpin never snaps to the parallel leg 25 m away. It widens to the
// whole route only when the point is further than one road width from every
// segment in the window (COLD_LOOKUP_WIDTHS).
//
// Sides: the one convention. A heading h points along (sin h, cos h) in (x, z), and lateral is measured along
// (cos h, -sin h). The chase camera looks along the heading with +y up, so the screen's right is (-cos h, sin h):
// positive lateral is the LEFT of a rider going toward increasing s, and a heading that grows turns LEFT. (Game +x
// is the rider's left at heading 0, which is why bike files written with +x on the right are mirrored.) A side the
// rider is told about or that traffic keeps to is read through Route.LEFT, Route.RIGHT, Route.turnSide and
// Route.keepRight, never a bare sign. Two older vocabularies name +lateral 'right' instead and are only labels: the
// legs' terrain sides and lanes (.agent/system/world.md) and the road styles' edge keys (RoadSurface.styles).
class Route {
    // The lateral sign of the left and of the right of a rider going toward increasing s
    static get LEFT() { return 1; }
    static get RIGHT() { return -1; }

    // 'left', 'right' or 'straight' for a heading change (radians, positive when the heading grows) on the screen
    static turnSide(delta, straight = 0) {
        if (Math.abs(delta) < straight) return 'straight';
        return Math.sign(delta) === Route.LEFT ? 'left' : 'right';
    }

    // The lateral sign of the half of the road a vehicle keeps to: traffic drives on the right (Switzerland), so a
    // vehicle going toward increasing s (direction +1) keeps to Route.RIGHT and one going against s (direction -1)
    // keeps to its own right, which is Route.LEFT in the route's frame
    static keepRight(direction) {
        return direction < 0 ? -Route.RIGHT : Route.RIGHT;
    }

    // Metres either side of the hint that the continuity search covers
    static get PROJECT_WINDOW_M() { return 60; }

    // A point whose nearest in-window segment is further than this many road
    // widths away is looked up over the whole route
    static get COLD_LOOKUP_WIDTHS() { return 1; }

    // Metres from the ride line beyond which a rider is off the route
    static get OFF_ROUTE_M() { return 40; }

    // Half the width of a traffic car's body (js/traffic.js builds it 2 x this wide); a lane keeps the car inside the road
    static get CAR_HALF_WIDTH() { return 0.81; }

    // Metres per progress unit of the legacy consumers
    get unitM() { return 1; }

    // Whole units the route spans, as the legacy consumers count them
    get unitCount() { return Math.floor(this.length / this.unitM); }

    toUnits(s) { return s / this.unitM; }

    fromUnits(units) { return units * this.unitM; }

    // Metres of route
    get length() { throw new Error('Route.length is not implemented'); }

    // {x, y, z, heading, width, grade, flags} at s (clamped to the route)
    sample() { throw new Error('Route.sample is not implemented'); }

    // The point at a whole unit index, or undefined past either end. The
    // object is the route's own: read it, never keep or change it.
    pointAtUnit() { throw new Error('Route.pointAtUnit is not implemented'); }

    // Continuity projection of (x, z): {s, lateral, index, along, forwardDot,
    // heading, width, distance, y}. `hint` is the previous result's `index`
    // (an object with `index`), or null for a whole-route search.
    project() { throw new Error('Route.project is not implemented'); }

    // {min, max} of the route height over [s0, s1]
    heightRange() { throw new Error('Route.heightRange is not implemented'); }

    // Roof height over the road at s, undefined outside tunnels
    ceilingAt() { return undefined; }

    get stations() { return []; }

    get stages() { return []; }

    ranges() { return []; }

    // Distance from the centre line of a traffic lane at s
    laneOffset(s) { return this.sample(s, {}).width / 4; }

    // Lateral offsets traffic takes round roadworks at s: {left, right}
    detourOffsets() { throw new Error('Route.detourOffsets is not implemented'); }

    // Junctions within `distance` ahead of s, for turn prompts
    junctionsAhead() { return []; }

    // The distance from the ride where the projection has one: past the route's ends the lateral is measured along
    // the last row's normal, and a rider who rode on past the finish along a side road stayed 290 m "on route"
    offRoute(projection) { return Math.abs(Number.isFinite(projection.distance) ? projection.distance : projection.lateral) > Route.OFF_ROUTE_M; }
}

// A route over evenly spaced samples {x, y, z, heading, width}. It holds the
// continuity projection and the contract's simple answers, and is the base the
// world route builds on; LegRoute keeps the legacy vertex picker instead.
class PolylineRoute extends Route {
    constructor(points, spacingM, options = {}) {
        super();
        this.points = points;
        this.spacingM = spacingM;
        this.stationList = options.stations || [];
        this.stageList = options.stages || [];
    }

    get length() { return Math.max(0, this.points.length - 1) * this.spacingM; }

    get stations() { return this.stationList; }

    get stages() { return this.stageList; }

    get unitM() { return this.spacingM; }

    get unitCount() { return this.points.length; }

    pointAtUnit(i) { return this.points[i]; }

    sample(s, out = {}) {
        const last = this.points.length - 1;
        const at = Math.max(0, Math.min(last, s / this.spacingM));
        const i = Math.min(last - 1, Math.floor(at));
        const t = at - i;
        const from = this.points[i];
        const to = this.points[i + 1] || from;
        out.x = from.x + (to.x - from.x) * t;
        out.y = from.y + (to.y - from.y) * t;
        out.z = from.z + (to.z - from.z) * t;
        let turn = to.heading - from.heading;
        if (turn > Math.PI) turn -= 2 * Math.PI;
        if (turn < -Math.PI) turn += 2 * Math.PI;
        out.heading = from.heading + turn * t;
        out.width = from.width + (to.width - from.width) * t;
        const run = this.spacingM;
        out.grade = (to.y - from.y) / run;
        out.flags = from.flags || 0;
        return out;
    }

    // The road `t` of the way from sample `segment` to the next, with the run (dx, dz) and the heading
    // change between them: what traffic faces and leans by. Indices past either end clamp to the last segment.
    sampleAt(segment, t, out = {}) {
        const last = this.points.length - 1;
        const index = Math.max(0, Math.min(last - 1, Math.floor(segment)));
        const from = this.points[index];
        const to = this.points[index + 1] || from;
        out.x = from.x + (to.x - from.x) * t;
        out.y = from.y + (to.y - from.y) * t;
        out.z = from.z + (to.z - from.z) * t;
        let turn = to.heading - from.heading;
        if (turn > Math.PI) turn -= 2 * Math.PI;
        if (turn < -Math.PI) turn += 2 * Math.PI;
        out.heading = from.heading + turn * t;
        out.width = from.width + (to.width - from.width) * t;
        out.dx = to.x - from.x;
        out.dz = to.z - from.z;
        out.turn = turn;
        return out;
    }

    heightRange(s0, s1) {
        const first = Math.ceil(s0 / this.spacingM);
        const last = Math.min(this.points.length - 1, Math.floor(s1 / this.spacingM));
        const ends = [this.sample(s0, {}).y, this.sample(s1, {}).y];
        let min = Math.min(...ends);
        let max = Math.max(...ends);
        for (let i = Math.max(0, first); i <= last; i++) {
            min = Math.min(min, this.points[i].y);
            max = Math.max(max, this.points[i].y);
        }
        return { min, max };
    }

    project(x, z, hint, out = {}) {
        const count = this.points.length;
        if (count < 2) {
            out.index = -1;
            return out;
        }
        const reach = Math.ceil(Route.PROJECT_WINDOW_M / this.spacingM);
        const centre = hint && hint.index >= 0 ? Math.min(hint.index, count - 2) : 0;
        const from = hint ? Math.max(0, centre - reach) : 0;
        const to = hint ? Math.min(count - 2, centre + reach) : count - 2;
        this.nearestSegment(x, z, from, to, out);
        if (hint && out.distance > Route.COLD_LOOKUP_WIDTHS * this.points[out.index].width) {
            this.nearestSegment(x, z, 0, count - 2, out);
        }
        // The rider's yaw against the route direction; 0 when the caller gave none
        out.forwardDot = hint && hint.heading !== undefined ? Math.cos(hint.heading - out.heading) : 0;
        return out;
    }

    // Nearest point on segments [from, to] (segment i joins samples i, i+1)
    nearestSegment(x, z, from, to, out) {
        let best = Infinity;
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
                out.index = i;
                out.along = t;
            }
        }
        const a = this.points[out.index];
        const b = this.points[out.index + 1];
        const t = out.along;
        const heading = a.heading + (b.heading - a.heading) * t;
        out.x = a.x + (b.x - a.x) * t;
        out.z = a.z + (b.z - a.z) * t;
        out.y = a.y + (b.y - a.y) * t;
        out.heading = heading;
        out.width = a.width + (b.width - a.width) * t;
        out.s = (out.index + t) * this.spacingM;
        out.lateral = (x - out.x) * Math.cos(heading) - (z - out.z) * Math.sin(heading);
        out.distance = Math.sqrt(best);
        return out;
    }
}

// The Ground interface: what the physics and the scenery ask of the land
// round the road. LegGround (js/world/legroute.js) answers from the terrain
// model of a leg; the world answers from its height tiles. No THREE and no DOM.
//
// A `hint` is the window the answer is searched in: {start, end}, the
// vehicle's segment search range on a leg. A `loc` is a located point
// (index, lateral, roadY, along), filled by locate() and groundY() so that a
// caller needing the side or the road height does not search twice.
class Ground {
    // Height of the ground at (x, z). `exact` asks for the drawn mesh height
    // rather than the coarse model; `loc` receives the located point.
    groundY() { throw new Error('Ground.groundY is not implemented'); }

    // Ground height at an already located point
    heightAt() { throw new Error('Ground.heightAt is not implemented'); }

    // What the ground is at loc.lateral: {kind, side, sign, start}
    zoneAt() { throw new Error('Ground.zoneAt is not implemented'); }

    // Height at which something dropped beside the road comes to rest
    restY() { throw new Error('Ground.restY is not implemented'); }

    // The side of the road at loc, `sign` -1 left or 1 right
    sideAt() { throw new Error('Ground.sideAt is not implemented'); }

    // Water surface height at loc, null on a dry road
    waterLevel() { throw new Error('Ground.waterLevel is not implemented'); }

    // Where (x, z) lies against the road
    locate() { throw new Error('Ground.locate is not implemented'); }

    // Half the road width at loc
    halfRoad() { throw new Error('Ground.halfRoad is not implemented'); }
}
