/**
 * @jest-environment node
 */
// No hard straight tone line on the land (the owner, 2026-11-28, leg 1 km 4.3: "anything we can do about obvious
// terrain texture seams like this on the left?"). Every stage of every shipped data folder is loaded as the page loads
// it, and every tile the streamer draws at full detail somewhere on the stage (within WorldStreamer.TILE_LOD_M[0] of a
// point of the ride, every 50 m) is coloured as the page colours it (TerrainMesh.colours, its neighbours held as the
// window holds them). Then the colour of the land is read node by node (8 m), as sRGB 0 to 255:
//   a step is two nodes side by side (or one node as the two tiles that share it colour it) whose colours differ by
//     more than STEP: a change of tone the land makes inside one 8 m cell, or at no width at all on a tile's edge,
//     where that cell holds HOLD or more of the change across it and the cell each side (a change spread wider is a
//     gradient, not an edge); both nodes on the land or a bench (road, wall, drop and water keep their own crisp edges)
//   a line is a run of steps across one grid line, node after node (a node in GAP_NODES may have none: a tone line that
//     changes which side is darker still reads as one line), at least LINE_M long: a change of tone along a
//     straight line (the cover's 16 m cells and the tiles' 512 m edges both run north-south and east-west), what reads
//     as a seam and not as nature
// It fails on a line, and lists each by stage, place (x, z), length and the tone across it. KNOWN holds the counts
// that fail today and may only shrink (.agent/system/graphics.md, "No straight seam in the land's colour").
// Each stage is read by this file run in plain node (`node tests/unit/world-land-seams.test.js <stage>` prints its
// lines as JSON), all the stages at once, as many at a time as there are cores.
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadGame } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';
import { stagesFor } from '../helpers/world-stages.js';

// The stages that fail today, each with its exact count of lines. The table may only shrink: a count that rises fails, a
// count that falls fails until the table is brought down to it. Measured 2026-11-28; before the cover blend
// (TerrainMesh.coverWeights), the slope read over 5 nodes and the soft rock and scree, the counts were gotthard-north
// 1598, tremola 922, airolo-lookout 990, lookout-andermatt 1611, andermatt-goeschenen 560, goeschenen-susten 5638,
// susten-gadmen 2335, gadmen-innertkirchen 3187, innertkirchen-guttannen 3453, guttannen-grimsel 872, with a line on
// a tile's edge in every stage (the owner's at airolo-lookout (0, 10968), 56 m, a step of 123). None is on a tile's
// edge now: what is left is the edge of a steep bank's rock over the grass below it, and narrow features of the
// cover (a strip of grass between two woods)
const KNOWN = {
    'gotthard-north': 58,
    'tremola': 81,
    'airolo-lookout': 111,
    'lookout-andermatt': 56,
    'andermatt-goeschenen': 50,
    'goeschenen-susten': 495,
    'susten-gadmen': 218,
    'gadmen-innertkirchen': 445,
    'innertkirchen-guttannen': 510,
    'guttannen-grimsel': 59
};

const STEP = 32;
const HOLD = 0.45;
const LINE_M = 32;
const GAP_NODES = 2;

const SELF = fileURLToPath(import.meta.url);
const worker = process.argv[1] === SELF && process.argv[2];
const game = worker ? loadGame(undefined, []) : null;
const { THREE, WorldEnvironment, WorldStreamer, TerrainMesh, WorldData } = game || {};
const { fetchFn } = diskFetch();

const srgb = v => 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

async function readStage(id) {
    const env = await WorldEnvironment.load(new THREE.Scene(), { id, fetchFn, models: null, digest: async () => '0' });
    const route = env.route, data = env.data, TILE = WorldData.TILE_M, n = WorldData.TILE_N, cell = WorldData.CELL_M;
    const ride = [];
    for (let s = env.startS; s <= env.endS; s += 50) ride.push(route.sample(s, {}));
    // The tiles drawn at full detail somewhere on the stage
    const near = new Set();
    for (const p of ride) {
        const reach = WorldStreamer.TILE_LOD_M[0];
        for (let tx = Math.floor((p.x - reach) / TILE); tx <= Math.floor((p.x + reach) / TILE); tx++) {
            for (let tz = Math.floor((p.z - reach) / TILE); tz <= Math.floor((p.z + reach) / TILE); tz++) {
                if (WorldStreamer.distanceToBox(p.x, p.z, [tx * TILE, tz * TILE, (tx + 1) * TILE, (tz + 1) * TILE]) >= reach) continue;
                near.add(`${tx},${tz}`);
            }
        }
    }
    // Each tile coloured with the tiles round it held, as the window holds them (one at a time: the data holds at most
    // WorldData.MAX_TILES, fewer than a long stage's tiles and their ring)
    const zones = WorldData.ZONE, water = TerrainMesh.COVER_COLORS[7];
    const grids = new Map();
    for (const key of near) {
        const [tx, tz] = key.split(',').map(Number);
        const ring = [];
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) ring.push(`${tx + a},${tz + b}`);
        await Promise.all(ring.map(k => Promise.all([data.ensureTile(k), data.ensureCover(k)]).catch(() => null)));
        const tile = data.tile(key);
        if (tile) grids.set(key, { tile, grid: TerrainMesh.colours(tile, data.cover(key)).slice() });
    }
    const steps = [];
    const colourOf = (g, i, j) => { const at = (j * n + i) * 3; return [srgb(g.grid[at]), srgb(g.grid[at + 1]), srgb(g.grid[at + 2])]; };
    const land = (g, i, j) => {
        const z = g.tile.zones[j * n + i];
        if (z !== zones.terrain && z !== zones.bench) return false;
        const at = (j * n + i) * 3, w = water.map(TerrainMesh.toLinear);
        return Math.abs(g.grid[at] - w[0]) + Math.abs(g.grid[at + 1] - w[1]) + Math.abs(g.grid[at + 2] - w[2]) > 1e-4;
    };
    const diff = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    // The colour at node (i, j) of g, one node past its edge as the tile beside it colours it (null where not drawn)
    const colourAt = (g, i, j) => {
        const last = n - 1, dx = i < 0 ? -1 : i > last ? 1 : 0, dz = j < 0 ? -1 : j > last ? 1 : 0;
        const other = dx || dz ? grids.get(`${g.tile.tx + dx},${g.tile.tz + dz}`) : g;
        return other ? colourOf(other, i - dx * last, j - dz * last) : null;
    };
    for (const g of grids.values()) {
        const bx = g.tile.tx * TILE, bz = g.tile.tz * TILE;
        for (let j = 0; j < n; j++) {
            for (let i = 0; i < n; i++) {
                if (!land(g, i, j)) continue;
                const c = colourOf(g, i, j);
                for (const [di, dj] of [[1, 0], [0, 1]]) {
                    if (i + di >= n || j + dj >= n || !land(g, i + di, j + dj)) continue;
                    const d = diff(c, colourOf(g, i + di, j + dj));
                    if (d <= STEP) continue;
                    // (and the cell holds HOLD of the change across it and the cell each side: a change spread wider is a
                    // gradient, not a line; past the tile's edge the tile beside it is read)
                    const before = colourAt(g, i - di, j - dj), after = colourAt(g, i + 2 * di, j + 2 * dj);
                    if (before && after && d < HOLD * diff(before, after)) continue;
                    steps.push({ x: bx + (i + di / 2) * cell, z: bz + (j + dj / 2) * cell, d, dir: di ? 'x' : 'z' });
                }
                // A node on the tile's east or south edge as the tile beside it colours it
                for (const [di, dj] of [[1, 0], [0, 1]]) {
                    if ((di && i !== n - 1) || (dj && j !== n - 1)) continue;
                    const other = grids.get(`${g.tile.tx + di},${g.tile.tz + dj}`);
                    if (!other) continue;
                    const oi = di ? 0 : i, oj = dj ? 0 : j;
                    if (!land(other, oi, oj)) continue;
                    const d = diff(c, colourOf(other, oi, oj));
                    if (d > STEP) steps.push({ x: bx + i * cell, z: bz + j * cell, d, dir: di ? 'x' : 'z', edge: true });
                }
            }
        }
    }
    // Runs of steps across one grid line: a step between two nodes side by side in x, at the same x, node after node
    // in z (or the other way round) is a straight line along z
    const runs = new Map();
    for (const p of steps) {
        const k = p.dir === 'x' ? `x${p.x}` : `z${p.z}`;
        (runs.get(k) || runs.set(k, []).get(k)).push(p);
    }
    const lines = [];
    for (const list of runs.values()) {
        const along = p => (p.dir === 'x' ? p.z : p.x);
        list.sort((a, b) => along(a) - along(b));
        let first = 0;
        for (let k = 1; k <= list.length; k++) {
            if (k < list.length && along(list[k]) - along(list[k - 1]) <= GAP_NODES * cell + 1e-6) continue;
            const run = list.slice(first, k);
            first = k;
            const length = along(run[run.length - 1]) - along(run[0]) + cell;
            if (length < LINE_M) continue;
            const mid = run[Math.floor(run.length / 2)];
            lines.push({ x: Math.round(mid.x), z: Math.round(mid.z), dir: mid.dir === 'x' ? 'along z' : 'along x', lengthM: length, tone: Math.round(Math.max(...run.map(p => p.d))), edge: run.some(p => p.edge) });
        }
    }
    return { tiles: grids.size, steps: steps.length, lines: lines.sort((a, b) => b.lengthM - a.lengthM) };
}

const list = (stage, found) => found.lines.map(q => `  ${stage} (${q.x}, ${q.z}) ${q.lengthM} m ${q.dir}${q.edge ? ' on a tile edge' : ''}: tone step ${q.tone}`).join('\n');

function readInChild(stage) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [SELF, stage], { stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '', err = '';
        child.stdout.on('data', d => { out += d; });
        child.stderr.on('data', d => { err += d; });
        child.on('error', reject);
        child.on('close', code => {
            if (code !== 0) return reject(new Error(`reading ${stage} failed (exit ${code}):\n${err}`));
            try { resolve(JSON.parse(out.trim().split('\n').pop())); } catch (e) { reject(new Error(`reading ${stage}: no result in its output\n${out}\n${err}`)); }
        });
    });
}

if (worker) {
    readStage(worker).then(found => { process.stdout.write(`${JSON.stringify(found)}\n`, () => process.exit(0)); }, e => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
} else {
    const stages = stagesFor();
    const slots = process.env.HEAVY_CPUS ? Math.max(3, Number(process.env.HEAVY_CPUS)) : Math.max(1, availableParallelism() - 1);
    const results = new Map();
    let next = 0;
    const run = () => {
        if (next >= stages.length) return;
        const stage = stages[next++];
        results.get(stage).start(readInChild(stage).finally(run));
    };
    for (const stage of stages) {
        let start;
        const promise = new Promise((resolve, reject) => { start = p => p.then(resolve, reject); });
        results.set(stage, { promise, start });
    }
    for (let i = 0; i < Math.min(slots, stages.length); i++) run();

    describe.each(stages)('the %s stage: no hard straight tone line on the land', (stage) => {
        let found;
        beforeAll(async () => {
            found = await results.get(stage).promise;
            console.log(`land seams ${stage}: ${found.lines.length} lines (${found.tiles} tiles, ${found.steps} steps)\n${list(stage, found)}`);
        }, 3600000);

        test('no straight seam in the land\'s colour (the table may only shrink)', () => {
            const allowed = KNOWN[stage] || 0;
            if (found.lines.length !== allowed) {
                throw new Error(`${stage}: ${found.lines.length} straight tone lines on the land (the table holds ${allowed}; it may only shrink, so bring it down to what is left)\n${list(stage, found)}`);
            }
            expect(found.lines.length).toBe(allowed);
        });
    });
}
