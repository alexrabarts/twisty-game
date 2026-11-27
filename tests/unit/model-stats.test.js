/**
 * @jest-environment node
 */
// The numbers of tools/model-stats.mjs (the model-build skill's measures) and the --set parsing of
// tools/model-look.mjs: worked on pictures and files made here, whose answers are known.
import { describe, test, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { decodePng, encodePng, luminance, saturation, pictureStats, localSpread, cropTile, modelStats, CLIP, CRUSH } from '../../tools/model-stats.mjs';
import { parseSets } from '../../tools/model-look.mjs';

// A w x h picture from a function of (x, y) giving [r, g, b]
function picture(w, h, fn) {
    const data = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const [r, g, b] = fn(x, y);
        data.set([r, g, b, 255], (y * w + x) * 4);
    }
    return { width: w, height: h, data };
}

describe('pictures', () => {
    test('a PNG comes back as written', () => {
        const image = picture(13, 7, (x, y) => [x * 19, y * 31, (x * y) % 256]);
        const back = decodePng(encodePng(image));
        expect(back.width).toBe(13);
        expect(back.height).toBe(7);
        expect(Buffer.compare(back.data, image.data)).toBe(0);
    });

    test('luminance and saturation', () => {
        expect(luminance(255, 255, 255)).toBeCloseTo(1, 6);
        expect(luminance(0, 0, 0)).toBe(0);
        expect(luminance(0, 255, 0)).toBeCloseTo(0.7152, 4);
        expect(saturation(200, 200, 200)).toBe(0);
        expect(saturation(200, 0, 0)).toBe(1);
        expect(saturation(0, 0, 0)).toBe(0);
    });

    test('clipped and crushed shares count only the masked pixels', () => {
        // Left half white, right half black; the mask covers the left quarter and the right quarter
        const image = picture(40, 10, x => (x < 20 ? [255, 255, 255] : [0, 0, 0]));
        const mask = picture(40, 10, x => (x < 10 || x >= 30 ? [255, 255, 255] : [0, 0, 0]));
        const stats = pictureStats(image, mask, 4);
        expect(stats.pixels).toBe(200);
        expect(stats.clipped).toBeCloseTo(0.5, 6);
        expect(stats.crushed).toBeCloseTo(0.5, 6);
        expect(stats.luminance).toBeCloseTo(0.5, 6);
        expect(CLIP).toBe(250);
        expect(CRUSH).toBe(6);
    });

    test('a flat picture is flat and a noisy one is not', () => {
        const flat = pictureStats(picture(32, 32, () => [200, 200, 200]), null, 4);
        let seed = 7;
        const rand = () => { seed = (seed * 16807) % 2147483647; return seed % 256; };
        const busy = pictureStats(picture(32, 32, () => { const v = rand(); return [v, v, v]; }), null, 4);
        // (the picture's one-pixel border has no neighbourhood)
        expect(flat.flat).toBeCloseTo(900 / 1024, 3);
        expect(flat.flatPale).toBeCloseTo(900 / 1024, 3);
        expect(busy.flat).toBeLessThan(0.02);
        expect(flat.tiles[0].flat).toBeGreaterThan(busy.tiles[0].flat);
    });

    test('tiles the model barely covers are left out, the flattest come first', () => {
        // Top half flat grey, bottom half noisy; the mask covers all but one corner tile
        let seed = 3;
        const rand = () => { seed = (seed * 16807) % 2147483647; return seed % 256; };
        const image = picture(40, 40, (x, y) => (y < 20 ? [120, 120, 120] : (v => [v, v, v])(rand())));
        const mask = picture(40, 40, (x, y) => (x >= 30 && y >= 30 ? [0, 0, 0] : [255, 255, 255]));
        const stats = pictureStats(image, mask, 4);
        expect(stats.tiles).toHaveLength(15);
        expect(stats.tiles[0].row).toBeLessThan(2);
        expect(stats.tiles[stats.tiles.length - 1].row).toBeGreaterThan(1);
    });

    test('local spread', () => {
        const lum = Float32Array.from([0, 0, 0, 0, 1, 0, 0, 0, 0]);
        expect(localSpread(lum, 3, 3, 1, 1)).toBeCloseTo(Math.sqrt(1 / 9 - 1 / 81), 6);
        expect(localSpread(lum, 3, 3, 0, 1)).toBeNull();
    });

    test('a tile crop is the tile, enlarged', () => {
        const image = picture(8, 8, (x, y) => [x * 10, y * 10, 0]);
        const crop = cropTile(image, { col: 1, row: 1 }, 2, 2);
        expect(crop.width).toBe(8);
        expect(crop.box).toEqual([4, 4, 4, 4]);
        expect([...crop.data.subarray(0, 3)]).toEqual([40, 40, 0]);
        expect([...crop.data.subarray(4, 7)]).toEqual([40, 40, 0]);
        expect([...crop.data.subarray(8, 11)]).toEqual([50, 40, 0]);
    });
});

describe('model files', () => {
    test('a detailed bike counts its two levels within the budget', () => {
        const stats = modelStats(readFileSync(new URL('../../assets/bikes/detail/bike15_crf250.glb', import.meta.url)));
        expect(Object.keys(stats.levels).sort()).toEqual(['lod0', 'lod1']);
        expect(stats.levels.lod0.triangles).toBeGreaterThan(stats.levels.lod1.triangles);
        expect(stats.levels.lod0.triangles).toBeLessThanOrEqual(40000);
        expect(stats.levels.lod1.triangles).toBeLessThanOrEqual(10000);
        expect(stats.levels.lod0.drawCalls).toBeGreaterThanOrEqual(stats.levels.lod0.nodes);
        expect(stats.bytes).toBeLessThanOrEqual(1.2 * 1024 * 1024);
        expect(stats.textureBytes).toBe(0);
    });

    test('a file with no levels is counted whole, its textures too', () => {
        const stats = modelStats(readFileSync(new URL('../../assets/gorge/rocks.glb', import.meta.url)));
        expect(Object.keys(stats.levels)).toEqual(['all']);
        expect(stats.levels.all.triangles).toBeGreaterThan(0);
        expect(stats.textureBytes).toBeGreaterThan(0);
    });
});

describe('model-look --set', () => {
    test('numbers and colours', () => {
        expect(parseSets(['paint.roughness=0.6', 'exposure=1.1', 'paint.color=0xff0000', 'trim.color=#101010']))
            .toEqual({ 'paint.roughness': 0.6, exposure: 1.1, 'paint.color': '0xff0000', 'trim.color': '#101010' });
        expect(() => parseSets(['roughness'])).toThrow();
    });
});
