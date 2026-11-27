// A whole ride of a world's chase camera through the real Game.updateCamera, with a kinematic bike on the route's
// centre at a pilot's speed, and the view's yaw rate, yaw acceleration and sideways swing it gives
// (tests/unit/world-camera-chicane.test.js, tools/terrain-check.mjs world-camera-chicane reads the same numbers off
// the real pilot). The bike's speed takes each bend at apFactor of the speed its lean cap allows, braking for it at
// brakeMs2 and speeding up at gainMs2, as tools/autopilot.js's world pilot does.
import { readFileSync } from 'node:fs';

export const DT = 1 / 60;
export const G = 9.81;

// The chase views of Game.setupCamera, by their type
export const CHASE_MODES = { near: 'near', far: 'far' };

// The bike's speed plan: apFactor of the bend's speed at the lean cap, braking brakeMs2 for it, speeding up gainMs2
export const PILOT = { apFactor: 0.85, brakeMs2: 6, gainMs2: 3, leanCapDeg: 50 };

// The corners of the view's near plane, in normalised device coordinates
const NEAR_CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

// Frames over which the yaw acceleration and the sideways rate are measured (0.1 s): the frame-to-frame steps are
// the smoothness probe's (world-camera-smooth); this measures the swing a rider sees
export const SPAN = 6;

// The Game class from js/main.js, built against the real three and WorldCamera
export function gameClass(THREE, WorldCamera) {
    const source = readFileSync(new URL('../../js/main.js', import.meta.url), 'utf8');
    const end = 'Game.RESTART_CLEAR_SEGMENTS = 6;';
    const classSource = source.slice(0, source.indexOf(end) + end.length);
    return new Function('THREE', 'WorldCamera', 'showCallout', 'TourSystem', 'Course', `${classSource}\nreturn Game;`)(THREE, WorldCamera, () => {}, {}, {});
}

// The view modes of Game.setupCamera (setupCamera itself reads the window and the saved view)
export function modesOf(THREE) {
    const source = readFileSync(new URL('../../js/main.js', import.meta.url), 'utf8');
    const text = /this\.cameraModes = (\[[\s\S]*?\]);/.exec(source)[1];
    return new Function('THREE', `return ${text};`)(THREE);
}

// The room a point (x, y, z) has in the ride's tunnel or gallery, read from the route as RoadMesh.tunnel builds the tube
// (its walls RoadMesh.TUBE_WALL_M past half the road's width, its roof WorldRoute.ROOF_M over the road), looked for within
// `units` route samples of `index`: the least of its room under the roof and to the nearer wall (m, below 0 through
// it), Infinity outside a tube and in front of a portal
export function tubeRoom(game, route, x, y, z, index, units = 12, out = {}, env = game.environment) {
    const { RoadMesh, WorldRoute } = game;
    const from = Math.max(0, index - units), to = Math.min(route.points.length - 2, index + units);
    route.nearestSegment(x, z, from, to, out);
    const a = route.points[out.index], b = route.points[out.index + 1];
    const tube = WorldRoute.FLAG.tunnel | WorldRoute.FLAG.gallery;
    if (!(a.bits & b.bits & tube)) return Infinity;
    // (past either end of the segment's chord the nearest point is its end: that is in front of a portal)
    const before = route.points[out.index - 1], after = route.points[out.index + 2];
    if ((out.along <= 0 && !(before && before.bits & tube)) || (out.along >= 1 && !(after && after.bits & tube))) return Infinity;
    // (a point more than a tube's height off this road's level is in another leg's tube or over the hill)
    if (Math.abs(y - out.y) > WorldRoute.ROOF_M + 3) return Infinity;
    const wall = out.width / 2 + RoadMesh.TUBE_WALL_M - out.distance;
    // (outside the walls, at the tube's own level: through a wall; in a rounded tube to its curve too, StructureStyles)
    const info = env && env.tubeInfo ? env.tubeInfo() : null;
    const run = info && info.run[out.index] >= 0 ? info.runs[info.run[out.index]] : null;
    return game.StructureStyles.roomAt(run ? run.profile : 'box', wall, y - out.y, WorldRoute.ROOF_M);
}

// The speed (m/s) at every `step` metres from s0 to s1 that a pilot cruising at `cruise` rides
export function speedPlan(route, s0, s1, cruise, step = 0.5) {
    const k = s => Math.abs(route.curvatureAt(s, 6));
    const corner = s => {
        const c = k(s);
        return c < 1e-4 ? cruise : Math.min(cruise, PILOT.apFactor * Math.sqrt(G * Math.tan(PILOT.leanCapDeg * Math.PI / 180) / c));
    };
    const n = Math.ceil((s1 - s0) / step) + 1;
    const want = new Float64Array(n);
    for (let i = 0; i < n; i++) want[i] = corner(s0 + i * step);
    // Braking for what is ahead, then speeding up from what is behind
    for (let i = n - 2; i >= 0; i--) want[i] = Math.min(want[i], Math.sqrt(want[i + 1] ** 2 + 2 * PILOT.brakeMs2 * step));
    want[0] = Math.min(want[0], 5);
    for (let i = 1; i < n; i++) want[i] = Math.max(5, Math.min(want[i], Math.sqrt(want[i - 1] ** 2 + 2 * PILOT.gainMs2 * step)));
    return s => want[Math.max(0, Math.min(n - 1, Math.round((s - s0) / step)))];
}

// One ride from s0 to s1 in `mode` (CHASE_MODES), in free roam with `roam`: rows of {s, t, speed, yaw (the view's),
// across (the camera's distance across the road from the bike), screen (the bike's place across the view, -1 to 1), room (the bike's least
// distance to a side of the view, 1 in the middle, below 0 out of view), seen (the road 30 m on is in view), under (the
// least room in a tube of the eye and the near plane's corners, tubeRoom; Infinity in the open), x, z (the
// bike), ex, ey, ez (the camera)}
export function chaseRide(game, env, { s0, s1, mode = CHASE_MODES.near, cruise = 20, lane = 0, roam = false }) {
    const { THREE, WorldCamera } = game;
    const Game = game.Game || (game.Game = gameClass(THREE, WorldCamera));
    const route = env.route;
    const plan = speedPlan(route, s0, s1, cruise);
    const at = {};
    const start = route.sample(s0, at);
    const vehicle = {
        position: new THREE.Vector3(start.x, start.y, start.z), velocity: new THREE.Vector3(), speed: plan(s0), maxSpeed: 60,
        leanAngle: 0, yawAngle: start.heading, comfortShake: 1, isWheelie: false, isJumping: false, fallingOffCliff: false,
        crashed: false, projection: { s: s0, index: Math.floor(route.toUnits(s0)) }, routeS: s0
    };
    const g = Object.create(Game.prototype);
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.25, 5000);
    // (as Game builds it: a road overhead and a tube's roof)
    const worldCamera = new WorldCamera(route, env.ground, (x, z, y) => Math.min(env.overheadY(x, z, y), env.tubeRoofY(x, z, y)), (x, z, reach) => env.cameraFaces(x, z, reach));
    Object.assign(g, { camera, vehicle, environment: env, worldCamera, cameraIntroActive: false });
    const table = modesOf(THREE);
    const index = table.findIndex(m => m.type === mode);
    if (index < 0) throw new Error(`No chase view ${mode}`);
    Object.assign(g, {
        cameraModes: table, cameraMode: index, baseCameraOffset: table[index].offset.clone(),
        cameraOffset: table[index].offset.clone(), cameraTarget: new THREE.Vector3(),
        currentCameraPos: camera.position.clone(), currentLookTarget: new THREE.Vector3(),
        tempMatrix: new THREE.Matrix4(), tempVector: new THREE.Vector3(), tempUpVector: new THREE.Vector3(),
        cameraLerpFactor: table[index].lerpFactor, cameraLateralOffset: 0, previousYawAngle: start.heading,
        currentCameraBanking: 0, updateShadowCamera() {}
    });
    worldCamera.reset(start.heading);
    // (free roam: Game.startFreeRoam)
    worldCamera.followRider = roam;
    const dir = new THREE.Vector3(), bike = new THREE.Vector3(), road = new THREE.Vector3(), corner = new THREE.Vector3(), ahead = {}, nearAt = {};
    const rows = [];
    const random = Math.random;
    Math.random = () => 0.5;
    try {
        let s = s0, t = 0;
        while (s <= s1) {
            const p = route.sample(s, at);
            const speed = plan(s);
            const k = route.curvatureAt(s - 3, 6);
            vehicle.position.set(p.x + lane * Math.cos(p.heading), p.y, p.z - lane * Math.sin(p.heading));
            vehicle.yawAngle = p.heading;
            vehicle.speed = speed;
            // (Vehicle's sign: a lean into a turn toward +heading is negative)
            vehicle.leanAngle = -Math.sign(k) * Math.min(PILOT.leanCapDeg * Math.PI / 180, Math.atan(speed * speed * Math.abs(k) / G));
            vehicle.projection.s = s;
            vehicle.projection.index = Math.floor(route.toUnits(s));
            vehicle.projection.lateral = lane;
            vehicle.projection.width = p.width;
            vehicle.routeS = s;
            g.updateCamera(DT);
            camera.getWorldDirection(dir);
            const e = camera.position;
            const across = (e.x - vehicle.position.x) * Math.cos(p.heading) - (e.z - vehicle.position.z) * Math.sin(p.heading);
            camera.updateMatrixWorld(true);
            bike.set(vehicle.position.x, vehicle.position.y + 0.9, vehicle.position.z).project(camera);
            // (the bike's room to the nearest side of the view, 1 in the middle, and whether the road 30 m on is in view)
            const room = bike.z > -1 && bike.z < 1 ? 1 - Math.max(Math.abs(bike.x), Math.abs(bike.y)) : -1;
            const q = route.sample(s + 30, ahead);
            road.set(q.x, q.y, q.z).project(camera);
            const seen = Math.abs(road.x) <= 1 && Math.abs(road.y) <= 1 && road.z < 1;
            // (the least room in a tube of the eye and of the near plane's corners, Infinity in the open)
            let under = tubeRoom(game, route, e.x, e.y, e.z, vehicle.projection.index, 12, nearAt, env);
            for (const [cx, cy] of NEAR_CORNERS) {
                corner.set(cx, cy, -1).unproject(camera);
                under = Math.min(under, tubeRoom(game, route, corner.x, corner.y, corner.z, vehicle.projection.index, 12, nearAt, env));
            }
            rows.push({ s, t, speed, yaw: Math.atan2(dir.x, dir.z), across, screen: bike.x, room, seen, under, x: vehicle.position.x, z: vehicle.position.z, ex: e.x, ey: e.y, ez: e.z });
            s += speed * DT;
            t += DT;
        }
    } finally {
        Math.random = random;
    }
    return rows;
}

const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

// Per frame: the view's yaw rate (rad/s), its yaw acceleration (rad/s^2, a second difference over SPAN frames) and
// the bike's sideways rate across the view (half views a second, over SPAN frames: the camera's swing as the rider
// sees it). Each row gains {rate, accel, sway}
export function swingOf(rows, dt = DT) {
    const h = SPAN;
    for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        r.rate = r.accel = r.sway = 0;
        if (i < 1 || i >= rows.length - 1) continue;
        r.rate = wrap(rows[i + 1].yaw - rows[i - 1].yaw) / (2 * dt);
        if (i < h || i >= rows.length - h) continue;
        r.accel = (wrap(rows[i + h].yaw - r.yaw) - wrap(r.yaw - rows[i - h].yaw)) / (h * dt) ** 2;
        r.sway = (rows[i + h].screen - rows[i - h].screen) / (2 * h * dt);
    }
    return rows;
}

// The road's shape round s: the least radius (m) within `reach`, the net turn and the turn each way (rad), and a
// name: a hairpin (150 degrees or more one way), an S (a bend each way of 0.35 rad or more, radius under 60 m) or a bend
export function shapeAt(route, s, reach = 50) {
    let least = Infinity, left = 0, right = 0;
    const step = 2;
    for (let d = -reach; d < reach; d += step) {
        const k = route.curvatureAt(s + d, step);
        least = Math.min(least, 1 / Math.max(1e-6, Math.abs(k)));
        if (k > 0) left += k * step; else right -= k * step;
    }
    const name = Math.max(left, right) >= 150 * Math.PI / 180 ? 'hairpin' : (Math.min(left, right) >= 0.35 && least < 60 ? 'S' : 'bend');
    return { radius: Math.round(least), net: Math.round((left - right) * 180 / Math.PI), left: Math.round(left * 180 / Math.PI), right: Math.round(right * 180 / Math.PI), name };
}

// The `count` places of a ride with the largest peak yaw acceleration: rows are binned by `bin` metres of s, a place
// is a bin and its two neighbours, and a place is not counted again within `apart` metres of a worse one
export function worstPlaces(rows, count = 10, bin = 20, apart = 80) {
    const bins = new Map();
    for (const r of rows) {
        const key = Math.floor(r.s / bin);
        const b = bins.get(key) || { s: key * bin + bin / 2, rate: 0, accel: 0, sway: 0, rateAt: 0, accelAt: 0 };
        if (Math.abs(r.rate) > b.rate) { b.rate = Math.abs(r.rate); b.rateAt = r.s; }
        if (Math.abs(r.accel) > b.accel) { b.accel = Math.abs(r.accel); b.accelAt = r.s; }
        b.sway = Math.max(b.sway, Math.abs(r.sway));
        bins.set(key, b);
    }
    const out = [];
    for (const b of [...bins.values()].sort((a, c) => c.accel - a.accel)) {
        if (out.some(o => Math.abs(o.accelAt - b.accelAt) < apart)) continue;
        out.push(b);
        if (out.length >= count) break;
    }
    return out;
}

// The peaks of a ride, or of its rows within `reach` metres of any of `places` (s values)
// {rate, accel, sway} the largest of each, room the bike's least room in the view
export function peaksOf(rows, places = null, reach = 40) {
    let rate = 0, accel = 0, sway = 0, room = Infinity;
    for (const r of rows) {
        if (places && !places.some(p => Math.abs(r.s - p) <= reach)) continue;
        rate = Math.max(rate, Math.abs(r.rate));
        accel = Math.max(accel, Math.abs(r.accel));
        sway = Math.max(sway, Math.abs(r.sway));
        room = Math.min(room, r.room);
    }
    return { rate, accel, sway, room };
}

// The share of frames in a hairpin (a turn over 115 degrees from 40 m back to 40 m on, as world-camera has it) on
// which the road 30 m on is in view
export function aheadShare(route, rows) {
    let frames = 0, seen = 0;
    for (const r of rows) {
        let turn = 0;
        for (let d = -36; d <= 40; d += 4) turn += route.headingChange(r.s + d - 4, r.s + d);
        if (Math.abs(turn) * 180 / Math.PI <= 115) continue;
        frames++;
        if (r.seen) seen++;
    }
    return frames ? seen / frames : 1;
}

// The ride's chicanes: every place where the road bends each way within `reach` metres either side, at least
// CHICANE.leastRad each way with a radius under CHICANE.radiusM somewhere there (an S, and a pair of hairpins one each
// way), found from the route alone so any world has its own. [{s, left, right, radius}], s at the place where the
// lesser of the two turns is largest
export const CHICANE = { leastRad: 0.35, radiusM: 60, reach: 50, stepM: 5, apartM: 100 };
export function chicanesOf(route, from, to) {
    const out = [];
    let run = null;
    for (let s = from; s <= to; s += CHICANE.stepM) {
        const shape = shapeAt(route, s, CHICANE.reach);
        const least = Math.min(shape.left, shape.right) * Math.PI / 180;
        if (least < CHICANE.leastRad || shape.radius >= CHICANE.radiusM) continue;
        if (!run || s - run.last > CHICANE.apartM) { run = { last: s, s, least, shape }; out.push(run); }
        run.last = s;
        if (least > run.least) Object.assign(run, { s, least, shape });
    }
    return out.map(r => ({ s: r.s, left: r.shape.left, right: r.shape.right, radius: r.shape.radius }));
}

// A whole stage, in parts with the land round each part loaded: {whole, places, rows}
export async function stageRide(game, env, { mode = CHASE_MODES.near, cruise = 20, from = null, to = null, part = 400 } = {}) {
    const s0 = from ?? env.startS + 20, s1 = to ?? env.endS - 30;
    const rows = [];
    for (let a = s0; a < s1; a += part) {
        const middle = Math.min(s1, a + part / 2);
        const p = env.route.sample(middle, {});
        env.update(p, middle, null, Infinity);
        await env.streamer.settle(p, middle);
        // (each part starts 80 m early, so the camera has settled by its first counted frame)
        rows.push(...chaseRide(game, env, { s0: Math.max(s0, a - 80), s1: Math.min(s1, a + part), mode, cruise }).filter(r => r.s >= a));
    }
    swingOf(rows);
    return rows;
}

// node tests/helpers/world-chase-ride.js <id> [view near|far] [cruise m/s] [from s] [to s]: the peaks over the stage and
// its ten worst places, as JSON
if (import.meta.url === `file://${process.argv[1]}`) {
    const [id, mode = 'near', cruise = '20', from, to] = process.argv.slice(2);
    const { loadGame } = await import('./load-game.js');
    const { diskFetch } = await import('./world-fetch.js');
    const game = loadGame(undefined, []);
    const { fetchFn } = diskFetch();
    const env = await game.WorldEnvironment.load(new game.THREE.Scene(), { id, search: '', fetchFn, models: null, digest: async () => '0' });
    const rows = await stageRide(game, env, { mode, cruise: Number(cruise), from: from ? Number(from) : null, to: to ? Number(to) : null });
    const round = n => Math.round(n * 100) / 100;
    const places = worstPlaces(rows, 10).map(p => ({ s: Math.round(p.accelAt), rate: round(p.rate), accel: round(p.accel), sway: round(p.sway), ...shapeAt(env.route, p.accelAt) }));
    const whole = peaksOf(rows);
    process.stdout.write(JSON.stringify({ id, mode, cruise: Number(cruise), frames: rows.length, whole: { rate: round(whole.rate), accel: round(whole.accel), sway: round(whole.sway), room: round(whole.room), ahead: round(aheadShare(env.route, rows)) }, places }) + '\n');
}
