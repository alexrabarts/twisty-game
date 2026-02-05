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
        this.timeConfigs = {
            golden: {
                name: 'Golden Hour',
                skyColor: 0xb8d4e8,
                fogColor: 0xc8dae8,
                ambientColor: 0x303030,
                ambientIntensity: 0.25,
                hemisphereTop: 0x8ab8d6,
                hemisphereBottom: 0x2a3f2a,
                hemisphereIntensity: 0.3,
                sunColor: 0xfff4e6,
                sunIntensity: 0.85,
                fillColor: 0xe6f2ff,
                fillIntensity: 0.15,
                rimColor: 0xfff8e1,
                rimIntensity: 0.25
            },
            sunset: {
                name: 'Sunset',
                skyColor: 0xff8866,
                fogColor: 0xffa588,
                ambientColor: 0x402020,
                ambientIntensity: 0.3,
                hemisphereTop: 0xff8844,
                hemisphereBottom: 0x4a2a1a,
                hemisphereIntensity: 0.4,
                sunColor: 0xff6633,
                sunIntensity: 0.9,
                fillColor: 0xff9977,
                fillIntensity: 0.2,
                rimColor: 0xffaa66,
                rimIntensity: 0.3
            },
            twilight: {
                name: 'Twilight',
                skyColor: 0x4466aa,
                fogColor: 0x5577bb,
                ambientColor: 0x202040,
                ambientIntensity: 0.35,
                hemisphereTop: 0x5577cc,
                hemisphereBottom: 0x2a2a4a,
                hemisphereIntensity: 0.35,
                sunColor: 0x6688cc,
                sunIntensity: 0.5,
                fillColor: 0x8899dd,
                fillIntensity: 0.15,
                rimColor: 0x99aaee,
                rimIntensity: 0.2
            },
            night: {
                name: 'Night',
                skyColor: 0x020408,
                fogColor: 0x050a12,
                ambientColor: 0x030306,
                ambientIntensity: 0.03,
                hemisphereTop: 0x080f18,
                hemisphereBottom: 0x020204,
                hemisphereIntensity: 0.05,
                sunColor: 0x223344,  // Moon
                sunIntensity: 0.08,
                fillColor: 0x0f1520,
                fillIntensity: 0.02,
                rimColor: 0x1a2028,
                rimIntensity: 0.03
            },
            dawn: {
                name: 'Dawn',
                skyColor: 0xffa588,
                fogColor: 0xffb899,
                ambientColor: 0x403020,
                ambientIntensity: 0.28,
                hemisphereTop: 0xffcc99,
                hemisphereBottom: 0x4a3a2a,
                hemisphereIntensity: 0.35,
                sunColor: 0xffe0bb,
                sunIntensity: 0.75,
                fillColor: 0xffddaa,
                fillIntensity: 0.18,
                rimColor: 0xffeecc,
                rimIntensity: 0.25
            }
        };

        // Create tour system
        console.log('Creating tour system...');
        this.tourSystem = new TourSystem();

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
        this.startTime = performance.now();

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

        // Show tour selector and wait for leg selection
        console.log('Showing tour selector...');
        this.tourSystem.createLegSelector(document.body, (leg) => {
            console.log('Leg selected:', leg.name);
            this.initializeGameWithLeg(leg);
        });
    }

    initializeGameWithLeg(leg) {
        // Hide tour selector
        this.tourSystem.hideLegSelector();

        // Set time of day for the leg
        this.setTimeOfDay(leg.timeOfDay);

        console.log('Creating environment...');
        try {
            // Create environment with lazy generation for the selected leg
            const legIndex = this.tourSystem.getCurrentLegIndex();
            this.environment = new Environment(this.scene, leg.startSegment, leg.endSegment, legIndex);
            console.log('Environment created successfully');

            // Apply landscape configuration for the leg
            const landscapeConfig = this.tourSystem.getLandscapeConfig();
            this.environment.applyLandscapeConfig(landscapeConfig);

            // Initialize weather system
            console.log('Initializing weather system...');
            if (typeof WeatherSystem !== 'undefined') {
                this.weatherSystem = new WeatherSystem(this.scene, this.camera);

                // Apply weather from leg
                const weatherType = leg.weather || 'clear';
                const weatherIntensity = leg.weatherIntensity !== undefined ? leg.weatherIntensity : 1.0;
                this.weatherSystem.setWeather(weatherType, weatherIntensity);

                // Apply weather visuals to environment
                this.environment.applyWeatherVisuals(weatherType, weatherIntensity);

                console.log(`Weather set to: ${weatherType} (intensity: ${weatherIntensity})`);
            } else {
                console.warn('WeatherSystem class not found');
            }
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

        console.log('Creating traffic...');
        this.traffic = new Traffic(this.scene, this.environment);

        console.log('Creating particle system...');
        this.particles = new ParticleSystem(this.scene);

        console.log('Creating vehicle...');
        this.vehicle = new Vehicle(this.scene, (points) => this.addScore(points));
        this.vehicle.environment = this.environment; // Pass environment reference for elevation

        // Connect weather system to vehicle
        if (this.weatherSystem) {
            this.vehicle.setWeatherSystem(this.weatherSystem);
        }

        // Initialize vehicle at leg start position
        if (this.environment.roadPath && this.environment.roadPath.length > 0) {
            const startPos = this.tourSystem.getStartingPosition(this.environment.roadPath);
            this.vehicle.position.x = startPos.x;
            this.vehicle.position.y = startPos.y;
            this.vehicle.position.z = startPos.z;
            this.vehicle.yawAngle = startPos.heading;

            // Initialize segment tracking to match starting position
            this.vehicle.currentRoadSegment = leg.startSegment;
            this.vehicle.segmentProgress = 0;

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
        this.score = 0;
        this.checkpointsPassed = 0;
        this.finished = false;
        this.vehicle.finished = false;
        this.startTime = performance.now();

        // Start leaderboard session
        if (this.leaderboardService) {
            this.leaderboardService.startRun(leg.id).then(result => {
                if (result === true) {
                    console.log('Leaderboard session started for leg:', leg.id);
                } else if (result.error) {
                    console.warn('Leaderboard session start failed:', result.message);
                }
            }).catch(error => {
                console.error('Failed to start leaderboard session:', error);
            });
        }

        console.log('Starting animation loop...');
        // Delay first frame to ensure renderer is fully initialized
        this.animationFrameId = requestAnimationFrame(() => this.animate());
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

        // Clear scene objects (keep camera and lights)
        if (this.scene) {
            const objectsToRemove = [];
            this.scene.children.forEach(child => {
                if (child !== this.camera &&
                    child !== this.directionalLight &&
                    child !== this.distantLight &&
                    child !== this.ambientLight &&
                    child !== this.leftHeadlight &&
                    child !== this.rightHeadlight) {
                    objectsToRemove.push(child);
                }
            });
            objectsToRemove.forEach(obj => this.scene.remove(obj));
        }

        // Reset game state
        this.finished = false;
        this.score = 0;
        this.checkpointsPassed = 0;
        this.combo = 0;
        this.comboMultiplier = 1;

        console.log('Cleaned up current leg');
    }

    returnToMenu() {
        console.log('Returning to menu...');

        // Remove finish banner if exists
        const finishBanner = document.getElementById('finishBanner');
        if (finishBanner) {
            finishBanner.remove();
        }

        // Remove crash notification if exists
        const crashNotification = document.getElementById('crashNotification');
        if (crashNotification) {
            crashNotification.remove();
        }

        // Cleanup current leg
        this.cleanupCurrentLeg();

        // Show leg selector
        this.tourSystem.showLegSelector();

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

        console.log(`Starting next leg: ${nextLeg.name}`);

        // Remove finish banner
        const finishBanner = document.getElementById('finishBanner');
        if (finishBanner) {
            finishBanner.remove();
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

        console.log(`Starting first leg: ${firstLeg.name}`);

        // Remove finish banner
        const finishBanner = document.getElementById('finishBanner');
        if (finishBanner) {
            finishBanner.remove();
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
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 0.8;
        document.body.appendChild(this.renderer.domElement);
        
        const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
        pmremGenerator.compileEquirectangularShader();
        
        const envScene = new THREE.Scene();
        envScene.background = new THREE.Color(0xb8d4e8);
        this.scene.environment = pmremGenerator.fromScene(envScene).texture;
        
        window.addEventListener('resize', () => this.onWindowResize());
    }

    setupScene() {
        // Atmospheric mountain scene with warm lighting
        this.scene.background = new THREE.Color(0xb8d4e8);
        // Enhanced fog with warmer tone for golden hour atmosphere
        this.scene.fog = new THREE.FogExp2(0xc8dae8, 0.0018);
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
        this.directionalLight.shadow.mapSize.width = 4096;
        this.directionalLight.shadow.mapSize.height = 4096;
        this.directionalLight.shadow.camera.near = 0.1;
        this.directionalLight.shadow.camera.far = 300;
        this.directionalLight.shadow.camera.left = -60;
        this.directionalLight.shadow.camera.right = 60;
        this.directionalLight.shadow.camera.top = 60;
        this.directionalLight.shadow.camera.bottom = -60;
        this.directionalLight.shadow.bias = -0.0001;
        this.scene.add(this.directionalLight);
        
        // Store initial light offset from origin
        this.lightOffset = this.directionalLight.position.clone();
        
        // Secondary directional light for distant shadows
        this.distantLight = new THREE.DirectionalLight(0xffffff, 0.2);
        this.distantLight.position.set(50, 80, 0);
        this.distantLight.castShadow = true;
        this.distantLight.shadow.mapSize.width = 1024;
        this.distantLight.shadow.mapSize.height = 1024;
        this.distantLight.shadow.camera.near = 50;
        this.distantLight.shadow.camera.far = 800;
        this.distantLight.shadow.camera.left = -200;
        this.distantLight.shadow.camera.right = 200;
        this.distantLight.shadow.camera.top = 200;
        this.distantLight.shadow.camera.bottom = -200;
        this.distantLight.shadow.bias = -0.001;
        this.scene.add(this.distantLight);

        // Fill light from opposite side with cool blue tone
        this.fillLight = new THREE.DirectionalLight(0xe6f2ff, 0.15);
        this.fillLight.position.set(-50, 30, 0);
        this.scene.add(this.fillLight);

        // Rim light for vehicle highlighting
        this.rimLight = new THREE.DirectionalLight(0xfff8e1, 0.25);
        this.rimLight.position.set(0, 10, -50);
        this.scene.add(this.rimLight);

        // Vehicle headlights - subtle
        this.leftHeadlight = new THREE.SpotLight(0xffffff, 0.5, 100, Math.PI/6, 0.1, 2);
        this.leftHeadlight.castShadow = true;
        this.leftHeadlight.shadow.mapSize.width = 1024;
        this.leftHeadlight.shadow.mapSize.height = 1024;
        this.scene.add(this.leftHeadlight);

        this.rightHeadlight = new THREE.SpotLight(0xffffff, 0.5, 100, Math.PI/6, 0.1, 2);
        this.rightHeadlight.castShadow = true;
        this.rightHeadlight.shadow.mapSize.width = 1024;
        this.rightHeadlight.shadow.mapSize.height = 1024;
        this.scene.add(this.rightHeadlight);
    }

    setTimeOfDay(timeKey) {
        const config = this.timeConfigs[timeKey];
        if (!config) {
            console.error('Invalid time of day:', timeKey);
            return;
        }

        this.timeOfDay = timeKey;
        console.log('Switching to:', config.name);

        // Update scene colors
        this.scene.background = new THREE.Color(config.skyColor);
        this.scene.fog.color = new THREE.Color(config.fogColor);

        // Update ambient light
        this.ambientLight.color = new THREE.Color(config.ambientColor);
        this.ambientLight.intensity = config.ambientIntensity;

        // Update hemisphere light
        this.hemisphereLight.color = new THREE.Color(config.hemisphereTop);
        this.hemisphereLight.groundColor = new THREE.Color(config.hemisphereBottom);
        this.hemisphereLight.intensity = config.hemisphereIntensity;

        // Update directional light (sun/moon)
        this.directionalLight.color = new THREE.Color(config.sunColor);
        this.directionalLight.intensity = config.sunIntensity;

        // Update fill light
        this.fillLight.color = new THREE.Color(config.fillColor);
        this.fillLight.intensity = config.fillIntensity;

        // Update rim light
        this.rimLight.color = new THREE.Color(config.rimColor);
        this.rimLight.intensity = config.rimIntensity;

        // Enhance headlights for night mode
        if (timeKey === 'night') {
            this.leftHeadlight.intensity = 1.5;
            this.rightHeadlight.intensity = 1.5;
        } else {
            this.leftHeadlight.intensity = 0.5;
            this.rightHeadlight.intensity = 0.5;
        }

        // Show notification (disabled - don't show popup at level start)
        // this.showTimeOfDayNotification(config.name);
    }

    showTimeOfDayNotification(timeName) {
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = timeName;
        notification.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 15px 30px;
            border-radius: 10px;
            font-size: 24px;
            z-index: 1000;
            animation: fadeInOut 2s ease-out;
        `;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 2000);
    }

    setupCamera() {
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 5000);
        
        // Initial camera position - start in follow position
        this.camera.position.set(0, 4, -10); // Behind bike
        this.camera.lookAt(0, 1, 0); // Look at bike center, not ground
        
        // Camera intro animation disabled - start directly in follow position
        this.cameraIntroActive = false;
        this.cameraIntroStartTime = performance.now();
        this.cameraIntroDuration = 1800;
        this.cameraIntroStartPos = new THREE.Vector3(0, 4, -10);
        this.cameraIntroEndPos = new THREE.Vector3(0, 4, -10);
        
        // Camera mode system
        this.cameraMode = 0; // 0 = standard, 1 = high/far, 2 = onboard
        this.cameraModes = [
            { name: 'Standard', offset: new THREE.Vector3(0, 3, -6), lerpFactor: 0.10 },
            { name: 'High View', offset: new THREE.Vector3(0, 8, -12), lerpFactor: 0.08 },
            { name: 'Onboard', offset: new THREE.Vector3(0, 1.2, 0.5), lerpFactor: 0.18 }
        ];
        
        // Dynamic camera offset for mountain roads
        this.baseCameraOffset = this.cameraModes[0].offset.clone();
        this.cameraOffset = this.baseCameraOffset.clone();
        this.cameraTarget = new THREE.Vector3();
        this.currentCameraPos = this.camera.position.clone();
        this.currentLookTarget = new THREE.Vector3(0, 1, 0);

        // Reusable objects for camera updates to avoid GC pressure
        this.tempMatrix = new THREE.Matrix4();
        this.tempVector = new THREE.Vector3();
        this.tempUpVector = new THREE.Vector3();
        this.cameraLerpFactor = this.cameraModes[0].lerpFactor;
        this.cameraLateralOffset = 0; // Track lateral offset for smooth side movement
        this.previousYawAngle = 0; // Track yaw changes for lateral movement
        
        // Camera banking state - persists across frames to prevent jumps
        this.currentCameraBanking = 0;
        
        console.log('Camera setup complete - starting intro animation');
    }



    updateCamera() {
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
            this.currentCameraBanking = THREE.MathUtils.lerp(this.currentCameraBanking, 0, 0.2);
            this.camera.rotation.z = this.currentCameraBanking;
            return;
        }
        
        // Normal camera follow behavior
        const vehiclePos = this.vehicle.position.clone();
        const vehicleRotation = new THREE.Euler(0, this.vehicle.yawAngle, 0);
        
        // Calculate yaw change for lateral camera lag
        const yawDelta = this.vehicle.yawAngle - this.previousYawAngle;
        this.previousYawAngle = this.vehicle.yawAngle;
        
        // Update lateral offset - camera swings opposite to turn direction initially
        const targetLateralOffset = -yawDelta * 25; // Strong lateral movement
        this.cameraLateralOffset = this.cameraLateralOffset * 0.85 + targetLateralOffset * 0.15;

        // Get current camera mode settings
        const currentMode = this.cameraModes[this.cameraMode];
        this.baseCameraOffset = currentMode.offset.clone();
        this.cameraLerpFactor = currentMode.lerpFactor;
        
        // Mode-specific adjustments
        if (this.cameraMode === 2) {
            // Onboard camera - minimal lateral movement, rotates with bike
            this.cameraOffset.x = this.baseCameraOffset.x;
            this.cameraOffset.y = this.baseCameraOffset.y;
            this.cameraOffset.z = this.baseCameraOffset.z;
            
            // Add small vibration for realism
            this.cameraOffset.x += Math.sin(performance.now() * 0.01) * 0.02;
            this.cameraOffset.y += Math.sin(performance.now() * 0.013) * 0.01;
        } else {
            // Standard and High View cameras
            // Dynamic camera offset based on lean angle for better mountain road feel
            const leanInfluence = this.vehicle.leanAngle * (this.cameraMode === 1 ? 3 : 2); // More influence in high view
            
            // Combine lateral lag with lean influence
            this.cameraOffset.x = this.baseCameraOffset.x - leanInfluence + this.cameraLateralOffset;
            
            // Adjust height based on speed for dramatic effect
            const speedRatio = this.vehicle.speed / this.vehicle.maxSpeed;
            this.cameraOffset.y = this.baseCameraOffset.y + speedRatio * 0.5; // Slight rise with speed
            this.cameraOffset.z = this.baseCameraOffset.z - speedRatio * (this.cameraMode === 1 ? 2 : 1); // Move back with speed
            
            // Wheelie camera swing - move camera to the side for dramatic wheelie view
            if (this.vehicle.isWheelie && this.cameraMode !== 1) { // Less swing in high view
                const wheelieSwing = 8; // How far to swing the camera laterally
                this.cameraOffset.x += wheelieSwing;
            }
        }

        // Calculate camera position relative to vehicle
        const offset = this.cameraOffset.clone();
        offset.applyEuler(vehicleRotation);
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
        
        this.currentCameraPos.lerp(cameraPos, lerpFactor);
        
        // Ensure camera never goes below bike level (bike is at roughly y=2)
        const minCameraHeight = vehiclePos.y + 2; // At least 2 units above bike
        if (this.currentCameraPos.y < minCameraHeight) {
            this.currentCameraPos.y = minCameraHeight;
        }
        
        this.camera.position.copy(this.currentCameraPos);

        // Additional camera shake at high speeds (outside onboard mode)
        if (this.cameraMode !== 2) {
            const speedFactor = this.vehicle.speed / this.vehicle.maxSpeed;
            const shakeIntensity = speedFactor * 0.05;
            this.camera.position.x += (Math.random() - 0.5) * shakeIntensity;
            this.camera.position.y += (Math.random() - 0.5) * shakeIntensity * 0.3;
        }

        // Mode-specific FOV and look target
        const speedRatio = this.vehicle.speed / this.vehicle.maxSpeed;
        
        if (this.cameraMode === 2) {
            // Onboard camera - wider FOV, look directly ahead
            this.camera.fov = 90 + speedRatio * 10; // 90 to 100 degrees for immersive onboard view
            this.camera.updateProjectionMatrix();
            
            // Look straight ahead from bike position
            const lookAheadDistance = 10 + speedRatio * 5;
            this.tempVector.set(0, 0.5, lookAheadDistance);
            this.tempVector.applyEuler(vehicleRotation);

            const lookTarget = this.vehicle.position.clone().add(this.tempVector);
            
            this.currentLookTarget.lerp(lookTarget, 0.3); // Fast response for onboard
            
            // Onboard camera banking - calculate BEFORE lookAt with custom up vector
            // Onboard view banks WITH the bike - aggressive tilt for immersive feel
            const onboardBankAmount = this.vehicle.leanAngle * 0.9; // 90% banking, same direction
            const targetOnboardBank = THREE.MathUtils.clamp(onboardBankAmount, -0.7, 0.7); // Max ~40° bank
            this.currentCameraBanking = THREE.MathUtils.lerp(this.currentCameraBanking, targetOnboardBank, 0.2);

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
            const baseFOV = this.cameraMode === 1 ? 70 : 75;
            const maxFOVIncrease = 10; // 75° → 85° at max speed
            const targetFOV = baseFOV + (speedFactor * maxFOVIncrease);

            // Smooth FOV transition
            if (!this.currentFOV) this.currentFOV = baseFOV;
            this.currentFOV = THREE.MathUtils.lerp(this.currentFOV, targetFOV, 0.05);
            this.camera.fov = this.currentFOV;
            this.camera.updateProjectionMatrix();

            // Enhanced camera shake with multiple sources
            if (!this.cameraShakeOffset) this.cameraShakeOffset = new THREE.Vector3();

            // Base speed shake - increases dramatically at high speeds
            const speedShake = Math.pow(speedFactor, 2) * 0.12;

            // Terrain/roughness shake - simulates bumpy road
            const terrainShake = Math.sin(performance.now() * 0.02) * 0.015 * speedFactor;

            // Landing impact shake - big jolt when landing from jumps
            let landingShake = 0;
            if (this.vehicle.isJumping) {
                this.lastJumpState = true;
            } else if (this.lastJumpState) {
                // Just landed - create impact shake
                this.landingShakeIntensity = 0.3;
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
            const lookAheadDistance = (this.cameraMode === 1 ? 5 : 3) + speedRatio * 7; // Look further in high view
            this.tempVector.set(0, 0, lookAheadDistance);
            this.tempVector.applyEuler(vehicleRotation);

            const lookTarget = this.vehicle.position.clone().add(this.tempVector);
            lookTarget.y += this.cameraMode === 1 ? 2 : 1; // Look higher in high view
            
            // Add lean-based lateral offset for corner viewing (less in high view)
            const leanLateralOffset = -this.vehicle.leanAngle * (this.cameraMode === 1 ? 2 : 4);
            this.tempUpVector.set(leanLateralOffset, 0, 0);
            this.tempUpVector.applyEuler(vehicleRotation);
            lookTarget.add(this.tempUpVector);
            this.currentLookTarget.lerp(lookTarget, this.cameraLerpFactor * 1.5);
            
            // Camera banking BEFORE lookAt - subtle lean feedback
            const bankFactor = this.cameraMode === 1 ? 0.15 : 0.25; // High view more subtle
            // Positive lean = right lean, bank camera right (positive rotation around forward axis)
            const bankAmount = this.vehicle.leanAngle * bankFactor;
            const targetBank = THREE.MathUtils.clamp(bankAmount, -0.3, 0.3); // Max ~17° bank
            this.currentCameraBanking = THREE.MathUtils.lerp(this.currentCameraBanking, targetBank, 0.15);

            // Wheelie camera tilt - pitch camera up to follow bike angle
            let wheelieTilt = 0;
            if (this.vehicle.isWheelie && this.vehicle.wheelieAngle) {
                // Tilt camera up proportional to wheelie angle (max ~15°)
                wheelieTilt = Math.min(this.vehicle.wheelieAngle * 0.4, 0.26); // ~15° max
            }

            // Smooth wheelie tilt transition
            if (!this.currentWheelieTilt) this.currentWheelieTilt = 0;
            this.currentWheelieTilt = THREE.MathUtils.lerp(this.currentWheelieTilt, wheelieTilt, 0.1);

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
    
    updateShadowCamera() {
        // Make the directional lights' shadow cameras follow the player
        const playerPos = this.vehicle.position;
        
        // Update near shadow light position to stay relative to player
        this.directionalLight.position.copy(playerPos).add(this.lightOffset);
        this.directionalLight.target.position.copy(playerPos);
        this.directionalLight.target.updateMatrixWorld();
        
        // Update distant shadow light similarly
        this.distantLight.position.copy(playerPos).add(this.lightOffset);
        this.distantLight.target.position.copy(playerPos);
        this.distantLight.target.updateMatrixWorld();
    }

    updateUI() {
        if (this.finished) {
            // Dashboard remains visible but update for finish state
            const dashboard = document.querySelector('.dashboard');
            if (dashboard) {
                dashboard.style.opacity = '0.5';
            }
            return;
        }

        // Update speedometer
        const speed = this.vehicle.getSpeed().toFixed(0);
        const speedElement = document.getElementById('speed');
        speedElement.textContent = speed;

        // Color code speed for speedometer
        if (speed < 20) {
            speedElement.style.color = '#FF4444'; // Red for too slow
            speedElement.style.textShadow = '0 0 15px rgba(255, 68, 68, 0.8)';
        } else if (speed < 40) {
            speedElement.style.color = '#FFAA44'; // Orange for slow
            speedElement.style.textShadow = '0 0 15px rgba(255, 170, 68, 0.8)';
        } else {
            speedElement.style.color = '#00FF00'; // Green for good speed
            speedElement.style.textShadow = '0 0 15px rgba(0, 255, 0, 0.8)';
        }

        // Update speed vignette - tunnel vision effect at high speeds
        const speedVignette = document.getElementById('speedVignette');
        if (speedVignette) {
            const speedRatio = this.vehicle.speed / this.vehicle.maxSpeed;
            // Vignette kicks in at 50% speed, full effect at max speed
            const vignetteOpacity = Math.max(0, (speedRatio - 0.5) * 2);
            speedVignette.style.opacity = vignetteOpacity;
        }

        // Update FPS
        document.getElementById('fps').textContent = `FPS: ${this.fps}`;

        // Update wheelie indicator
        this.updateWheelieIndicator();
        
        // Update score display
        this.updateScoreDisplay();
    }
    
    
    updateWheelieIndicator() {
        const indicator = document.getElementById('wheelieIndicator');
        const zoneText = document.getElementById('wheelieZone');
        const comboText = document.getElementById('wheelieCombo');

        if (this.vehicle.isWheelie) {
            const angleDegrees = this.vehicle.wheelieAngle * 180 / Math.PI;
            const maxAngleDegrees = this.vehicle.wheelieCrashAngle * 180 / Math.PI; // 81 degrees
            const angleRatio = Math.min(1, angleDegrees / maxAngleDegrees); // 0 to 1 as we approach crash

            indicator.classList.add('active');

            // Remove all color classes to prevent position shifts
            indicator.classList.remove('perfect', 'good', 'danger', 'low');

            // Continuous color transition from green to orange to red
            let r, g, b;
            if (angleRatio < 0.5) {
                // Green to orange (0 to 0.5 ratio)
                const transition = angleRatio * 2; // 0 to 1
                r = Math.round(0 + transition * 255); // 0 to 255
                g = Math.round(255 - transition * 0); // 255 to 255
                b = 0;
            } else {
                // Orange to red (0.5 to 1.0 ratio)
                const transition = (angleRatio - 0.5) * 2; // 0 to 1
                r = Math.round(255 - transition * 0); // 255 to 255
                g = Math.round(165 - transition * 165); // 165 to 0
                b = 0;
            }

            // Apply the color continuously
            indicator.style.color = `rgb(${r}, ${g}, ${b})`;
            indicator.style.background = `rgba(${r}, ${g}, ${b}, 0.2)`;
            indicator.style.textShadow = `0 0 20px rgba(${r}, ${g}, ${b}, 0.8)`;

            // Show wheelie text with angle
            zoneText.textContent = `WHEELIE ${angleDegrees.toFixed(0)}°`;

            // Clear combo text (no longer using combo system)
            comboText.textContent = '';
        } else {
            indicator.classList.remove('active');
            // Reset styles when not active
            indicator.style.color = '';
            indicator.style.background = '';
            indicator.style.textShadow = '';
        }
    }

    showFinishScreen() {
        // Calculate final score with finish bonus
        const distance = this.vehicle.getDistanceTraveled();
        const timeSeconds = this.finishTime / 1000;
        const averageSpeed = distance / timeSeconds * 3.6 * 0.621371; // mph
        
        // Calculate final position
        let finalPosition = 1;
        if (this.traffic && this.traffic.motorcycles) {
            const playerZ = this.vehicle.position.z;
            this.traffic.motorcycles.forEach(bike => {
                if (bike.bikeGroup && bike.bikeGroup.position.z > playerZ) {
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

        // Create finish banner
        const finishBanner = document.createElement('div');
        finishBanner.id = 'finishBanner';
        finishBanner.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            overflow-y: auto;
            display: flex;
            align-items: flex-start;
            justify-content: center;
            padding: 20px 0;
            box-sizing: border-box;
            z-index: 1000;
            animation: fadeIn 0.5s ease-out;
        `;
        const finishPanel = document.createElement('div');
        finishPanel.style.cssText = `
            background: linear-gradient(135deg, #2c3e50, #34495e);
            border: 3px solid #f39c12;
            border-radius: 20px;
            padding: 30px;
            text-align: center;
            color: white;
            font-family: Arial, sans-serif;
            box-shadow: 0 0 30px rgba(0,0,0,0.8);
            margin: auto;
            max-width: 90%;
        `;

        const positionColor = finalPosition === 1 ? '#FFD700' : finalPosition === 2 ? '#C0C0C0' : finalPosition === 3 ? '#CD7F32' : '#95a5a6';

        // Check if this is the last leg
        const isLastLeg = this.tourSystem.isLastLeg();
        const titleText = isLastLeg ? 'TOUR COMPLETE!' : 'LEG COMPLETE!';

        // Check for best time
        let bestTimeMessage = '';
        if (timeSeconds < this.bestTime) {
            this.bestTime = timeSeconds;
            localStorage.setItem('motorcycleBestTime', timeSeconds.toString());
            bestTimeMessage = '<div style="color: #FFD700; font-size: 22px; margin-top: 10px;">🏆 NEW BEST TIME! 🏆</div>';
        }

        finishPanel.innerHTML = `
            <h1 style="color: #f39c12; margin: 0 0 20px 0; font-size: 48px; text-shadow: 2px 2px 4px rgba(0,0,0,0.5);">
                ${titleText}
            </h1>
            <div style="font-size: 48px; font-weight: bold; margin-bottom: 20px; color: ${positionColor}; text-shadow: 0 0 20px ${positionColor};">
                ${finalPosition}${positionSuffix} PLACE
                <div style="font-size: 20px; color: #95a5a6; margin-top: 5px;">out of ${totalRacers} racers</div>
            </div>
            <div style="font-size: 24px; margin-bottom: 20px;">
                <div style="margin-bottom: 10px;">Distance: <span style="color: #3498db;">${distance.toFixed(0)} meters</span></div>
                <div style="margin-bottom: 10px;">Time: <span style="color: #e74c3c;">${timeSeconds.toFixed(1)} seconds</span></div>
                ${bestTimeMessage}
                <div style="margin-bottom: 10px;">Best Time: <span style="color: #2ecc71;">${this.bestTime < 999999 ? this.bestTime.toFixed(1) + 's' : 'N/A'}</span></div>
                <div style="margin-bottom: 10px;">Average Speed: <span style="color: #9b59b6;">${averageSpeed.toFixed(1)} mph</span></div>
            </div>
            <div style="font-size: 36px; font-weight: bold; color: #f39c12; margin-bottom: 20px;">
                SCORE: ${totalScore.toLocaleString()}
            </div>
            <div style="margin-top: 20px; display: flex; gap: 20px; justify-content: center;">
                ${isLastLeg ? `
                    <button id="restartTourBtn" style="
                        font-size: 20px;
                        padding: 15px 30px;
                        background: linear-gradient(135deg, #2ecc71, #27ae60);
                        color: white;
                        border: none;
                        border-radius: 10px;
                        cursor: pointer;
                        font-weight: bold;
                        box-shadow: 0 4px 15px rgba(46, 204, 113, 0.4);
                        transition: all 0.3s;
                    "><u>R</u>ESTART TOUR</button>
                ` : `
                    <button id="nextLegBtn" style="
                        font-size: 20px;
                        padding: 15px 30px;
                        background: linear-gradient(135deg, #2ecc71, #27ae60);
                        color: white;
                        border: none;
                        border-radius: 10px;
                        cursor: pointer;
                        font-weight: bold;
                        box-shadow: 0 4px 15px rgba(46, 204, 113, 0.4);
                        transition: all 0.3s;
                    "><u>N</u>EXT LEG →</button>
                `}
                <button id="restartLegBtn" style="
                    font-size: 20px;
                    padding: 15px 30px;
                    background: linear-gradient(135deg, #3498db, #2980b9);
                    color: white;
                    border: none;
                    border-radius: 10px;
                    cursor: pointer;
                    font-weight: bold;
                    box-shadow: 0 4px 15px rgba(52, 152, 219, 0.4);
                    transition: all 0.3s;
                "><u>R</u>ESTART LEG</button>
                <button id="returnToMenuBtn" style="
                    font-size: 20px;
                    padding: 15px 30px;
                    background: linear-gradient(135deg, #e74c3c, #c0392b);
                    color: white;
                    border: none;
                    border-radius: 10px;
                    cursor: pointer;
                    font-weight: bold;
                    box-shadow: 0 4px 15px rgba(231, 76, 60, 0.4);
                    transition: all 0.3s;
                ">RETURN TO <u>M</u>ENU</button>
            </div>
        `;

        // Add CSS animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes fadeIn {
                from { opacity: 0; transform: scale(0.8); }
                to { opacity: 1; transform: scale(1); }
            }
        `;
        document.head.appendChild(style);

        finishBanner.appendChild(finishPanel);
        document.body.appendChild(finishBanner);

        // Enable R key for restart
        if (this.input) {
            this.input.setMenuActive(true);
        }

        // Store whether leaderboard is active for later
        const shouldShowLeaderboard = this.leaderboardService && this.leaderboardService.isActive();

        // Add event listeners to buttons
        document.getElementById('restartLegBtn').addEventListener('click', () => {
            finishBanner.remove();
            // Disable R key when menu is closed
            if (this.input) {
                this.input.setMenuActive(false);
            }

            // Cancel leaderboard session if active (restarting without submitting)
            if (shouldShowLeaderboard) {
                this.leaderboardService.cancelSession();
            }

            // Trigger reset via input system
            if (this.input) {
                // Simulate reset action
                this.vehicle.reset();
                if (this.environment.roadPath && this.environment.roadPath.length > 0) {
                    const startPos = this.tourSystem.getStartingPosition(this.environment.roadPath);
                    this.vehicle.position.x = startPos.x;
                    this.vehicle.position.y = startPos.y;
                    this.vehicle.position.z = startPos.z;
                    this.vehicle.yawAngle = startPos.heading;
                }
                this.cones.reset();
                this.finished = false;
                this.startTime = performance.now();
                this.score = 0;
                this.combo = 0;
                this.comboMultiplier = 1;
                this.checkpointsPassed = 0;
                this.lastCheckpointIndex = -1;
                this.checkpointTimes = [];
                if (this.environment && this.environment.checkpoints) {
                    this.environment.checkpoints.forEach(cp => cp.passed = false);
                }
                this.updateScoreDisplay();
            }
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
                    finishBanner.remove();

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
                    finishBanner.remove();

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

    showCrashNotification() {
        // Create crash notification
        const crashNotification = document.createElement('div');
        crashNotification.id = 'crashNotification';
        crashNotification.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            overflow-y: auto;
            display: flex;
            align-items: flex-start;
            justify-content: center;
            padding: 20px 0;
            box-sizing: border-box;
            z-index: 9999;
            animation: fadeIn 0.5s ease-out;
        `;
        const crashPanel = document.createElement('div');
        crashPanel.style.cssText = `
            background: linear-gradient(135deg, #2c1515, #3e1515);
            border: 3px solid #e74c3c;
            border-radius: 20px;
            padding: 40px;
            text-align: center;
            color: white;
            font-family: Arial, sans-serif;
            box-shadow: 0 10px 40px rgba(231, 76, 60, 0.6);
            min-width: 400px;
            max-width: 90%;
            margin: auto;
        `;

        crashPanel.innerHTML = `
            <div style="font-size: 72px; font-weight: bold; color: #e74c3c; margin-bottom: 20px; text-shadow: 0 0 20px rgba(231, 76, 60, 0.8);">
                CRASHED!
            </div>
            <div style="font-size: 24px; color: #95a5a6; margin-bottom: 30px;">
                Better luck next time!
            </div>
            <div style="margin-top: 30px; display: flex; gap: 20px; justify-content: center;">
                <button id="restartCrashBtn" style="
                    font-size: 20px;
                    padding: 15px 30px;
                    background: linear-gradient(135deg, #3498db, #2980b9);
                    color: white;
                    border: none;
                    border-radius: 10px;
                    cursor: pointer;
                    font-weight: bold;
                    box-shadow: 0 4px 15px rgba(52, 152, 219, 0.4);
                    transition: all 0.3s;
                "><u>R</u>ESTART</button>
                <button id="menuCrashBtn" style="
                    font-size: 20px;
                    padding: 15px 30px;
                    background: linear-gradient(135deg, #e74c3c, #c0392b);
                    color: white;
                    border: none;
                    border-radius: 10px;
                    cursor: pointer;
                    font-weight: bold;
                    box-shadow: 0 4px 15px rgba(231, 76, 60, 0.4);
                    transition: all 0.3s;
                "><u>M</u>ENU</button>
            </div>
        `;

        crashNotification.appendChild(crashPanel);
        document.body.appendChild(crashNotification);

        // Enable R key for restart
        if (this.input) {
            this.input.setMenuActive(true);
        }

        // Add event listeners to buttons
        document.getElementById('restartCrashBtn').addEventListener('click', () => {
            crashNotification.remove();
            // Disable R key when menu is closed
            if (this.input) {
                this.input.setMenuActive(false);
            }
            // Reset the vehicle
            this.vehicle.reset();
            if (this.environment.roadPath && this.environment.roadPath.length > 0) {
                const startPos = this.tourSystem.getStartingPosition(this.environment.roadPath);
                this.vehicle.position.x = startPos.x;
                this.vehicle.position.y = startPos.y;
                this.vehicle.position.z = startPos.z;
                this.vehicle.yawAngle = startPos.heading;
            }
            this.cones.reset();
            this.finished = false;
            this.startTime = performance.now();
            this.score = 0;
            this.combo = 0;
            this.comboMultiplier = 1;
            this.checkpointsPassed = 0;
            this.lastCheckpointIndex = -1;
            this.checkpointTimes = [];
            if (this.environment && this.environment.checkpoints) {
                this.environment.checkpoints.forEach(cp => cp.passed = false);
            }
            this.updateScoreDisplay();
        });

        document.getElementById('menuCrashBtn').addEventListener('click', () => {
            // Disable R key when menu is closed
            if (this.input) {
                this.input.setMenuActive(false);
            }
            this.returnToMenu();
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

        // Reset to entry form
        entryForm.style.display = 'block';
        resultDiv.style.display = 'none';
        errorDiv.style.display = 'none';
        nameInput.value = '';
        submitBtn.disabled = true;

        // Show overlay
        overlay.classList.add('active');

        // Focus input
        setTimeout(() => nameInput.focus(), 100);

        // Enable/disable submit button based on input
        const inputHandler = () => {
            submitBtn.disabled = nameInput.value.length !== 4;
        };
        nameInput.addEventListener('input', inputHandler);

        // Handle submit
        const submitHandler = () => {
            const playerName = nameInput.value.toUpperCase();
            if (playerName.length === 4) {
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
            if (e.key === 'Enter' && nameInput.value.length === 4) {
                submitHandler();
            }
        };
        nameInput.addEventListener('keypress', keyHandler);

        submitBtn.addEventListener('click', submitHandler);

        // Handle cancel
        const cancelHandler = () => {
            this.leaderboardService.cancelSession();
            overlay.classList.remove('active');
            nameInput.disabled = false;
            submitBtn.disabled = false;
            cancelBtn.disabled = false;

            // Clean up event listeners
            nameInput.removeEventListener('input', inputHandler);
            nameInput.removeEventListener('keypress', keyHandler);
            submitBtn.removeEventListener('click', submitHandler);
            cancelBtn.removeEventListener('click', cancelHandler);

            // Call completion callback
            if (onComplete) onComplete();
        };
        cancelBtn.addEventListener('click', cancelHandler);

        // Handle close after successful submission
        const closeHandler = () => {
            overlay.classList.remove('active');
            nameInput.disabled = false;
            submitBtn.disabled = false;
            cancelBtn.disabled = false;

            // Clean up event listeners
            nameInput.removeEventListener('input', inputHandler);
            nameInput.removeEventListener('keypress', keyHandler);
            submitBtn.removeEventListener('click', submitHandler);
            cancelBtn.removeEventListener('click', cancelHandler);
            closeBtn.removeEventListener('click', closeHandler);

            // Call completion callback
            if (onComplete) onComplete();
        };
        closeBtn.addEventListener('click', closeHandler);

        // Handle error close
        const errorCloseHandler = () => {
            overlay.classList.remove('active');
            nameInput.disabled = false;
            submitBtn.disabled = false;
            cancelBtn.disabled = false;

            // Clean up event listeners
            nameInput.removeEventListener('input', inputHandler);
            nameInput.removeEventListener('keypress', keyHandler);
            submitBtn.removeEventListener('click', submitHandler);
            cancelBtn.removeEventListener('click', cancelHandler);
            errorCloseBtn.removeEventListener('click', errorCloseHandler);

            // Call completion callback
            if (onComplete) onComplete();
        };
        errorCloseBtn.addEventListener('click', errorCloseHandler);
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
        if (!this.traffic || !this.traffic.motorcycles || !this.vehicle || !this.environment || !this.environment.roadPath) return;
        
        const playerSegment = Math.floor(this.vehicle.currentRoadSegment || 0);
        const playerProgress = this.vehicle.segmentProgress || 0;
        const totalSegments = this.environment.roadPath.length;
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
        
        const positionElement = document.getElementById('position');
        const suffix = position === 1 ? 'st' : position === 2 ? 'nd' : position === 3 ? 'rd' : 'th';
        
        if (positionElement) {
            positionElement.textContent = position;
        }
        const suffixElement = document.querySelector('.position-suffix');
        if (suffixElement) {
            suffixElement.textContent = suffix;
        }
        
        const totalElement = document.getElementById('totalRacers');
        if (totalElement) {
            totalElement.textContent = this.traffic.motorcycles.length + 1;
        }
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());

        // FPS calculation
        this.frameCount++;
        const now = performance.now();
        if (now - this.lastTime >= 1000) {
            this.fps = this.frameCount;
            this.frameCount = 0;
            this.lastTime = now;
            document.getElementById('fps').textContent = `FPS: ${this.fps}`;
        }

        // Get actual frame time and accumulate for fixed timestep
        const rawDeltaTime = Math.min(this.clock.getDelta(), 0.05); // Cap at 50ms
        this.accumulatedTime += rawDeltaTime;
        this.accumulatedTime = Math.min(this.accumulatedTime, this.maxAccumulatedTime); // Prevent spiral of death

        // Check for pause toggle
        if (this.input.checkPause()) {
            this.paused = !this.paused;
            if (this.paused) {
                this.soundManager.stopEngineSound();
            }
        }

        // Skip all game logic if paused, but continue rendering
        if (this.paused) {
            this.renderer.render(this.scene, this.camera);
            return;
        }

        const steeringInput = this.input.getSteeringInput();
        const throttleInput = this.input.getThrottleInput();
        const brakeInput = this.input.getBrakeInput();
        const wheelieInput = this.input.getWheelieInput();

        // Run physics in fixed timesteps - ensures consistent movement
        // regardless of variable frame timing
        while (this.accumulatedTime >= this.fixedTimeStep) {
            const deltaTime = this.fixedTimeStep; // Always 16.67ms

            this.updateRacePosition();
        
        // Check for menu return
        if (this.input.checkMenuReturn()) {
            // Remove finish banner if it exists
            const finishBanner = document.getElementById('finishBanner');
            if (finishBanner) {
                finishBanner.remove();
            }

            // Remove crash notification if it exists
            const crashNotification = document.getElementById('crashNotification');
            if (crashNotification) {
                crashNotification.remove();
            }

            // Disable menu keys when menu is closed
            if (this.input) {
                this.input.setMenuActive(false);
            }

            this.returnToMenu();
        }

        // Check for reset
        if (this.input.checkReset()) {
            // Remove finish banner if it exists
            const finishBanner = document.getElementById('finishBanner');
            if (finishBanner) {
                finishBanner.remove();
            }

            // Remove crash notification if it exists
            const crashNotification = document.getElementById('crashNotification');
            if (crashNotification) {
                crashNotification.remove();
            }

            // Disable R key when menu is closed
            if (this.input) {
                this.input.setMenuActive(false);
            }

            // High score is updated when finishing the course, not on reset

            this.vehicle.reset();
            if (this.environment.roadPath && this.environment.roadPath.length > 0) {
                // Reset to the leg's starting position (not always segment 0)
                const startPos = this.tourSystem.getStartingPosition(this.environment.roadPath);
                this.vehicle.position.x = startPos.x;
                this.vehicle.position.y = startPos.y;
                this.vehicle.position.z = startPos.z;
                this.vehicle.yawAngle = startPos.heading;
            }
            this.cones.reset();
            this.finished = false;
            this.startTime = performance.now();

            // Reset scoring
            this.score = 0;
            this.combo = 0;
            this.comboMultiplier = 1;
            this.checkpointsPassed = 0;
            this.lastCheckpointIndex = -1;
            this.checkpointTimes = []; // Reset checkpoint times

            // Reset checkpoints
            if (this.environment && this.environment.checkpoints) {
                this.environment.checkpoints.forEach(cp => cp.passed = false);
            }

            // Reset UI
            this.updateScoreDisplay();

            // Show dashboard again
            const dashboard = document.querySelector('.dashboard');
            if (dashboard) {
                dashboard.style.opacity = '1';
            }
        }

        // Check for next leg (N key)
        if (this.input.checkNextLeg()) {
            // Remove finish banner if it exists
            const finishBanner = document.getElementById('finishBanner');
            if (finishBanner) {
                finishBanner.remove();
            }

            // Disable N key when menu is closed
            if (this.input) {
                this.input.setMenuActive(false);
            }

            this.startNextLeg();
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
            console.log(`Camera mode: ${this.cameraModes[this.cameraMode].name}`);
            
            // Show notification
            const notification = document.createElement('div');
            notification.className = 'notification';
            notification.textContent = `Camera: ${this.cameraModes[this.cameraMode].name}`;
            notification.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(0, 0, 0, 0.7);
                color: white;
                padding: 10px 20px;
                border-radius: 5px;
                font-size: 20px;
                z-index: 1000;
                animation: fadeInOut 1s ease-out;
            `;
            document.body.appendChild(notification);
            setTimeout(() => notification.remove(), 1000);
        }
        
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
            if (this.checkpointsPassed >= 3) { // Show after passing 3 checkpoints (over halfway)
                this.showWheelieHelpNotification();
                this.hasShownWheelieHelp = true;
            }
        }

        // Update engine sound based on speed
        if (!this.vehicle.crashed && !this.finished) {
            const speedRatio = this.vehicle.speed / this.vehicle.maxSpeed;
            this.soundManager.playEngineSound(speedRatio);
        } else {
            this.soundManager.stopEngineSound();
        }

        // Check for checkpoint passes and jump scoring
        if (!this.vehicle.crashed && !this.finished) {
            this.checkCheckpoints();
            this.checkJumpScoring();
            this.checkSpeedStreak(deltaTime);
            this.checkNearMisses();
        }

        // Check for finish line crossing
        if (!this.finished && !this.vehicle.crashed && this.environment.finishLinePosition) {
            const distanceToFinish = this.vehicle.position.distanceTo(this.environment.finishLinePosition);
            if (distanceToFinish < 5) { // Within 5 units of finish line
                this.finished = true;
                this.vehicle.finished = true; // Prevent crashes after finishing
                this.finishTime = performance.now() - this.startTime;
                this.showFinishScreen();
            }
        }

        // Check if vehicle is in roadworks zone
        let inRoadworksZone = false;
        if (this.environment.roadworksZones) {
            let currentSegment = 0;
            if (this.vehicle.currentRoadSegment < this.environment.roadPath.length) {
                currentSegment = this.vehicle.currentRoadSegment;
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
            const collision = this.traffic.update(deltaTime, this.vehicle.position);
            if (collision && collision.hit && !this.vehicle.crashed && !inRoadworksZone) {
                this.vehicle.crashed = true;
                this.vehicle.crashAngle = this.vehicle.leanAngle || 0.5;
                this.vehicle.frame.material.color.setHex(0xff00ff);
                this.showCollisionWarning();
                
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
        
        // Check cone collisions
        if (!this.vehicle.crashed) {
            this.cones.checkCollision(this.vehicle.position);
        }
        
        this.updateCamera();
        this.updateUI();

        // Update particle system and spawn particles based on vehicle state
        // Update weather system
        if (this.weatherSystem && !this.vehicle.crashed) {
            this.weatherSystem.update(deltaTime, this.vehicle.position);
        }

        if (this.particles && !this.vehicle.crashed) {
            this.particles.update(deltaTime);

            // Track brake duration
            if (brakeInput > 0.3) {
                this.brakeHeldTime += deltaTime;
            } else {
                this.brakeHeldTime = 0;
            }

            // Tire smoke on braking/drifting - only after holding brake for 0.4 seconds
            if (brakeInput > 0.3 && this.vehicle.speed > 30 && this.brakeHeldTime > 0.4) {
                const smokeIntensity = brakeInput * Math.min(this.vehicle.speed / 50, 1.0);
                // Spawn from rear wheel position
                const rearWheelPos = this.vehicle.position.clone();
                rearWheelPos.z -= 0.7; // Rear wheel offset
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

            // Consume fixed timestep from accumulated time
            this.accumulatedTime -= this.fixedTimeStep;
        } // End of fixed timestep physics loop

        // RENDERING: Everything below runs once per frame, not per physics step

        // Update directional light to follow vehicle
        this.directionalLight.position.x = this.vehicle.position.x + 50;
        this.directionalLight.position.z = this.vehicle.position.z;
        this.directionalLight.target.position.copy(this.vehicle.position);
        this.directionalLight.target.updateMatrixWorld();

        // Subtle intensity variation for natural lighting
        const time = performance.now() * 0.001;
        this.directionalLight.intensity = 0.8 + Math.sin(time * 0.1) * 0.05;

        // Update headlights
        const headlightOffset = new THREE.Vector3(0, 0.5, 0.7);
        headlightOffset.applyEuler(new THREE.Euler(0, this.vehicle.yawAngle, 0));

        this.leftHeadlight.position.copy(this.vehicle.position).add(new THREE.Vector3(-0.3, 0, 0).applyEuler(new THREE.Euler(0, this.vehicle.yawAngle, 0))).add(headlightOffset);
        this.rightHeadlight.position.copy(this.vehicle.position).add(new THREE.Vector3(0.3, 0, 0).applyEuler(new THREE.Euler(0, this.vehicle.yawAngle, 0))).add(headlightOffset);

        const targetOffset = new THREE.Vector3(0, 0, 50);
        targetOffset.applyEuler(new THREE.Euler(0, this.vehicle.yawAngle, 0));

        this.leftHeadlight.target.position.copy(this.vehicle.position).add(targetOffset);
        this.rightHeadlight.target.position.copy(this.vehicle.position).add(targetOffset);

        this.leftHeadlight.target.updateMatrixWorld();
        this.rightHeadlight.target.updateMatrixWorld();

        // Update rim light to follow behind vehicle
        this.rimLight.position.set(this.vehicle.position.x, 10, this.vehicle.position.z - 50);

        this.renderer.render(this.scene, this.camera);
    }

    checkCheckpoints() {
        if (!this.environment || !this.environment.checkpoints) return;
        
        for (let checkpoint of this.environment.checkpoints) {
            if (!checkpoint.passed) {
                const dx = this.vehicle.position.x - checkpoint.position.x;
                const dz = this.vehicle.position.z - checkpoint.position.z;
                const distance = Math.sqrt(dx * dx + dz * dz);
                
                // Check if within checkpoint gate (16 units wide)
                if (distance < checkpoint.width) {
                    // Check if this is the next expected checkpoint (in order)
                    const totalCheckpoints = this.environment.checkpoints.length;
                    if (checkpoint.index === this.lastCheckpointIndex + 1 ||
                        (this.lastCheckpointIndex === totalCheckpoints - 1 && checkpoint.index === 0)) {
                        
                        checkpoint.passed = true;
                        this.lastCheckpointIndex = checkpoint.index;
                        this.checkpointsPassed++;

                        // Store checkpoint position for restart
                        this.lastCheckpointPosition = checkpoint.position.clone();
                        this.lastCheckpointHeading = checkpoint.heading;
                        console.log(`Checkpoint ${checkpoint.index + 1} stored for restart at position: ${checkpoint.position.x.toFixed(1)}, ${checkpoint.position.z.toFixed(1)}`);

                        // Record checkpoint pass time
                        const currentTime = performance.now() - this.startTime;
                        this.checkpointTimes[checkpoint.index] = currentTime;

                        // Record in leaderboard service
                        if (this.leaderboardService && this.leaderboardService.isActive()) {
                            this.leaderboardService.recordCheckpoint(checkpoint.index, currentTime)
                                .catch(error => console.error('Failed to record checkpoint:', error));
                        }

                        // Calculate speed-based points
                        let sectionTime = 0;
                        let basePoints = 100; // Base points per checkpoint

                        if (checkpoint.index > 0 && this.checkpointTimes[checkpoint.index - 1]) {
                            // Calculate time for this section
                            sectionTime = (currentTime - this.checkpointTimes[checkpoint.index - 1]) / 1000; // Convert to seconds

                            // Calculate actual distance between checkpoints
                            const prevCheckpoint = this.environment.checkpoints[checkpoint.index - 1];
                            const distance = checkpoint.position.distanceTo(prevCheckpoint.position);
                            const averageSpeed = distance / sectionTime; // m/s
                            const speedKmh = averageSpeed * 3.6; // km/h

                            // Award points based on speed (faster = more points)
                            // Base speed threshold: 60 km/h gives base points, faster gives bonus
                            const speedBonus = Math.max(0, speedKmh - 60) * 1.5; // 1.5 points per km/h over 60
                            basePoints += Math.floor(speedBonus);
                        } else if (checkpoint.index === 0) {
                            // First checkpoint gets base points
                            basePoints = 100;
                        }

                        // Apply combo multiplier
                        const points = basePoints * this.comboMultiplier;
                        this.addScore(points);
                        
                        // Increase combo
                        this.combo++;
                        if (this.combo >= 3) {
                            this.comboMultiplier = Math.min(this.combo / 2, 5); // Max 5x multiplier
                        }
                        
                        // Show checkpoint notification
                        this.showCheckpointNotification(checkpoint.index + 1, points);

                        // Play checkpoint sound
                        this.soundManager.playCheckpointSound();

                        // Log speed info for first checkpoint or sections
                        if (checkpoint.index === 0) {
                            console.log(`Checkpoint ${checkpoint.index + 1} passed! +${points} points`);
                        } else {
                            const prevCheckpoint = this.environment.checkpoints[checkpoint.index - 1];
                            const dist = checkpoint.position.distanceTo(prevCheckpoint.position);
                            const speedKmh = ((dist / sectionTime) * 3.6).toFixed(1);
                            console.log(`Checkpoint ${checkpoint.index + 1} passed! +${points} points (${speedKmh} km/h)`);
                        }
                    }
                }
            }
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
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 40%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(255, 140, 0, 0.9);
            color: white;
            padding: 20px 40px;
            border-radius: 10px;
            font-size: 28px;
            font-weight: bold;
            z-index: 500;
            animation: speedPulse 1s ease-out;
        `;
        notification.textContent = 'SPEED STREAK! +250';
        document.body.appendChild(notification);
        
        setTimeout(() => notification.remove(), 1000);
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
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 35%;
            right: 50px;
            background: rgba(255, 215, 0, 0.9);
            color: black;
            padding: 15px 30px;
            border-radius: 8px;
            font-size: 24px;
            font-weight: bold;
            z-index: 500;
            animation: slideInRight 0.3s ease-out;
        `;
        notification.textContent = 'NEAR MISS! +100';
        document.body.appendChild(notification);
        
        setTimeout(() => notification.remove(), 800);
    }
    
    showCollisionWarning() {
        const warning = document.createElement('div');
        warning.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(255, 0, 0, 0.9);
            color: white;
            padding: 30px 50px;
            border-radius: 15px;
            font-size: 36px;
            font-weight: bold;
            z-index: 600;
            border: 4px solid white;
            animation: shake 0.5s ease-out;
        `;
        warning.textContent = 'COLLISION!';
        document.body.appendChild(warning);
        
        setTimeout(() => warning.remove(), 1500);
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
                const jumpRotation = Math.abs(this.vehicle.jumpRotation);
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
        this.score += Math.round(points);
        this.updateScoreDisplay();
        
        // Update high score if needed
        if (this.score > this.highScore) {
            this.highScore = this.score;
            localStorage.setItem('motorcycleHighScore', this.highScore.toString());
        }
    }
    
    updateScoreDisplay() {
        document.getElementById('score').textContent = this.score.toLocaleString();

        if (this.combo > 0) {
            const comboDisplay = document.getElementById('comboDisplay');
            comboDisplay.textContent = `COMBO x${this.combo}`;
            comboDisplay.style.animation = 'none';
            setTimeout(() => { comboDisplay.style.animation = 'pulse-combo 0.5s ease-in-out'; }, 10);
        }
    }
    
    showCheckpointNotification(checkpointNum, points) {
        const notification = document.createElement('div');
        notification.className = 'checkpoint-notification';
        const totalCheckpoints = this.environment && this.environment.checkpoints ? this.environment.checkpoints.length : 10;
        notification.textContent = `CHECKPOINT ${checkpointNum}/${totalCheckpoints}! +${points}`;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 1000);
    }
    
    showJumpBonus(text) {
        const notification = document.createElement('div');
        notification.className = 'checkpoint-notification';
        notification.style.color = '#FF69B4';
        notification.textContent = text;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 1000);
    }

    showWheelieHelpNotification() {
        const notification = document.createElement('div');
        notification.className = 'checkpoint-notification';
        notification.style.color = '#FFD700';
        notification.textContent = 'Press SPACE to pop clutch for a wheelie!';
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 3000); // Longer duration for help text
    }

    showConeHitNotification(points) {
        const notification = document.createElement('div');
        notification.className = 'checkpoint-notification';
        notification.style.color = '#FFA500'; // Orange color for cones
        notification.textContent = `CONE HIT! +${points}`;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 1000);
    }
    
    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
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
    playEngineSound(speed = 0) {
        if (!this.enabled || !this.audioContext) return;

        // Resume audio context if suspended (required by Web Audio API)
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        // Stop previous engine sound
        if (this.engineSound) {
            this.engineSound.stop();
        }

        const baseFreq = 80 + (speed * 40); // 80-120 Hz based on speed
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        const filter = this.audioContext.createBiquadFilter();

        oscillator.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        oscillator.frequency.setValueAtTime(baseFreq, this.audioContext.currentTime);
        oscillator.type = 'sawtooth';

        // Add some harmonics
        const harmonicOsc = this.audioContext.createOscillator();
        const harmonicGain = this.audioContext.createGain();
        harmonicOsc.connect(harmonicGain);
        harmonicGain.connect(gainNode);

        harmonicOsc.frequency.setValueAtTime(baseFreq * 2, this.audioContext.currentTime);
        harmonicOsc.type = 'square';

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(200 + speed * 100, this.audioContext.currentTime);

        gainNode.gain.setValueAtTime(this.masterVolume * 0.2, this.audioContext.currentTime);

        oscillator.start();
        harmonicOsc.start();

        this.engineSound = {
            oscillator: oscillator,
            harmonicOsc: harmonicOsc,
            gainNode: gainNode,
            stop: () => {
                try {
                    oscillator.stop();
                    harmonicOsc.stop();
                } catch (e) {}
            }
        };
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
        const notification = document.createElement('div');
        notification.className = 'checkpoint-notification';
        notification.style.color = enabled ? '#00ff00' : '#ff0000';
        notification.textContent = `SOUND ${enabled ? 'ON' : 'OFF'}`;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 1000);
    }

    restartFromCheckpoint() {
        if (!this.lastCheckpointPosition) {
            console.log('No checkpoint position available for restart');
            return;
        }

        console.log('Restarting from checkpoint at:', this.lastCheckpointPosition.x.toFixed(1), this.lastCheckpointPosition.z.toFixed(1));

        // Apply penalty - lose some score
        const penalty = 500;
        this.addScore(-penalty);

        // Reset vehicle to checkpoint position
        this.vehicle.position.copy(this.lastCheckpointPosition);
        this.vehicle.yawAngle = this.lastCheckpointHeading;
        this.vehicle.speed = 15; // Reset to moderate speed
        this.vehicle.leanAngle = 0;
        this.vehicle.leanVelocity = 0;
        this.vehicle.crashed = false;
        this.vehicle.isJumping = false;
        this.vehicle.isWheelie = false;
        this.vehicle.wheelieAngle = 0;
        this.vehicle.wheelieVelocity = 0;
        this.vehicle.jumpRotation = 0;
        this.vehicle.jumpVelocityY = 0;

        // Reset start time for timing
        this.startTime = performance.now();

         // Reset cones
         this.cones.reset();

        // Show notification
        const notification = document.createElement('div');
        notification.className = 'checkpoint-notification';
        notification.style.color = '#ff6600';
        notification.textContent = `RESTARTED FROM CHECKPOINT (-${penalty} points)`;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 2000);

        console.log('Restarted from checkpoint with penalty');
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