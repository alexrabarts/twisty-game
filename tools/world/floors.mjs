// The server's per-link time floors (anti-cheat). A link is the road between two gates. The floor is a closed-form
// lower bound on any rider's time, 0.9 times the time of an ideal rider who accelerates and brakes without limit,
// takes the inner edge of every bend and is held only by the lean angle and the top speed. It is deliberately
// simple: no search, so nothing in it can hang or differ between two runs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FALLBACK_LEAN_CAP_DEG = 50;
export const TOP_SPEED = 82.28;
export const GRAVITY = 9.81;
export const FLOOR_FACTOR = 0.9;
const CORRIDOR_MARGIN_M = 2;
const BEND_RADIUS_M = 200;
const BEND_GAP_M = 40;
const MIN_LENGTH_FACTOR = 0.5;

export function readLeanCapDeg(repoRoot = REPO_ROOT) {
  const file = path.join(repoRoot, 'js', 'world', 'physics.js');
  if (!fs.existsSync(file)) return FALLBACK_LEAN_CAP_DEG;
  const m = /\bleanCapDeg\b[^0-9\n]*([0-9]+(?:\.[0-9]+)?)/.exec(fs.readFileSync(file, 'utf8'));
  return m ? Number(m[1]) : FALLBACK_LEAN_CAP_DEG;
}

const wrap = a => a - Math.round(a / (2 * Math.PI)) * 2 * Math.PI;

// Bends in samples [i0, i1]: runs of radius <= BEND_RADIUS_M, joined when closer than BEND_GAP_M.
function bendsIn(samples, i0, i1) {
  const bends = [];
  for (let i = i0; i <= i1; i++) {
    if (!(samples.radius[i] <= BEND_RADIUS_M)) continue;
    const last = bends[bends.length - 1];
    if (last && samples.s[i] - samples.s[last.to] <= BEND_GAP_M) last.to = i; else bends.push({ from: i, to: i });
  }
  return bends;
}

// Floor of the link between ride distances s0 and s1, in whole milliseconds (at least 1).
export function linkFloorMs(samples, s0, s1, { leanCapDeg = readLeanCapDeg() } = {}) {
  let i0 = 0;
  while (i0 < samples.s.length - 1 && samples.s[i0 + 1] <= s0) i0++;
  let i1 = i0;
  while (i1 < samples.s.length - 1 && samples.s[i1] < s1) i1++;
  const speed = new Float64Array(samples.s.length).fill(TOP_SPEED);
  for (const bend of bendsIn(samples, i0, i1)) {
    let min = Infinity, widest = 0, turn = 0;
    for (let i = bend.from; i <= bend.to; i++) {
      min = Math.min(min, samples.radius[i]);
      widest = Math.max(widest, samples.width[i]);
      if (i > bend.from) turn += Math.abs(wrap(samples.heading[i] - samples.heading[i - 1]));
    }
    const w = widest / 2 + CORRIDOR_MARGIN_M;
    const flat = 1 - Math.cos(turn / 2);
    // The arc through the inner edge of the bend touches it at the apex and is tangent to the outer edge.
    const rIdeal = flat < 1e-6 ? Infinity : min + (w * (1 + Math.cos(turn / 2))) / flat;
    const v = Math.min(TOP_SPEED, Math.sqrt(GRAVITY * Math.tan((leanCapDeg * Math.PI) / 180) * rIdeal));
    for (let i = bend.from; i <= bend.to; i++) speed[i] = v;
  }
  let t = 0;
  for (let i = i0; i < i1; i++) {
    const a = Math.max(samples.s[i], s0), b = Math.min(samples.s[i + 1], s1);
    if (b <= a) continue;
    const w = samples.width[i] / 2 + CORRIDOR_MARGIN_M;
    const kappa = Number.isFinite(samples.radius[i]) ? 1 / samples.radius[i] : 0;
    t += (Math.max(MIN_LENGTH_FACTOR, 1 - w * kappa) * (b - a)) / speed[i];
  }
  return Math.max(1, Math.ceil(FLOOR_FACTOR * t * 1000));
}

// One board row for a stage: floors per link, from the start line through the gates to the finish.
export function stageFloors(samples, stationS, opts) {
  const gateFloorsMs = [];
  for (let k = 0; k + 1 < stationS.length; k++) gateFloorsMs.push(linkFloorMs(samples, stationS[k], stationS[k + 1], opts));
  return { gateFloorsMs, floorMs: gateFloorsMs.reduce((p, q) => p + q, 0) };
}
