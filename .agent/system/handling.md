# Handling

How a bike's own data changes the way it rides. The code is in `js/vehicle.js`.

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
