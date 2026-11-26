// The land of a world slice away from the road, in node: where an off-road bike can cross from one leg of the ride to
// another, and a ride across it with the game's own run code (Game.updateWorldRun, restartInPlace and the crash steps
// run against a plain object, as tests/unit/restart.test.js runs them; the real Vehicle, WorldRun and WorldGuide).
//
// crossings(game, env, hairpins) the places, by rule: two points of the ride at least 100 m of road apart and 18 to
//   70 m from each other over the land, clear of every hairpin, with no wall, drop or water in the tile data on the
//   line between them and no step of the land over `steep` in a metre. [{s, s2, d, worst, covers}]
// worldGame(game, env, vehicle) the game object a ride is stepped with: {game, callouts}
// rideAcross(game, env, place, {rider, speed}) rides the road to place.s, then straight over the land at the far
//   leg and along it. Returns {crashes: [cause], cuts, restarts, penaltyMs, callouts, leftS, joinedS, backS, landS,
//   landM, most}: what ended on the far leg's carriageway, and where the game put the bike after
import { readFileSync } from 'node:fs';
import { drawnBarrierNear, parapetAt } from './world-offroad.js';

const DT = 1 / 60, G = 9.81;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

export async function crossings(game, env, hairpins, { steep = 0.8, every = 20, apart = 40 } = {}) {
    const route = env.route, ground = env.ground;
    const found = [];
    for (let s = env.startS + 60; s < env.endS - 200; s += every) {
        if (hairpins.some(h => s > h.s0 - 30 && s < h.s1 + 30)) continue;
        const a = route.sample(s, {});
        let best = null;
        for (let s2 = s + 100; s2 < Math.min(env.endS - 50, s + 900); s2 += 10) {
            if (hairpins.some(h => s2 > h.s0 - 20 && s2 < h.s1 + 20)) continue;
            const b = route.sample(s2, {});
            const d = Math.hypot(b.x - a.x, b.z - a.z);
            if (d >= 18 && d <= 70 && (!best || d < best.d)) best = { s2, d, b };
        }
        if (!best) continue;
        await env.streamer.settle({ x: a.x, z: a.z }, s);
        const { b, d, s2 } = best;
        let open = true, worst = 0, last = null;
        const covers = new Set();
        for (let t = 0; t <= d && open; t += 1) {
            const x = a.x + (b.x - a.x) * t / d, z = a.z + (b.z - a.z) * t / d;
            const y = ground.landY(x, z, a.y);
            if (t >= a.width / 2 + 1.5 && d - t >= b.width / 2 + 1.5) {
                const kind = ground.kindAt(x, z);
                if (kind === 'wall' || kind === 'fall' || ground.tileZone(x, z) === game.WorldData.ZONE.water) open = false;
                covers.add(ground.coverAt(x, z));
                if (last !== null) worst = Math.max(worst, Math.abs(y - last));
            }
            last = y;
        }
        if (open && worst <= steep && !found.some(f => Math.abs(f.s - s) < apart)) found.push({ s, s2, d, worst, covers: [...covers] });
    }
    return found;
}

let Game = null;
export function worldGame(game, env, vehicle) {
    const callouts = [];
    if (!Game) {
        const source = readFileSync(new URL('../../js/main.js', import.meta.url), 'utf8');
        const end = 'Game.RESTART_CLEAR_SEGMENTS = 6;';
        Game = source.slice(0, source.indexOf(end) + end.length);
    }
    const Class = new Function('showCallout', 'HudRules', 'WorldRun', 'Vehicle', 'Route', `${Game}\nreturn Game;`)(
        (text, tone) => callouts.push([text, tone]), { stageClock: ms => String(ms) }, game.WorldRun, game.Vehicle, game.Route);
    const g = Object.create(Class.prototype);
    Object.assign(g, {
        environment: env, vehicle, worldRun: new game.WorldRun(env.route, env.stationGates, env.physics),
        worldCamera: { reset() {} }, traffic: null, input: null, leaderboardService: null, hud: null, particles: null,
        atmosphereTrack: null, weatherSystem: null, snapAtmosphere() {}, atmosphereUnit: () => 0,
        removeRunOverlays() {}, closeWorldConfirm() {}, passCheckpoint() {}, finishRun() {}, addScore() {}, raceElapsed: () => 0,
        score: 0, penaltyMs: 0, restarts: 0, finished: false, worldCrash: null, worldSinceRestartS: Infinity
    });
    return { game: g, callouts, Game: Class };
}

// Pure pursuit toward (tx, tz): the steering input that leans the bike onto the arc to it
function pursue(v, world, tx, tz, reach) {
    const err = wrap(Math.atan2(tx - v.position.x, tz - v.position.z) - v.yawAngle);
    const grip = Math.max(0.01, v.worldMultipliers().lateralFriction);
    const capTan = Math.tan(world.leanCapDeg * Math.PI / 180) * grip;
    const most = Math.min(1 / world.radiusFloor, G * capTan / Math.max(1, v.speed * v.speed));
    const wanted = Math.max(-most, Math.min(most, 2 * Math.sin(err) / reach));
    const lean = -Math.sign(wanted) * Math.atan(v.speed * v.speed * Math.abs(wanted) / G);
    return Math.max(-1, Math.min(1, (v.leanAngle - lean) * 8));
}

export async function rideAcross(game, env, place, { rider, speed = 12, seconds = 40 }) {
    const route = env.route, world = env.physics;
    const s0 = Math.max(env.startS, place.s - 40);
    const p = route.sample(s0, {});
    await env.streamer.settle({ x: p.x, z: p.z }, s0);
    const v = new game.Vehicle(new game.THREE.Scene(), null, game.CHARACTERS.find(c => c.id === rider.character), rider.bike, { model: false });
    v.environment = env;
    v.position.set(p.x, p.y, p.z);
    v.yawAngle = p.heading;
    v.findNearestRoadSegment();
    v.speed = speed;
    const { game: g, callouts } = worldGame(game, env, v);
    g.worldRun.begin(s0);
    env.guide.reset();
    env.guide.onRestart = reason => g.restartFromCheckpoint(reason);
    const far = route.sample(place.s2, {});
    const out = { crashes: [], cuts: 0, restarts: 0, penaltyMs: 0, callouts, leftS: null, joinedS: null, backS: null, landS: 0, landM: 0, most: 0, steepest: 0 };
    const aim = {};
    let phase = 0, after = 0;
    for (let tick = 0; tick < seconds * 60; tick++) {
        const q = v.projection;
        const s = q.index >= 0 ? q.s : s0;
        const onRoad = Math.abs(q.lateral) <= q.width / 2;
        if (phase === 0 && s >= place.s - 8) phase = 1;
        if (phase === 1 && !onRoad && out.leftS === null) out.leftS = s;
        if (phase === 1 && out.leftS !== null && onRoad && Math.abs(s - place.s2) < 80) { phase = 2; out.joinedS = s; }
        let steer;
        if (phase === 1) steer = pursue(v, world, far.x, far.z, Math.max(6, Math.hypot(far.x - v.position.x, far.z - v.position.z)));
        else {
            const reach = Math.max(6, Math.min(30, 3 + 0.7 * v.speed));
            route.sample(s + reach, aim);
            steer = pursue(v, world, aim.x, aim.z, reach);
        }
        const restarts = g.restarts;
        if (!v.crashed) {
            v.update(DT, steer, v.speed < speed ? 1 : 0, v.speed > speed + 2 ? 0.5 : 0, 0);
            if (v.crashed) out.crashes.push(v.crashCause);
        }
        if (v.runoff && !v.crashed) {
            out.landS += DT;
            out.landM += v.speed * DT;
            out.most = Math.max(out.most, v.speed);
            out.steepest = Math.max(out.steepest, v.landSteep);
        }
        g.updateWorldCrash(DT);
        if (!v.crashed && v.projection.index >= 0) {
            g.updateWorldRun(DT);
            env.guide.step({ projection: v.projection, speed: v.speed, yaw: v.yawAngle, dt: DT });
        }
        if (g.restarts > restarts) {
            if (callouts.length && /Cut the road/.test(callouts[callouts.length - 1][0])) out.cuts++;
            out.backS = v.projection.s;
            phase = 3;
        }
        if (phase === 3 && ++after > 5 * 60) break;
    }
    out.restarts = g.restarts;
    out.penaltyMs = g.penaltyMs;
    return out;
}

// Places beside the ride where the tile data has something no bike rides, by rule: every `every` metres and on each
// side, the first node of the tile's zone layer of each kind (wall, drop, water) on the line straight out from the
// road's edge to `reach` metres. {wall: [...], drop: [...], water: [...]} of {s, side, at, x, z}: the point to ride at
export async function hardPlaces(game, env, { every = 40, reach = 60, perKind = 8, apart = 150 } = {}) {
    const route = env.route, ground = env.ground, zones = game.WorldData.ZONE;
    const names = { [zones.wall]: 'wall', [zones.drop]: 'drop', [zones.water]: 'water' };
    const out = { wall: [], drop: [], water: [] };
    for (let s = env.startS + 80; s < env.endS - 80; s += every) {
        const p = route.sample(s, {});
        if (p.flags && (p.flags.tunnel || p.flags.gallery)) continue;
        await env.streamer.settle({ x: p.x, z: p.z }, s);
        for (const side of [-1, 1]) {
            for (let d = 2; d <= reach; d += 2) {
                const lat = side * (p.width / 2 + d);
                const x = p.x + Math.cos(p.heading) * lat, z = p.z - Math.sin(p.heading) * lat;
                const name = names[ground.tileZone(x, z)];
                if (!name) continue;
                // (a metre and a half on, so the bike is well into it)
                const on = side * (p.width / 2 + d + 6);
                if (out[name].length < perKind && !out[name].some(q => Math.abs(q.s - s) < apart)) out[name].push({ s, side, at: d, x: p.x + Math.cos(p.heading) * on, z: p.z - Math.sin(p.heading) * on });
                break;
            }
        }
    }
    return out;
}

// The drawn houses within `reach` metres of the ride, by rule: every `every` metres the scenery of the tiles round
// the road is built as the game builds it (the streamer's settle), and the wall rects it drew are read back
// (Scenery.houseAt reads the same). [{s, x, z, rect}], each house once
export async function drawnHouses(game, env, { every = 100, reach = 45, most = 6 } = {}) {
    const route = env.route;
    const found = [];
    for (let s = env.startS + 80; s < env.endS - 80 && found.length < most; s += every) {
        const p = route.sample(s, {});
        await env.streamer.settle({ x: p.x, z: p.z }, s);
        for (const held of env.scenery.perTile.values()) {
            for (const rect of held.walls || []) {
                if (found.some(f => f.rect.x === rect.x && f.rect.z === rect.z)) continue;
                const q = route.project(rect.x, rect.z, null, {});
                if (q.index < 0 || Math.abs(q.lateral) > q.width / 2 + reach) continue;
                found.push({ s: q.s, x: rect.x, z: rect.z, rect });
            }
        }
    }
    return found;
}

// Rides the road to `place.s` (from 40 m before it), then straight at the point (place.x, place.z) over the land.
// Returns {end, cause, landS, landM, inside, near}: 'crash' with the cause the game shows,
// 'restart' (the guide or the cut rule), 'through' when the bike reached the point, or 'time'; `inside` whether a
// bike that had not crashed was ever inside a drawn house's walls, `near` how close it came to the point
export async function rideAt(game, env, place, { rider, speed = 12, seconds = 30 }) {
    const route = env.route, world = env.physics;
    const s0 = Math.max(env.startS, place.s - 40);
    const p = route.sample(s0, {});
    await env.streamer.settle({ x: p.x, z: p.z }, s0);
    const here = route.sample(place.s, {});
    await env.streamer.settle({ x: here.x, z: here.z }, place.s);
    const v = new game.Vehicle(new game.THREE.Scene(), null, game.CHARACTERS.find(c => c.id === rider.character), rider.bike, { model: false });
    v.environment = env;
    v.position.set(p.x, p.y, p.z);
    v.yawAngle = p.heading;
    v.findNearestRoadSegment();
    v.speed = speed;
    const { game: g, callouts } = worldGame(game, env, v);
    g.worldRun.begin(s0);
    env.guide.reset();
    env.guide.onRestart = reason => g.restartFromCheckpoint(reason);
    const out = { end: 'time', cause: null, landS: 0, landM: 0, inside: false, near: Infinity, callouts };
    const tx = place.x, tz = place.z;
    const aim = {};
    let phase = 0;
    for (let tick = 0; tick < seconds * 60; tick++) {
        const q = v.projection;
        const s = q.index >= 0 ? q.s : s0;
        if (phase === 0 && s >= place.s - Math.max(8, v.speed * 0.8)) phase = 1;
        let steer;
        if (phase === 1) steer = pursue(v, world, tx, tz, Math.max(6, Math.hypot(tx - v.position.x, tz - v.position.z)));
        else {
            const reach = Math.max(6, Math.min(30, 3 + 0.7 * v.speed));
            route.sample(s + reach, aim);
            steer = pursue(v, world, aim.x, aim.z, reach);
        }
        v.update(DT, steer, v.speed < speed ? 1 : 0, v.speed > speed + 2 ? 0.5 : 0, 0);
        if (v.crashed) {
            g.updateWorldCrash(DT);
            out.end = 'crash';
            out.cause = v.crashCause;
            break;
        }
        const near = Math.hypot(place.x - v.position.x, place.z - v.position.z);
        out.near = Math.min(out.near, near);
        if (env.scenery && env.scenery.houseAt && env.scenery.houseAt(v.position.x, v.position.z, 0)) out.inside = true;
        if (v.runoff) { out.landS += DT; out.landM += v.speed * DT; }
        const restarts = g.restarts;
        if (v.projection.index >= 0) {
            g.updateWorldRun(DT);
            env.guide.step({ projection: v.projection, speed: v.speed, yaw: v.yawAngle, dt: DT });
        }
        if (g.restarts > restarts) { out.end = 'restart'; out.cause = callouts.length ? callouts[callouts.length - 1][0] : null; break; }
        if (phase === 1 && near < 1) { out.end = 'through'; break; }
    }
    return out;
}

// A cut of a hairpin, then extra metres on the land before the bike comes back to the road. The bike rides the road
// to `L` metres before the hairpin's tightest point, then straight over the land at the road `L` metres past it (the
// inside lane), as tests/helpers/world-offroad.js cuts one. Once it is on the land with more than `after` metres of
// road skipped, it stays there for `wanderM` metres more: `mode` 'loop' holds full steering at a slow pace, 'zigzag'
// steers full one way and the other by turns. Then it steers back onto the road and rides on. `wanderM` 0 is the cut
// alone. Returns {skipped, wanderM, joinedS, crashes, cuts, restarts, penaltyMs, callouts, leftS, backS, countedS, apexS}: `skipped`
// is the road skipped when the wander began (the ride distance gained less the metres ridden on the land, added up
// from the bike's positions and never under nothing), `joinedS` where it came back onto the carriageway, `wentBack` whether it came
// back onto the carriageway no further on than where it had left it (a rider who turns back)
export async function cutThenWander(game, env, hairpin, { rider, speed = 10, L = 30, after, wanderM = 30, mode = 'loop', seconds = 60 }) {
    const route = env.route, world = env.physics;
    let apex = hairpin.s0, tight = 0;
    for (let s = hairpin.s0; s <= hairpin.s1; s += 1) { const k = Math.abs(route.curvatureAt(s, 8)); if (k > tight) { tight = k; apex = s; } }
    const inside = Math.sign(route.curvatureAt(apex, 8));
    const s0 = Math.max(env.startS, apex - L - 30);
    const p = route.sample(s0, {});
    await env.streamer.settle({ x: p.x, z: p.z }, s0);
    const v = new game.Vehicle(new game.THREE.Scene(), null, game.CHARACTERS.find(c => c.id === rider.character), rider.bike, { model: false });
    v.environment = env;
    v.position.set(p.x, p.y, p.z);
    v.yawAngle = p.heading;
    v.findNearestRoadSegment();
    v.speed = Math.min(speed, 8);
    const { game: g, callouts } = worldGame(game, env, v);
    g.worldRun.begin(s0);
    env.guide.reset();
    env.guide.onRestart = reason => g.restartFromCheckpoint(reason);
    const far = route.sample(apex + L, {});
    const lat = inside * Math.max(0, far.width / 2 - 1.2);
    const tx = far.x + Math.cos(far.heading) * lat, tz = far.z - Math.sin(far.heading) * lat;
    const out = { skipped: 0, wanderM: 0, joinedS: null, wentBack: false, crashes: [], hits: [], cuts: 0, restarts: 0, penaltyMs: 0, callouts, leftS: null, backS: null };
    const aim = {};
    let phase = 0, sum = 0, last = null, done = 0, weave = 0;
    for (let tick = 0; tick < seconds * 60; tick++) {
        const q = v.projection;
        const s = q.index >= 0 ? q.s : s0;
        const onRoad = Math.abs(q.lateral) <= q.width / 2;
        if (phase === 0 && s >= apex - L) phase = 1;
        if (phase === 1 && !onRoad && out.leftS === null) out.leftS = s;
        if (phase === 1 && wanderM > 0 && v.runoff && sum > after) { phase = 2; out.skipped = sum; }
        if (phase === 1 && onRoad && out.leftS !== null && sum > after) { phase = 3; out.skipped = sum; }
        if (phase === 2 && out.wanderM >= wanderM) phase = 3;
        if (phase === 3 && onRoad && out.joinedS === null) out.joinedS = s;
        // Back on the carriageway no further on than where it left it: the rider turned back, which is free
        if (phase >= 2 && phase <= 3 && onRoad && out.leftS !== null && s <= out.leftS + world.cutSkipM) out.wentBack = true;
        let steer, want = speed;
        if (phase === 1) steer = pursue(v, world, tx, tz, Math.max(6, Math.hypot(tx - v.position.x, tz - v.position.z)));
        else if (phase === 2) {
            weave += DT;
            steer = mode === 'loop' ? 1 : (Math.floor(weave / 1.5) % 2 ? -1 : 1);
            want = 4;
        } else {
            const reach = Math.max(6, Math.min(30, 3 + 0.7 * v.speed));
            route.sample(s + reach, aim);
            steer = pursue(v, world, aim.x, aim.z, reach);
        }
        const restarts = g.restarts;
        const x0 = v.position.x, z0 = v.position.z;
        if (!v.crashed) {
            v.update(DT, steer, v.speed < want ? 1 : 0, v.speed > want + 1 ? 0.6 : 0, 0);
            if (v.crashed) {
                out.crashes.push(v.crashCause);
                // (and where, and whether a barrier is drawn there: drawnBarrierNear)
                out.hits.push({ s: Math.round(v.projection.s), lateral: Math.round(v.projection.lateral * 100) / 100, cause: v.crashCause, parapet: parapetAt(env, v), drawn: drawnBarrierNear(game, env, v.position.x, v.position.z, v.projection.y) });
            }
        }
        const moved = Math.hypot(v.position.x - x0, v.position.z - z0);
        if (!v.crashed && v.projection.index >= 0) {
            if (v.runoff) {
                sum = Math.max(0, sum + v.projection.s - (last === null ? s : last) - moved);
                if (phase === 2) out.wanderM += moved;
            }
            last = v.projection.s;
        }
        g.updateWorldCrash(DT);
        if (!v.crashed && v.projection.index >= 0) {
            g.updateWorldRun(DT);
            env.guide.step({ projection: v.projection, speed: v.speed, yaw: v.yawAngle, dt: DT });
        }
        if (g.restarts > restarts) {
            if (callouts.length && /Cut the road/.test(callouts[callouts.length - 1][0])) out.cuts++;
            out.backS = v.projection.s;
            phase = 4;
        }
        if ((phase === 4 || (phase === 3 && out.joinedS !== null)) && ++done > 4 * 60) break;
    }
    out.restarts = g.restarts;
    out.penaltyMs = g.penaltyMs;
    // How far the run counted the ride, and the station it was at
    out.countedS = g.worldRun.lastS;
    out.apexS = apex;
    return out;
}
