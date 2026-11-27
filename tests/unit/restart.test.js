// A restart: +5 s on the clock, the run stays valid, and the systems it
// touches are put back without a random draw in the traffic. A leg restarts
// from its save checkpoint, from its crash card; a world ride opens no card:
// the fall plays, the call-out says why, and the game puts the bike back where
// it last was on the road (Game.beginWorldCrash, restartInPlace). Game's own
// methods run against a plain object; the real RockfallSystem and Traffic run
// on a real environment. tests/unit/world-restart.test.js rides the real
// slice.
import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { loadGame, buildEnvironment } from '../helpers/load-game.js';

const source = readFileSync(new URL('../../js/main.js', import.meta.url), 'utf8');
// The dialog stack every box of the game opens on (window.Modals)
(0, eval)(readFileSync(new URL('../../js/modals.js', import.meta.url), 'utf8'));
const classSource = source.slice(0, source.indexOf('Game.RESTART_CLEAR_SEGMENTS = 6;') + 'Game.RESTART_CLEAR_SEGMENTS = 6;'.length);
const callouts = [];
// How long each call-out was asked to stay up (ms), in the order of `callouts`
const shown = [];
const Game = new Function('showCallout', 'TourSystem', 'Course', `${classSource}\nreturn Game;`)(
    (text, tone, ms) => { callouts.push([text, tone]); shown.push(ms); },
    { boardId: leg => `${leg.id}-v${leg.trackVersion || 2}` },
    { boardTable: () => ({ 'long-v3': { gates: 14, segments: 700 } }) }
);

const vector = (x = 0, z = 0) => ({
    x,
    z,
    copy(other) {
        this.x = other.x;
        this.z = other.z;
        return this;
    }
});

function fakeGame() {
    const game = Object.create(Game.prototype);
    let clock = 100000;
    Object.assign(game, {
        now: () => clock,
        advance: ms => { clock += ms; },
        startTime: 100000,
        penaltyMs: 0,
        restarts: 0,
        finished: false,
        paused: false,
        score: 800,
        lastCheckpointPosition: vector(50, 60),
        lastCheckpointHeading: 1.5,
        vehicle: {
            distanceTraveled: 123,
            speed: 0,
            position: vector(),
            reset() { this.distanceTraveled = 0; },
            findNearestRoadSegment: jest.fn(),
            updateMesh: jest.fn(),
            routeS: 321 * 20
        },
        environment: { route: { toUnits: s => s / 20 } },
        cones: { reset: jest.fn() },
        rockfalls: { reset: jest.fn() },
        traffic: { clearAround: jest.fn() },
        leaderboardService: { recordRestart: jest.fn(), cancelSession: jest.fn() },
        addScore(points) { this.score += points; },
        removeRunOverlays: jest.fn()
    });
    return game;
}

describe('the clock of a run', () => {
    test('a restart adds 5 s to the time and the time keeps running', () => {
        const game = fakeGame();
        game.advance(30000);
        expect(game.raceElapsed()).toBe(30000);
        game.restartFromCheckpoint();
        expect(game.penaltyMs).toBe(5000);
        expect(game.restarts).toBe(1);
        expect(game.raceElapsed()).toBe(35000);
        game.advance(10000);
        expect(game.raceElapsed()).toBe(45000);
        game.restartFromCheckpoint();
        expect(game.raceElapsed()).toBe(50000);
        expect(game.restarts).toBe(2);
    });

    test('the penalty stays in the time while paused', () => {
        const game = fakeGame();
        game.restartFromCheckpoint();
        game.advance(20000);
        game.paused = true;
        game.pauseStartedAt = game.now();
        game.advance(60000);
        expect(game.raceElapsed()).toBe(25000);
    });

    test('a finished run shows its frozen time', () => {
        const game = fakeGame();
        game.finished = true;
        game.finishTime = 77000;
        game.advance(5000);
        expect(game.raceElapsed()).toBe(77000);
    });

    test('a new run clears the penalty and the count', () => {
        const game = fakeGame();
        game.restartFromCheckpoint();
        game.checkpointTimes = [];
        game.environment = null;
        game.hud = null;
        game.hideSplit = jest.fn();
        game.updateScoreDisplay = jest.fn();
        game.resetRunState();
        expect([game.penaltyMs, game.restarts]).toEqual([0, 0]);
    });
});

describe('restartFromCheckpoint', () => {
    beforeEach(() => { callouts.length = 0; });

    test('puts the bike on the gate on a rolling start at 15 m/s', () => {
        const game = fakeGame();
        game.restartFromCheckpoint();
        expect(game.vehicle.speed).toBe(15);
        expect([game.vehicle.position.x, game.vehicle.position.z]).toEqual([50, 60]);
        expect(game.vehicle.yawAngle).toBe(1.5);
        expect(game.vehicle.distanceTraveled).toBe(123);
    });

    test('keeps the leaderboard run valid: no cancel, one restart recorded', () => {
        const game = fakeGame();
        game.restartFromCheckpoint();
        expect(game.leaderboardService.cancelSession).not.toHaveBeenCalled();
        expect(game.leaderboardService.recordRestart).toHaveBeenCalledTimes(1);
    });

    test('resets cones and rocks, and moves cars within 6 segments of the rider', () => {
        const game = fakeGame();
        game.restartFromCheckpoint();
        expect(game.cones.reset).toHaveBeenCalledTimes(1);
        expect(game.rockfalls.reset).toHaveBeenCalledTimes(1);
        expect(game.traffic.clearAround).toHaveBeenCalledWith(321, 6);
    });

    test('costs style score, never below zero, and says what it cost in time', () => {
        const game = fakeGame();
        game.score = 200;
        game.restartFromCheckpoint();
        expect(game.score).toBe(0);
        expect(callouts[0][0]).toBe('Back to checkpoint +5 s');
    });

    test('does nothing once finished or before the first gate', () => {
        const finished = fakeGame();
        finished.finished = true;
        finished.restartFromCheckpoint();
        expect(finished.penaltyMs).toBe(0);
        const early = fakeGame();
        early.lastCheckpointPosition = null;
        early.restartFromCheckpoint();
        expect([early.penaltyMs, early.restarts]).toEqual([0, 0]);
    });
});

describe('which time a board ranks', () => {
    const game = fakeGame();
    game.environment = { checkpoints: new Array(14).fill({}) };
    game.checkpointTimes = new Array(14).fill(0).map((_, i) => (i + 1) * 1000);
    game.finishTime = 20000.4;

    test('a table board ranks the finish line and expects protocol 2 with its built gate count', () => {
        const leg = { id: 'long', trackVersion: 3 };
        expect(game.isTableBoard(leg)).toBe(true);
        expect(game.boardTimeMs(leg)).toBe(20000);
        expect(game.leaderboardExpectation(leg)).toEqual({ protocol: 2, gates: 14 });
    });

    test('a board on the shared course ranks the last gate and expects protocol 1', () => {
        const leg = { id: 'valley-run', trackVersion: 2 };
        expect(game.isTableBoard(leg)).toBe(false);
        expect(game.boardTimeMs(leg)).toBe(14000);
        expect(game.leaderboardExpectation(leg)).toEqual({ protocol: 1, gates: 14 });
    });
});

describe('what a restart does to the leg', () => {
    let game;
    let env;
    beforeAll(() => {
        game = loadGame();
        const quiet = console.log;
        console.log = () => {};
        try {
            ({ env } = buildEnvironment(game, 4));
        } finally {
            console.log = quiet;
        }
    });

    test('RockfallSystem.reset removes every live rock and schedules the next fall', () => {
        const scene = new game.THREE.Scene();
        const rocks = new game.RockfallSystem(scene, env);
        rocks.triggerFall({ routeS: 332 * 20 });
        expect(rocks.rocks.length).toBeGreaterThan(0);
        const meshes = rocks.rocks.map(rock => rock.mesh);
        rocks.nextFallIn = 0;
        rocks.reset();
        expect(rocks.rocks).toEqual([]);
        meshes.forEach(mesh => expect(scene.children).not.toContain(mesh));
        expect(rocks.nextFallIn).toBeGreaterThan(0);
    });

    test('Traffic.clearAround moves a car within 6 segments ahead of the rider, by a fixed rule', () => {
        const traffic = new game.Traffic(new game.THREE.Scene(), env);
        const [car] = traffic.cars;
        const far = car.currentSegment + 40;
        const draw = jest.spyOn(Math, 'random');
        car.currentSegment = 330;
        traffic.clearAround(332, 6);
        expect(car.currentSegment).toBe(339);
        expect(car.segmentProgress).toBe(0);
        // A car further away stays where it is
        car.currentSegment = far;
        traffic.clearAround(332, 6);
        expect(car.currentSegment).toBe(far);
        expect(draw).not.toHaveBeenCalled();
        draw.mockRestore();
    });
});

describe('a world ride is not thrown away in one key press', () => {
    const worldGame = () => {
        const game = fakeGame();
        game.environment = { isWorld: true, stage: null };
        return game;
    };
    afterEach(() => { Modals.reset(); document.body.innerHTML = ''; });

    test('a full restart asks first, and Cancel leaves the ride as it was', () => {
        const game = worldGame();
        const go = jest.fn();
        expect(game.confirmWorldLeave(game.worldRestartAsk(), go)).toBe(true);
        expect(document.getElementById('worldConfirm').textContent).toContain('Restart the tour from Altdorf?');
        expect(go).not.toHaveBeenCalled();
        document.getElementById('worldConfirmNo').click();
        expect(document.getElementById('worldConfirm')).toBeNull();
        expect(go).not.toHaveBeenCalled();
        expect([game.restarts, game.penaltyMs, game.leaderboardService.cancelSession.mock.calls.length]).toEqual([0, 0, 0]);
    });

    test('Yes goes on, a second press while it is open asks nothing more, a finished ride goes straight on', () => {
        const game = worldGame();
        const go = jest.fn();
        game.confirmWorldLeave('ask', go);
        game.confirmWorldLeave('ask', go);
        expect(document.querySelectorAll('#worldConfirm')).toHaveLength(1);
        document.getElementById('worldConfirmYes').click();
        expect(go).toHaveBeenCalledTimes(1);
        game.finished = true;
        expect(game.confirmWorldLeave('ask', go)).toBe(false);
        expect(go).toHaveBeenCalledTimes(2);
        expect(document.getElementById('worldConfirm')).toBeNull();
    });

    const press = code => document.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));

    test('the race is paused while the box is open: the clock stops, and Cancel gives the paused time back', () => {
        const game = worldGame();
        game.advance(30000);
        game.confirmWorldLeave(game.worldRestartAsk(), jest.fn());
        expect(game.paused).toBe(true);
        game.advance(20000);
        expect(game.raceElapsed()).toBe(30000);
        document.getElementById('worldConfirmNo').click();
        expect(game.paused).toBe(false);
        game.advance(1000);
        expect(game.raceElapsed()).toBe(31000);
    });

    test('a pause the rider took stays theirs when the box closes', () => {
        const game = worldGame();
        game.pauseRace();
        game.confirmWorldLeave('ask', jest.fn());
        document.getElementById('worldConfirmNo').click();
        expect(game.paused).toBe(true);
    });

    test('Enter answers YES and Escape answers CANCEL, and neither reaches the page once the box is gone', () => {
        const game = worldGame();
        const go = jest.fn();
        game.confirmWorldLeave('ask', go);
        press('Escape');
        expect(document.getElementById('worldConfirm')).toBeNull();
        expect(go).not.toHaveBeenCalled();
        game.confirmWorldLeave('ask', go);
        press('Enter');
        expect(document.getElementById('worldConfirm')).toBeNull();
        expect(go).toHaveBeenCalledTimes(1);
        press('Enter');
        expect(go).toHaveBeenCalledTimes(1);
        expect(game.paused).toBe(false);
    });

    test('any restart closes the box and resumes the race, and a key pressed while it was open does not fire later', () => {
        const game = worldGame();
        game.restartInPlace = jest.fn();
        game.input = { clearActions: jest.fn() };
        const go = jest.fn();
        game.confirmWorldLeave(game.worldRestartAsk(), go);
        game.restartFromCheckpoint('off-route');
        expect(document.getElementById('worldConfirm')).toBeNull();
        expect(game.paused).toBe(false);
        expect(game.input.clearActions).toHaveBeenCalled();
        expect(game.restartInPlace).toHaveBeenCalledWith('off-route');
        press('Enter');
        expect(go).not.toHaveBeenCalled();
    });

    test('a world restart starts no leaderboard session, even after a leg was played in the page life', () => {
        const game = worldGame();
        game.leaderboardService.startRun = jest.fn();
        game.tourSystem = { getCurrentLeg: () => ({ id: 'long' }) };
        game.restartLeaderboardSession();
        expect(game.leaderboardService.cancelSession).toHaveBeenCalledTimes(1);
        expect(game.leaderboardService.startRun).not.toHaveBeenCalled();
    });

    test('a world finish records nothing on a board, even with a leg session still active', () => {
        const game = worldGame();
        game.leaderboardService = { isActive: () => true, protocol: 2, recordFinish: jest.fn(() => Promise.resolve()) };
        game.vehicle.finished = false;
        game.showFinishScreen = jest.fn();
        game.finishRun();
        expect(game.leaderboardService.recordFinish).not.toHaveBeenCalled();
        expect(game.finished).toBe(true);
    });
});

// A world ride has no restart at a checkpoint and no crash card: the fall plays, and the rider goes on from where the
// bike last was on the road
describe('a world crash restarts in place by itself', () => {
    const PLACE = { s: 4321, lateral: -1.75 };
    const DT = 1 / 60;
    // The world's atmosphere track runs in units of 100 m (js/atmosphere.js), which Game.atmosphereUnit reads
    beforeAll(() => { globalThis.AtmosphereTrack = { WORLD_UNIT_M: 100 }; });
    afterAll(() => { for (const name of ['AtmosphereTrack', 'RaceTiming', 'HudRules']) delete globalThis[name]; });
    const worldGame = () => {
        const game = fakeGame();
        const point = { x: 100, y: 1500, z: 200, heading: Math.PI / 2 };
        game.vehicle.position = { set(x, y, z) { Object.assign(this, { x, y, z }); } };
        game.vehicle.speed = 22;
        game.vehicle.reset = function () { this.distanceTraveled = 0; this.crashed = false; this.crashCause = null; };
        game.environment = {
            isWorld: true,
            stage: null,
            route: { sample: jest.fn(() => ({ ...point })), toUnits: s => s / 4, unitM: 4 },
            place: jest.fn(),
            guide: { reset: jest.fn() },
            roadworks: { reset: jest.fn(), admit: jest.fn() }
        };
        game.worldRun = { restartPlace: jest.fn(() => ({ ...PLACE })), noteRestart: jest.fn(), restartAt: jest.fn(), lastStation: { s: 3824.7 }, restartSpeed: () => 15 };
        game.worldCamera = { reset: jest.fn() };
        game.atmosphereTrack = { id: 'track' };
        game.weatherSystem = { id: 'weather' };
        game.snapAtmosphere = jest.fn();
        game.input = { steerEase: { reset: jest.fn() }, clearActions: jest.fn(), setMenuActive: jest.fn() };
        game.hud = null;
        game.worldSinceRestartS = Infinity;
        return game;
    };
    // The crash as the loop calls it, then the loop's steps for `seconds`
    const crash = (game, cause = 'Lost the front: too much lean for the grip') => {
        game.vehicle.crashed = true;
        game.vehicle.crashCause = cause;
        // (sliding on: the restart comes at mostS unless a test stops the bike)
        game.vehicle.speed = 9;
        game.showCrashNotification(cause);
    };
    const run = (game, seconds) => { for (let t = 0; t < seconds - 1e-9; t += DT) game.updateWorldCrash(DT); };
    beforeEach(() => { callouts.length = 0; });
    afterEach(() => { Modals.reset(); document.body.innerHTML = ''; });

    test('no dialog opens and none is needed: within the set time the bike is at the place with exactly 5 s added', () => {
        const game = worldGame();
        game.advance(30000);
        crash(game);
        expect(document.getElementById('crashNotification')).toBeNull();
        expect(Modals.top()).toBeFalsy();
        expect(game.input.setMenuActive).not.toHaveBeenCalled();
        expect([game.penaltyMs, game.restarts]).toEqual([0, 0]);
        // The fall is shown: nothing is moved before leastS, even if the bike lies still
        game.vehicle.speed = 0;
        run(game, Game.WORLD_CRASH.leastS - 0.1);
        expect(game.worldRun.restartAt).not.toHaveBeenCalled();
        run(game, Game.WORLD_CRASH.mostS - Game.WORLD_CRASH.leastS + 0.2);
        expect(game.worldRun.restartAt).toHaveBeenCalledTimes(1);
        expect(game.worldRun.restartAt).toHaveBeenCalledWith(PLACE.s);
        expect([game.penaltyMs, game.restarts, game.raceElapsed()]).toEqual([5000, 1, 35000]);
        expect(game.vehicle.crashed).toBe(false);
        expect(document.body.children).toHaveLength(0);
        // And nothing more happens on its own
        run(game, 5);
        expect([game.penaltyMs, game.restarts]).toEqual([5000, 1]);
    });

    test('the time is data: 1.5 to 2.5 s at the most, sooner once the bike has stopped, and a bike that slides on is moved at the most', () => {
        const rule = Game.WORLD_CRASH;
        expect(rule.mostS).toBeGreaterThanOrEqual(1.5);
        expect(rule.mostS).toBeLessThanOrEqual(2.5);
        expect(rule.leastS).toBeLessThan(rule.mostS);
        const still = worldGame();
        crash(still);
        still.vehicle.speed = 0;
        run(still, rule.leastS + 2 * DT);
        expect(still.restarts).toBe(1);
        const sliding = worldGame();
        crash(sliding);
        sliding.vehicle.speed = 9;
        run(sliding, rule.mostS - 2 * DT);
        expect(sliding.restarts).toBe(0);
        run(sliding, 4 * DT);
        expect(sliding.restarts).toBe(1);
    });

    test('the call-out says the cause and the penalty, in the bad tone, for as long as the fall', () => {
        for (const cause of ['Lost the front: too much lean for the grip', 'Rode into Lucy', 'You hit a car', 'Hit the digger']) {
            callouts.length = 0;
            const game = worldGame();
            crash(game, cause);
            expect(callouts).toEqual([[`${cause}  +5 s`, 'bad']]);
            // The restart itself says nothing more
            run(game, Game.WORLD_CRASH.mostS + 0.1);
            expect(callouts).toHaveLength(1);
        }
        callouts.length = 0;
        const game = worldGame();
        game.vehicle.crashed = true;
        game.showCrashNotification();
        expect(callouts[0]).toEqual(['Crashed  +5 s', 'bad']);
    });

    test('a second crash called during the fall is the same crash: one penalty', () => {
        const game = worldGame();
        crash(game);
        run(game, 0.5);
        crash(game, 'You hit a car');
        crash(game, 'Hit the digger');
        expect(callouts).toHaveLength(1);
        run(game, Game.WORLD_CRASH.mostS);
        expect([game.penaltyMs, game.restarts]).toEqual([5000, 1]);
    });

    test('a crash nothing announced is still restarted: no crashed bike is left lying', () => {
        const game = worldGame();
        game.vehicle.crashed = true;
        game.vehicle.crashCause = 'Hit the wall';
        run(game, Game.WORLD_CRASH.mostS + 0.1);
        expect(callouts[0]).toEqual(['Hit the wall  +5 s', 'bad']);
        expect([game.penaltyMs, game.restarts]).toEqual([5000, 1]);
    });

    test('a call-out for a crash or a restart stays up twice as long as the fall is watched', () => {
        const rule = Game.WORLD_CRASH;
        expect(Game.CALLOUT_MS.crash).toBe(2 * rule.mostS * 1000);
        expect(Game.CALLOUT_MS).toEqual({ crash: 4400, restart: 4000, warning: 5000, collision: 3000, bump: 2400, brush: 1500, foot: 2000 });
        const game = worldGame();
        shown.length = 0;
        game.beginWorldCrash('Hit the wall');
        expect(shown).toEqual([Game.CALLOUT_MS.crash]);
        // The fall itself is no longer: the restart still comes at mostS
        expect([rule.mostS, rule.leastS]).toEqual([2.2, 1.5]);
    });

    test('each crash adds 5 s; a place that crashes the rider within a second twice running moves further back each time', () => {
        const game = worldGame();
        const further = () => game.worldRun.restartPlace.mock.calls.map(call => call[1]);
        crash(game);
        run(game, Game.WORLD_CRASH.mostS + DT);
        // Riding on for a while, then another crash: an ordinary one
        run(game, 5);
        crash(game);
        run(game, Game.WORLD_CRASH.mostS + DT);
        expect(further()).toEqual([0, 0]);
        // Now the place itself crashes the rider, again and again, half a second after each restart
        for (let i = 0; i < 4; i++) {
            run(game, 0.5);
            crash(game);
            run(game, Game.WORLD_CRASH.mostS + DT);
        }
        const step = Game.WORLD_CRASH.backStepM;
        expect(further()).toEqual([0, 0, 0, step, 2 * step, 3 * step]);
        expect([game.penaltyMs, game.restarts]).toEqual([30000, 6]);
        // Once the rider gets away the count starts again
        run(game, 3);
        crash(game);
        run(game, Game.WORLD_CRASH.mostS + DT);
        expect(further().pop()).toBe(0);
    });

    test('the bike stands at the place the run names, on its side of the road, facing along the ride, at a standstill', () => {
        const game = worldGame();
        game.restartFromCheckpoint('crash');
        expect(game.worldRun.restartPlace).toHaveBeenCalledWith(game.environment.roadworks, 0);
        expect(game.environment.route.sample).toHaveBeenCalledWith(PLACE.s, expect.anything());
        // (the lateral is laid along the road's own normal: heading pi / 2 puts it along -z)
        expect(game.vehicle.position.x).toBeCloseTo(100, 6);
        expect(game.vehicle.position.z).toBeCloseTo(200 + 1.75, 6);
        expect(game.vehicle.position.y).toBe(1500);
        expect(game.vehicle.yawAngle).toBe(Math.PI / 2);
        expect(game.vehicle.speed).toBe(0);
        expect(game.vehicle.distanceTraveled).toBe(123);
        expect(game.worldCamera.reset).toHaveBeenCalledWith(Math.PI / 2);
    });

    test('held keys start again from nothing: the steer ease is reset and presses made during the fall are dropped', () => {
        const game = worldGame();
        crash(game);
        run(game, Game.WORLD_CRASH.mostS + DT);
        expect(game.input.steerEase.reset).toHaveBeenCalledTimes(1);
        expect(game.input.clearActions).toHaveBeenCalled();
    });

    test('never at the station: the last station is not read, and progress starts again at the place', () => {
        const game = worldGame();
        game.restartFromCheckpoint('crash');
        expect(game.worldRun.restartAt).toHaveBeenCalledTimes(1);
        expect(game.worldRun.restartAt).toHaveBeenCalledWith(PLACE.s);
        expect(game.environment.place).toHaveBeenCalledWith(PLACE.s);
        expect(game.environment.guide.reset).toHaveBeenCalledTimes(1);
        expect(classSource).not.toMatch(/restartAtStation|lastStation\.s/);
    });

    test('exactly 5 s once for each restart, for every reason, and the restart is counted in its stage', () => {
        expect(Game.RESTART_PENALTY_MS).toBe(5000);
        for (const reason of ['key', 'crash', 'off-route', 'cut', 'wrong-way', 'resume']) {
            const game = worldGame();
            game.advance(30000);
            callouts.length = 0;
            game.restartFromCheckpoint(reason);
            expect([reason, game.penaltyMs, game.restarts, game.raceElapsed()]).toEqual([reason, 5000, 1, 35000]);
            // Every reason but a crash (which said its cause during the fall) has words of its own with the cost
            if (reason !== 'crash') expect([reason, callouts.length, /\+5 s$/.test(callouts[0][0]), !!Game.WORLD_RESTART_TEXT[reason]]).toEqual([reason, 1, true, true]);
            expect(game.worldRun.noteRestart).toHaveBeenCalledTimes(1);
            expect(game.leaderboardService.recordRestart).toHaveBeenCalledTimes(1);
            expect(game.leaderboardService.cancelSession).not.toHaveBeenCalled();
        }
    });

    test('the cut rule\'s restart says what it was: the game hands the run\'s cut over with its own reason', () => {
        const game = worldGame();
        game.vehicle.projection = { index: 3, s: 500, lateral: 0, width: 7, heading: 0 };
        game.vehicle.yawAngle = 0;
        game.vehicle.runoff = null;
        let frame = null;
        game.worldRun.update = (f) => { frame = f; return { cut: true, station: -1 }; };
        game.updateWorldRun(DT);
        // The run is told whether the bike is on the land (the road it skips there is what the rule counts)
        expect(frame.land).toBe(false);
        expect([game.penaltyMs, game.restarts]).toEqual([5000, 1]);
        expect(callouts[callouts.length - 1]).toEqual(['Cut the road, back where you left it +5 s', 'warn']);
    });

    test('the traffic is moved clear of the place, every knocked thing stands again, and inside a single lane the lights are the rider\'s', () => {
        const game = worldGame();
        game.restartFromCheckpoint('crash');
        expect(game.traffic.clearAround).toHaveBeenCalledWith(PLACE.s / 4, Math.ceil(Game.RESTART_CLEAR_SEGMENTS * 20 / 4));
        expect(game.environment.roadworks.reset).toHaveBeenCalledTimes(1);
        expect(game.environment.roadworks.admit).toHaveBeenCalledWith(PLACE.s);
    });

    test('the atmosphere snaps to the place', () => {
        const game = worldGame();
        game.restartFromCheckpoint('crash');
        expect(game.snapAtmosphere).toHaveBeenCalledTimes(1);
        const [track, unit, target] = game.snapAtmosphere.mock.calls[0];
        expect(track).toBe(game.atmosphereTrack);
        expect(unit).toBe(PLACE.s / 100);
        expect(target).toEqual({ environment: game.environment, weatherSystem: game.weatherSystem });
    });

    test('a restart for another reason says so, and no text names a checkpoint', () => {
        const game = worldGame();
        game.restartFromCheckpoint('off-route');
        expect(callouts[0]).toEqual(['Off route, back on the road +5 s', 'warn']);
        for (const text of Object.values(Game.WORLD_RESTART_TEXT)) expect(text).not.toMatch(/checkpoint/i);
    });

    test('C restarts in place while riding, before any gate is passed; R while riding restarts nothing', () => {
        expect(source).toMatch(/if \(this\.lastCheckpointPosition \|\| \(this\.environment && this\.environment\.isWorld\)\) \{\s+this\.restartFromCheckpoint\(\);/);
        // R is read only while a card that offers it is open (InputHandler.menuActive), and a world crash opens none
        const input = readFileSync(new URL('../../js/input.js', import.meta.url), 'utf8');
        expect(input).toMatch(/event\.code === 'KeyR' && this\.menuActive/);
    });

    test('a leg keeps its crash card, with its checkpoint action after a gate only', () => {
        const card = (game) => {
            game.input = { setMenuActive: jest.fn() };
            game.pauseRace = jest.fn();
            const quiet = console.log;
            console.log = () => {};
            try { game.showCrashNotification('Hit a rock'); } finally { console.log = quiet; }
            return document.getElementById('crashNotification');
        };
        const game = fakeGame();
        const box = card(game);
        expect([...box.querySelectorAll('.run-buttons button')].map(b => b.textContent)).toEqual(['Checkpoint (+5 s)', 'Restart', 'Menu']);
        expect(Modals.top().element).toBe(box);
        Modals.reset();
        document.body.innerHTML = '';
        const early = fakeGame();
        early.lastCheckpointPosition = null;
        expect([...card(early).querySelectorAll('.run-buttons button')].map(b => b.textContent)).toEqual(['Restart', 'Menu']);
    });

    test('Restart leg is on the pause panel of a world ride, on R, and asks before it restarts the leg', () => {
        const credits = readFileSync(new URL('../../js/world/credits.js', import.meta.url), 'utf8');
        const WorldCredits = new Function('Modals', `${credits}\nreturn WorldCredits;`)(Modals);
        const game = worldGame();
        game.restartLeg = jest.fn();
        const restart = jest.fn(() => game.restartFromPause());
        const panel = WorldCredits.showPause(null, jest.fn(), jest.fn(), restart);
        const button = panel.querySelector('[data-restart]');
        expect(button.textContent).toBe('Restart leg');
        expect(button.dataset.key).toBe('KeyR');
        expect(Modals.top().element).toBe(panel);
        document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR', bubbles: true }));
        expect(restart).toHaveBeenCalledTimes(1);
        expect(document.getElementById('worldConfirm').textContent).toContain('Restart the tour from Altdorf?');
        expect(game.restartLeg).not.toHaveBeenCalled();
        document.getElementById('worldConfirmYes').click();
        expect(game.restartLeg).toHaveBeenCalledTimes(1);
        expect(document.getElementById('worldConfirm')).toBeNull();
        // A leg's pause panel has none (its crash card offers the restart)
        Modals.reset();
        document.body.innerHTML = '';
        expect(WorldCredits.showPause(null, jest.fn(), jest.fn()).querySelector('[data-restart]')).toBeNull();
        expect(source).toMatch(/this\.environment\.isWorld \? \(\) => this\.restartFromPause\(\) : null/);
    });

    test('the finish screens count restarts, not checkpoint restarts', () => {
        const game = worldGame();
        globalThis.RaceTiming = { formatTime: ms => `${ms} ms` };
        globalThis.HudRules = { number: n => String(n) };
        game.restarts = 2;
        game.finishTime = 600000;
        game.worldRouteDistance = () => 13187;
        game.showWorldFinish();
        const text = document.getElementById('finishBanner').textContent;
        expect(text).toContain('2 restarts, +10 s in your time');
        expect(text).not.toMatch(/checkpoint/i);
        game.restarts = 1;
        Modals.reset();
        document.body.innerHTML = '';
        game.showWorldFinish();
        expect(document.getElementById('finishBanner').textContent).toContain('1 restart, +5 s in your time');
        expect(source).not.toMatch(/checkpoint \$\{this\.restarts/);
    });
});
