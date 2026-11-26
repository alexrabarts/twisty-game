// Fast travel in free roam: a dialog of the places a ride can go to (FreeRoam.destinations: the start, every open
// stopping place, the summit), each a button with how far it is along the ride from the bike. It opens through the
// dialog stack (js/modals.js): from the pause panel's Travel button, or with KEY while riding. The first nine are
// keys 1 to 9; Escape cancels. Picking one calls `go(destination)`; the game puts the bike there (Game.travelTo).
const FastTravel = {
    KEY: 'KeyG',

    // How far a destination is from the bike along the ride, for its button (British English)
    distance(fromS, toS) {
        const d = toS - fromS;
        if (Math.abs(d) < 50) return 'here';
        const km = Math.abs(d) / 1000;
        return `${km < 10 ? km.toFixed(1) : Math.round(km)} km ${d > 0 ? 'on' : 'back'}`;
    },

    // The dialog: `list` the destinations, `s` the bike's distance along the ride, `go` and `cancel` what a pick and
    // Escape do. Returns the dialog element (open on the stack)
    show(doc, list, s, go, cancel) {
        FastTravel.hide(doc);
        const box = doc.createElement('div');
        box.id = 'fast-travel';
        box.className = 'fast-travel panel';
        box.setAttribute('aria-label', 'Travel');
        const title = doc.createElement('p');
        title.className = 'world-pause-title';
        title.textContent = 'Travel to';
        box.appendChild(title);
        const items = doc.createElement('div');
        items.className = 'fast-travel-list';
        list.forEach((dest, k) => {
            const button = doc.createElement('button');
            button.type = 'button';
            button.className = 'btn fast-travel-btn';
            button.dataset.travel = dest.id;
            if (k < 9) button.dataset.key = `Digit${k + 1}`;
            const name = doc.createElement('span');
            name.textContent = k < 9 ? `${k + 1}  ${dest.name}` : dest.name;
            const far = doc.createElement('span');
            far.className = 'fast-travel-far';
            far.textContent = FastTravel.distance(s, dest.s);
            button.append(name, far);
            button.addEventListener('click', (event) => {
                event.stopPropagation();
                go(dest);
            });
            items.appendChild(button);
        });
        box.appendChild(items);
        const back = doc.createElement('button');
        back.type = 'button';
        back.className = 'btn';
        back.dataset.key = 'Escape';
        back.textContent = 'Back (Esc)';
        back.addEventListener('click', (event) => {
            event.stopPropagation();
            cancel();
        });
        box.appendChild(back);
        // (the nearest place ahead is focused first: Enter takes the rider on)
        const ahead = list.findIndex(dest => dest.s > s + 50);
        const first = items.children[ahead >= 0 ? ahead : 0];
        Modals.open(box, { cancel, focus: first });
        return box;
    },

    hide(doc) {
        const old = doc.getElementById('fast-travel');
        if (old) Modals.close(old);
    }
};

if (typeof module !== 'undefined' && module.exports) module.exports = { FastTravel };
