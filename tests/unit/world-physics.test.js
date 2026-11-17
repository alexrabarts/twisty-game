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
// The world physics with the throttle-closed engine braking off: the tests that pin the grade or the steering
// alone, which ride with the throttle closed, use it so the engine braking does not move the speed under them
const NO_ENGINE = Object.freeze({ ...WorldPhysics, engineBrake: 0 });

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

// Calm at speed: the play-test found the world bike twitchy at speed. Held steering at 20, 30 and 45 m/s must
// reach a lean, lean as fast and turn as fast as the legacy bike does, or slower, give or take STEP_MARGIN, and
// full lock still settles at the cap. The pins are the same ones the lean-target controller met: the steering
// torque falls with speed as the legacy speedFactor does, and the lean has no momentum, so it is slower still.
describe('step response at speed', () => {
    const STEP_MARGIN = 1.1;
    const TEN = 10 * Math.PI / 180;

    function step(vehicle, speed, input) {
        const out = { reach: null, peakRate: 0, lean: null, yawRate: null, turn: null };
        const start = vehicle.yawAngle;
        let previous = start;
        for (let tick = 1; tick <= 120 && !vehicle.crashed; tick++) {
            vehicle.speed = speed;
            vehicle.update(DT, input, 0, 0);
            const rate = Math.abs(vehicle.yawAngle - previous) / DT;
            previous = vehicle.yawAngle;
            out.peakRate = Math.max(out.peakRate, Math.abs(vehicle.leanVelocity));
            if (out.reach === null && Math.abs(vehicle.leanAngle) >= TEN) out.reach = tick * DT;
            if (tick === 30) { out.lean = Math.abs(vehicle.leanAngle); out.yawRate = rate; }
            if (tick === 60) out.turn = Math.abs(vehicle.yawAngle - start);
        }
        return out;
    }

    const legacyVehicle = () => {
        const vehicle = new game.Vehicle(new THREE.Scene());
        vehicle.environment = { physics: null };
        return vehicle;
    };

    for (const speed of [20, 30, 45]) {
        for (const input of [0.3, 0.6, 1]) {
            test(`at ${speed} m/s, input ${input}, the world bike is no quicker than the legacy bike`, () => {
                const legacy = step(legacyVehicle(), speed, input);
                const world = step(worldVehicle(), speed, input);
                // A part input settles at a part lean (the bike stands itself up against it), so at 0.3 it may never
                // reach 10 degrees: that is slower than the legacy bike, which is what this pins
                if (input === 1) expect(world.reach).not.toBeNull();
                if (world.reach !== null) expect(world.reach * STEP_MARGIN).toBeGreaterThanOrEqual(legacy.reach);
                expect(world.peakRate).toBeLessThanOrEqual(legacy.peakRate * STEP_MARGIN);
                // The legacy bike falls over at full lock at 20 m/s before these instants; then only its lean-in counts
                if (legacy.lean !== null) {
                    expect(world.lean).toBeLessThanOrEqual(legacy.lean * STEP_MARGIN);
                    expect(world.yawRate).toBeLessThanOrEqual(legacy.yawRate * STEP_MARGIN);
                }
                if (legacy.turn !== null) expect(world.turn).toBeLessThanOrEqual(legacy.turn * STEP_MARGIN);
            });
        }
    }

    test('at speed full lock still settles at the same lean, later, with no overshoot', () => {
        for (const speed of [20, 30, 45]) {
            const vehicle = worldVehicle();
            const run = hold(vehicle, speed, 1, 6);
            expect(run.crashTick).toBeNull();
            expect(deg(Math.abs(vehicle.leanAngle))).toBeCloseTo(WorldPhysics.leanCapDeg, 1);
            expect(run.peak / Math.abs(vehicle.leanAngle)).toBeLessThanOrEqual(1.02);
        }
    });
});

// Keyboard presses, as js/input.js makes them: a key gives a target of +-1 and the input moves 0.4 of the way
// there each 60 Hz tick. The play-test found the lean-target controller tipped the bike far over on the first
// press and moved it too little on the next one (every press asked for full lean, so a press moved the bike by a
// share of the gap left to it). A press is now a steering torque: it moves the bike by the same amount every time,
// a tap less than a long press, and a held key settles under the cap.
describe('keyboard presses', () => {
    const SPEEDS = [12, 20, 30, 45];

    // `steps` is a list of [key, seconds]; returns the lean change over each step, in degrees, and the peak lean
    function keys(vehicle, speed, steps) {
        let input = 0;
        let peak = 0;
        const changes = [];
        for (const [key, seconds] of steps) {
            const from = vehicle.leanAngle;
            for (let tick = 0; tick < Math.round(seconds / DT); tick++) {
                input += (key - input) * (1 - Math.pow(1 - 0.4, DT * 60));
                vehicle.speed = speed;
                vehicle.update(DT, input, 0, 0);
                peak = Math.max(peak, Math.abs(vehicle.leanAngle));
            }
            changes.push(deg(Math.abs(vehicle.leanAngle - from)));
        }
        return { changes, peak: deg(peak), crashed: vehicle.crashed };
    }

    for (const speed of SPEEDS) {
        test(`(a) the second 0.3 s press moves the bike as far as the first, within 15%, at ${speed} m/s`, () => {
            const run = keys(worldVehicle(), speed, [[1, 0.3], [0, 0.4], [1, 0.3]]);
            const [first, , second] = run.changes;
            expect(first).toBeGreaterThan(3);
            expect(Math.abs(second - first) / first).toBeLessThanOrEqual(0.15);
        });

        test(`(a) three 0.15 s taps move the bike alike, within 15%, at ${speed} m/s`, () => {
            const run = keys(worldVehicle(), speed, [[1, 0.15], [0, 0.3], [1, 0.15], [0, 0.3], [1, 0.15]]);
            const [first, , second, , third] = run.changes;
            expect(Math.abs(second - first) / first).toBeLessThanOrEqual(0.15);
            expect(Math.abs(third - first) / first).toBeLessThanOrEqual(0.15);
        });

        test(`(b) a 0.15 s tap leans the bike less than half as far as a 0.6 s press at ${speed} m/s`, () => {
            const tap = keys(worldVehicle(), speed, [[1, 0.15]]).changes[0];
            const press = keys(worldVehicle(), speed, [[1, 0.6]]).changes[0];
            expect(tap).toBeGreaterThan(1);
            expect(tap).toBeLessThan(press / 2);
        });
    }

    test('planted: the lean-target controller fails (a), so the check can fail', () => {
        // A lean target: every press asks for full lean, and the lean closes a share of the gap to it
        const Target = class extends game.Vehicle {
            updateWorldPhysics(dt, u) {
                const target = -u * WorldPhysics.leanCapDeg * Math.PI / 180;
                const omega = 7;
                this.leanVelocity += (omega * omega * (target - this.leanAngle) - 2 * omega * this.leanVelocity) * dt;
                this.leanAngle += this.leanVelocity * dt;
            }
        };
        const vehicle = worldVehicle({}, Target);
        const [first, , second] = keys(vehicle, 12, [[1, 0.3], [0, 0.4], [1, 0.3]]).changes;
        expect(Math.abs(second - first) / first).toBeGreaterThan(0.15);
    });

    for (const speed of [4, 6, 8, 10, 12, 16, 20, 25]) {
        test(`(c) a held key settles under the cap without a lowside at ${speed} m/s`, () => {
            const run = keys(worldVehicle(), speed, [[1, 4]]);
            expect(run.crashed).toBe(false);
            expect(run.peak).toBeLessThanOrEqual(WorldPhysics.leanCapDeg + 0.1);
            // Settled: the last second moved the lean by less than a tenth of a degree
            const vehicle = worldVehicle();
            keys(vehicle, speed, [[1, 3]]);
            const before = vehicle.leanAngle;
            keys(vehicle, speed, [[1, 1]]);
            expect(deg(Math.abs(vehicle.leanAngle - before))).toBeLessThan(0.1);
        });
    }

    test('letting go stands the bike up', () => {
        const vehicle = worldVehicle();
        keys(vehicle, 12, [[1, 0.6], [0, 1.5]]);
        expect(deg(Math.abs(vehicle.leanAngle))).toBeLessThan(1);
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
    // Entry along +z to z = 0, a half circle of radius R to the right centred at (R, 0),
    // exit along -z at x = 2R
    function lateral(position, R) {
        if (position.z < 0 && position.x < R) return Math.abs(position.x);
        if (position.z < 0) return Math.abs(position.x - 2 * R);
        return Math.abs(Math.hypot(position.x - R, position.z) - R);
    }

    // Binary input through the keyboard smoothing, speed held by brake and throttle
    function ride(vehicle, { releaseBefore = 0.3, target = 10.5, radius = WorldPhysics.rMin } = {}) {
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
            worst = Math.max(worst, lateral(vehicle.position, radius));
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

    // 12 m on the centreline at 10.8 m/s, the most the R_MIN fillet allows on its centreline at the lean cap
    test('the keyboard rider makes a 12 m hairpin at the fillet speed', () => {
        const speed = Math.sqrt(G * WorldPhysics.rMin * Math.tan(WorldPhysics.leanCapDeg * Math.PI / 180));
        expect(speed).toBeCloseTo(10.8, 1);
        const result = ride(worldVehicle(), { target: speed, radius: 12 });
        expect(result.crashed).toBe(false);
        expect(result.worst).toBeLessThanOrEqual(5);
        expect(Math.abs(deg(result.yaw - Math.PI))).toBeLessThanOrEqual(10);
    });

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

    test('200 m down 12% from 15 m/s ends at 20.6 m/s in the world (no engine braking)', () => {
        expect(coast(worldVehicle({ grade: -0.12, physics: NO_ENGINE }))).toBeCloseTo(20.6, 0);
        expect(Math.abs(coast(worldVehicle({ grade: -0.12, physics: NO_ENGINE })) - 20.6)).toBeLessThanOrEqual(0.3);
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

    // The lowside law read off the ride itself: the first tick at which the demand the vehicle reports
    // (lastDemand) has stayed over margin * tan(capEff) for lowsideMs. The lean dynamics decide the demand; the
    // law decides the crash, so this holds whatever controller leans the bike
    function lawTick(demands, newGrip) {
        const limit = WorldPhysics.lowsideMargin * Math.tan(Math.atan(Math.tan(CAP) * newGrip));
        let timerMs = 0;
        for (let tick = 0; tick < demands.length; tick++) {
            timerMs = demands[tick] > limit ? timerMs + DT * 1000 : 0;
            if (timerMs >= WorldPhysics.lowsideMs) return tick;
        }
        return null;
    }

    // Settled at the 50 degree cap on full lock, then the grip steps down. Returns the crash tick after the
    // step and the tick the law gives for the demand recorded on the way
    function stepGrip(speed, newGrip, { release = false, physics = WorldPhysics, withLaw = false } = {}) {
        const grip = { value: 1 };
        const vehicle = grippy(worldVehicle({ physics }), grip);
        hold(vehicle, speed, 1, 2);
        expect(deg(Math.abs(vehicle.leanAngle))).toBeCloseTo(50, 0);
        grip.value = newGrip;
        const demands = [];
        let crashTick = null;
        for (let tick = 0; tick < 240 && crashTick === null; tick++) {
            vehicle.speed = speed;
            vehicle.update(DT, release ? 0 : 1, 0, 0);
            demands.push(vehicle.lastDemand);
            if (vehicle.crashed) crashTick = tick;
        }
        return withLaw ? { tick: crashTick, law: lawTick(demands, newGrip) } : crashTick;
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
                const { tick, law } = stepGrip(speed, newGrip, { withLaw: true });
                expect(law).not.toBeNull();
                expect(tick).toBe(law);
                // Not at once: the demand has to stay over the limit for lowsideMs
                expect((tick + 1) * DT * 1000).toBeGreaterThanOrEqual(WorldPhysics.lowsideMs);
            }
        });
    }

    test('(d) releasing the input at the step to 0.60 saves the bike', () => {
        expect(stepGrip(12, 0.60, { release: true })).toBeNull();
    });

    test('(e) a step to 0.30 crashes even with the input released', () => {
        const { tick, law } = stepGrip(12, 0.30, { release: true, withLaw: true });
        expect(law).not.toBeNull();
        expect(tick).toBe(law);
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

// The low-speed turn: under turnBlendSpeed the yaw rate blends toward the handlebar's v tan(handlebar) / wheelbase
// and the floor radius drops to lockRadius. The creep is off here (creepSpeed 0) so the speed held is the speed ridden.
describe('low-speed turn', () => {
    const still = { ...WorldPhysics, creepSpeed: 0 };
    const BLEND = WorldPhysics.turnBlendSpeed;
    const LOCK = WorldPhysics.lockRadius;

    function lockRadiusAt(speed, physics = still) {
        const vehicle = worldVehicle({ physics });
        const run = hold(vehicle, speed, 1, 4);
        expect(run.crashTick).toBeNull();
        return settledRadius(speed, run.yaws);
    }

    test('the tuning: blend speed 6-8 m/s, lock radius 2.5-3 m, both under the old floor', () => {
        expect(BLEND).toBeGreaterThanOrEqual(6);
        expect(BLEND).toBeLessThanOrEqual(8);
        expect(LOCK).toBeGreaterThanOrEqual(2.5);
        expect(LOCK).toBeLessThanOrEqual(3);
        expect(LOCK).toBeLessThan(WorldPhysics.radiusFloor);
    });

    test('full lock turns close to the lock radius at 2 m/s and the radius grows smoothly with speed', () => {
        const r2 = lockRadiusAt(2), r4 = lockRadiusAt(4), r6 = lockRadiusAt(6);
        expect(r2).toBeLessThanOrEqual(LOCK * 1.1);
        expect(r2).toBeGreaterThanOrEqual(LOCK * 0.98);
        expect(r4).toBeGreaterThan(r2);
        expect(r6).toBeGreaterThan(r4);
        expect(r6).toBeLessThanOrEqual(WorldPhysics.radiusFloor + 0.01);
        // Smoothly: over a fine sweep the radius never falls with speed and never jumps
        let last = null;
        for (let speed = 0.5; speed <= BLEND; speed += 0.25) {
            const radius = lockRadiusAt(speed);
            if (last !== null) {
                expect(radius).toBeGreaterThanOrEqual(last - 1e-6);
                expect(radius - last).toBeLessThan(0.25);
            }
            last = radius;
        }
    });

    test('the bike stands up as it slows: the full-lock lean shrinks toward upright', () => {
        const leans = [6, 4, 2, 1].map(speed => {
            const vehicle = worldVehicle({ physics: still });
            hold(vehicle, speed, 1, 3);
            return deg(Math.abs(vehicle.leanAngle));
        });
        for (let i = 1; i < leans.length; i++) expect(leans[i]).toBeLessThan(leans[i - 1]);
        expect(leans[3]).toBeLessThan(3);
    });

    test('no step in the yaw rate across the blend speed', () => {
        // The settled full-lock yaw rate either side of the blend speed
        const rate = speed => speed / lockRadiusAt(speed);
        expect(Math.abs(rate(BLEND - 0.01) - rate(BLEND + 0.01))).toBeLessThan(0.01);
        // Slowing through it at full lock: the yaw rate moves by no more than a smooth ramp does in one frame
        const vehicle = worldVehicle({ physics: still });
        hold(vehicle, BLEND + 1.5, 1, 3);
        let lastYaw = vehicle.yawAngle, lastRate = null, worst = 0;
        for (let speed = BLEND + 1.5; speed >= BLEND - 1.5; speed -= 1.5 * DT) {
            vehicle.speed = speed;
            vehicle.update(DT, 1, 0, 0);
            const yawRate = (vehicle.yawAngle - lastYaw) / DT;
            if (lastRate !== null) worst = Math.max(worst, Math.abs(yawRate - lastRate));
            lastRate = yawRate;
            lastYaw = vehicle.yawAngle;
        }
        expect(vehicle.crashed).toBe(false);
        expect(worst).toBeLessThan(0.01);
    });

    test('the yaw rate is 0 at speed 0: no turning on the spot', () => {
        const vehicle = worldVehicle({ physics: still });
        hold(vehicle, 0, 1, 1);
        expect(Math.abs(vehicle.handlebarAngle)).toBeGreaterThan(0.3);
        const before = vehicle.yawAngle;
        hold(vehicle, 0, 1, 2);
        expect(vehicle.yawAngle).toBe(before);
        expect(vehicle.crashed).toBe(false);
    });

    test('slowing to a stop at full lock, and creeping off at full lock, never falls or crashes', () => {
        const vehicle = worldVehicle();
        vehicle.speed = 10;
        for (let tick = 0; tick < 600; tick++) vehicle.update(DT, 1, 0, 0.4);
        expect(vehicle.crashed).toBe(false);
        expect(vehicle.speed).toBe(0);
        for (let tick = 0; tick < 600; tick++) vehicle.update(DT, 1, 0, 0);
        expect(vehicle.crashed).toBe(false);
        expect(vehicle.speed).toBeCloseTo(WorldPhysics.creepSpeed, 1);
        // At creep speed and full lock the bike circles near the lock radius, barely leaned
        expect(deg(Math.abs(vehicle.leanAngle))).toBeLessThan(25);
        for (const speed of [0.5, 1, 2, 3, 4, 5, 6, 7]) expect(hold(worldVehicle(), speed, -1, 4).crashTick).toBeNull();
    });

    // Above the blend speed the world branch is the one of 0389aba (before the low-speed turn), tick for tick. The
    // speed held is the speed before the tick's drag, so the lowest checked is a touch over the blend speed
    describe('above the blend speed, bit for bit', () => {
        const base = execFileSync('git', ['show', '0389aba:js/vehicle.js'], { encoding: 'utf8', maxBuffer: 1 << 26 });
        const Reference = new Function('THREE', 'document', 'console', `${base}\nreturn Vehicle;`)(
            realThree(), canvasStub(), { log() {}, warn() {}, error() {} }
        );

        // With the engine braking off: it changes the speed within the tick, and this pins the steering
        function trace(VehicleClass, speed, inputs) {
            const vehicle = worldVehicle({ physics: NO_ENGINE }, VehicleClass);
            const out = [];
            for (const input of inputs) {
                vehicle.speed = speed;
                vehicle.update(DT, input, 0, 0);
                out.push([vehicle.leanAngle, vehicle.leanVelocity, vehicle.yawAngle, vehicle.lastDemand, vehicle.crashed]);
            }
            return out;
        }

        function inputs() {
            let seed = 777;
            const random = () => {
                seed = (seed * 1664525 + 1013904223) >>> 0;
                return seed / 4294967296;
            };
            const out = [Array.from({ length: 300 }, (_, i) => (i > 10 ? 1 : 0)), Array.from({ length: 300 }, (_, i) => (i % 60 < 18 ? -1 : 0))];
            let value = 0;
            out.push(Array.from({ length: 400 }, () => (value = Math.max(-1, Math.min(1, value + (random() - 0.5) * 0.4)))));
            return out;
        }

        function same(speed) {
            for (const list of inputs()) {
                const a = trace(Reference, speed, list), b = trace(game.Vehicle, speed, list);
                for (let tick = 0; tick < a.length; tick++) {
                    for (let k = 0; k < a[tick].length; k++) if (!Object.is(a[tick][k], b[tick][k])) return false;
                }
            }
            return true;
        }

        for (const speed of [BLEND + 0.05, 8, 10, 15, 20, 30, 45]) {
            test(`${speed} m/s matches 0389aba at every tick`, () => expect(same(speed)).toBe(true));
        }

        test('planted: under the blend speed the turn differs, so the comparison can fail', () => {
            expect(same(4)).toBe(false);
        });
    });
});
