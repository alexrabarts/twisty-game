// SettingsDialog: the game's settings in one dialog, opened from the menu's rider screen and from the pause panel,
// through the dialog stack (js/modals.js: no key listener or z-index of its own). Its sections are built from data:
//   Graphics  the presets (Effects.PRESETS) and one row for each effect (Effects.LIST), from js/effects.js
//   Sound     one row for each of Sound.SETTINGS (js/sound.js) where that table is defined; empty without it
// Every change is applied at once and kept (the graphics in localStorage by EffectSettings, the sound by its manager).
//
// The game registers what the dialog works on with SettingsDialog.connect(control):
//   settings      the EffectSettings in force
//   apply()       puts a changed choice in force (the ladder's level and every effect)
//   inForce()     the level in force of each effect ({id: level}), which Auto may hold below the choice
//   supported(e)  whether the renderer can draw effect e
//   sound()       the sound manager (getSetting, setSetting), or null
const SettingsDialog = {
    // O on the pause panel and the menu opens it, and closes it again
    KEY: 'KeyO',
    control: null,

    connect(control) {
        SettingsDialog.control = control;
    },

    // A Settings button for a menu or a panel
    button(className, label = 'SETTINGS') {
        const button = document.createElement('button');
        button.className = className;
        button.dataset.settings = 'open';
        button.dataset.key = SettingsDialog.KEY;
        button.textContent = label;
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            SettingsDialog.open();
        });
        return button;
    },

    open() {
        SettingsDialog.close();
        const control = SettingsDialog.control;
        const panel = document.createElement('div');
        panel.id = 'settings';
        panel.className = 'settings';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', 'Settings');
        const box = document.createElement('div');
        box.className = 'settings-box panel';
        const title = document.createElement('h2');
        title.textContent = 'Settings';
        box.appendChild(title);
        box.appendChild(SettingsDialog.graphics(control));
        box.appendChild(SettingsDialog.sound(control));
        const actions = document.createElement('div');
        actions.className = 'settings-actions';
        const reset = document.createElement('button');
        reset.className = 'btn';
        reset.dataset.settingsDefault = '';
        reset.textContent = 'Default';
        reset.title = 'Auto, and every effect at its default';
        reset.addEventListener('click', (event) => {
            event.stopPropagation();
            if (!control) return;
            control.settings.reset();
            control.apply();
            SettingsDialog.refresh(panel);
        });
        const close = document.createElement('button');
        close.className = 'btn btn-primary';
        close.dataset.settingsClose = '';
        close.dataset.key = `Escape,${SettingsDialog.KEY}`;
        close.textContent = 'Close';
        close.addEventListener('click', (event) => { event.stopPropagation(); SettingsDialog.close(); });
        actions.append(reset, close);
        box.appendChild(actions);
        panel.appendChild(box);
        panel.addEventListener('click', (event) => { if (event.target === panel) SettingsDialog.close(); });
        Modals.open(panel, { focus: close });
        SettingsDialog.refresh(panel);
        return panel;
    },

    close() {
        if (SettingsDialog.unwatch) {
            SettingsDialog.unwatch();
            SettingsDialog.unwatch = null;
        }
        const old = document.getElementById('settings');
        if (old) Modals.close(old);
    },

    section(name, heading) {
        const section = document.createElement('section');
        section.className = 'settings-section';
        section.dataset.section = name;
        const h = document.createElement('h3');
        h.textContent = heading;
        section.appendChild(h);
        return section;
    },

    // A row of buttons, one per choice: [{value, label}], `pick(value)` on a click
    choices(name, label, options, pick, note = '') {
        const row = document.createElement('div');
        row.className = 'settings-row';
        const head = document.createElement('div');
        head.className = 'settings-label';
        const text = document.createElement('span');
        text.textContent = label;
        head.appendChild(text);
        if (note) {
            const cost = document.createElement('span');
            cost.className = 'settings-cost';
            cost.textContent = note;
            head.appendChild(cost);
        }
        const buttons = document.createElement('div');
        buttons.className = 'mode-picker-row settings-buttons';
        buttons.setAttribute('role', 'radiogroup');
        buttons.setAttribute('aria-label', label);
        for (const option of options) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'mode-btn';
            button.dataset[name] = option.value;
            button.dataset.value = option.value;
            button.setAttribute('role', 'radio');
            button.textContent = option.label;
            button.addEventListener('click', (event) => {
                event.stopPropagation();
                pick(option.value);
                SettingsDialog.refresh(document.getElementById('settings'));
            });
            buttons.appendChild(button);
        }
        const hint = document.createElement('div');
        hint.className = 'settings-hint';
        row.append(head, buttons, hint);
        return row;
    },

    graphics(control) {
        const section = SettingsDialog.section('graphics', 'Graphics');
        if (!control || typeof Effects === 'undefined') return section;
        const presets = SettingsDialog.choices('preset', 'Preset', Effects.PRESETS.map(p => ({ value: p.id, label: p.label })), (id) => {
            control.settings.setPreset(id);
            control.apply();
        });
        presets.dataset.presetRow = '';
        section.appendChild(presets);
        for (const effect of Effects.LIST) {
            const costs = effect.levels.slice(1).map(level => Effects.costOf(effect, level));
            const most = Math.max(...costs);
            const note = most >= 0.05 ? `about ${most.toFixed(1)} ms` : 'free';
            const row = SettingsDialog.choices('level', effect.name, effect.levels.map(level => ({ value: level, label: Effects.LABELS[level] })), (level) => {
                control.settings.set(effect.id, level);
                control.apply();
            }, note);
            row.dataset.effect = effect.id;
            row.title = effect.hint;
            section.appendChild(row);
        }
        return section;
    },

    // The sound's rows from its own table, when the sound engine has one (Sound.SETTINGS: id, label, kind 'slider' or
    // 'toggle', default; a slider's range [least, most], step and ends, the words at its two ends); the section is
    // hidden without it. A change made elsewhere (the M key's mute) shows while the dialog is open (watchSettings)
    sound(control) {
        const section = SettingsDialog.section('sound', 'Sound');
        const rows = typeof Sound !== 'undefined' && Array.isArray(Sound.SETTINGS) ? Sound.SETTINGS : [];
        const manager = control && control.sound ? control.sound() : null;
        section.hidden = !rows.length || !manager;
        if (section.hidden) return section;
        const read = row => {
            try {
                const value = manager.getSetting(row.id);
                return value === undefined ? row.default : value;
            } catch (error) {
                console.warn(`Settings: the sound setting ${row.id} could not be read:`, error);
                return row.default;
            }
        };
        const write = (row, value) => {
            try {
                manager.setSetting(row.id, value);
            } catch (error) {
                console.error(`Settings: the sound setting ${row.id} could not be set:`, error);
            }
        };
        for (const row of rows) {
            if (row.kind === 'toggle') {
                const line = SettingsDialog.choices('sound', row.label, [{ value: 'off', label: 'Off' }, { value: 'on', label: 'On' }], value => write(row, value === 'on'));
                line.dataset.soundSetting = row.id;
                line.dataset.kind = 'toggle';
                line.read = () => (read(row) ? 'on' : 'off');
                section.appendChild(line);
                continue;
            }
            const range = Array.isArray(row.range) ? { min: row.range[0], max: row.range[1] } : (row.range || {});
            const min = Number.isFinite(range.min) ? range.min : Number.isFinite(row.min) ? row.min : 0;
            const max = Number.isFinite(range.max) ? range.max : Number.isFinite(row.max) ? row.max : 1;
            const step = Number.isFinite(row.step) ? row.step : Number.isFinite(range.step) ? range.step : (max - min) / 100;
            const line = document.createElement('div');
            line.className = 'settings-row';
            line.dataset.soundSetting = row.id;
            line.dataset.kind = 'slider';
            const head = document.createElement('label');
            head.className = 'settings-label';
            const text = document.createElement('span');
            text.textContent = row.label;
            const shown = document.createElement('span');
            shown.className = 'settings-cost';
            head.append(text, shown);
            const slider = document.createElement('input');
            slider.type = 'range';
            slider.className = 'settings-slider';
            slider.min = String(min);
            slider.max = String(max);
            slider.step = String(step);
            slider.setAttribute('aria-label', row.label);
            // A slider with named ends (the balance) says how far toward each; any other its share in per cent
            const ends = Array.isArray(row.ends) && row.ends.length === 2 ? row.ends : null;
            const show = () => {
                const share = (Number(slider.value) - min) / ((max - min) || 1);
                shown.textContent = ends ? `${ends[0]} ${Math.round((1 - share) * 100)} : ${Math.round(share * 100)} ${ends[1]}` : `${Math.round(share * 100)}%`;
            };
            slider.addEventListener('input', () => { write(row, Number(slider.value)); show(); });
            line.read = () => { slider.value = String(read(row)); show(); };
            head.htmlFor = slider.id = `settings-sound-${row.id}`;
            line.append(head, slider);
            section.appendChild(line);
        }
        if (typeof manager.watchSettings === 'function') {
            SettingsDialog.unwatch = manager.watchSettings(() => SettingsDialog.refresh(document.getElementById('settings')));
        }
        return section;
    },

    // Every row shows the choice in force, and an effect that Auto holds below the choice says so
    refresh(panel) {
        const control = SettingsDialog.control;
        if (!panel || !control) return;
        const mark = (row, value) => row.querySelectorAll('.mode-btn').forEach(button => {
            const on = button.dataset.value === value;
            button.classList.toggle('on', on);
            button.setAttribute('aria-checked', on ? 'true' : 'false');
        });
        const presetRow = panel.querySelector('[data-preset-row]');
        if (presetRow) {
            mark(presetRow, control.settings.preset);
            const preset = Effects.preset(control.settings.preset);
            presetRow.querySelector('.settings-hint').textContent = preset ? preset.hint : '';
        }
        const inForce = control.inForce();
        panel.querySelectorAll('[data-effect]').forEach(row => {
            const effect = Effects.byId(row.dataset.effect);
            const chosen = control.settings.chosen[effect.id];
            const can = control.supported(effect);
            mark(row, chosen);
            row.querySelectorAll('.mode-btn').forEach(button => { button.disabled = !can; });
            const hint = row.querySelector('.settings-hint');
            hint.classList.toggle('held', can && inForce[effect.id] !== chosen);
            if (!can) hint.textContent = 'Not available on this screen';
            else if (inForce[effect.id] !== chosen) hint.textContent = `Auto holds it at ${Effects.LABELS[inForce[effect.id]]} to keep the frame rate`;
            else hint.textContent = '';
        });
        panel.querySelectorAll('[data-sound-setting]').forEach(row => {
            if (!row.read) return;
            const value = row.read();
            if (row.dataset.kind === 'toggle') mark(row, value);
        });
    }
};

if (typeof window !== 'undefined') window.SettingsDialog = SettingsDialog;
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SettingsDialog };
}
