/**
 * Rockfall hazard system. Leg-only: it reads the leg's terrain profile for
 * its walls, so a world environment never builds one.
 * On later legs, rocks periodically break off the wall beside the road ahead of the
 * player, tumble down onto the road, bounce, roll across and settle briefly
 * before crumbling away. Hitting one (or being hit) crashes the bike.
 */
class RockfallSystem {
    constructor(scene, environment) {
        this.scene = scene;
        this.environment = environment;

        // The leg's rockfall rate: 0 on the early legs, ramping up to 1
        // A converted leg: the highest rate of its parts; a fall then needs a rate where it lands
        const parts = environment.terrain.parts;
        this.intensity = parts
            ? Math.max(0, ...parts.map(part => (part.dressing && part.dressing.rockfall) || 0))
            : environment.config.dressing.rockfall;
        // Rocks come off whichever side of the road the profile makes a wall
        // (both, in a gorge); a fall picks the wall at its own segment
        this.wallSign = Terrain.wallSign(environment.terrain);
        this.enabled = this.intensity > 0 && (this.wallSign !== 0 || !!parts);

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
                    // A rock still high on the wall is on a slope, not at rest: it
                    // goes on down toward the road and does not settle there (unless
                    // it has been tumbling for 10 s, so none sits there for good)
                    const route = this.environment.route;
                    const roadY = route.sample(route.fromUnits(this.lastFallSegment || 0)).y || 0;
                    const highUp = rock.mesh.position.y - roadY > 3 && rock.age < 10;
                    if (!highUp) rock.bounces++;
                    if (!highUp && (rock.bounces >= 3 || Math.abs(rock.velocity.y) < 2.5)) {
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
        if (!this.environment || !this.environment.route || !vehicle) return;

        const route = this.environment.route;
        // Land the fall 60-130m ahead of the player along the road
        const aheadSegments = 3 + Math.floor(Math.random() * 4);
        const segIdx = Math.min(
            route.toUnits(vehicle.routeS || 0) + aheadSegments,
            route.unitCount - 1
        );
        // No rock is aimed at a tunnel or a village, or at the
        // segment beside one: it spreads 12 m along the road and could land in it
        if (this.environment.inSetPiece && this.environment.inSetPiece(segIdx, 1)) return segIdx;
        const seg = route.pointAtUnit(segIdx);
        const walls = Terrain.wallSignsAt(this.environment.terrain, segIdx);
        // On a converted leg only a part with a rate sheds rock, only off a wall,
        // and only in a section that is drawn
        if (this.environment.sections) {
            const drawn = this.environment.visibleSections().some(section => segIdx >= section.from && segIdx < section.to);
            if (!drawn || !walls.length || !(Terrain.dressingAt(this.environment.config, segIdx).rockfall > 0)) return segIdx;
        }
        // One wall sheds the whole fall; a draw is spent only when there is a choice
        const wallSign = walls.length > 1
            ? walls[Math.floor(Math.random() * walls.length)]
            : (walls[0] ?? this.wallSign);
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
            const wallLateral = wallSign * (halfRoad + 4 + Math.random() * 6);
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
            const towardRoad = -wallSign * (3.5 + Math.random() * 5);
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
        const to = Math.min(environment.route.unitCount - 1, last + 12);
        return environment.ground.groundY(x, z, { start: from, end: to }, true);
    }

    // A checkpoint restart: no live rock stays on the spawn point, and the
    // next fall is a whole interval away
    reset() {
        this.rocks.forEach(rock => this.scene.remove(rock.mesh));
        this.rocks = [];
        this.nextFallIn = this.rollInterval();
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
