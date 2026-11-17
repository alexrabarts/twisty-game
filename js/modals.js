// Modals: the one stack every dialog of the game goes through (the menu, crash, finish, pause, the world ride's
// confirm, credits, best times and the name entry). Before it, each dialog set its own z-index and listened for its
// own keys, so a dialog opened from another could land behind it: the world ride's "lose your ride?" confirm drew
// under the crash dialog, and its buttons could not be clicked.
//
// The rule it keeps: only the top dialog is interactive. Opening a dialog puts it on top in z-order and in input; the
// one below is made inert (and hidden, unless it asks to stay in view) until the top one closes. Every key goes to
// the top dialog alone: a button's `data-key` (comma-separated KeyboardEvent.code values) clicks it, Enter clicks the
// focused button, Escape cancels, Tab stays inside, and no other listener of the page hears the key. Focus moves into
// the dialog when it opens and goes back to where it was when it closes.
const Modals = {
    // Above the HUD, the touch controls, the run cards and the old overlays (css/ui.css --z-*), below the error box
    Z_BASE: 5000,
    stack: [],

    // options:
    //   cancel()  what Escape does; without it Escape clicks a visible button whose data-key holds Escape, and a
    //             dialog with neither (crash, finish) is not dismissed by it
    //   onKey(e)  keys the buttons do not answer (the menu's carousel); return true when handled
    //   focus     the element to focus first; else the first [data-focus], primary or enabled button, or input
    //   under     'hide' (default) hides the dialog while another is on it; 'show' keeps it in view, inert
    //   keep      true for a dialog that lives in the page (the name entry): close() leaves it in the DOM
    open(element, options = {}) {
        Modals.prune();
        Modals.listen();
        const existing = Modals.entry(element);
        if (existing) Modals.drop(existing);
        const below = Modals.top();
        if (below) Modals.cover(below);
        const entry = {
            element,
            cancel: options.cancel || null,
            onKey: options.onKey || null,
            under: options.under || 'hide',
            keep: !!options.keep,
            returnFocus: document.activeElement,
            zIndex: element.style.zIndex
        };
        Modals.stack.push(entry);
        element.dataset.modal = 'open';
        if (!element.getAttribute('role')) element.setAttribute('role', 'dialog');
        element.setAttribute('aria-modal', 'true');
        Modals.restack();
        if (!element.isConnected) document.body.appendChild(element);
        Modals.uncover(entry);
        Modals.focusInto(entry, options.focus);
        return element;
    },

    // Takes the dialog off the stack (and out of the page, unless it was opened with keep). The one below becomes the
    // top again, and focus goes back to where it was before the closed dialog opened.
    close(element) {
        const entry = Modals.entry(element);
        if (!entry) {
            if (element && element.isConnected && !element.dataset.modalKeep) element.remove();
            return false;
        }
        const wasTop = entry === Modals.top();
        Modals.drop(entry);
        if (!entry.keep) element.remove();
        Modals.prune();
        const top = Modals.top();
        if (top && wasTop) {
            Modals.uncover(top);
            const back = entry.returnFocus;
            if (back && back.isConnected && top.element.contains(back) && !back.disabled) back.focus({ preventScroll: true });
            else Modals.focusInto(top);
        } else if (!top && wasTop && entry.returnFocus && entry.returnFocus.isConnected && entry.returnFocus !== document.body) {
            entry.returnFocus.focus({ preventScroll: true });
        }
        return true;
    },

    top() {
        return Modals.stack[Modals.stack.length - 1] || null;
    },

    isOpen(element) {
        return !!Modals.entry(element);
    },

    isTop(element) {
        const top = Modals.top();
        return !!top && top.element === element;
    },

    entry(element) {
        return Modals.stack.find(entry => entry.element === element) || null;
    },

    // Every dialog, for a test or a page that starts over
    reset() {
        [...Modals.stack].reverse().forEach(entry => Modals.close(entry.element));
        Modals.stack = [];
    },

    // z-order follows the stack, so a dialog below that closed leaves no two dialogs at one level
    restack() {
        Modals.stack.forEach((entry, index) => { entry.element.style.zIndex = String(Modals.Z_BASE + index + 1); });
    },

    // Takes the entry off the stack and gives its element back its own z-index and attributes
    drop(entry) {
        Modals.stack = Modals.stack.filter(other => other !== entry);
        Modals.restack();
        const element = entry.element;
        element.style.zIndex = entry.zIndex;
        element.removeAttribute('aria-modal');
        element.removeAttribute('inert');
        delete element.dataset.modal;
        delete element.dataset.modalUnder;
    },

    // A dialog removed from the page by other code leaves the stack, and the one below it comes back
    prune() {
        let removed = false;
        Modals.stack.slice().forEach(entry => {
            if (!entry.element.isConnected && !entry.keep) {
                Modals.drop(entry);
                removed = true;
            }
        });
        if (removed && Modals.top()) {
            const top = Modals.top();
            Modals.uncover(top);
            if (!top.element.contains(document.activeElement)) Modals.focusInto(top);
        }
    },

    cover(entry) {
        entry.element.setAttribute('inert', '');
        entry.element.dataset.modalUnder = entry.under;
    },

    uncover(entry) {
        entry.element.removeAttribute('inert');
        delete entry.element.dataset.modalUnder;
    },

    // Shown inside its dialog: no ancestor up to the dialog hidden or out of the layout (the name entry keeps its
    // result and error screens in the page with display: none)
    shown(el, root) {
        for (let at = el; at && at !== root.parentNode; at = at.parentElement) {
            if (at.hidden) return false;
            const style = getComputedStyle(at);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
        }
        return true;
    },

    focusInto(entry, preferred = null) {
        const element = entry.element;
        const usable = el => el && !el.disabled && Modals.shown(el, element);
        const candidates = [
            preferred,
            element.querySelector('[data-focus]'),
            element.querySelector('.btn-primary:not([disabled]), .finish-btn.primary:not([disabled])'),
            ...element.querySelectorAll('button:not([disabled]), input:not([disabled])')
        ];
        const target = candidates.find(usable) || candidates.find(el => el && !el.disabled);
        if (target) {
            target.focus({ preventScroll: true });
        } else {
            if (!element.hasAttribute('tabindex')) element.setAttribute('tabindex', '-1');
            element.focus({ preventScroll: true });
        }
    },

    // The visible, enabled buttons of a dialog whose data-key holds `code`
    buttonFor(element, code) {
        return [...element.querySelectorAll('button[data-key]')].find(button =>
            !button.disabled && Modals.shown(button, element) && button.dataset.key.split(',').includes(code)) || null;
    },

    focusable(element) {
        return [...element.querySelectorAll('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])')]
            .filter(el => !el.disabled && Modals.shown(el, element));
    },

    // One listener, in the capture phase on window, so it hears every key before any other listener of the page
    listen() {
        if (Modals.listening || typeof window === 'undefined') return;
        Modals.listening = true;
        window.addEventListener('keydown', event => Modals.key(event), true);
    },

    key(event) {
        Modals.prune();
        const top = Modals.top();
        if (!top) return;
        const element = top.element;
        const target = event.target;
        const typing = target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) && element.contains(target);
        const stop = () => {
            event.preventDefault();
            event.stopPropagation();
        };

        if (event.code === 'Escape') {
            stop();
            if (event.repeat) return;
            if (top.cancel) top.cancel();
            else {
                const button = Modals.buttonFor(element, 'Escape');
                if (button) button.click();
            }
            return;
        }

        if (event.code === 'Tab') {
            const items = Modals.focusable(element);
            event.stopPropagation();
            if (!items.length) {
                event.preventDefault();
                return;
            }
            const at = items.indexOf(document.activeElement);
            const next = event.shiftKey ? (at <= 0 ? items.length - 1 : at - 1) : (at < 0 || at === items.length - 1 ? 0 : at + 1);
            event.preventDefault();
            items[next].focus({ preventScroll: true });
            return;
        }

        // Typing a name reaches the field and its own handlers; the game's keys ignore a field (js/input.js)
        if (typing) return;

        // Nothing below the top dialog hears a key: not the dialog under it, not the menu, not the ride
        event.stopPropagation();

        const active = document.activeElement;
        if ((event.code === 'Enter' || event.code === 'NumpadEnter') && active && active.tagName === 'BUTTON' && element.contains(active) && !active.disabled) {
            event.preventDefault();
            if (!event.repeat) active.click();
            return;
        }

        const button = Modals.buttonFor(element, event.code);
        if (button) {
            event.preventDefault();
            if (!event.repeat) button.click();
            return;
        }

        if (top.onKey && top.onKey(event)) event.preventDefault();
    }
};

if (typeof window !== 'undefined') window.Modals = Modals;
