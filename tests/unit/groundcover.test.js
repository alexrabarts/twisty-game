// The ground cover effect (js/world/groundcover.js). Held here:
//   - its pattern is the same on every page (seeded noise, no image file)
//   - off, the land's shader takes no branch of its own: the code is behind the uniform, which is 0
//   - a tuft and a stone stay low (TUFT_H_M, STONE_H_M over the ground): ground cover, never a thing the bike meets
//   - the tufts and stones take the haze of a world (LandShade.haze), as everything a world draws does
//   - the row of Effects.LIST is on by default and in the Balanced and High presets, off in Low, and Auto keeps it to
//     the Rich level
// The drawn result (off is the old frame to the bit, the pictures, the cost) is the browser probes' (world-cover-off,
// world-near-ground, world-effect-shots in tools/terrain-check.mjs)
import { describe, test, expect } from '@jest/globals';
import { loadGame, loadScript } from '../helpers/load-game.js';

const game = loadGame(undefined, []);
const { THREE, LandShade } = game;
const { GroundCover } = new Function('THREE', 'LandShade', `${loadScript('world/groundcover.js')}\nreturn { GroundCover };`)(THREE, LandShade);
const { Effects } = new Function('THREE', `${loadScript('effects.js')}\nreturn { Effects };`)({ ShaderChunk: { lights_fragment_begin: '' }, Vector3: THREE.Vector3 });

describe('the ground cover', () => {
    test('its pattern is the same on every page', () => {
        const a = GroundCover.pattern(), b = GroundCover.pattern();
        expect(a.pattern.length).toBe(GroundCover.SIZE * GroundCover.SIZE * 4);
        expect(Buffer.from(a.pattern).equals(Buffer.from(b.pattern))).toBe(true);
        expect(Buffer.from(a.bend).equals(Buffer.from(b.bend))).toBe(true);
    });

    test('off, the land shader takes no branch of its own', () => {
        const shader = {
            uniforms: {},
            fragmentShader: '#include <common>\n#include <color_fragment>\n#include <normal_fragment_maps>'
        };
        GroundCover.inject(shader);
        expect(shader.uniforms.uGroundCover).toBe(GroundCover.uniforms.uGroundCover);
        expect(shader.fragmentShader).toMatch(/if \(uGroundCover > 0\.0\)/);
        expect(shader.fragmentShader).toMatch(/if \(coverNear > 0\.0\)/);
        GroundCover.set(null, false);
        expect(GroundCover.uniforms.uGroundCover.value).toBe(0);
        expect(GroundCover.scatter || null).toBe(null);
    });

    test('a tuft and a stone stay low', () => {
        const top = geometry => {
            geometry.computeBoundingBox();
            return geometry.boundingBox.max.y;
        };
        expect(top(GroundCover.tuftGeometry()) * GroundCover.TUFT_SCALE[1]).toBeLessThanOrEqual(GroundCover.TUFT_H_M);
        const stone = GroundCover.STONE_SCALE[1];
        expect(top(GroundCover.stoneGeometry()) * stone * GroundCover.STONE_FLAT - stone * GroundCover.STONE_SINK).toBeLessThanOrEqual(GroundCover.STONE_H_M);
    });

    test('the tufts and stones take the haze', () => {
        for (const key of ['cover-tuft', 'cover-stone']) {
            const material = GroundCover.grow(new THREE.MeshLambertMaterial(), key);
            expect(material.userData.haze).toBe(true);
            expect(material.customProgramCacheKey()).toBe(`${key}|haze`);
            const shader = {
                uniforms: {},
                vertexShader: '#include <common>\n#include <begin_vertex>\n#include <project_vertex>',
                fragmentShader: '#include <common>\n#include <fog_fragment>'
            };
            material.onBeforeCompile(shader);
            expect(shader.vertexShader).toMatch(/attribute float coverRank;/);
            expect(shader.fragmentShader).toMatch(/worldHaze\(/);
        }
    });

    test('its row is on by default, off only in Low, and Auto keeps it to the Rich level', () => {
        const row = Effects.LIST.find(effect => effect.id === 'groundCover');
        expect(row).toBeTruthy();
        expect(Effects.problems(row)).toEqual([]);
        expect(row.default).toBe('on');
        expect(row.presets).toEqual({ low: 'off', balanced: 'on', high: 'on' });
        // The effectMs of the ladder's Rich and Full levels (js/quality.js)
        expect(Effects.resolve({}, 0.7).groundCover).toBe('on');
        expect(Effects.resolve({}, 0.4).groundCover).toBe('off');
    });
});
