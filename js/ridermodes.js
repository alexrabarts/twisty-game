// RiderModes: the rider modes of the bike, as a real bike has them. One table (RiderModes.MODES): a mode is a row with
// its name, a line for the menu, the hairpin assist level it rides with (a key of WorldPhysics.assistLevels) and its
// multipliers over the tuning's ids (js/tuning.js, Tuning.PARAMS). A new mode is one row: no code names a mode.
//
// The mode in force reaches the physics two ways and no other: Tuning.setMode(row.tune), which every tuned number
// reads, and WorldAssist.setLevel(row.assist). The mode whose multipliers are all 1 (DEFAULT) is the bike as it is
// with no mode at all, to the last bit. A mode never flags the ride: every mode rides for the one board.
//
// The choice is free on the menu. In a ride it changes only while the bike stands (canChange): the key (STEP_KEY)
// and the pause panel's control ask the same rule.
const RiderModes = {
    KEY: 'twistyRiderMode',
    // The hairpin assist had a setting of its own under this key. It is read once, then removed (migrate)
    OLD_KEY: 'twistyHairpinAssist',
    DEFAULT: 'road',
    // Steps to the next mode, on the menu, in a ride and on the pause panel
    STEP_KEY: 'KeyH',
    // m/s, under this the bike stands. A world's bike with a foot down is at 0; the bound lets a last creep through
    STOP_SPEED: 0.5,
    LOCKED_TEXT: 'Stop the bike to change the rider mode',

    // `tone` colours the HUD's tag (css/ui.css .hud-mode[data-tone]); `tune` holds only what is off 1
    MODES: [
        {
            id: 'rain', name: 'Rain', tone: 'info', assist: 'normal',
            hint: 'The gentlest bike: less power, a soft throttle, slower steering, full hairpin assist',
            tune: { topSpeed: 0.85, accel: 0.8, throttle: 0.7, brake: 0.9, steerRate: 0.9, steerKey: 1.15, wheeliePop: 0.6, wheelieLift: 0.6, lowside: 1.1 }
        },
        {
            id: 'road', name: 'Road', tone: '', assist: 'normal',
            hint: 'The bike as it is, with full hairpin assist',
            tune: {}
        },
        {
            id: 'sport', name: 'Sport', tone: 'warn', assist: 'low',
            hint: 'Quicker steering, a stronger brake, a sharper throttle, less hairpin assist',
            tune: { throttle: 1.25, brake: 1.08, brakeLean: 1.1, steerRate: 1.1, steerKey: 0.9 }
        },
        {
            id: 'track', name: 'Track', tone: 'bad', assist: 'off',
            hint: 'The sharpest steering and brake, more lean, no hairpin assist: the fastest, and the hardest to ride',
            tune: { throttle: 1.5, brake: 1.15, brakeLean: 1.2, steerRate: 1.2, steerKey: 0.8, leanMax: 1.04 }
        }
    ],

    // The id of the mode in force; null before the page starts is the default
    current: null,
    storage: null,
    // A line for the menu, once, on the page where an old assist setting other than the full one was moved
    note: null,
    listeners: [],

    row(id) {
        return RiderModes.MODES.find(mode => mode.id === id) || null;
    },

    // The mode in force
    get() {
        return RiderModes.row(RiderModes.current) || RiderModes.row(RiderModes.DEFAULT);
    },

    // The page starts: the stored choice, else an old assist setting moved over once, else the default
    start({ storage = null } = {}) {
        RiderModes.storage = storage;
        RiderModes.note = null;
        let stored = null;
        try {
            stored = storage ? storage.getItem(RiderModes.KEY) : null;
        } catch (error) {
            console.warn('RiderModes: the stored mode could not be read:', error);
        }
        if (!RiderModes.row(stored)) stored = RiderModes.migrate();
        RiderModes.current = RiderModes.row(stored) ? stored : RiderModes.DEFAULT;
        RiderModes.apply();
        return RiderModes.get();
    },

    // An old assist setting becomes the default mode, whatever its level: that mode is the only one with the bike the
    // rider knows. A level other than the default mode's own changes what the rider had, so the menu says it once.
    // The mode is stored and the old key removed, so this happens on one page load only
    migrate() {
        const storage = RiderModes.storage;
        if (!storage) return null;
        let old = null;
        try {
            old = storage.getItem(RiderModes.OLD_KEY);
        } catch (error) {
            console.warn('RiderModes: the old assist setting could not be read:', error);
            return null;
        }
        if (old === null || old === undefined) return null;
        const to = RiderModes.row(RiderModes.DEFAULT);
        if (old !== to.assist) RiderModes.note = `The hairpin assist is now part of the rider mode. You ride in ${to.name}: choose another mode for more or less of it.`;
        try {
            storage.setItem(RiderModes.KEY, to.id);
            if (typeof storage.removeItem === 'function') storage.removeItem(RiderModes.OLD_KEY);
        } catch (error) {
            console.warn('RiderModes: the mode could not be stored:', error);
        }
        return to.id;
    },

    // Chooses a mode, stores it and tells the listeners. An unknown id changes nothing. Whether the bike stands is
    // the caller's question (canChange): the menu chooses freely
    set(id) {
        const mode = RiderModes.row(id);
        if (!mode) return RiderModes.get();
        RiderModes.current = mode.id;
        try {
            if (RiderModes.storage) RiderModes.storage.setItem(RiderModes.KEY, mode.id);
        } catch (error) {
            console.warn('RiderModes: the mode could not be stored, it holds for this page only:', error);
        }
        RiderModes.apply();
        for (const listener of RiderModes.listeners) listener(mode);
        return mode;
    },

    // The mode after the one in force, round the table
    next() {
        const modes = RiderModes.MODES;
        return modes[(modes.indexOf(RiderModes.get()) + 1) % modes.length];
    },

    // Hands the mode in force to the physics
    apply() {
        const mode = RiderModes.get();
        if (typeof Tuning !== 'undefined') Tuning.setMode(mode.tune);
        if (typeof WorldAssist !== 'undefined') WorldAssist.setLevel(mode.assist);
    },

    // The one rule of a change in a ride: the bike stands
    canChange(speed) {
        return !(Math.abs(speed) >= RiderModes.STOP_SPEED);
    },

    // The key in a ride: the next mode when the bike stands. { changed, mode }
    step(speed) {
        if (!RiderModes.canChange(speed)) return { changed: false, mode: RiderModes.get() };
        return { changed: true, mode: RiderModes.set(RiderModes.next().id) };
    },

    watch(listener) {
        RiderModes.listeners.push(listener);
    },

    // The control of the menu and of the pause panel: a button for each mode and a line under them (the mode's own
    // line; with `locked`, why it cannot change now). The button of the next mode carries the step key as its
    // `data-key`, so the dialog stack (js/modals.js) steps the mode for the dialog on top. `after` runs after a choice
    control(doc, { locked = false, after = null } = {}) {
        const box = doc.createElement('div');
        box.className = 'mode-picker';
        box.dataset.modePicker = '';
        const label = doc.createElement('div');
        label.className = 'mode-picker-label';
        label.textContent = `Rider mode (${RiderModes.STEP_KEY.replace('Key', '')})`;
        const row = doc.createElement('div');
        row.className = 'mode-picker-row';
        row.setAttribute('role', 'radiogroup');
        row.setAttribute('aria-label', 'Rider mode');
        const line = doc.createElement('div');
        line.className = 'mode-picker-hint';
        const buttons = RiderModes.MODES.map((mode) => {
            const button = doc.createElement('button');
            button.type = 'button';
            button.className = 'mode-btn';
            button.dataset.mode = mode.id;
            if (mode.tone) button.dataset.tone = mode.tone;
            button.setAttribute('role', 'radio');
            button.textContent = mode.name;
            button.disabled = locked;
            button.addEventListener('click', (event) => {
                event.stopPropagation();
                if (locked) return;
                RiderModes.set(mode.id);
                RiderModes.refresh(doc);
                if (after) after(mode);
            });
            row.appendChild(button);
            return button;
        });
        box.refresh = () => {
            const mode = RiderModes.get(), next = RiderModes.next();
            for (const button of buttons) {
                const on = button.dataset.mode === mode.id;
                button.classList.toggle('on', on);
                button.setAttribute('aria-checked', on ? 'true' : 'false');
                if (!locked && button.dataset.mode === next.id) button.dataset.key = RiderModes.STEP_KEY;
                else delete button.dataset.key;
            }
            line.textContent = locked ? RiderModes.LOCKED_TEXT : mode.hint;
            line.classList.toggle('locked', locked);
        };
        box.append(label, row, line);
        box.refresh();
        return box;
    },

    // Every control on the page shows the mode in force
    refresh(doc) {
        doc.querySelectorAll('[data-mode-picker]').forEach(box => box.refresh && box.refresh());
    }
};
