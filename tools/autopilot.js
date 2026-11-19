// Dev helper, not loaded by the game. Paste into the console or inject with
//   const s = document.createElement('script'); s.src = 'tools/autopilot.js'; document.head.appendChild(s);
// then call twistyDev.start('mountain-dawn') and twistyDev.autopilot({ speed: 25 }).
window.twistyDev = {
    start(legId) {
        const game = window.game;
        if (game.vehicle) game.cleanupCurrentLeg();
        game.tourSystem.selectLeg(legId);
        game.initializeGameWithLeg(game.tourSystem.getCurrentLeg());
        const dashboard = document.querySelector('.dashboard');
        if (dashboard) dashboard.style.opacity = '1';
    },

    // Rides the leg: heading error -> target lean -> steering input
    autopilot(options = {}) {
        const game = window.game;
        const ap = Object.assign({ speed: 25, lookahead: 2, yawGain: 1.6, kp: 4, kd: 1.2, lane: 0, on: true }, options);
        const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
        const input = game.input;
        if (game.environment && game.environment.isWorld) {
            this.worldPilot(game, ap, input);
            this.ap = ap;
            return ap;
        }
        input.getSteeringInput = () => {
            const v = game.vehicle;
            const env = game.environment;
            if (!ap.on || !v || !env || !env.route) return 0;
            const route = env.route;
            // `lookahead` counts route units (20 m on a leg) ahead of the bike
            const ahead = Math.min((v.routeS || 0) + ap.lookahead * route.unitM, route.length);
            const t = route.sample(ahead, this.aim || (this.aim = {}));
            const tx = t.x + Math.cos(t.heading) * ap.lane;
            const tz = t.z - Math.sin(t.heading) * ap.lane;
            const err = wrap(Math.atan2(tx - v.position.x, tz - v.position.z) - v.yawAngle);
            const yawRate = Math.max(-1.2, Math.min(1.2, err * ap.yawGain));
            const targetLean = Math.max(-0.75, Math.min(0.75, -Math.atan(yawRate * Math.max(v.speed, 5) / 9.81)));
            return Math.max(-1, Math.min(1, (v.leanAngle - targetLean) * ap.kp + v.leanVelocity * ap.kd));
        };
        input.getThrottleInput = () => (ap.on && game.vehicle && game.vehicle.speed < ap.speed ? 1 : 0);
        input.getBrakeInput = () => (ap.on && game.vehicle && game.vehicle.speed > ap.speed + 4 ? 1 : 0);
        input.getWheelieInput = () => 0;
        this.ap = ap;
        return ap;
    },

    // The world's pilot: pure pursuit on a look-ahead that grows with speed, and a speed that takes each
    // bend at `apFactor` of the speed its curvature allows (the lean cap, the grip under the wheels), braking
    // for it in advance. The curvature wanted, capped at the most the lean can give at this speed, gives a lean,
    // and the steering (a torque on the lean, as a keyboard rider's) holds the bike at it.
    worldPilot(game, ap, input) {
        const g = 9.81;
        const route = game.environment.route;
        const world = game.environment.physics;
        const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
        ap.apFactor = ap.apFactor || 0.85;
        ap.brake = ap.brake || 6;
        ap.worldKp = ap.worldKp || 8;
        const here = {}, aim = {};
        const grip = (s) => {
            route.sample(s, here);
            const v = game.vehicle;
            const base = v.worldMultipliers().lateralFriction / (v.worldSurfaceGrip || 1);
            return base * (here.flags && here.flags.cobbles ? world.cobbleGrip : 1);
        };
        const capTan = (s) => Math.tan(Math.atan(Math.tan(world.leanCapDeg * Math.PI / 180) * grip(s)));
        const curvature = (s) => Math.abs(route.curvatureAt(s, 6));
        const target = (s) => {
            let allowed = ap.speed;
            for (let d = 0; d <= 120; d += 6) {
                const k = Math.min(curvature(s + d), 1 / world.radiusFloor);
                if (k < 1e-4) continue;
                const corner = Math.min(ap.speed, ap.apFactor * Math.sqrt(g * capTan(s + d) / k));
                allowed = Math.min(allowed, Math.sqrt(corner * corner + 2 * ap.brake * d));
            }
            // A roadworks light that is not green ahead (ap.obeyLights, on unless set false): stop at its line
            const works = game.environment.roadworks;
            const stop = works && ap.obeyLights !== false ? works.pilotStop(s) : Infinity;
            if (stop < Infinity) return Math.min(Math.max(allowed, 5), Math.sqrt(2 * ap.brake * Math.max(0, stop - 2.5)));
            return Math.max(allowed, 5);
        };
        input.getSteeringInput = () => {
            const v = game.vehicle;
            if (!ap.on || !v) return 0;
            const reach = Math.max(7, Math.min(30, 4 + 0.7 * v.speed));
            const t = route.sample((v.routeS || 0) + reach, aim);
            // Through a roadworks site the pilot keeps to the open lane
            const works = game.environment.roadworks;
            const lane = works ? works.pilotLane((v.routeS || 0) + reach, ap.lane) : ap.lane;
            const tx = t.x + Math.cos(t.heading) * lane;
            const tz = t.z - Math.sin(t.heading) * lane;
            const err = wrap(Math.atan2(tx - v.position.x, tz - v.position.z) - v.yawAngle);
            const most = Math.min(1 / world.radiusFloor, g * capTan(v.routeS || 0) / Math.max(1, v.speed * v.speed));
            const wanted = Math.max(-most, Math.min(most, 2 * Math.sin(err) / reach));
            // Steering is a torque on the lean, so steer the lean to the one that turns at that curvature
            // (a positive input leans the bike negative and turns it to a larger yaw)
            const lean = -Math.sign(wanted) * Math.atan(v.speed * v.speed * Math.abs(wanted) / g);
            return Math.max(-1, Math.min(1, (v.leanAngle - lean) * ap.worldKp));
        };
        input.getThrottleInput = () => (ap.on && game.vehicle && game.vehicle.speed < target(game.vehicle.routeS || 0) ? 1 : 0);
        // Hard on the brake for a light, as for a bend over its speed
        input.getBrakeInput = () => (ap.on && game.vehicle && game.vehicle.speed > target(game.vehicle.routeS || 0) + (game.vehicle.speed < 3 ? 0.2 : 1) ? 1 : 0);
        input.getWheelieInput = () => 0;
    },

    // Freeze the game and look at the bike from a point beside the road.
    // side > 0 is the right of the road (which ground is there depends on the leg's profile), back > 0 is behind the bike.
    view(side = 30, up = 12, back = 25, ahead = 40) {
        const game = window.game;
        game.paused = true;
        const v = game.vehicle.position;
        const p = game.environment.route.sample(game.vehicle.routeS);
        const rx = Math.cos(p.heading), rz = -Math.sin(p.heading);
        const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
        game.camera.up.set(0, 1, 0);
        game.camera.fov = 60;
        game.camera.updateProjectionMatrix();
        game.camera.position.set(v.x + rx * side - fx * back, v.y + up, v.z + rz * side - fz * back);
        game.camera.lookAt(v.x + fx * ahead, v.y, v.z + fz * ahead);
    },

    // World only: draw the game from a camera pose, for the photo match (tools/world/photomatch.mjs).
    // x, y, z in local metres (or eyeHeight in place of y: metres above the drawn ground, read once the ground
    // round the place has streamed in); bearing in degrees from north (90 east); pitch > 0 looks up; roll > 0 turns the
    // picture clockwise; vfov is the vertical field of view in degrees. The ride is frozen, the bike stands on
    // the route at the point nearest the camera (so the world streams round it) and is hidden with the traffic.
    // With { mask: true } it also draws the sky white and everything else black, and returns the first row of
    // ground in each column (the canvas height where a column is all sky), top down, at the canvas size.
    async viewPose({ x, y, z, eyeHeight, bearing, pitch = 0, roll = 0, vfov = 60, mask = false } = {}) {
        const game = window.game;
        const env = game.environment;
        if (!env || !env.isWorld) throw new Error('viewPose: world mode only');
        this.freeze();
        const route = env.route;
        const s = route.project(x, z, null).s;
        const p = route.sample(s, {});
        const v = game.vehicle;
        v.position.set(p.x, p.y, p.z);
        v.yawAngle = p.heading;
        v.leanAngle = 0;
        v.leanVelocity = 0;
        v.speed = 0;
        v.findNearestRoadSegment();
        game.worldRun.reset(s);
        env.update(p, s, null, Infinity);
        await env.streamer.settle(p, s);
        // A few ticks so the light, sky and fog take this place's look
        this.step(3, { render: true });
        env.streamer.pump(Infinity);
        const traffic = game.traffic || {};
        const hidden = [v.group, ...(traffic.cars || []).map(c => c.carGroup), ...(traffic.motorcycles || []).map(m => m.bikeGroup)].filter(Boolean);
        hidden.forEach(o => { o.visible = false; });
        const groundY = env.ground.groundY(x, z, null);
        if (y === undefined) y = groundY + eyeHeight;
        const camera = game.camera;
        const renderer = game.graphics.renderer;
        const size = renderer.getSize(new THREE.Vector2());
        const rad = Math.PI / 180;
        camera.position.set(x, y, z);
        camera.rotation.order = 'YXZ';
        camera.rotation.set(pitch * rad, -bearing * rad, roll * rad);
        camera.fov = vfov;
        camera.aspect = size.x / size.y;
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld(true);
        let rows = null;
        if (mask) {
            const scene = game.scene;
            const saved = { background: scene.background, fog: scene.fog, override: scene.overrideMaterial, sky: game.graphics.skyMesh ? game.graphics.skyMesh.visible : null };
            if (game.graphics.skyMesh) game.graphics.skyMesh.visible = false;
            scene.background = new THREE.Color(1, 1, 1);
            scene.fog = null;
            scene.overrideMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
            renderer.setRenderTarget(null);
            renderer.render(scene, camera);
            const gl = renderer.getContext();
            const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
            const pixels = new Uint8Array(w * h * 4);
            gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            rows = [];
            for (let col = 0; col < w; col++) {
                let row = 0;
                // readPixels is bottom up: row r from the top is h - 1 - r
                while (row < h && pixels[((h - 1 - row) * w + col) * 4] > 127) row++;
                rows.push(row);
            }
            scene.overrideMaterial.dispose();
            scene.background = saved.background;
            scene.fog = saved.fog;
            scene.overrideMaterial = saved.override;
            if (game.graphics.skyMesh) game.graphics.skyMesh.visible = saved.sky;
        }
        game.graphics.render(game.scene, camera);
        return { s, rows, groundY, y, size: { width: size.x, height: size.y } };
    },

    // Stop the live animation loop so frames only happen when step() runs.
    // Call it in the same synchronous turn as start(): any frame in between
    // would advance the ride by wall-clock time and make runs differ.
    freeze() {
        const game = window.game;
        if (!this.frozen) {
            cancelAnimationFrame(game.animationFrameId);
            // Each animate() call schedules the next frame; none may run on its own
            window.requestAnimationFrame = () => 0;
            game.clock.getDelta = () => 1 / 60;
            // Driven by wall-clock time at the top of animate()
            game.adaptResolution = () => {};
            this.ticks = 0;
            this.frozen = true;
        }
        // start() builds a new vehicle for each leg, so count its updates here
        const vehicle = game.vehicle;
        if (vehicle && !vehicle.tickCounted) {
            const update = vehicle.update.bind(vehicle);
            vehicle.update = (...args) => {
                this.ticks++;
                return update(...args);
            };
            vehicle.tickCounted = true;
        }
    },

    // Run n real frames of Game.animate, one fixed physics tick each:
    // 0 + 1/60 >= 1/60 runs the loop body once and leaves exactly 0 behind.
    // Rendering is skipped unless { render: true }.
    step(n = 1, options = {}) {
        const game = window.game;
        this.freeze();
        const graphics = game.graphics;
        const render = graphics.render;
        const update = graphics.update;
        if (!options.render) {
            graphics.render = () => {};
            graphics.update = () => {};
        }
        const before = this.ticks;
        try {
            for (let i = 0; i < n; i++) {
                game.paused = false;
                game.accumulatedTime = 0;
                game.animate();
            }
        } finally {
            graphics.render = render;
            graphics.update = update;
        }
        // Fails loudly if animate() is ever restructured, so no stepped proof can pass vacuously
        if (this.ticks - before !== n || game.accumulatedTime !== 0) {
            throw new Error('step: animate() shape changed');
        }
        return this.ticks;
    },

    // `segment` is in route units: 20 m segments on a leg
    teleport(segment) {
        const game = window.game;
        const route = game.environment.route;
        const p = route.sample(route.fromUnits(segment));
        const v = game.vehicle;
        v.position.set(p.x, p.y, p.z);
        v.yawAngle = p.heading;
        v.leanAngle = 0;
        v.leanVelocity = 0;
        v.findNearestRoadSegment();
        // A world takes the new place as the start of its progress, as a resume does
        if (game.worldRun) game.worldRun.reset(route.fromUnits(segment));
        // A converted leg draws the window round the bike's new place at once
        if (game.environment.sections) game.environment.ensureWindow(segment, { sync: true });
    }
};
