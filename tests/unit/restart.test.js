// A restart from a save checkpoint: +5 s on the clock, the run stays valid,
// and the systems it touches are put back without a random draw in the
// traffic. Game's own methods run against a plain object; the real
// RockfallSystem and Traffic run on a real environment.
import { describe, test, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { loadGame, buildEnvironment } from '../helpers/load-game.js';

const source = readFileSync(new URL('../../js/main.js', import.meta.url), 'utf8');
const classSource = source.slice(0, source.indexOf('Game.RESTART_CLEAR_SEGMENTS = 6;') + 'Game.RESTART_CLEAR_SEGMENTS = 6;'.length);
const callouts = [];
const Game = new Function('showCallout', 'TourSystem', 'Course', `${classSource}\nreturn Game;`)(
    (text, tone) => callouts.push([text, tone]),
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
            currentRoadSegment: 321
        },
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
        rocks.triggerFall({ currentRoadSegment: 332 });
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
