# Agent Guidelines

Twisty Game is a browser motorcycle racing game: classic scripts under `js/`, three r150, no build step. Project notes for agents live in `.agent/` (start with `.agent/README.md`).

## Build/Test Commands
- Serve locally: `npm run serve` (http://localhost:8080)
- Run all tests: `node --experimental-vm-modules node_modules/.bin/jest`
- Run one file: `node --experimental-vm-modules node_modules/.bin/jest tests/unit/vehicle.test.js`
- Browser proofs: `node tools/terrain-check.mjs legs,pages` (`npm run test:integration`). Needs Chrome: set `TWISTY_CHROME` to a Chrome binary, pass `--chrome <path>`, or run `npx puppeteer browsers install chrome`
- The streamed world: open `/?world=tremola` (`?world=<stage|all>`). `?worldData=<path>` reads the data from another folder (relative, under `world/` or `tests/fixtures/world/` only); a world read that way never submits a time. Browser proofs: `node tools/terrain-check.mjs world-window,world-ground,world-junction,world-wrongway,world-credit,world-net --world tremola`. `world-frustum` rides every hairpin and fails when the bike leaves the chase view, `world-buildings` fails on a drawn building over a road band, `world-models` loads every `assets/**/*.glb` in the page, and `world-hairpin-shots --out <dir>` takes GPU pictures of the first three hairpins and the start The importer and its cache rules are in `.agent/system/world-data.md`
- Ride a leg in the console: inject `tools/autopilot.js`, then `twistyDev.start('mountain-dawn')` and `twistyDev.autopilot({ speed: 25 })`

## Terrain baselines
- `tests/golden/terrain-baseline.json` and `tests/golden/browser-baseline.json` define "unchanged" for the terrain work. They are captured once from untouched game source and never regenerated. Check them with `shasum -a 256 tests/golden/*-baseline.json`.
- `tests/golden/parts-baseline.json` is the mutable per-leg record; `tools/terrain-check.mjs` guards how it is rewritten.
- `tools/terrain-check.mjs` aborts every request to `cloudfunctions.net`; never point a page at production functions.

## Code Style
- Use British English for human-facing text, American English for code
- Single word variable names preferred; refactor if scope becomes too large
- No ASCII art dividers in comments; use single line comments with blank lines for paragraphs
- Document WHY not WHAT; avoid obvious comments

## Error Handling
- Handle errors explicitly; no silent failures

## General
- Don't apologize for mistakes; provide corrected response
- No deprecation TODOs; leave code in place
- Don't create README.md files unnecessarily
