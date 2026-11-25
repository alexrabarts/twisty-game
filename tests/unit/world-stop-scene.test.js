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

    test('the camera follows the player in, then takes the kind\'s path from where it parked, over the ground', () => {
        const riders = [{ bike: { character: { id: 'p' } }, s: 470, player: true }];
        const scene = new StopScene({ stop, route, riders, ground: flat });
        const early = scene.step(0.5);
        // behind the player: the eye further back along its heading than the bike
        expect(early.camera.eye.z).toBeLessThan(early.riders[0].z);
        scene.step(scene.playerParkedS - scene.t + 0.01);
        const keys = StopScene.KINDS.lookout.camera;
        const f = StopScene.frame(stop);
        const first = scene.step(0).camera.eye;
        expect(first.x).toBeCloseTo(f.ox + keys[0].eye[0] * f.sideX + keys[0].eye[2] * f.outX, 0);
        // a lookout's frame faces its view
        expect(f.outX).toBeCloseTo(1, 6);
        // with `edge`, out is measured from the outline (10 m out from the middle at x 20, on +x)
        expect(f.edge).toBeGreaterThan(9);
        expect(f.edge).toBeLessThanOrEqual(10);
        const late = StopScene.cameraAt(stop, 1e9, flat);
        expect(late.eye.y).toBeGreaterThanOrEqual(100 + StopScene.EYE_CLEAR_M);
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

describe('the tables', () => {
    test('every stop kind of the importer has a camera path; the owner\'s three riders vape, and nobody else', () => {
        const kinds = fs.readFileSync(path.join(REPO, 'tools/world/stops.mjs'), 'utf8').match(/STOP_KINDS = Object\.freeze\(\[([^\]]+)\]/)[1].match(/'(\w+)'/g).map(k => k.slice(1, -1));
        for (const kind of kinds) expect(StopScene.KINDS[kind].camera.length).toBeGreaterThan(1);
        expect(CHARACTERS.filter(c => (c.stop || []).includes('vape')).map(c => c.id).sort()).toEqual(['guy', 'lucy', 'tim']);
    });

    test('each shipped stop draws its area and a lookout its rail', () => {
        const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'worlds/gotthard/manifest.json'), 'utf8'));
        for (const s of manifest.stops) expect(StopScene.areaGeometry(s).positions.length).toBeGreaterThan(0);
        const lookout = manifest.stops.find(s => s.kind === 'lookout');
        expect(StopScene.propsGeometry(lookout).positions.length).toBeGreaterThan(0);
    });
});
