# Blender asset pipeline

Scripts that build the modelled scenery, the four bikes and the rider in `assets/` with Blender (5.3, headless). The game reads every file with the one reader in `js/sceneassets.js`. That file replaces the tagged procedural dressing of a leg once its files arrive; `js/bikemodels.js` does the same for a bike and its rider. Both keep the procedural meshes if a file fails. Only foggy-gorge (leg 4) has scenery assets so far.

## Rebuild

From the repository root:

```sh
for script in gorge_rocks gorge_portal gorge_rockface bike_sport bike_adventure bike_scooter bike_dirt rider; do
  blender --background --factory-startup --python tools/blender/$script.py
done
```

Each script is deterministic (fixed seeds, fixed sources) and writes its output into `assets/gorge/` or `assets/bikes/`. Poly Haven downloads are checked against the API's md5 and cached in `~/.cache/twisty-blender`; nothing downloaded is committed except the processed output.

| Script | Output | What it makes |
|---|---|---|
| `gorge_rocks.py` | `rocks.glb` | Five rock variants, 700 to 900 triangles each, centred, mean radius 1. Each is baked from a high-poly sculpt (cut faces, voxel remesh, layered displacement, a scanned rock surface) into one shared 1024 px atlas: base colour, normal, and AO with roughness in one 512 px map. |
| `gorge_portal.py` | `portal.glb` | `portal_arch` (masonry headwall, voussoirs, keystone, string course, cornice, parapet, piers) and `portal_wing` (one wing wall, the game mirrors it). Modelled for an opening 11 m wide each way and 7.5 m high. |
| `gorge_rockface.py` | `rockface_albedo.webp`, `rockface_normal.webp` | The tileable rock for the gorge's walls and spurs, cooled and lightened to sit under the face's vertex colours. |

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

## Format

Plain glTF binary with WebP textures (`EXT_texture_webp`), at most 1024 px. Not Draco or KTX2: in three r150 `GLTFLoader`, `DRACOLoader` and `KTX2Loader` exist only as ES modules that import `three` by bare name, which this script-tag page cannot resolve without an import map in `index.html` and a second copy of three. `js/sceneassets.js` reads the subset the exporter writes: one primitive per material, a node translation but no rotation or scale, and no interleaving. The bike files have no textures. `bike_kit.py` rewrites them after the export with the occlusion (`COLOR_0`) as bytes and the normals as signed bytes padded to four (`KHR_mesh_quantization`), which takes a third off each file. With about 1.5 MB for the leg, the geometry is a small share and a Draco decoder would cost more than it saves.

## Adding a leg

1. Tag the procedural meshes to replace in `js/environment.js` with `userData.dressing` (`{ kind: 'rock' | 'debris', radius }`, or the portal's frame).
2. Write the leg's scripts here, writing into `assets/<leg>/`.
3. Add the leg to `LEGS` in `js/sceneassets.js`.
4. Check: `npm test` (`tests/unit/sceneassets.test.js`), and `node tools/terrain-check.mjs budget,frametime --legs <leg>`. The budget probe waits for the assets and reports their bytes; it fails over 800 meshes, 450000 triangles or 1400 instances, and on any rock that floats.

## Sources and licences

All textures are CC0 from [Poly Haven](https://polyhaven.com), fetched at 1k through its public API:

- [`rock_boulder_dry`](https://polyhaven.com/a/rock_boulder_dry) (Dimitrios Savva, Rico Cilliers): the rocks' surface and the portal's dressed stone
- [`rough_block_wall`](https://polyhaven.com/a/rough_block_wall) (Rob Tuytel): the portal's masonry
- [`cliff_side`](https://polyhaven.com/a/cliff_side) (James Ray Cock, Jenelle van Heerden, Dario Barresi): the gorge's rock face

The geometry is generated by the scripts. The bikes and the rider use no downloaded source.
