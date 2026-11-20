/**
 * @jest-environment node
 */
// A wheelie pops lower the faster the bike goes (Vehicle.popShare, Vehicle.WHEELIE_POP). Before, the pop was the same
// at any speed: the front came up as far at 60 m/s as at walking pace. The real Vehicle on a flat plane.
import { describe, test, expect } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';

const DT = 1 / 60;
const game = loadGame();
const { Vehicle, CHARACTERS } = game;
const POP = Vehicle.WHEELIE_POP;

// A pop at `speed` with the throttle closed after it: the lift rate it starts with and the angle 0.25 s later
function pop(speed, character = CHARACTERS[0]) {
    const v = new Vehicle(new game.THREE.Scene(), null, character, undefined, { model: false });
    v.environment = { physics: game.WorldPhysics };
    v.speed = speed;
    v.update(DT, 0, 0, 0, 1);
    const rate = v.wheelieVelocity;
    for (let i = 0; i < 15; i++) { v.speed = speed; v.update(DT, 0, 0, 0, 0); }
    return { rate, angle: v.wheelieAngle, started: v.isWheelie || v.wheelieAngle > 0 };
}

describe('a wheelie pops lower as the speed rises', () => {
    test('up to fullSpeed the pop is the whole pop, as it was', () => {
        for (const speed of [0, 3, POP.fullSpeed]) expect(Vehicle.popShare(speed)).toBe(1);
        // 3.5 rad/s x the rider's own pop, less one frame of the wheelie's gravity and damping
        const steve = CHARACTERS.find(c => c.id === 'steve');
        const rate = pop(POP.fullSpeed, steve).rate;
        expect(rate).toBeGreaterThan(3.5 * steve.physics.wheeliePop * 0.93);
        expect(rate).toBeLessThanOrEqual(3.5 * steve.physics.wheeliePop);
    });

    test('from there the front comes up less and less, down to the least from leastSpeed', () => {
        const speeds = [10, 15, 20, 30, 40, 50, 60];
        const pops = speeds.map(s => pop(s));
        for (let i = 1; i < speeds.length; i++) {
            expect(pops[i].started).toBe(true);
            expect(pops[i].rate).toBeLessThanOrEqual(pops[i - 1].rate);
            expect(pops[i].angle).toBeLessThanOrEqual(pops[i - 1].angle);
        }
        expect(pops[3].angle).toBeLessThan(pops[0].angle * 0.9);
        expect(pops[5].angle).toBeLessThan(pops[0].angle * 0.6);
        expect(Vehicle.popShare(POP.leastSpeed)).toBeCloseTo(POP.least, 12);
        expect(Vehicle.popShare(80)).toBeCloseTo(POP.least, 12);
        // No step in it
        for (let s = 0; s < 70; s += 0.5) expect(Math.abs(Vehicle.popShare(s + 0.5) - Vehicle.popShare(s))).toBeLessThan(0.02);
    });

    test('each rider keeps their own pop on top of it, in the same order at any speed', () => {
        const by = id => CHARACTERS.find(c => c.id === id);
        for (const speed of [12, 30, 55]) expect(pop(speed, by('steve')).rate).toBeGreaterThan(pop(speed, by('tim')).rate);
    });
});
