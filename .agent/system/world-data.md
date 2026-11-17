# World data

The W0 data gate for the Andermatt world. The tools are in `tools/world/`. The values below come from a real run of `node tools/world/inspect.mjs` on swissTLM3D release 2026-02 (`SWISSTLM3D_2026_LV95_LN02.gpkg`, 10.8 GB unzipped). Run it again after a new release and compare.

## Tools

| File | Job |
|---|---|
| `cache.mjs` | Resolves the cache (`$TWISTY_WORLD_CACHE`, else `~/Library/Caches/twisty-world`) and refuses a path inside the repo, also through a symlink. `node tools/world/cache.mjs tlm` downloads the 4 795 840 706 byte zip with HTTP Range resume, checks the content-length, then unzips with `unzip` (macOS `ditto` fails on this archive). `node tools/world/cache.mjs alti3d <west> <south> <east> <north>` (WGS84) walks the swissALTI3D STAC items, follows `rel=next`, keeps the newest year of each tile, and downloads the 2 m COG tiles into `alti3d/2m/`. |
| `gpkg.mjs` | GeoPackage reader on `node:sqlite`. It parses the GPKG header and WKB (Point to MultiPolygon, 2D, Z, ZM, both byte orders) and queries a bbox through the `rtree_<table>_<geom>` index. A table without an R-tree throws. |
| `inspect.mjs` | Prints the gate report as JSON. Exit code 4 when a waypoint pair has no connecting road. |
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

Every pair has `gap: 0`. The shortest path weights the road class, prefers `Durchgangsstrasse`, and charges 25 times for a motorway, so it follows the pass roads. Three waypoints snap more than 50 m from the hand-placed point (Altdorf 56 m, Hospental 61 m, Gletsch 38 m): they snap to the through road, which is the intent.

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

GitHub Pages builds `main` with the legacy Jekyll builder (checked at plan time). `.nojekyll` at the repo root stops the Jekyll build from filtering about 1 500 binary files. **Not verified:** how Pages serves a `.bin` (content-type, gzip, status). P-H1 checks it on the live site after the first merge that puts `world/` on `main`. World mode stays behind `?world=` until then.

## Binary format

This is the format of W2, with the two changes that the plan review made.

- `world/manifest.json`: format version, source release ids, origin E0 and N0, the credit `© swisstopo`, kept road classes, stage table, stations, tile index, edge chunk index, junction index, structures, landmarks.
- `world/graph/nodes.bin` (16 B per node), `world/graph/edges.bin`, `world/graph/e-<k>.bin` (edge samples, 16 B per 4 m sample: x, z, y Int32 mm, heading Int16, width Uint8 at 0.1 m, flags Uint8), `world/graph/junctions.json`.
- **Change: an edge chunk is bounded by spatial extent (at most 512 m of samples), not by bytes.** 256 KB of 16 B samples is about 65 km of road, and that would make residency all-or-nothing. The chunk index stores each chunk's bbox.
- **Change: the ride layer (`ride.json` and the ride's edge samples, about 0.9 MB) loads whole before GO.** Only side edges, tiles, cover and meshes stream.
- `world/height/h-<tx>_<tz>.bin` (512 m tiles at 8 m, 65x65 Int16 plus a Uint8 zone layer), `world/cover/c-<tx>_<tz>.bin`, `world/far.bin`, `world/buildings.bin`.
- Size budget: `world/` 28 MB or less, any file 256 KB or less except `far.bin`, the Tremola slice 3.5 MB or less. No `.gpkg`, `.tif`, `.tiff` or `.zip` is committed.
