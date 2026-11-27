// The drawn land is watertight (js/world/terrainmesh.js, js/world/data.js): every height tile of the committed Tremola
// slice is read as the page reads it (WorldData over the files) and built at each level of detail, and along every
// edge two neighbouring tiles share, at every pair of levels, the two sides meet or the higher side's skirt reaches
// down to the lower one. The GPU probe `world-watertight` (tools/terrain-check.mjs) reads the same rule from the
// camera, with the edge works' feet.
import { describe, test, expect, beforeAll } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';

const { WorldData, TerrainMesh } = loadGame();
const N = WorldData.TILE_N, LAST = N - 1;

// The drawn top and the skirt's foot along one edge of a built tile, at node positions m = 0..LAST (fractional
// between the tile's vertices): edge 0 is z = 0, 1 z = max, 2 x = 0, 3 x = max (TerrainMesh.build's order)
function edgeProfile(mesh, lod, e) {
    const stride = 1 << lod, side = LAST / stride + 1;
    const pos = mesh.geometry.attributes.position.array;
    const top = [(k) => k, (k) => (side - 1) * side + k, (k) => k * side, (k) => k * side + side - 1][e];
    const skirt = k => side * side + e * side + k;
    const at = (index, m) => {
        const f = m / stride, k = Math.min(side - 2, Math.floor(f)), u = f - k;
        return pos[index(k) * 3 + 1] * (1 - u) + pos[index(k + 1) * 3 + 1] * u;
    };
    return { top: m => at(top, m), foot: m => at(skirt, m) };
}

// Every shipped data folder: the Tremola's (world/), the Gotthard leg's and the tour's (worlds/*). A leg of the tour
// ridden against a stage reads that stage's folder, so its land is checked with the folder
for (const base of ['world/', 'worlds/gotthard/', 'worlds/airolo/', 'worlds/susten/', 'worlds/haslital/']) describe(`the committed land of ${base}`, () => {
    const tiles = new Map();
    const built = new Map();
    const near = key => tiles.get(key) || null;
    const mesh = (key, lod) => {
        const id = `${key}@${lod}`;
        if (!built.has(id)) built.set(id, TerrainMesh.build(tiles.get(key), null, lod, null, near).mesh);
        return built.get(id);
    };
    beforeAll(async () => {
        const data = await new WorldData({ base, fetchFn: diskFetch().fetchFn }).load();
        for (const [tx, tz] of data.manifest.tiles.height) {
            const key = `${tx},${tz}`;
            tiles.set(key, await data.ensureTile(key));
        }
    });

    test('two tiles read one height at every node they share', () => {
        let pairs = 0, worst = 0, copies = 0;
        for (const [key, t] of tiles) {
            for (const [dx, dz] of [[1, 0], [0, 1]]) {
                const o = tiles.get(`${t.tx + dx},${t.tz + dz}`);
                if (!o) continue;
                for (let k = 0; k < N; k++) {
                    const [i, j] = dx ? [LAST, k] : [k, LAST];
                    // As TerrainMesh.node reads them: the shared node from either side is one copy
                    const a = TerrainMesh.node(t, i, j, near), b = TerrainMesh.node(o, i - dx * LAST, j - dz * LAST, near);
                    worst = Math.max(worst, Math.abs(a.h - b.h));
                    copies = Math.max(copies, Math.abs(t.heights[j * N + i] - o.heights[(j - dz * LAST) * N + i - dx * LAST]));
                    expect(a.zone).toBe(b.zone);
                    pairs++;
                }
            }
        }
        expect(pairs).toBeGreaterThan(3000);
        expect(worst).toBe(0);
        // Each file holds its own copy of an edge node, rounded to its 0.1 m steps: the page decodes them as written
        // (a change the page made to a tile's heights by its own nodes alone left the copies up to 10 m apart)
        expect(copies).toBeLessThanOrEqual(0.1);
    }, 60000);

    test('at every pair of levels of detail the shared edge of two tiles is closed', () => {
        const open = [];
        let edges = 0;
        for (const [key, t] of tiles) {
            for (const [dx, dz, ea, eb] of [[1, 0, 3, 2], [0, 1, 1, 0]]) {
                const okey = `${t.tx + dx},${t.tz + dz}`;
                if (!tiles.has(okey)) continue;
                for (let la = 0; la <= 2; la++) {
                    for (let lb = 0; lb <= 2; lb++) {
                        const a = edgeProfile(mesh(key, la), la, ea), b = edgeProfile(mesh(okey, lb), lb, eb);
                        edges++;
                        let worst = 0, at = 0;
                        for (let m = 0; m <= LAST; m += 0.25) {
                            const ya = a.top(m), yb = b.top(m);
                            // The same level draws one line; else the higher side's skirt reaches the lower side
                            const gap = la === lb ? Math.abs(ya - yb) : ya > yb ? a.foot(m) - yb : b.foot(m) - ya;
                            if (gap > worst) { worst = gap; at = m; }
                        }
                        if (worst > 0.01) open.push({ key, okey, lods: `${la}|${lb}`, gapM: Math.round(worst * 100) / 100, at });
                    }
                }
            }
        }
        expect(edges).toBeGreaterThan(700);
        expect(open.sort((p, q) => q.gapM - p.gapM).slice(0, 10)).toEqual([]);
    }, 300000);

    test('no land triangle is folded: every face of the land looks up', () => {
        let folded = 0, faces = 0;
        for (const key of tiles.keys()) {
            for (let lod = 0; lod <= 2; lod++) {
                const m = mesh(key, lod), pos = m.geometry.attributes.position.array, index = m.geometry.index.array;
                const cells = LAST >> lod;
                for (let t = 0; t < cells * cells * 6; t += 3) {
                    const [a, b, c] = [index[t], index[t + 1], index[t + 2]];
                    const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2];
                    const vx = pos[c * 3] - pos[a * 3], vy = pos[c * 3 + 1] - pos[a * 3 + 1], vz = pos[c * 3 + 2] - pos[a * 3 + 2];
                    if (uz * vx - ux * vz <= 0) folded++;
                    faces++;
                }
            }
        }
        expect(faces).toBeGreaterThan(400000);
        expect(folded).toBe(0);
    }, 120000);
});

describe('a carved node one node in from a shared edge', () => {
    // Two flat tiles side by side; tile 0,0 has a road node at i = LAST - 1 and the land rises 20 m away from it
    const make = (tx) => {
        const heights = new Float32Array(N * N).fill(1000);
        const zones = new Uint8Array(N * N);
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) heights[j * N + i] = 1000 + 2.5 * Math.abs(tx * LAST + i - (LAST - 1));
        if (tx === 0) for (let j = 0; j < N; j++) zones[j * N + LAST - 1] = WorldData.ZONE.road;
        return { key: `${tx},0`, tx, tz: 0, heights, zones };
    };
    const a = make(0), b = make(1);
    const near = key => ({ '0,0': a, '1,0': b })[key] || null;

    test.each([0, 1, 2])('both tiles draw the edge alike at LOD%i, and a coarser one hangs its skirt to it', lod => {
        const pa = edgeProfile(TerrainMesh.build(a, null, lod, null, near).mesh, lod, 3);
        const pb = edgeProfile(TerrainMesh.build(b, null, lod, null, near).mesh, lod, 2);
        const fine = edgeProfile(TerrainMesh.build(b, null, 0, null, near).mesh, 0, 2);
        for (let m = 0; m <= LAST; m += 0.5) {
            expect(pa.top(m)).toBeCloseTo(pb.top(m), 4);
            // The coarse vertex is held under the road node within its stride: the higher side's skirt reaches the lower
            if (lod > 0) {
                const [hi, lo] = pa.top(m) > fine.top(m) ? [pa, fine] : [fine, pa];
                expect(hi.foot(m)).toBeLessThanOrEqual(lo.top(m) + 1e-4);
            }
        }
    });
});
