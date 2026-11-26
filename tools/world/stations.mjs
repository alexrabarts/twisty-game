// The ride as one run of samples, and the station placement rule (R3). A station is a timing line: the start, the
// finish, and each checkpoint between them, where the split is taken at the entry of a roadworks site.
import { circumradius } from './resample.mjs';
import { ROOFED } from './profile.mjs';

export const SPACING_M = 2000;
const KEEP_CLEAR_M = 80;

// A station between a stage's ends is a checkpoint, and the game builds a roadworks site that runs on from it
// (js/world/roadworks.js: the timing line is the site's entry). A station stands only where a full site fits ahead:
// `lengthM` of road no tighter than `radiusM`, off every structure, `junctionM` from a ride junction, at least
// `widthM` wide (the open lane a closure must leave), `placeM` clear of a stopping place of the map, and ending
// `endM` before the stage does. The limits are a little inside the game's own (Roadworks.CURVE_MAX is a 50 m radius,
// OPEN_MIN_M a 6.34 m road, JUNCTION_CLEAR_M 25 m, LENGTH_MIN_M 64 m), and `marginM` of the same road lies either
// side of the length, so the site the game builds is never the bare gates
export const SITE = Object.freeze({ lengthM: 100, marginM: 4, radiusM: 55, widthM: 6.4, junctionM: 30, placeM: 20, endM: 80 });

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

// The heading change per metre at sample i, over the sample either side (as the game reads a bend: WorldRoute.curvatureAt)
function curvature(samples, i) {
  if (i <= 0 || i >= samples.s.length - 1) return 0;
  const turn = samples.heading[i + 1] - samples.heading[i - 1];
  return Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn))) / (samples.s[i + 1] - samples.s[i - 1]);
}

// The game's own limits on a site (Roadworks.CURVE_MAX, OPEN_MIN_M, JUNCTION_CLEAR_M, LENGTH_MAX_M): how far the site
// of a station at s may run on. The places found beside the ride keep clear of that span (places.mjs)
const GAME = Object.freeze({ radiusM: 50, widthM: 6.34, junctionM: 25, lengthM: 550 });
export function siteReach(samples, s, junctionS) {
  let reach = 0;
  for (let i = lowerBound(samples.s, s); i < samples.s.length && samples.s[i] - s <= GAME.lengthM; i++) {
    const at = samples.s[i];
    if (samples.flags[i] & ROOFED || samples.width[i] < GAME.widthM || curvature(samples, i) >= 1 / GAME.radiusM || junctionS.some(j => Math.abs(j - at) < GAME.junctionM)) break;
    reach = at - s;
  }
  return reach;
}

// Why no full roadworks site fits ahead of s (SITE), or null when one does. `places`: [{ s, length }] of the map
export function siteProblem(samples, s, junctionS, places = [], to = Infinity) {
  const from = s - SITE.marginM, end = s + SITE.lengthM + SITE.marginM;
  if (end + SITE.endM > to) return 'the end of the stage';
  if (junctionS.some(j => j > from - SITE.junctionM && j < end + SITE.junctionM)) return 'a junction';
  if (places.some(p => p.s + p.length > from - SITE.placeM && p.s < end + SITE.placeM)) return 'a stopping place';
  for (let i = lowerBound(samples.s, from); i < samples.s.length && samples.s[i] <= end; i++) {
    if (samples.flags[i] & ROOFED) return 'a structure';
    if (samples.width[i] < SITE.widthM) return 'a narrow road';
    if (curvature(samples, i) > 1 / SITE.radiusM) return 'a bend';
  }
  return null;
}

// The place nearest each target where a full site fits wins (the earlier on a tie); a target with none within its
// reach is dropped, never a bare gate. Stages: [{ id, from, to }] in metres of ride. junctionS: ride junction s.
// places: the map's stopping places. The reach is a quarter of the spacing, less where the stage's gates lie closer.
// Returns { perStage: [{ stage, s: [from, ...gates, to] }], dropped: [{ stage, target, reason }], maxGapM }.
export function placeStations(samples, stages, junctionS, { spacingM = SPACING_M, places = [] } = {}) {
  const minGap = spacingM / 2;
  const clear = s => {
    if (junctionS.some(j => Math.abs(j - s) < KEEP_CLEAR_M)) return false;
    for (let i = lowerBound(samples.s, s - KEEP_CLEAR_M); i < samples.s.length && samples.s[i] <= s + KEEP_CLEAR_M; i++) if (samples.flags[i] & ROOFED) return false;
    return true;
  };
  const perStage = [], dropped = [];
  let maxGap = 0;
  for (const stage of stages) {
    const length = stage.to - stage.from;
    // (where a checkpoint cannot stand within reach of its target, in a gorge of tunnels and galleries, the stage takes
    // one checkpoint fewer, evenly placed again, until no gap is over twice the spacing: the Schöllenen's 6.8 km has
    // one, not two)
    const gapOf = list => list.reduce((m, s, k) => (k ? Math.max(m, s - list[k - 1]) : m), 0);
    const n0 = length >= minGap ? Math.max(1, Math.round(length / spacingM)) : 1;
    let { picks, lost } = stagePicksOf(stage, n0), fewer = false;
    // (fewer only where that closes the gap; else the stage keeps its own and its gap holds the import, below)
    for (let n = n0 - 1; n >= 1 && gapOf(picks) > 2 * spacingM; n--) {
      const tried = stagePicksOf(stage, n);
      if (gapOf(tried.picks) <= 2 * spacingM || (n === 1 && length <= 4 * spacingM)) {
        dropped.push(...lost);
        ({ picks, lost } = tried);
        fewer = true;
        break;
      }
    }
    dropped.push(...lost);
    // (a stage with no place for a checkpoint anywhere, every target in tunnels, galleries and tight bends, has none:
    // its one link is timed whole, as a stage under twice the spacing is, up to four times the spacing long)
    if (picks.length === 2 && fewer && length <= 4 * spacingM) { perStage.push({ stage: stage.id, s: picks }); continue; }
    for (let k = 1; k < picks.length; k++) maxGap = Math.max(maxGap, picks[k] - picks[k - 1]);
    perStage.push({ stage: stage.id, s: picks });
  }
  if (maxGap > 2 * spacingM) throw new Error(`a dropped station leaves a gap of ${Math.round(maxGap)} m (limit ${2 * spacingM} m): widen its window by hand (dropped: ${dropped.map(d => `${d.stage} s ${Math.round(d.target)}, ${d.reason}`).join('; ')})`);
  return { perStage, dropped, maxGapM: maxGap };

  // The stage's picks with n links: [from, ...gates, to], and the targets with no full site in reach
  function stagePicksOf(stage, n) {
    const length = stage.to - stage.from;
    const picks = [stage.from], lost = [];
    if (length >= minGap) {
      const h = Math.max(0, Math.min(spacingM / 4, (length / n - minGap) / 2));
      for (let j = 1; j < n; j++) {
        const target = stage.from + (j * length) / n;
        let best = null;
        const why = new Map();
        for (let i = lowerBound(samples.s, target - h); i < samples.s.length && samples.s[i] <= target + h; i++) {
          const s = samples.s[i];
          const problem = clear(s) ? siteProblem(samples, s, junctionS, places, stage.to) : 'a junction or a structure within 80 m';
          if (problem) { why.set(problem, (why.get(problem) ?? 0) + 1); continue; }
          const score = [-Math.abs(s - target), -s];
          if (!best || cmp(score, best.score) > 0) best = { s, score };
        }
        if (best) picks.push(best.s);
        // (the reason most of the reach has: what a person would move or widen)
        else lost.push({ stage: stage.id, target, reason: [...why].sort((p, q) => q[1] - p[1] || (p[0] < q[0] ? -1 : 1)).map(([k]) => k)[0] ?? 'no sample in reach' });
      }
    }
    picks.push(stage.to);
    return { picks, lost };
  }
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
