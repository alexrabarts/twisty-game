/**
 * Weather System
 * Handles fog, rain, snow effects and physics modifications
 */
class WeatherSystem {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;
        this.weatherType = 'clear';
        this.weatherIntensity = 1.0;
        this.particles = null;
        this.particleSystem = null;
        this.originalFogDensity = scene.fog ? scene.fog.density : 0.0008;
        this.lightningTimer = 0;
        this.lightningInterval = 5 + Math.random() * 5; // 5-10 seconds

        // Store base physics values (will be set by vehicle)
        this.basePhysics = {
            lateralFriction: 1.0,
            brakeForce: 1.0,
            acceleration: 1.0
        };
    }

    setWeather(type, intensity = 1.0) {
        console.log(`Setting weather: ${type} (intensity: ${intensity})`);

        // Clear existing weather
        this.clearWeather();

        this.weatherType = type;
        this.weatherIntensity = intensity;

        // Reset lightning timer for new weather
        this.lightningTimer = 0;
        this.lightningInterval = 5 + Math.random() * 5; // 5-10 seconds

        switch(type) {
            case 'fog':
                this.setupFog();
                break;
            case 'rain':
                this.setupRain();
                break;
            case 'snow':
                this.setupSnow();
                break;
            case 'clear':
            default:
                // Already cleared
                break;
        }
    }

    clearWeather() {
        // Remove particles and free their GPU buffers (rain is 3000 particles)
        if (this.particleSystem) {
            this.scene.remove(this.particleSystem);
            if (this.particleSystem.geometry) {
                this.particleSystem.geometry.dispose();
            }
            if (this.particleSystem.material) {
                this.particleSystem.material.dispose();
            }
            this.particleSystem = null;
        }

        // Reset fog to original
        if (this.scene.fog) {
            this.scene.fog.density = this.originalFogDensity;
        }

        this.weatherType = 'clear';
    }

    setupFog() {
        // Dense fog - adjust scene fog
        if (this.scene.fog) {
            this.scene.fog.density = 0.003 * this.weatherIntensity;
            this.scene.fog.color.setHex(0xb0c0d0); // Misty grey-blue
        }

        console.log('Fog weather enabled');
    }

    setupRain() {
        // Create rain particle system
        const rainCount = 3000;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(rainCount * 3);
        const velocities = new Float32Array(rainCount);

        // Spawn rain in a large area around camera
        for (let i = 0; i < rainCount; i++) {
            const i3 = i * 3;
            positions[i3] = (Math.random() - 0.5) * 200; // X: -100 to 100
            positions[i3 + 1] = Math.random() * 100 + 50; // Y: 50 to 150 (above camera)
            positions[i3 + 2] = (Math.random() - 0.5) * 200; // Z: -100 to 100

            velocities[i] = -30 - Math.random() * 20; // Fast falling
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 1));

        const material = new THREE.PointsMaterial({
            color: 0xaaaaaa,
            size: 0.3,
            transparent: true,
            opacity: 0.6,
            depthWrite: false
        });

        this.particleSystem = new THREE.Points(geometry, material);
        this.scene.add(this.particleSystem);

        // Adjust fog for stormy conditions
        if (this.scene.fog) {
            this.scene.fog.density = 0.0015 * this.weatherIntensity;
            this.scene.fog.color.setHex(0x707880); // Grey fog
        }

        console.log('Rain weather enabled');
    }

    setupSnow() {
        // Create snow particle system
        const snowCount = 2000;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(snowCount * 3);
        const velocities = new Float32Array(snowCount);

        for (let i = 0; i < snowCount; i++) {
            const i3 = i * 3;
            positions[i3] = (Math.random() - 0.5) * 200;
            positions[i3 + 1] = Math.random() * 100 + 30;
            positions[i3 + 2] = (Math.random() - 0.5) * 200;

            velocities[i] = -5 - Math.random() * 5; // Slower falling
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 1));

        const material = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.8,
            transparent: true,
            opacity: 0.9,
            depthWrite: false
        });

        this.particleSystem = new THREE.Points(geometry, material);
        this.scene.add(this.particleSystem);

        // White mist fog
        if (this.scene.fog) {
            this.scene.fog.density = 0.002 * this.weatherIntensity;
            this.scene.fog.color.setHex(0xe0e8f0);
        }

        console.log('Snow weather enabled');
    }

    update(deltaTime, vehiclePosition) {
        if (!this.particleSystem) {
            // Update fog dynamically based on position (for fog weather)
            if (this.weatherType === 'fog' && vehiclePosition) {
                this.updateFogDensity(vehiclePosition);
            }
            return;
        }

        const positions = this.particleSystem.geometry.attributes.position.array;
        const velocities = this.particleSystem.geometry.attributes.velocity.array;

        // Update particle positions
        for (let i = 0; i < positions.length / 3; i++) {
            const i3 = i * 3;

            // Move particle down
            positions[i3 + 1] += velocities[i] * deltaTime;

            // Reset particle if it goes below ground
            if (positions[i3 + 1] < -5) {
                positions[i3 + 1] = 100 + Math.random() * 50;
            }

            // Keep particles near camera
            if (this.camera) {
                const dx = positions[i3] - this.camera.position.x;
                const dz = positions[i3 + 2] - this.camera.position.z;
                const dist = Math.sqrt(dx * dx + dz * dz);

                if (dist > 100) {
                    // Respawn near camera
                    const angle = Math.random() * Math.PI * 2;
                    const radius = 50 + Math.random() * 30;
                    positions[i3] = this.camera.position.x + Math.cos(angle) * radius;
                    positions[i3 + 2] = this.camera.position.z + Math.sin(angle) * radius;
                }
            }
        }

        this.particleSystem.geometry.attributes.position.needsUpdate = true;

        // Lightning effect for rain
        if (this.weatherType === 'rain') {
            this.updateLightning(deltaTime);
        }
    }

    updateFogDensity(vehiclePosition) {
        // Fog is denser in valleys (lower elevation)
        if (!this.scene.fog || !vehiclePosition) return;

        const baseY = 0; // Assume road base level
        const elevationFactor = Math.max(0, Math.min(1, (vehiclePosition.y - baseY) / 50));

        // Denser fog at low elevation, lighter at high elevation
        const baseDensity = 0.003 * this.weatherIntensity;
        this.scene.fog.density = baseDensity * (1 - elevationFactor * 0.5);
    }

    updateLightning(deltaTime) {
        this.lightningTimer += deltaTime;

        if (this.lightningTimer >= this.lightningInterval) {
            // Lightning flash!
            this.lightningTimer = 0;
            this.lightningInterval = 5 + Math.random() * 10; // Next flash in 5-15 seconds

            // Brief ambient light increase
            if (this.scene.children) {
                const ambientLights = this.scene.children.filter(child =>
                    child instanceof THREE.AmbientLight || child instanceof THREE.HemisphereLight
                );

                ambientLights.forEach(light => {
                    const originalIntensity = light.intensity;
                    light.intensity = originalIntensity * 3;

                    // Reset after 100ms
                    setTimeout(() => {
                        light.intensity = originalIntensity;
                    }, 100);
                });
            }

            console.log('⚡ Lightning flash!');
        }
    }

    getPhysicsMultipliers() {
        switch(this.weatherType) {
            case 'rain':
                return {
                    lateralFriction: 0.7 * this.weatherIntensity + (1 - this.weatherIntensity),
                    brakeForce: 0.8 * this.weatherIntensity + (1 - this.weatherIntensity),
                    acceleration: 0.9 * this.weatherIntensity + (1 - this.weatherIntensity)
                };

            case 'snow':
                return {
                    lateralFriction: 0.4 * this.weatherIntensity + (1 - this.weatherIntensity),
                    brakeForce: 0.6 * this.weatherIntensity + (1 - this.weatherIntensity),
                    acceleration: 0.7 * this.weatherIntensity + (1 - this.weatherIntensity)
                };

            case 'fog':
            case 'clear':
            default:
                return {
                    lateralFriction: 1.0,
                    brakeForce: 1.0,
                    acceleration: 1.0
                };
        }
    }

    isIcePatch(segmentIndex) {
        // For snow weather, certain segments are icy (even lower grip)
        if (this.weatherType !== 'snow') return false;

        // Make every ~25th segment an ice patch (pseudo-random but consistent)
        const icePattern = [23, 47, 68, 91, 115, 142, 167, 193, 218, 241, 269, 287];
        return icePattern.includes(segmentIndex % 300);
    }

    getWeatherType() {
        return this.weatherType;
    }
}
