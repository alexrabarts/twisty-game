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
    static get SIDE_RAMP_GRADE() { return 0.12; }
    static get SIDE_ROW_MIN_M() { return 1.5; }
    // A side road's wall that ends this near the end of one of the ride's is joined to it (wallJoins)
    static get WALL_JOIN_M() { return 8; }
    // A junction's paving reaches from the ride's edge to the side roads over gaps no wider than this (edgeFoot `gore`),
    // while the side road stands no more than SIDE_GORE_STEP_M under the ride's height and SIDE_GORE_RISE_M over it: it
    // ramps up to a side road that climbs away beside the ride (held to SIDE_GORE_STEP_M either way, a side road that
    // climbs away left a dip of land between the two, 0.3 m under both, where the junction is one surface)
    static get SIDE_GORE_M() { return 4.5; }
    static get SIDE_GORE_REACH_M() { return 16; }
    // A side road's end row is turned to meet the next edge's where their widths differ by this much (buildSide `meet`)
    static get MEET_WIDTH_M() { return 1; }
    // How far under a side road the paving comes up to it where it first meets it (edgeFoot `gore`'s `near`): just
    // under its ribbon there, so the paving between the two roads is no more than a hand under the line between them
    static get SIDE_GORE_NEAR_M() { return 0.06; }
    // How far on under the side road from its edge the paving reaches (RoadMesh.edgeWorks)
    static get SIDE_GORE_TUCK_M() { return 1; }
    static get SIDE_GORE_STEP_M() { return 0.35; }
    // The turns from square the paving beside a bridge's first row tries where the line square to the ride meets no
    // side road (edgeFoot `gore` `turn`): 15 to 60 degrees either way
    static get SIDE_GORE_TURNS() { return [15, -15, 30, -30, 45, -45, 60, -60].map(a => (a * Math.PI) / 180); }
    static get SIDE_GORE_RISE_M() { return 0.5; }
    // A side road beside the ride with its band (carriageway and verge) within CLEFT_GAP_M of the ride's verge, and the
    // land between the two more than CLEFT_DIP_M under the lower of them, has the gap closed by ground at the lower
    // road's height (cleftAt), laid CLEFT_TUCK_M on into the side road's band, where the side road stands on a wall
    static get CLEFT_GAP_M() { return 2.5; }
    static get CLEFT_DIP_M() { return 0.25; }
    // ... and under a side road over the ride, where the ride may lie on a slope that falls along the gap: read at the
    // rows (3 to 4 m apart), the land between two of them lay 0.1 m deeper than at either (leg 6's j85)
    static get CLEFT_OVER_DIP_M() { return 0.15; }
    static get CLEFT_TUCK_M() { return 0.3; }
    static get RIDE_NEAR_M() { return 0.5; }
    static get CLEFT_ROWS() { return 4; }
    static get CLEFT_STEP_M() { return 3; }
    // The paving lies this far under the roads' surfaces: under the deepest side ribbon in the band (sideHold)
    static get SIDE_GORE_UNDER_M() { return 0.13; }
    // A side road within this of the ride's height under the ride's verge keeps the ground the ride lays there under it
    // (edgeFoot `sideUnder`)
    static get SIDE_UNDER_NEAR_M() { return 0.5; }
    // The ride's verge where a side road crosses it (mouthCut): read on a grid of this many metres, for the rows within
    // MOUTH_CUT_ROWS of a mouth the junction's record names, each row carrying the crossings within MOUTH_CUT_PAD_M of
    // it (more than the longest gap between two rows), each read whole up to MOUTH_CUT_REACH_M past that
    static get MOUTH_CUT_STEP_M() { return 0.1; }
    static get MOUTH_CUT_ROWS() { return 4; }
    static get MOUTH_CUT_PAD_M() { return 8; }
    static get MOUTH_CUT_REACH_M() { return 24; }
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
    // How far under the coarsest land a far section's slope may stand over (landLowAt, which reads the nodes) its foot
    // goes: the tile as built is held a little lower again under the ride (buildTile's holdY), and a foot at the land
    // read from the nodes stood over it by up to 0.3 m, open at the bottom
    static get COARSE_UNDER_M() { return 0.5; }
    // How far the land drawn coarser may lie under a side road's edge before a face closes the gap (foot.coarse): a far
    // ribbon is 400 m and more off, where a metre is two or three pixels
    static get SIDE_COARSE_M() { return 1; }

    // Metres from the bike within which a landmark is drawn
    static get LANDMARK_REACH_M() { return 3000; }

    static async load(scene, { id = 'all', search = '', fetchFn = null, models = undefined, digest = null } = {}) {
        const resolved = WorldData.resolveBase(new URLSearchParams(search).get('worldData'), id);
        if (resolved.error) throw new Error(resolved.error);
        const data = new WorldData({ base: resolved.base, overridden: resolved.overridden, fetchFn, digest });
        await data.load();
        const found = id === 'all' ? null : data.manifest.stages.find(s => s.id === id);
        if (id !== 'all' && !found) throw new Error(`unknown world "${id}"; known: all, ${data.manifest.stages.map(s => s.id).join(', ')}`);
        // The data as the stage rides it: a stage ridden against the ride reads it turned round (WorldData.useStage)
        data.useStage(found);
        const stage = data.stage;
        // The side roads round the junctions and landmarks, which the landmarks keep clear of
        await data.ensureChunks(Scenery.fixtureChunks(data)).catch(error => console.warn(`world fixture chunks: ${error.message}`));
        // and round the dams, whose crest a side road may run on (WorldDams.plan lays the crest under it)
        if (typeof WorldDams !== 'undefined') {
            await data.ensureChunks(WorldDams.chunksOf(data)).catch(error => console.warn(`world dam chunks: ${error.message}`));
            // and the land under them, whose feet meet it
            await Promise.all(WorldDams.tilesOf(data).map(key => data.ensureTile(key))).catch(error => console.warn(`world dam tiles: ${error.message}`));
        }
        // The land and cover round the landmarks, which a landmark stands on dry and seated
        await Promise.all(Scenery.fixtureTiles(data).map(key => Promise.all([data.ensureTile(key), data.ensureCover(key)]))).catch(error => console.warn(`world fixture tiles: ${error.message}`));
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
        this.places = new WorldPlaces(data.manifest.places || [], this.route, stage ? { from: stage.from, to: stage.to, stage: stage.id } : {});
        // The stops at the stages' ends (tools/world/stops.mjs): where the group parks after the finish line
        this.stops = data.manifest.stops || [];
        // The stage's own air, measured on its photos (WorldLooks.stageAir)
        if (typeof LandShade !== 'undefined' && typeof WorldLooks !== 'undefined') {
            LandShade.setAir(stage ? WorldLooks.airOf(stage.id) : null);
            // and its land's colours and its haze's depth, before any of its land is built
            LandShade.setView(stage ? WorldLooks.viewOf(stage.id) : null);
        }
        this.ground = new WorldGround(this.route, data);
        // The physics reads the land as it is drawn: cut to the retaining walls (cutsOf)
        this.ground.cutsOf = key => this.cutsOf(key);
        // and a retaining wall where the ride's wall plan draws one (rideWalls)
        this.ground.walledAt = (index, sign) => this.walledAt(index, sign);
        this.ground.taperAt = (index, sign, t) => this.taperAt(index, sign, t);
        this.ground.copingAt = (index, sign) => this.copingAt(index, sign);
        this.ground.slopeAt = (index, sign) => this.slopeAt(index, sign);
        this.ground.bridgedAt = (index, sign) => this.bridgedAt(index, sign);
        this.ground.wallTop = (index, sign) => this.wallTop(index, sign);
        // and the ground that closes a narrow gap between the ride and a side road beside it (cleftAt)
        this.ground.cleftAt = (index, sign) => this.cleftAt(index, sign);
        // and a row of marker stones where it takes a low wall's parapet's place (wallStoned)
        this.ground.wallStoned = (index, sign) => this.wallStoned(index, sign);
        // and the parapet where it is drawn, along the whole wall and on past its end (parapetAt)
        this.ground.parapetAt = (index, sign, t) => this.parapetAt(index, sign, t);
        // Every road's carriageway, which no structure of another road may stand in (RoadMesh's builders ask it)
        this.carriageways = new Carriageways(this.route, data);
        // The dams (js/world/dams.js): each a model from its own data, its land cut under it (pitsNear) and its top
        // the physics' ground (WorldGround.tileHeight); a road on a crest stays the road's own
        this.dams = typeof WorldDams !== 'undefined' ? new WorldDams(WorldDams.listOf(data.base), { roadAt: (x, z) => this.damRoadAt(x, z), groundAt: (x, z) => this.ground.tileHeight(x, z, false), data }) : null;
        this.ground.dams = this.dams;
        // (and the land between each lake and its dam's face made lake, on every tile: WorldDams.flood)
        if (this.dams) data.reshape(tile => this.dams.flood(tile));
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
        // The tubes of the side roads' tunnels and galleries, by chunk (setSideTubes): the land is cut to them
        this.sideTubes = new Map();
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
        // (the stage's own share of the scenery's triangles: WorldLooks.viewOf `sceneryScale`)
        const view = stage && typeof WorldLooks !== 'undefined' ? WorldLooks.viewOf(stage.id) : {};
        this.scenery.stageScale = Number.isFinite(view.sceneryScale) ? view.sceneryScale : 1;
        // (a mesh the window's caps add to a tile already drawn: Scenery.rankCaps)
        this.scenery.onMeshes = meshes => meshes.forEach((mesh) => {
            mesh.userData.skipCulling = true;
            this.onMeshBuilt(mesh);
        });
        this.scenery.landmarkModels = landmarks;
        this.sceneryGroup.add(this.scenery.forest);
        this.sceneryGroup.add(this.scenery.boulderGroup);
        this.sceneryGroup.add(this.scenery.houseGroup);
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
                buildTile: (key, lod) => this.buildTileSteps(key, lod),
                // (both in steps: WorldStreamer takes one a few milliseconds at a time)
                buildScenery: (key, lod) => this.buildSceneryAsStreamed(key, lod),
                disposeTile: key => this.disposeTile(key),
                buildRoad: (section, lod) => this.buildRoadSteps(section, lod),
                disposeRoad: section => this.disposeRoad(section),
                buildSide: (k, near) => this.buildSideSteps(k, near),
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
            // The far grid and the mountains round it out to 40 km (the camera's far plane reaches them,
            // WorldEnvironment.FAR_PLANE_M), each grid closed onto the level round it (FarLand.join)
            const far = FarLand.assemble(this.data.far, this.data.farCover, this.data.farSink, this.data.farLevels || []);
            this.horizon = far.horizon;
            this.farLand = far.levels;
            this.triangleCount += far.triangles;
            for (const mesh of [this.horizon, ...this.farLand]) this.group.add(mesh);
            // (cut to the tubes' boxes as the tiles are: under a tile cut away in a tube, the far grid drawn a few
            // metres under the land stood in the tube, a mound across the lane at km 13.2 of the Gotthard leg)
            // (its colours made linear here, once, as a tile's are: the geometry is built again at each cut)
            const geometry = this.horizon.geometry;
            const linear = Float32Array.from(geometry.attributes.color.array, v => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
            geometry.userData.linearColors = true;
            // (a tile's skirt reaches under the far grid drawn under its edge, TerrainMesh.FAR_UNDER_M)
            this.farUnder = (x, z) => { const at = FarLand.sample(this.horizon, x, z); return at ? at.y : null; };
            this.horizonWhole = { positions: Float32Array.from(geometry.attributes.position.array), shades: linear, index: Uint32Array.from(geometry.index.array), normals: Float32Array.from(geometry.attributes.normal.array) };
            this.clipHorizon();
            // Where the drawn tiles end, a tile takes the far land's colour and normal (LandShade.EDGE_M)
            this.edgeFar = Horizon.edgeTextures(this.horizon);
            LandShade.setEdge(this.edgeFar, this.drawnTiles());
        }
        // The arch stands at the start only. Each checkpoint between is a roadworks site (Roadworks), and the finish has
        // no marker at all: the owner asked for no yellow finish gantry, the HUD shows the progress, and the line is timed
        // where it was. Crossing it starts the stop scene (StopScene), which flies the camera to the leg's end stop
        const stations = this.stationGates || [];
        const ends = stations.filter((st, i) => i === 0 && stations.length > 1);
        this.roadworks = new Roadworks(this, stations);
        if (this.roadworks.group) this.group.add(this.roadworks.group);
        // No rider waits in the works or under a gate: the places there are closed (WorldPlaces.close)
        this.places.close([...(this.roadworks.sites || []).map(site => ({ s0: site.s0, s1: site.s1 })), { s0: this.startS, s1: this.startS }, { s0: this.endS, s1: this.endS }]);
        // The stops at the stages' ends (StopScene): each area laid as hard standing, with its kind's props
        if (typeof StopScene !== 'undefined') {
            this.stopMeshes = StopScene.buildAll(this.stops);
            for (const mesh of this.stopMeshes) {
                this.triangleCount += mesh.geometry.attributes.position.count / 3;
                this.group.add(mesh);
            }
        }
        // What makes each open place read as a stop (its props), solid to the bike as a house's walls are
        this.placeMesh = new PlaceMesh(this.places, this.route);
        this.group.add(this.placeMesh.group);
        this.scenery.props = this.placeMesh;
        const out = { positions: [], shades: [] };
        const post = [0.55, 0.55, 0.58];
        for (const st of ends) {
            // The frame stands off any side road its posts would be in (Scenery.gateS); the timing line stays at st.s
            const postOut = q => q.width / 2 + 1.2;
            const p = this.route.sample(this.scenery.gateS(st.s, postOut, this.route), {});
            const half = postOut(p);
            const color = [0.92, 0.92, 0.92];
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
        if (this.dams && this.dams.dams.length) {
            this.damGroup = this.dams.group();
            this.group.add(this.damGroup);
        }
        // The marmots of the high pastures (js/world/marmots.js): placed from this world's own land and water
        this.marmots = typeof Marmots !== 'undefined' && typeof SceneAssets !== 'undefined' ? new Marmots(this) : null;
        if (this.marmots) this.group.add(this.marmots.group);
        this.group.traverse(o => { if (o.isMesh) o.userData.skipCulling = true; });
    }

    // The land in two steps: at full detail the land's cut to the walls first (cutsOf), a step of its own, then the
    // mesh; the old mesh stays drawn until the new one replaces it
    *buildTileSteps(key, lod) {
        if (lod === 0 && this.data.tile(key)) {
            // (the wall plans the cut reads made first, each in steps: wallPlansNear)
            const [tx, tz] = key.split(',').map(Number), m = WorldData.TILE_M;
            yield* this.wallPlansNear([tx * m, tz * m, (tx + 1) * m, (tz + 1) * m]);
            this.cutCache.delete(key);
            yield* this.cutsOfSteps(key);
            yield;
        }
        yield* this.landSteps(key, lod, lod === 0);
    }

    // `cutsMade`: the land's cut was made for this build already (buildTileSteps)
    buildTile(key, lod, cutsMade = false) {
        return WorldStreamer.drain(this.landSteps(key, lod, cutsMade));
    }

    // The land's mesh in steps, a row of nodes at a time (TerrainMesh.buildSteps); the old mesh drawn until the new one
    // replaces it
    *landSteps(key, lod, cutsMade = false) {
        const tile = this.data.tile(key);
        const cover = this.data.cover(key);
        // A carved cell inside the ride's band can hold a side road's height (a junction); drawn, it stays under the ride
        // At full detail the land is cut to the retaining walls that cross the tile (cutsOf), made again with the tile
        if (lod === 0 && !cutsMade) this.cutCache.delete(key);
        const built = yield* TerrainMesh.buildSteps(tile, cover, lod, (x, y, z) => {
            const low = this.rideSurfaceAt(x, z, y);
            // (a coarse tile has no cut: its nodes under a dam are held under the dam's top, WorldDams.lowAt)
            const dam = lod > 0 && this.dams ? this.dams.lowAt(x, z) : null;
            if (dam !== null) y = Math.min(y, dam);
            return low === null ? y : Math.min(y, low - TerrainMesh.SINK_M);
        }, this.nearTile, lod === 0 ? this.cutsOf(key) : null, this.tubesNear(key), this.farUnder || null);
        const old = this.tileMeshes.get(key);
        if (old) {
            this.tileGroup.remove(old.mesh);
            old.mesh.geometry.dispose();
            this.triangleCount -= old.triangles;
        }
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
        this.markDrawn(key, true);
        for (const k of around) {
            const held = this.tileMeshes.get(k);
            if (!held || !held.missing || !held.missing.includes(key)) continue;
            held.missing = held.missing.filter(m => m !== key);
            this.streamer.enqueue(`seam:${k}`, 0, () => {
                const state = this.streamer.tiles.get(k);
                return state && this.tileMeshes.has(k) && this.data.tile(k) ? this.buildTileSteps(k, state.lod) : null;
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
                if (kind === 'road' && held && this.roadMeshes.has(index)) return this.buildRoadSteps(this.streamer.sections[index], held.lod);
                else if (kind === 'side' && this.sideMeshes.has(index)) {
                    const held = this.streamer.sides.get(index);
                    return this.buildSideSteps(index, held ? held.near : '', true);
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
        const env = this;
        this.streamer.enqueue(`walls:${index}`, 0, function* () {
            const sign = runs => runs.map(run => run.key + run.points.map(p => `${Math.round(p[0] * 100)},${Math.round(p[2] * 100)}`).join(' ')).join('|');
            const plan = yield* env.rideWallsSteps(index);
            if (sign(plan.runs) !== sign(old.runs)) env.dropCuts(env.streamer.sections[index].bbox);
            // (the same walls: the section is not built again, and its taper stays as drawn)
            else if (old.plan && old.plan.drawn && plan.plan && !plan.plan.drawn) Object.assign(plan.plan, { drawn: old.plan.drawn, band: old.plan.band, kind: old.plan.kind });
        });
    }

    // Trees and houses stand on the detailed tiles only (a step of its own: the streamer queues it after the land)
    buildScenery(key, lod) {
        return WorldStreamer.drain(this.buildScenerySteps(key, lod));
    }

    // As the streamer builds it, in steps: a tile let go of while its scenery was under way has none left standing
    *buildSceneryAsStreamed(key, lod) {
        yield* this.buildScenerySteps(key, lod);
        if (!this.streamer.tiles.has(key)) this.scenery.disposeTile(key);
    }

    // The same in steps (Scenery.buildTileSteps, Scenery.setStonesSteps)
    // `again`: what stands on the tile is made again whole (restandScenery), not only its marker stones
    *buildScenerySteps(key, lod, again = false) {
        if (lod > 1) {
            this.scenery.disposeTile(key);
            return;
        }
        const tile = this.data.tile(key);
        if (!tile) return;
        // What stands is not built again when the tile's detail changes, but its marker stones stand on the nearest
        // tiles only (Scenery.setStones)
        if (this.scenery.perTile.has(key) && !again) {
            const [sx, sz] = key.split(',').map(Number), sm = WorldData.TILE_M;
            if (lod === 0) {
                yield* this.wallPlansNear([sx * sm, sz * sm, (sx + 1) * sm, (sz + 1) * sm]);
                yield* this.cutsNear([sx * sm, sz * sm, (sx + 1) * sm, (sz + 1) * sm]);
            }
            for (const mesh of yield* this.scenery.setStonesSteps(tile, lod === 0, this.lastBike)) {
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
        yield* this.wallPlansNear([tx * m, tz * m, (tx + 1) * m, (tz + 1) * m]);
        yield* this.cutsNear([tx * m, tz * m, (tx + 1) * m, (tz + 1) * m]);
        const houses = (this.data.buildings || []).filter(b => b.x >= tx * m && b.x < (tx + 1) * m && b.z >= tz * m && b.z < (tz + 1) * m);
        // (a test that leaves the scenery out replaces buildTile: it is then called as it is)
        const own = this.scenery.buildTile === Scenery.prototype.buildTile;
        const held = this.streamer.tiles.has(key);
        const group = own ? yield* this.scenery.buildTileSteps(tile, this.data.cover(key), houses, this.lastBike, lod === 0) : this.scenery.buildTile(tile, this.data.cover(key), houses, this.lastBike, lod === 0);
        // A tile the streamer let go of while its scenery was made in steps keeps none: made whole it was never made, and
        // kept it stood (and its trees were drawn) outside the window, which held a tile a whole build did not
        if (held && !this.streamer.tiles.has(key)) {
            this.scenery.disposeTile(key);
            return;
        }
        if (group) {
            group.traverse(o => { if (o.isMesh) o.userData.skipCulling = true; });
            this.sceneryGroup.add(group);
            this.onMeshBuilt(group);
        }
    }

    // What stands on the tiles round a box is made again, once, after what is still to arrive: it keeps clear of the
    // side roads drawn and stands on the land as cut (Scenery.clear, WorldGround.kindAt, cutsOf), so a side road drawn
    // or let go of, or the land cut again, after a tile's scenery was made changed what a tile would hold by the order
    // they came in. Made again, the window holds the same whatever that order was
    restandScenery(box, reach = 30) {
        if (!box || !this.streamer) return;
        const m = WorldData.TILE_M;
        for (let tx = Math.floor((box[0] - reach) / m); tx <= Math.floor((box[2] + reach) / m); tx++) {
            for (let tz = Math.floor((box[1] - reach) / m); tz <= Math.floor((box[3] + reach) / m); tz++) {
                const key = `${tx},${tz}`;
                if (!this.scenery.perTile.has(key)) continue;
                this.streamer.enqueue(`scenery:${key}`, WorldEnvironment.LATER, () => {
                    const current = this.streamer.tiles.get(key);
                    return current && this.scenery.perTile.has(key) ? this.sceneryAgain(key, current.lod) : null;
                });
            }
        }
    }

    *sceneryAgain(key, lod) {
        yield* this.buildScenerySteps(key, lod, true);
        if (!this.streamer.tiles.has(key)) this.scenery.disposeTile(key);
    }

    // Queues a tile's scenery step again (after it waited for side roads, or for a nearer tile that did)
    requeueScenery(key) {
        if (!this.streamer.tiles.has(key)) return;
        this.streamer.enqueue(`scenery:${key}`, this.streamer.tileDistance(key, this.lastBike) + 0.5, () => {
            const current = this.streamer.tiles.get(key);
            return current ? this.buildSceneryAsStreamed(key, current.lod) : null;
        });
    }

    disposeTile(key) {
        const old = this.tileMeshes.get(key);
        if (old) {
            this.tileGroup.remove(old.mesh);
            old.mesh.geometry.dispose();
            this.triangleCount -= old.triangles;
            this.tileMeshes.delete(key);
            this.markDrawn(key, false);
        }
        this.scenery.disposeTile(key);
    }

    // The map of the tiles drawn now, a byte per tile of the data's (255 drawn), that the land's shader reads to find
    // the window's edge (LandShade.setEdge)
    drawnTiles() {
        if (this.drawnMap) return this.drawnMap;
        const tiles = (this.data.manifest && this.data.manifest.tiles && this.data.manifest.tiles.height) || [];
        if (!tiles.length) return null;
        const tx0 = Math.min(...tiles.map(t => t[0])), tz0 = Math.min(...tiles.map(t => t[1]));
        const nx = Math.max(...tiles.map(t => t[0])) - tx0 + 1, nz = Math.max(...tiles.map(t => t[1])) - tz0 + 1;
        const bytes = new Uint8Array(nx * nz * 4);
        const texture = new THREE.DataTexture(bytes, nx, nz, THREE.RGBAFormat, THREE.UnsignedByteType);
        texture.needsUpdate = true;
        this.drawnMap = { texture, bytes, tx0, tz0, nx, nz };
        for (const key of this.tileMeshes.keys()) this.markDrawn(key, true);
        return this.drawnMap;
    }

    markDrawn(key, drawn) {
        const map = this.drawnMap;
        if (!map) return;
        const [tx, tz] = key.split(',').map(Number);
        const i = tx - map.tx0, j = tz - map.tz0;
        if (i < 0 || j < 0 || i >= map.nx || j >= map.nz) return;
        map.bytes[(j * map.nx + i) * 4] = drawn ? 255 : 0;
        map.texture.needsUpdate = true;
    }

    // A row has no verge on a side where a junction's paving lies (edgeFoot `gore`: the same test lays the paving):
    // a side road that leaves at a shallow angle runs beside the ride for tens of metres past the node's own
    // mouth, and the ride's verge lay between the two as a strip of grass in the junction
    // (kept for each row until the side roads in residence change: setSideEdges)
    // (and the stretch of its verge a side road crosses, mouthCut: read near a junction's mouth, by the junction's
    // record within a few rows, or where the paving lies)
    goreRow(i) {
        return WorldStreamer.drain(this.goreRowSteps(i));
    }

    // The same in steps (mouthCutSteps)
    *goreRowSteps(i) {
        const styles = this.roadStyles();
        const foot = this.goreFoot || (this.goreFoot = this.edgeFoot());
        if (!this.goreRows) this.goreRows = new Map();
        const points = this.route.points;
        const near = (i, flag) => { for (let j = Math.max(0, i - WorldEnvironment.MOUTH_CUT_ROWS); j <= Math.min(points.length - 1, i + WorldEnvironment.MOUTH_CUT_ROWS); j++) if (styles[j][flag]) return true; return false; };
        const p = points[i];
        // (a row in a tunnel or a gallery lays no paving, but its verge stops where a side road leaves it as it does
        // in the open: drawn on, the walkway lay across the floor of a side road's own tube, leg 3's j39 and j61)
        if (!p || p.bits & 2) return null;
        if (p.bits & 5 && !near(i, 'mouthL') && !near(i, 'mouthR')) {
            // (kept as none, so a pass over the rows reads it once: goreRowsKept)
            this.goreRows.set(i, null);
            return null;
        }
        let held = this.goreRows.get(i);
        if (!held) {
            const cos = Math.cos(p.heading), sin = Math.sin(p.heading), half = p.width / 2;
            const edges = { l: [p.x - half * cos, p.y, p.z + half * sin, -cos, sin], r: [p.x + half * cos, p.y, p.z - half * sin, cos, -sin] };
            const tube = (p.bits & 5) !== 0;
            held = { l: !tube && !!foot.gore(...edges.l), r: !tube && !!foot.gore(...edges.r), edges };
            const cutL = held.l || near(i, 'mouthL') ? yield* this.mouthCutSteps(i, -1) : null;
            const cutR = held.r || near(i, 'mouthR') ? yield* this.mouthCutSteps(i, 1) : null;
            held.cut = { l: cutL, r: cutR };
            // (a row read whole meanwhile is the one kept)
            if (this.goreRows.has(i)) return this.goreRows.get(i);
            this.goreRows.set(i, held);
        }
        return held;
    }

    // The ride's wall plans near a box [x0, z0, x1, z1] made ahead, each in steps (rideWallsSteps): the land cut to
    // the walls (cutsOf, wallRunsNear) reads every section's plan within its reach, and a plan made at once in the
    // middle of a build was the longest step of a road or a tile's scenery (world-steps)
    *wallPlansNear(box) {
        if (!box || !this.streamer) return;
        const reach = TerrainMesh.CUT_TAPER_M + 30 + WorldData.TILE_M;
        for (const section of this.streamer.sections) {
            const b = section.bbox;
            if (!b || this.rideWallCache.has(section.index) || b[2] < box[0] - reach || b[0] > box[2] + reach || b[3] < box[1] - reach || b[1] > box[3] + reach) continue;
            yield* this.rideWallsSteps(section.index);
        }
    }

    // Each row's gore read ahead, a row at a time, so rowsOf reads them kept (a road built in steps). The number of
    // rows it read
    *goreRowsSteps(from, to) {
        const points = this.route.points;
        let read = 0;
        for (let i = Math.max(0, from - 1); i <= Math.min(points.length - 1, to + 1); i++) {
            if (points[i].bits & 2 || (this.goreRows && this.goreRows.has(i))) continue;
            yield* this.goreRowSteps(i);
            read++;
            yield;
        }
        return read;
    }

    // The same until a pass reads none, so rowsOf follows with every row kept: a side road's chunk that arrives
    // between two steps lets them all go (setSideEdges), and rowsOf then read a junction's row whole (20 ms)
    *goreRowsKept(from, to) {
        while ((yield* this.goreRowsSteps(from, to)) > 0);
    }

    rowsOf(from, to) {
        const styles = this.roadStyles();
        const foot = this.goreFoot || (this.goreFoot = this.edgeFoot());
        const points = this.route.points;
        const goreAt = i => this.goreRow(i);
        return points.slice(from, to + 1).map((p, i) => {
            const row = { x: p.x, y: p.y, z: p.z, heading: p.heading, width: p.width, bits: p.bits, s: p.s, i: from + i, ...styles[from + i] };
            // A viaduct's rows carry its layout, and are kept at every level of detail: its stone is laid on them
            if (p.viaduct) Object.assign(row, { viaduct: p.viaduct, keep: true });
            // A stopping place's hard standing on either side (WorldPlaces.apply)
            // (every row of it is kept at the lower level of detail, RoadMesh.decimate: there the works lay the ground
            // under the verge, and across a place 5 m deep a row every 16 m made triangles of 44 m2 of flat ground)
            if (p.padN || p.padP) Object.assign(row, { padN: p.padN || 0, padP: p.padP || 0, padSurface: p.padSurface, keep: true });
            // (and the row before and after it, so the taper starts from a row beside it)
            else if ([points[from + i - 1], points[from + i + 1]].some(q => q && (q.padN || q.padP))) row.keep = true;
            const held = goreAt(from + i);
            if (!held) return row;
            for (const [key, flag, paved, cut] of [['l', 'mouthL', 'pavedL', 'cutL'], ['r', 'mouthR', 'pavedR', 'cutR']]) {
                // The row before or after the paving, where the ride's wall ends and turns to join the side road's
                // (`joined`), has no verge either: the corner behind the join is paved, and a verge over paving was a
                // pale slab in the junction's corner
                const next = [goreAt(from + i - 1), goreAt(from + i + 1)].some(n => n && n[key]);
                if (held[key] || (next && foot.joined && foot.joined(held.edges[key][0], held.edges[key][1], held.edges[key][2]))) row[flag] = row[paved] = true;
                if (held.cut[key]) row[cut] = held.cut[key];
            }
            return row;
        });
    }

    // The stretch of the ride's verge on side `sign` (-1 the -lateral side, the rows' `l`) that the side roads cross near
    // row i, as they are drawn (WorldGround.sideRoadY, at about the ride's height): [a0, a1, b0, b1] in the ride's
    // metres, their carriageway from a0 to b0 just past the carriageway's edge, and their carriageway and verge from a1
    // to b1 at the verge's outer edge; or null. The ride's verge is not drawn over it (RoadSurface's `roadCut`): drawn
    // across a mouth to the rows the junction's record names, the verge lay over the side road as a strip of gravel and
    // grass, and left out by whole rows it showed the ground beside the side road. Each crossing is read whole on a
    // fixed grid of metres (MOUTH_CUT_STEP_M), so every row near one mouth carries the same stretch and the cut between
    // two rows is one line
    mouthCut(i, sign) {
        return WorldStreamer.drain(this.mouthCutSteps(i, sign));
    }

    // The same in steps, a few metres of the ride at a time
    *mouthCutSteps(i, sign) {
        const s = this.route.sArray[i], step = WorldEnvironment.MOUTH_CUT_STEP_M, pad = WorldEnvironment.MOUTH_CUT_PAD_M, reach = WorldEnvironment.MOUTH_CUT_REACH_M;
        const at = {};
        // The runs of metres along the ride where a side road lies `out` past the carriageway's edge (its carriageway,
        // and `more` past its edges), the union of those within `pad` of the row
        const runs = function* (out, more) {
            const list = [];
            let open = null;
            for (let g = Math.floor((s - pad - reach) / step); g <= Math.ceil((s + pad + reach) / step); g++) {
                if (g % 8 === 0) yield;
                const t = g * step;
                let hit = false;
                if (t >= 0 && t <= this.route.length) {
                    this.route.sample(t, at);
                    const o = sign * (at.width / 2 + out);
                    const side = this.ground.sideRoadY(at.x + o * Math.cos(at.heading), at.z - o * Math.sin(at.heading), more);
                    hit = side !== null && Math.abs(side - at.y) <= WorldEnvironment.SIDE_UNDER_NEAR_M;
                }
                if (hit) { if (open) open[1] = t; else open = [t, t]; }
                else if (open) { list.push(open); open = null; }
            }
            if (open) list.push(open);
            const kept = list.filter(r => r[1] >= s - pad && r[0] <= s + pad);
            return kept.length ? [Math.min(...kept.map(r => r[0])) - step / 2, Math.max(...kept.map(r => r[1])) + step / 2] : null;
        };
        const V = RoadSurface.VERGE_M;
        const inner = yield* runs.call(this, 0.02, 0), outer = yield* runs.call(this, V - 0.02, V);
        if (!inner && !outer) return null;
        const a = inner || outer, b = outer || inner;
        return [a[0], b[0], a[1], b[1]];
    }

    // The ground that closes a narrow gap between the ride and a side road beside it, at ride row `index` on side
    // `sign` (-1 the -lateral side): {y, run, at} (its height, how far it runs out from the verge's edge, and its far
    // point), or null. Where a side road runs on beside the ride, each on a wall of its own and at their own heights,
    // the two walls stood 0.5 to 1.5 m apart with the land 4 m down between them, a cleft beside the ride (km 2.3). Now
    // where the side road's band (its carriageway and its verge, as drawn: WorldGround.sideRoadY) starts within
    // CLEFT_GAP_M of the ride's verge, and the land between lies more than CLEFT_DIP_M under the lower of the two
    // roads, ground at that lower road's height (as deep under it as the ground under a verge) runs from the ride's verge to CLEFT_TUCK_M into
    // the side road's band, behind its wall's face: the two walls stand in one fill, the higher road's over it. None
    // where a point of it would stand in a carriageway (Carriageways, as world-structures reads them). RoadMesh.edgeWorks
    // lays it and the physics reads it (WorldGround.heightAt), both from here. Kept for each row until the side roads in
    // residence change
    // Whether the ride's wall stands by row `index` on side `sign`: on the segment from it, the one before or the one
    // after (the row where the wall starts beside a cleft is the last of a junction's mouth, where the ride has none)
    rideWalledAt(index, sign) {
        for (const j of [index - 1, index, index + 1]) if (j >= 0 && j + 1 < this.route.points.length && this.walledAt(j, sign)) return true;
        return false;
    }

    // `walled` false: the same ground where the ride's wall does not stand by the row (the row past a run's end in a
    // side road's mouth, where the fill comes down to the side road beside it, not to the land: RoadMesh.edgeWorks)
    cleftAt(index, sign, walled = true) {
        const p = this.route.points[index];
        if (!p || p.bits & 7) return null;
        if (!this.cleftRows) this.cleftRows = new Map();
        const key = (index * 2 + (sign > 0 ? 1 : 0)) * (walled ? 1 : -1) - (walled ? 0 : 1);
        if (this.cleftRows.has(key)) return this.cleftRows.get(key);
        const [vn, vp] = RoadMesh.verges(p);
        const reach = p.width / 2 + (sign > 0 ? vp : vn);
        const ox = sign * Math.cos(p.heading), oz = -sign * Math.sin(p.heading);
        const x = p.x + ox * reach, z = p.z + oz * reach, y = p.y + RoadMesh.LIFT_M;
        const out = (() => {
            let hit = null, low = Infinity;
            for (let t = 0; t <= WorldEnvironment.CLEFT_GAP_M + 1e-9; t += 0.25) {
                const side = t > 0 ? this.ground.sideRoadY(x + ox * t, z + oz * t, RoadSurface.VERGE_M) : null;
                if (side !== null) { hit = { t, side }; break; }
                const land = this.ground.tileHeight(x + ox * t, z + oz * t);
                if (land !== null) low = Math.min(low, land);
            }
            if (!hit) return null;
            // (only where the ride's own wall holds it up on that side, on the segment either side of the row: a side
            // road beside the ride's slope or level with it has a slope or land there, not a cleft. The side road has
            // no wall on that side, edgeFoot `facesRideWall`: the ride's wall is the one face between the two)
            // A side road over the ride by more than the paving rises to it (SIDE_GORE_RISE_M), and by no more than
            // CLEFT_STEP_M, closes the gap at the ride's height whatever the ride stands on: two carriageways less than
            // 4 m apart with the land sunk between them were a trench by the ride's slope, under a side road on its
            // wall (leg 6's j85, 0.34 m)
            const over = hit.side > y + WorldEnvironment.SIDE_GORE_RISE_M && hit.side <= y + WorldEnvironment.CLEFT_STEP_M;
            if (!over) {
                if (walled && !this.rideWalledAt(index, sign)) return null;
                // (the side road the lower of the two, by no more than CLEFT_STEP_M: the fill lies at its height and the
                // ride's wall stands over it)
                if (hit.side > y + RoadMesh.APRON_UNDER_M || hit.side < y - WorldEnvironment.CLEFT_STEP_M) return null;
            }
            const top = Math.min(y, hit.side);
            if (!(low < top - (over ? WorldEnvironment.CLEFT_OVER_DIP_M : WorldEnvironment.CLEFT_DIP_M))) return null;
            // (under the side road's centre line as far as the ground under the ride's verge lies: its edge is held a
            // little lower, RoadMesh.SIDE_GROUND_UNDER_M)
            const fy = Math.min(y - RoadMesh.APRON_UNDER_M, hit.side - RoadMesh.SIDE_GROUND_UNDER_M), run = hit.t + WorldEnvironment.CLEFT_TUCK_M;
            const guard = this.carriageways.guard(-1);
            for (let t = 0; t <= run + 1e-9; t += 0.25) if (!guard.clear(x + ox * t, z + oz * t, fy - 0.05, fy)) return null;
            // (coloured as the land at its middle, as the ground under a verge is: TerrainMesh.colours)
            const mx = x + ox * run / 2, mz = z + oz * run / 2, m = WorldData.TILE_M, n = WorldData.TILE_N;
            const tx = Math.floor(mx / m), tz = Math.floor(mz / m), tile = this.data.tile(`${tx},${tz}`);
            let color = null;
            if (tile) {
                const grid = TerrainMesh.colours(tile, this.data.cover(`${tx},${tz}`));
                const at = (Math.max(0, Math.min(n - 1, Math.round((mz - tz * m) / WorldData.CELL_M))) * n + Math.max(0, Math.min(n - 1, Math.round((mx - tx * m) / WorldData.CELL_M)))) * 3;
                color = [grid[at], grid[at + 1], grid[at + 2]];
            }
            return { y: fy, run, at: [x + ox * run, fy, z + oz * run], color };
        })();
        this.cleftRows.set(key, out);
        return out;
    }

    // The markings of every ride row, made once: the rules of RoadSurface.styles on the real road's class, then each
    // side road's mouth, where the edge line on that side is broken
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
                    // (and the rows the side road's own tube opens across, out to its verges' edges: a ride tube's wall is left
                    // out there only, TubeLining.run `mouth`)
                    // (each row of a segment the mouth reaches into carries its metres along the ride, [s0, s1]: the wall
                    // there stands either side of them only, TubeLining.run)
                    const tube = Math.min(16, (width / 2 + RoadSurface.VERGE_M) / Math.max(0.4, Math.abs(lean)));
                    const span = [pass.sIn - tube, pass.sIn + tube];
                    points.forEach((p, i) => {
                        if (Math.abs(p.s - pass.sIn) <= tube + WorldEnvironment.MOUTH_ROW_M * 2) styles[i][key === 'right' ? 'tubeMouthR' : 'tubeMouthL'] = span;
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
        return WorldStreamer.drain(this.rideWallsSteps(index));
    }

    // The same in steps: the rows' gores a row at a time, then the plan a row at a time (RoadMesh.wallPlanSteps)
    *rideWallsSteps(index) {
        const held = this.rideWallCache.get(index);
        if (held) return held;
        const section = this.streamer.sections[index];
        const points = this.route.points, last = points.length - 1, S = this.route.sArray;
        let a = Math.max(0, section.from - 1), b = Math.min(last, section.to + 1);
        while (a > 0 && S[section.from] - S[a] < WorldEnvironment.WALL_PLAN_M) a--;
        while (b < last && S[b] - S[section.to] < WorldEnvironment.WALL_PLAN_M) b++;
        const missing = new Set();
        // The viaducts in these rows first (surveyViaducts): their rows are a structure's, and no wall stands on one
        yield* this.goreRowsSteps(a, b);
        this.surveyViaducts(a, b, missing, index);
        yield* this.goreRowsKept(a, b);
        const sides = RoadMesh.vergeSides(this.rowsOf(a, b), null, true);
        yield;
        const all = yield* RoadMesh.wallPlanSteps(sides, this.edgeFoot(missing), this.carriageways.guard(-1));
        // (a plan made in steps may meet one made whole for the same section meanwhile: the first kept is the one)
        if (this.rideWallCache.has(index)) return this.rideWallCache.get(index);
        const base = Math.max(0, section.from - 1), top = Math.min(last, section.to + 1);
        const cut = list => list.slice(base - a, top - a + 1);
        const plan = { base, row: { l: cut(all.row.l), r: cut(all.row.r) }, seg: { l: cut(all.seg.l), r: cut(all.seg.r) }, end: { l: cut(all.end.l), r: cut(all.end.r) }, past: { l: cut(all.past.l), r: cut(all.past.r) } };
        // (whether the wall from a ride row on carries a row of stones in place of its parapet: read when it is drawn,
        // as the whole wall may reach into the plans of other sections)
        plan.stoned = (i, key) => this.wallStoned(i, key === 'r' ? 1 : -1);
        // (and whether the whole wall carries a parapet, and the wall a stretch past an end goes on from: wallRailed)
        plan.railed = (i, key) => this.wallRailed(i, key === 'r' ? 1 : -1);
        plan.railedPast = (i, key, way) => this.railedPast(i, key === 'r' ? 1 : -1, way);
        // Its own segments: from its first row to its last, each segment named by the ride's row it starts at
        const runs = RoadMesh.wallRuns(sides, all, section.from - a, section.to - a).map(run => Object.assign(run, { owner: -1, rows: run.rows.map(k => k + a) }));
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

    // The arched viaducts of the ride (RoadMesh.VIADUCT): where the ride is walled on both edges the two retaining
    // walls give way to a stone viaduct. Each stretch is judged once, whole, when the land and the side roads round
    // all of it are here, and read on the rows as the data gives them (`rawBits`), so the order the window builds in
    // does not change it. A stretch walled on both edges (RoadMesh.wallEnd, the plan's own test, each wall `dropM`
    // deep or more, and two such runs under `gapM` apart are one) of `minM` or more, with nothing else in it or near
    // it, is laid out in bays (layViaduct); its rows then carry the bridge bit, so a structure's rules hold there (the
    // walls end at its first row, the physics' parapets are its edges, no wall band) and the layout (`viaduct`).
    // Rows `a` to `b` are surveyed; the keys of what is not here yet go into `missing`. A section's plan is being made
    // (`making`): the plans of the others that hold the rows marked are made again
    surveyViaducts(a, b, missing, making = -1) {
        const V = RoadMesh.VIADUCT, points = this.route.points, S = this.route.sArray, n = points.length;
        if (!this.viaductDone) { this.viaductDone = new Uint8Array(n); this.viaductEdge = new Map(); this.viaducts = []; }
        const guard = this.carriageways.guard(-1);
        // Whether the land asks for a wall dropM deep or more under the edge `key` of row i (RoadMesh.wallEnd, the
        // plan's own test): true, false, or null with something not here
        const walled = (i, key) => { const w = this.viaductWall(i, key, missing, guard); return w === null ? null : w.deep; };
        // Whether an edge of row i stands on a wall as the plan makes it whole: a segment is walled where either of
        // its rows is, and two walls of an edge under gapM apart are one (RoadMesh.wallPlan)
        const along = (i, key) => {
            const own = walled(i, key);
            if (own !== false) return own;
            for (const k of [i - 1, i + 1]) { if (k < 0 || k >= n) continue; const w = walled(k, key); if (w !== false) return w; }
            let back = null, ahead = null;
            for (let k = i - 2; k >= 0 && S[i] - S[k] < V.gapM + 2 * RoadMesh.WALL_GAP_M; k--) { const w = walled(k, key); if (w === null) return null; if (w) { back = k; break; } }
            if (back === null) return false;
            for (let k = i + 2; k < n && S[k] - S[i] < V.gapM + 2 * RoadMesh.WALL_GAP_M; k++) { const w = walled(k, key); if (w === null) return null; if (w) { ahead = k; break; } }
            return ahead !== null && S[ahead - 1] - S[back + 1] < V.gapM;
        };
        const both = i => { const l = along(i, 'l'); if (l === null) return null; if (!l) return false; return along(i, 'r'); };
        const marked = [];
        for (let i = a; i <= b; i++) {
            if (this.viaductDone[i]) continue;
            const q = both(i);
            if (!q) continue;
            // The whole stretch: on from each end while the next row walled on both edges is under gapM away
            let first = i, last = i, open = false;
            for (let k = i + 1; k < n && S[k] - S[last] < V.gapM; k++) { const w = both(k); if (w === null) { open = true; break; } if (w) last = k; }
            for (let k = i - 1; !open && k >= 0 && S[first] - S[k] < V.gapM; k--) { const w = both(k); if (w === null) { open = true; break; } if (w) first = k; }
            if (open) continue;
            const made = this.judgeViaduct(first, last, missing);
            if (made === null) continue;
            for (let k = first; k <= last; k++) this.viaductDone[k] = 1;
            marked.push(...made);
            i = last;
        }
        if (!marked.length) return;
        for (const via of marked) {
            this.viaducts.push(via);
            for (let k = via.from; k <= via.to; k++) {
                const p = points[k];
                if (p.rawBits === undefined) p.rawBits = p.bits;
                p.bits = p.rawBits | WorldRoute.FLAG.bridge;
                p.flags = WorldRoute.flagsOf(p.bits);
                p.viaduct = via;
                if (this.goreRows) this.goreRows.delete(k);
            }
            if (this.goreRows) { this.goreRows.delete(via.from - 1); this.goreRows.delete(via.to + 1); }
        }
        // What was made on these rows before is made again: the other sections' wall plans that read them, the land
        // under them and the sections drawn there
        this.faceStamp++;
        if (this.stonedRows) this.stonedRows.stamp = -1;
        for (const via of marked) {
            for (const section of this.streamer.sections) {
                if (section.index === making || S[section.to] < via.s0 - WorldEnvironment.WALL_PLAN_M - 8 || S[section.from] > via.s1 + WorldEnvironment.WALL_PLAN_M + 8) continue;
                this.dropRideWalls(section.index);
            }
            this.dropCuts(via.box);
        }
    }

    // Whether the land asks for a wall under the edge `key` of ride row i (RoadMesh.wallEnd, the plan's own test, on
    // the row as the data gives it): {any, deep} (deep: dropM or more under the edge), or null with something it reads
    // not here (its keys go into `missing`). Kept once known
    viaductWall(i, key, missing, guard = this.carriageways.guard(-1)) {
        const id = key === 'l' ? -1 - i : i;
        if (this.viaductEdge.has(id)) return this.viaductEdge.get(id);
        const points = this.route.points, n = points.length, p = points[i], held = new Set();
        for (const k of this.data.chunksNear(p.x, p.z, 40)) if (!this.data.chunks.has(k)) held.add(`chunk:${k}`);
        const lo = Math.max(0, i - 1), hi = Math.min(n - 1, i + 1);
        const rows = this.rowsOf(lo, hi).map(row => ({ ...row, bits: points[row.i].rawBits ?? row.bits }));
        const side = RoadMesh.vergeSides(rows, null, true)[i - lo];
        const e = RoadMesh.wallEnd(side, key, this.edgeFoot(held), guard);
        if (held.size) { for (const k of held) missing.add(k); return null; }
        const any = !!e && !e.blocked;
        const out = { any, deep: any && side[key][1] - e.y >= RoadMesh.VIADUCT.dropM };
        this.viaductEdge.set(id, out);
        return out;
    }

    // A stretch walled on both edges, rows `lo` to `hi`, judged (RoadMesh.VIADUCT): the viaducts laid out in it ([]
    // for none), or null while something it reads is not here (its keys go into `missing`)
    judgeViaduct(lo, hi, missing) {
        const V = RoadMesh.VIADUCT, points = this.route.points, S = this.route.sArray, n = points.length;
        if (S[hi] - S[lo] < V.minM) return [];
        // Nothing else in it or near it: a structure, a side road's mouth, a stopping place, a roadworks site
        let near0 = lo, near1 = hi;
        while (near0 > 0 && S[lo] - S[near0 - 1] <= V.clearM) near0--;
        while (near1 < n - 1 && S[near1 + 1] - S[hi] <= V.clearM) near1++;
        const styles = this.roadStyles();
        for (let k = near0; k <= near1; k++) {
            const p = points[k];
            if (((p.rawBits ?? p.bits) & 7) || styles[k].mouthL || styles[k].mouthR || p.padN || p.padP || p.viaduct) return [];
        }
        for (const site of (this.roadworks && this.roadworks.sites) || []) if (site.s1 >= S[lo] - V.worksM && site.s0 <= S[hi] + V.worksM) return [];
        // Its arches stand where it bends no sharper than curveMax: the longest such run of it (at a hairpin's apex
        // the walls go on round the bend)
        let first = lo, last = lo;
        for (let k = lo; k < hi; k++) {
            let to = k;
            while (to < hi && Math.abs(this.route.headingChange(S[to], S[to + 1])) / Math.max(1e-6, S[to + 1] - S[to]) <= V.curveMax) to++;
            if (S[to] - S[k] > S[last] - S[first]) { first = k; last = to; }
            k = to;
        }
        // and inside the walls' stretch: the walls of both edges go on into its two ends, its abutments
        // (RoadMesh.wallPlan walls the rows to a viaduct's end)
        first = Math.max(first, lo + 1);
        last = Math.min(last, hi - 1);
        if (last <= first) return [];
        // The ground beside each row: the land groundM out from each face (the nodes' own), and the lower of the
        // two under it, never under another road that passes beneath
        const rows = [];
        const held = new Set();
        for (let k = first; k <= last; k++) {
            const p = points[k], ground = {};
            for (const [key, sign] of [['l', -1], ['r', 1]]) {
                const ox = sign * Math.cos(p.heading), oz = -sign * Math.sin(p.heading), out = p.width / 2 + RoadMesh.VIADUCT_FACE_M;
                let low = Infinity;
                for (const d of V.groundM) {
                    const x = p.x + ox * (out + d), z = p.z + oz * (out + d), m = WorldData.TILE_M;
                    const y = this.ground.tileHeight(x, z, false);
                    if (y === null) { if (this.hasTileData(`${Math.floor(x / m)},${Math.floor(z / m)}`)) held.add(`${Math.floor(x / m)},${Math.floor(z / m)}`); continue; }
                    low = Math.min(low, y);
                }
                ground[key] = low;
            }
            // (nor under another road beside it, out to where the ground is read: that road's edge and the ground it
            // lays under its verge stand on the land as they did)
            let floor = Math.min(ground.l, ground.r);
            const reach = p.width / 2 + RoadMesh.VIADUCT_FACE_M + Math.max(...V.groundM);
            for (const t of [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1]) {
                const lat = t * reach, x = p.x + lat * Math.cos(p.heading), z = p.z - lat * Math.sin(p.heading);
                this.carriageways.each(x, z, RoadSurface.VERGE_M, r => { if (r.y < p.y - WorldEnvironment.SIDE_PASS_M) floor = Math.max(floor, r.y - TerrainMesh.SINK_M); });
            }
            rows.push({ i: k, s: S[k], y: p.y, x: p.x, z: p.z, heading: p.heading, width: p.width, ground, floor });
        }
        if (held.size) { for (const k of held) missing.add(k); return null; }
        if (rows.some(row => !Number.isFinite(row.floor))) return [];
        // (the lowest within half a bay: one ground under each arch, not a step at every row where a probe met another
        // road's strip)
        const raw = rows.map(row => row.floor);
        for (const row of rows) {
            row.floor = Math.min(...rows.filter((o, j) => Math.abs(o.s - row.s) <= V.spanM / 2 && Number.isFinite(raw[j])).map(o => raw[rows.indexOf(o)]));
            row.bottom = { l: Math.min(row.floor, row.ground.l) - V.sinkM, r: Math.min(row.floor, row.ground.r) - V.sinkM };
        }
        // Laid out in bays; a bay with no room for an arch, no pier that stands clear or no face that opens ends the
        // viaduct there, and what is left is laid out again
        const made = [];
        let runs = [[first, last]];
        for (let pass = 0; pass < 8 && runs.length; pass++) {
            const next = [];
            for (const [A, B] of runs) {
                const bays = this.layViaduct(rows.slice(A - first, B - first + 1));
                if (!bays) continue;
                if (bays.every(bay => bay.ok)) { made.push(this.viaductOf(rows.slice(A - first, B - first + 1), bays)); continue; }
                const nearest = s => { let best = A; for (let k = A; k <= B; k++) if (Math.abs(S[k] - s) < Math.abs(S[best] - s)) best = k; return best; };
                for (let j = 0; j < bays.length; j++) {
                    if (!bays[j].ok) continue;
                    let to = j;
                    while (to + 1 < bays.length && bays[to + 1].ok) to++;
                    const from = nearest(bays[j].b0), till = nearest(bays[to].b1);
                    if (till > from && (from !== A || till !== B)) next.push([from, till]);
                    j = to;
                }
            }
            runs = next;
        }
        return made;
    }

    // The bays of a viaduct over `rows` (judgeViaduct's, first to last): [{b0, b1, a0, a1, spring, rise, open: {l, r},
    // ok}] on the ride's metres, or null where the rows hold fewer than `minBays`. Each bay is the stretch's length in
    // whole bays (spanMin to spanMax), its arch's opening between the half piers at its ends, semicircular where the
    // ground under it leaves room, else segmental; `ok` where it has an arch, its piers stand clear of every road and
    // its verge, and at least one face opens
    layViaduct(rows) {
        const V = RoadMesh.VIADUCT;
        const s0 = rows[0].s, s1 = rows[rows.length - 1].s, L = s1 - s0;
        let count = Math.max(1, Math.round(L / V.spanM));
        while (count > 1 && L / count < V.spanMin) count--;
        while (L / count > V.spanMax) count++;
        if (count < V.minBays || L / count < V.spanMin - 1e-6) return null;
        const bay = L / count, pier = Math.max(V.pierMinM, bay * V.pierShare);
        // A row's value at metres s, between the rows that hold it
        const at = (s, read) => {
            let k = 0;
            while (k + 2 < rows.length && rows[k + 1].s < s) k++;
            const a = rows[k], b = rows[Math.min(rows.length - 1, k + 1)], t = b.s > a.s ? Math.max(0, Math.min(1, (s - a.s) / (b.s - a.s))) : 0;
            return read(a) + (read(b) - read(a)) * t;
        };
        const over = (from, to, read, pick) => { let v = pick(at(from, read), at(to, read)); for (const row of rows) if (row.s > from && row.s < to) v = pick(v, read(row)); return v; };
        const place = (s, lateral) => { const y = at(s, r => r.y), x = at(s, r => r.x), z = at(s, r => r.z), h = at(s, r => r.heading); return { x: x + lateral * Math.cos(h), z: z - lateral * Math.sin(h), y }; };
        const out = [];
        for (let j = 0; j < count; j++) {
            const b0 = s0 + j * bay, b1 = j === count - 1 ? s1 : b0 + bay, a0 = b0 + pier / 2, a1 = b1 - pier / 2, c = a1 - a0;
            const top = over(b0, b1, r => r.y, Math.min), floor = over(b0, b1, r => r.floor, Math.max);
            // The ground in front of each face along the opening (as the floor reads it): a face opens where it lies
            // openM under the springing. A semicircle where it springs springM over the ground and one face opens;
            // else as high as a face opens, segmental
            const front = { l: over(a0, a1, r => r.ground.l, Math.max), r: over(a0, a1, r => r.ground.r, Math.max) };
            const crown = top - V.crownM, low = floor + V.springM;
            let spring = crown - c / 2;
            if (spring < low || Math.min(front.l, front.r) > spring - V.openM) spring = Math.max(low, Math.min(front.l, front.r) + V.openM);
            const rise = Math.min(c / 2, crown - spring) >= c * V.riseMin ? Math.min(c / 2, crown - spring) : 0;
            // (`why` names what a bay lacks: room for an arch, headroom over a road, a pier clear of every road, an opening)
            const why = rise > 0 ? [] : ['room'];
            const half = at((b0 + b1) / 2, r => r.width) / 2 + RoadMesh.VIADUCT_FACE_M;
            // Clear of a road under it by headroomM
            for (const s of [a0, (a0 + a1) / 2, a1]) for (const t of [-1, -0.5, 0, 0.5, 1]) {
                const p = place(s, t * half);
                this.carriageways.each(p.x, p.z, 0, r => { if (r.depth >= 0 && r.y < p.y - WorldEnvironment.SIDE_PASS_M && spring < r.y + V.headroomM && !why.includes('headroom')) why.push('headroom'); });
            }
            // Its piers in no road and no road's verge
            const margin = RoadSurface.VERGE_M + RoadMesh.PIER_CLEAR_M;
            for (const [edge, inner] of [[b0, j > 0], [b1, j < count - 1]]) {
                if (!inner) continue;
                for (const s of [edge - pier / 2, edge + pier / 2]) for (const t of [-1, 0, 1]) {
                    const p = place(s, t * half);
                    if (this.carriageways.standsIn(p.x, p.z, at(s, r => r.floor) - V.sinkM, spring, null, margin) !== null && !why.includes('pier')) why.push('pier');
                }
            }
            const open = { l: front.l <= spring - V.openM + 1e-9, r: front.r <= spring - V.openM + 1e-9 };
            if (!open.l && !open.r) why.push('opening');
            const ok = !why.length;
            out.push({ b0, b1, a0, a1, spring, rise: ok ? rise : 0, open, ok, why });
        }
        return out;
    }

    // A viaduct over `rows` with its `bays` (layViaduct): {from, to, s0, s1, bays, rows, box, pits, lines}. Its land
    // is cut along each face's line as the wall's was (`lines`, RoadMesh.wallRuns' shape, on the edge points the
    // walls' runs end on, so the walls' runs before and after it go on as one line): the land in front of it is
    // levelled as it was in front of the walls. Within those lines (CUT_BACK_M behind the line under an arch's
    // opening; cutBackM behind a blind face, between its stone and the stone of its back, RoadMesh.viaduct) the land is
    // held to the ground (`pits`, TerrainMesh.pitCuts), and cutBackM short of its first arch's side and its last's
    viaductOf(rows, bays) {
        const V = RoadMesh.VIADUCT, last = this.route.points.length - 1;
        const from = rows[0].i, to = rows[rows.length - 1].i;
        // (the edge points as the ride's wall plan reads them, with a row either side for the bend)
        const before = Math.max(0, from - 1), sides = RoadMesh.vergeSides(this.rowsOf(before, Math.min(last, to + 1)), null, true).slice(from - before, from - before + rows.length);
        const lines = ['l', 'r'].map(key => ({ key, owner: -1, viaduct: true, points: sides.map(side => side[key].slice()), out: sides.map(side => RoadMesh.outward(side)[key]) }));
        const open = (row, key) => bays.some(bay => bay.open[key] && row.s >= bay.b0 - 1e-6 && row.s <= bay.b1 + 1e-6);
        // A pit's corner at row k on edge `key`, `along` metres on along the road
        const corner = (k, key, along) => {
            const p = sides[k][key], o = RoadMesh.outward(sides[k])[key], h = rows[k].heading;
            // (under an opening on the faces' own line: CUT_BACK_M behind it a strip of land the face no longer hides
            // stood in the arch's mouth, its step a dark wedge under the arch)
            const out = open(rows[k], key) ? 0 : RoadMesh.STONE_PROUD_M - V.cutBackM;
            return [p[0] + o[0] * out + along * Math.sin(h), p[2] + o[1] * out + along * Math.cos(h)];
        };
        const end = Math.max(V.cutBackM, (bays[0].a0 - bays[0].b0) - V.cutBackM), tail = Math.max(V.cutBackM, (bays[bays.length - 1].b1 - bays[bays.length - 1].a1) - V.cutBackM);
        const quads = [];
        let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
        // (the rows the pit runs between: its ends lie on the segments that hold them)
        let first = 0, final = rows.length - 1;
        while (first + 1 < final && rows[first + 1].s <= rows[0].s + end) first++;
        while (final - 1 > first && rows[final - 1].s >= rows[rows.length - 1].s - tail) final--;
        for (let k = first; k < final; k++) {
            const inA = k === first ? rows[0].s + end - rows[k].s : 0, inB = k + 1 === final ? rows[rows.length - 1].s - tail - rows[k + 1].s : 0;
            const c = [corner(k, 'l', inA), corner(k + 1, 'l', inB), corner(k + 1, 'r', inB), corner(k, 'r', inA)];
            quads.push({ c, f: [rows[k].floor, rows[k + 1].floor], outer: [true, k + 1 === final, true, k === first] });
            for (const [x, z] of c) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
        }
        const box = [x0 - 2, z0 - 2, x1 + 2, z1 + 2];
        return { from, to, s0: rows[0].s, s1: rows[rows.length - 1].s, bays, rows: rows.map(row => ({ s: row.s, floor: row.floor, bottom: row.bottom })), box, pits: { quads, box }, lines };
    }

    // The pits of the viaducts near a tile (TerrainMesh.pitCuts)
    pitsNear(tile) {
        const m = WorldData.TILE_M;
        const x0 = tile.tx * m, z0 = tile.tz * m;
        const pits = (this.viaducts || []).filter(via => via.box[2] >= x0 && via.box[0] <= x0 + m && via.box[3] >= z0 && via.box[1] <= z0 + m).map(via => via.pits);
        return this.dams ? pits.concat(this.dams.pitsNear(tile)) : pits;
    }

    // The highest road surface whose carriageway or verge holds (x, z), or null: a dam's crest stands under it
    damRoadAt(x, z) {
        let y = null;
        this.carriageways.each(x, z, RoadSurface.VERGE_M, r => { if (r.depth >= -RoadSurface.VERGE_M && (y === null || r.y > y)) y = r.y; });
        return y;
    }

    // The faces of a viaduct for the chase camera (cameraFaces) over ride rows i to i + 1: each side's face from its
    // parapet's top down to the ground, over its arches too (as the walls it replaces were: a boom that ran under an
    // arch and met the pier beside it was drawn in all at once), and each arch's two sides across under it
    viaductFaces(via, i, face) {
        const V = RoadMesh.VIADUCT, points = this.route.points, S = this.route.sArray;
        const rows = [points[i], points[i + 1]].map(p => ({ x: p.x, y: p.y, z: p.z, heading: p.heading, width: p.width, s: p.s }));
        const sa = S[i], sb = S[i + 1];
        const bottom = (s, key) => {
            let k = 0;
            while (k + 2 < via.rows.length && via.rows[k + 1].s < s) k++;
            const a = via.rows[k], b = via.rows[Math.min(via.rows.length - 1, k + 1)], t = b.s > a.s ? Math.max(0, Math.min(1, (s - a.s) / (b.s - a.s))) : 0;
            return a.bottom[key] + (b.bottom[key] - a.bottom[key]) * t;
        };
        const fa = {}, fb = {};
        for (const [key, sign] of [['l', -1], ['r', 1]]) {
            RoadMesh.viaductFace(rows, sa, sign, fa);
            RoadMesh.viaductFace(rows, sb, sign, fb);
            // (a road stands on it, as on the walls it replaces: WorldCamera.wallShare keeps a boom met from outside off
            // a deck that is a road overhead)
            face(fa.x, fa.z, fb.x, fb.z, fa.y + V.parapetH, fb.y + V.parapetH, bottom(sa, key), bottom(sb, key), fa.ox, fa.oz, 1);
        }
        for (const bay of via.bays) {
            if (!(bay.rise > 0)) continue;
            for (const [s, way] of [[bay.a0, 1], [bay.a1, -1]]) {
                if (s < sa || s >= sb) continue;
                RoadMesh.viaductFace(rows, s, -1, fa);
                RoadMesh.viaductFace(rows, s, 1, fb);
                const low = Math.min(bottom(s, 'l'), bottom(s, 'r'));
                // (facing into the opening: along the road, away from the pier)
                face(fa.x, fa.z, fb.x, fb.z, bay.spring, bay.spring, low, low, way * -fa.oz, way * fa.ox, 0);
            }
        }
    }

    // The share of the fill's fall that a wall's face holds past its end (RoadMesh.edgeWorks `taper`), `t` of the way
    // from row `index` to the next on the right (sign > 0) or the left: 1 at a wall's end, 0 from TAPER_M past it.
    // Read from the same plan the stone is drawn from, so the physics ground beside the road is the drawn slope
    taperAt(index, sign, t = 0) {
        if (this.walledAt(index, sign) !== false) return 0;
        const walls = this.rideWalls(this.rowSection[Math.max(0, Math.min(this.rowSection.length - 1, index))]);
        // As RoadMesh.edgeWorks laid it at full detail (`drawn`): the share at its samples along the segment, or none.
        // Read from the plan's `past` alone, the physics stood on a coping past a wall's end where the drawing laid none
        // (a side road's mouth at leg 5's s 37 555, the ground 0.5 m over the verge drawn there)
        const drawn = walls.plan.drawn && walls.plan.drawn[sign > 0 ? 'r' : 'l'][index - walls.plan.base];
        if (drawn !== undefined) {
            if (drawn === null) return 0;
            const at = RoadMesh.TAPER_SAMPLES, u = Math.max(0, Math.min(1, t || 0));
            let j = 0;
            while (j + 2 < at.length && u > at[j + 1]) j++;
            const f = (u - at[j]) / (at[j + 1] - at[j]);
            return drawn[j] + (drawn[j + 1] - drawn[j]) * f;
        }
        const past = walls.plan.past && walls.plan.past[sign > 0 ? 'r' : 'l'];
        const a = past && past[index - walls.plan.base], b = past && past[index + 1 - walls.plan.base];
        if (!a || !b) return 0;
        const share = p => Math.max(0, 1 - Math.min(p[0], p[1]) / RoadMesh.TAPER_M);
        const u = Math.max(0, Math.min(1, t || 0));
        return share(a) + (share(b) - share(a)) * u;
    }

    // Whether RoadMesh.edgeWorks laid a slope (an apron) on the ride's segment from row `index` to the next, on the right
    // (sign > 0) or the left, at full detail (`plan.kind`); undefined where no full-detail build has drawn it

    // The coping RoadMesh.edgeWorks laid on the ride's segment from row `index` to the next, on the right (sign > 0) or
    // the left, at full detail (`plan.band`): [face, inner edge] reaches from the centre line at each of its two rows,
    // null where it laid none, undefined where no full-detail build has drawn the segment
    slopeAt(index, sign) {
        if (!this.streamer || !this.rowSection) return undefined;
        const walls = this.rideWalls(this.rowSection[Math.max(0, Math.min(this.rowSection.length - 1, index))]);
        const kind = walls.plan.kind && walls.plan.kind[sign > 0 ? 'r' : 'l'][index - walls.plan.base];
        return kind === undefined ? undefined : kind === 'apron';
    }

    copingAt(index, sign) {
        if (!this.streamer || !this.rowSection) return undefined;
        const walls = this.rideWalls(this.rowSection[Math.max(0, Math.min(this.rowSection.length - 1, index))]);
        const band = walls.plan.band && walls.plan.band[sign > 0 ? 'r' : 'l'][index - walls.plan.base];
        return band;
    }

    // Whether the wall past a wall's end goes on from row `index` to the next, on the right (sign > 0) or the left, to the
    // next wall of that edge however little it holds there (RoadMesh.edgeWorks `bridged`: the two walls' faces past
    // their ends would end under WALL_GAP_M apart)
    bridgedAt(index, sign) {
        if (this.walledAt(index, sign) !== false) return false;
        const walls = this.rideWalls(this.rowSection[Math.max(0, Math.min(this.rowSection.length - 1, index))]);
        const past = walls.plan.past && walls.plan.past[sign > 0 ? 'r' : 'l'];
        const a = past && past[index - walls.plan.base], b = past && past[index + 1 - walls.plan.base];
        if (!a || !b || !Number.isFinite(a[0]) || !Number.isFinite(b[1])) return false;
        const p = this.route.points[index], q = this.route.points[index + 1];
        return a[0] + Math.hypot(q.x - p.x, q.z - p.z) + b[1] < 2 * RoadMesh.TAPER_M + RoadMesh.WALL_GAP_M;
    }

    // The retaining wall under the ride's edge from row `index` to the next, on the right (sign > 0) or the left, from
    // the plan the stone is drawn from: {a, b, oa, ob, railed, heights}, its top line's two ends (the road's edge),
    // the way it faces at each, whether it carries a parapet (RoadMesh.railed, the drawn rule) and how far its face
    // drops at each end; null where no wall stands. What may stand on its top reads this (Scenery.wallRuns)
    wallTop(index, sign) {
        if (!this.walledAt(index, sign)) return null;
        const points = this.route.points;
        if (index < 0 || index + 1 >= points.length) return null;
        const walls = this.rideWalls(this.rowSection[index]), key = sign > 0 ? 'r' : 'l';
        const k = index - walls.plan.base, fa = walls.plan.end[key][k] || null, fb = walls.plan.end[key][k + 1] || null;
        if (!fa && !fb) return null;
        const sides = RoadMesh.vergeSides(this.rowsOf(index, index + 1), null, true);
        const pa = fa ? fa.at : sides[0][key], pb = fb ? fb.at : sides[1][key];
        const o = (fa || fb).out;
        // (as RoadMesh.edgeWorks reads it: the foot of each end or the run's, and the land drawn in front)
        const foot = this.wallFoot || (this.wallFoot = this.edgeFoot());
        const reach = p => (foot.under ? foot.under(p[0], p[1], p[2], o[0], o[1]) : Infinity);
        const low = Math.min(...[fa, fb].filter(Boolean).map(f => f.y)), between = reach([(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2]);
        const da = RoadMesh.wallDepth(fa, pa, low, reach(pa), between), db = RoadMesh.wallDepth(fb, pb, low, reach(pb), between);
        const abuts = (points[index].bits | points[index + 1].bits) & 7;
        return { a: pa, b: pb, oa: RoadMesh.outward(sides[0])[key], ob: RoadMesh.outward(sides[1])[key], abuts: !!abuts, railed: !!abuts || RoadMesh.railed(pa, pb, da, db), heights: [pa[1] - da, pb[1] - db] };
    }

    // Whether the retaining wall under the ride's edge from row `index` to the next, on the right (sign > 0) or the
    // left, carries a row of marker stones in place of its parapet: a low wall the stones' rule chooses whole
    // (Scenery.wallRuns, wallUsed). One answer for the stone drawn (RoadMesh.edgeWorks), the stones (Scenery.stoneSites),
    // the physics (WorldGround.zoneAt) and the camera (cameraFaces). Kept for every row of the wall until a wall plan
    // changes (faceStamp)
    wallStoned(index, sign) {
        if (!this.scenery || !this.walledAt(index, sign)) return false;
        const held = this.stonedRows || (this.stonedRows = { stamp: -1, rows: new Map() });
        if (held.stamp !== this.faceStamp) { held.stamp = this.faceStamp; held.rows.clear(); }
        const key = sign * (index + 1);
        if (held.rows.has(key)) return held.rows.get(key);
        const span = this.scenery.wallSpan(index, sign);
        const run = span ? this.scenery.wallRow(span) : null;
        const stoned = !!run && Scenery.wallUsed(run.start, sign);
        // (the plans read for the span may have moved the stamp: the answer holds for the wall as it is now)
        if (held.stamp !== this.faceStamp) { held.stamp = this.faceStamp; held.rows.clear(); }
        if (span) for (let i = span.a; i <= span.b; i++) held.rows.set(sign * (i + 1), stoned);
        return stoned;
    }

    // Whether the whole retaining wall under the ride's edge that stands from row `index` to the next, on the right
    // (sign > 0) or the left, carries a parapet: one segment of it that drops PARAPET_DROP_M or more (RoadMesh.railed)
    // gives the whole wall one, to its ends, and a wall whose marker stones take the
    // parapet's place (wallStoned) has none. A parapet that stopped where the wall's drop fell under PARAPET_DROP_M left
    // the wall's last metres a bare coping. One answer for every row of the wall (RoadMesh.edgeWorks, the physics and
    // the camera read it), kept until a wall plan changes (faceStamp)
    wallRailed(index, sign) {
        if (!this.walledAt(index, sign)) return false;
        const held = this.railedRows || (this.railedRows = { stamp: -1, rows: new Map() });
        if (held.stamp !== this.faceStamp) { held.stamp = this.faceStamp; held.rows.clear(); }
        const key = sign * (index + 1);
        if (held.rows.has(key)) return held.rows.get(key);
        const last = this.route.points.length - 2;
        let a = index, b = index;
        while (a > 0 && this.walledAt(a - 1, sign)) a--;
        while (b < last && this.walledAt(b + 1, sign)) b++;
        let railed = false;
        if (!this.wallStoned(index, sign)) for (let i = a; i <= b && !railed; i++) { const top = this.wallTop(i, sign); railed = !!top && Math.max(...top.heights) >= RoadMesh.PARAPET_DROP_M; }
        // (the plans read for the wall may have moved the stamp: the answer holds for the wall as it is now)
        if (held.stamp !== this.faceStamp) { held.stamp = this.faceStamp; held.rows.clear(); }
        for (let i = a; i <= b; i++) held.rows.set(sign * (i + 1), railed);
        return railed;
    }

    // Whether the wall that a stretch past a wall's end goes on from carries a parapet (wallRailed): the nearest walled
    // segment that ends at or before row `index` (way < 0) or starts at or after it (way > 0), on the right (sign > 0)
    // or the left. The stretch is TAPER_M along the edge at most, but on the inside of a hairpin a metre of the edge is
    // several of the ride's: read RAILED_PAST_M of the ride's metres (a far ribbon's parapet past a wall's end on the
    // inside of a hairpin found no wall within 24 m and stopped 1.5 m short of its stone)
    railedPast(index, sign, way) {
        const S = this.route.sArray, last = this.route.points.length - 2, reach = WorldEnvironment.RAILED_PAST_M;
        const step = way < 0 ? -1 : 1;
        for (let j = way < 0 ? index - 1 : index; j >= 0 && j <= last && (way < 0 ? S[index] - S[j + 1] : S[j] - S[index]) <= reach; j += step) {
            if (this.walledAt(j, sign)) return this.wallRailed(j, sign);
        }
        return false;
    }

    // Whether the physics and the camera count a parapet over the ride's edge from row `index` to the next, `t` of the
    // way along (null: anywhere on the segment), on the right (sign > 0) or the left, as RoadMesh.edgeWorks draws it:
    // on a wall that carries one (wallRailed), and past a wall's end on the face the wall goes on as (taperAt): a
    // parapet runs its wall's whole length. None on a wall's segment that meets a structure, nor on a structure's own
    // rows (the structure's own parapet is there)
    parapetAt(index, sign, t = null) {
        const walled = this.walledAt(index, sign);
        if (walled === undefined || index < 0 || index + 1 >= this.route.points.length) return false;
        const points = this.route.points;
        // (a structure's row that the structure goes on from, away from the wall: RoadMesh.edgeWorks `abutsAt`)
        const built = j => j < 0 || j >= points.length || !!(points[j].bits & 7);
        if (walled) return !((points[index].bits & 7 && built(index - 1)) || (points[index + 1].bits & 7 && built(index + 2))) && this.wallRailed(index, sign);
        if ((points[index].bits | points[index + 1].bits) & 7) return false;
        const walls = this.rideWalls(this.rowSection[Math.max(0, Math.min(this.rowSection.length - 1, index))]);
        const past = walls.plan.past && walls.plan.past[sign > 0 ? 'r' : 'l'];
        const a = past && past[index - walls.plan.base], b = past && past[index + 1 - walls.plan.base];
        if (!a || !b) return false;
        if (this.bridgedAt(index, sign)) return this.railedPast(index, sign, -1) || this.railedPast(index + 1, sign, 1);
        // As RoadMesh.edgeWorks lays it (`at`, `part`, `held`): the face holds `part` of the fill's fall from each wall
        // (way 0 behind, way 1 ahead), the fall read from the edge point to the slope's foot (`edgeFoot`) at each row,
        // and the stone is laid in strips of APRON_STRIP_M, each whole where it holds 0.1 m at either of its ends; the
        // parapet stands on a strip where the wall it goes on from has one. Read from the physics' own land at the
        // edge, a parapet stood on the verge with nothing drawn there (world-fairness), and one read a segment late let
        // a bike sliding across a row go 0.7 m into the parapet drawn there (world-rider-fall)
        const ends = this.taperEnds(index, sign);
        if (!ends) return false;
        const part = (way, u) => (Number.isFinite(a[way]) && Number.isFinite(b[way]) ? Math.max(0, 1 - (a[way] + (b[way] - a[way]) * u) / RoadMesh.TAPER_M) : 0);
        const held = u => Math.max(part(0, u), part(1, u)) * (ends.fall[0] + (ends.fall[1] - ends.fall[0]) * u) >= 0.1;
        const railed = [null, null];
        const railOn = u => (part(0, u) > 0 && (railed[0] ?? (railed[0] = this.railedPast(index, sign, -1)))) || (part(1, u) > 0 && (railed[1] ?? (railed[1] = this.railedPast(index + 1, sign, 1))));
        const strips = Math.max(1, Math.ceil(ends.length / RoadMesh.APRON_STRIP_M));
        const strip = k => { const t0 = k / strips, t1 = (k + 1) / strips; return (held(t0) || held(t1)) && (railOn(t0) || railOn(t1)); };
        if (t !== null) return strip(Math.min(strips - 1, Math.floor(Math.max(0, Math.min(1, t)) * strips)));
        for (let k = 0; k < strips; k++) if (strip(k)) return true;
        return false;
    }

    // The ride's edge from row `index` to the next on the right (sign > 0) or the left as RoadMesh.edgeWorks lays a
    // slope there: {length, fall}, the edge's length and the fall from the edge to the slope's foot at each row
    // (`edgeFoot`, as `at` reads `fA`), or null where no slope is laid. Kept until a wall plan changes (faceStamp)
    taperEnds(index, sign) {
        const held = this.taperHeld || (this.taperHeld = { stamp: -1, rows: new Map() });
        if (held.stamp !== this.faceStamp) { held.stamp = this.faceStamp; held.rows.clear(); }
        const id = sign * (index + 1);
        if (held.rows.has(id)) return held.rows.get(id);
        const key = sign > 0 ? 'r' : 'l';
        const sides = RoadMesh.vergeSides(this.rowsOf(index, index + 1), null, true);
        const foot = this.wallFoot || (this.wallFoot = this.edgeFoot());
        const fall = side => {
            const p = side[key], o = RoadMesh.outward(side)[key];
            const f = foot(p[0], p[1], p[2], o[0], o[1], false, !!side.fill);
            if (!f) return 0;
            const y = Number.isFinite(f.y) ? Math.max(p[1] - RoadMesh.DROP_MAX_M, Math.min(p[1] - 0.05, f.y)) : p[1] - RoadMesh.DECK_M;
            return p[1] - Math.min(y, p[1] - RoadMesh.APRON_UNDER_M);
        };
        const a = sides[0][key], b = sides[1][key];
        const out = { length: Math.hypot(b[0] - a[0], b[2] - a[2]), fall: [fall(sides[0]), fall(sides[1])] };
        held.rows.set(id, out);
        return out;
    }

    // Whether a retaining wall's run (RoadMesh.wallRuns) carries a parapet on its segment k: the ride's as parapetAt
    // reads its rows, a side road's as its edge works drew it (`rail`)
    runParapet(run, k) {
        if (run.owner === -1 && run.rows) return this.parapetAt(run.rows[k], run.key === 'r' ? 1 : -1);
        return !!(run.rail && run.rail[k]);
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

    // The ride's tunnels and galleries (TubeLining), once: metres in from the nearest portal at each row (negative
    // outside, to 60 m out); the most of the tube's light at each row (`cap`: 1 in a tunnel, galleryShare in a gallery,
    // eased over 12 m either side of a change); and the runs of one kind, a tube that is a gallery and then a tunnel
    // being two. The mountain side of a run is the one where the far land 40 m out stands higher over it: a tunnel
    // shows its rock there, a gallery its rock or shotcrete there and its openings on the other side. `tube` is the
    // whole tube's metres along, for its fans and niches
    tubeInfo() {
        if (this.tubes) return this.tubes;
        const points = this.route.points, along = this.route.sArray;
        const inM = TubeLining.depths(points, along);
        const run = new Int32Array(points.length).fill(-1);
        const runs = [];
        const gallery = i => (points[i].bits & 5) === 4;
        for (const [from, to] of RoadMesh.runs(points, 1 | 4)) {
            const tube = [along[from], along[to]];
            // (one style for the whole tube, StructureStyles.tube: a tube with a gallery in it keeps the box)
            let mixed = false;
            for (let i = from; i <= to; i++) mixed = mixed || gallery(i);
            const style = StructureStyles.tube({ x: Math.round(tube[0]), z: 0, gallery: mixed });
            let a = from;
            for (let i = from; i <= to; i++) {
                if (i < to && gallery(i + 1) === gallery(a)) continue;
                let lean = 0;
                for (let j = a; j <= i; j++) {
                    const p = points[j], c = Math.cos(p.heading), sn = Math.sin(p.heading);
                    const right = this.data.farHeight(p.x + 40 * c, p.z - 40 * sn), left = this.data.farHeight(p.x - 40 * c, p.z + 40 * sn);
                    if (Number.isFinite(right) && Number.isFinite(left)) lean += right - left;
                }
                const g = gallery(a), rock = lean >= 0 ? 1 : -1;
                for (let j = a; j <= i; j++) run[j] = runs.length;
                // (a gallery's mountain side is rock or sprayed concrete, by the run)
                runs.push({ s0: along[a], s1: along[i], tube, gallery: g, rock, open: g ? -rock : 0, shotcrete: g && LandShade.hash(a, i, 7) > 0.5, style, profile: style.profile });
                a = i + 1;
            }
        }
        const T = TubeLining.TUBE;
        const raw = points.map((p, i) => (run[i] >= 0 && runs[run[i]].gallery ? T.galleryShare : 1));
        const cap = new Float32Array(points.length);
        for (let i = 0; i < points.length; i++) {
            let sum = 0, weight = 0;
            for (let j = i; j >= 0 && along[i] - along[j] <= 12; j--) { sum += raw[j]; weight++; }
            for (let j = i + 1; j < points.length && along[j] - along[i] <= 12; j++) { sum += raw[j]; weight++; }
            cap[i] = sum / weight;
        }
        this.tubes = { inM, cap, run, runs };
        return this.tubes;
    }

    // The rows with their tube's depth, light and run (RoadMesh.tunnel, RoadMesh.nearRibbon's light), near a tube only
    tubeRows(rows) {
        const info = this.tubeInfo();
        return rows.map(row => {
            const k = row.i;
            if (!(info.inM[k] > -60)) return row;
            return { ...row, tubeIn: info.inM[k], tubeCap: info.cap[k], tubeRun: info.run[k] >= 0 ? info.runs[info.run[k]] : null };
        });
    }

    // The tube's light share at s along the ride (TubeLining.share), for the eye's adaptation (Game.updateTubeAdaptation)
    tubeShareAt(s) {
        const info = this.tubeInfo(), route = this.route;
        const k = Math.max(0, Math.min(route.points.length - 2, Math.floor(route.toUnits(s))));
        const s0 = route.sArray[k], s1 = route.sArray[k + 1];
        const t = s1 > s0 ? Math.min(1, Math.max(0, (s - s0) / (s1 - s0))) : 0;
        return TubeLining.share(info.inM[k] + (info.inM[k + 1] - info.inM[k]) * t, info.cap[k] + (info.cap[k + 1] - info.cap[k]) * t);
    }

    buildRoad(section, lod) {
        return WorldStreamer.drain(this.buildRoadSteps(section, lod));
    }

    // The same in steps: the rows' gores, the wall plan and the edge works a row at a time (RoadMesh.sectionSteps).
    // The old section stays drawn until the new one replaces it
    *buildRoadSteps(section, lod) {
        // Edge works built before a tile under them arrived are built again when it does (buildTile)
        const missing = new Set();
        // A row of each neighbour either side: read for the bend and the runs, drawn by the neighbour (RoadMesh.section)
        const last = this.route.points.length - 1;
        const from = Math.max(0, section.from - 1), to = Math.min(last, section.to + 1);
        // (what a whole build read after it let the old section go: the caches kept by faceStamp start again)
        if (this.roadMeshes.has(section.index)) this.faceStamp++;
        yield* this.goreRowsSteps(from, to);
        yield* this.wallPlansNear(section.bbox);
        yield* this.cutsNear(section.bbox);
        // (again: a viaduct's survey in a plan made just now lets go of the rows next to it, surveyViaducts)
        yield* this.goreRowsKept(from, to);
        const rows = this.tubeRows(this.rowsOf(from, to));
        const foot = this.edgeFoot(missing, { far: lod > 0 });
        yield;
        const plan = (yield* this.rideWallsSteps(section.index)).plan;
        // (the land its tubes' portals and footings read: a tile the data has and that is not here yet is waited on, so
        // the section is built again when it comes. Read as no land, a portal built first had no headwall, and the
        // land drawn after stood over its roof unfronted: 101 places on the three legs of worlds/susten)
        const groundAt = (x, z) => {
            const y = this.ground.tileHeight(x, z);
            if (y === null) {
                const key = `${Math.floor(x / WorldData.TILE_M)},${Math.floor(z / WorldData.TILE_M)}`;
                if (this.hasTileData(key)) missing.add(key);
            }
            return y ?? undefined;
        };
        const group = yield* RoadMesh.sectionSteps(rows, lod, { groundAt, roof: WorldRoute.ROOF_M, foot, roads: this.carriageways, head: section.from - from, tail: to - section.to, plan });
        this.disposeRoad(section);
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
        // What the physics reads of the edge works (the plan's `drawn`, `band` and `kind`, RoadMesh.edgeWorks) is
        // known once the section is laid at full detail; the scenery placed on the ground before that stands again
        // (a tuft set on a slope read from the plan's distances stood 1.1 m over the land the works leave there)
        if (lod === 0 && plan.kind && section.bbox) {
            const sign = [];
            for (let i = section.from; i < section.to; i++) for (const key of ['l', 'r']) { const k = i - plan.base; sign.push(plan.kind[key][k], JSON.stringify(plan.drawn && plan.drawn[key][k]), JSON.stringify(plan.band && plan.band[key][k])); }
            const text = sign.join('|');
            plan.signs = plan.signs || new Map();
            if (plan.signs.get(section.index) !== text) { plan.signs.set(section.index, text); this.restandScenery(section.bbox); }
        }
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
    //   - the face a wall goes on as past its end (taperAt), as high as the wall and its parapet, as deep as it holds
    //     the fill there
    //   - the parapets of the ride's bridges (WorldGround.zoneAt's wall)
    //   - a viaduct's faces down to the ground, and its arches' sides (viaductFaces)
    //   - the walls of the houses drawn (Scenery.houseAt's rects)
    //   - the walls of the ride's tunnels and galleries, floor to roof (RoadMesh.tunnel)
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
        // (a retaining wall's top is its coping, WALL_MIN_UP_M over the edge, its parapet over that)
        const H = RoadMesh.PARAPET_H_M, up = RoadMesh.COPING_UP_M;
        const runs = list => {
            for (const run of list) {
                for (let k = 0; k + 1 < run.points.length; k++) {
                    const a = run.points[k], b = run.points[k + 1], fa = Math.min(a[1], run.foot[k]), fb = Math.min(b[1], run.foot[k + 1]);
                    // (its parapet where one is drawn, runParapet; on a low wall a row of marker stones stands where
                    // the parapet would, as high as a stone)
                    const stoned = run.owner === -1 && run.rows && this.wallStoned(run.rows[k], run.key === 'r' ? 1 : -1);
                    const rail = stoned ? Scenery.STONE_HEIGHT_M : this.runParapet(run, k) ? H : 0;
                    face(a[0], a[2], b[0], b[2], a[1] + up + rail, b[1] + up + rail, fa, fb, run.out[k][0], run.out[k][1], 1);
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
                        // (a viaduct's faces and the sides of its arches, RoadMesh.viaduct)
                        if (a.viaduct && a.viaduct === b.viaduct) { if (sign > 0) this.viaductFaces(a.viaduct, i, face); continue; }
                        const p = WorldGround.pointAt(a, sign * (a.width / 2 + WorldGround.PARAPET_M), edge[0]), q = WorldGround.pointAt(b, sign * (b.width / 2 + WorldGround.PARAPET_M), edge[1]);
                        face(p.x, p.z, q.x, q.z, a.y + H, b.y + H, a.y - RoadMesh.DECK_M, b.y - RoadMesh.DECK_M, ox, oz, 1);
                        continue;
                    }
                    if (a.bits & b.bits & (WorldRoute.FLAG.tunnel | WorldRoute.FLAG.gallery)) {
                        // (a tube's wall, RoadMesh.tunnel: from its floor to its roof, facing the road)
                        const o = RoadMesh.TUBE_WALL_M;
                        const p = WorldGround.pointAt(a, sign * (a.width / 2 + o), edge[0]), q = WorldGround.pointAt(b, sign * (b.width / 2 + o), edge[1]);
                        face(p.x, p.z, q.x, q.z, a.y + WorldRoute.ROOF_M, b.y + WorldRoute.ROOF_M, a.y, b.y, -ox, -oz, 0);
                        continue;
                    }
                    if ((a.bits | b.bits) & 7) continue;
                    const ha = this.taperAt(i, sign, 0), hb = this.taperAt(i, sign, 1);
                    if (!(ha > 0 || hb > 0)) continue;
                    const p = WorldGround.pointAt(a, sign * (a.width / 2 + ground.vergeAt(i, sign, 0)), edge[0]), q = WorldGround.pointAt(b, sign * (b.width / 2 + ground.vergeAt(i, sign, 1)), edge[1]);
                    // (as deep as the stone holds the fill's fall there, WorldGround.earthworkY), with the wall's
                    // parapet on it where the wall has one (parapetAt)
                    const rail = this.parapetAt(i, sign) ? H : 0;
                    face(p.x, p.z, q.x, q.z, a.y + up + rail, b.y + up + rail, a.y - ha * Math.max(0, a.y - ground.landY(p.x, p.z, a.y)), b.y - hb * Math.max(0, b.y - ground.landY(q.x, q.z, b.y)), ox, oz, 1);
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
        return WorldStreamer.drain(this.holdSideSteps(rows, before, after));
    }

    // Whether a ramp from row `e` of `rows` (toward `away`, `delta` metres off its own height over `length`) lies
    // under the land past SIDE_FILL_M: the land drawn there (a resident tile, at full detail) over the ramp's edge
    // lines. A tile not here reads as no land
    rampUnderLand(rows, e, away, along, delta, length) {
        for (let i = e + away; i >= 0 && i < rows.length && !rows[i].held; i += away) {
            const d = Math.abs(along[i] - along[e]);
            if (d >= length) break;
            if (d <= WorldEnvironment.SIDE_FILL_M) continue;
            const row = rows[i], t = d / length, share = 1 - t * t * (3 - 2 * t);
            const own = row.own === undefined ? row.y : row.own, y = own + delta * share;
            for (const lat of [-0.5, 0.5]) {
                const o = lat * row.width, x = row.x + o * Math.cos(row.heading), z = row.z - o * Math.sin(row.heading);
                const land = this.ground.tileHeight(x, z, false);
                if (land !== null && land > y + 0.05) return true;
            }
        }
        return false;
    }

    // The same in steps, HOLD_SIDE_STEP rows at a time (a long side road's rows read whole took up to 38 ms)
    static get HOLD_SIDE_STEP() { return 24; }

    *holdSideSteps(rows, before = [], after = []) {
        if (before.length || after.length) {
            const ext = list => list.map(row => ({ ...row, ext: true }));
            return (yield* this.holdSideSteps([...ext(before), ...rows, ...ext(after)])).filter(row => !row.ext);
        }
        const step = WorldEnvironment.HOLD_SIDE_STEP;
        const under = [];
        for (let i = 0; i < rows.length; i++) {
            under.push(this.rideUnderRow(rows[i]));
            if (i % step === step - 1) yield;
        }
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
            let length = Math.min(WorldEnvironment.SIDE_MEET_MAX_M, Math.max(WorldEnvironment.SIDE_MEET_MIN_M, (1.5 * Math.abs(delta)) / WorldEnvironment.SIDE_MEET_GRADE));
            // (a ramp that holds the road under its own height, where the land past the junction's fill stands over
            // the road as the ramp lays it, ends within SIDE_FILL_M of the band: the land is shaped to the road's own
            // height, and stood 0.32 m over the ramp 30 m out at leg 5's j208. Where the land lies under the ramp it
            // keeps its length: shortened there too, the Gotthard leg's j29 and j76 grew too steep to ride up)
            if (delta < 0 && length > WorldEnvironment.SIDE_FILL_M) {
                const short = Math.max(WorldEnvironment.SIDE_FILL_M, (1.5 * -delta) / WorldEnvironment.SIDE_RAMP_GRADE);
                if (short < length && this.rampUnderLand(out, e, from.away, along, delta, length)) length = short;
            }
            for (let i = e + from.away; i >= 0 && i < out.length && !out[i].held; i += from.away) {
                const d = Math.abs(along[i] - along[e]);
                // The first row past the ramp is kept too: where the road is at its own height again
                if (d >= length) { out[i] = { ...out[i], keep: true }; break; }
                const t = d / length, share = 1 - t * t * (3 - 2 * t);
                const own = out[i].own === undefined ? out[i].y : out[i].own;
                out[i] = { ...out[i], own, y: out[i].y + delta * share, keep: true, ...(d <= WorldEnvironment.SIDE_FILL_M ? { fill: true } : {}) };
            }
        });
        // A `fill` row whose carriageway edge faces the ride's within SIDE_GORE_M has no verge on that side (`mouthL`,
        // `mouthR`, as at any mouth): the junction's paving lies there, not a strip of grass. Faces it: out from the edge
        // square to the side road the ride's carriageway lies within SIDE_GORE_M (a road that leaves at a shallow angle
        // runs beside the ride). An edge only near the ride is no such side: a road that leaves square to the ride has
        // the ride along its edges, not in front of them, and its verge goes on round the corner to the ride's (left out
        // within SIDE_GORE_M of the ride's edge, it stopped short of the ride with a straight cut). An edge in the ride's
        // carriageway is under the ride and keeps its verge too
        const near = this.sideNear || (this.sideNear = {});
        const inRide = (x, z, y) => {
            for (const i of this.route.hashCandidates(x, z, 1)) {
                this.route.nearestSegment(x, z, i, i, near);
                if (near.distance <= near.width / 2 && Math.abs(near.y - y) <= 1.5) return true;
            }
            return false;
        };
        // (an edge in the ride's carriageway takes the way of the nearest fill row whose edge is clear of it: a road
        // that leaves at a shallow angle has no verge toward the ride from the node on, and one that leaves square
        // keeps it; read row by row, the verge faded in over the row from the node and lay across the junction as a
        // pale strip)
        const faces = [];
        for (let i = 0; i < out.length; i++) {
            const row = out[i];
            if (i % step === step - 1) yield;
            if (!row.fill) { faces.push(null); continue; }
            const flags = {};
            for (const [key, sign] of [['mouthL', -1], ['mouthR', 1]]) {
                const ox = sign * Math.cos(row.heading), oz = -sign * Math.sin(row.heading);
                const x = row.x + ox * row.width / 2, z = row.z + oz * row.width / 2;
                if (inRide(x, z, row.y)) { flags[key] = null; continue; }
                flags[key] = false;
                for (let d = 0.5; d <= WorldEnvironment.SIDE_GORE_M; d += 0.5) if (inRide(x + ox * d, z + oz * d, row.y)) { flags[key] = true; break; }
            }
            faces.push(flags);
        }
        const clear = (i, key) => {
            for (let d = 1; d < out.length; d++) for (const j of [i - d, i + d]) if (faces[j] && faces[j][key] !== null) return faces[j][key];
            return false;
        };
        return out.map((row, i) => {
            if (!faces[i]) return row;
            const flags = {};
            for (const key of ['mouthL', 'mouthR']) if (faces[i][key] === null ? clear(i, key) : faces[i][key]) flags[key] = true;
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
    edgeFoot(missing = null, { aprons = true, far = false } = {}) {
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
        // A side road's edge that faces the ride's wall across a cleft (cleftAt, as the ride reads it from its side): the
        // ride lies within CLEFT_GAP_M out from the edge, over it by no more than CLEFT_STEP_M, and the land between
        // lies more than CLEFT_DIP_M under the edge. The side road has no wall there: its surface runs on to the foot of
        // the ride's wall over the ground that closes the cleft, and the ride's wall face is the one face between them
        // (as two walls, a parapet and a coping stood across the gap from the ride's wall and read as a trench, km 2.3)
        const facesRideWall = (x, y, z, ox, oz) => {
            if (aprons) return false;
            let low = landNear(x + ox * 0.1, z + oz * 0.1) ?? Infinity;
            // (the nearest of the ride's segments at about this height: the leg beside the side road)
            const ride = (px, pz) => {
                let best = null;
                for (const i of this.route.cellSegments(px, pz) || []) {
                    this.route.nearestSegment(px, pz, i, i, near);
                    if (near.y > y + 0.1 && near.y <= y + WorldEnvironment.CLEFT_STEP_M && (best === null || near.distance < best.distance)) best = { distance: near.distance, width: near.width, index: near.index, lateral: near.lateral };
                }
                return best;
            };
            // (an edge already in the ride's band is the side road's far edge where it leaves: no cleft lies out from it)
            const own = ride(x, z);
            if (own && own.distance <= own.width / 2 + RoadSurface.VERGE_M) return false;
            for (let t = 0.25; t <= WorldEnvironment.CLEFT_GAP_M + 1e-9; t += 0.25) {
                const px = x + ox * t, pz = z + oz * t;
                const best = ride(px, pz);
                if (best && best.distance <= best.width / 2 + RoadSurface.VERGE_M) return low < y - WorldEnvironment.CLEFT_DIP_M && this.rideWalledAt(best.index, Math.sign(best.lateral || 1));
                const land = landNear(px, pz);
                if (land !== null) low = Math.min(low, land);
            }
            return false;
        };
        const wallOf = (x, y, z, ox, oz, on = false) => {
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
        const wall = wallOf;
        // A side road's edge point by the ride's verge where the ride's wall stands: where the side road leaves the ride
        // beside a cleft, its edge lies on the ride's ground and the fill, with no slope from it
        const byRideWall = (x, y, z) => {
            if (aprons) return false;
            let best = null;
            for (const i of this.route.cellSegments(x, z) || []) {
                this.route.nearestSegment(x, z, i, i, near);
                if (Math.abs(near.y - y) <= WorldEnvironment.CLEFT_STEP_M && (best === null || near.distance < best.distance)) best = { distance: near.distance, width: near.width, index: near.index, lateral: near.lateral };
            }
            if (!best || best.distance > best.width / 2 + RoadSurface.VERGE_M + WorldEnvironment.RIDE_NEAR_M) return false;
            // (by a cleft the ride closes, within CLEFT_ROWS of its rows)
            const sign = Math.sign(best.lateral || 1);
            if (!this.rideWalledAt(best.index, sign)) return false;
            for (let j = best.index - WorldEnvironment.CLEFT_ROWS; j <= best.index + WorldEnvironment.CLEFT_ROWS; j++) if (this.cleftAt(j, sign)) return true;
            return false;
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
            // (nor a slope from a side road's edge into the cleft by the ride's wall: the ground that closes it lies there)
            if (!aprons && (facesRideWall(x, y, z, ox, oz) || byRideWall(x, y, z))) return null;
            const low = landLow(x + ox * 0.1, z + oz * 0.1);
            if (low === null) return { kind: 'apron', y: y - WorldEnvironment.APRON_M };
            if (low >= y - WorldEnvironment.MEET_M) return null;
            // The apron runs out at the batter until it meets the land drawn near (8 m triangles, cut to the walls),
            // never on over a valley beyond, and never into another road's band (the other leg of a hairpin, a side
            // road): it stops at the band's edge
            let run = 0, meets = null;
            for (let o = 0.5; o <= WorldEnvironment.APRON_RUN_M; o += 0.5) {
                const px = x + ox * o, pz = z + oz * o;
                if (inBand(px, pz)) {
                    // (in a mouth, a side road drawn there under the edge: the slope ends on its surface, under its ribbon)
                    const side = this.ground.sideRoadY(px, pz);
                    if (side !== null && side < y && side > y - WorldEnvironment.SIDE_PASS_M && atMouth(x, y, z, ox, oz)) { meets = side; run = o; }
                    break;
                }
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
            // Where it meets a side road beside the ride (a shallow junction, the side road a little under the ride's
            // verge) its foot stands under that road's surface, not on the land under the gap: dropped to the land
            // there, the slope stood as a trench between the two roads with its dark side to the rider (km 2.3)
            if (meets !== null) footY = Math.max(footY, meets - RoadMesh.APRON_UNDER_M);
            // A section drawn coarser (`far`: WorldStreamer.ROAD_LOD_M, 400 m and more from the bike, and on along the
            // ride's window however far) stands over tiles drawn at any level (TILE_LOD_M). A coarse tile is drawn lower
            // than the land at full detail where two legs share one of its cells (TerrainMesh.vertexY: the lower leg's
            // carved node holds the vertex), and the slope that met the land at full detail ended in the air over it:
            // the far ribbons of a stack of hairpins hung 27 m over a cleft (leg 3 s 2 626). Its foot goes down to the
            // lowest the land is drawn there; at full detail that part lies under the land, out of sight
            let deep = false, shallow = null, under = null;
            if (far) {
                const coarse = this.landLowAt(x + ox * Math.max(run, 0.1), z + oz * Math.max(run, 0.1), missing);
                // (`shallow`: the foot at full detail, for a segment whose deep slope would stand in a road below it,
                // RoadMesh.edgeWorks)
                if (coarse !== null && coarse - WorldEnvironment.COARSE_UNDER_M < footY) {
                    if (meets === null) { shallow = footY; footY = coarse - WorldEnvironment.COARSE_UNDER_M; deep = true; }
                    // (a slope that ends on a side road's surface in a mouth stays; `under`: how deep a face that closes a
                    // segment with no slope there goes, RoadMesh.edgeWorks)
                    else under = coarse - WorldEnvironment.COARSE_UNDER_M;
                }
            }
            // Without the tile under the foot yet, the apron is built again when it comes
            if (footLand === null && missing) missing.add(`${Math.floor((x + ox * run) / m)},${Math.floor((z + oz * run) / m)}`);
            // Coloured as the land at its top and at its foot (RoadMesh.edgeWorks blends them), not one sample
            // (`deep`: a far section's slope taken down to the coarse land: RoadMesh.edgeWorks lays it as one row down)
            return { kind: 'apron', y: footY, run, meets: meets !== null, deep, shallow, under, color: landColor(x + ox * Math.max(run, 0.5), z + oz * Math.max(run, 0.5)), top: landColor(x + ox * 0.5, z + oz * 0.5) };
        };
        // How deep one of the ride's walls must stand to reach the land in front of it as it is drawn (cut and
        // levelled to the walls): asked when the wall is drawn, after every wall's line is known. A side road's wall
        // stands on the nodes' own lowest (wallFoot): its chunk is built before the land is cut to it
        if (aprons) foot.under = (x, y, z, ox, oz) => {
            let low = Infinity;
            for (const o of [0.2, 1, 2]) { const land = landDrawn(x + ox * o, z + oz * o); if (land !== null && land < low) low = land; }
            return low - WorldEnvironment.WALL_UNDER_M;
        };
        // The land as it is drawn at (x, z), for a slope's foot between two rows (RoadMesh.edgeWorks); and, for a far
        // section's deep slope, the lowest it is drawn there at any level, less COARSE_UNDER_M (the strip's foot is set
        // 0.2 m under what this gives)
        foot.land = landDrawn;
        if (far) foot.landLow = (x, z) => { const low = this.landLowAt(x, z, missing); return low === null ? null : low - WorldEnvironment.COARSE_UNDER_M + 0.2; };
        // The lowest side road surface as drawn (WorldGround.sideRoadY: its carriageway, and `more` past its edges) within
        // `r` of (x, z), at about the ride's height y there, or null: the ground the ride lays under its verge stays
        // under it (RoadMesh.edgeWorks). A side road in a mouth is held a few centimetres under the ride (sideHold), and
        // the ground under the ride's verge, at its own depth under the ride, stood over it as a strip of grass
        if (aprons) foot.sideUnder = (x, y, z, r, more = 0) => {
            let low = null;
            for (const share of [0, 0.5, 1]) {
                for (let a = 0; a < (share ? 8 : 1); a++) {
                    const side = this.ground.sideRoadY(x + r * share * Math.cos(a * Math.PI / 4), z + r * share * Math.sin(a * Math.PI / 4), more);
                    if (side !== null && side < y + WorldEnvironment.SIDE_UNDER_NEAR_M && side > y - WorldEnvironment.SIDE_UNDER_NEAR_M && (low === null || side < low)) low = side;
                }
            }
            return low;
        };
        if (aprons) foot.mouth = atMouth;
        // A side road's edge where the land at full detail meets it but a coarser level is drawn lower (its far ribbon is
        // drawn from SIDE_NEAR_M on): how deep a face under the edge goes, the lowest land there less COARSE_UNDER_M, or
        // null (RoadMesh.edgeWorks)
        // (only where the land at full detail meets the edge: where it falls away there too, a face of ground under the
        // edge stood over it near the road, an overhang of `world-spikes`)
        if (!aprons) foot.coarse = (x, y, z, ox, oz) => {
            const near = landNear(x + ox * 0.5, z + oz * 0.5);
            if (near === null || near < y - WorldEnvironment.MEET_M - RoadMesh.APRON_UNDER_M) return null;
            const low = this.landLowAt(x + ox * 0.1, z + oz * 0.1, missing);
            if (low === null || low >= y - WorldEnvironment.SIDE_COARSE_M) return null;
            // (no face goes down through a tube's box: over the ride's tunnel near its portal, where the land is cut to
            // the box, the lowest land lay under the tube and a side road's face stood 11 m high across the tunnel just
            // inside its mouth, a wall of ground coloured as the land; leg 2 km 0.6)
            const fx = x + ox * 0.1, fz = z + oz * 0.1, foot = low - WorldEnvironment.COARSE_UNDER_M;
            return this.tubeSpanned(fx, fz, foot, y) || this.sideTubeAt(fx, fz, foot, y - 0.5) ? null : foot;
        };
        // A side road's edge that faces the ride's wall across a cleft: its wall plan leaves the wall out there
        // (RoadMesh.wallPlan), after its runs are judged, so the wall's other runs stand as they did
        if (!aprons) foot.facesRide = facesRideWall;
        // and one with no slope from it: that, or an edge by the ride's verge beside the ride's wall (byRideWall)
        if (!aprons) foot.byRideWall = (x, y, z, ox, oz) => facesRideWall(x, y, z, ox, oz) || byRideWall(x, y, z);

        // Where a side road's wall would stand, before the rule that leaves it out across a cleft (cleftAt reads it)
        // The ground that closes a narrow gap between the ride's row i and a side road beside it (cleftAt)
        if (aprons) foot.cleft = (i, sign, walled = true) => this.cleftAt(i, sign, walled);
        // Whether a side road's edge point stands in the ride's carriageway or its verge, with its coping over the
        // ride's surface there: the side road's walls keep out of the ride's road (RoadMesh.atMouth). Where a side road
        // leaves beside the ride, its wall stood in the ride's verge with its coping 0.28 to 0.38 m over it
        // (the ride's height there, or null)
        if (!aprons) foot.inRide = (x, y, z) => {
            let ride = null;
            this.carriageways.each(x, z, RoadSurface.VERGE_M, r => { if (r.road === -1 && r.depth >= -RoadSurface.VERGE_M && y + RoadMesh.COPING_UP_M > r.y + Carriageways.LOW_M && y < r.y + Carriageways.HEADROOM_M && (ride === null || r.y > ride)) ride = r.y; });
            return ride;
        };
        // The far edge of a junction's paving from a point (x, y, z) of the ride's carriageway edge, out along (ox, oz):
        // the last place within SIDE_GORE_REACH_M that lies on a side road at about the ride's height (as the side
        // road is drawn: WorldGround.sideRoadY), found without a gap wider than SIDE_GORE_M, or null with none. The
        // ride lays paving from its edge to there (RoadMesh.edgeWorks), under the side roads' ribbons: whatever lies
        // between the ride and a side road in a junction, and behind the piece that joins their walls, is road
        // With `turn` (the paving read between two of the ride's rows, RoadMesh.edgeWorks), a line square to the ride
        // that meets no side road is turned, up to SIDE_GORE_TURNS from square either way, and the paving goes out
        // along the turned line that meets one soonest, within SIDE_GORE_M of the edge: a side road that leaves at an
        // angle and falls away lies beside the ride at its height square to itself, but square to the ride it lies
        // farther out and under the step, and the land lay 1.4 m down in the corner between the two (leg 3's j35 by a
        // bridge, leg 4's j95 in the open, 0.3 m down over 4 m). Turned on every segment before the paving's far edge
        // came down to the land, its edges hung over the land elsewhere (overhangs 13 to 22 on the Gotthard leg); a
        // turned line that met a side road farther out than SIDE_GORE_M paved a corner beside a side road's slope and
        // left its side open (a flap on leg 2 at s 65)
        if (aprons) foot.gore = (x, y, z, ox, oz, turn = false) => {
            const square = scan(x, y, z, ox, oz);
            if (square || !turn) return square;
            let best = null;
            for (const a of WorldEnvironment.SIDE_GORE_TURNS) {
                const c = Math.cos(a), s = Math.sin(a);
                const got = scan(x, y, z, ox * c - oz * s, ox * s + oz * c);
                if (got && got.nearD <= WorldEnvironment.SIDE_GORE_M && (best === null || got.nearD < best.nearD)) best = got;
            }
            return best;
        };
        const scan = (x, y, z, ox, oz) => {
            let last = 0, lastY = null, near = null, nearD = 0;
            const under = [];
            // (the first gap counts the ride's verge, as the junction check reads the ride's drawn edge: a side road
            // 4.25 m past the verge, 5 m past the carriageway, was left unpaved at km 11.0)
            for (let d = 0.5; d <= WorldEnvironment.SIDE_GORE_REACH_M && d - last <= WorldEnvironment.SIDE_GORE_M + (near === null ? RoadSurface.VERGE_M : 0); d += 0.5) {
                const px = x + ox * d, pz = z + oz * d;
                // (never on over another leg of the ride)
                if (lastY !== null && d > 1 && this.rideSurfaceAt(px, pz, y) !== null) break;
                let side = this.ground.sideRoadY(px, pz);
                if (side === null) continue;
                // (as its ribbon is drawn, where it is: held under the ride and laid across its own slope, the ribbon lay
                // up to 0.17 m under the centre-line height the physics reads at its edge, and the paving over it)
                const drawn = this.sideDrawnY(px, pz, side);
                if (drawn !== null) side = drawn;
                // Only while the side road stands at the ride's height (in the band and at the foot of its ramp): past
                // that the two are two roads again, each with its own edge
                if (y - side > WorldEnvironment.SIDE_GORE_STEP_M || side - y > WorldEnvironment.SIDE_GORE_RISE_M) break;
                // (where it first meets the side road, at that road's drawn height: the paving comes up to it there)
                let low = side;
                this.carriageways.each(px, pz, 0, r => { if (r.depth >= 0 && Math.abs(r.y - y) <= 1.5 && r.y < low) low = r.y; }, true);
                // (under the road as drawn, not as the importer gives it: where the importer's height falls away from the
                // drawn one, laid under that, the paving lay up to 0.9 m under both roads, a pit between them)
                if (near === null) { near = [px, Math.min(y, side) - WorldEnvironment.SIDE_GORE_NEAR_M, pz]; nearD = d; }
                // (and SIDE_GORE_TUCK_M on under the road at its own height: `under`)
                if (!under.length && near && d - nearD >= WorldEnvironment.SIDE_GORE_TUCK_M) under.push({ d, p: [px, low - WorldEnvironment.SIDE_GORE_UNDER_M, pz] });
                last = d;
                lastY = lastY === null ? side : Math.min(lastY, side);
                // (under the importer's own height for that road too, where it lies lower: the structures' guard
                // reads a side road there, Carriageways)
                this.carriageways.each(px, pz, 0, r => { if (r.depth >= 0 && Math.abs(r.y - y) <= 1.5 && r.y < lastY) lastY = r.y; }, true);
            }
            // (under the side road where it stands over the ride: held at the ride's height, the paving lay under a side
            // road that climbs away beside the ride by up to SIDE_GORE_STEP_M more than its own depth, a dip between the
            // two roads)
            // `near`: the first place on the side road (RoadMesh.edgeWorks lays the paving up to it at that road's own
            // height, then on under the road; laid flat at the lowest of the road out to the far edge, it lay half a
            // metre under the ride's edge and the side road's near edge: the run-in's pit at km 14.08)
            if (lastY === null) return null;
            // (each point of `under` SIDE_GORE_UNDER_M under the road there as drawn or as the importer has it, the lower)
            const far = [x + ox * last, lastY - WorldEnvironment.SIDE_GORE_UNDER_M, z + oz * last];
            return Object.assign(far, { near, nearD, under: under.map(u => u.p) });
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
    // The same in steps (TerrainMesh.cutsSteps). The walls near the tile are read at once, under the same guard against
    // reading itself as the whole one has; the cut is then made a piece at a time, and a reader that asks for the tile
    // meanwhile has it made whole, which is the one kept
    *cutsOfSteps(key) {
        if (this.cutCache.has(key)) return this.cutCache.get(key);
        const tile = this.data.tile(key);
        if (!tile) return null;
        this.cutCache.set(key, null);
        const roadOver = this.roadOverFn || (this.roadOverFn = (ax, az, bx, bz) => {
            let high = -Infinity;
            const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 1.5));
            for (let k = 1; k <= steps; k++) this.carriageways.each(ax + ((bx - ax) * k) / steps, az + ((bz - az) * k) / steps, RoadSurface.VERGE_M, r => { if (r.y > high) high = r.y; });
            return high;
        });
        const runs = this.wallRunsNear(tile), pits = this.pitsNear(tile);
        this.cutCache.delete(key);
        const cuts = yield* TerrainMesh.cutsSteps(tile, runs, this.nearTile, roadOver, pits);
        if (this.cutCache.has(key)) return this.cutCache.get(key);
        this.cutCache.set(key, cuts);
        return cuts;
    }

    // The land's cut of each tile under a box [x0, z0, x1, z1] made ahead, each in steps (cutsOfSteps): a road or a
    // tile's scenery reads the land there, and a cut made at once in the middle of one was its longest step
    *cutsNear(box) {
        if (!box || !this.streamer) return;
        const m = WorldData.TILE_M, pad = RoadSurface.VERGE_M + 30;
        for (let tx = Math.floor((box[0] - pad) / m); tx <= Math.floor((box[2] + pad) / m); tx++) {
            for (let tz = Math.floor((box[1] - pad) / m); tz <= Math.floor((box[3] + pad) / m); tz++) {
                const key = `${tx},${tz}`;
                if (this.cutCache.has(key) || !this.data.tile(key)) continue;
                yield* this.cutsOfSteps(key);
            }
        }
    }

    // The land a tile's retaining walls cut (TerrainMesh.cuts), kept until the walls near it change (dropCuts).
    // Nothing the walls are planned from reads the cut land; were it asked for meanwhile, it is the nodes' own. The
    // highest road surface between two points is read every metre and a half (a road's carriageway and verge), not at
    // the first point itself: a node just outside the edge of the road its wall holds up
    cutsOf(key) {
        return WorldStreamer.drain(this.cutsOfSteps(key));
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
        // (a viaduct's faces cut the land as walls do, on from the walls at its ends: WorldEnvironment.viaductOf)
        for (const via of this.viaducts || []) if (near(via.box)) ride.push(...via.lines);
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

    // The ends of the ride's retaining walls within `reach` of a box ([x0, z0, x1, z1]): [{p, foot, out, run, seg}] (`seg`
    // the run's segment at that end), a run that goes on from one section into the next read as one. The keys its plans
    // were made without go into `missing`
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
                    else ends.set(id, { p: run.points[i], foot: run.foot[i], out: run.out[i], run, seg: i ? i - 1 : 0 });
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
                // (with a parapet where both walls carry theirs to the ends it joins: RoadMesh.edgeWorks, parapetAt)
                out.push({ a, b: best.p, footA: run.foot[i], footB: best.foot, outA: run.out[i], outB: best.out, o: [(-dz * side) / bestD, (dx * side) / bestD], parapet: this.runParapet(run, i ? i - 1 : 0) && this.runParapet(best.run, best.seg), owner: run.owner });
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
        if (this.cleftRows) this.cleftRows.clear();
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
                    return state && state.lod === 0 && this.tileMeshes.has(key) && this.data.tile(key) ? this.buildTileSteps(key, 0) : null;
                });
            }
        }
        // and the ride's works that stand on that land (a slope's foot, a wall's), and what stands on it
        this.reworkRoads(box, reach);
        this.restandScenery(box, reach);
    }

    // The ride's sections within `reach` of a box are built again, once, after what is still to arrive
    reworkRoads(box, reach = 30) {
        if (!this.streamer || !box) return;
        for (const section of this.streamer.sections) {
            const b = section.bbox;
            if (!b || !this.roadMeshes.has(section.index) || b[2] < box[0] - reach || b[0] > box[2] + reach || b[3] < box[1] - reach || b[1] > box[3] + reach) continue;
            this.streamer.enqueue(`works:road:${section.index}`, WorldEnvironment.LATER, () => {
                const held = this.streamer.roads.get(section.index);
                return held && this.roadMeshes.has(section.index) ? this.buildRoadSteps(section, held.lod) : null;
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

    // Whether a paved or road surface is drawn at (x, z) over or within `tolM` under `y`: a road's ribbon, a
    // junction's paving (the works' group 3), a stop's hard standing; or the ground the works lay (group 0) over `y`.
    // The ground cover grows on none of them
    // (GroundCover.site). Each mesh is read once into a grid of its triangles
    pavedAt(x, z, y, tolM = 0.3) {
        if (!this.pavedCache) this.pavedCache = new Map();
        const v = this.pavedV || (this.pavedV = new THREE.Vector3());
        const gridOf = (mesh, groups) => {
            const key = mesh.geometry.uuid;
            if (this.pavedCache.has(key)) return this.pavedCache.get(key);
            const pos = mesh.geometry.attributes.position, idx = mesh.geometry.index, cell = 4, hash = new Map(), tris = [];
            mesh.updateMatrixWorld(true);
            for (const [start, count] of groups) {
                for (let i = start; i + 2 < start + count; i += 3) {
                    const t = new Float64Array(9);
                    for (let k = 0; k < 3; k++) { v.fromBufferAttribute(pos, idx ? idx.getX(i + k) : i + k).applyMatrix4(mesh.matrixWorld); t[k * 3] = v.x; t[k * 3 + 1] = v.y; t[k * 3 + 2] = v.z; }
                    const ref = tris.push(t) - 1;
                    for (let cx = Math.floor(Math.min(t[0], t[3], t[6]) / cell); cx <= Math.floor(Math.max(t[0], t[3], t[6]) / cell); cx++) for (let cz = Math.floor(Math.min(t[2], t[5], t[8]) / cell); cz <= Math.floor(Math.max(t[2], t[5], t[8]) / cell); cz++) { const h = cx * 65536 + cz; (hash.get(h) || hash.set(h, []).get(h)).push(ref); }
                }
            }
            const grid = { hash, tris };
            this.pavedCache.set(key, grid);
            return grid;
        };
        const covers = (grid, low = y - tolM) => {
            for (const ref of grid.hash.get(Math.floor(x / 4) * 65536 + Math.floor(z / 4)) || []) {
                const t = grid.tris[ref];
                const d = (t[5] - t[8]) * (t[0] - t[6]) + (t[6] - t[3]) * (t[2] - t[8]);
                if (Math.abs(d) < 1e-9) continue;
                const a = ((t[5] - t[8]) * (x - t[6]) + (t[6] - t[3]) * (z - t[8])) / d, b = ((t[8] - t[2]) * (x - t[6]) + (t[0] - t[6]) * (z - t[8])) / d, c = 1 - a - b;
                if (a < -1e-9 || b < -1e-9 || c < -1e-9) continue;
                const h = a * t[1] + b * t[4] + c * t[7];
                if (h > low && h < y + 2) return true;
            }
            return false;
        };
        let found = false;
        const look = o => {
            if (found || !o.isMesh || !o.geometry || !o.visible) return;
            const whole = [[0, o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count]];
            if (/road-(ribbon|side)/.test(o.name)) found = covers(gridOf(o, whole));
            else if (o.name === 'road-works') {
                const groups = o.geometry.groups || [];
                found = covers(gridOf(o, groups.filter(g => g.materialIndex === 3).map(g => [g.start, g.count])))
                    // (and the ground the works lay, group 0, where it lies over the land: a tuft grew under it and through it)
                    || covers(this.worksGround(o), y + 0.05);
            }
        };
        for (const group of this.roadMeshes.values()) { group.traverse(look); if (found) return true; }
        for (const group of this.sideMeshes.values()) { group.traverse(look); if (found) return true; }
        for (const mesh of this.stopMeshes || []) { if (mesh.isMesh && covers(gridOf(mesh, [[0, mesh.geometry.index ? mesh.geometry.index.count : mesh.geometry.attributes.position.count]]))) return true; }
        return false;
    }

    // The ground group (0) of a works mesh as a grid (pavedAt), cached by its geometry
    worksGround(o) {
        if (!this.worksGroundCache) this.worksGroundCache = new Map();
        const key = o.geometry.uuid;
        if (this.worksGroundCache.has(key)) return this.worksGroundCache.get(key);
        const v = new THREE.Vector3(), pos = o.geometry.attributes.position, idx = o.geometry.index, hash = new Map(), tris = [];
        o.updateMatrixWorld(true);
        for (const g of (o.geometry.groups || []).filter(gr => gr.materialIndex === 0)) {
            for (let i = g.start; i + 2 < g.start + g.count; i += 3) {
                const t = new Float64Array(9);
                for (let k = 0; k < 3; k++) { v.fromBufferAttribute(pos, idx ? idx.getX(i + k) : i + k).applyMatrix4(o.matrixWorld); t[k * 3] = v.x; t[k * 3 + 1] = v.y; t[k * 3 + 2] = v.z; }
                const ref = tris.push(t) - 1;
                for (let cx = Math.floor(Math.min(t[0], t[3], t[6]) / 4); cx <= Math.floor(Math.max(t[0], t[3], t[6]) / 4); cx++) for (let cz = Math.floor(Math.min(t[2], t[5], t[8]) / 4); cz <= Math.floor(Math.max(t[2], t[5], t[8]) / 4); cz++) { const h = cx * 65536 + cz; (hash.get(h) || hash.set(h, []).get(h)).push(ref); }
            }
        }
        const grid = { hash, tris };
        this.worksGroundCache.set(key, grid);
        return grid;
    }

    // The height of the side roads' ribbons as drawn at (x, z), the one nearest `near` within 0.5 m, or null where no
    // ribbon of a resident chunk is drawn there. Each chunk's ribbons are read once into a grid of their triangles
    sideDrawnY(x, z, near) {
        if (!this.sideDrawnCache) this.sideDrawnCache = new Map();
        let best = null;
        const v = this.sideDrawnV || (this.sideDrawnV = new THREE.Vector3());
        for (const group of this.sideMeshes.values()) {
            group.traverse(o => {
                if (!o.isMesh || o.name !== 'road-side' || !o.geometry) return;
                let grid = this.sideDrawnCache.get(o.geometry.uuid);
                if (!grid) {
                    const pos = o.geometry.attributes.position, idx = o.geometry.index, cell = 4, hash = new Map(), tris = [];
                    o.updateMatrixWorld(true);
                    const count = idx ? idx.count : pos.count;
                    for (let i = 0; i + 2 < count; i += 3) {
                        const t = new Float64Array(9);
                        for (let k = 0; k < 3; k++) { v.fromBufferAttribute(pos, idx ? idx.getX(i + k) : i + k).applyMatrix4(o.matrixWorld); t[k * 3] = v.x; t[k * 3 + 1] = v.y; t[k * 3 + 2] = v.z; }
                        const ref = tris.push(t) - 1;
                        for (let cx = Math.floor(Math.min(t[0], t[3], t[6]) / cell); cx <= Math.floor(Math.max(t[0], t[3], t[6]) / cell); cx++) for (let cz = Math.floor(Math.min(t[2], t[5], t[8]) / cell); cz <= Math.floor(Math.max(t[2], t[5], t[8]) / cell); cz++) { const h = cx * 65536 + cz; (hash.get(h) || hash.set(h, []).get(h)).push(ref); }
                    }
                    grid = { hash, tris };
                    this.sideDrawnCache.set(o.geometry.uuid, grid);
                }
                for (const ref of grid.hash.get(Math.floor(x / 4) * 65536 + Math.floor(z / 4)) || []) {
                    const t = grid.tris[ref];
                    const d = (t[5] - t[8]) * (t[0] - t[6]) + (t[6] - t[3]) * (t[2] - t[8]);
                    if (Math.abs(d) < 1e-9) continue;
                    const a = ((t[5] - t[8]) * (x - t[6]) + (t[6] - t[3]) * (z - t[8])) / d, b = ((t[8] - t[2]) * (x - t[6]) + (t[0] - t[6]) * (z - t[8])) / d, c = 1 - a - b;
                    if (a < -1e-9 || b < -1e-9 || c < -1e-9) continue;
                    const y = a * t[1] + b * t[4] + c * t[7];
                    if (Math.abs(y - near) <= 0.5 && (best === null || Math.abs(y - near) < Math.abs(best - near))) best = y;
                }
            });
        }
        return best;
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
                // (not the ride: where a side road leaves it, the ride's verge is left out over the side road's, and the
                // side road's verge goes on to the ride's carriageway: RoadSurface's `roadCut`)
                if (other.onRide) continue;
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
    // A side road's ribbon never turns by more than SIDE_TURN_FOLD from one row to the next: between two rows that
    // turn more, rows are put in on the curve between them, SIDE_TURN_MAX apart in heading (each row's heading its
    // tangent, the chord its length). The importer's samples lie about 4 m apart, and where a 4 m road turns back on
    // itself (leg 3's j17, 107 degrees between two rows 3.5 m apart) the ribbon folded over at the inside of the turn
    // and left a wedge open at the outside, a hole of 0.5 m in the road. The rows put in carry the earlier row's own
    // data, their height and width between the two. (Put in at every turn over SIDE_TURN_MAX, the rows of a bend of
    // 22 degrees a row at leg 4's j151 opened an edge of 1.34 m in its mouth)
    static get SIDE_TURN_FOLD() { return (45 * Math.PI) / 180; }
    static get SIDE_TURN_MAX() { return (20 * Math.PI) / 180; }
    static sideTurns(rows) {
        if (!rows.some((row, i) => i > 0 && Math.abs(row.heading - rows[i - 1].heading) > WorldEnvironment.SIDE_TURN_FOLD)) return rows;
        const out = [rows[0]];
        for (let i = 1; i < rows.length; i++) {
            const a = rows[i - 1], b = rows[i], turn = b.heading - a.heading;
            const n = Math.abs(turn) > WorldEnvironment.SIDE_TURN_FOLD ? Math.ceil(Math.abs(turn) / WorldEnvironment.SIDE_TURN_MAX) : 1;
            const chord = Math.hypot(b.x - a.x, b.z - a.z);
            for (let k = 1; k < n; k++) {
                const t = k / n, t2 = t * t, t3 = t2 * t;
                const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
                const x = h00 * a.x + h10 * chord * Math.sin(a.heading) + h01 * b.x + h11 * chord * Math.sin(b.heading);
                const z = h00 * a.z + h10 * chord * Math.cos(a.heading) + h01 * b.z + h11 * chord * Math.cos(b.heading);
                out.push({ ...a, x, z, y: a.y + (b.y - a.y) * t, width: a.width + (b.width - a.width) * t, heading: a.heading + turn * t, bits: a.bits & b.bits, fill: !!(a.fill && b.fill), held: !!(a.held && b.held), keep: true });
            }
            out.push(b);
        }
        return out;
    }

    // Where a side road meets a wider one at a node of three roads or more (wider by MEET_WIDTH_M), its rows whose
    // ribbon lies inside the wider road's carriageway are held at that road's height there, SIDE_NODE_UNDER_M under
    // it (no shared plane). Each road ended at the node at its own heights: the wider ribbon's end lies level across
    // its width, and a narrower road that leaves it at an angle and falls ran on under that end, a step of 0.28 m in
    // its surface (leg 3's j29, an 8 m and a 4 m road). A row held at the ride's height (holdSide) keeps it
    static get SIDE_NODE_UNDER_M() { return 0.02; }
    sideNodeHold(edge, rows) {
        if (rows.length < 2 || !this.graph.nodes || !this.graph.nodes.degree) return rows;
        let out = rows;
        for (const node of [edge.a, edge.b]) {
            if (!(this.graph.nodes.degree[node] >= 3)) continue;
            for (const other of this.graph.edgesAt(node)) {
                if (other.id === edge.id || other.onRide) continue;
                const samples = this.graph.samples(other.id);
                if (!samples || samples.x.length < 2) continue;
                // (its carriageway near the node: the samples from its end at the node, as far as the ribbon reaches)
                const n = samples.x.length, from = other.a === node ? 0 : n - 1, way = other.a === node ? 1 : -1;
                const width = samples.width[from];
                const start = [samples.x[from], samples.z[from]];
                // (the end of this road at the node: the row nearest it)
                const ends = [0, out.length - 1].map(i => Math.hypot(out[i].x - start[0], out[i].z - start[1]));
                const first = ends[0] <= ends[1] ? 0 : out.length - 1, step = first === 0 ? 1 : -1;
                if (Math.min(...ends) > 1 || !(width >= out[first].width + WorldEnvironment.MEET_WIDTH_M)) continue;
                const inside = row => {
                    let best = null;
                    for (let j = from; j + way >= 0 && j + way < n && Math.abs(j - from) < 4; j += way) {
                        const ax = samples.x[j], az = samples.z[j], bx = samples.x[j + way], bz = samples.z[j + way];
                        const dx = bx - ax, dz = bz - az, run = dx * dx + dz * dz;
                        const t = run ? Math.max(0, Math.min(1, ((row.x - ax) * dx + (row.z - az) * dz) / run)) : 0;
                        // (not past the wider road's end at the node: its ribbon ends square there)
                        if (j === from && t === 0 && ((row.x - ax) * dx + (row.z - az) * dz) < 0) continue;
                        const d = Math.hypot(ax + dx * t - row.x, az + dz * t - row.z);
                        if (best === null || d < best.d) best = { d, y: samples.y[j] + (samples.y[j + way] - samples.y[j]) * t };
                    }
                    return best && best.d <= (samples.width[from] + row.width) / 2 ? best.y : null;
                };
                for (let i = first; i >= 0 && i < out.length; i += step) {
                    if (out[i].held && !out[i].ext) break;
                    const y = inside(out[i]);
                    if (y === null) break;
                    if (out === rows) out = rows.slice();
                    out[i] = { ...out[i], y: y - WorldEnvironment.SIDE_NODE_UNDER_M };
                }
            }
        }
        return out;
    }

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
    // How far along the ride a stretch past a wall's end looks for the wall it goes on from (railedPast)
    static get RAILED_PAST_M() { return 120; }

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

    // The side roads whose first sample is in chunk k: stubs at LOD0 where they leave the ride, and each road's rows in the
    // pieces `near` names (WorldStreamer.sideNear: their indices in sidePieces, joined) at LOD0, the rest at LOD1
    // (drawSideRibbons)
    buildSide(k, near = '') {
        return WorldStreamer.drain(this.buildSideSteps(k, near));
    }

    // The same in steps: each road's rows, each road, the edge works a row at a time; the old roads are let go and the
    // new ones put in their place in the last step. `again`: the chunk is built
    // again whole (its works, when a tile or a chunk under them came), its old roads drawn until then
    *buildSideSteps(k, near = '', again = false) {
        // Only its LOD0 pieces changed (WorldStreamer.sideNear): its ribbons alone are built again
        const prior = this.sideMeshes.get(k);
        if (prior && prior.userData.roads && !again) {
            this.drawSideRibbons(k, prior, near);
            return;
        }
        const stubEdges = this.graph.sideStubs();
        // The rows of every road here, a road at a time (read before the chunk's old roads are let go: a chunk built
        // again stays drawn until its new roads are ready)
        const plans = [];
        for (const edge of this.data.edges) {
            yield;
            if (edge.onRide || this.data.chunkOf(edge.first) !== k) continue;
            const samples = this.graph.samples(edge.id);
            if (!samples) continue;
            let plain = WorldEnvironment.unwrap(Array.from(samples.x, (_, i) => ({ x: samples.x[i], y: samples.y[i], z: samples.z[i], heading: samples.heading[i], width: samples.width[i], bits: samples.flags[i], cls: edge.cls, i })));
            if (plain.length < 2) continue;
            plain = this.sideMouths(edge, plain);
            const { rows, s0 } = this.fromRideEnd(edge, plain);
            const node = stubEdges.get(edge.id);
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
                    const stubRows = yield* this.holdSideSteps(stubPlain, [], [...rest, ...onward]);
                    let length = 0;
                    for (let i = 1; i < stubRows.length; i++) length += Math.hypot(stubRows[i].x - stubRows[i - 1].x, stubRows[i].z - stubRows[i - 1].z);
                    // The rest goes on from the stub's end, run away from the junction and measured from it
                    if (!away) far = flip(far);
                    farS = length;
                    plans.push([stubRows, true, edge, guard, 0, [], [...rest, ...onward]]);
                    if (far.length < 2) continue;
                    plans.push([yield* this.holdSideSteps(far, stubPlain.slice(0, -1), onward), false, edge, guard, farS, stubPlain.slice(0, -1), onward]);
                    continue;
                }
            }
            if (far.length < 2) continue;
            const before = this.sideOnward(edge, 'a'), after = this.sideOnward(edge, 'b');
            plans.push([yield* this.holdSideSteps(far, before, after), false, edge, guard, farS, before, after]);
        }
        // (and the land's cut under the chunk, which its works read: cutsNear)
        const chunkBox = this.data.manifest.chunks[k] && this.data.manifest.chunks[k].bbox;
        yield* this.wallPlansNear(chunkBox);
        yield* this.cutsNear(chunkBox);
        const group = new THREE.Group();
        group.name = `world-side-${k}`;
        const edgesHere = [];
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
        // (a portal's headwall reaches the land drawn behind it: a tile's, or where no tile is here the far grid's, so
        // the far portal of a long tube drawn whole from one chunk fronts the far land: worlds/susten, the motorway
        // tunnel under Andermatt, its portal at Göschenen 3.7 km from the chunk, 21 places unfronted)
        const faceAt = (x, z) => {
            const y = groundAt(x, z);
            if (Number.isFinite(y)) return y;
            const far = this.data.farHeight(x, z);
            return far === null ? undefined : far;
        };
        // (a point inside the ride's own tunnel or gallery: a side tube that starts there opens in the ride's wall, with
        // no portal or tube of its own inside it, RoadMesh.sideStructures `inRide`)
        const rideBoxes = this.rideTubes().filter(t => !t.mouth);
        const inRide = (x, y, z) => TerrainMesh.inTube(rideBoxes, x, y, z);
        const options = { groundAt, footAt, faceAt, roof: WorldRoute.ROOF_M, inRide };
        // A road's structures and edge works stand at its verge's outer edge (its LOD0 ribbon's sides) at every level of
        // detail, as the ride's do, so a change of level of detail builds only its ribbons again (drawSideRibbons)
        const roads = [];
        // (the tubes' lining of every road here, one mesh: TubeLining)
        const lining = TubeLining.parts();
        // (`before` and `after`: the rows the road goes on as past its ends, so a tube that runs on past one has no portal there)
        const draw = function* (rows, stub, edge, guard, s0 = 0, before = [], after = []) {
            // Where the road goes on as another edge of another width, both end on one line at the node: its end row
            // takes the heading half way to the onward row's. Each ended square to its own heading, and at a node where
            // the road bends and narrows the two ribbons left a wedge open between them (the summit's hole, 0.5 m, where
            // the hospice's 5 m access road goes on as a 3 m road)
            // (only where the road narrows or widens there by MEET_WIDTH_M or more: the narrower ribbon's end left the
            // wedge; where the two are one width their walls run on across the node, and a bent end row split a wall
            // into a block at Airolo)
            const meet = (row, other) => {
                if (Math.abs(row.width - other.width) < WorldEnvironment.MEET_WIDTH_M) return row;
                const turn = Math.atan2(Math.sin(other.heading - row.heading), Math.cos(other.heading - row.heading));
                return { ...row, heading: row.heading + turn / 2 };
            };
            rows = this.sideNodeHold(edge, WorldEnvironment.sideTurns(rows));
            if (rows.length > 1) {
                rows = rows.slice();
                if (before.length) rows[0] = meet(rows[0], before[before.length - 1]);
                if (after.length) rows[rows.length - 1] = meet(rows[rows.length - 1], after[0]);
            }
            const road = new THREE.Group();
            road.name = stub ? 'world-road-stub' : 'world-road-side';
            const through = [!!(before.length && before[before.length - 1].bits & 5), !!(after.length && after[0].bits & 5)];
            const built = yield* RoadMesh.sideStructuresSteps(RoadMesh.vergeSides(rows, this.sideHold(edge.id)), options.groundAt, options.roof, options.footAt, guard, through, options.faceAt, options.inRide);
            Object.assign(road.userData, { sides: built.sides, structures: built.parts, piers: built.piers, tubes: built.tubes, through, rows, stub, edge: edge.id, s0 });
            // The physics rides the road as it is drawn (held at the ride's height in a junction, on its ramp past it)
            edgesHere.push({ x: rows.map(row => row.x), z: rows.map(row => row.z), y: rows.map(row => row.y), width: rows.map(row => row.width) });
            sides.push(Object.assign(built.sides, { owner: edge.id }));
            structures.push(...built.parts.map(part => Object.assign(part, { owner: edge.id })));
            for (const key of ['lining', 'fittings']) {
                const part = built.lining[key];
                for (const [name, list] of Object.entries(part)) lining[key][name] = lining[key][name].concat(list);
                lining[key].owners = (lining[key].owners || []).concat(new Array(part.positions.length / 9).fill(edge.id));
            }
            group.add(road);
            roads.push(road);
        };
        // (the chunk's old roads stay drawn and ridden while the new ones are made, a road at a time; they are let go
        // and the new ones put in their place in one step at the end, so neither the physics nor the eye ever meets the
        // chunk without its roads)
        for (const args of plans) {
            yield* draw.call(this, ...args);
            yield;
        }
        // The edge works of every side road here, one mesh: its retaining walls, decks and tubes (a side road is seen
        // from afar at LOD1, and aprons for every one cost the window's meshes and the queue's time); built again when
        // a tile under them arrives
        // (and where one of their walls ends beside the end of one of the ride's, the two are joined: wallJoins)
        const box = this.data.manifest.chunks[k] && this.data.manifest.chunks[k].bbox;
        // (a wall's end that wallJoins joins to one of the ride's goes on in that piece: no face past it and no return,
        // `foot.joined` as the ride's own; a face past it stood beside the piece, two walls a hand apart)
        const foot = this.edgeFoot(missing, { aprons: false });
        const ends = box ? this.rideWallEnds(box, WorldEnvironment.WALL_JOIN_M + 60, missing) : [];
        foot.joined = (x, y, z) => ends.some(end => { const d = Math.hypot(end.p[0] - x, end.p[2] - z); return d < WorldEnvironment.WALL_JOIN_M && d > 0.05 && Math.abs(end.p[1] - y) <= 1; });
        triangles += yield* RoadMesh.addEdgeWorksSteps(group, sides, foot, structures, this.carriageways, walls => this.wallJoins(walls, box, missing));
        triangles += TubeLining.addMeshes(group, lining);
        yield;
        this.disposeSide(k);
        // The land is cut to their walls (setSideWalls) and to their tubes (setSideTubes)
        this.setSideWalls(k, group.userData.walls || []);
        this.setSideTubes(k, roads.flatMap(road => road.userData.tubes || []));
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
        if (this.cleftRows) this.cleftRows.clear();
        this.ground.setSideEdges([...this.sideEdges.values()].flat());
        // The ride sections built before this chunk's roads were known keep out of them now
        this.rebuildWaiting(`chunk:${k}`);
        // and those built before its roads were drawn pave the junctions with them now (edgeFoot `gore` reads the
        // side roads as they are drawn, which a section built first could not): the browser builds the ride first
        this.reworkRoads(box);
        // and what stands beside them keeps clear of them
        this.restandScenery(box);
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
        if (this.cleftRows) this.cleftRows.clear();
        this.ground.setSideEdges([...this.sideEdges.values()].flat());
        // (a tube no longer drawn cuts no land)
        this.setSideTubes(k, []);
        this.restandScenery(this.data.manifest.chunks[k] && this.data.manifest.chunks[k].bbox);
    }

    // The boxes of the ride's tunnels and galleries (TerrainMesh.tubeBox), made once: each segment between two rows of
    // a run, its walls RoadMesh.TUBE_WALL_M past half the road's width either side, as RoadMesh.tunnel draws them
    rideTubes() {
        if (this.rideTubeList) return this.rideTubeList;
        const points = this.route.points, list = [];
        const foot = (p, sign) => { const o = sign * (p.width / 2 + RoadMesh.TUBE_WALL_M); return [p.x + o * Math.cos(p.heading), p.y, p.z - o * Math.sin(p.heading)]; };
        const tube = i => !!(points[i] && points[i].bits & 5);
        // (a box in front of a portal is marked `mouth`: the land is cut there, but no roof stands over it)
        const add = (a, b, mouth = false, profile = 'box') => { const box = TerrainMesh.tubeBox(foot(a, -1), foot(a, 1), foot(b, 1), foot(b, -1), WorldRoute.ROOF_M); if (box) list.push(mouth ? Object.assign(box, { mouth }) : Object.assign(box, { profile })); };
        // (each box carries its tube's profile, StructureStyles.tube, for the camera's roof: tubeRoofY)
        const info = this.tubeInfo();
        for (let i = 0; i + 1 < points.length; i++) {
            if (tube(i) && tube(i + 1)) add(points[i], points[i + 1], false, info.run[i] >= 0 ? info.runs[info.run[i]].profile : 'box');
            // In front of each portal, out RoadMesh.TUBE_MOUTH_M along the road (RoadMesh.wings closes its sides)
            for (const [at, step] of [[i, -1], [i + 1, 1]]) {
                if (!(tube(i) && tube(i + 1)) || tube(at + step) || !points[at + step]) continue;
                let walked = 0;
                for (let j = at; points[j + step] && walked < RoadMesh.TUBE_MOUTH_M; j += step) {
                    walked += Math.hypot(points[j + step].x - points[j].x, points[j + step].z - points[j].z);
                    add(points[j], points[j + step], true);
                }
            }
        }
        this.rideTubeList = list;
        return list;
    }

    // The far grid (Horizon) less every tube's box (TerrainMesh.tubeClip), the ride's and the side roads' drawn now:
    // made again from the whole grid when the side roads' tubes change (setSideTubes)
    clipHorizon() {
        return WorldStreamer.drain(this.clipHorizonSteps());
    }

    // The same in steps (TerrainMesh.tubeClipSteps): the cut of the whole grid against every tube took 67 ms in one
    // frame of the Gotthard leg's fly to the lookout. The grid drawn stays as it was until the cut is done
    *clipHorizonSteps() {
        if (!this.horizon || !this.horizonWhole) return;
        const whole = this.horizonWhole, geometry = this.horizon.geometry;
        const tubes = [...this.rideTubes(), ...[...this.sideTubes.values()].flat()];
        const clipped = tubes.length ? yield* TerrainMesh.tubeClipSteps(whole.positions, whole.shades, [whole.index], tubes) : null;
        const before = geometry.index.count / 3;
        if (clipped) {
            geometry.setAttribute('position', new THREE.BufferAttribute(clipped.positions, 3));
            geometry.setAttribute('color', new THREE.BufferAttribute(clipped.shades, 3));
            geometry.setIndex(new THREE.BufferAttribute(clipped.lists[0], 1));
        } else {
            geometry.setAttribute('position', new THREE.BufferAttribute(whole.positions, 3));
            geometry.setAttribute('color', new THREE.BufferAttribute(whole.shades, 3));
            geometry.setIndex(new THREE.BufferAttribute(whole.index, 1));
        }
        // (normals made anew at the new vertex count: computeVertexNormals keeps an old normal attribute at its old
        // length, and a draw with an attribute shorter than the positions draws nothing, the whole far grid gone)
        geometry.deleteAttribute('normal');
        geometry.computeVertexNormals();
        // (the grid's own vertices and its skirt keep the normals FarLand.join gave them: run into the level round
        // it at its edge, and a skirt's its edge vertex's; the cut's new vertices take theirs from the cut)
        if (whole.normals) geometry.attributes.normal.array.set(whole.normals);
        geometry.computeBoundingSphere();
        this.triangleCount += geometry.index.count / 3 - before;
        this.onMeshBuilt(this.horizon);
    }

    // The lowest roof of a tunnel or gallery over (x, z) for the chase camera (WorldCamera's `overhead`), less
    // TUBE_CAMERA_M, or Infinity with none: the tube whose box holds (x, z) in plan, whose floor is no more than
    // TUBE_LEVEL_M over y and whose roof is over y (the tube of the road at y, not one of another leg above or below
    // it). Read from the tubes' boxes (rideTubes, setSideTubes), the world's data as the builder lays it, never from
    // what is hung in them. A box in front of a portal has no roof
    tubeRoofY(x, z, y) {
        const m = WorldData.TILE_M;
        let low = Infinity;
        for (const tube of this.tubesNear(`${Math.floor(x / m)},${Math.floor(z / m)}`)) {
            if (tube.mouth) continue;
            const b = tube.box;
            if (x < b[0] || x > b[2] || z < b[1] || z > b[3]) continue;
            if (!tube.planes.every(([nx, nz, d]) => nx * x + nz * z + d >= 0)) continue;
            const floor = tube.floor[0] + tube.floor[1] * x + tube.floor[2] * z;
            if (floor > y + WorldEnvironment.TUBE_LEVEL_M || floor + tube.roof < y) continue;
            // (a rounded tube's roof comes down over its walkways: the room kept is round the camera, StructureStyles)
            const wall = Math.min(tube.planes[0][0] * x + tube.planes[0][1] * z + tube.planes[0][2], tube.planes[2][0] * x + tube.planes[2][1] * z + tube.planes[2][2]);
            low = Math.min(low, floor + StructureStyles.ceilingAt(tube.profile, wall, tube.roof, WorldEnvironment.TUBE_CAMERA_M));
        }
        return low;
    }

    // Half the ride's row spacing: the rows within two of it past a side tube's mouth carry the mouth, so every segment
    // it reaches into knows it (roadStyles tubeMouthL/R)
    static get MOUTH_ROW_M() { return 2; }

    // Whether a tube's box (a tunnel's or a gallery's, or the box in front of a portal, up to the roof) holds (x, z) in
    // plan between heights y0 and y1: a face hung from a road's edge down through it would stand in the tube
    tubeSpanned(x, z, y0, y1) {
        const m = WorldData.TILE_M;
        for (const tube of this.tubesNear(`${Math.floor(x / m)},${Math.floor(z / m)}`)) {
            const b = tube.box;
            if (x < b[0] || x > b[2] || z < b[1] || z > b[3]) continue;
            if (!tube.planes.every(([nx, nz, d]) => nx * x + nz * z + d >= 0)) continue;
            const floor = tube.floor[0] + tube.floor[1] * x + tube.floor[2] * z;
            if (floor < y1 && floor + (tube.roof || WorldRoute.ROOF_M) > y0) return true;
        }
        return false;
    }

    // Whether a side road's tunnel or gallery runs at (x, z) between heights y0 and y1, read from the importer's samples
    // (its rows' tube bits, the road up ROOF_M from its height, out to its verge and the tube's wall): a chunk's own
    // tubes are known to tubesNear only once the chunk is built (setSideTubes), so a face one of its roads hangs while
    // it is built did not see the tube of another road of the same chunk (a side road's face across the tunnel of a
    // side road under it, the Gotthard leg, 390 m off the ride by its start)
    sideTubeAt(x, z, y0, y1) {
        let found = false;
        this.carriageways.each(x, z, RoadSurface.VERGE_M + RoadMesh.TUBE_WALL_M, r => {
            if (found || r.road < 0 || r.y > y1 || r.y + WorldRoute.ROOF_M < y0) return;
            const e = this.data.edgeSamples(r.road);
            if (!e || !e.flags) return;
            let best = Infinity, k = -1;
            for (let i = 0; i < e.x.length; i++) { const d = (e.x[i] - x) ** 2 + (e.z[i] - z) ** 2; if (d < best) { best = d; k = i; } }
            if (k >= 0 && e.flags[k] & 5) found = true;
        }, true);
        return found;
    }

    // The room the chase camera keeps under a tube's roof besides its own margin (WorldCamera roofClearM, roofHardM):
    // the lights, fans and services hung from the roof, and the view's near plane (0.46 m from the eye at its corners)
    static get TUBE_CAMERA_M() { return 1.5; }
    // How far over the road's height a tube's floor may be and still be the road's own tube
    static get TUBE_LEVEL_M() { return 2.5; }

    // The tubes whose boxes reach tile `key`: the ride's and those of the side roads drawn now
    tubesNear(key) {
        if (!this.tubeCache) this.tubeCache = new Map();
        if (this.tubeCache.has(key)) return this.tubeCache.get(key);
        const [tx, tz] = key.split(',').map(Number), m = WorldData.TILE_M;
        const x0 = tx * m, z0 = tz * m, x1 = x0 + m, z1 = z0 + m;
        const near = b => b[2] >= x0 && b[0] <= x1 && b[3] >= z0 && b[1] <= z1;
        const out = this.rideTubes().filter(tube => near(tube.box));
        for (const list of this.sideTubes.values()) for (const tube of list) if (near(tube.box)) out.push(tube);
        this.tubeCache.set(key, out);
        return out;
    }

    // The tubes a side chunk draws ({la, ra, rb, lb, roof}, RoadMesh.sideStructures): the tiles under them are drawn
    // again, at the level of detail they have, when they change
    setSideTubes(k, segments) {
        const boxes = segments.map(s => { const box = TerrainMesh.tubeBox(s.la, s.ra, s.rb, s.lb, s.roof); return box && s.mouth ? Object.assign(box, { mouth: true }) : box && Object.assign(box, { profile: s.profile || 'box' }); }).filter(Boolean);
        const sign = list => list.map(b => b.box.map(v => Math.round(v * 100)).join(',') + `:${Math.round(b.roof * 100)}`).join('|');
        const old = this.sideTubes.get(k) || [];
        if (sign(old) === sign(boxes)) return;
        if (boxes.length) this.sideTubes.set(k, boxes);
        else this.sideTubes.delete(k);
        if (this.tubeCache) this.tubeCache.clear();
        if (this.streamer) this.streamer.enqueue('tube:horizon', WorldEnvironment.LATER, () => this.clipHorizonSteps());
        const m = WorldData.TILE_M, keys = new Set();
        for (const b of old.concat(boxes)) for (let tx = Math.floor(b.box[0] / m); tx <= Math.floor(b.box[2] / m); tx++) for (let tz = Math.floor(b.box[1] / m); tz <= Math.floor(b.box[3] / m); tz++) keys.add(`${tx},${tz}`);
        for (const key of keys) {
            if (!this.tileMeshes.has(key) || !this.streamer) continue;
            this.streamer.enqueue(`tube:${key}`, WorldEnvironment.LATER, () => {
                const state = this.streamer.tiles.get(key);
                return state && this.tileMeshes.has(key) && this.data.tile(key) ? this.buildTileSteps(key, state.lod) : null;
            });
            // (and what stands on that land stands on it as it is now)
            const [tx, tz] = key.split(',').map(Number);
            this.restandScenery([tx * m + 1, tz * m + 1, (tx + 1) * m - 1, (tz + 1) * m - 1], 0);
        }
    }

    // Streams the world round the bike and builds what the 4 ms budget allows.
    // position: {x, z}; s: the ride progress; state: what the guide reads, see WorldGuide.update;
    // dtSec: the simulated time since the last update (0 for a call that is not a step of the ride)
    update(position, s, state = null, budgetMs = WorldStreamer.BUDGET_MS, dtSec = 0) {
        this.lastBike = position;
        // A landmark is drawn within LANDMARK_REACH_M: beyond, it is a few pixels and costs the window its triangles
        if (this.landmarkGroup) for (const node of this.landmarkGroup.children) node.visible = Math.hypot(node.position.x - position.x, node.position.z - position.z) < WorldEnvironment.LANDMARK_REACH_M;
        if (this.roadworks) this.roadworks.update(position, Number.isFinite(dtSec) ? dtSec : 0);
        if (this.placeMesh) this.placeMesh.update(position);
        if (Number.isFinite(dtSec) && dtSec > 0) this.streamClockMs += dtSec * 1000;
        this.streamer.update(position, s);
        if (this.placed) {
            this.placed = false;
            this.streamer.releasePlacing();
        }
        // The window's caps chosen again when the bike enters another square or the tiles change, as a task in steps
        // (Scenery.rankCapsSteps): made at once on the frame the square changed it took up to 110 ms
        const square = Scenery.snapped(position), key = `${square.x},${square.z}`;
        if (this.scenery.capsDirty || key !== this.scenery.capsCell) this.streamer.enqueue('caps:window', 0, () => this.scenery.rankCapsSteps(position, false));
        this.streamer.pump(budgetMs);
        this.scenery.rankStones(position);
        this.scenery.rankTrees(position);
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
        // (a stopping place's props are drawn near the bike only: PlaceMesh.triangles is what is drawn now)
        const props = this.placeMesh ? this.placeMesh.triangles : 0;
        return { meshes, triangles: Math.round(this.triangleCount + this.scenery.triangles + props), instances, tiles: this.tileMeshes.size, roads: this.roadMeshes.size, sides: this.sideMeshes.size, trees: this.scenery.treeCount, queue: this.streamer.queue.length };
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
        // The edge's textures belong to this world: the land's shader stops reading them
        if (this.edgeFar) {
            LandShade.setEdge(null, null);
            this.edgeFar.colour.dispose();
            this.edgeFar.normal.dispose();
            if (this.drawnMap) this.drawnMap.texture.dispose();
        }
    }
}
