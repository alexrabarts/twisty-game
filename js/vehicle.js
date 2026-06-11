// Playable characters. Each entry defines the rider, their bike model variant
// (built by Vehicle.createMesh) and stat multipliers applied to the baseline
// Vehicle physics. stats are the 1-5 star ratings shown in the selection UI;
// physics are the multipliers actually applied to the handling model.
const CHARACTERS = [
    {
        id: 'steve',
        name: 'Steve',
        bikeLabel: 'Super Sports',
        bikeColor: '0xcc1111', // Red race plastics
        stats: { speed: 5, accel: 4, handling: 3, jump: 2 },
        physics: {
            maxSpeed: 1.10,        // 74.8 m/s top end
            acceleration: 1.10,    // 16.5 m/s²
            brakeForce: 1.05,      // 21 m/s²
            steeringForce: 1.0,    // 9.5 baseline
            jumpPower: 0.85,       // Stiff suspension, low clearance
            wheeliePop: 1.3,       // Power wheelies come easily
            wheelieThrottle: 1.15
        }
    },
    {
        id: 'alex',
        name: 'Alex',
        bikeLabel: 'Adventure',
        bikeColor: '0xc9a227', // Sandy gold
        stats: { speed: 3, accel: 3, handling: 4, jump: 4 },
        physics: {
            maxSpeed: 1.0,         // 68 m/s
            acceleration: 1.0,     // 15 m/s²
            brakeForce: 1.05,      // 21 m/s²
            steeringForce: 1.1,    // 10.45 - wide bars
            jumpPower: 1.25,       // Long-travel suspension
            wheeliePop: 1.0,
            wheelieThrottle: 1.0
        }
    },
    {
        id: 'tim',
        name: 'Tim',
        bikeLabel: 'Maxi Scooter',
        bikeColor: '0x8d96a8', // Executive silver-grey
        stats: { speed: 2, accel: 2, handling: 4, jump: 1 },
        physics: {
            maxSpeed: 0.75,        // 51 m/s
            acceleration: 0.8,     // 12 m/s² - smooth CVT
            brakeForce: 1.0,       // 20 m/s²
            steeringForce: 1.1,    // 10.45 - nimble at low speed
            jumpPower: 0.6,        // Terrible jumper
            wheeliePop: 0.75,
            wheelieThrottle: 0.9
        }
    },
    {
        id: 'shane',
        name: 'Shane',
        bikeLabel: 'Dirt Bike',
        bikeColor: '0xf07818', // Motocross orange
        stats: { speed: 2, accel: 4, handling: 5, jump: 5 },
        physics: {
            maxSpeed: 0.85,        // 57.8 m/s
            acceleration: 1.1,     // 16.5 m/s²
            brakeForce: 1.0,       // 20 m/s²
            steeringForce: 1.15,   // 10.93 - flickable
            jumpPower: 1.5,        // Built for air
            wheeliePop: 1.2,
            wheelieThrottle: 1.1
        }
    }
];

class Vehicle {
    constructor(scene, onWheelieScore = null, character = null) {
        this.scene = scene;
        this.onWheelieScore = onWheelieScore;

        // Character selection drives the bike model variant and stat
        // multipliers. Default to Steve so existing callers keep the
        // original sport bike behaviour.
        this.character = character || CHARACTERS[0];
        
        // Physical properties
        this.position = new THREE.Vector3(0, 0, 0); // Will be adjusted to road height after environment loads
        this.velocity = new THREE.Vector3(0, 0, 0);
        
        // Vehicle parameters
        this.speed = 20; // m/s (starts at ~72 km/h)
        this.minSpeed = 4; // m/s (~14 km/h) - below this, bike falls
        this.maxSpeed = 68; // m/s (~245 km/h) - increased for more thrill
        this.acceleration = 15; // m/s² - snappier acceleration
        this.brakeForce = 20; // m/s² - better braking
        this.wheelbase = 1.4; // metres
        this.cgHeight = 0.6; // centre of gravity height
        this.mass = 200; // kg
        
        // State variables
        this.leanAngle = 0; // radians (positive = right lean)
        this.leanVelocity = 0;
        this.steeringAngle = 0;
        this.yawAngle = 0;
        this.crashed = false;
        this.crashAngle = 0;
        this.previousSpeed = 0;
        this.fallingOffCliff = false;
        this.hitGround = false;
        this.tumbleSpeed = 0;
        this.tumbleAngle = 0;
        this.tumbleRoll = 0;
        this.fallStartY = 0;
        this.groundHitLogged = false;
        this.crashRecoveryTime = 0;
        this.crashPenaltyApplied = false;
        this.finished = false; // Set by game when leg is finished
        
        // Jump state
        this.isJumping = false;
        this.jumpVelocityY = 0;
        this.jumpStartHeight = 0;
        this.jumpRotation = 0;

        // Wheelie state
        this.isWheelie = false;
        this.wheelieAngle = 0;
        this.wheelieVelocity = 0;
        this.wheelieDamping = 0.15; // High damping for challenging wheelies
        this.wheelieStartTime = 0;
        this.wheelieScoreAccumulated = 0;
        
        // Advanced wheelie balance system
        this.wheelieBalance = 0; // -1 to 1, 0 is perfectly balanced

        // Weather system reference
        this.weatherSystem = null;
        this.wheelieOptimalAngle = Math.PI / 6; // 30 degrees - sweet spot
        this.wheelieDangerAngle = Math.PI / 3; // 60 degrees - danger zone
        this.wheelieCrashAngle = Math.PI * 0.45; // 81 degrees - too far!
        this.wheelieLastInputTime = 0;
        this.wheelieCombo = 0; // Combo multiplier for perfect balance
        this.wheeliePerfectFrames = 0; // Count frames in perfect zone
        
        // Distance tracking
        this.distanceTraveled = 0;
        this.lastPosition = new THREE.Vector3(0, 0, 0);

        // Road following tracking
        this.currentRoadSegment = 0; // Index of current road segment we're following
        this.segmentProgress = 0; // Progress along current segment (0-1)

        // Road boundary state tracking for hysteresis
        this.wasNearEdge = false; // Prevents oscillating between edge states
        this.lastPerpDistance = 0; // For hysteresis calculations

         // Physics tuning
        this.steeringForce = 9.5; // How much force steering creates - more responsive
        this.leanDamping = 0.016; // Natural damping - slightly less for more agility
        this.maxLeanAngle = Math.PI / 2.7; // ~67 degrees before crash - slightly more forgiving

        // Apply per-character stat multipliers to the baseline physics
        const charPhysics = this.character.physics || {};
        this.maxSpeed *= charPhysics.maxSpeed || 1;
        this.acceleration *= charPhysics.acceleration || 1;
        this.brakeForce *= charPhysics.brakeForce || 1;
        this.steeringForce *= charPhysics.steeringForce || 1;
        this.jumpPowerMult = charPhysics.jumpPower || 1;
        this.wheeliePopMult = charPhysics.wheeliePop || 1;
        this.wheelieThrottleMult = charPhysics.wheelieThrottle || 1;

        // Bodywork paint colour comes from the character (string form so the
        // existing parseInt(this.bikeColor) call sites keep working)
        this.bikeColor = this.character.bikeColor || '0x1a4db3';
        const baseColorHex = parseInt(this.bikeColor);
        this.baseColorRGB = {
            r: ((baseColorHex >> 16) & 255) / 255,
            g: ((baseColorHex >> 8) & 255) / 255,
            b: (baseColorHex & 255) / 255
        };

        this.createMesh();
    }

    createMesh() {
        this.group = new THREE.Group();

        // Build the bike model variant for the selected character. Every
        // variant satisfies the same contract: rearWheel/frontWheel groups at
        // (0, 0.3, ±0.7), rearDisc/frontDisc, frame (crash/wheelie tint
        // material), fuelTank, brakeLight (emissive), rider (rotation.z
        // animated), handlebar, leftFork/rightFork, ground contact at y=0.
        switch (this.character.id) {
            case 'alex':
                this.buildAdventureBike();
                break;
            case 'tim':
                this.buildScooter();
                break;
            case 'shane':
                this.buildDirtBike();
                break;
            default:
                this.buildSportBike();
                break;
        }

        // Base rider transform for the jump stand-up animation
        this.riderBasePos = this.rider.position.clone();
        this.riderBaseRotX = this.rider.rotation.x || 0;
        this.riderStandFactor = 0;
        // How far this rider rises off the seat: motocross riders stand tall,
        // a scooter rider barely lifts
        this.riderStandHeight =
            this.character.id === 'shane' ? 0.24 :
            this.character.id === 'tim' ? 0.08 : 0.16;

        this.scene.add(this.group);
    }

    buildSportBike() {
        // Rear wheel with racing spokes
        const rearWheelGroup = new THREE.Group();

        // Tire
        const rearTireGeometry = new THREE.CylinderGeometry(0.3, 0.3, 0.15, 20);
        const tireMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a,
            roughness: 0.95,
            metalness: 0.0
        });
        const rearTire = new THREE.Mesh(rearTireGeometry, tireMaterial);
        rearTire.rotation.z = Math.PI / 2;
        rearWheelGroup.add(rearTire);

        // Racing rim - outer ring
        const rearRimOuterGeometry = new THREE.CylinderGeometry(0.18, 0.18, 0.16, 16);
        const rimMaterial = new THREE.MeshStandardMaterial({
            color: 0xb0b0b0,  // Chrome silver
            roughness: 0.2,
            metalness: 0.9
        });
        const rearRimOuter = new THREE.Mesh(rearRimOuterGeometry, rimMaterial);
        rearRimOuter.rotation.z = Math.PI / 2;
        rearWheelGroup.add(rearRimOuter);

        // Hub center
        const rearHubGeometry = new THREE.CylinderGeometry(0.06, 0.06, 0.17, 12);
        const rearHub = new THREE.Mesh(rearHubGeometry, rimMaterial);
        rearHub.rotation.z = Math.PI / 2;
        rearWheelGroup.add(rearHub);

        // Racing spokes - 6 thin spokes
        const rearSpokeGeometry = new THREE.BoxGeometry(0.02, 0.17, 0.12);
        for (let i = 0; i < 6; i++) {
            const spoke = new THREE.Mesh(rearSpokeGeometry, rimMaterial);
            spoke.rotation.z = Math.PI / 2;
            spoke.rotation.y = (i * Math.PI * 2) / 6;
            rearWheelGroup.add(spoke);
        }

        rearWheelGroup.position.set(0, 0.3, -0.7);
        rearWheelGroup.castShadow = true;
        rearWheelGroup.receiveShadow = true;
        this.rearWheel = rearWheelGroup;
        
        // Rear disc brake
        const discGeometry = new THREE.CylinderGeometry(0.25, 0.25, 0.02, 20);
        const discMaterial = new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 0.3, metalness: 0.9 });
        this.rearDisc = new THREE.Mesh(discGeometry, discMaterial);
        this.rearDisc.rotation.z = Math.PI / 2;
        this.rearDisc.position.set(0.09, 0.3, -0.7);
        this.rearDisc.castShadow = true;
        this.rearDisc.receiveShadow = true;
        
        // Rear brake caliper
        const caliperGeometry = new THREE.BoxGeometry(0.06, 0.12, 0.08);
        const caliperMaterial = new THREE.MeshStandardMaterial({ color: 0xcc0000, roughness: 0.5, metalness: 0.3 });
        this.rearCaliper = new THREE.Mesh(caliperGeometry, caliperMaterial);
        this.rearCaliper.position.set(0.12, 0.22, -0.7);
        this.rearCaliper.castShadow = true;

        // Front forks - suspension
        const forkMaterial = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.4, metalness: 0.9 });
        const leftForkGeometry = new THREE.CylinderGeometry(0.025, 0.025, 0.5, 12);
        this.leftFork = new THREE.Mesh(leftForkGeometry, forkMaterial);
        this.leftFork.position.set(-0.1, 0.55, 0.7);
        this.leftFork.castShadow = true;
        this.leftFork.receiveShadow = true;
        
        this.rightFork = new THREE.Mesh(leftForkGeometry, forkMaterial);
        this.rightFork.position.set(0.1, 0.55, 0.7);
        this.rightFork.castShadow = true;
        this.rightFork.receiveShadow = true;

        // Front wheel with racing spokes
        const frontWheelGroup = new THREE.Group();

        // Tire
        const frontTireGeometry = new THREE.CylinderGeometry(0.28, 0.28, 0.12, 20);
        const frontTire = new THREE.Mesh(frontTireGeometry, tireMaterial);
        frontTire.rotation.z = Math.PI / 2;
        frontWheelGroup.add(frontTire);

        // Racing rim - outer ring (slightly smaller for front)
        const frontRimOuterGeometry = new THREE.CylinderGeometry(0.17, 0.17, 0.13, 16);
        const frontRimOuter = new THREE.Mesh(frontRimOuterGeometry, rimMaterial);
        frontRimOuter.rotation.z = Math.PI / 2;
        frontWheelGroup.add(frontRimOuter);

        // Hub center
        const frontHubGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.14, 12);
        const frontHub = new THREE.Mesh(frontHubGeometry, rimMaterial);
        frontHub.rotation.z = Math.PI / 2;
        frontWheelGroup.add(frontHub);

        // Racing spokes - 6 thin spokes
        const frontSpokeGeometry = new THREE.BoxGeometry(0.02, 0.14, 0.12);
        for (let i = 0; i < 6; i++) {
            const spoke = new THREE.Mesh(frontSpokeGeometry, rimMaterial);
            spoke.rotation.z = Math.PI / 2;
            spoke.rotation.y = (i * Math.PI * 2) / 6;
            frontWheelGroup.add(spoke);
        }

        frontWheelGroup.position.set(0, 0.3, 0.7);
        frontWheelGroup.castShadow = true;
        frontWheelGroup.receiveShadow = true;
        this.frontWheel = frontWheelGroup;
        
        // Front disc brake
        this.frontDisc = new THREE.Mesh(discGeometry, discMaterial);
        this.frontDisc.rotation.z = Math.PI / 2;
        this.frontDisc.position.set(0.09, 0.3, 0.7);
        this.frontDisc.castShadow = true;
        this.frontDisc.receiveShadow = true;
        
        // Front brake caliper
        this.frontCaliper = new THREE.Mesh(caliperGeometry, caliperMaterial);
        this.frontCaliper.position.set(0.12, 0.22, 0.7);
        this.frontCaliper.castShadow = true;

        // ---- Shared materials ----
        const bikeColorHex = parseInt(this.bikeColor);

        // Main bodywork paint. this.frame owns this material and it is shared by
        // the fairings/tail so crash color feedback and wheelie brightness tint
        // the whole bodywork together. Never share with tires/rider/chrome.
        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: bikeColorHex,
            roughness: 0.18,
            metalness: 0.72
        });
        // Darker shade of the paint for the lower fairing/belly so the
        // bodywork reads as two-tone race plastics. Static color: crash/wheelie
        // tinting only drives the main bodyMaterial via this.frame.
        const accentColor = new THREE.Color(bikeColorHex).multiplyScalar(0.32);
        const accentMaterial = new THREE.MeshStandardMaterial({
            color: accentColor,
            roughness: 0.3,
            metalness: 0.65
        });
        const chromeMaterial = new THREE.MeshStandardMaterial({
            color: 0xd8d8d8,
            roughness: 0.12,
            metalness: 1.0
        });
        const darkMetalMaterial = new THREE.MeshStandardMaterial({
            color: 0x17171c,
            roughness: 0.45,
            metalness: 0.75
        });
        const leatherMaterial = new THREE.MeshStandardMaterial({
            color: 0x141418,
            roughness: 0.9,
            metalness: 0.0
        });

        // ---- Frame spine (carries the color-feedback material) ----
        const frameGeometry = new THREE.BoxGeometry(0.1, 0.16, 1.05);
        this.frame = new THREE.Mesh(frameGeometry, bodyMaterial);
        this.frame.position.set(0, 0.62, 0.05);
        this.frame.castShadow = true;
        this.frame.receiveShadow = true;

        // Engine block filling the mid-section
        const engineGeometry = new THREE.BoxGeometry(0.28, 0.3, 0.5);
        this.engine = new THREE.Mesh(engineGeometry, darkMetalMaterial);
        this.engine.position.set(0, 0.42, 0.08);
        this.engine.castShadow = true;
        this.engine.receiveShadow = true;

        // Radiator angled ahead of the engine
        const radiatorGeometry = new THREE.BoxGeometry(0.26, 0.2, 0.05);
        const radiatorMaterial = new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.8, metalness: 0.4 });
        this.radiator = new THREE.Mesh(radiatorGeometry, radiatorMaterial);
        this.radiator.position.set(0, 0.46, 0.42);
        this.radiator.rotation.x = -0.3;
        this.radiator.castShadow = true;

        // Swingarm spars to the rear wheel
        const swingarmGeometry = new THREE.BoxGeometry(0.045, 0.07, 0.6);
        this.leftSwingarm = new THREE.Mesh(swingarmGeometry, darkMetalMaterial);
        this.leftSwingarm.position.set(-0.11, 0.31, -0.4);
        this.leftSwingarm.castShadow = true;
        this.rightSwingarm = new THREE.Mesh(swingarmGeometry, darkMetalMaterial);
        this.rightSwingarm.position.set(0.11, 0.31, -0.4);
        this.rightSwingarm.castShadow = true;

        // ---- Drivetrain hint on the left side ----
        // Rear sprocket: child of the wheel group so it spins with the tire
        const rearSprocketGeometry = new THREE.CylinderGeometry(0.11, 0.11, 0.018, 16);
        this.rearSprocket = new THREE.Mesh(rearSprocketGeometry, darkMetalMaterial);
        this.rearSprocket.rotation.z = Math.PI / 2;
        this.rearSprocket.position.set(-0.105, 0, 0);
        this.rearSprocket.castShadow = true;
        rearWheelGroup.add(this.rearSprocket);

        // Front sprocket cover at the back of the engine
        const frontSprocketGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.02, 12);
        this.frontSprocket = new THREE.Mesh(frontSprocketGeometry, darkMetalMaterial);
        this.frontSprocket.rotation.z = Math.PI / 2;
        this.frontSprocket.position.set(-0.135, 0.4, -0.02);
        this.frontSprocket.castShadow = true;

        // Chain runs: thin boxes for the top and bottom span
        const chainTopGeometry = new THREE.BoxGeometry(0.016, 0.022, 0.66);
        this.chainTop = new THREE.Mesh(chainTopGeometry, darkMetalMaterial);
        this.chainTop.position.set(-0.13, 0.43, -0.36);
        this.chainTop.rotation.x = -0.06;
        this.chainTop.castShadow = true;
        const chainBottomGeometry = new THREE.BoxGeometry(0.016, 0.022, 0.66);
        this.chainBottom = new THREE.Mesh(chainBottomGeometry, darkMetalMaterial);
        this.chainBottom.position.set(-0.13, 0.27, -0.36);
        this.chainBottom.rotation.x = -0.23;
        this.chainBottom.castShadow = true;

        // Central monoshock: red spring over a chrome shaft, leaning forward
        const shockSpringGeometry = new THREE.CylinderGeometry(0.035, 0.035, 0.2, 10);
        const shockSpringMaterial = new THREE.MeshStandardMaterial({
            color: 0xcc2222,
            roughness: 0.4,
            metalness: 0.6
        });
        this.shockSpring = new THREE.Mesh(shockSpringGeometry, shockSpringMaterial);
        this.shockSpring.position.set(0, 0.44, -0.28);
        this.shockSpring.rotation.x = 0.45;
        this.shockSpring.castShadow = true;
        const shockShaftGeometry = new THREE.CylinderGeometry(0.014, 0.014, 0.28, 8);
        this.shockShaft = new THREE.Mesh(shockShaftGeometry, chromeMaterial);
        this.shockShaft.position.set(0, 0.42, -0.29);
        this.shockShaft.rotation.x = 0.45;
        this.shockShaft.castShadow = true;

        // ---- Fuel tank: sculpted teardrop (scaled sphere) ----
        const tankGeometry = new THREE.SphereGeometry(0.24, 20, 14);
        const tankMaterial = new THREE.MeshStandardMaterial({
            color: bikeColorHex,
            roughness: 0.12,  // Glossy racing finish
            metalness: 0.85
        });
        this.fuelTank = new THREE.Mesh(tankGeometry, tankMaterial);
        this.fuelTank.scale.set(0.85, 0.66, 1.5);
        this.fuelTank.position.set(0, 0.88, 0.18);
        this.fuelTank.rotation.x = 0.08; // nose-high toward the steering head
        this.fuelTank.castShadow = true;
        this.fuelTank.receiveShadow = true;

        // Racing stripe: a narrow sphere shell poking through the tank top,
        // so it hugs the tank's curvature
        const stripeGeometry = new THREE.SphereGeometry(0.245, 20, 14);
        this.stripeColor = localStorage.getItem('playerStripeColor') || '0xffffff';
        const stripeColorHex = parseInt(this.stripeColor);
        const stripeMaterial = new THREE.MeshStandardMaterial({
            color: stripeColorHex,
            roughness: 0.15,
            metalness: 0.9,
            emissive: stripeColorHex,
            emissiveIntensity: 0.05
        });
        this.tankStripe = new THREE.Mesh(stripeGeometry, stripeMaterial);
        this.tankStripe.scale.set(0.18, 0.68, 1.47);
        this.tankStripe.position.set(0, 0.88, 0.18);
        this.tankStripe.rotation.x = 0.08;
        this.tankStripe.castShadow = true;

        // Knee recesses: slim dark panels sitting nearly flush in the tank
        // sides so the tank reads as sculpted rather than a plain blob
        const kneePanelGeometry = new THREE.SphereGeometry(0.1, 12, 8);
        this.leftKneePanel = new THREE.Mesh(kneePanelGeometry, accentMaterial);
        this.leftKneePanel.scale.set(0.45, 0.85, 1.35);
        this.leftKneePanel.position.set(-0.155, 0.8, 0.1);
        this.leftKneePanel.castShadow = true;
        this.rightKneePanel = new THREE.Mesh(kneePanelGeometry, accentMaterial);
        this.rightKneePanel.scale.set(0.45, 0.85, 1.35);
        this.rightKneePanel.position.set(0.155, 0.8, 0.1);
        this.rightKneePanel.castShadow = true;

        // ---- Front fairing: smooth aerodynamic nose cone ----
        const noseGeometry = new THREE.ConeGeometry(0.22, 0.55, 18);
        noseGeometry.rotateX(Math.PI / 2); // apex points forward (+z)
        this.frontFairing = new THREE.Mesh(noseGeometry, bodyMaterial);
        this.frontFairing.scale.set(0.9, 1.25, 1.0); // tall race nose
        this.frontFairing.position.set(0, 0.76, 0.64);
        this.frontFairing.rotation.x = 0.1; // nose dips slightly downward
        this.frontFairing.castShadow = true;
        this.frontFairing.receiveShadow = true;

        // Fairing mid-body: its crown sits level with the tank top so the
        // nose-tank line reads as one continuous surface
        const fairingBodyGeometry = new THREE.SphereGeometry(0.24, 18, 12);
        this.fairingBody = new THREE.Mesh(fairingBodyGeometry, bodyMaterial);
        this.fairingBody.scale.set(0.8, 1.1, 1.35);
        this.fairingBody.position.set(0, 0.78, 0.4);
        this.fairingBody.castShadow = true;
        this.fairingBody.receiveShadow = true;

        // Headlight lens wrapped around the nose
        const headlightGeometry = new THREE.SphereGeometry(0.07, 12, 8);
        const headlightMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: 0xffffee,
            emissiveIntensity: 0.8,
            roughness: 0.05,
            metalness: 0.3
        });
        this.headlight = new THREE.Mesh(headlightGeometry, headlightMaterial);
        this.headlight.scale.set(1.5, 0.6, 0.6);
        this.headlight.position.set(0, 0.74, 0.88);
        this.headlight.castShadow = true;
        this.headlight.receiveShadow = true;

        // Ram air intakes flanking the nose
        const intakeGeometry = new THREE.BoxGeometry(0.07, 0.1, 0.05);
        const intakeMaterial = new THREE.MeshStandardMaterial({
            color: 0x0a0a0a,
            roughness: 0.9,
            metalness: 0.1
        });
        this.leftIntake = new THREE.Mesh(intakeGeometry, intakeMaterial);
        this.leftIntake.position.set(-0.11, 0.64, 0.8);
        this.leftIntake.rotation.y = 0.3;
        this.leftIntake.castShadow = true;

        this.rightIntake = new THREE.Mesh(intakeGeometry, intakeMaterial);
        this.rightIntake.position.set(0.11, 0.64, 0.8);
        this.rightIntake.rotation.y = -0.3;
        this.rightIntake.castShadow = true;

        // ---- Side fairings: smooth bulged panels (scaled spheres) ----
        const sideFairingGeometry = new THREE.SphereGeometry(0.28, 16, 12);
        this.leftSideFairing = new THREE.Mesh(sideFairingGeometry, bodyMaterial);
        this.leftSideFairing.scale.set(0.38, 0.75, 1.55);
        this.leftSideFairing.position.set(-0.15, 0.56, 0.15);
        this.leftSideFairing.castShadow = true;
        this.leftSideFairing.receiveShadow = true;

        this.rightSideFairing = new THREE.Mesh(sideFairingGeometry, bodyMaterial);
        this.rightSideFairing.scale.set(0.38, 0.75, 1.55);
        this.rightSideFairing.position.set(0.15, 0.56, 0.15);
        this.rightSideFairing.castShadow = true;
        this.rightSideFairing.receiveShadow = true;

        // Lower fairing panels in the darker accent tone (two-tone bodywork)
        this.leftLowerFairing = new THREE.Mesh(sideFairingGeometry, accentMaterial);
        this.leftLowerFairing.scale.set(0.36, 0.55, 1.35);
        this.leftLowerFairing.position.set(-0.13, 0.38, 0.15);
        this.leftLowerFairing.castShadow = true;
        this.leftLowerFairing.receiveShadow = true;
        this.rightLowerFairing = new THREE.Mesh(sideFairingGeometry, accentMaterial);
        this.rightLowerFairing.scale.set(0.36, 0.55, 1.35);
        this.rightLowerFairing.position.set(0.13, 0.38, 0.15);
        this.rightLowerFairing.castShadow = true;
        this.rightLowerFairing.receiveShadow = true;

        // Decal panels: slim stripe-colored flashes on the side fairings
        const decalGeometry = new THREE.BoxGeometry(0.012, 0.09, 0.34);
        this.leftDecal = new THREE.Mesh(decalGeometry, stripeMaterial);
        this.leftDecal.position.set(-0.252, 0.6, 0.24);
        this.leftDecal.rotation.x = -0.18; // swept up toward the nose
        this.leftDecal.rotation.y = 0.08;
        this.leftDecal.castShadow = true;
        this.rightDecal = new THREE.Mesh(decalGeometry, stripeMaterial);
        this.rightDecal.position.set(0.252, 0.6, 0.24);
        this.rightDecal.rotation.x = -0.18;
        this.rightDecal.rotation.y = -0.08;
        this.rightDecal.castShadow = true;

        // Belly pan: flattened half-round under the engine, in the accent tone
        const bellyGeometry = new THREE.CylinderGeometry(0.16, 0.16, 0.75, 14);
        bellyGeometry.rotateX(Math.PI / 2); // axis along z
        this.bellyPan = new THREE.Mesh(bellyGeometry, accentMaterial);
        this.bellyPan.scale.set(1.0, 0.6, 1.0);
        this.bellyPan.position.set(0, 0.32, 0.12);
        this.bellyPan.castShadow = true;
        this.bellyPan.receiveShadow = true;

        // Front fender: curved carbon arc hugging the front tire
        const fenderGeometry = new THREE.CylinderGeometry(0.34, 0.34, 0.14, 14, 1, true, 0.5, 2.0);
        fenderGeometry.rotateZ(Math.PI / 2); // arc wraps over the wheel in the yz plane
        const fenderMaterial = new THREE.MeshStandardMaterial({
            color: 0x141418,
            roughness: 0.5,
            metalness: 0.5,
            side: THREE.DoubleSide
        });
        this.frontFender = new THREE.Mesh(fenderGeometry, fenderMaterial);
        this.frontFender.position.set(0, 0.3, 0.7);
        this.frontFender.castShadow = true;

        // ---- Tail section: pointed upswept race cowl ----
        const tailGeometry = new THREE.ConeGeometry(0.15, 0.55, 14);
        tailGeometry.rotateX(-Math.PI / 2); // apex points rearward (-z)
        this.tailSection = new THREE.Mesh(tailGeometry, bodyMaterial);
        this.tailSection.scale.set(1.05, 0.8, 1.0);
        this.tailSection.position.set(0, 0.92, -0.6);
        this.tailSection.rotation.x = 0.3; // strongly upswept rear tip
        this.tailSection.castShadow = true;
        this.tailSection.receiveShadow = true;

        // Rounded cowl blending the seat into the tail, riding higher than
        // the seat so the seat-to-tail step of a sport bike reads clearly
        const tailCowlGeometry = new THREE.SphereGeometry(0.17, 14, 10);
        this.tailCowl = new THREE.Mesh(tailCowlGeometry, bodyMaterial);
        this.tailCowl.scale.set(1.05, 0.72, 1.6);
        this.tailCowl.position.set(0, 0.9, -0.38);
        this.tailCowl.castShadow = true;
        this.tailCowl.receiveShadow = true;

        // Under-tail wedge in the accent tone closing the gap between the
        // upswept cowl and the rear wheel
        const underTailGeometry = new THREE.BoxGeometry(0.2, 0.12, 0.42);
        this.underTail = new THREE.Mesh(underTailGeometry, accentMaterial);
        this.underTail.position.set(0, 0.8, -0.48);
        this.underTail.rotation.x = 0.3;
        this.underTail.castShadow = true;
        this.underTail.receiveShadow = true;

        // Seat: flattened leather capsule stepped down from the tank top
        const seatGeometry = new THREE.CapsuleGeometry(0.1, 0.28, 4, 12);
        seatGeometry.rotateX(Math.PI / 2); // lie along z
        this.seat = new THREE.Mesh(seatGeometry, leatherMaterial);
        this.seat.scale.set(1.4, 0.5, 1.0);
        this.seat.position.set(0, 0.86, -0.06);
        this.seat.castShadow = true;
        this.seat.receiveShadow = true;

        // Brake light recessed in the tail tip
        const brakeGeometry = new THREE.BoxGeometry(0.09, 0.04, 0.04);
        const brakeMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0x000000, emissiveIntensity: 0.0 });
        this.brakeLight = new THREE.Mesh(brakeGeometry, brakeMaterial);
        this.brakeLight.position.set(0, 0.99, -0.84);
        this.brakeLight.rotation.x = 0.3;
        this.brakeLight.castShadow = true;
        this.brakeLight.receiveShadow = true;

        // Rear number plate hanging under the tail
        const numberPlateGeometry = new THREE.BoxGeometry(0.15, 0.08, 0.01);
        const numberPlateMaterial = new THREE.MeshStandardMaterial({
            color: 0xf5f5f5,
            roughness: 0.6,
            metalness: 0.1
        });
        this.numberPlate = new THREE.Mesh(numberPlateGeometry, numberPlateMaterial);
        this.numberPlate.position.set(0, 0.7, -0.78);
        this.numberPlate.rotation.x = 0.3;
        this.numberPlate.castShadow = true;

        // ---- Windscreen: curved transparent bubble (spherical cap) ----
        const windscreenGeometry = new THREE.SphereGeometry(0.24, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2.4);
        const windscreenMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a2a3a,
            roughness: 0.05,
            metalness: 0.2,
            transparent: true,
            opacity: 0.35,
            side: THREE.DoubleSide
        });
        this.windscreen = new THREE.Mesh(windscreenGeometry, windscreenMaterial);
        this.windscreen.scale.set(0.75, 1.05, 1.1);
        this.windscreen.position.set(0, 0.98, 0.44); // rises off the fairing crown
        this.windscreen.rotation.x = -0.95; // raked back over the clocks
        this.windscreen.castShadow = true;

        // Dash/clocks tucked under the screen
        const dashGeometry = new THREE.BoxGeometry(0.16, 0.05, 0.08);
        this.dash = new THREE.Mesh(dashGeometry, darkMetalMaterial);
        this.dash.position.set(0, 0.93, 0.52);
        this.dash.rotation.x = -0.5;
        this.dash.castShadow = true;

        // ---- Cockpit: clip-on bar with grips, triple clamp, mirrors ----
        const handlebarGeometry = new THREE.CylinderGeometry(0.022, 0.022, 0.46, 10);
        handlebarGeometry.rotateZ(Math.PI / 2); // across the bike
        this.handlebar = new THREE.Mesh(handlebarGeometry, chromeMaterial);
        this.handlebar.position.set(0, 1.0, 0.6);
        this.handlebar.castShadow = true;
        this.handlebar.receiveShadow = true;

        const gripGeometry = new THREE.CylinderGeometry(0.032, 0.032, 0.11, 10);
        gripGeometry.rotateZ(Math.PI / 2);
        const leftGrip = new THREE.Mesh(gripGeometry, leatherMaterial);
        leftGrip.position.set(-0.19, 0, 0);
        leftGrip.castShadow = true;
        this.handlebar.add(leftGrip);
        const rightGrip = new THREE.Mesh(gripGeometry, leatherMaterial);
        rightGrip.position.set(0.19, 0, 0);
        rightGrip.castShadow = true;
        this.handlebar.add(rightGrip);

        // Brake/clutch levers angled forward from the grips
        const leverGeometry = new THREE.BoxGeometry(0.012, 0.012, 0.09);
        const leftLever = new THREE.Mesh(leverGeometry, chromeMaterial);
        leftLever.position.set(-0.21, 0.015, 0.07);
        leftLever.rotation.y = 0.35;
        leftLever.castShadow = true;
        this.handlebar.add(leftLever);
        const rightLever = new THREE.Mesh(leverGeometry, chromeMaterial);
        rightLever.position.set(0.21, 0.015, 0.07);
        rightLever.rotation.y = -0.35;
        rightLever.castShadow = true;
        this.handlebar.add(rightLever);

        // Triple clamps joining the fork tubes (upper and lower)
        const tripleClampGeometry = new THREE.BoxGeometry(0.26, 0.05, 0.09);
        this.tripleClamp = new THREE.Mesh(tripleClampGeometry, darkMetalMaterial);
        this.tripleClamp.position.set(0, 0.8, 0.68);
        this.tripleClamp.castShadow = true;
        const lowerClampGeometry = new THREE.BoxGeometry(0.24, 0.04, 0.08);
        this.lowerClamp = new THREE.Mesh(lowerClampGeometry, darkMetalMaterial);
        this.lowerClamp.position.set(0, 0.7, 0.69);
        this.lowerClamp.castShadow = true;

        // Sleek teardrop mirrors on thin stalks off the fairing
        const mirrorGeometry = new THREE.SphereGeometry(0.045, 10, 8);
        this.leftMirror = new THREE.Mesh(mirrorGeometry, darkMetalMaterial);
        this.leftMirror.scale.set(1.3, 0.8, 0.45);
        this.leftMirror.position.set(-0.22, 1.06, 0.5);
        this.leftMirror.castShadow = true;
        this.leftMirror.receiveShadow = true;
        this.rightMirror = new THREE.Mesh(mirrorGeometry, darkMetalMaterial);
        this.rightMirror.scale.set(1.3, 0.8, 0.45);
        this.rightMirror.position.set(0.22, 1.06, 0.5);
        this.rightMirror.castShadow = true;
        this.rightMirror.receiveShadow = true;

        const stalkGeometry = new THREE.CylinderGeometry(0.008, 0.008, 0.14, 6);
        this.leftMirrorStalk = new THREE.Mesh(stalkGeometry, darkMetalMaterial);
        this.leftMirrorStalk.position.set(-0.17, 1.02, 0.51);
        this.leftMirrorStalk.rotation.z = 0.9;
        this.leftMirrorStalk.castShadow = true;
        this.rightMirrorStalk = new THREE.Mesh(stalkGeometry, darkMetalMaterial);
        this.rightMirrorStalk.position.set(0.17, 1.02, 0.51);
        this.rightMirrorStalk.rotation.z = -0.9;
        this.rightMirrorStalk.castShadow = true;

        // ---- Rider in a forward racing tuck ----
        // Torso capsule with the forward lean baked into the geometry so the
        // animation code can keep driving this.rider.rotation.z for lean.
        const torsoGeometry = new THREE.CapsuleGeometry(0.14, 0.32, 4, 14);
        torsoGeometry.rotateX(0.72); // crouched over the tank
        this.rider = new THREE.Mesh(torsoGeometry, leatherMaterial);
        this.rider.position.set(0, 1.06, -0.08);
        this.rider.castShadow = true;
        this.rider.receiveShadow = true;

        // Aero hump on the back of the leathers
        const humpGeometry = new THREE.SphereGeometry(0.07, 10, 8);
        this.riderHump = new THREE.Mesh(humpGeometry, leatherMaterial);
        this.riderHump.position.set(0, 0.27, 0.02);
        this.riderHump.castShadow = true;
        this.rider.add(this.riderHump);

        // Helmet: rounded, glossy, tucked behind the screen
        const helmetGeometry = new THREE.SphereGeometry(0.13, 16, 12);
        const helmetMaterial = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.25, metalness: 0.4 });
        this.helmet = new THREE.Mesh(helmetGeometry, helmetMaterial);
        this.helmet.position.set(0, 0.26, 0.28); // tucked low behind the screen
        this.helmet.castShadow = true;
        this.helmet.receiveShadow = true;
        this.rider.add(this.helmet);

        // Dark visor on the front of the helmet
        const visorGeometry = new THREE.SphereGeometry(0.105, 12, 8);
        const visorMaterial = new THREE.MeshStandardMaterial({
            color: 0x10141a,
            roughness: 0.08,
            metalness: 0.4
        });
        this.visor = new THREE.Mesh(visorGeometry, visorMaterial);
        this.visor.scale.set(1.1, 0.75, 0.55);
        this.visor.position.set(0, 0.25, 0.36);
        this.visor.castShadow = true;
        this.rider.add(this.visor);

        // Arms in two segments so the elbows read as bent in a proper tuck:
        // upper arm drops from the shoulder, forearm reaches to the grip
        const upperArmGeometry = new THREE.CapsuleGeometry(0.042, 0.18, 4, 10);
        this.leftArm = new THREE.Mesh(upperArmGeometry, leatherMaterial);
        this.leftArm.position.set(-0.155, 0.1, 0.3);
        this.leftArm.rotation.x = 2.47; // shoulder to elbow, angled down-forward
        this.leftArm.rotation.z = 0.12;
        this.leftArm.castShadow = true;
        this.rider.add(this.leftArm);

        this.rightArm = new THREE.Mesh(upperArmGeometry, leatherMaterial);
        this.rightArm.position.set(0.155, 0.1, 0.3);
        this.rightArm.rotation.x = 2.47;
        this.rightArm.rotation.z = -0.12;
        this.rightArm.castShadow = true;
        this.rider.add(this.rightArm);

        const forearmGeometry = new THREE.CapsuleGeometry(0.038, 0.23, 4, 10);
        this.leftForearm = new THREE.Mesh(forearmGeometry, leatherMaterial);
        this.leftForearm.position.set(-0.18, -0.03, 0.53);
        this.leftForearm.rotation.x = 1.77; // elbow to grip, nearly horizontal
        this.leftForearm.rotation.z = 0.07;
        this.leftForearm.castShadow = true;
        this.rider.add(this.leftForearm);

        this.rightForearm = new THREE.Mesh(forearmGeometry, leatherMaterial);
        this.rightForearm.position.set(0.18, -0.03, 0.53);
        this.rightForearm.rotation.x = 1.77;
        this.rightForearm.rotation.z = -0.07;
        this.rightForearm.castShadow = true;
        this.rider.add(this.rightForearm);

        // Gloves on the grips
        const gloveGeometry = new THREE.SphereGeometry(0.045, 8, 6);
        this.leftGlove = new THREE.Mesh(gloveGeometry, leatherMaterial);
        this.leftGlove.position.set(-0.185, -0.06, 0.66);
        this.leftGlove.castShadow = true;
        this.rider.add(this.leftGlove);
        this.rightGlove = new THREE.Mesh(gloveGeometry, leatherMaterial);
        this.rightGlove.position.set(0.185, -0.06, 0.66);
        this.rightGlove.castShadow = true;
        this.rider.add(this.rightGlove);

        // Legs bent at the knee: thighs gripping the tank, shins to the pegs
        const thighGeometry = new THREE.CapsuleGeometry(0.055, 0.2, 4, 10);
        this.leftLeg = new THREE.Mesh(thighGeometry, leatherMaterial);
        this.leftLeg.position.set(-0.145, -0.32, -0.04);
        this.leftLeg.rotation.x = 2.19;
        this.leftLeg.rotation.z = 0.14;
        this.leftLeg.castShadow = true;
        this.leftLeg.receiveShadow = true;
        this.rider.add(this.leftLeg);

        this.rightLeg = new THREE.Mesh(thighGeometry, leatherMaterial);
        this.rightLeg.position.set(0.145, -0.32, -0.04);
        this.rightLeg.rotation.x = 2.19;
        this.rightLeg.rotation.z = -0.14;
        this.rightLeg.castShadow = true;
        this.rightLeg.receiveShadow = true;
        this.rider.add(this.rightLeg);

        const shinGeometry = new THREE.CapsuleGeometry(0.048, 0.14, 4, 10);
        this.leftShin = new THREE.Mesh(shinGeometry, leatherMaterial);
        this.leftShin.position.set(-0.19, -0.53, 0.015);
        this.leftShin.rotation.x = 0.66;
        this.leftShin.rotation.z = 0.15;
        this.leftShin.castShadow = true;
        this.rider.add(this.leftShin);

        this.rightShin = new THREE.Mesh(shinGeometry, leatherMaterial);
        this.rightShin.position.set(0.19, -0.53, 0.015);
        this.rightShin.rotation.x = 0.66;
        this.rightShin.rotation.z = -0.15;
        this.rightShin.castShadow = true;
        this.rider.add(this.rightShin);

        // Boots resting on the pegs
        const bootGeometry = new THREE.BoxGeometry(0.08, 0.07, 0.18);
        this.leftBoot = new THREE.Mesh(bootGeometry, leatherMaterial);
        this.leftBoot.position.set(-0.2, -0.61, -0.05);
        this.leftBoot.rotation.x = 0.15; // toes down on the peg
        this.leftBoot.castShadow = true;
        this.rider.add(this.leftBoot);

        this.rightBoot = new THREE.Mesh(bootGeometry, leatherMaterial);
        this.rightBoot.position.set(0.2, -0.61, -0.05);
        this.rightBoot.rotation.x = 0.15;
        this.rightBoot.castShadow = true;
        this.rider.add(this.rightBoot);

        // Footpegs directly under the boots
        const footpegGeometry = new THREE.BoxGeometry(0.08, 0.02, 0.04);
        const footpegMaterial = new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 0.4, metalness: 0.8 });

        this.leftFootpeg = new THREE.Mesh(footpegGeometry, footpegMaterial);
        this.leftFootpeg.position.set(-0.21, 0.43, -0.13);
        this.leftFootpeg.castShadow = true;

        this.rightFootpeg = new THREE.Mesh(footpegGeometry, footpegMaterial);
        this.rightFootpeg.position.set(0.21, 0.43, -0.13);
        this.rightFootpeg.castShadow = true;

        // ---- Exhausts: twin upswept chrome cans with dark tips ----
        const exhaustGeometry = new THREE.CylinderGeometry(0.042, 0.06, 0.5, 14);
        exhaustGeometry.rotateX(Math.PI / 2); // run along z, wider muzzle at the rear
        const exhaustMaterial = new THREE.MeshStandardMaterial({
            color: 0xc8c8c8,
            roughness: 0.1,
            metalness: 1.0,
            emissive: 0x331100,
            emissiveIntensity: 0.08
        });
        const exhaustTipGeometry = new THREE.CylinderGeometry(0.045, 0.052, 0.05, 14);
        exhaustTipGeometry.rotateX(Math.PI / 2);

        this.leftExhaust = new THREE.Mesh(exhaustGeometry, exhaustMaterial);
        this.leftExhaust.position.set(-0.16, 0.48, -0.52);
        this.leftExhaust.rotation.x = 0.32; // upswept toward the tail
        this.leftExhaust.castShadow = true;
        this.leftExhaust.receiveShadow = true;
        const leftTip = new THREE.Mesh(exhaustTipGeometry, darkMetalMaterial);
        leftTip.position.set(0, 0, -0.26);
        leftTip.castShadow = true;
        this.leftExhaust.add(leftTip);

        this.rightExhaust = new THREE.Mesh(exhaustGeometry, exhaustMaterial);
        this.rightExhaust.position.set(0.16, 0.48, -0.52);
        this.rightExhaust.rotation.x = 0.32;
        this.rightExhaust.castShadow = true;
        this.rightExhaust.receiveShadow = true;
        const rightTip = new THREE.Mesh(exhaustTipGeometry, darkMetalMaterial);
        rightTip.position.set(0, 0, -0.26);
        rightTip.castShadow = true;
        this.rightExhaust.add(rightTip);

        this.group.add(this.rearWheel);
        this.group.add(this.rearDisc);
        this.group.add(this.rearCaliper);
        this.group.add(this.leftFork);
        this.group.add(this.rightFork);
        this.group.add(this.frontWheel);
        this.group.add(this.frontDisc);
        this.group.add(this.frontCaliper);
        this.group.add(this.frame);
        this.group.add(this.engine);
        this.group.add(this.radiator);
        this.group.add(this.leftSwingarm);
        this.group.add(this.rightSwingarm);
        this.group.add(this.frontSprocket);
        this.group.add(this.chainTop);
        this.group.add(this.chainBottom);
        this.group.add(this.shockSpring);
        this.group.add(this.shockShaft);
        this.group.add(this.fuelTank);
        this.group.add(this.tankStripe);
        this.group.add(this.leftKneePanel);
        this.group.add(this.rightKneePanel);
        this.group.add(this.frontFairing);
        this.group.add(this.fairingBody);
        this.group.add(this.bellyPan);
        this.group.add(this.frontFender);
        this.group.add(this.tailCowl);
        this.group.add(this.underTail);
        this.group.add(this.tripleClamp);
        this.group.add(this.lowerClamp);
        this.group.add(this.dash);
        this.group.add(this.leftLowerFairing);
        this.group.add(this.rightLowerFairing);
        this.group.add(this.leftDecal);
        this.group.add(this.rightDecal);
        this.group.add(this.leftMirrorStalk);
        this.group.add(this.rightMirrorStalk);
        this.group.add(this.leftIntake);
        this.group.add(this.rightIntake);
        this.group.add(this.leftSideFairing);
        this.group.add(this.rightSideFairing);
        this.group.add(this.tailSection);
        this.group.add(this.seat);
        this.group.add(this.leftFootpeg);
        this.group.add(this.rightFootpeg);
        this.group.add(this.handlebar);
        this.group.add(this.windscreen);
        this.group.add(this.rider);
        this.group.add(this.headlight);
        this.group.add(this.brakeLight);
        this.group.add(this.numberPlate);
        this.group.add(this.leftMirror);
        this.group.add(this.rightMirror);
        this.group.add(this.leftExhaust);
        this.group.add(this.rightExhaust);
    }

    // ---- Shared construction helpers for the bike model variants ----

    // Builds front + rear wheel groups (group origins at the contract
    // positions), brake discs, and adds them all to this.group.
    buildWheelSet({
        rearTireRadius = 0.3, rearTireWidth = 0.15,
        frontTireRadius = 0.28, frontTireWidth = 0.12,
        rimRadius = 0.18, spokeCount = 6,
        discRadius = 0.25, knobby = false
    } = {}) {
        const tireMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a, roughness: 0.95, metalness: 0.0
        });
        const rimMaterial = new THREE.MeshStandardMaterial({
            color: 0xb0b0b0, roughness: 0.2, metalness: 0.9
        });

        const makeWheel = (tireRadius, tireWidth) => {
            const wheel = new THREE.Group();

            const tire = new THREE.Mesh(
                new THREE.CylinderGeometry(tireRadius, tireRadius, tireWidth, 20),
                tireMaterial
            );
            tire.rotation.z = Math.PI / 2;
            tire.castShadow = true;
            wheel.add(tire);

            if (knobby) {
                // Chunky tread blocks around the circumference - they sit in
                // the wheel group so they spin with rotation.x
                const knobGeometry = new THREE.BoxGeometry(tireWidth + 0.02, 0.035, 0.05);
                for (let i = 0; i < 12; i++) {
                    const angle = (i * Math.PI * 2) / 12;
                    const knob = new THREE.Mesh(knobGeometry, tireMaterial);
                    knob.position.set(0, Math.cos(angle) * tireRadius, Math.sin(angle) * tireRadius);
                    knob.rotation.x = -angle;
                    knob.castShadow = true;
                    wheel.add(knob);
                }
            }

            const rim = new THREE.Mesh(
                new THREE.CylinderGeometry(rimRadius, rimRadius, tireWidth + 0.01, 16),
                rimMaterial
            );
            rim.rotation.z = Math.PI / 2;
            rim.castShadow = true;
            wheel.add(rim);

            const hub = new THREE.Mesh(
                new THREE.CylinderGeometry(0.05, 0.05, tireWidth + 0.02, 12),
                rimMaterial
            );
            hub.rotation.z = Math.PI / 2;
            hub.castShadow = true;
            wheel.add(hub);

            if (spokeCount > 0) {
                const spokeGeometry = new THREE.BoxGeometry(0.018, rimRadius * 2 - 0.02, 0.05);
                for (let i = 0; i < spokeCount; i++) {
                    const spoke = new THREE.Mesh(spokeGeometry, rimMaterial);
                    spoke.rotation.z = Math.PI / 2;
                    spoke.rotation.y = (i * Math.PI * 2) / spokeCount;
                    spoke.castShadow = true;
                    wheel.add(spoke);
                }
            }

            wheel.castShadow = true;
            wheel.receiveShadow = true;
            return wheel;
        };

        this.rearWheel = makeWheel(rearTireRadius, rearTireWidth);
        this.rearWheel.position.set(0, 0.3, -0.7);
        this.frontWheel = makeWheel(frontTireRadius, frontTireWidth);
        this.frontWheel.position.set(0, 0.3, 0.7);

        const discGeometry = new THREE.CylinderGeometry(discRadius, discRadius, 0.02, 20);
        const discMaterial = new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 0.3, metalness: 0.9 });
        this.rearDisc = new THREE.Mesh(discGeometry, discMaterial);
        this.rearDisc.rotation.z = Math.PI / 2;
        this.rearDisc.position.set(0.09, 0.3, -0.7);
        this.rearDisc.castShadow = true;
        this.frontDisc = new THREE.Mesh(discGeometry, discMaterial);
        this.frontDisc.rotation.z = Math.PI / 2;
        this.frontDisc.position.set(0.09, 0.3, 0.7);
        this.frontDisc.castShadow = true;

        this.group.add(this.rearWheel);
        this.group.add(this.frontWheel);
        this.group.add(this.rearDisc);
        this.group.add(this.frontDisc);
    }

    // Builds the left/right fork tubes and adds them to this.group
    buildForkPair({ length = 0.5, x = 0.1, y = 0.55, z = 0.7, radius = 0.025, rake = 0 } = {}) {
        const forkMaterial = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.4, metalness: 0.9 });
        const forkGeometry = new THREE.CylinderGeometry(radius, radius, length, 12);
        this.leftFork = new THREE.Mesh(forkGeometry, forkMaterial);
        this.leftFork.position.set(-x, y, z);
        this.leftFork.rotation.x = rake;
        this.leftFork.castShadow = true;
        this.leftFork.receiveShadow = true;
        this.rightFork = new THREE.Mesh(forkGeometry, forkMaterial);
        this.rightFork.position.set(x, y, z);
        this.rightFork.rotation.x = rake;
        this.rightFork.castShadow = true;
        this.rightFork.receiveShadow = true;
        this.group.add(this.leftFork);
        this.group.add(this.rightFork);
    }

    // Builds a simple articulated rider (torso + helmet + arms + legs) and
    // adds it to this.group. Posture is controlled by torsoLean (radians of
    // forward pitch baked into the geometry; rotation.z stays free for the
    // lean animation) and the limb angles.
    buildVariantRider({
        y = 1.15, z = -0.1, torsoLean = 0.15,
        armDrop = 1.9, legBend = 1.6,
        suitColor = 0x141418, helmetColor = 0xf0f0f0
    } = {}) {
        const suitMaterial = new THREE.MeshStandardMaterial({
            color: suitColor, roughness: 0.9, metalness: 0.0
        });

        const torsoGeometry = new THREE.CapsuleGeometry(0.14, 0.34, 4, 14);
        torsoGeometry.rotateX(torsoLean);
        this.rider = new THREE.Mesh(torsoGeometry, suitMaterial);
        this.rider.position.set(0, y, z);
        this.rider.castShadow = true;
        this.rider.receiveShadow = true;

        // Helmet sits above/ahead of the torso depending on lean
        const helmetGeometry = new THREE.SphereGeometry(0.13, 16, 12);
        const helmetMaterial = new THREE.MeshStandardMaterial({ color: helmetColor, roughness: 0.25, metalness: 0.4 });
        this.helmet = new THREE.Mesh(helmetGeometry, helmetMaterial);
        this.helmet.position.set(0, 0.27 + Math.cos(torsoLean) * 0.06, Math.sin(torsoLean) * 0.3 + 0.04);
        this.helmet.castShadow = true;
        this.rider.add(this.helmet);

        const visorGeometry = new THREE.SphereGeometry(0.105, 12, 8);
        const visorMaterial = new THREE.MeshStandardMaterial({ color: 0x10141a, roughness: 0.08, metalness: 0.4 });
        this.visor = new THREE.Mesh(visorGeometry, visorMaterial);
        this.visor.scale.set(1.05, 0.7, 0.5);
        this.visor.position.set(0, this.helmet.position.y - 0.01, this.helmet.position.z + 0.09);
        this.visor.castShadow = true;
        this.rider.add(this.visor);

        // Arms reach forward/down toward the bars
        const armGeometry = new THREE.CapsuleGeometry(0.04, 0.34, 4, 10);
        this.leftArm = new THREE.Mesh(armGeometry, suitMaterial);
        this.leftArm.position.set(-0.17, 0.05, 0.26);
        this.leftArm.rotation.x = armDrop;
        this.leftArm.rotation.z = 0.15;
        this.leftArm.castShadow = true;
        this.rider.add(this.leftArm);
        this.rightArm = new THREE.Mesh(armGeometry, suitMaterial);
        this.rightArm.position.set(0.17, 0.05, 0.26);
        this.rightArm.rotation.x = armDrop;
        this.rightArm.rotation.z = -0.15;
        this.rightArm.castShadow = true;
        this.rider.add(this.rightArm);

        // Legs drop toward the pegs/floorboard
        const legGeometry = new THREE.CapsuleGeometry(0.055, 0.3, 4, 10);
        this.leftLeg = new THREE.Mesh(legGeometry, suitMaterial);
        this.leftLeg.position.set(-0.14, -0.32, 0.06);
        this.leftLeg.rotation.x = legBend;
        this.leftLeg.rotation.z = 0.12;
        this.leftLeg.castShadow = true;
        this.leftLeg.receiveShadow = true;
        this.rider.add(this.leftLeg);
        this.rightLeg = new THREE.Mesh(legGeometry, suitMaterial);
        this.rightLeg.position.set(0.14, -0.32, 0.06);
        this.rightLeg.rotation.x = legBend;
        this.rightLeg.rotation.z = -0.12;
        this.rightLeg.castShadow = true;
        this.rightLeg.receiveShadow = true;
        this.rider.add(this.rightLeg);

        this.group.add(this.rider);
    }

    // Brake light helper - emissive red box toggled by updateMesh()
    buildBrakeLight(x, y, z, tiltX = 0) {
        const brakeGeometry = new THREE.BoxGeometry(0.1, 0.05, 0.04);
        const brakeMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0x000000, emissiveIntensity: 0.0 });
        this.brakeLight = new THREE.Mesh(brakeGeometry, brakeMaterial);
        this.brakeLight.position.set(x, y, z);
        this.brakeLight.rotation.x = tiltX;
        this.brakeLight.castShadow = true;
        this.brakeLight.receiveShadow = true;
        this.group.add(this.brakeLight);
    }

    // Handlebar helper with grips, added to this.group
    buildHandlebar({ y, z, width = 0.5 } = {}) {
        const chromeMaterial = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.12, metalness: 1.0 });
        const gripMaterial = new THREE.MeshStandardMaterial({ color: 0x141418, roughness: 0.9, metalness: 0.0 });
        const handlebarGeometry = new THREE.CylinderGeometry(0.022, 0.022, width, 10);
        handlebarGeometry.rotateZ(Math.PI / 2);
        this.handlebar = new THREE.Mesh(handlebarGeometry, chromeMaterial);
        this.handlebar.position.set(0, y, z);
        this.handlebar.castShadow = true;
        this.handlebar.receiveShadow = true;
        const gripGeometry = new THREE.CylinderGeometry(0.032, 0.032, 0.11, 10);
        gripGeometry.rotateZ(Math.PI / 2);
        const leftGrip = new THREE.Mesh(gripGeometry, gripMaterial);
        leftGrip.position.set(-(width / 2 - 0.06), 0, 0);
        leftGrip.castShadow = true;
        this.handlebar.add(leftGrip);
        const rightGrip = new THREE.Mesh(gripGeometry, gripMaterial);
        rightGrip.position.set(width / 2 - 0.06, 0, 0);
        rightGrip.castShadow = true;
        this.handlebar.add(rightGrip);
        this.group.add(this.handlebar);
    }

    // ---- Alex: sandy-gold adventure bike with top box and panniers ----
    buildAdventureBike() {
        const bikeColorHex = parseInt(this.bikeColor);
        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: bikeColorHex, roughness: 0.35, metalness: 0.5
        });
        const darkMetalMaterial = new THREE.MeshStandardMaterial({
            color: 0x17171c, roughness: 0.45, metalness: 0.75
        });
        const luggageMaterial = new THREE.MeshStandardMaterial({
            color: 0x2a2d33, roughness: 0.6, metalness: 0.4
        });
        const leatherMaterial = new THREE.MeshStandardMaterial({
            color: 0x141418, roughness: 0.9, metalness: 0.0
        });

        // Spoked wheels with mild dual-sport tread
        this.buildWheelSet({
            rearTireRadius: 0.3, rearTireWidth: 0.13,
            frontTireRadius: 0.3, frontTireWidth: 0.1,
            rimRadius: 0.16, spokeCount: 8, discRadius: 0.22
        });

        // Long-travel exposed forks
        this.buildForkPair({ length: 0.68, x: 0.09, y: 0.6, z: 0.68, rake: 0.12 });

        // Frame spine - tall stance (carries the colour-feedback material)
        this.frame = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 1.0), bodyMaterial);
        this.frame.position.set(0, 0.72, 0.0);
        this.frame.castShadow = true;
        this.frame.receiveShadow = true;
        this.group.add(this.frame);

        // Engine + bash plate
        this.engine = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.45), darkMetalMaterial);
        this.engine.position.set(0, 0.48, 0.08);
        this.engine.castShadow = true;
        this.group.add(this.engine);
        const bashPlate = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.06, 0.5), luggageMaterial);
        bashPlate.position.set(0, 0.3, 0.1);
        bashPlate.castShadow = true;
        this.group.add(bashPlate);

        // Tall boxy fuel tank
        this.fuelTank = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.5), bodyMaterial);
        this.fuelTank.position.set(0, 0.96, 0.22);
        this.fuelTank.rotation.x = 0.08;
        this.fuelTank.castShadow = true;
        this.fuelTank.receiveShadow = true;
        this.group.add(this.fuelTank);

        // Signature adventure beak under the headlight
        const beakGeometry = new THREE.ConeGeometry(0.1, 0.45, 12);
        beakGeometry.rotateX(Math.PI / 2); // point forward
        const beak = new THREE.Mesh(beakGeometry, bodyMaterial);
        beak.scale.set(1.6, 0.55, 1.0);
        beak.position.set(0, 0.72, 0.82);
        beak.rotation.x = -0.18; // droops toward the front wheel
        beak.castShadow = true;
        this.group.add(beak);

        // High front mudguard hugging the wheel
        const mudguard = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.5), bodyMaterial);
        mudguard.position.set(0, 0.66, 0.7);
        mudguard.castShadow = true;
        this.group.add(mudguard);

        // Headlight cluster
        const headlightMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff, emissive: 0xffffee, emissiveIntensity: 0.8, roughness: 0.05, metalness: 0.3
        });
        this.headlight = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), headlightMaterial);
        this.headlight.scale.set(1.6, 0.8, 0.6);
        this.headlight.position.set(0, 0.95, 0.6);
        this.headlight.castShadow = true;
        this.group.add(this.headlight);

        // Tall touring windscreen
        const windscreenMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a2a3a, roughness: 0.05, metalness: 0.2,
            transparent: true, opacity: 0.35, side: THREE.DoubleSide
        });
        const windscreen = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.4, 0.02), windscreenMaterial);
        windscreen.position.set(0, 1.3, 0.52);
        windscreen.rotation.x = -0.35;
        windscreen.castShadow = true;
        this.group.add(windscreen);

        // Wide upright handlebar
        this.buildHandlebar({ y: 1.18, z: 0.5, width: 0.56 });

        // Stepped touring seat
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.55), leatherMaterial);
        seat.position.set(0, 0.94, -0.25);
        seat.castShadow = true;
        seat.receiveShadow = true;
        this.group.add(seat);

        // Luggage: top box behind the seat + slim side panniers
        const topBox = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.28, 0.34), luggageMaterial);
        topBox.position.set(0, 1.14, -0.6);
        topBox.castShadow = true;
        topBox.receiveShadow = true;
        this.group.add(topBox);
        const topBoxLid = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.36), bodyMaterial);
        topBoxLid.position.set(0, 1.3, -0.6);
        topBoxLid.castShadow = true;
        this.group.add(topBoxLid);

        const pannierGeometry = new THREE.BoxGeometry(0.12, 0.3, 0.38);
        const leftPannier = new THREE.Mesh(pannierGeometry, luggageMaterial);
        leftPannier.position.set(-0.24, 0.72, -0.42);
        leftPannier.castShadow = true;
        this.group.add(leftPannier);
        const rightPannier = new THREE.Mesh(pannierGeometry, luggageMaterial);
        rightPannier.position.set(0.24, 0.72, -0.42);
        rightPannier.castShadow = true;
        this.group.add(rightPannier);

        // Rear rack + swingarm + upswept single exhaust
        const swingarmGeometry = new THREE.BoxGeometry(0.045, 0.07, 0.55);
        const leftSwingarm = new THREE.Mesh(swingarmGeometry, darkMetalMaterial);
        leftSwingarm.position.set(-0.1, 0.32, -0.4);
        leftSwingarm.castShadow = true;
        this.group.add(leftSwingarm);
        const rightSwingarm = new THREE.Mesh(swingarmGeometry, darkMetalMaterial);
        rightSwingarm.position.set(0.1, 0.32, -0.4);
        rightSwingarm.castShadow = true;
        this.group.add(rightSwingarm);

        const exhaustGeometry = new THREE.CylinderGeometry(0.05, 0.06, 0.45, 12);
        exhaustGeometry.rotateX(Math.PI / 2);
        const exhaustMaterial = new THREE.MeshStandardMaterial({ color: 0xc8c8c8, roughness: 0.15, metalness: 1.0 });
        const exhaust = new THREE.Mesh(exhaustGeometry, exhaustMaterial);
        exhaust.position.set(0.16, 0.62, -0.45);
        exhaust.rotation.x = 0.35;
        exhaust.castShadow = true;
        this.group.add(exhaust);

        // Brake light on the top box
        this.buildBrakeLight(0, 1.12, -0.79);

        // Upright touring rider
        this.buildVariantRider({
            y: 1.22, z: -0.12, torsoLean: 0.18,
            armDrop: 1.95, legBend: 1.35,
            suitColor: 0x33383f, helmetColor: 0xddddcc
        });
    }

    // ---- Tim: silver maxi-scooter (step-through, floorboard, screen) ----
    buildScooter() {
        const bikeColorHex = parseInt(this.bikeColor);
        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: bikeColorHex, roughness: 0.25, metalness: 0.6
        });
        const trimMaterial = new THREE.MeshStandardMaterial({
            color: 0x1c1e22, roughness: 0.7, metalness: 0.3
        });
        const leatherMaterial = new THREE.MeshStandardMaterial({
            color: 0x141418, roughness: 0.9, metalness: 0.0
        });

        // Small-looking wheels: fat tires, tiny rims, no exposed spokes
        this.buildWheelSet({
            rearTireRadius: 0.3, rearTireWidth: 0.17,
            frontTireRadius: 0.28, frontTireWidth: 0.15,
            rimRadius: 0.11, spokeCount: 0, discRadius: 0.12
        });

        // Stubby forks mostly hidden behind the front bodywork
        this.buildForkPair({ length: 0.4, x: 0.08, y: 0.5, z: 0.68, radius: 0.022 });

        // Main body: boxy under-seat storage hump (colour-feedback material)
        this.frame = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.36, 0.75), bodyMaterial);
        this.frame.position.set(0, 0.62, -0.35);
        this.frame.castShadow = true;
        this.frame.receiveShadow = true;
        this.group.add(this.frame);

        // Front apron (acts as the fuelTank contract part - colour set in reset)
        const apronGeometry = new THREE.SphereGeometry(0.3, 16, 12);
        this.fuelTank = new THREE.Mesh(apronGeometry, bodyMaterial);
        this.fuelTank.scale.set(0.66, 1.15, 0.55);
        this.fuelTank.position.set(0, 0.72, 0.55);
        this.fuelTank.castShadow = true;
        this.fuelTank.receiveShadow = true;
        this.group.add(this.fuelTank);

        // Flat step-through floorboard bridging apron and body
        const floorboard = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.06, 0.55), trimMaterial);
        floorboard.position.set(0, 0.38, 0.12);
        floorboard.castShadow = true;
        floorboard.receiveShadow = true;
        this.group.add(floorboard);

        // Underbody panel closing the gap between the wheels
        const underBody = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.7), trimMaterial);
        underBody.position.set(0, 0.3, 0.0);
        underBody.castShadow = true;
        this.group.add(underBody);

        // Front fender hugging the wheel
        const frontFender = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.45), bodyMaterial);
        frontFender.position.set(0, 0.62, 0.7);
        frontFender.castShadow = true;
        this.group.add(frontFender);

        // Tall commuter windscreen
        const windscreenMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a2a3a, roughness: 0.05, metalness: 0.2,
            transparent: true, opacity: 0.3, side: THREE.DoubleSide
        });
        const windscreen = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.02), windscreenMaterial);
        windscreen.position.set(0, 1.28, 0.58);
        windscreen.rotation.x = -0.28;
        windscreen.castShadow = true;
        this.group.add(windscreen);

        // Headlight set into the apron
        const headlightMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff, emissive: 0xffffee, emissiveIntensity: 0.8, roughness: 0.05, metalness: 0.3
        });
        this.headlight = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), headlightMaterial);
        this.headlight.scale.set(2.0, 0.7, 0.6);
        this.headlight.position.set(0, 0.85, 0.72);
        this.headlight.castShadow = true;
        this.group.add(this.headlight);

        // High handlebar behind the screen
        this.buildHandlebar({ y: 1.12, z: 0.55, width: 0.5 });
        const console = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.1, 0.14), trimMaterial);
        console.position.set(0, 1.04, 0.56);
        console.castShadow = true;
        this.group.add(console);

        // Big plush two-tier seat over the storage hump
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.6), leatherMaterial);
        seat.position.set(0, 0.86, -0.3);
        seat.castShadow = true;
        seat.receiveShadow = true;
        this.group.add(seat);
        const backrest = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.08), leatherMaterial);
        backrest.position.set(0, 0.98, -0.62);
        backrest.castShadow = true;
        this.group.add(backrest);

        // Rear bodywork tapering to the tail
        const tail = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.2, 0.25), bodyMaterial);
        tail.position.set(0, 0.68, -0.72);
        tail.castShadow = true;
        this.group.add(tail);

        // Mirrors up on stalks
        const mirrorMaterial = new THREE.MeshStandardMaterial({ color: 0x17171c, roughness: 0.45, metalness: 0.75 });
        const stalkGeometry = new THREE.CylinderGeometry(0.008, 0.008, 0.16, 6);
        const mirrorGeometry = new THREE.SphereGeometry(0.045, 10, 8);
        [-1, 1].forEach((side) => {
            const stalk = new THREE.Mesh(stalkGeometry, mirrorMaterial);
            stalk.position.set(side * 0.18, 1.2, 0.56);
            stalk.rotation.z = -side * 0.7;
            stalk.castShadow = true;
            this.group.add(stalk);
            const mirror = new THREE.Mesh(mirrorGeometry, mirrorMaterial);
            mirror.scale.set(1.3, 0.8, 0.45);
            mirror.position.set(side * 0.24, 1.26, 0.57);
            mirror.castShadow = true;
            this.group.add(mirror);
        });

        // Brake light across the tail
        this.buildBrakeLight(0, 0.76, -0.84);

        // Relaxed upright rider, feet forward on the floorboard
        this.buildVariantRider({
            y: 1.16, z: -0.18, torsoLean: 0.08,
            armDrop: 2.0, legBend: 1.05,
            suitColor: 0x3a3f4a, helmetColor: 0xe8e8e8
        });
    }

    // ---- Shane: orange motocross dirt bike ----
    buildDirtBike() {
        const bikeColorHex = parseInt(this.bikeColor);
        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: bikeColorHex, roughness: 0.4, metalness: 0.3
        });
        const darkMetalMaterial = new THREE.MeshStandardMaterial({
            color: 0x17171c, roughness: 0.45, metalness: 0.75
        });
        const plasticMaterial = new THREE.MeshStandardMaterial({
            color: 0xe8e8e8, roughness: 0.5, metalness: 0.1
        });
        const leatherMaterial = new THREE.MeshStandardMaterial({
            color: 0x141418, roughness: 0.9, metalness: 0.0
        });

        // Knobby tires on thin spoked wheels
        this.buildWheelSet({
            rearTireRadius: 0.28, rearTireWidth: 0.11,
            frontTireRadius: 0.3, frontTireWidth: 0.08,
            rimRadius: 0.15, spokeCount: 10, discRadius: 0.18, knobby: true
        });

        // Long-travel exposed motocross forks
        this.buildForkPair({ length: 0.78, x: 0.08, y: 0.62, z: 0.66, radius: 0.028, rake: 0.16 });
        const tripleClamp = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.1), darkMetalMaterial);
        tripleClamp.position.set(0, 0.95, 0.6);
        tripleClamp.castShadow = true;
        this.group.add(tripleClamp);

        // Slim frame spine (colour-feedback material)
        this.frame = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.95), bodyMaterial);
        this.frame.position.set(0, 0.7, 0.0);
        this.frame.castShadow = true;
        this.frame.receiveShadow = true;
        this.group.add(this.frame);

        // Compact engine
        this.engine = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.3, 0.35), darkMetalMaterial);
        this.engine.position.set(0, 0.46, 0.05);
        this.engine.castShadow = true;
        this.group.add(this.engine);

        // Small tank with radiator shrouds (contract fuelTank part)
        this.fuelTank = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.32), bodyMaterial);
        this.fuelTank.position.set(0, 0.92, 0.22);
        this.fuelTank.rotation.x = 0.12;
        this.fuelTank.castShadow = true;
        this.fuelTank.receiveShadow = true;
        this.group.add(this.fuelTank);
        const shroudGeometry = new THREE.BoxGeometry(0.04, 0.24, 0.34);
        const leftShroud = new THREE.Mesh(shroudGeometry, bodyMaterial);
        leftShroud.position.set(-0.15, 0.82, 0.28);
        leftShroud.rotation.y = 0.25;
        leftShroud.castShadow = true;
        this.group.add(leftShroud);
        const rightShroud = new THREE.Mesh(shroudGeometry, bodyMaterial);
        rightShroud.position.set(0.15, 0.82, 0.28);
        rightShroud.rotation.y = -0.25;
        rightShroud.castShadow = true;
        this.group.add(rightShroud);

        // High front mudguard pointing up over the wheel
        const frontGuard = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.55), bodyMaterial);
        frontGuard.position.set(0, 0.92, 0.8);
        frontGuard.rotation.x = 0.22;
        frontGuard.castShadow = true;
        this.group.add(frontGuard);

        // Rear high fender sweeping up off the tail
        const rearFender = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.5), bodyMaterial);
        rearFender.position.set(0, 0.96, -0.62);
        rearFender.rotation.x = -0.28;
        rearFender.castShadow = true;
        this.group.add(rearFender);

        // Long flat motocross seat into the tank
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.07, 0.65), leatherMaterial);
        seat.position.set(0, 0.92, -0.18);
        seat.castShadow = true;
        seat.receiveShadow = true;
        this.group.add(seat);

        // Number plate up front (no headlight fairing on a motocrosser)
        const numberPlate = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, 0.02), plasticMaterial);
        numberPlate.position.set(0, 1.0, 0.62);
        numberPlate.rotation.x = -0.2;
        numberPlate.castShadow = true;
        this.group.add(numberPlate);

        // Swingarm + high-mounted exhaust along the right side
        const swingarmGeometry = new THREE.BoxGeometry(0.04, 0.06, 0.55);
        const leftSwingarm = new THREE.Mesh(swingarmGeometry, darkMetalMaterial);
        leftSwingarm.position.set(-0.08, 0.32, -0.4);
        leftSwingarm.castShadow = true;
        this.group.add(leftSwingarm);
        const rightSwingarm = new THREE.Mesh(swingarmGeometry, darkMetalMaterial);
        rightSwingarm.position.set(0.08, 0.32, -0.4);
        rightSwingarm.castShadow = true;
        this.group.add(rightSwingarm);

        const exhaustGeometry = new THREE.CylinderGeometry(0.045, 0.055, 0.6, 12);
        exhaustGeometry.rotateX(Math.PI / 2);
        const exhaustMaterial = new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 0.3, metalness: 0.9 });
        const exhaust = new THREE.Mesh(exhaustGeometry, exhaustMaterial);
        exhaust.position.set(0.13, 0.72, -0.35);
        exhaust.rotation.x = 0.25;
        exhaust.castShadow = true;
        this.group.add(exhaust);

        // Wide motocross bar with crossbar pad
        this.buildHandlebar({ y: 1.12, z: 0.52, width: 0.6 });
        const crossbar = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.035, 0.035), bodyMaterial);
        crossbar.position.set(0, 0.05, 0);
        crossbar.castShadow = true;
        this.handlebar.add(crossbar);

        // Tiny enduro tail light
        this.buildBrakeLight(0, 1.04, -0.8, -0.28);

        // Attack-posture rider: up off the seat, leaning over the bars
        this.buildVariantRider({
            y: 1.3, z: -0.02, torsoLean: 0.45,
            armDrop: 2.1, legBend: 0.6,
            suitColor: 0x202228, helmetColor: 0xf07818
        });
    }

    update(deltaTime, steeringInput, throttleInput, brakeInput, wheelieInput = 0) {
        // Store inputs for use in updateMesh
        this.currentBrakeInput = brakeInput;
        this.currentDeltaTime = deltaTime;

        // Snapshot for render interpolation (fixed-timestep physics vs
        // variable-rate rendering: frames otherwise alternate between 1 and 2
        // physics steps and the bike visibly judders against the camera)
        if (!this.prevRenderPos) {
            this.prevRenderPos = this.position.clone();
            this.renderPosition = this.position.clone();
            this.renderYawAngle = this.yawAngle;
        } else {
            this.prevRenderPos.copy(this.position);
        }
        this.prevRenderYaw = this.yawAngle;

        // Track distance traveled (only when not crashed)
        if (!this.crashed && this.lastPosition) {
            const distanceDelta = this.position.distanceTo(this.lastPosition);
            this.distanceTraveled += distanceDelta;
        }
        this.lastPosition = this.position.clone();

        // Note: currentRoadSegment is now updated ONLY by the search-based methods
        // (checkWallCollision and updateElevation) which find the true closest segment.
        // The old Z-delta tracking was unreliable on curves and caused oscillation.
        
        // Check for wall/edge collision FIRST (even when crashed, in case we need to fall)
        if (!this.fallingOffCliff) {
            this.checkWallCollision();
        }
        
        if (this.crashed) {
            // If falling off cliff, apply gravity and check ground collision
            if (this.fallingOffCliff) {
                // Apply stronger gravity for dramatic falling
                this.velocity.y -= 15 * deltaTime;

                // Add air resistance (proportional to velocity squared, opposing motion)
                const airResistance = 0.1 * Math.abs(this.velocity.y) * this.velocity.y * deltaTime;
                if (this.velocity.y < 0) {
                    this.velocity.y -= airResistance; // Slow down falling speed
                }

                // Apply air resistance to horizontal movement too
                const horizontalSpeed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
                if (horizontalSpeed > 0.1) {
                    const dragFactor = 1 - (0.05 * horizontalSpeed * deltaTime);
                    this.velocity.x *= Math.max(dragFactor, 0.9);
                    this.velocity.z *= Math.max(dragFactor, 0.9);
                }

                // Update position
                this.position.x += this.velocity.x * deltaTime;
                this.position.y += this.velocity.y * deltaTime;
                this.position.z += this.velocity.z * deltaTime;

                // Tumble while airborne/sliding, slowing as energy bleeds off
                if (!this.hitGround && this.tumbleSpeed) {
                    this.tumbleAngle += this.tumbleSpeed * deltaTime;
                    this.tumbleRoll += this.tumbleSpeed * 0.6 * deltaTime;
                }

                // Check terrain collision - sample terrain height at current position
                const terrainHeight = this.getTerrainHeightAt(this.position.x, this.position.z);
                
                // Check if hit terrain or lake
                if (this.position.y <= terrainHeight + 0.5) {
                    // Hit the terrain/slope
                    this.position.y = terrainHeight + 0.5; // Place bike on terrain

                    // Hard impacts bounce the bike back off the hillside,
                    // kicking the tumble - it cartwheels down rather than stopping
                    if (this.velocity.y < -8) {
                        this.velocity.y = Math.abs(this.velocity.y) * 0.35;
                        this.tumbleSpeed = Math.min((this.tumbleSpeed || 3) * 1.3, 14);
                    }

                    // Ground contact scrubs tumble energy (only once it has
                    // actually descended - keep cartwheeling over the lip)
                    if (this.tumbleSpeed && this.fallStartY - this.position.y > 8) {
                        this.tumbleSpeed *= Math.max(0, 1 - 1.2 * deltaTime);
                        if (this.tumbleSpeed < 0.3) this.tumbleSpeed = 0;
                    }

                    // Calculate slope normal to determine slide direction
                    const slopeNormal = this.calculateSlopeNormal(this.position.x, this.position.z);
                    
                    // If on a steep slope, slide down it
                    const slopeAngle = Math.acos(slopeNormal.y);
                    const slopeDegrees = slopeAngle * 180 / Math.PI;
                    
                    if (slopeDegrees > 30) { // Steep slope - keep sliding
                        // Project velocity onto slope
                        const slideDirection = new THREE.Vector3(slopeNormal.x, 0, slopeNormal.z).normalize();
                        const slideSpeed = Math.max(5, this.speed * 0.7); // Maintain some sliding speed
                        
                        this.velocity.x = slideDirection.x * slideSpeed;
                        this.velocity.z = slideDirection.z * slideSpeed;
                        this.velocity.y = -Math.tan(slopeAngle) * slideSpeed * 0.5; // Slide downward
                        
                        // Apply friction
                        this.velocity.multiplyScalar(0.98);
                    } else if (this.fallStartY - this.position.y < 8) {
                        // Still on the flat shoulder at the cliff lip - keep
                        // the bike rolling outward so it carries over the edge
                        // and tumbles down the hill instead of stalling here
                        const hSpeed = Math.hypot(this.velocity.x, this.velocity.z);
                        if (hSpeed > 0.1 && hSpeed < 6) {
                            const boost = 6 / hSpeed;
                            this.velocity.x *= boost;
                            this.velocity.z *= boost;
                        }
                    } else {
                        // Gentle slope or flat - stop
                        this.velocity.multiplyScalar(0.85); // Quick stop
                        if (this.velocity.length() < 0.5) {
                            this.velocity.set(0, 0, 0);
                            this.speed = 0;
                            this.hitGround = true;
                        }
                    }

                    if (!this.groundHitLogged && this.hitGround) {
                        console.log('CRASHED! Hit the terrain after falling',
                            Math.abs(this.fallStartY - terrainHeight).toFixed(1) + ' meters');
                        this.groundHitLogged = true;
                    }
                }
            } else {
                // Normal crash - sliding on road
                this.position.add(this.velocity.clone().multiplyScalar(deltaTime));
                this.velocity.multiplyScalar(0.98); // Friction slows it down
            }
            
            this.speed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
            this.updateMesh();
            return;
        }
        
        // Update speed based on throttle/brake
        this.updateSpeed(deltaTime, throttleInput, brakeInput);

        // Update wheelie physics
        this.updateWheelie(deltaTime, throttleInput, brakeInput, wheelieInput, this.onWheelieScore);

        // Check for jump ramps
        if (!this.isJumping && this.environment && this.environment.jumpRamps) {
            for (const ramp of this.environment.jumpRamps) {
                const dx = this.position.x - ramp.position.x;
                const dz = this.position.z - ramp.position.z;
                
                // Rotate to ramp's local space
                const cos = Math.cos(-ramp.rotation);
                const sin = Math.sin(-ramp.rotation);
                const localX = dx * cos - dz * sin;
                const localZ = dx * sin + dz * cos;
                
                // Check if we're within ramp bounds
                const onRamp = Math.abs(localX) < ramp.width / 2 && 
                              localZ > -ramp.length / 2 && 
                              localZ < ramp.length / 2;
                
                if (onRamp && this.speed > 15) {
                    // Calculate height on ramp based on position
                    const rampProgress = (localZ + ramp.length / 2) / ramp.length;
                    let expectedHeight;
                    
                    if (rampProgress < 0.6) {
                        // Going up the ramp
                        expectedHeight = (rampProgress / 0.6) * ramp.height;
                    } else {
                        // Going down the ramp
                        expectedHeight = ramp.height * (1 - (rampProgress - 0.6) / 0.4);
                    }
                    
                    // Adjust bike height to follow ramp
                    const targetY = ramp.position.y + expectedHeight;
                    
                    // If we're on the upward part and high enough, initiate jump
                    if (rampProgress > 0.4 && rampProgress < 0.7 && expectedHeight > ramp.height * 0.7) {
                        this.initiateJump(ramp);
                        break;
                    } else if (!this.isJumping) {
                        // Smoothly follow ramp surface
                        this.position.y = this.position.y * 0.7 + targetY * 0.3;
                    }
                }
            }
        }
        
        // Handle jump physics
        if (this.isJumping) {
            this.updateJump(deltaTime, throttleInput, brakeInput);
        }
        
        // Check for low-speed fall (but not while jumping)
        if (!this.isJumping && this.speed < this.minSpeed) {
            this.crashed = true;
            this.crashAngle = this.leanAngle || 0.5; // Fall to the side
            this.frame.material.color.setHex(0xff6600); // Orange for low-speed fall
            console.log('CRASHED! Speed too low:', (this.speed * 2.237).toFixed(1) + ' mph');
        }

        // Debug: Log crash state
        if (this.crashed) {
            console.log('Bike is crashed, fallingOffCliff:', this.fallingOffCliff);
        }
        
        // Check for boulder collisions
        if (this.environment && this.environment.boulders) {
            for (const boulder of this.environment.boulders) {
                const dx = this.position.x - boulder.position.x;
                const dy = this.position.y - boulder.position.y;
                const dz = this.position.z - boulder.position.z;
                const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
                
                // Check if we hit the boulder (account for bike size)
                if (distance < boulder.radius + 1.0) {
                    this.crashed = true;
                    this.crashAngle = this.leanAngle || 0.5;
                    this.frame.material.color.setHex(0xff0000); // Red for collision

                    // Set crash velocity based on impact
                    const impactForce = this.speed * 0.5;
                    const impactDir = new THREE.Vector3(dx, 0, dz).normalize();
                    this.velocity = impactDir.multiplyScalar(impactForce);
                    this.velocity.y = 2; // Small upward force

                    console.log('CRASHED! Hit a boulder at', (this.speed * 2.237).toFixed(1) + ' mph');
                    break;
                }
            }
        }
        
        // Check for roadwork obstacle collisions (barriers, bulldozers, trucks)
        if (this.environment && this.environment.roadworkObstacles) {
            for (const obstacle of this.environment.roadworkObstacles) {
                const dx = this.position.x - obstacle.position.x;
                const dz = this.position.z - obstacle.position.z;

                // Simple box collision detection
                let collisionDistance;
                if (obstacle.type === 'barrier') {
                    collisionDistance = 2.0; // Barrier collision radius (reasonable for distant obstacles)
                } else if (obstacle.type === 'bulldozer') {
                    collisionDistance = 3.0; // Larger collision radius for bulldozer
                } else if (obstacle.type === 'worktruck') {
                    collisionDistance = 2.5; // Work truck collision radius
                } else if (obstacle.type === 'container') {
                    collisionDistance = 2.5; // Shipping container collision radius
                } else {
                    collisionDistance = 2;
                }

                const distance = Math.sqrt(dx * dx + dz * dz);

                if (distance < collisionDistance) {
                    this.crashed = true;
                    this.crashAngle = this.leanAngle || 0.5;
                    this.frame.material.color.setHex(0xFF8C00); // Dark orange for construction crash

                    // Set crash velocity based on impact
                    const impactForce = this.speed * 0.6;
                    const impactDir = new THREE.Vector3(dx, 0, dz).normalize();
                    this.velocity = impactDir.multiplyScalar(impactForce);
                    this.velocity.y = 1.5; // Small upward force

                    console.log('CRASHED! Hit construction', obstacle.type, 'at', (this.speed * 2.237).toFixed(1) + ' mph', 'distance:', distance.toFixed(2));
                    break;
                }
            }
        }

        // Check if bike has fallen through the road surface (especially when crashed on side)
        if (this.environment && this.environment.roadPath && !this.fallingOffCliff) {
            // Find closest road segment (windowed search - full scans here cost
            // O(roadPath) per physics tick)
            let closestSegment = null;
            let minDistanceSq = Infinity;
            const fallRange = this.getSegmentSearchRange();
            for (let i = fallRange.start; i <= fallRange.end; i++) {
                const segment = this.environment.roadPath[i];
                const dx = this.position.x - segment.x;
                const dz = this.position.z - segment.z;
                const distanceSq = dx * dx + dz * dz;
                if (distanceSq < minDistanceSq) {
                    minDistanceSq = distanceSq;
                    closestSegment = segment;
                }
            }

            if (closestSegment && this.position.y < closestSegment.y - 2.0) {
                // Bike is significantly below road surface - correct position
                this.position.y = closestSegment.y;
                this.velocity.y = Math.max(0, this.velocity.y); // Prevent downward velocity

                // If not already crashed, crash it now
                if (!this.crashed) {
                    this.crashed = true;
                    this.crashAngle = this.leanAngle || 0.5;
                    this.frame.material.color.setHex(0x8b4513); // Brown for ground collision
                }
            }
        }

        // Wall collision is now handled in checkWallCollision() - removed duplicate check

        // Update physics
        this.updatePhysics(deltaTime, steeringInput);
        
        // Check for crash from excessive lean
        if (Math.abs(this.leanAngle) > this.maxLeanAngle) {
            this.crashed = true;
            this.crashAngle = this.leanAngle;
            this.frame.material.color.setHex(0xff0000); // Red for high-speed crash
            console.log('CRASHED! Lean angle exceeded:', (this.leanAngle * 180/Math.PI).toFixed(1) + '°');
        }
        
        // Update position
        const forward = new THREE.Vector3(0, 0, 1);
        forward.applyEuler(new THREE.Euler(0, this.yawAngle, 0));
        this.velocity.copy(forward.multiplyScalar(this.speed));

        this.position.add(this.velocity.clone().multiplyScalar(deltaTime));

        // Update elevation to follow road
        const preElevationX = this.position.x;
        const preElevationZ = this.position.z;
        this.updateElevation();
        const postElevationX = this.position.x;
        const postElevationZ = this.position.z;

        // Wall collision already checked at the beginning of update()
        
        // Update 3D model
        this.updateMesh();
    }
    
    updateSpeed(deltaTime, throttleInput, brakeInput) {
        // Calculate road gradient effect
        let gradientForce = 0;
        if (this.environment && this.environment.roadPath) {
            // Find the road gradient by looking ahead and behind
            const lookDistance = 5; // meters
            let currentY = this.position.y;
            
            // Find point ahead
            const forward = new THREE.Vector3(0, 0, lookDistance);
            forward.applyEuler(new THREE.Euler(0, this.yawAngle, 0));
            const aheadPos = this.position.clone().add(forward);
            
            // Find elevation ahead (windowed search around current segment)
            let aheadY = currentY;
            let minDistSq = Infinity;
            const gradientRange = this.getSegmentSearchRange();
            for (let i = gradientRange.start; i <= gradientRange.end; i++) {
                const segment = this.environment.roadPath[i];
                const dx = aheadPos.x - segment.x;
                const dz = aheadPos.z - segment.z;
                const distSq = dx * dx + dz * dz;
                if (distSq < minDistSq) {
                    minDistSq = distSq;
                    aheadY = segment.y || 0;
                }
            }
            
            // Calculate gradient (rise over run)
            const gradient = (aheadY - currentY) / lookDistance;
            
            // Gravity component along the slope
            // Going uphill: negative force, going downhill: positive force
            gradientForce = -gradient * 9.81 * 0.3; // Scaled for gameplay
        }
        
        // Get weather physics multipliers
        const weatherMultipliers = this.weatherSystem ? this.weatherSystem.getPhysicsMultipliers() : {
            lateralFriction: 1.0,
            brakeForce: 1.0,
            acceleration: 1.0
        };

        // Apply throttle (reduced during wheelie for challenge)
        if (throttleInput > 0) {
            const wheeliePenalty = this.isWheelie ? 0.3 : 1.0; // Only 30% acceleration during wheelie
            this.speed += this.acceleration * throttleInput * deltaTime * wheeliePenalty * weatherMultipliers.acceleration;
        }

        // Apply brakes (reduced in bad weather)
        if (brakeInput > 0) {
            this.speed -= this.brakeForce * brakeInput * deltaTime * weatherMultipliers.brakeForce;
        }
        
        // Apply gradient force
        this.speed += gradientForce * deltaTime;
        
        // Air resistance (much reduced so you don't need constant throttle)
        const dragForce = 0.002 * this.speed * this.speed;
        this.speed -= dragForce * deltaTime;
        
        // Clamp speed
        this.speed = Math.max(0, Math.min(this.maxSpeed, this.speed));
    }

    updateWheelie(deltaTime, throttleInput, brakeInput, wheelieInput = 0, onWheelieScore = null) {
        // Simple debug to confirm method is called
        if (!this.wheelieDebugInit) {
            console.log('=== WHEELIE SYSTEM INITIALIZED ===');
            this.wheelieDebugInit = true;
        }

        // Only allow wheelies when on ground and not crashed
        if (this.crashed || this.isJumping) {
            this.wheelieAngle = 0;
            this.wheelieVelocity = 0;
            this.isWheelie = false;
            return;
        }



        // Detect wheelie initiation - ONLY with dedicated wheelie key, any speed
        const isWheelieKeyPressed = wheelieInput > 0;
        // Simple wheelie trigger - just need to press the key
        const canStartWheelie = isWheelieKeyPressed && !this.isWheelie;
        
        // Debug wheelie attempts
        if (wheelieInput > 0 && !this.wheelieDebugThrottle) {
            console.log('Wheelie attempt:');
            console.log('  Wheelie key pressed: Yes');
            console.log('  isWheelie:', this.isWheelie);
            console.log('  wheelieAngle:', this.wheelieAngle);
            console.log('  Can start?', canStartWheelie);
            this.wheelieDebugThrottle = true; // Only log once
            setTimeout(() => this.wheelieDebugThrottle = false, 1000); // Reset after 1 second
        }

        if (canStartWheelie && this.wheelieAngle < 0.001) {
            // Start wheelie with a stronger pop
            this.isWheelie = true;
            this.wheelieAngle = 0.05; // Start with more visible angle
            this.wheelieVelocity = 3.5 * (this.wheeliePopMult || 1); // Initial lift (character-dependent)
            this.wheelieStartTime = performance.now();
            this.wheelieScoreAccumulated = 0;
            console.log('===== WHEELIE STARTED! =====');
            console.log('Speed:', this.speed.toFixed(1) + 'm/s (' + (this.speed * 2.237).toFixed(1) + ' mph)');
        }

        if (this.isWheelie) {
            // SIMPLIFIED WHEELIE PHYSICS - More fun, less punishing
            
            const angleDegrees = this.wheelieAngle * 180 / Math.PI;
            
            // Natural gravity - wheelie wants to fall back down with progressive difficulty
            const gravityPull = 2.3 + (angleDegrees / 45) * 1.6; // 2.3-3.9 based on angle
            this.wheelieVelocity -= gravityPull * deltaTime;
            
            // Throttle control - main way to control wheelie after initiation
            if (throttleInput > 0) {
                // Progressive throttle response - more sensitive at higher angles
                const throttleSensitivity = (5.2 + (angleDegrees / 60) * 0.8) * (this.wheelieThrottleMult || 1);
                this.wheelieVelocity += throttleInput * throttleSensitivity * deltaTime;
            }
            
            // Brake brings it down - useful to save from crash
            if (brakeInput > 0) {
                // Progressive brake response - more effective at higher angles
                const brakePower = 5.5 + (angleDegrees / 60) * 1.5;
                this.wheelieVelocity -= brakeInput * brakePower * deltaTime;
            }
            
            // Note: Wheelie key (Space/Shift) is only used to START the wheelie
            // After that, use throttle (W) to maintain it
            
            // Update wheelie angle
            this.wheelieAngle += this.wheelieVelocity * deltaTime;
            
            // Check for backwards flip crash with warning zone
            const dangerAngleDegrees = 70; // Warning zone
            const crashAngleDegrees = 77; // Crash threshold
            
            if (angleDegrees >= crashAngleDegrees) {
                // CRASHED! Went too far back
                this.crashed = true;
                this.isWheelie = false;
                this.wheelieAngle = 0;
                this.wheelieVelocity = 0;
                console.log('WHEELIE CRASH! Flipped backwards at', angleDegrees.toFixed(1) + '°');
                return;
            } else if (angleDegrees >= dangerAngleDegrees) {
                // In danger zone - provide extra gravity assistance
                this.wheelieVelocity -= 0.5 * deltaTime;
            }
            
            // Don't clamp the angle - let it go all the way to crash
            // This allows the player to actually flip if they're not careful
            this.wheelieAngle = Math.max(0, this.wheelieAngle);

            // SIMPLE FUN SCORING - Just rack up points!
            const wheelieDuration = (performance.now() - this.wheelieStartTime) / 1000;
            
            // Base points based on angle - higher is better (risk vs reward)
            let pointsPerSecond = 20; // Base points
            
            if (angleDegrees >= 60) {
                // High angle - risky but rewarding!
                pointsPerSecond = 100;
            } else if (angleDegrees >= 40) {
                // Good angle
                pointsPerSecond = 60;
            } else if (angleDegrees >= 20) {
                // Decent angle
                pointsPerSecond = 40;
            }
            
            // Duration bonus - longer wheelies are worth more (1x to 2x after 6 seconds)
            const durationBonus = 1 + Math.min(wheelieDuration / 6, 1);

            // Speed bonus - faster is better
            const speedMph = this.speed * 2.237;
            const speedMultiplier = 1 + (speedMph / 100); // +1% per mph

            // Calculate points for this frame
            const pointsThisFrame = pointsPerSecond * deltaTime * durationBonus * speedMultiplier;

            if (onWheelieScore && pointsThisFrame > 0) {
                this.wheelieScoreAccumulated += pointsThisFrame;
                // Per-tick points are fractional (e.g. ~0.3 at 60Hz); accumulate
                // and award whole points so they aren't rounded away every tick
                this.wheeliePendingScore = (this.wheeliePendingScore || 0) + pointsThisFrame;
                const wholePoints = Math.floor(this.wheeliePendingScore);
                if (wholePoints > 0) {
                    this.wheeliePendingScore -= wholePoints;
                    onWheelieScore(wholePoints);
                }
            }

            // End wheelie if angle gets to zero or speed too low
            if (this.wheelieAngle <= 0 || this.speed < 5) {
                this.isWheelie = false;
                this.wheelieAngle = 0;
                this.wheelieVelocity = 0;
                const wheelieDuration = (performance.now() - this.wheelieStartTime) / 1000;
                
                // Final score summary
                const rating = this.wheelieScoreAccumulated > 500 ? 'AMAZING!' :
                              this.wheelieScoreAccumulated > 200 ? 'Great!' :
                              this.wheelieScoreAccumulated > 50 ? 'Good' : 'Practice more!';
                              
                console.log(`Wheelie ended! Duration: ${wheelieDuration.toFixed(1)}s | Score: ${Math.round(this.wheelieScoreAccumulated)} | ${rating}`);
                
                // Reset combo
                this.wheelieCombo = 1;
                this.wheeliePerfectFrames = 0;
            }

            // Reduced damping - less forgiving, requires more active control
            this.wheelieVelocity *= (1 - this.wheelieDamping * 0.3);
        } else if (this.wheelieAngle > 0) {
            // Gradually return to normal only if there's an angle to return from
            this.wheelieAngle *= 0.95;
            if (this.wheelieAngle < 0.01) {
                this.wheelieAngle = 0;
            }
        }
    }

    updatePhysics(deltaTime, steeringInput) {
        // Get weather physics multipliers
        const weatherMultipliers = this.weatherSystem ? this.weatherSystem.getPhysicsMultipliers() : {
            lateralFriction: 1.0,
            brakeForce: 1.0,
            acceleration: 1.0
        };

        // Steering visualization
        this.steeringAngle = steeringInput * 0.3;

        // Speed affects steering sensitivity (less sensitive at high speed)
        const speedFactor = Math.max(0.3, Math.min(1.0, 20 / this.speed));
        
        // THREE MAIN FORCES:
        
        // 1. STEERING TORQUE: Counter-steering effect (speed-dependent)
        // Higher speed = more gyroscopic stability = harder to lean
        // Increase torque when trying to return to upright from a lean
        let steeringTorque = -steeringInput * this.steeringForce * speedFactor;
        
        // Boost steering torque when actively steering against current lean (counter-steering)
        if (steeringInput !== 0 && Math.sign(steeringInput) !== Math.sign(this.leanAngle) && Math.abs(this.leanAngle) > 0.1) {
            steeringTorque *= 1.5; // 50% more responsive when counter-steering to upright
        }
        
        steeringTorque *= (1 - Math.abs(this.leanAngle) / this.maxLeanAngle);
        
        // 2. GRAVITY TORQUE: Always tries to increase lean (destabilizing)
        // Once leaning, gravity pulls the bike further over
        const gravityTorque = Math.sin(this.leanAngle) * 3.0;
        
        // 3. CENTRIPETAL TORQUE: From turning (can be stabilizing or destabilizing)
        // When turning, centripetal force at ground creates moment around CG
        // REDUCED BY WEATHER: Low grip means less centripetal force available
        let centripetalTorque = 0;
        if (Math.abs(this.leanAngle) > 0.01) {
            // Calculate turn rate from lean angle
            const leanFactor = Math.tan(Math.abs(this.leanAngle));
            const turnRadius = Math.max(8, (this.speed * this.speed) / (9.81 * leanFactor));
            const turnRate = this.speed / turnRadius;

            // Centripetal force opposes lean only in steady-state turn
            // This creates the balance point
            // Weather reduces available grip for turning
            centripetalTorque = -Math.sign(this.leanAngle) * turnRate * this.speed * 0.15 * weatherMultipliers.lateralFriction;
        }

        // 4. GYROSCOPIC RESISTANCE: Higher speed = more stability
        const gyroResistance = this.leanVelocity * this.speed * 0.02;

        // 5. SELF-RIGHTING TORQUE: Bike naturally tries to return upright
        // REDUCED BY WEATHER: Low grip means tire contact patch has less righting authority
        const selfRightingTorque = -this.leanAngle * 3.5 * weatherMultipliers.lateralFriction;

        // Total torque is sum of all forces
        const totalTorque = steeringTorque + gravityTorque + centripetalTorque - gyroResistance + selfRightingTorque;
        
        // Update lean velocity with small damping to prevent oscillation
        this.leanVelocity += totalTorque * deltaTime;
        
        // Apply stronger damping when returning to upright to reduce oscillation
        if (Math.abs(this.leanAngle) < 0.2 && Math.sign(this.leanVelocity) !== Math.sign(this.leanAngle)) {
            this.leanVelocity *= 0.95; // Stronger damping near center
        } else {
            this.leanVelocity *= 0.99;
        }
        
        // Update lean angle
        this.leanAngle += this.leanVelocity * deltaTime;
        
        // Turn based on lean angle - bike turns in direction of lean
        if (Math.abs(this.leanAngle) > 0.01) {
            // Realistic motorcycle turning physics
            // Turn radius = v²/(g*tan(lean_angle))
            // Simplified: larger radius for more realistic turning
            const leanFactor = Math.tan(Math.abs(this.leanAngle));
            const turnRadius = (this.speed * this.speed) / (9.81 * leanFactor);
            
            // Limit minimum turn radius to prevent unrealistic tight turns
            const minRadius = 8; // minimum 8 meter turn radius
            const actualRadius = Math.max(minRadius, turnRadius);
            
            const angularVel = this.speed / actualRadius;
            this.yawAngle -= angularVel * Math.sign(this.leanAngle) * deltaTime;
        }
        
    }

    updateMesh() {
        this.group.position.copy(this.position);
        this.group.rotation.y = this.yawAngle;
        this.meshNeedsBaseCapture = true;

        // Rider stands up over the jump and settles back on landing - an
        // eased blend rather than a pose snap
        if (this.riderBasePos) {
            const dt = this.currentDeltaTime || 1 / 60;
            const standTarget = (this.isJumping && !this.crashed) ? 1 : 0;
            const standRate = standTarget > this.riderStandFactor ? 5.5 : 4;
            this.riderStandFactor += (standTarget - this.riderStandFactor) *
                Math.min(1, standRate * dt);

            const stand = this.riderStandFactor;
            this.rider.position.y = this.riderBasePos.y + stand * this.riderStandHeight;
            this.rider.position.z = this.riderBasePos.z - stand * 0.05;
            // Unbend from the riding posture toward upright, knees braced
            this.rider.rotation.x = this.riderBaseRotX - stand * 0.4;
        }
        
        // Rotate wheels and discs based on speed
        if (!this.wheelRotation) this.wheelRotation = 0;
        const wheelCircumference = 2 * Math.PI * 0.3; // 2πr where r=0.3
        const rotationSpeed = this.speed / wheelCircumference;
        this.wheelRotation += rotationSpeed * (this.currentDeltaTime || 1/60);
        this.rearWheel.rotation.x = this.wheelRotation;
        this.frontWheel.rotation.x = this.wheelRotation;
        this.rearDisc.rotation.x = this.wheelRotation;
        this.frontDisc.rotation.x = this.wheelRotation;
        
        if (this.crashed) {
            if (this.fallingOffCliff && !this.hitGround && this.tumbleSpeed > 0) {
                // Cartwheeling down the hillside
                this.group.rotation.x = this.tumbleAngle;
                this.group.rotation.z = this.tumbleRoll;
                this.rider.rotation.z = 0;
                this.previousSpeed = this.speed;
                if (!this.meshBasePosition) {
                    this.meshBasePosition = new THREE.Vector3();
                }
                this.meshBasePosition.copy(this.group.position);
                return;
            }
            // Fall over animation
            this.group.rotation.z = this.crashAngle > 0 ? Math.PI/2 : -Math.PI/2;
            this.group.rotation.x = 0;
            // Only adjust height if not falling off cliff
            if (!this.fallingOffCliff) {
                // Adjust bike position so it sits properly on the ground when rotated
                this.group.position.y = this.position.y + 0.3;
            }
            this.rider.rotation.z = 0; // Rider doesn't lean when crashed
        } else if (this.isJumping) {
            // Jumping animation - forward rotation
            this.group.rotation.x = this.jumpRotation;
            this.group.rotation.z = this.leanAngle * 0.5; // Reduce lean while jumping
            this.rider.rotation.z = this.leanAngle * 0.1;
        } else if (this.isWheelie) {
            // Wheelie animation - pivot around center of rear wheel
            // Rear wheel center is at (0, 0.3, -0.7) in local space
            // Bike origin is at CG height (0.6m) above ground
            
            // Apply the rotation first
            this.group.rotation.x = -this.wheelieAngle; // Negative for wheelie (front up)
            
            // Calculate translation needed to keep rear wheel center fixed
            // Vector from bike origin to rear wheel center
            // Rear wheel center Y: 0.3 (above ground)
            // Bike origin Y: 0.6 (CG height above ground)
            // So offset from bike origin to wheel center: 0.3 - 0.6 = -0.3
            
            const angle = -this.wheelieAngle;
            const cosTheta = Math.cos(angle);
            const sinTheta = Math.sin(angle);
            
            // Original vector from origin to pivot point (rear wheel center)
            const pivotX = 0;
            const pivotY = 0.3 - this.cgHeight; // wheel center height - CG height = 0.3 - 0.6 = -0.3
            const pivotZ = -0.7; // rear wheel is 0.7m behind center
            
            // After rotation, this vector becomes:
            const rotatedY = pivotY * cosTheta - pivotZ * sinTheta;
            const rotatedZ = pivotY * sinTheta + pivotZ * cosTheta;
            
            // Translation needed to keep pivot point fixed
            this.group.position.y = this.position.y + (pivotY - rotatedY);
            this.group.position.z = this.position.z + (pivotZ - rotatedZ);
            
            // Apply lean (reduced during wheelie)
            this.group.rotation.z = this.leanAngle * 0.3; // Reduce lean during wheelie
            this.rider.rotation.z = this.leanAngle * 0.1;
            
            // Simple visual feedback - bike gets brighter during wheelie
            const angleDegrees = this.wheelieAngle * 180 / Math.PI;
            const brightness = 1.0 + (angleDegrees / 90) * 0.5; // Brighter as angle increases
            this.frame.material.color.setRGB(
                0.1 * brightness,
                0.4 * brightness,
                0.7 * brightness
            );
        } else {
            // Normal lean
            this.group.rotation.x = 0; // Reset pitch
            this.group.rotation.z = this.leanAngle;
            this.rider.rotation.z = this.leanAngle * 0.2; // Rider leans subtly

            // Restore normal bike color
            if (!this.crashed) {
                this.frame.material.color.setHex(parseInt(this.bikeColor));
            }
        }

        // Rotate front wheel for steering visualization
        this.frontWheel.rotation.y = this.steeringAngle * 0.5;

        // Brake light glow - light up when brake is pressed
        if (this.currentBrakeInput > 0) {
            this.brakeLight.material.emissive.setHex(0xff0000);
            this.brakeLight.material.emissiveIntensity = 1.0;
        } else {
            this.brakeLight.material.emissive.setHex(0x000000);
            this.brakeLight.material.emissiveIntensity = 0.0;
        }
        this.previousSpeed = this.speed;

        // Base position for render interpolation offsets
        if (!this.meshBasePosition) {
            this.meshBasePosition = new THREE.Vector3();
        }
        this.meshBasePosition.copy(this.group.position);
    }

    // Called once per rendered frame with the leftover fixed-timestep
    // fraction; places the mesh between the previous and current physics
    // states so motion stays smooth when frames span 0 or 2 physics steps
    applyRenderInterpolation(alpha) {
        if (!this.prevRenderPos || !this.meshBasePosition) return;

        const dx = this.position.x - this.prevRenderPos.x;
        const dy = this.position.y - this.prevRenderPos.y;
        const dz = this.position.z - this.prevRenderPos.z;

        // Teleport (reset/checkpoint restart) - snap instead of interpolating
        if (dx * dx + dy * dy + dz * dz > 25) {
            this.renderPosition.copy(this.position);
            this.group.position.copy(this.meshBasePosition);
            return;
        }

        const t = Math.min(Math.max(alpha, 0), 1);
        this.renderPosition.set(
            this.prevRenderPos.x + dx * t,
            this.prevRenderPos.y + dy * t,
            this.prevRenderPos.z + dz * t
        );

        // Interpolate heading as well - a stepped yaw reads as camera judder
        // in corners even when the position is smooth
        let dyaw = this.yawAngle - (this.prevRenderYaw !== undefined ? this.prevRenderYaw : this.yawAngle);
        if (dyaw > Math.PI) dyaw -= Math.PI * 2;
        else if (dyaw < -Math.PI) dyaw += Math.PI * 2;
        this.renderYawAngle = (this.prevRenderYaw !== undefined ? this.prevRenderYaw : this.yawAngle) + dyaw * t;
        this.group.rotation.y = this.renderYawAngle;

        // Shift the mesh by the interpolation offset relative to the physics
        // position (idempotent - rebased from meshBasePosition every call)
        this.group.position.set(
            this.meshBasePosition.x + (this.renderPosition.x - this.position.x),
            this.meshBasePosition.y + (this.renderPosition.y - this.position.y),
            this.meshBasePosition.z + (this.renderPosition.z - this.position.z)
        );
    }

    reset() {
        this.position.set(0, 0, 0);
        this.velocity.set(0, 0, 0);
        this.speed = 20;
        this.yawAngle = 0;
        this.steeringAngle = 0;
        this.leanAngle = 0;
        this.leanVelocity = 0;
        this.crashed = false;
        this.crashAngle = 0;
        this.isJumping = false;
        this.jumpVelocityY = 0;
        this.jumpStartHeight = 0;
        this.jumpRotation = 0;
        this.previousSpeed = 0;
        this.isWheelie = false;
        this.wheelieAngle = 0;
        this.wheelieVelocity = 0;
        this.wheelieBalance = 0;
        this.wheelieStartTime = 0;
        this.wheelieScoreAccumulated = 0;
        this.wheeliePendingScore = 0;
        this.wheelieCombo = 0;
        this.wheeliePerfectFrames = 0;
        this.wheelieLastInputTime = 0;
        this.currentRoadSegment = 0;
        this.segmentProgress = 0;
        this.wasNearEdge = false;
        this.fallingOffCliff = false;
        this.hitGround = false;
        this.tumbleSpeed = 0;
        this.tumbleAngle = 0;
        this.tumbleRoll = 0;
        this.fallStartY = 0;
        this.groundHitLogged = false;
        this.crashRecoveryTime = 0;
        this.crashPenaltyApplied = false;
        
        const bikeColorHex = parseInt(this.bikeColor);
        this.frame.material.color.setHex(bikeColorHex);
        this.fuelTank.material.color.setHex(bikeColorHex);
        this.group.rotation.set(0, 0, 0);
        this.updateMesh();
    }
    
    getTerrainHeightAt(x, z) {
        // Terrain model matching the rendered geometry: the road sits on a
        // cliff whose right face drops ~200 units over ~150 lateral units
        // (~53 degrees) down to the lake plane at y=-200. The old model kept
        // everything within 20 units at road height, so falling bikes tumbled
        // along an invisible plateau beside the road instead of following the
        // cliff down.
        const lakeLevel = -195; // Just above the rendered lake plane (-200)

        if (!this.environment || !this.environment.roadPath || this.environment.roadPath.length === 0) {
            return lakeLevel;
        }

        // Windowed nearest-segment search (this runs several times per tick
        // while falling - calculateSlopeNormal samples it 5x)
        let closest = null;
        let closestDistSq = Infinity;
        const terrainRange = this.getSegmentSearchRange(30);
        for (let i = terrainRange.start; i <= terrainRange.end; i++) {
            const point = this.environment.roadPath[i];
            const dx = x - point.x;
            const dz = z - point.z;
            const distSq = dx * dx + dz * dz;
            if (distSq < closestDistSq) {
                closestDistSq = distSq;
                closest = point;
            }
        }

        if (!closest) {
            return lakeLevel;
        }

        const roadY = closest.y || 0;

        // Signed lateral distance from the road centerline (positive = right,
        // toward the drop-off; negative = left, into the mountain wall)
        const perpX = Math.cos(closest.heading);
        const perpZ = -Math.sin(closest.heading);
        const lateral = (x - closest.x) * perpX + (z - closest.z) * perpZ;

        const halfRoad = this.environment.roadWidth ? this.environment.roadWidth / 2 : 8;
        const ledgeEnd = halfRoad + 2; // Road surface plus the 2m ledge

        if (lateral <= ledgeEnd) {
            // On the road/ledge, or on the left (mountain) side
            return roadY;
        }

        // Cliff face: steep descent matching the rendered drop-off
        const drop = (lateral - ledgeEnd) * 1.33;
        return Math.max(roadY - drop, lakeLevel);
    }
    
    calculateSlopeNormal(x, z) {
        // Calculate the normal vector of the terrain slope at this position
        const epsilon = 1.0; // Sample distance
        
        // Sample heights around the current position
        const h0 = this.getTerrainHeightAt(x, z);
        const hx1 = this.getTerrainHeightAt(x + epsilon, z);
        const hx2 = this.getTerrainHeightAt(x - epsilon, z);
        const hz1 = this.getTerrainHeightAt(x, z + epsilon);
        const hz2 = this.getTerrainHeightAt(x, z - epsilon);
        
        // Calculate gradients
        const dx = (hx1 - hx2) / (2 * epsilon);
        const dz = (hz1 - hz2) / (2 * epsilon);
        
        // Normal vector (perpendicular to slope)
        const normal = new THREE.Vector3(-dx, 1, -dz);
        normal.normalize();
        
        return normal;
    }

    getSpeed() {
        return this.crashed ? 0 : this.speed * 2.237; // Convert m/s to mph
    }

    getLeanAngleDegrees() {
        return this.leanAngle * 180 / Math.PI;
    }

    getSteeringAngleDegrees() {
        return this.steeringAngle * 180 / Math.PI;
    }
    
    getDistanceTraveled() {
        return this.distanceTraveled; // in meters
    }
    
    getDistanceTraveledKm() {
        return this.distanceTraveled / 1000; // in kilometers
    }

    setWeatherSystem(weatherSystem) {
        this.weatherSystem = weatherSystem;
    }

    getSegmentSearchRange(searchRadius = 10) {
        // Return a range of segments to search (nearby segments only)
        // This dramatically improves performance vs searching all segments

        if (!this.environment || !this.environment.roadPath || this.environment.roadPath.length === 0) {
            return { start: 0, end: 0 };
        }

        const pathLength = this.environment.roadPath.length;
        const start = Math.max(0, this.currentRoadSegment - searchRadius);
        const end = Math.min(pathLength - 1, this.currentRoadSegment + searchRadius);

        return { start, end };
    }

    findNearestRoadSegment() {
        // One-time full scan to re-sync segment tracking after a teleport
        // (reset, checkpoint restart). The per-frame searches are windowed
        // around currentRoadSegment, so a stale index after a teleport makes
        // wall/elevation checks use a segment far from the bike.
        if (!this.environment || !this.environment.roadPath || this.environment.roadPath.length === 0) {
            return 0;
        }

        let best = 0;
        let bestDistSq = Infinity;
        this.environment.roadPath.forEach((segment, index) => {
            const dx = this.position.x - segment.x;
            const dz = this.position.z - segment.z;
            const distSq = dx * dx + dz * dz;
            if (distSq < bestDistSq) {
                bestDistSq = distSq;
                best = index;
            }
        });

        this.currentRoadSegment = best;
        this.segmentProgress = 0;
        this.wasNearEdge = false;
        return best;
    }

    updateElevation() {
        // Skip elevation update when jumping
        if (this.isJumping) return;
        
        // Check if we're on a ramp before adjusting to road height
        if (this.environment && this.environment.jumpRamps) {
            for (const ramp of this.environment.jumpRamps) {
                const dx = this.position.x - ramp.position.x;
                const dz = this.position.z - ramp.position.z;
                
                // Rotate to ramp's local space
                const cos = Math.cos(-ramp.rotation);
                const sin = Math.sin(-ramp.rotation);
                const localX = dx * cos - dz * sin;
                const localZ = dx * sin + dz * cos;
                
                // Check if we're within ramp bounds
                const onRamp = Math.abs(localX) < ramp.width / 2 && 
                              localZ > -ramp.length / 2 && 
                              localZ < ramp.length / 2;
                
                if (onRamp) {
                    // Don't update elevation when on ramp - let the ramp detection handle it
                    return;
                }
            }
        }
        
        // Find nearest road segments and interpolate between them
        if (this.environment && this.environment.roadPath) {
            // Get search range (only search nearby segments for performance)
            const range = this.getSegmentSearchRange();

            // Find closest segment within search range
            let closest = { segment: null, distance: Infinity };
            let closestIndex = -1;

            for (let index = range.start; index <= range.end; index++) {
                const segment = this.environment.roadPath[index];
                const distance = Math.sqrt(
                    Math.pow(this.position.x - segment.x, 2) +
                    Math.pow(this.position.z - segment.z, 2)
                );

                if (distance < closest.distance) {
                    closest = { segment, distance };
                    closestIndex = index;
                }
            }
            
            if (closest.segment && closest.segment.y !== undefined) {
                let targetY = closest.segment.y;
                
                // If we have adjacent segments, interpolate for smoother transitions
                if (closestIndex > 0 && closestIndex < this.environment.roadPath.length - 1) {
                    const prevSegment = this.environment.roadPath[closestIndex - 1];
                    const nextSegment = this.environment.roadPath[closestIndex + 1];
                    
                    // Simple linear interpolation based on position along the road
                    const distToPrev = Math.sqrt(
                        Math.pow(this.position.x - prevSegment.x, 2) + 
                        Math.pow(this.position.z - prevSegment.z, 2)
                    );
                    const distToNext = Math.sqrt(
                        Math.pow(this.position.x - nextSegment.x, 2) + 
                        Math.pow(this.position.z - nextSegment.z, 2)
                    );
                    
                    if (distToPrev < distToNext && prevSegment.y !== undefined) {
                        // Closer to previous segment - interpolate between prev and current
                        const totalDist = distToPrev + closest.distance;
                        const weight = closest.distance / totalDist;
                        targetY = prevSegment.y * weight + closest.segment.y * (1 - weight);
                    } else if (nextSegment.y !== undefined) {
                        // Closer to next segment - interpolate between current and next
                        const totalDist = closest.distance + distToNext;
                        const weight = distToNext / totalDist;
                        targetY = closest.segment.y * weight + nextSegment.y * (1 - weight);
                    }
                }

                // Speed-adaptive elevation smoothing
                // At low speeds: smooth (0.15) to prevent bobbing
                // At high speeds: responsive (0.40) to prevent jitter from lag
                const speedRatio = Math.min(this.speed / 30, 1.0); // Normalize to 0-1 at 30 m/s
                const lerpFactor = 0.15 + (speedRatio * 0.25); // 0.15 at low speed, 0.40 at high speed
                this.position.y = this.position.y * (1 - lerpFactor) + targetY * lerpFactor;
            }
        }
    }
    
    checkWallCollision() {
        // Check if bike has gone off the road edges
        if (!this.environment) {
            console.log('ERROR: No environment set on vehicle');
            return;
        }
        if (!this.environment.roadPath) {
            console.log('ERROR: No roadPath in environment');
            return;
        }
        if (this.environment.roadPath.length === 0) {
            console.log('ERROR: Empty roadPath');
            return;
        }

        if (this.environment && this.environment.roadPath) {
            // Get search range (only search nearby segments for performance)
            const range = this.getSegmentSearchRange();

            // Use the closest segment for accurate perpDistance calculation
            let currentSegment = null;
            let minDistance = Infinity;

            for (let index = range.start; index <= range.end; index++) {
                const segment = this.environment.roadPath[index];
                const distance = Math.sqrt(
                    Math.pow(this.position.x - segment.x, 2) +
                    Math.pow(this.position.z - segment.z, 2)
                );

                if (distance < minDistance) {
                    minDistance = distance;
                    currentSegment = segment;
                    this.currentRoadSegment = index; // Update current segment
                }
            }

            if (currentSegment) {
                // Calculate perpendicular distance from road centerline
                // Use the same perpendicular calculation as environment.js
                const perpX = Math.cos(currentSegment.heading);
                const perpZ = -Math.sin(currentSegment.heading);
                const toVehicleX = this.position.x - currentSegment.x;
                const toVehicleZ = this.position.z - currentSegment.z;

                // Improved road boundary logic with hysteresis
                // Use environment's road width to calculate boundaries (scales with difficulty).
                // Thresholds match the rendered geometry: the road mesh extends
                // ~2m past the lane on the right (the ledge) and the rock wall
                // face starts ~1m past the lane on the left.
                const halfRoadWidth = this.environment.roadWidth / 2;
                const roadEdge = halfRoadWidth; // Edge of the road (matches actual road width)
                const safetyZone = halfRoadWidth + 2.0; // Safety zone - slow down but don't crash
                const cliffEdge = halfRoadWidth + 2.0; // Cliff edge - fall past the rendered ledge
                const wallBuffer = halfRoadWidth + 1.0; // Wall crash buffer - where the rock face starts

                // Dot product gives signed distance (positive = right of road, negative = left of road)
                const perpDistance = toVehicleX * perpX + toVehicleZ * perpZ;

                // Hysteresis to prevent oscillating between states
                const hysteresisBuffer = 0.5; // Half unit buffer
                const effectiveRoadEdge = this.wasNearEdge ? roadEdge - hysteresisBuffer : roadEdge;
                const effectiveSafetyZone = this.wasNearEdge ? safetyZone - hysteresisBuffer : safetyZone;
                const effectiveCliffEdge = this.wasNearEdge ? cliffEdge - hysteresisBuffer : cliffEdge;

                // Update hysteresis state
                this.wasNearEdge = Math.abs(perpDistance) > effectiveRoadEdge;

                // Check if we're on the ledge areas (slow down but don't crash)
                if (Math.abs(perpDistance) > effectiveRoadEdge && Math.abs(perpDistance) < effectiveSafetyZone) {
                    // On the edge/ledge - slow down but don't crash
                    this.speed *= 0.95; // Gradual speed reduction
                }
                
                // Check if we've hit the left cliff wall (negative perpDistance)
                if (perpDistance < -wallBuffer && !this.crashed) {
                    // Hit the cliff wall on the left - crash with bounce
                    this.crashed = true;
                    this.fallingOffCliff = false; // Not falling, we hit a wall
                    this.crashAngle = -Math.PI/6; // Crash leaning left into the wall
                    this.frame.material.color.setHex(0x8B0000); // Dark red for crash
                    console.log('CRASHED! Hit the left cliff wall at', (this.speed * 2.237).toFixed(1) + ' mph');
                    console.log('Left wall hit at distance:', perpDistance);

                    // Move bike back to wall position and apply bounce
                    const targetPerpDistance = -wallBuffer;
                    const adjustment = (targetPerpDistance - perpDistance);
                    this.position.x += perpX * adjustment;
                    this.position.z += perpZ * adjustment;

                    // Bounce off the wall - toward road center
                    const bounceDir = new THREE.Vector3(perpX, 0, perpZ); // Bounce back toward road center
                    this.velocity = bounceDir.multiplyScalar(this.speed * 0.2);
                    this.velocity.y = 0.5; // Small upward bounce
                }



                // Check if we've gone off the right cliff edge (positive perpDistance)
                if (perpDistance > effectiveCliffEdge && !this.crashed) {
                    console.log('=== FALLING OFF RIGHT CLIFF! ===');
                    console.log('perpDistance:', perpDistance, 'effectiveCliffEdge:', effectiveCliffEdge, 'cliffEdge:', cliffEdge);
                    console.log('Vehicle position:', this.position.x.toFixed(1), this.position.z.toFixed(1), 'Y:', this.position.y.toFixed(1));
                    console.log('CRASHED! Fell off the right cliff edge at', (this.speed * 2.237).toFixed(1) + ' mph');
                    this.crashed = true;
                    this.fallingOffCliff = true; // Fall off the right cliff edge
                    this.fallStartY = this.position.y;
                    this.groundHitLogged = false;
                    // Tumble end-over-end down the hill, faster with speed
                    this.tumbleAngle = 0;
                    this.tumbleRoll = 0;
                    this.tumbleSpeed = 3 + this.speed * 0.12;
                    this.crashAngle = -Math.PI/4; // Fall to the left after going off right edge
                    this.frame.material.color.setHex(0x8B0000); // Dark red for falling

                    // Continue forward momentum but start falling
                    this.velocity.y = -8; // Start falling downward
                }
            }
        }
    }
    
    initiateJump(ramp) {
        this.isJumping = true;
        this.jumpStartHeight = this.position.y;
        
        // Calculate jump velocity based on speed and ramp angle
        const jumpAngle = Math.atan2(ramp.height, ramp.length * 0.6); // Approximate ramp angle
        this.jumpVelocityY = Math.sin(jumpAngle) * this.speed * 0.6; // Even higher jump force

        // Better extra lift, scaled by the character's suspension (jump stat)
        this.jumpVelocityY += 2.5;
        this.jumpVelocityY *= this.jumpPowerMult || 1;

        // In-air attitude state: pitch carries angular momentum, and the rear
        // wheel's spin (built by throttle) is what torques the bike
        this.jumpRotation = 0;
        this.jumpAngularVel = 0;
        this.jumpWheelSpin = Math.min(this.speed / 50, 0.4); // Carry some spin off the ramp
        
        console.log('JUMPING! Speed:', (this.speed * 2.237).toFixed(1) + ' mph, Launch velocity:', this.jumpVelocityY.toFixed(1));
    }
    
    updateJump(deltaTime, throttleInput, brakeInput) {
        // Apply gravity
        this.jumpVelocityY -= 9.81 * deltaTime * 2; // Double gravity for arcade feel
        
        // Update vertical position
        this.position.y += this.jumpVelocityY * deltaTime;

        // In-air attitude control via the rear wheel's angular momentum:
        // holding throttle spins the wheel up over ~half a second, and that
        // building spin torques the bike nose-UP (reaction torque) - so a blip
        // barely moves it but a held throttle gradually tips it back. Braking
        // dumps the spin and pitches the nose down.
        this.jumpWheelSpin += throttleInput * 2.2 * deltaTime;
        this.jumpWheelSpin -= brakeInput * 4.5 * deltaTime;
        this.jumpWheelSpin = Math.max(0, Math.min(this.jumpWheelSpin, 1));

        // Torque: nose-up with wheel spin (negative rotation.x is front-up),
        // nose-down under braking
        const torque = -this.jumpWheelSpin * 2.6 + brakeInput * 1.6;
        this.jumpAngularVel = (this.jumpAngularVel || 0) + torque * deltaTime;
        // Light damping so the pitch carries momentum without running away
        this.jumpAngularVel *= Math.max(0, 1 - 0.5 * deltaTime);
        this.jumpRotation += this.jumpAngularVel * deltaTime;
        
        // Check for landing
        if (this.environment && this.environment.roadPath) {
            // Find the road height at current position (windowed search - jumps
            // travel forward, so use a wider window than the on-road checks)
            let targetRoadHeight = 0;
            let minDistanceSq = Infinity;

            const jumpRange = this.getSegmentSearchRange(25);
            for (let i = jumpRange.start; i <= jumpRange.end; i++) {
                const segment = this.environment.roadPath[i];
                const dx = this.position.x - segment.x;
                const dz = this.position.z - segment.z;
                const distanceSq = dx * dx + dz * dz;

                if (distanceSq < minDistanceSq) {
                    minDistanceSq = distanceSq;
                    targetRoadHeight = segment.y || 0;
                }
            }
            
            // Check if we've landed
            if (this.jumpVelocityY < 0 && this.position.y <= targetRoadHeight + 0.1) {
                this.land(targetRoadHeight);
            }
        }
        
        // Safety check - if we've been jumping too long, force landing
        if (this.position.y < this.jumpStartHeight - 10) {
            this.crashed = true;
            this.isJumping = false;
            this.jumpRotation = 0;
            console.log('CRASHED! Bad landing from jump');
        }
    }
    
    land(groundHeight) {
        this.isJumping = false;
        this.position.y = groundHeight;
        this.jumpVelocityY = 0;
        
        // Normalize rotation to -PI to PI range
        while (this.jumpRotation > Math.PI) this.jumpRotation -= Math.PI * 2;
        while (this.jumpRotation < -Math.PI) this.jumpRotation += Math.PI * 2;
        
        // Check landing quality based on rotation angle
        const landingAngle = Math.abs(this.jumpRotation);
        const landingSpeed = Math.abs(this.jumpVelocityY);
        
        // Good landing if bike is mostly level (within 45 degrees)
        if (landingAngle < Math.PI / 4) {
            console.log('Perfect landing! Angle:', (landingAngle * 180 / Math.PI).toFixed(0) + '°');
            this.jumpRotation = 0;
        } else if (landingAngle < Math.PI / 2) {
            // Rough but recoverable landing
            console.log('Rough landing! Angle:', (landingAngle * 180 / Math.PI).toFixed(0) + '°');
            this.jumpRotation = 0;
            // Slow down a bit from the hard landing
            this.speed *= 0.7;
        } else {
            // Bad angle - crash
            this.crashed = true;
            this.crashAngle = this.jumpRotation > 0 ? Math.PI/2 : -Math.PI/2;
            console.log('CRASHED! Bad landing angle:', (landingAngle * 180 / Math.PI).toFixed(0) + '°');
        }
    }
}