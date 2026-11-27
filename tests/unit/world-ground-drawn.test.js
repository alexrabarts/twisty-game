/**
 * @jest-environment node
 */
// The physics stands on what is drawn across the ride's verge and a wall's coping (tests/helpers/world-ground-drawn.js):
// each built leg is streamed every 300 m and every point where the height the bike stands at differs from the surface
// drawn there by more than 0.2 m is a place. world-fairness reads only the wall and fall zones the physics makes, so a
// step under a wall's rise, the physics on a coping past a wall's end that the drawing never laid (leg 5 s 37 555,
// 0.5 m over the verge: WorldEnvironment.taperAt now reads the taper RoadMesh.edgeWorks lays), passed as verge.
// KNOWN holds the places each stage has today (2026-11-27), as exact counts that may only shrink: steps of 0.2 to 0.5 m,
// most at a wall's end (the coping's band against the end drawn) or where the drawn verge stands a little over the
// physics; `node tools/world/debug/ground-drawn.mjs <stage>` lists them.
import { describe, test, beforeAll } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';
import { groundDrawnWindow, groundDrawnReport } from '../helpers/world-ground-drawn.js';
import { stagesFor } from '../helpers/world-stages.js';

const KNOWN = {
    tremola: 6,
    'gotthard-north': 7,
    'airolo-lookout': 9,
    'lookout-andermatt': 8,
    'andermatt-goeschenen': 5,
    'goeschenen-susten': 2,
    'susten-gadmen': 0,
    'gadmen-innertkirchen': 3,
    'innertkirchen-guttannen': 2,
    'guttannen-grimsel': 9
};

const game = loadGame(undefined, []);
const { THREE, WorldEnvironment } = game;

describe.each(stagesFor())('the %s stage: the physics stands on the surface drawn across the verge', (stage) => {
    let report;
    beforeAll(async () => {
        const { fetchFn } = diskFetch();
        const env = await WorldEnvironment.load(new THREE.Scene(), { id: stage, fetchFn, models: null, digest: async () => '0' });
        env.scenery.buildTile = () => null;
        const store = {}, W = 300;
        for (let s = env.startS; s < env.endS; s += W) {
            const at = Math.min(env.endS - 1, s + W / 2), p = env.route.sample(at, {});
            env.update(p, at, null, Infinity);
            await env.streamer.settle(p, at);
            groundDrawnWindow(game, env, store, s, Math.min(s + W, env.endS));
            store.grids.clear();
        }
        report = groundDrawnReport(store);
        console.log(`ground drawn (${stage}): ${report.length} places`);
    }, 3600000);

    test('no place where the physics stands off the drawn surface, beyond the stage\'s known count', () => {
        const known = KNOWN[stage] || 0;
        const list = report.slice(0, 12).map(r => JSON.stringify(r)).join('\n');
        if (report.length > known) throw new Error(`${report.length} places (at most ${known}), worst first:\n${list}`);
        if (report.length < known) throw new Error(`${report.length} places, under the table's ${known}: bring KNOWN down to it`);
    });
});
