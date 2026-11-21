// Riding at walking pace in a world: the rider can lay the bike over for a tight U-turn, nothing holds it up or pushes
// it along, and under fallSpeed it either tips over (leaned) or the rider puts a foot down (upright). The real
// js/vehicle.js against the one before the change (aaa6f8c), on a flat plane with no road.
//
// Before, the lean limit at low speed was the lean of the floor radius, atan(v^2 / (g r)): 17 degrees at 3 m/s and a few
// at 1 m/s whatever the input, and with the throttle closed the creep lifted the bike back to 4 m/s, so it never fell.
import { describe, test, expect } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import { loadGame } from '../helpers/load-game.js';

const DT = 1 / 60;
const BEFORE = 'aaa6f8c';
const show = file => execFileSync('git', ['show', `${BEFORE}:js/${file}`], { encoding: 'utf8', maxBuffer: 1 << 26 });
const games = {
    after: loadGame(),
    before: loadGame(undefined, [], { 'vehicle.js': show('vehicle.js'), 'world/physics.js': show('world/physics.js') })
};
const deg = r => r * 180 / Math.PI;

function bike(game, speed) {
    const v = new game.Vehicle(new game.THREE.Scene());
    v.environment = {
        physics: game.WorldPhysics,
        route: { unitCount: 0, fromUnits: u => u, project: () => ({ index: -1 }), sample: () => ({ grade: 0, flags: {} }) }
    };
    v.speed = speed;
    return v;
}

// Full lock held at `speed` (the speed set each tick, as a rider on the throttle holds it): the settled radius and lean
function lockAt(game, speed) {
    const v = bike(game, speed);
    let yaw = 0;
    for (let tick = 0; tick < 240; tick++) {
        v.speed = speed;
        if (tick === 180) yaw = v.yawAngle;
        v.update(DT, 1, 0, 0, 0);
    }
    return { radius: speed * 1 / Math.abs((v.yawAngle - yaw) / (60 * DT)), lean: deg(Math.abs(v.leanAngle)), crashed: v.crashed };
}

// From `speed` with the throttle closed, for `seconds`: {crashed, at, cause, top, speed, footDown, lean}
function coast(game, speed, { input = 0, brake = 0, seconds = 4 } = {}) {
    const v = bike(game, speed);
    let top = speed, at = null;
    for (let tick = 0; tick < seconds * 60 && !v.crashed; tick++) {
        v.update(DT, input, 0, brake, 0);
        top = Math.max(top, v.speed);
        if (v.crashed) at = tick * DT;
    }
    return { crashed: v.crashed, at, cause: v.crashCause || null, top, speed: v.speed, footDown: v.footDown, lean: deg(Math.abs(v.leanAngle)) };
}

const report = {};
for (const [name, game] of Object.entries(games)) {
    report[name] = {
        lock3: lockAt(game, 3),
        lock5: lockAt(game, 5),
        tip: coast(game, 2, { input: 1 }),
        stop: coast(game, 2, { brake: 1 }),
        upright: coast(game, 2),
        turning: coast(game, 3, { input: 1, seconds: 2 })
    };
}
console.log(JSON.stringify(report, null, 1));

const fails = r => [
    r.lock3.radius > 3.5 && 'radius at 3 m/s over 3.5 m',
    r.lock3.lean < 30 && 'lean at 3 m/s full lock under 30 degrees',
    !(r.tip.crashed && r.tip.at <= 2) && 'no tip-over within 2 s from 2 m/s at full lock, throttle closed',
    (r.stop.crashed || !r.stop.footDown || r.stop.speed !== 0) && 'no foot-down stop from 2 m/s upright with the brake',
    (r.upright.crashed || r.upright.speed !== 0) && 'upright at 2 m/s, throttle closed: not stopped with a foot down',
    r.turning.top > 3 + 1e-9 && 'the speed rose over the rider\'s while turning (creep)'
].filter(Boolean);

describe('low speed', () => {
    test('before: the bike stayed upright and crept back up to speed', () => {
        expect(fails(report.before).length).toBeGreaterThan(0);
    });

    test('now: a deep lean and a tight turn at 3 m/s, a tip-over or a foot down under fallSpeed, no creep', () => {
        expect(fails(report.after)).toEqual([]);
        expect(report.after.lock3.crashed).toBe(false);
        expect(report.after.lock5.crashed).toBe(false);
        expect(report.after.tip.cause).toMatch(/Fell over/);
    });
});
