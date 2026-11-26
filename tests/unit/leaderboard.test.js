/**
 * Leaderboard Service Unit Tests
 * Tests for client-side leaderboard functionality
 */

import { jest } from '@jest/globals';
import { readFileSync } from 'fs';
import { webcrypto } from 'crypto';
import { TextEncoder } from 'util';

// js/leaderboard.js is a classic browser script (no exports); evaluate it and
// expose the class so the real implementation is under test.
const leaderboardSource = readFileSync(new URL('../../js/leaderboard.js', import.meta.url), 'utf8');
(0, eval)(`${leaderboardSource}\nglobalThis.LeaderboardService = LeaderboardService;`);

// jsdom does not provide crypto.subtle or TextEncoder; use Node's implementations
if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
}
if (!globalThis.TextEncoder) {
    globalThis.TextEncoder = TextEncoder;
}

describe('LeaderboardService', () => {
    let leaderboardService;
    let mockFunctions;

    beforeEach(() => {
        // Mock Firebase Functions
        mockFunctions = {
            httpsCallable: jest.fn((functionName) => {
                return jest.fn();
            })
        };

        leaderboardService = new LeaderboardService(mockFunctions);
    });

    describe('Device Fingerprinting', () => {
        test('should generate consistent device fingerprint', async () => {
            const fingerprint1 = await leaderboardService.generateDeviceFingerprint();
            const fingerprint2 = await leaderboardService.generateDeviceFingerprint();

            expect(fingerprint1).toBeDefined();
            expect(fingerprint2).toBeDefined();
            expect(fingerprint1).toBe(fingerprint2); // Should be cached
            expect(typeof fingerprint1).toBe('string');
            expect(fingerprint1.length).toBe(64); // SHA-256 hash in hex
        });

        test('should include browser characteristics', async () => {
            const fingerprint = await leaderboardService.generateDeviceFingerprint();

            // Fingerprint should be deterministic based on browser characteristics
            expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
        });
    });

    describe('HMAC Proof Generation', () => {
        test('should generate valid HMAC proof', async () => {
            leaderboardService.sessionToken = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
            leaderboardService.currentLegId = 'test-leg';

            const proof = await leaderboardService.generateProof(0, 1000, '');

            expect(proof).toBeDefined();
            expect(typeof proof).toBe('string');
            expect(proof.length).toBe(64); // SHA-256 HMAC in hex
            expect(proof).toMatch(/^[a-f0-9]{64}$/);
        });

        test('should generate different proofs for different inputs', async () => {
            leaderboardService.sessionToken = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
            leaderboardService.currentLegId = 'test-leg';

            const proof1 = await leaderboardService.generateProof(0, 1000, '');
            const proof2 = await leaderboardService.generateProof(0, 2000, '');
            const proof3 = await leaderboardService.generateProof(1, 1000, '');

            expect(proof1).not.toBe(proof2); // Different time
            expect(proof1).not.toBe(proof3); // Different checkpoint index
        });

        test('should chain proofs correctly', async () => {
            leaderboardService.sessionToken = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
            leaderboardService.currentLegId = 'test-leg';

            const proof1 = await leaderboardService.generateProof(0, 1000, '');
            const proof2 = await leaderboardService.generateProof(1, 2000, proof1);

            expect(proof1).toBeDefined();
            expect(proof2).toBeDefined();
            expect(proof1).not.toBe(proof2);
        });
    });

    describe('Start Run', () => {
        test('should start run successfully', async () => {
            const mockStartRun = jest.fn().mockResolvedValue({
                data: {
                    sessionId: 'test-session-123',
                    sessionToken: 'test-token-456'
                }
            });

            mockFunctions.httpsCallable = jest.fn(() => mockStartRun);
            leaderboardService = new LeaderboardService(mockFunctions);

            const result = await leaderboardService.startRun('mountain-dawn');

            expect(result).toBe(true);
            expect(leaderboardService.sessionId).toBe('test-session-123');
            expect(leaderboardService.sessionToken).toBe('test-token-456');
            expect(leaderboardService.currentLegId).toBe('mountain-dawn');
            expect(leaderboardService.checkpointTimes).toEqual([]);
            expect(leaderboardService.proofChain).toEqual([]);
        });

        test('should handle rate limit error', async () => {
            const mockStartRun = jest.fn().mockRejectedValue({
                code: 'resource-exhausted',
                message: 'Rate limit exceeded: 5 runs per hour'
            });

            mockFunctions.httpsCallable = jest.fn(() => mockStartRun);
            leaderboardService = new LeaderboardService(mockFunctions);

            const result = await leaderboardService.startRun('mountain-dawn');

            expect(result.error).toBe('rate-limited');
            expect(result.message).toContain('Rate limit exceeded');
        });

        test('should handle network error', async () => {
            const mockStartRun = jest.fn().mockRejectedValue(new Error('Network error'));

            mockFunctions.httpsCallable = jest.fn(() => mockStartRun);
            leaderboardService = new LeaderboardService(mockFunctions);

            const result = await leaderboardService.startRun('mountain-dawn');

            expect(result.error).toBe('failed');
            expect(result.message).toContain('Network error');
        });
    });

    describe('Record Checkpoint', () => {
        beforeEach(async () => {
            leaderboardService.sessionId = 'test-session';
            leaderboardService.sessionToken = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
            leaderboardService.currentLegId = 'test-leg';
        });

        test('should record checkpoint with proof', async () => {
            await leaderboardService.recordCheckpoint(0, 5000);

            expect(leaderboardService.checkpointTimes).toHaveLength(1);
            expect(leaderboardService.checkpointTimes[0]).toBe(5000);
            expect(leaderboardService.proofChain).toHaveLength(1);
            expect(leaderboardService.proofChain[0]).toMatch(/^[a-f0-9]{64}$/);
        });

        test('should record multiple checkpoints with chained proofs', async () => {
            await leaderboardService.recordCheckpoint(0, 5000);
            await leaderboardService.recordCheckpoint(1, 10000);
            await leaderboardService.recordCheckpoint(2, 15000);

            expect(leaderboardService.checkpointTimes).toEqual([5000, 10000, 15000]);
            expect(leaderboardService.proofChain).toHaveLength(3);

            // Each proof should be different
            expect(leaderboardService.proofChain[0]).not.toBe(leaderboardService.proofChain[1]);
            expect(leaderboardService.proofChain[1]).not.toBe(leaderboardService.proofChain[2]);
        });

        test('should not record if no active session', async () => {
            leaderboardService.sessionId = null;
            leaderboardService.sessionToken = null;

            await leaderboardService.recordCheckpoint(0, 5000);

            expect(leaderboardService.checkpointTimes).toHaveLength(0);
            expect(leaderboardService.proofChain).toHaveLength(0);
        });
    });

    describe('Submit Run', () => {
        beforeEach(() => {
            leaderboardService.sessionId = 'test-session';
            leaderboardService.sessionToken = 'test-token';
            leaderboardService.currentLegId = 'test-leg';
            leaderboardService.checkpointTimes = Array(5).fill(0).map((_, i) => (i + 1) * 1000);
            leaderboardService.proofChain = Array(5).fill('a'.repeat(64));
        });

        test('should submit run successfully', async () => {
            const mockSubmitRun = jest.fn().mockResolvedValue({
                data: {
                    entryId: 'entry-123',
                    rank: 5,
                    flagged: false
                }
            });

            mockFunctions.httpsCallable = jest.fn(() => mockSubmitRun);
            leaderboardService = new LeaderboardService(mockFunctions);
            leaderboardService.sessionId = 'test-session';
            leaderboardService.sessionToken = 'test-token';
            leaderboardService.checkpointTimes = Array(5).fill(0).map((_, i) => (i + 1) * 1000);
            leaderboardService.proofChain = Array(5).fill('a'.repeat(64));

            const result = await leaderboardService.submitRun('ALEX');

            expect(result.success).toBe(true);
            expect(result.rank).toBe(5);
            expect(result.flagged).toBe(false);

            // Session should be cleared
            expect(leaderboardService.sessionId).toBeNull();
            expect(leaderboardService.sessionToken).toBeNull();
            expect(leaderboardService.checkpointTimes).toEqual([]);
            expect(leaderboardService.proofChain).toEqual([]);
        });

        test('should reject invalid player name (too short)', async () => {
            const result = await leaderboardService.submitRun('ABC');

            expect(result.success).toBe(false);
            expect(result.error).toContain('4 characters');
        });

        test('should reject invalid player name (too long)', async () => {
            const result = await leaderboardService.submitRun('ABCDE');

            expect(result.success).toBe(false);
            expect(result.error).toContain('4 characters');
        });

        test('should reject incomplete run (not enough checkpoints)', async () => {
            leaderboardService.checkpointTimes = [1000, 2000]; // Only 2 checkpoints
            leaderboardService.proofChain = ['a'.repeat(64), 'b'.repeat(64)];

            const result = await leaderboardService.submitRun('ALEX');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Incomplete');
        });

        test('should reject if no active session', async () => {
            leaderboardService.sessionId = null;

            const result = await leaderboardService.submitRun('ALEX');

            expect(result.success).toBe(false);
            expect(result.error).toContain('No active session');
        });

        test('should convert name to uppercase', async () => {
            const mockSubmitRun = jest.fn().mockResolvedValue({
                data: { entryId: 'entry-123', rank: 1, flagged: false }
            });

            mockFunctions.httpsCallable = jest.fn(() => mockSubmitRun);
            leaderboardService = new LeaderboardService(mockFunctions);
            leaderboardService.sessionId = 'test-session';
            leaderboardService.sessionToken = 'test-token';
            leaderboardService.checkpointTimes = Array(5).fill(0).map((_, i) => (i + 1) * 1000);
            leaderboardService.proofChain = Array(5).fill('a'.repeat(64));

            await leaderboardService.submitRun('alex');

            expect(mockSubmitRun).toHaveBeenCalledWith(expect.objectContaining({
                playerName: 'ALEX'
            }));
        });
    });

    describe('Fetch Leaderboard', () => {
        test('should fetch leaderboard successfully', async () => {
            const mockGetLeaderboard = jest.fn().mockResolvedValue({
                data: {
                    entries: [
                        { rank: 1, playerName: 'ALEX', totalTime: 50000, flagged: false },
                        { rank: 2, playerName: 'JOHN', totalTime: 52000, flagged: false },
                        { rank: 3, playerName: 'JANE', totalTime: 55000, flagged: true }
                    ]
                }
            });

            mockFunctions.httpsCallable = jest.fn(() => mockGetLeaderboard);
            leaderboardService = new LeaderboardService(mockFunctions);

            const result = await leaderboardService.fetchLeaderboard('mountain-dawn', 10);

            expect(result.success).toBe(true);
            expect(result.entries).toHaveLength(3);
            expect(result.entries[0].playerName).toBe('ALEX');
            expect(result.entries[2].flagged).toBe(true);
        });

        test('should handle empty leaderboard', async () => {
            const mockGetLeaderboard = jest.fn().mockResolvedValue({
                data: { entries: [] }
            });

            mockFunctions.httpsCallable = jest.fn(() => mockGetLeaderboard);
            leaderboardService = new LeaderboardService(mockFunctions);

            const result = await leaderboardService.fetchLeaderboard('mountain-dawn');

            expect(result.success).toBe(true);
            expect(result.entries).toEqual([]);
        });
    });

    describe('Utility Functions', () => {
        test('should format time correctly', () => {
            expect(LeaderboardService.formatTime(65432)).toBe('1:05.432');
            expect(LeaderboardService.formatTime(5432)).toBe('0:05.432');
            expect(LeaderboardService.formatTime(125432)).toBe('2:05.432');
            expect(LeaderboardService.formatTime(999)).toBe('0:00.999');
        });

        test('should check if session is active', () => {
            leaderboardService.sessionId = 'test';
            leaderboardService.sessionToken = 'token';
            expect(leaderboardService.isActive()).toBe(true);

            leaderboardService.sessionId = null;
            expect(leaderboardService.isActive()).toBe(false);

            leaderboardService.sessionId = 'test';
            leaderboardService.sessionToken = null;
            expect(leaderboardService.isActive()).toBe(false);
        });

        test('should cancel session', () => {
            leaderboardService.sessionId = 'test';
            leaderboardService.sessionToken = 'token';
            leaderboardService.currentLegId = 'leg';
            leaderboardService.checkpointTimes = [1000, 2000];
            leaderboardService.proofChain = ['abc', 'def'];

            leaderboardService.cancelSession();

            expect(leaderboardService.sessionId).toBeNull();
            expect(leaderboardService.sessionToken).toBeNull();
            expect(leaderboardService.currentLegId).toBeNull();
            expect(leaderboardService.checkpointTimes).toEqual([]);
            expect(leaderboardService.proofChain).toEqual([]);
        });
    });

    // The server states its protocol and gate count when the session starts;
    // the client submits only when they match the leg it built
    describe('handshake and gate count', () => {
        const TOKEN = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
        const LONG = { protocol: 2, gates: 14 };

        function serviceWith(reply) {
            const calls = { startRun: [], submitRun: [] };
            const functions = {
                httpsCallable: name => async payload => {
                    calls[name].push(payload);
                    if (name === 'startRun') return { data: { sessionId: 's1', sessionToken: TOKEN, ...reply } };
                    return { data: { rank: 1, flagged: false, entryId: 'e1' } };
                }
            };
            const service = new LeaderboardService(functions);
            service.deviceFingerprint = 'f';
            return { service, calls };
        }

        async function ride(service, gates, { finish } = {}) {
            for (let i = 0; i < gates; i++) service.recordCheckpoint(i, (i + 1) * 20000);
            if (finish) service.recordFinish(finish);
            await service.recordQueue;
        }

        let errors;
        beforeEach(() => {
            errors = jest.spyOn(console, 'error').mockImplementation(() => {});
            jest.spyOn(console, 'log').mockImplementation(() => {});
            jest.spyOn(console, 'warn').mockImplementation(() => {});
        });
        afterEach(() => jest.restoreAllMocks());

        test('a converted leg on a server that states no gates: no session, no submit, no error', async () => {
            const { service, calls } = serviceWith({});
            const started = await service.startRun('mountain-dawn-v3', LONG);
            expect(started).toMatchObject({ error: 'not-submitted' });
            expect(service.unsupported).toBe(true);
            expect(service.isActive()).toBe(false);
            await ride(service, 14, { finish: 300000 });
            const result = await service.submitRun('ALEX');
            expect(result).toEqual({ success: false, state: 'not-submitted' });
            expect(calls.submitRun).toHaveLength(0);
            expect(errors).not.toHaveBeenCalled();
        });

        test('a server that states another gate count gets no submit', async () => {
            const { service, calls } = serviceWith({ protocol: 2, gates: 15 });
            await service.startRun('mountain-dawn-v3', LONG);
            expect(service.unsupported).toBe(true);
            expect(service.isActive()).toBe(false);
            expect((await service.submitRun('ALEX')).state).toBe('not-submitted');
            expect(calls.submitRun).toHaveLength(0);
        });

        test('a leg that builds 13 gates against a table of 14 gets no submit', async () => {
            const { service } = serviceWith({ protocol: 2, gates: 14 });
            await service.startRun('mountain-dawn-v3', { protocol: 2, gates: 13 });
            expect(service.unsupported).toBe(true);
            expect(service.isActive()).toBe(false);
        });

        test('a long leg on a server that answers protocol 1 with 5 gates gets no submit', async () => {
            const { service } = serviceWith({ protocol: 1, gates: 5 });
            await service.startRun('mountain-dawn-v3', LONG);
            expect(service.unsupported).toBe(true);
            expect(service.isActive()).toBe(false);
        });

        test('a leg on the shared course takes a reply with no protocol field and submits 5 and 5', async () => {
            const { service, calls } = serviceWith({});
            expect(await service.startRun('valley-run-v2')).toBe(true);
            expect(service.unsupported).toBe(false);
            expect(service.isActive()).toBe(true);
            await ride(service, 5);
            expect(await service.submitRun('ALEX')).toMatchObject({ success: true, state: 'submitted' });
            expect(calls.submitRun).toHaveLength(1);
            expect(calls.submitRun[0].checkpointTimes).toHaveLength(5);
            expect(calls.submitRun[0].proofChain).toHaveLength(5);
            expect(calls.submitRun[0].finishTime).toBeUndefined();
        });

        test('a new server on a leg of the shared course sending extra fields still matches', async () => {
            const { service } = serviceWith({ protocol: 1, gates: 5 });
            expect(await service.startRun('valley-run-v2', { protocol: 1, gates: 5 })).toBe(true);
        });

        test('a converted leg on a server that states the same gates sends 14 times, 14 proofs and the finish', async () => {
            const { service, calls } = serviceWith({ protocol: 2, gates: 14 });
            expect(await service.startRun('mountain-dawn-v3', LONG)).toBe(true);
            await ride(service, 14, { finish: 300000 });
            expect(await service.submitRun('ALEX')).toMatchObject({ success: true, state: 'submitted' });
            const [payload] = calls.submitRun;
            expect(payload.checkpointTimes).toHaveLength(14);
            expect(payload.proofChain).toHaveLength(14);
            expect(payload).toMatchObject({ finishTime: 300000, restarts: 0 });
            expect(payload.finishProof).toMatch(/^[a-f0-9]{64}$/);
        });

        test('the finish link chains on the last gate proof, even when recorded in the same tick', async () => {
            const { service } = serviceWith({ protocol: 2, gates: 3 });
            await service.startRun('mountain-dawn-v3', { protocol: 2, gates: 3 });
            service.recordCheckpoint(0, 20000);
            service.recordCheckpoint(1, 40000);
            service.recordCheckpoint(2, 60000);
            service.recordRestart();
            service.recordFinish(75000);
            await service.recordQueue;
            expect(service.finishProof).toBe(await service.sign(`mountain-dawn-v3:F:75000:1:${service.proofChain[2]}`));
        });

        test('a restart keeps the session and is counted', async () => {
            const { service } = serviceWith({ protocol: 2, gates: 3 });
            await service.startRun('mountain-dawn-v3', { protocol: 2, gates: 3 });
            service.recordRestart();
            service.recordRestart();
            expect(service.isActive()).toBe(true);
            expect(service.restarts).toBe(2);
        });

        test('a converted leg run without a finish is incomplete', async () => {
            const { service, calls } = serviceWith({ protocol: 2, gates: 3 });
            await service.startRun('mountain-dawn-v3', { protocol: 2, gates: 3 });
            await ride(service, 3);
            expect(await service.submitRun('ALEX')).toEqual({ success: false, error: 'Incomplete run' });
            expect(calls.submitRun).toHaveLength(0);
        });

        test('a later start clears the not-submitted state', async () => {
            const { service } = serviceWith({});
            await service.startRun('mountain-dawn-v3', LONG);
            expect(service.unsupported).toBe(true);
            await service.startRun('valley-run-v2');
            expect(service.unsupported).toBe(false);
            expect(service.isActive()).toBe(true);
        });
    });
});
