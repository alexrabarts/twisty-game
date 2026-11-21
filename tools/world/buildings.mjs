// Building footprints (TLM_GEBAEUDE_FOOTPRINT) within BUILDING_RANGE_M of the ride, as oriented boxes
// { x, z, w, d, heading, h, kind }. The box is the smallest rectangle round the footprint; d runs along `heading`.
export const BUILDING_RANGE_M = 200;
export const KIND = Object.freeze({ house: 1, chapel: 2, shed: 3, wall: 4 });

const KIND_OF = { Gebaeude: KIND.house, Kapelle: KIND.chapel, 'Offenes Gebaeude': KIND.shed, Flugdach: KIND.shed, 'Mauer gross': KIND.wall };

function hull(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const build = list => {
    const h = [];
    for (const q of list) { while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop(); h.push(q); }
    h.pop();
    return h;
  };
  return [...build(p), ...build(p.reverse())];
}

// Smallest-area rectangle: one side lies along a hull edge.
export function orientedBox(ring) {
  const h = hull(ring);
  if (h.length < 3) return null;
  let best = null;
  for (let i = 0; i < h.length; i++) {
    const a = h[i], b = h[(i + 1) % h.length];
    const ang = Math.atan2(b[0] - a[0], b[1] - a[1]);
    const fx = Math.sin(ang), fz = Math.cos(ang), rx = Math.cos(ang), rz = -Math.sin(ang);
    let d0 = Infinity, d1 = -Infinity, w0 = Infinity, w1 = -Infinity;
    for (const [x, z] of h) {
      const along = x * fx + z * fz, across = x * rx + z * rz;
      d0 = Math.min(d0, along); d1 = Math.max(d1, along); w0 = Math.min(w0, across); w1 = Math.max(w1, across);
    }
    const area = (d1 - d0) * (w1 - w0);
    if (!best || area < best.area - 1e-9) {
      const cd = (d0 + d1) / 2, cw = (w0 + w1) / 2;
      best = { area, x: cd * fx + cw * rx, z: cd * fz + cw * rz, w: w1 - w0, d: d1 - d0, heading: ang };
    }
  }
  return best;
}

// Height by kind and size: the footprint carries no height.
function heightOf(kind, area) {
  if (kind === KIND.chapel) return 9;
  if (kind === KIND.shed) return 3.5;
  if (kind === KIND.wall) return 3;
  return Math.min(13, 6 + Math.floor(area / 60) * 1.5);
}

// rows: TLM rows with geom Polygon/MultiPolygon, objektart. rideSamples: { x, z } arrays.
export function buildingsFromRows(rows, toLocal, rideSamples, range = BUILDING_RANGE_M) {
  const cell = range;
  const grid = new Map();
  for (let i = 0; i < rideSamples.x.length; i += 2) {
    const k = `${Math.floor(rideSamples.x[i] / cell)},${Math.floor(rideSamples.z[i] / cell)}`;
    (grid.get(k) ?? grid.set(k, []).get(k)).push(i);
  }
  const nearRide = (x, z) => {
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      for (const k of grid.get(`${cx + i},${cz + j}`) ?? []) if (Math.hypot(rideSamples.x[k] - x, rideSamples.z[k] - z) <= range) return true;
    }
    return false;
  };
  const out = [];
  for (const r of rows) {
    const kind = KIND_OF[r.objektart];
    if (!kind) continue;
    const parts = r.geom.type === 'Polygon' ? [r.geom.coordinates] : r.geom.type === 'MultiPolygon' ? r.geom.coordinates : [];
    for (const rings of parts) {
      const box = orientedBox(rings[0].map(toLocal));
      if (!box || box.w < 1 || box.d < 1 || !nearRide(box.x, box.z)) continue;
      out.push({ x: box.x, z: box.z, w: box.w, d: box.d, heading: box.heading, h: heightOf(kind, box.area), kind });
    }
  }
  return out.sort((a, b) => a.x - b.x || a.z - b.z || a.w - b.w);
}

// Metres of open ground a building keeps from the band of every road (ride and side edges). The game road is wider
// than the mapped one (10 m on the ride against about 6 m), so a mapped house beside the road can stand on the drawn
// band; the bench beside the band (2 m, bench.mjs) and a metre more stay clear too.
export const ROAD_CLEAR_M = 3;
// The furthest a building is moved off a road to clear it; one that needs more is left out
export const NUDGE_MAX_M = 4;

const HASH_M = 32;

// Signed distance from (x, z) to an oriented box: negative inside
export function boxDistance(b, x, z) {
  const fx = Math.sin(b.heading), fz = Math.cos(b.heading);
  const dx = x - b.x, dz = z - b.z;
  const along = Math.abs(dx * fx + dz * fz) - b.d / 2, across = Math.abs(dx * fz - dz * fx) - b.w / 2;
  return Math.hypot(Math.max(along, 0), Math.max(across, 0)) + Math.min(Math.max(along, across), 0);
}

function corners(b) {
  const fx = Math.sin(b.heading), fz = Math.cos(b.heading);
  return [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, c]) => [b.x + fx * a * b.d / 2 + fz * c * b.w / 2, b.z + fz * a * b.d / 2 - fx * c * b.w / 2]);
}

// Whether two oriented boxes overlap (separating axis test)
export function boxesOverlap(p, q) {
  for (const b of [p, q]) {
    for (const [ax, az] of [[Math.sin(b.heading), Math.cos(b.heading)], [Math.cos(b.heading), -Math.sin(b.heading)]]) {
      const range = box => corners(box).reduce(([lo, hi], [x, z]) => [Math.min(lo, x * ax + z * az), Math.max(hi, x * ax + z * az)], [Infinity, -Infinity]);
      const [a0, a1] = range(p), [b0, b1] = range(q);
      if (a1 <= b0 || b1 <= a0) return false;
    }
  }
  return true;
}

// The road bands of `edges` ({x, z, width} arrays) as a lookup: clearance(box) is the smallest distance from the box
// to the edge of any band (negative over a band), with the road point it was measured from
export function roadBands(edges) {
  const segments = [];
  const hash = new Map();
  for (const e of edges) {
    for (let i = 0; i + 1 < e.x.length; i++) {
      const ref = segments.length;
      segments.push({ x0: e.x[i], z0: e.z[i], x1: e.x[i + 1], z1: e.z[i + 1], w0: e.width[i] / 2, w1: e.width[i + 1] / 2, edge: e.id, ride: !!e.onRide });
      const cx0 = Math.floor(Math.min(e.x[i], e.x[i + 1]) / HASH_M), cx1 = Math.floor(Math.max(e.x[i], e.x[i + 1]) / HASH_M);
      const cz0 = Math.floor(Math.min(e.z[i], e.z[i + 1]) / HASH_M), cz1 = Math.floor(Math.max(e.z[i], e.z[i + 1]) / HASH_M);
      for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) (hash.get(`${cx},${cz}`) ?? hash.set(`${cx},${cz}`, []).get(`${cx},${cz}`)).push(ref);
    }
  }
  const clearance = (b, reach = 40) => {
    const r = Math.max(b.w, b.d) / 2 + reach;
    const seen = new Set();
    let worst = { gap: Infinity, x: 0, z: 0, edge: -1, ride: false, ux: 0, uz: 1 };
    for (let cx = Math.floor((b.x - r) / HASH_M); cx <= Math.floor((b.x + r) / HASH_M); cx++) {
      for (let cz = Math.floor((b.z - r) / HASH_M); cz <= Math.floor((b.z + r) / HASH_M); cz++) {
        for (const ref of hash.get(`${cx},${cz}`) ?? []) {
          if (seen.has(ref)) continue;
          seen.add(ref);
          const s = segments[ref];
          const n = Math.max(1, Math.ceil(Math.hypot(s.x1 - s.x0, s.z1 - s.z0) / 0.5));
          for (let k = 0; k <= n; k++) {
            const t = k / n;
            const x = s.x0 + (s.x1 - s.x0) * t, z = s.z0 + (s.z1 - s.z0) * t;
            const gap = boxDistance(b, x, z) - (s.w0 + (s.w1 - s.w0) * t);
            if (gap < worst.gap) worst = { gap, x, z, edge: s.edge, ride: s.ride, ux: s.x1 - s.x0, uz: s.z1 - s.z0 };
          }
        }
      }
    }
    return worst;
  };
  return { clearance };
}

// Buildings moved off the road bands of `edges`, or left out: a box closer than `clear` to a band is pushed square
// off the road segment nearest it, by no more than NUDGE_MAX_M in all, and kept only when it then clears every band
// and lands on no building already kept. Deterministic: the input order (sorted) decides who keeps a plot.
export function clearOfRoads(buildings, edges, clear = ROAD_CLEAR_M) {
  const bands = roadBands(edges);
  const report = { nudged: 0, dropped: 0 };
  const round = v => Math.round(v * 1000) / 1000;
  const placed = [];
  for (const original of buildings) {
    const b = { ...original };
    let moved = 0;
    let worst = bands.clearance(b);
    for (let step = 0; step < 8 && worst.gap < clear && moved <= NUDGE_MAX_M; step++) {
      // Square off the road: along the segment's normal, on the building's side of it
      const len = Math.hypot(worst.ux, worst.uz) || 1;
      let dx = worst.uz / len, dz = -worst.ux / len;
      if (dx * (b.x - worst.x) + dz * (b.z - worst.z) < 0) { dx = -dx; dz = -dz; }
      const push = clear - worst.gap + 0.05;
      b.x = round(b.x + dx * push);
      b.z = round(b.z + dz * push);
      moved += push;
      worst = bands.clearance(b);
    }
    if (worst.gap < clear || moved > NUDGE_MAX_M) report.dropped++;
    else placed.push({ b, moved: moved > 0 });
  }
  // A moved building gives way to every building that stands where the map put it, and to a moved one before it
  const kept = placed.filter(p => !p.moved).map(p => p.b);
  for (const p of placed) {
    if (!p.moved) continue;
    if (kept.some(k => boxesOverlap(k, p.b))) { report.dropped++; continue; }
    report.nudged++;
    kept.push(p.b);
  }
  return { buildings: kept.sort((a, b) => a.x - b.x || a.z - b.z || a.w - b.w), ...report };
}
