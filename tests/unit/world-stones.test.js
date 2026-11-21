// The marker stones stand at sharp drops (Scenery.STONE_RULE). A world is ridden in node with the streamer, on the
// shipped stage and on the synthetic fixture world, and every stretch of drop the rule finds and every stone drawn is
// measured again by tests/helpers/world-stones.js: the drawn ground must fall more than dropM within reachM of the
// verge on the stone's side, nothing else may guard that edge (a retaining wall under it, a bridge, a tunnel, a solid
// edge), and no stone stands in a stopping place, a roadworks site or the mouth of a junction. A share of the
// stretches has its stones, the same on every load, and no stone floats.
// The yellow bend signs are not back: the map and the hairpin advice beside its turn prompt tell of a bend (WorldGuide).
import { describe, test, expect, beforeAll } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';
import { rideStones } from '../helpers/world-stones.js';

const game = loadGame();
const { Scenery } = game;
const rule = Scenery.STONE_RULE;
// The share of the stretches that may have stones: "sometimes used", not always and not rarely
const SHARE = [0.5, 0.7];
// A corner of a stone's foot may stand this far over the drawn ground under it (its lean, and the ground between two reads)
const FLOAT_M = 0.03;

const worlds = [
    ['the shipped stage', { id: 'tremola' }],
    ['the synthetic fixture world', { id: 'all', search: '?worldData=tests/fixtures/world/mini' }]
];

describe.each(worlds)('marker stones on %s', (name, world) => {
    let read, again;
    const near = (a, b) => Math.hypot(a.x - b.x, a.z - b.z) < 0.05;
    beforeAll(async () => {
        read = await rideStones(game, { ...world, fetchFn: diskFetch().fetchFn });
        // A second load, ridden in other steps, so the tiles arrive in another order
        again = await rideStones(game, { ...world, fetchFn: diskFetch().fetchFn, stepM: 170 });
    }, 600000);

    test('the world has stretches of sharp drop, and stones on some of them', () => {
        expect(read.stretches.length).toBeGreaterThan(10);
        expect(read.stones.length).toBeGreaterThan(40);
    });

    test('every place of every stretch is beside a sharp drop on its own side, with no wall, parapet, bridge or solid edge there, out of every stopping place, roadworks site and junction mouth', () => {
        const faults = read.stretches.flatMap(t => t.faults);
        if (faults.length) throw new Error(`${faults.length} places of the stones' stretches fail their own rule:\n${faults.slice(0, 30).join('\n')}`);
    });

    test('every stone drawn stands at a place of a stretch that has its stones', () => {
        const places = read.stretches.filter(t => t.used).flatMap(t => t.places);
        const stray = read.stones.filter(stone => !places.some(q => near(q, stone)));
        expect(stray.map(stone => `(${stone.x.toFixed(1)}, ${stone.z.toFixed(1)})`)).toEqual([]);
        // No stone of a stretch that the share left out
        const out = read.stretches.filter(t => !t.used).flatMap(t => t.places);
        expect(read.stones.filter(stone => out.some(q => near(q, stone)))).toEqual([]);
    });

    test('the measures can fail: the first stone of a stretch planted on the other side of the road has no drop there', () => {
        const failing = read.stretches.filter(t => t.mirror.length);
        expect(failing.length).toBeGreaterThan(read.stretches.length * (world.id === 'tremola' ? 0.9 : 0.3));
        expect(failing.some(t => t.mirror.some(f => /^drop/.test(f)))).toBe(true);
    });

    test('a stretch is a row: at least minM long, its stones STONE_GAP_M apart, inside one block of the ride', () => {
        const each = Math.round(rule.blockM / Scenery.STONE_GAP_M);
        for (const t of read.stretches) {
            expect((t.places.length - 1) * Scenery.STONE_GAP_M).toBeGreaterThanOrEqual(rule.minM);
            for (let i = 1; i < t.places.length; i++) expect(t.places[i].k - t.places[i - 1].k).toBe(1);
            expect(new Set(t.places.map(q => Math.floor(q.k / each)))).toEqual(new Set([t.block]));
        }
    });

    test('a seeded share of the stretches has its stones: within the band, and not the same choice on both sides of every block', () => {
        const used = read.stretches.filter(t => t.used).length;
        expect(used / read.stretches.length).toBeGreaterThanOrEqual(SHARE[0]);
        expect(used / read.stretches.length).toBeLessThanOrEqual(SHARE[1]);
        expect(rule.share).toBeGreaterThanOrEqual(SHARE[0]);
        expect(rule.share).toBeLessThanOrEqual(SHARE[1]);
        for (const t of read.stretches) expect(t.used).toBe(Scenery.stoneUsed(t.block, t.side));
    });

    test('the same stretches and the same choice on a second load ridden in other steps', () => {
        const sign = r => r.stretches.map(t => `${t.block}:${t.side}:${t.used}:${t.places.map(q => q.k).join(',')}`);
        expect(sign(again)).toEqual(sign(read));
    });

    test('no stone floats: no corner of its foot over the drawn ground, and its top out of the ground', () => {
        const off = read.stones.filter(stone => stone.y0 > stone.low + FLOAT_M || stone.y1 <= stone.middle);
        expect(off.map(stone => `(${stone.x.toFixed(1)}, ${stone.z.toFixed(1)}): foot ${stone.y0.toFixed(2)}, lowest ground ${stone.low.toFixed(2)}, ground at its middle ${stone.middle.toFixed(2)}`)).toEqual([]);
    });

    test('the stones of a window are within their cap, and their triangles within what the old rows could take', () => {
        expect(read.most).toBeLessThanOrEqual(Scenery.STONE_CAP);
        const each = Scenery.stonePart().geometry.attributes.position.count / 3;
        expect(each).toBe(18);
        // (120 stones of 24 triangles was the cap before)
        expect(Scenery.STONE_CAP * each).toBeLessThanOrEqual(120 * 24);
    });

    if (world.id === 'tremola') {
        test('on the shipped stage the cap leaves none out: every place of a stretch with stones has its stone, and the second ride drew the same stones', () => {
            const places = read.stretches.filter(t => t.used).flatMap(t => t.places);
            expect(places.filter(q => !read.stones.some(stone => near(q, stone))).map(q => q.k * Scenery.STONE_GAP_M)).toEqual([]);
            const sign = r => r.stones.map(stone => `${stone.x.toFixed(2)},${stone.z.toFixed(2)},${stone.y0.toFixed(3)}`).sort();
            expect(sign(again)).toEqual(sign(read));
            expect(read.most).toBeLessThan(Scenery.STONE_CAP);
        });
    }
});
