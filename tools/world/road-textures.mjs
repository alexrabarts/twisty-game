#!/usr/bin/env node
// Writes the road textures that js/world/roadsurface.js makes at load as PNG files, to look at them: the albedo, the
// roughness, the normal and the alpha channel of each surface, one copy and a 3 x 3 block of copies (to see a repeat).
//
//   node tools/world/road-textures.mjs <out dir>
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const root = new URL('../../', import.meta.url);
const RoadSurface = new Function(`${readFileSync(new URL('js/world/roadsurface.js', root), 'utf8')}\nreturn RoadSurface;`)();

const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});
const crc = bytes => {
    let c = 0xffffffff;
    for (const b of bytes) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'ascii');
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc(Buffer.concat([head.subarray(4), data])), 0);
    return Buffer.concat([head, data, tail]);
};

// An RGB PNG of `pick(o)` -> [r, g, b] over an n x n RGBA image, repeated `copies` times each way
function png(rgba, n, pick, copies = 1) {
    const w = n * copies;
    const raw = Buffer.alloc((w * 3 + 1) * w);
    for (let y = 0; y < w; y++) {
        raw[y * (w * 3 + 1)] = 0;
        for (let x = 0; x < w; x++) {
            const o = ((y % n) * n + (x % n)) * 4;
            const [r, g, b] = pick(rgba, o);
            const p = y * (w * 3 + 1) + 1 + x * 3;
            raw[p] = r; raw[p + 1] = g; raw[p + 2] = b;
        }
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0);
    ihdr.writeUInt32BE(w, 4);
    ihdr[8] = 8; ihdr[9] = 2;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const out = process.argv[2];
if (!out) {
    console.error('usage: node tools/world/road-textures.mjs <out dir>');
    process.exit(1);
}
mkdirSync(out, { recursive: true });
for (const [name, make] of [['asphalt', () => RoadSurface.asphalt()], ['setts', () => RoadSurface.setts()]]) {
    const t0 = performance.now();
    const t = make();
    const ms = Math.round(performance.now() - t0);
    writeFileSync(join(out, `${name}-albedo.png`), png(t.albedo, t.size, (a, o) => [a[o], a[o + 1], a[o + 2]]));
    writeFileSync(join(out, `${name}-albedo-3x3.png`), png(t.albedo, t.size, (a, o) => [a[o], a[o + 1], a[o + 2]], 3));
    writeFileSync(join(out, `${name}-roughness.png`), png(t.albedo, t.size, (a, o) => [a[o + 3], a[o + 3], a[o + 3]]));
    writeFileSync(join(out, `${name}-normal.png`), png(t.normal, t.size, (a, o) => [a[o], a[o + 1], a[o + 2]]));
    writeFileSync(join(out, `${name}-alpha.png`), png(t.normal, t.size, (a, o) => [a[o + 3], a[o + 3], a[o + 3]]));
    console.log(`${name}: ${t.size} px, made in ${ms} ms, mean sRGB ${t.mean.map(v => v.toFixed(3)).join(', ')}`);
}
