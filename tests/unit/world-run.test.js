// The riding half of a world (R2-R5): the run state and the cut rule (WorldRun), the chase camera
// (WorldCamera), the stage look table and the atmosphere track along a ride (AtmosphereTrack.forWorld).
import { describe, test, expect, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { loadGame, loadScript } from '../helpers/load-game.js';
import { ladder } from '../fixtures/world/stacked-ladder.js';
import { samplesOf, straight } from '../helpers/world-synthetic.js';

const game = loadGame();
const { WorldRoute, WorldRun, WorldCamera, WorldLooks, WorldPhysics, AtmosphereTrack } = game;

const DT = 1 / 60;
// One frame of the projection the run reads
const frame = (s, extra = {}) => ({ s, lateral: 0, width: 10, speed: 15, dt: DT, forwardDot: 1, ...extra });

describe('WorldRun stages', () => {
    const route = new WorldRoute(samplesOf(straight(700)), {
        stages: [{ id: 'a', name: 'A', from: 0, to: 300 }, { id: 'b', name: 'B', from: 300, to: 600 }]
    });
    const stations = [
        { s: 0, stage: 'a', kind: 'start' }, { s: 100, stage: 'a', kind: 'gate' }, { s: 300, stage: 'a', kind: 'boundary' },
        { s: 400, stage: 'b', kind: 'gate' }, { s: 500, stage: 'b', kind: 'gate' }, { s: 600, stage: 'b', kind: 'end' }
    ];

    test('a boundary ends one stage and starts the next; only the last station ends the ride', () => {
        const run = new WorldRun(route, stations, WorldPhysics);
        expect([run.stageIndex, run.stageCount]).toEqual([0, 2]);
        expect(run.stageGates(0)).toEqual({ total: 1, passed: 0 });
        expect(run.stageGates(1)).toEqual({ total: 2, passed: 0 });
        for (let s = 0; s <= 300.5; s += 0.2) {
            const r = run.update(frame(s));
            if (r.station >= 0) run.onStation(r.station, Math.round(s * 100));
        }
        expect(run.stationIndex).toBe(2);
        expect(run.stageGates(0)).toEqual({ total: 1, passed: 1 });
        run.onStageFinish(0, 30000);
        expect([run.stageIndex, run.stageStartMs, run.stageTimes[0]]).toEqual([1, 30000, 30000]);
        expect(run.finished).toBe(false);
        run.noteRestart();
        expect(run.stageRestarts).toEqual([0, 1]);
        expect(run.stageGates(1)).toEqual({ total: 2, passed: 0 });
    });

    test('begin puts the stage state back, and a ride that starts inside a stage starts in it', () => {
        const run = new WorldRun(route, stations, WorldPhysics);
        run.onStageFinish(0, 5000);
        run.noteRestart();
        run.begin(0);
        expect([run.stageIndex, run.stageStartMs, run.stageTimes, run.stageRestarts]).toEqual([0, 0, [], [0, 0]]);
        run.begin(350);
        expect(run.stageIndex).toBe(1);
    });
});

describe('the game over a ride of stages', () => {
    // Game's own updateWorldRun, run against a plain object with the real WorldRun
    const source = readFileSync(new URL('../../js/main.js', import.meta.url), 'utf8');
    const classSource = source.slice(0, source.indexOf('Game.RESTART_CLEAR_SEGMENTS = 6;') + 'Game.RESTART_CLEAR_SEGMENTS = 6;'.length);
    const Game = new Function('showCallout', 'HudRules', 'WorldRun', `${classSource}\nreturn Game;`)(() => {}, { stageClock: ms => String(ms) }, WorldRun);
    const route = new WorldRoute(samplesOf(straight(700)), {
        stages: [{ id: 'a', name: 'A', from: 0, to: 300 }, { id: 'b', name: 'B', from: 300, to: 600 }]
    });
    const stations = [
        { s: 0, stage: 'a', kind: 'start' }, { s: 100, stage: 'a', kind: 'gate' }, { s: 300, stage: 'a', kind: 'boundary' },
        { s: 400, stage: 'b', kind: 'gate' }, { s: 500, stage: 'b', kind: 'gate' }, { s: 600, stage: 'b', kind: 'end' }
    ];

    test('the finish ends the last stage too: one stage time per stage, and they add up to the ride', () => {
        let clock = 0;
        const game = Object.assign(Object.create(Game.prototype), {
            vehicle: { projection: { index: 0, s: 0, lateral: 0, width: 10, heading: 0 }, speed: 15, yawAngle: 0 },
            worldRun: new WorldRun(route, stations, WorldPhysics),
            environment: { stationGates: stations, checkpoints: stations.slice(1, -1).map((st, i) => ({ index: i, s: st.s })) },
            raceElapsed: () => clock,
            passCheckpoint: jest.fn(),
            restartFromCheckpoint: jest.fn(),
            finishRun: jest.fn()
        });
        for (let s = 0; s <= 601 && !game.finishRun.mock.calls.length; s += 0.2) {
            clock = Math.round(s * 100);
            game.vehicle.projection.s = s;
            game.updateWorldRun(DT);
        }
        const run = game.worldRun;
        expect(game.finishRun).toHaveBeenCalledTimes(1);
        expect(run.stageTimes.length).toBe(run.stageCount);
        run.stageTimes.forEach(ms => expect(ms).toBeGreaterThan(0));
        expect(run.stageTimes.reduce((a, b) => a + b, 0)).toBe(run.stationTimes[stations.length - 1]);
    });
});

describe('WorldRun stations', () => {
    const route = new WorldRoute(samplesOf(straight(400)), {});
    const stations = [{ s: 0 }, { s: 100 }, { s: 200 }, { s: 300 }];

    test('a station is passed in order, as progress goes past it, facing along the road and on it', () => {
        const run = new WorldRun(route, stations, WorldPhysics);
        let passed = [];
        for (let s = 0; s <= 250; s += 0.2) {
            const result = run.update(frame(s));
            if (result.station >= 0) passed.push([result.station, s]);
        }
        expect(passed.map(p => p[0])).toEqual([1, 2]);
        expect(passed[0][1]).toBeGreaterThanOrEqual(100);
        expect(run.lastStation).toBe(stations[2]);
        expect(run.finished).toBe(false);
    });

    test('a bike facing back, or off the road, credits nothing; the last station finishes', () => {
        const run = new WorldRun(route, stations, WorldPhysics);
        for (let s = 0; s < 99.9; s += 0.2) run.update(frame(s));
        expect(run.update(frame(100.1, { forwardDot: -1 })).station).toBe(-1);
        expect(run.update(frame(100.3, { lateral: 40 })).station).toBe(-1);
        expect(run.update(frame(100.5)).station).toBe(1);
        for (let s = 100.7; s <= 300.4; s += 0.2) run.update(frame(s));
        expect(run.finished).toBe(true);
        expect(run.stationIndex).toBe(3);
    });

    test('a restart starts progress again at the station, so the ride goes on from there', () => {
        const run = new WorldRun(route, stations, WorldPhysics);
        for (let s = 0; s <= 150; s += 0.2) run.update(frame(s));
        run.restartAt(100);
        expect(run.lastS).toBe(100);
        expect(run.stationIndex).toBe(1);
        expect(run.update(frame(100.2)).cut).toBe(false);
    });
});

describe('WorldRun cut rule', () => {
    const route = new WorldRoute(samplesOf(ladder()), {});
    // The ladder's legs lie 111 m apart in s with 25 m between them
    const stations = [{ s: 0 }, { s: 300 }];

    const hold = (run, count, make) => {
        let cut = false;
        for (let i = 0; i < count; i++) if (run.update(make(i)).cut) cut = true;
        return cut;
    };

    test('honest riding is accepted frame after frame', () => {
        const run = new WorldRun(route, stations, WorldPhysics);
        expect(hold(run, 600, i => frame(i * 15 * DT))).toBe(false);
        expect(run.pendingCutMs).toBe(0);
    });

    test('a jump across the ladder that holds for cutConfirmMs restarts the rider, once it is confirmed', () => {
        const run = new WorldRun(route, stations, WorldPhysics);
        run.begin(20);
        let frames = 0;
        let cut = false;
        while (!cut && frames < 60) {
            cut = run.update(frame(131)).cut;
            frames++;
        }
        expect(cut).toBe(true);
        const ms = frames * DT * 1000;
        expect(ms).toBeGreaterThanOrEqual(WorldPhysics.cutConfirmMs - 20);
        expect(ms).toBeLessThanOrEqual(WorldPhysics.cutConfirmMs + 40);
    });

    test('a forward flicker shorter than cutConfirmMs costs nothing', () => {
        const run = new WorldRun(route, stations, WorldPhysics);
        run.begin(20);
        expect(hold(run, 8, () => frame(131))).toBe(false);
        expect(run.update(frame(20.2)).cut).toBe(false);
        expect(run.pendingCutMs).toBe(0);
        expect(hold(run, 8, () => frame(131))).toBe(false);
    });

    test('a long backward stay is ignored: progress is a high-water mark and no station is credited', () => {
        const run = new WorldRun(route, [{ s: 0 }, { s: 20 }, { s: 300 }], WorldPhysics);
        run.begin(130);
        // 30 frames of the projection on the leg below, then back
        expect(hold(run, 30, () => frame(20))).toBe(false);
        expect(run.lastS).toBe(130);
        expect(run.stationIndex).toBe(0);
        expect(run.update(frame(131)).cut).toBe(false);
        expect(run.lastS).toBe(131);
    });

    // The ladder: drop to the lower leg, ride round for ten seconds, cross to the upper leg. The banked
    // allowance must not buy the 110 m jump.
    const ladderCut = (physics) => {
        const run = new WorldRun(route, stations, physics);
        run.begin(130);
        // 399 frames: just short of the 400 at which the stay on the lower leg is accepted and the bank empties
        hold(run, 399, () => frame(20));
        return hold(run, 30, () => frame(240));
    };

    test('circling on the lower leg does not bank the jump to the upper leg (C9)', () => {
        expect(WorldPhysics.maxBankM * 2).toBeLessThan(111);
        expect(ladderCut(WorldPhysics)).toBe(true);
    });

    test('with no cap on the bank the same ladder is skipped: the cap is what stops it', () => {
        expect(ladderCut({ ...WorldPhysics, maxBankM: Infinity })).toBe(false);
    });

    test('a frame facing backward banks nothing', () => {
        const run = new WorldRun(route, stations, WorldPhysics);
        run.begin(130);
        hold(run, 600, () => frame(20, { forwardDot: -1 }));
        expect(run.allowAccum).toBe(0);
    });
});

describe('WorldRun restart speed', () => {
    test('a straight road restarts at the most; a hairpin restarts at 0.8 of what it allows', () => {
        const flat = new WorldRun(new WorldRoute(samplesOf(straight(400)), {}), [{ s: 0 }], WorldPhysics);
        expect(flat.restartSpeed(0)).toBe(WorldPhysics.restartSpeedMax);
        const bends = new WorldRun(new WorldRoute(samplesOf(ladder()), {}), [{ s: 0 }], WorldPhysics);
        const speed = bends.restartSpeed(60);
        expect(speed).toBeLessThan(WorldPhysics.restartSpeedMax);
        const lean = Math.tan(Math.atan(Math.tan(WorldPhysics.leanCapDeg * Math.PI / 180) * WorldPhysics.cobbleGrip));
        const radius = 25 / 2;
        expect(speed).toBeLessThanOrEqual(0.8 * Math.sqrt(9.81 * lean * radius) + 1e-6);
        expect(speed).toBeGreaterThan(3);
    });
});

describe('WorldCamera', () => {
    const road = new WorldRoute(samplesOf(straight(400)), {});
    const flatGround = (height) => ({ groundY: () => height });
    const origin = { x: 0, y: 101.2, z: 100 };

    test('the look target is on the route ahead: 8 m and 0.6 s of speed, lifted', () => {
        const camera = new WorldCamera(road, flatGround(0));
        const look = camera.lookTarget(100, 10, 2);
        expect(look.z).toBeCloseTo(114, 6);
        expect(look.y).toBeCloseTo(102, 6);
    });

    test('on a hairpin the look target moves out to the road 30 m ahead; on a straight it does not', () => {
        // A half circle of 15 m radius, then a straight leg back
        const points = [];
        const R = 15;
        for (let a = 0; a <= Math.PI + 1e-9; a += 4 / R) points.push({ x: R - R * Math.cos(a), y: 100, z: R * Math.sin(a), heading: a, width: 10 });
        for (let z = 0; z >= -200; z -= 4) points.push({ x: 2 * R, y: 100, z, heading: Math.PI, width: 10 });
        const bend = new WorldRoute(samplesOf(points), {});
        const camera = new WorldCamera(bend, flatGround(0));
        expect(camera.bendShare(0)).toBeGreaterThan(0.9);
        expect(new WorldCamera(road, flatGround(0)).bendShare(100)).toBe(0);
        const at = bend.sample(30, {});
        const look = camera.lookTarget(0, 10, 0);
        expect(Math.hypot(look.x - at.x, look.z - at.z)).toBeLessThan(1e-6);
    });

    test('the boom yaw follows the route and turns at no more than 120 degrees a second', () => {
        const bends = new WorldRoute(samplesOf(ladder()), {});
        const camera = new WorldCamera(bends, flatGround(0));
        camera.reset(0);
        const before = camera.yaw;
        camera.followYaw(30, 0.1);
        expect(Math.abs(camera.yaw - before)).toBeCloseTo(WorldCamera.YAW_RATE * 0.1, 9);
        for (let i = 0; i < 100; i++) camera.followYaw(30, 0.1);
        expect(camera.yaw).toBeCloseTo(bends.sample(26, {}).heading, 6);
    });

    test('land in the way shortens the boom at once and it grows back slowly', () => {
        const wall = { groundY: (x, z) => (z < 95 ? 200 : 0) };
        const camera = new WorldCamera(road, wall);
        const want = { x: 0, y: 104, z: 80 };
        const out = {};
        camera.place(origin, want, 25, DT, out);
        expect(camera.fraction).toBeLessThan(1);
        expect(out.z).toBeGreaterThan(want.z);
        const blocked = camera.fraction;
        const open = new WorldCamera(road, flatGround(0));
        open.fraction = blocked;
        open.clearFraction(origin, want, 25, DT);
        expect(open.fraction).toBeCloseTo(blocked + WorldCamera.GROW_PER_FRAME, 9);
        for (let i = 0; i < 100; i++) open.clearFraction(origin, want, 25, DT);
        expect(open.fraction).toBe(1);
    });

    test('the camera never sits under the land', () => {
        const camera = new WorldCamera(road, flatGround(110));
        const out = {};
        camera.place({ x: 0, y: 112, z: 100 }, { x: 0, y: 112, z: 90 }, 25, DT, out);
        expect(out.y).toBeGreaterThanOrEqual(110 + WorldCamera.FLOOR_M);
    });
});

describe('the stage looks and the atmosphere along a ride', () => {
    const route = new WorldRoute(samplesOf(straight(20000, { y: 1000 }).map((p, i) => ({ ...p, y: 1000 + i }))), {});
    const stages = [{ id: 'tremola', from: 0, to: 10000 }, { id: 'unknown', from: 10000, to: 20000 }];

    test('a stage takes its own parts, or the default; the track runs in 100 m units', () => {
        const track = AtmosphereTrack.forWorld(stages, route, WorldLooks);
        const sample = track.sample(5, {});
        expect(sample.a.timeOfDay).toBe('day');
        const summit = track.sample(90, {});
        expect(summit.a.weather).toBe('fog');
        expect(AtmosphereTrack.WORLD_UNIT_M).toBe(100);
    });

    test('baseY of a part is the lowest road under it', () => {
        const track = AtmosphereTrack.forWorld(stages, route, WorldLooks);
        expect(track.sample(2, {}).a.baseY).toBeCloseTo(route.heightRange(0, 7000).min, 6);
    });

    test('no part with a hairpin has rain or snow', () => {
        Object.values(WorldLooks).flat().forEach((part) => {
            expect(['rain', 'snow', 'storm']).not.toContain(part.look.weather);
        });
    });

    test('the day preset is a new key in the sky presets and the time table, so no leg look changes', () => {
        const sky = loadScript('graphics.js');
        const main = loadScript('main.js');
        expect(sky).toMatch(/SKY_PRESETS = \{[\s\S]*\n    day: \{/);
        expect(main).toMatch(/timeConfigs = \{[\s\S]*\n            day: \{/);
    });
});
