/**
 * @jest-environment node
 */
// A rider who cannot reach the ground on a slope (CHARACTERS `footSlopeDeg`, FOOT_REACH, Vehicle.footReach;
// .agent/system/handling.md, "A rider who cannot reach the ground"). Held here, on the real Vehicle on a straight road
// of one grade, with no rider named:
//   - a stop on a grade under the rider's angle: the bike stays up; over it: the bike tips over after the short moment,
//     the slow tip-over with its own class and cause, to the downhill side
//   - a restart on a slope stands the bike still and does not tip it before it moves off; once it has, a stop does
//   - another character on the same slope stays up, and a made-up character with another angle follows it
//   - a crawl over the standstill bound with the throttle and the brake rides up the slope
//   - the game says it once as the bike nearly stops on such a slope
//   - on the shipped stage: the stopping places are on ground the rider reaches; the count of stop lines over the
//     angle is printed
import { describe, test, expect, beforeAll } from '@jest/globals';
import { loadGame, gameMethods } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';
import { samplesOf, fakeData, allTiles } from '../helpers/world-synthetic.js';

const DT = 1 / 60;
const game = loadGame();
const { THREE, Vehicle, WorldPhysics, WorldRoute, WorldGround, WorldEnvironment, CHARACTERS } = game;
const RULE = Vehicle.FOOT_REACH;
const SHORT = CHARACTERS.find(c => Number.isFinite(c[RULE.trait]));
const OTHER = CHARACTERS.find(c => !Number.isFinite(c[RULE.trait]));
const rad = deg => deg * Math.PI / 180;

// A straight road along +z that climbs at `deg` degrees, over land that follows it
function slope(deg, length = 1200) {
    const grade = Math.tan(rad(deg));
    const points = [];
    for (let z = 0; z <= length; z += 4) points.push({ x: 0, y: 100 + grade * z, z, heading: 0, width: 10 });
    const route = new WorldRoute(samplesOf(points), {});
    const ground = new WorldGround(route, fakeData({ tiles: allTiles(-1, 0, -1, Math.ceil(length / 256) + 1), shape: (x, z) => 100 + grade * z, zone: x => (Math.abs(x) <= 5 ? 1 : 0) }));
    return { physics: WorldPhysics, route, ground };
}

// The rider on their first bike at 40 m up the road, facing `yaw` off the ride's heading
function bike(character, env, yaw = 0) {
    const v = new Vehicle(new THREE.Scene(), null, character, null, { model: false });
    v.environment = env;
    v.assistLevel = 'off';
    const at = env.route.sample(40, {});
    v.position.set(at.x, at.y, at.z);
    v.yawAngle = yaw;
    v.speed = 0;
    v.findNearestRoadSegment();
    return v;
}

// Rides off to `speed`, brakes to a stop and holds the brake for `holdS`: the state at the end
function rideAndStop(v, { speed = 5, holdS = 2, steer = 0 } = {}) {
    let ticks = 0;
    while (v.speed < speed && ticks++ < 600 && !v.crashed) v.update(DT, steer, 1, 0, 0);
    let stoppedAt = null;
    for (let i = 0; i < 60 * (holdS + 10) && !v.crashed; i++) {
        v.update(DT, steer, 0, 1, 0);
        if (v.speed < RULE.stopSpeed && stoppedAt === null) stoppedAt = i;
        if (stoppedAt !== null && i - stoppedAt > holdS * 60) break;
    }
    return { crashed: v.crashed, why: v.crashWhy, cause: v.crashCause, side: Math.sign(v.crashAngle), stoppedAt };
}

describe('the rule', () => {
    test('one character has the trait, as data, and the rule reads it: no code names a rider', () => {
        expect(SHORT).toBeDefined();
        expect(SHORT[RULE.trait]).toBe(5);
        expect(Vehicle.footSlopeOf(SHORT)).toBeCloseTo(Math.tan(rad(5)), 12);
        expect(Vehicle.footSlopeOf(OTHER)).toBe(Infinity);
        expect(Vehicle.footSlopeOf({})).toBe(Infinity);
        // A new class of cause, with the slow tip-over
        expect(Vehicle.CRASH_CAUSES.foot).toBe('tip');
        const source = Vehicle.prototype.footReach.toString() + Vehicle.footSlopeOf.toString();
        for (const c of CHARACTERS) expect([c.id, new RegExp(`\\b(${c.id}|${c.name})\\b`).test(source)]).toEqual([c.id, false]);
    });

    test('a stop on 3 degrees: the bike stays up', () => {
        const out = rideAndStop(bike(SHORT, slope(3)));
        expect(out.stoppedAt).not.toBeNull();
        expect(out.crashed).toBe(false);
    });

    test('a stop on 6 degrees: the bike tips over after the short moment, with its class and cause', () => {
        const v = bike(SHORT, slope(6));
        const out = rideAndStop(v, { holdS: 3 });
        expect([out.crashed, out.why, out.cause]).toEqual([true, 'foot', RULE.cause]);
        // Not at once: the stop lasted the rule's moment (the bike is under stopSpeed for stopS)
        expect(v.fall.kind).toBe('tip');
    });

    test('the fall goes to the downhill side: the side the ground falls to across the bike, else the foot the rider reaches for', () => {
        // Facing up the road: no slope across, the side of the foot the stop pose puts down (Vehicle.LEFT, a negative roll)
        expect(rideAndStop(bike(SHORT, slope(6))).side).toBe(-Vehicle.LEFT);
        // Turned to the left of the ride's heading (+yaw), the bike's left points down the road: it falls to the left.
        // Turned to the right, its right is downhill
        expect(rideAndStop(bike(SHORT, slope(8), 0.6), { speed: 3 }).side).toBe(-1);
        expect(rideAndStop(bike(SHORT, slope(8), -0.6), { speed: 3 }).side).toBe(1);
    });

    test('a restart on a slope stands the bike still and does not tip it before it moves off; once it has, a stop does', () => {
        const v = bike(SHORT, slope(6));
        rideAndStop(v, { holdS: 3 });
        expect(v.crashed).toBe(true);
        // The restart: Game.restartInPlace calls reset() and stands the bike at a standstill
        const at = v.environment.route.sample(300, {});
        v.reset();
        v.position.set(at.x, at.y, at.z);
        v.yawAngle = 0;
        v.speed = 0;
        v.findNearestRoadSegment();
        for (let i = 0; i < 60 * 5; i++) v.update(DT, 0, 0, 1, 0);
        expect([v.crashed, v.footArmed]).toEqual([false, false]);
        // Pulling away arms it, and the next stop tips the bike
        const out = rideAndStop(v);
        expect([out.crashed, out.why]).toEqual([true, 'foot']);
    });

    test('another character on the same slope stays up', () => {
        expect(rideAndStop(bike(OTHER, slope(6))).crashed).toBe(false);
        expect(rideAndStop(bike(OTHER, slope(10))).crashed).toBe(false);
    });

    test('a made-up character with the trait at another angle follows it', () => {
        const made = { ...OTHER, id: 'made-up', name: 'Made Up', [RULE.trait]: 8 };
        expect(rideAndStop(bike(made, slope(6))).crashed).toBe(false);
        expect(rideAndStop(bike(made, slope(10))).why).toBe('foot');
    });

    test('a crawl over the standstill bound, with the throttle and the brake, rides up the slope and never tips', () => {
        const v = bike(SHORT, slope(8));
        while (v.speed < 4) v.update(DT, 0, 1, 0, 0);
        let least = Infinity;
        for (let i = 0; i < 60 * 20; i++) {
            const throttle = v.speed < 1.6 ? 1 : 0, brake = v.speed > 2.4 ? 1 : 0;
            v.update(DT, 0, throttle, brake, 0);
            if (i > 120) least = Math.min(least, v.speed);
        }
        expect(v.crashed).toBe(false);
        expect(least).toBeGreaterThan(RULE.stopSpeed);
    });

    test('the game says it once as the bike nearly stops on such a slope, and nothing on a slope the rider reaches', () => {
        const flag = (deg) => {
            const v = bike(SHORT, slope(deg));
            while (v.speed < 5) v.update(DT, 0, 1, 0, 0);
            let rises = 0;
            for (let i = 0; i < 60 * 3 && !v.crashed; i++) {
                v.update(DT, 0, 0, 1, 0);
                if (v.footWarnNew) { rises++; v.footWarnNew = false; }
            }
            return rises;
        };
        expect(flag(6)).toBe(1);
        expect(flag(3)).toBe(0);
        const said = [];
        const Game = { FOOT_TEXT: 'Too steep for a foot down: keep rolling', CALLOUT_MS: { foot: 2000 } };
        const self = { vehicle: { footWarnNew: true, crashed: false }, finished: false };
        const { sayFoot } = gameMethods(['sayFoot'], self, { Game, showCallout: (...args) => said.push(args) });
        sayFoot();
        sayFoot();
        expect(said).toEqual([[Game.FOOT_TEXT, 'warn', 2000]]);
        expect(self.vehicle.footWarnNew).toBe(false);
    });
});

describe('the shipped stage', () => {
    let env;
    beforeAll(async () => {
        env = await WorldEnvironment.load(new THREE.Scene(), { id: 'tremola', fetchFn: diskFetch().fetchFn, models: null, digest: async () => '0' });
    }, 300000);
    // The steepest grade over a stretch of the ride, in degrees
    const steepest = (s0, s1) => {
        let most = 0;
        for (let s = s0; s <= s1; s += 0.5) most = Math.max(most, Math.abs(env.route.sample(s, {}).grade));
        return Math.atan(most) * 180 / Math.PI;
    };
    // The least angle any character's foot reaches: the rule every stop the game makes must keep to
    const least = () => Math.min(...CHARACTERS.map(c => (Number.isFinite(c[RULE.trait]) ? c[RULE.trait] : 90)));

    test('every stopping place is on ground the rider with the least reach can stand on', () => {
        const list = env.places.list;
        expect(list.length).toBeGreaterThan(0);
        const rows = list.map(p => ({ id: p.id, deg: steepest(p.s - p.length / 2, p.s + p.length / 2) }));
        console.log(`The stopping places, the steepest grade along each: ${rows.map(r => `${r.id} ${r.deg.toFixed(2)}`).join(', ')}`);
        for (const r of rows) expect([r.id, r.deg < least()]).toEqual([r.id, true]);
    });

    test('the roadworks stop lines over the angle: counted and printed (the rule applies there too)', () => {
        const angle = least();
        const sites = env.roadworks.closed;
        // The rider's own line is the one toward increasing s (stopIn); the queue behind it stands up to 40 m back
        const rows = sites.map(site => ({ id: site.id, line: steepest(site.stopIn, site.stopIn), queue: steepest(site.stopIn - 40, site.stopIn), other: steepest(site.stopOut, site.stopOut) }));
        const over = rows.filter(r => r.line > angle).length, queue = rows.filter(r => r.queue > angle).length, other = rows.filter(r => r.other > angle).length;
        console.log(`Stop lines over ${angle} degrees: ${over} of ${rows.length} on the rider's way, ${queue} with ground over it within 40 m before the line, ${other} of ${rows.length} the other way\n${rows.map(r => `site ${r.id}: line ${r.line.toFixed(2)}, 40 m before it at most ${r.queue.toFixed(2)}, the other way ${r.other.toFixed(2)}`).join('\n')}`);
        expect(rows).toHaveLength(sites.length);
        expect(Number.isInteger(over)).toBe(true);
    });
});
