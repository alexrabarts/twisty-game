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
        this.tourSystem = new TourSystem();
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
        // A checkpoint restart adds 5 s to the clock; the count is signed with the finish
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
        this.soundManager = new SoundManager();
        this.soundManager.masterVolume = 0.3;
        this.hud = new Hud(document, window);

        // requestAnimationFrame stops on a hidden tab, so nothing else would
        // silence the engine drone
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.soundManager.stopEngineSound();
            }
        });

        // `?world=<stage|all>` rides the streamed world; every other page shows the legs
        const worldId = typeof WorldEnvironment !== 'undefined' ? WorldEnvironment.requested(window.location.search) : null;
        if (worldId) {
            this.startWorld(worldId);
            return;
        }

        // Show tour selector and wait for leg selection
        console.log('Showing tour selector...');
        this.tourSystem.createLegSelector(document.body, (leg) => {
            console.log('Leg selected:', leg.name);
            this.initializeGameWithLeg(leg);
        });
    }

    // Loads the world's ride layer, then builds the game round it (WorldEnvironment.load)
    async startWorld(id) {
        this.endMenuShowcase();
        this.removeRunOverlays();
        const note = document.createElement('div');
        note.id = 'world-loading';
        note.textContent = 'Loading the road...';
        note.className = 'world-loading';
        document.body.appendChild(note);
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
            await this.initializeGameWithWorld(environment);
        } catch (error) {
            console.error('Failed to load the world:', error);
            note.firstChild.textContent = `The world could not load: ${error.message}`;
            note.style.color = '#ff8a7a';
            return;
        }
        note.remove();
        document.body.classList.remove('world-loading-on');
    }

    // The game on a world: no cones or rockfalls are built (they are leg systems), traffic rides the
    // route, and the atmosphere track runs along the whole ride in 100 m units (R5).
    async initializeGameWithWorld(environment) {
        this.selectedCharacter = this.tourSystem.getSelectedCharacter ? this.tourSystem.getSelectedCharacter() : null;
        this.environment = environment;
        this.environment.onMeshBuilt = root => this.graphics.fixColorSpaces(root);
        this.environment.applyLandscapeConfig(this.environment.config.look);
        this.applyShadowBox(this.environment.config.render);
        this.cones = null;
        this.rockfalls = null;
        this.particles = new ParticleSystem(this.scene);
        // The far land stands up to 40 km away (FarLand); a leg keeps its 5 km
        this.camera.far = WorldEnvironment.FAR_PLANE_M;
        this.camera.updateProjectionMatrix();

        this.atmosphereTrack = AtmosphereTrack.forWorld(environment.route.stages, environment.route, WorldLooks.pick(window.location.search));
        if (typeof WeatherSystem !== 'undefined') {
            if (this.weatherSystem) this.weatherSystem.dispose();
            this.weatherSystem = new WeatherSystem(this.scene, this.camera, AtmosphereTrack.seededRandom(`world-${environment.config.id}`));
            this.weatherSystem.prepare(this.atmosphereTrack.weatherTypes());
        }

        this.vehicle = new Vehicle(this.scene, (points) => this.addScore(points), this.selectedCharacter, this.selectedBike());
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

        this.worldRun = new WorldRun(this.environment.route, this.environment.stationGates, this.environment.physics);
        this.worldCamera = new WorldCamera(this.environment.route, this.environment.ground);
        this.worldCamera.reset(start.heading);

        const normalCameraOffset = this.baseCameraOffset.clone();
        normalCameraOffset.applyEuler(new THREE.Euler(0, this.vehicle.yawAngle, 0));
        const normalCameraPos = this.vehicle.position.clone().add(normalCameraOffset);
        this.camera.position.copy(normalCameraPos);
        this.cameraIntroStartPos.copy(normalCameraPos);
        this.cameraIntroEndPos.copy(normalCameraPos);
        this.currentCameraPos.copy(normalCameraPos);

        this.environment.guide.onRestart = (reason) => this.restartFromCheckpoint(reason);
        this.environment.guide.onWarning = (text) => showCallout(text, 'bad', 2500);
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

    // The stage the HUD shows and the stations on its bar, as shares of the stage
    showWorldStage() {
        const { environment, hud } = this;
        const { from, to } = this.worldStageSpan();
        hud.showStage(environment.stationGates.map(station => HudRules.stageShare(station.s, from, to)));
    }

    // "Tremola" for the stage "Tremola, Airolo to the Gotthard summit"
    worldStageName() {
        const stage = this.environment.stage;
        return stage ? stage.name.split(',')[0] : 'Andermatt';
    }

    // The span of the stage being ridden: the selected stage, or the whole ride
    worldStageSpan() {
        const stage = this.environment.stage;
        return stage ? { from: stage.from, to: stage.to } : { from: 0, to: this.environment.route.length };
    }

    // Until a gate is passed, a restart puts the rider back on the start
    armWorldStart() {
        const start = this.environment.startPosition();
        this.lastCheckpointPosition = new THREE.Vector3(start.x, start.y, start.z);
        this.lastCheckpointHeading = start.heading;
        this.worldRun.begin(this.environment.startS);
        this.worldCamera.reset(start.heading);
    }

    // What the guide reads each frame; the projection is the vehicle's own, from its wall check
    worldGuideState(dt) {
        const vehicle = this.vehicle;
        return { projection: vehicle.projection, speed: vehicle.speed, yaw: vehicle.yawAngle, dt, position: vehicle.position };
    }

    initializeGameWithLeg(leg) {
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
        this.vehicle = new Vehicle(this.scene, (points) => this.addScore(points), this.selectedCharacter, this.selectedBike());
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

        // Start leaderboard session
        if (this.leaderboardService) {
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

    // Adaptive resolution: the game is fill-rate bound on high-DPI screens,
    // so step the render resolution down when FPS sags below the 60fps target
    // and back up when there's sustained headroom. Runs once per second from
    // the FPS counter.
    adaptResolution() {
        if (!this.renderer || this.paused) return;
        if (this.adaptGraceUntil && performance.now() < this.adaptGraceUntil) return;

        if (!this.dprSteps) {
            const maxDpr = Math.min(window.devicePixelRatio || 1, 2);
            this.dprSteps = [maxDpr, maxDpr * 0.875, maxDpr * 0.75, maxDpr * 0.625, maxDpr * 0.5]
                .filter(v => v >= 0.5);
            this.dprIndex = 0;
            this.headroomSeconds = 0;
        }

        const nowSec = performance.now() / 1000;
        if (this.fps < 52 && this.dprIndex < this.dprSteps.length - 1) {
            // If we just stepped up and immediately sagged, stop retrying that
            // level for a while - prevents visible up/down oscillation
            if (this.lastStepUpTime && nowSec - this.lastStepUpTime < 6) {
                this.stepUpBlockedUntil = nowSec + 90;
            }
            this.dprIndex++;
            this.headroomSeconds = 0;
            this.renderer.setPixelRatio(this.dprSteps[this.dprIndex]);
            console.log(`Adaptive resolution: pixel ratio -> ${this.dprSteps[this.dprIndex].toFixed(2)} (fps ${this.fps})`);
        } else if (this.fps >= 58 && this.dprIndex > 0) {
            // Require sustained headroom before stepping back up
            this.headroomSeconds++;
            const blocked = this.stepUpBlockedUntil && nowSec < this.stepUpBlockedUntil;
            if (this.headroomSeconds >= 10 && !blocked) {
                this.dprIndex--;
                this.headroomSeconds = 0;
                this.lastStepUpTime = nowSec;
                this.renderer.setPixelRatio(this.dprSteps[this.dprIndex]);
                console.log(`Adaptive resolution: pixel ratio -> ${this.dprSteps[this.dprIndex].toFixed(2)} (fps ${this.fps})`);
            }
        } else {
            this.headroomSeconds = 0;
        }
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
            this.hud.startRun(world ? `Stage 1 · ${this.worldStageName()}` : leg ? `Leg ${index + 1} · ${leg.name}` : '');
            this.hud.setGates(0, this.gateTotal());
            this.shownWorldStage = null;
            this.shownWorldGates = null;
            if (world) this.showWorldStage();
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
        if (panel && this.environment && typeof WorldCredits !== 'undefined') WorldCredits.showPause(this.environment, () => this.resumeRace(), () => this.leaveToMenu());
    }

    // Menu from the pause panel: a world ride asks first (confirmWorldLeave), a leg goes
    leaveToMenu() {
        if (this.environment && this.environment.isWorld) this.confirmWorldLeave(Game.WORLD_MENU_ASK, () => this.returnToMenu());
        else this.returnToMenu();
    }

    resumeRace() {
        if (!this.paused) return;
        this.paused = false;
        if (typeof WorldCredits !== 'undefined') WorldCredits.hidePause();
        if (this.pauseStartedAt) {
            // Time spent paused is not race time
            this.startTime += this.now() - this.pauseStartedAt;
            this.pauseStartedAt = 0;
        }
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
            this.graphics ? this.graphics.skyMesh : null,
            this.headlightBeam
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
        const half = render.shadowSpan / 2;
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

        // Bike headlight: one wide, soft-edged beam. It is switched off
        // entirely in daylight (see setTimeOfDay): a spot light costs every
        // lit fragment in the scene whether or not its beam shows.
        // It falls off with the square of its reach, so the road ahead is lit and
        // a white house front 60 m away is not lit as brightly as the tarmac
        // under the wheel (a near-flat falloff blew distant walls out into halos)
        this.headlight = new THREE.SpotLight(0xfff1d6, 0, 120, 0.52, 0.65, 2);
        this.headlight.castShadow = false;
        this.headlight.visible = false;
        this.scene.add(this.headlight);

        // Visible beam: light scattering in the night air ahead of the bike
        const beamGeometry = new THREE.ConeGeometry(3.4, 16, 28, 1, true);
        beamGeometry.translate(0, -8, 0);
        beamGeometry.rotateX(-Math.PI / 2); // Apex at the lamp, opening along +Z
        this.headlightBeam = new THREE.Mesh(beamGeometry, new THREE.ShaderMaterial({
            uniforms: {
                uColor: { value: new THREE.Color(0xfff1d6) },
                uStrength: { value: 0 }
            },
            vertexShader: `
                varying float vAlong;
                varying vec3 vNormalView;
                varying vec3 vViewDir;
                void main() {
                    vAlong = position.z / 16.0;
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    vNormalView = normalize(normalMatrix * normal);
                    vViewDir = normalize(-mvPosition.xyz);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                uniform vec3 uColor;
                uniform float uStrength;
                varying float vAlong;
                varying vec3 vNormalView;
                varying vec3 vViewDir;
                void main() {
                    // Bright at the lamp, gone by the end; soft at the silhouette
                    float along = (1.0 - vAlong) * (1.0 - vAlong);
                    float rim = pow(abs(dot(normalize(vNormalView), normalize(vViewDir))), 1.6);
                    gl_FragColor = vec4(uColor * along * rim * uStrength, 1.0);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
            fog: false
        }));
        this.headlightBeam.rotation.order = 'YXZ';
        this.headlightBeam.frustumCulled = false;
        this.headlightBeam.visible = false;
        this.headlightBeam.userData.skipCulling = true;
        this.scene.add(this.headlightBeam);
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
        const cache = this.timeCache || (this.timeCache = new Map());
        const cacheKey = `${timeKey}|${weatherType}`;
        if (cache.has(cacheKey)) return cache.get(cacheKey);

        const overcast = weatherType === 'rain' || weatherType === 'snow';
        const hazy = weatherType === 'fog';
        const direct = overcast ? 0.25 : hazy ? 0.6 : 1;
        const headlight = config.headlight || 0;
        const values = {
            key: timeKey,
            skyColor: config.skyColor,
            fogColor: config.fogColor,
            ambientColor: config.ambientColor,
            ambientIntensity: config.ambientIntensity,
            hemisphereTop: config.hemisphereTop,
            hemisphereBottom: config.hemisphereBottom,
            hemisphereIntensity: config.hemisphereIntensity * (overcast ? 1.35 : hazy ? 1.15 : 1),
            sunColor: config.sunColor,
            sunIntensity: config.sunIntensity * direct,
            distantIntensity: config.sunIntensity * 0.25 * direct,
            // Low at dawn/sunset for long dramatic shadows, high at midday-ish times
            sunOffset: config.sunOffset || { x: 50, y: 80 },
            // Per-time exposure - darker nights/twilights, brighter days
            exposure: config.exposure,
            fillColor: config.fillColor,
            fillIntensity: config.fillIntensity,
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
        this.headlightBeam.visible = this.headlight.visible;
        this.headlightBeam.material.uniforms.uStrength.value = this.headlightStrength * 0.14;
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
        const number = (x, y) => x + (y - x) * t;
        out.roughness = number(from.roughness, to.roughness);
        out.metalness = number(from.metalness, to.metalness);
        out.envMapIntensity = number(from.envMapIntensity, to.envMapIntensity);
        out.color = AtmosphereTrack.lerpHex(from.color, to.color, t);
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
            const leanInfluence = this.vehicle.leanAngle * (currentMode.type === 'high' ? 3 : 2); // More influence in high view
            
            // Combine lateral lag with lean influence; a world's boom turns by the route, so it has neither
            this.cameraOffset.x = this.environment.isWorld ? this.baseCameraOffset.x : this.baseCameraOffset.x - leanInfluence + this.cameraLateralOffset;
            
            // Adjust height based on speed for dramatic effect
            const speedRatio = this.vehicle.speed / this.vehicle.maxSpeed;
            this.cameraOffset.y = this.baseCameraOffset.y + speedRatio * 0.5; // Slight rise with speed
            this.cameraOffset.z = this.baseCameraOffset.z - speedRatio * (currentMode.type === 'high' ? 2 : 1); // Move back with speed
            
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
            const placed = this.worldCamera.update(this.worldCameraInput(vehiclePos, currentMode), deltaTime);
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
            const shakeIntensity = speedFactor * 0.05 * (this.vehicle.comfortShake !== undefined ? this.vehicle.comfortShake : 1);
            this.camera.position.x += (Math.random() - 0.5) * shakeIntensity;
            this.camera.position.y += (Math.random() - 0.5) * shakeIntensity * 0.3;
        }

        // Under a tunnel roof the camera stays beneath it, shake included: High
        // View sits 8 above the bike, higher than the 7.5 m roof. The smoothed
        // position keeps the clamp too, so the camera eases out of the tunnel
        // rather than jumping to where it would have been
        const roofY = this.tunnelRoofY();
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
    // position, so nothing the camera reads from the route steps where the polyline turns
    worldCameraInput(vehiclePos, mode) {
        const input = this.worldInput || (this.worldInput = { offset: {} });
        const v = this.vehicle;
        const s = v.projection.s ?? v.routeS;
        input.x = vehiclePos.x;
        input.y = vehiclePos.y;
        input.z = vehiclePos.z;
        input.s = typeof v.roadFrame === 'function' && Number.isFinite(s) && v.projection.index >= 0 ? v.roadFrame().s : s;
        input.index = v.projection.index >= 0 ? v.projection.index : Math.floor(this.environment.route.toUnits(input.s));
        input.speed = v.speed;
        input.lift = mode.type === 'high' ? 2 : 1;
        input.offset.x = this.cameraOffset.x;
        input.offset.y = this.cameraOffset.y;
        input.offset.z = this.cameraOffset.z;
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
    
    
    // The stage line, its bar and the ride distance: from the one projection of the frame
    updateWorldHud() {
        const { from, to } = this.worldStageSpan();
        const s = this.vehicle.projection.s ?? this.vehicle.routeS ?? 0;
        const run = this.worldRun;
        const k = run.stageIndex;
        const stage = this.environment.route.stages[k];
        const name = stage ? stage.name.split(',')[0] : this.worldStageName();
        const line = HudRules.stageLine(k + 1, run.stageCount, name, this.raceElapsed() - run.stageStartMs);
        // The bar and the pips follow the stage being ridden: a new stage starts them again
        const span = stage ? { from: stage.from, to: stage.to } : { from, to };
        const gates = run.stageGates(k);
        if (this.shownWorldStage !== k) {
            this.shownWorldStage = k;
            this.shownWorldGates = null;
            this.hud.showStage(this.environment.stationGates.filter(station => station.s >= span.from - 0.01 && station.s <= span.to + 0.01).map(station => HudRules.stageShare(station.s, span.from, span.to)));
        }
        if (this.shownWorldGates !== gates.passed) {
            this.shownWorldGates = gates.passed;
            this.hud.setGates(gates.passed, gates.total);
        }
        this.hud.setStage(line, HudRules.stageShare(s, span.from, span.to), HudRules.kmText(s, this.environment.route.length));
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
        const restarts = this.restarts > 0 ? `<div class="finish-board">${this.restarts} checkpoint ${this.restarts === 1 ? 'restart' : 'restarts'}, +${this.restarts * Game.RESTART_PENALTY_MS / 1000} s in your time</div>` : '';
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
            recordLine += `<div class="finish-board">${this.restarts} checkpoint ${this.restarts === 1 ? 'restart' : 'restarts'}, +${this.restarts * Game.RESTART_PENALTY_MS / 1000} s in your time</div>`;
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
        if (legs.length === 0 && characters.length === 0) return '';
        const skies = {
            dawn: ['#f6a96b', '#5b6fa8'],
            golden: ['#f7c548', '#c86b28'],
            twilight: ['#c86b9c', '#2b2f63'],
            night: ['#26305c', '#070a1c'],
            storm: ['#59677a', '#1e2530']
        };
        const bikeCards = characters.map(c => {
            const colour = '#' + parseInt(c.bikeColor).toString(16).padStart(6, '0');
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
                    <div class="unlock-sub">${c.bikeLabel}</div>
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

    // cause: what the rider hit, when the game knows it
    showCrashNotification(cause) {
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
        if (leg) {
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
        // Only the bike in view is fetched: the others keep their procedural
        // stand-in until they are focused (BikeModels.dress fetches once),
        // and a locked rider's silhouette never needs the file
        const v = this.showcaseBikes && this.showcaseBikes[focusId];
        if (v && !v.modelled && !v.dressing && this.riderTier(focusId) !== 'silhouette' && typeof BikeModels !== 'undefined') {
            v.dressing = true;
            BikeModels.dress(v);
        }
    }

    // The bike the selected rider rides: their pick on the rider select
    selectedBike() {
        if (!this.selectedCharacter || !this.tourSystem.getSelectedBike) return null;
        return this.tourSystem.getSelectedBike(this.selectedCharacter.id);
    }

    // One character's bike on the rider-select stage at `x`: their chosen
    // bike, built procedural only (focusRiderShowcase dresses it), shaded by
    // the rider's unlock tier
    buildShowcaseBike(c, x) {
        const bikeId = this.tourSystem.getSelectedBike ? this.tourSystem.getSelectedBike(c.id) : null;
        const v = new Vehicle(this.scene, null, c, bikeId, { model: false });
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
            this.adaptResolution();
        }

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
            this.graphics.render(this.scene, this.camera);
            return;
        }

        const steeringInput = this.input.getSteeringInput();
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

        // Check for checkpoint restart
        if (this.input.checkCheckpointRestart()) {
            if (this.lastCheckpointPosition) {
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

         this.vehicle.update(deltaTime, steeringInput, throttleInput, brakeInput, wheelieInput);

         // Play crash sound if we just crashed (but not if finished)
        if (!wasCrashed && this.vehicle.crashed && !this.finished) {
            this.soundManager.playCrashSound();
            this.showCrashNotification();
        }

        // Show wheelie help when over halfway round the course
        if (!this.hasShownWheelieHelp && !this.vehicle.crashed && !this.finished) {
            if (this.checkpointsPassed >= Math.ceil(this.gateTotal() / 2)) { // Over halfway round the course
                this.showWheelieHelpNotification();
                this.hasShownWheelieHelp = true;
            }
        }

        // Check for checkpoint passes and jump scoring
        if (!this.vehicle.crashed && !this.finished) {
            if (this.environment.isWorld) this.updateWorldRun(deltaTime);
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
            const collision = this.traffic.update(deltaTime, this.vehicle.position, Math.floor(this.environment.route.toUnits(this.vehicle.routeS || 0)));
            // The roadworks leave one corridor for both directions, so a car
            // on its detour (which starts before the zone and ends after it)
            // cannot be avoided: no crash against it
            const carOnDetour = collision && collision.car && collision.car.inDetour;
            if (collision && collision.hit && !this.vehicle.crashed && !inRoadworksZone && !carOnDetour) {
                this.vehicle.crashed = true;
                this.vehicle.crashAngle = this.vehicle.leanAngle || 0.5;
                this.vehicle.frame.material.color.setHex(0xff00ff);
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
                this.vehicle.crashAngle = this.vehicle.leanAngle || 0.5;
                this.vehicle.frame.material.color.setHex(0x8b5a2b);
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

        // Update engine sound based on speed
        if (!this.vehicle.crashed && !this.finished) {
            const speedRatio = this.vehicle.speed / this.vehicle.maxSpeed;
            this.soundManager.playEngineSound(speedRatio, throttleInput);
        } else {
            this.soundManager.stopEngineSound();
        }

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
            // The barrier set follows accepted progress, so a flicker of the projection cannot swap it at a junction used twice
            this.environment.update(this.vehicle.position, this.worldRun.lastS, this.worldGuideState(rawDeltaTime), Game.SECTION_BUDGET_MS, simulatedThisFrame);
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
            // The light source sits well above the lamp and is dipped onto the
            // road about 30 m ahead: a beam from lamp height only grazes the
            // tarmac and leaves it black. The visible beam cone below starts
            // at the real lamp.
            this.headlight.position.set(renderPos.x + sinYaw * 0.8, renderPos.y + 2.9, renderPos.z + cosYaw * 0.8);
            this.headlight.target.position.set(renderPos.x + sinYaw * 30, renderPos.y - 0.4, renderPos.z + cosYaw * 30);
            this.headlight.target.updateMatrixWorld();

            this.headlightBeam.position.set(renderPos.x + sinYaw * 0.8, renderPos.y + 0.9, renderPos.z + cosYaw * 0.8);
            this.headlightBeam.rotation.set(0.045, renderYaw, 0);
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
        // A world's distant land takes the colour of this frame's air (js/world/landshade.js)
        if (this.environment.isWorld) LandShade.update(this.scene, this.graphics);
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
        this.showFinishScreen();
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
            forwardDot: Math.cos(vehicle.yawAngle - projection.heading)
        });
        if (result.cut) {
            this.restartFromCheckpoint('off-route');
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
        showCallout('Collision!', 'bad', 1500);
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
    // 5 s of every checkpoint restart, so every signed time holds the penalty.
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

    showConeHitNotification(points) {
        showCallout(`Cone hit ${HudRules.number(points, { sign: true })}`, 'warn', 1000);
    }
    
    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    // The one restart of a world, for every reason: back to the last station passed (the start line before the
    // first), rolling away at a speed the next bend allows. The run stays valid; the 5 s and the restart are
    // counted once, and the guide's timers and the cut rule start again, so one excursion costs one penalty.
    restartAtStation(reason) {
        const { environment, vehicle, worldRun } = this;
        const route = environment.route;
        const s = worldRun.stationIndex === 0 ? environment.startS : worldRun.lastStation.s;
        const point = route.sample(s, {});

        this.addScore(-Math.min(500, this.score));

        const distanceSoFar = vehicle.distanceTraveled;
        vehicle.reset();
        vehicle.distanceTraveled = distanceSoFar;
        vehicle.position.set(point.x, point.y, point.z);
        vehicle.yawAngle = point.heading;
        vehicle.speed = worldRun.restartSpeed(s);
        vehicle.findNearestRoadSegment();
        vehicle.updateMesh();
        // The ground under the station is held until the data is there; until then it reads the far grid
        environment.place(s);

        this.removeRunOverlays();
        this.penaltyMs += Game.RESTART_PENALTY_MS;
        this.restarts++;
        if (this.leaderboardService) this.leaderboardService.recordRestart();

        environment.guide.reset();
        worldRun.noteRestart();
        worldRun.restartAt(s);
        this.worldCamera.reset(point.heading);
        if (this.traffic) this.traffic.clearAround(route.toUnits(s), Math.ceil(Game.RESTART_CLEAR_SEGMENTS * 20 / route.unitM));
        this.snapAtmosphere(this.atmosphereTrack, this.atmosphereUnit(s), {
            environment,
            weatherSystem: this.weatherSystem
        });
        showCallout(`${Game.WORLD_RESTART_TEXT[reason] || Game.WORLD_RESTART_TEXT.key} +${Game.RESTART_PENALTY_MS / 1000} s`, 'warn', 2000);
    }

    // Back to the last gate passed, on a rolling start. Costs 5 s and a
    // little style; the run stays valid.
    // `reason` is why: 'key', 'crash' (the crash banner's button), 'off-route', 'wrong-way' or 'resume'. Every reason
    // costs the same 5 s. A world answers it in restartAtStation.
    restartFromCheckpoint(reason = 'key') {
        this.closeWorldConfirm();
        // The run is over once the line is crossed; the finish banner owns
        // what happens next
        if (this.finished) return;
        if (this.environment && this.environment.isWorld) {
            this.restartAtStation(reason);
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
        showCallout(`Back to checkpoint +${Game.RESTART_PENALTY_MS / 1000} s`, 'warn', 2000);

        console.log('Restarted from checkpoint with penalty');
    }
}

// What leaving a world ride for the menu asks
Game.WORLD_MENU_ASK = 'Leave to the menu? Your ride so far is lost.';

// What a world restart tells the rider, by reason
Game.WORLD_RESTART_TEXT = {
    key: 'Back to checkpoint',
    crash: 'Crashed, back to checkpoint',
    'off-route': 'Off route, back to checkpoint',
    'wrong-way': 'Wrong way, back to checkpoint',
    resume: 'Back to checkpoint'
};

// A checkpoint restart costs this much on the clock. functions/lib/boards.js
// holds the same number (LONG.penaltyMs); tests/unit/board-contract.test.js
// fails when they differ.
Game.RESTART_PENALTY_MS = 5000;
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

class SoundManager {
    constructor() {
        this.audioContext = null;
        this.masterVolume = 0.3;
        this.enabled = false; // Start muted by default

        // Initialize audio context on user interaction
        this.initAudioContext();

        // Sound effect caches
        this.sounds = {};
    }

    initAudioContext() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('Web Audio API not supported');
            this.enabled = false;
        }
    }

    // Create a simple beep sound
    createBeep(frequency = 440, duration = 0.2, type = 'sine') {
        if (!this.enabled || !this.audioContext) return;

        // Resume audio context if suspended (required by Web Audio API)
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
        oscillator.type = type;

        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(this.masterVolume * 0.5, this.audioContext.currentTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration);

        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + duration);
    }

    // Engine sound (continuous)
    playEngineSound(speed = 0, throttle = 0) {
        if (!this.enabled || !this.audioContext) return;

        // Resume audio context if suspended (required by Web Audio API)
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        const now = this.audioContext.currentTime;
        // Engine revs track speed; throttle adds an extra rev rise + volume
        const baseFreq = 70 + speed * 55 + throttle * 18;

        // This is called every frame: keep one persistent oscillator graph and
        // ramp its parameters instead of rebuilding nodes per call
        if (!this.engineSound) {
            const gainNode = this.audioContext.createGain();
            gainNode.connect(this.audioContext.destination);
            gainNode.gain.setValueAtTime(this.masterVolume * 0.18, now);

            const filter = this.audioContext.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(220 + speed * 900, now);
            filter.Q.value = 1.2;
            filter.connect(gainNode);

            // Main "cylinder" pair: two slightly detuned saws beat against
            // each other for a throatier engine note than a single oscillator
            const oscillator = this.audioContext.createOscillator();
            oscillator.type = 'sawtooth';
            oscillator.frequency.setValueAtTime(baseFreq, now);
            oscillator.connect(filter);

            const detuneOsc = this.audioContext.createOscillator();
            detuneOsc.type = 'sawtooth';
            detuneOsc.frequency.setValueAtTime(baseFreq, now);
            detuneOsc.detune.setValueAtTime(12, now); // ~12 cents sharp
            const detuneGain = this.audioContext.createGain();
            detuneGain.gain.value = 0.6;
            detuneOsc.connect(detuneGain);
            detuneGain.connect(filter);

            // Sub-octave thump for low-end weight
            const subOsc = this.audioContext.createOscillator();
            subOsc.type = 'triangle';
            subOsc.frequency.setValueAtTime(baseFreq / 2, now);
            const subGain = this.audioContext.createGain();
            subGain.gain.value = 0.8;
            subOsc.connect(subGain);
            subGain.connect(filter);

            // Upper harmonic rasp
            const harmonicOsc = this.audioContext.createOscillator();
            harmonicOsc.type = 'square';
            harmonicOsc.frequency.setValueAtTime(baseFreq * 2, now);
            const harmonicGain = this.audioContext.createGain();
            harmonicGain.gain.value = 0.25;
            harmonicOsc.connect(harmonicGain);
            harmonicGain.connect(filter);

            // Wind noise: looping white noise through a bandpass, swelling
            // with speed - the main sensation of velocity on a bike
            const noiseLength = this.audioContext.sampleRate * 2;
            const noiseBuffer = this.audioContext.createBuffer(1, noiseLength, this.audioContext.sampleRate);
            const noiseData = noiseBuffer.getChannelData(0);
            for (let i = 0; i < noiseLength; i++) {
                noiseData[i] = Math.random() * 2 - 1;
            }
            const windSource = this.audioContext.createBufferSource();
            windSource.buffer = noiseBuffer;
            windSource.loop = true;
            const windFilter = this.audioContext.createBiquadFilter();
            windFilter.type = 'bandpass';
            windFilter.frequency.setValueAtTime(700, now);
            windFilter.Q.value = 0.6;
            const windGain = this.audioContext.createGain();
            windGain.gain.setValueAtTime(0, now);
            windSource.connect(windFilter);
            windFilter.connect(windGain);
            windGain.connect(this.audioContext.destination);

            oscillator.start();
            detuneOsc.start();
            subOsc.start();
            harmonicOsc.start();
            windSource.start();

            this.engineSound = {
                oscillator,
                detuneOsc,
                subOsc,
                harmonicOsc,
                gainNode,
                filter,
                windSource,
                windFilter,
                windGain,
                stop: () => {
                    try {
                        oscillator.stop();
                        detuneOsc.stop();
                        subOsc.stop();
                        harmonicOsc.stop();
                        windSource.stop();
                    } catch (e) {}
                }
            };
        } else {
            // Smoothly track the current speed and throttle
            const ramp = 0.06;
            const e = this.engineSound;
            e.oscillator.frequency.linearRampToValueAtTime(baseFreq, now + ramp);
            e.detuneOsc.frequency.linearRampToValueAtTime(baseFreq, now + ramp);
            e.subOsc.frequency.linearRampToValueAtTime(baseFreq / 2, now + ramp);
            e.harmonicOsc.frequency.linearRampToValueAtTime(baseFreq * 2, now + ramp);
            // Filter opens with speed and throttle - brighter under load
            e.filter.frequency.linearRampToValueAtTime(220 + speed * 900 + throttle * 350, now + ramp);
            // Volume swells with throttle, idles back when coasting
            const engineLevel = this.masterVolume * (0.12 + throttle * 0.14 + speed * 0.05);
            e.gainNode.gain.linearRampToValueAtTime(engineLevel, now + ramp);
            // Wind builds with the square of speed, pitch rises slightly
            const windLevel = this.masterVolume * speed * speed * 0.5;
            e.windGain.gain.linearRampToValueAtTime(windLevel, now + ramp);
            e.windFilter.frequency.linearRampToValueAtTime(600 + speed * 700, now + ramp);
        }
    }

    stopEngineSound() {
        if (this.engineSound) {
            this.engineSound.stop();
            this.engineSound = null;
        }
    }

    // Checkpoint pass sound
    playCheckpointSound() {
        // Ascending chime
        setTimeout(() => this.createBeep(523, 0.15), 0);   // C5
        setTimeout(() => this.createBeep(659, 0.15), 100); // E5
        setTimeout(() => this.createBeep(784, 0.15), 200); // G5
    }

    // Cone hit sound
    playConeHitSound() {
        // Descending thud
        this.createBeep(220, 0.1, 'sawtooth'); // A3
        setTimeout(() => this.createBeep(165, 0.1, 'sawtooth'), 50); // E3
    }

    // Jump sound
    playJumpSound() {
        // Quick ascending whoosh
        this.createBeep(330, 0.08); // E4
        setTimeout(() => this.createBeep(440, 0.08), 40); // A4
        setTimeout(() => this.createBeep(554, 0.08), 80); // C#5
    }

    // Crash sound
    playCrashSound() {
        // Chaotic noise burst
        for (let i = 0; i < 5; i++) {
            setTimeout(() => {
                const freq = 100 + Math.random() * 200;
                this.createBeep(freq, 0.05 + Math.random() * 0.1, 'sawtooth');
            }, i * 20);
        }
    }

    // Tire screech
    playTireScreech() {
        if (!this.enabled || !this.audioContext) return;

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        const filter = this.audioContext.createBiquadFilter();

        oscillator.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(200, this.audioContext.currentTime + 0.3);
        oscillator.type = 'sawtooth';

        filter.type = 'highpass';
        filter.frequency.setValueAtTime(500, this.audioContext.currentTime);

        gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(this.masterVolume * 0.4, this.audioContext.currentTime + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.3);

        oscillator.start();
        oscillator.stop(this.audioContext.currentTime + 0.3);
    }

    // Brake sound
    playBrakeSound() {
        this.createBeep(150, 0.1, 'sawtooth');
    }

    // Toggle sound on/off
    toggleSound() {
        this.enabled = !this.enabled;
        if (!this.enabled) {
            this.stopEngineSound();
        }

        // Show sound toggle notification
        this.showSoundToggleNotification(this.enabled);

        console.log('Sound ' + (this.enabled ? 'enabled' : 'disabled'));
    }

    showSoundToggleNotification(enabled) {
        showCallout(`Sound ${enabled ? 'on' : 'off'}`, enabled ? 'good' : 'info', 1000);
    }

}

// Debug key events
document.addEventListener('keydown', (event) => {
    if (event.code === 'KeyC') {
        console.log('Global C key detected');
    }
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