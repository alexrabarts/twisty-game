// The Blender-made trees and bushes (js/treemodels.js, assets/trees, built by
// tools/blender/tree_*.py): the committed files fit their budgets and stand
// as the game plants them, and dressing a real leg redraws every tree as a
// modelled shape without moving one instance, one tint or one solid trunk.
// A file that fails leaves its kind procedural, and high-pass is left alone.
// Real modules on real three r150; fetch reads the files from disk.
import { readFileSync, statSync } from 'node:fs';
import { Blob } from 'node:buffer';
import { TextDecoder } from 'node:util';
import { canvasStub, legs, loadScript, realThree } from '../helpers/load-game.js';

const root = new URL('../../', import.meta.url);
// As tools/blender/tree_kit.py and tools/terrain-check.mjs hold them
const BUDGET = { tree: 220, bush: 80, bytes: 100 * 1024, leg: { triangles: 450000, instances: 1400 } };
const VALLEY = 1;
const HIGH_PASS = 4;
const STORM = 5;
const WINTER = 7;
// The solid circle of a trunk (Environment.plantRunoffTrees) and how far the game sinks a tree's origin
const TRUNK = 0.6;
const SUNK = 0.6;
const TREES = ['conifer_spruce', 'conifer_fir', 'conifer_pine', 'conifer_spruce_snow', 'conifer_fir_snow', 'conifer_pine_snow', 'broadleaf_oak', 'broadleaf_beech', 'broadleaf_ash'];
const BUSHES = ['bush_round', 'bush_low', 'bush_round_snow', 'bush_low_snow'];

function load({ failing = [] } = {}) {
    const THREE = realThree();
    const source = ['terrain.js', 'world/route.js', 'world/legroute.js', 'world/ground.js', 'vehicle.js', 'environment.js', 'tours.js', 'sceneassets.js', 'treemodels.js'].map(loadScript).join('\n;\n');
    const log = [];
    const sink = { log() {}, warn: (...a) => log.push(a.join(' ')), error: (...a) => log.push(a.join(' ')) };
    const fetch = async url => {
        if (failing.some(part => url.includes(part))) return { ok: false, status: 404 };
        const bytes = readFileSync(new URL(url, root));
        return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
    };
    const createImageBitmap = async blob => ({ width: 1, height: 1, bytes: blob.size });
    const factory = new Function(
        'THREE', 'document', 'localStorage', 'console', 'fetch', 'createImageBitmap', 'Blob', 'TextDecoder', 'performance',
        `${source}\nreturn { Environment, TourSystem, Terrain, SceneAssets, TreeModels };`
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

const forests = scene => {
    const found = [];
    scene.traverse(o => { if (o.isInstancedMesh && o.name.startsWith('forest-')) found.push(o); });
    return found;
};
const bushes = scene => {
    const found = [];
    scene.traverse(o => { if (o.isMesh && o.userData.plant && o.userData.plant.kind === 'bush') found.push(o); });
    return found;
};
const triangles = geometry => (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;

// Every tree of a leg as one line: its kind, its matrix and its tint, exactly as stored
function plantings(game, scene) {
    const matrix = new game.THREE.Matrix4();
    const tint = new game.THREE.Color();
    const lines = [];
    for (const mesh of forests(scene)) {
        for (let n = 0; n < mesh.count; n++) {
            mesh.getMatrixAt(n, matrix);
            mesh.getColorAt(n, tint);
            lines.push(`${mesh.name}|${matrix.elements.join(',')}|${tint.r},${tint.g},${tint.b}`);
        }
    }
    return lines.sort();
}

function counts(scene) {
    let total = 0;
    let instances = 0;
    scene.traverse(o => {
        if (!o.isMesh) return;
        total += triangles(o.geometry) * (o.isInstancedMesh ? o.count : 1);
        if (o.isInstancedMesh) instances += o.count;
    });
    return { triangles: Math.round(total), instances };
}

describe('the tree and bush files', () => {
    const game = load();
    const models = {};

    beforeAll(async () => {
        for (const [kind, url] of Object.entries(game.TreeModels.FILES)) models[kind] = await game.SceneAssets.loadModel(url);
    });

    const shape = name => models[name.split('_')[0]].meshes.get(name);

    test('every shape the game asks for is there, one mesh with its colours in the vertices', () => {
        for (const name of [...TREES, ...BUSHES]) {
            const primitives = shape(name);
            expect(primitives).toHaveLength(1);
            expect(primitives[0].geometry.attributes.color).toBeTruthy();
            expect(primitives[0].material.map).toBeNull();
        }
        // The shares of a kind are of all its instances
        Object.values(game.TreeModels.SHAPES).forEach(shares => {
            expect(Object.values(shares).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
        });
    });

    test('no file carries a texture, and together they are small', () => {
        let total = 0;
        for (const url of Object.values(game.TreeModels.FILES)) {
            const bytes = readFileSync(new URL(url, root));
            const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
            expect(json.images || []).toHaveLength(0);
            expect(json.textures || []).toHaveLength(0);
            total += statSync(new URL(url, root)).size;
        }
        expect(total).toBeLessThanOrEqual(BUDGET.bytes);
    });

    test('a tree is at most 220 triangles and a bush 80', () => {
        TREES.forEach(name => expect(triangles(shape(name)[0].geometry)).toBeLessThanOrEqual(BUDGET.tree));
        BUSHES.forEach(name => expect(triangles(shape(name)[0].geometry)).toBeLessThanOrEqual(BUDGET.bush));
    });

    // The ground cuts a planted tree between y = 0.39 and y = 1.09 of the model (0.6 m at scales 1.55 to 0.55)
    test('a tree stands on a plain trunk about as thick as its solid circle', () => {
        for (const name of TREES) {
            const position = shape(name)[0].geometry.attributes.position;
            let lowest = Infinity;
            let widest = 0;
            let trunk = 0;
            for (let i = 0; i < position.count; i++) {
                const y = position.getY(i);
                const radius = Math.hypot(position.getX(i), position.getZ(i));
                lowest = Math.min(lowest, y);
                if (y < 1.15) widest = Math.max(widest, radius);
                if (y < 0.1) trunk = Math.max(trunk, radius);
            }
            // It reaches under the ground at every scale, and only the trunk is down there
            expect(lowest).toBeLessThanOrEqual(0.01);
            expect(widest).toBeLessThanOrEqual(TRUNK);
            expect(trunk).toBeGreaterThanOrEqual(TRUNK * 0.6);
        }
    });

    test('a bush fills the ball it replaces and reaches into the ground', () => {
        for (const name of BUSHES) {
            const geometry = shape(name)[0].geometry;
            expect(geometry.boundingSphere.radius).toBeLessThanOrEqual(1.4);
            expect(geometry.boundingBox.max.y).toBeGreaterThanOrEqual(0.6);
            // Environment seats the centre 0.25 of the radius above the ground
            expect(geometry.boundingBox.min.y).toBeLessThanOrEqual(-0.3);
        }
    });
});

describe.each([[STORM, 'storm-valley'], [VALLEY, 'valley-run'], [WINTER, 'winter-pass']])('dressing leg %i (%s)', (legIndex) => {
    const game = load();
    const env = build(game, legIndex);
    const before = {
        plantings: plantings(game, env.scene),
        meshes: forests(env.scene).length,
        boulders: JSON.stringify(env.boulders),
        rand: env.randState,
        counts: counts(env.scene),
        bushes: bushes(env.scene).map(b => [b.position.toArray(), b.scale.toArray()]),
    };
    const snowy = !!env.config.dressing.forest.snowy;
    let result;

    beforeAll(async () => {
        result = await env.dressing;
    });

    test('the procedural forest is what stands first', () => {
        expect(before.meshes).toBeGreaterThanOrEqual(1);
        expect(before.meshes).toBeLessThanOrEqual(2);
        expect(before.plantings.length).toBeGreaterThan(300);
    });

    test('every tree is redrawn as a modelled shape, a handful of draw calls for the leg', () => {
        const after = forests(env.scene);
        expect(result.trees.errors).toEqual([]);
        expect(result.trees.trees).toBe(before.plantings.length);
        expect(after.length).toBe(result.trees.meshes);
        // Three shapes to a kind
        expect(after.length).toBeLessThanOrEqual(before.meshes * 3);
        expect(after.length).toBeGreaterThan(before.meshes);
        after.forEach(mesh => {
            expect(mesh.userData.modelled).toBe('trees');
            expect(mesh.userData.plant).toBeUndefined();
            expect(mesh.userData.shape.endsWith('_snow')).toBe(snowy);
            expect(mesh.material.vertexColors).toBe(true);
            expect(mesh.material.map).toBeNull();
            expect(mesh.castShadow).toBe(true);
            // No shape takes the whole forest
            expect(mesh.count).toBeLessThan(before.plantings.length * 0.6);
        });
    });

    test('no instance moves, turns, grows or changes its tint', () => {
        expect(plantings(game, env.scene)).toEqual(before.plantings);
    });

    test('the solid trunks, the seeded generator and the instance count are untouched', () => {
        expect(JSON.stringify(env.boulders)).toBe(before.boulders);
        expect(env.randState).toBe(before.rand);
        expect(counts(env.scene).instances).toBe(before.counts.instances);
    });

    test('a drawn trunk stands in every solid circle', () => {
        // An instance matrix holds float32; a solid circle holds the doubles it was placed from
        const key = (x, z) => `${Math.fround(x)},${Math.fround(z)}`;
        const at = new Map(before.plantings.map(line => {
            const m = line.split('|')[1].split(',').map(Number);
            return [key(m[12], m[14]), m[13] + SUNK];
        }));
        const trunks = env.boulders.filter(b => b.label === 'tree');
        trunks.forEach(b => {
            expect(b.radius).toBe(TRUNK);
            expect(at.get(key(b.position.x, b.position.z))).toBeCloseTo(b.position.y, 3);
        });
        if (legIndex === STORM) expect(trunks.length).toBeGreaterThan(300);
    });

    test('the leg stays inside its triangle budget', () => {
        const now = counts(env.scene);
        expect(now.triangles).toBeLessThanOrEqual(BUDGET.leg.triangles);
        expect(now.instances).toBeLessThanOrEqual(BUDGET.leg.instances);
    });

    test('each bush keeps its seat and its size and takes a modelled shape', () => {
        const after = bushes(env.scene);
        expect(after.length).toBe(before.bushes.length);
        expect(result.trees.bushes).toBe(before.bushes.length);
        expect(after.map(b => [b.position.toArray(), b.scale.toArray()])).toEqual(before.bushes);
        after.forEach(bush => {
            expect(bush.userData.modelled).toBe('trees');
            expect(bush.geometry.attributes.color).toBeTruthy();
            expect(bush.material.vertexColors).toBe(true);
        });
        if (after.length > 4) expect(new Set(after.map(b => b.rotation.y)).size).toBeGreaterThan(after.length / 2);
    });

    test('a second build gives each tree the same shape', async () => {
        const again = build(game, legIndex);
        await again.dressing;
        const shapes = scene => forests(scene).map(mesh => `${mesh.name}:${mesh.userData.shape}:${mesh.count}`).sort();
        expect(shapes(again.scene)).toEqual(shapes(env.scene));
    });
});

describe('where the models are not used', () => {
    test('high-pass keeps its procedural trees: the frozen golden binds its meshes', async () => {
        const game = load();
        const env = build(game, HIGH_PASS);
        expect(env.dressing).toBeNull();
        const meshes = forests(env.scene);
        expect(meshes.length).toBeGreaterThan(0);
        meshes.forEach(mesh => {
            expect(mesh.userData.modelled).toBeUndefined();
            expect(mesh.userData.plant).toBeTruthy();
        });
    });

    test('a file that fails leaves its kind procedural and the others modelled', async () => {
        const game = load({ failing: ['conifer.glb'] });
        const env = build(game, STORM);
        const before = plantings(game, env.scene);
        const result = await env.dressing;
        expect(result.trees.errors).toHaveLength(1);
        expect(result.trees.errors[0]).toMatch(/^conifer: /);
        expect(game.log.some(line => line.includes('kept its procedural shape'))).toBe(true);
        const kept = forests(env.scene).filter(mesh => mesh.name === 'forest-conifer');
        expect(kept).toHaveLength(1);
        expect(kept[0].userData.modelled).toBeUndefined();
        // The material the two procedural meshes shared is still the conifers'
        expect(kept[0].material.vertexColors).toBe(true);
        const swapped = forests(env.scene).filter(mesh => mesh.name === 'forest-broadleaf');
        expect(swapped.length).toBeGreaterThan(1);
        swapped.forEach(mesh => expect(mesh.userData.modelled).toBe('trees'));
        expect(plantings(game, env.scene)).toEqual(before);
    });

    test('a leg torn down before its files arrive gets nothing added', async () => {
        const game = load();
        const env = build(game, STORM);
        const count = env.scene.children.length;
        const meshes = forests(env.scene);
        meshes.forEach(mesh => mesh.parent.remove(mesh));
        const result = await env.dressing;
        expect(result.trees.trees).toBe(0);
        expect(env.scene.children.length).toBe(count - meshes.length);
    });

    test('without the script a leg is built as before', () => {
        const THREE = realThree();
        const source = ['terrain.js', 'world/route.js', 'world/legroute.js', 'world/ground.js', 'vehicle.js', 'environment.js', 'tours.js'].map(loadScript).join('\n;\n');
        const factory = new Function('THREE', 'document', 'localStorage', 'console', `${source}\nreturn { Environment, TourSystem, Terrain };`);
        const game = { THREE, ...factory(THREE, canvasStub(), { getItem: () => null, setItem() {} }, { log() {}, warn() {}, error() {} }) };
        const env = build(game, STORM);
        expect(env.dressing).toBeNull();
        expect(forests(env.scene)).toHaveLength(2);
    });
});
