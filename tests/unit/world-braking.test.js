// World braking: the real js/vehicle.js against the one before the braking change (4d46901), on a plane (flat, a
// 10% descent, cobbles) and on a straight synthetic world whose ground beside the road is open run-off (grass).
// The world brake is stronger (brakeGain), shares the grip with the lean (trail braking down to trailBrakeFloor
// at the cap), keeps runoffBrakeGrip of itself on run-off, and the engine brakes with the throttle closed. The
// legs keep the bike's own brake, bit for bit.
import { describe, test, expect } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import { loadGame, realThree, canvasStub } from '../helpers/load-game.js';
import { samplesOf, fakeData, allTiles, straight } from '../helpers/world-synthetic.js';

const DT = 1 / 60;
const deg = radians => radians * 180 / Math.PI;
const game = loadGame();
const { THREE, WorldRoute, WorldGround, WorldPhysics } = game;
const BEFORE = '4d46901';
const quiet = { log() {}, warn() {}, error() {} };
const Before = new Function('THREE', 'document', 'console', `${execFileSync('git', ['show', `${BEFORE}:js/vehicle.js`], { encoding: 'utf8', maxBuffer: 1 << 26 })}\nreturn Vehicle;`)(
    realThree(), canvasStub(), quiet
);
const NO_ENGINE = Object.freeze({ ...WorldPhysics, engineBrake: 0 });

function onPlane(VehicleClass, { grade = 0, cobbles = false, physics = WorldPhysics } = {}) {
    const vehicle = new VehicleClass(new THREE.Scene());
    vehicle.environment = {
        physics,
        route: { unitCount: 0, fromUnits: u => u, project: () => ({ index: -1 }), sample: () => ({ grade, flags: { cobbles } }) }
    };
    return vehicle;
}

// A 10 m road along +z with open run-off (grass) either side; the bike rides straight at `lateral`
function onGrass(VehicleClass, lateral = 9, physics = WorldPhysics) {
    const route = new WorldRoute(samplesOf(straight(3000)), {});
    const ground = new WorldGround(route, fakeData({ tiles: allTiles(-1, 0, -1, 6), zone: x => (Math.abs(x) <= 5 ? 1 : 0) }));
    const vehicle = new VehicleClass(new THREE.Scene());
    vehicle.environment = { physics, route, ground };
    vehicle.assistLevel = 'off';
    vehicle.position.set(lateral, 100, 40);
    vehicle.yawAngle = 0;
    vehicle.findNearestRoadSegment();
    return vehicle;
}

// Full brake from v0 to a stop: distance, time, and whether it crashed or reared up
function stop(vehicle, v0, steer = () => 0) {
    vehicle.speed = v0;
    const out = { distance: 0, time: 0, crashed: false, wheelie: false, lean: 0 };
    while (vehicle.speed > 0 && out.time < 20) {
        vehicle.update(DT, steer(vehicle), 0, 1);
        out.distance += vehicle.speed * DT;
        out.time += DT;
        out.lean = Math.max(out.lean, Math.abs(vehicle.leanAngle));
        if (vehicle.isWheelie) out.wheelie = true;
        if (vehicle.crashed) { out.crashed = true; break; }
    }
    return out;
}

describe('stopping distance, before and after', () => {
    const cases = {
        flat: V => onPlane(V),
        'a 10% descent': V => onPlane(V, { grade: -0.10 }),
        cobbles: V => onPlane(V, { cobbles: true }),
        'run-off grass': V => onGrass(V)
    };
    // The after distance is at most this share of the before one
    const SHARE = { flat: 0.75, 'a 10% descent': 0.75, cobbles: 0.75, 'run-off grass': 0.6 };

    for (const [name, make] of Object.entries(cases)) {
        for (const v0 of [20, 30, 40]) {
            test(`${name} from ${v0} m/s stops clearly shorter, with no crash`, () => {
                const before = stop(make(Before), v0);
                const after = stop(make(game.Vehicle), v0);
                expect(before.crashed).toBe(false);
                expect(after.crashed).toBe(false);
                expect(after.wheelie).toBe(false);
                expect(after.distance).toBeLessThan(before.distance * SHARE[name]);
                expect(after.time).toBeLessThan(before.time);
            });
        }
    }

    test('30 m/s on the flat: about 20 m before and about 14 m after', () => {
        expect(stop(onPlane(Before), 30).distance).toBeCloseTo(20.3, 0);
        expect(stop(onPlane(game.Vehicle), 30).distance).toBeCloseTo(14.1, 0);
    });

    test('off the road the brake is no longer weaker than on it', () => {
        for (const v0 of [20, 30, 40]) {
            const grass = stop(onGrass(game.Vehicle), v0);
            const road = stop(onPlane(game.Vehicle), v0);
            expect(grass.distance).toBeLessThanOrEqual(road.distance + 0.5);
            // Before, run-off halved the brake: from 20 m/s it took 40% further than on the road
            expect(stop(onGrass(Before), v0).distance).toBeGreaterThan(stop(onPlane(Before), v0).distance);
        }
    });

    test('the off-road clock stays fair: a stop on the grass from 40 m/s takes well under maxOffRoadTime', () => {
        const vehicle = onGrass(game.Vehicle);
        const run = stop(vehicle, 40);
        expect(run.crashed).toBe(false);
        expect(vehicle.offRoadTime).toBeLessThan(1.5);
        expect(vehicle.maxOffRoadTime).toBe(6);
    });

    test('full brake at 40 m/s on every surface and in the rain never crashes or rears up', () => {
        const rain = { surfaceGrip: 1, getPhysicsMultipliers: () => ({ lateralFriction: 0.7, brakeForce: 0.8, acceleration: 0.9 }) };
        for (const make of [...Object.values(cases), V => Object.assign(onPlane(V), { weatherSystem: rain })]) {
            const run = stop(make(game.Vehicle), 40);
            expect(run.crashed).toBe(false);
            expect(run.wheelie).toBe(false);
        }
    });
});

describe('trail braking', () => {
    const TARGET = 35 * Math.PI / 180;
    // Holds the lean near TARGET with the steering (a positive input leans the bike to negative lean)
    const holdLean = vehicle => Math.max(-1, Math.min(1, (TARGET - Math.abs(vehicle.leanAngle)) * 40));

    function leaned(VehicleClass) {
        const vehicle = onPlane(VehicleClass);
        for (let tick = 0; tick < 180; tick++) {
            vehicle.speed = 30;
            vehicle.update(DT, holdLean(vehicle), 0, 0);
        }
        return vehicle;
    }

    test('the controller settles the bike at about 35 degrees at 30 m/s', () => {
        expect(deg(Math.abs(leaned(game.Vehicle).leanAngle))).toBeCloseTo(35, -0.5);
    });

    test('braking at 35 degrees of lean slows the bike with no lowside, at most the upright brake', () => {
        const vehicle = leaned(game.Vehicle);
        const lean = Math.abs(vehicle.leanAngle);
        let crashed = false;
        let speed = vehicle.speed;
        const decels = [];
        for (let tick = 0; tick < 30; tick++) {
            vehicle.update(DT, holdLean(vehicle), 0, 1);
            decels.push((speed - vehicle.speed) / DT);
            speed = vehicle.speed;
            crashed = crashed || vehicle.crashed;
        }
        expect(crashed).toBe(false);
        expect(vehicle.lowsideTimerMs).toBe(0);
        expect(vehicle.speed).toBeLessThan(30 - 10);
        // The lean takes its share: less than the same brake upright at the same speed, more than the floor
        const straightUp = onPlane(game.Vehicle);
        straightUp.speed = 30;
        straightUp.update(DT, 0, 0, 1);
        const upright = (30 - straightUp.speed) / DT;
        const first = decels[0];
        expect(first).toBeLessThan(upright - 1);
        expect(first).toBeGreaterThan(20 * WorldPhysics.brakeGain * WorldPhysics.trailBrakeFloor);
        expect(deg(lean)).toBeGreaterThan(30);
        // Slowing mid-bend: still more than the old upright brake gave
        expect(first).toBeGreaterThan(20);
    });

    test('braking on to a stop while leaned never crashes', () => {
        const vehicle = leaned(game.Vehicle);
        const run = stop(vehicle, vehicle.speed, holdLean);
        expect(run.crashed).toBe(false);
        expect(vehicle.speed).toBe(0);
    });

    test('lean lowers the available brake smoothly, from full upright to trailBrakeFloor at the cap', () => {
        const vehicle = onPlane(game.Vehicle);
        const multipliers = { lateralFriction: 1, brakeForce: 1, acceleration: 1 };
        const full = vehicle.brakeForce * WorldPhysics.brakeGain;
        let previous = Infinity;
        for (let d = 0; d <= WorldPhysics.leanCapDeg; d += 0.5) {
            vehicle.leanAngle = d * Math.PI / 180;
            const decel = vehicle.worldBrakeDecel(multipliers);
            expect(decel).toBeLessThanOrEqual(previous + 1e-12);
            if (previous !== Infinity && d < WorldPhysics.leanCapDeg - 2) expect(previous - decel).toBeLessThan(full * 0.03);
            previous = decel;
        }
        vehicle.leanAngle = 0;
        expect(vehicle.worldBrakeDecel(multipliers)).toBeCloseTo(full, 9);
        vehicle.leanAngle = -WorldPhysics.leanCapDeg * Math.PI / 180;
        expect(vehicle.worldBrakeDecel(multipliers)).toBeCloseTo(full * WorldPhysics.trailBrakeFloor, 6);
    });
});

describe('engine braking', () => {
    function coast(vehicle, v0, seconds, throttle = 0) {
        vehicle.speed = v0;
        for (let tick = 0; tick < seconds * 60; tick++) vehicle.update(DT, 0, throttle, 0);
        return vehicle.speed;
    }

    test('with no input the engine slows the bike, well beyond the drag alone', () => {
        for (const v0 of [20, 30, 40]) {
            const engined = coast(onPlane(game.Vehicle), v0, 2);
            const dragOnly = coast(onPlane(game.Vehicle, { physics: NO_ENGINE }), v0, 2);
            expect(engined).toBeLessThan(v0);
            expect(engined).toBeLessThan(dragOnly - 2);
            expect(dragOnly).toBeCloseTo(coast(onPlane(Before), v0, 2), 9);
        }
    });

    test('it never brakes under creepSpeed, and the creep is unchanged', () => {
        expect(coast(onPlane(game.Vehicle), 12, 30)).toBeCloseTo(WorldPhysics.creepSpeed, 6);
        expect(coast(onPlane(game.Vehicle), 2, 3)).toBe(coast(onPlane(Before), 2, 3));
    });

    test('the throttle held turns it off', () => {
        expect(coast(onPlane(game.Vehicle), 20, 1, 0.2)).toBe(coast(onPlane(Before), 20, 1, 0.2));
    });

    test('a long 10% descent with the throttle closed settles near 13 m/s instead of running away', () => {
        const settled = coast(onPlane(game.Vehicle, { grade: -0.10 }), 25, 60);
        expect(settled).toBeGreaterThan(11);
        expect(settled).toBeLessThan(15);
        expect(coast(onPlane(Before, { grade: -0.10 }), 25, 60)).toBeGreaterThan(20);
    });
});

describe('the legs keep their brake', () => {
    // A leg: no world physics. The brake, run-off grip and weather path of updateSpeed against 4d46901
    function trace(VehicleClass, { runoff = null, weather = null } = {}) {
        const vehicle = new VehicleClass(new THREE.Scene());
        vehicle.environment = { physics: null };
        if (weather) vehicle.weatherSystem = weather;
        vehicle.runoff = runoff;
        vehicle.speed = 40;
        const out = [];
        for (let tick = 0; tick < 240; tick++) {
            const brake = tick % 50 < 30 ? 1 : tick % 7 === 0 ? 0.5 : 0;
            const throttle = brake ? 0 : 0.6;
            vehicle.updateSpeed(DT, throttle, brake);
            vehicle.updatePhysics(DT, Math.sin(tick / 20));
            out.push([vehicle.speed, vehicle.leanAngle, vehicle.yawAngle]);
        }
        return out;
    }

    test('updateSpeed with the brake, on and off run-off and in the rain, matches 4d46901 at every tick', () => {
        const rain = { surfaceGrip: 1, getPhysicsMultipliers: () => ({ lateralFriction: 0.7, brakeForce: 0.8, acceleration: 0.9 }) };
        for (const options of [{}, { runoff: { drag: 0.35, grip: 0.5, floorSpeed: 6 } }, { weather: rain }]) {
            const a = trace(Before, options), b = trace(game.Vehicle, options);
            for (let tick = 0; tick < a.length; tick++) {
                for (let k = 0; k < 3; k++) expect(Object.is(a[tick][k], b[tick][k])).toBe(true);
            }
        }
    });
});
