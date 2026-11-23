/**
 * @jest-environment node
 */
// Every junction of the Tremola slice as it is drawn (tests/helpers/world-junctions.js reads the drawn triangles of
// every side road that leaves the ride, with the bike put down at its junction):
//   1. the side road meets the ride: no step and no hole in its surface from the node out to 40 m, no land over it
//   2. no deck or parapet of the side road in its mouth (the first 12 m past the ride's edge)
//   3. no edge of the side road hangs open over the ground in its mouth
//   4. the side road and the ride are one surface in the mouth: nothing drawn over the side road (the ground under the
//      ride's verge, the ride's verge where its shader draws it, the land), and no gap under the line between the two
//      where they lie beside each other at one height
//
// Before the side roads were made to meet the ride (8fa83fe): 8 of the 26 side roads had a step of 0.23 to 0.81 m
// where they left the ride's band, 2 had land over them there, 3 left the ride on a deck and 13 had an open edge.
// The importer gives each road its own heights, so at the edge of the ride's band the two differ by up to a metre;
// a side road along a bank stood on a concrete deck from the junction on, a pier in the ride's own bank; and a side
// road's edge up to 2.5 m over the land had nothing under it.
//
// The rules that hold these at none are the builders' own, for any world (.agent/system/world.md, "A side road
// meets the ride"): WorldEnvironment.holdSide and sideHold (height), RoadMesh.sideStructures (no deck in a mouth
// or along a hillside), WorldEnvironment.edgeFoot `fill` (a slope under a mouth's edge) and wallJoins.
import { describe, test, expect, beforeAll } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';
import { junctionWindow, junctionReport, JUNCTION_LIMITS } from '../helpers/world-junctions.js';

const game = loadGame(undefined, []);
const { THREE, WorldEnvironment, WorldGround } = game;

const list = (items, n = 12) => items.slice(0, n).map(i => JSON.stringify(i)).join('\n');

describe('the Tremola slice: every side road meets the ride', () => {
    let env, found;
    const physics = [];
    beforeAll(async () => {
        const { fetchFn } = diskFetch();
        env = await WorldEnvironment.load(new THREE.Scene(), { id: 'tremola', fetchFn, models: null, digest: async () => '0' });
        env.scenery.buildTile = () => null;
        const store = {};
        for (const junction of env.graph.junctions) {
            const s = Math.max(env.startS + 1, Math.min(env.endS - 1, junction.passes[0].sIn));
            const p = env.route.sample(s, {});
            env.update(p, s, null, Infinity);
            await env.streamer.settle(p, s);
            junctionWindow(game, env, store, p, { nearM: 80 });
            // The physics rides a side road as it is drawn: its height along the road's centre line has no step either
            for (const { edgeId } of junction.incident) {
                if (env.data.edges[edgeId].onRide) continue;
                const { rows } = env.graph.chainFrom(edgeId, junction.node, 40);
                let last = null;
                for (let d = 0; rows.length > 1 && d <= rows[rows.length - 1].run; d += 0.5) {
                    let k = 0;
                    while (k + 2 < rows.length && rows[k + 1].run < d) k++;
                    const a = rows[k], b = rows[k + 1], t = Math.max(0, Math.min(1, (d - a.run) / ((b.run - a.run) || 1)));
                    const y = env.ground.groundY(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, null);
                    if (last !== null && Number.isFinite(y) && Math.abs(y - last) > 0.2) physics.push({ junction: junction.id, edge: edgeId, d, stepM: Math.round((y - last) * 100) / 100 });
                    if (Number.isFinite(y)) last = y;
                }
            }
        }
        found = junctionReport(store);
        console.log(`junctions: ${found.roads} side roads at ${found.junctions} junctions, ${found.samples} places; ${found.steps.length} with a step, ${found.holes.length} with a hole, ${found.sunk.length} under the land, ${found.decks.length} on a deck in the mouth, ${found.open.length} with an open edge; ${physics.length} steps in the physics ground`);
    }, 3600000);

    test('every side road of every junction was read', () => {
        const sides = env.graph.junctions.reduce((n, j) => n + j.incident.filter(i => !env.data.edges[i.edgeId].onRide).length, 0);
        expect(found.roads).toBe(sides);
        expect(found.samples).toBeGreaterThan(200 * found.roads);
    });

    test('a side road meets the ride: no step, no hole, no land over it', () => {
        if (found.steps.length > JUNCTION_LIMITS.steps) throw new Error(`${found.steps.length} side roads with a step in their surface:\n${list(found.steps)}`);
        if (found.holes.length > JUNCTION_LIMITS.holes) throw new Error(`${found.holes.length} side roads with a hole in their surface:\n${list(found.holes)}`);
        if (found.sunk.length > JUNCTION_LIMITS.sunk) throw new Error(`${found.sunk.length} side roads with land over their surface:\n${list(found.sunk)}`);
    });

    test('no deck or parapet starts in a junction', () => {
        if (found.decks.length > JUNCTION_LIMITS.decks) throw new Error(`${found.decks.length} side roads with a deck or parapet in their mouth:\n${list(found.decks)}`);
    });

    test('no edge of a side road hangs open in its mouth', () => {
        if (found.open.length > JUNCTION_LIMITS.open) throw new Error(`${found.open.length} side roads whose edge hangs open in their mouth:\n${list(found.open)}`);
    });

    test('the side road and the ride are one surface in the mouth: nothing drawn over the side road, no gap between the two', () => {
        const faults = [];
        if (found.strips.length > JUNCTION_LIMITS.strips) faults.push(`${found.strips.length} side roads with land, laid ground or the ride's verge drawn over them in their mouth:\n${list(found.strips)}`);
        if (found.pits.length > JUNCTION_LIMITS.pits) faults.push(`${found.pits.length} side roads with a gap under the line between them and the ride beside them:\n${list(found.pits)}`);
        if (faults.length) throw new Error(faults.join('\n'));
    });

    test('no ground a road lays stands as a face beside the other road in a mouth', () => {
        if (found.cliffs.length > JUNCTION_LIMITS.cliffs) throw new Error(`${found.cliffs.length} side roads with a face of laid ground beside the other road in their mouth:\n${list(found.cliffs)}`);
    });

    test('no wall of the ride stands across a side road\'s mouth, drawn or in the physics', () => {
        if (found.walls.length > JUNCTION_LIMITS.walls) throw new Error(`${found.walls.length} side roads with the ride's wall drawn across their mouth:\n${list(found.walls)}`);
        if (found.blocked.length > JUNCTION_LIMITS.blocked) throw new Error(`${found.blocked.length} side roads whose mouth the physics shuts with the ride's wall:\n${list(found.blocked)}`);
    });

    test('the physics ground has no step along a side road either', () => {
        if (physics.length) throw new Error(`${physics.length} steps in the physics ground along a side road:\n${list(physics)}`);
        expect(WorldGround).toBeDefined();
    });
});

describe('the synthetic fixture world: no wall of the ride stands across a side road\'s mouth', () => {
    let found;
    beforeAll(async () => {
        const env = await WorldEnvironment.load(new THREE.Scene(), { id: 'all', search: '?worldData=tests/fixtures/world/mini', fetchFn: diskFetch().fetchFn, models: null, digest: async () => '0' });
        env.scenery.buildTile = () => null;
        const store = {};
        for (const junction of env.graph.junctions) {
            const s = Math.max(env.startS + 1, Math.min(env.endS - 1, junction.passes[0].sIn));
            const p = env.route.sample(s, {});
            env.update(p, s, null, Infinity);
            await env.streamer.settle(p, s);
            junctionWindow(game, env, store, p, { nearM: 80 });
        }
        found = junctionReport(store);
    }, 3600000);

    test('its side roads were read, and none is shut by the ride\'s wall, drawn or in the physics', () => {
        expect(found.roads).toBeGreaterThan(0);
        expect(found.walls).toEqual([]);
        expect(found.blocked).toEqual([]);
        expect(found.cliffs).toEqual([]);
    });
});
