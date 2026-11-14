/**
 * Rockfall hazard system.
 * On later legs, rocks periodically break off the wall beside the road ahead of the
 * player, tumble down onto the road, bounce, roll across and settle briefly
 * before crumbling away. Hitting one (or being hit) crashes the bike.
 */
class RockfallSystem {
    constructor(scene, environment) {
        this.scene = scene;
        this.environment = environment;

        // The leg's rockfall rate: 0 on the early legs, ramping up to 1
        this.intensity = environment.config.dressing.rockfall;
        // Rocks come off whichever side of the road the profile makes a wall
        this.wallSign = Terrain.wallSign(environment.terrain);
        this.enabled = this.intensity > 0 && this.wallSign !== 0;

        this.rocks = [];
        this.maxRocks = 10;
        this.nextFallIn = this.rollInterval();

        // Shared geometry/material pool - rocks reuse these
        this.geometries = [];
        this.materials = [];
        if (this.enabled) {
            for (let i = 0; i < 3; i++) {
                this.geometries.push(new THREE.DodecahedronGeometry(1, 0));
            }
            const tones = [0x55504a, 0x474440, 0x5e564c];
            tones.forEach(color => {
                this.materials.push(new THREE.MeshStandardMaterial({
                    color,
                    roughness: 0.95,
                    metalness: 0.0
                }));
            });
        }
    }

    rollInterval() {
        // Seconds until the next rockfall: 6-16s at full intensity,
        // 14-30s on the first hazard leg
        const base = 16 - this.intensity * 10;
        return base + Math.random() * base;
    }

    /**
     * Per-physics-tick update. Returns {hit: true, rock} the tick the player
     * collides with a rock, otherwise null.
     */
    update(deltaTime, vehicle) {
        if (!this.enabled) return null;

        // Trigger new falls ahead of a moving player
        this.nextFallIn -= deltaTime;
        if (this.nextFallIn <= 0 && this.rocks.length < this.maxRocks - 3) {
            this.nextFallIn = this.rollInterval();
            this.triggerFall(vehicle);
        }

        let collision = null;
        const gravity = 22;
        const stillActive = [];

        for (const rock of this.rocks) {
            rock.age += deltaTime;

            if (rock.settled) {
                // Settled rocks linger as obstacles, then crumble away
                if (rock.age > rock.settleUntil) {
                    rock.mesh.scale.multiplyScalar(Math.max(0, 1 - deltaTime * 2));
                    if (rock.mesh.scale.x < 0.05) {
                        this.scene.remove(rock.mesh);
                        continue;
                    }
                }
            } else {
                // Ballistic tumble
                rock.velocity.y -= gravity * deltaTime;
                rock.mesh.position.x += rock.velocity.x * deltaTime;
                rock.mesh.position.y += rock.velocity.y * deltaTime;
                rock.mesh.position.z += rock.velocity.z * deltaTime;
                rock.mesh.rotateOnWorldAxis(rock.spinAxis, rock.spinRate * deltaTime);

                // Ground contact: the shared terrain model, wall and cliff face included
                const groundY = this.groundY(rock.mesh.position.x, rock.mesh.position.z);
                if (rock.mesh.position.y - rock.radius <= groundY && rock.velocity.y < 0) {
                    rock.mesh.position.y = groundY + rock.radius;
                    rock.bounces++;
                    if (rock.bounces >= 3 || Math.abs(rock.velocity.y) < 2.5) {
                        rock.settled = true;
                        rock.settleUntil = rock.age + 5 + Math.random() * 4;
                        rock.velocity.set(0, 0, 0);
                        rock.spinRate = 0;
                    } else {
                        rock.velocity.y = -rock.velocity.y * 0.42;
                        rock.velocity.x *= 0.75;
                        rock.velocity.z *= 0.75;
                        rock.spinRate *= 0.65;
                    }
                }
            }

            // Player collision (moving or settled - a rock on the road is a hazard)
            if (vehicle && !vehicle.crashed) {
                const dx = vehicle.position.x - rock.mesh.position.x;
                const dy = vehicle.position.y - rock.mesh.position.y;
                const dz = vehicle.position.z - rock.mesh.position.z;
                const hitRadius = rock.radius + 0.9;
                if (dx * dx + dy * dy + dz * dz < hitRadius * hitRadius) {
                    collision = { hit: true, rock };
                }
            }

            stillActive.push(rock);
        }

        this.rocks = stillActive;
        return collision;
    }

    triggerFall(vehicle) {
        if (!this.environment || !this.environment.roadPath || !vehicle) return;

        const path = this.environment.roadPath;
        // Land the fall 60-130m ahead of the player along the road
        const aheadSegments = 3 + Math.floor(Math.random() * 4);
        const segIdx = Math.min(
            (vehicle.currentRoadSegment || 0) + aheadSegments,
            path.length - 1
        );
        const seg = path[segIdx];
        const count = 2 + Math.floor(Math.random() * (2 + this.intensity * 2));
        // groundY searches around the last fall
        this.lastFallSegment = segIdx;

        for (let i = 0; i < count && this.rocks.length < this.maxRocks; i++) {
            const radius = 0.35 + Math.random() * (0.5 + this.intensity * 0.5);
            const mesh = new THREE.Mesh(
                this.geometries[Math.floor(Math.random() * this.geometries.length)],
                this.materials[Math.floor(Math.random() * this.materials.length)]
            );
            mesh.scale.setScalar(radius);
            mesh.castShadow = true;
            mesh.receiveShadow = true;

            // Spawn high on the wall
            const halfRoad = this.environment.roadWidth / 2;
            const wallLateral = this.wallSign * (halfRoad + 4 + Math.random() * 6);
            const perpX = Math.cos(seg.heading);
            const perpZ = -Math.sin(seg.heading);
            const along = (Math.random() - 0.5) * 24; // Spread along the road
            const spawnX = seg.x + perpX * wallLateral + Math.sin(seg.heading) * along;
            const spawnZ = seg.z + perpZ * wallLateral + Math.cos(seg.heading) * along;
            // 18-32 above the road, and never inside a wall that rises faster than that
            const spawnY = Math.max(
                (seg.y || 0) + 18 + Math.random() * 14,
                this.groundY(spawnX, spawnZ) + 5
            );
            mesh.position.set(spawnX, spawnY, spawnZ);
            this.scene.add(mesh);

            // Initial velocity: off the wall toward/over the road
            const towardRoad = -this.wallSign * (3.5 + Math.random() * 5);
            this.rocks.push({
                mesh,
                radius,
                velocity: new THREE.Vector3(
                    perpX * towardRoad + (Math.random() - 0.5) * 2,
                    -2 - Math.random() * 3,
                    perpZ * towardRoad + (Math.random() - 0.5) * 2
                ),
                spinAxis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
                spinRate: 4 + Math.random() * 8,
                bounces: 0,
                settled: false,
                settleUntil: 0,
                age: 0
            });
        }

        return segIdx;
    }

    // Ground under (x, z) from the terrain model. Coarse scan is fine - rocks
    // live near this.lastFallSegment.
    groundY(x, z) {
        const environment = this.environment;
        const last = this.lastFallSegment || 0;
        const from = Math.max(0, last - 12);
        const to = Math.min(environment.roadPath.length - 1, last + 12);
        return Terrain.groundY(environment.terrain, environment.terrainGeometry, x, z, from, to, true);
    }

    dispose() {
        this.rocks.forEach(rock => this.scene.remove(rock.mesh));
        this.rocks = [];
        this.geometries.forEach(g => g.dispose());
        this.materials.forEach(m => m.dispose());
        this.geometries = [];
        this.materials = [];
    }
}
