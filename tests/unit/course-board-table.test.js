// The gate table a converted leg publishes: one row per board id, derived from
// the course and never written by hand, so the server's copy cannot drift from
// the game's without tests/unit/board-contract.test.js failing.
import { describe, test, expect } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';
import { FIXTURE_LEG, fixtureCourse } from '../fixtures/course-fixture.js';

const withFixture = () => {
    const game = loadGame();
    game.Course.LEGS[FIXTURE_LEG] = fixtureCourse(game.Terrain);
    game.Terrain.adopt(game.Course.LEGS);
    return game;
};

describe('Course.boardTable()', () => {
    test('holds the converted legs only: leg 1 since its pilot, every other board on the shared course', () => {
        const game = loadGame();
        expect(Object.keys(game.Course.LEGS)).toEqual(['mountain-dawn']);
        expect(game.Course.boardTable()).toEqual({ 'mountain-dawn-v3': { gates: 14, segments: 700 } });
    });

    test('has one row for each converted leg, under that leg\'s bumped board id', () => {
        const game = withFixture();
        const table = game.Course.boardTable();
        const leg = game.TourSystem.boardId(FIXTURE_LEG);
        expect(Object.keys(table)).toEqual([leg]);
        expect(leg).toMatch(/-v\d+$/);
        expect(table[leg]).toEqual({ gates: 3, segments: 150 });
    });

    test('takes the gate count from the course gates, not from a constant', () => {
        const game = loadGame();
        const course = fixtureCourse(game.Terrain);
        course.gates = [45, 148];
        game.Course.LEGS[FIXTURE_LEG] = course;
        game.Terrain.adopt(game.Course.LEGS);
        expect(Object.values(game.Course.boardTable())[0].gates).toBe(2);
    });

    test('a leg that is not converted keeps its old board id', () => {
        const game = withFixture();
        const other = game.Terrain.LEGS.find(leg => leg.id !== FIXTURE_LEG);
        expect(game.TourSystem.boardId(other.id)).toBe(game.TourSystem.boardId(other));
        expect(game.Course.boardTable()[game.TourSystem.boardId(other.id)]).toBeUndefined();
    });
});
