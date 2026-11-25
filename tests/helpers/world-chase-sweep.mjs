// Rides every chicane and every hairpin of a world's stage with the chase camera in the standard and the high view
// and prints the camera's swing on each as JSON (tests/unit/world-camera-chicane.test.js). It runs as its own node
// process: under jest's module VM the same rides take about fifteen times as long.
//   node tests/helpers/world-chase-sweep.mjs <id> [cruise m/s]
// prints {chicanes: [{s, left, right, radius, standard, high}], hairpins: [{s, standard, high}], tubes: [{from, to,
// standard, high}]}: each ride's {rate, accel, sway, room} within REACH_M of the place (peaksOf), and on a hairpin
// `off`, the view's yaw off the road's heading at the ride's end (rad). A tube (a run of tunnel or gallery) is ridden
// from TUBE_BEFORE_M before its portal to TUBE_AFTER_M past its other one: {under} the least room the eye and the near
// plane's corners keep in it (tubeRoom), {bounce} the camera's largest second difference of height a frame (m)
import { loadGame } from './load-game.js';
import { diskFetch } from './world-fetch.js';
import { CHASE_MODES, chaseRide, swingOf, peaksOf, chicanesOf } from './world-chase-ride.js';
import { hairpinsOf } from './world-camera-walls.js';

// A ride starts BEFORE_M before the place and ends AFTER_M past it; its peaks are read within REACH_M of it
export const BEFORE_M = 140, AFTER_M = 80, REACH_M = 40;
export const TUBE_BEFORE_M = 150, TUBE_AFTER_M = 100;

const round = n => Math.round(n * 1000) / 1000;

export async function sweep(id, cruise = 20) {
    const game = loadGame(undefined, []);
    const { fetchFn } = diskFetch();
    const env = await game.WorldEnvironment.load(new game.THREE.Scene(), { id, search: '', fetchFn, models: null, digest: async () => '0' });
    const route = env.route;
    const from = env.startS + BEFORE_M, to = env.endS - AFTER_M;
    const ride = async s => {
        const p = route.sample(s, {});
        env.update(p, s, null, Infinity);
        await env.streamer.settle(p, s);
        const out = {};
        for (const [name, mode] of Object.entries(CHASE_MODES)) {
            const rows = swingOf(chaseRide(game, env, { s0: s - BEFORE_M, s1: s + AFTER_M, mode, cruise }));
            const peaks = peaksOf(rows, [s], REACH_M);
            const last = rows[rows.length - 1];
            const off = Math.atan2(Math.sin(last.yaw - route.sample(last.s, {}).heading), Math.cos(last.yaw - route.sample(last.s, {}).heading));
            out[name] = { rate: round(peaks.rate), accel: round(peaks.accel), sway: round(peaks.sway), room: round(peaks.room), off: round(off) };
        }
        return out;
    };
    const chicanes = [];
    for (const c of chicanesOf(route, from, to)) chicanes.push({ ...c, ...(await ride(c.s)) });
    const hairpins = [];
    for (const h of hairpinsOf(route).filter(h => h.apex >= from && h.apex <= to)) hairpins.push({ s: h.apex, ...(await ride(h.apex)) });
    const tubes = [];
    const { WorldRoute } = game;
    const points = route.points, mask = WorldRoute.FLAG.tunnel | WorldRoute.FLAG.gallery;
    let open = null;
    for (let i = 0; i < points.length; i++) {
        const on = (points[i].bits & mask) !== 0;
        if (on && open === null) open = i;
        if ((!on || i === points.length - 1) && open !== null) {
            const a = route.fromUnits(open), b = route.fromUnits(on ? i : i - 1);
            open = null;
            if (a < env.startS || b > env.endS) continue;
            const s0 = Math.max(env.startS, a - TUBE_BEFORE_M), s1 = Math.min(env.endS, b + TUBE_AFTER_M);
            const out = { from: Math.round(a), to: Math.round(b) };
            for (const [name, mode] of Object.entries(CHASE_MODES)) {
                let under = Infinity, at = null, bounce = 0, bounceAt = null;
                // (in parts of at most 400 m, with the land round each loaded)
                let rows = [];
                for (let p0 = s0; p0 < s1; p0 += 400) {
                    const mid = Math.min(s1, p0 + 200), p = route.sample(mid, {});
                    env.update(p, mid, null, Infinity);
                    await env.streamer.settle(p, mid);
                    rows = rows.concat(chaseRide(game, env, { s0: Math.max(s0, p0 - 80), s1: Math.min(s1, p0 + 400), mode, cruise }).filter(r => r.s >= p0 || p0 === s0).map(r => Object.assign(r, { part: p0 })));
                }
                for (let k = 2; k < rows.length; k++) {
                    const r = rows[k];
                    if (r.under < under) { under = r.under; at = Math.round(r.s); }
                    const jump = Math.abs(r.ey - 2 * rows[k - 1].ey + rows[k - 2].ey);
                    // (not across a part's seam, where the ride starts again)
                    if (rows[k - 2].part === r.part && jump > bounce) { bounce = jump; bounceAt = Math.round(r.s); }
                }
                out[name] = { under: round(under), at, bounce: round(bounce), bounceAt };
            }
            tubes.push(out);
        }
    }
    return { id, cruise, chicanes, hairpins, tubes };
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const [id, cruise = '20'] = process.argv.slice(2);
    sweep(id, Number(cruise)).then(out => process.stdout.write(JSON.stringify(out)), error => { console.error(error.stack || error); process.exit(1); });
}
