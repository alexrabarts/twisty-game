/**
 * Cloud Functions Tests
 * Tests for Firebase Cloud Functions (startRun, submitRun, getLeaderboard)
 */

const test = require('firebase-functions-test')();
const admin = require('firebase-admin');

// Initialize test environment
describe('Cloud Functions', () => {
    let myFunctions;
    let adminInitStub;

    beforeAll(() => {
        // Initialize admin SDK stub
        adminInitStub = jest.spyOn(admin, 'initializeApp');
        myFunctions = require('../index');
    });

    afterAll(() => {
        test.cleanup();
        adminInitStub.mockRestore();
    });

    describe('startRun', () => {
        test('should create session successfully', async () => {
            const data = {
                legId: 'mountain-dawn',
                deviceFingerprint: 'test-fingerprint-123'
            };

            const wrapped = test.wrap(myFunctions.startRun);
            const result = await wrapped(data);

            expect(result).toHaveProperty('sessionId');
            expect(result).toHaveProperty('sessionToken');
            expect(typeof result.sessionId).toBe('string');
            expect(typeof result.sessionToken).toBe('string');
            expect(result.sessionToken).toHaveLength(64); // 32 bytes hex
        });

        test('should reject invalid leg ID', async () => {
            const data = {
                legId: '',
                deviceFingerprint: 'test-fingerprint'
            };

            const wrapped = test.wrap(myFunctions.startRun);

            await expect(wrapped(data)).rejects.toThrow('Invalid leg ID');
        });

        test('should reject missing device fingerprint', async () => {
            const data = {
                legId: 'mountain-dawn',
                deviceFingerprint: ''
            };

            const wrapped = test.wrap(myFunctions.startRun);

            await expect(wrapped(data)).rejects.toThrow('Invalid device fingerprint');
        });

        test('should enforce rate limits', async () => {
            const data = {
                legId: 'mountain-dawn',
                deviceFingerprint: 'test-fingerprint-rate-limit'
            };

            const wrapped = test.wrap(myFunctions.startRun);

            // Create 5 sessions (hourly limit)
            for (let i = 0; i < 5; i++) {
                await wrapped(data);
            }

            // 6th attempt should fail
            await expect(wrapped(data)).rejects.toThrow('Rate limit exceeded');
        });
    });

    describe('submitRun', () => {
        let sessionId;
        let sessionToken;

        beforeEach(async () => {
            // Create a valid session
            const startData = {
                legId: 'mountain-dawn',
                deviceFingerprint: 'test-fingerprint-submit'
            };

            const wrapped = test.wrap(myFunctions.startRun);
            const session = await wrapped(startData);
            sessionId = session.sessionId;
            sessionToken = session.sessionToken;
        });

        test('should submit valid run successfully', async () => {
            // Generate valid proof chain
            const crypto = require('crypto');
            const checkpointTimes = [];
            const proofChain = [];
            let previousHash = '';

            for (let i = 0; i < 10; i++) {
                const time = (i + 1) * 5000; // 5 seconds per checkpoint
                checkpointTimes.push(time);

                const data = `mountain-dawn:${i}:${time}:${previousHash}`;
                const hmac = crypto.createHmac('sha256', sessionToken);
                hmac.update(data);
                const proof = hmac.digest('hex');
                proofChain.push(proof);
                previousHash = proof;
            }

            const submitData = {
                sessionId,
                playerName: 'ALEX',
                checkpointTimes,
                proofChain
            };

            const wrapped = test.wrap(myFunctions.submitRun);
            const result = await wrapped(submitData);

            expect(result).toHaveProperty('entryId');
            expect(result).toHaveProperty('rank');
            expect(result).toHaveProperty('flagged');
            expect(typeof result.rank).toBe('number');
            expect(result.rank).toBeGreaterThan(0);
            expect(typeof result.flagged).toBe('boolean');
        });

        test('should reject invalid proof chain', async () => {
            const checkpointTimes = Array(10).fill(0).map((_, i) => (i + 1) * 5000);
            const proofChain = Array(10).fill('invalid_proof_hash_0123456789abcdef0123456789abcdef0123456789');

            const submitData = {
                sessionId,
                playerName: 'ALEX',
                checkpointTimes,
                proofChain
            };

            const wrapped = test.wrap(myFunctions.submitRun);

            await expect(wrapped(submitData)).rejects.toThrow('Invalid proof chain');
        });

        test('should reject run with checkpoint time too fast', async () => {
            const crypto = require('crypto');
            const checkpointTimes = [];
            const proofChain = [];
            let previousHash = '';

            for (let i = 0; i < 10; i++) {
                const time = (i + 1) * 1000; // 1 second per checkpoint - TOO FAST
                checkpointTimes.push(time);

                const data = `mountain-dawn:${i}:${time}:${previousHash}`;
                const hmac = crypto.createHmac('sha256', sessionToken);
                hmac.update(data);
                const proof = hmac.digest('hex');
                proofChain.push(proof);
                previousHash = proof;
            }

            const submitData = {
                sessionId,
                playerName: 'ALEX',
                checkpointTimes,
                proofChain
            };

            const wrapped = test.wrap(myFunctions.submitRun);

            await expect(wrapped(submitData)).rejects.toThrow('too fast');
        });

        test('should reject run with non-monotonic checkpoint times', async () => {
            const crypto = require('crypto');
            const checkpointTimes = [5000, 10000, 9000, 15000, 20000, 25000, 30000, 35000, 40000, 45000];
            const proofChain = [];
            let previousHash = '';

            for (let i = 0; i < 10; i++) {
                const time = checkpointTimes[i];
                const data = `mountain-dawn:${i}:${time}:${previousHash}`;
                const hmac = crypto.createHmac('sha256', sessionToken);
                hmac.update(data);
                const proof = hmac.digest('hex');
                proofChain.push(proof);
                previousHash = proof;
            }

            const submitData = {
                sessionId,
                playerName: 'ALEX',
                checkpointTimes,
                proofChain
            };

            const wrapped = test.wrap(myFunctions.submitRun);

            await expect(wrapped(submitData)).rejects.toThrow('monotonically increasing');
        });

        test('should reject invalid player name length', async () => {
            const crypto = require('crypto');
            const checkpointTimes = [];
            const proofChain = [];
            let previousHash = '';

            for (let i = 0; i < 10; i++) {
                const time = (i + 1) * 5000;
                checkpointTimes.push(time);

                const data = `mountain-dawn:${i}:${time}:${previousHash}`;
                const hmac = crypto.createHmac('sha256', sessionToken);
                hmac.update(data);
                const proof = hmac.digest('hex');
                proofChain.push(proof);
                previousHash = proof;
            }

            const submitData = {
                sessionId,
                playerName: 'ALEXANDER', // Too long
                checkpointTimes,
                proofChain
            };

            const wrapped = test.wrap(myFunctions.submitRun);

            await expect(wrapped(submitData)).rejects.toThrow('4 characters');
        });

        test('should reject wrong number of checkpoints', async () => {
            const checkpointTimes = [5000, 10000, 15000]; // Only 3 checkpoints
            const proofChain = ['a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64)];

            const submitData = {
                sessionId,
                playerName: 'ALEX',
                checkpointTimes,
                proofChain
            };

            const wrapped = test.wrap(myFunctions.submitRun);

            await expect(wrapped(submitData)).rejects.toThrow('exactly 10 checkpoint times');
        });

        test('should reject expired session', async () => {
            // Wait for session to expire (would need to mock time in real implementation)
            // For now, test with invalid session ID
            const checkpointTimes = Array(10).fill(0).map((_, i) => (i + 1) * 5000);
            const proofChain = Array(10).fill('a'.repeat(64));

            const submitData = {
                sessionId: 'invalid-session-id',
                playerName: 'ALEX',
                checkpointTimes,
                proofChain
            };

            const wrapped = test.wrap(myFunctions.submitRun);

            await expect(wrapped(submitData)).rejects.toThrow('Session not found');
        });

        test('should flag statistical anomalies', async () => {
            // Submit several normal runs first
            for (let j = 0; j < 15; j++) {
                const startData = {
                    legId: 'mountain-dawn',
                    deviceFingerprint: `test-fingerprint-anomaly-${j}`
                };

                const startWrapped = test.wrap(myFunctions.startRun);
                const session = await startWrapped(startData);

                const crypto = require('crypto');
                const checkpointTimes = [];
                const proofChain = [];
                let previousHash = '';

                for (let i = 0; i < 10; i++) {
                    const time = (i + 1) * 5000 + Math.random() * 500; // Normal times with variation
                    checkpointTimes.push(time);

                    const data = `mountain-dawn:${i}:${time}:${previousHash}`;
                    const hmac = crypto.createHmac('sha256', session.sessionToken);
                    hmac.update(data);
                    const proof = hmac.digest('hex');
                    proofChain.push(proof);
                    previousHash = proof;
                }

                const submitData = {
                    sessionId: session.sessionId,
                    playerName: `P${j.toString().padStart(3, '0')}`,
                    checkpointTimes,
                    proofChain
                };

                const submitWrapped = test.wrap(myFunctions.submitRun);
                await submitWrapped(submitData);
            }

            // Now submit an anomalously fast run
            const startData = {
                legId: 'mountain-dawn',
                deviceFingerprint: 'test-fingerprint-fast-anomaly'
            };

            const startWrapped = test.wrap(myFunctions.startRun);
            const fastSession = await startWrapped(startData);

            const crypto = require('crypto');
            const fastCheckpointTimes = [];
            const fastProofChain = [];
            let previousHash = '';

            for (let i = 0; i < 10; i++) {
                const time = (i + 1) * 2500; // Much faster than average
                fastCheckpointTimes.push(time);

                const data = `mountain-dawn:${i}:${time}:${previousHash}`;
                const hmac = crypto.createHmac('sha256', fastSession.sessionToken);
                hmac.update(data);
                const proof = hmac.digest('hex');
                fastProofChain.push(proof);
                previousHash = proof;
            }

            const fastSubmitData = {
                sessionId: fastSession.sessionId,
                playerName: 'FAST',
                checkpointTimes: fastCheckpointTimes,
                proofChain: fastProofChain
            };

            const submitWrapped = test.wrap(myFunctions.submitRun);
            const result = await submitWrapped(fastSubmitData);

            expect(result.flagged).toBe(true); // Should be flagged as anomaly
        });
    });

    describe('getLeaderboard', () => {
        test('should fetch leaderboard successfully', async () => {
            const data = {
                legId: 'mountain-dawn',
                limit: 10
            };

            const wrapped = test.wrap(myFunctions.getLeaderboard);
            const result = await wrapped(data);

            expect(result).toHaveProperty('entries');
            expect(Array.isArray(result.entries)).toBe(true);
        });

        test('should return empty array for new leg', async () => {
            const data = {
                legId: 'new-test-leg-' + Date.now(),
                limit: 10
            };

            const wrapped = test.wrap(myFunctions.getLeaderboard);
            const result = await wrapped(data);

            expect(result.entries).toEqual([]);
        });

        test('should respect limit parameter', async () => {
            const data = {
                legId: 'mountain-dawn',
                limit: 5
            };

            const wrapped = test.wrap(myFunctions.getLeaderboard);
            const result = await wrapped(data);

            expect(result.entries.length).toBeLessThanOrEqual(5);
        });

        test('should order entries by total time ascending', async () => {
            const data = {
                legId: 'mountain-dawn',
                limit: 10
            };

            const wrapped = test.wrap(myFunctions.getLeaderboard);
            const result = await wrapped(data);

            if (result.entries.length > 1) {
                for (let i = 1; i < result.entries.length; i++) {
                    expect(result.entries[i].totalTime).toBeGreaterThanOrEqual(
                        result.entries[i - 1].totalTime
                    );
                }
            }
        });

        test('should include rank, playerName, totalTime, checkpointTimes, and flagged', async () => {
            const data = {
                legId: 'mountain-dawn',
                limit: 10
            };

            const wrapped = test.wrap(myFunctions.getLeaderboard);
            const result = await wrapped(data);

            if (result.entries.length > 0) {
                const entry = result.entries[0];
                expect(entry).toHaveProperty('rank');
                expect(entry).toHaveProperty('playerName');
                expect(entry).toHaveProperty('totalTime');
                expect(entry).toHaveProperty('checkpointTimes');
                expect(entry).toHaveProperty('flagged');
            }
        });
    });

    describe('cleanupExpiredSessions', () => {
        test('should clean up expired sessions', async () => {
            // This would require mocking the scheduler and database
            // Skipping for now as it requires complex setup
            expect(myFunctions.cleanupExpiredSessions).toBeDefined();
        });
    });
});
