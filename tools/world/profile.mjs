// The height along every stored edge. swissTLM3D lines carry Z (W0 outcome 1), so the profile is the mapped Z
// smoothed over 40 m. Without Z it is the DEM along the centre line (median over 60 m, then smoothed), and a tunnel
// is linear between its portals (W0 outcome 1, fallback).
import { SPACING_M } from './resample.mjs';

export const FLAG = Object.freeze({ tunnel: 1, bridge: 2, gallery: 4, cobbles: 8 });
export const STRUCTURE_FLAG = Object.freeze({
  Tunnel: FLAG.tunnel,
  Unterfuehrung: FLAG.tunnel,
  Galerie: FLAG.gallery,
  Bruecke: FLAG.bridge,
  'Gedeckte Bruecke': FLAG.bridge,
  'Staumauer/Wehr': FLAG.bridge
});
export const ROOFED = FLAG.tunnel | FLAG.gallery | FLAG.bridge;

const SG_WINDOW_M = 40;
const MEDIAN_WINDOW_M = 60;
const DEM_CHECK_OFFSETS_M = [-3, 0, 3];
export const DEM_LIMIT_M = 4;
const NODE_BLEND_M = 20;

// Local quadratic least-squares fit evaluated at the window centre (Savitzky-Golay). The window shrinks at the ends.
export function savitzkyGolay(values, spacing, windowM = SG_WINDOW_M) {
  const half = Math.max(1, Math.round(windowM / spacing / 2));
  const n = values.length;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - half), b = Math.min(n - 1, i + half);
    if (b - a < 2) { out[i] = values[i]; continue; }
    let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0, y0 = 0, y1 = 0, y2 = 0;
    for (let j = a; j <= b; j++) {
      const t = j - i, y = values[j];
      s0 += 1; s1 += t; s2 += t * t; s3 += t ** 3; s4 += t ** 4;
      y0 += y; y1 += t * y; y2 += t * t * y;
    }
    const det = s0 * (s2 * s4 - s3 * s3) - s1 * (s1 * s4 - s3 * s2) + s2 * (s1 * s3 - s2 * s2);
    out[i] = Math.abs(det) < 1e-9 ? y0 / s0 : (y0 * (s2 * s4 - s3 * s3) - s1 * (y1 * s4 - s3 * y2) + s2 * (y1 * s3 - s2 * y2)) / det;
  }
  return out;
}

function median(values, spacing, windowM) {
  const half = Math.max(1, Math.round(windowM / spacing / 2));
  const out = new Float64Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const w = values.slice(Math.max(0, i - half), Math.min(values.length, i + half + 1)).sort((p, q) => p - q);
    out[i] = w[w.length >> 1];
  }
  return out;
}

export function structureFlags(structure) {
  return STRUCTURE_FLAG[structure] ?? 0;
}

// Linear height between the first and last sample of every run where `mask` is set.
function interpolateRuns(y, mask) {
  const n = y.length;
  for (let i = 0; i < n;) {
    if (!mask[i]) { i++; continue; }
    let j = i;
    while (j < n && mask[j]) j++;
    const a = i > 0 ? i - 1 : j, b = j < n ? j : i - 1;
    if (a >= 0 && a < n && b >= 0 && b < n && a !== b) {
      for (let k = i; k < j; k++) y[k] = y[a] + ((y[b] - y[a]) * (k - a)) / (b - a);
    }
    i = j;
  }
}

// Mapped height at arc length `arc` of a line with Z in pts[i][2].
function mappedHeight(pts, cum, arc) {
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= arc) lo = mid; else hi = mid; }
  const run = cum[hi] - cum[lo];
  const t = run === 0 ? 0 : Math.max(0, Math.min(1, (arc - cum[lo]) / run));
  return pts[lo][2] + (pts[hi][2] - pts[lo][2]) * t;
}

// edge: { srcPts, srcCum, hasZ, x, z, srcS, structure, surface }; demAt(x, z) gives metres or NaN.
// Sets edge.y (Float64Array) and edge.flags (Uint8Array).
export function profileEdge(edge, demAt, spacing = edge.spacing ?? SPACING_M) {
  const n = edge.x.length;
  const flags = new Uint8Array(n).fill(structureFlags(edge.structure));
  const structured = flags.map(f => (f & ROOFED ? 1 : 0));
  let y;
  if (edge.hasZ) {
    y = new Float64Array(n);
    for (let i = 0; i < n; i++) y[i] = mappedHeight(edge.srcPts, edge.srcCum, edge.srcS[i]);
  } else {
    const dem = new Float64Array(n);
    for (let i = 0; i < n; i++) dem[i] = demAt(edge.x[i], edge.z[i]);
    for (let i = 0; i < n; i++) if (Number.isNaN(dem[i])) dem[i] = i ? dem[i - 1] : 0;
    y = median(dem, spacing, MEDIAN_WINDOW_M);
    interpolateRuns(y, structured);
  }
  edge.y = savitzkyGolay(y, spacing);
  edge.flags = flags;
  return edge;
}

// Edge ends that meet at a node take the node's height (the mean of the incident ends), blended over 20 m.
export function reconcileNodes(edges, nodes) {
  const ends = new Map();
  const note = (node, edge, atStart) => {
    if (!ends.has(node)) ends.set(node, []);
    ends.get(node).push({ edge, atStart });
  };
  for (const e of edges) { note(e.a, e, true); note(e.b, e, false); }
  for (const [node, list] of [...ends].sort((p, q) => p[0] - q[0])) {
    const heights = list.map(({ edge, atStart }) => (atStart ? edge.y[0] : edge.y[edge.y.length - 1]));
    const mean = heights.reduce((p, q) => p + q, 0) / heights.length;
    nodes[node].y = mean;
    list.forEach(({ edge, atStart }, k) => {
      const delta = mean - heights[k];
      if (delta === 0) return;
      const sp = edge.spacing;
      const reach = Math.max(1, Math.ceil(NODE_BLEND_M / sp));
      for (let j = 0; j <= reach; j++) {
        const i = atStart ? j : edge.y.length - 1 - j;
        if (i < 0 || i >= edge.y.length) break;
        edge.y[i] += delta * (1 - j / (reach + 1));
      }
    });
  }
}

// Crests keep the bike on the road without an airborne state only when it would need at least CREST_MIN_MPS to
// leave the surface: sqrt(g / kappa) for the vertical curvature kappa at the crest. kappa is read over a fixed
// +-CREST_WINDOW_M window, (y(s+W) - 2 y(s) + y(s-W)) / W^2 with y interpolated along the arc, so it does not
// depend on how the resampler spaced the samples. Where a crest is sharper than the import limit, the profile is
// eased locally: a sample moves to the height that gives the limit curvature, and the passes repeat until none is
// sharper (a move changes its neighbours). Structures keep their own profile.
export const CREST_MIN_MPS = 35;
export const CREST_IMPORT_MPS = 36;
export const CREST_WINDOW_M = 4;

// Height at arc distance `at` along samples with cumulative distance `cum`, held flat beyond the ends
export function heightAlong(cum, y, at) {
  if (at <= cum[0]) return y[0];
  const last = cum.length - 1;
  if (at >= cum[last]) return y[last];
  let lo = 0, hi = last;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= at) lo = mid; else hi = mid; }
  const run = cum[hi] - cum[lo];
  return run === 0 ? y[lo] : y[lo] + ((y[hi] - y[lo]) * (at - cum[lo])) / run;
}

// Vertical curvature at sample i (negative on a crest), or null where the window leaves the line
export function verticalCurvature(cum, y, i, window = CREST_WINDOW_M) {
  if (cum[i] - window < cum[0] - 1e-9 || cum[i] + window > cum[cum.length - 1] + 1e-9) return null;
  return (heightAlong(cum, y, cum[i] + window) - 2 * y[i] + heightAlong(cum, y, cum[i] - window)) / (window * window);
}

// The crests are the ride's, and the sharpest sit where two edges meet, so the pass runs over the ride as one line of
// samples. A sample that is the end of an edge is a node: the node and every edge end at it move together. Returns the
// largest move in metres.
export function limitRideCrests(edges, ride, nodes, { minMps = CREST_IMPORT_MPS, passes = 400 } = {}) {
  const kMax = 9.81 / (minMps * minMps);
  const refs = [];
  ride.forEach((use, k) => {
    const e = edges[use.edgeId];
    const n = e.x.length;
    for (let j = k === 0 ? 0 : 1; j < n; j++) refs.push({ e, i: use.dir === 1 ? j : n - 1 - j });
  });
  const count = refs.length;
  const cum = new Float64Array(count);
  const y = new Float64Array(count);
  for (let r = 0; r < count; r++) {
    const { e, i } = refs[r];
    if (r) cum[r] = cum[r - 1] + Math.hypot(e.x[i] - refs[r - 1].e.x[refs[r - 1].i], e.z[i] - refs[r - 1].e.z[refs[r - 1].i]);
    y[r] = e.y[i];
  }
  const incident = new Map();
  for (const e of edges) for (const [node, i] of [[e.a, 0], [e.b, e.y.length - 1]]) {
    if (!incident.has(node)) incident.set(node, []);
    incident.get(node).push([e, i]);
  }
  const set = (r, value) => {
    y[r] = value;
    const { e, i } = refs[r];
    e.y[i] = value;
    if (i === 0 || i === e.y.length - 1) {
      const node = i === 0 ? e.a : e.b;
      nodes[node].y = value;
      for (const [other, at] of incident.get(node)) other.y[at] = value;
    }
  };
  let moved = 0;
  for (let pass = 0; pass < passes; pass++) {
    let changed = false;
    for (let r = 1; r < count - 1; r++) {
      if (refs[r].e.flags[refs[r].i] & ROOFED) continue;
      const kappa = verticalCurvature(cum, y, r);
      if (kappa === null || -kappa <= kMax) continue;
      const ahead = heightAlong(cum, y, cum[r] + CREST_WINDOW_M), behind = heightAlong(cum, y, cum[r] - CREST_WINDOW_M);
      const target = (ahead + behind) / 2 + (kMax * CREST_WINDOW_M * CREST_WINDOW_M) / 2;
      moved = Math.max(moved, Math.abs(target - y[r]));
      set(r, target);
      changed = true;
    }
    if (!changed) break;
  }
  return moved;
}

// How far the profile sits from the DEM outside structures: per sample, the smallest gap to the DEM at 3 lateral
// offsets. Returns the gaps (metres), unsorted.
export function demGaps(edge, demAt) {
  const gaps = [];
  for (let i = 0; i < edge.x.length; i++) {
    if (edge.flags[i] & ROOFED) continue;
    const nx = Math.cos(edge.heading[i]), nz = -Math.sin(edge.heading[i]);
    let best = Infinity;
    for (const o of DEM_CHECK_OFFSETS_M) {
      const d = demAt(edge.x[i] + nx * o, edge.z[i] + nz * o);
      if (!Number.isNaN(d)) best = Math.min(best, Math.abs(edge.y[i] - d));
    }
    if (Number.isFinite(best)) gaps.push(best);
  }
  return gaps;
}

export function summariseGaps(gaps) {
  const sorted = [...gaps].sort((p, q) => p - q);
  return {
    count: sorted.length,
    p99: sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))] : 0,
    max: sorted.length ? sorted[sorted.length - 1] : 0,
    over: sorted.filter(g => g > DEM_LIMIT_M).length
  };
}
