# The hill ride

The hill ride is a short ride of its own. The address key `RideMode.HILL_KEY` (js/ridemode.js) opens it; that file is the only place the key is written. It shows no menu.

A boy on a heavy delivery bicycle starts at the top of a steep cobbled lane through a stone village. The ride holds on the opening shot, then he rides down. Near the bottom the camera stops and the bicycle rolls on round the last curve and out of sight. The picture fades to a loaf on a board, the band plays its last chord, and the end card shows R and Esc.

The ride has no clock, no gates and no board, and it sends nothing anywhere. The classic legs and the world are not touched. If its model does not load, the classic legs open with `RideMode.HILL_FAIL_NOTE`.

The owner gave key frames of the scene he had in mind. The frames are private and stay out of the repo. Only shapes, sizes, colour numbers and camera places come from them. No bread brand, logo or wordmark is on any model or text. The frame plate on the bicycle is blank, and the loaves are plain.

## The course

`HillLane` (js/hill/lane.js) holds the lane as data, from one seed, so it is the same on every load. Its parts are `RULE` knots, in this order:

1. The start (s 22). The low sun is to the right of the view.
2. A gentle right-hander, 0.61 rad (35 degrees, the angle the opening frame has the sun off the view) over 80 m, never tighter than 40 m.
3. The main straight (`mainStraight`, s 112 to 228), straight into the sun.
4. A left curve.
5. A fast steep part at a grade of 0.23.
6. The sharp right (`sharpRight`, s 420 to 438). Its tightest radius is 7 to 11 m.
7. The last gentle left, where the camera holds (`end`).

The lane is 600 m long and falls more than 60 m over the ride.

A terrace of cottages stands on each side behind a strip of flags. Each side has its own seed. A low garden wall stands where no cottage can: in a gap, or on the inside of a turn tighter than `innerRadiusM`.

At the top, on the right, a stone wall stands instead of cottages, 1.5 m high, to s 90 (`topWallToS`, `topWallUpM`). This is how the reference frames have it. With cottages there, the low sun from the right put the whole start in shade.

The land falls away towards the sun's side, the vale, and rises on the other side (`HillScene.groundY`), so no hill stands between the sun and the street.

`HillLane.blocks(a, b)` is the line-of-sight test against the cottages. The ending uses it.

## The cobbles

There is one height field, `HillLane.field`, and the bicycle rides on the same field that the surface is drawn from:
- The lane is laid in tiles 2 m long. Each tile is mirrored by its own number (`tileFlip`), so no repeat shows.
- In a tile there are rows of stones. Each stone is a dome with its own size, height and place in its cell, with deep mortar between.
- `HillLane.cobble(s, across)` is the field in metres. The bicycle's bounce and pitch read it.

`HillScene.cobbleTextures` bakes four maps from the field:
- the colour map;
- a tangent-space normal map from the field's slopes;
- an occlusion map that darkens the gaps, which the low graphics levels leave out;
- a roughness map: matte, with a slight sheen on the worn tops.

The maps use mipmaps and full anisotropy.

## The bicycle

The bicycle is the game's own bike. `HillVehicle` (js/hill/pushbike.js) extends `Vehicle` and runs through the world physics path. So it has the motorbikes' steering input, countersteer, lean, heading, lateral grip, lowside, foot down, wheelie and fall.

Its numbers (`HillVehicle.DATA`, `HillVehicle.WORLD`) are a delivery bicycle's:
- a 20 kg bike and a 40 kg boy;
- 26 inch wheels and a 1.15 m wheelbase;
- a slower lean rate: 0.6 of the world's;
- a lean cap of 42 degrees, and 0.72 of the grip on cobbles;
- tighter turns at walking pace;
- no engine braking;
- its own air drag.

Only the drive is its own, and the other differences are overrides or opt-in hooks:
- **The push.** The push is 150 N when the cranks barely turn, and it falls to nothing at 92 turns a minute (6.4 m/s).
- **Brakes and drag.** One gear with a freewheel. Rod brakes give 2.4 m/s2. Rolling drag on the cobbles is 0.04.
- **The wheelie.** The pop and the lift are the push he has at the speed, less 15 % for the loaded basket. Downhill at speed there is no push, so a wheelie there is a balance, not a lift.
- **No motorbike changes.** Each difference from a motorbike is an override here, or a `Vehicle` hook whose motorbike value is the value it always had: `wheeliePop`, `wheelieLift`, `wheelieEndSpeed`.

`HillBicycle` (js/hill/bicycle.js) puts the bike on the lane:
- the lane's grade along its heading;
- its height on the cobbles, with their shake;
- the kerbs. A glancing touch is a brush, as against a world's wall (`Vehicle.wallTouch`, `brush`). More than that is a crash.
- the cranks and the freewheel;
- the stand-up after a fall, in place, with a foot down.

The legs come out at 6.5 m/s downhill after 0.4 s without pedalling. They come back under 4.2 m/s, or when he pedals at a speed his feet can follow. While the legs are out, every 3 to 8 s (seeded for each ride) he puts his feet on the pedals for 0.5 to 1.5 s with the cranks level, then swings them out in a new pose (`HillBicycle.LEGS`). Each leg has its own spread, drop, reach ahead, knee bend and toe.

`HillRider` (js/hill/rider.js) draws `assets/hill/bicycle.glb` (tools/blender/hill_bike.py) from the state:
- **The frame.** It follows the bike's heading, its lean (positive to the right, as `Vehicle` draws it) and the lane's fall. A wheelie lifts it about the rear axle.
- **The foot down.** At a stand the frame leans onto the left foot by `Vehicle.FOOT_LEAN`. The foot reaches the cobbles at its own place, never under them.
- **A fall.** The frame is laid over on its side.
- **The legs.** Each leg is a two-bone solve, on its pedal or out (`LEGS_OUT`). Out, a leg sways, answers the cobbles' bounce after a lag, and balances against the lean.

## The street things

`HillProps` (js/hill/props.js) puts out flower pots, window-box tubs, milk bottles on the steps, a churn, buckets, baskets, dustbins with lids, crates and brooms:
- They are seeded for each house. Most stand at the fronts; about 1 in 10 stand at the lane's edge.
- They are instanced.
- Each is a simple rigid body. A knock pushes it by the bicycle's speed and heading, and by its mass. It slides, tumbles and bounces.
- A round thing rolls on down the fall. Lids and bottles fly a little. A pot breaks into four shards with a puff of soil.
- A light thing costs the bicycle a little speed and a wobble.
- The churn or a dustbin costs 30 %, and over 5.5 m/s it knocks the boy off.
- Each hit plays a clatter through the game's sound.
- R puts everything back.

## The light and the effects

`HillRide.LIGHT`:
- a sun 14 degrees up, pale gold (0xffd09a), along the main straight;
- a warm grey haze, and the sky's fog preset, as pale as the reference frames' sky;
- a weak sky and ground fill.

The ride runs the same effects that a world ride runs (js/effects.js): the cascaded shadows (the bike is `game.vehicle`, the sun is `game.sunOffset`), bloom, the grade, the ambient occlusion, the sky's sun glow, and the Quality ladder (`Game.adaptResolution`). The window panes are mirror glass on a sky of their own (`HillScene.paneSky`): a golden band on the horizon, brightest towards the sun. A pane facing the sun glints gold.

## The camera

`HillRide.SHOTS` is the named shots matched to the reference frames: `opening`, `climbFoot`, `climbShop`, `shopSide` and `basket`. Each shot is a camera place and a target as [s, across, up] on the lane, and a field of view:
- `opening` is the frame of the descent from the top.
- The climb shots stand lower down the lane, where both sides have cottages.

`hill-compare` draws each shot beside its frame.

The ride opens on `opening` and holds there for 3.5 s, or until he pedals after 0.8 s. Then it eases over 1.6 s to the view the player chose with Z:
- behind;
- from the top;
- in front.

The ending (`HillLane.RULE.end`, `HillRide.updateEnding`) goes through these phases:
1. Past `stopS` the camera eases to a fixed point high behind, looking down the last curve, and holds there.
2. Once the bicycle has been out of sight for 0.4 s (`HillRide.seen`: the frustum and `blocks`), the picture fades out and the band stops.
3. The last picture comes up: the loaf (`HillRide.LOAF`, `assets/hill/loaf.glb` from tools/blender/hill_loaf.py) in a warm side light. The band plays its last chord (`HillMusic.close`).
4. The card shows.

## The music

`HillMusic` (js/hill/music.js) plays the slow theme of the Largo from Dvorak's Ninth Symphony, which is in the public domain. It is set for cornet, two horns and tuba, and every voice is synthesised through the game's sound graph. It follows Mute and Volume.

## Checks

- `tests/unit/hill-ride.test.js` checks these things:
  - **The address.** It opens the ride, and the key appears nowhere else.
  - **The course.** The order of its parts, the right-hander's angle, the straights, the sharp right's radius and the last left.
  - **The sun.** It lies along the main straight and stands to the right of the start.
  - **The houses.** There is a terrace on both sides, no two neighbours are alike, and no corner stands on the lane.
  - **The line of sight.** A line through a cottage is blocked; a line along the lane or over the roofs is not.
  - **The cobble field.**
  - **The bike.**
    - It leans and turns left through the vehicle's own path. Its lean rate and its radius at 7 m/s are compared with a motorbike's.
    - The autopilot takes it from the start to the last curve with no crash, and the fast part reaches 15 to 18.5 m/s.
    - The sharp right at full speed brushes or falls.
    - The foot comes down at a stop.
    - The pace when pedalled, the freewheel and the brakes.
    - The legs out.
    - A wheelie from a standstill, and at walking pace on the flat and on the hill.
    - A flip, then the stand-up.
    - The kerbs, and the cobbles' shake.
  - **The ending.** The bike is seen, then lost round the curve and never seen again; the phases run through to the card.
  - **The music.**
  - **The pose.**
    - On the pedals at every crank angle.
    - Out to each side.
    - The foot down on the flat and on the steepest grade.
    - Over a long run with the legs out, several returns to the pedals and different poses, never through the frame or the ground.
  - **The street things.** They stand on the ground and never out in the lane. A knock moves a thing away and costs the bike, the churn knocks him off at speed, and R restores everything.
  - **The budget.** The village is under 300,000 triangles.
- `node tools/terrain-check.mjs hill-shots --gpu` takes the ride's pictures, each with its mean luminance, into `~/Library/Caches/twisty-world/hill-shots/`.
- `node tools/terrain-check.mjs hill-compare --gpu --stills <dir>` makes side-by-side sheets of the reference stills (private) and the game from the matching shots, with the mean colour of the lit house faces in both. They go into `~/Library/Caches/twisty-world/hill-shots/compare/`.
