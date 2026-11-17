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
