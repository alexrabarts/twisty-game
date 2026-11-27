/**
 * One progression for the whole game: a finished leg of the world's tour counts toward the riders, each leg once. A
 * world finish records its leg in the store that opens the next one (WorldLegs), opens the rider's next bike, and its
 * card shows the UNLOCKED panel. Only a real finish counts. A save from before 2026-11-27 keeps what its old
 * procedural legs earned: its riders, and its finished old legs in the count.
 */

import { jest } from '@jest/globals';
import { readFileSync } from 'fs';

const read = name => readFileSync(new URL(`../../js/${name}`, import.meta.url), 'utf8');

const vehicleSource = read('vehicle.js');
const end = 'keepFileColours: true }));';
const charactersSource = vehicleSource.slice(0, vehicleSource.indexOf(end) + end.length);
const rulesSource = `class Vehicle {}\nVehicle.BIKES = {};\n${vehicleSource.slice(vehicleSource.indexOf('const knownBike ='))}`;
(0, eval)(`${read('modals.js')}\n${charactersSource}\n${rulesSource}\n${read('tours.js')}\n${read('world/tour.js')}\n${read('world/legs.js')}\nglobalThis.TourSystem = TourSystem; globalThis.CHARACTERS = CHARACTERS; globalThis.BIKE_MODELS = BIKE_MODELS; globalThis.WorldLegs = WorldLegs; globalThis.WorldTour = WorldTour;`);

// Game's own finish methods, run against a plain object (as tests/unit/restart.test.js does)
const main = read('main.js');
const classSource = main.slice(0, main.indexOf('Game.RESTART_CLEAR_SEGMENTS = 6;') + 'Game.RESTART_CLEAR_SEGMENTS = 6;'.length);
const Game = new Function('showCallout', `${classSource}\nreturn Game;`)(() => {});

// The first two built legs of the tour, in ride order
const [leg1, leg2] = WorldTour.built();
// The old procedural legs a save from before 2026-11-27 can hold in twistyProgress `completedLegs`
const OLD = ['mountain-dawn', 'valley-run', 'coastal-descent', 'foggy-gorge', 'high-pass', 'storm-valley'];

const fresh = () => {
    localStorage.clear();
    document.body.innerHTML = '';
    WorldLegs.cached = null;
    return new TourSystem();
};

afterEach(() => Modals.reset());

describe('a finished leg of the tour counts toward the riders', () => {
    test('a player who rides only the tour opens Lucy with leg 1, and leg 2 with it', () => {
        const tour = fresh();
        expect(tour.isCharacterUnlocked('lucy')).toBe(false);
        const unlocks = tour.markWorldLegFinished(leg1.id);
        expect(unlocks.characters.map(c => c.id)).toEqual(['lucy']);
        expect(unlocks.legs.map(l => l.id)).toEqual([leg2.id]);
        expect(unlocks.legs[0]).toMatchObject({ name: leg2.name, description: leg2.note });
        expect(tour.isCharacterUnlocked('lucy')).toBe(true);
        expect(tour.isRiderFresh('lucy')).toBe(true);
        // In the store that opens the next leg, so the menu and the riders agree
        expect(WorldLegs.finished()).toEqual([leg1.id]);
        expect(WorldLegs.isOpen(leg2.id)).toBe(true);
        // Kept for the next visit
        expect(new TourSystem().isCharacterUnlocked('lucy')).toBe(true);
    });

    test('the thresholds open the riders in order on the tour\'s legs alone: Tim, Lucy, Shane, Guy, Steve, Alex', () => {
        const tour = fresh();
        const ids = WorldTour.built().map(l => l.id);
        expect(ids.length).toBeGreaterThanOrEqual(7);
        const opened = ids.slice(0, 7).map(id => tour.markWorldLegFinished(id).characters.map(c => c.id).join(','));
        expect(opened).toEqual(['lucy', 'shane', 'guy', '', 'steve', '', 'alex']);
        expect(tour.legsFinished()).toBe(7);
        expect(TourSystem.RIDER_UNLOCKS).toEqual({ tim: 0, lucy: 1, shane: 2, guy: 3, steve: 5, alex: 7 });
    });

    test('a leg finished again counts nothing more', () => {
        const tour = fresh();
        tour.markWorldLegFinished(leg1.id);
        tour.markWorldLegFinished(leg2.id);
        expect(tour.legsFinished()).toBe(2);
        expect(tour.isCharacterUnlocked('shane')).toBe(true);
        expect(tour.markWorldLegFinished(leg1.id).characters).toEqual([]);
        expect(tour.legsFinished()).toBe(2);
        expect(tour.isCharacterUnlocked('guy')).toBe(false);
        expect(tour.unlockProgressText()).toBe("1 more leg to unlock Guy's Retro scrambler");
    });

    test('the menu\'s locked rider reads the count', () => {
        const tour = fresh();
        tour.markWorldLegFinished(leg1.id);
        tour.createMenu(document.body, () => {});
        while (tour.riderDisplayOrder()[tour.riderFocusIndex].id !== 'shane') document.getElementById('riderNextBtn').click();
        expect(document.getElementById('riderInfoCard').textContent).toContain('Finish 1 more leg to unlock (1/2 legs finished)');
    });

    test('nothing finishes an old procedural leg any more', () => {
        const tour = fresh();
        expect(tour.markLegCompleted).toBeUndefined();
        expect(tour.legs).toBeUndefined();
    });

    test('debug mode opens everything and saves nothing', () => {
        localStorage.clear();
        WorldLegs.cached = null;
        const debug = new TourSystem({ unlockAll: true });
        expect(debug.markWorldLegFinished(leg1.id)).toMatchObject({ characters: [], legs: [] });
        expect(localStorage.getItem(WorldLegs.STORE)).toBeNull();
        expect(localStorage.getItem('twistyProgress')).toBeNull();
    });
});

describe('migration', () => {
    test('a save from before keeps every rider the old thresholds gave it, and none locks again', () => {
        localStorage.clear();
        WorldLegs.cached = null;
        // Six old legs opened Steve under the old table (6); the new one asks seven
        localStorage.setItem('twistyProgress', JSON.stringify({ completedLegs: OLD }));
        const tour = new TourSystem();
        expect(CHARACTERS.every(c => tour.isCharacterUnlocked(c.id))).toBe(true);
        // The earned riders are written with the next finish and read back from then on
        tour.markWorldLegFinished(leg1.id);
        expect(JSON.parse(localStorage.getItem('twistyProgress')).riders.sort()).toEqual(CHARACTERS.map(c => c.id).sort());
        expect(CHARACTERS.every(c => new TourSystem().isCharacterUnlocked(c.id))).toBe(true);
    });

    test('a saved old leg still counts toward the new thresholds, and is kept with the next save', () => {
        localStorage.clear();
        WorldLegs.cached = null;
        localStorage.setItem('twistyProgress', JSON.stringify({ completedLegs: ['mountain-dawn'] }));
        const tour = new TourSystem();
        // Lucy needed three old legs before; one is enough now
        expect(tour.isCharacterUnlocked('lucy')).toBe(true);
        expect(tour.isCharacterUnlocked('shane')).toBe(false);
        expect(tour.markWorldLegFinished(leg1.id).characters.map(c => c.id)).toEqual(['shane']);
        expect(tour.legsFinished()).toBe(2);
        expect(JSON.parse(localStorage.getItem('twistyProgress')).completedLegs).toEqual(['mountain-dawn']);
        expect(new TourSystem().legsFinished()).toBe(2);
    });

    test('an old leg and a tour leg of the same save each count once', () => {
        localStorage.clear();
        WorldLegs.cached = null;
        localStorage.setItem('twistyProgress', JSON.stringify({ completedLegs: ['mountain-dawn', 'mountain-dawn', 'valley-run'], riders: ['tim', 'shane'] }));
        const tour = new TourSystem();
        tour.markWorldLegFinished(leg1.id);
        expect(tour.legsFinished()).toBe(3);
        expect(tour.isCharacterUnlocked('guy')).toBe(true);
    });

    test('an earned rider stays open when the count it was earned by is gone', () => {
        localStorage.clear();
        WorldLegs.cached = null;
        localStorage.setItem('twistyProgress', JSON.stringify({ completedLegs: [], riders: ['tim', 'guy'] }));
        const tour = new TourSystem();
        expect(tour.isCharacterUnlocked('guy')).toBe(true);
        expect(tour.isCharacterUnlocked('lucy')).toBe(false);
    });
});

describe('a world finish records the leg and the bike, and its card shows them', () => {
    beforeAll(() => {
        globalThis.RaceTiming = { formatTime: ms => `${ms} ms` };
        globalThis.HudRules = { number: n => String(n) };
        globalThis.UiIcons = { svg: name => `<i data-icon="${name}"></i>` };
    });
    afterAll(() => { for (const name of ['RaceTiming', 'HudRules', 'UiIcons']) delete globalThis[name]; });

    const worldGame = (tour, env = {}) => {
        const tim = CHARACTERS.find(c => c.id === 'tim');
        return Object.assign(Object.create(Game.prototype), {
            tourSystem: tour,
            environment: { isWorld: true, stage: { id: leg1.id, from: 0 }, submitAllowed: true, endS: 1000, ...env },
            selectedCharacter: tim,
            selectedBike: () => tour.getSelectedBike('tim'),
            freeRoam: false,
            rideTuned: false,
            restarts: 0,
            finishTime: 600000,
            worldRun: { lastS: 1000 },
            hud: null,
            input: null
        });
    };

    test('a trusted finish records the tour leg, opens Lucy and Tim\'s next bike, and the card shows the panel', () => {
        const tour = fresh();
        const game = worldGame(tour);
        game.worldUnlocks = game.recordWorldFinish();
        expect(WorldLegs.finished()).toEqual([leg1.id]);
        expect(tour.openBikes('tim')).toEqual(CHARACTERS.find(c => c.id === 'tim').bikes.slice(0, 2));
        expect(game.worldUnlocks.bikes.map(b => b.id)).toEqual([CHARACTERS.find(c => c.id === 'tim').bikes[1]]);
        game.showWorldFinish();
        const banner = document.getElementById('finishBanner');
        expect(banner.querySelector('.finish-title').textContent).toBe('STAGE COMPLETE');
        const panel = banner.querySelector('.unlock-panel');
        expect(panel).not.toBeNull();
        expect([...panel.querySelectorAll('.unlock-kind')].map(k => k.textContent)).toEqual(['NEW BIKE', 'NEW BIKE', 'NEW LEG']);
        expect(panel.textContent).toContain('Lucy');
        expect(panel.textContent).toContain(leg2.name);
        // A new rider is in hand, so no line says how far the next one is
        expect(banner.querySelector('.finish-progress')).toBeNull();
        // Its own buttons, as before
        expect([...banner.querySelectorAll('.finish-btn')].map(b => b.id)).toEqual(['restartLegBtn', 'returnToMenuBtn']);
    });

    test('a finish that opens no rider says how far the next one is', () => {
        const tour = fresh();
        tour.markWorldLegFinished(leg1.id);
        const game = worldGame(tour, { stage: { id: leg2.id, from: 0 } });
        game.worldUnlocks = game.recordWorldFinish();
        expect(game.worldUnlocks.characters.map(c => c.id)).toEqual(['shane']);
        tour.markWorldLegFinished(WorldTour.built()[2].id);
        game.worldUnlocks = { legs: [], characters: [] };
        game.showWorldFinish();
        expect(document.querySelector('#finishBanner .unlock-panel')).toBeNull();
        // (three legs finished: Guy is open, and Steve wants five)
        expect(document.querySelector('#finishBanner .finish-progress').textContent).toContain("2 more legs to unlock Steve's Retro sports triple");
    });

    test.each([
        ['skipped or flown (the world is no longer trusted)', { env: { submitAllowed: false } }],
        ['tuned', { rideTuned: true }],
        ['in free roam', { freeRoam: true }]
    ])('a ride %s unlocks nothing and records no leg', (why, { env, ...flags }) => {
        const tour = fresh();
        const game = Object.assign(worldGame(tour, env), flags);
        expect(game.progressCounts()).toBe(false);
        expect(game.recordWorldFinish()).toBeNull();
        expect(WorldLegs.finished()).toEqual([]);
        expect(tour.isCharacterUnlocked('lucy')).toBe(false);
        expect(tour.openBikes('tim')).toHaveLength(1);
        game.worldUnlocks = null;
        game.showWorldFinish();
        expect(document.querySelector('#finishBanner .unlock-panel')).toBeNull();
    });

    test('finishRun records a world finish once, through recordWorldFinish', () => {
        const tour = fresh();
        const game = worldGame(tour);
        game.vehicle = {};
        game.raceElapsed = () => 600000;
        game.startStopScene = () => false;
        game.showFinishScreen = jest.fn();
        game.finishRun();
        expect(WorldLegs.finished()).toEqual([leg1.id]);
        expect(game.worldUnlocks.characters.map(c => c.id)).toEqual(['lucy']);
        expect(game.showFinishScreen).toHaveBeenCalledTimes(1);
    });
});
