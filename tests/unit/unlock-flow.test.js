/**
 * Unlock detection and the flow it drives: a newly unlocked bike sends the
 * player back to the rider screen with that bike focused and badged NEW;
 * a leg-only unlock keeps the normal next-leg flow.
 */

import { readFileSync } from 'fs';

const read = name => readFileSync(new URL(`../../js/${name}`, import.meta.url), 'utf8');

// CHARACTERS lives at the top of vehicle.js; take just that declaration
const vehicleSource = read('vehicle.js');
const charactersSource = vehicleSource.slice(0, vehicleSource.indexOf('];', vehicleSource.indexOf('const CHARACTERS')) + 2);
(0, eval)(`${charactersSource}\n${read('tours.js')}\nglobalThis.TourSystem = TourSystem; globalThis.CHARACTERS = CHARACTERS;`);

describe('unlock detection', () => {
    let tour;

    beforeEach(() => {
        localStorage.clear();
        document.body.innerHTML = '';
        tour = new TourSystem();
    });

    afterEach(() => {
        if (tour.keyboardHandler) document.removeEventListener('keydown', tour.keyboardHandler);
    });

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
        expect(tour.unlockProgressText()).toBe("2 more legs to unlock Shane's Dirt Bike");
        tour.markLegCompleted('mountain-dawn');
        expect(tour.unlockProgressText()).toBe("1 more leg to unlock Shane's Dirt Bike");
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
