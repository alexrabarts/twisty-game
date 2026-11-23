/**
 * @jest-environment node
 */
// The rider's weight in the handling (RIDER_MASS, Vehicle.pairOf) and the bike's own lean limit (BIKE_LEAN,
// Vehicle.leanMostOf). .agent/system/handling.md, "The rider's weight" and "The bike's own lean limit". Held here, on
// the real Vehicle and the real catalogue, with no rider or bike named:
//   - the rule: each number moves by (reference / total) ^ power; a rider of the reference weight, and a made-up
//     character with no kg, moves nothing, to the last bit
//   - for one bike, the riders in the order of their total mass: the 0 to 40 m/s time, the lean rate, the stop and
//     the wheelie follow it, and the top speed does not move
//   - the outcome the owner expects: the lightest rider on the supersport bike she owns is the fastest pair from
//     0 to 40 m/s and over the shipped stage on one scripted line in Road mode (the ranking of every rider's best bike
//     is printed), and that ride is well over the board's floors
//   - the bike with its own lean limit is held to it with every rider, in every mode, in a world and on a leg
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { describe, test, expect, afterEach } from '@jest/globals';
import { loadGame, loadScript } from '../helpers/load-game.js';

const DT = 1 / 60;
const G = 9.81;
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const game = loadGame();
const { THREE, Vehicle, WorldPhysics, WorldAssist, Tuning, CHARACTERS, BIKE_MODELS } = game;
const RiderModes = new Function('Tuning', 'WorldAssist', 'console', `${loadScript('ridermodes.js')}\nreturn RiderModes;`)(Tuning, WorldAssist, console);
const RULE = Vehicle.RIDER_MASS;

// Every rider on every bike of theirs in the catalogue
const PAIRS = CHARACTERS.flatMap(character => character.bikes.filter(id => BIKE_MODELS[id]).map(id => ({ character, id })));
// A character riding a bike they may not own: the same rider with that bike as their only one
const on = (character, id) => ({ ...character, bikes: [id] });
const bikeOf = (character, id) => new Vehicle(new THREE.Scene(), null, character, id, { model: false });
const total = (character, id) => BIKE_MODELS[id].kg + Vehicle.riderKgOf(character);

function onPlane(v) {
    v.environment = { physics: WorldPhysics, route: { unitCount: 0, fromUnits: u => u, project: () => ({ index: -1 }), sample: () => ({ grade: 0, flags: {} }) } };
    v.assistLevel = 'off';
    return v;
}

// Seconds from a standstill to 40 m/s at full throttle on the flat
function zeroTo40(character, id) {
    const v = onPlane(bikeOf(character, id));
    v.speed = 0;
    let t = 0;
    while (v.speed < 40 && t < 60) { v.update(DT, 0, 1, 0, 0); t += DT; }
    return t;
}

// Degrees of lean 0.2 s after a steer key is held from upright, at 15 m/s: more is a quicker lean-in
function leanIn(character, id) {
    const v = onPlane(bikeOf(character, id));
    for (let i = 0; i < 12; i++) { v.speed = 15; v.update(DT, 1, 0.4, 0, 0); }
    return Math.abs(v.leanAngle) * 180 / Math.PI;
}

// Metres to stop from 25 m/s with the full brake, upright
function stop(character, id) {
    const v = onPlane(bikeOf(character, id));
    v.speed = 25;
    let metres = 0;
    for (let i = 0; i < 60 * 30 && v.speed > 0.01; i++) { const before = v.speed; v.update(DT, 0, 0, 1, 0); metres += (before + v.speed) / 2 * DT; }
    return metres;
}

afterEach(() => {
    RiderModes.start({ storage: null });
    Tuning.start({ debug: false });
});

describe('the rule', () => {
    test('the table: power to weight for the acceleration, half of it for the lean rate, a fifth for the brake, none for the top speed', () => {
        expect(RULE.referenceKg).toBe(80);
        expect(RULE.power).toEqual({ acceleration: 1, steeringForce: 0.5, brakeForce: 0.2, maxSpeed: 0 });
        for (const { character, id } of PAIRS) {
            const share = (BIKE_MODELS[id].kg + RULE.referenceKg) / total(character, id);
            expect(Vehicle.massShare(character, id)).toBeCloseTo(share, 12);
            for (const [field, power] of Object.entries(RULE.power)) expect(Vehicle.massScale(character, id, field)).toBeCloseTo(Math.pow(share, power), 12);
            const pair = Vehicle.pairOf(character, id), own = Vehicle.physicsOf(character, id);
            expect(pair.acceleration / (own.acceleration || 1)).toBeCloseTo(share, 12);
            expect(pair.maxSpeed).toBe(own.maxSpeed);
        }
        // Two made-up riders on the superbike: the pull is in the inverse ratio of the two totals
        const superbike = Object.keys(BIKE_MODELS).find(id => BIKE_MODELS[id].cls === 'supersport');
        const kg = BIKE_MODELS[superbike].kg;
        const ratio = Vehicle.massScale({ kg: 60 }, superbike, 'acceleration') / Vehicle.massScale({ kg: 110 }, superbike, 'acceleration');
        expect(ratio).toBeCloseTo((kg + 110) / (kg + 60), 12);
    });

    test('a made-up character with no kg weighs the reference 80 kg and rides exactly as before the rule, and so does an 80 kg rider', () => {
        for (const base of [CHARACTERS[0], CHARACTERS[2]]) {
            const plain = { ...base };
            delete plain.kg;
            const eighty = { ...base, kg: RULE.referenceKg };
            for (const rider of [plain, eighty]) {
                expect(Vehicle.riderKgOf(rider)).toBe(RULE.referenceKg);
                for (const id of rider.bikes.filter(b => BIKE_MODELS[b])) {
                    expect(Vehicle.massShare(rider, id)).toBe(1);
                    expect(Vehicle.pairOf(rider, id)).toEqual(Vehicle.physicsOf(rider, id));
                    expect(Vehicle.wheelieOf(id, Vehicle.riderKgOf(rider))).toEqual(Vehicle.wheelieOf(id));
                    const v = bikeOf(rider, id);
                    expect(v.leanMass).toBe(1);
                    expect(v.acceleration).toBe(15 * (Vehicle.physicsOf(rider, id).acceleration || 1));
                }
            }
        }
        // A weight outside the table's range is held to it
        expect(Vehicle.riderKgOf({ kg: 5 })).toBe(RULE.leastKg);
        expect(Vehicle.riderKgOf({ kg: 500 })).toBe(RULE.mostKg);
        expect(Vehicle.riderKgOf({ kg: 'heavy' })).toBe(RULE.referenceKg);
    });

    test('every character carries a weight, a game number and nothing else about the person', () => {
        for (const character of CHARACTERS) {
            expect([character.id, Number.isFinite(character.kg)]).toEqual([character.id, true]);
            expect(character.kg).toBeGreaterThanOrEqual(RULE.leastKg);
            expect(character.kg).toBeLessThanOrEqual(RULE.mostKg);
        }
        // No code names a rider or a bike: the rules read the data fields
        const source = readFileSync(path.join(REPO, 'js', 'vehicle.js'), 'utf8');
        const rules = ['Vehicle.riderKgOf', 'Vehicle.massShare', 'Vehicle.massScale', 'Vehicle.pairOf', 'Vehicle.leanMostOf', 'Vehicle.footSlopeOf', 'Vehicle.wheelieOf']
            .map(name => source.slice(source.indexOf(`${name} = `), source.indexOf('};', source.indexOf(`${name} = `)))).join('\n')
            + Vehicle.prototype.footReach.toString() + Vehicle.prototype.leanHeld.toString() + Vehicle.prototype.legLeanLimit.toString();
        for (const character of CHARACTERS) expect([character.id, new RegExp(`\\b(${character.id}|${character.name})\\b`).test(rules)]).toEqual([character.id, false]);
        for (const id of Object.keys(BIKE_MODELS)) expect([id, rules.includes(id)]).toEqual([id, false]);
    });
});

describe('one bike, every rider', () => {
    // The bike of the catalogue with the most power to spare and the lightest one: by rule
    const most = Object.keys(BIKE_MODELS).reduce((best, id) => (BIKE_MODELS[id].spare > BIKE_MODELS[best].spare ? id : best));
    const light = Object.keys(BIKE_MODELS).reduce((best, id) => (BIKE_MODELS[id].kg < BIKE_MODELS[best].kg ? id : best));

    test.each([[most], [light]])('on %s the riders are in the order of their mass: the 0 to 40 m/s time, the lean-in, the stop; the top speed is the bike\'s', (id) => {
        // The rider's own multipliers are taken out, so the mass is all that differs
        const riders = CHARACTERS.map(character => on({ ...character, physics: {}, traits: { daring: 3 } }, id))
            .sort((a, b) => a.kg - b.kg);
        const rows = riders.map(rider => ({ kg: rider.kg, accel: zeroTo40(rider, id), lean: leanIn(rider, id), stop: stop(rider, id), top: bikeOf(rider, id).maxSpeed }));
        for (let k = 1; k < rows.length; k++) {
            const a = rows[k - 1], b = rows[k];
            if (a.kg === b.kg) {
                expect(b).toEqual({ ...a, kg: b.kg });
                continue;
            }
            expect(b.accel).toBeGreaterThan(a.accel);
            expect(b.lean).toBeLessThan(a.lean);
            expect(b.stop).toBeGreaterThan(a.stop);
            expect(b.top).toBe(a.top);
        }
        console.log(`${id} (${BIKE_MODELS[id].kg} kg), by the rider's weight:\n${rows.map(r => `${r.kg} kg: 0 to 40 m/s ${r.accel.toFixed(2)} s, lean 0.2 s into a held key ${r.lean.toFixed(2)} degrees, stop from 25 m/s ${r.stop.toFixed(2)} m, top ${r.top.toFixed(1)} m/s`).join('\n')}`);
    });

    test('the wheelie reads the real rider: a lighter rider has more power to spare and a lighter load to lift', () => {
        for (const id of Object.keys(BIKE_MODELS)) {
            const weights = [60, RULE.referenceKg, 110].map(kg => Vehicle.wheelieOf(id, kg));
            expect(weights[1]).toEqual(Vehicle.wheelieOf(id));
            expect(weights[0].light).toBeGreaterThanOrEqual(weights[1].light);
            expect(weights[1].light).toBeGreaterThanOrEqual(weights[2].light);
            expect(weights[0].spare).toBeGreaterThanOrEqual(weights[1].spare);
            expect(weights[1].spare).toBeGreaterThanOrEqual(weights[2].spare);
            // The pop at walking pace follows
            expect(Vehicle.popShare(weights[0], 5)).toBeGreaterThanOrEqual(Vehicle.popShare(weights[2], 5));
        }
        // A bike's own vehicle reads its rider
        const lightest = CHARACTERS.reduce((best, c) => (c.kg < best.kg ? c : best));
        const id = lightest.bikes.find(b => BIKE_MODELS[b]);
        expect(bikeOf(lightest, id).wheelieBike).toEqual(Vehicle.wheelieOf(id, lightest.kg));
    });

    test('the acceleration bar of the rider select is the pair\'s: a lighter rider on the same bike has at least the stars of a heavier one', () => {
        const lightest = CHARACTERS.reduce((best, c) => (c.kg < best.kg ? c : best));
        const heaviest = CHARACTERS.reduce((best, c) => (c.kg > best.kg ? c : best));
        for (const id of Object.keys(BIKE_MODELS)) {
            const plain = c => on({ ...c, physics: {} }, id);
            expect(Vehicle.statsOf(plain(lightest), id).accel).toBeGreaterThanOrEqual(Vehicle.statsOf(plain(heaviest), id).accel);
        }
    });
});

describe('the outcome: the lightest rider on her supersport bike is the fastest pair', () => {
    const lightest = CHARACTERS.reduce((best, c) => (c.kg < best.kg ? c : best));
    const expected = lightest.bikes.find(id => BIKE_MODELS[id] && BIKE_MODELS[id].cls === 'supersport');
    const label = ({ character, id }) => `${character.id} on ${id}`;

    test('she owns one', () => {
        expect(expected).toBeDefined();
    });

    test('from 0 to 40 m/s in Road mode, over every rider and every bike of theirs', () => {
        RiderModes.set(RiderModes.DEFAULT);
        const rows = PAIRS.map(pair => ({ ...pair, t: zeroTo40(pair.character, pair.id) })).sort((a, b) => a.t - b.t);
        console.log(`0 to 40 m/s, every rider's best bike:\n${CHARACTERS.map(c => rows.find(r => r.character === c)).map(r => `${label(r)}: ${r.t.toFixed(2)} s`).join('\n')}`);
        expect(label(rows[0])).toBe(label({ character: lightest, id: expected }));
    });

    // The rides are in a plain node process (tests/helpers/stage-pairs.mjs: the line, the same for every pair), where
    // the whole stage takes a tenth of the time it takes here
    test('over the shipped stage on one scripted line in Road mode, and that ride is well over the board\'s floors', () => {
        const out = JSON.parse(execFileSync(process.execPath, [path.join(REPO, 'tests', 'helpers', 'stage-pairs.mjs')], { cwd: REPO, encoding: 'utf8', maxBuffer: 1 << 26 }));
        expect(out).toHaveLength(PAIRS.length);
        const rows = out.map((ride) => {
            const pair = PAIRS.find(p => p.character.id === ride.character && p.id === ride.bike);
            expect([label(pair), ride.crashed, ride.cut]).toEqual([label(pair), false, false]);
            return { ...pair, t: ride.ticks / 60, stations: ride.stations };
        });
        rows.sort((a, b) => a.t - b.t);
        console.log(`The shipped stage, one line, Road mode, every rider's best bike:\n${CHARACTERS.map(c => rows.find(r => r.character === c)).map(r => `${label(r)}: ${r.t.toFixed(2)} s`).join('\n')}\nEvery pair:\n${rows.map(r => `${label(r)}: ${r.t.toFixed(2)} s`).join('\n')}`);
        expect(label(rows[0])).toBe(label({ character: lightest, id: expected }));
        // The floors are speed bounds of a rider who accelerates and brakes without limit (tools/world/floors.mjs), so
        // no pull can pass them; the fastest pair's links are well over them
        const course = JSON.parse(readFileSync(path.join(REPO, 'functions', 'world-courses.json'), 'utf8'))['world-tremola-v1'];
        const ticks = [0, ...rows[0].stations.map(st => st.tick)];
        expect(ticks).toHaveLength(course.gateFloorsMs.length + 1);
        for (let k = 0; k < course.gateFloorsMs.length; k++) expect((ticks[k + 1] - ticks[k]) / 60 * 1000).toBeGreaterThan(course.gateFloorsMs[k] * 1.5);
        expect(rows[0].t * 1000).toBeGreaterThan(course.floorMs * 1.5);
    }, 900000);
});

describe('the bike\'s own lean limit', () => {
    const capped = Object.keys(BIKE_MODELS).filter(id => Number.isFinite(BIKE_MODELS[id][Vehicle.BIKE_LEAN.field]));

    test('one bike has one, the scooter, under every rider\'s own limit; every other bike has none', () => {
        expect(capped.map(id => BIKE_MODELS[id].cls)).toEqual(['scooter']);
        for (const id of Object.keys(BIKE_MODELS)) if (!capped.includes(id)) expect(Vehicle.leanMostOf(id)).toBe(Infinity);
        for (const id of capped) expect(Vehicle.leanMostOf(id)).toBeLessThan(WorldPhysics.leanCapDeg * Vehicle.RIDER_LEAN.least);
        // The tightest turn the bike makes at hairpin pace (radiusFloor at turnBlendSpeed) stays open to it
        const need = Math.atan(WorldPhysics.turnBlendSpeed ** 2 / (G * WorldPhysics.radiusFloor)) * 180 / Math.PI;
        for (const id of capped) expect(Vehicle.leanMostOf(id)).toBeGreaterThanOrEqual(need);
    });

    test('with every rider, in every mode, no limit of the bike in a world or on a leg is over its own', () => {
        for (const id of capped) {
            const cap = Vehicle.leanMostOf(id);
            for (const character of CHARACTERS) {
                for (const mode of RiderModes.MODES) {
                    RiderModes.set(mode.id);
                    const v = onPlane(bikeOf(on(character, id), id));
                    expect([character.id, mode.id, v.worldPhysics.leanCapDeg <= cap]).toEqual([character.id, mode.id, true]);
                    expect(v.legLeanLimit()).toBeLessThanOrEqual(cap * Vehicle.BIKE_LEAN.legPerWorld * Math.PI / 180 + 1e-12);
                    // Held hard over at every speed, with the edge lean's extra grip too, the bike never leans past it
                    let most = 0;
                    for (const speed of [4, 8, 14, 20, 30]) {
                        v.leanAngle = 0;
                        v.leanVelocity = 0;
                        for (let i = 0; i < 240; i++) {
                            v.speed = speed;
                            v.updateWorldPhysics(DT, i % 120 < 60 ? 1 : -1);
                            most = Math.max(most, Math.abs(v.leanAngle) * 180 / Math.PI);
                            if (v.crashed) break;
                        }
                    }
                    expect([character.id, mode.id, most <= cap + 1e-9]).toEqual([character.id, mode.id, true]);
                }
            }
            // The rider's daring still counts under the cap: a daring rider on a bike with a cap higher than every
            // rider's own limit has their own
            RiderModes.set(RiderModes.DEFAULT);
            const daring = CHARACTERS.reduce((best, c) => (Vehicle.leanOf(c) > Vehicle.leanOf(best) ? c : best));
            const v = onPlane(bikeOf(daring, daring.bikes[0]));
            expect(v.worldPhysics.leanCapDeg).toBeCloseTo(WorldPhysics.leanCapDeg * Vehicle.leanOf(daring), 12);
        }
    });

    test('the board floors are worked out at a lean the capped bike never reaches', () => {
        for (const id of capped) expect(Vehicle.leanMostOf(id)).toBeLessThan(WorldPhysics.floorLeanDeg);
    });
});
