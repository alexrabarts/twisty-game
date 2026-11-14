# World

The road runs along a cliff. Positive lateral offset is the valley (drop-off) side. Negative is the mountain wall. Riders keep to the wall side; oncoming cars use the valley side.

## One terrain model

Three things must agree: the rendered drop-off face, `Environment.groundYAt()` and `Vehicle.getTerrainHeightAt()`.

- Flat from the centre line to `roadWidth / 2 + 2` (road plus ledge).
- Then a drop of `cliffSlope` (1.33) for each lateral unit, down to the lake at y = -200.
- The face mesh adds `cliffDisplacement()` on top. `dropOffSurfaceY()` walks the same vertex column, so `groundYAt()` returns the rendered surface on the valley side.

If you change the cliff shape, change it in `cliffDrop`, `cliffDisplacement` and `cliffDisplacementScale`. Never add randomness to the drop-off vertex positions: scenery would float again.

The mountain wall is not modelled exactly. `groundYAt()` is lower than the rendered wall, so objects placed there sink into the rock. Do not place visible scenery on the wall.

## Only the active leg exists

`roadPath` holds all 744 segments. Geometry is built for `startSegment` to `endSegment + 20` only. Anything placed or spawned outside that range hangs in empty space. Traffic uses `legSegmentRange()`; cones and checkpoints read `startSegment` / `endSegment`.

Offsets from the road must use the road's perpendicular: `(cos(heading), -sin(heading))`. A world-X offset is only correct where the road heads north.

## Determinism

Scenery uses `Environment.rand()` (seeded per leg). The menu preview and the ride must build the same world. Do not use `Math.random()` in `environment.js`.
