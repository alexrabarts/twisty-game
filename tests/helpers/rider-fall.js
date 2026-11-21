// A rider's fall measured from outside (Vehicle.beginRiderFall, stepRiderFall, drawRiderFall): the real Vehicle is
// crashed and stepped as Game steps it, and every frame is read back from what is drawn (the rider's own matrices),
// never from the fall's own state. Shared by tests/unit/rider-fall.test.js and tests/unit/world-rider-fall.test.js.
export const DT = 1 / 60;

// The radii the body's points are held to the ground by (Vehicle.RIDER_FALL), read here so a test says what it means
const radii = (rule) => ({ head: rule.headM, torso: rule.torsoM, limb: rule.limbM });

// A bike standing at (x, y, z) heading `heading`, on `environment` (null: a flat plane with the world's physics)
export function bikeAt(game, { environment = null, x = 0, y = 0, z = 0, heading = 0, speed = 20, character = 0, model = false } = {}) {
    const { Vehicle, THREE } = game;
    const v = new Vehicle(new THREE.Scene(), null, game.CHARACTERS[character], undefined, { model });
    v.environment = environment || { physics: game.WorldPhysics };
    v.position.set(x, y, z);
    v.yawAngle = heading;
    if (environment) v.findNearestRoadSegment();
    v.speed = speed;
    return v;
}

// Every part of the rider as it is drawn: position, quaternion and scale of each object under him, and his own
export function poseOf(v) {
    const out = [];
    v.rider.traverse(o => out.push([o.position.toArray(), o.quaternion.toArray(), o.scale.toArray()]));
    return out;
}

// The body's points in the world, each {x, y, z, r, name}: the head, the chest and the pelvis, and each limb's
// middle joint and end, from the rider's world matrix and the limbs as they are placed
export function bodyPoints(game, v) {
    const { THREE, Vehicle } = game;
    const rule = Vehicle.RIDER_FALL, r = radii(rule);
    v.group.updateMatrixWorld(true);
    const lean = (v.riderSpec && v.riderSpec.torsoLean || 0) + (v.riderBaseRotX || 0);
    const local = [];
    const helmet = v.helmet;
    local.push(['head', (helmet.parent === v.rider ? helmet.position : helmet.parent.position).clone(), r.head]);
    local.push(['chest', new THREE.Vector3(0, Math.cos(lean) * rule.torsoHalfM, Math.sin(lean) * rule.torsoHalfM), r.torso]);
    local.push(['pelvis', new THREE.Vector3(0, -Math.cos(lean) * rule.torsoHalfM, -Math.sin(lean) * rule.torsoHalfM), r.torso]);
    for (const [name, limbs] of [['arm', v.arms], ['leg', v.legs]]) {
        for (const side of [-1, 1]) {
            local.push([`${name}${side}mid`, limbs[side].mid().clone(), r.limb]);
            local.push([`${name}${side}end`, limbs[side].at().clone(), Math.max(r.limb, limbs[side].drop || 0)]);
        }
    }
    return local.map(([name, p, radius]) => {
        p.applyMatrix4(v.rider.matrixWorld);
        return { name, x: p.x, y: p.y, z: p.z, r: radius };
    });
}

// A point against the rider's own strand of the road: the nearest piece of it within 3 pieces of `index` (where the
// middle of him was found last), so a stack of hairpins never reads him against the strand above or below
function locateOn(v, x, z, index) {
    return v.environment.ground.locate(x, z, { start: Math.max(0, index - 3), end: index + 3 }, {});
}

// The ground at (x, z) as the bike's own physics has it: the road's height on the road, its verge and against a wall,
// the land on the run-off (Vehicle.surfaceAt's rule), and past the edge of a drop the land a falling bike comes down
// on (Vehicle.getTerrainHeightAt's rule)
export function groundAt(v, x, z, index) {
    const environment = v.environment;
    if (!environment || !environment.route) return v.position.y;
    const ground = environment.ground;
    const loc = locateOn(v, x, z, index);
    let zone = ground.zoneAt(loc, ground.halfRoad(loc));
    if (v.worldPhysics) zone = v.worldZone(zone, loc);
    if (zone.kind === 'runoff') return ground.heightAt(loc, false);
    if (zone.kind === 'fall') return Math.max(ground.heightAt(loc, false), ground.restY(loc));
    return loc.roadY;
}

// How far (x, z) is into a wall, a barrier or a parapet, in metres past its face (-Infinity: not in one), by the
// zones the bike is stopped by (Vehicle.checkWallCollision). The zones are the road's own rows, 4 m apart, each a
// band from a face outward, so the point is read on the row `index` (the one the rider's middle is on) and on the
// row nearest to the point itself, and is in a wall only where both have one: a hand past the end of the next row's
// wall is not in it. The face is where the zone stops being a wall on the way back to the road, looked for every
// 0.1 m up to 3 m back (land that stands high enough to be a wall is one only from where it does). Land that is a
// wall by its height alone (no parapet, bridge side, tunnel rock or barrier) has a top: a point at height `y` that
// lies on that land, not under it, is on the bank and not in it
export function wallDepth(v, x, z, index, y = null) {
    const environment = v.environment;
    if (!environment || !environment.route) return -Infinity;
    const ground = environment.ground;
    const own = ground.locate(x, z, { start: Math.max(0, index - 1), end: index + 1 }, {}).index;
    let least = Infinity;
    for (const row of own === index ? [index] : [index, own]) {
        const loc = ground.locate(x, z, { start: row, end: row }, {});
        const sign = loc.lateral < 0 ? -1 : 1;
        const zoneAt = (lateral) => {
            const located = { index: loc.index, lateral };
            const zone = ground.zoneAt(located, ground.halfRoad(loc));
            return v.worldPhysics ? v.worldZone(zone, located, loc.roadY) : zone;
        };
        const wallAt = (lateral) => zoneAt(lateral).kind === 'wall';
        const zone = zoneAt(loc.lateral);
        if (zone.kind !== 'wall') return -Infinity;
        const flags = loc.flags || {};
        const built = zone.parapet || flags.tunnel || flags.gallery || flags.bridge || (ground.barriers && ground.barriers.length && ground.inBarrier(x, z));
        if (!built && y !== null && typeof ground.heightAt === 'function' && y >= ground.heightAt(loc, false) - 0.1) return -Infinity;
        let depth = 3;
        for (let back = 0.1; back <= 3; back += 0.1) if (!wallAt(loc.lateral - sign * back)) { depth = back; break; }
        least = Math.min(least, depth);
    }
    return least;
}

// Crashes the bike now with the cause class `why` (a key of Vehicle.CRASH_CAUSES), leaned to `side` (1: its right),
// and steps it for `seconds`. One frame for each step, read from what is drawn
export function crashAndWatch(game, v, { why, side = 1, seconds = 2.2, fall = null, each = null } = {}) {
    const { THREE } = game;
    // One riding step, so the bike is drawn where it stands and has a speed to leave with
    const speed = v.speed;
    v.update(DT, 0, 0, 0, 0);
    v.speed = speed;
    v.rodeSpeed = speed;
    v.leanAngle = side * 0.5;
    v.worldCrash('test', fall, why);
    const frames = [];
    const at = new THREE.Vector3();
    const routed = !!(v.environment && v.environment.route);
    let index = v.currentRoadSegment || 0;
    for (let i = 0; i < Math.round(seconds / DT); i++) {
        v.update(DT, 0, 0, 0, 0);
        const points = bodyPoints(game, v);
        v.rider.getWorldPosition(at);
        // (a rider who falls with the bike is on the bike's piece of the road, wherever the bike is put)
        let under = -Infinity, low = Infinity, wall = -Infinity;
        for (const p of points) low = Math.min(low, p.y - p.r);
        if (routed) index = locateOn(v, at.x, at.z, v.riderFall && v.riderFall.rule && v.riderFall.rule.withBike ? v.currentRoadSegment : index).index;
        for (const p of points) {
            under = Math.max(under, groundAt(v, p.x, p.z, index) - (p.y - p.r));
            wall = Math.max(wall, wallDepth(v, p.x, p.z, index, p.y - p.r));
        }
        const frame = {
            t: (i + 1) * DT, x: at.x, y: at.y, z: at.z, bike: v.position.toArray(), under, low, wall,
            middle: wallDepth(v, at.x, at.z, index, at.y), gap: Math.hypot(at.x - v.position.x, at.z - v.position.z), drop: v.position.y - at.y,
            kind: v.riderFall && v.riderFall.kind
        };
        if (each) each(frame, v, points);
        frames.push(frame);
    }
    return frames;
}

// What stands beside the ride at s metres, on each side, as a bike that rides out to it meets it: the first zone
// that is not road or verge within `reachM` of the road's edge. Returns [{sign, kind, at}] (kind 'wall', 'fall',
// 'runoff' or null; `at` the metres from the centre line where it begins; `parapet` for a retaining wall's). One self-contained function, so a browser
// proof can pass it into the page with toString()
export function sidesAt(v, s, reachM = 4) {
    const environment = v.environment, route = environment.route;
    const p = route.sample(s, {});
    const centre = route.project(p.x, p.z, null, {});
    const out = [];
    for (const sign of [-1, 1]) {
        let found = { sign, kind: null, at: 0 };
        for (let lateral = 0.5; lateral <= centre.width / 2 + reachM; lateral += 0.25) {
            const x = p.x + Math.cos(p.heading) * sign * lateral, z = p.z - Math.sin(p.heading) * sign * lateral;
            const q = route.project(x, z, { index: centre.index }, {});
            if (!(q.index >= 0)) break;
            const located = { index: q.index, lateral: q.lateral };
            let zone = environment.ground.zoneAt(located, q.width / 2);
            if (v.worldPhysics) zone = v.worldZone(zone, located, q.y);
            if (zone.kind === 'road' || zone.kind === 'shoulder') continue;
            found = { sign, kind: zone.kind, at: lateral, parapet: !!zone.parapet };
            break;
        }
        out.push(found);
    }
    return out;
}
