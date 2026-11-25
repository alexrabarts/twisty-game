// Free roam (js/gamemodes.js, js/world/freeroam.js, the follow camera of js/world/camera.js, the guide's roam):
//   - the mode: from the address and the menu, locked without debug mode (a locked choice is a time trial), and the
//     rider screen's row shows the lock
//   - the edge of the map on a synthetic world: the detailed land's outline, the soft band that slows and the hard
//     line that turns back; never NaN outside the land
//   - a restart goes back to the last place on a road a second before, facing the way it went (turned round at the edge)
//   - the camera follows the rider's own way on any road; the guide has no off-route or wrong-way rule
import { describe, test, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGame } from '../helpers/load-game.js';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = name => readFileSync(join(root, 'js', name), 'utf8');
const { GameModes } = new Function(`${read('gamemodes.js')}\nreturn { GameModes };`)();
const { FreeRoam } = new Function(`${read('world/freeroam.js')}\nreturn { FreeRoam };`)();
const { WorldLooks } = new Function(`${read('world/looks.js')}\nreturn { WorldLooks };`)();
const game = loadGame();

describe('the mode', () => {
    test('free roam is open in debug mode only; locked, it is a time trial whatever is asked', () => {
        expect(GameModes.open('trial', false)).toBe(true);
        expect(GameModes.open('roam', false)).toBe(false);
        expect(GameModes.open('roam', true)).toBe(true);
        expect(GameModes.active({ mode: 'roam' }, false)).toBe('trial');
        expect(GameModes.active({ mode: 'roam' }, true)).toBe('roam');
        GameModes.chosen = 'roam';
        expect(GameModes.active({ mode: 'trial' }, true)).toBe('roam');
        expect(GameModes.active({ mode: 'trial' }, false)).toBe('trial');
        GameModes.chosen = 'trial';
    });

    test('the rider screen row: the locked mode shows its lock and cannot be chosen; in debug mode it can', () => {
        const locked = GameModes.control(document, { debug: false, icon: () => '[lock]' });
        const roam = locked.querySelector('[data-game-mode="roam"]');
        expect(roam.disabled).toBe(true);
        expect(roam.textContent).toContain('[lock]');
        roam.click();
        expect(GameModes.chosen).toBe('trial');
        expect(locked.textContent).toContain(GameModes.LOCKED_TEXT);
        const open = GameModes.control(document, { debug: true });
        open.querySelector('[data-game-mode="roam"]').click();
        expect(GameModes.chosen).toBe('roam');
        expect(open.querySelector('[data-game-mode="roam"]').getAttribute('aria-checked')).toBe('true');
        GameModes.chosen = 'trial';
    });
});

describe('the edge of the map', () => {
    // A synthetic world: a block of 3 by 2 tiles of 512 m
    const tiles = [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]];
    const R = FreeRoam.RULE;

    test('the outline of the detailed land: deep inside, the soft band, the hard line, and outside', () => {
        const roam = new FreeRoam(tiles, 512);
        expect(roam.edgeDistance(768, 512)).toBeCloseTo(512, 6);
        expect(roam.edgeDistance(100, 512)).toBeCloseTo(100, 6);
        expect(roam.edgeDistance(-10, 512)).toBe(0);
        expect(roam.edgeDistance(5000, 5000)).toBe(0);
        const at = (x) => roam.step({ x, y: 1000, z: 512, heading: 0, speed: 10, onRoad: true, crashed: false, dt: 0.1 });
        expect(at(768).zone).toBe('in');
        const soft = at(R.softM - 10);
        expect(soft.zone).toBe('soft');
        expect(soft.drag).toBeGreaterThan(0);
        expect(at(R.hardM - 1).zone).toBe('hard');
        expect(at(-500).zone).toBe('hard');
        for (const x of [-1e6, NaN, 1e9]) expect(Number.isNaN(at(x).drag)).toBe(false);
    });

    test('a restart goes back a second along the road, facing the way it went; at the edge turned round', () => {
        const roam = new FreeRoam(tiles, 512);
        for (let i = 0; i < 40; i++) roam.step({ x: 300 + i, y: 1000, z: 512, heading: 0.5, speed: 10, onRoad: i < 30, crashed: false, dt: 0.1 });
        const pose = roam.restartPose();
        expect(pose.x).toBeLessThanOrEqual(300 + 29);
        expect(pose.x).toBeGreaterThan(300);
        expect(pose.heading).toBeCloseTo(0.5, 9);
        const turned = roam.restartPose(true);
        expect(turned.heading).toBeCloseTo(0.5 + Math.PI, 9);
        expect(new FreeRoam(tiles, 512).restartPose()).toBe(null);
    });
});

describe('the camera and the guide', () => {
    test('the follow camera reads the rider\'s own line, not the ride', () => {
        const { WorldCamera } = game;
        const route = { length: 1000, points: [{ x: 0, z: 0 }, { x: 0, z: 1000 }], sample: (s, out) => Object.assign(out || {}, { x: 0, y: 0, z: s, heading: 0 }), curvatureAt: () => 0.05 };
        const camera = Object.create(WorldCamera.prototype);
        camera.route = route;
        camera.sampled = {};
        camera.followAt = { x: 100, y: 7, z: 200, heading: Math.PI / 2, s: 50 };
        const p = camera.centre(60, {});
        expect([p.x, p.y, p.z, p.heading]).toEqual([110, 7, expect.closeTo(200, 9), Math.PI / 2]);
        expect(camera.curvature(60)).toBe(0);
        camera.followAt = null;
        expect(camera.centre(60, {}).z).toBe(60);
    });

    test('in free roam the guide never warns or restarts, off the ride or against it', () => {
        const { WorldGuide } = new Function('WorldAssist', `${read('world/guide.js')}\nreturn { WorldGuide };`)({ level: () => 1 });
        const guide = Object.create(WorldGuide.prototype);
        guide.route = { offRoute: () => true };
        guide.reset = WorldGuide.prototype.reset;
        guide.render = () => {};
        guide.reset();
        guide.roam = true;
        let restarted = false;
        guide.onRestart = () => { restarted = true; };
        for (let i = 0; i < 400; i++) expect(guide.step({ projection: { heading: 0 }, speed: 20, yaw: Math.PI, dt: 0.1 })).toBe(null);
        expect(restarted).toBe(false);
        guide.roam = false;
        let fired = null;
        for (let i = 0; i < 400 && !fired; i++) fired = guide.step({ projection: { heading: 0 }, speed: 20, yaw: Math.PI, dt: 0.1 });
        expect(fired).toBe('restart');
    });
});

describe('the streamer', () => {
    test('the land and the roads follow the bike by place: a bike 2.5 km off the ride holds the tiles round it', () => {
        const { WorldStreamer, WorldData } = game;
        const m = WorldData.TILE_M, tiles = [];
        for (let tx = -2; tx <= 8; tx++) for (let tz = -2; tz <= 4; tz++) tiles.push([tx, tz]);
        // A straight ride along z at x = 0, 2 km long
        const points = Array.from({ length: 501 }, (_, i) => ({ x: 0, z: i * 4 }));
        const route = { points, sArray: points.map(p => p.z), length: 2000, indexAt: s => Math.max(0, Math.min(500, Math.round(s / 4))) };
        const data = { manifest: { tiles: { height: tiles } }, tile: () => null, chunksNear: () => [], chunks: new Map(), ensureTile: () => new Promise(() => {}), ensureCover: () => new Promise(() => {}) };
        const streamer = new WorldStreamer({ data, route, hooks: {}, clock: () => 0 });
        const bike = { x: 2500 + m / 2, z: 1000 };
        streamer.update(bike, 1000);
        const held = [...streamer.refs.keys()];
        expect(held).toContain(`${Math.floor(bike.x / m)},${Math.floor(bike.z / m)}`);
        // (and the tiles by the ride at the nearest place on it, as free roam streams by: Game.worldStreamS)
        expect(held).toContain(`0,${Math.floor(1000 / m)}`);
    });
});

describe('start anywhere', () => {
    // A stand-in world: a straight ride of 2 km, three stopping places, the stage from 0 to 2000
    const route = { length: 2000, sample: (s, out = {}) => Object.assign(out, { x: 0, y: s / 10, z: s, heading: 0, width: 6 }) };
    const places = { list: [{ id: 'p1', kind: 'layby', s: 400 }, { id: 'p2', kind: 'viewpoint', s: 1100 }, { id: 'p3', kind: 'carpark', s: 1800 }],
        stopAt: (place, slot, ground, out) => Object.assign(out, { s: place.s + 10, x: 5, y: (place.s + 10) / 10, z: place.s + 10, heading: 0 }) };
    const environment = { route, places, startS: 0, endS: 2000, ground: null };

    test('the destinations: the start, every stopping place in order, the summit', () => {
        const list = FreeRoam.destinations(environment);
        expect(list.map(d => d.id)).toEqual(['start', 'p1', 'p2', 'p3', 'summit']);
        expect(list[2].name).toBe('Viewpoint, km 1.1');
        for (const d of list) for (const k of ['s', 'x', 'y', 'z', 'heading']) expect(Number.isFinite(d[k])).toBe(true);
    });

    test("the menu's start: the start, the stopping place nearest the middle, the summit", () => {
        expect(FreeRoam.startFor(environment, 'start')).toMatchObject({ id: 'start', s: FreeRoam.START_ROOM_M });
        expect(FreeRoam.startFor(environment, 'place').id).toBe('p2');
        expect(FreeRoam.startFor(environment, 'summit').id).toBe('summit');
        expect(FreeRoam.startFor({ ...environment, places: { list: [] } }, 'place').id).toBe('start');
    });

    test('the rider screen shows the start row with free roam only', () => {
        const box = GameModes.control(document, { debug: true });
        const row = box.querySelector('.game-start-row');
        expect(row.hidden).toBe(true);
        box.querySelector('[data-game-mode="roam"]').click();
        expect(row.hidden).toBe(false);
        box.querySelector('[data-game-start="summit"]').click();
        expect(GameModes.startAt).toBe('summit');
        GameModes.chosen = 'trial';
        GameModes.startAt = 'start';
    });
});

describe('time of day and weather', () => {
    test('every part of every stage takes the chosen time and weather; "as the road" keeps the stage\'s own', () => {
        const looks = WorldLooks.pick('');
        expect(WorldLooks.fixed(looks, 'stage', 'stage')).toBe(looks);
        const night = WorldLooks.fixed(looks, 'night', 'rain');
        for (const id of Object.keys(looks)) {
            expect(night[id].length).toBe(looks[id].length);
            for (const part of night[id]) expect(part.look).toMatchObject({ timeOfDay: 'night', weather: 'rain', weatherIntensity: 1 });
        }
        const dawn = WorldLooks.fixed(looks, 'dawn', 'stage');
        expect(dawn.tremola.map(p => p.look.weather)).toEqual(looks.tremola.map(p => p.look.weather));
        expect(dawn.tremola.every(p => p.look.timeOfDay === 'dawn')).toBe(true);
        // (the stage's own table is not changed)
        expect(looks.tremola[0].look.timeOfDay).toBe('day');
    });

    test('the pickers offer no snow (its grip under the hairpin bound) and every weather has a strength', () => {
        expect(GameModes.WEATHERS.map(w => w.id)).not.toContain('snow');
        for (const w of GameModes.WEATHERS) if (w.id !== 'stage') expect(Number.isFinite(WorldLooks.strength[w.id])).toBe(true);
        expect(WorldLooks.grip.rain.lateral * 0.85).toBeGreaterThanOrEqual(WorldLooks.hairpinGrip);
    });

    test('the rider screen shows the time and weather rows with free roam only', () => {
        const box = GameModes.control(document, { debug: true });
        const rows = [...box.querySelectorAll('.game-time-row, .game-weather-row')];
        expect(rows.length).toBe(2);
        expect(rows.every(r => r.hidden)).toBe(true);
        box.querySelector('[data-game-mode="roam"]').click();
        expect(rows.every(r => !r.hidden)).toBe(true);
        box.querySelector('[data-game-time="night"]').click();
        box.querySelector('[data-game-weather="fog"]').click();
        expect([GameModes.time, GameModes.weather]).toEqual(['night', 'fog']);
        GameModes.chosen = 'trial';
        GameModes.time = GameModes.weather = 'stage';
    });
});
