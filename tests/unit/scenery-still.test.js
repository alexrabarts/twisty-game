// A stopped bike's view holds still (Scenery.holdsStill): a change of the quality level's tree share or of the window's
// room brings nothing into the view and takes nothing out of it, by a pop or a fade. Out of view it changes at once, and
// once the bike moves on to another square the view's rules apply again.
import { describe, test, expect } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';
import { fakeData, allTiles, samplesOf, straight } from '../helpers/world-synthetic.js';

const game = loadGame();
const { THREE, Scenery, WorldGround, WorldRoute } = game;

// Tile (0,0): a road along x = 100, forest everywhere else
const data = fakeData({ tiles: allTiles(0, 0, 0, 0), shape: () => 1000, zone: x => (Math.abs(x - 100) <= 5 ? 1 : 0) });
const ground = new WorldGround(new WorldRoute(samplesOf(straight(400)), {}), data);
const forest = new Uint8Array(32 * 32).fill(1);
const tile = data.tile('0,0');
const bike = { x: 100, z: 100 };

// Trees at three levels of their own triangles
function levelled() {
    const material = new THREE.MeshBasicMaterial();
    const part = (n) => {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 9).map((_, i) => (i % 3 === 1 ? (i % 9) / 3 + 1 : (i % 9) * 0.1)), 3));
        return [{ geometry, material }];
    };
    const lods = { near: part(300), mid: part(60), far: part(12) };
    return { trees: [{ kind: 'conifer', name: 'conifer_test', share: 1, parts: lods.mid, lods }, { kind: 'broadleaf', name: 'broadleaf_test', share: 1, parts: lods.mid, lods }], houses: [] };
}

// A camera that sees the half of the tile with x under 256 (the bike's side) and not the rest
function cameraOnHalf() {
    const camera = new THREE.OrthographicCamera(-130, 130, 260, -260, 1, 5000);
    camera.position.set(126, 1600, 256);
    camera.lookAt(126, 1000, 256.01);
    camera.updateMatrixWorld();
    return camera;
}

// The trees drawn: place to the share drawn (1 less the fade's cut), over its levels (a tree that changes its level
// draws the two in complementary pixels)
function drawn(scenery) {
    const out = new Map();
    for (const mesh of scenery.forest.children) {
        if (!mesh.name.startsWith('trees:') || !mesh.visible) continue;
        const a = mesh.instanceMatrix.array;
        for (let i = 0; i < mesh.count; i++) {
            const key = `${a[i * 16 + 12].toFixed(1)},${a[i * 16 + 14].toFixed(1)}`;
            out.set(key, Math.min(1, (out.get(key) || 0) + 1 - Math.min(1, Math.abs(a[i * 16 + 3]))));
        }
    }
    return out;
}

function settled(share = 1) {
    const scenery = new Scenery(ground, data, levelled());
    scenery.setView(cameraOnHalf());
    scenery.setTrees(share, Scenery.TREE_NEAR_CAP);
    scenery.buildTile(tile, forest, [], bike);
    // (what came in has faded in, and the rank that follows a fade's end is made)
    for (let k = 0; k < 4; k++) {
        scenery.stepFades(Scenery.FADE_S);
        scenery.rankTrees(bike);
    }
    return scenery;
}

const seen = (scenery, key) => {
    const [x, z] = key.split(',').map(Number);
    return scenery.inView(x, 1003, z, 3);
};

describe('a stopped bike\'s view holds still', () => {
    test('a step down of the tree share takes none of the trees in view, by a pop or a fade; out of view it takes them at once', () => {
        const scenery = settled(1);
        const before = drawn(scenery);
        const inView = [...before.keys()].filter(key => seen(scenery, key));
        const outView = [...before.keys()].filter(key => !seen(scenery, key));
        expect(inView.length).toBeGreaterThan(20);
        expect(outView.length).toBeGreaterThan(20);
        scenery.setTrees(0.05, Scenery.TREE_NEAR_CAP);
        for (let k = 0; k < 4; k++) {
            const now = drawn(scenery);
            for (const key of inView) expect({ key, share: now.get(key) }).toEqual({ key, share: 1 });
            scenery.stepFades(Scenery.FADE_S / 2);
            scenery.rankTrees(bike);
        }
        const after = drawn(scenery);
        expect(outView.filter(key => after.has(key)).length).toBeLessThan(outView.length);
    });

    test('a step up of the tree share brings none into the view; out of view they come at once', () => {
        const scenery = settled(0.05);
        const before = drawn(scenery);
        scenery.setTrees(1, Scenery.TREE_NEAR_CAP);
        const after = drawn(scenery);
        const added = [...after.keys()].filter(key => !before.has(key));
        expect(added.length).toBeGreaterThan(0);
        for (const key of added) expect({ key, inView: seen(scenery, key), share: after.get(key) }).toEqual({ key, inView: false, share: 1 });
    });

    test('a fall of the room takes none of the trees in view while the bike stands', () => {
        const scenery = settled(1);
        const before = drawn(scenery);
        const inView = [...before.keys()].filter(key => seen(scenery, key));
        scenery.setWindowRoom(Scenery.TRIANGLE_CAP / 2);
        scenery.rankTrees(bike);
        const now = drawn(scenery);
        for (const key of inView) expect(now.get(key)).toBe(1);
    });

    test('once the bike moves to another square, the share takes trees in view again, with a fade', () => {
        const scenery = settled(1);
        const before = drawn(scenery);
        scenery.setTrees(0.05, Scenery.TREE_NEAR_CAP);
        scenery.rankTrees({ x: bike.x + Scenery.TREE_RANK_M, z: bike.z });
        scenery.stepFades(Scenery.FADE_S / 2);
        const now = drawn(scenery);
        const fading = [...before.keys()].filter(key => seen(scenery, key) && now.get(key) < 1);
        expect(fading.length).toBeGreaterThan(5);
        // (a fade, not a pop: each is still drawn half way through it)
        for (const key of fading) expect(now.has(key)).toBe(true);
    });

    test('a tile that comes while the bike stands is not held still: its trees in view fade in', () => {
        const scenery = settled(1);
        expect(scenery.holdsStill(scenery.treeBike, Scenery.snapped(bike), 'treeTiles')).toBe(true);
        scenery.disposeTile('0,0', true);
        expect(scenery.holdsStill(scenery.treeBike, Scenery.snapped(bike), 'treeTiles')).toBe(false);
    });
});

// A model of about 4 800 triangles (a box of 8 by 6 by 10 m cut fine), its walls in one colour and its roof's top in another
function heavyHouse() {
    const geometry = new THREE.BoxGeometry(8, 6, 10, 20, 20, 20).toNonIndexed();
    geometry.translate(0, 3, 0);
    const n = geometry.attributes.position.count, colour = new Float32Array(n * 3), normal = geometry.attributes.normal;
    for (let i = 0; i < n; i++) colour.set(normal.getY(i) > 0.5 ? [0.3, 0.1, 0.1] : [0.8, 0.8, 0.7], i * 3);
    geometry.setAttribute('color', new THREE.BufferAttribute(colour, 3));
    return { name: 'house_test', parts: [{ geometry, material: new THREE.MeshStandardMaterial({ name: 'body', vertexColors: true }) }] };
}

describe('every house within reach is drawn, the far ones at their far level', () => {
    const village = Array.from({ length: 80 }, (_, i) => ({ x: 130 + (i % 10) * 24, z: 40 + Math.floor(i / 10) * 24, w: 8, d: 10, heading: 0, h: 6, kind: 1 }));
    const meshes = scenery => scenery.houseGroup.children.filter(m => m.name.startsWith('houses:') && m.name !== 'houses:footing' && m.name !== 'houses:far');
    // Each house drawn: its place to the cuts of the levels it is drawn at (the far houses' one mesh by its runs)
    const drawnHouses = (scenery) => {
        const out = new Map();
        const add = (x, z, cut, level) => {
            const key = `${x.toFixed(1)},${z.toFixed(1)}`;
            out.set(key, (out.get(key) || []).concat({ cut, level, d: Math.hypot(x - bike.x, z - bike.z) }));
        };
        for (const m of meshes(scenery)) {
            const a = m.instanceMatrix.array;
            for (let i = 0; i < m.count; i++) add(a[i * 16 + 12], a[i * 16 + 14], a[i * 16 + 3], 'near');
        }
        const far = scenery.houseGroup.children.find(m => m.name === 'houses:far');
        if (far) for (const f of far.userData.farHouses) add(f.x, f.z, far.geometry.attributes.fadeCut.array[f.first], 'far');
        return out;
    };

    test('a far level is the model\'s box and roof in its own colours, in 14 triangles', () => {
        const home = heavyHouse();
        const [far] = Scenery.houseLevels(home).far;
        expect(Scenery.trianglesOf([far])).toBe(14);
        far.geometry.computeBoundingBox();
        const box = far.geometry.boundingBox;
        expect([box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z].map(v => Math.round(v * 10) / 10)).toEqual([8, 6, 10]);
        const colours = new Set();
        const c = far.geometry.attributes.color;
        for (let i = 0; i < c.count; i++) colours.add([c.getX(i), c.getY(i), c.getZ(i)].map(v => v.toFixed(2)).join());
        expect(colours.has('0.80,0.80,0.70')).toBe(true);
        expect(colours.has('0.30,0.10,0.10')).toBe(true);
        expect(Scenery.houseLevels(home).far).toBe(Scenery.houseLevels(home).far);
    });

    test('with the room at the houses\' floor, all 80 houses are drawn, only the nearest whole', () => {
        const scenery = new Scenery(ground, data, { trees: levelled().trees, houses: [heavyHouse()] });
        scenery.setWindowRoom(Scenery.HOUSE_FLOOR + Scenery.TREE_ROOM);
        scenery.buildTile(tile, null, village, bike);
        const all = [...drawnHouses(scenery).values()].flat();
        const near = all.filter(h => h.level === 'near'), far = all.filter(h => h.level === 'far');
        expect(near.length + far.length).toBe(village.length);
        expect(near.length).toBeGreaterThan(0);
        expect(near.length * 4800).toBeLessThanOrEqual(Scenery.HOUSE_FLOOR);
        // (the near ones are the nearest, and the far ones are no instances: one mesh)
        expect(Math.max(...near.map(h => h.d))).toBeLessThanOrEqual(Math.min(...far.map(h => h.d)));
        expect(scenery.houseGroup.children.filter(m => m.name === 'houses:far' && !m.isInstancedMesh)).toHaveLength(1);
    });

    test('a house that changes its level in view draws the two levels in complementary pixels, its footing whole', () => {
        const scenery = new Scenery(ground, data, { trees: levelled().trees, houses: [heavyHouse()] });
        scenery.setView(cameraOnHalf());
        scenery.buildTile(tile, null, village, bike);
        for (let k = 0; k < 4; k++) { scenery.stepFades(Scenery.FADE_S); scenery.rankCaps(bike, true); }
        // The room falls and the bike moves on a square: the furthest near houses go to their far level, in a fade
        scenery.setWindowRoom(Scenery.HOUSE_FLOOR + Scenery.TREE_ROOM);
        scenery.rankCaps({ x: bike.x + Scenery.TREE_RANK_M, z: bike.z }, true);
        scenery.stepFades(Scenery.FADE_S / 2);
        const share = new Map([...drawnHouses(scenery)].map(([key, list]) => [key, list.map(h => h.cut)]));
        const swapping = [...share.values()].filter(cuts => cuts.length === 2);
        expect(swapping.length).toBeGreaterThan(0);
        // (a cut c and the other level's c - 1: each pixel is drawn by one of them)
        for (const [p, q] of swapping) expect(Math.abs(Math.abs(p) + Math.abs(q) - 1)).toBeLessThan(1e-6);
        for (const [key, cuts] of share) expect({ key, n: cuts.length }).toEqual({ key, n: cuts.length > 1 ? 2 : 1 });
    });
});

describe('a tile is kept whatever it holds', () => {
    test('a tile with no cover and no houses is kept with its group, so a side road that changes near it reaches it', () => {
        const scenery = new Scenery(ground, data);
        // (every place of the tile under a road: nothing may stand)
        scenery.clear = () => false;
        scenery.roads = { clearOfRoad: () => false, clearOfRoadBox: () => false, clearance: () => 0 };
        const group = scenery.buildTile(tile, null, [], bike, false);
        expect(group).not.toBeNull();
        expect(scenery.perTile.has(tile.key)).toBe(true);
        expect(scenery.perTile.get(tile.key).trees).toBe(0);
        scenery.disposeTile(tile.key);
        expect(scenery.perTile.has(tile.key)).toBe(false);
    });
});

describe('the crown clumps of a middle tile fade with its distance', () => {
    const { TerrainMesh, WorldStreamer, WorldData } = game;
    const [near, far] = WorldStreamer.TILE_LOD_M, m = WorldData.TILE_M, band = TerrainMesh.CLUMP_FADE_M;
    // A clump in tile (2, 0) and a bike on z = 256, `d` m short of the tile's west edge
    const share = d => TerrainMesh.clumpShare(2 * m + 100, 256, { x: 2 * m - d, z: 256 });

    test('none at the distances a tile changes its level, all of it between, smooth', () => {
        expect(share(near)).toBe(0);
        expect(share(near + band)).toBe(1);
        expect(share((near + far) / 2)).toBe(1);
        expect(share(far - band)).toBe(1);
        expect(share(far)).toBe(0);
        let last = 0;
        for (let d = near; d <= near + band; d += 1) {
            const s = share(d);
            expect(s - last).toBeLessThan(0.02);
            last = s;
        }
    });

    test('a middle tile marks its clumps\' vertices, and the land\'s shader dithers them by that share', () => {
        const material = TerrainMesh.material();
        const shader = { vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader, uniforms: {} };
        material.onBeforeCompile(shader, null);
        expect(shader.vertexShader).toContain('attribute vec3 clump;');
        expect(shader.vertexShader).toContain('smoothstep(uLodLimits.x');
        expect(shader.fragmentShader).toContain('>= vClump ) discard;');
        expect(shader.uniforms.uLodBike).toBe(TerrainMesh.clumpUniforms.uLodBike);
        expect(material.customProgramCacheKey()).toMatch(/\|clump$/);
        const forestCover = new Uint8Array(WorldData.COVER_N * WorldData.COVER_N).fill(1);
        const built = TerrainMesh.build ? TerrainMesh.build(tile, forestCover, 1) : null;
        if (!built) return;
        const clumps = TerrainMesh.clumps(tile, forestCover, 1);
        expect(clumps.length).toBeGreaterThan(0);
        const marks = built.mesh.geometry.attributes.clump;
        let marked = 0;
        for (let i = 0; i < marks.count; i++) if (marks.getZ(i) > 0) marked++;
        expect(marked).toBe(clumps.length * (TerrainMesh.CLUMP_SIDES + 1));
        // (the full level has none)
        expect(TerrainMesh.build(tile, forestCover, 0).mesh.geometry.attributes.clump).toBeUndefined();
    });

    test('a middle tile that comes into the window fades its clumps in over CLUMP_IN_S; one built again in its place keeps theirs', () => {
        const forestCover = new Uint8Array(WorldData.COVER_N * WorldData.COVER_N).fill(1);
        const scene = new THREE.Group();
        const mark = mesh => mesh.geometry.attributes.clump.array[mesh.geometry.attributes.clump.array.findIndex((v, i) => i % 3 === 2 && v > 0)];
        const first = TerrainMesh.build(tile, forestCover, 1).mesh;
        scene.add(first);
        expect(mark(first)).toBeCloseTo(TerrainMesh.CLUMP_MARK, 6);
        TerrainMesh.stepClumps(TerrainMesh.CLUMP_IN_S / 2);
        expect(mark(first)).toBeCloseTo(0.5 + TerrainMesh.CLUMP_MARK, 3);
        TerrainMesh.stepClumps(TerrainMesh.CLUMP_IN_S);
        expect(mark(first)).toBe(1);
        // (built again while the first is drawn: whole at once)
        const again = TerrainMesh.build(tile, forestCover, 1).mesh;
        expect(mark(again)).toBe(1);
        scene.remove(first);
        first.geometry.dispose();
        scene.add(again);
        // (a tile the window lets go of: its clumps step out in its grace, and back in if it is held again)
        TerrainMesh.stepClumps(TerrainMesh.CLUMP_IN_S / 2, key => key === tile.key);
        expect(mark(again)).toBeCloseTo(0.5, 3);
        TerrainMesh.stepClumps(TerrainMesh.CLUMP_IN_S, key => key === tile.key);
        expect(mark(again)).toBeCloseTo(TerrainMesh.CLUMP_MARK, 6);
        TerrainMesh.stepClumps(TerrainMesh.CLUMP_IN_S, () => false);
        expect(mark(again)).toBe(1);
        // (let go and come again: from none)
        scene.remove(again);
        again.geometry.dispose();
        expect(TerrainMesh.drawnClumps().has(tile.key)).toBe(false);
        expect(mark(TerrainMesh.build(tile, forestCover, 1).mesh)).toBeCloseTo(TerrainMesh.CLUMP_MARK, 6);
    });

    test('Game sets the bike and the distances each frame', () => {
        TerrainMesh.setClumpView({ x: 12, z: 34 }, [600, 1800]);
        expect([...TerrainMesh.clumpUniforms.uLodBike.value.toArray()]).toEqual([12, 34]);
        expect([...TerrainMesh.clumpUniforms.uLodLimits.value.toArray()]).toEqual([600, 1800]);
        TerrainMesh.setClumpView({ x: 0, z: 0 });
    });
});
