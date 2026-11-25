/**
 * @jest-environment node
 */
// The bike, the riders and the traffic in a tunnel or a gallery are lit by the tube, not the sun (TubeShade.moverAt,
// patchMover; .agent/system/world.md, "The inside of a tube"): a rider deep in a tunnel takes none of the sun and the
// sky and the lamps' light instead, in a gallery the gallery's share, at a portal none, and the patched shader holds
// the sun's light out by that share. The land and the world keep their light (they are not patched).
import { describe, test, expect, beforeAll } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';

const game = loadGame(undefined, []);
const { THREE, WorldEnvironment, TubeLining, TubeShade } = game;
const T = TubeLining.TUBE;

describe('a rider in a tube on the Gotthard leg', () => {
    let env, runs;
    // A rider 1 m over the road at s, `lat` across
    const rider = (s, lat = 1.5) => {
        const p = env.route.sample(s, {});
        return TubeShade.moverAt(env, p.x + lat * Math.cos(p.heading), p.y + 1, p.z - lat * Math.sin(p.heading));
    };
    beforeAll(async () => {
        const { fetchFn } = diskFetch();
        env = await WorldEnvironment.load(new THREE.Scene(), { id: 'gotthard-north', fetchFn, models: null, digest: async () => '0' });
        runs = env.tubeInfo().runs;
    }, 600000);

    test('deep in a tunnel a rider gets no direct sun and no sky, and the lamps\' light', () => {
        const tunnel = runs.find(r => !r.gallery && r.s1 - r.s0 > 300);
        expect(tunnel).toBeTruthy();
        for (let s = tunnel.s0 + T.dayM + 5; s < tunnel.s1 - T.dayM - 5; s += 25) {
            const at = rider(s);
            // (the sun's share left to the rider is 1 - share)
            expect(1 - at.share).toBeCloseTo(0, 5);
            expect(at.lamp).toBeGreaterThan(TubeShade.LIGHT.fill);
        }
    });

    test('in a gallery the gallery\'s share, at a portal none, and the share grows in between', () => {
        const gallery = runs.find(r => r.gallery && r.s1 - r.s0 > 200);
        const mid = (gallery.s0 + gallery.s1) / 2;
        expect(rider(mid).share).toBeCloseTo(T.galleryShare, 2);
        expect(rider(gallery.s0 - 10).share).toBe(0);
        const a = rider(gallery.s0 + 5).share, b = rider(gallery.s0 + 15).share;
        expect(a).toBeGreaterThan(0);
        expect(b).toBeGreaterThan(a);
        expect(b).toBeLessThan(T.galleryShare);
        // (and none off the ride's tube: over its roof or out past its walls)
        const p = env.route.sample(mid, {});
        expect(TubeShade.moverAt(env, p.x, p.y + 12, p.z).share).toBe(0);
        expect(TubeShade.moverAt(env, p.x + 20 * Math.cos(p.heading), p.y + 1, p.z - 20 * Math.sin(p.heading)).share).toBe(0);
    });

    test('in the open a rider keeps the sun', () => {
        for (const s of [500, 3000, 6000]) expect(rider(s).share).toBe(0);
    });

    test('the patched shader holds the sun and the sky out by the rider\'s share and adds the lamps', () => {
        for (const [material, lib] of [[new THREE.MeshStandardMaterial(), 'physical'], [new THREE.MeshLambertMaterial(), 'lambert']]) {
            expect(TubeShade.patchMover(material)).toBe(true);
            expect(TubeShade.patchMover(material)).toBe(false);
            const shader = { uniforms: {}, vertexShader: THREE.ShaderLib[lib].vertexShader, fragmentShader: THREE.ShaderLib[lib].fragmentShader };
            material.onBeforeCompile(shader);
            expect(shader.vertexShader).toContain('vTubeMover = uTubeMovers[i].zw');
            const f = shader.fragmentShader;
            const sum = f.indexOf('vec3 outgoingLight') >= 0 ? f.indexOf('vec3 outgoingLight') : f.indexOf('totalDiffuse');
            const fade = f.indexOf('reflectedLight.directDiffuse *= 1.0 - vTubeMover.x');
            expect(fade).toBeGreaterThan(f.indexOf('#include <lights_fragment_end>'));
            expect(fade).toBeLessThan(sum);
            expect(f).toContain('diffuseColor.rgb * uTubeLamp * vTubeMover.y');
            expect(shader.uniforms.uTubeMovers).toBe(TubeShade.uniforms.uTubeMovers);
            expect(material.customProgramCacheKey()).toContain('tube-mover');
        }
        // An unlit material has no light to hold out and is left alone
        expect(TubeShade.patchMover(new THREE.MeshBasicMaterial())).toBe(false);
    });

    test('the movers are written nearest first, at most MOVERS of them', () => {
        const list = Array.from({ length: TubeShade.MOVERS + 4 }, (_, i) => ({ x: i, z: 2 * i, share: 1, lamp: 0.5 }));
        TubeShade.writeMovers(list);
        expect(TubeShade.uniforms.uTubeMoverCount.value).toBe(TubeShade.MOVERS);
        expect(TubeShade.uniforms.uTubeMovers.value[3].toArray()).toEqual([3, 6, 1, 0.5]);
    });
});
