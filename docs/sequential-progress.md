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
