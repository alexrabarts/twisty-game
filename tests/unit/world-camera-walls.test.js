/**
 * @jest-environment node
 */
// The chase camera of a world never goes through a wall or sits behind one. In the high view the boom swung over the
// retaining wall of the leg above a stacked hairpin; the rule that keeps the camera under a road overhead then put it
// down under that leg, inside the hill behind the wall's face, in one frame. The camera now reads the walls beside
// the road (WorldEnvironment.cameraFaces: the ride's and the side roads' retaining walls and parapets, a wall's
// taper, a bridge's parapet, the houses) and ends its boom short of a face it would cross (WorldCamera.wallShare).
//
// Every hairpin of the shipped stage and of the fixture world is ridden by a kinematic bike in the standard and the
// high view (tests/helpers/world-camera-walls.js): on the centre line at 5 m/s, 7 m/s and the bend's advised speed
// and at the worst lean either way, and 2 m to each side at the worst lean; then with the tuning rows'
// boom and swing at their most. On every frame the line from the bike to the camera is read against the walls, the
// houses and the land with the helper's own geometry. The same rides with the rule off find the crossings.
import { describe, test, expect, beforeAll } from '@jest/globals';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { loadGame } from '../helpers/load-game.js';
import { samplesOf, straight } from '../helpers/world-synthetic.js';
import { MODES } from '../helpers/world-camera-walls.js';

const game = loadGame(undefined, []);
const { WorldRoute, WorldCamera } = game;

// The most the camera's distance from the bike may change in a frame at 60 Hz: STEP_M metres at the default boom (the
// land's spring drawing a high view's 21 m boom in ahead of a wall moves it 0.4 m; the jump this rule removes was 2 m),
// and STEP_SHARE of the distance for every ride, the tuning's boom at its most too (the same spring draws a 38 m boom
// in by 4.0% of the distance at most in a frame, 2.8% without the tuning; the jumps removed were up to 14% of it)
const STEP_M = 0.5;
const STEP_SHARE = 0.05;
// Without the rule, the frames of the shipped stage on which a wall stood between the bike and the camera
const BEFORE = { wall: 1500 };

const list = (items, n = 12) => items.slice(0, n).map(i => JSON.stringify(i)).join('\n');

// Rides every hairpin of a world with the rule on and off, in a node process of its own
// (tests/helpers/world-camera-walls-sweep.mjs: under this VM the same rides take about fifteen times as long)
const SWEEP = fileURLToPath(new URL('../helpers/world-camera-walls-sweep.mjs', import.meta.url));
async function sweep(search, id) {
    const { stdout } = await promisify(execFile)(process.execPath, [SWEEP, id, search, String(STEP_M), String(STEP_SHARE)], { maxBuffer: 1 << 26 });
    return JSON.parse(stdout);
}

describe('a wall face and the boom (WorldCamera.wallShare)', () => {
    const Y = 100;
    const W = WorldCamera.WALLS;
    // A wall along the road (+z), 4 m to the +x side of the centre line, from z 100 to z 200, its top `top` over the
    // road and its foot 2 m under it. It faces out toward +x (the right of a to b): the road is on its own side
    const wall = (top, road = 0) => {
        const data = new Float64Array(WorldCamera.FACE);
        data.set([4, 100, 4, 200, Y + top, Y + top, Y - 2, Y - 2, road]);
        return { data, count: 1 };
    };
    const camera = faces => {
        const c = new WorldCamera(new WorldRoute(samplesOf(straight(400, { y: Y })), {}), { groundY: () => Y }, null, () => faces);
        c.walls = faces;
        return c;
    };
    const head = { x: 0, y: Y + 1.2, z: 150 };

    test('the face is turned so that it faces out on the right of a to b', () => {
        // a (4, 100) to b (4, 200) runs along +z: its right is +x. The road is at -x of it: inside
        const c = camera(wall(6));
        // A boom toward +x closes on it from inside and is held short of it
        expect(c.wallShare(head, { x: 8, y: Y + 3, z: 144 }, Y, false)).toBeLessThan(1);
    });

    test('a boom that would cross the face ends the margin short of it', () => {
        const c = camera(wall(6));
        const end = { x: 8, y: Y + 3, z: 144 };
        const hard = c.wallShare(head, end, Y, false), soft = c.wallShare(head, end, Y, true);
        // 4 m to the face over 8 m of boom across: the margin short of half the boom
        expect(hard).toBeCloseTo((4 - W.hardM) / 8, 6);
        expect(soft).toBeCloseTo((4 - W.clearM) / 8, 6);
        // and a boom that ends short of the face but inside the margin is held to the margin too
        expect(c.wallShare(head, { x: 3.8, y: Y + 3, z: 144 }, Y, false)).toBeCloseTo((4 - W.hardM) / 3.8, 6);
    });

    test('a boom that stays the margin short of the face, runs along it or leaves it is left alone', () => {
        const c = camera(wall(6));
        for (const soft of [false, true]) {
            expect(c.wallShare(head, { x: 4 - W.clearM - 0.01, y: Y + 3, z: 144 }, Y, soft)).toBe(1);
            expect(c.wallShare(head, { x: 0, y: Y + 3, z: 144 }, Y, soft)).toBe(1);
            expect(c.wallShare(head, { x: -6, y: Y + 3, z: 144 }, Y, soft)).toBe(1);
            // A bike right beside the face with its boom along it keeps its whole boom
            expect(c.wallShare({ x: 3.9, y: Y + 1.2, z: 150 }, { x: 3.9, y: Y + 3, z: 144 }, Y, soft)).toBe(1);
        }
    });

    test('a boom passes over a low face it clears, and is drawn in as it comes down to it', () => {
        const c = camera(wall(0.8));
        // The boom is 2.1 m over the road where it meets the plane: 1.3 m over a parapet 0.8 m high
        const end = { x: 8, y: Y + 3, z: 144 };
        expect(c.wallShare(head, end, Y, false)).toBe(1);
        expect(c.wallShare(head, end, Y, true)).toBe(1);
        // Lower booms: eased in from overM + overBandM over the top, held from hardOverM over it
        const shares = [2.9, 2.5, 2.2, 1.9, 1.6, 1.2].map(y => c.wallShare(head, { x: 8, y: Y + y, z: 144 }, Y, true));
        for (let i = 1; i < shares.length; i++) expect(shares[i]).toBeLessThanOrEqual(shares[i - 1]);
        expect(shares[shares.length - 1]).toBeCloseTo((4 - W.clearM) / 8, 6);
        expect(c.wallShare(head, { x: 8, y: Y + 0.6, z: 144 }, Y, false)).toBeLessThan(1);
        // Under its foot (the deck of a bridge beside the road) nothing is in the way
        expect(c.wallShare({ x: 0, y: Y - 4, z: 150 }, { x: 8, y: Y - 3, z: 144 }, Y, false)).toBe(1);
    });

    test('past the face\'s end the boom is free, and eased in over endBandM before it', () => {
        const c = camera(wall(6));
        const at = z => c.wallShare({ x: 0, y: Y + 1.2, z }, { x: 8, y: Y + 3, z: z - 6 }, Y, true);
        // (the boom meets the plane 3 m behind the head)
        expect(at(100 + 3 - W.hardM - W.endBandM - 0.1)).toBe(1);
        expect(at(103 + 1)).toBeCloseTo((4 - W.clearM) / 8, 6);
        let last = 1;
        for (let z = 99; z <= 104; z += 0.25) { const share = at(z); expect(share).toBeLessThanOrEqual(last + 1e-9); last = share; }
        expect(c.wallShare({ x: 0, y: Y + 1.2, z: 100 + 3 - W.hardM - 0.1 }, { x: 8, y: Y + 3, z: 94 + 3 - W.hardM - 0.1 }, Y, false)).toBe(1);
    });

    test('from outside, a wall with a road on it well over the bike is not passed over at any height', () => {
        // The same wall seen from the other side: the bike at +x of it, below; the wall's road 6 m up
        const out = { x: 10, y: Y + 1.2, z: 150 };
        const end = { x: -2, y: Y + 14, z: 144 };
        // (the boom is 7.6 m over the road at the plane: over a 6 m wall's top)
        expect(camera(wall(6, 1)).wallShare(out, end, Y, false)).toBeCloseTo((6 - W.hardM) / 12, 6);
        // A house, or a wall whose road is under roadFrom over the bike's, is passed over
        expect(camera(wall(6, 0)).wallShare(out, end, Y, false)).toBe(1);
        expect(camera(wall(W.roadFrom - 0.1, 1)).wallShare(out, end, Y, false)).toBe(1);
        // and from the road's own side its wall and parapet are passed over as any low face is
        expect(camera(wall(6, 1)).wallShare(head, { x: 16, y: Y + 22, z: 144 }, Y, false)).toBe(1);
    });

    test('a bike nearer the face than the margin keeps a boom of nearShare of its own distance', () => {
        const c = camera(wall(6));
        const near = { x: 3.7, y: Y + 1.2, z: 150 };
        expect(c.wallShare(near, { x: 5.7, y: Y + 3, z: 144 }, Y, false)).toBeCloseTo(0.3 * (1 - W.nearShare) / 2, 6);
    });
});

describe('the chase camera beside a wall on a synthetic straight', () => {
    const Y = 100;
    const route = () => new WorldRoute(samplesOf(straight(400, { y: Y })), {});
    const input = (z, lean, mode) => ({ x: 0, y: Y, z, s: z, index: Math.floor(z / 4), speed: 12, lift: 1, offset: mode.offset, fov: 75, aspect: 16 / 9, swing: { x: -lean * 2, look: -lean * 4, follow: mode.follow, lookFollow: mode.follow * 1.5 } });

    test('with no face near, the camera is the same with and without the rule, under a deck too', () => {
        const none = { data: new Float64Array(WorldCamera.FACE), count: 0 };
        const deck = (x, z) => (z >= 200 && z <= 212 ? Y + 4.3 : Infinity);
        for (const mode of Object.values(MODES)) {
            const a = new WorldCamera(route(), { groundY: () => Y }, deck, () => none), b = new WorldCamera(route(), { groundY: () => Y }, deck);
            a.reset(0); b.reset(0);
            let under = 0;
            for (let z = 100; z < 300; z += 0.2) {
                const lean = 0.5 * Math.sin(z / 9);
                const p = a.update(input(z, lean, mode), 1 / 60), q = b.update(input(z, lean, mode), 1 / 60);
                expect(p.x).toBeCloseTo(q.x, 9);
                expect(p.y).toBeCloseTo(q.y, 9);
                expect(p.z).toBeCloseTo(q.z, 9);
                if (deck(p.x, p.z) !== Infinity) { under++; expect(p.y).toBeLessThan(deck(p.x, p.z)); }
            }
            expect(under).toBeGreaterThan(0);
        }
    });

    test('the swing gives way to a wall beside the road and the camera stays the margin off it', () => {
        // A wall 1.2 m to the +x side of the centre line, 12 m high (over the high view's boom)
        const AT = 1.2;
        const data = new Float64Array(WorldCamera.FACE);
        data.set([AT, 0, AT, 400, Y + 12, Y + 12, Y - 2, Y - 2, 0]);
        const faces = { data, count: 1 };
        for (const mode of Object.values(MODES)) {
            const walled = new WorldCamera(route(), { groundY: () => Y }, null, () => faces), free = new WorldCamera(route(), { groundY: () => Y });
            walled.reset(0); free.reset(0);
            let most = -Infinity, freeMost = -Infinity, step = 0, last = null;
            for (let z = 100; z < 300; z += 0.2) {
                // The lean swings the camera toward the wall and away from it in turn
                const lean = -0.9 * Math.sin(z / 9);
                const p = walled.update(input(z, lean, mode), 1 / 60), q = free.update(input(z, lean, mode), 1 / 60);
                most = Math.max(most, p.x);
                freeMost = Math.max(freeMost, q.x);
                const d = Math.hypot(p.x, p.z - z);
                if (last !== null) step = Math.max(step, Math.abs(d - last));
                last = d;
            }
            // Without the rule the camera is past the wall's plane; with it, the hard margin short of it at the least
            expect(freeMost).toBeGreaterThan(AT);
            expect(most).toBeLessThanOrEqual(AT - WorldCamera.WALLS.hardM + 1e-6);
            expect(step).toBeLessThan(STEP_M);
        }
    });
});

// Both worlds are ridden at once, from the start
const sweeps = { stage: null, fixture: null };
const started = () => sweeps.stage || Object.assign(sweeps, { stage: sweep('', 'tremola'), fixture: sweep('?worldData=tests/fixtures/world/mini', 'all') }).stage;

describe('the shipped stage: the chase camera and the walls of every hairpin', () => {
    let result;
    beforeAll(async () => {
        started();
        result = await sweeps.stage;
        console.log(`world-camera-walls, the shipped stage: ${result.hairpins} hairpins, ${result.on.frames} frames a rule; crossings with the rule off ${JSON.stringify({ wall: result.off.wall, house: result.off.house, land: result.off.land, near: result.off.near, step: result.off.step, share: result.off.share })}, with it on ${JSON.stringify({ wall: result.on.wall, house: result.on.house, land: result.on.land, near: result.on.near, step: result.on.step, share: result.on.share })}; most faces listed ${result.faces}`);
    }, 1800000);

    test('every hairpin was ridden, and walls stand beside them', () => {
        expect(result.hairpins).toBeGreaterThanOrEqual(20);
        expect(result.on.frames).toBeGreaterThan(500000);
        expect(result.faces).toBeGreaterThan(20);
    });

    test('the line from the bike to the camera crosses no wall, house or land on any frame', () => {
        const sum = result.on;
        if (sum.wall + sum.house + sum.land) throw new Error(`${sum.wall} frames behind a wall, ${sum.house} behind a house, ${sum.land} behind the land:\n${list(sum.bad)}`);
    });

    test('the camera is never within 0.4 m of a wall\'s face or a house at its height', () => {
        if (result.on.near) throw new Error(`${result.on.near} frames within 0.4 m of a face:\n${list(result.on.bad)}`);
    });

    test(`the camera's distance from the bike changes by ${STEP_M} m a frame at the most, and by ${STEP_SHARE * 100}% of it with the tuning`, () => {
        if (result.on.jumps.length) throw new Error(`${result.on.jumps.length} rides with a larger step:\n${list(result.on.jumps)}`);
        expect(result.on.step).toBeLessThanOrEqual(STEP_M);
        expect(result.on.share).toBeLessThanOrEqual(STEP_SHARE);
    });

    test('the same rides with the rule off find the crossings and the jump', () => {
        expect(result.off.frames).toBe(result.on.frames);
        expect(result.off.wall).toBeGreaterThan(BEFORE.wall);
        expect(result.off.step).toBeGreaterThan(1);
        expect(result.off.share).toBeGreaterThan(2 * STEP_SHARE);
    });
});

describe('the fixture world: the same rule on other data', () => {
    let result;
    beforeAll(async () => {
        started();
        result = await sweeps.fixture;
        console.log(`world-camera-walls, the fixture world: ${result.hairpins} hairpins, ${result.on.frames} frames a rule; with the rule off ${JSON.stringify({ wall: result.off.wall, house: result.off.house, land: result.off.land, near: result.off.near, step: result.off.step, share: result.off.share })}, with it on ${JSON.stringify({ wall: result.on.wall, house: result.on.house, land: result.on.land, near: result.on.near, step: result.on.step, share: result.on.share })}; most faces listed ${result.faces}`);
    }, 1800000);

    test('no wall, house or land between the bike and the camera, and no jump', () => {
        const sum = result.on;
        expect(result.hairpins).toBeGreaterThan(0);
        if (sum.wall + sum.house + sum.land + sum.near) throw new Error(`${sum.wall} frames behind a wall, ${sum.house} behind a house, ${sum.land} behind the land, ${sum.near} within 0.4 m of a face:\n${list(sum.bad)}`);
        if (sum.jumps.length) throw new Error(`${sum.jumps.length} rides with a step over ${STEP_M} m or ${STEP_SHARE * 100}% of the distance:\n${list(sum.jumps)}`);
    });
});
