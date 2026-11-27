/**
 * @jest-environment node
 */
// The roadworks' digger model (tools/blender/roadworks_digger.py, assets/roadworks/digger.glb): three levels, each
// inside the procedural digger's box that the physics and the layout read, within its triangle budget and the file's
// bytes, its glass one sided and facing out of the cab (so the transparent panes need no order: Roadworks.smokedGlass),
// and no name in the file but the parts' own. The game swaps it in for the procedural digger (Roadworks.dressDigger).
import { describe, test, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { modelStats, trianglesOf } from '../../tools/model-stats.mjs';
import { loadGame } from '../helpers/load-game.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const FILE = 'assets/roadworks/digger.glb';
const bytes = readFileSync(root + FILE);
const doc = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + bytes.readUInt32LE(12))));
const BUDGET = { lod0: 9000, lod1: 2600, lod2: 700 };
const MAX_BYTES = 400000;
const FINISHES = ['chrome', 'frame', 'glass', 'paint_body', 'rubber', 'steel'];

describe('the digger model', () => {
    const { Roadworks } = loadGame(undefined, []);
    const box = Roadworks.geometries().digger.boundingBox;
    const levels = trianglesOf(bytes);

    test('the game reads the file the script writes', () => {
        expect(Roadworks.DIGGER_FILE).toBe(FILE);
        expect(Roadworks.DIGGER_LOD_M[0]).toBeLessThan(Roadworks.DIGGER_LOD_M[1]);
    });

    test('three levels, one mesh node each, within their triangle budgets and the file within its bytes', () => {
        const stats = modelStats(bytes);
        expect(Object.keys(stats.levels).sort()).toEqual(['lod0', 'lod1', 'lod2']);
        for (const [name, level] of Object.entries(stats.levels)) {
            expect(level.nodes).toBe(1);
            expect(level.triangles).toBeLessThanOrEqual(BUDGET[name]);
        }
        expect(stats.levels.lod1.triangles).toBeLessThan(stats.levels.lod0.triangles / 3);
        expect(stats.levels.lod2.triangles).toBeLessThan(stats.levels.lod1.triangles);
        expect(stats.bytes).toBeLessThanOrEqual(MAX_BYTES);
        // (each finish of each level drawn is a mesh in the stage's cap: LEG_BUDGET.meshes, tools/terrain-check.mjs)
        expect([stats.levels.lod0.drawCalls, stats.levels.lod1.drawCalls, stats.levels.lod2.drawCalls]).toEqual([6, 5, 4]);
    });

    test('every level stands inside the procedural digger\'s box, which the physics reads', () => {
        for (const [name, tris] of Object.entries(levels)) {
            const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
            for (const t of tris) for (let k = 0; k < 9; k++) { lo[k % 3] = Math.min(lo[k % 3], t.p[k]); hi[k % 3] = Math.max(hi[k % 3], t.p[k]); }
            const tol = 0.002;
            expect([name, lo[0] >= box.min.x - tol, lo[1] >= box.min.y - tol, lo[2] >= box.min.z - tol]).toEqual([name, true, true, true]);
            expect([name, hi[0] <= box.max.x + tol, hi[1] <= box.max.y + tol, hi[2] <= box.max.z + tol]).toEqual([name, true, true, true]);
            // ...and fills it: no level is a shrunken stand-in
            expect(hi[1] - lo[1]).toBeGreaterThan(0.95 * (box.max.y - box.min.y));
            expect(hi[0] - lo[0]).toBeGreaterThan(0.95 * (box.max.x - box.min.x));
        }
    });

    test('the glass is one sided, see-through in the file, and every pane faces out of the cab', () => {
        const glass = doc.materials.find(m => m.name === 'glass');
        expect(glass).toBeDefined();
        expect(glass.doubleSided).not.toBe(true);
        expect(glass.alphaMode).toBe('BLEND');
        for (const [name, tris] of Object.entries(levels)) {
            const panes = tris.filter(t => t.name === 'glass');
            expect([name, panes.length > 0]).toEqual([name, true]);
            const centre = [0, 0, 0];
            for (const t of panes) for (let k = 0; k < 9; k++) centre[k % 3] += t.p[k] / (panes.length * 3);
            for (const t of panes) {
                const p = t.p, e1 = [p[3] - p[0], p[4] - p[1], p[5] - p[2]], e2 = [p[6] - p[0], p[7] - p[1], p[8] - p[2]];
                const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
                const out = [0, 1, 2].map(k => (p[k] + p[k + 3] + p[k + 6]) / 3 - centre[k]);
                expect([name, n[0] * out[0] + n[1] * out[1] + n[2] * out[2] > 0]).toEqual([name, true]);
            }
        }
    });

    test('no name in the file but the levels, the parts and their finishes (no maker\'s name or mark)', () => {
        expect(doc.materials.map(m => m.name).sort()).toEqual(FINISHES);
        for (const node of doc.nodes) expect(node.name).toMatch(/^(lod[0-2]|digger_lod[0-2])$/);
        for (const mesh of doc.meshes) expect(mesh.name).toMatch(/^digger_lod[0-2]$/);
    });

    test('the smoked glass: see-through, more so square on than at a grazing view, one sided, writing no depth', () => {
        const glass = Roadworks.smokedGlass();
        const [face, edge] = Roadworks.GLASS_OPACITY;
        expect(glass.transparent).toBe(true);
        expect(face).toBeGreaterThan(0.3);
        expect(face).toBeLessThan(edge);
        expect(edge).toBeLessThan(1);
        expect(glass.depthWrite).toBe(false);
        expect(glass.side).toBe(0);
        expect(glass.roughness).toBeLessThan(0.2);
    });
});
