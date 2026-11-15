# Blender asset pipeline

Scripts that build the modelled scenery in `assets/` with Blender (5.3, headless). The game loads it with `js/sceneassets.js`, which replaces the tagged procedural dressing of a leg once the files arrive and keeps the procedural meshes if a file fails. Only foggy-gorge (leg 4) has assets so far.

## Rebuild

From the repository root:

```sh
for script in gorge_rocks gorge_portal rockface_detail; do
  blender --background --factory-startup --python tools/blender/$script.py
done
```

Each script is deterministic (fixed seeds, fixed sources) and writes its output into `assets/gorge/`, or `assets/rockface/` for the rock face's detail, which is not one leg's. Poly Haven downloads are checked against the API's md5 and cached in `~/.cache/twisty-blender`; nothing downloaded is committed except the processed output.

| Script | Output | What it makes |
|---|---|---|
| `gorge_rocks.py` | `rocks.glb` | Five rock variants, 700 to 900 triangles each, centred, mean radius 1. Each is baked from a high-poly sculpt (cut faces, voxel remesh, layered displacement, a scanned rock surface) into one shared 1024 px atlas: base colour, normal, and AO with roughness in one 512 px map. |
| `gorge_portal.py` | `portal.glb` | `portal_arch` (masonry headwall, voussoirs, keystone, string course, cornice, parapet, piers) and `portal_wing` (one wing wall, the game mirrors it). Modelled for an opening 11 m wide each way and 7.5 m high. |
| `rockface_detail.py` | `rockface/detail.webp`, `rockface/normal.webp` | The rock face's detail: the grain of a rock surface and a few broken fractures, made from seeded noise (no photo, no download), as a grey map and a normal map that tile, 1024 px, 152 KB together. It holds no beds: the shader draws those. |

`common.py` holds the shared steps: scene reset, Poly Haven fetch, WebP save, glTF export.

## Format

Plain glTF binary with WebP textures (`EXT_texture_webp`), at most 1024 px. Not Draco or KTX2: in three r150 `GLTFLoader`, `DRACOLoader` and `KTX2Loader` exist only as ES modules that import `three` by bare name, which this script-tag page cannot resolve without an import map in `index.html` and a second copy of three. `js/sceneassets.js` reads the subset the exporter writes (one primitive per material, no node transforms, no interleaving). With about 1.1 MB for the leg, the geometry is a small share and a Draco decoder would cost more than it saves.

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

The geometry and the rock face's detail are generated by the scripts.
