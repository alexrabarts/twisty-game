// The carving swing of the chase camera in a world. The legs' chase camera moves sideways with the lean (and a lagged
// share of the yaw rate) and pushes its look point into the corner, both behind the bike by a lerp, so a change from
// one lean to the other reads as the camera carving after the bike. The world camera turns its boom by the route,
// not the bike, and dropped both; these tests hold it to the legs' swing on the same weave, measured through the real
// Game.updateCamera.
import { describe, test, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { loadGame } from '../helpers/load-game.js';
import { samplesOf, straight } from '../helpers/world-synthetic.js';

const game = loadGame();
const { THREE, WorldRoute, WorldCamera } = game;
const source = readFileSync(new URL('../../js/main.js', import.meta.url), 'utf8');
const classSource = source.slice(0, source.indexOf('Game.RESTART_CLEAR_SEGMENTS = 6;') + 'Game.RESTART_CLEAR_SEGMENTS = 6;'.length);
const Game = new Function('THREE', 'WorldCamera', 'showCallout', 'TourSystem', 'Course', `${classSource}\nreturn Game;`)(
    THREE, WorldCamera, () => {}, {}, {}
);

// The legs' camera with its boom held to the road instead of turned by the bike's yaw: what the world restores
const roadBoomSource = classSource.replace('if (!world) offset.applyEuler(vehicleRotation);', '');
const RoadBoomGame = new Function('THREE', 'WorldCamera', 'showCallout', 'TourSystem', 'Course', `${roadBoomSource}\nreturn Game;`)(
    THREE, WorldCamera, () => {}, {}, {}
);

const DT = 1 / 60;
const MODES = [
    { name: 'Onboard', type: 'onboard', offset: new THREE.Vector3(0, 1.2, 0.5), lerpFactor: 0.18 },
    { name: 'Helmet Cam', type: 'helmet', offset: new THREE.Vector3(0, 1.15, 0.35), lerpFactor: 1.0 },
    { name: 'Standard', type: 'follow', offset: new THREE.Vector3(0, 3, -6), lerpFactor: 0.10 },
    { name: 'High View', type: 'high', offset: new THREE.Vector3(0, 8, -12), lerpFactor: 0.08 }
];

// A weave on a straight road along +z (the code's lateral is +x): the bike's line is x = A sin(wt), its yaw the
// line's heading and its lean what holds that curvature at that speed (positive lean turns toward -x, as
// Vehicle's yaw does). T 2.5 s and A 0.8 m lean the bike about 27 degrees each way at any speed.
const WEAVE = { A: 0.8, T: 2.5, seconds: 10, settle: 3 };
const Y = 100;

function ride(world, modeIndex, speed, ground = { groundY: () => Y }, Kind = Game) {
    const route = new WorldRoute(samplesOf(straight(400, { y: Y })), {});
    const game = Object.create(Kind.prototype);
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 2000);
    const w = 2 * Math.PI / WEAVE.T;
    const z0 = 40;
    const vehicle = {
        position: new THREE.Vector3(0, Y, z0), velocity: new THREE.Vector3(), speed, maxSpeed: 60, leanAngle: 0, yawAngle: 0,
        comfortShake: 1, isWheelie: false, isJumping: false, fallingOffCliff: false, crashed: false,
        projection: { s: z0, index: Math.floor(z0 / 4) }, routeS: z0
    };
    const place = t => {
        const x = WEAVE.A * Math.sin(w * t);
        const slope = WEAVE.A * w / speed * Math.cos(w * t);
        const curve = -WEAVE.A * (w / speed) ** 2 * Math.sin(w * t);
        const kappa = curve / Math.pow(1 + slope * slope, 1.5);
        const z = z0 + speed * t;
        vehicle.position.set(x, Y, z);
        vehicle.yawAngle = Math.atan(slope);
        vehicle.leanAngle = -Math.atan(speed * speed * kappa / 9.81);
        vehicle.projection.s = z;
        vehicle.projection.index = Math.floor(z / 4);
        vehicle.routeS = z;
    };
    place(0);
    const worldCamera = new WorldCamera(route, ground);
    worldCamera.reset(0);
    Object.assign(game, {
        camera, vehicle, cameraModes: MODES, cameraMode: modeIndex, cameraIntroActive: false,
        environment: world ? { isWorld: true, route, ground } : { isWorld: false, route },
        worldCamera,
        baseCameraOffset: MODES[modeIndex].offset.clone(), cameraOffset: MODES[modeIndex].offset.clone(),
        currentCameraPos: new THREE.Vector3(0, Y + 3, z0 - 6), currentLookTarget: new THREE.Vector3(0, Y + 1, z0),
        tempMatrix: new THREE.Matrix4(), tempVector: new THREE.Vector3(), tempUpVector: new THREE.Vector3(),
        cameraLerpFactor: MODES[modeIndex].lerpFactor, cameraLateralOffset: 0, previousYawAngle: 0, currentCameraBanking: 0,
        tunnelRoofY: () => null, updateShadowCamera() {}
    });
    const rows = [];
    const random = Math.random;
    Math.random = () => 0.5;
    try {
        const frames = Math.round(WEAVE.seconds / DT);
        for (let i = 0; i <= frames; i++) {
            const t = i * DT;
            place(t);
            game.updateCamera(DT);
            const eye = game.camera.position, look = game.currentLookTarget;
            rows.push({
                t, lean: vehicle.leanAngle,
                // The camera across the road from the bike, and the view's yaw off the road
                camera: eye.x - vehicle.position.x, view: Math.atan2(look.x - eye.x, look.z - eye.z),
                lead: worldCamera.lookSwing, share: worldCamera.swingShare, fraction: worldCamera.fraction,
                clear: eye.y - ground.groundY(eye.x, eye.z)
            });
        }
    } finally {
        Math.random = random;
    }
    return rows;
}

// Amplitude and phase (rad) of `key` at the weave's frequency, over a whole number of settled periods
function fit(rows, key) {
    const w = 2 * Math.PI / WEAVE.T;
    const use = rows.filter(r => r.t >= WEAVE.settle);
    const n = Math.floor((use.length * DT) / WEAVE.T) * Math.round(WEAVE.T / DT);
    let a = 0, b = 0;
    for (let i = 0; i < n; i++) {
        a += use[i][key] * Math.sin(w * use[i].t);
        b += use[i][key] * Math.cos(w * use[i].t);
    }
    return { amplitude: 2 * Math.hypot(a, b) / n, phase: Math.atan2(b, a) };
}

// Seconds `key` trails the lean pushed into the corner (every swing here is -gain x lean)
function lagBehindLean(rows, key) {
    const lean = fit(rows, 'lean'), got = fit(rows, key);
    const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
    return wrap(lean.phase + Math.PI - got.phase) / (2 * Math.PI / WEAVE.T);
}

const measure = rows => ({
    camera: fit(rows, 'camera').amplitude, cameraLag: lagBehindLean(rows, 'camera'),
    view: fit(rows, 'view').amplitude, viewLag: lagBehindLean(rows, 'view')
});

describe('the world chase camera carves like the legs camera', () => {
    for (const speed of [12, 20]) {
        for (const mode of [2, 3]) {
            test(`a weave at ${speed} m/s in ${MODES[mode].name}: the camera swings sideways and its view swings into the corner, behind the lean, as far as the legs camera with its boom held to the road`, () => {
                const legs = measure(ride(false, mode, speed, undefined, RoadBoomGame));
                const rows = ride(true, mode, speed);
                const world = measure(rows);
                // The world camera before this moved 0.17 m across the road and 0.04-0.06 rad in view yaw on this weave
                expect(world.camera).toBeGreaterThan(0.85 * legs.camera);
                expect(world.camera).toBeLessThan(1.2 * legs.camera);
                expect(world.view).toBeGreaterThan(0.75 * legs.view);
                expect(world.view).toBeLessThan(1.2 * legs.view);
                // The view comes round into the new corner after the bike leans into it, as the legs' view does
                expect(world.viewLag).toBeGreaterThan(0.15);
                expect(Math.abs(world.cameraLag - legs.cameraLag)).toBeLessThan(0.15);
                // The look point leads into the corner by the legs' gain, a lerp behind the lean
                const lead = fit(rows, 'lead').amplitude, lean = fit(rows, 'lean').amplitude;
                const gain = mode === 3 ? 2 : 4;
                expect(lead).toBeGreaterThan(0.85 * gain * lean);
                expect(lead).toBeLessThan(gain * lean);
                expect(lagBehindLean(rows, 'lead')).toBeGreaterThan(0.05);
                // Out in the open the land never cuts it
                expect(Math.min(...rows.map(r => r.share))).toBe(1);
            });
        }
    }

    test('a bank beside the road scales the swing down rather than drop it, and the boom is no shorter for it', () => {
        // A steep bank rising from 1 m to the +x side; a swing of 1.5 m toward it would put the camera in the bank
        const route = new WorldRoute(samplesOf(straight(400, { y: Y })), {});
        const at = (s, x) => ({ x: 0, y: Y, z: s, s, index: Math.floor(s / 4), speed: 12, lift: 1, offset: { x: 0, y: 3, z: -6 }, fov: 75, swing: { x, look: 0, follow: 0.1, lookFollow: 0.15 } });
        const run = (ground, x) => {
            const camera = new WorldCamera(route, ground);
            const rows = [];
            for (let s = 40; s < 100; s += 12 * DT) {
                const placed = camera.update(at(s, x), DT);
                rows.push({ share: camera.swingShare, fraction: camera.fraction, clear: placed.y - ground.groundY(placed.x, placed.z), x: placed.x });
            }
            return rows;
        };
        const bank = { groundY: x => Y + Math.max(0, x - 1) * 8 };
        const open = { groundY: () => Y };
        const toward = run(bank, 1.5), away = run(bank, -1.5), free = run(open, 1.5), none = run(bank, 0);
        const last = rows => rows[rows.length - 1];
        // Toward the bank the swing is cut to a part of itself, not to nothing; away from it, and in the open, it is whole
        expect(last(toward).share).toBeGreaterThan(0.2);
        expect(last(toward).share).toBeLessThan(0.9);
        expect(last(toward).x).toBeGreaterThan(0.3);
        expect(last(away).share).toBe(1);
        expect(last(free).share).toBe(1);
        expect(last(free).x).toBeCloseTo(1.5, 2);
        // The camera keeps clear of the bank, and its boom is no shorter than with no swing at all
        toward.forEach((r, i) => {
            expect(r.clear).toBeGreaterThan(WorldCamera.FLOOR_M - 0.05);
            expect(r.fraction).toBeGreaterThan(none[i].fraction - 0.02);
        });
    });
});
