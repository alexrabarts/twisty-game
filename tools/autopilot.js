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
    // for it in advance. The bike turns by curvature, so the steering is the curvature wanted over the most
    // the lean can give at this speed.
    worldPilot(game, ap, input) {
        const g = 9.81;
        const route = game.environment.route;
        const world = game.environment.physics;
        const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
        ap.apFactor = ap.apFactor || 0.85;
        ap.brake = ap.brake || 6;
        const here = {}, there = {}, aim = {};
        const grip = (s) => {
            route.sample(s, here);
            const v = game.vehicle;
            const base = v.worldMultipliers().lateralFriction / (v.worldSurfaceGrip || 1);
            return base * (here.flags && here.flags.cobbles ? world.cobbleGrip : 1);
        };
        const capTan = (s) => Math.tan(Math.atan(Math.tan(world.leanCapDeg * Math.PI / 180) * grip(s)));
        const curvature = (s) => {
            route.sample(s, here);
            route.sample(s + 6, there);
            return Math.abs(wrap(there.heading - here.heading)) / 6;
        };
        const target = (s) => {
            let allowed = ap.speed;
            for (let d = 0; d <= 120; d += 6) {
                const k = Math.min(curvature(s + d), 1 / world.radiusFloor);
                if (k < 1e-4) continue;
                const corner = Math.min(ap.speed, ap.apFactor * Math.sqrt(g * capTan(s + d) / k));
                allowed = Math.min(allowed, Math.sqrt(corner * corner + 2 * ap.brake * d));
            }
            return Math.max(allowed, 5);
        };
        input.getSteeringInput = () => {
            const v = game.vehicle;
            if (!ap.on || !v) return 0;
            const reach = Math.max(7, Math.min(30, 4 + 0.7 * v.speed));
            const t = route.sample((v.routeS || 0) + reach, aim);
            const tx = t.x + Math.cos(t.heading) * ap.lane;
            const tz = t.z - Math.sin(t.heading) * ap.lane;
            const err = wrap(Math.atan2(tx - v.position.x, tz - v.position.z) - v.yawAngle);
            const wanted = 2 * Math.sin(err) / reach;
            const most = Math.min(1 / world.radiusFloor, g * capTan(v.routeS || 0) / Math.max(1, v.speed * v.speed));
            return Math.max(-1, Math.min(1, wanted / most));
        };
        input.getThrottleInput = () => (ap.on && game.vehicle && game.vehicle.speed < target(game.vehicle.routeS || 0) ? 1 : 0);
        input.getBrakeInput = () => (ap.on && game.vehicle && game.vehicle.speed > target(game.vehicle.routeS || 0) + 1 ? 1 : 0);
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
