class Cones {
    constructor(scene, environment, onConeHit = null) {
        this.scene = scene;
        this.environment = environment;
        this.cones = [];
        this.onConeHit = onConeHit; // Callback function for scoring
        this.createCones();
    }

    createCheckeredTexture() {
        // Temporarily disabled to debug rendering issue
        // Will use solid colors instead
        return null;
    }
    
    createCones() {
        // Place cones strategically for slalom and corner markers
        const conePositions = [];
        
        // Use the environment's road path if available
        if (this.environment && this.environment.roadPath) {
            // Place cones at strategic intervals
            // More cones on straights for slalom, fewer in corners
            this.environment.roadPath.forEach((point, index) => {
                // Check if this is a turning section by looking at heading change
                const prevIndex = Math.max(0, index - 1);
                const nextIndex = Math.min(index + 1, this.environment.roadPath.length - 1);
                const signedHeadingChange = this.environment.roadPath[nextIndex].heading -
                    this.environment.roadPath[prevIndex].heading;
                const headingChange = Math.abs(signedHeadingChange);

                // Place cones based on section type - avoid checkpoints and start later
                // Checkpoints are at segments: ~18, 32, 46, 60, 2 (wrapped)
                const checkpointSegments = [18, 32, 46, 60, 2];
                const isNearCheckpoint = checkpointSegments.some(cp => Math.abs(index - cp) < 5);

                 if (headingChange < 0.02) {
                     // Straight section - place slalom cones every 4 segments on alternating sides on grass
                     // Start well after first checkpoint (segment 18) to avoid double alerts
                     if (index % 4 === 0 && index > 50 && index < this.environment.roadPath.length - 10 && !isNearCheckpoint) {
                        const sideOffset = (Math.floor(index / 4) % 2 === 0) ? 10 : -10;
                        conePositions.push({
                            x: point.x + sideOffset,
                            z: point.z
                        });
                    }
                 } else if (index % 6 === 0 && index > 50 && !isNearCheckpoint) {
                    // Corner section - place cones at apex, offset to the inside on grass (less frequent)
                    const turnDirection = signedHeadingChange > 0 ? 1 : -1;
                    const offset = turnDirection * 10;
                    conePositions.push({
                        x: point.x + offset,
                        z: point.z
                    });
                }
            });
        } else {
            // Fallback: simple straight line
            for (let i = 0; i < 20; i++) {
                conePositions.push({ 
                    x: 0, 
                    z: 40 + i * 25
                });
            }
        }
        
        // Create the cone meshes (geometry and materials shared across all cones)
        const coneGeometry = new THREE.ConeGeometry(0.25, 0.8, 6);
        const coneMaterial = new THREE.MeshStandardMaterial({ color: 0xff6600, roughness: 0.8, metalness: 0.0, emissive: 0x331100, emissiveIntensity: 0.1 });
        const baseGeometry = new THREE.CylinderGeometry(0.35, 0.35, 0.05, 6);
        const baseMaterial = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9, metalness: 0.0 });
        
        conePositions.forEach((pos, index) => {
            // Find the road elevation at this position
            let roadY = 0;
            if (this.environment && this.environment.roadPath) {
                // Find nearest road point to get elevation
                let minDist = Infinity;
                for (const roadPoint of this.environment.roadPath) {
                    const dist = Math.sqrt(
                        Math.pow(pos.x - roadPoint.x, 2) +
                        Math.pow(pos.z - roadPoint.z, 2)
                    );
                    if (dist < minDist) {
                        minDist = dist;
                        roadY = roadPoint.y || 0;
                    }
                }
            }

            const cone = new THREE.Mesh(coneGeometry, coneMaterial);
            cone.position.set(pos.x, roadY + 0.4, pos.z); // Position at road elevation + 0.4
            cone.castShadow = true;
            cone.receiveShadow = true;
            cone.hit = false; // Track if cone has been hit
            this.scene.add(cone);
            this.cones.push(cone);

            // No per-cone point lights: every extra light in the forward
            // renderer raises per-fragment cost for the whole scene, and the
            // cones already have an emissive tint

            // Add base at the road elevation (a fixed y=0.025 left bases
            // floating or buried on elevated road sections)
            const base = new THREE.Mesh(baseGeometry, baseMaterial);
            base.position.set(pos.x, roadY + 0.025, pos.z);
            base.castShadow = true;
            base.receiveShadow = true;
            this.scene.add(base);
        });
        
        // Add start/finish lines
        this.createStartFinishMarkers();
    }
    
    createStartFinishMarkers() {
        const checkeredTexture = this.createCheckeredTexture();

        // Start line
        const startGeometry = new THREE.PlaneGeometry(16, 2);
        const startMaterialProps = {
            color: 0x000000,
            transparent: true,
            opacity: 0.9,
            roughness: 0.7,
            metalness: 0.0
        };
        if (checkeredTexture) {
            startMaterialProps.map = checkeredTexture;
            startMaterialProps.color = 0xffffff;
        }
        const startMaterial = new THREE.MeshStandardMaterial(startMaterialProps);
        const startLine = new THREE.Mesh(startGeometry, startMaterial);
        startLine.rotation.x = -Math.PI / 2;
        startLine.position.set(0, 0.03, 20);
        startLine.receiveShadow = true;
        this.scene.add(startLine);

        // Start line light
        const startLight = new THREE.PointLight(0x00ff00, 0.5, 50);
        startLight.position.set(0, 5, 20);
        this.scene.add(startLight);

        // Finish line
        if (this.environment && this.environment.roadPath.length > 0) {
            const lastPoint = this.environment.roadPath[this.environment.roadPath.length - 1];
            const finishMaterialProps = {
                color: 0x000000,
                transparent: true,
                opacity: 0.9,
                roughness: 0.7,
                metalness: 0.0
            };
            if (checkeredTexture) {
                finishMaterialProps.map = checkeredTexture;
                finishMaterialProps.color = 0xffffff;
            }
            const finishMaterial = new THREE.MeshStandardMaterial(finishMaterialProps);
            const finishLine = new THREE.Mesh(startGeometry, finishMaterial);
            finishLine.rotation.x = -Math.PI / 2;
            finishLine.rotation.z = -lastPoint.heading;
            finishLine.position.set(lastPoint.x, 0.03, lastPoint.z + 20);
            finishLine.receiveShadow = true;
            this.scene.add(finishLine);

            // Finish line light
            const finishLight = new THREE.PointLight(0xffffff, 0.5, 50);
            finishLight.position.set(lastPoint.x, 5, lastPoint.z + 20);
            this.scene.add(finishLight);
        }
    }
    
    checkCollision(vehiclePosition) {
        const hitDistance = 2.0; // More generous hit distance
        const heightTolerance = 3; // More generous height tolerance

        // Debug: periodic logging
        if (!this.collisionDebugCounter) this.collisionDebugCounter = 0;
        this.collisionDebugCounter++;
        if (this.collisionDebugCounter % 180 === 0) { // Every 3 seconds at 60fps
            console.log('Cone collision check - Vehicle at:', vehiclePosition.x.toFixed(1), vehiclePosition.z.toFixed(1), 'Cones:', this.cones.length);
        }

        for (let cone of this.cones) {
            const distance = Math.sqrt(
                Math.pow(vehiclePosition.x - cone.position.x, 2) +
                Math.pow(vehiclePosition.z - cone.position.z, 2)
            );

            const heightDiff = Math.abs(vehiclePosition.y - cone.position.y);

            if (distance < hitDistance && heightDiff < heightTolerance && !cone.hit) {
                cone.hit = true;
                cone.rotation.z = Math.PI / 3;
                cone.position.y -= 0.2; // Lower the cone when hit

                // Award points for hitting cone
                if (this.onConeHit) {
                    this.onConeHit(25); // 25 points for cone hit
                    console.log(`Cone hit! +25 points - distance: ${distance.toFixed(2)}, height diff: ${heightDiff.toFixed(2)}`);
                } else {
                    console.log('Cone hit! +25 points - no callback available');
                }
            }
        }
    }
    
    reset() {
        this.cones.forEach(cone => {
            cone.rotation.z = 0;
            // Restore original Y position (road elevation + 0.4)
            let roadY = 0;
            if (this.environment && this.environment.roadPath) {
                let minDist = Infinity;
                for (const roadPoint of this.environment.roadPath) {
                    const dist = Math.sqrt(
                        Math.pow(cone.position.x - roadPoint.x, 2) +
                        Math.pow(cone.position.z - roadPoint.z, 2)
                    );
                    if (dist < minDist) {
                        minDist = dist;
                        roadY = roadPoint.y || 0;
                    }
                }
            }
            cone.position.y = roadY + 0.4;
            cone.hit = false;
        });
    }
}