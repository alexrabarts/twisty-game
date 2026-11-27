# Tests

Jest runs the unit tests under jsdom. Chrome-driven tools (`tools/terrain-check.mjs` for the world probes, `tools/modal-check.mjs` for the dialogs, `tools/home-check.mjs` for the menu) prove the real page in a browser.

## Layout

```
tests/
├── setup.js          Global THREE mock and browser stubs for the jest suites
├── helpers/
│   └── load-game.js  Loads the real game scripts against real three r150
├── fixtures/world/   World data folders the suites ride (a small synthetic world and others)
├── unit/             Jest unit tests
└── integration/      gameloop test, leaderboard flow (needs the Firebase emulator, skipped by default)
```

## What is real and what is a replica

Some unit tests exercise a replica: they restate a formula inline or run against the mock in `setup.js`, so they cannot notice drift in `js/`. Most load real game files:

- `tests/unit/leaderboard.test.js` evaluates `js/leaderboard.js` (a plain script, no exports) and tests the real `LeaderboardService`.
- `tests/helpers/load-game.js` loads `js/world/*.js`, `vehicle.js`, `traffic.js`, `tours.js` and the rest and passes the real three r150 (devDependency `three`) in as a function parameter, with a stub 2D canvas. The mock in `setup.js` is neither used nor replaced. It loads the old procedural legs' scripts too (`terrain.js`, `environment.js`, `course.js`, `world/legroute.js`), which the page no longer loads: `tests/unit/world-route.test.js`, `world-projection.test.js` and `world-verge.test.js` still build an old leg with `buildEnvironment(game, legIndex)`.

## Running

```bash
node --experimental-vm-modules node_modules/.bin/jest                      # all
node --experimental-vm-modules node_modules/.bin/jest tests/unit/vehicle.test.js   # one file
npm run test:coverage
```

The browser tools need Chrome: set `TWISTY_CHROME`, pass `--chrome <path>`, or run `npx puppeteer browsers install chrome`. Each starts its own static server on an ephemeral port and aborts every request to `cloudfunctions.net`, `firebasedatabase.app` and `firebaseio.com`, so no run reaches production.

## Writing tests

Prefer the real module over a replica. Load it with `loadGame()` from `tests/helpers/load-game.js`, and ride a world with `WorldEnvironment.load` over `diskFetch()` (`tests/helpers/world-fetch.js`).
