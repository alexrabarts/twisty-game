/**
 * @jest-environment node
 */
// The scene at a leg's end stop (js/world/stopscene.js), without a page: the bars' size, the stop of a stage, each
// rider's way in and its slot, the camera's path, the card, a skip, and the tables a new stop or rider needs.
import { describe, test, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadScript, realThree } from '../helpers/load-game.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const THREE = realThree();
const StopScene = new Function('THREE', `${loadScript('world/stopscene.js')}\nreturn StopScene;`)(THREE);
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

describe('the scene', () => {
    test('a stage with a stop at its end has it; one without, or the whole ride, has none', () => {
        expect(StopScene.stopAt({ stage: { id: 'a' }, stops: [stop] })).toBe(stop);
        expect(StopScene.stopAt({ stage: { id: 'b' }, stops: [stop] })).toBeNull();
        expect(StopScene.stopAt({ stage: null, stops: [stop] })).toBeNull();
    });

    test('each rider rides in along the ride, the stop\'s path and into its own slot, and stops there facing its slot', () => {
        const riders = [0, 1, 2].map(k => ({ bike: { character: { id: `r${k}` } }, s: 470 - k * 20, player: k === 0 }));
        const scene = new StopScene({ stop, route, riders, ground: flat });
        scene.riders.forEach((r, k) => {
            expect(r.slot).toBe(stop.slots[k]);
            const at = StopScene.along(r.way, 1e9, r.slot);
            expect(at.parked).toBe(true);
            expect(Math.hypot(at.x - r.slot.x, at.z - r.slot.z)).toBeLessThan(1e-6);
            expect(at.heading).toBe(r.slot.heading);
            expect(at.speed).toBe(0);
        });
        // One after the other, ARRIVE_GAP_S apart
        expect(scene.riders[1].start - scene.riders[0].start).toBe(StopScene.ARRIVE_GAP_S);
        // At ride speed until the last BRAKE_M, then slowing: never faster than RIDE_MS, and slower each step at the end
        const way = scene.riders[0].way;
        let last = Infinity;
        for (let t = 0; t < 30; t += 0.25) {
            const at = StopScene.along(way, t, scene.riders[0].slot);
            expect(at.speed).toBeLessThanOrEqual(StopScene.RIDE_MS);
            if (at.speed < StopScene.RIDE_MS) { expect(at.speed).toBeLessThanOrEqual(last); last = at.speed; }
        }
    });

    test('a stop that keeps its line, behind the player: it turns round past the line and rides back on the other half', () => {
        const behind = { ...stop, keepLine: true };
        const scene = new StopScene({ stop: behind, route, riders: [{ bike: {}, s: 1140, player: true }], ground: flat });
        const way = scene.riders[0].way;
        // (on past where it was on its own half of the road, -x here as every way in rides, across the road, then back
        // on the other half: +x)
        expect(Math.max(...way.points.map(p => p.z))).toBeGreaterThan(1140 + StopScene.TURN_M - 1);
        const back = way.points.filter(p => p.z < 1100 && p.z > 600);
        expect(back.length).toBeGreaterThan(50);
        for (const p of back) expect(p.x).toBeCloseTo(2.5, 5);
        expect(way.points[0].x).toBeCloseTo(-2.5, 5);
        const end = StopScene.along(way, 1e9, scene.riders[0].slot);
        expect(end.parked).toBe(true);
        expect(Math.hypot(end.x - scene.riders[0].slot.x, end.z - scene.riders[0].slot.z)).toBeLessThan(0.01);
        // (a long way in is ridden in WAY_MOST_S at the most)
        expect(end.arriveS).toBeLessThan(StopScene.WAY_MOST_S + 10);
        // A stop that does not keep its line puts the player at most BACK_M before it, as before
        const ahead = new StopScene({ stop, route, riders: [{ bike: {}, s: 1140, player: true }], ground: flat });
        expect(ahead.riders[0].way.points[0].z).toBeLessThanOrEqual(500);
    });

    test('the player rides on from its own place at the speed it crossed the line, with no jump, and parks', () => {
        const at = { x: 1.3, z: 445 };
        const scene = new StopScene({ stop, route, riders: [{ bike: {}, s: 445, player: true, at, speed: 24 }], ground: flat });
        const r = scene.riders[0];
        expect(r.way.points[0].x).toBe(at.x);
        expect(r.way.points[0].z).toBe(at.z);
        const first = StopScene.along(r.way, 0, r.slot);
        expect(first.speed).toBeCloseTo(24, 6);
        let last = Infinity, prev = first;
        for (let t = 1 / 60; t < r.way.arriveS + 1; t += 1 / 60) {
            const now = StopScene.along(r.way, t, r.slot);
            expect(now.speed).toBeLessThanOrEqual(last + 1e-9);
            // (never more than its speed's worth of way in a frame: no jump)
            expect(Math.hypot(now.x - prev.x, now.z - prev.z)).toBeLessThanOrEqual(24 / 60 + 1e-6);
            last = now.speed;
            prev = now;
        }
        expect(prev.parked).toBe(true);
        expect(Math.hypot(prev.x - r.slot.x, prev.z - r.slot.z)).toBeLessThan(1e-6);
        // A slow crossing speeds up to the ride speed and still stops in its slot
        const slow = new StopScene({ stop, route, riders: [{ bike: {}, s: 445, player: true, at, speed: 2 }], ground: flat });
        const end = StopScene.along(slow.riders[0].way, 1e9, slow.riders[0].slot);
        expect(end.parked).toBe(true);
        expect(StopScene.along(slow.riders[0].way, 0, slow.riders[0].slot).speed).toBeCloseTo(2, 6);
    });

    // The owner: "smoothly transition the camera into cinematic mode with the black bars and we fly the camera into the
    // ultimate lookout spot". No step in place, aim or lens from the chase camera's last frame to the hold
    test('the camera flies from the chase camera to the hold with no step in place, aim or lens', () => {
        const at = { x: -1.5, z: 450 };
        // A chase camera 7 m behind and 3 m over the bike, looking ahead and a little down, banked, at a wide lens
        const from = { offset: { x: 0.4, y: 3, z: -7 }, yaw: Math.PI - 0.05, pitch: -0.12, roll: 0.06, fov: 82 };
        const scene = new StopScene({ stop, route, riders: [{ bike: {}, s: 450, player: true, at, speed: 18 }], ground: flat, camera: from, aspect: 16 / 9 });
        const first = scene.step(0).camera;
        expect(first.eye.x).toBeCloseTo(at.x + from.offset.x, 9);
        expect(first.eye.y).toBeCloseTo(100 + from.offset.y, 9);
        expect(first.eye.z).toBeCloseTo(at.z + from.offset.z, 9);
        expect(first.yaw).toBeCloseTo(from.yaw, 9);
        expect(first.pitch).toBeCloseTo(from.pitch, 9);
        expect(first.roll).toBeCloseTo(from.roll, 9);
        expect(first.fov).toBeCloseTo(from.fov, 9);
        const dt = 1 / 60;
        const frames = [first];
        while (scene.t < StopScene.FLY_S + 2) frames.push(scene.step(dt).camera);
        const steps = frames.slice(1).map((c, k) => {
            const p = frames[k];
            return { move: Math.hypot(c.eye.x - p.eye.x, c.eye.y - p.eye.y, c.eye.z - p.eye.z), aim: Math.max(Math.abs(StopScene.turn(p.yaw, c.yaw)), Math.abs(c.pitch - p.pitch), Math.abs(StopScene.turn(p.roll, c.roll))), lens: Math.abs(c.fov - p.fov) };
        });
        // Each frame moves the eye no more than the bike rides in one plus the fly's own share, turns it under a degree and
        // changes the lens by under a fifth of a degree; and each frame's move is close to the one before (no kink)
        for (const st of steps) {
            expect(st.move).toBeLessThan(0.6);
            expect(st.aim).toBeLessThan(Math.PI / 180);
            expect(st.lens).toBeLessThan(0.2);
        }
        for (let k = 1; k < steps.length; k++) {
            expect(Math.abs(steps[k].move - steps[k - 1].move)).toBeLessThan(0.05);
            expect(Math.abs(steps[k].aim - steps[k - 1].aim)).toBeLessThan(0.002);
            expect(Math.abs(steps[k].lens - steps[k - 1].lens)).toBeLessThan(0.01);
        }
        // From FLY_S on it is the hold, and the hold stands EYE_CLEAR_M over the ground at least
        const hold = StopScene.holdOf(stop, flat, 16 / 9);
        const last = frames[frames.length - 1];
        expect(last.eye.x).toBeCloseTo(hold.eye.x, 9);
        expect(last.eye.z).toBeCloseTo(hold.eye.z, 9);
        expect(last.fov).toBeCloseTo(hold.fov, 9);
        expect(last.eye.y).toBeGreaterThanOrEqual(100 + StopScene.EYE_CLEAR_M - 1e-9);
        // A lookout's frame faces its view, and its hold is at the rail (`edge`: 10 m out from the middle at x 20, on +x)
        const f = StopScene.frame(stop);
        expect(f.outX).toBeCloseTo(1, 6);
        expect(f.edge).toBeGreaterThan(9);
        expect(f.edge).toBeLessThanOrEqual(10);
        expect(hold.eye.x).toBeCloseTo(f.ox + f.edge + StopScene.KINDS.lookout.hold.eye[2], 6);
        // and it looks out (east, +x: yaw -90 degrees) and down
        expect(hold.yaw).toBeCloseTo(-Math.PI / 2, 1);
        expect(hold.pitch).toBeLessThan(0);
    });

    test('a hold far away is flown to at FLY_MOST_MS on average at the most, with the card after it', () => {
        const hold = { eye: { x: 0, y: 0, z: 0 } };
        expect(StopScene.flyTime({ x: 30, y: 0, z: 0 }, hold)).toBe(StopScene.FLY_S);
        expect(StopScene.flyTime({ x: 0, y: 0, z: 650 }, hold)).toBeCloseTo(650 / StopScene.FLY_MOST_MS, 9);
        const behind = { ...stop, keepLine: true };
        const from = { offset: { x: 0, y: 3, z: -7 }, yaw: 0, pitch: 0, roll: 0, fov: 75 };
        const scene = new StopScene({ stop: behind, route, riders: [{ bike: {}, s: 1140, player: true, at: { x: -2, z: 1140 }, speed: 14 }], ground: flat, camera: from });
        expect(scene.flyS).toBeGreaterThan(StopScene.FLY_S);
        expect(scene.cardAt).toBeGreaterThanOrEqual(scene.flyS + StopScene.HOLD_FIRST_S);
        // and still no kink in its frames
        let prev = scene.step(0).camera, move = null;
        while (scene.t < scene.flyS + 1) {
            const c = scene.step(1 / 60).camera;
            const m = Math.hypot(c.eye.x - prev.eye.x, c.eye.y - prev.eye.y, c.eye.z - prev.eye.z);
            if (move !== null) expect(Math.abs(m - move)).toBeLessThan(0.05);
            move = m;
            prev = c;
        }
    });

    test('a hold with its own air eases the haze from the ride\'s with the camera, never in one frame', () => {
        const base = { perM: 1 / 4400, most: 0.94 };
        const hold = { haze: { perM: 1 / 7500 } };
        expect(StopScene.hazeAt(hold, 0, base).perM).toBeCloseTo(base.perM, 12);
        expect(StopScene.hazeAt(hold, StopScene.FLY_S, base).perM).toBeCloseTo(1 / 7500, 12);
        expect(StopScene.hazeAt(hold, 1, base).most).toBe(0.94);
        expect(StopScene.hazeAt({}, 1, base)).toBeNull();
        let last = base.perM;
        for (let t = 1 / 60; t <= StopScene.FLY_S; t += 1 / 60) {
            const now = StopScene.hazeAt(hold, t, base).perM;
            expect(Math.abs(now - last)).toBeLessThan((base.perM - 1 / 7500) / 100);
            last = now;
        }
    });

    test('a stop with its own hold flies to that place, bearing, pitch and lens', () => {
        const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'worlds/gotthard/manifest.json'), 'utf8'));
        const lookout = manifest.stops.find(s => s.id === 'gotthard-north-end');
        const row = StopScene.HOLDS[lookout.id];
        expect(row).toBeTruthy();
        // (the hold stands on the lookout's own area or within a few metres of its outline)
        const ground = (x, z) => StopScene.planeY(lookout, x, z);
        const hold = StopScene.holdOf(lookout, ground, 2.39);
        expect(hold.eye.x).toBe(row.x);
        expect(hold.eye.z).toBe(row.z);
        expect(hold.eye.y).toBeCloseTo(ground(row.x, row.z) + row.upM, 6);
        expect(hold.yaw).toBeCloseTo(-row.bearing * Math.PI / 180, 9);
        expect(hold.pitch).toBeCloseTo(row.pitch * Math.PI / 180, 9);
        // The lens shows the photo's width across a wide screen, and no more than vfovMost up and down on a tall one
        expect(StopScene.vfovOf(row.hfov, 1, row.vfovMost)).toBe(row.vfovMost);
        const wide = hold.fov * Math.PI / 180;
        expect(2 * Math.atan(Math.tan(wide / 2) * 2.39) * 180 / Math.PI).toBeCloseTo(row.hfov, 6);
        const f = StopScene.frame(lookout);
        expect(Math.hypot(row.x - f.ox, row.z - f.oz)).toBeLessThan(60);
    });

    test('the card comes up CARD_AFTER_S after the player parks; a skip puts everyone parked and off, the card up', () => {
        const riders = [0, 1, 2, 3, 4, 5].map(k => ({ bike: { character: { id: `r${k}` } }, s: 400, player: k === 0 }));
        const scene = new StopScene({ stop, route, riders, ground: flat });
        expect(scene.step(scene.cardAt - 0.1).card).toBe(false);
        expect(scene.step(0.2).card).toBe(true);
        const fresh = new StopScene({ stop, route, riders, ground: flat });
        fresh.skip();
        const frame = fresh.step(0);
        expect(frame.card).toBe(true);
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
