// WorldCamera: the chase camera of a world (R2). No THREE and no DOM; Game
// owns the camera object and asks this for where to put it and where to look.
//
// The legs keep the yaw camera. A world road turns through hairpins, so a
// camera tied to the bike's yaw would look at the rock face on every bend:
//   - the boom turns with the route heading behind the bike, not with the bike's yaw
//   - the look target is on the route ahead, not along the bike's heading
//   - in a hairpin the boom pulls back and up and the look target moves out round the bend
//   - the land shortens the boom, and the camera keeps clear of the ground
//   - the look target gives way to the bike, so the bike never leaves the screen (tools/terrain-check.mjs world-frustum)
//
// Everything the camera reads from the route is smooth: the Hermite centreline (WorldRoute.curveAt) and the
// smoothed curvature profile (WorldRoute.smoothCurvatureAt), at the bike's smooth road position (Vehicle.roadFrame).
// Every quantity that moves the view goes through a critically damped spring (WorldCamera.spring), and the two
// guarantees that must hold on every frame (the bike in view, the boom clear of the land) are kept by a soft
// spring with a hard limit behind it that only acts when the spring falls short. So the view has no steps where
// the 4 m polyline turns, where the boom meets the land, or where the bike reaches the edge of the view.
// tools/terrain-check.mjs world-camera-smooth measures it over every hairpin.
class WorldCamera {
    // Every tuning value of the world camera. Spring rates are the natural frequency in rad/s of a critically damped
    // spring: it settles to 95% of a step in about 4.7 / rate seconds.
    static get TUNING() {
        return WorldCamera.tuning || (WorldCamera.tuning = Object.freeze({
            // The hairpin pull, 0 to 1: the road's turn over pullSpanM metres from pullBehindM behind the bike,
            // nothing under pullFrom rad and all of it from pullTo rad. It rises at pullIn and falls at pullOut, so the
            // camera eases back in on the straight after.
            pullBehindM: 15, pullSpanM: 75, pullFrom: 0.5, pullTo: 1.8, pullIn: 4, pullOut: 2,
            // At full pull the boom is pullBack longer and raiseM higher; its length and height move at boomRate
            pullBack: 0.5, raiseM: 3, boomRate: 5,
            // The boom yaw follows the route heading followBehindM behind the bike, at yawRate, yawRateBend at full pull
            followBehindM: 4, yawRate: 6, yawRateBend: 10,
            // The point the boom hangs from follows the bike at anchorRate (it takes the bike's own judder out)
            anchorRate: 14,
            // Look target: lookBaseM + lookPerMs x speed metres ahead on the route, out to lookBendM on a hairpin by how
            // far the road turns over the next bendSpanM (nothing under bendFrom rad, all of it from bendTo rad). Its
            // offset from the bike moves at lookRate.
            lookBaseM: 8, lookPerMs: 0.6, lookBendM: 30, bendSpanM: 50, bendFrom: 0.35, bendTo: 1.0, lookRate: 4,
            // The look target gives way to the bike until the bike is within keepIn of the screen's middle (1 is the
            // edge), at keepRate; never further out than keepHard
            keepIn: 0.55, keepHard: 0.75, keepRate: 16,
            // FOV moves at fovRate
            fovRate: 3,
            // The boom starts headM over the bike and stays clearM over the land; it is shortened at fractionIn and
            // grows back at fractionOut, and never comes within hardClearM of the land. The land is also tested where
            // the boom will be foreseeS seconds on, so the boom starts to shorten before the land reaches it.
            headM: 1.2, clearM: 0.6, hardClearM: 0.2, fractionIn: 10, fractionOut: 2.5, foreseeS: 0.3,
            // The camera stays floorM over the land, eased in over floorBandM
            floorM: 1.0, floorBandM: 0.4,
            // The hard limit tests the boom at marchPoints points and narrows the first hit down by marchRefine halvings.
            // The soft share tests it at softPoints points: a point that the land comes within clearM + softBandM of
            // (at the camera end; less toward the head, which rides 1.2 m over the road) starts to draw the boom in,
            // and one the land is within clearM of holds the boom short of it.
            marchPoints: 8, marchRefine: 6, softPoints: 16, softBandM: 1.5,
            // Route samples either side of the bike's own that the land is looked up in: near enough that the other leg
            // of a stacked hairpin, 6 m above the road and closer in plan than the road's own centre, is not taken for
            // the land under the bike
            hintUnits: 8,
            // The curvature profile's span, and the step the turn over a stretch of road is summed in
            curvatureSpanM: 8, turnStepM: 2.5,
            // What a target's own rate may carry into its spring (a restart is a jump, not a speed), and the rate of the
            // spring that rate is smoothed by
            maxSpeedMs: 80, maxYawRate: 8, followRate: 8
        }));
    }

    // The values the tests and Game read by name
    static get FLOOR_M() { return WorldCamera.TUNING.floorM; }
    // Share of the way the onboard view's look target moves to the wanted one each frame at 60 Hz
    static get LOOK_FOLLOW() { return 0.6; }

    constructor(route, ground) {
        this.route = route;
        this.ground = ground;
        this.land = {};
        this.hint = { start: 0, end: 0 };
        this.curve = {};
        this.sampled = {};
        this.springs = {};
        for (const name of ['pull', 'yaw', 'distance', 'height', 'ax', 'ay', 'az', 'lx', 'ly', 'lz', 'fraction', 'keep', 'fov']) this.springs[name] = { x: 0, v: 0, t: 0, rate: null };
        this.position = { x: 0, y: 0, z: 0 };
        this.anchor = { x: 0, y: 0, z: 0 };
        this.look = { x: 0, y: 0, z: 0 };
        this.head = { x: 0, y: 0, z: 0 };
        this.want = { x: 0, y: 0, z: 0 };
        this.ahead = { x: 0, y: 0, z: 0 };
        this.behind = { x: 0, y: 0, z: 0 };
        this.later = { x: 0, y: 0, z: 0 };
        this.aheadWant = { x: 0, y: 0, z: 0 };
        this.reset(0);
    }

    // The camera starts again at the bike on its next frame, for the first frame and after a restart
    reset(yaw) {
        this.fresh = true;
        this.yaw = yaw;
        this.pull = 0;
        this.fraction = 1;
        this.fov = 75;
        this.index = 0;
    }

    static wrap(angle) {
        return Math.atan2(Math.sin(angle), Math.cos(angle));
    }

    // One frame of a critically damped spring ({x, v, t}: value, rate, last target) toward `target` at `rate`
    // rad/s, exact for any dt. With `follow`, the target's own rate (from its last value, within `most` a second)
    // is carried, so a target moving steadily is tracked with no lag. That rate goes through a spring of its own at
    // followRate first (state.rate): where the target turns a corner its rate steps, and carried as it is, the step
    // would come through as a jolt.
    static spring(state, target, rate, dt, follow = false, most = Infinity, followRate = WorldCamera.TUNING.followRate) {
        let speed = 0;
        if (follow) {
            const raw = Math.max(-most, Math.min(most, (target - state.t) / dt));
            // The first frame after a settle takes the target's rate as it is
            if (!state.rate) {
                state.rate = { x: raw, v: 0, t: raw };
                state.v = raw;
            } else WorldCamera.spring(state.rate, raw, followRate, dt);
            speed = state.rate.x;
        }
        const error = state.x - (target - speed * dt);
        const errorRate = state.v - speed;
        const decay = Math.exp(-rate * dt);
        const pushed = (errorRate + rate * error) * dt;
        state.x = target + (error + pushed) * decay;
        state.v = speed + (errorRate - rate * pushed) * decay;
        state.t = target;
        return state.x;
    }

    // Puts a spring at `value`, at rest
    static settle(state, value) {
        state.x = value;
        state.v = 0;
        state.t = value;
        state.rate = null;
        return value;
    }

    // The route's smooth signed curvature at s
    curvature(s) {
        const route = this.route;
        const span = WorldCamera.TUNING.curvatureSpanM;
        return typeof route.smoothCurvatureAt === 'function' ? route.smoothCurvatureAt(s, span) : route.curvatureAt(s - span / 2, span);
    }

    // The road's signed turn from s0 to s1 in radians: the smooth curvature summed in turnStepM steps, so a turn past
    // 180 degrees counts in full and the sum moves smoothly with s0
    turn(s0, s1) {
        const step = WorldCamera.TUNING.turnStepM;
        let total = 0;
        let last = this.curvature(s0);
        for (let s = s0; s < s1; s += step) {
            const next = this.curvature(Math.min(s1, s + step));
            total += (last + next) / 2 * (Math.min(s1, s + step) - s);
            last = next;
        }
        return total;
    }

    // The point and heading of the smooth centreline at s: {x, y, z, heading}
    centre(s, out) {
        const route = this.route;
        const clamped = Math.max(0, Math.min(route.length, s));
        const y = route.sample(clamped, this.sampled).y;
        if (typeof route.curveAt === 'function' && route.points.length > 1) {
            route.curveAt(clamped, this.curve);
            out.x = this.curve.px;
            out.z = this.curve.pz;
            out.heading = this.curve.heading;
        } else {
            out.x = this.sampled.x;
            out.z = this.sampled.z;
            out.heading = this.sampled.heading;
        }
        out.y = y;
        return out;
    }

    // The wanted hairpin pull at s, 0 to 1
    pullAt(s) {
        const t = WorldCamera.TUNING;
        const from = Math.max(0, s - t.pullBehindM);
        const turn = Math.abs(this.turn(from, from + t.pullSpanM));
        return Math.max(0, Math.min(1, (turn - t.pullFrom) / (t.pullTo - t.pullFrom)));
    }

    // 0 to 1: how much of a hairpin lies ahead of s
    bendShare(s) {
        const t = WorldCamera.TUNING;
        const turn = Math.abs(this.turn(Math.max(0, s - 5), s + t.bendSpanM - 5));
        return Math.max(0, Math.min(1, (turn - t.bendFrom) / (t.bendTo - t.bendFrom)));
    }

    // The point the camera looks at: {x, y, z} on the smooth route ahead, `lift` metres above it
    lookTarget(s, speed, lift, out = {}) {
        const t = WorldCamera.TUNING;
        const usual = t.lookBaseM + t.lookPerMs * speed;
        this.centre(s + usual + (Math.max(usual, t.lookBendM) - usual) * this.bendShare(s), out);
        out.y += lift;
        return out;
    }

    // Land height under (x, z), searched near route sample `index`
    landY(x, z, index) {
        const reach = WorldCamera.TUNING.hintUnits;
        this.hint.start = Math.max(0, index - reach);
        this.hint.end = index + reach;
        return this.ground.groundY(x, z, this.hint, false, this.land);
    }

    // The share of the boom from `head` to `want` (both {x, y, z}) that stays `clear` metres over the land: the boom
    // is tested at marchPoints points and the first hit narrowed down by halving. The hard limit: it jumps where the
    // land first rises into the middle of the boom.
    clearShare(head, want, index, clear) {
        const t = WorldCamera.TUNING;
        const blocked = share => {
            const x = head.x + (want.x - head.x) * share;
            const z = head.z + (want.z - head.z) * share;
            const y = head.y + (want.y - head.y) * share;
            return this.landY(x, z, index) + clear > y;
        };
        let low = 0, high = 1;
        for (let i = 1; i <= t.marchPoints; i++) {
            if (blocked(i / t.marchPoints)) {
                high = i / t.marchPoints;
                break;
            }
            low = i / t.marchPoints;
        }
        if (low === 1) return 1;
        for (let i = 0; i < t.marchRefine; i++) {
            const mid = (low + high) / 2;
            if (blocked(mid)) high = mid; else low = mid;
        }
        return low;
    }

    // The share of the boom the camera eases toward: each of softPoints points along it allows the whole boom while
    // the land is more than clearM + softBandM x its share under it, and no further than itself once the land is
    // within clearM, eased between; the least of them. Each point's allowance moves smoothly with the land, so the share does too.
    softShare(head, want, index) {
        const t = WorldCamera.TUNING;
        let share = 1;
        for (let i = 1; i <= t.softPoints; i++) {
            const at = i / t.softPoints;
            const x = head.x + (want.x - head.x) * at;
            const z = head.z + (want.z - head.z) * at;
            const y = head.y + (want.y - head.y) * at;
            const room = Math.max(0, Math.min(1, (y - this.landY(x, z, index) - t.clearM) / (t.softBandM * at)));
            share = Math.min(share, at + (1 - at) * room * room * (3 - 2 * room));
        }
        return share;
    }

    // The least y at or over `floor` that eases to `y` once y is floorBandM over it: a smooth max, so the camera
    // rises over a crest without a kink
    static softFloor(y, floor) {
        const band = WorldCamera.TUNING.floorBandM;
        const over = (y - floor) / band;
        return over > 20 ? y : floor + band * Math.log1p(Math.exp(over));
    }

    // One frame of the chase camera. `bike`: {x, y, z} the bike's position, s its smooth road position, index its
    // route sample, speed (m/s), offset {x, y, z} the view mode's chase offset (behind is -z), fov the mode's wanted
    // FOV. Fills and returns this.position; this.fov is the FOV to draw with. Call aim() after it for the look target.
    update(bike, dt) {
        const t = WorldCamera.TUNING;
        const sp = this.springs;
        const step = Math.max(1e-4, Math.min(0.1, dt));
        const fresh = this.fresh;
        this.fresh = false;
        this.index = bike.index;
        const s = bike.s;

        // The hairpin pull
        const pullWant = this.pullAt(s);
        if (fresh) WorldCamera.settle(sp.pull, pullWant);
        else WorldCamera.spring(sp.pull, pullWant, pullWant > sp.pull.x ? t.pullIn : t.pullOut, step);
        this.pull = Math.max(0, Math.min(1, sp.pull.x));

        // The boom yaw: the route heading behind the bike, unwrapped onto the spring's own turn
        const heading = this.centre(s - t.followBehindM, this.behind).heading;
        const yawWant = sp.yaw.t + WorldCamera.wrap(heading - sp.yaw.t);
        if (fresh) WorldCamera.settle(sp.yaw, heading);
        else WorldCamera.spring(sp.yaw, yawWant, t.yawRate + (t.yawRateBend - t.yawRate) * this.pull, step, true, t.maxYawRate);
        this.yaw = sp.yaw.x;

        // The boom's length and height
        const distanceWant = -bike.offset.z * (1 + t.pullBack * this.pull);
        const heightWant = bike.offset.y + t.raiseM * this.pull;
        const fovWant = bike.fov;
        if (fresh) {
            WorldCamera.settle(sp.distance, distanceWant);
            WorldCamera.settle(sp.height, heightWant);
            WorldCamera.settle(sp.fov, fovWant);
            WorldCamera.settle(sp.ax, bike.x);
            WorldCamera.settle(sp.ay, bike.y);
            WorldCamera.settle(sp.az, bike.z);
        } else {
            WorldCamera.spring(sp.distance, distanceWant, t.boomRate, step);
            WorldCamera.spring(sp.height, heightWant, t.boomRate, step);
            WorldCamera.spring(sp.fov, fovWant, t.fovRate, step);
            WorldCamera.spring(sp.ax, bike.x, t.anchorRate, step, true, t.maxSpeedMs);
            WorldCamera.spring(sp.ay, bike.y, t.anchorRate, step, true, t.maxSpeedMs);
            WorldCamera.spring(sp.az, bike.z, t.anchorRate, step, true, t.maxSpeedMs);
        }
        this.fov = sp.fov.x;
        const anchor = this.anchor;
        anchor.x = sp.ax.x;
        anchor.y = sp.ay.x;
        anchor.z = sp.az.x;

        // Where the boom would put the camera, and where it will be foreseeS on
        const boom = (yaw, from, out) => {
            const sin = Math.sin(yaw), cos = Math.cos(yaw);
            const ox = bike.offset.x, oz = -sp.distance.x;
            out.x = from.x + ox * cos + oz * sin;
            out.y = from.y + sp.height.x;
            out.z = from.z - ox * sin + oz * cos;
            return out;
        };
        const want = boom(this.yaw, anchor, this.want);
        const head = this.head;
        head.x = anchor.x;
        head.y = anchor.y + t.headM;
        head.z = anchor.z;
        const later = this.later;
        later.x = anchor.x + sp.ax.v * t.foreseeS;
        later.y = anchor.y + sp.ay.v * t.foreseeS;
        later.z = anchor.z + sp.az.v * t.foreseeS;
        const laterWant = boom(this.yaw + sp.yaw.v * t.foreseeS, later, this.aheadWant);
        later.y += t.headM;

        // The land in the way: a spring toward the share clear of it now and foreseeS on, and never closer to it than hardClearM
        const hard = this.clearShare(head, want, bike.index, t.hardClearM);
        const soft = Math.min(this.softShare(head, want, bike.index), this.softShare(later, laterWant, bike.index));
        if (fresh) WorldCamera.settle(sp.fraction, soft);
        else WorldCamera.spring(sp.fraction, soft, soft < sp.fraction.x ? t.fractionIn : t.fractionOut, step);
        if (sp.fraction.x > hard) {
            sp.fraction.x = hard;
            sp.fraction.v = Math.min(0, sp.fraction.v);
        }
        sp.fraction.x = Math.max(0, Math.min(1, sp.fraction.x));
        this.fraction = sp.fraction.x;

        const out = this.position;
        out.x = head.x + (want.x - head.x) * this.fraction;
        out.y = head.y + (want.y - head.y) * this.fraction;
        out.z = head.z + (want.z - head.z) * this.fraction;
        out.y = WorldCamera.softFloor(out.y, this.landY(out.x, out.z, bike.index) + t.floorM);

        // The look target's offset from the anchor, toward the road ahead
        const ahead = this.lookTarget(s, bike.speed, bike.lift, this.ahead);
        const lx = ahead.x - anchor.x, ly = ahead.y - anchor.y, lz = ahead.z - anchor.z;
        if (fresh) {
            WorldCamera.settle(sp.lx, lx);
            WorldCamera.settle(sp.ly, ly);
            WorldCamera.settle(sp.lz, lz);
            WorldCamera.settle(sp.keep, 0);
        } else {
            WorldCamera.spring(sp.lx, lx, t.lookRate, step, true, t.maxSpeedMs);
            WorldCamera.spring(sp.ly, ly, t.lookRate, step, true, t.maxSpeedMs);
            WorldCamera.spring(sp.lz, lz, t.lookRate, step, true, t.maxSpeedMs);
        }
        this.step = step;
        return out;
    }

    // The look target for a camera at `camera` (a THREE camera: position, up, fov, aspect, near, far, placed where it
    // will draw from): the road ahead, given way toward `bike` ({x, y, z}) so the bike stays within keepIn of the
    // screen's middle. The give-way is a spring, held to keepHard at the most. `probe` is a scratch THREE camera.
    // Fills and returns this.look.
    aim(camera, bike, probe) {
        const t = WorldCamera.TUNING;
        const sp = this.springs;
        const look = this.look;
        look.x = this.anchor.x + sp.lx.x;
        look.y = this.anchor.y + sp.ly.x;
        look.z = this.anchor.z + sp.lz.x;
        const want = this.giveWay(camera, look, bike, probe, t.keepIn);
        WorldCamera.spring(sp.keep, want, t.keepRate, this.step || 1 / 60);
        let share = Math.max(0, Math.min(1, sp.keep.x));
        this.held = false;
        if (share < want) {
            const least = this.giveWay(camera, look, bike, probe, t.keepHard);
            if (share < least) {
                share = least;
                sp.keep.x = least;
                sp.keep.v = Math.max(0, sp.keep.v);
                this.held = true;
            }
        }
        look.x += (bike.x - look.x) * share;
        look.y += (bike.y - look.y) * share;
        look.z += (bike.z - look.z) * share;
        this.keep = share;
        return look;
    }

    // The least share of the way from `look` to `bike` that a camera at `camera` must look to see the bike within
    // `keep` of the screen's middle (1 is the edge): 0 when it already does, found by halving
    giveWay(camera, look, bike, probe, keep) {
        const at = this.ndc || (this.ndc = new probe.position.constructor());
        probe.position.copy(camera.position);
        probe.up.copy(camera.up);
        probe.fov = camera.fov;
        probe.aspect = camera.aspect;
        probe.near = camera.near;
        probe.far = camera.far;
        probe.updateProjectionMatrix();
        const seen = share => {
            probe.lookAt(look.x + (bike.x - look.x) * share, look.y + (bike.y - look.y) * share, look.z + (bike.z - look.z) * share);
            probe.updateMatrixWorld(true);
            at.set(bike.x, bike.y, bike.z).project(probe);
            return at.z > -1 && at.z < 1 && Math.max(Math.abs(at.x), Math.abs(at.y)) <= keep;
        };
        if (seen(0)) return 0;
        // The bike itself is in the middle at a share of 1
        let low = 0, high = 1;
        for (let i = 0; i < 12; i++) {
            const mid = (low + high) / 2;
            if (seen(mid)) high = mid; else low = mid;
        }
        return high;
    }
}
