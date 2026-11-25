# Blender asset pipeline

Scripts that build the modelled scenery, the trees, the traffic cars, the bikes and the rider in `assets/` with Blender (5.3, headless). The game reads every file with the one reader in `js/sceneassets.js`. That file replaces the tagged procedural dressing of a leg once its files arrive; `js/bikemodels.js` does the same for a bike and its rider, `js/carmodels.js` for a traffic car, and `js/treemodels.js` for the trees and bushes. Each keeps the procedural meshes if a file fails. Foggy-gorge (leg 4) has rocks, portals and a rock face; night-ride (leg 7) has its village; every leg but high-pass has the trees.

## Rebuild

From the repository root:

```sh
for script in gorge_rocks gorge_portal rockface_detail village_houses village_props bridge_stone bike_sport bike_adventure bike_scooter bike_dirt bike_naked rider far car_hatchback car_van tree_conifer tree_broadleaf tree_bush; do
  blender --background --factory-startup --python tools/blender/$script.py
done
```

Each script is deterministic (fixed seeds, fixed sources) and writes its output into `assets/gorge/`, `assets/village/`, `assets/bikes/`, `assets/cars/`, `assets/trees/`, or `assets/rockface/` for the rock face's detail, which is not one leg's. Poly Haven downloads are checked against the API's md5 and cached in `~/.cache/twisty-blender`; nothing downloaded is committed except the processed output.

| Script | Output | What it makes |
|---|---|---|
| `gorge_rocks.py` | `rocks.glb` | Five rock variants, 700 to 900 triangles each, centred, mean radius 1. Each is baked from a high-poly sculpt (cut faces, voxel remesh, layered displacement, a scanned rock surface) into one shared 1024 px atlas: base colour, normal, and AO with roughness in one 512 px map. |
| `gorge_portal.py` | `portal.glb` | `portal_arch` (masonry headwall, voussoirs, keystone, string course, cornice, parapet, piers) and `portal_wing` (one wing wall, the game mirrors it). Modelled for an opening 11 m wide each way and 7.5 m high. |
| `rockface_detail.py` | `rockface/detail.webp`, `rockface/normal.webp` | The rock face's detail: the grain of a rock surface and a few broken fractures, made from seeded noise (no photo, no download), as a grey map and a normal map that tile, 1024 px, 152 KB together. It holds no beds: the shader draws those. |

| `bridge_stone.py` | `bridge/stone.glb` | `bridge_span`: Mountain Dawn's stone bridge, one segmental arch over the river gully, masonry spandrels, a ring of voussoirs, a string course, parapets and coping, and the arch barrel. Made with the village kit (every stone a face of its own shade, occlusion baked into the vertex colours, no photo texture). Modelled 60 m long for a 20 m road; `dressBridge` in `js/sceneassets.js` stretches it to the span. 6202 triangles, 187 KB. |

`common.py` holds the shared steps: scene reset, Poly Haven fetch, WebP save, glTF export.

## Bikes and rider

| Script | Output | What it makes |
|---|---|---|
| `bike_sport.py` | `sport.glb` | The super sports bike. |
| `bike_adventure.py` | `adventure.glb` | The adventure bike with its luggage. |
| `bike_scooter.py` | `scooter.glb` | The maxi scooter. |
| `bike_dirt.py` | `dirt.glb` | The dirt bike. It has no headlight. |
| `bike_naked.py` | `naked.glb` | The naked middleweight: black, a lime-green trellis frame and stripes, copper headers into an underslung silencer. |
| `rider.py` | `rider.glb` | The rider as rigid segments: torso, helmet, peak, hump, backpack, neck tube, one each of upper arm, forearm, thigh, shin, glove and boot, and each of those again in the cuts the outfits pick (`<part>_<style>`: nine more helmet shells, ten jackets with their sleeves (one worn open, one a loose rain oversuit with its own trousers), trousers, a glove and four boots), and a bar for the back of a jacket (`back_bar`). The game poses them. It then writes `rider_far.glb` (`far.rider`). |
| `far.py` | `far/<id>.glb`, `rider_far.glb` | The far levels, made from the finished files: each detailed bike as the touring crew ride it, and every node of the rider again, light. A bike script and `rider.py` call it; run alone it makes them all from the files as they stand. |

`bike_kit.py` is the modelling kit and `bike_parts.py` the parts the bikes share (forks, bars, drive, brakes, cans, pegs). Every bike is drawn as it is ridden, with its side stand folded: a script gives the stand's hinge and where its foot stands on the ground, and `Kit.side_stand` draws the leg swung back along the bike (`STAND_UP`). Never lay a plain rod from the frame to the ground; `tests/unit/bike-stands.test.js` reads every model file and fails on a bike with anything near the ground at its side. A script writes shapes in the game's own axes (x across, y up, z forward, metres, ground at y = 0), so its numbers read against `js/vehicle.js`. The kit has lofted bodywork, turned parts, swept tubes, sheets, wheels and discs. It joins the shapes of each named node into one mesh with a primitive for each material, moves the node onto its pivot and bakes ambient occlusion into the vertex colours.

A bike file has these nodes: `body`, `wheel_front`, `wheel_rear`, `disc_front`, `disc_rear`, `fork_left`, `fork_right`, `handlebar`, `brake_light`, `headlight` (not the dirt bike), and the bare points `grip` and `peg` where the rider's right hand and right foot go. Material names are the contract with the game: it gives `paint`, `paint_dark`, `accent` and the rider's `suit`, `suit_accent`, `suit_trim`, `suit_patch`, `glove`, `glove_accent`, `pants`, `pants_accent`, `pants_trim`, `boot`, `boot_accent`, `helmet`, `helmet_accent`, `helmet_trim`, `visor`, `visor_accent`, `neck` and `backpack` each outfit's colours, and takes the other colours from the file. A character's `outfits` (`OUTFITS` in `js/vehicle.js`) are what its rider can wear, the first unless the player picks another; `kit` is the first outfit's gear. Gear a kit leaves out keeps the colour it had before it was a material of its own (trousers the suit's, boots the gloves', knees, soles, trims and patches the accents'). A style picks the cut of a part (`helmetStyle` gives `helmet_<style>`; `torsoStyle`, `upperArmStyle`, `forearmStyle`, `thighStyle`, `shinStyle`, `gloveStyle` and `bootStyle` likewise), `neckColor` adds the neck tube, `backpackColor` the backpack (no rider wears it now; the part and the code stay for one who does) and `backStyle` a mark on the back of the jacket (`back_<style>`). The parts with plain names are the cut of a part an outfit names no style for, and stay light. A character's `build` (height, width) is applied by the game to the one mesh: there is no mesh for each rider. A character's `bikes` lists the detailed bikes it owns (below); it rides the first unless the player picks another.

### Detailed bikes

`bikes/bike*.py` build the characters' own bikes, each from the owner's photos, into `assets/bikes/detail/<id>.glb`, with helper kits `bikes/_kit_a.py` (01-03), `_kit_B.py` (04-06), `_kit_c.py` (07-09), `_kit_D.py` (10-12) and `_kit_E.py` (13-17). `bike17_minimoto` is a black racing pocket bike from the owner's reference picture (0.25 m wheels, a 0.70 m wheelbase, a full fairing with a white number board): its wheels, discs and wheelbase are far smaller than any other's, and `tests/unit/bikemodels.test.js` and `brake-discs.test.js` take its class `mini` for that. Its entry's `pose` crouches the rider over it with `kneeUp`, which lifts the knees over the hip (`js/bikemodels.js`). A script may write a second colour scheme of its bike as a file of its own (`bike07_mt09_black`, `bike13_panigale_black`: the same road superbike in black, without the tail pack). The black superbike and the trail single (`bike15_crf250`) carry crash marks: thin panels just proud of the surface in materials named `scuff_*` and `tape`, the big ones kept in `lod1`; `tests/unit/characters.test.js` fails on a scuff material in any other bike. `BIKE_MODELS` in `js/vehicle.js` lists them: the procedural kind that stands in while one loads, its class, the descriptive name and year the rider select shows, its paint colour and its pose.

- A detailed file holds the bike twice, as the groups `lod0` (at most 40,000 triangles) and `lod1` (at most 10,000), with the same node names as above, `luggage` where the bike carries any, and the bare point `seat` (the top of the seat where the rider sits; an entry's `seat` stands in for a file without one). The reader takes each group by name, whatever order the file lists them in. Each file is at most 1.2 MB.
- They are at the real bike's size: each bike brings its own axles and wheel radius (`vehicle.axles`), which the wheel spin and the wheelie pivot read. The handling keeps its one wheelbase.
- The game's axes put +x on the rider's left. `_kit_D.py` and `_kit_E.py` mirror on export; the files of `_kit_a.py`, `_kit_B.py`, `_kit_c.py` and the five procedural kinds put the rider's right at +x and carry `mirror` (`BIKE_MODELS`, `BikeModels`), so the loader mirrors them. `tests/unit/bike-handedness.test.js` checks the chain, the rear disc and the forks of every bike.
- A detailed bike keeps every colour of its file: the game repaints none of it, and its own `paint` takes the crash and wheelie tints.
- Luggage on the pillion seat goes in the node `luggage` with `luggage: true` in the entry, so that `tests/unit/bikemodels.test.js` rides every owner against it (seated, riding, leaning, standing; 4 cm clear). Start its front face about 0.3 m behind the `seat` mark (`bike16_superadv`: seat at z = -0.18, the duffel from z = -0.5) and put a top box behind it on the rack, not over it.

Rules for a change to a bike:

- Keep a procedural kind's wheel centres, node pivots, `grip`, `peg` and seat where `Vehicle.build*Bike` has them. `tests/unit/bikemodels.test.js` compares the two. A detailed bike's wheels stand on the ground, each pivot in the middle of its tyre, and its discs turn about their wheel's axle; the test checks those and the rider's hands, feet and hip against its marks.
- Keep each bike file at or under 1.2 MB and each level within its triangle budget (a procedural kind's one level within 40,000), the seated rider (each part in its heaviest cut, every optional part) under 7000 triangles, and the rider file under 624 KB (it holds every cut of every outfit and is fetched once; it is within 12 KB of that, so a new cut needs room made first: a bevel on a small part costs most for what it shows; an outfit as worn is about 5000). The light rider's file is at most 176 KB (164 KB now), so the two together are at most 800 KB. The menu fetches no bike until the rider select shows one, then only that bike and the rider. The scripts and the test fail above these.
- Set `TWISTY_PREVIEW=<directory>` to render the finished model from three sides after the export. `rider.py` renders every outfit of every character there instead (it reads them from `js/vehicle.js` with node), seated, from the front, the side and the rear in one picture; `TWISTY_RIDER=<character id>` renders that character's only.
- A new cut of a rider's part is a node `<part>_<style>` in `rider.py` and a style in an outfit's kit. Lay a thin mark (piping, a bar, a patch) on the part with `decal` or `badge`. A mark on the side of a limb goes on both sides: one mesh serves both arms and both legs. `tests/unit/characters.test.js` fails on an outfit that names a cut the file lacks, and on a maker's name in the source.
- A rider's outfits are data (`OUTFITS` in `js/vehicle.js`), each from kit the rider has worn, and every rider has two or more. A new garment is a node and its colours: no code for one rider. Where the real thing has a logo or lettering, model a plain mark (a bar, an oval, a patch).
- The body's shape is in the sections, not in more triangles: `TORSO` for every jacket, and a limb's rows `(t, radius, bulge, back)`, where `bulge` is the outside of the bend (elbow, kneecap) and `back` the inside (calf, the front of the upper arm). `pad` lays a hard plate over an elbow or a knee. A loose garment has sections of its own (`RAIN`) and is crumpled with `crinkle`. A graphic that tapers (a blade on a helmet) is a `decal` whose points carry a width.
- The first outfit of each rider needs a mark that reads from behind. The test measures the back view of the modelled rider (the triangles of the helmet and of the jacket that face backward, by area and by the kit's colour): 60 cm2 or more in a colour 30 or more (CIE L\*a\*b\*) from the back's main colour, and 180 cm2 or more that differs from every other rider's first outfit, the helmet and the jacket counted apart. Take the mark from the real kit: a helmet colour, a yoke, a panel. A plain dark jacket can take the bar (`backStyle: 'bar'`, drawn in the kit's `suitTrim`).
- The limb lengths in `rider.py` (`LENGTHS`) and in `js/bikemodels.js` are one number in two places. Change both.

### Far levels

`far.py` makes what the touring crew draw: five riders at once in a window that is full (`world-budget`), so a rider on its bike is about 3,100 triangles. Nothing in it names a bike, a rider or an outfit.

- **A bike** (`far.bike(path)`, from the detail file's `lod1`, into `assets/bikes/far/<id>.glb`; at most 2,300 triangles and 72 KB, about 2,020 and 63 KB now). The nodes are `body` (with the forks, the bar and the headlight folded in), `wheel_front` and `wheel_rear` (each with its disc), `brake_light`, `luggage` where the bike has it, and the marks. Parts shorter than 10 cm are left out unless they are lit. Each tyre is turned again from its own profile (16 segments), because a tyre cut down by collapsing edges wobbles as it spins. Materials of one colour count as one (`SAME_COLOUR`). A node keeps its `paint`, its lit and see-through materials and its largest other colours, eight at most (each is a draw call); every other material takes the kept one nearest in colour. With six, a bike's several near-blacks took most of the places and its white plate, white panels and chrome were drawn black. The rest is cut down by collapsing edges, by one share for the whole bike, to 2,050 triangles. The file keeps the handedness of its detail file (`mirror`).
- **The rider** (`far.rider()`, from `rider.glb`, into `rider_far.glb`). Every node again under the same name, at a fifth of its triangles (24 at least). A mark laid on a shell (an open sheet) stands 6 mm further out, or the shell would bury it as it moves. A rider as worn is at most 1,300 triangles (`tests/unit/crew.test.js`), and each first outfit keeps its mark from behind (`tests/unit/characters.test.js` measures the light rider as it measures the rider).
- **A new bike** needs nothing: its script's kit calls `far.bike` after it writes the file, and `BIKE_MODELS` gives the entry its `far` path. Its `lod1` must have a `paint` material in its `body` (the crew bike's `frame`), a tyre that is the outermost material of each wheel, and the marks `grip` and `peg` (and `seat`, or a `seat` in the entry). `tests/unit/crew.test.js` fails on a bike without its far file, on a far file without a bike, and on one that lacks a part.
- **A new cut or outfit** needs nothing either: run `rider.py`.
- The output is the same bytes each time. To look at one, import the file into Blender; there is no preview render.

## Traffic cars

```sh
for script in car_hatchback car_van; do
  blender --background --factory-startup --python tools/blender/$script.py
done
```

| Script | Output | What it makes |
|---|---|---|
| `car_hatchback.py` | `cars/hatchback.glb` | A five-door hatchback, 4.3 m long and 1.5 m high. Its roof is the material `paint_roof`, for the game's two-tone cars. 4704 triangles as drawn. |
| `car_van.py` | `cars/van.glb` | A compact panel van, 4.34 m long and 1.87 m high, with glass at the cab only. 4756 triangles as drawn. |

`car_kit.py` adds the car body to the bikes' kit. A body is one closed shell over cross-sections. Four lines of `(z, value)` knots define them: the silhouette (`TOP`), the line under the windows (`BELT`), the lower edge (`LO`) and the half-width in plan (`WIDTH`). The wheel arches are cut into the lower edge. A cross-section has eleven points up one side, and a place on the body is `(z, s)` with `s` the point's number. `Body.patch` lays a thin patch on the shell between two such places: the lamps, the shut lines and the grille are patches. A patch is hidden while the occlusion of the panel under it is baked.

A car file has these nodes: `body`, `wheel` (one wheel, front left; the game draws it four times), `headlights`, `taillights` and the four indicators `indicator_fl`, `indicator_fr`, `indicator_rl`, `indicator_rr`. The rear indicators are the brake lamps too. The game gives `paint` and `paint_roof` each car's colours, lights `headlight` and `taillight`, and takes the other colours from the file (`js/carmodels.js`).

Rules for a change to a car:

- Model with the ground at y = 0 and the car's middle at z = 0. Keep the wheel at (0.76, 0.32, 1.35) with a tyre radius of 0.32: `Car` spins the wheels for that radius and puts the hubs there.
- Keep the car inside 2.2 m of its middle at hub height, fore and aft: `Car.checkCollision` is a ball of that radius. `tests/unit/carmodels.test.js` checks the footprint against the procedural car.
- Keep each car at or under 5000 triangles as drawn (the file counts one wheel, the game draws four) and 150 KB. The scripts fail above 4500 triangles in the file.
- A new body style needs an entry in `CARS` in `js/carmodels.js` and a rule in `kind()`. `kind()` must not call `Math.random`.
- Set `TWISTY_PREVIEW=<directory>` to render the finished model from three sides after the export.

## Trees and bushes

| Script | Output | What it makes |
|---|---|---|
| `tree_conifer.py` | `trees/conifer.glb` | `conifer_spruce`, `conifer_fir`, `conifer_pine`, and each again under snow (`_snow`) for the winter leg. |
| `tree_broadleaf.py` | `trees/broadleaf.glb` | `broadleaf_oak`, `broadleaf_beech`, `broadleaf_ash` (two crowns on a fork), each crown a leaf clump to a lobe. |
| `tree_bush.py` | `trees/bush.glb` | `bush_round`, `bush_low`, and each again under snow. |
| `tree_alpine.py` | `trees/alpine.glb` | A world's species, `spruce`, `fir`, `pine`, `larch`, `beech` and `ash`, each at three levels: `<species>_near` (at most 1,400 triangles: the trunk to the leader, each branch a spray with a sawtooth edge, leaf clumps with sky between them), `<species>_mid` (the legs' shape, at most 220) and `<species>_far` (at most 70). |

## The hill ride's bicycle

`hill_bike.py` builds the hill ride's bicycle and its rider (`.agent/system/hill.md`) into `assets/hill/bicycle.glb` with the bike kit (`bikes/_kit_E.py`), with no far file. The file has two 26 inch wheels, the basket of plain loaves, a blank plate, the cranks and each pedal as nodes, and the boy, whose legs are nodes too (thigh, shin and foot each side, each hanging straight down from its pivot), so the game poses them.

`hill_horse.py` builds the hill ride's horse and cart into `assets/hill/horse.glb` with the same kit, at two levels (`lod0`, `lod1`). Every part the game moves is a node built hanging from its pivot: the body, the neck, the head, each ear, the tail, each leg in three (from the elbow or stifle, the knee or hock, the fetlock), the cart's bed, each wheel and the carter. `js/hill/horse.js` poses them.

## Animals

| Script | Output | What it makes |
|---|---|---|
| `marmot.py` | `animals/marmot.glb` | The alpine marmot in three poses, each a node the game swaps to animate it: `marmot_walk` (on all fours), `marmot_sit` (sitting up, the lookout) and `marmot_run` (stretched out). About 0.5 m long, 280 triangles a pose (at most 320), vertex colours from the owner's photos (kept out of the repository) taken at `EXPOSURE` so the coat sits with the land's palette, occlusion baked in. 23 KB. |

`tree_kit.py` is the modelling kit. A plant is one mesh with no texture: its colour is in the vertex colours (bark, the green from a dark underside to a light crown, snow) with the occlusion baked on top. A leaf or bark photo tiled over a thousand trees would show its repeat; the variety comes from the shapes and from the turn, the size and the tint the game gives each tree. A conifer is a trunk and a stack of boughs, each a skirt whose rim runs out to tips and back into notches. A broadleaf crown is lobes melted into one skin (voxel remesh), roughened and cut down to its triangles, so no triangle is spent inside it.

`js/treemodels.js` swaps them in. `Environment.createForest` still builds the procedural forest, two instanced meshes tagged `userData.plant`; when a file arrives each instance moves, with its matrix and its tint unchanged, to the instanced mesh of the shape a hash of its position picks. A leg draws its trees in six calls (three shapes to a kind; three on the winter leg, which has conifers only), where the procedural forest took two. A roadside bush keeps its mesh and its seat and takes a modelled shape, turned by the same hash.

Rules for a change to a plant:

- The game sinks a tree's origin 0.6 m under the ground at any scale (0.55 to 1.55), so the ground cuts the model between y = 0.4 and y = 1.1. Keep a plain trunk through that range, about 0.4 to 0.5 in radius (the solid circle of a trunk is 0.6), and nothing else below y = 1.15.
- Keep each tree at or under 220 triangles and each bush under 80 (`TREE_BUDGET`, `BUSH_BUDGET`). Storm-valley draws 1,173 trees: at 220 each they take 258,000 of the leg's 450,000 triangles. The scripts and `tests/unit/treemodels.test.js` fail above these.
- A bush is modelled like the ball it replaces: centred on its origin, about a metre in radius, reaching 0.3 below it.
- The vertex colours are the plant's own colours, written linear (16 bits a channel, as the exporter writes them). The game multiplies a tree by its instance tint and a bush by one of two tones (`BUSH_TONES`); the snow variants of a bush are not tinted.
- A new shape needs its node name and its share in `SHAPES` in `js/treemodels.js`. A conifer needs its `_snow` twin.
- A species is written once, in `tree_species.py`, from one layout (its heights, its spread, its lobes), and each level is made from that layout: the outline stays the same when the game swaps one level for the next. `tree_conifer.py` and `tree_broadleaf.py` write the mid level for the legs, `tree_alpine.py` all three for a world. A world's species needs its row in `Scenery.SPECIES` (`js/world/scenery.js`). `tests/unit/treemodels.test.js` holds each level's budget, that the mid level is the legs' shape, and that a level's height and spread stay within a fifth and three tenths of the mid level's.
- Set `TWISTY_PREVIEW=<directory>` to render the plants of a file in a row after the export.
- High-pass keeps the procedural trees (`KEPT` in `js/treemodels.js`): the frozen golden binds that leg's mesh count, triangle count and vertices.

Check: `npm test` (`tests/unit/treemodels.test.js`) and `node tools/terrain-check.mjs budget`, which reports each leg's trees under `assets.trees`.

## Village

| Script | Output | What it makes |
|---|---|---|
| `village_houses.py` | `village/houses.glb` | Five houses, each one node, 3800 to 4800 triangles: `house_chalet` (log floors and two balconies under a low gable), `house_farm` (eaves to the street, a gabled bay over the door), `house_inn` (three storeys, dressed corners, a sign), `house_barn` (stone below, boards above, a wagon door, a woodpile) and `house_cottage` (a steep gable, a balcony). |
| `village_props.py` | `village/props.glb` | `lamp_post` (a lantern on an arm), and four 3 m sections of the garden wall: `wall_plain`, `wall_pier`, `wall_gate` (a cellar door under an arch) and `wall_trough` (the water trough). |

`village_kit.py` is the modelling kit. A shape is written in a plot's own axes: x along the road, y up, z away from the road, the house front on z = 0 and the pavement on y = 0. The front plane is the line a rider crashes on (`roadWidth / 2 + 3`), so nothing at walking height stands more than a step in front of it.

- **No texture.** A model is flat faces, each with its own colour: every board, log, stone and roof slab is one face of its own shade, with a darker foot. The earlier attempt at scenery with a tiling photo showed its repeat everywhere. Blender bakes ambient occlusion into the vertex colours.
- **Tags.** A face's tag becomes its material's name, and the game reads the name, not the material: `body` (colours as written), `wall` (plaster, tinted with the house's wash), `shutter` (tinted with the house's accent), `glass` (red is the window's number in its house, green how bright that corner is when lit) and `lamp` (always lit). So the game, not the file, settles which windows are lit and what colour a house is.
- **Points.** `<house>:left` and `<house>:right` are the ends of a house's front, `<wall>:end` the end of a wall section, `lamp_post:light` where the lantern's light is. The game lays garden wall from one house's end to the next and bakes the lamplight from the lanterns.
- **Size.** The ground behind the fronts climbs 7 m at once (`streetSide` in `js/terrain.js`). A house must stand above that to show a roof, and a wall section must be over 7 m high to cover the bank. A house is at most 9000 triangles and a prop 1200, and both files together at most 800 KB (712 KB now); the scripts and `tests/unit/villagemodels.test.js` fail above these.
- **Colour space.** The colours are sRGB in the file, as the game writes its own, and `js/sceneassets.js` decodes them. glTF's rule for `COLOR_0` is linear; a byte of linear colour has too few steps in dark timber.
- Set `TWISTY_PREVIEW=<directory>` to render each model after the export. Look at the result in the game with `node tools/village-shots.mjs` (`.agent/sop/play-testing.md`).

## Format

Plain glTF binary with WebP textures (`EXT_texture_webp`), at most 1024 px. Not Draco or KTX2: in three r150 `GLTFLoader`, `DRACOLoader` and `KTX2Loader` exist only as ES modules that import `three` by bare name, which this script-tag page cannot resolve without an import map in `index.html` and a second copy of three. `js/sceneassets.js` reads the subset the exporter writes: one primitive per material, a node translation, one scale for all three axes on a mesh node, but no rotation, and no interleaving. The bike files have no textures. `bike_kit.py` rewrites them after the export with the occlusion (`COLOR_0`) as bytes and the normals as signed bytes padded to four (`KHR_mesh_quantization`), which takes a third off each file. The village files carry no normals (every face is flat, and the game works them out) and their positions are whole millimetres in signed shorts, with the millimetre as the node's scale, which took `houses.glb` from 818 KB to 649 KB. With about 1.5 MB for the leg, the geometry is a small share and a Draco decoder would cost more than it saves.

## Rock face detail

The wall of a leg keeps its shape and its vertex colours (strata bands, gullies, moss and water stains). `js/sceneassets.js` works the detail into them in the ribbon material's shader (`rockShader`), and never lays it as a wallpaper: a photo tiled along the gorge showed the same blocks every few metres, at any distance.

- The detail is read at a level distance and world height, so its beds are level on a leaning wall and round a spur. A wall takes the distance along the road, a face that crosses the road (a spur's flank and end) the distance out from it, a near-level facet both (`faceUVs` stores the two in the ribbon's UVs).
- The face is cut into irregular patches, each reading the tile at its own shift, blended into the next. The patch number climbs along and up the wall and never comes back.
- The bedding planes are drawn from world height in the shader (`BED`), not held in the tile: one may lie in each 0.9 m of height and about a third do, each open along some stretches of the wall and closed along others. So beds run from thin ledges to faces several metres thick. Beds held in the tile came out as even courses, and with its joints read as a built wall.
- The detail is faint from the saddle and plain only within a few metres (`FADE`), so the facets and the vertex colours stay what the wall is. The same tile, read several times larger (`COARSE`), comes in with distance. Slow noises vary the stone's brightness and warmth a little.
- Cost on foggy-gorge: six texture reads a fragment, two before. Measured with `tools/terrain-check.mjs frametime`, interleaved with the photo version: about 2.4 to 2.8 ms a frame on an Apple M5, 196 to 226 ms in SwiftShader.

To give another leg's wall the same treatment, add `rockFace: { map, normalMap, tile, tint }` to its entry in `LEGS`, naming the same two files: `tile` is the metres one copy covers, `tint` the stone the vertex colours shade.  An entry names only the parts the leg has: one with `rockFace` alone gets no rocks or portals. Not high-pass: it is bound to the frozen golden (`.agent/system/world.md`, "Golden bindings").

## Adding a leg

1. Tag the procedural meshes to replace in `js/environment.js` with `userData.dressing` (`{ kind: 'rock' | 'debris', radius }`, or the portal's frame).
2. Write the leg's scripts here, writing into `assets/<leg>/`.
3. Add the leg to `LEGS` in `js/sceneassets.js`.
4. Check: `npm test` (`tests/unit/sceneassets.test.js`), and `node tools/terrain-check.mjs budget,frametime --legs <leg>`. The budget probe waits for the assets and reports their bytes; it fails over 800 meshes, 450000 triangles or 1400 instances, and on any rock that floats.

## Sources and licences

All textures are CC0 from [Poly Haven](https://polyhaven.com), fetched at 1k through its public API:

- [`rock_boulder_dry`](https://polyhaven.com/a/rock_boulder_dry) (Dimitrios Savva, Rico Cilliers): the rocks' surface and the portal's dressed stone
- [`rough_block_wall`](https://polyhaven.com/a/rough_block_wall) (Rob Tuytel): the portal's masonry

The geometry and the rock face's detail are generated by the scripts. The bikes, the rider, the cars, the trees, the bushes and the village use no downloaded source.
