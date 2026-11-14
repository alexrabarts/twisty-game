# World

The road runs along a cliff. Positive lateral offset is the valley (drop-off) side. Negative is the mountain wall. Riders keep to the wall side; oncoming cars use the valley side.

## One terrain model

`js/terrain.js` is the single source of the ground beside the road. It is pure: no THREE, no DOM, no `Math.random`. It loads before `vehicle.js` and `tours.js`; without it every `Environment` constructor throws `Terrain is not defined`, the menu preview included.

A leg has a profile (`Terrain.forLeg(legIndex)`, held as `environment.terrain`). A profile has a `floor`, an `elevation(i)` for the road height and a `left` and a `right` side. Every leg uses `cliffLake` today: a wall on the left, a drop to the lake (y = -200) on the right. Distance `d` on a side is always outward from the centre line, so a side does not know which way it faces.

Three things must agree: the rendered ribbon, `Environment.groundYAt()` and `Vehicle.getTerrainHeightAt()`. Today the ribbon and `groundYAt()` read the profile; the vehicle and the rockfalls still carry their own copy of the slope (they move onto `Terrain` in a later phase).

- `Terrain.row(side, j, ctx, out)` gives one cross-section vertex. `Environment.buildTerrainRibbon(sign, side)` draws the mesh from it, one `this.rand()` per vertex.
- `Environment.decorateRockFace(sign, side, group, rockMaterials)` adds rocks, cracks, seepage, vines and snow. It runs only for a side with a `face`. `side.face.rockSpread` says how far rocks spread outward per unit of random height.
- `Terrain.groundY()` finds the nearest centre-line point and calls `Terrain.heightAt()`. A side with `exact: true` walks the same vertex column the ribbon was built from, so `groundYAt()` returns the rendered surface there. A side with `exact: false` uses its smooth `base()` slope.
- `cliffLake` today: flat to `roadWidth / 2 + 2`; the right side then drops 1.33 per lateral unit (exact); the left side rises 1.6 per unit, capped at +40 (not exact).

If you change a shape, change it in `js/terrain.js` only. Never add randomness to the ribbon vertex positions: scenery would float again. A change to row maths moves every hash in `tests/golden/`; see `tests/README.md`.

The mountain wall is not modelled exactly. `groundYAt()` is lower than the rendered wall, so objects placed there sink into the rock. Do not place visible scenery on the wall.

## Only the active leg exists

`roadPath` holds all 744 segments. Geometry is built for `startSegment` to `endSegment + 20` only. Anything placed or spawned outside that range hangs in empty space. Traffic uses `legSegmentRange()`; cones and checkpoints read `startSegment` / `endSegment`.

Offsets from the road must use the road's perpendicular: `(cos(heading), -sin(heading))`. A world-X offset is only correct where the road heads north.

## Determinism

Scenery uses `Environment.rand()` (seeded per leg). The menu preview and the ride must build the same world. Do not use `Math.random()` in `environment.js`.
