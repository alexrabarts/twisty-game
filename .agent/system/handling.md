# Handling

How a bike's own data changes the way it rides. The code is in `js/vehicle.js`.

## The tuning

`js/tuning.js` holds one table (`Tuning.PARAMS`) of the handling's parameters. Each row is a multiplier on the default: 1.00 is the game as it is, and the table itself changes no default. The panel of debug mode moves the multipliers while the owner rides (`.agent/system/ui.md`, "The tuning panel"), and the owner sends the values back as text to be written into the defaults.

A row is `{ id, label, hint, group, min, max, step, scales }`. `scales` lists the numbers the row multiplies, each `{ on, field, inverse }`:

| `on` | The number | How the physics reads it |
| --- | --- | --- |
| `world` | A field of `WorldPhysics`; a path for a nested one (`steerKeys.keyS`, `offroad.top.landCapSpeed`). | `Vehicle.worldPhysics` is `Tuning.view('world', ...)`. A row needs no other code. |
| `bar`, `body` | A field of `Vehicle.BAR`, `Vehicle.BODY`. | `Vehicle.barRule()`, `Vehicle.bodyRule()` (the same `Tuning.view`). |
| `bike` | One of the bike's own numbers (`maxSpeed`, `acceleration`, `brakeForce`, `steeringForce`, `maxLeanAngle`, `wheeliePopMult`, `wheelieThrottleMult`). | `this.tuned(field)` where the number is used. The character's and the bike's multipliers are in the number already, so they stay on top. |
| `grip` | `dry` or `wet`: the lean's grip. Wet is any weather that takes grip. | `Vehicle.gripTune()`. |
| `camera` | `distance` or `swing` of the chase camera. | `Game.tune('camera', field, value)`. |

`inverse: true` divides, for a number where less is more (a turn radius). `world: true` is set by the table itself for a row that scales only `WorldPhysics` fields: a classic leg does not read it.

The rows:

| id | Scales | Ride |
| --- | --- | --- |
| `steerRate` | `leanRate`; the bike's `steeringForce` | both |
| `steerFast` | `steerSpeed` (the speed from which the lean rate falls) | world |
| `steerSlow` | `lockRadius`, divided (the turn at full lock under `turnBlendSpeed`) | world |
| `pickUp` | `pickUpBoost` | world |
| `selfRight` | `selfRighting` | world |
| `leanMax` | `leanCapDeg`; the bike's `maxLeanAngle` | both |
| `steerKey` | `steerKeys.keyS`, `steerKeys.featherS` | world |
| `brake` | the bike's `brakeForce` (the front and the rear are one number) | both |
| `brakeLean` | `trailBrakeFloor` | world |
| `engineBrake` | `engineBrake`, `engineBrakeMax` | world |
| `accel` | the bike's `acceleration` | both |
| `topSpeed` | the bike's `maxSpeed`, where the speed is held to it | both |
| `gripDry`, `gripWet` | the lean's grip (`lateralFriction`), dry or wet | both |
| `assist` | `lineStrength`, `edgeLeanRate`, `adviceBrake` | world |
| `wheeliePop`, `wheelieLift` | the rider's `wheeliePop` and `wheelieThrottle`, over `Vehicle.popShare` and `liftShare` | both |
| `offroadPace` | `landCapSpeed`, of the world, of `offroad` and of `offroad.top` | world |
| `bar` | `Vehicle.BAR` `counter`, `counterMax`, `intoMax` (drawn only) | both |
| `body` | `Vehicle.BODY` `roll`, `shift` (drawn only) | both |
| `camDistance`, `camSwing` | the chase and high cameras' boom (height and length), and their swing with the lean | both |

Rules:

- **At 1 nothing is scaled and nothing is copied.** `Tuning.view` returns the object it was given and `Tuning.field` the number it was given (not the number x 1). `tests/unit/tuning.test.js` rides the same script with `js/tuning.js` not loaded and requires the same state to the last bit. The frozen defaults (`WorldPhysics`, `Vehicle.BAR`, `Vehicle.BODY`) are never written: off 1, a view is a copy.
- **One function gives the multiplier:** `Tuning.of(id)`. It multiplies two sources: the debug panel's (`Tuning.values`, read only in debug mode) and a rider mode's (`Tuning.mode`, null today).
- **Outside debug mode the stored values are not read.** `Tuning.start({ debug, storage })` reads `localStorage` (`twistyTuning`) only with `debug`.
- **A tuned ride keeps no time.** From the first moment a debug multiplier is off 1 the ride is flagged (`Tuning.ride.tuned`), and it stays flagged after Reset until the next ride begins (`Tuning.beginRide`, at `Game.initializeGameWithLeg` and `initializeGameWithWorld`). `Game.watchTuning` then sets a world's `trusted` to false, the flag of the debug skip (`WorldEnvironment.submitAllowed`), and cancels a classic leg's leaderboard session; a restart of the leg starts none. The HUD shows the "tuned" tag.
- **The text.** `Tuning.text()` gives `twisty tuning v1`, then a line `id = 1.08` for each multiplier off 1. `Tuning.parse(text)` reads it back as `{ values, errors }` and refuses an unknown id, a value outside the row's range, a line that is not `id = number` and an id given twice, each with its line number. To write tuned values into the defaults, parse the text and multiply each field of the row's `scales` by the value (divide for `inverse`).

To add a parameter:

1. Add one row to `Tuning.PARAMS`. For a `WorldPhysics`, `Vehicle.BAR` or `Vehicle.BODY` field this is all.
2. For a number of the bike itself, read it with `this.tuned('<field>')` where the physics uses it. Do not write the scaled number back to the bike.
3. Add its measure to `MEASURES` in `tests/unit/tuning.test.js`: a number that the row moves, and the way it moves. The test fails on a row with no measure.

Rider modes (Rain, Road, Sport, Track) reuse the table. A mode is a set of multipliers over the same ids: `Tuning.setMode({ steerRate: 1.1, brake: 0.9 })`, and `Tuning.setMode(null)` for none. It needs no change to the physics, it is read in every mode of the page, and it does not flag the ride. The panel's multiplier stays on top of the mode's. Show the mode in the HUD's `#hudMode` slot.

Left out, because no single number scales them cleanly:

- **How hard the bike turns for a lean.** The turn is `g tan(lean) / v^2`, and the lowside reads the same number as the grip demand. A multiplier on the turn alone drops a bike at full lean. `steerRate` (how fast the lean comes) and `leanMax` are the steering authority.
- **A front and a rear brake.** The code has one brake.
- **The off-road pace of a classic leg.** A leg's run-off values belong to each zone of the leg (`LEG_OFFROAD`).

`leanMax` and `gripDry` both move the lean limit and the lowside limit of a world ride together, by nearly the same amount. On a classic leg they differ: `leanMax` is the lean at which the bike falls, `gripDry` the tyre's hold in the turn.

## A wheelie by the bike

Two facts of each bike shape its wheelie. They are in the catalogue entry (`BIKE_MODELS`) and in each procedural kind (`Vehicle.BIKES`). No code names a bike: one rule reads the two facts.

| Fact | Meaning | How to set it for a new bike |
| --- | --- | --- |
| `kg` | The weight of the bike, ready to ride. | The real figure. 145 kg or less is wholly light, 250 kg or more is wholly heavy. |
| `spare` | The power the bike has to spare at speed, 0 to 1. | About 1.75 x the peak kW for each kg of the bike and an 80 kg rider, at most 1. Use 0 for a bike with no clutch and a belt that varies its own gearing (the scooter). |

A bike that names no facts gets `Vehicle.WHEELIE.usual`.

The rule (`Vehicle.wheelieOf`, `Vehicle.liftShare`, `Vehicle.popShare`; the numbers are in `Vehicle.WHEELIE`):

- **Lift share.** `liftShare = spare / (spare + (speed / fadeSpeed)^2)`. It is 1 at a standstill and falls with the speed. A bike with less power to spare loses it at a lower speed. A bike with `spare` 0 has none at any speed.
- **Throttle.** The throttle's lift in a wheelie is the rider's `wheelieThrottle` x the lift share. The front stays up only while the lift share is about 0.45 or more at full throttle.
- **Pop.** The pop (the wheelie key) is the rider's `wheeliePop` x the weight part x (`tug` + (1 - `tug`) x the lift share). The weight part is `lightPop` for a wholly light bike and `heavyPop` for a wholly heavy bike up to `weightFrom` m/s. It goes to 1 by `weightTo` m/s, because at speed the power lifts the front, not the weight. `tug` is the rider's pull on the bars, which needs no drive.

The results, which `tests/unit/wheelie-pop.test.js` holds over the real catalogue:

- The scooter (`spare` 0) gets a bump of about 4 degrees at any speed. The bump falls back with the throttle open.
- The trail single (light, `spare` 0.1) pops the highest at low speed and holds a wheelie at 8 m/s. It cannot hold one at 25 m/s or more.
- A heavy bike pops a little lower at low speed. A bike with much power holds a wheelie at 40 m/s on the throttle.

The classic legs and a world ride use the same rule: both call `Vehicle.updateWheelie`. The scoring and the flip crash do not read the facts. The riders of the group do not wheelie. The rider select has no wheelie bar (`STAT_BARS`), so no star reads the facts.

## Degrees of off-road capability

One fact of a bike says how much of an off-road bike it is on a world's land: `offroad`, 0 to 1, in the catalogue entry (`BIKE_MODELS`) and in each procedural kind (`Vehicle.BIKES`). No code names a bike. A new entry gets its capability from that number alone.

| `offroad` | Meaning | How to set it for a new bike |
| --- | --- | --- |
| none, or 0 | A road bike. It reads the world's own land values (`WorldPhysics.land*`). | Leave it out. |
| about 0.2 | Wide bars and little else: road tyres, short travel. | A scrambler. |
| 0.5 to 0.6 | A big adventure bike: long travel, a 21 inch front, but heavy. | The heavier the bike, the lower. |
| about 0.75 | A light adventure bike on dual-sport tyres. | |
| 1 | It rides most of the map: knobbly tyres, long travel, about 150 kg. | The trail single. |

The rule (`Vehicle.landValues`; the numbers are in `WorldPhysics.offroad` and `WorldPhysics.landCover`):

- **The least.** Each land value moves from the world's own toward `WorldPhysics.offroad`'s by the trait, on a straight line. This is what an off-road bike had before the degrees (c111f28), so no bike is under it.
- **The top.** Each value then moves on from the least toward `offroad.top`'s by the trait to the power `rise` (2). At trait 1 the bike has the top values. At trait 0.5 it has a quarter of the step.
- **The ground.** The two values that set the pace (`offroad.pace`: the speed cap and the rolling drag) take the second step by the ground too. The land cover under the bike gives a share (`landCover[class].pace`: grass 1, scree 0.55, rock 0.4, open forest 0.4, snow 0.35, forest 0.15). The slope gives a share: all of it up to `slopeFrom` (0.2, rise over run), none from `slopeTo` (1.0). On steep or rough ground every off-road bike is back at its least. The cover class is the tile data's (`WorldGround.coverAt`, the cell that colours the land). The slope is the drawn ground's (`Vehicle.worldLand`).
- **Not by the ground:** traction, brake grip, lean grip, the crash speed (`landCrashSpeed`) and the steepest land the bike holds (`landSteepSlope`). They follow the trait only.
- **The slope takes speed, not the bike.** Gravity acts along the land. The pace falls as the slope rises. Past the bike's own `landSteepSlope` for `landSteepS` it falls ("Rode onto a slope too steep to hold"). A road bike's limit is 0.85, the top bike's 1.5.
- **The pace is the bike's at once.** No time on the land is waited for. A cut across a hairpin is held by the cut rule (`.agent/system/world.md`, "A cut is not counted").
- **The power slide** is as before (`.agent/system/world.md`, "Off the road"). It reads the trait.

The results, from `tests/helpers/world-offroad-measure.js` on level ground at full throttle (m/s; the bank is the steepest 3 m bank climbed from the level pace, the slope is the steepest climbed without end, both rise over run). `tests/unit/world-offroad-bikes.test.js` holds the order by trait and each "before" as the least, over the real catalogue.

| Bike | Trait | Grass | Scree | Rock | Forest | Snow | Bank | Slope | Crash speed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Trail single | 1 | 16.8 (6.4) | 12.1 | 10.5 | 8.0 | 10.0 | 1.45 (0.75) | 0.9 (0.6) | 28 (12) |
| Small adventure single | 0.75 | 11.5 (5.7) | 8.9 | 8.1 | 6.6 | 7.8 | 1.2 (0.6) | 0.7 (0.5) | 21 (12) |
| Adventure triple | 0.6 | 9.0 (5.3) | 7.4 | 6.8 | 5.9 | 6.6 | 1.0 (0.55) | 0.6 (0.45) | 17.8 (12) |
| Big adventure tourer | 0.5 | 7.7 (5.1) | 6.5 | 6.1 | 5.5 | 6.0 | 0.9 (0.6) | 0.7 (0.55) | 16 (12) |
| Scrambler | 0.2 | 4.7 (4.3) | 4.5 | 4.5 | 4.4 | 4.4 | 0.45 (0.4) | 0.4 (0.35) | 12.6 (12) |
| A road bike | 0 | 3.8 (3.8) | 3.8 | 3.8 | 3.8 | 3.8 | 0.35 (0.35) | 0.3 (0.3) | 12 (12) |

The number in brackets is the same bike before the degrees. Before, the pace was the same on every cover.

- The slope climbed without end is the engine's as much as the trait's: the big adventure tourer has more power than the adventure triple and out-climbs it there, as it did before. The bank, the pace and the crash speed are in the order of the trait.
- Nobody rides water, a wall, a drop, a drawn building or the land past the detailed tiles (`.agent/system/world.md`, "Off the road").

What the drawn bike shows, with no change to the physics:

- The bump and the rock (`landBumpM`, `landWobbleDeg`) scale with the cover for an off-road bike (`landCover[class].rough`: rock 2, scree 1.7).
- The rider of an off-road bike stands on the pegs on the land from `landStandSpeed` (`landStand` x the trait of the stand over a jump).
- Any bike on the land from `landDustSpeed` throws a small dust puff every `landDustS` (`Game`).

The classic legs keep `LEG_OFFROAD`: a leg has no land cover and no drawn slope to read.
