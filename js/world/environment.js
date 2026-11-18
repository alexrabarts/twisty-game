// WorldEnvironment: what Game holds as `environment` on a world ride (js/ridemode.js
// says when). It is the world's answer to Environment (js/environment.js, the leg
// engine): the same members the game reads (route, ground, roadWidth,
// checkpoints, finishGate, config, physics...), built over the streamed world
// data instead of a 20 m profile.
//
// Members the game reads of a leg, and what a world gives (the code that must not run in a world
// is not constructed, so nothing here is "switched off"):
//   route, ground, roadWidth, physics, config            implemented
//   checkpoints, finishGate                              the stage's gates, from the stations
//   startSegment, endSegment, trafficSpeedScale          the span traffic keeps to, and how fast it goes
//   terrain, terrainGeometry, sections, setPieces,
//   roadworksZones, roadworkObstacles, jumpRamps,
//   boulders                                             null / empty: no cones, rockfalls or roadworks are built
//   applyLandscapeConfig                                 fog density only
//   applyWeatherVisuals, resolveRoadSurface,
//   writeRoadSurface                                     the road's wetness (RoadSurface.setWet)
//
// A world is loaded with WorldEnvironment.load(), which waits for the ride layer
// (data.js) before the first frame: the route contract is synchronous.
class WorldEnvironment {
    // Half-width of the gate band, beyond the road edge
    static get GATE_REACH_M() { return 6; }

    // The camera's far plane in a world: past the far land's 40 km reach. Depth steps hardly change with the far plane
    // (they go as d^2 / near), so this costs the near ground nothing
    static get FAR_PLANE_M() { return 60000; }

    // Metres the rider starts along the ride, so the road's cut end is behind the camera
    static get START_M() { return 20; }

    // A side road inside the ride's band: how far under the ride surface it is held, how far past the road edge
    // (the ride ribbon's kerb) that reaches, and the height apart beyond which it is a road over or under the ride
    static get SIDE_UNDER_M() { return 0.01; }
    static get SIDE_KERB_M() { return 0.5; }
    static get SIDE_PASS_M() { return 2; }
    // The edge works (edgeFoot): metres under a road edge that another road must lie for the edge to stand on a wall down to it;
    // how far out the importer's zone is read for a retaining wall; how far under the edge the drawn land may lie
    // before an apron runs down to it (the land is drawn SINK_M under the road); the apron where no tile is resident
    static get DECK_UNDER_M() { return 1.5; }
    static get FOOT_PROBE_M() { return 1.5; }
    static get MEET_M() { return 0.25; }
    static get APRON_M() { return 3; }
    // The farthest an apron runs out from the edge before it must have met the land
    static get APRON_RUN_M() { return 6; }

    // Metres from the bike within which a landmark is drawn
    static get LANDMARK_REACH_M() { return 3000; }

    // The ride progress the barrier set is chosen by is rounded to this many metres
    static get BARRIER_STEP_M() { return 20; }

    static async load(scene, { id = 'all', search = '', fetchFn = null, models = undefined, digest = null } = {}) {
        const resolved = WorldData.resolveBase(new URLSearchParams(search).get('worldData'));
        if (resolved.error) throw new Error(resolved.error);
        const data = new WorldData({ base: resolved.base, overridden: resolved.overridden, fetchFn, digest });
        await data.load();
        // The side roads round the junctions and landmarks, which the signposts and landmarks keep clear of
        await data.ensureChunks(Scenery.fixtureChunks(data)).catch(error => console.warn(`world fixture chunks: ${error.message}`));
        // The land and cover round the landmarks, which a landmark stands on dry and seated
        await Promise.all(Scenery.fixtureTiles(data).map(key => Promise.all([data.ensureTile(key), data.ensureCover(key)]))).catch(error => console.warn(`world fixture tiles: ${error.message}`));
        const stage = id === 'all' ? null : data.manifest.stages.find(s => s.id === id);
        if (id !== 'all' && !stage) throw new Error(`unknown world "${id}"; known: all, ${data.manifest.stages.map(s => s.id).join(', ')}`);
        const loaded = models === undefined && typeof SceneAssets !== 'undefined' ? await Scenery.loadModels(SceneAssets.loadModel) : (models || null);
        // The landmark models: loaded with the scenery's, or given with the models (a stand-in in node)
        const landmarks = models === undefined && typeof SceneAssets !== 'undefined' ? await Scenery.loadLandmarks(data.manifest.landmarks || [], SceneAssets.loadModel) : (models && models.landmarks) || null;
        await Promise.all([data.ensureFar().catch(() => null), data.ensureBuildings().catch(() => null), data.ensureFarLand().catch((error) => { console.warn(`world far land unavailable (${error.message}); the horizon ends at far.bin`); return null; })]);
        return new WorldEnvironment(scene, data, { stage, models: loaded, landmarks });
    }

    constructor(scene, data, { stage = null, models = null, landmarks = null } = {}) {
        this.isWorld = true;
        this.scene = scene;
        this.data = data;
        this.stage = stage;
        this.graph = new WorldGraph(data);
        const samples = this.graph.rideSamples();
        if (!samples) throw new Error('world ride is not resident');
        this.route = new WorldRoute(samples, { stations: data.ride.stations, stages: data.ride.stages, graph: this.graph });
        this.ground = new WorldGround(this.route, data);
        this.physics = WorldPhysics;
        this.roadWidth = this.route.points.length ? this.route.points[0].width : 10;
        this.trusted = data.trusted;
        this.credit = data.manifest.credit;

        // What the game reads of a leg and a world has none of
        this.terrain = null;
        this.terrainGeometry = null;
        this.sections = null;
        this.setPieces = [];
        this.roadworksZones = [];
        this.roadworkObstacles = [];
        this.jumpRamps = [];
        this.boulders = [];
        // Traffic holds to this share of its leg speed: the crew cannot take a hairpin at 50 m/s
        this.trafficSpeedScale = 0.4;
        this.config = { id: stage ? stage.id : 'world', look: { fogDensity: WorldLooks.clearFog }, render: { shadowSpan: 120, cullMax: 6000 }, grip: 1 };

        this.group = new THREE.Group();
        this.group.name = 'world';
        this.tileGroup = new THREE.Group();
        this.waitingOnTile = new Map();
        this.roadGroup = new THREE.Group();
        this.sideGroup = new THREE.Group();
        this.sceneryGroup = new THREE.Group();
        this.group.add(this.tileGroup, this.roadGroup, this.sideGroup, this.sceneryGroup);
        scene.add(this.group);

        this.tileMeshes = new Map();
        // Simulated milliseconds since the world loaded: what the streamer's 3 s of disposal grace is measured on
        this.streamClockMs = 0;
        this.roadMeshes = new Map();
        this.sideMeshes = new Map();
        this.sideEdges = new Map();
        // The pieces of each side chunk's roads (sidePieces), for the streamer's LOD0 test (WorldStreamer.sideNear)
        this.sidePieceCache = new Map();
        this.scenery = new Scenery(this.ground, data, models);
        this.scenery.landmarkModels = landmarks;
        this.barrierMesh = RoadMesh.barriers();
        this.group.add(this.barrierMesh);
        this.barrierKey = '';
        this.triangleCount = 0;
        this.lastBike = { x: this.route.sample(this.startS, {}).x, z: this.route.sample(this.startS, {}).z };

        this.buildStationsAndGates();
        this.buildFixtures();
        this.streamer = new WorldStreamer({
            data, route: this.route,
            // Simulated time, not frames and not the wall clock: the 3 s of grace is 3 s of riding at any frame rate,
            // and a ride stepped faster than real time still lets go of what it has left behind
            clock: () => this.streamClockMs,
            hooks: {
                buildTile: (key, lod) => this.buildTile(key, lod),
                buildScenery: (key, lod) => this.buildScenery(key, lod),
                disposeTile: key => this.disposeTile(key),
                buildRoad: (section, lod) => this.buildRoad(section, lod),
                disposeRoad: section => this.disposeRoad(section),
                buildSide: (k, near) => this.buildSide(k, near),
                sidePieces: k => this.sidePieces(k),
                disposeSide: k => this.disposeSide(k)
            }
        });
        this.guide = new WorldGuide(this);
    }

    // Called with each mesh or group a build step adds. The game sets it to decode the vertex colours at once
    // (Graphics.fixColorSpaces): its own scan runs every 1.5 s, and a tile drawn before it is pale.
    onMeshBuilt() {}

    get startS() { return (this.stage ? this.stage.from : 0) + WorldEnvironment.START_M; }

    get endS() { return this.stage ? this.stage.to : this.route.length; }

    // The stage's span in route units, as traffic keeps its cars inside it
    get startSegment() { return Math.floor(this.route.toUnits(this.stage ? this.stage.from : 0)); }

    get endSegment() { return Math.floor(this.route.toUnits(this.endS)); }

    // Where the rider starts: {x, y, z, heading}
    startPosition() {
        return this.route.sample(this.startS, {});
    }

    // The stage's stations as game gates: every station but the first is a gate, the last is the finish
    buildStationsAndGates() {
        const from = this.stage ? this.stage.from : 0;
        const to = this.endS;
        const inStage = this.route.stations.filter(st => st.s >= from - 0.01 && st.s <= to + 0.01);
        const reach = WorldEnvironment.GATE_REACH_M;
        const gate = (st, kind, index) => {
            const p = this.route.sample(st.s, {});
            const half = p.width / 2 + reach;
            return { kind, index, position: new THREE.Vector3(p.x, p.y, p.z), heading: p.heading, passed: false, width: 8, left: half, right: half, segmentIndex: Math.floor(this.route.toUnits(st.s)), s: st.s };
        };
        const gates = inStage.slice(1, -1);
        this.checkpoints = gates.map((st, i) => gate(st, 'checkpoint', i));
        const last = inStage[inStage.length - 1];
        this.finishGate = last ? gate(last, 'finish', gates.length) : null;
        this.stationGates = inStage;
    }

    // The things built once: the horizon, the gate frames, the checkpoint boards, the signposts and the landmarks
    buildFixtures() {
        if (this.data.far) {
            const horizon = Horizon.build(this.data.far, this.data.farCover, this.data.farSink);
            this.horizon = horizon.mesh;
            this.triangleCount += horizon.triangles;
            this.group.add(this.horizon);
            // The mountains out to 40 km: the camera's far plane reaches them (WorldEnvironment.FAR_PLANE_M)
            this.farLand = FarLand.build(this.data.farLevels || [], this.data.far).map(({ mesh, triangles }) => {
                this.triangleCount += triangles;
                this.group.add(mesh);
                return mesh;
            });
        }
        // The arch stands at the start and the finish only; each checkpoint between has its roadworks boards
        const stations = this.stationGates || [];
        const ends = stations.filter((st, i) => i === 0 || i === stations.length - 1);
        const marked = stations.slice(1, -1);
        if (marked.length) {
            this.markerMesh = this.scenery.markers(this.scenery.markerPoses(marked, this.route));
            this.group.add(this.markerMesh);
        }
        const out = { positions: [], shades: [] };
        const post = [0.55, 0.55, 0.58];
        for (const st of ends) {
            // The frame stands off any side road its posts would be in (Scenery.gateS); the timing line stays at st.s
            const postOut = q => q.width / 2 + 1.2;
            const p = this.route.sample(this.scenery.gateS(st.s, postOut, this.route), {});
            const half = postOut(p);
            const color = st.kind === 'start' || st.kind === 'finish' ? [0.92, 0.92, 0.92] : [0.95, 0.75, 0.10];
            for (const sign of [-1, 1]) RoadMesh.box(out, p.x + sign * half * Math.cos(p.heading), p.y + 2.6, p.z - sign * half * Math.sin(p.heading), 0.3, 5.2, 0.3, p.heading, post);
            RoadMesh.box(out, p.x, p.y + 5.3, p.z, half * 2 + 0.6, 0.8, 0.3, p.heading, color);
        }
        if (out.positions.length) {
            this.gateMesh = RoadMesh.mesh(RoadMesh.geometry(out.positions, out.shades), 'world-gates');
            this.group.add(this.gateMesh);
        }
        // Beside the ride before each junction, clear of every road (Scenery.signpostPoses)
        const poses = this.scenery.signpostPoses(this.graph.junctions, this.route);
        if (poses.length) {
            this.signMesh = this.scenery.signposts(poses);
            this.group.add(this.signMesh);
        }
        this.landmarkGroup = this.scenery.landmarks(this.data.manifest.landmarks || [], this.route);
        this.group.add(this.landmarkGroup);
        this.group.traverse(o => { if (o.isMesh) o.userData.skipCulling = true; });
    }

    buildTile(key, lod) {
        const tile = this.data.tile(key);
        const cover = this.data.cover(key);
        const old = this.tileMeshes.get(key);
        if (old) {
            this.tileGroup.remove(old.mesh);
            old.mesh.geometry.dispose();
            this.triangleCount -= old.triangles;
        }
        // A carved cell inside the ride's band can hold a side road's height (a junction); drawn, it stays under the ride
        const built = TerrainMesh.build(tile, cover, lod, (x, y, z) => {
            const low = this.rideSurfaceAt(x, z, y);
            return low === null ? y : Math.min(y, low - TerrainMesh.SINK_M);
        }, this.nearTile);
        built.mesh.userData.skipCulling = true;
        this.tileGroup.add(built.mesh);
        this.onMeshBuilt(built.mesh);
        // A tile reads its neighbours' nodes across its edges: one whose data is not here yet is read as this tile's
        // own edge, so the tile is built again when it comes (else the shared edge differs between the two)
        const [tx, tz] = key.split(',').map(Number);
        const around = [];
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (dx || dz) around.push(`${tx + dx},${tz + dz}`);
        built.missing = around.filter(k => this.hasTileData(k) && !this.data.tile(k));
        this.tileMeshes.set(key, built);
        this.triangleCount += built.triangles;
        for (const k of around) {
            const held = this.tileMeshes.get(k);
            if (!held || !held.missing || !held.missing.includes(key)) continue;
            held.missing = held.missing.filter(m => m !== key);
            this.streamer.enqueue(`seam:${k}`, 0, () => {
                const state = this.streamer.tiles.get(k);
                if (state && this.tileMeshes.has(k) && this.data.tile(k)) this.buildTile(k, state.lod);
            });
        }
        this.rebuildWaiting(key);
    }

    // A resident height tile by key, or null (TerrainMesh.node reads a neighbour's nodes through it)
    get nearTile() {
        return this.nearTileFn || (this.nearTileFn = k => this.data.tile(k));
    }

    // Whether the world has a height tile at key (resident or not)
    hasTileData(key) {
        if (!this.tileKeys) this.tileKeys = new Set(((this.data.manifest && this.data.manifest.tiles && this.data.manifest.tiles.height) || []).map(([tx, tz]) => `${tx},${tz}`));
        return this.tileKeys.has(key);
    }

    // The road sections and side chunks whose edge works were built without this tile, built again through the queue
    rebuildWaiting(key) {
        const waiting = this.waitingOnTile.get(key);
        if (!waiting) return;
        this.waitingOnTile.delete(key);
        for (const id of waiting) {
            const [kind, value] = id.split(':');
            const index = Number(value);
            this.streamer.enqueue(`works:${id}`, 0, () => {
                const held = this.streamer.roads.get(index);
                if (kind === 'road' && held && this.roadMeshes.has(index)) this.buildRoad(this.streamer.sections[index], held.lod);
                else if (kind === 'side' && this.sideMeshes.has(index)) {
                    const held = this.streamer.sides.get(index);
                    this.disposeSide(index);
                    this.buildSide(index, held ? held.near : '');
                }
            });
        }
    }

    // Trees and houses stand on the detailed tiles only (a step of its own: the streamer queues it after the land)
    buildScenery(key, lod) {
        if (lod > 1) {
            this.scenery.disposeTile(key);
            return;
        }
        if (this.scenery.perTile.has(key)) return;
        const tile = this.data.tile(key);
        if (!tile) return;
        const [tx, tz] = key.split(',').map(Number);
        const m = WorldData.TILE_M;
        // The side roads on and round the tile first: what stands on it keeps clear of them (Scenery.clear). A tile that
        // waits for them holds back every farther tile too, so the caps still go nearest first (Scenery.buildTile)
        const chunks = this.data.chunksNear((tx + 0.5) * m, (tz + 0.5) * m, m * 0.75);
        if (!this.sceneryWaiting) this.sceneryWaiting = new Map();
        if (chunks.some(k => !this.data.chunks.has(k))) {
            if (!this.sceneryWaiting.has(key)) {
                this.sceneryWaiting.set(key, true);
                this.data.ensureChunks(chunks).catch(error => console.warn(`world scenery ${key}: ${error.message}`)).finally(() => {
                    this.sceneryWaiting.delete(key);
                    for (const held of [...(this.sceneryHeld || [])].concat(key)) this.requeueScenery(held);
                    this.sceneryHeld = new Set();
                });
            }
            return;
        }
        const far = this.streamer.tileDistance(key, this.lastBike);
        if ([...this.sceneryWaiting.keys()].some(k => this.streamer.tileDistance(k, this.lastBike) < far)) {
            (this.sceneryHeld = this.sceneryHeld || new Set()).add(key);
            return;
        }
        const houses = (this.data.buildings || []).filter(b => b.x >= tx * m && b.x < (tx + 1) * m && b.z >= tz * m && b.z < (tz + 1) * m);
        const group = this.scenery.buildTile(tile, this.data.cover(key), houses, this.lastBike);
        if (group) {
            group.traverse(o => { if (o.isMesh) o.userData.skipCulling = true; });
            this.sceneryGroup.add(group);
            this.onMeshBuilt(group);
        }
    }

    // Queues a tile's scenery step again (after it waited for side roads, or for a nearer tile that did)
    requeueScenery(key) {
        if (!this.streamer.tiles.has(key)) return;
        this.streamer.enqueue(`scenery:${key}`, this.streamer.tileDistance(key, this.lastBike) + 0.5, () => {
            const current = this.streamer.tiles.get(key);
            if (current) this.buildScenery(key, current.lod);
        });
    }

    disposeTile(key) {
        const old = this.tileMeshes.get(key);
        if (old) {
            this.tileGroup.remove(old.mesh);
            old.mesh.geometry.dispose();
            this.triangleCount -= old.triangles;
            this.tileMeshes.delete(key);
        }
        this.scenery.disposeTile(key);
    }

    rowsOf(from, to) {
        const styles = this.roadStyles();
        return this.route.points.slice(from, to + 1).map((p, i) => ({ x: p.x, y: p.y, z: p.z, heading: p.heading, width: p.width, bits: p.bits, s: p.s, ...styles[from + i] }));
    }

    // The markings of every ride row, made once: the rules of RoadSurface.styles on the real road's class, then each
    // side road's mouth, where the edge line on that side is broken and the verge is left out
    roadStyles() {
        if (this.styles) return this.styles;
        const points = this.route.points;
        const edges = this.data.edges || [];
        const classOf = id => (edges[id] ? edges[id].cls : null);
        const styles = RoadSurface.styles(points.map(p => ({ s: p.s, heading: p.heading, bits: p.bits, cls: classOf(p.edgeId) })));
        const E = RoadSurface.EDGE;
        for (const junction of this.graph.junctions || []) {
            for (const pass of junction.passes) {
                const at = this.route.sample(pass.sIn, {});
                for (const branch of junction.incident) {
                    if (branch.edgeId === pass.inEdge || branch.edgeId === pass.outEdge) continue;
                    // Positive toward +lateral, the rider's left (Route.LEFT); the road styles name the +lateral edge 'right'
                    const lean = Math.sin(branch.heading - at.heading);
                    const width = Math.max(3, RoadSurface.realWidth(classOf(branch.edgeId)));
                    const reach = Math.min(16, (width / 2 + 2.5) / Math.max(0.4, Math.abs(lean)));
                    const key = lean > 0 ? 'right' : 'left';
                    points.forEach((p, i) => {
                        if (Math.abs(p.s - pass.sIn) > reach) return;
                        styles[i][key === 'right' ? 'mouthR' : 'mouthL'] = true;
                        if (styles[i][key] === E.solid) styles[i][key] = E.broken;
                    });
                }
            }
        }
        this.styles = styles;
        return styles;
    }

    buildRoad(section, lod) {
        this.disposeRoad(section);
        // Edge works built before a tile under them arrived are built again when it does (buildTile)
        const missing = new Set();
        const group = RoadMesh.section(this.rowsOf(section.from, Math.min(this.route.points.length - 1, section.to + 1)), lod, { groundAt: (x, z) => this.ground.tileHeight(x, z) ?? undefined, roof: WorldRoute.ROOF_M, foot: this.edgeFoot(missing) });
        for (const key of missing) (this.waitingOnTile.get(key) || this.waitingOnTile.set(key, new Set()).get(key)).add(`road:${section.index}`);
        group.traverse(o => { if (o.isMesh) o.userData.skipCulling = true; });
        this.roadGroup.add(group);
        this.onMeshBuilt(group);
        this.roadMeshes.set(section.index, group);
        this.triangleCount += group.userData.triangles;
    }

    disposeRoad(section) {
        const old = this.roadMeshes.get(section.index);
        if (!old) return;
        this.roadGroup.remove(old);
        RoadMesh.dispose(old);
        this.triangleCount -= old.userData.triangles;
        this.roadMeshes.delete(section.index);
    }

    // Inside the ride's road band the ground is the ride's surface (WorldGround.heightAt). A side road that crosses
    // the band at its own height stands proud of it where the ride climbs or leans. holdSide keeps it under the ride
    // there: every row whose cross-section reaches into the band is lowered SIDE_UNDER_M under the ride surface, and a
    // row is put where the side road leaves the band at that height too, so the side road climbs back to its own
    // height only outside the band. A road more than SIDE_PASS_M above or below the ride is a road over or under it,
    // and keeps its height.
    //
    // rideSurfaceAt: the ride surface under (x, z) when that is in the ride's band at about height y, or null
    rideSurfaceAt(x, z, y) {
        const route = this.route;
        const near = this.sideNear || (this.sideNear = {});
        // A point in the band lies in the hash cell of its own ride segment (WorldRoute.buildHash). The nearest segment
        // at about this height is the one under it, as WorldGround.locate finds it
        let surface = null;
        let nearest = Infinity;
        const list = route.cellSegments(x, z);
        if (!list) return null;
        for (const i of list) {
            route.nearestSegment(x, z, i, i, near);
            if (near.distance < nearest && near.distance <= near.width / 2 + WorldEnvironment.SIDE_KERB_M && Math.abs(y - near.y) <= WorldEnvironment.SIDE_PASS_M) {
                nearest = near.distance;
                surface = near.y;
            }
        }
        return surface;
    }

    // The lowest ride surface under a side row's centre and kerbs, or null where the row is clear of the band
    rideUnderRow(row) {
        const reach = row.width / 2 + WorldEnvironment.SIDE_KERB_M;
        const cos = Math.cos(row.heading), sin = Math.sin(row.heading);
        let low = null;
        for (const o of [-reach, 0, reach]) {
            const y = this.rideSurfaceAt(row.x + o * cos, row.z - o * sin, row.y);
            if (y !== null) low = low === null ? y : Math.min(low, y);
        }
        return low;
    }

    // Side rows held under the ride (see rideSurfaceAt); held and inserted rows carry `keep`, so no level of detail drops them
    holdSide(rows) {
        const under = rows.map(row => this.rideUnderRow(row));
        if (under.every(y => y === null)) return rows;
        const lerp = (a, b, t) => {
            let turn = b.heading - a.heading;
            while (turn > Math.PI) turn -= 2 * Math.PI;
            while (turn < -Math.PI) turn += 2 * Math.PI;
            return { ...a, x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, heading: a.heading + turn * t, width: a.width + (b.width - a.width) * t };
        };
        const held = (row, low) => ({ ...row, y: Math.min(row.y, low - WorldEnvironment.SIDE_UNDER_M), keep: true });
        // The first row from `held` toward `clear` whose cross-section is clear of the band, at the held height
        const exit = (heldRow, clearRow, low) => {
            let inside = 0, outside = 1;
            for (let k = 0; k < 12; k++) {
                const mid = (inside + outside) / 2;
                if (this.rideUnderRow(lerp(heldRow, clearRow, mid)) === null) outside = mid;
                else inside = mid;
            }
            return held(lerp(heldRow, clearRow, outside), low);
        };
        const out = [];
        for (let i = 0; i < rows.length; i++) {
            const prev = i > 0 ? under[i - 1] : null;
            if (under[i] === null && prev !== null) out.push(exit(rows[i - 1], rows[i], prev));
            if (under[i] !== null && i > 0 && prev === null) out.push(exit(rows[i], rows[i - 1], under[i]));
            out.push(under[i] === null ? rows[i] : held(rows[i], under[i]));
        }
        return out;
    }

    // The lowest land a tile draws at (x, z) at any of its levels of detail (its 8, 16 and 32 m triangles, as
    // TerrainMesh.vertexY draws them), or null without the tile (its key goes into `missing`): what a wall's foot or a
    // pier must reach to stand on the land whatever level of detail the tile is drawn at
    landLowAt(x, z, missing = null) {
        const n = WorldData.TILE_N, m = WorldData.TILE_M;
        const tx = Math.floor(x / m), tz = Math.floor(z / m);
        const tile = this.data.tile(`${tx},${tz}`);
        if (!tile) { if (missing) missing.add(`${tx},${tz}`); return null; }
        // A coarse vertex near the tile's edge reads the neighbour's nodes (TerrainMesh.vertexY): one not here yet
        // goes into `missing` too, so what stands on this land is built again when it comes
        if (missing) {
            const reach = 4 * WorldData.CELL_M + WorldData.CELL_M;
            const fx = x - tx * m, fz = z - tz * m;
            const dxs = [0, fx < reach ? -1 : fx > m - reach ? 1 : 0], dzs = [0, fz < reach ? -1 : fz > m - reach ? 1 : 0];
            for (const dx of dxs) for (const dz of dzs) {
                const k = `${tx + dx},${tz + dz}`;
                if ((dx || dz) && this.hasTileData(k) && !this.data.tile(k)) missing.add(k);
            }
        }
        // The neighbours are read only where a coarse vertex's window reaches over the edge, and resolved once
        const edgeM = 9 * WorldData.CELL_M, ex = x - tx * m, ez = z - tz * m;
        const near = ex < edgeM || ez < edgeM || ex > m - edgeM || ez > m - edgeM ? TerrainMesh.ring(tile, this.nearTile) : null;
        let low = Infinity;
        for (const stride of [1, 2, 4]) {
            const cell = WorldData.CELL_M * stride, side = (n - 1) / stride;
            const fx = (x - tx * m) / cell, fz = (z - tz * m) / cell;
            const i = Math.max(0, Math.min(side - 1, Math.floor(fx))), j = Math.max(0, Math.min(side - 1, Math.floor(fz)));
            const u = fx - i, v = fz - j;
            const H = (a, b) => TerrainMesh.vertexY(tile, Math.log2(stride), (i + a) * stride, (j + b) * stride, near);
            low = Math.min(low, u + v <= 1 ? H(0, 0) + u * (H(1, 0) - H(0, 0)) + v * (H(0, 1) - H(0, 0)) : H(1, 1) + (1 - u) * (H(0, 1) - H(1, 1)) + (1 - v) * (H(1, 0) - H(1, 1)));
        }
        return low;
    }

    // What a road's edge point (x, y, z), facing out along (ox, oz), stands on (RoadMesh.edgeWorks): a retaining wall
    // down to a lower road (another leg of the ride, or a side road, more than DECK_UNDER_M below) whose band it lies
    // over; a retaining wall where the importer gave the land beyond it to a lower road (a `drop` node: two legs too close for a slope), or
    // where an apron at the batter would run onto a lower road; an apron where the land at some level of detail a tile
    // may be drawn at (its 8, 16 and 32 m triangles, as TerrainMesh.vertexY draws them) lies lower than the edge, out
    // at the batter to where it meets the land drawn near;
    // else null, the land meets the edge. Without the tile, an apron of APRON_M. `aprons: false` gives walls only.
    edgeFoot(missing = null, { aprons = true } = {}) {
        const n = WorldData.TILE_N, m = WorldData.TILE_M;
        const near = {};
        // The height of the highest road more than DECK_UNDER_M under the edge whose band (carriageway and verge) the
        // edge point lies over, or null
        const lowerRoad = (x, z, y) => {
            let best = null;
            for (const i of this.route.cellSegments(x, z) || []) {
                this.route.nearestSegment(x, z, i, i, near);
                if (near.distance <= near.width / 2 + RoadSurface.VERGE_M && near.y < y - WorldEnvironment.DECK_UNDER_M) best = Math.max(best ?? -Infinity, near.y);
            }
            const side = this.ground.sideRoadY(x, z);
            if (side !== null && side < y - WorldEnvironment.DECK_UNDER_M) best = Math.max(best ?? -Infinity, side);
            return best;
        };
        const landLow = (x, z) => this.landLowAt(x, z, missing);
        // Whether (x, z) lies in a road's band: the ride's carriageway and verge, or a side road's
        const inBand = (x, z) => {
            for (const i of this.route.cellSegments(x, z) || []) {
                this.route.nearestSegment(x, z, i, i, near);
                if (near.distance <= near.width / 2 + RoadSurface.VERGE_M) return true;
            }
            return this.ground.sideRoadY(x, z) !== null;
        };
        // The land as drawn at LOD0 at (x, z), or null
        const landNear = (x, z) => {
            const tx = Math.floor(x / m), tz = Math.floor(z / m);
            const tile = this.data.tile(`${tx},${tz}`);
            if (!tile) return null;
            const fx = (x - tx * m) / WorldData.CELL_M, fz = (z - tz * m) / WorldData.CELL_M;
            const i = Math.max(0, Math.min(n - 2, Math.floor(fx))), j = Math.max(0, Math.min(n - 2, Math.floor(fz)));
            const u = fx - i, v = fz - j;
            const edgeM = 2 * WorldData.CELL_M, ex = x - tx * m, ez = z - tz * m;
            const near = ex < edgeM || ez < edgeM || ex > m - edgeM || ez > m - edgeM ? TerrainMesh.ring(tile, this.nearTile) : null;
            const H = (a, b) => TerrainMesh.vertexY(tile, 0, i + a, j + b, near);
            return u + v <= 1 ? H(0, 0) + u * (H(1, 0) - H(0, 0)) + v * (H(0, 1) - H(0, 0)) : H(1, 1) + (1 - u) * (H(0, 1) - H(1, 1)) + (1 - v) * (H(1, 0) - H(1, 1));
        };
        // The land's own linear colour at the node nearest (x, z) (TerrainMesh.colours), or null
        const landColor = (x, z) => {
            const tx = Math.floor(x / m), tz = Math.floor(z / m);
            const tile = this.data.tile(`${tx},${tz}`);
            if (!tile) return null;
            const grid = TerrainMesh.colours(tile, this.data.cover(`${tx},${tz}`));
            const i = Math.max(0, Math.min(n - 1, Math.round((x - tx * m) / WorldData.CELL_M))), j = Math.max(0, Math.min(n - 1, Math.round((z - tz * m) / WorldData.CELL_M)));
            const at = (j * n + i) * 3;
            return [grid[at], grid[at + 1], grid[at + 2]];
        };
        return (x, y, z, ox, oz) => {
            // Over a lower road's band (stacked hairpin legs whose verges meet): the retaining wall stands down to that
            // road, as the real ones do. Never a deck: a road over a road off a bridge is not a structure the map has
            const under = lowerRoad(x, z, y);
            if (under !== null) return { kind: 'wall', y: under };
            const at = WorldEnvironment.FOOT_PROBE_M;
            const zone = this.ground.tileZone(x + ox * at, z + oz * at);
            if (zone === WorldData.ZONE.drop || zone === WorldData.ZONE.wall) {
                // A wall down to the land, or where the land meets the edge after all, nothing (the physics reads the land)
                const low = landLow(x + ox * at, z + oz * at);
                return low !== null && low < y - WorldEnvironment.MEET_M ? { kind: 'wall', y: low } : null;
            }
            const low = landLow(x + ox * 0.1, z + oz * 0.1);
            // A side road's edge high over the land drawn near it is held by a retaining wall down to the land at any
            // level of detail (its raised centre rides on a deck, RoadMesh.sideStructures): no road edge hangs over the land
            if (!aprons) {
                const near = landNear(x + ox * 0.5, z + oz * 0.5);
                return near !== null && low !== null && near < y - RoadMesh.PARAPET_DROP_M ? { kind: 'wall', y: low } : null;
            }
            if (low === null) return { kind: 'apron', y: y - WorldEnvironment.APRON_M };
            if (low >= y - WorldEnvironment.MEET_M) return null;
            // The apron runs out at the batter until it meets the land drawn near (8 m triangles), never on over a
            // valley beyond (where the land falls away steeper than the batter it would hang in the air), and never
            // into another road's band (the other leg of a hairpin, a side road): it stops at the band's edge, and
            // where that road lies lower the edge is a wall down to it
            let run = 0;
            for (let o = 0.5; o <= WorldEnvironment.APRON_RUN_M; o += 0.5) {
                const px = x + ox * o, pz = z + oz * o;
                if (inBand(px, pz)) {
                    if (lowerRoad(px, pz, y) !== null) return { kind: 'wall', y: low };
                    break;
                }
                run = o;
                const land = landNear(px, pz);
                if (land === null || y - RoadMesh.APRON_UNDER_M - o * RoadMesh.BATTER <= land) break;
            }
            if (lowerRoad(x + ox * run, z + oz * run, y) !== null) return { kind: 'wall', y: low };
            // Coloured as the land at its top and at its foot (RoadMesh.edgeWorks blends them), not one sample
            return { kind: 'apron', y: y - RoadMesh.APRON_UNDER_M - run * RoadMesh.BATTER - 0.2, color: landColor(x + ox * Math.max(run, 0.5), z + oz * Math.max(run, 0.5)), top: landColor(x + ox * 0.5, z + oz * 0.5) };
        };
    }

    // Per-vertex hold of a side ribbon: a vertex inside the band goes under the ride surface (RoadMesh.sideRoad holdY).
    // Only the rows holdSide held or put in (`keep`) can reach into the band, so the rest are not looked at.
    sideHold() {
        return (x, y, z, row) => {
            if (!row.keep) return y;
            const low = this.rideSurfaceAt(x, z, y);
            return low === null ? y : Math.min(y, low - WorldEnvironment.SIDE_UNDER_M);
        };
    }

    // Samples a piece of side road holds (WorldEnvironment.sidePieces): neighbouring pieces share their joint sample
    static get SIDE_PIECE_N() { return 32; }

    // The pieces of the side roads whose first sample is in chunk k: [{edge, from, to, box}], `from` to `to` the
    // piece's sample indices and `box` ([x0, z0, x1, z1]) its centre line's, for the streamer's LOD0 test
    // (WorldStreamer.sideNear); null while an edge's samples are not resident
    sidePieces(k) {
        if (this.sidePieceCache.has(k)) return this.sidePieceCache.get(k);
        if (!this.data.chunks || !this.data.chunks.has(k)) return null;
        const out = [];
        for (const edge of this.data.edges) {
            if (edge.onRide || this.data.chunkOf(edge.first) !== k) continue;
            const samples = this.graph.samples(edge.id);
            if (!samples) return null;
            const n = samples.x.length, step = WorldEnvironment.SIDE_PIECE_N;
            for (let from = 0; from < n - 1; from += step) {
                const to = Math.min(n - 1, from + step);
                let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
                for (let j = from; j <= to; j++) {
                    x0 = Math.min(x0, samples.x[j]); x1 = Math.max(x1, samples.x[j]);
                    z0 = Math.min(z0, samples.z[j]); z1 = Math.max(z1, samples.z[j]);
                }
                out.push({ edge: edge.id, from, to, box: [x0, z0, x1, z1] });
            }
        }
        this.sidePieceCache.set(k, out);
        return out;
    }

    // The rows of a side road (WorldEnvironment.buildSide) cut into runs at LOD0 and LOD1: a row is LOD0 when `near(row)`
    // (its sample is in a LOD0 piece, WorldStreamer.sideNear), so every road within the LOD0 radius looks like a road
    // (texture, markings by its class, verge), as the ride does. Neighbouring runs share their joint row. Each run's
    // first row carries `s`, the metres along the road from `s0`, so the texture and the dashes go on across a joint.
    // [{rows, near, from, to}], `from` and `to` the run's first and last indices in `rows`
    static sideRuns(rows, near, s0 = 0) {
        const along = [s0];
        for (let i = 1; i < rows.length; i++) along.push(along[i - 1] + Math.hypot(rows[i].x - rows[i - 1].x, rows[i].z - rows[i - 1].z));
        const isNear = rows.map(row => !!near && near(row));
        // A quad is LOD0 when either of its rows is, so the LOD0 part reaches past its last row's piece by a row
        const quad = k => isNear[k] || isNear[k + 1];
        const out = [];
        let from = 0;
        for (let k = 1; k < rows.length - 1; k++) {
            if (quad(k) === quad(from)) continue;
            out.push({ from, to: k, near: quad(from) });
            from = k;
        }
        if (rows.length > 1) out.push({ from, to: rows.length - 1, near: quad(from) });
        return out.map(({ from, to, near: lod0 }) => {
            const run = rows.slice(from, to + 1);
            run[0] = { ...run[0], s: along[from] };
            return { rows: run, near: lod0, from, to };
        });
    }

    // A side road's rows with the mouth of every other road that leaves a node at either end of it (`mouthL`, `mouthR`):
    // there its edge line is broken and its verge left out, as the ride's are at a side road's mouth (roadStyles). The
    // road it goes on as through the node (within 30 degrees of straight on) is no mouth. `rows` run from `edge`'s
    // first sample to its last, `atStart`/`atEnd` say which of its ends to mark (a stub marks only the junction end).
    // The mouth rows and the row past them carry `keep`, so a level of detail keeps where the mouth starts and ends
    sideMouths(edge, rows, atStart = true, atEnd = true) {
        if (!this.nodeEdges) {
            this.nodeEdges = new Map();
            for (const e of this.data.edges) for (const n of [e.a, e.b]) (this.nodeEdges.get(n) || this.nodeEdges.set(n, []).get(n)).push(e);
        }
        const out = rows.slice();
        const ends = [];
        if (atStart) ends.push([edge.a, 0, 1]);
        if (atEnd) ends.push([edge.b, rows.length - 1, -1]);
        for (const [node, first, step] of ends) {
            const others = (this.nodeEdges.get(node) || []).filter(e => e.id !== edge.id);
            if (others.length < 2) continue;
            const at = rows[first];
            for (const other of others) {
                const samples = this.graph.samples(other.id);
                if (!samples || samples.x.length < 2) continue;
                // The way the other road leaves the node
                const n = samples.x.length;
                const leaves = other.a === node ? samples.heading[0] : samples.heading[n - 1] + Math.PI;
                // Positive to the right of this road (a heading of 0 is +z; right is (cos h, -sin h))
                const lean = Math.sin(leaves - at.heading);
                if (Math.abs(lean) < 0.5) continue;
                const width = Math.max(3, RoadSurface.realWidth(other.cls));
                const reach = Math.min(16, (width / 2 + 2.5) / Math.max(0.4, Math.abs(lean)));
                const key = lean > 0 ? 'mouthR' : 'mouthL';
                let run = 0;
                for (let i = first; i >= 0 && i < rows.length; i += step) {
                    if (i !== first) run += Math.hypot(rows[i].x - rows[i - step].x, rows[i].z - rows[i - step].z);
                    // The rows where the mouth ends stay at every level of detail (RoadMesh.decimate keeps `keep`)
                    if (run > reach) { out[i] = { ...out[i], keep: true }; break; }
                    out[i] = { ...out[i], [key]: true, keep: true };
                }
            }
        }
        return out;
    }

    // Rows with their heading made continuous (no 2 pi step between neighbours), as the ride's are: the markings read
    // a bend from the heading's change (RoadSurface.styles)
    static unwrap(rows) {
        for (let i = 1; i < rows.length; i++) {
            const step = rows[i].heading - rows[i - 1].heading;
            const turns = Math.round(step / (2 * Math.PI));
            if (turns) rows[i] = { ...rows[i], heading: rows[i].heading - turns * 2 * Math.PI };
        }
        return rows;
    }

    // Metres over which a road that goes on past the ride's end (the finish, the start) narrows from the ride's drawn
    // width to its own, so the ride does not step in at the line
    static get RIDE_TAPER_M() { return 30; }

    // The ride's two ends where the road goes on through the node (no junction there): {node: {s, width}}
    rideEnds() {
        if (this.rideEndsCache) return this.rideEndsCache;
        const out = new Map();
        const path = this.data.ride.path;
        const points = this.route.points;
        const junctionNodes = new Set((this.graph.junctions || []).map(j => j.node));
        if (path.length && points.length) {
            const first = path[0], last = path[path.length - 1];
            const e0 = this.data.edges[first.edgeId], eN = this.data.edges[last.edgeId];
            const a = points[0], b = points[points.length - 1];
            // The row the road goes on from: the ride's end row, facing away from the ride
            const ends = [[first.dir === 1 ? e0.a : e0.b, 0, { ...a, heading: a.heading + Math.PI }], [last.dir === 1 ? eN.b : eN.a, this.route.length, b]];
            for (const [node, s, row] of ends) if (!junctionNodes.has(node)) out.set(node, { s, width: row.width, row: { x: row.x, y: row.y, z: row.z, heading: row.heading } });
        }
        this.rideEndsCache = out;
        return out;
    }

    // A side edge's rows as they go on from the ride's end (rideEnds): turned to run away from the end, widened to the
    // ride's width at the end and narrowed to their own over RIDE_TAPER_M, with the metres along going on from the
    // ride's s there, its first row laid on the ride's end row so the two ribbons meet edge to edge. {rows, s0}; the
    // rows unchanged and s0 0 for an edge that does not touch an end
    fromRideEnd(edge, rows) {
        const ends = this.rideEnds();
        const end = ends.get(edge.a) || ends.get(edge.b);
        if (!end) return { rows, s0: 0 };
        const away = ends.has(edge.a) ? rows : rows.slice().reverse().map(row => ({ ...row, heading: row.heading + Math.PI }));
        let run = 0;
        const out = away.map((row, i) => {
            if (i) run += Math.hypot(row.x - away[i - 1].x, row.z - away[i - 1].z);
            const t = Math.min(1, run / WorldEnvironment.RIDE_TAPER_M);
            return t < 1 ? { ...row, width: end.width + (row.width - end.width) * t } : row;
        });
        const heading = end.row.heading - Math.round((end.row.heading - out[0].heading) / (2 * Math.PI)) * 2 * Math.PI;
        out[0] = { ...out[0], x: end.row.x, y: end.row.y, z: end.row.z, heading, width: end.width };
        return { rows: out, s0: end.s };
    }

    // The side roads whose first sample is in chunk k: stubs at LOD0 beside a barrier, and each road's rows in the
    // pieces `near` names (WorldStreamer.sideNear: their indices in sidePieces, joined) at LOD0, the rest at LOD1
    // (drawSideRibbons)
    buildSide(k, near = '') {
        // Only its LOD0 pieces changed (WorldStreamer.sideNear): its ribbons alone are built again
        const prior = this.sideMeshes.get(k);
        if (prior && prior.userData.roads) {
            this.drawSideRibbons(k, prior, near);
            return;
        }
        this.disposeSide(k);
        const group = new THREE.Group();
        group.name = `world-side-${k}`;
        const edgesHere = [];
        const barrierEdges = new Map();
        for (const junction of this.graph.junctions) {
            for (const pass of junction.passes) for (const b of pass.barriers) barrierEdges.set(b.edgeId, junction.node);
        }
        let triangles = 0;
        const hold = this.sideHold();
        const missing = new Set();
        const sides = [], structures = [];
        // The land a side road's structures stand on; a chunk built before a tile under it is built again when it arrives
        const groundAt = (x, z) => {
            const y = this.ground.tileHeight(x, z);
            if (y === null) missing.add(`${Math.floor(x / WorldData.TILE_M)},${Math.floor(z / WorldData.TILE_M)}`);
            return y;
        };
        // A pier stands on the lowest land the tile draws at any level of detail (RoadMesh.sideStructures footAt)
        const footAt = (x, z) => this.landLowAt(x, z, missing);
        const options = { groundAt, footAt, roof: WorldRoute.ROOF_M };
        // A road's structures and edge works stand at its verge's outer edge (its LOD0 ribbon's sides) at every level of
        // detail, so a change of level of detail builds only its ribbons again (drawSideRibbons)
        const roads = [];
        const draw = (rows, stub, edge, s0 = 0) => {
            const road = new THREE.Group();
            road.name = stub ? 'world-road-stub' : 'world-road-side';
            const built = RoadMesh.sideStructures(RoadMesh.vergeSides(rows, hold), options.groundAt, options.roof, options.footAt);
            Object.assign(road.userData, { sides: built.sides, structures: built.parts, piers: built.piers, rows, stub, edge: edge.id, s0 });
            sides.push(built.sides);
            structures.push(...built.parts);
            group.add(road);
            roads.push(road);
        };
        this.data.edges.forEach((edge) => {
            if (edge.onRide || this.data.chunkOf(edge.first) !== k) return;
            const samples = this.graph.samples(edge.id);
            if (!samples) return;
            edgesHere.push({ x: samples.x, z: samples.z, y: samples.y, width: samples.width });
            let plain = WorldEnvironment.unwrap(Array.from(samples.x, (_, i) => ({ x: samples.x[i], y: samples.y[i], z: samples.z[i], heading: samples.heading[i], width: samples.width[i], bits: samples.flags[i], cls: edge.cls, i })));
            if (plain.length < 2) return;
            plain = this.sideMouths(edge, plain);
            const { rows, s0 } = this.fromRideEnd(edge, plain);
            const node = barrierEdges.get(edge.id);
            if (node !== undefined) {
                const stub = this.graph.stub(edge.id, node);
                if (stub && stub.length > 1) draw(this.holdSide(this.sideMouths({ ...edge, a: node, b: -1 }, WorldEnvironment.unwrap(stub.map(p => ({ ...p, bits: p.flags, cls: edge.cls }))), true, false)), true, edge);
            }
            draw(this.holdSide(rows), false, edge, s0);
        });
        // The edge works of every side road here, one mesh: its retaining walls, decks and tubes (a side road is seen
        // from afar at LOD1, and aprons for every one cost the window's meshes and the queue's time); built again when
        // a tile under them arrives
        triangles += RoadMesh.addEdgeWorks(group, sides, this.edgeFoot(missing, { aprons: false }), structures);
        group.userData.roads = roads;
        group.userData.works = triangles;
        triangles += this.drawSideRibbons(k, group, near);
        for (const key of missing) (this.waitingOnTile.get(key) || this.waitingOnTile.set(key, new Set()).get(key)).add(`side:${k}`);
        group.userData.triangles = triangles;
        group.traverse(o => { if (o.isMesh) o.userData.skipCulling = true; });
        this.sideGroup.add(group);
        this.onMeshBuilt(group);
        this.sideMeshes.set(k, group);
        this.sideEdges.set(k, edgesHere);
        this.triangleCount += triangles;
        this.ground.setSideEdges([...this.sideEdges.values()].flat());
    }

    // The ribbons of a side chunk's roads (buildSide): each road's rows in the pieces `near` names (WorldStreamer.sideNear:
    // their indices in sidePieces, joined) at LOD0, the rest at LOD1, a stub at LOD0, in place of the ribbons it had.
    // Each road keeps the ribbon of every run it has drawn (road.userData.ribbons, by the run's rows and level of
    // detail), so a change of level of detail merges kept geometry and builds only the runs it has not drawn before.
    // The chunk's ribbons are one mesh per material: a mesh a road overran the window's mesh budget. Returns their triangles
    drawSideRibbons(k, group, near) {
        for (const mesh of group.userData.ribbonMeshes || []) {
            group.remove(mesh);
            mesh.geometry.dispose();
        }
        // The sample ranges at LOD0, by edge
        const ranges = new Map();
        const pieces = near ? this.sidePieces(k) || [] : [];
        for (const i of near ? near.split(',').map(Number) : []) {
            const piece = pieces[i];
            if (piece) (ranges.get(piece.edge) || ranges.set(piece.edge, []).get(piece.edge)).push([piece.from, piece.to]);
        }
        let hold = null;
        let triangles = 0;
        const byMaterial = new Map();
        for (const road of group.userData.roads) {
            const { rows, stub, edge, s0 } = road.userData;
            const kept = road.userData.ribbons || (road.userData.ribbons = new Map());
            const lod0 = ranges.get(edge) || [];
            const inPiece = row => row.i !== undefined && lod0.some(([from, to]) => row.i >= from && row.i <= to);
            const runs = stub ? [{ rows, near: true, from: 0, to: rows.length - 1 }] : WorldEnvironment.sideRuns(rows, lod0.length ? inPiece : null, s0);
            for (const run of runs) {
                if (run.rows.length < 2) continue;
                const key = `${run.from}:${run.to}:${run.near ? 0 : 1}`;
                let ribbon = kept.get(key);
                if (!ribbon) {
                    hold = hold || this.sideHold();
                    ribbon = RoadMesh.ribbon(run.rows, run.near ? 0 : 1, hold, true);
                    kept.set(key, ribbon);
                }
                const material = ribbon.near ? RoadSurface.nearMaterial() : RoadSurface.farMaterial();
                (byMaterial.get(material) || byMaterial.set(material, []).get(material)).push(ribbon.geometry);
                triangles += ribbon.triangles;
            }
        }
        group.userData.ribbonMeshes = [];
        for (const [material, list] of byMaterial) {
            const mesh = RoadMesh.mesh(RoadMesh.mergeGeometries(list), 'road-side', material);
            group.add(mesh);
            group.userData.ribbonMeshes.push(mesh);
        }
        group.userData.near = near;
        if (this.sideMeshes.get(k) === group) {
            const before = group.userData.triangles;
            group.userData.triangles = group.userData.works + triangles;
            this.triangleCount += group.userData.triangles - before;
            group.traverse(o => { if (o.isMesh) o.userData.skipCulling = true; });
            this.onMeshBuilt(group);
        }
        return triangles;
    }

    disposeSide(k) {
        const old = this.sideMeshes.get(k);
        if (!old) return;
        this.sideGroup.remove(old);
        RoadMesh.dispose(old);
        // The ribbons each road kept for its runs (drawSideRibbons), not in the scene
        for (const road of old.userData.roads || []) for (const ribbon of (road.userData.ribbons || new Map()).values()) ribbon.geometry.dispose();
        this.triangleCount -= old.userData.triangles;
        this.sideMeshes.delete(k);
        this.sideEdges.delete(k);
        this.ground.setSideEdges([...this.sideEdges.values()].flat());
    }

    // The barrier set of the passes the rider is at (the high-water progress, not the raw projection)
    updateBarriers(progressS) {
        const step = Math.floor(progressS / WorldEnvironment.BARRIER_STEP_M);
        if (step === this.barrierStep) return;
        this.barrierStep = step;
        // Each barrier on its own side road, clear of the ride and every other road (WorldGraph.barrierPose)
        const list = this.graph.barriersFor(progressS, 1000, this.scenery.roads);
        // The pose is part of the key: a barrier's place is measured once its side road is here (WorldGraph.barrierPose)
        const key = list.map(b => `${b.junctionId}:${b.edgeId}:${Math.round(b.x)}:${Math.round(b.z)}`).join('|');
        if (key === this.barrierKey) return;
        this.barrierKey = key;
        this.activeBarriers = list;
        this.ground.setBarriers(list);
        // On the side road's own surface where that is known: the tile under it need not be here yet
        RoadMesh.placeBarriers(this.barrierMesh, list.map(b => ({ x: b.x, y: (Number.isFinite(b.y) ? b.y : this.ground.landY(b.x, b.z, 0)) - 0.1, z: b.z, heading: b.heading, width: b.width })));
    }

    // Streams the world round the bike and builds what the 4 ms budget allows.
    // position: {x, z}; s: the ride progress; state: what the guide reads, see WorldGuide.update;
    // dtSec: the simulated time since the last update (0 for a call that is not a step of the ride)
    update(position, s, state = null, budgetMs = WorldStreamer.BUDGET_MS, dtSec = 0) {
        this.lastBike = position;
        // A landmark is drawn within LANDMARK_REACH_M: beyond, it is a few pixels and costs the window its triangles
        if (this.landmarkGroup) for (const node of this.landmarkGroup.children) node.visible = Math.hypot(node.position.x - position.x, node.position.z - position.z) < WorldEnvironment.LANDMARK_REACH_M;
        if (this.markerMesh) Scenery.placeMarkers(this.markerMesh, position.x, position.z);
        if (Number.isFinite(dtSec) && dtSec > 0) this.streamClockMs += dtSec * 1000;
        this.updateBarriers(s);
        this.streamer.update(position, s);
        if (this.placed) {
            this.placed = false;
            this.streamer.releasePlacing();
        }
        this.streamer.pump(budgetMs);
        if (state) this.guide.update(state);
    }

    // Holds the data under a station and resolves when it is ready; the run flow keeps the bike in a placing state until then.
    // The bike's own 900 m of tiles take over from the next update, which lets the hold go.
    place(s) {
        const p = this.route.sample(s, {});
        this.placed = false;
        return this.streamer.ensure(p.x, p.z).then((keys) => {
            this.placed = true;
            return keys;
        });
    }

    // Whether a time set in this world may be submitted to a board
    get submitAllowed() { return this.trusted; }

    // Counters the budget probe and the tests read
    counts() {
        let meshes = 0, instances = 0;
        this.group.traverse(o => {
            if (!o.isMesh) return;
            meshes++;
            if (o.isInstancedMesh) instances += o.count;
        });
        return { meshes, triangles: Math.round(this.triangleCount + this.scenery.triangles), instances, tiles: this.tileMeshes.size, roads: this.roadMeshes.size, sides: this.sideMeshes.size, trees: this.scenery.treeCount, queue: this.streamer.queue.length };
    }

    // Fog is the one landscape setting a world takes from the page
    applyLandscapeConfig(look) {
        if (look && look.fogDensity !== undefined && this.scene.fog && this.scene.fog.density !== undefined) this.scene.fog.density = look.fogDensity;
    }

    // The one-time look of a weather: the road surface (the land keeps its colours; the light and the fog carry the rest)
    applyWeatherVisuals(weatherType, intensity = 1.0) {
        this.writeRoadSurface(this.resolveRoadSurface(weatherType, intensity));
    }

    // A world road's surface is how wet it is: rain wets it by its intensity
    resolveRoadSurface(weatherType, intensity = 1.0) {
        return { wet: weatherType === 'rain' ? intensity : 0 };
    }

    writeRoadSurface(values) {
        RoadSurface.setWet(values.wet);
    }

    dispose() {
        this.guide.dispose();
        this.group.traverse(o => {
            if (o.isInstancedMesh) o.dispose();
            if (o.geometry) o.geometry.dispose();
        });
        this.scene.remove(this.group);
    }
}
