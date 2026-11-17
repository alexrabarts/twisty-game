// swissALTI3D reader: 2 m COG tiles from the cache, sampled bilinearly in LV95.
// geotiff is a devDependency: the importer runs on Node and never in the page.
import fs from 'node:fs';
import path from 'node:path';
import { fromFile } from 'geotiff';

// swisstopo's approximate formulas (about 1 m), used only to ask the STAC API for tiles.
export function lv95ToWgs84(e, n) {
  const y = (e - 2600000) / 1e6;
  const x = (n - 1200000) / 1e6;
  const lon = (2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x * x - 0.0436 * y ** 3) * 100 / 36;
  const lat = (16.9023892 + 3.238272 * x - 0.270978 * y * y - 0.002528 * x * x - 0.0447 * y * y * x - 0.0140 * x ** 3) * 100 / 36;
  return { lon, lat };
}

export function wgs84ToLv95(lon, lat) {
  const p = (lat * 3600 - 169028.66) / 10000;
  const l = (lon * 3600 - 26782.5) / 10000;
  const e = 2600072.37 + 211455.93 * l - 10938.51 * l * p - 0.36 * l * p * p - 44.54 * l ** 3;
  const n = 1200147.07 + 308807.95 * p + 3745.25 * l * l + 76.63 * p * p - 194.56 * l * l * p + 119.79 * p ** 3;
  return { e, n };
}

// WGS84 bbox [west, south, east, north] of an LV95 box, for the STAC query.
export function wgs84Bbox([minE, minN, maxE, maxN]) {
  const corners = [[minE, minN], [minE, maxN], [maxE, minN], [maxE, maxN]].map(([e, n]) => lv95ToWgs84(e, n));
  return [Math.min(...corners.map(c => c.lon)), Math.min(...corners.map(c => c.lat)), Math.max(...corners.map(c => c.lon)), Math.max(...corners.map(c => c.lat))];
}

const TILE_KM_RE = /^swissalti3d_(\d{4})_(\d+)-(\d+)_2_2056_5728\.tif$/;

export class Dem {
  // dir holds the 2 m tiles. Where a tile exists for several years the newest wins.
  constructor(dir) {
    this.dir = dir;
    this.files = new Map();
    for (const name of fs.existsSync(dir) ? fs.readdirSync(dir).sort() : []) {
      const m = TILE_KM_RE.exec(name);
      if (!m) continue;
      const key = `${m[2]}-${m[3]}`;
      const prev = this.files.get(key);
      if (!prev || Number(m[1]) > prev.year) this.files.set(key, { year: Number(m[1]), file: path.join(dir, name) });
    }
    this.tiles = new Map();
  }

  hasTile(kmE, kmN) { return this.files.has(`${kmE}-${kmN}`); }

  // Reads the 1 km tile whose south-west corner is (kmE, kmN) km. Returns false when the cache has none.
  async load(kmE, kmN) {
    const key = `${kmE}-${kmN}`;
    if (this.tiles.has(key)) return true;
    const f = this.files.get(key);
    if (!f) return false;
    const image = await (await fromFile(f.file)).getImage();
    const [minE, , maxE, maxN] = image.getBoundingBox();
    const w = image.getWidth(), h = image.getHeight();
    const data = await image.readRasters({ interleave: true });
    this.tiles.set(key, { minE, maxN, res: (maxE - minE) / w, w, h, data: Float32Array.from(data), noData: image.getGDALNoData() });
    return true;
  }

  // Loads every tile under an LV95 box so that sample() stays synchronous. Returns the count loaded.
  async preload([minE, minN, maxE, maxN]) {
    let count = 0;
    for (let kE = Math.floor(minE / 1000); kE <= Math.floor(maxE / 1000); kE++) {
      for (let kN = Math.floor(minN / 1000); kN <= Math.floor(maxN / 1000); kN++) {
        if (await this.load(kE, kN)) count++;
      }
    }
    return count;
  }

  // Height of the pixel under (e, n), NaN where there is no tile.
  pixel(e, n) {
    const t = this.tiles.get(`${Math.floor(e / 1000)}-${Math.floor(n / 1000)}`);
    if (!t) return NaN;
    const col = Math.min(t.w - 1, Math.floor((e - t.minE) / t.res));
    const row = Math.min(t.h - 1, Math.floor((t.maxN - n) / t.res));
    const v = t.data[row * t.w + col];
    return v === t.noData || !(v > -500) ? NaN : v;
  }

  // Bilinear height at (e, n); pixel values sit at pixel centres.
  sample(e, n) {
    const res = 2;
    const gx = e / res - 0.5, gn = n / res - 0.5;
    const i = Math.floor(gx), j = Math.floor(gn);
    const fx = gx - i, fy = gn - j;
    const v00 = this.pixel((i + 0.5) * res, (j + 0.5) * res);
    const v10 = this.pixel((i + 1.5) * res, (j + 0.5) * res);
    const v01 = this.pixel((i + 0.5) * res, (j + 1.5) * res);
    const v11 = this.pixel((i + 1.5) * res, (j + 1.5) * res);
    const vs = [v00, v10, v01, v11];
    if (vs.every(Number.isNaN)) return NaN;
    const near = vs.find(v => !Number.isNaN(v));
    const [a, b, c, d] = vs.map(v => (Number.isNaN(v) ? near : v));
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  }
}
