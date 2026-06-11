class Traffic {
    constructor(scene, environment, playerRiderName = null) {
        this.scene = scene;
        this.environment = environment;
        this.playerRiderName = playerRiderName; // Excluded from the AI crew
        this.cars = [];
        this.motorcycles = [];
        this.maxCars = 1;
        this.maxMotorcycles = 5;  // The Touring Crew: Steve, Alex, Shane, Tim, Guy
        this.carSpacing = 250;
        this.motorcycleSpacing = 150;

        this.initializeCars();
        this.initializeMotorcycles();
    }
    
    initializeCars() {
        const totalSegments = this.environment.roadPath.length;
        
        for (let i = 0; i < 1; i++) {
            const startSegment = Math.floor(Math.random() * totalSegments);
            const car = new Car(this.scene, this.environment, {
                direction: -1,
                speed: 15 + Math.random() * 10,
                startSegment: startSegment,
                lane: 'right',
                color: this.getRandomCarColor()
            });
            this.cars.push(car);
        }
    }
    
    initializeMotorcycles() {
        const totalSegments = this.environment.roadPath.length;
        const spacing = Math.floor(totalSegments / this.maxMotorcycles);

        // The Touring Crew - Fixed riders with personalities
        const touringCrew = [
            {
                name: 'Steve',
                skill: 'expert',
                helmet: 0x000000,  // Black
                suit: 0x1a1a1a,    // Dark gray
                bikeColor: 0xff0000, // Red
                baseSpeed: 48 + Math.random() * 8
            },
            {
                name: 'Alex',
                skill: 'fast',
                helmet: 0xff0000,  // Red
                suit: 0x8b0000,    // Dark red
                bikeColor: 0x0000ff, // Blue
                baseSpeed: 42 + Math.random() * 6
            },
            {
                name: 'Shane',
                skill: 'average',
                helmet: 0xffdd00,  // Yellow/gold
                suit: 0x3a3a1a,    // Olive/yellow tint
                bikeColor: 0xffff00, // Yellow
                baseSpeed: 36 + Math.random() * 5
            },
            {
                name: 'Tim',
                skill: 'average',
                helmet: 0xeecc00,  // Gold
                suit: 0x3a3a1a,    // Olive/yellow tint
                bikeColor: 0x00ff00, // Green
                baseSpeed: 36 + Math.random() * 5
            },
            {
                name: 'Guy',
                skill: 'slow',
                helmet: 0xffffff,  // White
                suit: 0x4a4a4a,    // Medium gray
                bikeColor: 0xff8800, // Orange
                baseSpeed: 30 + Math.random() * 5
            }
        ];

        // The player rides as one of the crew - don't spawn their AI double
        const activeCrew = touringCrew.filter(rider => rider.name !== this.playerRiderName);

        for (let i = 0; i < activeCrew.length; i++) {
            const startSegment = (i * spacing + Math.floor(Math.random() * spacing * 0.3)) % totalSegments;
            const riderConfig = activeCrew[i];

            const motorcycle = new AIMotorcycle(this.scene, this.environment, {
                direction: 1,
                speed: riderConfig.baseSpeed,
                startSegment: startSegment,
                lane: 'left',
                color: riderConfig.bikeColor,
                style: 'sport',  // All sport bikes for touring crew
                skill: riderConfig.skill,
                riderName: riderConfig.name,
                helmetColor: riderConfig.helmet,
                suitColor: riderConfig.suit
            });
            this.motorcycles.push(motorcycle);
        }
    }
    
    getRandomBikeColor() {
        const colors = [
            0xff0000,
            0x00ff00,
            0x0000ff,
            0xffff00,
            0xff00ff,
            0x00ffff,
            0xff8800,
            0x8800ff
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    getRandomBikeStyle() {
        const styles = ['sport', 'cruiser', 'naked'];
        return styles[Math.floor(Math.random() * styles.length)];
    }

    getRiderName(skill) {
        const namesBySkill = {
            'expert': [
                'Throttle Bottom',
                'Rev Hardley',
                'Skid Marks',
                'Willy Wheeler'
            ],
            'fast': [
                'Clutch Burner',
                'Brake Wind',
                'Torque McSquirt',
                'Flash Johnson'
            ],
            'average': [
                'Rusty Pipes',
                'Sticky Wicket',
                'Lean Meister',
                'Two Stroke Tony'
            ],
            'slow': [
                'Wheelie Wonka',
                'Putt Putt Patterson',
                'Granny Shifter',
                'Chicken Strips Charlie'
            ]
        };

        const names = namesBySkill[skill] || namesBySkill['average'];
        return names[Math.floor(Math.random() * names.length)];
    }

    getHelmetColorForSkill(skill) {
        const helmetColors = {
            'expert': 0x000000,  // Black (intimidating)
            'fast': 0xff0000,     // Red (aggressive)
            'average': 0xffdd00,  // Yellow/gold (visible)
            'slow': 0xffffff      // White (clean)
        };
        return helmetColors[skill] || 0x000000;
    }

    getRiderSuitColor(skill) {
        const suitColors = {
            'expert': 0x1a1a1a,   // Dark gray (professional)
            'fast': 0x8b0000,     // Dark red (aggressive)
            'average': 0x3a3a1a,  // Olive/yellow tint
            'slow': 0x4a4a4a      // Medium gray
        };
        return suitColors[skill] || 0x2a2a2a;
    }
    
    getRandomCarColor() {
        const colors = [
            0xf5f5f5, // White
            0xc0c0c0, // Silver
            0x1a1a1a, // Black
            0x404040, // Dark gray
            0x606060, // Medium gray
            0x8b0000, // Dark red
            0x1a3a6b, // Navy blue
            0x1b4d1b, // Forest green
            0x2a2a2a, // Charcoal
            0x8b4513, // Saddle brown
            0xd4af6a, // Champagne gold
            0x4a4a4a  // Slate gray
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }
    
    update(deltaTime, playerPosition) {
        let collisionResult = null;
        
        // Update all cars
        this.cars.forEach(car => {
            car.update(deltaTime);
            
            if (!collisionResult && car.checkCollision(playerPosition)) {
                car.onCollision();
                collisionResult = { hit: true, car: car };
            }
        });
        
        // Update all motorcycles with pack dynamics
        this.motorcycles.forEach(motorcycle => {
            motorcycle.update(deltaTime, playerPosition, this.motorcycles, this.cars);
            
            // Collisions with AI motorcycles disabled
            // if (!collisionResult && motorcycle.checkCollision(playerPosition)) {
            //     motorcycle.onCollision();
            //     collisionResult = { hit: true, vehicle: motorcycle };
            // }
        });
        
        if (collisionResult) {
            return collisionResult;
        }
        
        // Check spacing between cars going same direction
        for (let i = 0; i < this.cars.length; i++) {
            for (let j = i + 1; j < this.cars.length; j++) {
                const car1 = this.cars[i];
                const car2 = this.cars[j];
                
                // Only check cars going same direction
                if (car1.direction === car2.direction) {
                    const distance = car1.getDistanceToOtherCar(car2);
                    if (distance < this.carSpacing && distance > 0) {
                        // Slow down the car behind
                        const car1Progress = car1.currentSegment + car1.segmentProgress;
                        const car2Progress = car2.currentSegment + car2.segmentProgress;
                        
                        if (car1.direction === 1) {
                            // Forward direction
                            if (car1Progress < car2Progress) {
                                car1.temporarySlowdown();
                            } else {
                                car2.temporarySlowdown();
                            }
                        } else {
                            // Reverse direction
                            if (car1Progress > car2Progress) {
                                car1.temporarySlowdown();
                            } else {
                                car2.temporarySlowdown();
                            }
                        }
                    }
                }
            }
        }
        
        return { hit: false };
    }
    

    reset() {
        this.cars.forEach(car => car.remove());
        this.motorcycles.forEach(motorcycle => motorcycle.remove());
        this.cars = [];
        this.motorcycles = [];
        this.initializeCars();
        this.initializeMotorcycles();
    }
}

class Car {
    constructor(scene, environment, options) {
        this.scene = scene;
        this.environment = environment;
        this.direction = options.direction || 1;
        this.baseSpeed = options.speed || 20;
        this.currentSpeed = this.baseSpeed;
        this.currentSegment = options.startSegment || 0;
        this.lane = options.lane || 'right';
        this.originalLane = this.lane;
        this.color = options.color || 0xff0000;
        this.segmentProgress = 0;
        this.inDetour = false;
        this.detourSide = null;
        
        this.createCarModel();
        
        // Ensure initial position is on the road
        if (this.environment && this.environment.roadPath && this.environment.roadPath.length > 0) {
            this.updatePosition();
        }
    }
    
    createCarModel() {
        this.carGroup = new THREE.Group();

        // --- One-piece body: 2D side profile swept across the car width ---
        // Shape space: x = car length (+x is the front), y = height.
        // Wheel arches are cut into the bottom edge with arcs.
        // Wheels are centered at y=0 (as before), so the rocker line sits low
        // and the body hugs the road like the previous model.
        const archZ = 1.35;       // wheel arch centers (matches wheel positions)
        const archR = 0.46;       // arch radius (wheel tire radius is 0.32)
        const archCY = 0.0;       // arch center height (wheel axle height)
        const sillY = 0.06;       // bottom of the rocker panel
        const archDX = Math.sqrt(archR * archR - (sillY - archCY) * (sillY - archCY));
        const archAng = Math.asin((sillY - archCY) / archR);

        const bodyShape = new THREE.Shape();
        bodyShape.moveTo(2.0, sillY);                                   // front bottom
        bodyShape.quadraticCurveTo(2.13, 0.08, 2.12, 0.32);             // bumper curve
        bodyShape.lineTo(2.09, 0.48);                                   // front face
        bodyShape.quadraticCurveTo(2.06, 0.58, 1.8, 0.61);              // nose rounds into hood
        bodyShape.lineTo(0.75, 0.72);                                   // hood rises to cowl
        bodyShape.lineTo(-1.2, 0.74);                                   // belt line under cabin
        bodyShape.quadraticCurveTo(-1.85, 0.74, -2.04, 0.6);            // trunk lip
        bodyShape.lineTo(-2.1, 0.4);                                    // rear face
        bodyShape.quadraticCurveTo(-2.13, 0.08, -2.0, sillY);           // rear bumper curve
        bodyShape.lineTo(-archZ - archDX, sillY);                       // bottom to rear arch
        bodyShape.absarc(-archZ, archCY, archR, Math.PI - archAng, archAng, true); // rear arch
        bodyShape.lineTo(archZ - archDX, sillY);                        // rocker between arches
        bodyShape.absarc(archZ, archCY, archR, Math.PI - archAng, archAng, true);  // front arch
        bodyShape.lineTo(2.0, sillY);

        const bodyExtrude = {
            depth: 1.62,
            bevelEnabled: true,
            bevelThickness: 0.09,
            bevelSize: 0.05,
            bevelSegments: 2,
            steps: 1,
            curveSegments: 6
        };
        const bodyGeometry = new THREE.ExtrudeGeometry(bodyShape, bodyExtrude);
        bodyGeometry.translate(0, 0, -bodyExtrude.depth / 2); // center across width
        bodyGeometry.rotateY(-Math.PI / 2);                   // profile x -> world z

        // Decide if this car should be two-tone
        const isTwoTone = Math.random() < 0.25;
        let roofColor = this.color;

        if (isTwoTone) {
            const twoToneOptions = [0x1a1a1a, 0xf5f5f5, 0xc0c0c0];
            roofColor = twoToneOptions[Math.floor(Math.random() * twoToneOptions.length)];
        }

        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: this.color,
            roughness: 0.2,
            metalness: 0.7
        });
        this.body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        this.body.name = 'carBody';
        this.body.castShadow = true;
        this.body.receiveShadow = true;
        this.carGroup.add(this.body);

        // --- Cabin: dark glass greenhouse with slanted windshield/rear ---
        const glassMaterial = new THREE.MeshStandardMaterial({
            color: 0x0a141e,
            roughness: 0.08,
            metalness: 0.6
        });

        const cabinShape = new THREE.Shape();
        cabinShape.moveTo(0.84, 0.7);                          // base of windshield
        cabinShape.quadraticCurveTo(0.5, 1.05, 0.12, 1.22);    // raked windshield
        cabinShape.lineTo(-0.72, 1.24);                        // roof line
        cabinShape.quadraticCurveTo(-1.1, 1.1, -1.4, 0.72);    // fastback rear window
        cabinShape.lineTo(0.84, 0.7);

        const cabinExtrude = {
            depth: 1.42,
            bevelEnabled: true,
            bevelThickness: 0.05,
            bevelSize: 0.03,
            bevelSegments: 2,
            steps: 1,
            curveSegments: 6
        };
        const cabinGeometry = new THREE.ExtrudeGeometry(cabinShape, cabinExtrude);
        cabinGeometry.translate(0, 0, -cabinExtrude.depth / 2);
        cabinGeometry.rotateY(-Math.PI / 2);

        this.cabin = new THREE.Mesh(cabinGeometry, glassMaterial);
        this.cabin.castShadow = true;
        this.cabin.receiveShadow = true;
        this.carGroup.add(this.cabin);

        // Painted roof cap over the glass canopy (carries the two-tone color)
        const roofMaterial = new THREE.MeshStandardMaterial({
            color: roofColor,
            roughness: 0.25,
            metalness: 0.7
        });
        const roofGeometry = new THREE.BoxGeometry(1.36, 0.05, 0.95);
        const roof = new THREE.Mesh(roofGeometry, roofMaterial);
        roof.position.set(0, 1.27, -0.3);
        roof.castShadow = true;
        roof.receiveShadow = true;
        this.carGroup.add(roof);

        // Chrome belt-line trim where glass meets the body
        const chromeMaterial = new THREE.MeshStandardMaterial({
            color: 0xc0c0c0,
            roughness: 0.15,
            metalness: 0.95
        });
        const trimGeometry = new THREE.BoxGeometry(0.02, 0.02, 2.2);

        const leftTrim = new THREE.Mesh(trimGeometry, chromeMaterial);
        leftTrim.position.set(0.74, 0.73, -0.28);
        this.carGroup.add(leftTrim);

        const rightTrim = new THREE.Mesh(trimGeometry, chromeMaterial);
        rightTrim.position.set(-0.74, 0.73, -0.28);
        this.carGroup.add(rightTrim);

        // Wheels - slightly inset so they tuck into the body arches
        const wheelGeometry = new THREE.CylinderGeometry(0.32, 0.32, 0.26, 16);
        const wheelMaterial = new THREE.MeshStandardMaterial({
            color: 0x0d0d0d,
            roughness: 0.98,
            metalness: 0.0
        });

        // Rim with spokes pattern
        const rimOuterGeometry = new THREE.CylinderGeometry(0.22, 0.22, 0.27, 14);
        const rimInnerGeometry = new THREE.CylinderGeometry(0.08, 0.08, 0.28, 10);
        const rimMaterial = new THREE.MeshStandardMaterial({
            color: 0xb0b0b0,
            roughness: 0.25,
            metalness: 0.85
        });

        // Spoke geometry (simple box for performance)
        const spokeGeometry = new THREE.BoxGeometry(0.03, 0.28, 0.16);

        const wheelPositions = [
            { x: 0.76, z: 1.35 },
            { x: -0.76, z: 1.35 },
            { x: 0.76, z: -1.35 },
            { x: -0.76, z: -1.35 }
        ];
        
        this.wheels = [];
        wheelPositions.forEach(pos => {
            const wheelGroup = new THREE.Group();
            
            // Tire
            const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
            wheel.rotation.z = Math.PI / 2;
            wheelGroup.add(wheel);
            
            // Outer rim
            const rimOuter = new THREE.Mesh(rimOuterGeometry, rimMaterial);
            rimOuter.rotation.z = Math.PI / 2;
            wheelGroup.add(rimOuter);
            
            // Inner hub
            const rimInner = new THREE.Mesh(rimInnerGeometry, rimMaterial);
            rimInner.rotation.z = Math.PI / 2;
            wheelGroup.add(rimInner);
            
            // Add 5 spokes
            for (let i = 0; i < 5; i++) {
                const spoke = new THREE.Mesh(spokeGeometry, rimMaterial);
                spoke.rotation.z = Math.PI / 2;
                spoke.rotation.y = (i * Math.PI * 2) / 5;
                wheelGroup.add(spoke);
            }
            
            wheelGroup.position.set(pos.x, 0, pos.z);
            wheelGroup.castShadow = true;
            wheelGroup.receiveShadow = true;
            this.carGroup.add(wheelGroup);
            this.wheels.push(wheelGroup);
        });
        
        // Headlights - swept-back flattened lamp clusters
        const headlightGeometry = new THREE.SphereGeometry(0.11, 10, 6);
        const headlightMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: 0xffffee,
            emissiveIntensity: 0.8,
            roughness: 0.05,
            metalness: 0.5
        });

        const leftHeadlight = new THREE.Mesh(headlightGeometry, headlightMaterial);
        leftHeadlight.position.set(0.58, 0.5, 2.08);
        leftHeadlight.scale.set(1.5, 0.55, 0.7);
        leftHeadlight.castShadow = true;
        this.carGroup.add(leftHeadlight);

        const rightHeadlight = new THREE.Mesh(headlightGeometry, headlightMaterial);
        rightHeadlight.position.set(-0.58, 0.5, 2.08);
        rightHeadlight.scale.set(1.5, 0.55, 0.7);
        rightHeadlight.castShadow = true;
        this.carGroup.add(rightHeadlight);

        // Tail lights - thin wide light bars
        const taillightGeometry = new THREE.BoxGeometry(0.42, 0.12, 0.06);
        const taillightMaterial = new THREE.MeshStandardMaterial({
            color: 0xcc0000,
            emissive: 0xff0000,
            emissiveIntensity: 0.3,
            roughness: 0.1,
            metalness: 0.2
        });

        const leftTaillight = new THREE.Mesh(taillightGeometry, taillightMaterial);
        leftTaillight.position.set(0.45, 0.6, -2.12);
        leftTaillight.castShadow = true;
        this.carGroup.add(leftTaillight);

        const rightTaillight = new THREE.Mesh(taillightGeometry, taillightMaterial);
        rightTaillight.position.set(-0.45, 0.6, -2.12);
        rightTaillight.castShadow = true;
        this.carGroup.add(rightTaillight);

        // Grille - dark intake set into the nose
        const grilleGeometry = new THREE.BoxGeometry(1.05, 0.24, 0.05);
        const grilleMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a,
            roughness: 0.8,
            metalness: 0.3
        });
        const grille = new THREE.Mesh(grilleGeometry, grilleMaterial);
        grille.position.set(0, 0.36, 2.15);
        grille.castShadow = true;
        this.carGroup.add(grille);

        // Bumpers - dark plastic wrapping the nose and tail
        const bumperGeometry = new THREE.BoxGeometry(1.88, 0.16, 0.22);
        const bumperMaterial = new THREE.MeshStandardMaterial({
            color: 0x2a2a2a,
            roughness: 0.7,
            metalness: 0.3
        });

        const frontBumper = new THREE.Mesh(bumperGeometry, bumperMaterial);
        frontBumper.position.set(0, 0.18, 2.08);
        frontBumper.castShadow = true;
        this.carGroup.add(frontBumper);

        const rearBumper = new THREE.Mesh(bumperGeometry, bumperMaterial);
        rearBumper.position.set(0, 0.18, -2.08);
        rearBumper.castShadow = true;
        this.carGroup.add(rearBumper);

        // Side mirrors - body-color housing on a short stalk
        const mirrorMaterial = new THREE.MeshStandardMaterial({
            color: this.color,
            roughness: 0.3,
            metalness: 0.7
        });
        const mirrorStalkGeometry = new THREE.BoxGeometry(0.12, 0.025, 0.03);
        const mirrorHousingGeometry = new THREE.BoxGeometry(0.13, 0.08, 0.1);

        const leftMirrorStalk = new THREE.Mesh(mirrorStalkGeometry, mirrorMaterial);
        leftMirrorStalk.position.set(0.84, 0.84, 0.68);
        this.carGroup.add(leftMirrorStalk);

        const leftMirror = new THREE.Mesh(mirrorHousingGeometry, mirrorMaterial);
        leftMirror.position.set(0.94, 0.86, 0.66);
        leftMirror.castShadow = true;
        this.carGroup.add(leftMirror);

        const rightMirrorStalk = new THREE.Mesh(mirrorStalkGeometry, mirrorMaterial);
        rightMirrorStalk.position.set(-0.84, 0.84, 0.68);
        this.carGroup.add(rightMirrorStalk);

        const rightMirror = new THREE.Mesh(mirrorHousingGeometry, mirrorMaterial);
        rightMirror.position.set(-0.94, 0.86, 0.66);
        rightMirror.castShadow = true;
        this.carGroup.add(rightMirror);

        // License plates
        const plateMaterial = new THREE.MeshStandardMaterial({
            color: 0xf5f5f5,
            roughness: 0.6,
            metalness: 0.1
        });

        const plateGeometry = new THREE.BoxGeometry(0.4, 0.12, 0.02);
        const frontPlate = new THREE.Mesh(plateGeometry, plateMaterial);
        frontPlate.position.set(0, 0.2, 2.2);
        this.carGroup.add(frontPlate);

        const rearPlate = new THREE.Mesh(plateGeometry, plateMaterial);
        rearPlate.position.set(0, 0.42, -2.16);
        this.carGroup.add(rearPlate);

        // Exhaust tips under the rear bumper
        const exhaustTipGeometry = new THREE.CylinderGeometry(0.045, 0.045, 0.12, 10);
        const leftExhaustTip = new THREE.Mesh(exhaustTipGeometry, chromeMaterial);
        leftExhaustTip.rotation.x = Math.PI / 2;
        leftExhaustTip.position.set(0.5, 0.12, -2.16);
        this.carGroup.add(leftExhaustTip);

        const rightExhaustTip = new THREE.Mesh(exhaustTipGeometry, chromeMaterial);
        rightExhaustTip.rotation.x = Math.PI / 2;
        rightExhaustTip.position.set(-0.5, 0.12, -2.16);
        this.carGroup.add(rightExhaustTip);

        // Shark-fin antenna on the roof
        const finMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a,
            roughness: 0.5,
            metalness: 0.3
        });
        const finGeometry = new THREE.ConeGeometry(0.05, 0.13, 6);
        const sharkFin = new THREE.Mesh(finGeometry, finMaterial);
        sharkFin.position.set(0, 1.33, -0.62);
        sharkFin.scale.set(0.5, 1, 1.7);
        sharkFin.rotation.x = -0.2;
        sharkFin.castShadow = true;
        this.carGroup.add(sharkFin);

        // Indicator lights (turn signals)
        const indicatorGeometry = new THREE.BoxGeometry(0.14, 0.07, 0.06);
        const indicatorMaterial = new THREE.MeshStandardMaterial({
            color: 0xff8800,
            emissive: 0x000000,
            emissiveIntensity: 0,
            roughness: 0.3,
            metalness: 0.2
        });

        this.leftFrontIndicator = new THREE.Mesh(indicatorGeometry, indicatorMaterial.clone());
        this.leftFrontIndicator.position.set(0.78, 0.41, 2.15);
        this.carGroup.add(this.leftFrontIndicator);

        this.rightFrontIndicator = new THREE.Mesh(indicatorGeometry, indicatorMaterial.clone());
        this.rightFrontIndicator.position.set(-0.78, 0.41, 2.15);
        this.carGroup.add(this.rightFrontIndicator);

        this.leftRearIndicator = new THREE.Mesh(indicatorGeometry, indicatorMaterial.clone());
        this.leftRearIndicator.position.set(0.8, 0.6, -2.11);
        this.carGroup.add(this.leftRearIndicator);

        this.rightRearIndicator = new THREE.Mesh(indicatorGeometry, indicatorMaterial.clone());
        this.rightRearIndicator.position.set(-0.8, 0.6, -2.11);
        this.carGroup.add(this.rightRearIndicator);
        
        this.indicatorState = 'off';
        this.indicatorTimer = 0;

        // Every mesh casts a shadow (covers wheel internals, trim, lights)
        this.carGroup.traverse(obj => {
            if (obj.isMesh) obj.castShadow = true;
        });

        this.scene.add(this.carGroup);
    }
    
    updatePosition() {
        const totalSegments = this.environment.roadPath.length;
        
        // Ensure currentSegment is valid
        const safeCurrentSegment = Math.floor(this.currentSegment) % totalSegments;
        const actualCurrentSegment = safeCurrentSegment < 0 ? safeCurrentSegment + totalSegments : safeCurrentSegment;
        
        const currentPoint = this.environment.roadPath[actualCurrentSegment];
        const nextSegment = (actualCurrentSegment + 1) % totalSegments;
        const nextPoint = this.environment.roadPath[nextSegment];
        
        // Interpolate position between segments
        const t = this.segmentProgress;
        const x = currentPoint.x + (nextPoint.x - currentPoint.x) * t;
        const y = currentPoint.y + (nextPoint.y - currentPoint.y) * t;
        const z = currentPoint.z + (nextPoint.z - currentPoint.z) * t;
        
        // Interpolate heading for smoother turns
        let headingDiff = nextPoint.heading - currentPoint.heading;
        // Handle wrap-around
        if (headingDiff > Math.PI) headingDiff -= 2 * Math.PI;
        if (headingDiff < -Math.PI) headingDiff += 2 * Math.PI;
        const interpolatedHeading = currentPoint.heading + headingDiff * t;
        
        // Calculate lane offset based on interpolated heading
        let laneOffset;
        if (this.inDetour) {
            // Use detour lane with wider offset to avoid construction
            if (this.detourSide === 'far-left') {
                laneOffset = -6; // Far left for opposite direction avoiding construction
            } else if (this.detourSide === 'left') {
                laneOffset = -5; // Left lane to avoid right lane construction
            } else {
                laneOffset = 5; // Right detour
            }
        } else {
            // Normal lane position
            laneOffset = this.lane === 'left' ? -3 : 3;
        }
        const perpX = Math.cos(interpolatedHeading) * laneOffset;
        const perpZ = -Math.sin(interpolatedHeading) * laneOffset;
        
        // Ensure car is placed at correct road elevation
        const roadElevation = y || 0;
        // Lower the car to sit properly on the road (wheels are 0.3 radius)
        this.carGroup.position.set(x + perpX, roadElevation, z + perpZ);
        
        // Calculate the car's facing direction based on movement
        // The car should look where it's going
        let facingAngle;
        
        if (this.direction === 1) {
            // Forward - calculate angle from current to next position
            const dx = nextPoint.x - currentPoint.x;
            const dz = nextPoint.z - currentPoint.z;
            facingAngle = Math.atan2(dx, dz);
        } else {
            // Backward - opposite direction
            const dx = currentPoint.x - nextPoint.x;
            const dz = currentPoint.z - nextPoint.z;
            facingAngle = Math.atan2(dx, dz);
        }
        
        this.carGroup.rotation.y = facingAngle;
    }
    
    update(deltaTime) {
        // Check for roadworks and adjust lane if needed
        this.checkForRoadworks();
        
        // Update indicator lights
        this.indicatorTimer += deltaTime;
        const blinkRate = 0.5;
        const isBlinkOn = Math.floor(this.indicatorTimer / blinkRate) % 2 === 0;
        
        if (this.inDetour && this.detourSide) {
            this.indicatorState = this.detourSide.includes('left') ? 'left' : 'right';
        } else {
            this.indicatorState = 'off';
        }
        
        const emissiveIntensity = isBlinkOn ? 0.6 : 0;
        if (this.indicatorState === 'left') {
            this.leftFrontIndicator.material.emissive.setHex(0xff8800);
            this.leftFrontIndicator.material.emissiveIntensity = emissiveIntensity;
            this.leftRearIndicator.material.emissive.setHex(0xff8800);
            this.leftRearIndicator.material.emissiveIntensity = emissiveIntensity;
            this.rightFrontIndicator.material.emissiveIntensity = 0;
            this.rightRearIndicator.material.emissiveIntensity = 0;
        } else if (this.indicatorState === 'right') {
            this.rightFrontIndicator.material.emissive.setHex(0xff8800);
            this.rightFrontIndicator.material.emissiveIntensity = emissiveIntensity;
            this.rightRearIndicator.material.emissive.setHex(0xff8800);
            this.rightRearIndicator.material.emissiveIntensity = emissiveIntensity;
            this.leftFrontIndicator.material.emissiveIntensity = 0;
            this.leftRearIndicator.material.emissiveIntensity = 0;
        } else {
            this.leftFrontIndicator.material.emissiveIntensity = 0;
            this.leftRearIndicator.material.emissiveIntensity = 0;
            this.rightFrontIndicator.material.emissiveIntensity = 0;
            this.rightRearIndicator.material.emissiveIntensity = 0;
        }
        
        // Move along the road
        const segmentLength = 20;
        
        // Store previous speed for brake light logic
        if (!this.previousSpeed) this.previousSpeed = this.currentSpeed;
        const speedChange = this.currentSpeed - this.previousSpeed;
        
        // Brake lights when decelerating
        if (speedChange < -0.5) {
            this.leftRearIndicator.material.emissive.setHex(0xff0000);
            this.leftRearIndicator.material.emissiveIntensity = 1.0;
            this.rightRearIndicator.material.emissive.setHex(0xff0000);
            this.rightRearIndicator.material.emissiveIntensity = 1.0;
        } else if (this.indicatorState === 'off') {
            this.leftRearIndicator.material.emissiveIntensity = 0;
            this.rightRearIndicator.material.emissiveIntensity = 0;
        }
        
        this.previousSpeed = this.currentSpeed;
        
        const distanceToMove = this.currentSpeed * deltaTime;
        const segmentsToMove = distanceToMove / segmentLength;
        
        // Rotate wheels based on speed
        if (!this.wheelRotation) this.wheelRotation = 0;
        const wheelCircumference = 2 * Math.PI * 0.32;
        const rotationSpeed = this.currentSpeed / wheelCircumference;
        this.wheelRotation += rotationSpeed * deltaTime * this.direction;
        
        if (this.wheels) {
            this.wheels.forEach(wheel => {
                wheel.rotation.x = this.wheelRotation;
            });
        }
        
        this.segmentProgress += segmentsToMove * this.direction;
        
        // Handle segment transitions
        while (this.segmentProgress >= 1) {
            this.segmentProgress -= 1;
            this.currentSegment += 1;
        }
        
        while (this.segmentProgress < 0) {
            this.segmentProgress += 1;
            this.currentSegment -= 1;
        }
        
        // Check if car needs to wrap around
        const totalSegments = this.environment.roadPath.length;
        const previousSegment = this.currentSegment;
        
        // Hide car during wrap-around transition
        if (this.currentSegment >= totalSegments || this.currentSegment < 0) {
            this.carGroup.visible = false;
            
            // Wrap around
            this.currentSegment = ((this.currentSegment % totalSegments) + totalSegments) % totalSegments;
            
            // Make visible again after a brief delay to ensure smooth transition
            setTimeout(() => {
                this.carGroup.visible = true;
            }, 100);
        } else {
            // Ensure car is visible during normal driving
            if (!this.carGroup.visible) {
                this.carGroup.visible = true;
            }
        }
        
        // Restore speed if slowed down
        if (this.currentSpeed < this.baseSpeed) {
            this.currentSpeed += 10 * deltaTime;
            if (this.currentSpeed > this.baseSpeed) {
                this.currentSpeed = this.baseSpeed;
            }
        }
        
        this.updatePosition();
    }
    
    temporarySlowdown() {
        this.currentSpeed = this.baseSpeed * 0.5;
    }
    
    checkCollision(playerPosition) {
        const dx = this.carGroup.position.x - playerPosition.x;
        const dy = this.carGroup.position.y - playerPosition.y;
        const dz = this.carGroup.position.z - playerPosition.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        
        // More accurate collision detection considering actual vehicle sizes
        // Car is about 1.9 units wide, 4.2 units long
        // Motorcycle is much smaller, so reduce threshold
        const collisionThreshold = 2.2; // Reduced from 3.0 for more accurate collision
        return distance < collisionThreshold;
    }
    
    onCollision() {
        // Flash the car body red briefly on collision
        const originalColor = this.body.material.color.getHex();
        this.body.material.color.setHex(0xff0000);
        this.body.material.emissive = new THREE.Color(0xff0000);
        this.body.material.emissiveIntensity = 0.3;
        
        // Reset after a short delay
        setTimeout(() => {
            this.body.material.color.setHex(originalColor);
            this.body.material.emissive = new THREE.Color(0x000000);
            this.body.material.emissiveIntensity = 0;
        }, 200);
    }
    
    getDistanceToOtherCar(otherCar) {
        const dx = this.carGroup.position.x - otherCar.carGroup.position.x;
        const dz = this.carGroup.position.z - otherCar.carGroup.position.z;
        return Math.sqrt(dx * dx + dz * dz);
    }
    
    remove() {
        this.scene.remove(this.carGroup);
        disposeGroupResources(this.carGroup);
    }

    checkForRoadworks() {
        if (!this.environment.roadworksZones) return;
        
        const currentSegmentIndex = Math.floor(this.currentSegment);
        let inConstructionZone = false;
        
        // Check if we're approaching or in a construction zone
        for (const zone of this.environment.roadworksZones) {
            // Check much earlier - 10 segments before to properly merge
            const approachDistance = 10;
            const exitDistance = 3;
            
            if (this.direction === 1) {
                // Moving forward
                if (currentSegmentIndex >= zone.startSegment - approachDistance && 
                    currentSegmentIndex <= zone.endSegment + exitDistance) {
                    inConstructionZone = true;
                    
                    // All traffic should move to left lane for right lane closure
                    // Force both lanes to merge left to avoid construction
                    if (zone.blockedLane === 'right') {
                        this.enterDetour('left');
                    }
                }
            } else {
                // Moving backward (opposite direction)
                if (currentSegmentIndex <= zone.endSegment + approachDistance && 
                    currentSegmentIndex >= zone.startSegment - exitDistance) {
                    inConstructionZone = true;
                    
                    // For opposite direction, also avoid construction
                    // Since we're going backward, merge appropriately
                    if (zone.blockedLane === 'right') {
                        // Opposite traffic also needs to avoid the construction area
                        this.enterDetour('far-left');
                    }
                }
            }
        }
        
        // Exit detour if we're past the construction zone
        if (!inConstructionZone && this.inDetour) {
            this.exitDetour();
        }
    }
    
    enterDetour(newLane) {
        if (!this.inDetour) {
            this.inDetour = true;
            this.detourSide = newLane;
            console.log(`Car entering detour, moving from ${this.lane} to ${newLane} lane`);
            this.currentSpeed = Math.min(this.currentSpeed, this.baseSpeed * 0.4);
        } else if (this.detourSide !== newLane) {
            this.detourSide = newLane;
            this.currentSpeed = Math.min(this.currentSpeed, this.baseSpeed * 0.4);
        }
    }
    
    exitDetour() {
        if (this.inDetour) {
            console.log(`Car exiting detour, returning to normal lane`);
            this.inDetour = false;
            this.detourSide = null;
        }
    }
}

class AIMotorcycle {
    constructor(scene, environment, options) {
        this.scene = scene;
        this.environment = environment;
        this.direction = options.direction || 1;
        this.baseSpeed = options.speed || 35;
        this.currentSpeed = this.baseSpeed;
        this.currentSegment = options.startSegment || 0;
        this.lane = options.lane || 'left';
        this.color = options.color || 0xff0000;
        this.style = options.style || 'sport';
        this.segmentProgress = 0;
        this.leanAngle = 0;
        this.overtaking = false;
        this.overtakeProgress = 0;

        // Rider identity
        this.riderName = options.riderName || 'Unknown Rider';
        this.helmetColor = options.helmetColor || 0x000000;
        this.suitColor = options.suitColor || 0x2a2a2a;
        this.skill = options.skill || 'average';

        this.createBikeModel();

        if (this.environment && this.environment.roadPath && this.environment.roadPath.length > 0) {
            this.updatePosition();
        }

        // Log rider identity for debugging
        console.log(`AI Rider spawned: ${this.riderName} (${this.skill}) on ${this.style} bike`);
    }
    
    createBikeModel() {
        this.bikeGroup = new THREE.Group();
        
        // Tire material
        const tireMaterial = new THREE.MeshStandardMaterial({
            color: 0x0d0d0d,
            roughness: 0.98,
            metalness: 0.0
        });

        // Rim material - colored for variety
        const rimMaterial = new THREE.MeshStandardMaterial({
            color: 0xb0b0b0,  // Silver/chrome
            roughness: 0.2,
            metalness: 0.9
        });

        // Rear wheel with spokes
        const rearWheelGroup = new THREE.Group();

        const rearTireGeometry = new THREE.CylinderGeometry(0.3, 0.3, 0.12, 16);
        const rearTire = new THREE.Mesh(rearTireGeometry, tireMaterial);
        rearTire.rotation.z = Math.PI / 2;
        rearWheelGroup.add(rearTire);

        const rearRimGeometry = new THREE.CylinderGeometry(0.18, 0.18, 0.13, 14);
        const rearRim = new THREE.Mesh(rearRimGeometry, rimMaterial);
        rearRim.rotation.z = Math.PI / 2;
        rearWheelGroup.add(rearRim);

        const rearHubGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.14, 10);
        const rearHub = new THREE.Mesh(rearHubGeometry, rimMaterial);
        rearHub.rotation.z = Math.PI / 2;
        rearWheelGroup.add(rearHub);

        // 5 spokes for AI bikes (simpler than player)
        const rearSpokeGeometry = new THREE.BoxGeometry(0.02, 0.14, 0.1);
        for (let i = 0; i < 5; i++) {
            const spoke = new THREE.Mesh(rearSpokeGeometry, rimMaterial);
            spoke.rotation.z = Math.PI / 2;
            spoke.rotation.y = (i * Math.PI * 2) / 5;
            rearWheelGroup.add(spoke);
        }

        rearWheelGroup.position.set(0, 0.3, -0.6);
        rearWheelGroup.castShadow = true;
        this.rearWheel = rearWheelGroup;
        this.bikeGroup.add(rearWheelGroup);

        // Front wheel with spokes
        const frontWheelGroup = new THREE.Group();

        const frontTireGeometry = new THREE.CylinderGeometry(0.28, 0.28, 0.11, 16);
        const frontTire = new THREE.Mesh(frontTireGeometry, tireMaterial);
        frontTire.rotation.z = Math.PI / 2;
        frontWheelGroup.add(frontTire);

        const frontRimGeometry = new THREE.CylinderGeometry(0.17, 0.17, 0.12, 14);
        const frontRim = new THREE.Mesh(frontRimGeometry, rimMaterial);
        frontRim.rotation.z = Math.PI / 2;
        frontWheelGroup.add(frontRim);

        const frontHubGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.13, 10);
        const frontHub = new THREE.Mesh(frontHubGeometry, rimMaterial);
        frontHub.rotation.z = Math.PI / 2;
        frontWheelGroup.add(frontHub);

        // 5 spokes
        const frontSpokeGeometry = new THREE.BoxGeometry(0.02, 0.13, 0.1);
        for (let i = 0; i < 5; i++) {
            const spoke = new THREE.Mesh(frontSpokeGeometry, rimMaterial);
            spoke.rotation.z = Math.PI / 2;
            spoke.rotation.y = (i * Math.PI * 2) / 5;
            frontWheelGroup.add(spoke);
        }

        frontWheelGroup.position.set(0, 0.3, 0.6);
        frontWheelGroup.castShadow = true;
        this.frontWheel = frontWheelGroup;
        this.bikeGroup.add(frontWheelGroup);
        
        const isSport = this.style === 'sport';
        const isCruiser = this.style === 'cruiser';

        // Shared materials
        const frameMaterial = new THREE.MeshStandardMaterial({
            color: this.color,
            roughness: 0.18,
            metalness: 0.85
        });
        const darkMetalMaterial = new THREE.MeshStandardMaterial({
            color: 0x2a2a2a,
            roughness: 0.5,
            metalness: 0.7
        });
        const chromeMaterial = new THREE.MeshStandardMaterial({
            color: 0xc0c0c0,
            roughness: 0.1,
            metalness: 1.0
        });
        const glassMaterial = new THREE.MeshStandardMaterial({
            color: 0x0a141e,
            roughness: 0.08,
            metalness: 0.6
        });

        // Frame spine (mostly hidden behind tank/fairings)
        const frameGeometry = isCruiser
            ? new THREE.BoxGeometry(0.1, 0.4, 1.1)
            : new THREE.BoxGeometry(0.08, 0.45, 0.95);
        this.frame = new THREE.Mesh(frameGeometry, frameMaterial);
        this.frame.position.set(0, 0.5, 0);
        this.frame.castShadow = true;
        this.bikeGroup.add(this.frame);

        // Front forks - paired tubes from the headstock down to the front axle
        const forkGeometry = new THREE.CylinderGeometry(0.022, 0.022, 0.52, 6);
        const forkTilt = -Math.atan2(0.18, 0.46); // top of the forks rakes rearward
        [-0.07, 0.07].forEach(x => {
            const fork = new THREE.Mesh(forkGeometry, chromeMaterial);
            fork.position.set(x, 0.53, 0.51);
            fork.rotation.x = forkTilt;
            fork.castShadow = true;
            this.bikeGroup.add(fork);
        });

        // Handlebar across the headstock
        const handlebarGeometry = new THREE.CylinderGeometry(0.018, 0.018, 0.36, 6);
        const handlebar = new THREE.Mesh(handlebarGeometry, darkMetalMaterial);
        handlebar.rotation.z = Math.PI / 2;
        handlebar.position.set(0, 0.8, 0.42);
        handlebar.castShadow = true;
        this.bikeGroup.add(handlebar);

        // Swingarm to the rear axle
        const swingarmGeometry = new THREE.BoxGeometry(0.03, 0.06, 0.55);
        [-0.08, 0.08].forEach(x => {
            const swingarm = new THREE.Mesh(swingarmGeometry, darkMetalMaterial);
            swingarm.position.set(x, 0.33, -0.34);
            swingarm.rotation.x = 0.12;
            swingarm.castShadow = true;
            this.bikeGroup.add(swingarm);
        });

        // Sculpted fuel tank - a squashed sphere reads as a teardrop tank
        const tankGeometry = new THREE.SphereGeometry(0.16, 10, 8);
        this.tank = new THREE.Mesh(tankGeometry, frameMaterial);
        this.tank.position.set(0, 0.74, 0.12);
        if (isSport) {
            this.tank.scale.set(1.05, 0.85, 1.9);
        } else if (isCruiser) {
            this.tank.scale.set(1.2, 0.75, 1.7);
        } else {
            this.tank.scale.set(0.9, 0.7, 1.5);
        }
        this.tank.castShadow = true;
        this.bikeGroup.add(this.tank);

        // Fairings for sport bikes only
        if (isSport) {
            // Nose fairing - smooth rounded cowl around the headlight
            const noseGeometry = new THREE.SphereGeometry(0.18, 10, 8);
            this.frontFairing = new THREE.Mesh(noseGeometry, frameMaterial);
            this.frontFairing.position.set(0, 0.64, 0.55);
            this.frontFairing.scale.set(1.0, 1.25, 1.55);
            this.frontFairing.castShadow = true;
            this.bikeGroup.add(this.frontFairing);

            // Windscreen - raked dark glass above the nose
            const windscreenGeometry = new THREE.BoxGeometry(0.24, 0.2, 0.02);
            this.windscreen = new THREE.Mesh(windscreenGeometry, glassMaterial);
            this.windscreen.position.set(0, 0.9, 0.46);
            this.windscreen.rotation.x = -0.65;
            this.windscreen.castShadow = true;
            this.bikeGroup.add(this.windscreen);

            // Side fairings - smooth bulges along the flanks
            const sideFairingGeometry = new THREE.SphereGeometry(0.14, 8, 6);
            this.leftSideFairing = new THREE.Mesh(sideFairingGeometry, frameMaterial);
            this.leftSideFairing.position.set(-0.13, 0.52, 0.1);
            this.leftSideFairing.scale.set(0.5, 1.3, 2.6);
            this.leftSideFairing.castShadow = true;
            this.bikeGroup.add(this.leftSideFairing);

            this.rightSideFairing = new THREE.Mesh(sideFairingGeometry, frameMaterial);
            this.rightSideFairing.position.set(0.13, 0.52, 0.1);
            this.rightSideFairing.scale.set(0.5, 1.3, 2.6);
            this.rightSideFairing.castShadow = true;
            this.bikeGroup.add(this.rightSideFairing);

            // Tail section - pointed cone kicked up behind the seat
            const tailGeometry = new THREE.ConeGeometry(0.13, 0.5, 8);
            this.tailSection = new THREE.Mesh(tailGeometry, frameMaterial);
            this.tailSection.rotation.x = -Math.PI / 2 - 0.15; // apex rearward, kicked up
            this.tailSection.position.set(0, 0.68, -0.42);
            this.tailSection.scale.set(1.2, 1, 0.7);
            this.tailSection.castShadow = true;
            this.bikeGroup.add(this.tailSection);
        }

        const seatGeometry = new THREE.BoxGeometry(0.26, 0.08, 0.38);
        const seatMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a,
            roughness: 0.8,
            metalness: 0.0
        });
        this.seat = new THREE.Mesh(seatGeometry, seatMaterial);
        this.seat.position.set(0, 0.62, -0.2);
        this.seat.castShadow = true;
        this.bikeGroup.add(this.seat);

        // Rider - capsule torso in a tuck, arms reaching to the bars
        const riderMaterial = new THREE.MeshStandardMaterial({
            color: this.suitColor,  // Use rider's custom suit color
            roughness: 0.65,
            metalness: 0.15
        });
        const crouch = isSport ? 0.7 : (isCruiser ? 0.2 : 0.4);

        const torsoGeometry = new THREE.CapsuleGeometry(0.11, 0.28, 4, 8);
        this.rider = new THREE.Mesh(torsoGeometry, riderMaterial);
        this.rider.position.set(0, 1.0 - crouch * 0.12, -0.08);
        this.rider.rotation.x = crouch;
        this.rider.castShadow = true;
        this.bikeGroup.add(this.rider);

        // Arms to the handlebar
        const armGeometry = new THREE.CapsuleGeometry(0.035, 0.26, 4, 6);
        [-0.13, 0.13].forEach(x => {
            const arm = new THREE.Mesh(armGeometry, riderMaterial);
            arm.position.set(x, 0.93 - crouch * 0.1, 0.16);
            arm.rotation.x = 0.9 + crouch * 0.3;
            arm.castShadow = true;
            this.bikeGroup.add(arm);
        });

        // Thighs gripping the tank
        const legGeometry = new THREE.CapsuleGeometry(0.05, 0.2, 4, 6);
        [-0.14, 0.14].forEach(x => {
            const leg = new THREE.Mesh(legGeometry, riderMaterial);
            leg.position.set(x, 0.68, -0.12);
            leg.rotation.x = 1.2;
            leg.castShadow = true;
            this.bikeGroup.add(leg);
        });

        // Rounded helmet with dark visor, tipped forward with the tuck
        const helmetGeometry = new THREE.SphereGeometry(0.13, 12, 8);
        const helmetMaterial = new THREE.MeshStandardMaterial({
            color: this.helmetColor,  // Use rider's custom helmet color
            roughness: 0.15,
            metalness: 0.6
        });
        this.helmet = new THREE.Mesh(helmetGeometry, helmetMaterial);
        this.helmet.position.set(0, 1.3 - crouch * 0.18, -0.08 + crouch * 0.18);
        this.helmet.scale.set(0.95, 1, 1.1);
        this.helmet.castShadow = true;
        this.bikeGroup.add(this.helmet);

        const visorGeometry = new THREE.SphereGeometry(0.115, 8, 6);
        this.visor = new THREE.Mesh(visorGeometry, glassMaterial);
        this.visor.position.set(
            0,
            this.helmet.position.y - 0.01,
            this.helmet.position.z + 0.05
        );
        this.visor.scale.set(0.8, 0.55, 0.95);
        this.bikeGroup.add(this.visor);

        // Exhaust - upswept can on sport bikes, low pipe otherwise
        const exhaustGeometry = new THREE.CylinderGeometry(0.045, 0.03, 0.5, 10);
        const exhaustMaterial = new THREE.MeshStandardMaterial({
            color: 0xc0c0c0,
            roughness: 0.1,
            metalness: 1.0
        });
        this.exhaust = new THREE.Mesh(exhaustGeometry, exhaustMaterial);
        if (isSport) {
            this.exhaust.rotation.x = Math.PI / 2 + 0.3;
            this.exhaust.position.set(0.14, 0.45, -0.42);
        } else {
            this.exhaust.rotation.x = Math.PI / 2;
            this.exhaust.position.set(0.14, 0.32, -0.35);
        }
        this.exhaust.castShadow = true;
        this.bikeGroup.add(this.exhaust);

        // Dark exhaust tip
        const exhaustTipGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.06, 10);
        const exhaustTip = new THREE.Mesh(exhaustTipGeometry, darkMetalMaterial);
        exhaustTip.rotation.copy(this.exhaust.rotation);
        if (isSport) {
            exhaustTip.position.set(0.14, 0.37, -0.65);
        } else {
            exhaustTip.position.set(0.14, 0.32, -0.61);
        }
        exhaustTip.castShadow = true;
        this.bikeGroup.add(exhaustTip);

        const brakeLightGeometry = new THREE.BoxGeometry(0.08, 0.04, 0.03);
        const brakeLightMaterial = new THREE.MeshStandardMaterial({
            color: 0xff0000,
            emissive: 0x000000,
            emissiveIntensity: 0,
            roughness: 0.3,
            metalness: 0.2
        });
        this.brakeLight = new THREE.Mesh(brakeLightGeometry, brakeLightMaterial);
        this.brakeLight.position.set(0, 0.74, -0.66);
        this.brakeLight.castShadow = true;
        this.bikeGroup.add(this.brakeLight);

        // Headlight - flattened lens set into the nose
        const headlightGeometry = new THREE.SphereGeometry(0.07, 10, 6);
        const headlightMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: 0xffffee,
            emissiveIntensity: 0.6,
            roughness: 0.1,
            metalness: 0.4
        });
        this.headlight = new THREE.Mesh(headlightGeometry, headlightMaterial);
        this.headlight.position.set(0, 0.64, isSport ? 0.72 : 0.6);
        this.headlight.scale.set(1.1, 0.7, 0.6);
        this.headlight.castShadow = true;
        this.bikeGroup.add(this.headlight);

        const numberPlateGeometry = new THREE.BoxGeometry(0.12, 0.06, 0.01);
        const numberPlateMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.7,
            metalness: 0.1
        });
        this.numberPlate = new THREE.Mesh(numberPlateGeometry, numberPlateMaterial);
        this.numberPlate.position.set(0, 0.6, -0.68);
        this.numberPlate.castShadow = true;
        this.bikeGroup.add(this.numberPlate);
        
        this.isBraking = false;

        // Every mesh casts a shadow (covers wheel internals, visor, forks)
        this.bikeGroup.traverse(obj => {
            if (obj.isMesh) obj.castShadow = true;
        });

        this.scene.add(this.bikeGroup);
    }
    
    updatePosition() {
        const totalSegments = this.environment.roadPath.length;
        const safeCurrentSegment = Math.floor(this.currentSegment) % totalSegments;
        const actualCurrentSegment = safeCurrentSegment < 0 ? safeCurrentSegment + totalSegments : safeCurrentSegment;
        
        const currentPoint = this.environment.roadPath[actualCurrentSegment];
        const nextSegment = (actualCurrentSegment + 1) % totalSegments;
        const nextPoint = this.environment.roadPath[nextSegment];
        
        const t = this.segmentProgress;
        const x = currentPoint.x + (nextPoint.x - currentPoint.x) * t;
        const y = currentPoint.y + (nextPoint.y - currentPoint.y) * t;
        const z = currentPoint.z + (nextPoint.z - currentPoint.z) * t;
        
        let headingDiff = nextPoint.heading - currentPoint.heading;
        if (headingDiff > Math.PI) headingDiff -= 2 * Math.PI;
        if (headingDiff < -Math.PI) headingDiff += 2 * Math.PI;
        const interpolatedHeading = currentPoint.heading + headingDiff * t;
        
        let laneOffset = this.lane === 'left' ? -3 : 3;
        
        // Add pack lateral offset for natural spread
        if (this.packLateralOffset) {
            laneOffset += this.packLateralOffset;
        }
        
        if (this.overtaking) {
            const overtakeLaneOffset = Math.sin(this.overtakeProgress * Math.PI) * 2;
            laneOffset += overtakeLaneOffset;
        }
        
        const perpX = Math.cos(interpolatedHeading) * laneOffset;
        const perpZ = -Math.sin(interpolatedHeading) * laneOffset;
        
        const roadElevation = y || 0;
        this.bikeGroup.position.set(x + perpX, roadElevation, z + perpZ);
        
        const dx = nextPoint.x - currentPoint.x;
        const dz = nextPoint.z - currentPoint.z;
        const facingAngle = Math.atan2(dx, dz);
        
        // Calculate turn rate based on heading change
        let headingChange = nextPoint.heading - currentPoint.heading;
        if (headingChange > Math.PI) headingChange -= 2 * Math.PI;
        if (headingChange < -Math.PI) headingChange += 2 * Math.PI;
        
        // Calculate lean angle based on turn rate and speed (motorcycle physics)
        // Lean = arctan(v² * turnRate / g)
        const turnRate = Math.abs(headingChange) * 0.5;
        const speedSquared = this.currentSpeed * this.currentSpeed;
        const targetLean = -Math.atan((speedSquared * turnRate) / (9.81 * 8)) * Math.sign(headingChange);
        
        // Smoothly interpolate to target lean angle
        const leanSpeed = 3.0;
        this.leanAngle += (targetLean - this.leanAngle) * leanSpeed * (this.currentDeltaTime || 0.016);
        
        // Clamp lean angle to realistic limits
        const maxLean = Math.PI / 3; // 60 degrees max
        this.leanAngle = Math.max(-maxLean, Math.min(maxLean, this.leanAngle));
        
        this.bikeGroup.rotation.y = facingAngle;
        this.bikeGroup.rotation.z = this.leanAngle;
    }
    
    update(deltaTime, playerPosition, allBikes, allCars) {
        this.currentDeltaTime = deltaTime;
        const segmentLength = 20;
        const distanceToMove = this.currentSpeed * deltaTime;
        const segmentsToMove = distanceToMove / segmentLength;
        
        if (!this.wheelRotation) this.wheelRotation = 0;
        const wheelCircumference = 2 * Math.PI * 0.3;
        const rotationSpeed = this.currentSpeed / wheelCircumference;
        this.wheelRotation += rotationSpeed * deltaTime;
        this.rearWheel.rotation.x = this.wheelRotation;
        this.frontWheel.rotation.x = this.wheelRotation;
        
        const previousSpeed = this.currentSpeed;
        
        // "Ahead" is measured as progress along the road path, not world +Z -
        // on a winding course the road frequently heads in -Z, where raw z
        // comparisons invert (drafting off bikes behind, braking for cars behind)
        const myProgress = this.currentSegment + this.segmentProgress;

        // Check for nearby bikes (pack dynamics)
        let nearestBikeAhead = null;
        let minDistanceAhead = Infinity;

        if (allBikes) {
            allBikes.forEach(otherBike => {
                if (otherBike !== this && otherBike.bikeGroup) {
                    const otherProgress = otherBike.currentSegment + otherBike.segmentProgress;
                    const aheadMeters = (otherProgress - myProgress) * segmentLength;

                    if (aheadMeters > 0 && aheadMeters < minDistanceAhead) {
                        minDistanceAhead = aheadMeters;
                        nearestBikeAhead = otherBike;
                    }
                }
            });
        }

        // Check for cars ahead and avoid (the Traffic owner passes its car
        // list - traversing the whole scene graph per bike per tick is O(scene))
        let carAhead = false;
        if (allCars) {
            for (const car of allCars) {
                if (!car.carGroup) continue;
                const carProgress = car.currentSegment + car.segmentProgress;
                const aheadMeters = (carProgress - myProgress) * segmentLength;

                if (aheadMeters > 0 && aheadMeters < 25) {
                    carAhead = true;
                    break;
                }
            }
        }
        
        if (carAhead) {
            this.currentSpeed = Math.min(this.currentSpeed, this.baseSpeed * 0.7);
        } else if (nearestBikeAhead && minDistanceAhead < 15) {
            // Pack riding - match speed with slight increase for drafting effect
            const draftBoost = minDistanceAhead < 10 ? 1.4 : 1.35;
            this.currentSpeed = Math.min(this.baseSpeed * draftBoost, 58);
            
            // Small lateral variation for pack dynamics
            if (!this.packLateralOffset) this.packLateralOffset = 0;
            const targetOffset = (Math.random() - 0.5) * 1.5;
            this.packLateralOffset += (targetOffset - this.packLateralOffset) * 0.05;
        } else if (playerPosition) {
            const dx = this.bikeGroup.position.x - playerPosition.x;
            const dz = this.bikeGroup.position.z - playerPosition.z;
            const distanceToPlayer = Math.sqrt(dx * dx + dz * dz);
            
            // More aggressive pursuit when close to player
            if (distanceToPlayer < 30 && distanceToPlayer > 10) {
                this.currentSpeed = Math.min(this.baseSpeed * 1.28, 54);
            } else if (distanceToPlayer < 10) {
                this.currentSpeed = Math.min(this.baseSpeed * 1.35, 56);
                this.overtaking = true;
            } else {
                this.currentSpeed = this.baseSpeed;
                this.packLateralOffset = 0;
            }
        } else {
            this.currentSpeed = this.baseSpeed;
            this.packLateralOffset = 0;
        }
        
        this.isBraking = this.currentSpeed < previousSpeed;
        if (this.isBraking) {
            this.brakeLight.material.emissive.setHex(0xff0000);
            this.brakeLight.material.emissiveIntensity = 1.0;
        } else {
            this.brakeLight.material.emissive.setHex(0x000000);
            this.brakeLight.material.emissiveIntensity = 0;
        }
        
        if (this.overtaking) {
            this.overtakeProgress = Math.min(1, this.overtakeProgress + deltaTime * 0.8);
            this.leanAngle = Math.sin(this.overtakeProgress * Math.PI) * 0.2;
            
            // Move to side during overtake
            const overtakeLaneOffset = Math.sin(this.overtakeProgress * Math.PI) * 2;
            
            if (this.overtakeProgress >= 1) {
                this.overtaking = false;
                this.overtakeProgress = 0;
                this.leanAngle = 0;
            }
        }
        
        this.segmentProgress += segmentsToMove * this.direction;
        
        while (this.segmentProgress >= 1) {
            this.segmentProgress -= 1;
            this.currentSegment += 1;
        }
        
        while (this.segmentProgress < 0) {
            this.segmentProgress += 1;
            this.currentSegment -= 1;
        }
        
        const totalSegments = this.environment.roadPath.length;
        if (this.currentSegment >= totalSegments || this.currentSegment < 0) {
            this.bikeGroup.visible = false;
            this.currentSegment = ((this.currentSegment % totalSegments) + totalSegments) % totalSegments;
            setTimeout(() => {
                this.bikeGroup.visible = true;
            }, 100);
        } else {
            if (!this.bikeGroup.visible) {
                this.bikeGroup.visible = true;
            }
        }
        
        this.updatePosition();
    }
    
    checkCollision(playerPosition) {
        const dx = this.bikeGroup.position.x - playerPosition.x;
        const dy = this.bikeGroup.position.y - playerPosition.y;
        const dz = this.bikeGroup.position.z - playerPosition.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        return distance < 0.8;
    }
    
    onCollision() {
        const originalColor = this.frame.material.color.getHex();
        this.frame.material.color.setHex(0xff0000);
        setTimeout(() => {
            this.frame.material.color.setHex(originalColor);
        }, 200);
    }
    
    remove() {
        this.scene.remove(this.bikeGroup);
        disposeGroupResources(this.bikeGroup);
    }
}

// Free GPU resources for a removed vehicle - every Car/AIMotorcycle builds
// dozens of unique geometries and materials, and Traffic.reset() rebuilds the
// whole fleet, so removal without disposal leaks WebGL buffers
function disposeGroupResources(group) {
    if (!group) return;
    group.traverse(obj => {
        if (obj.geometry) {
            obj.geometry.dispose();
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