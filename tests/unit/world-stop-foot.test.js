// A stop ends with a foot down (WorldPhysics.stopLean; .agent/system/handling.md, "A stop ends with a foot down").
// Braking to a stop with a steer key held or tapped, as a rider does in a bend or at a standstill, leans the bike no
// further than the turn at that speed holds, and under fallSpeed the steering lays it over no further than stopLean
// of tipLeanDeg. The fall at walking pace needs real lean: a U-turn at full lock that runs out of speed still tips.
// (The owner fell over three times in 15 minutes stopping on an easy road, a steer key held: the lean rose to
// lowLeanDeg as the bike slowed, and it tipped under fallSpeed.)
import { describe, test, expect } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';

const DT = 1 / 60;
const game = loadGame();
const { WorldPhysics } = game;

function bike(speed) {
    const v = new game.Vehicle(new game.THREE.Scene());
    v.environment = { physics: WorldPhysics, route: { unitCount: 0, fromUnits: u => u, project: () => ({ index: -1 }), sample: () => ({ grade: 0, flags: {} }) } };
    v.speed = speed;
    return v;
}

// From `from` m/s for 10 s, the steering and the brake as functions of the time and the bike: {crashed, cause, most, speed, footDown}
function ride(from, steer, brake) {
    const v = bike(from);
    let most = 0;
    for (let tick = 0; tick < 60 * 10 && !v.crashed; tick++) {
        v.update(DT, steer(tick * DT, v), 0, brake(tick * DT, v), 0);
        most = Math.max(most, Math.abs(v.leanAngle) * 180 / Math.PI);
    }
    return { crashed: v.crashed, cause: v.crashCause, most, speed: v.speed, footDown: v.footDown };
}

const stopped = r => [r.crashed, r.speed, r.footDown];

describe('a stop ends with a foot down', () => {
    test('braking to a stop with a steer key held, half held, or tapped, at full or half brake', () => {
        const rides = [];
        for (const key of [1, 0.5, 0.25]) for (const brake of [1, 0.5]) rides.push([`key ${key}, brake ${brake}`, ride(10, () => key, () => brake)]);
        for (const on of [0.1, 0.2]) rides.push([`key tapped ${on} s in 0.2 s`, ride(10, t => (t % (on + 0.2) < on ? 1 : 0), () => 1)]);
        for (const at of [3, 2, 1.5, 1]) {
            let t0 = null;
            rides.push([`a 0.2 s tap at ${at} m/s`, ride(8, (t, v) => { if (t0 === null && v.speed <= at) t0 = t; return t0 !== null && t - t0 < 0.2 ? 1 : 0; }, () => 1)]);
        }
        for (const [name, r] of rides) expect([name, ...stopped(r)]).toEqual([name, false, 0, true]);
    });

    test('stopped, a steer key held for 2 s turns the handlebar and leans the bike no further than stopLean of tipLeanDeg', () => {
        const r = ride(6, t => (t > 5 && t < 7 ? 1 : 0), () => 1);
        expect(stopped(r)).toEqual([false, 0, true]);
        expect(r.most).toBeLessThanOrEqual(WorldPhysics.stopLean * WorldPhysics.tipLeanDeg + 1e-9);
    });

    test('real lean still falls: a full-lock U-turn at 2 m/s with the throttle shut tips over', () => {
        const r = ride(2, () => 1, () => 0);
        expect(r.crashed).toBe(true);
        expect(r.cause).toMatch(/Fell over at walking pace/);
        expect(r.most).toBeGreaterThan(WorldPhysics.tipLeanDeg);
    });
});
