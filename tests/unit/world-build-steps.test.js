// A road section, a tile's land and scenery, a side road's chunk and the far grid's clip are built in steps (WorldStreamer takes a build a few milliseconds at a time:
// tools/terrain-check.mjs world-steps holds the time of a step). Built in steps they are the same as built whole: the
// same meshes in the same order, with the same vertices, colours, normals, groups and instances, to the last bit, and
// the same counts. Over the shipped Tremola slice and the Gotthard leg, with real three in node.
import { describe, test, expect, beforeAll } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';

const game = loadGame();
const { THREE, WorldEnvironment, WorldStreamer } = game;

// Every number a mesh is drawn from, in order, as one list of hashes (FNV-1a over the bytes of each array)
function hashBytes(array) {
    const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    let h = 2166136261;
    for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i], 16777619) >>> 0;
    return `${array.length}:${h}`;
}
function signature(root) {
    const out = [];
    root.traverse((o) => {
        if (!o.isMesh) return;
        const g = o.geometry, row = [o.name, o.type];
        for (const [name, attribute] of Object.entries(g.attributes).sort(([a], [b]) => a.localeCompare(b))) row.push(name, hashBytes(attribute.array));
        if (g.index) row.push('index', hashBytes(g.index.array));
        row.push(JSON.stringify(g.groups));
        if (o.isInstancedMesh) row.push(o.count, hashBytes(o.instanceMatrix.array.subarray(0, o.count * 16)));
        o.updateMatrixWorld(true);
        row.push(hashBytes(new Float64Array(o.matrixWorld.elements)));
        out.push(row.join(' '));
    });
    return out;
}

// Runs a build one step at a time, as the streamer does at its smallest budget: the steps it took, and its result
function stepped(steps) {
    let n = 0, step = steps.next();
    while (!step.done) { n++; step = steps.next(); }
    return { n, value: step.value };
}

for (const id of ['tremola', 'gotthard-north']) describe(`the ${id} stage, built in steps`, () => {
    let env;
    beforeAll(async () => {
        const { fetchFn } = diskFetch();
        env = await WorldEnvironment.load(new THREE.Scene(), { id, fetchFn, models: null, digest: async () => '0' });
    }, 120000);

    // The places the browser's steps were slowest before the split (world-steps): hairpins with walls, a bridge, a
    // junction, the stops' ends
    const places = id === 'tremola' ? [0.04, 0.3, 0.55, 0.8, 0.97] : [0.03, 0.25, 0.5, 0.75, 0.98];

    test.each(places)('at %f of the stage: every section and every tile\'s scenery round the bike', async (share) => {
        const s = env.startS + (env.endS - env.startS) * share;
        const p = env.route.sample(s, {});
        env.update(p, s, null, Infinity);
        await env.streamer.settle(p, s);
        let sections = 0, tiles = 0, steps = 0;
        // (the six sections nearest the bike)
        const near = [...env.streamer.roads].filter(([i]) => env.roadMeshes.has(i)).sort(([a], [b]) => Math.abs(env.streamer.sections[a].s0 - s) - Math.abs(env.streamer.sections[b].s0 - s)).slice(0, 6);
        for (const [index, held] of near) {
            const section = env.streamer.sections[index];
            for (const lod of [held.lod, 1 - held.lod]) {
                env.buildRoad(section, lod);
                const whole = signature(env.roadMeshes.get(index));
                const triangles = env.triangleCount;
                const run = stepped(env.buildRoadSteps(section, lod));
                expect(signature(env.roadMeshes.get(index))).toEqual(whole);
                expect(env.triangleCount).toBe(triangles);
                expect(run.n).toBeGreaterThan(3);
                steps += run.n;
                sections++;
            }
            env.buildRoad(section, held.lod);
        }
        for (const [key, held] of [...env.streamer.tiles].filter(([, h]) => h.lod <= 1)) {
            // The land: its cut a step of its own at full detail, then the mesh
            env.buildTile(key, held.lod);
            const land = signature(env.tileMeshes.get(key).mesh);
            const landTriangles = env.triangleCount;
            stepped(env.buildTileSteps(key, held.lod));
            expect(signature(env.tileMeshes.get(key).mesh)).toEqual(land);
            expect(env.triangleCount).toBe(landTriangles);
            if (process.env.STEPS_DEBUG) process.stderr.write(`tile ${key} ${Date.now()}\n`);
            env.scenery.disposeTile(key);
            env.buildScenery(key, held.lod);
            const built = env.scenery.perTile.get(key);
            if (!built) continue;
            const whole = signature(built.group);
            const counts = { trees: built.trees, boulders: built.boulders, tufts: built.tufts, house: built.house, stones: (built.stoneSites || []).length, triangles: env.scenery.triangles, boulderCount: env.scenery.boulderCount };
            env.scenery.disposeTile(key);
            const run = stepped(env.buildScenerySteps(key, held.lod));
            const again = env.scenery.perTile.get(key);
            expect(signature(again.group)).toEqual(whole);
            expect({ trees: again.trees, boulders: again.boulders, tufts: again.tufts, house: again.house, stones: (again.stoneSites || []).length, triangles: env.scenery.triangles, boulderCount: env.scenery.boulderCount }).toEqual(counts);
            // and the marker stones put on and taken off in steps (a tile's detail changing) as whole
            if (held.lod === 0) {
                env.scenery.setStones(env.data.tile(key), false, env.lastBike);
                env.scenery.setStones(env.data.tile(key), true, env.lastBike);
                const toggled = signature(env.scenery.perTile.get(key).group);
                stepped(env.scenery.setStonesSteps(env.data.tile(key), false, env.lastBike));
                stepped(env.scenery.setStonesSteps(env.data.tile(key), true, env.lastBike));
                expect(signature(env.scenery.perTile.get(key).group)).toEqual(toggled);
            }
            steps += run.n;
            tiles++;
        }
        // Each side road's chunk built again (its works), and the far grid cut to the tubes
        let chunks = 0;
        for (const [k, held] of [...env.streamer.sides].filter(([k]) => env.sideMeshes.has(k)).slice(0, 8)) {
            if (process.env.STEPS_DEBUG) process.stderr.write(`side ${k} ${Date.now()}\n`);
            WorldStreamer.drain(env.buildSideSteps(k, held.near, true));
            const whole = signature(env.sideMeshes.get(k));
            const edges = JSON.stringify(env.sideEdges.get(k));
            stepped(env.buildSideSteps(k, held.near, true));
            expect(signature(env.sideMeshes.get(k))).toEqual(whole);
            expect(JSON.stringify(env.sideEdges.get(k))).toBe(edges);
            chunks++;
        }
        if (env.horizon) {
            env.clipHorizon();
            const whole = signature(env.horizon);
            stepped(env.clipHorizonSteps());
            expect(signature(env.horizon)).toEqual(whole);
        }
        expect(sections).toBeGreaterThan(0);
        expect(tiles).toBeGreaterThan(0);
        expect(chunks).toBeGreaterThan(0);
        expect(steps).toBeGreaterThan(sections * 10);
    }, 600000);

    test('the streamer takes a build in steps over several pumps, and nothing else runs until it is done', async () => {
        const s = env.startS + (env.endS - env.startS) * 0.5;
        const p = env.route.sample(s, {});
        env.update(p, s, null, Infinity);
        await env.streamer.settle(p, s);
        const [index, held] = [...env.streamer.roads].find(([i]) => env.roadMeshes.has(i));
        const section = env.streamer.sections[index];
        env.buildRoad(section, held.lod);
        const whole = signature(env.roadMeshes.get(index));
        const streamer = env.streamer;
        const order = [];
        streamer.enqueue('works:test', -2, () => env.buildRoadSteps(section, held.lod));
        streamer.enqueue('x:after', -1, () => { order.push('after'); });
        let pumps = 0;
        while (streamer.busy && pumps < 100000) {
            streamer.pump(0);
            pumps++;
            if (streamer.active) order.push('step');
        }
        expect(pumps).toBeGreaterThan(10);
        expect(order.indexOf('after')).toBe(order.length - 1);
        expect(signature(env.roadMeshes.get(index))).toEqual(whole);
        expect(WorldStreamer.drain(5)).toBe(5);
    }, 600000);
});

// The window a ride holds is the same whether the streamer took its builds whole or in steps: the same sections, side
// roads and tiles, and the same houses, boulders, tufts and trees drawn (Scenery.rankCaps, Scenery.rankTrees: chosen
// over the window from the middle of the bike's square, not in the order the tiles were built in)
describe('a ride built in steps holds the same window as one built whole', () => {
    async function ride(id, whole) {
        const { fetchFn } = diskFetch();
        const env = await WorldEnvironment.load(new THREE.Scene(), { id, fetchFn, models: null, digest: async () => '0' });
        if (whole) for (const k of ['buildTile', 'buildScenery', 'buildRoad']) { const f = env.streamer.hooks[k]; env.streamer.hooks[k] = (...a) => { WorldStreamer.drain(f(...a)); }; }
        const windows = [];
        const from = env.startS + 200, to = Math.min(env.endS, from + 2400);
        for (let s = from; s <= to; s += 4) {
            const p = env.route.sample(s, {});
            env.update(p, s, null, 4, 0.16);
            if (Math.round(s - from) % 600 !== 0) continue;
            await env.streamer.settle(p, s);
            // (past the streamer's grace, so what the ride has left behind has gone, then settled again)
            for (let k = 0; k < 4; k++) env.update(p, s, null, Infinity, 1);
            await env.streamer.settle(p, s);
            // (a tile's scenery that waits for its side roads' data, WorldEnvironment.buildScenery, is not the streamer's
            // to wait for: its data comes in its own time, whichever way the builds were taken)
            for (let k = 0; k < 500 && env.sceneryWaiting && env.sceneryWaiting.size; k++) {
                await new Promise(r => setTimeout(r, 5));
                await env.streamer.settle(p, s);
            }
            await env.streamer.settle(p, s);
            env.scenery.rankTrees(p);
            const forest = [];
            env.scenery.forest.traverse(o => { if (o.isInstancedMesh && o.count) forest.push(`${o.name} ${hashBytes(o.instanceMatrix.array.subarray(0, o.count * 16))}`); });
            windows.push({
                s: Math.round(s),
                roads: [...env.roadMeshes.keys()].sort((a, b) => a - b),
                sides: [...env.sideMeshes.keys()].sort((a, b) => a - b),
                tiles: [...env.streamer.tiles].map(([k, h]) => `${k}:${h.lod}`).sort(),
                scenery: [...env.scenery.perTile].map(([k, h]) => `${k} ${h.capSig}`).sort(),
                counts: [env.scenery.houseInstances, env.scenery.boulderCount, env.scenery.tuftCount, env.scenery.treeCount],
                forest: forest.sort()
            });
        }
        env.dispose();
        return windows;
    }
    for (const id of ['tremola', 'gotthard-north']) test(id, async () => {
        const whole = await ride(id, true), steps = await ride(id, false);
        if (process.env.STEPS_DEBUG) for (let i = 0; i < whole.length; i++) for (const k of Object.keys(whole[i])) {
            const a = JSON.stringify(whole[i][k]), b = JSON.stringify(steps[i][k]);
            if (a !== b) {
                if (Array.isArray(whole[i][k])) {
                    const A = new Set(whole[i][k].map(String)), B = new Set(steps[i][k].map(String));
                    console.log(id, whole[i].s, k, 'whole only', [...A].filter(x => !B.has(x)).join(' ; ').slice(0, 900), '|| steps only', [...B].filter(x => !A.has(x)).join(' ; ').slice(0, 900));
                } else console.log(id, whole[i].s, k, a.slice(0, 600), '|||', b.slice(0, 600));
            }
        }
        expect(whole.length).toBeGreaterThan(3);
        expect(steps).toEqual(whole);
    }, 900000);
});
