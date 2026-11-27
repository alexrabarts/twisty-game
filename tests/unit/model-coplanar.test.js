/**
 * @jest-environment node
 */
// No model has two materials fighting in its depth: faces of two materials that lie in one plane, or so near it that
// the depth buffer cannot part them at the distance the game draws the model, over each other and seen from outside
// it (tools/model-stats.mjs `coplanar`). The fix is a stand-off the rule names (`need`), a part cut into its face, or
// one of the two faces left out. Every assets/**/*.glb at each level, and the roadworks' procedural props.
import { describe, test, expect } from '@jest/globals';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { trianglesOf, trianglesOfLists, coplanar } from '../../tools/model-stats.mjs';
import { loadGame } from '../helpers/load-game.js';

const root = fileURLToPath(new URL('../../', import.meta.url));

// How far the game draws each file (metres; the first pattern that matches): a detailed bike's lod0 within
// BikeModels' 30 m and its lod1 beyond, the crew's far files, the roadworks within Roadworks.REACH_M, the scenery out
// to the far land. `node`: the file holds variants or alternative parts at one origin (never drawn together), so each
// mesh node is judged alone
const DRAW = [
    [/^bikes\/detail\/.*:lod0$/, 30],
    [/^bikes\/detail\/.*:lod1$/, 150],
    [/^bikes\/rider\.glb/, 60, 'node'],
    [/^bikes\/rider_far\.glb/, 300, 'node'],
    [/^bikes\//, 300],
    [/^cars\//, 300],
    [/^hill\//, 100],
    [/^roadworks[:/]/, 230],
    [/^(trees|village|gorge|bridge|animals)\//, 1000, 'node']
];
const drawOf = (key) => DRAW.find(([re]) => re.test(key)) || [null, 1000];
// The models that stand on the ground at y = 0 and are never seen from under it (a bike leans and the bridge spans a
// gully, so they are judged from every side)
const GROUND = /^(roadworks[:/]|cars\/|trees\/|village\/|gorge\/|animals\/)/;
const fights = (key, tris) => coplanar(tris, drawOf(key)[1], { ground: GROUND.test(key) ? 0 : null });

// Measured 2026-11-27, when the check was added: the places that fight today. The table may only shrink; the models
// are their owners' to fix (the bikes, the rider, the portal, the hill ride's cart)
const KNOWN = {
    'bikes/adventure.glb:all': 3,
    'bikes/detail/bike01_z650.glb:lod0': 4,
    'bikes/detail/bike01_z650.glb:lod1': 2,
    'bikes/detail/bike02_speed_triple.glb:lod0': 4,
    'bikes/detail/bike02_speed_triple.glb:lod1': 1,
    'bikes/detail/bike03_duke390.glb:lod0': 5,
    'bikes/detail/bike03_duke390.glb:lod1': 4,
    'bikes/detail/bike04_scrambler.glb:lod0': 4,
    'bikes/detail/bike05_g310gs.glb:lod0': 1,
    'bikes/detail/bike06_z750.glb:lod0': 3,
    'bikes/detail/bike07_mt09_black.glb:lod0': 6,
    'bikes/detail/bike07_mt09_black.glb:lod1': 3,
    'bikes/detail/bike07_mt09.glb:lod0': 5,
    'bikes/detail/bike07_mt09.glb:lod1': 2,
    'bikes/detail/bike08_xsr900.glb:lod0': 6,
    'bikes/detail/bike08_xsr900.glb:lod1': 3,
    'bikes/detail/bike09_duke890.glb:lod0': 7,
    'bikes/detail/bike09_duke890.glb:lod1': 3,
    'bikes/detail/bike10_tiger900.glb:lod0': 3,
    'bikes/detail/bike10_tiger900.glb:lod1': 1,
    'bikes/detail/bike11_duke990.glb:lod0': 1,
    'bikes/detail/bike13_panigale_black.glb:lod0': 2,
    'bikes/detail/bike13_panigale_black.glb:lod1': 1,
    'bikes/detail/bike13_panigale.glb:lod0': 2,
    'bikes/detail/bike13_panigale.glb:lod1': 1,
    'bikes/detail/bike14_forza.glb:lod0': 1,
    'bikes/detail/bike14_forza.glb:lod1': 2,
    'bikes/detail/bike15_crf250.glb:lod0': 1,
    'bikes/detail/bike16_superadv.glb:lod0': 1,
    'bikes/dirt.glb:all': 1,
    'bikes/naked.glb:all': 2,
    'bikes/sport.glb:all': 1,
    'cars/hatchback.glb:all': 1,
    'gorge/portal.glb:portal_arch': 19,
    'gorge/portal.glb:portal_wing': 1,
    'hill/bicycle.glb:lod0': 4,
    'hill/bicycle.glb:lod1': 2,
    'hill/horse.glb:lod0': 1,
    'hill/horse.glb:lod1': 1
};

const files = [];
const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (name.endsWith('.glb')) files.push(relative(join(root, 'assets'), path));
    }
};
walk(join(root, 'assets'));

const list = (found) => found.map(f => `  ${f.a} over ${f.b}: ${f.area} m2 at ${f.at.join(', ')} (normal ${f.normal.join(', ')}), ${f.gap} m apart, needs ${f.need} m`).join('\n');

function judge(key, found) {
    const allowed = KNOWN[key] || 0;
    if (found.length !== allowed) {
        throw new Error(`${key}: ${found.length} places where two materials fight in the depth buffer (the table holds ${allowed}; it may only shrink, so bring it down to what is left)\n${list(found)}`);
    }
    expect(found.length).toBe(allowed);
}

describe('model files', () => {
    for (const file of files) {
        test(`${file}: no two materials fight in the depth buffer at any level`, () => {
            const split = drawOf(`${file}:`)[2] || 'file';
            const levels = trianglesOf(readFileSync(join(root, 'assets', file)), { split });
            for (const [level, tris] of Object.entries(levels)) {
                const key = `${file}:${level}`;
                judge(key, fights(key, tris));
            }
        }, 120000);
    }
});

describe('the roadworks props', () => {
    const { Roadworks } = loadGame(undefined, []);
    const geo = Roadworks.geometries();
    // A kind's triangles: the colour in its vertices, or a printed face's place in the atlas. A printed face and the
    // lamps are drawn with the kind they belong to, in the same place
    const trisOf = (g) => {
        const pos = g.attributes.position.array;
        if (g.attributes.color) return trianglesOfLists(pos, g.attributes.color.array);
        const uv = g.attributes.uv.array, colors = [];
        for (let t = 0; t < pos.length / 9; t++) {
            const u = (uv[t * 6] + uv[t * 6 + 2] + uv[t * 6 + 4]) / 3, v = (uv[t * 6 + 1] + uv[t * 6 + 3] + uv[t * 6 + 5]) / 3;
            for (let k = 0; k < 3; k++) colors.push(2 + Math.round(u * 8) / 8, 2 + Math.round(v * 8) / 8, 2);
        }
        return trianglesOfLists(pos, colors);
    };
    // The lamps stand in the light's housing (Roadworks.writeLamps)
    const lamps = () => Roadworks.LAMP_Y.flatMap((y) => trisOf(geo.lamp).map(t => ({ ...t, p: t.p.map((v, i) => v + (i % 3 === 1 ? y : i % 3 === 2 ? -0.115 : 0)) })));
    const WITH = { sign: () => trisOf(geo.signFace), beacon: () => trisOf(geo.beaconBoard), light: lamps };
    const drawn = new Set(['signFace', 'beaconBoard', 'lamp']);
    for (const kind of Object.keys(geo).filter(k => !drawn.has(k)).sort()) {
        test(`${kind}: no two colours fight in the depth buffer`, () => {
            const tris = [...trisOf(geo[kind]), ...(WITH[kind] ? WITH[kind]() : [])];
            const key = `roadworks:${kind}`;
            judge(key, fights(key, tris));
        });
    }
});

describe('the rule', () => {
    test('two faces in one plane fight, a face stood off by the gap the rule names does not', () => {
        const quad = (z, color) => {
            const p = [-0.5, 0, z, 0.5, 0, z, 0.5, 1, z, -0.5, 0, z, 0.5, 1, z, -0.5, 1, z];
            return { positions: p, colors: Array(18).fill(0).map((_, i) => color[i % 3]) };
        };
        const join2 = (a, b) => trianglesOfLists([...a.positions, ...b.positions], [...a.colors, ...b.colors]);
        const flush = coplanar(join2(quad(0, [1, 1, 0]), quad(0, [0, 0, 0])), 230);
        expect(flush.length).toBe(1);
        const need = flush[0].need;
        expect(need).toBeGreaterThan(0);
        expect(coplanar(join2(quad(0, [1, 1, 0]), quad(-need * 1.5, [0, 0, 0])), 230)).toEqual([]);
        // One colour over itself is no fight
        expect(coplanar(join2(quad(0, [1, 1, 0]), quad(0, [1, 1, 0])), 230)).toEqual([]);
    });

    test('a face hidden inside the model does not count', () => {
        // A box, and a black square on its inside face of the floor: no ray from it gets out
        const box = { positions: [], colors: [] };
        const F = (a, b, c, d, color) => {
            for (const p of [a, b, c, a, c, d]) box.positions.push(...p);
            for (let i = 0; i < 6; i++) box.colors.push(...color);
        };
        const Y = [1, 1, 0];
        F([0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1], Y);
        F([0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0], Y);
        F([0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0], Y);
        F([0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1], Y);
        F([0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0], Y);
        F([1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1], Y);
        F([0.4, 0, 0.4], [0.6, 0, 0.4], [0.6, 0, 0.6], [0.4, 0, 0.6], [0, 0, 0]);
        // Seen from below (double sided) it does fight; with the floor's underside covered by a slab it does not
        expect(coplanar(trianglesOfLists(box.positions, box.colors), 230).length).toBe(1);
        F([-1, -0.2, -1], [2, -0.2, -1], [2, -0.2, 2], [-1, -0.2, 2], [0.5, 0.5, 0.5]);
        F([-1, -0.2, -1], [-1, -0.2, 2], [-1, 0.0, 2], [-1, 0.0, -1], [0.5, 0.5, 0.5]);
        F([2, -0.2, -1], [2, -0.2, 2], [2, 0.0, 2], [2, 0.0, -1], [0.5, 0.5, 0.5]);
        F([-1, -0.2, -1], [2, -0.2, -1], [2, 0.0, -1], [-1, 0.0, -1], [0.5, 0.5, 0.5]);
        F([-1, -0.2, 2], [2, -0.2, 2], [2, 0.0, 2], [-1, 0.0, 2], [0.5, 0.5, 0.5]);
        expect(coplanar(trianglesOfLists(box.positions, box.colors), 230)).toEqual([]);
    });
});
