// The colours of a world's trees and bushes (js/world/vegetation.js): every colour the code can give a tree, a bush,
// the land's forest or a far crown clump stays inside its class's caps, taken from the photo match. The world draws
// the modelled shapes in its own copy, lit as the land; the legs keep the files' own colours.
// The drawn result is held by the browser probe world-trees (tools/terrain-check.mjs).
import { readFileSync } from 'node:fs';
import { Blob } from 'node:buffer';
import { TextDecoder } from 'node:util';
import { canvasStub, loadScript, realThree } from '../helpers/load-game.js';

const root = new URL('../../', import.meta.url);
const KINDS = ['conifer', 'broadleaf', 'bush'];

function load() {
    const THREE = realThree();
    const files = ['terrain.js', 'world/route.js', 'world/legroute.js', 'vehicle.js', 'environment.js', 'tours.js', 'sceneassets.js', 'world/data.js', 'world/landshade.js', 'world/terrainmesh.js', 'world/vegetation.js', 'world/edgestyles.js', 'world/scenery.js'];
    const source = files.map(loadScript).join('\n;\n');
    const fetch = async url => {
        const bytes = readFileSync(new URL(url, root));
        return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
    };
    const createImageBitmap = async blob => ({ width: 1, height: 1, bytes: blob.size });
    const sink = { log() {}, warn() {}, error() {} };
    const factory = new Function(
        'THREE', 'document', 'localStorage', 'console', 'fetch', 'createImageBitmap', 'Blob', 'TextDecoder', 'performance',
        `${source}\nreturn { SceneAssets, WorldData, LandShade, TerrainMesh, Vegetation, Scenery };`
    );
    return { THREE, ...factory(THREE, canvasStub(), { getItem: () => null, setItem() {} }, sink, fetch, createImageBitmap, Blob, TextDecoder, performance) };
}

const game = load();
const { THREE, SceneAssets, WorldData, LandShade, TerrainMesh, Vegetation, Scenery } = game;
const srgb = linear => linear.map(Vegetation.toSrgb);
const describeColour = rgb => rgb.map(c => c.toFixed(3)).join(', ');

// Each vertex colour of a geometry, sRGB 0 to 1
function vertexColours(geometry) {
    const a = geometry.attributes.color;
    const scale = a.array instanceof Uint16Array ? 65535 : a.array instanceof Uint8Array ? 255 : 1;
    const out = [];
    for (let i = 0; i < a.count; i++) out.push(srgb([0, 1, 2].map(c => a.array[i * a.itemSize + c] / scale)));
    return out;
}

const outside = (kind, colours) => colours.filter(rgb => !Vegetation.inCaps(kind, rgb)).map(describeColour);

describe('the vegetation palette', () => {
    test('each kind\'s foliage and wood, at every shading it may take, is inside its caps', () => {
        const [lo, hi] = Vegetation.SHADE;
        for (const kind of KINDS) {
            for (const part of ['foliage', 'wood']) {
                const colours = [lo, 0.8, 1, 1.2, hi, 0, 5].map(shade => Vegetation.colour(kind, part, shade));
                expect(outside(kind, colours)).toEqual([]);
            }
            // The palette's own colours need no cap
            expect(outside(kind, Object.values(Vegetation.PALETTE[kind]))).toEqual([]);
        }
    });

    test('the caps hold a conifer darker and greyer than a broadleaf, as in the photos', () => {
        const { conifer, broadleaf } = Vegetation.CAPS;
        expect(conifer.vMax).toBeLessThan(broadleaf.vMax);
        expect(conifer.s).toBeLessThanOrEqual(broadleaf.s);
        for (const kind of KINDS) expect(Vegetation.CAPS[kind].s).toBeLessThanOrEqual(0.45);
    });

    test('capping takes any colour inside the caps and keeps its hue', () => {
        const bright = [[0.31, 0.47, 0.17], [0.1, 0.9, 0.2], [1, 1, 1], [0, 0, 0], [0.05, 0.27, 0.16]];
        for (const kind of KINDS) {
            for (const rgb of bright) {
                const out = Vegetation.capped(kind, rgb);
                expect(Vegetation.inCaps(kind, out)).toBe(true);
                // The leading channel stays the leading channel
                if (Math.max(...rgb) > Math.min(...rgb)) expect(out.indexOf(Math.max(...out))).toBe(rgb.indexOf(Math.max(...rgb)));
            }
        }
    });

    test('the land\'s forest colours and the far crown clumps are inside the forest caps', () => {
        const p = LandShade.PALETTE;
        expect(outside('forest', [p.forest, p.openForest])).toEqual([]);
        // A tile of forest cover everywhere: every clump TerrainMesh.clumps plants, at its own tone, as build() colours it
        const n = WorldData.TILE_N, cn = WorldData.COVER_N;
        const tile = { tx: 3, tz: -2, key: '3,-2', zones: new Uint8Array(n * n).fill(WorldData.ZONE.terrain), heights: new Float32Array(n * n).fill(1500) };
        const clumps = TerrainMesh.clumps(tile, new Uint8Array(cn * cn).fill(1), 1);
        expect(clumps.length).toBeGreaterThan(50);
        const crown = p.forest.map(TerrainMesh.toLinear);
        const colours = clumps.flatMap(c => [1, 1.12].map(top => srgb(crown.map(v => v * c.c * top))));
        expect(outside('forest', colours)).toEqual([]);
    });
});

describe('the world\'s modelled trees', () => {
    let models, fileColours;
    const files = { conifer: 'assets/trees/conifer.glb', broadleaf: 'assets/trees/broadleaf.glb', bush: 'assets/trees/bush.glb', alpine: 'assets/trees/alpine.glb', shrubs: 'assets/trees/shrubs.glb' };
    // A world's species are drawn from the levels of assets/trees/alpine.glb, its shrubs from those of shrubs.glb
    const levels = shape => (shape.lods ? Object.values(shape.lods).flat() : shape.parts);
    beforeAll(async () => {
        // The parsed files, as the legs' TreeModels reads them (SceneAssets keeps one parse per file)
        fileColours = new Map();
        for (const url of Object.values(files)) {
            const model = await SceneAssets.loadModel(url);
            for (const [name, parts] of model.meshes) fileColours.set(name, parts.map(part => Array.from(part.geometry.attributes.color.array)));
        }
        models = await Scenery.loadModels(SceneAssets.loadModel);
    });

    test('every shape loads, and every vertex colour of it is inside its kind\'s caps', () => {
        expect(models).toBeTruthy();
        expect(new Set(models.trees.map(s => s.kind))).toEqual(new Set(KINDS));
        expect(models.trees).toHaveLength(7);
        for (const shape of models.trees) {
            for (const part of levels(shape)) {
                expect(part.geometry.userData.vegetation).toBe(shape.kind);
                expect({ shape: shape.name, outside: outside(shape.kind, vertexColours(part.geometry)) }).toEqual({ shape: shape.name, outside: [] });
            }
        }
        // Every species and every shrub of the world at all three levels
        for (const shape of models.trees) expect(Object.keys(shape.lods).sort()).toEqual(['far', 'mid', 'near']);
    });

    test('the larch takes its own palette: a lighter, yellower green than the spruce', () => {
        const mean = name => {
            const all = models.trees.find(s => s.name === name).lods.mid.flatMap(part => vertexColours(part.geometry));
            return [0, 1, 2].map(c => all.reduce((sum, rgb) => sum + rgb[c], 0) / all.length);
        };
        const larch = mean('conifer_larch'), spruce = mean('conifer_spruce');
        expect(larch[1]).toBeGreaterThan(spruce[1]);
        expect(larch[0] / larch[2]).toBeGreaterThan(spruce[0] / spruce[2]);
    });

    test('the files\' own colours were outside the caps (what the world drew before)', () => {
        let over = 0, all = 0;
        for (const shape of models.trees) {
            const parts = fileColours.get(shape.node ? `${shape.node}_mid` : shape.name);
            for (const colours of parts) {
                for (let i = 0; i < colours.length; i += 3) {
                    all++;
                    if (!Vegetation.inCaps(shape.kind, srgb([colours[i], colours[i + 1], colours[i + 2]].map(v => v / 65535)))) over++;
                }
            }
        }
        expect(over / all).toBeGreaterThan(0.5);
    });

    test('a shape keeps its own shading: lighter and darker vertices stay in order', () => {
        const shape = models.trees.find(s => s.name === 'conifer_spruce');
        const drawn = vertexColours(shape.parts[0].geometry).map(([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b);
        expect(new Set(drawn.map(v => v.toFixed(3))).size).toBeGreaterThan(10);
    });

    test('each kind is drawn with one Lambert material lit as the land, which takes no sky reflection', () => {
        for (const shape of models.trees) {
            for (const part of levels(shape)) {
                expect(part.material).toBe(Vegetation.material(shape.kind));
                expect(part.material.isMeshLambertMaterial).toBe(true);
                expect(part.material.userData.landShade).toBe(true);
                expect(part.material.vertexColors).toBe(true);
                expect(part.material.envMap).toBeNull();
            }
        }
    });

    test('the legs keep the files\' own colours', async () => {
        for (const url of Object.values(files)) {
            const model = await SceneAssets.loadModel(url);
            for (const [name, parts] of model.meshes) {
                expect(parts.map(part => Array.from(part.geometry.attributes.color.array))).toEqual(fileColours.get(name));
                for (const part of parts) expect(part.material.isMeshStandardMaterial).toBe(true);
            }
        }
    });

    test('the plain shapes (no file) take the palette, inside the caps', () => {
        const plain = new Scenery(null, null, null).plain();
        for (const shape of plain.trees) {
            const material = shape.parts[0].material;
            expect(material.userData.vegetation).toBe(shape.kind);
            const rgb = srgb([material.color.r, material.color.g, material.color.b]);
            expect(Vegetation.inCaps(shape.kind, rgb)).toBe(true);
        }
    });
});
