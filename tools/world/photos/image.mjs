// Plain image work for the photo match, on {width, height, data: Uint8Array RGBA} images:
// BMP read and write (macOS `sips` converts JPEG and HEIC to and from BMP), the sky/terrain boundary of a photo,
// per-region colour statistics, and the side-by-side picture. Only plain image statistics: no face or person
// recognition, and no crop of a photo is ever written on its own.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export function makeImage(width, height) { return { width, height, data: new Uint8Array(width * height * 4) }; }

// 24- or 32-bit uncompressed BMP, top-down or bottom-up
export function decodeBmp(buf) {
  if (buf.toString('latin1', 0, 2) !== 'BM') throw new Error('not a BMP');
  const offset = buf.readUInt32LE(10);
  const width = buf.readInt32LE(18);
  const rawH = buf.readInt32LE(22);
  const bpp = buf.readUInt16LE(28);
  const compression = buf.readUInt32LE(30);
  if ((bpp !== 24 && bpp !== 32) || (compression !== 0 && compression !== 3)) throw new Error(`BMP of ${bpp} bits, compression ${compression}`);
  const height = Math.abs(rawH);
  const stride = Math.ceil((width * bpp) / 32) * 4;
  const img = makeImage(width, height);
  for (let y = 0; y < height; y++) {
    const row = offset + (rawH < 0 ? y : height - 1 - y) * stride;
    for (let x = 0; x < width; x++) {
      const p = row + x * (bpp / 8), q = (y * width + x) * 4;
      img.data[q] = buf[p + 2]; img.data[q + 1] = buf[p + 1]; img.data[q + 2] = buf[p]; img.data[q + 3] = 255;
    }
  }
  return img;
}

export function encodeBmp(img) {
  const stride = Math.ceil((img.width * 3) / 4) * 4;
  const buf = Buffer.alloc(54 + stride * img.height);
  buf.write('BM', 0, 'latin1');
  buf.writeUInt32LE(buf.length, 2);
  buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(img.width, 18);
  buf.writeInt32LE(-img.height, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(stride * img.height, 34);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const p = 54 + y * stride + x * 3, q = (y * img.width + x) * 4;
      buf[p] = img.data[q + 2]; buf[p + 1] = img.data[q + 1]; buf[p + 2] = img.data[q];
    }
  }
  return buf;
}

// Reads any image sips can open (JPEG, HEIC, PNG) at most maxSide pixels on its long side, upright
// (sips applies the EXIF orientation when it writes the BMP)
export function readImage(file, maxSide, tmpDir) {
  const out = path.join(tmpDir, `read-${process.pid}-${Date.now()}.bmp`);
  execFileSync('sips', ['-s', 'format', 'bmp', '--resampleHeightWidthMax', String(maxSide), file, '--out', out], { stdio: 'ignore' });
  const img = decodeBmp(fs.readFileSync(out));
  fs.rmSync(out, { force: true });
  return img;
}

export function writeJpeg(img, file, tmpDir, quality = 85) {
  const bmp = path.join(tmpDir, `write-${process.pid}-${Date.now()}.bmp`);
  fs.writeFileSync(bmp, encodeBmp(img));
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', String(quality), bmp, '--out', file], { stdio: 'ignore' });
  fs.rmSync(bmp, { force: true });
}

// The JPEG bytes of a photo for its EXIF: HEIC goes through sips to a temporary JPEG, which keeps the EXIF
export function jpegBytesFor(file, tmpDir) {
  if (/\.jpe?g$/i.test(file)) return fs.readFileSync(file);
  const out = path.join(tmpDir, `exif-${process.pid}-${Date.now()}.jpg`);
  execFileSync('sips', ['-s', 'format', 'jpeg', file, '--out', out], { stdio: 'ignore' });
  const buf = fs.readFileSync(out);
  fs.rmSync(out, { force: true });
  return buf;
}

// Bilinear resize
export function resize(img, width, height) {
  const out = makeImage(width, height);
  for (let y = 0; y < height; y++) {
    const sy = Math.max(0, Math.min(img.height - 1, ((y + 0.5) * img.height) / height - 0.5));
    const y0 = Math.floor(sy), y1 = Math.min(img.height - 1, y0 + 1), fy = sy - y0;
    for (let x = 0; x < width; x++) {
      const sx = Math.max(0, Math.min(img.width - 1, ((x + 0.5) * img.width) / width - 0.5));
      const x0 = Math.floor(sx), x1 = Math.min(img.width - 1, x0 + 1), fx = sx - x0;
      for (let c = 0; c < 4; c++) {
        const a = img.data[(y0 * img.width + x0) * 4 + c], b = img.data[(y0 * img.width + x1) * 4 + c];
        const d = img.data[(y1 * img.width + x0) * 4 + c], e = img.data[(y1 * img.width + x1) * 4 + c];
        out.data[(y * width + x) * 4 + c] = Math.round((a * (1 - fx) + b * fx) * (1 - fy) + (d * (1 - fx) + e * fx) * fy);
      }
    }
  }
  return out;
}

// Luminance, saturation and hue (0..1, 0..1, 0..360) of an RGB pixel
export function pixelHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const sat = max > 0 ? (max - min) / max : 0;
  let hue = 0;
  if (max > min) {
    if (max === r) hue = 60 * (((g - b) / (max - min)) % 6);
    else if (max === g) hue = 60 * ((b - r) / (max - min) + 2);
    else hue = 60 * ((r - g) / (max - min) + 4);
    if (hue < 0) hue += 360;
  }
  return { lum, sat, hue };
}

// The sky/terrain boundary of a mask (true = sky), top down, for a rendered mask
export function skylineFromMask(mask, width, height) {
  const rows = new Float32Array(width).fill(NaN);
  for (let x = 0; x < width; x++) {
    if (!mask[x]) continue;
    let y = 0;
    while (y < height && mask[y * width + x]) y++;
    if (y < height) rows[x] = y;
  }
  return rows;
}

const HUE_BINS = 12, LUM_BINS = 8;

// Colour statistics of the pixels where select(x, y) is true
export function regionStats(img, select) {
  const { width, height, data } = img;
  let n = 0, r = 0, g = 0, b = 0, lum = 0, sat = 0, green = 0, darkGreen = 0, grey = 0, snow = 0, edge = 0;
  const hue = new Float64Array(HUE_BINS), lumHist = new Float64Array(LUM_BINS);
  const L = (x, y) => { const q = (y * width + x) * 4; return (0.2126 * data[q] + 0.7152 * data[q + 1] + 0.0722 * data[q + 2]) / 255; };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!select(x, y)) continue;
      const q = (y * width + x) * 4;
      const p = pixelHsl(data[q], data[q + 1], data[q + 2]);
      n++; r += data[q]; g += data[q + 1]; b += data[q + 2]; lum += p.lum; sat += p.sat;
      hue[Math.min(HUE_BINS - 1, Math.floor(p.hue / (360 / HUE_BINS)))] += p.sat;
      lumHist[Math.min(LUM_BINS - 1, Math.floor(p.lum * LUM_BINS))]++;
      const isGreen = data[q + 1] > data[q] * 1.04 && data[q + 1] >= data[q + 2] && p.sat > 0.12;
      if (isGreen) { green++; if (p.lum < 0.25) darkGreen++; }
      if (p.sat < 0.14 && p.lum > 0.82) snow++;
      else if (p.sat < 0.2 && p.lum > 0.2 && !isGreen) grey++;
      if (x + 1 < width && y + 1 < height) edge += Math.abs(L(x + 1, y) - p.lum) + Math.abs(L(x, y + 1) - p.lum);
    }
  }
  if (!n) return { pixels: 0 };
  const hs = hue.reduce((a, v) => a + v, 0) || 1;
  return {
    pixels: n,
    share: n / (width * height),
    meanRgb: [r / n, g / n, b / n].map(v => Math.round(v)),
    lum: lum / n, sat: sat / n,
    greenShare: green / n, treeShare: darkGreen / n, rockShare: grey / n, snowShare: snow / n,
    // mean step in luminance to the next pixel: how much detail (texture) the region holds
    detail: edge / n,
    hueHist: Array.from(hue, v => v / hs),
    lumHist: Array.from(lumHist, v => v / n)
  };
}

// L1 distance of two histograms (0 same, 2 disjoint)
export function histDistance(a, b) {
  if (!a || !b) return null;
  return a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0);
}

// The gaps between the photo's and the game's statistics of one region (game minus photo)
export function statGaps(photo, game) {
  if (!photo || !game || !photo.pixels || !game.pixels) return null;
  const d = k => +(game[k] - photo[k]).toFixed(3);
  return {
    meanRgb: game.meanRgb.map((v, i) => v - photo.meanRgb[i]),
    lum: d('lum'), sat: d('sat'), greenShare: d('greenShare'), treeShare: d('treeShare'),
    rockShare: d('rockShare'), snowShare: d('snowShare'), detail: d('detail'),
    hueHistL1: +histDistance(photo.hueHist, game.hueHist).toFixed(3),
    lumHistL1: +histDistance(photo.lumHist, game.lumHist).toFixed(3)
  };
}

// Two images of the same size side by side with a gap
export function sideBySide(left, right, gap = 8) {
  const out = makeImage(left.width + gap + right.width, Math.max(left.height, right.height));
  out.data.fill(255);
  const blit = (img, ox) => {
    for (let y = 0; y < img.height; y++) out.data.set(img.data.subarray(y * img.width * 4, (y + 1) * img.width * 4), (y * out.width + ox) * 4);
  };
  blit(left, 0);
  blit(right, left.width + gap);
  return out;
}

// Draws a polyline of rows per column (NaN = gap) in a colour, for the overlay pictures
export function drawRows(img, rows, rgb, thick = 1) {
  for (let x = 0; x < img.width && x < rows.length; x++) {
    const y = rows[x];
    if (!Number.isFinite(y)) continue;
    for (let t = -thick; t <= thick; t++) {
      const yy = Math.round(y) + t;
      if (yy < 0 || yy >= img.height) continue;
      const q = (yy * img.width + x) * 4;
      img.data[q] = rgb[0]; img.data[q + 1] = rgb[1]; img.data[q + 2] = rgb[2];
    }
  }
}

export function copyImage(img) { return { width: img.width, height: img.height, data: Uint8Array.from(img.data) }; }
