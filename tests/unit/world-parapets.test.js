/**
 * @jest-environment node
 */
// A retaining wall's parapet runs to the end of its wall. A parapet stood only where its wall dropped PARAPET_DROP_M
// or more and fell to a 0.3 m kerb over its last segment, and the face a wall goes on as past its end (RoadMesh.edgeWorks
// `taper`, up to TAPER_M) never had one: the owner's picture of the hairpin at km 2.4 showed the parapet on the
// hairpin's outer wall stop short and the wall run on past it as a bare coping to its closed end.
//
// Now a wall that carries a parapet anywhere carries it over its whole length, past its end over the face it goes on
// as, at its full height to the wall's closed end, where it ends flush with a face of its own (WorldEnvironment
// .wallRailed, RoadMesh.edgeWorks `wallRailed`). Every road's edge works are streamed in along the whole ride of the
// shipped stage and of the fixture world, and every end of a parapet drawn is read (tests/helpers/world-parapets.js):
// past none of them does its wall's coping go on more than PARAPET_RULES.flushM, but to a structure: a wall's segment
// that meets a bridge or a viaduct keeps no parapet, the structure's own is the guard there (drawn on it, it stood
// 0.2 m off the structure's and higher, a step with faces a hand apart: world-structures `seams`, `coplanar`).
//
// Before (5071858): on the shipped stage the wall went on past 129 of 285 parapet ends to no structure, by up to 40 m
// (the most the check reads); on the fixture world past 44 of 55. After: 0 of 302 and 0 of 50
import { describe, test, expect, beforeAll } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';
import { parapetWindow, parapetReport, PARAPET_RULES } from '../helpers/world-parapets.js';

const game = loadGame(undefined, []);
const { THREE, WorldEnvironment } = game;

const list = (items, n = 12) => items.slice(0, n).map(i => JSON.stringify(i)).join('\n');

async function read(options) {
    const { fetchFn } = diskFetch();
    const env = await WorldEnvironment.load(new THREE.Scene(), { fetchFn, models: null, digest: async () => '0', ...options });
    // Trees and houses are no walls; their building is most of the streaming time
    env.scenery.buildTile = () => null;
    const store = {};
    const W = 300;
    for (let s = env.startS; s < env.endS; s += W) {
        const p = env.route.sample(s + W / 2, {});
        env.update(p, s, null, Infinity);
        await env.streamer.settle(p, s + W / 2);
        parapetWindow(game, env, store);
    }
    return parapetReport(store);
}

for (const [name, options, least] of [['the shipped stage', { id: 'tremola' }, 50], ['the fixture world', { id: 'all', search: '?worldData=tests/fixtures/world/mini' }, 4]]) {
    describe(`${name}: every parapet runs to its wall's end`, () => {
        let report;
        beforeAll(async () => {
            report = await read(options);
            console.log(`parapets (${name}): ${report.ends.length} ends (${report.joints.length} joints inside a parapet, ${report.structure.length} on a wall that goes on to a structure), ${report.short.length} short of their wall's end${report.short.length ? `, the worst by ${report.short[0].pastM} m` : ''}`);
        }, 3600000);

        test('no wall goes on past its parapet\'s end', () => {
            // (the check reads the walls at all: a world with no parapet end would pass by itself)
            expect(report.ends.length).toBeGreaterThanOrEqual(least);
            if (report.short.length) throw new Error(`${report.short.length} parapet ends with the wall's coping going on past them more than ${PARAPET_RULES.flushM} m:\n${list(report.short)}`);
        });
    });
}
