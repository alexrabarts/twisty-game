// The skyline a camera sees over a height field, and the camera pose that lines a photo's skyline up with it.
// Angles in degrees. Bearing: 0 north, 90 east. Pitch > 0 looks up. Roll > 0 turns the image clockwise.
// Local metres: x east, z south, y up (the world's frame).
import fs from 'node:fs';
import path from 'node:path';
import { lv95ToWgs84 } from '../dem.mjs';

const RAD = Math.PI / 180;
// Earth radius and the usual refraction coefficient: a far point drops d^2 (1 - k) / 2R
const EARTH_R = 6371000, REFRACTION_K = 0.13;
export const dropAt = d => (d * d * (1 - REFRACTION_K)) / (2 * EARTH_R);

// Heights from swissALTI3D tiles (2 m, from tools/world/dem.mjs Dem.tiles) and, where none is cached, from
// Copernicus GLO-30 tiles (WGS84 1" grid). heightAt(x, z) in local metres, NaN where neither has data.
export class HeightField {
  constructor(origin) {
    this.origin = origin;
    this.alti = new Map();
    this.cop = [];
  }

  addAltiTile(kmE, kmN, tile) { this.alti.set(kmE * 100000 + kmN, tile); }

  addCopernicus(tile) { this.cop.push(tile); }

  static async loadCopernicus(dir) {
    const out = [];
    if (!fs.existsSync(dir)) return out;
    const { fromFile } = await import('geotiff');
    for (const name of fs.readdirSync(dir).filter(f => f.endsWith('.tif')).sort()) {
      const image = await (await fromFile(path.join(dir, name))).getImage();
      const [west, south, east, north] = image.getBoundingBox();
      const w = image.getWidth(), h = image.getHeight();
      const data = Float32Array.from(await image.readRasters({ interleave: true }));
      out.push({ west, south, east, north, w, h, data, name });
    }
    return out;
  }

  alti3d(e, n) {
    const t = this.alti.get(Math.floor(e / 1000) * 100000 + Math.floor(n / 1000));
    if (!t) return NaN;
    const gx = (e - t.minE) / t.res - 0.5, gy = (t.maxN - n) / t.res - 0.5;
    const i = Math.max(0, Math.min(t.w - 2, Math.floor(gx))), j = Math.max(0, Math.min(t.h - 2, Math.floor(gy)));
    const fx = Math.max(0, Math.min(1, gx - i)), fy = Math.max(0, Math.min(1, gy - j));
    const d = t.data, w = t.w;
    const a = d[j * w + i], b = d[j * w + i + 1], c = d[(j + 1) * w + i], q = d[(j + 1) * w + i + 1];
    if (!(a > -500 && b > -500 && c > -500 && q > -500)) return a > -500 ? a : NaN;
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + q * fx) * fy;
  }

  copernicus(e, n) {
    if (!this.cop.length) return NaN;
    const { lon, lat } = lv95ToWgs84(e, n);
    for (const t of this.cop) {
      if (lon < t.west || lon >= t.east || lat <= t.south || lat > t.north) continue;
      const gx = ((lon - t.west) / (t.east - t.west)) * t.w - 0.5, gy = ((t.north - lat) / (t.north - t.south)) * t.h - 0.5;
      const i = Math.max(0, Math.min(t.w - 2, Math.floor(gx))), j = Math.max(0, Math.min(t.h - 2, Math.floor(gy)));
      const fx = Math.max(0, Math.min(1, gx - i)), fy = Math.max(0, Math.min(1, gy - j));
      const d = t.data, w = t.w;
      return (d[j * w + i] * (1 - fx) + d[j * w + i + 1] * fx) * (1 - fy) + (d[(j + 1) * w + i] * (1 - fx) + d[(j + 1) * w + i + 1] * fx) * fy;
    }
    return NaN;
  }

  heightAt(x, z) {
    const e = x + this.origin.e0, n = this.origin.n0 - z;
    const h = this.alti3d(e, n);
    return Number.isNaN(h) ? this.copernicus(e, n) : h;
  }

  // Which source answers at (x, z): 'alti3d', 'copernicus' or null
  sourceAt(x, z) {
    const e = x + this.origin.e0, n = this.origin.n0 - z;
    if (!Number.isNaN(this.alti3d(e, n))) return 'alti3d';
    return Number.isNaN(this.copernicus(e, n)) ? null : 'copernicus';
  }
}

// Horizon of a camera at (x, eyeY, z): for each bearing bin the highest elevation angle of the ground,
// and the distance to it. heightAt(x, z) -> metres or NaN.
export function horizonProfile(heightAt, x, z, eyeY, { binDeg = 0.1, maxDist = 60000, minDist = 4 } = {}) {
  const bins = Math.round(360 / binDeg);
  const elev = new Float32Array(bins), dist = new Float32Array(bins);
  for (let k = 0; k < bins; k++) {
    const b = k * binDeg * RAD;
    const dx = Math.sin(b), dz = -Math.cos(b);
    let best = -90, bestD = 0;
    for (let d = minDist; d < maxDist; d += Math.max(2, d * 0.006)) {
      const h = heightAt(x + dx * d, z + dz * d);
      if (Number.isNaN(h)) continue;
      const a = Math.atan2(h - dropAt(d) - eyeY, d) / RAD;
      if (a > best) { best = a; bestD = d; }
    }
    elev[k] = best; dist[k] = bestD;
  }
  return { binDeg, elev, dist };
}

export function profileAt(profile, bearing) {
  const n = profile.elev.length;
  const f = (((bearing % 360) + 360) % 360) / profile.binDeg;
  const i = Math.floor(f) % n, j = (i + 1) % n, t = f - Math.floor(f);
  return profile.elev[i] * (1 - t) + profile.elev[j] * t;
}

// World direction of image pixel (u, v) for a camera {bearing, pitch, roll, focalPx, cx, cy}: the three.js
// camera with rotation order YXZ, rotation.y = -bearing, rotation.x = pitch, rotation.z = roll.
export function pixelRay(u, v, cam, out = {}) {
  let x = (u - cam.cx) / cam.focalPx, y = -(v - cam.cy) / cam.focalPx, z = -1;
  const cr = Math.cos(cam.roll * RAD), sr = Math.sin(cam.roll * RAD);
  [x, y] = [x * cr - y * sr, x * sr + y * cr];
  const cp = Math.cos(cam.pitch * RAD), sp = Math.sin(cam.pitch * RAD);
  [y, z] = [y * cp - z * sp, y * sp + z * cp];
  const yb = -cam.bearing * RAD, cb = Math.cos(yb), sb = Math.sin(yb);
  [x, z] = [x * cb + z * sb, -x * sb + z * cb];
  const len = Math.hypot(x, y, z);
  out.x = x / len; out.y = y / len; out.z = z / len;
  return out;
}

// Image row where the horizon crosses column u, for the overlay pictures (NaN when off the image)
export function horizonRows(profile, cam, width, height) {
  const rows = new Float32Array(width).fill(NaN);
  const ray = {};
  for (let u = 0; u < width; u++) {
    // the elevation of the ray grows as v falls: bisect v in [-height, 2 height]
    let lo = -height, hi = 2 * height;
    for (let k = 0; k < 30; k++) {
      const v = (lo + hi) / 2;
      pixelRay(u + 0.5, v, cam, ray);
      const b = (Math.atan2(ray.x, -ray.z) / RAD + 360) % 360;
      const el = Math.atan2(ray.y, Math.hypot(ray.x, ray.z)) / RAD;
      if (el > profileAt(profile, b)) lo = v; else hi = v;
    }
    const v = (lo + hi) / 2;
    if (v >= 0 && v < height) rows[u] = v;
  }
  return rows;
}

// Per-pixel distance to the ground along each ray of a w x h grid over the image (Infinity where the ray
// meets no ground within maxDist), and the ground point hit. For the region masks (near, mid, far, road).
export function depthGrid(heightAt, eye, cam, w, h, { maxDist = 40000 } = {}) {
  const dist = new Float32Array(w * h), hitX = new Float32Array(w * h), hitZ = new Float32Array(w * h);
  const ray = {};
  const sx = cam.width / w, sy = cam.height / h;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      pixelRay((i + 0.5) * sx, (j + 0.5) * sy, cam, ray);
      let found = Infinity, prevT = 0;
      for (let t = 1; t < maxDist; t += Math.max(1, t * 0.01)) {
        const px = eye.x + ray.x * t, pz = eye.z + ray.z * t;
        const gy = heightAt(px, pz);
        if (Number.isNaN(gy)) { prevT = t; continue; }
        const horizontal = t * Math.hypot(ray.x, ray.z);
        if (eye.y + ray.y * t - dropAt(horizontal) <= gy) { found = (t + prevT) / 2; break; }
        prevT = t;
      }
      const k = j * w + i;
      dist[k] = found;
      hitX[k] = Number.isFinite(found) ? eye.x + ray.x * found : NaN;
      hitZ[k] = Number.isFinite(found) ? eye.z + ray.z * found : NaN;
    }
  }
  return { w, h, dist, hitX, hitZ };
}

// ---------------------------------------------------------------- fitting by the sky/ground step
// A photo's own sky/terrain boundary is hard to cut by colour alone: haze makes far ridges as pale as the sky,
// and clouds sit on the ridges. So the fit does not cut it first. It scores a camera by how sharply the image
// goes from sky-like to ground-like across the line where that camera puts the real skyline.

// Skyness of each pixel: bright and blue reads as sky, dark or green as ground
export function skynessMap(img) {
  const { width, height, data } = img;
  const out = new Float32Array(width * height);
  for (let k = 0; k < width * height; k++) {
    const r = data[k * 4], g = data[k * 4 + 1], b = data[k * 4 + 2];
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    out[k] = lum + 0.5 * Math.max(0, (b - r) / 255) - 0.3 * Math.max(0, (g - Math.max(r, b)) / 255);
  }
  return out;
}

// Image point (u, v) where the horizon crosses the camera's column through image-plane x' (roll-free frame,
// pixels from the centre). Solves the elevation in closed form, three passes for the bearing it depends on.
export function horizonPoint(profile, cam, xPrime, out = {}) {
  const a = xPrime / cam.focalPx;
  const p = cam.pitch * RAD, cp = Math.cos(p), sp = Math.sin(p);
  let b = 0;
  for (let pass = 0; pass < 3; pass++) {
    const off = Math.atan2(a, cp - b * sp) / RAD;
    const t = Math.tan(profileAt(profile, cam.bearing + off) * RAD);
    // (b cp + sp)^2 = t^2 (a^2 + (b sp - cp)^2), with b cp + sp of the sign of t
    const A = cp * cp - t * t * sp * sp, B = 2 * (cp * sp + t * t * sp * cp), C = sp * sp - t * t * (a * a + cp * cp);
    const disc = B * B - 4 * A * C;
    if (disc < 0 || Math.abs(A) < 1e-9) return null;
    const r1 = (-B + Math.sqrt(disc)) / (2 * A), r2 = (-B - Math.sqrt(disc)) / (2 * A);
    b = Math.sign(r1 * cp + sp) === Math.sign(t) || t === 0 ? r1 : r2;
  }
  // roll-free camera coordinates (a, b) back to the image: undo the roll
  const cr = Math.cos(cam.roll * RAD), sr = Math.sin(cam.roll * RAD);
  const x = a * cr + b * sr, y = -a * sr + b * cr;
  out.u = cam.cx + x * cam.focalPx;
  out.v = cam.cy - y * cam.focalPx;
  return out;
}

// Mean sky-to-ground step across the camera's skyline, over `columns` evenly spread columns. A column whose
// skyline falls outside the image scores 0, so a camera cannot win by putting the skyline off the picture.
export function stepScore(sky, width, height, profile, cam, columns = 80, band = [2, 7]) {
  let sum = 0;
  const pt = {};
  for (let c = 0; c < columns; c++) {
    const xPrime = ((c + 0.5) / columns - 0.5) * width;
    if (!horizonPoint(profile, cam, xPrime, pt)) continue;
    const u = Math.round(pt.u), v = Math.round(pt.v);
    if (u < 0 || u >= width || v - band[1] < 0 || v + band[1] >= height) continue;
    let above = 0, below = 0;
    for (let d = band[0]; d <= band[1]; d++) { above += sky[(v - d) * width + u]; below += sky[(v + d) * width + u]; }
    const step = (above - below) / (band[1] - band[0] + 1);
    sum += Math.max(-0.2, Math.min(0.4, step));
  }
  return sum / columns;
}

// The camera {bearing, pitch, roll, scale, focalPx, score} with the sharpest sky-to-ground step along the real
// skyline. apartScore: the best score at a bearing at least apartDeg away (near the best: ambiguous).
export function fitPose(img, profile, { focalPx, pitchRange = 30, apartDeg = 12, scaleRange = 0.12 } = {}) {
  const { width, height } = img;
  const sky = skynessMap(img);
  const base = { cx: width / 2, cy: height / 2, focalPx, roll: 0 };
  const byBearing = new Float64Array(360).fill(-Infinity), pitchAt = new Float64Array(360);
  // The coarse grid steps pitch by 0.75 deg; its band reaches past half a step so the step is never missed
  const coarseBand = [2, Math.max(8, Math.round(focalPx * Math.tan(0.5 * RAD)) + 4)];
  for (let b = 0; b < 360; b++) {
    for (let p = -pitchRange; p <= pitchRange; p += 0.75) {
      const s = stepScore(sky, width, height, profile, { ...base, bearing: b, pitch: p }, 48, coarseBand);
      if (s > byBearing[b]) { byBearing[b] = s; pitchAt[b] = p; }
    }
  }
  const order = [...byBearing.keys()].sort((x, y) => byBearing[y] - byBearing[x]);
  const seeds = [];
  for (const b of order) if (seeds.length < 4 && seeds.every(s => Math.abs(((b - s + 540) % 360) - 180) >= apartDeg)) seeds.push(b);
  const refined = [];
  const fine = cam => stepScore(sky, width, height, profile, cam, 160);
  for (const seed of seeds) {
    let cam = { ...base, bearing: seed, pitch: pitchAt[seed], roll: 0 };
    let scale = 1, score = fine(cam);
    for (const step of [0.5, 0.2, 0.05]) {
      let moved = true;
      for (let it = 0; moved && it < 60; it++) {
        moved = false;
        for (const [key, d] of [['bearing', step], ['bearing', -step], ['pitch', step], ['pitch', -step], ['roll', step * 2], ['roll', -step * 2], ['scale', step / 25], ['scale', -step / 25]]) {
          const trial = { ...cam };
          let trialScale = scale;
          if (key === 'scale') {
            trialScale = scale + d;
            if (Math.abs(trialScale - 1) > scaleRange) continue;
            trial.focalPx = focalPx * trialScale;
          } else {
            trial[key] += d;
            if (key === 'roll' && Math.abs(trial.roll) > 8) continue;
          }
          const s = fine(trial);
          if (s > score + 1e-6) { cam = trial; scale = trialScale; score = s; moved = true; }
        }
      }
    }
    refined.push({ bearing: (cam.bearing + 360) % 360, pitch: cam.pitch, roll: cam.roll, scale, focalPx: cam.focalPx, score });
  }
  // The runner-up is refined the same way, so the two scores compare like for like
  refined.sort((x, y) => y.score - x.score);
  const best = refined[0];
  const apart = refined.slice(1).filter(r => Math.abs(((r.bearing - best.bearing + 540) % 360) - 180) >= apartDeg).reduce((m, r) => Math.max(m, r.score), -Infinity);
  return { ...best, apartScore: apart, candidates: refined.map(r => ({ bearing: +r.bearing.toFixed(2), pitch: +r.pitch.toFixed(2), score: +r.score.toFixed(4) })), sky };
}

// The photo's skyline, guided by the fitted camera: in each column, the row of the sharpest sky-to-ground step
// within `reach` of the real skyline's row. A column whose best step is weak (a person, a roof or a cloud bank
// hides the ridge) is NaN. Returns {rows, strength} per column.
export function guidedSkyline(sky, width, height, demRows, { reach = 0.05, minStep = 0.06, band = [2, 6] } = {}) {
  const rows = new Float32Array(width).fill(NaN), strength = new Float32Array(width);
  const r = Math.round(reach * height);
  for (let u = 0; u < width; u++) {
    const v0 = demRows[u];
    if (!Number.isFinite(v0)) continue;
    let bestV = NaN, bestS = -Infinity;
    for (let v = Math.max(band[1], Math.round(v0) - r); v <= Math.min(height - band[1] - 1, Math.round(v0) + r); v++) {
      let above = 0, below = 0;
      for (let d = band[0]; d <= band[1]; d++) { above += sky[(v - d) * width + u]; below += sky[(v + d) * width + u]; }
      const s = (above - below) / (band[1] - band[0] + 1);
      if (s > bestS) { bestS = s; bestV = v; }
    }
    strength[u] = bestS;
    if (bestS >= minStep) rows[u] = bestV;
  }
  return { rows, strength };
}
