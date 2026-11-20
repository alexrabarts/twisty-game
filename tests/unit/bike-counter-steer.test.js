/**
 * @jest-environment node
 */
// The drawn handlebar at speed (Vehicle.shownBar, Vehicle.BAR): a bike is steered by its lean, so the bar is drawn as
// a real one moves. While the bike rolls into a turn the bar is pushed the other way; at a held lean it sits a little
// into the turn; at walking pace it turns with the steering. Before, the bar and the arms went left for left at any
// speed. The physics reads none of it. The real Vehicle on a flat plane, as tests/unit/world-offroad-bikes.test.js.
import { describe, test, expect } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';

const DT = 1 / 60;
const game = loadGame();
const { Vehicle } = game;
const BAR = Vehicle.BAR;

function bike(speed) {
    const v = new Vehicle(new game.THREE.Scene(), null, game.CHARACTERS[0], undefined, { model: false });
    v.environment = {
        physics: game.WorldPhysics,
        route: { unitCount: 0, fromUnits: u => u, project: () => ({ index: -1 }), sample: () => ({ grade: 0, flags: {} }) }
    };
    v.speed = speed;
    return v;
}
// Steering `steer` for `seconds` with the speed held: the drawn bar after each frame
function ride(v, steer, seconds, speed = v.speed) {
    const bars = [];
    for (let i = 0; i < seconds * 60; i++) {
        v.speed = speed;
        v.update(DT, steer, 0.3, 0, 0);
        bars.push(v.barState.shown);
    }
    return bars;
}
// The angle the front wheel is drawn turned by, about the steering axis
const drawn = (v) => {
    const q = v.frontWheel.quaternion.clone().multiply(v.steerRig.parts.find(p => p.part === v.frontWheel).quaternion.clone().invert());
    const spinless = new game.THREE.Vector3(1, 0, 0).applyQuaternion(q);
    return Math.atan2(spinless.dot(new game.THREE.Vector3(0, 0, -1)), spinless.x);
};

describe('the handlebar is drawn as a bike is steered', () => {
    test('at speed the bar goes against the steering while the bike rolls, then settles a little into the turn', () => {
        for (const side of [1, -1]) {
            const v = bike(20);
            const roll = ride(v, side, 0.4);
            // The old picture: the bar at side x 0.15 rad. Now it is pushed the other way
            const pushed = roll[roll.length - 1] * side;
            expect(pushed).toBeLessThan(-0.05);
            expect(pushed).toBeGreaterThanOrEqual(-BAR.counterMax);
            expect(Math.sign(v.leanAngle)).toBe(-side);
            // Held to the lean limit: no roll, and the bar a little into the turn, nearly straight
            const held = ride(v, side, 4);
            const steady = held[held.length - 1] * side;
            expect(steady).toBeGreaterThan(0.002);
            expect(steady).toBeLessThanOrEqual(BAR.intoMax);
            // Let go: the bike rolls back upright, so the bar goes further into the turn while it does, then straight
            const back = ride(v, 0, 0.2);
            expect(back[back.length - 1] * side).toBeGreaterThan(steady);
            const upright = ride(v, 0, 4);
            expect(Math.abs(upright[upright.length - 1])).toBeLessThan(0.002);
        }
    });

    test('the bar moves with no step from frame to frame', () => {
        const v = bike(20);
        const bars = [...ride(v, 1, 1), ...ride(v, -1, 1), ...ride(v, 0, 1)];
        let worst = 0;
        for (let i = 1; i < bars.length; i++) worst = Math.max(worst, Math.abs(bars[i] - bars[i - 1]));
        // A flick from full lean rate one way to the other takes the bar from one stop to the other, 2 degrees a frame at most
        expect(worst).toBeLessThan(0.04);
    });

    test('at walking pace the bar turns with the steering, and the two meet with no step between', () => {
        const slow = bike(1);
        const bars = ride(slow, 1, 1.5, 1);
        expect(bars[bars.length - 1]).toBeGreaterThan(0.05);
        expect(bars[bars.length - 1]).toBeCloseTo(slow.steeringAngle * Vehicle.STEER_SHOWN, 1);
        expect(Vehicle.barShown(0, 0, 0, 0.3, 1.4)).toBeCloseTo(0.3 * Vehicle.STEER_SHOWN, 12);
        // From directSpeed up, the steering angle is not in it
        expect(Vehicle.barShown(-0.4, -1, BAR.directSpeed, 0.3, 1.4)).toBe(Vehicle.barShown(-0.4, -1, BAR.directSpeed, -0.3, 1.4));
        for (let s = 0; s < 12; s += 0.05) {
            const a = Vehicle.barShown(-0.4, -1, s, 0.3, 1.4), b = Vehicle.barShown(-0.4, -1, s + 0.05, 0.3, 1.4);
            expect(Math.abs(a - b)).toBeLessThan(0.01);
        }
    });

    test('the front wheel, and the hands with it, are drawn at that angle', () => {
        const v = bike(20);
        ride(v, 1, 0.4);
        expect(drawn(v)).toBeCloseTo(v.barState.shown, 6);
    });

    test('a crashed bike keeps its bar, and a restart is not a roll', () => {
        const v = bike(20);
        ride(v, 1, 3);
        const before = v.barState.shown;
        v.crashed = true;
        v.leanAngle = 1.5;
        expect(v.shownBar(DT)).toBe(before);
        v.crashed = false;
        v.leanAngle = 0;
        expect(v.shownBar(DT)).toBe(0);
    });

    test('the physics does not read the drawn bar: the same ride with the bar held straight is the same to the last bit', () => {
        const a = bike(20), b = bike(20);
        b.shownBar = () => 0;
        const inputs = i => (i < 60 ? 1 : i < 150 ? -1 : i < 200 ? 0 : 0.5);
        for (let i = 0; i < 400; i++) {
            a.update(DT, inputs(i), 0.6, 0, 0);
            b.update(DT, inputs(i), 0.6, 0, 0);
        }
        for (const key of Vehicle.PHYSICS_STATE) expect(a[key]).toBe(b[key]);
        expect(a.position.toArray()).toEqual(b.position.toArray());
        expect(a.barState.shown).not.toBe(0);
    });
});
