/**
 * Leaderboard flow: the real client (js/leaderboard.js, WebCrypto proofs)
 * against the real handlers (functions/lib/handlers.js) on an in-memory
 * database. No Firebase, no emulator and no functions/node_modules.
 */
import { describe, test, expect, beforeAll, beforeEach, afterEach, jest } from '@jest/globals';
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { webcrypto } from 'crypto';
import { TextEncoder } from 'util';

const require = createRequire(import.meta.url);
const { createHandlers } = require('../../functions/lib/handlers.js');
const { createMemoryDb } = require('../../functions/test/support/memory-db.js');

(0, eval)(`${readFileSync(new URL('../../js/leaderboard.js', import.meta.url), 'utf8')}\nglobalThis.LeaderboardService = LeaderboardService;`);
if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
if (!globalThis.TextEncoder) globalThis.TextEncoder = TextEncoder;

class HttpsError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}

const LONG_ID = 'mountain-dawn-v3';
const OLD_ID = 'valley-run-v2';
const TABLE = { [LONG_ID]: { gates: 14, segments: 700 } };

describe('Leaderboard flow', () => {
    let db;
    let handlers;
    let submitted;

    // The callables as the Firebase client sees them: { data } in, { data } out
    const functions = {
        httpsCallable: name => async payload => {
            if (name === 'submitRun') submitted.push(payload);
            return { data: await handlers[name](JSON.parse(JSON.stringify(payload))) };
        }
    };

    const newService = () => {
        const service = new LeaderboardService(functions);
        service.deviceFingerprint = 'device';
        return service;
    };

    beforeAll(() => {
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
    });
    beforeEach(() => {
        db = createMemoryDb();
        handlers = createHandlers({ db, HttpsError, table: TABLE });
        submitted = [];
    });
    afterEach(() => jest.restoreAllMocks());

    test('protocol 2: a run with a restart is accepted and ranks on the finish time', async () => {
        const service = newService();
        expect(await service.startRun(LONG_ID, { protocol: 2, gates: 14 })).toBe(true);
        for (let i = 0; i < 14; i++) service.recordCheckpoint(i, (i + 1) * 20000 + (i >= 6 ? 5000 : 0));
        service.recordRestart();
        // Recorded in the same tick as the last gate, before its proof resolves
        service.recordFinish(310000);

        const result = await service.submitRun('TEST');
        expect(result).toMatchObject({ success: true, state: 'submitted', rank: 1 });
        expect(service.isActive()).toBe(false);

        const [entry] = Object.values(db.read(`courseBoards/${LONG_ID}`));
        expect(entry).toMatchObject({ protocol: 2, totalTime: 310000, finishTime: 310000, restarts: 1, validated: true });
        expect(entry.checkpointTimes).toHaveLength(14);
        expect(db.read(`leaderboards/${LONG_ID}`)).toBeNull();

        const board = await newService().fetchLeaderboard(LONG_ID, 10);
        expect(board.entries[0]).toMatchObject({ playerName: 'TEST', totalTime: 310000, restarts: 1 });
    });

    test('protocol 2: a restart count changed after signing is refused', async () => {
        const service = newService();
        await service.startRun(LONG_ID, { protocol: 2, gates: 14 });
        for (let i = 0; i < 14; i++) service.recordCheckpoint(i, (i + 1) * 20000);
        service.recordRestart();
        service.recordFinish(300000);
        await service.recordQueue;
        service.restarts = 0;
        const result = await service.submitRun('TEST');
        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid finish proof');
    });

    test('protocol 2: a finish time changed after signing is refused', async () => {
        const service = newService();
        await service.startRun(LONG_ID, { protocol: 2, gates: 14 });
        for (let i = 0; i < 14; i++) service.recordCheckpoint(i, (i + 1) * 20000);
        service.recordFinish(300000);
        await service.recordQueue;
        service.finishTime = 290000;
        expect((await service.submitRun('TEST')).error).toContain('Invalid finish proof');
    });

    test('protocol 1: a leg on the shared course runs as before', async () => {
        const service = newService();
        expect(await service.startRun(OLD_ID)).toBe(true);
        for (let i = 0; i < 5; i++) service.recordCheckpoint(i, (i + 1) * 20000);
        const result = await service.submitRun('TEST');
        expect(result).toMatchObject({ success: true, rank: 1 });
        const [entry] = Object.values(db.read(`leaderboards/${OLD_ID}`));
        expect(entry).toMatchObject({ totalTime: 100000, validated: true });
        expect(entry.protocol).toBeUndefined();
    });

    test('a converted leg against a server without its row is not submitted, and no entry is made', async () => {
        handlers = createHandlers({ db, HttpsError, table: {} });
        const service = newService();
        await service.startRun(LONG_ID, { protocol: 2, gates: 14 });
        for (let i = 0; i < 14; i++) service.recordCheckpoint(i, (i + 1) * 20000);
        service.recordFinish(300000);
        await service.recordQueue;
        expect(await service.submitRun('TEST')).toEqual({ success: false, state: 'not-submitted' });
        expect(submitted).toHaveLength(0);
        expect(db.read(`courseBoards/${LONG_ID}`)).toBeNull();
        expect(db.read(`leaderboards/${LONG_ID}`)).toBeNull();
    });

    test('a tampered gate proof is refused', async () => {
        const service = newService();
        await service.startRun(OLD_ID);
        for (let i = 0; i < 5; i++) service.recordCheckpoint(i, (i + 1) * 20000);
        await service.recordQueue;
        service.checkpointTimes[0] = 3000;
        expect((await service.submitRun('TEST')).error).toContain('Invalid proof chain');
    });

    test('boards are kept apart and ranked within themselves', async () => {
        for (const [name, finish] of [['AAAA', 320000], ['BBBB', 300000]]) {
            const service = newService();
            await service.startRun(LONG_ID, { protocol: 2, gates: 14 });
            for (let i = 0; i < 14; i++) service.recordCheckpoint(i, (i + 1) * 20000);
            service.recordFinish(finish);
            await service.recordQueue;
            await service.submitRun(name);
        }
        const service = newService();
        await service.startRun(OLD_ID);
        for (let i = 0; i < 5; i++) service.recordCheckpoint(i, (i + 1) * 30000);
        await service.submitRun('CCCC');

        const long = await newService().fetchLeaderboard(LONG_ID, 10);
        expect(long.entries.map(e => [e.rank, e.playerName])).toEqual([[1, 'BBBB'], [2, 'AAAA']]);
        const old = await newService().fetchLeaderboard(OLD_ID, 10);
        expect(old.entries.map(e => e.playerName)).toEqual(['CCCC']);
    });
});
