// The trees a world window draws are not traded away for detail elsewhere. The scenery's triangle cap
// (Scenery.TRIANGLE_CAP) holds the trees, the houses and the boulders together, and where it holds (the Tremola's
// first kilometres, the Gotthard leg's first) a dearer boulder or a lower cap draws fewer far trees. Both worlds are
// ridden in node with the real models (Scenery.loadModels: assets/trees, assets/village), the streamer settled at each
// station, and the trees drawn (Scenery.treeCount, the shrubs among them) must be at least what the same ride drew
// before the models' detail pass (TREES_BEFORE, read at e7b62d6 with this file: TREE_COUNT_RECORD=1 prints the counts).
import { describe, test, expect, beforeAll } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { Blob } from 'node:buffer';
import { TextDecoder } from 'node:util';
import { canvasStub, loadGame, loadScript } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';
import { modelStandIns } from '../helpers/world-clearance.js';

const root = new URL('../../', import.meta.url);
const game = loadGame();
const { THREE, WorldEnvironment, WorldStreamer } = game;

// Stations (ride metres from the stage's start) and the trees drawn there before the detail pass
const TREES_BEFORE = {
    tremola: { 0: 521, 1000: 527, 2000: 521, 3000: 508, 4000: 508, 5000: 900 },
    'gotthard-north': { 0: 448, 1000: 438, 2000: 435, 3000: 900 }
};

// The real models, read by SceneAssets in a scope of their own (the game's own scope has no image decoder)
async function realModels() {
    const files = ['terrain.js', 'world/route.js', 'world/legroute.js', 'vehicle.js', 'environment.js', 'tours.js', 'sceneassets.js', 'world/data.js', 'world/landshade.js', 'world/terrainmesh.js', 'world/vegetation.js', 'world/edgestyles.js', 'world/scenery.js'];
    const fetch = async url => {
        const bytes = readFileSync(new URL(url, root));
        return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
    };
    const sink = { log() {}, warn() {}, error() {} };
    const factory = new Function('THREE', 'document', 'localStorage', 'console', 'fetch', 'createImageBitmap', 'Blob', 'TextDecoder', 'performance',
        `${files.map(loadScript).join('\n;\n')}\nreturn { SceneAssets, Scenery };`);
    const { SceneAssets, Scenery } = factory(THREE, canvasStub(), { getItem: () => null, setItem() {} }, sink, fetch, async blob => ({ width: 1, height: 1, bytes: blob.size }), Blob, TextDecoder, performance);
    const models = await Scenery.loadModels(SceneAssets.loadModel);
    // (the landmarks are boxes their models' size: they are not in the scenery's cap)
    return { ...models, landmarks: modelStandIns(THREE, readFileSync, root).landmarks };
}

async function treesAt(id, stations, models) {
    const { fetchFn } = diskFetch();
    const env = await WorldEnvironment.load(new THREE.Scene(), { id, fetchFn, models, digest: async () => '0' });
    const out = {};
    for (const at of stations) {
        const s = env.startS + at;
        const p = env.route.sample(s, {});
        env.lastBike = { x: p.x, z: p.z };
        await env.streamer.settle({ x: p.x, z: p.z }, s);
        env.streamClockMs += 2 * WorldStreamer.DISPOSE_AFTER_MS;
        await env.streamer.settle({ x: p.x, z: p.z }, s);
        env.scenery.rankTrees(env.lastBike, true);
        out[at] = env.scenery.treeCount;
    }
    return out;
}

describe('the trees a window draws', () => {
    let models;
    const counts = {};
    beforeAll(async () => {
        models = await realModels();
        for (const [id, before] of Object.entries(TREES_BEFORE)) counts[id] = await treesAt(id, Object.keys(before).map(Number), models);
        if (process.env.TREE_COUNT_RECORD) console.log(JSON.stringify(counts));
    }, 600000);

    test.each(Object.keys(TREES_BEFORE))('%s: at every station at least as many as before the detail pass', id => {
        for (const [at, before] of Object.entries(TREES_BEFORE[id])) expect({ id, at, trees: counts[id][at] >= before ? 'kept' : counts[id][at] }).toEqual({ id, at, trees: 'kept' });
    });
});
