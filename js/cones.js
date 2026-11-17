class Cones {
    constructor(scene, environment, onConeHit = null) {
        this.scene = scene;
        this.environment = environment;
        this.cones = [];
        this.activeCones = []; // Cones currently sliding/tumbling after a hit
        this.onConeHit = onConeHit; // Callback function for scoring
        this.createCones();
    }

    // The cone spots of segments from..to (inclusive), by the local segment
    // index alone, so a range gives the same spots whenever it is placed: a
    // straight gets a cone each 4 segments, a bend each 6, and gates are skipped
    // by 3 segments. A converted leg also keeps its cones clear of set pieces and
    // roadworks; a leg on the shared course places exactly as it always has.
    static placeRange(env, from, to) {
        const route = env.route;
        const checkpoints = env.checkpoints || [];
        const course = typeof env.course === 'function' ? env.course() : null;
        const clearOfWorks = !!course;
        // A converted leg may space its straight-road slalom wider (`cones.straightEvery`)
        const straightEvery = (course && course.cones && course.cones.straightEvery) || 4;
        const blocked = index => (env.setPieces || []).some(piece => index >= piece.from - 1 && index <= piece.to + 1) ||
            (env.roadworksZones || []).some(zone => {
                const reach = env.roadworksReach(zone.startSegment, zone.endSegment, zone.type);
                return index >= reach.from && index <= reach.to;
            });
        const spots = [];
        // Just inside the edge line, so a cone can be clipped for points
        // without leaving the road
        const edgeOffset = (env.roadWidth || 16) / 2 - 0.8;

        for (let index = from; index <= to; index++) {
            const point = route.pointAtUnit(index);
            // Check if this is a turning section by looking at heading change
            const prevIndex = Math.max(0, index - 1);
            const nextIndex = Math.min(index + 1, route.unitCount - 1);
            const signedHeadingChange = route.pointAtUnit(nextIndex).heading - route.pointAtUnit(prevIndex).heading;
            const headingChange = Math.abs(signedHeadingChange);

            // Keep clear of checkpoint gates to avoid double alerts
            if (checkpoints.some(cp => Math.abs(index - cp.segmentIndex) < 3)) continue;
            if (clearOfWorks && blocked(index)) continue;

            let side = 0;
            if (headingChange < 0.02) {
                // Straight: slalom cones every 4 segments on alternating sides
                if (index % straightEvery === 0) {
                    side = (Math.floor(index / straightEvery) % 2 === 0) ? 1 : -1;
                }
            } else if (index % 6 === 0) {
                // Corner: one cone on the inside at the apex. Heading
                // grows in a right turn, and right is the positive side.
                side = signedHeadingChange > 0 ? 1 : -1;
            }
            if (side === 0) continue;

            // Offset along the road's perpendicular (a world-X offset put
            // cones in the lanes wherever the road was not heading north)
            spots.push({
                x: point.x + Math.cos(point.heading) * edgeOffset * side,
                y: point.y || 0,
                z: point.z - Math.sin(point.heading) * edgeOffset * side
            });
        }
        return spots;
    }

    createCones() {
        // A converted leg places the cones of each section as it is built and
        // drops them when it is disposed (js/environment.js, sectionListeners)
        if (this.environment && this.environment.sections) {
            this.createSectionCones();
            return;
        }
        // Place cones strategically for slalom and corner markers
        const conePositions = [];
        
        // Use the environment's road path if available
        if (this.environment && this.environment.route) {
            // Place cones at strategic intervals
            // More cones on straights for slalom, fewer in corners
            const env = this.environment;
            const unitCount = env.route.unitCount;
            // Only the active leg has a road to stand on
            const legStart = Math.max(0, env.startSegment || 0);
            const legEnd = Math.min(unitCount - 1, env.endSegment !== undefined ? env.endSegment : unitCount - 1);
            conePositions.push(...Cones.placeRange(env, legStart + 8, legEnd - 3));
        } else {
            // Fallback: simple straight line
            for (let i = 0; i < 20; i++) {
                conePositions.push({ 
                    x: 0, 
                    z: 40 + i * 25
                });
            }
        }
        
        this.makeCones(conePositions, this.scene, this.cones);

        // Start and finish lines are drawn by Environment.createRoadMarkings()
        // at the leg's real start and end
    }
    
    // The cone meshes (geometry and materials shared across all cones) at
    // `positions`, added to `into`; each cone is pushed to `list`
    makeCones(positions, into, list) {
        if (!this.parts) {
            this.parts = {
                coneGeometry: new THREE.ConeGeometry(0.25, 0.8, 6),
                coneMaterial: new THREE.MeshStandardMaterial({ color: 0xff6600, roughness: 0.8, metalness: 0.0, emissive: 0x331100, emissiveIntensity: 0.1 }),
                baseGeometry: new THREE.CylinderGeometry(0.35, 0.35, 0.05, 6),
                baseMaterial: new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9, metalness: 0.0 })
            };
            // A disposed section leaves the cones of the others alone
            Object.values(this.parts).forEach(part => { part.userData.shared = true; });
        }
        const { coneGeometry, coneMaterial, baseGeometry, baseMaterial } = this.parts;
        positions.forEach((pos) => {
            const roadY = pos.y || 0;

            const cone = new THREE.Mesh(coneGeometry, coneMaterial);
            cone.position.set(pos.x, roadY + 0.4, pos.z); // Position at road elevation + 0.4
            cone.userData.homePosition = cone.position.clone(); // For reset after being knocked away
            cone.castShadow = true;
            cone.receiveShadow = true;
            cone.hit = false; // Track if cone has been hit
            into.add(cone);
            list.push(cone);

            // No per-cone point lights: every extra light in the forward
            // renderer raises per-fragment cost for the whole scene, and the
            // cones already have an emissive tint

            // Add base at the road elevation (a fixed y=0.025 left bases
            // floating or buried on elevated road sections)
            const base = new THREE.Mesh(baseGeometry, baseMaterial);
            base.position.set(pos.x, roadY + 0.025, pos.z);
            base.castShadow = true;
            base.receiveShadow = true;
            into.add(base);
        });
    }

    // Cones by section on a converted leg: the leg's rule (8 segments after
    // the start, 3 before the end) clipped to each section's own segments
    createSectionCones() {
        const env = this.environment;
        const first = env.startSegment + 8;
        const last = env.endSegment - 3;
        const place = (section, into) => {
            const from = Math.max(first, section.from);
            const to = Math.min(last, section.to - 1);
            const spots = from <= to ? Cones.placeRange(env, from, to) : [];
            // Per section, so a section built twice (the shader warm-up, a restart) counts once
            (this.placedBySection ||= {})[section.index] = spots.length;
            this.placedTotal = Object.values(this.placedBySection).reduce((sum, n) => sum + n, 0);
            this.makeCones(spots, into, section.cones);
            this.cones.push(...section.cones);
        };
        const drop = (section) => {
            const gone = new Set(section.cones);
            this.cones = this.cones.filter(cone => !gone.has(cone));
            this.activeCones = this.activeCones.filter(state => !gone.has(state.cone));
        };
        env.sectionListeners = env.sectionListeners.filter(listener => listener.owner !== 'cones');
        env.sectionListeners.push({ owner: 'cones', built: place, disposed: drop });
        // The sections built with the environment, before these cones existed
        env.sections.forEach(section => {
            if (section.state !== 'built') return;
            const group = new THREE.Group();
            group.name = 'step-cones';
            section.group.add(group);
            place(section, group);
        });
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
                if (this.environment && this.environment.route) {
                    // The nearest road point over the whole route
                    const nearest = this.environment.route.project(cone.position.x, cone.position.z, null, {});
                    if (nearest.index >= 0) roadY = nearest.y || 0;
                }
                cone.position.y = roadY + 0.4;
            }
            cone.hit = false;
        });
    }
}