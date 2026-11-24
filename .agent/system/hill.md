# The hill ride

A short ride of its own, opened from the address with RideMode's hill key (`RideMode.HILL_KEY`, js/ridemode.js; the only place the key is written). It shows no menu. A boy on a heavy delivery bicycle starts at the top of a steep cobbled lane in a stone village and rides down it. At speed he takes his feet off the pedals and holds his legs straight out to the sides. The ride has no clock, no gates and no board, and it sends nothing anywhere. The classic legs and the world are not touched: the ride uses the game's renderer, lights, input and sound only. If its model does not load, the classic legs open with `RideMode.HILL_FAIL_NOTE`.

The owner asked for it on 2026-11-24 and gave key frames of the scene he had in mind. The frames are private and stay out of the repo. Only shapes, sizes and colour numbers come from them. No bread brand, logo or wordmark is on any model or text, and the frame plate on the bicycle is blank.

## The parts

- `js/hill/lane.js`, `HillLane`: the lane as data, from one seed (`RULE.seed`), the same on every load.
  - The fall is set by `grade` knots: gentle at the top, about 22 % in the middle, flat at the bottom. Over the ride it falls more than 20 m.
  - Near the bottom it bends towards the cottages (`heading` knots).
  - The cottages are on the left going down. They stand end to end, each on the lane's level at its middle.
  - On the right is a raised path with a rail, and a 6 m wall with buttresses.
  - `cobble(s, across)` gives the cobbles as low domes, staggered in rows, 12 mm high.
- `js/hill/bicycle.js`, `HillBicycle`: the physics as data (`RULE`). The values are as follows.
  - Mass is 74 kg. Rolling drag on the cobbles is 0.04. The drag area is 0.7 m2.
  - There is one gear: 4.2 m for each turn of the cranks. The boy's push is 150 N when the cranks barely turn, and it falls to nothing at 92 turns a minute (6.4 m/s).
  - A freewheel: the cranks stop when he does not push, or when the bicycle goes faster than his feet can turn them.
  - The rod brakes give 2.4 m/s2. Past the end of the ride he pulls up at 4 m/s2.
  - The cobbles under each wheel lift and pitch the frame (`bounce`, `pitch`).
  - Steer moves the bicycle across the lane, and it stops at the lane's edge.
  - The legs come out above 6.5 m/s downhill after 0.4 s without pedalling. They go back under 4.2 m/s, or when he pedals at a speed his feet can follow. The pose follows over 0.45 s.
- `js/hill/rider.js`, `HillRider`: the model (`assets/hill/bicycle.glb`, made by `tools/blender/hill_bike.py`) posed from the state.
  - The wheels spin. The cranks turn, and the pedals stay level.
  - Each leg is built from hip to ankle by a two-bone solve: on its pedal, or out at `LEGS_OUT`.
  - Nothing is allocated in a frame.
- `js/hill/scene.js`, `HillScene`: the village as drawn.
  - The cobbles are a canvas texture with a bump map. The texture is drawn from the same sizes that the physics reads.
  - The path, the rail, the wall with its buttresses, the cottages (thatch or tile, stone or lime, windows, doors, chimneys) and a lower village.
  - The vale has fields and trees, in a warm haze.
  - Shapes of one finish are joined into one mesh.
- `js/hill/music.js`, `HillMusic`: the slow theme of the Largo from Dvorak's Ninth Symphony (public domain), set for cornet, two horns and tuba. Every voice is synthesised through the game's sound graph, so it follows Mute and Volume. It starts after the first key press wakes the sound.
- `js/hill/ride.js`, `HillRide`: runs the ride.
  - The physics runs at a fixed 1/120 s step.
  - It has three views (Z): behind, from the top of the lane (the lens closes in as the boy gets further away), and in front.
  - R starts again from the top. M is sound. Esc goes to the plain page.

## Checks

- `tests/unit/hill-ride.test.js` checks these things:
  - the address and the key;
  - the lane: the same on every load, its fall, its cottages and its cobbles;
  - the bicycle: the fall alone takes the legs out before 80 m, the top speed is 10 to 17 m/s, and it stops past the end; the pace when pedalling, the freewheel, the brakes, the legs coming back in, the cobbles' shake and the lane's edge;
  - the music's score;
  - the pose on the real model: the ankles on the pedals at every crank angle and the legs keeping their length, and the legs out straight to their own sides.
- `node tools/terrain-check.mjs hill-shots --gpu [--out <dir>]` takes GPU pictures of the descent with no input. It takes them at the start, with the legs out and halfway down, each from the three views, with the speed and the place of each. It also checks that the band plays. The default folder is `~/Library/Caches/twisty-world/hill-shots/`.
