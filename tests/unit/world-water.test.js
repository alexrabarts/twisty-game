// The lakes' water (js/world/water.js). Held here, on tiles built in memory:
//   - a tile with no water node has no water; one with a lake has a surface over every water node, never under the
//     land drawn there, level across a lake whose nodes differ by less than LEVEL_STEP_M, and a stream keeps its fall
//   - the ring of land nodes round the water stands at the water's level with no cover (the edge fades out there)
//   - the depth grows from the shore inward; deep water is drawn in blocks, so a large lake costs few triangles
//   - two tiles that share an edge draw the same water at it (the same heights, depth and edge)
//   - a dam's upstream face (Dams.faces, optional) is no shore: the water is deep up to it, and the table is read
//     in the dams' own shape ({face, water})
//   - the wave texture is the same on every page and repeats without a seam
//   - every level of the effect row is a level of the water, and 'off' draws none
// The browser probe world-water (tools/terrain-check.mjs) takes the pictures and the frame time.
import { describe, test, expect } from '@jest/globals';
import { loadScript, realThree } from '../helpers/load-game.js';

const THREE = realThree();
const { WorldData } = new Function(`${loadScript('world/data.js')}\nreturn { WorldData };`)();
const Water = new Function('THREE', 'WorldData', 'LandShade', `${loadScript('world/water.js')}\nreturn Water;`)(THREE, WorldData, undefined);
const { Effects } = new Function('THREE', `${loadScript('effects.js')}\nreturn { Effects };`)({ ShaderChunk: { lights_fragment_begin: THREE.ShaderChunk.lights_fragment_begin }, Vector3: THREE.Vector3 });

const N = WorldData.TILE_N, CELL = WorldData.CELL_M, M = WorldData.TILE_M, ZW = WorldData.ZONE.water;

// A tile at (tx, tz): land rising from `base` away from a lake round world (lx, lz) of radius lr, whose nodes stand at
// `base` plus a ripple of up to `spread` m (the elevation model's noise over a lake)
function tile(tx, tz, { base = 2100, lake = [256, 256, 120], spread = 0.6, stream = null } = {}) {
    const heights = new Float32Array(N * N), zones = new Uint8Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const x = tx * M + i * CELL, z = tz * M + j * CELL;
        const r = Math.hypot(x - lake[0], z - lake[1]);
        const k = j * N + i;
        if (r < lake[2]) {
            zones[k] = ZW;
            heights[k] = base + spread * (0.5 + 0.5 * Math.sin(x * 0.37 + z * 0.21));
        } else heights[k] = base + 1 + (r - lake[2]) * 0.3;
        if (stream && Math.abs(x - stream) < 6 && z > 300) {
            zones[k] = ZW;
            heights[k] = base - (z - 300) * 0.4;
        }
    }
    return { key: `${tx},${tz}`, tx, tz, heights, zones };
}

// The surface's vertex at tile node (i, j), or null
function vertexAt(surface, i, j) {
    const p = surface.positions;
    for (let v = 0; v < p.length / 3; v++) {
        if (Math.abs(p[v * 3] - i * CELL) < 1e-3 && Math.abs(p[v * 3 + 2] - j * CELL) < 1e-3) return { y: p[v * 3 + 1], depth: surface.water[v * 2], edge: surface.water[v * 2 + 1] };
    }
    return null;
}

describe('the surface of a tile', () => {
    test('no water node, no water', () => {
        expect(Water.surface(tile(0, 0, { lake: [-5000, -5000, 10] }))).toBeNull();
    });

    test('every water node is under the water, and a lake is level', () => {
        const t = tile(0, 0);
        const s = Water.surface(t);
        expect(s).not.toBeNull();
        const levels = [];
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
            const k = j * N + i;
            if (t.zones[k] !== ZW) continue;
            // (a node inside a block of deep water is no vertex: the block's quad stands over it)
            const v = vertexAt(s, i, j);
            if (!v) continue;
            expect(v.y).toBeGreaterThanOrEqual(t.heights[k]);
            levels.push(v.y);
        }
        // Each node takes the highest water within LEVEL_REACH nodes: inside the lake the spread falls to a few cm
        const level = Water.levelOf(s.levels);
        expect(level.flat).toBe(true);
        const inner = levels.filter(y => Math.abs(y - level.y) < 0.2).length;
        expect(inner / levels.length).toBeGreaterThan(0.6);
    });

    test('the ring of land round the lake stands at the water\'s level, with no cover', () => {
        const t = tile(0, 0);
        const s = Water.surface(t);
        let rings = 0;
        for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
            const k = j * N + i;
            if (t.zones[k] === ZW) continue;
            const v = vertexAt(s, i, j);
            if (!v) continue;
            rings++;
            expect(v.edge).toBe(0);
            expect(v.depth).toBe(0);
            expect(v.y).toBeGreaterThan(2100);
            expect(v.y).toBeLessThan(2100 + 0.7);
        }
        expect(rings).toBeGreaterThan(20);
    });

    test('a stream keeps its fall', () => {
        const t = tile(0, 0, { lake: [-5000, -5000, 10], stream: 200 });
        const s = Water.surface(t);
        expect(s).not.toBeNull();
        const level = Water.levelOf(s.levels);
        expect(level.flat).toBe(false);
        const ys = s.levels;
        expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(50);
    });

    test('the depth grows from the shore, and deep water is drawn in blocks', () => {
        const t = tile(0, 0, { lake: [256, 256, 400] });
        const s = Water.surface(t);
        const shore = vertexAt(s, 32, 32 - Math.floor(390 / CELL));
        const middle = vertexAt(s, 32, 32);
        expect(middle.depth).toBeGreaterThan(0.9);
        expect(middle.edge).toBe(1);
        if (shore) expect(shore.depth).toBeLessThan(middle.depth);
        // A lake that fills most of the tile: far fewer triangles than a cell each
        expect(s.index.length / 3).toBeLessThan((N - 1) * (N - 1) * 2 * 0.5);
    });

    test('the water is deep up to a dam\'s face, and a shore without one is shallow', () => {
        // A lake that fills the tile to a straight shore at z = 400 m: the dam stands on that shore
        const heights = new Float32Array(N * N), zones = new Uint8Array(N * N);
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
            const k = j * N + i, z = j * CELL;
            if (z < 400) { zones[k] = ZW; heights[k] = 1900; } else heights[k] = 1930;
        }
        const t = { key: '0,0', tx: 0, tz: 0, heights, zones };
        const dam = [{ points: [[-100, 400], [700, 400]], level: 1900 }];
        const shore = vertexAt(Water.surface(t, () => null, []), 32, 49);
        const held = vertexAt(Water.surface(t, () => null, dam), 32, 49);
        expect(shore.depth).toBeLessThan(0.5);
        expect(held.depth).toBeGreaterThan(0.9);
        expect(held.edge).toBe(1);
        // a dam whose level is another lake's changes nothing
        const other = vertexAt(Water.surface(t, () => null, [{ ...dam[0], level: 1800 }]), 32, 49);
        expect(other.depth).toBeCloseTo(shore.depth, 6);
        // Dams.faces as js/world/dams.js publishes it
        global.Dams = { faces: [{ id: '0a1b2c3d', face: [[-100, 400], [700, 400]], water: 1900, crest: 1910 }] };
        try {
            expect(Water.dams()).toEqual([{ points: [[-100, 400], [700, 400]], level: 1900 }]);
            expect(vertexAt(Water.surface(t), 32, 49).depth).toBeCloseTo(held.depth, 6);
        } finally {
            delete global.Dams;
        }
    });

    test('two tiles draw the same water at the edge they share', () => {
        const lake = [512, 256, 150];
        const a = tile(0, 0, { lake }), b = tile(1, 0, { lake });
        const near = from => (dx, dz) => (from.tx + dx === 1 && from.tz + dz === 0 ? b : from.tx + dx === 0 && from.tz + dz === 0 ? a : null);
        const sa = Water.surface(a, near(a)), sb = Water.surface(b, near(b));
        let shared = 0;
        for (let j = 0; j < N; j++) {
            const va = vertexAt(sa, N - 1, j), vb = vertexAt(sb, 0, j);
            // a land node of the ring is drawn only by the tile whose water touches it, and a node on the side of a block
            // of deep water is no vertex (the block's quad runs past it)
            if (!va || !vb) continue;
            expect(va.y).toBeCloseTo(vb.y, 4);
            expect(va.depth).toBeCloseTo(vb.depth, 4);
            expect(va.edge).toBeCloseTo(vb.edge, 4);
            shared++;
        }
        expect(shared).toBeGreaterThan(20);
    });
});

describe('the waves', () => {
    test('the texture is the same every time and repeats without a seam', () => {
        const n = 64;
        const a = Water.waveField(n), b = Water.waveField(n);
        expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
        // The step across the wrap is no larger than the steps inside the texture
        let inside = 0, wrap = 0;
        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n - 1; x++) inside = Math.max(inside, Math.abs(a[(y * n + x) * 4 + 2] - a[(y * n + x + 1) * 4 + 2]));
            wrap = Math.max(wrap, Math.abs(a[(y * n + n - 1) * 4 + 2] - a[(y * n) * 4 + 2]));
        }
        expect(wrap).toBeLessThanOrEqual(inside);
    });

    test('every level of the effect row is a level of the water, and off draws none', () => {
        const row = Effects.byId('water');
        expect(row).not.toBeNull();
        for (const level of row.levels) expect(level in Water.LEVELS).toBe(true);
        expect(Water.LEVELS.off).toBeNull();
        // A lower level never draws more than a higher one
        const looks = row.levels.slice(1).map(level => Water.LEVELS[level]);
        for (let k = 1; k < looks.length; k++) {
            expect(looks[k].octaves).toBeGreaterThanOrEqual(looks[k - 1].octaves);
            expect(Number(looks[k].planar)).toBeGreaterThanOrEqual(Number(looks[k - 1].planar));
        }
    });
});
