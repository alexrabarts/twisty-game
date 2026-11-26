// A world's tile data that stops coming during a ride (a failed fetch, a server gone, a network that drops). Held here:
//   - a failed fetch is tried again after each wait of WorldStreamer.FETCH_RETRY_MS, never sooner, then the tile is lost
//   - data that comes back on a later try is used, and the tile is no longer counted as failed
//   - WorldStreamer.landState: the land near the bike is `missing` after a failed fetch or NOTE_AFTER_MS of waiting,
//     `under` while the bike's own tile has none, `lost` once a near tile has failed every try
//   - Game.watchLand: the call-out is up while land is missing and goes when it comes; the bike is held while its own
//     tile is missing; lost land hands the ride over to the legs with RideMode.LAND_LOST_NOTE
// The browser probe world-toggle-ride --drop-after (tools/terrain-check.mjs) rides it on the real slice.
import { describe, test, expect, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { loadGame, loadScript } from '../helpers/load-game.js';
import { samplesOf, straight, fakeData, allTiles } from '../helpers/world-synthetic.js';

const game = loadGame();
const { WorldRoute, WorldStreamer, WorldData } = game;
const { RideMode } = new Function(`${loadScript('ridemode.js')}\nreturn { RideMode };`)();

const route = new WorldRoute(samplesOf(straight(400)), {});
const tiles = allTiles(-3, 3, -3, 3);
const flush = () => new Promise(done => setTimeout(done, 0));

// A streamer whose data fails while `down` is true; `asked` counts the fetches of each tile
function failing() {
    let clock = 0;
    const data = fakeData({ tiles, resident: false });
    const ensure = data.ensureTile.bind(data);
    const state = { down: true, asked: new Map() };
    data.ensureTile = async key => {
        state.asked.set(key, (state.asked.get(key) || 0) + 1);
        await Promise.resolve();
        if (state.down) throw new TypeError('Failed to fetch');
        return ensure(key);
    };
    const hooks = { buildTile() {}, disposeTile() {}, buildRoad() {}, disposeRoad() {}, buildSide() {}, disposeSide() {} };
    const streamer = new WorldStreamer({ data, route, hooks, now: () => clock });
    const bike = { x: route.points[10].x, z: route.points[10].z };
    const own = `${Math.floor(bike.x / WorldData.TILE_M)},${Math.floor(bike.z / WorldData.TILE_M)}`;
    const step = async (ms = 0) => {
        clock += ms;
        streamer.update(bike, route.sArray[10]);
        await flush();
    };
    return { streamer, data, state, bike, own, step, clock: () => clock };
}

describe('a tile fetch that fails', () => {
    test('is tried again after each wait, never sooner, then the tile is lost', async () => {
        const { streamer, state, own, step } = failing();
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        await step();
        expect(state.asked.get(own)).toBe(1);
        let tries = 1;
        for (const wait of WorldStreamer.FETCH_RETRY_MS) {
            await step(wait - 1);
            expect(state.asked.get(own)).toBe(tries);
            await step(1);
            expect(state.asked.get(own)).toBe(++tries);
        }
        expect(streamer.failed.get(own).lost).toBe(true);
        await step(60000);
        expect(state.asked.get(own)).toBe(WorldStreamer.FETCH_RETRY_MS.length + 1);
        // About 20 s in all
        const total = WorldStreamer.FETCH_RETRY_MS.reduce((a, b) => a + b, 0);
        expect(total).toBeGreaterThanOrEqual(15000);
        expect(total).toBeLessThanOrEqual(25000);
        warn.mockRestore();
    });

    test('data that comes back on a later try is used', async () => {
        const { streamer, data, state, own, step, bike } = failing();
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        await step();
        await step(WorldStreamer.FETCH_RETRY_MS[0]);
        expect(data.tile(own)).toBe(null);
        state.down = false;
        await step(WorldStreamer.FETCH_RETRY_MS[1]);
        expect(data.tile(own)).not.toBe(null);
        expect(streamer.failed.has(own)).toBe(false);
        expect(streamer.landState(bike)).toMatchObject({ missing: false, under: false, lost: false });
        warn.mockRestore();
    });
});

describe('the land round the bike', () => {
    test('a tile still on its way is missing only after NOTE_AFTER_MS', async () => {
        let clock = 0;
        const data = fakeData({ tiles, resident: false });
        data.ensureTile = () => new Promise(() => {});
        const hooks = { buildTile() {}, disposeTile() {}, buildRoad() {}, disposeRoad() {}, buildSide() {}, disposeSide() {} };
        const streamer = new WorldStreamer({ data, route, hooks, now: () => clock });
        const bike = { x: route.points[10].x, z: route.points[10].z };
        streamer.update(bike, route.sArray[10]);
        expect(streamer.landState(bike)).toMatchObject({ missing: false, under: true, lost: false });
        clock += WorldStreamer.NOTE_AFTER_MS;
        expect(streamer.landState(bike)).toMatchObject({ missing: true, under: true, lost: false });
    });

    test('a failed fetch tells at once, and a lost tile says so', async () => {
        const { streamer, bike, step } = failing();
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        await step();
        expect(streamer.landState(bike)).toMatchObject({ missing: true, under: true, lost: false });
        for (const wait of WorldStreamer.FETCH_RETRY_MS) await step(wait);
        expect(streamer.landState(bike).lost).toBe(true);
        warn.mockRestore();
    });

    test('a tile the world has no data for is not missing land', () => {
        const data = fakeData({ tiles: [[0, 0]], resident: true });
        data.manifest.tiles.height = [[0, 0]];
        const hooks = { buildTile() {}, disposeTile() {}, buildRoad() {}, disposeRoad() {}, buildSide() {}, disposeSide() {} };
        const streamer = new WorldStreamer({ data, route, hooks, now: () => 0 });
        expect(streamer.landState({ x: 256, z: 256 })).toMatchObject({ missing: false, under: false, lost: false });
        expect(streamer.landState({ x: -256, z: -256 })).toMatchObject({ missing: false, under: false, lost: false });
    });
});

describe('Game.watchLand', () => {
    const source = readFileSync(new URL('../../js/main.js', import.meta.url), 'utf8');
    const classSource = source.slice(0, source.indexOf('\n}\n', source.indexOf('class Game {')) + 3);
    const Game = new Function('RideMode', 'showCallout', `${classSource}\nreturn Game;`)(RideMode, () => {});
    Game.LAND_NOTE = source.match(/^Game\.LAND_NOTE = '([^']+)';$/m)[1];
    Game.LAND_NOTE_MS = 600000;

    // A HUD whose call-outs are plain objects with the DOM's few fields
    function hud() {
        const shown = [];
        return {
            shown,
            callout(text, tone, ms) {
                const item = { text, tone, ms, isConnected: true, classList: { list: new Set(), contains(c) { return this.list.has(c); }, add(c) { this.list.add(c); } } };
                shown.push(item);
                return item;
            },
            dismiss(item) { item.classList.add('leaving'); item.isConnected = false; }
        };
    }

    function ride(state) {
        const made = Object.create(Game.prototype);
        made.hud = hud();
        made.vehicle = { position: { x: 0, z: 0 } };
        made.environment = { isWorld: true, streamer: { landState: (bike, time, out) => Object.assign(out, state) } };
        made.fallBackToLegs = jest.fn();
        return made;
    }

    test('the note is up while land is missing, once, and goes when it comes', () => {
        const state = { missing: true, under: false, lost: false };
        const made = ride(state);
        made.watchLand();
        made.watchLand();
        expect(made.hud.shown.map(c => [c.text, c.tone])).toEqual([[Game.LAND_NOTE, 'warn']]);
        expect(made.landHeld).toBe(false);
        state.missing = false;
        made.watchLand();
        expect(made.hud.shown[0].classList.contains('leaving')).toBe(true);
        expect(made.landNote).toBe(null);
    });

    test('the bike is held while its own tile has no data', () => {
        const state = { missing: false, under: true, lost: false };
        const made = ride(state);
        made.watchLand();
        expect(made.landHeld).toBe(true);
        expect(made.hud.shown.length).toBe(1);
        state.under = false;
        made.watchLand();
        expect(made.landHeld).toBe(false);
    });

    test('lost land hands the ride to the legs with its note, once', () => {
        jest.useFakeTimers();
        const made = ride({ missing: true, under: true, lost: true });
        made.watchLand();
        made.watchLand();
        expect(made.fallBackToLegs).not.toHaveBeenCalled();
        jest.runAllTimers();
        expect(made.fallBackToLegs).toHaveBeenCalledTimes(1);
        expect(made.fallBackToLegs.mock.calls[0][1]).toBe(RideMode.LAND_LOST_NOTE);
        jest.useRealTimers();
    });

    test('a finished ride is left alone', () => {
        const made = ride({ missing: true, under: true, lost: true });
        made.finished = true;
        made.watchLand();
        expect(made.landHeld).toBe(false);
        expect(made.hud.shown).toEqual([]);
    });
});

describe('a tile given up while far', () => {
    test('gets a new round of tries when it comes near', async () => {
        const { streamer, state, own, step, bike } = failing();
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        await step();
        for (const wait of WorldStreamer.FETCH_RETRY_MS) await step(wait);
        expect(streamer.failed.get(own).lost).toBe(true);
        const asked = state.asked.get(own);
        // Now near: tried again at once, and lost again only after every wait
        expect(streamer.landState(bike).lost).toBe(false);
        await step();
        expect(state.asked.get(own)).toBe(asked + 1);
        for (const wait of WorldStreamer.FETCH_RETRY_MS) await step(wait);
        expect(streamer.landState(bike).lost).toBe(true);
        warn.mockRestore();
    });
});
