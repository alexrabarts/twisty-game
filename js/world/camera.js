// WorldCamera: the chase camera of a world (R2). No THREE and no DOM; Game
// owns the camera object and asks this for where to put it.
//
// The legs keep the yaw camera. A world road turns through hairpins, so a
// camera tied to the bike's yaw would look at the rock face on every bend:
//   - the look target is on the route ahead, not along the bike's heading
//   - the boom turns by a smoothed yaw that follows the route behind the bike
//   - the boom shortens at once when the land is in the way and grows back slowly
class WorldCamera {
    // Radians a second the boom yaw may turn: 120 degrees
    static get YAW_RATE() { return 2 * Math.PI / 3; }

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
    }

    // Camera yaw and boom start again at the bike, for the first frame and after a restart
    reset(yaw) {
        this.yaw = yaw;
        this.fraction = 1;
    }

    static wrap(angle) {
        return Math.atan2(Math.sin(angle), Math.cos(angle));
    }

    // The smoothed boom yaw: follows the route heading `FOLLOW_BEHIND_M` behind the bike at no more than YAW_RATE
    followYaw(s, dt) {
        const target = this.route.sample(Math.max(0, s - WorldCamera.FOLLOW_BEHIND_M), this.sampled).heading;
        const step = WorldCamera.YAW_RATE * dt;
        this.yaw += Math.max(-step, Math.min(step, WorldCamera.wrap(target - this.yaw)));
        return this.yaw;
    }

    // 0 to 1: how much of a hairpin lies ahead of s
    bendShare(s) {
        const back = this.route.sample(Math.max(0, s - 5), this.sampled).heading;
        const ahead = this.route.sample(s + WorldCamera.BEND_SPAN_M - 5, this.look).heading;
        const turn = Math.abs(WorldCamera.wrap(ahead - back));
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
