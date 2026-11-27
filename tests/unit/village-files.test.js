// The Blender-made houses a world draws (assets/village/houses.glb, built by tools/blender/village_*.py, placed by
// js/world/scenery.js) and the stone bridge (assets/bridge/stone.glb, a landmark of tools/world/landmarks.json): the
// files read through the game's own reader (js/sceneassets.js) and hold what the game reads. Fetch reads the files
// from disk.
import { readFileSync } from 'node:fs';
import { Blob } from 'node:buffer';
import { TextDecoder } from 'node:util';
import { canvasStub, loadScript, realThree } from '../helpers/load-game.js';

const root = new URL('../../', import.meta.url);
const BUDGET = { house: 9000 };
const TAGS = ['body', 'wall', 'shutter', 'glass', 'lamp'];

function load() {
    const THREE = realThree();
    const fetch = async url => {
        const bytes = readFileSync(new URL(url, root));
        return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
    };
    const factory = new Function('THREE', 'document', 'fetch', 'Blob', 'TextDecoder', `${loadScript('sceneassets.js')}\nreturn { SceneAssets };`);
    return { THREE, ...factory(THREE, canvasStub(), fetch, Blob, TextDecoder) };
}

const triangles = geometry => (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;

describe('the houses file', () => {
    const game = load();
    let houses;

    beforeAll(async () => {
        houses = await game.SceneAssets.loadModel('assets/village/houses.glb');
    });

    test('there are at least four houses, each within its triangle budget, with the ends of its front marked', () => {
        const names = [...houses.meshes.keys()].filter(name => name.startsWith('house_'));
        expect(names.length).toBeGreaterThanOrEqual(4);
        names.forEach(name => {
            const parts = houses.meshes.get(name);
            expect(parts.reduce((sum, part) => sum + triangles(part.geometry), 0)).toBeLessThanOrEqual(BUDGET.house);
            const left = houses.places.get(`${name}:left`);
            const right = houses.places.get(`${name}:right`);
            // A house is centred on its plot, and narrower than the 20 m from one plot to the next
            expect(left.x).toBeCloseTo(-right.x, 3);
            expect(right.x * 2).toBeGreaterThan(8);
            expect(right.x * 2).toBeLessThan(18);
            expect([left.y, left.z, right.y, right.z]).toEqual([0, 0, 0, 0]);
        });
    });

    test('a house is walls to tint, shutters to tint, numbered window glass and a lit lantern, in colours and no texture', () => {
        [...houses.meshes.entries()].forEach(([name, parts]) => {
            const kinds = parts.map(part => part.material.name);
            kinds.forEach(kind => expect(TAGS).toContain(kind));
            ['body', 'wall', 'shutter', 'glass'].forEach(kind => expect(kinds).toContain(kind));
            parts.forEach(({ geometry, material }) => {
                expect(material.map).toBeNull();
                expect(geometry.attributes.color.count).toBe(geometry.attributes.position.count);
                expect(geometry.attributes.uv).toBeUndefined();
            });
            // Windows are numbered from 0 with no gap, so each can be lit or dark on its own (the file's own
            // bytes, which the load keeps on userData.srgb beside the linear daylight colours)
            const glass = parts.find(part => part.material.name === 'glass').geometry.userData.srgb;
            const numbers = new Set();
            for (let i = 0; i < glass.count; i++) numbers.add(glass.array[i * glass.itemSize]);
            expect(numbers.size).toBeGreaterThanOrEqual(8);
            expect(Math.max(...numbers)).toBe(numbers.size - 1);
            // The front is the plane z = 0: nothing at walking height stands more than a step in front of it
            parts.forEach(({ geometry }) => {
                const { position } = geometry.attributes;
                let low = Infinity;
                let any = Infinity;
                for (let i = 0; i < position.count; i++) {
                    if (position.getY(i) < 2.2) low = Math.min(low, position.getZ(i));
                    any = Math.min(any, position.getZ(i));
                }
                expect(low).toBeGreaterThan(-0.9);
                expect(any).toBeGreaterThan(-1.6);
            });
            expect(name).toMatch(/^house_[a-z]+$/);
        });
    });
});

// The bridge file carries no normals (the village kit's way): drawn as loaded, every face would be lit black. The
// reader works them out (SceneAssets, kitSurface): its outer faces face away from the road, the parapets' inner faces
// toward it and the coping up, and its colours are decoded as the houses' are.
describe('the stone bridge file', () => {
    const game = load();

    test('the bridge\'s stone faces out, so the sun and the sky light it', async () => {
        const model = await game.SceneAssets.loadModel('assets/bridge/stone.glb');
        const parts = model.meshes.get('bridge_span');
        expect(parts.length).toBeGreaterThan(0);
        const raw = parts[0].geometry.userData.srgb;
        const decode = v => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
        const counts = { outer: 0, inner: 0, top: 0 };
        for (const { geometry } of parts) {
            const { position, normal } = geometry.attributes;
            expect(normal).toBeDefined();
            expect(normal.count).toBe(position.count);
            for (let i = 0; i < position.count; i++) {
                const x = position.getX(i), y = position.getY(i);
                const nx = normal.getX(i), ny = normal.getY(i), nz = normal.getZ(i);
                expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 3);
                // Model frame (tools/blender/bridge_stone.py): outer face 11.6, inner 10.9, coping over 1.17
                if (Math.abs(x) > 11.65 && Math.abs(nx) > 0.9) { expect(Math.sign(nx)).toBe(Math.sign(x)); counts.outer++; }
                if (Math.abs(x) < 10.95 && Math.abs(x) > 10.7 && y > 0.1 && y < 0.95 && Math.abs(nx) > 0.9) { expect(Math.sign(nx)).toBe(-Math.sign(x)); counts.inner++; }
                if (y > 1.17 && Math.abs(ny) > 0.9) { expect(ny).toBeGreaterThan(0); counts.top++; }
            }
        }
        // The first vertex's colour, decoded from the file's sRGB byte
        expect(parts[0].geometry.attributes.color.getX(0)).toBeCloseTo(decode(raw.array[0] / 255), 3);
        expect(counts.outer).toBeGreaterThan(100);
        expect(counts.inner).toBeGreaterThan(100);
        expect(counts.top).toBeGreaterThan(100);
    });
});
