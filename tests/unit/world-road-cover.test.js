/**
 * @jest-environment node
 */
// No land covers the road (the owner, 2026-11-26: "create a test for terrain covering the road"). Every stage of every
// shipped data folder, each as the menu rides it (a leg ridden against its folder's stage too), is streamed as the page
// streams it, and the ride is read every STEP_M: across the carriageway and PAST_M past each edge, every ACROSS_M.
// At each place the drawn road is the road's surface at that row, RoadMesh.LIFT_M over its height (the ribbon, or past
// the edge the verge, which lies at the road's height for RoadSurface.VERGE_M; past a bridge's edge nothing is read),
// and it fails where any land drawn there stands more than TOL_M over it:
//   lod0  the tile as the page builds it at full detail (cut to the walls, laid back, clipped to the tubes: the mesh
//         the streamer holds, read on its own triangles);
//   lod1  the same tile one level coarser, built as the page builds it there (WorldEnvironment.buildTile: its sink under
//         the ride and its tubes' clip), wherever some point of the stage's ride stands where the streamer draws that
//         tile at level 1 (WorldStreamer.TILE_LOD_M);
//   far   the far grid drawn under the tiles (Horizon, as built and clipped to the tubes).
// It also fails where the physics ground under the carriageway (drawnY) and the drawn ribbon ('road-ribbon') differ by
// more than TOL_M.
// TOL_M is 2 cm: the ribbon is drawn RoadMesh.LIFT_M (2 cm) over the road and the land under a road is sunk
// TerrainMesh.SINK_M (12 cm) under it, so land that stands over the ribbon at all has broken that rule; 2 cm leaves room
// for float error over the 1 to 3 km coordinates and no more. A place is skipped for the land only where the road is
// inside a tunnel's or a gallery's box (WorldEnvironment.tubeRoofY is finite there: the box the tube's clip cuts the
// land to; a box in front of a portal does not count, the land there must be carved).
// A place is a run of faults of one kind along the ride with no gap over GAP_M: the failure lists each by stage, kind,
// s range, side and the most the land (or the physics) stands over the drawn road, as a work list.
// Each stage is read by this file run in plain node (`node tests/unit/world-road-cover.test.js <stage>` prints its
// places as JSON), all the stages at once, as many at a time as there are cores: the same streaming under jest's module
// sandbox ran ten times slower (140 s against 13 s for leg 3's 6.4 km), and the stages are independent.
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadGame } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';
import { stagesFor } from '../helpers/world-stages.js';

// The stages that fail today, each with its exact count of places. The table may only shrink, and must end empty: a
// count that rises fails, a count that falls fails until the table is brought down to it. No other way passes a stage.
// Measured 2026-11-26 (lod0, lod1, far, physics places in each). No stage has land of a tile over its road, and with the
// far grid sunk at the stride it is drawn at none has the far grid over it (worlds/susten: 3, 17 and 5 places before):
// the physics 2 to 3 cm off the ribbon down the Tremola is what is left
const KNOWN = {
    'tremola': 11, // 0, 0, 0, 11
    'airolo-lookout': 2 // 0, 0, 0, 2
};

const STEP_M = 2;
const ACROSS_M = 0.5;
const PAST_M = 0.5;
const TOL_M = 0.02;
const GAP_M = 10;
const WINDOW_M = 300;

const SELF = fileURLToPath(import.meta.url);
const worker = process.argv[1] === SELF && process.argv[2];
const game = worker ? loadGame(undefined, []) : null;
const { THREE, WorldEnvironment, WorldStreamer, TerrainMesh, WorldData } = game || {};
const { fetchFn } = diskFetch();

// Triangles of a mesh in plan, hashed by `cell` m: ys(x, z) gives the height of each triangle over (x, z)
const grids = new Map();
function gridOf(mesh, cell) {
    const id = `${mesh.geometry.uuid}:${cell}`;
    if (grids.has(id)) return grids.get(id);
    mesh.updateMatrixWorld(true);
    const pos = mesh.geometry.attributes.position, index = mesh.geometry.index, m = mesh.matrixWorld;
    const count = index ? index.count : pos.count, v = new THREE.Vector3();
    const tris = [], hash = new Map();
    for (let i = 0; i + 2 < count; i += 3) {
        const t = new Float64Array(9);
        for (let k = 0; k < 3; k++) { v.fromBufferAttribute(pos, index ? index.getX(i + k) : i + k).applyMatrix4(m); t[k * 3] = v.x; t[k * 3 + 1] = v.y; t[k * 3 + 2] = v.z; }
        // (an upright face, a skirt or a cut's closing face, has no height of its own over a point)
        if (Math.abs((t[3] - t[0]) * (t[8] - t[2]) - (t[6] - t[0]) * (t[5] - t[2])) < 1e-6) continue;
        const ref = tris.push(t) - 1;
        for (let cx = Math.floor(Math.min(t[0], t[3], t[6]) / cell); cx <= Math.floor(Math.max(t[0], t[3], t[6]) / cell); cx++) {
            for (let cz = Math.floor(Math.min(t[2], t[5], t[8]) / cell); cz <= Math.floor(Math.max(t[2], t[5], t[8]) / cell); cz++) {
                const h = cx * 1048576 + cz;
                (hash.get(h) || hash.set(h, []).get(h)).push(ref);
            }
        }
    }
    const grid = {
        // The highest triangle over (x, z) under `below`, or -Infinity
        top(x, z, below = Infinity) {
            let best = -Infinity;
            for (const ref of hash.get(Math.floor(x / cell) * 1048576 + Math.floor(z / cell)) || []) {
                const t = tris[ref];
                const d = (t[5] - t[8]) * (t[0] - t[6]) + (t[6] - t[3]) * (t[2] - t[8]);
                const a = ((t[5] - t[8]) * (x - t[6]) + (t[6] - t[3]) * (z - t[8])) / d, b = ((t[8] - t[2]) * (x - t[6]) + (t[0] - t[6]) * (z - t[8])) / d, c = 1 - a - b;
                if (a < -1e-9 || b < -1e-9 || c < -1e-9) continue;
                const y = a * t[1] + b * t[4] + c * t[7];
                if (y < below && y > best) best = y;
            }
            return best;
        }
    };
    grids.set(id, grid);
    return grid;
}

const meshes = (group, test) => { const out = []; group.traverse(o => { if (o.isMesh && test(o)) out.push(o); }); return out; };

async function readStage(id) {
    grids.clear();
    const env = await WorldEnvironment.load(new THREE.Scene(), { id, fetchFn, models: null, digest: async () => '0' });
    env.scenery.buildTile = () => null;
    const route = env.route, TILE = WorldData.TILE_M;
    const [near1, far1] = WorldStreamer.TILE_LOD_M;
    // The ride's points of the stage, every 50 m: a tile is read at level 1 where one of them stands where the streamer
    // draws the tile at level 1
    const ridePts = [];
    for (let s = env.startS; s <= env.endS; s += 50) ridePts.push(route.sample(s, {}));
    const lod1Seen = new Map();
    const showsLod1 = key => {
        if (!lod1Seen.has(key)) {
            const [tx, tz] = key.split(',').map(Number), box = [tx * TILE, tz * TILE, (tx + 1) * TILE, (tz + 1) * TILE];
            lod1Seen.set(key, ridePts.some(p => { const d = WorldStreamer.distanceToBox(p.x, p.z, box); return d >= near1 && d < far1; }));
        }
        return lod1Seen.get(key);
    };
    const lod1 = new Map();
    const lod1Grid = key => {
        if (!lod1.has(key)) {
            const tile = env.data.tile(key);
            // As WorldEnvironment.buildTile builds a tile at level 1
            const built = tile ? TerrainMesh.build(tile, null, 1, (x, y, z) => {
                const low = env.rideSurfaceAt(x, z, y);
                return low === null ? y : Math.min(y, low - TerrainMesh.SINK_M);
            }, env.nearTile, null, env.tubesNear(key)) : null;
            lod1.set(key, built ? gridOf(built.mesh, 8) : null);
            if (built) built.mesh.geometry.dispose();
        }
        return lod1.get(key);
    };
    const faults = [];
    const loc = {};
    for (let w = env.startS; w < env.endS; w += WINDOW_M) {
        const c = route.sample(Math.min(env.endS, w + WINDOW_M / 2), {});
        env.update(c, w + WINDOW_M / 2, null, Infinity);
        await env.streamer.settle(c, w + WINDOW_M / 2);
        const ribbons = meshes(env.roadGroup, o => o.name === 'road-ribbon').map(o => gridOf(o, 4));
        const far = env.horizon ? gridOf(env.horizon, 16) : null;
        for (let s = w; s < Math.min(env.endS, w + WINDOW_M); s += STEP_M) {
            const p = route.sample(s, {});
            const k = route.indexAt(s);
            const half = p.width / 2, cos = Math.cos(p.heading), sin = Math.sin(p.heading);
            for (let o = -(half + PAST_M); o <= half + PAST_M + 1e-6; o += ACROSS_M) {
                const x = p.x + o * cos, z = p.z - o * sin;
                env.ground.locate(x, z, { start: k - 2, end: k + 3 }, loc);
                const road = env.ground.drawnY(loc);
                const fault = (kind, overM) => faults.push({ s, o, kind, overM });
                // The physics under the carriageway against the ribbon drawn there (read 0.1 m in from the edge line)
                if (Math.abs(o) <= half - 0.1) {
                    let ribbon = -Infinity;
                    for (const g of ribbons) ribbon = Math.max(ribbon, g.top(x, z, road + 1));
                    if (ribbon > road - 1 && Math.abs(ribbon - road) > TOL_M) fault('physics', ribbon - road);
                    else if (ribbon <= road - 1) fault('physics', -1);
                }
                // The land is read against the road's own surface at that row, `RoadMesh.LIFT_M` over its height: across the
                // carriageway the ribbon, and past the edge the verge, laid at the road's height for VERGE_M (1.1 m). Past a
                // bridge's edge there is no verge, only the deck's side, so the land there is not read. (Read against drawnY,
                // a place past a bridge's edge, or one on the edge line that locate put a hair outside it, read the valley
                // floor as the road: the coarser land over the finer land there was counted as land over the road.)
                const surface = loc.roadY + game.RoadMesh.LIFT_M;
                if (Math.abs(o) > half && loc.flags && loc.flags.bridge) continue;
                if (Number.isFinite(env.tubeRoofY(x, z, surface))) continue;
                const key = `${Math.floor(x / TILE)},${Math.floor(z / TILE)}`;
                const held = env.tileMeshes.get(key);
                // (land is read up to the tube's roof height over the road: a road under a bridge or a stacked leg has land
                // far over it that is not on it)
                const roof = surface + 6.5;
                if (held) {
                    const y = gridOf(held.mesh, 8).top(x, z, roof);
                    if (y > surface + TOL_M) fault('lod0', y - surface);
                }
                if (showsLod1(key)) {
                    const g = lod1Grid(key);
                    const y = g ? g.top(x, z, roof) : -Infinity;
                    if (y > surface + TOL_M) fault('lod1', y - surface);
                }
                if (far) {
                    const y = far.top(x, z, roof);
                    if (y > surface + TOL_M) fault('far', y - surface);
                }
            }
        }
    }
    return places(faults);
}

// Faults as places: one kind, along the ride with no gap over GAP_M
function places(faults) {
    const out = [];
    for (const kind of ['lod0', 'lod1', 'far', 'physics']) {
        let cur = null;
        for (const f of faults.filter(q => q.kind === kind).sort((a, b) => a.s - b.s)) {
            if (cur && f.s - cur.s1 <= GAP_M) { cur.s1 = f.s; cur.n++; if (Math.abs(f.overM) > Math.abs(cur.overM)) cur.overM = f.overM; cur.sides.add(Math.sign(f.o)); }
            else { cur = { kind, s0: f.s, s1: f.s, n: 1, overM: f.overM, sides: new Set([Math.sign(f.o)]) }; out.push(cur); }
        }
    }
    return out.map(q => ({ kind: q.kind, s0: Math.round(q.s0), s1: Math.round(q.s1), side: q.sides.has(0) || (q.sides.has(-1) && q.sides.has(1)) ? 'across' : q.sides.has(-1) ? 'left' : 'right', overM: Math.round(q.overM * 100) / 100, points: q.n }));
}

const list = (stage, found) => found.map(q => `  ${stage} ${q.kind} s ${q.s0}-${q.s1} ${q.side}: ${q.kind === 'physics' ? 'ribbon less physics' : 'land over the road'} ${q.overM} m (${q.points} points)`).join('\n');

// One stage read in a child node process: its places, or the child's error
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
    readStage(worker).then(found => { process.stdout.write(`${JSON.stringify(found)}\n`); process.exit(0); }, e => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
} else {
    const stages = stagesFor();
    // A stage to a core: under heavy the cores its node class reserves (3) or HEAVY_CPUS if more, else all but one
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

    describe.each(stages)('the %s stage: no land covers the road', (stage) => {
        let found;
        beforeAll(async () => {
            found = await results.get(stage).promise;
            console.log(`road cover ${stage}: ${found.length} places\n${list(stage, found)}`);
        }, 3600000);

        test('no place where land stands over the drawn road, or the physics leaves the ribbon (the table may only shrink)', () => {
            const allowed = KNOWN[stage] || 0;
            if (found.length !== allowed) {
                throw new Error(`${stage}: ${found.length} places where land covers the road or the physics leaves the ribbon (the table holds ${allowed}; it may only shrink, so bring it down to what is left)\n${list(stage, found)}`);
            }
            expect(found.length).toBe(allowed);
        });
    });
}
