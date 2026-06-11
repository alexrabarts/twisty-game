class Traffic {
    constructor(scene, environment) {
        this.scene = scene;
        this.environment = environment;
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

        for (let i = 0; i < this.maxMotorcycles; i++) {
            const startSegment = (i * spacing + Math.floor(Math.random() * spacing * 0.3)) % totalSegments;
            const riderConfig = touringCrew[i];

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
        
        // Main car body - sleeker with subdivisions for smoother look
        const bodyGeometry = new THREE.BoxGeometry(1.9, 0.9, 4.2, 2, 2, 3);
        
        // Modify vertices to create a more car-like shape
        const bodyVertices = bodyGeometry.attributes.position;
        for (let i = 0; i < bodyVertices.count; i++) {
            const y = bodyVertices.getY(i);
            const z = bodyVertices.getZ(i);
            
            // Taper the front and back
            if (z > 1.5) {
                // Front taper
                bodyVertices.setY(i, y * 0.7);
            } else if (z < -1.5) {
                // Rear taper
                bodyVertices.setY(i, y * 0.8);
            }
        }
        bodyGeometry.computeVertexNormals();
        
        // Decide if this car should be two-tone
        const isTwoTone = Math.random() < 0.25;
        let roofColor = this.color;
        
        if (isTwoTone) {
            const twoToneOptions = [0x1a1a1a, 0xf5f5f5, 0xc0c0c0];
            roofColor = twoToneOptions[Math.floor(Math.random() * twoToneOptions.length)];
        }
        
        const bodyMaterial = new THREE.MeshStandardMaterial({ 
            color: this.color,
            roughness: 0.25,
            metalness: 0.75
        });
        this.body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        this.body.name = 'carBody';
        this.body.position.y = 0.18;
        this.body.castShadow = true;
        this.body.receiveShadow = true;
        this.carGroup.add(this.body);
        
        // Car cabin/greenhouse - more streamlined
        const cabinGeometry = new THREE.BoxGeometry(1.75, 0.8, 2.0, 2, 2, 2);
        
        // Modify cabin vertices for a sloped windshield and rear
        const cabinVertices = cabinGeometry.attributes.position;
        for (let i = 0; i < cabinVertices.count; i++) {
            const y = cabinVertices.getY(i);
            const z = cabinVertices.getZ(i);
            
            // Slope windshield
            if (z > 0.5 && y > 0) {
                cabinVertices.setZ(i, z - y * 0.3);
            }
            // Slope rear window
            if (z < -0.5 && y > 0) {
                cabinVertices.setZ(i, z + y * 0.25);
            }
        }
        cabinGeometry.computeVertexNormals();
        
        const cabinMaterial = new THREE.MeshStandardMaterial({ 
            color: roofColor,
            roughness: 0.3,
            metalness: 0.7
        });
        this.cabin = new THREE.Mesh(cabinGeometry, cabinMaterial);
        this.cabin.position.y = 0.83;
        this.cabin.position.z = -0.3;
        this.cabin.castShadow = true;
        this.cabin.receiveShadow = true;
        this.carGroup.add(this.cabin);
        
        // Windows - using planes for cleaner look
        const windowMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x1a2a3a,
            roughness: 0.05,
            metalness: 0.6,
            opacity: 0.5,
            transparent: true
        });
        
        // Windshield
        const windshieldGeometry = new THREE.PlaneGeometry(1.65, 0.65);
        const windshield = new THREE.Mesh(windshieldGeometry, windowMaterial);
        windshield.position.set(0, 0.98, 0.65);
        windshield.rotation.x = -0.35;
        this.carGroup.add(windshield);
        
        // Rear window
        const rearWindowGeometry = new THREE.PlaneGeometry(1.6, 0.55);
        const rearWindow = new THREE.Mesh(rearWindowGeometry, windowMaterial);
        rearWindow.position.set(0, 0.93, -1.25);
        rearWindow.rotation.x = 0.3;
        this.carGroup.add(rearWindow);
        
        // Side windows - front
        const frontSideWindowGeometry = new THREE.PlaneGeometry(0.9, 0.55);
        const leftFrontWindow = new THREE.Mesh(frontSideWindowGeometry, windowMaterial);
        leftFrontWindow.position.set(0.88, 0.93, 0.1);
        leftFrontWindow.rotation.y = Math.PI / 2;
        this.carGroup.add(leftFrontWindow);
        
        const rightFrontWindow = new THREE.Mesh(frontSideWindowGeometry, windowMaterial);
        rightFrontWindow.position.set(-0.88, 0.93, 0.1);
        rightFrontWindow.rotation.y = -Math.PI / 2;
        this.carGroup.add(rightFrontWindow);
        
        // Side windows - rear
        const rearSideWindowGeometry = new THREE.PlaneGeometry(0.8, 0.5);
        const leftRearWindow = new THREE.Mesh(rearSideWindowGeometry, windowMaterial);
        leftRearWindow.position.set(0.88, 0.88, -0.85);
        leftRearWindow.rotation.y = Math.PI / 2;
        this.carGroup.add(leftRearWindow);
        
        const rightRearWindow = new THREE.Mesh(rearSideWindowGeometry, windowMaterial);
        rightRearWindow.position.set(-0.88, 0.88, -0.85);
        rightRearWindow.rotation.y = -Math.PI / 2;
        this.carGroup.add(rightRearWindow);
        
        // Chrome window trim
        const chromeMaterial = new THREE.MeshStandardMaterial({
            color: 0xc0c0c0,
            roughness: 0.15,
            metalness: 0.95
        });
        
        // Window trim strips
        const trimGeometry = new THREE.BoxGeometry(1.8, 0.02, 0.02);
        
        // Left side trim
        const leftTrim = new THREE.Mesh(trimGeometry, chromeMaterial);
        leftTrim.position.set(0.88, 1.22, -0.3);
        leftTrim.rotation.y = Math.PI / 2;
        this.carGroup.add(leftTrim);

        // Right side trim
        const rightTrim = new THREE.Mesh(trimGeometry, chromeMaterial);
        rightTrim.position.set(-0.88, 1.22, -0.3);
        rightTrim.rotation.y = Math.PI / 2;
        this.carGroup.add(rightTrim);
        
        // Wheels with better detail
        const wheelGeometry = new THREE.CylinderGeometry(0.32, 0.32, 0.28, 20);
        const wheelMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x0d0d0d,
            roughness: 0.98,
            metalness: 0.0
        });
        
        // Rim with spokes pattern
        const rimOuterGeometry = new THREE.CylinderGeometry(0.22, 0.22, 0.29, 16);
        const rimInnerGeometry = new THREE.CylinderGeometry(0.08, 0.08, 0.3, 12);
        const rimMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xb0b0b0,
            roughness: 0.25,
            metalness: 0.85
        });
        
        // Spoke geometry (simple box for performance)
        const spokeGeometry = new THREE.BoxGeometry(0.03, 0.3, 0.16);
        
        const wheelPositions = [
            { x: 0.85, z: 1.35 },
            { x: -0.85, z: 1.35 },
            { x: 0.85, z: -1.35 },
            { x: -0.85, z: -1.35 }
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
        
        // Headlights - circular for more realistic look
        const headlightGeometry = new THREE.CylinderGeometry(0.15, 0.18, 0.08, 12);
        const headlightMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xffffff,
            emissive: 0xffffee,
            emissiveIntensity: 0.8,
            roughness: 0.05,
            metalness: 0.5
        });
        
        const leftHeadlight = new THREE.Mesh(headlightGeometry, headlightMaterial);
        leftHeadlight.position.set(0.65, 0.18, 2.12);
        leftHeadlight.rotation.z = Math.PI / 2;
        this.carGroup.add(leftHeadlight);
        
        const rightHeadlight = new THREE.Mesh(headlightGeometry, headlightMaterial);
        rightHeadlight.position.set(-0.65, 0.18, 2.12);
        rightHeadlight.rotation.z = Math.PI / 2;
        this.carGroup.add(rightHeadlight);
        
        // Tail lights - wider and flatter
        const taillightGeometry = new THREE.BoxGeometry(0.35, 0.2, 0.08);
        const taillightMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xcc0000,
            emissive: 0xff0000,
            emissiveIntensity: 0.3,
            roughness: 0.1,
            metalness: 0.2
        });
        
        const leftTaillight = new THREE.Mesh(taillightGeometry, taillightMaterial);
        leftTaillight.position.set(0.65, 0.23, -2.12);
        this.carGroup.add(leftTaillight);
        
        const rightTaillight = new THREE.Mesh(taillightGeometry, taillightMaterial);
        rightTaillight.position.set(-0.65, 0.23, -2.12);
        this.carGroup.add(rightTaillight);
        
        // Add grille
        const grilleGeometry = new THREE.PlaneGeometry(1.2, 0.4);
        const grilleMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a,
            roughness: 0.8,
            metalness: 0.3
        });
        const grille = new THREE.Mesh(grilleGeometry, grilleMaterial);
        grille.position.set(0, 0.4, 2.11);
        this.carGroup.add(grille);
        
        // Add bumpers
        const bumperGeometry = new THREE.BoxGeometry(1.95, 0.15, 0.25);
        const bumperMaterial = new THREE.MeshStandardMaterial({
            color: 0x2a2a2a,
            roughness: 0.7,
            metalness: 0.3
        });
        
        const frontBumper = new THREE.Mesh(bumperGeometry, bumperMaterial);
        frontBumper.position.set(0, 0.25, 2.15);
        this.carGroup.add(frontBumper);
        
        const rearBumper = new THREE.Mesh(bumperGeometry, bumperMaterial);
        rearBumper.position.set(0, 0.25, -2.15);
        this.carGroup.add(rearBumper);
        
        // Add simple side mirrors
        const mirrorGeometry = new THREE.BoxGeometry(0.08, 0.06, 0.12);
        const mirrorMaterial = new THREE.MeshStandardMaterial({
            color: this.color,
            roughness: 0.3,
            metalness: 0.7
        });
        
        const leftMirror = new THREE.Mesh(mirrorGeometry, mirrorMaterial);
        leftMirror.position.set(0.98, 1.0, 0.3);
        this.carGroup.add(leftMirror);
        
        const rightMirror = new THREE.Mesh(mirrorGeometry, mirrorMaterial);
        rightMirror.position.set(-0.98, 1.0, 0.3);
        this.carGroup.add(rightMirror);
        
        // License plates
        const plateMaterial = new THREE.MeshStandardMaterial({
            color: 0xf5f5f5,
            roughness: 0.6,
            metalness: 0.1
        });
        
        const frontPlateGeometry = new THREE.BoxGeometry(0.4, 0.12, 0.02);
        const frontPlate = new THREE.Mesh(frontPlateGeometry, plateMaterial);
        frontPlate.position.set(0, 0.15, 2.18);
        this.carGroup.add(frontPlate);
        
        const rearPlateGeometry = new THREE.BoxGeometry(0.4, 0.12, 0.02);
        const rearPlate = new THREE.Mesh(rearPlateGeometry, plateMaterial);
        rearPlate.position.set(0, 0.15, -2.18);
        this.carGroup.add(rearPlate);
        
        // Antenna on roof
        const antennaMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a,
            roughness: 0.5,
            metalness: 0.3
        });
        const antennaGeometry = new THREE.CylinderGeometry(0.01, 0.01, 0.15, 8);
        const antenna = new THREE.Mesh(antennaGeometry, antennaMaterial);
        antenna.position.set(0.7, 1.31, -0.8);
        this.carGroup.add(antenna);
        
        // Indicator lights (turn signals)
        const indicatorGeometry = new THREE.BoxGeometry(0.12, 0.08, 0.05);
        const indicatorMaterial = new THREE.MeshStandardMaterial({
            color: 0xff8800,
            emissive: 0x000000,
            emissiveIntensity: 0,
            roughness: 0.3,
            metalness: 0.2
        });
        
        this.leftFrontIndicator = new THREE.Mesh(indicatorGeometry, indicatorMaterial.clone());
        this.leftFrontIndicator.position.set(0.72, 0.25, 1.9);
        this.carGroup.add(this.leftFrontIndicator);
        
        this.rightFrontIndicator = new THREE.Mesh(indicatorGeometry, indicatorMaterial.clone());
        this.rightFrontIndicator.position.set(-0.72, 0.25, 1.9);
        this.carGroup.add(this.rightFrontIndicator);
        
        this.leftRearIndicator = new THREE.Mesh(indicatorGeometry, indicatorMaterial.clone());
        this.leftRearIndicator.position.set(0.72, 0.28, -1.95);
        this.carGroup.add(this.leftRearIndicator);
        
        this.rightRearIndicator = new THREE.Mesh(indicatorGeometry, indicatorMaterial.clone());
        this.rightRearIndicator.position.set(-0.72, 0.28, -1.95);
        this.carGroup.add(this.rightRearIndicator);
        
        this.indicatorState = 'off';
        this.indicatorTimer = 0;
        
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
        
        // Frame and tank geometries by style
        let frameGeometry, tankGeometry;
        if (this.style === 'sport') {
            frameGeometry = new THREE.BoxGeometry(0.08, 0.7, 1.0);
            tankGeometry = new THREE.BoxGeometry(0.3, 0.24, 0.5, 3, 3, 4);
        } else if (this.style === 'cruiser') {
            frameGeometry = new THREE.BoxGeometry(0.1, 0.5, 1.2);
            tankGeometry = new THREE.BoxGeometry(0.3, 0.25, 0.5);
        } else {
            frameGeometry = new THREE.BoxGeometry(0.06, 0.8, 0.9);
            tankGeometry = new THREE.BoxGeometry(0.22, 0.18, 0.35);
        }

        const frameMaterial = new THREE.MeshStandardMaterial({
            color: this.color,
            roughness: 0.18,
            metalness: 0.85
        });
        this.frame = new THREE.Mesh(frameGeometry, frameMaterial);
        this.frame.position.set(0, 0.55, 0);
        this.frame.castShadow = true;
        this.bikeGroup.add(this.frame);

        // Sculpted tank for sport bikes
        if (this.style === 'sport') {
            const tankVertices = tankGeometry.attributes.position;
            for (let i = 0; i < tankVertices.count; i++) {
                const x = tankVertices.getX(i);
                const y = tankVertices.getY(i);
                const z = tankVertices.getZ(i);

                // Widen middle, taper ends
                const distFromCenter = Math.abs(z);
                const taperFactor = Math.max(0, 1 - (distFromCenter / 0.25) * 0.4);

                if (Math.abs(x) > 0.05) {
                    tankVertices.setX(i, x * (1 + taperFactor * 0.2));
                }

                // Round the top
                if (y > 0) {
                    tankVertices.setY(i, y * (1 + taperFactor * 0.25));
                }
            }
            tankGeometry.computeVertexNormals();
        }

        this.tank = new THREE.Mesh(tankGeometry, frameMaterial);
        this.tank.position.set(0, 0.72, 0.1);
        this.tank.castShadow = true;
        this.bikeGroup.add(this.tank);

        // Add fairings for sport bikes only
        if (this.style === 'sport') {
            // Front fairing
            const frontFairingGeometry = new THREE.BoxGeometry(0.38, 0.48, 0.3, 2, 3, 2);
            const fairingVertices = frontFairingGeometry.attributes.position;
            for (let i = 0; i < fairingVertices.count; i++) {
                const x = fairingVertices.getX(i);
                const y = fairingVertices.getY(i);
                const z = fairingVertices.getZ(i);

                // Taper toward front
                if (z > 0.08) {
                    const taperAmount = (z - 0.08) / 0.22;
                    fairingVertices.setX(i, x * (1 - taperAmount * 0.35));
                    fairingVertices.setY(i, y * (1 - taperAmount * 0.2));
                }
            }
            frontFairingGeometry.computeVertexNormals();

            this.frontFairing = new THREE.Mesh(frontFairingGeometry, frameMaterial);
            this.frontFairing.position.set(0, 0.62, 0.65);
            this.frontFairing.castShadow = true;
            this.bikeGroup.add(this.frontFairing);

            // Side fairings
            const sideFairingGeometry = new THREE.BoxGeometry(0.1, 0.36, 0.82, 2, 2, 4);
            const sideVertices = sideFairingGeometry.attributes.position;
            for (let i = 0; i < sideVertices.count; i++) {
                const z = sideVertices.getZ(i);
                // Slight taper toward rear
                if (z < -0.2) {
                    const taperAmount = Math.abs(z + 0.2) / 0.3;
                    sideVertices.setX(i, sideVertices.getX(i) * (1 - taperAmount * 0.12));
                }
            }
            sideFairingGeometry.computeVertexNormals();

            this.leftSideFairing = new THREE.Mesh(sideFairingGeometry, frameMaterial);
            this.leftSideFairing.position.set(-0.2, 0.52, 0.05);
            this.leftSideFairing.castShadow = true;
            this.bikeGroup.add(this.leftSideFairing);

            this.rightSideFairing = new THREE.Mesh(sideFairingGeometry, frameMaterial);
            this.rightSideFairing.position.set(0.2, 0.52, 0.05);
            this.rightSideFairing.castShadow = true;
            this.bikeGroup.add(this.rightSideFairing);

            // Tail section
            const tailGeometry = new THREE.BoxGeometry(0.36, 0.3, 0.55, 3, 3, 3);
            const tailVertices = tailGeometry.attributes.position;
            for (let i = 0; i < tailVertices.count; i++) {
                const x = tailVertices.getX(i);
                const y = tailVertices.getY(i);
                const z = tailVertices.getZ(i);

                // Pointed tail
                if (z < -0.12) {
                    const taperAmount = Math.abs(z + 0.12) / 0.3;
                    tailVertices.setX(i, x * (1 - taperAmount * 0.6));
                }
            }
            tailGeometry.computeVertexNormals();

            this.tailSection = new THREE.Mesh(tailGeometry, frameMaterial);
            this.tailSection.position.set(0, 0.65, -0.22);
            this.tailSection.castShadow = true;
            this.bikeGroup.add(this.tailSection);
        }

        const seatGeometry = new THREE.BoxGeometry(0.28, 0.1, 0.4);
        const seatMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x1a1a1a, 
            roughness: 0.8, 
            metalness: 0.0 
        });
        this.seat = new THREE.Mesh(seatGeometry, seatMaterial);
        this.seat.position.set(0, 0.6, -0.2);
        this.seat.castShadow = true;
        this.bikeGroup.add(this.seat);
        
        const riderGeometry = new THREE.BoxGeometry(0.25, 0.5, 0.18);
        const riderMaterial = new THREE.MeshStandardMaterial({
            color: this.suitColor,  // Use rider's custom suit color
            roughness: 0.65,
            metalness: 0.15
        });
        this.rider = new THREE.Mesh(riderGeometry, riderMaterial);
        this.rider.position.set(0, 1.05, -0.1);
        this.rider.castShadow = true;
        this.bikeGroup.add(this.rider);

        const helmetGeometry = new THREE.SphereGeometry(0.12, 8, 6);
        const helmetMaterial = new THREE.MeshStandardMaterial({
            color: this.helmetColor,  // Use rider's custom helmet color
            roughness: 0.15,
            metalness: 0.6
        });
        this.helmet = new THREE.Mesh(helmetGeometry, helmetMaterial);
        this.helmet.position.set(0, 1.32, -0.1);
        this.helmet.castShadow = true;
        this.bikeGroup.add(this.helmet);
        
        const exhaustGeometry = new THREE.CylinderGeometry(0.03, 0.04, 0.5, 10);
        const exhaustMaterial = new THREE.MeshStandardMaterial({ 
            color: 0xc0c0c0, 
            roughness: 0.1, 
            metalness: 1.0 
        });
        this.exhaust = new THREE.Mesh(exhaustGeometry, exhaustMaterial);
        this.exhaust.rotation.x = Math.PI / 2;
        this.exhaust.position.set(0.12, 0.35, -0.4);
        this.exhaust.castShadow = true;
        this.bikeGroup.add(this.exhaust);
        
        const brakeLightGeometry = new THREE.BoxGeometry(0.08, 0.04, 0.03);
        const brakeLightMaterial = new THREE.MeshStandardMaterial({
            color: 0xff0000,
            emissive: 0x000000,
            emissiveIntensity: 0,
            roughness: 0.3,
            metalness: 0.2
        });
        this.brakeLight = new THREE.Mesh(brakeLightGeometry, brakeLightMaterial);
        this.brakeLight.position.set(0, 0.7, -0.62);
        this.brakeLight.castShadow = true;
        this.bikeGroup.add(this.brakeLight);
        
        const headlightGeometry = new THREE.CylinderGeometry(0.06, 0.08, 0.06, 10);
        const headlightMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: 0xffffee,
            emissiveIntensity: 0.6,
            roughness: 0.1,
            metalness: 0.4
        });
        this.headlight = new THREE.Mesh(headlightGeometry, headlightMaterial);
        this.headlight.rotation.z = Math.PI / 2;
        this.headlight.position.set(0, 0.6, 0.62);
        this.headlight.castShadow = true;
        this.bikeGroup.add(this.headlight);
        
        const numberPlateGeometry = new THREE.BoxGeometry(0.12, 0.06, 0.01);
        const numberPlateMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.7,
            metalness: 0.1
        });
        this.numberPlate = new THREE.Mesh(numberPlateGeometry, numberPlateMaterial);
        this.numberPlate.position.set(0, 0.58, -0.64);
        this.numberPlate.castShadow = true;
        this.bikeGroup.add(this.numberPlate);
        
        this.isBraking = false;
        
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