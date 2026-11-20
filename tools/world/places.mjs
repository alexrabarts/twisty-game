// Stopping places beside the ride: where a rider can pull in and wait clear of the carriageway.
//
//   map     a mapped parking or rest area (source.areas: swissTLM3D tlm_areale_verkehrsareal) that lies along the
//           ride. The game's road is wider than the mapped one, so the area's own width across is laid from the game's
//           carriageway edge outward: the ride's verge is that much wider there (the bencher carves the land to it and
//           RoadMesh draws it), `depth` metres past the usual verge, tapered over `taper` metres at each end.
//   found   where the map has no place for FOUND_GAP_M: a stretch of straight road whose drawn verge and the land
//           beside it are level, clear of every other road, junction and structure. Nothing is carved or drawn for it.
//
// A place: { id, kind, source, s, side, length, depth, taper, surface, name }. `s` is where it starts along the ride
// and `length` how far it runs; `side` is Route's (+1 the rider's left, the +lateral side; -1 the rider's right).
// Nothing here names a place: every rule reads the data.
import { ROOFED, FLAG } from './profile.mjs';
import { VERGE_M, ZONE, TILE_M, CELL_M, TILE_N, BATTER, segmentIndex } from './bench.mjs';

// swissTLM3D area classes that are public places to stop, and the kind each one is
export const AREA_KINDS = Object.freeze({ 'Oeffentliches Parkplatzareal': 'carpark', Rastplatzareal: 'layby' });
export const SURFACE = Object.freeze({ carpark: 'asphalt', layby: 'gravel', verge: null });

export const PLACE = Object.freeze({
  // An area counts when its near side is within this of the game's carriageway edge (or inside the carriageway)
  edgeGapM: 3,
  // Its width across the road, measured on the map, and the most of it that is laid beside the ride
  depthMinM: 2, depthMaxM: 5,
  lengthMinM: 12,
  taperM: 6,
  // Kept clear of a side road's mouth on its own side, and of a bend tighter than this
  mouthClearM: 16, radiusMinM: 40,
  rayStepM: 0.25, rayReachM: 40,
  // found places: one where no place lies within foundGapM, on road straighter than foundRadiusM, clear of every
  // junction by foundJunctionM, with land within foundLevelM of the road out to foundDepthM past the verge
  foundGapM: 600, foundRadiusM: 60, foundJunctionM: 30, foundLevelM: 0.25, foundDepthM: 2, foundLengthM: 16, foundLengthMaxM: 24, foundStepM: 40, foundGradeMax: 0.12,
  // and no retaining wall at its edge or within wallClearM along the road: the runtime stands the edge on a wall where
  // the land within wallRunM past the verge lies wallUnderM under a slope at the batter (WorldEnvironment.edgeFoot:
  // WALL_OVER_M 1.5 over 6 m; here with 0.3 m to spare), and joins two walls less than 12 m apart into one
  wallRunM: 6, wallUnderM: 1.2, wallClearM: 16,
  // A checkpoint's roadworks run on from its station (the importer hands the span: stations.mjs siteReach), and the
  // runtime closes a place within this of one (WorldPlaces.WORKS_CLEAR_M): a found place stands outside where it can
  worksClearM: 20
});

const r1 = v => Math.round(v * 10) / 10;

// The extra verge of a place at ride distance s: its depth, tapered over `taper` at each end, 0 outside it
export function padOf(place, s) {
  const into = Math.min(s - place.s, place.s + place.length - s);
  if (into <= 0) return 0;
  return place.depth * Math.min(1, into / place.taper);
}

function inside(ring, x, z) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

// The side roads' mouths on the ride: [{s, side}] with side +1, -1 or 0 (both: a branch nearly straight on)
export function mouthsOf(junctions, samples) {
  const out = [];
  const headingAt = s => {
    let i = 0;
    while (i + 1 < samples.s.length && samples.s[i + 1] <= s) i++;
    return samples.heading[i];
  };
  for (const j of junctions) {
    for (const pass of j.passes) {
      const h = headingAt(pass.sIn);
      for (const branch of j.incident) {
        if (branch.edgeId === pass.inEdge || branch.edgeId === pass.outEdge) continue;
        const lean = Math.sin(branch.heading - h);
        out.push({ s: pass.sIn, side: Math.abs(lean) < 0.2 ? 0 : lean > 0 ? 1 : -1 });
      }
    }
  }
  return out;
}

// Runs of consecutive true flags as [first, last] index pairs
function runsOf(flags) {
  const runs = [];
  let open = -1;
  for (let i = 0; i <= flags.length; i++) {
    const on = i < flags.length && flags[i];
    if (on && open < 0) open = i;
    if (!on && open >= 0) { runs.push([open, i - 1]); open = -1; }
  }
  return runs;
}

// Whether the strip from the verge's edge out to `depth` past it at sample i stands clear of every other piece of road
// (its band and verge, and a metre): `index` is segmentIndex(edges, VERGE_M + 1)
function clearOfRoads(index, samples, i, side, depth) {
  const cos = Math.cos(samples.heading[i]), sin = Math.sin(samples.heading[i]);
  const half = samples.width[i] / 2;
  // (nearer than VERGE_M + 1 past the edge the index answers with the ride's own strand)
  for (let c = half + VERGE_M + 1.1; c <= half + VERGE_M + depth + 1 + 1e-9; c += 0.5) {
    if (index.near(samples.x[i] + side * c * cos, samples.z[i] - side * c * sin).length) return false;
  }
  return true;
}

// The mapped areas that lie along the ride, as places. areas: [{cls, name, ring: [[x, z], ...]}]
export function mapPlaces(areas, samples, mouths, edges) {
  const index = segmentIndex(edges, VERGE_M + 1);
  const n = samples.s.length;
  const out = [];
  for (const area of areas) {
    const kind = AREA_KINDS[area.cls];
    if (!kind) continue;
    const xs = area.ring.map(p => p[0]), zs = area.ring.map(p => p[1]);
    const box = [Math.min(...xs) - 60, Math.min(...zs) - 60, Math.max(...xs) + 60, Math.max(...zs) + 60];
    for (const side of [-1, 1]) {
      const across = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        if (samples.x[i] < box[0] || samples.x[i] > box[2] || samples.z[i] < box[1] || samples.z[i] > box[3]) continue;
        if (samples.flags[i] & (ROOFED | FLAG.bridge) || samples.radius[i] < PLACE.radiusMinM) continue;
        if (mouths.some(m => m.side !== -side && Math.abs(m.s - samples.s[i]) < PLACE.mouthClearM)) continue;
        const cos = Math.cos(samples.heading[i]), sin = Math.sin(samples.heading[i]);
        const half = samples.width[i] / 2;
        // The area's extent along the normal, from the centre line out: the first run of it that starts by the edge
        let a = null, b = null;
        for (let d = 0; d <= half + PLACE.rayReachM; d += PLACE.rayStepM) {
          const hit = inside(area.ring, samples.x[i] + side * d * cos, samples.z[i] - side * d * sin);
          if (hit) { if (a === null) a = d; b = d; } else if (a !== null) break;
          if (a === null && d > half + PLACE.edgeGapM) break;
        }
        if (a === null || b - a < PLACE.depthMinM) continue;
        const depth = Math.min(PLACE.depthMaxM, b - a);
        if (clearOfRoads(index, samples, i, side, depth)) across[i] = depth;
      }
      for (const [first, last] of runsOf(Array.from(across, v => v > 0))) {
        const length = samples.s[last] - samples.s[first];
        if (length < PLACE.lengthMinM) continue;
        const depths = Array.from(across.subarray(first, last + 1)).sort((p, q) => p - q);
        const depth = Math.floor(depths[Math.floor(depths.length / 2)] * 10) / 10;
        out.push({ kind, source: 'map', s: r1(samples.s[first]), side, length: r1(length), depth, taper: r1(Math.min(PLACE.taperM, length / 3)), surface: SURFACE[kind], name: area.name ?? null });
      }
    }
  }
  return out.sort((p, q) => p.s - q.s || p.side - q.side);
}

// Writes each map place's extra verge onto the ride's edges, in each edge's own direction: e.padP (the edge's +lateral
// side) and e.padN, metres a sample. The bencher carves the land to the wider strip. An edge the ride rides against
// its own direction has the ride's left on its -lateral side.
export function applyPads(edges, ride, places) {
  const drawn = places.filter(p => p.source === 'map');
  if (!drawn.length) return 0;
  let s = 0, set = 0, last = null;
  ride.forEach(use => {
    const e = edges[use.edgeId];
    const n = e.x.length;
    for (let j = 0; j < n; j++) {
      const i = use.dir === 1 ? j : n - 1 - j;
      if (last) s += Math.hypot(e.x[i] - last[0], e.z[i] - last[1]);
      last = [e.x[i], e.z[i]];
      for (const place of drawn) {
        const pad = padOf(place, s);
        if (pad <= 0) continue;
        const key = place.side * use.dir > 0 ? 'padP' : 'padN';
        if (!e[key]) e[key] = new Float32Array(n);
        e[key][i] = Math.max(e[key][i], pad);
        set++;
      }
    }
  });
  return set;
}

// The built tiles' land at (x, z), on the triangles the runtime draws; null off the tiles
function tileAt(tiles, x, z) {
  const tx = Math.floor(x / TILE_M), tz = Math.floor(z / TILE_M);
  const t = tiles.get(`${tx},${tz}`);
  if (!t) return null;
  const fx = (x - tx * TILE_M) / CELL_M, fz = (z - tz * TILE_M) / CELL_M;
  const i = Math.max(0, Math.min(TILE_N - 2, Math.floor(fx))), j = Math.max(0, Math.min(TILE_N - 2, Math.floor(fz)));
  const u = fx - i, v = fz - j;
  const h = t.heights;
  const h00 = h[j * TILE_N + i], h10 = h[j * TILE_N + i + 1], h01 = h[(j + 1) * TILE_N + i], h11 = h[(j + 1) * TILE_N + i + 1];
  const y = u + v <= 1 ? h00 + u * (h10 - h00) + v * (h01 - h00) : h11 + (1 - u) * (h01 - h11) + (1 - v) * (h10 - h11);
  const zone = t.zones[Math.round(fz) * TILE_N + Math.round(fx)] ?? ZONE.terrain;
  return { y, zone };
}

// The most the land stands off the road's height across a found place's strip at sample i, or Infinity where it is
// not ground to stand on (a wall, a drop, water, no tile)
export function levelOff(tiles, samples, i, side, depth = PLACE.foundDepthM) {
  const cos = Math.cos(samples.heading[i]), sin = Math.sin(samples.heading[i]);
  const half = samples.width[i] / 2;
  let worst = 0;
  for (let d = 0; d <= depth + 1e-9; d += 0.5) {
    const o = side * (half + VERGE_M + d);
    const g = tileAt(tiles, samples.x[i] + o * cos, samples.z[i] - o * sin);
    if (!g || g.zone === ZONE.wall || g.zone === ZONE.drop || g.zone === ZONE.water) return Infinity;
    worst = Math.max(worst, Math.abs(g.y - samples.y[i]));
  }
  return worst;
}

// Whether the runtime may stand the road's edge on a retaining wall at sample i: a wall or drop node, or land well
// under a slope at the batter, within wallRunM past the verge. The land is cut down in front of a wall, so the strip
// beside it is no ground to stand on
export function wallRisk(tiles, samples, i, side) {
  const cos = Math.cos(samples.heading[i]), sin = Math.sin(samples.heading[i]);
  const half = samples.width[i] / 2;
  for (let d = 0.5; d <= PLACE.wallRunM + 1.5 + 1e-9; d += 0.5) {
    const o = side * (half + VERGE_M + d);
    const g = tileAt(tiles, samples.x[i] + o * cos, samples.z[i] - o * sin);
    if (!g || g.zone === ZONE.wall || g.zone === ZONE.drop) return true;
    if (d <= PLACE.wallRunM && samples.y[i] - d * BATTER - g.y >= PLACE.wallUnderM) return true;
  }
  return false;
}

// Standing places where the map has none: `taken` are the places already there. One in each stretch of foundGapM with
// no place, the rider's right first (traffic keeps right, so a rider pulls in without crossing the road). `works` are
// the spans [{ s0, s1 }] of the checkpoints' roadworks: a candidate clear of them is taken before one that is not
export function foundPlaces(samples, tiles, mouths, edges, taken = [], works = []) {
  const P = PLACE;
  const index = segmentIndex(edges, VERGE_M + 1);
  const n = samples.s.length;
  const candidates = [];
  for (const side of [-1, 1]) {
    const ok = new Array(n).fill(false);
    const walled = [];
    for (let i = 0; i < n; i++) if (wallRisk(tiles, samples, i, side)) walled.push(samples.s[i]);
    for (let i = 1; i + 1 < n; i++) {
      if (walled.some(s => Math.abs(s - samples.s[i]) < P.wallClearM)) continue;
      if (samples.flags[i] & (ROOFED | FLAG.bridge) || samples.radius[i] < P.foundRadiusM) continue;
      if (Math.abs(samples.y[i + 1] - samples.y[i - 1]) / Math.max(1e-6, samples.s[i + 1] - samples.s[i - 1]) > P.foundGradeMax) continue;
      if (mouths.some(m => Math.abs(m.s - samples.s[i]) < P.foundJunctionM)) continue;
      if (levelOff(tiles, samples, i, side) > P.foundLevelM) continue;
      ok[i] = clearOfRoads(index, samples, i, side, P.foundDepthM);
    }
    for (const [first, last] of runsOf(ok)) {
      const run = samples.s[last] - samples.s[first];
      if (run < P.foundLengthM) continue;
      // A long level stretch offers a place every foundStepM along it, a short one its middle
      const length = Math.min(run, P.foundLengthMaxM);
      const count = Math.max(1, Math.floor((run - length) / P.foundStepM) + 1);
      const lead = (run - length - (count - 1) * P.foundStepM) / 2;
      for (let k = 0; k < count; k++) candidates.push({ s: samples.s[first] + lead + k * P.foundStepM, side, length });
    }
  }
  candidates.sort((p, q) => p.s - q.s || p.side - q.side);
  const end = samples.s[n - 1];
  const held = taken.map(p => ({ s: p.s, e: p.s + p.length })).sort((p, q) => p.s - q.s);
  const out = [];
  // From the start, or from the last place: the candidate furthest on in the second half of the gap (on the right
  // where there is one), else the first one beyond the gap, while the next place is more than a gap away
  let from = 0;
  for (;;) {
    const next = held.find(h => h.s >= from);
    const limit = next ? next.s : end;
    if (limit - from <= P.foundGapM) {
      if (!next) break;
      from = next.e;
      continue;
    }
    const open = candidates.filter(c => c.s >= from + P.foundGapM / 2 && c.s + c.length <= limit - P.foundGapM / 2);
    const inGap = open.filter(c => c.s <= from + P.foundGapM);
    const atWorks = c => works.some(w => c.s + c.length > w.s0 - P.worksClearM && c.s < w.s1 + P.worksClearM);
    const free = open.filter(c => !atWorks(c)), freeInGap = inGap.filter(c => !atWorks(c));
    // (one clear of the works up to half a gap beyond the gap is better than one in the works inside it)
    const pick = freeInGap.findLast(c => c.side === -1) ?? freeInGap.at(-1) ?? free.find(c => c.s <= from + 1.5 * P.foundGapM)
      ?? inGap.findLast(c => c.side === -1) ?? inGap.at(-1) ?? open[0];
    if (!pick) {
      if (!next) break;
      from = next.e;
      continue;
    }
    const place = { kind: 'verge', source: 'found', s: r1(pick.s), side: pick.side, length: r1(pick.length), depth: P.foundDepthM, taper: 0, surface: SURFACE.verge, name: null };
    out.push(place);
    held.push({ s: place.s, e: place.s + place.length });
    held.sort((p, q) => p.s - q.s);
    from = place.s + place.length;
  }
  return out;
}

// All the places in order along the ride, with their ids
export function numberPlaces(places) {
  return [...places].sort((p, q) => p.s - q.s || p.side - q.side).map((p, k) => ({ id: `p${k}`, ...p }));
}
