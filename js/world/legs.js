// WorldLegs: the legs of the real-map world on the menu, in the order they are ridden, grouped by pass. A leg is a
// stage of a data folder (WorldData.baseFor). The list is the tour's (js/world/tour.js): a new leg is one row there,
// and the dialog groups the rows by `pass` and scrolls.
//
// Which legs are open: the first leg always; a leg whose `opensAfter` names a leg the rider has finished; a leg with
// `open: true` (the Tremola, which every rider could ride before the new legs came, so it is never locked again);
// and every leg in debug mode. Finished legs are kept in localStorage (STORE), and the saved progress of the classic
// legs is not read or changed. A world leg's board id is `world-<id>-v<version>` (tools/world/encode.mjs): adding a
// leg changes no other leg's board.
const WorldLegs = {
    STORE: 'twistyWorldLegs',

    // The tour's legs in ride order (js/world/tour.js), then the legs shipped before it. A leg of the tour opens after
    // the built leg before it; a row not built yet is listed, closed (`planned`)
    get LIST() {
        if (WorldLegs.cached) return WorldLegs.cached;
        let before = null;
        const tour = WorldTour.LEGS.map(leg => {
            if (!leg.folder) return { id: `tour-${leg.n}`, n: leg.n, pass: leg.pass, name: leg.name, km: leg.km, note: 'Not built yet.', from: '', to: '', planned: true };
            const row = { id: leg.id, n: leg.n, pass: leg.pass, name: leg.name, km: leg.km, note: leg.note, from: leg.from, to: leg.to, ...(before ? { opensAfter: before } : {}) };
            before = leg.id;
            return row;
        });
        WorldLegs.cached = Object.freeze([...tour, ...WorldTour.EARLIER.map(leg => ({ id: leg.id, pass: leg.pass, name: leg.name, km: leg.km, note: leg.note, from: leg.from, to: leg.to, open: true }))].map(Object.freeze));
        return WorldLegs.cached;
    },

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
        if (leg.planned) return false;
        if (unlockAll || leg.open || leg === WorldLegs.LIST[0]) return true;
        return !!leg.opensAfter && WorldLegs.finished(storage).includes(leg.opensAfter);
    },

    // The leg the menu offers first: the first open leg not yet finished, else the first leg
    suggested(options = {}) {
        const done = WorldLegs.finished(options.storage === undefined ? WorldLegs.storage() : options.storage);
        const next = WorldLegs.LIST.find(leg => WorldLegs.isOpen(leg.id, options) && !done.includes(leg.id));
        return (next || WorldLegs.LIST[0]).id;
    },

    // The rows grouped by pass: a group is a run of rows with one pass (the tour comes back over the Gotthard at its end)
    groups() {
        const out = [];
        for (const leg of WorldLegs.LIST) {
            let group = out[out.length - 1];
            if (!group || group.pass !== leg.pass) out.push(group = { pass: leg.pass, legs: [] });
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
                const label = leg.n ? `${leg.n}. ` : '';
                const state = leg.planned ? 'Coming later' : !open ? `Finish leg ${WorldLegs.find(leg.opensAfter).n} to open` : done.includes(leg.id) ? 'Finished' : '';
                const ends = leg.from ? `<span class="world-legs-meta">From ${leg.from.charAt(0).toLowerCase()}${leg.from.slice(1)} to ${leg.to.charAt(0).toLowerCase()}${leg.to.slice(1)}</span>` : '';
                row.innerHTML = `<span class="world-legs-name">${label}${leg.name}</span><span class="world-legs-meta">${leg.km.toFixed(1)} km · ${leg.note}</span>${ends}${state ? `<span class="world-legs-state">${state}</span>` : ''}`;
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
