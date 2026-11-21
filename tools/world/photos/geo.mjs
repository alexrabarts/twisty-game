// Photo positions for the photo-match process: the geo CSVs, WGS84 to LV95 to the world's local metres,
// projection onto a polyline, and clusters of photos taken at one stop.
// Photo positions are private: this module reads them from ~/Pictures/twisty-reference (or a given folder)
// and never writes them into the repo.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { wgs84ToLv95, lv95ToWgs84 } from '../dem.mjs';

export { wgs84ToLv95, lv95ToWgs84 };

export const REFERENCE_DIR = process.env.TWISTY_REFERENCE || path.join(os.homedir(), 'Pictures', 'twisty-reference');

// Local metres of the world: x = E - e0, z = -(N - n0)
export function toLocal(e, n, origin) { return { x: e - origin.e0, z: -(n - origin.n0) }; }
export function fromLocal(x, z, origin) { return { e: x + origin.e0, n: origin.n0 - z }; }

// Compass bearing (0 = north, 90 = east) of a local direction (dx, dz); +z is south
export function bearingOf(dx, dz) { return ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360; }

// Rows {file, lat, lng, csv} of one geo CSV ("file;lat;lng", header first). Bad rows are skipped.
export function parseGeoCsv(text, csv = '') {
  const rows = [];
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  for (const line of lines.slice(1)) {
    const [file, lat, lng] = line.split(';');
    const la = Number(lat), lo = Number(lng);
    if (!file || !Number.isFinite(la) || !Number.isFinite(lo)) continue;
    rows.push({ file: file.trim(), lat: la, lng: lo, csv });
  }
  return rows;
}

// Every row of every *.csv in dir, in file order
export function readGeoCsvs(dir = path.join(REFERENCE_DIR, 'geo')) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.csv')).sort()
    .flatMap(f => parseGeoCsv(fs.readFileSync(path.join(dir, f), 'utf8'), f));
}

// The album folder holding `file`, searched under _all/*. Null when no album has it.
export function findPhoto(file, allDir = path.join(REFERENCE_DIR, '_all')) {
  if (!fs.existsSync(allDir)) return null;
  for (const album of fs.readdirSync(allDir).sort()) {
    const p = path.join(allDir, album, file);
    if (fs.existsSync(p)) return { album, path: p };
  }
  return null;
}

// Nearest point of a polyline [{x, z, s?}] to (x, z): {s, lateral, distance, index, heading}.
// s is measured along the polyline (from each point's own s when given). lateral > 0 is right of the
// direction of travel (x east, z south, y up: right of (fx, fz) is (-fz, fx)).
export function projectOnPolyline(points, x, z) {
  let best = null;
  let sAcc = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i], b = points[i + 1];
    const s0 = a.s ?? sAcc;
    const dx = b.x - a.x, dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    const len = Math.sqrt(len2);
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2)) : 0;
    const px = a.x + dx * t, pz = a.z + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (!best || d < best.distance) {
      const fx = len ? dx / len : 0, fz = len ? dz / len : 1;
      const lateral = (x - px) * -fz + (z - pz) * fx;
      best = { s: s0 + len * t, lateral, distance: d, index: i, heading: bearingOf(dx, dz) };
    }
    sAcc = s0 + len;
  }
  return best;
}

// Distance from (x, z) to the nearest of a set of axis-aligned squares [{x0, z0, size}] (0 inside one)
export function distanceToSquares(squares, x, z) {
  let best = Infinity;
  for (const q of squares) {
    const dx = Math.max(q.x0 - x, 0, x - (q.x0 + q.size));
    const dz = Math.max(q.z0 - z, 0, z - (q.z0 + q.size));
    best = Math.min(best, Math.hypot(dx, dz));
  }
  return best;
}

// Clusters of photos within linkM of each other (single linkage over local metres).
// items: [{x, z, ...}]. Returns [{members: [index], x, z, count, spanM}] largest first.
export function clusterPositions(items, linkM = 120) {
  const parent = items.map((_, i) => i);
  const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  // a grid keeps this linear for the few thousand photos of a trip
  const cell = new Map();
  const key = (i, j) => `${i},${j}`;
  items.forEach((p, k) => {
    const i = Math.floor(p.x / linkM), j = Math.floor(p.z / linkM);
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      for (const o of cell.get(key(i + di, j + dj)) || []) {
        if (Math.hypot(items[o].x - p.x, items[o].z - p.z) <= linkM) parent[find(o)] = find(k);
      }
    }
    const c = key(i, j);
    if (!cell.has(c)) cell.set(c, []);
    cell.get(c).push(k);
  });
  const groups = new Map();
  items.forEach((_, k) => {
    const r = find(k);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(k);
  });
  return [...groups.values()].map(members => {
    const x = members.reduce((a, k) => a + items[k].x, 0) / members.length;
    const z = members.reduce((a, k) => a + items[k].z, 0) / members.length;
    const spanM = Math.max(0, ...members.map(k => Math.hypot(items[k].x - x, items[k].z - z)));
    return { members, x, z, count: members.length, spanM };
  }).sort((a, b) => b.count - a.count);
}

// The coverage list written by `photomatch.mjs coverage` (private, under REFERENCE_DIR), or null
export function readCoverage(file = path.join(REFERENCE_DIR, 'coverage.json')) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

// LV95 boxes [minE, minN, maxE, maxN] an import (or a free-roam corridor) must hold to cover the photo stops
// within reachM of the planned route: each stop's position plus marginM, so the view round it is drawn too.
export function coverageBoxes(coverage, { reachM = 2000, marginM = 1500, stopsOnly = true } = {}) {
  if (!coverage) return [];
  return coverage.clusters
    .filter(c => (!stopsOnly || c.stop) && c.plannedRoute && c.plannedRoute.distanceM <= reachM)
    .map(c => [c.lv95.e - marginM, c.lv95.n - marginM, c.lv95.e + marginM, c.lv95.n + marginM]);
}
