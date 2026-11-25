// WorldLegs: the legs of the real-map world on the menu, in the order they are ridden, grouped by pass. A leg is a
// stage of an import (its data folder: WorldData.baseFor). The list scales: a new leg is one row of LIST, and the
// dialog groups the rows by `pass` and scrolls.
//
// Which legs are open: the first leg always; a leg whose `opensAfter` names a leg the rider has finished; a leg with
// `open: true` (the Tremola, which every rider could ride before the new legs came, so it is never locked again);
// and every leg in debug mode. Finished legs are kept in localStorage (STORE), and the saved progress of the classic
// legs is not read or changed. A world leg's board id is `world-<id>-v<version>` (tools/world/encode.mjs): adding a
// leg changes no other leg's board.
const WorldLegs = {
    STORE: 'twistyWorldLegs',

    LIST: [
        { id: 'gotthard-north', pass: 'Gotthard', name: 'Andermatt to the Gotthard summit', km: 11.6, note: 'A gentle run-in from the north. No hairpins.', from: 'A hotel car park in Andermatt', to: 'The hospice square at the summit' },
        { id: 'gotthard-lookout', pass: 'Gotthard', name: 'The summit to the lookout over Airolo', km: 2.9, note: 'Down the modern pass road, through the galleries.', from: 'The hospice square at the summit', to: 'The lookout over Airolo', opensAfter: 'gotthard-north' },
        { id: 'tremola', pass: 'Gotthard', name: 'Tremola, Airolo to the Gotthard summit', km: 13.2, note: 'The old cobbled road and its hairpins.', from: 'Airolo', to: 'The Gotthard summit', open: true }
    ],

    find(id) { return WorldLegs.LIST.find(leg => leg.id === id) || null; },

    // The ids the rider has finished, from the store (an empty list when the store cannot be read)
    finished(storage = WorldLegs.storage()) {
        try {
            const list = JSON.parse((storage && storage.getItem(WorldLegs.STORE)) || '[]');
            return Array.isArray(list) ? list.filter(id => typeof id === 'string') : [];
        } catch (error) {
            console.warn(`world legs: progress unreadable (${error.message}); starting from leg 1`);
            return [];
        }
    },

    // Records a finished leg (a time trial that crossed its finish line)
    markFinished(id, storage = WorldLegs.storage()) {
        if (!WorldLegs.find(id) || !storage) return false;
        const done = WorldLegs.finished(storage);
        if (done.includes(id)) return false;
        try {
            storage.setItem(WorldLegs.STORE, JSON.stringify([...done, id]));
        } catch (error) {
            console.warn(`world legs: progress not saved (${error.message})`);
            return false;
        }
        return true;
    },

    isOpen(id, { unlockAll = false, storage = WorldLegs.storage() } = {}) {
        const leg = WorldLegs.find(id);
        if (!leg) return false;
        if (unlockAll || leg.open || leg === WorldLegs.LIST[0]) return true;
        return !!leg.opensAfter && WorldLegs.finished(storage).includes(leg.opensAfter);
    },

    // The leg the menu offers first: the first open leg not yet finished, else the first leg
    suggested(options = {}) {
        const done = WorldLegs.finished(options.storage === undefined ? WorldLegs.storage() : options.storage);
        const next = WorldLegs.LIST.find(leg => WorldLegs.isOpen(leg.id, options) && !done.includes(leg.id));
        return (next || WorldLegs.LIST[0]).id;
    },

    // The rows grouped by pass, in the order of their first leg
    groups() {
        const out = [];
        for (const leg of WorldLegs.LIST) {
            let group = out.find(g => g.pass === leg.pass);
            if (!group) out.push(group = { pass: leg.pass, legs: [] });
            group.legs.push(leg);
        }
        return out;
    },

    storage() {
        try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (error) { return null; }
    },

    // The leg list over the menu (js/modals.js). onPick(id) rides the leg; Escape goes back to the rider screen.
    open(doc, { onPick, onBack = null, unlockAll = false } = {}) {
        WorldLegs.close(doc);
        const panel = doc.createElement('div');
        panel.id = 'world-legs';
        panel.className = 'world-legs';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', 'Choose a leg');
        const box = doc.createElement('div');
        box.className = 'world-legs-box panel';
        const title = doc.createElement('h2');
        title.textContent = 'Choose a leg';
        box.appendChild(title);
        const list = doc.createElement('div');
        list.className = 'world-legs-list';
        const done = WorldLegs.finished();
        const first = WorldLegs.suggested({ unlockAll });
        let focus = null;
        for (const group of WorldLegs.groups()) {
            const heading = doc.createElement('div');
            heading.className = 'world-legs-pass';
            heading.textContent = group.pass;
            list.appendChild(heading);
            group.legs.forEach(leg => {
                const open = WorldLegs.isOpen(leg.id, { unlockAll });
                const row = doc.createElement('button');
                row.className = 'world-legs-row';
                row.dataset.leg = leg.id;
                row.disabled = !open;
                const order = WorldLegs.LIST.indexOf(leg) + 1;
                const state = !open ? `Finish leg ${WorldLegs.LIST.indexOf(WorldLegs.find(leg.opensAfter)) + 1} to open` : done.includes(leg.id) ? 'Finished' : '';
                row.innerHTML = `<span class="world-legs-name">${order}. ${leg.name}</span><span class="world-legs-meta">${leg.km.toFixed(1)} km · ${leg.note}</span><span class="world-legs-meta">From ${leg.from.charAt(0).toLowerCase()}${leg.from.slice(1)} to ${leg.to.charAt(0).toLowerCase()}${leg.to.slice(1)}</span>${state ? `<span class="world-legs-state">${state}</span>` : ''}`;
                row.addEventListener('click', (event) => {
                    event.stopPropagation();
                    if (row.disabled) return;
                    WorldLegs.close(doc);
                    if (onPick) onPick(leg.id);
                });
                if (leg.id === first) focus = row;
                list.appendChild(row);
            });
        }
        box.appendChild(list);
        const back = doc.createElement('button');
        back.className = 'btn world-legs-back';
        back.dataset.key = 'Escape';
        back.textContent = 'Back';
        back.addEventListener('click', (event) => {
            event.stopPropagation();
            WorldLegs.close(doc);
            if (onBack) onBack();
        });
        box.appendChild(back);
        panel.appendChild(box);
        // Up and down move between the open legs
        const onKey = (event) => {
            const isUp = event.code === 'ArrowUp' || event.code === 'KeyW';
            const isDown = event.code === 'ArrowDown' || event.code === 'KeyS';
            if (!isUp && !isDown) return false;
            event.preventDefault();
            const rows = [...list.querySelectorAll('.world-legs-row:not([disabled])')];
            const at = rows.indexOf(doc.activeElement);
            const next = rows[Math.max(0, Math.min(rows.length - 1, (at < 0 ? 0 : at) + (isDown ? 1 : -1)))];
            if (next) next.focus({ preventScroll: false });
            return true;
        };
        Modals.open(panel, { focus, onKey });
        return panel;
    },

    close(doc) {
        const old = doc && doc.getElementById('world-legs');
        if (old) Modals.close(old);
    }
};
