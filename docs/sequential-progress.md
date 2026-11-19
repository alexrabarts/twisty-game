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

## C2. A side road meets the ride (added after job C, from the pictures of km 1.3 and km 1.8)

- Commit: `4e68ed1`
- Rules, in the builders and for every world (`.agent/system/world.md`, "A side road meets the ride"): a side road stands at the ride's height in its band and ramps back to its own; no deck starts in a junction and a hillside road stands on a wall; a mouth's edge stands on a slope; a side road's wall is joined to the ride's; a wall goes on to a bridge's first row.
- Check: `tests/unit/world-junctions.test.js` and `node tools/terrain-check.mjs world-junctions --world tremola --gpu`. Both read the drawn triangles of all 26 side roads of the 24 junctions. On `8fa83fe`: 8 with a step (0.23 to 0.81 m), 2 under the land, 3 on a deck in the mouth, 13 with an open edge. Now: 0, 0, 0, 0. The whole unit suite passes (102 files, 2581 tests).
- Proof: `proof-j/before` and `proof-j/after` in the session scratchpad: Bedrína (km 1.3) from the valley, the junctions at km 1.8, 2.3 and 12.4.
- Walls: the land climbs 12 faces (10 before: a hillside deck became a wall at km 2.4); open ends 15 (17 before, read with the same rule); two bridge ends of the ride are closed.
- Left: the ramp of land at a wall's end inside a hairpin (km 6.1, 6.2) is not touched. Side roads over another road with no deck stay. A wall's last segment at a bridge has no parapet (4 m).
- Left, measured: `world-watertight` 119 wall top edges with no road beside them (114 before) and 208 wall or apron edges over the land (188); `world-floating` 22 side-road points over the land with no deck (17: the hillside fill is read as open), and its view at s 3257 shows 729 pixels of a road's underside (309).
- Added, `12c1518`: the gore of a junction is paved (the strip between a side road and the ride, the corner behind a wall join). No check reads paving yet.
- Tried and taken back, for the wall's end at a hairpin (km 2.0, s 2077 on the upper leg: the wall starts 1.3 m high, a dark return and a pale slab of slope beside it): (1) the ride's wall going on until the land is 0.5 m under its top: the walls' check went from 12 faces the land climbs to 44 and from 0 hanging feet to 12, because the land's cut and the feet are planned from where the wall first stood; (2) lighting the return as the wall's face and a steep slope by its own normal: the slab stayed and the bank got darker hard-edged patches. Not solved. It needs the wall's plan, the land's cut and the check's end rule changed together.
