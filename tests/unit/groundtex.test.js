// The ground texture effect (js/world/groundtex.js), a prototype: the near ground drawn per pixel from textures made
// at load. Held here:
//   - the textures are the same on every page, and each layer's colour is stored as its ratio to its own mean (a mean
//     of 1 in each channel), so far off, where the mipmaps average it, the land keeps the colours the photos matched
//   - every layer tiles without a seam
//   - the shader goes in at all three places and off it takes no branch of its own; the land detail's grain is held
//     off while the texture set is drawn and comes back after
import { describe, test, expect } from '@jest/globals';
import { loadScript, realThree } from '../helpers/load-game.js';

const three = realThree();
const { LandDetail } = new Function('THREE', `${loadScript('world/landdetail.js')}\nreturn { LandDetail };`)(three);
const { GroundTex } = new Function('THREE', 'LandDetail', `${loadScript('world/groundtex.js')}\nreturn { GroundTex };`)(three, LandDetail);

describe('the textures', () => {
    const set = GroundTex.layers();
    const n = GroundTex.SIZE, count = GroundTex.LAYERS.length;

    test('the same every time', () => {
        const again = GroundTex.layers();
        expect(Buffer.compare(Buffer.from(set.albedo), Buffer.from(again.albedo))).toBe(0);
        expect(Buffer.compare(Buffer.from(set.normal), Buffer.from(again.normal))).toBe(0);
        expect(set.albedo.length).toBe(n * n * 4 * count);
    });

    test('each layer\'s colour has a mean ratio of 1 in each channel', () => {
        for (let layer = 0; layer < count; layer++) {
            const sums = [0, 0, 0];
            for (let i = 0; i < n * n; i++) for (let c = 0; c < 3; c++) sums[c] += set.albedo[(layer * n * n + i) * 4 + c] / 255 * 2;
            for (const sum of sums) expect(Math.abs(sum / (n * n) - 1)).toBeLessThan(0.01);
        }
    });

    test('every layer tiles without a seam', () => {
        for (let layer = 0; layer < count; layer++) {
            const at = (x, y) => set.albedo[(layer * n * n + y * n + x) * 4 + 3];
            let inside = 0, edge = 0;
            for (let y = 0; y < n; y++) {
                for (let x = 1; x < n; x++) inside += Math.abs(at(x, y) - at(x - 1, y));
                edge += Math.abs(at(0, y) - at(n - 1, y));
            }
            // The mean step across the edge is about the mean step inside
            expect(edge / n).toBeLessThan((inside / (n * (n - 1))) * 2 + 2);
        }
    });

    test('the memory it takes', () => {
        expect(GroundTex.bytes()).toBeLessThan(16 * 1024 * 1024);
    });
});

describe('the shader and the switch', () => {
    test('it goes in at all three places, and off it takes no branch of its own', () => {
        const shader = { uniforms: {}, fragmentShader: '#include <common>\n#include <color_fragment>\n#include <normal_fragment_maps>\n' };
        GroundTex.inject(shader);
        expect(shader.uniforms.uGround).toBe(GroundTex.uniforms.uGround);
        expect(shader.fragmentShader).toMatch(/uniform sampler2DArray tGroundAlbedo/);
        expect(shader.fragmentShader).toMatch(/if \(uGround > 0\.0\) \{/);
        expect(shader.fragmentShader).toMatch(/if \(uGround > 1\.5 && dot\(groundBend, groundBend\) > 0\.0\)/);
    });

    test('the textures are made once, before a level needs them; until then the land is drawn as off', () => {
        const u = GroundTex.uniforms;
        LandDetail.set(true);
        expect(GroundTex.state).toBeUndefined();
        // No worker here: prepare makes them at once, as the settings are read
        GroundTex.prepare(null);
        expect(GroundTex.state).toBe('ready');
        const made = u.tGroundAlbedo.value;
        expect(made.isDataArrayTexture).toBe(true);
        GroundTex.set(null, 'low');
        expect(u.uGround.value).toBe(1);
        expect(LandDetail.uniforms.uLandDetail.value).toBe(1);
        GroundTex.set(null, 'medium');
        expect(LandDetail.uniforms.uLandDetail.value).toBe(0);
        GroundTex.set(null, 'high');
        GroundTex.set(null, 'off');
        expect(u.uGround.value).toBe(0);
        expect(LandDetail.uniforms.uLandDetail.value).toBe(1);
        // A step never makes them again
        GroundTex.set(null, 'medium');
        expect(u.tGroundAlbedo.value).toBe(made);
        LandDetail.set(false);
        GroundTex.set(null, 'off');
    });

    test('the fields\' means the shader divides by are the pattern\'s own', () => {
        GroundTex.patch();
        GroundTex.patchMean.forEach((mean, c) => expect(Math.abs(mean - GroundTex.PATCH_MEAN[c])).toBeLessThan(0.0005));
    });

    test('the land\'s program is the same at every level, so a change mid-ride never compiles', () => {
        const { LandShade } = new Function('THREE', 'LandDetail', 'GroundTex', `${loadScript('world/landshade.js')}\nreturn { LandShade };`)(three, LandDetail, GroundTex);
        const material = LandShade.patch(new three.MeshLambertMaterial({ vertexColors: true }), { detail: true });
        const key = material.customProgramCacheKey();
        expect(key).toMatch(/-ground$/);
        const version = material.version;
        for (const level of ['low', 'medium', 'high', 'off', 'high', 'low']) {
            GroundTex.set(null, level);
            expect(material.customProgramCacheKey()).toBe(key);
        }
        expect(material.version).toBe(version);
        GroundTex.set(null, 'off');
    });
});
