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
//   boulders                                             null / empty: the legs' cones, rockfalls and roadworks zones are not built
//   roadworks                                            the checkpoints' roadworks sites (js/world/roadworks.js)
//   places                                               the stopping places beside the ride (js/world/places.js): places.list,
//                                                        places.next(s), places.stopAt(place, slot, ground)
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
    // A road counts as overhead from this far over the bike's road, and its deck reaches this far past its carriageway
    static get OVERHEAD_FROM_M() { return 2.5; }
    static get OVERHEAD_EDGE_M() { return 1.5; }

    // Metres the rider starts along the ride, so the road's cut end is behind the camera
    static get START_M() { return 20; }

    // A side road inside the ride's band: how far under the ride surface it is held, how far past the road edge
    // (the ride ribbon's kerb) that reaches, and the height apart beyond which it is a road over or under the ride.
    // Held 1 cm under, the two ribbons lay in one plane for the depth test and flickered at a junction's mouth; 3 cm is
    // clear of that, and the deepest of the four depths two side roads of one junction take (sideHold: 3 to 9 cm)
    // is still over the land's SINK_M
    static get SIDE_UNDER_M() { return 0.03; }
    static get SIDE_KERB_M() { return 0.5; }
    static get SIDE_PASS_M() { return 2; }
    // Where a side road leaves the ride's band it stands at the height of the ride's edge beside it (read within
    // SIDE_MEET_REACH_M of the band) and takes up its own height again over a ramp (holdSide); for SIDE_FILL_M past
    // the band it stands on the ground, on a fill behind a wall where the land falls away, never on a deck
    static get SIDE_MEET_REACH_M() { return 12; }
    static get SIDE_MEET_GRADE() { return 0.08; }
    static get SIDE_MEET_MIN_M() { return 12; }
    static get SIDE_MEET_MAX_M() { return 45; }
    static get SIDE_FILL_M() { return 16; }
    static get SIDE_ROW_MIN_M() { return 1.5; }
    // A side road's wall that ends this near the end of one of the ride's is joined to it (wallJoins)
    static get WALL_JOIN_M() { return 8; }
    // A junction's paving reaches from the ride's edge to the side roads over gaps no wider than this (edgeFoot `gore`)
    static get SIDE_GORE_M() { return 4.5; }
    static get SIDE_GORE_REACH_M() { return 16; }
    static get SIDE_GORE_STEP_M() { return 0.25; }
    // The paving lies this far under the roads' surfaces: under the deepest side ribbon in the band (sideHold)
    static get SIDE_GORE_UNDER_M() { return 0.13; }
    // A side road that crosses over the ride is lifted to stand this far over the ride's surface (a deck's soffit at
    // Carriageways.HEADROOM_M over the ride, the deck under it, a hand's breadth spare), ramped in over at most
    // SIDE_RAMP_M either side and never past its own edge's ends, so it meets its neighbours where it did
    static get SIDE_CLEAR_M() { return Carriageways.HEADROOM_M + RoadMesh.DECK_M + 0.1; }
    static get SIDE_RAMP_M() { return 40; }
    // The edge works (edgeFoot): metres under a road edge that another road must lie for the edge to stand on a wall down to it;
    // how far out the importer's zone is read for a retaining wall; how far under the edge the drawn land may lie
    // before an apron runs down to it (the land is drawn SINK_M under the road); the apron where no tile is resident
    static get DECK_UNDER_M() { return 1.5; }
    static get FOOT_PROBE_M() { return 1.5; }
    static get MEET_M() { return 0.25; }
    // The land lying this far under a slope at the batter at the end of its run asks for a wall instead
    static get WALL_OVER_M() { return 1.5; }
    // A lower road's strip stands this far under a bank down from an edge point before a wall holds the step (edgeFoot `stepped`)
    static get STEP_OVER_M() { return 1; }
    // A side road's wall, once begun, goes on while the land lies this far under its edge: it ends in the ground
    static get WALL_END_M() { return 0.5; }
    // The place in the build queue of what is built again once the rest has arrived (WorldStreamer.enqueue's distance)
    static get LATER() { return 1e9; }
    // A retaining wall's foot stands this far under the land in front of it
    static get WALL_UNDER_M() { return 0.3; }
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
        // The side roads round the junctions and landmarks, which the landmarks keep clear of
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
        // The stopping places beside the ride (WorldPlaces), on the route's points before anything reads a verge
        this.places = new WorldPlaces(data.manifest.places || [], this.route, stage ? { from: stage.from, to: stage.to } : {});
        this.ground = new WorldGround(this.route, data);
        // The physics reads the land as it is drawn: cut to the retaining walls (cutsOf)
        this.ground.cutsOf = key => this.cutsOf(key);
        // and a retaining wall where the ride's wall plan draws one (rideWalls)
        this.ground.walledAt = (index, sign) => this.walledAt(index, sign);
        this.ground.taperAt = (index, sign, t) => this.taperAt(index, sign, t);
        // Every road's carriageway, which no structure of another road may stand in (RoadMesh's builders ask it)
        this.carriageways = new Carriageways(this.route, data);
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
        // The retaining walls of each ride section and of each side chunk, and the land's cuts to them by tile
        this.rideWallCache = new Map();
        // Counts every change of what cameraFaces lists (the ride's wall plans, the sections drawn, the side roads' walls)
        this.faceStamp = 0;
        this.sideWalls = new Map();
        this.cutCache = new Map();
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

    // The things built once: the horizon, the gate frames, the roadworks sites and the landmarks
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
        // The arch stands at the start and the finish only; each checkpoint between is a roadworks site (Roadworks)
        const stations = this.stationGates || [];
        const ends = stations.filter((st, i) => i === 0 || i === stations.length - 1);
        this.roadworks = new Roadworks(this, stations);
        if (this.roadworks.group) this.group.add(this.roadworks.group);
        // No rider waits in the works or under a gate: the places there are closed (WorldPlaces.close)
        this.places.close([...(this.roadworks.sites || []).map(site => ({ s0: site.s0, s1: site.s1 })), { s0: this.startS, s1: this.startS }, { s0: this.endS, s1: this.endS }]);
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
        // No marker stone stands in a roadworks site, from its first thing to its last; each tile draws the stones of
        // its own drops on the ground it holds (Scenery.stoneSites)
        this.scenery.stoneShut = (this.roadworks.sites || []).map(site => {
            const at = (site.elements || []).map(e => e.s).concat(site.s0, site.s1).filter(Number.isFinite);
            return { s0: Math.min(...at), s1: Math.max(...at) };
        });
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
        // At full detail the land is cut to the retaining walls that cross the tile (cutsOf), made again with the tile
        if (lod === 0) this.cutCache.delete(key);
        const built = TerrainMesh.build(tile, cover, lod, (x, y, z) => {
            const low = this.rideSurfaceAt(x, z, y);
            return low === null ? y : Math.min(y, low - TerrainMesh.SINK_M);
        }, this.nearTile, lod === 0 ? this.cutsOf(key) : null);
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
            // A section's wall plan made without this tile or chunk is made again when next asked for
            if (kind === 'walls') { this.dropRideWalls(index); continue; }
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

    // A ride section's wall plan is made again; where its walls then stand elsewhere, the land there is cut again
    dropRideWalls(index) {
        const old = this.rideWallCache.get(index);
        if (!old) return;
        this.rideWallCache.delete(index);
        this.faceStamp++;
        this.streamer.enqueue(`walls:${index}`, 0, () => {
            const sign = runs => runs.map(run => run.key + run.points.map(p => `${Math.round(p[0] * 100)},${Math.round(p[2] * 100)}`).join(' ')).join('|');
            if (sign(this.rideWalls(index).runs) !== sign(old.runs)) this.dropCuts(this.streamer.sections[index].bbox);
        });
    }

    // Trees and houses stand on the detailed tiles only (a step of its own: the streamer queues it after the land)
    buildScenery(key, lod) {
        if (lod > 1) {
            this.scenery.disposeTile(key);
            return;
        }
        const tile = this.data.tile(key);
        if (!tile) return;
        // What stands is not built again when the tile's detail changes, but its marker stones stand on the nearest
        // tiles only (Scenery.setStones)
        if (this.scenery.perTile.has(key)) {
            for (const mesh of this.scenery.setStones(tile, lod === 0, this.lastBike)) {
                mesh.userData.skipCulling = true;
                this.onMeshBuilt(mesh);
            }
            return;
        }
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
        const group = this.scenery.buildTile(tile, this.data.cover(key), houses, this.lastBike, lod === 0);
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
        // A row has no verge on a side where a junction's paving lies (edgeFoot `gore`: the same test lays the paving):
        // a side road that leaves at a shallow angle runs beside the ride for tens of metres past the node's own
        // mouth, and the ride's verge lay between the two as a strip of grass in the junction
        const foot = this.goreFoot || (this.goreFoot = this.edgeFoot());
        if (!this.goreRows) this.goreRows = new Map();
        const points = this.route.points;
        // (kept for each row until the side roads in residence change: setSideEdges)
        const goreAt = i => {
            const p = points[i];
            if (!p || p.bits & 7) return null;
            let held = this.goreRows.get(i);
            if (!held) {
                const cos = Math.cos(p.heading), sin = Math.sin(p.heading), half = p.width / 2;
                const edges = { l: [p.x - half * cos, p.y, p.z + half * sin, -cos, sin], r: [p.x + half * cos, p.y, p.z - half * sin, cos, -sin] };
                held = { l: !!foot.gore(...edges.l), r: !!foot.gore(...edges.r), edges };
                this.goreRows.set(i, held);
            }
            return held;
        };
        return points.slice(from, to + 1).map((p, i) => {
            const row = { x: p.x, y: p.y, z: p.z, heading: p.heading, width: p.width, bits: p.bits, s: p.s, i: from + i, ...styles[from + i] };
            // A stopping place's hard standing on either side (WorldPlaces.apply)
            // (every row of it is kept at the lower level of detail, RoadMesh.decimate: there the works lay the ground
            // under the verge, and across a place 5 m deep a row every 16 m made triangles of 44 m2 of flat ground)
            if (p.padN || p.padP) Object.assign(row, { padN: p.padN || 0, padP: p.padP || 0, padSurface: p.padSurface, keep: true });
            // (and the row before and after it, so the taper starts from a row beside it)
            else if ([points[from + i - 1], points[from + i + 1]].some(q => q && (q.padN || q.padP))) row.keep = true;
            const held = goreAt(from + i);
            if (!held) return row;
            for (const [key, flag] of [['l', 'mouthL'], ['r', 'mouthR']]) {
                // The row before or after the paving, where the ride's wall ends and turns to join the side road's
                // (`joined`), has no verge either: the corner behind the join is paved, and a verge over paving was a
                // pale slab in the junction's corner
                const next = [goreAt(from + i - 1), goreAt(from + i + 1)].some(n => n && n[key]);
                if (held[key] || (next && foot.joined && foot.joined(held.edges[key][0], held.edges[key][1], held.edges[key][2]))) row[flag] = true;
            }
            return row;
        });
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

    // Where the retaining walls of a ride section stand: {plan, runs, missing}. `plan` is RoadMesh.wallPlan of every
    // row of the section and one either side (`plan.base` the index of its first row), made with the rows
    // WALL_PLAN_M past each end so two sections agree on the rows they share; `runs` are the walls of its own segments
    // (RoadMesh.wallRuns). Kept until a tile or a chunk it was made without arrives (rebuildWaiting)
    rideWalls(index) {
        const held = this.rideWallCache.get(index);
        if (held) return held;
        const section = this.streamer.sections[index];
        const points = this.route.points, last = points.length - 1, S = this.route.sArray;
        let a = Math.max(0, section.from - 1), b = Math.min(last, section.to + 1);
        while (a > 0 && S[section.from] - S[a] < WorldEnvironment.WALL_PLAN_M) a--;
        while (b < last && S[b] - S[section.to] < WorldEnvironment.WALL_PLAN_M) b++;
        const missing = new Set();
        const sides = RoadMesh.vergeSides(this.rowsOf(a, b), null, true);
        const all = RoadMesh.wallPlan(sides, this.edgeFoot(missing), this.carriageways.guard(-1));
        const base = Math.max(0, section.from - 1), top = Math.min(last, section.to + 1);
        const cut = list => list.slice(base - a, top - a + 1);
        const plan = { base, row: { l: cut(all.row.l), r: cut(all.row.r) }, seg: { l: cut(all.seg.l), r: cut(all.seg.r) }, end: { l: cut(all.end.l), r: cut(all.end.r) }, past: { l: cut(all.past.l), r: cut(all.past.r) } };
        // Its own segments: from its first row to its last
        const runs = RoadMesh.wallRuns(sides, all, section.from - a, section.to - a).map(run => Object.assign(run, { owner: -1 }));
        if (section.bbox && this.data.manifest && this.data.manifest.chunks) {
            const [x0, z0, x1, z1] = section.bbox;
            for (const k of this.data.chunksNear((x0 + x1) / 2, (z0 + z1) / 2, Math.hypot(x1 - x0, z1 - z0) / 2 + 20)) if (!this.data.chunks.has(k)) missing.add(`chunk:${k}`);
        }
        for (const key of missing) (this.waitingOnTile.get(key) || this.waitingOnTile.set(key, new Set()).get(key)).add(`walls:${index}`);
        const out = { plan, runs, missing };
        this.rideWallCache.set(index, out);
        this.faceStamp++;
        return out;
    }

    // The share of the fill's fall that a wall's face holds past its end (RoadMesh.edgeWorks `taper`), `t` of the way
    // from row `index` to the next on the right (sign > 0) or the left: 1 at a wall's end, 0 from TAPER_M past it.
    // Read from the same plan the stone is drawn from, so the physics ground beside the road is the drawn slope
    taperAt(index, sign, t = 0) {
        if (this.walledAt(index, sign) !== false) return 0;
        const walls = this.rideWalls(this.rowSection[Math.max(0, Math.min(this.rowSection.length - 1, index))]);
        const past = walls.plan.past && walls.plan.past[sign > 0 ? 'r' : 'l'];
        const a = past && past[index - walls.plan.base], b = past && past[index + 1 - walls.plan.base];
        if (!a || !b) return 0;
        const share = p => Math.max(0, 1 - Math.min(p[0], p[1]) / RoadMesh.TAPER_M);
        const u = Math.max(0, Math.min(1, t || 0));
        return share(a) + (share(b) - share(a)) * u;
    }

    // Whether the ride's edge from row `index` to the next, on the right (sign > 0) or the left, stands on a retaining wall
    walledAt(index, sign) {
        if (!this.streamer) return undefined;
        if (!this.rowSection) {
            this.rowSection = new Int32Array(this.route.points.length);
            for (const section of this.streamer.sections) for (let i = section.from; i <= section.to; i++) this.rowSection[i] = section.index;
        }
        const walls = this.rideWalls(this.rowSection[Math.max(0, Math.min(this.rowSection.length - 1, index))]);
        // The segment from row `index` on (what a located point's index names), as the wall is drawn: a walled row
        // beside a segment with no wall (a mouth, a bridge's end) is no wall there
        return !!walls.plan.seg[sign > 0 ? 'r' : 'l'][index - walls.plan.base];
    }

    buildRoad(section, lod) {
        this.disposeRoad(section);
        // Edge works built before a tile under them arrived are built again when it does (buildTile)
        const missing = new Set();
        // A row of each neighbour either side: read for the bend and the runs, drawn by the neighbour (RoadMesh.section)
        const last = this.route.points.length - 1;
        const from = Math.max(0, section.from - 1), to = Math.min(last, section.to + 1);
        const group = RoadMesh.section(this.rowsOf(from, to), lod, { groundAt: (x, z) => this.ground.tileHeight(x, z) ?? undefined, roof: WorldRoute.ROOF_M, foot: this.edgeFoot(missing), roads: this.carriageways, head: section.from - from, tail: to - section.to, plan: this.rideWalls(section.index).plan });
        // Its works keep out of the side roads' carriageways (Carriageways): built before a side road's chunk is here,
        // it is built again when that chunk is (buildSide)
        if (section.bbox && this.data.manifest && this.data.manifest.chunks) {
            const [x0, z0, x1, z1] = section.bbox;
            for (const k of this.data.chunksNear((x0 + x1) / 2, (z0 + z1) / 2, Math.hypot(x1 - x0, z1 - z0) / 2 + 20)) if (!this.data.chunks.has(k)) missing.add(`chunk:${k}`);
        }
        for (const key of missing) (this.waitingOnTile.get(key) || this.waitingOnTile.set(key, new Set()).get(key)).add(`road:${section.index}`);
        group.traverse(o => { if (o.isMesh) o.userData.skipCulling = true; });
        this.roadGroup.add(group);
        this.onMeshBuilt(group);
        this.roadMeshes.set(section.index, group);
        this.faceStamp++;
        this.triangleCount += group.userData.triangles;
    }

    disposeRoad(section) {
        const old = this.roadMeshes.get(section.index);
        if (!old) return;
        this.roadGroup.remove(old);
        RoadMesh.dispose(old);
        this.triangleCount -= old.userData.triangles;
        this.roadMeshes.delete(section.index);
        this.faceStamp++;
    }

    // Inside the ride's road band the ground is the ride's surface (WorldGround.heightAt). A side road that crosses
    // the band at its own height stands proud of it where the ride climbs or leans, or lies under it. holdSide keeps
    // it at the ride's height there: every row whose cross-section reaches into the band stands SIDE_UNDER_M under the
    // ride surface, and the road takes up its own height again outside the band. A road more than SIDE_PASS_M above
    // or below the ride is a road over or under it, and keeps its height.
    //
    // The underside of the lowest road that passes over (x, z) more than OVERHEAD_FROM_M above y (a bridge of a side
    // road, a viaduct, another leg of the ride on its deck), or Infinity with open sky: what the chase camera stays
    // under, so it follows the bike through and does not fly over the deck with the bike out of sight (WorldCamera)
    overheadY(x, z, y) {
        let low = Infinity;
        const reach = WorldEnvironment.OVERHEAD_EDGE_M;
        this.carriageways.each(x, z, reach, r => { if (r.depth >= -reach && r.y > y + WorldEnvironment.OVERHEAD_FROM_M && r.y - RoadMesh.DECK_M < low) low = r.y - RoadMesh.DECK_M; });
        return low;
    }

    // The wall faces within `reach` of (x, z) that the chase camera's boom may not cross (WorldCamera.wallShare):
    // {data, count}, WorldCamera.FACE numbers a face. Every one is read from what the road's builders and the physics
    // already hold, so a new world needs no list of walls:
    //   - the retaining walls of the ride's drawn sections and of the side roads (RoadMesh.wallRuns), with their parapets
    //   - the face a wall goes on as past its end (taperAt), as deep as it holds the fill there
    //   - the parapets of the ride's bridges (WorldGround.zoneAt's wall)
    //   - the walls of the houses drawn (Scenery.houseAt's rects)
    // The list is kept until the place has moved WALLS.stepM or one of those has changed (faceStamp, Scenery.stamp)
    cameraFaces(x, z, reach) {
        const W = WorldCamera.WALLS, N = WorldCamera.FACE;
        const held = this.faceList || (this.faceList = { data: new Float64Array(N * 256), count: 0, x: Infinity, z: Infinity, reach: 0, stamp: -1, houses: -1 });
        const houses = this.scenery ? this.scenery.stamp || 0 : 0;
        if (held.stamp === this.faceStamp && held.houses === houses && held.reach >= reach && Math.hypot(x - held.x, z - held.z) < W.stepM) return held;
        held.x = x;
        held.z = z;
        held.reach = reach;
        held.houses = houses;
        held.count = 0;
        if (!this.streamer) return held;
        const far = reach + W.stepM;
        // One face from a to b, turned so that (ox, oz), the way it faces, is on the right of a to b
        const face = (ax, az, bx, bz, topA, topB, footA, footB, ox, oz, road) => {
            if (Math.min(Math.abs(ax - x), Math.abs(bx - x)) > far || Math.min(Math.abs(az - z), Math.abs(bz - z)) > far) return;
            if (held.count * N >= held.data.length) {
                const more = new Float64Array(held.data.length * 2);
                more.set(held.data);
                held.data = more;
            }
            const d = held.data, i = held.count++ * N;
            const turned = (bz - az) * ox - (bx - ax) * oz < 0;
            d[i] = turned ? bx : ax; d[i + 1] = turned ? bz : az; d[i + 2] = turned ? ax : bx; d[i + 3] = turned ? az : bz;
            d[i + 4] = turned ? topB : topA; d[i + 5] = turned ? topA : topB; d[i + 6] = turned ? footB : footA; d[i + 7] = turned ? footA : footB;
            d[i + 8] = road;
        };
        const near = box => box && box[2] >= x - far && box[0] <= x + far && box[3] >= z - far && box[1] <= z + far;
        const drop = RoadMesh.PARAPET_DROP_M, H = RoadMesh.PARAPET_H_M;
        const runs = list => {
            for (const run of list) {
                for (let k = 0; k + 1 < run.points.length; k++) {
                    const a = run.points[k], b = run.points[k + 1], fa = Math.min(a[1], run.foot[k]), fb = Math.min(b[1], run.foot[k + 1]);
                    // (a wall under PARAPET_DROP_M at both rows has no parapet, RoadMesh.edgeWorks)
                    const rail = a[1] - fa >= drop || b[1] - fb >= drop ? H : 0;
                    face(a[0], a[2], b[0], b[2], a[1] + rail, b[1] + rail, fa, fb, run.out[k][0], run.out[k][1], 1);
                }
            }
        };
        const points = this.route.points, ground = this.ground;
        const edge = this.faceEdge || (this.faceEdge = [{}, {}]);
        for (const index of this.roadMeshes.keys()) {
            const section = this.streamer.sections[index];
            if (!section || !near(section.bbox)) continue;
            runs(this.rideWalls(index).runs);
            for (let i = section.from; i < section.to && i + 1 < points.length; i++) {
                const a = points[i], b = points[i + 1];
                if (Math.min(Math.abs(a.x - x), Math.abs(b.x - x)) > far + 20 || Math.min(Math.abs(a.z - z), Math.abs(b.z - z)) > far + 20) continue;
                const bridge = a.bits & b.bits & WorldRoute.FLAG.bridge;
                for (const sign of [1, -1]) {
                    const ox = sign * Math.cos(a.heading), oz = -sign * Math.sin(a.heading);
                    if (bridge) {
                        const p = WorldGround.pointAt(a, sign * (a.width / 2 + WorldGround.PARAPET_M), edge[0]), q = WorldGround.pointAt(b, sign * (b.width / 2 + WorldGround.PARAPET_M), edge[1]);
                        face(p.x, p.z, q.x, q.z, a.y + H, b.y + H, a.y - RoadMesh.DECK_M, b.y - RoadMesh.DECK_M, ox, oz, 1);
                        continue;
                    }
                    if ((a.bits | b.bits) & 7) continue;
                    const ha = this.taperAt(i, sign, 0), hb = this.taperAt(i, sign, 1);
                    if (!(ha > 0 || hb > 0)) continue;
                    const p = WorldGround.pointAt(a, sign * (a.width / 2 + ground.vergeAt(i, sign, 0)), edge[0]), q = WorldGround.pointAt(b, sign * (b.width / 2 + ground.vergeAt(i, sign, 1)), edge[1]);
                    // (as deep as the stone holds the fill's fall there, WorldGround.earthworkY)
                    face(p.x, p.z, q.x, q.z, a.y, b.y, a.y - ha * Math.max(0, a.y - ground.landY(p.x, p.z, a.y)), b.y - hb * Math.max(0, b.y - ground.landY(q.x, q.z, b.y)), ox, oz, 1);
                }
            }
        }
        for (const list of this.sideWalls.values()) for (const run of list) if (near(run.box)) runs([run]);
        if (this.scenery && this.scenery.perTile) {
            for (const tile of this.scenery.perTile.values()) {
                for (const w of tile.walls || []) {
                    if (Math.abs(w.x - x) > far + w.along + w.across || Math.abs(w.z - z) > far + w.along + w.across) continue;
                    const cos = Math.cos(w.heading), sin = Math.sin(w.heading), land = ground.landY(w.x, w.z, 0);
                    // Its four walls: across along (cos, -sin), along along (sin, cos), as Scenery.houseAt reads the rect
                    const at = (u, v, out) => { out.x = w.x + u * w.across / 2 * cos + v * w.along / 2 * sin; out.z = w.z - u * w.across / 2 * sin + v * w.along / 2 * cos; return out; };
                    for (const [u0, v0, u1, v1] of WorldEnvironment.HOUSE_SIDES) {
                        const p = at(u0, v0, edge[0]), q = at(u1, v1, edge[1]);
                        face(p.x, p.z, q.x, q.z, land + W.houseM, land + W.houseM, land - W.houseM, land - W.houseM, (p.x + q.x) / 2 - w.x, (p.z + q.z) / 2 - w.z, 0);
                    }
                }
            }
        }
        // (read last: a wall plan made for this list counts as seen)
        held.stamp = this.faceStamp;
        return held;
    }

    // The corners of a house's wall rect in turn, in halves of its size: the two ends of each of its four walls
    static get HOUSE_SIDES() { return WorldEnvironment.houseSides || (WorldEnvironment.houseSides = [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]); }

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

    // The ride's surface beside (x, z), a place just outside its band at about height y: the nearest of the ride at
    // that height (its edge's height there), or null with none within SIDE_MEET_REACH_M
    rideBesideAt(x, z, y) {
        const near = this.sideNear || (this.sideNear = {});
        let surface = null, nearest = Infinity;
        for (const i of this.route.hashCandidates(x, z, 1)) {
            this.route.nearestSegment(x, z, i, i, near);
            if (near.distance < nearest && near.distance <= near.width / 2 + WorldEnvironment.SIDE_MEET_REACH_M && Math.abs(y - near.y) <= WorldEnvironment.SIDE_PASS_M + 1) {
                nearest = near.distance;
                surface = near.y;
            }
        }
        return surface;
    }

    // Side rows held at the ride's height in its band (see rideSurfaceAt), a row put in where the road leaves the band
    // (at the height of the ride's edge beside it), and from there the road's own height taken up again over a ramp:
    // the importer gives each road its own heights, and where two meet they differ by up to a metre at the edge of the
    // band (the ride falls along its length while the side road climbs away from the node), which drawn as it is is a
    // step across the side road's mouth. The ramp is no steeper than SIDE_MEET_GRADE at its middle, at least
    // SIDE_MEET_MIN_M long. Held, inserted and ramp rows carry `keep`, so no level of detail drops them; the rows of
    // the band and of the first SIDE_FILL_M past it carry `fill` (no deck starts in a junction, RoadMesh.sideStructures)
    // and the ramp's rows `own`, the height the importer gave them (the land is carved to that: WorldEnvironment.sideRamps)
    //
    // `before` and `after` are the rows the road goes on as past this piece's two ends (the rest of its edge, the edges
    // it goes on as: WorldEnvironment.sideOnward), read so a ramp that starts in one piece goes on in the next; only
    // this piece's own rows are returned
    holdSide(rows, before = [], after = []) {
        if (before.length || after.length) {
            const ext = list => list.map(row => ({ ...row, ext: true }));
            return this.holdSide([...ext(before), ...rows, ...ext(after)]).filter(row => !row.ext);
        }
        const under = rows.map(row => this.rideUnderRow(row));
        if (under.every(y => y === null)) return rows;
        const lerp = (a, b, t) => {
            let turn = b.heading - a.heading;
            while (turn > Math.PI) turn -= 2 * Math.PI;
            while (turn < -Math.PI) turn += 2 * Math.PI;
            return { ...a, x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, heading: a.heading + turn * t, width: a.width + (b.width - a.width) * t };
        };
        const U = WorldEnvironment.SIDE_UNDER_M;
        const held = (row, low) => ({ ...row, own: row.y, y: low - U, keep: true, fill: true, held: true });
        // The first row from `held` toward `clear` whose cross-section is clear of the band
        const exit = (heldRow, clearRow, low, away) => {
            let inside = 0, outside = 1;
            for (let k = 0; k < 12; k++) {
                const mid = (inside + outside) / 2;
                if (this.rideUnderRow(lerp(heldRow, clearRow, mid)) === null) outside = mid;
                else inside = mid;
            }
            // Never a row within SIDE_ROW_MIN_M of the next: the clear row itself is the exit then (two rows a hand
            // apart made a sliver of ribbon and a break in the wall beside it), and one that near the held row
            // stands that far from it
            const span = Math.hypot(clearRow.x - heldRow.x, clearRow.z - heldRow.z), least = WorldEnvironment.SIDE_ROW_MIN_M;
            const own = span * (1 - outside) < least;
            const row = own ? clearRow : lerp(heldRow, clearRow, Math.max(outside, Math.min(1, least / (span || 1))));
            const beside = this.rideBesideAt(row.x, row.z, row.y);
            return { ...row, own: row.y, y: (beside === null ? low : beside) - U, keep: true, fill: true, held: true, away, replaces: own };
        };
        const out = [];
        for (let i = 0; i < rows.length; i++) {
            const prev = i > 0 ? under[i - 1] : null;
            if (under[i] === null && prev !== null) {
                const e = exit(rows[i - 1], rows[i], prev, 1);
                out.push(e);
                if (e.replaces) continue;
            }
            if (under[i] !== null && i > 0 && prev === null) {
                const e = exit(rows[i], rows[i - 1], under[i], -1);
                if (e.replaces) out[out.length - 1] = e;
                else out.push(e);
            }
            out.push(under[i] === null ? rows[i] : held(rows[i], under[i]));
        }
        const along = [0];
        for (let i = 1; i < out.length; i++) along.push(along[i - 1] + Math.hypot(out[i].x - out[i - 1].x, out[i].z - out[i - 1].z));
        out.forEach((from, e) => {
            if (!from.away) return;
            const delta = from.y - from.own;
            const length = Math.min(WorldEnvironment.SIDE_MEET_MAX_M, Math.max(WorldEnvironment.SIDE_MEET_MIN_M, (1.5 * Math.abs(delta)) / WorldEnvironment.SIDE_MEET_GRADE));
            for (let i = e + from.away; i >= 0 && i < out.length && !out[i].held; i += from.away) {
                const d = Math.abs(along[i] - along[e]);
                // The first row past the ramp is kept too: where the road is at its own height again
                if (d >= length) { out[i] = { ...out[i], keep: true }; break; }
                const t = d / length, share = 1 - t * t * (3 - 2 * t);
                const own = out[i].own === undefined ? out[i].y : out[i].own;
                out[i] = { ...out[i], own, y: out[i].y + delta * share, keep: true, ...(d <= WorldEnvironment.SIDE_FILL_M ? { fill: true } : {}) };
            }
        });
        // A `fill` row whose carriageway edge lies within SIDE_GORE_M of the ride's has no verge on that side
        // (`mouthL`, `mouthR`, as at any mouth): the junction's paving lies there, not a strip of grass
        const near = this.sideNear || (this.sideNear = {});
        return out.map(row => {
            if (!row.fill) return row;
            const flags = {};
            for (const [key, sign] of [['mouthL', -1], ['mouthR', 1]]) {
                const x = row.x + sign * (row.width / 2) * Math.cos(row.heading), z = row.z - sign * (row.width / 2) * Math.sin(row.heading);
                for (const i of this.route.hashCandidates(x, z, 1)) {
                    this.route.nearestSegment(x, z, i, i, near);
                    if (near.distance - near.width / 2 <= WorldEnvironment.SIDE_GORE_M && Math.abs(near.y - row.y) <= 1.5) { flags[key] = true; break; }
                }
            }
            return flags.mouthL || flags.mouthR ? { ...row, ...flags } : row;
        });
    }

    // Side rows lifted where the road crosses over the ride too low for a deck over it (SIDE_CLEAR_M): a road that runs
    // within SIDE_PASS_M of the ride's height meets it (holdSide), one higher passes over it on a deck with full headroom.
    // The lift ramps in linearly over SIDE_RAMP_M, or over what is left of the edge before its end, so the edge's own
    // ends keep their height. Rows are {x, y, z, heading, width}; lifted rows carry `keep`
    liftSide(rows) {
        const clear = WorldEnvironment.SIDE_CLEAR_M, pass = WorldEnvironment.SIDE_PASS_M;
        const near = this.sideNear || (this.sideNear = {});
        const need = rows.map(row => {
            const reach = row.width / 2 + RoadMesh.PARAPET_W_M;
            const cos = Math.cos(row.heading), sin = Math.sin(row.heading);
            let want = 0;
            for (let o = -reach; o <= reach + 1e-9; o += reach / 2) {
                const x = row.x + o * cos, z = row.z - o * sin;
                for (const i of this.route.cellSegments(x, z) || []) {
                    this.route.nearestSegment(x, z, i, i, near);
                    const over = row.y - near.y;
                    if (near.distance <= near.width / 2 + RoadSurface.VERGE_M && over > pass && over < clear) want = Math.max(want, clear - over);
                }
            }
            return want;
        });
        if (need.every(v => v === 0)) return rows;
        const along = [0];
        for (let i = 1; i < rows.length; i++) along.push(along[i - 1] + Math.hypot(rows[i].x - rows[i - 1].x, rows[i].z - rows[i - 1].z));
        const total = along[along.length - 1];
        const lift = rows.map((_, i) => {
            let best = 0;
            need.forEach((v, j) => {
                if (!v) return;
                const d = along[i] - along[j];
                const ramp = Math.min(WorldEnvironment.SIDE_RAMP_M, d < 0 ? along[j] : total - along[j]);
                best = Math.max(best, ramp > 0 ? v * Math.max(0, 1 - Math.abs(d) / ramp) : d === 0 ? v : 0);
            });
            return best;
        });
        return rows.map((row, i) => (lift[i] > 0 ? { ...row, y: row.y + lift[i], keep: true } : row));
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
            // Every side road whose chunk has been here (Carriageways), not only those drawn now: the order the
            // window builds in must not change the works
            this.carriageways.each(x, z, 0, r => { if (r.depth >= 0 && r.y < y - WorldEnvironment.DECK_UNDER_M) best = Math.max(best ?? -Infinity, r.y); }, true);
            return best;
        };
        const landLow = (x, z) => this.landLowAt(x, z, missing);
        // Whether (x, z) lies in a road's band: the ride's carriageway and verge, or a side road's
        const inBand = (x, z) => {
            for (const i of this.route.cellSegments(x, z) || []) {
                this.route.nearestSegment(x, z, i, i, near);
                if (near.distance <= near.width / 2 + RoadSurface.VERGE_M) return true;
            }
            let side = false;
            this.carriageways.each(x, z, 0, r => { if (r.depth >= 0) side = true; }, true);
            return side;
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
        // The land as it is drawn at full detail, cut to the walls' feet (WorldEnvironment.landAt), for what stands on it
        const landDrawn = (x, z) => this.landAt(x, z, landNear);
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
        // The lowest full-detail node of the land in front of an edge point, within twice the reach of the land's
        // cut (TerrainMesh.cuts levels a node in front of a wall with a lower node within CUT_REACH_M, which may
        // itself be levelled with one as far again): the lowest the land in front of a wall there can stand, so the
        // wall reaches it, without reading the cut itself (which follows from where the walls stand)
        const frontLow = (x, z, ox, oz) => {
            const c = WorldData.CELL_M, last = n - 1, reach = 2 * TerrainMesh.CUT_REACH_M + 1, span = Math.ceil(reach / c);
            let low = null;
            for (let gj = Math.round(z / c) - span; gj <= Math.round(z / c) + span; gj++) {
                for (let gi = Math.round(x / c) - span; gi <= Math.round(x / c) + span; gi++) {
                    const dx = gi * c - x, dz = gj * c - z;
                    if (dx * ox + dz * oz < 0.3 || dx * dx + dz * dz > reach * reach) continue;
                    const tx = Math.floor(gi / last), tz = Math.floor(gj / last);
                    const tile = this.data.tile(`${tx},${tz}`);
                    if (!tile) continue;
                    const h = tile.heights[(gj - tz * last) * n + gi - tx * last];
                    if (low === null || h < low) low = h;
                }
            }
            return low;
        };
        // How deep a wall at the edge point stands: under the land drawn at any level of detail, and under the nodes
        // in front of it
        const wallFoot = (x, z, ox, oz, y, low) => {
            const front = frontLow(x, z, ox, oz);
            const lows = [low, front].filter(v => v !== null);
            return (lows.length ? Math.min(...lows) : y - WorldEnvironment.APRON_M) - WorldEnvironment.WALL_UNDER_M;
        };
        // Where the land asks for a retaining wall under the edge point, read from the tile's own nodes only (never
        // from the land as it is cut to the walls, which follows from this): {y} its foot, or null
        // Whether a side road lies at the edge point, near the road's own height: a junction's mouth
        const atMouth = (x, y, z, ox, oz) => {
            let mouth = false;
            for (const o of [0.5, 2, 4]) this.carriageways.each(x + ox * o, z + oz * o, 0, r => { if (r.depth >= 0 && Math.abs(r.y - y) < WorldEnvironment.DECK_UNDER_M) mouth = true; }, true);
            return mouth;
        };
        // Whether a road's strip (the nodes the importer carved for a road, which the lay-back never moves) lies in
        // front of the edge point lower than a bank at TerrainMesh.CUT_BANK down from it: another leg at a hairpin's
        // corner, too close under this one for land to stand between the two. A wall ends in the bank the land is
        // cut to at its end (TerrainMesh.cuts `cone`, the same slope), so one that ended here ended over the lower
        // strip, and the land in front closed to its top as a tent. Read from the nodes' own heights
        const stepped = (x, y, z, ox, oz) => {
            const c = WorldData.CELL_M, last = n - 1, reach = TerrainMesh.CUT_REACH_M, span = Math.ceil(reach / c), zones = WorldData.ZONE;
            for (let gj = Math.round(z / c) - span; gj <= Math.round(z / c) + span; gj++) {
                for (let gi = Math.round(x / c) - span; gi <= Math.round(x / c) + span; gi++) {
                    const dx = gi * c - x, dz = gj * c - z, d = Math.hypot(dx, dz);
                    if (dx * ox + dz * oz < 0.3 || d > reach) continue;
                    const tx = Math.floor(gi / last), tz = Math.floor(gj / last);
                    const tile = this.data.tile(`${tx},${tz}`);
                    if (!tile) continue;
                    const at = (gj - tz * last) * n + gi - tx * last, zone = tile.zones[at];
                    if (zone !== zones.road && zone !== zones.bench && zone !== zones.drop) continue;
                    if (y - tile.heights[at] > TerrainMesh.CUT_BANK * d + WorldEnvironment.STEP_OVER_M) return true;
                }
            }
            return false;
        };
        // `on`: asked of a row beside a wall's end, where a side road's wall goes on until the land meets its edge, and
        // the ride's until a bank down from its end clears the strip of the leg below (`stepped`)
        const wall = (x, y, z, ox, oz, on = false) => {
            // Over a lower road's band (stacked hairpin legs whose verges meet): the retaining wall stands down to that
            // road, as the real ones do. Never a deck: a road over a road off a bridge is not a structure the map has
            const under = lowerRoad(x, z, y);
            if (under !== null) return { y: under };
            // At a side road's mouth the ride has no wall: the side road leaves at its edge, near its own height (a
            // wall the importer's drop zone asked for there stood across the mouth of the road that goes on)
            if (aprons && atMouth(x, y, z, ox, oz)) return null;
            const at = WorldEnvironment.FOOT_PROBE_M;
            const zone = this.ground.tileZone(x + ox * at, z + oz * at);
            if (zone === WorldData.ZONE.drop || zone === WorldData.ZONE.wall) {
                // A wall down to the land where the land drawn at full detail lies under the edge. Where it meets the
                // edge there is no wall: one decided on the coarser land stood buried in the bank, its parapet in
                // pieces along the uphill side of the road
                const low = landLow(x + ox * at, z + oz * at);
                const near = landNear(x + ox * at, z + oz * at);
                const land = near !== null ? near : low;
                if (land !== null && land < y - WorldEnvironment.MEET_M) return { y: wallFoot(x, z, ox, oz, y, low) };
            }
            const low = landLow(x + ox * 0.1, z + oz * 0.1);
            // A side road's edge high over the land drawn near it is held by a retaining wall down to the land at any
            // level of detail (its raised centre rides on a deck, RoadMesh.sideStructures): no road edge hangs over the land
            if (!aprons) {
                const near = landNear(x + ox * 0.5, z + oz * 0.5);
                return near !== null && low !== null && near < y - (on ? WorldEnvironment.WALL_END_M : RoadMesh.PARAPET_DROP_M) ? { y: wallFoot(x, z, ox, oz, y, low) } : null;
            }
            if (low === null) return null;
            // Where the land lies WALL_OVER_M or more under a slope at the batter anywhere along its run: land that
            // falls away so no fill stands on it. (A slope drawn steeper to reach it was a slab of land in front of the
            // walls either side, and where the land met the edge and then fell away, a bank of land stood to the
            // road's edge.) A lower road within the run is such land; one nearer its height that the slope would run
            // onto asks for a wall too
            for (let o = 0.5; o <= WorldEnvironment.APRON_RUN_M; o += 0.5) {
                const land = landNear(x + ox * o, z + oz * o);
                if (land === null) break;
                if (y - RoadMesh.APRON_UNDER_M - o * RoadMesh.BATTER - land > WorldEnvironment.WALL_OVER_M) return { y: wallFoot(x, z, ox, oz, y, low) };
            }
            for (const o of [2, 4, WorldEnvironment.APRON_RUN_M]) {
                const land = landNear(x + ox * o, z + oz * o);
                if (land === null || y - RoadMesh.APRON_UNDER_M - o * RoadMesh.BATTER <= land) break;
                if (lowerRoad(x + ox * o, z + oz * o, y) !== null) return { y: wallFoot(x, z, ox, oz, y, low) };
            }
            // A wall goes on over a lower road's strip that no bank reaches: stone holds the step, round a hairpin's
            // corner too. (Only on from a wall that stands: asked of every row, it built walls on open banks that
            // stood well, and the land they levelled in front was a pit)
            if (on && stepped(x, y, z, ox, oz)) return { y: wallFoot(x, z, ox, oz, y, low) };
            return null;
        };
        // `walled`: true where the road's wall plan put a wall (RoadMesh.wallPlan), false where it put none (the land
        // then gives a slope or nothing), undefined to let the land decide (no plan)
        // `fill`: a side road's row in a junction's mouth (WorldEnvironment.holdSide), which stands on a slope down to
        // the land as the ride does: the rider passes it at arm's length, and its edge over the land with nothing
        // under it was a dark gap along the verge. (The rest of a side road has no slopes: `aprons`)
        const foot = (x, y, z, ox, oz, walled, fill = false) => {
            if (walled !== false) {
                const w = wall(x, y, z, ox, oz);
                if (w) return { kind: 'wall', y: w.y };
                if (walled) return { kind: 'wall', y: wallFoot(x, z, ox, oz, y, landLow(x + ox * 0.1, z + oz * 0.1)) };
            }
            if (!aprons && !fill) return null;
            const low = landLow(x + ox * 0.1, z + oz * 0.1);
            if (low === null) return { kind: 'apron', y: y - WorldEnvironment.APRON_M };
            if (low >= y - WorldEnvironment.MEET_M) return null;
            // The apron runs out at the batter until it meets the land drawn near (8 m triangles, cut to the walls),
            // never on over a valley beyond, and never into another road's band (the other leg of a hairpin, a side
            // road): it stops at the band's edge
            let run = 0;
            for (let o = 0.5; o <= WorldEnvironment.APRON_RUN_M; o += 0.5) {
                const px = x + ox * o, pz = z + oz * o;
                if (inBand(px, pz)) break;
                run = o;
                const land = landDrawn(px, pz);
                if (land === null || y - RoadMesh.APRON_UNDER_M - o * RoadMesh.BATTER <= land) break;
            }
            // Its foot stands on the land: where the land falls away steeper than the batter (or the apron stopped at
            // a band's edge) the foot drops to the land there, so the apron is steeper than the batter but never ends
            // in the air (RoadMesh.apronRun reads its run). With no run at all (a band at once: the far ribbon's edge
            // is its carriageway's) there is no apron to drop, and the edge is left as it was
            let footY = y - RoadMesh.APRON_UNDER_M - run * RoadMesh.BATTER - 0.2;
            const footLand = landDrawn(x + ox * run, z + oz * run);
            if (run > 0 && footLand !== null && footY > footLand + WorldEnvironment.MEET_M) footY = footLand - 0.2;
            // Without the tile under the foot yet, the apron is built again when it comes
            if (footLand === null && missing) missing.add(`${Math.floor((x + ox * run) / m)},${Math.floor((z + oz * run) / m)}`);
            // Coloured as the land at its top and at its foot (RoadMesh.edgeWorks blends them), not one sample
            return { kind: 'apron', y: footY, run, color: landColor(x + ox * Math.max(run, 0.5), z + oz * Math.max(run, 0.5)), top: landColor(x + ox * 0.5, z + oz * 0.5) };
        };
        // How deep one of the ride's walls must stand to reach the land in front of it as it is drawn (cut and
        // levelled to the walls): asked when the wall is drawn, after every wall's line is known. A side road's wall
        // stands on the nodes' own lowest (wallFoot): its chunk is built before the land is cut to it
        if (aprons) foot.under = (x, y, z, ox, oz) => {
            let low = Infinity;
            for (const o of [0.2, 1, 2]) { const land = landDrawn(x + ox * o, z + oz * o); if (land !== null && land < low) low = land; }
            return low - WorldEnvironment.WALL_UNDER_M;
        };
        // The land as it is drawn at (x, z), for a slope's foot between two rows (RoadMesh.edgeWorks)
        foot.land = landDrawn;
        if (aprons) foot.mouth = atMouth;
        // The far edge of a junction's paving from a point (x, y, z) of the ride's carriageway edge, out along (ox, oz):
        // the last place within SIDE_GORE_REACH_M that lies on a side road at about the ride's height (as the side
        // road is drawn: WorldGround.sideRoadY), found without a gap wider than SIDE_GORE_M, or null with none. The
        // ride lays paving from its edge to there (RoadMesh.edgeWorks), under the side roads' ribbons: whatever lies
        // between the ride and a side road in a junction, and behind the piece that joins their walls, is road
        if (aprons) foot.gore = (x, y, z, ox, oz) => {
            let last = 0, lastY = null;
            for (let d = 0.5; d <= WorldEnvironment.SIDE_GORE_REACH_M && d - last <= WorldEnvironment.SIDE_GORE_M; d += 0.5) {
                const px = x + ox * d, pz = z + oz * d;
                // (never on over another leg of the ride)
                if (lastY !== null && d > 1 && this.rideSurfaceAt(px, pz, y) !== null) break;
                const side = this.ground.sideRoadY(px, pz);
                if (side === null) continue;
                // Only while the side road stands at the ride's height (in the band and at the foot of its ramp): past
                // that the two are two roads again, each with its own edge
                if (Math.abs(side - y) > WorldEnvironment.SIDE_GORE_STEP_M) break;
                last = d;
                lastY = lastY === null ? side : Math.min(lastY, side);
                // (under the importer's own height for that road too, where it lies lower: the structures' guard
                // reads a side road there, Carriageways)
                this.carriageways.each(px, pz, 0, r => { if (r.depth >= 0 && Math.abs(r.y - y) <= 1.5 && r.y < lastY) lastY = r.y; }, true);
            }
            return lastY === null ? null : [x + ox * last, Math.min(lastY, y) - WorldEnvironment.SIDE_GORE_UNDER_M, z + oz * last];
        };
        // Whether a side road's wall ends within reach of the place (x, y, z), the end of one of the ride's walls: the
        // two are joined there (wallJoins), and the ride lays no slope from its wall's end into the mouth
        if (aprons) foot.joined = (x, y, z) => {
            for (const runs of this.sideWalls.values()) {
                for (const run of runs) {
                    for (const p of [run.points[0], run.points[run.points.length - 1]]) if (Math.hypot(p[0] - x, p[2] - z) < WorldEnvironment.WALL_JOIN_M && Math.abs(p[1] - y) <= 1) return true;
                }
            }
            return false;
        };
        foot.wall = (x, y, z, ox, oz, forced = false, on = false) => wall(x, y, z, ox, oz, on) || (forced && !(aprons && atMouth(x, y, z, ox, oz)) ? { y: wallFoot(x, z, ox, oz, y, landLow(x + ox * 0.1, z + oz * 0.1)) } : null);
        return foot;
    }

    // The land drawn at full detail at (x, z): `raw(x, z)` the tile's own triangles, until the land is cut to the walls
    landAt(x, z, raw) {
        const m = WorldData.TILE_M;
        const key = `${Math.floor(x / m)},${Math.floor(z / m)}`;
        const tile = this.data.tile(key);
        const cuts = tile ? this.cutsOf(key) : null;
        return cuts ? TerrainMesh.heightAt(tile, x, z, cuts) : raw(x, z);
    }

    // The cuts of a tile's land to the retaining walls that cross it (TerrainMesh.cuts), or null: made when first
    // asked for from the walls of the ride's sections and of the side chunks here, and again when those change
    cutsOf(key) {
        if (this.cutCache.has(key)) return this.cutCache.get(key);
        const tile = this.data.tile(key);
        if (!tile) return null;
        // Nothing the walls are planned from reads the cut land; were it asked for meanwhile, it is the nodes' own
        this.cutCache.set(key, null);
        // The highest road surface between two points, read every metre and a half (a road's carriageway and verge)
        const roadOver = (ax, az, bx, bz) => {
            let high = -Infinity;
            const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 1.5));
            // (not at the first point itself: a node just outside the edge of the road its wall holds up)
            for (let k = 1; k <= steps; k++) this.carriageways.each(ax + ((bx - ax) * k) / steps, az + ((bz - az) * k) / steps, RoadSurface.VERGE_M, r => { if (r.y > high) high = r.y; });
            return high;
        };
        const cuts = TerrainMesh.cuts(tile, this.wallRunsNear(tile), this.nearTile, roadOver);
        this.cutCache.set(key, cuts);
        return cuts;
    }

    // The retaining walls' top lines within reach of a tile (RoadMesh.wallRuns): the ride's, a run that goes on from
    // one section into the next joined into one, and the side roads' of the chunks here
    wallRunsNear(tile) {
        const m = WorldData.TILE_M, reach = TerrainMesh.CUT_TAPER_M + 30;
        const x0 = tile.tx * m - reach, z0 = tile.tz * m - reach, x1 = (tile.tx + 1) * m + reach, z1 = (tile.tz + 1) * m + reach;
        const near = box => box && box[2] >= x0 && box[0] <= x1 && box[3] >= z0 && box[1] <= z1;
        const ride = [];
        if (!this.streamer) return [];
        for (const section of this.streamer.sections) if (near(section.bbox)) ride.push(...this.rideWalls(section.index).runs);
        const at = p => `${Math.round(p[0] * 1000)},${Math.round(p[2] * 1000)}`;
        const starts = new Map();
        for (const run of ride) starts.set(`${run.key}|${at(run.points[0])}`, run);
        const joined = new Set();
        const out = [];
        for (const run of ride) {
            if (joined.has(run)) continue;
            // Not the first piece of its wall when another ends where it starts
            if (ride.some(other => other !== run && other.key === run.key && at(other.points[other.points.length - 1]) === at(run.points[0]))) continue;
            const whole = { key: run.key, owner: -1, points: run.points.slice(), out: run.out.slice() };
            for (let next = starts.get(`${run.key}|${at(whole.points[whole.points.length - 1])}`); next && next !== run && !joined.has(next); next = starts.get(`${run.key}|${at(whole.points[whole.points.length - 1])}`)) {
                joined.add(next);
                whole.points.push(...next.points.slice(1));
                whole.out.push(...next.out.slice(1));
            }
            out.push(whole);
        }
        for (const runs of this.sideWalls.values()) for (const run of runs) if (near(run.box)) out.push(run);
        return out;
    }

    // The ends of the ride's retaining walls within `reach` of a box ([x0, z0, x1, z1]): [{p, foot, out}], a run that
    // goes on from one section into the next read as one. The keys its plans were made without go into `missing`
    rideWallEnds(box, reach, missing = null) {
        if (!this.streamer || !box) return [];
        const at = p => `${Math.round(p[0] * 1000)},${Math.round(p[2] * 1000)}`;
        const ends = new Map();
        for (const section of this.streamer.sections) {
            const b = section.bbox;
            if (!b || b[2] < box[0] - reach || b[0] > box[2] + reach || b[3] < box[1] - reach || b[1] > box[3] + reach) continue;
            const walls = this.rideWalls(section.index);
            if (missing) for (const key of walls.missing) missing.add(key);
            for (const run of walls.runs) {
                for (const i of [0, run.points.length - 1]) {
                    const id = `${run.key}|${at(run.points[i])}`;
                    // Two runs' ends at one place are one wall that goes on
                    if (ends.has(id)) ends.set(id, null);
                    else ends.set(id, { p: run.points[i], foot: run.foot[i], out: run.out[i] });
                }
            }
        }
        return [...ends.values()].filter(Boolean);
    }

    // Where a side road's wall ends within WALL_JOIN_M of the end of one of the ride's walls, at about its height, a
    // piece of wall joins the two (RoadMesh.wallJoin): at a junction on a bank the ride's wall stops at the mouth and
    // the side road's starts where its edge is clear of the ride, and between them the bank showed, a wedge of land
    // between two stone faces. `walls` are the side roads' runs (RoadMesh.wallRuns), `box` their chunk's
    wallJoins(walls, box, missing = null) {
        const reach = WorldEnvironment.WALL_JOIN_M;
        const ride = walls.length ? this.rideWallEnds(box, reach + 60, missing) : [];
        const out = [], used = new Set();
        if (!ride.length) return out;
        for (const run of walls) {
            if (!(run.owner >= 0)) continue;
            for (const i of [0, run.points.length - 1]) {
                const a = run.points[i];
                let best = null, bestD = reach;
                for (const end of ride) {
                    const d = Math.hypot(end.p[0] - a[0], end.p[2] - a[2]);
                    if (d < bestD && d > 0.05 && Math.abs(end.p[1] - a[1]) <= 1 && !used.has(end)) { best = end; bestD = d; }
                }
                if (!best) continue;
                used.add(best);
                // It faces the way the two runs do, square to its own line
                const dx = best.p[0] - a[0], dz = best.p[2] - a[2];
                const mx = run.out[i][0] + best.out[0], mz = run.out[i][1] + best.out[1];
                const side = -dz * mx + dx * mz >= 0 ? 1 : -1;
                const drop = RoadMesh.PARAPET_DROP_M;
                out.push({ a, b: best.p, footA: run.foot[i], footB: best.foot, outA: run.out[i], outB: best.out, o: [(-dz * side) / bestD, (dx * side) / bestD], parapet: a[1] - run.foot[i] >= drop && best.p[1] - best.foot >= drop, owner: run.owner });
            }
        }
        return out;
    }

    // The walls of a side chunk as its edge works drew them. The land of the tiles they cross is cut again when they change
    setSideWalls(k, runs) {
        const sign = list => list.map(run => run.points.map(p => `${Math.round(p[0] * 100)},${Math.round(p[2] * 100)}`).join(' ')).join('|');
        const old = this.sideWalls.get(k) || [];
        for (const run of runs) {
            run.box = [Infinity, Infinity, -Infinity, -Infinity];
            for (const p of run.points) { run.box[0] = Math.min(run.box[0], p[0]); run.box[1] = Math.min(run.box[1], p[2]); run.box[2] = Math.max(run.box[2], p[0]); run.box[3] = Math.max(run.box[3], p[2]); }
        }
        if (sign(old) === sign(runs)) return;
        this.faceStamp++;
        if (runs.length) this.sideWalls.set(k, runs);
        else this.sideWalls.delete(k);
        for (const run of old.concat(runs)) this.dropCuts(run.box);
    }

    // The land's cuts under a box ([x0, z0, x1, z1]) are made again, and the tiles drawn there at full detail with them
    dropCuts(box) {
        const m = WorldData.TILE_M, reach = TerrainMesh.CUT_TAPER_M + 30;
        for (let tx = Math.floor((box[0] - reach) / m); tx <= Math.floor((box[2] + reach) / m); tx++) {
            for (let tz = Math.floor((box[1] - reach) / m); tz <= Math.floor((box[3] + reach) / m); tz++) {
                const key = `${tx},${tz}`;
                if (!this.cutCache.has(key)) continue;
                this.cutCache.delete(key);
                // After what is still to arrive (the chunks beside this one change the same tiles): once, at the end
                this.streamer.enqueue(`cut:${key}`, WorldEnvironment.LATER, () => {
                    const state = this.streamer.tiles.get(key);
                    if (state && state.lod === 0 && this.tileMeshes.has(key) && this.data.tile(key)) this.buildTile(key, 0);
                });
            }
        }
        // and the ride's works that stand on that land (a slope's foot, a wall's)
        this.reworkRoads(box, reach);
    }

    // The ride's sections within `reach` of a box are built again, once, after what is still to arrive
    reworkRoads(box, reach = 30) {
        if (!this.streamer || !box) return;
        for (const section of this.streamer.sections) {
            const b = section.bbox;
            if (!b || !this.roadMeshes.has(section.index) || b[2] < box[0] - reach || b[0] > box[2] + reach || b[3] < box[1] - reach || b[1] > box[3] + reach) continue;
            this.streamer.enqueue(`works:road:${section.index}`, WorldEnvironment.LATER, () => {
                const held = this.streamer.roads.get(section.index);
                if (held && this.roadMeshes.has(section.index)) this.buildRoad(section, held.lod);
            });
        }
    }

    // Per-vertex hold of a side ribbon (RoadMesh.sideRoad holdY): each vertex of a row in the ride's band, and of the
    // row where the road leaves it, stands SIDE_UNDER_M under the ride's surface at its own place (the ride falls along
    // its length, so across an oblique side road its edge is not level: a row held level across met it at one point)
    // Only the rows holdSide held (`held`) reach into the band, so the rest are not looked at.
    // Two side roads of one junction both lie in the band: each takes its own depth under the ride (`edge`, its
    // id: one of four depths 21 mm apart), or the two ribbons lay in one plane and flickered
    sideHold(edge = 0) {
        const under = WorldEnvironment.SIDE_UNDER_M + ((((edge % 6) + 6) % 6) % 4) * 0.021;
        return (x, y, z, row) => {
            if (!row.held) return y;
            let low = this.rideSurfaceAt(x, z, y);
            if (low === null) low = this.rideBesideAt(x, z, y);
            return low === null ? y : low - under;
        };
    }

    // The rows a side road goes on as past the `end` ('a' or 'b') of `edge`, through the nodes it only passes (degree
    // 2), for `lengthM`: in the order and the heading of the edge's own rows (those past its first row arrive at it),
    // without the row at the node itself. Empty at a junction, at a dead end, or while the next edge is not resident
    sideOnward(edge, end, lengthM = WorldEnvironment.SIDE_MEET_MAX_M + 30) {
        const node = edge[end];
        const next = this.graph.onwardEdge(edge.id, node);
        if (!next) return [];
        const { rows, complete } = this.graph.chainFrom(next.id, node, lengthM);
        if (!complete || rows.length < 2) return [];
        const out = rows.slice(1).map(row => ({ x: row.x, y: row.y, z: row.z, heading: row.heading, width: row.width, bits: row.bits }));
        return end === 'b' ? out : out.reverse().map(row => ({ ...row, heading: row.heading + Math.PI }));
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

    // A ride section's wall plan reads this far past its ends, so a run that crosses into the next section is one
    // run in both (RoadMesh.WALL_GAP_M, WALL_RUN_M)
    static get WALL_PLAN_M() { return 36; }

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
        const missing = new Set();
        const sides = [], structures = [];
        // The land a side road's structures stand on; a chunk built before a tile under it is built again when it arrives
        // (the nodes' own land, not the land as it is cut to the walls: a road beside a wall, where the land in front
        // is levelled, is not a road raised over the land that needs a deck)
        const groundAt = (x, z) => {
            const y = this.ground.tileHeight(x, z, false);
            if (y === null) missing.add(`${Math.floor(x / WorldData.TILE_M)},${Math.floor(z / WorldData.TILE_M)}`);
            return y;
        };
        // A pier stands on the lowest land the tile draws at any level of detail (RoadMesh.sideStructures footAt)
        const footAt = (x, z) => this.landLowAt(x, z, missing);
        const options = { groundAt, footAt, roof: WorldRoute.ROOF_M };
        // A road's structures and edge works stand at its verge's outer edge (its LOD0 ribbon's sides) at every level of
        // detail, as the ride's do, so a change of level of detail builds only its ribbons again (drawSideRibbons)
        const roads = [];
        const draw = (rows, stub, edge, guard, s0 = 0) => {
            const road = new THREE.Group();
            road.name = stub ? 'world-road-stub' : 'world-road-side';
            const built = RoadMesh.sideStructures(RoadMesh.vergeSides(rows, this.sideHold(edge.id)), options.groundAt, options.roof, options.footAt, guard);
            Object.assign(road.userData, { sides: built.sides, structures: built.parts, piers: built.piers, rows, stub, edge: edge.id, s0 });
            // The physics rides the road as it is drawn (held at the ride's height in a junction, on its ramp past it)
            edgesHere.push({ x: rows.map(row => row.x), z: rows.map(row => row.z), y: rows.map(row => row.y), width: rows.map(row => row.width) });
            sides.push(Object.assign(built.sides, { owner: edge.id }));
            structures.push(...built.parts.map(part => Object.assign(part, { owner: edge.id })));
            group.add(road);
            roads.push(road);
        };
        this.data.edges.forEach((edge) => {
            if (edge.onRide || this.data.chunkOf(edge.first) !== k) return;
            const samples = this.graph.samples(edge.id);
            if (!samples) return;
            let plain = WorldEnvironment.unwrap(Array.from(samples.x, (_, i) => ({ x: samples.x[i], y: samples.y[i], z: samples.z[i], heading: samples.heading[i], width: samples.width[i], bits: samples.flags[i], cls: edge.cls, i })));
            if (plain.length < 2) return;
            plain = this.sideMouths(edge, plain);
            const { rows, s0 } = this.fromRideEnd(edge, plain);
            const node = barrierEdges.get(edge.id);
            const guard = this.carriageways.guard(edge.id);
            let far = this.liftSide(rows);
            let farS = s0;
            if (node !== undefined) {
                const stub = this.graph.stub(edge.id, node);
                if (stub && stub.length > 1) {
                    // The far ribbon goes on from the stub's last row: drawn under the stub as well, the two lay one
                    // road twice in one plane (and its deck and parapets twice), which flickers
                    const away = Math.hypot(far[0].x - stub[0].x, far[0].z - stub[0].z) <= Math.hypot(far[far.length - 1].x - stub[0].x, far[far.length - 1].z - stub[0].z);
                    far = away ? far.slice(stub.length - 1) : far.slice(0, far.length - stub.length + 1);
                    // (the rest of the edge and what it goes on as are read for the ramp past the ride's band)
                    const flip = list => list.slice().reverse().map(row => ({ ...row, heading: row.heading + Math.PI }));
                    const rest = away ? far.slice(1) : flip(far).slice(1);
                    const onward = away ? this.sideOnward(edge, 'b') : flip(this.sideOnward(edge, 'a'));
                    const stubPlain = this.sideMouths({ ...edge, a: node, b: -1 }, WorldEnvironment.unwrap(stub.map(p => ({ ...p, bits: p.flags, cls: edge.cls }))), true, false);
                    const stubRows = this.holdSide(stubPlain, [], [...rest, ...onward]);
                    let length = 0;
                    for (let i = 1; i < stubRows.length; i++) length += Math.hypot(stubRows[i].x - stubRows[i - 1].x, stubRows[i].z - stubRows[i - 1].z);
                    // The rest goes on from the stub's end, run away from the junction and measured from it
                    if (!away) far = flip(far);
                    farS = length;
                    draw(stubRows, true, edge, guard);
                    if (far.length < 2) return;
                    draw(this.holdSide(far, stubPlain.slice(0, -1), onward), false, edge, guard, farS);
                    return;
                }
            }
            if (far.length < 2) return;
            draw(this.holdSide(far, this.sideOnward(edge, 'a'), this.sideOnward(edge, 'b')), false, edge, guard, farS);
        });
        // The edge works of every side road here, one mesh: its retaining walls, decks and tubes (a side road is seen
        // from afar at LOD1, and aprons for every one cost the window's meshes and the queue's time); built again when
        // a tile under them arrives
        // (and where one of their walls ends beside the end of one of the ride's, the two are joined: wallJoins)
        const box = this.data.manifest.chunks[k] && this.data.manifest.chunks[k].bbox;
        triangles += RoadMesh.addEdgeWorks(group, sides, this.edgeFoot(missing, { aprons: false }), structures, this.carriageways, walls => this.wallJoins(walls, box, missing));
        // The land is cut to their walls (setSideWalls)
        this.setSideWalls(k, group.userData.walls || []);
        group.userData.roads = roads;
        group.userData.works = triangles;
        triangles += this.drawSideRibbons(k, group, near);
        // Its works keep out of the carriageways of the side roads round it (Carriageways): built before a neighbour's
        // chunk is here, it is built again when that chunk is
        if (box) for (const j of this.data.chunksNear((box[0] + box[2]) / 2, (box[1] + box[3]) / 2, Math.hypot(box[2] - box[0], box[3] - box[1]) / 2 + 20)) if (j !== k && !this.data.chunks.has(j)) missing.add(`chunk:${j}`);
        for (const key of missing) (this.waitingOnTile.get(key) || this.waitingOnTile.set(key, new Set()).get(key)).add(`side:${k}`);
        group.userData.triangles = triangles;
        group.traverse(o => { if (o.isMesh) o.userData.skipCulling = true; });
        this.sideGroup.add(group);
        this.onMeshBuilt(group);
        this.sideMeshes.set(k, group);
        this.sideEdges.set(k, edgesHere);
        this.triangleCount += triangles;
        if (this.goreRows) this.goreRows.clear();
        this.ground.setSideEdges([...this.sideEdges.values()].flat());
        // The ride sections built before this chunk's roads were known keep out of them now
        this.rebuildWaiting(`chunk:${k}`);
        // and those built before its roads were drawn pave the junctions with them now (edgeFoot `gore` reads the
        // side roads as they are drawn, which a section built first could not): the browser builds the ride first
        this.reworkRoads(box);
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
                    ribbon = RoadMesh.ribbon(run.rows, run.near ? 0 : 1, this.sideHold(edge), true);
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
        if (this.goreRows) this.goreRows.clear();
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
        if (this.roadworks) this.roadworks.update(position, Number.isFinite(dtSec) ? dtSec : 0);
        if (Number.isFinite(dtSec) && dtSec > 0) this.streamClockMs += dtSec * 1000;
        this.updateBarriers(s);
        this.streamer.update(position, s);
        if (this.placed) {
            this.placed = false;
            this.streamer.releasePlacing();
        }
        this.streamer.pump(budgetMs);
        this.scenery.rankStones(position);
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
