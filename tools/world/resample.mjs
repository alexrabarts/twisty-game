// Resamples one mapped road line to the world's sample spacing (about 4 m) and rounds every bend tighter than R_MIN
// to R_MIN, so that the bike can ride it (D2: bends keep their mapped shape, only the width is widened).
//
// A rider model follows the mapped line at 1 m steps by pure pursuit: it steers toward a point CARROT_M ahead of its
// own position on the line. That rides a circular bend of any radius exactly, and it can never lose the line. The
// turn rate is capped at 1/R_MIN. Where the mapped bend is gentler than that, the rider rides the line as mapped.
// Where it is tighter, the rider takes a R_MIN arc and then comes back onto the line (the legs of a hairpin end up
// further apart, the way a wider turn needs). The cap is a hard limit, so no radius below R_MIN can come out.
//
// Stacked hairpins: on a ladder of hairpins whose legs are mapped about 10 m apart, a R_MIN arc cannot turn between
// two legs. It runs wide on the exit and carries the next leg onto the one beyond it (the Tremola had legs 2.8 m
// apart where the map has them 11 m apart). So after each ride the legs are compared with the map: where a leg comes
// nearer another leg than the map has them (within LEG_CARE_M), the tightened bends next to it are held to
// R_HAIRPIN instead, and the line is ridden again. R_HAIRPIN is the tightest the bike turns at speed, so the
// hairpin stays inside its real footprint and the bike can still ride its centreline.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SPACING_M = 4;
const FALLBACK_R_MIN = 10;
const FALLBACK_R_HAIRPIN = 6;

function readPhysics(name, fallback, repoRoot) {
  const file = path.join(repoRoot, 'js', 'world', 'physics.js');
  if (!fs.existsSync(file)) return fallback;
  // The key itself (`name: 10`), not a comment that names it
  const m = new RegExp(`\\b${name}\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)`).exec(fs.readFileSync(file, 'utf8'));
  return m ? Number(m[1]) : fallback;
}

// The fillet radius is the radius the physics can ride: js/world/physics.js owns it once that file exists
// (P41 binds the two). Until then the plan's value stands.
export function readRMin(repoRoot = REPO_ROOT) { return readPhysics('rMin', FALLBACK_R_MIN, repoRoot); }
// The radius a stacked hairpin is held to where a R_MIN arc would push its legs together (physics.js rHairpin)
export function readRHairpin(repoRoot = REPO_ROOT) { return readPhysics('rHairpin', FALLBACK_R_HAIRPIN, repoRoot); }

export const R_MIN = readRMin();
export const R_HAIRPIN = readRHairpin();

const STEP_M = 1;
const CARROT_M = 10;
// In a held hairpin the carrot is nearer: at 10 m it cut the inside of a 6 m bend and drew the legs 2 m together
const CARROT_HAIRPIN_M = 5;
const END_BLEND_M = 25;
const FILLET_GAP_M = 1;
const EXPLAIN_M = 80;
// Stacked legs. Two points of the line count as one leg when they are within LEG_SAME_M of each other along it. A
// leg nearer another than LEG_CARE_M is compared with the map; it is squeezed when it is more than LEG_TOL_M nearer
// than the map has the two. A tightened bend within BLAME_M (mapped arc) of a squeezed point is held to R_HAIRPIN
// over LOOSE_HALF_M either side of it. At most SQUEEZE_ROUNDS rides.
const LEG_SAME_M = 60;
const LEG_CARE_M = 15; // two 10 m roads' drawn strips (ribbon, verge, 0.5 m) meet at 13.2 m apart
const LEG_TOL_M = 1.5; // as verify.mjs fidelityM: a line within 1.5 m of the map is the mapped line
const BLAME_M = 50;
const LOOSE_HALF_M = 20;
const SQUEEZE_ROUNDS = 8;

export function polylineLengths(pts) {
  const cum = new Float64Array(pts.length);
  for (let i = 1; i < pts.length; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return cum;
}

export function pointAtArc(pts, cum, arc) {
  const total = cum[cum.length - 1];
  const a = Math.max(0, Math.min(total, arc));
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= a) lo = mid; else hi = mid; }
  const run = cum[hi] - cum[lo];
  const t = run === 0 ? 0 : (a - cum[lo]) / run;
  return [pts[lo][0] + (pts[hi][0] - pts[lo][0]) * t, pts[lo][1] + (pts[hi][1] - pts[lo][1]) * t, lo, t];
}

// Nearest point of the polyline to (x, z) among the segments that overlap arc [arcLo, arcHi]: {dist, arc, index, t}.
export function nearestOnPolyline(pts, cum, x, z, arcLo = 0, arcHi = Infinity) {
  let lo = 0;
  { let l = 0, h = cum.length - 1; while (h - l > 1) { const m = (l + h) >> 1; if (cum[m] <= arcLo) l = m; else h = m; } lo = l; }
  let best = { dist: Infinity, arc: 0, index: 0, t: 0 };
  for (let i = lo; i + 1 < pts.length && cum[i] <= arcHi; i++) {
    const dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1];
    const run = dx * dx + dz * dz;
    const t = run === 0 ? 0 : Math.max(0, Math.min(1, ((x - pts[i][0]) * dx + (z - pts[i][1]) * dz) / run));
    const d = Math.hypot(pts[i][0] + dx * t - x, pts[i][1] + dz * t - z);
    if (d < best.dist) best = { dist: d, arc: cum[i] + (cum[i + 1] - cum[i]) * t, index: i, t };
  }
  return best;
}

// Radius of the circle through three points, Infinity on a straight line.
export function circumradius(ax, az, bx, bz, cx, cz) {
  const ab = Math.hypot(bx - ax, bz - az), bc = Math.hypot(cx - bx, cz - bz), ca = Math.hypot(ax - cx, az - cz);
  const cross = Math.abs((bx - ax) * (cz - az) - (bz - az) * (cx - ax));
  return cross < 1e-9 ? Infinity : (ab * bc * ca) / (2 * cross);
}

export function minRadius(xs, zs) {
  let min = Infinity;
  for (let i = 1; i + 1 < xs.length; i++) min = Math.min(min, circumradius(xs[i - 1], zs[i - 1], xs[i], zs[i], xs[i + 1], zs[i + 1]));
  return min;
}

function headingBetween(ax, az, bx, bz) { return Math.atan2(bx - ax, bz - az); }

// Rides the rider model along the mapped line. Returns the 1 m line, the mapped-line arc length the rider is at on
// each step (`ref`), and the arc spans where the cap was active.
// The reference point moves with a Newton step along the line (at most MAX_REF_STEP_M a step), never by a nearest
// point search: beside a stacked hairpin the nearest mapped point can be on the next leg.
const MAX_REF_STEP_M = 3;

function ride(src, srcCum, ds, capAt, carrotAt = () => CARROT_M) {
  const total = srcCum[srcCum.length - 1];
  const tangent = arc => {
    const [ax, az] = pointAtArc(src, srcCum, Math.max(0, arc - 1));
    const [bx, bz] = pointAtArc(src, srcCum, Math.min(total, arc + 1));
    return headingBetween(ax, az, bx, bz);
  };
  const line = [[src[0][0], src[0][1]]];
  const ref = [0];
  const capped = [];
  let x = src[0][0], z = src[0][1], th = tangent(0), arc = 0;
  for (let step = 0, limit = Math.ceil((total / ds) * 1.6) + 40; step < limit; step++) {
    for (let it = 0; it < 3; it++) {
      const [qx, qz] = pointAtArc(src, srcCum, arc);
      const t = tangent(arc);
      const along = (x - qx) * Math.sin(t) + (z - qz) * Math.cos(t);
      arc = Math.max(0, Math.min(total, arc + Math.max(-MAX_REF_STEP_M, Math.min(MAX_REF_STEP_M, along))));
    }
    if (arc >= total - ds) break;
    const [cx, cz] = pointAtArc(src, srcCum, Math.min(total, arc + carrotAt(arc)));
    const dx = cx - x, dz = cz - z;
    const run2 = dx * dx + dz * dz;
    const ahead = dx * Math.sin(th) + dz * Math.cos(th);
    const side = dx * Math.cos(th) - dz * Math.sin(th);
    const kMax = capAt(arc);
    const want = run2 < 1e-9 ? 0 : ahead < 0 ? Math.sign(side || 1) * 2 * kMax : (2 * side) / run2;
    const k = Math.max(-kMax, Math.min(kMax, want));
    if (Math.abs(want) > kMax) capped.push(arc);
    th += k * ds;
    x += ds * Math.sin(th);
    z += ds * Math.cos(th);
    line.push([x, z]);
    ref.push(arc);
  }
  // The last metres blend onto the mapped end point, so that edges meet at their node.
  const end = src[src.length - 1];
  const gap = [end[0] - line[line.length - 1][0], end[1] - line[line.length - 1][1]];
  const m = Math.min(line.length - 1, Math.round(END_BLEND_M / ds));
  for (let j = 0; j <= m; j++) {
    const w = (j / m) ** 2;
    const p = line[line.length - 1 - m + j];
    p[0] += gap[0] * w;
    p[1] += gap[1] * w;
  }
  line.push([end[0], end[1]]);
  ref.push(total);
  return { line, ref, capped };
}

// One line, resampled. `splits` are arc lengths on the mapped line where the result is cut into segments that share
// their end samples (the ride is resampled as one line, and then cut at the graph nodes, so that a bend that runs
// across a node is not broken by it). Returns
//   segments  [{ x, z, heading, srcS, length, spacing, minRadius }], samples at most `spacing` apart,
//             srcS[i] the mapped-line arc length at sample i (profile.mjs reads the mapped height there)
//   fillets   [{ s0, s1, sagM, explained }] arc spans on the mapped line where the line leaves the mapped one by
//             more than a metre, sagM the largest gap inside the span
//   cuts      [{ x, z }] where each split fell on the new line
//   hairpins  [{ s0, s1 }] mapped-line spans held to rHairpin (stacked hairpins), and
//   squeezed  the legs still nearer each other than the map has them: [{ a, b, rideM, mappedM }] (mapped arcs)
export function resampleLine(pts, splits = [], { rMin = R_MIN, rHairpin = R_HAIRPIN, spacing = SPACING_M } = {}) {
  const srcCum = polylineLengths(pts);
  const srcLen = srcCum[srcCum.length - 1];
  if (!(srcLen > 0)) throw new Error('resampleLine: a line of zero length');
  const ds = srcLen / Math.max(2, Math.ceil(srcLen / STEP_M));
  // Mapped-line spans [a0, a1] held to rHairpin, not rMin
  const loose = [];
  const inLoose = arc => loose.some(([a0, a1]) => arc >= a0 && arc <= a1);
  const mappedSep = legSeparation(densify(pts, srcCum, 2));
  let result = null, lineCum = null, squeezed = [];
  for (let round = 0; round < SQUEEZE_ROUNDS; round++) {
    let scale = 1;
    for (let attempt = 0; attempt < 6; attempt++) {
      result = ride(pts, srcCum, ds, arc => scale / ((inLoose(arc) ? rHairpin : rMin) * 1.01), arc => (inLoose(arc) ? CARROT_HAIRPIN_M : CARROT_M));
      lineCum = polylineLengths(result.line);
      const whole = sampleRange(result.line, lineCum, 0, lineCum[lineCum.length - 1], spacing);
      // The worst share of its own floor (rHairpin in a held span, else rMin) any sample's radius reaches
      const ref = Float64Array.from(whole.x, (_, i) => refOf(result, lineCum, u0Of(whole, i)));
      let worst = Infinity;
      for (let i = 1; i + 1 < whole.x.length; i++) {
        const r = circumradius(whole.x[i - 1], whole.z[i - 1], whole.x[i], whole.z[i], whole.x[i + 1], whole.z[i + 1]);
        worst = Math.min(worst, r / (inLoose(ref[i]) ? rHairpin : rMin));
      }
      if (worst >= 1 || !Number.isFinite(worst)) break;
      scale *= worst / 1.005;
    }
    squeezed = squeezedLegs(result, lineCum, mappedSep, spacing);
    if (!squeezed.length || rHairpin >= rMin) break;
    const blamed = result.capped.filter(c => !inLoose(c) && squeezed.some(q => Math.abs(c - q.a) <= BLAME_M || Math.abs(c - q.b) <= BLAME_M));
    if (!blamed.length) break;
    for (const c of blamed) loose.push([c - LOOSE_HALF_M, c + LOOSE_HALF_M]);
    mergeSpans(loose);
  }
  const lineLen = lineCum[lineCum.length - 1];
  const refAt = u => refOf(result, lineCum, u);
  // The new line's arc length where each split falls: the first step whose reference arc has reached it.
  const lineArcs = [0];
  for (const b of splits) {
    let k = result.ref.findIndex(r => r >= b);
    if (k < 0) k = result.ref.length - 1;
    const prev = Math.max(0, k - 1);
    const span = result.ref[k] - result.ref[prev];
    lineArcs.push(lineCum[prev] + (span > 0 ? ((b - result.ref[prev]) / span) * (lineCum[k] - lineCum[prev]) : 0));
  }
  lineArcs.push(lineLen);
  const segments = [];
  for (let k = 0; k + 1 < lineArcs.length; k++) {
    const seg = sampleRange(result.line, lineCum, lineArcs[k], Math.max(lineArcs[k + 1], lineArcs[k] + 1e-6), spacing);
    delete seg.u0;
    seg.srcS = Float64Array.from({ length: seg.x.length }, (_, i) => refAt(lineArcs[k] + i * seg.spacing));
    seg.length = 0;
    for (let i = 1; i < seg.x.length; i++) seg.length += Math.hypot(seg.x[i] - seg.x[i - 1], seg.z[i] - seg.z[i - 1]);
    seg.minRadius = minRadius(seg.x, seg.z);
    segments.push(seg);
  }
  // Fillets: the spans where the line sits more than FILLET_GAP_M from the mapped line. A span that no
  // tightened bend is near (`explained` false) is a fault of the model, not a fillet, and verify.mjs fails on it.
  const fillets = [];
  let open = null;
  result.line.forEach((p, k) => {
    const gap = nearestOnPolyline(pts, srcCum, p[0], p[1], Math.max(0, result.ref[k] - 15), result.ref[k] + 15).dist;
    if (gap > FILLET_GAP_M) {
      if (open && result.ref[k] - open.s1 <= 8) { open.s1 = result.ref[k]; open.sag = Math.max(open.sag, gap); }
      else { if (open) fillets.push(open); open = { s0: result.ref[k], s1: result.ref[k], sag: gap }; }
    }
  });
  if (open) fillets.push(open);
  const r1 = v => Math.round(v * 10) / 10;
  return {
    segments,
    cuts: lineArcs.slice(1, -1).map(u => { const [x, z] = pointAtArc(result.line, lineCum, u); return { x, z }; }),
    hairpins: loose.map(([a0, a1]) => ({ s0: r1(Math.max(0, a0)), s1: r1(Math.min(srcLen, a1)) })),
    squeezed,
    fillets: fillets.map(f => ({ s0: r1(f.s0), s1: r1(f.s1), sagM: Math.round(f.sag * 100) / 100, explained: result.capped.some(c => c >= f.s0 - EXPLAIN_M && c <= f.s1 + EXPLAIN_M) }))
  };
}

// A line with no splits: { x, z, heading, srcS, length, spacing, minRadius, fillets }.
export function resampleEdge(pts, opts) {
  const r = resampleLine(pts, [], opts);
  return { ...r.segments[0], fillets: r.fillets };
}

// The mapped-line arc the rider was at, at arc u of its 1 m line
function refOf(result, lineCum, u) {
  const at = pointAtArc(result.line, lineCum, u);
  return result.ref[at[2]] + (result.ref[Math.min(at[2] + 1, result.ref.length - 1)] - result.ref[at[2]]) * at[3];
}
const u0Of = (samples, i) => samples.u0 + i * samples.spacing;

// Points every `step` metres along a polyline: { x, z, arc }
function densify(pts, cum, step) {
  const n = Math.max(1, Math.ceil(cum[cum.length - 1] / step));
  const x = new Float64Array(n + 1), z = new Float64Array(n + 1), arc = new Float64Array(n + 1);
  for (let k = 0; k <= n; k++) { arc[k] = (cum[cum.length - 1] * k) / n; [x[k], z[k]] = pointAtArc(pts, cum, arc[k]); }
  return { x, z, arc };
}

// For each point { x, z, arc }, the distance to the nearest point of another leg (more than LEG_SAME_M away along
// the line), and that point's arc; LEG_CARE_M and Infinity where no other leg is that near. A grid of LEG_CARE_M cells.
function legSeparation(p) {
  const grid = new Map();
  const key = (i, j) => `${i},${j}`;
  for (let k = 0; k < p.x.length; k++) {
    const g = key(Math.floor(p.x[k] / LEG_CARE_M), Math.floor(p.z[k] / LEG_CARE_M));
    (grid.get(g) ?? grid.set(g, []).get(g)).push(k);
  }
  const dist = new Float64Array(p.x.length).fill(LEG_CARE_M), other = new Float64Array(p.x.length).fill(Infinity);
  for (let k = 0; k < p.x.length; k++) {
    const ci = Math.floor(p.x[k] / LEG_CARE_M), cj = Math.floor(p.z[k] / LEG_CARE_M);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      for (const m of grid.get(key(ci + a, cj + b)) ?? []) {
        if (Math.abs(p.arc[m] - p.arc[k]) <= LEG_SAME_M) continue;
        const d = Math.hypot(p.x[m] - p.x[k], p.z[m] - p.z[k]);
        if (d < dist[k]) { dist[k] = d; other[k] = p.arc[m]; }
      }
    }
  }
  return { ...p, dist, other };
}

// The mapped separation at mapped arc a (the densified map's nearest point)
function mappedAt(sep, a) {
  const step = sep.arc.length > 1 ? sep.arc[1] - sep.arc[0] : 1;
  return sep.dist[Math.max(0, Math.min(sep.dist.length - 1, Math.round(a / step)))];
}

// The ridden legs nearer each other than the map has them: one entry per run of squeezed samples, at its nearest
// point: { a, b } the mapped arcs of the two legs there, rideM the ridden and mappedM the mapped separation.
function squeezedLegs(result, lineCum, mappedSep, spacing) {
  const whole = sampleRange(result.line, lineCum, 0, lineCum[lineCum.length - 1], spacing);
  const ref = Float64Array.from(whole.x, (_, i) => refOf(result, lineCum, u0Of(whole, i)));
  const arc = Float64Array.from(whole.x, (_, i) => u0Of(whole, i));
  const ridden = legSeparation({ x: whole.x, z: whole.z, arc });
  const out = [];
  let open = null;
  for (let i = 0; i < whole.x.length; i++) {
    const mapped = mappedAt(mappedSep, ref[i]);
    const squeeze = ridden.dist[i] < mapped - LEG_TOL_M;
    if (squeeze) {
      const row = { a: ref[i], b: refOf(result, lineCum, ridden.other[i]), rideM: ridden.dist[i], mappedM: mapped, i };
      if (open && i - open.i1 <= 2) { open.i1 = i; if (row.rideM < open.row.rideM) open.row = row; } else { if (open) out.push(open.row); open = { i1: i, row }; }
    }
  }
  if (open) out.push(open.row);
  const r2 = v => Math.round(v * 100) / 100;
  return out.map(q => ({ a: Math.round(q.a * 10) / 10, b: Math.round(q.b * 10) / 10, rideM: r2(q.rideM), mappedM: r2(q.mappedM) }));
}

function mergeSpans(spans) {
  spans.sort((p, q) => p[0] - q[0]);
  for (let k = spans.length - 1; k > 0; k--) {
    if (spans[k][0] <= spans[k - 1][1]) { spans[k - 1][1] = Math.max(spans[k - 1][1], spans[k][1]); spans.splice(k, 1); }
  }
}

// Samples evenly spaced between arc lengths u0 and u1 of the 1 m line, at most `spacing` apart. The heading is the
// direction of the chord 2 m either side, taken from the whole line, so it carries across a cut.
function sampleRange(line, cum, u0, u1, spacing) {
  const n = Math.max(1, Math.ceil((u1 - u0) / spacing));
  const step = (u1 - u0) / n;
  const x = new Float64Array(n + 1), z = new Float64Array(n + 1), heading = new Float64Array(n + 1);
  const probe = Math.min(Math.max(step, 1e-6) / 2, 2);
  for (let j = 0; j <= n; j++) {
    const u = u0 + j * step;
    const [px, pz] = pointAtArc(line, cum, u);
    x[j] = px; z[j] = pz;
    const [ax, az] = pointAtArc(line, cum, u - probe);
    const [bx, bz] = pointAtArc(line, cum, u + probe);
    heading[j] = headingBetween(ax, az, bx, bz);
  }
  return { x, z, heading, spacing: step, u0 };
}
