// The far land: the mountains beyond far.bin, out to FAR_REACH_M from the middle of the drawn world, so the skyline
// the rider sees is the real one (most of it stands 9 to 13 km away in this valley, some of it 40 km and more).
//
// Two levels, each a grid of vertices over a box centred on the far.bin box:
//   level 1   LEVELS[0].cellM over +-LEVELS[0].reachM
//   level 2   LEVELS[1].cellM over +-LEVELS[1].reachM
// The runtime leaves out every cell inside the box of the level within (far.bin for level 1, level 1 for level 2) and
// sinks the vertices inside that box, so a cell that straddles the edge runs under the finer land and no seam opens.
//
// Heights: swissALTI3D pooled to 50 m in the cache (cache.mjs ensureAlti3dFar, from each tile's 4 m overview), and
// Copernicus GLO-30 where swissALTI3D has no data (outside Switzerland). A vertex takes the mean of its window raised
// halfway to the window's highest point: a plain mean of a 250 m window shaves the peaks off the skyline.
// Cover: the share of forest, rock (rock and scree) and ice (glacier) in the vertex's window, from the swissTLM3D land
// cover rasterised at 50 m, and the share of the window that swissTLM3D covers at all (none outside Switzerland).
import fs from 'node:fs';
import path from 'node:path';
import { FAR_POOL_M, FAR_POOL_N } from './cache.mjs';
import { HeightField } from './photos/horizon.mjs';
import { COVER } from './landcover.mjs';

export const LEVELS = Object.freeze([
  Object.freeze({ cellM: 250, reachM: 16000 }),
  Object.freeze({ cellM: 800, reachM: 40000 })
]);
export const NO_DATA = -32768;
// Bytes of cover per vertex: forest, rock, ice, known (each 0 to 255)
export const SHARE_BYTES = 4;
const COVER_CELL_M = FAR_POOL_M;
const QUERY_STEP_M = 10000;
const UNKNOWN = 255;
// Later entries paint over earlier ones (landcover.mjs keeps the same order)
const RANK = [COVER.grass, COVER.openForest, COVER.forest, COVER.scree, COVER.rock, COVER.glacier, COVER.water, COVER.settlement];

export const COPERNICUS_NOTICE = 'produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved. The organisations in charge of the Copernicus programme by law or by delegation do not incur any liability for any use of the Copernicus WorldDEM-30.';

// swissALTI3D at 50 m from the cache: per 1 km tile a 20 x 20 mean then a 20 x 20 max, rows north to south
export class AltiFar {
  constructor(dir) {
    this.dir = dir;
    this.tiles = new Map();
  }

  tile(kmE, kmN) {
    const key = `${kmE}-${kmN}`;
    if (!this.tiles.has(key)) {
      const file = path.join(this.dir, `${key}.bin`);
      if (!fs.existsSync(file)) this.tiles.set(key, null);
      else {
        const b = fs.readFileSync(file);
        const all = new Float32Array(b.buffer, b.byteOffset, b.length / 4);
        const n = FAR_POOL_N * FAR_POOL_N;
        this.tiles.set(key, { mean: all.subarray(0, n), max: all.subarray(n, 2 * n) });
      }
    }
    return this.tiles.get(key);
  }

  // {mean, max} of the 50 m cell holding (e, n), or null
  cell(e, n) {
    const t = this.tile(Math.floor(e / 1000), Math.floor(n / 1000));
    if (!t) return null;
    const c = Math.min(FAR_POOL_N - 1, Math.floor((e - Math.floor(e / 1000) * 1000) / FAR_POOL_M));
    const r = Math.min(FAR_POOL_N - 1, Math.floor(((Math.floor(n / 1000) + 1) * 1000 - n) / FAR_POOL_M));
    const k = r * FAR_POOL_N + c;
    const mean = t.mean[k], max = t.max[k];
    return Number.isNaN(mean) ? null : { mean, max };
  }
}

// The level boxes round the middle of far.bin, on whole cells
export function levelBoxes(far) {
  const cx = far.x0 + ((far.nx - 1) * far.cell) / 2, cz = far.z0 + ((far.nz - 1) * far.cell) / 2;
  return LEVELS.map(({ cellM, reachM }) => {
    const x0 = Math.floor((cx - reachM) / cellM) * cellM, z0 = Math.floor((cz - reachM) / cellM) * cellM;
    const n = Math.ceil((2 * reachM) / cellM) + 1;
    return { x0, z0, nx: n, nz: n, cell: cellM };
  });
}

// Land cover classes on a 50 m grid over a box, from polygons in local metres ({cls, rings}); UNKNOWN where no polygon
// and no height says Switzerland (the caller fills grass where swissTLM3D has land). Scanline fill, rank wins.
export function rasterizeCoverGrid(polys, grid) {
  const { x0, z0, nx, nz, cell } = grid;
  const cls = grid.cls, rank = grid.rank;
  const rankOf = c => RANK.indexOf(c);
  for (const poly of polys) {
    const r = rankOf(poly.cls);
    let zmin = Infinity, zmax = -Infinity;
    for (const [, z] of poly.rings[0]) { zmin = Math.min(zmin, z); zmax = Math.max(zmax, z); }
    const j0 = Math.max(0, Math.ceil((zmin - z0) / cell - 0.5)), j1 = Math.min(nz - 1, Math.floor((zmax - z0) / cell - 0.5));
    for (let j = j0; j <= j1; j++) {
      const z = z0 + (j + 0.5) * cell;
      const xs = [];
      for (const ring of poly.rings) {
        for (let a = 0, b = ring.length - 1; a < ring.length; b = a++) {
          const [xa, za] = ring[a], [xb, zb] = ring[b];
          if ((za > z) !== (zb > z)) xs.push(xa + ((z - za) * (xb - xa)) / (zb - za));
        }
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const i0 = Math.max(0, Math.ceil((xs[k] - x0) / cell - 0.5)), i1 = Math.min(nx - 1, Math.floor((xs[k + 1] - x0) / cell - 0.5));
        for (let i = i0; i <= i1; i++) {
          const at = j * nx + i;
          if (cls[at] === UNKNOWN || r >= rank[at]) { cls[at] = poly.cls; rank[at] = r; }
        }
      }
    }
  }
}

// polysIn(box) gives the cover polygons of a local box [x0, z0, x1, z1]; the grid covers `box`
export function coverGrid(box, polysIn, log = () => {}) {
  const nx = Math.ceil((box[2] - box[0]) / COVER_CELL_M), nz = Math.ceil((box[3] - box[1]) / COVER_CELL_M);
  const grid = { x0: box[0], z0: box[1], nx, nz, cell: COVER_CELL_M, cls: new Uint8Array(nx * nz).fill(UNKNOWN), rank: new Int8Array(nx * nz).fill(-1) };
  let count = 0;
  for (let x = box[0]; x < box[2]; x += QUERY_STEP_M) {
    for (let z = box[1]; z < box[3]; z += QUERY_STEP_M) {
      const polys = polysIn([x, z, Math.min(box[2], x + QUERY_STEP_M), Math.min(box[3], z + QUERY_STEP_M)]);
      count += polys.length;
      rasterizeCoverGrid(polys, grid);
    }
  }
  log(`far cover: ${count} polygons over ${nx} x ${nz} cells`);
  return grid;
}

// The heights and cover shares of one level. heightCell(e, n) -> {mean, max, alti} for a 50 m cell or null.
export function buildLevel(box, { heightCell, cover, origin }) {
  const { x0, z0, nx, nz, cell } = box;
  const heights = new Int16Array(nx * nz);
  const shares = new Uint8Array(nx * nz * SHARE_BYTES);
  const steps = Math.max(1, Math.round(cell / FAR_POOL_M));
  let copernicus = 0;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * cell, z = z0 + j * cell;
      let sum = 0, count = 0, max = -Infinity, forest = 0, rock = 0, ice = 0, known = 0, seen = 0;
      for (let b = 0; b < steps; b++) {
        for (let a = 0; a < steps; a++) {
          const px = x - cell / 2 + (a + 0.5) * (cell / steps), pz = z - cell / 2 + (b + 0.5) * (cell / steps);
          const h = heightCell(px + origin.e0, origin.n0 - pz);
          if (h) {
            sum += h.mean; count++; max = Math.max(max, h.max);
            if (!h.alti) copernicus++;
          }
          if (cover) {
            const ci = Math.floor((px - cover.x0) / cover.cell), cj = Math.floor((pz - cover.z0) / cover.cell);
            const c = ci >= 0 && cj >= 0 && ci < cover.nx && cj < cover.nz ? cover.cls[cj * cover.nx + ci] : UNKNOWN;
            seen++;
            // Inside Switzerland a cell no polygon covers is open land: swissALTI3D says where Switzerland is
            const k = c === UNKNOWN ? (h && h.alti ? COVER.grass : UNKNOWN) : c;
            if (k === UNKNOWN) continue;
            known++;
            if (k === COVER.forest) forest += 1;
            else if (k === COVER.openForest) forest += 0.5;
            else if (k === COVER.rock || k === COVER.scree) rock += 1;
            else if (k === COVER.glacier) ice += 1;
          }
        }
      }
      const v = j * nx + i;
      heights[v] = count ? Math.round(sum / count + 0.5 * (max - sum / count)) : NO_DATA;
      const share = n => (known ? Math.round((255 * n) / known) : 0);
      shares.set([share(forest), share(rock), share(ice), seen ? Math.round((255 * known) / seen) : 0], v * SHARE_BYTES);
    }
  }
  return { ...box, heights, shares, copernicus };
}

// The source of 50 m cells: swissALTI3D where the cache has it, else Copernicus sampled at the cell's quarter points
export function heightCells(altiDir, copernicusTiles) {
  const alti = new AltiFar(altiDir);
  const field = new HeightField({ e0: 0, n0: 0 });
  copernicusTiles.forEach(t => field.addCopernicus(t));
  return (e, n) => {
    const a = alti.cell(e, n);
    if (a) return { ...a, alti: true };
    const q = FAR_POOL_M / 4;
    const vs = [[-q, -q], [q, -q], [-q, q], [q, q]].map(([de, dn]) => field.copernicus(e + de, n + dn)).filter(v => Number.isFinite(v) && v > -500);
    if (!vs.length) return null;
    return { mean: vs.reduce((p, v) => p + v, 0) / vs.length, max: Math.max(...vs), alti: false };
  };
}

// Metres each far.bin vertex is drawn under its height (the runtime Horizon). The 100 m grid is bilinear, and in a
// gully it stands above the tiles' land: a fixed sink lets it poke through. Each cell under a tile is sunk by the most
// its surface stands above the tile vertices in it, plus a margin; a vertex takes the most of its four cells.
// `tiles` maps "tx,tz" to {heights} (TILE_N x TILE_N at CELL_M); cells under no tile keep `base`.
export function horizonSinks(far, tiles, { tileM, tileN, cellM, base = 8, margin = 3 }) {
  const excess = new Float32Array((far.nx - 1) * (far.nz - 1)).fill(-Infinity);
  const at = (i, j) => far.data[j * far.nx + i];
  for (const [key, t] of tiles) {
    const [tx, tz] = key.split(',').map(Number);
    for (let j = 0; j < tileN; j++) {
      for (let i = 0; i < tileN; i++) {
        const x = tx * tileM + i * cellM, z = tz * tileM + j * cellM;
        const fx = (x - far.x0) / far.cell, fz = (z - far.z0) / far.cell;
        const ci = Math.floor(fx), cj = Math.floor(fz);
        if (ci < 0 || cj < 0 || ci >= far.nx - 1 || cj >= far.nz - 1) continue;
        const h = [at(ci, cj), at(ci + 1, cj), at(ci, cj + 1), at(ci + 1, cj + 1)];
        if (h.includes(NO_DATA)) continue;
        const u = fx - ci, v = fz - cj;
        const surface = (h[0] * (1 - u) + h[1] * u) * (1 - v) + (h[2] * (1 - u) + h[3] * u) * v;
        const k = cj * (far.nx - 1) + ci;
        excess[k] = Math.max(excess[k], surface - t.heights[j * tileN + i]);
      }
    }
  }
  const sinks = new Uint8Array(far.nx * far.nz).fill(base);
  for (let j = 0; j < far.nz; j++) {
    for (let i = 0; i < far.nx; i++) {
      let most = -Infinity;
      for (const [a, b] of [[i - 1, j - 1], [i, j - 1], [i - 1, j], [i, j]]) {
        if (a >= 0 && b >= 0 && a < far.nx - 1 && b < far.nz - 1) most = Math.max(most, excess[b * (far.nx - 1) + a]);
      }
      if (Number.isFinite(most)) sinks[j * far.nx + i] = Math.min(255, Math.max(base, Math.ceil(most + margin)));
    }
  }
  return sinks;
}

// The cover shares of far.bin's own vertices (its heights stay as they are: the ground reads them)
export function farCover(far, { heightCell, cover, origin }) {
  return buildLevel({ x0: far.x0, z0: far.z0, nx: far.nx, nz: far.nz, cell: far.cell }, { heightCell, cover, origin }).shares;
}

// Everything the importer writes for the far land, or null without the cache's 50 m heights
export async function buildFarLand(far, { cacheDir, origin, polysIn, log = () => {} }) {
  const altiDir = path.join(cacheDir, 'alti3d', 'far50');
  if (!fs.existsSync(altiDir)) {
    log('far land: no alti3d/far50 in the cache (node tools/world/cache.mjs alti3d-far <bbox>); not built');
    return null;
  }
  const boxes = levelBoxes(far);
  const outer = boxes[boxes.length - 1];
  const copernicusTiles = await HeightField.loadCopernicus(path.join(cacheDir, 'copernicus'));
  const heightCell = heightCells(altiDir, copernicusTiles);
  const cover = coverGrid([outer.x0 - outer.cell, outer.z0 - outer.cell, outer.x0 + outer.nx * outer.cell, outer.z0 + outer.nz * outer.cell], polysIn, log);
  const levels = boxes.map(box => buildLevel(box, { heightCell, cover, origin }));
  const copernicus = levels.reduce((p, l) => p + l.copernicus, 0);
  levels.forEach((l, k) => log(`far land level ${k + 1}: ${l.nx} x ${l.nz} at ${l.cell} m, ${l.heights.filter(h => h === NO_DATA).length} vertices without data`));
  return { levels, cover0: farCover(far, { heightCell, cover, origin }), copernicus: copernicus > 0 };
}

