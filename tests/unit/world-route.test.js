// The route contract (js/world/route.js), its leg adapter (legroute.js) and the
// Ground seam (route.js, legroute.js): the contract's own answers, LegRoute and LegGround
// against the code they replaced, and the grep guards that keep a leg's road
// path and the old progress hint from leaking back into the shared code.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { loadGame, buildEnvironment, legs } from '../helpers/load-game.js';
import { ladder } from '../fixtures/world/stacked-ladder.js';
import { samplesOf, straight } from '../helpers/world-synthetic.js';

const game = loadGame();
const { Route, PolylineRoute, LegRoute, Ground, LegGround, Terrain, WorldRoute } = game;
const root = new URL('../../', import.meta.url);

describe('the route contract', () => {
    test('an unimplemented route says so rather than answering', () => {
        const route = new Route();
        expect(() => route.length).toThrow('not implemented');
        expect(() => route.sample(0)).toThrow('not implemented');
        expect(() => route.project(0, 0, null)).toThrow('not implemented');
        expect(() => route.heightRange(0, 1)).toThrow('not implemented');
        expect(() => route.detourOffsets(0)).toThrow('not implemented');
    });

    test('the optional answers default to none', () => {
        const route = new Route();
        expect(route.ceilingAt(0)).toBeUndefined();
        expect(route.stations).toEqual([]);
        expect(route.stages).toEqual([]);
        expect(route.ranges('tunnel')).toEqual([]);
        expect(route.junctionsAhead(0, 100)).toEqual([]);
        expect(route.toUnits(100)).toBe(100);
    });

    test('the constants of the projection are named', () => {
        expect(Route.PROJECT_WINDOW_M).toBe(60);
        expect(Route.COLD_LOOKUP_WIDTHS).toBe(1);
        expect(Route.OFF_ROUTE_M).toBe(40);
    });

    describe('PolylineRoute over a ladder', () => {
        const points = ladder();
        const route = new PolylineRoute(points, 4);

        test('length, units and samples follow the points', () => {
            expect(route.length).toBeCloseTo((points.length - 1) * 4, 9);
            expect(route.unitM).toBe(4);
            expect(route.unitCount).toBe(points.length);
            expect(route.toUnits(40)).toBe(10);
            expect(route.fromUnits(10)).toBe(40);
            const at = route.sample(4 * 3, {});
            expect(at.x).toBeCloseTo(points[3].x, 9);
            expect(at.z).toBeCloseTo(points[3].z, 9);
            const half = route.sample(4 * 3 + 2, {});
            expect(half.x).toBeCloseTo((points[3].x + points[4].x) / 2, 9);
            expect(half.y).toBeCloseTo((points[3].y + points[4].y) / 2, 9);
            expect(route.sample(-5, {}).x).toBe(points[0].x);
            expect(route.sample(route.length + 50, {}).x).toBeCloseTo(points[points.length - 1].x, 9);
        });

        test('heightRange covers the vertices in range and both ends', () => {
            const { min, max } = route.heightRange(5, 21);
            expect(min).toBeCloseTo(route.sample(5, {}).y, 9);
            expect(max).toBeCloseTo(route.sample(21, {}).y, 9);
            const whole = route.heightRange(0, route.length);
            expect(whole.min).toBe(points[0].y);
            expect(whole.max).toBe(points[points.length - 1].y);
        });

        test('traffic keeps to a quarter of the width, and a point past 40 m is off the route', () => {
            expect(route.laneOffset(10)).toBe(2.5);
            expect(route.offRoute({ lateral: 39 })).toBe(false);
            expect(route.offRoute({ lateral: -41 })).toBe(true);
        });

        test('a projection reports the signed lateral, the heading and the rider alignment', () => {
            const on = route.sample(20, {});
            const out = route.project(on.x + Math.cos(on.heading) * 2, on.z - Math.sin(on.heading) * 2, { index: 4, heading: on.heading }, {});
            expect(out.s).toBeCloseTo(20, 6);
            expect(out.lateral).toBeCloseTo(2, 6);
            expect(out.forwardDot).toBeCloseTo(1, 9);
            const back = route.project(on.x, on.z, { index: 4, heading: on.heading + Math.PI }, {});
            expect(back.forwardDot).toBeCloseTo(-1, 9);
            expect(route.project(on.x, on.z, { index: 4 }, {}).forwardDot).toBe(0);
        });

        test('a point far from every segment in the window is found over the whole route', () => {
            const far = route.sample(route.length - 6, {});
            const out = route.project(far.x, far.z, { index: 1 }, {});
            expect(out.s).toBeCloseTo(route.length - 6, 6);
        });
    });
});

describe('LegRoute against the road path it reads', () => {
    const built = legs(game).map((leg, index) => buildEnvironment(game, index).env);
    const env = built[0];
    const path = env.roadPath;

    test('every environment carries a route and a ground over itself', () => {
        built.forEach(each => {
            expect(each.route).toBeInstanceOf(LegRoute);
            expect(each.ground).toBeInstanceOf(LegGround);
            expect(each.route.unitCount).toBe(each.roadPath.length);
            expect(each.route.unitM).toBe(20);
            expect(each.route.length).toBe((each.roadPath.length - 1) * 20);
        });
    });

    test('a vertex answers with its own values, and clamps past the ends', () => {
        [0, 17, path.length - 1].forEach(i => {
            const out = env.route.sample(i * 20, {});
            expect([out.x, out.y, out.z, out.heading]).toEqual([path[i].x, path[i].y, path[i].z, path[i].heading]);
            expect(out.width).toBe(env.roadWidth);
        });
        expect(env.route.sample(-100, {}).x).toBe(path[0].x);
        expect(env.route.sample(1e9, {}).z).toBe(path[path.length - 1].z);
    });

    test('sampleAt is the lerp traffic used, wraps round the path, and reports the run and turn', () => {
        const total = path.length;
        const out = env.route.sampleAt(10, 0.25, {});
        expect(out.x).toBe(path[10].x + (path[11].x - path[10].x) * 0.25);
        expect(out.dx).toBe(path[11].x - path[10].x);
        expect(out.dz).toBe(path[11].z - path[10].z);
        expect(env.route.sampleAt(10 + total, 0.25, {}).x).toBe(out.x);
        expect(env.route.sampleAt(10 - total, 0.25, {}).x).toBe(out.x);
        const end = env.route.sampleAt(total - 1, 0.5, {});
        expect(end.x).toBe(path[total - 1].x + (path[0].x - path[total - 1].x) * 0.5);
    });

    test('project is the nearest vertex within 10 of the hint, or over the whole road without one', () => {
        const probe = { x: path[300].x + 7, z: path[300].z - 4 };
        const windowed = env.route.project(probe.x, probe.z, { index: 295 }, {});
        let best = -1;
        let bestDistance = Infinity;
        for (let i = 285; i <= 305; i++) {
            const d = Math.sqrt(Math.pow(probe.x - path[i].x, 2) + Math.pow(probe.z - path[i].z, 2));
            if (d < bestDistance) {
                bestDistance = d;
                best = i;
            }
        }
        expect(windowed.index).toBe(best);
        expect(windowed.s).toBe(best * 20);
        expect(windowed.distance).toBe(bestDistance);
        const perpX = Math.cos(path[best].heading);
        const perpZ = -Math.sin(path[best].heading);
        expect(windowed.lateral).toBe((probe.x - path[best].x) * perpX + (probe.z - path[best].z) * perpZ);
        // A hint far from the point misses it: a wrong pick sticks, which is why the road keeps the picker windowed
        expect(env.route.project(probe.x, probe.z, { index: 100 }, {}).index).not.toBe(best);
        expect(env.route.project(probe.x, probe.z, null, {}).index).toBe(300);
        expect(env.route.project(0, 0, null, {}, 10).index).toBeGreaterThanOrEqual(0);
    });

    test('an empty road projects nowhere', () => {
        const empty = new LegRoute({ roadPath: [], roadWidth: 12 });
        expect(empty.project(0, 0, null, {}).index).toBe(-1);
        expect(empty.unitCount).toBe(0);
        expect(empty.length).toBe(0);
        expect(empty.heightRange(0, 100)).toEqual({ min: 0, max: 0 });
    });

    test('heightRange is the lowest and highest road y over the vertices, as the atmosphere read them', () => {
        const range = env.route.heightRange(40 * 20, 90 * 20);
        const ys = path.slice(40, 91).map(point => point.y || 0);
        expect(range).toEqual({ min: Math.min(...ys), max: Math.max(...ys) });
        expect(env.route.heightRange(-100, 2).min).toBeLessThanOrEqual(path[0].y);
        const between = env.route.heightRange(25, 35);
        expect(between.min).toBeCloseTo(Math.min(env.route.sample(25, {}).y, env.route.sample(35, {}).y), 9);
    });

    test('the roof comes from the terrain profile of a leg with set pieces, and nowhere else', () => {
        const tunnelled = built.find(each => each.setPieces && each.setPieces.length);
        expect(tunnelled).toBeDefined();
        const piece = tunnelled.setPieces[0];
        const index = Math.floor((piece.from + piece.to) / 2);
        const direct = Terrain.ceilingAt(tunnelled.terrain, index);
        expect(tunnelled.route.ceilingAt(index * 20)).toBe(direct);
        const open = built.find(each => !each.setPieces || !each.setPieces.length);
        expect(open.route.ceilingAt(300 * 20)).toBeUndefined();
    });

    test('traffic keeps to 3 m of the centre line and the legs never go off route', () => {
        expect(env.route.laneOffset(0)).toBe(3);
        expect(env.route.detourOffsets(0)).toEqual({ left: -2.2, right: 5 });
        expect(env.route.offRoute({ lateral: 400 })).toBe(false);
    });
});

describe('LegGround against the Terrain calls it wraps', () => {
    const { env } = buildEnvironment(game, 1);
    const path = env.roadPath;

    test('groundY, locate, zoneAt, sideAt and heightAt answer as Terrain does', () => {
        [120, 300, 450].forEach(index => {
            const point = path[index];
            const x = point.x + Math.cos(point.heading) * 14;
            const z = point.z - Math.sin(point.heading) * 14;
            const range = { start: index - 10, end: index + 10 };
            const viaGround = {};
            const viaTerrain = {};
            const ground = env.ground.groundY(x, z, range, false, viaGround);
            expect(ground).toBe(Terrain.groundY(env.terrain, env.terrainGeometry, x, z, range.start, range.end, false, viaTerrain));
            expect(viaGround).toEqual(viaTerrain);
            expect(env.ground.locate(x, z, range, {})).toEqual(viaTerrain);
            expect(env.ground.heightAt(viaGround, true)).toBe(Terrain.heightAt(env.terrain, env.terrainGeometry, viaTerrain, true));
            expect(env.ground.zoneAt(viaGround, env.ground.halfRoad(viaGround))).toEqual(Terrain.zoneAt(env.terrain, viaTerrain.index, viaTerrain.lateral, env.roadWidth / 2));
            expect(env.ground.sideAt(viaGround, 1)).toBe(Terrain.sideAt(env.terrain, 1, viaTerrain.index));
            expect(env.ground.waterLevel(viaGround)).toBe(Terrain.waterLevel(env.terrain, viaTerrain.roadY));
        });
    });

    test('restY picks the side of the located lateral', () => {
        const unit = { index: 200, lateral: -9, roadY: path[200].y };
        const side = Terrain.sideAt(env.terrain, -1, 200);
        let expected;
        let thrown;
        try {
            expected = Terrain.restY(env.terrain, side, unit.roadY);
        } catch (error) {
            thrown = error.message;
        }
        if (thrown) expect(() => env.ground.restY(unit)).toThrow(thrown);
        else expect(env.ground.restY(unit)).toBe(expected);
    });

    test('a bare Ground answers nothing', () => {
        expect(() => new Ground().groundY()).toThrow('not implemented');
        expect(() => new Ground().locate()).toThrow('not implemented');
    });
});

describe('grep guards', () => {
    const files = dir => readdirSync(new URL(dir, root)).flatMap(name => {
        const path = `${dir}${name}`;
        return statSync(new URL(path, root)).isDirectory() ? files(`${path}/`) : [path];
    });
    const matching = (list, pattern, allowed) => list
        .filter(file => !allowed.includes(file))
        .filter(file => file.endsWith('.js') && pattern.test(readFileSync(new URL(file, root), 'utf8')));

    test('no shared code reads the leg road path', () => {
        const allowed = ['js/world/legroute.js', 'js/environment.js', 'js/sceneassets.js'];
        expect(matching([...files('js/'), ...files('tools/').filter(file => !/terrain-check|village-shots|capture-baseline/.test(file))], /roadPath/, allowed)).toEqual([]);
        // Planted positive: the pattern does see a reader
        expect(/roadPath/.test('const p = env.roadPath[0];')).toBe(true);
    });

    test('the projection hint is read only by the vehicle', () => {
        expect(matching([...files('js/'), 'tools/autopilot.js'], /currentRoadSegment/, ['js/vehicle.js'])).toEqual([]);
        expect(/currentRoadSegment/.test('track.sample(vehicle.currentRoadSegment)')).toBe(true);
    });

    test('Terrain is called only through the ground by the vehicle, traffic, cones, rockfalls and main', () => {
        const calls = /Terrain\.(groundY|zoneAt|heightAt|surfaceAt|locate|sideAt|restY|waterLevel|ceilingAt)\(/;
        expect(matching(['js/vehicle.js', 'js/traffic.js', 'js/cones.js', 'js/rockfalls.js', 'js/main.js', 'js/atmosphere.js', 'js/tours.js'], calls, [])).toEqual([]);
    });
});

describe('world traffic lanes', () => {
    test.each([4, 6, 8, 10, 12, 14, 20])('on a %s m road the car stays 0.2 m inside the edge, out at 0.42 of the width where that fits', (width) => {
        const route = new WorldRoute(samplesOf(straight(200, { width })), {});
        const lane = route.laneOffset(50);
        expect(lane).toBeGreaterThanOrEqual(0);
        expect(lane + Route.CAR_HALF_WIDTH).toBeLessThanOrEqual(width / 2 - WorldRoute.LANE_EDGE_MARGIN_M + 1e-6);
        expect(lane).toBeCloseTo(Math.min(width * 0.42, width / 2 - Route.CAR_HALF_WIDTH - WorldRoute.LANE_EDGE_MARGIN_M), 5);
    });

    test('the car traffic builds is the width the lanes allow for', () => {
        const source = readFileSync(new URL('js/traffic.js', root), 'utf8');
        expect(source).toMatch(/depth: Route\.CAR_HALF_WIDTH \* 2/);
        expect(Route.CAR_HALF_WIDTH * 2).toBe(1.62);
    });
});
