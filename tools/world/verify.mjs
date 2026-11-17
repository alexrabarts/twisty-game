// Checks of the committed world data (P3, P4, P5, P17, P22, the stacked-leg gate and floating roads).
//   node tools/world/verify.mjs <fidelity|hairpins|elevation|size|graph|stacked|stations|crests|buildings|floating|overlap|horizon|dem|all> --stages <ids|all>
//        [--world world] [--synthetic] [--cache <dir>]
// dem reads the DEM from the cache; fidelity, elevation and graph rebuild the world from the cache and compare it with the files in --world.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeWorld } from './encode.mjs';
import { R_MIN, R_HAIRPIN, nearestOnPolyline, polylineLengths } from './resample.mjs';
import { rideSamples, placeStations } from './stations.mjs';
import { ROOFED, CREST_MIN_MPS, verticalCurvature } from './profile.mjs';
import { buildReport } from './inspect.mjs';
import { GeoPackage } from './gpkg.mjs';
import { findGpkg } from './cache.mjs';
import { scopedRoute } from './stages.mjs';
import { TILE_M, CELL_M, TILE_N, ZONE, VERGE_M, JOIN_M, BATTER, EARTHWORK_M, segmentIndex, stripHalf } from './bench.mjs';
import { buildWorld, loadTlmSource, stageDefs } from './import.mjs';
import { syntheticSource } from './synthetic.mjs';
import { ROAD_CLEAR_M, roadBands } from './buildings.mjs';
import { resolveCacheDir } from './cache.mjs';
import { sampleGrid, bandHalf, minRideWidth, RIDE_WIDTH_M, END_JOIN_M, JUNCTION_M } from './widths.mjs';
import { drawnTileLow, horizonDrawnAt } from './farland.mjs';

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
  // The key itself (`maxBankM: 40`): the comment above it names maxBankM next to a 2.2 and was read as the value
  const m = /\bmaxBankM\s*:\s*([0-9]+(?:\.[0-9]+)?)/.exec(fs.readFileSync(file, 'utf8'));
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
  // No two legs of the ride nearer each other than the map has them (resample.mjs holds stacked hairpins to R_HAIRPIN)
  for (const q of built.stats.squeezed ?? []) problems.push(`legs at mapped ${q.a} and ${q.b} m ride ${q.rideM} m apart, mapped ${q.mappedM} m`);
  if (ratio > LIMITS.lengthRatio) problems.push(`ride length ${ridden.toFixed(0)} m against ${source.toFixed(0)} m mapped (${(ratio * 100).toFixed(2)}%, limit ${LIMITS.lengthRatio * 100}%)`);
  return check('fidelity', problems.length === 0, { worstOutsideFilletM: Math.round(worstOutside * 100) / 100, lengthRatioPct: Math.round(ratio * 1e4) / 100, heldHairpins: built.stats.heldHairpins ?? 0, squeezedLegs: (built.stats.squeezed ?? []).length, fillets, problems });
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
  // Under R_MIN only inside a hairpin (a stacked one, held to R_HAIRPIN by resample.mjs), and never under R_HAIRPIN
  if (minRadius < R_HAIRPIN * LIMITS.radiusTolerance) problems.push(`tightest centreline radius ${minRadius.toFixed(2)} m, below R_HAIRPIN ${R_HAIRPIN}`);
  const inHairpin = s => hairpins.some(h => s >= h.s0 - 8 && s <= h.s1 + 8);
  for (let i = 0; i < samples.s.length; i++) {
    if (samples.radius[i] < R_MIN * LIMITS.radiusTolerance && !inHairpin(samples.s[i])) { problems.push(`centreline radius ${samples.radius[i].toFixed(2)} m at s ${Math.round(samples.s[i])}, below R_MIN ${R_MIN} outside a hairpin`); break; }
  }
  const held = hairpins.filter(h => h.minRadiusM < R_MIN * LIMITS.radiusTolerance).length;
  return check('hairpins', problems.length === 0, { hairpins: hairpins.length, tight, held, minRadiusM: Math.round(minRadius * 100) / 100, rMin: R_MIN, rHairpin: R_HAIRPIN, problems });
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

// Buildings: no footprint closer than ROAD_CLEAR_M to the band of any road, ride or side edge. The stored box is
// rounded (1 mm, 1e-4 rad), so a box the importer set at the clearance may read a centimetre short of it.
export function checkBuildings(decoded, { clear = ROAD_CLEAR_M, slackM = 0.02 } = {}) {
  const bands = roadBands(decoded.edges);
  const near = [];
  let least = Infinity;
  for (const b of decoded.buildings) {
    const worst = bands.clearance(b);
    least = Math.min(least, worst.gap);
    if (worst.gap < clear - slackM) near.push({ x: Math.round(b.x), z: Math.round(b.z), w: b.w, d: b.d, gapM: Math.round(worst.gap * 100) / 100, edge: worst.edge, ride: worst.ride });
  }
  near.sort((p, q) => p.gapM - q.gapM);
  const problems = near.length ? [`${near.length} buildings stand within ${clear} m of a road band (worst ${near[0].gapM} m from edge ${near[0].edge})`] : [];
  return check('buildings', problems.length === 0, { buildings: decoded.buildings.length, clearM: clear, leastGapM: Math.round(least * 100) / 100, near: near.slice(0, 10), problems });
}

// Floating roads: the ground must meet every drawn road edge. For every ride and side-edge sample away from a
// structure (a bridge stands above the ground on purpose; a tunnel or gallery has its own walls), the height grid is
// read on the tile's drawn triangles at the carriageway edge, half way across the verge, at the verge's outer edge
// and just past it, on both sides. The ground may lie at most `below` under the road surface there and at most
// `above` over it. Two exceptions, both counted:
//   joined  a probe where another road at about its own height (JOIN_M) owns the ground: inside that road's drawn
//           strip, or within a triangle of it at a junction (the edges' ends meet). The bench gives the ride its own
//           carriageway and verge there, and the lower road the rest; the side road is held under the ride inside
//           the ride's band at runtime (WorldEnvironment holdSide)
//   walled  a probe beside a lower strand (another edge, or the same edge 16 m or more further along: the other side
//           of a hairpin) within wallReachM of its band, where the drawn triangles span both roads: the bench gives a
//           node that both strips claim to the lower road (no land over any road), so the ground under the upper edge
//           drops to that road's height and its fill and no further, and the runtime draws the face as a retaining wall (RoadMesh
//           skirt)
// The batter: on each side of every sample the land over the first batterReachM past the verge (1 m steps) may rise
// or fall no steeper than batterMax (the importer builds 1:1.5, BATTER; up to 1:1 where the ground needs it, plus the
// 8 m triangles' slack). A steeper side between two strands at two heights is a retaining
// wall (the upper road's: the runtime draws it with a parapet on top): counted as `walls` and listed as runs of the
// ride's s. Any other is `steep`.
// Across the carriageway (nine laterals, edge to edge) the ground must not stand more than `inside` over the road
// surface: the stored heights are rounded to 0.1 m, and the terrain is drawn TerrainMesh.SINK_M under them, so the
// drawn land is under the drawn road. A probe inside another road's strip at about its height is `joined`.
// From the carriageway's edge out the land may lie up to one 8 m triangle's fall at BATTER under the road
// (`apron`): the importer builds the least fill that meets the ground, not a shelf, and RoadMesh draws the fill from
// the verge's edge down to the land (world-floating checks that it closes).
// The worst gaps are listed with the ride's s (or the side edge and sample) and the side.
export const FLOATING = Object.freeze({ below: 0.3, above: 0.1, inside: 0.05, bendRadiusM: 20, batterReachM: 4, batterMax: 1.1, structureM: 8, wallReachM: 48 });

export function tileHeightAt(tiles, x, z) {
  const tx = Math.floor(x / TILE_M), tz = Math.floor(z / TILE_M);
  const t = tiles.get(`${tx},${tz}`);
  if (!t) return null;
  const fx = (x - tx * TILE_M) / CELL_M, fz = (z - tz * TILE_M) / CELL_M;
  const i = Math.max(0, Math.min(TILE_N - 2, Math.floor(fx))), j = Math.max(0, Math.min(TILE_N - 2, Math.floor(fz)));
  const u = fx - i, v = fz - j;
  const h = t.heights;
  const h00 = h[j * TILE_N + i], h10 = h[j * TILE_N + i + 1], h01 = h[(j + 1) * TILE_N + i], h11 = h[(j + 1) * TILE_N + i + 1];
  // The diagonal TerrainMesh and WorldGround split each cell on (01-10)
  return u + v <= 1 ? h00 + u * (h10 - h00) + v * (h01 - h00) : h11 + (1 - u) * (h01 - h11) + (1 - v) * (h10 - h11);
}

// The ride's wall samples as runs of s (side by side), and the side edges' as counts per edge
function wallRuns(walls) {
  const ride = walls.filter(w => w.s !== undefined).sort((p, q) => p.s - q.s);
  const runs = [];
  for (const w of ride) {
    const last = runs[runs.length - 1];
    if (last && w.s - last.s1 <= 12) { last.s1 = w.s; last.samples++; if (!last.sides.includes(w.side)) last.sides.push(w.side); } else runs.push({ s0: w.s, s1: w.s, samples: 1, sides: [w.side] });
  }
  const side = {};
  for (const w of walls) if (w.edge !== undefined) side[w.edge] = (side[w.edge] || 0) + 1;
  return { ride: runs, sideEdges: side };
}

export function checkFloating(world, { limits = FLOATING, ride = world.ride?.path ?? null, worst = 12 } = {}) {
  const { edges, tiles } = world;
  const index = segmentIndex(edges, limits.wallReachM);
  const rideS = new Map();
  if (ride) {
    let s = 0;
    for (const use of ride) {
      const e = edges[use.edgeId];
      if (!rideS.has(use.edgeId)) rideS.set(use.edgeId, { s0: s, dir: use.dir, n: e.x.length });
      s += e.length ?? 0;
    }
  }
  // A probe is `joined` where another road at about its height owns the ground: inside that road's drawn strip, or
  // anywhere in a junction (the two edges' ends meet within END_JOIN_M and the probe's sample is within JUNCTION_M of
  // that end) where the ground of that road reaches (its strip and one triangle beyond)
  const ends = e => [[e.x[0], e.z[0]], [e.x[e.x.length - 1], e.z[e.z.length - 1]]];
  const meet = (e, i, f) => ends(e).some(p => ends(f).some(q => Math.hypot(p[0] - q[0], p[1] - q[1]) <= END_JOIN_M && Math.hypot(e.x[i] - p[0], e.z[i] - p[1]) <= JUNCTION_M));
  // The ride is one road across its edges: two points of it are one piece of road within 2 cells of s
  const spacing = e => (e.length && e.x.length > 1 ? e.length / (e.x.length - 1) : 4);
  const rideAlong = (id, arc) => { const r = rideS.get(id); return r ? r.s0 + (r.dir === 1 ? arc : (r.n - 1) * spacing(edges[id]) - arc) : null; };
  const sameRoad = (id, i, c) => {
    if (c.edge === id) return Math.abs(c.arc - i * spacing(edges[id])) <= 2 * CELL_M;
    const a = rideAlong(id, i * spacing(edges[id])), b = rideAlong(c.edge, c.arc);
    return a !== null && b !== null && Math.abs(a - b) <= 2 * CELL_M;
  };
  const joined = (id, i, c) => !sameRoad(id, i, c) && c.edge !== id && Math.abs(c.y - edges[id].y[i]) <= JOIN_M
    && (c.d <= stripHalf(c.w) || (c.d <= stripHalf(c.w) + CELL_M * Math.SQRT2 && meet(edges[id], i, edges[c.edge])));
  // In a hairpin (a radius under limits.bendRadiusM within three samples) the road's height turns with it inside one triangle, and the bench
  // lowers the land until it stands over no point of the road: the edge may then lie the grade over one triangle's
  // width over the land (`bend`, drawn closed by the RoadMesh skirt)
  const radiusAt = (e, i) => {
    const a = Math.max(0, i - 2), b = Math.min(e.x.length - 1, i + 2);
    if (b - a < 2) return Infinity;
    const ax = e.x[a], az = e.z[a], bx = e.x[i], bz = e.z[i], cx = e.x[b], cz = e.z[b];
    const cross = Math.abs((bx - ax) * (cz - az) - (bz - az) * (cx - ax));
    return cross < 1e-9 ? Infinity : (Math.hypot(bx - ax, bz - az) * Math.hypot(cx - bx, cz - bz) * Math.hypot(cx - ax, cz - az)) / (2 * cross);
  };
  const bendSlack = (e, i) => {
    let radius = Infinity;
    for (let k = Math.max(0, i - 3); k <= Math.min(e.x.length - 1, i + 3); k++) radius = Math.min(radius, radiusAt(e, k));
    if (radius >= limits.bendRadiusM) return 0;
    const a = Math.max(0, i - 3), b = Math.min(e.x.length - 1, i + 3);
    let run = 0;
    for (let k = a; k < b; k++) run += Math.hypot(e.x[k + 1] - e.x[k], e.z[k + 1] - e.z[k]);
    return limits.below + (Math.abs(e.y[b] - e.y[a]) / Math.max(run, 1)) * CELL_M * Math.SQRT2;
  };
  const gaps = [];
  const counts = { probes: 0, inside: 0, batter: 0, structures: 0, joined: 0, walled: 0, walls: 0, steep: 0, bend: 0, apron: 0, below: 0, above: 0, overRoad: 0, missing: 0 };
  let worstBelow = 0, worstAbove = 0, worstOver = 0, worstSteep = 0;
  const over = [], steep = [], walls = [], bends = [];
  edges.forEach((e, id) => {
    const n = e.x.length;
    const roofed = new Uint8Array(n);
    const reach = Math.ceil(limits.structureM / (e.spacing ?? 4));
    for (let i = 0; i < n; i++) if (e.flags[i] & ROOFED) for (let k = Math.max(0, i - reach); k <= Math.min(n - 1, i + reach); k++) roofed[k] = 1;
    const arcOf = i => i * (e.length && n > 1 ? e.length / (n - 1) : 4);
    for (let i = 0; i < n; i++) {
      if (roofed[i]) { counts.structures++; continue; }
      const half = e.width[i] / 2;
      const cos = Math.cos(e.heading[i]), sin = Math.sin(e.heading[i]);
      // Inside the carriageway the ground is never over the road surface (the heights are stored to 0.1 m)
      for (const f of [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1]) {
        const x = e.x[i] + f * half * cos, z = e.z[i] - f * half * sin;
        const ground = tileHeightAt(tiles, x, z);
        counts.inside++;
        if (ground === null || ground - e.y[i] <= limits.inside) continue;
        const others = index.near(x, z);
        if (others.some(c => joined(id, i, c))) { counts.joined++; continue; }
        counts.overRoad++;
        worstOver = Math.max(worstOver, ground - e.y[i]);
        const r = rideS.get(id);
        const at = r ? { s: Math.round(r.s0 + (r.dir === 1 ? arcOf(i) : arcOf(r.n - 1 - i))) } : { edge: id, cls: e.cls, sample: i };
        over.push({ ...at, lateralM: Math.round(f * half * 100) / 100, overM: Math.round((ground - e.y[i]) * 100) / 100, x: Math.round(x), z: Math.round(z) });
      }
      // The batter: the land over the first BATTER_REACH_M past the verge rises or falls no steeper than BATTER,
      // unless a lower strand beside it makes it a retaining wall (`walls`)
      for (const side of [-1, 1]) {
        let steepest = 0, at = null;
        let last = tileHeightAt(tiles, e.x[i] + side * (half + VERGE_M) * cos, e.z[i] - side * (half + VERGE_M) * sin);
        for (let o = 1; o <= limits.batterReachM && last !== null; o++) {
          const x = e.x[i] + side * (half + VERGE_M + o) * cos, z = e.z[i] - side * (half + VERGE_M + o) * sin;
          const g = tileHeightAt(tiles, x, z);
          if (g === null) break;
          if (Math.abs(g - last) > steepest) { steepest = Math.abs(g - last); at = { x, z, g }; }
          last = g;
        }
        counts.batter++;
        if (steepest <= limits.batterMax) continue;
        const near = index.near(at.x, at.z);
        if (near.some(c => joined(id, i, c))) { counts.joined++; continue; }
        const r = rideS.get(id);
        const where = r ? { s: Math.round(r.s0 + (r.dir === 1 ? arcOf(i) : arcOf(r.n - 1 - i))) } : { edge: id, cls: e.cls, sample: i };
        const stacked = near.filter(c => !sameRoad(id, i, c) && (c.low < e.y[i] - limits.below || c.y > e.y[i] + limits.below));
        if (stacked.length) { counts.walls++; walls.push({ ...where, side: side > 0 ? 'right' : 'left', slope: Math.round(steepest * 100) / 100 }); continue; }
        counts.steep++;
        worstSteep = Math.max(worstSteep, steepest);
        steep.push({ ...where, side: side > 0 ? 'right' : 'left', slope: Math.round(steepest * 100) / 100, x: Math.round(at.x), z: Math.round(at.z) });
      }
      for (const side of [-1, 1]) {
        for (const o of [half, half + VERGE_M / 2, half + VERGE_M, half + VERGE_M + 0.25]) {
          const x = e.x[i] + side * o * cos, z = e.z[i] - side * o * sin;
          const ground = tileHeightAt(tiles, x, z);
          counts.probes++;
          if (ground === null) { counts.missing++; continue; }
          const gap = e.y[i] - ground;
          if (gap <= limits.below && gap >= -limits.above) continue;
          const others = index.near(x, z).filter(c => !sameRoad(id, i, c));
          if (others.some(c => joined(id, i, c))) { counts.joined++; continue; }
          const lower = others.filter(c => c.low < e.y[i] - limits.below);
          const r0 = rideS.get(id);
          const here = r0 ? { s: Math.round(r0.s0 + (r0.dir === 1 ? arcOf(i) : arcOf(r0.n - 1 - i))), side: side > 0 ? 'right' : 'left' } : null;
          if (gap > 0 && gap <= bendSlack(e, i)) { counts.bend++; if (here) bends.push(here); continue; }
          // On the fill side the 8 m triangles reach from the strip down the embankment: the land under the verge may
          // lie up to one triangle's fall at the batter under it; the verge covers it from above and RoadMesh draws
          // the fill from the verge's edge
          if (gap > 0 && gap <= limits.below + BATTER * CELL_M * Math.SQRT2) { counts.apron++; continue; }
          if (gap > 0 && lower.length && ground >= Math.min(...lower.map(c => c.low)) - limits.below - BATTER * CELL_M * Math.SQRT2) { counts.walled++; if (here) walls.push(here); continue; }
          if (gap > 0) { counts.below++; worstBelow = Math.max(worstBelow, gap); } else { counts.above++; worstAbove = Math.max(worstAbove, -gap); }
          const r = rideS.get(id);
          const at = r ? { s: Math.round(r.s0 + (r.dir === 1 ? arcOf(i) : arcOf(r.n - 1 - i))) } : { edge: id, cls: e.cls, sample: i };
          gaps.push({ ...at, side: side > 0 ? 'right' : 'left', offsetM: Math.round(o * 100) / 100, gapM: Math.round(gap * 100) / 100, x: Math.round(x), z: Math.round(z) });
        }
      }
    }
  });
  gaps.sort((p, q) => Math.abs(q.gapM) - Math.abs(p.gapM));
  const problems = [];
  if (counts.below) problems.push(`${counts.below} edge probes have the ground more than ${limits.below} m under the road (worst ${worstBelow.toFixed(2)} m)`);
  if (counts.above) problems.push(`${counts.above} edge probes have the ground more than ${limits.above} m over the road (worst ${worstAbove.toFixed(2)} m)`);
  if (counts.overRoad) problems.push(`${counts.overRoad} probes across the carriageway have the ground more than ${limits.inside} m over the road (worst ${worstOver.toFixed(2)} m)`);
  if (counts.steep) problems.push(`${counts.steep} road sides have land steeper than ${limits.batterMax} within ${limits.batterReachM} m of the verge and no lower road beside them (worst ${worstSteep.toFixed(2)})`);
  if (counts.missing) problems.push(`${counts.missing} edge probes fall outside every height tile`);
  steep.sort((p, q) => q.slope - p.slope);
  over.sort((p, q) => q.overM - p.overM);
  return check('floating', problems.length === 0, { ...counts, worstBelowM: Math.round(worstBelow * 100) / 100, worstAboveM: Math.round(worstAbove * 100) / 100, worstOverRoadM: Math.round(worstOver * 100) / 100, worstSteep: Math.round(worstSteep * 100) / 100, worst: gaps.slice(0, worst), overRoad: over.slice(0, worst), steep: steep.slice(0, worst), walls: wallRuns(walls), bends: wallRuns(bends).ride, problems });
}

// Road bands never overlap outside a junction (widths.mjs has the rules: the ride's band is width/2 + VERGE_M, a side
// edge's width/2; one piece of road, a junction and a structure are not overlaps). An overlap where the ride sample is
// already at its narrowest (minRideWidth) cannot be undone by the width: two legs stacked closer than two narrow
// bands, at two heights. Those are listed as `stacked` and pass when the two roads are more than JOIN_M apart in
// height (the runtime draws the upper one's edge as a wall or a deck side). At about one height a side road beside the
// narrowest ride is `merged`: the runtime holds it under the ride's surface inside the ride's band (WorldEnvironment
// holdSide), so the two read as one surface. Two ride samples at one height fail, as does every overlap where the ride
// could have been narrower. Side roads are drawn at their class width, which the importer
// never narrows: their overlaps with each other are counted (`sideSide`) and not failed. The width never steps more
// than OVERLAP.stepM from one sample to the next; the narrowest ride width and where it is are reported.
export const OVERLAP = Object.freeze({ stepM: 0.5 });

export function checkOverlap(world, { worst = 12 } = {}) {
  const { edges } = world;
  const grid = sampleGrid(edges, world.ride?.path ?? []);
  const found = [], stacked = [];
  let sideSide = 0, merged = 0, steps = 0, worstStep = 0;
  let narrow = { widthM: Infinity, s: null };
  edges.forEach((e, id) => {
    for (let i = 0; i < e.x.length; i++) {
      if (i > 0) {
        const step = Math.abs(e.width[i] - e.width[i - 1]);
        worstStep = Math.max(worstStep, step);
        if (step > OVERLAP.stepM) steps++;
      }
      const sa = grid.along(id, i);
      if (e.onRide && sa !== null && e.width[i] < narrow.widthM) narrow = { widthM: Math.round(e.width[i] * 10) / 10, s: Math.round(sa) };
      if (e.flags[i] & ROOFED) continue;
      const ha = bandHalf(e.width[i], e.onRide);
      for (const o of grid.others(id, i, ha + bandHalf(RIDE_WIDTH_M, true))) {
        if (o.edge < id || (o.edge === id && o.sample <= i)) continue;
        const f = edges[o.edge];
        const hb = bandHalf(f.width[o.sample], f.onRide);
        if (o.d >= ha + hb) continue;
        if (!e.onRide && !f.onRide) { sideSide++; continue; }
        const sb = grid.along(o.edge, o.sample);
        const dy = f.y[o.sample] - e.y[i];
        const atMin = (g, k) => !g.onRide || g.width[k] <= minRideWidth(g.cls) + 0.05;
        const row = { a: e.onRide ? `ride s ${Math.round(sa)}` : `edge ${id}`, b: f.onRide ? `ride s ${Math.round(sb)}` : `edge ${o.edge}`, widthA: e.width[i], widthB: f.width[o.sample], apartM: Math.round(o.d * 100) / 100, overlapM: Math.round((ha + hb - o.d) * 100) / 100, dy: Math.round(dy * 10) / 10, x: Math.round(e.x[i]), z: Math.round(e.z[i]) };
        if (atMin(e, i) && atMin(f, o.sample) && Math.abs(dy) > JOIN_M) stacked.push(row);
        else if (atMin(e, i) && atMin(f, o.sample) && e.onRide !== f.onRide) merged++;
        else found.push(row);
      }
    }
  });
  found.sort((p, q) => q.overlapM - p.overlapM);
  stacked.sort((p, q) => q.overlapM - p.overlapM);
  const problems = [];
  if (found.length) problems.push(`${found.length} pairs of samples have overlapping road bands outside a junction that the width could avoid or that lie at one height (worst ${found[0].overlapM} m)`);
  if (steps) problems.push(`${steps} width steps over ${OVERLAP.stepM} m between samples (worst ${worstStep.toFixed(2)} m)`);
  return check('overlap', problems.length === 0, { pairs: found.length, stackedPairs: stacked.length, merged, sideSide, worstStepM: Math.round(worstStep * 100) / 100, narrowestRide: narrow, worst: found.slice(0, worst), stacked: stacked.slice(0, worst), problems });
}

// The land against the DEM: every node of every height tile further than EARTHWORK_M past the drawn strip of every
// road stands within OFF_DEM.limitM of the DEM (no shelf, no hollow away from the roads); nodes nearer are the
// earthwork and are only summarised. Water and the land round structures are left out (a bridge's piers, a
// tunnel's portal). `demAt(x, z)` is the source's DEM in local metres.
export const OFF_DEM = Object.freeze({ limitM: 1.5 });
export function checkDem(decoded, demAt) {
  const index = segmentIndex(decoded.edges, EARTHWORK_M + VERGE_M + 4);
  const roofed = segmentIndex(decoded.edges.map(e => ({ ...e, flags: e.flags.map(f => (f & ROOFED ? 0 : ROOFED)) })), 40);
  const far = { n: 0, sum: 0, max: 0, over: 0, worst: [] }, near = { n: 0, sum: 0, max: 0 };
  for (const [key, t] of decoded.tiles) {
    const [tx, tz] = key.split(',').map(Number);
    for (let j = 0; j < TILE_N; j++) for (let i = 0; i < TILE_N; i++) {
      const x = tx * TILE_M + i * CELL_M, z = tz * TILE_M + j * CELL_M;
      const dem = demAt(x, z);
      if (Number.isNaN(dem) || t.zones[j * TILE_N + i] === ZONE.water) continue;
      const off = t.heights[j * TILE_N + i] - dem;
      const inside = index.near(x, z).some(c => c.d <= c.w / 2 + VERGE_M + EARTHWORK_M);
      if (inside) { near.n++; near.sum += Math.abs(off); near.max = Math.max(near.max, Math.abs(off)); continue; }
      if (roofed.near(x, z).length) continue;
      far.n++; far.sum += Math.abs(off); far.max = Math.max(far.max, Math.abs(off));
      if (Math.abs(off) > OFF_DEM.limitM) { far.over++; if (far.worst.length < 400) far.worst.push({ x, z, offM: Math.round(off * 100) / 100 }); }
    }
  }
  far.worst.sort((p, q) => Math.abs(q.offM) - Math.abs(p.offM));
  const r2 = v => Math.round(v * 100) / 100;
  const problems = far.over ? [`${far.over} of ${far.n} nodes away from the roads stand more than ${OFF_DEM.limitM} m off the DEM (worst ${r2(far.max)} m)`] : [];
  return check('dem', problems.length === 0, { away: { nodes: far.n, meanM: r2(far.sum / Math.max(1, far.n)), maxM: r2(far.max), over: far.over, worst: far.worst.slice(0, 12) }, earthwork: { nodes: near.n, meanM: r2(near.sum / Math.max(1, near.n)), maxM: r2(near.max) }, problems });
}

// The far land under the land: at every node of every height tile the horizon as the runtime draws it (far.bin
// minus far/sink0.bin, on its own triangles: farland.mjs horizonDrawnAt) lies at least HORIZON.clearM under the land
// the tile draws at any level of detail (drawnTileLow), so a resident tile is never behind the far mesh.
export const HORIZON = Object.freeze({ clearM: 0.1 });
export function checkHorizon(decoded) {
  const { far, farSink, tiles } = decoded;
  let nodes = 0, over = 0, worst = 0;
  const list = [];
  for (const [key, t] of tiles) {
    const [tx, tz] = key.split(',').map(Number);
    for (let j = 0; j < TILE_N; j++) for (let i = 0; i < TILE_N; i++) {
      const x = tx * TILE_M + i * CELL_M, z = tz * TILE_M + j * CELL_M;
      const drawn = horizonDrawnAt(far, farSink, x, z);
      if (drawn === null) continue;
      nodes++;
      const above = drawn - (drawnTileLow(t, i, j, TILE_N) - HORIZON.clearM);
      if (above <= 0) continue;
      over++;
      worst = Math.max(worst, above);
      list.push({ x, z, overM: Math.round(above * 100) / 100 });
    }
  }
  list.sort((p, q) => q.overM - p.overM);
  const problems = over ? [`the horizon stands within ${HORIZON.clearM} m of or over the drawn land at ${over} of ${nodes} tile nodes (worst ${worst.toFixed(2)} m)`] : [];
  return check('horizon', problems.length === 0, { nodes, over, worstM: Math.round(worst * 100) / 100, sinks: !!farSink, worst: list.slice(0, 12), problems });
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
  const wanted = cmd === 'all' ? ['size', 'stations', 'hairpins', 'stacked', 'crests', 'buildings', 'floating', 'overlap', 'horizon', 'dem', 'fidelity', 'elevation', 'graph'] : [cmd];
  const decoded = wanted.some(c => c !== 'size') ? decodeWorld(dir) : null;
  let built = null;
  let demAt = null;
  if (wanted.includes('dem')) {
    const { source } = await sourceFor(opt);
    const xs = [...decoded.tiles.keys()].map(k => k.split(',').map(Number));
    await source.prepare([Math.min(...xs.map(t => t[0])) * TILE_M, Math.min(...xs.map(t => t[1])) * TILE_M, (Math.max(...xs.map(t => t[0])) + 1) * TILE_M, (Math.max(...xs.map(t => t[1])) + 1) * TILE_M]);
    demAt = source.demAt;
  }
  if (wanted.some(c => ['fidelity', 'elevation', 'graph'].includes(c))) {
    const { source, spacing } = await sourceFor(opt);
    built = await buildWorld(source, { stationSpacingM: spacing });
    source.close?.();
  }
  const slice = opt.stages === 'tremola' ? 'tremola' : null;
  const corridorEdges = wanted.includes('graph') && !opt.synthetic ? inspectedCorridorEdges(opt) : null;
  const runs = {
    size: () => checkSize(dir), stations: () => checkStations(decoded), crests: () => checkCrests(decoded), hairpins: () => checkHairpins(decoded), stacked: () => checkStacked(decoded), buildings: () => checkBuildings(decoded), floating: () => checkFloating(decoded), overlap: () => checkOverlap(decoded), horizon: () => checkHorizon(decoded), dem: () => checkDem(decoded, demAt),
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
