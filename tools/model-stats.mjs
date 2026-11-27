#!/usr/bin/env node
// Numbers for the model-build skill's rounds (.claude/skills/model-build, section 5), from the pictures of
// tools/model-look.mjs and from the model files themselves.
//
// Per picture (only the model's own pixels where `<view>.mask.png` lies beside it, else the whole picture):
//   clipped   share of pixels with a channel at 250 or over (a blown highlight)
//   crushed   share of pixels with every channel at 6 or under (a black with no detail)
//   luminance mean relative luminance (Rec. 709 weights on the sRGB values, 0 to 1)
//   saturation mean HSV saturation (0 to 1)
//   flat      share of pixels whose 3 x 3 neighbourhood varies less than FLAT in luminance (bare surface)
//   flatPale  share of pixels that are flat and lighter than PALE (bare surface the light shows up)
//   tiles     the flat share of each tile of a GRID x GRID grid that the model covers by COVER or more; the
//             flattest are saved as crops, enlarged twice (`flat/<picture>-<k>.png`), the backdrop in them greyed out
//             (a crop of mostly backdrop sent a critic to judge the stage, not the model)
// Per model file: triangles and draw calls (one per material per node) of each level (`lod0`, `lod1`, or the whole
// file), the file's bytes and its texture bytes, and each level's z-fight risk (`coplanar`: faces of two materials in
// one plane, over each other, closer than the depth buffer parts at the distance the model is drawn to, `--draw`).
//
//   node tools/model-stats.mjs <picture dir or .png ...> [--grid 8] [--crops 4] [--model <file.glb> ...] [--draw 300] [--json <file>]
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';
import { Buffer } from 'node:buffer';

export const CLIP = 250, CRUSH = 6, FLAT = 0.012, PALE = 0.5, COVER = 0.6;

// A PNG as { width, height, data: RGBA bytes }. Eight bits a channel, grey, RGB, grey with alpha or RGBA, not interlaced
export function decodePng(bytes) {
    if (bytes.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
    let at = 8, width = 0, height = 0, depth = 0, type = 0, interlace = 0;
    const idat = [];
    while (at < bytes.length) {
        const length = bytes.readUInt32BE(at), kind = bytes.toString('ascii', at + 4, at + 8);
        const body = bytes.subarray(at + 8, at + 8 + length);
        if (kind === 'IHDR') {
            width = body.readUInt32BE(0);
            height = body.readUInt32BE(4);
            depth = body[8];
            type = body[9];
            interlace = body[12];
        } else if (kind === 'IDAT') idat.push(body);
        else if (kind === 'IEND') break;
        at += 12 + length;
    }
    const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[type];
    if (depth !== 8 || !channels || interlace) throw new Error(`PNG of depth ${depth}, type ${type}, interlace ${interlace} is not read`);
    const raw = inflateSync(Buffer.concat(idat));
    const stride = width * channels, out = Buffer.alloc(width * height * 4);
    let previous = Buffer.alloc(stride);
    for (let y = 0; y < height; y++) {
        const filter = raw[y * (stride + 1)];
        const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
        for (let i = 0; i < stride; i++) {
            const a = i >= channels ? line[i - channels] : 0, b = previous[i], c = i >= channels ? previous[i - channels] : 0;
            let add = 0;
            if (filter === 1) add = a;
            else if (filter === 2) add = b;
            else if (filter === 3) add = (a + b) >> 1;
            else if (filter === 4) {
                const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
                add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
            } else if (filter !== 0) throw new Error(`PNG filter ${filter}`);
            line[i] = (line[i] + add) & 255;
        }
        for (let x = 0; x < width; x++) {
            const s = x * channels, d = (y * width + x) * 4;
            if (channels <= 2) {
                out[d] = out[d + 1] = out[d + 2] = line[s];
                out[d + 3] = channels === 2 ? line[s + 1] : 255;
            } else {
                out[d] = line[s];
                out[d + 1] = line[s + 1];
                out[d + 2] = line[s + 2];
                out[d + 3] = channels === 4 ? line[s + 3] : 255;
            }
        }
        previous = line;
    }
    return { width, height, data: out };
}

const CRC = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return (buffer) => {
        let c = 0xffffffff;
        for (const byte of buffer) c = table[(c ^ byte) & 255] ^ (c >>> 8);
        return (c ^ 0xffffffff) >>> 0;
    };
})();

// RGBA bytes as a PNG
export function encodePng({ width, height, data }) {
    const chunk = (kind, body) => {
        const head = Buffer.alloc(8);
        head.writeUInt32BE(body.length, 0);
        head.write(kind, 4, 'ascii');
        const crc = Buffer.alloc(4);
        crc.writeUInt32BE(CRC(Buffer.concat([head.subarray(4), body])), 0);
        return Buffer.concat([head, body, crc]);
    };
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8;
    header[9] = 6;
    const raw = Buffer.alloc(height * (width * 4 + 1));
    for (let y = 0; y < height; y++) data.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// Relative luminance of sRGB bytes, 0 to 1 (the weights on the stored values: a measure for comparing rounds)
export const luminance = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
export const saturation = (r, g, b) => {
    const most = Math.max(r, g, b);
    return most ? (most - Math.min(r, g, b)) / most : 0;
};

// The numbers of one picture. `mask` (same size, or null) marks the model's pixels with a light value
export function pictureStats(image, mask = null, grid = 8) {
    const { width: w, height: h, data } = image;
    if (mask && (mask.width !== w || mask.height !== h)) throw new Error('the mask is not the size of the picture');
    const lum = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) lum[i] = luminance(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    const inside = (i) => !mask || mask.data[i * 4] > 127;
    let count = 0, clipped = 0, crushed = 0, sumL = 0, sumS = 0, flat = 0, flatPale = 0;
    const tiles = Array.from({ length: grid * grid }, (_, k) => ({ col: k % grid, row: Math.floor(k / grid), pixels: 0, model: 0, flat: 0 }));
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            const tile = tiles[Math.min(grid - 1, Math.floor((y * grid) / h)) * grid + Math.min(grid - 1, Math.floor((x * grid) / w))];
            tile.pixels++;
            if (!inside(i)) continue;
            tile.model++;
            count++;
            const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
            if (r >= CLIP || g >= CLIP || b >= CLIP) clipped++;
            if (r <= CRUSH && g <= CRUSH && b <= CRUSH) crushed++;
            sumL += lum[i];
            sumS += saturation(r, g, b);
            const spread = localSpread(lum, w, h, x, y);
            if (spread !== null && spread < FLAT) {
                flat++;
                tile.flat++;
                if (lum[i] > PALE) flatPale++;
            }
        }
    }
    const share = (n) => (count ? +(n / count).toFixed(4) : 0);
    const covered = tiles.filter(t => t.model / t.pixels >= COVER).map(t => ({ col: t.col, row: t.row, cover: +(t.model / t.pixels).toFixed(3), flat: +(t.flat / t.model).toFixed(3) }));
    return {
        pixels: count, clipped: share(clipped), crushed: share(crushed), luminance: share(sumL), saturation: share(sumS),
        flat: share(flat), flatPale: share(flatPale), tiles: covered.sort((a, b) => b.flat - a.flat)
    };
}

// The standard deviation of luminance in the 3 x 3 neighbourhood of (x, y), or null at the picture's edge
export function localSpread(lum, w, h, x, y) {
    if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) return null;
    let sum = 0, sq = 0;
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            const v = lum[(y + dy) * w + x + dx];
            sum += v;
            sq += v * v;
        }
    }
    const mean = sum / 9;
    return Math.sqrt(Math.max(0, sq / 9 - mean * mean));
}

// A tile of a picture, enlarged `scale` times (nearest pixel), as an image; with a mask, the pixels outside it grey
export function cropTile(image, tile, grid, scale = 2, mask = null) {
    const x0 = Math.floor((tile.col * image.width) / grid), x1 = Math.floor(((tile.col + 1) * image.width) / grid);
    const y0 = Math.floor((tile.row * image.height) / grid), y1 = Math.floor(((tile.row + 1) * image.height) / grid);
    const width = (x1 - x0) * scale, height = (y1 - y0) * scale, data = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const from = ((y0 + Math.floor(y / scale)) * image.width + x0 + Math.floor(x / scale)) * 4;
            if (mask && mask.data[from] <= 127) data.set([128, 128, 128, 255], (y * width + x) * 4);
            else image.data.copy(data, (y * width + x) * 4, from, from + 4);
        }
    }
    return { width, height, data, box: [x0, y0, x1 - x0, y1 - y0] };
}

// A glTF binary's numbers: each level's triangles and draw calls, the file's and its textures' bytes
export function modelStats(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(0, true) !== 0x46546c67) throw new Error('not a glTF binary');
    const length = view.getUint32(12, true);
    const doc = JSON.parse(Buffer.from(bytes.subarray(20, 20 + length)).toString('utf8'));
    const nodes = doc.nodes || [];
    const tris = (mesh) => mesh.primitives.reduce((sum, p) => {
        const count = p.indices !== undefined ? doc.accessors[p.indices].count : doc.accessors[p.attributes.POSITION].count;
        return sum + ((p.mode === undefined || p.mode === 4) ? count / 3 : 0);
    }, 0);
    const walk = (index, out) => {
        const node = nodes[index];
        if (node.mesh !== undefined) out.push(node);
        for (const child of node.children || []) walk(child, out);
        return out;
    };
    const groups = nodes.map((n, i) => [n.name, i]).filter(([name]) => /^lod\d$/.test(name));
    const levels = {};
    const tally = (list) => ({ triangles: list.reduce((s, n) => s + tris(doc.meshes[n.mesh]), 0), drawCalls: list.reduce((s, n) => s + doc.meshes[n.mesh].primitives.length, 0), nodes: list.length });
    if (groups.length) for (const [name, index] of groups) levels[name] = tally(walk(index, []));
    else levels.all = tally(nodes.filter(n => n.mesh !== undefined));
    const textureBytes = (doc.images || []).reduce((s, image) => s + (image.bufferView !== undefined ? doc.bufferViews[image.bufferView].byteLength : 0), 0);
    return { bytes: bytes.byteLength, textureBytes, materials: (doc.materials || []).length, levels };
}

// The z-fight risk: faces of two materials that lie in one plane (or nearly) over each other, where the depth buffer
// cannot tell which is in front. Two faces fight when the gap between their planes is smaller than DEPTH_STEPS steps
// of the depth buffer at the farthest distance at which their overlap is still SIDE_PX pixels across, or the
// distance the model is drawn to, whichever is nearer. The game's camera (js/main.js): near 0.25 m, a 75 degree
// field of view, a 24 bit depth buffer; a picture 1080 pixels high.
export const CAMERA = { near: 0.25, fov: 75, rows: 1080, bits: 24 };
export const DEPTH_STEPS = 3, SIDE_PX = 4, MAX_GAP = 0.05;

// One step of the depth buffer at distance d (metres), for a far plane far beyond the near
export const depthStep = (d) => (d * d) / (CAMERA.near * 2 ** CAMERA.bits);
// A metre at distance d in pixels
export const pixelsPerMetre = (d) => CAMERA.rows / (2 * d * Math.tan((CAMERA.fov * Math.PI) / 360));
// The gap two faces overlapping by `area` m2 need, for a model drawn out to `drawM`
export function gapNeeded(area, drawM) {
    const metresPerPixel = 1 / pixelsPerMetre(1);
    const reach = Math.min(drawM, Math.sqrt(area) / (SIDE_PX * metresPerPixel));
    return DEPTH_STEPS * depthStep(reach);
}

// A glTF binary's triangles in world space (the node transforms applied), each level apart (`lod<n>` groups, or
// `all`): { level: [{ p: [9 numbers], m: material key, two: double sided }] }. The material key is its look (colour
// factor, texture, emissive), so two materials of one look count as one. With `split` 'node' and no levels, each mesh
// node is a level of its own (a file of variants or of alternative parts, all at the origin, that are never drawn
// together: the houses, the rider's cuts).
export function trianglesOf(bytes, { split = 'file' } = {}) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(0, true) !== 0x46546c67) throw new Error('not a glTF binary');
    const length = view.getUint32(12, true);
    const doc = JSON.parse(Buffer.from(bytes.subarray(20, 20 + length)).toString('utf8'));
    const binAt = 20 + length + 8;
    const nodes = doc.nodes || [];
    const size = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
    const count = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
    const read = (index) => {
        const a = doc.accessors[index], bv = doc.bufferViews[a.bufferView], n = count[a.type], bytesEach = size[a.componentType];
        const stride = bv.byteStride || n * bytesEach, start = binAt + (bv.byteOffset || 0) + (a.byteOffset || 0);
        const out = new Float64Array(a.count * n);
        for (let i = 0; i < a.count; i++) {
            for (let k = 0; k < n; k++) {
                const at = start + i * stride + k * bytesEach;
                let v;
                switch (a.componentType) {
                    case 5120: v = view.getInt8(at); if (a.normalized) v = Math.max(v / 127, -1); break;
                    case 5121: v = view.getUint8(at); if (a.normalized) v /= 255; break;
                    case 5122: v = view.getInt16(at, true); if (a.normalized) v = Math.max(v / 32767, -1); break;
                    case 5123: v = view.getUint16(at, true); if (a.normalized) v /= 65535; break;
                    case 5125: v = view.getUint32(at, true); break;
                    default: v = view.getFloat32(at, true);
                }
                out[i * n + k] = v;
            }
        }
        return out;
    };
    const multiply = (a, b) => {
        const out = new Array(16).fill(0);
        for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
        return out;
    };
    const local = (node) => {
        if (node.matrix) return node.matrix.slice();
        const [x, y, z, w] = node.rotation || [0, 0, 0, 1], [sx, sy, sz] = node.scale || [1, 1, 1], [tx, ty, tz] = node.translation || [0, 0, 0];
        return [
            (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
            2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
            2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
            tx, ty, tz, 1
        ];
    };
    const look = (index) => {
        if (index === undefined) return { m: 'none', two: false };
        const m = doc.materials[index], pbr = m.pbrMetallicRoughness || {};
        const key = JSON.stringify([(pbr.baseColorFactor || [1, 1, 1, 1]).map(v => +v.toFixed(3)), pbr.baseColorTexture ? pbr.baseColorTexture.index : null, (m.emissiveFactor || [0, 0, 0]).map(v => +v.toFixed(3)), m.alphaMode || 'OPAQUE']);
        return { m: key, two: !!m.doubleSided, name: m.name };
    };
    const levels = {};
    const walk = (index, parent, out) => {
        const node = nodes[index], matrix = multiply(parent, local(node));
        if (node.mesh !== undefined) {
            for (const prim of doc.meshes[node.mesh].primitives) {
                if (prim.mode !== undefined && prim.mode !== 4) continue;
                const pos = read(prim.attributes.POSITION), idx = prim.indices !== undefined ? read(prim.indices) : null;
                const n = idx ? idx.length : pos.length / 3, { m, two, name } = look(prim.material);
                const at = (v) => {
                    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
                    return [matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12], matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13], matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]];
                };
                for (let t = 0; t + 2 < n; t += 3) {
                    const v = idx ? [idx[t], idx[t + 1], idx[t + 2]] : [t, t + 1, t + 2];
                    out.push({ p: [...at(v[0]), ...at(v[1]), ...at(v[2])], m, two, name: name || m, node: node.name });
                }
            }
        }
        for (const child of node.children || []) walk(child, matrix, out);
        return out;
    };
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const groups = nodes.map((n, i) => [n.name, i]).filter(([name]) => /^lod\d$/.test(name));
    if (groups.length) {
        // A group's own parents move it too
        const parentOf = new Map();
        nodes.forEach((n, i) => (n.children || []).forEach(c => parentOf.set(c, i)));
        const chain = (i) => { let m = identity; const up = []; for (let k = parentOf.get(i); k !== undefined; k = parentOf.get(k)) up.unshift(k); for (const k of up) m = multiply(m, local(nodes[k])); return m; };
        for (const [name, index] of groups) levels[name] = walk(index, chain(index), []);
    } else {
        const roots = (doc.scenes && doc.scenes[doc.scene || 0] ? doc.scenes[doc.scene || 0].nodes : nodes.map((_, i) => i));
        const all = roots.flatMap(r => walk(r, identity, []));
        if (split !== 'node') levels.all = all;
        else for (const t of all) (levels[t.node] || (levels[t.node] = [])).push(t);
    }
    return levels;
}

// Triangles from a three.js-like position and colour list (the procedural props: one material, the colour in the
// vertices, drawn double sided), keyed by the colour
export function trianglesOfLists(positions, colors) {
    const out = [];
    for (let t = 0; t + 8 < positions.length; t += 9) {
        const key = JSON.stringify([colors[t], colors[t + 1], colors[t + 2]].map(v => +v.toFixed(3)));
        out.push({ p: Array.from(positions.slice(t, t + 9)), m: key, two: true, name: key });
    }
    return out;
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const corner = (p, k) => [p[k * 3], p[k * 3 + 1], p[k * 3 + 2]];

// The area of the overlap of two convex polygons in 2D (Sutherland-Hodgman), and its centroid
function overlap2(subject, clip) {
    let out = subject;
    const sign = Math.sign(area2(clip)) || 1;
    for (let i = 0; i < clip.length && out.length; i++) {
        const a = clip[i], b = clip[(i + 1) % clip.length];
        const inside = (p) => sign * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) >= -1e-12;
        const next = [];
        for (let k = 0; k < out.length; k++) {
            const p = out[k], q = out[(k + 1) % out.length], ip = inside(p), iq = inside(q);
            if (ip) next.push(p);
            if (ip !== iq) {
                const d1 = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
                const d2 = (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]);
                const t = d1 / (d1 - d2);
                next.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
            }
        }
        out = next;
    }
    if (out.length < 3) return { area: 0 };
    const area = Math.abs(area2(out)) / 2;
    let cx = 0, cy = 0;
    for (const p of out) { cx += p[0]; cy += p[1]; }
    return { area, centre: [cx / out.length, cy / out.length] };
}
function area2(poly) {
    let s = 0;
    for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; s += a[0] * b[1] - b[0] * a[1]; }
    return s;
}

// Whether a ray from o along d meets any of the triangles (Moller-Trumbore), skipping those in `skip`
function blocked(tris, o, d, skip) {
    for (let i = 0; i < tris.length; i++) {
        if (skip.has(i)) continue;
        const p = tris[i].p;
        const e1 = [p[3] - p[0], p[4] - p[1], p[5] - p[2]], e2 = [p[6] - p[0], p[7] - p[1], p[8] - p[2]];
        const h = cross(d, e2), a = dot(e1, h);
        if (Math.abs(a) < 1e-12) continue;
        const f = 1 / a, s = [o[0] - p[0], o[1] - p[1], o[2] - p[2]], u = f * dot(s, h);
        if (u < 0 || u > 1) continue;
        const q = cross(s, e1), v = f * dot(d, q);
        if (v < 0 || u + v > 1) continue;
        if (f * dot(e2, q) > 1e-5) return true;
    }
    return false;
}

// Directions over the hemisphere about n (a Fibonacci spiral), for the visibility test
function hemisphere(n, count = 48) {
    const t = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const u = cross(n, t), ul = Math.hypot(...u), uu = u.map(x => x / ul), v = cross(n, uu);
    const out = [];
    for (let k = 0; k < count; k++) {
        const z = 0.05 + 0.95 * (k + 0.5) / count, r = Math.sqrt(1 - z * z), a = k * 2.399963;
        out.push([0, 1, 2].map(i => n[i] * z + uu[i] * r * Math.cos(a) + v[i] * r * Math.sin(a)));
    }
    return out;
}

// The overlapping near-coplanar faces of different materials in one level that the depth buffer cannot part when
// the model is drawn out to `drawM` metres and that can be seen from outside the model. Faces facing the same way
// always count; faces back to back only when both are drawn double sided. With `ground` (a height), the model stands
// on the ground there and is never seen from under it: a ray down from above it meets the ground. Each finding is one
// pair of materials in one plane: { a, b, area (m2), gap (m), need (m), at: [x, y, z], normal }
export function coplanar(tris, drawM, { ground = null } = {}) {
    const info = tris.map((t) => {
        const p = t.p, a = corner(p, 0), n = cross(sub(corner(p, 1), a), sub(corner(p, 2), a)), len = Math.hypot(...n);
        if (len < 1e-10) return null;
        const unit = n.map(x => x / len);
        const lo = [Math.min(p[0], p[3], p[6]), Math.min(p[1], p[4], p[7]), Math.min(p[2], p[5], p[8])];
        const hi = [Math.max(p[0], p[3], p[6]), Math.max(p[1], p[4], p[7]), Math.max(p[2], p[5], p[8])];
        return { n: unit, d: dot(unit, a), lo, hi };
    });
    // Buckets by the plane, in either orientation, so a lookup of the neighbours finds every candidate
    const NQ = 0.02, buckets = new Map();
    const keyOf = (n, d) => [Math.round(n[0] / NQ), Math.round(n[1] / NQ), Math.round(n[2] / NQ), Math.round(d / MAX_GAP)];
    info.forEach((f, i) => {
        if (!f) return;
        const flip = f.n[0] < 0 || (f.n[0] === 0 && (f.n[1] < 0 || (f.n[1] === 0 && f.n[2] < 0)));
        const n = flip ? f.n.map(x => -x) : f.n, d = flip ? -f.d : f.d;
        const k = keyOf(n, d).join(',');
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k).push(i);
        f.key = keyOf(n, d);
    });
    const groups = new Map();
    const cosMax = Math.cos((3 * Math.PI) / 180);
    info.forEach((f, i) => {
        if (!f) return;
        const seen = new Set();
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) for (let e = -1; e <= 1; e++) {
            const list = buckets.get([f.key[0] + a, f.key[1] + b, f.key[2] + c, f.key[3] + e].join(','));
            if (!list) continue;
            for (const j of list) {
                if (j <= i || seen.has(j)) continue;
                seen.add(j);
                const g = info[j], ti = tris[i], tj = tris[j];
                if (ti.m === tj.m) continue;
                const cos = dot(f.n, g.n);
                if (Math.abs(cos) < cosMax) continue;
                if (cos < 0 && !(ti.two && tj.two)) continue;
                if (f.lo.some((v, k) => v > g.hi[k] + MAX_GAP) || g.lo.some((v, k) => v > f.hi[k] + MAX_GAP)) continue;
                // The gap: the mean distance of j's corners from i's plane
                const pj = tj.p;
                let gap = 0;
                for (let k = 0; k < 3; k++) gap += Math.abs(dot(f.n, corner(pj, k)) - f.d) / 3;
                if (gap > MAX_GAP) continue;
                // Both into i's plane
                const t0 = Math.abs(f.n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0], u = cross(f.n, t0), ul = Math.hypot(...u), uu = u.map(x => x / ul), v = cross(f.n, uu);
                const flat = (p) => [0, 1, 2].map(k => [dot(corner(p, k), uu), dot(corner(p, k), v)]);
                const o = overlap2(flat(ti.p), flat(pj));
                if (o.area < 1e-6) continue;
                const at = [0, 1, 2].map(k => uu[k] * o.centre[0] + v[k] * o.centre[1] + f.n[k] * f.d);
                const pair = [ti.m, tj.m].sort();
                const key = JSON.stringify([pair, f.key.slice(0, 3).map(x => Math.round(x / 2)), Math.round(f.d / 0.01) * (cos < 0 ? -1 : 1)]);
                if (!groups.has(key)) groups.set(key, { a: ti.name, b: tj.name, area: 0, gap: Infinity, samples: [], normal: f.n, back: cos < 0 });
                const group = groups.get(key);
                group.area += o.area;
                group.gap = Math.min(group.gap, gap);
                group.samples.push({ at, area: o.area, i, j });
            }
        }
    });
    const out = [];
    for (const group of groups.values()) {
        const need = gapNeeded(group.area, drawM);
        if (group.gap >= need) continue;
        // Seen from outside: some sample, lifted off its plane on a side the faces are drawn from, sees out of the model
        group.samples.sort((x, y) => y.area - x.area);
        const sides = group.back || tris[group.samples[0].i].two ? [1, -1] : [1];
        let seen = false;
        for (const s of group.samples.slice(0, 4)) {
            for (const side of sides) {
                const n = group.normal.map(x => x * side), lift = group.gap + 0.002;
                const o = s.at.map((x, k) => x + n[k] * lift);
                if (ground !== null && o[1] <= ground) continue;
                const open = (d) => !(ground !== null && d[1] < 0) && !blocked(tris, o, d, new Set([s.i, s.j]));
                if (hemisphere(n).some(open)) { seen = true; break; }
            }
            if (seen) break;
        }
        if (!seen) continue;
        out.push({ a: group.a, b: group.b, area: +group.area.toFixed(4), gap: +group.gap.toFixed(4), need: +need.toFixed(4), at: group.samples[0].at.map(x => +x.toFixed(3)), normal: group.normal.map(x => +x.toFixed(3)) });
    }
    return out.sort((x, y) => y.area - x.area);
}

const pictures = (paths) => paths.flatMap((path) => (statSync(path).isDirectory() ? readdirSync(path).filter(n => /\.png$/.test(n) && !/\.mask\.png$|^sheet|crop/.test(n)).map(n => join(path, n)) : [path])).sort();

function main() {
    const argv = process.argv.slice(2);
    const option = (name, fallback) => { const at = argv.indexOf(`--${name}`); return at >= 0 ? argv[at + 1] : fallback; };
    const models = argv.flatMap((a, i) => (a === '--model' ? [argv[i + 1]] : []));
    const flags = new Set(['--grid', '--crops', '--model', '--json', '--draw']);
    const paths = argv.filter((a, i) => !a.startsWith('--') && !flags.has(argv[i - 1]));
    const grid = Number(option('grid', 8)), crops = Number(option('crops', 4));
    const report = { pictures: {}, models: {} };
    for (const file of pictures(paths)) {
        const image = decodePng(readFileSync(file));
        const maskFile = file.replace(/\.png$/, '.mask.png');
        const mask = existsSync(maskFile) ? decodePng(readFileSync(maskFile)) : null;
        const stats = pictureStats(image, mask, grid);
        const out = join(dirname(file), 'flat');
        stats.crops = stats.tiles.slice(0, crops).map((tile, k) => {
            mkdirSync(out, { recursive: true });
            const crop = cropTile(image, tile, grid, 2, mask);
            const path = join(out, `${basename(file, '.png')}-${k + 1}.png`);
            writeFileSync(path, encodePng(crop));
            return { path, flat: tile.flat, box: crop.box };
        });
        stats.tiles = stats.tiles.length;
        stats.masked = !!mask;
        report.pictures[file] = stats;
    }
    for (const file of models) {
        const bytes = readFileSync(resolve(file));
        report.models[file] = modelStats(bytes);
        // The z-fight risk of each level, for the model drawn out to --draw metres (300 unless given)
        const levels = trianglesOf(bytes), drawM = Number(option('draw', 300));
        report.models[file].coplanar = Object.fromEntries(Object.entries(levels).map(([name, tris]) => [name, coplanar(tris, drawM)]));
    }
    const text = JSON.stringify(report, null, 1);
    if (option('json')) writeFileSync(option('json'), text);
    console.log(text);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
