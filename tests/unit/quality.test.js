/**
 * @jest-environment node
 */
// The quality ladder (js/quality.js): one table of graphics levels, stepped by the frame time. Held here:
//   - every level is a valid set of settings, and a lower level never has more of a setting than a higher one
//   - the full level is the game as it was drawn before the ladder; the levels over it add only effects (effectMs)
//   - under a slow frame-time trace the ladder steps down, and under a fast one it steps back up, slower than down
//   - a noisy trace round the budget never makes it go up and down in a loop; a hitch or a hold never counts
//   - a fixed level holds whatever the frame time, and a release goes on from it
//   - a phone-like device starts below the top; a desktop starts at the top
import { describe, test, expect } from '@jest/globals';
import { loadScript } from '../helpers/load-game.js';

const { Quality, QualityLadder } = new Function(`${loadScript('quality.js')}\nreturn { Quality, QualityLadder };`)();
const R = Quality.RULES;
const TOP = Quality.LEVELS.length - 1;

// Feeds `seconds` of frames of `frameMs(t)` (t in ms from the trace's start) to a ladder; returns the time it ended
function ride(ladder, from, seconds, frameMs, workMs = () => null) {
    let t = from;
    const end = from + seconds * 1000;
    while (t < end) {
        const ms = frameMs(t);
        t += ms;
        ladder.sample(ms, workMs(t), t);
    }
    return t;
}

// A seeded generator, so a noisy trace is the same every run
function seeded(seed) {
    let s = seed;
    return () => {
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

describe('the levels', () => {
    test('every level is a valid set of settings', () => {
        expect(Quality.LEVELS.length).toBeGreaterThanOrEqual(3);
        for (const level of Quality.LEVELS) expect(Quality.problems(level)).toEqual([]);
        expect(new Set(Quality.LEVELS.map(l => l.id)).size).toBe(Quality.LEVELS.length);
    });

    test('the check finds a bad level', () => {
        const bad = { ...Quality.LEVELS[TOP], shadowMap: 300, msaa: 3, bloom: 'yes', pixelRatio: 9, extra: 1 };
        expect(Quality.problems(bad).length).toBe(5);
    });

    test('a lower level never has more of a setting, and each step down gives something up', () => {
        const rank = value => (typeof value === 'boolean' ? Number(value) : value);
        for (let i = 1; i < Quality.LEVELS.length; i++) {
            const lower = Quality.LEVELS[i - 1], higher = Quality.LEVELS[i];
            let less = 0;
            for (const name of Object.keys(Quality.FIELDS)) {
                expect(rank(lower[name])).toBeLessThanOrEqual(rank(higher[name]));
                if (rank(lower[name]) < rank(higher[name])) less++;
            }
            expect(less).toBeGreaterThan(0);
        }
    });

    test('the full level is the game as drawn before the ladder, and the levels over it add only effects', () => {
        // Graphics.setupPost: 4 samples; Game.setupLighting: a 2048 map; Game.init: the pixel ratio capped at 2
        const full = Quality.index('full');
        const before = { pixelRatio: 2, shadowMap: 2048, msaa: 4, bloom: true, treeShare: 1 };
        expect(Quality.LEVELS[full]).toMatchObject(before);
        for (let i = full + 1; i <= TOP; i++) expect(Quality.LEVELS[i]).toMatchObject(before);
    });

    test('every start row names a level', () => {
        for (const row of Quality.START) expect(Quality.index(row.level)).toBeGreaterThanOrEqual(0);
    });
});

describe('the start level', () => {
    const phone = { touch: true, shortSide: 390, longSide: 844, dpr: 3, cores: 6, memory: null };
    const desktop = { touch: false, shortSide: 1080, longSide: 1920, dpr: 1, cores: 10, memory: 8 };

    test('a phone starts below the top, a small one lower still', () => {
        expect(Quality.startLevel(phone)).toBeLessThan(TOP);
        expect(Quality.startLevel({ ...phone, cores: 4 })).toBeLessThan(Quality.startLevel(phone));
        expect(Quality.startLevel({ ...phone, shortSide: 800 })).toBeLessThan(TOP);
    });

    test('a desktop starts at the top, a weak one below it', () => {
        expect(Quality.startLevel(desktop)).toBe(TOP);
        expect(Quality.startLevel({ ...desktop, cores: 2 })).toBeLessThan(TOP);
    });

    test('the device is read from a window', () => {
        const win = { navigator: { maxTouchPoints: 5, hardwareConcurrency: 6 }, screen: { width: 390, height: 844 }, devicePixelRatio: 3, innerWidth: 390, innerHeight: 844 };
        expect(Quality.device(win)).toEqual({ touch: true, shortSide: 390, longSide: 844, dpr: 3, cores: 6, memory: null });
        expect(Quality.startLevel(Quality.device(win))).toBeLessThan(TOP);
        const mouse = { navigator: { maxTouchPoints: 0, hardwareConcurrency: 12 }, screen: { width: 2560, height: 1440 }, devicePixelRatio: 2, matchMedia: () => ({ matches: false }) };
        expect(Quality.startLevel(Quality.device(mouse))).toBe(TOP);
    });
});

describe('the stepping', () => {
    const make = (start = TOP) => {
        const applied = [];
        const ladder = new QualityLadder({ start, now: 0, apply: (level, index, reason) => applied.push({ index, reason }) });
        return { ladder, applied };
    };

    test('the start level is applied at once', () => {
        const { ladder, applied } = make(2);
        expect(ladder.level).toBe(2);
        expect(applied).toEqual([{ index: 2, reason: 'start' }]);
    });

    test('a slow trace steps down to the bottom, a level at a time, each after a grace', () => {
        const { ladder } = make();
        ride(ladder, 0, 60, () => 30);
        expect(ladder.level).toBe(0);
        const gaps = ladder.changes.slice(1).map((c, i) => c.at - ladder.changes[i].at);
        for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(R.changeGraceMs + R.downWindows * R.windowMs - 50);
        expect(ladder.changes.every(c => c.to === c.from - 1)).toBe(true);
    });

    test('the first step down comes within a few seconds', () => {
        const { ladder } = make();
        ride(ladder, 0, (R.changeGraceMs + (R.downWindows + 1) * R.windowMs) / 1000, () => 28);
        expect(ladder.level).toBe(TOP - 1);
    });

    test('a frame time at the budget holds the level, and a fast one with headroom steps back up', () => {
        const { ladder } = make();
        const t = ride(ladder, 0, 20, () => 30);
        const low = ladder.level;
        expect(low).toBeLessThan(TOP);
        // At the screen's rate with the work well under the budget
        ride(ladder, t, 120, () => 1000 / 60, () => 6);
        expect(ladder.level).toBe(TOP);
        // Up is slower than down: each step up waited its windows of headroom after the change before it
        const ups = ladder.changes.filter(c => c.to > c.from);
        expect(ups.length).toBe(TOP - Math.min(low, ...ladder.changes.map(c => c.to)));
        for (const up of ups) {
            const before = ladder.changes[ladder.changes.indexOf(up) - 1];
            expect(up.at - before.at).toBeGreaterThanOrEqual(R.changeGraceMs + R.upWindows * R.windowMs - 50);
        }
    });

    test('no headroom in the work, no step up', () => {
        const { ladder } = make();
        const t = ride(ladder, 0, 20, () => 30);
        expect(ladder.level).toBeLessThan(TOP);
        const before = ladder.changes.length;
        ride(ladder, t, 120, () => 1000 / 60, () => 15);
        expect(ladder.changes.slice(before).filter(c => c.to > c.from)).toEqual([]);
    });

    test('a noisy trace round the step-down line never goes up and down in a loop', () => {
        const random = seeded(7);
        const { ladder } = make();
        // Frames scattered round 16 to 24 ms with hitches: a phone at the edge of its budget for ten minutes
        ride(ladder, 0, 600, () => (random() < 0.02 ? 40 + random() * 40 : 16 + random() * 8), () => 8 + random() * 4);
        const flips = ladder.changes.filter((c, i) => i > 0 && Math.sign(c.to - c.from) !== Math.sign(ladder.changes[i - 1].to - ladder.changes[i - 1].from));
        expect(flips.length).toBeLessThanOrEqual(4);
        expect(ladder.changes.length).toBeLessThanOrEqual(8);
    });

    test('a level just too slow for the device is not tried again and again', () => {
        // The device holds 60 frames a second at level 1 and below, and 40 at level 2 and above
        const { ladder } = make(0);
        const frame = () => (ladder.level >= 2 ? 25 : 1000 / 60);
        ride(ladder, 0, 900, frame, () => 6);
        const toTwo = ladder.changes.filter(c => c.to === 2).length;
        // Tried once, then blocked for a minute, two, four, eight: four tries in fifteen minutes at the most
        expect(toTwo).toBeGreaterThan(0);
        expect(toTwo).toBeLessThanOrEqual(4);
        expect(ladder.level).toBeLessThanOrEqual(2);
    });

    test('a hitch (a tile load, a shader compile) never steps down', () => {
        const { ladder } = make();
        let k = 0;
        // A 16.7 ms ride with a 150 ms frame every two seconds
        ride(ladder, 0, 120, () => (k++ % 120 === 0 ? 150 : 1000 / 60), () => 6);
        expect(ladder.level).toBe(TOP);
    });

    test('a hold keeps the ladder still', () => {
        const { ladder } = make();
        let t = 0;
        for (let i = 0; i < 30; i++) {
            ladder.hold(t, 1000);
            t = ride(ladder, t, 0.9, () => 40);
        }
        expect(ladder.level).toBe(TOP);
    });

    test('a fixed level holds whatever the frame time, and a release goes on from it', () => {
        const { ladder, applied } = make();
        ladder.fix(1, 0);
        expect(ladder.level).toBe(1);
        expect(ladder.isFixed).toBe(true);
        expect(applied.at(-1)).toEqual({ index: 1, reason: 'fixed' });
        let t = ride(ladder, 0, 60, () => 40);
        expect(ladder.level).toBe(1);
        t = ride(ladder, t, 60, () => 1000 / 60, () => 5);
        expect(ladder.level).toBe(1);
        expect(ladder.release(t)).toBe(1);
        expect(ladder.isFixed).toBe(false);
        ride(ladder, t, 30, () => 40);
        expect(ladder.level).toBe(0);
        expect(() => ladder.fix(99)).toThrow();
        expect(ladder.fix('full')).toBe(Quality.index('full'));
    });

    test('the HUD text says the level and who chose it', () => {
        expect(Quality.describe(TOP, false)).toBe(`Q${TOP} ${Quality.LEVELS[TOP].label} (auto)`);
        expect(Quality.describe(0, true)).toBe(`Q0 ${Quality.LEVELS[0].label} (fixed)`);
    });
});
