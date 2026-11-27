/**
 * @jest-environment node
 */
// A rider of the touring crew rides at the pace of its own traits (CHARACTERS `traits`, Traffic.PACES): in a world its
// trait for the kind of road it is on (WorldRoute.kindAt: hairpin, mountain, country), which blends along the road. Every rule reads CHARACTERS and the route, so a new
// character with traits and a new world are held with no line added here.
// Real classes on real three r150 and the real Tremola slice, read from disk.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test, expect, beforeAll } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';
import { decodeWorld } from '../../tools/world/encode.mjs';
import { rideSamples } from '../../tools/world/stations.mjs';
import { findHairpins } from '../../tools/world/verify.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const game = loadGame(undefined, []);
const { THREE, CHARACTERS, Traffic, WorldRoute, WorldEnvironment, Vehicle } = game;
const DT = 1 / 60;
// The most the yaw rate may change from one frame to the next (rad/s), as tests/unit/world-traffic.test.js holds it
const YAW_RATE_STEP = 0.1;
const KINDS = ['hairpin', 'mountain', 'country'];
// The rider's trait for a kind of road
const TRAIT = { hairpin: 'hairpins', mountain: 'mountain', country: 'country' };

const quietly = (run) => {
    const log = console.log;
    console.log = () => {};
    try { return run(); } finally { console.log = log; }
};

// A WorldRoute through `points` ({x, y, z, heading}), 4 m apart
function routeOf(points, flags = 0) {
    const count = points.length;
    const samples = { count, x: new Float64Array(count), y: new Float64Array(count), z: new Float64Array(count), heading: new Float64Array(count), width: new Float64Array(count).fill(7), s: new Float64Array(count), flags: new Uint8Array(count).fill(flags) };
    points.forEach((p, i) => {
        samples.x[i] = p.x; samples.y[i] = p.y; samples.z[i] = p.z; samples.heading[i] = p.heading;
        samples.s[i] = i === 0 ? 0 : samples.s[i - 1] + Math.hypot(p.x - points[i - 1].x, p.z - points[i - 1].z);
    });
    return new WorldRoute(samples, {});
}

// A road of `metres` in 4 m steps: `grade` its climb, `turn` the heading change of each step (rad)
function road(metres, { grade = 0, turn = () => 0 } = {}) {
    const points = [{ x: 0, y: 0, z: 0, heading: 0 }];
    for (let i = 1; i <= metres / 4; i++) {
        const last = points[i - 1];
        const heading = last.heading + turn(i * 4);
        points.push({ x: last.x + 4 * Math.sin(heading), y: last.y + 4 * grade, z: last.z + 4 * Math.cos(heading), heading });
    }
    return points;
}

describe('the pace of a trait', () => {
    test('a whole trait is its row, and a trait between two rows is between them', () => {
        for (const row of Traffic.PACES) expect(Traffic.paceOf(row.trait)).toEqual({ speed: row.speed, spread: row.spread, corner: row.corner });
        const rows = Traffic.PACES;
        for (let i = 1; i < rows.length; i++) {
            const half = Traffic.paceOf((rows[i - 1].trait + rows[i].trait) / 2);
            for (const key of ['speed', 'spread', 'corner']) expect(half[key]).toBeCloseTo((rows[i - 1][key] + rows[i][key]) / 2, 9);
            // A quicker trait is never a slower pace
            for (const key of ['speed', 'corner']) expect(rows[i][key]).toBeGreaterThan(rows[i - 1][key]);
        }
        // Outside the scale it is the nearest end; nobody corners harder than the crew did
        expect(Traffic.paceOf(0)).toEqual(Traffic.paceOf(rows[0].trait));
        expect(Traffic.paceOf(9)).toEqual(Traffic.paceOf(rows[rows.length - 1].trait));
        expect(Math.max(...rows.map(row => row.corner))).toBe(4);
        expect(Traffic.skillOf(5)).toBe('expert');
        expect(Traffic.skillOf(1)).toBe('slow');
    });

    test('a rider\'s trait is the mean of country and mountain on a leg, and its own for each kind of road in a world', () => {
        for (const character of CHARACTERS) {
            const t = character.traits;
            expect(Traffic.roadTrait(character)).toBe((t.country + t.mountain) / 2);
            expect(Traffic.roadTrait(character, { hairpin: 1, mountain: 0, country: 0 })).toBe(t.hairpins);
            expect(Traffic.roadTrait(character, { hairpin: 0, mountain: 1, country: 0 })).toBe(t.mountain);
            expect(Traffic.roadTrait(character, { hairpin: 0, mountain: 0, country: 1 })).toBe(t.country);
            expect(Traffic.roadTrait(character, { hairpin: 0.5, mountain: 0.25, country: 0.25 })).toBeCloseTo(t.hairpins / 2 + t.mountain / 4 + t.country / 4, 9);
        }
        // A character without traits rides the middle of the scale
        expect(Traffic.roadTrait({ name: 'New' })).toBe(3);
        expect(Traffic.roadTrait({ name: 'New' }, { hairpin: 1, mountain: 0, country: 0 })).toBe(3);
    });
});

describe('the pace draws', () => {
    test('nothing of the pace draws from Math.random after the start', async () => {
        const { fetchFn } = diskFetch();
        const env = await quietly(() => WorldEnvironment.load(new THREE.Scene(), { id: 'tremola', fetchFn, models: null, digest: async () => '0' }));
        const AIMotorcycle = quietly(() => new Traffic(new THREE.Scene(), env)).motorcycles[0].constructor;
        for (const source of [AIMotorcycle.prototype.takePace, Traffic.paceOf, Traffic.skillOf, Traffic.roadTrait, WorldRoute.prototype.kindAt, WorldRoute.prototype.buildKinds, WorldRoute.prototype.blendAlong, Vehicle.traitOf, Vehicle.statsOf]) {
            expect(source.toString()).not.toContain('Math.random');
        }
    }, 120000);
});

describe('the kind of road, measured from a route', () => {
    const kindsAt = (route, s) => route.kindAt(s, {});

    test('a flat straight road is country, a steady climb is mountain, a winding flat road is mountain, cobbles are mountain', () => {
        const flat = routeOf(road(1200));
        const climb = routeOf(road(1200, { grade: 0.08 }));
        // Bends of 40 m radius, left then right every 60 m: no hairpin, but a road that winds
        const winding = routeOf(road(1200, { turn: s => (Math.floor(s / 60) % 2 ? 1 : -1) * 4 / 40 }));
        const setts = routeOf(road(1200), WorldRoute.FLAG.cobbles);
        for (let s = 100; s <= 900; s += 50) {
            expect(kindsAt(flat, s)).toEqual({ hairpin: 0, mountain: 0, country: 1 });
            expect(kindsAt(climb, s).mountain).toBeCloseTo(1, 9);
            expect(kindsAt(winding, s).hairpin).toBe(0);
            expect(kindsAt(winding, s).mountain).toBeCloseTo(1, 9);
            expect(kindsAt(setts, s).mountain).toBeCloseTo(1, 9);
        }
    });

    test('a hairpin on a flat straight road is a hairpin in it and near it, and country away from it, with no step between', () => {
        // 180 degrees at 8 m radius, 600 m along
        const arc = Math.PI * 8;
        const route = routeOf(road(1400, { turn: s => (s > 600 && s <= 600 + arc ? 4 / 8 : 0) }));
        const middle = 600 + arc / 2;
        for (let d = -20; d <= 20; d += 4) expect(kindsAt(route, middle + d).hairpin).toBe(1);
        expect(kindsAt(route, middle - 60).hairpin).toBeGreaterThan(0);
        expect(kindsAt(route, middle - 60).hairpin).toBeLessThan(1);
        expect(kindsAt(route, 200).hairpin).toBe(0);
        expect(kindsAt(route, 1100).hairpin).toBe(0);
        let before = kindsAt(route, 0);
        for (let s = 1; s <= route.length; s++) {
            const now = kindsAt(route, s);
            for (const kind of KINDS) expect(Math.abs(now[kind] - before[kind])).toBeLessThan(0.05);
            before = now;
        }
    });
});

describe('the Tremola slice: the crew ride each kind of road at their own pace', () => {
    let env, route, rides;
    const rideOf = id => rides.find(ride => ride.character.id === id);

    beforeAll(async () => {
        const { fetchFn } = diskFetch();
        env = await quietly(() => WorldEnvironment.load(new THREE.Scene(), { id: 'tremola', fetchFn, models: null, digest: async () => '0' }));
        route = env.route;
        const AIMotorcycle = quietly(() => new Traffic(new THREE.Scene(), env)).motorcycles[0].constructor;
        // Every character alone, each with the same share of its spread, over the two ends of the slice: the open
        // start into the climb and its first hairpins, and the last climb onto the open summit. (The whole
        // slice is 13 km and a frame of world traffic is slow under jest: these 3.5 km have every kind of road and
        // each change from one to another.)
        const stretches = [[env.startS, 2300], [12000, env.endS - 40]];
        rides = quietly(() => CHARACTERS.map((character) => {
            const ride = { character, time: 0, speedStep: 0, baseStep: 0, yawStep: 0, mean: {}, sum: { hairpin: [0, 0], mountain: [0, 0], country: [0, 0] }, corner: [Infinity, -Infinity], reached: 0 };
            const kind = {};
            for (const [from, to] of stretches) {
                const bike = new AIMotorcycle(new THREE.Scene(), env, { direction: 1, speed: 20, startSegment: 0, character, pace: { luck: 0.5, scale: env.trafficSpeedScale } });
                const u = route.toUnits(from);
                bike.currentSegment = Math.floor(u);
                bike.segmentProgress = u - Math.floor(u);
                bike.updatePosition();
                let speed = null, base = null, yaw = null, rate = null;
                for (let frame = 0; frame < 60 * 900; frame++) {
                    bike.update(DT, null, [bike], []);
                    const s = route.fromUnits(bike.currentSegment + bike.segmentProgress);
                    route.kindAt(s, kind);
                    for (const name of KINDS) if (kind[name] > 0.95) { ride.sum[name][0] += bike.currentSpeed; ride.sum[name][1]++; }
                    if (speed !== null) ride.speedStep = Math.max(ride.speedStep, Math.abs(bike.currentSpeed - speed) / DT);
                    if (base !== null) ride.baseStep = Math.max(ride.baseStep, Math.abs(bike.baseSpeed - base));
                    speed = bike.currentSpeed;
                    base = bike.baseSpeed;
                    ride.corner = [Math.min(ride.corner[0], bike.drive.lateral), Math.max(ride.corner[1], bike.drive.lateral)];
                    const now = bike.bikeGroup.rotation.y;
                    if (yaw !== null) {
                        const turned = now - yaw - 2 * Math.PI * Math.round((now - yaw) / (2 * Math.PI));
                        if (rate !== null) ride.yawStep = Math.max(ride.yawStep, Math.abs(turned / DT - rate));
                        rate = turned / DT;
                    }
                    yaw = now;
                    ride.time += DT;
                    if (s >= to) { ride.reached++; break; }
                }
            }
            for (const name of KINDS) ride.mean[name] = ride.sum[name][0] / ride.sum[name][1];
            return ride;
        }));
    }, 600000);

    test('the shares of the three kinds sum to 1 everywhere, with no step, and every hairpin of the ride is one', () => {
        const world = decodeWorld(path.join(REPO, 'world'));
        const hairpins = findHairpins(rideSamples(world.edges, world.ride.path));
        expect(hairpins.length).toBeGreaterThanOrEqual(20);
        for (const h of hairpins) {
            // findHairpins gives the 80 m spans that hold the turn: the turn itself is about their middle
            const middle = (h.s0 + h.s1) / 2;
            for (let s = middle - 8; s <= middle + 8; s += 4) expect([h.s0, s, route.kindAt(s, {}).hairpin > 0.99]).toEqual([h.s0, s, true]);
        }
        const share = { hairpin: 0, mountain: 0, country: 0 };
        let before = null, count = 0;
        for (let s = 0; s <= route.length; s += 1) {
            const kind = route.kindAt(s, {});
            expect(kind.hairpin + kind.mountain + kind.country).toBeCloseTo(1, 9);
            for (const name of KINDS) {
                expect(kind[name]).toBeGreaterThanOrEqual(0);
                expect(kind[name]).toBeLessThanOrEqual(1);
                if (before) expect(Math.abs(kind[name] - before[name])).toBeLessThan(0.05);
                share[name] += kind[name];
            }
            before = kind;
            count++;
        }
        // The old pass road is a mountain road with its hairpins, and open only at its two ends
        expect(share.mountain / count).toBeGreaterThan(0.5);
        expect(share.hairpin / count).toBeGreaterThan(0.15);
        expect(share.country / count).toBeGreaterThan(0.03);
        expect(share.country / count).toBeLessThan(0.2);
        expect(route.kindAt(route.length - 100, {}).country).toBeGreaterThan(0.9);
    });

    test('every rider rides both stretches to their ends, with no step in its speed or its heading', () => {
        for (const ride of rides) {
            expect([ride.character.id, ride.reached]).toEqual([ride.character.id, 2]);
            // The speed changes by at most the braking of a crew rider (6 m/s^2), and the pace it eases toward by
            // under 0.05 m/s a frame (3 m/s^2, a crew rider's own acceleration)
            expect(ride.speedStep).toBeLessThanOrEqual(6 + 1e-6);
            expect(ride.baseStep).toBeLessThan(0.05);
            expect(ride.yawStep).toBeLessThan(YAW_RATE_STEP);
            // Nobody takes a bend harder than the crew did
            expect(ride.corner[1]).toBeLessThanOrEqual(4);
            expect(ride.corner[0]).toBeGreaterThanOrEqual(Traffic.PACES[0].corner);
        }
    });

    test.each(KINDS)('on %s road a rider with more of that trait is no slower, and the most of it is quicker than the least', (kind) => {
        const order = [...rides].sort((a, b) => a.character.traits[TRAIT[kind]] - b.character.traits[TRAIT[kind]]);
        for (let i = 1; i < order.length; i++) {
            const slow = order[i - 1], quick = order[i];
            const same = slow.character.traits[TRAIT[kind]] === quick.character.traits[TRAIT[kind]];
            if (same) expect([kind, slow.character.id, quick.character.id, Math.abs(quick.mean[kind] - slow.mean[kind]) < 0.05]).toEqual([kind, slow.character.id, quick.character.id, true]);
            else expect([kind, slow.character.id, quick.character.id, quick.mean[kind] > slow.mean[kind]]).toEqual([kind, slow.character.id, quick.character.id, true]);
        }
        expect(order[order.length - 1].mean[kind]).toBeGreaterThan(order[0].mean[kind] * 1.1);
    });

    test('the owner\'s riders: Shane is the quickest round the hairpins and Steve over the road as a whole, Guy the slowest of all', () => {
        const byTime = [...rides].sort((a, b) => a.time - b.time).map(ride => ride.character.id);
        expect(byTime[0]).toBe('steve');
        expect(byTime[byTime.length - 1]).toBe('guy');
        expect(rideOf('shane').mean.hairpin).toBeGreaterThan(rideOf('steve').mean.hairpin);
        expect(rideOf('steve').mean.country).toBeGreaterThan(rideOf('shane').mean.country);
        // Alex and Shane are slow on the open road and quicker on the mountain road
        for (const id of ['alex', 'shane']) expect(rideOf(id).mean.mountain).toBeGreaterThan(rideOf(id).mean.country);
        for (const kind of KINDS) for (const ride of rides) expect(ride.mean[kind]).toBeGreaterThanOrEqual(rideOf('guy').mean[kind]);
    });
});
