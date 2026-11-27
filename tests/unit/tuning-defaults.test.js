/**
 * @jest-environment node
 */
// The owner's tuning written into the defaults (.agent/system/handling.md, "The defaults"), and the lean limit by how
// daring the rider is. The owner rode with the debug panel and sent the block below (2026-11-21, his second set).
// Held here:
//   - the block reads back through Tuning.parse, and each field a row scales is the old default times the row's value
//   - the ride at the commit before with the block set through Tuning is the ride of this tree with every multiplier
//     at 1: to the last bit for a rider whose own multipliers are 1, and within TOLERANCE for the real riders, on the
//     shipped stage and on a classic leg
//   - the panel reads 1.00 and the default rider mode is all ones
//   - the lean limit follows the rider's daring by one rule, the lowside limit moves with it, and no code names a rider
//   - every catalogue bike stops in 1 / 0.70 of the distance it did, and a rider who brakes at the speed advice makes
//     every hairpin of the shipped stage in every rider mode
//   - the server's time floors are worked out at a lean no rider passes, and a fast scripted ride of each link of the
//     shipped stage is well over its floor
// To apply the next block: put it in BLOCK, the commit before the change in BEFORE, and write the defaults that
// `node tools/apply-tuning.mjs` prints.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { describe, test, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import { loadGame, loadScript, buildEnvironment } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';
import { rideSpan, advisedPace } from '../helpers/world-rider.js';
import { decodeWorld } from '../../tools/world/encode.mjs';
import { rideSamples } from '../../tools/world/stations.mjs';
import { readLeanCapDeg } from '../../tools/world/floors.mjs';
import { readFileSync } from 'node:fs';
import { findHairpins } from '../../tools/world/verify.mjs';

const BLOCK = `twisty tuning v1
steerRate = 1.50
leanMax = 1.08
brake = 0.70
brakeLean = 0.75`;
// The branch head before the block was written into the defaults
const BEFORE = '34ee080';
// The row whose value is not one default: it is the lean limit of a rider of middle daring (Vehicle.leanOf)
const BY_RIDER = 'leanMax';
// Metres and m/s. The real riders' own multipliers are not 1, and (20 x rider) x 0.70 is not always 14 x rider in
// floating point: the two rides differ by the order of two multiplications and nothing else. Measured over the
// rides below: 9e-13 at the most (40 s on the stage, 150 s on a leg)
const TOLERANCE = 1e-9;
const DT = 1 / 60;
const G = 9.81;
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const show = file => execFileSync('git', ['show', `${BEFORE}:js/${file}`], { cwd: REPO, encoding: 'utf8', maxBuffer: 1 << 26 });

const game = loadGame();
// The rides here are held against commits from before the rider's weight (RIDER_MASS, Vehicle.pairOf), or measure
// the bike alone: every character rides at the reference weight, at which that rule moves nothing to the last bit
// (tests/unit/rider-mass.test.js holds the rule itself)
for (const character of game.CHARACTERS) delete character.kg;
const before = loadGame(undefined, [], { 'vehicle.js': show('vehicle.js'), 'world/physics.js': show('world/physics.js') });
const { THREE, Tuning, Vehicle, WorldPhysics, WorldAssist, WorldEnvironment, CHARACTERS, BIKE_MODELS } = game;
const RiderModes = new Function('Tuning', 'WorldAssist', 'console', `${loadScript('ridermodes.js')}\nreturn RiderModes;`)(Tuning, WorldAssist, console);
const parsed = Tuning.parse(BLOCK);
const at = (object, field) => field.split('.').reduce((node, key) => node[key], object);
// Every rider on every bike of theirs that is in the catalogue, and was in the catalogue of the commit before (a bike
// added since has nothing to be held against)
const RIDES = CHARACTERS.flatMap(character => character.bikes.filter(id => BIKE_MODELS[id] && before.BIKE_MODELS[id]).map(id => [character.id, id]));
const riderOf = (G0, id) => G0.CHARACTERS.find(character => character.id === id);
const bikeOf = (G0, [who, id]) => new G0.Vehicle(new G0.THREE.Scene(), null, riderOf(G0, who), id, { model: false });
// A rider with no multiplier of their own and the middle of every trait, on the first bike of the catalogue's first
// rider: the bike's numbers and nothing else
const plain = G0 => ({ ...G0.CHARACTERS[0], physics: {}, traits: { country: 3, mountain: 3, hairpins: 3, daring: 3 } });
// A rider's first bike with no lean limit of its own (BIKE_MODELS leanMaxDeg, which came after the block)
const firstFree = character => character.bikes.find(id => game.Vehicle.leanMostOf(id) === Infinity);

// The block as the debug panel has it, in the game of the commit before. `lean` is the lean row's value for a rider
// whose daring is not the middle
function tuneBefore(lean = parsed.values[BY_RIDER]) {
    before.Tuning.start({ debug: true });
    for (const [id, value] of Object.entries(parsed.values)) before.Tuning.set(id, id === BY_RIDER ? lean : value);
}

function onPlane(v, G0 = game, { weather = null, cobbles = false } = {}) {
    v.environment = { physics: G0.WorldPhysics, route: { unitCount: 0, fromUnits: u => u, project: () => ({ index: -1 }), sample: () => ({ grade: 0, flags: { cobbles } }) } };
    v.assistLevel = 'off';
    if (weather) v.weatherSystem = weather;
    return v;
}
const WET = { surfaceGrip: 1, weatherPhysics: () => ({ lateralFriction: 0.7, brakeForce: 0.8, acceleration: 0.9 }), getPhysicsMultipliers: () => ({ lateralFriction: 0.7, brakeForce: 0.8, acceleration: 0.9 }) };

let env, envBefore, hairpins;
beforeAll(async () => {
    env = await WorldEnvironment.load(new THREE.Scene(), { id: 'tremola', fetchFn: diskFetch().fetchFn, models: null, digest: async () => '0' });
    envBefore = await before.WorldEnvironment.load(new before.THREE.Scene(), { id: 'tremola', fetchFn: diskFetch().fetchFn, models: null, digest: async () => '0' });
    const world = decodeWorld(path.join(REPO, 'world'));
    hairpins = findHairpins(rideSamples(world.edges, world.ride.path));
}, 300000);

afterEach(() => {
    Tuning.setMode(null);
    Tuning.start({ debug: false });
    before.Tuning.setMode(null);
    before.Tuning.start({ debug: false });
});
afterAll(() => RiderModes.start({ storage: null }));

describe('the block', () => {
    test('reads back through Tuning.parse with no error: the four values the owner sent', () => {
        expect(parsed.errors).toEqual([]);
        expect(parsed.values).toEqual({ steerRate: 1.5, leanMax: 1.08, brake: 0.7, brakeLean: 0.75 });
        expect(Tuning.text(parsed.values)).toBe(BLOCK);
    });

    test('every field a row of the block scales is the default of the commit before times the row\'s value', () => {
        let fields = 0;
        for (const [id, value] of Object.entries(parsed.values)) {
            if (id === BY_RIDER) continue;
            for (const target of Tuning.row(id).scales) {
                const scaled = was => (target.inverse ? was / value : was * value);
                if (target.on === 'world') {
                    // The same double as the tuned one, so a world ride can be the same to the last bit
                    expect([target.field, at(WorldPhysics, target.field)]).toEqual([target.field, scaled(at(before.WorldPhysics, target.field))]);
                    fields++;
                } else if (target.on === 'bike') {
                    for (const ride of RIDES) {
                        const now = bikeOf(game, ride)[target.field], was = bikeOf(before, ride)[target.field];
                        expect(Math.abs(now / scaled(was) - 1)).toBeLessThan(1e-14);
                    }
                    fields++;
                } else throw new Error(`the block scales ${target.on}.${target.field}: write its default and add it here`);
            }
        }
        // leanRate, steeringForce, brakeForce and trailBrakeFloor
        expect(fields).toBe(4);
        expect(bikeOf(game, RIDES[0]).brakeForce / riderOf(game, RIDES[0][0]).physics.brakeForce).toBeCloseTo(14, 12);
        expect(WorldPhysics.trailBrakeFloor).toBe(0.3375);
        expect(WorldPhysics.leanRate).toBeCloseTo(1.725, 12);
    });

    test('the lean row is the lean limit of a rider of middle daring, and the bike\'s own limit is not changed', () => {
        expect(Vehicle.leanOf({ traits: { daring: 3 } })).toBe(parsed.values[BY_RIDER]);
        expect(WorldPhysics.leanCapDeg).toBe(before.WorldPhysics.leanCapDeg);
        for (const ride of RIDES) {
            const now = bikeOf(game, ride), was = bikeOf(before, ride);
            const dare = Vehicle.leanOf(riderOf(game, ride[0]));
            expect(now.maxLeanAngle).toBe(was.maxLeanAngle * dare);
            // A bike with a lean limit of its own is held to it over the rider's (tests/unit/rider-mass.test.js)
            expect(onPlane(now).worldPhysics.leanCapDeg).toBe(Math.min(before.WorldPhysics.leanCapDeg * dare, Vehicle.leanMostOf(ride[1])));
        }
    });

    test('the panel reads 1.00 on every row, and the default rider mode is all ones', () => {
        Tuning.start({ debug: true });
        for (const row of Tuning.PARAMS) {
            expect([row.id, Tuning.get(row.id), Tuning.of(row.id)]).toEqual([row.id, 1, 1]);
        }
        expect(Tuning.live).toBe(false);
        expect(Tuning.text()).toBe(Tuning.FORMAT);
        RiderModes.start({ storage: null });
        expect(RiderModes.get().id).toBe(RiderModes.DEFAULT);
        expect(RiderModes.get().tune).toEqual({});
        for (const row of Tuning.PARAMS) expect(Tuning.of(row.id)).toBe(1);
    });
});

describe('the ride before with the block set is the ride now with every multiplier at 1', () => {
    const state = v => [v.position.x, v.position.y, v.position.z, v.speed, v.leanAngle, v.leanVelocity, v.yawAngle, v.crashed ? 1 : 0];
    // The most any value of the two rides differs by; -1 when they are the same to the last bit
    const apart = (a, b) => {
        expect(a.length).toBe(b.length);
        let most = -1;
        for (let i = 0; i < a.length; i++) {
            for (let k = 0; k < a[i].length; k++) {
                if (!Object.is(a[i][k], b[i][k])) most = Math.max(most, Math.abs(a[i][k] - b[i][k]));
            }
        }
        return most;
    };

    // The shipped stage from the first drops of the rain through four cobbled hairpins: the pilot of
    // tests/helpers/world-rider.js at the advised speed, braking for each bend
    // This tree is ridden without the edge lean (WorldPhysics.edgeLean), which came after the block and is no part of
    // it: the commit before has none, and with it the ride through these hairpins differs by 7 mm. Nor the hairpin
    // assist's hold (WorldPhysics.holdSpeedMs, 2026-11-27), held by tests/unit/hairpin-assist.test.js
    async function world(G0, where, character, bike) {
        const rows = [];
        const own = where.physics;
        if (G0 === game) where.physics = { ...own, edgeLean: null, holdSpeedMs: 0 };
        const out = await rideSpan(G0, where, { s0: 7650, s1: 8450, speed: advisedPace(G0, where, 18), character, bike, watch: v => rows.push(state(v)) });
        where.physics = own;
        return { rows, out };
    }

    // A classic leg with the steering of tools/autopilot.js (a heading error to a lean, held by the steering), the
    // throttle and the brake to a speed that changes, so the brake works while the bike is leaned
    function leg(G0, character, bike) {
        const { env: legEnv } = buildEnvironment(G0, 1);
        const route = legEnv.route;
        const v = new G0.Vehicle(legEnv.scene, null, character, bike, { model: false });
        const start = route.sample(route.unitM * 2, {});
        v.environment = legEnv;
        v.position.set(start.x, start.y, start.z);
        v.yawAngle = start.heading;
        v.speed = 20;
        const aim = {}, rows = [];
        const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
        for (let tick = 0; tick < 60 * 150 && !v.crashed; tick++) {
            const t = route.sample(Math.min((v.routeS || 0) + 2 * route.unitM, route.length), aim);
            const err = wrap(Math.atan2(t.x - v.position.x, t.z - v.position.z) - v.yawAngle);
            const yawRate = Math.max(-1.2, Math.min(1.2, err * 1.6));
            const lean = Math.max(-0.75, Math.min(0.75, -Math.atan(yawRate * Math.max(v.speed, 5) / G)));
            const steer = Math.max(-1, Math.min(1, (v.leanAngle - lean) * 4 + v.leanVelocity * 1.2));
            const target = tick % 480 < 300 ? 32 : 18;
            v.update(DT, steer, v.speed < target ? 1 : 0, v.speed > target + 2 ? 1 : 0, 0);
            rows.push(state(v));
        }
        return { rows, crashed: v.crashed };
    }

    test('the shipped stage, a rider with no multiplier of their own: the same to the last bit', async () => {
        tuneBefore();
        const was = await world(before, envBefore, plain(before));
        const now = await world(game, env, plain(game));
        expect([was.out.crashed, was.out.cut, now.out.crashed, now.out.cut]).toEqual([false, false, false, false]);
        expect(now.rows.length).toBeGreaterThan(60 * 40);
        // The brake worked, and the bike was leaned over
        expect(Math.max(...now.rows.map(row => Math.abs(row[4])))).toBeGreaterThan(0.5);
        expect(now.rows.some((row, i) => i > 0 && now.rows[i - 1][3] - row[3] > 5 * DT)).toBe(true);
        expect(apart(was.rows, now.rows)).toBe(-1);
        // And the block is what makes it so: without it the commit before rides another ride
        before.Tuning.start({ debug: false });
        const untuned = await world(before, envBefore, plain(before));
        expect(untuned.rows.length === now.rows.length && apart(untuned.rows, now.rows) === -1).toBe(false);
    }, 300000);

    test('the shipped stage, every real rider on their first bike: within the tolerance', async () => {
        let most = -1;
        for (const character of CHARACTERS) {
            tuneBefore(Vehicle.leanOf(character));
            // (on their first bike with no lean limit of its own: that limit came after the block)
            const ride = firstFree(character);
            const was = await world(before, envBefore, riderOf(before, character.id), ride);
            const now = await world(game, env, character, ride);
            expect([character.id, now.out.crashed, now.out.cut]).toEqual([character.id, false, false]);
            const gap = apart(was.rows, now.rows);
            most = Math.max(most, gap);
            expect([character.id, gap < TOLERANCE]).toEqual([character.id, true]);
        }
        console.log(`the shipped stage, the real riders: the two rides differ by ${most} at the most`);
    }, 600000);

    test('a classic leg: the same to the last bit for the rider with no multiplier, within the tolerance for the real riders', () => {
        tuneBefore();
        const was = leg(before, plain(before)), now = leg(game, plain(game));
        // 4 km of the leg with no crash, leaned to 19 degrees, the brake on for 14 s of it
        expect([now.crashed, now.rows.length]).toEqual([false, 60 * 150]);
        expect(Math.max(...now.rows.map(row => Math.abs(row[4])))).toBeGreaterThan(0.3);
        expect(now.rows.filter((row, i) => i > 0 && now.rows[i - 1][3] - row[3] > 5 * DT).length).toBeGreaterThan(600);
        expect(apart(was.rows, now.rows)).toBe(-1);
        let most = -1;
        for (const character of CHARACTERS) {
            tuneBefore(Vehicle.leanOf(character));
            const ride = firstFree(character);
            const a = leg(before, riderOf(before, character.id), ride), b = leg(game, character, ride);
            const gap = apart(a.rows, b.rows);
            most = Math.max(most, gap);
            expect([character.id, gap < TOLERANCE]).toEqual([character.id, true]);
        }
        console.log(`a classic leg, the real riders: the two rides differ by ${most} at the most`);
    }, 600000);
});

describe('the lean limit by how daring the rider is', () => {
    const { trait, least, most } = Vehicle.RIDER_LEAN;

    test('one rule, as data: a straight line from the least to the most daring, and the middle is the owner\'s value', () => {
        expect([trait, least, most]).toEqual(['daring', 1.02, 1.14]);
        expect([1, 2, 3, 4, 5].map(daring => Number(Vehicle.leanOf({ traits: { daring } }).toFixed(6)))).toEqual([1.02, 1.05, 1.08, 1.11, 1.14]);
        // A character with no trait is the middle of the scale, and a trait past the scale is held to it
        expect(Vehicle.leanOf({})).toBe(Vehicle.leanOf({ traits: { daring: 3 } }));
        expect(Vehicle.leanOf(null)).toBe(Vehicle.leanOf({ traits: { daring: 3 } }));
        expect(Vehicle.leanOf({ traits: { daring: 9 } })).toBe(Vehicle.leanOf({ traits: { daring: 5 } }));
        expect(Vehicle.leanOf({ traits: { daring: -2 } })).toBe(Vehicle.leanOf({ traits: { daring: 1 } }));
    });

    test('the real riders are in the order of their daring, and two riders of one daring have one limit', () => {
        const rows = CHARACTERS.map(character => ({ daring: character.traits[trait], lean: Vehicle.leanOf(character) }));
        expect(new Set(rows.map(row => row.daring)).size).toBeGreaterThanOrEqual(4);
        for (const a of rows) {
            for (const b of rows) expect(Math.sign(a.lean - b.lean)).toBe(Math.sign(a.daring - b.daring));
        }
    });

    test('a made-up rider gets the limit of the trait alone, on a classic leg and in a world, under the mode and the panel', () => {
        const made = { ...CHARACTERS[0], id: 'made-up', name: 'Made up', traits: { country: 1, mountain: 1, hairpins: 1, daring: 4 } };
        const v = onPlane(new Vehicle(new THREE.Scene(), null, made, null, { model: false }));
        const first = onPlane(new Vehicle(new THREE.Scene(), null, CHARACTERS[0], null, { model: false }));
        expect(v.leanDare).toBeCloseTo(1.11, 12);
        expect(v.maxLeanAngle).toBe(Math.PI / 2.7 * v.leanDare);
        expect(v.worldPhysics.leanCapDeg).toBe(WorldPhysics.leanCapDeg * v.leanDare);
        // Nothing else of the world is the rider's, and the shared defaults are never written
        expect({ ...v.worldPhysics, leanCapDeg: 0 }).toEqual({ ...WorldPhysics, leanCapDeg: 0 });
        expect(Object.isFrozen(v.worldPhysics)).toBe(true);
        expect(WorldPhysics.leanCapDeg).toBe(50);
        // The same bike under two riders differs in the lean limit only
        expect([v.brakeForce, v.steeringForce, v.maxSpeed, v.acceleration]).toEqual([first.brakeForce, first.steeringForce, first.maxSpeed, first.acceleration]);
        // The mode and the panel multiply on top
        Tuning.start({ debug: true });
        Tuning.setMode({ leanMax: 1.04 });
        Tuning.set('leanMax', 1.1);
        expect(v.worldPhysics.leanCapDeg).toBeCloseTo(WorldPhysics.leanCapDeg * v.leanDare * 1.04 * 1.1, 9);
        expect(v.tuned('maxLeanAngle')).toBeCloseTo(Math.PI / 2.7 * v.leanDare * 1.04 * 1.1, 9);
    });

    test('no code names a rider: the rule reads the trait', () => {
        const source = loadScript('vehicle.js');
        const logic = source.slice(source.indexOf('class Vehicle {'));
        const ids = CHARACTERS.map(character => character.id).join('|');
        const named = logic.split('\n').filter(line => /leanOf|leanDare|riderWorld|RIDER_LEAN/.test(line)).filter(line => new RegExp(`['"\`](${ids})['"\`]`).test(line));
        expect(named).toEqual([]);
        expect(logic).toMatch(/RIDER_LEAN/);
    });

    // Full steering held at a speed: the lean the bike settles at and the radius it turns
    // The rider's first bike with no lean limit of its own: a bike's own limit is not the rider's
    // (tests/unit/rider-mass.test.js)
    const freeBike = character => character.bikes.find(id => Vehicle.leanMostOf(id) === Infinity);
    function held(character, speed, weather) {
        const v = onPlane(new Vehicle(new THREE.Scene(), null, character, freeBike(character), { model: false }), game, { weather });
        let yaw = 0;
        for (let i = 0; i < 360 && !v.crashed; i++) {
            v.speed = speed;
            const from = v.yawAngle;
            v.updateWorldPhysics(DT, 1);
            yaw = Math.abs(v.yawAngle - from) / DT;
        }
        return { crashed: v.crashed, lean: Math.abs(v.leanAngle), radius: speed / yaw };
    }
    // The lean, as a share of the rider's grip limit, from which the bike lowsides with the steering held
    function lowsideAt(character, weather) {
        const probe = onPlane(new Vehicle(new THREE.Scene(), null, character, freeBike(character), { model: false }), game, { weather });
        const cap = Math.tan(probe.worldPhysics.leanCapDeg * Math.PI / 180) * probe.worldMultipliers().lateralFriction;
        for (let k = 1; k < 2; k += 0.01) {
            const v = onPlane(new Vehicle(new THREE.Scene(), null, character, freeBike(character), { model: false }), game, { weather });
            v.leanAngle = -Math.atan(k * cap);
            for (let i = 0; i < 30 && !v.crashed; i++) {
                v.speed = 30;
                v.updateWorldPhysics(DT, 1);
            }
            if (v.crashed) return k;
        }
        return 2;
    }

    test('the lowside limit moves with the lean limit: every rider holds full steering at their own limit, and falls from the same share over it', () => {
        const shares = [];
        for (const character of CHARACTERS) {
            const cap = WorldPhysics.leanCapDeg * Vehicle.leanOf(character) * Math.PI / 180;
            for (const [weather, grip] of [[null, 1], [WET, 0.7]]) {
                const limit = Math.atan(Math.tan(cap) * grip);
                for (const speed of [12, 20, 30]) {
                    const run = held(character, speed, weather);
                    expect([character.id, speed, run.crashed]).toEqual([character.id, speed, false]);
                    expect(Math.abs(run.lean - limit)).toBeLessThan(0.002);
                }
                shares.push(lowsideAt(character, weather));
            }
        }
        // No rider lowsides sooner than they can lean, and the room over the limit is one share for all of them
        expect(Math.min(...shares)).toBeGreaterThan(WorldPhysics.lowsideMargin);
        expect(Math.max(...shares) - Math.min(...shares)).toBeLessThan(0.03);
    });

    test('a daring rider corners faster at the limit: the speed held in a 30 m bend, dry and wet', () => {
        const speedOf = (character, grip) => Math.sqrt(G * 30 * Math.tan(WorldPhysics.leanCapDeg * Vehicle.leanOf(character) * Math.PI / 180) * grip);
        const rows = [];
        for (const character of CHARACTERS) {
            for (const [weather, grip] of [[null, 1], [WET, 0.7]]) {
                const speed = speedOf(character, grip);
                const run = held(character, speed, weather);
                expect([character.id, run.crashed]).toEqual([character.id, false]);
                expect(Math.abs(run.radius / 30 - 1)).toBeLessThan(0.01);
                rows.push({ id: character.id, daring: character.traits[trait], wet: !!weather, speed });
            }
        }
        console.log(`the speed held in a 30 m bend (m/s), by daring: ${rows.map(row => `${row.daring} ${row.wet ? 'wet' : 'dry'} ${row.speed.toFixed(2)}`).join(', ')}`);
        const of = (daring, wet) => rows.find(row => row.daring === daring && row.wet === wet).speed;
        // Before the trait every rider held 18.71 m/s dry and 15.66 wet (the bike's 50 degrees)
        expect(of(1, false)).toBeCloseTo(19.06, 1);
        expect(of(5, false)).toBeCloseTo(21.29, 1);
        expect(of(1, true)).toBeCloseTo(15.95, 1);
        expect(of(5, true)).toBeCloseTo(17.81, 1);
        expect(of(5, false) / of(1, false)).toBeGreaterThan(1.1);
    });
});

describe('what depends on the brake', () => {
    // m, a full brake from 25 m/s on the flat to 5 m/s: on a classic leg and in a world
    const legStop = (v) => {
        v.environment = { physics: null };
        v.speed = 25;
        let distance = 0;
        for (let i = 0; i < 6000 && v.speed > 5; i++) {
            v.updateSpeed(DT, 0, 1);
            distance += v.speed * DT;
        }
        return distance;
    };
    const worldStop = (v) => {
        v.speed = 25;
        let distance = 0;
        for (let i = 0; i < 6000 && v.speed > 5; i++) {
            v.update(DT, 0, 0, 1);
            distance += v.speed * DT;
        }
        return distance;
    };

    test('every catalogue bike stops in 1 / 0.70 of the distance it did: the brake alone on a leg, with the engine and the air in a world', () => {
        const want = 1 / parsed.values.brake;
        const seen = [];
        for (const ride of RIDES) {
            const legShare = legStop(bikeOf(game, ride)) / legStop(bikeOf(before, ride));
            const worldShare = worldStop(onPlane(bikeOf(game, ride))) / worldStop(onPlane(bikeOf(before, ride), before));
            seen.push(worldShare);
            // A leg: the brake and the air's drag. Within 2% of 1 / 0.70 (the drag is the same in both)
            expect([ride[1], Math.abs(legShare / want - 1) < 0.02]).toEqual([ride[1], true]);
            // A world: the engine braking and the drag are not the brake's, so the share is a little under: 1.38 to 1.41
            expect([ride[1], worldShare > want * 0.96 && worldShare <= want]).toEqual([ride[1], true]);
            // The brake itself, upright, is 0.70 of what it was
            const now = onPlane(bikeOf(game, ride)), was = onPlane(bikeOf(before, ride), before);
            expect(now.worldBrakeDecel(now.worldMultipliers()) / was.worldBrakeDecel(was.worldMultipliers())).toBeCloseTo(parsed.values.brake, 12);
        }
        console.log(`a world stop from 25 m/s is ${Math.min(...seen).toFixed(3)} to ${Math.max(...seen).toFixed(3)} of what it was`);
    });

    test('the advice plans with no more braking than the brake has at full lean, on every bike and surface', () => {
        for (const ride of RIDES) {
            for (const options of [{}, { weather: WET }, { weather: WET, cobbles: true }]) {
                const v = onPlane(bikeOf(game, ride), game, options);
                v.updateSpeed(DT, 0, 0);
                const m = v.worldMultipliers();
                v.leanAngle = v.worldPhysics.leanCapDeg * Math.PI / 180;
                expect(v.worldBrakeLeast(m)).toBeCloseTo(v.worldBrakeDecel(m), 9);
                v.leanAngle = 0;
                expect(v.worldBrakeLeast(m)).toBeLessThan(v.worldBrakeDecel(m));
            }
        }
        // In the default mode the least brake of every bike is over the advised braking on a dry road and a wet one,
        // so the advice brakes as it did; where it is under (the gentlest mode on wet cobbles) the advice starts sooner
        const leasts = RIDES.map(ride => { const v = onPlane(bikeOf(game, ride), game, { weather: WET }); return v.worldBrakeLeast(v.worldMultipliers()); });
        expect(Math.min(...leasts)).toBeGreaterThan(WorldPhysics.adviceBrake);
    });

    test('a rider who brakes at the speed advice makes every hairpin of the shipped stage, in every rider mode', async () => {
        expect(hairpins.length).toBeGreaterThanOrEqual(20);
        // m/s between the bends: about 80 km/h, well over every hairpin's advised speed, so each one is braked for
        const CRUISE = 22;
        const failed = [];
        let rides = 0;
        for (const mode of RiderModes.MODES) {
            RiderModes.set(mode.id);
            for (const h of hairpins) {
                rides++;
                const out = await rideSpan(game, env, { s0: Math.max(env.startS, h.s0 - 80), s1: h.s1 + 30, assist: mode.assist, speed: advisedPace(game, env, CRUISE) });
                if (out.crashed || out.cut) failed.push({ mode: mode.id, hairpin: `${h.s0}-${h.s1} r${h.minRadiusM}`, ...out });
            }
        }
        RiderModes.start({ storage: null });
        if (failed.length) throw new Error(`${failed.length} of ${rides} rides ended:\n${failed.slice(0, 20).map(f => JSON.stringify(f)).join('\n')}`);
    }, 900000);
});

describe('the board floors and the rider\'s lean', () => {
    // The most daring rider on the fastest of their bikes, in the mode with the most lean: by rule, no name
    const rider = CHARACTERS.reduce((best, character) => (Vehicle.leanOf(character) > Vehicle.leanOf(best) ? character : best));
    const bike = rider.bikes.filter(id => BIKE_MODELS[id]).reduce((best, id) => (Vehicle.physicsOf(rider, id).maxSpeed > Vehicle.physicsOf(rider, best).maxSpeed ? id : best));
    const sharpest = RiderModes.MODES.reduce((best, mode) => ((mode.tune.leanMax || 1) > (best.tune.leanMax || 1) ? mode : best));

    test('the floors are worked out at a lean no rider in any mode passes', () => {
        const most = WorldPhysics.leanCapDeg * Vehicle.RIDER_LEAN.most * Math.max(...RiderModes.MODES.map(mode => mode.tune.leanMax || 1));
        expect(most).toBeCloseTo(59.28, 2);
        expect(WorldPhysics.floorLeanDeg).toBeGreaterThanOrEqual(most);
        // The importer reads that number from the file's text
        expect(readLeanCapDeg(REPO)).toBe(WorldPhysics.floorLeanDeg);
        RiderModes.set(sharpest.id);
        const v = onPlane(new Vehicle(new THREE.Scene(), null, rider, bike, { model: false }));
        expect(v.worldPhysics.leanCapDeg).toBeCloseTo(most, 9);
        expect(v.worldPhysics.leanCapDeg).toBeLessThanOrEqual(WorldPhysics.floorLeanDeg);
        RiderModes.start({ storage: null });
    });

    // A pace near the limit: every bend ahead at `share` of the speed its curvature and the grip allow at the rider's
    // own lean limit, braked for with the whole upright brake, and the bike's top speed between
    const fast = share => (s, v) => {
        const world = v.worldPhysics, m = v.worldMultipliers();
        const brake = v.tuned('brakeForce') * world.brakeGain * m.brakeForce;
        let allowed = v.tuned('maxSpeed');
        for (let d = 0; d <= 250; d += 4) {
            const k = Math.min(Math.abs(env.route.curvatureAt(s + d, 6)), 1 / world.radiusFloor);
            if (k < 1e-4) continue;
            const corner = share * Math.sqrt(G * Math.tan(world.leanCapDeg * Math.PI / 180) * m.lateralFriction / k);
            allowed = Math.min(allowed, Math.sqrt(corner * corner + 2 * brake * d));
        }
        return allowed;
    };

    test('a fast scripted ride of each link of the shipped stage, by the most daring rider in the sharpest mode, is well over the link\'s floor', async () => {
        const row = JSON.parse(readFileSync(path.join(REPO, 'functions', 'world-courses.json'), 'utf8'))['world-tremola-v1'];
        const stations = env.stationGates.map(st => st.s);
        expect(row.gateFloorsMs).toHaveLength(stations.length - 1);
        RiderModes.set(sharpest.id);
        const lines = [];
        for (let k = 0; k + 1 < stations.length; k++) {
            let best = Infinity;
            for (const lane of [0, 'inside']) {
                const out = await rideSpan(game, env, { s0: Math.max(env.startS, stations[k]), s1: stations[k + 1] + 40, assist: sharpest.assist, lane, character: rider, bike, speed: fast(0.8), most: 60 * 900 });
                // The time to the tick at which the run itself passed the next timing line, from a flying start
                const passed = (out.stations || []).find(st => st.index === k + 1);
                if (!out.crashed && !out.cut && passed) best = Math.min(best, passed.tick / 60 * 1000);
            }
            lines.push(`link ${k}: floor ${row.gateFloorsMs[k]} ms, ride ${Math.round(best)} ms (${(best / row.gateFloorsMs[k]).toFixed(2)})`);
            // A clean ride was made, and it is well over the floor. (With the floors as they were, worked out at the
            // bike's 50 degrees with a stack of hairpins as one bend, the fifth link's ride was 0.80 of its floor,
            // and 0.89 before the owner's tuning.)
            expect([k, Number.isFinite(best), best > row.gateFloorsMs[k] * 1.5]).toEqual([k, true, true]);
        }
        RiderModes.start({ storage: null });
        console.log(lines.join('\n'));
    }, 900000);
});
