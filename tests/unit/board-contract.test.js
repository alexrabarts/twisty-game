// The server's table of boards, the game's courses and the built legs agree.
// functions/ is deployed alone and cannot load js/course.js, so its copy
// (functions/courses.json) is bound to the game here.
import { describe, test, expect, beforeAll } from '@jest/globals';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { loadGame, buildEnvironment, legs } from '../helpers/load-game.js';
import { FIXTURE_LEG, fixtureCourse } from '../fixtures/course-fixture.js';

const require = createRequire(import.meta.url);
const boards = require('../../functions/lib/boards.js');
const courses = require('../../functions/courses.json');

const quiet = fn => {
    const log = console.log;
    console.log = () => {};
    try {
        return fn();
    } finally {
        console.log = log;
    }
};

describe('the server table and the game', () => {
    let game;
    beforeAll(() => {
        game = loadGame();
    });

    test('functions/courses.json equals Course.boardTable()', () => {
        expect(courses).toEqual(game.Course.boardTable());
    });

    test('every leg of the shared course has 5 gates, and the server expects 5', () => {
        legs(game).forEach((leg, index) => {
            const { env } = quiet(() => buildEnvironment(game, index));
            const boardId = game.TourSystem.boardId(leg);
            expect(boards.ruleFor(boardId).gates).toBe(env.checkpoints.length);
            expect(boards.ruleFor(boardId)).toBe(boards.LEGACY);
        });
    });

    test('every converted leg builds the gates its row states, with gaps a rider cannot beat', () => {
        const converted = Object.keys(game.Course.LEGS);
        converted.forEach(id => {
            const index = legs(game).findIndex(leg => leg.id === id);
            const { env, leg } = quiet(() => buildEnvironment(game, index));
            const rule = boards.ruleFor(game.TourSystem.boardId(leg));
            expect(rule.gates).toBe(env.checkpoints.length);
            const segments = env.checkpoints.map(gate => gate.segmentIndex);
            segments.slice(1).forEach((segment, i) => {
                expect((segment - segments[i]) * boards.SEGMENT_M).toBeGreaterThanOrEqual(500);
            });
        });
    });

    describe('a course installed on top of a leg', () => {
        let installed;
        let built;
        beforeAll(() => {
            installed = loadGame();
            installed.Course.LEGS[FIXTURE_LEG] = fixtureCourse(installed.Terrain);
            installed.Terrain.adopt(installed.Course.LEGS);
            built = quiet(() => buildEnvironment(installed, 0));
        });

        test('boardTable() names the board id with the gate and segment counts', () => {
            const id = installed.TourSystem.boardId(built.leg);
            expect(installed.Course.boardTable()).toEqual({ [id]: { gates: 3, segments: 150 } });
        });

        test('the server rule for that row takes its gate count from the built leg', () => {
            const table = installed.Course.boardTable();
            const id = installed.TourSystem.boardId(built.leg);
            const rule = boards.ruleFor(id, table);
            expect(rule.protocol).toBe(2);
            expect(rule.gates).toBe(built.env.checkpoints.length);
            expect(boards.storePath(id, table)).toBe(`courseBoards/${id}`);
        });

        test('a segment is 20 m of road and the gates are at least 500 m apart', () => {
            const { roadPath, checkpoints } = built.env;
            const step = Math.hypot(roadPath[11].x - roadPath[10].x, roadPath[11].z - roadPath[10].z);
            expect(step).toBeCloseTo(boards.SEGMENT_M, 0);
            const segments = checkpoints.map(gate => gate.segmentIndex);
            segments.slice(1).forEach((segment, i) => {
                expect((segment - segments[i]) * boards.SEGMENT_M).toBeGreaterThanOrEqual(500);
            });
        });
    });
});

describe('the limits come from what the game can do', () => {
    test('the floor speed is above the fastest bike on the fastest character', () => {
        const source = readFileSync(new URL('../../js/vehicle.js', import.meta.url), 'utf8');
        const multipliers = [...source.matchAll(/maxSpeed:\s*([0-9.]+),/g)].map(match => Number(match[1]));
        const baseSpeed = Number(/this\.maxSpeed = (\d+);/.exec(source)[1]);
        const fastest = Math.max(...multipliers) * baseSpeed;
        expect(fastest).toBeCloseTo(74.8, 6);
        expect(boards.FLOOR_SPEED).toBeGreaterThanOrEqual(1.1 * fastest - 1e-9);
    });

    test('an honest ride over the smallest allowed gate gap is never under the gate floor', () => {
        expect(boards.LONG.minGateMs).toBeLessThanOrEqual(500 / boards.FLOOR_SPEED * 1000);
    });

    test('the restart penalty is the same number on the client and on the server', () => {
        const source = readFileSync(new URL('../../js/main.js', import.meta.url), 'utf8');
        expect(Number(/Game\.RESTART_PENALTY_MS = (\d+);/.exec(source)[1])).toBe(boards.LONG.penaltyMs);
    });

    test('the server session lasts longer than the slowest run it accepts', () => {
        expect(boards.LONG.ttlMs).toBeGreaterThan(boards.LONG.maxTotalMs);
        expect(boards.LEGACY.ttlMs).toBeGreaterThan(boards.LEGACY.maxTimeMs);
    });
});
