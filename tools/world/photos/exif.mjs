// EXIF of a JPEG (the APP1 "Exif" segment, a TIFF block) and the camera's field of view.
// Only the tags the photo match needs are read: make, model, date, orientation, focal length and its 35 mm
// equivalent. GPS is not read: the positions come from the geo CSVs.

const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

function readIfd(buf, tiff, offset, little) {
  const u16 = o => (little ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
  const u32 = o => (little ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
  const out = new Map();
  if (tiff + offset + 2 > buf.length) return out;
  const count = u16(tiff + offset);
  for (let k = 0; k < count; k++) {
    const e = tiff + offset + 2 + k * 12;
    if (e + 12 > buf.length) break;
    const tag = u16(e), type = u16(e + 2), n = u32(e + 4);
    const size = (TYPE_SIZE[type] || 1) * n;
    const at = size <= 4 ? e + 8 : tiff + u32(e + 8);
    if (at + size > buf.length) continue;
    let value;
    if (type === 2) value = buf.toString('latin1', at, at + n).replace(/\0+$/, '').trim();
    else if (type === 3) value = u16(at);
    else if (type === 4) value = u32(at);
    else if (type === 5 || type === 10) {
      const num = little ? (type === 5 ? buf.readUInt32LE(at) : buf.readInt32LE(at)) : (type === 5 ? buf.readUInt32BE(at) : buf.readInt32BE(at));
      const den = little ? (type === 5 ? buf.readUInt32LE(at + 4) : buf.readInt32LE(at + 4)) : (type === 5 ? buf.readUInt32BE(at + 4) : buf.readInt32BE(at + 4));
      value = den ? num / den : null;
    } else value = null;
    out.set(tag, value);
  }
  return out;
}

// {make, model, date, orientation, focalMm, focal35, width, height} from a JPEG buffer; null fields when absent
export function readExif(buf) {
  const empty = { make: null, model: null, date: null, orientation: 1, focalMm: null, focal35: null, width: null, height: null };
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return empty;
  let o = 2;
  while (o + 4 <= buf.length && buf[o] === 0xff) {
    const marker = buf[o + 1];
    const len = buf.readUInt16BE(o + 2);
    if (marker === 0xe1 && buf.toString('latin1', o + 4, o + 10) === 'Exif\0\0') {
      const tiff = o + 10;
      const little = buf.toString('latin1', tiff, tiff + 2) === 'II';
      const u32 = p => (little ? buf.readUInt32LE(p) : buf.readUInt32BE(p));
      const ifd0 = readIfd(buf, tiff, u32(tiff + 4), little);
      const sub = ifd0.has(0x8769) ? readIfd(buf, tiff, ifd0.get(0x8769), little) : new Map();
      return {
        make: ifd0.get(0x010f) || null,
        model: ifd0.get(0x0110) || null,
        date: sub.get(0x9003) || ifd0.get(0x0132) || null,
        orientation: ifd0.get(0x0112) || 1,
        focalMm: sub.get(0x920a) ?? null,
        focal35: sub.get(0xa405) || null,
        width: sub.get(0xa002) || null,
        height: sub.get(0xa003) || null
      };
    }
    if (marker === 0xda) break;
    o += 2 + len;
  }
  return empty;
}

// 35 mm equivalent of the main camera of phones met so far, for photos whose EXIF has no FocalLengthIn35mmFilm.
// crop: 35 mm equivalent per real mm, from the maker's published sensor sizes.
export const CAMERA_FALLBACK = {
  'iPhone 7': { focal35: 28, crop: 7.3 },
  'iPhone X': { focal35: 28, crop: 7.0 },
  'Pixel 6 Pro': { focal35: 24, crop: 3.52 },
  'Swift 2 X': { focal35: 28, crop: 7.6 }
};

// Field of view for an image of width x height pixels.
// The 35 mm equivalent is defined on the diagonal (43.27 mm), so the focal length in pixels is diag * f35 / 43.27.
// Returns {hfov, vfov, focalPx, focal35, source}, angles in degrees.
export function fieldOfView(exif, width, height) {
  // Some phones write a 35 mm value that is no lens (a Swift 2 X writes 5): below 12 mm it is not believed
  let focal35 = exif.focal35 >= 12 ? exif.focal35 : null, source = 'exif-35mm';
  const fallback = exif.model ? CAMERA_FALLBACK[exif.model] : null;
  if (!focal35 && exif.focalMm && fallback) { focal35 = exif.focalMm * fallback.crop; source = 'exif-mm-x-crop'; }
  if (!focal35 && fallback) { focal35 = fallback.focal35; source = 'camera-table'; }
  if (!focal35) { focal35 = 26; source = 'default-26mm'; }
  const diag = Math.hypot(width, height);
  const focalPx = (diag * focal35) / 43.27;
  const deg = r => (r * 180) / Math.PI;
  return { hfov: deg(2 * Math.atan(width / (2 * focalPx))), vfov: deg(2 * Math.atan(height / (2 * focalPx))), focalPx, focal35, source };
}
