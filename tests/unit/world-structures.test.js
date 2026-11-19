/**
 * @jest-environment node
 */
// No road's structures stand in a carriageway, and every structure is one continuous surface that no other surface
// shares a plane with. The Tremola slice is streamed in node and every structure drawn in each window is read
// (tests/helpers/world-structures.js):
//   - a deck, pier, parapet, retaining wall, wall end, apron or barrier box of one road standing in the drawn
//     carriageway of another (or of the ride) by more than 5 cm, between 5 cm and the headroom over that road's surface;
//     and a wall the physics makes on a side road's stub that no barrier makes there
//   - two corners of one road's structures more than 2.5 cm and less than 25 cm apart: a step or a gap where two pieces
//     laid per segment meet instead of one swept surface
//   - two drawn triangles (road ribbons and structures) in one plane, within 2 cm, overlapping: z-fighting
//
// Before Carriageways (js/world/roadmesh.js) a side road's walls, parapets, deck and piers were laid over its first
// metres, which lie on the ride's carriageway at a junction, and structures stood in a carriageway everywhere (a
// side road's wall ends and parapets across the ride at the Bedrína junction, km 1.3; a pier of the Gotthard road's
// bridge on the ride's centre line at km 5.1). Its parapets were level boxes, one a segment, stepping on every grade,
// and a side road with a road-closed stub was drawn twice over the stub's 60 m, deck and parapets included.
//
// What still stands, and is held here so it can only shrink (the committed head before the fix, 78aeeec: 3781
// intrusions, 3477 seams, 8258 coplanar pairs):
//   - 32 triangles: aprons a few centimetres into the ride's carriageway on the inside of held bends, a side road's
//     underpass at km 6.5 under another side road, and the ride's walls between two of its own legs. (The ride's wall
//     across the stub at the Bedrina junction, km 1.27, is gone: the ride has no wall at a side road's mouth, and the
//     physics reads the walls the ride's plan draws, WorldEnvironment.walledAt.) The ride's works never move for
//     another leg of the ride: the physics reads its verge as ground and its wall as a wall
//   - 7 seams of retaining walls where the walls of two legs of the ride meet in a hairpin (km 7.8, 7.9, 9.0, 9.4,
//     10.9 and 11.0)
//   - 277 coplanar pairs, between two side roads that leave one node (their ribbons, held under the ride, under its
//     ribbon) and between the structures of two side roads at one node (near km 0.4 and 0.7)
import { describe, test, expect, beforeAll } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';
import { structureWindow, structureSeams, coplanarOverlaps } from '../helpers/world-structures.js';

const LIMIT = { intrusions: 32, physics: 0, seams: 7, coplanar: 277 };

const game = loadGame(undefined, []);
const { THREE, WorldEnvironment } = game;

const list = (items, n = 12) => items.slice(0, n).map(i => JSON.stringify(i)).join('\n');

describe('the Tremola slice: structures keep out of every carriageway and are continuous', () => {
    let env;
    const sweep = { triangles: 0, intrusions: [], physics: [], seams: [], coplanar: [], seamCount: 0, coplanarCount: 0 };
    beforeAll(async () => {
        const { fetchFn } = diskFetch();
        env = await WorldEnvironment.load(new THREE.Scene(), { id: 'tremola', fetchFn, models: null, digest: async () => '0' });
        // Trees and houses are not structures of a road; their building is most of the streaming time
        env.scenery.buildTile = () => null;
        const seen = { structures: new Set(), seams: new Set(), coplanar: new Set() };
        const done = { structures: new Set(), seams: new Set(), coplanar: new Set() };
        // A window every 800 m: the side chunks stay resident within 1.2 km of the bike, the ride's sections from 1 km
        // behind to 3 km ahead, so every structure is resident in one window at least
        const W = 800;
        for (let s = env.startS; s < env.endS; s += W) {
            const p = env.route.sample(s + W / 2, {});
            env.update(p, s, null, Infinity);
            await env.streamer.settle(p, s + W / 2);
            env.barrierStep = null;
            env.updateBarriers(s + W / 2);
            const r = structureWindow(game, env, { seen: seen.structures, done: done.structures });
            sweep.triangles += r.triangles;
            sweep.intrusions.push(...r.all);
            sweep.physics.push(...r.physics);
            const seams = structureSeams(game, env, { seen: seen.seams, done: done.seams });
            sweep.seamCount += seams.pairs;
            sweep.seams.push(...seams.worst);
            const flat = coplanarOverlaps(game, env, { seen: seen.coplanar, done: done.coplanar });
            sweep.coplanarCount += flat.pairs;
            sweep.coplanar.push(...flat.worst);
        }
        sweep.intrusions.sort((a, b) => b.depthM - a.depthM);
        console.log(`structures: ${sweep.triangles} triangles, ${sweep.intrusions.length} in a carriageway, ${sweep.physics.length} stub walls, ${sweep.seamCount} seams, ${sweep.coplanarCount} coplanar pairs`);
    }, 3600000);

    test('the structures of the whole slice were read', () => {
        expect(sweep.triangles).toBeGreaterThan(30000);
    });

    test('no structure stands in another road\'s carriageway, and no deck passes over one under the headroom', () => {
        if (sweep.intrusions.length > LIMIT.intrusions) throw new Error(`${sweep.intrusions.length} structure triangles in a carriageway (at most ${LIMIT.intrusions}), deepest first:\n${list(sweep.intrusions)}`);
    });

    test('no wall the physics makes stands on a side road\'s stub but its barrier', () => {
        if (sweep.physics.length > LIMIT.physics) throw new Error(`${sweep.physics.length} wall points on a stub (at most ${LIMIT.physics}):\n${list(sweep.physics)}`);
    });

    test('every deck, parapet and wall is one swept surface: no step or gap between its segments', () => {
        if (sweep.seamCount > LIMIT.seams) throw new Error(`${sweep.seamCount} corners 2.5 to 25 cm from a neighbour's (at most ${LIMIT.seams}):\n${list(sweep.seams)}`);
    });

    test('no two drawn surfaces share a plane where they overlap', () => {
        if (sweep.coplanarCount > LIMIT.coplanar) throw new Error(`${sweep.coplanarCount} coplanar overlapping pairs (at most ${LIMIT.coplanar}):\n${list(sweep.coplanar)}`);
    });
});
