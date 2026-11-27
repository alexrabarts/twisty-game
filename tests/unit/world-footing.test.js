// No building stands in water, and every building meets the land. The Tremola slice is ridden in node with the streamer;
// every house and landmark is gathered as it is built, and its plan (1 m samples, the eaves included) is read against
// the land as TerrainMesh draws it: a triangle shows water where a vertex of it is water (tests/helpers/world-footing.js).
// What meets the land (a footing, else the body) may stand no more than FOOT_TOLERANCE_M over the land at any corner,
// and the land no more than that over the floor (the model's y 0, its door sill). The Gotthard Hospiz stood wholly in
// the summit lake: it was put beside the finish on the side the lake is, and the land was never read.
import { describe, test, expect, beforeAll } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { loadGame } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';
import { modelStandIns } from '../helpers/world-clearance.js';
import { rideAndGather } from '../helpers/world-clearance-run.js';
import { buildingsOf, auditFooting, modelPlinths, wetAt, FOOT_TOLERANCE_M } from '../helpers/world-footing.js';

const root = new URL('../../', import.meta.url);
const game = loadGame();
const { THREE } = game;

const list = rows => rows.map(r => `${r.name} at (${r.x}, ${r.z}) s ${r.s}: wet ${r.wetShare}, float ${r.floatM} m, buried ${r.buriedM} m`).join('\n');

describe('the Tremola slice: buildings on dry land, meeting the ground', () => {
    let env, rows, buildings, things;
    beforeAll(async () => {
        const { fetchFn } = diskFetch();
        const gathered = await rideAndGather(game, { fetchFn, stepM: 100, models: modelStandIns(THREE, readFileSync, root) });
        env = gathered.env;
        things = gathered.things;
        buildings = buildingsOf(things, { plinthOf: modelPlinths(readFileSync, root) });
        rows = auditFooting(game, env.data, env.ground, buildings).map(r => ({ ...r, s: Math.round(env.route.project(r.x, r.z, null, {}).s) }));
    }, 300000);

    test('houses and the landmark were placed and measured', () => {
        expect(rows.filter(r => r.type === 'house').length).toBeGreaterThan(40);
        expect(rows.filter(r => r.type === 'landmark').map(r => r.name)).toEqual(['landmark:Gotthard Hospiz']);
        expect(rows.every(r => r.wetShare !== null && Number.isFinite(r.floatM) && Number.isFinite(r.buriedM))).toBe(true);
    });

    test('the check sees the summit lake as water', () => {
        // Lago di San Carlo at the Gotthard summit (swissTLM3D), where the Hospiz stood
        expect(wetAt(game, env.data, -1945, 7968)).toBe(true);
        expect(wetAt(game, env.data, -1880, 7870)).toBe(false);
    });

    test('no building or landmark stands on drawn water', () => {
        const wet = rows.filter(r => r.wet);
        if (wet.length) throw new Error(`${wet.length} buildings stand on water:\n${list(wet)}`);
    });

    test(`no corner floats more than ${FOOT_TOLERANCE_M} m over the land, and no floor is sunk more than that under it`, () => {
        const bad = rows.filter(r => r.floats || r.buries).sort((p, q) => Math.max(q.floatM, q.buriedM) - Math.max(p.floatM, p.buriedM));
        if (bad.length) throw new Error(`${bad.length} buildings do not meet the land:\n${list(bad.slice(0, 20))}`);
    });

    test('every building stands on its own footing, in stone, reaching up into its walls; no footing stands alone', () => {
        // The walls' stone, or (since 0f20e16, a house that fades in and out) its own copy of it that fades with the
        // house (Scenery.footingMaterial): both are the stone, patched as the walls are
        const stone = [game.RoadMesh.stoneMaterial(), game.Scenery.footingMaterial()];
        const footings = things.filter(t => t.name === 'houses:footing' || t.name.endsWith(':footing'));
        expect(footings.length).toBe(rows.length);
        expect(footings.filter(f => !stone.includes(f.material)).map(f => f.name)).toEqual([]);
        expect(buildings.orphans).toEqual([]);
        const bare = rows.filter(r => !r.footing || r.gapM > 0);
        if (bare.length) throw new Error(`${bare.length} buildings without a footing under their walls:\n${list(bare)}`);
    });

    test('no building is a bare box: a small one is a hut, a big mapped wall a block of stone', () => {
        const names = [...new Set(things.filter(t => t.type === 'house').map(t => t.name))];
        expect(names.filter(n => n === 'houses:plain_house')).toEqual([]);
        // The plain box of old was untextured beige; a hut has its timber walls and a slate roof
        for (const t of things.filter(t => t.name === 'houses:plain_hut')) expect(t.material.color.getHex()).not.toBe(0xb8aa94);
    });

    test('the Hospiz stands beside the summit, its front to the ride', () => {
        const hospiz = rows.find(r => r.type === 'landmark');
        const l = env.data.manifest.landmarks.find(m => m.name === 'Gotthard Hospiz');
        expect(Math.hypot(hospiz.x - l.x, hospiz.z - l.z)).toBeLessThan(120);
        expect(Math.abs(hospiz.s - l.s)).toBeLessThan(160);
    });
});
