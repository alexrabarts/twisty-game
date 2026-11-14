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
        input.getSteeringInput = () => {
            const v = game.vehicle;
            const env = game.environment;
            if (!ap.on || !v || !env || !env.roadPath) return 0;
            const path = env.roadPath;
            const seg = Math.floor(v.currentRoadSegment || 0);
            const t = path[Math.min(seg + ap.lookahead, path.length - 1)];
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

    // Freeze the game and look at the bike from a point beside the road.
    // side > 0 is the valley side, back > 0 is behind the bike.
    view(side = 30, up = 12, back = 25, ahead = 40) {
        const game = window.game;
        game.paused = true;
        const v = game.vehicle.position;
        const p = game.environment.roadPath[Math.floor(game.vehicle.currentRoadSegment)];
        const rx = Math.cos(p.heading), rz = -Math.sin(p.heading);
        const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
        game.camera.up.set(0, 1, 0);
        game.camera.fov = 60;
        game.camera.updateProjectionMatrix();
        game.camera.position.set(v.x + rx * side - fx * back, v.y + up, v.z + rz * side - fz * back);
        game.camera.lookAt(v.x + fx * ahead, v.y, v.z + fz * ahead);
    },

    teleport(segment) {
        const game = window.game;
        const p = game.environment.roadPath[segment];
        const v = game.vehicle;
        v.position.set(p.x, p.y, p.z);
        v.yawAngle = p.heading;
        v.leanAngle = 0;
        v.leanVelocity = 0;
        v.findNearestRoadSegment();
    }
};
