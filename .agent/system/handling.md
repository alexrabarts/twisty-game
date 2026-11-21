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
| `throttle` | `throttleRiseS`, divided (how fast the twist grip opens) | world |
| `gripDry`, `gripWet` | the lean's grip (`lateralFriction`), dry or wet | both |
| `lowside` | `lowsideMargin` (how far over the grip the lean may ask before the bike lowsides) | world |
| `assist` | `lineStrength`, `edgeLeanRate`, `adviceBrake` | world |
| `wheeliePop`, `wheelieLift` | the rider's `wheeliePop` and `wheelieThrottle`, over `Vehicle.popShare` and `liftShare` | both |
| `offroadPace` | `landCapSpeed`, of the world, of `offroad` and of `offroad.top` | world |
| `bar` | `Vehicle.BAR` `counter`, `counterMax`, `intoMax` (drawn only) | both |
| `body` | `Vehicle.BODY` `roll`, `shift` (drawn only) | both |
| `camDistance`, `camSwing` | the chase and high cameras' boom (height and length), and their swing with the lean | both |

Rules:

- **At 1 nothing is scaled and nothing is copied.** `Tuning.view` returns the object it was given and `Tuning.field` the number it was given (not the number x 1). `tests/unit/tuning.test.js` rides the same script with `js/tuning.js` not loaded and requires the same state to the last bit. The frozen defaults (`WorldPhysics`, `Vehicle.BAR`, `Vehicle.BODY`) are never written: off 1, a view is a copy.
- **One function gives the multiplier:** `Tuning.of(id)`. It multiplies two sources: the debug panel's (`Tuning.values`, read only in debug mode) and the rider mode's (`Tuning.mode`, "The rider modes" below).
- **Outside debug mode the stored values are not read.** `Tuning.start({ debug, storage })` reads `localStorage` (`twistyTuning`) only with `debug`.
- **A tuned ride keeps no time.** From the first moment a debug multiplier is off 1 the ride is flagged (`Tuning.ride.tuned`), and it stays flagged after Reset until the next ride begins (`Tuning.beginRide`, at `Game.initializeGameWithLeg` and `initializeGameWithWorld`). `Game.watchTuning` then sets a world's `trusted` to false, the flag of the debug skip (`WorldEnvironment.submitAllowed`), and cancels a classic leg's leaderboard session; a restart of the leg starts none. The HUD shows the "tuned" tag.
- **The text.** `Tuning.text()` gives `twisty tuning v1`, then a line `id = 1.08` for each multiplier off 1. `Tuning.parse(text)` reads it back as `{ values, errors }` and refuses an unknown id, a value outside the row's range, a line that is not `id = number` and an id given twice, each with its line number. "The defaults" below says how to write a block into the defaults.

To add a parameter:

1. Add one row to `Tuning.PARAMS`. For a `WorldPhysics`, `Vehicle.BAR` or `Vehicle.BODY` field this is all.
2. For a number of the bike itself, read it with `this.tuned('<field>')` where the physics uses it. Do not write the scaled number back to the bike.
3. Add its measure to `MEASURES` in `tests/unit/tuning.test.js`: a number that the row moves, and the way it moves. The test fails on a row with no measure.

Left out, because no single number scales them cleanly:

- **How hard the bike turns for a lean.** The turn is `g tan(lean) / v^2`, and the lowside reads the same number as the grip demand. A multiplier on the turn alone drops a bike at full lean. `steerRate` (how fast the lean comes) and `leanMax` are the steering authority.
- **A front and a rear brake.** The code has one brake.
- **The off-road pace of a classic leg.** A leg's run-off values belong to each zone of the leg (`LEG_OFFROAD`).

`leanMax` and `gripDry` both move the lean limit and the lowside limit of a world ride together, by nearly the same amount. On a classic leg they differ: `leanMax` is the lean at which the bike falls, `gripDry` the tyre's hold in the turn.

## The defaults

The owner rode with the tuning panel in the wet on cobbled hairpins and sent this block on 2026-11-21 (his second set of that day): "this feels better as a default. we should adjust max lean as part of how daring each character is".

```
twisty tuning v1
steerRate = 1.50
leanMax = 1.08
brake = 0.70
brakeLean = 0.75
```

It is in the defaults now, so the panel reads 1.00 and Road is all ones at that behaviour:

| Row | Number | Before | Now | Where |
| --- | --- | --- | --- | --- |
| `steerRate` | `WorldPhysics.leanRate` | 1.15 rad/s | 1.725 (written `1.15 * 1.5`, one bit under the literal) | `js/world/physics.js` |
| `steerRate` | the bike's `steeringForce`, before the rider's multiplier | 9.5 | 14.25 | the `Vehicle` constructor |
| `brake` | the bike's `brakeForce`, before the rider's multiplier | 20 m/s^2 | 14 | the `Vehicle` constructor |
| `brakeLean` | `WorldPhysics.trailBrakeFloor` | 0.45 | 0.3375 | `js/world/physics.js` |
| `leanMax` | the lean limit of a rider of middle daring | 1 | 1.08 | `RIDER_LEAN` ("The lean limit by the rider") |

The class table (`BIKE_CLASSES`), `LIGHT_BIKE`, `BIKE_LIMITS` and each rider's `physics` are multipliers of those bases and did not change. A classic leg reads `steeringForce`, `brakeForce` and `maxLeanAngle`, so the legs changed too.

What the new numbers mean in Road:

- The full brake upright in a world is 19.6 m/s^2 x the rider's multiplier (28 before). At the lean limit it is 6.6 (12.6 before): `brakeGain` 1.4 x `trailBrakeFloor`.
- A stop from 25 m/s on the bike with the most power to spare takes 12.7 m (9.0 before): 1.40 to 1.41 of the old distance on every bike, a little under 1 / 0.70 because the engine braking and the air's drag did not change. On a leg it is 1 / 0.70.
- From upright to 30 degrees with a key held takes 0.37 s (0.52 before).

What depended on the old numbers, and what holds now:

- **The speed advice** is a lean (`adviceLeanDeg`), not a brake: the advised speeds did not move. The advice's own braking (`adviceBrake`, 4 m/s^2) plans with no more than the brake has at the lean limit (`Vehicle.worldBrakeLeast`). In Road that least is over 4 on every bike, dry and wet, so the advice brakes as before. It is under 4 only in Rain on wet cobbles (3.6 to 4.7 by the bike), where the advice now starts sooner on the bikes under 4.
- **A scripted rider** counts on the same least brake: `advisedPace` in `tests/helpers/world-rider.js` and the pilot of `tools/autopilot.js` (`ap.brake`, 6, or the bike's least where that is less). Both read the lean limit from the bike (`vehicle.worldPhysics`), so the rider's daring, the mode and the panel are in it.
- **The crew and the cars** read none of these numbers (`LANE_DRIVE`, `CREW_PACES`). The braking a vehicle behind the player allows for (`CONTACT.follow.playerBrake`, 9 m/s^2) is still under the player's brake.
- **The board floors** (`tools/world/floors.mjs`) read a lean and the top speed. They assume a rider who brakes and accelerates without limit, so a weaker brake keeps them valid. The lean and one rule of the floors did change: "The lean limit by the rider" and `.agent/system/world-data.md`, "The floors and the rider's lean".
- **The land's speed rule** did not change (`landCrashSpeed`, `landCrashS`). A full brake on the grass now brings a road bike under it in time from 38 m/s (44 before).
- **The key ease** (`steerKeys`) did not change: the owner rode it at 1.00. Tapped keys rock the lean by 0.6 to 1.7 degrees (under 0.6 before; 5.3 to 6.2 with no ease). Taps of half the time now hold 49 degrees (36 before), so a line is set with taps of a third of the time or less.
- **The legs' frozen golden.** The autopilot's rides of the one leg still bound to `tests/golden/browser-baseline.json` are other rides now (the same outcomes, 2 to 10 steps apart). `tests/golden/amendments.json` declares it: `unbound.traj` and `declared["gates.approaches"]`. The baseline files are not changed.
- **At speed** the world's bike reaches 10 degrees 15% to 25% sooner than a leg's bike (within 10% before), because a leg's steering is a torque and a world's is a rate. The owner left `steerFast` at 1.00.

To apply the next block:

1. Run `node tools/apply-tuning.mjs block.txt` (or pipe the text in). It reads the block with `Tuning.parse` and prints each number the rows scale, its default now and the default to write. It edits no file.
2. Write the numbers. A `world` number is in `js/world/physics.js`. A `bike` number is its base in the `Vehicle` constructor: scale the base, not the class table. Write a product (`1.15 * 1.5`) where the literal is not the same double, so the proof can be to the last bit.
3. Put the block in `BLOCK` and the commit before the change in `BEFORE` in `tests/unit/tuning-defaults.test.js`. It rides the stage and a leg at that commit with the block set through `Tuning` and requires the same ride on the new tree with every multiplier at 1: to the last bit for a rider with no multiplier of their own, and within 1e-9 for the real riders (their own multipliers change the order of two multiplications; the measured difference is 9e-13).
4. Run the tests that read the bike's numbers, and derive again what they pin (the list above). Do not change a test's number without the measure that gives it.

## The lean limit by the rider

A rider's `daring` trait (1 to 5, `CHARACTERS`) sets how far that rider leans the bike. One table holds the rule, `RIDER_LEAN` in `js/vehicle.js`: `{ trait: 'daring', least: 1.02, most: 1.14 }`. `Vehicle.leanOf(character)` is a straight line between the two ends:

| `daring` | 1 | 2 | 3 | 4 | 5 |
| --- | --- | --- | --- | --- | --- |
| multiplier | 1.02 | 1.05 | 1.08 | 1.11 | 1.14 |
| lean limit in a world, dry (degrees) | 51 | 52.5 | 54 | 55.5 | 57 |
| speed held in a 30 m bend, dry (m/s) | 19.06 | 19.58 | 20.13 | 20.69 | 21.29 |
| speed held in a 30 m bend, wet (m/s) | 15.95 | 16.39 | 16.84 | 17.31 | 17.81 |

Before the trait every rider held 18.71 m/s dry and 15.66 wet (50 degrees). Wet is a grip of 0.7.

- **Where it acts.** The multiplier is on the bike's own limit, under the rider mode and the debug panel: `maxLeanAngle` in the constructor (a leg), and `leanCapDeg` in the rider's view of the world (`Vehicle.riderWorld`, a frozen copy that `Vehicle.worldPhysics` hands to `Tuning.view`). `WorldPhysics.leanCapDeg` itself stays 50.
- **The lowside moves with it.** The grip cap, the lean limit and the lowside all read `leanCapDeg`. A rider holds full steering at their own limit, and falls from the same share over it (about 1.3 with the steering held) whatever the daring. With full steering held, a step in grip lowsides only below 0.78 for every rider in every mode (0.78 before), so the hairpin grip bound of `WorldLooks` (0.80) holds.
- **No code names a rider.** A character without the trait is the middle (1.08). A new character gets its limit from the trait alone.
- **The stars.** The handling bar's rider part is the mean of `hairpins` and `daring` (`STAT_BARS`). No star of a shipped rider moved.
- **The crew** read `CREW_PACES` (`corner`, by the `hairpins` trait) and not this table: their cornering pace by daring is the group ride's job.
- **The drawn body lean** (`bodyLean`) is another thing and did not change.
- **The board floors.** The most lean a ride can have is 59.3 degrees (daring 5 in Track), so the floors are worked out at `WorldPhysics.floorLeanDeg` (60), not at the bike's 50. A new rider mode or a wider `RIDER_LEAN` that passes 60 fails `tests/unit/tuning-defaults.test.js`: raise `floorLeanDeg` and import again. `.agent/system/world-data.md`, "The floors and the rider's lean", has the rule and the check.

## The rider modes

`js/ridermodes.js` holds one table, `RiderModes.MODES`. A mode is a row: `{ id, name, tone, assist, hint, tune }`. `assist` is a hairpin assist level (a key of `WorldPhysics.assistLevels`). `tune` holds multipliers by the ids of `Tuning.PARAMS`, and only those that are not 1. The rider chooses the mode; the hairpin assist has no setting of its own any more.

| | Rain | Road | Sport | Track |
| --- | --- | --- | --- | --- |
| hairpin assist | `normal` (1) | `normal` (1) | `low` (0.5) | `off` (0) |
| `topSpeed` | 0.85 | 1 | 1 | 1 |
| `accel` | 0.8 | 1 | 1 | 1 |
| `throttle` | 0.7 | 1 | 1.25 | 1.5 |
| `brake` | 0.9 | 1 | 1.08 | 1.15 |
| `brakeLean` | 1 | 1 | 1.1 | 1.2 |
| `steerRate` | 0.9 | 1 | 1.1 | 1.2 |
| `steerKey` (time: less is quicker) | 1.15 | 1 | 0.9 | 0.8 |
| `leanMax` | 1 | 1 | 1 | 1.04 |
| `lowside` | 1.1 | 1 | 1 | 1 |
| `wheeliePop`, `wheelieLift` | 0.6 | 1 | 1 | 1 |

Measured on the bike with the most power to spare, on the flat (`tests/unit/rider-modes.test.js` holds the order, not the numbers):

| | Rain | Road | Sport | Track |
| --- | --- | --- | --- | --- |
| top speed, m/s | 69.4 | 81.6 | 81.6 | 81.6 |
| 0 to 20 m/s, s | 3.03 | 2.40 | 2.35 | 2.32 |
| stop from 25 m/s, m | 14.0 | 12.7 | 11.8 | 11.1 |
| stop from 25 m/s in the wet, m | 17.3 | 15.7 | 14.6 | 13.8 |
| upright to 30 degrees with a key held, s | 0.42 | 0.37 | 0.33 | 0.32 |
| tapped keys (0.1 s on, 0.1 s off) at 15 m/s: the lean's rock, degrees | 7.6 | 4.8 | 3.3 | 4.2 |

Before the owner's tuning of 2026-11-21 ("The defaults") the stops were 10.0, 9.0, 8.4 and 7.9 m, the lean-in 0.58, 0.52, 0.48 and 0.43 s and the rock 5.3, 6.3, 6.9 and 7.4 degrees. With no key ease the rock is 6.9, 7.6, 8.4 and 9.1 degrees now. Two things to know: in Rain the ease does not lower the rock at this tap (it did not before either), and Track's shorter taps rock the lean more than Road's (1.5 to 2.7 degrees against 0.6 to 1.7 at 0.08 s on, 0.08 s off), because its key ease is 0.8 of Road's on a lean rate of 1.2.

Rules:

- **Road is the bike as it is.** Its `tune` is empty and its assist is the assist's own default, so a ride in Road is the ride with no mode and no tuning loaded, to the last bit. The test rides the same script both ways. Do not give Road a multiplier.
- **Two doors to the physics.** `RiderModes.apply` calls `Tuning.setMode(row.tune)` and `WorldAssist.setLevel(row.assist)`. No code names a mode, and the physics knows nothing of modes.
- **How it stacks.** A number the physics reads is: the rider's own multiplier x the bike's class and weight (both in the number already, `Vehicle.physicsOf`) x the mode's multiplier x the debug panel's multiplier (`Tuning.of`). The lean limit has the rider's daring in it the same way ("The lean limit by the rider"). The mode does not change the stars on the rider card.
- **One board.** A mode never flags the ride (`Tuning.ride.tuned` rises only with a debug multiplier), and a board is not told the mode. For that reason no mode has `topSpeed` or `accel` over 1: the server's time floor is a speed (`functions/lib/boards.js` `FLOOR_SPEED`), and the fastest bike is close under it.
- **Classic legs.** The mode is in force on a classic leg too. A leg reads the rows marked "both" in the table above (`topSpeed`, `accel`, `brake`, `steerRate`, `leanMax`, the wheelie rows). The rows marked "world" and the hairpin assist do nothing there.
- **Margin.** `leanMax` does not make the lowside further away on a world ride: the lean limit and the lowside limit move together. `lowside` does (Rain). On a classic leg `leanMax` is the lean at which the bike falls, so Rain does not lower it.
- **In a ride the mode changes only while the bike stands** (`RiderModes.canChange`: under `STOP_SPEED`, 0.5 m/s). `.agent/system/ui.md`, "The rider mode", has the control, the key and the tag.
- **Storage.** The choice is kept in `localStorage` under `twistyRiderMode`; the default is Road. An old hairpin assist setting (`twistyHairpinAssist`) is moved once: every level becomes Road, the mode is stored and the old key is removed. A rider whose level was not Road's (`off` or `low`) gets one line on the menu that says so. Road was chosen for all levels because it is the only mode with the bike that rider knows.
- **The group's riders** have their own pace (`Traffic.PACES`) and read no mode.

To add a mode: add one row to `RiderModes.MODES`. Use only ids of `Tuning.PARAMS`, each in its row's range, and a key of `WorldPhysics.assistLevels`. For a new `tone`, add its colour to `.hud-mode[data-tone]` and `.mode-btn.on[data-tone]` in `css/ui.css`. The control, the key, the tag and the storage need no change. If a mode needs a number that has no row, add the row to `Tuning.PARAMS` with its measure (above), not a special case.

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

## The rider's fall

In a crash the rider comes off the bike and falls by the kind of the crash. The bike's own crash, slide and restart are not changed: this is drawing, with a small motion of its own for the rider. The code is `Vehicle.beginRiderFall`, `stepRiderFall`, `holdRiderOut`, `riderGroundY` and `drawRiderFall`; the data is three tables at the end of `js/vehicle.js`.

### The cause and the kind

Whoever raises a crash names the class of its cause. No code reads the words of `crashCause`.

- A world crash: the third argument of `Vehicle.worldCrash(cause, fall, why)`.
- A crash set by hand: `crashWhy = '<class>'` within three lines of `crashed = true`.

`Vehicle.CRASH_CAUSES` gives the kind for each class:

| Class | Raised by | Kind |
| --- | --- | --- |
| `grip` | too much lean for the grip (world and leg) | `lowside` |
| `steep`, `offroad`, `sunk` | a slope too steep to hold; too long off a leg's road; under a leg's surface | `lowside` |
| `rear` | the rear came round in a power slide | `highside` |
| `fast` | too fast over the land | `highside` |
| `flip`, `landing` | a wheelie over the back; a jump landed badly | `highside` |
| `wall`, `car`, `rider`, `building`, `obstacle` | rode into a wall or barrier, a car, a rider of the group, a building, a rock or a roadworks machine | `front` |
| `drop`, `water`, `unmapped` | over an edge, into water, off the mapped land | `drop` |
| `stall` | too slow to stay up | `tip` |

Under `RIDER_FALL.tipSpeed` (4 m/s) every crash is the `tip` kind, whatever the cause. A crash with no class, or a class the table does not have, falls as `RIDER_FALL.fallback` (`lowside`).

### The kinds

`Vehicle.RIDER_FALLS` has one row for each kind:

| Kind | What the rider does |
| --- | --- |
| `lowside` | Goes down on the low side onto hip and back with the arms out, and slides feet first beside and behind the bike. |
| `highside` | Is thrown up and over the high side, rolls about the line of travel, and slides on the back. |
| `front` | Goes over the bars in a forward roll, lands on the back, and slides or stops against the thing. He leaves with at most `most` m/s, so he lands near what the bike hit. |
| `drop` | Falls with the bike with loose limbs (`withBike`): he has no slide of his own and stays `off` beside the bike. |
| `tip` | Falls beside the bike on the low side and rolls onto the back. |

The fields of a row:

- `baseS`, `perSpeed`, `mostS`: the keys play over `baseS + perSpeed x speed` seconds, at most `mostS`. A world ride shows a fall for 1.5 to 2.2 s, so `mostS` is at most 1.5.
- `keep`, `most`, `out`, `lift`, `liftPerSpeed`: the throw. He leaves with `keep` of the bike's speed (at most `most`), `out` m/s to the low side (negative: over the high side) and `lift + liftPerSpeed x speed` m/s upward.
- `drag`, `scrub`, `bounce`: on the ground he loses `drag` of his speed and `scrub` m/s each second, so a faster crash slides further. `bounce` is the share of a hard landing he gets back.
- `withBike`, `off`: no slide of his own; `off` is [to the low side, up, ahead] in metres from the bike.
- `keys`: 3 to 5 poses in order. `at` is the share of the time, and the last is 1.
- `sit`: the pose he sits up to when he lies still. With none he lies as the last key.

A pose is `{ body, arms, legs }`, all in degrees:

- `body` is `[pitch, roll, twist, yaw]`. `pitch` tips the spine forward from upright: 90 is face down and head first, -90 is on the back and feet first, more than 180 is a forward roll. `roll` turns him about the line of travel toward the low side. `twist` turns him about his own spine. `yaw` turns him about the world's up.
- `arms` and `legs` are `[the low side's, the high side's]`, each `[swing, spread, bend]`. `swing` brings the limb forward from hanging along the spine: 90 is straight ahead of the chest, 180 is over the head. `spread` takes it out to its side. `bend` is 0 for straight and 1 for folded.

The blend is a smoothstep from the pose he rode in to the first key, then key to key. The limbs are the rig's own (`Vehicle.rigLimb`): a pose gives each limb's end, and the elbow or knee falls where the limb's lengths put it. The same tables pose the stand-in rider and the modelled rider of every character.

### The rules every kind shares

- **His own place and velocity.** He starts where he sat with the speed and the heading the bike rode into the crash with (`rodeSpeed`, `rodeYaw`: a wall hit replaces the bike's own).
- **On the ground.** The ground is the bike's own (`riderGroundY`: the road's height on the road and its verge, the land on the run-off, and past the edge of a drop the land a falling bike comes down on). Each frame the lowest of 11 points of his body (head, chest, pelvis, each limb's middle joint and end) is set on it, and no point is under the ground there.
- **Out of what is solid** (`holdRiderOut`). A wall, a barrier or a parapet is the bike's own zone, read `RIDER_FALL.bodyM` nearer the wall than his middle. A drawn building stops him where he was (`Scenery.houseAt`). The thing the bike hit pushes him out of its circle: whoever raises that crash calls `vehicle.blockRider(x, z, radius)`.
- **His own strand.** `riderProject` looks for him within `nearUnits` pieces of the road from where he was last. The bike's wider search goes over to the next strand in a stack of hairpins.
- **The same crash is the same fall.** Every number comes from the crash. Nothing is drawn by chance, and nothing is allocated while he falls (`Vehicle.riderFallState` makes the vectors once for a bike).
- **The restart.** `Vehicle.endFall` (from `reset`, and when a crashed bike rides again) puts him on the seat and calls `rest()` on each limb, which restores every piece exactly as it was built.

### To add a cause

1. Name its class where the crash is raised: the third argument of `worldCrash`, or `crashWhy` beside `crashed = true`.
2. For a new class, add one line to `Vehicle.CRASH_CAUSES` with its kind.
3. For a thing the rider must stop against, call `blockRider` there.

`tests/unit/rider-fall.test.js` reads every script and fails on a crash with no class and on a class the table does not have.

### To add a kind

1. Add one row to `Vehicle.RIDER_FALLS`: the throw, the friction and 3 to 5 keys.
2. Point a class at it in `Vehicle.CRASH_CAUSES`.

No code names a kind (the tip-over under `tipSpeed` is the one exception, in `Vehicle.riderFallKind`). `tests/unit/rider-fall.test.js` checks the shape of every row, and `tests/unit/world-rider-fall.test.js` rides every kind over the real stage.

### What it does not do

- The group's riders do not fall: a rider that is hit hard shakes and rides on (`.agent/system/world.md`).
- The chase camera follows the bike, not the rider.
- In a stack of hairpins a bike that slides off at speed can go over to the strand above or below. The rider stays on the strand he fell on, so the two end apart. `STRAND_LIMIT` in `tests/unit/world-rider-fall.test.js` holds the count.
