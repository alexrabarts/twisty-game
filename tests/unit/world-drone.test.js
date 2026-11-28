// The drone of the hairpin car park (js/world/drone.js; .agent/system/ui.md, "The drone"): on the streamed stage that
// holds it, a bike stands in the car park, the drone lifts off its pad beside the bike and flies a scripted flight with
// both cameras flipped on the way: into the wall at the back of the car park (a crash, then a relaunch from the pad),
// out past its range (it comes home by itself and lands on its pad), and on a flat battery (it comes home when low, and
// lands where it is when flat). It fails on a drone under the drawn ground at any step, a camera under the ground, a
// camera that jumps (a frame that moves the eye further than the flight or the ease between two views moves it), or a
// spot that does not answer a bike standing in it.
import { describe, test, expect, beforeAll } from '@jest/globals';
import { loadGame, loadScript } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';

const DT = 1 / 60;
const game = loadGame();
const { THREE, WorldEnvironment, WorldCamera } = game;
const { Drone, DroneCamera, DroneWorld, DroneModel, DroneSpot } = new Function('THREE', 'WorldCamera', `${loadScript('world/drone.js')}\nreturn { Drone, DroneCamera, DroneWorld, DroneModel, DroneSpot };`)(THREE, WorldCamera);
const STICKS = { throttle: 0, yaw: 0, pitch: 0, roll: 0 };

describe('the drone of the hairpin car park', () => {
    let env, place, stop, drone, cam, log;
    const ground = (x, z) => env.ground.groundY(x, z, null);
    const problems = [];
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

    // One frame: the drone flies, the world streams round it, the camera follows; every frame is checked
    function frame(controls = STICKS) {
        const before = { x: drone.x, y: drone.y, z: drone.z };
        const eye = { ...cam.now };
        const blending = cam.from && cam.t < 1;
        const span = blending ? dist(cam.from, Drone.view(cam.mode, drone, {})) : 0;
        drone.step(DT, controls);
        const view = cam.step(DT, drone, ground);
        log.frames++;
        const floor = ground(drone.x, drone.z);
        if (Number.isFinite(floor) && drone.y < floor + Drone.FLIGHT.legM * 0.3 - 0.02) problems.push(`frame ${log.frames}: the drone is ${(floor - drone.y).toFixed(2)} m into the ground (${drone.state})`);
        const under = ground(view.x, view.z);
        if (Number.isFinite(under) && view.y < under) problems.push(`frame ${log.frames}: the ${cam.mode} camera is under the ground`);
        if (Number.isFinite(eye.x)) {
            const moved = dist(eye, view), flew = dist(before, drone);
            // (an ease moves the eye 1.5 times its even share at the most, and lifts it over a hill on the way by
            // as much again at a slope of 1)
            const allowed = (blending ? 3.2 * span * DT / Drone.VIEW.blendS : 0) + 1.2 * flew + 0.05;
            if (moved > allowed) problems.push(`frame ${log.frames}: the ${cam.mode} camera jumped ${moved.toFixed(2)} m (allowed ${allowed.toFixed(2)})`);
        }
    }
    const fly = (seconds, controls, until = () => false) => {
        for (let i = 0; i < seconds / DT; i++) { frame(controls); if (until()) return true; }
        return false;
    };
    const launch = (battery = 1) => {
        problems.length = 0;
        const { home, pilot } = Drone.padBeside(stop.x, stop.z, stop.heading, ground);
        drone = new Drone(home, pilot, { ground, hit: (a, b, r) => DroneWorld.hit(env, a, b, r) });
        drone.battery = battery;
        cam = new DroneCamera('sight', Drone.view('sight', drone, {}));
        cam.step(0, drone);
    };

    beforeAll(async () => {
        const { fetchFn } = diskFetch();
        env = await WorldEnvironment.load(new THREE.Scene(), { id: 'susten-gadmen', fetchFn, models: null, digest: async () => '0' });
        place = env.places.list.find(p => p.egg === 'drone');
        stop = env.places.stopAt(place, 0, env.ground, {});
        await env.streamer.settle({ x: stop.x, z: stop.z }, stop.s);
        for (let i = 0; i < 30; i++) env.update(new THREE.Vector3(stop.x, stop.y, stop.z), stop.s, null, 50, DT);
        log = { frames: 0 };
    }, 180000);

    test('a bike standing in the car park finds it, and one riding through or standing on the road does not', () => {
        const spot = new DroneSpot(env.places);
        expect(spot.places).toEqual([place]);
        let found = null;
        for (let i = 0; i < 70; i++) found = spot.watch(stop.s, stop.lateral, 0, DT) || found;
        expect(found).toBe(place);
        const passing = new DroneSpot(env.places);
        for (let i = 0; i < 120; i++) expect(passing.watch(stop.s, stop.lateral, 6, DT)).toBeNull();
        const road = new DroneSpot(env.places);
        for (let i = 0; i < 120; i++) expect(road.watch(stop.s, 2, 0, DT)).toBeNull();
    });

    test('it lifts off its pad on the car park, flies into the wall at the back and crashes, then relaunches from the pad', () => {
        launch();
        const pad = { ...drone.home };
        expect(drone.state).toBe('landed');
        fly(1.2, { ...STICKS, throttle: 1 });
        expect(drone.state).toBe('flying');
        expect(drone.y - pad.y).toBeGreaterThan(2.5);
        // Flip to the onboard camera, turn left to face the wall across the car park and fly into it
        cam.flip();
        fly(Math.PI / 2 / Drone.FLIGHT.yawRad, { ...STICKS, yaw: 1 });
        const hit = fly(8, { ...STICKS, pitch: 1 }, () => drone.state === 'crashed');
        expect(hit).toBe(true);
        expect(drone.cause).toBe('a wall');
        // (it falls from the wall's face to the ground, then lies still for Drone.FLIGHT.restS)
        fly(3, STICKS);
        expect(drone.relaunch()).toBe(true);
        expect(drone.state).toBe('landed');
        expect(Math.hypot(drone.x - pad.x, drone.z - pad.z)).toBeLessThan(0.01);
        cam.flip();
        fly(1, STICKS);
        if (problems.length) throw new Error(problems.slice(0, 20).join('\n'));
    }, 120000);

    test('past its range it comes home by itself and lands on its pad', () => {
        launch();
        fly(12, { ...STICKS, throttle: 1 });
        // Out along the ride's own way, down the valley
        drone.yaw = stop.heading;
        cam.flip();
        const out = fly(90, { ...STICKS, pitch: 1 }, () => drone.state !== 'flying');
        expect(out).toBe(true);
        expect(drone.state).toBe('home');
        expect(drone.reason).toBe('signal');
        cam.flip();
        const back = fly(150, STICKS, () => drone.state === 'done' || drone.state === 'crashed');
        expect(back).toBe(true);
        expect(drone.state).toBe('done');
        expect(drone.atHome()).toBe(true);
        if (problems.length) throw new Error(problems.slice(0, 20).join('\n'));
    }, 120000);

    test('low on battery it comes home, and on a flat battery it lands where it is', () => {
        launch();
        fly(6, { ...STICKS, throttle: 1 });
        cam.flip();
        fly(5, { ...STICKS, pitch: 0.6 });
        expect(drone.state).toBe('flying');
        drone.battery = Drone.FLIGHT.homeShare + 0.002;
        fly(5, { ...STICKS, pitch: 0.6 }, () => drone.state === 'home');
        expect(drone.state).toBe('home');
        expect(drone.reason).toBe('battery');
        drone.battery = 0.002;
        const down = fly(60, STICKS, () => drone.state === 'landed' || drone.state === 'crashed');
        expect(down).toBe(true);
        expect(drone.state).toBe('landed');
        expect(drone.battery).toBe(0);
        // Nothing lifts it now
        fly(2, { ...STICKS, throttle: 1 });
        expect(drone.state).toBe('landed');
        if (problems.length) throw new Error(problems.slice(0, 20).join('\n'));
    }, 120000);

    test('the model is small and modest: props, legs, a camera and an LED in a few hundred triangles', () => {
        const model = new DroneModel();
        expect(model.props.length).toBe(4);
        expect(model.triangles).toBeLessThan(800);
        const box = new THREE.Box3().setFromObject(model.group);
        expect(box.max.x - box.min.x).toBeLessThan(0.5);
        launch();
        drone.propAngle = 1;
        model.update(drone, 0);
        expect(model.props[0].rotation.y).toBeCloseTo(1, 6);
    });
});
