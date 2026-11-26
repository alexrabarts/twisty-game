// The world's verge: the real js/vehicle.js against the one before the verge change (de5a931), on straight synthetic
// worlds whose ground beside the road is chosen per test. Leaving the road slows the bike (the verge's drag, then the
// land's) and takes grip from it, and the rider can steer back; only a real wall or drop, water, or the land's own
// visible rules (too fast on it for too long, too steep) crash it. Before, the ledge rule took 5% of the speed a frame on the bench (about 100 m/s^2 at
// 35 m/s), a bank beside the road crashed the bike through the "below the surface" rule, the run-off grip lowsided a
// bike leaned back toward the road, and a wall or drop in the 8 m zone layer crashed it on flat verge.
// The legs keep every rule, bit for bit.
import { describe, test, expect, beforeAll } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import { loadGame, realThree, canvasStub, buildEnvironment } from '../helpers/load-game.js';
import { samplesOf, fakeData, allTiles, straight } from '../helpers/world-synthetic.js';

const DT = 1 / 60;
const game = loadGame();
// The rides here are held against commits from before the rider's weight (RIDER_MASS, Vehicle.pairOf), or measure
// the bike alone: every character rides at the reference weight, at which that rule moves nothing to the last bit
// (tests/unit/rider-mass.test.js holds the rule itself)
for (const character of game.CHARACTERS) delete character.kg;
const { THREE, WorldRoute, WorldGround, WorldPhysics, WorldData } = game;
const BEFORE = 'de5a931';
const quiet = { log() {}, warn() {}, error() {} };
// The code of that commit with the brake, steering and lean numbers of today's bike: the owner's tuning of 2026-11-21
// changed them for the legs too (.agent/system/handling.md, "The defaults"), and the comparison is of the code
const Old = new Function('THREE', 'document', 'console', `${execFileSync('git', ['show', `${BEFORE}:js/vehicle.js`], { encoding: 'utf8', maxBuffer: 1 << 26 })}\nreturn Vehicle;`)(
    realThree(), canvasStub(), quiet
);
const TODAY = new game.Vehicle(new THREE.Scene());
class Before extends Old {
    constructor(...args) {
        super(...args);
        this.brakeForce = TODAY.brakeForce;
        this.steeringForce = TODAY.steeringForce;
        this.maxLeanAngle = TODAY.maxLeanAngle;
    }
}
const Z = WorldData.ZONE;
const road = x => Math.abs(x) <= 5;

// A 10 m road along +z at height 100; `zone(x)` and `shape(x)` give the 8 m zone layer and the land across it
function world({ zone = x => (road(x) ? Z.road : Z.terrain), shape = () => 100 } = {}) {
    const route = new WorldRoute(samplesOf(straight(3000)), {});
    const ground = new WorldGround(route, fakeData({ tiles: allTiles(-1, 0, -1, 6), zone, shape }));
    return { physics: WorldPhysics, route, ground };
}

const WORLDS = {
    // Grass at road height either side
    grass: () => world(),
    // A carved bench (the zone node 8 m out), then grass
    bench: () => world({ zone: x => (road(x) ? Z.road : Math.abs(x) <= 8 ? Z.bench : Z.terrain) }),
    // On the left a bank: the land 8 m out stands 6 m over the road, so the ground steps up at the road edge
    bank: () => world({ shape: x => (x <= -8 ? 106 : 100) }),
    // On the right a wall 16 m out where the land rises 8 m, past a bench
    wall: () => world({ zone: x => (road(x) ? Z.road : Math.abs(x) <= 8 ? Z.bench : x >= 16 ? Z.wall : Z.terrain), shape: x => (x >= 16 ? 108 : 100) }),
    // On the right a drop 16 m out where the land falls 10 m, past a bench
    drop: () => world({ zone: x => (road(x) ? Z.road : Math.abs(x) <= 8 ? Z.bench : x >= 16 ? Z.drop : Z.terrain), shape: x => (x >= 16 ? 90 : 100) }),
    // On the right the road's edge on a retaining wall: a drop just past the verge where the land falls 10 m
    // (stacked hairpin legs), so the wall and its parapet are drawn there (WorldEnvironment.edgeFoot)
    retaining: () => world({ zone: x => (road(x) ? Z.road : x >= 7 ? Z.drop : Z.terrain), shape: x => (x >= 7 ? 90 : 100) }),
    // A wall and a drop in the zone layer on flat land: the face of another strand read at the nearest node
    flatWall: () => world({ zone: x => (road(x) ? Z.road : x >= 8 ? Z.wall : x <= -8 ? Z.drop : Z.terrain), shape: x => (x <= -8 ? 99 : 100) })
};

// The bike `inside` metres inside the road edge on `side`, heading `angle` degrees off the road toward it, leaned
// `lean` degrees (positive turns it back toward the road)
function place(VehicleClass, env, { speed, angle, side = 1, lean = 0, assist = 'off', inside = 1.5 }) {
    const vehicle = new VehicleClass(new THREE.Scene());
    vehicle.environment = env;
    vehicle.assistLevel = assist;
    vehicle.position.set(side * (5 - inside), 100, 40);
    vehicle.yawAngle = side * angle * Math.PI / 180;
    vehicle.findNearestRoadSegment();
    vehicle.speed = speed;
    vehicle.leanAngle = side * lean * Math.PI / 180;
    return vehicle;
}

// Ride for up to `seconds`. Once off the road, `steer(vehicle)` gives the input; the ride ends when the bike is back
// 1 m inside the edge. Returns the outcome and the worst deceleration while upright
function ride(vehicle, { seconds = 12, steer = () => 0, steerFromStart = false } = {}) {
    const out = { crashed: false, falling: false, back: false, left: false, offS: 0, maxDecel: 0, minSpeed: vehicle.speed, maxOut: 0, time: 0 };
    for (let tick = 0; tick < seconds * 60; tick++) {
        const x = vehicle.position.x;
        if (Math.abs(x) > 5) { out.left = true; out.offS += DT; }
        out.maxOut = Math.max(out.maxOut, Math.abs(x) - 5);
        if (out.left && Math.abs(x) < 4) { out.back = true; break; }
        const before = vehicle.speed;
        vehicle.update(DT, out.left || steerFromStart ? steer(vehicle) : 0, 0, 0);
        out.time += DT;
        if (vehicle.crashed) {
            out.crashed = true;
            out.falling = vehicle.fallingOffCliff;
            break;
        }
        out.maxDecel = Math.max(out.maxDecel, (before - vehicle.speed) / DT);
        out.minSpeed = Math.min(out.minSpeed, vehicle.speed);
    }
    return out;
}

// Back toward the road at 15 degrees, as a rider steers out of a run-off
const steerBack = vehicle => {
    const want = -Math.sign(vehicle.position.x) * 15 * Math.PI / 180;
    return Math.max(-1, Math.min(1, (want - vehicle.yawAngle) * 4));
};
// Full steering toward the road until the bike points 11 degrees back at it
const steerHard = vehicle => (vehicle.yawAngle * Math.sign(vehicle.position.x) > -0.2 ? -Math.sign(vehicle.position.x) : 0);

describe('a shallow excursion onto the verge, steering back', () => {
    for (const speed of [25, 35]) {
        test(`${speed} m/s at 4 degrees over a bank that steps up at the road edge: back on the road, no crash`, () => {
            const before = ride(place(Before, WORLDS.bank(), { speed, angle: 4, side: -1 }), { steer: steerBack });
            const after = ride(place(game.Vehicle, WORLDS.bank(), { speed, angle: 4, side: -1 }), { steer: steerBack });
            expect(before.crashed).toBe(true); // the old "more than 2 m below the surface" rule
            expect(after.crashed).toBe(false);
            expect(after.left).toBe(true);
            expect(after.back).toBe(true);
        });

        test(`${speed} m/s at 4 degrees over the bench: back on the road with most of the speed, no 10 g ledge`, () => {
            const before = ride(place(Before, WORLDS.bench(), { speed, angle: 4 }), { steer: steerBack });
            const after = ride(place(game.Vehicle, WORLDS.bench(), { speed, angle: 4 }), { steer: steerBack });
            expect(before.maxDecel).toBeGreaterThan(60);
            expect(after.crashed).toBe(false);
            expect(after.back).toBe(true);
            expect(after.maxDecel).toBeLessThan(10);
            expect(after.minSpeed).toBeGreaterThan(speed * 0.65);
        });

        test(`${speed} m/s at 8 degrees, already leaned back toward the road as it crosses the edge: no lowside on the grass`, () => {
            const before = ride(place(Before, WORLDS.grass(), { speed, angle: 8, lean: 35, inside: 0.4 }), { steer: steerHard, steerFromStart: true });
            const after = ride(place(game.Vehicle, WORLDS.grass(), { speed, angle: 8, lean: 35, inside: 0.4 }), { steer: steerHard, steerFromStart: true });
            expect(before.crashed).toBe(true);
            expect(after.crashed).toBe(false);
            expect(after.left).toBe(true);
            expect(after.back).toBe(true);
        });
    }

    test('the edge assist at level normal brings a 35 m/s excursion back as well', () => {
        const after = ride(place(game.Vehicle, WORLDS.bank(), { speed: 35, angle: 4, side: -1, assist: 'normal' }), { steer: steerBack });
        expect(after.crashed).toBe(false);
        expect(after.back).toBe(true);
    });
});

describe('an excursion with no input', () => {
    test('35 m/s onto the grass: the land drags it down hard and it crashes as too fast on the grass, not on a timer', () => {
        const vehicle = place(game.Vehicle, WORLDS.grass(), { speed: 35, angle: 4 });
        const out = ride(vehicle, { seconds: 30 });
        const before = ride(place(Before, WORLDS.grass(), { speed: 35, angle: 4 }), { seconds: 30 });
        expect(before.crashed).toBe(true);
        expect(out.crashed).toBe(true);
        expect(out.falling).toBe(false);
        expect(vehicle.crashCause).toBe('Too fast on the grass');
        // Within landCrashS of reaching the land past the verge (the verge is a few tenths of a second at 4 degrees)
        expect(out.offS).toBeLessThan(WorldPhysics.landCrashS + 1.5);
        expect(out.minSpeed).toBeLessThan(25);
    });

    test('11 m/s over the bench or onto the grass, then full throttle: down to the land\'s cap, no crash', () => {
        for (const make of [WORLDS.bench, WORLDS.grass]) {
            const vehicle = place(game.Vehicle, make(), { speed: 11, angle: 4 });
            let left = 0;
            for (let tick = 0; tick < 8 * 60 && !vehicle.crashed; tick++) {
                // The throttle once on the land: on the road it would carry the bike onto the land over landCrashSpeed
                vehicle.update(DT, 0, vehicle.runoff ? 1 : 0, 0);
                if (Math.abs(vehicle.position.x) > 5 + game.RoadSurface.VERGE_M) left++;
            }
            expect(vehicle.crashed).toBe(false);
            expect(left).toBeGreaterThan(120);
            expect(vehicle.speed).toBeLessThanOrEqual(WorldPhysics.landCapSpeed + 1e-9);
        }
    });

    test('a wall or drop in the zone layer on flat land is run-off: no crash where the land shows none', () => {
        for (const side of [1, -1]) {
            const before = ride(place(Before, WORLDS.flatWall(), { speed: 25, angle: 8, side }), { seconds: 4 });
            // Under landCrashSpeed and on the throttle, so the land's own drag and speed rule do not end the ride first
            const vehicle = place(game.Vehicle, WORLDS.flatWall(), { speed: 9, angle: 8, side });
            let maxOut = 0;
            for (let tick = 0; tick < 4 * 60 && !vehicle.crashed; tick++) {
                vehicle.update(DT, 0, 1, 0);
                maxOut = Math.max(maxOut, Math.abs(vehicle.position.x) - 5);
            }
            expect(before.crashed).toBe(true);
            expect(vehicle.crashed).toBe(false);
            expect(maxOut).toBeGreaterThan(3);
        }
    });
});

describe('real obstacles still crash', () => {
    // The 8 m grid draws a wall or a drop as land rising or falling across a cell: steeper than landSteepSlope, so the
    // bike crashes on the drawn slope at its foot (or top) before it reaches the zone's face
    test('a wall where the land rises: a crash on the rising land, or a stall at its foot, short of the wall, no fall', () => {
        // Under landCrashSpeed, so the land's speed rule does not crash the bike first
        for (const throttle of [0, 1]) {
            const vehicle = place(game.Vehicle, WORLDS.wall(), { speed: 11, angle: 30 });
            for (let tick = 0; tick < 8 * 60 && !vehicle.crashed; tick++) vehicle.update(DT, 0, throttle, 0);
            if (vehicle.crashed) expect(vehicle.crashCause).toBe('Rode onto a slope too steep to hold');
            else expect(vehicle.speed).toBeLessThan(WorldPhysics.fallSpeed);
            expect(vehicle.fallingOffCliff).toBe(false);
            expect(vehicle.position.x).toBeGreaterThan(5 + game.RoadSurface.VERGE_M);
            expect(vehicle.position.x).toBeLessThan(16);
        }
    });

    test('a drop where the land falls away: a crash going over it', () => {
        const vehicle = place(game.Vehicle, WORLDS.drop(), { speed: 11, angle: 30 });
        const out = ride(vehicle, { seconds: 4 });
        expect(out.crashed).toBe(true);
        expect(out.falling || /steep/.test(vehicle.crashCause)).toBe(true);
        expect(vehicle.position.x).toBeLessThan(16);
    });

    test('the parapet of a retaining wall is solid: a bounce back toward the road, not a fall', () => {
        const vehicle = place(game.Vehicle, WORLDS.retaining(), { speed: 25, angle: 20 });
        const out = ride(vehicle, { seconds: 4 });
        expect(out.crashed).toBe(true);
        expect(out.falling).toBe(false);
        expect(vehicle.position.x).toBeLessThanOrEqual(5 + game.RoadSurface.VERGE_M - game.RoadMesh.PARAPET_W_M + 0.01);
        expect(vehicle.position.y).toBeGreaterThan(99);
    });

});

describe('the rough land moves only the drawn bike', () => {
    // The drawn bike stands on the drawn ground (Vehicle.groundPose), so the bob is its lift off that ground (landBob):
    // up only, as a bob down put the tyres into the land
    test('on the grass the mesh bobs up off the drawn ground, within landBumpM, and rocks within landWobbleDeg', () => {
        const vehicle = place(game.Vehicle, WORLDS.grass(), { speed: 11, angle: 6 });
        let bobbed = 0;
        for (let tick = 0; tick < 300; tick++) {
            vehicle.update(DT, 0, 0, 0);
            const bob = vehicle.landBob;
            expect(bob).toBeGreaterThanOrEqual(0);
            expect(bob).toBeLessThanOrEqual(WorldPhysics.landBumpM + 1e-9);
            expect(Math.abs(vehicle.landRock)).toBeLessThanOrEqual(WorldPhysics.landWobbleDeg * Math.PI / 180 + 1e-9);
            if (vehicle.runoff) bobbed = Math.max(bobbed, Math.abs(bob));
            else { expect(bob).toBe(0); expect(vehicle.landRock).toBe(0); }
        }
        expect(bobbed).toBeGreaterThan(0);
    });
});

describe('the legs keep their verge', () => {
    // A leg: no world physics. The ledge rule, the run-off, the walls and edges and the low-speed fall, through the
    // whole of update(), against de5a931 at every tick
    let envs;
    beforeAll(() => {
        envs = [0, 1, 5].map(leg => buildEnvironment(game, leg).env);
    }, 120000);

    function trace(VehicleClass, env, side, angle) {
        const vehicle = new VehicleClass(env.scene || new THREE.Scene());
        const point = env.roadPath[5];
        const lateral = side * (env.roadWidth / 2 - 1.5);
        vehicle.environment = env;
        vehicle.position.set(point.x + Math.cos(point.heading) * lateral, point.y, point.z - Math.sin(point.heading) * lateral);
        vehicle.yawAngle = point.heading + side * angle;
        vehicle.currentRoadSegment = 5;
        vehicle.speed = 30;
        const out = [];
        for (let tick = 0; tick < 480; tick++) {
            const steer = tick > 60 ? -side * Math.sin(tick / 40) : 0;
            vehicle.update(DT, steer, tick % 90 < 50 ? 0.7 : 0, tick % 90 > 80 ? 1 : 0);
            out.push([vehicle.speed, vehicle.position.x, vehicle.position.y, vehicle.position.z, vehicle.leanAngle, vehicle.yawAngle, vehicle.crashed, vehicle.offRoadTime]);
        }
        return out;
    }

    test('every tick of a ride off either side of three legs matches de5a931', () => {
        for (const env of envs) {
            for (const side of [-1, 1]) {
                for (const angle of [0.08, 0.25]) {
                    const a = trace(Before, env, side, angle), b = trace(game.Vehicle, env, side, angle);
                    for (let tick = 0; tick < a.length; tick++) {
                        for (let k = 0; k < a[tick].length; k++) expect(Object.is(a[tick][k], b[tick][k])).toBe(true);
                    }
                }
            }
        }
    });
});
