# Blender asset pipeline

Scripts that build the modelled scenery, the four bikes and the rider in `assets/` with Blender (5.3, headless). The game reads every file with the one reader in `js/sceneassets.js`. That file replaces the tagged procedural dressing of a leg once its files arrive; `js/bikemodels.js` does the same for a bike and its rider. Both keep the procedural meshes if a file fails. Only foggy-gorge (leg 4) has scenery assets so far.

## Rebuild

From the repository root:

```sh
for script in gorge_rocks gorge_portal rockface_detail bike_sport bike_adventure bike_scooter bike_dirt rider; do
  blender --background --factory-startup --python tools/blender/$script.py
done
```

Each script is deterministic (fixed seeds, fixed sources) and writes its output into `assets/gorge/`, `assets/bikes/`, or `assets/rockface/` for the rock face's detail, which is not one leg's. Poly Haven downloads are checked against the API's md5 and cached in `~/.cache/twisty-blender`; nothing downloaded is committed except the processed output.

| Script | Output | What it makes |
|---|---|---|
| `gorge_rocks.py` | `rocks.glb` | Five rock variants, 700 to 900 triangles each, centred, mean radius 1. Each is baked from a high-poly sculpt (cut faces, voxel remesh, layered displacement, a scanned rock surface) into one shared 1024 px atlas: base colour, normal, and AO with roughness in one 512 px map. |
| `gorge_portal.py` | `portal.glb` | `portal_arch` (masonry headwall, voussoirs, keystone, string course, cornice, parapet, piers) and `portal_wing` (one wing wall, the game mirrors it). Modelled for an opening 11 m wide each way and 7.5 m high. |
| `rockface_detail.py` | `rockface/detail.webp`, `rockface/normal.webp` | The rock face's detail: the grain of a rock surface and a few broken fractures, made from seeded noise (no photo, no download), as a grey map and a normal map that tile, 1024 px, 152 KB together. It holds no beds: the shader draws those. |

`common.py` holds the shared steps: scene reset, Poly Haven fetch, WebP save, glTF export.

## Bikes and rider

| Script | Output | What it makes |
|---|---|---|
| `bike_sport.py` | `sport.glb`, `crew.glb` | The super sports bike, and the same bike at a fifth of the detail for the touring crew's riders. |
| `bike_adventure.py` | `adventure.glb` | The adventure bike with its luggage. |
| `bike_scooter.py` | `scooter.glb` | The maxi scooter. |
| `bike_dirt.py` | `dirt.glb` | The dirt bike. It has no headlight. |
| `rider.py` | `rider.glb` | The rider as rigid segments: torso, helmet, peak, hump, one each of upper arm, forearm, thigh, shin, glove and boot. The game poses them. |

`bike_kit.py` is the modelling kit and `bike_parts.py` the parts the bikes share (forks, bars, drive, brakes, cans, pegs). A script writes shapes in the game's own axes (x across, y up, z forward, metres, ground at y = 0), so its numbers read against `js/vehicle.js`. The kit has lofted bodywork, turned parts, swept tubes, sheets, wheels and discs. It joins the shapes of each named node into one mesh with a primitive for each material, moves the node onto its pivot and bakes ambient occlusion into the vertex colours.

A bike file has these nodes: `body`, `wheel_front`, `wheel_rear`, `disc_front`, `disc_rear`, `fork_left`, `fork_right`, `handlebar`, `brake_light`, `headlight` (not the dirt bike), and the bare points `grip` and `peg` where the rider's right hand and right foot go. The crew file folds the forks, bar, discs and headlight into its body. Material names are the contract with the game: it gives `paint`, `paint_dark`, `accent` and the rider's `suit`, `suit_accent`, `helmet`, `helmet_accent` each character's colours, and takes the other colours from the file.

Rules for a change to a bike:

- Keep the wheel centres, the node pivots, `grip`, `peg` and the seat where `Vehicle.build*Bike` has them. The animation, the physics and the camera read the procedural numbers. `tests/unit/bikemodels.test.js` compares the two.
- Keep each bike at or under 12000 triangles and 400 KB, the rider under 5000 triangles, and all the files under 1.5 MB. The scripts and the test fail above these.
- Set `TWISTY_PREVIEW=<directory>` to render the finished model from three sides after the export.
- The limb lengths in `rider.py` (`LENGTHS`) and in `js/bikemodels.js` are one number in two places. Change both.

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

## Format

Plain glTF binary with WebP textures (`EXT_texture_webp`), at most 1024 px. Not Draco or KTX2: in three r150 `GLTFLoader`, `DRACOLoader` and `KTX2Loader` exist only as ES modules that import `three` by bare name, which this script-tag page cannot resolve without an import map in `index.html` and a second copy of three. `js/sceneassets.js` reads the subset the exporter writes: one primitive per material, a node translation but no rotation or scale, and no interleaving. The bike files have no textures. `bike_kit.py` rewrites them after the export with the occlusion (`COLOR_0`) as bytes and the normals as signed bytes padded to four (`KHR_mesh_quantization`), which takes a third off each file. With about 1.5 MB for the leg, the geometry is a small share and a Draco decoder would cost more than it saves.

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

The geometry and the rock face's detail are generated by the scripts. The bikes and the rider use no downloaded source.
