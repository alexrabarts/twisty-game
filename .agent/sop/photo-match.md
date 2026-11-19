# Photo match: the game against the owner's photos

The photo match puts the game camera where each photo was taken, turns it to the photo's direction and gives it the photo's field of view. Then it writes the photo and the game side by side and measures the gaps. Each run is a round. A round gives a ranked list of engine changes. After the changes, the next round measures them again.

The same loop also tells a future import where the photos are, so the world can grow to cover them.

## Where the private data lives

The photos, their positions and the poses are private. The repo is public, so none of them go into it.

| What | Where |
|---|---|
| Photos, one folder for each album | `~/Pictures/twisty-reference/_all/<album>/` |
| Positions, one CSV for each album (`file;lat;lng`, WGS84) | `~/Pictures/twisty-reference/geo/<album>.csv` |
| Rounds (side-by-sides, poses, metrics, summaries, contact sheet) | `~/Pictures/twisty-reference/matches/round-<n>/` |
| Clusters of photo positions for a future import | `~/Pictures/twisty-reference/coverage.json` |
| Optional one-line descriptions of stops | `~/Pictures/twisty-reference/stop-notes.json` (`[{"lat", "lng", "text"}]`) |
| Height data (swissALTI3D 2 m, Copernicus GLO-30) | `~/Library/Caches/twisty-world/alti3d/2m/`, `~/Library/Caches/twisty-world/copernicus/` |

`TWISTY_REFERENCE` moves the `~/Pictures/twisty-reference` folder. The repo holds only the code (`tools/world/photomatch.mjs`, `tools/world/photos/`), its tests on synthetic data (`tests/unit/photo-match.test.js`) and this file.

## 1. Get the photos

1. In Google Photos, open each album and download it as a zip.
2. Unzip only the photos (JPG, HEIC, PNG) into `~/Pictures/twisty-reference/_all/<album>/`. Leave out the videos.

The downloads have no GPS. Shared albums hide the location, so step 2 reads it from the owner's account.

## 2. Read the positions

`tools/world/photos/geo-extract.page.js` reads the position of each photo from the album page. It writes nothing to the account.

1. In Chrome, sign in to photos.google.com with the owner's account. Use that account's path, for example `https://photos.google.com/u/1/`.
2. Open the album, then open its first photo.
3. Press `i` to open the info panel.
4. Open the developer console and paste the whole of `geo-extract.page.js`.
5. Run `geoExtract.start('<album name>')`. The script steps through the album with the right arrow key.
6. Run `geoExtract.status()` until it shows `done: true`.
7. Run `copy(geoExtract.csv())` and save the clipboard as `~/Pictures/twisty-reference/geo/<album>.csv`.

The CSV holds one row for each photo that has a position. Videos are left out. The tool reads every CSV in the folder, so a new album needs no code change.

## 3. Run a round

```sh
export TWISTY_CHROME="<path to Chrome for Testing>"
node tools/world/photomatch.mjs --round 2
```

- `--only <file>` matches one photo. `--max <n>` stops after n photos in the world.
- `--margin <m>` also matches photos up to m metres outside the drawn world (default 300).
- `--no-game` skips the browser: it fits the poses and measures the photos only.
- `--world <id>` names the stage to load (default `tremola`).
- `node tools/world/photomatch.mjs coverage` writes `coverage.json` only.

The run opens a visible Chrome on the GPU. The page blocks `cloudfunctions.net`, `firebasedatabase.app` and `firebaseio.com`. It takes about 10 s for each photo in the world.

What the tool does for each photo:

1. It changes WGS84 to LV95 (swisstopo's approximate formulas, about 1 m) and then to the world's local metres (`x = E - e0`, `z = -(N - n0)`, origin in `world/manifest.json`).
2. It reads the field of view from EXIF: the 35 mm equivalent focal length, else the focal length times the camera's crop, else the camera table in `tools/world/photos/exif.mjs`. A 35 mm value under 12 mm is not believed. `pose.json` records the source.
3. A photo outside the drawn world gets the status `awaiting-import`, with its distance to the planned route (`tools/world/route.json`). Nothing more is done for it.
4. For a photo in the world, the tool computes the real skyline over 360 degrees from the camera, 1.6 m above the ground. It uses swissALTI3D within 12 km and Copernicus GLO-30 beyond.
5. It fits the camera bearing, pitch, roll and a focal scale (for crops). The fit looks for the sharpest step from sky to ground along the real skyline in the photo. It does not cut out the sky first, because haze makes far ridges as pale as the sky.
6. It draws the game from that pose with `twistyDev.viewPose` (`tools/autopilot.js`, world mode only). The bike and the traffic are hidden, and the HUD is not drawn.
7. It compares plain image statistics for each region. The regions come from the distance along each ray over the real ground: sky, far (over 3 km), mid (600 m to 3 km), near (under 600 m), road (near ground on the ride) and other (no ground on the ray). It records mean colour, luminance, saturation, the shares of green, dark green (trees), grey (rock and buildings) and snow, the detail (mean luminance step between pixels), and the hue and luminance histograms. It does not run face or person recognition, and it does not write a crop of a photo.

## Outputs

For each matched photo, in `matches/round-<n>/<album>/<photo>/`:

- `side-by-side.jpg`: the photo on the left, the game on the right, the same size.
- `overlay.jpg`: the same, with the real skyline in yellow, the photo's skyline in red and the game's skyline in cyan.
- `pose.json`: position, s and lateral offset on the ride, ground height (real and game), bearing, pitch, roll, field of view and its source, and the confidence.
- `metrics.json`: the statistics for each region, photo and game, and the gaps (game minus photo), and the skyline gaps in degrees.

For the round: `summary.json`, `summary.md` and the contact sheet `index.html`.

### Confidence

- `high`: a clear skyline in at least half of the columns, a strong sky-to-ground step, a bearing that wins clearly over the best bearing 12 degrees or more away, a skyline with relief, and a misfit under 0.8 degrees.
- `medium` and `low` list the reasons. A close-up of people, a bike or a building gives a short skyline and a `low` match. The tool keeps these photos and flags them.

### Stops

Three or more photos within 150 m of each other make a stop. The summary lists each stop with its s on the ride (when it is in the world), its distance to the planned route, and the line from `stop-notes.json`. A stop is a candidate for a checkpoint, a pit stop or a short cinematic moment.

## 4. Review the round

1. Open `matches/round-<n>/index.html`. Click a picture for its overlay.
2. Look first at the `high` matches. A `low` match can still show the place, but its camera can point the wrong way.
3. Rank the engine changes by the gaps that repeat over many photos. Write each change with its evidence: the photos and the metric.
4. Make the changes in their own PRs. Then run the next round and compare the gaps with the last round.

### Vegetation colour (round 5)

Round 5 sampled conifer stands, shrubs and grass by hand in the photos (rectangles on the side-by-sides, HSV of the display colour). These ranges set the world's tree palette and caps (`js/world/vegetation.js`) and the browser check `world-trees` (`TREE_BANDS`, `TREE_OVER_LAND` in `tools/terrain-check.mjs`):

- Conifer stands, 300 m to 3 km: saturation 0.17 to 0.43, value 0.24 to 0.37. They are darker than the grass in the same photo (value 0.36 to 0.57): 0.5 to 0.7 of it.
- Shrub slopes near the camera: value 0.10 to 0.33, saturation 0.14 to 0.55 (the higher in shade).
- Far forest goes blue with distance (a far stand in shade: about sRGB 39, 64, 87).

Keep the rectangles and their overlays under `matches/round-<n>/ref-rects/`, never in the repo. Sample again when a round adds photos of trees closer than 300 m.

### Haze (the colour of distant land)

`node tools/world/photomatch.mjs haze --round <n>` measures the colour of distant land in every matched photo by its real distance (1 to 3 km, 3 to 8 km, from 8 km) and the colour of the sky 1 to 8% of the picture's height over the skyline. It prints the numbers of each band over the photos with a camera that can be trusted, and writes them with each photo's own numbers to `matches/round-<n>/haze.json`. Only the pooled numbers go into the repo: they set `LandShade.HAZE` (`js/world/landshade.js`) and the ranges of the browser check `world-haze` (`HAZE_BANDS`, `HAZE_SKY` in `tools/terrain-check.mjs`). Measure again when a round adds photos with a far view.

## 5. After an import grows the world

1. Run `node tools/world/photomatch.mjs coverage`. `coverage.json` lists each cluster of photos with its distance to the drawn world (`corridorDistanceM`) and to the planned route. Use it to size the next import or a free-roam corridor so that it covers the stops. In the importer, `readCoverage()` and `coverageBoxes(coverage, { reachM, marginM })` from `tools/world/photos/geo.mjs` give the LV95 boxes round the stops near the planned route.
2. After the import, run a new round. Photos that were `awaiting-import` and are now in the drawn world are matched with no code change.
3. A world far from the cached height data needs those swissALTI3D tiles in the cache, and Copernicus tiles for the far skyline. Download a Copernicus tile from `https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N<lat>_00_E<lng>_00_DEM/Copernicus_DSM_COG_10_N<lat>_00_E<lng>_00_DEM.tif` into `~/Library/Caches/twisty-world/copernicus/`.
