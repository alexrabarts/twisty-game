/**
 * @jest-environment jsdom
 */
// The menu's map of the tour (js/world/tourmap.js): every row of the tour has a line, a hit area and a pin; a closed
// leg cannot start; the arrow keys step the legs through the dialog stack; the climb, the best time and the relief.
import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { loadScript } from '../helpers/load-game.js';

const { WorldTour, WorldLegs, WorldMapData, WorldMap, Modals } = new Function(
    `${loadScript('modals.js')}\n${loadScript('world/tour.js')}\n${loadScript('world/legs.js')}\n${loadScript('world/tourmap-data.js')}\n${loadScript('world/tourmap.js')}\nreturn { WorldTour, WorldLegs, WorldMapData, WorldMap, Modals };`
)();

const store = (finished = [], best = null) => {
    const map = new Map([[WorldLegs.STORE, JSON.stringify(finished)]]);
    if (best) map.set(WorldMap.STORE, JSON.stringify(best));
    return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v), map };
};

const press = (code) => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true }));

describe('the map data', () => {
    test('every leg of the tour has a line of its own, starting where the leg before it ends (run tools/world/tourmap.mjs when a leg is built or its ends move)', () => {
        for (const leg of WorldTour.LEGS) {
            const line = WorldMapData.legs[leg.n];
            expect([leg.n, Array.isArray(line) && line.length >= 10]).toEqual([leg.n, true]);
            line.forEach(p => expect(p.every(Number.isFinite)).toBe(true));
            const before = WorldMapData.legs[leg.n === 1 ? 12 : leg.n - 1];
            const [ex, ez] = before[before.length - 1], [sx, sz] = line[0];
            // (they join within a few hundred metres: a stop's way in and out, a built leg beside a planned one)
            expect([leg.n, Math.hypot(ex - sx, ez - sz) < 600]).toEqual([leg.n, true]);
        }
    });

    test('the lines are as long as the table says, and the data stays small', () => {
        for (const leg of WorldTour.LEGS) {
            const km = WorldMap.length(WorldMapData.legs[leg.n]) / 1000;
            // A simplified line cuts the hairpins' corners: a little shorter, never longer
            expect([leg.n, km > leg.km * 0.85 && km < leg.km * 1.05]).toEqual([leg.n, true]);
        }
        expect(loadScript('world/tourmap-data.js').length).toBeLessThan(30 * 1024);
    });

    test('the places named are the passes and the towns of the loop, and nothing else', () => {
        expect(WorldMapData.places.map(p => p.name).sort()).toEqual(['Airolo', 'Andermatt', 'Furka', 'Gadmen', 'Gletsch', 'Gotthard', 'Grimsel', 'Guttannen', 'Hospental', 'Innertkirchen', 'Realp', 'Schöllenen', 'Susten', 'Tremola']);
        WorldMapData.places.forEach(p => expect(['n', 's', 'e', 'w']).toContain(p.side));
    });

    test('the climb counts only steps of 10 m, so noise is not climb', () => {
        expect(WorldMap.climb([[0, 0, 100], [0, 0, 104], [0, 0, 99], [0, 0, 130], [0, 0, 125], [0, 0, 90]])).toEqual({ up: 30, down: 40 });
        const one = WorldMap.climb(WorldMapData.legs[1]);
        // Airolo up the pass road: about 680 m up and nothing down
        expect(one.up).toBeGreaterThan(600);
        expect(one.down).toBeLessThan(30);
    });

    test('an earlier leg rides its tour leg\'s road the other way: the Tremola up is leg 12 reversed', () => {
        const tremola = WorldMap.lineOf(WorldLegs.find('tremola'));
        const twelve = WorldMapData.legs[12];
        expect(tremola[0]).toEqual(twelve[twelve.length - 1]);
        // (the 10 m step counts from the line's own start, so the two ways agree to a step or so)
        expect(Math.abs(WorldMap.climb(tremola).up - WorldMap.climb(twelve).down)).toBeLessThanOrEqual(WorldMap.CLIMB_STEP_M);
    });
});

describe('the entries', () => {
    test('each row of the list has its state from WorldLegs\' rule; each tour row with a line has a pin, apart from the others', () => {
        const entries = WorldMap.entries({ storage: store() });
        expect(entries.map(e => e.id)).toEqual(WorldLegs.LIST.map(l => l.id));
        for (const entry of entries) {
            const want = WorldLegs.find(entry.id).planned ? 'planned' : WorldLegs.isOpen(entry.id, { storage: store() }) ? 'open' : 'locked';
            expect([entry.id, entry.state]).toEqual([entry.id, want]);
            if (entry.n) expect([entry.id, !!entry.pin && !!entry.line]).toEqual([entry.id, true]);
        }
        const pins = entries.filter(e => e.pin).map(e => e.pin);
        for (let i = 0; i < pins.length; i++) {
            for (let j = i + 1; j < pins.length; j++) expect(Math.hypot(pins[i].x - pins[j].x, pins[i].z - pins[j].z)).toBeGreaterThan(900);
        }
    });

    test('a row added to the tour shows with no change to the map (its line by its number)', () => {
        const row = { n: 3, id: 'andermatt-wassen', planned: false, name: 'x', km: 9.9 };
        expect(WorldMap.lineOf(row)).toBe(WorldMapData.legs[3]);
    });

    test('the keys step in the list\'s order and stop at its ends', () => {
        const entries = WorldMap.entries({ storage: store() });
        expect(WorldMap.step(entries, entries[0].id, -1)).toBe(entries[0].id);
        expect(WorldMap.step(entries, entries[0].id, 1)).toBe(entries[1].id);
        const last = entries[entries.length - 1].id;
        expect(WorldMap.step(entries, last, 1)).toBe(last);
    });

    test('a point near a line finds its leg; one far from all finds none', () => {
        const entries = WorldMap.entries({ storage: store() });
        const [x, z] = WorldMapData.legs[5][10];
        expect(WorldMap.nearest(entries, x + 50, z, 300)).toBe(entries.find(e => e.n === 5).id);
        expect(WorldMap.nearest(entries, 30000, 30000, 300)).toBe(null);
    });

    test('the best time is kept per leg and only a faster time replaces it', () => {
        const storage = store();
        expect(WorldMap.best('airolo-lookout', storage)).toBe(null);
        expect(WorldMap.recordBest('airolo-lookout', 600000, storage)).toBe(true);
        expect(WorldMap.recordBest('airolo-lookout', 650000, storage)).toBe(false);
        expect(WorldMap.recordBest('airolo-lookout', 590000, storage)).toBe(true);
        expect(WorldMap.best('airolo-lookout', storage)).toBe(590000);
        expect(WorldMap.best('tremola', storage)).toBe(null);
        expect(WorldMap.entries({ storage }).find(e => e.id === 'airolo-lookout').best).toBe(590000);
    });
});

describe('the relief', () => {
    // A grid as a far level's file holds it: a ridge along x = 0, forest to the west, ice on top
    const grid = () => {
        const nx = 21, nz = 21, cell = 100;
        const buffer = new ArrayBuffer(16 + nx * nz * 6);
        const view = new DataView(buffer);
        view.setInt32(0, -1000 * 1000, true);
        view.setInt32(4, -1000 * 1000, true);
        view.setUint16(8, nx, true);
        view.setUint16(10, nz, true);
        view.setUint16(12, cell, true);
        for (let j = 0; j < nz; j++) {
            for (let i = 0; i < nx; i++) {
                const v = j * nx + i;
                view.setInt16(16 + v * 2, 2000 - Math.abs(i - 10) * 80, true);
                view.setUint8(16 + nx * nz * 2 + v * 4, i < 8 ? 255 : 0);
                view.setUint8(16 + nx * nz * 2 + v * 4 + 2, i === 10 ? 255 : 0);
                view.setUint8(16 + nx * nz * 2 + v * 4 + 3, 255);
            }
        }
        return WorldMap.parseGrid(buffer);
    };

    test('a far level is read, sampled, and shaded with the light from the north-west', () => {
        const g = grid();
        expect(WorldMap.sample(g, 0, 0).h).toBeCloseTo(2000);
        expect(WorldMap.sample(g, 5000, 0)).toBe(null);
        const { pixels, known } = WorldMap.shade({ coarse: g, fine: [] }, { x0: -900, z0: -900, x1: 900, z1: 900 }, 18, 18);
        expect(known).toBe(18 * 18);
        const lum = (i, j) => { const v = (j * 18 + i) * 4; return pixels[v] + pixels[v + 1] + pixels[v + 2]; };
        // The west face looks at the light, the east face away
        expect(lum(5, 9)).toBeGreaterThan(lum(13, 9));
    });

    test('no far land: the relief is left out and the map works without it', async () => {
        const grids = await WorldMap.loadGrids(async () => ({ ok: false }));
        expect(grids).toEqual({ coarse: null, fine: [] });
    });
});

describe('the map on the menu', () => {
    let picked, backs, storage;
    beforeEach(() => {
        document.body.innerHTML = '';
        Modals.stack = [];
        picked = jest.fn();
        backs = jest.fn();
        storage = store();
        // The map reads the page's own store: the test's
        Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
        WorldMap.reliefUrl = null;
    });
    afterEach(() => WorldMap.close(document));

    const open = (options = {}) => WorldMap.open(document, { onPick: picked, onBack: backs, ...options });

    test('every row of the tour has a line with a hit area and a pin, and each earlier leg a button', () => {
        open();
        for (const leg of WorldLegs.LIST.filter(l => l.n)) {
            const group = document.querySelector(`#world-legs .map-leg[data-leg="${leg.id}"]`);
            expect(group).not.toBe(null);
            expect(group.querySelector('.map-hit').getAttribute('d')).toMatch(/^M/);
            expect(group.dataset.state).toBe(leg.planned ? 'planned' : WorldLegs.isOpen(leg.id) ? 'open' : 'locked');
            const pin = document.querySelector(`#world-legs .map-pin[data-leg="${leg.id}"]`);
            expect(pin.textContent).toBe(String(leg.n));
        }
        for (const leg of WorldLegs.LIST.filter(l => !l.n)) expect(document.querySelector(`#world-legs .map-earlier-btn[data-leg="${leg.id}"]`)).not.toBe(null);
        // The first leg is chosen and focused, as the list focused it
        expect(document.activeElement).toBe(document.querySelector('#world-legs .map-pin[data-leg="airolo-lookout"]'));
    });

    test('a click chooses a leg, a click on the chosen leg rides it, and RIDE rides the chosen leg', () => {
        open();
        const pin = document.querySelector('#world-legs .map-pin[data-leg="airolo-lookout"]');
        pin.click();
        expect(picked).toHaveBeenCalledWith('airolo-lookout');
        expect(document.getElementById('world-legs')).toBe(null);
        open();
        document.querySelector('#world-legs .map-earlier-btn[data-leg="tremola"]').click();
        expect(picked).toHaveBeenCalledTimes(1);
        expect(document.querySelector('#world-legs .map-name').textContent).toBe(WorldLegs.find('tremola').name);
        document.querySelector('#world-legs .map-ride').click();
        expect(picked).toHaveBeenLastCalledWith('tremola');
    });

    test('a closed leg cannot start: not by its pin, its line, RIDE or Enter', () => {
        open();
        for (const leg of WorldLegs.LIST.filter(l => !WorldLegs.isOpen(l.id))) {
            const pin = document.querySelector(`#world-legs .map-pin[data-leg="${leg.id}"]`);
            if (!pin) continue;
            pin.click();
            pin.click();
            expect(document.querySelector('#world-legs .map-ride').disabled).toBe(true);
            document.querySelector('#world-legs .map-ride').click();
            const line = document.querySelector(`#world-legs .map-leg[data-leg="${leg.id}"]`);
            line.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            line.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            pin.focus();
            press('Enter');
            expect(document.querySelector('#world-legs .map-state').textContent).toMatch(/Coming later|Finish leg \d+ to open/);
        }
        expect(picked).not.toHaveBeenCalled();
    });

    test('debug mode opens every built leg, and a leg not built stays closed', () => {
        open({ unlockAll: true });
        expect(document.querySelector('#world-legs .map-pin[data-leg="lookout-andermatt"]').dataset.state).toBe('open');
        const planned = WorldLegs.LIST.find(l => l.planned);
        if (planned) expect(document.querySelector(`#world-legs .map-pin[data-leg="${planned.id}"]`).dataset.state).toBe('planned');
    });

    test('the arrow keys step the legs and Enter rides, through the dialog stack', () => {
        storage.setItem(WorldLegs.STORE, JSON.stringify(['airolo-lookout']));
        open();
        const chosen = () => document.getElementById('world-legs').mapState().chosen;
        // Leg 1 finished: leg 2 is offered
        expect(chosen()).toBe('lookout-andermatt');
        press('ArrowLeft');
        expect(chosen()).toBe('airolo-lookout');
        expect(document.activeElement.dataset.leg).toBe('airolo-lookout');
        press('ArrowRight');
        press('ArrowRight');
        expect(chosen()).toBe(WorldLegs.LIST[2].id);
        press('ArrowLeft');
        expect(chosen()).toBe('lookout-andermatt');
        press('Enter');
        expect(picked).toHaveBeenCalledWith('lookout-andermatt');
    });

    test('Escape and Back go back to the rider screen', () => {
        open();
        press('Escape');
        expect(backs).toHaveBeenCalledTimes(1);
        expect(document.getElementById('world-legs')).toBe(null);
        expect(document.body.classList.contains('home-map-on')).toBe(false);
        open();
        document.querySelector('#world-legs .map-back').click();
        expect(backs).toHaveBeenCalledTimes(2);
    });

    test('hovering a leg shows it in the card; leaving shows the chosen leg again', () => {
        open();
        const planned = WorldLegs.LIST.find(l => l.planned);
        const group = document.querySelector(`#world-legs .map-leg[data-leg="${planned.id}"]`);
        group.dispatchEvent(new Event('pointerenter'));
        expect(document.querySelector('#world-legs .map-name').textContent).toBe(planned.name);
        expect(document.querySelector('#world-legs .map-state').textContent).toBe('Coming later');
        const stats = [...document.querySelectorAll('#world-legs .map-stat dd')].map(d => d.textContent);
        expect(stats[0]).toBe(`${planned.km.toFixed(1)} km`);
        expect(stats[1]).toMatch(/^\d[\d,]* m$/);
        group.dispatchEvent(new Event('pointerleave'));
        expect(document.querySelector('#world-legs .map-name').textContent).toBe(WorldLegs.find('airolo-lookout').name);
    });

    test('the card and RIDE show the same leg, whether it is hovered, chosen, stepped to or tapped; a closed leg\'s button says why', () => {
        open();
        const same = () => {
            const name = document.querySelector('#world-legs .map-name').textContent;
            const entry = WorldMap.entries().find(e => e.name === name);
            const ride = document.querySelector('#world-legs .map-ride');
            expect(ride.dataset.leg).toBe(entry.id);
            expect(ride.textContent).toBe(WorldMap.rideText(entry));
            expect(ride.disabled).toBe(entry.state !== 'open');
            return { entry, ride };
        };
        const planned = WorldLegs.LIST.find(l => l.planned);
        const pin = id => document.querySelector(`#world-legs .map-pin[data-leg="${id}"]`);
        // A closed leg chosen, then an open one hovered: both follow the hover, and back on leaving
        pin(planned.id).click();
        let shown = same();
        expect(shown.ride.textContent).toBe('COMING LATER');
        pin('airolo-lookout').dispatchEvent(new Event('pointerenter'));
        shown = same();
        expect(shown.entry.id).toBe('airolo-lookout');
        expect(shown.ride.textContent).toBe('RIDE LEG 1 →');
        pin('airolo-lookout').dispatchEvent(new Event('pointerleave'));
        expect(same().entry.id).toBe(planned.id);
        // Stepped with the keys
        press('ArrowLeft');
        same();
        press('ArrowRight');
        same();
        // A leg closed by the lock rule says which leg opens it
        pin('lookout-andermatt').click();
        expect(same().ride.textContent).toBe('FINISH LEG 1 TO OPEN');
        document.querySelector('#world-legs .map-ride').click();
        expect(picked).not.toHaveBeenCalled();
        // The earlier legs too
        document.querySelector('#world-legs .map-earlier-btn[data-leg="tremola"]').click();
        expect(same().entry.id).toBe('tremola');
    });

    test('free roam: the button says so', () => {
        open({ roam: true });
        expect(document.querySelector('#world-legs .map-ride').textContent).toBe('ROAM →');
    });
});
