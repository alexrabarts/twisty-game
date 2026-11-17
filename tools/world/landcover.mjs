// Land cover classes at 16 m (cover tile: 32 x 32 Uint8 per 512 m tile), rasterized from TLM_BB_BODENBEDECKUNG.
import { TILE_M } from './bench.mjs';

export const COVER_CELL_M = 16;
export const COVER_N = TILE_M / COVER_CELL_M;
export const COVER = Object.freeze({ none: 0, forest: 1, openForest: 2, rock: 3, scree: 4, grass: 5, glacier: 6, water: 7, settlement: 8 });

// Later entries paint over earlier ones.
const DRAW_ORDER = [COVER.openForest, COVER.forest, COVER.scree, COVER.rock, COVER.glacier, COVER.water, COVER.settlement];

export const OBJEKTART_CLASS = Object.freeze({
  Wald: COVER.forest,
  'Wald offen': COVER.openForest,
  Gebueschwald: COVER.openForest,
  Gehoelzflaeche: COVER.openForest,
  Fels: COVER.rock,
  Lockergestein: COVER.scree,
  'Fels locker': COVER.scree,
  'Lockergestein locker': COVER.scree,
  Gletscher: COVER.glacier,
  'Stehende Gewaesser': COVER.water,
  Feuchtgebiet: COVER.grass
});

function inRing(ring, x, z) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// polys: [{ cls, rings: [[ [x, z], ... ], ...] }] (first ring outer, the rest holes). Returns Map key -> Uint8Array.
// `tiles` is a list of [tx, tz]. Everything not covered is grass.
export function rasterizeCover(polys, tiles) {
  const boxes = polys.map(p => {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of p.rings[0]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    return { x0, x1, z0, z1 };
  });
  const rank = cls => DRAW_ORDER.indexOf(cls);
  const out = new Map();
  for (const [tx, tz] of tiles) {
    const grid = new Uint8Array(COVER_N * COVER_N).fill(COVER.grass);
    const bx0 = tx * TILE_M, bz0 = tz * TILE_M;
    const near = polys.map((p, k) => k).filter(k => boxes[k].x1 >= bx0 && boxes[k].x0 <= bx0 + TILE_M && boxes[k].z1 >= bz0 && boxes[k].z0 <= bz0 + TILE_M);
    near.sort((p, q) => rank(polys[p].cls) - rank(polys[q].cls) || p - q);
    for (const k of near) {
      const poly = polys[k];
      for (let j = 0; j < COVER_N; j++) {
        for (let i = 0; i < COVER_N; i++) {
          const x = bx0 + (i + 0.5) * COVER_CELL_M, z = bz0 + (j + 0.5) * COVER_CELL_M;
          if (x < boxes[k].x0 || x > boxes[k].x1 || z < boxes[k].z0 || z > boxes[k].z1) continue;
          if (inRing(poly.rings[0], x, z) && !poly.rings.slice(1).some(r => inRing(r, x, z))) grid[j * COVER_N + i] = poly.cls;
        }
      }
    }
    out.set(`${tx},${tz}`, grid);
  }
  return out;
}

export function coverLookup(grids) {
  return (x, z) => {
    const tx = Math.floor(x / TILE_M), tz = Math.floor(z / TILE_M);
    const g = grids.get(`${tx},${tz}`);
    if (!g) return COVER.none;
    const i = Math.min(COVER_N - 1, Math.floor((x - tx * TILE_M) / COVER_CELL_M));
    const j = Math.min(COVER_N - 1, Math.floor((z - tz * TILE_M) / COVER_CELL_M));
    return g[j * COVER_N + i];
  };
}

// Polygons of one TLM row set in local metres. toLocal maps [e, n, ...] to [x, z].
export function coverPolysFromRows(rows, toLocal) {
  const polys = [];
  for (const r of rows) {
    const cls = OBJEKTART_CLASS[r.objektart];
    if (!cls) continue;
    const parts = r.geom.type === 'Polygon' ? [r.geom.coordinates] : r.geom.type === 'MultiPolygon' ? r.geom.coordinates : [];
    for (const rings of parts) polys.push({ cls, rings: rings.map(ring => ring.map(toLocal)) });
  }
  return polys;
}
