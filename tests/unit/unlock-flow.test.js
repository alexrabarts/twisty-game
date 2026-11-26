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
// The catalogue's rules are the statics at the end of the file (the bike a rider rides, its physics, the card's stars:
// the rider card shows Vehicle.statsOf); they need the class's name and nothing of the class itself
const rulesSource = `class Vehicle {}\nVehicle.BIKES = {};\n${vehicleSource.slice(vehicleSource.indexOf('const knownBike ='))}`;
(0, eval)(`${read('modals.js')}\n${charactersSource}\n${rulesSource}\n${read('tours.js')}\nglobalThis.TourSystem = TourSystem; globalThis.CHARACTERS = CHARACTERS; globalThis.BIKE_MODELS = BIKE_MODELS;`);

describe('unlock detection', () => {
    let tour;

    beforeEach(() => {
        localStorage.clear();
        document.body.innerHTML = '';
        tour = new TourSystem();
    });

    afterEach(() => Modals.reset());

    test('the first leg unlocks the next leg and Lucy, and routes to the rider screen', () => {
        const unlocks = tour.markLegCompleted('mountain-dawn');
        expect(unlocks.newLegs).toEqual(['Valley Run']);
        expect(unlocks.legs.map(l => l.id)).toEqual(['valley-run']);
        expect(unlocks.characters.map(c => c.id)).toEqual(['lucy']);
        expect(TourSystem.finishFlow(unlocks, false)).toEqual({ primary: 'choose-rider', riders: ['lucy'] });
    });

    test('a leg that opens no rider keeps the tour going', () => {
        tour.markLegCompleted('mountain-dawn');
        tour.markLegCompleted('valley-run');
        const unlocks = tour.markLegCompleted('coastal-descent');
        expect(unlocks.characters.map(c => c.id)).toEqual(['guy']);
        const leg4 = tour.markLegCompleted('foggy-gorge');
        expect(leg4.characters).toEqual([]);
        expect(TourSystem.finishFlow(leg4, false)).toEqual({ primary: 'next-leg', riders: [] });
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
        expect(tour.unlockProgressText()).toBe("1 more leg to unlock Lucy's Trail single");
        tour.markLegCompleted('mountain-dawn');
        expect(tour.unlockProgressText()).toBe("1 more leg to unlock Shane's Light naked single");
        tour.markLegCompleted('valley-run');
        expect(tour.unlockProgressText()).toBe("1 more leg to unlock Guy's Retro scrambler");
        tour.markLegCompleted('coastal-descent');
        expect(tour.unlockProgressText()).toBe("2 more legs to unlock Steve's Retro sports triple");
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
    test('Lucy comes right after Tim, and the rest by the power of their first bike', () => {
        localStorage.clear();
        const tour = new TourSystem();
        expect(tour.characterUnlocks).toEqual({ tim: 0, lucy: 1, shane: 2, guy: 3, steve: 5, alex: 7 });
        const order = tour.riderDisplayOrder().map(c => c.id);
        expect(order).toEqual(['tim', 'lucy', 'shane', 'guy', 'steve', 'alex']);
        // Each first bike after the scooter has more power than the one before it (`spare` x (kg + 80): about 1.75 x kW)
        const kw = id => { const m = BIKE_MODELS[CHARACTERS.find(c => c.id === id).bikes[0]]; return m.spare * (m.kg + 80) / 1.75; };
        for (let i = 2; i < order.length; i++) expect(kw(order[i])).toBeGreaterThan(kw(order[i - 1]));
        // Every rider opens within the ten legs of the tour, and no two at once
        const at = order.map(id => tour.characterUnlocks[id]);
        expect(Math.max(...at)).toBeLessThanOrEqual(10);
        expect(new Set(at).size).toBe(at.length);
    });
});

describe('the bike picker', () => {
    let tour;
    const done = ['mountain-dawn', 'valley-run', 'coastal-descent', 'foggy-gorge', 'high-pass', 'storm-valley'];

    beforeEach(() => {
        localStorage.clear();
        document.body.innerHTML = '';
        localStorage.setItem('twistyProgress', JSON.stringify({ completedLegs: done }));
        // Guy and Tim with every bike of theirs open: the picker's own tests (the unlock rule has its own, below)
        localStorage.setItem('twistyBikeUnlocks', JSON.stringify({ guy: 4, tim: 2 }));
        tour = new TourSystem();
    });

    afterEach(() => Modals.reset());

    test('each rider starts on their first bike', () => {
        CHARACTERS.forEach(c => expect(tour.getSelectedBike(c.id)).toBe(c.bikes[0]));
        expect(tour.getSelectedBike('tim')).toBe('bike14_forza');
    });

    test('steps the focused rider\'s bikes up and down with no wrap, shows each one and remembers the choice per rider', () => {
        const shown = [];
        tour.onBikeShowcase = id => shown.push([id, tour.getSelectedBike(id)]);
        tour.showRiderSelector('guy');
        const card = () => document.getElementById('riderInfoCard');
        const up = () => document.getElementById('bikePrevBtn'), down = () => document.getElementById('bikeNextBtn');
        expect(card().textContent).toContain('Retro scrambler twin (2017)');
        expect(card().textContent).toContain('1 / 4');
        // At the top of the list the up arrow is off, and up does nothing: the list does not wrap
        expect(up().disabled).toBe(true);
        expect(down().disabled).toBe(false);
        tour.moveBikeFocus(-1);
        expect(tour.getSelectedBike('guy')).toBe('bike04_scrambler');
        down().click();
        expect(tour.getSelectedBike('guy')).toBe('bike05_g310gs');
        expect(card().textContent).toContain('Small adventure single (2018)');
        expect(up().disabled).toBe(false);
        up().click();
        expect(tour.getSelectedBike('guy')).toBe('bike04_scrambler');
        down().click(); down().click(); down().click();
        expect(tour.getSelectedBike('guy')).toBe('bike12_tracer9gt');
        // At the bottom the down arrow is off, and down does nothing
        expect(down().disabled).toBe(true);
        tour.moveBikeFocus(1);
        expect(tour.getSelectedBike('guy')).toBe('bike12_tracer9gt');
        expect(shown.map(([, bike]) => bike)).toEqual(['bike05_g310gs', 'bike04_scrambler', 'bike05_g310gs', 'bike07_mt09_black', 'bike12_tracer9gt']);
        // The arrows stand one over the other
        expect(up().parentElement).toBe(down().parentElement);
        expect(up().parentElement.className).toBe('bike-arrows');
        // Kept for the next visit, and for Guy only
        expect(new TourSystem().getSelectedBike('guy')).toBe('bike12_tracer9gt');
        expect(new TourSystem().getSelectedBike('lucy')).toBe('bike15_crf250');
        // The keyboard steps it too: up from the last bike, and no further down
        document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowDown' }));
        expect(tour.getSelectedBike('guy')).toBe('bike12_tracer9gt');
        document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp' }));
        expect(tour.getSelectedBike('guy')).toBe('bike07_mt09_black');
    });

    test('the five bars are the rider on the bike in the row, and change as the row steps', () => {
        const guy = CHARACTERS.find(c => c.id === 'guy');
        tour.showRiderSelector('guy');
        // The lit squares of each bar of the card, in the card's order
        const shown = () => [...document.querySelectorAll('#riderInfoCard .showcase-stats .stat-bar')].map(bar => bar.querySelectorAll('i.on').length);
        const stars = bike => Object.values(TourSystem.statsOf(guy, bike));
        const seen = [];
        guy.bikes.forEach((bike, i) => {
            if (i > 0) document.getElementById('bikeNextBtn').click();
            expect(tour.getSelectedBike('guy')).toBe(bike);
            expect(shown()).toEqual(stars(bike));
            expect(shown().length).toBe(5);
            seen.push(shown().join(' '));
        });
        // The bikes of one rider do not all read the same
        expect(new Set(seen).size).toBeGreaterThan(1);
        document.getElementById('bikePrevBtn').click();
        expect(shown()).toEqual(stars(guy.bikes[guy.bikes.length - 2]));
        expect(Object.keys(TourSystem.statsOf(guy, guy.bikes[0]))).toEqual(['speed', 'accel', 'handling', 'jump', 'comfort']);
    });

    test('shows a rider with one bike without arrows, and names no maker', () => {
        // (every rider has two bikes or more now: Tim with his scooter alone stands for a rider with one)
        const tim = CHARACTERS.find(c => c.id === 'tim'), bikes = tim.bikes;
        tim.bikes = ['bike14_forza'];
        try {
            tour.showRiderSelector('tim');
            expect(document.getElementById('bikeNextBtn')).toBeNull();
            expect(document.getElementById('bikeName').textContent).toBe('Sports scooter, blue and silver (2019)');
        } finally {
            tim.bikes = bikes;
        }
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

    test('a saved choice of a bike the catalogue no longer has falls back to the rider\'s first, with no error', () => {
        // Tim's scooter was `bike14_tmax` until it was remodelled from his photo
        localStorage.setItem('twistyBikes', JSON.stringify({ tim: 'bike14_tmax' }));
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const error = jest.spyOn(console, 'error').mockImplementation(() => {});
        const later = new TourSystem();
        expect(later.getSelectedBike('tim')).toBe('bike14_forza');
        expect(BIKE_MODELS.bike14_tmax).toBeUndefined();
        expect(() => later.showRiderSelector('tim')).not.toThrow();
        expect(document.getElementById('bikeName').textContent).toContain('Sports scooter, blue and silver (2019)');
        // Choosing again writes the id the catalogue has
        later.selectBike('tim', 'bike06_z750');
        later.selectBike('tim', 'bike14_forza');
        expect(JSON.parse(localStorage.getItem('twistyBikes'))).toEqual({ tim: 'bike14_forza' });
        expect(warn).not.toHaveBeenCalled();
        expect(error).not.toHaveBeenCalled();
        warn.mockRestore();
        error.mockRestore();
    });

    test('each rider starts in their first outfit, and a chosen one is remembered per rider', () => {
        CHARACTERS.forEach(c => expect(tour.getSelectedOutfit(c.id)).toBe(c.outfits[0].id));
        expect(tour.getSelectedOutfit('nobody')).toBeNull();
        tour.selectOutfit('guy', 'tan-waxed');
        expect(tour.getSelectedOutfit('guy')).toBe('tan-waxed');
        expect(JSON.parse(localStorage.getItem('twistyOutfits'))).toEqual({ guy: 'tan-waxed' });
        // Kept for the next visit, and for Guy only
        expect(new TourSystem().getSelectedOutfit('guy')).toBe('tan-waxed');
        expect(new TourSystem().getSelectedOutfit('shane')).toBe('blue-orange');
        // An outfit the rider does not have changes nothing
        tour.selectOutfit('guy', 'blue-orange');
        tour.selectOutfit('nobody', 'tan-waxed');
        expect(tour.getSelectedOutfit('guy')).toBe('tan-waxed');
        expect(JSON.parse(localStorage.getItem('twistyOutfits'))).toEqual({ guy: 'tan-waxed' });
        // The bike choice is its own store
        expect(localStorage.getItem('twistyBikes')).toBeNull();
    });

    test('ignores a saved outfit the rider does not have, and a store it cannot read', () => {
        localStorage.setItem('twistyOutfits', JSON.stringify({ guy: 'blue-orange' }));
        expect(new TourSystem().getSelectedOutfit('guy')).toBe('black-mesh');
        localStorage.setItem('twistyOutfits', '{not json');
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        expect(new TourSystem().getSelectedOutfit('guy')).toBe('black-mesh');
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('saved outfit choices could not be read'), expect.anything());
        warn.mockRestore();
    });

    test('debug mode opens every rider and every leg, and saves none of it as progress', () => {
        localStorage.clear();
        const open = new TourSystem({ unlockAll: true });
        expect(CHARACTERS.every(c => open.isCharacterUnlocked(c.id))).toBe(true);
        expect(open.legs.every((leg, i) => open.isLegUnlocked(i))).toBe(true);
        expect(CHARACTERS.every(c => open.riderTierFor(c.id) === 'lit') && open.legs.every((leg, i) => open.legTierFor(i) === 'lit')).toBe(true);
        expect(open.completedLegs).toEqual([]);
        // A leg finished in debug mode unlocks nothing new: all of it was open
        expect(open.markLegCompleted('mountain-dawn').characters).toEqual([]);
        const plain = new TourSystem();
        expect(plain.isCharacterUnlocked('steve')).toBe(false);
        expect(plain.isLegUnlocked(plain.legs.length - 1)).toBe(false);
    });
});

describe('a rider\'s bikes open one by one, and the outfit row', () => {
    const done = ['mountain-dawn', 'valley-run', 'coastal-descent', 'foggy-gorge', 'high-pass', 'storm-valley'];
    beforeEach(() => {
        localStorage.clear();
        document.body.innerHTML = '';
        localStorage.setItem('twistyProgress', JSON.stringify({ completedLegs: done }));
    });
    afterEach(() => Modals.reset());

    test('every rider starts with their first bike only, the least powerful, and the picker stops there', () => {
        const tour = new TourSystem();
        for (const c of CHARACTERS) {
            expect(tour.openBikes(c.id)).toEqual([c.bikes[0]]);
            expect(tour.isBikeUnlocked(c.id, c.bikes[1])).toBe(false);
        }
        tour.showRiderSelector('guy');
        expect(document.getElementById('riderInfoCard').textContent).toContain('1 / 4');
        expect(document.getElementById('bikeLockHint').textContent).toContain('Finish a ride on this bike to open the next');
        expect(document.getElementById('bikeNextBtn').disabled).toBe(true);
        tour.moveBikeFocus(1);
        expect(tour.getSelectedBike('guy')).toBe('bike04_scrambler');
        // A locked bike cannot be chosen, and a saved choice of one falls back to the first
        tour.selectBike('guy', 'bike12_tracer9gt');
        expect(tour.getSelectedBike('guy')).toBe('bike04_scrambler');
        localStorage.setItem('twistyBikes', JSON.stringify({ guy: 'bike12_tracer9gt' }));
        expect(new TourSystem().getSelectedBike('guy')).toBe('bike04_scrambler');
    });

    test('a ride finished on the best open bike opens the next one, for that rider only, and it is kept', () => {
        const tour = new TourSystem();
        const guy = CHARACTERS.find(c => c.id === 'guy');
        const opened = tour.markRideFinished('guy', guy.bikes[0]);
        expect(opened).toMatchObject({ id: guy.bikes[1], rider: 'Guy', paint: BIKE_MODELS[guy.bikes[1]].paint });
        expect(opened.title).toBe(TourSystem.bikeTitle(guy.bikes[1]));
        expect(tour.openBikes('guy')).toEqual(guy.bikes.slice(0, 2));
        expect(tour.openBikes('lucy')).toHaveLength(1);
        // Another ride on the first bike opens nothing: the next comes from the best one open
        expect(tour.markRideFinished('guy', guy.bikes[0])).toBeNull();
        expect(tour.openBikes('guy')).toHaveLength(2);
        expect(tour.markRideFinished('guy', guy.bikes[1]).id).toBe(guy.bikes[2]);
        expect(tour.markRideFinished('guy', guy.bikes[2]).id).toBe(guy.bikes[3]);
        // All open: nothing more, and a new visit has them
        expect(tour.markRideFinished('guy', guy.bikes[3])).toBeNull();
        const later = new TourSystem();
        expect(later.openBikes('guy')).toEqual(guy.bikes);
        later.selectBike('guy', guy.bikes[3]);
        expect(later.getSelectedBike('guy')).toBe(guy.bikes[3]);
        later.showRiderSelector('guy');
        expect(document.getElementById('bikeLockHint')).toBeNull();
        // A bike of another rider, or a rider that is not one, opens nothing
        expect(later.markRideFinished('lucy', guy.bikes[0])).toBeNull();
        expect(later.markRideFinished('nobody', 'bike01_z650')).toBeNull();
    });

    test('debug mode opens every bike and saves nothing; a store it cannot read gives the first bike', () => {
        const debug = new TourSystem({ unlockAll: true });
        for (const c of CHARACTERS) expect(debug.openBikes(c.id)).toEqual(c.bikes);
        expect(debug.markRideFinished('guy', 'bike04_scrambler')).toBeNull();
        expect(localStorage.getItem('twistyBikeUnlocks')).toBeNull();
        localStorage.setItem('twistyBikeUnlocks', '{not json');
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        expect(new TourSystem().openBikes('guy')).toEqual(['bike04_scrambler']);
        localStorage.setItem('twistyBikeUnlocks', JSON.stringify({ guy: 99, lucy: 'x', tim: -3 }));
        const odd = new TourSystem();
        expect(odd.openBikes('guy')).toHaveLength(4);
        expect(odd.openBikes('lucy')).toHaveLength(1);
        expect(odd.openBikes('tim')).toHaveLength(1);
        warn.mockRestore();
    });

    test('the outfit row steps the rider\'s outfits with no wrap, by its arrows and by Q and E, and remembers', () => {
        const tour = new TourSystem();
        const shown = [];
        tour.onBikeShowcase = id => shown.push([id, tour.getSelectedOutfit(id)]);
        const guy = CHARACTERS.find(c => c.id === 'guy');
        tour.showRiderSelector('guy');
        const before = () => document.getElementById('outfitPrevBtn'), after = () => document.getElementById('outfitNextBtn');
        const name = () => document.getElementById('outfitName').textContent;
        expect(name()).toContain(guy.outfits[0].name);
        expect(name()).toContain(`OUTFIT 1 / ${guy.outfits.length}`);
        expect(before().disabled).toBe(true);
        tour.moveOutfitFocus(-1);
        expect(tour.getSelectedOutfit('guy')).toBe(guy.outfits[0].id);
        after().click();
        expect(tour.getSelectedOutfit('guy')).toBe(guy.outfits[1].id);
        expect(name()).toContain(guy.outfits[1].name);
        document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
        expect(tour.getSelectedOutfit('guy')).toBe(guy.outfits[2].id);
        document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ' }));
        expect(tour.getSelectedOutfit('guy')).toBe(guy.outfits[1].id);
        for (let i = 0; i < guy.outfits.length; i++) tour.moveOutfitFocus(1);
        expect(tour.getSelectedOutfit('guy')).toBe(guy.outfits[guy.outfits.length - 1].id);
        expect(after().disabled).toBe(true);
        // The stage is dressed again at each change, and the bike is not changed by it
        expect(shown.length).toBeGreaterThanOrEqual(4);
        expect(shown.every(([id]) => id === 'guy')).toBe(true);
        expect(tour.getSelectedBike('guy')).toBe(guy.bikes[0]);
        expect(new TourSystem().getSelectedOutfit('guy')).toBe(guy.outfits[guy.outfits.length - 1].id);
        // Its arrows stand side by side, in a row of their own under the bike row
        expect(before().parentElement.className).toBe('bike-arrows outfit-arrows');
        expect(document.querySelector('.outfit-picker').previousElementSibling.className).toBe('bike-picker');
        // Every rider has the row: each has two outfits or more
        for (const c of CHARACTERS) expect(c.outfits.length).toBeGreaterThanOrEqual(2);
    });
});
