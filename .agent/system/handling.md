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
