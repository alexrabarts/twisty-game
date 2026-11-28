// The free-fly camera of debug mode (js/world/freefly.js, Game.openFreeFly; .agent/system/ui.md):
//   - the gate: nothing opens without `?debug`, nor off a world ride
//   - the toggle: the ride pauses under it, and Back gives the chase camera back exactly as it was
//   - the moves: six axes, the speed steps and their limits, eased, the same flight at any frame rate
//   - the stream: the world streams round the camera while it flies, and round the bike again after
import { describe, test, expect, beforeAll, afterEach, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { loadGame, realThree } from '../helpers/load-game.js';

const read = name => readFileSync(new URL(`../../js/${name}`, import.meta.url), 'utf8');
(0, eval)(read('modals.js'));
const { FreeFly } = new Function(`${read('world/freefly.js')}\nreturn { FreeFly };`)();
const THREE = realThree();
const source = read('main.js');
const classSource = source.slice(0, source.indexOf('Game.RESTART_CLEAR_SEGMENTS = 6;') + 'Game.RESTART_CLEAR_SEGMENTS = 6;'.length);
const callouts = [];
const Game = new Function('THREE', 'FreeFly', 'showCallout', `${classSource}\nreturn Game;`)(THREE, FreeFly, (text) => callouts.push(text));

const still = () => FreeFly.controlsOf({});
const holding = (...codes) => FreeFly.controlsOf(Object.fromEntries(codes.map(code => [code, true])));
const fly = (pose = {}) => new FreeFly({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, ...pose });
const ride = (f, seconds, dt, controls) => {
    const n = Math.round(seconds / dt);
    for (let i = 0; i < n; i++) f.step(dt, controls);
    return f;
};

// A stand-in world ride: a straight ride along z, the land at 100 m
function fakeGame({ update = jest.fn(), route = null } = {}) {
    const light = () => ({ position: new THREE.Vector3(), target: new THREE.Object3D() });
    const environment = {
        isWorld: true,
        trusted: true,
        startS: 0,
        endS: 2000,
        streamClockMs: 0,
        route: route || { project: (x, z, hint, out = {}) => Object.assign(out, { index: 0, s: Math.max(0, Math.min(2000, z)) }) },
        ground: { groundY: () => 100 },
        data: { manifest: { origin: { e0: 2688000, n0: 1165000 } } },
        update
    };
    const camera = new THREE.PerspectiveCamera(70, 1.6, 0.1, 30000);
    camera.position.set(3, 104, -8);
    camera.lookAt(0, 101, 6);
    const game = Object.create(Game.prototype);
    let clock = 50000;
    Object.assign(game, {
        now: () => clock,
        advance: ms => { clock += ms; },
        startTime: 40000,
        penaltyMs: 0,
        paused: false,
        finished: false,
        environment,
        camera,
        vehicle: { position: new THREE.Vector3(0, 100, 0) },
        renderer: { domElement: document.createElement('canvas') },
        input: { clearActions: jest.fn() },
        soundManager: { stopEngineSound: jest.fn() },
        directionalLight: light(),
        distantLight: light(),
        sunOffset: { x: 50, y: 80, z: 0 }
    });
    return game;
}

const at = search => window.history.replaceState(null, '', `/${search}`);
const key = (code, type = 'keydown') => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));

afterEach(() => {
    Modals.reset();
    at('');
});

describe('the gate', () => {
    test('without ?debug nothing opens: no dialog, no pause, the ride still trusted', () => {
        at('?world=tremola');
        const game = fakeGame();
        expect(game.openFreeFly()).toBe(false);
        expect(game.freeFly).toBeUndefined();
        expect(game.paused).toBe(false);
        expect(Modals.top()).toBeNull();
        expect(game.environment.trusted).toBe(true);
    });

    test('in debug mode a world ride opens it, a classic leg does not', () => {
        at('?world=tremola&debug');
        const leg = fakeGame();
        leg.environment.isWorld = false;
        expect(leg.openFreeFly()).toBe(false);
        const game = fakeGame();
        expect(game.openFreeFly()).toBe(true);
        expect(Modals.top().element.id).toBe('free-fly');
        game.closeFreeFly();
    });

    test('the key is free: no other key of the page and none of the camera\'s own', () => {
        expect(FreeFly.KEY).toBe('KeyL');
        expect(FreeFly.reads(FreeFly.KEY)).toBe(false);
        const taken = ['KeyT', 'KeyN', 'KeyH', 'KeyG', 'KeyV', 'KeyO', 'KeyP', 'KeyM', 'KeyZ', 'KeyC', 'KeyR', 'KeyQ', 'KeyE', 'Backquote'];
        expect(taken).not.toContain(FreeFly.KEY);
        expect(source).toContain('event.code !== FreeFly.KEY');
    });
});

describe('the toggle', () => {
    beforeAll(() => at('?debug'));

    test('the ride pauses under it and keeps no time; Back gives the chase camera back exactly and the clock goes on', () => {
        at('?debug');
        const game = fakeGame();
        const cam = game.camera;
        const before = { position: cam.position.toArray(), quaternion: cam.quaternion.toArray(), up: cam.up.toArray(), fov: cam.fov, projection: [...cam.projectionMatrix.elements] };
        game.openFreeFly();
        expect(game.paused).toBe(true);
        expect(game.environment.trusted).toBe(false);
        // It starts at the chase pose
        game.stepFreeFly(0);
        expect(cam.position.toArray().map(v => +v.toFixed(9))).toEqual(before.position.map(v => +v.toFixed(9)));
        expect(cam.quaternion.angleTo(new THREE.Quaternion().fromArray(before.quaternion))).toBeLessThan(1e-6);

        // A flight with every key: the dialog stack hands them to the camera
        for (const code of ['KeyW', 'KeyD', 'KeyR', 'ArrowLeft', 'ArrowUp', 'KeyQ', 'ShiftLeft']) key(code);
        for (let i = 0; i < 120; i++) game.stepFreeFly(1 / 60);
        for (const code of ['KeyW', 'KeyD', 'KeyR', 'ArrowLeft', 'ArrowUp', 'KeyQ', 'ShiftLeft']) key(code, 'keyup');
        expect(cam.position.distanceTo(new THREE.Vector3().fromArray(before.position))).toBeGreaterThan(50);
        game.advance(7000);

        key('Escape');
        expect(game.freeFly).toBeNull();
        expect(Modals.top()).toBeNull();
        expect(game.paused).toBe(false);
        expect(cam.position.toArray()).toEqual(before.position);
        expect(cam.quaternion.toArray()).toEqual(before.quaternion);
        expect(cam.up.toArray()).toEqual(before.up);
        expect(cam.fov).toBe(before.fov);
        expect([...cam.projectionMatrix.elements]).toEqual(before.projection);
        // (the 7 s flown are not ride time)
        expect(game.startTime).toBe(47000);
        expect(game.input.clearActions).toHaveBeenCalled();
    });

    test('L goes back too, and B puts the bike down on the ride nearest the camera', () => {
        at('?debug');
        const game = fakeGame();
        game.debugPutDown = jest.fn();
        game.openFreeFly();
        key(FreeFly.KEY);
        expect(game.freeFly).toBeNull();
        expect(game.debugPutDown).not.toHaveBeenCalled();
        game.openFreeFly();
        game.freeFly.fly.x = 40;
        game.freeFly.fly.z = 700;
        key('KeyB');
        expect(game.freeFly).toBeNull();
        expect(game.debugPutDown).toHaveBeenCalledWith(40, 700);
    });

    test('G keeps the camera above the ground', () => {
        at('?debug');
        const game = fakeGame();
        game.openFreeFly();
        key('KeyG');
        expect(game.freeFly.fly.hold).toBe(true);
        key('KeyF');
        for (let i = 0; i < 600; i++) game.stepFreeFly(1 / 60);
        expect(game.freeFly.fly.y).toBeCloseTo(100 + FreeFly.CLEAR_M, 6);
        game.closeFreeFly();
    });
});

describe('the moves', () => {
    test('each of the six axes: W S A D R F move along the camera, the arrows and Q E turn it, X levels the roll', () => {
        const moves = { KeyW: ['z', -1], KeyS: ['z', 1], KeyA: ['x', -1], KeyD: ['x', 1], KeyR: ['y', 1], KeyF: ['y', -1] };
        for (const [code, [axis, sign]] of Object.entries(moves)) {
            const f = ride(fly(), 5, 1 / 60, holding(code));
            expect(Math.sign(f[axis])).toBe(sign);
            expect(Math.abs(f[axis])).toBeGreaterThan(80);
            for (const other of ['x', 'y', 'z'].filter(k => k !== axis)) expect(Math.abs(f[other])).toBeLessThan(1e-9);
        }
        const turns = { ArrowLeft: ['yaw', 1], ArrowRight: ['yaw', -1], ArrowUp: ['pitch', 1], ArrowDown: ['pitch', -1], KeyQ: ['roll', 1], KeyE: ['roll', -1] };
        for (const [code, [angle, sign]] of Object.entries(turns)) {
            const f = ride(fly(), 0.5, 1 / 60, holding(code));
            expect(Math.sign(f[angle])).toBe(sign);
            for (const other of ['yaw', 'pitch', 'roll'].filter(k => k !== angle)) expect(f[other]).toBe(0);
        }
        const rolled = ride(fly(), 0.5, 1 / 60, holding('KeyQ'));
        rolled.level();
        expect(rolled.roll).toBe(0);
        ride(rolled, 0.1, 1 / 60, still());
        expect(rolled.roll).toBe(0);
    });

    test('the moves follow the turn: turned left a quarter, W goes along -x; pitched up, along +y; rolled, D goes up', () => {
        expect(ride(fly({ yaw: Math.PI / 2 }), 3, 1 / 60, holding('KeyW')).x).toBeLessThan(-40);
        expect(ride(fly({ pitch: 1.2 }), 3, 1 / 60, holding('KeyW')).y).toBeGreaterThan(40);
        expect(ride(fly({ roll: Math.PI / 2 }), 3, 1 / 60, holding('KeyD')).y).toBeGreaterThan(40);
        const { right, up, forward } = fly({ yaw: 0.7, pitch: -0.4, roll: 1.1 }).axes();
        const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
        expect([dot(right, up), dot(up, forward), dot(right, forward)].map(v => Math.abs(v) < 1e-12)).toEqual([true, true, true]);
        expect([dot(right, right), dot(up, up), dot(forward, forward)].map(v => +v.toFixed(12))).toEqual([1, 1, 1]);
    });

    test('the pitch stops short of straight up and down, and a mouse turn adds to the keys', () => {
        const f = ride(fly(), 10, 1 / 60, holding('ArrowUp'));
        expect(f.pitch).toBe(FreeFly.TURN.pitchMax);
        const g = fly();
        g.step(1 / 60, still(), { yaw: -0.3, pitch: 0.1 });
        expect([g.yaw, g.pitch]).toEqual([-0.3, 0.1]);
    });

    test('the speed: the wheel steps it from 2 to 500 m/s, Shift is 5 x and Alt a fifth, and it eases to them', () => {
        const S = FreeFly.SPEED, f = fly();
        expect(f.speed).toBe(S.start);
        f.scaleSpeed(1);
        expect(f.speed).toBeCloseTo(S.start * S.step, 9);
        f.scaleSpeed(100);
        expect(f.speed).toBe(S.max);
        f.scaleSpeed(-100);
        expect(f.speed).toBe(S.min);
        const top = controls => -ride(fly(), 10, 1 / 60, controls).velocity.z;
        expect(top(holding('KeyW'))).toBeCloseTo(S.start, 6);
        expect(top(holding('KeyW', 'ShiftLeft'))).toBeCloseTo(S.start * S.fast, 6);
        expect(top(holding('KeyW', 'AltLeft'))).toBeCloseTo(S.start * S.slow, 6);
        // (a little inertia: after a tenth of a second it is still well short of its speed)
        expect(-ride(fly(), 0.1, 1 / 60, holding('KeyW')).velocity.z).toBeLessThan(S.start / 2);
        // Two keys at once move no faster than one
        expect(Math.hypot(...Object.values(ride(fly(), 10, 1 / 60, holding('KeyW', 'KeyD')).velocity))).toBeCloseTo(S.start, 6);
    });

    test('framerate independent: the same flight at 30, 60 and 144 Hz and in one step', () => {
        const flight = dt => {
            const f = ride(fly({ yaw: 0.4, pitch: -0.2, roll: 0.3 }), 2, dt, holding('KeyW', 'KeyD', 'KeyR'));
            return ride(f, 1, dt, still());
        };
        const ref = flight(1);
        for (const dt of [1 / 30, 1 / 60, 1 / 144]) {
            const f = flight(dt);
            for (const k of ['x', 'y', 'z']) expect(f[k]).toBeCloseTo(ref[k], 9);
        }
        // A turn too: the angle a held key gives in a second
        const turned = dt => ride(fly(), 1, dt, holding('ArrowLeft', 'KeyQ'));
        for (const dt of [1 / 30, 1 / 144]) {
            expect(turned(dt).yaw).toBeCloseTo(turned(1).yaw, 9);
            expect(turned(dt).roll).toBeCloseTo(turned(1).roll, 9);
        }
    });

    test('a gamepad: the left stick moves, the right stick turns, the triggers go up and down, the bumpers roll', () => {
        const button = value => ({ value, pressed: value > 0 });
        const pad = { connected: true, axes: [0.5, -1, 0.05, 0.6], buttons: [0, 0, 0, 0, 1, 0, 0, 0.8].map(button) };
        const c = FreeFly.addPad(still(), pad);
        expect(c.move).toEqual({ x: 0.5, y: 0.8, z: 1 });
        expect(c.turn.yaw).toBe(0);
        expect(c.turn.pitch).toBeLessThan(0);
        expect(c.turn.roll).toBe(1);
    });

    test('the readout: speed, x y z, LV95 E N and height, the nearest ride s', () => {
        const f = fly({ x: 1500.4, y: 2091.6, z: -820 });
        const out = f.readout({ e0: 2688000, n0: 1165000 }, 7012.7);
        expect([out.e, out.n, out.h]).toEqual([2689500.4, 1165820, 2091.6]);
        expect(out.text).toContain('E 2689500 N 1165820 H 2092 m');
        expect(out.text).toContain('ride s 7013');
        expect(out.text).toContain('20 m/s');
    });

    test('the bar: the help line, the readout and three buttons with their keys', () => {
        const acts = [];
        const bar = FreeFly.bar(document, name => acts.push(name));
        const keys = Object.fromEntries([...bar.querySelectorAll('[data-fly]')].map(b => [b.dataset.fly, b.dataset.key]));
        expect(keys).toEqual({ ground: 'KeyG', bike: 'KeyB', done: `Escape,${FreeFly.KEY}` });
        expect(bar.querySelector('.free-fly-help').textContent).toBe(FreeFly.HELP);
        bar.querySelector('[data-fly="ground"]').click();
        expect(acts).toEqual(['ground']);
        for (const name of Object.keys(FreeFly.BINDINGS)) for (const code of FreeFly.BINDINGS[name]) expect(['KeyG', 'KeyB', FreeFly.KEY, 'Escape']).not.toContain(code);
    });
});

describe('the stream', () => {
    test('while it flies the world streams round the camera; back on the ride, round the bike', () => {
        at('?debug');
        const { WorldStreamer, WorldData } = loadGame();
        const m = WorldData.TILE_M, tiles = [];
        for (let tx = -2; tx <= 12; tx++) for (let tz = -2; tz <= 9; tz++) tiles.push([tx, tz]);
        // A straight ride along z at x = 0, 4 km long
        const points = Array.from({ length: 1001 }, (_, i) => ({ x: 0, z: i * 4 }));
        const line = { points, sArray: points.map(p => p.z), length: 4000, indexAt: s => Math.max(0, Math.min(1000, Math.round(s / 4))) };
        const data = { manifest: { tiles: { height: tiles } }, tile: () => null, chunksNear: () => [], chunks: new Map(), ensureTile: () => new Promise(() => {}), ensureCover: () => new Promise(() => {}) };
        let clockMs = 0;
        const streamer = new WorldStreamer({ data, route: line, hooks: {}, clock: () => clockMs });
        const calls = [];
        const project = (x, z, hint, out = {}) => Object.assign(out, { index: 0, s: Math.max(0, Math.min(4000, z)) });
        const game = fakeGame({ route: { project }, update: (position, s) => { calls.push({ x: position.x, z: position.z, s }); streamer.update(position, s); } });
        const tileOf = (x, z) => `${Math.floor(x / m)},${Math.floor(z / m)}`;

        // The ride frame before the fly: round the bike at the start
        game.environment.update(game.vehicle.position, 0);
        expect(streamer.refs.has(tileOf(0, 0))).toBe(true);

        game.openFreeFly();
        const f = game.freeFly.fly;
        f.x = 5000 + m / 2;
        f.z = 3500;
        f.y = 3000;
        game.stepFreeFly(1 / 60);
        const flown = calls[calls.length - 1];
        expect([flown.x, flown.z, flown.s]).toEqual([f.x, f.z, 3500]);
        expect(streamer.refs.has(tileOf(f.x, f.z))).toBe(true);
        // (5 km from the bike: its own tiles are let go, only the ride's near the camera's nearest place are held)
        expect(streamer.refs.has(tileOf(0, 0))).toBe(false);
        expect(streamer.refs.has(tileOf(0, 3500))).toBe(true);
        // The stream's clock moves while it flies
        expect(game.environment.streamClockMs).toBeCloseTo(1000 / 60, 9);

        game.closeFreeFly();
        expect(game.freeFly).toBeNull();
        // The next ride frame streams round the bike again (Game.animate: environment.update(vehicle.position, ...))
        // (round the drone instead while it is out: js/world/drone.js)
        expect(source).toMatch(/this\.environment\.update\(drone \? drone\.streamAt : this\.vehicle\.position, drone \? drone\.streamS\(\) : this\.worldStreamS\(\)/);
        game.environment.update(game.vehicle.position, 0);
        expect(streamer.refs.has(tileOf(0, 0))).toBe(true);
        expect(streamer.refs.has(tileOf(f.x, f.z))).toBe(false);
    });
});
