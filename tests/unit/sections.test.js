// The sections of a converted leg (js/environment.js, buildCourse): sections
// join with no seam, the ground the bike reads is the ground drawn whether or
// not a section is built, and a section is the same in any build order.
// The fixture course stands in for a leg; the shipped converted legs run the
// same checks (tests/unit/course-mountain-dawn.test.js covers leg 1's own).
import { describe, test, expect, beforeAll } from '@jest/globals';
import { quietly, courseGame, build, buildAll, sectionHash, seamReport, groundReport } from '../helpers/sections.js';

describe('sections of the fixture course', () => {
    let game;
    let env;
    beforeAll(() => {
        game = courseGame();
        ({ env } = build(game, 0));
        buildAll(env);
    });

    test('the leg has 6 sections of 25 segments, the last reaching 20 past the finish', () => {
        expect(env.sections.map((section) => [section.from, section.to])).toEqual([[0, 25], [25, 50], [50, 75], [75, 100], [100, 125], [125, 170]]);
        expect(env.sections.every((section) => section.state === 'built')).toBe(true);
    });

    test('sections join with no seam: position and colour bitwise, normals within 1e-6', () => {
        const report = seamReport(game, env);
        expect(report).toEqual({ seams: 10, mismatches: 0, worstNormal: expect.any(Number) });
        expect(report.worstNormal).toBeLessThanOrEqual(1e-6);
    });

    test('the ground the bike reads is the ground drawn, also across a boundary', () => {
        const report = groundReport(game, env);
        expect(report.missed).toBe(0);
        expect(report.worst).toBeLessThanOrEqual(0.01);
        // The shoulder is drawn by the verge strip alone, 0.1 under the road by design (as on every leg)
        expect(report.worstShoulder).toBeLessThanOrEqual(0.15);
    });

    test('a disposed section reads the same ground as before', () => {
        const report = groundReport(game, env, 120);
        const inside = report.points.filter((point) => point.s < 25).slice(0, 10);
        expect(inside).toHaveLength(10);
        const before = inside.map(({ x, z }) => report.read(x, z));
        quietly(() => env.disposeSection(env.sections[0]));
        expect(env.sections[0].state).toBe('empty');
        const after = inside.map(({ x, z }) => report.read(x, z));
        expect(after).toEqual(before);
    });
});

describe('build order', () => {
    test('every section of the fixture is the same built forward, backward and by gate windows', () => {
        const game = courseGame();
        const forward = build(game, 0).env;
        buildAll(forward);
        const backward = build(game, 0, { window: 149 }).env;
        quietly(() => [...backward.sections].reverse().forEach((section) => backward.buildSectionNow(section)));
        const gates = build(game, 0).env;
        quietly(() => {
            gates.sections.forEach((section) => section.state !== 'empty' && gates.disposeSection(section));
            gates.checkpoints.forEach((gate) => gates.ensureWindow(gate.segmentIndex, { sync: true }));
        });
        const hashes = [forward, backward, gates].map((env) => env.sections.map(sectionHash));
        expect(hashes[0]).toHaveLength(6);
        expect(new Set(hashes[0]).size).toBe(6);
        expect(hashes[1]).toEqual(hashes[0]);
        expect(hashes[2]).toEqual(hashes[0]);
    });
});

describe('the drawn window', () => {
    test('a leg starts with its first window built and drawn, and builds the rest as the bike rides', () => {
        const game = courseGame();
        const { env } = build(game, 0);
        expect(env.sections.map((section) => section.state)).toEqual(['built', 'built', 'built', 'empty', 'empty', 'empty']);
        expect(env.visibleSections().map((section) => section.index)).toEqual([0, 1, 2]);
        // Riding: one frame a segment, 4 ms a frame
        let syncBefore = env.sectionStats.syncBuilds;
        let most = 0;
        quietly(() => {
            for (let segment = 0; segment < 150; segment++) {
                for (let frame = 0; frame < 20; frame++) env.update(segment, 4, null);
                most = Math.max(most, env.visibleSections().length);
            }
        });
        expect(env.sectionStats.syncBuilds - syncBefore).toBe(0);
        expect(most).toBe(4);
        expect(env.sectionStats.built).toBe(6);
        // No gate passed: nothing is disposed, and the window at the finish is the last two
        expect(env.visibleSections().map((section) => section.index)).toEqual([4, 5]);
    });

    test('a section the bike has left is disposed once it is behind the last passed gate', () => {
        const game = courseGame();
        const { env } = build(game, 0);
        quietly(() => {
            for (let segment = 0; segment < 150; segment++) {
                const gate = env.checkpoints.filter((g) => g.segmentIndex <= segment).pop();
                for (let frame = 0; frame < 20; frame++) env.update(segment, 4, gate ? gate.segmentIndex : null);
            }
        });
        expect(env.sectionStats.built).toBe(6);
        // At the finish: gate 148 is in section 5, the bike in 5, so every section below 4 is gone
        expect(env.sections.map((section) => section.state)).toEqual(['empty', 'empty', 'empty', 'empty', 'built', 'built']);
        expect(env.sectionStats.disposed).toBe(4);
    });

    test('the menu preview builds two sections only', () => {
        const game = courseGame();
        const { env } = build(game, 0, { window: 75, preview: true });
        expect(env.sections.filter((section) => section.state === 'built').map((section) => section.index)).toEqual([2, 3]);
    });

    test('collision lists hold the entries of built sections only', () => {
        const game = courseGame();
        const { env } = build(game, 0);
        const before = env.boulders.length;
        const own = env.sections[0].boulders.length;
        quietly(() => env.disposeSection(env.sections[0]));
        expect(env.boulders.length).toBe(before - own);
        expect(env.boulders.some((entry) => env.sections[0].boulders.includes(entry))).toBe(false);
    });
});
