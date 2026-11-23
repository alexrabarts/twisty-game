/**
 * @jest-environment node
 */
// A wheelie by the bike: how light it is sets the pop at low speed, and the power it has to spare sets how much of the
// pop and of the throttle's lift is left at speed (Vehicle.wheelieOf, popShare, liftShare, Vehicle.WHEELIE). Before,
// every bike popped alike and the throttle held any of them up at any speed. The real Vehicle and the real catalogue,
// by rule: no test names a bike.
import { describe, test, expect } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';

const DT = 1 / 60;
const DEG = 180 / Math.PI;
const game = loadGame();
const { Vehicle, CHARACTERS, BIKE_MODELS } = game;
const RULE = Vehicle.WHEELIE;
const BIKES = Object.keys(BIKE_MODELS).map(id => ({ id, ...Vehicle.wheelieOf(id) }));
const by = (key, sign) => BIKES.reduce((best, bike) => (sign * (bike[key] - best[key]) > 0 ? bike : best));
const weakest = by('spare', -1);
const strongest = by('spare', 1);
const lightest = by('light', 1);

// A vehicle with a neutral rider (multipliers of 1) on `facts`: a catalogue id, or a made-up entry { kg, spare }
function ride(facts, speed) {
    const v = new Vehicle(new game.THREE.Scene(), null, CHARACTERS[0], undefined, { model: false });
    v.wheelieBike = Vehicle.wheelieOf(facts);
    v.wheeliePopMult = 1;
    v.wheelieThrottleMult = 1;
    v.speed = speed;
    return v;
}

// A pop at a held speed with the throttle at `throttle` all the way: the rate it starts at, the highest angle
// (degrees) and whether the front is still up `seconds` later
function pop(facts, speed, throttle = 0, seconds = 3) {
    const v = ride(facts, speed);
    v.updateWheelie(DT, throttle, 0, 1);
    const rate = v.wheelieVelocity;
    let peak = v.wheelieAngle;
    for (let i = 0; i < seconds * 60 && v.isWheelie; i++) {
        v.speed = speed;
        v.updateWheelie(DT, throttle, 0, 0);
        peak = Math.max(peak, v.wheelieAngle);
    }
    return { rate, peak: peak * DEG, up: v.isWheelie, crashed: v.crashed };
}

// The lift a bike can hold at a speed: the angle (degrees) a pinned throttle settles the front at once the pop is
// spent, 8 s on; 0 when the front comes down, and `cap` for a bike the throttle carries past it
function lift(facts, speed, cap = 60) {
    const v = ride(facts, speed);
    v.updateWheelie(DT, 1, 0, 1);
    for (let i = 0; i < 480; i++) {
        v.speed = speed;
        v.updateWheelie(DT, 1, 0, 0);
        if (!v.isWheelie) return 0;
        if (v.wheelieAngle * DEG >= cap) return cap;
    }
    return v.wheelieAngle * DEG;
}

// A simple scripted throttle: a pop, then all of it under 25 degrees and none over. Whether the front stays up 8 s
function holds(facts, speed) {
    const v = ride(facts, speed);
    v.updateWheelie(DT, 1, 0, 1);
    for (let i = 0; i < 480; i++) {
        v.speed = speed;
        v.updateWheelie(DT, v.wheelieAngle * DEG < 25 ? 1 : 0, 0, 0);
        if (!v.isWheelie) return false;
    }
    return v.wheelieAngle * DEG > 5;
}

describe('the two facts of a bike', () => {
    test('every bike of the catalogue and every procedural kind names its weight and its spare power', () => {
        for (const entry of [...Object.values(BIKE_MODELS), ...Object.values(Vehicle.BIKES)]) {
            expect(entry.kg).toBeGreaterThan(80);
            expect(entry.kg).toBeLessThan(450);
            expect(entry.spare).toBeGreaterThanOrEqual(0);
            expect(entry.spare).toBeLessThanOrEqual(1);
        }
        // The catalogue spans the rule: a bike with no power to spare, one with all of it, a light one and a heavy one
        expect(weakest.spare).toBe(0);
        expect(strongest.spare).toBe(1);
        expect(lightest.light).toBeGreaterThan(0.9);
        expect(by('light', -1).light).toBeLessThan(0.1);
    });

    test('a vehicle takes them from the bike it is, and a bike that names none gets the usual', () => {
        for (const character of CHARACTERS) {
            for (const id of character.bikes) {
                const v = new Vehicle(new game.THREE.Scene(), null, character, id, { model: false });
                // With the real rider (Vehicle.wheelieOf, the rider's weight: tests/unit/rider-mass.test.js)
                expect(v.wheelieBike).toEqual(Vehicle.wheelieOf(id, Vehicle.riderKgOf(character)));
            }
        }
        expect(Vehicle.wheelieOf('no such bike')).toEqual(Vehicle.wheelieOf(RULE.usual));
        expect(Vehicle.wheelieOf({})).toEqual(Vehicle.wheelieOf(RULE.usual));
        // The usual bike pops as every bike did at low speed, less only the little drive gone by then
        expect(Vehicle.popShare(Vehicle.wheelieOf(RULE.usual), 0)).toBeCloseTo(1, 2);
    });

    test('a made-up entry gets its curves from its two facts alone', () => {
        for (const bike of BIKES) {
            const entry = BIKE_MODELS[bike.id];
            const made = { kg: entry.kg, spare: entry.spare, name: 'made up', cls: 'none' };
            for (const speed of [0, 5, 20, 40, 60]) {
                expect(Vehicle.popShare(Vehicle.wheelieOf(made), speed)).toBe(Vehicle.popShare(Vehicle.wheelieOf(bike.id), speed));
                expect(Vehicle.liftShare(Vehicle.wheelieOf(made), speed)).toBe(Vehicle.liftShare(Vehicle.wheelieOf(bike.id), speed));
            }
        }
        // Lighter than any bike with as much power: it pops higher than every catalogue bike at low speed and holds at speed
        const made = { kg: RULE.lightKg, spare: 1 };
        for (const bike of BIKES) expect(pop(made, 5).rate).toBeGreaterThanOrEqual(pop(bike.id, 5).rate);
        expect(holds(made, 45)).toBe(true);
        // As heavy as can be and with nothing to spare: the lowest pop of all, and no hold anywhere
        const lump = { kg: RULE.heavyKg, spare: 0 };
        for (const bike of BIKES) expect(pop(lump, 5).rate).toBeLessThanOrEqual(pop(bike.id, 5).rate);
        for (const speed of [8, 25, 45]) expect(holds(lump, speed)).toBe(false);
    });
});

describe('the pop, by how light the bike is and the drive it has', () => {
    test('at 5 m/s a lighter bike with no less power pops no lower, over every pair of the catalogue', () => {
        let pairs = 0;
        for (const a of BIKES) {
            for (const b of BIKES) {
                if (a.light < b.light || a.spare < b.spare) continue;
                pairs++;
                expect(pop(a.id, 5).rate).toBeGreaterThanOrEqual(pop(b.id, 5).rate);
                expect(pop(a.id, 5).peak).toBeGreaterThanOrEqual(pop(b.id, 5).peak);
            }
        }
        expect(pairs).toBeGreaterThan(BIKES.length);
    });

    test('at 5 m/s the pop is ordered by lightness alone for bikes of one power, and the weight no longer counts at speed', () => {
        for (const spare of [0.1, 0.5, 1]) {
            const kgs = [140, 150, 170, 190, 210, 230, 250, 280];
            const rates = kgs.map(kg => pop({ kg, spare }, 5).rate);
            for (let i = 1; i < kgs.length; i++) expect(rates[i]).toBeLessThanOrEqual(rates[i - 1]);
            expect(rates[1]).toBeGreaterThan(rates[6] * 1.3);
            expect(pop({ kg: 150, spare }, RULE.weightTo).rate).toBeCloseTo(pop({ kg: 250, spare }, RULE.weightTo).rate, 12);
        }
    });

    test('the lightest bike pops higher than the bike with the most power at 5 m/s, and lower at 40', () => {
        expect(pop(lightest.id, 5).peak).toBeGreaterThan(pop(strongest.id, 5).peak * 1.1);
        expect(pop(lightest.id, 40).peak).toBeLessThan(pop(strongest.id, 40).peak * 0.5);
    });

    test('the heaviest bike builds a little slower at low speed: under the usual pop, over two thirds of it', () => {
        const heavy = by('light', -1);
        const usual = pop(RULE.usual, 5).rate;
        expect(pop(heavy.id, 5).rate).toBeLessThan(usual * 0.95);
        expect(pop(heavy.id, 5).rate).toBeGreaterThan(usual * 0.67);
    });

    test('no bike pops higher as the speed rises past the low-speed band, and there is no step in it', () => {
        for (const bike of BIKES) {
            const facts = Vehicle.wheelieOf(bike.id);
            for (let s = RULE.weightTo; s < 70; s += 0.5) expect(Vehicle.popShare(facts, s + 0.5)).toBeLessThanOrEqual(Vehicle.popShare(facts, s));
            for (let s = 0; s < 70; s += 0.5) expect(Math.abs(Vehicle.popShare(facts, s + 0.5) - Vehicle.popShare(facts, s))).toBeLessThan(0.03);
            for (let s = 0; s < 70; s += 0.5) expect(Vehicle.liftShare(facts, s + 0.5)).toBeLessThanOrEqual(Vehicle.liftShare(facts, s));
        }
    });

    test('the rider keeps their own pop and throttle on top of the bike', () => {
        const fast = CHARACTERS.reduce((a, b) => (b.physics.wheeliePop > a.physics.wheeliePop ? b : a));
        const slow = CHARACTERS.reduce((a, b) => (b.physics.wheeliePop < a.physics.wheeliePop ? b : a));
        expect(fast.physics.wheeliePop).toBeGreaterThan(slow.physics.wheeliePop);
        for (const speed of [12, 30, 55]) {
            const rates = [fast, slow].map((character) => {
                const v = new Vehicle(new game.THREE.Scene(), null, character, undefined, { model: false });
                v.wheelieBike = Vehicle.wheelieOf(strongest.id);
                v.environment = { physics: game.WorldPhysics };
                v.speed = speed;
                // Through the whole update, as the game calls it
                v.update(DT, 0, 0, 0, 1);
                expect(v.isWheelie).toBe(true);
                return v.wheelieVelocity;
            });
            expect(rates[0] / rates[1]).toBeGreaterThan(1.2);
            // 3.5 rad/s x the rider's pop x the bike's share, less one frame of the wheelie's gravity and damping
            const whole = 3.5 * fast.physics.wheeliePop * Vehicle.popShare(Vehicle.wheelieOf(strongest.id), speed);
            expect(rates[0]).toBeLessThanOrEqual(whole);
            expect(rates[0]).toBeGreaterThan(whole * 0.93);
        }
        const v = ride(strongest.id, 30);
        v.wheelieThrottleMult = 1.15;
        v.updateWheelie(DT, 0, 0, 1);
        const before = v.wheelieVelocity;
        const plain = ride(strongest.id, 30);
        plain.updateWheelie(DT, 0, 0, 1);
        v.updateWheelie(DT, 1, 0, 0);
        plain.updateWheelie(DT, 1, 0, 0);
        expect(before).toBeGreaterThan(0);
        expect(plain.wheelieVelocity).toBeLessThan(v.wheelieVelocity);
    });
});

describe('the throttle\'s lift, by the power the bike has to spare', () => {
    test('the lift a bike can hold at 10, 25 and 45 m/s is ordered by its spare power', () => {
        const order = [...BIKES].sort((a, b) => a.spare - b.spare);
        for (const speed of [10, 25, 45]) {
            const lifts = order.map(bike => lift(bike.id, speed));
            for (let i = 1; i < order.length; i++) {
                expect(lifts[i]).toBeGreaterThanOrEqual(lifts[i - 1]);
                expect(Vehicle.liftShare(order[i], speed)).toBeGreaterThanOrEqual(Vehicle.liftShare(order[i - 1], speed));
            }
            // It tells the bikes apart: nothing for the weakest, a wheelie for the strongest
            expect(lifts[0]).toBe(0);
            expect(lifts[lifts.length - 1]).toBeGreaterThan(30);
        }
        // At 10 m/s every bike with power lifts; by 45 m/s some of those can hold nothing
        const powered = order.filter(bike => bike.spare > 0);
        for (const bike of powered) expect(lift(bike.id, 10)).toBeGreaterThan(30);
        const gone = powered.filter(bike => lift(bike.id, 45) === 0).length;
        expect(gone).toBeGreaterThan(0);
        expect(gone).toBeLessThan(powered.length);
    });

    test('the bike with the least power: a pop is a bump of a few degrees at any speed, and it falls back with the throttle held open', () => {
        for (const speed of [5, 20, 40]) {
            for (const throttle of [0, 1]) {
                const bump = pop(weakest.id, speed, throttle);
                expect(bump.peak).toBeGreaterThan(2);
                expect(bump.peak).toBeLessThan(6);
                expect(bump.up).toBe(false);
                expect(bump.crashed).toBe(false);
            }
            // Down within half a second
            expect(pop(weakest.id, speed, 1, 0.5).up).toBe(false);
            expect(holds(weakest.id, speed)).toBe(false);
        }
    });

    test('the bikes with the most power hold a wheelie at 40 m/s; the lightest bike cannot at 40 but can at 8', () => {
        const top = [...BIKES].sort((a, b) => b.spare - a.spare).slice(0, 5);
        for (const bike of top) {
            expect(bike.spare).toBeGreaterThan(0.5);
            expect(holds(bike.id, 40)).toBe(true);
        }
        expect(holds(strongest.id, 45)).toBe(true);
        expect(lightest.spare).toBeLessThan(0.2);
        expect(holds(lightest.id, 40)).toBe(false);
        expect(holds(lightest.id, 8)).toBe(true);
    });

    test('the flip crash is kept: a pinned throttle at low speed still goes over on a bike with power', () => {
        for (const bike of [strongest, lightest]) {
            const over = pop(bike.id, 8, 1, 6);
            expect(over.crashed).toBe(true);
        }
    });
});
