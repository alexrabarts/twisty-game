/**
 * The dialog stack (js/modals.js): only the top dialog is interactive, every dialog opened is the topmost, keys go
 * to the top dialog alone, and closing the top one gives back the one below and the focus it had.
 *
 * The invariant is checked after every operation of a seeded random walk over open, close, keys and removals, so a
 * sequence nobody wrote down by hand is held to it too.
 */
import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';

(0, eval)(readFileSync(new URL('../../js/modals.js', import.meta.url), 'utf8'));

const press = (code, target = document.activeElement || document.body) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true }));

// A dialog with buttons; `keys` maps a button label to its data-key
function dialog(id, keys = {}) {
    const element = document.createElement('div');
    element.id = id;
    Object.entries(keys).forEach(([label, key]) => {
        const button = document.createElement('button');
        button.textContent = label;
        button.id = `${id}-${label}`;
        if (key) button.dataset.key = key;
        button.onclick = jest.fn();
        element.appendChild(button);
    });
    return element;
}

// What must hold after any operation
function expectInvariant() {
    const open = [...document.querySelectorAll('[data-modal]')];
    const live = open.filter(el => !el.closest('[inert]'));
    expect(open).toHaveLength(Modals.stack.length);
    if (!Modals.stack.length) return;
    const top = Modals.top().element;
    // One interactive dialog, and it is the top
    expect(live).toEqual([top]);
    // It is above every other dialog in z-order
    const z = el => Number(el.style.zIndex);
    open.filter(el => el !== top).forEach(el => expect(z(el)).toBeLessThan(z(top)));
    // Every dialog below is inert
    Modals.stack.slice(0, -1).forEach(entry => expect(entry.element.hasAttribute('inert')).toBe(true));
    // Focus is inside the top
    expect(top.contains(document.activeElement)).toBe(true);
}

describe('Modals', () => {
    let ride;
    beforeEach(() => {
        document.body.innerHTML = '<button id="outside">outside</button>';
        ride = jest.fn();
        // What the ride listens for (js/input.js), in the bubble phase on document
        document.addEventListener('keydown', ride);
    });
    afterEach(() => {
        document.removeEventListener('keydown', ride);
        Modals.reset();
    });

    test('a dialog opened on another is on top in z-order and input, and the one below is inert and hidden', () => {
        const crash = Modals.open(dialog('crash', { menu: 'KeyM' }));
        const confirm = Modals.open(dialog('confirm', { yes: 'Enter', cancel: 'Escape' }));
        expect(Number(confirm.style.zIndex)).toBeGreaterThan(Number(crash.style.zIndex));
        expect(crash.hasAttribute('inert')).toBe(true);
        expect(crash.dataset.modalUnder).toBe('hide');
        expect(confirm.hasAttribute('inert')).toBe(false);
        expect(document.activeElement).toBe(confirm.querySelector('button'));
        expectInvariant();
    });

    test('a key goes to the top dialog alone: a key of a dialog below does nothing, and the ride hears none', () => {
        const crash = Modals.open(dialog('crash', { menu: 'KeyM' }));
        Modals.open(dialog('confirm', { yes: 'Enter', cancel: 'Escape' }));
        press('KeyM');
        expect(crash.querySelector('button').onclick).not.toHaveBeenCalled();
        press('KeyW');
        expect(ride).not.toHaveBeenCalled();
    });

    test('a data-key clicks its button, Enter clicks the focused button, Escape clicks the Escape button', () => {
        const box = Modals.open(dialog('confirm', { yes: 'Enter', cancel: 'Escape', other: 'KeyO' }));
        const [yes, cancel, other] = box.querySelectorAll('button');
        press('KeyO');
        expect(other.onclick).toHaveBeenCalledTimes(1);
        other.focus();
        press('Enter');
        expect(other.onclick).toHaveBeenCalledTimes(2);
        expect(yes.onclick).not.toHaveBeenCalled();
        press('Escape');
        expect(cancel.onclick).toHaveBeenCalledTimes(1);
    });

    test('closing the top gives back the dialog below, interactive and visible, with focus on what opened the top', () => {
        const crash = Modals.open(dialog('crash', { checkpoint: 'KeyC', menu: 'KeyM' }));
        const menu = crash.querySelector('#crash-menu');
        menu.focus();
        const confirm = Modals.open(dialog('confirm', { yes: 'Enter', cancel: 'Escape' }));
        Modals.close(confirm);
        expect(confirm.isConnected).toBe(false);
        expect(crash.hasAttribute('inert')).toBe(false);
        expect(crash.dataset.modalUnder).toBeUndefined();
        expect(document.activeElement).toBe(menu);
        expectInvariant();
        press('KeyM');
        expect(menu.onclick).toHaveBeenCalledTimes(1);
    });

    test('a dialog removed by other code leaves the stack and the one below comes back', () => {
        const pause = Modals.open(dialog('pause', { resume: 'KeyP' }));
        const credits = Modals.open(dialog('credits', { close: 'Escape' }));
        credits.remove();
        press('KeyP');
        expect(pause.querySelector('button').onclick).toHaveBeenCalledTimes(1);
        expectInvariant();
    });

    test('Escape calls cancel when given, and a dialog with neither cancel nor an Escape button stays', () => {
        const cancel = jest.fn();
        Modals.open(dialog('menu', { start: '' }), { cancel });
        press('Escape');
        expect(cancel).toHaveBeenCalledTimes(1);
        Modals.reset();
        const crash = Modals.open(dialog('crash', { restart: 'KeyR' }));
        press('Escape');
        expect(Modals.isTop(crash)).toBe(true);
    });

    test('onKey hears the keys no button answers; typing in a field of the top dialog reaches the field', () => {
        const onKey = jest.fn(() => true);
        const entry = dialog('entry', { cancel: 'Escape' });
        const field = document.createElement('input');
        entry.prepend(field);
        Modals.open(entry, { onKey, focus: field, keep: true });
        const typed = jest.fn();
        field.addEventListener('keydown', typed);
        press('KeyA', field);
        expect(typed).toHaveBeenCalledTimes(1);
        expect(onKey).not.toHaveBeenCalled();
        entry.querySelector('button').focus();
        press('ArrowLeft');
        expect(onKey).toHaveBeenCalledTimes(1);
        // keep: the page's own dialog stays in the page when it closes
        Modals.close(entry);
        expect(entry.isConnected).toBe(true);
        expect(entry.dataset.modal).toBeUndefined();
    });

    test('Tab stays inside the top dialog', () => {
        const box = Modals.open(dialog('confirm', { yes: 'Enter', cancel: 'Escape' }));
        const [yes, cancel] = box.querySelectorAll('button');
        expect(document.activeElement).toBe(yes);
        press('Tab');
        expect(document.activeElement).toBe(cancel);
        press('Tab');
        expect(document.activeElement).toBe(yes);
    });

    test('a hidden button does not answer its key', () => {
        const box = Modals.open(dialog('entry', { cancel: 'Escape', close: 'Escape' }));
        const [cancel, close] = box.querySelectorAll('button');
        cancel.style.display = 'none';
        press('Escape');
        expect(cancel.onclick).not.toHaveBeenCalled();
        expect(close.onclick).toHaveBeenCalledTimes(1);
    });

    test('every sequence of opens, closes, removals and keys keeps one interactive dialog on top', () => {
        let seed = 7;
        const random = () => {
            seed = (seed * 1103515245 + 12345) & 0x7fffffff;
            return seed / 0x7fffffff;
        };
        let made = 0;
        for (let step = 0; step < 600; step++) {
            const roll = random();
            const open = Modals.stack.map(entry => entry.element);
            if (roll < 0.4 || !open.length) {
                const box = dialog(`d${made++}`, { a: 'KeyA', b: 'KeyB', x: 'Escape' });
                box.querySelector('[data-key="Escape"]').onclick = () => Modals.close(box);
                Modals.open(box, { under: random() < 0.3 ? 'show' : 'hide' });
            } else if (roll < 0.6) {
                Modals.close(open[open.length - 1]);
            } else if (roll < 0.7) {
                // A dialog below the top closes (a restart takes the crash dialog away under a confirm)
                Modals.close(open[Math.floor(random() * open.length)]);
            } else if (roll < 0.8) {
                open[Math.floor(random() * open.length)].remove();
                Modals.prune();
            } else {
                const top = Modals.top().element;
                const below = open.slice(0, -1).flatMap(el => [...el.querySelectorAll('button')]);
                const before = below.map(b => b.onclick.mock ? b.onclick.mock.calls.length : 0);
                press(['KeyA', 'KeyB', 'Escape', 'KeyW'][Math.floor(random() * 4)]);
                // No key reached a dialog below the top
                below.forEach((b, i) => expect(b.onclick.mock ? b.onclick.mock.calls.length : 0).toBe(before[i]));
                expect(top.isConnected || !Modals.isOpen(top)).toBe(true);
            }
            expectInvariant();
        }
        expect(ride).not.toHaveBeenCalled();
    });
});
