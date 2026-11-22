# Graphics levels

The quality ladder is in `js/quality.js`. It has one table of graphics levels, `Quality.LEVELS`. Each level is the full set of settings that the game draws with. The frame time moves the game up and down the ladder. `Game.applyQuality` is the only code that puts a level in force.

## The levels

The lowest level is index 0. The top level is the game as it was drawn before the ladder.

| Level | `pixelRatio` | `shadowMap` | `msaa` | `bloom` | `treeShare` |
|---|---|---|---|---|---|
| 0 Lowest | 0.75 | 0 (none) | 0 | off | 0.4 |
| 1 Low | 1 | 0 (none) | 0 | on | 0.6 |
| 2 Medium | 1.25 | 1024 | 0 | on | 0.8 |
| 3 High | 1.5 | 2048 | 4 | on | 1 |
| 4 Full | 2 | 2048 | 4 | on | 1 |

- `pixelRatio` is a cap. The game never draws more device pixels than the screen has.
- `shadowMap` is the size of the sun's shadow map. 0 turns the shadows off. Every material compiles again once at that change.
- `msaa` is the sample count of `Graphics.sceneTarget`. A change makes the target again on the next frame (`Graphics.setQuality`).
- `bloom` off skips the five bloom passes. The composite then adds no bloom.
- `treeShare` is the share of each world tile's trees that the game draws. Each tree mesh is in order from the bike (`Scenery.buildTile`), so the far trees go first. `Game.thinTrees` changes only the instance count. A tree is never solid. A classic leg has its own trees and does not use it.
- `Quality.FIELDS` holds the permitted values. A lower level never has more of a setting than a higher level. `tests/unit/quality.test.js` holds both rules.

To add a setting, add a column to every level and a row to `Quality.FIELDS`, then read it in `Game.applyQuality`. Keep the top level equal to the game before the change.

## What a world frame costs

Measured with `node tools/terrain-check.mjs world-quality --world tremola --gpu --phone --measure --rounds 5` at s 1319 in the chase view. `--phone` is a 390 x 844 view at device pixel ratio 3, touch, and the CPU 4 times slower (Chrome's CPU throttle). Chrome has no GPU throttle, so the GPU was an Apple M-series. The probe turns one part off at a time against the full frame. The GPU time comes from a timer query. The numbers drift by about 0.5 ms from run to run, so read only the order.

| Part off | GPU ms saved (of about 4.8) | CPU ms saved (draw submit, of about 4.8) | Look lost |
|---|---|---|---|
| Pixel ratio 2 to 1.5 / 1 / 0.75 | 1.0 / 1.8 / 2.3 | 0.2 / 0.2 / 0.8 | soft edges, then blocks |
| MSAA 4 to 0 | 0.9 to 1.9 | 0 | jagged edges |
| Houses | 1.6 | 0.1 | the villages (not in the ladder: `js/world/scenery.js`) |
| Trees | 1.0 | 0.1 | the near forest |
| Bloom | 0 to 1.1 | 0 | the glare round the sun and bright paint |
| Far land | 0.6 | 0 | the mountains (not in the ladder) |
| Haze | 0.5 | 0 | the blue of distant land (not in the ladder: `world-haze` holds it) |
| Shadows | 0.3 | 0.5 to 0.7 | the bike's and the cars' shadows |
| Shadow map 2048 to 1024 | 0.3 | 0.5 | softer shadow edges |

The full frame was about 12 ms: update 1 ms, draw submit 4.8 ms, GPU 4.8 ms. The CPU draw submit is as large as the GPU time. It falls with the draw calls (about 620 with traffic in view, about 85 of them the shadow pass). The ladder thus drops the shadows at level 1.

The order of the ladder is the cost saved for the look lost: first the pixel ratio (the largest saving, and a phone screen hides it), then the samples and the shadow map, then the shadows and the far trees, then the bloom.

Frame time at each level, same place and page (`world-quality --phone`, no `--measure`):

| Level | Drawing buffer | GPU ms | Frame ms |
|---|---|---|---|
| 4 Full | 780 x 1688 | 4.6 | 12.7 |
| 3 High | 585 x 1266 | 2.6 | 10.0 |
| 2 Medium | 487 x 1055 | 2.7 | 10.6 |
| 1 Low | 390 x 844 | 2.5 | 8.2 |
| 0 Lowest | 292 x 633 | 1.7 | 7.7 |

`--out <dir>` saves a picture of each level at that place.

## How the frame time steps the ladder

`Game.adaptResolution(now)` runs at the top of every frame. It gives the ladder two times:

- the frame time: the time since the last frame. This is what the rider sees.
- the work: the time from the start of the last frame to the end of its draw (`Graphics.renderedAt`). A screen at its refresh rate hides the frame time below the refresh. The work shows if there is headroom.

`QualityLadder.sample` reads the frames in windows of 1 s (`Quality.RULES.windowMs`), by the median frame:

- **Down**: the median is over 20.8 ms (48 fps) in 2 windows in sequence. The ladder goes one level down.
- **Up**: the median is at the budget (16.7 ms, plus 10%) and the median work is under 60% of the budget, in 8 windows in sequence. The ladder goes one level up. Up is slow and down is quick, because a dropped frame costs more than a sharper frame gains.
- **Hold**: a median between the two holds the level.
- **Grace**: the ladder reads nothing for 3 s after a level change. It reads nothing for 2 s after a frame over 100 ms, after a frame in which the streamer built for more than 6 ms (`streamer.stats.frameBuildMs`), after a pause, and in the first 4 s of a ride (`adaptGraceUntil`). Thus a tile-load spike or a shader compile never counts as a slow window.
- **Retry**: a level that fails within 10 s of a step up to it is blocked for 60 s. Each failure doubles the block, to a maximum of 8 min. Thus a level that is just too slow is not tried again and again.

The rules are data in `Quality.RULES`.

## The start level

`Quality.startLevel(Quality.device(window))` reads the first row of `Quality.START` that agrees with the device:

| Touch | Short screen side | Logical CPUs | Memory | Level |
|---|---|---|---|---|
| yes | 500 px or less | 4 or fewer | | Low |
| yes | 500 px or less | | | Medium |
| yes | | | | High |
| | | 2 or fewer | | Medium |
| | | | 2 GB or less | Medium |
| | | | | Full |

A phone thus never starts at the top. It goes up only when the frame time shows headroom. A browser that does not give the CPU count counts as few CPUs.

## Fix a level, or let the frame time choose

The ladder is one object, `game.quality`:

- `quality.fix(level)` holds a level (an index or an id). The frame time does not move it.
- `quality.release()` gives the level back to the frame time ("Auto"). It starts from the level that was fixed.
- `quality.level` is the level in force. `quality.isFixed` tells if a caller fixed it.

In debug mode (`?debug`), the HUD shows the level (`Q3 High (auto)`). The tuning panel (T) has a Graphics row: − and + step through Auto and each level. A fixed level is not a tuning. The ride keeps its time. A graphics menu with an "Auto" preset uses `fix` and `release` in the same way.

## What was not checked

- No real phone was used. The CPU throttle makes the CPU slower, but the GPU was a computer's GPU. A phone GPU is slower and pays more for each pixel, the samples and the shadow map. Thus the measured order of the pixel ratio, the samples and the shadow map is a lower bound of their real cost.
- A screen in low-power mode (30 Hz) gives a frame time of 33 ms. The ladder then steps down to the lowest level, because it cannot tell that from a slow GPU.
