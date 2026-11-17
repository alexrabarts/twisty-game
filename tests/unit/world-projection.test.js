// The continuity projection (A5): a rider walking a switchback ladder never
// jumps to the parallel leg, and the nearest-vertex picker the legs use does.
import { loadGame } from '../helpers/load-game.js';
import { ladder } from '../fixtures/world/stacked-ladder.js';

const { PolylineRoute, LegRoute } = loadGame();

const STEP = 0.5;

// Walk the route in STEP metre steps, `lateral(k)` metres off its centre line
// (along the normal of the chord the step stands on), asking `project` for
// each position. Returns the projected s of every step.
function walk(route, points, project, lateral) {
    const spacing = route.unitM;
    const out = {};
    const hint = { index: 0 };
    const found = [];
    for (let k = 0; k * STEP <= route.length; k++) {
        const at = (k * STEP) / spacing;
        const i = Math.min(points.length - 2, Math.floor(at));
        const a = points[i];
        const b = points[i + 1];
        const run = Math.hypot(b.x - a.x, b.z - a.z);
        const t = at - i;
        const x = a.x + (b.x - a.x) * t + ((b.z - a.z) / run) * lateral(k);
        const z = a.z + (b.z - a.z) * t - ((b.x - a.x) / run) * lateral(k);
        project(x, z, hint, out);
        hint.index = out.index;
        found.push(out.s);
    }
    return found;
}

const steps = found => found.slice(1).map((s, k) => s - found[k]);
const wobble = k => 0.4 * Math.sin(k * 0.37);

describe('the continuity projection on a switchback ladder', () => {
    const points = ladder({ separation: 25, spacing: 1 });
    const route = new PolylineRoute(points, 1);

    test('s rises by half a metre a step, with no step over 2 m, all the way up the ladder', () => {
        const found = walk(route, points, (x, z, hint, out) => route.project(x, z, hint, out), wobble);
        const rises = steps(found);
        expect(rises.length).toBeGreaterThan(400);
        rises.forEach(rise => {
            expect(rise).toBeGreaterThan(STEP - 0.05);
            expect(rise).toBeLessThan(STEP + 0.05);
        });
        expect(Math.max(...rises)).toBeLessThan(2);
    });

    test('the nearest-vertex picker of the legs fails the same walk', () => {
        // The same ladder as a 20 m vertex road path, read through LegRoute
        const sparse = ladder({ separation: 25, spacing: 20 });
        const legRoute = new LegRoute({ roadPath: sparse, roadWidth: 10 });
        const found = walk(legRoute, sparse, (x, z, hint, out) => legRoute.project(x, z, hint, out), wobble);
        const rises = steps(found);
        expect(Math.max(...rises)).toBeGreaterThan(2);
    });

    test('a rider between two stacked legs stays on the leg it was on', () => {
        const tight = new PolylineRoute(ladder({ separation: 14, legLength: 120 }), 4);
        const on = tight.sample(60, {});
        // 9 m toward the neighbouring leg: 5 m from it, 9 m from the rider's own line
        const x = on.x + Math.cos(on.heading) * 9;
        const z = on.z - Math.sin(on.heading) * 9;
        const hint = { index: Math.floor(60 / 4) };
        const sticky = tight.project(x, z, hint, {});
        expect(sticky.s).toBeCloseTo(60, 0);
        expect(sticky.lateral).toBeCloseTo(9, 1);
        const whole = tight.project(x, z, null, {});
        expect(whole.distance).toBeLessThan(sticky.distance);
        expect(Math.abs(whole.s - 60)).toBeGreaterThan(40);
    });

    test('a point further than a road width from the window is looked up over the whole route', () => {
        const on = route.sample(36, {});
        // 12 m beside leg one, no segment of the window within a road width
        const x = on.x + Math.cos(on.heading) * 12;
        const z = on.z - Math.sin(on.heading) * 12;
        // A hint on the far side of the ladder, so the window holds nothing near the point
        const found = route.project(x, z, { index: 200 }, {});
        const whole = route.project(x, z, null, {});
        expect(found.s).toBe(whole.s);
        expect(found.distance).toBe(whole.distance);
    });
});
