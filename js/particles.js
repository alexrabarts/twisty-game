class ParticleSystem {
    constructor(scene) {
        this.scene = scene;
        this.particleGroups = [];
        this.maxGroups = 100; // Bound concurrent emissions (each group is a draw call)
    }

    trackGroup(particles) {
        // Enforce the cap by retiring the oldest group
        if (this.particleGroups.length >= this.maxGroups) {
            const oldest = this.particleGroups.shift();
            this.scene.remove(oldest);
            oldest.geometry.dispose();
            oldest.material.dispose();
        }
        this.scene.add(particles);
        this.particleGroups.push(particles);
    }

    createTireSmoke(position, velocity, intensity = 1.0) {
        const particleCount = Math.floor(3 * intensity); // Reduced from 5
        const geometry = new THREE.BufferGeometry();
        const positions = [];
        const velocities = [];
        const lifetimes = [];
        const sizes = [];

        for (let i = 0; i < particleCount; i++) {
            // Spawn behind tire
            positions.push(
                position.x + (Math.random() - 0.5) * 0.3,
                position.y + Math.random() * 0.2,
                position.z + (Math.random() - 0.5) * 0.3
            );

            // Particles drift sideways and up
            velocities.push(
                velocity.x * 0.3 + (Math.random() - 0.5) * 2,
                Math.random() * 1.5 + 1.0, // Upward drift
                velocity.z * 0.3 + (Math.random() - 0.5) * 2
            );

            lifetimes.push(Math.random() * 0.5 + 0.5); // 0.5-1.0 seconds
            sizes.push(Math.random() * 0.15 + 0.1); // 0.1-0.25 size (reduced from 0.2-0.5)
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('velocity', new THREE.Float32BufferAttribute(velocities, 3));
        geometry.setAttribute('lifetime', new THREE.Float32BufferAttribute(lifetimes, 1));
        geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));

        const material = new THREE.PointsMaterial({
            color: 0xcccccc,
            size: 0.3, // Reduced from 0.5
            transparent: true,
            opacity: 0.4, // Reduced from 0.6
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        const particles = new THREE.Points(geometry, material);
        particles.userData.age = 0;
        particles.userData.maxLife = 1.0;
        particles.userData.type = 'smoke';
        particles.userData.baseOpacity = material.opacity;

        this.trackGroup(particles);
    }

    createDustCloud(position, intensity = 1.0) {
        const particleCount = Math.floor(15 * intensity);
        const geometry = new THREE.BufferGeometry();
        const positions = [];
        const velocities = [];
        const lifetimes = [];
        const sizes = [];

        for (let i = 0; i < particleCount; i++) {
            // Spawn at ground level, spread out
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * 1.5;
            positions.push(
                position.x + Math.cos(angle) * radius,
                position.y + Math.random() * 0.3,
                position.z + Math.sin(angle) * radius
            );

            // Particles explode outward and up
            velocities.push(
                Math.cos(angle) * (Math.random() * 3 + 2),
                Math.random() * 2 + 1,
                Math.sin(angle) * (Math.random() * 3 + 2)
            );

            lifetimes.push(Math.random() * 0.3 + 0.5); // 0.5-0.8 seconds
            sizes.push(Math.random() * 0.5 + 0.3); // 0.3-0.8 size
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('velocity', new THREE.Float32BufferAttribute(velocities, 3));
        geometry.setAttribute('lifetime', new THREE.Float32BufferAttribute(lifetimes, 1));
        geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));

        const material = new THREE.PointsMaterial({
            color: 0x8b7355,
            size: 0.7,
            transparent: true,
            opacity: 0.7,
            blending: THREE.NormalBlending,
            depthWrite: false
        });

        const particles = new THREE.Points(geometry, material);
        particles.userData.age = 0;
        particles.userData.maxLife = 0.8;
        particles.userData.type = 'dust';
        particles.userData.baseOpacity = material.opacity;

        this.trackGroup(particles);
    }

    createCollisionSparks(position, impactDirection, intensity = 1.0) {
        const particleCount = Math.floor(20 * intensity);
        const geometry = new THREE.BufferGeometry();
        const positions = [];
        const velocities = [];
        const lifetimes = [];
        const sizes = [];

        // Normalize impact direction
        const dir = impactDirection.clone().normalize();

        for (let i = 0; i < particleCount; i++) {
            // Spawn at impact point
            positions.push(
                position.x + (Math.random() - 0.5) * 0.2,
                position.y + (Math.random() - 0.5) * 0.2,
                position.z + (Math.random() - 0.5) * 0.2
            );

            // Sparks fly away from impact with some randomness
            const spreadAngle = (Math.random() - 0.5) * Math.PI * 0.5;
            const spreadDir = dir.clone();
            spreadDir.x += Math.sin(spreadAngle) * 0.5;
            spreadDir.z += Math.cos(spreadAngle) * 0.5;
            spreadDir.normalize();

            const speed = Math.random() * 8 + 5;
            velocities.push(
                spreadDir.x * speed,
                Math.random() * 3 + 1, // Upward component
                spreadDir.z * speed
            );

            lifetimes.push(Math.random() * 0.15 + 0.15); // 0.15-0.3 seconds (quick)
            sizes.push(Math.random() * 0.15 + 0.1); // Small bright sparks
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('velocity', new THREE.Float32BufferAttribute(velocities, 3));
        geometry.setAttribute('lifetime', new THREE.Float32BufferAttribute(lifetimes, 1));
        geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));

        const material = new THREE.PointsMaterial({
            color: 0xffaa00,
            size: 0.3,
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        const particles = new THREE.Points(geometry, material);
        particles.userData.age = 0;
        particles.userData.maxLife = 0.3;
        particles.userData.type = 'sparks';
        particles.userData.baseOpacity = material.opacity;

        this.trackGroup(particles);
    }

    createSpeedTrail(position, velocity) {
        const geometry = new THREE.BufferGeometry();
        const positions = [];
        const velocities = [];
        const lifetimes = [];
        const sizes = [];

        // Small puff of oily smoke
        const particleCount = 2;
        for (let i = 0; i < particleCount; i++) {
            positions.push(
                position.x + (Math.random() - 0.5) * 0.2,
                position.y + Math.random() * 0.1,
                position.z + (Math.random() - 0.5) * 0.2
            );
            velocities.push(
                -velocity.x * 0.3 + (Math.random() - 0.5) * 0.5,
                Math.random() * 0.5 + 0.2, // Slight upward drift
                -velocity.z * 0.3 + (Math.random() - 0.5) * 0.5
            );
            lifetimes.push(0.15 + Math.random() * 0.1); // Very brief
            sizes.push(Math.random() * 0.05 + 0.03); // Much smaller
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('velocity', new THREE.Float32BufferAttribute(velocities, 3));
        geometry.setAttribute('lifetime', new THREE.Float32BufferAttribute(lifetimes, 1));
        geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));

        const material = new THREE.PointsMaterial({
            color: 0x333333, // Dark oily smoke color
            size: 0.15, // Much smaller
            transparent: true,
            opacity: 0.15, // More transparent
            blending: THREE.NormalBlending,
            depthWrite: false
        });

        const particles = new THREE.Points(geometry, material);
        particles.userData.age = 0;
        particles.userData.maxLife = 0.25;
        particles.userData.type = 'trail';
        particles.userData.baseOpacity = material.opacity;

        this.trackGroup(particles);
    }

    update(deltaTime) {
        const toRemove = [];

        this.particleGroups.forEach((particleGroup, index) => {
            particleGroup.userData.age += deltaTime;

            const positions = particleGroup.geometry.attributes.position;
            const velocities = particleGroup.geometry.attributes.velocity;
            const lifetimes = particleGroup.geometry.attributes.lifetime;

            // Update each particle
            for (let i = 0; i < positions.count; i++) {
                const vx = velocities.getX(i);
                const vy = velocities.getY(i);
                const vz = velocities.getZ(i);

                // Update position
                positions.setX(i, positions.getX(i) + vx * deltaTime);
                positions.setY(i, positions.getY(i) + vy * deltaTime);
                positions.setZ(i, positions.getZ(i) + vz * deltaTime);

                // Apply drag/gravity
                if (particleGroup.userData.type === 'smoke') {
                    velocities.setY(i, vy + 0.5 * deltaTime); // Float up
                    velocities.setX(i, vx * 0.98); // Slow down
                    velocities.setZ(i, vz * 0.98);
                } else if (particleGroup.userData.type === 'dust') {
                    velocities.setY(i, vy - 9.8 * deltaTime); // Gravity
                    velocities.setX(i, vx * 0.95);
                    velocities.setZ(i, vz * 0.95);
                } else if (particleGroup.userData.type === 'sparks') {
                    velocities.setY(i, vy - 20 * deltaTime); // Heavy gravity
                    velocities.setX(i, vx * 0.92);
                    velocities.setZ(i, vz * 0.92);
                }
            }

            positions.needsUpdate = true;
            velocities.needsUpdate = true;

            // Fade out based on age, from the effect's authored base opacity
            // (fading from 1.0 rendered subtle effects at 2.5-6x their intended
            // opacity for most of their life)
            const ageRatio = particleGroup.userData.age / particleGroup.userData.maxLife;
            const baseOpacity = particleGroup.userData.baseOpacity !== undefined ? particleGroup.userData.baseOpacity : 1;
            particleGroup.material.opacity = Math.max(0, baseOpacity * (1 - ageRatio));

            // Mark for removal if expired
            if (particleGroup.userData.age >= particleGroup.userData.maxLife) {
                toRemove.push(index);
            }
        });

        // Remove expired particles
        toRemove.reverse().forEach(index => {
            const particleGroup = this.particleGroups[index];
            this.scene.remove(particleGroup);
            particleGroup.geometry.dispose();
            particleGroup.material.dispose();
            this.particleGroups.splice(index, 1);
        });
    }

    clear() {
        this.particleGroups.forEach(particleGroup => {
            this.scene.remove(particleGroup);
            particleGroup.geometry.dispose();
            particleGroup.material.dispose();
        });
        this.particleGroups = [];
    }
}