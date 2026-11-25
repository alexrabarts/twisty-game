// GameModes: how a world is ridden, chosen on the rider screen (TourSystem) or named in the address (RideMode
// `mode=roam`, read in js/ridemode.js alone).
//   trial  the timed ride of the world: stations, splits, the finish, the cut and off-route rules (as it always was)
//   roam   free roam: no clock, no stations, no rules of the ride, any drawn road, the camera behind the rider, turned
//          back at the edge of the map (FreeRoam). Locked for now, open only in debug mode (Game.debugEnabled)
const GameModes = {
    MODES: Object.freeze([
        Object.freeze({ id: 'trial', name: 'Time trial', hint: 'The timed ride: checkpoints, splits and the finish.' }),
        Object.freeze({ id: 'roam', name: 'Free roam', hint: 'Ride any road, no clock. Debug mode only for now.', locked: true })
    ]),
    LOCKED_TEXT: 'Free roam: coming later.',

    // The mode chosen on this page ('trial' until the rider picks another)
    chosen: 'trial',

    // Where a free-roam ride starts (FreeRoam.startFor): the start, a stopping place, the summit
    STARTS: Object.freeze([
        Object.freeze({ id: 'start', name: 'Start' }),
        Object.freeze({ id: 'place', name: 'Stopping place' }),
        Object.freeze({ id: 'summit', name: 'Summit' })
    ]),
    startAt: 'start',

    // Free roam with the group (the player leads: Traffic.roam, GROUP.roam) or alone
    GROUPS: Object.freeze([
        Object.freeze({ id: 'with', name: 'With the group' }),
        Object.freeze({ id: 'alone', name: 'Alone' })
    ]),
    group: 'with',

    // Free roam's time of day and weather (WorldLooks.fixed): 'stage' keeps the world's own look along the ride
    TIMES: Object.freeze([
        Object.freeze({ id: 'stage', name: 'As the road' }),
        Object.freeze({ id: 'dawn', name: 'Dawn' }),
        Object.freeze({ id: 'day', name: 'Day' }),
        Object.freeze({ id: 'sunset', name: 'Sunset' }),
        Object.freeze({ id: 'night', name: 'Night' })
    ]),
    time: 'stage',
    WEATHERS: Object.freeze([
        Object.freeze({ id: 'stage', name: 'As the road' }),
        Object.freeze({ id: 'clear', name: 'Clear' }),
        Object.freeze({ id: 'fog', name: 'Fog' }),
        Object.freeze({ id: 'rain', name: 'Rain' })
    ]),
    weather: 'stage',

    // Whether a mode may be chosen: free roam only in debug mode
    open(id, debug) {
        const mode = GameModes.MODES.find(m => m.id === id);
        return !!mode && (!mode.locked || !!debug);
    },

    // The mode a world ride runs in: the one the address names, else the one chosen on the menu; a locked one is a
    // time trial
    active(rideMode, debug) {
        const wanted = rideMode && rideMode.mode === 'roam' ? 'roam' : GameModes.chosen;
        return GameModes.open(wanted, debug) ? wanted : 'trial';
    },

    // The row of the rider screen: a radio button for each mode, the locked one shown with its lock and the note.
    // `after` runs on a choice (the focus goes back to the primary button, so Enter still rides)
    control(doc, { debug = false, after = null, icon = () => '' } = {}) {
        const box = doc.createElement('div');
        box.className = 'mode-picker game-mode-picker';
        box.dataset.gameModePicker = '';
        const label = doc.createElement('div');
        label.className = 'mode-picker-label';
        label.textContent = 'Game mode';
        const row = doc.createElement('div');
        row.className = 'mode-picker-row';
        row.setAttribute('role', 'radiogroup');
        row.setAttribute('aria-label', 'Game mode');
        const line = doc.createElement('div');
        line.className = 'mode-picker-hint';
        const buttons = GameModes.MODES.map((mode) => {
            const button = doc.createElement('button');
            button.type = 'button';
            button.className = 'mode-btn';
            button.dataset.gameMode = mode.id;
            button.setAttribute('role', 'radio');
            const open = GameModes.open(mode.id, debug);
            button.innerHTML = `${open ? '' : `${icon('lock')} `}${mode.name.toUpperCase()}`;
            button.disabled = !open;
            if (!open) button.title = GameModes.LOCKED_TEXT;
            button.addEventListener('click', (event) => {
                event.stopPropagation();
                if (!GameModes.open(mode.id, debug)) return;
                GameModes.chosen = mode.id;
                box.refresh();
                if (after) after(mode);
            });
            row.appendChild(button);
            return button;
        });
        // Free roam's own rows, shown when free roam is chosen: where it starts, with whom, the time of day, the weather
        const rows = [
            { list: GameModes.STARTS, key: 'startAt', data: 'gameStart', cls: 'game-start-row', label: 'Start at' },
            { list: GameModes.GROUPS, key: 'group', data: 'gameGroup', cls: 'game-group-row', label: 'Ride with' },
            { list: GameModes.TIMES, key: 'time', data: 'gameTime', cls: 'game-time-row', label: 'Time of day' },
            { list: GameModes.WEATHERS, key: 'weather', data: 'gameWeather', cls: 'game-weather-row', label: 'Weather' }
        ].map((spec) => {
            const element = doc.createElement('div');
            element.className = `mode-picker-row ${spec.cls}`;
            element.setAttribute('role', 'radiogroup');
            element.setAttribute('aria-label', spec.label);
            const buttons = spec.list.map((item) => {
                const button = doc.createElement('button');
                button.type = 'button';
                button.className = 'mode-btn';
                button.dataset[spec.data] = item.id;
                button.setAttribute('role', 'radio');
                button.textContent = item.name.toUpperCase();
                button.addEventListener('click', (event) => {
                    event.stopPropagation();
                    GameModes[spec.key] = item.id;
                    box.refresh();
                    if (after) after(item);
                });
                element.appendChild(button);
                return button;
            });
            return { spec, element, buttons };
        });
        box.refresh = () => {
            const mode = GameModes.MODES.find(m => m.id === GameModes.chosen) || GameModes.MODES[0];
            for (const { spec, element, buttons: own } of rows) {
                element.hidden = mode.id !== 'roam';
                for (const button of own) {
                    const on = button.dataset[spec.data] === GameModes[spec.key];
                    button.classList.toggle('on', on);
                    button.setAttribute('aria-checked', on ? 'true' : 'false');
                }
            }
            for (const button of buttons) {
                const on = button.dataset.gameMode === mode.id;
                button.classList.toggle('on', on);
                button.setAttribute('aria-checked', on ? 'true' : 'false');
            }
            const locked = GameModes.MODES.some(m => !GameModes.open(m.id, debug));
            line.textContent = locked && mode.id === 'trial' ? `${mode.hint} ${GameModes.LOCKED_TEXT}` : mode.hint;
        };
        box.append(label, row, ...rows.map(r => r.element), line);
        box.refresh();
        return box;
    }
};

if (typeof module !== 'undefined' && module.exports) module.exports = { GameModes };
