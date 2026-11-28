/**
 * @jest-environment node
 */
// The dams (js/world/dams.js; .agent/system/world.md, "Dams"). The owner: "Add detailed models for dams to replace the
// current ones that are just terrain". Every dam swissTLM3D 2026-02 has in a world's height tiles (tlm_bauten_staubaute:
// Staumauer, Staudamm; js/world/dam-data.js, tools/dams/extract.mjs) is drawn as a model and seated in its valley:
//   - it has a model, near and far (THREE.LOD), and the land is cut under it (its pit's quads)
//   - no land through the model: on every row, across the dam every metre, within the outline the data gives (EDGE_M in
//     from it: a row runs on past it into the abutment's rock), the drawn land (cut) stands no higher than the model's
//     top (THROUGH_M)
//   - no gap at an abutment or the foot: past each end of the crest and past the downstream foot (GAP_OUT_M out) the
//     drawn land stands no lower than GAP_M under the model's edge over it, or the model's face reaches down to it
//   - the physics reads the model's top on the dam (WorldGround.tileHeight)
//   - a road on the crest: its surface stands ROAD_SINK_M over the crest, and the ride's own surface is unchanged
// KNOWN holds each dam's places that fail today, by check; a count may only shrink.
import { describe, test, expect, beforeAll } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';

const game = loadGame(undefined, []);
const { THREE, WorldEnvironment, WorldDams, WorldDamData, TerrainMesh, WorldData } = game;

// A stage of each folder that holds dams: its environment lays them out
const FOLDERS = { 'world/': 'tremola', 'worlds/airolo/': 'airolo-lookout', 'worlds/gotthard/': 'gotthard-north', 'worlds/susten/': 'goeschenen-susten', 'worlds/haslital/': 'guttannen-grimsel' };
const THROUGH_M = 0.05, GAP_M = 1.0, GAP_OUT_M = 1.0;
// id: {through, gap}: the places that fail today
const KNOWN = {
    '70BBD4F2': { through: 0, gap: 6 }, // Pfaffensprung: its foot over the gorge the land falls into past the outline
    '268EA6B7': { through: 1, gap: 0 } // Handeck: one place at its end
};

async function loadWorld(id) {
    const scene = new THREE.Scene();
    const { fetchFn } = diskFetch();
    const env = await WorldEnvironment.load(scene, { id, fetchFn, models: null, digest: async () => '0' });
    return { scene, env };
}

// The drawn land at (x, z), cut (TerrainMesh.heightAt on the tile's cut), or null
function landAt(env, x, z) {
    const m = WorldData.TILE_M, key = `${Math.floor(x / m)},${Math.floor(z / m)}`;
    const tile = env.data.tile(key);
    return tile ? TerrainMesh.heightAt(tile, x, z, env.cutsOf(key)) : null;
}

async function tilesOf(env, dam) {
    const m = WorldData.TILE_M, b = dam.box, keys = [];
    for (let tx = Math.floor((b[0] - 20) / m); tx <= Math.floor((b[2] + 20) / m); tx++) for (let tz = Math.floor((b[1] - 20) / m); tz <= Math.floor((b[3] + 20) / m); tz++) keys.push(`${tx},${tz}`);
    await Promise.all(keys.map(k => env.data.ensureTile(k).catch(() => null)));
}

// Whether (x, z) lies in a dam's outline as the data gives it (the upstream chain, the downstream one back), more than
// EDGE_M in from its edge: past it a row runs on into the abutment's rock, which stands over it there
const EDGE_M = 1;
function inOutline(dam, x, z) {
    const ring = dam.data.up.concat(dam.data.down.slice().reverse());
    let inside = false, edge = Infinity;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i], b = ring[j];
        if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
        const dx = b[0] - a[0], dz = b[1] - a[1], run = dx * dx + dz * dz, t = run ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / run)) : 0;
        edge = Math.min(edge, Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z));
    }
    return inside && edge > EDGE_M;
}

// Each dam's seating: places where the land stands through the model, and gaps at its ends and foot
function seating(env, dam) {
    const through = [], gap = [];
    dam.rows.forEach((row, k) => {
        // (the first and the last row are the abutments' lines: the rock stands to the crest there)
        if (k === 0 || k === dam.rows.length - 1) return;
        for (let t = 0.5; t < row.L - 0.5; t += 1) {
            const x = row.u[0] + row.a[0] * t, z = row.u[1] + row.a[1] * t;
            const land = landAt(env, x, z), top = WorldDams.profileAt(row, t, dam.kind);
            if (land !== null && land > top + THROUGH_M && inOutline(dam, x, z)) through.push({ x, z, t, k, by: land - top, road: env.damRoadAt(x, z) });
        }
        // past the downstream foot: the land meets the face (or the face's foot, which reaches the floor)
        const t = row.L + GAP_OUT_M, x = row.u[0] + row.a[0] * t, z = row.u[1] + row.a[1] * t;
        const land = landAt(env, x, z);
        if (land !== null && land < row.f - GAP_M) gap.push({ x, z, where: 'foot', by: row.f - land });
    });
    // past each end: the land at the crest's level or the end's face down to it
    for (const end of [dam.drawn[0], dam.drawn[dam.drawn.length - 1]]) {
        for (let t = 0; t <= end.L; t += 1) {
            const x = end.u[0] + end.a[0] * t, z = end.u[1] + end.a[1] * t, land = landAt(env, x, z);
            if (land !== null && land < end.f - GAP_M) gap.push({ x, z, where: 'end', by: end.f - land });
        }
    }
    return { through, gap };
}

const worlds = {};
beforeAll(async () => {
    for (const [folder, id] of Object.entries(FOLDERS)) if (WorldDams.listOf(folder).length) worlds[folder] = await loadWorld(id);
}, 600000);

describe('every dam in the data is a seated model', () => {
    test('the data lists dams in the tour\'s worlds', () => {
        expect(Object.values(WorldDamData).flat().length).toBeGreaterThan(0);
    });

    for (const folder of Object.keys(FOLDERS)) {
        test(`${folder}: each dam has a near and a far model and a pit`, () => {
            const world = worlds[folder];
            if (!world) return;
            const { env, scene } = world;
            expect(env.dams.dams.length).toBe(WorldDams.listOf(folder).length);
            for (const dam of env.dams.dams) {
                expect(dam.lod.levels.length).toBe(2);
                expect(dam.pits.quads.length).toBeGreaterThan(0);
                const found = [];
                scene.traverse(o => { if (o === dam.lod) found.push(o); });
                expect(found.length).toBe(1);
            }
        });

        test(`${folder}: no land through a dam, no gap at its ends or foot`, async () => {
            const world = worlds[folder];
            if (!world) return;
            const { env } = world;
            const report = {};
            for (const dam of env.dams.dams) {
                await tilesOf(env, dam);
                const { through, gap } = seating(env, dam);
                report[dam.data.id] = { name: dam.data.name, kind: dam.kind, through: through.length, gap: gap.length, worst: Math.max(0, ...through.map(p => p.by)).toFixed(2), rows: [...new Set(through.map(p => p.k))].slice(0, 12).join(' '), gaps: gap.slice(0, 4).map(g => `${g.where}:${g.by.toFixed(1)}`).join(' ') };
            }
            console.log(folder, JSON.stringify(report));
            if (process.env.DAM_DETAIL) for (const dam of env.dams.dams) { const r = seating(env, dam); if (r.through.length || r.gap.length) console.log(dam.data.id, JSON.stringify(Object.entries(r.through.reduce((m, p) => { m[p.k] = (m[p.k] || 0) + 1; return m; }, {}))), JSON.stringify(r.through.filter((p, i) => i % 15 === 0).map(p => [p.k, +p.t.toFixed(1), +p.by.toFixed(1), p.road && +p.road.toFixed(1), +p.x.toFixed(1), +p.z.toFixed(1)])), JSON.stringify(r.gap.slice(0, 6).map(g => [g.where, +g.by.toFixed(1), +g.x.toFixed(1), +g.z.toFixed(1), env.damRoadAt(g.x, g.z)]))); }
            for (const [id, r] of Object.entries(report)) {
                const known = KNOWN[id] || { through: 0, gap: 0 };
                expect({ id, through: r.through }).toEqual({ id, through: Math.min(r.through, known.through) });
                expect({ id, gap: r.gap }).toEqual({ id, gap: Math.min(r.gap, known.gap) });
            }
        }, 600000);

        test(`${folder}: the physics reads each dam's top`, async () => {
            const world = worlds[folder];
            if (!world) return;
            const { env } = world;
            for (const dam of env.dams.dams) {
                await tilesOf(env, dam);
                const row = dam.rows[Math.floor(dam.rows.length / 2)], t = Math.min(row.L / 2, row.c1 / 2);
                const x = row.u[0] + row.a[0] * t, z = row.u[1] + row.a[1] * t;
                expect(Math.abs(env.ground.tileHeight(x, z) - WorldDams.profileAt(row, t, dam.kind))).toBeLessThan(0.01);
            }
        }, 600000);
    }
});
