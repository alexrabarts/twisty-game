// Each lower level of detail is the level above it simplified: the same outline, the same pivot and the same mean
// colour, so a fade from one to the other (js/world/scenery.js, Scenery.FADE_S) reads as one thing. The world's trees
// and its shrub (assets/trees/alpine.glb, shrubs.glb) at their three levels, as the world draws them (their palette and
// each level's shade: Scenery.LEVEL_SHADE); the crew's bikes (assets/bikes/far, made by tools/blender/far.py from the
// detail file's lod1) and the detail file's own lod1 against its lod0. The houses, the boulders and the tufts have one
// level each. The mean colour is over each face's area, its vertex colours times its material's colour, weighted by
// how much of the sky it faces (a face turned up is lit more). A level with a texture map (the detailed bikes' baked
// maps) has its outline and pivot held, not its colour, which the map carries
import { readFileSync, readdirSync } from 'node:fs';
import { Blob } from 'node:buffer';
import { TextDecoder } from 'node:util';
import { canvasStub, loadScript, realThree } from '../helpers/load-game.js';

const root = new URL('../../', import.meta.url);
const THREE = realThree();
const source = ['sceneassets.js', 'world/landshade.js', 'world/vegetation.js', 'world/scenery.js'].map(loadScript).join('\n;\n');
const fetch = async url => {
    const bytes = readFileSync(new URL(url, root));
    return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
};
const sink = { log() {}, warn() {}, error() {} };
const game = new Function('THREE', 'document', 'localStorage', 'console', 'fetch', 'createImageBitmap', 'Blob', 'TextDecoder', 'performance', `${source}\nreturn { SceneAssets, Vegetation, Scenery };`)(
    THREE, canvasStub(), { getItem: () => null, setItem() {} }, sink, fetch, async () => ({ width: 1, height: 1 }), Blob, TextDecoder, performance);

// A level's box, its mean colour (linear) and its area
function measure(parts) {
    const box = new THREE.Box3();
    const sum = [0, 0, 0];
    let lit = 0, textured = false;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
    for (const { geometry, color, map } of parts) {
        textured = textured || !!map;
        geometry.computeBoundingBox();
        box.union(geometry.boundingBox);
        const pos = geometry.attributes.position, colour = geometry.attributes.color, index = geometry.index;
        const scale = colour ? (colour.array instanceof Uint16Array ? 65535 : colour.array instanceof Uint8Array ? 255 : 1) : 1;
        const triangles = (index ? index.count : pos.count) / 3;
        for (let t = 0; t < triangles; t++) {
            const corners = [0, 1, 2].map(k => (index ? index.getX(t * 3 + k) : t * 3 + k));
            a.fromBufferAttribute(pos, corners[0]);
            b.fromBufferAttribute(pos, corners[1]);
            c.fromBufferAttribute(pos, corners[2]);
            n.subVectors(b, a).cross(c.sub(a));
            const area = n.length() / 2;
            if (!area) continue;
            const weight = area * (0.6 + 0.4 * Math.abs(n.y) / (2 * area));
            for (let k = 0; k < 3; k++) {
                let v = 0;
                for (const i of corners) v += colour ? colour.array[i * colour.itemSize + k] / scale : 1;
                sum[k] += (v / 3) * color[k] * weight;
            }
            lit += weight;
        }
    }
    return { box, colour: sum.map(v => v / lit), textured };
}

// How far a lower level stands from the level above: its height and spread as shares of the upper's, the drop of its
// base and the shift of its middle in plan as shares of the upper's height and spread, its mean colour's luminance as a
// share, and the most any channel's share of the colour moves (the tint)
function drift(lower, upper) {
    const height = m => m.box.max.y - m.box.min.y;
    const spread = m => Math.max(m.box.max.x - m.box.min.x, m.box.max.z - m.box.min.z);
    const middle = m => [(m.box.max.x + m.box.min.x) / 2, (m.box.max.z + m.box.min.z) / 2];
    const lum = m => 0.2126 * m.colour[0] + 0.7152 * m.colour[1] + 0.0722 * m.colour[2];
    const share = m => m.colour.map(v => v / (m.colour[0] + m.colour[1] + m.colour[2]));
    const round = v => Math.round(v * 1000) / 1000;
    const [p, q] = [middle(lower), middle(upper)];
    return {
        height: round(height(lower) / height(upper)),
        spread: round(spread(lower) / spread(upper)),
        base: round(Math.abs(lower.box.min.y - upper.box.min.y) / height(upper)),
        middle: round(Math.hypot(p[0] - q[0], p[1] - q[1]) / spread(upper)),
        lum: lower.textured || upper.textured ? null : round(lum(lower) / lum(upper)),
        tint: lower.textured || upper.textured ? null : round(Math.max(...share(lower).map((v, k) => Math.abs(v - share(upper)[k]))))
    };
}

// What each pair may drift by. A tree's levels are drawn shapes of their own (a spray of branches near, skirts of
// boughs in the middle, a few notched faces far), so they keep the outline and the tone, not every bough. A far bike is
// its source cut down, so it keeps both closely
const TOLERANCE = {
    tree: { height: 0.1, spread: 0.2, base: 0.02, middle: 0.07, lum: 0.2, tint: 0.03 },
    bike: { height: 0.06, spread: 0.06, base: 0.01, middle: 0.01, lum: 0.15, tint: 0.06 }
};
// Lower levels whose mean colour stands further than TOLERANCE.bike.lum from their source today, and how far. Each may
// only leave this list (the test fails when one comes back inside the tolerance, so it is taken off). Empty since far.py
// scales each kept material's occlusion to the light of the source faces merged into it (its rule 5), and kit B's lod1
// keeps the lightness of its finishes
const KNOWN = {};

function check(kind, name, lower, upper) {
    const d = drift(lower, upper), most = TOLERANCE[kind];
    const over = Object.keys(most).filter(key => d[key] !== null).filter(key => key === 'height' || key === 'spread' || key === 'lum' ? Math.abs(d[key] - 1) > most[key] : d[key] > most[key]);
    const known = KNOWN[name];
    if (known !== undefined) {
        // (still as far as it was, and no further; and no other measure over)
        expect({ name, lum: d.lum, still: Math.abs(d.lum - 1) > most.lum, within: Math.abs(d.lum - known) <= 0.03 }).toEqual({ name, lum: d.lum, still: true, within: true });
        expect({ name, over: over.filter(key => key !== 'lum'), drift: d }).toEqual({ name, over: [], drift: d });
        return;
    }
    expect({ name, over, drift: d }).toEqual({ name, over: [], drift: d });
}

describe('each lower level of detail is the level above it, simplified', () => {
    const SHRUBS = [{ node: 'rose', kind: 'bush', palette: 'rose' }];
    const TREES = [
        { node: 'spruce', kind: 'conifer' }, { node: 'larch', kind: 'conifer', palette: 'larch' }, { node: 'pine', kind: 'conifer' },
        { node: 'fir', kind: 'conifer' }, { node: 'beech', kind: 'broadleaf' }, { node: 'ash', kind: 'broadleaf' }
    ];
    const SHADE = game.Scenery.LEVEL_SHADE;
    let alpine, shrubs;

    beforeAll(async () => {
        alpine = await game.SceneAssets.loadModel('assets/trees/alpine.glb');
        shrubs = await game.SceneAssets.loadModel('assets/trees/shrubs.glb');
    });

    const level = (file, { node, kind, palette }, name) => measure(game.Vegetation.shape(file.meshes.get(`${node}_${name}`), kind, palette || kind, (SHADE[kind] || {})[name] || 1).map(part => ({ geometry: part.geometry, color: [1, 1, 1] })));

    test('every tree species and shrub: mid of near, far of mid', () => {
        for (const [file, list] of [[alpine, TREES], [shrubs, SHRUBS]]) {
            for (const species of list) {
                const near = level(file, species, 'near'), mid = level(file, species, 'mid'), far = level(file, species, 'far');
                check('tree', `${species.node} mid/near`, mid, near);
                check('tree', `${species.node} far/mid`, far, mid);
            }
        }
    });

    test('every crew bike: its far file of the detail file\'s lod1, and lod1 of lod0', async () => {
        const parts = (model, group) => {
            const from = model.groups.get(group);
            const list = [];
            for (const [name, primitives] of from.meshes) {
                const at = from.places.get(name);
                for (const p of primitives) {
                    const geometry = p.geometry.clone();
                    if (at) geometry.translate(at.x, at.y, at.z);
                    list.push({ geometry, color: [p.material.color.r, p.material.color.g, p.material.color.b], map: p.material.map });
                }
            }
            return list;
        };
        const whole = model => {
            const list = [];
            for (const [name, primitives] of model.meshes) {
                const at = model.places.get(name);
                for (const p of primitives) {
                    const geometry = p.geometry.clone();
                    if (at) geometry.translate(at.x, at.y, at.z);
                    list.push({ geometry, color: [p.material.color.r, p.material.color.g, p.material.color.b], map: p.material.map });
                }
            }
            return list;
        };
        const files = readdirSync(new URL('assets/bikes/far/', root)).filter(f => f.endsWith('.glb'));
        expect(files.length).toBeGreaterThan(10);
        for (const file of files) {
            const id = file.replace(/\.glb$/, '');
            const detail = await game.SceneAssets.loadModel(`assets/bikes/detail/${file}`);
            const far = await game.SceneAssets.loadModel(`assets/bikes/far/${file}`);
            expect({ id, levels: detail.groups.has('lod0') && detail.groups.has('lod1') }).toEqual({ id, levels: true });
            const lod0 = measure(parts(detail, 'lod0')), lod1 = measure(parts(detail, 'lod1'));
            check('bike', `${id} far/lod1`, measure(far.groups.has('lod0') ? parts(far, 'lod0') : whole(far)), lod1);
            check('bike', `${id} lod1/lod0`, lod1, lod0);
        }
    });
});
