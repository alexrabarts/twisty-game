// The Blender-made trees and bushes a world draws (assets/trees, built by tools/blender/tree_*.py): the files read
// through the game's own reader (js/sceneassets.js), fit their budgets and stand as the world plants them
// (js/world/scenery.js, js/world/vegetation.js). Fetch reads the files from disk.
import { readFileSync, statSync } from 'node:fs';
import { Blob } from 'node:buffer';
import { TextDecoder } from 'node:util';
import { canvasStub, loadScript, realThree } from '../helpers/load-game.js';

const root = new URL('../../', import.meta.url);
// As tools/blender/tree_kit.py holds them
const BUDGET = { bush: 80, bytes: 100 * 1024 };
const BUSHES = ['bush_round', 'bush_low', 'bush_round_snow', 'bush_low_snow'];

function load() {
    const THREE = realThree();
    const fetch = async url => {
        const bytes = readFileSync(new URL(url, root));
        return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
    };
    const createImageBitmap = async blob => ({ width: 1, height: 1, bytes: blob.size });
    const factory = new Function('THREE', 'document', 'fetch', 'createImageBitmap', 'Blob', 'TextDecoder', `${loadScript('sceneassets.js')}\nreturn { SceneAssets };`);
    return { THREE, ...factory(THREE, canvasStub(), fetch, createImageBitmap, Blob, TextDecoder) };
}

const triangles = geometry => (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;

// The bushes of assets/trees/bush.glb: a world without its shrubs file draws bush_round and bush_low (Scenery)
describe('the bush file', () => {
    const game = load();
    let bush;

    beforeAll(async () => {
        bush = await game.SceneAssets.loadModel('assets/trees/bush.glb');
    });

    test('every bush is there, one mesh with its colours in the vertices', () => {
        for (const name of BUSHES) {
            const primitives = bush.meshes.get(name);
            expect({ name, found: !!primitives }).toEqual({ name, found: true });
            expect(primitives).toHaveLength(1);
            expect(primitives[0].geometry.attributes.color).toBeTruthy();
            expect(primitives[0].material.map).toBeNull();
        }
    });

    test('the file carries no texture and is small', () => {
        const url = 'assets/trees/bush.glb';
        const bytes = readFileSync(new URL(url, root));
        const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
        expect(json.images || []).toHaveLength(0);
        expect(json.textures || []).toHaveLength(0);
        expect(statSync(new URL(url, root)).size).toBeLessThanOrEqual(BUDGET.bytes);
    });

    test('a bush is at most 80 triangles, fills a ball of 1.4 m and reaches into the ground', () => {
        for (const name of BUSHES) {
            const geometry = bush.meshes.get(name)[0].geometry;
            expect(triangles(geometry)).toBeLessThanOrEqual(BUDGET.bush);
            expect(geometry.boundingSphere.radius).toBeLessThanOrEqual(1.4);
            expect(geometry.boundingBox.max.y).toBeGreaterThanOrEqual(0.6);
            expect(geometry.boundingBox.min.y).toBeLessThanOrEqual(-0.3);
        }
    });
});

// A world's trees (assets/trees/alpine.glb, tools/blender/tree_alpine.py): each species at three levels of detail,
// in the budgets of tools/blender/tree_species.py, and the outline the same at every level, so the game can swap one level for the next as the bike nears
describe('the world\'s tree levels', () => {
    const game = load();
    const SPECIES = ['spruce', 'fir', 'pine', 'larch', 'beech', 'ash'];
    const LEVELS = { near: 1400, mid: 220, far: 70 };
    let alpine;

    beforeAll(async () => {
        alpine = await game.SceneAssets.loadModel('assets/trees/alpine.glb');
    });

    const geometryOf = name => {
        const primitives = alpine.meshes.get(name);
        expect({ name, found: !!primitives }).toEqual({ name, found: true });
        expect(primitives).toHaveLength(1);
        return primitives[0].geometry;
    };

    test('every species has its three levels, each in its budget, the near level the most detailed', () => {
        for (const species of SPECIES) {
            const counts = Object.fromEntries(Object.keys(LEVELS).map(level => [level, triangles(geometryOf(`${species}_${level}`))]));
            for (const [level, most] of Object.entries(LEVELS)) expect({ species, level, over: counts[level] > most }).toEqual({ species, level, over: false });
            expect(counts.near).toBeGreaterThan(counts.mid * 3);
            expect(counts.mid).toBeGreaterThan(counts.far * 2);
        }
    });

    test('every level stands in the same outline: its height and its spread near the mid level\'s', () => {
        for (const species of SPECIES) {
            const box = level => { const g = geometryOf(`${species}_${level}`); g.computeBoundingBox(); return g.boundingBox; };
            const spread = bb => Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z);
            const mid = box('mid');
            for (const level of ['near', 'far']) {
                const b = box(level);
                expect({ species, level, height: Math.abs(b.max.y / mid.max.y - 1) < 0.2 }).toEqual({ species, level, height: true });
                expect({ species, level, spread: Math.abs(spread(b) / spread(mid) - 1) < 0.3 }).toEqual({ species, level, spread: true });
            }
        }
    });

    test('the file carries no texture and stays small', () => {
        const bytes = readFileSync(new URL('assets/trees/alpine.glb', root));
        const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
        expect(json.images || []).toHaveLength(0);
        expect(statSync(new URL('assets/trees/alpine.glb', root)).size).toBeLessThanOrEqual(300 * 1024);
    });
});

// A world's shrubs (assets/trees/shrubs.glb, tools/blender/tree_shrub.py): each species at three levels in its
// budget, the near level leaves on stems and the far one clump, every level in the same outline, standing on the
// world's seat of a bush (its origin 0.2 m under the ground: the stems reach under y = 0.2, nothing hangs over it)
describe('the world\'s shrub levels', () => {
    const game = load();
    const SHRUBS = ['rose'];
    const LEVELS = { near: 800, mid: 140, far: 24 };
    let shrubs;

    beforeAll(async () => {
        shrubs = await game.SceneAssets.loadModel('assets/trees/shrubs.glb');
    });

    const box = name => {
        const primitives = shrubs.meshes.get(name);
        expect({ name, found: !!primitives && primitives.length === 1 }).toEqual({ name, found: true });
        const g = primitives[0].geometry;
        g.computeBoundingBox();
        return { g, bb: g.boundingBox };
    };

    test('every shrub has its three levels, each in its budget, the near level the most detailed', () => {
        for (const species of SHRUBS) {
            const counts = Object.fromEntries(Object.keys(LEVELS).map(level => [level, triangles(box(`${species}_${level}`).g)]));
            for (const [level, most] of Object.entries(LEVELS)) expect({ species, level, over: counts[level] > most }).toEqual({ species, level, over: false });
            expect(counts.near).toBeGreaterThan(counts.mid * 3);
            expect(counts.mid).toBeGreaterThan(counts.far * 3);
        }
    });

    test('every level stands in the same outline, rooted in the ground', () => {
        const spread = bb => Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z);
        for (const species of SHRUBS) {
            const mid = box(`${species}_mid`).bb;
            for (const level of ['near', 'mid', 'far']) {
                const b = box(`${species}_${level}`).bb;
                expect({ species, level, height: Math.abs(b.max.y / mid.max.y - 1) < 0.25 }).toEqual({ species, level, height: true });
                expect({ species, level, spread: Math.abs(spread(b) / spread(mid) - 1) < 0.3 }).toEqual({ species, level, spread: true });
                expect({ species, level, rooted: b.min.y <= 0.2 }).toEqual({ species, level, rooted: true });
            }
        }
    });

    test('the near level has stems: vertices whose green does not lead, the wood the world draws in its palette', () => {
        for (const species of SHRUBS) {
            const colour = box(`${species}_near`).g.attributes.color;
            const scale = colour.array instanceof Uint16Array ? 65535 : colour.array instanceof Uint8Array ? 255 : 1;
            let wood = 0;
            for (let i = 0; i < colour.count; i++) if (colour.array[i * colour.itemSize + 1] / scale <= colour.array[i * colour.itemSize] / scale * 1.15) wood++;
            expect({ species, wood: wood > 20 }).toEqual({ species, wood: true });
        }
    });

    test('the file carries no texture and stays small', () => {
        const bytes = readFileSync(new URL('assets/trees/shrubs.glb', root));
        const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
        expect(json.images || []).toHaveLength(0);
        expect(statSync(new URL('assets/trees/shrubs.glb', root)).size).toBeLessThanOrEqual(240 * 1024);
    });
});
