# Agent Guidelines

Twisty Game is a browser motorcycle racing game: classic scripts under `js/`, three r150, no build step. Project notes for agents live in `.agent/` (start with `.agent/README.md`).

## Build/Test Commands
- Serve locally: `npm run serve` (http://localhost:8080)
- Run all tests: `node --experimental-vm-modules node_modules/.bin/jest`
- Run one file: `node --experimental-vm-modules node_modules/.bin/jest tests/unit/vehicle.test.js`
- Browser proofs: `node tools/terrain-check.mjs legs,pages` (`npm run test:integration`). Needs Chrome: set `TWISTY_CHROME` to a Chrome binary, pass `--chrome <path>`, or run `npx puppeteer browsers install chrome`
- The streamed world is the default ride: on the plain page, choosing a rider on the menu starts the Tremola slice; CLASSIC LEGS on the rider screen (or `?legs`) opens the procedural legs, and a world whose data does not load hands over to the legs with a note. `/?world=tremola` (`?world=<stage|all>`) starts a world without the menu. Only `js/ridemode.js` reads `?world`. `?worldData=<path>` reads the data from another folder (relative, under `world/` or `tests/fixtures/world/` only); a world read that way never submits a time. Browser proofs: `node tools/terrain-check.mjs world-window,world-ground,world-junction,world-wrongway,world-credit,world-net --world tremola`. `world-frustum` rides every hairpin and fails when the bike leaves the chase view, `world-buildings` fails on a drawn building over a road band, `world-fairness` fails on a crash cause with nothing drawn there, a physics road band off the drawn ribbon, or a crash or restart in any hairpin at 5 and 7 m/s, `world-models` loads every `assets/**/*.glb` in the page, and `world-hairpin-shots --out <dir>` takes GPU pictures of the first three hairpins and the start, `world-haze` fails when distant land is not the colour of the photos by its distance (1 to 3 km, 3 to 8 km, from 8 km), when it is greener than the sky near the horizon, or when anything a world draws has no haze (`LandShade.HAZE`; `node tools/world/photomatch.mjs haze` measures the photos), `world-floating` fails on a drawn road edge over the land, land over the road, the physics ground off the drawn ground, a road's underside or a dark seam in the named views (`--out <dir>` saves them), `world-junctions` fails on a side road that does not meet the ride (a step or hole in its surface, land over it, a deck or parapet in its mouth, an open edge there; the builders' rules are in `.agent/system/world.md`, "A side road meets the ride", and every new world must pass it), `world-watertight` fails on a gap in the drawn land seen from the helmet, chase or high camera every 50 m (a ray that passes under the land and meets nothing, a land underside or a skirt seen through it) or an apron or retaining wall whose foot stands over the land or over the ride's carriageway (`tests/unit/world-watertight.test.js` holds every shared tile edge closed at every pair of LODs); `node tools/world/verify.mjs floating` and `overlap` check the same in the data The importer and its cache rules are in `.agent/system/world-data.md`
- Debug mode: add `debug` to the page's address (`/?debug`, `/?world=tremola&debug`): every rider, bike and leg is open (`TourSystem` `unlockAll`; the saved progress is not changed), and N puts the bike 40 m before the next checkpoint of a world ride (`Game.debugSkipToNextGate`); a ride that skipped never submits a time
- Dialogs: every dialog (menu, the classic legs' crash card, finish, pause, the world ride's confirm, credits, best times, name entry) opens through the one stack in `js/modals.js`, which keeps only the top one interactive and gives it every key; give a button its shortcut with `data-key="KeyM"`, never a `keydown` listener or a z-index of its own. `node tools/modal-check.mjs [--variant desktop|touch] [--out <dir>] [--gpu]` opens them in every reachable sequence and fails on a covered button, two interactive dialogs, focus outside the top one or a shortcut that does nothing; its `menu-*` sequences start on the plain page and ride the world, a classic leg and the fallback with real clicks. A crash in a world ride opens no dialog: the game restarts the rider in place after the fall (+5 s; `.agent/system/world.md`, "A restart is in place"), and Restart leg is on the pause panel
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
