// The tuning panel of debug mode: a slider for each row of Tuning.PARAMS (js/tuning.js), each a multiplier on the
// default. Game builds it only in debug mode (Game.startTuning); outside it this class is never constructed.
//
// It is not a dialog (js/modals.js): the ride goes on while it is open, so the rider tunes while riding. For that it
// must never hold the keyboard. Its sliders and buttons take no focus (a focused control would swallow the ride keys:
// InputHandler ignores keys typed into an input, and Space on a focused button clicks it), so the sliders are drawn
// tracks moved with the pointer, not <input type="range">. The only key it reads is its own toggle, T, and not while a
// dialog is open: the dialog stack owns the keys then. The read-only text box alone can be focused, to select its text
// by hand where the clipboard is refused; closing the panel gives the focus back.
class TuningPanel {
    static get KEY() { return 'KeyT'; }

    // options: `world()` says whether the ride is a world ride (the rows only a world reads are dimmed on a leg);
    // `clipboard()` returns the clipboard to write to (navigator.clipboard by default)
    constructor(doc, tuning, options = {}) {
        this.doc = doc;
        this.tuning = tuning;
        this.world = options.world || (() => true);
        this.clipboard = options.clipboard || (() => (typeof navigator !== 'undefined' ? navigator.clipboard : null));
        this.rows = {};
        this.build();
        this.onKey = (event) => {
            if (event.code !== TuningPanel.KEY || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
            // Typing a leaderboard name must not open it
            const target = event.target;
            if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName) && !target.readOnly) return;
            if (typeof Modals !== 'undefined' && Modals.top && Modals.top()) return;
            this.toggle();
        };
        doc.addEventListener('keydown', this.onKey);
        this.refresh();
    }

    make(tag, className, text) {
        const el = this.doc.createElement(tag);
        if (className) el.className = className;
        if (text !== undefined) el.textContent = text;
        return el;
    }

    build() {
        const { doc, tuning } = this;
        // The small button that opens it: the only way in on touch
        this.button = this.make('button', 'tuning-open', 'T · Tune');
        this.button.type = 'button';
        this.button.id = 'tuningOpen';
        this.button.setAttribute('aria-expanded', 'false');
        this.button.addEventListener('click', () => this.toggle());

        this.el = this.make('aside', 'tuning-panel panel');
        this.el.id = 'tuningPanel';
        this.el.hidden = true;
        this.el.setAttribute('aria-label', 'Tuning');
        const head = this.make('div', 'tuning-head');
        const shut = this.make('button', 'tuning-step tuning-shut', '×');
        shut.type = 'button';
        shut.dataset.act = 'close';
        shut.setAttribute('aria-label', 'Close the tuning panel');
        shut.addEventListener('click', () => this.hide());
        head.append(this.make('b', '', 'Tuning'), this.make('span', '', '× the default · T closes'), shut);
        this.el.appendChild(head);

        const list = this.make('div', 'tuning-rows');
        let group = null;
        for (const row of tuning.PARAMS) {
            if (row.group !== group) {
                group = row.group;
                list.appendChild(this.make('h3', 'tuning-group', group));
            }
            list.appendChild(this.buildRow(row));
        }
        this.el.appendChild(list);

        const buttons = this.make('div', 'tuning-buttons');
        const reset = this.make('button', 'tuning-button', 'Reset');
        reset.type = 'button';
        reset.dataset.act = 'reset';
        reset.addEventListener('click', () => {
            tuning.reset();
            this.say('All back to 1.00. This ride keeps no time.');
            this.refresh();
        });
        const copy = this.make('button', 'tuning-button', 'Copy values');
        copy.type = 'button';
        copy.dataset.act = 'copy';
        copy.addEventListener('click', () => this.copy());
        buttons.append(reset, copy);
        this.el.appendChild(buttons);

        this.status = this.make('p', 'tuning-status');
        this.status.setAttribute('aria-live', 'polite');
        this.el.appendChild(this.status);
        this.text = this.make('textarea', 'tuning-text');
        this.text.readOnly = true;
        this.text.rows = 4;
        this.text.setAttribute('aria-label', 'The changed values, as copied');
        this.el.appendChild(this.text);

        // Nothing here takes the focus from the ride but the text box
        for (const root of [this.el, this.button]) {
            root.addEventListener('mousedown', (event) => {
                if (event.target !== this.text) event.preventDefault();
            });
        }
        doc.body.append(this.button, this.el);
    }

    buildRow(row) {
        const el = this.make('div', 'tuning-row');
        el.dataset.id = row.id;
        if (row.world) el.dataset.world = '1';
        const label = this.make('span', 'tuning-label', row.label);
        label.title = `${row.hint}. ` + row.scales.map(target => `${target.on}.${target.field}${target.inverse ? ' (divided)' : ''}`).join(', ') + (row.world ? ' · a world ride only' : '');
        const less = this.make('button', 'tuning-step', '−');
        const more = this.make('button', 'tuning-step', '+');
        less.type = more.type = 'button';
        less.setAttribute('aria-label', `${row.label}: less`);
        more.setAttribute('aria-label', `${row.label}: more`);
        less.addEventListener('click', () => this.set(row.id, this.tuning.get(row.id) - row.step));
        more.addEventListener('click', () => this.set(row.id, this.tuning.get(row.id) + row.step));

        const track = this.make('div', 'tuning-slider');
        track.setAttribute('role', 'slider');
        track.setAttribute('aria-label', row.label);
        track.setAttribute('aria-valuemin', String(row.min));
        track.setAttribute('aria-valuemax', String(row.max));
        const fill = this.make('i', 'tuning-fill');
        const one = this.make('b', 'tuning-one');
        one.style.left = `${(1 - row.min) / (row.max - row.min) * 100}%`;
        track.append(fill, one);
        const at = (event) => {
            const box = track.getBoundingClientRect();
            const share = box.width > 0 ? Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)) : 0;
            this.set(row.id, row.min + share * (row.max - row.min));
        };
        track.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            this.dragging = row.id;
            try {
                track.setPointerCapture(event.pointerId);
            } catch (error) {
                // No capture (an old browser, a synthetic event): the drag ends when the pointer leaves the track
            }
            at(event);
        });
        track.addEventListener('pointermove', (event) => {
            if (this.dragging === row.id) at(event);
        });
        const end = () => {
            if (this.dragging === row.id) this.dragging = null;
        };
        track.addEventListener('pointerup', end);
        track.addEventListener('pointercancel', end);

        const value = this.make('output', 'tuning-value', '1.00');
        value.title = 'Double-click: back to 1.00';
        value.addEventListener('dblclick', () => this.set(row.id, 1));
        el.append(label, less, track, more, value);
        this.rows[row.id] = { el, track, fill, value, row };
        return el;
    }

    set(id, value) {
        this.tuning.set(id, value);
        this.say('');
        this.refresh();
    }

    say(text) {
        this.status.textContent = text;
    }

    // Writes every row and the text box from the tuning's values
    refresh() {
        for (const { el, track, fill, value, row } of Object.values(this.rows)) {
            const m = this.tuning.get(row.id);
            const shown = m.toFixed(2);
            if (value.textContent !== shown) value.textContent = shown;
            fill.style.width = `${(m - row.min) / (row.max - row.min) * 100}%`;
            track.setAttribute('aria-valuenow', shown);
            if (m === 1) delete el.dataset.changed;
            else el.dataset.changed = '1';
        }
        this.text.value = this.tuning.text();
        this.el.dataset.ride = this.world() ? 'world' : 'legs';
    }

    // The changed values to the clipboard. The text box holds the same text, for when the clipboard is refused
    copy() {
        const text = this.tuning.text();
        this.text.value = text;
        const failed = (error) => {
            // The older way, from the text box itself; the focus it takes goes straight back to the ride
            if (this.copyFromBox()) {
                this.say('Copied.');
                return true;
            }
            console.warn('Tuning: the clipboard refused the text:', error);
            this.say('The clipboard refused it: select the text below.');
            return false;
        };
        let clipboard = null;
        try {
            clipboard = this.clipboard();
        } catch (error) {
            return Promise.resolve(failed(error));
        }
        if (!clipboard || typeof clipboard.writeText !== 'function') return Promise.resolve(failed(new Error('no clipboard')));
        return Promise.resolve().then(() => clipboard.writeText(text)).then(() => {
            this.say('Copied.');
            return true;
        }, failed);
    }

    // document.execCommand('copy') on the selected text box: true when the browser took it
    copyFromBox() {
        const { doc, text } = this;
        if (typeof doc.execCommand !== 'function') return false;
        let done = false;
        try {
            text.focus();
            text.select();
            done = doc.execCommand('copy');
        } catch (error) {
            done = false;
        }
        text.setSelectionRange(0, 0);
        text.blur();
        return !!done;
    }

    get open() {
        return !this.el.hidden;
    }

    toggle() {
        if (this.open) this.hide();
        else this.show();
        return this.open;
    }

    show() {
        this.refresh();
        this.el.hidden = false;
        this.button.setAttribute('aria-expanded', 'true');
        this.doc.body.classList.add('tuning-on');
    }

    hide() {
        // The text box may hold the focus: the ride gets it back
        if (this.el.contains(this.doc.activeElement)) this.doc.activeElement.blur();
        this.dragging = null;
        this.el.hidden = true;
        this.button.setAttribute('aria-expanded', 'false');
        this.doc.body.classList.remove('tuning-on');
    }
}
