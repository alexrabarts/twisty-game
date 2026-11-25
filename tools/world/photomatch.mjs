// Photo match: lines the game up with the owner's photos of the ride, one round at a time.
//
//   node tools/world/photomatch.mjs [--round 1] [--only <file>] [--no-game] [--margin 300] [--max <n>]
//   node tools/world/photomatch.mjs coverage
//   node tools/world/photomatch.mjs haze [--round 5]
//   --data <folder> reads the drawn world of another data folder (worlds/gotthard with --world gotthard-lookout)
//
// For every row of every geo CSV (~/Pictures/twisty-reference/geo/*.csv, "file;lat;lng"):
//   1. WGS84 -> LV95 (swisstopo's approximate formulas) -> local metres of world/manifest.json; the nearest point
//      of the drawn ride (s, lateral) and of the planned route (tools/world/route.json waypoints); ground height.
//   2. Field of view from EXIF (35 mm equivalent, else focal length x the camera's crop, else the camera table).
// For a photo inside the drawn world (its height tiles, plus --margin metres):
//   3. Camera bearing, pitch, roll (and a focal scale for crops) by fitting the photo's sky/terrain boundary to
//      the skyline of the real ground (swissALTI3D, Copernicus GLO-30 beyond), eye 1.6 m above the ground.
//   4. Draws the game from that pose (twistyDev.viewPose in tools/autopilot.js, Chrome on the GPU) at the
//      photo's size and field of view.
//   5. Compares plain image statistics per region (sky, far, mid, near ground, road).
//   6. Writes side-by-side.jpg, overlay.jpg, pose.json and metrics.json per photo and a round summary.
// A photo outside the world is listed as `awaiting-import`; when the world grows, a new run matches it.
// `coverage` writes the clusters of photo positions and their distance to the drawn world and the planned route.
//
// Everything this writes goes under ~/Pictures/twisty-reference (TWISTY_REFERENCE overrides): photo positions
// and poses are private and never enter the repo. Set TWISTY_CHROME to a Chrome binary; the page blocks
// cloudfunctions.net, firebasedatabase.app and firebaseio.com.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { Dem } from './dem.mjs';
import { resolveCacheDir } from './cache.mjs';
import { REFERENCE_DIR, readGeoCsvs, findPhoto, wgs84ToLv95, lv95ToWgs84, toLocal, projectOnPolyline, distanceToSquares, clusterPositions } from './photos/geo.mjs';
import { readExif, fieldOfView } from './photos/exif.mjs';
import { readImage, writeJpeg, jpegBytesFor, regionStats, statGaps, sideBySide, drawRows, copyImage } from './photos/image.mjs';
import { HeightField, horizonProfile, fitPose, guidedSkyline, horizonRows, depthGrid } from './photos/horizon.mjs';
import { confidenceOf, regionOf, REGION_NAMES, skylineGap, RoadIndex } from './photos/compare.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const argv = process.argv.slice(2);
const flag = name => argv.includes(`--${name}`);
const option = (name, fallback) => { const at = argv.indexOf(`--${name}`); return at >= 0 ? argv[at + 1] : fallback; };
const command = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'round';

const EYE_M = 1.6;
const MAX_SIDE = 960;
const ALTI_RADIUS_KM = 12;
const STOP_LINK_M = 150;
const STOP_MIN_PHOTOS = 3;

function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function writeJson(p, v) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, `${JSON.stringify(v, null, 1)}\n`); }
const round1 = v => Math.round(v * 10) / 10;
const round2 = v => Math.round(v * 100) / 100;

// ---------------------------------------------------------------- inputs
// The drawn world of a data folder (--data, default world/: the Tremola; worlds/<name>/ for a later import)
function loadWorld() {
  const manifest = readJson(path.join(ROOT, option('data', 'world'), 'manifest.json'));
  const origin = manifest.origin;
  const size = manifest.tiles.sizeM;
  const squares = manifest.tiles.height.map(([i, j]) => ({ x0: i * size, z0: j * size, size }));
  const plan = readJson(path.join(HERE, 'route.json'));
  const planned = plan.waypoints.map(w => ({ ...toLocal(w.e, w.n, origin), name: w.name, id: w.id }));
  return { manifest, origin, squares, planned };
}

function nearestPlanned(planned, x, z) {
  const hit = projectOnPolyline(planned, x, z);
  const near = planned.reduce((a, w) => (Math.hypot(w.x - x, w.z - z) < Math.hypot(a.x - x, a.z - z) ? w : a));
  return { distanceM: Math.round(hit.distance), alongM: Math.round(hit.s), nearestWaypoint: near.name, waypointDistanceM: Math.round(Math.hypot(near.x - x, near.z - z)) };
}

function photoRows(world, margin) {
  return readGeoCsvs(path.join(REFERENCE_DIR, 'geo')).map(row => {
    const { e, n } = wgs84ToLv95(row.lng, row.lat);
    const { x, z } = toLocal(e, n, world.origin);
    const worldDistanceM = distanceToSquares(world.squares, x, z);
    return { ...row, e, n, x, z, worldDistanceM, inWorld: worldDistanceM <= margin, found: findPhoto(row.file, path.join(REFERENCE_DIR, '_all')) };
  });
}

async function heightField(world, cacheDir, centres) {
  const field = new HeightField(world.origin);
  const dem = new Dem(path.join(cacheDir, 'alti3d', '2m'));
  const wanted = new Set();
  for (const c of centres) {
    const r = c.radiusKm;
    for (let kE = Math.floor(c.e / 1000) - r; kE <= Math.floor(c.e / 1000) + r; kE++) {
      for (let kN = Math.floor(c.n / 1000) - r; kN <= Math.floor(c.n / 1000) + r; kN++) wanted.add(`${kE}-${kN}`);
    }
  }
  for (const key of wanted) {
    const [kE, kN] = key.split('-').map(Number);
    if (dem.hasTile(kE, kN) && (await dem.load(kE, kN))) field.addAltiTile(kE, kN, dem.tiles.get(key));
  }
  for (const t of await HeightField.loadCopernicus(path.join(cacheDir, 'copernicus'))) field.addCopernicus(t);
  return field;
}

// ---------------------------------------------------------------- the browser
const BLOCKED_HOSTS = ['cloudfunctions.net', 'firebasedatabase.app', 'firebaseio.com'];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream' };

function startServer() {
  const server = createServer((req, res) => {
    const p = path.normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
    const file = path.join(ROOT, p === '/' ? 'index.html' : p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(done => server.listen(0, '127.0.0.1', () => done(server)));
}

export async function openGame(worldId) {
  const chrome = process.env.TWISTY_CHROME;
  if (!chrome) throw new Error('set TWISTY_CHROME to a Chrome binary (or pass --no-game)');
  const { default: puppeteer } = await import('puppeteer');
  const server = await startServer();
  const port = server.address().port;
  const browser = await puppeteer.launch({ protocolTimeout: 1800000, executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const blocked = [];
  await page.setViewport({ width: 960, height: 540, deviceScaleFactor: 1 });
  await page.setRequestInterception(true);
  page.on('request', request => {
    const target = new URL(request.url());
    if (BLOCKED_HOSTS.some(host => target.hostname.endsWith(host))) { blocked.push(request.url()); request.abort(); }
    else if (/jsdelivr\.net\/npm\/three@0\.150\.0\/build\/three\.min\.js/.test(request.url())) {
      request.respond({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(path.join(ROOT, 'node_modules/three/build/three.min.js')) });
    } else request.continue();
  });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${port}/?world=${encodeURIComponent(worldId)}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.game && window.game.environment && window.game.environment.isWorld && window.game.vehicle && window.game.worldRun', { timeout: 180000 });
  await page.evaluate(() => { window.game.adaptResolution = () => {}; });
  await page.addScriptTag({ path: path.join(ROOT, 'tools/autopilot.js') });
  await page.evaluate(() => {
    const canvas = window.game.graphics.renderer.domElement;
    canvas.id = canvas.id || 'photomatch-canvas';
    const style = document.createElement('style');
    style.textContent = `* { visibility: hidden !important; } #${canvas.id} { visibility: visible !important; }`;
    document.head.appendChild(style);
  });
  const info = await page.evaluate(() => {
    const route = window.game.environment.route;
    const gl = window.game.graphics.renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      points: route.points.map((p, i) => ({ x: p.x, z: p.z, s: route.sArray[i], width: p.width })),
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null,
      cameraFar: window.game.camera.far
    };
  });
  return {
    info, blocked, errors, page,
    async render(pose, width, height, tmpDir) {
      await page.setViewport({ width, height, deviceScaleFactor: 1 });
      await page.evaluate(() => window.dispatchEvent(new Event('resize')));
      const result = await page.evaluate(p => window.twistyDev.viewPose(p), { ...pose, eyeHeight: EYE_M, mask: true });
      const file = path.join(tmpDir, `game-${process.pid}.png`);
      await page.screenshot({ path: file });
      const image = readImage(file, Math.max(width, height), tmpDir);
      fs.rmSync(file, { force: true });
      return { image, rows: Float32Array.from(result.rows.map(r => (r === null ? NaN : r))), s: result.s, groundY: result.groundY, eyeY: result.y, size: result.size };
    },
    async close() { await browser.close(); server.close(); }
  };
}

// ---------------------------------------------------------------- one photo
function photoDir(roundDir, row) {
  const album = row.found ? row.found.album : row.csv.replace(/\.csv$/, '');
  return path.join(roundDir, album, row.file.replace(/[^\w.-]+/g, '_'));
}

function cameraOf(rowPose, width, height) {
  return { bearing: rowPose.bearing, pitch: rowPose.pitch, roll: rowPose.roll, focalPx: rowPose.focalPx, cx: width / 2, cy: height / 2, width, height };
}

async function matchOne(row, ctx) {
  const { field, tmpDir, game, road, profiles } = ctx;
  const img = readImage(row.found.path, MAX_SIDE, tmpDir);
  const { width, height } = img;
  const fov = fieldOfView(row.exif, width, height);
  const groundDem = field.heightAt(row.x, row.z);
  const eyeY = groundDem + EYE_M;
  const key = `${Math.round(row.x / 2)},${Math.round(row.z / 2)}`;
  if (!profiles.has(key)) profiles.set(key, horizonProfile((x, z) => field.heightAt(x, z), row.x, row.z, eyeY));
  const profile = profiles.get(key);
  const fit = fitPose(img, profile, { focalPx: fov.focalPx });
  const cam = cameraOf(fit, width, height);
  const demRows = horizonRows(profile, cam, width, height);
  const guided = guidedSkyline(fit.sky, width, height, demRows);
  const validShare = guided.rows.reduce((a, v) => a + (Number.isFinite(v) ? 1 : 0), 0) / width;
  const vfov = (2 * Math.atan(height / 2 / fit.focalPx) * 180) / Math.PI;
  const hfov = (2 * Math.atan(width / 2 / fit.focalPx) * 180) / Math.PI;
  const confidence = confidenceOf({ fit, validShare, demRows, photoRows: guided.rows, height, vfov });
  const usePose = fit;
  // The photo's sky: above its own step where it has one, else above the real skyline
  const skyRows = Float32Array.from(guided.rows, (v, u) => (Number.isFinite(v) ? v : demRows[u]));
  const sky = { rows: skyRows };

  // Region masks from the real ground: distance along each ray
  const gw = 160, gh = Math.round((160 * height) / width);
  const depth = depthGrid((x, z) => field.heightAt(x, z), { x: row.x, y: eyeY, z: row.z }, cam, gw, gh);
  const regionPhoto = (x, y) => regionOf(depth, road, x, y, width, height, sky.rows);

  let gameResult = null;
  if (game) gameResult = await game.render({ x: row.x, z: row.z, bearing: usePose.bearing, pitch: usePose.pitch, roll: usePose.roll, vfov }, width, height, tmpDir);
  const metrics = { regions: {}, skyline: {} };
  for (const name of REGION_NAMES) {
    const photoStats = regionStats(img, name === 'whole' ? () => true : (x, y) => regionPhoto(x, y) === name);
    const entry = { photo: photoStats };
    if (gameResult) {
      const gameStats = regionStats(gameResult.image, name === 'whole' ? () => true : (x, y) => regionOf(depth, road, x, y, width, height, gameResult.rows) === name);
      entry.game = gameStats;
      entry.gap = statGaps(photoStats, gameStats);
    }
    metrics.regions[name] = entry;
  }
  const degPerRow = vfov / height;
  metrics.skyline.photoVsDem = skylineGap(demRows, guided.rows, degPerRow);
  metrics.skyline.photoValidShare = round2(validShare);
  if (gameResult) {
    metrics.skyline.gameVsPhoto = skylineGap(sky.rows, gameResult.rows, degPerRow);
    metrics.skyline.gameVsDem = skylineGap(demRows, gameResult.rows, degPerRow);
    metrics.skyline.gameSkyShare = round2(gameResult.rows.reduce((a, r) => a + (Number.isFinite(r) ? r : height), 0) / (width * height));
  }
  metrics.skyline.photoSkyShare = round2(sky.rows.reduce((a, r) => a + (Number.isFinite(r) ? r : 0), 0) / (width * height));
  // How far the visible skyline is: the distance of the horizon at the image's centre bearings
  const dists = [];
  for (let b = -hfov / 2; b <= hfov / 2; b += 1) dists.push(profile.dist[Math.round((((usePose.bearing + b) % 360 + 360) % 360) / profile.binDeg) % profile.dist.length]);
  dists.sort((a, b) => a - b);
  metrics.skyline.horizonDistanceM = { median: Math.round(dists[Math.floor(dists.length / 2)]), max: Math.round(dists[dists.length - 1]) };
  metrics.skyline.beyondGameFarM = gameResult ? dists.filter(d => d > game.info.cameraFar).length / dists.length : null;

  const dir = photoDir(ctx.roundDir, row);
  fs.mkdirSync(dir, { recursive: true });
  const gameImg = gameResult ? gameResult.image : (() => { const g = copyImage(img); g.data.fill(40); return g; })();
  writeJpeg(sideBySide(img, gameImg), path.join(dir, 'side-by-side.jpg'), tmpDir);
  const leftO = copyImage(img), rightO = copyImage(gameImg);
  drawRows(leftO, demRows, [255, 220, 0], 1);
  drawRows(leftO, guided.rows, [255, 40, 40], 0);
  drawRows(rightO, demRows, [255, 220, 0], 1);
  if (gameResult) drawRows(rightO, gameResult.rows, [0, 230, 255], 0);
  writeJpeg(sideBySide(leftO, rightO), path.join(dir, 'overlay.jpg'), tmpDir);

  const poseOut = {
    photo: row.file, album: row.found.album, csv: row.csv, lat: row.lat, lng: row.lng,
    lv95: { e: round1(row.e), n: round1(row.n) }, local: { x: round1(row.x), z: round1(row.z) },
    route: row.route, groundDemM: round1(groundDem), groundGameM: gameResult ? round1(gameResult.groundY) : null,
    eyeHeightM: EYE_M, eyeY: round1(eyeY), demSource: field.sourceAt(row.x, row.z),
    bearing: round2(usePose.bearing), pitch: round2(usePose.pitch), roll: round2(usePose.roll), focalScale: round2(usePose.scale ?? 1),
    hfov: round2(hfov), vfov: round2(vfov), image: { width, height },
    fov: { focal35: round1(fov.focal35), source: fov.source, exifFocalMm: row.exif.focalMm, exif35: row.exif.focal35 },
    camera: { make: row.exif.make, model: row.exif.model, date: row.exif.date },
    poseFrom: 'skyline-step-fit', fitCandidates: fit.candidates, confidence
  };
  writeJson(path.join(dir, 'pose.json'), poseOut);
  writeJson(path.join(dir, 'metrics.json'), metrics);
  return { pose: poseOut, metrics, dir };
}

// ---------------------------------------------------------------- summary
function gapLine(m) {
  const r = m.regions;
  const bits = [];
  for (const name of REGION_NAMES) {
    const g = r[name] && r[name].gap;
    if (!g) continue;
    bits.push(`${name}: dL ${g.lum >= 0 ? '+' : ''}${g.lum}, dSat ${g.sat >= 0 ? '+' : ''}${g.sat}, dGreen ${g.greenShare}, dRock ${g.rockShare}, dDetail ${g.detail}`);
  }
  return bits.join('; ');
}

function stopsOf(rows, world, matched, notes) {
  const clusters = clusterPositions(rows.map(r => ({ x: r.x, z: r.z })), STOP_LINK_M);
  return clusters.filter(c => c.count >= STOP_MIN_PHOTOS).map(c => {
    const members = c.members.map(k => rows[k]);
    const { e, n } = { e: c.x + world.origin.e0, n: world.origin.n0 - c.z };
    const { lat, lon } = lv95ToWgs84(e, n);
    const dates = members.map(m => m.exif && m.exif.date).filter(Boolean).sort();
    const route = projectOnPolyline(world.ridePoints || [], c.x, c.z);
    const inWorld = distanceToSquares(world.squares, c.x, c.z) <= 0;
    const note = (notes || []).find(nt => {
      const p = wgs84ToLv95(nt.lng, nt.lat);
      const q = toLocal(p.e, p.n, world.origin);
      return Math.hypot(q.x - c.x, q.z - c.z) < 300;
    });
    const high = members.filter(m => matched.get(m.file) && matched.get(m.file).confidence.level === 'high').length;
    return {
      lat: +lat.toFixed(4), lng: +lon.toFixed(4), count: c.count, spanM: Math.round(c.spanM),
      albums: [...new Set(members.map(m => (m.found ? m.found.album : m.csv)))],
      from: dates[0] || null, to: dates[dates.length - 1] || null,
      inWorld, s: inWorld && route ? Math.round(route.s) : null, lateralM: inWorld && route ? Math.round(route.lateral) : null,
      plannedRoute: nearestPlanned(world.planned, c.x, c.z),
      worldDistanceM: Math.round(distanceToSquares(world.squares, c.x, c.z)),
      highConfidence: high,
      description: note ? note.text : null,
      files: members.map(m => m.file)
    };
  });
}

function writeSummary(roundDir, round, entries, stops, world) {
  const summary = {
    round, written: new Date().toISOString(), world: world.manifest.stages.map(s => s.id), photos: entries.length,
    matched: entries.filter(e => e.status === 'matched').length,
    highConfidence: entries.filter(e => e.status === 'matched' && e.confidence.level === 'high').length,
    awaitingImport: entries.filter(e => e.status === 'awaiting-import').length,
    missingFile: entries.filter(e => e.status === 'missing-file').length,
    entries, stops
  };
  writeJson(path.join(roundDir, 'summary.json'), summary);
  const md = [`# Photo match, round ${round}`, '', `Written ${summary.written}. World: ${summary.world.join(', ')}.`, '',
    `- Photos in the geo CSVs: ${summary.photos}`, `- Matched (inside the drawn world): ${summary.matched}, high confidence: ${summary.highConfidence}`,
    `- Awaiting import: ${summary.awaitingImport}`, `- No photo file: ${summary.missingFile}`, '', '## Matched photos', '',
    '| Photo | s (m) | lateral (m) | bearing | pitch | roll | vfov | confidence | skyline game vs photo (deg) | gaps (game minus photo) |', '|---|---|---|---|---|---|---|---|---|---|'];
  for (const e of entries.filter(x => x.status === 'matched')) {
    const sk = e.metrics.skyline.gameVsPhoto;
    md.push(`| ${e.album}/${e.photo} | ${e.route ? Math.round(e.route.s) : ''} | ${e.route ? Math.round(e.route.lateral) : ''} | ${e.pose.bearing} | ${e.pose.pitch} | ${e.pose.roll} | ${e.pose.vfov} | ${e.confidence.level} (${(e.confidence.reasons || []).join(', ')}) | ${sk ? `${sk.meanAbsDeg} (game higher ${sk.gameHigherShare})` : ''} | ${gapLine(e.metrics)} |`);
  }
  md.push('', '## Stops (clusters of photos)', '', '| Where | photos | in world | s (m) | planned route | description |', '|---|---|---|---|---|---|');
  for (const s of stops) md.push(`| ${s.lat}, ${s.lng} | ${s.count} | ${s.inWorld ? 'yes' : `no (${s.worldDistanceM} m)`} | ${s.s ?? ''} | ${s.plannedRoute.distanceM} m from the line, near ${s.plannedRoute.nearestWaypoint} | ${s.description || ''} |`);
  md.push('', '## Awaiting import', '', '| Photo | planned route distance (m) | nearest waypoint |', '|---|---|---|');
  for (const e of entries.filter(x => x.status === 'awaiting-import').sort((a, b) => a.plannedRoute.distanceM - b.plannedRoute.distanceM).slice(0, 200)) {
    md.push(`| ${e.album}/${e.photo} | ${e.plannedRoute.distanceM} | ${e.plannedRoute.nearestWaypoint} |`);
  }
  fs.writeFileSync(path.join(roundDir, 'summary.md'), `${md.join('\n')}\n`);
  const cards = entries.filter(e => e.status === 'matched').map(e => {
    const rel = path.relative(roundDir, e.dir).split(path.sep).map(encodeURIComponent).join('/');
    const sk = e.metrics.skyline.gameVsPhoto;
    return `<figure class="${e.confidence.level}"><a href="${rel}/overlay.jpg"><img loading="lazy" src="${rel}/side-by-side.jpg" alt=""></a>
<figcaption><b>${e.photo}</b> · s ${e.route ? Math.round(e.route.s) : '?'} m · bearing ${e.pose.bearing}° · pitch ${e.pose.pitch}° · vfov ${e.pose.vfov}° · <span class="c">${e.confidence.level}</span>${sk ? ` · skyline gap ${sk.meanAbsDeg}°` : ''}</figcaption></figure>`;
  });
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Photo match round ${round}</title>
<style>:root{--bg:#f6f6f4;--fg:#1d1d1b;--muted:#666;--card:#fff}@media (prefers-color-scheme:dark){:root{--bg:#161616;--fg:#eee;--muted:#aaa;--card:#222}}
body{margin:0;padding:16px;background:var(--bg);color:var(--fg);font:14px/1.4 system-ui,sans-serif}h1{font-size:20px}p{color:var(--muted)}
main{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,640px),1fr));gap:16px}figure{margin:0;background:var(--card);padding:8px;border-radius:6px}
img{width:100%;height:auto;display:block}figcaption{margin-top:6px;font-size:13px}.low .c{color:#c0392b}.medium .c{color:#d68910}.high .c{color:#1e8449}</style></head>
<body><h1>Photo match, round ${round}</h1><p>Photo on the left, the game on the right, from the fitted camera. Click a picture for the overlay: yellow is the real skyline (swissALTI3D), red the photo's, cyan the game's. ${summary.matched} matched, ${summary.highConfidence} high confidence, ${summary.awaitingImport} awaiting import.</p>
<main>${cards.join('\n')}</main></body></html>`;
  fs.writeFileSync(path.join(roundDir, 'index.html'), html);
  return summary;
}

function writeCoverage(rows, world) {
  const clusters = clusterPositions(rows.map(r => ({ x: r.x, z: r.z })), STOP_LINK_M);
  const out = {
    written: new Date().toISOString(),
    linkM: STOP_LINK_M, stopMinPhotos: STOP_MIN_PHOTOS,
    corridor: { stages: world.manifest.stages.map(s => s.id), tiles: world.squares.length, tileSizeM: world.manifest.tiles.sizeM },
    clusters: clusters.map(c => {
      const e = c.x + world.origin.e0, n = world.origin.n0 - c.z;
      const { lat, lon } = lv95ToWgs84(e, n);
      return {
        lat: +lat.toFixed(5), lng: +lon.toFixed(5), lv95: { e: Math.round(e), n: Math.round(n) }, count: c.count, spanM: Math.round(c.spanM),
        stop: c.count >= STOP_MIN_PHOTOS,
        corridorDistanceM: Math.round(distanceToSquares(world.squares, c.x, c.z)),
        plannedRoute: nearestPlanned(world.planned, c.x, c.z)
      };
    })
  };
  writeJson(path.join(REFERENCE_DIR, 'coverage.json'), out);
  return out;
}

// ---------------------------------------------------------------- haze
// The colour of distant land in the photos by its distance, and of the sky just over the skyline: what the game's
// haze is set to and checked against (LandShade.HAZE, terrain-check world-haze). Only these numbers leave the photos.
export const HAZE_BANDS = [{ name: '1 to 3 km', from: 1000, to: 3000 }, { name: '3 to 8 km', from: 3000, to: 8000 }, { name: '8 km on', from: 8000, to: Infinity }];
// The sky near the horizon: this share of the picture's height over the skyline
export const HAZE_SKY = [0.01, 0.08];

export function hsvOf(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 0) h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s: mx ? d / mx : 0, v: mx / 255 };
}

// What a list of display pixels ([r, g, b], 0 to 255) reads as: the median colour, the 10th to 90th percentile of
// saturation and value, the hue of the mean colour, and how green it is against blue (g - b of the mean, 0 to 1;
// under 0 is bluer than green) and against the grey of its own lightness (g - (r + b) / 2)
export function hazeStats(pixels) {
  if (!pixels.length) return { pixels: 0 };
  const q = (list, t) => list[Math.min(list.length - 1, Math.floor(list.length * t))];
  const col = k => pixels.map(p => p[k]).sort((a, b) => a - b);
  const hsv = pixels.map(p => hsvOf(p[0], p[1], p[2]));
  const sat = hsv.map(p => p.s).sort((a, b) => a - b), val = hsv.map(p => p.v).sort((a, b) => a - b);
  const mean = [0, 1, 2].map(k => pixels.reduce((a, p) => a + p[k], 0) / pixels.length);
  const m = hsvOf(mean[0], mean[1], mean[2]);
  const r2 = v => Math.round(v * 100) / 100;
  return {
    pixels: pixels.length, median: [0, 1, 2].map(k => q(col(k), 0.5)), mean: mean.map(Math.round), hue: Math.round(m.h), sat: r2(m.s), val: r2(m.v),
    satRange: [r2(q(sat, 0.1)), r2(q(sat, 0.9))], valRange: [r2(q(val, 0.1)), r2(q(val, 0.9))],
    greenOverBlue: r2((mean[1] - mean[2]) / 255), greenOverGrey: r2((mean[1] - (mean[0] + mean[2]) / 2) / 255),
    greenShare: r2(pixels.filter(p => p[1] > p[2] && p[1] >= p[0]).length / pixels.length)
  };
}

// The pixels of one photo by band: the ground by its real distance along the ray, the sky by its height over the skyline
function hazeOne(row, ctx) {
  const { field, tmpDir, profiles } = ctx;
  const img = readImage(row.found.path, MAX_SIDE, tmpDir);
  const { width, height, data } = img;
  const fov = fieldOfView(row.exif, width, height);
  const eyeY = field.heightAt(row.x, row.z) + EYE_M;
  const key = `${Math.round(row.x / 2)},${Math.round(row.z / 2)}`;
  if (!profiles.has(key)) profiles.set(key, horizonProfile((x, z) => field.heightAt(x, z), row.x, row.z, eyeY));
  const profile = profiles.get(key);
  const fit = fitPose(img, profile, { focalPx: fov.focalPx });
  const cam = cameraOf(fit, width, height);
  const demRows = horizonRows(profile, cam, width, height);
  const guided = guidedSkyline(fit.sky, width, height, demRows);
  const validShare = guided.rows.reduce((a, v) => a + (Number.isFinite(v) ? 1 : 0), 0) / width;
  const vfov = (2 * Math.atan(height / 2 / fit.focalPx) * 180) / Math.PI;
  const confidence = confidenceOf({ fit, validShare, demRows, photoRows: guided.rows, height, vfov });
  const skyRows = Float32Array.from(guided.rows, (v, u) => (Number.isFinite(v) ? v : demRows[u]));
  const gw = 160, gh = Math.round((160 * height) / width);
  const depth = depthGrid((x, z) => field.heightAt(x, z), { x: row.x, y: eyeY, z: row.z }, cam, gw, gh);
  const bands = HAZE_BANDS.map(() => []), sky = [];
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const q = (y * width + x) * 4, px = [data[q], data[q + 1], data[q + 2]];
      const top = skyRows[x];
      if (Number.isFinite(top) && y < top) {
        const over = (top - y) / height;
        if (over >= HAZE_SKY[0] && over <= HAZE_SKY[1]) sky.push(px);
        continue;
      }
      // (a few rows under the skyline are left out: the fit is good to under a degree, and a row of sky read as a
      // ridge would pale the far band)
      if (Number.isFinite(top) && y < top + height * 0.015) continue;
      const d = depth.dist[Math.min(gh - 1, Math.floor((y / height) * gh)) * gw + Math.min(gw - 1, Math.floor((x / width) * gw))];
      const at = HAZE_BANDS.findIndex(b => d >= b.from && d < b.to);
      if (at >= 0) bands[at].push(px);
    }
  }
  return { photo: row.file, confidence: confidence.level, bands, sky };
}

// Each band over every photo with a camera that can be trusted, a photo's pixels counted no more than `cap` times so
// that one wide view does not set the answer
function hazeOf(perPhoto, cap = 4000) {
  const thin = list => (list.length <= cap ? list : list.filter((_, i) => i % Math.ceil(list.length / cap) === 0));
  const used = perPhoto.filter(p => p.confidence !== 'low');
  return {
    photos: used.length,
    bands: HAZE_BANDS.map((b, i) => ({ name: b.name, photos: used.filter(p => p.bands[i].length >= 50).length, ...hazeStats(used.flatMap(p => thin(p.bands[i]))) })),
    sky: { name: 'sky near the horizon', photos: used.filter(p => p.sky.length >= 50).length, ...hazeStats(used.flatMap(p => thin(p.sky))) }
  };
}

// ---------------------------------------------------------------- main
async function main() {
  const world = loadWorld();
  const margin = Number(option('margin', 300));
  const rows = photoRows(world, margin);
  if (command === 'coverage') {
    const cov = writeCoverage(rows, world);
    console.log(JSON.stringify({ file: path.join(REFERENCE_DIR, 'coverage.json'), clusters: cov.clusters.length, stops: cov.clusters.filter(c => c.stop).length, inCorridor: cov.clusters.filter(c => c.corridorDistanceM === 0).length }));
    return;
  }
  const round = option('round', '1');
  const roundDir = path.join(REFERENCE_DIR, 'matches', `round-${round}`);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'photomatch-'));
  const cacheDir = resolveCacheDir();
  const only = option('only');
  const max = Number(option('max', Infinity));

  for (const row of rows) {
    if (!row.found) continue;
    try { row.exif = readExif(jpegBytesFor(row.found.path, tmpDir)); } catch { row.exif = readExif(Buffer.alloc(0)); }
  }
  const inWorld = rows.filter(r => r.inWorld && r.found && (!only || r.file === only)).slice(0, max);
  const centres = inWorld.map(r => ({ e: r.e, n: r.n, radiusKm: ALTI_RADIUS_KM }))
    .concat(rows.filter(r => !r.inWorld).map(r => ({ e: r.e, n: r.n, radiusKm: 0 })));
  const field = await heightField(world, cacheDir, centres);

  if (command === 'haze') {
    const ctx = { field, tmpDir, profiles: new Map() };
    const perPhoto = inWorld.map(row => hazeOne(row, ctx));
    const out = hazeOf(perPhoto);
    // Per photo too, in the private folder only: which photo pulls a band where
    writeJson(path.join(roundDir, 'haze.json'), { ...out, perPhoto: perPhoto.map(p => ({ photo: p.photo, confidence: p.confidence, bands: p.bands.map(hazeStats), sky: hazeStats(p.sky) })) });
    fs.rmSync(tmpDir, { recursive: true, force: true });
    console.log(JSON.stringify(out, null, 1));
    return;
  }
  const game = flag('no-game') || !inWorld.length ? null : await openGame(option('world', 'tremola'));
  world.ridePoints = game ? game.info.points : [];
  const road = game ? new RoadIndex(game.info.points) : null;
  const ctx = { field, tmpDir, game, road, roundDir, profiles: new Map() };
  const entries = [];
  const matched = new Map();
  try {
    for (const row of rows) {
      if (only && row.file !== only) continue;
      const planned = nearestPlanned(world.planned, row.x, row.z);
      const base = { photo: row.file, album: row.found ? row.found.album : null, csv: row.csv, lat: row.lat, lng: row.lng, lv95: { e: round1(row.e), n: round1(row.n) }, local: { x: round1(row.x), z: round1(row.z) }, worldDistanceM: Math.round(row.worldDistanceM), plannedRoute: planned };
      if (!row.found) { entries.push({ ...base, status: 'missing-file' }); continue; }
      const gh = field.heightAt(row.x, row.z);
      const fov = fieldOfView(row.exif, row.exif.width || 4, row.exif.height || 3);
      const still = { ...base, groundDemM: Number.isNaN(gh) ? null : round1(gh), demSource: field.sourceAt(row.x, row.z), fov: { focal35: round1(fov.focal35), source: fov.source }, camera: { model: row.exif.model, date: row.exif.date } };
      if (!row.inWorld || !inWorld.includes(row)) { entries.push({ ...still, status: 'awaiting-import' }); continue; }
      if (game) {
        const hit = projectOnPolyline(game.info.points, row.x, row.z);
        row.route = { s: round1(hit.s), lateral: round1(hit.lateral), distance: round1(hit.distance), heading: round1(hit.heading) };
      }
      const t0 = Date.now();
      const res = await matchOne(row, ctx);
      matched.set(row.file, res.pose);
      entries.push({ ...still, status: 'matched', route: row.route, pose: res.pose, confidence: res.pose.confidence, metrics: res.metrics, dir: res.dir });
      process.stderr.write(`${row.file}: ${res.pose.confidence.level}, bearing ${res.pose.bearing}, ${Date.now() - t0} ms\n`);
    }
  } finally {
    if (game) await game.close();
  }
  const notesFile = path.join(REFERENCE_DIR, 'stop-notes.json');
  const notes = fs.existsSync(notesFile) ? readJson(notesFile) : [];
  const stops = stopsOf(rows, world, matched, notes);
  const summary = writeSummary(roundDir, round, entries, stops, world);
  // coverage.json measures the photos against the shipped world/ (the importer's sizing): another folder's round leaves it
  if (!option('data')) writeCoverage(rows, world);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(JSON.stringify({ roundDir, photos: summary.photos, matched: summary.matched, highConfidence: summary.highConfidence, awaitingImport: summary.awaitingImport, missingFile: summary.missingFile, stops: stops.length, renderer: game ? game.info.renderer : null, blocked: game ? game.blocked.length : 0, pageErrors: game ? game.errors : [] }, null, 1));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e); process.exit(1); });
}
