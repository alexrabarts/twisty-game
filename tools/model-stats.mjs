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
// file), the file's bytes and its texture bytes.
//
//   node tools/model-stats.mjs <picture dir or .png ...> [--grid 8] [--crops 4] [--model <file.glb> ...] [--json <file>]
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';

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
    const doc = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length)));
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

const pictures = (paths) => paths.flatMap((path) => (statSync(path).isDirectory() ? readdirSync(path).filter(n => /\.png$/.test(n) && !/\.mask\.png$|^sheet|crop/.test(n)).map(n => join(path, n)) : [path])).sort();

function main() {
    const argv = process.argv.slice(2);
    const option = (name, fallback) => { const at = argv.indexOf(`--${name}`); return at >= 0 ? argv[at + 1] : fallback; };
    const models = argv.flatMap((a, i) => (a === '--model' ? [argv[i + 1]] : []));
    const flags = new Set(['--grid', '--crops', '--model', '--json']);
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
    for (const file of models) report.models[file] = modelStats(readFileSync(resolve(file)));
    const text = JSON.stringify(report, null, 1);
    if (option('json')) writeFileSync(option('json'), text);
    console.log(text);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
