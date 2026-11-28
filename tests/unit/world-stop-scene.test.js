/**
 * @jest-environment node
 */
// The scene at a leg's end stop (js/world/stopscene.js, js/world/endshot.js), without a page: the bars' size, the stop
// of a stage, who comes in, the bays, each rider's ride into its bay, the camera's one shot, the composed view, the
// card, a skip, and the tables a new stop or rider needs. tests/unit/world-end-shot.test.js rides into every leg's end.
import { describe, test, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadScript, realThree } from '../helpers/load-game.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const THREE = realThree();
const { EndShot, StopScene } = new Function('THREE', `${loadScript('world/endshot.js')}\n${loadScript('world/stopscene.js')}\nreturn { EndShot, StopScene };`)(THREE);
const CHARACTERS = new Function('THREE', 'document', `${loadScript('vehicle.js')}\nreturn CHARACTERS;`)(THREE, { createElement: () => ({ getContext: () => null }) });

// A straight ride north along +z, 10 m wide, and a stop beside it at s 500 with its slots in a row 20 m out
const route = { sample(s, out) { out.x = 0; out.z = s; out.y = 0; out.heading = 0; out.width = 10; return out; } };
const stop = {
    id: 'a-end', kind: 'lookout', stage: 'a', at: 'end', s: 500, side: 1, access: 'direct', x: 20, z: 510,
    ring: [[10, 495], [30, 495], [30, 525], [10, 525], [10, 495]], path: [[0, 500]],
    slots: [0, 1, 2, 3, 4, 5, 6, 7].map(k => ({ x: 20, z: 502 + k * 2.2, heading: Math.PI / 2 })),
    plane: { y: 100, gx: 0, gz: 0 }, view: Math.PI / 2
};
const flat = () => 100;

describe('the bars', () => {
    test('as near 2.39:1 as the screen gives, at most BAR_MOST of its height', () => {
        expect(StopScene.barPx(1920, 1080)).toBe(Math.round(1080 * StopScene.BAR_MOST));
        expect(StopScene.barPx(2560, 1080)).toBe(Math.round((1080 - 2560 / StopScene.ASPECT) / 2));
        expect(StopScene.barPx(3000, 1000)).toBe(0);
        expect(StopScene.barPx(390, 844)).toBe(Math.round(844 * StopScene.BAR_MOST));
    });
});

// Two bikes ({x, z, heading}, 2.2 by 0.8 m) overlap in plan
function overlap(a, b) {
    const half = [1.1, 0.4];
    const corners = p => [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([u, v]) => [p.x + Math.sin(p.heading) * u * half[0] + Math.cos(p.heading) * v * half[1], p.z + Math.cos(p.heading) * u * half[0] - Math.sin(p.heading) * v * half[1]]);
    const ca = corners(a), cb = corners(b);
    for (const h of [a.heading, a.heading + Math.PI / 2, b.heading, b.heading + Math.PI / 2]) {
        const pa = ca.map(([x, z]) => x * Math.sin(h) + z * Math.cos(h)), pb = cb.map(([x, z]) => x * Math.sin(h) + z * Math.cos(h));
        if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false;
    }
    return true;
}

const forward = c => [-Math.sin(c.yaw) * Math.cos(c.pitch), Math.sin(c.pitch), -Math.cos(c.yaw) * Math.cos(c.pitch)];
const turnDeg = (a, b) => { const p = forward(a), q = forward(b); return Math.acos(Math.min(1, p[0] * q[0] + p[1] * q[1] + p[2] * q[2])) * 180 / Math.PI; };

// The player at the line 60 m before the turn-in at 18 m/s, its chase camera 6 m behind and 3 m over it, and the group
// behind it at `gaps` metres
const chase = { offset: { x: 0, y: 3, z: -6 }, yaw: Math.PI, pitch: -0.15, roll: 0.03, fov: 72 };
const ridersOf = (gaps, s = 440) => [
    { bike: { character: { id: 'player' } }, s, player: true, at: { x: -2.5, z: s }, speed: 18, yaw: 0, lean: 0.04 },
    ...gaps.map((g, k) => ({ bike: { character: { id: `r${k}` } }, s: s - g, at: { x: -2.5 + (k % 2 ? 0.8 : -0.8), z: s - g }, speed: 14, yaw: 0, lean: 0 }))
];

describe('the scene', () => {
    test('a stage with a stop at its end has it; one without, or the whole ride, has none', () => {
        expect(StopScene.stopAt({ stage: { id: 'a' }, stops: [stop] })).toBe(stop);
        expect(StopScene.stopAt({ stage: { id: 'b' }, stops: [stop] })).toBeNull();
        expect(StopScene.stopAt({ stage: null, stops: [stop] })).toBeNull();
    });

    // The owner: "hopefully with the others if they've kept up". Kept up: behind the player at the line within keepM
    // and keepS of its own pace, or ahead of it and not far past the turn-in
    test('the riders that kept up come in; the ones far behind or far past the stop do not', () => {
        const T = EndShot.TUNING;
        const player = { s: 440, speed: 18 };
        const kept = EndShot.keep(stop, player, [
            { s: 430, speed: 14 }, { s: 440 - 250, speed: 14 }, { s: 440 - 290, speed: 14 }, { s: 440 - 310, speed: 20 },
            { s: 440 - 150, speed: 5 }, { s: 470, speed: 14 }, { s: stop.s + T.aheadPastM + 10, speed: 14 }, { s: NaN, speed: 0 }
        ]);
        // (290 m at 14 m/s is 21 s: not kept; 150 m at 5 m/s is 30 s, but keepLeastMs counts it at 8 m/s: 19 s)
        expect(kept).toEqual([true, true, false, false, true, true, false, false]);
        const scene = new StopScene({ stop, route, riders: ridersOf([15, 30, 600]), ground: flat });
        expect(scene.riders.length).toBe(3);
        expect(scene.left.map(r => r.bike.character.id)).toEqual(['r2']);
    });

    // The bays are the stop's own slots (manifest.stops[].slots, the table the next leg's start reads), a tidy row,
    // faced toward the view where the area has room behind the row for the aisle
    test('the bays: a row of the stop\'s slots side by side, faced to the view, filled from the far end of the aisle', () => {
        const plan = EndShot.bays(stop, 5, { x: 1, z: 0 });
        expect(plan.fallback).toBe(false);
        expect(plan.bays).toHaveLength(5);
        for (const b of plan.bays) {
            expect(stop.slots.some(s => s.x === b.x && s.z === b.z)).toBe(true);
            // (the view lies +x: the bikes face it)
            expect(Math.sin(b.heading)).toBeCloseTo(1, 6);
        }
        const zs = plan.bays.map(b => b.z).sort((a, b) => a - b);
        for (let k = 1; k < zs.length; k++) expect(zs[k] - zs[k - 1]).toBeCloseTo(2.2, 6);
        // (the way in reaches the aisle at its z 500 end: the first to come takes the far bay)
        expect(plan.bays[0].z).toBe(Math.max(...zs));
        // Every way into a bay is inside the area by marginM from where it meets the aisle
        plan.bays.forEach((b, k) => expect(EndShot.within(stop.ring, plan.approach(k).slice(1), EndShot.TUNING.marginM)).toBe(true));
        // A view the other way turns the bikes round
        expect(Math.sin(EndShot.bays(stop, 5, { x: -1, z: 0 }).bays[0].heading)).toBeCloseTo(-1, 6);
    });

    test('every rider rides in from its own place, parks in its bay facing its way, and no two bikes overlap', () => {
        const scene = new StopScene({ stop, route, riders: ridersOf([12, 25, 40, 70]), ground: flat });
        expect(scene.riders).toHaveLength(5);
        const player = scene.riders[scene.playerIndex];
        // (from its own place at the speed it crossed the line)
        const first = scene.step(0).riders[scene.playerIndex];
        expect(first.x).toBeCloseTo(-2.5, 6);
        expect(first.z).toBeCloseTo(440, 6);
        expect(first.speed).toBeCloseTo(18, 6);
        let prev = scene.step(0).riders, worstStep = 0;
        while (scene.t < scene.cardAt + 0.5) {
            const frame = scene.step(1 / 60);
            const bikes = frame.riders;
            for (let i = 0; i < bikes.length; i++) {
                worstStep = Math.max(worstStep, Math.hypot(bikes[i].x - prev[i].x, bikes[i].z - prev[i].z));
                for (let j = i + 1; j < bikes.length; j++) expect({ t: scene.t, i, j, overlap: overlap(bikes[i], bikes[j]) }).toEqual({ t: scene.t, i, j, overlap: false });
            }
            prev = bikes;
        }
        // (no bike jumps: no more than its own speed's worth in a frame)
        expect(worstStep).toBeLessThan(18 / 60 + 1e-6);
        const end = scene.step(0).riders;
        scene.riders.forEach((r, k) => {
            expect(end[k].parked).toBe(true);
            expect(end[k].stand).toBe(true);
            expect(end[k].speed).toBe(0);
            expect(Math.hypot(end[k].x - r.slot.x, end[k].z - r.slot.z)).toBeLessThan(0.05);
            expect(Math.abs(EndShot.turn(end[k].heading, r.slot.heading))).toBeLessThan(0.02);
        });
        // The player at the group's pace once eased down from the line, and calm over the last calmLastM into its bay
        const T = EndShot.TUNING;
        const way = scene.riders[scene.playerIndex].way;
        for (let t = 4; t < scene.playerParkedS; t += 0.25) {
            const at = EndShot.trackAt(scene.ride, scene.playerIndex, t);
            expect(at.speed).toBeLessThanOrEqual(T.fastMs + 1e-6);
            if (way.length - at.m <= T.calmLastM) expect(at.speed).toBeLessThanOrEqual(T.calmMs + 1e-6);
        }
        expect(player.slot).toBe(scene.plan.bays[scene.playerIndex]);
    });

    // The owner: "position the camera for the great view all in one smooth, continuous camera shot"
    test('the camera: the chase camera at the line, the ride in behind the player, the crane to the view, no jump, then still', () => {
        const scene = new StopScene({ stop, route, riders: ridersOf([15, 30]), ground: flat, camera: chase, aspect: 16 / 9 });
        const first = scene.step(0).camera;
        expect(first.eye.x).toBeCloseTo(-2.5 + chase.offset.x, 9);
        expect(first.eye.y).toBeCloseTo(100 + chase.offset.y, 6);
        expect(first.eye.z).toBeCloseTo(440 + chase.offset.z, 9);
        expect(first.yaw).toBeCloseTo(chase.yaw, 9);
        expect(first.pitch).toBeCloseTo(chase.pitch, 9);
        expect(first.fov).toBeCloseTo(chase.fov, 9);
        expect(scene.craneAt).toBeGreaterThan(EndShot.TUNING.joinS);
        expect(scene.cardAt).toBeGreaterThanOrEqual(scene.flyS + EndShot.TUNING.holdFirstS);
        let prev = first, held = null, inView = 0, frames = 0;
        while (scene.t < scene.cardAt + 1) {
            const frame = scene.step(1 / 60), c = frame.camera;
            expect(Math.hypot(c.eye.x - prev.eye.x, c.eye.y - prev.eye.y, c.eye.z - prev.eye.z)).toBeLessThan(0.6);
            expect(turnDeg(prev, c)).toBeLessThan(1.5);
            expect(Math.abs(c.fov - prev.fov)).toBeLessThan(0.2);
            expect(c.eye.y).toBeGreaterThan(100.3);
            // (following the ride in, the player's bike is in the picture)
            if (scene.t > 1 && scene.t < scene.craneAt) {
                const bike = frame.riders[scene.playerIndex];
                const q = EndShot.project(c.eye, c.yaw, c.pitch, c.fov, 16 / 9, { x: bike.x, y: 100.8, z: bike.z });
                frames++;
                if (q && Math.abs(q.x) < 0.9 && Math.abs(q.y) < 0.9) inView++;
            }
            if (frame.held) {
                if (held) expect([c.eye.x, c.eye.y, c.eye.z, c.yaw, c.pitch]).toEqual([held.eye.x, held.eye.y, held.eye.z, held.yaw, held.pitch]);
                else held = c;
                expect(frame.card).toBe(scene.t >= scene.cardAt);
            } else expect(frame.card).toBe(false);
            prev = c;
        }
        expect(inView).toBe(frames);
        expect(held.eye).toEqual(scene.hold.eye);
    });

    // The view: the parked bikes and riders in the foreground lower third, to one side (the card comes up on the
    // other), the view beyond, whichever way the row of bays runs
    test('the composed view holds every bike and rider low in the picture, to one side, on any row and screen', () => {
        for (let turn = 0; turn < 360; turn += 30) {
            const a = turn * Math.PI / 180;
            const slots = [0, 1, -1, 2, -2, 3, -3, 4].map(k => ({ x: 20 + Math.sin(a) * k * 2.2, z: 510 + Math.cos(a) * k * 2.2, heading: a + Math.PI / 2 }));
            const ring = [[-14, -14], [14, -14], [14, 14], [-14, 14], [-14, -14]].map(([x, z]) => [20 + x, 510 + z]);
            const park = { ...stop, id: 'c-end', kind: 'carpark', slots, ring, path: [[0, 500]] };
            for (const aspect of [16 / 9, 4 / 3]) {
                const plan = EndShot.bays(park, 6, null);
                const hold = EndShot.compose(park, plan.bays, flat, aspect);
                expect({ turn, aspect, composed: !!hold }).toEqual({ turn, aspect, composed: true });
                const ys = [];
                for (const b of plan.bays) for (const along of [-1.1, 1.1]) for (const up of [0, 1.2]) {
                    const q = EndShot.project(hold.eye, hold.yaw, hold.pitch, hold.fov, aspect, { x: b.x + Math.sin(b.heading) * along, y: 100 + up, z: b.z + Math.cos(b.heading) * along });
                    expect({ turn, aspect, inside: !!q && Math.abs(q.x) <= 0.95 && q.y >= -0.76 && q.y <= 0.1 }).toEqual({ turn, aspect, inside: true });
                    expect(q.x * hold.side).toBeGreaterThan(-0.09);
                    ys.push(q.y);
                }
                // (low in the picture: their middle in the lower third)
                expect(ys.reduce((n, y) => n + y, 0) / ys.length).toBeLessThan(-1 / 3 + 0.1);
                expect(hold.pitch).toBeGreaterThanOrEqual(EndShot.TUNING.pitchLeastDeg * Math.PI / 180 - 1e-9);
            }
        }
    });

    test('a view blocked by a wall in front of the bays is not taken', () => {
        const plan = EndShot.bays(stop, 4, { x: 1, z: 0 });
        const open = EndShot.compose(stop, plan.bays, flat);
        // A wall 12 m high across the composed view's line to the bays
        const mx = plan.bays.reduce((n, b) => n + b.x, 0) / plan.bays.length, mz = plan.bays.reduce((n, b) => n + b.z, 0) / plan.bays.length;
        const ex = (open.eye.x + mx) / 2, ez = (open.eye.z + mz) / 2, dx = mz - open.eye.z, dz = -(mx - open.eye.x), l = Math.hypot(dx, dz);
        const faces = { data: Float64Array.from([ex - dx / l * 30, ez - dz / l * 30, ex + dx / l * 30, ez + dz / l * 30, 112, 112, 90, 90, 0]), count: 1 };
        const other = EndShot.compose(stop, plan.bays, flat, 16 / 9, faces);
        expect(other).toBeTruthy();
        expect(Math.hypot(other.eye.x - open.eye.x, other.eye.z - open.eye.z)).toBeGreaterThan(1);
        for (const b of plan.bays) expect(EndShot.faceShare(faces, other.eye, { x: b.x, y: 100.9, z: b.z }, 0)).toBe(1);
    });

    // Traffic parks a rider that rides off the end of the stage out of sight: it finished first, and waits in its bay
    test('a rider out of sight ahead of the player at the line is parked in the furthest bay from the start', () => {
        const riders = ridersOf([15]);
        riders.push({ bike: { character: { id: 'first' } }, s: 470, at: { x: -2.5, z: 470 }, speed: 0, yaw: 0, lean: 0, hidden: true });
        const scene = new StopScene({ stop, route, riders, ground: flat, camera: chase });
        const k = scene.riders.findIndex(r => r.bike.character.id === 'first');
        expect(k).toBe(0);
        const at = scene.step(0).riders[k];
        expect(at.parked).toBe(true);
        expect(Math.hypot(at.x - scene.riders[k].slot.x, at.z - scene.riders[k].slot.z)).toBeLessThan(0.05);
        expect(Math.abs(EndShot.turn(at.heading, scene.riders[k].slot.heading))).toBeLessThan(0.02);
    });

    test('a stop that keeps its line, behind the player: it turns round, rides back and parks', () => {
        const behind = { ...stop, keepLine: true };
        const scene = new StopScene({ stop: behind, route, riders: [{ bike: {}, s: 1140, player: true, at: { x: -2.5, z: 1140 }, speed: 14, yaw: 0 }], ground: flat, camera: chase });
        const way = scene.riders[0].way;
        expect(Math.max(...way.z)).toBeGreaterThan(1140 + 11);
        const end = EndShot.trackAt(scene.ride, 0, 1e9);
        expect(Math.hypot(end.x - scene.riders[0].slot.x, end.z - scene.riders[0].slot.z)).toBeLessThan(0.05);
        expect(scene.cardAt).toBeGreaterThanOrEqual(scene.flyS + EndShot.TUNING.holdFirstS);
        let prev = scene.step(0).camera;
        while (scene.t < scene.cardAt) {
            const c = scene.step(1 / 60).camera;
            expect(Math.hypot(c.eye.x - prev.eye.x, c.eye.y - prev.eye.y, c.eye.z - prev.eye.z)).toBeLessThan(0.8);
            expect(turnDeg(prev, c)).toBeLessThan(1.5);
            prev = c;
        }
    });

    test('a stop with a hand-set shot holds that place, bearing, pitch and lens; a photo\'s hold sets the way it looks', () => {
        const own = { ...stop, id: 'd-end', shot: { x: 5, z: 520, upM: 4, bearing: 80, pitch: -6, hfov: 66 } };
        const hold = EndShot.compose(own, EndShot.bays(own, 3).bays, flat, 16 / 9);
        expect([hold.eye.x, hold.eye.y, hold.eye.z]).toEqual([5, 104, 520]);
        expect(hold.yaw).toBeCloseTo(-80 * Math.PI / 180, 9);
        expect(hold.pitch).toBeCloseTo(-6 * Math.PI / 180, 9);
        // A photo's hold (bearing 90: east, +x): the composed view looks within yawMostDeg of it
        const photo = { ...stop, id: 'e-end', hold: { x: 31, z: 510, upM: 1.6, bearing: 90, pitch: -6, hfov: 70 } };
        const views = EndShot.views(photo, { x: 20, z: 510 }, flat);
        expect(views[0].x).toBeCloseTo(1, 6);
        const held = EndShot.compose(photo, EndShot.bays(photo, 4, views[0]).bays, flat, 16 / 9);
        expect(Math.abs(EndShot.turn(held.yaw, -Math.PI / 2))).toBeLessThanOrEqual(EndShot.TUNING.yawMostDeg * Math.PI / 180 + 1e-9);
    });

    // The owner's shots at Goschenen and the Tremola followed 60 to 80 s of access road. A long way in is ridden at the
    // group's pace where it is straight, and the camera follows at most followMostS before it cranes to the held view
    // (the rest of the ride, unseen, runs fast: the next test)
    test('a long way in: the group\'s pace on the straight, and the crane from followMostS', () => {
        const T = EndShot.TUNING;
        const far = { ...stop, keepLine: true };
        const scene = new StopScene({ stop: far, route, riders: [{ bike: {}, s: 1140, player: true, at: { x: -2.5, z: 1140 }, speed: 14, yaw: 0 }], ground: flat, camera: chase });
        expect(scene.playerParkedS).toBeGreaterThan(T.followMostS + T.craneLeadS);
        expect(scene.craneAt).toBeLessThanOrEqual(T.followMostS + 1e-9);
        expect(scene.flyS).toBeLessThanOrEqual(T.followMostS + T.craneLongMostS + 1e-6);
        let top = 0;
        for (let t = 0; t < scene.playerParkedS; t += 0.25) top = Math.max(top, EndShot.trackAt(scene.ride, 0, t).speed);
        expect(top).toBeGreaterThan(T.calmMs + 4);
        expect(top).toBeLessThanOrEqual(Math.max(14, T.fastMs) + 1e-6);
    });

    // Once the camera holds, a ride that no one sees runs WARP times as fast: the held view does not wait 20 s for a
    // player still on the access road. Seen, every rider rides at its own pace
    test('once held, the ride runs fast while nobody riding is in the held view, and at its own pace while seen', () => {
        const far = { ...stop, keepLine: true };
        const scene = new StopScene({ stop: far, route, riders: [{ bike: {}, s: 1140, player: true, at: { x: -2.5, z: 1140 }, speed: 14, yaw: 0 }], ground: flat, camera: chase });
        let card = null, fast = 0, seenFast = 0, last = 0;
        while (scene.t < scene.cardAt + 1 && card === null) {
            const frame = scene.step(1 / 60);
            const ran = scene.rideT - last;
            last = scene.rideT;
            if (ran > 1 / 60 + 1e-9) {
                fast++;
                if (scene.inHold(frame.riders[0]) && !frame.riders[0].parked) seenFast++;
            }
            if (frame.card) card = scene.t;
        }
        expect(card).not.toBeNull();
        expect(card).toBeGreaterThanOrEqual(scene.flyS + EndShot.TUNING.holdFirstS);
        // (the card before the ride's own clock would have had it: the unseen part of the ride ran fast)
        if (fast) expect(card).toBeLessThan(scene.cardAt);
        // (a frame that ran fast had nobody riding in view at its start: at most the one frame a rider rides into view)
        expect(seenFast).toBeLessThanOrEqual(1);
    });

    test('a hold with its own air eases the haze from the ride\'s with the crane, never in one frame', () => {
        const base = { perM: 1 / 4400, most: 0.94 };
        const hold = { haze: { perM: 1 / 7500 } };
        expect(StopScene.hazeAt(hold, 5, base, 15, 5).perM).toBeCloseTo(base.perM, 12);
        expect(StopScene.hazeAt(hold, 15, base, 15, 5).perM).toBeCloseTo(1 / 7500, 12);
        expect(StopScene.hazeAt(hold, 6, base, 15, 5).most).toBe(0.94);
        expect(StopScene.hazeAt({}, 1, base, 15, 5)).toBeNull();
        let last = base.perM;
        for (let t = 5; t <= 15; t += 1 / 60) {
            const now = StopScene.hazeAt(hold, t, base, 15, 5).perM;
            expect(Math.abs(now - last)).toBeLessThan((base.perM - 1 / 7500) / 100);
            last = now;
        }
    });

    test('a stop with its own photo hold keeps it as the fallback, at that place, bearing, pitch and lens', () => {
        const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'worlds/gotthard/manifest.json'), 'utf8'));
        const lookout = manifest.stops.find(s => s.id === 'gotthard-north-end');
        const row = StopScene.HOLDS[lookout.id];
        expect(row).toBeTruthy();
        const ground = (x, z) => StopScene.planeY(lookout, x, z);
        const hold = StopScene.holdOf(lookout, ground, 2.39);
        expect(hold.eye.x).toBe(row.x);
        expect(hold.eye.z).toBe(row.z);
        expect(hold.eye.y).toBeCloseTo(ground(row.x, row.z) + row.upM, 6);
        expect(hold.yaw).toBeCloseTo(-row.bearing * Math.PI / 180, 9);
        expect(hold.pitch).toBeCloseTo(row.pitch * Math.PI / 180, 9);
        expect(StopScene.vfovOf(row.hfov, 1, row.vfovMost)).toBe(row.vfovMost);
        const wide = hold.fov * Math.PI / 180;
        expect(2 * Math.atan(Math.tan(wide / 2) * 2.39) * 180 / Math.PI).toBeCloseTo(row.hfov, 6);
    });

    test('the card waits for the held view and every rider off; a skip puts everyone parked and off, the card up', () => {
        const riders = ridersOf([10, 20, 30, 40, 50]);
        const scene = new StopScene({ stop, route, riders, ground: flat, camera: chase });
        expect(scene.cardAt).toBeGreaterThanOrEqual(scene.allParkedS + StopScene.GET_OFF_S);
        expect(scene.step(scene.cardAt - 0.1).card).toBe(false);
        expect(scene.step(0.2).card).toBe(true);
        const fresh = new StopScene({ stop, route, riders, ground: flat, camera: chase });
        fresh.skip();
        const frame = fresh.step(0);
        expect(frame.card).toBe(true);
        expect(frame.camera.eye).toEqual(fresh.hold.eye);
        frame.riders.forEach(r => { expect(r.parked).toBe(true); expect(r.stand).toBe(true); });
    });
});

// The tour's legs (js/world/tour.js): each ends at its end stop and starts at its start stop as it is ridden, the
// data turned round for a leg ridden against its stage (WorldData.useStage)
describe('the stops of the tour\'s legs', () => {
    const { WorldData, WorldTour } = new Function(`${loadScript('world/tour.js')}\n${loadScript('world/data.js')}\nreturn { WorldData, WorldTour };`)();
    const view = (leg) => {
        const read = f => JSON.parse(fs.readFileSync(path.join(REPO, leg.folder, f), 'utf8'));
        const data = new WorldData({ base: leg.folder });
        data.manifest = read('manifest.json');
        data.ride = read('ride.json');
        data.junctions = read('graph/junctions.json');
        data.edges = data.ride.path.reduce((out, use) => { out[use.edgeId] = { length: 0 }; return out; }, []);
        data.file = { ride: data.ride, junctions: data.junctions, places: data.manifest.places, structures: data.manifest.structures, landmarks: data.manifest.landmarks, stops: data.manifest.stops, junctionS: data.manifest.junctions };
        data.useStage(data.manifest.stages.find(s => s.id === leg.id));
        return data;
    };

    for (const leg of WorldTour.built()) {
        test(`leg ${leg.n} (${leg.id}): one stop at its start, one at its end, its finish line leadM before the end's turn-in`, () => {
            const data = view(leg);
            const env = { stage: data.stage, stops: data.manifest.stops };
            const end = StopScene.stopAt(env);
            expect(end).toBeTruthy();
            if (leg.end) expect(end.id).toBe(leg.end);
            expect(data.manifest.stops.filter(s => s.at === 'start')).toHaveLength(1);
            if (leg.start) expect(data.manifest.stops.find(s => s.at === 'start').id).toBe(leg.start);
            // (the turn-in after the line, by the importer's lead: tools/world/stops.mjs STOP.leadM)
            expect(end.s - data.stage.to).toBeCloseTo(60, 0);
            expect(end.keepLine).toBeUndefined();
            expect(data.stage.from).toBeLessThan(data.stage.to);
        });
    }

    test('leg 1 ends at the lookout and holds the lookout\'s photo-matched shot, as the Gotthard leg does', () => {
        const data = view(WorldTour.built()[0]);
        const end = StopScene.stopAt({ stage: data.stage, stops: data.manifest.stops });
        expect(end.kind).toBe('lookout');
        const ground = (x, z) => StopScene.planeY(end, x, z);
        const hold = StopScene.holdOf(end, ground, 2.39);
        const row = StopScene.HOLDS['gotthard-north-end'];
        expect([hold.eye.x, hold.eye.z]).toEqual([row.x, row.z]);
        expect(hold.yaw).toBeCloseTo(-row.bearing * Math.PI / 180, 9);
        expect(hold.haze).toEqual({ perM: expect.closeTo(1 / 7500, 8) });
    });
});

describe('the tables', () => {
    test('every stop kind of the importer has a hold; the owner\'s three riders vape, and nobody else', () => {
        const kinds = fs.readFileSync(path.join(REPO, 'tools/world/stops.mjs'), 'utf8').match(/STOP_KINDS = Object\.freeze\(\[([^\]]+)\]/)[1].match(/'(\w+)'/g).map(k => k.slice(1, -1));
        for (const kind of kinds) {
            const hold = StopScene.KINDS[kind].hold;
            expect(hold.eye.length).toBe(3);
            expect(hold.look.length).toBe(3);
            expect(hold.hfov).toBeGreaterThan(20);
        }
        expect(CHARACTERS.filter(c => (c.stop || []).includes('vape')).map(c => c.id).sort()).toEqual(['guy', 'lucy', 'tim']);
    });

    test('the held shot never draws less than the level in force, and raises something at every level', () => {
        const Quality = new Function(`${loadScript('quality.js')}\nreturn Quality;`)();
        for (const level of Quality.LEVELS) {
            const raise = StopScene.RAISE[level.id];
            expect(raise).toBeTruthy();
            expect(Object.keys(raise).length).toBeGreaterThan(0);
            for (const key of ['treeShare', 'treeNear', 'pixelRatio', 'shadowMap', 'msaa', 'effectMs']) {
                if (raise[key] !== undefined) expect(raise[key]).toBeGreaterThanOrEqual(level[key]);
            }
            if (raise.tileLodM) {
                expect(raise.tileLodM[0]).toBeGreaterThanOrEqual(700);
                expect(raise.tileLodM[1]).toBeGreaterThan(raise.tileLodM[0]);
            }
            for (const key of ['treeNearM', 'treeMidM', 'triangleScale']) if (raise[key] !== undefined) expect(raise[key]).toBeGreaterThan(key === 'triangleScale' ? 1 : 100);
            if (raise.treeNear !== undefined) expect(raise.treeNear).toBeLessThanOrEqual(48);
        }
        // The levels a phone or a tablet starts at raise nothing that costs every frame's pixels, samples or effects
        for (const id of ['lowest', 'low', 'medium', 'high']) for (const key of ['pixelRatio', 'shadowMap', 'msaa', 'effectMs']) expect(StopScene.RAISE[id][key]).toBeUndefined();
    });

    test('each shipped stop draws its area and a lookout its rail', () => {
        const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'worlds/gotthard/manifest.json'), 'utf8'));
        for (const s of manifest.stops) expect(StopScene.areaGeometry(s).positions.length).toBeGreaterThan(0);
        const lookout = manifest.stops.find(s => s.kind === 'lookout');
        expect(StopScene.propsGeometry(lookout).positions.length).toBeGreaterThan(0);
    });
});
