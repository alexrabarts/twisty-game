// The modelled scenery of foggy-gorge (js/sceneassets.js, assets/gorge, built
// by tools/blender): the committed files read as the reader expects, and
// dressing a real gorge build swaps rocks, portals and the rock face's
// texture without moving the ground, the physics or any solid obstacle.
// Real modules on real three r150; fetch reads the files from disk.
import { readFileSync, statSync } from 'node:fs';
import { Blob } from 'node:buffer';
import { TextDecoder } from 'node:util';
import { canvasStub, legs, loadScript, realThree } from '../helpers/load-game.js';

const root = new URL('../../', import.meta.url);
const GORGE = 3;
const BUDGET = { meshes: 800, triangles: 450000, instances: 1400, bytes: 3 * 1024 * 1024 };

function loadWithAssets({ failing = [] } = {}) {
    const THREE = realThree();
    const files = ['terrain.js', 'world/route.js', 'world/legroute.js', 'world/ground.js', 'vehicle.js', 'environment.js', 'tours.js', 'sceneassets.js'];
    const source = files.map(loadScript).join('\n;\n');
    const log = [];
    const sink = { log() {}, warn: (...a) => log.push(a.join(' ')), error: (...a) => log.push(a.join(' ')) };
    const fetch = async url => {
        if (failing.some(part => url.includes(part))) return { ok: false, status: 404 };
        const bytes = readFileSync(new URL(url, root));
        return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
    };
    // No decoder in node: an image is only carried to a texture here
    const createImageBitmap = async blob => ({ width: 1, height: 1, bytes: blob.size });
    const factory = new Function(
        'THREE', 'document', 'localStorage', 'console', 'fetch', 'createImageBitmap', 'Blob', 'TextDecoder', 'performance',
        `${source}\nreturn { Environment, TourSystem, Terrain, SceneAssets };`
    );
    const game = factory(THREE, canvasStub(), { getItem: () => null, setItem() {} }, sink, fetch, createImageBitmap, Blob, TextDecoder, performance);
    return { THREE, log, ...game };
}

function build(game, legIndex) {
    const leg = legs(game)[legIndex];
    const scene = new game.THREE.Scene();
    const env = new game.Environment(scene, leg.startSegment, leg.endSegment, legIndex);
    scene.updateMatrixWorld(true);
    return env;
}

// As the budget probe of tools/terrain-check.mjs counts them
function counts(scene) {
    let meshes = 0;
    let triangles = 0;
    let instances = 0;
    scene.traverse(o => {
        if (!o.isMesh) return;
        meshes++;
        const index = o.geometry.index;
        triangles += ((index ? index.count : o.geometry.attributes.position.count) / 3) * (o.isInstancedMesh ? o.count : 1);
        if (o.isInstancedMesh) instances += o.count;
    });
    return { meshes, triangles: Math.round(triangles), instances };
}

const tagged = (scene, kinds) => {
    const found = [];
    scene.traverse(o => { if (o.isMesh && o.userData.dressing && kinds.includes(o.userData.dressing.kind)) found.push(o); });
    return found;
};

describe('foggy-gorge modelled scenery', () => {
    const game = loadWithAssets();
    const env = build(game, GORGE);
    const rocks = tagged(env.scene, ['rock', 'debris']).length;
    const portals = tagged(env.scene, ['portal']).length;
    const boulders = JSON.stringify(env.boulders);
    const ribbons = [];
    env.scene.traverse(o => { if (o.isMesh && o.userData.part === 'ground' && o.material.map && o.material.vertexColors) ribbons.push(o); });
    const ribbonPositions = ribbons.map(r => Float32Array.from(r.geometry.attributes.position.array));
    const ground = env.roadPath.slice(env.startSegment, env.endSegment + 1).filter((_, i) => i % 5 === 0)
        .flatMap(p => [-30, -12, 0, 12, 30].map(l => env.groundYAt(p.x + Math.cos(p.heading) * l, p.z - Math.sin(p.heading) * l)));
    let result;

    beforeAll(async () => {
        result = await env.dressing;
    });

    test('the leg asks for its files, and they fit the download budget', () => {
        const files = game.SceneAssets.files(GORGE);
        expect(files).toHaveLength(4);
        const total = files.reduce((sum, file) => sum + statSync(new URL(file, root)).size, 0);
        expect(total).toBeLessThanOrEqual(BUDGET.bytes);
        expect(result.bytes).toBe(total);
    });

    test('every tagged rock and portal is swapped, and the rock face retextured', () => {
        expect(rocks).toBeGreaterThan(100);
        expect(portals).toBe(2);
        expect(result.rocks.rocks).toBe(rocks);
        // A few the drawn ground cannot hold in a model's shape are left out
        expect(result.rocks.placed).toBeGreaterThan(rocks * 0.9);
        expect(result.portals.portals).toBe(4);
        expect(result.rockFace.ribbons).toBe(2);
        expect(tagged(env.scene, ['rock', 'debris', 'portal'])).toHaveLength(0);
        ribbons.forEach(r => {
            expect(r.material.normalMap).toBeTruthy();
            expect(r.material.map.image.bytes).toBeGreaterThan(0);
        });
    });

    // The wall's two maps before this detail were a photo's, 522082 bytes
    test('the rock face\'s maps are no larger than the photo they replaced', () => {
        const { map, normalMap } = game.SceneAssets.LEGS[GORGE].rockFace;
        const total = [map, normalMap].reduce((sum, file) => sum + statSync(new URL(file, root)).size, 0);
        expect(total).toBeLessThanOrEqual(522082);
    });

    // The shader reads the detail by a level distance and world height: u is
    // the distance along the road's edge (one value up a column, growing from
    // column to column), v the level distance out from that edge
    test('the rock face carries level distances for its detail', () => {
        const rows = game.Terrain.ROWS + 1;
        ribbons.forEach(r => {
            const { uv, rock, position } = r.geometry.attributes;
            expect(rock.count).toBe(position.count);
            let last = -1;
            for (let column = 0; column < position.count / rows; column++) {
                const first = column * rows;
                if (rock.getX(first) === 0) continue;
                expect(uv.getX(first)).toBeGreaterThan(last);
                last = uv.getX(first);
                expect(uv.getY(first)).toBe(0);
                for (let j = 1; j < rows; j++) {
                    expect(uv.getX(first + j)).toBe(last);
                    expect(uv.getY(first + j)).toBeGreaterThanOrEqual(uv.getY(first + j - 1));
                }
            }
            expect(last).toBeGreaterThan(1000);
        });
    });

    // The detail is worked in by replacing three chunks of three's own
    // shader; a three whose shader lacks one must fail here, not draw a plain wall
    test('the rock face\'s shader fits three\'s standard shader', () => {
        const { tile } = game.SceneAssets.LEGS[GORGE].rockFace;
        ribbons.forEach(r => {
            const lib = game.THREE.ShaderLib.standard;
            const shader = { uniforms: {}, vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader };
            r.material.onBeforeCompile(shader);
            expect(shader.uniforms.rockTile.value).toBe(tile);
            expect(shader.vertexShader).toContain('vRockAt =');
            expect(shader.fragmentShader).toContain('rockPatches(rockUv');
            ['#include <map_fragment>', '#include <normal_fragment_maps>'].forEach(chunk => expect(shader.fragmentShader).not.toContain(chunk));
            expect(r.material.customProgramCacheKey()).toMatch(/^rock-face/);
        });
    });

    test('high-pass, bound to the frozen golden, names no modelled scenery', () => {
        expect(game.SceneAssets.LEGS[4]).toBeUndefined();
    });

    test('nothing the bike or the ground model reads has moved', () => {
        expect(JSON.stringify(env.boulders)).toBe(boulders);
        ribbons.forEach((r, n) => expect(r.geometry.attributes.position.array).toEqual(ribbonPositions[n]));
        const after = env.roadPath.slice(env.startSegment, env.endSegment + 1).filter((_, i) => i % 5 === 0)
            .flatMap(p => [-30, -12, 0, 12, 30].map(l => env.groundYAt(p.x + Math.cos(p.heading) * l, p.z - Math.sin(p.heading) * l)));
        expect(after).toEqual(ground);
    });

    test('no modelled rock floats', () => {
        expect(result.violations.filter(v => v.kind === 'floating')).toEqual([]);
        expect(game.log.some(line => line.includes('FLOATING'))).toBe(false);
    });

    // A modelled rock stands where its procedural one did, turned and sunk the
    // same way, so on a steep face it too is mostly inside the face
    test('a modelled rock on a face is sunk into it, and none is buried out of sight', () => {
        const { THREE, Terrain } = game;
        const last = env.roadPath.length - 1;
        const clear = p => Terrain.clearance(env.terrain, env.terrainGeometry, p.x, p.y, p.z, 0, last);
        const face = Math.cos((40 * Math.PI) / 180);
        const ball = [];
        for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) for (let k = -2; k <= 2; k++) {
            if (Math.hypot(i, j, k) <= 2.5) ball.push([i / 2.5, j / 2.5, k / 2.5]);
        }
        const matrix = new THREE.Matrix4();
        const point = new THREE.Vector3();
        const hanging = [];
        let onFace = 0;
        env.scene.traverse(o => {
            if (!o.isInstancedMesh || o.userData.modelled !== 'rocks') return;
            for (let n = 0; n < o.count; n++) {
                o.getMatrixAt(n, matrix);
                const centre = new THREE.Vector3().setFromMatrixPosition(matrix);
                if (Terrain.surfaceAt(env.terrain, env.terrainGeometry, centre.x, centre.z, 0, last).least >= face) continue;
                onFace++;
                const air = ball.filter(p => clear(point.set(...p).applyMatrix4(matrix)) > 0.02).length / ball.length;
                if (air > 0.25) hanging.push({ at: centre.toArray().map(v => Math.round(v)), air });
            }
        });
        expect(onFace).toBeGreaterThan(40);
        expect(hanging).toEqual([]);
        expect(result.violations).toEqual([]);
    });

    test('the dressed leg stays within the per-leg budget', () => {
        const after = counts(env.scene);
        expect(after.meshes).toBeLessThanOrEqual(BUDGET.meshes);
        expect(after.triangles).toBeLessThanOrEqual(BUDGET.triangles);
        expect(after.instances).toBeLessThanOrEqual(BUDGET.instances);
    });

    test('each instanced group\'s bounds hold all its rocks, so culling never drops a visible one', () => {
        const groups = [];
        env.scene.traverse(o => { if (o.isInstancedMesh && o.userData.modelled === 'rocks') groups.push(o); });
        expect(groups.length).toBe(result.rocks.meshes);
        const m = new game.THREE.Matrix4();
        const centre = new game.THREE.Vector3();
        groups.forEach(group => {
            const sphere = group.geometry.boundingSphere;
            for (let i = 0; i < group.count; i++) {
                group.getMatrixAt(i, m);
                centre.setFromMatrixPosition(m);
                expect(centre.distanceTo(sphere.center)).toBeLessThanOrEqual(sphere.radius);
            }
        });
    });

    test('a wing wall stands only where the side beyond the portal is a rock wall', () => {
        const frames = [];
        env.scene.traverse(o => { if (o.name === 'modelled-portals') frames.push(...o.children); });
        expect(frames).toHaveLength(4);
        // Tunnel 1: walls both sides at its entry, a drop on the right at its exit; tunnel 2: the reverse at its exit
        expect(frames.map(frame => frame.children.length - 2)).toEqual([2, 1, 1, 1]);
    });
});

describe('where the modelled scenery does not apply', () => {
    test('a leg without assets is not dressed', () => {
        const game = loadWithAssets();
        expect(build(game, 4).dressing).toBeNull();
    });

    // Another leg's wall can take the detail without models of its own
    test('a leg that names only a rock face gets that and nothing else', async () => {
        const game = loadWithAssets();
        game.SceneAssets.LEGS[1] = { rockFace: game.SceneAssets.LEGS[GORGE].rockFace };
        expect(game.SceneAssets.files(1)).toHaveLength(2);
        const env = build(game, 1);
        const rocks = tagged(env.scene, ['rock', 'debris']).length;
        const result = await env.dressing;
        expect(result.rockFace.ribbons).toBeGreaterThan(0);
        expect(result.rocks).toEqual({ rocks: 0 });
        expect(result.portals).toEqual({ portals: 0 });
        expect(result.violations).toEqual([]);
        expect(tagged(env.scene, ['rock', 'debris'])).toHaveLength(rocks);
        expect(game.log.filter(line => line.includes('SceneAssets'))).toEqual([]);
    });

    test('a file that fails leaves its part procedural and the others dressed', async () => {
        const game = loadWithAssets({ failing: ['rocks.glb'] });
        const env = build(game, GORGE);
        const rocks = tagged(env.scene, ['rock', 'debris']).length;
        const result = await env.dressing;
        expect(result.rocks.error).toMatch(/404/);
        expect(tagged(env.scene, ['rock', 'debris'])).toHaveLength(rocks);
        expect(result.portals.portals).toBe(4);
        expect(game.log.some(line => line.includes('kept its procedural meshes'))).toBe(true);
    });

    test('a leg torn down before its files arrive gets nothing added', async () => {
        const game = loadWithAssets();
        const env = build(game, GORGE);
        const children = [...env.scene.children];
        children.forEach(child => env.scene.remove(child));
        const result = await env.dressing;
        expect(result.rocks.rocks).toBe(0);
        expect(result.portals.portals).toBe(0);
        expect(env.scene.children).toHaveLength(0);
    });
});
