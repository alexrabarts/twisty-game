// Round sprite with a soft falloff, shared by every particle effect
function makeSoftParticleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.35, 'rgba(255, 255, 255, 0.55)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(canvas);
}

class ParticleSystem {
    constructor(scene) {
        this.scene = scene;
        this.particleGroups = [];
        this.maxGroups = 100; // Bound concurrent emissions (each group is a draw call)
        // Untextured points render as hard squares
        this.softTexture = makeSoftParticleTexture();
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
        if (particleCount === 0) return;
        // This is called every rendered frame while braking; one puff every
        // 50 ms looks the same and does not allocate a draw call per frame
        const now = performance.now();
        if (now - (this.lastSmokeAt || 0) < 50) return;
        this.lastSmokeAt = now;
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
            color: 0xd8d8d8,
            map: this.softTexture,
            size: 0.9,
            transparent: true,
            opacity: 0.35,
            blending: THREE.NormalBlending,
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
            map: this.softTexture,
            size: 1.3,
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
            // Brighter than white after tone mapping, so the bloom pass
            // makes sparks glow
            color: new THREE.Color(6.0, 2.6, 0.5),
            map: this.softTexture,
            size: 0.28,
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
            map: this.softTexture,
            size: 0.4,
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
        const frames = deltaTime * 60;

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
                // Drag factors are per 60 Hz frame; scale the exponent so the
                // effect lasts as long on a 120 Hz display
                if (particleGroup.userData.type === 'smoke') {
                    velocities.setY(i, vy + 0.5 * deltaTime); // Float up
                    velocities.setX(i, vx * Math.pow(0.98, frames)); // Slow down
                    velocities.setZ(i, vz * Math.pow(0.98, frames));
                } else if (particleGroup.userData.type === 'dust') {
                    velocities.setY(i, vy - 9.8 * deltaTime); // Gravity
                    velocities.setX(i, vx * Math.pow(0.95, frames));
                    velocities.setZ(i, vz * Math.pow(0.95, frames));
                } else if (particleGroup.userData.type === 'sparks') {
                    velocities.setY(i, vy - 20 * deltaTime); // Heavy gravity
                    velocities.setX(i, vx * Math.pow(0.92, frames));
                    velocities.setZ(i, vz * Math.pow(0.92, frames));
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