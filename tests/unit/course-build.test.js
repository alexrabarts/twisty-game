// A converted leg builds from its own course: the road, the gates, the
// roadworks, the start and the finish all come from the course data, local to
// the leg, and a leg that is not converted is untouched. The fixture course
// (tests/fixtures/course-fixture.js) stands in for a shipped leg.
import { describe, test, expect, beforeAll } from '@jest/globals';
import { loadGame, buildEnvironment, legs } from '../helpers/load-game.js';
import { FIXTURE_LEG, fixtureCourse } from '../fixtures/course-fixture.js';

describe('a leg built from a course', () => {
    let game;
    let course;
    let built;
    beforeAll(() => {
        game = loadGame();
        course = fixtureCourse(game.Terrain);
        game.Course.LEGS[FIXTURE_LEG] = course;
        game.Terrain.adopt(game.Course.LEGS);
        const quiet = console.log;
        console.log = () => {};
        try {
            built = buildEnvironment(game, 0);
        } finally {
            console.log = quiet;
        }
    });

    test('the leg is numbered from segment 0 and the road has a 30-segment tail', () => {
        const { env, leg } = built;
        expect([leg.startSegment, leg.endSegment]).toEqual([0, 149]);
        expect([env.startSegment, env.endSegment]).toEqual([0, 149]);
        expect(env.roadPath).toHaveLength(180);
        expect(env.terrainGeometry).toMatchObject({ startSegment: 0, endSegment: 149 });
    });

    test('the road follows the course layout and its absolute control points', () => {
        const { env } = built;
        const height = game.Terrain.elevationFrom(course.elevation.points, course.elevation.roll);
        [0, 40, 100, 149].forEach(i => expect(env.roadPath[i].y).toBeCloseTo(height(i), 9));
        expect(env.roadPath[170].y).toBeCloseTo(height(170), 9);
        const turned = course.layout.reduce((sum, { segments, turnRate }) => sum + segments * turnRate, 0);
        expect(env.roadPath[179].heading).toBeCloseTo(turned, 9);
        expect(env.roadPath[29].heading).toBe(0);
    });

    test('the gates are the course\'s own, and there are three of them', () => {
        expect(built.env.checkpoints.map(gate => gate.segmentIndex)).toEqual([45, 95, 148]);
    });

    test('the roadworks come from the course and the start and finish stand at +5 and segments + 4', () => {
        const { env } = built;
        expect(env.roadworksZones.map(zone => [zone.startSegment, zone.type])).toEqual([[120, 'major']]);
        expect(env.finishGate.segmentIndex).toBe(154);
    });

    test('the tunnel stands where its part says, and the ground follows the parts', () => {
        const { env } = built;
        expect(env.setPieces).toEqual([{ type: 'tunnel', from: 70, to: 75 }]);
        expect(game.Terrain.floorAt(env.terrain, 20).kind).toBe('river');
        expect(game.Terrain.floorAt(env.terrain, 120).kind).toBe('lake');
    });

    test('the board is a new one and the table row is the course\'s', () => {
        expect(game.TourSystem.boardId(FIXTURE_LEG)).toBe('mountain-dawn-v3');
        expect(game.Course.boardTable()).toEqual({ 'mountain-dawn-v3': { gates: 3, segments: 150 } });
    });

    test('a leg that is not converted still builds from the shared course', () => {
        const quiet = console.log;
        console.log = () => {};
        let other;
        try {
            other = buildEnvironment(game, 1);
        } finally {
            console.log = quiet;
        }
        expect(other.env.roadPath).toHaveLength(744);
        expect(other.leg.startSegment).toBe(legs(game)[1].startSegment);
        expect(other.env.checkpoints).toHaveLength(5);
    });
});

describe('cones on a converted leg, by range', () => {
    let game;
    let env;
    beforeAll(() => {
        game = loadGame();
        game.Course.LEGS[FIXTURE_LEG] = fixtureCourse(game.Terrain);
        game.Terrain.adopt(game.Course.LEGS);
        const quiet = console.log;
        console.log = () => {};
        try {
            ({ env } = buildEnvironment(game, 0));
        } finally {
            console.log = quiet;
        }
    });
    const key = spots => spots.map(spot => [spot.x, spot.y, spot.z].join(','));
    const section = k => [Math.max(8, k * 25), Math.min(146, k * 25 + 24)];

    test('a range places the same spots whatever order its sections come in', () => {
        const whole = game.Cones.placeRange(env, 8, 146);
        const forward = [0, 1, 2, 3, 4, 5].flatMap(k => key(game.Cones.placeRange(env, ...section(k))));
        const backward = [5, 4, 3, 2, 1, 0].flatMap(k => key(game.Cones.placeRange(env, ...section(k)))).reverse();
        expect(forward).toEqual(key(whole));
        expect(new Set(backward)).toEqual(new Set(forward));
        expect(whole.length).toBeGreaterThan(8);
    });

    test('no cone stands inside the tunnel, the roadworks or within 3 segments of a gate', () => {
        const spots = game.Cones.placeRange(env, 8, 146);
        const segmentOf = spot => env.roadPath.reduce((best, point, index) => {
            const gap = (point.x - spot.x) ** 2 + (point.z - spot.z) ** 2;
            return gap < best.gap ? { gap, index } : best;
        }, { gap: Infinity, index: -1 }).index;
        spots.forEach(spot => {
            const at = segmentOf(spot);
            expect(at < 69 || at > 76).toBe(true);
            expect(at < 115 || at > 123).toBe(true);
            env.checkpoints.forEach(gate => expect(Math.abs(at - gate.segmentIndex)).toBeGreaterThanOrEqual(2));
        });
    });

    test('on the shared course the whole-leg placement is unchanged by the keep-clear rule', () => {
        const other = loadGame();
        const quiet = console.log;
        console.log = () => {};
        let built;
        try {
            built = buildEnvironment(other, 3);
        } finally {
            console.log = quiet;
        }
        const spots = other.Cones.placeRange(built.env, built.leg.startSegment + 8, built.leg.endSegment - 3);
        expect(spots).toHaveLength(11);
    });
});
