/**
 * Leaderboard flow: the real client (js/leaderboard.js, WebCrypto proofs)
 * against the real handlers (functions/lib/handlers.js) on an in-memory
 * database. No Firebase, no emulator and no functions/node_modules.
 */
import { describe, test, expect, beforeAll, beforeEach, afterEach, jest } from '@jest/globals';
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { webcrypto, createHash } from 'crypto';
import { TextEncoder } from 'util';

const require = createRequire(import.meta.url);
const { createHandlers } = require('../../functions/lib/handlers.js');
const { createMemoryDb } = require('../../functions/test/support/memory-db.js');

(0, eval)(`${readFileSync(new URL('../../js/leaderboard.js', import.meta.url), 'utf8')}\nglobalThis.LeaderboardService = LeaderboardService;\nglobalThis.RunSession = RunSession;`);
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

    test('a 5-character name goes through the real client and handlers, and a 4-character row stays', async () => {
        const old = newService();
        await old.startRun(OLD_ID);
        for (let i = 0; i < 5; i++) old.recordCheckpoint(i, (i + 1) * 30000);
        await old.submitRun('CCCC');

        const service = newService();
        await service.startRun(LONG_ID, { protocol: 2, gates: 14 });
        expect(service.nameRule()).toEqual({ min: 1, max: 5 });
        for (let i = 0; i < 14; i++) service.recordCheckpoint(i, (i + 1) * 20000);
        service.recordFinish(300000);
        await service.recordQueue;
        expect(await service.submitRun('alexr')).toMatchObject({ success: true, rank: 1 });

        expect(submitted.at(-1).playerName).toBe('ALEXR');
        expect((await newService().fetchLeaderboard(LONG_ID, 10)).entries.map(e => e.playerName)).toEqual(['ALEXR']);
        expect((await newService().fetchLeaderboard(OLD_ID, 10)).entries.map(e => e.playerName)).toEqual(['CCCC']);
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

    describe('RunSession', () => {
        // sha256 of the submitRun payload the a9e8add client sends for the run
        // in payloadFor(), measured before the session state moved into RunSession
        const A9E8ADD_PAYLOAD_SHA = '8f1cfc7a4abbe574d3cbd2fe33d48a229775147baf31344f55490d3cecec8c33';
        const TOKEN = '0123456789abcdef'.repeat(4);

        // A server stub with a fixed token; startRun answers after `gate` resolves
        function stubbed(sent, gate = Promise.resolve()) {
            const service = new LeaderboardService({
                httpsCallable: name => async payload => {
                    if (name === 'submitRun') {
                        sent.push(payload);
                        return { data: { rank: 1, flagged: false, entryId: 'e' } };
                    }
                    await gate;
                    return { data: { sessionId: 's1', sessionToken: TOKEN, protocol: 2, gates: 14 } };
                }
            });
            service.deviceFingerprint = 'device';
            return service;
        }

        async function payloadFor() {
            const sent = [];
            const service = stubbed(sent);
            await service.startRun(LONG_ID, { protocol: 2, gates: 14 });
            for (let i = 0; i < 14; i++) service.recordCheckpoint(i, (i + 1) * 20000 + (i >= 6 ? 5000 : 0));
            service.recordRestart();
            service.recordRestart();
            service.recordFinish(310000);
            await service.submitRun('ABCD');
            return sent[0];
        }

        const sha = payload => createHash('sha256').update(JSON.stringify(payload)).digest('hex');

        test('the leg payload is byte-identical to the one the a9e8add client sent', async () => {
            expect(sha(await payloadFor())).toBe(A9E8ADD_PAYLOAD_SHA);
        });

        test('a start reply that arrives after the gates loses none of them, and the payload is unchanged', async () => {
            const inOrder = await payloadFor();

            const sent = [];
            let reply;
            const service = stubbed(sent, new Promise(resolve => { reply = resolve; }));
            const started = service.startRun(LONG_ID, { protocol: 2, gates: 14 });
            await new Promise(resolve => setTimeout(resolve, 0));
            for (let i = 0; i < 14; i++) service.recordCheckpoint(i, (i + 1) * 20000 + (i >= 6 ? 5000 : 0));
            service.recordRestart();
            service.recordRestart();
            service.recordFinish(310000);
            expect(service.proofChain).toHaveLength(0);
            reply();
            expect(await started).toBe(true);
            await service.submitRun('ABCD');

            expect(JSON.stringify(sent[0])).toBe(JSON.stringify(inOrder));
        });

        test('the real handlers accept a late-signed chain', async () => {
            const service = newService();
            const late = service.openSession(LONG_ID, { protocol: 2, gates: 14 });
            for (let i = 0; i < 14; i++) late.recordCheckpoint(i, (i + 1) * 20000);
            late.recordFinish(300000);
            expect(await late.ready).toBe(true);
            expect(await late.submit('TEST')).toMatchObject({ success: true, rank: 1 });
        });

        test('a reply for a board that is not protocol 2 drops a finish recorded in flight', async () => {
            const service = newService();
            const session = service.openSession(OLD_ID, { protocol: 1, gates: 5 });
            for (let i = 0; i < 5; i++) session.recordCheckpoint(i, (i + 1) * 20000);
            session.recordFinish(100000);
            expect(await session.ready).toBe(true);
            expect(session.finishProof).toBeNull();
            expect(await session.submit('TEST')).toMatchObject({ success: true, rank: 1 });
        });

        test('two sessions run side by side without sharing state', async () => {
            const service = newService();
            const first = service.openSession(OLD_ID, { protocol: 1, gates: 5 });
            const second = service.openSession(LONG_ID, { protocol: 2, gates: 14 });
            await Promise.all([first.ready, second.ready]);
            for (let i = 0; i < 14; i++) {
                if (i < 5) first.recordCheckpoint(i, (i + 1) * 30000);
                second.recordCheckpoint(i, (i + 1) * 20000);
            }
            second.recordFinish(300000);
            expect(service.isActive()).toBe(false);
            expect(await first.submit('AAAA')).toMatchObject({ success: true });
            expect(await second.submit('BBBBB')).toMatchObject({ success: true });
            expect(Object.keys(db.read(`leaderboards/${OLD_ID}`))).toHaveLength(1);
            expect(Object.keys(db.read(`courseBoards/${LONG_ID}`))).toHaveLength(1);
        });

        test('a saved session picks up where it stopped', async () => {
            const service = newService();
            const session = service.openSession(LONG_ID, { protocol: 2, gates: 14 });
            await session.ready;
            for (let i = 0; i < 7; i++) session.recordCheckpoint(i, (i + 1) * 20000);
            await session.recordQueue;

            const restored = RunSession.fromJSON(JSON.parse(JSON.stringify(session)), functions, () => service.generateDeviceFingerprint());
            expect(restored.nameMax).toBe(5);
            for (let i = 7; i < 14; i++) restored.recordCheckpoint(i, (i + 1) * 20000);
            restored.recordFinish(300000);
            expect(await restored.submit('TEST')).toMatchObject({ success: true, rank: 1 });
        });

        test('the facade nameMax follows the default session, and a 3-letter name never reaches today\'s rule', async () => {
            const service = newService();
            expect(service.nameMax).toBeNull();
            await service.startRun(LONG_ID, { protocol: 2, gates: 14 });
            expect(service.nameMax).toBe(5);

            const legacy = new LeaderboardService({
                httpsCallable: name => async payload => {
                    submitted.push(payload);
                    return { data: name === 'startRun' ? { sessionId: 's', sessionToken: TOKEN } : { rank: 1 } };
                }
            });
            legacy.deviceFingerprint = 'device';
            await legacy.startRun(OLD_ID);
            expect(legacy.nameMax).toBeNull();
            for (let i = 0; i < 5; i++) legacy.recordCheckpoint(i, (i + 1) * 20000);
            submitted.length = 0;
            expect(await legacy.submitRun('ABC')).toMatchObject({ success: false, code: 'invalid-name' });
            expect(submitted).toHaveLength(0);
        });
    });
});
