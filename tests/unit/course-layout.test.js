// The course gets sharper toward the end of the tour (legs 6 to 8) without
// moving anything high-pass draws, and every set piece stays on a straight.
import { describe, test, expect, beforeAll } from '@jest/globals';
import { loadGame, buildEnvironment, legs } from '../helpers/load-game.js';

describe('the course layout', () => {
    let game;
    let path;
    let backdrop;
    let table;
    // Heading change from segment i to i + 1: the turn rate of segment i
    const rate = i => path[i + 1].heading - path[i].heading;
    const sharpest = (from, to) => {
        let most = 0;
        for (let i = from; i < to; i++) most = Math.max(most, Math.abs(rate(i)));
        return most;
    };

    beforeAll(() => {
        game = loadGame();
        const { env } = buildEnvironment(game, 7);
        path = env.roadPath;
        backdrop = env.backdropPath;
        table = legs(game);
    });

    test('high-pass draws to segment 433, and up to there the road is the course as it was laid out', () => {
        // The course before legs 6 to 8 were sharpened is the backdrop path; its
        // x, z and heading are the road's exactly through high-pass's last drawn segment
        expect(path).toHaveLength(744);
        expect(backdrop).toHaveLength(744);
        for (let i = 0; i <= 434; i++) {
            expect(path[i].x).toBe(backdrop[i].x);
            expect(path[i].z).toBe(backdrop[i].z);
            expect(path[i].heading).toBe(backdrop[i].heading);
        }
        // And past it the two part: the late legs are a new layout
        expect(path[703].x).not.toBe(backdrop[703].x);
    });

    test('legs 6 to 8 each turn more sharply than the one before, and more sharply than before they were sharpened', () => {
        const before = i => backdrop[i + 1].heading - backdrop[i].heading;
        const sharpestBefore = (from, to) => {
            let most = 0;
            for (let i = from; i < to; i++) most = Math.max(most, Math.abs(before(i)));
            return most;
        };
        const late = [5, 6, 7].map(n => table[n]);
        const now = late.map(leg => sharpest(leg.startSegment, leg.endSegment));
        expect(now[0]).toBeLessThan(now[1]);
        expect(now[1]).toBeLessThan(now[2]);
        late.forEach((leg, n) => expect(now[n]).toBeGreaterThan(sharpestBefore(leg.startSegment, leg.endSegment) * 1.2));
        // Below the hairpin rate (0.1), so no leg but high-pass builds hairpin warnings and barriers
        expect(now[2]).toBeLessThan(0.1);
        // Every bend keeps its angle: each leg ends heading where it did
        late.forEach(leg => expect(path[leg.endSegment + 1].heading).toBeCloseTo(backdrop[leg.endSegment + 1].heading, 9));
    });

    test('every set piece lies on a straight, a segment clear of each bend, and no checkpoint is in one', () => {
        [3, 6].forEach(index => {
            const { env } = buildEnvironment(game, index);
            expect(env.setPieces.length).toBeGreaterThan(0);
            env.setPieces.forEach(piece => {
                for (let i = piece.from - 1; i <= piece.to; i++) expect(Math.abs(rate(i))).toBeLessThan(1e-12);
                env.checkpoints.forEach(cp => expect(cp.segmentIndex < piece.from || cp.segmentIndex > piece.to).toBe(true));
            });
        });
    });

    test('no sharpened leg draws a row past half the tightest bend of its drawn road', () => {
        // (High-pass's cliff rows reach past half its hairpins: it is frozen as it is)
        [5, 6, 7].forEach(index => {
            const leg = table[index];
            const { Terrain } = game;
            const profile = Terrain.forLeg(index);
            const halfRoad = Terrain.legConfig(index).roadWidth / 2;
            const last = Math.min(743, leg.endSegment + 20);
            const radius = 20 / sharpest(leg.startSegment, last);
            const sides = [profile.left, profile.right, ...(profile.spans || []).flatMap(span => [span.left, span.right])].filter(Boolean);
            const ctx = { halfRoad, roadY: 30, column: 0, index: 7, s: 7, pathLength: 744 };
            sides.forEach(side => expect(Terrain.outermost(side, ctx)).toBeLessThanOrEqual(radius / 2));
        });
    });
});
