/**
 * The tuning panel of debug mode (js/tuningpanel.js): built only in debug mode, opened and closed with T while the
 * ride goes on, and never the keyboard's owner: after a slider is moved the game still reads the ride keys.
 */
import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL(`../../js/${name}`, import.meta.url), 'utf8');
(0, eval)(`${read('modals.js')}\n${read('tuning.js')}\n${read('tuningpanel.js')}\n${read('hud.js')}\n${read('input.js')}\nglobalThis.Modals = Modals; globalThis.Tuning = Tuning; globalThis.TuningPanel = TuningPanel; globalThis.Hud = Hud; globalThis.HudRules = HudRules; globalThis.InputHandler = InputHandler;`);

// The Game class alone (js/main.js up to its last static), for the code that decides whether a panel exists
const mainSource = read('main.js');
const Game = (0, eval)(`(function () { ${mainSource.slice(0, mainSource.indexOf('Game.RESTART_CLEAR_SEGMENTS = 6;'))}\nreturn Game; })()`);

const press = (code, target = document.body, type = 'keydown') =>
    target.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true }));
const pointer = (type, target, clientX) => {
    const event = new MouseEvent(type, { clientX, bubbles: true, cancelable: true });
    event.pointerId = 1;
    return target.dispatchEvent(event);
};
// A panel whose tracks are 100 px wide from x = 0
function panelOf(options = {}) {
    const panel = new TuningPanel(document, Tuning, options);
    for (const { track } of Object.values(panel.rows)) track.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 18 });
    return panel;
}

const listeners = [];
const listen = document.addEventListener.bind(document);

beforeEach(() => {
    document.body.innerHTML = '<div id="fps" hidden>FPS 0</div><div id="hudTuned" hidden>TUNED</div>';
    document.body.className = '';
    window.localStorage.clear();
    window.history.replaceState({}, '', '/');
    Modals.stack.length = 0;
    // Each test's key listeners go when it ends, so one test's panel does not answer the next one's keys
    document.addEventListener = (type, handler, options) => {
        listeners.push([type, handler, options]);
        listen(type, handler, options);
    };
});

afterEach(() => {
    for (const [type, handler, options] of listeners.splice(0)) document.removeEventListener(type, handler, options);
    document.addEventListener = listen;
    Tuning.start({ debug: false });
});

describe('only in debug mode', () => {
    const start = (search) => {
        window.history.replaceState({}, '', `/${search}`);
        const game = Object.create(Game.prototype);
        game.startTuning();
        return game;
    };

    test('without debug in the address there is no panel, no button, and T does nothing', () => {
        window.localStorage.setItem(Tuning.KEY, JSON.stringify({ brake: 0.8 }));
        const game = start('?world=tremola');
        expect(game.tuningPanel).toBeUndefined();
        expect(document.getElementById('tuningPanel')).toBeNull();
        expect(document.getElementById('tuningOpen')).toBeNull();
        press('KeyT');
        expect(document.getElementById('tuningPanel')).toBeNull();
        expect(Tuning.enabled).toBe(false);
        expect(Tuning.of('brake')).toBe(1);
    });

    test('with debug the panel is built, closed, with a row for each parameter and the stored values in it', () => {
        window.localStorage.setItem(Tuning.KEY, JSON.stringify({ brake: 0.8 }));
        const game = start('?world=tremola&debug');
        expect(game.tuningPanel).toBeInstanceOf(TuningPanel);
        const el = document.getElementById('tuningPanel');
        expect(el.hidden).toBe(true);
        expect(el.querySelectorAll('.tuning-row').length).toBe(Tuning.PARAMS.length);
        expect(el.querySelector('[data-id="brake"] .tuning-value').textContent).toBe('0.80');
        expect(el.querySelector('[data-id="brake"]').dataset.changed).toBe('1');
        expect(el.querySelector('[data-id="accel"] .tuning-value').textContent).toBe('1.00');
        expect(document.getElementById('tuningOpen')).not.toBeNull();
        // It is not a dialog of the stack
        expect(Modals.top()).toBeFalsy();
        expect(el.dataset.modal).toBeUndefined();
    });
});

describe('the toggle', () => {
    beforeEach(() => Tuning.start({ debug: true, storage: window.localStorage }));

    test('T opens and closes it, the button too, and neither pauses the ride', () => {
        const input = new InputHandler();
        const panel = panelOf();
        expect(panel.open).toBe(false);
        press('KeyT');
        expect(panel.open).toBe(true);
        expect(document.body.classList.contains('tuning-on')).toBe(true);
        expect(panel.button.getAttribute('aria-expanded')).toBe('true');
        expect(input.checkPause()).toBe(false);
        expect(Modals.top()).toBeFalsy();
        press('KeyT');
        expect(panel.open).toBe(false);
        panel.button.click();
        expect(panel.open).toBe(true);
        panel.el.querySelector('[data-act="close"]').click();
        expect(panel.open).toBe(false);
        expect(input.checkPause()).toBe(false);
        // A held key repeats: it toggles once
        document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyT', repeat: true, bubbles: true }));
        expect(panel.open).toBe(false);
    });

    test('not while a dialog is open, and not while a name is typed', () => {
        const panel = panelOf();
        const dialog = document.createElement('div');
        dialog.innerHTML = '<button>OK</button>';
        Modals.open(dialog);
        press('KeyT', document.activeElement);
        expect(panel.open).toBe(false);
        Modals.close(dialog);
        const name = document.createElement('input');
        document.body.appendChild(name);
        name.focus();
        press('KeyT', name);
        expect(panel.open).toBe(false);
        name.blur();
        press('KeyT');
        expect(panel.open).toBe(true);
    });

    test('the rows only a world ride reads are marked, and the panel says which ride it is', () => {
        let world = true;
        const panel = panelOf({ world: () => world });
        panel.show();
        expect(panel.el.dataset.ride).toBe('world');
        world = false;
        panel.refresh();
        expect(panel.el.dataset.ride).toBe('legs');
        for (const row of Tuning.PARAMS) expect(panel.rows[row.id].el.dataset.world).toBe(row.world ? '1' : undefined);
    });
});

describe('the sliders', () => {
    beforeEach(() => Tuning.start({ debug: true, storage: window.localStorage }));

    test('a drag sets the multiplier, shows the number, and stores it', () => {
        const panel = panelOf();
        panel.show();
        const { track, value, row } = panel.rows.brake;
        pointer('pointerdown', track, 20);
        expect(Tuning.of('brake')).toBeCloseTo(row.min + 0.2 * (row.max - row.min), 10);
        expect(value.textContent).toBe('0.70');
        pointer('pointermove', track, 40);
        expect(value.textContent).toBe('0.90');
        pointer('pointerup', track, 40);
        // After the drag a move over the track changes nothing
        pointer('pointermove', track, 90);
        expect(Tuning.of('brake')).toBe(0.9);
        expect(track.getAttribute('aria-valuenow')).toBe('0.90');
        expect(JSON.parse(window.localStorage.getItem(Tuning.KEY))).toEqual({ brake: 0.9 });
        expect(panel.text.value).toBe('twisty tuning v1\nbrake = 0.90');
        // The step buttons move it by one step; a double click on the number puts it back
        panel.rows.brake.el.querySelectorAll('.tuning-step')[1].click();
        expect(value.textContent).toBe('0.91');
        panel.rows.brake.el.querySelectorAll('.tuning-step')[0].click();
        panel.rows.brake.el.querySelectorAll('.tuning-step')[0].click();
        expect(value.textContent).toBe('0.89');
        value.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        expect(value.textContent).toBe('1.00');
        expect(Tuning.active()).toBe(false);
    });

    test('after a slider is moved the game still reads the ride keys: nothing in the panel took the focus', () => {
        const input = new InputHandler();
        const panel = panelOf();
        press('KeyT');
        const { track } = panel.rows.steerRate;
        // A press on the track, a step button or a panel button is not allowed to move the focus
        for (const target of [track, panel.rows.steerRate.el.querySelector('.tuning-step'), panel.el.querySelector('[data-act="reset"]'), panel.button]) {
            const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
            target.dispatchEvent(event);
            expect(event.defaultPrevented).toBe(true);
        }
        pointer('pointerdown', track, 60);
        pointer('pointermove', track, 70);
        pointer('pointerup', track, 70);
        expect(Tuning.of('steerRate')).not.toBe(1);
        expect(panel.el.contains(document.activeElement)).toBe(false);
        expect(panel.el.querySelectorAll('input').length).toBe(0);

        press('KeyW', document.activeElement || document.body);
        press('KeyA', document.activeElement || document.body);
        expect(input.getThrottleInput()).toBe(1);
        expect(input.targetSteeringInput).toBe(1);
        press('KeyS', document.activeElement || document.body);
        expect(input.getBrakeInput()).toBe(1);
        press('Space', document.activeElement || document.body);
        expect(input.getWheelieInput()).toBe(1);
        for (const code of ['KeyW', 'KeyA', 'KeyS', 'Space']) press(code, document.body, 'keyup');
        expect(input.getThrottleInput()).toBe(0);
        // The pause key still pauses, with the panel open
        press('KeyP');
        expect(input.checkPause()).toBe(true);
        expect(panel.open).toBe(true);
    });

    test('the text box may hold the focus, and closing the panel gives it back', () => {
        const panel = panelOf();
        panel.show();
        const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
        panel.text.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(false);
        expect(panel.text.readOnly).toBe(true);
        panel.text.focus();
        expect(document.activeElement).toBe(panel.text);
        press('KeyT', panel.text);
        expect(panel.open).toBe(false);
        expect(document.activeElement).not.toBe(panel.text);
    });
});

describe('Reset and Copy values', () => {
    beforeEach(() => Tuning.start({ debug: true, storage: window.localStorage }));

    test('Reset puts every row at 1.00, and the ride stays a tuned one', () => {
        const panel = panelOf();
        Tuning.beginRide();
        panel.set('brake', 0.9);
        panel.set('steerRate', 1.08);
        panel.el.querySelector('[data-act="reset"]').click();
        for (const { value, el } of Object.values(panel.rows)) {
            expect(value.textContent).toBe('1.00');
            expect(el.dataset.changed).toBeUndefined();
        }
        expect(panel.text.value).toBe('twisty tuning v1');
        expect(Tuning.ride.tuned).toBe(true);
        expect(panel.status.textContent).toMatch(/keeps no time/);
    });

    test('Copy puts the text on the clipboard and in the box', async () => {
        const written = [];
        const panel = panelOf({ clipboard: () => ({ writeText: text => { written.push(text); return Promise.resolve(); } }) });
        panel.set('brake', 0.9);
        panel.set('steerRate', 1.08);
        await panel.copy();
        expect(written).toEqual(['twisty tuning v1\nsteerRate = 1.08\nbrake = 0.90']);
        expect(panel.text.value).toBe(written[0]);
        expect(panel.status.textContent).toBe('Copied.');
        expect(Tuning.parse(panel.text.value)).toEqual({ values: { steerRate: 1.08, brake: 0.9 }, errors: [] });
    });

    test('a clipboard that refuses, or none, says so and leaves the text in the box', async () => {
        const warn = console.warn;
        const warned = [];
        console.warn = (...args) => warned.push(args.join(' '));
        try {
            for (const clipboard of [() => ({ writeText: () => Promise.reject(new Error('denied')) }), () => null, () => { throw new Error('blocked'); }]) {
                const panel = panelOf({ clipboard });
                panel.set('brake', 0.9);
                expect(await panel.copy()).toBe(false);
                expect(panel.status.textContent).toMatch(/select the text below/);
                expect(panel.text.value).toBe('twisty tuning v1\nbrake = 0.90');
            }
        } finally {
            console.warn = warn;
        }
        expect(warned.length).toBe(3);
    });

    test('where the clipboard refuses, the older copy from the text box is tried, and the focus goes back', async () => {
        const panel = panelOf({ clipboard: () => null });
        panel.set('brake', 0.9);
        const selected = [];
        document.execCommand = (command) => {
            selected.push([command, document.activeElement === panel.text, panel.text.value.slice(panel.text.selectionStart, panel.text.selectionEnd)]);
            return true;
        };
        try {
            expect(await panel.copy()).toBe(true);
        } finally {
            delete document.execCommand;
        }
        expect(selected).toEqual([['copy', true, 'twisty tuning v1\nbrake = 0.90']]);
        expect(panel.status.textContent).toBe('Copied.');
        expect(panel.el.contains(document.activeElement)).toBe(false);
    });
});

describe('the "tuned" tag of the HUD', () => {
    test('shows while the ride is a tuned one', () => {
        const hud = new Hud(document, window);
        const tag = document.getElementById('hudTuned');
        expect(tag.hidden).toBe(true);
        hud.setTuned(true);
        expect(tag.hidden).toBe(false);
        hud.setTuned(false);
        expect(tag.hidden).toBe(true);
    });
});

describe('the graphics row', () => {
    // A ladder as Game.qualityControl gives it: Auto (null) or a fixed level
    const control = () => {
        const state = { fixed: null, auto: 1 };
        return {
            state,
            levels: ['Lowest', 'Middle', 'Top'],
            get: () => state.fixed,
            level: () => (state.fixed === null ? state.auto : state.fixed),
            set: (level) => { state.fixed = level; }
        };
    };

    test('there is no row without a ladder', () => {
        Tuning.start({ debug: true, storage: window.localStorage });
        panelOf();
        expect(document.querySelector('[data-id="quality"]')).toBeNull();
    });

    test('− and + step through Auto and each level, and the value says which', () => {
        Tuning.start({ debug: true, storage: window.localStorage });
        const quality = control();
        const panel = panelOf({ quality });
        const row = document.querySelector('[data-id="quality"]');
        const value = row.querySelector('output');
        expect(value.textContent).toBe('Auto · Middle');
        row.querySelector('[data-act="quality-more"]').click();
        expect(quality.state.fixed).toBe(0);
        expect(value.textContent).toBe('Lowest');
        row.querySelector('[data-act="quality-more"]').click();
        row.querySelector('[data-act="quality-more"]').click();
        row.querySelector('[data-act="quality-more"]').click();
        expect(quality.state.fixed).toBe(2);
        expect(value.textContent).toBe('Top');
        for (let i = 0; i < 5; i++) row.querySelector('[data-act="quality-less"]').click();
        expect(quality.state.fixed).toBeNull();
        expect(value.textContent).toBe('Auto · Middle');
        // A graphics level is not a tuning: nothing to copy, and the ride keeps its time
        expect(Tuning.values).toEqual({});
        expect(panel.text.value).not.toMatch(/quality|graphics|level/i);
        expect(Tuning.ride.tuned).toBe(false);
    });
});
