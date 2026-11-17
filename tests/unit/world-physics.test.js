// World riding physics (R1): the real js/vehicle.js loaded through loadGame, on
// a bare environment that carries `physics` and a route. The legs ride on the
// legacy body, which a9e8add's own vehicle.js proves tick for tick.
import { describe, test, expect } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import { loadGame, loadScript, loadWorldPhysics, realThree, canvasStub } from '../helpers/load-game.js';

const DT = 1 / 60;
const G = 9.81;
const deg = radians => radians * 180 / Math.PI;
const game = loadGame();
const THREE = game.THREE;
const WorldPhysics = game.WorldPhysics;
const WeatherSystem = new Function(`${loadScript('weather.js')}\nreturn WeatherSystem;`)();

// A flat or sloped plane. `flags` and `grade` are what route.sample returns.
// The route has no road units (unitCount 0, project finds nothing), so the
// road-following code of the route contract leaves the bike on the plane.
function planeEnvironment({ grade = 0, cobbles = false, physics = WorldPhysics } = {}) {
    return {
        physics,
        route: {
            unitCount: 0,
            fromUnits: units => units,
            project: () => ({ index: -1 }),
            sample: () => ({ grade, flags: { cobbles } })
        }
    };
}

function worldVehicle(options = {}, VehicleClass = game.Vehicle) {
    const vehicle = new VehicleClass(new THREE.Scene());
    vehicle.environment = planeEnvironment(options);
    return vehicle;
}

function grippy(vehicle, grip) {
    vehicle.weatherSystem = {
        surfaceGrip: 1,
        getPhysicsMultipliers: () => ({ lateralFriction: grip.value, brakeForce: 1, acceleration: 1 })
    };
    return vehicle;
}

// Runs the vehicle at a held speed with a held input; returns what happened
function hold(vehicle, speed, input, seconds) {
    const yaws = [];
    let crashTick = null;
    let peak = 0;
    const ticks = Math.round(seconds / DT);
    for (let tick = 0; tick < ticks && crashTick === null; tick++) {
        vehicle.speed = speed;
        vehicle.update(DT, input, 0, 0);
        yaws.push(vehicle.yawAngle);
        peak = Math.max(peak, Math.abs(vehicle.leanAngle));
        if (vehicle.crashed) crashTick = tick;
    }
    return { crashTick, peak, yaws };
}

function settledRadius(speed, yaws) {
    const last = yaws.slice(-31);
    return speed * DT * 30 / Math.abs(last[30] - last[0]);
}

describe('world parameters (P41 binding)', () => {
    test('rMin is the importer fillet radius and the floor leaves the inner edge of a 10 m road rideable', () => {
        const world = loadWorldPhysics();
        expect(world.rMin).toBe(10);
        expect(world.radiusFloor).toBe(world.rMin - 10 / 2);
        expect(world.leanCapDeg).toBe(50);
        expect(Object.isFrozen(world)).toBe(true);
    });

    test('the file the importer loads and the one the game loads agree', () => {
        expect(loadWorldPhysics()).toEqual(WorldPhysics);
    });
});

describe('full lock (P30)', () => {
    for (const speed of [4, 6, 8, 10, 12, 16, 20, 25]) {
        test(`settles at the lean it needs at ${speed} m/s`, () => {
            const vehicle = worldVehicle();
            const run = hold(vehicle, speed, 1, 4);
            expect(run.crashTick).toBeNull();
            expect(vehicle.crashed).toBe(false);
            const settled = Math.abs(vehicle.leanAngle);
            expect(run.peak / settled).toBeLessThanOrEqual(1.02);
            expect(deg(settled)).toBeLessThanOrEqual(50.1);
            const radius = settledRadius(speed, run.yaws);
            if (speed <= 6) expect(radius).toBeLessThanOrEqual(5.1);
            if (speed === 12) expect(radius).toBeLessThanOrEqual(12.5);
        });

        test(`the legacy vehicle crashes at full lock at ${speed} m/s before 1 s`, () => {
            const vehicle = new game.Vehicle(new THREE.Scene());
            vehicle.environment = { physics: null };
            const run = hold(vehicle, speed, 1, 4);
            expect(run.crashTick).not.toBeNull();
            expect(run.crashTick * DT).toBeLessThan(1.0);
        });
    }

    test('steers the same way as the legacy vehicle', () => {
        const legacy = new game.Vehicle(new THREE.Scene());
        legacy.environment = { physics: null };
        const world = worldVehicle();
        hold(legacy, 12, 1, 0.3);
        hold(world, 12, 1, 0.3);
        expect(Math.sign(world.leanAngle)).toBe(Math.sign(legacy.leanAngle));
        expect(Math.sign(world.yawAngle)).toBe(Math.sign(legacy.yawAngle));
    });
});

// The legs ride on the legacy body, bit for bit (P31). The reference is the
// vehicle.js of a9e8add read from git, so the proof does not rest on a fixture.
describe('legacy equivalence (P31)', () => {
    const base = execFileSync('git', ['show', 'a9e8add:js/vehicle.js'], { encoding: 'utf8', maxBuffer: 1 << 26 });

    function vehicleClass(source) {
        return new Function('THREE', 'document', 'console', `${source}\nreturn Vehicle;`)(
            realThree(), canvasStub(), { log() {}, warn() {}, error() {} }
        );
    }

    // Steps, ramps and a seeded random walk
    function traces() {
        let seed = 12345;
        const random = () => {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            return seed / 4294967296;
        };
        const out = [];
        for (const level of [-1, -0.5, 0.3, 1]) out.push(Array.from({ length: 600 }, (_, i) => (i > 20 ? level : 0)));
        out.push(Array.from({ length: 600 }, (_, i) => Math.max(-1, Math.min(1, (i - 300) / 150))));
        for (let n = 0; n < 3; n++) {
            let value = 0;
            out.push(Array.from({ length: 600 }, () => {
                value = Math.max(-1, Math.min(1, value + (random() - 0.5) * 0.3));
                return value;
            }));
        }
        return out;
    }

    function record(VehicleClass, speed, trace) {
        const vehicle = new VehicleClass(new THREE.Scene());
        vehicle.environment = { physics: null };
        vehicle.speed = speed;
        const out = [];
        for (const input of trace) {
            vehicle.updateSpeed(DT, 0.5, 0);
            vehicle.updatePhysics(DT, input);
            out.push([vehicle.leanAngle, vehicle.leanVelocity, vehicle.yawAngle, vehicle.speed]);
        }
        return out;
    }

    function differs(Reference, Candidate) {
        for (const speed of [6, 10, 15, 20, 30, 45]) {
            for (const trace of traces()) {
                const a = record(Reference, speed, trace);
                const b = record(Candidate, speed, trace);
                for (let tick = 0; tick < a.length; tick++) {
                    for (let k = 0; k < 4; k++) if (!Object.is(a[tick][k], b[tick][k])) return true;
                }
            }
        }
        return false;
    }

    test('updatePhysics and updateSpeed on a leg match a9e8add at every tick', () => {
        expect(differs(vehicleClass(base), game.Vehicle)).toBe(false);
    });

    test('planted: the comparison fails when gravityTorque changes in the reference', () => {
        const mutated = base.replace('Math.sin(this.leanAngle) * 3.0', 'Math.sin(this.leanAngle) * 3.0000001');
        expect(mutated).not.toBe(base);
        expect(differs(vehicleClass(mutated), game.Vehicle)).toBe(true);
    });

    test('a leg environment and a bare vehicle both stay off the world branch', () => {
        const vehicle = new game.Vehicle(new THREE.Scene());
        expect(vehicle.worldPhysics).toBeNull();
        vehicle.environment = { physics: null };
        expect(vehicle.worldPhysics).toBeNull();
        vehicle.environment = {};
        expect(vehicle.worldPhysics).toBeNull();
    });
});

describe('hairpin (P32)', () => {
    const R = 10;

    // Entry along +z to z = 0, a half circle to the right centred at (R, 0),
    // exit along -z at x = 2R
    function lateral(position) {
        if (position.z < 0 && position.x < R) return Math.abs(position.x);
        if (position.z < 0) return Math.abs(position.x - 2 * R);
        return Math.abs(Math.hypot(position.x - R, position.z) - R);
    }

    // Binary input through the keyboard smoothing, speed held by brake and throttle
    function ride(vehicle, { releaseBefore = 0.3, target = 10.5 } = {}) {
        vehicle.position.set(0, 0, -40);
        vehicle.speed = target;
        let smoothed = 0;
        let released = false;
        let worst = 0;
        for (let tick = 0; tick < 60 * 12; tick++) {
            if (vehicle.position.z >= 0 && !released && vehicle.yawAngle >= Math.PI - releaseBefore) released = true;
            const key = vehicle.position.z >= 0 && !released ? 1 : 0;
            smoothed += (key - smoothed) * 0.4;
            const brake = vehicle.speed > target + 0.2 ? 1 : 0;
            const throttle = vehicle.speed < target - 0.2 ? 1 : 0;
            vehicle.update(DT, smoothed, throttle, brake);
            if (vehicle.crashed) return { crashed: true, worst };
            worst = Math.max(worst, lateral(vehicle.position));
            if (released && vehicle.position.z < -30) break;
        }
        return { crashed: false, worst, yaw: vehicle.yawAngle };
    }

    for (const grade of [0.12, -0.12]) {
        test(`the keyboard rider makes an R_MIN hairpin at ${grade * 100}% grade`, () => {
            const vehicle = worldVehicle({ grade });
            const result = ride(vehicle);
            expect(result.crashed).toBe(false);
            expect(result.worst).toBeLessThanOrEqual(5);
            expect(Math.abs(deg(result.yaw - Math.PI))).toBeLessThanOrEqual(10);
        });
    }

    test('the legacy physics crashes on the same ride', () => {
        const vehicle = new game.Vehicle(new THREE.Scene());
        vehicle.environment = { physics: null };
        expect(ride(vehicle).crashed).toBe(true);
    });
});

describe('low speed (P33)', () => {
    test('3 m/s uphill at 12% with no input does not fall and ends at creep speed', () => {
        const vehicle = worldVehicle({ grade: 0.12 });
        vehicle.speed = 3;
        for (let tick = 0; tick < 300; tick++) vehicle.update(DT, 0, 0, 0);
        expect(vehicle.crashed).toBe(false);
        expect(vehicle.speed).toBeGreaterThanOrEqual(3.9);
    });

    test('the legacy vehicle falls on the first tick under 4 m/s', () => {
        const vehicle = new game.Vehicle(new THREE.Scene());
        vehicle.environment = { physics: null };
        vehicle.speed = 3;
        vehicle.update(DT, 0, 0, 0);
        expect(vehicle.crashed).toBe(true);
    });

    test('brake held from 6 m/s stops the bike with a foot down and no lean', () => {
        const vehicle = worldVehicle();
        vehicle.speed = 6;
        let stoppedAt = null;
        for (let tick = 0; tick < 600; tick++) {
            vehicle.update(DT, tick < 10 ? 1 : 0, 0, 1);
            if (stoppedAt === null && vehicle.speed === 0) stoppedAt = tick;
        }
        expect(vehicle.crashed).toBe(false);
        expect(vehicle.speed).toBe(0);
        expect(vehicle.footDown).toBe(true);
        expect(stoppedAt).not.toBeNull();
        for (let tick = 0; tick < 60; tick++) vehicle.update(DT, 0, 0, 1);
        expect(Math.abs(deg(vehicle.leanAngle))).toBeLessThanOrEqual(1);
    });

    test('releasing the brake after a stop creeps off again', () => {
        const vehicle = worldVehicle();
        vehicle.speed = 0;
        vehicle.update(DT, 0, 0, 1);
        expect(vehicle.speed).toBe(0);
        for (let tick = 0; tick < 120; tick++) vehicle.update(DT, 0, 0, 0);
        expect(vehicle.speed).toBeCloseTo(WorldPhysics.creepSpeed, 1);
    });
});

describe('slope (P34)', () => {
    function coast(vehicle) {
        vehicle.speed = 15;
        let distance = 0;
        while (distance < 200) {
            vehicle.updateSpeed(DT, 0, 0);
            distance += vehicle.speed * DT;
        }
        return vehicle.speed;
    }

    test('200 m down 12% from 15 m/s ends at 20.6 m/s in the world', () => {
        expect(coast(worldVehicle({ grade: -0.12 }))).toBeCloseTo(20.6, 0);
        expect(Math.abs(coast(worldVehicle({ grade: -0.12 })) - 20.6)).toBeLessThanOrEqual(0.3);
    });

    test('the legacy vehicle on the same stub ends at 14.1 m/s', () => {
        const legacy = new game.Vehicle(new THREE.Scene());
        // The legacy gradient reads the road height ahead: a 12% descent
        legacy.environment = { physics: null, route: {} };
        legacy.surfaceAt = (x, z) => -0.12 * z;
        legacy.roadYAt = legacy.surfaceAt;
        legacy.speed = 15;
        legacy.position.set(0, 0, 0);
        let distance = 0;
        while (distance < 200) {
            legacy.updateSpeed(DT, 0, 0);
            legacy.position.z += legacy.speed * DT;
            legacy.position.y = legacy.surfaceAt(0, legacy.position.z);
            distance += legacy.speed * DT;
        }
        expect(Math.abs(legacy.speed - 14.1)).toBeLessThanOrEqual(0.3);
    });

    test('the mesh pitches to the grade in the world only', () => {
        const world = worldVehicle({ grade: 0.1 });
        world.update(DT, 0, 0, 0);
        expect(world.group.rotation.x).toBeCloseTo(-Math.atan(0.1), 6);
        const legacy = new game.Vehicle(new THREE.Scene());
        legacy.environment = { physics: null };
        legacy.update(DT, 0, 0, 0);
        expect(legacy.group.rotation.x).toBe(0);
    });
});

describe('grip (P35)', () => {
    const CAP = WorldPhysics.leanCapDeg * Math.PI / 180;

    // The lowside law run on its own: the same lean controller at a held
    // speed, then the first tick over the limit plus the time it must hold
    function expectedCrashTick(speed, newGrip, releaseAtStep) {
        const capNew = Math.atan(Math.tan(CAP) * newGrip);
        const omega = WorldPhysics.leanOmega;
        let lean = CAP;
        let velocity = 0;
        let timerMs = 0;
        for (let tick = 0; tick < 600; tick++) {
            const needed = Math.atan(Math.min(speed * speed / (G * WorldPhysics.radiusFloor), Math.tan(capNew)));
            const target = releaseAtStep ? 0 : needed;
            velocity += (omega * omega * (target - lean) - 2 * omega * velocity) * DT;
            lean += velocity * DT;
            const demand = Math.min(speed * speed / (G * WorldPhysics.radiusFloor), Math.tan(Math.abs(lean)));
            if (demand > WorldPhysics.lowsideMargin * Math.tan(capNew)) {
                timerMs += DT * 1000;
                if (timerMs >= WorldPhysics.lowsideMs) return tick;
            } else {
                timerMs = 0;
            }
        }
        return null;
    }

    // Settled at the 50 degree cap on full lock, then the grip steps down
    function stepGrip(speed, newGrip, { release = false, physics = WorldPhysics } = {}) {
        const grip = { value: 1 };
        const vehicle = grippy(worldVehicle({ physics }), grip);
        hold(vehicle, speed, 1, 2);
        expect(deg(Math.abs(vehicle.leanAngle))).toBeCloseTo(50, 0);
        grip.value = newGrip;
        const run = hold(vehicle, speed, release ? 0 : 1, 4);
        return run.crashTick;
    }

    test('(a) grip 0.85 at full lock settles at atan(tan 50 * 0.85) without a crash', () => {
        const grip = { value: 0.85 };
        const vehicle = grippy(worldVehicle(), grip);
        const run = hold(vehicle, 12, 1, 4);
        expect(run.crashTick).toBeNull();
        expect(deg(Math.abs(vehicle.leanAngle))).toBeCloseTo(deg(Math.atan(Math.tan(CAP) * 0.85)), 0);
    });

    for (const speed of [12, 20]) {
        test(`(b) a step to grip 0.85 or 0.80 with full lock held does not crash at ${speed} m/s`, () => {
            expect(stepGrip(speed, 0.85)).toBeNull();
            expect(stepGrip(speed, 0.80)).toBeNull();
        });

        test(`(c) a step to grip 0.75 or 0.60 with full lock held crashes on the law's tick at ${speed} m/s`, () => {
            for (const newGrip of [0.75, 0.60]) {
                const expected = expectedCrashTick(speed, newGrip, false);
                expect(expected).not.toBeNull();
                const tick = stepGrip(speed, newGrip);
                expect(tick).not.toBeNull();
                expect(Math.abs(tick - expected)).toBeLessThanOrEqual(1);
                if (speed === 12 && newGrip === 0.60) expect(tick * DT * 1000).toBeGreaterThan(190);
            }
        });
    }

    test('(d) releasing the input at the step to 0.60 saves the bike', () => {
        expect(stepGrip(12, 0.60, { release: true })).toBeNull();
    });

    test('(e) a step to 0.30 crashes even with the input released', () => {
        const expected = expectedCrashTick(12, 0.30, true);
        expect(expected).not.toBeNull();
        const tick = stepGrip(12, 0.30, { release: true });
        expect(tick).not.toBeNull();
        expect(Math.abs(tick - expected)).toBeLessThanOrEqual(1);
    });

    test('planted: a dead lowside rule fails case (c)', () => {
        const deadMargin = Object.freeze({ ...WorldPhysics, lowsideMargin: 10 });
        const deadTimer = Object.freeze({ ...WorldPhysics, lowsideMs: 2000 });
        expect(stepGrip(12, 0.60, { physics: deadMargin })).toBeNull();
        expect(stepGrip(12, 0.60, { physics: deadTimer })).toBeNull();
    });

    test('exposes the demand and the timer for the tests', () => {
        const grip = { value: 1 };
        const vehicle = grippy(worldVehicle(), grip);
        hold(vehicle, 12, 1, 2);
        expect(vehicle.lastDemand).toBeCloseTo(Math.tan(CAP), 2);
        expect(vehicle.lowsideTimerMs).toBe(0);
    });
});

describe('cobbles', () => {
    const CAP = WorldPhysics.leanCapDeg * Math.PI / 180;
    function onSurface(cobbles) {
        const vehicle = worldVehicle({ cobbles });
        const weather = new WeatherSystem({ fog: null }, null);
        vehicle.weatherSystem = weather;
        return vehicle;
    }

    test('route cobbles set the surface grip to cobbleGrip and plain road to 1', () => {
        const cobbled = onSurface(true);
        cobbled.updateSpeed(DT, 0, 0);
        expect(cobbled.weatherSystem.surfaceGrip).toBe(WorldPhysics.cobbleGrip);
        const plain = onSurface(false);
        plain.updateSpeed(DT, 0, 0);
        expect(plain.weatherSystem.surfaceGrip).toBe(1);
    });

    test('cobbles lower the lean cap and lengthen braking', () => {
        const cobbled = onSurface(true);
        const plain = onSurface(false);
        hold(cobbled, 12, 1, 3);
        hold(plain, 12, 1, 3);
        expect(Math.abs(cobbled.leanAngle)).toBeLessThan(Math.abs(plain.leanAngle));
        expect(deg(Math.abs(cobbled.leanAngle))).toBeCloseTo(deg(Math.atan(Math.tan(CAP) * 0.85)), 0);

        const brake = vehicle => {
            vehicle.speed = 20;
            for (let tick = 0; tick < 30; tick++) vehicle.updateSpeed(DT, 0, 1);
            return vehicle.speed;
        };
        expect(brake(onSurface(true))).toBeGreaterThan(brake(onSurface(false)));
    });

    test('without a weather system the cobbles still apply', () => {
        const vehicle = worldVehicle({ cobbles: true });
        vehicle.speed = 20;
        for (let tick = 0; tick < 30; tick++) vehicle.updateSpeed(DT, 0, 1);
        const reference = worldVehicle({ cobbles: false });
        reference.speed = 20;
        for (let tick = 0; tick < 30; tick++) reference.updateSpeed(DT, 0, 1);
        expect(vehicle.speed).toBeGreaterThan(reference.speed);
    });
});

describe('route without samples', () => {
    test('a world environment with no route rides on the flat', () => {
        const vehicle = new game.Vehicle(new THREE.Scene());
        vehicle.environment = { physics: WorldPhysics };
        expect(() => vehicle.update(DT, 0, 0, 0)).not.toThrow();
        expect(vehicle.worldGrade).toBe(0);
    });

    test('reset clears the world state', () => {
        const vehicle = worldVehicle({ grade: 0.1 });
        vehicle.update(DT, 1, 0, 0);
        vehicle.lowsideTimerMs = 100;
        vehicle.reset();
        expect(vehicle.lowsideTimerMs).toBe(0);
        expect(vehicle.worldGrade).toBe(0);
        expect(vehicle.footDown).toBe(false);
    });
});
