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
//   - under a road that passes overhead (a bridge, a viaduct, another leg on its deck) the boom comes down and the
//     camera goes through under the deck with the bike, never over it
//   - the legs' carving swing: the camera moves sideways with the lean and its look point leads into the corner,
//     both lagged, in the boom's frame (not the bike's yaw); the land scales the sideways shift down (swingShare)
//   - a wall beside the road (a retaining wall and its parapet, a wall's taper, a bridge's parapet, a house) ends the
//     boom short of its face, and the swing gives way to it, so the camera never goes through one or sits behind it
//   - through an S the camera does not swing with each bend: the boom turns by the road's mean heading over a span
//     that grows with speed (roadMean), the swing takes only the share of the turn the S does not cancel, and the
//     look follows the road's turn through a spring of its own (tests/unit/world-camera-chicane.test.js)
//   - in a tunnel or gallery the boom comes down under the roof as under a bridge (Game passes the tube's roof as a
//     road overhead: WorldEnvironment.tubeRoofY), and the tube's walls are faces
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
            // Free roam off the ride: the boom follows the rider's way at followRate (followRider)
            followRate: 3,
            pullBehindM: 15, pullSpanM: 75, pullFrom: 0.5, pullTo: 1.8, pullIn: 4, pullOut: 2,
            // At full pull the boom is pullBack longer and raiseM higher; its length and height move at boomRate
            pullBack: 0.5, raiseM: 3, boomRate: 5,
            // The boom yaw follows the route heading followBehindM behind the bike, at yawRate, yawRateBend at full pull.
            // That heading is the road's mean over a span centred there (roadMean): yawSpanS seconds of riding,
            // yawSpanMinM to yawSpanMaxM metres, and down to yawSpanBendM at full pull: in one hairpin the boom keeps to
            // the road beside the bike, along its walls (a pair of hairpins one each way, and an S, turn little in all
            // and pull little)
            followBehindM: 4, yawRate: 6, yawRateBend: 10, yawSpanS: 3, yawSpanMinM: 80, yawSpanMaxM: 120, yawSpanBendM: 30,
            // The carving swing takes the share of the road's turn over that span that a turn the other way does not
            // cancel (roadMean straight): a whole swing on one bend, little through an S. A road that turns less than
            // straightFrom rad over the span keeps the whole swing, eased in to straightTo
            straightFrom: 0.2, straightTo: 0.5,
            // The point the boom hangs from follows the bike at anchorRate (it takes the bike's own judder out)
            anchorRate: 14,
            // Look target: lookBaseM + lookPerMs x speed metres ahead on the route, out to lookBendM on a hairpin by how
            // far the road turns over the next bendSpanM (nothing under bendFrom rad, all of it from bendTo rad). Its
            // offset from the bike moves at lookRate as the bike moves across the road, and at lookTurnRate as the road
            // turns, without the target's own rate carried: carried, the look ran round each bend of an S and of a pair
            // of hairpins as fast as the point on the road did, and the view swung after it
            lookBaseM: 8, lookPerMs: 0.6, lookBendM: 30, bendSpanM: 50, bendFrom: 0.35, bendTo: 1.0, lookRate: 4, lookTurnRate: 2.5,
            // The look target gives way to the bike until the bike is within keepIn of the screen's middle (1 is the
            // edge), at keepRate; never further out than keepHard. That hold eases in over keepBlend of the share: as a
            // plain limit it caught a spring lagging a quickly growing give-way in one frame, and the view's turn
            // changed rate there
            keepIn: 0.55, keepHard: 0.75, keepRate: 16, keepBlend: 0.1,
            // The boom's height comes down by speedLowerShare of itself between speedLowerFromMs and speedLowerMs
            // (WorldCamera.speedHeight)
            speedLowerShare: 0.5, speedLowerFromMs: 22, speedLowerMs: 45,
            // FOV moves at fovRate
            fovRate: 3,
            // The boom starts headM over the bike and stays clearM over the land; it is shortened at fractionIn and
            // grows back at fractionOut, and never comes within hardClearM of the land. The land is also tested where
            // the boom will be foreseeS seconds on, so the boom starts to shorten before the land reaches it (0.3 s
            // before the boom turned by the road's mean heading: in a hairpin that boom meets the walls a little later,
            // and at 0.3 s the hard limit caught it in a frame)
            headM: 1.2, clearM: 0.6, hardClearM: 0.2, fractionIn: 10, fractionOut: 2.5, foreseeS: 0.5,
            // The camera stays floorM over the land, eased in over floorBandM
            floorM: 1.0, floorBandM: 0.4,
            // Under a road overhead the boom stays roofClearM under its deck, as high as it can be there, and roofFastM
            // lower again at speed (from roofFastFrom to roofFastTo m/s: a fast pass has more room), and the camera
            // never comes within roofHardM of it. The road is read roofAheadS of riding ahead (roofAheadMinM at the
            // least) at roofPoints points, and the boom's height comes down at roofIn, which settles in about that
            // time, and goes back up at roofOut: both slow, so the height changes over the approach and after
            // The boom's height meets that limit over roofBlendM (WorldCamera.softCeiling): taken as the lesser of the
            // two, the camera's climb stopped in one frame where the rising boom met a falling limit
            roofClearM: 0.35, roofFastM: 0.7, roofFastFrom: 10, roofFastTo: 28, roofHardM: 0.15, roofIn: 1.8, roofOut: 1.2, roofPoints: 12, roofAheadS: 2.6, roofAheadMinM: 30, roofBlendM: 0.5,
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
            maxSpeedMs: 80, maxYawRate: 8, followRate: 8,
            // The sideways swing is cut to the largest of swingSteps whose boom the land shortens no more than
            // swingSlack below the boom with no swing, and that brings the road aheadM on no nearer the side of the view
            // than the boom with no swing does (or than roadKeep, 1 being the side); that share moves at fractionIn down
            // and swingOut up
            swingSteps: [1, 0.5, 0.25, 0], swingSlack: 0.01, swingOut: 1.5, aheadM: 30, roadKeep: 0.8
        }));
    }

    // The camera and the walls beside the road (wallShare), every number of the rule. A face is a wall's side as the
    // road's builders and the physics have it (WorldEnvironment.cameraFaces): a line in plan with a top and a foot.
    static get WALLS() {
        return WorldCamera.walls || (WorldCamera.walls = Object.freeze({
            // The boom ends clearM short of a face it closes on (the view's near plane reaches 0.46 m from the camera
            // at its corners), eased; never nearer than hardM. With the bike itself nearer a face than that, the boom
            // keeps nearShare of the bike's own distance
            clearM: 0.8, hardM: 0.5, nearShare: 0.5,
            // A boom passes over a face it clears by overM (hardOverM at the least); from overBandM more than that
            // down to it the face draws the boom in, eased
            overM: 0.4, hardOverM: 0.2, overBandM: 0.6,
            // From outside, a wall with a road on it is not passed over at any height once that road is roadTo over
            // the bike's (it is a road overhead from there, WorldEnvironment.OVERHEAD_FROM_M: the camera stays under
            // it, so past the wall it would be in the hill), eased in from roadFrom
            roadFrom: 1.5, roadTo: 2.5, roadUpM: 60,
            // A boom that passes a face's end is drawn in from endBandM past it (or endBandShare of the boom's length, the
            // more: a long boom's end sweeps past a face's end as much faster), eased, and held from hardM past it
            endBandM: 3, endBandShare: 0.15,
            // A house is taken to stand houseM over the land under it
            houseM: 12,
            // The faces are listed within two booms of the bike and reachM more (in whole steps of reachM), and again
            // when it has moved stepM
            reachM: 12, stepM: 4
        }));
    }

    // The boom's height at a speed (m/s) for a view mode whose height is `base`: its own up to speedLowerFromMs, then
    // down by speedLowerShare of itself by speedLowerMs, eased at both ends. A high-speed thing: at the pace of the
    // bends the view is the mode's own, and on a fast straight the ride is seen from nearer the road (the first rule
    // was all the way down at 20 m/s, so the camera sat low in every bend). The height spring smooths the change
    static speedHeight(base, speed) {
        const t = WorldCamera.TUNING;
        const f = Math.max(0, Math.min(1, (speed - t.speedLowerFromMs) / (t.speedLowerMs - t.speedLowerFromMs)));
        return base * (1 - t.speedLowerShare * f * f * (3 - 2 * f));
    }

    // The values the tests and Game read by name
    static get FLOOR_M() { return WorldCamera.TUNING.floorM; }
    // Share of the way the onboard view's look target moves to the wanted one each frame at 60 Hz
    static get LOOK_FOLLOW() { return 0.6; }

    // `overhead(x, z, y)`: the underside of the lowest road over (x, z) well above y, Infinity with open sky
    // (WorldEnvironment.overheadY); with none given the camera knows no bridge.
    // `faces(x, z, reach)`: the wall faces within `reach` of (x, z), {data, count} with FACE numbers a face
    // (WorldEnvironment.cameraFaces); with none given the camera knows no wall
    constructor(route, ground, overhead = null, faces = null) {
        this.route = route;
        this.ground = ground;
        this.overhead = overhead;
        this.faces = faces;
        this.walls = null;
        this.land = {};
        this.hint = { start: 0, end: 0 };
        this.curve = {};
        this.sampled = {};
        this.springs = {};
        for (const name of ['pull', 'yaw', 'distance', 'height', 'ax', 'ay', 'az', 'lx', 'ly', 'lz', 'tx', 'tz', 'fraction', 'keep', 'fov', 'swingShare', 'roof']) this.springs[name] = { x: 0, v: 0, t: 0, rate: null };
        this.position = { x: 0, y: 0, z: 0 };
        this.anchor = { x: 0, y: 0, z: 0 };
        this.lookOffset = { x: 0, y: 0, z: 0 };
        this.look = { x: 0, y: 0, z: 0 };
        this.head = { x: 0, y: 0, z: 0 };
        this.want = { x: 0, y: 0, z: 0 };
        this.ahead = { x: 0, y: 0, z: 0 };
        this.behind = { x: 0, y: 0, z: 0 };
        this.later = { x: 0, y: 0, z: 0 };
        this.aheadWant = { x: 0, y: 0, z: 0 };
        this.bare = { x: 0, y: 0, z: 0 };
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
        this.swing = 0;
        this.lookSwing = 0;
        this.swingShare = 1;
    }

    // The share of the way a legs-style per-frame lerp of `factor` (tuned at 60 Hz) moves in `dt`
    static lerpShare(factor, dt) {
        return 1 - Math.pow(1 - Math.max(0, Math.min(1, factor)), dt * 60);
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

    // The route's smooth signed curvature at s (none on the rider's own line in free roam: followRider)
    curvature(s) {
        if (this.followAt) return 0;
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

    // The point and heading of the smooth centreline at s: {x, y, z, heading}. In free roam (followRider) the line is
    // the rider's own: straight through the bike along the way it goes, so the boom and the look follow the rider on
    // any road, not the ride
    centre(s, out) {
        const f = this.followAt;
        if (f) {
            const d = s - f.s;
            out.x = f.x + Math.sin(f.heading) * d;
            out.z = f.z + Math.cos(f.heading) * d;
            out.y = f.y;
            out.heading = f.heading;
            return out;
        }
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

    // The road over `span` metres centred on s, each point weighed by a raised cosine (none at the span's ends, so
    // everything here moves smoothly with s). Fills and returns `out`: {heading} the road's mean heading, unwrapped near
    // `near`, and {straight} the share of its turn that is not cancelled by a turn the other way (1 on a single bend or
    // a straight, near 0 through an S of two equal bends). A bend each way inside the span cancels out of the heading;
    // one bend's whole turn still comes through, over the span
    roadMean(s, span, near, out) {
        const t = WorldCamera.TUNING;
        const n = Math.max(2, Math.round(span / t.turnStepM));
        const d = span / n;
        const from = s - span / 2;
        const start = this.centre(from, this.spanAt || (this.spanAt = {})).heading;
        let heading = near + WorldCamera.wrap(start - near);
        let last = this.curvature(from);
        let sum = 0, weights = 0, net = 0, total = 0;
        for (let i = 1; i < n; i++) {
            const next = this.curvature(from + i * d);
            const turn = (last + next) / 2 * d;
            heading += turn;
            last = next;
            const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / n);
            sum += w * heading;
            weights += w;
            net += w * turn;
            total += w * Math.abs(turn);
        }
        out.heading = sum / weights;
        // (a road that hardly turns is a straight: the share eases from 1 over straightFrom to straightTo of turn; the
        // weights are a half on the mean, so twice the weighed sum is the turn)
        const f = Math.max(0, Math.min(1, (2 * total - t.straightFrom) / (t.straightTo - t.straightFrom)));
        const ease = f * f * (3 - 2 * f);
        out.straight = 1 - ease * (1 - Math.abs(net) / Math.max(total, 1e-9));
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
        const ground = this.ground;
        const y = ground.groundY(x, z, this.hint, false, this.land);
        // The ground beside the ride's band is a side road's surface where one lies there, on its bridge over the
        // ride too: a deck roadTo or more over both the ride and the land under it is a road overhead (the roof
        // rule's), not land in the boom's way. Read as land, a strip of it beside the band cut the boom short under
        // every such bridge, in one frame
        const over = WorldCamera.WALLS.roadTo;
        if (y - this.land.roadY > over && typeof ground.sideRoadY === 'function' && ground.sideRoadY(x, z) === y) {
            const under = ground.landY(x, z, this.land.roadY);
            if (y - under > over) return under;
        }
        return y;
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

    // The numbers of a wall face: its two ends in plan (ax, az, bx, bz: the wall faces out to the right of a to b),
    // its top and its foot at each (topA, topB, footA, footB), and 1 when a road stands on it
    static get FACE() { return 9; }

    // The share of the boom from `head` to `end` that keeps clear of every wall face listed (this.walls). A boom
    // that closes on a face's plane, would come within the margin of it between the face's ends, and is not over its
    // top there, ends the margin short of the plane. `soft` is the share the camera eases toward: the wider margin,
    // and a face the boom nearly clears (over its top, or past its end) draws it in by a share, so the allowance
    // moves smoothly as the boom sweeps onto a wall. Without it, the limit behind the spring. `roadY` is the bike's road
    wallShare(head, end, roadY, soft) {
        const walls = this.walls;
        if (!walls || !walls.count) return 1;
        const w = WorldCamera.WALLS, d = walls.data, n = walls.count * WorldCamera.FACE;
        const dx = end.x - head.x, dy = end.y - head.y, dz = end.z - head.z;
        const clear = soft ? w.clearM : w.hardM;
        const band = Math.max(w.endBandM, w.endBandShare * Math.hypot(dx, dy, dz));
        let share = 1;
        for (let i = 0; i < n; i += WorldCamera.FACE) {
            const ex = d[i + 2] - d[i], ez = d[i + 3] - d[i + 1];
            const length = Math.hypot(ex, ez);
            if (length < 1e-6) continue;
            const px = head.x - d[i], pz = head.z - d[i + 1];
            // Metres out from the face's plane at the head, and gained along the whole boom
            const out = (px * ez - pz * ex) / length, gain = (dx * ez - dz * ex) / length;
            if (out * gain >= 0) continue;
            const gap = Math.abs(out), rate = Math.abs(gain);
            if (gap - clear >= rate) continue;
            const hit = Math.max(0, gap - Math.min(clear, gap * w.nearShare)) / rate;
            if (hit >= share) continue;
            // Where the boom meets the plane (or ends, short of it): how far along the face, and how high
            const at = Math.min(1, gap / rate);
            const along = (px * ex + pz * ez + (dx * ex + dz * ez) * at) / length;
            const past = Math.max(0, -along, along - length);
            if (past >= w.hardM + (soft ? band : 0)) continue;
            const u = Math.max(0, Math.min(1, along / length));
            const y = head.y + dy * at;
            if (y <= d[i + 6] + (d[i + 7] - d[i + 6]) * u) continue;
            const top = d[i + 4] + (d[i + 5] - d[i + 4]) * u;
            // (a wall with a road on it, met from outside: not passed over once that road is a road overhead)
            let up = 0;
            if (d[i + 8] && out > 0) {
                const f = Math.max(0, Math.min(1, (top - roadY - w.roadFrom) / (w.roadTo - w.roadFrom)));
                up = w.roadUpM * f * f * (3 - 2 * f);
            }
            const over = y - top - up;
            if (!soft) {
                if (over < w.hardOverM) share = hit;
                continue;
            }
            const low = Math.max(0, Math.min(1, (w.overM + w.overBandM - over) / w.overBandM));
            const inside = Math.max(0, Math.min(1, 1 - (past - w.hardM) / band));
            const weight = low * low * (3 - 2 * low) * inside * inside * (3 - 2 * inside);
            share = Math.min(share, 1 - weight * (1 - hit));
        }
        return share;
    }

    // The share of a boom the camera eases toward: clear of the land (softShare) and of the walls (wallShare)
    softReach(head, end, index, roadY) {
        return Math.min(this.softShare(head, end, index), this.wallShare(head, end, roadY, true));
    }

    // The most the boom's end may stand over `anchorY` to pass roofClearM under every road over the boom from `head`
    // to `end` (this.overhead), the bike's own place included: the boom comes down as soon as the deck is over the
    // bike, a boom's length before it reaches the camera. WorldCamera.OPEN_M with nothing overhead
    roofHeight(head, end, anchorY, roadY) {
        const t = WorldCamera.TUNING;
        let most = WorldCamera.OPEN_M;
        if (!this.overhead) return most;
        for (let i = 0; i <= t.roofPoints; i++) {
            const at = i / t.roofPoints;
            const under = this.overhead(head.x + (end.x - head.x) * at, head.z + (end.z - head.z) * at, roadY);
            if (under !== Infinity) most = Math.min(most, under - (this.roofClear ?? t.roofClearM) - anchorY);
        }
        return most;
    }

    // The boom's height with open sky, as the roof spring reads it (well over any boom)
    static get OPEN_M() { return 40; }

    // The lesser of `y` and `ceiling`, rounded over roofBlendM where they meet: never over either, and its rate has
    // no step as y passes the ceiling (a polynomial smooth minimum, at most roofBlendM / 4 under the lesser)
    static softCeiling(y, ceiling) {
        const band = WorldCamera.TUNING.roofBlendM;
        const h = Math.max(0, band - Math.abs(y - ceiling)) / band;
        return Math.min(y, ceiling) - h * h * band / 4;
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
    // FOV. `swing` (optional) is the legs' carving swing: {x, look} the sideways shift of the camera and of the look
    // point (m, +x of the boom), and {follow, lookFollow} the per-frame lerps (at 60 Hz) they trail by; aspect the
    // view's (for the road-ahead test of the swing, 16:9 when not given). Fills and
    // returns this.position; this.fov is the FOV to draw with. Call aim() after it for the look target.
    update(bike, dt) {
        const t = WorldCamera.TUNING;
        const sp = this.springs;
        const step = Math.max(1e-4, Math.min(0.1, dt));
        const fresh = this.fresh;
        this.fresh = false;
        this.index = bike.index;
        const s = bike.s;
        // Free roam off the ride: the line the camera reads is the rider's own (centre), through the bike along its way.
        // The way is the bike's travel, eased by followRate, so a wobble does not swing the boom. On the ride (bike.onRide)
        // free roam reads the ride as the time trial does, so the two have one chase camera: the rider's straight line
        // ran into the roads above a bend, the roof rule took them for decks overhead, and the boom sat at its head's
        // height (1.3 m over the bike in place of 3 m in the standard view, 8 m in the high)
        if (this.followRider && !bike.onRide) {
            const f = this.followAt || (this.followAt = { heading: bike.yaw || 0 });
            const want = Number.isFinite(bike.yaw) ? bike.yaw : f.heading;
            f.heading = fresh ? want : f.heading + WorldCamera.wrap(want - f.heading) * Math.min(1, step * WorldCamera.TUNING.followRate);
            f.x = bike.x;
            f.y = bike.y;
            f.z = bike.z;
            f.s = s;
        } else this.followAt = null;

        // The hairpin pull
        const pullWant = this.pullAt(s);
        if (fresh) WorldCamera.settle(sp.pull, pullWant);
        else WorldCamera.spring(sp.pull, pullWant, pullWant > sp.pull.x ? t.pullIn : t.pullOut, step);
        this.pull = Math.max(0, Math.min(1, sp.pull.x));

        // The boom yaw: the road's mean heading behind the bike, over a span that grows with speed, unwrapped onto the
        // spring's own turn. A short S inside the span cancels out, so the boom does not swing with each of its bends
        const wide = Math.max(t.yawSpanMinM, Math.min(t.yawSpanMaxM, bike.speed * t.yawSpanS));
        const span = wide + (Math.min(wide, t.yawSpanBendM) - wide) * this.pull;
        const near = fresh ? this.centre(s - t.followBehindM, this.behind).heading : sp.yaw.t;
        const mean = this.roadMean(s - t.followBehindM, span, near, this.mean || (this.mean = {}));
        const heading = mean.heading;
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

        // The carving swing, trailing as the legs' camera does: the camera's sideways place (the bike's offset across
        // the road plus the shift) and the look point's lead into the corner, each a per-frame lerp of the legs' own
        // factor. Across the road, not across the anchor, so the hairpin's own turn adds no trail.
        const swing = bike.swing;
        const road = this.centre(s, this.road || (this.road = {}));
        const across = (anchor.x - road.x) * Math.cos(road.heading) - (anchor.z - road.z) * Math.sin(road.heading);
        // (through an S the swing each way cancels, as the road's bends do: roadMean straight)
        const swingWant = swing ? swing.x * mean.straight : 0, lookSwingWant = swing ? swing.look * mean.straight : 0;
        if (fresh || !swing) {
            this.trail = across + swingWant;
            this.lookSwing = lookSwingWant;
        } else {
            this.trail += (across + swingWant - this.trail) * WorldCamera.lerpShare(swing.follow, step);
            this.lookSwing += (lookSwingWant - this.lookSwing) * WorldCamera.lerpShare(swing.lookFollow, step);
        }
        this.swing = this.trail - across;

        // Where the boom would put the camera, `shift` metres to its side, and where it will be foreseeS on
        const boom = (yaw, from, shift, out) => {
            const sin = Math.sin(yaw), cos = Math.cos(yaw);
            const ox = bike.offset.x + shift, oz = -sp.distance.x;
            out.x = from.x + ox * cos + oz * sin;
            // (under a road overhead no higher than the roof allows: this.roof)
            out.y = from.y + (this.roof === undefined ? sp.height.x : WorldCamera.softCeiling(sp.height.x, this.roof));
            out.z = from.z - ox * sin + oz * cos;
            return out;
        };
        const head = this.head;
        head.x = anchor.x;
        head.y = anchor.y + t.headM;
        head.z = anchor.z;

        // The walls beside the road here: listed again only when the bike has moved on (the faces' owner sees to it)
        // (the reach in whole steps, so a boom that grows a little asks for no new list)
        const reachStep = WorldCamera.WALLS.reachM;
        this.walls = this.faces ? this.faces(anchor.x, anchor.z, reachStep * Math.ceil(1 + 2 * sp.distance.x / reachStep)) : null;

        // The look target's offset from the anchor, toward the road ahead, in two parts: from the bike to the road's
        // centre at the bike (lx, lz: the bike's weave across the road, carried at lookRate as before) and from there
        // to the road ahead (tx, tz: the road's own turn, at lookTurnRate and not carried, so the look does not run
        // round each bend of an S as fast as the road does)
        const ahead = this.lookTarget(s, bike.speed, bike.lift, this.ahead);
        const lx = road.x - anchor.x, ly = ahead.y - anchor.y, lz = road.z - anchor.z;
        const tx = ahead.x - road.x, tz = ahead.z - road.z;
        if (fresh) {
            WorldCamera.settle(sp.lx, lx);
            WorldCamera.settle(sp.ly, ly);
            WorldCamera.settle(sp.lz, lz);
            WorldCamera.settle(sp.tx, tx);
            WorldCamera.settle(sp.tz, tz);
            WorldCamera.settle(sp.keep, 0);
        } else {
            WorldCamera.spring(sp.lx, lx, t.lookRate, step, true, t.maxSpeedMs);
            WorldCamera.spring(sp.ly, ly, t.lookRate, step, true, t.maxSpeedMs);
            WorldCamera.spring(sp.lz, lz, t.lookRate, step, true, t.maxSpeedMs);
            WorldCamera.spring(sp.tx, tx, t.lookTurnRate, step);
            WorldCamera.spring(sp.tz, tz, t.lookTurnRate, step);
        }
        const offset = this.lookOffset;
        offset.x = sp.lx.x + sp.tx.x;
        offset.y = sp.ly.x;
        offset.z = sp.lz.x + sp.tz.x;

        // The swing gives way to the land, the walls, a road overhead and the road ahead: the largest step of it whose
        // boom the land and the walls shorten no more than the boom with no swing, that no deck brings lower, and from whose end the road aheadM on is no nearer the side of the view
        // than from the boom with no swing (or within roadKeep of the middle), eased. The boom tests below then hold
        // the camera clear of the land whatever the swing is, and aim() keeps the bike in view.
        let shareWant = 1;
        if (Math.abs(this.swing) > 1e-3) {
            // Where aim() will look: the road ahead, given way toward the bike as much as on the last frame
            const look = this.lookFrom || (this.lookFrom = {});
            const keep = fresh ? 0 : this.keep || 0;
            look.x = anchor.x + (offset.x + this.lookSwing * Math.cos(this.yaw)) * (1 - keep);
            look.z = anchor.z + (offset.z - this.lookSwing * Math.sin(this.yaw)) * (1 - keep);
            const far = this.centre(s + t.aheadM, this.roadAhead || (this.roadAhead = {}));
            const half = Math.tan(sp.fov.x * Math.PI / 360) * (bike.aspect || 16 / 9);
            const reach = fresh ? 1 : sp.fraction.x;
            // How far across the view the road ahead is, seen from the boom's end (1 is the side; behind is Infinity)
            const across = end => {
                const x = head.x + (end.x - head.x) * reach, z = head.z + (end.z - head.z) * reach;
                const ax = look.x - x, az = look.z - z, bx = far.x - x, bz = far.z - z;
                const angle = Math.atan2(ax * bz - az * bx, ax * bx + az * bz);
                return Math.abs(angle) >= Math.PI / 2 ? Infinity : Math.abs(Math.tan(angle)) / half;
            };
            const bareEnd = boom(this.yaw, anchor, 0, this.bare);
            const bare = this.softReach(head, bareEnd, bike.index, bike.y) - t.swingSlack;
            const seen = Math.max(t.roadKeep, across(bareEnd));
            // (and that a road overhead brings no lower than the boom with no swing: the roof's spring reads the road
            // ahead, not a deck beside it, and a swing that carried the boom's end under one put the camera down
            // under it at the hard limit, 14 m in one frame)
            const roofed = this.overhead ? Math.min(sp.height.x, this.roofHeight(head, bareEnd, anchor.y, bike.y)) - t.swingSlack : -Infinity;
            shareWant = 0;
            for (const part of t.swingSteps) {
                if (!part) break;
                const end = boom(this.yaw, anchor, this.swing * part, this.want);
                if (across(end) <= seen && this.softReach(head, end, bike.index, bike.y) >= bare && (!this.overhead || this.roofHeight(head, end, anchor.y, bike.y) >= roofed)) {
                    shareWant = part;
                    break;
                }
            }
        }
        if (fresh) WorldCamera.settle(sp.swingShare, shareWant);
        else WorldCamera.spring(sp.swingShare, shareWant, shareWant < sp.swingShare.x ? t.fractionIn : t.swingOut, step);
        this.swingShare = Math.max(0, Math.min(1, sp.swingShare.x));
        const shift = this.swing * this.swingShare;

        // A road overhead: the boom's height comes down to pass under its deck. The road is read roofAheadS of riding
        // ahead, so the camera starts down long before the deck and takes that whole time over it: a slow change of
        // height on the approach, not a drop at the bridge. The land tests below still hold it clear of the ground
        if (this.overhead) {
            this.roof = undefined;
            const open = boom(this.yaw, anchor, shift, this.want);
            // The room kept under a deck: more at speed
            const fast = Math.max(0, Math.min(1, (bike.speed - t.roofFastFrom) / (t.roofFastTo - t.roofFastFrom)));
            const clear = this.roofClear = t.roofClearM + t.roofFastM * fast * fast * (3 - 2 * fast);
            let roofWant = Math.min(sp.height.x + t.roofBlendM, this.roofHeight(head, open, anchor.y, bike.y));
            const reach = Math.max(t.roofAheadMinM, bike.speed * t.roofAheadS);
            const at = this.roofAt || (this.roofAt = {});
            // (off the ride in free roam the road ahead is not known: the roof is read over the boom alone)
            for (let k = 1; k <= (this.followAt ? 0 : t.roofPoints); k++) {
                const p = this.centre(s + reach * k / t.roofPoints, at);
                const under = this.overhead(p.x, p.z, p.y);
                if (under === Infinity) continue;
                // The height is over the bike, and the bike is a boom's length up the road when the camera is under
                // this deck: on a climb that is higher than the road under the deck
                const then = this.centre(s + reach * k / t.roofPoints + sp.distance.x, this.roofThen || (this.roofThen = {})).y;
                roofWant = Math.min(roofWant, under - clear - Math.max(p.y, then));
            }
            // (with open sky the limit rests roofBlendM over the boom's own height, where softCeiling leaves it whole,
            // so it comes back up at roofOut and not at once)
            if (fresh) WorldCamera.settle(sp.roof, roofWant);
            else WorldCamera.spring(sp.roof, roofWant, roofWant < sp.roof.x ? t.roofIn : t.roofOut, step);
            // (never under the head's own height: the boom goes level at the lowest)
            this.roof = Math.max(t.headM, sp.roof.x);
        }
        const want = boom(this.yaw, anchor, shift, this.want);
        const later = this.later;
        later.x = anchor.x + sp.ax.v * t.foreseeS;
        later.y = anchor.y + sp.ay.v * t.foreseeS;
        later.z = anchor.z + sp.az.v * t.foreseeS;
        const laterWant = boom(this.yaw + sp.yaw.v * t.foreseeS, later, shift, this.aheadWant);
        later.y += t.headM;

        // The land and the walls in the way: a spring toward the share clear of them now and foreseeS on, and never
        // closer to the land than hardClearM, or to a wall than its own hard margin
        const hard = Math.min(this.clearShare(head, want, bike.index, t.hardClearM), this.wallShare(head, want, bike.y, false));
        const soft = Math.min(this.softReach(head, want, bike.index, bike.y), this.softReach(later, laterWant, bike.index, bike.y));
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
        // The hard limit under a deck: the spring may fall short when a bridge comes at speed
        if (this.overhead) {
            const under = this.overhead(out.x, out.z, bike.y);
            if (out.y > under - t.roofHardM) out.y = Math.max(under - t.roofHardM, Math.min(out.y, head.y));
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
        // The look point's lead into the corner is to the boom's side; the give-way below still keeps the bike in view
        look.x = this.anchor.x + this.lookOffset.x + this.lookSwing * Math.cos(this.yaw);
        look.y = this.anchor.y + this.lookOffset.y;
        look.z = this.anchor.z + this.lookOffset.z - this.lookSwing * Math.sin(this.yaw);
        const want = this.giveWay(camera, look, bike, probe, t.keepIn);
        WorldCamera.spring(sp.keep, want, t.keepRate, this.step || 1 / 60);
        let share = Math.max(0, Math.min(1, sp.keep.x));
        this.held = false;
        // (want is 0 only with the bike within keepIn, and so within keepHard, at no give-way: nothing to hold)
        if (want > 0) {
            const least = this.giveWay(camera, look, bike, probe, t.keepHard);
            // The hold eases in over keepBlend (no wider than the hold itself, so a hold of nothing lifts nothing). It
            // lifts the share drawn and leaves the spring alone: a spring put at the hold and stopped there set off
            // again at a step of rate when the hold let go
            const band = Math.min(t.keepBlend, least);
            const h = band > 0 ? Math.max(0, band - Math.abs(share - least)) / band : 0;
            const held = Math.max(share, least) + h * h * band / 4;
            if (held > share) {
                share = Math.min(1, held);
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
