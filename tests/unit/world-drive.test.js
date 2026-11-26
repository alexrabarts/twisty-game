// World drive: the real js/vehicle.js against the one before the drive change (de5a931), on a flat plane. Before, a
// key press gave the whole of the bike's acceleration (15 m/s^2) on the first frame and at every speed: 0-100 km/h in
// 1.75 s. The world opens the throttle over throttleRiseS and gives the engine a curve (a soft launch, the traction
// limit, then constant power), with the air drag covered so the top speed holds. The legs keep the constant pull.
import { describe, test, expect } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import { loadGame, realThree, canvasStub } from '../helpers/load-game.js';

const DT = 1 / 60;
const game = loadGame();
// The rides here are held against commits from before the rider's weight (RIDER_MASS, Vehicle.pairOf), or measure
// the bike alone: every character rides at the reference weight, at which that rule moves nothing to the last bit
// (tests/unit/rider-mass.test.js holds the rule itself)
for (const character of game.CHARACTERS) delete character.kg;
const { THREE, WorldPhysics } = game;
const BEFORE = 'de5a931';
const quiet = { log() {}, warn() {}, error() {} };
const Before = new Function('THREE', 'document', 'console', `${execFileSync('git', ['show', `${BEFORE}:js/vehicle.js`], { encoding: 'utf8', maxBuffer: 1 << 26 })}\nreturn Vehicle;`)(
    realThree(), canvasStub(), quiet
);
const KMH = 1 / 3.6;

function onPlane(VehicleClass, speed = 0) {
    const vehicle = new VehicleClass(new THREE.Scene());
    vehicle.environment = {
        physics: WorldPhysics,
        route: { unitCount: 0, fromUnits: u => u, project: () => ({ index: -1 }), sample: () => ({ grade: 0, flags: {} }) }
    };
    vehicle.speed = speed;
    return vehicle;
}

// Seconds of full throttle from a standstill to each of `marks` (km/h)
function times(VehicleClass, marks) {
    const vehicle = onPlane(VehicleClass);
    const out = {};
    let time = 0;
    while (time < 60 && Object.keys(out).length < marks.length) {
        vehicle.update(DT, 0, 1, 0);
        time += DT;
        for (const mark of marks) if (out[mark] === undefined && vehicle.speed >= mark * KMH) out[mark] = time;
    }
    return out;
}

// Speed gained over `seconds` after the throttle is pressed at `speed`, from a coast
function gain(VehicleClass, speed, seconds) {
    const vehicle = onPlane(VehicleClass, speed);
    for (let tick = 0; tick < 30; tick++) vehicle.update(DT, 0, 0, 0);
    const start = vehicle.speed;
    for (let tick = 0; tick < Math.round(seconds * 60); tick++) vehicle.update(DT, 0, 1, 0);
    return vehicle.speed - start;
}

describe('the throttle opens over throttleRiseS', () => {
    test.each([5, 15, 30])('the first 0.2 s after pressing the throttle at %i m/s gives under a third of the old pull', (speed) => {
        const before = gain(Before, speed, 0.2);
        const after = gain(game.Vehicle, speed, 0.2);
        expect(before).toBeGreaterThan(2.5);
        expect(after).toBeLessThan(before / 3);
    });

    test('it is fully open a frame after throttleRiseS and shut a frame after throttleFallS', () => {
        const vehicle = onPlane(game.Vehicle, 20);
        for (let tick = 0; tick <= Math.ceil(WorldPhysics.throttleRiseS * 60); tick++) vehicle.update(DT, 0, 1, 0);
        expect(vehicle.worldThrottle).toBe(1);
        for (let tick = 0; tick <= Math.ceil(WorldPhysics.throttleFallS * 60); tick++) vehicle.update(DT, 0, 0, 0);
        expect(vehicle.worldThrottle).toBe(0);
    });
});

describe('the engine curve', () => {
    // The pull on the flat at full throttle, net of the air drag
    const net = (vehicle, v) => vehicle.worldDrive(v) - WorldPhysics.aeroDrag * v * v;

    test('the pull grows over the launch, then falls with speed toward the top', () => {
        const vehicle = onPlane(game.Vehicle);
        expect(net(vehicle, 0)).toBeCloseTo(vehicle.acceleration * WorldPhysics.driveShare * WorldPhysics.launchShare, 9);
        expect(net(vehicle, 3)).toBeGreaterThan(net(vehicle, 0));
        const speeds = [WorldPhysics.powerSpeed, 20, 30, 45, 60];
        for (let i = 1; i < speeds.length; i++) expect(net(vehicle, speeds[i])).toBeLessThan(net(vehicle, speeds[i - 1]));
        expect(net(vehicle, 30)).toBeLessThan(net(vehicle, 12) * 0.6);
    });

    test('0-100 km/h takes 3 to 4.5 s (a sporty bike), against 1.75 s before; 50-100 and 100-150 are slower still', () => {
        const before = times(Before, [50, 100, 150]);
        const after = times(game.Vehicle, [50, 100, 150]);
        expect(before[100]).toBeLessThan(2);
        expect(after[100]).toBeGreaterThan(3);
        expect(after[100]).toBeLessThan(4.5);
        expect(after[150] - after[100]).toBeGreaterThan(after[100] - after[50]);
        expect(after[100] - after[50]).toBeGreaterThan(before[100] - before[50]);
    });

    test('the top speed is still reached', () => {
        const vehicle = onPlane(game.Vehicle);
        for (let tick = 0; tick < 60 * 60 && vehicle.speed < vehicle.maxSpeed; tick++) vehicle.update(DT, 0, 1, 0);
        expect(vehicle.speed).toBe(vehicle.maxSpeed);
    });

    test("a character's acceleration scales the whole curve", () => {
        const base = onPlane(game.Vehicle);
        const quick = onPlane(game.Vehicle);
        quick.acceleration = base.acceleration * 1.3;
        for (const v of [0, 4, 10, 20, 40]) expect(net(quick, v)).toBeCloseTo(net(base, v) * 1.3, 9);
    });
});

describe('the legs keep their throttle', () => {
    // A leg: no world physics. updateSpeed with the throttle against de5a931 at every tick
    function trace(VehicleClass) {
        const vehicle = new VehicleClass(new THREE.Scene());
        // The bike's brake is a number of today's bike (the owner's tuning of 2026-11-21 lowered it): the code path is
        // what is compared
        vehicle.brakeForce = new game.Vehicle(new THREE.Scene()).brakeForce;
        vehicle.environment = { physics: null };
        vehicle.speed = 0;
        const out = [];
        for (let tick = 0; tick < 300; tick++) {
            const throttle = tick % 60 < 40 ? 1 : tick % 7 === 0 ? 0.4 : 0;
            vehicle.updateSpeed(DT, throttle, tick % 60 > 55 ? 1 : 0);
            out.push(vehicle.speed);
        }
        return out;
    }

    test('updateSpeed matches de5a931 at every tick', () => {
        const a = trace(Before), b = trace(game.Vehicle);
        for (let tick = 0; tick < a.length; tick++) expect(Object.is(a[tick], b[tick])).toBe(true);
    });
});
