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
        box.refresh = () => {
            const mode = GameModes.MODES.find(m => m.id === GameModes.chosen) || GameModes.MODES[0];
            for (const button of buttons) {
                const on = button.dataset.gameMode === mode.id;
                button.classList.toggle('on', on);
                button.setAttribute('aria-checked', on ? 'true' : 'false');
            }
            const locked = GameModes.MODES.some(m => !GameModes.open(m.id, debug));
            line.textContent = locked && mode.id === 'trial' ? `${mode.hint} ${GameModes.LOCKED_TEXT}` : mode.hint;
        };
        box.append(label, row, line);
        box.refresh();
        return box;
    }
};

if (typeof module !== 'undefined' && module.exports) module.exports = { GameModes };
