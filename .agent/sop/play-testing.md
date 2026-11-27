# Play-testing with the autopilot

`tools/autopilot.js` is a dev helper. The game does not load it.

1. Run `npm run serve` and open a world ride, for example `http://localhost:8080/?world=tremola`.
2. In the console:

```js
const s = document.createElement('script'); s.src = 'tools/autopilot.js'; document.head.appendChild(s);
twistyDev.autopilot({ speed: 20 });
```

- `speed` is in m/s. The world pilot slows for each bend by itself (`twistyDev.worldPilot`).
- `twistyDev.view(side, up, back, ahead)` pauses the game and looks at the bike from beside the road. Use it to check scenery. `side > 0` is the right of the road.
- `twistyDev.teleport(segment)` moves the bike (`segment` in route units, `route.unitM`).
- `twistyDev.viewPose({ x, z, eyeHeight, bearing, pitch, roll, vfov })` freezes the ride and draws the game from a camera pose, with the bike and the traffic hidden. The photo match uses it: see `.agent/sop/photo-match.md`.

`twistyDev.step(n)` runs n fixed physics ticks of `Game.animate`, one tick of 1/60 s each, with the loop frozen. Call `twistyDev.freeze()` in the same turn as the ride's start. Pass `{ render: true }` to draw the frames. 180 ticks are 3 s.

## The world (Tremola)

The world is one continuous ride on real Swiss roads. It streams the land and the road round the bike. The shipped data in `world/` holds one stage, `tremola` (Airolo to the Gotthard summit, 13.3 km, 12 gates).

1. Run `npm run serve`.
2. Open `http://localhost:8080/` and choose a rider: RIDE opens the tour's map, and a leg on it rides. `?world=tremola` starts the world without the menu, and `?world=all` rides every stage in the data folder in order.

When the world's data does not load (a fetch error, a status other than 200, data not in the world format), an error card opens on the dialog stack: "The world could not load", with Retry (`R`) and Back to menu (`M`). No other ride takes over. `node tools/modal-check.mjs --only menu-world-ride,menu-world-error` proves both menu paths with real clicks.

`?worldData=<path>` reads the world from another folder. The path must be relative and start with `world/` or `tests/fixtures/world/`. Any other value (a URL, `..`, a leading `/`) stops the load, and the page fetches nothing. A folder that is not the shipped `world/` never submits a time. For the 6 km test fixture with two stages, open `?world=all&worldData=tests/fixtures/world/mini`.

Keys in a world ride:

- `C`: back to the last station passed, on a rolling start. It costs 5 s, and the ride stays valid.
- `R`, on the pause panel or the finish banner: restart the stage from its start. Before a ride is finished, a box asks first. The race and its clock stop while the box is open. `Enter` or YES restarts. `Escape` or CANCEL closes the box, and the ride continues from where it stopped. Any restart also closes the box.
- `M`, on the pause panel: leave the world for the page without `?world`. The same box asks first.
- `P` pauses, `Z` toggles the camera between the far chase (the default) and the near chase.

The guide in the top-right corner (top left on a touch device):

- The minimap shows 1.5 km round the bike with north up. The yellow line is the ride, the grey lines are the side roads near the bike, and the red arrow is the bike on its heading.
- The turn prompt under the map names the next junction within 500 m, with the distance to it: for example `Keep left, 300 m`.
- `Wrong way` shows in the callouts when the bike is more than 40 m from the ride line, or rides against the route at more than 3 m/s for 5 s. If it is still wrong 10 s later, the game puts the bike back at the last station, the same as `C`, with the same 5 s.

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
