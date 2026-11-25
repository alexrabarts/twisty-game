# Leaderboard Setup Guide

This guide explains how to set up the Firebase Realtime Database leaderboard for Twisty Game.

## Overview

The leaderboard system uses:
- **Firebase Realtime Database** for data storage
- **Firebase Cloud Functions** for server-side validation and anti-cheat
- **HMAC-based cryptographic proofs** to prevent cheating
- **Physics validation** to reject impossible times
- **Statistical anomaly detection** to flag outliers

## Prerequisites

1. Node.js 18+ installed
2. Firebase CLI installed: `npm install -g firebase-tools`
3. Firebase project created

## Step 1: Create Firebase Project

1. Go to https://console.firebase.google.com/
2. Click "Add project"
3. Name it `twisty-game-leaderboard`
4. Disable Google Analytics (optional)
5. Create project

## Step 2: Enable Realtime Database

1. In Firebase Console, go to "Realtime Database"
2. Click "Create Database"
3. Choose location (e.g., `us-central1`)
4. Start in **test mode** (we'll deploy rules later)

## Step 3: Get Firebase Config

1. Go to Project Settings (gear icon)
2. Scroll to "Your apps"
3. Click "Add app" → Web app
4. Register app with nickname "twisty-game-web"
5. Copy the `firebaseConfig` object

## Step 4: Update Firebase Config

Edit `js/firebase-config.js` and replace the placeholder config:

```javascript
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "twisty-game-leaderboard.firebaseapp.com",
    databaseURL: "https://twisty-game-leaderboard-default-rtdb.firebaseio.com",
    projectId: "twisty-game-leaderboard",
    storageBucket: "twisty-game-leaderboard.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};
```

## Step 5: Initialize Firebase CLI

```bash
firebase login
firebase use --add
# Select your project: twisty-game-leaderboard
# Set alias: default
```

## Step 6: Install Cloud Functions Dependencies

```bash
cd functions
npm install
```

## Step 7: Deploy to Firebase

```bash
# Deploy database rules
firebase deploy --only database

# Deploy cloud functions
firebase deploy --only functions

# Deploy hosting (optional)
firebase deploy --only hosting
```

## Step 8: Verify Deployment

1. Go to Firebase Console → Realtime Database
2. You should see the security rules deployed
3. Go to Functions → you should see 4 functions:
   - `startRun`
   - `submitRun`
   - `getLeaderboard`
   - `cleanupExpiredSessions`

## Step 9: Test Locally (Optional)

To test with Firebase emulators before deploying:

```bash
# Install emulator
firebase init emulators
# Select: Functions, Database

# Start emulators
firebase emulators:start

# In js/firebase-config.js, the code uses the emulators only when the
# page URL has ?emulator
```

## Step 10: Run Tests

None of these need Firebase, the emulator or `functions/node_modules`:

```bash
# Server rules (handlers on an in-memory database), client service, the
# client against the real handlers, and the table contract
npm test -- tests/unit/functions-rules.test.js tests/unit/leaderboard.test.js tests/unit/board-contract.test.js tests/integration/leaderboard-flow.test.js

# The table of boards in functions/, with node's own test runner
cd functions && npm test
```

## Boards on the shared course and converted legs

`functions/courses.json` is the server's copy of `Course.boardTable()` (js/course.js):
one row per converted leg, `{ "<board id>": { "gates": 14, "segments": 700 } }`.
`tests/unit/board-contract.test.js` fails when the copy and the game differ.
It holds one row per converted leg (today `mountain-dawn-v3`).

| | Board not in the table | Board in the table |
|---|---|---|
| Protocol | 1 (today) | 2 |
| Store | `/leaderboards/{boardId}` | `/courseBoards/{boardId}` |
| Gates | exactly 5 | exactly the row's `gates` |
| Ranks on | the last gate time | the finish-line time, which includes 5 s per restart |
| Limits | 2 s to 5 min cumulative per gate; session 15 min | 6 s to 8 min between gates; finish from `segments x 20 m / 82.28 m/s` plus 5 s per restart, up to 40 min; session 45 min |
| `startRun` reply | `sessionId`, `sessionToken`, `nameMax` | also `protocol: 2` and `gates` |

The store path comes from the server's table, never from the client. An entry
written under `/leaderboards/{id}` by a server that did not know the row can
never become part of that board. Entries left under `/courseBoards/{id}` after
a rollback are deliberately unread; do not clean them up as orphans.

### Player names

A name is 1 to 5 characters on every board. `submitRun` trims it, counts it after
Unicode NFC normalisation, rejects control and format characters (zero-width and
bidi marks), and stores it uppercased. Names already on the boards (4 characters)
stay valid. The limit lives in the server (`NAME_MAX` in `functions/lib/handlers.js`)
and `startRun` states it as `nameMax`. A client that gets no `nameMax` keeps the
old rule of exactly 4 characters, so the client and the functions can deploy in
either order. The 1 to 5 rule reaches players only after
`firebase deploy --only functions`.

The client submits only when the server states the protocol and gate count of
the leg it built. A reply without those fields means a server that knows no
long boards. The client then shows "Time saved on this device. Online board
opens soon." and sends nothing.

`restarts` is self-reported. That is safe because the server's floor rises by
5 s for each restart, so a lower count never helps. A very stubborn run (about
90 restarts inside one gate gap) can push that gap past 8 min and be refused.

Deploy (the user's step; an agent never runs it):

```bash
cd functions && npm ci && npm test && firebase deploy --only functions
```

Effect check: `startRun` returns `nameMax: 5`, and for a board in the table
also `protocol` and `gates`.
Rollback: redeploy the previous commit's functions. `database.rules.json` needs
no change: `courseBoards` is closed to clients by default, and functions use the
admin SDK.

## The hill ride's board

`functions/hill-courses.json` is the server's copy of `HillBoard.row()` (js/hill/board.js).
`tests/unit/hill-board.test.js` fails when the copy and the game differ.
It holds one row, `village-hill-v1`: 3 gates, and a floor and a ceiling for each of the 4 parts of the course.

| | The hill board |
|---|---|
| Protocol | 2 |
| Store | `/courseBoards/village-hill-v1` |
| Gates | exactly 3 |
| Ranks on | the finish-line time, which includes 5 s per fall |
| Limits | each part at most 30 m/s and at least 0.5 m/s (plus 15 s per restart); the whole at least the sum of the floors plus 5 s per restart, at most 15 min; session 30 min |

Deploy (the user's step; an agent never runs it):

```bash
cd functions && npm ci && npm test && firebase deploy --only functions
```

Effect check: `startRun` with `legId: "village-hill-v1"` returns `protocol: 2` and `gates: 3`.
Until the deploy, the server has no row for the board. The client then sends nothing: the end card shows the time, the best and "Board unavailable: the online board for this ride is not open yet".
`database.rules.json` needs no change: `courseBoards` is closed to clients, and functions use the admin SDK.

## Database Structure

```
/leaderboards
  /{legId}
    /{entryId}
      playerName: "ALEX"
      totalTime: 50000
      checkpointTimes: [5000, 10000, ..., 50000]
      finishTimestamp: 1234567890
      deviceFingerprint: "abc123..."
      validated: true
      flagged: false

/sessions
  /{sessionId}
    legId: "mountain-dawn"
    startTime: 1234567890
    token: "secret-token-abc123"
    deviceFingerprint: "abc123..."
    expiresAt: 1234567890
```

## Anti-Cheat Features

1. **Session Tokens**: Server generates 32-byte secret token per run
2. **Proof Chain**: Each checkpoint has HMAC proof chaining to previous
3. **Physics Validation** (board on the shared course; converted legs: see above):
   - Min checkpoint time: 2 seconds
   - Max checkpoint time: 5 minutes
   - Monotonic increase required
4. **Statistical Detection**: Flags times > 3σ from mean
5. **Rate Limiting**: 5 runs/hour, 50 runs/day per device

## Monitoring

### Check Leaderboard Data
```bash
# View database in console
firebase console:database

# Export data
firebase database:get /leaderboards/mountain-dawn
```

### View Logs
```bash
# Stream function logs
firebase functions:log --only startRun,submitRun

# View all logs
firebase functions:log
```

### Check Flagged Entries
Flagged entries have `flagged: true`. Review them manually:
```bash
firebase database:get /leaderboards/mountain-dawn | grep "flagged"
```

## Cost Estimates

Based on 1000 players, 10 runs each per month:

- **Realtime Database**:
  - Storage: ~$1/GB (minimal)
  - Bandwidth: ~$1/GB downloaded
  - **Est: $2-3/month**

- **Cloud Functions**:
  - Invocations: $0.40/million
  - 30,000 invocations = $0.01
  - **Est: $1-2/month**

**Total: ~$3-5/month**

## Troubleshooting

### "Firebase not initialized"
- Check that Firebase SDK scripts are loaded in `index.html`
- Verify firebaseConfig is correct in `js/firebase-config.js`

### "Permission denied"
- Ensure database rules are deployed: `firebase deploy --only database`
- Sessions and leaderboards should only be writable via Cloud Functions

### "Function not found"
- Deploy functions: `firebase deploy --only functions`
- Check function names match in code

### "Rate limit exceeded"
- This is expected behavior for anti-cheat
- Wait 1 hour or adjust limits in `functions/index.js`

## Next Steps

1. ✅ Deploy to Firebase
2. ✅ Test with a complete run
3. TODO: Build leaderboard UI to display rankings
4. TODO: Add admin panel to review flagged entries
5. TODO: Consider adding authentication for admin features

## Support

For issues, check:
- Firebase Console logs
- Browser console for client errors
- Cloud Functions logs: `firebase functions:log`
