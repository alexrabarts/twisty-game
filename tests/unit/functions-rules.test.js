// The leaderboard server rules, run against the real handlers on an in-memory
// database. Needs no Firebase and no functions/node_modules.
import { describe, test, expect, beforeEach } from '@jest/globals';
import { createRequire } from 'node:module';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { createHandlers } = require('../../functions/lib/handlers.js');
const boards = require('../../functions/lib/boards.js');
const { createMemoryDb } = require('../../functions/test/support/memory-db.js');

class HttpsError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}

const TABLE = { 'mountain-dawn-v3': { gates: 14, segments: 700 } };
const LONG_ID = 'mountain-dawn-v3';
const OLD_ID = 'mountain-dawn-v2';
const T0 = 1_700_000_000_000;

let clock;
let db;
let handlers;

beforeEach(() => {
    clock = T0;
    db = createMemoryDb();
    handlers = createHandlers({
        db,
        now: () => clock,
        randomBytes: n => Buffer.alloc(n, 7),
        HttpsError,
        table: TABLE
    });
});

const sign = (token, data) => createHmac('sha256', token).update(data).digest('hex');

// What the client's proof chain computes, for a list of cumulative gate times
function signedRun(legId, token, times, finish) {
    const proofs = [];
    let previous = '';
    times.forEach((time, i) => {
        previous = sign(token, `${legId}:${i}:${time}:${previous}`);
        proofs.push(previous);
    });
    const run = { checkpointTimes: times, proofChain: proofs };
    if (finish) {
        const { finishTime, restarts } = finish;
        run.finishTime = finishTime;
        run.restarts = restarts;
        run.finishProof = sign(token, `${legId}:F:${finishTime}:${restarts}:${previous}`);
    }
    return run;
}

async function start(legId, fingerprint = 'device') {
    return handlers.startRun({ legId, deviceFingerprint: fingerprint });
}

// An honest 14-gate run on the 14 km board: 14 gaps of 20 s, finish after 300 s
const evenGates = (n, gap) => Array.from({ length: n }, (_, i) => (i + 1) * gap);

async function submitLong(overrides = {}, finish = { finishTime: 300000, restarts: 0 }, times = evenGates(14, 20000)) {
    const reply = await start(LONG_ID);
    const run = signedRun(LONG_ID, reply.sessionToken, times, finish);
    return handlers.submitRun({ sessionId: reply.sessionId, playerName: 'TEST', ...run, ...overrides });
}

const rejects = (promise, code, text) => expect(promise).rejects.toMatchObject({ code, message: expect.stringContaining(text) });

describe('the handlers module', () => {
    test('functions/index.js exports exactly the four functions, with the schedule it had', () => {
        const stubs = {
            'firebase-functions': {
                https: { HttpsError, onCall: fn => ({ trigger: 'onCall', fn }) },
                pubsub: { schedule: expression => ({ onRun: fn => ({ trigger: 'schedule', expression, fn }) }) }
            },
            'firebase-admin': { initializeApp() {}, database: () => createMemoryDb() },
            './lib/handlers': { createHandlers }
        };
        // Evaluated with a require of its own: jest's module system would look for the real Firebase packages
        const source = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
        const exported = {};
        new Function('require', 'exports', source)(name => stubs[name], exported);
        expect(Object.keys(exported).sort()).toEqual(['cleanupExpiredSessions', 'getLeaderboard', 'startRun', 'submitRun']);
        expect(exported.startRun.trigger).toBe('onCall');
        expect(exported.submitRun.trigger).toBe('onCall');
        expect(exported.getLeaderboard.trigger).toBe('onCall');
        expect(exported.cleanupExpiredSessions).toMatchObject({ trigger: 'schedule', expression: 'every 1 hours' });
    });
});

describe('legacy: boards that are not in the table', () => {
    async function submitLegacy(times, overrides = {}) {
        const reply = await start(OLD_ID);
        const run = signedRun(OLD_ID, reply.sessionToken, times);
        return handlers.submitRun({ sessionId: reply.sessionId, playerName: 'ALEX', ...run, ...overrides });
    }

    test('startRun keeps its reply and its 15 minute session', async () => {
        const reply = await start(OLD_ID);
        expect(Object.keys(reply).sort()).toEqual(['nameMax', 'sessionId', 'sessionToken']);
        const [session] = Object.values(db.read('sessions'));
        expect(session.expiresAt - session.startTime).toBe(900000);
        expect(session.gates).toBeUndefined();
    });

    test('5 times are accepted and the last gate time is the board time', async () => {
        const result = await submitLegacy([20000, 40000, 60000, 80000, 100000]);
        expect(result).toMatchObject({ rank: 1, flagged: false });
        const [entry] = Object.values(db.read(`leaderboards/${OLD_ID}`));
        expect(entry).toMatchObject({ totalTime: 100000, validated: true });
        expect(entry.restarts).toBeUndefined();
        expect(db.read(`courseBoards/${OLD_ID}`)).toBeNull();
    });

    test('limits are today\'s: 2 s floor, 5 min cap, exactly 5 times', async () => {
        await rejects(submitLegacy([1999, 3000, 4000, 5000, 6000]), 'invalid-argument', 'too fast');
        await rejects(submitLegacy([20000, 40000, 60000, 80000, 300001]), 'invalid-argument', 'too slow');
        await rejects(submitLegacy([20000, 40000, 60000, 80000, 100000, 120000]), 'invalid-argument', 'Must have exactly 5 checkpoint times');
        await rejects(submitLegacy([20000, 40000, 60000, 80000, 80000]), 'invalid-argument', 'monotonically');
    });

    test('a wrong proof is refused', async () => {
        const times = [20000, 40000, 60000, 80000, 100000];
        const reply = await start(OLD_ID);
        const run = signedRun(OLD_ID, reply.sessionToken, times);
        run.proofChain[2] = 'f'.repeat(64);
        await rejects(handlers.submitRun({ sessionId: reply.sessionId, playerName: 'ALEX', ...run }), 'permission-denied', 'checkpoint 2');
    });
});

describe('gate count', () => {
    test('a table board states its protocol and gate count at the start', async () => {
        const reply = await start(LONG_ID);
        expect(reply).toMatchObject({ protocol: 2, gates: 14 });
        expect(reply.sessionToken).toHaveLength(64);
    });

    test('14 times on the 14-gate board are accepted; 5 times are not', async () => {
        const result = await submitLong();
        expect(result.rank).toBe(1);
        const [entry] = Object.values(db.read(`courseBoards/${LONG_ID}`));
        expect(entry.checkpointTimes).toHaveLength(14);

        const reply = await start(LONG_ID);
        const short = signedRun(LONG_ID, reply.sessionToken, evenGates(5, 20000), { finishTime: 300000, restarts: 0 });
        await rejects(
            handlers.submitRun({ sessionId: reply.sessionId, playerName: 'TEST', ...short }),
            'invalid-argument',
            'Must have exactly 14 checkpoint times'
        );
    });

    test('a board that is not in the table still takes 5', async () => {
        const reply = await start('high-pass-v2');
        const run = signedRun('high-pass-v2', reply.sessionToken, [10000, 20000, 30000, 40000, 50000]);
        await handlers.submitRun({ sessionId: reply.sessionId, playerName: 'ALEX', ...run });
        const [entry] = Object.values(db.read('leaderboards/high-pass-v2'));
        expect(entry.totalTime).toBe(50000);
    });
});

describe('player names', () => {
    const submitNamed = name => submitLong({ playerName: name });
    const storedNames = () => Object.values(db.read(`courseBoards/${LONG_ID}`) || {}).map(e => e.playerName);

    test('startRun states nameMax for a table board and for a legacy board', async () => {
        expect((await start(LONG_ID)).nameMax).toBe(5);
        expect((await start(OLD_ID)).nameMax).toBe(5);
    });

    test.each([['A', 'A'], ['ALEX', 'ALEX'], ['alexr', 'ALEXR'], [' al ', 'AL']])('name %j is accepted and stored as %j', async (name, stored) => {
        await submitNamed(name);
        expect(storedNames()).toEqual([stored]);
    });

    test.each([[''], ['   '], ['ABCDEF'], [' ABCDEF '], [42], [null], ['ßßßßß'], ['\u200b'], ['\u202eABC'], ['A\u0007']])('name %j is rejected with invalid-argument', async name => {
        await rejects(submitNamed(name), 'invalid-argument', 'Player name');
        expect(storedNames()).toEqual([]);
    });

    test('a name is counted after Unicode normalisation', async () => {
        // 'E' + combining acute is 2 code units; NFC makes it 1, so 5 of them fit
        await submitNamed('E\u0301E\u0301E\u0301E\u0301E\u0301');
        expect(storedNames()).toEqual(['\u00c9\u00c9\u00c9\u00c9\u00c9']);
    });
});

describe('limits', () => {
    test('the floor of the 14 km board is 170151 ms, and a restart raises it by 5 s each', async () => {
        expect(boards.ruleFor(LONG_ID, TABLE).minTotalMs).toBe(170151);
        // 14 gaps of 12.1 s keep every gap above its own floor
        const fast = evenGates(14, 12000);
        await rejects(submitLong({}, { finishTime: 170150, restarts: 0 }, fast), 'invalid-argument', 'Finish too fast');
        await submitLong({}, { finishTime: 170151, restarts: 0 }, fast);
        await rejects(submitLong({}, { finishTime: 180150, restarts: 2 }, fast), 'invalid-argument', 'Finish too fast');
        await submitLong({}, { finishTime: 180151, restarts: 2 }, fast);
    });

    test('a leg of 10 minutes is inside the limits, with 9 minutes at gate 12', async () => {
        const times = evenGates(14, 20000);
        times[11] = 9 * 60 * 1000 - 20000;
        times[12] = 9 * 60 * 1000;
        times[13] = 9 * 60 * 1000 + 20000;
        const result = await submitLong({}, { finishTime: 10 * 60 * 1000, restarts: 0 }, times);
        expect(result.rank).toBe(1);
    });

    test('a gap between gates is 6000 to 480000 ms', async () => {
        const slow = evenGates(14, 20000);
        for (let i = 3; i < 14; i++) slow[i] += 460001; // gap of 480001 at gate 3
        await rejects(submitLong({}, { finishTime: 2000000, restarts: 0 }, slow), 'invalid-argument', 'too slow');
        const tight = evenGates(14, 20000);
        for (let i = 3; i < 14; i++) tight[i] -= 14001; // gap of 5999 at gate 3
        await rejects(submitLong({}, { finishTime: 300000, restarts: 0 }, tight), 'invalid-argument', 'too fast');
    });

    test('the finish is after the last gate and under 40 minutes', async () => {
        await rejects(submitLong({}, { finishTime: 280000, restarts: 0 }), 'invalid-argument', 'after the last checkpoint');
        const times = evenGates(14, 170000);
        await rejects(submitLong({}, { finishTime: 2400001, restarts: 0 }, times), 'invalid-argument', 'too slow');
    });

    test('restarts are a whole number from 0 to 99', async () => {
        await rejects(submitLong({}, { finishTime: 1000000, restarts: 100 }, evenGates(14, 60000)), 'invalid-argument', 'Restarts');
        await rejects(submitLong({}, { finishTime: 1000000, restarts: 1.5 }, evenGates(14, 60000)), 'invalid-argument', 'Restarts');
        await submitLong({}, { finishTime: 1000000, restarts: 99 }, evenGates(14, 60000));
    });

    test('a long board session lasts 45 minutes', async () => {
        await start(LONG_ID);
        const [session] = Object.values(db.read('sessions'));
        expect(session.expiresAt - session.startTime).toBe(2700000);
    });

    test('an expired session is refused and removed', async () => {
        const reply = await start(LONG_ID);
        clock += 2700001;
        await rejects(handlers.submitRun({ sessionId: reply.sessionId, playerName: 'TEST' }), 'deadline-exceeded', 'expired');
        expect(db.read(`sessions/${reply.sessionId}`)).toBeNull();
    });
});

describe('the finish proof', () => {
    test('the finish time and the restart count are signed', async () => {
        const reply = await start(LONG_ID);
        const run = signedRun(LONG_ID, reply.sessionToken, evenGates(14, 20000), { finishTime: 300000, restarts: 1 });
        await rejects(handlers.submitRun({ sessionId: reply.sessionId, playerName: 'TEST', ...run, restarts: 0 }), 'permission-denied', 'finish proof');
        await rejects(handlers.submitRun({ sessionId: reply.sessionId, playerName: 'TEST', ...run, finishTime: 299000 }), 'permission-denied', 'finish proof');
        const other = signedRun(LONG_ID, 'another-token', evenGates(14, 20000), { finishTime: 300000, restarts: 1 });
        await rejects(
            handlers.submitRun({ sessionId: reply.sessionId, playerName: 'TEST', ...run, finishProof: other.finishProof }),
            'permission-denied',
            'finish proof'
        );
    });

    test('a restarted run is stored with its count and the finish time as its board time', async () => {
        const reply = await start(LONG_ID);
        const run = signedRun(LONG_ID, reply.sessionToken, evenGates(14, 25000), { finishTime: 400000, restarts: 1 });
        await handlers.submitRun({ sessionId: reply.sessionId, playerName: 'TEST', ...run });
        const [entry] = Object.values(db.read(`courseBoards/${LONG_ID}`));
        expect(entry).toMatchObject({ protocol: 2, totalTime: 400000, finishTime: 400000, restarts: 1, validated: true });
        const board = await handlers.getLeaderboard({ legId: LONG_ID });
        expect(board.entries[0]).toMatchObject({ rank: 1, totalTime: 400000, restarts: 1 });
    });

    test('a run without the finish fields is refused on a table board', async () => {
        const reply = await start(LONG_ID);
        const run = signedRun(LONG_ID, reply.sessionToken, evenGates(14, 20000));
        await rejects(handlers.submitRun({ sessionId: reply.sessionId, playerName: 'TEST', ...run }), 'invalid-argument', 'finish');
    });
});

describe('the store of a table board', () => {
    const fake = (time, count) => ({
        playerName: 'FAKE',
        totalTime: time,
        checkpointTimes: evenGates(count, time / count),
        validated: true
    });

    test('an entry under leaderboards/<table id> never shows on the board', async () => {
        db.ref(`leaderboards/${LONG_ID}/x`).set(fake(10000, 5));
        expect((await handlers.getLeaderboard({ legId: LONG_ID })).entries).toEqual([]);

        db.ref(`courseBoards/${LONG_ID}/y`).set({ ...fake(240000, 14), playerName: 'REAL' });
        const { entries } = await handlers.getLeaderboard({ legId: LONG_ID });
        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({ rank: 1, totalTime: 240000, playerName: 'REAL' });
    });

    test('ten forged entries do not push the real one out of limitToFirst', async () => {
        for (let i = 0; i < 10; i++) db.ref(`leaderboards/${LONG_ID}/f${i}`).set(fake(10000 + i, 5));
        db.ref(`courseBoards/${LONG_ID}/y`).set(fake(240000, 14));
        const { entries } = await handlers.getLeaderboard({ legId: LONG_ID, limit: 10 });
        expect(entries.map(e => e.totalTime)).toEqual([240000]);
    });

    test('a run is written under courseBoards and ranked against it alone', async () => {
        db.ref(`leaderboards/${LONG_ID}/x`).set(fake(10000, 5));
        const result = await submitLong();
        expect(result.rank).toBe(1);
        expect(Object.keys(db.read(`courseBoards/${LONG_ID}`))).toHaveLength(1);
        expect(Object.keys(db.read(`leaderboards/${LONG_ID}`))).toEqual(['x']);
    });

    test('a board that is not in the table reads leaderboards as today', async () => {
        db.ref(`leaderboards/${OLD_ID}/z`).set(fake(50000, 5));
        const { entries } = await handlers.getLeaderboard({ legId: OLD_ID });
        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({ totalTime: 50000, restarts: 0 });
    });

    test('the anomaly check reads the table board only', async () => {
        for (let i = 0; i < 12; i++) db.ref(`leaderboards/${LONG_ID}/f${i}`).set(fake(1000, 5));
        const result = await submitLong();
        expect(result.flagged).toBe(false);
    });
});

describe('the rate limit and the cleanup', () => {
    test('a device is limited to 500 runs an hour', async () => {
        for (let i = 0; i < 500; i++) db.ref(`sessions/s${i}`).set({ deviceFingerprint: 'busy', startTime: clock - 1000 });
        await rejects(start(OLD_ID, 'busy'), 'resource-exhausted', 'per hour');
    });

    test('cleanupExpiredSessions removes expired sessions only', async () => {
        db.ref('sessions/old').set({ expiresAt: clock - 1 });
        db.ref('sessions/live').set({ expiresAt: clock + 1 });
        await handlers.cleanupExpiredSessions();
        expect(Object.keys(db.read('sessions'))).toEqual(['live']);
    });
});
