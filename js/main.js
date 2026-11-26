class Game {
    constructor() {
        console.log('Starting game initialization...');
        
        // Check if THREE.js is loaded
        if (typeof THREE === 'undefined') {
            const errorMsg = 'THREE.js library failed to load. Please check your internet connection and refresh.';
            console.error(errorMsg);
            this.showError(errorMsg);
            throw new Error(errorMsg);
        }
        
        console.log('THREE.js loaded, version:', THREE.REVISION);

        // Check for WebGL support
        if (!this.isWebGLAvailable()) {
            const errorMsg = 'WebGL is not available in your browser. Please enable WebGL or try a different browser.';
            console.error(errorMsg);
            this.showError(errorMsg);
            throw new Error(errorMsg);
        }

        // Time-of-Day configurations
        this.timeOfDay = 'golden';  // Default
        // Set by setTimeOfDay: the override stands until the next snapAtmosphere
        this.atmosphereHold = false;
        this.timeConfigs = {
            golden: {
                name: 'Golden Hour',
                skyColor: 0xb8d4e8,
                fogColor: 0xc8dae8,
                ambientColor: 0x303030,
                ambientIntensity: 0.4,
                hemisphereTop: 0x8ab8d6,
                hemisphereBottom: 0x4a4638,
                hemisphereIntensity: 0.78,
                sunColor: 0xfff4e6,
                sunIntensity: 0.85,
                fillColor: 0xe6f2ff,
                fillIntensity: 0.225,
                rimColor: 0xfff8e1,
                rimIntensity: 0.25,
                exposure: 1.0,
                sunOffset: { x: 60, y: 90, z: 45 }
            },
            day: {
                name: 'Day',
                skyColor: 0xa9cdee,
                fogColor: 0xc6dcee,
                ambientColor: 0x383838,
                ambientIntensity: 0.42,
                hemisphereTop: 0x9cc4e4,
                hemisphereBottom: 0x4e4a3c,
                hemisphereIntensity: 0.8,
                sunColor: 0xfffaf0,
                sunIntensity: 0.95,
                fillColor: 0xe9f3ff,
                fillIntensity: 0.24,
                rimColor: 0xffffff,
                rimIntensity: 0.22,
                exposure: 1.0,
                sunOffset: { x: 40, y: 100, z: 30 }
            },
            sunset: {
                name: 'Sunset',
                skyColor: 0xff8866,
                fogColor: 0xf0aa90,
                ambientColor: 0x30283a,
                ambientIntensity: 0.48,
                // (light from above comes from the violet zenith; a red sky
                // light turned the grey road maroon)
                hemisphereTop: 0x9088bc,
                hemisphereBottom: 0x4a3a30,
                hemisphereIntensity: 1.04,
                sunColor: 0xffa066,
                sunIntensity: 0.9,
                fillColor: 0xd9a8b8,
                fillIntensity: 0.3,
                rimColor: 0xffaa66,
                rimIntensity: 0.3,
                exposure: 0.92,
                sunOffset: { x: 95, y: 30, z: -55 }
            },
            twilight: {
                name: 'Twilight',
                skyColor: 0x4466aa,
                fogColor: 0x5577bb,
                ambientColor: 0x202040,
                ambientIntensity: 0.56,
                hemisphereTop: 0x5577cc,
                hemisphereBottom: 0x2a2a4a,
                hemisphereIntensity: 0.91,
                sunColor: 0x6688cc,
                sunIntensity: 0.5,
                fillColor: 0x8899dd,
                fillIntensity: 0.225,
                rimColor: 0x99aaee,
                rimIntensity: 0.2,
                exposure: 0.95,
                headlight: 0.8,
                sunOffset: { x: 80, y: 45, z: 30 }
            },
            // Moonlit: dark enough that the headlight matters, bright enough
            // to read the road edge and the rock face
            night: {
                name: 'Night',
                skyColor: 0x020408,
                fogColor: 0x060a14,
                ambientColor: 0x0c1020,
                ambientIntensity: 0.3,
                hemisphereTop: 0x6f8fd0,
                hemisphereBottom: 0x161c2c,
                hemisphereIntensity: 0.5,
                sunColor: 0x9fb6e6,  // Moon
                sunIntensity: 0.6,
                fillColor: 0x1a2440,
                fillIntensity: 0.1,
                rimColor: 0x2a3550,
                rimIntensity: 0.1,
                exposure: 1.3,
                headlight: 1.0,
                sunOffset: { x: 45, y: 70, z: 50 }
            },
            dawn: {
                name: 'Dawn',
                skyColor: 0xffa588,
                fogColor: 0xffb899,
                ambientColor: 0x34303a,
                ambientIntensity: 0.448,
                hemisphereTop: 0xa9b3d6,
                hemisphereBottom: 0x4a3a2a,
                hemisphereIntensity: 0.91,
                sunColor: 0xffe0bb,
                sunIntensity: 0.75,
                fillColor: 0xffddaa,
                fillIntensity: 0.27,
                rimColor: 0xffeecc,
                rimIntensity: 0.25,
                exposure: 0.95,
                sunOffset: { x: 80, y: 28, z: 60 }
            }
        };

        // Create tour system
        console.log('Creating tour system...');
        this.tourSystem = new TourSystem({ unlockAll: Game.debugEnabled(window.location.search) });
        this.tourSystem.onViewLeaderboard = (legId) => this.showLeaderboardViewer(legId);
        this.tourSystem.onRiderShowcase = (id) => this.showcaseBikes ? this.focusRiderShowcase(id) : this.startRiderShowcase(id);
        this.tourSystem.onRiderShowcaseStart = (id) => this.startRiderShowcase(id);
        this.tourSystem.onBikeShowcase = (id) => this.changeShowcaseBike(id);
        this.tourSystem.onTrackShowcase = (legIndex) => this.startTrackPreview(legIndex);
        this.tourSystem.riderTier = (id) => this.riderTier(id);

        // Initialize leaderboard service
        if (typeof LeaderboardService !== 'undefined' && window.firebaseFunctions) {
            this.leaderboardService = new LeaderboardService(window.firebaseFunctions);
            console.log('Leaderboard service initialized');
        } else {
            this.leaderboardService = null;
            console.warn('Leaderboard service not available - Firebase not initialized');
        }

        this.init();
        this.setupScene();
        this.setupLighting();
        this.setupCamera();

        // Initialize game state variables
        this.clock = new THREE.Clock();
        this.fps = 0;
        this.frameCount = 0;
        this.lastTime = performance.now();

        // Fixed timestep for physics (prevents oscillation from variable frame timing)
        this.fixedTimeStep = 1/60; // 60 Hz physics
        this.accumulatedTime = 0;
        this.maxAccumulatedTime = 0.1; // Cap at 100ms to prevent spiral of death

        // Scoring system
        this.score = 0;
        this.combo = 0;
        this.comboMultiplier = 1;
        this.checkpointsPassed = 0;
        this.lastCheckpointIndex = -1;
        this.checkpointTimes = [];
        this.lastCheckpointPosition = null;
        this.lastCheckpointSegment = null;
        this.lastCheckpointHeading = 0;
        this.checkpointRestartPressed = false;

        // Speed streak bonus
        this.speedStreakTime = 0;
        this.lastSpeedCheck = 0;
        this.highSpeedThreshold = 50;

        // Near miss tracking
        this.lastNearMissTime = 0;
        this.nearMissCheckedBikes = new Set();

        // High score tracking
        this.highScore = parseInt(localStorage.getItem('motorcycleHighScore') || '0');
        this.bestTime = parseFloat(localStorage.getItem('motorcycleBestTime') || '999999');

        // Finish state
        this.finished = false;
        this.finishTime = 0;
        this.startTime = this.now();
        // A restart adds 5 s to the clock; the count is signed with the finish
        this.penaltyMs = 0;
        this.restarts = 0;

        // Pause state
        this.paused = false;

        // Brake duration tracking for tire smoke
        this.brakeHeldTime = 0;

        // Help flags
        this.hasShownWheelieHelp = false;

        // Initialize input handler and sound manager (independent of environment)
        this.input = new InputHandler();
        // The sound (js/sound.js): its settings are its own (Sound.SETTINGS), kept in localStorage
        this.soundManager = new SoundManager();
        this.hud = new Hud(document, window);
        // The graphics level (js/quality.js) before the tuning panel, which shows its control
        this.startQuality();
        // The tuning (js/tuning.js) reads its stored values in debug mode only, and only then is its panel built
        this.startTuning();
        this.startRiderModes();

        // requestAnimationFrame stops on a hidden tab, so nothing else would
        // silence the engine drone
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.soundManager.sleep();
            }
        });

        // What the page rides is read from the URL in one place (js/ridemode.js); a page without it has the legs
        this.rideMode = typeof RideMode !== 'undefined' ? RideMode.resolve(window.location.search) : { kind: 'legs', world: null, direct: false };
        this.openRide();
    }

    // A world named in the URL starts at once. Otherwise the menu opens: choosing a rider starts the world (the
    // default) or, under ?legs, goes on to the leg screen; Classic legs on the rider screen goes to the leg screen
    openRide() {
        const mode = this.rideMode;
        if (mode.kind === 'hill') {
            this.startHill();
            return;
        }
        if (mode.direct) {
            this.startWorld(mode.world);
            return;
        }
        this.tourSystem.onWorldSelected = mode.kind === 'world' ? () => this.chooseWorld() : null;
        this.tourSystem.createLegSelector(document.body, (leg) => {
            console.log('Leg selected:', leg.name);
            this.initializeGameWithLeg(leg);
        });
    }

    // The hill ride (js/hill/ride.js): a ride of its own on this page, with no menu and no clock on screen; its time and board show on its end card. One that cannot
    // start (its model did not load) hands over to the legs, as a world that cannot load does
    startHill() {
        this.hill = new HillRide(this);
        this.hill.start().catch(error => {
            if (this.hill) this.hill.running = false;
            document.body.classList.remove('hill-on');
            this.fallBackToLegs(error, RideMode.HILL_FAIL_NOTE);
        });
    }

    // The menu's world: a leg ridden on this page has left its systems built, so the world starts on a fresh page
    // (the rider and bike are kept in localStorage); a page that has ridden nothing starts it here
    chooseWorld() {
        // With more than one world leg the menu asks which (WorldLegs: grouped by pass, the next open leg focused)
        if (typeof WorldLegs !== 'undefined' && WorldLegs.LIST.length > 1 && !this.rideMode.legPicked) {
            WorldLegs.open(document, {
                unlockAll: Game.debugEnabled(window.location.search),
                onPick: (id) => {
                    this.rideMode = { ...this.rideMode, world: id, legPicked: true };
                    this.chooseWorld();
                },
                onBack: () => { this.tourSystem.legSelectorActive = true; }
            });
            return;
        }
        if (this.environment) {
            window.location.assign(RideMode.worldUrl(window.location, this.rideMode.world, typeof GameModes !== 'undefined' ? GameModes.chosen : 'trial'));
            return;
        }
        this.startWorld(this.rideMode.world);
    }

    // Loads the world's ride layer, then builds the game round it (WorldEnvironment.load). A world that cannot load
    // hands over to the legs (fallBackToLegs)
    async startWorld(id) {
        this.endMenuShowcase();
        this.removeRunOverlays();
        this.tourSystem.hideLegSelector();
        // A dimmed screen with the note in a panel: the last frame of the menu (the rider on the stage) stays drawn
        // behind it, and plain text over that could not be read
        const screen = document.createElement('div');
        screen.id = 'world-loading';
        screen.className = 'world-loading';
        screen.setAttribute('role', 'status');
        const note = document.createElement('div');
        note.className = 'world-loading-box';
        const title = document.createElement('div');
        title.className = 'world-loading-title';
        title.textContent = 'Loading the road...';
        const bar = document.createElement('div');
        bar.className = 'world-loading-bar';
        note.append(title, bar);
        screen.appendChild(note);
        document.body.appendChild(screen);
        // No HUD over the loading screen: its clock, gates and keys are a ride's, and there is none yet
        document.body.classList.add('world-loading-on');
        // The data credit stands on the loading screen, and in Credits from the menus (js/world/credits.js)
        if (typeof WorldCredits !== 'undefined') {
            const credit = document.createElement('div');
            credit.className = 'world-loading-credit';
            note.appendChild(credit);
            WorldCredits.text().then(({ credit: line }) => { credit.textContent = line; });
        }
        try {
            const environment = await WorldEnvironment.load(this.scene, { id, search: window.location.search });
            // The crew's own bikes and the light rider, behind the loading screen (BikeModels.preloadCrew)
            if (typeof BikeModels !== 'undefined' && BikeModels.preloadCrew) await BikeModels.preloadCrew();
            await this.initializeGameWithWorld(environment);
        } catch (error) {
            this.fallBackToLegs(error);
            return;
        }
        screen.remove();
        document.body.classList.remove('world-loading-on');
    }

    // The world's data did not load (a fetch error, a status other than 200, data not in the world format: the live
    // host is not yet proven to serve world/*.bin). The legs take over with a note on the leg screen, and the rider
    // screen stops offering the world for the rest of the page
    fallBackToLegs(error, notice = RideMode.FALLBACK_NOTE) {
        console.error('Failed to load the world; the classic legs take over:', error);
        const note = document.getElementById('world-loading');
        if (note) note.remove();
        document.body.classList.remove('world-loading-on');
        // A world built part-way is torn down, so nothing keyed off isWorld sees it
        if (this.environment && this.environment.isWorld) {
            try {
                this.cleanupCurrentLeg();
            } catch (cleanup) {
                console.warn('The part-built world could not be torn down:', cleanup);
            }
            this.environment = null;
        }
        this.rideMode = { kind: 'legs', world: null, direct: false };
        this.tourSystem.onWorldSelected = null;
        this.tourSystem.createLegSelector(document.body, (leg) => this.initializeGameWithLeg(leg));
        this.tourSystem.showTrackScreen();
        this.tourSystem.showNotice(notice);
    }

    // The land round the bike in a world ride (WorldStreamer.landState), once a frame: the rider is told while land near
    // the bike is still loading (the far land is drawn there meanwhile, and the road over it), the bike is held while
    // its own tile has no data, and land that never comes ends the ride the way a world that cannot load at the start
    // does: the classic legs take over with a note. A ride that has finished is left alone
    watchLand() {
        const environment = this.environment, vehicle = this.vehicle;
        if (!environment || !environment.isWorld || !environment.streamer || !vehicle || this.finished) {
            this.landHeld = false;
            this.setLandNote(false);
            return;
        }
        const land = environment.streamer.landState(vehicle.position, undefined, this.landState || (this.landState = {}));
        this.landHeld = land.under;
        this.setLandNote(land.missing || land.under);
        if (land.lost && !this.landLostPending) {
            this.landLostPending = true;
            // After this frame: the world is torn down outside the loop that draws it
            setTimeout(() => {
                this.landLostPending = false;
                if (this.environment !== environment) return;
                this.landHeld = false;
                this.setLandNote(false);
                this.fallBackToLegs(new Error('the world\'s land stopped loading'), RideMode.LAND_LOST_NOTE);
            }, 0);
        }
    }

    // The call-out that says the land is still loading, up while `on` (Hud.callout, Hud.dismiss)
    setLandNote(on) {
        const hud = this.hud;
        if (on) {
            if (hud && !(this.landNote && this.landNote.isConnected && !this.landNote.classList.contains('leaving'))) this.landNote = hud.callout(Game.LAND_NOTE, 'warn', Game.LAND_NOTE_MS);
            return;
        }
        if (this.landNote && hud && hud.dismiss) hud.dismiss(this.landNote);
        this.landNote = null;
    }

    // The game on a world: no cones or rockfalls are built (they are leg systems), traffic rides the
    // route, and the atmosphere track runs along the whole ride in 100 m units (R5).
    async initializeGameWithWorld(environment) {
        this.beginTunedRide();
        this.selectedCharacter = this.tourSystem.getSelectedCharacter ? this.tourSystem.getSelectedCharacter() : null;
        this.environment = environment;
        this.environment.onMeshBuilt = root => {
            this.graphics.fixColorSpaces(root);
            this.thinTrees(root);
            if (typeof Effects !== 'undefined') Effects.dress(this, root);
        };
        // Anything added under the world after that, by any code (a stopping place's props rebuilt as the bike comes
        // near, PlaceMesh.update), is dressed the same way before its first draw (Graphics.dressAdded)
        const world = this.environment;
        this.graphics.onAdded = root => {
            if (this.environment !== world || !world.group) return;
            for (let o = root; o; o = o.parent) if (o === world.group) return world.onMeshBuilt(root);
        };
        this.environment.applyLandscapeConfig(this.environment.config.look);
        this.applyShadowBox(this.environment.config.render);
        this.cones = null;
        this.rockfalls = null;
        this.particles = new ParticleSystem(this.scene);
        // The far land stands up to 40 km away (FarLand); a leg keeps its 5 km
        this.camera.far = WorldEnvironment.FAR_PLANE_M;
        this.camera.updateProjectionMatrix();
        // (the stage's own sky, measured on its photos: WorldLooks.viewOf)
        const view = WorldLooks.viewOf(environment.stage ? environment.stage.id : null);
        this.graphics.setHorizonSpan(Number.isFinite(view.horizonSpan) ? view.horizonSpan : WorldLooks.horizonSpan);

        // (free roam: its own time of day and weather, GameModes.TIMES and WEATHERS, from the menu or the address)
        const roamLook = typeof GameModes !== 'undefined' && GameModes.active(this.rideMode, Game.debugEnabled(window.location.search)) === 'roam';
        const looks = WorldLooks.pick(window.location.search);
        this.atmosphereTrack = AtmosphereTrack.forWorld(environment.route.stages, environment.route, roamLook ? WorldLooks.fixed(looks, (this.rideMode && this.rideMode.time) || GameModes.time, (this.rideMode && this.rideMode.weather) || GameModes.weather) : looks);
        if (typeof WeatherSystem !== 'undefined') {
            if (this.weatherSystem) this.weatherSystem.dispose();
            this.weatherSystem = new WeatherSystem(this.scene, this.camera, AtmosphereTrack.seededRandom(`world-${environment.config.id}`));
            // Rain in a world keeps the hairpins' grip bound (WorldLooks.grip), and falls close round the rider
            this.weatherSystem.grip = WorldLooks.grip;
            this.weatherSystem.rainLook = WorldLooks.rain;
            this.weatherSystem.prepare(this.atmosphereTrack.weatherTypes());
        }

        this.vehicle = new Vehicle(this.scene, (points) => this.addScore(points), this.selectedCharacter, this.selectedBike(), { outfit: this.selectedOutfit() });
        this.vehicle.environment = this.environment;
        if (this.weatherSystem) this.vehicle.setWeatherSystem(this.weatherSystem);

        const start = this.environment.startPosition();
        this.vehicle.position.set(start.x, start.y, start.z);
        this.vehicle.yawAngle = start.heading;
        this.vehicle.findNearestRoadSegment();
        // The ground under the first frame is here before the bike is
        await this.environment.streamer.settle(start, this.environment.startS);

        this.traffic = new Traffic(this.scene, this.environment, this.selectedCharacter ? this.selectedCharacter.name : null);
        this.snapAtmosphere(this.atmosphereTrack, this.atmosphereUnit(this.environment.startS), {
            environment: this.environment,
            weatherSystem: this.weatherSystem || null
        });
        this.prewarmWorldWeather();

        this.worldRun = new WorldRun(this.environment.route, this.environment.stationGates, this.environment.physics);
        // (a road overhead, and the roof of a tunnel or gallery: WorldEnvironment.tubeRoofY)
        this.worldCamera = new WorldCamera(this.environment.route, this.environment.ground, (x, z, y) => Math.min(this.environment.overheadY(x, z, y), this.environment.tubeRoofY(x, z, y)), (x, z, reach) => this.environment.cameraFaces(x, z, reach));
        this.worldCamera.reset(start.heading);
        await this.startFreeRoam();

        const normalCameraOffset = this.baseCameraOffset.clone();
        normalCameraOffset.applyEuler(new THREE.Euler(0, this.vehicle.yawAngle, 0));
        const normalCameraPos = this.vehicle.position.clone().add(normalCameraOffset);
        this.camera.position.copy(normalCameraPos);
        this.cameraIntroStartPos.copy(normalCameraPos);
        this.cameraIntroEndPos.copy(normalCameraPos);
        this.currentCameraPos.copy(normalCameraPos);

        this.environment.guide.onRestart = (reason) => this.restartFromCheckpoint(reason);
        this.environment.guide.onWarning = (text) => showCallout(text, 'bad', Game.CALLOUT_MS.warning);
        this.resetRunState();
        this.armWorldStart();
        this.graphics.fixColorSpaces();
        this.setupPerformanceCulling();
        this.accumulatedTime = 0;
        if (this.clock) this.clock.getDelta();
        this.lastTime = performance.now();
        this.frameCount = 0;
        this.adaptGraceUntil = performance.now() + 4000;
        this.animationFrameId = requestAnimationFrame(() => this.animate());
    }

    // The progress bar of the HUD: the stage ridden, with a tick for each of its checkpoints
    showWorldStage() {
        const { environment, hud } = this;
        const { from, to } = this.worldStageSpan();
        hud.showProgress(HudRules.progressMarks(environment.stationGates, from, to));
    }

    // The short name of a stage (the words before the comma of its full name): the stage the page rides, else stage `k`
    // of a ride of every stage
    worldStageName(k) {
        const stage = this.environment.stage || this.environment.route.stages[k];
        return stage ? stage.name.split(',')[0] : 'Andermatt';
    }

    // How many stages this ride holds: one for a page that rides a single stage of a longer route
    worldStageCount() {
        return this.environment.stage ? 1 : Math.max(1, this.environment.route.stages.length);
    }

    // The span of the stage being ridden: the selected stage, or the whole ride
    worldStageSpan() {
        const stage = this.environment.stage;
        return stage ? { from: stage.from, to: stage.to } : { from: 0, to: this.environment.route.length };
    }

    // Free roam (GameModes 'roam': from the address or the menu, in debug mode only): no clock, stations or rules of the
    // ride, the roadworks off, the camera behind the rider on any road, and the edge of the map (FreeRoam)
    async startFreeRoam() {
        const debug = Game.debugEnabled(window.location.search);
        this.freeRoam = typeof GameModes !== 'undefined' && GameModes.active(this.rideMode, debug) === 'roam';
        document.body.classList.toggle('free-roam', this.freeRoam);
        if (!this.freeRoam) {
            this.roam = null;
            if (this.sideTraffic) this.sideTraffic.clear();
            this.sideTraffic = null;
            this.discoveries = null;
            this.roamStyle = null;
            this.showDiscoveries();
            return;
        }
        const environment = this.environment;
        const tiles = environment.data && environment.data.manifest && environment.data.manifest.tiles ? environment.data.manifest.tiles.height : [];
        this.roam = new FreeRoam(tiles, WorldData.TILE_M);
        // Discoveries (js/world/discoveries.js): counted on the HUD, kept in this browser between rides
        let store = null;
        try { store = window.localStorage; } catch (error) { console.warn('Discoveries: no storage in this page', error); }
        this.discoveries = typeof WorldDiscoveries !== 'undefined' ? new WorldDiscoveries(environment, store) : null;
        // Traffic on the side roads (js/world/sidetraffic.js): a car on each side road near the bike, the ride's car
        // model, its colour drawn from the ride's
        if (this.sideTraffic) this.sideTraffic.clear();
        this.sideTraffic = typeof SideTraffic !== 'undefined' && environment.graph && environment.graph.sideStubs ? new SideTraffic(environment.graph, (x, z) => environment.ground.groundY(x, z, null), (draw) => {
            const holder = { scene: this.scene, color: Game.SIDE_CAR_COLORS[Math.floor(draw * Game.SIDE_CAR_COLORS.length)] };
            Car.prototype.createCarModel.call(holder);
            return holder.carGroup;
        }, (group) => {
            this.scene.remove(group);
            if (typeof disposeGroupResources === 'function') disposeGroupResources(group);
        }, Traffic.sizeOf('car'), 7) : null;
        // The style ride (js/world/style.js): each wheelie measured, the bests kept
        this.roamStyle = typeof RoamStyle !== 'undefined' ? new RoamStyle(environment.config && environment.config.id, store) : null;
        this.showDiscoveries();
        environment.guide.roam = true;
        this.worldCamera.followRider = true;
        // The group rides with the player, the player leading (GROUP.roam), or the player rides alone
        if (this.traffic) {
            this.traffic.roam = true;
            const alone = ((this.rideMode && this.rideMode.group) || GameModes.group) === 'alone';
            if (alone) this.traffic.dropCrew();
            else if (this.traffic.group) this.traffic.group.playerPlace = null;
        }
        // Start anywhere (the menu's Start at): the start, a stopping place or the summit. The crew rides behind the
        // player wherever it starts (travelTo grids it there)
        await this.travelTo(FreeRoam.startFor(environment, (this.rideMode && this.rideMode.start) || GameModes.startAt), false);
        // The roadworks' lights work one lane for the ride's own direction: in free roam the sites are off
        if (environment.roadworks) {
            if (environment.roadworks.group) environment.roadworks.group.visible = false;
            environment.roadworks = null;
            environment.roadworksZones = [];
        }
    }

    // One frame of free roam: the edge of the map. In the soft band the bike slows and is told; at the hard line it is
    // put back where it last was on a road, turned round
    // The HUD's discoveries line in free roam (empty, so hidden, otherwise)
    showDiscoveries() {
        const line = document.getElementById('hudFinds');
        if (line) line.textContent = this.freeRoam && this.discoveries ? this.discoveries.text() : '';
        const style = document.getElementById('hudStyleBest');
        if (style) style.textContent = this.freeRoam && this.roamStyle ? this.roamStyle.text() : '';
    }

    updateFreeRoam(dt) {
        const v = this.vehicle;
        if (this.sideTraffic) {
            const hit = this.sideTraffic.step(v, dt);
            if (hit === 'crash') v.worldCrash('Rode into a car', 'lowside', 'car');
            else if (hit === 'stop' && v.velocity && v.velocity.set) {
                v.speed = 0;
                v.velocity.set(0, v.velocity.y || 0, 0);
            }
        }
        if (this.roamStyle) {
            const shown = this.roamStyle.text();
            const done = this.roamStyle.step(v, this.score, dt);
            if (done) showCallout(RoamStyle.callout(done), done.best ? 'good' : 'info', Game.CALLOUT_MS.restart);
            if (this.roamStyle.text() !== shown) this.showDiscoveries();
        }
        if (this.discoveries && !v.crashed) {
            const found = this.discoveries.step(v.position.x, v.position.z, dt);
            if (found) {
                showCallout(`Discovered: ${found.name}`, 'good', Game.CALLOUT_MS.restart);
                this.showDiscoveries();
            }
        }
        // Off the ride the bike's place on it is found again each frame over the whole ride: its windowed search follows
        // a bike that rides along the ride, and one far down a side road outruns it, and then the ground is read off
        // the wrong strand of the ride (FreeRoam.FAR_M)
        const p = v.projection;
        if (!(p && p.index >= 0) || Math.abs(p.lateral) > (p.width || 0) / 2 + FreeRoam.FAR_M) v.findNearestRoadSegment();
        const at = this.roam.step({ x: v.position.x, y: v.position.y, z: v.position.z, heading: v.yawAngle, speed: v.speed, onRoad: !v.runoff, crashed: !!v.crashed, dt });
        if (at.zone !== this.roamZone) {
            if (at.zone === 'soft') showCallout(Game.ROAM_TEXT.edge, 'warn', Game.CALLOUT_MS.warning);
            this.roamZone = at.zone;
        }
        if (at.drag > 0 && !v.crashed) v.speed *= Math.max(0, 1 - at.drag * dt);
        if (at.zone === 'hard' && !v.crashed) this.restartInPlace('edge');
    }

    // A world ride starts on the start line (a restart is in place: restartInPlace)
    armWorldStart() {
        const start = this.environment.startPosition();
        this.worldRun.begin(this.environment.startS);
        // (free roam may start elsewhere: Game.startFreeRoam put the bike there)
        if (this.freeRoam) {
            this.worldCamera.reset(this.vehicle.yawAngle);
        } else {
            this.lastCheckpointPosition = new THREE.Vector3(start.x, start.y, start.z);
            this.lastCheckpointHeading = start.heading;
            this.worldCamera.reset(start.heading);
        }
        // Each ride draws its own chance of a marmot crossing the road (Marmots.CROSSING)
        if (this.environment.marmots) this.environment.marmots.seed(Math.floor(Math.random() * 1e9));
    }

    // What the guide reads each frame; the projection is the vehicle's own, from its wall check
    worldGuideState(dt) {
        const vehicle = this.vehicle;
        return { projection: vehicle.projection, speed: vehicle.speed, yaw: vehicle.yawAngle, dt, position: vehicle.position, riders: this.groupOnMap() };
    }

    // The group's riders for the mini map (WorldGuide.markers): where each one that is on the road is, and its
    // character's map colour. One list, filled again each frame
    groupOnMap() {
        const list = this.mapRiders || (this.mapRiders = []);
        let n = 0;
        for (const rider of (this.traffic ? this.traffic.motorcycles : [])) {
            if (!rider.bikeGroup || !rider.bikeGroup.visible) continue;
            const m = list[n] || (list[n] = {});
            m.x = rider.bikeGroup.position.x; m.z = rider.bikeGroup.position.z;
            m.color = rider.character && rider.character.mapColor !== undefined ? rider.character.mapColor : 0xffffff;
            n++;
        }
        list.length = n;
        return list;
    }

    initializeGameWithLeg(leg) {
        this.beginTunedRide();
        // Tear down any menu showcase (bikes / preview environment / RAF loop)
        this.endMenuShowcase();

        // No banner from an earlier run may sit over the new leg
        this.removeRunOverlays();

        // Hide tour selector
        this.tourSystem.hideLegSelector();

        // Resolve the selected rider before building anything that needs it
        this.selectedCharacter = this.tourSystem.getSelectedCharacter ? this.tourSystem.getSelectedCharacter() : null;

        console.log('Creating environment...');
        try {
            // Create environment with lazy generation for the selected leg
            const legIndex = this.tourSystem.getCurrentLegIndex();
            this.environment = new Environment(this.scene, leg.startSegment, leg.endSegment, legIndex);
            console.log('Environment created successfully');

            // The landscape's fog density is written first: the weather system reads it
            this.environment.applyLandscapeConfig(this.environment.config.look);
            this.applyShadowBox(this.environment.config.render);

            // The light, sky, fog and weather of the leg, from the track
            this.atmosphereTrack = AtmosphereTrack.forLeg(leg, this.environment.config, this.environment);
            console.log('Initializing weather system...');
            if (typeof WeatherSystem !== 'undefined') {
                if (this.weatherSystem) this.weatherSystem.dispose();
                // A leg of several looks draws its weather from a seeded stream: the same
                // for every rider, and apart from the stream that cones and traffic read
                const random = this.atmosphereTrack.parts.length > 1
                    ? AtmosphereTrack.seededRandom(TourSystem.boardId(leg))
                    : Math.random;
                this.weatherSystem = new WeatherSystem(this.scene, this.camera, random);
                this.weatherSystem.surfaceGrip = this.environment.config.grip ?? 1;
                this.weatherSystem.prepare(this.atmosphereTrack.weatherTypes());
            } else {
                console.warn('WeatherSystem class not found');
            }
            this.snapAtmosphere(this.atmosphereTrack, leg.startSegment, {
                environment: this.environment,
                weatherSystem: this.weatherSystem || null
            });
        } catch (error) {
            console.error('Failed to create environment:', error);
            throw error;
        }

        console.log('Creating cones course...');
        this.cones = new Cones(this.scene, this.environment, (points) => {
            this.addScore(points);
            this.showConeHitNotification(points);
            this.soundManager.playConeHitSound();
        });

        console.log('Creating rockfall hazards...');
        this.rockfalls = (typeof RockfallSystem !== 'undefined')
            ? new RockfallSystem(this.scene, this.environment)
            : null;

        console.log('Creating traffic...');
        this.traffic = new Traffic(this.scene, this.environment, this.selectedCharacter ? this.selectedCharacter.name : null);

        console.log('Creating particle system...');
        this.particles = new ParticleSystem(this.scene);

        console.log('Creating vehicle...');
        this.vehicle = new Vehicle(this.scene, (points) => this.addScore(points), this.selectedCharacter, this.selectedBike(), { outfit: this.selectedOutfit() });
        this.vehicle.environment = this.environment; // Pass environment reference for elevation

        // Connect weather system to vehicle
        if (this.weatherSystem) {
            this.vehicle.setWeatherSystem(this.weatherSystem);
        }

        // Initialize vehicle at leg start position
        if (this.environment.route && this.environment.route.unitCount > 0) {
            const startPos = this.tourSystem.getStartingPosition(this.environment.route);
            this.vehicle.position.x = startPos.x;
            this.vehicle.position.y = startPos.y;
            this.vehicle.position.z = startPos.z;
            this.vehicle.yawAngle = startPos.heading;

            // Initialize segment tracking to match the actual spawn point
            // (getStartingPosition spawns a few segments into the leg)
            this.vehicle.findNearestRoadSegment();

            console.log(`Starting at segment ${leg.startSegment}: position (${startPos.x.toFixed(1)}, ${startPos.y.toFixed(1)}, ${startPos.z.toFixed(1)})`);

            // Initialize camera in follow position behind bike
            const normalCameraOffset = this.baseCameraOffset.clone();
            normalCameraOffset.applyEuler(new THREE.Euler(0, this.vehicle.yawAngle, 0));
            const normalCameraPos = this.vehicle.position.clone().add(normalCameraOffset);

            // Position camera in follow position
            this.camera.position.set(normalCameraPos.x, normalCameraPos.y, normalCameraPos.z);
            this.cameraIntroStartPos.copy(normalCameraPos);
            this.cameraIntroEndPos.copy(normalCameraPos);
            this.currentCameraPos.copy(normalCameraPos);
        }

        // Reset game state for new leg
        this.resetRunState();

        // Tag the new scene's textures and vertex colours before the first
        // frame (the periodic scan would show it washed out for a moment)
        this.graphics.fixColorSpaces();

        // Every shader a converted leg will need, compiled with the bike in the scene
        this.prewarmCourse();

        // Classify the freshly built scene for distance culling
        this.setupPerformanceCulling();

        // Start the new leg's loop with a clean timestep accumulator
        this.accumulatedTime = 0;
        if (this.clock) {
            this.clock.getDelta();
        }
        // The first second after a scene build is slow; do not let the
        // adaptive resolution read it as the steady frame rate
        this.lastTime = performance.now();
        this.frameCount = 0;
        // Shaders compile during the first seconds of a leg; frame rates
        // measured then say nothing about the steady state
        this.adaptGraceUntil = performance.now() + 4000;

        // Start leaderboard session (a tuned ride keeps none: markTuned)
        if (this.leaderboardService && !this.rideTuned) {
            this.leaderboardService.startRun(TourSystem.boardId(leg), this.leaderboardExpectation(leg)).then(result => {
                if (result === true) {
                    console.log('Leaderboard session started for leg:', leg.id);
                } else if (result.error) {
                    console.warn('Leaderboard session start failed:', result.message);
                }
            }).catch(error => {
                console.error('Failed to start leaderboard session:', error);
            });
        }
        this.loadSplitReferences(leg);

        console.log('Starting animation loop...');
        // Delay first frame to ensure renderer is fully initialized
        this.animationFrameId = requestAnimationFrame(() => this.animate());
    }

    // The quality ladder (js/quality.js, .agent/system/graphics.md): one table of graphics levels, the level chosen
    // at the start from the device and then stepped by the frame time. A caller fixes a level or releases it to the
    // frame time with this.quality.fix and this.quality.release (the tuning panel of debug mode does, and a graphics
    // menu will)
    startQuality() {
        if (typeof QualityLadder === 'undefined') return;
        const device = Quality.device(window);
        this.quality = new QualityLadder({ start: Quality.startLevel(device), now: performance.now(), apply: (level, index, reason) => this.applyQuality(level, index, reason) });
        this.quality.device = device;
        this.showQuality();
        this.startEffects();
    }

    // Puts a level's settings in force. Each is read where it is drawn, so a change takes effect on the next frame
    applyQuality(level, index, reason) {
        const renderer = this.renderer;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, level.pixelRatio));
        const shadows = level.shadowMap > 0;
        if (renderer.shadowMap.enabled !== shadows) {
            renderer.shadowMap.enabled = shadows;
            // A program has the shadow chunks or not: every material compiles again, once for each change
            this.scene.traverse(o => {
                if (o.material) [].concat(o.material).forEach(m => { m.needsUpdate = true; });
            });
        }
        const light = this.directionalLight;
        if (shadows && light && light.shadow.mapSize.x !== level.shadowMap) {
            light.shadow.mapSize.set(level.shadowMap, level.shadowMap);
            // The map is made again at its new size on the next shadow pass
            if (light.shadow.map) {
                light.shadow.map.dispose();
                light.shadow.map = null;
            }
        }
        if (this.graphics) this.graphics.setQuality({ msaa: level.msaa, bloom: level.bloom });
        // A tube's relief is drawn where the level has a shadow map (Medium and over): a uniform, nothing compiles
        if (typeof TubeShade !== 'undefined') TubeShade.setDetail(level.shadowMap > 0);
        this.treeShare = level.treeShare;
        this.treeNear = level.treeNear;
        if (this.environment && this.environment.isWorld) this.thinTrees(this.environment.sceneryGroup);
        if (reason !== 'start') console.log(`Quality: ${Quality.describe(index, reason === 'fixed')} (${reason})`);
        this.showQuality();
        this.applyEffects();
        // (a level fixed in the stop scene keeps the held shot's raise over it)
        if (this.stopScene && this.stopScene.raised) this.raiseShot();
    }

    // The effects (js/effects.js) and the settings dialog (js/settings.js): the player's choice is read once, and a
    // fixed preset fixes the ladder's level
    startEffects() {
        if (typeof EffectSettings === 'undefined') return;
        let storage = null;
        try {
            storage = window.localStorage;
        } catch (error) {
            console.warn('Effects: no localStorage; the graphics settings last for this page only:', error);
        }
        this.effects = new EffectSettings({ storage });
        if (typeof SettingsDialog !== 'undefined') SettingsDialog.connect(this.settingsControl());
        this.applyGraphicsSettings();
    }

    // A changed choice in force: the preset's ladder level (or Auto) and every effect
    applyGraphicsSettings() {
        if (!this.effects || !this.quality) return;
        const fixed = this.effects.fixedLevel();
        const now = performance.now();
        if (fixed) this.quality.fix(fixed, now);
        else if (this.quality.isFixed) this.quality.release(now);
        this.applyEffects();
        this.showQuality();
    }

    // Each effect at its level in force: under Auto no effect costs more than the ladder level's effectMs
    applyEffects() {
        if (!this.effects || !this.quality || !this.graphics || typeof Effects === 'undefined') return;
        // What the chosen levels need is made first (in the background), so the ladder never waits for it
        Effects.prepare(this, this.effects.chosen);
        Effects.apply(this, this.effectsInForce());
    }

    effectsInForce() {
        const level = Quality.LEVELS[this.quality.level];
        return this.effects.inForce(level.effectMs, effect => Effects.supported(effect, this.graphics, this));
    }

    settingsControl() {
        return {
            settings: this.effects,
            apply: () => this.applyGraphicsSettings(),
            inForce: () => this.effectsInForce(),
            supported: effect => Effects.supported(effect, this.graphics, this),
            sound: () => this.soundManager || null
        };
    }

    // A world's trees drawn to the level's share, the far ones first, and the level's number of near trees
    // (Scenery.rankTrees chooses which). Only what is drawn changes; a tree is never solid
    thinTrees(root) {
        if (!root || !this.environment || !this.environment.scenery || !this.environment.scenery.setTrees) return;
        this.environment.scenery.setTrees(this.treeShare === undefined ? 1 : this.treeShare, this.treeNear);
    }

    // The tuning panel's graphics row: Auto (the frame time) or one level fixed, to test a level by eye. A fixed level
    // is not a tuning: it changes no handling and the ride keeps its time
    qualityControl() {
        return {
            levels: Quality.LEVELS.map(l => l.label),
            get: () => (this.quality.isFixed ? this.quality.level : null),
            level: () => this.quality.level,
            set: (level) => {
                const now = performance.now();
                if (level === null) this.quality.release(now);
                else this.quality.fix(level, now);
                this.showQuality();
            }
        };
    }

    // The level on the HUD of debug mode
    showQuality() {
        if (!this.hud || !this.quality || !this.hud.setQuality) return;
        this.hud.setQuality(Game.debugEnabled(window.location.search) ? Quality.describe(this.quality.level, this.quality.isFixed) : '');
        if (this.tuningPanel && this.tuningPanel.open) this.tuningPanel.refresh();
    }

    // The ladder holds still for `ms` (a ride's start compiles its shaders, a resume follows a pause)
    holdQuality(ms) {
        if (this.quality) this.quality.hold(performance.now(), ms);
    }

    // Every frame: the time since the last frame and the work of the last one (from its start to the end of its draw)
    // go to the ladder. Not while paused, nor in the grace after a scene build, nor through a frame that built much
    // of the world (a tile-load spike says nothing about the steady frame)
    adaptResolution(now) {
        const quality = this.quality;
        const last = this.frameStartedAt;
        this.frameStartedAt = now;
        if (!quality || !this.renderer || this.paused || last === undefined) return;
        if (this.adaptGraceUntil && now < this.adaptGraceUntil) {
            quality.hold(now, this.adaptGraceUntil - now);
            return;
        }
        const streamer = this.environment && this.environment.streamer;
        if (streamer && streamer.stats.frameBuildMs > Quality.RULES.buildMs) {
            quality.hold(now);
            return;
        }
        const drawn = this.graphics ? this.graphics.renderedAt : undefined;
        const work = drawn !== undefined && drawn >= last ? drawn - last : null;
        if (quality.sample(now - last, work, now)) this.showQuality();
    }

    // A converted leg draws new kinds of ground, water and dressing part by
    // part. Every shader it will need is compiled now, at the leg start,
    // from a sample of each part, not on the frame a part first comes into view.
    prewarmCourse() {
        const env = this.environment;
        if (!env || !env.sections || !this.graphics || !this.graphics.renderer) return;
        const putAway = env.warmSections();
        // Weather particles, a hidden floor or a light switched on later down
        // the road each change a program: everything is shown for one compile,
        // and the scene as it stands is compiled too
        const hidden = [];
        try {
            this.graphics.renderer.compile(this.scene, this.camera);
            this.scene.traverse(object => {
                if (!object.visible) {
                    hidden.push(object);
                    object.visible = true;
                }
            });
            this.graphics.renderer.compile(this.scene, this.camera);
        } finally {
            hidden.forEach(object => { object.visible = false; });
            putAway();
        }
    }

    // The weather down the ride changes programs when it comes: its particles are new ones, and the headlight it
    // switches on is a light every lit material is compiled for. Both are compiled now, not on the frame it starts
    // to rain
    prewarmWorldWeather() {
        if (!this.graphics || !this.graphics.renderer) return;
        const shown = [this.headlight, ...Object.values(this.weatherSystem ? this.weatherSystem.systems : {}).map(system => system.points)]
            .filter(object => object && !object.visible);
        shown.forEach(object => { object.visible = true; });
        try {
            this.graphics.renderer.compile(this.scene, this.camera);
        } finally {
            shown.forEach(object => { object.visible = false; });
        }
    }

    // Classify scene meshes for performance: small clutter loses shadow
    // casting (dashes, debris, cone bases...), and everything but the truly
    // large scenery gets distance-culled - fog hides the far course anyway,
    // but without culling every rock/tree/post still costs a draw call
    // Cull at the distance where fog has fully swallowed the scenery. The fog
    // changes along a leg of several looks, so this is read again as it does.
    updateCullDistance() {
        const fogDensity = this.scene.fog ? this.scene.fog.density : 0.0018;
        const cullMax = this.environment && this.environment.config ? this.environment.config.render.cullMax : 600;
        this.cullDistance = Math.min(cullMax, Math.max(250, 2.2 / fogDensity));
    }

    setupPerformanceCulling() {
        this.cullableMeshes = [];
        const playerGroup = this.vehicle ? this.vehicle.group : null;
        const env = this.environment;

        this.scene.traverse(obj => {
            if (!obj.isMesh) return;

            // A converted leg's sections are classified as each is built (classifySection)
            for (let p = obj.parent; p; p = p.parent) {
                if (p.userData && p.userData.section !== undefined) return;
            }

            // The sky dome is a unit sphere at the origin drawn at infinity;
            // by its bounds it looks like a small prop far from the player
            if (obj.userData.isSky || obj.userData.skipCulling) return;

            // Never touch the player bike (its shadow matters up close)
            for (let p = obj; p; p = p.parent) {
                if (p === playerGroup) return;
            }

            if (!obj.geometry.boundingSphere) {
                obj.geometry.computeBoundingSphere();
            }
            if (!obj.geometry.boundingSphere) return;

            const scale = Math.max(Math.abs(obj.scale.x), Math.abs(obj.scale.y), Math.abs(obj.scale.z)) || 1;
            const effectiveRadius = obj.geometry.boundingSphere.radius * scale;

            if (effectiveRadius < 1.2) {
                obj.castShadow = false;
            }
            if (effectiveRadius < 40) {
                this.cullableMeshes.push(obj);
            }
        });

        this.updateCullDistance();
        this.lastCullTime = 0;

        if (env && env.sections) {
            env.sections.forEach(section => section.state === 'built' && this.classifySection(section));
            // Sections built later are classified when they are ready
            env.sectionListeners = env.sectionListeners.filter(listener => listener.owner !== 'culling');
            // A section built during the ride has its colours decoded before it is drawn
            env.sectionListeners.push({ owner: 'culling', ready: section => {
                this.graphics.fixColorSpaces(section.group);
                this.classifySection(section);
            } });
        }

        console.log(`Performance culling: ${this.cullableMeshes.length} cullable meshes, distance ${this.cullDistance.toFixed(0)}`);
    }

    // The cullable meshes of one section of a converted leg, by the rule of
    // setupPerformanceCulling; updatePerformanceCulling walks the visible ones
    classifySection(section) {
        section.cullable = [];
        section.group.traverse(obj => {
            if (!obj.isMesh || obj.userData.skipCulling) return;
            if (!obj.geometry.boundingSphere) obj.geometry.computeBoundingSphere();
            if (!obj.geometry.boundingSphere) return;
            const scale = Math.max(Math.abs(obj.scale.x), Math.abs(obj.scale.y), Math.abs(obj.scale.z)) || 1;
            const radius = obj.geometry.boundingSphere.radius * scale;
            if (radius < 1.2) obj.castShadow = false;
            if (radius < 40) section.cullable.push(obj);
        });
    }

    updatePerformanceCulling() {
        if (!this.cullableMeshes || !this.vehicle) return;

        const now = performance.now();
        if (now - this.lastCullTime < 350) return;
        this.lastCullTime = now;

        const maxDistSq = this.cullDistance * this.cullDistance;
        const px = this.vehicle.position.x;
        const pz = this.vehicle.position.z;

        const cull = (mesh) => {
            const pos = mesh.getWorldPosition(this.tempVector);
            const dx = pos.x - px;
            const dz = pos.z - pz;
            mesh.visible = (dx * dx + dz * dz) < maxDistSq;
        };
        this.cullableMeshes.forEach(cull);
        // A converted leg: only the sections in the drawn window
        if (this.environment && this.environment.sections) {
            this.environment.visibleSections().forEach(section => section.cullable && section.cullable.forEach(cull));
        }
    }

    // Free GPU resources (geometries, materials, textures) for a removed subtree.
    // Without this, every leg change/restart leaks WebGL buffers until reload.
    disposeObject(root) {
        root.traverse(obj => {
            if (obj.geometry) {
                obj.geometry.dispose();
            }
            // Releases the per-instance matrix and colour buffers
            if (obj.isInstancedMesh) {
                obj.dispose();
            }
            const materials = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
            materials.forEach(material => {
                Object.values(material).forEach(value => {
                    if (value && value.isTexture) {
                        value.dispose();
                    }
                });
                material.dispose();
            });
        });
    }

    // Per-run state. Every way of starting a run (new leg, restart button,
    // R key) goes through here so none of them can leave a stale checkpoint,
    // combo or timer behind.
    resetRunState() {
        this.closeWorldConfirm();
        this.score = 0;
        this.worldCrash = null;
        this.worldCrashStreak = 0;
        this.worldSinceRestartS = Infinity;
        this.redLightsPaid = null;
        this.combo = 0;
        this.comboMultiplier = 1;
        this.checkpointsPassed = 0;
        this.lastCheckpointIndex = -1;
        this.checkpointTimes = [];
        this.lastCheckpointPosition = null;
        this.lastCheckpointSegment = null;
        this.lastCheckpointHeading = 0;
        this.speedStreakTime = 0;
        this.lastSpeedCheck = 0;
        this.wasJumping = false;
        this.lastJumpState = false;
        this.brakeHeldTime = 0;
        this.finished = false;
        this.paused = false;
        this.startTime = this.now();
        this.penaltyMs = 0;
        this.restarts = 0;
        if (this.vehicle) {
            this.vehicle.finished = false;
        }
        if (this.environment && this.environment.checkpoints) {
            this.environment.checkpoints.forEach(cp => { cp.passed = false; });
        }
        this.firstInputAt = NaN;
        if (this.hud) {
            const leg = this.tourSystem && this.tourSystem.getCurrentLeg();
            const index = leg ? this.tourSystem.getCurrentLegIndex() : -1;
            const world = this.environment && this.environment.isWorld;
            this.hud.startRun(world ? HudRules.stageLabel(1, this.worldStageCount(), this.worldStageName(0)) : leg ? `Leg ${index + 1} · ${leg.name}` : '');
            this.shownWorldStage = null;
            this.shownWorldGates = null;
            // (before the count: a world's count stands on its progress bar, a leg's on its pips)
            if (world && !this.freeRoam) this.showWorldStage();
            else this.hud.hideProgress();
            this.hud.setGates(0, this.gateTotal());
        }
        this.hideSplit();
        this.updateScoreDisplay();
    }

    gateTotal() {
        return this.environment && this.environment.checkpoints ? this.environment.checkpoints.length : 0;
    }

    // The one clock of a run. Every read of race time goes through here so a
    // probe can step it.
    now() {
        return performance.now();
    }

    // A converted leg has a row in the server's table of boards (js/course.js):
    // protocol 2, the finish-line time ranks. Every other leg is protocol 1.
    isTableBoard(leg) {
        return Object.prototype.hasOwnProperty.call(Course.boardTable(), TourSystem.boardId(leg));
    }

    // What the built leg expects of the server before a time is sent
    leaderboardExpectation(leg) {
        return { protocol: this.isTableBoard(leg) ? 2 : 1, gates: this.gateTotal() };
    }

    // The time the online board ranks: the finish line on a converted leg,
    // the last gate on the others
    boardTimeMs(leg) {
        return this.isTableBoard(leg) ? Math.round(this.finishTime) : this.checkpointTimes[this.gateTotal() - 1];
    }

    removeRunOverlays() {
        ['finishBanner', 'crashNotification'].forEach(id => {
            const element = document.getElementById(id);
            if (element) Modals.close(element);
        });
        document.body.classList.remove('run-over');
        if (this.input) {
            this.input.setMenuActive(false);
        }
    }

    // A world ride is one long run. A full restart or Menu asks before it throws the ride away; `proceed` runs
    // on yes, and Cancel leaves the ride, its clock and the sessions as they were. A finished ride has
    // nothing to lose, so it goes straight on. Returns true when it asked.
    // The race is paused while the box is open, so the answer is about the ride as it stood when it asked:
    // a late YES cannot throw away a ride that went on. Enter answers YES and Escape answers CANCEL.
    // It opens on the stack (js/modals.js), so it is on top of the crash dialog or the pause panel that asked it,
    // and the one below comes back on Cancel.
    confirmWorldLeave(text, proceed) {
        if (!this.environment || !this.environment.isWorld || this.finished) {
            proceed();
            return false;
        }
        if (this.worldConfirm) return true;
        const box = document.createElement('div');
        box.id = 'worldConfirm';
        box.className = 'world-confirm';
        box.setAttribute('role', 'alertdialog');
        const message = document.createElement('p');
        message.textContent = text;
        const yes = document.createElement('button');
        yes.id = 'worldConfirmYes';
        yes.className = 'finish-btn primary';
        yes.dataset.key = 'Enter,NumpadEnter';
        yes.textContent = 'YES';
        const no = document.createElement('button');
        no.id = 'worldConfirmNo';
        no.className = 'finish-btn secondary';
        no.dataset.key = 'Escape';
        no.textContent = 'CANCEL';
        box.append(message, yes, no);
        const answer = (go) => {
            this.closeWorldConfirm();
            if (go) proceed();
        };
        yes.addEventListener('click', () => answer(true));
        no.addEventListener('click', () => answer(false));
        // A pause the rider already took stays theirs; the box resumes only the pause it took
        const ownsPause = !this.paused;
        if (ownsPause) this.pauseRace({ panel: false });
        this.worldConfirm = { box, ownsPause };
        Modals.open(box, { focus: yes });
        return true;
    }

    // Takes the confirm box down and gives back the pause it took. Every restart calls it, so no box
    // outlives the ride it asked about. Keys pressed while it held the race are dropped, not replayed.
    closeWorldConfirm() {
        const open = this.worldConfirm;
        if (!open) return;
        this.worldConfirm = null;
        Modals.close(open.box);
        if (this.input && this.input.clearActions) this.input.clearActions();
        if (open.ownsPause) this.resumeRace();
    }

    // The race clock stops while paused: raceElapsed reads pauseStartedAt, and resume moves the start on
    // `panel`: false for a pause another box owns (the world confirm box)
    pauseRace({ panel = true } = {}) {
        if (this.paused) return;
        this.paused = true;
        this.pauseStartedAt = this.now();
        if (this.soundManager) this.soundManager.stopEngineSound();
        // The pause panel holds Resume, Menu and the data credits (js/world/credits.js); it is the way to the menu
        // in the middle of a ride
        if (panel && this.hud) this.hud.recallHint(true);
        if (panel && this.environment && typeof WorldCredits !== 'undefined') WorldCredits.showPause(this.environment, () => this.resumeRace(), () => this.leaveToMenu(), this.environment.isWorld ? () => this.restartFromPause() : null, this.vehicle ? this.vehicle.speed : 0, this.freeRoam && typeof FastTravel !== 'undefined' ? () => this.openTravel() : null, this.freeRoam && typeof PhotoMode !== 'undefined' ? () => this.openPhoto() : null);
    }

    // Restart leg from the pause panel of a world ride (a world crash opens no card to offer it): it asks first, and
    // Yes takes the pause panel down with the ride it belonged to
    restartFromPause() {
        this.confirmWorldLeave(this.worldRestartAsk(), () => {
            this.resumeRace();
            this.restartLeg();
        });
    }

    // Menu from the pause panel: a world ride asks first (confirmWorldLeave), a leg goes
    leaveToMenu() {
        if (this.environment && this.environment.isWorld) this.confirmWorldLeave(Game.WORLD_MENU_ASK, () => this.returnToMenu());
        else this.returnToMenu();
    }

    resumeRace() {
        if (!this.paused) return;
        this.paused = false;
        if (this.hud) this.hud.recallHint(false);
        if (typeof WorldCredits !== 'undefined') WorldCredits.hidePause();
        if (this.pauseStartedAt) {
            // Time spent paused is not race time
            this.startTime += this.now() - this.pauseStartedAt;
            this.pauseStartedAt = 0;
        }
        // The first frames after a pause say nothing about the ride's frame rate
        if (typeof Quality !== 'undefined') this.holdQuality(Quality.RULES.spikeGraceMs);
    }

    worldRestartAsk() {
        return this.environment.stage
            ? 'Restart the stage from its start? Your ride so far is lost.'
            : 'Restart the tour from Altdorf? Your ride so far is lost.';
    }

    // Put the bike back on the start line of the current leg
    restartLeg() {
        this.closeWorldConfirm();
        this.removeRunOverlays();

        this.vehicle.reset();
        if (this.environment.route && this.environment.route.unitCount > 0) {
            const startPos = this.environment.isWorld ? this.environment.startPosition() : this.tourSystem.getStartingPosition(this.environment.route);
            this.vehicle.position.set(startPos.x, startPos.y, startPos.z);
            this.vehicle.yawAngle = startPos.heading;
            // Re-sync segment tracking with the teleported position so the
            // windowed wall/elevation searches don't use a stale index
            this.vehicle.findNearestRoadSegment();
            this.vehicle.updateMesh();
        }
        if (this.cones) this.cones.reset();
        if (this.traffic && this.traffic.reset) {
            this.traffic.reset();
        }
        this.resetRunState();
        if (this.environment.isWorld) {
            // Free roam rides again from its own start (the menu's Start at), the crew (made again) behind it (travelTo)
            if (this.freeRoam && this.roam) {
                if (this.traffic && this.traffic.group) this.traffic.group.playerPlace = null;
                this.travelTo(FreeRoam.startFor(this.environment, (this.rideMode && this.rideMode.start) || GameModes.startAt), false);
            }
            this.armWorldStart();
            this.environment.guide.reset();
        }
        this.restartLeaderboardSession();

        const dashboard = document.querySelector('.dashboard');
        if (dashboard) {
            dashboard.style.opacity = '1';
        }
    }

    // Scene objects that outlive a leg: camera, lights and the sky dome
    persistentSceneObjects() {
        const keep = new Set([
            this.camera,
            this.ambientLight, this.hemisphereLight, this.fillLight, this.rimLight,
            this.graphics ? this.graphics.skyMesh : null
        ]);
        [this.directionalLight, this.distantLight, this.headlight].forEach(light => {
            if (light) {
                keep.add(light);
                keep.add(light.target);
            }
        });
        return keep;
    }

    cleanupCurrentLeg() {
        // Stop game loop
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }

        // Stop sounds
        if (this.soundManager) {
            this.soundManager.stopEngineSound();
        }

        // The pause panel belongs to the ride being torn down
        if (typeof WorldCredits !== 'undefined') WorldCredits.hidePause();
        this.paused = false;

        // A world owns DOM beside the scene (the guide and its map) and the streamer's buffers
        if (this.environment && this.environment.isWorld) {
            this.environment.dispose();
            this.camera.far = 5000;
            this.camera.updateProjectionMatrix();
            this.graphics.setHorizonSpan(Graphics.HORIZON_SPAN);
        }

        // Clear scene objects (keep camera and lights)
        if (this.scene) {
            const keep = this.persistentSceneObjects();
            const objectsToRemove = this.scene.children.filter(child => !keep.has(child));
            objectsToRemove.forEach(obj => {
                this.scene.remove(obj);
                this.disposeObject(obj);
            });
        }

        // Drop stale cull references from the removed scene
        this.cullableMeshes = null;

        // Tear down rockfall hazards
        if (this.rockfalls) {
            this.rockfalls.dispose();
            this.rockfalls = null;
        }

        // Reset game state
        this.finished = false;
        this.score = 0;
        this.redLightsPaid = null;
        this.checkpointsPassed = 0;
        this.combo = 0;
        this.comboMultiplier = 1;

        console.log('Cleaned up current leg');
    }

    // options.riderId opens the rider screen on that rider (a new unlock)
    // instead of the track screen
    returnToMenu(options = {}) {
        console.log('Returning to menu...');

        // A world has no leg menu: it goes back to the page without ?world. It starts no session, so there is
        // none to cancel
        if (this.environment && this.environment.isWorld) {
            window.location.assign(window.location.pathname);
            return;
        }

        // Remove finish banner if exists
        const finishBanner = document.getElementById('finishBanner');
        if (finishBanner) {
            Modals.close(finishBanner);
        }

        // Remove crash notification if exists
        const crashNotification = document.getElementById('crashNotification');
        if (crashNotification) {
            Modals.close(crashNotification);
        }

        // Cleanup current leg
        this.cleanupCurrentLeg();

        // Show leg selector
        if (options.riderId) {
            this.tourSystem.showRiderSelector(options.riderId);
        } else {
            this.tourSystem.showLegSelector();
        }

        // Hide dashboard
        const dashboard = document.querySelector('.dashboard');
        if (dashboard) {
            dashboard.style.opacity = '0';
        }

        console.log('Returned to menu');
    }

    startNextLeg() {
        const nextLeg = this.tourSystem.getNextLeg();
        if (!nextLeg) {
            console.error('No next leg available');
            return;
        }

        // Make it the tour's current leg - getStartingPosition() and
        // getCurrentLegIndex() read tourSystem.currentLeg, and a stale value
        // spawns the bike at the previous leg's start, off the new leg's road
        this.tourSystem.selectLeg(nextLeg.id);

        console.log(`Starting next leg: ${nextLeg.name}`);

        // Remove finish banner
        const finishBanner = document.getElementById('finishBanner');
        if (finishBanner) {
            Modals.close(finishBanner);
        }

        // Cleanup current leg
        this.cleanupCurrentLeg();

        // Initialize next leg
        this.initializeGameWithLeg(nextLeg);

        // Show dashboard
        const dashboard = document.querySelector('.dashboard');
        if (dashboard) {
            dashboard.style.opacity = '1';
        }

        console.log('Next leg started');
    }

    startFirstLeg() {
        const firstLeg = this.tourSystem.getFirstLeg();
        if (!firstLeg) {
            console.error('No first leg available');
            return;
        }

        // Select it so getStartingPosition()/getCurrentLegIndex() match the
        // leg being initialized (restarting the tour from leg 8 otherwise
        // spawns the bike at leg 8's start on leg 1's road)
        this.tourSystem.selectLeg(firstLeg.id);

        console.log(`Starting first leg: ${firstLeg.name}`);

        // Remove finish banner
        const finishBanner = document.getElementById('finishBanner');
        if (finishBanner) {
            Modals.close(finishBanner);
        }

        // Cleanup current leg
        this.cleanupCurrentLeg();

        // Initialize first leg
        this.initializeGameWithLeg(firstLeg);

        // Show dashboard
        const dashboard = document.querySelector('.dashboard');
        if (dashboard) {
            dashboard.style.opacity = '1';
        }

        console.log('First leg started (tour restart)');
    }

    isWebGLAvailable() {
        try {
            const canvas = document.createElement('canvas');
            return !!(window.WebGLRenderingContext && 
                     (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
        } catch(e) {
            return false;
        }
    }
    
    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(255, 0, 0, 0.9);
            color: white;
            padding: 20px;
            border-radius: 10px;
            font-family: monospace;
            font-size: 14px;
            max-width: 80%;
            z-index: 10000;
            white-space: pre-wrap;
            word-wrap: break-word;
        `;
        errorDiv.textContent = message;
        document.body.appendChild(errorDiv);
    }
    
    init() {
        this.scene = new THREE.Scene();
        
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            powerPreference: 'high-performance'
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.shadowMap.autoUpdate = true;
        this.renderer.toneMappingExposure = 0.8;
        document.body.appendChild(this.renderer.domElement);

        // Sky, image-based lighting and HDR post-processing
        this.graphics = new Graphics(this.renderer, this.scene);

        // The post-processing pass blurs the screen edges at speed. Without
        // it (no float render targets), fall back to a CSS overlay.
        if (!this.graphics.postEnabled) {
            // Peripheral speed-streak overlay. NOTE: this deliberately avoids
            // backdrop-filter - blurring a full-resolution canvas costs 10ms+ of
            // GPU per frame. A static streaky radial gradient composites for free
            // and still sells the speed at the edges of the view.
            this.speedBlurOverlay = document.createElement('div');
            this.speedBlurOverlay.id = 'speedBlurOverlay';
            this.speedBlurOverlay.style.cssText = `
                position: fixed;
                inset: 0;
                pointer-events: none;
                z-index: 5;
                background:
                    repeating-conic-gradient(from 0deg at 50% 50%,
                        rgba(255,255,255,0) 0deg 5deg,
                        rgba(235,240,255,0.055) 5.6deg 6.4deg,
                        rgba(255,255,255,0) 7deg 12deg),
                    radial-gradient(ellipse at center,
                        rgba(200,215,235,0) 42%,
                        rgba(205,220,240,0.10) 70%,
                        rgba(215,228,245,0.16) 100%);
                -webkit-mask-image: radial-gradient(ellipse at center, transparent 38%, black 80%);
                mask-image: radial-gradient(ellipse at center, transparent 38%, black 80%);
                opacity: 0;
                display: none;
            `;
            document.body.appendChild(this.speedBlurOverlay);
        }
        this.lastBlurOpacity = '0';
        
        window.addEventListener('resize', () => this.onWindowResize());
    }

    setupScene() {
        // Atmospheric mountain scene with warm lighting
        this.scene.background = new THREE.Color(0xb8d4e8);
        // Enhanced fog with warmer tone for golden hour atmosphere
        this.scene.fog = new THREE.FogExp2(0xc8dae8, 0.0018);
    }

    // Size the sun's shadow box for the leg: wide canyon walls need more
    applyShadowBox(render) {
        this.appliedShadowSpan = render.shadowSpan;
        // The sun's box is the near cascade's while the shadow cascades are on (js/effects.js)
        const half = (typeof Cascades !== 'undefined' ? Cascades.nearSpan(render.shadowSpan) : render.shadowSpan) / 2;
        const shadow = this.directionalLight.shadow.camera;
        shadow.left = -half;
        shadow.right = half;
        shadow.top = half;
        shadow.bottom = -half;
        shadow.far = Math.max(300, render.shadowSpan * 2);
        shadow.updateProjectionMatrix();
    }

    setupLighting() {
        // Ambient light
        this.ambientLight = new THREE.AmbientLight(0x303030, 0.25);
        this.scene.add(this.ambientLight);

        // Hemisphere light for natural sky/ground lighting
        this.hemisphereLight = new THREE.HemisphereLight(0x8ab8d6, 0x2a3f2a, 0.3);
        this.scene.add(this.hemisphereLight);

        // Directional light (sun) with warmer color for golden hour feel
        this.directionalLight = new THREE.DirectionalLight(0xfff4e6, 0.85);
        this.directionalLight.position.set(50, 80, 0);
        this.directionalLight.castShadow = true;
        this.directionalLight.shadow.mapSize.width = 2048;
        this.directionalLight.shadow.mapSize.height = 2048;
        this.directionalLight.shadow.camera.near = 0.1;
        this.directionalLight.shadow.camera.far = 300;
        this.directionalLight.shadow.camera.left = -60;
        this.directionalLight.shadow.camera.right = 60;
        this.directionalLight.shadow.camera.top = 60;
        this.directionalLight.shadow.camera.bottom = -60;
        // A low sun grazes the road: without a normal offset the surface
        // shadows itself in stripes
        this.directionalLight.shadow.bias = -0.0004;
        this.directionalLight.shadow.normalBias = 0.06;
        this.scene.add(this.directionalLight);
        
        // Store initial light offset from origin
        this.lightOffset = this.directionalLight.position.clone();
        
        // Secondary directional light for distant fill (shadows disabled - a
        // second full shadow pass per frame is too expensive for the subtle
        // distant shadows it added, especially on mobile)
        this.distantLight = new THREE.DirectionalLight(0xffffff, 0.2);
        this.distantLight.position.set(50, 80, 0);
        this.distantLight.castShadow = false;
        this.scene.add(this.distantLight);

        // Fill light from opposite side with cool blue tone
        this.fillLight = new THREE.DirectionalLight(0xe6f2ff, 0.15);
        this.fillLight.position.set(-50, 30, 0);
        this.scene.add(this.fillLight);

        // Rim light for vehicle highlighting
        this.rimLight = new THREE.DirectionalLight(0xfff8e1, 0.25);
        this.rimLight.position.set(0, 10, -50);
        this.scene.add(this.rimLight);

        // Bike headlight: one wide, soft-edged beam, and the only thing the bike's lamp draws (a glowing cone in the
        // air in front of the lamp read as a second light). It is switched off
        // entirely in daylight (see setTimeOfDay): a spot light costs every
        // lit fragment in the scene whether or not its beam shows.
        // It falls off with the square of its reach, so the road ahead is lit and
        // a white house front 60 m away is not lit as brightly as the tarmac
        // under the wheel (a near-flat falloff blew distant walls out into halos)
        this.headlight = new THREE.SpotLight(0xfff1d6, 0, 120, 0.52, 0.65, 2);
        this.headlight.castShadow = false;
        this.headlight.visible = false;
        this.scene.add(this.headlight);
    }

    // A time of day, in clear air, and nothing else: the road, the particles, the
    // height fog and the far ring stay as they are. The override holds until the
    // next snapAtmosphere; applyAtmosphere leaves the time of day alone while it does.
    setTimeOfDay(timeKey) {
        const config = this.timeConfigs[timeKey];
        if (!config) {
            console.error('Invalid time of day:', timeKey);
            return;
        }

        console.log('Switching to:', config.name);
        this.writeTime(this.resolveTime(timeKey, 'clear'));
        // Sky dome, far ranges and reflections follow the time of day
        this.graphics.setTimeOfDay(timeKey, config);
        this.atmosphereHold = true;
    }

    // The light of a time of day under a weather, as plain values, the same
    // object every time for the same arguments. Under cloud the sun or moon is
    // hidden: most of its light arrives scattered from the whole sky. (A
    // full-strength hidden sun also put a hard white reflection on the wet road.)
    resolveTime(timeKey, weatherType) {
        const config = this.timeConfigs[timeKey];
        const world = !!(this.environment && this.environment.isWorld);
        const cache = this.timeCache || (this.timeCache = new Map());
        const cacheKey = `${timeKey}|${weatherType}|${world ? 'world' : 'leg'}`;
        if (cache.has(cacheKey)) return cache.get(cacheKey);

        const overcast = weatherType === 'rain' || weatherType === 'snow';
        const hazy = weatherType === 'fog';
        // A world's rain cloud hides the sun more: at a quarter it still put a glint on the wet road
        const direct = overcast ? (world ? Game.WORLD_OVERCAST_SUN : 0.25) : hazy ? 0.6 : 1;
        // A world rider switches the headlight on in rain or snow, by day too; a leg keeps the time's own
        const headlight = Math.max(config.headlight || 0, world && overcast ? Game.WORLD_OVERCAST_HEADLIGHT : 0);
        const values = {
            key: timeKey,
            skyColor: config.skyColor,
            fogColor: config.fogColor,
            ambientColor: config.ambientColor,
            ambientIntensity: config.ambientIntensity,
            hemisphereTop: config.hemisphereTop,
            hemisphereBottom: config.hemisphereBottom,
            hemisphereIntensity: config.hemisphereIntensity * (overcast ? (world ? Game.WORLD_OVERCAST_SKY : 1.35) : hazy ? 1.15 : 1),
            sunColor: config.sunColor,
            sunIntensity: config.sunIntensity * direct,
            distantIntensity: config.sunIntensity * 0.25 * direct,
            // Low at dawn/sunset for long dramatic shadows, high at midday-ish times
            sunOffset: config.sunOffset || { x: 50, y: 80 },
            // Per-time exposure - darker nights/twilights, brighter days
            exposure: config.exposure,
            fillColor: config.fillColor,
            // The fill is a second sun: under a world's rain cloud it goes with the sun, or it glints on the wet road
            fillIntensity: config.fillIntensity * (world && overcast ? Game.WORLD_OVERCAST_SUN : 1),
            rimColor: config.rimColor,
            rimIntensity: config.rimIntensity,
            // Headlight only when it is dark enough to see the beam
            headlight
        };
        cache.set(cacheKey, values);
        return values;
    }

    // The light between two resolved times, `t` of the way to `b`; reused `out`
    blendTime(a, b, t, out = this.timeBlend || (this.timeBlend = { sunOffset: { x: 0, y: 0 } })) {
        const number = (x, y) => x + (y - x) * t;
        const colour = (x, y) => AtmosphereTrack.lerpHex(x, y, t);
        out.key = t < 0.5 ? a.key : b.key;
        ['skyColor', 'fogColor', 'ambientColor', 'hemisphereTop', 'hemisphereBottom', 'sunColor', 'fillColor', 'rimColor']
            .forEach(name => { out[name] = colour(a[name], b[name]); });
        ['ambientIntensity', 'hemisphereIntensity', 'sunIntensity', 'distantIntensity', 'fillIntensity', 'rimIntensity', 'headlight']
            .forEach(name => { out[name] = number(a[name], b[name]); });
        out.sunOffset.x = number(a.sunOffset.x, b.sunOffset.x);
        out.sunOffset.y = number(a.sunOffset.y, b.sunOffset.y);
        out.exposure = a.exposure !== undefined && b.exposure !== undefined ? number(a.exposure, b.exposure) : (t < 0.5 ? a.exposure : b.exposure);
        return out;
    }

    // Write resolved light to the scene: colours into the existing objects
    writeTime(values) {
        this.timeOfDay = values.key;

        this.scene.background.setHex(values.skyColor);
        this.scene.fog.color.setHex(values.fogColor);

        this.ambientLight.color.setHex(values.ambientColor);
        this.ambientLight.intensity = values.ambientIntensity;

        this.hemisphereLight.color.setHex(values.hemisphereTop);
        this.hemisphereLight.groundColor.setHex(values.hemisphereBottom);
        this.hemisphereLight.intensity = values.hemisphereIntensity;

        // Sun or moon
        this.directionalLight.color.setHex(values.sunColor);
        this.directionalLight.intensity = values.sunIntensity;
        this.baseSunIntensity = values.sunIntensity;

        // Shadowless companion of the sun: same colour, a quarter of its strength
        this.distantLight.color.setHex(values.sunColor);
        this.distantLight.intensity = values.distantIntensity;

        // Used by the per-frame light-follow code
        this.sunOffset = values.sunOffset;

        if (this.renderer && values.exposure !== undefined) {
            this.renderer.toneMappingExposure = values.exposure;
        }

        this.fillLight.color.setHex(values.fillColor);
        this.fillLight.intensity = values.fillIntensity;

        this.rimLight.color.setHex(values.rimColor);
        this.rimLight.intensity = values.rimIntensity;

        this.headlightStrength = values.headlight;
        this.headlight.visible = this.headlightStrength > 0;
        this.headlight.intensity = this.headlightStrength * 10;
    }

    // Write the atmosphere at a segment all at once: no blending in time, a
    // forced bake of the reflections. For a leg start, a restart, the menu
    // preview and the rider showcase. `target` names what the snap may write
    // beyond the light and sky: { environment, weatherSystem }, either of
    // which may be null. With no weather system nothing is written to the
    // particles or the scene fog density.
    snapAtmosphere(track, segment, target = {}) {
        this.atmosphereHold = false;
        const sample = track.sample(segment, this.atmosphereSample || (this.atmosphereSample = {}));
        this.writeAtmosphere(sample, target, true);
        this.atmosphereWritten = { a: sample.a, t: sample.t };
    }

    // Once per rendered frame, before graphics.update. On a part, the far ring
    // is the only thing that moves. Inside a blend zone the light, sky, road
    // surface, particles and fog blend with the road position; the first frame
    // after a zone writes the part's own values.
    applyAtmosphere() {
        const track = this.atmosphereTrack;
        if (!track || !this.vehicle) return;
        const scratch = this.atmosphereSample || (this.atmosphereSample = {});
        const route = this.environment.route;
        const sample = track.sample(this.environment.isWorld ? this.vehicle.routeS / AtmosphereTrack.WORLD_UNIT_M : route.toUnits(this.vehicle.routeS || 0), scratch);
        const written = this.atmosphereWritten;
        const settled = sample.t === 0 && written && written.t === 0 && written.a === sample.a;

        if (this.atmosphereHold || settled) {
            // Only the ring depends on where the rider is within a part
            this.graphics.setRingStrength(AtmosphereTrack.ringAt(sample.a.ring, sample.ua));
            return;
        }

        // A blend moves with the bike, not in steps of one segment
        track.sample(this.roadPosition(), scratch);
        this.writeAtmosphere(sample, {
            environment: this.environment,
            weatherSystem: this.weatherSystem || null
        }, false);
        this.atmosphereWritten = { a: sample.a, t: sample.t };
        this.applySectionLook(this.atmosphereLook);
    }

    // Where progress s sits on the atmosphere track: route units on a leg, 100 m units in a world
    atmosphereUnit(s) {
        return this.environment.isWorld ? s / AtmosphereTrack.WORLD_UNIT_M : this.environment.route.toUnits(s);
    }

    // Where the bike is along the road, in fractional segments: the segment it
    // is nearest to, and how far it has passed along the line to the next
    roadPosition() {
        const route = this.environment && this.environment.route;
        if (this.environment.isWorld) return this.atmosphereUnit(this.vehicle.projection.s ?? this.vehicle.routeS ?? 0);
        const at = this.vehicle.position;
        const segment = route ? route.toUnits(this.vehicle.routeS || 0) : 0;
        if (!route || !at) return segment;
        for (const start of [segment, segment - 1]) {
            const from = route.pointAtUnit(start);
            const to = route.pointAtUnit(start + 1);
            if (!from || !to) continue;
            const dx = to.x - from.x;
            const dz = to.z - from.z;
            const along = ((at.x - from.x) * dx + (at.z - from.z) * dz) / (dx * dx + dz * dz);
            if (along >= 0 && along <= 1) return start + along;
        }
        return segment;
    }

    // The sample's look in the scene: the sky, light, fog, road surface and particles
    writeAtmosphere(sample, target, snap) {
        const { a, b, t } = sample;
        const look = AtmosphereTrack.blendLook(sample, this.atmosphereLook || (this.atmosphereLook = {}));

        // Ring strength and height fog first: the sky reads the ring
        const atmosphere = look.heightFog || look.shafts > 0 ? { heightFog: look.heightFog, shafts: look.shafts } : null;
        this.graphics.setAtmosphere(atmosphere, { ring: look.ring }, look.baseY);

        // Time values, then the sky
        const timeA = this.resolveTime(a.timeOfDay, a.weather);
        const skyA = this.graphics.resolveSky(a.timeOfDay, a.weather, this.timeConfigs[a.timeOfDay]);
        if (t === 0) {
            this.writeTime(timeA);
            this.graphics.writeSky(skyA, 0);
        } else {
            this.writeTime(this.blendTime(timeA, this.resolveTime(b.timeOfDay, b.weather), t));
            this.graphics.writeSky(this.graphics.blendSky(skyA, this.graphics.resolveSky(b.timeOfDay, b.weather, this.timeConfigs[b.timeOfDay]), t), t);
        }
        // A snap, and the first write of a part's own look, bake at once; a blend is paced
        if (snap || t === 0) this.graphics.environmentDirty = true;
        else this.graphics.requestRebake();

        const { environment, weatherSystem } = target;
        if (environment) {
            if (snap) {
                // The one-time tint of ground and mountains, with the road surface
                const near = t < 0.5 ? a : b;
                environment.applyWeatherVisuals(near.weather, near.weatherIntensity);
            }
            if (t > 0) environment.writeRoadSurface(this.blendRoadSurface(environment, a, b, t));
            else if (!snap) environment.writeRoadSurface(environment.resolveRoadSurface(a.weather, a.weatherIntensity));
        }

        if (weatherSystem) {
            const mix = AtmosphereTrack.weatherMix(sample, this.weatherMix || (this.weatherMix = {}));
            mix.fogDensity = look.fogDensity;
            mix.baseY = look.baseY;
            weatherSystem.setMix(mix);
        }
    }

    // The road surface between the looks of two parts
    blendRoadSurface(environment, a, b, t) {
        const from = environment.resolveRoadSurface(a.weather, a.weatherIntensity);
        const to = environment.resolveRoadSurface(b.weather, b.weatherIntensity);
        const out = this.roadBlend || (this.roadBlend = {});
        // Every value the environment's surface has: a leg's roughness, metalness, reflection and colour, a world's wetness
        for (const key in from) out[key] = key === 'color' ? AtmosphereTrack.lerpHex(from.color, to.color, t) : from[key] + (to[key] - from[key]) * t;
        return out;
    }

    // What follows from the part the rider is in: the shadow box, and the
    // distance at which the fog has swallowed the scenery
    applySectionLook(look) {
        if (look.shadowSpan !== undefined && look.shadowSpan !== this.appliedShadowSpan) {
            this.applyShadowBox({ shadowSpan: look.shadowSpan });
        }
        this.updateCullDistance();
    }

    showTimeOfDayNotification(timeName) {
        showCallout(timeName, 'info', 2000);
    }

    setupCamera() {
        // (near 0.25: a 0.1 near plane wastes most of the depth precision and
        // distant coplanar surfaces flicker)
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.25, 5000);
        
        // Initial camera position - start in follow position
        this.camera.position.set(0, 4, -10); // Behind bike
        this.camera.lookAt(0, 1, 0); // Look at bike center, not ground
        
        // Camera intro animation disabled - start directly in follow position
        this.cameraIntroActive = false;
        this.cameraIntroStartTime = performance.now();
        this.cameraIntroDuration = 1800;
        this.cameraIntroStartPos = new THREE.Vector3(0, 4, -10);
        this.cameraIntroEndPos = new THREE.Vector3(0, 4, -10);
        
        // Camera mode system - modes carry a `type` so behavior isn't tied to
        // array order: 'follow' (chase cams), 'onboard' (close rider cam),
        // 'helmet' (true first-person)
        this.cameraModes = [
            { name: 'Onboard', type: 'onboard', offset: new THREE.Vector3(0, 1.2, 0.5), lerpFactor: 0.18 },
            { name: 'Helmet Cam', type: 'helmet', offset: new THREE.Vector3(0, 1.15, 0.35), lerpFactor: 1.0 },
            { name: 'Standard', type: 'follow', offset: new THREE.Vector3(0, 3, -6), lerpFactor: 0.10 },
            { name: 'High View', type: 'high', offset: new THREE.Vector3(0, 8, -12), lerpFactor: 0.08 }
        ];

        // Restore the persisted view (defaults to Onboard)
        const savedMode = parseInt(localStorage.getItem('twistyCameraMode'), 10);
        this.cameraMode = (savedMode >= 0 && savedMode < this.cameraModes.length) ? savedMode : 0;

        // Dynamic camera offset for mountain roads
        this.baseCameraOffset = this.cameraModes[this.cameraMode].offset.clone();
        this.cameraOffset = this.baseCameraOffset.clone();
        this.cameraTarget = new THREE.Vector3();
        this.currentCameraPos = this.camera.position.clone();
        this.currentLookTarget = new THREE.Vector3(0, 1, 0);

        // Reusable objects for camera updates to avoid GC pressure
        this.tempMatrix = new THREE.Matrix4();
        this.tempVector = new THREE.Vector3();
        this.tempUpVector = new THREE.Vector3();
        this.cameraLerpFactor = this.cameraModes[this.cameraMode].lerpFactor;
        this.cameraLateralOffset = 0; // Track lateral offset for smooth side movement
        this.previousYawAngle = 0; // Track yaw changes for lateral movement
        
        // Camera banking state - persists across frames to prevent jumps
        this.currentCameraBanking = 0;
        
        console.log('Camera setup complete - starting intro animation');
    }

    // True first-person view: camera pinned to the rider's head. The head is
    // rigidly attached to the bike's orientation (yaw, wheelie/jump pitch, and
    // lean roll), with a touch of extra rider lean-in toward the corner - so
    // the world's horizon tilts as the bike lays into a turn.
    updateHelmetCamera(vehiclePos, adjLerp) {
        const speedRatio = this.vehicle.speed / this.vehicle.maxSpeed;

        // Bike pitch: nose-up during wheelies, flip rotation during jumps
        let bikePitch = 0;
        if (this.vehicle.isJumping) {
            bikePitch = this.vehicle.jumpRotation;
        } else if (this.vehicle.isWheelie) {
            bikePitch = -this.vehicle.wheelieAngle;
        }

        // Head roll: the bike's lean plus the rider hanging slightly INTO the
        // corner (same sign convention as the bike mesh, group.rotation.z)
        const leanIn = THREE.MathUtils.clamp(this.vehicle.leanAngle * 0.2, -0.15, 0.15);
        const targetRoll = this.vehicle.leanAngle + leanIn;
        // Light smoothing so engine vibration/lean jitter doesn't shake the horizon
        this.currentCameraBanking = THREE.MathUtils.lerp(this.currentCameraBanking, targetRoll, adjLerp(0.45));
        const roll = this.currentCameraBanking;

        // Full bike-local frame: yaw, then pitch, then roll (interpolated yaw)
        const helmetYaw = this.vehicle.renderYawAngle !== undefined ? this.vehicle.renderYawAngle : this.vehicle.yawAngle;
        const mountEuler = new THREE.Euler(bikePitch, helmetYaw, roll, 'YXZ');

        // Mount at the rider's visor - swings with the lean like a real head
        const cameraPos = this.tempVector.set(0, 1.18, 0.3).applyEuler(mountEuler).add(vehiclePos);

        // Engine/road vibration - subtle, speed dependent, comfort damped
        const vibration = (0.008 + speedRatio * 0.012) * (this.vehicle.comfortShake !== undefined ? this.vehicle.comfortShake : 1);
        cameraPos.x += (Math.random() - 0.5) * vibration;
        cameraPos.y += (Math.random() - 0.5) * vibration * 0.7;

        this.camera.position.copy(cameraPos);
        this.currentCameraPos.copy(cameraPos);

        // Look ahead through the same head orientation
        const lookTarget = new THREE.Vector3(0, 1.05, 25).applyEuler(mountEuler).add(vehiclePos);
        this.currentLookTarget.copy(lookTarget);

        // The horizon banks with the head: roll the up vector around the view axis
        const forwardDir = new THREE.Vector3().subVectors(lookTarget, cameraPos).normalize();
        this.tempMatrix.makeRotationAxis(forwardDir, roll);
        this.tempUpVector.set(0, 1, 0).applyMatrix4(this.tempMatrix);
        this.camera.up.copy(this.tempUpVector);
        this.camera.lookAt(lookTarget);

        // Wide FOV with speed rush
        this.camera.fov = 95 + speedRatio * 12;
        this.camera.updateProjectionMatrix();
    }

    // The eye adapts to a tunnel or a gallery (TubeShade.LIGHT): the exposure (Graphics.adaptation) goes toward `adapt`
    // by the tube's light share where the camera is (WorldEnvironment.tubeShareAt, 4 m behind the bike), over inS going
    // in and outS coming out, so a portal reads as riding into a tunnel and out of one, with no step. Simulated time,
    // so a stepped ride adapts as a played one does
    updateTubeAdaptation(dt) {
        const graphics = this.graphics, env = this.environment;
        if (!graphics || !env || !env.isWorld || typeof TubeShade === 'undefined' || !env.tubeShareAt) return;
        const L = TubeShade.LIGHT;
        const share = this.vehicle ? env.tubeShareAt(Math.max(0, (this.vehicle.routeS || 0) - 4)) : 0;
        const goal = 1 + (L.adapt - 1) * share;
        const now = Number.isFinite(graphics.adaptation) ? graphics.adaptation : 1;
        const tau = goal > now ? L.inS : L.outS;
        graphics.adaptation = !(dt > 0) ? now : now + (goal - now) * (1 - Math.exp(-dt / tau));
        this.updateTubeMovers();
    }

    // The bike, the riders of the group and the traffic in a tube are lit by it (TubeShade.patchMover): each frame the
    // nearest MOVERS of them to the camera are written with the tube's light share and the lamps' light where each
    // stands (TubeShade.moverAt); their materials are patched as they appear (every 30 frames, and a model loaded or
    // swapped since is caught then). The land and the world keep their light, so the open air seen through a
    // portal is not dimmed
    tubeMoverRoots() {
        const roots = [];
        if (this.vehicle && this.vehicle.group) roots.push(this.vehicle.group);
        const traffic = this.traffic;
        if (traffic) {
            for (const bike of traffic.motorcycles || []) if (bike.bikeGroup) roots.push(bike.bikeGroup);
            for (const car of traffic.cars || []) if (car.carGroup) roots.push(car.carGroup);
        }
        return roots;
    }

    updateTubeMovers() {
        const env = this.environment;
        if (!env || !env.isWorld || typeof TubeShade === 'undefined' || !env.tubeInfo) return;
        const roots = this.tubeMoverRoots();
        this.tubeMoverTick = ((this.tubeMoverTick || 0) + 1) % 30;
        if (this.tubeMoverTick === 1) {
            for (const root of roots) root.traverse(o => { if (o.material) [].concat(o.material).forEach(m => TubeShade.patchMover(m)); });
        }
        const cam = this.camera ? this.camera.position : null;
        const p = new THREE.Vector3();
        const list = [];
        for (const root of roots) {
            if (!root.visible) continue;
            root.getWorldPosition(p);
            const hint = root.userData.tubeHint || (root.userData.tubeHint = { index: -1 });
            const at = TubeShade.moverAt(env, p.x, p.y, p.z, hint);
            list.push({ x: p.x, z: p.z, share: at.share, lamp: at.lamp, d: cam ? Math.hypot(p.x - cam.x, p.z - cam.z) : 0 });
        }
        list.sort((a, b) => a.d - b.d);
        TubeShade.writeMovers(list);
    }

    // Height of the tunnel roof over the bike, or null in the open. The
    // camera trails the bike by up to a segment, so a roof one segment either
    // side counts.
    tunnelRoofY() {
        const { environment, vehicle } = this;
        if (!environment || !vehicle || !environment.route) return null;
        const route = environment.route;
        const segment = route.toUnits(vehicle.routeS || 0);
        for (const index of [segment, segment - 1, segment + 1]) {
            const ceiling = route.ceilingAt(route.fromUnits(index));
            if (ceiling === undefined || !route.pointAtUnit(index)) continue;
            // The roof rides on the road under it; on a slope the bike's own
            // segment can be the lower one, so the lower roof counts
            return Math.min(route.pointAtUnit(index).y, route.pointAtUnit(segment).y) + ceiling;
        }
        return null;
    }

    updateCamera(deltaTime = 1 / 60) {
        // Camera smoothing factors were tuned for 60Hz updates; rescale them to
        // the actual frame delta so camera feel is frame-rate independent
        const lerpScale = Math.min(deltaTime * 60, 3);
        const adjLerp = (f) => 1 - Math.pow(1 - f, lerpScale);

        // Handle camera intro animation
        if (this.cameraIntroActive) {
            const elapsed = performance.now() - this.cameraIntroStartTime;
            const progress = Math.min(elapsed / this.cameraIntroDuration, 1);
            
            // Use easing function for smooth animation (ease-in-out)
            const easeProgress = progress < 0.5 
                ? 2 * progress * progress 
                : 1 - Math.pow(-2 * progress + 2, 2) / 2;
            
            // Interpolate camera position from above to behind vehicle
            this.camera.position.lerpVectors(
                this.cameraIntroStartPos,
                this.cameraIntroEndPos,
                easeProgress
            );
            
            // Look at the vehicle
            this.camera.lookAt(this.vehicle.position.x, this.vehicle.position.y + 1, this.vehicle.position.z);
            
            // End intro when complete
            if (progress >= 1) {
                this.cameraIntroActive = false;
                
                // Initialize the follow camera positions to match intro end position
                // to avoid jump when switching to normal camera
                this.currentCameraPos.copy(this.camera.position);
                this.currentLookTarget.copy(this.vehicle.position);
                this.currentLookTarget.y += 1;
                
                // Reset banking state
                this.currentCameraBanking = 0;
                
                console.log('Camera intro complete - smooth transition to follow camera');
            }
            
            return; // Skip normal camera update during intro
        }
        
        // Safety check - if vehicle doesn't exist or lean angle is extreme, reset banking
        if (!this.vehicle || Math.abs(this.vehicle.leanAngle) > Math.PI) {
            this.currentCameraBanking = THREE.MathUtils.lerp(this.currentCameraBanking, 0, adjLerp(0.2));
            this.camera.rotation.z = this.currentCameraBanking;
            return;
        }
        
        // Normal camera follow behavior (interpolated render position + yaw)
        const vehiclePos = (this.vehicle.renderPosition || this.vehicle.position).clone();
        const vehicleYaw = this.vehicle.renderYawAngle !== undefined ? this.vehicle.renderYawAngle : this.vehicle.yawAngle;
        const vehicleRotation = new THREE.Euler(0, vehicleYaw, 0);

        // Cinematic fall camera: pull up and back, zooming out with fall
        // distance so the tumbling bike stays in view below
        if (this.vehicle.fallingOffCliff) {
            const fallDist = Math.max(0, (this.vehicle.fallStartY || vehiclePos.y) - vehiclePos.y);
            const zoom = Math.min(fallDist * 0.45, 30);
            const fallOffset = new THREE.Vector3(0, 7 + zoom * 0.5, -(9 + zoom)).applyEuler(vehicleRotation);
            const fallCamPos = vehiclePos.clone().add(fallOffset);

            this.currentCameraPos.lerp(fallCamPos, adjLerp(0.07)); // Floaty, detached follow
            this.camera.position.copy(this.currentCameraPos);

            // Look straight at the tumbling bike, leveling the horizon
            this.currentLookTarget.lerp(vehiclePos, adjLerp(0.3));
            this.currentCameraBanking = THREE.MathUtils.lerp(this.currentCameraBanking, 0, adjLerp(0.12));
            const fallForward = new THREE.Vector3().subVectors(this.currentLookTarget, this.currentCameraPos).normalize();
            this.tempMatrix.makeRotationAxis(fallForward, this.currentCameraBanking);
            this.tempUpVector.set(0, 1, 0).applyMatrix4(this.tempMatrix);
            this.camera.up.copy(this.tempUpVector);
            this.camera.lookAt(this.currentLookTarget);

            // Ease the FOV back toward neutral
            if (!this.currentFOV) this.currentFOV = this.camera.fov;
            this.currentFOV = THREE.MathUtils.lerp(this.currentFOV, 78, adjLerp(0.06));
            this.camera.fov = this.currentFOV;
            this.camera.updateProjectionMatrix();

            this.updateShadowCamera();
            return;
        }

        // Calculate yaw change for lateral camera lag (normalized to a 60Hz step)
        const yawDelta = (vehicleYaw - this.previousYawAngle) / lerpScale;
        this.previousYawAngle = vehicleYaw;

        // Update lateral offset - camera swings opposite to turn direction initially
        const targetLateralOffset = -yawDelta * 25; // Strong lateral movement
        const lateralBlend = adjLerp(0.15);
        this.cameraLateralOffset = this.cameraLateralOffset * (1 - lateralBlend) + targetLateralOffset * lateralBlend;

        // Get current camera mode settings
        const currentMode = this.cameraModes[this.cameraMode];
        this.baseCameraOffset = currentMode.offset.clone();
        this.cameraLerpFactor = currentMode.lerpFactor;
        
        // True first-person view: rigidly mounted at the rider's helmet
        if (currentMode.type === 'helmet') {
            this.updateHelmetCamera(vehiclePos, adjLerp);
            this.updateShadowCamera();
            return;
        }

        // Mode-specific adjustments
        if (currentMode.type === 'onboard') {
            // Onboard camera - minimal lateral movement, rotates with bike
            this.cameraOffset.x = this.baseCameraOffset.x;
            this.cameraOffset.y = this.baseCameraOffset.y;
            this.cameraOffset.z = this.baseCameraOffset.z;
            
            // Add small vibration for realism (scaled by the bike's comfort)
            const onboardShake = this.vehicle.comfortShake !== undefined ? this.vehicle.comfortShake : 1;
            this.cameraOffset.x += Math.sin(performance.now() * 0.01) * 0.02 * onboardShake;
            this.cameraOffset.y += Math.sin(performance.now() * 0.013) * 0.01 * onboardShake;
        } else {
            // Standard and High View cameras
            // Dynamic camera offset based on lean angle for better mountain road feel
            const leanInfluence = Game.tune('camera', 'swing', this.vehicle.leanAngle * (currentMode.type === 'high' ? 3 : 2)); // More influence in high view
            
            // Combine lateral lag with lean influence; a world's boom turns by the route, and WorldCamera takes the
            // same swing in its own frame (worldCameraInput)
            this.cameraOffset.x = this.environment.isWorld ? this.baseCameraOffset.x : this.baseCameraOffset.x - leanInfluence + this.cameraLateralOffset;
            
            // Adjust height based on speed for dramatic effect
            const speedRatio = this.vehicle.speed / this.vehicle.maxSpeed;
            // (a leg's camera rises a little with speed; a world's comes down toward the road, WorldCamera.speedHeight)
            this.cameraOffset.y = this.environment.isWorld ? WorldCamera.speedHeight(this.baseCameraOffset.y, this.vehicle.speed) : this.baseCameraOffset.y + speedRatio * 0.5;
            this.cameraOffset.z = this.baseCameraOffset.z - speedRatio * (currentMode.type === 'high' ? 2 : 1); // Move back with speed
            // The tuning's camera distance: the boom's length and height together
            const far = Game.tune('camera', 'distance', 1);
            if (far !== 1) {
                this.cameraOffset.y *= far;
                this.cameraOffset.z *= far;
            }
            
            // (No lateral camera swing during wheelies - the 8-unit sideways
            // jump made the bike read as tipping left while it was straight)
        }

        // Calculate camera position relative to vehicle
        const offset = this.cameraOffset.clone();
        const world = this.environment.isWorld && currentMode.type !== 'onboard';
        if (!world) offset.applyEuler(vehicleRotation);
        const cameraPos = vehiclePos.clone().add(offset);

        // Smooth camera movement with lag - adaptive based on speed and conditions
        let lerpFactor = this.cameraLerpFactor;
        
        if (this.vehicle.fallingOffCliff) {
            lerpFactor = 0.45; // Even faster following during fall
            // Add slight camera shake during fall
            const shakeAmount = Math.min(Math.abs(this.vehicle.velocity.y) * 0.01, 0.5);
            cameraPos.x += (Math.random() - 0.5) * shakeAmount;
            cameraPos.y += (Math.random() - 0.5) * shakeAmount;
            cameraPos.z += (Math.random() - 0.5) * shakeAmount;
        } else if (this.vehicle.isWheelie) {
            // Slower, more dramatic camera during wheelies
            lerpFactor *= 0.8;
        } else if (this.vehicle.speed > 50) {
            // Slightly faster at high speeds for more responsiveness
            lerpFactor *= 1.15;
        }
        // Ensure camera never goes below bike level (bike is at roughly y=2)
        const minCameraHeight = vehiclePos.y + 2; // At least 2 units above bike
        if (world) {
            // A world's boom follows the route behind the bike, not the bike's yaw, with springs; in a hairpin it
            // pulls back and up, and the land shortens it (WorldCamera.update)
            const placed = this.worldCamera.update(this.worldCameraInput(vehiclePos, currentMode, lerpFactor), deltaTime);
            this.currentCameraPos.set(placed.x, placed.y, placed.z);
        } else {
            this.currentCameraPos.lerp(cameraPos, adjLerp(lerpFactor));
            if (this.currentCameraPos.y < minCameraHeight) {
                this.currentCameraPos.y = minCameraHeight;
            }
        }

        this.camera.position.copy(this.currentCameraPos);

        // Additional camera shake at high speeds (outside onboard mode)
        if (currentMode.type !== 'onboard') {
            const speedFactor = this.vehicle.speed / this.vehicle.maxSpeed;
            // The world's land shakes the camera as well as the bike (Vehicle.landRock), and an off-road bike less
            // (as its bump, Vehicle.landValues)
            const onLand = this.vehicle.worldPhysics && this.vehicle.runoff && !this.vehicle.crashed;
            const land = onLand ? this.vehicle.landValues() : null;
            const rough = onLand ? 0.15 * Math.min(1, this.vehicle.speed / land.landCapSpeed) * land.landBumpM / this.vehicle.worldPhysics.landBumpM : 0;
            const shakeIntensity = (speedFactor * 0.05 + rough) * (this.vehicle.comfortShake !== undefined ? this.vehicle.comfortShake : 1);
            this.camera.position.x += (Math.random() - 0.5) * shakeIntensity;
            this.camera.position.y += (Math.random() - 0.5) * shakeIntensity * 0.3;
        }

        // Under a tunnel roof the camera stays beneath it, shake included: High
        // View sits 8 above the bike, higher than the 7.5 m roof. The smoothed
        // position keeps the clamp too, so the camera eases out of the tunnel
        // rather than jumping to where it would have been
        // (a world's camera keeps under a tube's roof itself, eased in before the portal: WorldEnvironment.tubeRoofY;
        // this clamp at the bike's own roof held it down in one frame and let the boom behind the bike through a
        // lower roof on a climb)
        const roofY = this.environment.isWorld ? null : this.tunnelRoofY();
        if (roofY !== null && this.camera.position.y > roofY - 1.0) {
            this.camera.position.y = Math.max(roofY - 1.0, minCameraHeight);
            this.currentCameraPos.y = Math.min(this.currentCameraPos.y, this.camera.position.y);
        }

        // Mode-specific FOV and look target
        const speedRatio = this.vehicle.speed / this.vehicle.maxSpeed;
        
        if (currentMode.type === 'onboard') {
            // Onboard camera - wider FOV, look directly ahead
            this.camera.fov = 90 + speedRatio * 10; // 90 to 100 degrees for immersive onboard view
            this.camera.updateProjectionMatrix();
            
            // Look straight ahead from bike position
            const lookAheadDistance = 10 + speedRatio * 5;
            this.tempVector.set(0, 0.5, lookAheadDistance);
            this.tempVector.applyEuler(vehicleRotation);

            const lookTarget = vehiclePos.clone().add(this.tempVector);
            if (this.environment.isWorld) {
                // A world looks along the road ahead, which turns before the bike does
                const ahead = this.worldCamera.lookTarget(this.vehicle.projection.s ?? this.vehicle.routeS, this.vehicle.speed, 0.5, this.worldAhead || (this.worldAhead = {}));
                lookTarget.set(ahead.x, ahead.y, ahead.z);
            }

            this.currentLookTarget.lerp(lookTarget, adjLerp(this.environment.isWorld ? WorldCamera.LOOK_FOLLOW : 0.3)); // Fast response for onboard
            
            // Onboard camera banking - calculate BEFORE lookAt with custom up vector
            // Onboard view banks WITH the bike - aggressive tilt for immersive feel
            const onboardBankAmount = this.vehicle.leanAngle * 0.9; // 90% banking, same direction
            const targetOnboardBank = THREE.MathUtils.clamp(onboardBankAmount, -0.7, 0.7); // Max ~40° bank
            this.currentCameraBanking = THREE.MathUtils.lerp(this.currentCameraBanking, targetOnboardBank, adjLerp(0.2));

            // Create custom up vector rotated around camera's forward direction (view axis)
            const forwardDir = new THREE.Vector3();
            forwardDir.subVectors(this.currentLookTarget, this.currentCameraPos).normalize();
            this.tempMatrix.makeRotationAxis(forwardDir, this.currentCameraBanking);
            this.tempUpVector.set(0, 1, 0).applyMatrix4(this.tempMatrix);

            // Apply banking through custom up vector, then lookAt
            this.camera.up.copy(this.tempUpVector);
            this.camera.lookAt(this.currentLookTarget);
        } else {
            // Standard and High View cameras
            const speedFactor = this.vehicle.speed / this.vehicle.maxSpeed;

            // Dynamic FOV - increases with speed for visceral feel
            const baseFOV = currentMode.type === 'high' ? 70 : 75;
            const maxFOVIncrease = 10; // 75° → 85° at max speed
            const targetFOV = baseFOV + (speedFactor * maxFOVIncrease);

            // Smooth FOV transition; a world's FOV is a spring of WorldCamera.update, toward the same target
            if (!this.currentFOV) this.currentFOV = baseFOV;
            this.currentFOV = this.environment.isWorld ? this.worldCamera.fov : THREE.MathUtils.lerp(this.currentFOV, targetFOV, adjLerp(0.05));
            this.camera.fov = this.currentFOV;
            this.camera.updateProjectionMatrix();

            // Enhanced camera shake with multiple sources
            if (!this.cameraShakeOffset) this.cameraShakeOffset = new THREE.Vector3();

            // Comfort rating damps every shake source - Tim's scooter
            // glides where Steve's race bike rattles
            const comfort = this.vehicle.comfortShake !== undefined ? this.vehicle.comfortShake : 1;

            // Base speed shake - increases dramatically at high speeds
            const speedShake = Math.pow(speedFactor, 2) * 0.12 * comfort;

            // Terrain/roughness shake - simulates bumpy road
            const terrainShake = Math.sin(performance.now() * 0.02) * 0.015 * speedFactor * comfort;

            // Landing impact shake - big jolt when landing from jumps
            let landingShake = 0;
            if (this.vehicle.isJumping) {
                this.lastJumpState = true;
            } else if (this.lastJumpState) {
                // Just landed - create impact shake (softened by suspension comfort)
                this.landingShakeIntensity = 0.3 * (this.vehicle.comfortShake !== undefined ? this.vehicle.comfortShake : 1);
                this.landingShakeTime = performance.now();
                this.lastJumpState = false;
            }

            // Decay landing shake over time
            if (this.landingShakeIntensity > 0) {
                const timeSinceLanding = (performance.now() - this.landingShakeTime) / 1000;
                landingShake = this.landingShakeIntensity * Math.exp(-timeSinceLanding * 8);
                if (landingShake < 0.01) this.landingShakeIntensity = 0;
            }

            // Wheelie wobble - adds instability feel during wheelies
            let wheelieShake = 0;
            if (this.vehicle.isWheelie) {
                const wheelieAngle = this.vehicle.wheelieAngle * 180 / Math.PI;
                wheelieShake = (wheelieAngle / 60) * 0.04 * Math.sin(performance.now() * 0.01);
            }

            // Combine all shake sources
            const totalShake = speedShake + terrainShake + landingShake + wheelieShake;
            this.cameraShakeOffset.x = (Math.random() - 0.5) * totalShake;
            this.cameraShakeOffset.y = (Math.random() - 0.5) * totalShake * 0.6;
            this.cameraShakeOffset.z = (Math.random() - 0.5) * totalShake * 0.4;
            
            // Look ahead of vehicle for better anticipation on mountain roads
            const lookAheadDistance = (currentMode.type === 'high' ? 5 : 3) + speedRatio * 7; // Look further in high view
            this.tempVector.set(0, 0, lookAheadDistance);
            this.tempVector.applyEuler(vehicleRotation);

            const lookTarget = vehiclePos.clone().add(this.tempVector);
            lookTarget.y += currentMode.type === 'high' ? 2 : 1; // Look higher in high view
            
            if (this.environment.isWorld) {
                // A world looks along the road ahead, which turns before the bike does, and the target gives way
                // to the bike until the bike is well inside the view (WorldCamera.aim), from where the camera is now
                const bike = this.worldBike || (this.worldBike = new THREE.Vector3());
                bike.set(vehiclePos.x, vehiclePos.y + 0.9, vehiclePos.z);
                const look = this.worldCamera.aim(this.camera, bike, this.worldProbe || (this.worldProbe = new THREE.PerspectiveCamera()));
                this.currentLookTarget.set(look.x, look.y, look.z);
            } else {
                // Add lean-based lateral offset for corner viewing (less in high view)
                const leanLateralOffset = -this.vehicle.leanAngle * (currentMode.type === 'high' ? 2 : 4);
                this.tempUpVector.set(leanLateralOffset, 0, 0);
                this.tempUpVector.applyEuler(vehicleRotation);
                lookTarget.add(this.tempUpVector);
                this.currentLookTarget.lerp(lookTarget, adjLerp(Math.min(this.cameraLerpFactor * 1.5, 1)));
            }
            
            // Camera banking BEFORE lookAt - subtle lean feedback
            const bankFactor = currentMode.type === 'high' ? 0.15 : 0.25; // High view more subtle
            // Positive lean = right lean, bank camera right (positive rotation around forward axis)
            const bankAmount = this.vehicle.leanAngle * bankFactor;
            const targetBank = THREE.MathUtils.clamp(bankAmount, -0.3, 0.3); // Max ~17° bank
            this.currentCameraBanking = THREE.MathUtils.lerp(this.currentCameraBanking, targetBank, adjLerp(0.15));

            // Wheelie camera tilt - pitch camera up to follow bike angle
            let wheelieTilt = 0;
            if (this.vehicle.isWheelie && this.vehicle.wheelieAngle) {
                // Tilt camera up proportional to wheelie angle (max ~15°)
                wheelieTilt = Math.min(this.vehicle.wheelieAngle * 0.4, 0.26); // ~15° max
            }

            // Smooth wheelie tilt transition
            if (!this.currentWheelieTilt) this.currentWheelieTilt = 0;
            this.currentWheelieTilt = THREE.MathUtils.lerp(this.currentWheelieTilt, wheelieTilt, adjLerp(0.1));

            // Adjust look target height during wheelies for subtle upward view
            if (this.currentWheelieTilt > 0.05) {
                const tiltInfluence = this.currentWheelieTilt * 1.5; // Reduced from 5 to 1.5
                this.currentLookTarget.y += tiltInfluence;
            }

            // Create custom up vector rotated around camera's forward direction (view axis)
            // This ensures banking works correctly regardless of vehicle's world orientation
            const forwardDir = new THREE.Vector3();
            forwardDir.subVectors(this.currentLookTarget, this.currentCameraPos).normalize();
            this.tempMatrix.makeRotationAxis(forwardDir, this.currentCameraBanking);
            this.tempUpVector.set(0, 1, 0).applyMatrix4(this.tempMatrix);

            // Apply banking through custom up vector, then lookAt
            this.camera.up.copy(this.tempUpVector);
            this.camera.lookAt(this.currentLookTarget);
        }
        
        // Update shadow camera to follow player
        this.updateShadowCamera();
    }
    
    // What the world camera reads of the bike and the view mode (WorldCamera.update): the bike's smooth road
    // position, so nothing the camera reads from the route steps where the polyline turns. The carving swing is the
    // legs' chase camera's (the lean shift with its lagged lateral term, and the look point pushed into the corner),
    // with the same gains and lerps; WorldCamera applies it in its own boom frame and scales it down near the land.
    worldCameraInput(vehiclePos, mode, follow) {
        const input = this.worldInput || (this.worldInput = { offset: {} });
        const v = this.vehicle;
        const s = v.projection.s ?? v.routeS;
        input.x = vehiclePos.x;
        input.y = vehiclePos.y;
        input.z = vehiclePos.z;
        input.s = typeof v.roadFrame === 'function' && Number.isFinite(s) && v.projection.index >= 0 ? v.roadFrame().s : s;
        input.index = v.projection.index >= 0 ? v.projection.index : Math.floor(this.environment.route.toUnits(input.s));
        input.speed = v.speed;
        // (the way the bike goes, and whether it is on the ride, for the free-roam camera: WorldCamera.followRider)
        input.yaw = v.yawAngle;
        input.onRide = v.projection.index >= 0 && Math.abs(v.projection.lateral || 0) <= (v.projection.width || 0) / 2 + Game.CAMERA_RIDE_M;
        input.lift = mode.type === 'high' ? 2 : 1;
        input.offset.x = this.cameraOffset.x;
        input.offset.y = this.cameraOffset.y;
        input.offset.z = this.cameraOffset.z;
        const swing = input.swing || (input.swing = {});
        swing.x = Game.tune('camera', 'swing', -v.leanAngle * (mode.type === 'high' ? 3 : 2) + this.cameraLateralOffset);
        swing.look = Game.tune('camera', 'swing', -v.leanAngle * (mode.type === 'high' ? 2 : 4));
        swing.follow = follow;
        swing.lookFollow = Math.min(this.cameraLerpFactor * 1.5, 1);
        input.aspect = this.camera.aspect;
        input.fov = (mode.type === 'high' ? 70 : 75) + (v.speed / v.maxSpeed) * 10;
        return input;
    }

    updateShadowCamera() {
        // Make the directional lights' shadow cameras follow the player,
        // preserving the time-of-day sun direction (low sun = long shadows)
        const playerPos = this.vehicle.position;
        const sunOffset = this.sunOffset || { x: 50, y: 80 };

        // Update near shadow light position to stay relative to player
        this.directionalLight.position.set(
            playerPos.x + sunOffset.x,
            playerPos.y + sunOffset.y,
            playerPos.z + (sunOffset.z || 0)
        );
        this.directionalLight.target.position.copy(playerPos);
        this.directionalLight.target.updateMatrixWorld();

        // Update distant fill light similarly
        this.distantLight.position.set(
            playerPos.x + sunOffset.x,
            playerPos.y + sunOffset.y,
            playerPos.z + (sunOffset.z || 0)
        );
        this.distantLight.target.position.copy(playerPos);
        this.distantLight.target.updateMatrixWorld();
    }

    updateUI() {
        // Cache DOM lookups - this runs every frame
        if (!this.uiElements) {
            this.uiElements = {
                dashboard: document.querySelector('.dashboard'),
                speedVignette: document.getElementById('speedVignette')
            };
        }
        const ui = this.uiElements;

        if (this.finished) {
            // Dashboard remains visible but update for finish state
            if (ui.dashboard) {
                ui.dashboard.style.opacity = '0.5';
            }
            return;
        }

        // The HUD writes only when the shown speed changes
        if (this.hud) {
            this.hud.setSpeed(this.vehicle.getSpeed(), this.vehicle.maxSpeed * 2.237);
            this.hud.setGear(this.gearbox);
            this.hud.update(this.raceElapsed(), this.firstInputAt);
            if (this.environment.isWorld) this.updateWorldHud();
        }

        // Peripheral motion blur ramps in above ~45% of max speed
        if (this.speedBlurOverlay) {
            const blurRatio = this.vehicle.speed / this.vehicle.maxSpeed;
            const blurOpacity = Math.min(1, Math.max(0, (blurRatio - 0.45) / 0.55)).toFixed(2);
            if (blurOpacity !== this.lastBlurOpacity) {
                this.lastBlurOpacity = blurOpacity;
                this.speedBlurOverlay.style.opacity = blurOpacity;
                // Remove from compositing entirely when fully transparent -
                // an idle backdrop-filter layer still costs GPU time
                this.speedBlurOverlay.style.display = blurOpacity === '0.00' ? 'none' : 'block';
            }
        }

        // Update speed vignette - tunnel vision effect at high speeds
        if (ui.speedVignette) {
            const speedRatio = this.vehicle.speed / this.vehicle.maxSpeed;
            // Vignette kicks in at 50% speed, full effect at max speed
            const vignetteOpacity = Math.max(0, (speedRatio - 0.5) * 2).toFixed(2);
            if (vignetteOpacity !== this.lastVignetteOpacity) {
                this.lastVignetteOpacity = vignetteOpacity;
                ui.speedVignette.style.opacity = vignetteOpacity;
            }
        }

        // FPS display is updated once per second in animate()

        // Update wheelie indicator
        this.updateWheelieIndicator();

        // Update score display
        this.updateScoreDisplay();
    }
    
    
    // The progress bar, the ride distance and (a ride of more than one stage) the stage line: from the one
    // projection of the frame
    updateWorldHud() {
        const { from, to } = this.worldStageSpan();
        const s = this.vehicle.projection.s ?? this.vehicle.routeS ?? 0;
        const run = this.worldRun;
        const k = run.stageIndex;
        const stage = this.environment.route.stages[k];
        const line = HudRules.stageLine(k + 1, this.worldStageCount(), this.worldStageName(k), this.raceElapsed() - run.stageStartMs);
        // The bar and its count follow the stage being ridden: a new stage starts them again
        const span = stage ? { from: stage.from, to: stage.to } : { from, to };
        const gates = run.stageGates(k);
        if (this.shownWorldStage !== k) {
            this.shownWorldStage = k;
            this.shownWorldGates = null;
            this.hud.showProgress(HudRules.progressMarks(this.environment.stationGates, span.from, span.to));
        }
        if (this.shownWorldGates !== gates.passed) {
            this.shownWorldGates = gates.passed;
            this.hud.setGates(gates.passed, gates.total);
        }
        // (the distance is the leg's own: a folder of several legs holds the others' road too)
        this.hud.setProgress(HudRules.stageShare(s, span.from, span.to), HudRules.kmText(Math.max(0, s - from), to - from), line);
    }

    updateWheelieIndicator() {
        if (!this.wheelieElements) {
            this.wheelieElements = {
                indicator: document.getElementById('wheelieIndicator'),
                zone: document.getElementById('wheelieZone')
            };
        }
        const { indicator, zone } = this.wheelieElements;
        if (!indicator || !zone) return;

        if (!this.vehicle.isWheelie) {
            if (this.shownWheelieAngle !== null) {
                this.shownWheelieAngle = null;
                indicator.classList.remove('active');
            }
            return;
        }

        // Whole degrees: the DOM is touched only when the shown angle changes
        const degrees = Math.round(this.vehicle.wheelieAngle * 180 / Math.PI);
        if (degrees === this.shownWheelieAngle) return;
        if (this.shownWheelieAngle === null || this.shownWheelieAngle === undefined) indicator.classList.add('active');
        this.shownWheelieAngle = degrees;

        // Green to amber to red as the angle nears the crash angle
        const maxDegrees = this.vehicle.wheelieCrashAngle * 180 / Math.PI;
        const ratio = Math.min(1, Math.max(0, degrees / maxDegrees));
        const hue = Math.round(140 * (1 - ratio));
        indicator.style.setProperty('--tone', `hsl(${hue}, 90%, 60%)`);
        zone.textContent = `WHEELIE ${degrees}°`;
    }

    // The ride distance the world streams by: the run's accepted progress, or in free roam (no progress) the nearest place
    // on the ride to the bike
    worldStreamS() {
        if (!this.freeRoam) return this.worldRun.lastS;
        const v = this.vehicle, s = v.projection && Number.isFinite(v.projection.s) && v.projection.index >= 0 ? v.projection.s : v.routeS;
        return Number.isFinite(s) ? s : this.environment.startS;
    }

    // Metres of the route ridden this stage: the run's accepted progress from the stage's start (the bike's own
    // odometer sums every tick's movement, sway and bounce with it, and read 24,649 m on a 13,187 m stage)
    worldRouteDistance() {
        const env = this.environment;
        const from = env.stage ? env.stage.from : 0;
        const at = this.worldRun && Number.isFinite(this.worldRun.lastS) ? this.worldRun.lastS : env.endS;
        return Math.max(0, Math.min(env.endS, at) - from);
    }

    // The end of a world stage: the time and the restarts, and R to ride it again. Boards, unlocks and the
    // next stage belong to the run flow of the world, not to this page.
    showWorldFinish() {
        const banner = document.createElement('div');
        banner.id = 'finishBanner';
        banner.className = 'finish-banner';
        const restarts = this.restarts > 0 ? `<div class="finish-board">${this.restarts} ${this.restarts === 1 ? 'restart' : 'restarts'}, +${this.restarts * Game.RESTART_PENALTY_MS / 1000} s in your time</div>` : '';
        banner.innerHTML = `
            <div class="finish-main">
                <div class="finish-title">STAGE COMPLETE</div>
                <div class="finish-time-label">YOUR TIME</div>
                <div class="finish-time">${RaceTiming.formatTime(this.finishTime)}</div>
                <div class="finish-deltas">${restarts}</div>
                <div class="finish-meta">${HudRules.number(this.worldRouteDistance())} m</div>
                <div class="finish-buttons">
                    <button id="restartLegBtn" class="finish-btn primary" data-key="KeyR"><u>R</u>ESTART</button>
                    <button id="returnToMenuBtn" class="finish-btn secondary" data-key="KeyM" data-menu><u>M</u>ENU</button>
                </div>
            </div>`;
        if (this.hud) this.hud.clearTransient();
        document.body.classList.add('run-over');
        Modals.open(banner);
        if (this.input) this.input.setMenuActive(true);
        banner.querySelector('#restartLegBtn').addEventListener('click', () => this.restartLeg());
        banner.querySelector('#returnToMenuBtn').addEventListener('click', () => this.returnToMenu());
    }

    showFinishScreen() {
        if (this.environment && this.environment.isWorld) {
            this.showWorldFinish();
            return;
        }
        // Calculate final score with finish bonus
        const distance = this.vehicle.getDistanceTraveled();
        const timeSeconds = this.finishTime / 1000;
        const averageSpeed = distance / timeSeconds * 3.6 * 0.621371; // mph
        
        // Calculate final position
        let finalPosition = 1;
        if (this.traffic && this.traffic.motorcycles) {
            // Track progress, not world Z: half the course runs toward -Z
            const playerProgress = Math.floor(this.environment.route.toUnits(this.vehicle.routeS || 0)) + (this.vehicle.segmentProgress || 0);
            this.traffic.motorcycles.forEach(bike => {
                const bikeProgress = Math.floor(bike.currentSegment || 0) + (bike.segmentProgress || 0);
                if (bikeProgress > playerProgress) {
                    finalPosition++;
                }
            });
        }
        const totalRacers = this.traffic ? this.traffic.motorcycles.length + 1 : 1;
        const positionSuffix = finalPosition === 1 ? 'st' : finalPosition === 2 ? 'nd' : finalPosition === 3 ? 'rd' : 'th';
        
        // Add finish bonus to current score
        const finishBonus = 1000 * this.comboMultiplier;
        this.addScore(finishBonus);
        
        const totalScore = this.score;

        const positionColor = finalPosition === 1 ? 'var(--c-gold)' : finalPosition === 2 ? '#d4dbe4' : finalPosition === 3 ? '#e09a5a' : 'var(--c-text)';

        const isLastLeg = this.tourSystem.isLastLeg();
        const titleText = isLastLeg ? 'TOUR COMPLETE!' : 'LEG COMPLETE!';

        // Record progression: completing a leg unlocks the next leg and,
        // at milestones, new riders
        const finishedLeg = this.tourSystem.getCurrentLeg();
        let unlocks = { legs: [], characters: [] };
        if (finishedLeg && this.tourSystem.markLegCompleted) {
            unlocks = this.tourSystem.markLegCompleted(finishedLeg.id);
        }
        // A ride finished on the rider's best open bike opens their next one (TourSystem.markRideFinished)
        const newBike = this.selectedCharacter && this.tourSystem.markRideFinished
            ? this.tourSystem.markRideFinished(this.selectedCharacter.id, this.selectedBike()) : null;
        if (newBike) unlocks = { ...unlocks, bikes: [newBike] };
        const flow = TourSystem.finishFlow(unlocks, isLastLeg);

        // Time is what ranks a run: compare it with the personal best (per
        // board) and the record. Best splits are rewritten only by a full run
        // that beat the best time.
        const bestTimeKey = finishedLeg ? this.bestTimeKey(finishedLeg) : 'motorcycleBestTime';
        const previousBest = parseFloat(localStorage.getItem(bestTimeKey) || '999999');
        const previousBestMs = previousBest < 999999 ? previousBest * 1000 : NaN;
        const boardMs = finishedLeg ? this.boardTimeMs(finishedLeg) : this.checkpointTimes[this.gateTotal() - 1];
        const result = RaceTiming.finish(this.finishTime, previousBestMs, boardMs, this.record);
        this.bestTime = previousBest;
        if (result.isBest) {
            this.bestTime = timeSeconds;
            localStorage.setItem(bestTimeKey, timeSeconds.toString());
            if (finishedLeg) {
                RaceTiming.saveSplitsIfBest(localStorage, this.bestSplitsKey(finishedLeg), this.checkpointTimes, true, this.gateTotal());
            }
        }

        const finishBanner = document.createElement('div');
        finishBanner.id = 'finishBanner';
        finishBanner.className = 'finish-banner';

        const deltaSpan = ms => `<span class="delta-${RaceTiming.deltaClass(ms)}">${RaceTiming.formatDelta(ms)}</span>`;
        const pbLine = result.pbDelta === null
            ? `<div class="finish-best-badge">${UiIcons.svg('trophy')} FIRST BEST TIME SET</div>`
            : result.isBest
                ? `<div class="finish-best-badge">${UiIcons.svg('trophy')} NEW PERSONAL BEST ${deltaSpan(result.pbDelta)}</div>`
                : `<div class="finish-delta">${deltaSpan(result.pbDelta)} <small>vs your best ${RaceTiming.formatTime(previousBestMs)}</small></div>`;
        const escape = text => String(text).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
        let recordLine = '';
        const tableBoard = finishedLeg ? this.isTableBoard(finishedLeg) : false;
        if (this.record && result.recordDelta !== null) {
            // The board ranks the time to the last gate on the shared course
            // and the finish-line time on a converted leg, so that is what is compared
            recordLine = `<div class="finish-delta">${deltaSpan(result.recordDelta)} <small>vs record ${RaceTiming.formatTime(this.record.totalTime)} (${escape(this.record.playerName)})</small></div>`
                + (tableBoard ? '' : `<div class="finish-board">Leaderboard time (to the last gate) ${RaceTiming.formatTime(result.boardTime)}</div>`);
        } else if (this.record) {
            recordLine = `<div class="finish-delta"><small>Record ${RaceTiming.formatTime(this.record.totalTime)} (${escape(this.record.playerName)})</small></div>`;
        }

        if (this.restarts > 0) {
            recordLine += `<div class="finish-board">${this.restarts} ${this.restarts === 1 ? 'restart' : 'restarts'}, +${this.restarts * Game.RESTART_PENALTY_MS / 1000} s in your time</div>`;
        }
        if (this.leaderboardService && this.leaderboardService.unsupported) {
            recordLine += '<div class="finish-board">Time saved on this device. Online board opens soon.</div>';
        }

        const unlockPanel = this.buildUnlockPanel(unlocks);
        // Until the next bike is in hand, say how far away it is
        const progress = flow.riders.length > 0 ? '' : this.tourSystem.unlockProgressText();
        // `key`: the KeyboardEvent.code that presses it (js/modals.js)
        const button = (id, cls, label, key = '') => `<button id="${id}" class="finish-btn ${cls}"${key ? ` data-key="${key}"` : ''}>${label}</button>`;
        const tourButton = isLastLeg
            ? button('restartTourBtn', flow.primary === 'restart-tour' ? 'primary' : 'secondary', 'RESTART TOUR')
            : button('nextLegBtn', flow.primary === 'next-leg' ? 'primary' : 'secondary', '<u>N</u>EXT LEG →', 'KeyN');
        const chooseButton = flow.primary === 'choose-rider'
            ? button('chooseRiderBtn', 'primary', 'CHOOSE YOUR NEW BIKE →')
            : '';

        // Two blocks so a short landscape screen can put them side by side
        finishBanner.innerHTML = `
            <div class="finish-main">
                <div class="finish-title">${titleText}</div>
                <div class="finish-time-label">YOUR TIME</div>
                <div class="finish-time">${RaceTiming.formatTime(this.finishTime)}</div>
                <div class="finish-deltas">
                    ${pbLine}
                    ${recordLine}
                </div>
                <div class="finish-meta">
                    <span style="color: ${positionColor};">${finalPosition}${positionSuffix}</span> of ${totalRacers} racers
                    · ${HudRules.number(distance)} m · ${HudRules.number(averageSpeed, { digits: 1 })} mph avg
                </div>
                <div class="finish-style">Style bonus <strong>${HudRules.number(totalScore)}</strong> pts</div>
            </div>
            <div class="finish-side">
                ${unlockPanel}
                ${progress ? `<div class="finish-progress">${UiIcons.svg('unlock')} ${progress}</div>` : ''}
                <div class="finish-buttons">
                    ${chooseButton}
                    ${tourButton}
                    ${button('restartLegBtn', 'secondary', '<u>R</u>ESTART LEG', 'KeyR')}
                    ${button('returnToMenuBtn', 'secondary', '<u>M</u>ENU', 'KeyM')}
                </div>
            </div>
        `;

        // The results card owns the screen: no HUD or touch controls behind it
        if (this.hud) this.hud.clearTransient();
        document.body.classList.add('run-over');
        // Enter takes the default action: the stack focuses the primary button
        Modals.open(finishBanner);

        // Enable R key for restart
        if (this.input) {
            this.input.setMenuActive(true);
        }

        // Store whether leaderboard is active for later
        const shouldShowLeaderboard = this.leaderboardService && this.leaderboardService.isActive();

        // Add event listeners to buttons
        document.getElementById('restartLegBtn').addEventListener('click', () => {
            Modals.close(finishBanner);
            // Disable R key when menu is closed
            if (this.input) {
                this.input.setMenuActive(false);
            }

            this.restartLeg();
        });

        document.getElementById('returnToMenuBtn').addEventListener('click', () => {
            // Disable R key when menu is closed
            if (this.input) {
                this.input.setMenuActive(false);
            }

            // Cancel leaderboard session if active (returning to menu without submitting)
            if (shouldShowLeaderboard) {
                this.leaderboardService.cancelSession();
            }

            this.returnToMenu();
        });

        // Add event listener for next leg button (if not last leg)
        if (!isLastLeg) {
            const nextLegBtn = document.getElementById('nextLegBtn');
            if (nextLegBtn) {
                nextLegBtn.addEventListener('click', () => {
                    // Disable R key when menu is closed
                    if (this.input) {
                        this.input.setMenuActive(false);
                    }

                    // Hide finish banner first
                    Modals.close(finishBanner);

                    // Show leaderboard entry if active, otherwise go straight to next leg
                    if (shouldShowLeaderboard) {
                        this.showLeaderboardEntryUI(() => {
                            // Callback after leaderboard submission or cancel
                            this.startNextLeg();
                        });
                    } else {
                        this.startNextLeg();
                    }
                });
            }
        }

        // A new bike: the default action takes the player to the rider screen
        // with it focused, after the name entry when a run is submittable
        const chooseRiderBtn = document.getElementById('chooseRiderBtn');
        if (chooseRiderBtn) {
            chooseRiderBtn.addEventListener('click', () => {
                if (this.input) {
                    this.input.setMenuActive(false);
                }
                Modals.close(finishBanner);
                const open = () => this.returnToMenu({ riderId: flow.riders[0] });
                if (shouldShowLeaderboard) {
                    this.showLeaderboardEntryUI(open);
                } else {
                    open();
                }
            });
        }


        // Add event listener for restart tour button (if last leg)
        if (isLastLeg) {
            const restartTourBtn = document.getElementById('restartTourBtn');
            if (restartTourBtn) {
                restartTourBtn.addEventListener('click', () => {
                    // Disable R key when menu is closed
                    if (this.input) {
                        this.input.setMenuActive(false);
                    }

                    // Hide finish banner first
                    Modals.close(finishBanner);

                    // Show leaderboard entry if active, otherwise go straight to first leg
                    if (shouldShowLeaderboard) {
                        this.showLeaderboardEntryUI(() => {
                            // Callback after leaderboard submission or cancel
                            this.startFirstLeg();
                        });
                    } else {
                        this.startFirstLeg();
                    }
                });
            }
        }

        // Update high score if this score is better
        if (totalScore > this.highScore) {
            this.highScore = totalScore;
            localStorage.setItem('motorcycleHighScore', this.highScore.toString());
        }

        console.log(`COURSE FINISHED! Distance: ${distance.toFixed(0)}m, Time: ${timeSeconds.toFixed(1)}s, Score: ${totalScore}`);
    }

    // The unlock moment on the finish screen: one card per unlocked leg or
    // bike, with the bike drawn in its own colour and the leg in its light
    buildUnlockPanel(unlocks) {
        const legs = (unlocks && unlocks.legs) || [];
        const characters = (unlocks && unlocks.characters) || [];
        const bikes = (unlocks && unlocks.bikes) || [];
        if (legs.length === 0 && characters.length === 0 && bikes.length === 0) return '';
        const skies = {
            dawn: ['#f6a96b', '#5b6fa8'],
            golden: ['#f7c548', '#c86b28'],
            twilight: ['#c86b9c', '#2b2f63'],
            night: ['#26305c', '#070a1c'],
            storm: ['#59677a', '#1e2530']
        };
        // A new rider comes with their first bike; a rider's next bike is a card of the same kind
        const riderCards = [
            ...characters.map(c => ({ paint: parseInt(c.bikeColor), name: c.name, sub: c.bikeLabel })),
            ...bikes.map(b => ({ paint: b.paint, name: b.title, sub: `${b.rider}'s next bike` }))
        ];
        const bikeCards = riderCards.map(c => {
            const colour = '#' + c.paint.toString(16).padStart(6, '0');
            return `
                <div class="unlock-card unlock-bike" style="--bike: ${colour};">
                    <svg class="unlock-bike-art" viewBox="0 0 120 64" aria-hidden="true">
                        <circle cx="26" cy="46" r="14" fill="none" stroke="#e8edf5" stroke-width="5"/>
                        <circle cx="94" cy="46" r="14" fill="none" stroke="#e8edf5" stroke-width="5"/>
                        <path d="M26 46 L48 24 L78 24 L94 46" fill="none" stroke="#aab4c4" stroke-width="4" stroke-linejoin="round"/>
                        <path d="M40 30 Q52 12 74 16 L86 26 Q70 34 50 34 Z" fill="var(--bike)"/>
                        <path d="M78 14 L88 8" stroke="#e8edf5" stroke-width="4" stroke-linecap="round"/>
                        <circle cx="56" cy="38" r="6" fill="var(--bike)"/>
                    </svg>
                    <div class="unlock-kind">NEW BIKE</div>
                    <div class="unlock-name">${c.name}</div>
                    <div class="unlock-sub">${c.sub}</div>
                </div>`;
        });
        const legCards = legs.map(leg => {
            const sky = skies[leg.timeOfDay] || ['#4a9eff', '#1a2a4a'];
            return `
                <div class="unlock-card unlock-leg" style="--sky-top: ${sky[0]}; --sky-bottom: ${sky[1]};">
                    <div class="unlock-leg-art" aria-hidden="true"></div>
                    <div class="unlock-kind">NEW LEG</div>
                    <div class="unlock-name">${leg.name}</div>
                    <div class="unlock-sub">${leg.description || ''}</div>
                </div>`;
        });
        return `
            <div class="unlock-panel">
                <div class="unlock-head">${UiIcons.svg('unlock')} UNLOCKED</div>
                <div class="unlock-cards">${bikeCards.join('')}${legCards.join('')}</div>
            </div>`;
    }

    // A crash in a world ride opens no dialog and waits for no key: the fall plays out as it is drawn for a short,
    // fixed time (Game.WORLD_CRASH), the call-out says why and what it costs, and then the game puts the bike back on
    // the road by itself (restartInPlace). One crash is one penalty: a second crash called during the fall is the same
    // one. A crash within quickS of the last restart, twice running, means the place is not safe, and each further
    // one moves the next place backStepM further back, so no rider is held in a loop
    beginWorldCrash(cause) {
        if (this.worldCrash || this.finished) return;
        const rule = Game.WORLD_CRASH;
        this.worldCrashStreak = this.worldSinceRestartS < rule.quickS ? (this.worldCrashStreak || 0) + 1 : 0;
        this.worldCrash = { s: 0, stillS: 0 };
        showCallout(`${cause || 'Crashed'}  +${Game.RESTART_PENALTY_MS / 1000} s`, 'bad', Game.CALLOUT_MS.crash);
    }

    // One step of a world ride's crash: the restart once the fall has been seen (mostS, or leastS when the bike has
    // lain still for stillS). A crash nothing announced is begun here, so no crashed bike is ever left lying
    updateWorldCrash(dt) {
        if (!(this.worldSinceRestartS >= 0)) this.worldSinceRestartS = Infinity;
        this.worldSinceRestartS += dt;
        if (this.finished) { this.worldCrash = null; return; }
        if (!this.worldCrash && this.vehicle.crashed) this.beginWorldCrash(this.vehicle.crashCause || undefined);
        const crash = this.worldCrash;
        if (!crash) return;
        const rule = Game.WORLD_CRASH;
        crash.s += dt;
        crash.stillS = Math.abs(this.vehicle.speed || 0) < rule.stillMs ? crash.stillS + dt : 0;
        if (crash.s >= rule.mostS || (crash.s >= rule.leastS && crash.stillS >= rule.stillS)) this.restartFromCheckpoint('crash');
    }

    // cause: what the rider hit, when the game knows it
    showCrashNotification(cause) {
        if (this.environment && this.environment.isWorld) {
            this.beginWorldCrash(cause);
            return;
        }
        // A card over the upper half: the crashed bike stays in view below it
        const crashNotification = document.createElement('div');
        crashNotification.id = 'crashNotification';
        crashNotification.className = 'run-card crash-card';
        crashNotification.setAttribute('role', 'alertdialog');
        crashNotification.setAttribute('aria-label', 'Crashed');
        // After a gate the primary action is the save checkpoint; R still restarts the leg
        const hasCheckpoint = !!this.lastCheckpointPosition;
        const tip = hasCheckpoint
            ? `<div class="crash-tip"><span class="kbd">C</span> back to the last checkpoint, +${Game.RESTART_PENALTY_MS / 1000} s</div>`
            : '';
        const checkpointButton = hasCheckpoint
            ? `<button id="checkpointCrashBtn" class="btn btn-primary" data-key="KeyC"><u>C</u>heckpoint (+${Game.RESTART_PENALTY_MS / 1000} s)</button>`
            : '';
        crashNotification.innerHTML = `
            <div class="crash-title">CRASHED</div>
            <div class="crash-sub">${cause || 'Better luck next time!'}</div>
            ${tip}
            <div class="run-buttons">
                ${checkpointButton}
                <button id="restartCrashBtn" class="btn${hasCheckpoint ? '' : ' btn-primary'}" data-key="KeyR"><u>R</u>estart</button>
                <button id="menuCrashBtn" class="btn" data-key="KeyM" data-menu><u>M</u>enu</button>
            </div>
        `;

        if (this.hud) this.hud.clearTransient();
        // A crash is not dismissed with Escape: the run waits on one of its buttons. P still pauses over it.
        Modals.open(crashNotification, {
            onKey: (event) => {
                if (event.code !== 'KeyP' || event.repeat) return false;
                this.pauseRace();
                return true;
            }
        });

        // Enable R key for restart
        if (this.input) {
            this.input.setMenuActive(true);
        }

        // Add event listeners to buttons
        crashNotification.querySelector('#restartCrashBtn').addEventListener('click', () => {
            const go = () => {
                Modals.close(crashNotification);
                // Disable R key when menu is closed
                if (this.input) {
                    this.input.setMenuActive(false);
                }
                this.restartLeg();
            };
            if (this.environment.isWorld) this.confirmWorldLeave(this.worldRestartAsk(), go);
            else go();
        });

        const checkpointBtn = crashNotification.querySelector('#checkpointCrashBtn');
        if (checkpointBtn) {
            checkpointBtn.addEventListener('click', () => {
                if (this.input) {
                    this.input.setMenuActive(false);
                }
                this.restartFromCheckpoint('crash');
            });
        }

        crashNotification.querySelector('#menuCrashBtn').addEventListener('click', () => {
            const go = () => {
                // Disable R key when menu is closed
                if (this.input) {
                    this.input.setMenuActive(false);
                }
                this.returnToMenu();
            };
            if (this.environment.isWorld) this.confirmWorldLeave(Game.WORLD_MENU_ASK, go);
            else go();
        });

        console.log('Crash notification displayed');
    }

    showLeaderboardEntryUI(onComplete) {
        const overlay = document.getElementById('leaderboardEntryOverlay');
        const nameInput = document.getElementById('leaderboardNameInput');
        const submitBtn = document.getElementById('leaderboardSubmitBtn');
        const cancelBtn = document.getElementById('leaderboardCancelBtn');
        const entryForm = document.getElementById('leaderboardEntryForm');
        const resultDiv = document.getElementById('leaderboardResult');
        const errorDiv = document.getElementById('leaderboardError');
        const closeBtn = document.getElementById('leaderboardCloseBtn');
        const errorCloseBtn = document.getElementById('leaderboardErrorCloseBtn');

        // The form shows the rule the service enforces
        const rule = this.leaderboardService.nameRule();
        const validName = value => value.trim().length >= rule.min && value.trim().length <= rule.max;
        const letters = rule.min === rule.max ? `${rule.max} letters` : `${rule.min}-${rule.max} letters`;
        entryForm.querySelector('.leaderboard-entry-subtitle').textContent = `Enter your name (${letters})`;
        nameInput.maxLength = rule.max;
        // The rule itself is the server's; only the placeholder is held to what the 250 px box can show
        nameInput.placeholder = '_'.repeat(Math.min(rule.max, Game.NAME_PLACEHOLDER_MAX));

        // Reset to entry form
        entryForm.style.display = 'block';
        resultDiv.style.display = 'none';
        errorDiv.style.display = 'none';
        nameInput.value = '';
        submitBtn.disabled = true;

        // Show overlay. It lives in index.html, so the stack keeps it in the page when it closes; Escape presses
        // the visible Cancel or Close (data-key in index.html)
        overlay.classList.add('active');
        Modals.open(overlay, { keep: true, focus: nameInput });

        // Enable/disable submit button based on input
        const inputHandler = () => {
            submitBtn.disabled = !validName(nameInput.value);
        };
        nameInput.addEventListener('input', inputHandler);

        // Handle submit
        const submitHandler = () => {
            const playerName = nameInput.value.trim().toUpperCase();
            if (validName(playerName)) {
                // Disable buttons during submission
                submitBtn.disabled = true;
                cancelBtn.disabled = true;
                nameInput.disabled = true;

                this.leaderboardService.submitRun(playerName).then(result => {
                    if (result.success) {
                        console.log(`Leaderboard submitted! Rank: ${result.rank}`);

                        // Show result screen
                        entryForm.style.display = 'none';
                        resultDiv.style.display = 'block';

                        document.getElementById('leaderboardRankDisplay').innerHTML =
                            `<div class="leaderboard-result-rank">#${result.rank}</div>`;

                        if (result.flagged) {
                            document.getElementById('leaderboardFlaggedDisplay').innerHTML =
                                `<div class="leaderboard-result-flagged">⚠ Flagged for review</div>`;
                        } else {
                            document.getElementById('leaderboardFlaggedDisplay').innerHTML = '';
                        }
                    } else {
                        console.error('Failed to submit leaderboard:', result.error);
                        this.showLeaderboardError('Failed to submit: ' + result.error);
                    }
                }).catch(error => {
                    console.error('Leaderboard submission error:', error);
                    this.showLeaderboardError('Error: ' + error.message);
                });
            }
        };

        // Handle enter key
        const keyHandler = (e) => {
            if (e.key === 'Enter' && validName(nameInput.value)) {
                submitHandler();
            }
        };
        nameInput.addEventListener('keypress', keyHandler);

        submitBtn.addEventListener('click', submitHandler);

        // Single shared teardown - the buttons are persistent DOM elements, so
        // every handler must be removed on every exit path or stale handlers
        // (with captured onComplete callbacks) accumulate across legs
        let finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;

            overlay.classList.remove('active');
            Modals.close(overlay);
            nameInput.disabled = false;
            submitBtn.disabled = false;
            cancelBtn.disabled = false;

            nameInput.removeEventListener('input', inputHandler);
            nameInput.removeEventListener('keypress', keyHandler);
            submitBtn.removeEventListener('click', submitHandler);
            cancelBtn.removeEventListener('click', cancelHandler);
            closeBtn.removeEventListener('click', closeHandler);
            errorCloseBtn.removeEventListener('click', errorCloseHandler);

            if (onComplete) onComplete();
        };

        // Handle cancel
        const cancelHandler = () => {
            this.leaderboardService.cancelSession();
            finish();
        };
        cancelBtn.addEventListener('click', cancelHandler);

        // Handle close after successful submission
        const closeHandler = () => finish();
        closeBtn.addEventListener('click', closeHandler);

        // Handle error close
        const errorCloseHandler = () => finish();
        errorCloseBtn.addEventListener('click', errorCloseHandler);
    }

    // Read-only leaderboard viewer, reachable from the leg-selector menu
    // Local best times are kept per board, so a leg whose course changed
    // starts a new record instead of inheriting one set on the old road
    bestTimeKey(leg) {
        return `motorcycleBestTime_${TourSystem.boardId(leg)}`;
    }

    bestSplitsKey(leg) {
        return RaceTiming.splitsKey(TourSystem.boardId(leg));
    }

    // What the splits compare against: the local best splits now, and the
    // online record once it arrives. The start never waits on the network,
    // and a failed fetch only means no record comparison this run.
    loadSplitReferences(leg) {
        this.bestSplits = RaceTiming.loadSplits(localStorage, this.bestSplitsKey(leg), this.gateTotal());
        this.record = null;
        if (!this.leaderboardService) return;
        const board = TourSystem.boardId(leg);
        this.recordBoard = board;
        this.leaderboardService.fetchLeaderboard(board, 10).then(result => {
            // A leg change while the fetch was in flight makes this stale
            if (this.recordBoard !== board) return;
            if (result && result.success) {
                this.record = RaceTiming.pickRecord(result.entries, this.gateTotal());
            } else {
                console.warn('Record unavailable for', board, result && result.error);
            }
        }).catch(error => console.warn('Record fetch failed for', board, error));
    }

    async showLeaderboardViewer(legId) {
        const leg = this.tourSystem.getLegById(legId);
        const legName = leg ? leg.name : legId;

        // Remove any existing viewer
        const existing = document.getElementById('leaderboardViewer');
        if (existing) Modals.close(existing);

        const overlay = document.createElement('div');
        overlay.id = 'leaderboardViewer';
        overlay.className = 'lb-viewer';

        const panel = document.createElement('div');
        panel.className = 'lb-panel';
        const safeLegName = String(legName).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
        panel.innerHTML = `
            <h2 class="lb-title">${UiIcons.svg('trophy')} Best times</h2>
            <div class="lb-leg">${safeLegName}</div>
            <div id="leaderboardViewerBody" class="lb-body">Loading…</div>
            <button id="leaderboardViewerClose" class="lb-close" data-key="Escape">Close</button>
        `;
        overlay.appendChild(panel);
        Modals.open(overlay);

        const close = () => Modals.close(overlay);
        panel.querySelector('#leaderboardViewerClose').addEventListener('click', close);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });

        const body = panel.querySelector('#leaderboardViewerBody');

        // Local best time always shows, even offline
        const localBest = parseFloat(localStorage.getItem(this.bestTimeKey(legId)) || 'NaN');
        const localBestHtml = Number.isFinite(localBest)
            ? `<div class="lb-best">Your best: ${RaceTiming.formatTime(localBest * 1000)}</div>`
            : '<div class="lb-best none">No personal best yet</div>';

        if (!this.leaderboardService) {
            body.innerHTML = localBestHtml +
                '<div class="lb-note">Online leaderboard unavailable<br>(no connection to the leaderboard service)</div>';
            return;
        }

        try {
            const result = await this.leaderboardService.fetchLeaderboard(TourSystem.boardId(legId), 10);
            if (result.success && result.entries && result.entries.length > 0) {
                const rows = result.entries.map((entry, i) => {
                    const rank = entry.rank !== undefined ? entry.rank : i + 1;
                    const medal = `${rank}.`;
                    const time = LeaderboardService.formatTime(entry.totalTime);
                    const flag = entry.flagged ? ' ⚠' : '';
                    // A restarted run shows its count beside the time
                    const restarts = entry.restarts > 0 ? ` <small>${entry.restarts}R</small>` : '';
                    return `<tr>
                        <td class="lb-rank">${medal}</td>
                        <td class="lb-name">${String(entry.playerName).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)}</td>
                        <td class="lb-time">${time}${restarts}${flag}</td>
                    </tr>`;
                }).join('');
                body.innerHTML = localBestHtml +
                    `<table class="lb-table">${rows}</table>`;
            } else if (result.success) {
                body.innerHTML = localBestHtml +
                    '<div class="lb-note">No times posted yet - be the first!</div>';
            } else {
                body.innerHTML = localBestHtml +
                    '<div class="lb-note">Could not load the online leaderboard</div>';
            }
        } catch (error) {
            console.error('Leaderboard viewer error:', error);
            body.innerHTML = localBestHtml +
                '<div class="lb-note">Could not load the online leaderboard</div>';
        }
    }

    // A full restart invalidates the current leaderboard run; start a fresh
    // session so the new attempt is submittable
    restartLeaderboardSession() {
        if (!this.leaderboardService) return;
        this.leaderboardService.cancelSession();
        // A world starts no session until its boards exist (R6): a restart there only cancels, and a leg that
        // was played earlier in the same page life must not give it a board
        if (this.environment && this.environment.isWorld) return;
        const leg = this.tourSystem.getCurrentLeg();
        // A tuned ride stays without a session until the next ride begins (markTuned)
        if (leg && !this.rideTuned) {
            this.leaderboardService.startRun(TourSystem.boardId(leg), this.leaderboardExpectation(leg)).then(result => {
                if (result !== true && result.error) {
                    console.warn('Leaderboard session restart failed:', result.message);
                }
            }).catch(error => console.error('Failed to restart leaderboard session:', error));
        }
    }

    // ================= Menu showcases =================
    // Live 3D backdrops behind the menu: an orbiting camera around the
    // character bikes (rider screen) and a flythrough of the focused leg
    // (track screen). One RAF loop serves both; it never runs during play.

    riderDisplayOrder() {
        const unlocks = this.tourSystem.characterUnlocks || {};
        return CHARACTERS.slice().sort((a, b) => (unlocks[a.id] || 0) - (unlocks[b.id] || 0));
    }

    // 'lit' | 'dimmed' | 'silhouette' per the progression tiering
    riderTier(characterId) {
        const order = this.riderDisplayOrder();
        const firstLocked = order.find(c => !this.tourSystem.isCharacterUnlocked(c.id));
        if (this.tourSystem.isCharacterUnlocked(characterId)) return 'lit';
        return firstLocked && firstLocked.id === characterId ? 'dimmed' : 'silhouette';
    }

    startRiderShowcase(focusId) {
        this.endTrackPreview();

        if (!this.showcaseBikes) {
            // Always present the riders in clear daylight, whatever leg was
            // ridden or previewed last
            this.snapAtmosphere(AtmosphereTrack.oneLook({
                timeOfDay: 'golden', weather: 'clear', weatherIntensity: 0, heightFog: null, shafts: 0, ring: 1
            }), 0);
            this.scene.fog.color.setHex(this.timeConfigs.golden.fogColor);
            this.scene.fog.density = 0.0018;
            // Start on the bike instead of flying in from the last camera position
            this.showcaseSnap = true;

            const platformGeometry = new THREE.CylinderGeometry(2.2, 2.4, 0.12, 28);
            const platformMaterial = new THREE.MeshStandardMaterial({ color: 0x141a26, roughness: 0.4, metalness: 0.6 });
            const silhouetteMaterial = new THREE.MeshBasicMaterial({ color: 0x05070c });

            this.showcaseBikes = {};
            this.showcaseExtras = [];
            this.showcaseSilhouette = silhouetteMaterial;
            this.riderDisplayOrder().forEach((c, i) => {
                const v = this.buildShowcaseBike(c, i * 14);
                const platform = new THREE.Mesh(platformGeometry, platformMaterial);
                platform.position.set(v.position.x, v.position.y - 0.06, v.position.z);
                platform.receiveShadow = true;
                this.scene.add(platform);
                this.showcaseExtras.push(platform);

            });

            // Showroom floor: glossy, fading out to the horizon haze so the
            // stage does not end in a hard edge
            const fadeCanvas = document.createElement('canvas');
            fadeCanvas.width = 128;
            fadeCanvas.height = 128;
            const fadeCtx = fadeCanvas.getContext('2d');
            const fade = fadeCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
            fade.addColorStop(0, '#ffffff');
            fade.addColorStop(0.55, '#ffffff');
            fade.addColorStop(1, '#000000');
            fadeCtx.fillStyle = fade;
            fadeCtx.fillRect(0, 0, 128, 128);
            const riderCount = Object.keys(this.showcaseBikes).length;
            const floor = new THREE.Mesh(
                new THREE.PlaneGeometry(riderCount * 14 + 160, 160),
                new THREE.MeshStandardMaterial({
                    color: 0x1b2230,
                    roughness: 0.4,
                    metalness: 0.5,
                    envMapIntensity: 1.2,
                    alphaMap: new THREE.CanvasTexture(fadeCanvas),
                    transparent: true
                })
            );
            floor.rotation.x = -Math.PI / 2;
            floor.position.set((riderCount - 1) * 7, -400.13, 0);
            floor.receiveShadow = true;
            this.scene.add(floor);
            this.showcaseExtras.push(floor);
        }

        this.graphics.fixColorSpaces();

        this.showcaseMode = 'rider';
        this.focusRiderShowcase(focusId);
        this.showcaseOrbitAngle = this.showcaseOrbitAngle || 0;
        this.startMenuShowcaseLoop();
    }

    focusRiderShowcase(focusId) {
        this.showcaseFocusId = focusId;
        // Only the bike in view is fetched: the others keep their stand-in
        // (their own far level when the file is in memory, else procedural)
        // until they are focused (BikeModels.dress fetches once), and a
        // locked rider's silhouette never needs the file
        const v = this.showcaseBikes && this.showcaseBikes[focusId];
        if (v && (!v.modelled || v.far) && !v.dressing && this.riderTier(focusId) !== 'silhouette' && typeof BikeModels !== 'undefined') {
            v.dressing = true;
            BikeModels.dress(v);
        }
    }

    // The bike the selected rider rides: their pick on the rider select
    selectedBike() {
        if (!this.selectedCharacter || !this.tourSystem.getSelectedBike) return null;
        return this.tourSystem.getSelectedBike(this.selectedCharacter.id);
    }

    // What the selected rider wears: their pick, by outfit id
    selectedOutfit() {
        if (!this.selectedCharacter || !this.tourSystem.getSelectedOutfit) return null;
        return this.tourSystem.getSelectedOutfit(this.selectedCharacter.id);
    }

    // One character's bike on the rider-select stage at `x`: their chosen
    // bike as a stand-in (focusRiderShowcase dresses it), shaded by the
    // rider's unlock tier
    buildShowcaseBike(c, x) {
        const bikeId = this.tourSystem.getSelectedBike ? this.tourSystem.getSelectedBike(c.id) : null;
        const outfit = this.tourSystem.getSelectedOutfit ? this.tourSystem.getSelectedOutfit(c.id) : null;
        const v = new Vehicle(this.scene, null, c, bikeId, { model: 'far', outfit });
        // Stage far below the world so previews never collide with track geometry
        v.position.set(x, -400, 0);
        v.yawAngle = 0;
        v.updateMesh();

        // Run again when the modelled bike takes over from the
        // procedural one, so it works from each material's lit colour
        // and gives the same result however often it runs.
        const tier = this.riderTier(c.id);
        const silhouetteMaterial = this.showcaseSilhouette;
        const shade = () => {
            if (tier === 'dimmed') {
                const uses = new Map();
                v.group.traverse(o => {
                    if (o.isMesh && o.material) uses.set(o.material, (uses.get(o.material) || 0) + 1);
                });
                const palette = new Set(Object.values(v.palette || {}));
                uses.forEach((count, material) => {
                    if (material.color) {
                        if (!material.userData.lit) material.userData.lit = material.color.clone();
                        // The procedural bike darkens a material once
                        // for each part that wears it, so its shared
                        // finishes go black and the one-off ones (the
                        // helmet, the rims) stay readable. A modelled
                        // bike has few parts: its palette finishes
                        // take the dark end, the rest the light end.
                        const factor = v.modelled ? (palette.has(material) ? 0.03 : 0.12) : Math.pow(0.22, count);
                        material.color.copy(material.userData.lit).multiplyScalar(factor);
                    }
                    if (material.emissiveIntensity !== undefined) material.emissiveIntensity = 0;
                });
            } else if (tier === 'silhouette') {
                v.group.traverse(o => {
                    if (o.isMesh && o.material !== silhouetteMaterial) {
                        if (o.material && o.material.dispose) o.material.dispose();
                        o.material = silhouetteMaterial;
                    }
                });
            }
        };
        shade();
        v.onModel = shade;
        this.showcaseBikes[c.id] = v;
        return v;
    }

    // The rider select's bike picker moved: that character's stage bike
    // becomes the bike now chosen
    changeShowcaseBike(characterId) {
        const old = this.showcaseBikes && this.showcaseBikes[characterId];
        if (!old) return;
        const c = CHARACTERS.find(character => character.id === characterId);
        this.scene.remove(old.group);
        old.onModel = null;
        old.group.traverse(o => {
            if (o.isMesh && o.material && o.material !== this.showcaseSilhouette && o.material.dispose) o.material.dispose();
        });
        this.buildShowcaseBike(c, old.position.x);
        if (this.showcaseFocusId === characterId) this.focusRiderShowcase(characterId);
    }

    startTrackPreview(legIndex) {
        this.endRiderShowcase();

        const leg = this.tourSystem.legs[legIndex];
        if (!leg) return;

        // Every leg previews in full - locked ones are gated in the UI only
        this.endTrackPreview();
        // A converted leg builds the two sections round its preview point only
        const course = typeof Course !== 'undefined' ? Course.forLeg(leg.id) : null;
        const coursePivot = course ? (course.preview && course.preview.segment !== undefined ? course.preview.segment : Math.floor(course.segments / 2)) : null;
        this.previewEnv = new Environment(this.scene, leg.startSegment, leg.endSegment, legIndex, course ? { window: coursePivot, preview: true } : {});
        this.previewEnv.applyLandscapeConfig(this.previewEnv.config.look);

        // The look of the part that holds the orbit pivot. The fog density is the
        // landscape's own, written above: the preview makes no weather system.
        const route = this.previewEnv.route;
        const track = AtmosphereTrack.forLeg(leg, this.previewEnv.config, this.previewEnv);
        const pivotSegment = course ? coursePivot : Math.floor((leg.startSegment + Math.min(leg.endSegment, route.unitCount - 1)) / 2);
        this.snapAtmosphere(track, track.settledSegment(pivotSegment), { environment: this.previewEnv, weatherSystem: null });

        // Orbit pivot: a scenic point mid-leg, viewed close-up - tight framing
        // keeps the low-poly scenery reading well (wide aerials don't)
        const mid = route.pointAtUnit(pivotSegment);
        this.previewCenter = new THREE.Vector3(mid.x, (mid.y || 0), mid.z);
        // How far out and how high the camera stands comes from the leg: a
        // leg with trees beside the road has no room for the default 30
        const preview = Terrain.legConfig(leg.id).preview || { radius: 30, height: 9 };
        this.previewRadius = preview.radius;
        this.previewHeight = preview.height;
        // A full circle would pass through whatever stands beside the road:
        // the camera instead sways through an arc about the road's normal on
        // the leg's open side (the right unless `side` is -1), at the radius
        // and height the leg gives above.
        this.previewBaseAngle = -mid.heading + (preview.side === -1 ? Math.PI : 0);

        this.graphics.fixColorSpaces();

        this.previewLeg = leg;
        this.previewOrbitAngle = this.previewOrbitAngle || 0;
        this.showcaseMode = 'track';
        this.startMenuShowcaseLoop();
    }

    endRiderShowcase() {
        if (this.showcaseBikes) {
            Object.values(this.showcaseBikes).forEach(v => {
                this.scene.remove(v.group);
                this.disposeObject(v.group);
            });
            this.showcaseBikes = null;
        }
        if (this.showcaseExtras) {
            this.showcaseExtras.forEach(o => {
                this.scene.remove(o);
                this.disposeObject(o);
            });
            this.showcaseExtras = null;
        }
    }

    endTrackPreview() {
        if (this.previewEnv) {
            // Remove everything the preview environment added to the scene
            const keep = this.persistentSceneObjects();
            // Showcase bikes/platforms survive an env teardown
            if (this.showcaseBikes) Object.values(this.showcaseBikes).forEach(v => keep.add(v.group));
            if (this.showcaseExtras) this.showcaseExtras.forEach(o => keep.add(o));

            this.scene.children.filter(c => !keep.has(c)).forEach(obj => {
                this.scene.remove(obj);
                this.disposeObject(obj);
            });
            this.previewEnv = null;
            this.previewLeg = null;
        }
    }

    endMenuShowcase() {
        this.showcaseMode = null;
        if (this.menuShowcaseRAF) {
            cancelAnimationFrame(this.menuShowcaseRAF);
            this.menuShowcaseRAF = null;
        }
        this.endRiderShowcase();
        this.endTrackPreview();
    }

    startMenuShowcaseLoop() {
        if (this.menuShowcaseRAF) return; // Already running
        this.lastShowcaseTime = performance.now();
        const loop = () => {
            if (!this.showcaseMode) { this.menuShowcaseRAF = null; return; }
            this.menuShowcaseRAF = requestAnimationFrame(loop);

            const now = performance.now();
            const dt = Math.min((now - this.lastShowcaseTime) / 1000, 0.05);
            this.lastShowcaseTime = now;

            if (this.showcaseMode === 'rider' && this.showcaseBikes) {
                // Slow orbit around the focused bike
                this.showcaseOrbitAngle += dt * 0.45;
                const focus = this.showcaseBikes[this.showcaseFocusId] || Object.values(this.showcaseBikes)[0];
                const target = focus.position;
                const r = 4.2;
                const camX = target.x + Math.cos(this.showcaseOrbitAngle) * r;
                const camZ = target.z + Math.sin(this.showcaseOrbitAngle) * r;
                // Ease toward the orbit point so focus changes glide across
                this.camera.position.lerp(new THREE.Vector3(camX, target.y + 1.6, camZ), this.showcaseSnap ? 1 : Math.min(1, dt * 4));
                this.showcaseSnap = false;
                // The sun and its shadow frustum follow the stage
                this.directionalLight.position.set(target.x + 30, target.y + 45, target.z + 22);
                this.directionalLight.target.position.copy(target);
                this.directionalLight.target.updateMatrixWorld();
                this.camera.up.set(0, 1, 0);
                this.camera.fov = 50;
                this.camera.updateProjectionMatrix();
                this.camera.lookAt(target.x, target.y + 0.65, target.z);
            } else if (this.showcaseMode === 'track' && this.previewEnv) {
                // Slow swaying arc over the valley side of a mid-leg viewpoint,
                // close to the road, looking back at the course and cliff
                this.previewOrbitAngle += dt * 0.3;
                const sway = Math.sin(this.previewOrbitAngle) * 1.0; // ±57 degrees
                const angle = this.previewBaseAngle + sway;
                const c = this.previewCenter;
                const r = this.previewRadius;
                this.camera.position.set(
                    c.x + Math.cos(angle) * r,
                    c.y + this.previewHeight,
                    c.z + Math.sin(angle) * r
                );
                this.camera.up.set(0, 1, 0);
                this.camera.fov = 55;
                this.camera.updateProjectionMatrix();
                this.camera.lookAt(c.x, c.y + 1.5, c.z);
            }

            this.graphics.update(dt);
            this.graphics.render(this.scene, this.camera);
        };
        this.menuShowcaseRAF = requestAnimationFrame(loop);
    }

    showLeaderboardError(message) {
        const entryForm = document.getElementById('leaderboardEntryForm');
        const resultDiv = document.getElementById('leaderboardResult');
        const errorDiv = document.getElementById('leaderboardError');
        const errorMessage = document.getElementById('leaderboardErrorMessage');

        entryForm.style.display = 'none';
        resultDiv.style.display = 'none';
        errorDiv.style.display = 'block';
        errorMessage.textContent = message;
    }

    updateRacePosition() {
        if (!this.traffic || !this.traffic.motorcycles || !this.vehicle || !this.environment || !this.environment.route) return;

        // Cache the elements; skip all the work if the UI doesn't include them
        if (this.racePositionElements === undefined) {
            this.racePositionElements = {
                position: document.getElementById('position'),
                suffix: document.querySelector('.position-suffix'),
                total: document.getElementById('totalRacers')
            };
            if (!this.racePositionElements.position && !this.racePositionElements.suffix && !this.racePositionElements.total) {
                this.racePositionElements = null;
            }
        }
        if (!this.racePositionElements) return;

        const playerSegment = Math.floor(this.environment.route.toUnits(this.vehicle.routeS || 0));
        const playerProgress = this.vehicle.segmentProgress || 0;
        const totalSegments = this.environment.route.unitCount;
        const playerTotalProgress = playerSegment + playerProgress;
        
        let position = 1;
        
        this.traffic.motorcycles.forEach(bike => {
            if (bike.currentSegment !== undefined && bike.currentSegment !== null) {
                const bikeSegment = Math.floor(bike.currentSegment);
                const bikeProgress = bike.segmentProgress || 0;
                const bikeTotalProgress = bikeSegment + bikeProgress;
                
                // Handle wrap-around for looping track
                let progressDiff = bikeTotalProgress - playerTotalProgress;
                if (progressDiff > totalSegments / 2) {
                    progressDiff -= totalSegments;
                } else if (progressDiff < -totalSegments / 2) {
                    progressDiff += totalSegments;
                }
                
                if (progressDiff > 0) {
                    position++;
                }
            }
        });
        
        if (position !== this.lastDisplayedPosition) {
            this.lastDisplayedPosition = position;
            const suffix = position === 1 ? 'st' : position === 2 ? 'nd' : position === 3 ? 'rd' : 'th';
            if (this.racePositionElements.position) {
                this.racePositionElements.position.textContent = position;
            }
            if (this.racePositionElements.suffix) {
                this.racePositionElements.suffix.textContent = suffix;
            }
            if (this.racePositionElements.total) {
                this.racePositionElements.total.textContent = this.traffic.motorcycles.length + 1;
            }
        }
    }
    
    animate() {
        this.animationFrameId = requestAnimationFrame(() => this.animate());

        // FPS calculation
        this.frameCount++;
        const now = performance.now();
        if (now - this.lastTime >= 1000) {
            this.fps = this.frameCount;
            this.frameCount = 0;
            this.lastTime = now;
            if (this.hud) this.hud.setFps(this.fps);
        }
        // The graphics level reads every frame's time (Game.adaptResolution)
        this.adaptResolution(now);

        // Get actual frame time and accumulate for fixed timestep
        const rawDeltaTime = Math.min(this.clock.getDelta(), 0.05); // Cap at 50ms
        this.accumulatedTime += rawDeltaTime;
        this.accumulatedTime = Math.min(this.accumulatedTime, this.maxAccumulatedTime); // Prevent spiral of death

        // Check for pause toggle
        // The confirm box owns the pause while it is open: only its answer resumes the ride
        if (this.input.checkPause() && !this.worldConfirm) {
            if (this.paused) this.resumeRace();
            else this.pauseRace();
        }

        // Skip all game logic if paused, but continue rendering
        if (this.paused) {
            this.soundManager.stopEngineSound();
            // (photo mode: its own camera round the bike, js/world/photo.js)
            if (this.photo) this.photo.apply(this.camera);
            this.graphics.render(this.scene, this.camera);
            return;
        }

        // The stop scene (StopScene) moves the bikes and the camera itself: no physics, no input, the land streamed
        // round the player's bike
        if (this.stopScene) {
            this.stepStopScene(rawDeltaTime);
            // (the crew comes in from wherever it was: what the distance cull hid round it is shown again)
            this.updatePerformanceCulling();
            if (this.environment && this.environment.isWorld) this.environment.update(this.vehicle.position, this.stopScene.stop.s, null, Game.SECTION_BUDGET_MS, rawDeltaTime);
            this.graphics.render(this.scene, this.camera);
            return;
        }

        this.watchTuning();

        // A world ride eases the steer keys (SteerEase); a leg has no physics object and keeps its own smoothing
        const world = this.vehicle && this.vehicle.worldPhysics;
        const steeringInput = this.input.getSteeringInput(world ? world.steerKeys : null);
        const throttleInput = this.input.getThrottleInput();
        const brakeInput = this.input.getBrakeInput();
        const wheelieInput = this.input.getWheelieInput();
        if (!Number.isFinite(this.firstInputAt) && (steeringInput || throttleInput || brakeInput || wheelieInput)) {
            this.firstInputAt = this.raceElapsed();
        }

        // Handle one-shot input actions once per frame (not per physics step)

        // Check for menu return. A world ride asks first and goes on until the answer is yes.
        if (this.input.checkMenuReturn()) {
            if (this.environment.isWorld && !this.finished) {
                this.confirmWorldLeave(Game.WORLD_MENU_ASK, () => this.returnToMenu());
            } else {
                // Remove finish banner if it exists
                const finishBanner = document.getElementById('finishBanner');
                if (finishBanner) {
                    Modals.close(finishBanner);
                }

                // Remove crash notification if it exists
                const crashNotification = document.getElementById('crashNotification');
                if (crashNotification) {
                    Modals.close(crashNotification);
                }

                // Disable menu keys when menu is closed
                if (this.input) {
                    this.input.setMenuActive(false);
                }

                this.returnToMenu();
                // Leg state was torn down and this loop cancelled - stop this frame
                return;
            }
        }

        // Check for reset
        if (this.input.checkReset()) {
            if (this.environment.isWorld) this.confirmWorldLeave(this.worldRestartAsk(), () => this.restartLeg());
            else this.restartLeg();
        }

        // Next leg (N key): only offered by the finish banner of a non-final
        // leg, and it must take the same path as the button (name entry)
        if (this.input.checkNextLeg()) {
            const nextLegBtn = document.getElementById('nextLegBtn');
            if (nextLegBtn) {
                nextLegBtn.click();
                return;
            }
        }

        // Check for sound toggle
        if (this.input.checkSoundToggle()) {
            this.soundManager.toggleSound();
        }

        // Check for checkpoint restart (a world ride: the restart in place)
        if (this.input.checkCheckpointRestart()) {
            if (this.lastCheckpointPosition || (this.environment && this.environment.isWorld)) {
                this.restartFromCheckpoint();
            } else {
                console.log('No checkpoint available for restart');
            }
        }
        
        // Check for camera mode switch
        if (this.input.checkCameraSwitch()) {
            this.cameraMode = (this.cameraMode + 1) % this.cameraModes.length;
            localStorage.setItem('twistyCameraMode', String(this.cameraMode));
            console.log(`Camera mode: ${this.cameraModes[this.cameraMode].name}`);
            
            showCallout(`Camera: ${this.cameraModes[this.cameraMode].name}`, 'info', 1000);
        }

        // Run physics in fixed timesteps - ensures consistent movement
        // regardless of variable frame timing
        // The simulated time this frame steps, which the world's streamer measures its disposal grace on
        let simulatedThisFrame = 0;
        while (this.accumulatedTime >= this.fixedTimeStep) {
            const deltaTime = this.fixedTimeStep; // Always 16.67ms
            simulatedThisFrame += deltaTime;

        // Check for crash (before updating vehicle)
        const wasCrashed = this.vehicle.crashed;

        // While the land under the bike has no data (Game.watchLand), the bike is held where it stands: the ground there
        // would be the far grid's, which the land may come back above
        const held = this.landHeld ? (this.landHoldAt || (this.landHoldAt = new THREE.Vector3())).copy(this.vehicle.position) : null;
         this.vehicle.update(deltaTime, held ? 0 : steeringInput, held ? 0 : throttleInput, held ? 1 : brakeInput, held ? 0 : wheelieInput);
        if (held) {
            this.vehicle.position.copy(held);
            this.vehicle.speed = 0;
        }

         // Play crash sound if we just crashed (but not if finished)
        if (!wasCrashed && this.vehicle.crashed && !this.finished) {
            this.soundManager.playCrashSound();
            // A world crash says what caused it; a leg's card keeps its own line
            this.showCrashNotification(this.vehicle.crashCause || undefined);
        }

        this.sayBrush();
        this.sayFoot();

        if (this.environment.isWorld) this.updateWorldCrash(deltaTime);

        // Show wheelie help when over halfway round the course
        if (!this.hasShownWheelieHelp && !this.vehicle.crashed && !this.finished) {
            if (this.checkpointsPassed >= Math.ceil(this.gateTotal() / 2)) { // Over halfway round the course
                this.showWheelieHelpNotification();
                this.hasShownWheelieHelp = true;
            }
        }

        // Check for checkpoint passes and jump scoring
        if (!this.vehicle.crashed && !this.finished) {
            if (this.environment.isWorld) {
                if (this.freeRoam) this.updateFreeRoam(deltaTime);
                else this.updateWorldRun(deltaTime);
                this.updateRoadworks();
            }
            this.checkCheckpoints();
            this.checkJumpScoring();
            this.checkSpeedStreak(deltaTime);
            this.checkNearMisses();
        }

        // Check for finish line crossing (a world's last station is the finish: WorldRun)
        if (!this.finished && !this.vehicle.crashed && this.environment.finishGate && !this.environment.isWorld) {
            if (this.inGate(this.environment.finishGate, this.vehicle.position)) this.finishRun();
        }

        // Check if vehicle is in roadworks zone
        let inRoadworksZone = false;
        if (this.environment.roadworksZones) {
            let currentSegment = 0;
            const vehicleSegment = this.environment.route.toUnits(this.vehicle.routeS || 0);
            if (vehicleSegment < this.environment.route.unitCount) {
                currentSegment = vehicleSegment;
            }
            for (const zone of this.environment.roadworksZones) {
                if (currentSegment >= zone.startSegment && currentSegment <= zone.endSegment) {
                    inRoadworksZone = true;
                    break;
                }
            }
        }

        // Update traffic
        if (this.traffic) {
            this.traffic.lightLevel = this.headlightStrength || 0;
            const collision = this.traffic.update(deltaTime, this.vehicle.position, Math.floor(this.environment.route.toUnits(this.vehicle.routeS || 0)), this.vehicle);
            // A rider of a world's crew touched (Traffic.contact): a crash says whom the player rode into (the crash
            // was set after vehicle.update(), as the car's below), a bump says who was bumped
            const touched = collision && collision.rider;
            if (touched && touched.kind === 'crash' && !this.finished) {
                this.soundManager.playCrashSound();
                this.showCrashNotification(this.vehicle.crashCause || undefined);
            } else if (touched && touched.kind === 'bump' && !this.finished) {
                showCallout(`Bumped ${touched.name}`, 'warn', Game.CALLOUT_MS.bump);
            }
            // The roadworks leave one corridor for both directions, so a car
            // on its detour (which starts before the zone and ends after it)
            // cannot be avoided: no crash against it
            const carOnDetour = collision && collision.car && collision.car.inDetour;
            if (collision && collision.hit && !this.vehicle.crashed && !inRoadworksZone && !carOnDetour) {
                this.vehicle.crashed = true;
                this.vehicle.crashWhy = 'car';
                this.vehicle.crashAngle = this.vehicle.leanAngle || 0.5;
                // The crash was set after vehicle.update(), so the generic
                // "just crashed" check above never sees this one. (Not after
                // the finish: the results banner must stay in charge.)
                if (!this.finished) {
                    this.soundManager.playCrashSound();
                    this.showCrashNotification('You hit a car');
                } else {
                    this.showCollisionWarning();
                }
                
                // Calculate impact direction based on car position
                const car = collision.car;
                // The rider who comes off stops against the car, not in it (Vehicle.stepRiderFall)
                if (car && car.carGroup) this.vehicle.blockRider(car.carGroup.position.x, car.carGroup.position.z, 1.1);
                // And meets it as it comes: its middle toward the bike, and its own way (Vehicle.riderCrash)
                if (car && car.carGroup) {
                    const way = car.carGroup.rotation.y, pace = car.currentSpeed || 0;
                    this.vehicle.hitFrom(this.vehicle.position.x - car.carGroup.position.x, this.vehicle.position.z - car.carGroup.position.z, Math.sin(way) * pace, Math.cos(way) * pace);
                }
                if (car && car.carGroup) {
                    const impactDir = new THREE.Vector3(
                        this.vehicle.position.x - car.carGroup.position.x,
                        0,
                        this.vehicle.position.z - car.carGroup.position.z
                    ).normalize();
                    
                    // Combine vehicle and car speeds for impact force
                    const relativeSpeed = this.vehicle.speed + car.currentSpeed * 0.5;
                    const impactForce = Math.min(relativeSpeed * 0.3, 8);
                    
                    this.vehicle.velocity = impactDir.multiplyScalar(impactForce);
                    this.vehicle.velocity.y = 4; // Upward force from impact
                } else {
                    // Fallback if car data not available
                    const impactForce = Math.min(this.vehicle.speed * 0.3, 6);
                    this.vehicle.velocity = new THREE.Vector3(
                        Math.random() - 0.5,
                        2,
                        Math.random() - 0.5
                    ).normalize().multiplyScalar(impactForce);
                }
                
                console.log('CRASHED! Hit a car at', (this.vehicle.speed * 2.237).toFixed(1) + ' mph');

                // Spawn collision sparks at impact point
                if (this.particles && car && car.carGroup) {
                    const impactPoint = this.vehicle.position.clone();
                    const impactDir = new THREE.Vector3(
                        car.carGroup.position.x - this.vehicle.position.x,
                        0,
                        car.carGroup.position.z - this.vehicle.position.z
                    );
                    const sparkIntensity = Math.min(this.vehicle.speed / 40, 1.5);
                    this.particles.createCollisionSparks(impactPoint, impactDir, sparkIntensity);
                }
            }
        }
        
        // Update rockfalls and check for rock hits
        if (this.rockfalls) {
            const rockHit = this.rockfalls.update(deltaTime, this.vehicle);
            if (rockHit && rockHit.hit && !this.vehicle.crashed && !this.finished &&
                !(rockHit.rock.settled && this.vehicle.attemptHop(rockHit.rock.radius))) {
                this.vehicle.crashed = true;
                this.vehicle.crashWhy = 'obstacle';
                this.vehicle.blockRider(rockHit.rock.mesh.position.x, rockHit.rock.mesh.position.z, rockHit.rock.radius);
                this.vehicle.crashAngle = this.vehicle.leanAngle || 0.5;
                const rockPos = rockHit.rock.mesh.position;
                const impactDir = new THREE.Vector3(
                    this.vehicle.position.x - rockPos.x,
                    0,
                    this.vehicle.position.z - rockPos.z
                ).normalize();
                this.vehicle.velocity = impactDir.multiplyScalar(Math.min(this.vehicle.speed * 0.4, 7));
                this.vehicle.velocity.y = 3;
                this.soundManager.playCrashSound();
                this.showCrashNotification('Hit by a rockfall');
                console.log('CRASHED! Hit by a rockfall');

                if (this.particles) {
                    this.particles.createDustCloud(rockPos.clone(), 1.2);
                }
            }
        }

        // Check cone collisions
        if (!this.vehicle.crashed && this.cones) {
            this.cones.checkCollision(this.vehicle.position, this.vehicle.velocity, this.vehicle.speed);
        }

            // Consume fixed timestep from accumulated time
            this.accumulatedTime -= this.fixedTimeStep;
        } // End of fixed timestep physics loop

        // PER-FRAME UPDATES: everything below runs once per rendered frame

        // Place the bike mesh between physics states for smooth motion at any
        // frame rate (frames otherwise alternate 1/2 physics steps and judder)
        this.vehicle.applyRenderInterpolation(this.accumulatedTime / this.fixedTimeStep);

        // The gearbox of the sound and the HUD, then the sound of this frame
        this.updateGearbox(rawDeltaTime, throttleInput, brakeInput);
        this.soundManager.update(this.soundFrame(rawDeltaTime, throttleInput, brakeInput));

        this.updateRacePosition();
        this.updateCamera(rawDeltaTime);
        this.updateUI();

        // Animate knocked cones (slide/tumble)
        if (this.cones) {
            this.cones.update(rawDeltaTime);
        }

        // A converted leg builds the world ahead of the bike, a few
        // milliseconds a frame, and keeps the section of the last passed gate
        if (this.environment && this.environment.sections && this.vehicle) {
            this.environment.update(Math.floor(this.environment.route.toUnits(this.vehicle.routeS || 0)), Game.SECTION_BUDGET_MS, this.lastCheckpointSegment);
        }
        // A world streams by place round the bike, and guides the rider
        if (this.environment && this.environment.isWorld && this.vehicle) {
            // (the ride distance it streams by is the accepted progress, not the raw projection; free roam has none, and
            // streams by the nearest place on the ride as well as round the bike: Game.worldStreamS)
            this.environment.update(this.vehicle.position, this.worldStreamS(), this.worldGuideState(rawDeltaTime), Game.SECTION_BUDGET_MS, simulatedThisFrame);
            this.updateTubeAdaptation(simulatedThisFrame);
            this.watchLand();
            // (watchLand can hand the ride to the legs a task later; the world is still here this frame)
            const marmots = this.environment && this.environment.marmots;
            if (marmots) {
                const at = this.marmotBike || (this.marmotBike = {});
                at.x = this.vehicle.position.x; at.z = this.vehicle.position.z; at.s = this.worldStreamS();
                marmots.update(simulatedThisFrame, at, this.vehicle.speed, this.camera.position, this.soundManager);
            }
        }

        // Distance-cull far scenery (throttled internally)
        this.updatePerformanceCulling();

        // Update particle system and spawn particles based on vehicle state
        // Update weather system
        if (this.weatherSystem) {
            this.weatherSystem.update(rawDeltaTime, this.vehicle.position);
        }

        if (this.particles && !this.vehicle.crashed) {
            this.particles.update(rawDeltaTime);

            // Track brake duration
            if (brakeInput > 0.3) {
                this.brakeHeldTime += rawDeltaTime;
            } else {
                this.brakeHeldTime = 0;
            }

            // Tire smoke on braking/drifting - only after holding brake for 0.4 seconds
            if (brakeInput > 0.3 && this.vehicle.speed > 30 && this.brakeHeldTime > 0.4) {
                const smokeIntensity = brakeInput * Math.min(this.vehicle.speed / 50, 1.0);
                // Spawn from rear wheel position
                // (0.7 behind the bike along its heading, not along world Z)
                const rearWheelPos = this.vehicle.position.clone();
                rearWheelPos.x -= Math.sin(this.vehicle.yawAngle) * 0.7;
                rearWheelPos.z -= Math.cos(this.vehicle.yawAngle) * 0.7;
                this.particles.createTireSmoke(rearWheelPos, this.vehicle.velocity, smokeIntensity);
            }

            // Roost from the rear wheel in a power slide (Vehicle.slideAngle), a puff every 0.12 s at most
            const slide = Math.abs(this.vehicle.slideAngle || 0);
            this.roostS = slide > 0.1 ? (this.roostS || 0) + rawDeltaTime : 0;
            if (this.roostS >= 0.12) {
                this.roostS = 0;
                const rear = this.vehicle.position.clone();
                const heading = this.vehicle.yawAngle + this.vehicle.slideAngle;
                rear.x -= Math.sin(heading) * 0.7;
                rear.z -= Math.cos(heading) * 0.7;
                this.particles.createDustCloud(rear, Math.min(1, 0.4 + slide));
            }

            // Dust from the wheels at pace on a world's land (no slide needed), a small puff every landDustS
            const landPhysics = this.vehicle.worldPhysics;
            const dusty = landPhysics && this.vehicle.runoff && !this.vehicle.isJumping && slide <= 0.1 && this.vehicle.speed >= landPhysics.landDustSpeed;
            this.landDustS = dusty ? (this.landDustS || 0) + rawDeltaTime : 0;
            if (dusty && this.landDustS >= landPhysics.landDustS) {
                this.landDustS = 0;
                const rear = this.vehicle.position.clone();
                rear.x -= Math.sin(this.vehicle.yawAngle) * 0.7;
                rear.z -= Math.cos(this.vehicle.yawAngle) * 0.7;
                this.particles.createDustCloud(rear, Math.min(0.6, 0.15 + this.vehicle.speed / 40));
            }

            // Brief oily smoke puffs when accelerating hard at very high speed
            // Only when: full throttle, speed is increasing, and at near-max speed
            const isAccelerating = throttleInput > 0.95 && this.vehicle.speed > (this.lastSpeed || 0) + 1;
            const atHighSpeed = this.vehicle.speed > this.vehicle.maxSpeed * 0.9;
            if (isAccelerating && atHighSpeed) {
                // Spawn very rarely for brief puffs
                if (Math.random() < 0.05) {
                    this.particles.createSpeedTrail(this.vehicle.position.clone(), this.vehicle.velocity);
                }
            }
            this.lastSpeed = this.vehicle.speed;

            // Landing dust clouds - detect when landing from jump
            if (this.lastJumpState && !this.vehicle.isJumping) {
                const dustIntensity = Math.min(Math.abs(this.vehicle.velocity.y) / 10, 1.5);
                this.particles.createDustCloud(this.vehicle.position.clone(), dustIntensity);
            }
            this.lastJumpState = this.vehicle.isJumping;
        } else if (this.particles && this.vehicle.fall) {
            // A bike that slides on its side (Vehicle.drawFall) scrapes the road: sparks on the carriageway, dust on
            // the land, while it still moves
            this.particles.update(rawDeltaTime);
            const fall = Vehicle.FALL;
            this.scrapeS = (this.scrapeS || 0) + rawDeltaTime;
            if (this.vehicle.fall.kind === 'lowside' && this.vehicle.speed > fall.sparkSpeed && this.scrapeS >= fall.sparkS) {
                this.scrapeS = 0;
                const at = this.vehicle.position.clone();
                at.y += 0.15;
                const share = Math.min(1, this.vehicle.speed / 20);
                if (this.vehicle.runoff) this.particles.createDustCloud(at, 0.4 + 0.6 * share);
                else this.particles.createCollisionSparks(at, this.vehicle.velocity.clone().negate().setY(Math.abs(this.vehicle.speed) * 0.3), 0.3 + 0.5 * share);
            }
        }

        // (updateCamera() already re-anchored the sun to the bike)

        // Subtle intensity variation for natural lighting, relative to the
        // time-of-day base so night legs stay dark
        const time = performance.now() * 0.001;
        const baseSunIntensity = this.baseSunIntensity !== undefined ? this.baseSunIntensity : 0.8;
        this.directionalLight.intensity = baseSunIntensity * (1 + Math.sin(time * 0.1) * 0.06);

        // Update the headlight (interpolated position/yaw so the beam doesn't judder)
        const renderPos = this.vehicle.renderPosition || this.vehicle.position;
        if (this.headlight.visible) {
            const renderYaw = this.vehicle.renderYawAngle !== undefined ? this.vehicle.renderYawAngle : this.vehicle.yawAngle;
            const sinYaw = Math.sin(renderYaw);
            const cosYaw = Math.cos(renderYaw);
            // The light source sits well above the lamp and is aimed down onto
            // the road ahead: a beam from lamp height only grazes the tarmac
            // and leaves it black.
            // Main beam with a clear road; dipped while a car or a rider is in front, going either way (Traffic.BEAM)
            const beam = Traffic.BEAM;
            const ahead = !!this.traffic && this.traffic.inBeam(renderPos.x, renderPos.z, renderYaw);
            const dip = Traffic.stepDip(this.headlightDip || (this.headlightDip = {}), ahead, rawDeltaTime);
            const mix = key => beam.main[key] + (beam.dipped[key] - beam.main[key]) * dip;
            const aim = mix('aimM');
            this.headlight.position.set(renderPos.x + sinYaw * 0.8, renderPos.y + 2.9, renderPos.z + cosYaw * 0.8);
            this.headlight.target.position.set(renderPos.x + sinYaw * aim, renderPos.y - 0.4, renderPos.z + cosYaw * aim);
            this.headlight.target.updateMatrixWorld();
            this.headlight.distance = mix('reachM');
            this.headlight.intensity = this.headlightStrength * 10 * mix('gain');
        }

        // Rim light: from behind and above the bike, aimed at it. (It used to
        // keep its default target at the world origin, so on a far leg it
        // shone almost level across the scene from an arbitrary side and
        // threw a white glare across the wet road.)
        const rimYaw = this.vehicle.renderYawAngle !== undefined ? this.vehicle.renderYawAngle : this.vehicle.yawAngle;
        this.rimLight.position.set(
            renderPos.x - Math.sin(rimYaw) * 30,
            renderPos.y + 22,
            renderPos.z - Math.cos(rimYaw) * 30
        );
        this.rimLight.target.position.copy(renderPos);
        this.rimLight.target.updateMatrixWorld();

        // The light, sky, fog and far ring follow the ride along the track
        this.applyAtmosphere();
        // Everything a world draws takes the haze of this frame's air, also what a build step added since the last
        // frame, before it is first drawn (js/world/landshade.js)
        if (this.environment.isWorld) LandShade.update(this.scene, this.graphics, this.weatherSystem, this.environment.group);
        if (this.effectLevels) Effects.frame(this);
        this.graphics.update(
            rawDeltaTime,
            this.vehicle.crashed ? 0 : this.vehicle.speed / this.vehicle.maxSpeed,
            this.weatherSystem ? (this.weatherSystem.flash || 0) * 0.35 : 0
        );
        // In a first-person view nothing of the rider the camera is inside is drawn (Vehicle.hideAround)
        const firstPerson = ['helmet', 'onboard'].includes(this.cameraModes[this.cameraMode].type);
        Vehicle.hideAround(this.vehicle.rider || this.vehicle.group, firstPerson ? this.camera.position : null, this.camera.near);
        this.graphics.render(this.scene, this.camera);
    }

    // Whether a position is on a gate: a short band along the road, and across
    // it every metre a bike can legally be at that gate (gate.left and
    // gate.right, set when the gate is built). Road space comes from the
    // gate's own position and heading. There is no segment test: the band is
    // the only guard, and it cannot reach another stretch of road.
    inGate(gate, position) {
        const dx = position.x - gate.position.x;
        const dz = position.z - gate.position.z;
        const along = dx * Math.sin(gate.heading) + dz * Math.cos(gate.heading);
        const across = dx * Math.cos(gate.heading) - dz * Math.sin(gate.heading);
        return Math.abs(along) < 5 && across > -gate.left && across < gate.right;
    }

    checkCheckpoints() {
        if (!this.environment || !this.environment.checkpoints) return;
        // A world passes its stations by progress along the route (WorldRun), never by position
        if (this.environment.isWorld) return;
        
        for (let checkpoint of this.environment.checkpoints) {
            if (!checkpoint.passed) {
                const dx = this.vehicle.position.x - checkpoint.position.x;
                const dz = this.vehicle.position.z - checkpoint.position.z;
                const distance = Math.sqrt(dx * dx + dz * dz);

                // Within the 16 unit circle round the gate (a rider on the
                // road triggers it exactly where it always did: the high-pass
                // board is not versioned), or anywhere across the gate's band,
                // which reaches the rideable ground
                if (distance < checkpoint.width || this.inGate(checkpoint, this.vehicle.position)) {
                    // Check if this is the next expected checkpoint (in order)
                    const totalCheckpoints = this.environment.checkpoints.length;
                    if (checkpoint.index === this.lastCheckpointIndex + 1 ||
                        (this.lastCheckpointIndex === totalCheckpoints - 1 && checkpoint.index === 0)) {
                        this.passCheckpoint(checkpoint);
                    }
                }
            }
        }
    }

    // A gate passed in order: the restart point, the split, the points and the board record
    passCheckpoint(checkpoint) {
        checkpoint.passed = true;
        this.lastCheckpointIndex = checkpoint.index;
        this.checkpointsPassed++;

        // Store checkpoint position for restart
        this.lastCheckpointPosition = checkpoint.position.clone();
        this.lastCheckpointHeading = checkpoint.heading;
        this.lastCheckpointSegment = checkpoint.segmentIndex;
        console.log(`Checkpoint ${checkpoint.index + 1} stored for restart at position: ${checkpoint.position.x.toFixed(1)}, ${checkpoint.position.z.toFixed(1)}`);

        // Record checkpoint pass time
        const currentTime = Math.round(this.raceElapsed());
        this.checkpointTimes[checkpoint.index] = currentTime;

        // Record in leaderboard service
        if (this.leaderboardService && this.leaderboardService.isActive()) {
            this.leaderboardService.recordCheckpoint(checkpoint.index, currentTime)
                .catch(error => console.error('Failed to record checkpoint:', error));
        }

        // Speed-based points over the section since the last gate (HudRules.checkpointPoints: a section of no time
        // earns the base alone), times the combo multiplier
        let sectionTime = 0;
        let distance = 0;
        if (checkpoint.index > 0 && this.checkpointTimes[checkpoint.index - 1]) {
            sectionTime = (currentTime - this.checkpointTimes[checkpoint.index - 1]) / 1000;
            distance = checkpoint.position.distanceTo(this.environment.checkpoints[checkpoint.index - 1].position);
        }
        const points = HudRules.checkpointPoints(distance, sectionTime, this.comboMultiplier);
        this.addScore(points);
        
        // Increase combo
        this.combo++;
        if (this.combo >= 3) {
            this.comboMultiplier = Math.min(this.combo / 2, 5); // Max 5x multiplier
        }
        
        // Show checkpoint notification
        this.showSplit(checkpoint.index, currentTime, points);

        // Play checkpoint sound
        this.soundManager.playCheckpointSound();

        // Log speed info for first checkpoint or sections
        if (checkpoint.index === 0) {
            console.log(`Checkpoint ${checkpoint.index + 1} passed! ${HudRules.number(points, { sign: true })} points`);
        } else {
            console.log(`Checkpoint ${checkpoint.index + 1} passed! ${HudRules.number(points, { sign: true })} points (${HudRules.number(sectionTime > 0 ? (distance / sectionTime) * 3.6 : NaN, { digits: 1 })} km/h)`);
        }
    }
    
    // The line is crossed: the time is frozen, recorded and shown
    finishRun() {
        // Taken before `finished` is set: raceElapsed() returns the frozen time after
        const finishTime = this.raceElapsed();
        this.finished = true;
        this.vehicle.finished = true; // Prevent crashes after finishing
        this.finishTime = finishTime;
        // A world posts to no board until R6: a session left over from a leg must not take a world time
        const world = this.environment && this.environment.isWorld;
        if (!world && this.leaderboardService && this.leaderboardService.isActive() && this.leaderboardService.protocol === 2) {
            this.leaderboardService.recordFinish(Math.round(finishTime))
                .catch(error => console.error('Failed to record finish:', error));
        }
        // A finished leg opens the next on the menu (WorldLegs)
        if (world && typeof WorldLegs !== 'undefined' && this.environment.stage && !this.freeRoam) WorldLegs.markFinished(this.environment.stage.id);
        // A leg that ends at a stop rides on into it: the stop scene (js/world/stopscene.js) shows the card in its bar
        if (world && !this.freeRoam && this.startStopScene()) return;
        this.showFinishScreen();
    }

    // The scene at a leg's end stop (StopScene): bars in, the HUD out, the group pulls in and parks, the riders get off,
    // and the card comes up in the lower bar. False when the stage has no stop at its end
    startStopScene() {
        if (typeof StopScene === 'undefined' || this.stopScene) return false;
        const env = this.environment;
        const stop = StopScene.stopAt(env);
        if (!stop) return false;
        const route = env.route;
        const crew = this.traffic ? this.traffic.motorcycles.filter(bike => bike.direction === 1 && bike.bikeGroup && bike.bikeGroup.visible && bike.rider) : [];
        const v = this.vehicle;
        const riders = [{ bike: v, s: v.routeS, player: true, at: { x: v.position.x, z: v.position.z }, speed: v.speed }, ...crew
            .map(bike => ({ bike, s: route.fromUnits(bike.currentSegment + bike.segmentProgress) }))
            .sort((a, b) => b.s - a.s)];
        const ground = env.ground;
        const groundY = (x, z) => ground.groundY(x, z, null);
        // The fly starts on the chase camera as it was drawn last: its place beside the player, its aim, roll and lens
        const cam = this.camera;
        const aim = new THREE.Euler().setFromQuaternion(cam.quaternion, 'YXZ');
        const under = groundY(v.position.x, v.position.z);
        const lead = { x: v.position.x, y: Number.isFinite(under) ? under : 0, z: v.position.z };
        const from = { offset: { x: cam.position.x - lead.x, y: cam.position.y - lead.y, z: cam.position.z - lead.z }, yaw: aim.y, pitch: aim.x, roll: aim.z, fov: cam.fov };
        this.stopScene = new StopScene({ stop, route, riders, ground: groundY, camera: from, aspect: cam.aspect });
        this.raiseShot();
        this.stopScene.view = { bars: StopScene.showBars(document), puffs: [] };
        document.body.classList.add('stop-scene');
        if (this.soundManager) this.soundManager.stopEngineSound();
        // Any key or a tap skips to the card; the card's own keys (js/modals.js) take over once it is up
        const skip = (event) => {
            if (!this.stopScene || this.stopScene.card) return;
            if (event.type === 'keydown') event.preventDefault();
            this.skipStopScene();
        };
        this.stopScene.view.skip = skip;
        window.addEventListener('keydown', skip, true);
        if (this.renderer) this.renderer.domElement.addEventListener('pointerdown', skip);
        return true;
    }

    // Straight to where the scene rests: everyone parked and stood, the card up
    skipStopScene() {
        const scene = this.stopScene;
        if (!scene) return;
        scene.skip();
        this.stepStopScene(0);
        this.lastCullTime = 0;
        this.updatePerformanceCulling();
    }

    // One frame of the stop scene: the bikes along their ways in, the riders off once parked, the camera on its path,
    // the vape clouds, and the card once it is due
    stepStopScene(dt) {
        const scene = this.stopScene;
        const frame = scene.step(dt);
        // The crew comes in from wherever it was: what the distance cull hid round it shows from its first frame here
        if (!scene.culled) {
            scene.culled = true;
            this.lastCullTime = 0;
        }
        frame.riders.forEach((at, k) => {
            const r = scene.riders[k];
            const bike = r.bike;
            const group = r.player ? bike.group : bike.bikeGroup;
            if (!group) return;
            group.visible = at.shown;
            if (!at.shown || at.y === null) return;
            if (r.player) {
                bike.position.set(at.x, at.y, at.z);
                bike.yawAngle = at.heading;
                bike.speed = at.speed;
                bike.leanAngle = 0;
                if (!r.stood) bike.updateMesh();
                // (on the stop's ground as the crew are: the ride's ground pose reads the roads, not a car park)
                group.position.set(at.x, at.y, at.z);
                group.rotation.x = 0;
                group.rotation.z = 0;
            } else {
                bike.currentSpeed = at.speed;
                bike.leanAngle = 0;
                group.position.set(at.x, at.y, at.z);
                group.rotation.set(0, at.heading, 0);
            }
            if (at.stand && !r.stood) {
                r.stood = StopScene.stand(r, (x, z) => this.environment.ground.groundY(x, z, null));
                group.updateMatrixWorld(true);
            }
            if (r.stood && r.actions.includes('vape')) StopScene.puff(this.scene, scene, r, dt);
        });
        StopScene.stepPuffs(this.scene, scene, dt);
        // The camera on the fly (StopScene.flyAt): its place, aim, roll and lens, with no step from the chase camera
        const cam = frame.camera, camera = this.camera;
        if (camera.aspect !== scene.aspect) {
            scene.aspect = camera.aspect;
            scene.resize(camera.aspect);
        }
        camera.position.set(cam.eye.x, cam.eye.y, cam.eye.z);
        camera.up.set(0, 1, 0);
        camera.rotation.set(cam.pitch, cam.yaw, cam.roll, 'YXZ');
        if (camera.fov !== cam.fov) {
            camera.fov = cam.fov;
            camera.updateProjectionMatrix();
        }
        // The sun's shadow box goes with the player into the stop, and the ladder holds its level through the scene
        this.updateShadowCamera();
        this.holdQuality(1000);
        // The air eases to the hold's with the camera (StopScene.hazeAt), and the drawing raise comes once it holds
        const haze = typeof LandShade !== 'undefined' ? StopScene.hazeAt(scene.hold, scene.t, LandShade.hazeNow(), scene.flyS) : null;
        if (haze) LandShade.writeHaze(haze);
        if (frame.held && !scene.drawRaised) {
            scene.drawRaised = true;
            this.raiseShot();
        }
        if (frame.card && !scene.card) {
            scene.card = true;
            this.showStopCard(scene);
        }
    }

    // The result card in the lower bar: the time, then what can be done here (a picture, the next leg), restart, menu
    showStopCard(scene) {
        const next = typeof WorldLegs !== 'undefined' ? WorldLegs.LIST.find(leg => leg.opensAfter === this.environment.stage.id) : null;
        const actions = (StopScene.KINDS[scene.stop.kind] || {}).actions || [];
        const restarts = this.restarts > 0 ? `<div class="finish-board">${this.restarts} ${this.restarts === 1 ? 'restart' : 'restarts'}, +${this.restarts * Game.RESTART_PENALTY_MS / 1000} s in your time</div>` : '';
        const banner = document.createElement('div');
        banner.id = 'finishBanner';
        banner.className = 'finish-banner stop-card';
        banner.innerHTML = `
            <div class="finish-main">
                <div class="finish-title">STAGE COMPLETE</div>
                <div class="finish-time">${RaceTiming.formatTime(this.finishTime)}</div>
                <div class="finish-deltas">${restarts}</div>
                <div class="finish-buttons">
                    ${next ? `<button id="stopNextBtn" class="finish-btn primary" data-key="KeyN"><u>N</u>EXT LEG</button>` : ''}
                    ${actions.includes('photo') && typeof PhotoMode !== 'undefined' ? '<button id="stopPhotoBtn" class="finish-btn secondary" data-key="KeyV">PHOTO (<u>V</u>)</button>' : ''}
                    <button id="restartLegBtn" class="finish-btn ${next ? 'secondary' : 'primary'}" data-key="KeyR"><u>R</u>ESTART</button>
                    <button id="returnToMenuBtn" class="finish-btn secondary" data-key="KeyM" data-menu><u>M</u>ENU</button>
                </div>
            </div>`;
        if (this.hud) this.hud.clearTransient();
        document.body.classList.add('run-over');
        Modals.open(banner);
        if (this.input) this.input.setMenuActive(true);
        banner.querySelector('#restartLegBtn').addEventListener('click', () => { this.endStopScene(); this.restartLeg(); });
        banner.querySelector('#returnToMenuBtn').addEventListener('click', () => { this.endStopScene(); this.returnToMenu(); });
        const nextButton = banner.querySelector('#stopNextBtn');
        if (nextButton) nextButton.addEventListener('click', () => window.location.assign(RideMode.worldUrl(window.location, next.id)));
        const photo = banner.querySelector('#stopPhotoBtn');
        if (photo) photo.addEventListener('click', () => this.openPhoto());
    }

    // The scene ends: bars out, the HUD back, the clouds gone, the listeners off
    endStopScene() {
        const scene = this.stopScene;
        if (!scene) return;
        this.stopScene = null;
        window.removeEventListener('keydown', scene.view.skip, true);
        if (this.renderer) this.renderer.domElement.removeEventListener('pointerdown', scene.view.skip);
        StopScene.clearPuffs(this.scene, scene);
        // (every rider back on the bike, as built: the restart and the next ride find them seated)
        scene.riders.forEach(r => StopScene.seat(r));
        StopScene.hideBars(scene.view.bars);
        document.body.classList.remove('stop-scene');
        this.camera.rotation.reorder('XYZ');
        this.dropShot();
    }

    // The held shot at a leg's end: over the level in force, what StopScene.RAISE gives for it. What is built once (the
    // land's detail, the trees) from the scene's start, so it is built while the camera flies; what each frame draws
    // (the pixel ratio, the shadow map, the samples, the effects) once the camera holds (`scene.drawRaised`): a new
    // shadow map, render target or program can cost a frame of 200 ms, and on a still view that does not show. Read
    // again when the level changes in the scene (applyQuality); dropShot gives the level back
    raiseShot() {
        const scene = this.stopScene, env = this.environment;
        if (!scene || !this.quality || typeof StopScene === 'undefined') return;
        const level = Quality.LEVELS[this.quality.level];
        // (a stop's hold may cap the land's raise, as its own data: a view over a whole valley, the lookout over Airolo,
        // drew the land at full detail out to 2.5 km and went over LEG_BUDGET's triangles; never raised past the level's)
        const cap = (scene.stop && scene.stop.raise) || {};
        const own = StopScene.RAISE[level.id] || {};
        const raise = { ...own };
        for (const [key, most] of Object.entries(cap)) {
            if (Array.isArray(most) && Array.isArray(own[key])) raise[key] = own[key].map((m, k) => Math.min(m, most[k]));
            else if (Number.isFinite(most) && Number.isFinite(own[key])) raise[key] = Math.min(own[key], most);
        }
        const draw = !!scene.drawRaised;
        scene.raised = { level: level.id, draw, ...raise };
        const renderer = this.renderer;
        if (env && env.isWorld) {
            if (env.streamer) env.streamer.tileLodM = raise.tileLodM || null;
            if (env.scenery && env.scenery.setShot) env.scenery.setShot({ treeNearM: raise.treeNearM, treeMidM: raise.treeMidM, triangleScale: raise.triangleScale });
        }
        this.treeShare = Math.max(level.treeShare, raise.treeShare || 0);
        this.treeNear = Math.max(level.treeNear, raise.treeNear || 0);
        if (env && env.isWorld) this.thinTrees(env.sceneryGroup);
        if (!draw) return;
        const ratio = Math.min(window.devicePixelRatio || 1, Math.max(level.pixelRatio, raise.pixelRatio || 0));
        if (renderer && renderer.getPixelRatio() !== ratio) renderer.setPixelRatio(ratio);
        const light = this.directionalLight;
        const most = renderer ? renderer.capabilities.maxTextureSize : 0;
        const map = Math.min(most, Math.max(level.shadowMap, raise.shadowMap || 0));
        if (renderer && renderer.shadowMap.enabled && light && level.shadowMap > 0 && light.shadow.mapSize.x !== map) {
            light.shadow.mapSize.set(map, map);
            if (light.shadow.map) {
                light.shadow.map.dispose();
                light.shadow.map = null;
            }
        }
        if (this.graphics) this.graphics.setQuality({ msaa: Math.max(level.msaa, raise.msaa || 0), bloom: level.bloom });
        if (draw && this.effects && this.graphics && typeof Effects !== 'undefined' && (raise.effectMs || 0) > level.effectMs) {
            Effects.prepare(this, this.effects.chosen);
            Effects.apply(this, this.effects.inForce(raise.effectMs, effect => Effects.supported(effect, this.graphics, this)));
        }
    }

    // The level in force again, as before the held shot
    dropShot() {
        const env = this.environment;
        if (typeof LandShade !== 'undefined' && LandShade.uniforms) LandShade.writeHaze(LandShade.hazeNow());
        if (env && env.isWorld) {
            if (env.streamer) env.streamer.tileLodM = null;
            if (env.scenery && env.scenery.setShot) env.scenery.setShot(null);
        }
        if (this.quality) this.applyQuality(Quality.LEVELS[this.quality.level], this.quality.level, 'shot');
    }

    // One frame of a world ride: the stations in order, the finish, and the cut rule, all from the
    // vehicle's own projection of the frame
    updateWorldRun(dt) {
        const vehicle = this.vehicle;
        const projection = vehicle.projection;
        if (!(projection.index >= 0)) return;
        const result = this.worldRun.update({
            s: projection.s,
            lateral: projection.lateral,
            width: projection.width,
            speed: vehicle.speed,
            dt,
            forwardDot: Math.cos(vehicle.yawAngle - projection.heading),
            land: !!vehicle.runoff
        });
        if (result.cut) {
            this.restartFromCheckpoint('cut');
            return;
        }
        if (result.station < 0) return;
        const stations = this.environment.stationGates;
        const at = Math.round(this.raceElapsed());
        this.worldRun.onStation(result.station, at);
        if (result.station === stations.length - 1) {
            // The last station ends the last stage as well as the ride, so every stage has its time
            this.worldRun.onStageFinish(this.worldRun.stageIndex, at);
            this.finishRun();
            return;
        }
        this.passCheckpoint(this.environment.checkpoints[result.station - 1]);
        // A stage boundary ends one stage and starts the next; the ride itself ends at the last station only
        if (stations[result.station].kind === 'boundary') {
            const k = this.worldRun.stageIndex;
            this.worldRun.onStageFinish(k, at);
            showCallout(`Stage ${k + 1} finished  ${HudRules.stageClock(this.worldRun.stageTimes[k])}`, 'good', 2500);
        }
    }

    // A red light jumped at a roadworks site earns style, and says so (Roadworks.RED_RUN_STYLE): the oncoming traffic
    // in the single lane is the risk it is paid for. Once for each site in a ride, so going back for it earns nothing
    updateRoadworks() {
        const works = this.environment.roadworks;
        if (!works) return;
        for (const event of works.takeEvents()) {
            if (event.kind !== 'red') continue;
            const paid = this.redLightsPaid || (this.redLightsPaid = new Set());
            if (paid.has(event.site)) continue;
            paid.add(event.site);
            this.addScore(Roadworks.RED_RUN_STYLE);
            showCallout(`Jumped a red light ${HudRules.number(Roadworks.RED_RUN_STYLE, { sign: true })} style`, 'good', 2000);
        }
    }

    checkSpeedStreak(deltaTime) {
        if (this.vehicle.speed >= this.highSpeedThreshold) {
            this.speedStreakTime += deltaTime;
            
            // Award bonus every 5 seconds of high speed
            if (this.speedStreakTime - this.lastSpeedCheck >= 5) {
                const bonus = 250;
                this.addScore(bonus);
                this.showSpeedBonus();
                this.lastSpeedCheck = this.speedStreakTime;
            }
        } else {
            this.speedStreakTime = 0;
            this.lastSpeedCheck = 0;
        }
    }
    
    showSpeedBonus() {
        showCallout('Speed streak +250', 'gold', 1000);
    }
    
    checkNearMisses() {
        if (!this.traffic || !this.traffic.motorcycles) return;
        
        const playerPos = this.vehicle.position;
        const currentTime = performance.now();
        
        this.traffic.motorcycles.forEach((bike, index) => {
            if (!bike.bikeGroup) return;
            
            const bikePos = bike.bikeGroup.position;
            const dx = bikePos.x - playerPos.x;
            const dy = bikePos.y - playerPos.y;
            const dz = bikePos.z - playerPos.z;
            const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
            
            // Near miss if within 3 units and moving past
            if (distance < 3 && distance > 1.5 && Math.abs(dz) < 5) {
                const bikeKey = `${index}_${Math.floor(playerPos.z / 10)}`;
                
                if (!this.nearMissCheckedBikes.has(bikeKey)) {
                    this.nearMissCheckedBikes.add(bikeKey);
                    this.addScore(100);
                    this.showNearMissBonus();
                    
                    // Clean up old entries
                    if (this.nearMissCheckedBikes.size > 20) {
                        const keysArray = Array.from(this.nearMissCheckedBikes);
                        this.nearMissCheckedBikes.delete(keysArray[0]);
                    }
                }
            }
        });
    }
    
    showNearMissBonus() {
        showCallout('Near miss +100', 'gold', 900);
    }
    
    showCollisionWarning() {
        showCallout('Collision!', 'bad', Game.CALLOUT_MS.collision);
    }
    
    checkJumpScoring() {
        // Check if we just started jumping
        if (this.vehicle.isJumping && !this.wasJumping) {
            this.soundManager.playJumpSound();
        }

        if (!this.vehicle.isJumping) {
            // Check if we just landed
            if (this.wasJumping) {
                this.wasJumping = false;
                
                // Calculate jump score based on air time and rotation
                // land() zeroes jumpRotation, so read the value it saved
                const jumpRotation = Math.abs(this.vehicle.lastJumpRotation || 0);
                let jumpScore = 50; // Base jump score
                
                // Bonus for flips
                if (jumpRotation > Math.PI * 1.5) {
                    // More than 1.5 rotations
                    jumpScore += 500;
                    this.showJumpBonus("DOUBLE FLIP! +500");
                } else if (jumpRotation > Math.PI * 0.8) {
                    // Nearly full rotation
                    jumpScore += 200;
                    this.showJumpBonus("FLIP! +200");
                } else if (jumpRotation > Math.PI * 0.4) {
                    // Half rotation
                    jumpScore += 100;
                    this.showJumpBonus("HALF FLIP! +100");
                }
                
                jumpScore *= this.comboMultiplier;
                this.addScore(jumpScore);
                
                // Increase combo for successful jump
                this.combo++;
                if (this.combo >= 3) {
                    this.comboMultiplier = Math.min(this.combo / 2, 5);
                }
            }
        } else {
            this.wasJumping = true;
        }
    }
    
    addScore(points) {
        // A score that is not a number can never come back: refuse the award, not the score
        if (!Number.isFinite(points)) {
            console.warn(`addScore: ${points} points refused`);
            return;
        }
        this.score += Math.round(points);
        this.updateScoreDisplay();
        
        // Update high score if needed
        if (this.score > this.highScore) {
            this.highScore = this.score;
            localStorage.setItem('motorcycleHighScore', this.highScore.toString());
        }
    }
    
    // Race time as shown: frozen at the finish and while paused. Includes the
    // 5 s of every restart, so every signed time holds the penalty.
    raceElapsed() {
        if (this.finished) return this.finishTime;
        if (this.paused && this.pauseStartedAt) return this.pauseStartedAt - this.startTime + this.penaltyMs;
        return this.now() - this.startTime + this.penaltyMs;
    }

    updateScoreDisplay() {
        if (!this.hud) return;
        if (typeof this.startTime === 'number') {
            this.hud.setTime(RaceTiming.formatTime(Math.max(0, this.raceElapsed())));
        }
        this.hud.setScore(this.score);
        this.hud.setCombo(this.combo);
    }
    
    // The split at a gate: elapsed time first, then the gap to the personal
    // best split and, when the backend sends them, the record split
    showSplit(index, elapsed, points) {
        const total = this.gateTotal();
        const split = RaceTiming.split(index, elapsed, this.bestSplits, this.record);
        const delta = (ms, label) => `<span class="delta-${RaceTiming.deltaClass(ms)}">${RaceTiming.formatDelta(ms)}<small>${label}</small></span>`;
        const deltas = [];
        if (split.pbDelta !== null) deltas.push(delta(split.pbDelta, 'PB'));
        if (split.recordDelta !== null) deltas.push(delta(split.recordDelta, 'REC'));
        if (deltas.length === 0) deltas.push('<span class="delta-none">FIRST SPLIT<small>SET A BEST</small></span>');
        this.lastSplit = split;
        // A world counts the gates of the stage being ridden (updateWorldHud)
        if (this.hud && !(this.environment && this.environment.isWorld)) this.hud.setGates(Math.min(total, index + 1), total);
        const shown = this.hud && this.hud.showSplit(`
            <div class="split-gate">CHECKPOINT ${index + 1}/${total}</div>
            <div class="split-time">${RaceTiming.formatTime(elapsed)}</div>
            <div class="split-deltas">${deltas.join('')}</div>
            <div class="split-style">${HudRules.number(points, { sign: true })} style</div>`);
        if (!shown) this.showCheckpointNotification(index + 1, points);
    }

    hideSplit() {
        if (this.hud) this.hud.hideSplit(true);
    }

    showCheckpointNotification(checkpointNum, points) {
        const totalCheckpoints = this.gateTotal();
        showCallout(`Checkpoint ${checkpointNum}/${totalCheckpoints} ${HudRules.number(points, { sign: true })}`, 'info', 1000);
    }
    
    showJumpBonus(text) {
        showCallout(text, 'gold', 1000);
    }

    showWheelieHelpNotification() {
        const touch = document.body.classList.contains('touch');
        showCallout(touch ? 'Tip: tap Wheelie' : 'Tip: Space for a wheelie', 'gold', 3000);
    }

    // A wall brushed with the tyres and ridden on from (Vehicle.brush): said once for each contact, with the tyre's
    // screech. A touch that ended as a crash says the crash
    sayBrush() {
        if (!this.vehicle.brushNew) return;
        this.vehicle.brushNew = false;
        if (this.vehicle.crashed || this.finished) return;
        this.soundManager.playTireScreech();
        showCallout(Game.BRUSH_TEXT, 'warn', Game.CALLOUT_MS.brush);
    }

    // A rider who cannot reach the ground on a slope (Vehicle.footReach) is nearly stopped on one: said once each time,
    // so the fall that a stop there brings is never a surprise
    sayFoot() {
        if (!this.vehicle.footWarnNew) return;
        this.vehicle.footWarnNew = false;
        if (this.vehicle.crashed || this.finished) return;
        showCallout(Game.FOOT_TEXT, 'warn', Game.CALLOUT_MS.foot);
    }

    showConeHitNotification(points) {
        showCallout(`Cone hit ${HudRules.number(points, { sign: true })}`, 'warn', 1000);
    }
    
    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    // The one restart of a world, for every reason: the rider goes on from where the bike last was on the road
    // (WorldRun.restartPlace: a few metres back, on its own side, in the open lane through a roadworks site), facing
    // along the ride at a standstill. A checkpoint is a timing line and nothing else. No dialog asks: a crash comes
    // here by itself once its fall has played (updateWorldCrash). The run stays valid; the 5 s and
    // the restart are counted once, and the guide's timers and the cut rule start again, so one excursion costs one
    // penalty.
    restartInPlace(reason) {
        if (this.freeRoam && this.roam) {
            this.restartRoam(reason);
            return;
        }
        const { environment, vehicle, worldRun } = this;
        const route = environment.route;
        // (further back each time the place itself has crashed the rider twice running: beginWorldCrash)
        const streak = this.worldCrashStreak || 0;
        const { s, lateral } = worldRun.restartPlace(environment.roadworks, streak >= 2 ? (streak - 1) * Game.WORLD_CRASH.backStepM : 0);
        const point = route.sample(s, {});
        this.worldCrash = null;
        this.worldSinceRestartS = 0;

        this.addScore(-Math.min(500, this.score));

        const distanceSoFar = vehicle.distanceTraveled;
        vehicle.reset();
        vehicle.distanceTraveled = distanceSoFar;
        vehicle.position.set(point.x + lateral * Math.cos(point.heading), point.y, point.z - lateral * Math.sin(point.heading));
        vehicle.yawAngle = point.heading;
        vehicle.speed = 0;
        vehicle.findNearestRoadSegment();
        vehicle.updateMesh();
        // A key held through the fall starts again from nothing (the steer ease's ramp), and a key pressed during it
        // does not fire after it
        if (this.input) {
            if (this.input.steerEase) this.input.steerEase.reset();
            if (this.input.clearActions) this.input.clearActions();
        }
        // The ground under the place is held until the data is there; until then it reads the far grid
        environment.place(s);

        this.removeRunOverlays();
        this.penaltyMs += Game.RESTART_PENALTY_MS;
        this.restarts++;
        if (this.leaderboardService) this.leaderboardService.recordRestart();

        environment.guide.reset();
        worldRun.noteRestart();
        worldRun.restartAt(s);
        this.worldCamera.reset(point.heading);
        // Nothing stands where the rider is put down (Traffic.clearAround: the cars, the riders, the single lanes), and
        // inside a single lane the lights are the rider's (Roadworks.admit)
        if (this.traffic) this.traffic.clearAround(route.toUnits(s), Math.ceil(Game.RESTART_CLEAR_SEGMENTS * 20 / route.unitM));
        if (environment.roadworks) {
            environment.roadworks.reset();
            environment.roadworks.admit(s);
        }
        this.snapAtmosphere(this.atmosphereTrack, this.atmosphereUnit(s), {
            environment,
            weatherSystem: this.weatherSystem
        });
        // (a crash has said its cause and its cost during the fall)
        if (reason !== 'crash') showCallout(`${Game.WORLD_RESTART_TEXT[reason] || Game.WORLD_RESTART_TEXT.key} +${Game.RESTART_PENALTY_MS / 1000} s`, 'warn', Game.CALLOUT_MS.restart);
    }

    // Fast travel (js/world/travel.js): from the pause panel, or with its key while riding (the ride pauses under it).
    // A pick takes the bike there and rides on; Back goes back to where it was opened from
    openTravel() {
        if (!this.freeRoam || !this.environment || typeof FastTravel === 'undefined') return;
        const fromRide = !this.paused;
        if (fromRide) this.pauseRace({ panel: false });
        const s = this.worldStreamS ? this.worldStreamS() : this.vehicle.routeS;
        FastTravel.show(document, FreeRoam.destinations(this.environment), s, (dest) => {
            // (the ride stays paused, its panel down, until the land at the place is in)
            FastTravel.hide(document);
            if (typeof WorldCredits !== 'undefined') WorldCredits.hidePause();
            this.travelTo(dest).then(() => this.resumeRace(), (error) => {
                console.error('Fast travel: the land did not load', error);
                this.resumeRace();
            });
        }, () => {
            FastTravel.hide(document);
            if (fromRide) this.resumeRace();
        });
    }

    // Photo mode (js/world/photo.js): from the pause panel, or with its key while riding (the ride pauses under it). The
    // HUD goes, a camera of the rider's own goes round the bike; Back returns to where it was opened from
    openPhoto() {
        if (!(this.freeRoam || this.stopScene) || !this.environment || typeof PhotoMode === 'undefined' || this.photo) return;
        const fromRide = !this.paused;
        if (fromRide) this.pauseRace({ panel: false });
        const ground = this.environment.ground;
        this.photo = new PhotoMode(this.vehicle, (x, z) => ground.groundY(x, z, null));
        document.body.classList.add('photo-mode');
        const bar = PhotoMode.bar(document, (name) => {
            const photo = this.photo;
            if (!photo) return;
            if (name === 'left') photo.orbit(-1);
            else if (name === 'right') photo.orbit(1);
            else if (name === 'up') photo.tilt(1);
            else if (name === 'down') photo.tilt(-1);
            else if (name === 'closer') photo.zoom(-1);
            else if (name === 'further') photo.zoom(1);
            else if (name === 'save') this.savePhoto();
            else if (name === 'done') done();
        });
        const done = () => {
            Modals.close(bar);
            document.body.classList.remove('photo-mode');
            this.photo = null;
            if (fromRide) this.resumeRace();
        };
        Modals.open(bar, { cancel: done, under: 'hide' });
    }

    // The picture as the photo camera sees it, drawn and read in one go (the canvas keeps no frame between draws), and
    // handed to the browser as a PNG to save
    savePhoto() {
        try {
            this.photo.apply(this.camera);
            this.graphics.render(this.scene, this.camera);
            const url = this.renderer.domElement.toDataURL('image/png');
            const link = document.createElement('a');
            link.href = url;
            link.download = PhotoMode.fileName(new Date());
            link.click();
            this.lastPhoto = { bytes: url.length, name: link.download };
            showCallout('Picture saved', 'good', Game.CALLOUT_MS.restart);
        } catch (error) {
            console.error('Photo mode: the picture could not be saved', error);
            showCallout('The picture could not be saved', 'warn', Game.CALLOUT_MS.restart);
        }
    }

    // Free roam puts the bike at a destination (FreeRoam.destinations): standing, facing along the ride, the camera, the
    // guide and the crew set again. The promise settles once the land round it is in (WorldStreamer.settle), and the
    // bike is put on that land. `say` tells the rider where they are
    travelTo(dest, say = true) {
        const { environment, vehicle } = this;
        const distanceSoFar = vehicle.distanceTraveled;
        vehicle.reset();
        vehicle.distanceTraveled = distanceSoFar;
        const y = environment.ground.groundY(dest.x, dest.z, null);
        vehicle.position.set(dest.x, Number.isFinite(y) ? y : dest.y, dest.z);
        vehicle.yawAngle = dest.heading;
        vehicle.speed = 0;
        vehicle.findNearestRoadSegment();
        vehicle.updateMesh();
        environment.place(dest.s);
        environment.guide.reset();
        this.worldCamera.reset(dest.heading);
        if (this.roam) this.roam.poses = [];
        this.lastCheckpointPosition = new THREE.Vector3(vehicle.position.x, vehicle.position.y, vehicle.position.z);
        this.lastCheckpointHeading = dest.heading;
        if (this.traffic) {
            this.traffic.clearAround(environment.route.toUnits(dest.s), Math.ceil(Game.RESTART_CLEAR_SEGMENTS * 20 / environment.route.unitM));
            this.traffic.gridBehind(dest.s);
        }
        if (this.atmosphereTrack) this.snapAtmosphere(this.atmosphereTrack, this.atmosphereUnit(dest.s), { environment, weatherSystem: this.weatherSystem });
        if (say) showCallout(dest.name, 'good', Game.CALLOUT_MS.restart);
        return environment.streamer.settle(vehicle.position, dest.s).then(() => {
            const ground = environment.ground.groundY(dest.x, dest.z, null);
            if (Number.isFinite(ground)) vehicle.position.y = ground;
            vehicle.findNearestRoadSegment();
            vehicle.updateMesh();
        });
    }

    // A restart in free roam: back where the bike last was on a road (the ride or a side road), a second before the
    // crash, facing the way it was going; at the edge of the map turned round. No penalty: there is no clock
    restartRoam(reason) {
        const { environment, vehicle } = this;
        const pose = this.roam.restartPose(reason === 'edge');
        this.worldCrash = null;
        this.worldSinceRestartS = 0;
        const distanceSoFar = vehicle.distanceTraveled;
        const start = environment.startPosition();
        vehicle.reset();
        vehicle.distanceTraveled = distanceSoFar;
        if (pose) {
            vehicle.position.set(pose.x, pose.y, pose.z);
            vehicle.yawAngle = pose.heading;
        } else {
            vehicle.position.set(start.x, start.y, start.z);
            vehicle.yawAngle = start.heading;
        }
        vehicle.speed = 0;
        vehicle.findNearestRoadSegment();
        vehicle.updateMesh();
        if (this.input) {
            if (this.input.steerEase) this.input.steerEase.reset();
            if (this.input.clearActions) this.input.clearActions();
        }
        this.removeRunOverlays();
        environment.guide.reset();
        this.worldCamera.reset(vehicle.yawAngle);
        if (this.traffic && vehicle.routeS !== undefined) this.traffic.clearAround(environment.route.toUnits(vehicle.routeS || 0), Math.ceil(Game.RESTART_CLEAR_SEGMENTS * 20 / environment.route.unitM));
        if (reason !== 'crash') showCallout(reason === 'edge' ? Game.ROAM_TEXT['edge-back'] : Game.ROAM_TEXT.key, 'warn', Game.CALLOUT_MS.restart);
    }

    // The gearbox (js/sound.js Gearbox, .agent/system/sound.md) is for the sound and the HUD only: it reads the bike's
    // speed and the rider's hands and changes nothing the physics reads. A crash or the finish leaves it in neutral,
    // and the ride after it starts again in first
    updateGearbox(dt, throttle, brake) {
        const vehicle = this.vehicle;
        if (!vehicle || typeof Gearbox === 'undefined') return null;
        if (!this.gearbox || this.gearbox.bike !== vehicle.model) this.gearbox = new Gearbox(vehicle.model);
        const off = !!(vehicle.crashed || this.finished);
        if (this.gearbox.neutral && !off) this.gearbox.reset();
        this.gearbox.neutral = off;
        return this.gearbox.update(dt, vehicle.speed / vehicle.maxSpeed, throttle, brake);
    }

    // What the sound reads this frame, in one object kept from frame to frame
    soundFrame(dt, throttle, brake) {
        const vehicle = this.vehicle;
        const frame = this.soundState || (this.soundState = { dt: 0, gearbox: null, engine: null, throttle: 0, brake: 0, speed: 0, maxSpeed: 0, crashed: false, surface: 'asphalt', wet: false, slide: 0, others: null, x: 0, z: 0, heading: 0 });
        frame.dt = dt;
        frame.gearbox = this.gearbox;
        frame.engine = typeof Sound !== 'undefined' ? Sound.engineOf(vehicle.model) : null;
        frame.throttle = throttle;
        frame.brake = brake;
        // (a bike down slides on: its speed is the scrape's)
        frame.speed = vehicle.crashed && vehicle.velocity ? Math.hypot(vehicle.velocity.x, vehicle.velocity.z) : vehicle.speed;
        frame.maxSpeed = vehicle.maxSpeed;
        frame.crashed = !!vehicle.crashed;
        frame.engineOff = !!this.finished;
        frame.surface = typeof Sound !== 'undefined' ? Sound.surfaceOf(vehicle) : 'asphalt';
        const weather = this.weatherSystem;
        frame.wet = !!weather && typeof weather.weatherPhysics === 'function' && weather.weatherPhysics().lateralFriction < 1;
        frame.slide = vehicle.slideAngle || 0;
        frame.others = this.traffic || null;
        frame.x = vehicle.position.x;
        frame.z = vehicle.position.z;
        frame.heading = vehicle.yawAngle || 0;
        return frame;
    }

    // The tuning (js/tuning.js, .agent/system/handling.md): multipliers over the handling's numbers, moved with the
    // panel of debug mode (js/tuningpanel.js; T opens it and the ride goes on). Outside debug mode nothing stored is
    // read and no panel is built
    startTuning() {
        if (typeof Tuning === 'undefined') return;
        const debug = Game.debugEnabled(window.location.search);
        let storage = null;
        try {
            storage = window.localStorage;
        } catch (error) {
            console.warn('Tuning: no storage, the values last for this page only:', error);
        }
        Tuning.start({ debug, storage });
        if (debug && typeof TuningPanel !== 'undefined') this.tuningPanel = new TuningPanel(document, Tuning, { world: () => !this.environment || !!this.environment.isWorld, quality: this.quality ? this.qualityControl() : null });
    }

    // The rider mode (js/ridermodes.js): the stored choice is in force from the page's start, on a world ride and on
    // a classic leg alike, and the HUD's tag follows every change
    startRiderModes() {
        if (typeof RiderModes === 'undefined') return;
        let storage = null;
        try {
            storage = window.localStorage;
        } catch (error) {
            console.warn('RiderModes: no storage, the mode lasts for this page only:', error);
        }
        RiderModes.start({ storage });
        const show = (mode) => {
            if (this.hud) this.hud.setMode(mode.name, mode.tone);
            RiderModes.refresh(document);
        };
        RiderModes.watch(show);
        show(RiderModes.get());
    }

    // The mode key in a ride: the next mode while the bike stands, else a call-out that says to stop first. The
    // pause panel's control holds the same rule (WorldCredits.showPause)
    stepRiderMode() {
        if (typeof RiderModes === 'undefined' || !this.vehicle || !this.environment) return false;
        const step = RiderModes.step(this.vehicle.speed);
        showCallout(step.changed ? `Rider mode: ${step.mode.name}` : RiderModes.LOCKED_TEXT, step.changed ? 'info' : 'warn', 1500);
        return step.changed;
    }

    // One of the numbers the tuning scales (Tuning.field), or the number itself where the tuning is not loaded
    static tune(on, field, value) {
        return typeof Tuning === 'undefined' ? value : Tuning.field(on, field, value);
    }

    // A ride begins: it is flagged as tuned from the start when a multiplier is off 1 already
    beginTunedRide() {
        this.rideTuned = typeof Tuning !== 'undefined' && Tuning.beginRide();
        if (this.hud) this.hud.setTuned(this.rideTuned);
    }

    // Each frame: a ride in which a multiplier was off 1 at any moment submits no time, and stays so after Reset
    // until the next ride begins. A world is no longer trusted, as after the debug skip (WorldEnvironment
    // submitAllowed); a classic leg loses its leaderboard session and gets none on a restart
    watchTuning() {
        if (typeof Tuning === 'undefined' || !Tuning.ride.tuned) return;
        if (!this.rideTuned) {
            this.rideTuned = true;
            if (this.hud) this.hud.setTuned(true);
        }
        const environment = this.environment;
        if (environment && environment.isWorld) environment.trusted = false;
        else if (this.leaderboardService && this.leaderboardService.isActive()) this.leaderboardService.cancelSession();
    }

    // Debug mode (`?debug` in the page's address): every rider, bike and leg is open (TourSystem `unlockAll`), and N puts the bike DEBUG_SKIP_BEFORE_M before the next station of a
    // world ride, on a rolling start, so a place far up the road is seen without the ride to it. The gate ahead is
    // then passed as any other. A ride that skipped never submits a time (the world is no longer trusted)
    static debugEnabled(search) {
        return new URLSearchParams(search || '').has('debug');
    }

    debugSkipToNextGate() {
        const { environment, vehicle, worldRun } = this;
        if (!environment || !environment.isWorld || this.finished || !worldRun) return false;
        const route = environment.route, before = Game.DEBUG_SKIP_BEFORE_M;
        // (a station the bike already stands before is skipped: a second press goes on to the one after)
        const at = environment.stationGates.findIndex(st => st.s - before > vehicle.routeS + 10);
        if (at < 0) return false;
        const s = Math.max(environment.startS, environment.stationGates[at].s - before);
        const point = route.sample(s, {});
        environment.trusted = false;

        const distanceSoFar = vehicle.distanceTraveled;
        vehicle.reset();
        vehicle.distanceTraveled = distanceSoFar;
        vehicle.position.set(point.x, point.y, point.z);
        vehicle.yawAngle = point.heading;
        vehicle.speed = worldRun.restartSpeed(s);
        vehicle.findNearestRoadSegment();
        vehicle.updateMesh();
        environment.place(s);

        this.removeRunOverlays();
        environment.guide.reset();
        // Every station before the one ahead counts as passed, and progress starts again at s (no cut is read)
        worldRun.stationIndex = Math.max(worldRun.stationIndex, at - 1);
        worldRun.restartAt(s);
        this.worldCamera.reset(point.heading);
        if (this.traffic) this.traffic.clearAround(route.toUnits(s), Math.ceil(Game.RESTART_CLEAR_SEGMENTS * 20 / route.unitM));
        this.snapAtmosphere(this.atmosphereTrack, this.atmosphereUnit(s), { environment, weatherSystem: this.weatherSystem });
        showCallout(`Debug: before gate ${at} of ${environment.stationGates.length - 1} (no time is kept)`, 'warn', 2000);
        return true;
    }

    // Back to the last gate passed, on a rolling start. Costs 5 s and a
    // little style; the run stays valid.
    // `reason` is why: 'key', 'crash' (the crash banner's button), 'off-route', 'cut' (WorldRun's cut rule), 'wrong-way' or 'resume'. Every reason
    // costs the same 5 s. A world answers it in restartInPlace: there the rider goes on where the bike was.
    restartFromCheckpoint(reason = 'key') {
        this.closeWorldConfirm();
        // The run is over once the line is crossed; the finish banner owns
        // what happens next
        if (this.finished) return;
        if (this.environment && this.environment.isWorld) {
            this.restartInPlace(reason);
            return;
        }
        if (!this.lastCheckpointPosition) {
            console.log('No checkpoint position available for restart');
            return;
        }

        console.log('Restarting from checkpoint at:', this.lastCheckpointPosition.x.toFixed(1), this.lastCheckpointPosition.z.toFixed(1));

        // Apply penalty - lose some score (never below zero)
        const penalty = Math.min(500, this.score);
        this.addScore(-penalty);

        // Reset vehicle to checkpoint position
        // reset() clears every crash, fall, jump and wheelie flag; a partial
        // reset here left the bike in cliff-fall state after a C restart
        const distanceSoFar = this.vehicle.distanceTraveled;
        this.vehicle.reset();
        this.vehicle.distanceTraveled = distanceSoFar;
        this.vehicle.position.copy(this.lastCheckpointPosition);
        this.vehicle.yawAngle = this.lastCheckpointHeading;
        this.vehicle.speed = 15; // Reset to moderate speed
        this.vehicle.findNearestRoadSegment();
        this.vehicle.updateMesh();
        // A converted leg keeps the gate's section; the window round it is built now
        if (this.environment && this.environment.sections) this.environment.ensureWindow(Math.floor(this.environment.route.toUnits(this.vehicle.routeS)), { sync: true });

        // The crash banner belongs to the crash that was just undone
        this.removeRunOverlays();

        // The clock keeps running and the penalty is in every later signed
        // time, so the run stays valid: a restart puts the rider back on a
        // gate it already passed, it never moves it forward
        this.penaltyMs += Game.RESTART_PENALTY_MS;
        this.restarts++;
        if (this.leaderboardService) this.leaderboardService.recordRestart();

        // Knocked cones go back to their home positions; a rock must not wait
        // on the gate; no car may be on top of the rider
        if (this.cones) this.cones.reset();
        if (this.rockfalls) this.rockfalls.reset();
        if (this.traffic) this.traffic.clearAround(this.environment.route.toUnits(this.vehicle.routeS), Game.RESTART_CLEAR_SEGMENTS);

        // A restart can jump back across an atmosphere zone; snap the light,
        // sky, fog and weather to the gate instead of blending from the crash
        if (this.atmosphereTrack) {
            this.snapAtmosphere(this.atmosphereTrack, this.environment.route.toUnits(this.vehicle.routeS), {
                environment: this.environment,
                weatherSystem: this.weatherSystem
            });
        }

        // Show notification
        showCallout(`Back to checkpoint +${Game.RESTART_PENALTY_MS / 1000} s`, 'warn', Game.CALLOUT_MS.restart);

        console.log('Restarted from checkpoint with penalty');
    }
}

// The headlight a world rider rides with in rain or snow (the share of the night's beam), and the share of the sun
// (and of the fill light) that comes through a world's rain cloud, and the sky light under it. The owner found the
// rain too dark twice: the sky light now halves the darkening of the first rain (mean luminance 0.40 against 0.46 dry),
// still darker and greyer than dry, and the sun stays at 0.2 (at 0.25 it glinted on the wet road)
Game.WORLD_OVERCAST_HEADLIGHT = 0.5;
Game.WORLD_OVERCAST_SUN = 0.2;
Game.WORLD_OVERCAST_SKY = 3.6;

// Debug mode's N puts the bike this far before the next station
Game.DEBUG_SKIP_BEFORE_M = 40;

// What free roam tells the rider (Game.updateFreeRoam, restartRoam)
// The colours of the side roads' cars (SideTraffic): the plain colours of country cars
Game.SIDE_CAR_COLORS = [0xf2f2f0, 0x2b2f36, 0x8a9199, 0x7a1d1d, 0x1f3f6b, 0x3d5a3a];
Game.ROAM_TEXT = { edge: 'Edge of the map: turn back', key: 'Back on the road', 'edge-back': 'Turned back at the edge of the map' };

// What leaving a world ride for the menu asks
Game.WORLD_MENU_ASK = 'Leave to the menu? Your ride so far is lost.';

// A crash in a world ride: the seconds the fall is shown before the bike is put back (mostS; leastS once the bike has
// lain under stillMs for stillS), the seconds after a restart within which a crash counts against the place (quickS),
// and the metres further back each such crash after the second moves the next place
Game.WORLD_CRASH = { mostS: 2.2, leastS: 1.5, stillMs: 0.5, stillS: 0.4, quickS: 1, backStepM: 20 };

// How long a call-out that tells the rider what went wrong stays up (ms). These outlast the fall itself: the rider
// reads the cause after the bike is back on the road, where the first half was spent watching the crash
Game.CALLOUT_MS = { crash: 4400, restart: 4000, warning: 5000, collision: 3000, bump: 2400, brush: 1500, foot: 2000 };

// What the rider is told when the tyres brush a wall and the bike rides on (Vehicle.wallTouch)
Game.BRUSH_TEXT = 'Brushed the wall';

// What the rider is told while the land near the bike is still loading (Game.watchLand), and how long the call-out may
// stay up with nothing to take it down (it is taken down when the land comes)
Game.LAND_NOTE = 'Land is still loading';
Game.LAND_NOTE_MS = 10 * 60 * 1000;

// What a rider who cannot reach the ground on a slope is told, nearly stopped on one (Vehicle.footReach)
Game.FOOT_TEXT = 'Too steep for a foot down: keep rolling';

// What a world restart tells the rider, by reason (a crash says its own cause during the fall: beginWorldCrash)
Game.WORLD_RESTART_TEXT = {
    key: 'Back on the road',
    crash: 'Crashed, back on the road',
    'off-route': 'Off route, back on the road',
    cut: 'Cut the road, back where you left it',
    'wrong-way': 'Wrong way, turned round',
    resume: 'Back on the road'
};

// A restart (at a leg's checkpoint, in place in a world) costs this much on the clock. functions/lib/boards.js
// holds the same number (LONG.penaltyMs); tests/unit/board-contract.test.js
// fails when they differ.
Game.RESTART_PENALTY_MS = 5000;
// How far past the ride's edge the bike may be and the chase camera still read the ride (WorldCamera.followRider)
Game.CAMERA_RIDE_M = 4;
// Cars within this many segments of the rider move ahead on a restart
Game.RESTART_CLEAR_SEGMENTS = 6;
// Underscores the name box shows at most: it is 250 px wide, and a placeholder longer than this only spills past it
Game.NAME_PLACEHOLDER_MAX = 8;
// The most a frame spends building the sections ahead on a converted leg (one step at least)
Game.SECTION_BUDGET_MS = 4;

// Short gameplay message in the HUD's call-out stack. tone: info, good, bad, warn or gold
function showCallout(text, tone = 'info', durationMs = 1000) {
    const hud = window.game && window.game.hud;
    if (!hud) {
        console.warn('Call-out before the HUD exists:', text);
        return;
    }
    hud.callout(text, tone, durationMs);
}

// Debug key events
document.addEventListener('keydown', (event) => {
    if (event.code === 'KeyC') {
        console.log('Global C key detected');
    }
});

// Debug mode only: N skips to before the next station (Game.debugSkipToNextGate). Not while a dialog is open: the
// dialog stack owns the keys then (js/modals.js)
document.addEventListener('keydown', (event) => {
    if (event.code !== 'KeyN' || event.repeat || !window.game || !Game.debugEnabled(window.location.search)) return;
    if (typeof Modals !== 'undefined' && Modals.top && Modals.top()) return;
    window.game.debugSkipToNextGate();
});

// Fast travel's key in a free-roam ride (Game.openTravel). Not while a dialog is open: there the pause panel's Travel
// button holds the key (js/modals.js). Not while a name is typed
document.addEventListener('keydown', (event) => {
    if (typeof FastTravel === 'undefined' || event.code !== FastTravel.KEY || event.repeat || event.ctrlKey || event.metaKey || event.altKey || !window.game || !window.game.freeRoam) return;
    if (event.target && /^(INPUT|TEXTAREA)$/.test(event.target.tagName) && !event.target.readOnly) return;
    if (typeof Modals !== 'undefined' && Modals.top && Modals.top()) return;
    window.game.openTravel();
});

// Photo mode's key in a free-roam ride (Game.openPhoto). Not while a dialog is open: the pause panel's Photo button
// holds the key there (js/modals.js). Not while a name is typed
document.addEventListener('keydown', (event) => {
    if (typeof PhotoMode === 'undefined' || event.code !== PhotoMode.KEY || event.repeat || event.ctrlKey || event.metaKey || event.altKey || !window.game || !window.game.freeRoam) return;
    if (event.target && /^(INPUT|TEXTAREA)$/.test(event.target.tagName) && !event.target.readOnly) return;
    if (typeof Modals !== 'undefined' && Modals.top && Modals.top()) return;
    window.game.openPhoto();
});

// The rider mode's key in a ride (Game.stepRiderMode). Not while a dialog is open: the dialog stack owns the keys
// then (js/modals.js), and the menu and the pause panel step the mode themselves. Not while a name is typed
document.addEventListener('keydown', (event) => {
    if (typeof RiderModes === 'undefined' || event.code !== RiderModes.STEP_KEY || event.repeat || event.ctrlKey || event.metaKey || event.altKey || !window.game) return;
    if (event.target && /^(INPUT|TEXTAREA)$/.test(event.target.tagName) && !event.target.readOnly) return;
    if (typeof Modals !== 'undefined' && Modals.top && Modals.top()) return;
    window.game.stepRiderMode();
});

// Start the game when page loads
window.addEventListener('load', () => {
    try {
        console.log('Window loaded, creating game...');
        window.game = new Game();
        console.log('Game created successfully');
    } catch (error) {
        console.error('Failed to create game:', error);
        console.error('Stack trace:', error.stack);
        
        // Display error on screen for mobile debugging
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(255, 0, 0, 0.9);
            color: white;
            padding: 20px;
            border-radius: 10px;
            font-family: monospace;
            font-size: 14px;
            max-width: 80%;
            z-index: 10000;
            white-space: pre-wrap;
            word-wrap: break-word;
        `;
        errorDiv.textContent = `Error loading game:\n${error.message}\n\nPlease refresh the page.`;
        document.body.appendChild(errorDiv);
    }
});