/**
 * @jest-environment node
 */
// Contact in a world ride (Traffic.CONTACT, Traffic.contact, Traffic.holdForRoadworks in js/traffic.js;
// .agent/system/world.md, "Contact"). The owner: "add collisions with other riders".
//
// Before, the player rode through the crew and the crew through the player: with the player among them at their own
// pace, a rider's box was in the player's on 6777 of the 22582 frames of the first 3.5 km of the Tremola slice, and a
// slow player in front had each of the crew ride through its back. The crew and the car did not overlap each other
// there (the roadworks queue rule already held them apart), and still do not.
//
// Now each bike and car is a box (tests/unit/contact.test.js), the crew brake for a player ahead in their lane, a
// light touch is a bump and a hard one a crash that names the rider. Each ride here is on the real slice at 60 frames
// a second, and the boxes are measured by tests/helpers/world-contact.js, apart from the game's own test.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { loadGame, loadScript } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';
import { boxOf, playerBox, depth, seeded, putAt, packRide } from '../helpers/world-contact.js';
import { decodeWorld } from '../../tools/world/encode.mjs';
import { rideSamples } from '../../tools/world/stations.mjs';
import { findHairpins } from '../../tools/world/verify.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// The branch head before contact: its traffic drew from Math.random each frame a world rider was in a pack
const BEFORE = '580aa0a';
const game = loadGame(undefined, []);
const { THREE, Traffic, Vehicle, WorldEnvironment, CHARACTERS } = game;
const C = Traffic.CONTACT;
const DT = 1 / 60;
// A straight on a 10 m road, 300 m before the next roadworks site (tests/unit/world-traffic.test.js rides it too)
const STRAIGHT_S = 2600;
const mean = riders => riders.reduce((sum, r) => sum + r.baseSpeed, 0) / riders.length;
const list = (items, n = 12) => items.slice(0, n).map(i => JSON.stringify(i)).join('\n');

let env, route, works, hairpins;
// What the rides measured, written to the file CONTACT_STATS names (for a report; nothing reads it back)
const measured = {};
afterAll(() => { if (process.env.CONTACT_STATS) writeFileSync(process.env.CONTACT_STATS, JSON.stringify(measured, null, 1)); });
beforeAll(async () => {
    const { fetchFn } = diskFetch();
    env = await WorldEnvironment.load(new THREE.Scene(), { id: 'tremola', fetchFn, models: null, digest: async () => '0' });
    env.scenery.buildTile = () => null;
    route = env.route;
    works = env.roadworks;
    const world = decodeWorld(path.join(REPO, 'world'));
    hairpins = findHairpins(rideSamples(world.edges, world.ride.path));
}, 300000);

const sOf = v => route.fromUnits(v.currentSegment + v.segmentProgress);
// The lane line of traffic going up the slice at s, `off` metres across from it (+ is Route.LEFT, the centre line's side)
const laneAt = (s, off = 0) => route.laneCurve(route.toUnits(s), 1, off, 0, {});

// The real crew with the player as CHARACTERS[0], and only the riders named kept, each put at its s and settled there
// at its own pace with nobody near
function crewOf(places) {
    works.reset();
    const traffic = seeded(7, () => new Traffic(new THREE.Scene(), env, CHARACTERS[0].name));
    traffic.cars.forEach(car => car.remove());
    traffic.cars = [];
    const keep = [];
    for (const bike of traffic.motorcycles) {
        const at = places[keep.length];
        if (at === undefined) { bike.remove(); continue; }
        putAt(bike, route, at - 60);
        keep.push(bike);
    }
    traffic.motorcycles = keep;
    // Each rider reaches its place at the pace the road gives it
    for (const [i, bike] of keep.entries()) {
        for (let f = 0; f < 60 * 60 && sOf(bike) < places[i]; f++) bike.update(DT, null, [bike], []);
    }
    return traffic;
}

// The player's bike: the real Vehicle, moved by hand (its physics are not the subject)
function playerAt(x, z, yaw, speed, y = 0) {
    const v = new Vehicle(new THREE.Scene());
    v.environment = env;
    v.position.set(x, y, z);
    v.yawAngle = yaw;
    v.speed = speed;
    route.project(x, z, null, v.projection);
    return v;
}

// On the lane line at s, `off` across from it, pointing along it
function onLane(v, s, off = 0) {
    const lane = laneAt(s, off);
    v.position.set(lane.x, lane.y, lane.z);
    v.yawAngle = lane.heading;
    route.project(lane.x, lane.z, v.projection.index >= 0 ? { index: v.projection.index } : null, v.projection);
}

// Free: the bike goes where it points, `steer` rad off the lane line's heading (+ turns toward Route.LEFT)
function steer(v, angle) {
    const lane = laneAt(v.projection.s);
    v.yawAngle = lane.heading + angle;
    v.position.x += v.speed * Math.sin(v.yawAngle) * DT;
    v.position.z += v.speed * Math.cos(v.yawAngle) * DT;
    v.position.y = lane.y;
    route.project(v.position.x, v.position.z, { index: v.projection.index }, v.projection);
}

const offOf = (v) => {
    const lane = laneAt(v.projection.s);
    return (v.position.x - lane.x) * Math.cos(lane.heading) - (v.position.z - lane.z) * Math.sin(lane.heading);
};
const apart = (v, bike) => depth(playerBox(v), boxOf(bike));

describe('the player and one rider', () => {
    test('the stretch is a straight clear of the roadworks, and the rider is one of the crew by name', () => {
        expect(works.siteAhead(STRAIGHT_S - 100, 1, 300)).toBeFalsy();
        expect(Math.abs(route.headingChange(STRAIGHT_S - 40, STRAIGHT_S + 160))).toBeLessThan(0.5);
        const traffic = crewOf([STRAIGHT_S]);
        expect(traffic.motorcycles).toHaveLength(1);
        expect(CHARACTERS.map(c => c.name)).toContain(traffic.motorcycles[0].riderName);
        expect(traffic.motorcycles[0].currentSpeed).toBeGreaterThan(8);
    });

    test('passing a metre to either side at 10 m/s more is no contact: nothing is lost, the rider holds its line and does not brake', () => {
        for (const off of [1, -1]) {
            const traffic = crewOf([STRAIGHT_S]);
            const bike = traffic.motorcycles[0];
            const speed = bike.currentSpeed + 10;
            let s = sOf(bike) - 30, alongside = 0, least = Infinity;
            const v = playerAt(0, 0, 0, speed);
            for (let f = 0; f < 60 * 8; f++) {
                s += speed * DT;
                onLane(v, s, off);
                const result = traffic.update(DT, v.position, null, v);
                expect(result.rider).toBeUndefined();
                expect(apart(v, bike)).toBe(0);
                const gap = s - sOf(bike);
                if (Math.abs(gap) < 10) {
                    alongside++;
                    // The player beside it or just past is not something in its lane to brake for
                    expect(bike.planM).toBeGreaterThan(50);
                }
                if (Math.abs(gap) < 2) least = Math.min(least, Math.abs(offOf(v) - (bike.nudge || 0)));
                if (gap > 30) break;
            }
            expect(alongside).toBeGreaterThan(60);
            expect(least).toBeGreaterThan(0.95);
            expect(least).toBeLessThan(1.05);
            expect(v.speed).toBe(speed);
            expect(v.crashed).toBe(false);
            expect(bike.nudge || 0).toBe(0);
            expect(traffic.overlaps(v)).toHaveLength(0);
        }
    });

    // As one of the roadworks queue the player held every vehicle behind it along the ride, wherever it was across the
    // road: a rider the player passed within 60 m of a site stood still in one frame
    test('passing a rider on the way into a roadworks site does not stop it dead: it brakes no harder than a rider can', () => {
        const site = works.closed.find(k => k.stopIn > STRAIGHT_S);
        const traffic = crewOf([site.stopIn - 55]);
        const bike = traffic.motorcycles[0];
        const speed = bike.currentSpeed + 6;
        const v = playerAt(0, 0, 0, speed);
        let s = sOf(bike) - 8, prev = bike.currentSpeed, hardest = 0, passed = 0, queued = 0;
        for (let f = 0; f < 60 * 3; f++) {
            s += speed * DT;
            onLane(v, s, 1.2);
            works.riderS = s;
            works.riderDirection = 1;
            if (works.riderEntry()) queued++;
            traffic.update(DT, v.position, null, v);
            hardest = Math.max(hardest, (prev - bike.currentSpeed) / DT);
            prev = bike.currentSpeed;
            if (s > sOf(bike)) passed++;
            if (s > sOf(bike) + 6) break;
        }
        expect(passed).toBeGreaterThan(20);
        // (the player was one of the site's queue all the while it was past the rider)
        expect(queued).toBeGreaterThanOrEqual(passed);
        expect(hardest).toBeLessThanOrEqual(6 + 1e-6);
        expect(bike.currentSpeed).toBeGreaterThan(3);
        works.reset();
    });

    test('drifting sideways into a rider at 0.8 m/s is a bump: no crash, the boxes apart after it, a little speed lost once, and the rider gives way and comes back', () => {
        for (const from of [1.5, -1.1]) {
            const traffic = crewOf([STRAIGHT_S]);
            const bike = traffic.motorcycles[0];
            const before = bike.currentSpeed, toward = -Math.sign(from);
            const lane = laneAt(sOf(bike), from);
            const v = playerAt(lane.x, lane.z, lane.heading, before, lane.y);
            const events = [];
            let touched = null, wobble = 0, pushed = 0;
            // Three seconds steering into the rider, then two steering away
            for (let f = 0; f < 60 * 5; f++) {
                steer(v, (f < 180 ? toward : -toward) * Math.atan2(0.8, v.speed));
                const was = v.speed;
                const result = traffic.update(DT, v.position, null, v);
                if (result.rider) {
                    events.push({ f, kind: result.rider.kind, name: result.rider.name, closing: result.rider.closing, was, lost: was - v.speed });
                    if (touched === null) touched = f;
                }
                expect(apart(v, bike)).toBe(0);
                wobble = Math.max(wobble, Math.abs(v.contactWobble || 0));
                if (Math.abs(bike.nudge || 0) > Math.abs(pushed)) pushed = bike.nudge;
            }
            expect(v.crashed).toBe(false);
            expect(events.length).toBeGreaterThanOrEqual(1);
            expect(events.every(e => e.kind === 'bump' && e.name === bike.riderName)).toBe(true);
            // One contact is one bump: at most one for each cooldown of the three seconds leaning on the rider
            expect(events.length).toBeLessThanOrEqual(Math.ceil((180 - touched) * DT / C.bump.cooldownS));
            expect(events[0].closing).toBeGreaterThan(0.5);
            expect(events[0].closing).toBeLessThan(C.hardMs);
            // Each bump costs the set share of the speed, and nothing else does
            for (const e of events) expect(e.lost).toBeCloseTo(e.was * (1 - C.bump.keep), 9);
            expect(v.speed).toBeCloseTo(before * C.bump.keep ** events.length, 9);
            expect(v.speed).toBeGreaterThan(before * 0.8);
            expect(wobble).toBeGreaterThan(0.05);
            expect(wobble).toBeLessThanOrEqual(C.bump.wobble * events.length);
            // The rider moved away from the player, not far, and kept its pace
            expect(pushed * toward).toBeGreaterThan(0.1);
            expect(pushed * toward).toBeLessThanOrEqual(C.nudge.mostM + 1e-9);
            expect(bike.currentSpeed).toBeGreaterThan(before - 0.5);
            // With the player gone it comes back to its line, and the wobble has gone
            v.position.set(1e6, 0, 1e6);
            route.project(1e6, 1e6, null, v.projection);
            for (let f = 0; f < 60 * 3; f++) traffic.update(DT, v.position, null, v);
            expect(bike.nudge).toBe(0);
            expect(v.contactWobble).toBe(0);
        }
    });

    test('riding into a rider\'s back at 8 m/s more crashes the player with the rider\'s name as the cause; the rider slows, shakes and rides on', () => {
        // The same rider with nobody near: its speed at each place up the road
        const alone = crewOf([STRAIGHT_S]).motorcycles[0], pace = [];
        for (let f = 0; f < 60 * 14; f++) {
            alone.update(DT, null, [alone], []);
            pace.push({ s: sOf(alone), speed: alone.currentSpeed });
        }
        const paceAt = s => pace.reduce((best, p) => (Math.abs(p.s - s) < Math.abs(best.s - s) ? p : best)).speed;
        const traffic = crewOf([STRAIGHT_S]);
        const bike = traffic.motorcycles[0];
        const before = bike.currentSpeed;
        const v = playerAt(0, 0, 0, before + 8);
        let s = sOf(bike) - 25, hit = null;
        for (let f = 0; f < 60 * 6 && !hit; f++) {
            s += v.speed * DT;
            onLane(v, s);
            hit = traffic.update(DT, v.position, null, v).rider || null;
        }
        expect(hit).toMatchObject({ kind: 'crash', name: bike.riderName });
        expect(hit.closing).toBeGreaterThan(7.5);
        expect(v.crashed).toBe(true);
        expect(v.crashCause).toBe(`Rode into ${bike.riderName}`);
        expect(v.fall).toMatchObject({ kind: 'lowside' });
        // The bike slides on up the road, slower than it came
        const slide = v.velocity.x * Math.sin(v.yawAngle) + v.velocity.z * Math.cos(v.yawAngle);
        expect(slide).toBeGreaterThan(0);
        expect(slide).toBeLessThan(before + 8);
        expect(v.velocity.y).toBe(0);

        const from = sOf(bike);
        let least = Infinity, shake = 0, t = 0;
        const run = (seconds, each) => {
            for (let f = 0; f < 60 * seconds; f++) {
                const result = traffic.update(DT, v.position, null, v);
                t += DT;
                least = Math.min(least, bike.currentSpeed);
                shake = Math.max(shake, Math.abs(bike.bikeGroup.rotation.z - bike.leanAngle));
                if (each) each(result);
            }
        };
        // A second after: a bike put down in the rider is not hit (the rider is not solid for a moment)
        run(1);
        const again = playerAt(bike.bikeGroup.position.x, bike.bikeGroup.position.z, bike.bikeGroup.rotation.y, bike.currentSpeed + 8, bike.bikeGroup.position.y);
        expect(traffic.update(DT, again.position, null, again).rider).toBeUndefined();
        expect(again.crashed).toBe(false);
        run(C.crash.slowS - 1);
        // It slowed hard and shook, and never stopped
        expect(least).toBeLessThan(before * 0.5);
        expect(least).toBeGreaterThan(before * C.crash.slowTo - 0.5);
        expect(shake).toBeGreaterThan(0.05);
        expect(shake).toBeLessThanOrEqual(C.crash.wobble + 1e-9);
        // A few seconds on it is back at its pace, well up the road, upright and solid again
        run(5);
        expect(sOf(bike)).toBeLessThan(pace[pace.length - 1].s);
        expect(bike.currentSpeed).toBeGreaterThan(paceAt(sOf(bike)) * 0.9);
        expect(sOf(bike) - from).toBeGreaterThan(40);
        expect(Math.abs(bike.bikeGroup.rotation.z - bike.leanAngle)).toBe(0);
        expect(t).toBeGreaterThan(C.crash.ghostS);
        const later = playerAt(bike.bikeGroup.position.x, bike.bikeGroup.position.z, bike.bikeGroup.rotation.y, bike.currentSpeed, bike.bikeGroup.position.y);
        expect(traffic.update(DT, later.position, null, later).rider).toMatchObject({ kind: 'bump' });
    });

    test('a nudge of a rider\'s back wheel at 2 m/s more is a bump: the player is set back clear at the rider\'s speed', () => {
        const traffic = crewOf([STRAIGHT_S]);
        const bike = traffic.motorcycles[0];
        const before = bike.currentSpeed;
        const v = playerAt(0, 0, 0, before + 2);
        let s = sOf(bike) - 8, hit = null;
        for (let f = 0; f < 60 * 6 && !hit; f++) {
            s += v.speed * DT;
            onLane(v, s);
            hit = traffic.update(DT, v.position, null, v).rider || null;
            expect(apart(v, bike)).toBe(0);
        }
        expect(hit).toMatchObject({ kind: 'bump', name: bike.riderName });
        expect(v.crashed).toBe(false);
        expect(v.speed).toBeLessThanOrEqual(bike.currentSpeed + 0.01);
        expect(v.speed).toBeGreaterThan(before - 1);
    });

    test('a rider that comes into the back of a player who cut in is never a crash: it takes the player\'s speed and stays clear, by centimetres a frame', () => {
        for (const slower of [3, 6]) {
            const traffic = crewOf([STRAIGHT_S]);
            const bike = traffic.motorcycles[0];
            const before = bike.currentSpeed;
            const v = playerAt(0, 0, 0, before - slower);
            // Half a metre of air between the rider's front tyre and the player's back one
            let s = sOf(bike) + 2.6, prev = sOf(bike);
            const kinds = new Set();
            for (let f = 0; f < 60 * 6; f++) {
                s += v.speed * DT;
                onLane(v, s);
                const result = traffic.update(DT, v.position, null, v);
                if (result.rider) kinds.add(result.rider.kind);
                expect(apart(v, bike)).toBe(0);
                // The rider is held back, never thrown back
                expect(sOf(bike) - prev).toBeGreaterThan(-0.15);
                prev = sOf(bike);
            }
            expect([...kinds]).toEqual(['rear']);
            expect(v.crashed).toBe(false);
            expect(v.speed).toBe(before - slower);
            expect(bike.currentSpeed).toBeLessThanOrEqual(v.speed + 0.5);
            // It then follows behind, at a gap
            expect(s - sOf(bike)).toBeGreaterThan(3);
        }
    });
});

describe('the crew behind the player', () => {
    test('a kilometre at 8 m/s on the lane line with the whole, faster crew behind: nobody touches the player, and they queue behind it', () => {
        const stats = packRide(game, env, { metres: 1000, place: 'front', pace: () => 8 });
        measured.behind = { ...stats, overlaps: undefined };
        if (stats.count) throw new Error(`${stats.count} frames with boxes in each other (worst ${stats.worst.toFixed(2)} m): ${JSON.stringify(stats.pairs)}\n${list(stats.overlaps)}`);
        expect(stats.events).toEqual({});
        expect(stats.causes).toEqual([]);
        expect(stats.metres).toBeGreaterThanOrEqual(1000);
        // The nearest any rider's origin came to the player's from behind: more than a bike's length
        expect(stats.behind).toBeGreaterThan(2.5);
        // They are all still behind, close up, at about the player's pace: a queue, not a ride through
        const playerS = stats.playerS;
        const behind = stats.end.filter(r => r.s < playerS);
        expect(behind).toHaveLength(5);
        expect(Math.max(...behind.map(r => r.s))).toBeGreaterThan(playerS - 25);
        expect(Math.min(...behind.map(r => r.s))).toBeGreaterThan(playerS - 150);
    }, 900000);
});

describe('the whole crew, the car and the player over a long stretch', () => {
    test('3.5 km with hairpins and roadworks, the player in the middle of the group at its mean pace: no two boxes are ever in each other', () => {
        const seen = { queue: 0, redWaits: 0, sites: new Set(), frames: 0, checked: 0 };
        // The lights are met in three phases, so at least one ride stands at a red one with others of the crew
        for (const warmS of [0, 20, 40]) {
            const stats = packRide(game, env, {
                metres: 3500, place: 'middle', pace: mean, warmS,
                // The game's own test agrees with the tests' measure, every tenth frame
                onFrame: ({ f, traffic, player }) => { if (f % 10 === 0) { seen.checked++; expect(traffic.overlaps(player)).toHaveLength(0); } }
            });
            measured[`pack ${warmS}`] = { ...stats, overlaps: stats.overlaps.slice(0, 4) };
            if (stats.count) throw new Error(`lights ${warmS} s on: ${stats.count} frames with boxes in each other (worst ${stats.worst.toFixed(2)} m): ${JSON.stringify(stats.pairs)}\n${list(stats.overlaps)}`);
            expect(stats.events).toEqual({});
            expect(stats.causes).toEqual([]);
            expect(stats.metres).toBeGreaterThanOrEqual(3500);
            seen.queue = Math.max(seen.queue, stats.queue);
            seen.redWaits += stats.redWaits;
            stats.sites.forEach(id => seen.sites.add(id));
            seen.frames += stats.frames;
            const from = stats.playerS - stats.metres;
            expect(hairpins.filter(h => h.s0 > from && h.s1 < stats.playerS).length).toBeGreaterThanOrEqual(3);
        }
        expect(seen.sites.size).toBeGreaterThanOrEqual(3);
        expect(seen.redWaits).toBeGreaterThan(60);
        expect(seen.queue).toBeGreaterThanOrEqual(2);
        expect(seen.frames).toBeGreaterThan(60000);
        expect(seen.checked).toBeGreaterThan(6000);
    }, 1800000);
});

describe('where the player is put down', () => {
    test('at the start no rider is in the player or within a bike\'s length of it', () => {
        const traffic = seeded(7, () => new Traffic(new THREE.Scene(), env, CHARACTERS[0].name));
        expect(traffic.motorcycles).toHaveLength(5);
        for (const bike of traffic.motorcycles) expect(sOf(bike) - env.startS).toBeGreaterThan(8);
        const v = playerAt(0, 0, 0, 0);
        for (const off of [-1.5, 0, 1.5, 3]) {
            onLane(v, env.startS, off);
            expect(traffic.overlaps(v)).toHaveLength(0);
        }
        expect(traffic.overlaps()).toHaveLength(0);
    });

    test('a restart or a debug skip onto the crew: nobody is in the player, and nobody behind rides into it while it stands', () => {
        const stations = env.stationGates.slice(1, 4).map(st => st.s);
        // (the debug skip puts the bike 40 m before a station: Game.DEBUG_SKIP_BEFORE_M)
        for (const s of [...stations, ...stations.map(at => at - 40)]) {
            const traffic = crewOf([s, s - 4, s + 6, s - 20, s - 55]);
            expect(traffic.motorcycles).toHaveLength(5);
            traffic.motorcycles.forEach((bike, i) => putAt(bike, route, [s, s - 4, s + 6, s - 20, s - 55][i]));
            traffic.motorcycles.forEach(bike => { bike.laneMoving = true; bike.currentSpeed = 12; });
            const v = playerAt(0, 0, 0, 0);
            onLane(v, s);
            expect(traffic.overlaps(v).length).toBeGreaterThan(0);
            traffic.clearAround(route.toUnits(s), 8);
            expect(traffic.overlaps(v)).toHaveLength(0);
            for (const bike of traffic.motorcycles) expect(Math.abs(sOf(bike) - s)).toBeGreaterThan(C.restart.backM - 1e-6);
            works.riderS = s;
            for (let f = 0; f < 60 * 10; f++) {
                works.step(DT);
                const result = traffic.update(DT, v.position, null, v);
                expect(result.rider).toBeUndefined();
                const found = [...traffic.motorcycles].filter(bike => apart(v, bike) > 0);
                if (found.length) throw new Error(`restart at ${Math.round(s)}, frame ${f}: ${found.map(b => `${b.riderName} at ${(sOf(b) - s).toFixed(1)} m`).join(', ')} in the player`);
                expect(traffic.overlaps(v)).toHaveLength(0);
            }
            expect(v.crashed).toBe(false);
        }
    }, 600000);
});

describe('determinism', () => {
    test('a world\'s traffic draws nothing from Math.random after it is built, and at the build what it drew before', () => {
        const source = execFileSync('git', ['show', `${BEFORE}:js/traffic.js`], { encoding: 'utf8', maxBuffer: 1 << 26 });
        expect(source).not.toContain('const CONTACT');
        expect(loadScript('traffic.js')).toContain('const CONTACT');
        const old = loadGame(undefined, [], { 'traffic.js': source });
        // A minute with the crew queued behind the player, where riders are in a pack
        const ride = { seconds: 60, place: 'front', pace: () => 8 };
        const before = packRide({ ...game, Traffic: old.Traffic }, env, ride);
        const now = packRide(game, env, ride);
        measured.draws = { before: before.draws, now: now.draws };
        expect(now.frames).toBe(3600);
        expect(before.frames).toBe(3600);
        expect(now.draws.start).toBe(before.draws.start);
        expect(now.draws.ride).toBe(0);
        expect(now.draws.ride).toBeLessThanOrEqual(before.draws.ride);
    }, 600000);
});
