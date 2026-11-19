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
