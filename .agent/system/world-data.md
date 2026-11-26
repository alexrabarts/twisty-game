# World data

The W0 data gate for the Andermatt world. The tools are in `tools/world/`. The values below come from a real run of `node tools/world/inspect.mjs` on swissTLM3D release 2026-02 (`SWISSTLM3D_2026_LV95_LN02.gpkg`, 10.8 GB unzipped). Run it again after a new release and compare.

## Tools

| File | Job |
|---|---|
| `cache.mjs` (far) | `node tools/world/cache.mjs alti3d-far <west> <south> <east> <north>` reads only the 4 m overview of each swissALTI3D COG in the box (HTTP ranges, about 300 KB a tile, not the 1.2 MB file), pools it to 50 m (mean and max) and keeps `alti3d/far50/<E>-<N>.bin` (3.2 KB). The Tremola box (8.0591 46.1788 9.1172 46.9089, +-40 km round the slice) is 6 195 tiles, 24 MB, about 3 minutes. |
| `cache.mjs` | Resolves the cache (`$TWISTY_WORLD_CACHE`, else `~/Library/Caches/twisty-world`) and refuses a path inside the repo, also through a symlink. `node tools/world/cache.mjs tlm` downloads the 4 795 840 706 byte zip with HTTP Range resume, checks the content-length, then unzips with `unzip` (macOS `ditto` fails on this archive). `node tools/world/cache.mjs alti3d <west> <south> <east> <north>` (WGS84) walks the swissALTI3D STAC items, follows `rel=next`, keeps the newest year of each tile, and downloads the 2 m COG tiles into `alti3d/2m/`. |
| `gpkg.mjs` | GeoPackage reader on `node:sqlite`. It parses the GPKG header and WKB (Point to MultiPolygon, 2D, Z, ZM, both byte orders) and queries a bbox through the `rtree_<table>_<geom>` index. A table without an R-tree throws. |
| `inspect.mjs` | Prints the gate report as JSON. `--stages <ids\|all>` scopes it to those stages (default `all`, the whole route), so its `corridorEdges` are the count `verify.mjs graph --stages <ids>` compares with. In `connectivity`, `gap` is `false` for a connected pair (`gapM` holds the size of a gap); a junction `name` is the waypoint it sits at (`roads` lists the roads that meet there). Exit code 4 when a waypoint pair has no connecting road. |
| `stages.mjs` | The stages of the ride from `route.json` (`stageDefs`, `scopedRoute`). |
| `route.json` | The D1 waypoints in LV95, with `boundary` for the stage boundaries. |

The raw data never enters the repo: `.gitignore` holds `*.gpkg`, `*.tif`, `*.tiff` and `*.gpkg.zip`.

## Deviations from the plan

- The road table is `tlm_strassen_strasse`, not `TLM_STRASSE`. Column names are lower case. `inspect.mjs` has the name in one constant.
- Road names are in the `strassenname` column (the separate `tlm_strassen_strassenname` table is not needed).
- The download needs about 4.8 GB for the zip and 10.8 GB for the unzipped file. The cache needs 16 GB of free disk.
- `route.json` has 27 waypoints. The 21 stage boundaries of D1 are `boundary: true`. Six are via points (Tremola upper, Tremola lower, Bedretto, Oberwald, Gadmen, Guttannen). They keep the shortest path on the intended road: the Tremola, the Bedretto valley, the Furka side of Oberwald, the Gadmen side of the Susten and the Grimsel approach.

## Report values (release 2026-02)

| Key | Value |
|---|---|
| `strasseColumns` | `id geom uuid ... objektart kunstbaute wanderwege befahrbarkeit stufe richtungsgetrennt name belagsart kreisel verkehrsbeschraenkung eigentuemer verkehrsbedeutung strassenname` |
| `hasZ` | **true**. All 19 426 vertices of the ride carry a non-zero Z, from 451.9 m to 2 479.4 m (LN02 heights). |
| `structureField` | `kunstbaute` |
| `structureValues` (ride) | Keine 211 418 m, Galerie 5 737 m (26 edges), Bruecke 5 628 m (161), Tunnel 5 606 m (42), Unterfuehrung 132 m, k_W 7 m |
| `structureValues` (corridor) | also Staumauer/Wehr, Gedeckte Bruecke, Furt, in/auf Gebaeude. `Treppe` exists nation-wide and is dropped. |
| `roadClassField` | `objektart` |
| `roadClassValues` | 3m, 4m, 6m, 8m, 10m Strasse, Autobahn, Autostrasse, Ausfahrt, Einfahrt, Raststaette, Platz, Verbindung, Dienstzufahrt, Zufahrt, Markierte Spur, and the paths 1m Weg, 2m Weg, 1m Wegfragment, 2m Wegfragment, Klettersteig, Autozug |
| `tremola.spacing` | median **8.18 m**, p95 **29.5 m**, max 76 m, 80 % of the segments are over 4 m (13 177 m, 1 181 vertices, Gotthard to Airolo) |
| `tremola.hairpin` | 29 hairpin apexes (a heading change of over 120 degrees across a 60 m window). At the apex the vertex spacing has median 2.95 m and p95 3.9 m. |
| `corridorEdges` | 5 445 kept edges, 646 km, within 1 km of the ride. By class: 3m 211 km, 6m 157 km, 4m 148 km, Autobahn 52 km, Autostrasse 42 km, 8m 16 km, the rest under 8 km. |

The Tremola waypoints sit on the old Via Tremola (4m Strasse, Verbindungsstrasse). Without them the shortest path takes the modern Durchgangsstrasse, which has 7 hairpins and not 29.

### Connectivity

All 26 consecutive waypoint pairs are connected. The ride is **228.5 km**. D1 estimated about 220 km.

Altdorf to Amsteg 13.1 km, Amsteg to Wassen 12.3, Wassen to Schöllenen 7.9, Schöllenen to Andermatt 2.0, Andermatt to Hospental 2.5, Hospental to Gotthard 8.9, Gotthard to Airolo 13.2 (via Tremola upper 4.9, Tremola lower 2.2, Airolo 6.1), Airolo to Bedretto 8.5, Bedretto to Nufenen 14.7, Nufenen to Ulrichen 13.9, Ulrichen to Oberwald 5.1, Oberwald to Gletsch 7.2, Gletsch to Furka 9.3, Furka to Realp 12.1, Realp to Hospental 6.0, Hospental to Andermatt 2.5, Andermatt to Schöllenen 2.0, Schöllenen to Wassen 7.9, Wassen to Susten 17.8, Susten to Gadmen 15.7, Gadmen to Innertkirchen 12.4, Innertkirchen to Guttannen 8.6, Guttannen to Grimsel 17.8, Grimsel to Gletsch 7.1.

Every pair has `gap: false` (`gapM: 0`). The shortest path weights the road class, prefers `Durchgangsstrasse`, and charges 25 times for a motorway, so it follows the pass roads. Three waypoints snap more than 50 m from the hand-placed point (Altdorf 56 m, Hospental 61 m, Gletsch 38 m): they snap to the through road, which is the intent.

### Junctions

The ride has 351 graph nodes of degree 3 or more. 46 of them are passed twice. A pass is an arrival on one edge and a departure on another. No waypoint is a U-turn onto a spur.

| Expected | Found |
|---|---|
| Andermatt | 21 nodes (Gotthardstrasse, Bahnhofstrasse, Bäzweg), the village is crossed in both directions |
| Hospental | 6 nodes (Furkastrasse / Gotthardstrasse at 2686388,1163546, the Alte Gotthardstrasse, the Umfahrungsstrasse) |
| Wassen | 6 nodes on Gotthardstrasse, including Gotthardstrasse / Sustenstrasse at 2688751,1173391 |
| Gletsch | 1 node: Furkastrasse / Grimselstrasse at 2670758,1157186 |

The other used-twice nodes (Schöllenen 7, the Wassen to Schöllenen stretch 5) lie on the stretch that the ride rides twice. W2 `graph.mjs` treats them like the four above: one pass record each time the ride crosses.

## Gate outcomes

1. **TLM carries Z: the road profile comes from the TLM 3D line.** Not yet checked against the DEM (needs `geotiff`, which W2 adds as a devDependency). The Tremola 2 m tiles for that check are cached (9 tiles, year 2022).
2. **A structure flag exists (`kunstbaute`): tunnels, galleries and bridges come from it.** The importer does not detect them from the DEM. `tools/world/structures.json` is needed only for names and landmarks, not for detection.
3. **Hairpin spacing is coarser than 4 m: the importer refines with a fitted arc.** The ride median is 8.2 m and p95 29.5 m. The vertices at the apexes are fine (median 2.95 m), the stretches between are not. W2 `resample.mjs` fits arcs on every span over 4 m and puts a fillet at every bend under `R_MIN`.
4. **No gap in the waypoint graph.** The run continues.
5. **Kept road classes:** 3m Strasse, 4m Strasse, 6m Strasse, 8m Strasse, 10m Strasse, Autobahn, Autostrasse, Ausfahrt, Einfahrt, Raststaette, Platz, Verbindung, Dienstzufahrt, Zufahrt, Markierte Spur. Dropped: 1m Weg, 2m Weg, 1m Wegfragment, 2m Wegfragment, Klettersteig, Autozug, every edge with `kunstbaute = Treppe` and every edge with `befahrbarkeit = Falsch`. W2 writes this list to the manifest.

### Graph size

The kept corridor is 646 km. At 4 m and 16 B per sample the edge samples are 2.6 MB, under the 4 MB estimate. The motorway and the Autostrasse are 93 km of that. If the 28 MB budget is tight, drop them first.

## H1: hosting

GitHub Pages builds `main` with the legacy Jekyll builder (checked at plan time). `.nojekyll` at the repo root stops the Jekyll build from filtering about 1 500 binary files. **Not verified:** how Pages serves a `.bin` (content-type, gzip, status). P-H1 checks it on the live site after the first merge that puts `world/` on `main`. The world is the menu's default ride before that check, so a host that does not serve the data must not leave a broken screen: when the load fails (a fetch error, a status other than 200, data not in the world format) `Game.fallBackToLegs` opens the leg screen with a note (`RideMode.FALLBACK_NOTE`), and the rider screen stops offering the world for that page.

## W2: the importer (Tremola slice)

`node tools/world/import.mjs --stages tremola` reads the cache and writes `world/` and `functions/world-courses.json`. `--synthetic` writes the mini fixture to `tests/fixtures/world/mini` (3 stages of 2 km, station spacing 1 000 m, so one checkpoint a stage, a 20 degree kink at R = 20 m, a 180 degree hairpin at R = 10 m, a stacked pair of hairpins with legs 25 m apart, a tunnel and a four-way junction). The same cache gives the same bytes: no clock, no random, sorted iteration, and no search (the floors are closed-form). `--cache` inside the repo is refused.

| File | Job |
|---|---|
| `import.mjs` | The pipeline and the command line. `loadTlmSource` is the real source, `synthetic.mjs` the made-up one. Both give `buildWorld` the same shape. |
| `graph.mjs` | The corridor graph: every kept road within 1 km of the ride, and the ride as `[{edgeId, dir}]`. A gap stops the import (exit 4). A side road is cut to the corridor. |
| `resample.mjs` | The ride is resampled as one line and cut at the graph nodes (a bend that runs across a node is not broken by it). A pure-pursuit rider follows the mapped line at 1 m steps with the turn rate capped at 1/R_MIN. `R_MIN` is 10 m, read from `js/world/physics.js` (`rMin`) once that file exists. After each ride the legs are compared with the map: where a leg comes more than 1.5 m nearer another leg than the map has them (legs within 15 m), the tightened bends within 50 m are held to `R_HAIRPIN` (6 m, `rHairpin`) with a 5 m carrot, and the line is ridden again (stacked hairpins, below). |
| `profile.mjs`, `dem.mjs` | Height from the TLM Z, smoothed over 40 m (Savitzky-Golay), node heights reconciled over 20 m, then checked against the 2 m DEM. |
| `bench.mjs` | 512 m tiles at 8 m. Every node of a triangle that reaches into a road's drawn strip (the ribbon, the 1.1 m verge, 0.5 m) takes that road's height, so the land meets the drawn edge; a node two strips claim keeps the lower road (no land over any road), and the ride keeps its own carriageway and verge at a junction, and the nodes up to `RIDE_OWN_PAST_M` (4 m, half a cell) past its verge, but only against side roads that lie under it there (none more than `RIDE_OWN_OVER_M`, 0.1 m, over the ride): at 8 m, or against a side road that climbs over the ride, the node held at the ride's height left that road's edge open over the land (3.7 m at the Tremola's km 12.4) and a wall end open beside it. Under a bridge the land stays `BRIDGE_UNDER_M` under the deck at each node's own place along the road, extended past the deck's ends along the road's line: held at the deck's height at the band point, the land past a deck's end on a grade stood 0.6 to 0.9 m under the road. Round a tight bend the nodes are lowered until no point of the road lies under its land, then raised where room allows. The land within two cells of the strips keeps a 1:1.5 batter (embankment or cut); where two legs are too close, a `drop` node (beyond the upper road's strip) marks the upper road's retaining wall. |
| `widths.mjs` | The ride narrows from 10 m toward its class width (never under 7 m) where another piece of road comes within its drawn band, and in a held hairpin (radius under 0.95 R_MIN) so its inner edge stays 5 m from the bend's centre where 7 m allows, tapered at 0.1 m a metre. |
| `junctions.mjs` | Passes, stubs (60 m) and barrier poses, one set per pass. A barrier follows its side road on through nodes of degree 2 and stands 8 m short of the next junction (half way along a shorter edge), never on another junction. The game no longer reads the barrier poses: nothing closes a side road (`.agent/system/world.md`, "A side road is open"); they stay in the data until the next import drops them. |
| `landcover.mjs`, `buildings.mjs`, `landmarks.json`, `structures.json` | Cover at 16 m, oriented boxes, hand-placed landmarks, hand-marked cobbles. `clearOfRoads` keeps every building 3 m (`ROAD_CLEAR_M`) clear of the band of every road, ride and side edge: the game road is wider than the mapped one, so a box over a band moves square off the road by up to 4 m, or is left out. `verify.mjs buildings` checks the committed data. Water is painted where it is, not past it: `TerrainMesh.colours` colours the node on a cell's north-west corner from the cell and fades it out 16 m away, so a cell is water only when the square 8 m round that corner lies in a lake (`WATER_REACH_M`, sampled every 4 m). The half tint falls on the mapped shore or inside it, a faint tint reaches at most 8 m past it, and a pond under about 16 m across is drawn as land. Before, the 16 m cells (sampled at their middles, drawn from their corners) put water up to 16 m past the shore, over two mapped buildings. `verify.mjs water` fails on a building footprint over drawn water. |
| `places.mjs` | The stopping places beside the ride ("Stopping places" below): `mapPlaces` (a mapped parking or rest area along the ride), `applyPads` (the wider verge of every place with a surface on the ride's edges, which `bench.mjs` carves the land to), `foundPlaces` (a layby or a viewpoint where the map has none: `groundKind`, `fallsAway`), `padOf` (the taper the runtime repeats). |
| `stations.mjs`, `floors.mjs` | The station rule (R3, "Stations" below) and the per-link time floors. The floor is 0.9 times the time of an ideal rider on the inner edge of each bend at top speed, held only by the lean angle (closed-form, no search, so there is nothing to hang or to differ between runs). "The floors and the rider's lean" below has the lean and the rule of a bend. |
| `encode.mjs` | The format below, `SHA256SUMS`, `functions/world-courses.json`. `decodeWorld` reads it back. |
| `verify.mjs` | `fidelity`, `hairpins`, `elevation`, `size`, `graph`, `stacked`, `stations`, `crests`, `buildings`, `water`, `floating`, `overlap`, `horizon`, `landmarks`, `places`, `dem`, or `all`. |

### Tremola slice, as committed

The slice rides **uphill from Airolo to the Gotthard summit** (route.json `slices.tremola`, waypoints 9, 8, 7, 6), the opposite way to D1, because that is how it is played for the play-test (P5: start 1 180 m, summit 2 107 m). It is 13.2 km (13 187 m, 68 m shorter than with every hairpin at R_MIN) with 6 checkpoints (8 stations with the start and the finish) and 31 hairpins, none tighter than R = 10 m except 7 stacked hairpins held at R = 6.05 m or more. DEM deviation outside structures is 0.49 m at p99. The data is 1.33 MB in 237 files.

- **Fillets widen hairpins.** Where the mapped bend is tighter than R_MIN the ride takes an R_MIN arc and rejoins the mapped line. The fillet spans are the places where the ride sits more than 1 m from the map; `verify.mjs fidelity` lists them and fails on a span with no tightened bend near it. Outside them the ride is within 1.2 m of the map. The ride is 0.08% longer than the mapped line.
- **Stacked hairpins keep their real footprint.** On a ladder whose legs are mapped 8 to 12 m apart a 10 m arc cannot turn between two legs: it ran wide and carried the next leg onto the one beyond (ride legs 2.83 m apart at s 7898/8010 and 3.55 m at 7970/8133, 4.2 m at 10858/10938, where swissTLM3D has them 11.4, 10.9 and 10.9 m apart). Those hairpins are held to R_HAIRPIN (6 m) instead, so no two legs are more than 1.5 m nearer each other than the map has them; `verify.mjs fidelity` fails on a squeezed leg (`squeezedLegs`), and `hairpins` allows a radius under R_MIN only inside a hairpin and never under R_HAIRPIN. The nearest two legs are now 8.36 m apart (mapped 8.1 to 8.6 m there); the bike rides them on the assist's speed advice (about 6 m/s at 35 degrees).
- **Nodes move.** A node that the ride uses moves onto the resampled ride line (by a metre or two). Side edges that end there follow it.
- **An edge that the ride uses twice** (Schöllenen, Andermatt-Hospental, W5) keeps the samples of its first use. The second use is the same samples read the other way, so the bend across its joins is not smoothed for that use.
- **Cobbles.** TLM gives every road `Hart`, so the cobbled Via Tremola is marked by hand in `structures.json` (4 km of the slice).
- **`far.bin`** covers the corridor tiles plus 1.5 km. The land beyond it, out to 40 km, is the far land (below).
- **Landmarks** are anchored at the pass waypoints (`landmarks.json` lv95). Only the Gotthard Hospiz is in the slice. At runtime `Scenery.landmarkPlace` tries places beside the ride up to 150 m either way of the landmark's s and 80 m out, turned to face the ride, and takes the one nearest the anchor whose whole plan box keeps 3 m off every road band and stands on no drawn water (`Scenery.wetUnder`). It used to take the first place clear of the roads on the left: at the summit that was Lago di San Carlo, so the Hospiz stood wholly in the lake, and the land under it was never read (its tiles were not resident when it was built; `Scenery.fixtureTiles` now loads them first). swissTLM3D 2026-02 has no footprint for the Hospiz, so the anchor stays the pass point. The game's road (10 m and the verge) leaves about 5 m between its band and the lake shore there. Of the places clear and dry it takes the nearest whose land rises no more than 1.5 m under its walls (`LANDMARK_RISE_M`), else the one that rises least: the Hospiz stands beside the ride at s 13132, 38 m north of it, on land that rises 1.4 m under it, its floor 0.5 m over the mean land there and 0.45 m over the road.
- **Buildings meet the land** (`Scenery.footing`): a house's or landmark's floor (its model's y 0) stands 0.1 m under the highest drawn land under its walls, so no door is sunk, and a stone footing runs from 0.3 m under the lowest land up into the walls, so no corner floats. The walls are the model's `wall` parts, or its plan box 0.8 m in from each side. The footings of a tile are one mesh in the world's metres, in the retaining walls' dry-stone material (`Scenery.footingMesh`), built from exactly the houses drawn. A footprint too small for a modelled house is a hut (timber walls, slate roof, `Scenery.hutParts`), and a big mapped wall a block of stone; the plain beige box is gone. A house whose land rises more than 4.5 m under its walls (`FOOTING_MAX_M`: a plot on a road's cut or fill) is left out: 10 of the 72 houses the ride draws, all at Airolo. A house was set 0.3 m under the lowest of five points a half-diagonal out from its middle, on the axes, not its own corners: on Airolo's slopes every house's uphill side was sunk, up to 11 m. A house whose mapped footprint stands on drawn water is left out. `tests/unit/world-footing.test.js` rides the slice and fails on a house or landmark over drawn water, a corner of its foot more than 0.3 m over the land, or its floor more than 0.3 m under it.
- **Station spacing** is 2 000 m for the real ride and 1 000 m for the mini fixture (`SPACING_M`, the importer's `--spacing`). It was half that until the checkpoints were halved; see "Stations".

## Stopping places

`manifest.places` lists where a rider can pull in and wait beside the ride, in order along it: `{ id, kind, source, s, side, length, depth, taper, surface, name }`. `s` is where the place starts (metres of ride), `length` how far it runs, `side` is `Route`'s (+1 the rider's left, -1 the rider's right), `depth` is how far the place reaches past the usual 1.1 m verge. `name` is the map's public name for the area, or null. The runtime's rules for a place are in `world.md`, "Stopping places".

### What swissTLM3D 2026-02 holds (the Tremola stage)

| Table | Classes in the stage's box | Use |
|---|---|---|
| `tlm_areale_verkehrsareal` (polygons, `objektart`, `name`) | Oeffentliches Parkplatzareal 11, Verkehrsflaeche 3. In the whole file: Oeffentliches Parkplatzareal 10 107, Privates Parkplatzareal 4 270, Rastplatzareal 168, Verkehrsflaeche 437, Privates Fahrareal 101, and airfields. | **Used.** Oeffentliches Parkplatzareal is a `carpark`, Rastplatzareal a `layby` (`AREA_KINDS`). Private areas and Verkehrsflaeche (a paved traffic area, not a place to stop) are not places. |
| `tlm_strassen_strasse`, class `Platz`, `Raststaette`, `Zufahrt` | Platz 4 (all at the viewpoint on the pass road, below), none within 80 m of the ride. Ausfahrt 3, Einfahrt 1 and Verbindung 10 near the ride are motorway ramps and joins of 1 to 10 m. | Not used: a `Platz` object is the lane inside a parking area the first table already gives. |
| `tlm_eo_einzelobjekt` (points) | Bildstock, Brunnen, Denkmal, Gipfelkreuz, Grotte, Landesgrenzstein, Quelle, Triangulationspyramide, Wasserfall, Wasserversorgung. | No viewpoint class exists in the release. No kind `viewpoint` can come from the map. |
| `tlm_strassen_strasseninfo`, `tlm_strassen_aus_einfahrt` | Standardknoten, Durchfahrtssperre; motorway exits. | Nothing about stopping. |
| `tlm_areale_freizeitareal` | Freizeitanlagenareal (the Gotthard museum, 9 m left at s 12 520). | Not a place to stop. |

The surface: `belagsart` is on roads only (Hart, Natur, k_W) and an area has none, so a place takes its surface from its kind (`SURFACE`: a car park asphalt, a lay-by gravel).

Along the stage, the parking areas are:

- **The summit, beside the ride (used).** 770 m2, a strip along the road from s 12 520 to 12 603 on the rider's right, 4.3 m across on the map. It starts 2 m from the ride's centre line: the game's road is 10 m wide, wider than the mapped one, so the area's own width is laid from the game's carriageway edge outward. Its first 14 m are a side road's mouth (junction at s 12 519.9, leaving right), which the place keeps clear of. Result: `carpark`, s 12 539.2, 63.5 m, 3.5 m deep.
- **The summit, left (not used).** 2 194 m2, 15.5 m or more from the game's carriageway edge, reached by the side road at s 12 556.7. A third (1 259 m2) lies 180 m to the right. Neither is beside the ride. A place on a side road is not built: the crew's lane is the ride's (`WorldRoute.laneCurve`), and the off-route rule puts a rider on a side road back on the ride.
- **A viewpoint on the main pass road (in the data, not reachable).** Two Parkplatzareal (859 and 1 847 m2) with their `Platz` lanes and a kiosk building, on the 8 m pass road, 333 to 394 m left of the ride at s 6 570 to 6 800. The ride never meets that road within reach of a stub, so it is not a place.
- The other six are in Airolo, 200 to 580 m from the ride.

So the map gives the ridden old road one place, 650 m before the summit. The rest are found.

### The rules (`tools/world/places.mjs`, `PLACE`)

- **A map place.** At each sample of the ride, on each side, the area's extent along the normal is measured from the centre line out (0.25 m steps). It counts where the area starts within 3 m of the game's carriageway edge (or inside the carriageway) and is 2 m or more across. The depth is that width, 5 m at the most. Samples on a structure, in a bend under 40 m radius, within 16 m of a side road's mouth on the same side, or with another road's band in the strip do not count. A run of 12 m or more is a place: its depth is the median of its samples', its taper 6 m (a third of its length at the most).
- **Its ground.** `applyPads` writes the pad (the depth, tapered: `padOf`) onto the ride's edges as `padP` and `padN` (the edge's own +lateral and -lateral side; an edge ridden against its direction has the ride's left on its -lateral side). `bench.mjs` reads them wherever it reads the verge: the strip is that much wider on that side, its nodes take the road's height, and the fill at the batter starts at the place's edge. An edge with no pad gives the same numbers as before, so only the tiles under a place change: for the Tremola slice `height/h-m3_16.bin` and `height/h-m4_16.bin`.
- **A found place.** Where no place lies within 600 m (`foundGapM`), the importer looks for a stretch of road straighter than 60 m radius, no steeper than 12 %, off every structure, 30 m from every junction and clear of every other road, on ground that is no wall, drop or water. Its kind is the land's (`groundKind`, on the land before the place is carved): a `layby` where the land is within 0.25 m of the road's height from the verge's edge out to 2 m past it (`foundLevelDepthM`) and no more than 1.5 m over it (`foundCutM`, the bank the bencher cuts) or 0.25 m under it out to the pad's depth; a `viewpoint` where the land under the pad lies no more than 2 m under the road (`view.fillM`, the fill under it) and nowhere over it, and from 22 m to 46 m past the carriageway's edge (past the earthwork) lies everywhere 6 m or more under the road (`fallsAway`, `view`) at every sample of the place. A level stretch with the drop beyond is a viewpoint too. No retaining wall may stand at its edge or within 16 m along the road (`wallRisk`: a wall or drop node, or land 1.2 m under a slope at the batter, within 6 m past the verge; the runtime stands the edge on a wall there and cuts the land down in front of it, so the strip is no ground: the first import offered one such place, at s 4 302, 5 m over the cut land). A run of 24 m or more offers a place of 32 m at the most every 40 m along it; it is a viewpoint when every sample of it is. From the start or the last place, the importer takes the candidate furthest on in the second half of the gap, on the rider's right where there is one (traffic keeps right, so a rider pulls in without crossing the road), a viewpoint before a layby there, and one clear of a checkpoint's roadworks before one in them (570 m back from each gate station to 20 m past it: the runtime closes a place in the works, and the works' length is the runtime's own draw).
- **A found place is carved.** Its pad is 2.6 m past the verge (`foundDepthM`: 3.7 m past the carriageway's edge, room for a bike 1.45 m clear of the carriageway with as much hard standing behind it), tapered over 6 m at each end (`foundTaperM`). It has a surface (`SURFACE`: gravel for a layby, asphalt for a viewpoint and a car park), and every place with a surface is carved: once the found places are chosen, `applyPads` writes their pads on the ride's edges and the land is benched again. A tile no pad reaches comes out the same bytes. The wall rule is read on the land before the carving, from the verge's edge: the bencher then fills from the pad's edge at the batter, so land that keeps to the batter from the verge's edge keeps to it from the pad's (read from the pad's edge on the uncarved land, it found a wall at 9 in 10 of the falling sides). The first imports' found places were `verge`: 2 m deep, not carved, no surface; the runtime still reads one.
- `verify.mjs places` checks the committed data: order, bounds, kinds and each kind's surface, no place on a structure, in a tight bend or at a mouth, no land over a drawn place (0.15 m), the land under it no more than 2 m down (the fill from its edge closes it, as under any verge), no retaining wall at a found place's edge, a viewpoint's land falling away at every sample, and the land beside a `verge` place level. It reports the gaps and the count of each kind.

The Tremola slice has 21 places: 1 car park from the map and 20 found: 16 laybys and 4 viewpoints (s 1 594, 4 693, 6 960 and 12 078, all on the right), 15 on the right and 6 on the left, 383 to 1 029 m apart (559 m from the start to the first, 648 m from the last to the finish; the 1 029 m is s 8 182 to 9 210). The runtime closes 2 of them for the roadworks (s 9 210 and 11 507, each inside a site), which leaves 19 open, at most 1 660 m apart (s 8 182 to 9 842, the stacked hairpins). The re-import that carved them changed `manifest.json`, `SHA256SUMS` and the 11 height tiles their pads reach (`h-0_20` to `h-0_22`, `h-m1_19` to `h-m1_21`, `h-m2_19`, `h-m3_16` to `h-m3_19`); every other file is the same bytes and `functions/world-courses.json` is unchanged. The mini fixture has its car park on its first straight (s 304, the rider's right) and 5 found viewpoints (4 on the right, 1 on the left: its land is a slope that falls away from the road).

## More legs: a data folder for each import

The Tremola slice stays in `world/`, byte for byte. A later import that is not the same ride goes into its own folder under `worlds/`: the Gotthard leg, Andermatt over the summit to the lookout over Airolo, is the ride of `worlds/gotthard/` (`node tools/world/import.mjs --stages gotthard-north --out worlds/gotthard`). It was two stages, the run-in (`gotthard-north`, to the hospice square) and the lookout leg (`gotthard-lookout`), until the owner had them made one (2026-11-25). The rules:

- **One ride a folder.** A folder holds one continuous ride (`ride.json`), cut into its stages. Two legs that do not follow each other on the road (the Tremola runs up from Airolo, the run-in from the north comes down to the same summit) are two folders.
- **A stage names its folder.** `WorldData.FOLDERS` lists each shipped folder and its stages; `WorldData.baseFor(id)` gives the folder of stage `id` (`world/` for `all` and an unknown id). `?world=<id>` reads that folder; `?worldData=worlds/<name>` names one directly (under `worlds/` or `tests/fixtures/world/` only). A shipped folder is trusted when its manifest is the one its own `SHA256SUMS` lists.
- **The board rows.** `functions/world-courses.json` holds the rows of every folder: an import replaces its own stages' rows, the rows of the stages its folder held before (its old manifest: two legs made one lose their rows) and its tour's (`world-tour-<name>-v1` for `worlds/<name>`, written for two stages or more), and keeps the rest (`writeCourses`). A course that changes gets a new board id: the next `version` of its stage in `tools/world/boards.json`, with the reason (`gotthard-north` is 2: the leg runs on to the lookout). A stage shorter than twice the station spacing has no checkpoint: `gates` 0 and one floor.
- **Stops off the D1 line.** `route.json` `points` holds places the D1 waypoints do not pass (`id` after the waypoints); only slices name them. `snap: "nearest"` takes the nearest road of any class.
- **The menu.** `WorldLegs.LIST` (js/world/legs.js) holds the legs in ride order, grouped by pass, from the tour's table ("The legs on the menu" and "The tour" in `world.md`).
- **A leg of the tour from a ride a folder holds.** A leg that rides a stage a folder already holds, the other way or a part of it, is not a new folder: js/world/tour.js names its `base` stage, its `dir` and its two stops, and `node tools/world/tour.mjs` writes it into that folder as a stage of its own (its stations, its floors, its board row; `world.md`, "The tour" and "A stage ridden either way"). Only an import makes a ride: leg 1 (`airolo-lookout`, Airolo up the modern road to the lookout) is the ride of `worlds/airolo` (`node tools/world/import.mjs --stages airolo-lookout --out worlds/airolo`, then `node tools/world/tour.mjs`): 10.7 km, 4 checkpoints, 17 found places, 58 height tiles, 1.29 MB. Its first 3.7 km are the Tremola's first 3.7 km (the two rides share the road out of Airolo); the folders overlap there and each draws its own copy.

## The stops at a leg's ends

A leg starts and ends at a real stop: a hotel, a restaurant, a lookout, a fuel station or a car park (`STOP_KINDS`), where the group pulls in and parks. A slice of `route.json` names each stop by its kind and the coordinate of the evidence for it (`stops.start`, `stops.end`, and `stops.via`, a list of stops on the way that move no stage end and are looked for round the ride's sample nearest the coordinate: where the owner's photos cluster as a stop, or a building with a use). Everything else is found by rule (`tools/world/stops.mjs`, `STOP`):

- **The area.** The public car park or rest area (`AREA_KINDS` of `places.mjs`) nearest the coordinate, within `areaReachM` (300 m).
- **The way in.** `direct` when the area comes within `directM` (16 m) of the ride's edge within `searchM` (800 m) of the stage's end: the turn-in is the first sample of the run of such samples nearest the end. `road` otherwise: the shortest way along the side roads from a node of the ride to a side-road sample within `laneM` (6 m) of the area, at most `pathMaxM` (400 m), or `startPathMaxM` (800 m) for a stop at a stage's start: the group gathers there and rides out to the start line, and a station's or a village's car park lies further off the through road. The importer looks for areas round each stop's coordinate as well as round the ride. Re-importing `worlds/gotthard` after this change gives the same bytes: no stop of it is gained or lost.
- **A line that stays.** `keepLine: true` on an end stop (a leg whose board is already ridden) leaves the stage's end where it is: the stop may lie behind the line, and the stop scene turns the group round at the line (`StopScene.wayIn`).
- **The finish line.** A stop at a stage's end moves the end, and the next stage's start, to `leadM` (60 m) before the turn-in: the timed ride ends before the pull-in, so a stage is not a parking contest. The ride itself runs on to the turn-in (the data holds it; no stage covers it).
- **The slots.** `slots` (8) bikes side by side, `slotGapM` (1.6 m) apart, along the area's long axis through its middle (rows `rowGapM` either side where one row has no room), each `marginM` (1.2 m) inside the outline. An area with no room for the group stops the import.
- **What the manifest holds.** `manifest.stops`: `{ id, kind, stage, at, s, side, access, x, z, ring, path, slots }` (`ring` the outline, at most 32 points; `path` the way in from the ride to the slots' row). A map place that is a stop's own area carries `stop` (the stop's id), and `WorldPlaces` keeps it open at its stage's end.
- **What swissTLM3D 2026-02 has for a stop.** No hotel, restaurant or fuel class in a village. Buildings with a use: `nutzung` `Gasthof abgelegen` (a remote inn; 5 492 in the file), also `Aussichtsturm`, `Schutzhuette`, `Parkhaus`. `tlm_strassen_strasseninfo` `Raststaette` (174) has `tankstelle` and `restaurant` flags: motorway services only. So the evidence for a stop's kind is the owner's photos and those uses; the place to park is always a public car park or rest area.

### The stops of `world/` (the Tremola)

| Stop | Kind | Area | Way in |
| --- | --- | --- | --- |
| Start | `carpark` | the station's public car park at Airolo | by road, 617 m from the start node |
| End, behind the kept line (s 12 542.7, the line at s 13 187.4) | `restaurant` | the hospice square, the same area as the Gotthard leg's stop on the way | direct |

The stops were laid on the shipped data, not imported whole: `world/` was imported before the bench rules of 6f, and a new import changes 9 more height tiles and one found layby (p5, s 3 750.7 to 3 759.3, 32 m to 25.9 m long) under those rules. Only the manifest's `stops` and the nodes the stops' areas level on three tiles (`h-3_22`, `h-m3_16`, `h-m4_16`, 71 nodes) changed; the ride, the stations, the places and the board row `world-tremola-v1` are the same.

- **Where a leg of the tour starts.** A stop on the way may be where a leg starts (`legStart: true` in route.json): the group gathers there, so its way in may be `startPathMaxM` long. A stop records `s1`, the far end of the run of the ride beside its area (a `direct` stop): a stage ridden the other way turns in there.
- **A held shot in the data.** A stop's `hold` in route.json (the eye at LV95 `e`, `n`, `upM` over the drawn ground, `bearing`, `pitch`, `hfov`, `vfovMost`, `haze`) goes into the manifest in local metres; the stop scene flies there (`StopScene.holdOf`).

### The stops of `worlds/airolo`

| Stop | Kind | Area | Way in |
| --- | --- | --- | --- |
| Start of `airolo-lookout` | `carpark` | the station's public car park at Airolo (the Tremola's start stop) | by road |
| End of `airolo-lookout` (finish line s 10 695) | `lookout` | the outer public car park at the hairpin of the lookout over Airolo (the Gotthard leg's end stop), with the lookout's photo-matched hold | direct, turn-in at s 10 755 |

### The stops of `worlds/susten`

One ride, Andermatt over the Schöllenen to Göschenen, down to Wassen, up the Meiental to the Susten pass and down to Gadmen, 44.2 km in three stages (legs 3 to 5 of the tour): `node tools/world/import.mjs --stages andermatt-goeschenen,goeschenen-susten,susten-gadmen --out worlds/susten`, then `node tools/world/tour.mjs` (it names each leg's start stop: the end stop of the leg before it). 276 height tiles, 46 structures, 3 places from the map and 73 found, 4.92 MB. The Göschenen waypoint stands on the through road where the village road leaves it: on a village street, the ride ran 1 km into the village and back on the same road.

| Stop | Kind | Area | Way in |
| --- | --- | --- | --- |
| Start of `andermatt-goeschenen` | `hotel` | the public car park at the south-west edge of Andermatt (the Gotthard leg's start) | direct |
| End of `andermatt-goeschenen`, start of `goeschenen-susten` (line s 6 421.8) | `carpark` | the station's public car park at Göschenen (`legStart`) | by road, turn-in at s 6 481.8 |
| End of `goeschenen-susten`, start of `susten-gadmen` (line s 28 272.7) | `carpark` | the public car park at the Susten pass (`legStart`) | direct, turn-in at s 28 332.7 |
| End of `susten-gadmen` (line s 44 059.6) | `carpark` | the public car park at the west edge of Gadmen, where leg 6 will start | by road, turn-in at s 44 119.6 |

- **A stage with fewer checkpoints.** Leg 3's first target lies among the Schöllenen's tunnels and galleries. Where a dropped target would leave a gap over twice the spacing, a stage now takes one checkpoint fewer, placed evenly again; one with no place at all, up to four times the spacing long, is timed in one link (`placeStations`). Leg 3 has 1 checkpoint where its length gives 2; legs 4 and 5 have 10 and 6 (leg 5's target at s 40 113 is within 80 m of a structure and dropped).
- **Landmarks with no model.** The old Devil's Bridge and the Urnerloch are listed (`tools/world/landmarks.json`) with no model; the importer leaves such a landmark out and says so, instead of stopping.

### The stops of `worlds/gotthard`

| Stop | Kind | Area | Way in |
| --- | --- | --- | --- |
| Start of `gotthard-north` | `hotel` | the public car park (2 869 m2) at the south-west edge of Andermatt, beside the Gotthard road | direct, at the start |
| On the way (`via`), turn-in at s 11 637.8 | `restaurant` | the public car park (2 194 m2) by the hospice and the two remote inns on the summit | by road, 226 m from the modern road over the hospice's access road |
| End of `gotthard-north` (finish line s 14 504.2) | `lookout` | the outer public car park (1 847 m2) at the hairpin of the lookout over Airolo, with the kiosk | direct |
| On the way (`via`, `legStart`), turn-in at s 2 650 | `carpark` | the public car park at the west edge of Hospental, on the Furka road, where leg 11 of the tour starts (and leg 10 will end) | by road |

The Hospental stop was laid on the shipped data, as the Tremola's were: a re-import with it gives the same ride and graph and levels 20 nodes of two tiles (`h-m4_2`, `h-m4_3`) more than a re-import without it; only those nodes and the manifest's stops changed. A whole re-import would also bring the newer land rules into 35 more tiles and change the far land's sinks.

## The far land (realism round 1)

The photo match (round 1) found the game's skyline 4 to 8 degrees under the real one: the real skyline stands 9 to 13 km away (up to 49 km), and the world stopped at far.bin. `tools/world/farland.mjs` builds two more levels round far.bin, centred on it:

| Level | Cell | Reach | Vertices | File |
|---|---|---|---|---|
| 1 | 250 m | +-16 km | 129 x 129 | `far/l1.bin`, 99 862 B |
| 2 | 800 m | +-40 km | 101 x 101 | `far/l2.bin`, 61 222 B |

- **Heights.** swissALTI3D pooled to 50 m (`alti3d/far50`), Copernicus GLO-30 where swissALTI3D has no data (Italy, south and west). A vertex is the mean of its window raised halfway to the window's highest point: a plain mean shaves the peaks off the skyline.
- **Cover.** The shares of forest (open forest counts half), rock and scree, and glacier in each vertex's window, from swissTLM3D land cover rasterised at 50 m over the whole box, and the share swissTLM3D covers at all (0 outside Switzerland, where the runtime colours by height). `far/cover0.bin` holds the same shares for each far.bin vertex.
- **Horizon sinks.** `far/sink0.bin`: the metres each far.bin vertex is drawn under its height. The 100 m grid is bilinear and in a gully stood up to 64 m above the tiles (10% of tile vertices were over the old fixed 8 m), so it showed through them. Under the tiles each cell is sunk by the most it stands above the tile vertices in it, plus 3 m; elsewhere 8 m.
- **Size.** The far files are 199 KB; `world/` is 1.52 MB in 241 files (1.33 MB before), every file under 256 KB.
- **Runtime.** `FarLand` (js/world/horizon.js) leaves out each cell wholly inside the level within it and sinks the vertices inside that box (40 m, then 160 m), so a cell across the edge runs under the finer land: no seam and no two surfaces at one depth. The camera's far plane is 60 km in a world (`WorldEnvironment.FAR_PLANE_M`): depth steps go as d^2 / near and hardly change with the far plane. The far meshes drop d^2 (1 - 0.13) / 2R in the vertex shader (109 m at 40 km), as the photo match's real skyline does. The far land adds about 50 000 triangles; `Scenery.TRIANGLE_CAP` went from 200 000 to 140 000 to keep the window under 450 000.

### Copernicus GLO-30: licence

Checked 2026-11-17 against the licence text, "Licence for the use of the Copernicus WorldDEM-30" (the COP-DEM-GLO-30-F Global 30m Full, Free & Open instance), https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Data/DEM/resources/license/License-COPDEM-30.pdf:

- Art. 4 grants, free of charge, worldwide and without limit in time: reproduction, distribution, communication to the general public, and adaptation, modification and combination with other data.
- Art. 6 (b): adapted or modified data carry the notice "produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved".
- Art. 6 (c): a distribution adds "The organisations in charge of the Copernicus programme by law or by delegation do not incur any liability for any use of the Copernicus WorldDEM-30".
- Art. 6 (d): no impression of endorsement.

So the derived far land may ship. `manifest.notice` holds both sentences, and `manifest.credit` names swisstopo, Copernicus WorldDEM-30, DLR and Airbus. The importer adds the Copernicus parts only when a Copernicus height is used.

### Where the credit stands

swisstopo's terms of use for its free geodata (https://www.swisstopo.admin.ch/en/terms-of-use-free-geodata-and-geoservices, checked 2026-11-17): "A reference to the source is mandatory", and for digital or analogue representations, publications and dissemination one of the listed references ("©swisstopo" among them) "must be attached in any case". They say nothing of where. The Copernicus licence (Art. 6 (a), (b)) asks that the public is told the source with the notice, also with no placement. Neither asks for the credit on the map view itself, so it is not on screen during a ride: `js/world/credits.js` shows `manifest.credit` and `manifest.notice` in a Credits panel from the main menu and from the pause panel of a world ride, and `manifest.credit` on the world's loading screen. The `world-credit` probe fails when the credit is missing from any of the three, or on screen during the ride.

## Stations

A station is a timing line: a stage's start, its finish, and each checkpoint between them. A checkpoint is nothing else. The game takes the split there and builds a roadworks site that runs on from it (`js/world/roadworks.js`); a rider who crashes goes on from where the bike was, never from a station (`.agent/system/world.md`, "A restart is in place").

- **Where a checkpoint stands** (`placeStations`, `siteProblem`, `SITE` in `tools/world/stations.mjs`). A stage of length L has `round(L / spacing) - 1` targets, evenly spaced. For each target the importer takes the ride sample nearest it (the earlier on a tie) within its reach where a full roadworks site fits ahead. The reach is a quarter of the spacing, less where the gates of the stage lie closer (442 m on the Tremola stage), so two timing lines are never nearer than half the spacing.
- **A full site fits** where the next `SITE.lengthM` (100 m), with `marginM` (4 m) more at each end, is no tighter than `radiusM` (55 m), at least `widthM` (6.4 m) wide, off every tunnel, gallery and bridge, `junctionM` (30 m) from a ride junction, `placeM` (20 m) from a stopping place of the map, and ends `endM` (80 m) before the stage does. Each limit is a little inside the game's own (`Roadworks.CURVE_MAX`, `OPEN_MIN_M`, `JUNCTION_CLEAR_M`, `LENGTH_MIN_M`), so the site the game builds is never the bare gates. The line itself keeps 80 m from a junction and a structure, as before.
- **No bare gate.** A target with no fit within its reach has no checkpoint: the import logs it with the reason most of its reach has (`stats.droppedStations`), and stops when the gap that leaves is over twice the spacing.
- **The shipped stage** has 6 checkpoints where it had 12 (two of them the bare gates, in the stacked hairpins near the top): timing lines at s 2 132.3, 3 824.7, 5 725.3, 7 501.9, 9 216.5 and 11 477.2. The targets were 1 884, 3 768, 5 651, 7 535, 9 419 and 11 303.
- **What a new import of stations changes.** `manifest.json` (`stationSpacingM`, the stage's `gates` and `stations`, `stationCount`, the found places, which keep `PLACE.worksClearM` clear of the works that run on from each line as far as the game may build them: `siteReach`, and `dataHash`), `ride.json`, `SHA256SUMS`, and the stage's row in `functions/world-courses.json` (`gates`, `gateFloorsMs`, and `floorMs`, the sum of the link floors). Every other file is the same bytes (`tests/unit/world-checkpoints.test.js` holds this against the commit before).
- **The board keeps its id.** A row's key is `world-<stage>-v<version>` with the version from `tools/world/boards.json` (1 while that file does not exist): the gate count is in the row, not in the key. A change of split points bumps nothing. A world records no board time and stores no best time or splits yet (R6); when it does, a saved split table of another length is dropped on load (`RaceTiming.loadSplits`).
- `tests/unit/world-checkpoints.test.js` holds the rule, the shipped stations, the sites they get and the finish time of a scripted ride; `node tools/world/verify.mjs stations` re-runs the rule on the decoded ride.

## The floors and the rider's lean

A floor must be a time no honest ride beats. Two things made the old floors too high, and both are changed (2026-11-21):

- **The lean.** The floors were worked out at the bike's `leanCapDeg` (50 degrees). A rider's daring and the rider mode now raise the lean limit to 59.3 degrees at the most (`.agent/system/handling.md`, "The lean limit by the rider"), and the edge lean to 59.9 at the outside edge of a turn ("The edge lean" there; `tests/unit/world-edge-lean.test.js` fails when it passes the floors' lean). `floors.mjs` reads `WorldPhysics.floorLeanDeg` (60) from the text of `js/world/physics.js`. `tests/unit/tuning-defaults.test.js` fails when a rider and a mode together pass it.
- **A bend is a run that turns one way.** A bend is the samples of radius 200 m or less that turn the same way, joined over a gap of 40 m or less. The ideal rider is held to a bend's speed inside that bend only. Before, bends were joined whatever way they turned: the stacked hairpins of the fifth link (s 7 594 to 8 146) were one bend of 1 000 degrees, and the whole 552 m was held to the hairpin speed. A scripted ride of that link took 92.4 s against a floor of 104.3 s at the branch head, and 83.9 s with the owner's tuning in the defaults.

The floors of the shipped stage (ms), and a fast scripted ride of each link (the most daring rider in Track, every bend at 0.8 of its limit speed, from a flying start):

| Link | 1 | 2 | 3 | 4 | 5 | 6 | 7 | Sum |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| floor before | 39 592 | 29 977 | 44 887 | 46 027 | 104 308 | 83 985 | 23 327 | 372 103 |
| floor now | 29 222 | 21 738 | 28 260 | 25 487 | 37 028 | 46 842 | 19 738 | 208 315 |
| scripted ride | 58 133 | 52 567 | 64 783 | 59 983 | 83 917 | 122 217 | 50 300 | |

- The ride is 2.0 to 2.6 times its floor. The floor is loose because its rider brakes and accelerates without limit and has a grip of 1 on wet cobbles: it is a bound, not an estimate.
- The import wrote `functions/world-courses.json` and `tests/fixtures/world/mini/world-courses.json` only. Every file of `world/` and of the fixture is the same bytes, and a second import gives the same bytes again.
- No server code reads the floors yet (a world records no board time: R6).

## Binary format

All little-endian. `world/manifest.json` holds the indexes, `world/ride.json` the ride path, stages and stations.

- `graph/nodes.bin`: 16 B per node, id = record index: x, z, y Int32 mm, degree Uint8, flags Uint8 (1 junction, 2 on ride, 4 used twice), 2 B spare.
- `graph/edges.bin`: 24 B per edge: id, from, to, length (mm), first sample (global index) Uint32, sample count Uint16, road class Uint8 (index into `manifest.roadClasses`), flags Uint8 (1 on ride).
- `graph/e-<k>.bin`: edge samples, 16 B each: x, z, y Int32 mm, heading Int16 (1e-4 rad, 0 = +z, `atan2(dx, dz)`), width Uint8 (0.1 m), flags Uint8 (1 tunnel, 2 bridge, 4 gallery, 8 cobbles).
- **An edge chunk is bounded by spatial extent, not by bytes.** A chunk is a run of the global sample sequence (edges in id order) of at most 256 samples whose bounding box is at most 640 m across. The manifest lists each chunk's `file`, `first`, `count` and `bbox`. An edge can span several chunks.
- **The ride layer loads whole before GO.** `ride.json` plus the chunks of the ride's edges (about 55 000 samples, 0.9 MB for the whole ride). Only side edges, tiles, cover and meshes stream.
- `height/h-<tx>_<tz>.bin` (negative index written `m<n>`): Float32 base, 65 x 65 Int16 (0.1 m over the base), 65 x 65 Uint8 zone (0 terrain, 1 road, 2 bench, 3 wall, 4 drop, 5 water). 12 679 B.
- `cover/c-<tx>_<tz>.bin`: 32 x 32 Uint8 (1 forest, 2 open forest, 3 rock, 4 scree, 5 grass, 6 glacier, 7 water, 8 settlement). 1 KB.
- `far.bin`: Int32 x0 mm, z0 mm, Uint16 nx, nz, cell (m), 2 B spare, then Int16 metres, -32768 for no data.
- `far/l<k>.bin`: far.bin's 16 B header, Int16 metres, then 4 Uint8 per vertex (forest, rock, ice, known shares, 0 to 255). `manifest.farLevels` lists them.
- `far/cover0.bin`: 4 Uint8 shares per far.bin vertex. `far/sink0.bin`: Uint8 metres per far.bin vertex.
- `buildings.bin`: 16 B each: x, z Int32 mm, w, d Uint16 (0.1 m), heading Int16 (1e-4 rad), h Uint8 (0.5 m), kind Uint8 (1 house, 2 chapel, 3 shed, 4 wall).
- `manifest.json` `places`: the stopping places beside the ride, in order ("Stopping places" above). No file of their own.
- `SHA256SUMS`: `shasum -a 256 -c` form, every other file. `manifest.dataHash` is the sha256 of the sorted `hash  path` lines of every file except `manifest.json` and `SHA256SUMS` (the manifest cannot hold its own hash).
- Local metres: x = E - 2 688 000, z = -(N - 1 165 000), y = height. Origin in `manifest.origin`.
- Size budget: `world/` 28 MB or less, any file 256 KB or less except `far.bin` (2 MB or less), the Tremola slice 3.5 MB or less (`verify.mjs size`). No `.gpkg`, `.tif`, `.tiff` or `.zip` is committed.

## Runtime (js/world/, W3)

The plain page's menu rides the world: choosing a rider starts `RideMode.DEFAULT_WORLD` (`tremola`), and CLASSIC LEGS opens the leg screen. `?world=<stage|all>` (`tremola` is the only stage until W5) starts a streamed world without the menu, and `?legs` keeps the old menu. `js/ridemode.js` is the only reader of `?world`; everything else keys off `environment.isWorld`. `?worldData=<path>` reads the data from another folder, for tests only: the path must be relative and under `world/` or `tests/fixtures/world/` (no scheme, `//`, `..` or backslash), and a world read from anywhere else, or whose `manifest.json` is not the one `world/SHA256SUMS` lists, is not trusted: `environment.submitAllowed` is false and no board may take its times.

| Module | What it does |
|---|---|
| `data.js` | Fetch and decode. The ride layer (manifest, ride, graph tables, the ride's edge chunks) loads before the first frame. Tiles, cover and side chunks load on demand into LRU maps. `dipRoadSides` holds the land beside the carved road under the road, and a carved node of a stacked leg under the leg below it. |
| `graph.js`, `worldroute.js` | The graph in memory and the route contract over the ride. Units of the legacy consumers are samples, not 20 m segments. `project` is the continuity search (60 m window, 64 m hash for the cold lookup). |
| `worldground.js` | Ground: road band = route height; tunnel = route height; side road = its own samples; elsewhere the tile on the same triangles the mesh draws, then `far.bin`, then the route. The zone is the tile's zone layer, and within `WORKS_REACH_M` of the carriageway the ride's works (tunnel rock, parapets, retaining walls). |
| `streamer.js` | Tiles are reference counted by the bike (900 m) and by the ride window (600 m of [s-1 km, s+3 km]); disposed 3 s after the count is 0. Road sections and side chunks are resident by window or by place. Builds go through a 4 ms queue, nearest first. |

**Builds in steps.** Every build the streamer takes is in steps: a road section, a tile's land, a tile's scenery, a side road's chunk, the land's cut to the walls and the far grid's cut to the tubes. A step is a few milliseconds of the build, and the streamer takes steps within its 4 ms budget a frame over as many frames as the build needs (`WorldStreamer.pump`). No other task runs until that build is done. A build is a generator (`buildRoadSteps`, `buildScenerySteps`, `buildTileSteps`, `buildSideSteps`, `clipHorizonSteps`, and under them `RoadMesh.sectionSteps`, `edgeWorksSteps`, `wallPlanSteps`, `Scenery.buildTileSteps`, `stoneSitesSteps`, `TerrainMesh.buildSteps`, `cutsSteps`, `laidBackSteps`, `tubeClipSteps`, `holdSideSteps`, `RoadMesh.sideStructuresSteps`, `Scenery.rankCapsSteps`, `drawHousesSteps`). The whole build of the same code is `WorldStreamer.drain` of it, so a caller that needs a build at once gets the same result (`buildRoad`, `buildScenery`, `buildTile`, `buildSide`, `rideWalls`, `cutsOf`, `clipHorizon`).

- **Why.** Before, one build was one step. A road section with walls took up to 52 ms, a tile's marker stones 58 ms, a tile's tufts 46 ms, a tile's land 32 ms, a side road's chunk 29 ms and the far grid's cut 37 ms (the browser's `world-steps`). The streamer's budget could not stop inside one, so the frame took that long.
- **A row's junction gores are all read before the rows are** (`goreRowsKept`): a side road's chunk that arrived between two steps let them go, and a row read whole then took 20 ms.
- **The caches a build reads are made ahead, in steps.** Most of a build's time was in data it made on first read: the wall plans of the sections near it (`rideWalls`), each row's junction gore and mouth cut (`goreRow`, `mouthCut`) and the land's cut to the walls of each tile under it (`cutsOf`). A build now makes them first, each in steps (`wallPlansNear`, `goreRowsSteps`, `cutsNear`). A reader that needs one of them while it is under way makes it whole, and that one is kept.
- **The old mesh stays drawn** until the new one replaces it, so a build in steps leaves no hole. A side road's chunk is made in steps while its old roads stay drawn and ridden; the old ones are let go and the new ones put in their place in the last step, so the physics never meets the chunk without its roads.
- **The result is the same.** `tests/unit/world-build-steps.test.js` builds every section near the bike at both levels of detail, every tile's land and scenery, the marker stones on and off, the side roads' chunks and the far grid's cut, whole and one step at a time, at five places on each world. The meshes are the same to the last bit, with the same counts.
- **The measure.** `node tools/terrain-check.mjs world-steps --world <id> --gpu` streams the whole stage a metre a frame and times every step of every task with its parts (`--parts deep` times the calls inside too, slowly). It fails on any step over 16 ms. Most steps take under 10 ms; a tile's scenery takes up to about 15 ms.

| Step (the browser, the most in a ride) | Tremola before | Tremola after | Gotthard leg before | Gotthard leg after |
|---|---|---|---|---|
| Road section | 51.5 ms | 9.1 ms | 33.7 ms | 6.8 ms |
| A tile's scenery | 58.3 ms | 15.7 ms | 31 ms | 15.2 ms |
| A tile's land | 31.5 ms | 9.9 ms | 15.7 ms | 8.6 ms |
| A side road's chunk | 14.5 ms | 9.9 ms | 20.3 ms | 8.2 ms |
| The far grid's cut (`tube:horizon`) | 23.5 ms | 7 ms | 37.8 ms | 8.7 ms |
| The window's caps (`caps:window`) | 110 ms (in a frame) | 7.3 ms | | 5.3 ms |

(The runs drift by a few milliseconds from one to the next on the same machine.)

**The window's caps are chosen over the window.** The houses, the boulders and the tufts have caps over the whole window (`BUILDING_CAP`, `HOUSE_TRIANGLES`, `BOULDER_CAP`, `TUFT_CAP`). Before, each tile took the room the tiles built before it had left, nearest the bike at the time it was built, so the window held other houses, boulders and tufts by the order its tiles came in. Now a tile keeps every place a house, a boulder or a tuft may stand, and `Scenery.rankCaps` chooses over all of the window's tiles, nearest the middle of the bike's 8 m square first, when the tiles change and when the bike enters another square (as the trees are: `rankTrees`, which reads the same square). The scenery of the tiles near a side road's chunk, a tube or a cut of the land is made again when that changes (`restandScenery`): it keeps clear of the side roads drawn and stands on the land as cut, so what a tile holds does not hang on whether its side roads came before it. `tests/unit/world-build-steps.test.js` rides 2.4 km of each world with the builds whole and in steps, and the window holds the same sections, side roads, tiles, houses, boulders, tufts and trees at every 600 m.

- **The choice is a task in steps** (`caps:window`, `Scenery.rankCapsSteps`), queued when the bike enters another square or the tiles change. Made at once on the frame of the new square, it took up to 110 ms.
- **The houses and the boulders are drawn over the window**: one instanced mesh for each part of each house model, one mesh of the houses' footings and one mesh for each boulder shape (`Scenery.houseGroup`, `boulderGroup`; `drawHouses`, `drawBoulders`). Shared over the window, a mesh of each for each tile put the Tremola over its meshes' margin (`world-budget`). A tile keeps the walls of its houses drawn, which the bike cannot ride through (`houseAt`).
- **The houses' share is 77 000 triangles** (`HOUSE_TRIANGLES`, was 80 000). Chosen nearest first over the window, the houses fill their share to the last house; chosen by the tiles' order they left about 3 000 of it unspent, which the far trees took. At the Tremola's km 5 and the Gotthard leg's km 3 the window drew no house at all, as the houses in reach stood on tiles built while the bike was out of reach of them: it now draws them, with about 600 trees where it drew 900 (`tests/unit/world-tree-count.test.js`).
- **The window's room.** The whole window keeps under `Scenery.WINDOW_TRIANGLES` (436 000, 3% under `LEG_BUDGET`'s 450 000) on every world, by rule and with no number for each leg. Once a second `Game.budgetWindow` counts what the scene draws besides the houses, the boulders and the trees (the land, the far land, the roads and their works, the side roads, the places, the riders), as `world-budget` counts it. The room left (`Scenery.setWindowRoom`) goes first to the trees: they keep `TREE_ROOM` (50 000, what they drew before). The houses take the rest up to `HOUSE_TRIANGLES`, the nearest first, so where room is short the furthest houses go first, down to `HOUSE_FLOOR` (32 000). Only below that do the furthest trees give way. Less room is taken at once; more room only from `WINDOW_ROOM_RISE` (6 000), so the window does not hunt while an old mesh stands beside its new one. The held shot keeps its own raise (`setShot`).
  - Why the houses: with the models pass's `TRIANGLE_CAP` of 127 000 the Tremola stood at 459 000 at km 2 and the Gotthard leg at 451 000. There the land, the far land and the roads are about 330 000 and fixed, the trees about 50 000 and held by `world-tree-count`, and the houses about 75 000. The houses are 4 000 to 5 000 triangles each, and the furthest of them, 300 to 450 m away, show least of the models pass's detail.
  - Result (`world-window`, the ride's rows): the most on every stage is 426 000 to 436 000 (the Tremola's was 459 400, the Gotthard leg's 451 400), with as many trees as before or more at the stations of `world-tree-count`; the Tremola's houses at km 2 are 52 500 (were 74 800). The window probes measure the room as the ride does before they count (`placeAt`).
  - Not held by it: a stop's held shot, which raises the land's detail (`raise`). Past the finish of `hospental-summit` it draws 485 600 and of `goeschenen-susten` 526 800, nearly all of it land (239 000 and 317 000).
- **Every model is drawn once at load** (`Game.prewarmWorldScenery`, `Scenery.warmGroup`): each house model, the plain hut and wall, each boulder shape and a tuft, in the world's group, with its haze and with the headlight both on and off. A model first put in view by the caps compiled its program in that frame (110 to 260 ms).

**Tile data that stops coming during a ride** (a failed fetch, a server gone, a network that drops). One rule for every world:

- The streamer asks for a failed tile again after 1, 2, 4, 6 and 7 s of ride time (`WorldStreamer.FETCH_RETRY_MS`, about 20 s). Then the tile is lost. A tile lost while it was far gets a new round of tries when it comes within 300 m of the bike.
- `WorldStreamer.landState` reports three states. `missing`: a tile within 300 m of the bike has no data after a failed fetch, or after 1.5 s of waiting. `under`: the bike's own tile has no data. `lost`: a near tile failed every try.
- `Game.watchLand` reads that state once a frame. While land is missing, the call-out "Land is still loading" stays up. The far land and the road over it stay drawn as they are. While the bike's own tile is missing, the game holds the bike where it stands: speed 0, the same position. Thus it never rides onto the far grid, which the land can come back above.
- Lost land ends the ride the way a world that cannot load at the start does. The classic legs open with `RideMode.LAND_LOST_NOTE`. A paused ride would wait on a server that is gone.
- `tests/unit/world-tile-retry.test.js` holds the retry and the note. `node tools/terrain-check.mjs world-toggle-ride --world tremola --gpu --every 0 --drop-after 1500 [--restore-ms 5000]` rides it on the slice. With `--restore-ms`, the land comes back and no note stays. Without it, the ride ends with the legs open.
| `landshade.js` | The land's palette (sRGB, measured against the photos) and the material patch every land and road material takes: the haze, one aerial perspective for everything a world draws (`LandShade.HAZE`: toward the air's blue with distance, `LandShade.haze` for a material that is not land), before the scene fog, the curvature drop on far meshes, world-space detail noise near the camera, and the sky's fill held to 0.8 so the shade side of a valley is dark. Distances come from `vViewPosition`: three r150 does not upload `cameraPosition` to a Lambert material. |
| `roadmesh.js`, `terrainmesh.js`, `horizon.js`, `scenery.js` | The meshes. Carved ground is drawn 0.12 m under the physics height so the ribbon wins. Each drawn road edge has edge works (`RoadMesh.edgeWorks`, `WorldEnvironment.edgeFoot`): an apron at 1:1.5 down to land a coarser tile draws lower, a dry-stone retaining wall at a `drop` node and over a lower road's band (down to that road; no deck: a road over a road off a bridge is not in the map), with a stone parapet where it drops 2.5 m or more (`RoadMesh.PARAPET_DROP_M`, the physics' `dropDepthM`); never a bare vertical face. The stone courses are drawn in the shader (`LandShade` `stone`, `RoadMesh.stoneMaterial`, works group 2). To the physics the parapet is solid (`WorldGround.onRetainingWall`: a bounce at its inner face, not a fall), the verge before it is at the road's height, and a drop past a bench or open ground stays a fall. The horizon is drawn under the tiles by its per-vertex sink (`far/sink0.bin`, 8 m where no tile stands). Trees, houses and boulders are instanced and capped by triangles (140 000) as well as by count. A tree or bush takes the world's palette, not its file's colours, and is lit as the land, with no sky reflection (`Vegetation`, js/world/vegetation.js; checked by `tests/unit/world-vegetation.test.js` and the `world-trees` probe). The legs keep the files' colours. Forest beyond LOD0 is crown clumps (five-sided, canopy normals) in the tile's own geometry. A tile is coloured by cover class, slope, facing and height; a carved road or bench cell is a worn verge. `WorldEnvironment.onMeshBuilt` decodes each new mesh's colours at once (the periodic scan runs every 1.5 s, and a tile drawn before it was pale lime); anything added under the world later, by any code, is dressed the same way before its first draw (`Graphics.dressAdded`, `.agent/system/rendering.md`). |
| `environment.js`, `guide.js` | `WorldEnvironment` is what `Game.environment` holds; `WorldGuide` is the minimap, the turn prompt and the off-route rule. |

Probes: `node tools/terrain-check.mjs world-window,world-budget,world-ground,world-junction,world-wrongway,world-credit,world-net,world-finish --world tremola` (see the header of `tools/terrain-check.mjs`).

## Checks added after review (`node tools/world/verify.mjs <check> --stages tremola`)

- **`crests` (P39).** The lift-off speed sqrt(g / kappa) at each convex sample of the ride, kappa over a +-4 m window of the profile. The world has no airborne state, so the smallest must be 35 m/s or more. The importer eases a crest sharper than 36 m/s over the ride as one line (`limitRideCrests` in `profile.mjs`; the sharpest crest of the slice sat at the join of two edges, s 12 578). The slice's smallest is 35.9 m/s. The check reports the 5 lowest crests.
- **`stations` (P36).** Spacing, stage boundaries as stations, the placement rule re-run on the decoded ride, no gate within 80 m of a junction or a structure (a failure), and every gate whose smallest radius within 50 m is under 60 m listed in `tightBend` (reported, not a failure: the window reaches behind the timing line, where a site may begin just out of a hairpin, as the stations at s 5 725.3, 9 216.5 and 11 477.2 do).
- **`graph` (P22).** The graph holds every source edge in the corridor: 588 for the Tremola slice, the number `inspect.mjs --stages tremola` gives, less 2 stubs under 1 m the importer drops (587 edges in the files). `corridorEdges` of `inspect.mjs` for `--stages all` (5 445) is the whole ride's corridor, not the slice's.

## Floating roads (checks)

- **`floating`.** At every ride and side-edge sample outside structures: the land at the carriageway edge, the verge and just past it lies at most 0.3 m under the road and 0.1 m over it; across the carriageway at most 0.05 m over it (0.1 m storage); within 4 m of the verge no steeper than 1:1.5. Exceptions are counted and listed: `joined` (a junction), `walled` and `walls` (a retaining wall between two roads at two heights, listed as runs of s), `bend` (a hairpin apex, the grade over one 8 m triangle).
- **`overlap`.** No two drawn bands overlap outside a junction unless the ride is already at its narrowest and the two lie at two heights (`stacked`, drawn as a retaining wall); width steps at most 0.5 m a sample; the narrowest ride width and where.
- **`world-floating`** (tools/terrain-check.mjs): the drawn land and edge works under every drawn edge at the LOD drawn from places every 500 m, land or far land within 4 m over the road, the physics ground against the drawn ground, and named views (100, 1300, 3600, 7800, 7900, 7990, 9500, 10900) for road undersides and dark seams along the verge.

## Review decisions

- `js/world/gates.js` (instanced station banners within 1.5 km, streamed through the queue) is **deferred to W5**. Until then `WorldEnvironment.buildFixtures` draws the frame of every station of the stage once (14 for the slice), which is cheap at this size. It needs an obligation when W5 starts: the banners of a full ride must not be resident beyond 1.5 km.
- The proof artefacts that exist as probes are `world-camera` and `world-hud` (new), `world-restart`, `world-cut`, `world-finish`, `world-budget`. Folded: the run-session cases live in `tests/unit/restart.test.js` and `tests/unit/world-run.test.js`, the stage cases in `world-run.test.js`. Not built, still owed before W5: `world-stream`, `world-atmo`, `world-physics`, `world-looks.test.js`, `world-floors.test.js`, `leg-payload-contract.test.js`.
- The `roadPath` grep gate (W-P6c) allowlists `js/world/legroute.js`, `js/environment.js`, `js/sceneassets.js`, `tools/terrain-check.mjs`, `tools/village-shots.mjs` and now `tools/world/capture-baseline.mjs`, which reads `roadPath` of the a9e8add tree on purpose.
- `functions/world-courses.json` is not read by the server until the world boards (R6). The world records no board time before then: `restartLeaderboardSession` only cancels in a world, and `finishRun` skips the board.
- The committed `world/**/*.bin` files are binary on purpose (Pages-hosted, 1.3 MB).
