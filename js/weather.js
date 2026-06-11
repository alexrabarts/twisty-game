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
        // Create rain particle system. Particle positions are LOCAL to the
        // system, which is re-anchored to the camera every update - so the
        // rain volume travels with the player instead of staying near the
        // world origin where the particles were first spawned.
        const rainCount = 3000;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(rainCount * 3);
        const velocities = new Float32Array(rainCount);

        for (let i = 0; i < rainCount; i++) {
            const i3 = i * 3;
            positions[i3] = (Math.random() - 0.5) * 200; // X: -100 to 100 around camera
            positions[i3 + 1] = Math.random() * 120 - 30; // Y: -30 to 90 relative to camera
            positions[i3 + 2] = (Math.random() - 0.5) * 200; // Z: -100 to 100 around camera

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
        this.particleSystem.frustumCulled = false; // Volume always surrounds the camera
        if (this.camera) {
            this.particleSystem.position.copy(this.camera.position);
        }
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
            positions[i3 + 1] = Math.random() * 120 - 30; // Relative to camera
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
        this.particleSystem.frustumCulled = false; // Volume always surrounds the camera
        if (this.camera) {
            this.particleSystem.position.copy(this.camera.position);
        }
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

        // Re-anchor the particle volume to the camera so precipitation
        // surrounds the player along the whole course, not just near where it
        // was first spawned. Particle local positions are compensated by the
        // camera delta (so drops stay world-stationary) and wrapped at the
        // volume edges to keep density uniform while moving.
        const anchor = this.camera ? this.camera.position : vehiclePosition;
        let shiftX = 0, shiftY = 0, shiftZ = 0;
        if (anchor) {
            shiftX = anchor.x - this.particleSystem.position.x;
            shiftY = anchor.y - this.particleSystem.position.y;
            shiftZ = anchor.z - this.particleSystem.position.z;
            this.particleSystem.position.set(anchor.x, anchor.y, anchor.z);
        }

        const halfExtent = 100; // Volume is ±100 around the camera
        const positions = this.particleSystem.geometry.attributes.position.array;
        const velocities = this.particleSystem.geometry.attributes.velocity.array;

        for (let i = 0; i < positions.length / 3; i++) {
            const i3 = i * 3;

            // Compensate for the volume's movement, then fall
            positions[i3] -= shiftX;
            positions[i3 + 1] += velocities[i] * deltaTime - shiftY;
            positions[i3 + 2] -= shiftZ;

            // Wrap horizontally at the volume edges
            if (positions[i3] > halfExtent) positions[i3] -= halfExtent * 2;
            else if (positions[i3] < -halfExtent) positions[i3] += halfExtent * 2;
            if (positions[i3 + 2] > halfExtent) positions[i3 + 2] -= halfExtent * 2;
            else if (positions[i3 + 2] < -halfExtent) positions[i3 + 2] += halfExtent * 2;

            // Recycle particles that have fallen well below the camera
            if (positions[i3 + 1] < -40) {
                positions[i3 + 1] = 60 + Math.random() * 30;
            } else if (positions[i3 + 1] > 120) {
                // Pushed too high by a fast descent - bring back into the volume
                positions[i3 + 1] = 60 + Math.random() * 30;
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
