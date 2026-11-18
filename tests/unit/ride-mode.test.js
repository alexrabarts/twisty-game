/**
 * What the page rides (js/ridemode.js): a plain page opens the menu, and choosing a rider there starts the world (the
 * Tremola slice); Classic legs opens the leg screen; `?world=<id>` starts that world at once; `?legs` keeps the old
 * menu. A world whose data cannot load hands over to the legs with a note on the menu, not a broken screen.
 *
 * The menu is the real TourSystem in jsdom, the game's own methods are cut out of js/main.js, and the world that fails
 * is the real WorldEnvironment.load over a stubbed fetch.
 */
import { describe, test, expect, beforeAll, beforeEach, afterEach, jest } from '@jest/globals';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGame, gameMethods } from '../helpers/load-game.js';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = name => readFileSync(join(root, 'js', name), 'utf8');

// CHARACTERS and the bike catalogue live at the top of vehicle.js; take just those declarations
const vehicleSource = read('vehicle.js');
const end = 'keepFileColours: true }));';
const charactersSource = vehicleSource.slice(0, vehicleSource.indexOf(end) + end.length);
(0, eval)(`${read('modals.js')}\n${charactersSource}\n${read('tours.js')}\nglobalThis.TourSystem = TourSystem; globalThis.CHARACTERS = CHARACTERS;`);
const RideMode = new Function(`${read('ridemode.js')}\nreturn RideMode;`)();

const METHODS = ['openRide', 'chooseWorld', 'startWorld', 'fallBackToLegs'];
const flush = () => new Promise(done => setTimeout(done, 0));
const shown = selector => document.querySelector(selector) && document.querySelector(selector).style.display !== 'none';

// A game over the real menu: the leg and the world builders are spies, the world loader is `WorldEnvironment`
function makeGame(search, WorldEnvironment) {
    const self = {
        rideMode: RideMode.resolve(search),
        tourSystem: new TourSystem(),
        scene: {},
        environment: null,
        endMenuShowcase: jest.fn(),
        removeRunOverlays: jest.fn(),
        cleanupCurrentLeg: jest.fn(),
        initializeGameWithWorld: jest.fn(async () => {}),
        initializeGameWithLeg: jest.fn()
    };
    Object.assign(self, gameMethods(METHODS, self, { RideMode, WorldEnvironment }));
    return self;
}

describe('the mode a URL asks for', () => {
    test('a plain page opens the menu on the world', () => {
        expect(RideMode.resolve('')).toEqual({ kind: 'world', world: 'tremola', direct: false });
        expect(RideMode.resolve('?fps=1')).toEqual({ kind: 'world', world: 'tremola', direct: false });
    });

    test('?world=<id> starts that world at once, and ?legs keeps the classic menu', () => {
        expect(RideMode.resolve('?world=tremola')).toEqual({ kind: 'world', world: 'tremola', direct: true });
        expect(RideMode.resolve('?world=all&worldData=world/')).toEqual({ kind: 'world', world: 'all', direct: true });
        expect(RideMode.resolve('?legs')).toEqual({ kind: 'legs', world: null, direct: false });
        expect(RideMode.resolve('?legs=1&fps=1')).toEqual({ kind: 'legs', world: null, direct: false });
    });

    test('a fresh page for a world keeps the data folder it was read from', () => {
        expect(RideMode.worldUrl({ pathname: '/twisty/', search: '?worldData=tests/fixtures/world/mini' }, 'all')).toBe('/twisty/?world=all&worldData=tests%2Ffixtures%2Fworld%2Fmini');
        expect(RideMode.worldUrl({ pathname: '/', search: '?legs' }, 'tremola')).toBe('/?world=tremola');
    });

    test('no code but the resolver reads the world parameter of the URL', () => {
        const files = [];
        const walk = dir => readdirSync(dir).forEach(name => {
            const path = join(dir, name);
            if (statSync(path).isDirectory()) walk(path);
            else if (/\.(js|html)$/.test(name)) files.push(path);
        });
        walk(join(root, 'js'));
        files.push(join(root, 'index.html'));
        // A read of `world` itself: URLSearchParams get/has/getAll, a regex on `world=`, or the old per-file resolver
        const reads = /\.(get|has|getAll)\(\s*['"`]world['"`]\s*\)|\[\?&\]world=|WorldEnvironment\.requested/;
        const offenders = files
            .filter(path => relative(root, path) !== join('js', 'ridemode.js'))
            .flatMap(path => readFileSync(path, 'utf8').split('\n').map((line, n) => ({ path, n, line })))
            .filter(({ line }) => !/^\s*\/\//.test(line) && reads.test(line))
            .map(({ path, n, line }) => `${relative(root, path)}:${n + 1}: ${line.trim()}`);
        expect(offenders).toEqual([]);
        expect(read('ridemode.js')).toMatch(/get\('world'\)/);
    });
});

describe('the menu of a plain page', () => {
    beforeEach(() => {
        localStorage.clear();
        document.body.innerHTML = '';
    });
    afterEach(() => Modals.reset());

    test('choosing a rider starts the world with that rider', async () => {
        const environment = { isWorld: true };
        const WorldEnvironment = { load: jest.fn(async () => environment) };
        const game = makeGame('', WorldEnvironment);
        game.openRide();
        expect(shown('.character-select-screen')).toBe(true);
        document.getElementById('riderContinueBtn').click();
        await flush();
        expect(WorldEnvironment.load).toHaveBeenCalledWith(game.scene, expect.objectContaining({ id: 'tremola' }));
        expect(game.initializeGameWithWorld).toHaveBeenCalledWith(environment);
        expect(game.initializeGameWithLeg).not.toHaveBeenCalled();
        expect(game.tourSystem.selectedCharacterId).toBe(game.tourSystem.riderDisplayOrder()[game.tourSystem.riderFocusIndex].id);
        // The menu is put away for the ride
        expect(document.querySelector('.tour-selector-overlay').style.display).toBe('none');
        expect(document.getElementById('world-loading')).toBeNull();
    });

    test('Classic legs opens the leg screen, and its Start rides a leg', async () => {
        const WorldEnvironment = { load: jest.fn(async () => ({ isWorld: true })) };
        const game = makeGame('', WorldEnvironment);
        game.openRide();
        document.getElementById('riderClassicBtn').click();
        expect(game.tourSystem.menuScreen).toBe('track');
        expect(shown('.track-select-screen')).toBe(true);
        document.getElementById('legStartBtn').click();
        await flush();
        expect(game.initializeGameWithLeg).toHaveBeenCalledWith(expect.objectContaining({ id: 'mountain-dawn' }));
        expect(WorldEnvironment.load).not.toHaveBeenCalled();
    });

    test('the rider screen offers no leg board, the leg screen offers the leg\'s own', () => {
        const game = makeGame('', { load: jest.fn() });
        game.openRide();
        const riderScreen = document.querySelector('.character-select-screen');
        expect(riderScreen.querySelector('#legLeaderboardBtn')).toBeNull();
        expect(riderScreen.textContent).not.toMatch(/BEST TIMES/);
        expect(document.querySelector('.track-select-screen #legLeaderboardBtn')).not.toBeNull();
    });

    test('?legs keeps the old menu: the rider goes on to the leg screen', () => {
        const WorldEnvironment = { load: jest.fn() };
        const game = makeGame('?legs', WorldEnvironment);
        game.openRide();
        expect(document.getElementById('riderClassicBtn')).toBeNull();
        document.getElementById('riderContinueBtn').click();
        expect(game.tourSystem.menuScreen).toBe('track');
        expect(WorldEnvironment.load).not.toHaveBeenCalled();
    });

    test('?world=<id> starts that world without the menu', async () => {
        const WorldEnvironment = { load: jest.fn(async () => ({ isWorld: true })) };
        const game = makeGame('?world=tremola', WorldEnvironment);
        game.openRide();
        await flush();
        expect(document.querySelector('.tour-selector-overlay')).toBeNull();
        expect(WorldEnvironment.load).toHaveBeenCalledWith(game.scene, expect.objectContaining({ id: 'tremola' }));
    });
});

describe('a world that cannot load', () => {
    let world;
    const realFetch = globalThis.fetch;
    beforeAll(() => {
        world = loadGame();
    });
    beforeEach(() => {
        localStorage.clear();
        document.body.innerHTML = '';
    });
    afterEach(() => {
        Modals.reset();
        globalThis.fetch = realFetch;
    });

    const failures = {
        'the fetch fails': () => Promise.reject(new TypeError('Failed to fetch')),
        'the host answers 404': async () => ({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) }),
        'the data is not the world format': async () => ({ ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode('{"format":"nope"}').buffer })
    };

    test.each(Object.keys(failures))('%s: the leg screen opens with a note, and its Start rides a leg', async (name) => {
        globalThis.fetch = jest.fn(failures[name]);
        const game = makeGame('', world.WorldEnvironment);
        const error = jest.spyOn(console, 'error').mockImplementation(() => {});
        game.openRide();
        document.getElementById('riderContinueBtn').click();
        for (let i = 0; i < 20 && game.tourSystem.menuScreen !== 'track'; i++) await flush();
        error.mockRestore();

        expect(globalThis.fetch).toHaveBeenCalledWith('world/manifest.json');
        expect(game.initializeGameWithWorld).not.toHaveBeenCalled();
        // No loading screen left over, the leg screen up with the note on it
        expect(document.getElementById('world-loading')).toBeNull();
        expect(document.body.classList.contains('world-loading-on')).toBe(false);
        expect(game.tourSystem.menuScreen).toBe('track');
        expect(document.querySelector('.tour-selector-overlay').style.display).not.toBe('none');
        const note = document.querySelector('.tour-selector-overlay .menu-notice');
        expect(note && note.textContent).toBe(RideMode.FALLBACK_NOTE);
        expect(game.rideMode.kind).toBe('legs');

        document.getElementById('legStartBtn').click();
        expect(game.initializeGameWithLeg).toHaveBeenCalledWith(expect.objectContaining({ id: 'mountain-dawn' }));

        // Back on the rider screen the world is not offered again: the rider goes on to the legs
        document.getElementById('backToRidersBtn').click();
        expect(document.getElementById('riderClassicBtn')).toBeNull();
    });
});
