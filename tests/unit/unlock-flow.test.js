/**
 * Unlock detection and the flow it drives: a newly unlocked bike sends the
 * player back to the rider screen with that bike focused and badged NEW;
 * a leg-only unlock keeps the normal next-leg flow.
 */

import { jest } from '@jest/globals';
import { readFileSync } from 'fs';

const read = name => readFileSync(new URL(`../../js/${name}`, import.meta.url), 'utf8');

// CHARACTERS and the bike catalogue live at the top of vehicle.js; take just those declarations
const vehicleSource = read('vehicle.js');
const end = 'keepFileColours: true }));';
const charactersSource = vehicleSource.slice(0, vehicleSource.indexOf(end) + end.length);
(0, eval)(`${read('modals.js')}\n${charactersSource}\n${read('tours.js')}\nglobalThis.TourSystem = TourSystem; globalThis.CHARACTERS = CHARACTERS; globalThis.BIKE_MODELS = BIKE_MODELS;`);

describe('unlock detection', () => {
    let tour;

    beforeEach(() => {
        localStorage.clear();
        document.body.innerHTML = '';
        tour = new TourSystem();
    });

    afterEach(() => Modals.reset());

    test('the first leg unlocks the next leg only, so the tour carries on', () => {
        const unlocks = tour.markLegCompleted('mountain-dawn');
        expect(unlocks.newLegs).toEqual(['Valley Run']);
        expect(unlocks.legs.map(l => l.id)).toEqual(['valley-run']);
        expect(unlocks.characters).toEqual([]);
        expect(TourSystem.finishFlow(unlocks, false)).toEqual({ primary: 'next-leg', riders: [] });
    });

    test('the second completed leg unlocks a bike and routes to the rider screen', () => {
        tour.markLegCompleted('mountain-dawn');
        const unlocks = tour.markLegCompleted('valley-run');
        expect(unlocks.characters.map(c => c.id)).toEqual(['shane']);
        expect(unlocks.newCharacters).toEqual(['Shane']);
        expect(TourSystem.finishFlow(unlocks, false)).toEqual({ primary: 'choose-rider', riders: ['shane'] });
        expect(tour.isRiderFresh('shane')).toBe(true);
    });

    test('a bike unlock on the last leg still routes to the rider screen', () => {
        const unlocks = { characters: [{ id: 'steve' }] };
        expect(TourSystem.finishFlow(unlocks, true).primary).toBe('choose-rider');
        expect(TourSystem.finishFlow({ characters: [] }, true).primary).toBe('restart-tour');
    });

    test('a repeat completion unlocks nothing', () => {
        tour.markLegCompleted('mountain-dawn');
        const again = tour.markLegCompleted('mountain-dawn');
        expect(again.legs).toEqual([]);
        expect(again.characters).toEqual([]);
        expect(TourSystem.finishFlow(again, false).primary).toBe('next-leg');
    });

    test('progress names the next bike and the legs still needed', () => {
        expect(tour.unlockProgressText()).toBe("2 more legs to unlock Shane's Light naked single");
        tour.markLegCompleted('mountain-dawn');
        expect(tour.unlockProgressText()).toBe("1 more leg to unlock Shane's Light naked single");
    });

    test('the rider screen opens on the new bike, badged NEW, ready to choose', () => {
        tour.markLegCompleted('mountain-dawn');
        tour.markLegCompleted('valley-run');
        tour.showRiderSelector('shane');

        expect(tour.menuScreen).toBe('rider');
        expect(document.querySelector('.character-select-screen').style.display).toBe('flex');
        const card = document.getElementById('riderInfoCard');
        expect(card.textContent).toContain('Shane');
        expect(card.querySelector('.new-badge')).not.toBeNull();
        expect(document.getElementById('riderContinueBtn').disabled).toBe(false);

        // Choosing it selects the bike and clears the NEW badge
        document.getElementById('riderContinueBtn').click();
        expect(tour.selectedCharacterId).toBe('shane');
        expect(tour.isRiderFresh('shane')).toBe(false);
        expect(tour.menuScreen).toBe('track');
    });

    test('the leg screen shows how far the next bike is', () => {
        tour.markLegCompleted('mountain-dawn');
        tour.showLegSelector();
        expect(document.getElementById('legInfoCard').textContent).toContain('1 more leg to unlock Shane');
    });
});

describe('the riders\' unlock order', () => {
    test('Guy unlocks after Lucy and before Alex', () => {
        localStorage.clear();
        const tour = new TourSystem();
        expect(tour.riderDisplayOrder().map(c => c.id)).toEqual(['tim', 'shane', 'lucy', 'guy', 'alex', 'steve']);
        expect(tour.characterUnlocks.guy).toBeGreaterThan(tour.characterUnlocks.lucy);
    });
});

describe('the bike picker', () => {
    let tour;
    const done = ['mountain-dawn', 'valley-run', 'coastal-descent', 'foggy-gorge', 'high-pass', 'storm-valley'];

    beforeEach(() => {
        localStorage.clear();
        document.body.innerHTML = '';
        localStorage.setItem('twistyProgress', JSON.stringify({ completedLegs: done }));
        tour = new TourSystem();
    });

    afterEach(() => Modals.reset());

    test('each rider starts on their first bike', () => {
        CHARACTERS.forEach(c => expect(tour.getSelectedBike(c.id)).toBe(c.bikes[0]));
        expect(tour.getSelectedBike('tim')).toBe('bike14_tmax');
    });

    test('cycles the focused rider\'s bikes, shows each one and remembers the choice per rider', () => {
        const shown = [];
        tour.onBikeShowcase = id => shown.push([id, tour.getSelectedBike(id)]);
        tour.showRiderSelector('guy');
        const card = () => document.getElementById('riderInfoCard');
        expect(card().textContent).toContain('Retro scrambler twin (2017)');
        expect(card().textContent).toContain('1 / 5');
        document.getElementById('bikeNextBtn').click();
        expect(tour.getSelectedBike('guy')).toBe('bike05_g310gs');
        expect(card().textContent).toContain('Small adventure single (2018)');
        document.getElementById('bikePrevBtn').click();
        document.getElementById('bikePrevBtn').click();
        expect(tour.getSelectedBike('guy')).toBe('bike12_tracer9gt');
        expect(shown).toEqual([['guy', 'bike05_g310gs'], ['guy', 'bike04_scrambler'], ['guy', 'bike12_tracer9gt']]);
        // Kept for the next visit, and for Guy only
        expect(new TourSystem().getSelectedBike('guy')).toBe('bike12_tracer9gt');
        expect(new TourSystem().getSelectedBike('lucy')).toBe('bike01_z650');
        // The keyboard cycles it too
        document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowDown' }));
        expect(tour.getSelectedBike('guy')).toBe('bike04_scrambler');
    });

    test('shows a rider with one bike without arrows, and names no maker', () => {
        tour.showRiderSelector('tim');
        expect(document.getElementById('bikeNextBtn')).toBeNull();
        expect(document.getElementById('bikeName').textContent).toBe('Maxi scooter, dark grey (2022)');
    });

    test('ignores a saved bike the rider does not own, and a store it cannot read', () => {
        localStorage.setItem('twistyBikes', JSON.stringify({ guy: 'bike13_panigale' }));
        expect(new TourSystem().getSelectedBike('guy')).toBe('bike04_scrambler');
        localStorage.setItem('twistyBikes', '{not json');
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        expect(new TourSystem().getSelectedBike('guy')).toBe('bike04_scrambler');
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('saved bike choices could not be read'), expect.anything());
        warn.mockRestore();
    });
});
