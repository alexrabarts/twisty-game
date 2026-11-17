// WorldEnvironment: what Game holds as `environment` when `?world=<stage|all>`
// is set. It is the world's answer to Environment (js/environment.js, the leg
// engine): the same members the game reads (route, ground, roadWidth,
// checkpoints, finishGate, config, physics...), built over the streamed world
// data instead of a 20 m profile.
//
// Members the game reads of a leg, and what a world gives (the code that must not run in a world
// is not constructed, so nothing here is "switched off"):
//   route, ground, roadWidth, physics, config            implemented
//   checkpoints, finishGate                              the stage's gates, from the stations
//   startSegment, endSegment, trafficSpeedScale          the span traffic keeps to, and how fast it goes
//   oncomingLane                                          the lane of the oncoming car
//   terrain, terrainGeometry, sections, setPieces,
//   roadworksZones, roadworkObstacles, jumpRamps,
//   boulders                                             null / empty: no cones, rockfalls or roadworks are built
//   applyLandscapeConfig, applyWeatherVisuals,
//   resolveRoadSurface, writeRoadSurface                 fog density only / no-ops
//
// A world is loaded with WorldEnvironment.load(), which waits for the ride layer
// (data.js) before the first frame: the route contract is synchronous.
class WorldEnvironment {
    // Half-width of the gate band, beyond the road edge
    static get GATE_REACH_M() { return 6; }

    // Metres the rider starts along the ride, so the road's cut end is behind the camera
    static get START_M() { return 20; }

    // A side road inside the ride's band: how far under the ride surface it is held, how far past the road edge
    // (the ride ribbon's kerb) that reaches, and the height apart beyond which it is a road over or under the ride
    static get SIDE_UNDER_M() { return 0.01; }
    static get SIDE_KERB_M() { return 0.5; }
    static get SIDE_PASS_M() { return 2; }

    // The ride progress the barrier set is chosen by is rounded to this many metres
    static get BARRIER_STEP_M() { return 20; }

    // `world` parameter: a stage id or 'all', or null when the page is not asking for a world
    static requested(search) {
        const params = new URLSearchParams(search || '');
        const id = params.get('world');
        return id ? id : null;
    }

    static async load(scene, { id = 'all', search = '', fetchFn = null, models = undefined, digest = null } = {}) {
        const resolved = WorldData.resolveBase(new URLSearchParams(search).get('worldData'));
        if (resolved.error) throw new Error(resolved.error);
        const data = new WorldData({ base: resolved.base, overridden: resolved.overridden, fetchFn, digest });
        await data.load();
        const stage = id === 'all' ? null : data.manifest.stages.find(s => s.id === id);
        if (id !== 'all' && !stage) throw new Error(`unknown world "${id}"; known: all, ${data.manifest.stages.map(s => s.id).join(', ')}`);
        const loaded = models === undefined && typeof SceneAssets !== 'undefined' ? await Scenery.loadModels(SceneAssets.loadModel) : (models || null);
        await Promise.all([data.ensureFar().catch(() => null), data.ensureBuildings().catch(() => null)]);
        return new WorldEnvironment(scene, data, { stage, models: loaded });
    }

    constructor(scene, data, { stage = null, models = null } = {}) {
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
        // Right-hand traffic: the rider keeps to the route's right lane, so the oncoming car keeps to its left
        this.oncomingLane = 'left';
        this.config = { id: stage ? stage.id : 'world', look: { fogDensity: 0.0008 }, render: { shadowSpan: 120, cullMax: 6000 }, grip: 1 };

        this.group = new THREE.Group();
        this.group.name = 'world';
        this.tileGroup = new THREE.Group();
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
        this.scenery = new Scenery(this.ground, data, models);
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
                buildSide: k => this.buildSide(k),
                disposeSide: k => this.disposeSide(k)
            }
        });
        this.guide = new WorldGuide(this);
    }

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

    // The things built once: the horizon, the gate frames, the signposts and the landmarks
    buildFixtures() {
        if (this.data.far) {
            const horizon = Horizon.build(this.data.far);
            this.horizon = horizon.mesh;
            this.triangleCount += horizon.triangles;
            this.group.add(this.horizon);
        }
        const out = { positions: [], shades: [] };
        const post = [0.55, 0.55, 0.58];
        for (const st of this.stationGates || []) {
            const p = this.route.sample(st.s, {});
            const half = p.width / 2 + 1.2;
            const color = st.kind === 'start' || st.kind === 'finish' ? [0.92, 0.92, 0.92] : [0.95, 0.75, 0.10];
            for (const sign of [-1, 1]) RoadMesh.box(out, p.x + sign * half * Math.cos(p.heading), p.y + 2.6, p.z - sign * half * Math.sin(p.heading), 0.3, 5.2, 0.3, p.heading, post);
            RoadMesh.box(out, p.x, p.y + 5.3, p.z, half * 2 + 0.6, 0.8, 0.3, p.heading, color);
        }
        if (out.positions.length) {
            this.gateMesh = RoadMesh.mesh(RoadMesh.geometry(out.positions, out.shades), 'world-gates');
            this.group.add(this.gateMesh);
        }
        const poses = [];
        for (const junction of this.graph.junctions) {
            for (const pass of junction.passes) {
                if (pass.inEdge === null || pass.inEdge === undefined) continue;
                const incoming = junction.incident.find(i => i.edgeId === pass.inEdge);
                if (!incoming) continue;
                const arrival = incoming.heading + Math.PI;
                const node = { x: this.data.nodes.x[junction.node], z: this.data.nodes.z[junction.node], y: this.data.nodes.y[junction.node] };
                poses.push({ x: node.x + 7 * Math.cos(arrival), y: node.y, z: node.z - 7 * Math.sin(arrival), heading: arrival });
            }
        }
        if (poses.length) {
            this.signMesh = this.scenery.signposts(poses);
            this.group.add(this.signMesh);
        }
        this.group.add(this.scenery.landmarks(this.data.manifest.landmarks || [], this.route));
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
        });
        built.mesh.userData.skipCulling = true;
        this.tileGroup.add(built.mesh);
        this.tileMeshes.set(key, built);
        this.triangleCount += built.triangles;
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
        const houses = (this.data.buildings || []).filter(b => b.x >= tx * m && b.x < (tx + 1) * m && b.z >= tz * m && b.z < (tz + 1) * m);
        const group = this.scenery.buildTile(tile, this.data.cover(key), houses, this.lastBike);
        if (group) {
            group.traverse(o => { if (o.isMesh) o.userData.skipCulling = true; });
            this.sceneryGroup.add(group);
        }
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
        return this.route.points.slice(from, to + 1).map(p => ({ x: p.x, y: p.y, z: p.z, heading: p.heading, width: p.width, bits: p.bits }));
    }

    buildRoad(section, lod) {
        this.disposeRoad(section);
        const group = RoadMesh.section(this.rowsOf(section.from, Math.min(this.route.points.length - 1, section.to + 1)), lod, { groundAt: (x, z) => this.ground.tileHeight(x, z) ?? undefined, roof: WorldRoute.ROOF_M });
        group.traverse(o => { if (o.isMesh) o.userData.skipCulling = true; });
        this.roadGroup.add(group);
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
        for (const i of route.hashCandidates(x, z, 0)) {
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

    // Per-vertex hold of a side ribbon: a vertex inside the band goes under the ride surface (RoadMesh.sideRoad holdY)
    sideHold() {
        return (x, y, z) => {
            const low = this.rideSurfaceAt(x, z, y);
            return low === null ? y : Math.min(y, low - WorldEnvironment.SIDE_UNDER_M);
        };
    }

    // The side roads whose first sample is in chunk k: stubs at LOD0 beside a barrier, the rest at LOD1
    buildSide(k) {
        const group = new THREE.Group();
        group.name = `world-side-${k}`;
        const edgesHere = [];
        const barrierEdges = new Map();
        for (const junction of this.graph.junctions) {
            for (const pass of junction.passes) for (const b of pass.barriers) barrierEdges.set(b.edgeId, junction.node);
        }
        let triangles = 0;
        const hold = this.sideHold();
        this.data.edges.forEach((edge) => {
            if (edge.onRide || this.data.chunkOf(edge.first) !== k) return;
            const samples = this.graph.samples(edge.id);
            if (!samples) return;
            edgesHere.push({ x: samples.x, z: samples.z, y: samples.y, width: samples.width });
            const rows = Array.from(samples.x, (_, i) => ({ x: samples.x[i], y: samples.y[i], z: samples.z[i], heading: samples.heading[i], width: samples.width[i], bits: samples.flags[i] }));
            if (rows.length < 2) return;
            const node = barrierEdges.get(edge.id);
            if (node !== undefined) {
                const stub = this.graph.stub(edge.id, node);
                if (stub && stub.length > 1) {
                    const stubGroup = RoadMesh.sideRoad(this.holdSide(stub.map(p => ({ ...p, bits: p.flags }))), true, hold);
                    group.add(stubGroup);
                    triangles += stubGroup.userData.triangles;
                }
            }
            const side = RoadMesh.sideRoad(this.holdSide(rows), false, hold);
            group.add(side);
            triangles += side.userData.triangles;
        });
        group.userData.triangles = triangles;
        group.traverse(o => { if (o.isMesh) o.userData.skipCulling = true; });
        this.sideGroup.add(group);
        this.sideMeshes.set(k, group);
        this.sideEdges.set(k, edgesHere);
        this.triangleCount += triangles;
        this.ground.setSideEdges([...this.sideEdges.values()].flat());
    }

    disposeSide(k) {
        const old = this.sideMeshes.get(k);
        if (!old) return;
        this.sideGroup.remove(old);
        RoadMesh.dispose(old);
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
        const list = this.graph.barriersFor(progressS);
        const key = list.map(b => `${b.junctionId}:${b.edgeId}`).join('|');
        if (key === this.barrierKey) return;
        this.barrierKey = key;
        this.activeBarriers = list;
        this.ground.setBarriers(list);
        RoadMesh.placeBarriers(this.barrierMesh, list.map(b => ({ x: b.x, y: (this.ground.landY(b.x, b.z, 0)) - 0.1, z: b.z, heading: b.heading, width: b.width })));
    }

    // Streams the world round the bike and builds what the 4 ms budget allows.
    // position: {x, z}; s: the ride progress; state: what the guide reads, see WorldGuide.update;
    // dtSec: the simulated time since the last update (0 for a call that is not a step of the ride)
    update(position, s, state = null, budgetMs = WorldStreamer.BUDGET_MS, dtSec = 0) {
        this.lastBike = position;
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

    applyWeatherVisuals() {}

    resolveRoadSurface() { return {}; }

    writeRoadSurface() {}

    dispose() {
        this.guide.dispose();
        this.group.traverse(o => {
            if (o.isInstancedMesh) o.dispose();
            if (o.geometry) o.geometry.dispose();
        });
        this.scene.remove(this.group);
    }
}
