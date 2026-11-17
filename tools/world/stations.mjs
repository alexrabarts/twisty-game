// The ride as one run of samples, and the station placement rule (R3). A station is a save point and a gate.
import { circumradius } from './resample.mjs';
import { ROOFED } from './profile.mjs';

export const SPACING_M = 1000;
const WINDOW_RADIUS_M = 50;
const KEEP_CLEAR_M = 80;

// The samples of every ride use, in order, with the join sample of each edge counted once.
// Returns { s, x, z, y, heading, width, flags, radius } as typed arrays.
export function rideSamples(edges, ride) {
  const rows = [];
  let s = 0;
  ride.forEach((use, k) => {
    const e = edges[use.edgeId];
    const n = e.x.length;
    for (let j = k === 0 ? 0 : 1; j < n; j++) {
      const i = use.dir === 1 ? j : n - 1 - j;
      if (rows.length) { const q = rows[rows.length - 1]; s += Math.hypot(e.x[i] - q.x, e.z[i] - q.z); }
      let heading = e.heading[i];
      if (use.dir === -1) heading += Math.PI;
      rows.push({ s, x: e.x[i], z: e.z[i], y: e.y[i], heading: Math.atan2(Math.sin(heading), Math.cos(heading)), width: e.width[i], flags: e.flags[i] });
    }
  });
  const count = rows.length;
  const out = {
    s: new Float64Array(count), x: new Float64Array(count), z: new Float64Array(count), y: new Float64Array(count),
    heading: new Float64Array(count), width: new Float32Array(count), flags: new Uint8Array(count), radius: new Float64Array(count)
  };
  rows.forEach((r, i) => { for (const key of ['s', 'x', 'z', 'y', 'heading', 'width', 'flags']) out[key][i] = r[key]; });
  for (let i = 0; i < count; i++) {
    out.radius[i] = i === 0 || i === count - 1 ? Infinity : circumradius(out.x[i - 1], out.z[i - 1], out.x[i], out.z[i], out.x[i + 1], out.z[i + 1]);
  }
  return out;
}

// Largest smallest-radius over +-50 m wins. Stages: [{ id, from, to }] in metres of ride. junctionS: ride junction s.
// Returns { perStage: [{ stage, s: [from, ...gates, to] }], dropped: [{ stage, target }], maxGapM }.
export function placeStations(samples, stages, junctionS, { spacingM = SPACING_M } = {}) {
  const minGap = spacingM / 2;
  const clear = s => {
    if (junctionS.some(j => Math.abs(j - s) < KEEP_CLEAR_M)) return false;
    for (let i = lowerBound(samples.s, s - KEEP_CLEAR_M); i < samples.s.length && samples.s[i] <= s + KEEP_CLEAR_M; i++) if (samples.flags[i] & ROOFED) return false;
    return true;
  };
  const tightest = s => {
    let min = Infinity;
    for (let i = lowerBound(samples.s, s - WINDOW_RADIUS_M); i < samples.s.length && samples.s[i] <= s + WINDOW_RADIUS_M; i++) min = Math.min(min, samples.radius[i]);
    return min;
  };
  const perStage = [], dropped = [];
  let maxGap = 0;
  for (const stage of stages) {
    const length = stage.to - stage.from;
    const picks = [stage.from];
    if (length >= minGap) {
      const n = Math.max(1, Math.round(length / spacingM));
      const h = Math.max(0, Math.min(spacingM / 4, (length / n - minGap) / 2));
      for (let j = 1; j < n; j++) {
        const target = stage.from + (j * length) / n;
        let best = null;
        for (let i = lowerBound(samples.s, target - h); i < samples.s.length && samples.s[i] <= target + h; i++) {
          const s = samples.s[i];
          if (!clear(s)) continue;
          const score = [tightest(s), -Math.abs(s - target), -s];
          if (!best || cmp(score, best.score) > 0) best = { s, score };
        }
        if (best) picks.push(best.s); else dropped.push({ stage: stage.id, target });
      }
    }
    picks.push(stage.to);
    for (let k = 1; k < picks.length; k++) maxGap = Math.max(maxGap, picks[k] - picks[k - 1]);
    perStage.push({ stage: stage.id, s: picks });
  }
  if (maxGap > 2 * spacingM) throw new Error(`a dropped station leaves a gap of ${Math.round(maxGap)} m (limit ${2 * spacingM} m): widen its window by hand`);
  return { perStage, dropped, maxGapM: maxGap };
}

function cmp(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
}

function lowerBound(arr, v) {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] < v) lo = mid + 1; else hi = mid; }
  return lo;
}
