/**
 * @jest-environment node
 */
// The detailed bikes' baked maps (tools/blender/maps.py; the budget in tools/blender/README.md, "Baked maps"), read
// from the model files themselves:
//   - a detail file stays at or under 1.2 MB with its maps;
//   - its maps are WebP (EXT_texture_webp, which js/sceneassets.js reads), each at most MAP_PX square, and the GPU
//     holds at most TEXTURE_BYTES of them for one bike (four bytes a texel and a third more for the mipmaps);
//   - every primitive whose material takes a map has texture coordinates, and every such material keeps its plain
//     finish in `extras` (far.py reads it back); the lit finishes take none;
//   - a far file (the crew's, assets/bikes/far) carries no map.
// In a ride the GPU holds the maps of the player's bike alone: the five crew riders ride far files.
import { describe, test, expect } from '@jest/globals';
import { readFileSync, readdirSync, statSync } from 'node:fs';

const detail = new URL('../../assets/bikes/detail/', import.meta.url);
const far = new URL('../../assets/bikes/far/', import.meta.url);
const FILE_BYTES = 1.2 * 1024 * 1024;
const MAP_PX = 1024;
// Three maps of 1024 px with their mipmaps: 16 MiB
const TEXTURE_BYTES = 16 * 1024 * 1024;
const LIT = ['headlight', 'brake', 'signal', 'dash', 'glass', 'reflector', 'visor'];
// The bikes built with maps so far (the owner, 2026-11-27: bike15 first, the others after its result is seen)
const WITH_MAPS = ['bike15_crf250'];

function glb(url) {
    const bytes = readFileSync(url);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const length = view.getUint32(12, true);
    const doc = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length)));
    return { bytes, doc, bin: 20 + length + 8 };
}

// A WebP's size in pixels, from its first chunk (lossy, lossless or extended)
function webpSize(bytes) {
    const text = (at, n) => String.fromCharCode(...bytes.subarray(at, at + n));
    if (text(0, 4) !== 'RIFF' || text(8, 4) !== 'WEBP') throw new Error('not a WebP');
    const kind = text(12, 4);
    if (kind === 'VP8 ') return { width: (bytes[26] | (bytes[27] << 8)) & 0x3fff, height: (bytes[28] | (bytes[29] << 8)) & 0x3fff };
    if (kind === 'VP8L') {
        const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (kind === 'VP8X') return { width: 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)), height: 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) };
    throw new Error(`a WebP chunk ${kind} is not read`);
}

const files = (url) => readdirSync(url).filter(n => n.endsWith('.glb'));

describe('baked maps of the detailed bikes', () => {
    for (const name of files(detail)) {
        test(name, () => {
            const url = new URL(name, detail);
            const { bytes, doc, bin } = glb(url);
            expect(statSync(url).size).toBeLessThanOrEqual(FILE_BYTES);
            const images = doc.images || [];
            if (WITH_MAPS.includes(name.replace('.glb', ''))) expect(images.length).toBeGreaterThan(0);
            if (!images.length) return;
            expect(doc.extensionsRequired).toContain('EXT_texture_webp');
            let memory = 0;
            for (const image of images) {
                expect(image.mimeType).toBe('image/webp');
                const view = doc.bufferViews[image.bufferView];
                const size = webpSize(bytes.subarray(bin + (view.byteOffset || 0), bin + (view.byteOffset || 0) + view.byteLength));
                expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(MAP_PX);
                memory += size.width * size.height * 4 * (4 / 3);
            }
            expect(memory).toBeLessThanOrEqual(TEXTURE_BYTES);
            for (const texture of doc.textures) expect(texture.extensions.EXT_texture_webp.source).toBeLessThan(images.length);
            const mapped = (m) => !!(m.pbrMetallicRoughness?.baseColorTexture || m.pbrMetallicRoughness?.metallicRoughnessTexture || m.normalTexture || m.occlusionTexture);
            for (const material of doc.materials) {
                if (LIT.includes(material.name)) expect(mapped(material)).toBe(false);
                if (!mapped(material)) continue;
                expect(material.extras.lift).toBeGreaterThanOrEqual(1);
                expect(typeof material.extras.roughness).toBe('number');
                expect(typeof material.extras.metalness).toBe('number');
            }
            for (const mesh of doc.meshes) {
                for (const primitive of mesh.primitives) {
                    if (mapped(doc.materials[primitive.material])) expect(primitive.attributes.TEXCOORD_0).toBeDefined();
                }
            }
        });
    }
});

describe('the far files keep no maps', () => {
    for (const name of files(far)) {
        test(name, () => {
            const { doc } = glb(new URL(name, far));
            expect(doc.images || []).toHaveLength(0);
            expect(doc.textures || []).toHaveLength(0);
            for (const material of doc.materials) {
                expect(material.pbrMetallicRoughness?.baseColorTexture).toBeUndefined();
                expect(material.normalTexture).toBeUndefined();
            }
        });
    }
});
