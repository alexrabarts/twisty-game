# The hill ride

The hill ride is a short ride of its own. The address key `RideMode.HILL_KEY` (js/ridemode.js) opens it; that file is the only place the key is written. It shows no menu.

A boy on a heavy delivery bicycle starts at the top of a steep cobbled lane through a stone village. The ride holds on the opening shot, then he rides down. Near the bottom the camera stops and the bicycle rolls on round the last curve and out of sight. The picture fades to a loaf on a board, the band plays its last chord, and the end card shows R and Esc.

The ride has no clock, no gates and no board, and it sends nothing anywhere. The classic legs and the world are not touched. If its model does not load, the classic legs open with `RideMode.HILL_FAIL_NOTE`.

The owner gave key frames of the scene he had in mind. The frames are private and stay out of the repo. Only shapes, sizes, colour numbers and camera places come from them. No bread brand, logo or wordmark is on any model or text. The frame plate on the bicycle is blank, and the loaves are plain.

## The course

`HillLane` (js/hill/lane.js) holds the lane as data, from one seed, so it is the same on every load. Its parts are `RULE` knots, in this order:

1. The start (s 22). The low sun is to the right of the view.
2. A right-hander, 0.61 rad (35 degrees, the angle the opening frame has the sun off the view) from s 40 to 66. It is tighter than a gentle bend (about 28 m at its tightest), because the opening frame shows the lane bending that sharply below the start.
3. The main straight (`mainStraight`, s 68 to 184), straight into the sun.
4. A left curve, from s 186 to 229. Its least radius is about 57 m.
5. A fast steep part at a grade of 0.26.
6. The sharp right (`sharpRight`, s 376 to 394). Its tightest radius is 7 to 11 m.
7. The last gentle left, where the camera holds (`end`).

The lane is 572 m long and falls more than 60 m over the ride.

The buildings stand on each side behind a strip of flags. Each side has its own seed. They are of several kinds (`RULE.kinds`): terraces, semi-detached pairs, detached cottages with a garden after them, shops, a pub, long low barns, lean-tos, and gardens behind a wall or a hedge, now and then with a gate. A low garden wall stands where no building can: in a gap, or on the inside of a turn tighter than `innerRadiusM`.

The street opens out in places, so it is not a tunnel:
- **Lower roofs.** After the opening only `twoStoreyShare` (0.55) of the buildings have two storeys. Barns (`RULE.barn`) and lean-tos (`RULE.leanto`) are lower again.
- **Set back.** Now and then a building stands 3 to 6 m back (`RULE.setBack`; a detached cottage more often, a pair together) behind a front garden with its wall or hedge, a gate at the door and a flagged path.
- **The view** (`RULE.view`). On the downhill side of the main straight, from s 124 to 164, no buildings stand. A low wall with an iron railing runs along the flags, and the land falls away just behind it to the vale.
- **The green** (`RULE.green`). Opposite the church, from s 204 to 248, the lane runs along a sloping green with a big tree, a bench and a pump. Houses stand back round it, and a garden is at its foot. The low sun comes from down the lane, so the houses round it and for `lowAfterM` below it have one storey, and the sun reaches the green.
- **The church** (`RULE.church`) stands 15 m back behind its churchyard wall and gate, with a tower, a spire, gravestones, plain crosses and four yews. It faces the green.
- **Close again** (`RULE.tight`). From s 330 to the sharp right, both sides are two-storey terraces and shops, taller (`eavesUpM` 5.6), with no gaps and none set back. The change from open to close makes the sharp right feel faster.

The opening's buildings on the left are set by hand (`RULE.opening.left`): their ends, heights, roofs, walls and chimneys are fitted to the opening frame.

As in the stills, most buildings before `thatchToS` (s 240) have thatch (`thatchShare` 0.75): a thick ridge with a darker cap band, a deep rounded eave with a second roll over it, thatch round each chimney, and eyebrow dormers over the upper windows on some. The walls are grey rubble, grey dressed stone and whitened render; brick is rare. The windows are small casements. The opening has no railings: on its left, rough stones lie along the lane's edge by the churn and the iron post (`opening.stones`); on its right, behind the top wall, stands a thatched rubble cottage in the sun's shadow (`opening.right`), its near top corner where the still's dark shape has it. The shadow fill (`LIGHT.ambient`, `hemisphere`) is set so that house reads as the still does: `hill-overlay` gives the mean luminance of that part of the frame in both (`shade`). The churn is dull, dented grey metal. The bicycle has no reflector, and the boy wears dark breeches to his boots.

Five side roads (`RULE.sideRoads`, `HillLane.sideRoad`) leave the lane on both sides: cobbled lanes, a gravel track between garden walls and hedges, and an alley of steps. Each one bends out of sight after 9 to 15 m. Houses that front it and walls line it (`lineSideRoad`). Its surface at the mouth is the lane's own edge, and it eases to level over 5 m (`HillLane.roadY`, `SIDE.mouthM`), so the mouth has no step. The steps cannot be ridden: the kerb stays there. The others can be ridden in for 10 to 15 m (`ride`). A gate, a wall or a yard's wall closes each one, and that end and the sides are walls with the brush and fall rules (`HillBicycle.kerbs`). The wide mouth at s 361, just before the sharp right, looks like a way out of the corner, but its gate is 10 m in. No side road is in the sharp right or the last left. `HillLane.sideAt` finds the side road at a point.

At the top, on the right, a stone wall stands instead of cottages, 1.5 m high, to s 90 (`topWallToS`, `topWallUpM`). This is how the reference frames have it. With cottages there, the low sun from the right put the whole start in shade.

## The land

`HillLand` (js/hill/lane.js, `lane.ground()`) holds the land as data. These are its rules:
- **It follows the lane.** Out to `bandM` (20 m) from the lane or a side road, the land is at the height of the nearest part of the lane, so it falls as the lane falls. The heights of near paths are blended (`blendM`), so the land has no crease between two paths.
- **Each house has a level yard.** From its front to `yardM` (8 m) behind its back, the land is at the house's floor (`pads`). It eases back into the land over `padEaseM`. The church stands on a level yard of its own.
- **It stays under the paving.** Under the lane, its flags and each side road, and for a cell and a half round them, the land is `underM` under the surface.
- **Past the band it is the hillside.** It falls towards the vale (down the main straight and to its right) and rises on the other side, to low hills far off. So no hill stands between the sun and the street.

The land is drawn as two grids in one mesh (`HillScene.vale`). A fine grid of 2 m cells covers each coarse cell that comes within `reachM` of a path. A coarse grid of 24 m cells goes out to the hills. They meet edge to edge, and the edge of the fine grid takes the heights of the coarse grid, so no gap opens. `HillLand.heightAt` is the drawn surface (the same triangles). `surfaceAt` is the paving where there is paving, else the land.

Every piece that stands on the ground has its foot in it. A building's foot is `footM` (0.3 m) under the lowest land under its footprint (`lane.ground()` sets it). A wall, a pier, a step, a post, a shed, a gravestone, a hedge or a tree goes down to the lowest ground under it (`HillScene.standing`, `lowestSurface`). A railing stands post by post on the flags under it, and its rail falls with them. A back fence closes the yard on three sides. Each such piece is noted in `HillScene.stands`, with its footprint and its foot.

`HillLane.blocks(a, b)` is the line-of-sight test against the buildings of the lane and of the side roads (`solids`). The ending, the cinematic cameras and the seen faces use it.

`HillLane.seenFaces` finds the backs and ends of the buildings that the lane's cameras see: the chase view every 6 m, the opening, its pan, and the end's camera. Only those get the rear details (`HillScene.rear`): back doors, small windows, drainpipes and soil stacks, lean-to sheds, water butts, washing lines, fences and a few rear extensions. The other faces stay plain.

## The cobbles

There is one height field, `HillLane.field`, and the bicycle rides on the same field that the surface is drawn from:
- The lane is laid in tiles 2 m long. Each tile is mirrored by its own number (`tileFlip`), so no repeat shows.
- In a tile there are 11 rows. Each row is laid of stones of their own widths, 0.10 to 0.27 m (`rowCells`), so there is no grid. Each stone fills most of its cell, its outline a rough oval of its own, its crown its own height, with mortar between. The stones are grey, each its own tone.
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
- a lean rate 0.9 of the world's (about 1.33 rad/s against a motorbike's 1.48), with the steer keys' ease-in 1.9 times as long, so a press starts gently and builds to the quick lean;
- the boy's body leaning into a turn past the bicycle's own lean (`HillRider.ARMS.bodyLean` 0.35 of it, at most 0.25 rad, about the saddle; none with a foot down);
- a lean cap of 42 degrees, and 0.72 of the grip on cobbles;
- tighter turns at walking pace;
- no engine braking;
- its own air drag.

Only the drive is its own, and the other differences are overrides or opt-in hooks:
- **The push.** One tall gear, 9.25 m a turn of the cranks. The push is 200 N when the cranks barely turn. It holds up through the middle and fades near the top, 120 turns a minute (18.5 m/s; `pushFade`). Pedalled on the flat he reaches 15.4 m/s. The cranks turn at the real cadence.
- **Brakes and drag.** A freewheel. Rod brakes give 2.4 m/s2. Rolling drag on the cobbles is 0.025, and the air's drag area is 0.5 m2.
- **The steering.** Under 1.5 m/s the bars turn the bicycle (`steer.directMs`): full lock is about 33 degrees (`lockRadius` 1.75 m), and it leans at most 6 degrees. Over 2.8 m/s (`counterMs`) the lean turns it, and the bars are drawn as a countersteer: a push against the lean rate, at most 6 degrees, over the small angle the curve needs. Between the two a smoothstep by speed blends the turn, the bars and the lean limit (`HillVehicle.lowSpeedShare`, `barsDrawn`).
- **The wheelie.** The pop and the lift are the push he has at the speed, less 15 % for the loaded basket. Downhill at speed there is no push, so a wheelie there is a balance, not a lift.
- **No motorbike changes.** Each difference from a motorbike is an override here, or a `Vehicle` hook whose motorbike value is the value it always had: `wheeliePop`, `wheelieLift`, `wheelieEndSpeed`.

`HillBicycle` (js/hill/bicycle.js) puts the bike on the lane:
- the lane's grade along its heading;
- its height on the cobbles, with their shake;
- the kerbs. A glancing touch is a brush, as against a world's wall (`Vehicle.wallTouch`, `brush`). More than that is a crash.
- the cranks and the freewheel;
- the stand-up after a fall, in place, with a foot down.

The legs come out at 6.5 m/s downhill after 0.4 s without pedalling. They come back under 4.2 m/s, or when he pedals at a speed his feet can follow. On the opening stretch, from the start through the first right-hander (`LEGS.alwaysToS`, s 66), the legs go out as soon as he stops pedalling over 2.5 m/s and stay out, as in the stills. Past it, even downhill he keeps his feet on the pedals most of the time: he starts on them, holds them there for 4 to 9 s with the cranks level, then puts his legs out for only 2.5 to 5 s, each time in a new pose, swung out over 0.3 s (`HillBicycle.LEGS`, seeded for each ride). Each leg has its own spread, drop, reach ahead and toe, in narrow ranges; seen from behind, each leg stands 37 to 44 degrees out from straight down, the angle the stills show. Out, each leg is straight: one line from the hip, its knee bent about 10 degrees at most (`LEGS_OUT.reach`). The sway is 17 mm at 0.35 Hz.

`HillRider` (js/hill/rider.js) draws `assets/hill/bicycle.glb` (tools/blender/hill_bike.py) from the state:
- **The frame.** It follows the bike's heading, its lean (positive to the right, as `Vehicle` draws it) and the lane's fall. A wheelie lifts it about the rear axle.
- **The foot down.** At a stand the frame leans onto the left foot by `Vehicle.FOOT_LEAN`. The foot reaches the cobbles at its own place, never under them.
- **A fall.** The frame is laid over on its side. The boy comes off and falls as a motorbike's rider falls (`Vehicle.beginRiderFall`, `stepRiderFall`, `drawRiderFall`; `.agent/system/handling.md`, "The rider's fall"): the vehicle's own rider runs the fall by its kind and speed, and `HillRider.fall` puts the boy's body at that rider's place and turn and each of his limbs along that rider's limb. He lands and slides on the lane (`HillVehicle.riderGroundY`). After the restart he is on the bicycle again (`remount`).
- **The bars.** The fork, the front wheel, the stem and the bars turn about the head tube (`steer`, 20 degrees of rake) by `barsDrawn`. The shoulders turn with them a little, and each arm is a two-bone solve from the shoulder to its grip (`ARMS`).
- **The legs.** Each leg is a two-bone solve, on its pedal or out (`LEGS_OUT`). Out, a leg sways, answers the cobbles' bounce after a lag, and balances against the lean.

## The street things

`HillProps` (js/hill/props.js) puts out flower pots, window-box tubs, milk bottles on the steps, a churn, buckets, baskets, dustbins with lids, crates and brooms:
- They are seeded for each house. Most stand at the fronts; about 1 in 10 stand at the lane's edge.
- They are instanced.
- Each is a simple rigid body. A knock pushes it by the bicycle's speed and heading, and by its mass. It slides, tumbles and bounces.
- A round thing rolls on down the fall. Lids and bottles fly a little. A pot breaks into four shards with a puff of soil.
- A light thing costs the bicycle a little speed and a wobble.
- The churn or a dustbin costs 30 %, and over 5.5 m/s it knocks the boy off.
- Things bounce little: a light one keeps 0.1 of its fall, a heavy one 0.02, and they slide to a stop soon.
- Each hit plays a clatter through the game's sound.
- The football (`HillProps.BALL`) is the exception. It is an old leather ball at the lane's edge on the main straight. It keeps 0.7 of its speed into the ground, a wall, the kerb or a thing, off the slope's own normal, so its bounces die away and it rolls on down the hill. A hit nudges the boy only. Each bounce thuds, softer as it slows.
- R puts everything back.

## The light and the effects

`HillRide.LIGHT`:
- a sun 14 degrees up, pale gold (0xffd09a), along the main straight;
- a warm grey haze, and the sky's fog preset, as pale as the reference frames' sky;
- a weak sky and ground fill.

The ride runs the same effects that a world ride runs (js/effects.js): the cascaded shadows (the bike is `game.vehicle`, the sun is `game.sunOffset`), bloom, the grade, the ambient occlusion, the sky's sun glow, and the Quality ladder (`Game.adaptResolution`). The window panes are mirror glass on a sky of their own (`HillScene.paneSky`): a golden band on the horizon, brightest towards the sun. A pane facing the sun glints gold.

## The camera

`HillRide.SHOTS` is the named shots matched to the reference frames: `opening`, `climbFoot`, `climbShop`, `shopSide` and `basket`. Each shot is a camera place and a target as [s, across, up] on the lane, and a field of view. `hill-compare` draws each shot beside its frame.

The opening shot comes from `RULE.opening.camera` (`HillRide.openingShot`): the camera's place, its turn and its pitch and a 26.1 degree lens, fitted to the opening frame's pixels. The boy stands at `startAcross`. `hill-overlay` checks it (see Checks).

The ride holds on the opening, braked with a foot down, until the player pedals (not before 0.8 s): the bicycle does not move by itself. The band plays from the start: the ride sets the sound on unless the player has chosen Mute (`SoundManager.defaultTo`, not saved, so the rest of the game keeps its own default). Then the camera cranes up and back to the view the player chose with Z, eased over 2.6 s (a smootherstep of the place, the aim and the lens), with no cut:
- behind: 8.5 m back, 3.6 m up, a 46 degree lens;
- cinematic;
- in front.

The cinematic view (`HillRide.CINEMA`, `CUTS`) is a chain of 19 cameras down the course: from doorways, high windows, low by the cobbles, two of `SHOTS`, and in three side roads' mouths. Each turns to follow the bicycle and closes its lens to keep him 3.2 m of the picture's height. When the camera will not see him in 0.8 s (behind a building, or past 45 m), it cuts to the camera that sees him longest down the course (`cinemaPick`). There is never a cut sooner than 1.5 s after the last. After a fall or R it picks afresh. The ending holds its own camera.

The ending (`HillLane.RULE.end`, `HillRide.updateEnding`) goes through these phases:
1. Past `stopS` the camera eases to a fixed point high behind, looking down the last curve, and holds there.
2. Once the bicycle has been out of sight for 0.4 s (`HillRide.seen`: the frustum and `blocks`), the picture fades out and the band stops.
3. The last picture comes up: the loaf in a warm side light. The band plays its last chord (`HillMusic.close`). `HillLoaf` (js/hill/loaf.js) builds it under the fade, only when the ride reaches its end, so it is outside the village's budget. It is a crusty bloomer: a fine grid displaced by its own field, with a flat base, five deep slashes with torn raised lips, and a split along one side. Its colour, normal and roughness maps come from the same field: golden to deep brown, darker on the ridges, pale in the cuts, flour on top, the crust's crackle and the crumb's pores. One slice is cut off and lies on a worn board with grain and knife marks, with a bread knife and crumbs. The table behind goes soft, as a short lens makes it.
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
    - The autopilot takes it from the start to the last curve with no crash, and the fast part reaches 18.5 to 22.5 m/s.
    - At 0.8 m/s full steer turns the bars over 28 degrees with under 8 degrees of lean; at 7 m/s the bars stay under 9 degrees and the lean turns it; from 0.3 to 7 m/s there is no step in the bars, the lean or the curve.
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
  - **The street things.** They stand on the ground and never out in the lane. A knock moves a thing away and costs the bike, the churn knocks him off at speed, and R restores everything. The football bounces lower each time, rolls on down the hill and never goes through a house front.
  - **The fall.** In a crash he comes off clear of the bicycle, and he is on it again after the restart.
  - **The side roads.** Four to six, on both sides, a mix of kinds, none in the sharp right or the last left; no mouth has a step; none crosses the course or another; ridden in, the bicycle stops at what closes it, and the ending never fires there.
  - **The cinematic cameras.** Over a whole ride the bicycle is always in frame and in clear view until the ending, and no two cuts are within 1.5 s.
  - **The budget.** The village is under 300,000 triangles and 40 draws.
- `tests/unit/hill-ground.test.js` checks the land:
  - **Nothing floats.** At each corner and the centre of each piece in `HillScene.stands`, the foot is at most 5 cm over the ground (`surfaceAt`).
  - **The paving.** The land never shows through the lane, its flags or a side road. Just past the flags, where nothing stands, the land is within 0.3 m of the flags.
  - **The fall.** Behind each house the land is at the house's floor; 18 m out on both sides the land falls as the lane falls.
  - **The grids.** The fine and the coarse grid meet edge to edge, with no gap.
- `node tools/terrain-check.mjs hill-overlay --gpu --still <file>` draws the opening frame, the game's opening shot at the frame's shape, and the two at half each, with the frame's key points (yellow) and the game's (cyan), and gives the mean distance between them in pixels of an 857 px high frame.
- `node tools/terrain-check.mjs hill-shots --gpu` takes the ride's pictures, each with its mean luminance, into `~/Library/Caches/twisty-world/hill-shots/`.
- `node tools/terrain-check.mjs hill-compare --gpu --stills <dir>` makes side-by-side sheets of the reference stills (private) and the game from the matching shots, with the mean colour of the lit house faces in both. They go into `~/Library/Caches/twisty-world/hill-shots/compare/`.

## The loaves spill

When the boy comes off, the basket's loaves fly out (`js/hill/spill.js`, `HillSpill`): the model's loaves (the `loaf` material on the `basket` node) are hidden, and six loose loaves leave the basket with three quarters of the bicycle's speed, a lift of 1.6 to 2.8 m/s and a tumble. They bounce low off the cobbles, slide to rest on the lane's fall, and the house fronts turn them back. They lie where they fell, with the basket empty, until R puts them back. A second fall with an empty basket throws nothing. The throw is seeded, so it is the same for the same fall.

In a fall the boy never passes through a building: `HillVehicle.holdRiderOut` puts his body (`RIDER_FALL.bodyM`) back out through the nearest wall of any footprint in `HillLane.solids` (the cottages and the side roads' houses) and takes away his speed into it.
