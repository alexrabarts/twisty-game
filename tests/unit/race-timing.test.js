/**
 * Race timing: the time and the split deltas
 */

import { readFileSync } from 'fs';

// js/race.js is a classic browser script; evaluate it so the real code is under test
const source = readFileSync(new URL('../../js/race.js', import.meta.url), 'utf8');
(0, eval)(`${source}\nglobalThis.RaceTiming = RaceTiming;`);

const PB = [10000, 21000, 33000, 44000, 56000];

describe('RaceTiming formatting', () => {
    test('formats race time as m:ss.cc', () => {
        expect(RaceTiming.formatTime(0)).toBe('0:00.00');
        expect(RaceTiming.formatTime(42315)).toBe('0:42.31');
        expect(RaceTiming.formatTime(83456)).toBe('1:23.45');
        expect(RaceTiming.formatTime(NaN)).toBe('-:--.--');
    });

    test('formats deltas with a sign, negative meaning ahead', () => {
        expect(RaceTiming.formatDelta(-425)).toBe('-0.42');
        expect(RaceTiming.formatDelta(1100)).toBe('+1.10');
        expect(RaceTiming.formatDelta(0)).toBe('+0.00');
        expect(RaceTiming.formatDelta(61500)).toBe('+1:01.50');
        expect(RaceTiming.formatDelta(null)).toBe('');
    });

    test('colours a delta by what is shown, not by sub-hundredth noise', () => {
        expect(RaceTiming.deltaClass(-10)).toBe('ahead');
        expect(RaceTiming.deltaClass(10)).toBe('behind');
        expect(RaceTiming.deltaClass(-9)).toBe('even');
        expect(RaceTiming.deltaClass(null)).toBe('none');
    });
});

describe('RaceTiming splits', () => {
    test('split compares elapsed time against the personal-best split', () => {
        const s = RaceTiming.split(1, 20500, PB, null);
        expect(s.pbDelta).toBe(-500);
        expect(s.recordDelta).toBeNull();
    });

    test('split compares against record splits only when the backend sent them', () => {
        const withSplits = { playerName: 'ACE', totalTime: 50000, checkpointTimes: [9000, 19000, 29000, 39000, 50000] };
        expect(RaceTiming.split(2, 30000, null, withSplits).recordDelta).toBe(1000);

        const totalOnly = { playerName: 'ACE', totalTime: 50000, checkpointTimes: null };
        expect(RaceTiming.split(2, 30000, null, totalOnly).recordDelta).toBeNull();
    });

    test('no personal-best splits yet gives no PB delta', () => {
        expect(RaceTiming.split(0, 9000, null, null).pbDelta).toBeNull();
    });
});
