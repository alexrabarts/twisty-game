const functions = require('firebase-functions');
const admin = require('firebase-admin');
const crypto = require('crypto');

admin.initializeApp();
const db = admin.database();

/**
 * Rate limiting helper
 */
async function checkRateLimit(deviceFingerprint, hourlyLimit = 500, dailyLimit = 5000) {
    const now = Date.now();
    const hourAgo = now - (60 * 60 * 1000);
    const dayAgo = now - (24 * 60 * 60 * 1000);

    const sessionsRef = db.ref('sessions');
    const snapshot = await sessionsRef
        .orderByChild('deviceFingerprint')
        .equalTo(deviceFingerprint)
        .once('value');

    if (!snapshot.exists()) {
        return; // No sessions found, OK to proceed
    }

    const sessions = snapshot.val();
    let hourlyCount = 0;
    let dailyCount = 0;

    Object.values(sessions).forEach(session => {
        if (session.startTime > hourAgo) hourlyCount++;
        if (session.startTime > dayAgo) dailyCount++;
    });

    if (hourlyCount >= hourlyLimit) {
        throw new functions.https.HttpsError(
            'resource-exhausted',
            `Rate limit exceeded: ${hourlyLimit} runs per hour`
        );
    }

    if (dailyCount >= dailyLimit) {
        throw new functions.https.HttpsError(
            'resource-exhausted',
            `Rate limit exceeded: ${dailyLimit} runs per day`
        );
    }
}

/**
 * Start a new run session
 * Returns a session ID and generates a server-side secret token
 */
exports.startRun = functions.https.onCall(async (data, context) => {
    const { legId, deviceFingerprint } = data;

    // Validate input
    if (!legId || typeof legId !== 'string') {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid leg ID');
    }
    if (!deviceFingerprint || typeof deviceFingerprint !== 'string') {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid device fingerprint');
    }

    // Check rate limits
    await checkRateLimit(deviceFingerprint);

    // Generate session token (32 bytes = 64 hex chars)
    const sessionToken = crypto.randomBytes(32).toString('hex');

    // Create session document
    const sessionRef = db.ref('sessions').push();
    const sessionData = {
        legId,
        startTime: Date.now(),
        token: sessionToken,
        deviceFingerprint,
        expiresAt: Date.now() + (15 * 60 * 1000) // 15 minutes
    };

    await sessionRef.set(sessionData);

    console.log(`Session created: ${sessionRef.key} for leg ${legId}`);

    return {
        sessionId: sessionRef.key,
        sessionToken // Client needs this to build proof chain
    };
});

// Every leg has this many checkpoint gates - runs must record all of them
const EXPECTED_CHECKPOINTS = 5;

/**
 * Validate HMAC proof chain
 */
function validateProofChain(legId, checkpointTimes, proofChain, sessionToken) {
    if (!Array.isArray(checkpointTimes) || checkpointTimes.length !== EXPECTED_CHECKPOINTS) {
        throw new functions.https.HttpsError('invalid-argument', `Must have exactly ${EXPECTED_CHECKPOINTS} checkpoint times`);
    }
    if (!Array.isArray(proofChain) || proofChain.length !== EXPECTED_CHECKPOINTS) {
        throw new functions.https.HttpsError('invalid-argument', `Must have exactly ${EXPECTED_CHECKPOINTS} proofs`);
    }

    let previousHash = '';
    for (let i = 0; i < EXPECTED_CHECKPOINTS; i++) {
        const time = checkpointTimes[i];
        const providedProof = proofChain[i];

        // Build expected proof: HMAC(sessionToken, legId + index + time + previousHash)
        const data = `${legId}:${i}:${time}:${previousHash}`;
        const hmac = crypto.createHmac('sha256', sessionToken);
        hmac.update(data);
        const expectedProof = hmac.digest('hex');

        if (providedProof !== expectedProof) {
            throw new functions.https.HttpsError(
                'permission-denied',
                `Invalid proof chain at checkpoint ${i}`
            );
        }

        previousHash = providedProof;
    }

    return true;
}

/**
 * Validate physics constraints
 */
function validatePhysics(checkpointTimes) {
    const MIN_CHECKPOINT_TIME = 2000; // 2 seconds
    const MAX_CHECKPOINT_TIME = 5 * 60 * 1000; // 5 minutes

    for (let i = 0; i < checkpointTimes.length; i++) {
        const time = checkpointTimes[i];

        // Check individual checkpoint time
        if (time < MIN_CHECKPOINT_TIME) {
            throw new functions.https.HttpsError(
                'invalid-argument',
                `Checkpoint ${i} too fast: ${time}ms (min: ${MIN_CHECKPOINT_TIME}ms)`
            );
        }
        if (time > MAX_CHECKPOINT_TIME) {
            throw new functions.https.HttpsError(
                'invalid-argument',
                `Checkpoint ${i} too slow: ${time}ms (max: ${MAX_CHECKPOINT_TIME}ms)`
            );
        }

        // Check monotonic increase (each checkpoint time must be greater than previous)
        if (i > 0 && time <= checkpointTimes[i - 1]) {
            throw new functions.https.HttpsError(
                'invalid-argument',
                `Checkpoint times must be monotonically increasing at checkpoint ${i}`
            );
        }
    }

    return true;
}

/**
 * Check for statistical anomalies
 */
async function checkAnomalies(legId, totalTime) {
    const leaderboardRef = db.ref(`leaderboards/${legId}`);
    const snapshot = await leaderboardRef
        .orderByChild('validated')
        .equalTo(true)
        .once('value');

    if (!snapshot.exists()) {
        return false; // Not enough data
    }

    const entries = snapshot.val();
    const times = Object.values(entries).map(entry => entry.totalTime);

    if (times.length < 10) {
        return false; // Not enough data for statistical analysis
    }

    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    const variance = times.reduce((sum, time) => sum + Math.pow(time - mean, 2), 0) / times.length;
    const stdDev = Math.sqrt(variance);
    const zScore = Math.abs((totalTime - mean) / stdDev);

    // Flag if more than 3 standard deviations from mean
    return zScore > 3;
}

/**
 * Submit a completed run
 */
exports.submitRun = functions.https.onCall(async (data, context) => {
    const { sessionId, playerName, checkpointTimes, proofChain } = data;

    // Validate input
    if (!sessionId || typeof sessionId !== 'string') {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid session ID');
    }
    if (!playerName || typeof playerName !== 'string' || playerName.length !== 4) {
        throw new functions.https.HttpsError('invalid-argument', 'Player name must be exactly 4 characters');
    }
    if (!Array.isArray(checkpointTimes) || checkpointTimes.length !== EXPECTED_CHECKPOINTS) {
        throw new functions.https.HttpsError('invalid-argument', `Must have exactly ${EXPECTED_CHECKPOINTS} checkpoint times`);
    }
    if (!Array.isArray(proofChain) || proofChain.length !== EXPECTED_CHECKPOINTS) {
        throw new functions.https.HttpsError('invalid-argument', `Must have exactly ${EXPECTED_CHECKPOINTS} proofs`);
    }

    // Retrieve session
    const sessionRef = db.ref(`sessions/${sessionId}`);
    const sessionSnapshot = await sessionRef.once('value');

    if (!sessionSnapshot.exists()) {
        throw new functions.https.HttpsError('not-found', 'Session not found or expired');
    }

    const session = sessionSnapshot.val();

    // Check if session is expired
    if (session.expiresAt < Date.now()) {
        await sessionRef.remove();
        throw new functions.https.HttpsError('deadline-exceeded', 'Session expired');
    }

    // Validate proof chain
    validateProofChain(session.legId, checkpointTimes, proofChain, session.token);

    // Validate physics constraints
    validatePhysics(checkpointTimes);

    // Calculate total time
    const totalTime = checkpointTimes[checkpointTimes.length - 1];

    // Check for statistical anomalies
    const flagged = await checkAnomalies(session.legId, totalTime);

    // Create leaderboard entry
    const entryRef = db.ref(`leaderboards/${session.legId}`).push();
    const entryData = {
        playerName: playerName.toUpperCase(),
        totalTime,
        checkpointTimes,
        finishTimestamp: Date.now(),
        deviceFingerprint: session.deviceFingerprint,
        validated: true,
        flagged
    };

    await entryRef.set(entryData);

    // Delete session (one-time use)
    await sessionRef.remove();

    console.log(`Run submitted: ${entryRef.key} for leg ${session.legId}, time: ${totalTime}ms, flagged: ${flagged}`);

    // Calculate rank
    const leaderboardSnapshot = await db.ref(`leaderboards/${session.legId}`)
        .orderByChild('totalTime')
        .once('value');

    let rank = 1;
    if (leaderboardSnapshot.exists()) {
        const allEntries = leaderboardSnapshot.val();
        Object.values(allEntries).forEach(entry => {
            if (entry.validated && entry.totalTime < totalTime) {
                rank++;
            }
        });
    }

    return {
        entryId: entryRef.key,
        rank,
        flagged
    };
});

/**
 * Get leaderboard for a leg
 */
exports.getLeaderboard = functions.https.onCall(async (data, context) => {
    const { legId, limit = 10 } = data;

    if (!legId || typeof legId !== 'string') {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid leg ID');
    }

    const leaderboardRef = db.ref(`leaderboards/${legId}`);
    const snapshot = await leaderboardRef
        .orderByChild('totalTime')
        .limitToFirst(limit)
        .once('value');

    if (!snapshot.exists()) {
        return { entries: [] };
    }

    const allEntries = snapshot.val();
    const entries = Object.entries(allEntries)
        .filter(([key, entry]) => entry.validated)
        .sort((a, b) => a[1].totalTime - b[1].totalTime)
        .slice(0, limit)
        .map(([key, entry], index) => ({
            rank: index + 1,
            playerName: entry.playerName,
            totalTime: entry.totalTime,
            flagged: entry.flagged || false
        }));

    return { entries };
});

/**
 * Scheduled function to clean up expired sessions
 * Runs every hour
 */
exports.cleanupExpiredSessions = functions.pubsub
    .schedule('every 1 hours')
    .onRun(async (context) => {
        const now = Date.now();
        const sessionsRef = db.ref('sessions');
        const snapshot = await sessionsRef.once('value');

        if (!snapshot.exists()) {
            console.log('No sessions to clean up');
            return null;
        }

        const sessions = snapshot.val();
        const updates = {};
        let count = 0;

        Object.entries(sessions).forEach(([sessionId, session]) => {
            if (session.expiresAt < now) {
                updates[sessionId] = null; // Mark for deletion
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
    });
