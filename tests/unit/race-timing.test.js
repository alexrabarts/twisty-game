/**
 * Race timing: split deltas, the finish headline and personal-best splits
 */

import { readFileSync } from 'fs';

// js/race.js is a classic browser script; evaluate it so the real code is under test
const source = readFileSync(new URL('../../js/race.js', import.meta.url), 'utf8');
(0, eval)(`${source}\nglobalThis.RaceTiming = RaceTiming;`);

function memoryStorage(initial = {}) {
    const data = { ...initial };
    return {
        data,
        getItem: key => (key in data ? data[key] : null),
        setItem: (key, value) => { data[key] = String(value); }
    };
}

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

    test('validSplits needs every gate, increasing and positive', () => {
        expect(RaceTiming.validSplits(PB)).toBe(true);
        expect(RaceTiming.validSplits(PB.slice(0, 4))).toBe(false);
        expect(RaceTiming.validSplits([10000, 9000, 33000, 44000, 56000])).toBe(false);
        expect(RaceTiming.validSplits([10000, undefined, 33000, 44000, 56000])).toBe(false);
        expect(RaceTiming.validSplits('nope')).toBe(false);
    });
});

describe('RaceTiming personal-best split storage', () => {
    const key = RaceTiming.splitsKey('mountain-dawn-v2');

    test('the key follows the board id, like the best time', () => {
        expect(key).toBe('motorcycleBestSplits_mountain-dawn-v2');
    });

    test('stores splits when a full run beats the best time', () => {
        const storage = memoryStorage();
        expect(RaceTiming.saveSplitsIfBest(storage, key, PB, true)).toBe(true);
        expect(RaceTiming.loadSplits(storage, key)).toEqual(PB);
    });

    test('never stores splits from a run that did not beat the best time', () => {
        const storage = memoryStorage({ [key]: JSON.stringify(PB) });
        const slower = PB.map(t => t + 500);
        expect(RaceTiming.saveSplitsIfBest(storage, key, slower, false)).toBe(false);
        expect(RaceTiming.loadSplits(storage, key)).toEqual(PB);
    });

    test('never stores an incomplete run, even a fast one', () => {
        const storage = memoryStorage();
        expect(RaceTiming.saveSplitsIfBest(storage, key, [1000, 2000], true)).toBe(false);
        expect(storage.data[key]).toBeUndefined();
    });

    test('corrupted or missing splits load as null', () => {
        expect(RaceTiming.loadSplits(memoryStorage(), key)).toBeNull();
        expect(RaceTiming.loadSplits(memoryStorage({ [key]: '{oops' }), key)).toBeNull();
        expect(RaceTiming.loadSplits(memoryStorage({ [key]: '[1,2]' }), key)).toBeNull();
    });
});

describe('RaceTiming record and finish', () => {
    test('the record is the fastest unflagged entry; checkpointTimes is optional', () => {
        const entries = [
            { rank: 1, playerName: 'CHT', totalTime: 1000, flagged: true },
            { rank: 2, playerName: 'ACE', totalTime: 50000, flagged: false },
            { rank: 3, playerName: 'BOB', totalTime: 52000, flagged: false, checkpointTimes: PB }
        ];
        expect(RaceTiming.pickRecord(entries)).toEqual({ playerName: 'ACE', totalTime: 50000, checkpointTimes: null });
        expect(RaceTiming.pickRecord([entries[2]]).checkpointTimes).toEqual(PB);
        expect(RaceTiming.pickRecord([])).toBeNull();
        expect(RaceTiming.pickRecord(undefined)).toBeNull();
    });

    test('finish headline: PB delta on the finish time, record delta on the board time', () => {
        const record = { playerName: 'ACE', totalTime: 50000, checkpointTimes: null };
        const f = RaceTiming.finish(61000, 62500, 52000, record);
        expect(f.pbDelta).toBe(-1500);
        expect(f.isBest).toBe(true);
        expect(f.recordDelta).toBe(2000);
    });

    test('a first run is a best with no PB delta; no record means no record delta', () => {
        const f = RaceTiming.finish(61000, NaN, 52000, null);
        expect(f.isBest).toBe(true);
        expect(f.pbDelta).toBeNull();
        expect(f.recordDelta).toBeNull();
    });
});
