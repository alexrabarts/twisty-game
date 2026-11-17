// The bike reads the same terrain profile the world is built from: edges by
// band (wall, fall, run-off), ground height for a fall, the Y it rides at, and
// the run-off rules. Real Vehicle and Environment on real three r150.
import { jest } from '@jest/globals';
import { buildEnvironment, loadSharedGame as loadGame } from '../helpers/load-game.js';
// Leg 1 is a converted leg now: these tests are of the shared course, with leg 1 put back on it (Course.release)

const DT = 1 / 60;
const CRASHES = /CRASHED|FALLING/;

// Run-off ground: no ledge, a gentle slope away from the road, 35 wide, then a wall.
// No leg uses run-off yet, so the profile lives here.
const runoffSide = (overrides = {}) => ({
    flat: 0,
    bands: [{ to: 35, kind: 'runoff' }, { kind: 'wall' }],
    exact: false,
    face: null,
    base: (dPast, roadY) => roadY - 0.06 * dPast,
    runoff: { drag: 0.35, grip: 0.5, floorSpeed: 6 },
    ...overrides
});
const runoffProfile = (floorY = -500) => ({
    id: 'runoffTest',
    floor: { kind: 'river', y: floorY, restY: floorY + 5 },
    left: runoffSide(),
    right: runoffSide()
});

describe('vehicle on the shared terrain model', () => {
    let game;
    let log;
    const envs = new Map();

    beforeAll(() => {
        log = [];
        game = loadGame(undefined, log);
    });

    // One environment per leg; each test sets the profile it needs. Leg 1 is
    // open valley now: its cliffLake road (the heights these rides were
    // measured on) is built by standing cliffLake in for it.
    function environment(legIndex) {
        if (!envs.has(legIndex)) {
            const entry = game.Terrain.LEGS[legIndex];
            const original = entry.profile;
            if (legIndex === 0) entry.profile = game.Terrain.profiles.cliffLake;
            try {
                const { env } = buildEnvironment(game, legIndex);
                envs.set(legIndex, { env, profile: env.terrain });
            } finally {
                entry.profile = original;
            }
        }
        const entry = envs.get(legIndex);
        entry.env.terrain = entry.profile;
        return entry.env;
    }

    function place(env, segment, lateral, speed) {
        const vehicle = new game.Vehicle(env.scene);
        const point = env.roadPath[segment];
        vehicle.environment = env;
        vehicle.position.set(
            point.x + Math.cos(point.heading) * lateral,
            point.y,
            point.z - Math.sin(point.heading) * lateral
        );
        vehicle.yawAngle = point.heading;
        vehicle.speed = speed;
        vehicle.currentRoadSegment = segment;
        return vehicle;
    }

    // Ride `ticks` ticks of coasting. Returns what happened at each tick.
    function ride(vehicle, ticks, { throttle = 0 } = {}) {
        log.length = 0;
        const history = [null];
        for (let tick = 1; tick <= ticks; tick++) {
            vehicle.update(DT, 0, throttle, 0);
            history.push({
                speed: vehicle.speed,
                y: vehicle.position.y,
                crashed: vehicle.crashed,
                falling: vehicle.fallingOffCliff,
                hitGround: vehicle.hitGround,
                offRoadTime: vehicle.offRoadTime
            });
        }
        const crashTick = history.findIndex(entry => entry && entry.crashed);
        return { history, crashTick: crashTick === -1 ? null : crashTick, lines: log.filter(line => CRASHES.test(line)) };
    }

    const mirrored = profile => {
        const { left, right, ...rest } = profile;
        return { ...rest, left: right, right: left };
    };

    describe('cliff edges (cliffLake: wall on the left, fall on the right)', () => {
        test('a fall off the valley side starts at once and follows the drawn slope', () => {
            const vehicle = place(environment(0), 5, 12.6, 25);
            const { history, crashTick, lines } = ride(vehicle, 420);
            expect(crashTick).toBe(1);
            expect(history[1].falling).toBe(true);
            expect(vehicle.fallSide).toBe(1);
            expect(vehicle.crashAngle).toBeCloseTo(-Math.PI / 4, 12);
            expect(history[60].y).toBeCloseTo(26.601, 3);
            expect(history[300].y).toBeCloseTo(1.939, 3);
            expect(history[420].y).toBeCloseTo(-10.227, 3);
            expect(lines).toContain('=== FALLING OFF RIGHT EDGE ===');
        });

        test('the mountain side is a wall: crash, bounce, no fall', () => {
            const vehicle = place(environment(0), 5, -11.5, 25);
            const { history, crashTick, lines } = ride(vehicle, 60);
            expect(crashTick).toBe(1);
            expect(history[1].falling).toBe(false);
            expect(vehicle.crashAngle).toBeCloseTo(-Math.PI / 6, 12);
            expect(history[1].speed).toBeCloseTo(4.655, 3);
            expect(history[60].speed).toBeCloseTo(1.413, 3);
            expect(lines.some(line => line.startsWith('CRASHED! Hit the left wall at'))).toBe(true);
        });

        test('the ledge slows the bike until it falls', () => {
            const { history, crashTick } = ride(place(environment(0), 5, 11, 25), 60);
            expect(history[1].speed).toBeCloseTo(23.731, 3);
            expect(crashTick).toBe(36);
        });

        test('the hairpin leg behaves the same', () => {
            const fall = ride(place(environment(4), 332, 10.6, 25), 300);
            expect(fall.crashTick).toBe(1);
            expect(fall.history[60].y).toBeCloseTo(21.603, 3);
            expect(fall.history[300].y).toBeCloseTo(-2.869, 3);
            const wall = ride(place(environment(4), 332, -9.5, 25), 1);
            expect(wall.crashTick).toBe(1);
            expect(wall.history[1].falling).toBe(false);
        });

        test('coasting on the road never crashes', () => {
            const { history, crashTick } = ride(place(environment(0), 5, 0, 25), 600);
            expect(crashTick).toBeNull();
            expect(history[1].speed).toBeCloseTo(24.979, 3);
            expect(history[60].speed).toBeCloseTo(23.774, 3);
        });
    });

    describe('edges follow the profile side', () => {
        test('a fall on the left: side, lean and height mirror the right', () => {
            const env = environment(0);
            env.terrain = mirrored(env.terrain);
            const vehicle = place(env, 5, -12.6, 25);
            const { history, lines } = ride(vehicle, 60);
            expect(history[1].falling).toBe(true);
            expect(vehicle.fallSide).toBe(-1);
            expect(vehicle.crashAngle).toBeCloseTo(Math.PI / 4, 12);
            expect(history[60].y).toBeCloseTo(26.601, 3);
            expect(lines).toContain('=== FALLING OFF LEFT EDGE ===');
        });

        test('a wall on the right bounces the bike back toward the road', () => {
            const env = environment(0);
            env.terrain = mirrored(env.terrain);
            const vehicle = place(env, 5, 11.5, 25);
            const { history, lines } = ride(vehicle, 1);
            expect(history[1].crashed).toBe(true);
            expect(history[1].falling).toBe(false);
            expect(vehicle.crashAngle).toBeCloseTo(Math.PI / 6, 12);
            expect(history[1].speed).toBeCloseTo(4.655, 3);
            const heading = env.roadPath[5].heading;
            const alongPerp = vehicle.velocity.x * Math.cos(heading) - vehicle.velocity.z * Math.sin(heading);
            expect(alongPerp).toBeLessThan(0);
            expect(lines.some(line => line.startsWith('CRASHED! Hit the right wall at'))).toBe(true);
        });

        test('valley-run, the mirrored cliff leg: the drop is on the left, the wall on the right', () => {
            const env = environment(1);
            expect(env.terrain).toBe(game.Terrain.profiles.cliffLakeMirrored);
            const over = place(env, 100, -12.6, 25);
            const fall = ride(over, 60);
            expect(fall.crashTick).toBe(1);
            expect(fall.history[1].falling).toBe(true);
            expect(over.fallSide).toBe(-1);
            expect(fall.lines).toContain('=== FALLING OFF LEFT EDGE ===');
            expect(fall.history[60].y).toBeLessThan(env.roadPath[100].y - 3);
            const wall = ride(place(env, 100, 11.5, 25), 1);
            expect(wall.crashTick).toBe(1);
            expect(wall.history[1].falling).toBe(false);
            expect(wall.lines.some(line => line.startsWith('CRASHED! Hit the right wall at'))).toBe(true);
        });

        test('a wall clamps the bike to its face', () => {
            const env = environment(0);
            const vehicle = place(env, 5, -15, 25);
            vehicle.checkWallCollision(0);
            const point = env.roadPath[5];
            const lateral = (vehicle.position.x - point.x) * Math.cos(point.heading) - (vehicle.position.z - point.z) * Math.sin(point.heading);
            expect(lateral).toBeCloseTo(-(env.roadWidth / 2 + 1), 1);
        });
    });

    describe('one model', () => {
        test('the vehicle and the rockfalls have no private height function', () => {
            expect(typeof game.RockfallSystem.prototype.groundYAt).toBe('undefined');
        });

        test('the fall height is Terrain.groundY, clamped at where a fall ends', () => {
            const env = environment(0);
            const spy = jest.spyOn(game.Terrain, 'groundY');
            try {
                const vehicle = place(env, 10, 0, 25);
                const point = env.roadPath[10];
                const at = lateral => vehicle.getTerrainHeightAt(
                    point.x + Math.cos(point.heading) * lateral,
                    point.z - Math.sin(point.heading) * lateral
                );
                expect(at(-20)).toBeCloseTo(46.7288, 4);
                expect(at(20)).toBeCloseTo(23.2888, 4);
                expect(at(200)).toBeCloseTo(-195, 9);
                expect(spy.mock.calls.length).toBeGreaterThanOrEqual(3);
            } finally {
                spy.mockRestore();
            }
        });

        test('a fall with no water floor ends a set depth below the road, and a profile with neither is refused', () => {
            const env = environment(0);
            const fallDepth = 40;
            env.terrain = {
                ...env.terrain,
                floor: { kind: 'none' },
                right: { ...env.terrain.right, fallDepth }
            };
            const vehicle = place(env, 10, 0, 25);
            const point = env.roadPath[10];
            const far = [point.x + Math.cos(point.heading) * 300, point.z - Math.sin(point.heading) * 300];
            expect(vehicle.getTerrainHeightAt(...far)).toBeCloseTo(point.y - fallDepth, 9);

            env.terrain = { ...env.terrain, right: { ...env.terrain.right, fallDepth: undefined } };
            expect(() => vehicle.getTerrainHeightAt(...far)).toThrow(/no rest height/);
        });

        test('a low drop ends in a short lip', () => {
            const env = environment(0);
            const vehicle = place(env, 5, 0, 25);
            vehicle.fallSide = 1;
            expect(vehicle.fallLip()).toBe(8);
            env.terrain = { ...env.terrain, right: { ...env.terrain.right, lipDepth: 2 } };
            expect(vehicle.fallLip()).toBe(2);
            env.terrain = { ...env.terrain, right: { ...env.terrain.right, lipDepth: 20 } };
            expect(vehicle.fallLip()).toBe(8);
        });
    });

    describe('run-off ground', () => {
        const SEGMENT = 75;
        const runoff = () => {
            const env = environment(1); // 20 wide, so run-off starts 10 from the centre line
            env.terrain = runoffProfile();
            return env;
        };

        test('slows the bike, crashes it once after 6 s, and the crashed bike comes to rest', () => {
            const env = runoff();
            const coast = ride(place(env, SEGMENT, 0, 25), 360).history;
            const { history, crashTick, lines } = ride(place(env, SEGMENT, 13, 25), 600);

            expect(history[36].crashed).toBe(false);
            expect(history[60].speed).toBeGreaterThan(15.5);
            expect(history[60].speed).toBeLessThan(18.0);
            expect(coast[60].speed - history[60].speed).toBeGreaterThan(5.0);
            expect(history[300].crashed).toBe(false);
            expect(history[300].speed).toBeGreaterThan(5.85);
            expect(history[300].speed).toBeLessThan(6.10);

            expect([360, 361]).toContain(crashTick);
            expect(history[crashTick + 1].speed).toBeLessThan(history[crashTick].speed);
            expect(history[crashTick + 60].speed).toBeGreaterThan(1.5);
            expect(history[crashTick + 60].speed).toBeLessThan(2.0);
            expect(history[520].speed).toBeLessThan(0.5);
            expect(history[600].speed).toBeLessThan(0.5);
            expect(history[600].offRoadTime).toBe(history[crashTick].offRoadTime);
            expect(lines.filter(line => line.includes('Off the road for 6.0 s'))).toHaveLength(1);
            history.slice(1).forEach(entry => expect(Number.isFinite(entry.y)).toBe(true));
        });

        test('returning to the road after a long run-off does not crash, and the bike can accelerate', () => {
            const env = runoff();
            const point = env.roadPath[SEGMENT];
            const vehicle = place(env, SEGMENT, 13, 25);
            const out = ride(vehicle, 330);
            expect(out.history[330].crashed).toBe(false);
            expect(out.history[330].speed).toBeGreaterThan(5.85);
            expect(out.history[330].speed).toBeLessThan(6.10);
            expect(out.history[330].offRoadTime).toBeCloseTo(5.5, 1);

            // Back to the middle of the road at the same place along it
            const alongX = vehicle.position.x - point.x;
            const alongZ = vehicle.position.z - point.z;
            const along = alongX * Math.sin(point.heading) + alongZ * Math.cos(point.heading);
            vehicle.position.set(point.x + Math.sin(point.heading) * along, vehicle.position.y, point.z + Math.cos(point.heading) * along);
            const back = ride(vehicle, 120);
            expect(back.history[1].offRoadTime).toBe(0);
            back.history.slice(1).forEach(entry => expect(entry.crashed).toBe(false));
            expect(back.history[120].speed).toBeGreaterThanOrEqual(5.5);

            const accelerate = place(env, SEGMENT, 0, 6);
            const fast = ride(accelerate, 60, { throttle: 1 });
            expect(fast.history[60].speed).toBeGreaterThanOrEqual(15);
        });

        test('a bike that enters below the floor speed is not sped up', () => {
            const env = runoff();
            const reference = ride(place(env, SEGMENT, 0, 5), 60).history;
            const slow = place(env, SEGMENT, 13, 5);
            slow.checkWallCollision(DT);
            expect(slow.speed).toBeLessThanOrEqual(5.0);
            const { history } = ride(place(env, SEGMENT, 13, 5), 60);
            // Below the floor, run-off adds nothing: the bike stays near the road's coast
            expect(Math.abs(history[60].speed - reference[60].speed)).toBeLessThan(0.1);
            expect(history[60].crashed).toBe(reference[60].crashed);
        });

        test('the road resets the clock at its true edge, also just after a run-off excursion', () => {
            const env = runoff();
            const vehicle = place(env, SEGMENT, 13, 20);
            ride(vehicle, 30);
            expect(vehicle.offRoadTime).toBeGreaterThan(0);
            const point = env.roadPath[vehicle.currentRoadSegment];
            const lateralOf = () => (vehicle.position.x - point.x) * Math.cos(point.heading) - (vehicle.position.z - point.z) * Math.sin(point.heading);
            // Step back to a quarter metre inside the road edge
            const shift = lateralOf() - (env.roadWidth / 2 - 0.25);
            vehicle.position.x -= Math.cos(point.heading) * shift;
            vehicle.position.z += Math.sin(point.heading) * shift;
            ride(vehicle, 1);
            expect(vehicle.offRoadTime).toBe(0);
            expect(vehicle.runoff).toBeNull();
        });

        test('the 0.95 ledge slow-down does not apply in run-off, and still applies on a shoulder', () => {
            const env = runoff();
            const inRunoff = place(env, SEGMENT, 10.5, 10);
            inRunoff.checkWallCollision(0);
            expect(inRunoff.speed).toBe(10);

            const cliff = environment(0);
            const onLedge = place(cliff, 5, cliff.roadWidth / 2 + 0.5, 10);
            onLedge.checkWallCollision(0);
            expect(onLedge.speed).toBeCloseTo(9.5, 12);
        });

        test('a crashed bike gets no drag, no floor and no timer', () => {
            const env = runoff();
            const vehicle = place(env, SEGMENT, 13, 20);
            vehicle.crashed = true;
            vehicle.velocity.set(0, 0, 8);
            const before = vehicle.offRoadTime;
            ride(vehicle, 10);
            expect(vehicle.offRoadTime).toBe(before);
            expect(vehicle.speed).toBeCloseTo(8 * 0.98 ** 10, 6);
        });

        test('riding into water crashes once', () => {
            const env = environment(1);
            const roadY = env.roadPath[SEGMENT].y;
            // The ground at 15 past the road edge is 0.9 below the road
            env.terrain = runoffProfile(roadY - 0.9);
            const rider = place(env, SEGMENT, 25, 25);
            // Travelling, as the previous tick would have left it
            const heading = env.roadPath[SEGMENT].heading;
            rider.velocity.set(Math.sin(heading) * 25, 0, Math.cos(heading) * 25);
            const { crashTick, history, lines } = ride(rider, 120);
            expect(crashTick).toBe(1);
            expect(lines.filter(line => line.startsWith('CRASHED! Rode into the water'))).toHaveLength(1);
            expect(history[120].speed).toBeLessThan(history[2].speed);
        });

        test('the bike rides on the ground beside the road, not the road height', () => {
            const env = runoff();
            const vehicle = place(env, SEGMENT, 20, 15);
            const { history } = ride(vehicle, 60);
            expect(history[60].crashed).toBe(false);
            // The road height under the bike, interpolated between its two segments, less
            // the 0.6 the ground falls over the 10 m past the road edge
            const loc = {};
            game.Terrain.locate(env.roadPath, vehicle.position.x, vehicle.position.z, 0, env.roadPath.length - 1, loc);
            const next = env.roadPath[loc.index + (loc.along >= 0 ? 1 : -1)];
            const roadY = loc.roadY + (next.y - loc.roadY) * Math.min(1, Math.abs(loc.along) / game.Terrain.SEGMENT_LENGTH);
            expect(Math.abs(vehicle.position.y - (roadY - 0.6))).toBeLessThan(0.15);
            expect(vehicle.position.y).toBeLessThan(roadY - 0.4);
        });

        test('surfaceAt is the road height on road, wall and fall zones, and the ground in run-off', () => {
            const cliff = environment(0);
            const rider = place(cliff, 10, 0, 25);
            const point = cliff.roadPath[10];
            const at = (vehicle, lateral) => vehicle.surfaceAt(
                point.x + Math.cos(point.heading) * lateral, point.z - Math.sin(point.heading) * lateral
            );
            [-30, -11.5, 0, 9, 11, 30].forEach(lateral => expect(at(rider, lateral)).toBe(point.y));

            const env = runoff();
            const vehicle = place(env, SEGMENT, 0, 25);
            const base = env.roadPath[SEGMENT];
            const out = lateral => vehicle.surfaceAt(
                base.x + Math.cos(base.heading) * lateral, base.z - Math.sin(base.heading) * lateral
            );
            expect(out(5)).toBe(base.y);
            expect(out(20)).toBeCloseTo(base.y - 0.6, 6);
            expect(out(-20)).toBeCloseTo(base.y - 0.6, 6);
        });

        test('a crashed bike in run-off lands on the ground, and a jump lands on it too', () => {
            const env = runoff();
            const slide = place(env, SEGMENT, 20, 10);
            slide.crashed = true;
            slide.velocity.set(0, -5, 0);
            slide.position.y = slide.surfaceAt(slide.position.x, slide.position.z) + 0.05;
            ride(slide, 2);
            expect(slide.position.y).toBeCloseTo(slide.surfaceAt(slide.position.x, slide.position.z), 6);

            const jumper = place(env, SEGMENT, 20, 15);
            jumper.isJumping = true;
            jumper.jumpVelocityY = -5;
            jumper.jumpStartHeight = jumper.position.y;
            jumper.position.y = jumper.surfaceAt(jumper.position.x, jumper.position.z) + 0.05;
            ride(jumper, 1);
            expect(jumper.isJumping).toBe(false);
            expect(jumper.position.y).toBeCloseTo(jumper.surfaceAt(jumper.position.x, jumper.position.z), 6);
        });

        test('grip on loose ground multiplies the weather grip', () => {
            const env = runoff();
            const vehicle = place(env, SEGMENT, 13, 20);
            vehicle.weatherSystem = { getPhysicsMultipliers: () => ({ lateralFriction: 0.8, brakeForce: 0.9, acceleration: 1 }) };
            expect(vehicle.physicsMultipliers()).toEqual({ lateralFriction: 0.8, brakeForce: 0.9, acceleration: 1 });
            ride(vehicle, 1);
            const grip = vehicle.physicsMultipliers();
            expect(grip.lateralFriction).toBeCloseTo(0.4, 12);
            expect(grip.brakeForce).toBeCloseTo(0.45, 12);
            expect(grip.acceleration).toBeCloseTo(0.5, 12);
        });
    });
});
