// The world importer. Runs on Node, never in the page. Deterministic: no clock, no random, sorted iteration, so the
// same cache gives the same bytes.
//   node tools/world/import.mjs --stages <ids|all> [--cache <dir>] [--out world] [--courses <file>] [--synthetic]
// A stage id is a slice id from route.json `slices` (the Tremola slice is `tremola`) or a stage of the full ride.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GeoPackage } from './gpkg.mjs';
import { resolveCacheDir, findGpkg, ensureAlti3d, TLM_NAME } from './cache.mjs';
import { loadEdges } from './inspect.mjs';
import { stageDefs } from './stages.mjs';
import { buildCorridorGraph, degreeOf, GraphGapError } from './graph.mjs';
import { resampleEdge, resampleLine, polylineLengths } from './resample.mjs';
import { profileEdge, reconcileNodes, limitRideCrests, demGaps, summariseGaps, FLAG } from './profile.mjs';
import { createBencher, TILE_M } from './bench.mjs';
import { rasterizeCover, coverLookup, coverPolysFromRows } from './landcover.mjs';
import { buildingsFromRows, clearOfRoads } from './buildings.mjs';
import { buildJunctions } from './junctions.mjs';
import { rideSamples, placeStations, siteReach } from './stations.mjs';
import { stageFloors } from './floors.mjs';
import { Dem, wgs84Bbox } from './dem.mjs';
import { NODE_FLAG, writeWorld, writeCourses } from './encode.mjs';
import { syntheticSource } from './synthetic.mjs';
import { buildFarLand, horizonSinks, COPERNICUS_NOTICE } from './farland.mjs';
import { TILE_N } from './bench.mjs';
import { RIDE_WIDTH_M, classWidth, narrowRide } from './widths.mjs';
import { mapPlaces, foundPlaces, applyPads, mouthsOf, numberPlaces } from './places.mjs';

export { RIDE_WIDTH_M, classWidth };

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const ORIGIN = { e0: 2688000, n0: 1165000 };
const TILE_REACH_M = 600;
const FAR_CELL_M = 100;
const FAR_MARGIN_M = 1500;
const LANDMARK_SNAP_M = 150;
const MIN_STRUCTURE_M = 20;
const NO_DATA = -32768;
const CREDIT = '© swisstopo';

export { stageDefs };

// ---- the real source: swissTLM3D and swissALTI3D from the cache ----

export async function loadTlmSource({ stages, cacheDir, gpkgFile, landmarksFile = path.join(HERE, 'landmarks.json'), structuresFile = path.join(HERE, 'structures.json') }) {
  const { e0, n0 } = ORIGIN;
  const local = (e, n, h) => (h === undefined ? [e - e0, -(n - n0)] : [e - e0, -(n - n0), h]);
  const gpkg = new GeoPackage(gpkgFile ?? findGpkg(path.join(cacheDir, 'tlm')));
  const lvWaypoints = stages.flatMap(s => s.waypoints);
  const loaded = loadEdges(gpkg, { waypoints: lvWaypoints }, 2500);
  const edges = loaded.edges.map(e => ({ ...e, pts: e.pts.map(p => (p.length > 2 ? local(p[0], p[1], p[2]) : local(p[0], p[1]))) }));
  let dem = new Dem(path.join(cacheDir, 'alti3d', '2m'));
  const lvBox = ([x0, z0, x1, z1]) => [x0 + e0, -z1 + n0, x1 + e0, -z0 + n0];
  const landmarks = JSON.parse(fs.readFileSync(landmarksFile, 'utf8')).map(l => ({ ...l, x: l.lv95[0] - e0, z: -(l.lv95[1] - n0) }));
  return {
    origin: ORIGIN,
    credit: CREDIT,
    sources: { tlm: TLM_NAME.replace(/^swisstlm3d_|_2056_5728\.gpkg\.zip$/g, ''), alti3d: [] },
    keptRoadClasses: null,
    stages: stages.map(s => ({ id: s.id, name: s.name, waypoints: s.waypoints.map(w => ({ id: w.id, name: w.name, e: w.e - e0, n: -(w.n - n0) })) })),
    edges,
    demAt: (x, z) => dem.sample(x + e0, n0 - z),
    // Makes sure every tile under the box is in the cache (downloading what is missing) and loaded.
    async prepare(box) {
      const [minE, minN, maxE, maxN] = lvBox(box);
      const missing = [];
      for (let kE = Math.floor(minE / 1000); kE <= Math.floor(maxE / 1000); kE++) {
        for (let kN = Math.floor(minN / 1000); kN <= Math.floor(maxN / 1000); kN++) if (!dem.hasTile(kE, kN)) missing.push([kE, kN]);
      }
      if (missing.length) {
        await ensureAlti3d(wgs84Bbox([minE, minN, maxE, maxN]), cacheDir);
        dem = new Dem(path.join(cacheDir, 'alti3d', '2m'));
      }
      await dem.preload([minE, minN, maxE, maxN]);
      this.sources.alti3d = [...new Set([...dem.files.values()].map(f => f.year))].sort();
    },
    coverPolys: box => coverPolysFromRows(gpkg.query('tlm_bb_bodenbedeckung', lvBox(box)), ([e, n]) => [e - e0, -(n - n0)]),
    // The mountains beyond far.bin (farland.mjs), or null when the cache has no 50 m heights
    farLand(far, log) {
      return buildFarLand(far, { cacheDir, origin: ORIGIN, log, polysIn: box => coverPolysFromRows(gpkg.query('tlm_bb_bodenbedeckung', lvBox(box)), ([e, n]) => [e - e0, -(n - n0)]) });
    },
    buildings(samples) {
      const box = [Math.min(...samples.x) - 250, Math.min(...samples.z) - 250, Math.max(...samples.x) + 250, Math.max(...samples.z) + 250];
      return buildingsFromRows(gpkg.query('tlm_bauten_gebaeude_footprint', lvBox(box)), ([e, n]) => [e - e0, -(n - n0)], samples);
    },
    // The mapped traffic areas (car parks, rest areas) round the ride, for places.mjs: the class, the public name
    // where the map has one, and the outer ring
    areas(samples) {
      const box = [Math.min(...samples.x) - 100, Math.min(...samples.z) - 100, Math.max(...samples.x) + 100, Math.max(...samples.z) + 100];
      const out = [];
      for (const row of gpkg.query('tlm_areale_verkehrsareal', lvBox(box))) {
        const polys = row.geom.type === 'Polygon' ? [row.geom.coordinates] : row.geom.type === 'MultiPolygon' ? row.geom.coordinates : [];
        for (const poly of polys) out.push({ cls: String(row.objektart), name: row.name ?? null, ring: poly[0].map(p => [p[0] - e0, -(p[1] - n0)]) });
      }
      return out;
    },
    landmarks,
    cobbles: JSON.parse(fs.readFileSync(structuresFile, 'utf8')).cobbles.map(c => ({ name: c.name, classes: c.classes, box: [c.lv95Box[0] - e0, -(c.lv95Box[3] - n0), c.lv95Box[2] - e0, -(c.lv95Box[1] - n0)] })),
    close: () => gpkg.close()
  };
}

// ---- the pipeline ----

function corridorTiles(world) {
  const tiles = new Set();
  const mark = (x, z, reach) => {
    for (let tx = Math.floor((x - reach) / TILE_M); tx <= Math.floor((x + reach) / TILE_M); tx++) {
      for (let tz = Math.floor((z - reach) / TILE_M); tz <= Math.floor((z + reach) / TILE_M); tz++) tiles.add(`${tx},${tz}`);
    }
  };
  for (const e of world.edges) for (let i = 0; i < e.x.length; i += e.onRide ? 4 : 1) mark(e.x[i], e.z[i], e.onRide ? TILE_REACH_M : 0);
  return [...tiles].map(k => k.split(',').map(Number)).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

function structureRuns(samples) {
  const runs = [];
  const kindOf = f => (f & FLAG.tunnel ? 'tunnel' : f & FLAG.gallery ? 'gallery' : f & FLAG.bridge ? 'bridge' : null);
  for (let i = 0; i < samples.s.length;) {
    const kind = kindOf(samples.flags[i]);
    if (!kind) { i++; continue; }
    let j = i;
    while (j + 1 < samples.s.length && kindOf(samples.flags[j + 1]) === kind) j++;
    if (samples.s[j] - samples.s[i] >= MIN_STRUCTURE_M) runs.push({ kind, s0: Math.round(samples.s[i] * 10) / 10, s1: Math.round(samples.s[j] * 10) / 10 });
    i = j + 1;
  }
  return runs;
}

// The ride is resampled as one line and cut at the graph nodes, so that a bend that runs across a node is not broken
// by it. The nodes the ride uses move onto the new line (by about a metre or two), and the edges that meet there
// follow. An edge that the ride uses twice keeps the samples of its first use.
function resampleRide(edges, ride, nodes) {
  const line = [];
  const bounds = [];
  let arc = 0;
  ride.forEach((use, k) => {
    const pts = use.dir === 1 ? edges[use.edgeId].srcPts : [...edges[use.edgeId].srcPts].reverse();
    pts.forEach((p, i) => { if (k === 0 || i > 0) line.push(p); });
    arc += edges[use.edgeId].srcCum.at(-1);
    bounds.push(arc);
  });
  const r = resampleLine(line, bounds.slice(0, -1));
  const done = new Set();
  const legs = { heldHairpins: r.hairpins.length, squeezed: r.squeezed };
  const moved = new Set();
  ride.forEach((use, k) => {
    const e = edges[use.edgeId];
    const seg = r.segments[k];
    const from = use.dir === 1 ? e.a : e.b, to = use.dir === 1 ? e.b : e.a;
    for (const [node, i] of [[from, 0], [to, seg.x.length - 1]]) {
      if (moved.has(node)) continue;
      moved.add(node);
      nodes[node].x = seg.x[i];
      nodes[node].z = seg.z[i];
    }
    if (done.has(use.edgeId)) return;
    done.add(use.edgeId);
    const start = k === 0 ? 0 : bounds[k - 1], len = e.srcCum.at(-1);
    const n = seg.x.length;
    const order = use.dir === 1 ? [...Array(n).keys()] : [...Array(n).keys()].reverse();
    e.x = Float64Array.from(order, i => seg.x[i]);
    e.z = Float64Array.from(order, i => seg.z[i]);
    e.heading = Float64Array.from(order, i => { const h = seg.heading[i] + (use.dir === 1 ? 0 : Math.PI); return Math.atan2(Math.sin(h), Math.cos(h)); });
    e.srcS = Float64Array.from(order, i => Math.max(0, Math.min(len, use.dir === 1 ? seg.srcS[i] - start : len - (seg.srcS[i] - start))));
    e.spacing = seg.spacing;
    e.minRadius = seg.minRadius;
    e.fillets = r.fillets.filter(f => f.s1 >= start && f.s0 <= start + len).map(f => {
      const a = Math.max(f.s0, start) - start, b = Math.min(f.s1, start + len) - start;
      return { ...f, s0: Math.round((use.dir === 1 ? a : len - b) * 10) / 10, s1: Math.round((use.dir === 1 ? b : len - a) * 10) / 10 };
    });
  });
  // Side edges that end at a node follow it.
  for (const e of edges) {
    if (e.onRide) continue;
    for (const [end, node] of [[0, e.a], [e.srcPts.length - 1, e.b]]) if (moved.has(node)) { e.srcPts[end][0] = nodes[node].x; e.srcPts[end][1] = nodes[node].z; }
  }
  return legs;
}

export async function buildWorld(source, { stationSpacingM = 2000, log = () => {} } = {}) {
  const g = buildCorridorGraph({ edges: source.edges, stages: source.stages });
  const edges = g.edges.filter(e => e.onRide || e.length >= 1);
  // What the corridor held before stubs under 1 m were dropped: source edges (inspect.mjs counts those) and stubs
  const corridor = { sourceEdges: new Set(g.edges.map(e => e.fid ?? `p${e.pieceId}`)).size, stubsDropped: g.edges.length - edges.length };
  // Dropping a side edge changes ids, so renumber and fix the ride's references.
  const remap = new Map(edges.map((e, i) => [e.id, i]));
  edges.forEach((e, i) => { e.id = i; });
  const ride = g.ride.map(u => ({ ...u, edgeId: remap.get(u.edgeId) }));

  const stats = { fillets: 0, minRadiusM: Infinity, demOverM: 0, demP99M: 0, demSamples: 0 };
  for (const e of edges) { e.srcCum = polylineLengths(e.srcPts); e.width = null; }
  const legs = resampleRide(edges, ride, g.nodes);
  Object.assign(stats, legs);
  log(`legs: ${legs.heldHairpins} stacked hairpins held to R_HAIRPIN, ${legs.squeezed.length} legs nearer each other than mapped`);
  for (const e of edges) {
    if (!e.onRide) {
      const r = resampleEdge(e.srcPts);
      Object.assign(e, { x: r.x, z: r.z, heading: r.heading, srcS: r.srcS, spacing: r.spacing, fillets: r.fillets, minRadius: r.minRadius });
    }
    e.width = new Float32Array(e.x.length).fill(e.onRide ? RIDE_WIDTH_M : classWidth(e.cls));
    e.length = 0;
    for (let i = 1; i < e.x.length; i++) e.length += Math.hypot(e.x[i] - e.x[i - 1], e.z[i] - e.z[i - 1]);
    stats.fillets += e.fillets.length;
  }

  const tileList = corridorTiles({ edges });
  const box = [
    Math.min(...tileList.map(t => t[0])) * TILE_M - FAR_MARGIN_M, Math.min(...tileList.map(t => t[1])) * TILE_M - FAR_MARGIN_M,
    (Math.max(...tileList.map(t => t[0])) + 1) * TILE_M + FAR_MARGIN_M, (Math.max(...tileList.map(t => t[1])) + 1) * TILE_M + FAR_MARGIN_M
  ];
  await source.prepare(box);
  const demAt = source.demAt;

  for (const e of edges) {
    profileEdge(e, demAt);
    if (e.onRide) {
      for (const c of source.cobbles ?? []) {
        if (!c.classes.includes(e.cls)) continue;
        e.flags = e.flags.map((f, i) => (e.x[i] >= c.box[0] && e.x[i] <= c.box[2] && e.z[i] >= c.box[1] && e.z[i] <= c.box[3] ? f | FLAG.cobbles : f));
      }
    }
  }
  reconcileNodes(edges, g.nodes);
  stats.crestMoveM = limitRideCrests(edges, ride, g.nodes);
  // Where another piece of road comes within the drawn band, the ride narrows toward its mapped width (widths.mjs)
  const narrow = narrowRide(edges, ride);
  stats.narrowestRideM = narrow.narrowest.widthM;
  stats.narrowestRideS = narrow.narrowest.s;
  stats.narrowedSamples = narrow.narrowed;
  log(`widths: ${narrow.narrowed} ride samples narrowed, the narrowest ${narrow.narrowest.widthM} m at s ${narrow.narrowest.s}`);
  const gaps = edges.filter(e => e.onRide).flatMap(e => demGaps(e, demAt));
  const dem = summariseGaps(gaps);
  Object.assign(stats, { demOverM: dem.over, demSamples: dem.count, demP99M: dem.p99, demMaxM: dem.max });

  const degree = degreeOf(g.nodes, edges);
  const used = new Map();
  for (const u of ride) { const e = edges[u.edgeId]; for (const n of [e.a, e.b]) used.set(n, (used.get(n) ?? 0) + 1); }
  const nodes = g.nodes.map((n, i) => ({ ...n, degree: degree[i], flags: (degree[i] >= 3 ? NODE_FLAG.junction : 0) | (used.has(i) ? NODE_FLAG.onRide : 0) }));

  const samples = rideSamples(edges, ride);
  stats.minRadiusM = Math.min(...samples.radius.filter(Number.isFinite));
  let at = 0;
  const bounds = g.stageSteps.map(st => {
    const from = at;
    for (let k = st.from; k < st.to; k++) at += edges[ride[k].edgeId].length;
    return { id: st.id, from, to: at };
  });
  const junctions = buildJunctions({ nodes, edges, ride, degree, waypoints: source.stages.flatMap(s => s.waypoints) });
  const twice = new Set(junctions.filter(j => j.passes.length >= 2).map(j => j.node));
  nodes.forEach(n => { if (twice.has(n.id)) n.flags |= NODE_FLAG.usedTwice; });

  // The stopping places the map has beside the ride widen its verge there, before the land is carved (places.mjs)
  const mouths = mouthsOf(junctions, samples);
  const mapped = source.areas ? mapPlaces(source.areas(samples), samples, mouths, edges) : [];
  applyPads(edges, ride, mapped);

  const placed = placeStations(samples, bounds, junctions.flatMap(j => j.passes.map(p => p.sIn)), { spacingM: stationSpacingM, places: mapped });
  for (const d of placed.dropped) log(`station: no full roadworks site within reach of s ${Math.round(d.target)} in ${d.stage} (${d.reason}); no checkpoint there`);
  const stations = [];
  const stages = bounds.map((b, k) => {
    const picks = placed.perStage[k].s;
    const ids = picks.map((s, j) => {
      const prev = stations[stations.length - 1];
      if (prev && Math.abs(prev.s - s) < 0.01) return stations.length - 1;
      stations.push({ s, stage: b.id, kind: k === 0 && j === 0 ? 'start' : j === 0 ? 'boundary' : j === picks.length - 1 && k === bounds.length - 1 ? 'end' : j === picks.length - 1 ? 'boundary' : 'gate' });
      return stations.length - 1;
    });
    return { ...b, name: source.stages[k].name, gates: picks.length - 2, stationIds: ids, ...stageFloors(samples, picks) };
  });

  const tiles = new Map();
  const polys = source.coverPolys(box);
  const cover = rasterizeCover(polys, tileList);
  const bencher = createBencher({ edges, demAt, coverAt: coverLookup(cover) });
  let missing = 0;
  for (const [tx, tz] of tileList) { const t = bencher.tile(tx, tz); missing += t.missing; tiles.set(`${tx},${tz}`, t); }

  // Each checkpoint's roadworks, as far as the game may build them: the found places keep clear of them
  const junctionS = junctions.flatMap(j => j.passes.map(p => p.sIn));
  const works = stations.filter(st => st.kind === 'gate').map(st => ({ s0: st.s, s1: st.s + siteReach(samples, st.s, junctionS) }));
  const found = foundPlaces(samples, tiles, mouths, edges, mapped, works);
  // A found place is carved as a map place is: its pad goes on the ride's edges and the land is benched again (a tile
  // no pad reaches comes out the same bytes)
  if (applyPads(edges, ride, found)) {
    const carver = createBencher({ edges, demAt, coverAt: coverLookup(cover) });
    missing = 0;
    for (const [tx, tz] of tileList) { const t = carver.tile(tx, tz); missing += t.missing; tiles.set(`${tx},${tz}`, t); }
  }
  const places = numberPlaces([...mapped, ...found]);
  log(`places: ${mapped.length} from the map, ${places.length - mapped.length} found`);

  const far = (() => {
    const x0 = Math.floor(box[0] / FAR_CELL_M) * FAR_CELL_M, z0 = Math.floor(box[1] / FAR_CELL_M) * FAR_CELL_M;
    const nx = Math.ceil((box[2] - x0) / FAR_CELL_M) + 1, nz = Math.ceil((box[3] - z0) / FAR_CELL_M) + 1;
    const data = new Int16Array(nx * nz);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const h = demAt(x0 + i * FAR_CELL_M, z0 + j * FAR_CELL_M); data[j * nx + i] = Number.isNaN(h) ? NO_DATA : Math.round(h); }
    return { x0, z0, nx, nz, cell: FAR_CELL_M, data };
  })();
  const farLand = source.farLand ? await source.farLand(far, log) : null;
  if (farLand) farLand.sink0 = horizonSinks(far, tiles, { tileM: TILE_M, tileN: TILE_N, cellM: TILE_M / (TILE_N - 1) });
  // Copernicus GLO-30 may be redistributed adapted, with its notice (licence Art. 6; .agent/system/world-data.md)
  const credit = farLand && farLand.copernicus ? `${source.credit} · Copernicus WorldDEM-30 © DLR e.V., © Airbus` : source.credit;
  const notice = farLand && farLand.copernicus ? COPERNICUS_NOTICE : null;

  const placedBuildings = clearOfRoads(source.buildings(samples), edges);
  const buildings = placedBuildings.buildings;
  log(`buildings: ${buildings.length} kept, ${placedBuildings.nudged} moved off a road, ${placedBuildings.dropped} left out`);
  const landmarks = [];
  for (const l of source.landmarks) {
    let best = null;
    for (let i = 0; i < samples.s.length; i++) {
      const d = Math.hypot(samples.x[i] - l.x, samples.z[i] - l.z);
      if (!best || d < best.d) best = { d, i };
    }
    if (!best || best.d > LANDMARK_SNAP_M) { log(`landmark ${l.name} is ${best ? Math.round(best.d) : '?'} m from the ride: not in this import`); continue; }
    // No placeholder ships: a landmark in the import is a model in assets/
    const problem = landmarkAssetProblem(l);
    if (problem) throw new Error(`landmark ${l.name}: ${problem}`);
    landmarks.push({ name: l.name, asset: l.asset, size: l.size ?? null, s: Math.round(samples.s[best.i] * 10) / 10, x: Math.round(l.x * 100) / 100, z: Math.round(l.z * 100) / 100, y: Math.round(samples.y[best.i] * 100) / 100, heading: Math.round(samples.heading[best.i] * 1e4) / 1e4 });
  }
  landmarks.sort((a, b) => a.s - b.s);

  return {
    origin: source.origin, credit, notice, sources: farLand ? { ...source.sources, far: farLand.copernicus ? ['alti3d', 'copernicus-glo30'] : ['alti3d'] } : source.sources, spacingM: 4, stationSpacingM, keptRoadClasses: source.keptRoadClasses ?? [...new Set(edges.map(e => e.cls))].sort(),
    nodes, edges, ride, junctions, stages, stations, tiles, cover, far, farLand, buildings, landmarks, places, structures: structureRuns(samples),
    samples, stats: { ...stats, corridor, tilesMissingHeight: missing, droppedStations: placed.dropped, maxStationGapM: placed.maxGapM, snaps: g.snaps }
  };
}

// Why a landmark's asset cannot be drawn, or null: it must name a .glb model under assets/ that exists, with the
// footprint it is placed by (`size`, metres along, up and across); "box" and any other placeholder are refused
export function landmarkAssetProblem(l, repoRoot = REPO_ROOT) {
  if (typeof l.asset !== 'string' || !/^assets\/[\w/.-]+\.glb$/.test(l.asset)) return `asset ${JSON.stringify(l.asset)} is not a model in assets/ (a placeholder box is never drawn)`;
  if (!fs.existsSync(path.join(repoRoot, l.asset))) return `asset ${l.asset} does not exist`;
  if (!Array.isArray(l.size) || l.size.length !== 3 || !l.size.every(v => Number.isFinite(v) && v > 0)) return `size ${JSON.stringify(l.size)} is not a footprint of three positive metres`;
  return null;
}

// ---- command line ----

function parseArgs(argv) {
  const opt = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) throw new Error(`unexpected argument ${argv[i]}`);
    const key = argv[i].slice(2);
    opt[key] = ['synthetic'].includes(key) ? true : argv[++i];
  }
  return opt;
}

export async function main(argv) {
  const opt = parseArgs(argv);
  const log = m => console.error(m);
  const out = path.resolve(opt.out ?? (opt.synthetic ? path.join(REPO_ROOT, 'tests', 'fixtures', 'world', 'mini') : 'world'));
  let source, spacing;
  if (opt.synthetic) {
    source = syntheticSource();
    spacing = Number(opt.spacing ?? 1000);
  } else {
    if (!opt.stages) throw new Error('--stages <ids|all> is required');
    let cacheDir;
    try { cacheDir = resolveCacheDir(opt.cache ? { ...process.env, TWISTY_WORLD_CACHE: opt.cache } : process.env); } catch (err) { throw new Error(`cache must be outside the repo (${err.message})`); }
    const route = JSON.parse(fs.readFileSync(path.join(HERE, 'route.json'), 'utf8'));
    source = await loadTlmSource({ stages: stageDefs(route, opt.stages.split(',')), cacheDir });
    spacing = Number(opt.spacing ?? 2000);
  }
  const world = await buildWorld(source, { stationSpacingM: spacing, log });
  source.close?.();
  fs.mkdirSync(out, { recursive: true });
  const files = writeWorld(world, out);
  const courses = path.resolve(opt.courses ?? (opt.synthetic ? path.join(out, 'world-courses.json') : path.join(REPO_ROOT, 'functions', 'world-courses.json')));
  writeCourses(world, courses, readBoardVersions());
  const bytes = [...files.values()].reduce((p, b) => p + b.length, 0);
  log(`wrote ${files.size} files, ${(bytes / 1e6).toFixed(2)} MB to ${out}; courses to ${courses}`);
  return world;
}

// tools/world/boards.json (R6) holds the version of each board; until it exists every board is version 1.
function readBoardVersions() {
  const file = path.join(HERE, 'boards.json');
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(Object.entries(JSON.parse(fs.readFileSync(file, 'utf8'))).map(([id, v]) => [id, v.version]));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(err => {
    console.error(err.message);
    process.exit(err instanceof GraphGapError ? 4 : 2);
  });
}
