// Riding off the road on a world slice in node: the real Vehicle, WorldRun (the cut rule) and WorldGuide (the
// off-route restart) on the streamed world, a fixed step at a time as Game runs them, at full throttle.
//
// offRoadPlaces(game, env, hairpins) picks places to leave the road, by what the land beside it is:
//   - grass: a straight with gentle land on one side (no slope over 0.15 from 2 to 14 m past the edge)
//   - steep: a straight with land on one side steeper than 0.9 from 3 to 10 m past the edge, and no wall or drop
//   - outside: the outside of a hairpin at its tightest
//   - inside: the inside of a hairpin (the cut across it is ridden by cutHairpin)
// leaveRoad(game, env, place, {speed, mode}) puts the bike 1 m inside the edge at `speed` and rides it off at full
// throttle: mode 'exit' heads 20 degrees off the road with no steering, mode 'along' steers to hold a line 6 m past
// the edge, parallel to the road. It returns {end, endS, entry, at2, at5, offM, offS, cause}: how the ride ended
// ('crash', 'cut', 'restart' or 'ride' at the time limit), when (s after leaving the carriageway), the entry speed,
// the speed 2 s and 5 s after leaving it (null when the ride ended first), and the distance and time off it.
// cutHairpin(game, env, hairpin, {speed}) rides the hairpin twice from 40 m before it to 15 m past it: on the road
// (a pilot at the speed the bend allows, at most `speed`), and straight across its inside (aimed at the exit, full
// throttle up to `speed`). It returns {road, cut}: each {time, end, cause}, the time to the exit, or how it ended.
const DT = 1 / 60, G = 9.81, CONFIRM_S = 1.5;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

function probeLand(env, s, side, d) {
    const route = env.route, ground = env.ground;
    const p = route.sample(s, {});
    const lat = side * (p.width / 2 + d);
    const x = p.x + Math.cos(p.heading) * lat, z = p.z - Math.sin(p.heading) * lat;
    const units = route.toUnits(s);
    const loc = ground.locate(x, z, { start: Math.max(0, units - 30), end: units + 30 }, {});
    const zone = ground.zoneAt(loc, ground.halfRoad(loc));
    return { y: ground.heightAt(loc) - p.y, kind: zone.kind, near: Math.abs(loc.lateral - lat) < 0.5 };
}

// The land across the road at s on `side`: {soft, worst} over [d0, d1] past the edge, 1 m apart
function landProfile(env, s, side, d0, d1) {
    let soft = true, worst = 0, mean = 0, n = 0, last = null;
    for (let d = d0; d <= d1; d++) {
        const q = probeLand(env, s, side, d);
        if (q.kind === 'wall' || q.kind === 'fall' || !q.near) soft = false;
        if (last !== null) { const g = Math.abs(q.y - last); worst = Math.max(worst, g); mean += g; n++; }
        last = q.y;
    }
    return { soft, worst, mean: n ? mean / n : 0 };
}

export async function offRoadPlaces(game, env, hairpins, { perKind = 3 } = {}) {
    const route = env.route;
    const places = { grass: [], steep: [], outside: [], inside: [] };
    const far = s => Object.values(places).every(list => list.every(p => Math.abs(p.s - s) > 300));
    for (let s = env.startS + 100; s < env.endS - 150; s += 25) {
        if (places.grass.length >= perKind && places.steep.length >= perKind) break;
        if (hairpins.some(h => s > h.s0 - 60 && s < h.s1 + 60)) continue;
        let bend = 0;
        for (let a = -40; a <= 60; a += 10) bend = Math.max(bend, Math.abs(route.curvatureAt(s + a, 8)));
        if (bend > 1 / 250) continue;
        await env.streamer.settle(route.sample(s, {}), s);
        for (const side of [-1, 1]) {
            if (!far(s)) break;
            const grass = landProfile(env, s, side, 2, 14);
            const run = landProfile(env, s + 15, side, 2, 14);
            if (places.grass.length < perKind && grass.soft && run.soft && grass.worst < 0.15 && run.worst < 0.15) {
                places.grass.push({ kind: 'grass', s, side });
                continue;
            }
            const steep = landProfile(env, s, side, 3, 10);
            if (places.steep.length < perKind && steep.soft && steep.mean > 0.9) places.steep.push({ kind: 'steep', s, side });
        }
    }
    const step = Math.max(1, Math.floor(hairpins.length / perKind));
    for (let i = 0; i < hairpins.length && places.outside.length < perKind; i += step) {
        const h = hairpins[i];
        // The tightest point of the hairpin and the side its centre lies on
        let apex = h.s0, most = 0;
        for (let s = h.s0; s <= h.s1; s += 2) { const k = Math.abs(route.curvatureAt(s, 8)); if (k > most) { most = k; apex = s; } }
        const inside = Math.sign(route.curvatureAt(apex, 8));
        places.outside.push({ kind: 'outside', s: apex - 6, side: -inside, hairpin: h });
        places.inside.push({ kind: 'inside', s: apex - 6, side: inside, hairpin: h });
    }
    return places;
}

function makeRider(game, env, s, lateral, yawOff, speed, assist) {
    const { THREE, Vehicle, WorldRun, WorldGuide } = game;
    const route = env.route;
    const v = new Vehicle(new THREE.Scene());
    v.environment = env;
    v.assistLevel = assist;
    const p = route.sample(s, {});
    v.position.set(p.x + Math.cos(p.heading) * lateral, p.y, p.z - Math.sin(p.heading) * lateral);
    v.yawAngle = p.heading + yawOff;
    v.findNearestRoadSegment();
    v.speed = speed;
    const run = new WorldRun(route, env.stationGates, env.physics);
    run.begin(s);
    const guide = new WorldGuide(env);
    let restart = null;
    guide.onRestart = reason => { restart = reason; };
    // One fixed step: returns null, or how the ride ended
    const step = (steer, throttle, brake) => {
        v.update(DT, steer, throttle, brake, 0);
        if (v.crashed) return 'crash';
        const q = v.projection;
        if (q.index < 0) return null;
        if (run.update({ s: q.s, lateral: q.lateral, width: q.width, speed: v.speed, dt: DT, forwardDot: Math.cos(v.yawAngle - q.heading) }).cut) return 'cut';
        guide.step({ projection: q, speed: v.speed, yaw: v.yawAngle, dt: DT });
        if (restart) return 'restart';
        return null;
    };
    return { v, step };
}

function crashCause(v, log) {
    if (v.crashCause) return v.crashCause;
    const line = log ? log.filter(l => /CRASH/.test(l)).pop() : null;
    return line || (v.lowsideTimerMs >= v.worldPhysics.lowsideMs ? 'lowside' : 'crash');
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

export async function leaveRoad(game, env, place, { speed, mode = 'exit', assist = 'normal', seconds = 25, log = null }) {
    const route = env.route, world = env.physics;
    const p0 = route.sample(place.s, {});
    await env.streamer.settle({ x: p0.x, z: p0.z }, place.s);
    if (log) log.length = 0;
    const side = place.side;
    const { v, step } = makeRider(game, env, place.s, side * (p0.width / 2 - 1), side * (mode === 'exit' ? 20 : 8) * Math.PI / 180, speed, assist);
    const out = { end: 'ride', endS: null, entry: null, at2: null, at5: null, offM: 0, offS: 0, cause: null };
    let left = null, time = 0, settled = place.s;
    const aim = {};
    for (let tick = 0; tick < seconds * 60; tick++) {
        const q = v.projection;
        const s = q.index >= 0 ? q.s : place.s;
        if (s >= env.endS - 5) break;
        if (Math.abs(s - settled) > 100) { await env.streamer.settle({ x: v.position.x, z: v.position.z }, s); settled = s; }
        env.updateBarriers(s);
        let steer = 0;
        if (mode === 'along') {
            const reach = Math.max(6, Math.min(30, 3 + 0.7 * v.speed));
            route.sample(s + reach, aim);
            const lat = side * (aim.width / 2 + 6);
            steer = pursue(v, world, aim.x + Math.cos(aim.heading) * lat, aim.z - Math.sin(aim.heading) * lat, reach);
        }
        const x0 = v.position.x, z0 = v.position.z;
        const end = step(steer, 1, 0);
        time += DT;
        const off = Math.abs(v.projection.lateral) > v.projection.width / 2;
        if (off && left === null) { left = time; out.entry = Math.round(v.speed * 100) / 100; }
        if (left !== null) {
            if (off) { out.offS += DT; out.offM += Math.hypot(v.position.x - x0, v.position.z - z0); }
            const since = time - left;
            if (out.at2 === null && since >= 2) out.at2 = Math.round(v.speed * 100) / 100;
            if (out.at5 === null && since >= 5) out.at5 = Math.round(v.speed * 100) / 100;
        }
        if (end) {
            out.end = end;
            out.cause = end === 'crash' ? crashCause(v, log) : end;
            break;
        }
    }
    out.endS = left === null ? null : Math.round((time - left) * 100) / 100;
    out.offM = Math.round(out.offM * 10) / 10;
    out.offS = Math.round(out.offS * 100) / 100;
    return out;
}

// The speed a road rider takes the next 30 m at: at most `speed`, and at most what a `leanDeg` lean holds
function roadSpeed(route, s, speed, leanDeg = 35) {
    let k = 0;
    for (let a = 0; a <= 30; a += 3) k = Math.max(k, Math.abs(route.curvatureAt(s + a, 8)));
    return Math.min(speed, Math.max(5, Math.sqrt(G * Math.tan(leanDeg * Math.PI / 180) / Math.max(1e-6, k))));
}

// The apex of a hairpin (its tightest point) and the side its centre lies on
export function hairpinApex(route, hairpin) {
    let apex = hairpin.s0, most = 0;
    for (let s = hairpin.s0; s <= hairpin.s1; s += 1) { const k = Math.abs(route.curvatureAt(s, 8)); if (k > most) { most = k; apex = s; } }
    return { apex, inside: Math.sign(route.curvatureAt(apex, 8)) };
}

// One ride through a hairpin from 40 m before it to 15 m past it. plan: {line: 'centre' | 'inside', lean} on the road,
// at the speed a `lean` degree lean (35 by default) takes the bend at (at most `speed`); {cut: L} the road until L m before the apex, then straight at the
// point L m past it (on the inside lane) at full throttle up to `speed`, then the road again. `cut: Infinity` aims
// straight at the exit from the start. Returns {time, end, cause, landS}: the time to the exit (held CONFIRM_S, so a
// cut rule or a crash just after it counts), or how the ride ended, and the seconds spent past the carriageway
export async function rideHairpin(game, env, hairpin, plan, { speed, assist = 'normal', log = null }) {
    const route = env.route, world = env.physics;
    const s0 = Math.max(env.startS, hairpin.s0 - 40), s1 = hairpin.s1 + 15;
    const { apex, inside } = hairpinApex(route, hairpin);
    await env.streamer.settle(route.sample(s0, {}), s0);
    if (log) log.length = 0;
    const { v, step } = makeRider(game, env, s0, 0, 0, Math.min(speed, roadSpeed(route, s0, speed)), assist);
    const aim = {};
    const cut = plan.cut !== undefined ? plan.cut : null;
    const from = cut === Infinity ? -Infinity : cut !== null ? apex - cut : Infinity;
    const target = route.sample(cut === Infinity ? s1 : cut !== null ? apex + cut : s1, {});
    const lane = s => (plan.line === 'inside' || cut !== null ? Math.sign(route.curvatureAt(s + 2, 8)) * Math.max(0, route.sample(s, aim).width / 2 - 1.2) : 0);
    const tLat = cut !== null && cut !== Infinity ? inside * Math.max(0, target.width / 2 - 1.2) : 0;
    const tx = target.x + Math.cos(target.heading) * tLat, tz = target.z - Math.sin(target.heading) * tLat;
    let time = 0, reached = null, phase = 0, landS = 0;
    for (let tick = 0; tick < 60 * 120; tick++) {
        const q = v.projection;
        const s = q.index >= 0 ? q.s : s0;
        if (reached === null && s >= s1 && Math.abs(q.lateral) < 30) reached = time;
        if (reached !== null && time - reached >= CONFIRM_S) return { time: Math.round(reached * 100) / 100, end: 'exit', cause: null, landS: Math.round(landS * 100) / 100 };
        env.updateBarriers(s);
        let steer, want;
        const d = Math.hypot(tx - v.position.x, tz - v.position.z);
        if (phase === 0 && s >= from) phase = 1;
        if (phase === 1 && (d <= Math.max(4, v.speed * 0.4) || s > (cut === Infinity ? s1 : apex + cut))) phase = 2;
        if (phase === 1) {
            steer = pursue(v, world, tx, tz, Math.max(6, d));
            want = speed;
        } else {
            const reach = Math.max(5, Math.min(30, 3 + 0.7 * v.speed));
            const at = Math.max(s, phase === 2 ? Math.min(s1, (cut === Infinity ? s1 : apex + cut)) : s) + reach;
            route.sample(at, aim);
            const lat = lane(at);
            route.sample(at, aim);
            steer = pursue(v, world, aim.x + Math.cos(aim.heading) * lat, aim.z - Math.sin(aim.heading) * lat, reach);
            want = roadSpeed(route, s, speed, plan.lean || 35);
        }
        const end = step(steer, v.speed < want ? 1 : 0, v.speed > want + 0.5 ? 1 : 0);
        time += DT;
        if (Math.abs(v.projection.lateral) > v.projection.width / 2 + game.RoadSurface.VERGE_M) landS += DT;
        if (end) return { time: Math.round(time * 100) / 100, end, cause: end === 'crash' ? crashCause(v, log) : end, landS: Math.round(landS * 100) / 100 };
    }
    return { time: null, end: 'timeout', cause: null, landS: Math.round(landS * 100) / 100 };
}

export const CUTS = [6, 9, 12, 15, 20, 30, Infinity];

// The road lines a cut is measured against: the centre and the inside lane, at a 35 and a 45 degree lean
export const ROAD_LINES = [{ line: 'centre' }, { line: 'inside' }, { line: 'centre', lean: 45 }, { line: 'inside', lean: 45 }];
