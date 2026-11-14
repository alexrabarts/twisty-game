# World

On the cliff legs (mountain-dawn, high-pass) the road runs along a cliff. Positive lateral offset is the valley (drop-off) side. Negative is the mountain wall. Riders keep to the wall side; oncoming cars use the valley side. Valley-run and storm-valley are open ground instead: run-off on both sides (see "Run-off legs"). Coastal-descent and winter-pass have their own shapes (see "Coast and ridge").

## One terrain model

`js/terrain.js` is the single source of the ground beside the road. It is pure: no THREE, no DOM, no `Math.random`. It loads before `vehicle.js` and `tours.js`; without it every `Environment` constructor throws `Terrain is not defined`, the menu preview included.

A leg has a profile (`Terrain.forLeg(legIndex)`, held as `environment.terrain`). A profile has a `floor`, an `elevation(i)` for the road height and a `left` and a `right` side. Legs 1 and 5 use `cliffLake`: a wall on the left, a drop to the lake (y = -200) on the right. Valley-run uses `valleyFloor`, storm-valley uses `forest` (see "Run-off legs"), coastal-descent uses `coast` and winter-pass uses `ridge` (see "Coast and ridge"), foggy-gorge uses `canyon` and night-ride uses `forestNight` (see "Gorge and night forest"). Distance `d` on a side is always outward from the centre line, so a side does not know which way it faces.

Three things must agree: the rendered ribbon, `Environment.groundYAt()` and `Vehicle.getTerrainHeightAt()`. All three read the profile: the vehicle and the rockfalls call `Terrain.groundY()` (the vehicle with `exact = false`, the rockfalls with `exact = true`) and clamp or settle on what it returns.

- `Terrain.row(side, j, ctx, out)` gives one cross-section vertex. `Environment.buildTerrainRibbon(sign, side)` draws the mesh from it, one `this.rand()` per vertex.
- `Environment.decorateRockFace(sign, side, group, rockMaterials)` adds rocks, cracks, seepage, vines and snow. It runs only for a side with a `face`. `side.face.rockSpread` says how far rocks spread outward per unit of random height.
- `Terrain.groundY()` finds the nearest centre-line point and calls `Terrain.heightAt()`. A side with a rock `face` walks the same vertex column the ribbon was built from, so `groundYAt()` returns the rendered surface there; on a wall that leans out over the road it is the highest surface of the folded column, which is what a rock or a ray from above meets. Ground with no face (meadow, snowfield, beach) uses its smooth `base()` slope, which the mesh matches to 0.10.
- Each side has `bands`: `to` is the distance past the road edge where a band ends, the last band runs outward. `Terrain.zoneAt()` names the zone (`road`, `shoulder`, `wall`, `fall` or `runoff`) and where it starts. The vehicle crashes into a `wall`, falls off a `fall`, and is dragged by `runoff`; rockfalls come off the first side that ends in a `wall`.
- `Terrain.facePoint()` is the only way to find a point on a drawn face; the cliff decals (cracks, seepage, vines, snow) are placed with it and tagged `userData.decal`.
- `cliffLake`: flat to `roadWidth / 2 + 2`; the right side then drops 1.33 per lateral unit; the left side is the drawn wall, up to +40 times its height multiplier.

If you change a shape, change it in `js/terrain.js` only. Never add randomness to the ribbon vertex positions: scenery would float again. A change to row maths moves every hash in `tests/golden/`; see `tests/README.md`.

A wall is modelled exactly (declared delta D6): scenery that rests on it with `groundYAt()` sits on the drawn rock. The ground model is flat to `roadWidth / 2 + 2` while the wall starts 1 m past the road edge, so a rock at the foot of the wall, inside that ledge, stays at road height. Only the physics bands (`wall` 1 m past the edge) say where a bike meets the rock.

The roadworks plant (bulldozer, barrier, work truck) is not built beside a wall: on rock it would hang on the face, out of reach, and it has no obstacle entry. The two shipping containers on the road and the hairpin barriers (whose lateral is unchanged, only their height follows the wall) remain.

## Run-off legs

`valleyFloor` (leg 2) and `forest` (leg 6) are built with `Terrain.heightfieldSide`: a list of stations (distance past the road edge, height relative to the road) joined linearly, with an optional rolling undulation along the road. The ribbon rows sit on the stations, so the drawn ground and the physics `base()` agree to 0.10. Both sides are run-off to 35 (valley) or 25 (forest) past the road edge, then a wall. A side must end in an unbounded wall or fall band, so `Terrain.rideableLimit()` is always finite.

- The bike slows and loses grip in run-off, and crashes after 6 s off the road, in water, or on an obstacle. Trunks, rocks and the relocated roadworks plant are `environment.boulders` entries with `solid: true` and a `height`: they are tested while airborne too, by horizontal distance and height, and are never hopped.
- Valley-run has a river ribbon (`floor-river`, 3 m below the road, lateral 35 to 50 on the right). `Terrain.waterLevel()` gives the water height for a lake, sea or river.
- Roadworks plant stands at `-(roadWidth / 2 + 9)` (bulldozer) and `-(roadWidth / 2 + 6)` (barrier, truck) on run-off ground, not at -30 and -25 on a wall.
- A gate (`environment.finishGate`, `environment.checkpoints`) reaches `Terrain.gateReach()` each side: the rideable limit plus 2 over run-off, the road's ledge beside a wall or fall. `Game.inGate(gate, position)` is the only gate test; there is no segment window.
- A changed course has `trackVersion` 2 in `Terrain.LEGS`, so `TourSystem.boardId()` gives `valley-run-v2` and `storm-valley-v2` and local best times use `Game.bestTimeKey()`. `tests/unit/runoff-legs.test.js` pins a digest of each leg's course: change a road height, band, run-off rate or tree layout and it fails until the version is bumped. Progression keeps the plain leg ids.
- The menu preview camera takes its radius and height from `Terrain.LEGS[i].preview`.

## Coast and ridge

`coast` (coastal-descent) has a hill on the left (the cliff wall as on `cliffLake`) and a sea cliff on the right: a fall with a short lip (`lipDepth` 2) onto a sea at absolute height 0 (`floor-sea`, a fall ends at 0.5). The road descends from 58 to 6, so the right side changes along the leg: `profile.spans` replaces it from segment 216 with a run-off beach (sand, 20 past the road edge) that ends in a fall into the sea.

- `profile.spans` is a list of `{ from, to?, left?, right? }` in global segment indices. `Terrain.sideAt(profile, sign, segIndex)` returns the side in force; every consumer (zones, gates, heights, the fall rules) asks it, never `profile.left` or `profile.right`. `from` is inclusive, `to` exclusive and open when absent.
- The ribbon is drawn with `Terrain.rowAt()`, which blends the two sides over one segment (four columns) at each edge of a span, centred on the segment boundary (half a segment before `from`, half a segment before `to`). `Terrain.groundY(exact)` walks the same blended rows. The beach is not exact: `base()` and the mesh agree to 0.10 inside the span, and differ by up to the blend in the half segment before it.
- Rock decoration (embedded rocks, cracks, vines) hangs only where the side has a `face`: `Terrain.faceRange()` bounds it, so the beach gets none. A ribbon that is a face for part of its length keeps the rock material and colours its ground columns by vertex (`side.tint`, else the leg's grass).
- The land side is a drawn wall like the cliff legs': the roadworks plant is not built up it.

`ridge` (winter-pass) has a snowfield 6 m wide each side of the road (run-off, white), then a fall of 40 m (`fallDepth`) onto a shelf, over a frozen lake at -200 (`floor-lake`, `ice` material, `createIceMaterial` in `js/graphics.js`). A fall ends 40 m under the road because the floor is not water. Snowy conifers stand only on the slopes, 12 m or more from the road edge, and none are solid. The roadworks plant (`LEGS[7].plant`) stands inside the snowfield. The leg has no wall, so no rockfalls.

Both legs have `trackVersion` 2: `coastal-descent-v2` and `winter-pass-v2`. High-pass keeps its heights and its plain board id.

A bike at rest after a fall counts as landed (`hitGround`) when its ground speed is under 0.5; a resting bike's vertical velocity never falls under 0.5.

## Gorge and night forest

`canyon` (foggy-gorge) is a wall on each side, 1 m past the road edge, 57 m high with its height swinging 18% along the road (so 46 to 67 m; `variation` and `snow: false` on the face). A river runs 60 m under the road (`floor-river`, lateral -25 to 25). No trees, no mountain backdrop, and no roadworks plant (a wall side builds none). Both walls shed rocks (rockfall rate 0.5); a fall picks the wall at its segment with one draw, and only when there are two walls to pick from, so a one-wall leg keeps its random stream.

`forestNight` (night-ride) is the forest of storm-valley with less roll, a climbing road and two spans, and no rockfalls. Its ground reaches 135 past the road edge, not 165, because the leg's tightest bend (307.7 m) allows no row past half its radius.

A span with a `type` is a set piece: `Terrain.setPieces(profile)` lists them as inclusive segment ranges (`environment.setPieces`), and the world build keeps forest, rock dressing, bushes, delineator posts and rockfalls out of them (rockfalls out of the range widened by one segment each side).

| Piece | Leg | Segments | Terrain |
|---|---|---|---|
| Bridge | foggy-gorge | 285 to 292 | Parapet wall 0.8 m past the road edge (crash), 62 m drop to the river bed |
| Tunnel | night-ride | 514 to 521 | Wall 1 m past the edge, `ceiling` 7.5, hill over the road |
| Village | night-ride | 583 to 590 | Level pavement (run-off, so a rider is slowed, not crashed) to 3 m past the edge, then house fronts (wall) |

`Environment.createSetPieces()` builds each as a group named for its type, with a few merged meshes standing at the piece's centre (culling reads a mesh origin): the bridge a deck with parapets and piers; the tunnel a lining, hill, two portals and an emissive lamp strip; the village houses, windows, lamp posts, lamp heads and light pools. No piece adds a light: the scene keeps its seven. `Game.tunnelRoofY()` gives the roof over the bike (a segment either side counts) and `updateCamera` keeps the camera 1 m under it. All three legs have a `preview` for the menu camera.

Both legs have `trackVersion` 2: `foggy-gorge-v2` and `night-ride-v2`. After this only mountain-dawn and high-pass keep plain board ids.

## Only the active leg exists

`roadPath` holds all 744 segments. Geometry is built for `startSegment` to `endSegment + 20` only. Anything placed or spawned outside that range hangs in empty space. Traffic uses `legSegmentRange()`; cones and checkpoints read `startSegment` / `endSegment`.

Offsets from the road must use the road's perpendicular: `(cos(heading), -sin(heading))`. A world-X offset is only correct where the road heads north.

## Determinism

Scenery uses `Environment.rand()` (seeded per leg). The menu preview and the ride must build the same world. Do not use `Math.random()` in `environment.js`.
