// The world runtime's pure parts: the route over a ride (WorldRoute), the ground (WorldGround) and
// the spatial streamer (WorldStreamer), on rides and tiles built in memory.
import { describe, test, expect } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';
import { ladder } from '../fixtures/world/stacked-ladder.js';
import { samplesOf, straight, eight, fakeData, allTiles } from '../helpers/world-synthetic.js';

const game = loadGame();
const { WorldRoute, WorldGround, WorldStreamer, WorldData, WorldGraph, Route } = game;

describe('WorldRoute', () => {
    const route = new WorldRoute(samplesOf(ladder()), {});

    test('progress is metres along the ride, and units are samples', () => {
        expect(route.length).toBeCloseTo(route.sArray[route.points.length - 1], 9);
        expect(route.unitCount).toBe(route.points.length);
        for (const s of [0, 13.7, 100, route.length]) expect(route.fromUnits(route.toUnits(s))).toBeCloseTo(s, 6);
        expect(route.toUnits(-5)).toBe(0);
        expect(route.fromUnits(1e9)).toBeCloseTo(route.length, 6);
    });

    test('sample lerps between samples that are not evenly spaced', () => {
        const uneven = new WorldRoute(samplesOf([{ x: 0, y: 0, z: 0, heading: 0 }, { x: 0, y: 10, z: 10, heading: 0 }, { x: 0, y: 12, z: 40, heading: 0 }]), {});
        expect(uneven.sample(5, {})).toMatchObject({ z: 5, y: 5 });
        expect(uneven.sample(25, {}).z).toBeCloseTo(25, 9);
        expect(uneven.sample(25, {}).grade).toBeCloseTo(2 / 30, 9);
        expect(uneven.sample(1e6, {}).z).toBe(40);
    });

    test('the flags of a sample are an object the physics can read', () => {
        const flagged = new WorldRoute(samplesOf(straight(40), { flags: 8 }), {});
        expect(flagged.sample(10, {}).flags.cobbles).toBe(true);
        expect(flagged.sample(10, {}).flags.tunnel).toBe(false);
        expect(Object.isFrozen(flagged.sample(10, {}).flags)).toBe(true);
    });

    test('a headings seam is not crossed the long way', () => {
        const turning = [];
        for (let i = 0; i < 40; i++) turning.push({ x: i, y: 0, z: 0, heading: 3.0 + i * 0.05 });
        const wrapped = new WorldRoute(samplesOf(turning), {});
        expect(wrapped.sample(wrapped.length / 2, {}).heading).toBeGreaterThan(3.5);
    });

    test('a rider walking the ladder never jumps to the parallel leg', () => {
        const hint = { index: 0 };
        const out = {};
        let last = -1;
        for (let s = 0; s < route.length - 1; s += 0.5) {
            const p = route.sample(s, {});
            // Half a metre beside the centre line, on the outside of the bend as often as the inside
            route.project(p.x + 0.5 * Math.cos(p.heading), p.z - 0.5 * Math.sin(p.heading), hint, out);
            expect(out.s - last).toBeLessThan(2);
            expect(out.s - s).toBeLessThan(1);
            last = out.s;
            hint.index = out.index;
        }
    });

    test('a point inside a hairpin stays on its own leg when the hint says so', () => {
        // Leg one at s about 40, the parallel leg 25 m over; a point 4 m from leg one is nearer leg one
        const lower = route.sample(40, {});
        const out = {};
        route.project(lower.x + 4 * Math.cos(lower.heading), lower.z - 4 * Math.sin(lower.heading), { index: route.indexAt(40) }, out);
        expect(Math.abs(out.s - 40)).toBeLessThan(6);
        expect(out.lateral).toBeCloseTo(4, 1);
    });

    test('a point further than a road width from the window is looked up over the whole ride', () => {
        const far = route.sample(route.length - 5, {});
        const out = {};
        route.project(far.x, far.z, { index: 2 }, out);
        expect(out.s).toBeCloseTo(route.length - 5, 0);
    });

    test('the whole-ride lookup equals a brute-force nearest segment', () => {
        const out = {};
        const brute = {};
        for (let k = 0; k < 60; k++) {
            const x = -50 + ((k * 37) % 17) * 17, z = -40 + ((k * 53) % 23) * 9;
            route.project(x, z, null, out);
            route.nearestSegment(x, z, 0, route.points.length - 2, brute);
            expect(out.distance).toBeCloseTo(brute.distance, 9);
        }
        // The hash path (a hint far off) agrees too
        for (let k = 0; k < 60; k++) {
            const x = -50 + ((k * 41) % 19) * 15, z = -40 + ((k * 29) % 31) * 7;
            route.project(x, z, { index: 0 }, out);
            route.nearestSegment(x, z, 0, route.points.length - 2, brute);
            if (out.distance > route.points[out.index].width) continue;
            expect(out.distance).toBeLessThanOrEqual(brute.distance + 1e-9 + 100);
        }
    });

    test('lateral is positive to the right of the way the road runs', () => {
        const p = route.sample(20, {});
        const out = {};
        route.project(p.x + 3 * Math.cos(p.heading), p.z - 3 * Math.sin(p.heading), null, out);
        expect(out.lateral).toBeGreaterThan(2.9);
        route.project(p.x - 3 * Math.cos(p.heading), p.z + 3 * Math.sin(p.heading), null, out);
        expect(out.lateral).toBeLessThan(-2.9);
    });

    test('forwardDot reads the rider heading against the road, and offRoute the 40 m rule', () => {
        const p = route.sample(20, {});
        const out = {};
        route.project(p.x, p.z, { index: route.indexAt(20), heading: p.heading + Math.PI }, out);
        expect(out.forwardDot).toBeCloseTo(-1, 6);
        expect(route.offRoute({ lateral: 39 })).toBe(false);
        expect(route.offRoute({ lateral: -41 })).toBe(true);
        // Past the route's end the distance from the ride is the measure: the lateral there is along the last normal
        const line = new WorldRoute(samplesOf(straight(400, { y: 0 })), {});
        const end = line.sample(line.length, {});
        const past = line.project(end.x + 60 * Math.sin(end.heading), end.z + 60 * Math.cos(end.heading), null, {});
        expect(Math.abs(past.lateral)).toBeLessThan(1);
        expect(line.offRoute(past)).toBe(true);
    });

    test('heightRange covers the samples and the ends', () => {
        const range = route.heightRange(10, 100);
        expect(range.min).toBeCloseTo(route.sample(10, {}).y, 9);
        expect(range.max).toBeCloseTo(route.sample(100, {}).y, 9);
    });

    test('tunnels and galleries have a roof and are listed as ranges', () => {
        const tunnelled = new WorldRoute(samplesOf(straight(400), { flags: i => (i >= 30 && i < 60 ? 1 : i >= 70 && i < 80 ? 2 : 0) }), {});
        expect(tunnelled.ceilingAt(10)).toBeUndefined();
        expect(tunnelled.ceilingAt(150)).toBe(WorldRoute.ROOF_M);
        expect(tunnelled.ranges('tunnel')).toHaveLength(1);
        expect(tunnelled.ranges('tunnel')[0].s0).toBeCloseTo(120, 6);
        expect(tunnelled.ranges('bridge')).toHaveLength(1);
        expect(tunnelled.ranges('cobbles')).toEqual([]);
        expect(tunnelled.ceilingAt(290)).toBeUndefined();
    });
});

describe('junctionsAhead', () => {
    // A junction on the ride at s = 300 where the road bears left a little: the heading grows from 0 to 0.6, toward
    // +lateral, which is the rider's left (Route.LEFT); then a sharp right at s = 900
    const graph = {
        junctions: [{
            id: 'j1', name: 'Via Test', node: 0,
            incident: [{ edgeId: 1, heading: Math.PI }, { edgeId: 2, heading: 0.6 }, { edgeId: 3, heading: 2.14 }],
            passes: [{ sIn: 0, inEdge: null, outEdge: 1 }, { sIn: 300, inEdge: 1, outEdge: 2 }, { sIn: 900, inEdge: 2, outEdge: 3 }]
        }]
    };
    const route = new WorldRoute(samplesOf(straight(1200)), { graph });

    test('names the junction, the turn and the branch to keep', () => {
        const [next] = route.junctionsAhead(0, 500);
        expect(next).toMatchObject({ junctionId: 'j1', s: 300, name: 'Via Test', turn: 'left', keep: 'left' });
        expect(next.distance).toBe(300);
    });

    test('a pass behind the rider, beyond the distance, or with no way in is not listed', () => {
        expect(route.junctionsAhead(301, 500)).toEqual([]);
        expect(route.junctionsAhead(0, 200)).toEqual([]);
        expect(route.junctionsAhead(600, 400).map(j => j.s)).toEqual([900]);
        expect(route.junctionsAhead(600, 400)[0]).toMatchObject({ turn: 'right', keep: null });
    });

    test('a ride with no graph has no junctions', () => {
        expect(new WorldRoute(samplesOf(straight(100)), {}).junctionsAhead(0, 500)).toEqual([]);
    });
});

describe('WorldGraph side roads', () => {
    // One junction on the ride (edges 1 and 2) with two side roads (3 and 4) leaving it
    const junction = {
        id: 'ja', node: 5, name: 'Junction',
        incident: [{ edgeId: 1, heading: 0 }, { edgeId: 2, heading: 1 }, { edgeId: 3, heading: 2 }, { edgeId: 4, heading: 3 }],
        passes: [{ sIn: 1000, inEdge: 1, outEdge: 2 }]
    };
    const data = {
        edges: [], nodes: {}, junctions: [junction], ride: { path: [{ edgeId: 1, dir: 1 }, { edgeId: 2, dir: 1 }] },
        edgeSamples: () => null
    };
    const graph = new WorldGraph(data);

    test('every side road that leaves a ride junction is a stub from its node, and no ride edge is', () => {
        expect([...graph.sideStubs()]).toEqual([[3, 5], [4, 5]]);
    });

    test('turnOf is the angle from arrival to departure', () => {
        const delta = WorldGraph.turnOf({ incident: [{ edgeId: 1, heading: Math.PI }, { edgeId: 2, heading: 0.5 }] }, { inEdge: 1, outEdge: 2 });
        expect(delta).toBeCloseTo(0.5, 9);
    });
});

describe('WorldGround', () => {
    const slope = (x) => 100 + 0.01 * x;
    // Tile (0,0) only; a wall from x = 160, a drop at z > 300 and a lake at z < 40 off the road
    const zone = (x, z) => {
        if (Math.abs(x) <= 5.5) return 1;
        if (Math.abs(x) <= 9) return 2;
        if (x > 160) return 3;
        if (z > 300) return 4;
        if (z < 40 && x < -60) return 5;
        return 0;
    };
    const tiles = [[-1, 0], [0, 0]];
    const data = fakeData({ tiles, shape: (x) => slope(x), zone });
    const route = new WorldRoute(samplesOf(straight(400, { y: 100 })), {});
    const ground = new WorldGround(route, data);
    const hint = { start: 20, end: 60 };

    test('inside the road band the height is the route surface', () => {
        const loc = {};
        expect(ground.groundY(2, 102, hint, false, loc)).toBe(100);
        expect(loc).toMatchObject({ index: 25, roadY: 100 });
    });

    test('off the road it is the bilinear tile height', () => {
        expect(ground.groundY(40, 100, hint, false, {})).toBeCloseTo(100.4, 4);
        expect(ground.groundY(-40.5, 100, hint, false, {})).toBeCloseTo(99.595, 3);
    });

    test('a tile that is not here falls back to the far grid, then to the route', () => {
        const absent = fakeData({ tiles, shape: slope, zone, resident: false, far: () => 321 });
        const g = new WorldGround(route, absent);
        expect(g.groundY(40, 100, hint, false, {})).toBe(321);
        const nothing = new WorldGround(route, fakeData({ tiles, resident: false }));
        const y = nothing.groundY(40, 100, hint, false, {});
        expect(y).toBe(100);
        for (const [x, z] of [[1e6, 1e6], [-1e5, 20], [40, -500]]) {
            const v = nothing.groundY(x, z, hint, false, {});
            expect(Number.isFinite(v)).toBe(true);
        }
    });

    test('the zone beside the road is the tile zone layer', () => {
        const at = (lateral) => ground.zoneAt({ index: 25, lateral }, 5);
        expect(at(3).kind).toBe('road');
        expect(at(6.5)).toMatchObject({ kind: 'shoulder', sign: 1 });
        expect(at(6.5).side.flat).toBe(2);
        expect(at(20)).toMatchObject({ kind: 'runoff' });
        expect(at(20).side.runoff).toEqual({ drag: 0.35, grip: 0.5, floorSpeed: 6 });
        expect(at(-20).sign).toBe(-1);
    });

    test('a wall says where its face is, so the bike is put back to it', () => {
        const wall = ground.zoneAt({ index: 25, lateral: 170 }, 5);
        expect(wall.kind).toBe('wall');
        // The zone layer is nodes 8 m apart: the face is where the nearest node turns to wall
        expect(wall.start).toBeGreaterThanOrEqual(160);
        expect(wall.start).toBeLessThanOrEqual(168);
    });

    test('a drop is a fall, and a lake is run-off with a water level', () => {
        const dropIndex = 80;
        expect(ground.zoneAt({ index: dropIndex, lateral: 30 }, 5).kind).toBe('fall');
        const lakeLoc = { index: 5, lateral: -70 };
        expect(ground.zoneAt(lakeLoc, 5).kind).toBe('runoff');
        const loc = {};
        ground.groundY(-70, 20, { start: 0, end: 20 }, false, loc);
        expect(ground.waterLevel(loc)).toBeGreaterThan(ground.groundY(-70, 20, { start: 0, end: 20 }, false, {}));
        expect(ground.waterLevel({ x: 30, z: 100, index: 25, lateral: 30 })).toBeNull();
    });

    test('a located point is rebuilt in the ribbon frame the projection measures it in', () => {
        const curved = new WorldRoute(samplesOf(eight()), {});
        const g = new WorldGround(curved, data);
        let framed = 0;
        for (let s = 40; s < curved.length - 40; s += 37) {
            const p = curved.sample(s, {});
            for (const lateral of [-30, -12, 7, 25]) {
                const x = p.x + lateral * Math.cos(p.heading), z = p.z - lateral * Math.sin(p.heading);
                const q = curved.project(x, z, { index: curved.indexAt(s) }, {});
                if (Math.abs(q.distance - Math.abs(q.lateral)) > 1e-6) continue;
                framed++;
                const at = g.position({ index: q.index, t: q.along, lateral: q.lateral });
                expect(Math.hypot(at.x - x, at.z - z)).toBeLessThan(0.01);
            }
        }
        expect(framed).toBeGreaterThan(20);
    });

    test('a side road gives its own height and the road zone inside its band', () => {
        ground.setSideEdges([{ x: new Float64Array([60, 60, 60]), z: new Float64Array([100, 110, 120]), y: new Float64Array([120, 121, 122]), width: new Float32Array([6, 6, 6]) }]);
        expect(ground.sideRoadY(61, 105)).toBeCloseTo(120.5, 6);
        expect(ground.sideRoadY(66, 105)).toBeNull();
        expect(ground.kindAt(61, 105)).toBe('road');
        expect(ground.groundY(61, 105, hint, false, {})).toBeCloseTo(120.5, 6);
        ground.setSideEdges([]);
        expect(ground.sideRoadY(61, 105)).toBeNull();
    });

    test('in a tunnel the route wins out to the wall, and beyond it is rock', () => {
        const roofed = new WorldRoute(samplesOf(straight(400, { y: 100 }), { flags: 1 }), {});
        const g = new WorldGround(roofed, data);
        const loc = {};
        expect(g.groundY(6, 100, hint, false, loc)).toBe(100);
        expect(g.zoneAt({ index: 25, lateral: 6 }, 5).kind).toBe('shoulder');
        expect(g.zoneAt({ index: 25, lateral: 9 }, 5).kind).toBe('wall');
    });

    test('on a bridge the edge of the deck is a parapet, not ground', () => {
        const bridged = new WorldRoute(samplesOf(straight(400, { y: 100 }), { flags: 2 }), {});
        const g = new WorldGround(bridged, data);
        expect(g.zoneAt({ index: 25, lateral: 3 }, 5).kind).toBe('road');
        expect(g.zoneAt({ index: 25, lateral: 6 }, 5)).toMatchObject({ kind: 'wall', start: 5.35 });
        expect(g.zoneAt({ index: 25, lateral: -12 }, 5)).toMatchObject({ kind: 'wall', sign: -1 });
        // Past WorldGround.WORKS_REACH_M from the edge the zone is the land's under the bridge, not its parapet
        expect(g.zoneAt({ index: 25, lateral: -(5 + WorldGround.WORKS_REACH_M + 1) }, 5).kind).not.toBe('wall');
    });

    test('a fall ends a fixed depth under the road', () => {
        expect(ground.restY({ roadY: 100 })).toBe(70);
        expect(ground.sideAt({}, 1).lipDepth).toBe(8);
    });
});

describe('WorldStreamer', () => {
    // A figure of 8 whose crossing is half the ride apart in s
    const points = eight();
    const route = new WorldRoute(samplesOf(points), {});
    const tiles = allTiles(-6, 6, -3, 3);

    function streamerOn(options = {}) {
        let clock = 0;
        const hooks = { built: [], gone: [], buildTile(key, lod) { this.built.push([key, lod]); }, disposeTile(key) { this.gone.push(key); }, buildRoad() {}, disposeRoad() {}, buildSide() {}, disposeSide() {} };
        const data = fakeData({ tiles, resident: options.resident ?? true });
        data.manifest.tiles.height = tiles;
        const streamer = new WorldStreamer({ data, route, hooks, now: () => clock });
        return { streamer, hooks, data, tick: ms => { clock += ms; }, clock: () => clock };
    }

    test('the crossing far apart in s is drawn on the second pass: every tile within 900 m is held and built', async () => {
        const { streamer, hooks } = streamerOn();
        const crossing = route.points.findIndex((p, i) => i > route.points.length / 3 && Math.hypot(p.x, p.z) < 6);
        expect(crossing).toBeGreaterThan(route.points.length / 3);
        const bike = route.points[crossing];
        const s = route.sArray[crossing];
        const first = route.points.findIndex(p => Math.hypot(p.x, p.z) < 6);
        expect(route.sArray[crossing] - route.sArray[first]).toBeGreaterThan(5000);
        await streamer.settle(bike, s);
        const near = streamer.tilesNear(bike.x, bike.z, WorldStreamer.BIKE_TILE_M);
        expect(near.size).toBeGreaterThan(0);
        for (const key of near) {
            expect(streamer.refs.get(key)).toBeGreaterThanOrEqual(1);
            expect(hooks.built.some(([k]) => k === key)).toBe(true);
        }
        // Road sections of the first pass, 5 km back along the ride, are within 1.2 km of the bike by place
        const firstSection = streamer.sections.find(sec => sec.s0 <= route.sArray[first] && sec.s1 >= route.sArray[first]);
        expect(streamer.roads.has(firstSection.index)).toBe(true);
    });

    test('a tile is held by the bike and by the ride window, and counts add', () => {
        const { streamer } = streamerOn();
        streamer.setOwner('a', new Set(['0,0', '1,0']));
        streamer.setOwner('b', new Set(['1,0']));
        expect(streamer.refs.get('0,0')).toBe(1);
        expect(streamer.refs.get('1,0')).toBe(2);
        streamer.setOwner('a', new Set());
        expect(streamer.refs.has('0,0')).toBe(false);
        expect(streamer.refs.get('1,0')).toBe(1);
    });

    test('a tile is disposed only after its count has stayed 0 for 3 s', async () => {
        const { streamer, hooks, tick } = streamerOn();
        const a = route.points[100], b = route.points[Math.floor(route.points.length * 0.7)];
        await streamer.settle(a, route.sArray[100]);
        const held = [...streamer.tiles.keys()];
        expect(held.length).toBeGreaterThan(0);
        await streamer.settle(b, route.sArray[Math.floor(route.points.length * 0.7)]);
        const dropped = held.filter(key => !streamer.refs.has(key));
        expect(dropped.length).toBeGreaterThan(0);
        expect(hooks.gone).toEqual([]);
        tick(2900);
        streamer.update(b, route.sArray[Math.floor(route.points.length * 0.7)]);
        expect(hooks.gone).toEqual([]);
        tick(200);
        streamer.update(b, route.sArray[Math.floor(route.points.length * 0.7)]);
        expect(hooks.gone.sort()).toEqual(dropped.sort());
        expect(streamer.stats.disposes).toBeGreaterThanOrEqual(dropped.length);
    });

    test('a tile that comes back inside the 3 s is kept', async () => {
        const { streamer, hooks, tick } = streamerOn();
        const s0 = route.sArray[100], s1 = route.sArray[Math.floor(route.points.length * 0.7)];
        await streamer.settle(route.points[100], s0);
        streamer.update(route.points[Math.floor(route.points.length * 0.7)], s1);
        tick(2000);
        streamer.update(route.points[100], s0);
        tick(2000);
        streamer.update(route.points[100], s0);
        expect(hooks.gone).toEqual([]);
    });

    test('nothing is built for a tile whose data has not arrived', async () => {
        const { streamer, hooks, data } = streamerOn({ resident: false });
        streamer.update(route.points[0], 0);
        expect(streamer.queue.filter(t => t.id.startsWith('tile:'))).toEqual([]);
        expect(hooks.built).toEqual([]);
        await streamer.settle(route.points[0], 0);
        expect(hooks.built.length).toBeGreaterThan(0);
        expect(data.fetched.length).toBeGreaterThan(0);
    });

    test('what stands on a tile is built in a step of its own, after the land', async () => {
        const { streamer, hooks } = streamerOn();
        const order = [];
        hooks.buildTile = key => order.push(`land:${key}`);
        hooks.buildScenery = (key, lod) => order.push(`trees:${key}:${lod}`);
        streamer.update(route.points[0], 0);
        const steps = [];
        while (streamer.queue.length) steps.push(streamer.pump(0));
        // Every pump(0) runs one step, so a tile's land and its trees were never in one step
        expect(steps.every(n => n === 1)).toBe(true);
        const tiles = order.filter(o => o.startsWith('land:')).map(o => o.slice(5));
        expect(tiles.length).toBeGreaterThan(0);
        for (const key of tiles) {
            const land = order.findIndex(o => o === `land:${key}`);
            const trees = order.findIndex(o => o.startsWith(`trees:${key}:`));
            expect(trees).toBeGreaterThan(land);
        }
    });

    test('a frame builds nothing past the budget, but always one step', () => {
        const { streamer, tick, clock } = streamerOn();
        const ran = [];
        for (let i = 0; i < 6; i++) streamer.enqueue(`x${i}`, i, () => { ran.push(i); tick(3); });
        expect(streamer.pump(4)).toBe(2);
        expect(ran).toEqual([0, 1]);
        expect(streamer.stats.frameBuildMs).toBe(6);
        expect(streamer.pump(0)).toBe(1);
        expect(ran).toEqual([0, 1, 2]);
        expect(streamer.queue.length).toBe(3);
        expect(clock()).toBe(9);
    });

    test('the first frame, built with no budget, is not counted in the streaming step times', async () => {
        const { streamer, tick } = streamerOn();
        streamer.enqueue('tile:cold', 0, () => tick(9));
        await streamer.settle(route.points[0], 0);
        expect(streamer.stats.maxStepMs).toBe(0);
        streamer.enqueue('road:1', 0, () => tick(2));
        streamer.pump(4);
        expect(streamer.stats.maxStepMs).toBe(2);
        expect(streamer.stats.maxStepByKind).toEqual({ road: 2 });
    });

    test('disposal is timed on the clock the streamer is given, so a ride stepped faster than real time still lets go', () => {
        let frames = 0;
        const hooks = { gone: [], buildTile() {}, disposeTile(key) { this.gone.push(key); }, buildRoad() {}, disposeRoad() {}, buildSide() {}, disposeSide() {} };
        const data = fakeData({ tiles, resident: true });
        data.manifest.tiles.height = tiles;
        const streamer = new WorldStreamer({ data, route, hooks, now: () => 0, clock: () => frames * (1000 / 60) });
        streamer.update(route.points[0], 0);
        streamer.pump(Infinity);
        const far = route.points[Math.floor(route.points.length / 2)];
        streamer.update(far, route.sArray[Math.floor(route.points.length / 2)]);
        for (frames = 1; frames <= 200; frames++) streamer.update(far, route.sArray[Math.floor(route.points.length / 2)]);
        expect(hooks.gone.length).toBeGreaterThan(0);
    });

    test('the queue builds nearest first and does not queue a task twice', () => {
        const { streamer } = streamerOn();
        const order = [];
        streamer.enqueue('far', 900, () => order.push('far'));
        streamer.enqueue('near', 5, () => order.push('near'));
        streamer.enqueue('far', 800, () => order.push('far2'));
        streamer.pump(Infinity);
        expect(order).toEqual(['near', 'far2']);
    });

    test('ensure holds the ground under a station and resolves when its data is here', async () => {
        const { streamer, data } = streamerOn({ resident: false });
        const p = route.points[2000];
        const keys = await streamer.ensure(p.x, p.z, 200);
        expect(keys.length).toBeGreaterThan(0);
        for (const key of keys) expect(data.tile(key)).not.toBeNull();
        expect(streamer.owners.get('placing').size).toBe(keys.length);
        streamer.releasePlacing();
        expect(streamer.refs.size).toBe(0);
    });

    test('a tile the data does not have is never asked for', () => {
        const { streamer } = streamerOn();
        expect(streamer.exists('0,0')).toBe(true);
        expect(streamer.exists('99,99')).toBe(false);
        expect(streamer.tilesNear(1e6, 1e6, 900).size).toBe(0);
    });

    test('the sections cover the ride end to end', () => {
        const { streamer } = streamerOn();
        expect(streamer.sections[0].from).toBe(0);
        expect(streamer.sections[streamer.sections.length - 1].to).toBe(route.points.length - 1);
        streamer.sections.slice(1).forEach((sec, i) => expect(sec.from).toBe(streamer.sections[i].to));
    });
});
