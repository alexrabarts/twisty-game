# World

On the cliff legs (mountain-dawn, high-pass) the road runs along a cliff. Positive lateral offset is the valley (drop-off) side. Negative is the mountain wall. Riders keep to the wall side; oncoming cars use the valley side. Valley-run and storm-valley are open ground instead: run-off on both sides (see "Run-off legs"). Coastal-descent and winter-pass have their own shapes (see "Coast and ridge").

## One terrain model

`js/terrain.js` is the single source of the ground beside the road. It is pure: no THREE, no DOM, no `Math.random`. It loads before `vehicle.js` and `tours.js`; without it every `Environment` constructor throws `Terrain is not defined`, the menu preview included.

A leg has a profile (`Terrain.forLeg(legIndex)`, held as `environment.terrain`). A profile has a `floor`, an `elevation(i)` for the road height and a `left` and a `right` side. Legs 1, 4, 5 and 7 use `cliffLake`: a wall on the left, a drop to the lake (y = -200) on the right. Valley-run uses `valleyFloor`, storm-valley uses `forest` (see "Run-off legs"), coastal-descent uses `coast` and winter-pass uses `ridge` (see "Coast and ridge"). Distance `d` on a side is always outward from the centre line, so a side does not know which way it faces.

Three things must agree: the rendered ribbon, `Environment.groundYAt()` and `Vehicle.getTerrainHeightAt()`. All three read the profile: the vehicle and the rockfalls call `Terrain.groundY()` (the vehicle with `exact = false`, the rockfalls with `exact = true`) and clamp or settle on what it returns.

- `Terrain.row(side, j, ctx, out)` gives one cross-section vertex. `Environment.buildTerrainRibbon(sign, side)` draws the mesh from it, one `this.rand()` per vertex.
- `Environment.decorateRockFace(sign, side, group, rockMaterials)` adds rocks, cracks, seepage, vines and snow. It runs only for a side with a `face`. `side.face.rockSpread` says how far rocks spread outward per unit of random height.
- `Terrain.groundY()` finds the nearest centre-line point and calls `Terrain.heightAt()`. A side with `exact: true` walks the same vertex column the ribbon was built from, so `groundYAt()` returns the rendered surface there. A side with `exact: false` uses its smooth `base()` slope.
- Each side has `bands`: `to` is the distance past the road edge where a band ends, the last band runs outward. `Terrain.zoneAt()` names the zone (`road`, `shoulder`, `wall`, `fall` or `runoff`) and where it starts. The vehicle crashes into a `wall`, falls off a `fall`, and is dragged by `runoff`; rockfalls come off the first side that ends in a `wall`.
- `Terrain.facePoint()` is the only way to find a point on a drawn face; the cliff decals (cracks, seepage, vines, snow) are placed with it and tagged `userData.decal`.
- `cliffLake` today: flat to `roadWidth / 2 + 2`; the right side then drops 1.33 per lateral unit (exact); the left side rises 1.6 per unit, capped at +40 (not exact).

If you change a shape, change it in `js/terrain.js` only. Never add randomness to the ribbon vertex positions: scenery would float again. A change to row maths moves every hash in `tests/golden/`; see `tests/README.md`.

The mountain wall is not modelled exactly. `groundYAt()` is lower than the rendered wall, so objects placed there sink into the rock. Do not place visible scenery on the wall.

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
- The ribbon is drawn with `Terrain.rowAt()`, which blends the two sides over the one segment (four columns) before `from` and after `to`. `Terrain.groundY(exact)` walks the same blended rows. The beach is not exact: `base()` and the mesh agree to 0.10 inside the span, and differ by up to the blend in the half segment before it.
- Rock decoration (embedded rocks, cracks, vines) hangs only where the side has a `face`: `Terrain.faceRange()` bounds it, so the beach gets none. A ribbon that is a face for part of its length keeps the rock material and colours its ground columns by vertex (`side.tint`, else the leg's grass).
- The land side keeps the plant on the hill (-30, -25) with the legacy roadworks entries. Putting that plant on a wall is a known mismatch (`groundYAt` is under the drawn wall) and is not changed here.

`ridge` (winter-pass) has a snowfield 6 m wide each side of the road (run-off, white), then a fall of 40 m (`fallDepth`) onto a shelf, over a frozen lake at -200 (`floor-lake`, `ice` material, `createIceMaterial` in `js/graphics.js`). A fall ends 40 m under the road because the floor is not water. Snowy conifers stand only on the slopes, 12 m or more from the road edge, and none are solid. The roadworks plant (`LEGS[7].plant`) stands inside the snowfield. The leg has no wall, so no rockfalls.

Both legs have `trackVersion` 2: `coastal-descent-v2` and `winter-pass-v2`. High-pass keeps its heights and its plain board id.

A bike at rest after a fall counts as landed (`hitGround`) when its ground speed is under 0.5; a resting bike's vertical velocity never falls under 0.5.

## Only the active leg exists

`roadPath` holds all 744 segments. Geometry is built for `startSegment` to `endSegment + 20` only. Anything placed or spawned outside that range hangs in empty space. Traffic uses `legSegmentRange()`; cones and checkpoints read `startSegment` / `endSegment`.

Offsets from the road must use the road's perpendicular: `(cos(heading), -sin(heading))`. A world-X offset is only correct where the road heads north.

## Determinism

Scenery uses `Environment.rand()` (seeded per leg). The menu preview and the ride must build the same world. Do not use `Math.random()` in `environment.js`.
