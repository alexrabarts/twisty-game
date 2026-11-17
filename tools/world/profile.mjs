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
