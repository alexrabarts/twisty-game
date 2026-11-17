// The meshes of a world (road, terrain, horizon, scenery) built headless with real three: their
// counts, that every vertex is a number, and the rules each one keeps (no folded ribbon, skirts under the
// edges, no tree on the road, the same trees every time).
import { describe, test, expect } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';
import { fakeData, allTiles, samplesOf, straight } from '../helpers/world-synthetic.js';

const game = loadGame();
const { THREE, RoadMesh, TerrainMesh, Horizon, FarLand, LandShade, Scenery, WorldGround, WorldRoute, WorldData } = game;

const finite = geometry => Array.from(geometry.attributes.position.array).every(Number.isFinite);
const row = (x, z, heading, over = {}) => ({ x, y: 100, z, heading, width: 10, bits: 0, ...over });

// A road along +z, `n` rows 4 m apart
const line = (n, over = {}) => Array.from({ length: n }, (_, i) => row(0, i * 4, 0, over));

// A bend of radius `radius` turning right through `turn` radians, rows 4 m apart
function bend(radius, turn) {
    const rows = [];
    const steps = Math.ceil((radius * turn) / 4);
    for (let i = 0; i <= steps; i++) {
        const a = (turn * i) / steps;
        // Centre of the bend is on the right of the start; heading grows as it turns right
        rows.push(row(radius * (1 - Math.cos(a)), radius * Math.sin(a), a));
    }
    return rows;
}

describe('RoadMesh', () => {
    test('LOD0 is a row of 9 strips every 4 m, markings and kerbs included', () => {
        const { geometry, triangles, clamped } = RoadMesh.ribbon(line(11), 0);
        expect(triangles).toBe(10 * 9 * 2);
        expect(clamped).toBe(0);
        expect(finite(geometry)).toBe(true);
        expect(geometry.attributes.color.count).toBe(geometry.attributes.position.count);
    });

    test('LOD1 is one strip of asphalt and far fewer triangles', () => {
        const rows = line(100);
        const near = RoadMesh.ribbon(rows, 0);
        const far = RoadMesh.ribbon(rows, 1);
        expect(far.triangles).toBeLessThan(near.triangles / 20);
        expect(far.triangles % 2).toBe(0);
    });

    test('decimation keeps the ends, every row of a hairpin, and a bend at least every 0.18 rad', () => {
        const tight = bend(12, Math.PI);
        // 4 m rows already turn 0.33 rad each: nothing may be dropped, or the hairpin becomes chords
        expect(RoadMesh.decimate(tight)).toHaveLength(tight.length);
        const gentle = bend(40, Math.PI);
        const kept = RoadMesh.decimate(gentle);
        expect(kept[0]).toBe(gentle[0]);
        expect(kept[kept.length - 1]).toBe(gentle[gentle.length - 1]);
        expect(kept.length).toBeLessThan(gentle.length);
        for (let i = 1; i < kept.length; i++) expect(Math.abs(kept[i].heading - kept[i - 1].heading)).toBeLessThanOrEqual(0.18 + 0.11);
        // A straight road keeps a row every 16 m: 396 m is 25 rows and the end
        expect(RoadMesh.decimate(line(100)).length).toBeLessThanOrEqual(26);
    });

    test('the inside of a hairpin tighter than the road is wide is held inside the bend and never folds', () => {
        const rows = bend(6, Math.PI);
        const { geometry, clamped } = RoadMesh.ribbon(rows, 0);
        expect(clamped).toBeGreaterThan(0);
        expect(finite(geometry)).toBe(true);
        // The bend turns right about a centre at (radius, 0): no vertex may pass the centre of the bend
        const p = geometry.attributes.position.array;
        const centre = new THREE.Vector2(6, 0);
        for (let i = 0; i < p.length; i += 3) {
            expect(Math.hypot(p[i] - centre.x, p[i + 2] - centre.y)).toBeGreaterThan(0.5);
        }
    });

    test('a bend gentler than the road is wide is left alone', () => {
        expect(RoadMesh.ribbon(bend(60, 1), 0).clamped).toBe(0);
    });

    test('cobbles lose the markings and take the cobble colour', () => {
        const colors = RoadMesh.ribbon(line(6, { bits: 8 }), 0).geometry.attributes.color.array;
        const seen = new Set();
        for (let i = 0; i < colors.length; i += 3) seen.add(`${colors[i].toFixed(2)},${colors[i + 1].toFixed(2)},${colors[i + 2].toFixed(2)}`);
        const centre = RoadMesh.COLORS.centreLine.map(v => v.toFixed(2)).join(',');
        expect(seen.has(centre)).toBe(false);
        expect(seen.has(RoadMesh.COLORS.cobbles.map(v => v.toFixed(2)).join(','))).toBe(true);
    });

    test('a tunnel run gets a tube and portals, a bridge run a deck, parapets and piers', () => {
        const rows = line(40).map((r, i) => ({ ...r, bits: i >= 5 && i < 15 ? 1 : i >= 20 && i < 30 ? 2 : 0 }));
        const group = RoadMesh.section(rows, 0, { groundAt: () => 60 });
        const names = group.children.map(c => c.name);
        expect(names).toEqual(['road-ribbon', 'tunnel', 'bridge']);
        for (const child of group.children) expect(finite(child.geometry)).toBe(true);
        // Piers stand from the deck to the ground 40 m below
        const bridge = group.children[2].geometry;
        bridge.computeBoundingBox();
        expect(bridge.boundingBox.min.y).toBeLessThan(70);
        expect(group.userData.triangles).toBeGreaterThan(group.children[0].geometry.attributes.position.count / 3);
        // The tunnel's roof is the route's own roof height over the road
        const tunnel = group.children[1].geometry;
        tunnel.computeBoundingBox();
        expect(tunnel.boundingBox.max.y).toBeCloseTo(100 + WorldRoute.ROOF_M + 1.2, 4);
    });

    test('a road with no structures is the ribbon alone', () => {
        expect(RoadMesh.section(line(10), 1).children).toHaveLength(1);
        expect(RoadMesh.sideRoad(line(10), true).name).toBe('world-road-stub');
        expect(RoadMesh.sideRoad(line(10), false).name).toBe('world-road-side');
    });

    test('barriers are placed across the road they close, as wide as it is', () => {
        const mesh = RoadMesh.barriers(4);
        const placed = RoadMesh.placeBarriers(mesh, [{ x: 10, y: 5, z: 20, heading: 0, width: 6 }, { x: 0, y: 0, z: 0, heading: Math.PI / 2, width: 12 }]);
        expect(placed).toBe(2);
        expect(mesh.count).toBe(2);
        const matrix = new THREE.Matrix4();
        mesh.getMatrixAt(0, matrix);
        expect(new THREE.Vector3().setFromMatrixPosition(matrix).toArray()).toEqual([10, 5, 20]);
        expect(new THREE.Vector3().setFromMatrixScale(matrix).x).toBe(7);
        // Heading 0: the barrier's width runs along +x, across a road that runs along +z
        const across = new THREE.Vector3(1, 0, 0).applyMatrix4(matrix.clone().setPosition(0, 0, 0)).normalize();
        expect(across.x).toBeCloseTo(1, 6);
        expect(RoadMesh.placeBarriers(mesh, Array.from({ length: 9 }, () => ({ x: 0, y: 0, z: 0, heading: 0, width: 6 })))).toBe(4);
    });
});

describe('TerrainMesh', () => {
    const N = WorldData.TILE_N;
    const tile = (over = {}) => {
        const heights = new Float32Array(N * N).fill(1000);
        const zones = new Uint8Array(N * N);
        return { key: '0,0', tx: 0, tz: 0, heights, zones, ...over };
    };

    test.each([[0, 8704], [1, 2048 + 256], [2, 512 + 128]])('LOD%i has the triangles its cells and skirts add up to', (lod, expected) => {
        const { mesh, triangles } = TerrainMesh.build(tile(), null, lod);
        expect(triangles).toBe(expected);
        expect(TerrainMesh.triangles(lod)).toBe(expected);
        expect(finite(mesh.geometry)).toBe(true);
        expect(mesh.geometry.index.count / 3).toBe(expected);
    });

    test('the mesh spans its 512 m square and the faces look up', () => {
        const { mesh } = TerrainMesh.build(tile({ tx: 2, tz: -1, key: '2,-1' }), null, 1);
        mesh.geometry.computeBoundingBox();
        expect(mesh.geometry.boundingBox.min.x).toBe(1024);
        expect(mesh.geometry.boundingBox.max.x).toBe(1536);
        expect(mesh.geometry.boundingBox.min.z).toBe(-512);
        const normals = mesh.geometry.attributes.normal.array;
        // Inside the tile the grid's own vertices face up on flat ground (the edge vertices share their normal with the skirt)
        for (let b = 1; b < 32; b++) for (let a = 1; a < 32; a++) expect(normals[(b * 33 + a) * 3 + 1]).toBeGreaterThan(0.99);
    });

    test('the skirt hangs 3 m under the edge it hides a crack in', () => {
        const { mesh } = TerrainMesh.build(tile(), null, 2);
        mesh.geometry.computeBoundingBox();
        expect(mesh.geometry.boundingBox.min.y).toBe(1000 - TerrainMesh.SKIRT_M);
    });

    test('carved road and bench are drawn under the height the physics reads', () => {
        const t = tile();
        t.zones[10 * N + 10] = 1;
        t.zones[10 * N + 11] = 2;
        const { mesh } = TerrainMesh.build(t, null, 0);
        const y = at => mesh.geometry.attributes.position.array[at * 3 + 1];
        expect(y(10 * N + 10)).toBeCloseTo(1000 - TerrainMesh.SINK_M, 4);
        expect(y(10 * N + 11)).toBeCloseTo(1000 - TerrainMesh.SINK_M, 4);
        expect(y(10 * N + 12)).toBe(1000);
    });

    test('land cover picks the colour; steep ground is rock, and snow lies only high up and facing north', () => {
        const cover = new Uint8Array(32 * 32).fill(1);
        expect(TerrainMesh.colorAt(tile(), cover, 4, 4, 1200)).toEqual(TerrainMesh.COVER_COLORS[1]);
        const t = tile();
        t.zones[4 * N + 4] = 5;
        expect(TerrainMesh.colorAt(t, cover, 4, 4, 1200)).toEqual(TerrainMesh.COVER_COLORS[7]);
        const grass = new Uint8Array(32 * 32).fill(5);
        // A 60 degree slope of grass is rock
        const steep = TerrainMesh.colorAt(tile(), grass, 4, 4, 1500, 0.5, 0, 100, 100);
        expect([LandShade.PALETTE.rock, LandShade.PALETTE.scree]).toContainEqual(steep);
        // High ground facing north in late summer carries snow somewhere; facing south it carries none
        const brightest = north => Math.max(...Array.from({ length: 40 }, (_, k) => TerrainMesh.colorAt(tile(), grass, 4, 4, 3100, 0.1, north, k * 37, k * 53)[2]));
        expect(brightest(1)).toBeGreaterThan(0.85);
        expect(brightest(-1)).toBeLessThan(0.6);
    });

    test('a carved cell is a worn verge, not a bare band: the road shows more ground than the bench', () => {
        const grass = new Uint8Array(32 * 32).fill(5);
        const t = tile();
        t.zones[4 * N + 4] = WorldData.ZONE.road;
        t.zones[4 * N + 6] = WorldData.ZONE.bench;
        const road = TerrainMesh.colorAt(t, grass, 4, 4, 1200, 0, 0, 10, 10);
        const bench = TerrainMesh.colorAt(t, grass, 6, 4, 1200, 0, 0, 10, 10);
        const open = TerrainMesh.colorAt(tile(), grass, 6, 4, 1200, 0, 0, 10, 10);
        const toBare = c => Math.hypot(...c.map((v, k) => v - TerrainMesh.BARE[k]));
        expect(toBare(road)).toBeLessThan(toBare(bench));
        expect(toBare(bench)).toBeLessThan(toBare(open));
    });

    test('forest at LOD1 carries crown clumps in the tile\'s own geometry; none at LOD0, LOD2 or on open ground', () => {
        const forest = new Uint8Array(32 * 32).fill(1);
        const base = TerrainMesh.triangles(1);
        const near = TerrainMesh.build(tile(), forest, 0);
        expect(near.triangles).toBe(TerrainMesh.triangles(0));
        const mid = TerrainMesh.build(tile(), forest, 1);
        const clumps = TerrainMesh.clumps(tile(), forest, 1);
        expect(clumps.length).toBeGreaterThan(250);
        expect(mid.triangles).toBe(base + clumps.length * TerrainMesh.CLUMP_SIDES);
        expect(finite(mid.mesh.geometry)).toBe(true);
        expect(TerrainMesh.clumps(tile(), new Uint8Array(32 * 32).fill(5), 1)).toHaveLength(0);
        // The same clumps every time, and none beyond 2 km
        expect(TerrainMesh.clumps(tile(), forest, 1)).toEqual(clumps);
        expect(TerrainMesh.clumps(tile(), forest, 2)).toHaveLength(0);
    });

    test('a tile\'s colours are made once, linear, and kept across LOD changes', () => {
        const forest = new Uint8Array(32 * 32).fill(1);
        const t = tile();
        const first = TerrainMesh.colours(t, forest);
        expect(TerrainMesh.colours(t, forest)).toBe(first);
        const { mesh } = TerrainMesh.build(t, forest, 2);
        expect(mesh.geometry.userData.linearColors).toBe(true);
        expect(first[0]).toBeCloseTo(TerrainMesh.toLinear(TerrainMesh.COVER_COLORS[1][0]), 3);
        // A new cover is new colours
        expect(TerrainMesh.colours(t, new Uint8Array(32 * 32).fill(5))).not.toBe(first);
    });
});

describe('Horizon', () => {
    const far = (nx, nz, fill = 1500) => ({ x0: 0, z0: 0, nx, nz, cell: 100, data: new Int16Array(nx * nz).fill(fill) });

    test('a small grid is drawn whole, a cell under the tiles height', () => {
        const { mesh, triangles } = Horizon.build(far(11, 11));
        expect(triangles).toBe(10 * 10 * 2);
        mesh.geometry.computeBoundingBox();
        expect(mesh.geometry.boundingBox.max.y).toBe(1500 - Horizon.SINK_M);
    });

    test('a cell with no data is left out', () => {
        const grid = far(11, 11);
        grid.data[5 * 11 + 5] = -32768;
        expect(Horizon.build(grid).triangles).toBe(100 * 2 - 4 * 2);
    });

    test('each vertex is sunk by its own metres when the importer gives them (far/sink0.bin)', () => {
        const sinks = new Uint8Array(11 * 11).fill(8);
        sinks[5 * 11 + 5] = 40;
        const { mesh } = Horizon.build(far(11, 11), null, sinks);
        const y = mesh.geometry.attributes.position.array;
        expect(y[(5 * 11 + 5) * 3 + 1]).toBe(1500 - 40);
        expect(y[1]).toBe(1500 - 8);
    });

    test('cover shares colour the far land: forest is darker than open grass at the same height', () => {
        const cover = n => new Uint8Array(11 * 11 * 4).map((_, i) => (i % 4 === 0 ? n : i % 4 === 3 ? 255 : 0));
        const mean = mesh => { const c = mesh.geometry.attributes.color.array; let s = 0; for (const v of c) s += v; return s / c.length; };
        expect(mean(Horizon.build(far(11, 11), cover(255)).mesh)).toBeLessThan(mean(Horizon.build(far(11, 11), cover(0)).mesh) * 0.7);
    });

    test('a large grid is thinned to the triangle budget', () => {
        const grid = far(751, 851);
        expect(Horizon.strideFor(grid)).toBeGreaterThan(1);
        expect(Horizon.build(grid).triangles).toBeLessThanOrEqual(Horizon.MAX_TRIANGLES);
    });
});

describe('Scenery', () => {
    // Tile (0,0): a road along x = 100 (zone road), grass cover with forest everywhere
    const road = (x) => Math.abs(x - 100) <= 5;
    const data = fakeData({ tiles: allTiles(0, 0, 0, 0), shape: () => 1000, zone: x => (road(x) ? 1 : 0) });
    const route = new WorldRoute(samplesOf(straight(400)), {});
    const ground = new WorldGround(route, data);
    const forest = new Uint8Array(32 * 32).fill(1);
    const tile = data.tile('0,0');

    test('the same tile has the same trees every time, in the same places', () => {
        const a = new Scenery(ground, data).treeSites(tile, forest);
        const b = new Scenery(ground, data).treeSites(tile, forest);
        expect(a.length).toBeGreaterThan(50);
        expect(a.map(s => [s.x, s.z, s.shape.name, s.scale])).toEqual(b.map(s => [s.x, s.z, s.shape.name, s.scale]));
    });

    test('no tree stands on the road, its bench, or within a few metres of them', () => {
        const sites = new Scenery(ground, data).treeSites(tile, forest);
        for (const site of sites) expect(Math.abs(site.x - 100)).toBeGreaterThan(5 + Scenery.ROAD_CLEAR_M - 1e-6);
    });

    test('trees stand on the ground the physics reads and no cover means no trees', () => {
        const scenery = new Scenery(ground, data);
        for (const site of scenery.treeSites(tile, forest).slice(0, 20)) expect(site.y).toBe(1000);
        expect(scenery.treeSites(tile, null)).toEqual([]);
        expect(scenery.treeSites(tile, new Uint8Array(32 * 32).fill(3))).toEqual([]);
    });

    test('a tile is built nearest first within the caps, and freed without freeing the shared shapes', () => {
        const scenery = new Scenery(ground, data);
        const bike = { x: 100, z: 100 };
        const group = scenery.buildTile(tile, forest, [], bike);
        expect(group).not.toBeNull();
        const count = group.children.reduce((n, mesh) => n + mesh.count, 0);
        expect(count).toBe(scenery.treeCount);
        expect(scenery.treeCount).toBeLessThanOrEqual(Scenery.TREES_PER_TILE);
        expect(scenery.triangles).toBeLessThanOrEqual(Scenery.TRIANGLE_CAP);
        const shape = group.children[0].geometry;
        scenery.disposeTile('0,0');
        expect(scenery.treeCount).toBe(0);
        expect(scenery.triangles).toBe(0);
        expect(scenery.perTile.size).toBe(0);
        // The shared geometry is still usable
        expect(shape.attributes.position.count).toBeGreaterThan(0);
    });

    test('the tree cap holds across tiles', () => {
        const scenery = new Scenery(ground, data);
        scenery.treeCount = Scenery.TREE_CAP - 10;
        const group = scenery.buildTile(tile, forest, [], { x: 100, z: 100 });
        expect(scenery.treeCount).toBeLessThanOrEqual(Scenery.TREE_CAP);
        expect(group.children.reduce((n, mesh) => n + mesh.count, 0)).toBeLessThanOrEqual(10);
    });

    test('houses stand on open ground within reach, nearest first, capped by their triangles', () => {
        const scenery = new Scenery(ground, data);
        const houses = Array.from({ length: 80 }, (_, i) => ({ x: 200 + (i % 10) * 20, z: 50 + Math.floor(i / 10) * 20, w: 8, d: 10, heading: 0.3, h: 6, kind: 1 }));
        houses.push({ x: 100, z: 100, w: 8, d: 10, heading: 0, h: 6, kind: 1 }, { x: 5000, z: 5000, w: 8, d: 10, heading: 0, h: 6, kind: 1 });
        const group = scenery.buildTile(tile, null, houses, { x: 200, z: 50 });
        const meshes = group.children.filter(m => m.name.startsWith('houses:'));
        const placed = meshes.reduce((n, mesh) => n + mesh.count, 0);
        expect(placed).toBeGreaterThan(0);
        expect(placed).toBeLessThanOrEqual(houses.length - 2);
        expect(scenery.houseInstances).toBeLessThanOrEqual(Scenery.BUILDING_CAP);
        // No house on the road (x = 100), none beyond reach
        const matrix = new THREE.Matrix4();
        for (const mesh of meshes) {
            for (let i = 0; i < mesh.count; i++) {
                mesh.getMatrixAt(i, matrix);
                const at = new THREE.Vector3().setFromMatrixPosition(matrix);
                expect(Math.abs(at.x - 100)).toBeGreaterThan(5);
                expect(Math.hypot(at.x - 200, at.z - 50)).toBeLessThanOrEqual(Scenery.BUILDING_REACH_M);
            }
        }
    });

    test('a modelled house is drawn inside its mapped footprint, and a footprint too small for one is a box of its size', () => {
        // A model shaped as the village houses are: 16 m along its front, 11 m deep, the front on z = 0
        const body = new THREE.BoxGeometry(16, 10, 11.4);
        body.translate(0, 5, 4.3);
        const material = new THREE.MeshStandardMaterial();
        const models = { trees: [], houses: [{ name: 'house_test', parts: [{ geometry: body, material }] }] };
        const scenery = new Scenery(ground, data, models);
        const houses = [
            { x: 200, z: 60, w: 12, d: 9, heading: 0.4, h: 7, kind: 1 },
            { x: 240, z: 60, w: 9, d: 14, heading: -1.1, h: 7, kind: 1 },
            { x: 280, z: 60, w: 30, d: 25, heading: 2.0, h: 9, kind: 1 },
            { x: 320, z: 60, w: 4, d: 3, heading: 0.7, h: 3.5, kind: 3 }
        ];
        const group = scenery.buildTile(tile, null, houses, { x: 250, z: 60 });
        const matrix = new THREE.Matrix4();
        const corner = new THREE.Vector3();
        let drawn = 0;
        for (const mesh of group.children.filter(m => m.name.startsWith('houses:'))) {
            mesh.geometry.computeBoundingBox();
            const box = mesh.geometry.boundingBox;
            for (let i = 0; i < mesh.count; i++) {
                mesh.getMatrixAt(i, matrix);
                const at = new THREE.Vector3().setFromMatrixPosition(matrix);
                const b = houses.reduce((best, h) => (Math.hypot(h.x - at.x, h.z - at.z) < Math.hypot(best.x - at.x, best.z - at.z) ? h : best));
                for (const x of [box.min.x, box.max.x]) for (const z of [box.min.z, box.max.z]) {
                    corner.set(x, 0, z).applyMatrix4(matrix);
                    const dx = corner.x - b.x, dz = corner.z - b.z;
                    const along = dx * Math.sin(b.heading) + dz * Math.cos(b.heading);
                    const across = dx * Math.cos(b.heading) - dz * Math.sin(b.heading);
                    expect(Math.abs(along)).toBeLessThanOrEqual(b.d / 2 + 1e-6);
                    expect(Math.abs(across)).toBeLessThanOrEqual(b.w / 2 + 1e-6);
                }
                drawn++;
            }
        }
        expect(drawn).toBe(houses.length);
        expect(group.children.filter(m => m.name === 'houses:plain_house').reduce((n, m) => n + m.count, 0)).toBe(1);
    });

    test('signposts are one instanced mesh, facing the rider who arrives', () => {
        const scenery = new Scenery(ground, data);
        const mesh = scenery.signposts([{ x: 1, y: 2, z: 3, heading: 0 }, { x: 4, y: 5, z: 6, heading: Math.PI / 2 }]);
        expect(mesh.isInstancedMesh).toBe(true);
        expect(mesh.count).toBe(2);
        const matrix = new THREE.Matrix4();
        mesh.getMatrixAt(0, matrix);
        // The board's face looks back at a rider heading along +z
        const normal = new THREE.Vector3(0, 0, 1).applyMatrix4(matrix.clone().setPosition(0, 0, 0));
        expect(normal.z).toBeCloseTo(-1, 6);
        const many = scenery.signposts(Array.from({ length: Scenery.SIGN_CAP + 20 }, () => ({ x: 0, y: 0, z: 0, heading: 0 })));
        expect(many.count).toBe(Scenery.SIGN_CAP);
    });

    test('a landmark box stands beside the road, not on it', () => {
        const scenery = new Scenery(ground, data);
        const group = scenery.landmarks([{ name: 'Hospiz', asset: 'box', size: [28, 10, 14], s: 100 }, { name: 'Bridge', asset: 'assets/bridge/stone.glb', s: 200 }], route);
        expect(group.children).toHaveLength(1);
        const mesh = group.children[0];
        // The road is along x = 0 here: the box clears its half width, the road's half width and a margin
        expect(Math.abs(mesh.position.x)).toBeGreaterThanOrEqual(5 + 7 + 8 - 1e-6);
        expect(mesh.name).toBe('landmark:Hospiz');
    });
});

describe('FarLand', () => {
    const level = (x0, z0, n, cell, h = 1500) => ({ x0, z0, nx: n, nz: n, cell, heights: new Int16Array(n * n).fill(h), shares: new Uint8Array(n * n * 4) });
    const inner = { x0: 0, z0: 0, nx: 11, nz: 11, cell: 100, data: new Int16Array(121).fill(1500) };

    test('a level leaves out the cells inside the level within it and sinks its vertices there, so no seam opens', () => {
        // A 250 m level over -1000..1500: the cells wholly inside 0..1000 are left out
        const [built] = FarLand.build([level(-1000, -1000, 11, 250)], inner);
        const kept = 10 * 10 - 4 * 4;
        expect(built.triangles).toBe(kept * 2);
        const y = built.mesh.geometry.attributes.position.array;
        // Vertex (6, 6) is (500, 500): inside the inner box, sunk; vertex (0, 0) is outside, at its height
        expect(y[(6 * 11 + 6) * 3 + 1]).toBe(1500 - FarLand.SINK_M[0]);
        expect(y[1]).toBe(1500);
    });

    test('the second level is cut by the first, not by far.bin', () => {
        const levels = [level(-1000, -1000, 11, 250), level(-10000, -10000, 11, 2000)];
        const [, outer] = FarLand.build(levels, inner);
        // The first level spans -1000..1500: only the 2 km cells wholly inside it would go, and none is
        expect(outer.triangles).toBe(10 * 10 * 2);
    });

    test('far meshes drop with the curvature of the Earth in their shader, the tiles do not', () => {
        expect(LandShade.DROP_PER_M2 * 40000 * 40000).toBeCloseTo(109, 0);
        expect(Horizon.material().customProgramCacheKey()).toBe('land-11');
        expect(TerrainMesh.material().customProgramCacheKey()).toBe('land-01');
    });
});
