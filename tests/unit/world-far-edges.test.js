/**
 * @jest-environment node
 */
// No far road hangs over a cleft (the owner, 2026-11-26, after the walk of leg 3: the far ribbons of the Schöllenen's
// stack of hairpins floated 27 m over the land). A road section drawn coarser than full detail (WorldStreamer.ROAD_LOD_M:
// 400 m and more from the bike) stands over tiles drawn coarser too, and a coarse tile is drawn lower than the land at
// full detail where two legs share one of its cells (TerrainMesh.vertexY). Every stage of every data folder is
// streamed as the page streams it, the bike put down every WALK_M, and every edge of every section held at level 1 or
// 2 is read as `world-floating` reads it (tools/terrain-check.mjs, floatingWalk), but at the rows and edges the section
// draws (its ribbon's sides: the probe reads the rows RoadMesh.decimate keeps of all the rows, and a section keeps more
// round a wall's end and a mouth, so its rows and the section's differ): 5 cm out from the drawn edge, the land as its
// tile is drawn there; where the road stands more
// than TOL_M over it, and over every road drawn under the edge, three rays from under the road, out across the edge at
// a fifth, a half and four fifths of the gap, must each meet the edge works (`road-works`, `road-side`), 5 cm either way of the row. An edge one ray
// misses is open: the cleft under it is seen from afar. Rows within two of a structure's are not read (a deck has no
// works under its edge). Each pair of levels (the section's, the tile's) is read once at each row and side.
// A place is a run of open edges of one side with no gap over GAP_M along the ride. Each stage is read in a plain node
// process, the stages side by side, as tests/unit/world-road-cover.test.js does (jest's module sandbox ran the same
// streaming ten times slower).
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadGame } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';
import { stagesFor } from '../helpers/world-stages.js';

// The stages with open far edges today, each with its exact count of places. The table may only shrink, and must end
// empty: a count that rises fails, and one that falls fails until the table is brought down to it
// Measured 2026-11-26 with the far slope's rule (WorldEnvironment.edgeFoot `far`); before it: 674 places, 16 086 open
// edges, the worst 37.6 m (susten-gadmen); after it 509 places, 913 edges
const KNOWN = {
    'tremola': 54,
    'summit-airolo': 38,
    'gotthard-north': 72,
    'lookout-andermatt': 75,
    'hospental-summit': 41,
    'airolo-lookout': 36,
    'andermatt-goeschenen': 31,
    'goeschenen-susten': 90,
    'susten-gadmen': 72
};

const WALK_M = 1000;
const TOL_M = 0.3;
const GAP_M = 24;

const SELF = fileURLToPath(import.meta.url);
const worker = process.argv[1] === SELF && process.argv[2];
const game = worker ? loadGame(undefined, []) : null;
const { fetchFn } = diskFetch();

async function readStage(id) {
    const { THREE, WorldEnvironment, TerrainMesh, WorldData, RoadMesh, RoadSurface } = game;
    const env = await WorldEnvironment.load(new THREE.Scene(), { id, fetchFn, models: null, digest: async () => '0' });
    env.scenery.buildTile = () => null;
    const route = env.route;
    const ray = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    const drawnLand = (x, z) => {
        const held = env.tileMeshes.get(`${Math.floor(x / WorldData.TILE_M)},${Math.floor(z / WorldData.TILE_M)}`);
        return held ? { y: TerrainMesh.drawnAt(held.mesh, x, z), lod: held.mesh.userData.lod } : null;
    };
    const meshes = (group, test) => { const out = []; group.traverse(o => { if (o.isMesh && test(o)) out.push(o); }); return out; };
    const seen = new Set(), open = [];
    // (the stage's own road and the run to its stop: a folder of several stages holds the others too)
    const span = [env.startS, Math.min(route.length, env.endS + 200)];
    for (let s = env.startS; s < env.endS + WALK_M / 2; s += WALK_M) {
        const at = Math.min(env.endS, s);
        const c = route.sample(at, {});
        env.update(c, at, null, Infinity);
        await env.streamer.settle(c, at);
        const roads = [...meshes(env.roadGroup, o => o.name === 'road-ribbon' || o.name === 'road-side'), ...meshes(env.sideGroup, o => o.name === 'road-ribbon' || o.name === 'road-side')];
        const skirts = [...meshes(env.roadGroup, o => o.name === 'road-works' || o.name === 'road-side'), ...meshes(env.sideGroup, o => o.name === 'road-works' || o.name === 'road-side')];
        for (const m of [...roads, ...skirts]) m.updateMatrixWorld(true);
        for (const [index, held] of env.streamer.roads) {
            if (held.lod === 0) continue;
            const group = env.roadMeshes.get(index);
            const sides = group && group.userData.sides;
            if (!sides) continue;
            const [from, to] = sides.draw || [0, sides.length - 1];
            for (let k = from; k <= to; k++) {
                const row = sides[k];
                if (!Number.isFinite(row.s) || row.s < span[0] || row.s > span[1]) continue;
                // (a structure's row and the rows beside it: a deck has no works under its edge)
                if ([k - 1, k, k + 1].some(j => sides[j] && (sides[j].bits & 7))) continue;
                const outs = RoadMesh.outward(row);
                for (const key of ['l', 'r']) {
                    const e = row[key], o = outs[key], side = key === 'l' ? -1 : 1;
                    const roadY = e[1];
                    const out = { x: e[0] + o[0] * 0.05, z: e[2] + o[1] * 0.05 };
                    const land = drawnLand(out.x, out.z);
                    if (!land) continue;
                    const id = `${Math.round(row.s * 10)}:${key}:${held.lod}:${land.lod}`;
                    if (seen.has(id)) continue;
                    seen.add(id);
                    const gap = roadY - land.y;
                    if (gap <= TOL_M) continue;
                    // Another road drawn under the edge (a junction, a road below) is ground too
                    ray.set(new THREE.Vector3(out.x, roadY + 0.3, out.z), down);
                    ray.far = gap + 0.3;
                    const under = ray.intersectObjects(roads, false).find(hit => hit.point.y < roadY - 0.01);
                    const top = under ? Math.max(land.y, under.point.y) : land.y;
                    if (roadY - top <= TOL_M) continue;
                    const dir = new THREE.Vector3(o[0], 0, o[1]);
                    ray.far = 0.6 + 1.6 * (roadY - top);
                    // (5 cm either way along the road from the row: on the row's own line a ray runs along the edge two
                    // pieces of slope share, and misses both on a rounding)
                    const along = [-o[1] * 0.05, o[0] * 0.05];
                    const missed = [0.2, 0.5, 0.8].some(f => [-1, 1].some(w => {
                        ray.set(new THREE.Vector3(e[0] - o[0] * 0.5 + along[0] * w, roadY - (roadY - top) * f, e[2] - o[1] * 0.5 + along[1] * w), dir);
                        return !ray.intersectObjects(skirts, false).length;
                    }));
                    if (missed) open.push({ s: row.s, side, roadLod: held.lod, landLod: land.lod, gapM: roadY - top });
                }
            }
        }
    }
    return places(open);
}


// Open edges as places: one side, along the ride with no gap over GAP_M
function places(open) {
    const out = [];
    for (const side of [-1, 1]) {
        let cur = null;
        for (const e of open.filter(q => q.side === side).sort((a, b) => a.s - b.s)) {
            if (cur && e.s - cur.s1 <= GAP_M) { cur.s1 = e.s; cur.edges++; cur.gapM = Math.max(cur.gapM, e.gapM); cur.lods.add(`${e.roadLod}/${e.landLod}`); }
            else { cur = { side: side < 0 ? 'left' : 'right', s0: e.s, s1: e.s, edges: 1, gapM: e.gapM, lods: new Set([`${e.roadLod}/${e.landLod}`]) }; out.push(cur); }
        }
    }
    return out.sort((a, b) => a.s0 - b.s0).map(q => ({ ...q, s0: Math.round(q.s0), s1: Math.round(q.s1), gapM: Math.round(q.gapM * 100) / 100, lods: [...q.lods].sort().join(' ') }));
}

const list = (stage, found) => found.map(q => `  ${stage} s ${q.s0}-${q.s1} ${q.side}: ${q.edges} open edges, up to ${q.gapM} m over the land (road/land levels ${q.lods})`).join('\n');

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

    describe.each(stages)('the %s stage: no far road hangs over a cleft', (stage) => {
        let found;
        beforeAll(async () => {
            found = await results.get(stage).promise;
            console.log(`far edges ${stage}: ${found.length} places\n${list(stage, found)}`);
        }, 3600000);

        test('every edge of a coarser section meets the land as drawn under it, or its works close the gap (the table may only shrink)', () => {
            const allowed = KNOWN[stage] || 0;
            if (found.length !== allowed) {
                throw new Error(`${stage}: ${found.length} places where a coarser section's edge hangs open over the land (the table holds ${allowed}; it may only shrink, so bring it down to what is left)\n${list(stage, found)}`);
            }
            expect(found.length).toBe(allowed);
        });
    });
}
