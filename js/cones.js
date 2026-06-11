class Cones {
    constructor(scene, environment, onConeHit = null) {
        this.scene = scene;
        this.environment = environment;
        this.cones = [];
        this.activeCones = []; // Cones currently sliding/tumbling after a hit
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
            cone.userData.homePosition = cone.position.clone(); // For reset after being knocked away
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
    
    checkCollision(vehiclePosition, vehicleVelocity = null, vehicleSpeed = 0) {
        const hitDistance = 2.0; // More generous hit distance
        const heightTolerance = 3; // More generous height tolerance

        for (let cone of this.cones) {
            const distance = Math.sqrt(
                Math.pow(vehiclePosition.x - cone.position.x, 2) +
                Math.pow(vehiclePosition.z - cone.position.z, 2)
            );

            const heightDiff = Math.abs(vehiclePosition.y - cone.position.y);

            if (distance < hitDistance && heightDiff < heightTolerance && !cone.hit) {
                cone.hit = true;
                this.knockCone(cone, vehiclePosition, vehicleVelocity, vehicleSpeed);

                // Award points for hitting cone
                if (this.onConeHit) {
                    this.onConeHit(25); // 25 points for cone hit
                }
            }
        }
    }

    knockCone(cone, vehiclePosition, vehicleVelocity, vehicleSpeed) {
        // Contact offset: which side of the bike the cone was struck with -
        // a cone clipped on the left flicks away to the left
        let contactX = cone.position.x - vehiclePosition.x;
        let contactZ = cone.position.z - vehiclePosition.z;
        const contactLen = Math.sqrt(contactX * contactX + contactZ * contactZ) || 1;
        contactX /= contactLen;
        contactZ /= contactLen;

        const groundY = cone.position.y - 0.4; // Cone center sits 0.4 above the road

        const slideSpeedThreshold = 12; // m/s (~27 mph)
        if (vehicleSpeed < slideSpeedThreshold) {
            // Low speed: nudge the cone - it slides away upright and stays up
            const pushSpeed = 2 + vehicleSpeed * 0.4;
            this.activeCones.push({
                cone,
                mode: 'slide',
                groundY,
                velocity: new THREE.Vector3(contactX * pushSpeed, 0, contactZ * pushSpeed),
                wobblePhase: Math.random() * Math.PI * 2
            });
        } else {
            // High speed: send it tumbling. Direction blends the bike's travel
            // direction with the contact offset; energy scales with speed
            const vx = vehicleVelocity ? vehicleVelocity.x : 0;
            const vz = vehicleVelocity ? vehicleVelocity.z : 0;
            const flingX = vx * 0.45 + contactX * vehicleSpeed * 0.5;
            const flingZ = vz * 0.45 + contactZ * vehicleSpeed * 0.5;
            const popUp = Math.min(2 + vehicleSpeed * 0.12, 8);

            // Tumble end-over-end around the axis perpendicular to the fling
            const flingLen = Math.sqrt(flingX * flingX + flingZ * flingZ) || 1;
            const spinRate = Math.min(4 + vehicleSpeed * 0.25, 18);

            this.activeCones.push({
                cone,
                mode: 'tumble',
                groundY,
                velocity: new THREE.Vector3(flingX, popUp, flingZ),
                // Axis perpendicular to travel direction (in XZ), so the cone
                // flips forward along its flight path
                spinAxis: new THREE.Vector3(flingZ / flingLen, 0, -flingX / flingLen),
                spinRate,
                bounces: 0
            });
        }
    }

    update(deltaTime) {
        if (!this.activeCones || this.activeCones.length === 0) return;

        const gravity = 18; // Slightly arcade-y gravity for snappy tumbles
        const stillActive = [];

        for (const state of this.activeCones) {
            const cone = state.cone;

            if (state.mode === 'slide') {
                cone.position.x += state.velocity.x * deltaTime;
                cone.position.z += state.velocity.z * deltaTime;

                // Friction
                const decel = Math.max(0, 1 - 6 * deltaTime);
                state.velocity.x *= decel;
                state.velocity.z *= decel;

                // Slight wobble while sliding, settling upright
                const slideSpeed = Math.hypot(state.velocity.x, state.velocity.z);
                state.wobblePhase += deltaTime * 14;
                cone.rotation.x = Math.sin(state.wobblePhase) * 0.12 * Math.min(slideSpeed, 1);
                cone.rotation.z = Math.cos(state.wobblePhase) * 0.12 * Math.min(slideSpeed, 1);

                if (slideSpeed < 0.15) {
                    cone.rotation.x = 0;
                    cone.rotation.z = 0;
                    continue; // Settled - drop from active list
                }
            } else {
                // Tumble: ballistic flight with end-over-end rotation
                state.velocity.y -= gravity * deltaTime;
                cone.position.x += state.velocity.x * deltaTime;
                cone.position.y += state.velocity.y * deltaTime;
                cone.position.z += state.velocity.z * deltaTime;

                cone.rotateOnWorldAxis(state.spinAxis, state.spinRate * deltaTime);

                // Ground contact (cone on its side has center ~0.25 above ground)
                const restY = state.groundY + 0.25;
                if (cone.position.y <= restY && state.velocity.y < 0) {
                    cone.position.y = restY;
                    state.bounces++;
                    if (state.bounces >= 2 || Math.abs(state.velocity.y) < 1.5) {
                        // Settle lying on its side, pointing along the fling direction
                        cone.rotation.set(0, Math.atan2(state.velocity.x, state.velocity.z), Math.PI / 2);
                        continue; // Settled
                    }
                    state.velocity.y = -state.velocity.y * 0.35;
                    state.velocity.x *= 0.6;
                    state.velocity.z *= 0.6;
                    state.spinRate *= 0.5;
                }
            }

            stillActive.push(state);
        }

        this.activeCones = stillActive;
    }
    
    reset() {
        this.activeCones = [];
        this.cones.forEach(cone => {
            cone.rotation.set(0, 0, 0);
            // Restore original position (knocked cones slide/tumble away)
            if (cone.userData.homePosition) {
                cone.position.copy(cone.userData.homePosition);
            } else {
                // Fallback: re-derive road elevation
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
            }
            cone.hit = false;
        });
    }
}