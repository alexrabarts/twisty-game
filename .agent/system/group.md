# The group ride

In a world the crew rides as a group: `CrewGroup` in `js/traffic.js`. A leg has no group; its crew ride by the legs' own rules.

- **The rules** are one table, `Traffic.GROUP` (`GROUP` in `js/traffic.js`). Every distance, time and chance is there.
- **Each rider's own numbers** are its `group` entry in `CHARACTERS` (`js/vehicle.js`). A character without one rides `GROUP.rider`.
- **The rules read `place` and the numbers, never a name.** `tests/unit/world-group.test.js` fails if a character's name is in the rules' source.
- **The pace by road kind** is the crew's pace as before: the traits by `WorldRoute.kindAt` (`world.md`, "The crew's pace"). The group sets a share of that pace (`ride.factor`) and the least speed of a pass (`ride.floorMs`). The following rule ("Contact") still keeps each rider off the back of what is ahead.
- **The group's pace** is `GROUP.pace` (1.9; 1.6 before 2026-11-26). A rider of the group rides that share of its traits' pace (`AIMotorcycle.takePace`; a world's crew rides at 0.4 of the legs' pace, `trafficSpeedScale`, so this share is what sets its speed on the straights). It takes its bends and gathers speed at the square of it, held at `GROUP.gripMost` (2.45, so `LANE_DRIVE.bike` lateral 4 m/s^2 becomes 9.8, 1 g; 0.9 g before). It brakes hard at `GROUP.brakeMs` (7.5 m/s^2; 6 for every other bike), which the following rule reads for it as the vehicle ahead, and plans its braking at `GROUP.planMost` (7.35 m/s^2), under its hard braking: a plan harder than the hard braking asks for room the rider cannot stop in. `least` and `most` are shares of this pace, so `most` stays the limit. A leg's crew does not read it. The owner asked for a faster group (2026-11-26): a lone rider at 0.9, 1 and 1.2 g rode the Tremola at the same moving speed (19.3 to 19.8 m/s), so the bends did not bind and the pace share did; at 1.9 and 1 g the group rides about 10 % quicker moving ("Pulling over to wait" has the numbers).

A rider takes its bends at its share of its pace (`factor`) to the power `GROUP.bendPower` (0.5; 2 before 2026-11-25, then 1), so a rider that follows at 0.85 of its pace takes its bends at 0.92 of its grip. The 1 g cap (`gripMost`) still holds every bend.

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
| 5 | 2 2 2 1 | 4.5 | 0.6 | 0.8 | 1.2 | 0.06 | 0.25, 25, 1.15; 1/1/1 | 0.1 | 0.03, 8 to 20 s |
| 6 | 1 1 1 1 | 3 | 0.5 | 0.85 | 1.15 | 0.04 | none | 0.05 | 0.12, 10 to 25 s |

How the numbers follow from the places and the traits:

- The pace on each kind of road comes from the traits: place 1 is quickest on open and mountain road, place 4 round hairpins.
- The nearer the front a rider's place, the higher its `passPerS`.
- Place 5 keeps the longest gap (4.5 s) and the widest spread of it.
- Spells: places 2, 4 and 5. Place 2's are on mountain road, place 4's on mountain road and hairpins, place 5's anywhere. Place 3 has short, rare ones. Places 1 and 6 have none.
- Stops at places: places 5 and 6 only. Place 6 (the lowest traits) stops most and longest. The owner decided (2026-11-25) that place 6 stopped too often and too long (at 0.3 of the places, 25 to 70 s): now 0.12 and 10 to 25 s.

## The rules

All with `GROUP` numbers.

1. **The line.** The line is the riders on the road and the player, front first. A rider keeps its gap to whoever is next ahead of it: each share its gap is off moves its pace by `line.gain` of that share, between its `least` and its `most`, eased in over 2.5 s. It counts the player only once the player is in front: 4 m past the rider's front, or ahead on its lane line. A player alongside or coming past is not followed, so a rider neither races nor brakes for it. A rider that would pass the one ahead closes up to 8 m first. A rider more than 300 m behind the next rider ahead rides at its `most` until it is within 300 m. A rider with nobody within 300 m ahead leads. It waits for the back: as the last on the road drops from 250 m to 600 m behind it, it eases to 0.8 of its pace, and on to 0.65 as it drops on to 900 m (`farM`, `farShare`), so the front pulls over far less ("Pulling over to wait"). The gaps (by speed: tight in hairpins, open on straights), the noise and the spells make the line spread out and bunch up.
2. **The player's pace pulls.** The player is in the line, so the rider behind it keeps its gap to the player. A faster player takes it up to its `most`, and no further. A slow one takes it down to its `least`. Each rider behind does the same to the one ahead of it.
3. **A player who stands or stops.**
   - The player *stands* when it crashed or is slower than 1 m/s. It does not stand in a queue: a vehicle standing within 30 m ahead of it, or a roadworks site within 150 m ahead.
   - The riders up to 400 m behind a standing player stop with it, on their lane, 7 m apart. A rider already nearer stands where it is. One that cannot stop braking at 5 m/s^2 rides on.
   - The player has *stopped* once it crashed or stood for 3 s. The riders ahead of it that are far ahead of it ("Pulling over to wait"; the others ride on at a crawl until they are) go to the next stopping place (`env.places`) on their own side, within 1500 m past the room they need to stop. A rider takes the place a rider ahead of it waits in, when that is in reach. Each takes the next slot (`WorldPlaces.stopAt`: off the carriageway, 2.6 m apart).
   - Where there is no place in reach, a rider does not wait: it rides on (at a crawl ahead of a stopped player) and looks again each second until a place comes in reach. (Before 2026-11-27 it waited on the roadside, 0.5 m in from the carriageway's edge, on the first straight: in its lane on the open road, which the owner ruled out.)
   - A rider moves off its lane into the place over the last 25 m or more (longer at speed: "Sideways moves"), eased by distance (a smootherstep), so its heading has no step. In a place it stands on the place's ground.
   - The player rides again once it is faster than 3 m/s.
   - The riders that wait pull out once the player is 12 m past their place. They also need: the riders in front of them in the place have gone, every vehicle behind is further off than 20 m plus 4 s of its speed, and nobody is within 12 m ahead. So they fall in behind the player.
   - A rider more than 700 m ahead of the last rider of the line waits the same way for it once it is also far ahead of it ("Pulling over to wait"), for 240 s at most, when the player is not behind that rider (then the next rule holds). It pulls out ahead of the first rider whose place is behind its own once that is within 300 m, so the line keeps its order.
   - **Too far ahead of the player** (`GROUP.ahead`). A rider more than 350 m (`aheadM`) up the road from a riding player rides no faster than the player; once it is also far ahead of it ("Pulling over to wait") it pulls in at the next stopping place on its own side within 600 m (`reachM`, past the room it needs to stop), in the next free slot, and waits there. It pulls out once the player is 12 m past it (or after 300 s, `maxS`, if the player never comes), with the same clear road as above, so it falls in behind the player and later passes back toward its place (rule 4). Where no place is in reach it does not wait on the carriageway: it rides no faster than the player (`ride.easing`) and looks again each second, until it is back within 350 m or a place comes in reach. "The player's pace" here is the player's speed eased over 15 s (`paceS`), never under 4 m/s (`leastMs`): held to the player's speed of the moment, a rider 350 m up the road stood in its lane while the player stood at a roadworks light, and crawled while the player came back up to speed or slowed for a hairpin ("Where a rider stops"). 350 m: at the group's pace (about 14 m/s moving on the Tremola slice) it is 25 s of road, two to three legs of a hairpin flight, about as far as the player sees a rider on most of the slice; the leader already eases to 0.8 of its pace as the back drops from 250 m to 600 m behind it (rule 1), so a rider at 350 m is one that got away.
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

## Pulling over to wait

A rider pulls over into a stopping place to wait only when it is far ahead of the one it waits for (`GROUP.far`, the owner's rule of 2026-11-26): 75 s or more ahead of it (`farS`: the gap over that one's speed, 15 m/s at the least, `paceMs`, so 1125 m or more) and out of its sight. Out of sight: the land of `far.bin` (the world's 100 m grid, `WorldData.farHeight`) stands 1 m or more over the line between their eyes, 1.3 m up, looked at every 20 m, or they are 1500 m or more apart (`sightM`). The far land is the same in a test and in the browser, so the rule rides the same everywhere. Nearer, the rider eases instead of stopping:

- **Ahead of a stopped player** (rule 3; in free roam, also one gone down a side road) it rides on at its pace for 10 s (`graceS`: a restart in place takes 5 s), then slows at 1 m/s^2 (`easeMs2`) to 8 m/s (`creepMs`), until it is far.
- **Ahead of a riding player** by more than 350 m (`GROUP.ahead`) it rides no faster than the player's pace (its speed eased over 15 s, 4 m/s at the least), so it does not get far unless the player stops.
- **Ahead of the last rider of the line** by more than 700 m (`wait.regroupM`) the leader's wait for the back (rule 1) eases it.

The rule covers every wait for others: for a stopped player, for a player too far behind, for the back of the line. The slowest rider's own stops (rule 6), the holds behind a standing player (a queue on the lane, not a pull-over), the roadworks lights and the stops at a leg's end are as before.

75 s, chosen by measure (no player, seeds 3, 7 and 11): at 60 s the Gotthard leg had up to 21 pull-overs in a ride (seed 11) and its mean speed with the stops fell under the old one (12.48 m/s); 75 s with the leader's ease on to 0.65 at 900 m gave 2 to 7. Before and after (the old rules at seed 11, then 3 and 7), the crew with place 6 in it and no player:

| | Tremola before | Tremola after | Gotthard before | Gotthard after |
| --- | --- | --- | --- | --- |
| Pull-overs to wait in a ride | 9, 3, 3 | 4, 0, 0 | 13, 10, 13 | 7, 3, 2 |
| Their gap | 700 to 1282 m, 47 to 85 s | 1126 to 1142 m, 75 to 76 s | 700 to 1755 m, 47 to 87 s | 1133 to 1571 m, 76 to 105 s |
| Moving speed (m/s) | 18.46, 18.83, 18.86 | 20.14, 20.77, 20.71 | 22.06, 22.35, 22.45 | 24.27, 25.38, 25.40 |
| Mean speed with the stops (m/s) | 12.53, 14.45, 14.51 | 14.58, 14.56, 14.52 | 14.06, 14.12, 13.54 | 14.86, 16.55, 16.52 |
| Stopped share | 0.32, 0.23, 0.23 | 0.27, 0.30, 0.30 | 0.36, 0.37, 0.40 | 0.39, 0.35, 0.35 |

(The pull-overs counted are waits for others; the slowest rider's own stops are not in them. The Tremola's mean speed is set by its roadworks lights: a quicker group comes sooner to the same red light.) With a slow player (12 m/s) the riders ahead now ease to its pace and pull over no more (before: Tremola 18 pull-overs at 350 to 390 m, 23 to 26 s; Gotthard 40 at 350 to 443 m; after: 0). With a player who stands for 180 s (before: Tremola 8 pull-overs at 104 to 403 m, Gotthard 32 at 200 to 404 m) they pull over at 1126 to 1133 m, 75 s, five on each leg.

Two riders going to one place take its free slots in the order they come to it, front first (`CrewGroup.reslot`): one that booked after another but was ahead of it on the road took the slot behind it, and each waited for the other to move (a ride of the measure stood for good).

## Sideways moves

Every sideways move of a rider is a smooth ease within `GROUP.move`: no step in its lateral speed, a cap on its lateral speed and acceleration, and so a longer move at speed.

- **A pass** swings 2.2 m out and back within 1.6 m/s and 1.5 m/s^2 across (`move.pass`): about 2.9 s, so at 20 m/s about 58 m each way (16 m before, at up to 7 m/s and 50 to 120 m/s^2 across). `clearRoad` and the pass's plan take the longer swing. The passer closes on the other only once it is out beside it, 0.4 m clear across (`pass.acrossM`); until then it follows it. Closing before it was out ran a slow swing into the other's back.
- **Into and out of a stopping place** within 1.2 m/s and 1 m/s^2 (`move.place`); a rider moves out of a place at 8 m/s at the most.
- **The drift** (`move.drift`, "Road position") never moves toward a player alongside it (within 3 m along, `road.besideM`), and stops such a move at 2 m/s^2 (`road.stopMs2`); otherwise it moves toward its target at 0.3 m/s at the most, gathering and losing that speed at 0.15 m/s^2, slower at a crawl. It looks ahead 5 s (40 m at the least) for a hairpin or a single lane, so it is in by then.
- A move begun while another runs (a pass given up, a spot moved) keeps the lateral speed it had: the ease carries it (a quintic, 0 at both ends with its change).

Worst lateral speed and acceleration in the probes (Tremola and Gotthard; no player, a slow player, a player who stands), before and after: a pass 10.1 m/s and 72.8 m/s^2, then 1.86 m/s and 2.7 m/s^2 (99 % under 2.3); into and out of a place 4.0 m/s and 35.9 m/s^2, then 2.4 m/s and 3.0 m/s^2 (99 % under 1.2); the drift 0.28 m/s and 2.3 m/s^2, then 0.30 m/s and 0.17 m/s^2 (2 m/s^2 only where it stops a move toward a player alongside). The worst heading a move gives is 18 degrees before, 11 after, at a crawl. `world-group.test.js` holds the caps over two whole rides of the crew.

## Mood

Each rider has a mood (`GROUP.mood`): a slow random walk in -1 to 1 from its own seeded stream. Each second it is pulled back toward 0 over `tauS` (180 s) and moved by a draw within `kick` (0.09), so it takes minutes to cross its range. The rider's daring trait (1 to 5) bounds what the mood does:

- **Pace.** The mood moves the rider's share of its pace by up to 0.05 + 0.02 x daring of it (0.07 to 0.15). Its `least` and `most` still bound the share.
- **Place in the group.** The rider's rank is its `place` less 1.2 + 0.5 x daring places times its mood (up to 1.7 to 3.7 places). A rider passes the rider ahead (rule 4) and closes up to pass when its rank is ahead of that one's, and lets one by when its rank is behind. The player is passed by place only, so the player keeps its own place in the group. So a rider in a good mood pushes to the front and one in a bad mood hangs back. The order of the group changes over a ride, by the passing rules only.
- **Gap.** The mood moves the rider's time gap by up to 35 %: closer in a good mood, further back in a bad one. Close behind another, in its stagger, the rider rides nearly beside it.

## Road position

No rider rides the lane line itself (`GROUP.road`). Each rider has a drift across its lane (+ toward the centre line), which follows a target:

- **Alone**, its own wander: within 0.35 m of its own bias (up to 0.25 m), a new one every 20 s on the mean.
- **Within 45 m behind another bike on its lane** (a rider or the player), a stagger: 0.8 m to one side of that bike's line. Its side swaps every 20 to 60 s. When its side has no room, it takes the other.
- The target is held within 0.3 m toward the edge and 0.9 m toward the centre (0.4 m in a hairpin and before one). It is 0 in a single lane and before one, while it passes, and while it stands behind a stopped player. A rider being passed moves 0.3 m toward the edge.
- The drift moves to the target within `GROUP.move.drift` ("Sideways moves"). A bike that stands does not move across.
- Into a stopping place and out of it the drift fades as the rider moves across to its spot.
- The following rule reads the drift: the player is ahead of a rider on its lane when the player is within 0.95 m of the rider's own line (`AIMotorcycle.sideOf`).

## A spot in a stopping place

A rider that waits in a place stands on a spot of its own around its slot (`CrewGroup.spot`, `GROUP.spot`): moved forward by up to 0.7 m and by up to 0.6 m across, or beside the rider of the slot ahead of it, 1.2 m across from it, when that one stands square (half the time). Half the riders stand within 0.12 rad (7 degrees) of square to the road; the other half are turned by 0.12 to 0.5 rad (29 degrees), nose in or out. Each spot is drawn up to 8 times. It is kept only when it is inside the place (0.3 m clear of the carriageway's edge and of the place's outer edge, clear of the ends) its box, 0.35 m larger, is clear of every other rider's spot in the place, and it is beside each of them (1.15 m or more across) or behind it (2.45 m or more along), and the same to the next slot's plain spot. So no rider rides through another to its spot or queues short of it, and the next rider can always take its plain slot. Else the rider takes the plain slot. The bike turns onto its spot as it moves across into it. Two riders whose spots are side by side do not queue behind each other in the place.

## Free roam

In free roam (`Traffic.roam`, `GROUP.roam`) the player leads: the crew starts behind it, counts it as in front wherever it is across the road, never passes it, and rides no faster than 0.9 of its speed when alongside or ahead. A player off the ride (down a side road) has stopped for the group: every rider rides on, at a crawl after 10 s, and pulls over only once it is far ahead of where the player left the ride ("Pulling over to wait"). `world.md`, "Free roam", has the rest.

## Randomness and the seed

Each rider has its own stream (mulberry32), seeded from the world's `groupSeed` when set. Otherwise the seed comes from the riders' own pace draws, so the group adds no draw from `Math.random`. The draws are the noise every 9 s and, once a second, a spell, a pass and a stop at a place. The same seed rides the same ride (`tests/unit/world-group.test.js`). The per-frame work allocates nothing; the group's line and its entries are built once and reused.

## Where a rider stops

A rider of the group stops only in a stopping place (or going into its booked slot), at a roadworks light, in a queue behind a vehicle that stands (the player too: rule 3's hold), or at the stage's end. Never in its lane on the open road (the owner, 2026-11-27, Tremola km 4.0: two riders up the road stood and crawled in their lane on a straight while the player rode at 25 mph). There is no give-way at a junction yet.

The cause was the too-far-ahead rule (rule 3, `GROUP.ahead`): a rider more than 350 m up the road from the player rode no faster than the player's speed of the moment. When the player stood at a roadworks light (the group does not count a player in a queue as standing, so nobody pulls over for it), every such rider stood in its lane 350 to 420 m up the road; when the player came up to speed, they crawled. It was not the player's fall at a stop. Every stop the test below found before the fix was this one: 31 on 8 stages (11 on gotthard-north, 8 on goeschenen-susten, 4 on the Tremola, among them s 4 177, the owner's km 4; the run lost its host before the last two stages), each a rider of place 1, 2 or 3 in `state 'ride'` and `easing`, at 0 m/s, the player 365 to 510 m behind it. None was a fall: a rider of the group is an `AIMotorcycle` on its lane line, not a `Vehicle`, and does not fall (rule 8); the player's fall at a stop (fixed in 3bdd7a3) only made the player stand, which the riders ahead then matched. Now the rider holds the player's speed eased over 15 s and never under 4 m/s, so a player who stands for long is one it gets far from (75 s, "Pulling over to wait"), and it pulls in at a place.

With that fixed, one more kind showed on lookout-andermatt: two riders far ahead of the player who stood 20 s found no place within 1500 m and waited on the roadside, in their lane. A rider now never waits where no place is in reach (rule 3): it rides on and looks again each second (`events.noPlace` counts the looks). After both: no stop in the open road on any of the 10 stages.

`tests/unit/world-group-stops.test.js` rides the whole crew over every stage with a player at 11 m/s who stands 20 s a third of the way along, and fails on a rider under 2 m/s for more than 2 s anywhere else (its `KNOWN` may only shrink).

## Drawn between steps

The game steps the ride at 60 a second and draws at the display's rate: a frame holds 0, 1 or 2 steps. It draws the player's bike between its last two steps (`Vehicle.applyRenderInterpolation`), so it lags its last step by a share of a step that changes every frame. Each rider and car was drawn at its last step, so against the drawn player a rider alongside jumped back and forth by up to its speed over 60 (0.18 m at 11 m/s) every few frames: the owner's "jumpy" riders alongside (2026-11-27). Now traffic is drawn the same way (`Traffic.drawn(alpha)` after the steps, `Traffic.stepped()` before them and at the start of each `Traffic.update`): every rule and contact reads the steps' poses, and only the drawn frame is between them. A model moved since its step (a restart in place, a new model) or that moved more than 5 m in a step (`Traffic.DRAW_SNAP_M`) is drawn where it is.

`tests/unit/world-group-smooth.test.js` rides the crew past a player at 11 and 15 m/s drawn at 60 Hz (frames that wander by 3 ms), 120 Hz and 144 Hz, and fails where the player rides steady and a rider within 6 m along of it (along the drawn player's heading, read over a step at least) changes the sign of its speed against the drawn player more than twice a second or accelerates against it at more than 12 m/s^2. `SMOOTH_OFF=1` measures the drawing before: 11 to 23 sign changes a second and 1 243 to 1 761 m/s^2 at the worst; after, none and 8.7 to 11.5 m/s^2 (a rider braking or gathering speed beside the player). The riders' own place-keeping does not hunt: read at 60 Hz with the drawing between steps, which is the steps' own motion, a rider beside a steady player did not change the sign of its speed against it once.

## Proofs

- `tests/unit/world-group-pace.test.js` rides the slice with no player from the riders' places and prints each rider's mean speed and stopped share (PACE), holds the crew with place 6 in it under 0.31 of the ride stopped and over 12 m/s, holds that no rider rides past its `most` and that none overlaps, that every rider's pace is its traits' times `GROUP.pace`, and the too-far-ahead rule: with a player at 6 m/s, riders more than 350 m ahead pull in at a place on their own side, off the carriageway, and pull out only once the player is past, behind it; with no place in reach they ride at the player's pace and none waits on the road.

- `tests/unit/world-group.test.js` rides the real Tremola slice at 60 frames a second:
  - the moods: within -1 to 1, a second moves one by a draw at most, the rank within its bounds, each mood moves over ten minutes;
  - the stagger: a rider close behind another is 0.5 m or more across from it in more than 80 % of the frames, sides swap, a rider alone is on its lane line (within 0.1 m) in less than half of the frames, and the drift stays in its room;
  - the spots in every place with three slots or more: inside the place, not touching, turned both ways, some side by side;
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
- The slowest rider's catch-up after its own stop is slow where the leader's ease (0.8 of its pace) is about the slowest rider's `most`. The line only waits for it from 700 m.
- The roadworks lights set most of the time the group stands. With no player on the Tremola slice, the lights hold each rider about 160 s of a ride of 865 to 1005 s. A quicker group often only comes to the next red light sooner, so the mean speed with the stops moves in steps of a light's cycle, not with the moving speed.
- A pass is always on the centre line's side. Two riders never pass at once within 120 m.
- A rider does not give way to a quicker vehicle coming up behind it: it neither moves over nor speeds up. A player who comes up on the group brakes or passes, as on a real road. A probe pilot that holds its speed and never brakes for a vehicle ahead rides into the group where the group takes a bend slower than it: every world probe of `tools/terrain-check.mjs` rides alone (its pilot drops the crew, `Traffic.dropCrew`, as soon as it rides), so a probe of the camera, the road or the physics cannot fail on a crash of the group's; the probes about the group (`CREW_PROBES`: world-finish, world-shot, world-group-shots, world-place-shots, world-stop-shots, world-roam, world-crew-start) keep it, and so does world-quality, which times the frame as a ride draws it (leg 6, 2026-11-27: "Rode into Lucy" at s 6 224, the riders on their lane through a hairpin at 11 to 15 m/s, none waiting, easing or crawling, the pilot on the road's middle at 20 m/s).
