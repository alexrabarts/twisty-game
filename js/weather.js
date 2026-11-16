/**
 * Weather System
 * Handles fog, rain, snow effects and physics modifications
 */
class WeatherSystem {
    // `random` is the source of every random number the weather draws. A leg
    // on one look keeps the global stream, so cones, rockfalls and traffic read
    // the same numbers as before; a leg with several looks passes a seeded one.
    constructor(scene, camera, random = Math.random) {
        this.scene = scene;
        this.camera = camera;
        this.random = random;
        this.weatherType = 'clear';
        this.weatherIntensity = 1.0;
        // How much of each weather is present, 0 to 1 (see setMix)
        this.mix = { rain: 0, snow: 0, fog: 0 };
        // Particle systems by weather, made once by prepare()
        this.systems = {};
        // The lowest road height of the part; setMix sets it
        this.baseY = 0;
        // The road's own grip on the leg (Terrain.LEGS[i].grip), under the
        // weather's: the tour's later legs have colder, dirtier tarmac
        this.surfaceGrip = 1;
        // The clear-weather fog density; setMix replaces it with the sampled part's
        this.originalFogDensity = scene.fog ? scene.fog.density : 0.0008;
        // 0 to 1: how far above baseY the bike is, for the fog that thins uphill
        this.fogElevation = 0;
        this.lightningTimer = 0;
        this.lightningInterval = 5 + this.random() * 5; // 5-10 seconds

        // Store base physics values (will be set by vehicle)
        this.basePhysics = {
            lateralFriction: 1.0,
            brakeForce: 1.0,
            acceleration: 1.0
        };
    }

    // Build the particle systems for these weathers once, for the whole leg.
    // Nothing shows until setMix gives a weather a share.
    prepare(types) {
        this.dispose();

        // Reset lightning timer for the new leg
        this.lightningTimer = 0;
        this.lightningInterval = 5 + this.random() * 5; // 5-10 seconds

        types.forEach(type => {
            if (type === 'rain') this.setupRain();
            else if (type === 'snow') this.setupSnow();
        });
    }

    // Set how much of each weather is present. Changes the draw range of the
    // particles, the scene fog and the grip, and allocates nothing.
    //   rain, snow, fog  shares, 0 to 1, summing to at most 1
    //   intensity        the intensity of the weather that is present
    //   fogDensity       the clear-weather fog density of the part
    //   baseY            the part's lowest road height
    setMix({ rain = 0, snow = 0, fog = 0, intensity = 1, fogDensity = this.originalFogDensity, baseY = this.baseY }) {
        this.mix.rain = rain;
        this.mix.snow = snow;
        this.mix.fog = fog;
        this.weatherIntensity = intensity;
        this.baseY = baseY;
        this.originalFogDensity = fogDensity;
        this.weatherType = this.dominantType();

        for (const type of Object.keys(this.systems)) {
            const { points, count } = this.systems[type];
            const share = this.mix[type];
            points.visible = share > 0;
            points.geometry.setDrawRange(0, Math.floor(count * share));
        }

        this.writeFogColor();
        this.writeFogDensity();
    }

    // The weather with the largest share; clear when no weather has more than the rest
    dominantType() {
        const { rain, snow, fog } = this.mix;
        let best = 'clear';
        let share = 1 - Math.min(1, rain + snow + fog);
        [['rain', rain], ['snow', snow], ['fog', fog]].forEach(([type, value]) => {
            if (value > share || (value === share && best === 'clear' && value > 0)) {
                best = type;
                share = value;
            }
        });
        return best;
    }

    // Free the particles and their GPU buffers (rain is 3000 particles)
    dispose() {
        for (const type of Object.keys(this.systems)) {
            const { points } = this.systems[type];
            this.scene.remove(points);
            if (points.geometry) points.geometry.dispose();
            if (points.material) {
                if (points.material.map) points.material.map.dispose();
                points.material.dispose();
            }
        }
        this.systems = {};
    }

    // Misty grey-blue, grey and white mist: the fog the weather tints toward
    writeFogColor() {
        const fog = this.scene.fog;
        const { rain, snow, fog: mist } = this.mix;
        const total = rain + snow + mist;
        if (!fog || total <= 0) return;
        const tints = [[rain, 0x707880], [snow, 0xe0e8f0], [mist, 0xb0c0d0]];
        const strength = Math.min(1, total);
        const single = tints.find(([share]) => share >= 1);
        if (single) {
            fog.color.setHex(single[1]);
            return;
        }
        const channel = shift => Math.round(tints.reduce((sum, [share, hex]) => sum + share * ((hex >> shift) & 255), 0) / total);
        this.tint = this.tint || new THREE.Color();
        this.tint.setHex((channel(16) << 16) | (channel(8) << 8) | channel(0));
        fog.color.lerp(this.tint, strength);
    }

    // The only writer of the scene fog density. The weather's density
    // replaces the part's clear-weather density by the share of weather
    // present: rain and snow at a fixed density, fog thinner as the bike climbs.
    writeFogDensity() {
        const fog = this.scene.fog;
        if (!fog || fog.density === undefined) return;
        const { rain, snow, fog: mist } = this.mix;
        const strength = Math.min(1, rain + snow + mist);
        const intensity = this.weatherIntensity;
        const weather = 0.0015 * intensity * rain
            + 0.002 * intensity * snow
            + 0.003 * intensity * (1 - this.fogElevation * 0.5) * mist;
        fog.density = this.originalFogDensity * (1 - strength) + weather;
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
            positions[i3] = (this.random() - 0.5) * 200; // X: -100 to 100 around camera
            positions[i3 + 1] = this.random() * 120 - 30; // Y: -30 to 90 relative to camera
            positions[i3 + 2] = (this.random() - 0.5) * 200; // Z: -100 to 100 around camera

            velocities[i] = -30 - this.random() * 20; // Fast falling
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 1));

        // Each drop is a sprite of a thin vertical streak
        const material = new THREE.PointsMaterial({
            color: 0xb8c4d0,
            map: this.makeSpriteTexture('streak'),
            size: 2.2,
            transparent: true,
            opacity: 0.55,
            depthWrite: false
        });
        this.capPointSize(material, 90);

        this.addSystem('rain', geometry, material, rainCount);

        console.log('Rain weather prepared');
    }

    setupSnow() {
        // Create snow particle system
        const snowCount = 2000;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(snowCount * 3);
        const velocities = new Float32Array(snowCount);

        for (let i = 0; i < snowCount; i++) {
            const i3 = i * 3;
            positions[i3] = (this.random() - 0.5) * 200;
            positions[i3 + 1] = this.random() * 120 - 30; // Relative to camera
            positions[i3 + 2] = (this.random() - 0.5) * 200;

            velocities[i] = -5 - this.random() * 5; // Slower falling
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 1));

        const material = new THREE.PointsMaterial({
            color: 0xffffff,
            map: this.makeSpriteTexture('flake'),
            size: 0.55,
            transparent: true,
            opacity: 0.9,
            depthWrite: false
        });
        this.capPointSize(material, 22);

        this.addSystem('snow', geometry, material, snowCount);

        console.log('Snow weather prepared');
    }

    // The points stay out of sight until setMix gives their weather a share
    addSystem(type, geometry, material, count) {
        const points = new THREE.Points(geometry, material);
        points.frustumCulled = false; // Volume always surrounds the camera
        points.visible = false;
        geometry.setDrawRange(0, 0);
        if (this.camera) {
            points.position.copy(this.camera.position);
        }
        this.scene.add(points);
        this.systems[type] = { points, count, parked: false };
    }

    // Point sprites grow without limit as they near the camera: a drop
    // passing the lens covered a quarter of the screen. Cap the size.
    capPointSize(material, maxPixels) {
        material.onBeforeCompile = (shader) => {
            shader.vertexShader = shader.vertexShader.replace(
                '#include <fog_vertex>',
                `#include <fog_vertex>\n\tgl_PointSize = min(gl_PointSize, ${maxPixels.toFixed(1)});`
            );
        };
        // Distinct cap -> distinct program
        material.customProgramCacheKey = () => `capped-points-${maxPixels}`;
    }

    // 'streak' is a rain drop smeared by its fall, 'flake' a soft dot
    makeSpriteTexture(kind) {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        if (kind === 'streak') {
            const gradient = ctx.createLinearGradient(0, 0, 0, 64);
            gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
            gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.8)');
            gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = gradient;
            ctx.fillRect(31, 0, 2, 64);
        } else {
            const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
            gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
            gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.7)');
            gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, 64, 64);
        }
        return new THREE.CanvasTexture(canvas);
    }

    update(deltaTime, vehiclePosition) {
        // Lightning afterglow, read by the renderer for a screen flash
        this.flash = Math.max(0, (this.flash || 0) - deltaTime * 5);

        // Fog thins as the bike climbs out of the low ground
        if (this.mix.fog > 0 && vehiclePosition) {
            this.updateFogDensity(vehiclePosition);
        }

        for (const type of Object.keys(this.systems)) {
            this.updateParticles(this.systems[type], this.mix[type], deltaTime, vehiclePosition);
        }

        // Lightning effect for rain
        if (this.weatherType === 'rain' && this.systems.rain) {
            this.updateLightning(deltaTime);
        }
    }

    // Re-anchor the particle volume to the camera so precipitation surrounds
    // the player along the whole course, not just near where it was first
    // spawned. Particle local positions are compensated by the camera delta (so
    // drops stay world-stationary) and wrapped at the volume edges to keep
    // density uniform while moving. A weather with no share is left alone; when
    // it returns its volume is placed on the camera, which it already fills.
    updateParticles(system, share, deltaTime, vehiclePosition) {
        const { points } = system;
        if (share <= 0) {
            system.parked = true;
            return;
        }

        const anchor = this.camera ? this.camera.position : vehiclePosition;
        let shiftX = 0, shiftY = 0, shiftZ = 0;
        if (anchor && !system.parked) {
            shiftX = anchor.x - points.position.x;
            shiftY = anchor.y - points.position.y;
            shiftZ = anchor.z - points.position.z;
        }
        if (anchor) points.position.set(anchor.x, anchor.y, anchor.z);
        system.parked = false;

        const halfExtent = 100; // Volume is ±100 around the camera
        const positions = points.geometry.attributes.position.array;
        const velocities = points.geometry.attributes.velocity.array;

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
                positions[i3 + 1] = 60 + this.random() * 30;
            } else if (positions[i3 + 1] > 120) {
                // Pushed too high by a fast descent - bring back into the volume
                positions[i3 + 1] = 60 + this.random() * 30;
            }
        }

        points.geometry.attributes.position.needsUpdate = true;
    }

    updateFogDensity(vehiclePosition) {
        // Fog is denser in valleys (lower elevation)
        if (!this.scene.fog || !vehiclePosition) return;

        this.fogElevation = Math.max(0, Math.min(1, (vehiclePosition.y - this.baseY) / 50));
        this.writeFogDensity();
    }

    updateLightning(deltaTime) {
        this.lightningTimer += deltaTime;

        if (this.lightningTimer >= this.lightningInterval) {
            // Lightning flash!
            this.flash = 1;
            this.lightningTimer = 0;
            this.lightningInterval = 5 + this.random() * 10; // Next flash in 5-15 seconds

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
        const weather = this.weatherPhysics();
        return {
            ...weather,
            lateralFriction: weather.lateralFriction * this.surfaceGrip,
            brakeForce: weather.brakeForce * this.surfaceGrip
        };
    }

    // Each weather scales the grip by its share: a full share gives its
    // multipliers exactly, no share gives none, and a mix lies between
    weatherPhysics() {
        const intensity = this.weatherIntensity;
        const result = { lateralFriction: 1.0, brakeForce: 1.0, acceleration: 1.0 };
        const apply = (share, lateral, brake, acceleration) => {
            if (share <= 0) return;
            const part = value => (share >= 1 ? value : 1 + (value - 1) * share);
            result.lateralFriction *= part(lateral);
            result.brakeForce *= part(brake);
            result.acceleration *= part(acceleration);
        };
        apply(this.mix.rain,
            0.7 * intensity + (1 - intensity),
            0.8 * intensity + (1 - intensity),
            0.9 * intensity + (1 - intensity));
        apply(this.mix.snow,
            0.4 * intensity + (1 - intensity),
            0.6 * intensity + (1 - intensity),
            0.7 * intensity + (1 - intensity));
        // Fog and clear air leave the grip alone
        return result;
    }

    isIcePatch(segmentIndex) {
        // Where snow lies over half the road, certain segments are icy (even lower grip)
        if (this.mix.snow <= 0.5) return false;

        // Make every ~25th segment an ice patch (pseudo-random but consistent)
        const icePattern = [23, 47, 68, 91, 115, 142, 167, 193, 218, 241, 269, 287];
        return icePattern.includes(segmentIndex % 300);
    }

    getWeatherType() {
        return this.weatherType;
    }
}
