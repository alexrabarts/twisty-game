/**
 * @jest-environment node
 */
// Every house meets the land on its plinth (the owner, 2026-11-27: "that house on the left has no apron. write a test to
// catch that failure case and fix them", and a chalet's uphill corner sunk into the hillside at the Tremola's km 1.9).
// Every stage of every shipped data folder is streamed as the page streams it, every STEP_M of the ride, and every house
// the window may draw there (each candidate of each tile built, Scenery.buildTileSteps, not only the ones the caps chose)
// is read against the drawn land while its tile is resident, every SAMPLE_M over its walls. A house's walls are its
// plinth as its file gives them (the anchors `<house>:walls_min` and `:walls_max`, read here from the file, not from
// the game), placed by the house's own matrix; a hut's are its footprint. It fails where, under the walls:
//   sunk   the land stands more than TOL_M over the plinth's top (a wall, a door or a window in the land);
//   floats the foot of what is drawn there (the footing, else the plinth) stands more than TOL_M over the land;
//   bare   a place under the walls has no footing under it (the footing is narrower than the walls).
// It also counts, for the level pad that is to come, the houses with land more than TOL_M over the plinth's top within
// RING_M outside the walls (`ring`), and fails when that count rises.
// The barn's walls were its plaster, which is only its chimney's (Scenery.wallsOf): it stood on the land under its
// chimney, its uphill corner sunk and its downhill side floating with no footing under it.
// Each stage is read by this file run in plain node (`node tests/unit/house-footing.test.js <stage>` prints its faults
// as JSON), as many at a time as there are cores, as world-road-cover does.
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadGame } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';
import { stagesFor } from '../helpers/world-stages.js';
import { modelStandIns, houseWallBoxes } from '../helpers/world-clearance.js';

// The houses that fail today, by stage and kind. The table may only shrink, and must end empty: a count that rises
// fails, a count that falls fails until the table is brought down to it. `ring` waits for the level pad.
// Measured 2026-11-27 at the runtime fix (Scenery.wallsOf), before the level pads (tools/world/bench.mjs `houses`):
// every house on its plinth, but the land beside an uphill wall over the plinth's top
const KNOWN = {
    'gotthard-north': { ring: 92 },
    'tremola': { ring: 114 },
    'airolo-lookout': { ring: 99 },
    'lookout-andermatt': { ring: 92 },
    'andermatt-goeschenen': { ring: 137 },
    'goeschenen-susten': { ring: 213 },
    'susten-gadmen': { ring: 88 },
    'gadmen-innertkirchen': { ring: 336 },
    'innertkirchen-guttannen': { ring: 195 },
    'guttannen-grimsel': { ring: 57 }
};

const STEP_M = 150;
const SAMPLE_M = 1;
const TOL_M = 0.15;
const RING_M = 1.5;

const root = new URL('../../', import.meta.url);
const SELF = fileURLToPath(import.meta.url);
const worker = process.argv[1] === SELF && process.argv[2];
const game = worker ? loadGame(undefined, []) : null;
const { THREE, WorldEnvironment, WorldStreamer } = game || {};

// Points of the rectangle of plan corners `q` (four [x, z], in order) every SAMPLE_M, its edges included, grown by
// `grow` m on every side
function samples(q, grow = 0) {
    const [a, b, , d] = q;
    const u = [b[0] - a[0], b[1] - a[1]], v = [d[0] - a[0], d[1] - a[1]];
    const lu = Math.hypot(...u), lv = Math.hypot(...v);
    const nu = Math.max(1, Math.ceil((lu + 2 * grow) / SAMPLE_M)), nv = Math.max(1, Math.ceil((lv + 2 * grow) / SAMPLE_M));
    const out = [];
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
        const p = -grow + (lu + 2 * grow) * i / nu, r = -grow + (lv + 2 * grow) * j / nv;
        out.push({ x: a[0] + u[0] / lu * p + v[0] / lv * r, z: a[1] + u[1] / lu * p + v[1] / lv * r, inside: p >= 0 && p <= lu && r >= 0 && r <= lv });
    }
    return out;
}

// Whether (x, z) is inside a footing's rect (Scenery.footing: {x, z, heading, along, across}), `margin` m to spare
function within(rect, x, z, margin) {
    const dx = x - rect.x, dz = z - rect.z, s = Math.sin(rect.heading), c = Math.cos(rect.heading);
    return Math.abs(dx * s + dz * c) <= rect.along / 2 + margin && Math.abs(dx * c - dz * s) <= rect.across / 2 + margin;
}

// The houses of assets/village/houses.glb as the game reads them (one part per material, named as its material, the
// positions in metres), with their walls as Scenery.loadModels gives them: the stand-ins of the other suites are one box
// each, with no material named `wall`, so a fault in how the game finds a house's walls never showed there
function realHouses() {
    const bytes = readFileSync(new URL('assets/village/houses.glb', root));
    const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    const bin = 20 + bytes.readUInt32LE(12) + 8;
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    const SIZE = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
    const READ = { 5120: o => view.getInt8(o), 5121: o => view.getUint8(o), 5122: o => view.getInt16(o, true), 5123: o => view.getUint16(o, true), 5125: o => view.getUint32(o, true), 5126: o => view.getFloat32(o, true) };
    const accessor = (i) => {
        const a = json.accessors[i], v = json.bufferViews[a.bufferView];
        const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type], size = SIZE[a.componentType], stride = v.byteStride || n * size;
        const base = bin + (v.byteOffset || 0) + (a.byteOffset || 0), out = new Float64Array(a.count * n);
        for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) out[k * n + c] = READ[a.componentType](base + k * stride + c * size);
        return out;
    };
    const places = new Map(json.nodes.filter(n => n.mesh === undefined && n.name).map(n => [n.name, new THREE.Vector3().fromArray(n.translation || [0, 0, 0])]));
    const materials = new Map();
    const out = [];
    for (const node of json.nodes) {
        if (node.mesh === undefined || !node.name.startsWith('house_') || node.name.includes(':')) continue;
        const unit = node.scale ? node.scale[0] : 1;
        const parts = json.meshes[node.mesh].primitives.map((prim) => {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(accessor(prim.attributes.POSITION), v => v * unit), 3));
            if (prim.indices !== undefined) geometry.setIndex(Array.from(accessor(prim.indices)));
            const name = json.materials[prim.material].name;
            if (!materials.has(name)) materials.set(name, Object.assign(new THREE.MeshBasicMaterial(), { name }));
            return { geometry, material: materials.get(name) };
        });
        out.push({ name: node.name, parts, wallBox: game.Scenery.wallBoxOf ? game.Scenery.wallBoxOf(places, node.name) : null });
    }
    return out.sort((p, q) => p.name.localeCompare(q.name));
}

async function readStage(id) {
    const { fetchFn } = diskFetch();
    const boxes = houseWallBoxes(readFileSync, root);
    const models = { ...modelStandIns(THREE, readFileSync, root), houses: realHouses() };
    const env = await WorldEnvironment.load(new THREE.Scene(), { id, fetchFn, models, digest: async () => '0' });
    const seen = new Set();
    const rows = [];
    const p3 = new THREE.Vector3();
    const audit = (c) => {
        const home = c.home, m = c.matrix;
        let q, plinthTop, plinthFoot;
        const box = boxes.get(home.name);
        if (box) {
            q = [[box.x0, box.z0], [box.x1, box.z0], [box.x1, box.z1], [box.x0, box.z1]].map(([x, z]) => { p3.set(x, 0, z).applyMatrix4(m); return [p3.x, p3.z]; });
            p3.set(0, box.y1, 0).applyMatrix4(m); plinthTop = p3.y;
            p3.set(0, box.y0, 0).applyMatrix4(m); plinthFoot = p3.y;
        } else {
            // A hut (or a wall block): a unit cube drawn at its footprint, its walls from its floor
            q = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].map(([x, z]) => { p3.set(x, 0, z).applyMatrix4(m); return [p3.x, p3.z]; });
            plinthTop = plinthFoot = c.foot.floor;
        }
        let sunk = -Infinity, floats = -Infinity, bare = 0, ring = -Infinity, known = 0;
        for (const p of samples(q, RING_M)) {
            const land = env.ground.tileHeight(p.x, p.z);
            if (land === null || !Number.isFinite(land)) continue;
            if (!p.inside) { ring = Math.max(ring, land - plinthTop); continue; }
            known++;
            sunk = Math.max(sunk, land - plinthTop);
            const footed = c.foot && within(c.foot.rect, p.x, p.z, 0.05);
            if (!footed) bare++;
            floats = Math.max(floats, (footed ? Math.min(c.foot.bottom, plinthFoot) : plinthFoot) - land);
        }
        const r = v => Math.round(v * 100) / 100;
        const s = Math.round(env.route.project(c.x, c.z, null, {}).s);
        rows.push({ name: home.name, x: r(c.x), z: r(c.z), s, known, sunkM: r(sunk), floatM: r(floats), bare, ringM: r(ring) });
    };
    for (let s = env.startS; s <= env.endS + STEP_M / 2; s += STEP_M) {
        const p = env.route.sample(Math.min(s, env.endS), {});
        env.lastBike = { x: p.x, z: p.z };
        await env.streamer.settle({ x: p.x, z: p.z }, s);
        env.streamClockMs += 2 * WorldStreamer.DISPOSE_AFTER_MS;
        await env.streamer.settle({ x: p.x, z: p.z }, s);
        for (const held of env.scenery.perTile.values()) {
            for (const c of (held.candidates && held.candidates.houses) || []) {
                const key = `${c.home.name}|${c.x.toFixed(2)},${c.z.toFixed(2)}`;
                if (seen.has(key)) continue;
                seen.add(key);
                audit(c);
            }
        }
    }
    return rows;
}

function faults(rows) {
    return {
        sunk: rows.filter(r => r.sunkM > TOL_M),
        floats: rows.filter(r => r.floatM > TOL_M),
        bare: rows.filter(r => r.bare > 0),
        ring: rows.filter(r => r.ringM > TOL_M)
    };
}

const list = (stage, kind, found) => found.map(r => `  ${stage} ${kind} ${r.name} at (${r.x}, ${r.z}) s ${r.s}: land over the plinth ${r.sunkM} m, foot over the land ${r.floatM} m, ${r.bare} of ${r.known} points with no footing, land ${r.ringM} m over the plinth within ${RING_M} m`).join('\n');

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
    // (exit once the whole result is written: a pipe takes a stage's thousand houses in several writes)
    readStage(worker).then(rows => { process.stdout.write(`${JSON.stringify(rows)}\n`, () => process.exit(0)); }, e => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
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

    describe.each(stages)('the %s stage: every house on its plinth', (stage) => {
        let rows, found;
        beforeAll(async () => {
            rows = await results.get(stage).promise;
            found = faults(rows);
            console.log(`house footing ${stage}: ${rows.length} houses, ${Object.entries(found).map(([k, v]) => `${k} ${v.length}`).join(', ')}\n${Object.entries(found).map(([k, v]) => list(stage, k, v)).filter(Boolean).join('\n')}`);
        }, 3600000);

        test('its houses were read', () => {
            expect(rows.every(r => r.known > 0)).toBe(true);
        });

        test.each(['sunk', 'floats', 'bare', 'ring'])('no house %s (the table may only shrink)', (kind) => {
            const allowed = (KNOWN[stage] || {})[kind] || 0;
            if (found[kind].length !== allowed) {
                throw new Error(`${stage}: ${found[kind].length} houses ${kind} (the table holds ${allowed}; it may only shrink, so bring it down to what is left)\n${list(stage, kind, found[kind])}`);
            }
            expect(found[kind].length).toBe(allowed);
        });
    });
}
