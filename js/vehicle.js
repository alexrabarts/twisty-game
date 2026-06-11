class Vehicle {
    constructor(scene, onWheelieScore = null) {
        this.scene = scene;
        this.onWheelieScore = onWheelieScore;
        
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
        
        this.createMesh();
    }

    createMesh() {
        this.group = new THREE.Group();
        
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

        // Frame - improved shape with fuel tank
        const frameGeometry = new THREE.BoxGeometry(0.1, 0.8, 1.2);
        this.bikeColor = localStorage.getItem('playerBikeColor') || '0x1a4db3';
        const bikeColorHex = parseInt(this.bikeColor);
        const frameMaterial = new THREE.MeshStandardMaterial({ color: bikeColorHex, roughness: 0.3, metalness: 0.7 });
        this.frame = new THREE.Mesh(frameGeometry, frameMaterial);
        this.frame.position.set(0, 0.6, 0);
        this.frame.castShadow = true;
        this.frame.receiveShadow = true;
        
        // Fuel tank - sculpted with realistic contours
        const tankGeometry = new THREE.BoxGeometry(0.35, 0.28, 0.6, 4, 3, 4);

        // Sculpt the tank with vertex manipulation for realistic shape
        const tankVertices = tankGeometry.attributes.position;
        for (let i = 0; i < tankVertices.count; i++) {
            const x = tankVertices.getX(i);
            const y = tankVertices.getY(i);
            const z = tankVertices.getZ(i);

            // Create wider middle, tapered front/rear
            const distFromCenter = Math.abs(z);
            const taperFactor = Math.max(0, 1 - (distFromCenter / 0.3) * 0.5);

            // Widen the middle of the tank
            if (Math.abs(x) > 0.05) {
                tankVertices.setX(i, x * (1 + taperFactor * 0.25));
            }

            // Round the top surface
            if (y > 0) {
                const roundingFactor = 1 - (distFromCenter / 0.3) * 0.15;
                tankVertices.setY(i, y * (1 + roundingFactor * 0.3));
            }

            // Create knee grip indents on the sides
            if (Math.abs(x) > 0.15 && Math.abs(z) < 0.15 && Math.abs(y) < 0.1) {
                tankVertices.setX(i, x * 0.88);
            }
        }
        tankGeometry.computeVertexNormals();

        const tankMaterial = new THREE.MeshStandardMaterial({
            color: bikeColorHex,
            roughness: 0.15,  // Glossy racing finish
            metalness: 0.85
        });
        this.fuelTank = new THREE.Mesh(tankGeometry, tankMaterial);
        this.fuelTank.position.set(0, 0.85, 0.2);
        this.fuelTank.castShadow = true;
        this.fuelTank.receiveShadow = true;
        
        // Racing stripes on tank
        const stripeGeometry = new THREE.BoxGeometry(0.08, 0.26, 0.52);
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
        this.tankStripe.position.set(0, 0.86, 0.2);
        this.tankStripe.castShadow = true;

        // Front fairing - sculpted aerodynamic nose
        const frontFairingGeometry = new THREE.BoxGeometry(0.42, 0.55, 0.35, 3, 3, 3);

        // Sculpt the front fairing for aerodynamic shape
        const fairingVertices = frontFairingGeometry.attributes.position;
        for (let i = 0; i < fairingVertices.count; i++) {
            const x = fairingVertices.getX(i);
            const y = fairingVertices.getY(i);
            const z = fairingVertices.getZ(i);

            // Create pointed nose (taper toward front)
            if (z > 0.1) {
                const taperAmount = (z - 0.1) / 0.25;
                fairingVertices.setX(i, x * (1 - taperAmount * 0.4));
                fairingVertices.setY(i, y * (1 - taperAmount * 0.25));
            }

            // Round the top edges
            if (y > 0.2) {
                fairingVertices.setY(i, y * 1.1);
            }

            // Create headlight cavity (indent in front)
            if (z > 0.12 && Math.abs(y) < 0.15) {
                fairingVertices.setZ(i, z * 0.92);
            }
        }
        frontFairingGeometry.computeVertexNormals();

        const fairingMaterial = new THREE.MeshStandardMaterial({
            color: bikeColorHex,
            roughness: 0.15,
            metalness: 0.85
        });
        this.frontFairing = new THREE.Mesh(frontFairingGeometry, fairingMaterial);
        this.frontFairing.position.set(0, 0.68, 0.72);
        this.frontFairing.castShadow = true;
        this.frontFairing.receiveShadow = true;

        // Integrated headlight (sits in fairing cavity)
        const headlightGeometry = new THREE.BoxGeometry(0.22, 0.15, 0.08);
        const headlightMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: 0xffffee,
            emissiveIntensity: 0.8,
            roughness: 0.05,
            metalness: 0.3
        });
        this.headlight = new THREE.Mesh(headlightGeometry, headlightMaterial);
        this.headlight.position.set(0, 0.68, 0.86);
        this.headlight.castShadow = true;
        this.headlight.receiveShadow = true;

        // Ram air intakes (small dark vents on fairing)
        const intakeGeometry = new THREE.BoxGeometry(0.08, 0.12, 0.04);
        const intakeMaterial = new THREE.MeshStandardMaterial({
            color: 0x0a0a0a,
            roughness: 0.9,
            metalness: 0.1
        });

        this.leftIntake = new THREE.Mesh(intakeGeometry, intakeMaterial);
        this.leftIntake.position.set(-0.15, 0.62, 0.82);
        this.leftIntake.castShadow = true;

        this.rightIntake = new THREE.Mesh(intakeGeometry, intakeMaterial);
        this.rightIntake.position.set(0.15, 0.62, 0.82);
        this.rightIntake.castShadow = true;

        // Side fairings - connecting front to tail
        const sideFairingGeometry = new THREE.BoxGeometry(0.12, 0.42, 0.95, 2, 3, 5);

        // Sculpt side fairings for smooth flow
        const sideFairingVertices = sideFairingGeometry.attributes.position;
        for (let i = 0; i < sideFairingVertices.count; i++) {
            const x = sideFairingVertices.getX(i);
            const y = sideFairingVertices.getY(i);
            const z = sideFairingVertices.getZ(i);

            // Taper toward rear slightly
            if (z < -0.2) {
                const taperAmount = Math.abs(z + 0.2) / 0.35;
                sideFairingVertices.setX(i, x * (1 - taperAmount * 0.15));
            }

            // Curve outward in middle for aerodynamics
            if (Math.abs(z) < 0.25) {
                const bulgeFactor = 1 - Math.abs(z) / 0.25;
                if (Math.abs(x) > 0.03) {
                    sideFairingVertices.setX(i, x * (1 + bulgeFactor * 0.15));
                }
            }

            // Flow smoothly from top to bottom
            if (y < -0.1) {
                const flowFactor = Math.abs(y + 0.1) / 0.2;
                sideFairingVertices.setY(i, y * (1 + flowFactor * 0.08));
            }
        }
        sideFairingGeometry.computeVertexNormals();

        const sideFairingMaterial = new THREE.MeshStandardMaterial({
            color: bikeColorHex,
            roughness: 0.15,
            metalness: 0.85
        });

        this.leftSideFairing = new THREE.Mesh(sideFairingGeometry, sideFairingMaterial);
        this.leftSideFairing.position.set(-0.22, 0.58, 0.08);
        this.leftSideFairing.castShadow = true;
        this.leftSideFairing.receiveShadow = true;

        this.rightSideFairing = new THREE.Mesh(sideFairingGeometry, sideFairingMaterial);
        this.rightSideFairing.position.set(0.22, 0.58, 0.08);
        this.rightSideFairing.castShadow = true;
        this.rightSideFairing.receiveShadow = true;

        // Brake light
        const brakeGeometry = new THREE.BoxGeometry(0.05, 0.05, 0.05);
        const brakeMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0x000000, emissiveIntensity: 0.0 });
        this.brakeLight = new THREE.Mesh(brakeGeometry, brakeMaterial);
        this.brakeLight.position.set(0, 0.8, -0.6);
        this.brakeLight.castShadow = true;
        this.brakeLight.receiveShadow = true;
        
        // Rear number plate
        const numberPlateGeometry = new THREE.BoxGeometry(0.15, 0.08, 0.01);
        const numberPlateMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xf5f5f5,
            roughness: 0.6,
            metalness: 0.1
        });
        this.numberPlate = new THREE.Mesh(numberPlateGeometry, numberPlateMaterial);
        this.numberPlate.position.set(0, 0.65, -0.72);
        this.numberPlate.castShadow = true;
        
        // Racing windscreen with double-bubble profile
        const windscreenGeometry = new THREE.BoxGeometry(0.38, 0.42, 0.04, 4, 4, 2);

        // Sculpt the windscreen for double-bubble racing profile
        const windscreenVertices = windscreenGeometry.attributes.position;
        for (let i = 0; i < windscreenVertices.count; i++) {
            const x = windscreenVertices.getX(i);
            const y = windscreenVertices.getY(i);
            const z = windscreenVertices.getZ(i);

            // Create double-bubble (two peaks for aerodynamics)
            if (y > 0.12) {
                const distFromCenter = Math.abs(x);
                const bubbleFactor = distFromCenter < 0.12 ?
                    (1 - distFromCenter / 0.12) * 0.18 : 0;
                windscreenVertices.setZ(i, z + bubbleFactor);
            }

            // Curve the top edge backward
            if (y > 0.15) {
                const curveFactor = (y - 0.15) / 0.25;
                windscreenVertices.setZ(i, z - curveFactor * 0.08);
            }

            // Widen toward the top for better coverage
            if (y > 0.1 && Math.abs(x) > 0.12) {
                const widenFactor = (y - 0.1) / 0.3;
                windscreenVertices.setX(i, x * (1 + widenFactor * 0.12));
            }
        }
        windscreenGeometry.computeVertexNormals();

        const windscreenMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a2a3a,
            roughness: 0.02,
            metalness: 0.05,
            transparent: true,
            opacity: 0.3
        });
        this.windscreen = new THREE.Mesh(windscreenGeometry, windscreenMaterial);
        this.windscreen.position.set(0, 1.05, 0.52);
        this.windscreen.rotation.x = -0.28;
        this.windscreen.castShadow = true;

        // Handlebars
        const handlebarGeometry = new THREE.BoxGeometry(0.6, 0.05, 0.05);
        const handlebarMaterial = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.4, metalness: 0.9 });
        this.handlebar = new THREE.Mesh(handlebarGeometry, handlebarMaterial);
        this.handlebar.position.set(0, 1.0, 0.6);
        this.handlebar.castShadow = true;
        this.handlebar.receiveShadow = true;

        // Mirrors
        const mirrorGeometry = new THREE.BoxGeometry(0.1, 0.1, 0.05);
        const mirrorMaterial = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.1, metalness: 0.9 });
        this.leftMirror = new THREE.Mesh(mirrorGeometry, mirrorMaterial);
        this.leftMirror.position.set(-0.4, 1.1, 0.5);
        this.leftMirror.castShadow = true;
        this.leftMirror.receiveShadow = true;
        this.rightMirror = new THREE.Mesh(mirrorGeometry, mirrorMaterial);
        this.rightMirror.position.set(0.4, 1.1, 0.5);
        this.rightMirror.castShadow = true;
        this.rightMirror.receiveShadow = true;

        // Racing tail section / rear cowl (replaces simple seat)
        const tailGeometry = new THREE.BoxGeometry(0.42, 0.35, 0.65, 3, 3, 4);

        // Sculpt the tail for race-style pointed rear
        const tailVertices = tailGeometry.attributes.position;
        for (let i = 0; i < tailVertices.count; i++) {
            const x = tailVertices.getX(i);
            const y = tailVertices.getY(i);
            const z = tailVertices.getZ(i);

            // Create pointed tail (taper toward rear)
            if (z < -0.15) {
                const taperAmount = Math.abs(z + 0.15) / 0.35;
                tailVertices.setX(i, x * (1 - taperAmount * 0.65));
                tailVertices.setY(i, y * (1 - taperAmount * 0.3));
            }

            // Upswept rear section (racing style)
            if (z < -0.1) {
                const liftAmount = Math.abs(z + 0.1) / 0.3;
                tailVertices.setY(i, y + liftAmount * 0.12);
            }

            // Rounded top surface
            if (y > 0) {
                tailVertices.setY(i, y * 1.15);
            }
        }
        tailGeometry.computeVertexNormals();

        const tailMaterial = new THREE.MeshStandardMaterial({
            color: bikeColorHex,
            roughness: 0.15,
            metalness: 0.85
        });
        this.tailSection = new THREE.Mesh(tailGeometry, tailMaterial);
        this.tailSection.position.set(0, 0.72, -0.25);
        this.tailSection.castShadow = true;
        this.tailSection.receiveShadow = true;

        // Seat (sits on top of tail section)
        const seatGeometry = new THREE.BoxGeometry(0.32, 0.08, 0.38, 3, 2, 3);

        // Sculpt seat with rider depression
        const seatVertices = seatGeometry.attributes.position;
        for (let i = 0; i < seatVertices.count; i++) {
            const y = seatVertices.getY(i);
            const z = seatVertices.getZ(i);

            // Create dip in middle for rider
            if (Math.abs(z) < 0.12 && y > -0.02) {
                seatVertices.setY(i, y * 0.7);
            }
        }
        seatGeometry.computeVertexNormals();

        const seatMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a,
            roughness: 0.9,
            metalness: 0.0
        });
        this.seat = new THREE.Mesh(seatGeometry, seatMaterial);
        this.seat.position.set(0, 0.88, -0.15);
        this.seat.castShadow = true;
        this.seat.receiveShadow = true;

        // Rider
        const riderGeometry = new THREE.BoxGeometry(0.3, 0.6, 0.2);
        const riderMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6, metalness: 0.1 });
        this.rider = new THREE.Mesh(riderGeometry, riderMaterial);
        this.rider.position.set(0, 1.2, 0);
        this.rider.castShadow = true;
        this.rider.receiveShadow = true;

        // Legs - positioned more realistically on footpegs
        const legGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.4, 8);
        const legMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a4a, roughness: 0.7, metalness: 0.1 });
        this.leftLeg = new THREE.Mesh(legGeometry, legMaterial);
        this.leftLeg.position.set(-0.12, -0.45, -0.05);
        this.leftLeg.rotation.z = 0.15;
        this.leftLeg.castShadow = true;
        this.leftLeg.receiveShadow = true;
        this.rider.add(this.leftLeg);

        this.rightLeg = new THREE.Mesh(legGeometry, legMaterial);
        this.rightLeg.position.set(0.12, -0.45, -0.05);
        this.rightLeg.rotation.z = -0.15;
        this.rightLeg.castShadow = true;
        this.rightLeg.receiveShadow = true;
        this.rider.add(this.rightLeg);

        // Helmet
        const helmetGeometry = new THREE.SphereGeometry(0.15, 8, 6);
        const helmetMaterial = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.9, metalness: 0.0 });
        this.helmet = new THREE.Mesh(helmetGeometry, helmetMaterial);
        this.helmet.position.set(0, 0.25, 0);
        this.helmet.castShadow = true;
        this.helmet.receiveShadow = true;
        this.rider.add(this.helmet);
        
        // Helmet visor
        const visorGeometry = new THREE.SphereGeometry(0.16, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
        const visorMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x1a1a1a, 
            roughness: 0.1, 
            metalness: 0.3,
            transparent: true,
            opacity: 0.6
        });
        this.visor = new THREE.Mesh(visorGeometry, visorMaterial);
        this.visor.position.set(0, 0.25, 0);
        this.visor.rotation.x = -0.1;
        this.rider.add(this.visor);

        // Footpegs
        const footpegGeometry = new THREE.BoxGeometry(0.08, 0.02, 0.04);
        const footpegMaterial = new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 0.4, metalness: 0.8 });
        
        this.leftFootpeg = new THREE.Mesh(footpegGeometry, footpegMaterial);
        this.leftFootpeg.position.set(-0.2, 0.35, -0.2);
        this.leftFootpeg.castShadow = true;
        
        this.rightFootpeg = new THREE.Mesh(footpegGeometry, footpegMaterial);
        this.rightFootpeg.position.set(0.2, 0.35, -0.2);
        this.rightFootpeg.castShadow = true;

        // Exhaust pipes - chrome
        const exhaustGeometry = new THREE.CylinderGeometry(0.04, 0.05, 0.6, 12);
        const exhaustMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xc0c0c0, 
            roughness: 0.1, 
            metalness: 1.0,
            emissive: 0x331100,
            emissiveIntensity: 0.1
        });
        
        this.leftExhaust = new THREE.Mesh(exhaustGeometry, exhaustMaterial);
        this.leftExhaust.rotation.x = Math.PI / 2;
        this.leftExhaust.rotation.z = -0.2;
        this.leftExhaust.position.set(-0.15, 0.4, -0.5);
        this.leftExhaust.castShadow = true;
        this.leftExhaust.receiveShadow = true;
        
        this.rightExhaust = new THREE.Mesh(exhaustGeometry, exhaustMaterial);
        this.rightExhaust.rotation.x = Math.PI / 2;
        this.rightExhaust.rotation.z = 0.2;
        this.rightExhaust.position.set(0.15, 0.4, -0.5);
        this.rightExhaust.castShadow = true;
        this.rightExhaust.receiveShadow = true;

        this.group.add(this.rearWheel);
        this.group.add(this.rearDisc);
        this.group.add(this.rearCaliper);
        this.group.add(this.leftFork);
        this.group.add(this.rightFork);
        this.group.add(this.frontWheel);
        this.group.add(this.frontDisc);
        this.group.add(this.frontCaliper);
        this.group.add(this.frame);
        this.group.add(this.fuelTank);
        this.group.add(this.tankStripe);
        this.group.add(this.frontFairing);
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
        
        this.scene.add(this.group);
    }

    update(deltaTime, steeringInput, throttleInput, brakeInput, wheelieInput = 0) {
        // Store inputs for use in updateMesh
        this.currentBrakeInput = brakeInput;
        this.currentDeltaTime = deltaTime;
        
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



                // Check terrain collision - sample terrain height at current position
                const terrainHeight = this.getTerrainHeightAt(this.position.x, this.position.z);
                
                // Check if hit terrain or lake
                if (this.position.y <= terrainHeight + 0.5) {
                    // Hit the terrain/slope
                    this.position.y = terrainHeight + 0.5; // Place bike on terrain
                    
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
            this.wheelieVelocity = 3.5; // Stronger initial lift
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
                const throttleSensitivity = 5.2 + (angleDegrees / 60) * 0.8;
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
            // Fall over animation
            this.group.rotation.z = this.crashAngle > 0 ? Math.PI/2 : -Math.PI/2;
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
        // Sample the terrain height at the given position
        // Start with lake level
        let baseHeight = -80;
        
        // Check if we're near the road - if so, use road height.
        // Windowed search: this runs several times per tick while falling
        // (calculateSlopeNormal samples it 5x), so a full path scan is costly.
        // Use a wider window since a falling bike can drift from the road.
        if (this.environment && this.environment.roadPath) {
            // Find closest road segment
            let closestDist = Infinity;
            let closestHeight = baseHeight;

            const terrainRange = this.getSegmentSearchRange(25);
            for (let i = terrainRange.start; i <= terrainRange.end; i++) {
                const point = this.environment.roadPath[i];
                const dx = x - point.x;
                const dz = z - point.z;
                const dist = Math.sqrt(dx * dx + dz * dz);

                if (dist < closestDist && dist < 100) { // Within 100 units of road
                    closestDist = dist;
                    closestHeight = point.y || 0;

                    // Interpolate height based on distance from road
                    if (dist > 20) {
                        // Slope down from road to lake
                        const slopeFactor = (dist - 20) / 80; // 0 at road edge, 1 at lake
                        closestHeight = closestHeight + (baseHeight - closestHeight) * slopeFactor;
                    }
                }
            }

            if (closestDist < 100) {
                return closestHeight;
            }
        }
        
        // Default to lake level if far from road
        return baseHeight;
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

        // Better extra lift
        this.jumpVelocityY += 2.5;
        
        // Add some forward rotation for style
        this.jumpRotation = 0;
        
        console.log('JUMPING! Speed:', (this.speed * 2.237).toFixed(1) + ' mph, Launch velocity:', this.jumpVelocityY.toFixed(1));
    }
    
    updateJump(deltaTime, throttleInput, brakeInput) {
        // Apply gravity
        this.jumpVelocityY -= 9.81 * deltaTime * 2; // Double gravity for arcade feel
        
        // Update vertical position
        this.position.y += this.jumpVelocityY * deltaTime;
        
        // Control rotation with throttle/brake for skill-based landing
        // Throttle pitches forward (nose down), brake pitches backward (nose up)
        const rotationControl = (throttleInput - brakeInput) * deltaTime * 3;
        this.jumpRotation += rotationControl;
        
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