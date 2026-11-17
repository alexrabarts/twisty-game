// Height tiles with the road bench carved in, for every stored edge, so free-roam later needs no new height data.
//
// A cell within width/2 + BENCH_M of an edge takes the road height (road inside width/2, bench beyond). Past that the
// ground follows the DEM, but never further than 1:1 from the road height (the cut-and-fill slope). Where two strands
// of road claim a cell (stacked hairpin legs, crossing edges, or one edge more than STRAND_GAP_M further along) and
// the height between them cannot be closed at 1:1, the cell is a cliff face (`wall`, nearer the lower road) or a drop
// (nearer the upper road). Road is never carved under bridges, galleries or over tunnels.
import { ROOFED } from './profile.mjs';

export const TILE_M = 512;
export const CELL_M = 8;
export const TILE_N = TILE_M / CELL_M + 1;
export const ZONE = Object.freeze({ terrain: 0, road: 1, bench: 2, wall: 3, drop: 4, water: 5 });
export const COVER_WATER = 7;

const BENCH_M = 2;
const BLEND_M = 12;
const SLOPE_REACH_M = 22;
const SLOPE = 1;
const STRAND_GAP_M = 60;
const HASH_M = 16;
const PACK = 1 << 20;

const smooth = t => t * t * (3 - 2 * t);

export function createBencher({ edges, demAt, coverAt = () => 0 }) {
  const hash = new Map();
  const insert = (ci, cj, ref) => {
    const key = ci * 65536 + cj;
    let list = hash.get(key);
    if (!list) hash.set(key, (list = []));
    list.push(ref);
  };
  edges.forEach((e, ei) => {
    for (let i = 0; i + 1 < e.x.length; i++) {
      if ((e.flags[i] | e.flags[i + 1]) & ROOFED) continue;
      const reach = Math.max(e.width[i], e.width[i + 1]) / 2 + BENCH_M + SLOPE_REACH_M;
      const x0 = Math.min(e.x[i], e.x[i + 1]) - reach, x1 = Math.max(e.x[i], e.x[i + 1]) + reach;
      const z0 = Math.min(e.z[i], e.z[i + 1]) - reach, z1 = Math.max(e.z[i], e.z[i + 1]) + reach;
      for (let ci = Math.floor(x0 / HASH_M); ci <= Math.floor(x1 / HASH_M); ci++) {
        for (let cj = Math.floor(z0 / HASH_M); cj <= Math.floor(z1 / HASH_M); cj++) insert(ci, cj, ei * PACK + i);
      }
    }
  });

  function candidates(x, z) {
    const list = hash.get(Math.floor(x / HASH_M) * 65536 + Math.floor(z / HASH_M));
    const out = [];
    if (!list) return out;
    for (const ref of list) {
      const ei = Math.floor(ref / PACK), i = ref - ei * PACK;
      const e = edges[ei];
      const dx = e.x[i + 1] - e.x[i], dz = e.z[i + 1] - e.z[i];
      const run = dx * dx + dz * dz;
      const t = run === 0 ? 0 : Math.max(0, Math.min(1, ((x - e.x[i]) * dx + (z - e.z[i]) * dz) / run));
      const px = e.x[i] + dx * t, pz = e.z[i] + dz * t;
      const d = Math.hypot(px - x, pz - z);
      const w = e.width[i] + (e.width[i + 1] - e.width[i]) * t;
      if (d > w / 2 + BENCH_M + SLOPE_REACH_M) continue;
      out.push({ d, w, y: e.y[i] + (e.y[i + 1] - e.y[i]) * t, edge: ei, arc: (i + t) * e.spacing, px, pz });
    }
    return out;
  }

  // Height and zone at one point.
  function ground(x, z) {
    const dem = demAt(x, z);
    const cands = candidates(x, z);
    if (!cands.length) return { y: dem, zone: ZONE.terrain };
    cands.sort((p, q) => p.d - q.d || p.edge - q.edge || p.arc - q.arc);
    const a = cands[0];
    const band = a.w / 2 + BENCH_M;
    if (a.d <= a.w / 2) return { y: a.y, zone: ZONE.road };
    if (a.d <= band) return { y: a.y, zone: ZONE.bench };
    const b = cands.find(c => c.edge !== a.edge || Math.abs(c.arc - a.arc) > STRAND_GAP_M);
    if (b) {
      const sep = Math.hypot(a.px - b.px, a.pz - b.pz);
      const room = Math.max(0, sep - band - (b.w / 2 + BENCH_M));
      const rise = Math.abs(a.y - b.y);
      if (rise > room * SLOPE + 1.5) {
        const y = a.y + (b.y - a.y) * (a.d / (a.d + b.d));
        return { y, zone: a.y > b.y ? ZONE.drop : ZONE.wall };
      }
    }
    const dd = a.d - band;
    const base = Number.isNaN(dem) ? a.y : dem;
    const blended = dd <= BLEND_M ? a.y + (base - a.y) * smooth(dd / BLEND_M) : base;
    return { y: Math.max(a.y - dd * SLOPE, Math.min(a.y + dd * SLOPE, blended)), zone: ZONE.terrain };
  }

  // One 512 m tile at 8 m: 65 x 65 nodes, row-major with z as the row.
  function tile(tx, tz) {
    const heights = new Float32Array(TILE_N * TILE_N);
    const zones = new Uint8Array(TILE_N * TILE_N);
    let missing = 0;
    for (let j = 0; j < TILE_N; j++) {
      for (let i = 0; i < TILE_N; i++) {
        const x = tx * TILE_M + i * CELL_M, z = tz * TILE_M + j * CELL_M;
        const g = ground(x, z);
        let zone = g.zone;
        if (zone === ZONE.terrain && coverAt(x, z) === COVER_WATER) zone = ZONE.water;
        heights[j * TILE_N + i] = g.y;
        zones[j * TILE_N + i] = zone;
        if (Number.isNaN(g.y)) missing++;
      }
    }
    if (missing) {
      const good = Array.from(heights).filter(v => !Number.isNaN(v));
      const fill = good.length ? good.reduce((p, q) => p + q, 0) / good.length : 0;
      for (let k = 0; k < heights.length; k++) if (Number.isNaN(heights[k])) heights[k] = fill;
    }
    return { heights, zones, missing };
  }

  return { tile, ground };
}
