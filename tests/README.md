# Tests

Jest runs the unit tests under jsdom. A Chrome-driven harness (`tools/terrain-check.mjs`) proves the real page in a browser.

## Layout

```
tests/
├── setup.js          Global THREE mock and browser stubs for the jest suites
├── helpers/
│   └── load-game.js  Loads the real game scripts against real three r150
├── golden/           Frozen terrain baselines (see below)
├── unit/             Jest unit tests
└── integration/      gameloop test, leaderboard flow (needs the Firebase emulator, skipped by default)
```

## What is real and what is a replica

Most unit tests exercise a replica: they restate the game's formulas inline or run against the mock in `setup.js`, so they cannot notice drift in `js/`. Two kinds of test load real game files:

- `tests/unit/leaderboard.test.js` evaluates `js/leaderboard.js` (a classic script, no exports) and tests the real `LeaderboardService`.
- `tests/helpers/load-game.js` loads `terrain.js`, `js/world/*.js` (the route contract and the leg adapters), `vehicle.js`, `environment.js`, `tours.js` and `rockfalls.js` and passes the real three r150 (devDependency `three`) in as a function parameter, with a stub 2D canvas. The mock in `setup.js` is neither used nor replaced. `tests/unit/terrain-equivalence.test.js` builds all eight legs through it.

## Running

```bash
node --experimental-vm-modules node_modules/.bin/jest                      # all
node --experimental-vm-modules node_modules/.bin/jest tests/unit/vehicle.test.js   # one file
npm run test:coverage
npm run test:integration                                                   # node tools/terrain-check.mjs legs,pages
```

The browser harness needs Chrome: set `TWISTY_CHROME`, pass `--chrome <path>`, or run `npx puppeteer browsers install chrome`. It starts its own static server on an ephemeral port and aborts every request to `cloudfunctions.net`, `firebasedatabase.app` and `firebaseio.com`, so no run reaches production.

## Golden files

`tests/golden/terrain-baseline.json` (jest) and `tests/golden/browser-baseline.json` (browser) were captured once from untouched game source at commit 6c525be. Each records the HEAD sha, the `js/` tree id and a clean-tree check. They are the definition of "unchanged" for the terrain work and are never regenerated; compare with `shasum -a 256`. `tests/golden/parts-baseline.json` holds the per-leg `parts` and `surface` records, which later phases may re-record through the guarded `--update-baseline` path of `tools/terrain-check.mjs`.

## Writing tests

Prefer the real module over a replica. Load it with `loadGame()` from `tests/helpers/load-game.js` and build a leg with `buildEnvironment(game, legIndex)`.
