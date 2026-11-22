// How the drawn bike stands on the drawn ground of a world (Vehicle.groundPose; .agent/system/handling.md, "The bike
// stands on the ground"), measured from outside: the ground is read by casting down onto the drawn road, verge, works
// and land meshes, never from the physics, and the bike, its wheels and the rider's boot from their own matrices.
// Shared by tests/unit/world-ground-contact.test.js and the before/after measure in its notes.
export const DT = 1 / 60;

// The meshes a wheel or a boot can stand on: the road's ribbon and verge, its edge works (the fill, the coping) and the
// land's tiles, as they are drawn now
export function groundMeshes(scene) {
    const out = [];
    scene.updateMatrixWorld(true);
    scene.traverseVisible(o => {
        if (o.isMesh && (o.name.startsWith('road-') || o.name.startsWith('world-terrain'))) out.push(o);
    });
    return out;
}

// The drawn ground at (x, z): the first of `meshes` straight down from `fromY`, or null
export function drawnY(game, meshes, x, z, fromY) {
    const { THREE } = game;
    const cast = drawnY.cast || (drawnY.cast = { ray: new THREE.Raycaster(), from: new THREE.Vector3(), down: new THREE.Vector3(0, -1, 0) });
    cast.ray.set(cast.from.set(x, fromY, z), cast.down);
    cast.ray.far = 12;
    const hit = cast.ray.intersectObjects(meshes, false)[0];
    return hit ? hit.point.y : null;
}

// Every vertex of `object` and what it carries, in the world
function verticesOf(game, object) {
    const { THREE } = game;
    const out = [];
    object.updateWorldMatrix(true, true);
    object.traverse(o => {
        if (!o.isMesh) return;
        const position = o.geometry.attributes.position;
        for (let i = 0; i < position.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(o.matrixWorld));
    });
    return out;
}

// A wheel against the drawn ground under each of its points that stand within `band` m of its lowest: `under` how far
// its worst point is in the ground (positive: in it), `gap` how far its nearest point is over the ground there (the
// lowest point in the world is not the one that touches a slope, so every point near the bottom is read)
export function wheelContact(game, meshes, wheel, band = 0.25) {
    const points = verticesOf(game, wheel);
    const low = Math.min(...points.map(p => p.y));
    let under = -Infinity, gap = Infinity;
    for (const p of points) {
        if (p.y > low + band) continue;
        const g = drawnY(game, meshes, p.x, p.z, p.y + 3);
        if (g === null) continue;
        under = Math.max(under, g - p.y);
        gap = Math.min(gap, p.y - g);
    }
    return { under, gap };
}

// The boot and sole of a foot put down against the drawn ground under each of their points: `under` the most any point
// is in the ground, `gap` how far the lowest point is over it
export function footContact(game, meshes, objects) {
    let under = -Infinity, gap = Infinity;
    for (const object of objects) {
        for (const p of verticesOf(game, object)) {
            const g = drawnY(game, meshes, p.x, p.z, p.y + 3);
            if (g === null) continue;
            under = Math.max(under, g - p.y);
            gap = Math.min(gap, p.y - g);
        }
    }
    return { under, gap };
}

// The bike's axes against the drawn ground's normal under it, in degrees. The normal is read from the ground at the
// two wheels' places and `acrossM` either side of the middle between them. `pitch` is the angle of the bike's forward
// axis out of the ground's plane (0: the bike's length lies along the ground); `roll` is the bike's roll about its
// forward axis from the ground's normal, less `lean` (radians, the roll the bike is drawn with over the ground, a
// positive one to its right)
export function poseAgainstGround(game, meshes, v, lean = 0, acrossM = 0.4) {
    const { THREE } = game;
    const group = v.group;
    group.updateWorldMatrix(true, true);
    const q = group.getWorldQuaternion(new THREE.Quaternion());
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const flat = new THREE.Vector3(forward.x, 0, forward.z).normalize();
    const side = new THREE.Vector3(flat.z, 0, -flat.x);
    const rear = v.axles.rear[1], front = v.axles.front[1];
    const at = (along, across) => {
        const x = group.position.x + flat.x * along + side.x * across, z = group.position.z + flat.z * along + side.z * across;
        const y = drawnY(game, meshes, x, z, group.position.y + 3);
        return y === null ? null : new THREE.Vector3(x, y, z);
    };
    const mid = (rear + front) / 2;
    const r = at(rear, 0), f = at(front, 0), left = at(mid, acrossM), right = at(mid, -acrossM);
    if (!r || !f || !left || !right) return null;
    const along = f.clone().sub(r), across = left.clone().sub(right);
    const normal = new THREE.Vector3().crossVectors(along, across).normalize();
    if (normal.y < 0) normal.negate();
    const pitch = Math.asin(Math.max(-1, Math.min(1, forward.dot(normal)))) * 180 / Math.PI;
    // The normal square to the bike's forward axis, and the bike's up turned about that axis from it
    const square = normal.clone().addScaledVector(forward, -normal.dot(forward)).normalize();
    const roll = Math.atan2(new THREE.Vector3().crossVectors(square, up).dot(forward), up.dot(square));
    return { pitch, roll: (roll - lean) * 180 / Math.PI, normal };
}

// The steepest grade of a world's ride, over 10 m of the drawn road, off its structures, where the route's own grade
// agrees with it within 0.03 (no step): {s, grade}
export function steepest(env) {
    let best = null;
    for (let s = env.startS + 60; s < env.endS - 60; s += 2) {
        const p = env.route.sample(s, {});
        if (p.flags && (p.flags.tunnel || p.flags.bridge || p.flags.gallery)) continue;
        const grade = (env.route.sample(s + 5, {}).y - env.route.sample(s - 5, {}).y) / 10;
        if (Math.abs(grade - p.grade) > 0.03) continue;
        if (!best || Math.abs(grade) > Math.abs(best.grade)) best = { s, grade };
    }
    return best;
}

// The steepest open land a road bike may stand on beside the ride: every `every` m of the ride (each place settled with
// `settle(s)`), `outs` m past the verge on either side, where the land within `clearM` of the place is open (run-off by
// the tile's zones, no side road), the nearest road is the ride at s (not another leg of a hairpin) with no structure
// within `clearS` m of it (a bridge's parapet, a tunnel's rock), and its slope over `spanM` (rise over run, from the
// tile triangles) is under `most`. Every such place, the steepest first: [{s, x, z, y, slope, heading}], `heading`
// facing up the slope
export async function steepestLand(env, settle, { every = 400, outs = [3, 5, 8], clearM = 1.5, clearS = 40, spanM = 1.5, most = 0.7 } = {}) {
    const ground = env.ground;
    const open = (x, z) => ground.kindAt(x, z) === 'runoff' && ground.sideRoadY(x, z) === null && ground.tileHeight(x, z) !== null;
    const found = [];
    for (let s = env.startS + 100; s < env.endS - 100; s += every) {
        let built = false;
        for (let d = -clearS; d <= clearS && !built; d += 4) {
            const f = env.route.sample(s + d, {}).flags;
            built = !!(f && (f.tunnel || f.bridge || f.gallery));
        }
        if (built) continue;
        await settle(s);
        const p = env.route.sample(s, {});
        for (const sign of [1, -1]) {
            for (const out of outs) {
                const lateral = sign * (p.width / 2 + 1.1 + out);
                const x = p.x + Math.cos(p.heading) * lateral, z = p.z - Math.sin(p.heading) * lateral;
                if (![[0, 0], [clearM, 0], [-clearM, 0], [0, clearM], [0, -clearM]].every(([dx, dz]) => open(x + dx, z + dz))) continue;
                const q = env.route.project(x, z, null, {});
                if (!(Math.abs(q.s - s) < clearS)) continue;
                const h = (dx, dz) => ground.tileHeight(x + dx, z + dz);
                const gx = (h(spanM, 0) - h(-spanM, 0)) / (2 * spanM), gz = (h(0, spanM) - h(0, -spanM)) / (2 * spanM);
                const slope = Math.hypot(gx, gz);
                if (slope < most) found.push({ s, x, z, y: h(0, 0), slope, heading: Math.atan2(gx, gz) });
            }
        }
    }
    return found.sort((a, b) => b.slope - a.slope);
}

// A bike set down at (x, y, z) heading `heading` and stepped `frames` frames at `speed` (held), upright: the real
// Vehicle as Game steps it
export function standAt(game, env, { x, y, z, heading, speed, frames }) {
    const { THREE, Vehicle } = game;
    const v = new Vehicle(new THREE.Scene(), null, game.CHARACTERS[0], undefined, { model: false });
    v.environment = env;
    v.position.set(x, y, z);
    v.yawAngle = heading;
    v.findNearestRoadSegment();
    for (let i = 0; i < frames && !v.crashed; i++) {
        v.speed = speed;
        v.leanAngle = 0;
        v.update(DT, 0, 0, 0, 0);
    }
    return v;
}

// The roll the bike is drawn with over the ground (radians, a positive one to its right): its lean, the land's rock,
// the wobbles and the stop pose's lean to its left (Vehicle.updateFooting)
export function shownLean(game, v) {
    const { Vehicle } = game;
    const t = v.footT || 0;
    return (v.leanAngle || 0) + (v.landRock || 0) + (v.roadworksWobble || 0) + (v.contactWobble || 0) - Vehicle.LEFT * Vehicle.FOOT_LEAN * t * t * (3 - 2 * t);
}

// Everything measured of a bike on the ground, in metres and degrees, the foot's only at a stop
export function measureBike(game, meshes, v) {
    const { Vehicle } = game;
    const rear = wheelContact(game, meshes, v.rearWheel), front = wheelContact(game, meshes, v.frontWheel);
    const pose = poseAgainstGround(game, meshes, v, shownLean(game, v));
    const ends = v.legs[Vehicle.LEFT].ends;
    const foot = v.footPlaced && ends ? footContact(game, meshes, ends) : null;
    return {
        crashed: v.crashed, under: Math.max(rear.under, front.under), gap: Math.max(rear.gap, front.gap),
        pitch: pose ? pose.pitch : NaN, roll: pose ? pose.roll : NaN,
        footUnder: foot ? foot.under : null, footGap: foot ? foot.gap : null
    };
}
