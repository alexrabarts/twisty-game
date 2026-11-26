const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { createHandlers } = require('./lib/handlers');

admin.initializeApp();

// The rules live in lib/ so they run without Firebase; this file only wires
// them to the real database and the callable and schedule triggers.
const handlers = createHandlers({
    db: admin.database(),
    HttpsError: functions.https.HttpsError
});

exports.startRun = functions.https.onCall((data, context) => handlers.startRun(data, context));

exports.submitRun = functions.https.onCall((data, context) => handlers.submitRun(data, context));

exports.getLeaderboard = functions.https.onCall((data, context) => handlers.getLeaderboard(data, context));

// Scheduled function to clean up expired sessions. Runs every hour
exports.cleanupExpiredSessions = functions.pubsub
    .schedule('every 1 hours')
    .onRun(context => handlers.cleanupExpiredSessions(context));
