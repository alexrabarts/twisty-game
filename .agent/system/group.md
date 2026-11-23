# The group ride

In a world the crew rides as a group: `CrewGroup` in `js/traffic.js`. A leg has no group; its crew ride by the legs' own rules.

- **The rules** are one table, `Traffic.GROUP` (`GROUP` in `js/traffic.js`). Every distance, time and chance is there.
- **Each rider's own numbers** are its `group` entry in `CHARACTERS` (`js/vehicle.js`). A character without one rides `GROUP.rider`.
- **The rules read `place` and the numbers, never a name.** `tests/unit/world-group.test.js` fails if a character's name is in the rules' source.
- **The pace by road kind** is the crew's pace as before: the traits by `WorldRoute.kindAt` (`world.md`, "The crew's pace"). The group sets a share of that pace (`ride.factor`) and the least speed of a pass (`ride.floorMs`). The following rule ("Contact") still keeps each rider off the back of what is ahead.
- **The group's pace** is one number, `GROUP.pace` (1.5). A rider of the group rides that share of its traits' pace (`AIMotorcycle.takePace`). It takes its bends, gathers speed and plans its braking for a bend at the square of it, held at `GROUP.gripMost` (1.96, so `LANE_DRIVE.bike` lateral 4 m/s^2 becomes 7.84, about 0.8 g): on the straights it rides at 1.5 times its pace, in the bends at 1.4 times. Its hard braking (6 m/s^2, which the following rule reads for the vehicle ahead) is not raised. `least` and `most` are shares of this pace, so `most` stays the limit. A leg's crew does not read it. Measured on the Tremola slice (the crew from its places, no player, `world-group-pace.test.js`), the riders' mean moving speed: 12.25 and 10.74 m/s at 1, 14.29 and 13.30 at 1.15, 16.17 and 14.66 at 1.3, 19.97 and 18.70 at 1.5 (place 6 out, place 1 out), no rider past its `most`. The owner asked for a quicker group three times (2026-11-23). At 1.5 a rider far ahead brakes from up to about 24 m/s to the player's pace, so the test gives it the time that takes at 5 m/s^2; a player's stand-in rolls about 0.6 m past where it was told to stop, so the hold gaps are measured from where it stands; a rider can stop with its nose on a stop line, which `Roadworks.stopDistance` counts as held up to 1 cm.

## A rider's numbers

| Field | What it is |
| --- | --- |
| `gapS` | The time gap the rider keeps to whoever is next ahead of it (at its own speed, 8 m at least). |
| `gapSpread` | How far the gap wanders: a new gap every 9 s, from this share below `gapS` to twice it above. |
| `least`, `most` | The shares of its own pace it eases to and rises to. `most` is its limit: no rule takes it past this. |
| `wander` | The noise on its pace: a new share within this every 9 s. |
| `spurt` | `{perKm, seconds, gain, country, mountain, hairpin}`: the chance a kilometre of a spell `gain` faster for `seconds`. The chance is weighted by the kind of road. |
| `passPerS` | The chance a second of safe road that it passes one whose place is behind its own. |
| `stop` | `{chance, waitS}`: the chance it pulls in at a stopping place it comes to, and how long it waits (a range). |

| Place | Traits (country mountain hairpins daring) | gapS | spread | least | most | wander | spurt (perKm, s, gain; country/mountain/hairpin) | passPerS | stop |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 5 5 4 3 | 1.6 | 0.4 | 0.85 | 1.2 | 0.04 | none | 0.5 | none |
| 2 | 2 4 3 2 | 2 | 0.4 | 0.85 | 1.2 | 0.05 | 0.5, 15, 1.12; 0/1/0.3 | 0.35 | none |
| 3 | 3 3 3 3 | 1.8 | 0.4 | 0.85 | 1.15 | 0.05 | 0.15, 8, 1.08; 1/1/1 | 0.25 | none |
| 4 | 2 4 5 5 | 1.4 | 0.5 | 0.85 | 1.25 | 0.06 | 0.6, 20, 1.18; 0.1/1/1 | 0.45 | none |
| 5 | 2 2 2 1 | 4.5 | 0.6 | 0.8 | 1.2 | 0.06 | 0.25, 25, 1.15; 1/1/1 | 0.1 | 0.04, 15 to 40 s |
| 6 | 1 1 1 1 | 3 | 0.5 | 0.85 | 1.15 | 0.04 | none | 0.05 | 0.3, 25 to 70 s |

How the numbers follow from the places and the traits:

- The pace on each kind of road comes from the traits: place 1 is quickest on open and mountain road, place 4 round hairpins.
- The nearer the front a rider's place, the higher its `passPerS`.
- Place 5 keeps the longest gap (4.5 s) and the widest spread of it.
- Spells: places 2, 4 and 5. Place 2's are on mountain road, place 4's on mountain road and hairpins, place 5's anywhere. Place 3 has short, rare ones. Places 1 and 6 have none.
- Stops at places: places 5 and 6 only. Place 6 (the lowest traits) stops most and longest.

## The rules

All with `GROUP` numbers.

1. **The line.** The line is the riders on the road and the player, front first. A rider keeps its gap to whoever is next ahead of it: each share its gap is off moves its pace by `line.gain` of that share, between its `least` and its `most`, eased in over 2.5 s. It counts the player only once the player is in front: 4 m past the rider's front, or ahead on its lane line. A player alongside or coming past is not followed, so a rider neither races nor brakes for it. A rider that would pass the one ahead closes up to 8 m first. A rider with nobody within 300 m ahead leads. It waits for the back: as the last on the road drops from 150 m to 450 m behind it, it eases to 0.7 of its pace. The gaps (by speed: tight in hairpins, open on straights), the noise and the spells make the line spread out and bunch up.
2. **The player's pace pulls.** The player is in the line, so the rider behind it keeps its gap to the player. A faster player takes it up to its `most`, and no further. A slow one takes it down to its `least`. Each rider behind does the same to the one ahead of it.
3. **A player who stands or stops.**
   - The player *stands* when it crashed or is slower than 1 m/s. It does not stand in a queue: a vehicle standing within 30 m ahead of it, or a roadworks site within 150 m ahead.
   - The riders up to 400 m behind a standing player stop with it, on their lane, 7 m apart. A rider already nearer stands where it is. One that cannot stop braking at 5 m/s^2 rides on.
   - The player has *stopped* once it crashed or stood for 3 s. The riders ahead of it go to the next stopping place (`env.places`) on their own side, within 1500 m past the room they need to stop. A rider takes the place a rider ahead of it waits in, when that is in reach. Each takes the next slot (`WorldPlaces.stopAt`: off the carriageway, 2.6 m apart).
   - Where there is no place in reach, a rider waits on the roadside, 0.5 m in from the carriageway's edge, on the first straight.
   - A rider moves off its lane into the place over the last 25 m, eased by distance (a smootherstep), so its heading has no step. In a place it stands on the place's ground.
   - The player rides again once it is faster than 3 m/s.
   - The riders that wait pull out once the player is 12 m past their place. They also need: the riders in front of them in the place have gone, every vehicle behind is further off than 20 m plus 4 s of its speed, and nobody is within 12 m ahead. So they fall in behind the player.
   - A rider more than 700 m ahead of the last rider of the line waits the same way for it, for 240 s at most, when the player is not behind that rider (then the next rule holds). It pulls out ahead of the first rider whose place is behind its own once that is within 300 m, so the line keeps its order.
   - **Too far ahead of the player** (`GROUP.ahead`). A rider more than 350 m (`aheadM`) up the road from a riding player pulls in at the next stopping place on its own side within 600 m (`reachM`, past the room it needs to stop), in the next free slot, and waits there. It pulls out once the player is 12 m past it (or after 300 s, `maxS`, if the player never comes), with the same clear road as above, so it falls in behind the player and later passes back toward its place (rule 4). Where no place is in reach it does not wait on the carriageway: it rides no faster than the player (`ride.easing`) and looks again each second, until it is back within 350 m or a place comes in reach. 350 m: at the group's pace (about 14 m/s moving on the Tremola slice) it is 25 s of road, two to three legs of a hairpin flight, about as far as the player sees a rider on most of the slice; the leader already eases to 0.7 of its pace as the back drops from 150 m to 450 m behind it (rule 1), so a rider at 350 m is one that got away.
   - A rider that waits on the roadside (no place in reach) stands on the carriageway's edge: it stays in the line and in traffic's queue, so what comes up behind it follows it and stops. (Before, every waiting rider counted as off the road, and a rider that came up behind a roadside wait rode into it: an overlap of 0.8 m in a whole ride of the crew.)
4. **Passes back toward their places.** A rider passes the vehicle next ahead of it (a rider or the player) only when all of these hold:
   - its own place is ahead of that one's (the player's place is its character's `place`);
   - it can ride 2 m/s faster than it within its `most`;
   - the vehicle ahead of that one is 25 m or more further on;
   - no other pass is within 120 m;
   - the road is safe for the whole pass (rule 5).
   Then it passes with its `passPerS` chance a second. It swings 2.2 m toward the centre line over 16 m, holds there until it is 5 m past the other's front, and swings back over 16 m. The other eases to 0.9 of its pace. A rider that sees one close behind it that would pass it, at the start of a 100 m straight, also eases for 8 s to let it by. A pass that runs 60 m past its plan drops back behind the other before it swings in. One that meets an unsafe road while still behind swings back in.
5. **A pass is only where it is safe.** Every bend along the whole pass is gentler than 0.012 per metre, with no hairpin (`kindAt` hairpin share 0.02 or less), checked every 5 m. No roadworks single lane is in it or within 60 m past it, and the rider is not in a single lane. Nothing comes the other way within the pass, plus what such a vehicle covers at 12 m/s meanwhile, plus 60 m. The player is passed only at 4 m/s or more and on its lane line.
6. **The slowest rider stops now and then.** As it comes to each stopping place on its side, a rider with `stop` draws once. On a hit it pulls in, waits its `waitS`, and pulls out when the road behind it is clear. It catches up because the leader waits for the back (rule 1) and, when it is far behind, the riders ahead wait for it (rule 3).
7. **The crew still obey the roadworks.** The lights and queues are as before (`Traffic.holdForRoadworks`). A rider off the road is in no queue. A rider going into or standing in a place follows only those beside the road with it, and nothing on the road follows it. A rider pulling out follows what is on the road ahead.
8. **Crew riders still do not fall**, and contact is as before (`world.md`, "Contact"). A rider waiting in a place is solid. `Traffic.clearRiders` (a restart in place) leaves a rider in a place where it is. A rider it moves rides on its lane, in no pass or wait.

## Randomness and the seed

Each rider has its own stream (mulberry32), seeded from the world's `groupSeed` when set. Otherwise the seed comes from the riders' own pace draws, so the group adds no draw from `Math.random`. The draws are the noise every 9 s and, once a second, a spell, a pass and a stop at a place. The same seed rides the same ride (`tests/unit/world-group.test.js`). The per-frame work allocates nothing; the group's line and its entries are built once and reused.

## Proofs

- `tests/unit/world-group-pace.test.js` rides the slice with no player from the riders' places and prints each rider's mean speed (PACE), holds that no rider rides past its `most` and that none overlaps, that every rider's pace is its traits' times `GROUP.pace`, and the too-far-ahead rule: with a player at 6 m/s, riders more than 350 m ahead pull in at a place on their own side, off the carriageway, and pull out only once the player is past, behind it; with no place in reach they ride at the player's pace and none waits on the road.

- `tests/unit/world-group.test.js` rides the real Tremola slice at 60 frames a second:
  - the numbers;
  - the line forming from the reverse of the places, and holding near place order;
  - spread and bunching;
  - the player's pull, never past a rider's `most`;
  - a player who stops, then rides on;
  - where a pass may start, and every frame of whole rides with the world's car;
  - the slowest rider's stops;
  - the same seed;
  - no red light crossed.
- `tests/unit/world-contact.test.js` still holds every contact rule with the group riding. Its careful player does not stop for a rider standing in a place.
- `node tools/terrain-check.mjs world-group-shots --world tremola --gpu [--out <dir>]` saves pictures (the start, a straight, a hairpin from the chase view and from above, a stopping place with the riders waiting, from the chase view and from across the road) with each rider's state and place across the road. The default folder is `~/Library/Caches/twisty-world/group-shots`.

## What it does not do

- A rider waits only on its own side of the road. It never crosses the oncoming lane to a place on the far side.
- The pace and the too-far-ahead distance are the same on every road: a world with longer sight lines does not give its riders more room.
- The slowest rider's catch-up after its own stop is slow where the leader's ease (0.7 of its pace) is about the slowest rider's `most`: after a stop at s 10 693 on the Tremola slice it was still 438 m behind the next rider 205 s later (466 m when it rode on). The line only waits for it from 700 m.
- The roadside wait is on the carriageway's edge, not off it. A player passes it on its own line.
- A pass is always on the centre line's side. Two riders never pass at once within 120 m.
