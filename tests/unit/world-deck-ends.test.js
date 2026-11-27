/**
 * @jest-environment node
 */
// Every deck ends on land or on a road (.agent/system/world.md, "Structure surfaces and styles"): no side road of a
// stage is a bridge at a dead end, a node no other edge meets that is not on the ride (the importer drops them,
// tools/world/graph.mjs looseKept). Counted from each stage's data, both ways of a leg read alike. KNOWN holds the
// counts of folders imported before that rule and may only shrink; each reaches 0 at its next import.
import { describe, test, expect } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';
import { ALL_STAGES, stagesFor } from '../helpers/world-stages.js';

const game = loadGame(undefined, []);
const { THREE, WorldEnvironment } = game;

const KNOWN = {
    'gotthard-north': 1, 'lookout-andermatt': 1, tremola: 2, 'airolo-lookout': 1,
    'andermatt-goeschenen': 3, 'goeschenen-susten': 3, 'susten-gadmen': 3,
    'gadmen-innertkirchen': 3, 'innertkirchen-guttannen': 3, 'guttannen-grimsel': 3
};

describe('no side road is a bridge that ends in the air', () => {
    for (const id of stagesFor(ALL_STAGES)) {
        test(`${id}: no bridge edge at a dead end`, async () => {
            const { fetchFn } = diskFetch();
            const env = await WorldEnvironment.load(new THREE.Scene(), { id, fetchFn, models: null, digest: async () => '0' });
            const data = env.data, deg = data.nodes.degree, loose = [];
            for (const e of data.edges) {
                if (e.onRide) continue;
                const s = env.graph.samples(e.id);
                if (!s || !(deg[e.a] === 1 || deg[e.b] === 1)) continue;
                // (a dead end on a decked sample: the end row of the edge there is a bridge's)
                const end = [deg[e.a] === 1 ? 0 : -1, deg[e.b] === 1 ? s.flags.length - 1 : -1].filter(i => i >= 0);
                if (end.some(i => s.flags[i] & 2)) loose.push({ edge: e.id, x: Math.round(s.x[0]), z: Math.round(s.z[0]), s: Math.round(env.route.project(s.x[0], s.z[0], null, {}).s) });
            }
            if (loose.length) console.log(id, loose.length, JSON.stringify(loose));
            expect(loose.length).toBeLessThanOrEqual(KNOWN[id] || 0);
        }, 600000);
    }
});
