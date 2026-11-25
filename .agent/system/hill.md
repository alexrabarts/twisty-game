# The hill ride

The hill ride is a short ride of its own. The address key `RideMode.HILL_KEY` (js/ridemode.js) opens it; that file is the only place the key is written. It shows no menu.

A boy pushes a heavy delivery bicycle on foot up the top of a steep cobbled lane through a stone village to the bakery's cart, where his basket fills with loaves. The ride then holds on the opening shot, and he rides down. On the way down he throws bread at the doors that wait for it (see "The day"). Near the bottom the camera stops and the bicycle rolls on round the last curve and out of sight. The picture fades to a loaf on a board, the band plays its last chord, and the end card shows the time, the best and the board.

The ride is timed, but no clock shows during the ride. The time shows only on the end card (see "The time and the board"). The classic legs and the world are not touched. If its model does not load, the classic legs open with `RideMode.HILL_FAIL_NOTE`.

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

The details where the eye goes from the chase view and the opening:
- **Windows and doors.** Curtains drawn back at some panes, window boxes, a knocker on each door, a step worn hollow in its middle, and now and then an iron boot scraper by the step.
- **Roofs.** Chimney pots of their own shapes, one to three to a stack. Gutters on the backs as on the fronts. Moss on the thatch and lichen on slate and tile, on the top face of the slope only.
- **Walls.** Patched render and a crack or two on rendered fronts; moss here and there along wall copings.
- **Trees.** A leafy tree is one shape (`HillScene.leafyTree`, instanced with its colours): a trunk that forks into four limbs rising and spreading, each ending in a cluster of small leaf clumps, and a few clumps over the top, so its crown is open and ragged against the sky. The green's big tree is two of them turned about each other. A bare tree forks three times, its twigs thin and open-ended. The village is 289,793 triangles in 23 draws with them (284,997 before).
- **Gardens.** A border of flowers inside each front wall, clear of the gate; washing on a line across some gardens, its posts in the land; a cat on a garden wall on the left of the main straight (`HillScene.catWall`).

The opening's buildings on the left are set by hand (`RULE.opening.left`): their ends, heights, roofs, walls and chimneys are fitted to the opening frame.

As in the stills, most buildings before `thatchToS` (s 240) have thatch (`thatchShare` 0.75): a thick ridge with a darker cap band, a deep rounded eave with a second roll over it, thatch round each chimney, and eyebrow dormers over the upper windows on some. The walls are grey rubble, grey dressed stone and whitened render; brick is rare. The windows are small casements. The opening has no railings: on its left, rough stones lie along the lane's edge by the churn and the iron post (`opening.stones`); on its right, behind the top wall, stands a thatched rubble cottage in the sun's shadow (`opening.right`), its near top corner where the still's dark shape has it. The shadow fill (`LIGHT.ambient`, `hemisphere`) is set so that house reads as the still does: `hill-overlay` gives the mean luminance of that part of the frame in both (`shade`). On the right a fence runs from s 24 to s 62 (`opening.fence`): dark timber posts 1.6 m apart on the flags, with clear gaps between them, with a round rail along their tops that falls with them. By the cottages that the climb's wide shot sees, as its stills have them: a sawhorse trestle on the flags (`opening.trestle`), a short iron railing beside a door's step (`opening.railing`), and ivy up two of the cottages (`opening.ivy`). The thatched cottages of the opening have eyebrows over their upper windows, and fewer windows, each a little off the even spacing; the big one (s 60.8 to 79) has rubble walls and low eaves (4.45 m), its upper windows just under them. Behind the top wall on the inside of the bend stands an old high wall, 4.2 m, dark in its own shade, with three stepped buttresses out to the flags (`opening.buttressWall`, `buttresses`): the climb's wide shot has it at its right edge, as its stills do. The churn is dull, dented grey metal. The bicycle has no reflector, and the boy wears dark breeches to his boots.

Five side roads (`RULE.sideRoads`, `HillLane.sideRoad`) leave the lane on both sides: cobbled lanes, a gravel track between garden walls and hedges, and an alley of steps. Each one bends out of sight after 9 to 15 m. Houses that front it and walls line it (`lineSideRoad`). Its surface at the mouth is the lane's own edge, and it eases to level over 5 m (`HillLane.roadY`, `SIDE.mouthM`), so the mouth has no step. The steps cannot be ridden: the kerb stays there. The others can be ridden in for 10 to 15 m (`ride`). A gate, a wall or a yard's wall closes each one, and that end and the sides are walls with the brush and fall rules (`HillBicycle.kerbs`). The wide mouth at s 361, just before the sharp right, looks like a way out of the corner, but its gate is 10 m in. No side road is in the sharp right or the last left. `HillLane.sideAt` finds the side road at a point.

At the top, on the right, a stone wall stands instead of cottages, 1.5 m high, to s 90 (`topWallToS`, `topWallUpM`). This is how the reference frames have it. With cottages there, the low sun from the right put the whole start in shade.

## The houses at the top

The houses where the climb ends and the descent starts are drawn to the stills' numbers (`RULE.opening.left`). The numbers were measured by perspective against the lane's width (5.6 m) and the boy's height (1.6 m): the climb's wide shot sees the cottages about 30 m off, about 80 pixels a metre in a 639 pixel high frame. Heights are over each house's floor; doors and windows are shares of the frontage from its uphill end. Left of the lane going down, in order:

| s | What the stills show | Storeys | Eaves, ridge (m) | Roof | Walls | Front |
|---|---|---|---|---|---|---|
| 39.95 to 50.4 | a cottage, ivy up its uphill corner | 2 | 3.8, 6.0 | clay tile, about 45 degrees | pale rubble | door 0.5; windows 0.22 and 0.78 below, 0.25 and 0.75 above |
| 50.4 to 60.8 | a low cottage under a tiled roof, a trestle in front | 2 | 3.6, 5.7 | clay tile, about 45 degrees | pale rubble | a boarded door 0.62; window 0.28 below, 0.3 and 0.68 above |
| 60.8 to 79.05 | a long thatched pair: the first door up steps with an iron railing, the second boarded under a porch hood, a window glowing above | 2 | 3.9, 7.4 | thatch, thick, rolled over the eaves, swept up over two upper windows | pale rubble | doors 0.22 and 0.62; windows 0.08 and 0.76 below, 0.12, 0.34, 0.71 and 0.9 above; eyebrows over 0.34 and 0.71 |
| 79.05 to 90 | a thatched cottage, lime washed | 2 | 3.8, 7.0 | thatch, eyebrows over both upper windows | lime render | door 0.5; window 0.24 below, 0.3 and 0.7 above |

On the right going down: the top wall, behind it the old high wall with three stepped buttresses (4.2 m), and the fence (see "The course"). The houses step down the slope with the lane: each stands on its own floor at the lane's height there.

Thatch is drawn as one rounded mass along each thatched building (`HillScene.thatchMass`, `THATCH`): its cross-section thick and soft, rolled over at the eaves front and back, a little full on the slope and rounded over the ridge, drawn in at each end like a half hip, and swept up in an eyebrow over each upper window that breaks the eave. A building's windows come from its layout or by the rule (`HillScene.windowPlaces`). The houses further down keep the rule's layout.

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

The basket is as the stills have it: a deep willow basket, longer than it is wide, its walls flared a little to a thick rolled rim, a stake up each corner, and a low bentwood handle that arches from the front rim to the back, about 0.2 m over the rim. It holds twelve plain tin loaves, four across and three deep, their domed crowns over the rim. The weave is a texture (`HillTextures` `wicker`, 0.12 m a repeat): `HillRider.wicker` lays it on the model's willow finishes, with UVs in metres from the side each face faces (`HillRider.boxUV`). The bicycle has no lamp.

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

The village's colours are decoded from sRGB once, in `HillScene.rgb`. Each mesh says that its colours are linear (`geometry.userData.linearColors`), so `Graphics.fixColorSpaces` leaves it alone. Before 2026-11-25 each colour was decoded three times (by `THREE.Color`, by `HillScene.rgb` and by `fixColorSpaces`): the thatch 0xaa9c82, 0.40 once decoded, came to the shader as 0.016, and the light was set far too strong to make up for it.

`HillRide.LIGHT` is the one light of the whole ride, the climb and the descent alike, so nothing changes when the camera hands over from the climb to the descent (the owner):
- a low golden sun, 10 degrees up, at world heading -0.1 rad: down the lane from the top, a little to its right going down the top stretch and a little to its left down the main straight. The climbing boy is lit from behind, and the wet cobbles glint ahead of the climb's camera at the top and ahead of the chase camera down the main straight;
- a warm grey haze, and the sky's fog preset;
- a weak fill (ambient 0.1, hemisphere 0.32) and the baked sky's share on what the ride draws (`envIntensity`, 0.16; the panes keep their own sky). The game's sky lights every standard material through `scene.environment`, and at its full share it washed the true colours out;
- the cobbles wet the whole ride: smoother (`cobbleRough`, 0.45 of the dry roughness), more relief on each crown (`cobbleNormal`), darker (`cobbleTone`). Each crown has its own glint, and the glints make a glare path towards the sun; with the sun behind the camera they are dark and wet, never a mirror.

`hill-compare` measures the mean colour of the lit house fronts in each still and in the game. One light costs the stills' match: against the climb's stills the whole frame is 19.4 levels off (7.5 with the climb's own light), against the descent opening's lit house fronts 7.8 (6.8; 32 before the colours were decoded once). The climb's backlit backgrounds (shots 4 to 6) stay lighter than the stills, and its wide shot darker.

The ride runs the same effects that a world ride runs (js/effects.js): the cascaded shadows (the bike is `game.vehicle`, the sun is `game.sunOffset`), bloom, the grade, the ambient occlusion, the sky's sun glow, and the Quality ladder (`Game.adaptResolution`). The window panes are mirror glass on a sky of their own (`HillScene.paneSky`): a golden band on the horizon, brightest towards the sun. A pane facing the sun glints gold.

## The camera

`HillRide.SHOTS` is the named shots matched to the reference frames: `opening`, `climbFoot`, `climbShop`, `shopSide` and `basket`. Each shot is a camera place and a target as [s, across, up] on the lane, and a field of view. `hill-compare` draws each shot beside its frame.

The opening shot comes from `RULE.opening.camera` (`HillRide.openingShot`): the camera's place, its turn and its pitch and a 26.1 degree lens, fitted to the opening frame's pixels. The boy stands at `startAcross`. `hill-overlay` checks it (see Checks).

The ride holds on the opening, braked with a foot down, until the player pedals (not before 0.8 s): the bicycle does not move by itself. The band plays from the start: the hill has its own mute, off unless the player pressed M on the hill (`HillRide.SOUND`, kept under its own key `twistyHillSound`). The ride puts it on the sound manager for the page only, so the motorcycle game's mute (on by default) is never read or changed. M on the hill mutes or unmutes the hill and keeps the choice. The browser still needs a first key or tap; the first key that starts the day wakes the sound. Then the camera cranes up and back to the view the player chose with Z, eased over 2.6 s (a smootherstep of the place, the aim and the lens), with no cut:
- behind: 8.5 m back, 3.6 m up, a 46 degree lens;
- cinematic;
- in front.

After he gets on the camera never cuts. The cinematic view (`HillRide.CINEMA`, `CUTS`) is a chain of 19 cameras down the course, and a change of camera is a glide, not a cut (`GLIDE.cutS`, 1.2 s, longer when the cameras are far apart, at most 18 m/s on the mean), its aim held on him and its path lifted in an arc over the roofs (`arcM`, at most `arcMostM`); Z glides to the chosen view (`viewS`), and the ending's camera eases its lens with its place. `tests/unit/hill-day.test.js` rides the whole day in the behind and the cinematic views and fails on any step between two frames (0.8 m, 0.1 rad of aim, 2 degrees of lens) except in the fades. The cameras: from doorways, high windows, low by the cobbles, two of `SHOTS`, and in three side roads' mouths. Each turns to follow the bicycle and closes its lens to keep him 3.2 m of the picture's height. When the camera will not see him in 0.8 s (behind a building, or past 45 m), it glides to the camera that sees him longest down the course (`cinemaPick`). There is never a change sooner than 1.5 s after the last. After a fall or R it picks afresh. The ending holds its own camera.

The ending (`HillLane.RULE.end`, `HillRide.updateEnding`) goes through these phases:
1. Past `stopS` the camera eases to a fixed point high behind, looking down the last curve, and holds there.
2. Once the bicycle has been out of sight for 0.4 s (`HillRide.seen`: the frustum and `blocks`), the picture fades out and the band stops.
3. The last picture comes up: the loaf in a warm side light. The band plays its last chord (`HillMusic.close`). `HillLoaf` (js/hill/loaf.js) builds it under the fade, only when the ride reaches its end, so it is outside the village's budget. It is a crusty bloomer: a fine grid displaced by its own field, with a flat base, five deep slashes with torn raised lips, and a split along one side. Its colour, normal and roughness maps come from the same field: golden to deep brown, darker on the ridges, pale in the cuts, flour on top, the crust's crackle and the crumb's pores. One slice is cut off and lies on a worn board with grain and knife marks, with a bread knife and crumbs. The table behind goes soft, as a short lens makes it.
4. The card shows.

## The time and the board

`HillBoard` (js/hill/board.js) holds the clock and the board's data. Its board id is `village-hill-v1`. The id never holds the address key.

- **The start.** The clock starts when the bicycle rolls off the opening hold: the player pedals, and the hold ends (`HillRide.beginTiming`). The bicycle never starts by itself.
- **The finish.** The finish line is `HillLane.RULE.end.stopS` (s 444), on the last left. There the camera stops and the ending begins (`HillBoard.finishS`).
- **The gates.** Three timing lines, `HillBoard.GATES_S`: s 120 on the main straight, s 230 and s 340 before the sharp right.
- **The clock.** It counts physics time, one step of 1/120 s at a time (`HillBoard.step`), so a slow frame changes nothing.
- **A fall.** The in-place restart adds 5 s to the clock and counts one restart, as on a world ride (`LIMITS.penaltyMs`).
- **A missed door.** A door passed without its loaf adds 5 s to the clock (`HillDay.MISS_MS`, `HillBoard.penalise`). The cost is in every later gate time and in the finish, so the proof chain signs it. The board ranks this time. The loaves, the freewheel and the clean mark are not on the board: they show on the end card only.
- **R.** R starts the day again: the same day's number, the clock and the run from the day's start (the climb on the first day, the stall on the days after). It drops the open session.
- **No clock on screen.** The HUD is hidden on the hill ride, and nothing draws the time until the card. `tests/unit/hill-board.test.js` holds this.

The end card (`HillRide.showCard`) is a dialog of the one stack (js/modals.js). It shows:
- the time, with the falls and their seconds;
- the rider's best on this device (`HillRide.BEST_KEY`), and "a new best" when it is one;
- the board's top 10 (`getLeaderboard`);
- the button "Put my name on the board" (N). It opens the game's own name entry (`Game.showLeaderboardEntryUI`). After the name, the card reads the board again;
- the buttons Ride again (R) and Leave (Esc). The keys go through each button's `data-key`, not through a listener of the card.

The run goes to the board through the game's leaderboard path: a session from `startRun` at the roll-off (`LeaderboardService.openSession`), the HMAC proof chain over the three gates, and a signed finish with the restart count (`RunSession`). The server holds each part of the course to its own limits (`functions/hill-courses.json`, `HillBoard.row`):
- the floor: the part's length at 30 m/s. The fastest test ride tops out near 20 m/s;
- the ceiling: the part's length at 0.5 m/s, plus 15 s for each restart;
- the whole: the sum of the floors plus 5 s for each restart, and at most 15 min.

`tests/unit/hill-board.test.js` holds `functions/hill-courses.json` equal to `HillBoard.row`. If a gate or the finish moves, change the board id (`-v2`) and the row together.

These rides are never sent. The clock still runs, and the card says that the ride is not on the board:
- debug mode (`?debug`);
- test data (`?worldData`);
- a tuned ride, at its start or at any moment of it (`Tuning.ride.tuned`);
- a shot that a tool holds (`forcedShot`);
- a place that a tool sets: the bicycle moves more than 2 m along the lane in one step (`LIMITS.jumpM`).

The card never shows an error for the board:
- No leaderboard service, or the board cannot be read: "Board unavailable", and the time stays.
- The server has no row for the board (the functions are not deployed): "Board unavailable: the online board for this ride is not open yet". Nothing is sent.
- The session failed (offline, rate limited): the card reads the board, but it shows no name entry.

## The day

`HillDay` (js/hill/day.js) runs the ride as a day's work. `HillRide` calls it in `beginClimb`, `climbStep`, `endClimb` and `dayStep`.

- **The climb.** The climb follows the reference stills of the boy who pushes the bicycle up the lane. The boy starts at s 64, behind the wall at the bend below the top stretch, facing up the lane (`HillDay.CLIMB`). The basket is full: he brings the bread up. The hill is too steep to ride, so he walks beside the bicycle on its left and pushes it. The pedal key walks him on at about 1.5 m/s (`walkMs`), and when the key is let go he holds the bicycle on the brake. `HillBicycle.walking` is set for the climb: the cranks are parked with the pedal on his side up and forward of the bracket (`HillBicycle.WALK_CRANK`), clear of his boots, the legs stay in, and `walkM` counts the metres walked. `HillRider.WALK` draws him as the stills have him: his hips by the saddle beside the frame and low, leaning over the bars (`bendRad` 0.31, 0.44 when tired: half what it was, the owner found him bent too far) with his arms out to the grips, his feet pushing from behind (a lunge), his head lifted to look up the lane (`headUpRad`), and long steps from `walkM` (1.3 m a pace), each foot on the cobbles under it. Half way up he tires (`WALK.down`, 20 to 29 m walked): his head drops and he leans further over, then he looks up again for the top. His head has the stills' proportions, measured as ratios only: the face 0.72 as wide as it is high (chin to crown) and deeper than wide, the cap about 1.28 as wide as the face, full and set forward and low on the brow, the neck short under the scarf (`tests/unit/hill-ride.test.js` holds the ratios). His face is painted on the head's own finish (`face`) by `HillRider.face`: soft brows, eyes, a mouth and a little ruddy colour in the cheeks, drawn from scratch on a canvas and laid on from the front (`HillRider.FACE`, `faceUV`); it is no one's face. He wears a grey knitted jumper, a dark scarf, a flat cap, dark breeches and black leather boots to the middle of the calf: a rounded toe cap, the instep up to the ankle, a heel round behind it, on a darker sole and low heel. The boot's leg is on the shin and its foot on the `foot` node, and the two overlap at the ankle, so no gap shows when the foot turns. His clothes and skin are shaded smooth (`HillKit.smooth` in tools/blender/hill_bike.py; the bicycle keeps its crisp edges). His sleeves are full at the shoulder and elbow, with ribbed cuffs; each hand has a palm, fingers curled round as on a grip and a thumb. The jumper has a ribbed band at the waist. The scarf is knotted at the neck, its two ends hanging down his front as curved strips with a fringe. The face is still painted from scratch. Each boot is built on its own leg's line, over its sole (a test holds the boot and the sole together across the foot). Each boot rolls through its step (`WALK.foot`): the heel comes up onto the toe at the end of the stance, the toe staying on the cobbles, and swung forward the toe comes up so the heel comes down first; neither the heel nor the toe goes under the cobbles. When he stands (under `stepMs`, at the stall or held on the brake) his feet come together under him, one 0.1 m ahead. His long grey-cream apron hangs clear of his legs in every pose, on foot and on the saddle (`HillRider.APRON`). It is two nodes: `apron_long`, from his waist to about his knees, and `apron_hem`, from there to his shins. The upper part swings forward just enough to pass in front of his thighs and knees, 6.5 cm clear of a leg's middle square to the sheet, and hangs straight down when no leg is ahead; the hem hangs from its foot clear of his knees, shins and ankles. On the pedals it lies over his thighs and falls from his knees. The model's `head` and `apron_long` nodes hang on `boy`, and `apron_hem` on `apron_long`. `tests/unit/hill-ride.test.js` holds every leg behind the sheet on foot, stood, tired, on the pedals at every crank angle, with the legs out and with a foot down. The climb is one continuous shot (the owner): the camera pans, changes its lens and moves to frame each moment the stills show, joined by smooth moves, with no cut (`HillRide.CLIMB_SHOTS`, `GLIDE`). It passes through these framings:
  - **The wide shot** (`wide`), held still for the first 9 m, then over the next 6 m it glides into the long lens head on (`GLIDE.wideM`: a smootherstep of the place, the aim and the lens). The camera is low on the right of the lane, just inside the fence, and its posts stand close at the right of the picture. A long lens (15 degrees) looks across the bend at the cottages. He comes up past the far end of the fence, small against them.
  - **Head on.** A long lens goes back up the lane 16 m ahead of him (`trackM`), on his line. It keeps 1.4 m of picture height at his distance (`trackFrameM`), so the cottages behind him stand large and close.
  - **The stop** (`stop`), uphill of the stall, nearly in line with its front. The camera stays there and turns with him, aimed half way from him to the stall's front (`stallAim`), so the stall runs away at the left of the picture. The lens opens out as he comes on, and then closes in to his distance (`frames`, `HillRide.climbFrame`).

  At the start a plain prompt in the top middle of the picture names the key: "Press ↑ or W to push the bicycle up the hill", or on a touch screen "Hold GAS to push the bicycle up the hill" (`HillRide.START_PROMPT`). It goes once he has moved off 0.3 m. Held at the top before he pushes off (once the picture is up) it reads "Press ↑ or W to ride down the hill", or "Hold GAS to ride down the hill".

  The player steers him up the lane. The steer keys are the bicycle's own, as on the descent: the left key turns the bars and him to his left, though the climb's cameras face him (the owner found keys turned for the cameras backwards). `tests/unit/hill-day.test.js` holds it in the wide shot, head on and at the stop. The stall stands at the top on the left going down (`HillDay.CLIMB.stall`), its long side along the lane. Over the last 5.5 m (`turnInM`) he wheels the bicycle in to it, whatever the keys say: he steers for its meeting place (`meet`) and slows to 0.55 of his pace (`slowM`), and the climb ends there, about 56 degrees across the lane, side on to the camera. The climb takes about 25 s, so the last moments of the stills are his arrival, not the restock. After a fall he stands up and turns to face up the lane. The climb is not timed.
- **The stall** (`HillDay.stall`). A trestle table along the lane's edge at the top on the left going down, its top level and each leg down to the cobbles. On it: a pair of scales with a brass pan, willow baskets of greens and roots high on a shelf at the back, carrots and a marrow along its front, a tray of tin loaves and a big basket tipped up at the back. Under it a churn and a crate. Over it a blank board hangs from an iron arm on a post. The board has no words on it.
- **The restock and getting on.** At the stall, the bicycle stops for 1.4 s (`restockS`) and the basket is made up to six loaves. Then the picture fades to black (`HillRide.FADES`, 0.5 s down, 0.7 s up); in the dark he turns the bicycle round where he stands to face down the lane and gets on, and the descent starts from there. The picture comes up where the camera was, and from there the camera glides in one smooth move to the chase camera behind him (`GLIDE.handS`, 2.6 s) and holds there until he pushes off. The fades when he gets off (the start of each day's climb, up from black) and when he gets on are the only breaks in the picture. The opening shot is held only when the day is not loaded.
- **The doors.** Four front doors wait for bread (`HillDay.DOORS`): s 104 on the left, s 174 on the right, s 259 on the left, s 343 on the right. Each has an empty bread crate on its step. While it waits, its door stands open on a warm lit hall, the hall's light lies in a soft pool on the flags before it, and a woman in a coloured dress and a white apron waits on the flags on its uphill side, so the rider coming down sees her first (`HillDay.WAITING`). At the next door the hall and the pool are brighter, the lamp over the door is lit, and she waves. Once her bread is delivered she steps back in and the door shuts; a missed door shuts too. No sign or text marks a door.
- **The throw.** Q throws a loaf to the left, and E throws one to the right. On a touch screen, two buttons do the same (`VirtualControls`, shown on the hill ride only). The loaf leaves the basket with the bicycle's speed, plus 5.2 m/s to the side and 2.4 m/s up (`HillDay.THROW`). It flies, bounces and slides. If it comes to the doorstep or the door, that door has its bread, and the loaf lies on the step. A loaf that hits a house front gives a knock and drops into the street. Nothing breaks. At 10 m/s, a throw 6 to 9 m before the door delivers.
- **The loaves.** The basket holds 6. Each throw takes one. A fall spills what is left. A knock on a kerb over 5 m/s shakes one out. A loaf in the street stays there, and a wheel that hits it knocks it and loses a little speed. A clean round is every door delivered and no loaf lost.
- **The hazards.** They are the same on every ride, so the board stays fair, and each leaves room to pass (`HillDay.HAZARDS`):
  - a cat at s 205 runs across the lane when the bicycle is 30 m short of it. A wheel into it is a wobble. She gallops (`HillDay.CAT_GAIT`): her stride matches the ground she covers, each foot stays put on the ground through its stance and swings forward folded clear of it, and stopped she stands with straight legs;
  - a horse and cart sets off up the lane from s 262 at the roll-off, at 1.2 m/s, on the right going down, and stands at s 30. Into it over 4 m/s is a fall. It is drawn from `assets/hill/horse.glb` (tools/blender/hill_horse.py) by `HillHorse` (js/hill/horse.js): a heavy bay horse with white feathers and a blaze, in black harness with a collar, hames, a cart saddle, breeching and blinkers, between the shafts of a two-wheeled cart with twelve-spoke wheels, milk churns and sacks, and a carter on the seat with the reins. It walks the horse's own four-beat walk (left hind, left fore, right hind, right fore, a quarter stride apart, each hoof on the ground 0.62 of the 1.6 m stride), the cycle run at its speed over the stride so a hoof on the ground stays put; each leg bends as a horse's does (the knee forward, the hock back) and swings about the shoulder or hip above it. The head nods twice a stride, the body rises and falls, the tail swings and the ears turn now and then. Stood at the top it breathes, rests one hind leg then the other on the toe, and now and then tosses its head or stamps. The wheels turn at the speed over their radius, the bed follows the shafts and rocks on the cobbles, and the carter sways with it. Past 40 m the plain model is drawn (12,800 triangles near, 6,200 far). `tests/unit/hill-horse.test.js` holds the footfall order, no hoof sliding on the ground, the legs together and the stand. If the file does not load, the plain blocks stand in and the console says why;
  - washing on a line along the left house fronts at s 318 blows out over the left of the lane, on a 5 s cycle. The middle of the lane is always clear. On the line hang a sheet, a shirt with its sleeves and a towel with a band at its foot, each in soft folds deeper towards its foot (`HillDay.clothPieces`, at most `foldM` 3.5 cm either way) and held by wooden pegs. Through it is a wobble. The sheets hang plumb at rest and blow out only towards the lane, so their line stands 0.15 m (`HillDay.WASHING.clearM`), the folds' depth (`foldM`) and 1 cm for the lane's bend under the wider pieces (`bendM`) in from the nearest face on that side along its length: a front wall or railing at the flags' edge, a porch, a bay, a house front or a wall in a gap (`HillDay.washingFace`, `washingLine`). Before, the line hung over a pub's front wall and the sheets passed through it. `tests/unit/hill-day.test.js` samples every point of every piece as drawn, folds, sleeves and pegs, over 41 moments of a cycle against the nearest face and the houses' boxes. The washing in the gardens and the back yards hangs still, between its own posts, clear of the walls;
- **The freewheel.** The longest distance ridden with the legs out, no pedal and no brake.
- **The loop.** On the end card, G (Next day) goes round again, a day on. Only the first day starts with the climb on foot (the owner). From the second day the day starts at the stall, the restock done and the basket full: the picture comes up from black, the camera glides from the stall to the chase camera, and he rides down. The day's number lives in the page's `HillDay` and is not kept: a new page is the first day.

The end card adds the day, the bread delivered out of the doors, the loaves left and lost, and the longest freewheel with its best on this device. A clean round shows beside the time.

## The music

`HillMusic` (js/hill/music.js) plays the slow theme of the Largo from Dvorak's Ninth Symphony, which is in the public domain. It is set for cornet, two horns and tuba, and every voice is synthesised through the game's sound graph. It follows Mute and Volume.

## Checks

- `tests/unit/hill-board.test.js` checks the clock, the server's row against `HillBoard.row`, and rides down the lane (pushed all the way, with no brake, calm, with falls) against each part's floor and ceiling. A ride signed by the game's `RunSession` goes onto the board through the real handlers. It also checks the rides that are never sent.
- `tests/unit/hill-day.test.js` checks the day on the real lane and bicycle: the doors; a throw at the right moment delivers, and too early, too late or to the wrong side does not; each throw takes a loaf; a missed door costs 5 s on the clock; falls, knocks and loaves in the street; each hazard passed on the clear line and met on its own line; the freewheel; and the climb (20 to 40 s, in sight of the camera most of the way, the wide shot, the long lens head on and then the stop by the stall, wheeled in to the stall side on, then the restock and the hold).
- `node tools/terrain-check.mjs hill-look --gpu --script tools/hill-day-look.js --out <dir>/hill-last.png` rides a whole day on the real page and writes pictures of the climb, the restock, a throw, a delivery, the next door's lamp, the cart, the washing and the end card.
- `tests/unit/hill-card.test.js` checks the end card in a page: no time during the ride; the time, the best and the top 10 at the end; N, R and Esc through the stack; and the words for a board that cannot be read.
- `functions/test/hill.test.js` (`cd functions && npm test`) checks the hill rows and the handlers' limits for each part.
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
  - **The budget.** The village is under 340,000 triangles and 40 draws. The cap was 300,000; the shrubs, hedges and yews took it to about 332,000. On one GPU, in turn on one page, the descent's frame from the chase camera took 10.6 to 12.1 ms (median) with them and the same with the plain clumps they replaced, at 1280 by 720.
- `tests/unit/hill-ground.test.js` checks the land:
  - **Nothing floats.** At each corner and the centre of each piece in `HillScene.stands`, the foot is at most 5 cm over the ground (`surfaceAt`).
  - **The paving.** The land never shows through the lane, its flags or a side road. Just past the flags, where nothing stands, the land is within 0.3 m of the flags.
  - **The fall.** Behind each house the land is at the house's floor; 18 m out on both sides the land falls as the lane falls.
  - **The grids.** The fine and the coarse grid meet edge to edge, with no gap.
- `node tools/terrain-check.mjs hill-overlay --gpu --still <file>` draws the opening frame, the game's opening shot at the frame's shape, and the two at half each, with the frame's key points (yellow) and the game's (cyan), and gives the mean distance between them in pixels of an 857 px high frame.
- `node tools/terrain-check.mjs hill-shots --gpu` takes the ride's pictures, each with its mean luminance, into `~/Library/Caches/twisty-world/hill-shots/`.
- `node tools/terrain-check.mjs hill-compare --gpu --stills <dir>` makes side-by-side sheets of the reference stills (private) and the game from the matching shots, with the mean colour of the lit house faces in both. They go into `~/Library/Caches/twisty-world/hill-shots/compare/`.

## The loaves spill

When the boy comes off, the basket's loaves fly out (`js/hill/spill.js`, `HillSpill`): the model's loaves (the `loaf` material on the `basket` node) are hidden, and six loose loaves leave the basket with three quarters of the bicycle's speed, a lift of 1.6 to 2.8 m/s and a tumble. They bounce low off the cobbles, slide to rest on the lane's fall, and the house fronts turn them back. They lie where they fell, with the basket empty, until R puts them back. Every loose loaf, spilt or thrown at a door (`HillDay.wearLoaves`), wears the basket loaves' material and their mean colour (`HillSpill.wear`). The model's colours are linear bytes, so the loose copy is marked `linearColors`: before, the page decoded it a second time and the loaves drew dark (0.30 against 0.59) the moment they fell out. A second fall with an empty basket throws nothing. The throw is seeded, so it is the same for the same fall.

In a fall the boy never passes through a building: `HillVehicle.holdRiderOut` puts his body (`RIDER_FALL.bodyM`) back out through the nearest wall of any footprint in `HillLane.solids` (the cottages and the side roads' houses) and takes away his speed into it.

## The stones are domes from either side

three r150 draws a normal map inside out on the back face of a two-sided surface: it builds the tangent frame from the normal already turned to the viewer, then turns it again by the face's side. The lane is wound face down, so each cobble was lit on the side away from the sun: a hollow, not a dome. `HillScene.bumpsBothSides` drops the second turn in each normal-mapped hill material (the village, the rider, the day's things and the last loaf), so a surface shows its stones the same way from either side. The maps were right: on every stone map (the cobbles and each finish of `HillTextures`) each flank leans away from its stone's top. `tests/unit/hill-ride.test.js` ("the stones are domes, not hollows") checks the maps and the patch on every material. If three's chunk changes, the patch throws and names the check to make again.

## The far trees

The far trees (`HillScene.trees`, `FAR_TREE`) are a crown of 20 faces on a trunk of three, each turned its own way, with no tree nearer the lane than 100 m (`nearM`) and none past the drawn land. Nearer, the crown's few faces read as a grey shape in the haze, and a crown alone looked hung in the air.

## Shrubs, hedges, yews and the small things

The owner found the shrubs plain: round faceted blobs and stacked cones. Each shrub is now drawn from one of two shapes (`HillScene.shrubShape`, `SHRUB`): seven rough leaf clumps of twenty faces, one in the middle and one over it, their corners pushed in or out so the outline is broken, darker underneath, over three thin stems that reach the ground. Each shrub is turned its own way, its size and height vary by a quarter, and it takes one of four tints over the shape's own four greens. A piece of hedge is four clumps along its line and no stems (`hill-hedges`). The churchyard's yews are one tapering column of clumps on a short trunk (`yewShape`), not four stacked blobs. Their variety comes from a random sequence of their own (`repeats.shrubRand`), so nothing else in the village moved. `tests/unit/hill-ground.test.js` holds the broken outline, the stems, the tints, the yew's taper and the stones' shapes.

The gravestones are arched headstones with their edges cut back (`headstoneShape`), each a little out of true and in its own weathered tone; the crosses stand on a stepped base (`crossShape`). A door's bread crate is slatted (`HillDay.crateShape`), and its lamp is an iron lantern on a bracket with a glass that lights (`lanternShape`). The bench has three seat slats, two back slats and arms; the pump has a cap knob, a collar, a plinth and a knob on its handle. The cat is a round dark tabby with ears, a white bib and paws, and a tail that curves up.

Every wall's coping is a bed of dressed stone that overhangs both faces (the drip) under a saddleback that rises 7 cm to a ridge along the wall (`HillScene.coping`, `COPING`), and each gate pier has a cap slab and a low pyramid (`pierCap`). The stall's goods have their shapes: cabbages (a firm head in cupped outer leaves), turnips with green tufts and onions with dry tips, red and russet apples with stalks, carrots with feathery tops in a tied bunch, a marrow with pale bands and a stalk, a tray of brown eggs, and tin loaves risen over their tins. Its board stays blank: no words, marks or names. Chimney pots are turned shapes (`HillScene.potShape`): a flared foot, a body, a band and a rolled rim, open at the mouth; each stack has an oversailing course under its cap. A window box's planting is one piece (`windowPlants`): leaf clumps, stems, sprays trailing over the front, and flower heads with yellow eyes in the box's own colour, drawn as two meshes (`hill-window-plants`, `hill-window-blooms`). For room, the far land's cells are 30 m, not 24 m (`HillLand.RULE.valeCells` 80); the land near the lane is drawn on its own 2 m grid as before.
