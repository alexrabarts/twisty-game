/**
 * @jest-environment node
 */
// A rider of the group beside the player moves smoothly along the road (.agent/system/group.md, "Smooth beside the
// player"). The owner (2026-11-27): "when other riders are alongside the player, their relative position is jumpy -
// they move forwards and backwards in a jittery sort of way". The game steps the ride at 60 a second and draws at the
// display's rate, the player's bike between its last two steps (Vehicle.applyRenderInterpolation); a rider drawn at
// its last step was ahead of the drawn player by a share of a step that changed every frame.
//
// Each ride here is on the real Tremola slice, drawn as the game draws it: frames of uneven length (a 60 Hz display
// whose frames wander, a 120 Hz one and a 144 Hz one), 0, 1 or 2 steps a frame. Where the player rides at a steady
// speed, each rider within ALONG_M of it along the road is read in the drawn frames: how often its speed relative to
// the player changes sign (FLIPS_PER_S at the most) and its relative acceleration (ACCEL_MS2 at the most).
import { describe, test, beforeAll } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';
import { groupRide } from '../helpers/world-group.js';

const game = loadGame(undefined, []);
const { THREE, WorldEnvironment, CHARACTERS, Traffic } = game;
// (SMOOTH_OFF=1 draws each rider at its last step, as before 2026-11-27, to measure what the drawing between steps fixed)
if (process.env.SMOOTH_OFF) Traffic.prototype.drawn = function () {};
const byPlace = place => CHARACTERS.find(c => c.place === place);

const ALONG_M = 6;
const FLIPS_PER_S = 2;
const ACCEL_MS2 = 12;
// A sign change counts only with this much relative speed (m/s) on each side of it: a rider held level is not a flip
const FLIP_MS = 0.05;
// The game's step (s): the ride steps at 60 a second
const STEP_S = 1 / 60;

let env, route;
const sOf = v => route.fromUnits(v.currentSegment + v.segmentProgress);
beforeAll(async () => {
    const { fetchFn } = diskFetch();
    env = await WorldEnvironment.load(new THREE.Scene(), { id: 'tremola', fetchFn, models: null, digest: async () => '0' });
    env.scenery.buildTile = () => null;
    route = env.route;
}, 300000);

// The length of the k-th drawn frame (s): seeded, so each ride replays
function frames(kind) {
    let a = 12345;
    const random = () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), a | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    if (kind === '60') return () => 1 / 60 + (random() - 0.5) * 0.006;
    if (kind === '120') return () => 1 / 120 + (random() - 0.5) * 0.002;
    return () => 1 / 144 + (random() - 0.5) * 0.002;
}

// The player, the rider of place 6, at `pace` from 2600 m with the crew behind it: they come up and pass it
function beside(kind, pace) {
    const last = new Map();
    const out = { frames: 0, seconds: 0, flips: 0, worst: 0, worstAt: null, riders: new Set() };
    let before = null, beforeT = null, prevSpeed = null;
    groupRide(game, env, {
        rider: byPlace(6), at: [2560, 2545, 2530, 2515, 2500], player: { s: 2600, pace: () => pace }, seconds: 200,
        frameS: frames(kind),
        onDraw: ({ t, riders, proxy, drawnPlayer, drawnYaw }) => {
            const dt = beforeT === null ? null : t - beforeT;
            beforeT = t;
            const speed = proxy.currentSpeed;
            const steady = prevSpeed !== null && Math.abs(speed - pace) < 0.05 && Math.abs(speed - prevSpeed) < 0.05;
            prevSpeed = speed;
            // (along the drawn player's heading, which is drawn between steps as its position is; a rider on another
            // leg of a hairpin, more than 2 ALONG_M away along the ride, is not beside it)
            const fx = Math.sin(drawnYaw), fz = Math.cos(drawnYaw), me = sOf(proxy);
            for (const r of riders) {
                const g = r.bikeGroup.position;
                const rel = (g.x - drawnPlayer.x) * fx + (g.z - drawnPlayer.z) * fz;
                if (Math.abs(sOf(r) - me) > 2 * ALONG_M) { last.delete(r); continue; }
                const was = last.get(r);
                const near = r.bikeGroup.visible && Math.abs(rel) < ALONG_M && steady && dt > 0;
                if (!near) { last.delete(r); continue; }
                // (read over a step at least: drawn between steps, a rider's speed changes at each step, so at a
                // frame shorter than a step its acceleration reads as a step's change over the frame)
                if (was && t - was.t < STEP_S - 1e-9) continue;
                const span = was ? t - was.t : null;
                const v = was ? (rel - was.rel) / span : null;
                if (v !== null && was.v !== null) {
                    const a = (v - was.v) / span;
                    out.frames++;
                    out.seconds += span;
                    out.riders.add(r.character.place);
                    if (Math.sign(v) !== Math.sign(was.v) && Math.abs(v) > FLIP_MS && Math.abs(was.v) > FLIP_MS) out.flips++;
                    if (Math.abs(a) > out.worst) { out.worst = Math.abs(a); out.worstAt = { t: Math.round(t * 100) / 100, place: r.character.place, rel: Math.round(rel * 100) / 100 }; }
                }
                last.set(r, { rel, v, t });
            }
        },
        until: ({ playerS }) => playerS > 5200
    });
    return { kind, pace, frames: out.frames, seconds: Math.round(out.seconds * 10) / 10, flipsPerS: Math.round(out.flips / Math.max(out.seconds, 1e-9) * 100) / 100, worstMs2: Math.round(out.worst * 10) / 10, worstAt: out.worstAt, riders: [...out.riders] };
}

describe('a rider beside the player', () => {
    test('moves smoothly along the road against the drawn player at any frame rate', () => {
        const rows = [];
        for (const kind of ['60', '120', '144']) for (const pace of [11, 15]) rows.push(beside(kind, pace));
        console.log(`SMOOTH ${JSON.stringify(rows)}`);
        const bad = rows.filter(r => r.frames < 60 || r.flipsPerS > FLIPS_PER_S || r.worstMs2 > ACCEL_MS2);
        if (bad.length) throw new Error(`jumpy beside the player: ${JSON.stringify(bad)}`);
    }, 1800000);
});
