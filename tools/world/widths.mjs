// Road widths. The ride is drawn RIDE_WIDTH_M wide (D2) with a VERGE_M verge each side, wider than the mapped road,
// so where two pieces of road lie close (the legs of a hairpin stack, a side road beside the ride) the drawn bands
// would overlap. narrowRide narrows the ride there, sample by sample, toward the mapped width: never below
// minRideWidth (the class width, and never under MIN_RIDE_WIDTH_M: at 5 m the scripted riders left the road in the
// stacked sett hairpins and met the traffic, whose lanes keep a car clear of the edge), and
// tapered along the ride at TAPER (metres of width per metre of road) so the edge never steps.
//
// Two samples are one piece of road, not two, when they lie on the ride within SAME_ARC_M of each other (the inside
// of a bend), and a junction when they lie on two edges whose ends meet (within END_JOIN_M) and both lie within
// JUNCTION_M of that end. Structures (bridges over, tunnels and galleries under) are left out: their bands may cross
// another road at another height. verify.mjs `overlap` checks the result with the same rules.
import { FLAG } from './profile.mjs';
import { VERGE_M } from './bench.mjs';

export const RIDE_WIDTH_M = 10;
export const MIN_RIDE_WIDTH_M = 7;
export const TAPER = 0.1;
export const OVERLAP_MARGIN_M = 0.5;
export const SAME_ARC_M = (Math.PI / 2) * (RIDE_WIDTH_M + 2 * VERGE_M) + 2;
export const JUNCTION_M = 40;
export const END_JOIN_M = 8;
const STRUCTURE = FLAG.tunnel | FLAG.bridge | FLAG.gallery;
const CELL = 16;

// The width a stored side road gets: its class width. The ride is RIDE_WIDTH_M, narrowed by narrowRide.
export function classWidth(cls) {
  const m = /^(\d+)m/.exec(cls);
  if (m) return Math.max(3, Number(m[1]));
  // swissTLM3D draws each carriageway of a motorway as its own line: two lanes and a shoulder, not the whole road
  if (/autobahn/i.test(cls)) return 9;
  if (/autostrasse/i.test(cls)) return 9;
  if (/platz|raststaette/i.test(cls)) return 10;
  return 5;
}

export const minRideWidth = cls => Math.min(RIDE_WIDTH_M, Math.max(MIN_RIDE_WIDTH_M, classWidth(cls)));

// Half the drawn band: the ride has its verge, a side road is drawn without one beyond its stub
export const bandHalf = (width, onRide) => width / 2 + (onRide ? VERGE_M : 0);

// Every sample of the corridor, in a 16 m grid, with the ride's s on the ride's samples (first use of an edge)
export function sampleGrid(edges, ride) {
  const rideAt = new Map();
  let s = 0;
  for (const use of ride) {
    const e = edges[use.edgeId];
    const n = e.x.length;
    const step = n > 1 ? (e.length ?? 0) / (n - 1) : 0;
    if (!rideAt.has(use.edgeId)) rideAt.set(use.edgeId, { s0: s, dir: use.dir, n, step });
    s += e.length ?? 0;
  }
  const along = (id, i) => { const r = rideAt.get(id); return r ? r.s0 + (r.dir === 1 ? i : r.n - 1 - i) * r.step : null; };
  const grid = new Map();
  edges.forEach((e, id) => {
    for (let i = 0; i < e.x.length; i++) {
      if (e.flags[i] & STRUCTURE) continue;
      const k = `${Math.floor(e.x[i] / CELL)},${Math.floor(e.z[i] / CELL)}`;
      (grid.get(k) ?? grid.set(k, []).get(k)).push(id * 65536 + i);
    }
  });
  const ends = e => [[e.x[0], e.z[0]], [e.x[e.x.length - 1], e.z[e.z.length - 1]]];
  const junction = (e, i, f, j) => ends(e).some(p => ends(f).some(q => Math.hypot(p[0] - q[0], p[1] - q[1]) <= END_JOIN_M
    && Math.hypot(e.x[i] - p[0], e.z[i] - p[1]) <= JUNCTION_M && Math.hypot(f.x[j] - p[0], f.z[j] - p[1]) <= JUNCTION_M));
  // The samples of other pieces of road within `reach` of sample i of edge id: [{edge, sample, d}]
  function others(id, i, reach) {
    const e = edges[id];
    const out = [];
    const cx = Math.floor(e.x[i] / CELL), cz = Math.floor(e.z[i] / CELL);
    const r = Math.ceil(reach / CELL);
    const sa = along(id, i);
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
      for (const ref of grid.get(`${cx + a},${cz + b}`) ?? []) {
        const jd = Math.floor(ref / 65536), j = ref - jd * 65536;
        if (jd === id && j === i) continue;
        const f = edges[jd];
        const d = Math.hypot(f.x[j] - e.x[i], f.z[j] - e.z[i]);
        if (d > reach) continue;
        const sb = along(jd, j);
        if (sa !== null && sb !== null ? Math.abs(sa - sb) <= SAME_ARC_M : jd === id && Math.abs(j - i) * (n => (n > 1 ? (e.length ?? 0) / (n - 1) : 0))(e.x.length) <= SAME_ARC_M) continue;
        if (jd !== id && junction(e, i, f, j)) continue;
        out.push({ edge: jd, sample: j, d });
      }
    }
    return out;
  }
  return { along, others };
}

// Narrows the ride's samples in place. `edges` carry x, z, width, flags, cls, onRide and length. Returns the narrowest
// ride width and where it is, and how many ride samples were narrowed.
export function narrowRide(edges, ride) {
  const grid = sampleGrid(edges, ride);
  const reach = 2 * bandHalf(RIDE_WIDTH_M, true) + 12 + OVERLAP_MARGIN_M;
  const rows = [];
  const seen = new Set();
  for (const use of ride) {
    if (seen.has(use.edgeId)) continue;
    seen.add(use.edgeId);
    const e = edges[use.edgeId];
    for (let i = 0; i < e.x.length; i++) rows.push({ id: use.edgeId, i, s: grid.along(use.edgeId, i), min: minRideWidth(e.cls) });
  }
  rows.sort((p, q) => p.s - q.s);
  const caps = rows.map(row => {
    const e = edges[row.id];
    if (e.flags[row.i] & STRUCTURE) return RIDE_WIDTH_M;
    let cap = RIDE_WIDTH_M;
    for (const o of grid.others(row.id, row.i, reach)) {
      const f = edges[o.edge];
      // The band this sample may take: half the gap to another ride sample (both narrow), the gap less the side road's band
      const half = f.onRide ? (o.d - OVERLAP_MARGIN_M) / 2 : o.d - OVERLAP_MARGIN_M - bandHalf(f.width[o.sample], false);
      cap = Math.min(cap, 2 * (half - VERGE_M));
    }
    return Math.max(row.min, Math.min(RIDE_WIDTH_M, cap));
  });
  // The taper: no sample wider than any cap plus TAPER per metre between them. Caps only bind within (10 - 5) / TAPER.
  const span = (RIDE_WIDTH_M - MIN_RIDE_WIDTH_M) / TAPER;
  const widths = caps.slice();
  for (let k = 0; k < rows.length; k++) {
    if (caps[k] >= RIDE_WIDTH_M) continue;
    for (let m = k; m >= 0 && rows[k].s - rows[m].s <= span; m--) widths[m] = Math.min(widths[m], caps[k] + TAPER * (rows[k].s - rows[m].s));
    for (let m = k + 1; m < rows.length && rows[m].s - rows[k].s <= span; m++) widths[m] = Math.min(widths[m], caps[k] + TAPER * (rows[m].s - rows[k].s));
  }
  let narrowest = { widthM: Infinity, s: null }, narrowed = 0;
  rows.forEach((row, k) => {
    // Rounded as the files store it (0.1 m), downward so a narrowed band never grows back over its neighbour
    const w = Math.floor(Math.max(row.min, widths[k]) * 10 + 1e-6) / 10;
    edges[row.id].width[row.i] = w;
    if (w < RIDE_WIDTH_M) narrowed++;
    if (w < narrowest.widthM) narrowest = { widthM: w, s: Math.round(row.s) };
  });
  return { narrowest, narrowed };
}
