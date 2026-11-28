/**
 * @jest-environment node
 */
// Where two roads meet or run beside each other, on every stage of every world, each leg ridden the way the menu rides
// it (tests/helpers/world-meets.js reads the drawn triangles round every junction node: the ride's and a side road's
// with another side road, which free roam rides). The rules are the builders' (.agent/system/world.md, "Where two
// roads meet"): no land sunk and no gap between two roads less than 4 m apart, no road edge in the air over it, no hole
// a chase camera sees through, no wall's end standing proud by a mouth, no step where two carriageways meet, no loose
// paving, one set of markings (no line of a road drawn over a carriageway with the right of way over it) and no land in
// a junction's paving.
//
// KNOWN: the junction nodes that fail today, by stage and kind. A count that rises or falls fails, so the table only
// shrinks, and it must end empty; a new world passes with no entry.
import { describe, test, expect, beforeAll } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';
import { ALL_STAGES, stagesFor } from '../helpers/world-stages.js';
import { meetWindow, meetReport, MEET_KINDS } from '../helpers/world-meets.js';

const game = loadGame(undefined, []);
const { THREE, WorldEnvironment } = game;

// The junction nodes of a side road with another side road read: within this of the ride (seen from it, and the first
// ones a rider in free roam meets)
const SIDE_NODE_M = 250;

// (measured when the check was first run, 2026-11-27, on the builders of 4abac70; `proud` again on 2026-11-28 with the
// check reading a wall's end, not the side of its top: every row before was that)
export const KNOWN = Object.freeze({
    'tremola': { bands: 11, ledges: 14, see: 7, steps: 17, holes: 1, overlaps: 23, loose: 11, markings: 20, landIn: 8 },
    'gotthard-north': { bands: 5, ledges: 7, see: 8, steps: 15, overlaps: 9, loose: 12, markings: 9, landIn: 16 },
    'airolo-lookout': { bands: 6, ledges: 9, see: 3, steps: 15, holes: 1, overlaps: 21, loose: 3, markings: 14, landIn: 7 },
    'lookout-andermatt': { bands: 7, ledges: 8, see: 5, proud: 1, steps: 17, overlaps: 10, loose: 12, markings: 10, landIn: 17 },
    'andermatt-goeschenen': { bands: 10, ledges: 6, see: 7, proud: 2, steps: 15, holes: 3, overlaps: 21, loose: 2, markings: 17, landIn: 3 },
    'goeschenen-susten': { bands: 10, ledges: 11, see: 5, steps: 15, overlaps: 35, loose: 2, markings: 35, landIn: 3 },
    'susten-gadmen': { bands: 1, ledges: 2, see: 1, loose: 2 },
    'gadmen-innertkirchen': { bands: 6, ledges: 2, see: 10, steps: 5, overlaps: 2, loose: 6, markings: 2, landIn: 5 },
    'innertkirchen-guttannen': { bands: 2, ledges: 2, see: 1, steps: 1, overlaps: 2, loose: 6, landIn: 3 },
    'guttannen-grimsel': { bands: 5, ledges: 2, see: 6, steps: 6, overlaps: 3, loose: 6, landIn: 8 }
});

const list = (items, n = 12) => items.slice(0, n).map(i => JSON.stringify(i)).join('\n');

for (const stage of stagesFor(ALL_STAGES)) describe(`the ${stage} stage: where two roads meet`, () => {
    let found;
    beforeAll(async () => {
        const { fetchFn } = diskFetch();
        const env = await WorldEnvironment.load(new THREE.Scene(), { id: stage, fetchFn, models: null, digest: async () => '0' });
        env.scenery.buildTile = () => null;
        const data = env.data, route = env.route;
        const nodes = [];
        for (const j of env.graph.junctions) {
            const pass = j.passes[0];
            if (!pass || pass.sIn < env.startS - 1 || pass.sIn > env.endS + 1) continue;
            nodes.push({ node: j.node, s: pass.sIn, ride: true, junction: j.id });
        }
        const rideNodes = new Set(nodes.map(n => n.node));
        const p = {};
        for (let i = 0; i < data.nodes.count; i++) {
            if (data.nodes.degree[i] < 3 || rideNodes.has(i)) continue;
            if (env.graph.edgesAt(i).some(e => e.onRide)) continue;
            const at = route.project(data.nodes.x[i], data.nodes.z[i], null, p);
            if (!at || at.distance > SIDE_NODE_M || at.s < env.startS || at.s > env.endS) continue;
            nodes.push({ node: i, s: at.s, ride: false });
        }
        // (MEET_ONLY=<j12,n345,...> narrows a run to some junctions or nodes, for looking into one)
        const only = process.env.MEET_ONLY ? new Set(process.env.MEET_ONLY.split(',')) : null;
        const store = {};
        for (const n of nodes.sort((a, b) => a.s - b.s)) {
            if (only && !only.has(`n${n.node}`) && !only.has(String(n.junction)) && !only.has(`j${n.junction}`)) continue;
            const s = Math.max(env.startS + 1, Math.min(env.endS - 1, n.s));
            const at = n.ride ? route.sample(s, {}) : { x: data.nodes.x[n.node], y: data.nodes.y[n.node], z: data.nodes.z[n.node] };
            env.update(at, s, null, Infinity);
            await env.streamer.settle(at, s);
            meetWindow(game, env, store, [n]);
        }
        found = meetReport(store);
        console.log(`${stage}: ${found.nodes} junction nodes read; ${MEET_KINDS.map(k => `${k} ${found[k].length}`).join(', ')}\n${MEET_KINDS.filter(k => found[k].length).map(k => `${k}:\n${list(found[k], 40)}`).join('\n')}`);
    }, 3600000);

    test('every kind holds its known count of junction nodes, and no more', () => {
        const known = KNOWN[stage] || {};
        const faults = [];
        for (const kind of MEET_KINDS) if (found[kind].length !== (known[kind] || 0)) faults.push(`${kind}: ${found[kind].length} junction nodes (known ${known[kind] || 0})\n${list(found[kind])}`);
        if (faults.length) throw new Error(faults.join('\n'));
        expect(found.nodes).toBeGreaterThan(0);
    });
});
