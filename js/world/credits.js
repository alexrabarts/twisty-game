// WorldCredits: the data credit of the streamed world, in a Credits panel the rider opens from the main menu, from
// the pause panel of a world ride, and on the world's loading screen. It is not on screen while a world rides.
//
// Neither licence fixes where the credit stands (.agent/system/world-data.md): swisstopo asks that a source
// reference is attached to a representation or publication, and Copernicus WorldDEM-30 that the public is told the
// source with its notice. The panel shows manifest.credit and manifest.notice, so the text is the data's own.
const WorldCredits = {
    // What the panel shows before a manifest is read (the leg menu loads no world)
    FALLBACK: '© swisstopo',

    // The credit and notice of the world in play, or of the shipped world/manifest.json
    async text(environment = null) {
        const manifest = environment && environment.data ? environment.data.manifest : await WorldCredits.manifest();
        return { credit: (manifest && manifest.credit) || WorldCredits.FALLBACK, notice: (manifest && manifest.notice) || '' };
    },

    async manifest() {
        if (WorldCredits.cached) return WorldCredits.cached;
        try {
            const response = await fetch('world/manifest.json');
            if (!response.ok) throw new Error(`status ${response.status}`);
            WorldCredits.cached = await response.json();
        } catch (error) {
            console.warn(`world credits: world/manifest.json unavailable (${error.message}); showing ${WorldCredits.FALLBACK}`);
            WorldCredits.cached = null;
        }
        return WorldCredits.cached;
    },

    // A Credits button for a menu: opens the panel over everything
    button(className, environment = null) {
        const button = document.createElement('button');
        button.className = className;
        button.dataset.credits = 'open';
        button.textContent = 'CREDITS';
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            WorldCredits.open(environment);
        });
        return button;
    },

    async open(environment = null) {
        WorldCredits.close();
        const panel = document.createElement('div');
        panel.id = 'world-credits';
        panel.className = 'world-credits';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', 'Credits');
        const box = document.createElement('div');
        box.className = 'world-credits-box panel';
        const title = document.createElement('h2');
        title.textContent = 'Credits';
        const intro = document.createElement('p');
        intro.textContent = 'The real-map world is built from:';
        const credit = document.createElement('p');
        credit.className = 'world-credits-credit';
        const notice = document.createElement('p');
        notice.className = 'world-credits-notice';
        const close = document.createElement('button');
        close.className = 'btn';
        close.dataset.key = 'Escape';
        close.textContent = 'Close';
        close.addEventListener('click', (event) => { event.stopPropagation(); WorldCredits.close(); });
        box.append(title, intro, credit, notice, close);
        panel.appendChild(box);
        panel.addEventListener('click', (event) => { if (event.target === panel) WorldCredits.close(); });
        // On top of the menu or the pause panel that opened it (js/modals.js)
        Modals.open(panel);
        const { credit: line, notice: more } = await WorldCredits.text(environment);
        credit.textContent = line;
        notice.textContent = more;
        notice.hidden = !more;
        return panel;
    },

    close() {
        const old = document.getElementById('world-credits');
        if (old) Modals.close(old);
    },

    // The pause panel of a ride: Resume, Restart leg (when `restart` is given: a world ride, whose crash opens no card
    // to offer it), Menu (when `menu` is given) and Credits, and on a world ride the hairpin assist. P and Escape
    // resume, R is Restart leg, M is Menu.
    showPause(environment, resume, menu = null, restart = null) {
        WorldCredits.hidePause();
        const panel = document.createElement('div');
        panel.id = 'world-pause';
        panel.className = 'world-pause panel';
        const title = document.createElement('p');
        title.className = 'world-pause-title';
        title.textContent = 'Paused';
        const go = document.createElement('button');
        go.className = 'btn btn-primary';
        go.dataset.resume = '';
        go.dataset.key = 'KeyP,Escape';
        go.textContent = 'Resume (P)';
        go.addEventListener('click', (event) => { event.stopPropagation(); resume(); });
        panel.append(title, go);
        if (restart) {
            const again = document.createElement('button');
            again.className = 'btn';
            again.dataset.restart = '';
            again.dataset.key = 'KeyR';
            again.innerHTML = '<u>R</u>estart leg';
            again.addEventListener('click', (event) => { event.stopPropagation(); restart(); });
            panel.appendChild(again);
        }
        if (menu) {
            const leave = document.createElement('button');
            leave.className = 'btn';
            leave.dataset.menu = '';
            leave.dataset.key = 'KeyM';
            leave.innerHTML = '<u>M</u>enu';
            leave.addEventListener('click', (event) => { event.stopPropagation(); menu(); });
            panel.appendChild(leave);
        }
        panel.appendChild(WorldCredits.button('btn', environment && environment.isWorld ? environment : null));
        // The hairpin assist level (js/world/run.js WorldAssist), a world ride's own
        if (environment && environment.isWorld && typeof WorldAssist !== 'undefined') {
            const assist = WorldAssist.pauseButton();
            // The stack gives keys to the top dialog alone, so the H the ride listens for is the button's here
            assist.dataset.key = 'KeyH';
            panel.appendChild(assist);
        }
        Modals.open(panel, { focus: go });
        return panel;
    },

    hidePause() {
        WorldCredits.close();
        const old = document.getElementById('world-pause');
        if (old) Modals.close(old);
    }
};
