// How a photo and the game drawn from the same camera are compared: the regions of the picture (from the real
// ground's distance along each ray), the skyline gap, and how far the fitted camera can be trusted.

export const REGION_NAMES = ['whole', 'sky', 'far', 'mid', 'near', 'road', 'other'];
// Distance bands of the ground along a ray, metres
export const NEAR_M = 600, FAR_M = 3000, ROAD_MAX_M = 400;

// Nearest ride segment to a point, through a grid of 25 m cells. points: [{x, z, width}]
export class RoadIndex {
  constructor(points, cell = 25) {
    this.points = points;
    this.cell = cell;
    this.grid = new Map();
    for (let i = 0; i + 1 < points.length; i++) {
      const a = points[i], b = points[i + 1];
      const i0 = Math.floor(Math.min(a.x, b.x) / cell), i1 = Math.floor(Math.max(a.x, b.x) / cell);
      const j0 = Math.floor(Math.min(a.z, b.z) / cell), j1 = Math.floor(Math.max(a.z, b.z) / cell);
      for (let gi = i0; gi <= i1; gi++) for (let gj = j0; gj <= j1; gj++) {
        const k = `${gi},${gj}`;
        if (!this.grid.has(k)) this.grid.set(k, []);
        this.grid.get(k).push(i);
      }
    }
  }

  // {distance, halfWidth} of the nearest segment within one cell, or null
  nearest(x, z) {
    const gi = Math.floor(x / this.cell), gj = Math.floor(z / this.cell);
    let best = null;
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      for (const i of this.grid.get(`${gi + di},${gj + dj}`) || []) {
        const a = this.points[i], b = this.points[i + 1];
        const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
        const t = l2 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2)) : 0;
        const d = Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
        if (!best || d < best.distance) best = { distance: d, halfWidth: (a.width || 10) / 2 };
      }
    }
    return best;
  }
}

// The region of image pixel (x, y): 'sky' above the image's own skyline (skyRows, NaN = no sky in the column),
// else by the real ground's distance along the ray: 'road' (near and on the ride), 'near', 'mid', 'far', or
// 'other' where the ray meets no ground (a cloud bank, or something close standing above the skyline)
export function regionOf(depth, road, x, y, width, height, skyRows) {
  const top = skyRows[x];
  if (Number.isFinite(top) && y < top) return 'sky';
  const i = Math.min(depth.w - 1, Math.floor((x * depth.w) / width)), j = Math.min(depth.h - 1, Math.floor((y * depth.h) / height));
  const k = j * depth.w + i;
  const d = depth.dist[k];
  if (!Number.isFinite(d)) return 'other';
  if (road && d < ROAD_MAX_M) {
    const hit = road.nearest(depth.hitX[k], depth.hitZ[k]);
    if (hit && hit.distance <= hit.halfWidth) return 'road';
  }
  return d < NEAR_M ? 'near' : d < FAR_M ? 'mid' : 'far';
}

// The gap between two skylines given as rows per column (NaN = none): degrees, b relative to a.
// gameHigherShare: the share of columns where b stands more than half a degree above a.
export function skylineGap(a, b, degPerRow) {
  let n = 0, sumAbs = 0, sum = 0, higher = 0, lower = 0;
  for (let x = 0; x < Math.min(a.length, b.length); x++) {
    if (!Number.isFinite(a[x]) || !Number.isFinite(b[x])) continue;
    const d = (a[x] - b[x]) * degPerRow;
    n++; sumAbs += Math.abs(d); sum += d;
    if (d > 0.5) higher++; else if (d < -0.5) lower++;
  }
  if (!n) return null;
  const r = v => Math.round(v * 100) / 100;
  return { columns: n, meanAbsDeg: r(sumAbs / n), meanDeg: r(sum / n), gameHigherShare: r(higher / n), gameLowerShare: r(lower / n) };
}

// How far the fitted camera can be trusted: 'high', 'medium' or 'low', with the reasons.
// fit.score: mean sky-to-ground step along the real skyline; fit.apartScore: the best score at a bearing well
// away (close to fit.score: a flat or repeated skyline, the bearing is ambiguous); validShare: share of columns
// where the photo shows a clear step near the real skyline (low: people, a roof or cloud hide it); relief: how
// much the real skyline rises and falls across the picture (deg); misfit: mean gap between the photo's step and
// the real skyline (deg).
export function confidenceOf({ fit, validShare, demRows, photoRows, height, vfov }) {
  const degPerRow = vfov / height;
  const dem = Array.from(demRows).filter(Number.isFinite).map(v => v * degPerRow);
  const mean = dem.reduce((a, v) => a + v, 0) / Math.max(1, dem.length);
  const relief = Math.sqrt(dem.reduce((a, v) => a + (v - mean) ** 2, 0) / Math.max(1, dem.length));
  let sum = 0, n = 0;
  for (let x = 0; x < photoRows.length; x++) {
    if (!Number.isFinite(photoRows[x]) || !Number.isFinite(demRows[x])) continue;
    n++;
    sum += Math.abs(photoRows[x] - demRows[x]) * degPerRow;
  }
  const misfit = n ? sum / n : Infinity;
  const margin = fit.score - Math.max(0, fit.apartScore);
  const ambiguity = fit.score > 0 ? Math.max(0, fit.apartScore) / fit.score : 1;
  const reasons = [];
  if (validShare < 0.5) reasons.push(`clear skyline in ${Math.round(validShare * 100)}% of columns`);
  if (fit.score < 0.12) reasons.push(`weak sky-to-ground step (${fit.score.toFixed(3)})`);
  if (ambiguity > 0.7) reasons.push(`ambiguous bearing (ratio ${ambiguity.toFixed(2)})`);
  if (relief < 0.7) reasons.push(`flat skyline (${relief.toFixed(2)} deg relief)`);
  if (misfit > 0.8) reasons.push(`misfit ${misfit.toFixed(2)} deg`);
  let level = 'low';
  if (!reasons.length) level = 'high';
  else if (validShare >= 0.25 && fit.score >= 0.07 && ambiguity <= 0.85 && misfit <= 1.5) level = 'medium';
  const r = v => Math.round(v * 1000) / 1000;
  return { level, reasons, validShare: r(validShare), stepScore: r(fit.score), apartScore: r(fit.apartScore), margin: r(margin), ambiguity: r(ambiguity), reliefDeg: r(relief), misfitDeg: r(misfit), normalisedMisfit: r(misfit / vfov) };
}
