// WorldCamera: the chase camera of a world (R2). No THREE and no DOM; Game
// owns the camera object and asks this for where to put it.
//
// The legs keep the yaw camera. A world road turns through hairpins, so a
// camera tied to the bike's yaw would look at the rock face on every bend:
//   - the look target is on the route ahead, not along the bike's heading
//   - the boom turns by a smoothed yaw that follows the route behind the bike
//   - the boom shortens at once when the land is in the way and grows back slowly
//   - in a hairpin the boom pulls back and up, turns faster and follows closer, and the look target gives way to
//     the bike, so the bike never leaves the screen (tools/terrain-check.mjs world-frustum)
class WorldCamera {
    // Radians a second the boom yaw may turn: 120 degrees, and 300 degrees in a full hairpin
    static get YAW_RATE() { return 2 * Math.PI / 3; }
    static get YAW_RATE_BEND() { return 5 * Math.PI / 3; }

    // The hairpin pull: how much of a hairpin is round the bike, 0 to 1, from the road's turn over the PULL_SPAN_M
    // metres that start PULL_BEHIND_M behind it: nothing under PULL_FROM rad, all of it from PULL_TO rad. It rises
    // at PULL_IN a second and falls at PULL_OUT a second, so the camera eases back in on the straight after.
    static get PULL_BEHIND_M() { return 15; }
    static get PULL_SPAN_M() { return 75; }
    static get PULL_FROM() { return 0.5; }
    static get PULL_TO() { return 1.8; }
    static get PULL_IN() { return 2.5; }
    static get PULL_OUT() { return 0.5; }

    // At full pull the boom is PULL_BACK longer and RAISE_M higher, and the camera keeps up with the boom at
    // FOLLOW_BEND a frame (at 60 Hz) at least, where the chase modes' own lag is 0.08 to 0.10
    static get PULL_BACK() { return 0.5; }
    static get RAISE_M() { return 3; }
    static get FOLLOW_BEND() { return 0.3; }

    // The look target gives way to the bike until the bike projects within KEEP_IN of the screen's middle (1 is the edge), clear of the HUD in the corners
    static get KEEP_IN() { return 0.55; }

    // Metres behind the bike on the route that the boom yaw follows
    static get FOLLOW_BEHIND_M() { return 4; }

    // Look target: LOOK_BASE_M + LOOK_PER_MS * speed metres ahead on the route
    static get LOOK_BASE_M() { return 8; }
    static get LOOK_PER_MS() { return 0.6; }

    // On a hairpin the look target moves out to the road LOOK_BEND_M ahead, so that the road round the bend stays
    // on the screen. How far the road turns over the next BEND_SPAN_M decides how far it moves: nothing under
    // BEND_FROM rad, all of it from BEND_TO rad.
    static get LOOK_BEND_M() { return 30; }
    static get BEND_SPAN_M() { return 50; }
    static get BEND_FROM() { return 0.35; }
    static get BEND_TO() { return 1.0; }

    // Share of the way the camera's look target moves to the wanted one each frame at 60 Hz
    static get LOOK_FOLLOW() { return 0.6; }

    // Points the boom is tested at, from the head to the wanted position
    static get MARCH_POINTS() { return 4; }

    // Metres above the bike's origin that the boom starts, and that the land must stay under it
    static get HEAD_M() { return 1.2; }
    static get CLEAR_M() { return 0.6; }

    // Lowest the camera goes over the land
    static get FLOOR_M() { return 1.0; }

    // Share of the boom that grows back each frame at 60 Hz
    static get GROW_PER_FRAME() { return 0.08; }

    // Metres of route samples either side of the bike's own that the ground is looked up in
    static get HINT_UNITS() { return 40; }

    constructor(route, ground) {
        this.route = route;
        this.ground = ground;
        this.yaw = 0;
        this.fraction = 1;
        this.sampled = {};
        this.look = {};
        this.land = {};
        this.hint = { start: 0, end: 0 };
        this.pull = 0;
        this.probe = null;
    }

    // Camera yaw and boom start again at the bike, for the first frame and after a restart
    reset(yaw) {
        this.yaw = yaw;
        this.fraction = 1;
        this.pull = 0;
    }

    static wrap(angle) {
        return Math.atan2(Math.sin(angle), Math.cos(angle));
    }

    // The smoothed boom yaw: follows the route heading `FOLLOW_BEHIND_M` behind the bike at no more than YAW_RATE
    followYaw(s, dt) {
        const target = this.route.sample(Math.max(0, s - WorldCamera.FOLLOW_BEHIND_M), this.sampled).heading;
        const step = (WorldCamera.YAW_RATE + (WorldCamera.YAW_RATE_BEND - WorldCamera.YAW_RATE) * this.pull) * dt;
        this.yaw += Math.max(-step, Math.min(step, WorldCamera.wrap(target - this.yaw)));
        return this.yaw;
    }

    // The road's turn round s, in radians, summed in 5 m steps so a turn past 180 degrees still counts in full
    turnAround(s) {
        let total = 0;
        const from = Math.max(0, s - WorldCamera.PULL_BEHIND_M);
        for (let d = 0; d < WorldCamera.PULL_SPAN_M; d += 5) total += this.route.headingChange(from + d, from + d + 5);
        return Math.abs(total);
    }

    // The smoothed hairpin pull at s, 0 to 1
    updatePull(s, dt) {
        const want = Math.max(0, Math.min(1, (this.turnAround(s) - WorldCamera.PULL_FROM) / (WorldCamera.PULL_TO - WorldCamera.PULL_FROM)));
        const step = want > this.pull ? WorldCamera.PULL_IN * dt : WorldCamera.PULL_OUT * dt;
        this.pull += Math.max(-step, Math.min(step, want - this.pull));
        return this.pull;
    }

    // The chase offset {x, y, z} (behind is -z) pulled back and raised by the hairpin pull, in place
    pullOffset(offset) {
        offset.z *= 1 + WorldCamera.PULL_BACK * this.pull;
        offset.y += WorldCamera.RAISE_M * this.pull;
        return offset;
    }

    // The share of the way the camera moves to its boom position each frame at 60 Hz: the mode's own, or closer in a hairpin
    follow(lerp) {
        return Math.max(lerp, WorldCamera.FOLLOW_BEND * this.pull);
    }

    // Moves `look` ({x, y, z}, in place) toward `bike` until a camera at `camera` (a THREE camera: position, up,
    // fov, aspect) looking at it sees the bike within KEEP_IN of the middle. `probe` is a scratch camera.
    keepInView(camera, look, bike, probe) {
        const seen = (t, out) => {
            probe.position.copy(camera.position);
            probe.up.copy(camera.up);
            probe.fov = camera.fov;
            probe.aspect = camera.aspect;
            probe.near = camera.near;
            probe.far = camera.far;
            probe.updateProjectionMatrix();
            probe.lookAt(look.x + (bike.x - look.x) * t, look.y + (bike.y - look.y) * t, look.z + (bike.z - look.z) * t);
            probe.updateMatrixWorld(true);
            out.set(bike.x, bike.y, bike.z).project(probe);
            return out.z > -1 && out.z < 1 && Math.max(Math.abs(out.x), Math.abs(out.y)) <= WorldCamera.KEEP_IN;
        };
        const at = this.ndc || (this.ndc = new probe.position.constructor());
        if (seen(0, at)) return 0;
        // The bike itself is in the middle at t = 1; the least t that keeps it within KEEP_IN, found by halving
        let low = 0, high = 1;
        for (let i = 0; i < 10; i++) {
            const mid = (low + high) / 2;
            if (seen(mid, at)) high = mid; else low = mid;
        }
        look.x += (bike.x - look.x) * high;
        look.y += (bike.y - look.y) * high;
        look.z += (bike.z - look.z) * high;
        return high;
    }

    // 0 to 1: how much of a hairpin lies ahead of s
    bendShare(s) {
        const turn = Math.abs(this.route.headingChange(Math.max(0, s - 5), s + WorldCamera.BEND_SPAN_M - 5));
        return Math.max(0, Math.min(1, (turn - WorldCamera.BEND_FROM) / (WorldCamera.BEND_TO - WorldCamera.BEND_FROM)));
    }

    // The point the camera looks at: {x, y, z} on the route ahead, `lift` metres above it
    lookTarget(s, speed, lift) {
        const usual = WorldCamera.LOOK_BASE_M + WorldCamera.LOOK_PER_MS * speed;
        const point = this.route.sample(s + usual + (Math.max(usual, WorldCamera.LOOK_BEND_M) - usual) * this.bendShare(s), this.sampled);
        this.look.x = point.x;
        this.look.y = point.y + lift;
        this.look.z = point.z;
        return this.look;
    }

    // Land height under (x, z), searched near route sample `index`
    landY(x, z, index) {
        const reach = WorldCamera.HINT_UNITS;
        this.hint.start = Math.max(0, index - reach);
        this.hint.end = index + reach;
        return this.ground.groundY(x, z, this.hint, false, this.land);
    }

    // The boom share that is clear of the land, from the head at `head` to the wanted position `want`
    // (both {x, y, z}); `index` is the bike's route sample. A hit shortens it at once; it grows back
    // GROW_PER_FRAME a frame (scaled to the frame time).
    clearFraction(head, want, index, dt) {
        const points = WorldCamera.MARCH_POINTS;
        let clear = 1;
        for (let i = 1; i <= points; i++) {
            const t = i / points;
            const x = head.x + (want.x - head.x) * t;
            const z = head.z + (want.z - head.z) * t;
            const y = head.y + (want.y - head.y) * t;
            if (this.landY(x, z, index) + WorldCamera.CLEAR_M > y) {
                clear = (i - 1) / points;
                break;
            }
        }
        if (clear < this.fraction) this.fraction = clear;
        else this.fraction = Math.min(clear, this.fraction + WorldCamera.GROW_PER_FRAME * Math.min(dt * 60, 3));
        return this.fraction;
    }

    // The camera position for a boom from `head` to `want`: shortened by the land, never under FLOOR_M of it
    place(head, want, index, dt, out) {
        const fraction = this.clearFraction(head, want, index, dt);
        out.x = head.x + (want.x - head.x) * fraction;
        out.y = head.y + (want.y - head.y) * fraction;
        out.z = head.z + (want.z - head.z) * fraction;
        out.y = Math.max(out.y, this.landY(out.x, out.z, index) + WorldCamera.FLOOR_M);
        return out;
    }
}
