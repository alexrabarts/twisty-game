// The chase camera of a world under a road that passes overhead (a bridge, a viaduct, another leg on its deck): the
// boom comes down and the camera goes through under the deck with the bike. Before, it kept its height and flew over
// the deck, with the bike out of sight under it. On a synthetic straight with a deck across it; the Tremola has
// three such places (WorldEnvironment.overheadY finds them in any world).
import { describe, test, expect } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';
import { samplesOf, straight } from '../helpers/world-synthetic.js';

const game = loadGame();
const { WorldRoute, WorldCamera } = game;

const Y = 100;
// A deck 12 m along the road, its underside UNDER_M over it
const DECK = { z0: 200, z1: 212, UNDER_M: 4.3 };
const overhead = (x, z) => (z >= DECK.z0 && z <= DECK.z1 ? Y + DECK.UNDER_M : Infinity);
const MODES = { Standard: { x: 0, y: 3, z: -6 }, 'High View': { x: 0, y: 8, z: -12 } };

function ride(offset, speed, roof) {
    const route = new WorldRoute(samplesOf(straight(400, { y: Y })), {});
    const camera = new WorldCamera(route, { groundY: () => Y }, roof ? overhead : null);
    camera.reset(0);
    const out = { over: 0, room: Infinity, step: 0, before: null, under: Infinity, after: null, floor: Infinity };
    let last = null;
    for (let z = 40; z < 390; z += speed / 60) {
        const p = camera.update({ x: 0, y: Y, z, s: z, index: Math.floor(z / 4), speed, lift: 1, offset, fov: 75 }, 1 / 60);
        const deck = overhead(p.x, p.z);
        if (deck !== Infinity) {
            if (p.y > deck) out.over++;
            out.room = Math.min(out.room, deck - p.y);
            out.under = Math.min(out.under, p.y - Y);
        }
        if (last !== null) out.step = Math.max(out.step, Math.abs(p.y - last));
        last = p.y;
        out.floor = Math.min(out.floor, p.y - Y);
        if (z < 60) out.before = p.y - Y;
        out.after = p.y - Y;
    }
    return out;
}

describe('the chase camera under a road overhead', () => {
    for (const [name, offset] of Object.entries(MODES)) {
        for (const speed of [8, 15, 30]) {
            test(`${name} at ${speed} m/s goes under the deck, never over it`, () => {
                const r = ride(offset, speed, true);
                expect(r.over).toBe(0);
                expect(r.room).toBeGreaterThanOrEqual(WorldCamera.TUNING.roofHardM - 1e-6);
                // It stays a camera: over the bike's head and over the land
                expect(r.under).toBeGreaterThanOrEqual(WorldCamera.TUNING.headM - 1e-6);
                expect(r.floor).toBeGreaterThanOrEqual(WorldCamera.FLOOR_M - 0.05);
                // Down over the approach and up again after, never as a switch: under 3.6 m/s of height at any moment
                // (a frame at 60 Hz), and back at its own height after
                expect(r.step).toBeLessThan(0.06);
                expect(r.after).toBeCloseTo(r.before, 1);
            });
        }
    }

    test('the high view flew over the deck before, and a boom that fits under it is left alone', () => {
        expect(ride(MODES['High View'], 15, false).over).toBeGreaterThan(0);
        const low = ride(MODES.Standard, 15, true), free = ride(MODES.Standard, 15, false);
        // The standard boom stands 3 m over the road: under a 4.3 m deck with roofClearM to spare, it does not move
        expect(low.under).toBeCloseTo(free.under, 2);
        // and the high view comes down only as far as the deck needs: as high as it can be under it
        const high = ride(MODES['High View'], 15, true);
        expect(high.room).toBeLessThan(WorldCamera.TUNING.roofClearM + 0.6);
        // At speed it keeps more room under the deck: lower by about roofFastM
        const slow = ride(MODES['High View'], 8, true), fast = ride(MODES['High View'], 30, true);
        expect(slow.under - fast.under).toBeGreaterThan(WorldCamera.TUNING.roofFastM * 0.7);
        expect(slow.under - fast.under).toBeLessThan(WorldCamera.TUNING.roofFastM + 0.2);
    });

    test('with open sky the camera is the same with and without the rule', () => {
        const sky = () => Infinity;
        const route = new WorldRoute(samplesOf(straight(400, { y: Y })), {});
        const a = new WorldCamera(route, { groundY: () => Y }, sky), b = new WorldCamera(route, { groundY: () => Y });
        a.reset(0); b.reset(0);
        for (let z = 100; z < 200; z += 0.25) {
            const input = { x: 0, y: Y, z, s: z, index: Math.floor(z / 4), speed: 15, lift: 1, offset: MODES['High View'], fov: 75 };
            const p = a.update(input, 1 / 60), q = b.update(input, 1 / 60);
            expect(p.y).toBeCloseTo(q.y, 9);
            expect(p.z).toBeCloseTo(q.z, 9);
        }
    });
});
