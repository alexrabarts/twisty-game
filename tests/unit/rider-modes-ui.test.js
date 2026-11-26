/**
 * The rider mode on the page (js/ridermodes.js): the control of the menu and of the pause panel, the key in a ride,
 * and the HUD's tag. One rule for a change in a ride: the bike stands. The table and the physics are in
 * tests/unit/rider-modes.test.js; the menu itself is ridden by tools/modal-check.mjs (menu-rider-mode).
 */
import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { gameMethods } from '../helpers/load-game.js';

const read = name => readFileSync(new URL(`../../${name}`, import.meta.url), 'utf8');
// The physics' two doors, as the mode calls them
globalThis.Tuning = { setMode: jest.fn() };
globalThis.WorldAssist = { setLevel: jest.fn() };
(0, eval)(`${read('js/modals.js')}\n${read('js/hud.js')}\n${read('js/ridermodes.js')}\n${read('js/world/credits.js')}
globalThis.Hud = Hud; globalThis.RiderModes = RiderModes; globalThis.WorldCredits = WorldCredits;`);

const press = (code, more = {}, target = document.activeElement || document.body) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, ...more }));

const storageOf = (stored = {}) => {
    const kept = { ...stored };
    return { kept, getItem: key => (key in kept ? kept[key] : null), setItem(key, value) { kept[key] = String(value); }, removeItem(key) { delete kept[key]; } };
};

const ids = () => RiderModes.MODES.map(mode => mode.id);
const after = (id) => RiderModes.MODES[(ids().indexOf(id) + 1) % RiderModes.MODES.length];
const state = (box) => ({
    checked: [...box.querySelectorAll('.mode-btn')].filter(b => b.getAttribute('aria-checked') === 'true').map(b => b.dataset.mode),
    keyed: [...box.querySelectorAll('.mode-btn[data-key]')].map(b => `${b.dataset.mode}:${b.dataset.key}`),
    disabled: [...box.querySelectorAll('.mode-btn')].filter(b => b.disabled).length,
    line: box.querySelector('.mode-picker-hint').textContent
});

let storage;
beforeEach(() => {
    document.body.innerHTML = '<div id="hudBike"><div id="hudMode" class="hud-mode"></div></div>';
    storage = storageOf();
    RiderModes.listeners.length = 0;
    RiderModes.start({ storage });
});

afterEach(() => {
    WorldCredits.hidePause();
    while (Modals.top()) Modals.close(Modals.top().element);
});

describe('the control', () => {
    test('a button for each row of the table, in its order, the mode in force checked and its line under them', () => {
        const box = RiderModes.control(document);
        document.body.appendChild(box);
        expect([...box.querySelectorAll('.mode-btn')].map(b => [b.dataset.mode, b.textContent])).toEqual(RiderModes.MODES.map(mode => [mode.id, mode.name]));
        const mode = RiderModes.get();
        expect(state(box)).toEqual({ checked: [mode.id], keyed: [`${after(mode.id).id}:${RiderModes.STEP_KEY}`], disabled: 0, line: mode.hint });
        expect(box.querySelector('.mode-picker-label').textContent).toContain(RiderModes.STEP_KEY.replace('Key', ''));
    });

    test('a click chooses the mode, stores it, hands it to the physics and moves the step key to the next one', () => {
        const done = jest.fn();
        const box = RiderModes.control(document, { after: done });
        const other = RiderModes.control(document);
        document.body.append(box, other);
        for (const mode of [...RiderModes.MODES].reverse()) {
            Tuning.setMode.mockClear();
            WorldAssist.setLevel.mockClear();
            box.querySelector(`[data-mode="${mode.id}"]`).click();
            expect(RiderModes.get()).toBe(mode);
            expect(storage.kept[RiderModes.KEY]).toBe(mode.id);
            expect(Tuning.setMode).toHaveBeenCalledWith(mode.tune);
            expect(WorldAssist.setLevel).toHaveBeenCalledWith(mode.assist);
            const want = { checked: [mode.id], keyed: [`${after(mode.id).id}:${RiderModes.STEP_KEY}`], disabled: 0, line: mode.hint };
            expect(state(box)).toEqual(want);
            // Every control on the page shows the same
            expect(state(other)).toEqual(want);
        }
        expect(done).toHaveBeenCalledTimes(RiderModes.MODES.length);
    });

    test('locked, it shows the mode and the reason, takes no click and carries no key', () => {
        const before = RiderModes.get();
        const box = RiderModes.control(document, { locked: true });
        document.body.appendChild(box);
        expect(state(box)).toEqual({ checked: [before.id], keyed: [], disabled: RiderModes.MODES.length, line: RiderModes.LOCKED_TEXT });
        box.querySelectorAll('.mode-btn').forEach(button => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
        expect(RiderModes.get()).toBe(before);
        expect(storage.kept).toEqual({});
    });

    test('the menu holds it on the rider screen, free, with the note of a moved assist setting; it listens for no key of its own', () => {
        const tours = read('js/tours.js');
        expect(tours).toMatch(/id="riderModeRow"/);
        expect(tours).toMatch(/RiderModes\.control\(document, \{ after: \(\) => focusPrimary\('riderContinueBtn'\) \}\)/);
        expect(tours).toMatch(/RiderModes\.note/);
        expect(read('js/ridermodes.js')).not.toMatch(/addEventListener\('key/);
        // The page loads the modes after the tuning they set and before the game that starts them
        const html = read('index.html');
        const at = name => html.indexOf(`src="js/${name}"`);
        expect(at('ridermodes.js')).toBeGreaterThan(at('tuning.js'));
        expect(at('ridermodes.js')).toBeLessThan(at('main.js'));
    });
});

describe('the pause panel', () => {
    const open = (speed, isWorld = true) => WorldCredits.showPause({ isWorld }, () => {}, () => {}, isWorld ? () => {} : null, speed);

    test('with the bike moving as the pause began the control is locked, with the reason; the key does nothing', () => {
        const before = RiderModes.get();
        const panel = open(14);
        const box = panel.querySelector('[data-mode-picker]');
        expect(state(box)).toEqual({ checked: [before.id], keyed: [], disabled: RiderModes.MODES.length, line: RiderModes.LOCKED_TEXT });
        press(RiderModes.STEP_KEY);
        expect(RiderModes.get()).toBe(before);
        // The old control is gone
        expect(panel.querySelector('[data-assist]')).toBeNull();
        expect(panel.textContent).not.toMatch(/assist/i);
    });

    test('with the bike standing the key steps the mode through the dialog stack, and a click chooses one', () => {
        const before = RiderModes.get();
        const panel = open(0);
        const box = panel.querySelector('[data-mode-picker]');
        expect(state(box).disabled).toBe(0);
        press(RiderModes.STEP_KEY);
        const stepped = after(before.id);
        expect(RiderModes.get()).toBe(stepped);
        expect(state(box)).toEqual({ checked: [stepped.id], keyed: [`${after(stepped.id).id}:${RiderModes.STEP_KEY}`], disabled: 0, line: stepped.hint });
        // A held key does not run through the modes
        press(RiderModes.STEP_KEY, { repeat: true });
        expect(RiderModes.get()).toBe(stepped);
        box.querySelector(`[data-mode="${before.id}"]`).click();
        expect(RiderModes.get()).toBe(before);
        // The panel's own keys still work
        expect(Modals.buttonFor(panel, 'KeyP')).toBe(panel.querySelector('[data-resume]'));
    });

    test('a classic leg has the control too, by the same rule', () => {
        expect(state(open(0, false).querySelector('[data-mode-picker]')).disabled).toBe(0);
        WorldCredits.hidePause();
        expect(state(open(9, false).querySelector('[data-mode-picker]')).disabled).toBe(RiderModes.MODES.length);
    });

    test('the bound is the one rule: just under it the control is free, at it locked', () => {
        expect(state(open(RiderModes.STOP_SPEED - 0.01).querySelector('[data-mode-picker]')).disabled).toBe(0);
        WorldCredits.hidePause();
        expect(state(open(RiderModes.STOP_SPEED).querySelector('[data-mode-picker]')).disabled).toBe(RiderModes.MODES.length);
    });

    test('the game hands the pause the bike\'s speed', () => {
        expect(read('js/main.js')).toMatch(/WorldCredits\.showPause\(this\.environment, .*, this\.vehicle \? this\.vehicle\.speed : 0[,)]/);
    });
});

describe('the HUD\'s tag and the key in a ride', () => {
    // The game's own two methods and its key listener, cut from js/main.js
    const callouts = [];
    const listener = (() => {
        const main = read('js/main.js');
        const from = main.indexOf("document.addEventListener('keydown', (event) => {\n    if (typeof RiderModes === 'undefined'");
        const to = main.indexOf('});', from) + 3;
        expect(from).toBeGreaterThan(0);
        return main.slice(from, to);
    })();
    let game;

    beforeEach(() => {
        callouts.length = 0;
        game = { hud: new Hud(document, { location: { search: '' }, localStorage: storage, matchMedia: () => ({ matches: false }) }), vehicle: { speed: 0 }, environment: { isWorld: true } };
        Object.assign(game, gameMethods(['startRiderModes', 'stepRiderMode'], game, {
            RiderModes, document, window: { localStorage: storage }, console,
            showCallout: (text, tone, ms) => callouts.push([text, tone, ms])
        }));
        window.game = game;
    });

    const tag = () => { const el = document.getElementById('hudMode'); return [el.textContent, el.dataset.tone || '']; };

    test('the tag shows the stored mode from the page\'s start and follows every change, with the mode\'s tone', () => {
        storage.kept[RiderModes.KEY] = RiderModes.MODES[RiderModes.MODES.length - 1].id;
        game.startRiderModes();
        const last = RiderModes.get();
        expect(last.id).toBe(storage.kept[RiderModes.KEY]);
        expect(tag()).toEqual([last.name, last.tone]);
        for (const mode of RiderModes.MODES) {
            RiderModes.set(mode.id);
            expect(tag()).toEqual([mode.name, mode.tone]);
        }
        // Each tone the table uses has its colour in the stylesheet, on the tag and on the control
        const css = read('css/ui.css');
        for (const tone of new Set(RiderModes.MODES.map(mode => mode.tone).filter(Boolean))) {
            expect(css).toContain(`.hud-mode[data-tone="${tone}"]`);
            expect(css).toContain(`.mode-btn.on[data-tone="${tone}"]`);
        }
    });

    test('a control that is open follows a change made by the key', () => {
        game.startRiderModes();
        const box = RiderModes.control(document);
        document.body.appendChild(box);
        game.stepRiderMode();
        expect(state(box).checked).toEqual([RiderModes.get().id]);
    });

    test('the key while moving changes nothing and says to stop first; at a stop it is the next mode, and says which', () => {
        game.startRiderModes();
        (0, eval)(listener);
        const before = RiderModes.get();
        game.vehicle.speed = 22;
        press(RiderModes.STEP_KEY);
        expect(RiderModes.get()).toBe(before);
        expect(storage.kept).toEqual({});
        expect(callouts).toEqual([[RiderModes.LOCKED_TEXT, 'warn', 1500]]);
        expect(RiderModes.LOCKED_TEXT).toMatch(/^Stop the bike/);
        expect(tag()).toEqual([before.name, before.tone]);

        game.vehicle.speed = 0;
        press(RiderModes.STEP_KEY);
        const stepped = after(before.id);
        expect(RiderModes.get()).toBe(stepped);
        expect(callouts[1]).toEqual([`Rider mode: ${stepped.name}`, 'info', 1500]);
        expect(tag()).toEqual([stepped.name, stepped.tone]);
        expect(storage.kept[RiderModes.KEY]).toBe(stepped.id);

        // Not on a held key, not with a modifier, not while a name is typed, not before a ride, not under a dialog
        callouts.length = 0;
        press(RiderModes.STEP_KEY, { repeat: true });
        press(RiderModes.STEP_KEY, { ctrlKey: true });
        const field = document.createElement('input');
        document.body.appendChild(field);
        press(RiderModes.STEP_KEY, {}, field);
        game.environment = null;
        press(RiderModes.STEP_KEY, {}, document.body);
        game.environment = { isWorld: false };
        const dialog = document.createElement('div');
        dialog.innerHTML = '<button>OK</button>';
        document.body.appendChild(dialog);
        Modals.open(dialog);
        press(RiderModes.STEP_KEY);
        Modals.close(dialog);
        expect(callouts).toEqual([]);
        expect(RiderModes.get()).toBe(stepped);
        // A classic leg rides by the same key
        press(RiderModes.STEP_KEY, {}, document.body);
        expect(RiderModes.get()).toBe(after(stepped.id));
    });

    test('the step key is no other key of the game', () => {
        const taken = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyR', 'KeyM', 'KeyN', 'KeyC', 'KeyZ', 'KeyP', 'KeyF', 'KeyT', 'KeyQ', 'KeyE', 'Space', 'Escape', 'Backquote'];
        expect(taken).not.toContain(RiderModes.STEP_KEY);
        for (const file of ['js/input.js', 'js/tours.js', 'js/tuningpanel.js', 'js/world/guide.js', 'js/hud.js']) expect(read(file)).not.toContain(`'${RiderModes.STEP_KEY}'`);
    });
});
