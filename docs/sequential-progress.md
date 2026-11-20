# Sequential progress

One job at a time, in the order A to H. Each entry: the job, the commit, what the check proves, what is left.

## A. The black screen (old job 6)

- Commit: `7f055f7`
- Cause: a bike put down on a ride vertex's exact `s` took a NaN height (0 / 0 in `Vehicle.updateElevation`). The NaN reached the fog density, and bloom spread it over the frame.
- Check: `tests/unit/world-finite.test.js` (5 of 9 tests fail on `925d864`, 9 pass now) and the GPU probe `node tools/terrain-check.mjs world-vertex --world tremola --gpu`. The probe fails at 17 of 28 put-downs on `925d864` (black or one flat colour) and has no failure now.
- Left: nothing.

## B. Side-road walls and bridges (old job 1)

- Commit: `e8863f6`
- Check: `tests/unit/world-structures.test.js` fails 3 of 5 tests on `7f055f7` and passes now. Structure triangles in a carriageway 4111 to 52, seams 3531 to 3, coplanar pairs 8258 to 282. The full unit suite passes (`world-clearance` only when run alone on a loaded machine: its hooks time out).
- Proof: at km 6.5 the side road's stepped slabs are one deck on a pier.
- Left, for job C: the `world-floating` probe has 25 failures before and after (road edges and walls against the land). 5 more side-road points stand over the land with no deck (6 to 11), on the lifted ramps. The held limits in the structures test (52, 3, 282). An open wall end at km 2.0 with a hole behind the stone (reported from the ride; it is on `925d864` too).

## C. The land meets every retaining wall (old job 9)

- Commit: `d3d4c6c`
- Decision: the land is shaped to the wall, not the wall to the land. The wall stands where the physics stops the bike and the parapet is, so it cannot move; the land is an 8 m grid, which cannot hold a wall.
- Check: `tests/unit/world-walls.test.js` and the GPU probe `node tools/terrain-check.mjs world-walls --world tremola --gpu`. Both read the drawn triangles. On `8911b42` the probe has 6 failures: 13 buried faces, 45 the land climbs, 2 hanging feet, 29 runs under 10 m, 28 pairs of runs under 12 m apart, 29 open ends. Now 4, 10, 0, 1, 0, 19, held in `WALL_LIMITS`.
- Also: structure triangles in another road 52 to 32, solid walls on a junction stub 1 to 0; the stone is one face with its parapet; the near road has a fixed depth offset only.
- Left: the ramp of land at a wall's end inside a hairpin (km 6.1, 6.2); the 4 m of open edge from a bridge's last row to the next row; side roads over another road with no deck; the deck and parapet that start on the Bedrína junction (km 1.3); the side road that ends in a step at km 1.8. These are the next job, "junctions meet".
- Left, small: `world-watertight` sees 6 pixels through the land in 6 of 792 views (before: 0), and 188 wall or apron edges over the land (before: 168). The first window loads about 15% slower.
- Left for job H: a house's plinth (a baked texture) and the footing built under it (procedural stone) do not match.

## C2. A side road meets the ride (added after job C, from the pictures of km 1.3 and km 1.8)

- Commit: `4e68ed1`
- Rules, in the builders and for every world (`.agent/system/world.md`, "A side road meets the ride"): a side road stands at the ride's height in its band and ramps back to its own; no deck starts in a junction and a hillside road stands on a wall; a mouth's edge stands on a slope; a side road's wall is joined to the ride's; a wall goes on to a bridge's first row.
- Check: `tests/unit/world-junctions.test.js` and `node tools/terrain-check.mjs world-junctions --world tremola --gpu`. Both read the drawn triangles of all 26 side roads of the 24 junctions. On `8fa83fe`: 8 with a step (0.23 to 0.81 m), 2 under the land, 3 on a deck in the mouth, 13 with an open edge. Now: 0, 0, 0, 0. The whole unit suite passes (102 files, 2581 tests).
- Proof: `proof-j/before` and `proof-j/after` in the session scratchpad: Bedrína (km 1.3) from the valley, the junctions at km 1.8, 2.3 and 12.4.
- Walls: the land climbs 12 faces (10 before: a hillside deck became a wall at km 2.4); open ends 15 (17 before, read with the same rule); two bridge ends of the ride are closed.
- Left: the ramp of land at a wall's end inside a hairpin (km 6.1, 6.2) is not touched. Side roads over another road with no deck stay. A wall's last segment at a bridge has no parapet (4 m).
- Left, measured: `world-watertight` 119 wall top edges with no road beside them (114 before) and 208 wall or apron edges over the land (188); `world-floating` 22 side-road points over the land with no deck (17: the hillside fill is read as open), and its view at s 3257 shows 729 pixels of a road's underside (309).
- Added, `12c1518`: the gore of a junction is paved (the strip between a side road and the ride, the corner behind a wall join). No check reads paving yet.
- Tried and taken back, for the wall's end at a hairpin (km 2.0, s 2077 on the upper leg: the wall starts 1.3 m high, a dark return and a pale slab of slope beside it): (1) the ride's wall going on until the land is 0.5 m under its top: the walls' check went from 12 faces the land climbs to 44 and from 0 hanging feet to 12, because the land's cut and the feet are planned from where the wall first stood; (2) lighting the return as the wall's face and a steep slope by its own normal: the slab stayed and the bank got darker hard-edged patches. Not solved. It needs the wall's plan, the land's cut and the check's end rule changed together.

## Ground under the verge on a wall, and the debug skip's second press

- Job: the verge fades to nothing at its outer edge; on a retaining wall nothing lay under it, so the rider saw through it to the bank (Bedrína, before the junction). `RoadMesh.edgeWorks` now lays ground under the verge on every wall segment, never in a carriageway (`guard.any`). A second N press in debug mode now goes to the following checkpoint.
- Check: `tests/unit/world-meshes.test.js` holds the ground's height and width and that none lies in a carriageway. Junction check all 0; structure audit 32 in a carriageway, 7 seams (unchanged); walls 4 buried, 12 climbed, 0 hanging. Whole unit suite on alex-ci: 96 of 98 files in one run, the two others (`world-meshes` before its update, `world-clearance` on a hook timeout under load) pass alone, 65 tests.
- Left: the lighter patch at the wall-join corner; the open flank at wall ends in hairpins (`flanks` 80, not held); the test split.

## A junction's paving is drawn as road

- Job: three artefacts where the side road meets the ride at Bedrína. The paving was drawn as land and read as a pale slab at the wall corner: it is now group 3 of the works mesh with `RoadSurface.pavingMaterial`, in the asphalt's mean colour. Ground under the ride's verge hid a metre of the side road at the edge: none lies in paved rows now. The ride's verge lay over the paved corner behind a wall join: the row at a joined wall end is a mouth row.
- Check: `tests/unit/world-meshes.test.js` holds the paving part, its group and its material, and no ground under the verge in paved rows. Whole unit suite on alex-ci: 97 of 98 files; `world-walls` failed on a helper that read the apron's grid for the paving group, fixed, then junctions, structures and walls pass (junctions all 0; 32 in a carriageway, 7 seams; walls 0 tops, 14 open ends). Every reader of the works mesh's groups takes 0 and 3 as ground.
- Left: no check reads the paving's cover; a 4 m wedge of land stays where the two roads part; `flanks` 80; the test split.

## Debug mode opens every rider, bike and leg

- Job: with `debug` in the page's address every rider (and so every bike) and every leg is open. `TourSystem` takes `unlockAll`; the saved progress is not changed.
- Check: `tests/unit/unlock-flow.test.js` holds every rider and leg open and lit in debug mode, nothing saved as progress, and the plain game still locked. The tour, restart and board files pass (47 tests).
- Left: nothing.

## The seam and the hole where a side road meets the ride

- Job: four leftovers at Bedrína. A dark line along the junction: the ride's slope from the verge's edge stood in the side road in paved rows, so the ride lays none there. A hole at the wall's end: the paving behind a wall join now reaches `JOIN_PAST_M` in under the ride's edge. A tab of stone there: a wall's end that is joined to another road's wall has no return under the road. A smooth patch: the paving has the asphalt's own texture on the ground plane.
- Check: `tests/unit/world-meshes.test.js` holds no slope in paved rows, no return at a joined end, the paving's texture and its UV. Whole unit suite on alex-ci: 98 of 98 files, 2539 tests, and the four hash files here (43). Junctions all 0; 31 in a carriageway (32 before), 7 seams; walls 0 tops, 14 open ends.
- Left: no check reads the paving's cover (the hole at the wall's end was found by eye); the join's parapet ends a hand from the side road's; `flanks` 80; the test split.

## D. Distance fades and haze colour

- Job: distant land read green. Measured in the photos (`node tools/world/photomatch.mjs haze`, 19 photos, mean display colour): land at 1 to 3 km 90, 95, 88; at 3 to 8 km 76, 98, 121 (hue 211); from 8 km 92, 125, 170 (hue 214); the sky near the horizon 188, 203, 224 (hue 215, saturation 0.16). Cause: the old tint went toward a grey-blue and reached 63% only at 14 km, so land 3 to 8 km off kept hue 170 to 180, and the sky over the ridges was the mid sky's blue (saturation 0.26 to 0.40). Now one haze (`LandShade.HAZE`, `worldHaze`) for everything a world draws, with a late onset so the first kilometres stay clear, and a world's sky keeps the horizon's pale colour higher (`WorldLooks.horizonSpan`).
- Check: the GPU probe `world-haze` reads six views in clear air by distance. On the build before (0e4a97f): 23 failures, 9 of them "greener than the sky near the horizon" (3 to 8 km at km 6.6: 86, 96, 95). After: none (80, 110, 132 there; from 8 km 96, 139, 172; sky 202, 216, 228), and nothing drawn lacks the haze. `world-budget` every 1000 m: at most 512 meshes and 444 037 triangles, inside the caps. `tests/unit/world-haze.test.js` and the photo tool's tests; whole unit suite on alex-ci 99 of 99 files, 2548 tests, and the four hash files here.
- Left: the haze in mist and rain was not looked at (a unit test holds the air's colour there). The summit view passes "greener than the sky" with no margin. The game's hue is 206 against the photos' 211 to 215: it comes from the day sky's fog colour, which the legs share. The frame time was not measured.

## E. Roadworks checkpoints

- Job: every checkpoint is a roadworks site (`js/world/roadworks.js`): gates, a single lane, lights, works and ramps on the road's grade. The owner's two changes: gate boards 2.45 m tall (from 2.0 m), and the longest site 550 m (from 110 m), each site with a most of its own between the two (`Roadworks.mostOf`); on the Tremola the road gives 82 to 360 m. The work as found had four failing tests and two defects in play. Fixed: traffic blends to the open lane inside the stop lines, so a queue waits in its own lane (a rider who left the single lane met the queue head-on); the rider is one of the queue (a car drove through a rider at a red, and the far light went green with the rider in the lane); the spacing rule no longer speeds a braking car up to half speed (cars entered on red) nor slows a car in a single lane; the ramp rule measures from the road's grade (a flat plate on a climb threw the bike); each light stands on the verge of the road's own width.
- Check: `tests/unit/world-roadworks.test.js`, `world-markers.test.js`, `world-traffic.test.js`, `world-fairness.test.js`. GPU `world-fairness`: 140 hairpin rides and 20 site rides with no crash, restart or stuck ride (on the work as found: two site rides ended on a car, and on the first long build 11 stood at a red for ever). GPU `world-budget` every 500 m: at most 542 meshes and 449 778 triangles. Whole unit suite on alex-ci 100 of 100 files, 2563 tests, and the four hash files here.
- Left: the triangle count is 222 under the cap of 450 000 at km 4. The all-red time of the 360 m site is planned at 64 s (cycle 174 s). A closure can start a few metres after a hairpin: `Roadworks.stretch` has no rule for sight distance before the gate. The hairpin rides of `world-fairness` run with no traffic now. A knocked beacon's wobble side is not seeded.

## F. Camera swing with lean, and the camera goes under bridges

- Job: the swing was in the uncommitted work and is committed as found: the camera moves sideways with the lean and its look point leads into the corner, in the route-following boom's frame, scaled down by the land. New, asked by the owner: the camera passes under a road overhead instead of over it (`WorldEnvironment.overheadY`, `WorldCamera.roofHeight`). The Tremola has three such places (s 1720, 5118, 6504; 4.3 to 5.8 m under the deck).
- Check: `tests/unit/world-camera-swing.test.js` (5 tests) and the new `tests/unit/world-camera-bridge.test.js` (8 tests) pass. A simulation on the three real bridges, standard and high view, 8 to 30 m/s: before, the camera was over the deck for 48 and 35 frames at two of them (2.4 m and 1.05 m over); now never, at least 0.25 m under.
- Left: by the owner's word the long checks wait for the end: the whole unit suite and the GPU probes `world-camera-smooth`, `world-frustum` and `world-camera` were not run on this commit. Not looked at in the browser.

## F2. The camera comes down for a bridge over the approach, not at it

- Job: the owner found the first version a switch to a low camera at speed. The camera now reads the road 2.6 s of riding ahead and changes height over that whole approach, stays as high as the deck allows (0.35 m under it, from 0.7 m), allows for the road's grade between the deck and the bike, and goes back up slowly.
- Check: `tests/unit/world-camera-bridge.test.js` (8 tests): never over a deck, and under 3 m/s of height change at any moment at 8, 15 and 30 m/s. Simulation on the three real bridges in the high view: 8 m comes down to 5.1 m, 4.4 m and 3.4 m over the bike, over about 60 to 80 m of road at speed, with no step.
- Left: under the lowest deck (4.3 m, on a climb) 3.4 m is the most the deck allows. The long checks wait for the end.

## F3. More room under a deck at speed

- Job: by the owner's word the camera may come down a bit more at speed. Under a deck it keeps 0.35 m of room at 10 m/s and under, rising to 1.05 m at 28 m/s (`roofFastM`).
- Check: `tests/unit/world-camera-bridge.test.js` holds that a pass at 30 m/s is about 0.7 m lower than one at 8 m/s, with no step. Simulation on the real bridges in the high view: at km 6.50, 3.0 m over the bike at 8 m/s and 2.7 m at 30 m/s; at km 1.72, 3.8 m at 25 m/s.
- Left: the long checks wait for the end.

## F4. A world's camera comes down with speed

- Job: the owner meant the camera in the open, not under a bridge: it may come down at speed. A world's boom now loses 30% of its height from 0 to 30 m/s, eased (`WorldCamera.speedHeight`): standard 3 m to 2.1 m, high 8 m to 5.6 m. The legs keep their slight rise. The room under a deck (F3) stays.
- Check: `tests/unit/world-camera-swing.test.js` holds the rule (monotone, no step, legs unchanged); the swing and bridge tests pass (14 tests).
- Left: not looked at in the browser. The land limits act on the lower boom as on any boom, but the GPU probes `world-frustum` and `world-camera-smooth` were not run: the long checks wait for the end.

## Bike stands up

- Job: the owner asked for every bike's kickstand to be up. 17 of the 21 bike models were drawn with the side stand down (a rod from the frame to 2 to 5 cm over the ground, 27 cm out to the left); two were folded already and the scooter has a centre stand, folded. The kit now has `Kit.side_stand` (hinge and foot on the ground in, the leg swung back along the bike out), every script uses it, and the 18 model files were built again with Blender 5.3 (an unchanged script gives the same file byte for byte).
- Check: `tests/unit/bike-stands.test.js` reads every model file: nothing of a body more than 0.2 m off the centre line within 0.12 m of the ground. Before: 0.021 to 0.054 m on 17 files. After: 0.18 m at the least. The model tests pass (bikemodels, brake-discs, sceneassets: 270 tests).
- Left: looked at one preview picture only (the naked bike). The long checks wait for the end.

## Tim rides the black naked four

- Job: the owner's photos show Tim on a gloss black naked four with a 2010 plate on every trip; the game gave that bike to Guy and gave Tim the scooter alone. Tim now has the scooter first and the naked four second; Guy has four bikes.
- Check: `tests/unit/characters.test.js` and `unlock-flow.test.js` hold the two lists and the bike picker (194 tests with the bike model tests).
- Left: the long checks wait for the end. The riders' gear from the photos is read and private (`~/Pictures/twisty-reference/people/`); the riders' models, the three-row rider screen, the composite stats and the group ride are not built yet.

## G. Bike models: the front end steers about the fork, and the rider puts a foot down

- Job: committed as found in the working tree, with one test corrected. The front wheel, its disc, the fork legs and the bar turn together about the fork legs' line through the front axle (`Vehicle.steerAxis`, `steerFront`), not about the vertical; the rider's limbs are rigged (`Vehicle.rigLimb`) and a foot goes down at a stop (`updateFooting`); the rider's left is +x as everywhere.
- Check: `tests/unit/bike-wheels.test.js` (new, every bike: the wheels run true and upright in the centre plane, the steering axis is the fork's), `bikemodels`, `brake-discs`, `brake-calipers`, `characters`, `vehicle`, `bike-stands`, `unlock-flow`: 589 tests pass. One test of the work failed as found: the dirt bike's rear tyre read 1.4 mm off the centre plane, because the measure took the mean of the tyre's vertices and a knobby tread has more on one side; it now takes the middle between the tyre's two sides.
- Left: not looked at in the browser by me (the owner has ridden it on port 8082). The long checks wait for the end.

## The six riders, modelled with their own gear

- Job: every rider was one model in a few colours. The rider file now has cuts by style (8 helmets, 8 jackets, sleeves, trousers, gloves, boots, a neck tube), and each rider has outfits as data (`OUTFITS` in `js/vehicle.js`: Shane 3, Guy 3, Alex 2, the others 1) and a build. The gear was read from the owner's photos into a private file; only colour numbers and neutral descriptions are in the repo (no surname, photo name, maker's name or logo; a test holds it). No faces. A rider's outfit choice is saved (`TourSystem.getSelectedOutfit`, `selectOutfit`); there is no screen for it yet, so every rider wears the first outfit.
- Check: 15 test files on alex-ci, 828 tests: every outfit names cuts that are in the file, the first outfit is the default, the choice is saved and validated. One rider is 4 700 to 5 700 triangles (3 500 before; budget 7 000); the file is 565 KB (130 KB before). An unchanged script gives the same file. Preview pictures of the eleven outfits were looked at.
- Left: the outfit and bike rows on the rider screen; composite stats; the group ride with the six riders (the crew still wear generic colours). Two dark outfits are hard to tell apart from behind (Alex plain black, Guy charcoal). The racing hump still goes on any rider on a race-pose bike. Lucy's red trail bike and her black track superbike are not modelled. The long checks wait for the end.

## Tim's scooter remodelled, and Lucy's two more bikes

- Job: the owner showed Tim's real scooter (a mid-size sports scooter, blue above, a silver sweep, black below, tall clear screen); the maxi scooter model is replaced by it (`bike14_forza`, a saved choice of the old id falls back to the first bike). Lucy gets a black track version of the V4 superbike (a second scheme of the same script: no mirrors, plate or indicators, blanked headlights) and a red 250 trail single (`bike15_crf250`, new, from general knowledge: no photo). Her bikes, least powerful first: trail single, naked twin, naked triple, track superbike. Her base numbers were set so that the naked twin rides exactly as before.
- Check: 14 test files on alex-ci, 825 tests (riders, catalogue, wheels true and steering on the fork's line, stands up, discs and calipers, model surfaces). The red superbike's file is byte-identical. Each script gives the same bytes twice. Triangles: scooter 23 680 / 9 080, track bike 22 096 / 8 512, trail bike 13 684 / 6 388 (budgets 40 000 / 10 000).
- Left: the scooter's nose is simpler and more pointed than the real one, its headlights are plain wedges, and it has no rider-on-bike picture; whether it is the 125 or the 300 is not known (set as a full scooter class). The trail bike's exact model and year are not confirmed. The long checks wait for the end.

## The bike picker steps up and down, with two ends

- Job: the bike arrows on the rider screen were left and right and wrapped round. They are now an up and a down arrow, one over the other, and the list has two ends: the arrow at an end is off, and the keys do nothing there.
- Check: `tests/unit/unlock-flow.test.js` holds the two ends for the buttons and the keys; the menu and rider tests pass (87 tests).
- Left: not looked at in the browser. The long checks wait for the end.

## New noses for the scooter and the superbike, and scuffs on two bikes

- Job: the owner found the scooter's nose and the superbike's nose poor matches to the photos. Both fronts are rebuilt as panels between shared feature lines (new helpers in `tools/blender/bikes/_kit_E.py`): the scooter has a broad shield with two silver blades to a centre beak, a black centre under the screen and slim swept lights low in the face; the superbike has a wide low two-part face with a dark intake each side, a narrow spine and a light strip in each intake. The black superbike is now the same road bike in black (the stripped track version is taken back; catalogue name `V4 superbike, black`). That bike and the red trail single carry scuffs modelled in their scripts (`scuff_*` and `tape` materials): the game has no crash-damage look to reuse (`crash-paint.test.js` holds that a crash never repaints a bike).
- Check: 11 test files on alex-ci, 760 tests, with a new test that only those two bikes carry scuff materials, at both levels of detail. Each script gives the same bytes twice. All files within the triangle budgets.
- Left, as the builder judged against the photos: the scooter's lamp is darker than the real one, its mirrors are too small and the apron's silver spike is too bold; the superbike's hood is plainer and its intakes shallower than the real ones, and the screen has no double bubble; the trail single's wear is subtle at game size. The long checks wait for the end.

## Off-road bikes ride the land better and slide where a road bike falls

- Job: the owner wants the off-road bikes to lose less speed off the road and to spin the rear round and not lowside. One number in a bike's catalogue entry (`offroad`, 0 to 1) now moves every land value toward `WorldPhysics.offroad`: the trail single 1, the small adventure single 0.75, the adventure triple 0.6, the scrambler 0.2, every other bike 0. On the land with the throttle open such a bike steps its rear out (the drawn bike heads further into the turn, the rear wheel spins and throws dust) and falls only well past the point where a road bike lowsides. Settled on flat land at full throttle: road bike 3.8 m/s, scrambler 4.3, adventure triple 5.3, small adventure single 5.7, trail single 6.4. A classic leg's run-off reads the same trait.
- Check: 13 test files on alex-ci (541 tests) with the new `tests/unit/world-offroad-bikes.test.js` (22 tests: the trait, the slide, a new catalogue entry gets both, a bike without the trait rides to the numbers recorded before the change); `tests/unit/world-offroad.test.js` (6 tests) holds that a hairpin cut that beats the road on the trail single also beats it with the trait taken away; the four pinned-hash files pass locally and `tests/golden/` did not move.
- Left: the land speed arrives only after 2 s on the land, because with it at once the trail single's hairpin cuts beat the road by up to 0.8 s; the first 2 s are as hard as on a road bike, and the owner may want that softened at the cost of the cut rule. The cut rule's 0.15 s bar already fails for some riders on road bikes (a 20 m chord at 10 m/s on two to three hairpins), not from this change. The trail single on the grass at 15 to 20 m/s crashed after about 23 s with no cause on the crash card. The slide's size, the dust and the bump are not judged in the browser. The cut script gives times that differ by 0.3 s between runs, so the new trail test may fail on a marginal hairpin. The long checks wait for the end.

## The rain ends before the top

- Job: the owner found the rain went on too long; it rained to the summit. The rain part of the stage now ends at 0.8 of its length. It thins from s 9,800 m, and the air is clear and the road dry from s 11,300 m, so the last 1.9 km to the summit are dry. The rain is still full through the first stack of cobbled hairpins (s 7,740 to 9,800 m).
- Check: `tests/unit/world-looks.test.js` (rain full for at least 1 km, then no rain, mist or wet road in the last kilometre; the hairpin grip rule), `world-run.test.js` and `atmosphere-track.test.js` (a restart at a station near the top is in clear air on a dry road): 79 tests pass locally.
- Left: not looked at in the browser. A mist between the rain and the clear air is not there: a part must be longer than the 1.5 km blend, and the top of the stage has no room for one. The long checks wait for the end.

## The handlebar is drawn as a bike is steered

- Job: the owner saw the bars and arms go left for left and right for right at any speed. The drawn bar now follows the lean (`Vehicle.shownBar`, `Vehicle.BAR`): while the bike rolls into a turn the bar is pushed the other way (up to 9 degrees), at a held lean it sits a little into the turn (at most 4 degrees), and under 7 m/s it goes over to the steering angle. The hands follow through the rig as before. No physics changed.
- Check: `tests/unit/bike-counter-steer.test.js` (6 tests: against the roll then into the turn, both sides; no step from frame to frame; walking pace; the wheel drawn at that angle; a crash and a restart; the same ride with the bar held straight is the same to the last bit) and four older bike files, 573 tests, pass locally; the four pinned-hash files pass.
- Left: not looked at in the browser. The crew's bikes are not steered at all, as before. The long checks wait for the end.

## Each rider leans into a turn as that rider does

- Job: the owner described how far each rider leans off the bike. Every rider rolled a fifth of the bike's lean, and the hands and feet went with the body, off the grips and pegs. A character's `bodyLean` now sets the rider's own roll and a move across the seat (`Vehicle.riderLean`): Shane 0 (in line with the bike), Guy 0.2, Alex, Tim and Lucy 0.5, Steve 1 (at a 50 degree lean, 17 degrees more than the bike and 16 cm across the seat). `Vehicle.holdRider` keeps the hands on the grips and the feet on the pegs.
- Check: `tests/unit/rider-lean.test.js` (6 tests: the order, both sides, hands and feet within 1 mm of where they are upright and no limb stretched over a tenth, upright again as at the start, less in the air and none in a crash, the same ride with no body lean is the same to the last bit) and six older bike and rider files pass locally (626 tests); the four pinned-hash files pass.
- Left: not looked at in the browser. The head does not stay level. The crew's riders do not use the number yet (they are not the six yet). The long checks wait for the end.

## Roadside scenery from the photos in place of the yellow signs, and nothing floats

- Job: the owner wanted the yellow signs replaced by roadside scenery that the photos of the area really show, and no roadside thing in the air. The photos show granite posts along the road's edge, dry tussock grass and low green clumps beside the road, boulders, and no yellow sign. The signposts are gone. Before each junction stands a row of three granite marker stones, and tussocks and green clumps stand on the open strip beside the ride. Each thing takes its height from the drawn ground at its own place (`Scenery.footY`); the signposts took the road's height beside them, which is why they floated.
- Check: `tests/unit/world-clearance.test.js` has a new "nothing floats" test over every tree, boulder, stone and tuft of the ridden slice, and a planted test that a thing at the road's height beside it is off the ground by more than 0.5 m somewhere; `tests/unit/world-meshes.test.js` holds the stone rows and the tufts on a synthetic tile (68 tests in the two files); nine more local files that read the scenery and five on alex-ci (60 tests) pass. GPU pictures of the start and the first three hairpins looked at: the stones stand in the verge's bank, the tussocks in the grass.
- Budget: `world-budget --every 1000` on the GPU gives 448 522 triangles at km 4, under the 450 000 budget; the branch head before this job gave 452 652 there, already over. `Scenery.TRIANGLE_CAP` went from 140 000 to 134 000 to pay for the tufts and that overrun (about 3% fewer trees where the cap binds). The probe's count moves between runs by tens of thousands (terrain detail and vehicles in the scene), so one run is not proof of the margin.
- Left: the tufts are small and sparse at speed and do not move in the wind. `world-clearance` on the GPU fails on the roadworks gates (65 hits, 0.12 m over the road at the checkpoints), on the branch head as well: not from this job, queued. No real Swiss road sign is drawn: the photos of this road show none close enough to copy. The house plinth of the old job H is not touched. The long checks wait for the end.

## A lowside is drawn as it happens

- Job: the owner saw the bike lie on its side in the frame a lowside was called. `Vehicle.worldCrash` now takes how the crash is drawn. A lowside goes from the lean it had to its side over 0.45 s (a fall at walking pace over 0.8 s), the bike turns into the bend as it slides (0.07 rad for each metre, at most 1.3), and the rider comes off and drops up to 5 m behind it on the line of the slide, holding nothing. The sliding bike throws sparks on the carriageway and dust on the land. Every other crash is drawn as before.
- Check: `tests/unit/crash-lowside.test.js` (6 tests: the fall over time on both sides, the slide and the turn with no step, the rider off and on the ground, the same positions and speeds frame for frame as a crash drawn the old way, the fall at walking pace, the rider back on the seat when riding again). Thirteen vehicle and crash files on alex-ci (327 tests) and the four pinned-hash files pass. Pictures from a side camera in a real browser show the bike on its side with dust and the rider apart from it.
- Left: the rider lies in the riding pose and does not tumble. The chase camera in a crash is as it was (rolled and close), so the fall is partly out of the frame: not changed here. The slide's friction is the old per-frame factor. The long checks wait for the end.
