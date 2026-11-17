# Play-testing with the autopilot

`tools/autopilot.js` is a dev helper. The game does not load it.

1. Run `npm run serve` and open `http://localhost:8080`.
2. In the console:

```js
const s = document.createElement('script'); s.src = 'tools/autopilot.js'; document.head.appendChild(s);
twistyDev.start('mountain-dawn');       // any leg id from js/tours.js
twistyDev.autopilot({ speed: 30, lane: -3 });
```

- `speed` is in m/s. Use about 20 for High Pass (hairpins) and about 24 for the rain and snow legs.
- `lane: -3` is the riders' lane. `lane: 1` meets the roadworks ramp and the oncoming car.
- `twistyDev.view(side, up, back, ahead)` pauses the game and looks at the bike from beside the road. Use it to check scenery.
- `twistyDev.teleport(segment)` moves the bike.

Rockfalls can crash the autopilot. Set `game.rockfalls = null` for a run without them.

## Run-off, tunnel and cliff legs

- Mountain-dawn, storm-valley, coastal-descent (its beach), winter-pass and night-ride have loose ground beside the road, not a wall. A bike on it slows to a floor speed and has low grip. After 6 s off the road it crashes with `Off the road for 6.0 s`. The road resets that clock.
- A lane past the road edge tests this: for example `twistyDev.autopilot({ speed: 25, lane: 14 })` on mountain-dawn. The autopilot starts on the centre line and steers out, so the off-road clock only starts when the bike reaches the edge (about 2.3 s in): `vehicle.offRoadTime` is 0.5 to 0.75 at 3 s and 4.5 to 4.75 at 7 s, and the crash comes between 7 and 10 s. To time the clock from tick 0, put the bike out there first with `twistyDev.teleport(segment)` and a lateral of 14 (`node tools/terrain-check.mjs runoff`, which defaults to mountain-dawn): `offRoadTime` is 3.0 at 3 s and the bike crashes by 7 s with one `Off the road for 6.0 s` line. Step the game to read `vehicle.offRoadTime`.
- Trees on run-off ground are solid: a trunk crashes the bike inside 1.6 m. Water (the mountain-dawn river, the coast's sea) crashes the bike at once.
- Night-ride has a tunnel around segment 517. The camera stays under the roof, so check High View there. Foggy-gorge has two tunnels (segments 265 to 271 and 286 to 293); between them the wall is on the left and the drop on the right, after the second the other way round.
- Valley-run is the cliff road with the wall on the right and the drop to the lake on the left; high-pass has the wall on the left.
- `side > 0` in `twistyDev.view` is the right of the road, whatever ground is there.

## The village by eye

`node tools/village-shots.mjs <directory> <label> [--no-assets] [--gpu] [--times]` writes pictures of night-ride's village from six fixed views, at night and with daylight forced, and prints the village's meshes, triangles and frame time for each. `--no-assets` keeps the procedural village, for a before and after. `--times` prints the frame times only. It blocks the same hosts as the harness below.

## Browser proof harness

`tools/terrain-check.mjs` serves the repo, drives the real page in Chrome and prints one JSON report. Set `TWISTY_CHROME` to a Chrome binary. Run `node tools/terrain-check.mjs <probe>[,<probe>] [--legs id,id] [--gpu]`.

- Probes: `legs` (every leg starts, with no page error), `snapshot` (scene fingerprints against `tests/golden/browser-baseline.json`), `raycast`, `surface` (ground height against the drawn ground), `frames` (tile colours from fixed poses), `parts`, `traj`, `gates`, `look`, `shortcuts` (runs its own doubled-back control and fails if the control finds nothing), `runoff`, `fog`, `pages`, `budget`, `mutate`, `atmostate` (the whole light, sky, fog and road dump of a ride at five stations, of the menu preview fresh and after a ride, of the rider showcase and of a `setTimeOfDay` override; pins its own literals and is compared whole against a base worktree), `draws` (draws from the global random stream at leg start, 600 ticks into a ride, in the preview and in the showcase) and `atmo --synthetic` (rides over a two-part dawn-to-rain track, with a `snap` control; reports sky luminance steps, environment bakes, the rain buffer and the grip). The header and the usage message of the tool list the same probes.
- `--gpu` runs a visible Chrome on the real GPU. It exits 3 when the renderer is SwiftShader or llvmpipe. Use it for fog and light checks, which a software renderer can round differently.
- The default run uses SwiftShader and three parallel pages. Pass `--jobs 1` to run one leg at a time.
- `tests/golden/amendments.json` holds the declared changes to a frozen baseline. A leg listed there is compared with the amended value, and the frozen file does not change.

`twistyDev.step(n)` runs n fixed physics ticks of `Game.animate`, one tick of 1/60 s each, with the loop frozen. Call `twistyDev.freeze()` in the same turn as `start()`. Pass `{ render: true }` to draw the frames. 180 ticks are 3 s.

## The world (Tremola)

The world is one continuous ride on real Swiss roads. It streams the land and the road round the bike. The shipped data in `world/` holds one stage, `tremola` (Airolo to the Gotthard summit, 13.3 km, 12 gates).

1. Run `npm run serve`.
2. Open `http://localhost:8080/?world=tremola`. `?world=all` rides every stage in the data folder in order.

`?worldData=<path>` reads the world from another folder. The path must be relative and start with `world/` or `tests/fixtures/world/`. Any other value (a URL, `..`, a leading `/`) stops the load, and the page fetches nothing. A folder that is not the shipped `world/` never submits a time. For the 6 km test fixture with two stages, open `?world=all&worldData=tests/fixtures/world/mini`.

Keys in a world ride:

- `C`: back to the last station passed, on a rolling start. It costs 5 s, and the ride stays valid.
- `R`, on the crash banner or the finish banner: restart the stage from its start. Before a ride is finished, a box asks first. The race and its clock stop while the box is open. `Enter` or YES restarts. `Escape` or CANCEL closes the box, and the ride continues from where it stopped. Any restart also closes the box.
- `M`, on the crash banner: leave the world for the page without `?world`. The same box asks first.
- `P` pauses, `Z` changes the camera.

The guide in the top-right corner (top left on a touch device):

- The minimap shows 1.5 km round the bike with north up. The yellow line is the ride, the grey lines are the side roads near the bike, and the red arrow is the bike on its heading.
- The turn prompt under the map names the next junction within 500 m, with the distance to it: for example `Keep left, 300 m`.
- `Wrong way` shows in the callouts when the bike is more than 40 m from the ride line, or rides against the route at more than 3 m/s for 5 s. If it is still wrong 10 s later, the game puts the bike back at the last station, the same as `C`, with the same 5 s.

`twistyDev.autopilot({ speed: 20 })` rides a world with its own pilot: it slows for each bend.

Probes (set `TWISTY_CHROME` first; every page blocks `cloudfunctions.net`):

```sh
node tools/terrain-check.mjs world-finish,world-budget,world-ground,world-camera,world-hud,world-restart --world tremola --gpu
node tools/terrain-check.mjs world-finish --world tremola --gpu --seed 7 --seeds 3   # three rides, seeds 7 to 9
node tools/terrain-check.mjs world-shots --world tremola --gpu --out /tmp/shots
```

- `world-finish` rides the stage to the finish on five seeds of `Math.random` (the traffic), and all five must finish. `--seed` and `--seeds` change the seeds.
- `world-ground` compares 500 road points and 500 land points with the physics ground, and checks that no land stands above the road.
- `world-hud` needs a ride of two stages. Without `--worldData` it rides the fixture `tests/fixtures/world/mini`, whatever `--world` says.
- `world-restart` checks the `C` restart and the restart box: the race does not move while the box is open, and `Escape` and `Enter` answer it.
- The header of `tools/terrain-check.mjs` lists every world probe. A clean run prints `"failures": []`.
