// Checks of the committed world data (P3, P4, P5, P17, P22 and the stacked-leg gate).
//   node tools/world/verify.mjs <fidelity|hairpins|elevation|size|graph|stacked|stations|crests|all> --stages <ids|all>
//        [--world world] [--synthetic] [--cache <dir>]
// fidelity, elevation and graph rebuild the world from the cache and compare it with the files in --world.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeWorld } from './encode.mjs';
import { R_MIN, nearestOnPolyline, polylineLengths } from './resample.mjs';
import { rideSamples, placeStations } from './stations.mjs';
import { ROOFED, CREST_MIN_MPS, verticalCurvature } from './profile.mjs';
import { buildReport } from './inspect.mjs';
import { GeoPackage } from './gpkg.mjs';
import { findGpkg } from './cache.mjs';
import { scopedRoute } from './stages.mjs';
import { TILE_M, CELL_M, TILE_N, ZONE } from './bench.mjs';
import { buildWorld, loadTlmSource, stageDefs } from './import.mjs';
import { syntheticSource } from './synthetic.mjs';
import { resolveCacheDir } from './cache.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');

export const LIMITS = Object.freeze({
  worldBytes: 28 * 1024 * 1024, fileBytes: 256 * 1024, farBytes: 2 * 1024 * 1024, sliceBytes: 3.5 * 1024 * 1024,
  fidelityM: 1.5, lengthRatio: 0.02, hairpinMin: 20, tightHairpinMin: 10, tightHairpinRadiusM: 25,
  gradeMax: 0.16, demP99M: 4, summitY: [2090, 2115], startY: [1120, 1200], stackedPairM: 40, stackedMinDs: 100, radiusTolerance: 0.995
});

const check = (name, ok, details) => ({ name, ok, details });

// maxBankM is the cut rule's cap on banked progress allowance (R3). js/world/physics.js owns it once that file exists.
export function readMaxBankM(repoRoot = REPO_ROOT) {
  const file = path.join(repoRoot, 'js', 'world', 'physics.js');
  if (!fs.existsSync(file)) return 40;
  const m = /\bmaxBankM\b[^0-9\n]*([0-9]+(?:\.[0-9]+)?)/.exec(fs.readFileSync(file, 'utf8'));
  return m ? Number(m[1]) : 40;
}

const rideOf = world => rideSamples(world.edges, world.ride.path);

export function checkFidelity(decoded, built) {
  const problems = [];
  let worstOutside = 0;
  const fillets = [];
  built.edges.forEach((be, id) => {
    if (!be.onRide) return;
    const de = decoded.edges[id];
    const cum = polylineLengths(be.srcPts);
    // Fillet spans, widened by 10 m, are exempt from the 1.5 m rule and listed instead. Each must be explained by a
    // bend that was tightened to R_MIN.
    const inFillet = arc => be.fillets.some(f => arc >= f.s0 - 10 && arc <= f.s1 + 10);
    for (const f of be.fillets) if (!f.explained) problems.push(`edge ${id}: a ${f.sagM} m gap at ${f.s0}-${f.s1} m has no tightened bend near it`);
    for (let i = 0; i < de.x.length; i++) {
      const hit = nearestOnPolyline(be.srcPts, cum, de.x[i], de.z[i], Math.max(0, be.srcS[i] - 60), be.srcS[i] + 60);
      if (!inFillet(hit.arc)) worstOutside = Math.max(worstOutside, hit.dist);
    }
    for (const f of be.fillets) fillets.push({ edge: id, ...f });
  });
  let source = 0, ridden = 0;
  for (const use of decoded.ride.path) {
    source += polylineLengths(built.edges[use.edgeId].srcPts).at(-1);
    ridden += decoded.edges[use.edgeId].length;
  }
  const ratio = Math.abs(ridden - source) / source;
  if (worstOutside > LIMITS.fidelityM) problems.push(`${worstOutside.toFixed(2)} m from the mapped line outside a fillet (limit ${LIMITS.fidelityM})`);
  if (ratio > LIMITS.lengthRatio) problems.push(`ride length ${ridden.toFixed(0)} m against ${source.toFixed(0)} m mapped (${(ratio * 100).toFixed(2)}%, limit ${LIMITS.lengthRatio * 100}%)`);
  return check('fidelity', problems.length === 0, { worstOutsideFilletM: Math.round(worstOutside * 100) / 100, lengthRatioPct: Math.round(ratio * 1e4) / 100, fillets, problems });
}

// Hairpins: a heading change of 150 degrees or more within 80 m of s.
export function findHairpins(samples) {
  const unwrapped = new Float64Array(samples.s.length);
  for (let i = 1; i < unwrapped.length; i++) {
    let d = samples.heading[i] - samples.heading[i - 1];
    d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI;
    unwrapped[i] = unwrapped[i - 1] + d;
  }
  const found = [];
  let j = 0;
  for (let i = 0; i < unwrapped.length; i++) {
    while (samples.s[j] < samples.s[i] - 80) j++;
    let lo = Infinity, hi = -Infinity;
    for (let k = j; k <= i; k++) { lo = Math.min(lo, unwrapped[k]); hi = Math.max(hi, unwrapped[k]); }
    if (hi - lo < (150 * Math.PI) / 180) continue;
    // Windows that hit one after another belong to one hairpin.
    const last = found[found.length - 1];
    if (last && i - last.hit <= 2) { last.s1 = samples.s[i]; last.i1 = i; last.hit = i; } else found.push({ s0: samples.s[j], s1: samples.s[i], i0: j, i1: i, hit: i });
  }
  return found.map(h => {
    let min = Infinity;
    for (let k = Math.max(1, h.i0); k <= Math.min(samples.s.length - 2, h.i1); k++) min = Math.min(min, samples.radius[k]);
    return { s0: Math.round(h.s0), s1: Math.round(h.s1), minRadiusM: Math.round(min * 100) / 100 };
  });
}

export function checkHairpins(decoded) {
  const samples = rideOf(decoded);
  const hairpins = findHairpins(samples);
  const minRadius = Math.min(...samples.radius.filter(Number.isFinite));
  const tight = hairpins.filter(h => h.minRadiusM <= LIMITS.tightHairpinRadiusM).length;
  const problems = [];
  if (hairpins.length < LIMITS.hairpinMin) problems.push(`${hairpins.length} hairpins (need ${LIMITS.hairpinMin})`);
  if (tight < LIMITS.tightHairpinMin) problems.push(`${tight} hairpins at ${LIMITS.tightHairpinRadiusM} m or less (need ${LIMITS.tightHairpinMin})`);
  if (minRadius < R_MIN * LIMITS.radiusTolerance) problems.push(`tightest centreline radius ${minRadius.toFixed(2)} m, below R_MIN ${R_MIN}`);
  return check('hairpins', problems.length === 0, { hairpins: hairpins.length, tight, minRadiusM: Math.round(minRadius * 100) / 100, rMin: R_MIN, problems });
}

export function checkElevation(decoded, built, { slice = null } = {}) {
  const samples = rideOf(decoded);
  const problems = [];
  let grade = 0;
  for (let i = 0, j = 0; i < samples.s.length; i++) {
    while (samples.s[i] - samples.s[j] > 40) j++;
    if (samples.s[i] - samples.s[j] > 30) grade = Math.max(grade, Math.abs(samples.y[i] - samples.y[j]) / (samples.s[i] - samples.s[j]));
  }
  const startY = samples.y[0], endY = samples.y[samples.y.length - 1];
  if (slice === 'tremola') {
    if (!(startY >= LIMITS.startY[0] && startY <= LIMITS.startY[1])) problems.push(`start y ${startY.toFixed(1)} outside ${LIMITS.startY}`);
    if (!(endY >= LIMITS.summitY[0] && endY <= LIMITS.summitY[1])) problems.push(`summit y ${endY.toFixed(1)} outside ${LIMITS.summitY}`);
  }
  if (grade > LIMITS.gradeMax) problems.push(`grade ${(grade * 100).toFixed(1)}% over a 40 m window (limit ${LIMITS.gradeMax * 100}%)`);
  if (built.stats.demP99M > LIMITS.demP99M) problems.push(`DEM deviation p99 ${built.stats.demP99M.toFixed(2)} m (limit ${LIMITS.demP99M})`);
  return check('elevation', problems.length === 0, { startY: Math.round(startY * 10) / 10, endY: Math.round(endY * 10) / 10, maxGradePct: Math.round(grade * 1000) / 10, demP99M: Math.round(built.stats.demP99M * 100) / 100, demOverLimit: built.stats.demOverM, problems });
}

export function checkSize(dir, { slice } = {}) {
  const sizes = [];
  const walk = d => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else sizes.push([path.relative(dir, p), fs.statSync(p).size]);
    }
  };
  walk(dir);
  const total = sizes.reduce((p, [, n]) => p + n, 0);
  const problems = [];
  const isSlice = slice ?? (fs.existsSync(path.join(dir, 'manifest.json')) && JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'))).stages.length < 14);
  if (total > LIMITS.worldBytes) problems.push(`${total} bytes in all (limit ${LIMITS.worldBytes})`);
  if (isSlice && total > LIMITS.sliceBytes) problems.push(`${total} bytes for a slice (limit ${LIMITS.sliceBytes})`);
  for (const [name, n] of sizes) {
    const limit = name === 'far.bin' ? LIMITS.farBytes : LIMITS.fileBytes;
    if (n > limit) problems.push(`${name} is ${n} bytes (limit ${limit})`);
    if (/\.(gpkg|tif|tiff|zip)$/i.test(name)) problems.push(`${name} is a raw download`);
  }
  return check('size', problems.length === 0, { files: sizes.length, totalBytes: total, slice: isSlice, largest: [...sizes].sort((a, b) => b[1] - a[1]).slice(0, 3), problems });
}

// The graph in the files is the graph the cache gives, and the ride is one continuous path through it.
export function checkGraph(decoded, built, { corridorEdges = null } = {}) {
  const problems = [];
  if (decoded.nodes.length !== built.nodes.length) problems.push(`${decoded.nodes.length} nodes in the files, ${built.nodes.length} built`);
  if (decoded.edges.length !== built.edges.length) problems.push(`${decoded.edges.length} edges in the files, ${built.edges.length} built`);
  let worst = 0;
  decoded.edges.forEach((e, i) => { if (built.edges[i]) worst = Math.max(worst, Math.abs(e.length - built.edges[i].length)); });
  if (worst > 0.01) problems.push(`an edge length differs by ${worst.toFixed(3)} m (limit 0.01)`);
  let at = null;
  decoded.ride.path.forEach((use, k) => {
    const e = decoded.edges[use.edgeId];
    const start = use.dir === 1 ? e.a : e.b, end = use.dir === 1 ? e.b : e.a;
    if (at !== null && start !== at) problems.push(`the ride is not continuous at use ${k}`);
    at = end;
  });
  if (decoded.junctions.length < 1) problems.push('no ride junction');
  // The corridor the graph keeps is the corridor inspect.mjs counts for the same stages: every source edge in it, less
  // the stubs under 1 m the importer drops. `corridorEdges` is inspect's count; null skips the comparison (synthetic).
  const kept = built.stats?.corridor ?? { sourceEdges: null, stubsDropped: null };
  if (corridorEdges !== null && kept.sourceEdges !== corridorEdges) problems.push(`the graph holds ${kept.sourceEdges} source edges of the corridor, inspect counts ${corridorEdges}`);
  return check('graph', problems.length === 0, { corridorEdges, sourceEdges: kept.sourceEdges, stubsDropped: kept.stubsDropped, nodes: decoded.nodes.length, edges: decoded.edges.length, rideUses: decoded.ride.path.length, junctions: decoded.junctions.length, maxLengthDiffM: Math.round(worst * 1e4) / 1e4, problems });
}

// Station rule (R3): spacing, stage boundaries as stations, the placement rule itself, and clearance. A real station
// (a gate) keeps STATION_CLEAR_M from a junction and from a structure; that is a failure. Where even the best place in
// its window has a bend under RADIUS_MIN_M within 50 m, the station is listed in `tightBend` (reported, not failed).
export const STATION_CLEAR_M = 80;
export const RADIUS_MIN_M = 60;
export function checkStations(decoded) {
  const problems = [];
  const spacing = decoded.manifest.stationSpacingM;
  const samples = rideOf(decoded);
  const junctionS = decoded.junctions.flatMap(j => j.passes.map(p => p.sIn));
  const bounds = decoded.manifest.stages.map(st => ({ id: st.id, from: st.from, to: st.to }));
  const tightBend = [], tooNear = [];
  const stationS = id => decoded.ride.stations[id].s;
  const near = (list, s) => list.reduce((m, v) => Math.min(m, Math.abs(v - s)), Infinity);
  const windowOf = (s, r, test) => {
    let hit = Infinity;
    for (let i = 0; i < samples.s.length; i++) {
      if (samples.s[i] < s - r) continue;
      if (samples.s[i] > s + r) break;
      hit = Math.min(hit, test(i));
    }
    return hit;
  };
  decoded.manifest.stages.forEach((st, k) => {
    const s = st.stations.map(stationS);
    if (Math.abs(s[0] - st.from) > 0.01 || Math.abs(s[s.length - 1] - st.to) > 0.01) problems.push(`${st.id}: the stage boundaries are not stations`);
    for (let j = 1; j < s.length; j++) {
      const gap = s[j] - s[j - 1];
      if (gap > 2 * spacing) problems.push(`${st.id}: gap ${gap.toFixed(0)} m over ${2 * spacing} m`);
      if (s.length > 2 && gap < spacing / 2 - 0.5) problems.push(`${st.id}: gap ${gap.toFixed(0)} m under ${spacing / 2} m`);
    }
    if (s.length - 2 !== st.gates) problems.push(`${st.id}: ${s.length - 2} interior stations, gates ${st.gates}`);
    // The rule as the importer states it: the same picks come out of the decoded ride
    const again = placeStations(samples, [bounds[k]], junctionS, { spacingM: spacing }).perStage[0].s;
    if (again.length !== s.length || again.some((v, j) => Math.abs(v - s[j]) > 0.5)) problems.push(`${st.id}: the stations are not where the placement rule puts them`);
    s.slice(1, -1).forEach((at, j) => {
      const junction = near(junctionS, at);
      const structure = windowOf(at, STATION_CLEAR_M, i => (samples.flags[i] & ROOFED ? Math.abs(samples.s[i] - at) : Infinity));
      if (junction < STATION_CLEAR_M) problems.push(`${st.id}: station ${j + 1} at s ${at.toFixed(1)} is ${junction.toFixed(1)} m from a junction (limit ${STATION_CLEAR_M} m)`);
      if (structure < STATION_CLEAR_M) problems.push(`${st.id}: station ${j + 1} at s ${at.toFixed(1)} is ${structure.toFixed(1)} m from a structure (limit ${STATION_CLEAR_M} m)`);
      tooNear.push({ s: Math.round(at * 10) / 10, junctionM: Math.round(junction * 10) / 10, structureM: structure === Infinity ? null : Math.round(structure * 10) / 10 });
      const radius = windowOf(at, 50, i => samples.radius[i]);
      if (radius < RADIUS_MIN_M) tightBend.push({ stage: st.id, s: Math.round(at * 10) / 10, minRadius50m: Math.round(radius * 10) / 10 });
    });
  });
  return check('stations', problems.length === 0, { stations: decoded.ride.stations.length, tightBend, problems });
}

// Crests: the lift-off speed sqrt(g / kappa) at each convex sample of the ride, kappa over the +-CREST_WINDOW_M window
// of profile.mjs. The world has no airborne state, so the smallest must be CREST_MIN_MPS.
export function checkCrests(decoded) {
  const samples = rideOf(decoded);
  const crests = [];
  for (let i = 0; i < samples.s.length; i++) {
    const kappa = verticalCurvature(samples.s, samples.y, i);
    if (kappa !== null && kappa < 0) crests.push({ s: Math.round(samples.s[i] * 10) / 10, liftoffMps: Math.round(Math.sqrt(9.81 / -kappa) * 10) / 10 });
  }
  crests.sort((p, q) => p.liftoffMps - q.liftoffMps);
  const lowest = crests.slice(0, 5);
  const problems = lowest.length && lowest[0].liftoffMps < CREST_MIN_MPS ? [`the lowest lift-off speed is ${lowest[0].liftoffMps} m/s at s ${lowest[0].s}, under ${CREST_MIN_MPS} m/s`] : [];
  return check('crests', problems.length === 0, { crests: crests.length, minLiftoffMps: lowest[0]?.liftoffMps ?? null, lowest, problems });
}

function zoneAt(decoded, x, z) {
  const tx = Math.floor(x / TILE_M), tz = Math.floor(z / TILE_M);
  const t = decoded.tiles.get(`${tx},${tz}`);
  if (!t) return null;
  const i = Math.min(TILE_N - 1, Math.round((x - tx * TILE_M) / CELL_M)), j = Math.min(TILE_N - 1, Math.round((z - tz * TILE_M) / CELL_M));
  return t.zones[j * TILE_N + i];
}

// Stacked legs: ride samples within 40 m horizontally and more than 100 m apart along the ride. Reports the ground
// slope between each pair and whether a wall lies between. The gate: the closest pair in s must be further apart
// than twice the cap on banked allowance, or a banked cut could cross from one leg to the other.
export function checkStacked(decoded, { maxBankM = readMaxBankM() } = {}) {
  const samples = rideOf(decoded);
  const pairs = [];
  const cell = LIMITS.stackedPairM;
  const grid = new Map();
  for (let i = 0; i < samples.s.length; i++) {
    const k = `${Math.floor(samples.x[i] / cell)},${Math.floor(samples.z[i] / cell)}`;
    (grid.get(k) ?? grid.set(k, []).get(k)).push(i);
  }
  const seen = new Set();
  for (let i = 0; i < samples.s.length; i += 2) {
    const cx = Math.floor(samples.x[i] / cell), cz = Math.floor(samples.z[i] / cell);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      for (const j of grid.get(`${cx + a},${cz + b}`) ?? []) {
        if (j <= i || samples.s[j] - samples.s[i] <= LIMITS.stackedMinDs) continue;
        const run = Math.hypot(samples.x[j] - samples.x[i], samples.z[j] - samples.z[i]);
        if (run > cell) continue;
        const key = `${Math.floor(i / 25)}:${Math.floor(j / 25)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        let wall = false;
        for (let t = 0; t <= 1.0001; t += CELL_M / Math.max(run, CELL_M)) {
          if (zoneAt(decoded, samples.x[i] + (samples.x[j] - samples.x[i]) * t, samples.z[i] + (samples.z[j] - samples.z[i]) * t) === ZONE.wall) wall = true;
        }
        pairs.push({ s0: Math.round(samples.s[i]), s1: Math.round(samples.s[j]), dsM: Math.round(samples.s[j] - samples.s[i]), apartM: Math.round(run * 10) / 10, slope: Math.round((Math.abs(samples.y[j] - samples.y[i]) / Math.max(run, 1)) * 100) / 100, wall });
      }
    }
  }
  const minStackedDs = pairs.length ? Math.min(...pairs.map(p => p.dsM)) : Infinity;
  const problems = [];
  if (!(minStackedDs > 2 * maxBankM)) problems.push(`closest stacked pair is ${minStackedDs} m apart in s; the cap on banked allowance is ${maxBankM} m, so it must exceed ${2 * maxBankM} m`);
  return check('stacked', problems.length === 0, { pairs: pairs.length, minStackedDs, maxBankM, steepest: [...pairs].sort((p, q) => q.slope - p.slope).slice(0, 5), withWall: pairs.filter(p => p.wall).length, problems });
}

async function sourceFor(opt) {
  if (opt.synthetic) return { source: syntheticSource(), spacing: 500 };
  const route = JSON.parse(fs.readFileSync(path.join(HERE, 'route.json'), 'utf8'));
  const cacheDir = resolveCacheDir(opt.cache ? { ...process.env, TWISTY_WORLD_CACHE: opt.cache } : process.env);
  return { source: await loadTlmSource({ stages: stageDefs(route, opt.stages.split(',')), cacheDir }), spacing: 1000 };
}

// inspect.mjs's count of the corridor edges for the same stages
function inspectedCorridorEdges(opt) {
  const route = scopedRoute(JSON.parse(fs.readFileSync(path.join(HERE, 'route.json'), 'utf8')), opt.stages.split(','));
  const cacheDir = resolveCacheDir(opt.cache ? { ...process.env, TWISTY_WORLD_CACHE: opt.cache } : process.env);
  const gpkg = new GeoPackage(findGpkg(path.join(cacheDir, 'tlm')));
  try { return buildReport(gpkg, route).corridorEdges.total.count; } finally { gpkg.close(); }
}

export async function main(argv) {
  const [cmd = 'all', ...rest] = argv;
  const opt = {};
  for (let i = 0; i < rest.length; i++) opt[rest[i].slice(2)] = rest[i] === '--synthetic' ? true : rest[++i];
  const dir = path.resolve(opt.world ?? (opt.synthetic ? path.join(REPO_ROOT, 'tests', 'fixtures', 'world', 'mini') : path.join(REPO_ROOT, 'world')));
  const wanted = cmd === 'all' ? ['size', 'stations', 'hairpins', 'stacked', 'crests', 'fidelity', 'elevation', 'graph'] : [cmd];
  const decoded = wanted.some(c => c !== 'size') ? decodeWorld(dir) : null;
  let built = null;
  if (wanted.some(c => ['fidelity', 'elevation', 'graph'].includes(c))) {
    const { source, spacing } = await sourceFor(opt);
    built = await buildWorld(source, { stationSpacingM: spacing });
    source.close?.();
  }
  const slice = opt.stages === 'tremola' ? 'tremola' : null;
  const corridorEdges = wanted.includes('graph') && !opt.synthetic ? inspectedCorridorEdges(opt) : null;
  const runs = {
    size: () => checkSize(dir), stations: () => checkStations(decoded), crests: () => checkCrests(decoded), hairpins: () => checkHairpins(decoded), stacked: () => checkStacked(decoded),
    fidelity: () => checkFidelity(decoded, built), elevation: () => checkElevation(decoded, built, { slice }), graph: () => checkGraph(decoded, built, { corridorEdges })
  };
  const results = wanted.map(c => {
    if (!runs[c]) throw new Error(`unknown check ${c}`);
    return runs[c]();
  });
  for (const r of results) console.log(JSON.stringify({ ...r, ok: r.ok ? 'PASS' : 'FAIL' }));
  return results.every(r => r.ok);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(ok => process.exit(ok ? 0 : 1)).catch(err => { console.error(err.message); process.exit(2); });
}
