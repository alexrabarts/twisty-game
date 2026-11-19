// The haze of a world (js/world/landshade.js): one aerial perspective for everything a world draws. The numbers are
// the photos' (`node tools/world/photomatch.mjs haze`); the drawn result is held by the browser probe world-haze
// (tools/terrain-check.mjs), which fails when distant land is greener than the sky near the horizon.
import { loadGame } from '../helpers/load-game.js';

const game = loadGame(undefined, []);
const { THREE, LandShade, WorldLooks } = game;

const hsv = color => {
    const c = color.clone().convertLinearToSRGB();
    const mx = Math.max(c.r, c.g, c.b), mn = Math.min(c.r, c.g, c.b), d = mx - mn;
    const h = d > 0 ? (mx === c.r ? ((c.g - c.b) / d + 6) % 6 : mx === c.g ? (c.b - c.r) / d + 2 : (c.r - c.g) / d + 4) * 60 : 0;
    return { h, s: mx ? d / mx : 0, v: mx };
};
// How much of the air a fragment takes at `d` metres, level with an eye at `eyeY` (LandShade.HAZE_GLSL, in JS)
const share = (d, eyeY = LandShade.HAZE.baseY) => {
    const h = LandShade.HAZE;
    return h.most * (1 - Math.exp(-Math.pow(h.perM * d * Math.exp(-(eyeY - h.baseY) / h.scaleM), h.onset)));
};

describe('the haze of a world', () => {
    test('the air takes the hue of the sky at the horizon, deeper and darker: never green', () => {
        const fog = new THREE.Color().setRGB(188 / 255, 203 / 255, 224 / 255, THREE.SRGBColorSpace);
        const air = hsv(LandShade.airColor(fog, 0));
        expect(air.h).toBeCloseTo(hsv(fog).h, 0);
        expect(air.s).toBeCloseTo(LandShade.HAZE.air.s, 2);
        expect(air.v).toBeCloseTo(LandShade.HAZE.air.v, 2);
        const c = LandShade.airColor(fog, 0).convertLinearToSRGB();
        expect(c.g).toBeLessThan(c.b);
        expect(c.g).toBeGreaterThan(c.r);
    });

    test('in mist, rain or snow the air is the weather\'s own colour', () => {
        const fog = new THREE.Color(0.5, 0.5, 0.52);
        const air = LandShade.airColor(fog, 1);
        expect(air.r).toBeCloseTo(fog.r, 5);
        expect(air.b).toBeCloseTo(fog.b, 5);
    });

    test('near land keeps its own colour and far land takes the air: the photos\' three bands', () => {
        // 1 to 3 km the land's own colour still, 3 to 8 km about half air, from 8 km mostly air, never all of it
        expect(share(500)).toBeLessThan(0.03);
        expect(share(2000)).toBeLessThan(0.25);
        expect(share(5000)).toBeGreaterThan(0.45);
        expect(share(5000)).toBeLessThan(0.8);
        expect(share(12000)).toBeGreaterThan(0.85);
        expect(share(40000)).toBeLessThanOrEqual(LandShade.HAZE.most);
        // It thins with height, and does not go: the summit still has blue ridges
        expect(share(5000, 2100)).toBeLessThan(share(5000, 1200));
        expect(share(5000, 2100)).toBeGreaterThan(0.35);
    });

    test('a land material has the haze, and any other world material takes it once', () => {
        const land = LandShade.patch(new THREE.MeshLambertMaterial());
        expect(land.userData.haze).toBe(true);
        const house = new THREE.MeshStandardMaterial();
        const before = house.customProgramCacheKey();
        LandShade.haze(house);
        expect(house.userData.haze).toBe(true);
        expect(house.customProgramCacheKey()).not.toBe(before);
        const key = house.customProgramCacheKey(), compile = house.onBeforeCompile;
        LandShade.haze(house);
        expect(house.customProgramCacheKey()).toBe(key);
        expect(house.onBeforeCompile).toBe(compile);
        // A shader of its own (the sky, the rain) is left alone
        const own = new THREE.ShaderMaterial();
        LandShade.haze(own);
        expect(own.userData.haze).toBeUndefined();
    });

    test('the haze goes into a shader before the scene fog, with the air\'s uniforms', () => {
        const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <project_vertex>', fragmentShader: '#include <common>\n#include <fog_fragment>' };
        LandShade.injectHaze(shader);
        expect(shader.uniforms.uHazeColor).toBe(LandShade.uniforms.uHazeColor);
        expect(shader.uniforms.uHazeOnset.value).toBe(LandShade.HAZE.onset);
        expect(shader.vertexShader).toContain('vHazeView = mvPosition.xyz;');
        expect(shader.fragmentShader.indexOf('worldHaze(gl_FragColor.rgb, vHazeView)')).toBeLessThan(shader.fragmentShader.indexOf('#include <fog_fragment>'));
        expect(shader.fragmentShader.indexOf('worldHaze(gl_FragColor.rgb, vHazeView)')).toBeGreaterThan(0);
    });

    test('every material under a group takes it, and a model\'s world copy leaves the legs\' material alone', () => {
        const group = new THREE.Group();
        const a = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshLambertMaterial());
        const b = new THREE.Mesh(new THREE.BufferGeometry(), [new THREE.MeshStandardMaterial(), new THREE.MeshBasicMaterial()]);
        group.add(a, b);
        LandShade.hazeTree(group);
        expect([a.material, ...b.material].every(m => m.userData.haze)).toBe(true);
        const legs = new THREE.MeshStandardMaterial();
        const [part] = LandShade.adopt([{ geometry: null, material: legs }]);
        expect(part.material).not.toBe(legs);
        expect(part.material.userData.haze).toBe(true);
        expect(legs.userData.haze).toBeUndefined();
        expect(LandShade.adopt([{ geometry: null, material: legs }])[0].material).toBe(part.material);
    });

    test('a world\'s sky keeps the horizon\'s pale colour higher than a leg\'s', () => {
        expect(WorldLooks.horizonSpan).toBeGreaterThan(0.22);
        expect(WorldLooks.horizonSpan).toBeLessThanOrEqual(0.6);
    });
});
