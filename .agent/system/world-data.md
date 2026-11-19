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

`node tools/world/import.mjs --stages tremola` reads the cache and writes `world/` and `functions/world-courses.json`. `--synthetic` writes the mini fixture to `tests/fixtures/world/mini` (3 stages of 2 km, station spacing 500 m, a 20 degree kink at R = 20 m, a 180 degree hairpin at R = 10 m, a stacked pair of hairpins with legs 25 m apart, a tunnel and a four-way junction). The same cache gives the same bytes: no clock, no random, sorted iteration, and no search (the floors are closed-form). `--cache` inside the repo is refused.

| File | Job |
|---|---|
| `import.mjs` | The pipeline and the command line. `loadTlmSource` is the real source, `synthetic.mjs` the made-up one. Both give `buildWorld` the same shape. |
| `graph.mjs` | The corridor graph: every kept road within 1 km of the ride, and the ride as `[{edgeId, dir}]`. A gap stops the import (exit 4). A side road is cut to the corridor. |
| `resample.mjs` | The ride is resampled as one line and cut at the graph nodes (a bend that runs across a node is not broken by it). A pure-pursuit rider follows the mapped line at 1 m steps with the turn rate capped at 1/R_MIN. `R_MIN` is 10 m, read from `js/world/physics.js` (`rMin`) once that file exists. After each ride the legs are compared with the map: where a leg comes more than 1.5 m nearer another leg than the map has them (legs within 15 m), the tightened bends within 50 m are held to `R_HAIRPIN` (6 m, `rHairpin`) with a 5 m carrot, and the line is ridden again (stacked hairpins, below). |
| `profile.mjs`, `dem.mjs` | Height from the TLM Z, smoothed over 40 m (Savitzky-Golay), node heights reconciled over 20 m, then checked against the 2 m DEM. |
| `bench.mjs` | 512 m tiles at 8 m. Every node of a triangle that reaches into a road's drawn strip (the ribbon, the 1.1 m verge, 0.5 m) takes that road's height, so the land meets the drawn edge; a node two strips claim keeps the lower road (no land over any road), and the ride keeps its own carriageway and verge at a junction. Round a tight bend the nodes are lowered until no point of the road lies under its land, then raised where room allows. The land within two cells of the strips keeps a 1:1.5 batter (embankment or cut); where two legs are too close, a `drop` node (beyond the upper road's strip) marks the upper road's retaining wall. |
| `widths.mjs` | The ride narrows from 10 m toward its class width (never under 7 m) where another piece of road comes within its drawn band, and in a held hairpin (radius under 0.95 R_MIN) so its inner edge stays 5 m from the bend's centre where 7 m allows, tapered at 0.1 m a metre. |
| `junctions.mjs` | Passes, stubs (60 m) and barrier poses, one set per pass. A barrier follows its side road on through nodes of degree 2 and stands 8 m short of the next junction (half way along a shorter edge), never on another junction. |
| `landcover.mjs`, `buildings.mjs`, `landmarks.json`, `structures.json` | Cover at 16 m, oriented boxes, hand-placed landmarks, hand-marked cobbles. `clearOfRoads` keeps every building 3 m (`ROAD_CLEAR_M`) clear of the band of every road, ride and side edge: the game road is wider than the mapped one, so a box over a band moves square off the road by up to 4 m, or is left out. `verify.mjs buildings` checks the committed data. Water is painted where it is, not past it: `TerrainMesh.colours` colours the node on a cell's north-west corner from the cell and fades it out 16 m away, so a cell is water only when the square 8 m round that corner lies in a lake (`WATER_REACH_M`, sampled every 4 m). The half tint falls on the mapped shore or inside it, a faint tint reaches at most 8 m past it, and a pond under about 16 m across is drawn as land. Before, the 16 m cells (sampled at their middles, drawn from their corners) put water up to 16 m past the shore, over two mapped buildings. `verify.mjs water` fails on a building footprint over drawn water. |
| `stations.mjs`, `floors.mjs` | The station rule (R3) and the per-link time floors. The floor is 0.9 times the time of an ideal rider on the inner edge of each bend at top speed, held only by the lean angle (closed-form, no search, so there is nothing to hang or to differ between runs). |
| `encode.mjs` | The format below, `SHA256SUMS`, `functions/world-courses.json`. `decodeWorld` reads it back. |
| `verify.mjs` | `fidelity`, `hairpins`, `elevation`, `size`, `graph`, `stacked`, `stations`, `crests`, `buildings`, `water`, `floating`, `overlap`, or `all`. |

### Tremola slice, as committed

The slice rides **uphill from Airolo to the Gotthard summit** (route.json `slices.tremola`, waypoints 9, 8, 7, 6), the opposite way to D1, because that is how it is played for the play-test (P5: start 1 180 m, summit 2 107 m). It is 13.2 km (13 187 m, 68 m shorter than with every hairpin at R_MIN) with 13 gates and 31 hairpins, none tighter than R = 10 m except 7 stacked hairpins held at R = 6.05 m or more. DEM deviation outside structures is 0.49 m at p99. The data is 1.33 MB in 237 files.

- **Fillets widen hairpins.** Where the mapped bend is tighter than R_MIN the ride takes an R_MIN arc and rejoins the mapped line. The fillet spans are the places where the ride sits more than 1 m from the map; `verify.mjs fidelity` lists them and fails on a span with no tightened bend near it. Outside them the ride is within 1.2 m of the map. The ride is 0.08% longer than the mapped line.
- **Stacked hairpins keep their real footprint.** On a ladder whose legs are mapped 8 to 12 m apart a 10 m arc cannot turn between two legs: it ran wide and carried the next leg onto the one beyond (ride legs 2.83 m apart at s 7898/8010 and 3.55 m at 7970/8133, 4.2 m at 10858/10938, where swissTLM3D has them 11.4, 10.9 and 10.9 m apart). Those hairpins are held to R_HAIRPIN (6 m) instead, so no two legs are more than 1.5 m nearer each other than the map has them; `verify.mjs fidelity` fails on a squeezed leg (`squeezedLegs`), and `hairpins` allows a radius under R_MIN only inside a hairpin and never under R_HAIRPIN. The nearest two legs are now 8.36 m apart (mapped 8.1 to 8.6 m there); the bike rides them on the assist's speed advice (about 6 m/s at 35 degrees).
- **Nodes move.** A node that the ride uses moves onto the resampled ride line (by a metre or two). Side edges that end there follow it.
- **An edge that the ride uses twice** (Schöllenen, Andermatt-Hospental, W5) keeps the samples of its first use. The second use is the same samples read the other way, so the bend across its joins is not smoothed for that use.
- **Cobbles.** TLM gives every road `Hart`, so the cobbled Via Tremola is marked by hand in `structures.json` (4 km of the slice).
- **`far.bin`** covers the corridor tiles plus 1.5 km. The land beyond it, out to 40 km, is the far land (below).
- **Landmarks** are anchored at the pass waypoints (`landmarks.json` lv95). Only the Gotthard Hospiz is in the slice. At runtime `Scenery.landmarkPlace` tries places beside the ride up to 150 m either way of the landmark's s and 80 m out, turned to face the ride, and takes the one nearest the anchor whose whole plan box keeps 3 m off every road band and stands on no drawn water (`Scenery.wetUnder`). It used to take the first place clear of the roads on the left: at the summit that was Lago di San Carlo, so the Hospiz stood wholly in the lake, and the land under it was never read (its tiles were not resident when it was built; `Scenery.fixtureTiles` now loads them first). swissTLM3D 2026-02 has no footprint for the Hospiz, so the anchor stays the pass point. The game's road (10 m and the verge) leaves about 5 m between its band and the lake shore there. Of the places clear and dry it takes the nearest whose land rises no more than 1.5 m under its walls (`LANDMARK_RISE_M`), else the one that rises least: the Hospiz stands beside the ride at s 13132, 38 m north of it, on land that rises 1.4 m under it, its floor 0.5 m over the mean land there and 0.45 m over the road.
- **Buildings meet the land** (`Scenery.footing`): a house's or landmark's floor (its model's y 0) stands 0.1 m under the highest drawn land under its walls, so no door is sunk, and a stone footing runs from 0.3 m under the lowest land up into the walls, so no corner floats. The walls are the model's `wall` parts, or its plan box 0.8 m in from each side. The footings of a tile are one mesh in the world's metres, in the retaining walls' dry-stone material (`Scenery.footingMesh`), built from exactly the houses drawn. A footprint too small for a modelled house is a hut (timber walls, slate roof, `Scenery.hutParts`), and a big mapped wall a block of stone; the plain beige box is gone. A house whose land rises more than 4.5 m under its walls (`FOOTING_MAX_M`: a plot on a road's cut or fill) is left out: 10 of the 72 houses the ride draws, all at Airolo. A house was set 0.3 m under the lowest of five points a half-diagonal out from its middle, on the axes, not its own corners: on Airolo's slopes every house's uphill side was sunk, up to 11 m. A house whose mapped footprint stands on drawn water is left out. `tests/unit/world-footing.test.js` rides the slice and fails on a house or landmark over drawn water, a corner of its foot more than 0.3 m over the land, or its floor more than 0.3 m under it.
- **Station spacing** is 1 000 m for the real ride and 500 m for the mini fixture.

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
- `SHA256SUMS`: `shasum -a 256 -c` form, every other file. `manifest.dataHash` is the sha256 of the sorted `hash  path` lines of every file except `manifest.json` and `SHA256SUMS` (the manifest cannot hold its own hash).
- Local metres: x = E - 2 688 000, z = -(N - 1 165 000), y = height. Origin in `manifest.origin`.
- Size budget: `world/` 28 MB or less, any file 256 KB or less except `far.bin` (2 MB or less), the Tremola slice 3.5 MB or less (`verify.mjs size`). No `.gpkg`, `.tif`, `.tiff` or `.zip` is committed.

## Runtime (js/world/, W3)

The plain page's menu rides the world: choosing a rider starts `RideMode.DEFAULT_WORLD` (`tremola`), and CLASSIC LEGS opens the leg screen. `?world=<stage|all>` (`tremola` is the only stage until W5) starts a streamed world without the menu, and `?legs` keeps the old menu. `js/ridemode.js` is the only reader of `?world`; everything else keys off `environment.isWorld`. `?worldData=<path>` reads the data from another folder, for tests only: the path must be relative and under `world/` or `tests/fixtures/world/` (no scheme, `//`, `..` or backslash), and a world read from anywhere else, or whose `manifest.json` is not the one `world/SHA256SUMS` lists, is not trusted: `environment.submitAllowed` is false and no board may take its times.

| Module | What it does |
|---|---|
| `data.js` | Fetch and decode. The ride layer (manifest, ride, graph tables, the ride's edge chunks) loads before the first frame. Tiles, cover and side chunks load on demand into LRU maps. `dipRoadSides` holds the land beside the carved road under the road, and a carved node of a stacked leg under the leg below it. |
| `graph.js`, `worldroute.js` | The graph in memory and the route contract over the ride. Units of the legacy consumers are samples, not 20 m segments. `project` is the continuity search (60 m window, 64 m hash for the cold lookup). |
| `worldground.js` | Ground: road band = route height; tunnel = route height; side road = its own samples; elsewhere the tile on the same triangles the mesh draws, then `far.bin`, then the route. The zone is the tile's zone layer; an active barrier box is `wall`. |
| `streamer.js` | Tiles are reference counted by the bike (900 m) and by the ride window (600 m of [s-1 km, s+3 km]); disposed 3 s after the count is 0. Road sections and side chunks are resident by window or by place. Builds go through a 4 ms queue, nearest first. |
| `landshade.js` | The land's palette (sRGB, measured against the photos) and the material patch every land and road material takes: the haze, one aerial perspective for everything a world draws (`LandShade.HAZE`: toward the air's blue with distance, `LandShade.haze` for a material that is not land), before the scene fog, the curvature drop on far meshes, world-space detail noise near the camera, and the sky's fill held to 0.8 so the shade side of a valley is dark. Distances come from `vViewPosition`: three r150 does not upload `cameraPosition` to a Lambert material. |
| `roadmesh.js`, `terrainmesh.js`, `horizon.js`, `scenery.js` | The meshes. Carved ground is drawn 0.12 m under the physics height so the ribbon wins. Each drawn road edge has edge works (`RoadMesh.edgeWorks`, `WorldEnvironment.edgeFoot`): an apron at 1:1.5 down to land a coarser tile draws lower, a dry-stone retaining wall at a `drop` node and over a lower road's band (down to that road; no deck: a road over a road off a bridge is not in the map), with a stone parapet where it drops 2.5 m or more (`RoadMesh.PARAPET_DROP_M`, the physics' `dropDepthM`); never a bare vertical face. The stone courses are drawn in the shader (`LandShade` `stone`, `RoadMesh.stoneMaterial`, works group 2). To the physics the parapet is solid (`WorldGround.onRetainingWall`: a bounce at its inner face, not a fall), the verge before it is at the road's height, and a drop past a bench or open ground stays a fall. The horizon is drawn under the tiles by its per-vertex sink (`far/sink0.bin`, 8 m where no tile stands). Trees, houses and boulders are instanced and capped by triangles (140 000) as well as by count. A tree or bush takes the world's palette, not its file's colours, and is lit as the land, with no sky reflection (`Vegetation`, js/world/vegetation.js; checked by `tests/unit/world-vegetation.test.js` and the `world-trees` probe). The legs keep the files' colours. Forest beyond LOD0 is crown clumps (five-sided, canopy normals) in the tile's own geometry. A tile is coloured by cover class, slope, facing and height; a carved road or bench cell is a worn verge. `WorldEnvironment.onMeshBuilt` decodes each new mesh's colours at once (the periodic scan runs every 1.5 s, and a tile drawn before it was pale lime). |
| `environment.js`, `guide.js` | `WorldEnvironment` is what `Game.environment` holds; `WorldGuide` is the minimap, the turn prompt and the off-route rule. |

Probes: `node tools/terrain-check.mjs world-window,world-budget,world-ground,world-junction,world-wrongway,world-credit,world-net,world-finish --world tremola` (see the header of `tools/terrain-check.mjs`).

## Checks added after review (`node tools/world/verify.mjs <check> --stages tremola`)

- **`crests` (P39).** The lift-off speed sqrt(g / kappa) at each convex sample of the ride, kappa over a +-4 m window of the profile. The world has no airborne state, so the smallest must be 35 m/s or more. The importer eases a crest sharper than 36 m/s over the ride as one line (`limitRideCrests` in `profile.mjs`; the sharpest crest of the slice sat at the join of two edges, s 12 578). The slice's smallest is 35.9 m/s. The check reports the 5 lowest crests.
- **`stations` (P36).** Spacing, stage boundaries as stations, the placement rule re-run on the decoded ride, no gate within 80 m of a junction or a structure (a failure), and every gate whose smallest radius within 50 m is under 60 m listed in `tightBend` (reported, not a failure: station 11 at s 11 434.3 has 20.9 m, the best place in its window).
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
