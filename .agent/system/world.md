# World

Every leg has a terrain profile: what lies on each side of the road (a wall, a fall, or run-off ground) and what lies under it. A side is described outward from the centre line, so the code never assumes which side is the valley. Positive lateral is the right of the road; which ground is there is the profile's choice.

| Leg | Profile | Left | Right | Board |
|---|---|---|---|---|
| 1 mountain-dawn | `valleyFloor` | run-off meadow, closing to foothills | run-off meadow, river, closing to foothills | `mountain-dawn-v2` |
| 2 valley-run | `cliffLakeMirrored` | drop to the lake | wall | `valley-run-v2` |
| 3 coastal-descent | `coast` | wall | sea cliff, then beach | `coastal-descent-v2` |
| 4 foggy-gorge | `canyon` | wall; drop after the second tunnel | wall; drop between the tunnels | `foggy-gorge-v2` |
| 5 high-pass | `cliffLake` | wall | drop to the lake | `high-pass` |
| 6 storm-valley | `forest` | run-off forest | run-off forest | `storm-valley-v2` |
| 7 night-ride | `forestNight` | run-off forest | run-off forest | `night-ride-v2` |
| 8 winter-pass | `ridge` | snowfield, drop | snowfield, drop | `winter-pass-v2` |

Left and right in this table, and everywhere in the code, are the code's sides: positive lateral `(cos h, -sin h)`. A chase camera looks along the heading, so the code's right is on the left of the screen. On screen high-pass has its wall on the right and the lake on the left; valley-run (mirrored) has its wall on the left and the lake on the right. The vehicle's crash lines (`Hit the left wall`) use the code's sides too.

High-pass is the one cliff leg bound to the frozen golden (see "Golden bindings").

## One terrain model

`js/terrain.js` is the single source of the ground beside the road. It is pure: no THREE, no DOM, no `Math.random`. It loads before `vehicle.js` and `tours.js`; without it every `Environment` constructor throws `Terrain is not defined`, the menu preview included.

A leg has a profile (`Terrain.forLeg(legIndex)`, held as `environment.terrain`). A profile has a `floor`, an `elevation(i)` for the road height and a `left` and a `right` side. High-pass uses `cliffLake`: a wall on the left, a drop to the lake (y = -200) on the right. Valley-run uses `cliffLakeMirrored`: the same two sides swapped, so the drop is on the left and the wall on the right. Mountain-dawn uses `valleyFloor`, storm-valley uses `forest` (see "Run-off legs"), coastal-descent uses `coast` and winter-pass uses `ridge` (see "Coast and ridge"), foggy-gorge uses `canyon` and night-ride uses `forestNight` (see "Gorge and night forest"). Distance `d` on a side is always outward from the centre line, so a side does not know which way it faces.

Three things must agree: the rendered ribbon, `Environment.groundYAt()` and the bike's ground height. All three read the profile: the vehicle and the rockfalls call `Terrain.groundY()` (the vehicle with `exact = false`, the rockfalls with `exact = true`) and clamp or settle on what it returns.

- `Terrain.row(side, j, ctx, out)` gives one cross-section vertex. `Environment.buildTerrainRibbon(sign, side)` draws the mesh from it, one `this.rand()` per vertex.
- `Environment.decorateRockFace(sign, side, group, rockMaterials)` adds rocks, cracks, seepage, vines and snow. It runs only for a side with a `face`. `side.face.rockSpread` says how far rocks spread outward per unit of random height.
- `Terrain.groundY()` finds the nearest centre-line point and calls `Terrain.heightAt()`. An exact read (`exact = true`) is the drawn ribbon itself: every vertex of a ribbon column lies on that column's line, so the point falls in the strip between two column lines, and `meshY` reads the highest of that strip's triangles (float32-rounded, as the mesh stores them). On the road and a ledge an exact read is the road height interpolated along the segment. So scenery and rockfalls rest on what is drawn, on bends and between columns too, on rock, ground and span blends alike. The one exception is `cliffLake` (`columnWalk: true`): high-pass is bound to the frozen golden, which recorded the older read (walk the nearest vertex column with the lateral from the nearest centre-line point, which is up to 1 m off between points on a tight bend). A read with `exact = false` (the vehicle) uses each side's smooth `base()` slope.
- Each side has `bands`: `to` is the distance past the road edge where a band ends, the last band runs outward. `Terrain.zoneAt()` names the zone (`road`, `shoulder`, `wall`, `fall` or `runoff`) and where it starts. The vehicle crashes into a `wall`, falls off a `fall`, and is dragged by `runoff`; rockfalls come off the sides that end in a `wall` at their segment (`Terrain.wallSignsAt()`).
- Dressing follows the side, not a fixed sign. `Terrain.fallSignAt()` is the side that drops (right first): the slope forest of the cliff legs, the roadside bushes and the start sign go there. `Terrain.clutterSignAt()` is where the roadside rock clusters go: the left, unless the left drops. `decorateRockFace()` reads the face in force at each segment, so a side that changes from a wall to a drop is dressed as each.
- `Terrain.facePoint()` is the only way to find a point on a drawn face; the cliff decals (cracks, seepage, vines, snow) are placed with it and tagged `userData.decal`.
- `cliffLake`: flat to `roadWidth / 2 + 2`; the right side then drops 1.33 per lateral unit; the left side is the drawn wall, up to +40 times its height multiplier. `cliffLakeMirrored` is the same on the other sides. The menu preview camera of valley-run stands over the lake (`preview.side: -1`).

If you change a shape, change it in `js/terrain.js` only. Never add randomness to the ribbon vertex positions: scenery would float again. A change to row maths moves every hash in `tests/golden/`; see `tests/README.md`.

A wall is modelled exactly (declared delta D6): scenery that rests on it with `groundYAt()` sits on the drawn rock. The ground model is flat to `roadWidth / 2 + 2` while the wall starts 1 m past the road edge, so a rock at the foot of the wall, inside that ledge, stays at road height. Only the physics bands (`wall` 1 m past the edge) say where a bike meets the rock.

The roadworks plant (bulldozer, barrier, work truck) is not built beside a wall: on rock it would hang on the face, out of reach, and it has no obstacle entry. The two shipping containers on the road and the hairpin barriers (whose lateral is unchanged, only their height follows the wall) remain.

## Run-off legs

`forest` (leg 6) is built with `Terrain.heightfieldSide`: a list of stations (distance past the road edge, height relative to the road) joined linearly, with an optional rolling undulation along the road. The ribbon rows sit on the stations, so the drawn ground and the physics `base()` agree to 0.10. Both sides are run-off to 25 past the road edge, then a wall. A side must end in an unbounded wall or fall band, so `Terrain.rideableLimit()` is always finite.

`valleyFloor` (leg 1, mountain-dawn) is the journey over to the mountains. It is built with `Terrain.closingSide`: two station lists of the same length, `open` and `closed`, and one weight, `profile.closing(s)`, that moves every station from its open place and height to its closed ones. The weight is a smoothstep over the leg (global segments 0 to 69, `VALLEY_LEG` in `js/terrain.js`, pinned to `js/tours.js` by a test): 0 for the first 30% of the leg, 1 from 80%, smooth between. `Terrain.closingAt(profile, s)` reads it; a profile that keeps one shape answers 0.

| Part of the leg | Ground | Run-off past the road edge | Dressing |
|---|---|---|---|
| Open (segments 0 to 20) | Meadow, low hills (about 30 m) 190 m out | 35 each side | Broadleaf, 1 to 3 a side a segment; no rocks |
| Closing (21 to 55) | Hills rise and close in, slopes steepen | Narrows smoothly | Trees thicken and turn to conifers; outcrops start |
| Foothills (56 on) | Valley sides 120 m high, bare rock where steeper than 0.6 | 14 left, 24 right | 3 to 5 a side a segment, 85% conifers; outcrops |

- Each row keeps its station gap at every weight (`splitGaps`), and the ground between two stations is a straight line, so `base()` equals the drawn rows exactly at any `s`. A band may name a `closed` end (`{ to: 35, closed: 14, kind: 'runoff' }`): `zoneAt`, `rideableLimit` and `gateReach` read the band end at their segment, so the run-off, the wall line, solid trunks and gates narrow with the ground. The foot of the left bank moves with the band end, half a metre past it: between two columns the triangles join two places of a moving knee, and the margin keeps that out of the run-off, so the drawn run-off stays within 0.10 of `base()`. The river bed (right, 25 to 40 past the edge) is the same at every weight: the water ribbon is fixed.
- `roll` weights each station's share of a rolling ridge line (`wave`, amplitude 3 open to 16 closed): the run-off stations have none, so only the far slopes roll.
- Limits held by `tests/unit/runoff-legs.test.js` at every weight: rows run outward and reach no further than 200 (half the tightest bend, 444 m at segments 84 to 93), no slope steeper than 1.2 across the road or along it, the run-off no steeper than 0.15, every side ending at least 30 m above the road, and the drawn run-off within 0.10 of the ground the bike rides.
- Road height: 12 m through the open country, climbing about 16 m through the middle. From 14 segments before the leg's end it eases onto `cliffLake.elevation`, and from the end (segment 69) on it is that function, so the finish (segment 74), the 20 built segments past it and leg 2's own start (segment 70) are one road with no step. No step along the whole path exceeds 0.5.
- Dressing: `dressing.forest.closed` holds the tree values at full weight (`coniferShare`, `perSegment`); `dressing.outcrops.perSegment` is the number of rocks a segment at full weight. Outcrops (`createOutcrops`, one instanced mesh named `outcrops`) stand past the rideable limit plus 4, out of the river band, with their centres under the drawn ground so the ground cuts each into a cap. They are not solid: no bike reaches one.
- Backdrop: `dressing.backdrop: ['approach']` builds `createApproachRange`, one merged mesh named `approach-range`: peaks beside leg 2's road (the wall side 300 m out, the lake side 520 m) and a few at the head of the valley, straight on from the leg's end. Each stays clear of the road by its radius plus 120 (the head peaks clear of the road this leg draws). They stand on a base 80 m under the leg's lowest road, behind the valley sides. Fog alone leaves a far peak as a flat silhouette that still shows against the sky, so the material fades the range with view distance: whole within 800 m, gone at 1500 m (`userData.fade`), and a faded fragment is discarded. At 10% of the leg the nearest peak's foot is about 1060 m off (its centre 1400 m) and all but one peak are past 1500 m; at 95% the nearest foot is about 270 m off (centre 660 m). The far ring in the sky rises with the ride too (`render.ringRise`, see `rendering.md`).

- The bike slows and loses grip in run-off, and crashes after 6 s off the road, in water, or on an obstacle. Trunks, rocks and the relocated roadworks plant are `environment.boulders` entries with `solid: true` and a `height`: they are tested while airborne too, by horizontal distance and height, and are never hopped.
- Mountain-dawn has a river ribbon (`floor-river`, 3 m below the road, lateral 35 to 50 on the right). `Terrain.waterLevel()` gives the water height for a lake, sea or river.
- A trunk is solid when it stands within the rideable limit of its own nearest segment (`plantRunoffTrees`), the segment the bike's zone test reads.
- Roadworks plant stands at `-(roadWidth / 2 + 9)` (bulldozer) and `-(roadWidth / 2 + 6)` (barrier, truck) on run-off ground, not at -30 and -25 on a wall.
- A gate (`environment.finishGate`, `environment.checkpoints`) reaches `Terrain.gateReach()` each side at its own segment: the rideable limit plus 2 over run-off, the road's ledge beside a wall or fall. On mountain-dawn that is 47 each side at the first checkpoint and 26 (left) and 36 (right) at the finish. `Game.inGate(gate, position)` is the only gate test; there is no segment window.
- A changed course has `trackVersion` 2 in `Terrain.LEGS`, so `TourSystem.boardId()` gives `mountain-dawn-v2`, `valley-run-v2` and `storm-valley-v2` and local best times use `Game.bestTimeKey()`. `tests/unit/runoff-legs.test.js` pins a digest of each leg's course: change a road height, band, run-off rate or tree layout and it fails until the version is bumped. Progression keeps the plain leg ids.
- The menu preview camera takes its radius and height from `Terrain.LEGS[i].preview`.
- Mountain-dawn's board stays `mountain-dawn-v2` through the closing valley: no v2 board has shipped. Its course digest hashes the closed stations, roll, wave, the weight at every segment and the closed tree values.

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

`canyon` (foggy-gorge, segments 234 to 321) runs in five sections:

| Segments | Left | Right |
|---|---|---|
| 234 to 264 | wall | wall |
| 265 to 271 | tunnel | tunnel |
| 272 to 285 | wall | drop to the gorge lake |
| 286 to 293 | tunnel | tunnel |
| 294 on | drop to the gorge lake | wall |

A wall is 1 m past the road edge, 57 m high with its height swinging 18% along the road (so 46 to 67 m; `variation` and `snow: false` on the face). A drop is the cliff legs' drop (`cliffDropSide`, a 2 m ledge then 1.33 down per metre) onto the gorge's lake (`floor-lake`, absolute y -28, a fall ends at -27.5). Both tunnels lie on straights and keep a segment clear of every checkpoint (263, 295) and of the roadworks (281 to 283). A tunnel cuts through a rock spur: its sides climb from the lining to 40 m beside the walls, then run down into the lake and end 66 m under the road, so seen from a cliff road the spur is a ridge into the water, not a fin with an edge against the sky. The spur is drawn as bare rock (`rock: true` on a `heightfieldSide`: rock colour and texture, no face to dress), and its cap is rock (`span.cap`). Each change of side blends over one segment (`Terrain.rowAt()` blends from the side of one segment to the side of the next, span to span included). No trees, no mountain backdrop, and no roadworks plant (a wall or drop side builds none). Rocks fall at rate 0.5 from the walls in force at the target segment: both in the canyon (one draw picks the wall), the one wall on a cliff road, none in or beside a tunnel.

`forestNight` (night-ride) is the forest of storm-valley with less roll, a climbing road and two spans, and no rockfalls. Its ground reaches 135 past the road edge, not 165, because the leg's tightest bend (307.7 m) allows no row past half its radius.

A span with a `type` is a set piece: `Terrain.setPieces(profile)` lists them as inclusive segment ranges (`environment.setPieces`), and the world build keeps forest, rock dressing, bushes, delineator posts and rockfalls out of them (rockfalls out of the range widened by one segment each side).

| Piece | Leg | Segments | Terrain |
|---|---|---|---|
| Tunnel | foggy-gorge | 265 to 271 | Wall 1 m past the edge, `ceiling` 7.5, rock over the road |
| Tunnel | foggy-gorge | 286 to 293 | As above |
| Tunnel | night-ride | 514 to 521 | Wall 1 m past the edge, `ceiling` 7.5, hill over the road |
| Village | night-ride | 583 to 590 | Level pavement (run-off, so a rider is slowed, not crashed) to 3 m past the edge, then house fronts (wall) |

`Environment.createSetPieces()` builds each as a group named for its type, with a few merged meshes standing at the piece's centre (culling reads a mesh origin): the tunnel a lining, hill cap, two portals and an emissive lamp strip (each tunnel reads its own span's `ceiling` and `cap`); the village houses, windows, lamp posts, lamp heads and light pools. No piece adds a light: the scene keeps its seven. `Game.tunnelRoofY()` gives the roof over the bike (a segment either side counts) and `updateCamera` keeps the camera 1 m under it. Both legs have a `preview` for the menu camera. A span `type` must be `tunnel` or `village`: those are the only builders.

Both legs have `trackVersion` 2: `foggy-gorge-v2` and `night-ride-v2`. High-pass is the only leg with a plain board id.

## Golden bindings

`tests/golden/terrain-baseline.json` and `tests/golden/browser-baseline.json` bind high-pass only. The other seven legs are listed as `released` in `tests/golden/amendments.json` and `tools/terrain-check.mjs` compares them with nothing. High-pass is bound field by field: each field that moved by a declared delta (D6, the U3 plant, the U8 stripe children) carries its explicit expected value under `declared`, and the tool fails when the fresh value is not that value or when a declared path does not resolve. Its frames are recorded, not compared (`unbound`, ruling U18). Mountain-dawn was a bound cliff leg until it became the open valley; its bindings (stable fingerprint, randState, decal counts, ground grid, the D6 jest checks) moved to high-pass only.

## What is still in environment.js

`js/terrain.js` holds the ground model and the profiles. `js/environment.js` still builds every mesh: the ribbon, road, walls, forest, set pieces, roadworks plant and gates. A new profile should add its builders next to the existing ones by profile, and keep ground, height and zone rules in `terrain.js`, so `environment.js` does not grow with each leg.

## Only the active leg exists

`roadPath` holds all 744 segments. Geometry is built for `startSegment` to `endSegment + 20` only. Anything placed or spawned outside that range hangs in empty space. Traffic uses `legSegmentRange()`; cones and checkpoints read `startSegment` / `endSegment`.

Offsets from the road must use the road's perpendicular: `(cos(heading), -sin(heading))`. A world-X offset is only correct where the road heads north.

## Determinism

Scenery uses `Environment.rand()` (seeded per leg). The menu preview and the ride must build the same world. Do not use `Math.random()` in `environment.js`.
