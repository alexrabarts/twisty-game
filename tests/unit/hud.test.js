/**
 * The HUD rules and the DOM they drive: the controls hint fades after the
 * first seconds (sooner once the rider rides), the FPS counter is off unless
 * asked for, touch controls exist only on touch devices, and per-frame writes
 * reuse text nodes.
 */

import { jest } from '@jest/globals';
import { readFileSync } from 'fs';

const read = name => readFileSync(new URL(`../../js/${name}`, import.meta.url), 'utf8');
(0, eval)(`${read('hud.js')}\n${read('virtualcontrols.js')}\n${read('input.js')}\nglobalThis.HudRules = HudRules; globalThis.Hud = Hud; globalThis.UiIcons = UiIcons; globalThis.VirtualControls = VirtualControls; globalThis.InputHandler = InputHandler;`);

const markup = `
    <p id="raceTimer">0:00.00</p>
    <span id="hudGatePips"></span><b id="hudGateCount">0/5</b>
    <span id="score">0</span><span id="comboDisplay"></span>
    <div id="hudSpeed" data-band="-1"><svg><path id="speedFill"/></svg><span id="speed">0</span></div>
    <div id="startCard"><div id="startLeg"></div></div>
    <div id="splitPopup"></div>
    <div id="callouts"></div>
    <div id="hudHint"></div>
    <div id="fps" hidden>FPS 0</div>`;

// A window whose media queries answer from `matches`
const fakeWindow = (search = '', matches = {}) => ({
    location: { search },
    localStorage: window.localStorage,
    matchMedia: query => ({ matches: Boolean(matches[query]) })
});

describe('HudRules', () => {
    test('the hint shows at the start and is gone after HINT_MS', () => {
        expect(HudRules.hintVisible(0, NaN)).toBe(true);
        expect(HudRules.hintVisible(HudRules.HINT_MS - 1, NaN)).toBe(true);
        expect(HudRules.hintVisible(HudRules.HINT_MS, NaN)).toBe(false);
    });

    test('the first input shortens the hint to HINT_AFTER_INPUT_MS', () => {
        expect(HudRules.hintVisible(1000, 500)).toBe(true);
        expect(HudRules.hintVisible(500 + HudRules.HINT_AFTER_INPUT_MS, 500)).toBe(false);
        // Input never makes the hint last longer than HINT_MS
        expect(HudRules.hintVisible(HudRules.HINT_MS, HudRules.HINT_MS - 100)).toBe(false);
    });

    test('a broken clock hides the hint rather than pinning it on screen', () => {
        expect(HudRules.hintVisible(NaN, NaN)).toBe(false);
    });

    test('the FPS counter is off unless the address or the stored toggle asks', () => {
        expect(HudRules.fpsEnabled('', null)).toBe(false);
        expect(HudRules.fpsEnabled('?fps=1', null)).toBe(true);
        expect(HudRules.fpsEnabled('?leg=2&fps=true', null)).toBe(true);
        expect(HudRules.fpsEnabled('', '1')).toBe(true);
        expect(HudRules.fpsEnabled('?fps=0', '1')).toBe(false);
    });

    test('touch controls are for coarse pointers, not for touch laptops with a mouse', () => {
        expect(HudRules.isTouch(fakeWindow('', { '(pointer: coarse)': true }))).toBe(true);
        expect(HudRules.isTouch(fakeWindow('', { '(any-pointer: coarse)': true }))).toBe(true);
        expect(HudRules.isTouch(fakeWindow('', { '(any-pointer: coarse)': true, '(any-pointer: fine)': true }))).toBe(false);
        expect(HudRules.isTouch(fakeWindow('', { '(pointer: fine)': true }))).toBe(false);
        expect(HudRules.isTouch({})).toBe(false);
    });

    test('the speed gauge fills with speed and clamps at both ends', () => {
        expect(HudRules.gaugeOffset(0, 150)).toBe(100);
        expect(HudRules.gaugeOffset(75, 150)).toBe(50);
        expect(HudRules.gaugeOffset(200, 150)).toBe(0);
        expect(HudRules.gaugeOffset(-5, 150)).toBe(100);
        expect(HudRules.speedBand(0)).toBe(-1);
        expect(HudRules.speedBand(10)).toBe(0);
        expect(HudRules.speedBand(30)).toBe(1);
        expect(HudRules.speedBand(60)).toBe(2);
    });
});

describe('Hud', () => {
    let hud;

    beforeEach(() => {
        jest.useFakeTimers();
        localStorage.clear();
        document.body.innerHTML = markup;
        document.body.className = '';
        hud = new Hud(document, fakeWindow());
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('the hint fades once, when its rule turns false, and comes back for a new run', () => {
        const hint = document.getElementById('hudHint');
        const toggle = jest.spyOn(hint.classList, 'toggle');
        hud.startRun('Leg 1 · Mountain Dawn');
        hud.update(100, NaN);
        expect(hint.classList.contains('hidden')).toBe(false);
        hud.update(800, 600);
        hud.update(600 + HudRules.HINT_AFTER_INPUT_MS, 600);
        expect(hint.classList.contains('hidden')).toBe(true);
        hud.update(4000, 600);
        hud.update(9000, 600);
        expect(toggle).toHaveBeenCalledTimes(1);

        hud.startRun('Leg 1 · Mountain Dawn');
        expect(hint.classList.contains('hidden')).toBe(false);
    });

    test('the leg name and GO wait for the third frame and leave after START_CARD_MS', () => {
        const card = document.getElementById('startCard');
        hud.startRun('Leg 2 · Valley Run');
        hud.update(0, NaN);
        hud.update(16, NaN);
        expect(card.classList.contains('active')).toBe(false);
        hud.update(33, NaN);
        expect(card.classList.contains('active')).toBe(true);
        expect(document.getElementById('startLeg').textContent).toBe('Leg 2 · Valley Run');
        jest.advanceTimersByTime(HudRules.START_CARD_MS);
        expect(card.classList.contains('active')).toBe(false);
    });

    test('FPS is hidden by default; Backquote shows it and the choice is kept', () => {
        const fps = document.getElementById('fps');
        expect(fps.hidden).toBe(true);
        hud.setFps(58);
        expect(fps.textContent).toBe('FPS 0');

        document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backquote' }));
        expect(fps.hidden).toBe(false);
        expect(localStorage.getItem(HudRules.FPS_KEY)).toBe('1');
        hud.setFps(58);
        expect(fps.textContent).toBe('FPS 58');

        const next = new Hud(document, fakeWindow());
        expect(next.fpsVisible).toBe(true);
    });

    test('?fps=1 turns the counter on without a stored choice', () => {
        document.body.innerHTML = markup;
        const shown = new Hud(document, fakeWindow('?fps=1'));
        expect(document.getElementById('fps').hidden).toBe(false);
        expect(shown.fpsVisible).toBe(true);
    });

    test('the timer is written into its existing text node, and only when it changes', () => {
        const timer = document.getElementById('raceTimer');
        const node = timer.firstChild;
        hud.setTime('0:01.23');
        expect(timer.firstChild).toBe(node);
        expect(node.nodeValue).toBe('0:01.23');
        hud.setTime('0:01.23');
        expect(node.nodeValue).toBe('0:01.23');
    });

    test('speed writes the digits, the band and the gauge only on a new whole value', () => {
        hud.setSpeed(55.2, 150);
        const fill = document.getElementById('speedFill');
        expect(document.getElementById('speed').textContent).toBe('55');
        expect(document.getElementById('hudSpeed').dataset.band).toBe('2');
        expect(fill.style.strokeDashoffset).toBe(String(HudRules.gaugeOffset(55, 150)));
        fill.style.strokeDashoffset = 'untouched';
        hud.setSpeed(54.9, 150);
        expect(fill.style.strokeDashoffset).toBe('untouched');
    });

    test('checkpoint pips follow the gates passed', () => {
        hud.setGates(0, 5);
        expect(document.querySelectorAll('#hudGatePips i')).toHaveLength(5);
        hud.setGates(2, 5);
        expect(document.querySelectorAll('#hudGatePips i.on')).toHaveLength(2);
        expect(document.getElementById('hudGateCount').textContent).toBe('2/5');
    });

    test('many gates: a long leg has up to 20 pips, which shrink; 5 gates keep the full size', () => {
        const pips = document.getElementById('hudGatePips');
        hud.setGates(7, 20);
        expect(document.querySelectorAll('#hudGatePips i')).toHaveLength(20);
        expect(document.querySelectorAll('#hudGatePips i.on')).toHaveLength(7);
        expect(document.getElementById('hudGateCount').textContent).toBe('7/20');
        expect('many' in pips.dataset).toBe(true);
        hud.setGates(0, HudRules.MANY_GATES);
        expect('many' in pips.dataset).toBe(false);
        hud.setGates(0, 14);
        expect('many' in pips.dataset).toBe(true);
        hud.setGates(0, 5);
        expect('many' in pips.dataset).toBe(false);
    });

    test('the many-gates pips are smaller and closer in css/ui.css', () => {
        const css = readFileSync(new URL('../../css/ui.css', import.meta.url), 'utf8');
        expect(css).toMatch(/#hudGatePips\[data-many\] \{\s*gap: 2px;/);
        expect(css).toMatch(/#hudGatePips\[data-many\] i \{\s*width: calc\(var\(--fs-meta\) \* 0\.4\);/);
    });

    test('call-outs stack without overlap, cap at CALLOUT_LIMIT, merge repeats and leave on time', () => {
        const box = document.getElementById('callouts');
        hud.callout('Cone hit +50', 'warn', 1000);
        hud.callout('Cone hit +50', 'warn', 1000);
        expect(box.children).toHaveLength(1);
        hud.callout('Flip! +200', 'gold', 1000);
        hud.callout('Near miss +100', 'gold', 1000);
        hud.callout('Speed streak +250', 'gold', 1000);
        expect(box.children).toHaveLength(HudRules.CALLOUT_LIMIT);
        expect(box.lastElementChild.className).toBe('callout tone-gold');
        jest.advanceTimersByTime(1000);
        expect(Array.from(box.children).every(child => child.classList.contains('leaving'))).toBe(true);
        jest.advanceTimersByTime(300);
        expect(box.children).toHaveLength(0);
    });

    test('a new run clears the last run\'s split and call-outs', () => {
        hud.showSplit('<div>CHECKPOINT 1/5</div>');
        hud.callout('Cone hit +50', 'warn', 5000);
        document.body.classList.add('run-over');
        hud.startRun('Leg 1 · Mountain Dawn');
        expect(document.getElementById('splitPopup').classList.contains('show')).toBe(false);
        expect(document.getElementById('callouts').children).toHaveLength(0);
        expect(document.body.classList.contains('run-over')).toBe(false);
    });
});

describe('touch controls', () => {
    const realMatchMedia = window.matchMedia;

    afterEach(() => {
        window.matchMedia = realMatchMedia;
        document.body.innerHTML = '';
        document.body.className = '';
    });

    const stubPointer = coarse => {
        window.matchMedia = query => ({ matches: coarse ? /coarse/.test(query) : /fine/.test(query) });
    };

    test('a desktop gets no on-screen buttons until it is touched', () => {
        stubPointer(false);
        const input = new InputHandler();
        expect(input.virtualControls).toBeNull();
        expect(document.querySelector('.virtual-controls-left')).toBeNull();

        window.dispatchEvent(new Event('touchstart'));
        expect(input.virtualControls).not.toBeNull();
        expect(document.body.classList.contains('touch')).toBe(true);
    });

    test('a phone gets labelled thumb buttons that report their keys', () => {
        stubPointer(true);
        const input = new InputHandler();
        const throttle = document.querySelector('.virtual-button.throttle');
        expect(throttle.getAttribute('aria-label')).toBe('Throttle');
        expect(document.querySelectorAll('.virtual-button')).toHaveLength(5);
        expect(document.querySelector('.virtual-button-camera')).not.toBeNull();

        throttle.dispatchEvent(new Event('touchstart', { cancelable: true }));
        expect(input.virtualControls.getKey('KeyW')).toBe(true);
        expect(throttle.classList.contains('pressed')).toBe(true);
        throttle.dispatchEvent(new Event('touchend', { cancelable: true }));
        expect(input.virtualControls.getKey('KeyW')).toBe(false);
    });
});
