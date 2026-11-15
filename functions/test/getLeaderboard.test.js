/**
 * getLeaderboard against an in-memory database: no Firebase project needed.
 * The client compares a rider's gate times with the record, so the public
 * entry must carry checkpointTimes and must not leak private fields.
 */

const stored = {
    a: { playerName: 'SLOW', totalTime: 60000, checkpointTimes: [12000, 24000, 36000, 48000, 60000], validated: true, flagged: false, deviceFingerprint: 'secret-a' },
    b: { playerName: 'FAST', totalTime: 50000, checkpointTimes: [10000, 20000, 30000, 40000, 50000], validated: true, flagged: false, deviceFingerprint: 'secret-b' },
    c: { playerName: 'OLD', totalTime: 55000, validated: true },
    d: { playerName: 'BAD', totalTime: 1000, checkpointTimes: [1, 2, 3, 4, 1000], validated: false }
};

jest.mock('firebase-admin', () => {
    const snapshot = value => ({ exists: () => value !== null, val: () => value });
    const query = {
        orderByChild: () => query,
        limitToFirst: () => query,
        once: async () => snapshot(globalThis.__leaderboardData)
    };
    return {
        initializeApp: jest.fn(),
        database: () => ({ ref: () => query })
    };
});

const test = require('firebase-functions-test')();
const { getLeaderboard } = require('../index');

afterAll(() => test.cleanup());

describe('getLeaderboard entries', () => {
    beforeEach(() => {
        globalThis.__leaderboardData = stored;
    });

    it('returns checkpointTimes with each validated entry, fastest first', async () => {
        const result = await test.wrap(getLeaderboard)({ legId: 'mountain-dawn', limit: 10 });
        expect(result.entries.map(e => e.playerName)).toEqual(['FAST', 'OLD', 'SLOW']);
        expect(result.entries[0]).toEqual({
            rank: 1,
            playerName: 'FAST',
            totalTime: 50000,
            checkpointTimes: [10000, 20000, 30000, 40000, 50000],
            flagged: false
        });
    });

    it('returns null checkpointTimes for an entry stored without them', async () => {
        const result = await test.wrap(getLeaderboard)({ legId: 'mountain-dawn', limit: 10 });
        expect(result.entries[1].checkpointTimes).toBeNull();
    });

    it('never exposes the device fingerprint', async () => {
        const result = await test.wrap(getLeaderboard)({ legId: 'mountain-dawn', limit: 10 });
        result.entries.forEach(e => expect(e).not.toHaveProperty('deviceFingerprint'));
    });

    it('returns no entries for an empty board', async () => {
        globalThis.__leaderboardData = null;
        const result = await test.wrap(getLeaderboard)({ legId: 'empty', limit: 10 });
        expect(result.entries).toEqual([]);
    });
});
