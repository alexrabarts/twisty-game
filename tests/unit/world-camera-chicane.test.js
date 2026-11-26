/**
 * @jest-environment node
 */
// The chase camera of a world through a chicane. The owner saw the camera swing violently through the S at km 0.5 of
// the Gotthard leg, where the ride bends 52 degrees one way and then turns 87 degrees the other way onto the
// Gotthardstrasse, inside 60 m. The boom turned by the road's heading 4 m behind the bike, so it followed each bend;
// the carving swing flicked from one side to the other with the lean; and the look ran round each bend as fast as the
// point on the road did. The view's yaw acceleration there was 10.2 rad/s^2 in the near chase.
//
// Now the boom turns by the road's mean heading over a span that grows with speed (WorldCamera.roadMean), the swing
// takes only the share of the road's turn that the S does not cancel, and the look follows the road's turn through a
// spring of its own. These tests ride every chicane, every hairpin and every tunnel and gallery of both shipped stages
// with a kinematic bike at a pilot's speed through the real Game.updateCamera (tests/helpers/world-chase-sweep.mjs) and
// hold the view's swing to bounds set from that measurement, with the bike well inside the view. In a tube the camera
// keeps under its roof by the same rule as under a bridge (WorldEnvironment.tubeRoofY).
import { describe, test, expect, beforeAll } from '@jest/globals';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { loadGame } from '../helpers/load-game.js';
import { samplesOf } from '../helpers/world-synthetic.js';
import { stagesFor } from '../helpers/world-stages.js';
import { diskFetch } from '../helpers/world-fetch.js';
import { chaseRide } from '../helpers/world-chase-ride.js';

const game = loadGame(undefined, []);
const { WorldRoute, WorldCamera } = game;

// The most a chicane or a hairpin may give, in either view, measured over 0.1 s within 40 m of the place: the view's
// yaw acceleration (rad/s^2) and yaw rate (rad/s), the bike's sideways rate across the view (half views a second), and
// the least room the bike keeps from a side of the view (1 in the middle). Before this rule the worst places gave
// 10.3, 2.7, 1.7 and 0.26; with it 3.4, 1.4, 0.91 and 0.37 (both stages, both views)
const LIMITS = { accel: 4, rate: 1.6, sway: 1.0, room: 0.3 };
// At the end of a hairpin's ride (80 m past its apex) the view looks along the road within this (rad): it turned
// through the whole hairpin. The worst before was 0.61 and is 0.71 now, where that point is already in the next bend
const OFF_RAD = 0.8;

// In a tunnel or gallery: the least room the eye and the near plane's corners keep under the roof and to the walls (m),
// and the most the camera's height may move by a second difference in a frame (m). Before, the far chase went 2.7 m
// through the roof of the gallery at km 9.0 of the Gotthard leg, held down only at the bike's own roof; now it keeps
// 1.98 m and moves by 0.004 m
const TUBE = { roomM: 1.0, bounceM: 0.01 };
const TUBE_BOUNCE = { 'andermatt-goeschenen': 0.05, 'susten-gadmen': 0.05 };

// Rides a world's chicanes and hairpins in a node process of its own (under this VM the same rides take about fifteen
// times as long)
const SWEEP = fileURLToPath(new URL('../helpers/world-chase-sweep.mjs', import.meta.url));
async function sweep(id) {
    const { stdout } = await promisify(execFile)(process.execPath, ['--max-old-space-size=8192', SWEEP, id], { maxBuffer: 1 << 26 });
    return JSON.parse(stdout);
}

// A road along +z made of pieces of constant curvature [{length, k}] (k > 0 turns toward a larger heading), sampled
// every metre
function roadOf(pieces) {
    const points = [];
    let x = 0, z = 0, heading = 0;
    points.push({ x, y: 100, z, heading });
    for (const { length, k } of pieces) {
        for (let d = 0; d < length; d++) {
            heading += k;
            x += Math.sin(heading);
            z += Math.cos(heading);
            points.push({ x, y: 100, z, heading });
        }
    }
    return new WorldRoute(samplesOf(points, { spacing: 1 }), {});
}

describe('the road a chase camera reads (WorldCamera.roadMean)', () => {
    const T = WorldCamera.TUNING;
    // 60 degrees left on R 20 m, then 60 degrees right on R 20 m: an S of 42 m inside two straights
    const s = roadOf([{ length: 200, k: 0 }, { length: 21, k: Math.PI / 3 / 21 }, { length: 21, k: -Math.PI / 3 / 21 }, { length: 200, k: 0 }]);
    // One bend of 90 degrees on R 19 m
    const bend = roadOf([{ length: 200, k: 0 }, { length: 30, k: Math.PI / 2 / 30 }, { length: 200, k: 0 }]);

    test('through an S the mean heading moves by a part of each bend, and the swing keeps a small share', () => {
        const camera = new WorldCamera(s, { groundY: () => 100 });
        let most = 0, least = 1;
        for (let at = 150; at < 300; at += 2) {
            const mean = camera.roadMean(at, T.yawSpanMinM, 0, {});
            most = Math.max(most, Math.abs(mean.heading));
            least = Math.min(least, mean.straight);
        }
        // The road turns 60 degrees each way; the boom's heading half of that at the most
        expect(most).toBeLessThan(0.5 * Math.PI / 3);
        expect(least).toBeLessThan(0.2);
    });

    test('through one bend the mean heading turns all the way, and the swing is whole', () => {
        const camera = new WorldCamera(bend, { groundY: () => 100 });
        expect(camera.roadMean(100, T.yawSpanMinM, 0, {}).heading).toBeCloseTo(0, 6);
        expect(camera.roadMean(330, T.yawSpanMinM, 0, {}).heading).toBeCloseTo(Math.PI / 2, 2);
        for (let at = 150; at < 300; at += 2) expect(camera.roadMean(at, T.yawSpanMinM, 0, {}).straight).toBeGreaterThan(0.99);
        // On a straight the swing is whole too (the weave of world-camera-swing.test.js)
        expect(camera.roadMean(60, T.yawSpanMinM, 0, {}).straight).toBe(1);
    });

    test('the span grows with speed', () => {
        expect(T.yawSpanMinM).toBeGreaterThanOrEqual(60);
        expect(T.yawSpanMaxM).toBeGreaterThan(T.yawSpanMinM);
        expect(T.yawSpanS * 30).toBeGreaterThan(T.yawSpanMinM);
    });
});

// The stages swept: the two legs shipped before the tour and the tour's built legs (WORLD_STAGES narrows them)
const SWEPT = stagesFor();
// The chicanes each stage has at the least (a leg ridden the other way has its stage's)
const CHICANES_MIN = { tremola: 15, 'summit-airolo': 15, 'hospental-summit': 2 };
// Places where the camera still swings over the limits, by stage: each place's own ceilings (yaw acceleration, yaw
// rate), which may only fall. Down the Tremola's two stacks of hairpins the boom, behind and above the bike, closes on
// the walls of the leg above. Read from each face's plane, it came in by half in a frame (10 to 12 rad/s^2 in both
// views); read from the faces themselves (WorldCamera.wallShare) the near chase keeps under 4.2 rad/s^2, and the far
// chase's longer boom still meets the walls' tops at the first stack (.agent/system/world.md, "Down a stack of hairpins")
const KNOWN = {
    'summit-airolo': { 2324: [11.5, 2.6], 2337.7: [11.7, 2.6], 2404: [7.4, 1.8], 5220: [4.5, 1.6], 5272.7: [4.6, 1.6], 5336: [4.6, 1.6] }
};
const ceilingOf = (id, s) => Object.entries(KNOWN[id] || {}).find(([k]) => Math.abs(Number(k) - s) < 1);

describe('the chase camera through every chicane and hairpin of the shipped stages', () => {
    const results = {};
    beforeAll(async () => {
        // (three at a time: each sweep is a process that holds its whole folder's ride and land)
        for (let k = 0; k < SWEPT.length; k += 3) {
            const part = SWEPT.slice(k, k + 3);
            const swept = await Promise.all(part.map(id => sweep(id)));
            part.forEach((id, j) => { results[id] = swept[j]; });
        }
    }, 7200000);

    // (a known place is held to its own ceilings of acceleration and rate, KNOWN)
    const over = (place, view, id) => {
        const own = id ? ceilingOf(id, place.s) : null;
        const limits = own ? { ...LIMITS, accel: own[1][0], rate: own[1][1] } : LIMITS;
        return Object.entries(limits).filter(([key, most]) => (key === 'room' ? place[view][key] < most : place[view][key] > most)).map(([key]) => key);
    };

    for (const id of SWEPT) {
        test(`${id}: every chicane, in both views, swings within the limits with the bike well inside the view`, () => {
            const { chicanes } = results[id];
            expect(chicanes.length).toBeGreaterThan(CHICANES_MIN[id] ?? 3);
            const bad = [];
            for (const c of chicanes) for (const view of ['near', 'far']) if (over(c, view, id).length) bad.push({ s: c.s, view, over: over(c, view, id), ...c[view] });
            expect(bad).toEqual([]);
        });

        test(`${id}: every hairpin, in both views, swings within the limits and the camera turns through it`, () => {
            const { hairpins } = results[id];
            const bad = [];
            for (const h of hairpins) {
                for (const view of ['near', 'far']) {
                    const keys = over(h, view, id);
                    if (Math.abs(h[view].off) > OFF_RAD) keys.push('off');
                    if (keys.length) bad.push({ s: h.s, view, over: keys, ...h[view] });
                }
            }
            expect(bad).toEqual([]);
        });
    }

    test('in every tunnel and gallery of both stages the eye and the near plane keep clear of the roof and the walls, and the camera does not bounce', () => {
        // (legs 3 and 5 come in and out of the Schöllenen's and the Susten's tunnels on steeper grades: their eye's
        // height bends by up to 0.05 m a frame there, measured when they were first swept, and may only fall)
        const tubes = SWEPT.flatMap(id => results[id].tubes.map(tube => ({ ...tube, most: TUBE_BOUNCE[id] ?? TUBE.bounceM })));
        // (the Gotthard leg's tunnel at km 3.5 and its galleries at km 9.0 and 12.4; the Tremola's ride has none)
        if (results['gotthard-north']) expect(results['gotthard-north'].tubes.length).toBeGreaterThanOrEqual(3);
        const bad = [];
        for (const t of tubes) for (const view of ['near', 'far']) if (!(t[view].under >= TUBE.roomM) || !(t[view].bounce <= t.most)) bad.push({ from: t.from, to: t.to, view, ...t[view] });
        expect(bad).toEqual([]);
    });

    test('the S at km 0.5 of the Gotthard leg is one of the chicanes, and the camera through it is now calm', () => {
        if (!results['gotthard-north']) return;
        const s = results['gotthard-north'].chicanes.find(c => Math.abs(c.s - 470) < 40);
        expect(s).toBeDefined();
        // 10.2 rad/s^2 and 1.13 rad/s in the near chase before
        expect(s.near.accel).toBeLessThan(1.5);
        expect(s.near.rate).toBeLessThan(0.8);
    });
});

describe('free roam and the time trial have one chase camera', () => {
    // 150 m along +z, a bend of 90 degrees on R 19 m, and on: a road crosses 3 m over the straight line past the bend,
    // where the ride does not go
    const route = roadOf([{ length: 150, k: 0 }, { length: 30, k: Math.PI / 2 / 30 }, { length: 150, k: 0 }]);
    const overhead = (x, z, y) => (z > 165 && z < 175 && Math.abs(x) < 30 ? y + 3 : Infinity);
    const ride = (followRider, onRide) => {
        const camera = new WorldCamera(route, { groundY: () => 100 }, overhead);
        camera.followRider = followRider;
        camera.reset(0);
        const out = [];
        for (let s = 60; s < 160; s += 10 / 60) {
            const at = route.curveAt(s, {});
            const p = camera.update({ x: at.px, y: 100, z: at.pz, s, index: Math.floor(route.toUnits(s)), speed: 10, yaw: at.heading, onRide, lift: 1, offset: { x: 0, y: 3, z: -6 }, fov: 75 }, DT);
            out.push({ ...p });
        }
        return out;
    };
    const DT = 1 / 60;

    test('on the ride, free roam puts the camera where the time trial does, also where a road crosses past a bend', () => {
        const trial = ride(false, true), roam = ride(true, true);
        roam.forEach((p, i) => expect(Math.hypot(p.x - trial[i].x, p.y - trial[i].y, p.z - trial[i].z)).toBeLessThan(1e-9));
        // The trial's camera keeps about its 3 m over the road up to and into the bend
        expect(Math.min(...trial.map(p => p.y))).toBeGreaterThan(100 + 3 - 0.2);
        // Off the ride free roam reads the rider's straight line, which runs under the crossing road past the bend. It
        // reads a road overhead only over its boom there, not ahead on that line, so it does not take that road for a
        // deck to pass under (as it did on the ride too, the boom down at its head's height, T.headM over the bike)
        expect(Math.min(...ride(true, false).map(p => p.y))).toBeGreaterThan(100 + 3 - 0.2);
    });

    test('Game tells the camera whether the bike is on the ride, and a whole ride in free roam matches the time trial', async () => {
        const { fetchFn } = diskFetch();
        const env = await game.WorldEnvironment.load(new game.THREE.Scene(), { id: 'gotthard-north', search: '', fetchFn, models: null, digest: async () => '0' });
        const p = env.route.sample(500, {});
        env.update(p, 500, null, Infinity);
        await env.streamer.settle(p, 500);
        for (const mode of ['near', 'far']) {
            const trial = chaseRide(game, env, { s0: 380, s1: 620, mode }), roam = chaseRide(game, env, { s0: 380, s1: 620, mode, roam: true });
            expect(roam.length).toBe(trial.length);
            roam.forEach((r, i) => expect(Math.hypot(r.ex - trial[i].ex, r.ey - trial[i].ey, r.ez - trial[i].ez)).toBeLessThan(1e-9));
        }
    }, 600000);
});
