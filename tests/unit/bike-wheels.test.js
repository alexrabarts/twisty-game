// The wheels of every bike as Vehicle.updateMesh draws them (each detailed
// bike, each procedural kind's file and each procedural kind from
// primitives), read in the bike's own axes. Each wheel is spun through a
// full turn and the run-out of its tyre measured as a dial gauge would: how
// far each point of the tyre moves across the wheel's plane during the turn.
// Upright and unsteered, each wheel stands in the bike's centre plane. Steered,
// the front wheel runs as true, in the plane of the turned front end: it
// contains the steering axis (the fork legs' line), is turned by the share of
// the steering the drawing shows, and its disc and fork legs turn with it.
//
// An Euler spin about x over a steer about y spun a steered wheel about the
// bike's x: it wobbled by 45-60 mm at the rim and leaned off upright.
import { everyBike, loadBikes, near, planeNormal, rideAny, vertices } from '../helpers/bike-rig.js';

const game = loadBikes();
const { THREE } = game;
// Millimetres a tyre may run out over a turn; degrees a plane may be off
const RUNOUT_MM = 0.5;
const TILT_DEG = 0.05;
const STEPS = 24;

// The vehicle drawn at rest at the origin with its steering at `steer` and
// its wheels turned by `turn` (the rear wheel's angle)
function pose(vehicle, steer, turn) {
    vehicle.speed = 0;
    vehicle.leanAngle = 0;
    vehicle.footDown = false;
    vehicle.footT = 0;
    vehicle.steeringAngle = steer;
    vehicle.wheelRotation = turn;
    vehicle.currentDeltaTime = 0;
    vehicle.updateMesh();
    vehicle.group.position.set(0, 0, 0);
    vehicle.group.rotation.set(0, 0, 0);
    vehicle.group.updateMatrixWorld(true);
}

// One wheel through a full turn: the run-out (mm) of its tyre, the normal of
// the plane it turns in and that plane's middle
export function runout(vehicle, end, steer) {
    const wheel = end === 'front' ? vehicle.frontWheel : vehicle.rearWheel;
    pose(vehicle, steer, 0);
    // The tyre's outer part, taken in the wheel's own axes at rest
    const own = vertices(THREE, wheel, wheel);
    const radius = Math.max(...own.map(v => Math.hypot(v.y, v.z)));
    const tyre = own.filter(v => Math.hypot(v.y, v.z) > radius * 0.85);
    const frames = [];
    for (let k = 0; k < STEPS; k++) {
        // A full turn of this wheel
        pose(vehicle, steer, k / STEPS * Math.PI * 2 * vehicle.axles.rear[2] / vehicle.axles[end][2]);
        frames.push(tyre.map(v => v.clone().applyMatrix4(near(wheel).matrixWorld)));
    }
    const { normal, mid } = planeNormal(frames.flat().map(v => v.toArray()));
    const n = new THREE.Vector3(...normal);
    if (n.x < 0) n.negate();
    const c = new THREE.Vector3(...mid);
    let worst = 0;
    tyre.forEach((v, i) => {
        const across = frames.map(frame => frame[i].clone().sub(c).dot(n));
        worst = Math.max(worst, Math.max(...across) - Math.min(...across));
    });
    // The middle of the tyre across the bike: half way between its two sides. (Not the mean of its vertices: a knobby
    // tread has more of them on one side, and read 1.4 mm off on a wheel that stands in the centre plane)
    const xs = frames.flat().map(v => v.x);
    return { mm: worst * 1000, normal: n, mid: c, centreX: (Math.min(...xs) + Math.max(...xs)) / 2 };
}

// The line of one fork leg, from its surface rather than its vertices (a
// rod's long faces have vertices only at their ends, a thin hose many): the
// main axis of the second moment of its area, over the upper part of the leg,
// clear of the foot and the caliper. Exact for each triangle: the moment of a
// uniform triangle a, b, c is area / 12 (aa' + bb' + cc' + ss'), s = a + b + c.
function legLine(vehicle, fork) {
    const into = vehicle.group.matrixWorld.clone().invert();
    const triangles = [];
    near(fork).traverse(o => {
        if (!o.isMesh) return;
        const m = new THREE.Matrix4().multiplyMatrices(into, o.matrixWorld);
        const position = o.geometry.attributes.position;
        const index = o.geometry.index;
        const at = k => new THREE.Vector3().fromBufferAttribute(position, index ? index.getX(k) : k).applyMatrix4(m);
        for (let k = 0; k < (index ? index.count : position.count); k += 3) triangles.push([at(k), at(k + 1), at(k + 2)]);
    });
    const ys = triangles.flat().map(v => v.y);
    const low = Math.min(...ys), high = Math.max(...ys);
    const upper = triangles.filter(t => (t[0].y + t[1].y + t[2].y) / 3 > low + (high - low) * 0.45);
    let area = 0;
    const first = new THREE.Vector3();
    const second = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (const [a, b, c] of upper) {
        const A = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).length() / 2;
        const sum = a.clone().add(b).add(c);
        area += A;
        first.addScaledVector(sum, A / 3);
        for (const p of [a, b, c, sum]) {
            const q = p.toArray();
            for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) second[i][j] += A / 12 * q[i] * q[j];
        }
    }
    const mid = first.multiplyScalar(1 / area).toArray();
    const spread = [0, 1, 2].map(i => [0, 1, 2].map(j => second[i][j] / area - mid[i] * mid[j]));
    // Its main axis by power iteration, started up the leg
    let along = new THREE.Vector3(0, 1, 0);
    for (let n = 0; n < 200; n++) {
        const v = along.toArray();
        along = new THREE.Vector3(...[0, 1, 2].map(i => spread[i][0] * v[0] + spread[i][1] * v[1] + spread[i][2] * v[2])).normalize();
    }
    return along.y < 0 ? along.negate() : along;
}

const degrees = (a, b) => Math.acos(Math.min(1, Math.abs(a.dot(b)))) * 180 / Math.PI;

describe.each(everyBike(game))('%s wheels', (label, id, modelled) => {
    let vehicle;
    beforeAll(async () => {
        vehicle = await rideAny(game, id, modelled);
    });

    test.each(['front', 'rear'])('unsteered, the %s wheel runs true, upright, in the centre plane', end => {
        const { mm, normal, centreX } = runout(vehicle, end, 0);
        expect(mm).toBeLessThan(RUNOUT_MM);
        expect(degrees(normal, new THREE.Vector3(1, 0, 0))).toBeLessThan(TILT_DEG);
        expect(Math.abs(centreX) * 1000).toBeLessThan(0.5);
    });

    test('the steering axis is the fork legs\' line, in the centre plane, through the front axle', () => {
        const { axis, point } = vehicle.steerRig;
        expect(Math.abs(axis.x)).toBeLessThan(1e-9);
        expect(point.toArray()).toEqual([0, vehicle.axles.front[0], vehicle.axles.front[1]]);
        pose(vehicle, 0, 0);
        for (const fork of [vehicle.leftFork, vehicle.rightFork]) {
            expect(degrees(legLine(vehicle, fork), axis)).toBeLessThan(2.5);
        }
    });

    test.each([0.3, -0.3, 0.08])('steered %s, the front wheel runs true in the turned front end, and the rear does not move', steer => {
        const { axis } = vehicle.steerRig;
        const shown = steer * game.Vehicle.STEER_SHOWN;
        const front = runout(vehicle, 'front', steer);
        expect(front.mm).toBeLessThan(RUNOUT_MM);
        // The plane holds the steering axis and is turned about it by the share shown
        expect(Math.abs(front.normal.dot(axis))).toBeLessThan(Math.sin(TILT_DEG * Math.PI / 180));
        const want = new THREE.Vector3(1, 0, 0).applyAxisAngle(axis, shown);
        expect(degrees(front.normal, want)).toBeLessThan(TILT_DEG);
        expect(degrees(front.normal, new THREE.Vector3(1, 0, 0))).toBeGreaterThan(Math.abs(shown) * 180 / Math.PI * 0.8);
        const rear = runout(vehicle, 'rear', steer);
        expect(rear.mm).toBeLessThan(RUNOUT_MM);
        expect(degrees(rear.normal, new THREE.Vector3(1, 0, 0))).toBeLessThan(TILT_DEG);
    });

    test('the disc, the fork legs and the bar turn with the front wheel', () => {
        // Where the fork legs and the disc stand across the wheel's plane, straight and steered
        const across = steer => {
            const { normal, mid } = runout(vehicle, 'front', steer);
            pose(vehicle, steer, 0.7);
            const side = object => {
                const list = vertices(THREE, object, vehicle.group);
                const centre = list.reduce((s, v) => s.add(v), new THREE.Vector3()).multiplyScalar(1 / list.length);
                return centre.sub(mid).dot(normal);
            };
            const disc = vertices(THREE, vehicle.frontDisc, vehicle.group).map(v => v.toArray());
            return { normal, left: side(vehicle.leftFork), right: side(vehicle.rightFork), bar: side(vehicle.handlebar), disc: planeNormal(disc).normal };
        };
        const straight = across(0);
        for (const steer of [0.3, -0.3]) {
            const turned = across(steer);
            expect(Math.abs(turned.left - straight.left) * 1000).toBeLessThan(1);
            expect(Math.abs(turned.right - straight.right) * 1000).toBeLessThan(1);
            expect(Math.abs(turned.bar - straight.bar) * 1000).toBeLessThan(1);
            // A twin-disc bike's two discs fit one plane each side: either way its normal is the wheel's
            expect(degrees(new THREE.Vector3(...turned.disc), turned.normal)).toBeLessThan(0.5);
        }
    });

    test('the rider\'s hands stay on the grips of the turned bar', () => {
        pose(vehicle, 0, 0);
        const hand = side => vehicle.rider.localToWorld(vehicle.arms[side].at().clone());
        const rest = [-1, 1].map(hand);
        for (const steer of [0.3, -0.3]) {
            pose(vehicle, steer, 0);
            const turn = new THREE.Quaternion().setFromAxisAngle(vehicle.steerRig.axis, steer * game.Vehicle.STEER_SHOWN);
            const { point } = vehicle.steerRig;
            [-1, 1].forEach((side, i) => {
                const grip = rest[i].clone().sub(point).applyQuaternion(turn).add(point);
                expect(hand(side).distanceTo(grip) * 1000).toBeLessThan(1);
                expect(hand(side).distanceTo(rest[i]) * 1000).toBeGreaterThan(10);
            });
        }
        pose(vehicle, 0, 0);
        [-1, 1].forEach((side, i) => expect(hand(side).distanceTo(rest[i]) * 1000).toBeLessThan(1e-3));
    });
});
