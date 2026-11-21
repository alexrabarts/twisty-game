/**
 * @jest-environment node
 */
// The shape contact is tested with (Traffic.CONTACT, Traffic.overlap in js/traffic.js): a box in the ground plane for
// each bike and car, box against box. A ball about the origin, as before, hit the player 0.85 m clear of a car's side
// and missed a bike at its wheels. The rides that use the shape are tests/unit/world-contact.test.js.
import { describe, test, expect } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';
import { SIZE, box, depth } from '../helpers/world-contact.js';

const game = loadGame(undefined, []);
const { Traffic, CHARACTERS, BIKE_MODELS } = game;
const bike = (x, z, yaw = 0) => Traffic.box(x, z, yaw, Traffic.CONTACT.boxes.bike);
const car = (x, z, yaw = 0) => Traffic.box(x, z, yaw, Traffic.CONTACT.boxes.car);

describe('the sizes', () => {
    test('a bike is its wheelbase and its tyres long and its bar wide, a car its body: the sizes the tests measure with', () => {
        expect(Traffic.CONTACT.boxes).toEqual(SIZE);
        // The wheelbase of the bikes (Vehicle, AIMotorcycle: 1.4 m) and a 0.3 m tyre at each end
        expect(Traffic.CONTACT.boxes.bike.length).toBeGreaterThanOrEqual(1.4 + 2 * 0.3);
        expect(Traffic.CONTACT.boxes.bike.length).toBeLessThanOrEqual(2.3);
    });

    test('every bike of every character has a box with no line of code: the kind\'s, or its model\'s own', () => {
        for (const character of CHARACTERS) {
            for (const id of Object.keys(BIKE_MODELS)) {
                const size = Traffic.sizeOf('bike', id);
                expect(size.length).toBeGreaterThan(1.5);
                expect(size.width).toBeGreaterThan(0.5);
            }
            expect(Traffic.sizeOf('bike', character.bike)).toBeTruthy();
        }
        expect(Traffic.sizeOf('bike', 'a bike nobody has drawn yet')).toBe(Traffic.CONTACT.boxes.bike);
        const own = { length: 2.4, width: 0.9 };
        BIKE_MODELS.testLong = { contact: own };
        try { expect(Traffic.sizeOf('bike', 'testLong')).toBe(own); } finally { delete BIKE_MODELS.testLong; }
    });
});

describe('box against box', () => {
    const both = (a, b) => {
        const mine = Traffic.overlap(a, b), other = Traffic.overlap(b, a), measured = depth(a, b);
        expect(mine).toBeCloseTo(other, 12);
        // The game's test and the tests' own measure agree
        expect(mine).toBeCloseTo(measured, 12);
        return mine;
    };

    test('apart: side by side with air between, nose to tail with air between', () => {
        expect(both(bike(0, 0), bike(0.81, 0))).toBe(0);
        expect(both(bike(0, 0), bike(0, 2.11))).toBe(0);
        expect(both(bike(0, 0), bike(5, 5, 1))).toBe(0);
    });

    test('touching is not in each other: bars that just meet, a wheel that just meets a wheel', () => {
        expect(both(bike(0, 0), bike(0.8, 0))).toBe(0);
        expect(both(bike(0, 0), bike(0, 2.1))).toBe(0);
        expect(both(bike(0, 0), bike(0.79, 0))).toBeCloseTo(0.01, 9);
        expect(both(bike(0, 0), bike(0, 2.09))).toBeCloseTo(0.01, 9);
    });

    test('the box is the bike, not a ball: a bike a metre to the side is clear along its whole length, one a metre behind is hit', () => {
        for (let z = -3; z <= 3; z += 0.25) expect(both(bike(0, 0), bike(1, z))).toBe(0);
        expect(both(bike(0, 0), bike(0, -1))).toBeGreaterThan(0.39);
        // The old ball (0.8 m between the origins) passed a front wheel through a back wheel: origins 1.5 m apart
        expect(Math.hypot(0, 1.5)).toBeGreaterThan(0.8);
        expect(both(bike(0, 0), bike(0, 1.5))).toBeGreaterThan(0.39);
    });

    test('rotated: across each other, at 45 degrees corner to side, and the same whatever way the pair is turned', () => {
        // A bike across another's nose: its side at the other's front tyre
        expect(both(bike(0, 0), bike(0, 1.05 + 0.4 + 0.01, Math.PI / 2))).toBe(0);
        expect(both(bike(0, 0), bike(0, 1.05 + 0.4 - 0.05, Math.PI / 2))).toBeCloseTo(0.05, 9);
        // At 45 degrees a corner reaches (1.05 + 0.4) / sqrt 2 = 1.025 m to the side
        const reach = (1.05 + 0.4) / Math.SQRT2;
        expect(both(bike(0, 0), bike(0.4 + reach + 0.01, 0, Math.PI / 4))).toBe(0);
        expect(both(bike(0, 0), bike(0.4 + reach - 0.03, 0, Math.PI / 4))).toBeGreaterThan(0);
        // A diagonal miss: along the first bike's own axes the two reach past each other (0.23 m and 0.15 m), and only
        // the turned bike's own length shows the air between its tail and the other's corner
        const turned = bike(1.2, 1.9, Math.PI / 4);
        expect(Traffic.reachAlong(bike(0, 0), turned, 1, 0)).toBeGreaterThan(0);
        expect(Traffic.reachAlong(bike(0, 0), turned, 0, 1)).toBeGreaterThan(0);
        expect(both(bike(0, 0), turned)).toBe(0);
        expect(both(bike(0, 0), bike(1.05, 1.75, Math.PI / 4))).toBeGreaterThan(0);
        for (const turn of [0.3, 1.1, 2.5, -2]) {
            const spin = (b) => Traffic.box(b.x * Math.cos(turn) + b.z * Math.sin(turn), -b.x * Math.sin(turn) + b.z * Math.cos(turn), b.yaw + turn, { length: b.halfLength * 2, width: b.halfWidth * 2 });
            const a = bike(0.2, -0.3, 0.4), b = bike(0.9, 0.8, -0.7), c = bike(1.5, 1.9, 1.3);
            expect(both(spin(a), spin(b))).toBeCloseTo(both(a, b), 9);
            expect(both(spin(a), spin(c))).toBeCloseTo(both(a, c), 9);
        }
    });

    test('one inside the other: a bike within a car, and a box in itself', () => {
        expect(both(car(0, 0), bike(0, 0))).toBeCloseTo(0.4 + 0.95, 9);
        expect(both(car(0, 0), bike(0.2, 0.5, 0.3))).toBeGreaterThan(0.8);
        expect(both(bike(3, 4, 1), bike(3, 4, 1))).toBeCloseTo(0.8, 9);
    });

    test('a car is hit where its body is: 0.5 m beside it is clear from nose to tail, where the old 2.2 m ball was a crash', () => {
        const side = 0.95 + 0.4 + 0.5;
        for (let z = -4; z <= 4; z += 0.25) expect(both(car(0, 0), bike(side, z))).toBe(0);
        expect(Math.hypot(side, 0)).toBeLessThan(2.2);
        expect(both(car(0, 0), bike(0.95 + 0.4 - 0.1, 0))).toBeCloseTo(0.1, 9);
        expect(both(car(0, 0), bike(0, 2.1 + 1.05 - 0.1))).toBeCloseTo(0.1, 9);
        expect(both(car(0, 0), bike(0, 2.1 + 1.05 + 0.1))).toBe(0);
    });

    test('reachAlong is how far to move one box along a line to set the two apart', () => {
        const a = bike(0, 0), b = bike(0.5, 0.3, 0.2);
        const reach = Traffic.reachAlong(a, b, 1, 0);
        expect(reach).toBeGreaterThan(0);
        const moved = bike(0.5 + reach + 1e-6, 0.3, 0.2);
        expect(Traffic.overlap(a, moved)).toBe(0);
        expect(Traffic.overlap(a, bike(0.5 + reach - 0.01, 0.3, 0.2))).toBeGreaterThan(0);
    });
});
