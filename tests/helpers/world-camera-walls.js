// The chase camera of a world against what stands beside the road: retaining walls and their parapets, buildings and
// the land. Shared by tests/unit/world-camera-walls.test.js. It reads the walls from the builders' own records (the
// ride's wall plan, the side roads' runs, the houses' wall rects) with its own geometry, not the camera's, so a
// mistake in the camera's test of a wall is not repeated here.
//
// solidsOf(game, env) lists the walls and houses standing now (the caller streams the place in first):
//   - walls: a vertical face from each run's top line (the road's edge) down to its foot, and up by the parapet where
//     the run has one (RoadMesh.PARAPET_DROP_M of wall or more)
//   - houses: the wall rect of every house drawn, from the land under it up to HOUSE_H_M
// sightBlock(game, env, solids, from, to, index) is the first thing the segment from `from` to `to` meets:
// {kind: 'wall' | 'house' | 'land', share}, or null with a clear line.
// cameraRide(game, env, camera, options) rides a kinematic bike along the centre line from s0 to s1 at `speed`,
// leaned as the speed and the bend ask (or held at `lean`, signed by the bend, for the worst case), with the swing
// Game gives the camera (Game.worldCameraInput), and reads the line from the bike to the camera on every frame.
const DT = 1 / 60, G = 9.81;

// The height a house is taken to stand over the highest land under it (the camera's own table has its own value)
export const HOUSE_H_M = 9;

export const MODES = {
    Standard: { type: 'follow', offset: { x: 0, y: 3, z: -6 }, follow: 0.10 },
    'High View': { type: 'high', offset: { x: 0, y: 8, z: -12 }, follow: 0.08 }
};

// The ride's hairpins: [{apex, s0, s1}], a turn of 150 degrees or more inside 80 m (as tools/terrain-check.mjs
// worldHairpins finds them, from the route alone, so any world has its own), with the stretch a ride of one covers
export function hairpinsOf(route, beforeM = 70, afterM = 60) {
    const turnAt = s => {
        let total = 0;
        for (let d = -40; d < 40; d += 4) total += route.headingChange(s + d, s + d + 4);
        return Math.abs(total);
    };
    const out = [];
    let run = null;
    for (let s = 40; s < route.length - 40; s += 4) {
        const turn = turnAt(s);
        if (turn < 150 * Math.PI / 180) continue;
        if (!run || s - run.last > 8) { run = { last: s, best: s, turn }; out.push(run); }
        run.last = s;
        if (turn > run.turn) { run.turn = turn; run.best = s; }
    }
    return out.map(r => ({ apex: r.best, s0: Math.max(10, r.best - beforeM), s1: Math.min(route.length - 10, r.best + afterM) }));
}

// `near`: {x, z, reach} keeps only what stands within `reach` of the place
export function solidsOf(game, env, near = null) {
    const { RoadMesh } = game;
    const walls = [], houses = [];
    const seen = new Set();
    const far = (x, z) => near && Math.hypot(x - near.x, z - near.z) > near.reach;
    const take = run => {
        for (let k = 0; k + 1 < run.points.length; k++) {
            const a = run.points[k], b = run.points[k + 1];
            if (far(a[0], a[2]) && far(b[0], b[2])) continue;
            const id = `${Math.round(a[0] * 100)},${Math.round(a[2] * 100)},${Math.round(b[0] * 100)},${Math.round(b[2] * 100)}`;
            if (seen.has(id)) continue;
            seen.add(id);
            const fa = run.foot ? run.foot[k] : a[1], fb = run.foot ? run.foot[k + 1] : b[1];
            const rail = a[1] - fa >= RoadMesh.PARAPET_DROP_M || b[1] - fb >= RoadMesh.PARAPET_DROP_M ? RoadMesh.PARAPET_H_M : 0;
            // (mx, mz, half: its middle and half its length, to pass by a wall that is nowhere near)
            walls.push({ ax: a[0], az: a[2], bx: b[0], bz: b[2], topA: a[1] + rail, topB: b[1] + rail, footA: Math.min(fa, a[1]), footB: Math.min(fb, b[1]), mx: (a[0] + b[0]) / 2, mz: (a[2] + b[2]) / 2, half: Math.hypot(b[0] - a[0], b[2] - a[2]) / 2 });
        }
    };
    for (const section of env.streamer.sections) {
        if (!env.roadMeshes.has(section.index)) continue;
        for (const run of env.rideWalls(section.index).runs) take(run);
    }
    for (const runs of env.sideWalls.values()) for (const run of runs) take(run);
    for (const held of env.scenery.perTile.values()) for (const w of held.walls || []) if (!far(w.x, w.z)) houses.push(w);
    return { walls, houses };
}

export function sightBlock(game, env, solids, from, to, index, landStepM = 0.3) {
    let best = null;
    const note = (kind, share, more) => { if (!best || share < best.share) best = { kind, share, ...more }; };
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const reach = Math.hypot(dx, dz);
    for (const w of solids.walls) {
        if (Math.abs(w.mx - from.x) > reach + w.half || Math.abs(w.mz - from.z) > reach + w.half) continue;
        const ex = w.bx - w.ax, ez = w.bz - w.az;
        const d = dx * ez - dz * ex;
        if (Math.abs(d) < 1e-12) continue;
        const t = ((w.ax - from.x) * ez - (w.az - from.z) * ex) / d;
        const u = ((w.ax - from.x) * dz - (w.az - from.z) * dx) / d;
        if (t <= 0 || t >= 1 || u < 0 || u > 1) continue;
        const y = from.y + dy * t;
        if (y < w.topA + (w.topB - w.topA) * u && y > w.footA + (w.footB - w.footA) * u) note('wall', t, { x: from.x + dx * t, z: from.z + dz * t });
    }
    for (const h of solids.houses) {
        const cos = Math.cos(h.heading), sin = Math.sin(h.heading);
        // The segment in the rect's own frame, clipped to it (slabs)
        const ax = (from.x - h.x) * cos - (from.z - h.z) * sin, az = (from.x - h.x) * sin + (from.z - h.z) * cos;
        const bx = dx * cos - dz * sin, bz = dx * sin + dz * cos;
        let t0 = 0, t1 = 1;
        for (const [p, q, half] of [[ax, bx, h.across / 2], [az, bz, h.along / 2]]) {
            if (Math.abs(q) < 1e-12) { if (Math.abs(p) > half) t0 = 2; continue; }
            const lo = (-half - p) / q, hi = (half - p) / q;
            t0 = Math.max(t0, Math.min(lo, hi));
            t1 = Math.min(t1, Math.max(lo, hi));
        }
        if (t0 > t1) continue;
        const land = env.ground.landY(h.x, h.z, from.y);
        if (Math.min(from.y + dy * t0, from.y + dy * t1) < land + HOUSE_H_M) note('house', t0, { x: h.x, z: h.z });
    }
    const length = Math.hypot(dx, dy, dz);
    const hint = { start: Math.max(0, index - 8), end: index + 8 };
    for (let d = landStepM; d <= length; d += landStepM) {
        const t = d / length;
        if (best && t >= best.share) break;
        const x = from.x + dx * t, z = from.z + dz * t;
        if (landAt(env, x, z, hint) > from.y + dy * t) { note('land', t, { x, z }); break; }
    }
    return best;
}

// The land at (x, z) as the physics has it near the ride samples of `hint`. A side road's deck DECK_OVER_M or more
// over both the ride there and the land under it is a bridge over the ride, not land: the land under it is
const DECK_OVER_M = 2.5;
const located = {};
export function landAt(env, x, z, hint) {
    const ground = env.ground;
    const y = ground.groundY(x, z, hint, false, located);
    if (y - located.roadY <= DECK_OVER_M || ground.sideRoadY(x, z) !== y) return y;
    const under = ground.landY(x, z, located.roadY);
    return y - under > DECK_OVER_M ? under : y;
}

// The least distance in plan from `p` ({x, y, z}) to a wall face that stands at p's height (its top over p.y - upM, its
// foot under p.y), and to a house; Infinity with none within `withinM`
export function wallGap(solids, p, upM = 0, withinM = 2) {
    let least = Infinity;
    for (const w of solids.walls) {
        if (Math.abs(w.mx - p.x) > withinM + w.half || Math.abs(w.mz - p.z) > withinM + w.half) continue;
        const ex = w.bx - w.ax, ez = w.bz - w.az, run = ex * ex + ez * ez;
        const u = run === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - w.ax) * ex + (p.z - w.az) * ez) / run));
        const d = Math.hypot(w.ax + ex * u - p.x, w.az + ez * u - p.z);
        if (d >= least) continue;
        if (p.y - upM < w.topA + (w.topB - w.topA) * u && p.y > w.footA + (w.footB - w.footA) * u) least = d;
    }
    for (const h of solids.houses) {
        const cos = Math.cos(h.heading), sin = Math.sin(h.heading);
        const ax = Math.abs((p.x - h.x) * cos - (p.z - h.z) * sin) - h.across / 2, az = Math.abs((p.x - h.x) * sin + (p.z - h.z) * cos) - h.along / 2;
        least = Math.min(least, Math.hypot(Math.max(0, ax), Math.max(0, az)));
    }
    return least;
}

// `lean`: null for the lean the speed and the bend ask, or radians held into the bend (negative: out of it).
// `watch(frame)` is called with every frame's {s, bike, camera, block, distance}
// `far` and `swing` multiply the boom and the swing as the tuning rows camDistance and camSwing do (Game.tune)
export function cameraRide(game, env, camera, { s0, s1, speed, mode, lean = null, lane = 0, nearM = 0.4, far = 1, swing = 1, solids, watch = null }) {
    const { WorldCamera, WorldAssist } = game;
    const route = env.route, physics = env.physics;
    const high = mode.type === 'high';
    const at = {}, bike = {}, eye = {};
    const input = { offset: {}, swing: {} };
    const out = { frames: 0, wall: 0, house: 0, land: 0, near: 0, gap: Infinity, first: [], step: 0, stepAt: null, share: 0, shareAt: null, least: Infinity, most: 0 };
    let last = null;
    // The bend's own side (+1 toward +lateral), one for the whole ride: a lane or a held lean does not flip with the
    // curvature's sign on the straights
    const bend = Math.sign(camera.turn(s0, s1)) || 1;
    camera.reset(route.sample(s0, at).heading);
    for (let s = s0; s <= s1; s += speed * DT) {
        camera.centre(s, at);
        const k = WorldAssist.curvature(route, physics, s);
        // (Vehicle's sign: the lean into a bend toward +lateral is negative)
        const angle = lean === null ? -Math.sign(k) * Math.min(physics.leanCapDeg * Math.PI / 180, Math.atan(speed * speed * Math.abs(k) / G)) : -bend * lean;
        // `lane` metres toward the outside of the bend (negative: the inside)
        const side = lane * -bend;
        at.x += side * Math.cos(at.heading);
        at.z -= side * Math.sin(at.heading);
        input.x = at.x; input.y = at.y; input.z = at.z;
        input.s = s;
        input.index = Math.floor(route.toUnits(s));
        input.speed = speed;
        input.lift = high ? 2 : 1;
        input.offset.x = mode.offset.x;
        input.offset.y = WorldCamera.speedHeight(mode.offset.y, speed) * far;
        input.offset.z = mode.offset.z * far;
        input.swing.x = -angle * (high ? 3 : 2) * swing;
        input.swing.look = -angle * (high ? 2 : 4) * swing;
        input.swing.follow = mode.follow;
        input.swing.lookFollow = Math.min(mode.follow * 1.5, 1);
        input.aspect = 16 / 9;
        input.fov = high ? 70 : 75;
        const p = camera.update(input, DT);
        bike.x = at.x; bike.y = at.y + 1; bike.z = at.z;
        eye.x = p.x; eye.y = p.y; eye.z = p.z;
        const block = sightBlock(game, env, solids, bike, eye, input.index);
        const distance = Math.hypot(p.x - at.x, p.y - at.y, p.z - at.z);
        out.frames++;
        const gap = wallGap(solids, eye);
        out.gap = Math.min(out.gap, gap);
        if (gap < nearM) { out.near++; if (!block && out.first.length < 4) out.first.push({ s: Math.round(s * 10) / 10, kind: 'near', gap: Math.round(gap * 100) / 100, x: Math.round(eye.x), z: Math.round(eye.z) }); }
        if (block) {
            out[block.kind]++;
            if (out.first.length < 4) out.first.push({ s: Math.round(s * 10) / 10, kind: block.kind, share: Math.round(block.share * 100) / 100, x: Math.round(block.x), z: Math.round(block.z) });
        }
        if (last !== null && Math.abs(distance - last) > out.step) { out.step = Math.abs(distance - last); out.stepAt = Math.round(s * 10) / 10; }
        // (and as a share of the distance: a tuned boom twice as long moves twice as many metres on the same springs)
        if (last !== null && Math.abs(distance - last) / last > out.share) { out.share = Math.abs(distance - last) / last; out.shareAt = Math.round(s * 10) / 10; }
        out.least = Math.min(out.least, distance);
        out.most = Math.max(out.most, distance);
        last = distance;
        if (watch) watch({ s, bike, camera: eye, block, distance, input });
    }
    return out;
}
