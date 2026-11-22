// Rides every hairpin of a world with the chase camera's wall rule on and off and prints the counts as JSON
// (tests/unit/world-camera-walls.test.js). It runs as its own node process: under jest's module VM the same rides
// take about fifteen times as long, over an hour for the shipped stage, and every frame of every ride must be read.
//   node tests/helpers/world-camera-walls-sweep.mjs <id> [search] [stepM] [stepShare]
// prints {hairpins, faces, on, off}, each of on and off {frames, wall, house, land, near, step, share, bad, jumps}: a
// jump is a frame whose distance from the bike changed by over stepM at the default boom, or by over stepShare of it
import { loadGame } from './load-game.js';
import { diskFetch } from './world-fetch.js';
import { MODES, hairpinsOf, solidsOf, cameraRide } from './world-camera-walls.js';

// Every ride of one hairpin: [{name, ...options of cameraRide}]
function ridesOf(game, env, hairpin) {
    const { WorldAssist, Tuning } = game;
    const physics = env.physics;
    let tight = 0;
    for (let s = hairpin.s0; s <= hairpin.s1; s += 2) tight = Math.max(tight, Math.abs(WorldAssist.curvature(env.route, physics, s)));
    const advised = WorldAssist.advisedSpeed(physics, 1 / Math.max(tight, 1e-6));
    const worst = physics.floorLeanDeg * Math.PI / 180;
    const most = id => Tuning.PARAMS.find(p => p.id === id).max;
    const far = most('camDistance'), swing = most('camSwing');
    const out = [];
    for (const [view, mode] of Object.entries(MODES)) {
        const add = (name, options) => out.push({ name: `${view}, ${name}`, mode, s0: hairpin.s0, s1: hairpin.s1, ...options });
        add('5 m/s', { speed: 5 });
        add('7 m/s', { speed: 7 });
        add('the advised speed', { speed: advised });
        add('the worst lean into the bend', { speed: 7, lean: worst });
        add('the worst lean out of it', { speed: 7, lean: -worst });
        for (const lane of [2, -2]) {
            add(`the worst lean into the bend, ${lane} m off the centre`, { speed: 7, lane, lean: worst });
            add(`the worst lean out of it, ${lane} m off the centre`, { speed: 7, lane, lean: -worst });
        }
        add('the tuning at its most, the advised speed', { speed: advised, far, swing });
        add('the tuning at its most, the worst lean into the bend', { speed: 7, lean: worst, far, swing });
        add('the tuning at its most, the worst lean out of it', { speed: 7, lean: -worst, far, swing });
    }
    return out;
}

export async function sweep(id, search = '', stepM = 0.5, stepShare = 0.05) {
    const game = loadGame(undefined, []);
    const { THREE, WorldEnvironment, WorldCamera } = game;
    const { fetchFn } = diskFetch();
    const env = await WorldEnvironment.load(new THREE.Scene(), { id, search, fetchFn, models: null, digest: async () => '0' });
    const hairpins = hairpinsOf(env.route).filter(h => h.s0 >= env.startS && h.s1 <= env.endS);
    const total = () => ({ frames: 0, wall: 0, house: 0, land: 0, near: 0, step: 0, share: 0, bad: [], jumps: [] });
    const out = { hairpins: hairpins.length, faces: 0, on: total(), off: total() };
    for (const hairpin of hairpins) {
        const p = env.route.sample(hairpin.apex, {});
        env.update(p, hairpin.apex, null, Infinity);
        await env.streamer.settle(p, hairpin.apex);
        const solids = solidsOf(game, env, { x: p.x, z: p.z, reach: 140 });
        const overhead = (x, z, y) => env.overheadY(x, z, y);
        // The rule off: the camera is given no wall faces
        const cameras = { on: new WorldCamera(env.route, env.ground, overhead, (x, z, reach) => env.cameraFaces(x, z, reach)), off: new WorldCamera(env.route, env.ground, overhead) };
        out.faces = Math.max(out.faces, env.cameraFaces(p.x, p.z, 48).count);
        for (const [rule, camera] of Object.entries(cameras)) {
            const sum = out[rule];
            for (const ride of ridesOf(game, env, hairpin)) {
                const r = cameraRide(game, env, camera, { ...ride, solids });
                for (const key of ['frames', 'wall', 'house', 'land', 'near']) sum[key] += r[key];
                if (r.wall + r.house + r.land + r.near) sum.bad.push({ apex: Math.round(hairpin.apex), ride: ride.name, wall: r.wall, house: r.house, land: r.land, near: r.near, first: r.first[0] });
                const plain = !(ride.far > 1);
                if ((plain && r.step > stepM) || r.share > stepShare) sum.jumps.push({ apex: Math.round(hairpin.apex), ride: ride.name, step: Math.round(r.step * 1000) / 1000, s: r.stepAt, share: Math.round(r.share * 1000) / 1000, shareAt: r.shareAt });
                if (plain) sum.step = Math.max(sum.step, r.step);
                sum.share = Math.max(sum.share, r.share);
            }
        }
    }
    return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const [id, search = '', stepM = '0.5', stepShare = '0.05'] = process.argv.slice(2);
    sweep(id, search, Number(stepM), Number(stepShare)).then(out => process.stdout.write(JSON.stringify(out)), error => { console.error(error.stack || error); process.exit(1); });
}
