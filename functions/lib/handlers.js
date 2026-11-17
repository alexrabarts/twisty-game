// The leaderboard rules, with every outside thing injected so they run
// without Firebase: the database, the clock, the random source and the error
// class. functions/index.js wires the real ones; the tests wire a memory
// database.
const crypto = require('crypto');
const boards = require('./boards');

const NAME_MIN = 1;
const NAME_MAX = 5;

function createHandlers({ db, now = Date.now, randomBytes = crypto.randomBytes, HttpsError, table = boards.courses }) {
    const rule = boardId => boards.ruleFor(boardId, table);
    const path = boardId => boards.storePath(boardId, table);

    async function checkRateLimit(deviceFingerprint, hourlyLimit = 500, dailyLimit = 5000) {
        const hourAgo = now() - (60 * 60 * 1000);
        const dayAgo = now() - (24 * 60 * 60 * 1000);

        const snapshot = await db.ref('sessions')
            .orderByChild('deviceFingerprint')
            .equalTo(deviceFingerprint)
            .once('value');

        if (!snapshot.exists()) return;

        let hourlyCount = 0;
        let dailyCount = 0;
        Object.values(snapshot.val()).forEach(session => {
            if (session.startTime > hourAgo) hourlyCount++;
            if (session.startTime > dayAgo) dailyCount++;
        });

        if (hourlyCount >= hourlyLimit) {
            throw new HttpsError('resource-exhausted', `Rate limit exceeded: ${hourlyLimit} runs per hour`);
        }
        if (dailyCount >= dailyLimit) {
            throw new HttpsError('resource-exhausted', `Rate limit exceeded: ${dailyLimit} runs per day`);
        }
    }

    function hmac(token, data) {
        return crypto.createHmac('sha256', token).update(data).digest('hex');
    }

    // HMAC(sessionToken, legId:index:time:previousHash), one link per gate
    function validateProofChain(legId, gates, checkpointTimes, proofChain, sessionToken) {
        let previousHash = '';
        for (let i = 0; i < gates; i++) {
            const expectedProof = hmac(sessionToken, `${legId}:${i}:${checkpointTimes[i]}:${previousHash}`);
            if (proofChain[i] !== expectedProof) {
                throw new HttpsError('permission-denied', `Invalid proof chain at checkpoint ${i}`);
            }
            previousHash = proofChain[i];
        }
        return previousHash;
    }

    // Protocol 1: cumulative times between 2 s and 5 min, each later than the last
    function validateLegacyPhysics(checkpointTimes) {
        for (let i = 0; i < checkpointTimes.length; i++) {
            const time = checkpointTimes[i];
            if (time < boards.LEGACY.minTimeMs) {
                throw new HttpsError('invalid-argument', `Checkpoint ${i} too fast: ${time}ms (min: ${boards.LEGACY.minTimeMs}ms)`);
            }
            if (time > boards.LEGACY.maxTimeMs) {
                throw new HttpsError('invalid-argument', `Checkpoint ${i} too slow: ${time}ms (max: ${boards.LEGACY.maxTimeMs}ms)`);
            }
            if (i > 0 && time <= checkpointTimes[i - 1]) {
                throw new HttpsError('invalid-argument', `Checkpoint times must be monotonically increasing at checkpoint ${i}`);
            }
        }
    }

    // Protocol 2: each gap between gates (the first from 0) inside the gate
    // limits, and the finish inside the board's floor and the total cap. A
    // restart only adds to the signed times, so the floor rises with it.
    function validateLongPhysics(r, checkpointTimes, finishTime, restarts) {
        let previous = 0;
        for (let i = 0; i < checkpointTimes.length; i++) {
            const delta = checkpointTimes[i] - previous;
            if (!Number.isFinite(checkpointTimes[i]) || delta < r.minGateMs) {
                throw new HttpsError('invalid-argument', `Checkpoint ${i} too fast: ${delta}ms since the last (min: ${r.minGateMs}ms)`);
            }
            if (delta > r.maxGateMs) {
                throw new HttpsError('invalid-argument', `Checkpoint ${i} too slow: ${delta}ms since the last (max: ${r.maxGateMs}ms)`);
            }
            previous = checkpointTimes[i];
        }
        if (finishTime <= previous) {
            throw new HttpsError('invalid-argument', 'Finish time must be after the last checkpoint');
        }
        const floor = r.minTotalMs + r.penaltyMs * restarts;
        if (finishTime < floor) {
            throw new HttpsError('invalid-argument', `Finish too fast: ${finishTime}ms (min: ${floor}ms)`);
        }
        if (finishTime > r.maxTotalMs) {
            throw new HttpsError('invalid-argument', `Finish too slow: ${finishTime}ms (max: ${r.maxTotalMs}ms)`);
        }
    }

    async function checkAnomalies(legId, totalTime) {
        const snapshot = await db.ref(path(legId))
            .orderByChild('validated')
            .equalTo(true)
            .once('value');

        if (!snapshot.exists()) return false;

        const times = Object.values(snapshot.val()).map(entry => entry.totalTime);
        if (times.length < 10) return false; // Not enough data for statistical analysis

        const mean = times.reduce((a, b) => a + b, 0) / times.length;
        const variance = times.reduce((sum, time) => sum + Math.pow(time - mean, 2), 0) / times.length;
        const zScore = Math.abs((totalTime - mean) / Math.sqrt(variance));
        return zScore > 3;
    }

    // Returns a session ID and a server-side secret for the proof chain. A
    // table board also states its protocol and gate count: the client submits
    // only when both match the leg it built.
    async function startRun(data) {
        const { legId, deviceFingerprint } = data;
        if (!legId || typeof legId !== 'string') {
            throw new HttpsError('invalid-argument', 'Invalid leg ID');
        }
        if (!deviceFingerprint || typeof deviceFingerprint !== 'string') {
            throw new HttpsError('invalid-argument', 'Invalid device fingerprint');
        }

        await checkRateLimit(deviceFingerprint);

        const r = rule(legId);
        const sessionToken = randomBytes(32).toString('hex');
        const sessionRef = db.ref('sessions').push();
        const startTime = now();
        const session = {
            legId,
            startTime,
            token: sessionToken,
            deviceFingerprint,
            expiresAt: startTime + r.ttlMs
        };
        if (boards.isTable(legId, table)) {
            session.protocol = r.protocol;
            session.gates = r.gates;
        }
        await sessionRef.set(session);

        console.log(`Session created: ${sessionRef.key} for leg ${legId}`);

        // The server owns the name limit; a client that gets no nameMax keeps exactly 4
        const reply = { sessionId: sessionRef.key, sessionToken, nameMax: NAME_MAX };
        if (boards.isTable(legId, table)) {
            reply.protocol = r.protocol;
            reply.gates = r.gates;
        }
        return reply;
    }

    async function submitRun(data) {
        const { sessionId, playerName, checkpointTimes, proofChain } = data;

        if (!sessionId || typeof sessionId !== 'string') {
            throw new HttpsError('invalid-argument', 'Invalid session ID');
        }
        const name = typeof playerName === 'string' ? playerName.normalize('NFC').trim() : '';
        if (name.length < NAME_MIN || name.length > NAME_MAX) {
            throw new HttpsError('invalid-argument', `Player name must be ${NAME_MIN} to ${NAME_MAX} characters`);
        }
        // Control and format characters (zero-width, bidi) would make a name invisible or flip its display
        if (/\p{C}/u.test(name)) {
            throw new HttpsError('invalid-argument', 'Player name must not contain control characters');
        }

        const sessionRef = db.ref(`sessions/${sessionId}`);
        const sessionSnapshot = await sessionRef.once('value');
        if (!sessionSnapshot.exists()) {
            throw new HttpsError('not-found', 'Session not found or expired');
        }
        const session = sessionSnapshot.val();
        if (session.expiresAt < now()) {
            await sessionRef.remove();
            throw new HttpsError('deadline-exceeded', 'Session expired');
        }

        // The board, its rules and its store come from the server's table
        // for the leg the session was opened for, never from this request
        const r = rule(session.legId);
        const long = r.protocol === 2;
        if (!Array.isArray(checkpointTimes) || checkpointTimes.length !== r.gates) {
            throw new HttpsError('invalid-argument', `Must have exactly ${r.gates} checkpoint times`);
        }
        if (!Array.isArray(proofChain) || proofChain.length !== r.gates) {
            throw new HttpsError('invalid-argument', `Must have exactly ${r.gates} proofs`);
        }

        const lastProof = validateProofChain(session.legId, r.gates, checkpointTimes, proofChain, session.token);

        let totalTime;
        let extra = {};
        if (long) {
            const { finishTime, finishProof, restarts } = data;
            if (!Number.isFinite(finishTime) || typeof finishProof !== 'string') {
                throw new HttpsError('invalid-argument', 'Missing finish time or finish proof');
            }
            if (!Number.isInteger(restarts) || restarts < 0 || restarts > r.maxRestarts) {
                throw new HttpsError('invalid-argument', `Restarts must be a whole number from 0 to ${r.maxRestarts}`);
            }
            if (finishProof !== hmac(session.token, `${session.legId}:F:${finishTime}:${restarts}:${lastProof}`)) {
                throw new HttpsError('permission-denied', 'Invalid finish proof');
            }
            validateLongPhysics(r, checkpointTimes, finishTime, restarts);
            totalTime = finishTime;
            extra = { protocol: 2, finishTime, restarts };
        } else {
            validateLegacyPhysics(checkpointTimes);
            totalTime = checkpointTimes[checkpointTimes.length - 1];
        }

        const flagged = await checkAnomalies(session.legId, totalTime);

        const boardPath = path(session.legId);
        const entryRef = db.ref(boardPath).push();
        await entryRef.set({
            playerName: name.toUpperCase(),
            totalTime,
            checkpointTimes,
            ...extra,
            finishTimestamp: now(),
            deviceFingerprint: session.deviceFingerprint,
            validated: true,
            flagged
        });

        // Delete session (one-time use)
        await sessionRef.remove();

        console.log(`Run submitted: ${entryRef.key} for leg ${session.legId}, time: ${totalTime}ms, flagged: ${flagged}`);

        const leaderboardSnapshot = await db.ref(boardPath).orderByChild('totalTime').once('value');
        let rank = 1;
        if (leaderboardSnapshot.exists()) {
            Object.values(leaderboardSnapshot.val()).forEach(entry => {
                if (entry.validated && entry.totalTime < totalTime) rank++;
            });
        }

        return { entryId: entryRef.key, rank, flagged };
    }

    async function getLeaderboard(data) {
        const { legId, limit = 10 } = data;
        if (!legId || typeof legId !== 'string') {
            throw new HttpsError('invalid-argument', 'Invalid leg ID');
        }

        const snapshot = await db.ref(path(legId))
            .orderByChild('totalTime')
            .limitToFirst(limit)
            .once('value');

        if (!snapshot.exists()) return { entries: [] };

        const entries = Object.entries(snapshot.val())
            .filter(([, entry]) => entry.validated)
            .sort((a, b) => a[1].totalTime - b[1].totalTime)
            .slice(0, limit)
            .map(([, entry], index) => ({
                rank: index + 1,
                playerName: entry.playerName,
                totalTime: entry.totalTime,
                // Lets the client show the rider's gap to the record at each gate
                checkpointTimes: Array.isArray(entry.checkpointTimes) ? entry.checkpointTimes : null,
                restarts: Number.isInteger(entry.restarts) ? entry.restarts : 0,
                flagged: entry.flagged || false
            }));

        return { entries };
    }

    async function cleanupExpiredSessions() {
        const sessionsRef = db.ref('sessions');
        const snapshot = await sessionsRef.once('value');

        if (!snapshot.exists()) {
            console.log('No sessions to clean up');
            return null;
        }

        const updates = {};
        let count = 0;
        Object.entries(snapshot.val()).forEach(([sessionId, session]) => {
            if (session.expiresAt < now()) {
                updates[sessionId] = null;
                count++;
            }
        });

        if (count > 0) {
            await sessionsRef.update(updates);
            console.log(`Cleaned up ${count} expired sessions`);
        } else {
            console.log('No expired sessions to clean up');
        }
        return null;
    }

    return { startRun, submitRun, getLeaderboard, cleanupExpiredSessions };
}

module.exports = { createHandlers };
