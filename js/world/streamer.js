// WorldStreamer: spatial streaming of the world around the bike. The game's
// section engine is one-dimensional in segment index; a figure of 8 crosses
// itself and hairpin legs lie side by side, so ground that is near in space can
// be far in s. Everything here is owned by place.
//
//   - Height tiles (512 m) are reference counted. Two owners hold them: the
//     bike (every tile within 900 m) and the ride (every tile within 600 m of
//     the ride samples in [s - 1 km, s + 3 km]). A tile is built when its count
//     goes from 0 to 1 and its data is here, and disposed after the count has
//     stayed 0 for 3 s. Data residency (what the physics needs) and mesh
//     residency (what is drawn) are separate: the data stays in WorldData's LRU.
//   - Ride sections (256 m of ride) are drawn when in [s - 1 km, s + 3 km] or
//     within 1.2 km of the bike by place, at a level of detail by distance.
//   - Side-edge chunks are resident within 1.2 km of the bike. A chunk draws its side roads within SIDE_NEAR_M of
//     the bike at LOD0, as a ride section within ROAD_LOD_M[0] is: by pieces of road (hooks.sidePieces), each LOD0
//     from SIDE_NEAR_M + SIDE_PAD_M of the bike and LOD1 again past SIDE_SLACK_M more, and the chunk is built again
//     only when its set of LOD0 pieces changes.
//   - Builds go through a queue, nearest first, at most BUDGET_MS a frame
//     (one step at least, so a queue always drains).
//
// The streamer builds nothing itself; `hooks` hold the builders. No THREE.
class WorldStreamer {
    static get BUDGET_MS() { return 4; }
    static get BIKE_TILE_M() { return 900; }
    static get RIDE_TILE_M() { return 600; }
    static get RIDE_BEHIND_M() { return 1000; }
    static get RIDE_AHEAD_M() { return 3000; }
    static get PLACE_M() { return 1200; }
    static get SECTION_M() { return 256; }
    static get DISPOSE_AFTER_MS() { return 3000; }
    // Distance from the bike to the nearest edge of a ride section, for each road level of detail
    static get ROAD_LOD_M() { return [400, 1500]; }
    // A side road within this of the bike is drawn at LOD0, like a ride section (WorldStreamer.ROAD_LOD_M[0]). A piece
    // of side road turns LOD0 when its box (its centre line's) comes within SIDE_NEAR_M + SIDE_PAD_M (the pad covers
    // the road's half width and verge) and back to LOD1 only past SIDE_SLACK_M more, so a chunk is not built again for
    // every few metres the bike rides
    static get SIDE_NEAR_M() { return WorldStreamer.ROAD_LOD_M[0]; }
    static get SIDE_PAD_M() { return 10; }
    static get SIDE_SLACK_M() { return 100; }
    // The same for a terrain tile: LOD0 at 8 m, LOD1 at 16 m, LOD2 at 32 m
    static get TILE_LOD_M() { return [700, 2000]; }

    constructor({ data, route, hooks, now = null, clock = null }) {
        this.data = data;
        this.route = route;
        this.hooks = hooks;
        this.now = now || (typeof performance !== 'undefined' ? () => performance.now() : () => Date.now());
        // What the 3 s of DISPOSE_AFTER_MS is measured on. The wall clock by default; a game that steps faster
        // than real time (a test ride, a replay) passes a clock that moves with its frames.
        this.clock = clock || this.now;
        this.refs = new Map();
        this.owners = new Map();
        this.tiles = new Map();
        this.roads = new Map();
        this.sides = new Map();
        this.queue = [];
        this.queued = new Set();
        this.loading = new Set();
        this.sections = this.planSections();
        this.rideKey = null;
        this.stats = { maxStepMs: 0, maxStepByKind: {}, frameBuildMs: 0, maxFrameBuildMs: 0, builds: 0, disposes: 0 };
        data.holds = key => (this.refs.get(key) || 0) > 0;
    }

    // Cuts the ride into runs of about SECTION_M metres: [{from, to, s0, s1, bbox}] by sample index
    planSections() {
        const points = this.route.points;
        const out = [];
        let from = 0;
        for (let i = 1; i < points.length; i++) {
            if (this.route.sArray[i] - this.route.sArray[from] >= WorldStreamer.SECTION_M || i === points.length - 1) {
                let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
                for (let k = from; k <= i; k++) {
                    x0 = Math.min(x0, points[k].x); x1 = Math.max(x1, points[k].x);
                    z0 = Math.min(z0, points[k].z); z1 = Math.max(z1, points[k].z);
                }
                out.push({ index: out.length, from, to: i, s0: this.route.sArray[from], s1: this.route.sArray[i], bbox: [x0, z0, x1, z1] });
                from = i;
            }
        }
        return out;
    }

    static distanceToBox(x, z, [x0, z0, x1, z1]) {
        const dx = Math.max(x0 - x, 0, x - x1);
        const dz = Math.max(z0 - z, 0, z - z1);
        return Math.hypot(dx, dz);
    }

    // Tile keys whose square lies within `radius` of (x, z), and exist in the data
    tilesNear(x, z, radius, into = new Set()) {
        const m = WorldData.TILE_M;
        for (let tx = Math.floor((x - radius) / m); tx <= Math.floor((x + radius) / m); tx++) {
            for (let tz = Math.floor((z - radius) / m); tz <= Math.floor((z + radius) / m); tz++) {
                const key = `${tx},${tz}`;
                if (into.has(key)) continue;
                if (WorldStreamer.distanceToBox(x, z, [tx * m, tz * m, (tx + 1) * m, (tz + 1) * m]) <= radius && this.exists(key)) into.add(key);
            }
        }
        return into;
    }

    exists(key) {
        if (!this.tileSet) this.tileSet = new Set(this.data.manifest.tiles.height.map(([tx, tz]) => `${tx},${tz}`));
        return this.tileSet.has(key);
    }

    // Replaces what one owner holds; the counts of every tile that changed move with it
    setOwner(owner, keys) {
        const before = this.owners.get(owner) || new Set();
        for (const key of before) {
            if (!keys.has(key)) this.release(key);
        }
        for (const key of keys) {
            if (!before.has(key)) this.refs.set(key, (this.refs.get(key) || 0) + 1);
        }
        this.owners.set(owner, keys);
    }

    release(key) {
        const count = (this.refs.get(key) || 0) - 1;
        if (count <= 0) this.refs.delete(key);
        else this.refs.set(key, count);
    }

    // Tiles within RIDE_TILE_M of the ride samples in the ride window, one sample in eight (32 m) is enough
    rideTiles(s) {
        const keys = new Set();
        const route = this.route;
        const from = route.indexAt(Math.max(0, s - WorldStreamer.RIDE_BEHIND_M));
        const to = route.indexAt(Math.min(route.length, s + WorldStreamer.RIDE_AHEAD_M));
        for (let i = from; i <= to; i += 8) this.tilesNear(route.points[i].x, route.points[i].z, WorldStreamer.RIDE_TILE_M, keys);
        if (to < route.points.length) this.tilesNear(route.points[to].x, route.points[to].z, WorldStreamer.RIDE_TILE_M, keys);
        return keys;
    }

    // Called every frame with the bike's position and its ride progress s
    update(bike, s) {
        const time = this.clock();
        this.bike = bike;
        // The ride window moves in 32 m steps; the bike's own tiles are cheap and follow it every frame
        const rideStep = Math.floor(s / 32);
        if (rideStep !== this.rideKey) {
            this.rideKey = rideStep;
            this.setOwner('ride', this.rideTiles(s));
        }
        this.setOwner('bike', this.tilesNear(bike.x, bike.z, WorldStreamer.BIKE_TILE_M));
        this.updateTiles(bike, time);
        this.updateRoads(bike, s, time);
        this.updateSides(bike, time);
    }

    tileLod(key, bike) {
        const m = WorldData.TILE_M;
        const [tx, tz] = key.split(',').map(Number);
        const d = WorldStreamer.distanceToBox(bike.x, bike.z, [tx * m, tz * m, (tx + 1) * m, (tz + 1) * m]);
        const limits = WorldStreamer.TILE_LOD_M;
        return d < limits[0] ? 0 : d < limits[1] ? 1 : 2;
    }

    tileDistance(key, bike) {
        const m = WorldData.TILE_M;
        const [tx, tz] = key.split(',').map(Number);
        return WorldStreamer.distanceToBox(bike.x, bike.z, [tx * m, tz * m, (tx + 1) * m, (tz + 1) * m]);
    }

    updateTiles(bike, time) {
        for (const [key] of this.refs) {
            const held = this.tiles.get(key);
            if (held) held.zeroSince = null;
            if (!this.data.tile(key) && !this.loading.has(`t${key}`)) this.fetchTile(key);
            if (!this.data.tile(key)) continue;
            const lod = this.tileLod(key, bike);
            if (!held || held.lod !== lod) this.enqueue(`tile:${key}`, this.tileDistance(key, bike), () => this.buildTile(key, this.tileLod(key, bike)));
        }
        for (const [key, held] of this.tiles) {
            if (this.refs.has(key)) continue;
            if (held.zeroSince === null) held.zeroSince = time;
            else if (time - held.zeroSince >= WorldStreamer.DISPOSE_AFTER_MS) {
                this.hooks.disposeTile(key);
                this.tiles.delete(key);
                this.stats.disposes++;
            }
        }
    }

    fetchTile(key) {
        const tag = `t${key}`;
        this.loading.add(tag);
        Promise.all([this.data.ensureTile(key), this.data.ensureCover(key)])
            .catch(error => console.warn(`world tile ${key}: ${error.message}`))
            .finally(() => this.loading.delete(tag));
    }

    buildTile(key, lod) {
        if (!this.refs.has(key) || !this.data.tile(key)) return;
        const held = this.tiles.get(key);
        if (held && held.lod === lod) return;
        this.hooks.buildTile(key, lod, !!held);
        this.tiles.set(key, { lod, zeroSince: null });
        this.stats.builds++;
        // What stands on the tile is its own step, so one frame never builds the land and its trees together
        if (this.hooks.buildScenery) {
            this.enqueue(`scenery:${key}`, this.tileDistance(key, this.bike) + 0.5, () => {
                const current = this.tiles.get(key);
                if (current) this.hooks.buildScenery(key, current.lod);
            });
        }
    }

    updateRoads(bike, s, time) {
        const limits = WorldStreamer.ROAD_LOD_M;
        const wanted = new Map();
        for (const section of this.sections) {
            const inWindow = section.s1 >= s - WorldStreamer.RIDE_BEHIND_M && section.s0 <= s + WorldStreamer.RIDE_AHEAD_M;
            const d = WorldStreamer.distanceToBox(bike.x, bike.z, section.bbox);
            if (!inWindow && d > WorldStreamer.PLACE_M) continue;
            if (d >= limits[1] && !inWindow) continue;
            wanted.set(section.index, { lod: d < limits[0] ? 0 : 1, d });
        }
        for (const [index, want] of wanted) {
            const held = this.roads.get(index);
            if (held) held.zeroSince = null;
            if (!held || held.lod !== want.lod) {
                this.enqueue(`road:${index}`, want.d, () => {
                    const prior = this.roads.get(index);
                    if (prior && prior.lod === want.lod) return;
                    this.hooks.buildRoad(this.sections[index], want.lod, !!prior);
                    this.roads.set(index, { lod: want.lod, zeroSince: null });
                    this.stats.builds++;
                });
            }
        }
        for (const [index, held] of this.roads) {
            if (wanted.has(index)) continue;
            if (held.zeroSince === null) held.zeroSince = time;
            else if (time - held.zeroSince >= WorldStreamer.DISPOSE_AFTER_MS) {
                this.hooks.disposeRoad(this.sections[index]);
                this.roads.delete(index);
                this.stats.disposes++;
            }
        }
    }

    updateSides(bike, time) {
        const wanted = new Set(this.data.chunksNear(bike.x, bike.z, WorldStreamer.PLACE_M));
        for (const k of wanted) {
            const held = this.sides.get(k);
            if (held) held.zeroSince = null;
            if (this.data.chunks.has(k)) {
                const near = this.sideNear(k, bike, held);
                if (!held || near !== held.near) this.enqueue(`side:${k}`, WorldStreamer.distanceToBox(bike.x, bike.z, this.data.manifest.chunks[k].bbox), () => {
                    const prior = this.sides.get(k);
                    const now = this.sideNear(k, this.bike || bike, prior);
                    if (prior && now === prior.near) return;
                    this.hooks.buildSide(k, now, !!prior);
                    this.sides.set(k, { zeroSince: null, near: now });
                    this.stats.builds++;
                });
            } else if (!this.loading.has(`c${k}`)) {
                this.loading.add(`c${k}`);
                this.data.ensureChunks([k]).catch(error => console.warn(`world chunk ${k}: ${error.message}`)).finally(() => this.loading.delete(`c${k}`));
            }
        }
        for (const [k, held] of this.sides) {
            if (wanted.has(k)) continue;
            if (held.zeroSince === null) held.zeroSince = time;
            else if (time - held.zeroSince >= WorldStreamer.DISPOSE_AFTER_MS) {
                this.hooks.disposeSide(k);
                this.sides.delete(k);
                this.stats.disposes++;
            }
        }
    }

    // The pieces of a side chunk's roads drawn at LOD0 (hooks.sidePieces: [{box}], WorldEnvironment.sidePieces), as
    // a key: their indices joined, '' for none. A piece is LOD0 within SIDE_NEAR_M + SIDE_PAD_M of the bike, and one
    // that was (held.near) stays so within SIDE_SLACK_M more
    sideNear(k, bike, held) {
        const pieces = this.hooks.sidePieces ? this.hooks.sidePieces(k) : null;
        if (!pieces) return '';
        const enter = WorldStreamer.SIDE_NEAR_M + WorldStreamer.SIDE_PAD_M, leave = enter + WorldStreamer.SIDE_SLACK_M;
        const was = held && held.near ? new Set(held.near.split(',').map(Number)) : null;
        const near = [];
        pieces.forEach((piece, i) => {
            const d = WorldStreamer.distanceToBox(bike.x, bike.z, piece.box);
            if (d <= enter || (was && was.has(i) && d <= leave)) near.push(i);
        });
        return near.join(',');
    }

    enqueue(id, priority, run) {
        if (this.queued.has(id)) {
            const task = this.queue.find(t => t.id === id);
            if (task) { task.priority = priority; task.run = run; }
            return;
        }
        this.queued.add(id);
        this.queue.push({ id, priority, run });
    }

    // Runs queued builds, nearest first, until `budgetMs` is spent (one step at least). Returns the steps run.
    pump(budgetMs = WorldStreamer.BUDGET_MS) {
        if (!this.queue.length) {
            this.stats.frameBuildMs = 0;
            return 0;
        }
        this.queue.sort((p, q) => p.priority - q.priority);
        const frameStart = this.now();
        let steps = 0;
        while (this.queue.length) {
            const task = this.queue.shift();
            this.queued.delete(task.id);
            const stepStart = this.now();
            task.run();
            const stepMs = this.now() - stepStart;
            const kind = task.id.slice(0, task.id.indexOf(':'));
            this.stats.maxStepMs = Math.max(this.stats.maxStepMs, stepMs);
            this.stats.maxStepByKind[kind] = Math.max(this.stats.maxStepByKind[kind] || 0, stepMs);
            steps++;
            if (this.now() - frameStart >= budgetMs) break;
        }
        this.stats.frameBuildMs = this.now() - frameStart;
        this.stats.maxFrameBuildMs = Math.max(this.stats.maxFrameBuildMs, this.stats.frameBuildMs);
        return steps;
    }

    // The first frame builds with no budget, on cold code, behind a loading screen; its steps are not streamed frames
    resetStepStats() {
        this.stats.maxStepMs = 0;
        this.stats.maxStepByKind = {};
        this.stats.maxFrameBuildMs = 0;
        this.stats.frameBuildMs = 0;
    }

    // Holds the tiles round (x, z) and resolves when their data is here: a
    // restart or a resume far from the bike waits on this before the bike moves.
    // Never rejects; a tile that cannot be fetched is left to the ground's fallback.
    async ensure(x, z, radius = 200) {
        const keys = this.tilesNear(x, z, radius);
        this.setOwner('placing', keys);
        await Promise.all([...keys].map(key => Promise.all([this.data.ensureTile(key), this.data.ensureCover(key)]).catch(() => null)));
        return [...keys].filter(key => this.data.tile(key));
    }

    // Lets go of the tiles `ensure` held
    releasePlacing() {
        this.setOwner('placing', new Set());
    }

    // Drains the queue and the loads, for tests and for a first frame that must be complete.
    // Its steps are not counted in the streaming stats.
    async settle(bike, s, maxRounds = 200) {
        for (let round = 0; round < maxRounds; round++) {
            this.update(bike, s);
            while (this.queue.length) this.pump(Infinity);
            if (!this.loading.size && !this.queue.length) {
                this.update(bike, s);
                if (!this.queue.length) {
                    this.resetStepStats();
                    return round;
                }
            }
            await new Promise(resolve => setTimeout(resolve, 0));
        }
        return maxRounds;
    }
}
