// WorldData: fetches and decodes the world's binary files (tools/world/encode.mjs
// is the one definition of the format). Same-origin `fetch`, `ArrayBuffer`, typed
// arrays; no worker. No THREE and no DOM, so it loads in the node harness with
// an injected `fetch`.
//
// What is held, and for how long:
//   - the ride layer (manifest, ride.json, the graph tables and every edge chunk
//     the ride uses) is loaded once, before GO, and never evicted. The route
//     contract is synchronous, so the whole ride must be resident.
//   - side-edge chunks, height tiles and cover tiles are loaded on demand and
//     held in LRU maps. A missing tile is never an error for the physics:
//     WorldGround falls back to far.bin and then to the route height.
//
// `?worldData=<path>` picks the folder to read from. It is untrusted input, so
// it is confined to two same-origin folders, and a world read from anywhere but
// the shipped folder never submits a time (`trusted` is false).
class WorldData {
    static get TILE_M() { return 512; }
    static get TILE_N() { return 65; }
    static get CELL_M() { return 8; }
    static get COVER_N() { return 32; }
    static get SAMPLE_BYTES() { return 16; }
    static get NODE_BYTES() { return 16; }
    static get EDGE_BYTES() { return 24; }
    static get BUILDING_BYTES() { return 16; }
    static get FORMAT() { return 1; }
    // Metres under the lowest carved neighbour that a node beside the road is held to
    static get DIP_M() { return 0.05; }
    // Metres two touching carved nodes may differ by before they are two roads and not one road's grade (16% over 8 m is 1.3)
    static get CONFLICT_M() { return 2; }
    static get SHIPPED_BASE() { return 'world/'; }
    static get ALLOWED_BASES() { return ['world/', 'tests/fixtures/world/']; }
    static get MAX_TILES() { return 160; }
    static get MAX_CHUNKS() { return 96; }
    static get ZONE() { return { terrain: 0, road: 1, bench: 2, wall: 3, drop: 4, water: 5 }; }

    // The folder a `?worldData=` value names, or an error. Only a relative
    // path under an allowed folder passes: no scheme, no `//`, no `..`, no
    // backslash, no leading slash.
    static resolveBase(param) {
        if (param === null || param === undefined || param === '') {
            return { base: WorldData.SHIPPED_BASE, overridden: false };
        }
        const text = String(param);
        const refused = /^[a-z][a-z0-9+.-]*:/i.test(text) || text.includes('//') || text.includes('\\') ||
            text.startsWith('/') || text.split('/').some(part => part === '..' || part === '.') || /[\0-\x1f?#%]/.test(text);
        const allowed = WorldData.ALLOWED_BASES.some(base => text.startsWith(base));
        if (refused || !allowed) return { base: null, overridden: true, error: `worldData must be a relative path under ${WorldData.ALLOWED_BASES.join(' or ')}` };
        const base = text.endsWith('/') ? text : `${text}/`;
        return { base, overridden: base !== WorldData.SHIPPED_BASE };
    }

    constructor({ base = WorldData.SHIPPED_BASE, overridden = false, fetchFn = null, digest = null } = {}) {
        this.base = base;
        this.overridden = overridden;
        this.fetchFn = fetchFn || ((url) => fetch(url));
        this.digest = digest;
        this.pending = new Map();
        this.chunks = new Map();
        this.tiles = new Map();
        this.covers = new Map();
        this.manifest = null;
        this.ride = null;
        this.trusted = false;
        this.stats = { fetches: 0, bytes: 0 };
    }

    async fetchBuffer(file, base = this.base) {
        const url = `${base}${file}`;
        if (!this.pending.has(url)) {
            this.pending.set(url, (async () => {
                this.stats.fetches++;
                const response = await this.fetchFn(url);
                if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
                const buffer = await response.arrayBuffer();
                this.stats.bytes += buffer.byteLength;
                return buffer;
            })().finally(() => this.pending.delete(url)));
        }
        return this.pending.get(url);
    }

    async fetchJson(file) {
        return JSON.parse(new TextDecoder().decode(await this.fetchBuffer(file)));
    }

    // Everything the route contract needs, before the first frame
    async load() {
        const manifestBuffer = await this.fetchBuffer('manifest.json');
        this.manifest = JSON.parse(new TextDecoder().decode(manifestBuffer));
        if (this.manifest.format !== WorldData.FORMAT) throw new Error(`world format ${this.manifest.format} is not ${WorldData.FORMAT}`);
        const [ride, junctions, nodes, edges] = await Promise.all([
            this.fetchJson('ride.json'), this.fetchJson('graph/junctions.json'),
            this.fetchBuffer('graph/nodes.bin'), this.fetchBuffer('graph/edges.bin')
        ]);
        this.ride = ride;
        this.junctions = junctions;
        this.decodeNodes(nodes);
        this.decodeEdges(edges);
        await this.ensureChunks(this.rideChunks());
        this.trusted = await this.checkTrust(manifestBuffer);
        return this;
    }

    // Trusted: read from the shipped folder, and the manifest is the one that
    // the shipped world/SHA256SUMS lists
    async checkTrust(manifestBuffer) {
        if (this.overridden || this.base !== WorldData.SHIPPED_BASE) return false;
        const digest = this.digest || (typeof crypto !== 'undefined' && crypto.subtle ? async (buffer) => {
            const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer));
            return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
        } : null);
        if (!digest) return false;
        try {
            const sums = new TextDecoder().decode(await this.fetchBuffer('SHA256SUMS', WorldData.SHIPPED_BASE));
            const line = sums.split('\n').find(row => row.trim().endsWith('manifest.json'));
            return !!line && line.trim().split(/\s+/)[0] === await digest(manifestBuffer);
        } catch (error) {
            return false;
        }
    }

    decodeNodes(buffer) {
        const view = new DataView(buffer);
        const count = buffer.byteLength / WorldData.NODE_BYTES;
        this.nodes = { count, x: new Float64Array(count), z: new Float64Array(count), y: new Float64Array(count), degree: new Uint8Array(count), flags: new Uint8Array(count) };
        for (let i = 0; i < count; i++) {
            const o = i * WorldData.NODE_BYTES;
            this.nodes.x[i] = view.getInt32(o, true) / 1000;
            this.nodes.z[i] = view.getInt32(o + 4, true) / 1000;
            this.nodes.y[i] = view.getInt32(o + 8, true) / 1000;
            this.nodes.degree[i] = view.getUint8(o + 12);
            this.nodes.flags[i] = view.getUint8(o + 13);
        }
    }

    decodeEdges(buffer) {
        const view = new DataView(buffer);
        const count = buffer.byteLength / WorldData.EDGE_BYTES;
        const classes = this.manifest.roadClasses;
        this.edges = [];
        for (let i = 0; i < count; i++) {
            const o = i * WorldData.EDGE_BYTES;
            this.edges.push({
                id: view.getUint32(o, true), a: view.getUint32(o + 4, true), b: view.getUint32(o + 8, true),
                length: view.getUint32(o + 12, true) / 1000, first: view.getUint32(o + 16, true), count: view.getUint16(o + 20, true),
                cls: classes[view.getUint8(o + 22)], onRide: (view.getUint8(o + 23) & 1) === 1
            });
        }
    }

    // The chunk indexes the ride's edges live in
    rideChunks() {
        const wanted = new Set();
        for (const use of this.ride.path) {
            const edge = this.edges[use.edgeId];
            for (let k = this.chunkOf(edge.first); k <= this.chunkOf(edge.first + edge.count - 1); k++) wanted.add(k);
        }
        return [...wanted].sort((p, q) => p - q);
    }

    // Index of the chunk holding global sample `index`
    chunkOf(index) {
        const list = this.manifest.chunks;
        let lo = 0, hi = list.length - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (list[mid].first <= index) lo = mid; else hi = mid - 1;
        }
        return lo;
    }

    // Chunks whose bounding box is within `radius` of (x, z)
    chunksNear(x, z, radius) {
        const out = [];
        this.manifest.chunks.forEach((c, k) => {
            const [x0, z0, x1, z1] = c.bbox;
            const dx = Math.max(x0 - x, 0, x - x1);
            const dz = Math.max(z0 - z, 0, z - z1);
            if (dx * dx + dz * dz <= radius * radius) out.push(k);
        });
        return out;
    }

    async ensureChunks(list) {
        await Promise.all(list.filter(k => !this.chunks.has(k)).map(async (k) => {
            const meta = this.manifest.chunks[k];
            const view = new DataView(await this.fetchBuffer(meta.file));
            const n = meta.count;
            const chunk = { x: new Float64Array(n), z: new Float64Array(n), y: new Float64Array(n), heading: new Float64Array(n), width: new Float32Array(n), flags: new Uint8Array(n) };
            for (let j = 0; j < n; j++) {
                const o = j * WorldData.SAMPLE_BYTES;
                chunk.x[j] = view.getInt32(o, true) / 1000;
                chunk.z[j] = view.getInt32(o + 4, true) / 1000;
                chunk.y[j] = view.getInt32(o + 8, true) / 1000;
                chunk.heading[j] = view.getInt16(o + 12, true) / 1e4;
                chunk.width[j] = view.getUint8(o + 14) / 10;
                chunk.flags[j] = view.getUint8(o + 15);
            }
            this.chunks.set(k, chunk);
            this.trim(this.chunks, WorldData.MAX_CHUNKS, key => this.pinnedChunks().has(key));
        }));
    }

    pinnedChunks() {
        if (!this.pinned) this.pinned = new Set(this.rideChunks());
        return this.pinned;
    }

    // Evicts the oldest entries beyond `max`, never one `keep` names
    trim(map, max, keep) {
        for (const key of map.keys()) {
            if (map.size <= max) break;
            if (!keep(key)) map.delete(key);
        }
    }

    // The samples of one edge as {x, z, y, heading, width, flags}, or null while
    // any chunk it spans is missing. Typed arrays are copies for an edge
    // that spans chunks and views otherwise.
    edgeSamples(edgeId) {
        const edge = this.edges[edgeId];
        const out = { x: new Float64Array(edge.count), z: new Float64Array(edge.count), y: new Float64Array(edge.count), heading: new Float64Array(edge.count), width: new Float32Array(edge.count), flags: new Uint8Array(edge.count) };
        let at = 0;
        while (at < edge.count) {
            const global = edge.first + at;
            const k = this.chunkOf(global);
            const chunk = this.chunks.get(k);
            if (!chunk) return null;
            const offset = global - this.manifest.chunks[k].first;
            const take = Math.min(edge.count - at, this.manifest.chunks[k].count - offset);
            for (const key of Object.keys(out)) out[key].set(chunk[key].subarray(offset, offset + take), at);
            at += take;
        }
        return out;
    }

    tileKey(tx, tz) { return `${tx},${tz}`; }

    static tileName(v) { return v < 0 ? `m${-v}` : `${v}`; }

    // Decoded height tile {key, tx, tz, heights: Float32Array, zones: Uint8Array}, or null when not resident
    tile(key) {
        const tile = this.tiles.get(key);
        if (!tile) return null;
        this.tiles.delete(key);
        this.tiles.set(key, tile);
        return tile;
    }

    async ensureTile(key) {
        if (this.tiles.has(key)) return this.tiles.get(key);
        if (!this.tileSet) this.tileSet = new Set(this.manifest.tiles.height.map(([tx, tz]) => this.tileKey(tx, tz)));
        if (!this.tileSet.has(key)) return null;
        const [tx, tz] = key.split(',').map(Number);
        const view = new DataView(await this.fetchBuffer(`height/h-${WorldData.tileName(tx)}_${WorldData.tileName(tz)}.bin`));
        const n = WorldData.TILE_N * WorldData.TILE_N;
        const base = view.getFloat32(0, true);
        const heights = new Float32Array(n);
        const zones = new Uint8Array(n);
        for (let i = 0; i < n; i++) {
            heights[i] = base + view.getInt16(4 + i * 2, true) / 10;
            zones[i] = view.getUint8(4 + n * 2 + i);
        }
        WorldData.dipRoadSides(heights, zones);
        const tile = { key, tx, tz, heights, zones };
        this.tiles.set(key, tile);
        this.trim(this.tiles, WorldData.MAX_TILES, k => this.holds && this.holds(k));
        return tile;
    }

    // The importer carves the road and its bench flat and lets the cut slope climb away from it at up to 1:1.
    // A node 8 m from the road can then stand a metre or more above it, and the tile's triangles lift the land
    // above the ribbon between two nodes. So a node beside the carved ground is held no higher than the lowest
    // carved node it touches (less DIP_M). Where two roads lie so close that a carved node of the upper one
    // touches a carved node of the lower one (stacked hairpin legs), the upper node is held too: a road's own grade
    // never separates two touching nodes by CONFLICT_M, a hairpin does. The mesh and the ground both read this
    // height, so they agree; the ribbon is drawn at the road's own height either way.
    static dipRoadSides(heights, zones) {
        const n = WorldData.TILE_N;
        const zone = WorldData.ZONE;
        const carved = z => z === zone.road || z === zone.bench;
        const lowered = [];
        for (let j = 0; j < n; j++) {
            for (let i = 0; i < n; i++) {
                const own = carved(zones[j * n + i]);
                let lowest = Infinity;
                for (let dj = -1; dj <= 1; dj++) {
                    for (let di = -1; di <= 1; di++) {
                        const a = i + di, b = j + dj;
                        if ((!di && !dj) || a < 0 || b < 0 || a >= n || b >= n || !carved(zones[b * n + a])) continue;
                        lowest = Math.min(lowest, heights[b * n + a]);
                    }
                }
                const height = heights[j * n + i];
                const target = lowest - WorldData.DIP_M;
                if (own ? lowest + WorldData.CONFLICT_M < height : target < height) lowered.push([j * n + i, target]);
            }
        }
        // Every neighbour was read as imported; now write
        for (const [at, value] of lowered) heights[at] = value;
        return lowered.length;
    }

    cover(key) { return this.covers.get(key) || null; }

    async ensureCover(key) {
        if (this.covers.has(key)) return this.covers.get(key);
        if (!this.coverSet) this.coverSet = new Set(this.manifest.tiles.cover.map(([tx, tz]) => this.tileKey(tx, tz)));
        if (!this.coverSet.has(key)) return null;
        const [tx, tz] = key.split(',').map(Number);
        const grid = new Uint8Array(await this.fetchBuffer(`cover/c-${WorldData.tileName(tx)}_${WorldData.tileName(tz)}.bin`));
        this.covers.set(key, grid);
        this.trim(this.covers, WorldData.MAX_TILES, k => this.holds && this.holds(k));
        return grid;
    }

    // The far height grid (one file, loaded once), or null before it arrives
    async ensureFar() {
        if (this.far) return this.far;
        const buffer = await this.fetchBuffer('far.bin');
        const view = new DataView(buffer);
        const nx = view.getUint16(8, true), nz = view.getUint16(10, true);
        const data = new Int16Array(nx * nz);
        for (let i = 0; i < data.length; i++) data[i] = view.getInt16(16 + i * 2, true);
        this.far = { x0: view.getInt32(0, true) / 1000, z0: view.getInt32(4, true) / 1000, nx, nz, cell: view.getUint16(12, true), data };
        return this.far;
    }

    async ensureBuildings() {
        if (this.buildings) return this.buildings;
        const view = new DataView(await this.fetchBuffer('buildings.bin'));
        const list = [];
        for (let o = 0; o + WorldData.BUILDING_BYTES <= view.byteLength; o += WorldData.BUILDING_BYTES) {
            list.push({
                x: view.getInt32(o, true) / 1000, z: view.getInt32(o + 4, true) / 1000, w: view.getUint16(o + 8, true) / 10, d: view.getUint16(o + 10, true) / 10,
                heading: view.getInt16(o + 12, true) / 1e4, h: view.getUint8(o + 14) / 2, kind: view.getUint8(o + 15)
            });
        }
        this.buildings = list;
        return list;
    }

    // Height of the far grid at (x, z), bilinear; null outside it or where it has no data
    farHeight(x, z) {
        const far = this.far;
        if (!far) return null;
        const fx = (x - far.x0) / far.cell, fz = (z - far.z0) / far.cell;
        const i = Math.floor(fx), j = Math.floor(fz);
        if (i < 0 || j < 0 || i + 1 >= far.nx || j + 1 >= far.nz) return null;
        const at = (a, b) => far.data[b * far.nx + a];
        const h00 = at(i, j), h10 = at(i + 1, j), h01 = at(i, j + 1), h11 = at(i + 1, j + 1);
        if (h00 === -32768 || h10 === -32768 || h01 === -32768 || h11 === -32768) return null;
        const u = fx - i, v = fz - j;
        return (h00 * (1 - u) + h10 * u) * (1 - v) + (h01 * (1 - u) + h11 * u) * v;
    }
}
