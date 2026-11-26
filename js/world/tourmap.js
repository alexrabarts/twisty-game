// WorldMap: the menu's map of the tour, in place of a list of legs. It draws each leg of the tour (js/world/tour.js,
// through WorldLegs) as its road over a relief of the far land, and the places the map names (js/world/tourmap-data.js,
// written by tools/world/tourmap.mjs). Hovering a leg (or focusing its pin) shows it in the card under the map; a
// click chooses it, and a click on the chosen leg or RIDE rides it. The arrow keys step the legs and Enter rides,
// through the dialog stack (js/modals.js). Which legs are open is WorldLegs' rule, never this file's.
//
// A row added to the tour table shows on the map with no change here: its line comes from WorldMapData by the leg's
// number, and a leg with no line is listed beside the map. The legs shipped before the tour ride a tour leg's road the
// other way (EARLIER) and stand in the list beside the map.
const WorldMap = {
    // Where the best time of each leg is kept: { [leg id]: ms }
    STORE: 'twistyWorldBest',
    // Room round the lines and places (m), and more east and west, where the names stand beside their places
    MARGIN_M: 1500,
    NAME_ROOM_M: 2600,
    // A climb or a descent counts once the road has gone 10 m one way (noise in the height model is not climb)
    CLIMB_STEP_M: 10,
    // A tap this close to a line (px) chooses its leg
    HIT_PX: 18,
    // The relief is drawn once at this width (px) and scaled
    RELIEF_W: 720,
    // A map box narrower than this (a phone) draws the map this much wider than the box, and it pans
    PAN_BELOW_PX: 520,
    PAN_ZOOM: 1.7,

    // The legs shipped before the tour: the tour leg whose road they ride, and the way
    EARLIER: Object.freeze({
        'gotthard-north': Object.freeze({ n: 2, dir: -1 }),
        tremola: Object.freeze({ n: 12, dir: -1 })
    }),

    data() { return typeof WorldMapData !== 'undefined' ? WorldMapData : { legs: {}, places: [] }; },

    // The road of a leg of the menu's list in the order it is ridden ([x, z, y] points), or null
    lineOf(leg, data = WorldMap.data()) {
        const earlier = WorldMap.EARLIER[leg.id];
        const n = earlier ? earlier.n : leg.n;
        const line = n ? data.legs[n] : null;
        if (!line || line.length < 2) return null;
        return earlier && earlier.dir < 0 ? line.slice().reverse() : line;
    },

    // Metres up and down along a line, counted in steps of CLIMB_STEP_M
    climb(line) {
        let up = 0, down = 0;
        if (!line || !line.length) return { up, down };
        let anchor = line[0][2];
        for (const [, , y] of line) {
            if (y - anchor >= WorldMap.CLIMB_STEP_M) { up += y - anchor; anchor = y; }
            else if (anchor - y >= WorldMap.CLIMB_STEP_M) { down += anchor - y; anchor = y; }
        }
        return { up: Math.round(up), down: Math.round(down) };
    },

    length(line) {
        let total = 0;
        for (let i = 1; i < line.length; i++) total += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
        return total;
    },

    // The point `share` of the way along a line
    pointAt(line, share) {
        const goal = WorldMap.length(line) * share;
        let run = 0;
        for (let i = 1; i < line.length; i++) {
            const step = Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
            if (run + step >= goal && step > 0) {
                const t = (goal - run) / step;
                return { x: line[i - 1][0] + (line[i][0] - line[i - 1][0]) * t, z: line[i - 1][1] + (line[i][1] - line[i - 1][1]) * t };
            }
            run += step;
        }
        const last = line[line.length - 1];
        return { x: last[0], z: last[1] };
    },

    // The box the map shows: every line and place, and the margin
    box(data = WorldMap.data()) {
        let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
        const take = (x, z) => { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); };
        Object.values(data.legs).forEach(line => line.forEach(([x, z]) => take(x, z)));
        data.places.forEach(p => take(p.x, p.z));
        if (!Number.isFinite(x0)) return { x0: -1000, z0: -1000, x1: 1000, z1: 1000 };
        const m = WorldMap.MARGIN_M;
        const r = WorldMap.NAME_ROOM_M;
        return { x0: x0 - m - r, z0: z0 - m, x1: x1 + m + r, z1: z1 + m };
    },

    // The best time of a leg (ms), or null
    best(id, storage = WorldMap.storage()) {
        try {
            const all = JSON.parse((storage && storage.getItem(WorldMap.STORE)) || '{}');
            const ms = all && typeof all === 'object' ? all[id] : null;
            return Number.isFinite(ms) && ms > 0 ? ms : null;
        } catch (error) {
            console.warn(`world map: best times unreadable (${error.message})`);
            return null;
        }
    },

    // Keeps `ms` as the leg's best when it beats the one kept; true when it did
    recordBest(id, ms, storage = WorldMap.storage()) {
        if (!storage || !Number.isFinite(ms) || ms <= 0) return false;
        const old = WorldMap.best(id, storage);
        if (old !== null && old <= ms) return false;
        try {
            const all = JSON.parse(storage.getItem(WorldMap.STORE) || '{}');
            storage.setItem(WorldMap.STORE, JSON.stringify({ ...(all && typeof all === 'object' ? all : {}), [id]: Math.round(ms) }));
        } catch (error) {
            console.warn(`world map: best time not saved (${error.message})`);
            return false;
        }
        return true;
    },

    storage() {
        try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (error) { return null; }
    },

    // What the map shows of each row of the menu's list (WorldLegs.LIST), in the list's order: its line, climb, best
    // time, where its pin stands, and its state ('open', 'locked' or 'planned', and `done` once finished)
    entries({ unlockAll = false, storage = WorldMap.storage(), data = WorldMap.data() } = {}) {
        const done = WorldLegs.finished(storage);
        const entries = WorldLegs.LIST.map((leg) => {
            const line = WorldMap.lineOf(leg, data);
            const earlier = !!WorldMap.EARLIER[leg.id] || !leg.n;
            const open = WorldLegs.isOpen(leg.id, { unlockAll, storage });
            const state = leg.planned ? 'planned' : open ? 'open' : 'locked';
            return {
                id: leg.id, n: leg.n || null, pass: leg.pass, name: leg.name, km: leg.km, note: leg.planned ? '' : leg.note,
                from: leg.from, to: leg.to, state, done: done.includes(leg.id), earlier, line,
                ...WorldMap.climb(line), best: leg.planned ? null : WorldMap.best(leg.id, storage),
                after: leg.opensAfter ? (WorldLegs.find(leg.opensAfter) || {}).n || null : null
            };
        });
        WorldMap.placePins(entries.filter(e => e.line && !e.earlier), data);
        return entries;
    },

    // Each tour leg's pin: the point of its line (10% to 90% of the way) farthest from the other pins, and then from
    // the places named (a named road aside), so pins of legs that share a valley stand apart and off the names. Placed
    // in turn, then each placed again against all the others, three times: the first placed does not take the best room
    placePins(list, data) {
        const towns = data.places.filter(q => q.kind !== 'road');
        const shares = [];
        for (let k = 10; k <= 90; k += 5) shares.push(k);
        for (let round = 0; round < 4; round++) {
            for (const entry of list) {
                let pick = null, room = -Infinity;
                for (const k of shares) {
                    const p = WorldMap.pointAt(entry.line, k / 100);
                    const nearPin = list.reduce((d, o) => (o === entry || !o.pin ? d : Math.min(d, Math.hypot(p.x - o.pin.x, p.z - o.pin.z))), Infinity);
                    const nearTown = towns.reduce((d, q) => Math.min(d, Math.hypot(p.x - q.x, p.z - q.z)), Infinity);
                    // (room past 4 km from a pin, or 1.5 km from a name, is room enough; then the middle is preferred)
                    const score = Math.min(nearPin, 4000) + 0.5 * Math.min(nearTown, 1500) - Math.abs(k - 50) * 5;
                    if (score > room) { room = score; pick = p; }
                }
                entry.pin = pick;
            }
        }
    },

    // The id `delta` steps from `id` in the list's order (the arrow keys), held at the ends
    step(entries, id, delta) {
        const at = entries.findIndex(e => e.id === id);
        const to = Math.max(0, Math.min(entries.length - 1, (at < 0 ? 0 : at) + delta));
        return entries[to] ? entries[to].id : id;
    },

    // The leg whose line passes nearest the point (x, z), within `reach` metres; null when none does
    nearest(entries, x, z, reach) {
        let best = null, gap = reach;
        for (const entry of entries) {
            if (!entry.line || entry.earlier) continue;
            const line = entry.line;
            for (let i = 1; i < line.length; i++) {
                const [ax, az] = line[i - 1], [bx, bz] = line[i];
                const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz;
                const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2)) : 0;
                const d = Math.hypot(ax + dx * t - x, az + dz * t - z);
                if (d < gap) { gap = d; best = entry.id; }
            }
        }
        return best;
    },

    // The line as an SVG path in the map's frame (x east, z south: the SVG's own axes)
    path(line) {
        return line.map(([x, z], i) => `${i ? 'L' : 'M'}${Math.round(x)} ${Math.round(z)}`).join('');
    },

    climbText(m) { return `${Math.round(m).toLocaleString('en-GB')} m`; },

    timeText(ms) {
        if (ms === null || ms === undefined) return 'No time yet';
        if (typeof RaceTiming !== 'undefined' && RaceTiming.formatTime) return RaceTiming.formatTime(ms);
        const s = ms / 1000, m = Math.floor(s / 60);
        return `${m}:${(s - m * 60).toFixed(2).padStart(5, '0')}`;
    },

    // What RIDE says for a leg: the leg it rides, or why it is closed
    rideText(entry, roam = false) {
        if (entry.state === 'planned') return 'COMING LATER';
        if (entry.state === 'locked') return entry.after ? `FINISH LEG ${entry.after} TO OPEN` : 'NOT OPEN YET';
        if (roam) return 'ROAM →';
        return entry.n ? `RIDE LEG ${entry.n} →` : 'RIDE →';
    },

    stateText(entry, roam = false) {
        if (entry.state === 'planned') return 'Coming later';
        if (entry.state === 'locked') return entry.after ? `Finish leg ${entry.after} to open` : 'Not open yet';
        if (roam) return 'Free roam: no clock';
        return entry.done ? 'Finished' : 'Open';
    },

    // The relief: the far land of each data folder, the finest level that holds a point (the level of 250 m blended
    // into the level of 800 m over its last 2 km, so no edge shows)
    async loadGrids(fetcher = (url) => fetch(url)) {
        const folders = typeof WorldTour !== 'undefined' ? Object.keys(WorldTour.folders()) : ['world/'];
        const read = async (url) => {
            try {
                const response = await fetcher(url);
                if (!response.ok) return null;
                return WorldMap.parseGrid(await response.arrayBuffer());
            } catch (error) {
                console.warn(`world map: ${url} not read (${error.message})`);
                return null;
            }
        };
        const coarse = (await read(`${folders[0]}far/l2.bin`));
        const fine = (await Promise.all(folders.map(folder => read(`${folder}far/l1.bin`)))).filter(Boolean);
        return { coarse, fine };
    },

    // A far level's file: far.bin's 16 B header, Int16 metres, then 4 Uint8 shares per vertex (forest, rock, ice, known)
    parseGrid(buffer) {
        const view = new DataView(buffer);
        const nx = view.getUint16(8, true), nz = view.getUint16(10, true), cell = view.getUint16(12, true);
        if (!nx || !nz || buffer.byteLength < 16 + nx * nz * 6) return null;
        return {
            x0: view.getInt32(0, true) / 1000, z0: view.getInt32(4, true) / 1000, nx, nz, cell,
            heights: new Int16Array(buffer.slice(16, 16 + nx * nz * 2)),
            shares: new Uint8Array(buffer, 16 + nx * nz * 2, nx * nz * 4)
        };
    },

    // Height and shares at (x, z) from one grid, bilinear; null outside it or over no data
    sample(grid, x, z) {
        const gi = (x - grid.x0) / grid.cell, gj = (z - grid.z0) / grid.cell;
        if (gi < 0 || gj < 0 || gi > grid.nx - 1 || gj > grid.nz - 1) return null;
        const i = Math.min(grid.nx - 2, Math.floor(gi)), j = Math.min(grid.nz - 2, Math.floor(gj));
        const fx = gi - i, fz = gj - j;
        const at = [[i, j, (1 - fx) * (1 - fz)], [i + 1, j, fx * (1 - fz)], [i, j + 1, (1 - fx) * fz], [i + 1, j + 1, fx * fz]];
        let h = 0, f = 0, r = 0, c = 0, w = 0;
        for (const [a, b, k] of at) {
            const v = b * grid.nx + a, y = grid.heights[v];
            if (y === -32768) continue;
            h += y * k; f += grid.shares[v * 4] * k; r += grid.shares[v * 4 + 1] * k; c += grid.shares[v * 4 + 2] * k; w += k;
        }
        if (w < 0.25) return null;
        return { h: h / w, forest: f / w / 255, rock: r / w / 255, ice: c / w / 255 };
    },

    // How far (m) a point stands inside a grid's box
    inside(grid, x, z) {
        return Math.min(x - grid.x0, z - grid.z0, grid.x0 + (grid.nx - 1) * grid.cell - x, grid.z0 + (grid.nz - 1) * grid.cell - z);
    },

    at(grids, x, z) {
        const base = grids.coarse ? WorldMap.sample(grids.coarse, x, z) : null;
        let fine = null, depth = 0;
        for (const grid of grids.fine) {
            const d = WorldMap.inside(grid, x, z);
            if (d > depth) {
                const s = WorldMap.sample(grid, x, z);
                if (s) { fine = s; depth = d; }
            }
        }
        if (!fine) return base;
        if (!base) return fine;
        const k = Math.min(1, depth / 2000);
        const mix = key => base[key] * (1 - k) + fine[key] * k;
        return { h: mix('h'), forest: mix('forest'), rock: mix('rock'), ice: mix('ice') };
    },

    // The relief's pixels (RGBA, w x h) over `box`: the land's colour by its cover and height, shaded by a light from
    // the north-west, toned down so the roads read over it
    shade(grids, box, w, h) {
        const pixels = new Uint8ClampedArray(w * h * 4);
        const heights = new Float32Array(w * h);
        const cover = new Float32Array(w * h * 3);
        const sx = (box.x1 - box.x0) / w, sz = (box.z1 - box.z0) / h;
        let known = 0;
        for (let j = 0; j < h; j++) {
            for (let i = 0; i < w; i++) {
                const s = WorldMap.at(grids, box.x0 + (i + 0.5) * sx, box.z0 + (j + 0.5) * sz);
                const v = j * w + i;
                if (!s) { heights[v] = NaN; continue; }
                known++;
                heights[v] = s.h;
                cover[v * 3] = s.forest; cover[v * 3 + 1] = s.rock; cover[v * 3 + 2] = s.ice;
            }
        }
        // The far levels are 250 m and 800 m grids: drawn as they are, their cells show as facets. Two passes of a box
        // blur about a cell wide make the land read as land
        const radius = Math.max(1, Math.round(250 / sx));
        WorldMap.blur(heights, w, h, radius);
        WorldMap.blur(heights, w, h, radius);
        // (and the cover shares, whose cells would show as squares of ice and rock)
        for (let c = 0; c < 3; c++) {
            const share = new Float32Array(w * h);
            for (let v = 0; v < w * h; v++) share[v] = Number.isNaN(heights[v]) ? NaN : cover[v * 3 + c];
            WorldMap.blur(share, w, h, radius);
            WorldMap.blur(share, w, h, radius);
            for (let v = 0; v < w * h; v++) if (!Number.isNaN(share[v])) cover[v * 3 + c] = share[v];
        }
        const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
        const VALLEY = [92, 112, 74], ALP = [128, 128, 92], ROCK = [124, 118, 110], ICE = [226, 234, 240], FOREST = [52, 78, 50], NONE = [40, 48, 60];
        // The light: from the north-west (up the map, to the left), 45 degrees high
        const lx = -0.5, lz = -0.5, ly = 0.7071;
        for (let j = 0; j < h; j++) {
            for (let i = 0; i < w; i++) {
                const v = j * w + i, y = heights[v];
                let rgb;
                let light = 1;
                if (Number.isNaN(y)) rgb = NONE;
                else {
                    const left = heights[j * w + Math.max(0, i - 1)], right = heights[j * w + Math.min(w - 1, i + 1)];
                    const up = heights[Math.max(0, j - 1) * w + i], down = heights[Math.min(h - 1, j + 1) * w + i];
                    const dx = ((Number.isNaN(right) ? y : right) - (Number.isNaN(left) ? y : left)) / (2 * sx);
                    const dz = ((Number.isNaN(down) ? y : down) - (Number.isNaN(up) ? y : up)) / (2 * sz);
                    const n = Math.hypot(dx, 1, dz);
                    light = Math.max(0, (-dx * lx + ly - dz * lz) / n);
                    // Grass by height (the valleys greener), then forest, rock and ice by their shares
                    rgb = mix(VALLEY, ALP, Math.max(0, Math.min(1, (y - 900) / 1400)));
                    rgb = mix(rgb, FOREST, Math.min(1, cover[v * 3] * 1.2));
                    rgb = mix(rgb, ROCK, Math.min(1, cover[v * 3 + 1] * 0.9 + Math.max(0, (y - 2500) / 1200)));
                    rgb = mix(rgb, ICE, Math.min(0.85, cover[v * 3 + 2]));
                }
                // Toned to the menu's dark glass: a third of the colour's saturation goes, and it stays dim
                const grey = (rgb[0] + rgb[1] + rgb[2]) / 3;
                const k = 0.38 + 0.72 * light;
                pixels[v * 4] = (rgb[0] * 0.7 + grey * 0.3) * k * 0.78;
                pixels[v * 4 + 1] = (rgb[1] * 0.7 + grey * 0.3) * k * 0.8;
                pixels[v * 4 + 2] = (rgb[2] * 0.7 + grey * 0.3) * k * 0.86;
                pixels[v * 4 + 3] = 255;
            }
        }
        return { pixels, known };
    },

    // A box blur in place over a w x h field, `radius` pixels each way; NaN (no data) is left out of every mean
    blur(field, w, h, radius) {
        const out = new Float32Array(field.length);
        const pass = (src, dst, along) => {
            const n = along ? w : h, lines = along ? h : w;
            for (let l = 0; l < lines; l++) {
                for (let k = 0; k < n; k++) {
                    let sum = 0, count = 0;
                    for (let d = -radius; d <= radius; d++) {
                        const q = Math.max(0, Math.min(n - 1, k + d));
                        const v = src[along ? l * w + q : q * w + l];
                        if (!Number.isNaN(v)) { sum += v; count++; }
                    }
                    const at = along ? l * w + k : k * w + l;
                    dst[at] = Number.isNaN(src[at]) || !count ? src[at] : sum / count;
                }
            }
        };
        pass(field, out, true);
        pass(out, field, false);
        return field;
    },

    // The relief as an image URL, drawn once for the page (null without a canvas or any far land)
    relief(doc, box) {
        if (WorldMap.reliefUrl !== undefined) return Promise.resolve(WorldMap.reliefUrl);
        if (!WorldMap.reliefJob) {
            WorldMap.reliefJob = WorldMap.loadGrids().then((grids) => {
                if (!grids.coarse && !grids.fine.length) return null;
                const w = WorldMap.RELIEF_W, h = Math.round(w * (box.z1 - box.z0) / (box.x1 - box.x0));
                const canvas = doc.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const context = canvas.getContext && canvas.getContext('2d');
                if (!context) return null;
                const { pixels } = WorldMap.shade(grids, box, w, h);
                context.putImageData(new ImageData(pixels, w, h), 0, 0);
                return canvas.toDataURL('image/png');
            }).catch((error) => {
                console.warn(`world map: no relief (${error.message})`);
                return null;
            }).then((url) => {
                WorldMap.reliefUrl = url;
                return url;
            });
        }
        return WorldMap.reliefJob;
    },

    // The map over the menu (js/modals.js). onPick(id) rides the leg; Escape and Back go back to the rider screen
    open(doc, { onPick, onBack = null, unlockAll = false, roam = false } = {}) {
        WorldMap.close(doc);
        const entries = WorldMap.entries({ unlockAll });
        const byId = new Map(entries.map(e => [e.id, e]));
        const box = WorldMap.box();
        const W = box.x1 - box.x0, H = box.z1 - box.z0;
        const svgNs = 'http://www.w3.org/2000/svg';
        const el = (tag, cls, text) => {
            const node = doc.createElement(tag);
            if (cls) node.className = cls;
            if (text !== undefined) node.textContent = text;
            return node;
        };
        const svgEl = (tag, attrs = {}) => {
            const node = doc.createElementNS(svgNs, tag);
            Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
            return node;
        };

        const panel = el('div', 'world-legs home-map');
        panel.id = 'world-legs';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', 'Choose a leg');

        const head = el('div', 'map-head');
        const back = el('button', 'carousel-back map-back', '← RIDER');
        back.type = 'button';
        back.dataset.key = 'Escape';
        const title = el('h2', 'map-title', roam ? 'Choose where to roam' : 'Choose a leg');
        const tour = entries.filter(e => e.n);
        const built = tour.filter(e => e.state !== 'planned').length, finished = tour.filter(e => e.done).length;
        const count = el('div', 'map-count', `${built} of ${tour.length} legs built · ${finished} finished`);
        head.append(back, title, count);

        // The map: the relief and the lines in one SVG in metres, the pins and the names over it in the same frame
        const area = el('div', 'map-area');
        const frame = el('div', 'map-frame');
        frame.style.setProperty('--map-aspect', `${W} / ${H}`);
        const svg = svgEl('svg', { class: 'map-svg', viewBox: `${box.x0} ${box.z0} ${W} ${H}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
        const relief = svgEl('image', { class: 'map-relief', x: box.x0, y: box.z0, width: W, height: H, preserveAspectRatio: 'none' });
        svg.appendChild(relief);
        const lines = svgEl('g', { class: 'map-lines' });
        svg.appendChild(lines);
        const ends = svgEl('g', { class: 'map-ends' });
        svg.appendChild(ends);
        frame.appendChild(svg);
        const names = el('div', 'map-places');
        WorldMap.data().places.forEach((place) => {
            const left = `${((place.x - box.x0) / W) * 100}%`, top = `${((place.z - box.z0) / H) * 100}%`;
            // A pass is a peak mark, a town a dot; a named stretch of road (the Tremola, the Schöllenen) has none
            if (place.kind !== 'road') {
                const mark = el('span', `map-mark map-mark-${place.kind}`);
                mark.style.left = left;
                mark.style.top = top;
                names.appendChild(mark);
            }
            const label = el('span', `map-place map-place-${place.kind} side-${place.side}`, place.name);
            label.dataset.side = place.side;
            label.style.left = left;
            label.style.top = top;
            names.appendChild(label);
        });
        frame.appendChild(names);
        const pins = el('div', 'map-pins');
        frame.appendChild(pins);
        const room = el('div', 'map-box');
        room.appendChild(frame);
        area.appendChild(room);

        const groups = new Map();
        const buttons = new Map();
        for (const entry of entries) {
            if (entry.line && !entry.earlier) {
                const group = svgEl('g', { class: 'map-leg', 'data-leg': entry.id, 'data-state': entry.state });
                const d = WorldMap.path(entry.line);
                group.append(svgEl('path', { class: 'map-casing', d }), svgEl('path', { class: 'map-line', d }), svgEl('path', { class: 'map-hit', d }));
                lines.appendChild(group);
                groups.set(entry.id, group);
                group.addEventListener('pointerenter', () => show(entry.id));
                group.addEventListener('pointerleave', () => show(null));
                group.addEventListener('click', (event) => { event.stopPropagation(); pick(entry.id); });
            }
            if (entry.pin) {
                const pin = el('button', 'map-pin', String(entry.n));
                pin.type = 'button';
                pin.dataset.leg = entry.id;
                pin.dataset.state = entry.state;
                pin.style.left = `${((entry.pin.x - box.x0) / W) * 100}%`;
                pin.style.top = `${((entry.pin.z - box.z0) / H) * 100}%`;
                pin.setAttribute('aria-label', `Leg ${entry.n}: ${entry.name}. ${WorldMap.stateText(entry, roam)}`);
                if (entry.state !== 'open') pin.setAttribute('aria-disabled', 'true');
                pins.appendChild(pin);
                buttons.set(entry.id, pin);
            }
        }
        // A tap on the map near a line (but not on it) chooses that leg too: a thumb is wider than a road
        frame.addEventListener('click', (event) => {
            if (event.target.closest('.map-pin, .map-leg')) return;
            const rect = frame.getBoundingClientRect();
            if (!rect.width) return;
            const x = box.x0 + ((event.clientX - rect.left) / rect.width) * W, z = box.z0 + ((event.clientY - rect.top) / rect.height) * H;
            const id = WorldMap.nearest(entries, x, z, (WorldMap.HIT_PX / rect.width) * W);
            if (id) pick(id);
        });

        // The card: the leg shown (hovered, else chosen), its numbers and RIDE
        const side = el('div', 'map-side');
        const card = el('div', 'map-card');
        const kicker = el('div', 'map-kicker');
        const name = el('div', 'map-name');
        const note = el('div', 'map-note');
        const stats = el('dl', 'map-stats');
        const stat = (label) => {
            const cell = el('div', 'map-stat');
            const value = el('dd');
            cell.append(el('dt', '', label), value);
            stats.appendChild(cell);
            return value;
        };
        const lengthValue = stat('Length'), climbValue = stat('Climb'), descentValue = stat('Descent'), bestValue = stat('Best');
        const state = el('div', 'map-state');
        const ride = el('button', 'showcase-continue map-ride', 'RIDE →');
        ride.type = 'button';
        ride.dataset.ride = '';
        card.append(kicker, name, note, stats, state);
        const earlier = entries.filter(e => e.earlier);
        const list = el('div', 'map-earlier');
        if (earlier.length) {
            list.appendChild(el('div', 'map-earlier-label', 'Earlier legs'));
            for (const entry of earlier) {
                const button = el('button', 'map-earlier-btn', entry.name);
                button.type = 'button';
                button.dataset.leg = entry.id;
                button.dataset.state = entry.state;
                if (entry.state !== 'open') button.setAttribute('aria-disabled', 'true');
                list.appendChild(button);
                buttons.set(entry.id, button);
            }
        }
        const way = el('div', 'map-go');
        way.append(ride, list);
        side.append(card, way);
        area.appendChild(side);
        panel.append(head, area);

        let chosen = WorldLegs.suggested({ unlockAll });
        let hovered = null;
        const startEnd = (line) => {
            while (ends.firstChild) ends.removeChild(ends.firstChild);
            if (!line) return;
            const [sx, sz] = line[0], [fx, fz] = line[line.length - 1];
            ends.append(svgEl('circle', { class: 'map-end map-start', cx: sx, cy: sz, r: 1 }), svgEl('circle', { class: 'map-end map-finish', cx: fx, cy: fz, r: 1 }));
        };
        // Draws the card and the highlight for the leg shown
        const render = () => {
            const id = hovered || chosen;
            const entry = byId.get(id);
            if (!entry) return;
            groups.forEach((group, key) => {
                group.classList.toggle('chosen', key === chosen || (WorldMap.EARLIER[chosen] && WorldMap.EARLIER[chosen].n === byId.get(key).n));
                group.classList.toggle('shown', key === id || (WorldMap.EARLIER[id] && WorldMap.EARLIER[id].n === byId.get(key).n));
            });
            buttons.forEach((button, key) => {
                button.classList.toggle('chosen', key === chosen);
                button.classList.toggle('shown', key === id);
                button.setAttribute('aria-pressed', key === chosen ? 'true' : 'false');
            });
            startEnd(entry.line);
            kicker.textContent = entry.n ? `LEG ${entry.n} · ${String(entry.pass).toUpperCase()}` : 'EARLIER LEG';
            name.textContent = entry.name;
            note.textContent = entry.from ? `From ${entry.from.charAt(0).toLowerCase()}${entry.from.slice(1)} to ${entry.to.charAt(0).toLowerCase()}${entry.to.slice(1)}` : 'Not built yet';
            lengthValue.textContent = `${entry.km.toFixed(1)} km`;
            climbValue.textContent = entry.line ? WorldMap.climbText(entry.up) : '–';
            descentValue.textContent = entry.line ? WorldMap.climbText(entry.down) : '–';
            bestValue.textContent = entry.state === 'planned' ? '–' : WorldMap.timeText(entry.best);
            state.textContent = WorldMap.stateText(entry, roam);
            state.dataset.state = entry.done && entry.state === 'open' ? 'done' : entry.state;
            card.dataset.state = entry.state;
            // The button is the card's leg: it rides that leg, or says why that leg is closed
            ride.disabled = entry.state !== 'open';
            ride.dataset.leg = entry.id;
            ride.textContent = WorldMap.rideText(entry, roam);
        };
        const show = (id) => { hovered = id; render(); };
        // On a map that pans, the chosen leg's pin is brought into view
        const reveal = (id) => {
            const pin = buttons.get(id);
            if (!pin || !room.classList.contains('pans') || !pin.closest('.map-frame')) return;
            const box = room.getBoundingClientRect(), r = pin.getBoundingClientRect();
            room.scrollLeft += (r.left + r.width / 2) - (box.left + box.width / 2);
            room.scrollTop += (r.top + r.height / 2) - (box.top + box.height / 2);
        };
        const go = () => {
            const entry = byId.get(hovered || chosen);
            if (!entry || entry.state !== 'open') return;
            WorldMap.close(doc);
            if (onPick) onPick(entry.id);
        };
        // Chooses a leg; the chosen leg chosen again rides it
        const pick = (id) => {
            if (!byId.has(id)) return;
            if (id === chosen && byId.get(id).state === 'open') { go(); return; }
            chosen = id;
            render();
            const button = buttons.get(id);
            if (button && doc.activeElement !== button) button.focus({ preventScroll: true });
            reveal(id);
        };
        buttons.forEach((button, id) => {
            button.addEventListener('click', (event) => { event.stopPropagation(); pick(id); });
            // The browser's own focus on a press scrolls a panning map under the finger before the click lands:
            // pick() focuses the pin itself, without the scroll
            button.addEventListener('pointerdown', event => event.preventDefault());
            button.addEventListener('pointerenter', () => show(id));
            button.addEventListener('pointerleave', () => show(null));
        });
        ride.addEventListener('click', (event) => { event.stopPropagation(); go(); });
        back.addEventListener('click', (event) => {
            event.stopPropagation();
            WorldMap.close(doc);
            if (onBack) onBack();
        });

        // The arrow keys (and WASD) step the legs in the list's order: the tour's, then the earlier legs
        const onKey = (event) => {
            const back1 = ['ArrowLeft', 'ArrowUp', 'KeyA', 'KeyW'].includes(event.code);
            const next1 = ['ArrowRight', 'ArrowDown', 'KeyD', 'KeyS'].includes(event.code);
            if (!back1 && !next1) return false;
            event.preventDefault();
            const id = WorldMap.step(entries.filter(e => buttons.has(e.id)), chosen, next1 ? 1 : -1);
            chosen = id;
            hovered = null;
            render();
            const button = buttons.get(id);
            if (button) button.focus({ preventScroll: true });
            reveal(id);
            return true;
        };

        // The frame keeps the box's shape inside whatever room the layout gives it
        // A name stands on its own side unless a pin, another name or the frame's edge is there: then on the first
        // side that is clear (the towns, passes and views first, so a named road gives way to them)
        const placeNames = () => {
            const edge = frame.getBoundingClientRect();
            if (!edge.width) return;
            const meet = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
            const within = r => r.left >= edge.left && r.right <= edge.right && r.top >= edge.top && r.bottom <= edge.bottom;
            const taken = [...pins.querySelectorAll('.map-pin')].map(pin => pin.getBoundingClientRect());
            const sides = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
            const labels = [...names.querySelectorAll('.map-place')];
            [...labels.filter(l => !l.classList.contains('map-place-road')), ...labels.filter(l => l.classList.contains('map-place-road'))].forEach((label) => {
                const set = side => sides.forEach(k => label.classList.toggle(`side-${k}`, k === side));
                const order = [label.dataset.side, ...['e', 'w', 's', 'n', 'ne', 'nw', 'se', 'sw'].filter(k => k !== label.dataset.side)];
                let side = order.find((k) => {
                    set(k);
                    const r = label.getBoundingClientRect();
                    return within(r) && !taken.some(t => meet(t, r));
                });
                set(side || label.dataset.side);
                // A named road with no clear side is left out: the line and the card name it already
                label.hidden = !side && label.classList.contains('map-place-road');
                if (!label.hidden) taken.push(label.getBoundingClientRect());
            });
        };
        let fitted = null, panned = false;
        const fit = () => {
            const space = room.getBoundingClientRect();
            if (!space.width || !space.height) return;
            // (the observer's first call, and any call with the room unchanged, leaves the map, and its pan, as it is)
            const size = `${Math.round(space.width)}x${Math.round(space.height)}`;
            if (size === fitted) return;
            fitted = size;
            // A phone's map is drawn larger than its box and pans under a finger: whole, its pins would meet
            const zoom = space.width < WorldMap.PAN_BELOW_PX ? WorldMap.PAN_ZOOM : 1;
            const scale = zoom > 1 ? (space.width * zoom) / W : Math.min(space.width / W, space.height / H);
            room.classList.toggle('pans', zoom > 1);
            frame.style.width = `${Math.floor(W * scale)}px`;
            frame.style.height = `${Math.floor(H * scale)}px`;
            // The ends are dots of a fixed size on screen
            ends.querySelectorAll('circle').forEach(c => c.setAttribute('r', String(5 / Math.max(scale, 1e-6))));
            panel.style.setProperty('--map-scale', String(scale));
            placeNames();
            // (only the first fit brings the chosen pin into view: a later one keeps the pan the player made)
            if (zoom > 1 && !panned) reveal(chosen);
            panned = true;
        };
        const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
        if (observer) observer.observe(room);
        panel.mapClose = () => { if (observer) observer.disconnect(); };
        const renderAndFit = () => { render(); fit(); };

        if (doc.body && doc.body.classList) doc.body.classList.add('home-map-on');
        doc.body.appendChild(panel);
        renderAndFit();
        WorldMap.relief(doc, box).then((url) => { if (url && panel.isConnected) relief.setAttribute('href', url); });
        Modals.open(panel, { focus: buttons.get(chosen) || ride, onKey });
        panel.mapState = () => ({ chosen, hovered, entries });
        return panel;
    },

    close(doc) {
        const old = doc && doc.getElementById('world-legs');
        // (the rider's panel shows again first, so the focus can go back to RIDE)
        if (doc && doc.body && doc.body.classList) doc.body.classList.remove('home-map-on');
        if (old) {
            if (old.mapClose) old.mapClose();
            Modals.close(old);
        }
    }
};

if (typeof module !== 'undefined' && module.exports) module.exports = { WorldMap };
