# Run flow and leaderboard

Where the code is: `js/main.js` (run flow), `js/leaderboard.js` (client), `functions/lib/` (server rules), `functions/courses.json` (server table). Setup and deploy: `LEADERBOARD_SETUP.md`.

## Restart from a save checkpoint

- Every timing gate is a save checkpoint. `C` (or the crash card's "Checkpoint" button) puts the bike back on the last gate passed, on a rolling start at 15 m/s.
- It costs 5 s. `Game.penaltyMs` is added in `raceElapsed()`, so every later gate time and the finish time hold the penalty. `Game.RESTART_PENALTY_MS` and `LONG.penaltyMs` in `functions/lib/boards.js` are one number; `tests/unit/board-contract.test.js` fails when they differ.
- The run stays valid. The leaderboard session is not cancelled; `recordRestart()` counts it. A restart returns the rider to a gate already passed, so it never shortens a run.
- A restart resets cones, removes live rocks (`RockfallSystem.reset()`) and moves cars within 6 segments of the rider ahead (`Traffic.clearAround()`, a fixed rule, no random draw). The AI crew is untouched.
- All race time goes through `Game.now()`, so a probe can step the clock.

## Which time a board ranks

- A board on the shared course (protocol 1): the last gate time, 5 gates, as before.
- A converted leg (protocol 2, a row in `Course.boardTable()`): the finish-line time with a signed finish link (`legId:F:finishTime:restarts:lastGateProof`) and the restart count. The board shows the count.
- On protocol 1 a restart keeps the run valid too, with the 5 s in the signed times, but the server cannot see the count.

## Handshake and the `not-submitted` state

`LeaderboardService.startRun(boardId, { protocol, gates })`: the client keeps the session only when the server states the same protocol and gate count. A reply without the fields counts as protocol 1 with 5 gates. On a mismatch (old server, table that disagrees, leg that built another gate count) `unsupported` is set, nothing is sent, no name form shows, and the finish card says the time is saved on this device.

## Server

- `functions/lib/boards.js`: the rules of a board from the table. `functions/lib/handlers.js`: the four handlers with the database, clock and error class injected, so they run without Firebase. `functions/index.js` only wires them.
- A board in the table is stored under `courseBoards/<id>` and a board not in it under `leaderboards/<id>`. The path comes from the server table. This keeps a forged entry written by an old server out of a converted board.
- `restarts` is self-reported; the finish floor rises by 5 s per restart, so a lower count never helps.
- Entries left under `courseBoards/<id>` after a rollback are deliberately unread. They are not orphans to clean up.

## Tests and probes

- `tests/unit/functions-rules.test.js`, `tests/unit/leaderboard.test.js`, `tests/unit/board-contract.test.js`, `tests/unit/restart.test.js`, `tests/integration/leaderboard-flow.test.js`. None needs Firebase.
- `node tools/terrain-check.mjs submit --legs <leg>` finishes a leg in the real page against a server it answers itself (nothing leaves the machine). `--reply new` adds `protocol` and `gates` for a board in the table; `--mutate ready-always` makes the handshake pass whatever the reply says, and must make the probe fail on a converted leg against an old reply.
