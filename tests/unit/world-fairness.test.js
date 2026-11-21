/**
 * @jest-environment node
 */
// Physics can only kill the rider where the rider can see why. The Tremola slice is streamed in node and read every
// metre across the drawn carriageway and verge (tests/helpers/world-fairness.js): the physics road band must be the
// drawn one, no wall or fall stands on the drawn road without something drawn there to hit, and no run-off (the
// off-road timer) lies on the drawn carriageway. Every barrier's solid box is the drawn barrier. Then careful riders
// take every hairpin at hairpin speed, with the assist on and off: no crash and no cut-rule restart.
//
// Before the ribbon-frame projection (WorldRoute.nearestSegment) the physics read the road from the chords between
// samples while the ribbon is drawn along each row's normal: the band sat up to 0.47 m off the drawn edge (8776
// points over 0.1 m), and on the inside of a hairpin sampled every 4 m the progress jumped at each sample, which the
// cut rule read as a cut across the ladder at hairpin speed ("Off route, back to checkpoint" with nothing hit).
// The GPU probe world-fairness proves the same on the meshes the page draws.
import { describe, test, expect, beforeAll } from '@jest/globals';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGame } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';
import { fairnessWindow } from '../helpers/world-fairness.js';
import { rideSpan } from '../helpers/world-rider.js';
import { decodeWorld } from '../../tools/world/encode.mjs';
import { rideSamples } from '../../tools/world/stations.mjs';
import { findHairpins } from '../../tools/world/verify.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const log = [];
const game = loadGame(undefined, log);
const { THREE, WorldEnvironment, WorldGround, Vehicle } = game;

const list = (items, n = 12) => items.slice(0, n).map(i => JSON.stringify(i)).join('\n');

// The slice as the physics and the road meshes have it. Trees, boulders and houses are not solid in a world ride
// (WorldEnvironment keeps no boulders), so their building is left out: it is most of the streaming time
async function loadSlice() {
    const { fetchFn } = diskFetch();
    const env = await WorldEnvironment.load(new THREE.Scene(), { id: 'tremola', fetchFn, models: null, digest: async () => '0' });
    env.scenery.buildTile = () => null;
    return env;
}

describe('the Tremola slice: what the physics solid is, is drawn', () => {
    let env, sweep;
    beforeAll(async () => {
        env = await loadSlice();
        expect(env.boulders).toEqual([]);
        const vehicle = new Vehicle(new THREE.Scene());
        vehicle.environment = env;
        sweep = { points: 0, widthCount: 0, solidCount: 0, runoffCount: 0, worstWidthM: 0, width: [], solid: [], runoff: [] };
        const W = 200;
        for (let s = env.startS; s < env.endS; s += W) {
            const p = env.route.sample(s + W / 2, {});
            env.update(p, s, null, Infinity);
            await env.streamer.settle(p, s + W / 2);
            env.updateBarriers(s + W / 2);
            const r = fairnessWindow(game, env, vehicle, { s0: s, s1: Math.min(env.endS, s + W - 1e-6), stepM: 1, acrossM: 0.25 });
            for (const k of ['points', 'widthCount', 'solidCount', 'runoffCount']) sweep[k] += r[k];
            sweep.worstWidthM = Math.max(sweep.worstWidthM, r.worstWidthM);
            for (const k of ['width', 'solid', 'runoff']) sweep[k].push(...r[k]);
        }
    }, 900000);

    test('every metre of the ride was read across its drawn road and verge', () => {
        expect(sweep.points).toBeGreaterThan(500000);
    });

    test('the physics road band is the drawn one, within 0.1 m everywhere', () => {
        if (sweep.widthCount) throw new Error(`${sweep.widthCount} points where the physics lateral or half width is over 0.1 m off the drawn ribbon (worst ${sweep.worstWidthM} m):\n${list(sweep.width)}`);
        expect(sweep.worstWidthM).toBeLessThanOrEqual(0.1);
    });

    test('no wall or fall on the drawn road without a drawn wall, parapet, structure, barrier or bank within 0.5 m', () => {
        if (sweep.solidCount) throw new Error(`${sweep.solidCount} solid points with nothing drawn to hit:\n${list(sweep.solid)}`);
    });

    test('no run-off (the off-road timer) on the drawn carriageway', () => {
        if (sweep.runoffCount) throw new Error(`${sweep.runoffCount} run-off points on the drawn carriageway:\n${list(sweep.runoff)}`);
    });

    test('every barrier stops the bike only where it is drawn: its box within 0.5 m of the drawn fence', () => {
        const mesh = env.barrierMesh;
        mesh.geometry.computeBoundingBox();
        const box = mesh.geometry.boundingBox;
        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), scale = new THREE.Vector3();
        const bad = [];
        let seen = 0;
        for (const junction of env.graph.junctions) {
            for (const pass of junction.passes) {
                env.barrierStep = null;
                env.updateBarriers(pass.sIn);
                env.activeBarriers.forEach((b, i) => {
                    seen++;
                    mesh.getMatrixAt(i, m);
                    m.decompose(pos, q, scale);
                    const drawnHalf = Math.max(Math.abs(box.min.x), Math.abs(box.max.x)) * scale.x;
                    const drawnDepth = Math.max(Math.abs(box.min.z), Math.abs(box.max.z)) * scale.z;
                    // The box the physics stops the bike in (WorldGround.setBarriers)
                    const half = env.ground.barriers[i].half;
                    if (half > drawnHalf + 0.5 || WorldGround.BARRIER_DEPTH_M > drawnDepth + 0.5 || Math.hypot(pos.x - b.x, pos.z - b.z) > 0.01) bad.push({ junction: junction.id, edge: b.edgeId, half, drawnHalf, depth: WorldGround.BARRIER_DEPTH_M, drawnDepth });
                });
            }
        }
        expect(seen).toBeGreaterThan(0);
        if (bad.length) throw new Error(`${bad.length} barriers solid past their drawn fence:\n${list(bad)}`);
    });
});

describe('the Tremola slice: careful riders take every hairpin', () => {
    let env, hairpins;
    beforeAll(async () => {
        env = await loadSlice();
        const world = decodeWorld(path.join(REPO, 'world'));
        hairpins = findHairpins(rideSamples(world.edges, world.ride.path));
    }, 300000);

    // A keyboard rider on the centre line and the autopilot on the centre and the inside, at 5 and 7 m/s
    const riders = [];
    for (const speed of [5, 7]) {
        for (const assist of ['normal', 'off']) riders.push({ rider: 'keys', speed, assist, lane: 0 });
        for (const lane of [0, 'inside']) riders.push({ rider: 'pilot', speed, assist: 'normal', lane });
    }

    test('no crash and no restart in any hairpin at hairpin speed, assist normal or off', async () => {
        expect(hairpins.length).toBeGreaterThanOrEqual(20);
        const failed = [];
        for (const h of hairpins) {
            for (const r of riders) {
                const out = await rideSpan(game, env, { s0: Math.max(env.startS, h.s0 - 40), s1: h.s1 + 30, log, ...r });
                if (out.crashed || out.cut) failed.push({ hairpin: `${h.s0}-${h.s1} r${h.minRadiusM}`, ...r, ...out });
            }
        }
        if (failed.length) throw new Error(`${failed.length} of ${hairpins.length * riders.length} rides ended:\n${list(failed, 30)}`);
    }, 900000);
});
