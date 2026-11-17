// RoadClearance: where the roads of a world are, for whatever is placed beside them. The road bands are the ride's
// samples (from the route) and every side edge's samples (from the chunks in residence), each with its own drawn width
// plus the verge (RoadSurface.VERGE_M), in a 16 m hash. A side edge is added the first time its chunks are here and
// kept after they go: the data never changes. No THREE.
class RoadClearance {
    static get HASH_M() { return 16; }

    constructor(route, data) {
        this.route = route;
        this.data = data;
        this.segments = [];
        this.hash = new Map();
        this.indexed = new Set();
        this.chunksSeen = -1;
        const verge = RoadClearance.verge();
        const points = route.points;
        for (let i = 0; i + 1 < points.length; i++) {
            const a = points[i], b = points[i + 1];
            this.add({ edgeId: null, x0: a.x, z0: a.z, x1: b.x, z1: b.z, h0: a.width / 2 + verge, h1: b.width / 2 + verge });
        }
    }

    static verge() { return typeof RoadSurface !== 'undefined' ? RoadSurface.VERGE_M : 1.1; }

    add(segment) {
        const ref = this.segments.length;
        this.segments.push(segment);
        const cell = RoadClearance.HASH_M;
        const reach = Math.max(segment.h0, segment.h1);
        for (let cx = Math.floor((Math.min(segment.x0, segment.x1) - reach) / cell); cx <= Math.floor((Math.max(segment.x0, segment.x1) + reach) / cell); cx++) {
            for (let cz = Math.floor((Math.min(segment.z0, segment.z1) - reach) / cell); cz <= Math.floor((Math.max(segment.z0, segment.z1) + reach) / cell); cz++) {
                const key = cx * 65536 + cz;
                let list = this.hash.get(key);
                if (!list) this.hash.set(key, (list = []));
                list.push(ref);
            }
        }
    }

    // Adds the side edges whose chunks have arrived since the last call
    sync() {
        const data = this.data;
        if (!data || !data.edges || !data.chunks || data.chunks.size === this.chunksSeen) return;
        this.chunksSeen = data.chunks.size;
        const verge = RoadClearance.verge();
        for (const edge of data.edges) {
            if (edge.onRide || this.indexed.has(edge.id)) continue;
            let resident = true;
            for (let k = data.chunkOf(edge.first); k <= data.chunkOf(edge.first + edge.count - 1); k++) if (!data.chunks.has(k)) { resident = false; break; }
            if (!resident) continue;
            const e = data.edgeSamples(edge.id);
            if (!e) continue;
            this.indexed.add(edge.id);
            for (let i = 0; i + 1 < e.x.length; i++) this.add({ edgeId: edge.id, x0: e.x[i], z0: e.z[i], x1: e.x[i + 1], z1: e.z[i + 1], h0: e.width[i] / 2 + verge, h1: e.width[i + 1] / 2 + verge });
        }
    }

    // Metres from (x, z) past the edge of the nearest road band (negative inside one), looked for within `reach`
    // metres; `reach` when there is none that near. `skip(edgeId)` leaves side edges out; `sidesOnly` leaves the ride out.
    clearance(x, z, reach = 20, skip = null, sidesOnly = false) {
        this.sync();
        const cell = RoadClearance.HASH_M;
        let best = reach;
        const seen = new Set();
        for (let cx = Math.floor((x - reach) / cell); cx <= Math.floor((x + reach) / cell); cx++) {
            for (let cz = Math.floor((z - reach) / cell); cz <= Math.floor((z + reach) / cell); cz++) {
                const list = this.hash.get(cx * 65536 + cz);
                if (!list) continue;
                for (const ref of list) {
                    if (seen.has(ref)) continue;
                    seen.add(ref);
                    const g = this.segments[ref];
                    if (g.edgeId === null ? sidesOnly : skip && skip(g.edgeId)) continue;
                    const dx = g.x1 - g.x0, dz = g.z1 - g.z0;
                    const run = dx * dx + dz * dz;
                    const t = run === 0 ? 0 : Math.max(0, Math.min(1, ((x - g.x0) * dx + (z - g.z0) * dz) / run));
                    const past = Math.hypot(g.x0 + dx * t - x, g.z0 + dz * t - z) - (g.h0 + (g.h1 - g.h0) * t);
                    if (past < best) best = past;
                }
            }
        }
        return best;
    }

    // clearance() of the side roads alone, the ride left out
    clearanceOfSides(x, z, reach = 20) {
        return this.clearance(x, z, reach, null, true);
    }

    // Whether a thing of plan radius `radius` at (x, z) keeps `margin` metres clear of every road band
    clearOfRoad(x, z, radius, margin = 0, skip = null) {
        return this.clearance(x, z, radius + margin + 1, skip) >= radius + margin;
    }

    // Whether a rectangle (centre x, z; `along` metres along `heading` and `across` metres across it) keeps `margin`
    // clear of every band: its outline is tested every `step` metres
    clearOfRoadBox(x, z, heading, along, across, margin = 0, skip = null, step = 1) {
        const fx = Math.sin(heading), fz = Math.cos(heading), lx = Math.cos(heading), lz = -Math.sin(heading);
        const a = along / 2, c = across / 2;
        const corners = [[-a, -c], [a, -c], [a, c], [-a, c]];
        for (let k = 0; k < 4; k++) {
            const [p0, q0] = corners[k], [p1, q1] = corners[(k + 1) % 4];
            const n = Math.max(1, Math.ceil(Math.hypot(p1 - p0, q1 - q0) / step));
            for (let i = 0; i < n; i++) {
                const p = p0 + (p1 - p0) * i / n, q = q0 + (q1 - q0) * i / n;
                if (!this.clearOfRoad(x + p * fx + q * lx, z + p * fz + q * lz, 0, margin, skip)) return false;
            }
        }
        return this.clearOfRoad(x, z, 0, margin, skip);
    }
}

// Scenery: what stands on the land of a world, all instanced, none of it random.
//   trees       from the land cover classes (forest, open forest, grass), with the
//               modelled shapes of js/treemodels.js's files when they are loaded
//   buildings   from buildings.bin, in the modelled houses of assets/village/houses.glb
//   landmarks   the boxes of landmarks.json beside the road
//   signposts   a yellow pass signpost at each ride junction (D7 b)
// Placement uses a stable integer hash of the cell, so the same tile is the same
// every time. Nothing is placed in a road: every footprint keeps CLEAR_M of every road band
// (RoadClearance: the ride and every side road, each sample's own width plus the verge), and a
// tile's scenery waits for the side roads round it (WorldEnvironment.buildScenery).
// Counts are capped against the window budget of 1 400 instances,
// nearest first (tiles are built nearest first): TREE_CAP trees, BUILDING_CAP
// instances of house parts, and a few dozen signposts and barriers.
class Scenery {
    static get TREE_CAP() { return 1000; }
    static get BUILDING_CAP() { return 300; }
    // Triangles the trees and houses may add up to in a window (the window budget is 450 000 in all)
    // (200 000 until the far land took about 50 000 of the window: js/world/horizon.js FarLand)
    static get TRIANGLE_CAP() { return 140000; }
    // Boulders on rock and scree, nearest first (20 triangles each)
    static get BOULDER_CAP() { return 160; }
    // Of those, what the houses (4 000 triangles each, 5 parts) may take
    static get HOUSE_TRIANGLES() { return 80000; }
    static get SIGN_CAP() { return 40; }
    static get TREES_PER_TILE() { return 350; }
    // Metres of open ground a tree keeps from the road, the bench and any other road
    static get ROAD_CLEAR_M() { return 6; }
    // Metres past the edge of every road band (its drawn width and the verge, RoadClearance) that the plan footprint
    // of each kind keeps clear: a tree's crown or a boulder, a house, a signpost's board, a landmark
    static get CLEAR_M() { return { tree: 2, boulder: 2, house: 0, signpost: 1.5, landmark: 3 }; }
    // A signpost's board is 1.5 m wide: its plan radius
    static get SIGN_RADIUS_M() { return 0.8; }
    // Metres before a junction a signpost may stand, nearest the junction first
    static get SIGN_BEFORE_M() { return [15, 20, 25, 30, 12, 35, 40]; }
    // Metres along the ride a gate frame may be drawn from its gate, to keep its posts off a side road
    static get GATE_SHIFT_M() { return 15; }
    static get BUILDING_REACH_M() { return 450; }
    // Scale a modelled house is drawn at, at most and at least (the models are about 16 m by 11 m)
    static get HOUSE_SCALE_MAX() { return 1.2; }
    static get HOUSE_SCALE_MIN() { return 0.45; }

    // Integer hash of a cell, 0 to 1
    static hash(ix, iz, salt) {
        let h = Math.imul(ix, 73856093) ^ Math.imul(iz, 19349663) ^ Math.imul(salt, 83492791);
        h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
        return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
    }

    // The shapes and houses of the modelled assets, or null when they cannot be had.
    // loadModel: SceneAssets.loadModel (a path to a promise of {meshes, places})
    static async loadModels(loadModel) {
        try {
            const [conifer, broadleaf, bush, houses] = await Promise.all([
                loadModel('assets/trees/conifer.glb'), loadModel('assets/trees/broadleaf.glb'), loadModel('assets/trees/bush.glb'), loadModel('assets/village/houses.glb')
            ]);
            const pick = (model, kind, names) => names.map(name => ({ kind, name, parts: model.meshes.get(name) })).filter(s => s.parts);
            const trees = [
                ...pick(conifer, 'conifer', ['conifer_spruce', 'conifer_fir', 'conifer_pine']),
                ...pick(broadleaf, 'broadleaf', ['broadleaf_oak', 'broadleaf_beech', 'broadleaf_ash']),
                ...pick(bush, 'bush', ['bush_round', 'bush_low'])
            ];
            const homes = [...houses.meshes.keys()].filter(name => name.startsWith('house_') && !name.includes(':')).sort().map(name => ({ name, parts: houses.meshes.get(name) }));
            if (!trees.length || !homes.length) return null;
            return { trees, houses: homes };
        } catch (error) {
            console.warn(`world scenery: modelled assets unavailable (${error.message}); using plain shapes`);
            return null;
        }
    }

    constructor(ground, data, models = null) {
        this.ground = ground;
        this.data = data;
        this.models = models;
        this.perTile = new Map();
        this.treeCount = 0;
        this.houseInstances = 0;
        this.houseTriangles = 0;
        this.triangles = 0;
        this.fallback = null;
        // The road bands everything here keeps clear of (null for a ground with no route: nothing to keep clear of)
        this.roads = ground && ground.route && ground.route.points ? new RoadClearance(ground.route, data) : null;
    }

    // Whether a thing of plan radius `radius` at (x, z) keeps `margin` clear of every road band
    clearOfRoad(x, z, radius, margin = 0) {
        return !this.roads || this.roads.clearOfRoad(x, z, radius, margin);
    }

    // The radius in plan of a set of parts about its origin, whichever way it is turned (measured once)
    static planRadius(shape) {
        if (shape.planRadius === undefined) {
            let x = 0, z = 0;
            for (const part of shape.parts) {
                part.geometry.computeBoundingBox();
                const box = part.geometry.boundingBox;
                x = Math.max(x, Math.abs(box.min.x), Math.abs(box.max.x));
                z = Math.max(z, Math.abs(box.min.z), Math.abs(box.max.z));
            }
            shape.planRadius = Math.hypot(x, z);
        }
        return shape.planRadius;
    }

    // Plain shapes for when no model is loaded: a cone, a ball on a trunk's height, a low blob
    plain() {
        if (!this.fallback) {
            const material = (hex) => new THREE.MeshLambertMaterial({ color: hex, flatShading: true });
            const cone = new THREE.ConeGeometry(2.2, 9, 6); cone.translate(0, 4.5, 0);
            const ball = new THREE.IcosahedronGeometry(3, 0); ball.translate(0, 5.5, 0);
            const blob = new THREE.IcosahedronGeometry(1, 0); blob.translate(0, 0.6, 0);
            const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
            this.fallback = {
                trees: [
                    { kind: 'conifer', name: 'plain_conifer', parts: [{ geometry: cone, material: material(0x2d4a2d) }] },
                    { kind: 'broadleaf', name: 'plain_broadleaf', parts: [{ geometry: ball, material: material(0x4d6d34) }] },
                    { kind: 'bush', name: 'plain_bush', parts: [{ geometry: blob, material: material(0x587a3a) }] }
                ],
                houses: [{ name: 'plain_house', parts: [{ geometry: box, material: material(0xb8aa94) }], plain: true }]
            };
        }
        return this.fallback;
    }

    set() { return this.models || this.plain(); }

    shapesOf(kind) { return this.set().trees.filter(s => s.kind === kind); }

    // Whether open ground at (x, z) is clear of road, bench and wall, and dry, and a thing of plan radius `radius`
    // there keeps `margin` clear of every road band (the zone layer is 8 m nodes and knows only the side roads drawn
    // so far; the bands are every sample's own width)
    clear(x, z, radius = 0, margin = 0) {
        const g = this.ground;
        const around = Scenery.ROAD_CLEAR_M;
        for (const [dx, dz] of [[0, 0], [around, 0], [-around, 0], [0, around], [0, -around]]) {
            if (g.kindAt(x + dx, z + dz) !== 'runoff' || g.tileZone(x + dx, z + dz) === WorldData.ZONE.water) return false;
        }
        return this.clearOfRoad(x, z, radius, margin);
    }

    // Tree sites of a tile: [{x, y, z, shape, scale, turn}] in cell order, capped
    treeSites(tile, cover) {
        const sites = [];
        if (!cover) return sites;
        const n = WorldData.COVER_N;
        const cell = WorldData.TILE_M / n;
        for (let cj = 0; cj < n; cj++) {
            for (let ci = 0; ci < n; ci++) {
                const cls = cover[cj * n + ci];
                const chance = cls === 1 ? 0.55 : cls === 2 ? 0.2 : cls === 5 ? 0.025 : 0;
                if (!chance) continue;
                const ix = tile.tx * n + ci, iz = tile.tz * n + cj;
                if (Scenery.hash(ix, iz, 1) >= chance) continue;
                const x = tile.tx * WorldData.TILE_M + (ci + Scenery.hash(ix, iz, 2)) * cell;
                const z = tile.tz * WorldData.TILE_M + (cj + Scenery.hash(ix, iz, 3)) * cell;
                const y = this.ground.tileHeight(x, z);
                if (y === null || y > 2300) continue;
                const roll = Scenery.hash(ix, iz, 4);
                const kind = cls === 5 ? 'bush' : y > 1750 || roll < 0.6 ? (cls === 2 && roll < 0.2 ? 'bush' : 'conifer') : 'broadleaf';
                const shapes = this.shapesOf(kind);
                if (!shapes.length) continue;
                const shape = shapes[Math.floor(Scenery.hash(ix, iz, 5) * shapes.length)];
                const scale = 0.8 + 0.6 * Scenery.hash(ix, iz, 6);
                // The whole crown keeps clear of every road band, not only the trunk
                if (!this.clear(x, z, Scenery.planRadius(shape) * scale, Scenery.CLEAR_M.tree)) continue;
                sites.push({ x, y, z, shape, scale, turn: Scenery.hash(ix, iz, 7) * Math.PI * 2 });
                if (sites.length >= Scenery.TREES_PER_TILE) return sites;
            }
        }
        return sites;
    }

    // Boulder sites of a tile: [{x, y, z, size, turn}] on rock and scree cells clear of the roads
    boulderSites(tile, cover) {
        const sites = [];
        if (!cover) return sites;
        const n = WorldData.COVER_N;
        const cell = WorldData.TILE_M / n;
        for (let cj = 0; cj < n; cj++) {
            for (let ci = 0; ci < n; ci++) {
                const cls = cover[cj * n + ci];
                const chance = cls === 4 ? 0.14 : cls === 3 ? 0.06 : 0;
                if (!chance) continue;
                const ix = tile.tx * n + ci, iz = tile.tz * n + cj;
                if (Scenery.hash(ix, iz, 31) >= chance) continue;
                const x = tile.tx * WorldData.TILE_M + (ci + Scenery.hash(ix, iz, 32)) * cell;
                const z = tile.tz * WorldData.TILE_M + (cj + Scenery.hash(ix, iz, 33)) * cell;
                const size = 0.8 + 2.2 * Scenery.hash(ix, iz, 34) ** 2;
                // A boulder is drawn 1.3 by 1 times its size in plan (buildTile)
                if (!this.clear(x, z, size * Math.hypot(1.3, 1), Scenery.CLEAR_M.boulder)) continue;
                const y = this.ground.tileHeight(x, z);
                if (y === null) continue;
                sites.push({ x, y: y - 0.3, z, size, turn: Scenery.hash(ix, iz, 35) * Math.PI * 2 });
            }
        }
        return sites;
    }

    // A boulder: a flattened, flat-shaded icosahedron in grey granite
    static boulderPart() {
        if (!Scenery.boulder) {
            const geometry = new THREE.IcosahedronGeometry(1, 0);
            geometry.translate(0, 0.45, 0);
            Scenery.boulder = { geometry, material: new THREE.MeshLambertMaterial({ color: 0x8a857c, flatShading: true }) };
        }
        return Scenery.boulder;
    }

    static trianglesOf(parts) {
        return parts.reduce((sum, part) => sum + (part.geometry.index ? part.geometry.index.count : part.geometry.attributes.position.count) / 3, 0);
    }

    // Instanced meshes for a list of placements of one set of parts; parts' geometry and material are shared, never freed here
    instanced(parts, matrices, name, group) {
        for (const part of parts) {
            const mesh = new THREE.InstancedMesh(part.geometry, part.material, matrices.length);
            matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
            mesh.instanceMatrix.needsUpdate = true;
            mesh.name = name;
            mesh.frustumCulled = false;
            mesh.userData.world = 'scenery';
            group.add(mesh);
        }
    }

    // The trees and houses of a tile as one group, or null when it has none. `bike` ranks the tile's share of the caps.
    buildTile(tile, cover, buildings, bike) {
        this.disposeTile(tile.key);
        const group = new THREE.Group();
        group.name = `world-scenery-${tile.key}`;
        const rotation = new THREE.Quaternion();
        const up = new THREE.Vector3(0, 1, 0);
        const position = new THREE.Vector3();
        const scale = new THREE.Vector3();
        const held = { trees: 0, house: 0, treeTriangles: 0, houseTriangles: 0 };

        // Trees take the triangles the houses leave, nearest first; the houses are the village and come first
        const houseRoom = Math.max(0, Scenery.HOUSE_TRIANGLES - this.houseTriangles);
        const homes = this.set().houses;
        const byHome = new Map();
        const nearest = buildings.slice().sort((p, q) => Math.hypot(p.x - bike.x, p.z - bike.z) - Math.hypot(q.x - bike.x, q.z - bike.z));
        for (const b of nearest) {
            if (Math.hypot(b.x - bike.x, b.z - bike.z) > Scenery.BUILDING_REACH_M) continue;
            if (this.ground.kindAt(b.x, b.z) !== 'runoff') continue;
            // The mapped footprint (b.w across its heading, b.d along it) stays off every road band
            if (this.roads && !this.roads.clearOfRoadBox(b.x, b.z, b.heading, b.d, b.w, Scenery.CLEAR_M.house)) continue;
            const pose = this.housePose(b, homes[Math.floor(Scenery.hash(Math.round(b.x), Math.round(b.z), 8) * homes.length)]);
            const home = pose.home;
            const cost = Scenery.trianglesOf(home.parts);
            if (this.houseInstances + held.house + home.parts.length > Scenery.BUILDING_CAP || held.houseTriangles + cost > houseRoom) continue;
            const half = Math.max(b.w, b.d) / 2;
            let low = Infinity;
            for (const [dx, dz] of [[0, 0], [half, half], [-half, half], [half, -half], [-half, -half]]) low = Math.min(low, this.ground.tileHeight(b.x + dx, b.z + dz) ?? Infinity);
            if (!Number.isFinite(low)) continue;
            rotation.setFromAxisAngle(up, pose.turn);
            scale.set(pose.scale[0], pose.scale[1], pose.scale[2]);
            // The model's own middle goes on the middle of the footprint
            position.set(-pose.centre[0] * pose.scale[0], 0, -pose.centre[1] * pose.scale[2]).applyQuaternion(rotation);
            position.x += b.x;
            position.z += b.z;
            position.y = low - 0.3;
            const list = byHome.get(home) || [];
            list.push(new THREE.Matrix4().compose(position, rotation, scale));
            byHome.set(home, list);
            held.house += home.parts.length;
            held.houseTriangles += cost;
        }
        for (const [home, matrices] of byHome) this.instanced(home.parts, matrices, `houses:${home.name}`, group);

        let sites = this.treeSites(tile, cover);
        sites.sort((p, q) => Math.hypot(p.x - bike.x, p.z - bike.z) - Math.hypot(q.x - bike.x, q.z - bike.z));
        const treeRoom = Math.max(0, Scenery.TRIANGLE_CAP - this.triangles - held.houseTriangles);
        const taken = [];
        let spent = 0;
        for (const site of sites) {
            const cost = Scenery.trianglesOf(site.shape.parts);
            if (this.treeCount + taken.length >= Scenery.TREE_CAP || spent + cost > treeRoom) break;
            taken.push(site);
            spent += cost;
        }
        const byShape = new Map();
        for (const site of taken) {
            rotation.setFromAxisAngle(up, site.turn);
            position.set(site.x, site.y - 0.2, site.z);
            scale.set(site.scale, site.scale, site.scale);
            const list = byShape.get(site.shape) || [];
            list.push(new THREE.Matrix4().compose(position, rotation, scale));
            byShape.set(site.shape, list);
        }
        for (const [shape, matrices] of byShape) this.instanced(shape.parts, matrices, `trees:${shape.name}`, group);
        held.trees = taken.length;
        held.treeTriangles = spent;

        // Boulders on the rock and scree cells, as many as the cap leaves
        const stones = this.boulderSites(tile, cover).sort((p, q) => Math.hypot(p.x - bike.x, p.z - bike.z) - Math.hypot(q.x - bike.x, q.z - bike.z)).slice(0, Math.max(0, Scenery.BOULDER_CAP - (this.boulderCount || 0)));
        if (stones.length) {
            const matrices = stones.map((b) => {
                rotation.setFromAxisAngle(up, b.turn);
                position.set(b.x, b.y, b.z);
                scale.set(b.size * 1.3, b.size * 0.8, b.size);
                return new THREE.Matrix4().compose(position, rotation, scale);
            });
            this.instanced([Scenery.boulderPart()], matrices, 'boulders', group);
        }
        held.boulders = stones.length;
        held.boulderTriangles = stones.length * 20;

        if (!group.children.length) return null;
        this.boulderCount = (this.boulderCount || 0) + held.boulders;
        this.triangles += held.boulderTriangles;
        this.treeCount += held.trees;
        this.houseInstances += held.house;
        this.houseTriangles += held.houseTriangles;
        this.triangles += held.treeTriangles + held.houseTriangles;
        this.perTile.set(tile.key, { group, ...held });
        return group;
    }

    // A house model's extent on the ground, measured once: [width (x), depth (z)] and the middle [x, z]
    static footprintOf(home) {
        if (!home.footprint) {
            const box = new THREE.Box3();
            for (const part of home.parts) {
                part.geometry.computeBoundingBox();
                box.union(part.geometry.boundingBox);
            }
            home.footprint = { size: [Math.max(1, box.max.x - box.min.x), Math.max(1, box.max.z - box.min.z)], centre: [(box.min.x + box.max.x) / 2, (box.min.z + box.max.z) / 2] };
        }
        return home.footprint;
    }

    // How a building of the map is drawn: { home, turn, scale [x, y, z], centre [x, z] }. A modelled house stands
    // inside the mapped footprint, turned a quarter when that fills more of it, and never larger than
    // HOUSE_SCALE_MAX; the footprint clears every road band (tools/world/buildings.mjs), so the house does too.
    // A footprint too small for a house at HOUSE_SCALE_MIN (a shed, a garage) is a plain box of its own size.
    housePose(b, home) {
        const plain = this.plain().houses[0];
        if (!home.plain) {
            const { size, centre } = Scenery.footprintOf(home);
            const straight = Math.min(b.w / size[0], b.d / size[1]);
            const turned = Math.min(b.d / size[0], b.w / size[1]);
            const fit = Math.min(Scenery.HOUSE_SCALE_MAX, Math.max(straight, turned));
            if (fit >= Scenery.HOUSE_SCALE_MIN) return { home, turn: b.heading + (turned > straight ? Math.PI / 2 : 0), scale: [fit, fit, fit], centre };
        }
        return { home: plain, turn: b.heading, scale: [b.w, b.h || 6, b.d], centre: [0, 0] };
    }

    // Frees the instance buffers of a tile's scenery; the shared geometry and materials stay
    disposeTile(key) {
        const held = this.perTile.get(key);
        if (!held) return;
        held.group.traverse(child => { if (child.isInstancedMesh) child.dispose(); });
        if (held.group.parent) held.group.parent.remove(held.group);
        this.treeCount -= held.trees;
        this.houseInstances -= held.house;
        this.houseTriangles -= held.houseTriangles;
        this.triangles -= held.treeTriangles + held.houseTriangles + (held.boulderTriangles || 0);
        this.boulderCount = (this.boulderCount || 0) - (held.boulders || 0);
        this.perTile.delete(key);
    }

    // The chunks of the side roads round the junctions and the landmarks, which the fixtures are placed clear of:
    // WorldEnvironment.load has them before it builds the signposts and the landmarks
    static fixtureChunks(data) {
        const wanted = new Set();
        for (const j of data.junctions || []) for (const k of data.chunksNear(data.nodes.x[j.node], data.nodes.z[j.node], 120)) wanted.add(k);
        for (const l of (data.manifest && data.manifest.landmarks) || []) if (Number.isFinite(l.x)) for (const k of data.chunksNear(l.x, l.z, 250)) wanted.add(k);
        return [...wanted];
    }

    // Where the yellow pass signposts stand: one for each pass of the ride through a junction, SIGN_BEFORE_M before
    // it, on the rider's right (else the left) past the verge, the board keeping CLEAR_M.signpost of every road band.
    // [{x, y, z, heading, junctionId}], heading the way the rider arrives. A pass with no clear place gets none.
    signpostPoses(junctions, route) {
        const poses = [];
        const p = {};
        const radius = Scenery.SIGN_RADIUS_M, margin = Scenery.CLEAR_M.signpost;
        for (const junction of junctions) {
            for (const pass of junction.passes) {
                if (pass.inEdge === null || pass.inEdge === undefined) continue;
                let found = null;
                for (const before of Scenery.SIGN_BEFORE_M) {
                    if (pass.sIn - before < 0) continue;
                    route.sample(pass.sIn - before, p);
                    const out = p.width / 2 + RoadClearance.verge() + radius + margin + 0.2;
                    // A positive lateral is to the rider's right (a heading turns right as it grows: WorldGraph.turnOf)
                    for (const side of [1, -1]) {
                        for (const extra of [0, 1.5, 3]) {
                            const o = side * (out + extra);
                            const x = p.x + o * Math.cos(p.heading), z = p.z - o * Math.sin(p.heading);
                            if (this.clearOfRoad(x, z, radius, margin)) { found = { x, y: p.y, z, heading: p.heading, junctionId: junction.id }; break; }
                        }
                        if (found) break;
                    }
                    if (found) break;
                }
                if (found) poses.push(found);
            }
        }
        return poses;
    }

    // Where a gate frame is drawn for a gate at ride distance s: s itself, or the nearest s within GATE_SHIFT_M (ahead
    // first) where both posts (`out(sample)` metres either side of the centre line) stand clear of every side road; the
    // ride's own band reaches them by design (they stand on its verge). The timing line stays at s; only the frame moves.
    gateS(s, out, route) {
        if (!this.roads) return s;
        const p = {};
        const clearAt = (at) => {
            route.sample(at, p);
            const o = out(p);
            for (const side of [-1, 1]) {
                const x = p.x + side * o * Math.cos(p.heading), z = p.z - side * o * Math.sin(p.heading);
                if (this.roads.clearanceOfSides(x, z, 3) < 0.3) return false;
            }
            return true;
        };
        if (clearAt(s)) return s;
        for (let d = 1; d <= Scenery.GATE_SHIFT_M; d++) {
            for (const at of [s + d, s - d]) if (at >= 0 && at <= route.length && clearAt(at)) return at;
        }
        return s;
    }

    // The yellow pass signposts, one instanced mesh: [{x, y, z, heading}] where heading is the way the rider arrives
    signposts(poses) {
        const out = { positions: [], shades: [] };
        const pole = [0.45, 0.45, 0.47], board = [0.95, 0.78, 0.10], text = [0.12, 0.12, 0.12];
        RoadMesh.box(out, 0, 1.5, 0, 0.12, 3, 0.12, 0, pole);
        RoadMesh.box(out, 0, 2.7, 0.04, 1.5, 0.55, 0.06, 0, board);
        RoadMesh.box(out, 0, 2.7, 0.08, 1.2, 0.08, 0.02, 0, text);
        const mesh = new THREE.InstancedMesh(RoadMesh.geometry(out.positions, out.shades), new THREE.MeshLambertMaterial({ vertexColors: true }), Math.max(1, Math.min(poses.length, Scenery.SIGN_CAP)));
        const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), position = new THREE.Vector3(), scale = new THREE.Vector3(1, 1, 1);
        const count = Math.min(poses.length, Scenery.SIGN_CAP);
        for (let i = 0; i < count; i++) {
            rotation.setFromAxisAngle(up, poses[i].heading + Math.PI);
            position.set(poses[i].x, poses[i].y, poses[i].z);
            matrix.compose(position, rotation, scale);
            mesh.setMatrixAt(i, matrix);
        }
        mesh.count = count;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.name = 'world-signposts';
        mesh.frustumCulled = false;
        mesh.userData.world = 'signposts';
        return mesh;
    }

    // Where a landmark's box stands: beside the ride at its s (the left first, as it always stood), moved out and along
    // until the whole box, turned any way, keeps CLEAR_M.landmark of every road band; null when nowhere near is clear
    landmarkPlace(l, route) {
        const radius = Math.hypot(l.size[0], l.size[2]) / 2;
        const margin = Scenery.CLEAR_M.landmark;
        const sample = {};
        for (const along of [0, -20, 20, -40, 40, -60, 60]) {
            route.sample(Math.max(0, Math.min(route.length, l.s + along)), sample);
            const base = sample.width / 2 + RoadClearance.verge() + radius + margin;
            for (let extra = 0; extra <= 60; extra += 4) {
                for (const side of [-1, 1]) {
                    const out = side * (base + extra);
                    const x = sample.x + out * Math.cos(sample.heading), z = sample.z - out * Math.sin(sample.heading);
                    if (this.clearOfRoad(x, z, radius, margin)) return { x, z, y: sample.y, heading: sample.heading };
                }
            }
        }
        return null;
    }

    // The boxes of landmarks.json, set beside the road they were snapped to: [{name, asset, size, x, y, z, heading}]
    landmarks(list, route) {
        const group = new THREE.Group();
        group.name = 'world-landmarks';
        for (const l of list) {
            if (l.asset !== 'box' || !l.size) continue;
            const place = this.landmarkPlace(l, route);
            if (!place) {
                console.warn(`world landmark ${l.name}: no place clear of the roads near s ${l.s}; left out`);
                continue;
            }
            const sample = { y: place.y, heading: place.heading };
            const x = place.x, z = place.z;
            const ground = this.ground.tileHeight(x, z);
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(l.size[0], l.size[1], l.size[2]), new THREE.MeshLambertMaterial({ color: 0x9d9486 }));
            mesh.position.set(x, (ground === null ? sample.y : Math.min(ground, sample.y)) + l.size[1] / 2 - 0.5, z);
            mesh.rotation.y = sample.heading;
            mesh.name = `landmark:${l.name}`;
            mesh.userData.world = 'landmark';
            group.add(mesh);
        }
        return group;
    }
}
