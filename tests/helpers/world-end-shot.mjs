// Rides into the end stop of one stage the way the game does after the line (StopScene, EndShot) and reads every
// frame of the shot: the bikes, the camera, the card. Its own node process, as the other world sweeps: under jest's
// module VM a streamed world takes many times as long (tests/unit/world-end-shot.test.js).
//   node tests/helpers/world-end-shot.mjs <stage> [kept|far|alone]
// prints {stop, kind, composed, riders, bays, frames, flyS, cardAt, worst: {...}, problems: [...]}
import { loadGame, loadScript } from './load-game.js';
import { diskFetch } from './world-fetch.js';

// A frame may move the camera this far and turn its look this much at the most (60 frames a second): no jump
export const MOVE_M = 1.0;
export const TURN_DEG = 1.5;
// A bike's half length and half width, for the overlap test
const BIKE = [1.1, 0.4];

function loadShot(THREE) {
    return new Function('THREE', `${loadScript('world/endshot.js')}\n${loadScript('world/stopscene.js')}\nreturn { EndShot, StopScene };`)(THREE);
}

// Two bikes ({x, z, heading}) overlap: their rectangles in plan, by the separating axes
function overlap(a, b) {
    const axes = [a.heading, a.heading + Math.PI / 2, b.heading, b.heading + Math.PI / 2].map(h => [Math.sin(h), Math.cos(h)]);
    const corners = p => [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([u, v]) => [p.x + Math.sin(p.heading) * u * BIKE[0] + Math.cos(p.heading) * v * BIKE[1], p.z + Math.cos(p.heading) * u * BIKE[0] - Math.sin(p.heading) * v * BIKE[1]]);
    const ca = corners(a), cb = corners(b);
    for (const [ax, az] of axes) {
        const pa = ca.map(([x, z]) => x * ax + z * az), pb = cb.map(([x, z]) => x * ax + z * az);
        if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false;
    }
    return true;
}

const forward = c => [-Math.sin(c.yaw) * Math.cos(c.pitch), Math.sin(c.pitch), -Math.cos(c.yaw) * Math.cos(c.pitch)];

export async function endShot(id, group = 'kept') {
    const game = loadGame(undefined, []);
    const { THREE, WorldEnvironment } = game;
    const { EndShot, StopScene } = loadShot(THREE);
    const { fetchFn } = diskFetch();
    const env = await WorldEnvironment.load(new THREE.Scene(), { id, search: '', fetchFn, models: null, digest: async () => '0' });
    const stop = StopScene.stopAt(env);
    if (!stop) return { error: `no stop at the end of ${id}` };
    const route = env.route;
    // The land and the walls round the line and the stop
    const line = env.endS;
    for (const s of [line - 200, line, stop.s]) {
        const p = route.sample(s, {});
        env.update(p, s, null, Infinity);
        await env.streamer.settle(p, s);
    }
    // (read near ride distance s, as Game.startStopScene does)
    const ground = (x, z, s) => {
        if (!Number.isFinite(s)) return env.ground.groundY(x, z, null);
        const i = route.indexAt(Math.max(0, Math.min(route.length, s)));
        return env.ground.groundY(x, z, { start: i - StopScene.HINT_ROWS, end: i + StopScene.HINT_ROWS });
    };
    const faces = (x, z, reach) => env.cameraFaces(x, z, reach);
    // The player at the line on the right half of the road at 18 m/s, its chase camera 6 m behind and 3 m over it
    const at = (s, lane) => { const p = route.sample(s, {}); return { x: p.x + lane * Math.cos(p.heading), z: p.z - lane * Math.sin(p.heading), heading: p.heading, width: p.width }; };
    const p0 = at(line, -route.sample(line, {}).width / 4);
    const camera = { offset: { x: -Math.sin(p0.heading) * 6, y: 3, z: -Math.cos(p0.heading) * 6 }, yaw: Math.atan2(Math.sin(p0.heading), Math.cos(p0.heading)) + Math.PI, pitch: -0.18, roll: 0.02, fov: 70 };
    const riders = [{ bike: { character: { id: 'player' } }, s: line, player: true, at: p0, speed: 18, yaw: p0.heading, lean: 0.05 }];
    // The group: five riders 15 to 75 m behind (kept up), or 500 m and more behind (far), or none
    const gaps = group === 'kept' ? [15, 30, 45, 60, 75] : group === 'far' ? [500, 520, 900, 1400, 2000] : [];
    gaps.forEach((g, k) => {
        const q = at(line - g, -route.sample(line - g, {}).width / 4 + (k % 2 ? 0.8 : -0.8));
        riders.push({ bike: { character: { id: `crew${k}` } }, s: line - g, player: false, at: q, speed: 15, yaw: q.heading, lean: 0 });
    });
    const t0 = Date.now();
    const scene = new StopScene({ stop, route, riders, ground, camera, faces, aspect: 16 / 9, houses: env.data.buildings });
    // (what stands under the camera: the ground read near the player's place on the ride, or the land's own tiles, the
    // lower of the two. On the way down to Göschenen's car park the camera passes 6 m under the ride's deck, which the
    // ground reads there for two frames: under a bridge, not in the land)
    const under = (x, z) => Math.min(ground(x, z, scene.hintS), env.ground.landY(x, z, Infinity));
    const planMs = Date.now() - t0;
    const problems = [];
    const worst = { moveM: 0, turnDeg: 0, overlapFrames: 0, wallFrames: 0, underFrames: 0, throughFrames: 0, lowestM: Infinity };
    let prev = null, prevRiders = null, heldPose = null, heldMoved = 0;
    const dt = 1 / 60;
    const until = scene.cardAt + 1;
    let frames = 0;
    // The chase camera's own last frame: the shot's first may move as the bike does, no more
    const first0 = { eye: { x: p0.x + camera.offset.x, y: (ground(p0.x, p0.z, line) || 0) + camera.offset.y, z: p0.z + camera.offset.z }, yaw: camera.yaw, pitch: camera.pitch };
    prev = first0;
    let cardSeen = null;
    while (scene.t < until) {
        const frame = scene.step(dt);
        frames++;
        const c = frame.camera;
        const move = Math.hypot(c.eye.x - prev.eye.x, c.eye.y - prev.eye.y, c.eye.z - prev.eye.z);
        const fa = forward(prev), fb = forward(c);
        const turn = Math.acos(Math.max(-1, Math.min(1, fa[0] * fb[0] + fa[1] * fb[1] + fa[2] * fb[2]))) * 180 / Math.PI;
        if (move > worst.moveM) { worst.moveM = move; worst.moveAt = scene.t; }
        if (turn > worst.turnDeg) { worst.turnDeg = turn; worst.turnAt = scene.t; }
        const g = under(c.eye.x, c.eye.z);
        if (Number.isFinite(g)) {
            worst.lowestM = Math.min(worst.lowestM, c.eye.y - g);
            if (c.eye.y < g + 0.3) { worst.underFrames++; if (worst.underFrames < 4) problems.push(`the camera ${(c.eye.y - g).toFixed(2)} m over the land at ${scene.t.toFixed(2)} s`); }
        }
        // (through a wall or a house between this frame and the last)
        const near = StopScene.facesNear(faces, c.eye.x, c.eye.z, move + 4);
        if (frames > 1 && EndShot.faceShare(near, prev.eye, c.eye, 0) < 1) { worst.throughFrames++; if (worst.throughFrames < 4) problems.push(`the camera passes a wall or a house at ${scene.t.toFixed(2)} s`); }
        // The bikes: no two overlap, none rides through a wall
        const shown = frame.riders.map((r, k) => ({ ...r, k })).filter(r => r.shown);
        let over = false;
        for (let i = 0; i < shown.length; i++) for (let j = i + 1; j < shown.length; j++) if (overlap(shown[i], shown[j])) { over = true; if (worst.overlapFrames < 3) problems.push(`riders ${shown[i].k} and ${shown[j].k} overlap at ${scene.t.toFixed(2)} s (${shown[i].x.toFixed(1)}, ${shown[i].z.toFixed(1)})`); }
        if (over) worst.overlapFrames++;
        if (prevRiders) {
            for (const r of shown) {
                const q = prevRiders[r.k], y = r.y === null ? 0 : r.y;
                const wall = StopScene.facesNear(faces, r.x, r.z, 6);
                if (EndShot.faceShare(wall, { x: q.x, y: y + 0.5, z: q.z }, { x: r.x, y: y + 0.5, z: r.z }, 0) < 1) { worst.wallFrames++; if (worst.wallFrames < 3) problems.push(`rider ${r.k} rides through a wall at ${scene.t.toFixed(2)} s`); }
            }
        }
        prevRiders = frame.riders.map(r => ({ x: r.x, z: r.z }));
        // Once held, the camera holds
        if (frame.held) {
            if (heldPose) heldMoved = Math.max(heldMoved, Math.hypot(c.eye.x - heldPose.eye.x, c.eye.y - heldPose.eye.y, c.eye.z - heldPose.eye.z), Math.abs(c.yaw - heldPose.yaw) * 10);
            else heldPose = c;
        }
        if (frame.card && cardSeen === null) cardSeen = scene.t;
        prev = c;
    }
    if (worst.moveM > MOVE_M) problems.push(`the camera moves ${worst.moveM.toFixed(2)} m in a frame at ${worst.moveAt.toFixed(2)} s, over ${MOVE_M}`);
    if (worst.turnDeg > TURN_DEG) problems.push(`the camera turns ${worst.turnDeg.toFixed(2)} degrees in a frame at ${worst.turnAt.toFixed(2)} s, over ${TURN_DEG}`);
    if (heldMoved > 1e-6) problems.push(`the held camera moves (${heldMoved.toFixed(4)})`);
    if (cardSeen === null) problems.push('no card');
    else if (cardSeen < scene.flyS + EndShot.TUNING.holdFirstS - 1e-6) problems.push(`the card at ${cardSeen.toFixed(2)} s, before the camera settled at ${scene.flyS.toFixed(2)} s`);
    // Each rider parked in its bay, facing its way, stood still
    const end = scene.step(0).riders;
    scene.riders.forEach((r, k) => {
        const e = end[k], off = Math.hypot(e.x - r.slot.x, e.z - r.slot.z), turn = Math.abs(EndShot.turn(e.heading, r.slot.heading)) * 180 / Math.PI;
        if (!e.parked || off > 0.2 || turn > 3 || e.speed > 0) problems.push(`rider ${k}${r.player ? ' (the player)' : ''} is ${off.toFixed(2)} m off its bay, turned ${turn.toFixed(1)} degrees from it, ${e.parked ? 'parked' : 'not parked'}`);
    });
    // A view down a valley with a town in it is held on the town (the owner: "this view should be a bit higher so we can
    // see the town below")
    const bays = scene.riders.map(r => r.slot);
    const mid = { x: bays.reduce((n, b) => n + b.x, 0) / bays.length, z: bays.reduce((n, b) => n + b.z, 0) / bays.length };
    const atStop = (x, z) => ground(x, z, stop.s);
    // (a town that can be seen from 15 m over the bays: the land not over the line to its middle)
    const over = { x: mid.x, y: atStop(mid.x, mid.z) + 15, z: mid.z };
    const towns = EndShot.views(stop, mid, atStop).map(dir => EndShot.valleyOf(dir, mid, atStop(mid.x, mid.z), atStop, env.data.buildings))
        .filter(v => v && v.houses.length && EndShot.landShare(atStop, over, v.target, 0.5, 60, 8) >= 1);
    if (towns.length && !(scene.hold.town && scene.hold.town.houses > 0)) problems.push(`a town lies down the valley in sight of the stop (${towns[0].houses.length} houses), and the held view is not on it`);
    // Who came in: every rider kept up, none of the far ones
    const came = scene.riders.length - 1;
    const want = Math.min(gaps.length && group === 'kept' ? gaps.length : 0, scene.plan.bays.length - 1);
    if (came !== want) problems.push(`${came} riders of the group came in, want ${want}`);
    return {
        stage: id, group, stop: stop.id, kind: stop.kind, composed: scene.composed, fallback: scene.plan.fallback, aisle: scene.plan.aisle, facing: scene.plan.facing,
        riders: scene.riders.length, bays: scene.plan.bays.length, planMs, frames, playerParkedS: round(scene.playerParkedS), allParkedS: round(scene.allParkedS),
        craneAt: round(scene.craneAt), flyS: round(scene.flyS), cardAt: round(scene.cardAt), arcM: scene.camera.arcM,
        hold: { eye: [round(scene.hold.eye.x), round(scene.hold.eye.y), round(scene.hold.eye.z)], overBaysM: round(scene.hold.eye.y - ground(scene.riders.reduce((n, r) => n + r.slot.x, 0) / scene.riders.length, scene.riders.reduce((n, r) => n + r.slot.z, 0) / scene.riders.length, stop.s)), yawDeg: round(scene.hold.yaw * 180 / Math.PI), pitchDeg: round(scene.hold.pitch * 180 / Math.PI), side: scene.hold.side, town: scene.hold.town ? { houses: scene.hold.town.houses, at: [round(scene.hold.town.x), round(scene.hold.town.y), round(scene.hold.town.z)] } : null },
        worst: { ...worst, moveM: round(worst.moveM, 3), turnDeg: round(worst.turnDeg, 3), lowestM: round(worst.lowestM) }, problems
    };
}

const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

if (import.meta.url === `file://${process.argv[1]}`) {
    const [id, group = 'kept'] = process.argv.slice(2);
    endShot(id, group).then(out => process.stdout.write(JSON.stringify(out)), error => { console.error(error.stack || error); process.exit(1); });
}
