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
        // Free roam's start, shown when free roam is chosen
        const starts = doc.createElement('div');
        starts.className = 'mode-picker-row game-start-row';
        starts.setAttribute('role', 'radiogroup');
        starts.setAttribute('aria-label', 'Start at');
        const startButtons = GameModes.STARTS.map((start) => {
            const button = doc.createElement('button');
            button.type = 'button';
            button.className = 'mode-btn';
            button.dataset.gameStart = start.id;
            button.setAttribute('role', 'radio');
            button.textContent = start.name.toUpperCase();
            button.addEventListener('click', (event) => {
                event.stopPropagation();
                GameModes.startAt = start.id;
                box.refresh();
                if (after) after(start);
            });
            starts.appendChild(button);
            return button;
        });
        // And with the group or alone
        const groups = doc.createElement('div');
        groups.className = 'mode-picker-row game-group-row';
        groups.setAttribute('role', 'radiogroup');
        groups.setAttribute('aria-label', 'Ride with');
        const groupButtons = GameModes.GROUPS.map((group) => {
            const button = doc.createElement('button');
            button.type = 'button';
            button.className = 'mode-btn';
            button.dataset.gameGroup = group.id;
            button.setAttribute('role', 'radio');
            button.textContent = group.name.toUpperCase();
            button.addEventListener('click', (event) => {
                event.stopPropagation();
                GameModes.group = group.id;
                box.refresh();
                if (after) after(group);
            });
            groups.appendChild(button);
            return button;
        });
        box.refresh = () => {
            groups.hidden = GameModes.chosen !== 'roam';
            for (const button of groupButtons) {
                const on = button.dataset.gameGroup === GameModes.group;
                button.classList.toggle('on', on);
                button.setAttribute('aria-checked', on ? 'true' : 'false');
            }
            const mode = GameModes.MODES.find(m => m.id === GameModes.chosen) || GameModes.MODES[0];
            starts.hidden = mode.id !== 'roam';
            for (const button of startButtons) {
                const on = button.dataset.gameStart === GameModes.startAt;
                button.classList.toggle('on', on);
                button.setAttribute('aria-checked', on ? 'true' : 'false');
            }
            for (const button of buttons) {
                const on = button.dataset.gameMode === mode.id;
                button.classList.toggle('on', on);
                button.setAttribute('aria-checked', on ? 'true' : 'false');
            }
            const locked = GameModes.MODES.some(m => !GameModes.open(m.id, debug));
            line.textContent = locked && mode.id === 'trial' ? `${mode.hint} ${GameModes.LOCKED_TEXT}` : mode.hint;
        };
        box.append(label, row, starts, groups, line);
        box.refresh();
        return box;
    }
};

if (typeof module !== 'undefined' && module.exports) module.exports = { GameModes };
