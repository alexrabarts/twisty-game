// Playable characters. Each entry defines the rider, their bike model variant
// (built by Vehicle.createMesh) and stat multipliers applied to the baseline
// Vehicle physics. stats are the 1-5 star ratings shown in the selection UI;
// physics are the multipliers actually applied to the handling model.
// `suspension` is the suspension-travel / offroad stat (1-5 stars in the UI).
// It replaces the old separate jump and comfort stats: the physics.suspension
// multiplier below drives jump/hop height, how big a rock the bike can ride
// over, and how much the ride shakes (more travel = smoother + clears more).
const CHARACTERS = [
    {
        id: 'steve',
        name: 'Steve',
        bikeLabel: 'Super Sports',
        bikeColor: '0xcc1111', // Red race plastics
        stats: { speed: 5, accel: 4, handling: 3, suspension: 1 },
        physics: {
            suspension: 0.6,       // Race-firm, short travel - harsh, no offroad
            maxSpeed: 1.10,        // 74.8 m/s top end
            acceleration: 1.10,    // 16.5 m/s²
            brakeForce: 1.05,      // 21 m/s²
            steeringForce: 1.0,    // 9.5 baseline
            wheeliePop: 1.3,       // Power wheelies come easily
            wheelieThrottle: 1.15
        }
    },
    {
        id: 'alex',
        name: 'Alex',
        bikeLabel: 'Adventure',
        bikeColor: '0xc9a227', // Sandy gold
        stats: { speed: 3, accel: 3, handling: 4, suspension: 4 },
        physics: {
            suspension: 1.25,      // Long-travel - soaks up bumps, clears most rocks
            maxSpeed: 1.0,         // 68 m/s
            acceleration: 1.0,     // 15 m/s²
            brakeForce: 1.05,      // 21 m/s²
            steeringForce: 1.1,    // 10.45 - wide bars
            wheeliePop: 1.0,
            wheelieThrottle: 1.0
        }
    },
    {
        id: 'tim',
        name: 'Tim',
        bikeLabel: 'Maxi Scooter',
        bikeColor: '0x8d96a8', // Executive silver-grey
        stats: { speed: 2, accel: 2, handling: 4, suspension: 2 },
        physics: {
            suspension: 0.85,      // Modest travel - smooth on tarmac, poor offroad
            maxSpeed: 0.75,        // 51 m/s
            acceleration: 0.8,     // 12 m/s² - smooth CVT
            brakeForce: 1.0,       // 20 m/s²
            steeringForce: 1.1,    // 10.45 - nimble at low speed
            wheeliePop: 0.75,
            wheelieThrottle: 0.9
        }
    },
    {
        id: 'shane',
        name: 'Shane',
        bikeLabel: 'Dirt Bike',
        bikeColor: '0xff6600', // KTM orange
        stats: { speed: 2, accel: 4, handling: 5, suspension: 5 },
        physics: {
            suspension: 1.5,       // Long MX travel - rolls over most debris, big air
            maxSpeed: 0.85,        // 57.8 m/s
            acceleration: 1.1,     // 16.5 m/s²
            brakeForce: 1.0,       // 20 m/s²
            steeringForce: 1.15,   // 10.93 - flickable
            wheeliePop: 1.2,
            wheelieThrottle: 1.1
        }
    },
    {
        id: 'casper',
        name: 'Casper',
        bikeLabel: 'Kids MX 50',
        bikeColor: '0x1565c0', // Bright blue
        stats: { speed: 1, accel: 2, handling: 5, suspension: 4 },
        physics: {
            suspension: 1.3,       // Little long-travel MX bike - soaks up bumps
            maxSpeed: 0.55,        // Tiny engine, very slow
            acceleration: 0.8,
            brakeForce: 1.0,
            steeringForce: 1.25,   // Featherweight, super flickable
            wheeliePop: 1.1,
            wheelieThrottle: 1.0
        }
    },
    {
        id: 'guy',
        name: 'Guy',
        bikeLabel: 'Streetfighter',
        bikeColor: '0x18181c', // Murdered-out black
        stats: { speed: 4, accel: 5, handling: 4, suspension: 3 },
        physics: {
            suspension: 1.0,
            maxSpeed: 1.05,        // 71 m/s
            acceleration: 1.2,     // Punchy naked-bike torque
            brakeForce: 1.05,
            steeringForce: 1.05,
            wheeliePop: 1.45,      // Torquey naked - the wheelie machine
            wheelieThrottle: 1.25
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
        this.wheeliePopMult = charPhysics.wheeliePop || 1;
        this.wheelieThrottleMult = charPhysics.wheelieThrottle || 1;

        // Suspension travel (offroad ability). One stat drives three things:
        //  - jump/hop power off ramps and obstacles
        //  - the biggest rock radius the bike can simply ride over (no crash)
        //  - how much the ride/camera shakes (inverse: more travel = smoother)
        this.suspension = charPhysics.suspension !== undefined ? charPhysics.suspension : 1;
        this.jumpPowerMult = this.suspension;
        this.rideOverRadius = 0.18 + 0.22 * this.suspension; // ~0.31m..0.51m
        this.suspensionShake = Math.max(0.3, 1.45 - 0.65 * this.suspension); // ~1.06..0.48

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
        // Yaw first, then pitch, then roll: with the default XYZ order the
        // wheelie/jump pitch (rotation.x) is applied in the WORLD frame, which
        // rolls the bike sideways on any heading not aligned with the Z axis
        this.group.rotation.order = 'YXZ';

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
            case 'casper':
                // Same MX bike as Shane, pint-sized. Scaling about the group
                // origin (ground level) keeps the wheels on the road.
                this.buildDirtBike();
                this.group.scale.setScalar(0.66);
                break;
            case 'guy':
                this.buildNakedBike();
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
        // ---- Steve: red supersport. Full race bodywork: lathe-turned tank,
        // extruded fairing panels with bevelled panel lines, 5-twin-spoke
        // alloys, drilled discs, twin upswept cans, race number roundels. ----
        const P = this.makeBikePalette(parseInt(localStorage.getItem('playerStripeColor') || '0xffffff'));
        this.stripeColor = localStorage.getItem('playerStripeColor') || '0xffffff';

        // Wheels: 5 twin-spoke alloys, fat rear slick, drilled discs
        this.buildWheelSet({
            rearTireRadius: 0.3, rearTireWidth: 0.16,
            frontTireRadius: 0.28, frontTireWidth: 0.12,
            rimRadius: 0.19, style: 'alloy', spokePairs: 5,
            discRadius: 0.15, caliperColor: 0xc42020, palette: P
        });

        // Upside-down forks with gold sliders + chrome stanchions
        this.buildForkPair({
            length: 0.52, x: 0.1, y: 0.55, z: 0.7, radius: 0.024, rake: 0.14,
            usd: true, sliderColor: 0xb8923e, palette: P
        });

        // ---- Frame: spine + twin-spar side beams (paint = feedback mat) ----
        this.frame = this.attachPart(new THREE.BoxGeometry(0.1, 0.16, 1.05), P.paint, 0, 0.62, 0.05);
        const sparGeometry = new THREE.BoxGeometry(0.035, 0.12, 0.55);
        this.attachPart(sparGeometry, P.paintDark, -0.14, 0.58, 0.12, { rx: 0.22 });
        this.attachPart(sparGeometry, P.paintDark, 0.14, 0.58, 0.12, { rx: 0.22 });

        // ---- Engine: block, angled cylinder bank, brushed covers ----
        this.engine = this.attachPart(new THREE.BoxGeometry(0.28, 0.26, 0.46), P.darkMetal, 0, 0.4, 0.06);
        this.attachPart(new THREE.BoxGeometry(0.26, 0.18, 0.22), P.steel, 0, 0.55, 0.24, { rx: -0.5 });
        // Clutch + alternator covers (brushed round cases)
        const caseGeometry = new THREE.CylinderGeometry(0.085, 0.085, 0.03, 14);
        this.attachPart(caseGeometry, P.steel, 0.15, 0.38, -0.04, { rz: Math.PI / 2 });
        this.attachPart(caseGeometry, P.steel, -0.15, 0.38, -0.04, { rz: Math.PI / 2 });
        const caseBossGeometry = new THREE.CylinderGeometry(0.035, 0.035, 0.014, 10);
        this.attachPart(caseBossGeometry, P.darkMetal, 0.168, 0.38, -0.04, { rz: Math.PI / 2 });
        this.attachPart(caseBossGeometry, P.darkMetal, -0.168, 0.38, -0.04, { rz: Math.PI / 2 });
        // Oil filter + sump
        this.attachPart(new THREE.CylinderGeometry(0.035, 0.035, 0.07, 10), P.steel, 0.06, 0.3, 0.3, { rx: Math.PI / 2 });
        this.attachPart(new THREE.BoxGeometry(0.22, 0.06, 0.3), P.darkMetal, 0, 0.27, 0.02);

        // ---- Radiator with horizontal fin slats + hoses ----
        this.radiator = this.attachPart(new THREE.BoxGeometry(0.26, 0.2, 0.04), P.darkMetal, 0, 0.48, 0.42, { rx: -0.3 });
        const finGeometry = new THREE.BoxGeometry(0.24, 0.01, 0.05);
        for (let i = 0; i < 5; i++) {
            const fin = new THREE.Mesh(finGeometry, P.steelDark);
            fin.position.set(0, -0.075 + i * 0.038, 0.004);
            fin.castShadow = true;
            this.radiator.add(fin);
        }
        this.addCable([[0.1, 0.56, 0.4], [0.13, 0.5, 0.3], [0.12, 0.46, 0.2]], 0.013, P.rubber);
        this.addCable([[-0.1, 0.4, 0.4], [-0.13, 0.36, 0.28], [-0.12, 0.36, 0.12]], 0.013, P.rubber);

        // ---- Swingarm, chain and sprockets ----
        const swingarmGeometry = new THREE.BoxGeometry(0.05, 0.08, 0.6);
        this.attachPart(swingarmGeometry, P.steelDark, -0.11, 0.31, -0.4);
        this.attachPart(swingarmGeometry, P.steelDark, 0.11, 0.31, -0.4);
        // Rear sprocket spins with the wheel
        const rearSprocket = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.016, 18), P.darkMetal);
        rearSprocket.rotation.z = Math.PI / 2;
        rearSprocket.position.set(-0.105, 0, 0);
        rearSprocket.castShadow = true;
        this.rearWheel.add(rearSprocket);
        const sprocketRing = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.02, 14), P.steel);
        rearSprocket.add(sprocketRing);
        this.attachPart(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 12), P.darkMetal, -0.135, 0.4, -0.02, { rz: Math.PI / 2 });
        // Chain runs with a guard over the top span
        this.attachPart(new THREE.BoxGeometry(0.016, 0.024, 0.64), P.darkMetal, -0.125, 0.42, -0.36, { rx: -0.06 });
        this.attachPart(new THREE.BoxGeometry(0.016, 0.024, 0.64), P.darkMetal, -0.125, 0.27, -0.36, { rx: -0.23 });
        this.attachPart(new THREE.BoxGeometry(0.03, 0.014, 0.3), P.paintDark, -0.125, 0.45, -0.42, { rx: -0.06 });

        // Monoshock: red spring coil (stacked tori) over a chrome shaft
        this.attachPart(new THREE.CylinderGeometry(0.014, 0.014, 0.3, 8), P.chrome, 0, 0.42, -0.29, { rx: 0.45 });
        const springGeometry = new THREE.TorusGeometry(0.036, 0.009, 5, 12);
        for (let i = 0; i < 4; i++) {
            this.attachPart(springGeometry, P.caliperRed,
                0, 0.36 + i * 0.045, -0.32 + i * 0.022, { rx: 0.45 + Math.PI / 2 });
        }

        // ---- Fuel tank: lathe-turned teardrop with filler cap + pad ----
        const tankGeometry = this.makeLathe([
            [0.0, 0.0], [0.15, 0.005], [0.205, 0.05], [0.225, 0.13],
            [0.205, 0.2], [0.15, 0.26], [0.06, 0.3], [0.0, 0.31]
        ], 18);
        this.fuelTank = this.attachPart(tankGeometry, P.paint, 0, 0.72, 0.16,
            { rx: 0.06, sx: 0.95, sy: 1.0, sz: 1.55 });
        this.attachPart(new THREE.CylinderGeometry(0.035, 0.04, 0.012, 10), P.chrome, 0, 1.025, 0.1);
        this.attachPart(new THREE.BoxGeometry(0.1, 0.012, 0.16), P.leather, 0, 0.985, -0.04, { rx: 0.22 });

        // Racing stripe hugging the tank curvature (narrow lathe shell)
        const stripeShell = this.makeLathe([
            [0.0, -0.002], [0.152, 0.004], [0.208, 0.05], [0.228, 0.13],
            [0.208, 0.2], [0.152, 0.26], [0.06, 0.302], [0.0, 0.312]
        ], 18);
        this.tankStripe = this.attachPart(stripeShell, P.accent, 0, 0.72, 0.16,
            { rx: 0.06, sx: 0.2, sy: 1.0, sz: 1.55 });

        // Knee recesses: dark sculpted panels flush in the tank flanks
        const kneePanelGeometry = new THREE.SphereGeometry(0.1, 12, 8);
        this.attachPart(kneePanelGeometry, P.paintDark, -0.16, 0.82, 0.08, { sx: 0.45, sy: 0.85, sz: 1.35 });
        this.attachPart(kneePanelGeometry, P.paintDark, 0.16, 0.82, 0.08, { sx: 0.45, sy: 0.85, sz: 1.35 });

        // ---- Front fairing: nose cone + bevelled extruded side panels ----
        const noseGeometry = new THREE.ConeGeometry(0.22, 0.55, 18);
        noseGeometry.rotateX(Math.PI / 2);
        this.frontFairing = this.attachPart(noseGeometry, P.paint, 0, 0.76, 0.64, { rx: 0.1, sx: 0.9, sy: 1.25 });
        this.attachPart(new THREE.SphereGeometry(0.24, 18, 12), P.paint, 0, 0.78, 0.4, { sx: 0.8, sy: 1.1, sz: 1.35 });

        // Main side fairing panels: extruded with bevelled panel edges
        const sideFairingGeometry = this.makePanel([
            [0.66, 0.88], [0.78, 0.72], [0.74, 0.55],
            [0.55, 0.36, 0.34, 0.32], [0.05, 0.3], [-0.06, 0.42],
            [0.1, 0.6, 0.3, 0.72]
        ], 0.05, 0.014);
        this.leftSideFairing = this.attachPart(sideFairingGeometry, P.paint, -0.195, 0, 0, { ry: 0.06 });
        this.rightSideFairing = this.attachPart(sideFairingGeometry, P.paint, 0.195, 0, 0, { ry: -0.06 });

        // Lower fairing panels in the darker two-tone shade
        const lowerFairingGeometry = this.makePanel([
            [0.5, 0.42], [0.58, 0.3], [0.46, 0.2], [-0.08, 0.2], [-0.16, 0.3], [-0.02, 0.4]
        ], 0.045, 0.012);
        this.attachPart(lowerFairingGeometry, P.paintDark, -0.155, 0, 0, { ry: 0.05 });
        this.attachPart(lowerFairingGeometry, P.paintDark, 0.155, 0, 0, { ry: -0.05 });

        // Panel lines: recessed dark seams between the panel groups
        const seamGeometry = new THREE.BoxGeometry(0.012, 0.014, 0.52);
        this.attachPart(seamGeometry, P.darkMetal, -0.21, 0.46, 0.22, { rx: 0.12 });
        this.attachPart(seamGeometry, P.darkMetal, 0.21, 0.46, 0.22, { rx: 0.12 });

        // Belly pan closing off the underside
        const bellyGeometry = new THREE.CylinderGeometry(0.16, 0.16, 0.78, 14);
        bellyGeometry.rotateX(Math.PI / 2);
        this.attachPart(bellyGeometry, P.paintDark, 0, 0.31, 0.1, { sy: 0.55 });

        // Decal flashes on the fairing flanks in the stripe colour
        const decalGeometry = new THREE.BoxGeometry(0.012, 0.07, 0.36);
        this.attachPart(decalGeometry, P.accent, -0.235, 0.62, 0.26, { rx: -0.2, ry: 0.08 });
        this.attachPart(decalGeometry, P.accent, 0.235, 0.62, 0.26, { rx: -0.2, ry: -0.08 });

        // Race number roundels on the tail flanks
        const roundelGeometry = new THREE.CircleGeometry(0.07, 16);
        const numberGeometry = new THREE.BoxGeometry(0.006, 0.07, 0.024);
        this.attachPart(roundelGeometry, P.plate, -0.185, 0.9, -0.42, { ry: -Math.PI / 2 });
        this.attachPart(roundelGeometry, P.plate, 0.185, 0.9, -0.42, { ry: Math.PI / 2 });
        this.attachPart(numberGeometry, P.darkMetal, -0.19, 0.9, -0.42);
        this.attachPart(numberGeometry, P.darkMetal, 0.19, 0.9, -0.42);

        // ---- Lights ----
        const headlightGeometry = new THREE.SphereGeometry(0.05, 10, 8);
        this.headlight = this.attachPart(headlightGeometry, P.headlight, -0.07, 0.74, 0.85, { sx: 1.2, sy: 0.65, sz: 0.6 });
        this.attachPart(headlightGeometry, P.headlight, 0.07, 0.74, 0.85, { sx: 1.2, sy: 0.65, sz: 0.6 });
        // Ram-air intakes flanking the nose
        const intakeGeometry = new THREE.BoxGeometry(0.07, 0.1, 0.05);
        this.attachPart(intakeGeometry, P.vent, -0.11, 0.62, 0.8, { ry: 0.3 });
        this.attachPart(intakeGeometry, P.vent, 0.11, 0.62, 0.8, { ry: -0.3 });

        // ---- Tail: upswept cowl + number plate + tail tidy ----
        const tailGeometry = new THREE.ConeGeometry(0.15, 0.55, 14);
        tailGeometry.rotateX(-Math.PI / 2);
        this.tailSection = this.attachPart(tailGeometry, P.paint, 0, 0.92, -0.6, { rx: 0.3, sx: 1.05, sy: 0.8 });
        this.attachPart(new THREE.SphereGeometry(0.17, 14, 10), P.paint, 0, 0.9, -0.38, { sx: 1.05, sy: 0.72, sz: 1.6 });
        this.attachPart(new THREE.BoxGeometry(0.2, 0.12, 0.42), P.paintDark, 0, 0.8, -0.48, { rx: 0.3 });
        // Tail tidy: licence plate + hanger + plate light
        this.attachPart(new THREE.BoxGeometry(0.02, 0.16, 0.04), P.darkMetal, 0, 0.62, -0.76, { rx: 0.5 });
        this.attachPart(new THREE.BoxGeometry(0.15, 0.09, 0.008), P.plate, 0, 0.55, -0.8, { rx: 0.25 });
        this.attachPart(new THREE.BoxGeometry(0.04, 0.012, 0.02), P.headlight, 0, 0.61, -0.79);

        // Seat: stitched leather pad stepped down from the tank
        const seatGeometry = new THREE.CapsuleGeometry(0.1, 0.28, 4, 12);
        seatGeometry.rotateX(Math.PI / 2);
        this.seat = this.attachPart(seatGeometry, P.leather, 0, 0.86, -0.06, { sx: 1.4, sy: 0.5 });
        this.attachPart(new THREE.BoxGeometry(0.16, 0.008, 0.26), P.steelDark, 0, 0.905, -0.06);

        // Brake light recessed in the tail tip (contract part)
        this.buildBrakeLight(0, 0.99, -0.84, 0.3);

        // ---- Windscreen: double-bubble + emissive dash ----
        const windscreenGeometry = new THREE.SphereGeometry(0.24, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2.4);
        this.windscreen = this.attachPart(windscreenGeometry, P.glass, 0, 0.98, 0.44, { rx: 0.95, sx: 0.75, sy: 1.05, sz: 1.1 });
        this.attachPart(new THREE.BoxGeometry(0.16, 0.05, 0.08), P.darkMetal, 0, 0.93, 0.52, { rx: -0.5 });
        this.attachPart(new THREE.BoxGeometry(0.12, 0.035, 0.008), P.dash, 0, 0.95, 0.55, { rx: -0.5 });

        // ---- Cockpit: clip-ons, triple clamps, mirrors, steering damper ----
        this.buildHandlebar({ y: 1.0, z: 0.6, width: 0.46, mirrors: true, cables: true, palette: P });
        this.attachPart(new THREE.BoxGeometry(0.26, 0.05, 0.09), P.steelDark, 0, 0.8, 0.68);
        this.attachPart(new THREE.BoxGeometry(0.24, 0.04, 0.08), P.steelDark, 0, 0.7, 0.69);
        this.attachPart(new THREE.CylinderGeometry(0.014, 0.014, 0.18, 8), P.darkMetal, 0.08, 0.84, 0.62, { rz: Math.PI / 2, ry: 0.4 });

        // Front fender: curved carbon arc + brace
        const fenderGeometry = new THREE.CylinderGeometry(0.34, 0.34, 0.14, 14, 1, true, 0.5, 2.0);
        fenderGeometry.rotateZ(Math.PI / 2);
        this.frontFender = this.attachPart(fenderGeometry, P.carbon, 0, 0.3, 0.7);
        this.attachPart(new THREE.BoxGeometry(0.18, 0.012, 0.05), P.carbon, 0, 0.62, 0.71);
        // Rear hugger over the back tire, rotated forward (~60deg past the old
        // 1.4) so it sits over the front-top of the wheel toward the swingarm,
        // the way a real hugger hangs - not draped over the back.
        const huggerGeometry = new THREE.CylinderGeometry(0.345, 0.345, 0.16, 12, 1, true, 0.35, 1.5);
        huggerGeometry.rotateZ(Math.PI / 2);
        this.attachPart(huggerGeometry, P.carbon, 0, 0.3, -0.7);

        // ---- Exhaust: twin headers into upswept lathe-turned cans ----
        this.addCable([[0.07, 0.46, 0.34], [0.12, 0.3, 0.3], [0.13, 0.24, 0.0], [0.14, 0.3, -0.3], [0.15, 0.42, -0.42]], 0.022, P.steel);
        this.addCable([[-0.07, 0.46, 0.34], [-0.12, 0.3, 0.3], [-0.13, 0.24, 0.0], [-0.14, 0.3, -0.3], [-0.15, 0.42, -0.42]], 0.022, P.steel);
        const canGeometry = this.makeLathe([
            [0.0, 0.0], [0.045, 0.0], [0.06, 0.05], [0.062, 0.32],
            [0.05, 0.44], [0.035, 0.47], [0.0, 0.47]
        ], 14);
        canGeometry.rotateX(-Math.PI / 2); // muzzle to the rear
        this.leftExhaust = this.attachPart(canGeometry, P.chrome, -0.16, 0.43, -0.32, { rx: 0.32 });
        this.rightExhaust = this.attachPart(canGeometry, P.chrome, 0.16, 0.43, -0.32, { rx: 0.32 });
        const tipGeometry = new THREE.CylinderGeometry(0.04, 0.046, 0.04, 12);
        tipGeometry.rotateX(Math.PI / 2);
        const canStrapGeometry = new THREE.TorusGeometry(0.064, 0.008, 5, 12);
        [this.leftExhaust, this.rightExhaust].forEach((can) => {
            const tip = new THREE.Mesh(tipGeometry, P.darkMetal);
            tip.position.set(0, 0, -0.47);
            tip.castShadow = true;
            can.add(tip);
            const strap = new THREE.Mesh(canStrapGeometry, P.darkMetal);
            strap.position.set(0, 0, -0.2);
            strap.castShadow = true;
            can.add(strap);
        });

        // Footpegs with hangers + heel guards, and a side stand
        const footpegGeometry = new THREE.BoxGeometry(0.08, 0.02, 0.04);
        this.attachPart(footpegGeometry, P.steel, -0.21, 0.43, -0.13);
        this.attachPart(footpegGeometry, P.steel, 0.21, 0.43, -0.13);
        const hangerGeometry = new THREE.BoxGeometry(0.015, 0.12, 0.05);
        this.attachPart(hangerGeometry, P.steelDark, -0.17, 0.5, -0.12, { rz: 0.3 });
        this.attachPart(hangerGeometry, P.steelDark, 0.17, 0.5, -0.12, { rz: -0.3 });
        const heelGeometry = new THREE.BoxGeometry(0.01, 0.07, 0.1);
        this.attachPart(heelGeometry, P.carbon, -0.2, 0.49, -0.2);
        this.attachPart(heelGeometry, P.carbon, 0.2, 0.49, -0.2);
        // Side stand: foot angles down-and-OUT (away from the bike). rz was
        // positive, which kicked the foot inward under the bike.
        this.attachPart(new THREE.CylinderGeometry(0.011, 0.011, 0.3, 8), P.steelDark, -0.16, 0.18, 0.05, { rz: -0.55, rx: 0.25 });
        this.attachPart(new THREE.BoxGeometry(0.05, 0.014, 0.05), P.steelDark, -0.3, 0.045, 0.09);

        // ---- Rider: full racing tuck with aero hump and knee sliders ----
        this.buildVariantRider({
            y: 1.06, z: -0.08, torsoLean: 0.72,
            suitColor: 0x16161c, suitAccent: P.paintHex,
            helmetColor: 0xf0f0f2, helmetAccent: P.paintHex, style: 'race',
            hand: [0.19, -0.06, 0.68], foot: [0.21, -0.63, -0.05],
            elbowOut: 0.05, kneeOut: 0.06, kneeForward: 0.13
        });
    }

    // ---- Shared construction helpers for the bike model variants ----

    // Per-bike material palette. `paint` is the colour-feedback material owned
    // by this.frame and shared by every painted panel, so crash flashes and
    // the wheelie brightness tint sweep the whole bodywork at once. Materials
    // are created per bike instance and never shared between bikes.
    makeBikePalette(accentHex = 0xffffff) {
        const paintHex = parseInt(this.bikeColor);
        const darkShade = new THREE.Color(paintHex).multiplyScalar(0.3);
        return {
            paintHex,
            accentHex,
            paint: new THREE.MeshStandardMaterial({
                color: paintHex, roughness: 0.14, metalness: 0.68, envMapIntensity: 1.6
            }),
            paintDark: new THREE.MeshStandardMaterial({
                color: darkShade, roughness: 0.32, metalness: 0.6, envMapIntensity: 1.1
            }),
            accent: new THREE.MeshStandardMaterial({
                color: accentHex, roughness: 0.18, metalness: 0.75,
                emissive: accentHex, emissiveIntensity: 0.05, envMapIntensity: 1.5
            }),
            chrome: new THREE.MeshStandardMaterial({
                color: 0xe4e6ea, roughness: 0.05, metalness: 1.0, envMapIntensity: 2.2
            }),
            steel: new THREE.MeshStandardMaterial({
                color: 0x9aa0a6, roughness: 0.42, metalness: 0.95, envMapIntensity: 1.0
            }),
            steelDark: new THREE.MeshStandardMaterial({
                color: 0x55585e, roughness: 0.55, metalness: 0.9
            }),
            darkMetal: new THREE.MeshStandardMaterial({
                color: 0x17171c, roughness: 0.45, metalness: 0.75
            }),
            carbon: new THREE.MeshStandardMaterial({
                color: 0x121317, roughness: 0.35, metalness: 0.55, envMapIntensity: 1.2,
                side: THREE.DoubleSide
            }),
            rubber: new THREE.MeshStandardMaterial({
                color: 0x161616, roughness: 0.96, metalness: 0.0
            }),
            leather: new THREE.MeshStandardMaterial({
                color: 0x141418, roughness: 0.92, metalness: 0.0
            }),
            plastic: new THREE.MeshStandardMaterial({
                color: 0xe9e9ea, roughness: 0.5, metalness: 0.08
            }),
            plate: new THREE.MeshStandardMaterial({
                color: 0xf5f5f0, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide
            }),
            glass: new THREE.MeshStandardMaterial({
                color: 0x18242f, roughness: 0.04, metalness: 0.25, envMapIntensity: 2.0,
                transparent: true, opacity: 0.32, side: THREE.DoubleSide
            }),
            headlight: new THREE.MeshStandardMaterial({
                color: 0xffffff, emissive: 0xffffee, emissiveIntensity: 0.85,
                roughness: 0.05, metalness: 0.3
            }),
            dash: new THREE.MeshStandardMaterial({
                color: 0x0c1016, emissive: 0x3fa8d6, emissiveIntensity: 0.65,
                roughness: 0.2, metalness: 0.2
            }),
            vent: new THREE.MeshStandardMaterial({
                color: 0x0a0a0c, roughness: 0.9, metalness: 0.1
            }),
            caliperRed: new THREE.MeshStandardMaterial({
                color: 0xc42020, roughness: 0.4, metalness: 0.5
            })
        };
    }

    // Creates a mesh with shadows on, places it, parents it and returns it.
    attachPart(geometry, material, x, y, z,
        { rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, parent = this.group } = {}) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(x, y, z);
        mesh.rotation.x = rx;
        mesh.rotation.y = ry;
        mesh.rotation.z = rz;
        if (sx !== 1 || sy !== 1 || sz !== 1) mesh.scale.set(sx, sy, sz);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        parent.add(mesh);
        return mesh;
    }

    // Surface of revolution (around local Y) from [radius, y] profile pairs.
    makeLathe(profile, segments = 16) {
        return new THREE.LatheGeometry(
            profile.map((p) => new THREE.Vector2(p[0], p[1])), segments);
    }

    // Bevelled extruded panel from a [z, y] outline in bike side view.
    // Entries of length 4 are quadratic curves: [controlZ, controlY, z, y].
    // The slab thickness runs across X centred on x=0 so one geometry serves
    // both flanks of the bike.
    makePanel(outline, thickness, bevel = 0.012) {
        const shape = new THREE.Shape();
        shape.moveTo(-outline[0][0], outline[0][1]);
        for (let i = 1; i < outline.length; i++) {
            const p = outline[i];
            if (p.length === 4) shape.quadraticCurveTo(-p[0], p[1], -p[2], p[3]);
            else shape.lineTo(-p[0], p[1]);
        }
        shape.closePath();
        const geometry = new THREE.ExtrudeGeometry(shape, {
            depth: thickness, bevelEnabled: true, bevelThickness: bevel,
            bevelSize: bevel, bevelSegments: 2, steps: 1, curveSegments: 5
        });
        geometry.rotateY(Math.PI / 2);
        geometry.translate(-thickness / 2, 0, 0);
        return geometry;
    }

    // Thin cable/hose/pipe swept along a smooth curve through [x, y, z] points.
    addCable(points, radius = 0.008, material, parent = this.group) {
        const curve = new THREE.CatmullRomCurve3(
            points.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
        const cable = new THREE.Mesh(new THREE.TubeGeometry(curve, 8, radius, 5, false), material);
        cable.castShadow = true;
        parent.add(cable);
        return cable;
    }

    // Capsule limb segment between two joints, aligned via quaternion so the
    // rider reads as properly articulated rather than posed boxes.
    addLimb(parent, material, radius, ax, ay, az, bx, by, bz) {
        const dx = bx - ax, dy = by - ay, dz = bz - az;
        const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const limb = new THREE.Mesh(
            new THREE.CapsuleGeometry(radius, Math.max(0.02, length - radius * 0.6), 3, 8),
            material
        );
        limb.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
        limb.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            new THREE.Vector3(dx / length, dy / length, dz / length)
        );
        limb.castShadow = true;
        limb.receiveShadow = true;
        parent.add(limb);
        return limb;
    }

    // Builds front + rear wheel groups at the contract positions, with
    // round-profile torus tires, a per-bike rim style ('alloy' five twin
    // spokes / 'wire' laced spokes / 'solid' covered discs), drilled brake
    // discs and calipers. Adds everything to this.group.
    buildWheelSet({
        rearTireRadius = 0.3, rearTireWidth = 0.15,
        frontTireRadius = 0.28, frontTireWidth = 0.12,
        rimRadius = 0.18, style = 'alloy', spokePairs = 5, wireSpokes = 12,
        knobby = false, knobCount = 18,
        discRadius = 0.25, frontDiscRadius = null,
        rimColor = 0xb6b9bf, caliperColor = 0xc42020, palette = null
    } = {}) {
        const P = palette || this.makeBikePalette();
        const rimMaterial = new THREE.MeshStandardMaterial({
            color: rimColor, roughness: 0.22, metalness: 0.92, envMapIntensity: 1.6
        });

        const makeWheel = (tireRadius, tireWidth) => {
            const wheel = new THREE.Group();
            const tube = tireWidth / 2;

            const tireGeometry = new THREE.TorusGeometry(tireRadius - tube, tube, 9, 22);
            tireGeometry.rotateY(Math.PI / 2); // spin axis along x
            const tire = new THREE.Mesh(tireGeometry, P.rubber);
            tire.castShadow = true;
            tire.receiveShadow = true;
            wheel.add(tire);

            if (knobby) {
                // Knobby tread blocks in two offset rows; one shared geometry
                const knobGeometry = new THREE.BoxGeometry(tireWidth * 0.45, 0.032, 0.045);
                for (let i = 0; i < knobCount; i++) {
                    const angle = (i * Math.PI * 2) / knobCount;
                    const knob = new THREE.Mesh(knobGeometry, P.rubber);
                    const row = (i % 2 === 0) ? -tireWidth * 0.24 : tireWidth * 0.24;
                    knob.position.set(row, Math.cos(angle) * tireRadius, Math.sin(angle) * tireRadius);
                    knob.rotation.x = -angle;
                    knob.castShadow = true;
                    wheel.add(knob);
                }
            }

            const innerRadius = tireRadius - tube * 2;
            if (style === 'solid') {
                // Covered scooter wheel: full disc, recessed vents, hub cap
                const cover = new THREE.Mesh(
                    new THREE.CylinderGeometry(innerRadius + 0.03, innerRadius + 0.03, tireWidth * 0.7, 18),
                    rimMaterial
                );
                cover.rotation.z = Math.PI / 2;
                cover.castShadow = true;
                wheel.add(cover);
                const ventGeometry = new THREE.CylinderGeometry(0.018, 0.018, tireWidth * 0.74, 6);
                for (let i = 0; i < 6; i++) {
                    const a = (i * Math.PI * 2) / 6;
                    const vent = new THREE.Mesh(ventGeometry, P.darkMetal);
                    vent.rotation.z = Math.PI / 2;
                    vent.position.set(0, Math.cos(a) * innerRadius * 0.62, Math.sin(a) * innerRadius * 0.62);
                    wheel.add(vent);
                }
                const capGeometry = new THREE.SphereGeometry(0.05, 10, 8);
                const cap = new THREE.Mesh(capGeometry, P.chrome);
                cap.scale.set(0.55, 1, 1);
                cap.position.set(tireWidth * 0.36, 0, 0);
                cap.castShadow = true;
                wheel.add(cap);
            } else {
                // Rim barrel just inside the tire bead
                const rim = new THREE.Mesh(
                    new THREE.CylinderGeometry(innerRadius + 0.025, innerRadius + 0.025, tireWidth * 0.78, 18, 1, true),
                    rimMaterial
                );
                rim.rotation.z = Math.PI / 2;
                rim.castShadow = true;
                wheel.add(rim);
                // Rim lips
                const lipGeometry = new THREE.TorusGeometry(innerRadius + 0.02, 0.011, 5, 18);
                lipGeometry.rotateY(Math.PI / 2);
                [-1, 1].forEach((side) => {
                    const lip = new THREE.Mesh(lipGeometry, rimMaterial);
                    lip.position.set(side * tireWidth * 0.39, 0, 0);
                    lip.castShadow = true;
                    wheel.add(lip);
                });

                if (style === 'wire') {
                    // Laced wire spokes: thin through-rods radiating in the
                    // wheel disc (fan around the X axle), alternating a small
                    // lateral lean for the cross-laced look
                    const spokeGeometry = new THREE.CylinderGeometry(0.0045, 0.0045, innerRadius * 2 + 0.03, 5);
                    for (let i = 0; i < wireSpokes; i++) {
                        const spoke = new THREE.Mesh(spokeGeometry, P.chrome);
                        spoke.rotation.x = (i * Math.PI * 2) / wireSpokes;
                        spoke.rotation.z = (i % 2 === 0 ? 0.1 : -0.1); // Lean toward the hub flanges
                        spoke.castShadow = true;
                        wheel.add(spoke);
                    }
                    const wireHub = new THREE.Mesh(
                        new THREE.CylinderGeometry(0.055, 0.055, tireWidth * 0.6 + 0.05, 12), rimMaterial);
                    wireHub.rotation.z = Math.PI / 2;
                    wireHub.castShadow = true;
                    wheel.add(wireHub);
                } else {
                    // Alloy: five twin-spoke pairs (through-bars radiating in
                    // the wheel disc, slight angular gap between the twins)
                    const spokeGeometry = new THREE.BoxGeometry(0.018, innerRadius * 2 + 0.02, 0.028);
                    for (let i = 0; i < spokePairs; i++) {
                        for (let s = -1; s <= 1; s += 2) {
                            const spoke = new THREE.Mesh(spokeGeometry, rimMaterial);
                            spoke.rotation.x = (i * Math.PI) / spokePairs + s * 0.07;
                            spoke.castShadow = true;
                            wheel.add(spoke);
                        }
                    }
                    const hub = new THREE.Mesh(
                        new THREE.CylinderGeometry(0.06, 0.06, tireWidth * 0.85, 12), rimMaterial);
                    hub.rotation.z = Math.PI / 2;
                    hub.castShadow = true;
                    wheel.add(hub);
                }
                // Valve stem
                const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.025, 5), P.darkMetal);
                valve.position.set(tireWidth * 0.34, innerRadius * 0.8, 0.03);
                wheel.add(valve);
            }

            wheel.castShadow = true;
            wheel.receiveShadow = true;
            return wheel;
        };

        this.rearWheel = makeWheel(rearTireRadius, rearTireWidth);
        this.rearWheel.position.set(0, 0.3, -0.7);
        this.frontWheel = makeWheel(frontTireRadius, frontTireWidth);
        this.frontWheel.position.set(0, 0.3, 0.7);
        this.group.add(this.rearWheel);
        this.group.add(this.frontWheel);

        // Drilled floating discs (contract: rotation.x is spun by updateMesh)
        const fDiscRadius = frontDiscRadius || discRadius;
        this.rearDisc = this.makeBrakeDisc(discRadius, P);
        this.rearDisc.position.set(0.09, 0.3, -0.7);
        this.frontDisc = this.makeBrakeDisc(fDiscRadius, P);
        this.frontDisc.position.set(0.09, 0.3, 0.7);
        this.group.add(this.rearDisc);
        this.group.add(this.frontDisc);

        // Calipers gripping the disc edges
        const caliperMaterial = new THREE.MeshStandardMaterial({
            color: caliperColor, roughness: 0.38, metalness: 0.55, envMapIntensity: 1.2
        });
        this.addCaliper(0.105, 0.3 - discRadius * 0.55, -0.7 + discRadius * 0.5, caliperMaterial, P);
        this.addCaliper(0.105, 0.3 - fDiscRadius * 0.55, 0.7 - fDiscRadius * 0.5, caliperMaterial, P);
    }

    // Brake disc with carrier and a ring of drilled-look holes
    makeBrakeDisc(radius, P) {
        const discMaterial = new THREE.MeshStandardMaterial({
            color: 0xb9bcc2, roughness: 0.32, metalness: 1.0, envMapIntensity: 1.4
        });
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.012, 22), discMaterial);
        disc.rotation.z = Math.PI / 2;
        disc.castShadow = true;
        disc.receiveShadow = true;
        const carrier = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.45, radius * 0.45, 0.018, 12), P.darkMetal);
        carrier.castShadow = true;
        disc.add(carrier);
        const holeGeometry = new THREE.CylinderGeometry(0.01, 0.01, 0.018, 5);
        for (let i = 0; i < 8; i++) {
            const a = (i * Math.PI * 2) / 8;
            const hole = new THREE.Mesh(holeGeometry, P.darkMetal);
            hole.position.set(Math.cos(a) * radius * 0.74, 0, Math.sin(a) * radius * 0.74);
            disc.add(hole);
        }
        return disc;
    }

    // Brake caliper body with pad ribs, static at group level
    addCaliper(x, y, z, caliperMaterial, P) {
        const caliper = this.attachPart(new THREE.BoxGeometry(0.05, 0.085, 0.13), caliperMaterial, x, y, z);
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.02, 0.02), P.darkMetal);
        rib.position.set(0, 0.01, 0.035);
        caliper.add(rib);
        const rib2 = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.02, 0.02), P.darkMetal);
        rib2.position.set(0, 0.01, -0.035);
        caliper.add(rib2);
        return caliper;
    }

    // Builds the left/right fork legs (stanchion + slider + axle clamp) and
    // adds them to this.group, plus a front axle. usd puts the thick slider
    // tube on top (modern inverted forks); gaiters adds rubber bellows.
    buildForkPair({
        length = 0.5, x = 0.1, y = 0.55, z = 0.7, radius = 0.025, rake = 0,
        usd = false, sliderColor = 0x8b8f96, gaiters = false, guards = false,
        guardMaterial = null, palette = null
    } = {}) {
        const P = palette || this.makeBikePalette();
        const stanchionMaterial = new THREE.MeshStandardMaterial({
            color: 0xd9dbdf, roughness: 0.08, metalness: 1.0, envMapIntensity: 2.0
        });
        const sliderMaterial = new THREE.MeshStandardMaterial({
            color: sliderColor, roughness: 0.3, metalness: 0.85, envMapIntensity: 1.4
        });

        const buildLeg = (side) => {
            const leg = new THREE.Mesh(
                new THREE.CylinderGeometry(radius, radius, length, 10), stanchionMaterial);
            leg.position.set(side * x, y, z);
            // Rake tilts the fork so the axle sits AHEAD of the steering head
            // (bottom forward, top back). A positive rotation.x did the reverse
            // - the old forks raked backwards - so negate it.
            leg.rotation.x = -rake;
            leg.castShadow = true;
            leg.receiveShadow = true;
            // Thick outer tube over half the leg
            const sleeve = new THREE.Mesh(
                new THREE.CylinderGeometry(radius * 1.55, radius * 1.55, length * 0.52, 10), sliderMaterial);
            sleeve.position.set(0, usd ? length * 0.24 : -length * 0.24, 0);
            sleeve.castShadow = true;
            leg.add(sleeve);
            // Axle clamp foot
            const clamp = new THREE.Mesh(new THREE.BoxGeometry(radius * 2.6, 0.06, 0.05), P.steelDark);
            clamp.position.set(0, -length / 2 + 0.02, 0);
            clamp.castShadow = true;
            leg.add(clamp);
            if (gaiters) {
                const gaiterGeometry = new THREE.TorusGeometry(radius * 1.7, 0.013, 5, 10);
                gaiterGeometry.rotateX(Math.PI / 2);
                for (let i = 0; i < 4; i++) {
                    const ring = new THREE.Mesh(gaiterGeometry, P.rubber);
                    ring.position.set(0, -length * 0.08 - i * 0.05, 0);
                    ring.castShadow = true;
                    leg.add(ring);
                }
            }
            if (guards) {
                const guardGeometry = new THREE.CylinderGeometry(
                    radius * 2.3, radius * 2.6, length * 0.5, 8, 1, true, -Math.PI / 2, Math.PI);
                const guard = new THREE.Mesh(guardGeometry, guardMaterial || P.plastic);
                guard.position.set(0, -length * 0.2, 0.01);
                guard.castShadow = true;
                leg.add(guard);
            }
            this.group.add(leg);
            return leg;
        };

        this.leftFork = buildLeg(-1);
        this.rightFork = buildLeg(1);
        // Front axle across the wheel hub
        this.attachPart(new THREE.CylinderGeometry(0.016, 0.016, x * 2 + 0.1, 8), P.chrome,
            0, 0.3, 0.7, { rz: Math.PI / 2 });
    }

    // Full articulated rider: torso + chest panel, helmet with visor and
    // vents, two-segment arms with gloves, two-segment legs with boots, all
    // children of this.rider so the lean (rotation.z) and the jump stand-up
    // animation (position/rotation.x driven from riderBasePos in updateMesh)
    // move the whole body. torsoLean is baked into the torso geometry so
    // rotation.x stays free for the stand-up blend.
    buildVariantRider({
        y = 1.15, z = -0.1, torsoLean = 0.15,
        suitColor = 0x141418, suitAccent = 0x3a414d,
        helmetColor = 0xf0f0f0, helmetAccent = 0xffffff,
        style = 'road',
        hand = [0.19, -0.05, 0.6], foot = [0.2, -0.66, -0.05],
        elbowOut = 0.07, kneeOut = 0.05, kneeForward = 0.16
    } = {}) {
        const suitMaterial = new THREE.MeshStandardMaterial({
            color: suitColor, roughness: 0.85, metalness: 0.0
        });
        const accentMaterial = new THREE.MeshStandardMaterial({
            color: suitAccent, roughness: 0.6, metalness: 0.15
        });
        const gloveMaterial = new THREE.MeshStandardMaterial({
            color: 0x101014, roughness: 0.9, metalness: 0.0
        });
        const helmetMaterial = new THREE.MeshStandardMaterial({
            color: helmetColor, roughness: 0.12, metalness: 0.35, envMapIntensity: 1.8
        });
        const helmetAccentMaterial = new THREE.MeshStandardMaterial({
            color: helmetAccent, roughness: 0.2, metalness: 0.4
        });
        const visorMaterial = new THREE.MeshStandardMaterial({
            color: 0x0e1218, roughness: 0.06, metalness: 0.45, envMapIntensity: 2.0
        });

        // Torso with the riding lean baked into the geometry (rotation stays
        // free for the lean/stand-up animation channels)
        const torsoGeometry = new THREE.CapsuleGeometry(0.13, 0.3, 4, 12);
        torsoGeometry.rotateX(torsoLean);
        this.rider = new THREE.Mesh(torsoGeometry, suitMaterial);
        this.rider.position.set(0, y, z);
        this.rider.castShadow = true;
        this.rider.receiveShadow = true;

        // Torso axis and facing direction for placing attachments
        const dY = Math.cos(torsoLean), dZ = Math.sin(torsoLean);
        const fY = -dZ, fZ = dY; // forward (chest) direction

        // Chest panel: contrast leathers/jacket front
        const chestGeometry = new THREE.CapsuleGeometry(0.115, 0.24, 3, 10);
        chestGeometry.rotateX(torsoLean);
        const chest = new THREE.Mesh(chestGeometry, accentMaterial);
        chest.scale.set(1.0, 1.0, 0.62);
        chest.position.set(0, fY * 0.075, fZ * 0.075);
        chest.castShadow = true;
        this.rider.add(chest);

        // Waist belt ring
        const beltGeometry = new THREE.TorusGeometry(0.142, 0.018, 5, 12);
        const belt = new THREE.Mesh(beltGeometry, gloveMaterial);
        belt.rotation.x = torsoLean - Math.PI / 2;
        belt.position.set(0, dY * -0.13, dZ * -0.13);
        this.rider.add(belt);

        if (style === 'race') {
            // Aero hump on the back of the leathers
            const hump = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), suitMaterial);
            hump.scale.set(1.0, 1.3, 1.1);
            hump.position.set(0, dY * 0.16 - fY * 0.1, dZ * 0.16 - fZ * 0.1);
            hump.castShadow = true;
            this.rider.add(hump);
        }

        // ---- Helmet: shell, visor, vents, accent stripe ----
        const headY = dY * 0.31, headZ = dZ * 0.31;
        this.helmet = new THREE.Mesh(new THREE.SphereGeometry(0.125, 16, 12), helmetMaterial);
        this.helmet.position.set(0, headY + fY * 0.03, headZ + fZ * 0.03);
        this.helmet.castShadow = true;
        this.rider.add(this.helmet);

        this.visor = new THREE.Mesh(new THREE.SphereGeometry(0.105, 12, 8), visorMaterial);
        this.visor.scale.set(1.08, 0.62, 0.55);
        this.visor.position.set(0, headY + fY * 0.1 - dY * 0.005, headZ + fZ * 0.1);
        this.visor.castShadow = true;
        this.rider.add(this.visor);

        // Crown stripe sweeping front-to-back + top vents
        const crestGeometry = new THREE.TorusGeometry(0.112, 0.016, 5, 10, Math.PI);
        const crest = new THREE.Mesh(crestGeometry, helmetAccentMaterial);
        crest.rotation.y = -Math.PI / 2;
        crest.rotation.x = torsoLean - 0.2;
        crest.position.set(0, this.helmet.position.y + 0.008, this.helmet.position.z);
        crest.castShadow = true;
        this.rider.add(crest);
        const ventGeometry = new THREE.BoxGeometry(0.035, 0.014, 0.05);
        [-0.045, 0.045].forEach((vx) => {
            const vent = new THREE.Mesh(ventGeometry, visorMaterial);
            vent.position.set(vx, this.helmet.position.y + dY * 0.065, this.helmet.position.z + dZ * 0.065 - fZ * 0.04);
            vent.rotation.x = torsoLean;
            this.rider.add(vent);
        });
        // Chin bar
        const chin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.06), helmetMaterial);
        chin.position.set(0, this.helmet.position.y - dY * 0.09 + fY * 0.075, this.helmet.position.z - dZ * 0.09 + fZ * 0.075);
        chin.rotation.x = torsoLean;
        chin.castShadow = true;
        this.rider.add(chin);
        if (style === 'mx') {
            // Motocross peak above the visor
            const peak = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.012, 0.12), helmetAccentMaterial);
            peak.position.set(0, this.helmet.position.y + dY * 0.075 + fY * 0.07, this.helmet.position.z + dZ * 0.075 + fZ * 0.07);
            peak.rotation.x = torsoLean - 0.35;
            peak.castShadow = true;
            this.rider.add(peak);
            // Goggle strap around the shell
            const strapGeometry = new THREE.TorusGeometry(0.122, 0.012, 4, 12);
            const strap = new THREE.Mesh(strapGeometry, accentMaterial);
            strap.rotation.x = torsoLean - 0.15;
            strap.position.set(0, this.helmet.position.y, this.helmet.position.z);
            this.rider.add(strap);
        }

        // ---- Arms: shoulder -> elbow -> glove, both sides ----
        const armRadius = 0.046, forearmRadius = 0.04;
        [-1, 1].forEach((side) => {
            const sx = side * 0.15, sy = dY * 0.17, sz = dZ * 0.17;
            const hx = side * hand[0], hy = hand[1], hz = hand[2];
            const elbowX = (sx + hx) / 2 + side * elbowOut;
            const elbowY = (sy + hy) / 2 - 0.02;
            const elbowZ = (sz + hz) / 2 - 0.03;
            // Shoulder armor cap
            const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), accentMaterial);
            shoulder.position.set(sx, sy, sz);
            shoulder.castShadow = true;
            this.rider.add(shoulder);
            const upper = this.addLimb(this.rider, suitMaterial, armRadius, sx, sy, sz, elbowX, elbowY, elbowZ);
            const lower = this.addLimb(this.rider, suitMaterial, forearmRadius, elbowX, elbowY, elbowZ, hx, hy, hz);
            const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.044, 8, 6), suitMaterial);
            elbow.position.set(elbowX, elbowY, elbowZ);
            elbow.castShadow = true;
            this.rider.add(elbow);
            const glove = new THREE.Mesh(new THREE.SphereGeometry(0.046, 8, 6), gloveMaterial);
            glove.scale.set(0.9, 0.75, 1.25);
            glove.position.set(hx, hy, hz);
            glove.castShadow = true;
            this.rider.add(glove);
            if (side < 0) { this.leftArm = upper; this.leftForearm = lower; }
            else { this.rightArm = upper; this.rightForearm = lower; }
        });

        // ---- Legs: hip -> knee -> boot, both sides ----
        [-1, 1].forEach((side) => {
            const px = side * 0.095, py = dY * -0.16, pz = dZ * -0.16;
            const fx = side * foot[0], fy = foot[1], fz = foot[2];
            const kx = (px + fx) / 2 + side * kneeOut;
            const ky = (py + fy) / 2 + 0.03;
            const kz = (pz + fz) / 2 + kneeForward;
            const thigh = this.addLimb(this.rider, suitMaterial, 0.062, px, py, pz, kx, ky, kz);
            this.addLimb(this.rider, suitMaterial, 0.05, kx, ky, kz, fx, fy, fz);
            const knee = new THREE.Mesh(new THREE.SphereGeometry(0.058, 8, 6),
                (style === 'race' || style === 'mx') ? accentMaterial : suitMaterial);
            knee.position.set(kx, ky, kz);
            knee.castShadow = true;
            this.rider.add(knee);
            // Boot with contrast sole; taller shaft for mx
            const bootHeight = style === 'mx' ? 0.13 : 0.075;
            const boot = new THREE.Mesh(new THREE.BoxGeometry(0.085, bootHeight, 0.21), gloveMaterial);
            boot.position.set(fx, fy + bootHeight / 2 - 0.025, fz + 0.045);
            boot.rotation.x = 0.12;
            boot.castShadow = true;
            this.rider.add(boot);
            const sole = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.018, 0.22), accentMaterial);
            sole.position.set(fx, fy - 0.03, fz + 0.045);
            sole.rotation.x = 0.12;
            this.rider.add(sole);
            if (side < 0) this.leftLeg = thigh; else this.rightLeg = thigh;
        });

        this.group.add(this.rider);
    }

    // Brake light helper - emissive red lens in a dark housing, toggled by
    // updateMesh() (contract: this.brakeLight.material.emissive)
    buildBrakeLight(x, y, z, tiltX = 0) {
        const brakeMaterial = new THREE.MeshStandardMaterial({
            color: 0xc40b0b, emissive: 0x000000, emissiveIntensity: 0.0,
            roughness: 0.15, metalness: 0.2
        });
        this.brakeLight = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.045, 0.035), brakeMaterial);
        this.brakeLight.position.set(x, y, z);
        this.brakeLight.rotation.x = tiltX;
        this.brakeLight.castShadow = true;
        this.brakeLight.receiveShadow = true;
        const housingMaterial = new THREE.MeshStandardMaterial({
            color: 0x101013, roughness: 0.6, metalness: 0.4
        });
        const housing = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.065, 0.03), housingMaterial);
        housing.position.set(0, 0, 0.012);
        housing.castShadow = true;
        this.brakeLight.add(housing);
        this.group.add(this.brakeLight);
    }

    // Handlebar with grips, bar-end weights, levers, master cylinder and
    // optional mirrors/crossbar/risers, plus brake+clutch cables dropping to
    // the steering head. Added to this.group (contract: this.handlebar).
    buildHandlebar({
        y, z, width = 0.5, crossbar = false, mirrors = false, risers = false,
        cables = true, palette = null
    } = {}) {
        const P = palette || this.makeBikePalette();
        const barGeometry = new THREE.CylinderGeometry(0.021, 0.021, width, 10);
        barGeometry.rotateZ(Math.PI / 2);
        this.handlebar = new THREE.Mesh(barGeometry, P.chrome);
        this.handlebar.position.set(0, y, z);
        this.handlebar.castShadow = true;
        this.handlebar.receiveShadow = true;

        const gripGeometry = new THREE.CylinderGeometry(0.031, 0.031, 0.11, 10);
        gripGeometry.rotateZ(Math.PI / 2);
        const endGeometry = new THREE.CylinderGeometry(0.034, 0.034, 0.015, 8);
        endGeometry.rotateZ(Math.PI / 2);
        const leverGeometry = new THREE.BoxGeometry(0.012, 0.012, 0.1);
        [-1, 1].forEach((side) => {
            const grip = new THREE.Mesh(gripGeometry, P.rubber);
            grip.position.set(side * (width / 2 - 0.06), 0, 0);
            grip.castShadow = true;
            this.handlebar.add(grip);
            const end = new THREE.Mesh(endGeometry, P.darkMetal);
            end.position.set(side * (width / 2 + 0.005), 0, 0);
            this.handlebar.add(end);
            const lever = new THREE.Mesh(leverGeometry, P.chrome);
            lever.position.set(side * (width / 2 - 0.04), 0.018, 0.07);
            lever.rotation.y = side * -0.35;
            lever.castShadow = true;
            this.handlebar.add(lever);
        });
        // Brake master cylinder + reservoir on the right
        const master = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.035, 0.04), P.darkMetal);
        master.position.set(width / 2 - 0.13, 0.012, 0.02);
        this.handlebar.add(master);
        const reservoir = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.025, 8), P.steel);
        reservoir.position.set(width / 2 - 0.13, 0.045, 0.02);
        this.handlebar.add(reservoir);

        if (crossbar) {
            const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.24, 8), P.chrome);
            bar.rotation.z = Math.PI / 2;
            bar.position.set(0, 0.05, 0);
            bar.castShadow = true;
            this.handlebar.add(bar);
        }
        if (risers) {
            const riserGeometry = new THREE.CylinderGeometry(0.016, 0.016, 0.09, 8);
            [-0.09, 0.09].forEach((rx) => {
                const riser = new THREE.Mesh(riserGeometry, P.steelDark);
                riser.position.set(rx, -0.05, 0);
                riser.castShadow = true;
                this.handlebar.add(riser);
            });
        }
        if (mirrors) {
            const stalkGeometry = new THREE.CylinderGeometry(0.008, 0.008, 0.14, 6);
            const headGeometry = new THREE.SphereGeometry(0.045, 10, 8);
            [-1, 1].forEach((side) => {
                const stalk = new THREE.Mesh(stalkGeometry, P.darkMetal);
                stalk.position.set(side * (width / 2 - 0.1), 0.07, -0.01);
                stalk.rotation.z = side * -0.8;
                stalk.castShadow = true;
                this.handlebar.add(stalk);
                const head = new THREE.Mesh(headGeometry, P.darkMetal);
                head.scale.set(1.35, 0.8, 0.4);
                head.position.set(side * (width / 2 - 0.04), 0.12, -0.01);
                head.castShadow = true;
                this.handlebar.add(head);
            });
        }
        this.group.add(this.handlebar);

        if (cables) {
            // Brake/clutch lines drooping from the bar ends to the headstock
            const cableMaterial = new THREE.MeshStandardMaterial({
                color: 0x121214, roughness: 0.85, metalness: 0.1
            });
            [-1, 1].forEach((side) => {
                this.addCable([
                    [side * (width / 2 - 0.1), y - 0.01, z + 0.04],
                    [side * 0.12, y - 0.16, z + 0.02],
                    [side * 0.05, y - 0.3, z - 0.04]
                ], 0.006, cableMaterial);
            });
        }
    }

    // ---- Alex: sandy-gold adventure tourer. Wire wheels, long-travel
    // gaitered forks, beak, crash bars with spotlights, alloy luggage. ----
    buildAdventureBike() {
        const P = this.makeBikePalette(0x2b2f38);
        const luggageMaterial = new THREE.MeshStandardMaterial({
            color: 0x33373d, roughness: 0.5, metalness: 0.65, envMapIntensity: 1.0
        });

        // Wire-spoked wheels with dual-sport rubber
        this.buildWheelSet({
            rearTireRadius: 0.3, rearTireWidth: 0.13,
            frontTireRadius: 0.3, frontTireWidth: 0.1,
            style: 'wire', wireSpokes: 14, discRadius: 0.16,
            rimColor: 0xc8cacc, caliperColor: 0x2255aa, palette: P
        });

        // Long-travel forks with rubber gaiters (bottom at the axle, top
        // tucked behind the beak rather than towering over the tank)
        this.buildForkPair({
            length: 0.58, x: 0.09, y: 0.58, z: 0.68, rake: 0.12,
            gaiters: true, palette: P
        });

        // ---- Frame + engine + bash plate ----
        this.frame = this.attachPart(new THREE.BoxGeometry(0.12, 0.18, 1.0), P.paint, 0, 0.72, 0.0);
        this.engine = this.attachPart(new THREE.BoxGeometry(0.3, 0.3, 0.42), P.darkMetal, 0, 0.5, 0.08);
        // Boxer-style cylinder heads poking out each side
        const headGeometry = new THREE.CylinderGeometry(0.07, 0.075, 0.1, 10);
        this.attachPart(headGeometry, P.steel, -0.21, 0.48, 0.18, { rz: Math.PI / 2 });
        this.attachPart(headGeometry, P.steel, 0.21, 0.48, 0.18, { rz: Math.PI / 2 });
        const headCapGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.02, 8);
        this.attachPart(headCapGeometry, P.darkMetal, -0.27, 0.48, 0.18, { rz: Math.PI / 2 });
        this.attachPart(headCapGeometry, P.darkMetal, 0.27, 0.48, 0.18, { rz: Math.PI / 2 });
        // Bevelled aluminium bash plate
        const bashGeometry = this.makePanel([
            [0.38, 0.22], [0.42, 0.34], [0.3, 0.4], [-0.18, 0.4], [-0.24, 0.3], [-0.1, 0.22]
        ], 0.34, 0.015);
        this.attachPart(bashGeometry, P.steel, 0, 0.0, 0.06);

        // ---- Tall lathe-turned tank with side shrouds ----
        const tankGeometry = this.makeLathe([
            [0.0, 0.0], [0.17, 0.01], [0.21, 0.08], [0.215, 0.2],
            [0.18, 0.3], [0.1, 0.36], [0.0, 0.38]
        ], 16);
        this.fuelTank = this.attachPart(tankGeometry, P.paint, 0, 0.78, 0.2,
            { rx: 0.08, sx: 1.05, sy: 1.0, sz: 1.35 });
        this.attachPart(new THREE.CylinderGeometry(0.032, 0.038, 0.012, 10), P.steel, 0, 1.155, 0.16);
        const shroudGeometry = this.makePanel([
            [0.42, 0.74], [0.5, 0.92], [0.3, 1.06], [0.02, 1.02], [0.0, 0.84], [0.18, 0.72]
        ], 0.05, 0.012);
        this.attachPart(shroudGeometry, P.paint, -0.18, 0, 0, { ry: 0.12 });
        this.attachPart(shroudGeometry, P.paint, 0.18, 0, 0, { ry: -0.12 });
        // Shroud decal stripes
        const shroudDecalGeometry = new THREE.BoxGeometry(0.012, 0.05, 0.26);
        this.attachPart(shroudDecalGeometry, P.paintDark, -0.215, 0.92, 0.26, { rx: -0.3 });
        this.attachPart(shroudDecalGeometry, P.paintDark, 0.215, 0.92, 0.26, { rx: -0.3 });

        // ---- Beak fender + low fender ----
        const beakGeometry = this.makePanel([
            [0.5, 0.72], [0.78, 0.62, 0.97, 0.6], [0.92, 0.55], [0.62, 0.6], [0.46, 0.64]
        ], 0.16, 0.014);
        this.attachPart(beakGeometry, P.paint, 0, 0.08, 0);
        const lowFenderGeometry = new THREE.CylinderGeometry(0.36, 0.36, 0.13, 12, 1, true, 0.7, 1.6);
        lowFenderGeometry.rotateZ(Math.PI / 2);
        this.attachPart(lowFenderGeometry, P.paintDark, 0, 0.3, 0.7);

        // ---- Headlight cluster + tall touring screen ----
        this.headlight = this.attachPart(new THREE.SphereGeometry(0.06, 12, 8), P.headlight,
            -0.06, 0.95, 0.58, { sx: 1.1, sy: 0.9, sz: 0.6 });
        this.attachPart(new THREE.SphereGeometry(0.06, 12, 8), P.headlight,
            0.06, 0.95, 0.58, { sx: 1.1, sy: 0.9, sz: 0.6 });
        this.attachPart(new THREE.BoxGeometry(0.3, 0.16, 0.06), P.paintDark, 0, 0.95, 0.55);
        // Curved windscreen (cylindrical segment) with trim
        const screenGeometry = new THREE.CylinderGeometry(0.36, 0.4, 0.44, 10, 1, true, -0.55, 1.1);
        this.attachPart(screenGeometry, P.glass, 0, 1.3, 0.2, { rx: -0.22 });
        this.attachPart(new THREE.BoxGeometry(0.3, 0.02, 0.03), P.darkMetal, 0, 1.1, 0.55);
        // TFT dash
        this.attachPart(new THREE.BoxGeometry(0.18, 0.1, 0.02), P.dash, 0, 1.12, 0.44, { rx: -0.4 });

        // ---- Crash bars with spotlights ----
        const barGeometry = new THREE.TorusGeometry(0.17, 0.013, 5, 10, Math.PI * 1.2);
        [-1, 1].forEach((side) => {
            const bar = this.attachPart(barGeometry, P.steel, side * 0.2, 0.56, 0.3,
                { rx: 0.5 - Math.PI, ry: -Math.PI / 2 }); // wrap the engine, not arch over it
            this.attachPart(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6), P.steel,
                side * 0.2, 0.62, 0.22, { rx: 0.5 });
            // Spotlight pod: body + emissive lens
            this.attachPart(new THREE.CylinderGeometry(0.035, 0.04, 0.05, 10), P.darkMetal,
                side * 0.21, 0.68, 0.5, { rx: Math.PI / 2 });
            const lens = this.attachPart(new THREE.CircleGeometry(0.03, 10), P.headlight,
                side * 0.21, 0.68, 0.527);
        });

        // ---- Wide bars with risers, hand guards and mirrors ----
        this.buildHandlebar({ y: 1.18, z: 0.5, width: 0.56, risers: true, mirrors: true, cables: true, palette: P });
        const guardGeometry = new THREE.TorusGeometry(0.085, 0.013, 5, 8, Math.PI);
        [-1, 1].forEach((side) => {
            const guard = new THREE.Mesh(guardGeometry, P.paint);
            guard.position.set(side * 0.24, 0.01, 0.05);
            guard.rotation.y = side * Math.PI / 2 + side * 0.3;
            guard.castShadow = true;
            this.handlebar.add(guard);
        });

        // ---- Stepped two-tone touring seat ----
        const seatGeometry = new THREE.CapsuleGeometry(0.11, 0.34, 4, 12);
        seatGeometry.rotateX(Math.PI / 2);
        this.attachPart(seatGeometry, P.leather, 0, 0.95, -0.18, { sx: 1.3, sy: 0.55 });
        const pillionMaterial = new THREE.MeshStandardMaterial({
            color: 0x3c3f46, roughness: 0.85, metalness: 0.0
        });
        this.attachPart(new THREE.CapsuleGeometry(0.1, 0.16, 3, 10), pillionMaterial,
            0, 1.0, -0.48, { rx: Math.PI / 2, sx: 1.35, sy: 0.55 });

        // ---- Luggage: bevelled panniers + top box with reflectors ----
        const pannierGeometry = this.makePanel([
            [-0.24, 0.58], [-0.62, 0.58], [-0.66, 0.66], [-0.66, 0.84], [-0.6, 0.9], [-0.26, 0.9], [-0.2, 0.82], [-0.2, 0.66]
        ], 0.13, 0.016);
        const reflectorMaterial = new THREE.MeshStandardMaterial({
            color: 0xa01010, emissive: 0x550000, emissiveIntensity: 0.5, roughness: 0.3
        });
        [-1, 1].forEach((side) => {
            const pannier = this.attachPart(pannierGeometry, luggageMaterial, side * 0.225, 0, 0);
            // Lid seam + latch + reflector
            this.attachPart(new THREE.BoxGeometry(0.135, 0.01, 0.4), P.darkMetal, side * 0.225, 0.8, -0.43);
            this.attachPart(new THREE.BoxGeometry(0.02, 0.05, 0.04), P.steel, side * 0.295, 0.74, -0.43);
            this.attachPart(new THREE.BoxGeometry(0.012, 0.025, 0.06), reflectorMaterial, side * 0.292, 0.64, -0.6);
        });
        // Top box + paint lid + grab rails + rack plate
        this.attachPart(new THREE.BoxGeometry(0.36, 0.26, 0.32), luggageMaterial, 0, 1.14, -0.6);
        this.attachPart(new THREE.BoxGeometry(0.38, 0.05, 0.34), P.paint, 0, 1.295, -0.6);
        this.attachPart(new THREE.BoxGeometry(0.1, 0.02, 0.02), P.steel, 0, 1.27, -0.43);
        this.attachPart(new THREE.BoxGeometry(0.3, 0.025, 0.36), P.steelDark, 0, 0.995, -0.6);
        const railGeometry = new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6);
        this.attachPart(railGeometry, P.steel, -0.18, 1.0, -0.5, { rx: Math.PI / 2 });
        this.attachPart(railGeometry, P.steel, 0.18, 1.0, -0.5, { rx: Math.PI / 2 });

        // ---- Swingarm + shaft drive + upswept exhaust ----
        const swingarmGeometry = new THREE.BoxGeometry(0.05, 0.07, 0.55);
        this.attachPart(swingarmGeometry, P.steelDark, 0.1, 0.32, -0.4);
        // Shaft drive housing on the left (no chain on this tourer)
        this.addLimb(this.group, P.steel, 0.042, -0.1, 0.42, -0.12, -0.1, 0.31, -0.66);
        const shockGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.26, 8);
        this.attachPart(shockGeometry, P.caliperRed, 0.02, 0.5, -0.32, { rx: 0.4 });

        // Header pipes from each cylinder sweeping back to a high can
        this.addCable([[0.22, 0.42, 0.24], [0.2, 0.3, 0.1], [0.16, 0.32, -0.2], [0.15, 0.5, -0.38]], 0.02, P.steel);
        this.addCable([[-0.22, 0.42, 0.24], [-0.18, 0.26, 0.05], [0.0, 0.28, -0.15], [0.13, 0.45, -0.36]], 0.018, P.steel);
        const canGeometry = this.makeLathe([
            [0.0, 0.0], [0.05, 0.0], [0.065, 0.06], [0.065, 0.34], [0.045, 0.42], [0.0, 0.43]
        ], 12);
        canGeometry.rotateX(-Math.PI / 2);
        const advCan = this.attachPart(canGeometry, P.steel, 0.17, 0.6, -0.3, { rx: 0.3 });
        const shieldGeometry = new THREE.CylinderGeometry(0.075, 0.075, 0.2, 8, 1, true, -0.6, 1.4);
        shieldGeometry.rotateX(Math.PI / 2);
        const shield = new THREE.Mesh(shieldGeometry, P.chrome);
        shield.position.set(0.005, 0, -0.2);
        shield.castShadow = true;
        advCan.add(shield);

        // Footpegs, side stand, licence plate
        const pegGeometry = new THREE.BoxGeometry(0.09, 0.02, 0.05);
        this.attachPart(pegGeometry, P.steel, -0.2, 0.45, -0.1);
        this.attachPart(pegGeometry, P.steel, 0.2, 0.45, -0.1);
        this.attachPart(new THREE.CylinderGeometry(0.011, 0.011, 0.32, 8), P.steelDark,
            -0.15, 0.2, 0.0, { rz: 0.5, rx: 0.2 });
        this.attachPart(new THREE.BoxGeometry(0.16, 0.1, 0.008), P.plate, 0, 0.62, -0.88, { rx: 0.3 });

        // Brake light on the top box (contract position preserved)
        this.buildBrakeLight(0, 1.12, -0.79);

        // Upright touring rider in ADV gear
        this.buildVariantRider({
            y: 1.22, z: -0.12, torsoLean: 0.18,
            suitColor: 0x2f3640, suitAccent: P.paintHex,
            helmetColor: 0xe8e6dd, helmetAccent: 0x2f3640, style: 'adv',
            hand: [0.24, -0.03, 0.6], foot: [0.2, -0.74, 0.06],
            elbowOut: 0.08, kneeOut: 0.04, kneeForward: 0.2
        });
    }

    // ---- Tim: silver maxi-scooter. Smooth lathe bodywork, covered wheels,
    // floorboard with rubber strips, plush two-tone seat, chrome trim. ----
    buildScooter() {
        const P = this.makeBikePalette(0x30343c);
        const trimMaterial = new THREE.MeshStandardMaterial({
            color: 0x1c1e22, roughness: 0.7, metalness: 0.3
        });

        // Covered solid wheels, fat tires, small discs
        this.buildWheelSet({
            rearTireRadius: 0.3, rearTireWidth: 0.17,
            frontTireRadius: 0.28, frontTireWidth: 0.15,
            style: 'solid', discRadius: 0.12, frontDiscRadius: 0.14,
            rimColor: 0xcfd2d6, caliperColor: 0x3a3e46, palette: P
        });

        // Stubby forks mostly hidden behind the bodywork
        this.buildForkPair({ length: 0.4, x: 0.08, y: 0.5, z: 0.68, radius: 0.022, rake: 0.12, palette: P });

        // ---- Main body: smooth under-seat hump (colour-feedback frame) ----
        const bodyGeometry = new THREE.CapsuleGeometry(0.21, 0.5, 6, 14);
        bodyGeometry.rotateX(Math.PI / 2);
        this.frame = this.attachPart(bodyGeometry, P.paint, 0, 0.64, -0.32, { sx: 0.95, sy: 0.78 });
        // Side skirt panels in the darker two-tone shade
        const skirtGeometry = this.makePanel([
            [0.32, 0.36], [0.34, 0.52], [0.1, 0.6], [-0.5, 0.66], [-0.72, 0.56], [-0.6, 0.4], [-0.1, 0.34]
        ], 0.04, 0.012);
        this.attachPart(skirtGeometry, P.paintDark, -0.17, 0, 0, { ry: 0.05 });
        this.attachPart(skirtGeometry, P.paintDark, 0.17, 0, 0, { ry: -0.05 });
        // Chrome pinstripe along the flanks
        const stripGeometry = new THREE.BoxGeometry(0.008, 0.014, 0.6);
        this.attachPart(stripGeometry, P.chrome, -0.195, 0.6, -0.25);
        this.attachPart(stripGeometry, P.chrome, 0.195, 0.6, -0.25);

        // ---- Front apron: lathe-turned smooth shield (contract fuelTank) ----
        const apronGeometry = this.makeLathe([
            [0.0, 0.0], [0.22, 0.02], [0.3, 0.18], [0.32, 0.38],
            [0.28, 0.52], [0.18, 0.62], [0.0, 0.66]
        ], 18);
        this.fuelTank = this.attachPart(apronGeometry, P.paint, 0, 0.42, 0.55, { sx: 0.62, sy: 1.0, sz: 0.55 });
        // Inner leg shield + glovebox seams
        this.attachPart(new THREE.BoxGeometry(0.3, 0.4, 0.04), trimMaterial, 0, 0.74, 0.42, { rx: -0.12 });
        this.attachPart(new THREE.BoxGeometry(0.22, 0.008, 0.02), P.darkMetal, 0, 0.82, 0.44, { rx: -0.12 });
        this.attachPart(new THREE.BoxGeometry(0.025, 0.04, 0.02), P.chrome, 0.09, 0.76, 0.45, { rx: -0.12 });

        // ---- Floorboard with rubber strips + underbody ----
        this.attachPart(new THREE.BoxGeometry(0.38, 0.06, 0.55), trimMaterial, 0, 0.38, 0.12);
        const stripRubberGeometry = new THREE.BoxGeometry(0.05, 0.012, 0.5);
        [-0.13, -0.045, 0.045, 0.13].forEach((sx) => {
            this.attachPart(stripRubberGeometry, P.rubber, sx, 0.412, 0.12);
        });
        this.attachPart(new THREE.BoxGeometry(0.34, 0.16, 0.7), trimMaterial, 0, 0.3, 0.0);

        // Front fender hugging the wheel
        const fenderGeometry = new THREE.CylinderGeometry(0.34, 0.34, 0.18, 12, 1, true, 0.6, 1.8);
        fenderGeometry.rotateZ(Math.PI / 2);
        this.attachPart(fenderGeometry, P.paint, 0, 0.3, 0.7);

        // ---- Tall curved commuter screen with chrome trim ----
        const screenGeometry = new THREE.CylinderGeometry(0.42, 0.46, 0.55, 12, 1, true, -0.55, 1.1);
        this.attachPart(screenGeometry, P.glass, 0, 1.28, 0.18, { rx: -0.18 });
        this.attachPart(new THREE.CylinderGeometry(0.43, 0.43, 0.025, 10, 1, true, -0.5, 1.0), P.chrome,
            0, 1.54, 0.16, { rx: -0.18 });

        // ---- Headlight + indicators set into the apron ----
        this.headlight = this.attachPart(new THREE.SphereGeometry(0.06, 12, 8), P.headlight,
            0, 0.85, 0.72, { sx: 2.0, sy: 0.7, sz: 0.6 });
        this.attachPart(new THREE.BoxGeometry(0.34, 0.025, 0.02), P.chrome, 0, 0.78, 0.72);
        const signalMaterial = new THREE.MeshStandardMaterial({
            color: 0xd88a1a, emissive: 0x9a5500, emissiveIntensity: 0.4, roughness: 0.2
        });
        this.attachPart(new THREE.SphereGeometry(0.022, 8, 6), signalMaterial, -0.15, 0.92, 0.66);
        this.attachPart(new THREE.SphereGeometry(0.022, 8, 6), signalMaterial, 0.15, 0.92, 0.66);

        // ---- Covered bars, console with dials, long chrome mirror stalks ----
        this.buildHandlebar({ y: 1.12, z: 0.55, width: 0.5, cables: false, palette: P });
        this.attachPart(new THREE.BoxGeometry(0.26, 0.1, 0.16), trimMaterial, 0, 1.04, 0.56);
        this.attachPart(new THREE.CircleGeometry(0.032, 12), P.dash, -0.05, 1.1, 0.51, { rx: -0.9 });
        this.attachPart(new THREE.CircleGeometry(0.032, 12), P.dash, 0.05, 1.1, 0.51, { rx: -0.9 });
        const stalkGeometry = new THREE.CylinderGeometry(0.008, 0.008, 0.18, 6);
        const mirrorGeometry = new THREE.SphereGeometry(0.05, 10, 8);
        [-1, 1].forEach((side) => {
            this.attachPart(stalkGeometry, P.chrome, side * 0.18, 1.2, 0.56, { rz: side * -0.7 });
            this.attachPart(mirrorGeometry, P.chrome, side * 0.25, 1.28, 0.57, { sx: 1.3, sy: 0.85, sz: 0.4 });
        });

        // ---- Plush two-tone stepped seat with piping + backrest ----
        const seatGeometry = new THREE.CapsuleGeometry(0.16, 0.34, 5, 12);
        seatGeometry.rotateX(Math.PI / 2);
        this.attachPart(seatGeometry, P.leather, 0, 0.84, -0.22, { sx: 1.2, sy: 0.55 });
        const pillionMaterial = new THREE.MeshStandardMaterial({
            color: 0x474b54, roughness: 0.85, metalness: 0.0
        });
        this.attachPart(new THREE.CapsuleGeometry(0.15, 0.2, 4, 12), pillionMaterial,
            0, 0.93, -0.52, { rx: Math.PI / 2, sx: 1.2, sy: 0.6 });
        this.attachPart(new THREE.BoxGeometry(0.3, 0.012, 0.04), P.plastic, 0, 0.9, -0.38);
        this.attachPart(new THREE.BoxGeometry(0.32, 0.14, 0.07), pillionMaterial, 0, 1.02, -0.66, { rx: -0.15 });
        // Chrome pillion grab rail wrapping the tail
        const railGeometry = new THREE.TorusGeometry(0.19, 0.013, 5, 12, Math.PI);
        this.attachPart(railGeometry, P.chrome, 0, 0.92, -0.6, { rx: Math.PI / 2, rz: Math.PI });
        // Fold-out pillion pegs
        this.attachPart(new THREE.BoxGeometry(0.06, 0.015, 0.03), P.steel, -0.21, 0.55, -0.35);
        this.attachPart(new THREE.BoxGeometry(0.06, 0.015, 0.03), P.steel, 0.21, 0.55, -0.35);

        // ---- Tail bodywork + licence plate ----
        this.attachPart(new THREE.SphereGeometry(0.2, 14, 10), P.paint, 0, 0.66, -0.72, { sx: 0.95, sy: 0.6, sz: 0.7 });
        this.attachPart(new THREE.BoxGeometry(0.14, 0.1, 0.008), P.plate, 0, 0.6, -0.86, { rx: 0.2 });

        // ---- CVT transmission case (acts as the swingarm) + exhaust ----
        this.addLimb(this.group, P.steel, 0.06, 0.15, 0.38, -0.15, 0.13, 0.31, -0.66);
        this.attachPart(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 12), P.steelDark,
            0.19, 0.36, -0.3, { rz: Math.PI / 2 });
        // Chrome muffler with heat shield
        const muffGeometry = this.makeLathe([
            [0.0, 0.0], [0.05, 0.0], [0.06, 0.05], [0.06, 0.3], [0.04, 0.36], [0.0, 0.37]
        ], 12);
        muffGeometry.rotateX(-Math.PI / 2);
        const muffler = this.attachPart(muffGeometry, P.chrome, 0.16, 0.34, -0.42, { rx: 0.12 });
        const shieldGeometry = new THREE.BoxGeometry(0.02, 0.06, 0.3);
        const muffShield = new THREE.Mesh(shieldGeometry, P.steel);
        muffShield.position.set(0.05, 0.02, -0.18);
        muffShield.castShadow = true;
        muffler.add(muffShield);

        // Centre + side stands tucked under the floor
        this.attachPart(new THREE.CylinderGeometry(0.01, 0.01, 0.24, 6), P.steelDark,
            -0.14, 0.16, -0.05, { rz: 0.45, rx: 0.15 });
        this.attachPart(new THREE.BoxGeometry(0.04, 0.012, 0.05), P.steelDark, -0.2, 0.04, -0.02);

        // Brake light across the tail (contract position preserved)
        this.buildBrakeLight(0, 0.76, -0.84);

        // Relaxed commuter: upright, feet forward on the floorboard
        this.buildVariantRider({
            y: 1.16, z: -0.18, torsoLean: 0.08,
            suitColor: 0x3a3f4a, suitAccent: 0xd6d8dc,
            helmetColor: 0xe8e8ea, helmetAccent: 0x9aa0a8, style: 'commuter',
            hand: [0.21, -0.05, 0.71], foot: [0.13, -0.72, 0.42],
            elbowOut: 0.06, kneeOut: 0.03, kneeForward: 0.3
        });
    }

    // ---- Shane: orange motocross bike. Wire wheels with knobbies, tall
    // gaiterless USD forks with guards, shrouds, high fenders, MX plates. ----
    buildDirtBike() {
        const P = this.makeBikePalette(0xffffff);
        const plasticMaterial = new THREE.MeshStandardMaterial({
            color: 0xeceff1, roughness: 0.5, metalness: 0.08
        });

        // Thin wire-spoked wheels wrapped in knobby rubber
        this.buildWheelSet({
            rearTireRadius: 0.28, rearTireWidth: 0.11,
            frontTireRadius: 0.3, frontTireWidth: 0.08,
            style: 'wire', wireSpokes: 14, knobby: true, knobCount: 18,
            discRadius: 0.15, frontDiscRadius: 0.16,
            rimColor: 0x23252b, caliperColor: 0x9aa0a6, palette: P
        });

        // Long-travel USD motocross forks with plastic guards
        this.buildForkPair({
            length: 0.78, x: 0.08, y: 0.62, z: 0.66, radius: 0.027, rake: 0.16,
            usd: true, sliderColor: 0xb8923e, guards: true, guardMaterial: plasticMaterial,
            palette: P
        });
        this.attachPart(new THREE.BoxGeometry(0.22, 0.05, 0.1), P.steelDark, 0, 0.95, 0.6);
        this.attachPart(new THREE.BoxGeometry(0.2, 0.04, 0.09), P.steelDark, 0, 0.84, 0.62);

        // ---- Frame: spine + cradle downtubes + subframe ----
        this.frame = this.attachPart(new THREE.BoxGeometry(0.08, 0.16, 0.95), P.paint, 0, 0.7, 0.0);
        const tubeGeometry = new THREE.CylinderGeometry(0.014, 0.014, 0.42, 7);
        this.attachPart(tubeGeometry, P.steel, -0.06, 0.5, 0.3, { rx: 0.5 });
        this.attachPart(tubeGeometry, P.steel, 0.06, 0.5, 0.3, { rx: 0.5 });
        this.attachPart(tubeGeometry, P.steel, -0.06, 0.74, -0.38, { rx: -1.0 });
        this.attachPart(tubeGeometry, P.steel, 0.06, 0.74, -0.38, { rx: -1.0 });

        // ---- Compact single + brushed cases + carb ----
        this.engine = this.attachPart(new THREE.BoxGeometry(0.22, 0.26, 0.32), P.darkMetal, 0, 0.44, 0.05);
        this.attachPart(new THREE.BoxGeometry(0.16, 0.16, 0.16), P.steel, 0, 0.62, 0.16, { rx: -0.15 });
        this.attachPart(new THREE.CylinderGeometry(0.07, 0.07, 0.025, 12), P.steel, 0.125, 0.42, -0.02, { rz: Math.PI / 2 });
        this.attachPart(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 10), P.steelDark, -0.12, 0.44, 0.05, { rz: Math.PI / 2 });
        this.attachPart(new THREE.CylinderGeometry(0.035, 0.035, 0.07, 8), P.steelDark, 0, 0.52, -0.14, { rx: 0.4 });
        // Skid plate
        this.attachPart(new THREE.BoxGeometry(0.24, 0.025, 0.4), P.steel, 0, 0.29, 0.05);

        // ---- Small tank + radiator shrouds + radiators with fins ----
        const tankGeometry = this.makeLathe([
            [0.0, 0.0], [0.13, 0.01], [0.15, 0.08], [0.12, 0.16], [0.05, 0.2], [0.0, 0.21]
        ], 14);
        this.fuelTank = this.attachPart(tankGeometry, P.paint, 0, 0.84, 0.22, { rx: 0.1, sx: 1.0, sy: 1.0, sz: 1.35 });
        this.attachPart(new THREE.CylinderGeometry(0.03, 0.034, 0.014, 8), P.darkMetal, 0, 1.055, 0.18);
        const shroudGeometry = this.makePanel([
            [0.38, 0.7], [0.46, 0.9], [0.26, 1.0], [0.04, 0.94], [0.08, 0.74], [0.24, 0.66]
        ], 0.045, 0.012);
        this.attachPart(shroudGeometry, P.paint, -0.155, 0, 0, { ry: 0.22 });
        this.attachPart(shroudGeometry, P.paint, 0.155, 0, 0, { ry: -0.22 });
        // Shroud decals
        const decalGeometry = new THREE.BoxGeometry(0.012, 0.045, 0.2);
        this.attachPart(decalGeometry, plasticMaterial, -0.19, 0.86, 0.32, { ry: 0.22, rx: -0.25 });
        this.attachPart(decalGeometry, plasticMaterial, 0.19, 0.86, 0.32, { ry: -0.22, rx: -0.25 });
        // Radiator cores tucked behind the shrouds
        const radGeometry = new THREE.BoxGeometry(0.04, 0.16, 0.1);
        const leftRad = this.attachPart(radGeometry, P.darkMetal, -0.12, 0.74, 0.3, { ry: 0.25 });
        const rightRad = this.attachPart(radGeometry, P.darkMetal, 0.12, 0.74, 0.3, { ry: -0.25 });
        const radFinGeometry = new THREE.BoxGeometry(0.044, 0.008, 0.09);
        [leftRad, rightRad].forEach((rad) => {
            for (let i = 0; i < 3; i++) {
                const fin = new THREE.Mesh(radFinGeometry, P.steelDark);
                fin.position.set(0, -0.05 + i * 0.05, 0.008);
                rad.add(fin);
            }
        });
        this.addCable([[-0.1, 0.66, 0.3], [-0.08, 0.6, 0.22], [-0.04, 0.58, 0.14]], 0.011, P.rubber);

        // ---- High fenders, front number plate, side plates ----
        // Outline mirrored vertically (about y=0.99) so the fender curves down
        // toward its forward tip instead of sweeping up like a rear fender.
        const frontFenderGeometry = this.makePanel([
            [0.42, 1.12], [0.8, 1.02, 1.05, 0.86], [0.95, 0.92], [0.62, 1.06, 0.42, 1.08]
        ], 0.15, 0.012);
        this.attachPart(frontFenderGeometry, P.paint, 0, -0.18, 0); // lowered closer to the wheel
        const rearFenderGeometry = this.makePanel([
            [-0.3, 0.88], [-0.7, 0.98, -0.92, 1.12], [-0.88, 1.04], [-0.55, 0.92, -0.3, 0.84]
        ], 0.16, 0.012);
        this.attachPart(rearFenderGeometry, P.paint, 0, 0, 0);
        // Front number plate with race number bars
        const plateGeometry = this.makePanel([
            [-0.1, -0.1], [0.08, -0.1], [0.1, 0.02], [0.06, 0.12], [-0.08, 0.12]
        ], 0.02, 0.01);
        this.attachPart(plateGeometry, plasticMaterial, 0, 1.0, 0.55, { ry: Math.PI / 2, rx: -0.2 });
        this.attachPart(new THREE.BoxGeometry(0.012, 0.08, 0.025), P.darkMetal, 0, 1.01, 0.575, { rx: -0.2 });
        // Side number plates under the seat
        const sidePlateGeometry = this.makePanel([
            [-0.28, 0.62], [-0.62, 0.62], [-0.68, 0.78], [-0.5, 0.9], [-0.26, 0.82]
        ], 0.03, 0.01);
        this.attachPart(sidePlateGeometry, plasticMaterial, -0.13, 0, 0, { ry: 0.1 });
        this.attachPart(sidePlateGeometry, plasticMaterial, 0.13, 0, 0, { ry: -0.1 });
        const numeralGeometry = new THREE.BoxGeometry(0.012, 0.1, 0.03);
        this.attachPart(numeralGeometry, P.darkMetal, -0.152, 0.74, -0.45);
        this.attachPart(numeralGeometry, P.darkMetal, 0.152, 0.74, -0.45);

        // ---- Gripper seat with ribs running tank to tail ----
        this.attachPart(new THREE.BoxGeometry(0.18, 0.06, 0.62), P.leather, 0, 0.92, -0.16, { rx: -0.04 });
        const ribGeometry = new THREE.BoxGeometry(0.16, 0.008, 0.02);
        for (let i = 0; i < 5; i++) {
            this.attachPart(ribGeometry, P.rubber, 0, 0.952 + i * 0.0035, -0.36 + i * 0.09, { rx: -0.04 });
        }

        // ---- Swingarm, chain, big rear sprocket, brake pedal, pegs ----
        const swingarmGeometry = new THREE.BoxGeometry(0.04, 0.07, 0.58);
        this.attachPart(swingarmGeometry, P.steel, -0.08, 0.32, -0.4);
        this.attachPart(swingarmGeometry, P.steel, 0.08, 0.32, -0.4);
        const sprocket = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.014, 18), P.steelDark);
        sprocket.rotation.z = Math.PI / 2;
        sprocket.position.set(-0.09, 0, 0);
        sprocket.castShadow = true;
        this.rearWheel.add(sprocket);
        const sprocketInner = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.018, 12), P.darkMetal);
        sprocket.add(sprocketInner);
        this.attachPart(new THREE.BoxGeometry(0.014, 0.022, 0.6), P.darkMetal, -0.105, 0.4, -0.36, { rx: -0.08 });
        this.attachPart(new THREE.BoxGeometry(0.014, 0.022, 0.6), P.darkMetal, -0.105, 0.25, -0.36, { rx: -0.25 });
        this.attachPart(new THREE.BoxGeometry(0.03, 0.04, 0.06), P.steelDark, -0.105, 0.3, -0.55);
        // Serrated footpegs + shift/brake levers
        const pegGeometry = new THREE.BoxGeometry(0.1, 0.018, 0.055);
        this.attachPart(pegGeometry, P.steel, -0.19, 0.42, -0.08);
        this.attachPart(pegGeometry, P.steel, 0.19, 0.42, -0.08);
        this.attachPart(new THREE.BoxGeometry(0.014, 0.014, 0.16), P.steelDark, -0.15, 0.44, 0.06, { ry: -0.2 });
        this.attachPart(new THREE.BoxGeometry(0.014, 0.014, 0.18), P.steelDark, 0.15, 0.4, 0.04, { ry: 0.15 });

        // Rear shock + linkage
        this.attachPart(new THREE.CylinderGeometry(0.022, 0.022, 0.3, 8), P.caliperRed, 0, 0.5, -0.18, { rx: 0.35 });
        this.attachPart(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 6), P.steelDark, 0, 0.34, -0.26, { rx: 1.2 });

        // ---- Exhaust: swept header into a brushed silencer up high ----
        this.addCable([[0.0, 0.64, 0.3], [0.13, 0.5, 0.36], [0.16, 0.34, 0.16], [0.14, 0.4, -0.2], [0.13, 0.6, -0.4]], 0.024, P.steel);
        const silencerGeometry = this.makeLathe([
            [0.0, 0.0], [0.04, 0.0], [0.055, 0.05], [0.055, 0.3], [0.04, 0.35], [0.025, 0.36], [0.025, 0.4], [0.0, 0.4]
        ], 12);
        silencerGeometry.rotateX(-Math.PI / 2);
        this.attachPart(silencerGeometry, P.steel, 0.13, 0.66, -0.32, { rx: 0.22 });

        // ---- Wide MX bar with crossbar + pad ----
        this.buildHandlebar({ y: 1.12, z: 0.52, width: 0.6, crossbar: true, cables: true, palette: P });
        const pad = new THREE.Mesh(new THREE.CapsuleGeometry(0.024, 0.16, 3, 8), P.paint);
        pad.rotation.z = Math.PI / 2;
        pad.position.set(0, 0.05, 0);
        pad.castShadow = true;
        this.handlebar.add(pad);

        // Tiny enduro tail light (contract position preserved)
        this.buildBrakeLight(0, 1.04, -0.8, -0.28);

        // Attack-posture rider in MX gear: up off the seat, elbows high
        this.buildVariantRider({
            y: 1.22, z: -0.02, torsoLean: 0.45,
            suitColor: 0x1e2026, suitAccent: P.paintHex,
            helmetColor: P.paintHex, helmetAccent: 0xeceff1, style: 'mx',
            hand: [0.27, -0.09, 0.53], foot: [0.19, -0.79, -0.06],
            elbowOut: 0.08, kneeOut: 0.05, kneeForward: 0.22
        });
    }

    // ---- Guy: blacked-out naked streetfighter. Exposed trellis frame and
    // engine, round LED headlight, upright bars, stubby tail - no fairings. ----
    buildNakedBike() {
        const P = this.makeBikePalette(0x6a6a72); // gunmetal accent
        // Sporty alloy wheels with dark rims and a gold caliper
        this.buildWheelSet({
            rearTireRadius: 0.3, rearTireWidth: 0.16,
            frontTireRadius: 0.28, frontTireWidth: 0.12,
            rimRadius: 0.19, style: 'alloy', spokePairs: 5,
            discRadius: 0.15, rimColor: 0x2a2c30, caliperColor: 0xd4a017, palette: P
        });
        // USD forks, modest rake
        this.buildForkPair({
            length: 0.54, x: 0.1, y: 0.56, z: 0.7, radius: 0.025, rake: 0.16,
            usd: true, sliderColor: 0x3a3c40, palette: P
        });

        // ---- Trellis frame spine (paint = crash/wheelie feedback material) ----
        this.frame = this.attachPart(new THREE.BoxGeometry(0.09, 0.14, 0.9), P.paint, 0, 0.62, 0.02);
        const trellis = new THREE.CylinderGeometry(0.016, 0.016, 0.4, 7);
        this.attachPart(trellis, P.accent, -0.1, 0.6, 0.28, { rx: 0.7 });
        this.attachPart(trellis, P.accent, 0.1, 0.6, 0.28, { rx: 0.7 });
        this.attachPart(trellis, P.accent, -0.1, 0.52, -0.18, { rx: -0.6 });
        this.attachPart(trellis, P.accent, 0.1, 0.52, -0.18, { rx: -0.6 });

        // ---- Exposed engine: block, finned cylinder bank, round cases ----
        this.engine = this.attachPart(new THREE.BoxGeometry(0.3, 0.3, 0.4), P.darkMetal, 0, 0.4, 0.05);
        const jug = this.attachPart(new THREE.BoxGeometry(0.24, 0.22, 0.2), P.steel, 0, 0.58, 0.18, { rx: -0.45 });
        for (let i = 0; i < 4; i++) {
            const fin = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.012, 0.21), P.steelDark);
            fin.position.set(0, -0.06 + i * 0.04, 0);
            jug.add(fin);
        }
        const caseGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.04, 16);
        this.attachPart(caseGeo, P.steel, 0.16, 0.36, -0.02, { rz: Math.PI / 2 });
        this.attachPart(caseGeo, P.steel, -0.16, 0.36, -0.02, { rz: Math.PI / 2 });
        // Header sweeping down to a short underslung can
        this.attachPart(new THREE.CylinderGeometry(0.022, 0.022, 0.4, 8), P.chrome, 0.06, 0.4, 0.28, { rx: 0.9 });
        this.attachPart(new THREE.CylinderGeometry(0.05, 0.045, 0.26, 10), P.steelDark, 0.12, 0.26, -0.28, { rz: Math.PI / 2 - 0.1, rx: 0.1 });

        // ---- Muscular tank ----
        const tankGeometry = this.makeLathe([
            [0.0, 0.0], [0.16, 0.02], [0.19, 0.1], [0.16, 0.19], [0.07, 0.24], [0.0, 0.25]
        ], 16);
        this.fuelTank = this.attachPart(tankGeometry, P.paint, 0, 0.74, 0.16, { rx: 0.08, sx: 1.0, sy: 1.0, sz: 1.5 });
        this.attachPart(new THREE.CylinderGeometry(0.03, 0.034, 0.014, 8), P.darkMetal, 0, 1.0, 0.12);

        // ---- Round LED headlight on a bracket (no fairing) + tiny flyscreen ----
        this.attachPart(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 18), P.darkMetal, 0, 0.92, 0.6, { rx: Math.PI / 2 });
        this.attachPart(new THREE.CircleGeometry(0.1, 18), P.headlight, 0, 0.92, 0.632);
        this.attachPart(new THREE.BoxGeometry(0.14, 0.05, 0.02), P.darkMetal, 0, 1.02, 0.55, { rx: -0.3 });

        // ---- Stubby tail + seat + LED brake light ----
        this.attachPart(new THREE.BoxGeometry(0.18, 0.1, 0.34), P.paint, 0, 0.74, -0.5, { rx: 0.18 });
        this.attachPart(new THREE.BoxGeometry(0.34, 0.07, 0.42), P.leather, 0, 0.66, -0.12); // seat
        this.buildBrakeLight(0, 0.78, -0.66, 0.2);

        // ---- Short front hugger fender ----
        const fenderGeometry = new THREE.CylinderGeometry(0.34, 0.34, 0.13, 12, 1, true, 0.6, 1.4);
        fenderGeometry.rotateZ(Math.PI / 2);
        this.attachPart(fenderGeometry, P.paintDark, 0, 0.3, 0.7);

        // ---- Wide upright bars with risers + mirrors ----
        this.buildHandlebar({ y: 1.02, z: 0.56, width: 0.56, risers: true, mirrors: true, cables: true, palette: P });

        // ---- Footpegs + side stand (foot kicks out to the left) ----
        this.attachPart(new THREE.BoxGeometry(0.08, 0.02, 0.04), P.steel, -0.2, 0.42, -0.1);
        this.attachPart(new THREE.BoxGeometry(0.08, 0.02, 0.04), P.steel, 0.2, 0.42, -0.1);
        this.attachPart(new THREE.CylinderGeometry(0.011, 0.011, 0.3, 8), P.steelDark, -0.16, 0.18, 0.0, { rz: -0.55, rx: 0.25 });
        this.attachPart(new THREE.BoxGeometry(0.05, 0.014, 0.05), P.steelDark, -0.3, 0.045, 0.04);

        // ---- Upright, aggressive rider ----
        this.buildVariantRider({
            y: 1.12, z: -0.05, torsoLean: 0.35,
            suitColor: 0x18181c, suitAccent: 0x6a6a72,
            helmetColor: 0x1b1b1f, helmetAccent: 0xcccccc, style: 'road',
            hand: [0.2, -0.02, 0.6], foot: [0.21, -0.66, -0.08],
            elbowOut: 0.08, kneeOut: 0.06, kneeForward: 0.14
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

        // Track distance traveled (only when not crashed). Ignore teleport
        // jumps from resets/checkpoint restarts: at the fixed 60Hz step a bike
        // can't really move more than ~1.2m in a tick, so a large delta is a
        // reposition, not travel. (This kept average-speed honest.)
        if (!this.crashed && this.lastPosition) {
            const distanceDelta = this.position.distanceTo(this.lastPosition);
            if (distanceDelta < 5) {
                this.distanceTraveled += distanceDelta;
            }
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
                // Normal crash - sliding on road. Crash impulses include an
                // upward kick, so gravity must pull the bike back down and the
                // road must catch it (it used to float away on the impulse)
                this.velocity.y -= 20 * deltaTime;
                this.position.add(this.velocity.clone().multiplyScalar(deltaTime));
                this.velocity.x *= 0.98; // Friction slows the slide
                this.velocity.z *= 0.98;

                // Clamp to the road surface (windowed nearest-segment search)
                const crashRange = this.getSegmentSearchRange();
                let crashRoadY = this.position.y;
                let crashBestSq = Infinity;
                for (let i = crashRange.start; i <= crashRange.end; i++) {
                    const seg = this.environment && this.environment.roadPath ? this.environment.roadPath[i] : null;
                    if (!seg) continue;
                    const dx = this.position.x - seg.x;
                    const dz = this.position.z - seg.z;
                    const dSq = dx * dx + dz * dz;
                    if (dSq < crashBestSq) { crashBestSq = dSq; crashRoadY = seg.y || 0; }
                }
                if (this.position.y <= crashRoadY && this.velocity.y < 0) {
                    this.position.y = crashRoadY;
                    this.velocity.y = 0;
                }
            }
            
            this.speed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
            this.updateMesh();
            return;
        }
        
        // Update speed based on throttle/brake
        this.updateSpeed(deltaTime, throttleInput, brakeInput);

        // Automatic gearbox: rpm climbs across each gear then drops on the
        // upshift (drives the power wheelie and the engine note)
        this.computeGearState();

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
        
        // Check for boulder collisions (skipped while airborne - the bike
        // clears obstacles it is hopping over)
        if (this.environment && this.environment.boulders && !this.isJumping) {
            for (const boulder of this.environment.boulders) {
                const dx = this.position.x - boulder.position.x;
                const dy = this.position.y - boulder.position.y;
                const dz = this.position.z - boulder.position.z;
                const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
                
                // Check if we hit the boulder (account for bike size)
                if (distance < boulder.radius + 1.0) {
                    // Bikes with enough suspension travel ride over small rocks
                    // instead of crashing - dirt bike clears most debris, sport almost none
                    if (this.attemptRideOver(boulder.radius)) {
                        break;
                    }

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
            // Wheelies bog the drive, but the penalty ramps in with the wheelie
            // ANGLE - merely being "armed" in wheelie-mode at ~0deg doesn't cut
            // power. (A flat cut there starved the revs, dropped the front, and
            // set up a stop/go limit cycle that made the bike jump.) Manual
            // wheelies bog harder than power wheelies.
            const penAngleFrac = Math.min(1, this.wheelieAngle / 0.5);
            const minWheeliePenalty = this.powerWheelie ? 0.6 : 0.3;
            const wheeliePenalty = this.isWheelie ? (1 - (1 - minWheeliePenalty) * penAngleFrac) : 1.0;
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

    // Automatic gearbox model. There are no manual gears; instead the engine
    // rpm (0..1) rises across each gear's speed band and snaps back down on the
    // upshift, producing a sawtooth that drives the power wheelie and engine
    // note. currentGear/engineRpm are read by updateWheelie and the sound.
    computeGearState() {
        if (!this.gearTops) {
            // Fraction of maxSpeed at which each gear hits redline. 1st is kept
            // short (shifts up early) since it makes so much torque.
            this.gearTops = [0.12, 0.28, 0.45, 0.63, 0.82, 1.0];
            // Per-gear torque multiplier: lower gears make more torque, so the
            // front lifts much more easily down low.
            this.gearTorque = [1.4, 1.15, 1.0, 0.9, 0.82, 0.75];
            this.currentGear = 0;
            this.engineRpm = 0.4;
        }
        const frac = this.maxSpeed > 0 ? Math.max(0, this.speed / this.maxSpeed) : 0;
        let gear = 0;
        while (gear < this.gearTops.length - 1 && frac > this.gearTops[gear]) gear++;
        this.currentGear = gear;
        const bottom = gear === 0 ? 0 : this.gearTops[gear - 1];
        const top = this.gearTops[gear];
        // Reach redline at ~65% through the gear so the engine revs out and
        // holds against the limiter for a decent window before the upshift -
        // that sustained-high-rev window is when the power wheelie builds.
        const within = top > bottom ? (frac - bottom) / ((top - bottom) * 0.65) : 1;
        // rpm settles to ~0.4 just after a shift, climbs to 1.0 at redline
        this.engineRpm = 0.4 + 0.6 * Math.max(0, Math.min(1, within));
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
            this.powerWheelie = false; // deliberate pop (camera should react)
            this.wheelieAngle = 0.05; // Start with more visible angle
            this.wheelieVelocity = 3.5 * (this.wheeliePopMult || 1); // Initial lift (character-dependent)
            this.wheelieStartTime = performance.now();
            this.wheelieScoreAccumulated = 0;
            console.log('===== WHEELIE STARTED! =====');
            console.log('Speed:', this.speed.toFixed(1) + 'm/s (' + (this.speed * 2.237).toFixed(1) + ' mph)');
        }

        // Engine-torque available to lift the front: scales with the bike's
        // wheelie pop, the gear (lower gears make more torque) and the revs.
        const gear = this.currentGear || 0;
        const gearTorque = this.gearTorque ? this.gearTorque[gear] : 1;
        // Lift torque is concentrated at the TOP of the rev range (nothing below
        // ~60% revs, peaking at redline) so the power wheelie only comes up when
        // you're really revving it out - not constantly.
        const revFactor = Math.max(0, Math.min(1, ((this.engineRpm || 0.5) - 0.6) / 0.4));
        // Surplus drive - and so the torque available to lift the front - falls
        // off toward top speed as drag eats the power. Taper the lift to zero as
        // we approach max speed (negligible at low speed, so low-gear wheelies
        // are unaffected).
        const speedFrac = this.maxSpeed > 0 ? this.speed / this.maxSpeed : 0;
        const speedTaper = Math.max(0, 1 - speedFrac * speedFrac);
        const liftRaw = (this.wheeliePopMult || 1) * gearTorque * revFactor * 8.5 * speedTaper;

        // Power wheelie auto-start: when engine torque beats the bike's weight
        // at the flat, the front comes up on throttle alone (punchy bikes, high
        // revs, low gears). No wheelie key needed; it settles below the balance
        // point so throttle can never loop it.
        if (!this.isWheelie && !this.isJumping && !this.crashed &&
            throttleInput > 0.5 && liftRaw > 5.2) {
            this.isWheelie = true;
            this.powerWheelie = true;
            this.wheelieAngle = 0.02;
            this.wheelieVelocity = 0;
            this.wheelieStartTime = performance.now();
            this.wheelieScoreAccumulated = 0;
        }

        if (this.isWheelie) {
            const angleDegrees = this.wheelieAngle * 180 / Math.PI;
            const balanceRad = 1.43; // ~82deg: balanced on the rear wheel
            const balanceFrac = this.wheelieAngle / balanceRad;

            // Restoring (nose-down) torque is strong when the front is low,
            // fades to zero at the balance point, and reverses beyond it (tips
            // into a loop). So a higher wheelie needs less power to hold than a
            // low one - and at the limit you just balance with no input.
            const restoring = 5.0 * (1 - balanceFrac);
            this.wheelieVelocity -= restoring * deltaTime;

            // Throttle lift fades faster than the restoring torque (^1.5), so
            // throttle settles at a stable angle that climbs with revs/torque
            // but stops short of the balance point - throttle alone can't loop.
            if (throttleInput > 0) {
                const fade = Math.pow(Math.max(0, 1 - balanceFrac), 1.5);
                this.wheelieVelocity += throttleInput * liftRaw * fade * deltaTime;
            }

            // Brake brings it down - useful to save from a loop
            if (brakeInput > 0) {
                this.wheelieVelocity -= brakeInput * (5.5 + angleDegrees / 60 * 1.5) * deltaTime;
            }

            // The wheelie key adds deliberate lift that does NOT fade near the
            // balance point, so it (and only it) can ride the bike past balance
            // into a loop. Releasing it lets the front settle back to whatever
            // the throttle alone supports (or down to flat).
            if (wheelieInput > 0) {
                this.powerWheelie = false; // manual control
                this.wheelieVelocity += 3.2 * deltaTime;
            }

            // Update wheelie angle
            this.wheelieAngle += this.wheelieVelocity * deltaTime;
            this.wheelieAngle = Math.max(0, this.wheelieAngle);
            // Don't let downward velocity pile up while resting at 0 (armed
            // power wheelie) - otherwise it lags before popping back up.
            if (this.wheelieAngle <= 0 && this.wheelieVelocity < 0) this.wheelieVelocity = 0;

            // Throttle alone is pinned just below the balance point as a safety
            // net (the physics already settles below it); only the wheelie key
            // can push past into a loop.
            if (wheelieInput === 0 && this.wheelieAngle > balanceRad * 0.97) {
                this.wheelieAngle = balanceRad * 0.97;
                if (this.wheelieVelocity > 0) this.wheelieVelocity = 0;
            }

            // Loop crash - only reachable by riding the wheelie key past balance
            const crashAngleDegrees = 92;
            if (angleDegrees >= crashAngleDegrees) {
                this.crashed = true;
                this.isWheelie = false;
                this.wheelieAngle = 0;
                this.wheelieVelocity = 0;
                console.log('WHEELIE CRASH! Looped at', angleDegrees.toFixed(1) + '°');
                return;
            }

            // SIMPLE FUN SCORING - Just rack up points!
            const wheelieDuration = (performance.now() - this.wheelieStartTime) / 1000;
            
            // Base points based on angle - higher is better (risk vs reward).
            // No points for a flat (~0deg) power-wheelie idle between rev peaks.
            let pointsPerSecond = angleDegrees < 5 ? 0 : 20;
            
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

            // End the wheelie. A power wheelie stays "armed" the whole time
            // you're on the throttle - the front just glides down to 0 between
            // rev peaks instead of ending, so the state never toggles (toggling
            // is what made the bike jump). It only ends when you ease off the
            // throttle or get slow. A manual (key) wheelie ends once it's down.
            const wheelieEnded = this.powerWheelie
                ? (throttleInput < 0.25 || this.speed < 5)
                : (this.wheelieAngle <= 0 || this.speed < 5);
            if (wheelieEnded) {
                this.isWheelie = false;
                this.powerWheelie = false;
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

        // Keep the bike its own colour at all times. The body material is shared
        // with the frame, so the old crash tint recoloured the WHOLE bike red
        // (jarring on e.g. Casper's blue). The CRASHED banner + fall animation
        // carry that feedback now. (The wheelie branch below re-brightens it.)
        if (this.frame) {
            this.frame.material.color.setHex(parseInt(this.bikeColor));
        }

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

            // Pivot about the rear tyre's CONTACT patch. The group origin sits
            // at ground level (the wheels' bottoms are at local y=0), so the
            // pivot's Y is 0. The old value (0.3 - cgHeight = -0.3) wrongly
            // assumed the origin was at CG height; that put the pivot below
            // ground and injected a fore/aft slide ~0.3*sin(angle) - the bike
            // appeared to slide back and forth instead of pivoting cleanly.
            const s = this.group.scale.x || 1; // Casper's bike is scaled down
            const pivotX = 0;
            const pivotY = 0;
            const pivotZ = -0.7 * s; // rear wheel sits 0.7m (x scale) behind centre
            
            // After rotation, this vector becomes:
            const rotatedY = pivotY * cosTheta - pivotZ * sinTheta;
            const rotatedZ = pivotY * sinTheta + pivotZ * cosTheta;
            
            // Translation needed to keep pivot point fixed. The offset is in
            // bike-local axes; rotate it into world space by the heading
            // (applying it raw to world z shoved the bike sideways on any
            // non-axis-aligned heading)
            const localZOffset = pivotZ - rotatedZ;
            this.group.position.y = this.position.y + (pivotY - rotatedY);
            this.group.position.x = this.position.x + Math.sin(this.yawAngle) * localZOffset;
            this.group.position.z = this.position.z + Math.cos(this.yawAngle) * localZOffset;
            
            // Apply lean, reduced as the front comes up. Scaling by angle keeps
            // it continuous with the normal branch at angle 0, so entering or
            // leaving wheelie-mode doesn't snap the roll.
            const wLeanFrac = Math.min(1, this.wheelieAngle / 0.5);
            this.group.rotation.z = this.leanAngle * (1 - 0.7 * wLeanFrac);
            this.rider.rotation.z = this.leanAngle * (0.2 - 0.1 * wLeanFrac);
            
            // Simple visual feedback - bike gets brighter during wheelie,
            // brightening the character's own paint color
            const angleDegrees = this.wheelieAngle * 180 / Math.PI;
            const brightness = 1.0 + (angleDegrees / 90) * 0.5; // Brighter as angle increases
            this.frame.material.color.setRGB(
                Math.min(1, this.baseColorRGB.r * brightness),
                Math.min(1, this.baseColorRGB.g * brightness),
                Math.min(1, this.baseColorRGB.b * brightness)
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
        this.stuntChain = false;
        this.powerWheelie = false;
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

        // Clear trip distance so a RESTART LEG doesn't carry the previous
        // attempt's distance into the average-speed calc. lastPosition is
        // nulled so the first tick after the bike is repositioned doesn't
        // count the teleport as travel.
        this.distanceTraveled = 0;
        this.lastPosition = null;

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
    
    // Ride-over: small rocks get rolled/popped over instead of crashing the
    // bike. What you can clear is set by suspension travel (offroad ability):
    // dirt bike ~0.51m, adventure ~0.46m, scooter ~0.37m, sport ~0.31m.
    // Returns true if the bike cleared the obstacle.
    attemptRideOver(obstacleRadius) {
        if (this.crashed) return false;
        if (obstacleRadius > this.rideOverRadius) return false;
        if (this.isJumping) return true; // already airborne - clears it anyway

        // Pop over it - tiny rocks barely register, near-limit rocks need a
        // real bump and scrub more speed.
        const severity = Math.min(1, obstacleRadius / this.rideOverRadius);
        this.isJumping = true;
        this.jumpStartHeight = this.position.y;
        this.jumpVelocityY = 1.3 + obstacleRadius * 3.5;
        this.jumpRotation = 0;
        this.jumpAngularVel = 0;
        this.jumpWheelSpin = Math.min(this.speed / 60, 0.3);
        this.speed *= 1 - 0.14 * severity;

        console.log(`Rode over a ${obstacleRadius.toFixed(2)}m rock`);
        return true;
    }

    initiateJump(ramp) {
        this.isJumping = true;
        this.jumpStartHeight = this.position.y;
        
        // Calculate jump velocity based on speed and ramp angle
        const jumpAngle = Math.atan2(ramp.height, ramp.length * 0.6); // Approximate ramp angle
        this.jumpVelocityY = Math.sin(jumpAngle) * this.speed * 0.6; // Even higher jump force

        // Better extra lift, scaled by the character's suspension travel
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

        // Rear-wheel-first landing (nose up) at speed flows straight into a
        // wheelie instead of slamming the front back down - and chaining the
        // two stunts pays a bonus (surfaced by main.js checkJumpScoring).
        const noseUp = this.jumpRotation < -0.18; // ~10deg+ front-up
        if (noseUp && landingAngle < Math.PI * 0.42 && this.speed > 8 && !this.crashed) {
            this.isWheelie = true;
            this.wheelieAngle = Math.min(landingAngle, this.wheelieCrashAngle * 0.85);
            this.wheelieVelocity = 1.0; // slight hold so it doesn't instantly drop
            this.wheelieStartTime = performance.now();
            this.wheelieScoreAccumulated = 0;
            this.jumpRotation = 0;
            this.stuntChain = true; // jump -> wheelie combo
            console.log('STUNT CHAIN! Jump landed into a wheelie');
            return;
        }

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