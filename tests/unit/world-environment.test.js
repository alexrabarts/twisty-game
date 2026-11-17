// WorldEnvironment and the guide, over the shipped Tremola slice and the 6 km mini fixture, with real three
// in node and plain (unmodelled) trees and houses. The browser probes in tools/terrain-check.mjs (world-*)
// prove the same things in a page, against the drawn meshes.
import { describe, test, expect, beforeAll } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';
import { samplesOf, straight } from '../helpers/world-synthetic.js';

const game = loadGame();
const { THREE, WorldEnvironment, WorldGuide, WorldRoute, WorldPhysics, WorldStreamer } = game;
const LEG_BUDGET = { meshes: 800, triangles: 450000, instances: 1400 };

async function load(search = '', id = 'tremola') {
    const { fetchFn, calls } = diskFetch();
    const scene = new THREE.Scene();
    const env = await WorldEnvironment.load(scene, { id, search, fetchFn, models: null, digest: async () => '0' });
    return { env, scene, calls };
}

describe('asking for a world', () => {
    test('?world= names it, and a page without it asks for none', () => {
        expect(WorldEnvironment.requested('?world=tremola')).toBe('tremola');
        expect(WorldEnvironment.requested('?world=all&worldData=world/')).toBe('all');
        expect(WorldEnvironment.requested('')).toBeNull();
        expect(WorldEnvironment.requested('?x=1')).toBeNull();
    });

    test('an unknown stage says what is known', async () => {
        await expect(load('', 'nowhere')).rejects.toThrow('unknown world "nowhere"; known: all, tremola');
    });

    test.each(['?worldData=https://example.com/', '?worldData=../../', '?worldData=//evil/world/'])('%s refuses to load and fetches nothing', async (search) => {
        const { fetchFn, calls } = diskFetch();
        await expect(WorldEnvironment.load(new THREE.Scene(), { id: 'all', search, fetchFn })).rejects.toThrow(/relative path/);
        expect(calls).toEqual([]);
    });

    test('the fixture folder loads, reads only itself, and never submits', async () => {
        const { env, calls } = await load('?worldData=tests/fixtures/world/mini', 'mini-1');
        expect(calls.every(url => url.startsWith('tests/fixtures/world/mini/'))).toBe(true);
        expect(env.submitAllowed).toBe(false);
        expect(env.stage.id).toBe('mini-1');
        expect(env.endS).toBeCloseTo(2002.66, 2);
        expect(env.checkpoints).toHaveLength(3);
        expect(env.finishGate.s).toBeCloseTo(2002.66, 1);
        env.dispose();
    });
});

describe('the Tremola slice', () => {
    let env, scene, bike;
    beforeAll(async () => {
        ({ env, scene } = await load('', 'tremola'));
        bike = env.startPosition();
        await env.streamer.settle(bike, env.startS);
    }, 60000);

    test('it answers what the game reads of an environment, and builds none of what a leg builds', () => {
        expect(env.isWorld).toBe(true);
        expect(env.physics).toBe(WorldPhysics);
        expect(env.roadWidth).toBe(10);
        expect(env.sections).toBeNull();
        expect(env.terrain).toBeNull();
        expect(env.terrainGeometry).toBeNull();
        for (const list of [env.roadworksZones, env.roadworkObstacles, env.jumpRamps, env.boulders, env.setPieces]) expect(list).toEqual([]);
        expect(env.config.render.shadowSpan).toBeGreaterThan(0);
        expect(env.resolveRoadSurface()).toEqual({});
    });

    test('the stage has its 12 gates in order and a finish at the end of the ride', () => {
        expect(env.checkpoints).toHaveLength(12);
        env.checkpoints.forEach((cp, i) => {
            expect(cp.index).toBe(i);
            expect(cp.passed).toBe(false);
            if (i) expect(cp.s).toBeGreaterThan(env.checkpoints[i - 1].s);
        });
        expect(env.finishGate.s).toBeCloseTo(env.route.length, 0);
        expect(env.finishGate.kind).toBe('finish');
        expect(env.checkpoints[0].width).toBe(8);
        expect(env.startPosition().x).toBeCloseTo(env.route.sample(env.startS, {}).x, 9);
    });

    test('the first window is inside the budgets', () => {
        const counts = env.counts();
        expect(counts.meshes).toBeLessThanOrEqual(LEG_BUDGET.meshes);
        expect(counts.triangles).toBeLessThanOrEqual(LEG_BUDGET.triangles);
        expect(counts.instances).toBeLessThanOrEqual(LEG_BUDGET.instances);
        expect(counts.tiles).toBeGreaterThan(5);
        expect(counts.tiles).toBeLessThanOrEqual(60);
        expect(counts.queue).toBe(0);
    });

    test('the tiles within 900 m are drawn and held', () => {
        const near = env.streamer.tilesNear(bike.x, bike.z, WorldStreamer.BIKE_TILE_M);
        expect(near.size).toBeGreaterThan(0);
        for (const key of near) {
            expect(env.streamer.refs.get(key)).toBeGreaterThanOrEqual(1);
            expect(env.tileMeshes.has(key)).toBe(true);
        }
    });

    test('the horizon, the gates, the signposts and the barriers are in the scene', () => {
        const names = [];
        env.group.traverse(o => names.push(o.name));
        for (const name of ['world-horizon', 'world-gates', 'world-barriers', 'world-signposts']) expect(names).toContain(name);
        expect(scene.children).toContain(env.group);
    });

    test('the ground under the road is the route, and is never NaN away from it', () => {
        const route = env.route;
        for (const s of [30, 500, 2000, 6000, 12000]) {
            const p = route.sample(s, {});
            const u = Math.floor(route.toUnits(s));
            const loc = {};
            expect(env.ground.groundY(p.x, p.z, { start: u - 10, end: u + 10 }, false, loc)).toBeCloseTo(p.y, 4);
            for (const lateral of [-60, -12, 8, 40, 300]) {
                const y = env.ground.groundY(p.x + lateral * Math.cos(p.heading), p.z - lateral * Math.sin(p.heading), { start: u - 10, end: u + 10 }, false, {});
                expect(Number.isFinite(y)).toBe(true);
            }
        }
    });

    test('the junction the rider reaches closes its other branches, and only that junction', () => {
        const junction = env.graph.junctions.find(j => j.passes.some(p => p.inEdge !== null && p.barriers.length));
        const pass = junction.passes.find(p => p.inEdge !== null && p.barriers.length);
        const p = env.route.sample(Math.max(0, pass.sIn - 150), {});
        env.update(p, pass.sIn - 150);
        const active = env.activeBarriers.filter(b => b.junctionId === junction.id).map(b => b.edgeId).sort((a, b) => a - b);
        expect(active).toEqual(pass.barriers.map(b => b.edgeId).sort((a, b) => a - b));
        expect(active).not.toContain(pass.outEdge);
        expect(env.barrierMesh.count).toBe(env.activeBarriers.length);
        for (const b of pass.barriers) {
            const loc = { x: b.x, z: b.z, index: 0, lateral: 100 };
            expect(env.ground.zoneAt(loc, 5).kind).toBe('wall');
        }
        // Far down the ride the junction's barriers are gone
        env.update(env.route.sample(env.route.length - 10, {}), env.route.length - 10);
        expect(env.activeBarriers.filter(b => b.junctionId === junction.id)).toEqual([]);
    });

    test('update builds within the frame budget and the guide runs from the state it is given', () => {
        const p = env.route.sample(env.startS, {});
        const state = { projection: env.route.project(p.x, p.z, null, {}), speed: 20, yaw: p.heading, dt: 1 / 60, position: p };
        env.update(p, env.startS, state, 4);
        expect(env.guide.cause).toBeNull();
        expect(env.guide.promptText).toEqual(expect.any(String));
    });

    test('a restart far from the bike holds the ground under the gate, and lets go once the bike is there', async () => {
        const s = env.route.length * 0.8;
        const keys = await env.place(s);
        const p = env.route.sample(s, {});
        expect(keys.length).toBeGreaterThan(0);
        for (const key of keys) expect(env.data.tile(key)).not.toBeNull();
        expect(env.streamer.owners.get('placing').size).toBe(keys.length);
        // The ground answers a number before any mesh is built there
        expect(Number.isFinite(env.ground.groundY(p.x, p.z, { start: 0, end: 5 }, false, {}))).toBe(true);
        env.update(p, s);
        expect(env.streamer.owners.get('placing').size).toBe(0);
        expect(env.streamer.refs.size).toBeGreaterThan(0);
    });

    test('the disposal clock runs on simulated time, the same at 120 Hz, 30 fps and with no step at all', () => {
        const p = env.route.sample(env.startS, {});
        const clock = () => env.streamer.clock();
        let before = clock();
        for (let i = 0; i < 120; i++) env.update(p, env.startS, null, 4, 1 / 120);
        expect(clock() - before).toBeCloseTo(1000, 6);
        before = clock();
        for (let i = 0; i < 30; i++) env.update(p, env.startS, null, 4, 1 / 30);
        expect(clock() - before).toBeCloseTo(1000, 6);
        before = clock();
        env.update(p, env.startS, null, 4);
        expect(clock()).toBe(before);
    });

    test('disposing leaves nothing of the world in the scene', () => {
        env.dispose();
        expect(scene.children).not.toContain(env.group);
    });
});

describe('WorldGuide', () => {
    const route = new WorldRoute(samplesOf(straight(2000, { y: 0 })), {});
    const environment = { route, credit: '© swisstopo', sideEdges: new Map() };
    const onRoad = { s: 100, lateral: 1, heading: 0, distance: 1 };
    const frame = (projection, over = {}) => ({ projection, speed: 20, yaw: 0, dt: 1 / 60, position: { x: 0, z: 0 }, ...over });

    function run(guide, seconds, state) {
        const events = [];
        for (let tick = 0; tick < seconds * 60; tick++) {
            const fired = guide.update(state);
            events.push([tick / 60, guide.warning, fired]);
        }
        return events;
    }

    test('50 m off the ride line warns at once and restarts 10 s later', () => {
        const guide = new WorldGuide(environment);
        const reasons = [];
        guide.onRestart = reason => reasons.push(reason);
        const events = run(guide, 12, frame({ ...onRoad, lateral: 50 }));
        expect(events[0][1]).toBe('Wrong way');
        const fired = events.find(e => e[2] === 'restart');
        expect(fired[0]).toBeGreaterThan(9.9);
        expect(fired[0]).toBeLessThan(10.1);
        expect(reasons).toEqual(['off-route']);
    });

    test('riding backwards warns after 5 s and restarts 10 s after that', () => {
        const guide = new WorldGuide(environment);
        const reasons = [];
        guide.onRestart = reason => reasons.push(reason);
        const events = run(guide, 17, frame(onRoad, { speed: 10, yaw: Math.PI }));
        const warned = events.find(e => e[1]);
        expect(warned[0]).toBeGreaterThan(4.9);
        expect(warned[0]).toBeLessThan(5.2);
        const fired = events.find(e => e[2] === 'restart');
        expect(fired[0] - warned[0]).toBeGreaterThan(9.9);
        expect(fired[0] - warned[0]).toBeLessThan(10.2);
        expect(reasons).toEqual(['wrong-way']);
    });

    test('riding the road normally never warns (the control)', () => {
        const guide = new WorldGuide(environment);
        guide.onRestart = () => { throw new Error('restart'); };
        const events = run(guide, 100, frame(onRoad));
        expect(events.some(e => e[1] || e[2])).toBe(false);
    });

    test('creeping backwards under 3 m/s is not riding the wrong way', () => {
        const guide = new WorldGuide(environment);
        const events = run(guide, 20, frame(onRoad, { speed: 2.5, yaw: Math.PI }));
        expect(events.some(e => e[1])).toBe(false);
    });

    test('a restart resets both timers, so one excursion costs one penalty', () => {
        const guide = new WorldGuide(environment);
        let restarts = 0;
        guide.onRestart = () => { restarts++; };
        run(guide, 8, frame({ ...onRoad, lateral: 60 }));
        guide.reset();
        // Still off route after the reset: a new 10 s must run before the next restart
        const events = run(guide, 9, frame({ ...onRoad, lateral: 60 }));
        expect(restarts).toBe(0);
        expect(events.some(e => e[2] === 'restart')).toBe(false);
        run(guide, 2, frame({ ...onRoad, lateral: 60 }));
        expect(restarts).toBe(1);
    });

    test('getting back on the road clears the warning and the clock', () => {
        const guide = new WorldGuide(environment);
        let restarts = 0;
        guide.onRestart = () => { restarts++; };
        run(guide, 6, frame({ ...onRoad, lateral: 60 }));
        expect(guide.warning).toBe('Wrong way');
        run(guide, 1, frame(onRoad));
        expect(guide.warning).toBeNull();
        run(guide, 6, frame({ ...onRoad, lateral: 60 }));
        expect(restarts).toBe(0);
    });

    test('the prompt names the next junction, its distance and the way to go', () => {
        const graph = {
            junctions: [{ id: 'j', name: 'Via Gottardo', node: 0, incident: [{ edgeId: 1, heading: Math.PI }, { edgeId: 2, heading: 0.6 }], passes: [{ sIn: 400, inEdge: 1, outEdge: 2, barriers: [] }] }]
        };
        const guide = new WorldGuide({ ...environment, route: new WorldRoute(samplesOf(straight(2000)), { graph }) });
        expect(guide.promptAt(100)).toBe('Keep right, 300 m · Via Gottardo');
        expect(guide.promptAt(396)).toBe('Keep right, 10 m · Via Gottardo');
        expect(guide.promptAt(600)).toBe('');
    });
});
