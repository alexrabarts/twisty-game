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
            leaderboardService.checkpointTimes = Array(10).fill(0).map((_, i) => (i + 1) * 1000);
            leaderboardService.proofChain = Array(10).fill('a'.repeat(64));
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
            leaderboardService.checkpointTimes = Array(10).fill(0).map((_, i) => (i + 1) * 1000);
            leaderboardService.proofChain = Array(10).fill('a'.repeat(64));

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
            leaderboardService.checkpointTimes = Array(10).fill(0).map((_, i) => (i + 1) * 1000);
            leaderboardService.proofChain = Array(10).fill('a'.repeat(64));

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
});
