// The drone: a hidden find in a world ride. A stopping place with `egg: 'drone'` (WorldPlaces.HAND) answers a bike
// that stands still in it with a small hint, once a ride; then KEY takes a small quadcopter out. The rider gets off and
// stands by the bike with a controller, and the drone lifts off its pad beside the bike. The ride goes on under it: a
// timed ride's clock keeps running, and a ride the drone flew in keeps no time.
//
//   Drone          the flight: arcade quadcopter physics, no THREE. Altitude hold on the throttle stick, tilt to move,
//                  self-levelling, a speed cap, gravity when the motors stop; it crashes on the land, a wall, a house
//                  or a tree (`world.hit`), returns home past the range or low on battery, and lands where it is when
//                  the battery is flat.
//   Drone.camera   the two views: line of sight (from the pilot's head, looking at the drone) and the onboard view (on
//                  the drone, a little tilted down, the horizon held level as a gimbal holds it), eased from one to the
//                  other over BLEND_S, so a flip never jumps.
//   DroneModel     the quadcopter drawn: a body, four arms and motors, two-bladed props that spin, landing legs, a
//                  camera under the nose and an LED that blinks. No maker's name, no logo.
//   DroneSession   what Game runs while the drone is out: the rider's pose, the bar (a dialog of js/modals.js, so the
//                  ride's keys do not fire under it), the OSD, the reticle, the stream round the drone.
class Drone {
    static get KEY() { return 'KeyK'; }
    static get VIEW_KEY() { return 'KeyV'; }

    static get FLIGHT() {
        return Object.freeze({
            // Tilt: the most, and the rate the attitude eases to the sticks (and back to level when let go)
            tiltRad: 0.42, tiltRate: 7, yawRad: 2.0,
            // Altitude hold: the throttle stick asks a climb or a sink, eased at vRate
            climbMs: 4.5, sinkMs: 3, vRate: 3,
            // Horizontal: the drag (1/s) and the cap; gravity
            dragPerS: 0.45, capMs: 16, g: 9.81,
            // The pilot's range: the signal fades from weakShare of it, and past it the drone comes home
            rangeM: 300, weakShare: 0.75,
            // The battery: seconds of hover, what tilt and climb add to its draw, the share at which it comes home
            batteryS: 180, drawTilt: 0.6, drawClimb: 0.08, homeShare: 0.12,
            // Coming home: climb to homeClimbM over the pad (and clearM over the land on the way), fly at homeMs,
            // come down at landMs; a landing sink. A touch-down faster than crashMs down or hardMs across is a crash
            homeClimbM: 15, clearM: 8, homeMs: 9, landMs: 1.4, crashMs: 3.2, hardMs: 3,
            // The drone's own size for the land and the walls, and the legs' height under its middle
            radiusM: 0.28, legM: 0.12,
            // After a crash it lies still this long before a relaunch puts it back on its pad
            restS: 1.2,
            stepS: 1 / 120
        });
    }

    // The keys, by what they do (mode 2: the throttle and the yaw on the left, the tilt on the right)
    static get BINDINGS() {
        return Object.freeze({
            up: ['KeyW'], down: ['KeyS'], yawLeft: ['KeyA'], yawRight: ['KeyD'],
            forward: ['ArrowUp', 'KeyI'], back: ['ArrowDown'], left: ['ArrowLeft', 'KeyJ'], right: ['ArrowRight', 'KeyL']
        });
    }

    static reads(code) {
        return Object.values(Drone.BINDINGS).some(codes => codes.includes(code));
    }

    // The sticks a set of held keys asks for: {throttle, yaw, pitch, roll}, each -1 to 1 (pitch 1 tilts forward,
    // roll 1 to the right, yaw 1 to the left)
    static controlsOf(held) {
        const B = Drone.BINDINGS;
        const on = name => B[name].some(code => held[code]);
        const axis = (plus, minus) => (on(plus) ? 1 : 0) - (on(minus) ? 1 : 0);
        return { throttle: axis('up', 'down'), yaw: axis('yawLeft', 'yawRight'), pitch: axis('forward', 'back'), roll: axis('right', 'left') };
    }

    // A standard gamepad adds its sticks (mode 2): the left stick the throttle and the yaw, the right the tilt
    static addPad(controls, pad) {
        if (!pad || !pad.connected || !pad.axes || pad.axes.length < 4) return controls;
        const dead = v => (Math.abs(v) < 0.15 ? 0 : v);
        const clamp = v => Math.max(-1, Math.min(1, v));
        controls.throttle = clamp(controls.throttle - dead(pad.axes[1]));
        controls.yaw = clamp(controls.yaw - dead(pad.axes[0]));
        controls.roll = clamp(controls.roll + dead(pad.axes[2]));
        controls.pitch = clamp(controls.pitch - dead(pad.axes[3]));
        return controls;
    }

    // Where the drone's pad and its pilot are beside a bike at (x, z) heading `heading`: the pilot stands
    // StopScene.STAND_SIDE_M to its left, the pad padAheadM ahead of the bike and padSideM to its left. `ground(x, z)`
    // gives each its height. {home, pilot}
    static get PAD() { return Object.freeze({ sideM: 0.75, padAheadM: 2.4, padSideM: 1.4 }); }
    static padBeside(x, z, heading, ground) {
        const P = Drone.PAD, fx = Math.sin(heading), fz = Math.cos(heading), lx = Math.cos(heading), lz = -Math.sin(heading);
        const at = (a, l) => { const px = x + fx * a + lx * l, pz = z + fz * a + lz * l, y = ground(px, pz); return { x: px, y: Number.isFinite(y) ? y : 0, z: pz }; };
        return { home: { ...at(P.padAheadM, P.padSideM), heading }, pilot: at(0, P.sideM) };
    }

    // `home` {x, y, z, heading}: the pad (y its ground); `pilot` {x, y, z}: where the rider stands (y the ground);
    // `world` {ground(x, z): the drawn ground's height or NaN, hit(a, b, radius): what the move from a to b runs into
    // (a label) or null}
    constructor(home, pilot, world) {
        this.home = { ...home };
        this.pilot = { ...pilot };
        this.world = world;
        this.battery = 1;
        this.lowWarned = false;
        this.flights = 0;
        this.crashes = 0;
        this.cause = null;
        this.reason = null;
        this.propAngle = 0;
        this.spin = 0;
        this.clock = 0;
        this.toPad();
    }

    // On its pad, motors still
    toPad() {
        const h = this.home;
        this.x = h.x; this.z = h.z; this.y = h.y + Drone.FLIGHT.legM;
        this.yaw = h.heading;
        this.pitch = 0; this.roll = 0;
        this.vx = 0; this.vy = 0; this.vz = 0;
        this.state = 'landed';
        this.rest = 0;
        this.reason = null;
    }

    get flying() { return this.state === 'flying' || this.state === 'home' || this.state === 'landing'; }
    get motors() { return this.flying || (this.state === 'landed' && this.spin > 0.01); }

    // The pilot's distance in plan, and the signal (1 full, 0 lost)
    distance() { return Math.hypot(this.x - this.pilot.x, this.z - this.pilot.z); }
    signal() {
        const F = Drone.FLIGHT, d = this.distance();
        return Math.max(0, Math.min(1, (F.rangeM - d) / (F.rangeM * (1 - F.weakShare))));
    }

    // The height over the ground under it (legs included) and the ground
    floor(x = this.x, z = this.z) {
        const y = this.world.ground(x, z);
        return Number.isFinite(y) ? y : -Infinity;
    }

    // Bring it home now (the key, the bar, a flat battery's warning, the range): it climbs, flies back and lands on
    // its pad
    callHome(reason = 'asked') {
        if (this.state === 'crashed' || this.state === 'done') return false;
        if (this.state === 'landed' && this.atHome()) { this.state = 'done'; return true; }
        this.state = 'home';
        this.reason = reason;
        return true;
    }

    atHome() { return Math.hypot(this.x - this.home.x, this.z - this.home.z) < 1; }

    // `dt` seconds of flight with the sticks `controls` (as controlsOf gives)
    step(dt, controls) {
        const F = Drone.FLIGHT;
        let left = Math.min(dt, 0.25);
        while (left > 1e-9) {
            const h = Math.min(F.stepS, left);
            this.tick(h, controls);
            left -= h;
        }
    }

    tick(dt, c) {
        const F = Drone.FLIGHT;
        this.clock += dt;
        // The props: up to speed with the motors on, down when they stop
        const want = this.flying ? 1 : 0;
        this.spin += (want - this.spin) * Math.min(1, dt * 4);
        this.propAngle = (this.propAngle + this.spin * 160 * dt) % (Math.PI * 2);

        if (this.state === 'done') return;
        if (this.state === 'crashed') {
            // Down under gravity to the ground, then still
            this.vy -= F.g * dt;
            this.vx *= Math.exp(-1.5 * dt); this.vz *= Math.exp(-1.5 * dt);
            this.move(dt, false);
            const floor = this.floor() + F.legM * 0.6;
            if (this.y <= floor) { this.y = floor; this.vx = this.vz = this.vy = 0; this.rest += dt; }
            return;
        }
        if (this.state === 'landed') {
            // A throttle up lifts it off where it stands (its pad, or where a flat battery put it down: not with none)
            if (c.throttle > 0.3 && this.battery > 0) { this.state = 'flying'; this.flights++; this.vy = 0.5; }
            else return;
        }

        // The battery: hover, plus tilt and climb
        const tilt = Math.hypot(this.pitch, this.roll);
        this.battery = Math.max(0, this.battery - dt / F.batteryS * (1 + F.drawTilt * tilt / F.tiltRad + F.drawClimb * Math.max(0, this.vy)));
        if (this.battery <= 0 && this.state !== 'landing') { this.state = 'landing'; this.reason = 'battery'; }
        else if (this.battery <= F.homeShare && this.state === 'flying' && !this.lowWarned) { this.lowWarned = true; this.callHome('battery'); }
        if (this.state === 'flying' && this.distance() > F.rangeM) this.callHome('signal');

        // What the drone is asked: a tilt (pitch forward, roll right), a yaw rate and a climb
        let pitch = c.pitch * F.tiltRad, roll = c.roll * F.tiltRad, yawRate = c.yaw * F.yawRad, climb = c.throttle > 0 ? c.throttle * F.climbMs : c.throttle * F.sinkMs;
        if (this.state === 'home') {
            const dx = this.home.x - this.x, dz = this.home.z - this.z, d = Math.hypot(dx, dz);
            const high = Math.max(this.home.y + F.homeClimbM, this.aheadFloor(dx, dz, d) + F.clearM);
            // Turn to face home, then fly there once high enough; over the pad, come down
            const face = Math.atan2(dx, dz);
            yawRate = Math.max(-F.yawRad, Math.min(F.yawRad, Drone.wrap(face - this.yaw) * 2));
            if (d < 1.2) {
                ({ pitch, roll } = this.brake(0.8));
                climb = -this.sink();
            } else if (this.y < high - 1) {
                ({ pitch, roll } = this.brake(0.8));
                climb = F.climbMs;
            } else {
                // Tilt toward home for a speed that falls away near it
                const speed = Math.min(F.homeMs, d * 0.6);
                const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), rx = -Math.cos(this.yaw), rz = Math.sin(this.yaw);
                const ax = dx / d * speed - this.vx, az = dz / d * speed - this.vz;
                pitch = Math.max(-F.tiltRad, Math.min(F.tiltRad, Math.atan((ax * fx + az * fz) * 0.8 / F.g)));
                roll = Math.max(-F.tiltRad, Math.min(F.tiltRad, Math.atan((ax * rx + az * rz) * 0.8 / F.g)));
                climb = Math.max(-F.sinkMs, Math.min(F.climbMs, (high - this.y) * 0.8));
            }
        } else if (this.state === 'landing') {
            ({ pitch, roll } = this.brake(0.6));
            climb = -this.sink();
            yawRate = 0;
        }

        // The attitude eases to what is asked (back to level when let go); the yaw turns at its rate
        const k = 1 - Math.exp(-F.tiltRate * dt);
        this.pitch += (pitch - this.pitch) * k;
        this.roll += (roll - this.roll) * k;
        this.yaw = Drone.wrap(this.yaw + yawRate * dt);
        this.vy += (climb - this.vy) * (1 - Math.exp(-F.vRate * dt));

        // The tilt pushes it along the ground; the air holds it back; a cap
        const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), rx = -Math.cos(this.yaw), rz = Math.sin(this.yaw);
        const along = F.g * Math.tan(this.pitch), across = F.g * Math.tan(this.roll);
        this.vx += (fx * along + rx * across - F.dragPerS * this.vx) * dt;
        this.vz += (fz * along + rz * across - F.dragPerS * this.vz) * dt;
        const speed = Math.hypot(this.vx, this.vz);
        if (speed > F.capMs) { this.vx *= F.capMs / speed; this.vz *= F.capMs / speed; }
        if (!this.move(dt, true)) return;

        // The ground: a soft touch-down lands it, a hard one crashes it
        const ground = this.floor() + F.legM;
        if (this.y <= ground) {
            const down = -this.vy, across = Math.hypot(this.vx, this.vz);
            if (down > F.crashMs || across > F.hardMs) {
                this.crash('the ground');
                this.y = ground;
                return;
            }
            this.y = ground;
            if (this.vy <= 0.05) {
                this.vx = this.vz = this.vy = 0;
                this.pitch = this.roll = 0;
                const home = this.state === 'home' && this.atHome();
                this.state = home ? 'done' : 'landed';
            }
        }
    }

    // How fast it comes down to land: sinkMs high up, landMs over the last few metres
    sink() {
        const F = Drone.FLIGHT;
        return Math.max(F.landMs, Math.min(F.sinkMs, (this.y - this.floor()) * 0.4));
    }

    // A tilt against the drone's own way: it slows to a stop
    brake(gain) {
        const F = Drone.FLIGHT;
        const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), rx = -Math.cos(this.yaw), rz = Math.sin(this.yaw);
        const clamp = v => Math.max(-F.tiltRad, Math.min(F.tiltRad, v));
        return { pitch: clamp(Math.atan(-(this.vx * fx + this.vz * fz) * gain / F.g)), roll: clamp(Math.atan(-(this.vx * rx + this.vz * rz) * gain / F.g)) };
    }

    // The highest ground on the way home, read every 10 m of the first 80
    aheadFloor(dx, dz, d) {
        let most = this.floor();
        for (let a = 10; a <= Math.min(80, d); a += 10) most = Math.max(most, this.floor(this.x + dx / d * a, this.z + dz / d * a));
        return most;
    }

    // Moves by the velocity; a move into a wall, a house or a tree crashes it (false). `check` the obstacles
    move(dt, check) {
        const a = { x: this.x, y: this.y, z: this.z };
        const b = { x: this.x + this.vx * dt, y: this.y + this.vy * dt, z: this.z + this.vz * dt };
        if (check && this.world.hit) {
            const label = this.world.hit(a, b, Drone.FLIGHT.radiusM);
            if (label) {
                this.crash(label);
                // It drops from where it struck, a little back from the face
                this.vx *= -0.2; this.vz *= -0.2; this.vy = Math.min(0, this.vy);
                return false;
            }
        }
        this.x = b.x; this.y = b.y; this.z = b.z;
        return true;
    }

    crash(cause) {
        this.state = 'crashed';
        this.cause = cause;
        this.crashes++;
        this.rest = 0;
    }

    // After a crash and its rest: back on its pad, ready to lift (the pilot walked to it)
    relaunch() {
        if (this.state !== 'crashed' || this.rest < Drone.FLIGHT.restS) return false;
        this.toPad();
        return true;
    }

    static wrap(a) { return a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI)); }

    // The two views. 'sight': from the pilot's head (eyeM over the ground) looking at the drone; 'fpv': the onboard
    // camera, forwardM ahead of the body's middle, held level (no roll) and tilted down by fpvTiltRad whatever the body
    // does. Each: {x, y, z, tx, ty, tz, fov} (the eye, a point it looks at, the vertical field of view in degrees)
    static get VIEW() {
        return Object.freeze({ eyeM: 1.62, fpvTiltRad: 0.14, forwardM: 0.12, belowM: 0.04, sightFov: 50, fpvFov: 78, blendS: 0.6 });
    }

    static view(mode, drone, out = {}) {
        const V = Drone.VIEW;
        if (mode === 'fpv') {
            const fx = Math.sin(drone.yaw), fz = Math.cos(drone.yaw);
            out.x = drone.x + fx * V.forwardM; out.y = drone.y - V.belowM; out.z = drone.z + fz * V.forwardM;
            const c = Math.cos(V.fpvTiltRad);
            out.tx = out.x + fx * c * 10; out.ty = out.y - Math.sin(V.fpvTiltRad) * 10; out.tz = out.z + fz * c * 10;
            out.fov = V.fpvFov;
        } else {
            out.x = drone.pilot.x; out.y = drone.pilot.y + V.eyeM; out.z = drone.pilot.z;
            // (a drone on its pad, at the pilot's feet, is looked at from the head: never straight down)
            out.tx = drone.x; out.ty = drone.y; out.tz = drone.z;
            out.fov = V.sightFov;
        }
        return out;
    }

    // The view eased from `from` (a view) to `to` over BLEND_S: share t (0 to 1) of the way, smoothstepped
    static blend(from, to, t, out = {}) {
        const k = t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
        for (const key of ['x', 'y', 'z', 'tx', 'ty', 'tz', 'fov']) out[key] = from[key] + (to[key] - from[key]) * k;
        return out;
    }

    // The OSD's numbers: the height over the pad, the distance from the pilot, the battery and the signal in per
    // cent, the speed, and what it is doing
    osd() {
        const words = { landed: 'Landed', flying: 'Flying', home: 'Return home', landing: 'Landing', crashed: 'Crashed', done: 'Home' };
        return {
            height: this.y - Drone.FLIGHT.legM - this.home.y,
            distance: this.distance(),
            battery: Math.round(this.battery * 100),
            signal: Math.round(this.signal() * 100),
            speed: Math.hypot(this.vx, this.vy, this.vz),
            state: words[this.state] || this.state,
            reason: this.reason
        };
    }
}

// The camera of the drone: one of the two views, eased over BLEND_S from wherever it was when it last changed (the
// chase camera as the drone goes out, the other view at a flip, the view in force as it comes home). `step` gives the
// view for this frame
class DroneCamera {
    constructor(mode = 'sight', from = null) {
        this.mode = mode;
        this.from = from;
        this.t = from ? 0 : 1;
        this.now = {};
    }

    // Starts easing from `from` (a view) to the mode's own
    ease(from) {
        this.from = { ...from };
        this.t = 0;
    }

    flip() {
        this.ease(this.now);
        this.mode = this.mode === 'fpv' ? 'sight' : 'fpv';
        return this.mode;
    }

    // `ground(x, z)`: the eased eye is kept clearM over it, so a flip between a far drone and the pilot does not cut
    // through a hill between them
    step(dt, drone, ground = null) {
        const to = Drone.view(this.mode, drone, this.to || (this.to = {}));
        if (this.from && this.t < 1) {
            this.t = Math.min(1, this.t + dt / Drone.VIEW.blendS);
            Drone.blend(this.from, to, this.t, this.now);
        } else Object.assign(this.now, to);
        // (and the onboard camera of a drone down on a slope is kept over the slope in front of it)
        const floor = ground ? ground(this.now.x, this.now.z) : NaN;
        if (Number.isFinite(floor)) this.now.y = Math.max(this.now.y, floor + (this.t < 1 ? DroneCamera.CLEAR_M : DroneCamera.LOW_M));
        return this.now;
    }

    static get CLEAR_M() { return 0.6; }
    static get LOW_M() { return 0.05; }
}

// What a drone's move runs into in a world: the faces the chase camera keeps clear of (WorldEnvironment.cameraFaces:
// the retaining walls and parapets, the viaducts, the houses, the tunnels' walls) and the trees (Scenery's tree sites:
// a trunk and a crown as one upright cylinder). A label, or null
class DroneWorld {
    static hit(env, a, b, radius) {
        const faces = env.cameraFaces ? env.cameraFaces(b.x, b.z, 40) : null;
        if (faces && faces.count) {
            const d = faces.data, N = WorldCamera.FACE;
            for (let i = 0; i < faces.count * N; i += N) {
                const ex = d[i + 2] - d[i], ez = d[i + 3] - d[i + 1], length = Math.hypot(ex, ez);
                if (length < 1e-6) continue;
                // Out from the face's line at each end of the move; the face is hit where the move comes within
                // `radius` of it between its ends and between its foot and its top there
                const outA = ((a.x - d[i]) * ez - (a.z - d[i + 1]) * ex) / length;
                const outB = ((b.x - d[i]) * ez - (b.z - d[i + 1]) * ex) / length;
                if (Math.abs(outB) > radius && Math.sign(outA) === Math.sign(outB)) continue;
                const along = ((b.x - d[i]) * ex + (b.z - d[i + 1]) * ez) / (length * length);
                if (along < 0 || along > 1) continue;
                const top = d[i + 4] + (d[i + 5] - d[i + 4]) * along, foot = d[i + 6] + (d[i + 7] - d[i + 6]) * along;
                if (b.y - radius < top && b.y + radius > foot) return 'a wall';
            }
        }
        for (const t of DroneWorld.trees(env, b)) {
            const r = Math.max(0.6, (t.width || 3) * 0.35);
            if (Math.abs(t.x - b.x) > r + radius || Math.abs(t.z - b.z) > r + radius) continue;
            const tall = Math.max(5, (t.width || 3) * 2.6);
            if (Math.hypot(t.x - b.x, t.z - b.z) < r + radius && b.y < t.y + tall && b.y > t.y - 1) return 'a tree';
        }
        return null;
    }

    // The tree sites within TREE_M of `at`, read again once it has moved TREE_STEP_M (a flight steps 120 times a
    // second, and the tiles round it hold thousands of sites)
    static get TREE_M() { return 60; }
    static get TREE_STEP_M() { return 20; }
    static trees(env, at) {
        const scenery = env.scenery;
        if (!scenery || !scenery.perTile) return [];
        const held = env.droneTrees || (env.droneTrees = { x: Infinity, z: Infinity, list: [], tiles: null });
        if (held.tiles === scenery.perTile.size && Math.hypot(at.x - held.x, at.z - held.z) < DroneWorld.TREE_STEP_M) return held.list;
        held.x = at.x; held.z = at.z; held.tiles = scenery.perTile.size;
        held.list = [];
        const reach = DroneWorld.TREE_M + DroneWorld.TREE_STEP_M;
        for (const tile of scenery.perTile.values()) {
            if (!tile.treeSites) continue;
            for (const t of tile.treeSites) if (Math.abs(t.x - at.x) < reach && Math.abs(t.z - at.z) < reach) held.list.push(t);
        }
        return held.list;
    }
}

// The quadcopter drawn, about 0.35 m across: a few hundred triangles in one group. `update(drone)` places it and
// spins its props; the LED blinks green while it flies and red when it is down or low
class DroneModel {
    constructor() {
        const g = this.group = new THREE.Group();
        g.name = 'drone';
        const dark = new THREE.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.55, metalness: 0.2 });
        const grey = new THREE.MeshStandardMaterial({ color: 0x5a5e62, roughness: 0.5, metalness: 0.4 });
        const prop = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.7, transparent: true, opacity: 0.9 });
        const lens = new THREE.MeshStandardMaterial({ color: 0x0b0d12, roughness: 0.15, metalness: 0.6 });
        this.led = new THREE.MeshBasicMaterial({ color: 0x40ff60 });
        const add = (geometry, material, x, y, z, ry = 0) => {
            const m = new THREE.Mesh(geometry, material);
            m.position.set(x, y, z);
            m.rotation.y = ry;
            m.castShadow = true;
            g.add(m);
            return m;
        };
        // The body: a low box with a rounded top shell, the battery behind
        add(new THREE.BoxGeometry(0.11, 0.045, 0.2), dark, 0, 0, 0);
        add(new THREE.CylinderGeometry(0.05, 0.06, 0.03, 8), grey, 0, 0.035, 0.01);
        add(new THREE.BoxGeometry(0.08, 0.035, 0.09), grey, 0, -0.035, -0.04);
        // The arms out to the four motors, each motor a short drum with its prop on top
        this.props = [];
        const reach = 0.15;
        for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
            const x = sx * reach * 0.72, z = sz * reach * 0.72;
            const arm = add(new THREE.BoxGeometry(0.022, 0.016, reach), dark, x / 2, 0.005, z / 2, Math.atan2(sx, sz));
            arm.castShadow = false;
            add(new THREE.CylinderGeometry(0.018, 0.02, 0.03, 8), grey, x, 0.02, z);
            const blade = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.003, 0.016), prop);
            blade.position.set(x, 0.04, z);
            blade.userData.dir = sx * sz;
            g.add(blade);
            this.props.push(blade);
            // The landing legs under the front and back arms
            add(new THREE.BoxGeometry(0.008, 0.07, 0.008), grey, x * 0.8, -0.045, z * 0.8);
        }
        // The camera under the nose, and the LED at the back
        add(new THREE.SphereGeometry(0.018, 8, 6), lens, 0, -0.02, 0.105);
        add(new THREE.SphereGeometry(0.008, 6, 4), this.led, 0, 0.01, -0.105);
        // (Drone.FLIGHT.legM: the legs' feet are this far under the middle)
        g.scale.setScalar(1.15);
    }

    update(drone, time) {
        const g = this.group;
        g.position.set(drone.x, drone.y, drone.z);
        // (yaw about up, then pitch nose down, then roll; the model's nose is +z)
        g.rotation.set(drone.pitch, drone.yaw, -drone.roll, 'YXZ');
        for (const blade of this.props) blade.rotation.y = drone.propAngle * blade.userData.dir;
        const low = drone.battery < Drone.FLIGHT.homeShare || drone.state === 'crashed';
        const on = Math.floor(time * (low ? 4 : 1.5)) % 2 === 0;
        this.led.color.setHex(on ? (low ? 0xff3020 : 0x40ff60) : 0x101010);
    }

    get triangles() {
        let n = 0;
        this.group.traverse(o => { if (o.isMesh) n += o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3; });
        return n;
    }

    dispose() {
        this.group.traverse(o => { if (o.isMesh) { o.geometry.dispose(); } });
        if (this.group.parent) this.group.parent.remove(this.group);
    }
}

// The spot that hides the drone: a bike standing in an open place with `egg: 'drone'` for STAND_S. `watch` answers
// the place once a ride (then the hint shows); a find is kept in this browser
class DroneSpot {
    static get STAND_S() { return 1.0; }
    static get KEY() { return 'twistyDroneFound'; }

    constructor(places) {
        this.places = places ? places.list.filter(p => p.egg === 'drone') : [];
        this.still = 0;
        this.hinted = false;
    }

    // The place the bike at (s, lateral) going `speed` stands in after dt, or null
    watch(s, lateral, speed, dt) {
        if (!this.places.length) return null;
        const place = this.places.find(p => p.side === Math.sign(lateral) && s >= p.s && s <= p.s + p.length && Math.abs(lateral) > 5);
        this.still = place && Math.abs(speed) < 0.3 ? this.still + dt : 0;
        return this.still >= DroneSpot.STAND_S ? place : null;
    }
}

// What Game runs while the drone is out (Game.openDrone, Game.stepDrone, Game.closeDrone). The ride goes on: the bike
// stands (Game zeroes its input and holds its brake), the clock runs, and the world streams round the drone. The rider
// stands beside the bike with the controller (StopScene.stand). The bar is a dialog of js/modals.js: no key of the
// ride fires under it; V flips the view, K (or Escape) brings the drone home, and the touch pad's buttons hold the
// sticks. Coming home ends the session; a crashed drone relaunches on a throttle up once it lies still
class DroneSession {
    constructor(game, place) {
        const v = game.vehicle, env = game.environment, cam = game.camera;
        this.game = game;
        this.env = env;
        this.place = place;
        this.ground = (x, z) => env.ground.groundY(x, z, null);
        const { home, pilot } = Drone.padBeside(v.position.x, v.position.z, v.yawAngle, this.ground);
        this.drone = new Drone(home, pilot, { ground: this.ground, hit: (a, b, r) => DroneWorld.hit(env, a, b, r) });
        this.model = new DroneModel();
        game.scene.add(this.model.group);
        this.model.update(this.drone, 0);
        const ahead = new THREE.Vector3(0, 0, -10).applyQuaternion(cam.quaternion).add(cam.position);
        this.saved = { fov: cam.fov };
        this.cam = new DroneCamera('sight', { x: cam.position.x, y: cam.position.y, z: cam.position.z, tx: ahead.x, ty: ahead.y, tz: ahead.z, fov: cam.fov });
        this.streamAt = new THREE.Vector3(home.x, home.y, home.z);
        this.near = null;
        this.time = 0;
        this.held = {};
        this.osdAt = -Infinity;
        // The rider off the bike, standing, with the controller held in front at the waist
        this.rider = { bike: v, player: true };
        this.rider.stood = typeof StopScene !== 'undefined' && StopScene.stand(this.rider, (x, z) => env.ground.groundY(x, z, null));
        this.controller = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.11), new THREE.MeshStandardMaterial({ color: 0x1e2022, roughness: 0.6 }));
        const fx = Math.sin(v.yawAngle), fz = Math.cos(v.yawAngle), lx = Math.cos(v.yawAngle), lz = -Math.sin(v.yawAngle);
        this.controller.position.set(pilot.x + fx * 0.28 + lx * 0.05, pilot.y + 1.08, pilot.z + fz * 0.28 + lz * 0.05);
        this.controller.rotation.set(-0.5, v.yawAngle, 0, 'YXZ');
        game.scene.add(this.controller);
        this.buildDom();
    }

    buildDom() {
        const doc = document, off = this.off = [];
        const on = (target, type, handler, options) => { target.addEventListener(type, handler, options); off.push(() => target.removeEventListener(type, handler, options)); };
        on(window, 'keyup', (event) => { delete this.held[event.code]; }, true);
        on(window, 'blur', () => { for (const code of Object.keys(this.held)) delete this.held[code]; });
        const bar = this.bar = doc.createElement('div');
        bar.id = 'drone-bar';
        bar.className = 'drone-bar panel';
        bar.setAttribute('aria-label', 'Drone');
        bar.tabIndex = -1;
        const help = doc.createElement('p');
        help.className = 'drone-help';
        help.textContent = 'W/S up and down · A/D turn · arrows fly · V view · K home';
        const buttons = doc.createElement('div');
        buttons.className = 'drone-buttons';
        for (const [name, key, text] of [['view', Drone.VIEW_KEY, 'View (V)'], ['home', Drone.KEY, 'Home (K)']]) {
            const button = doc.createElement('button');
            button.type = 'button';
            button.className = name === 'home' ? 'btn btn-primary' : 'btn';
            button.dataset.drone = name;
            button.dataset.key = key;
            button.textContent = text;
            button.addEventListener('click', (event) => { event.stopPropagation(); name === 'view' ? this.flip() : this.home(); });
            buttons.appendChild(button);
        }
        // The touch sticks: each button holds a key while pressed
        const pad = doc.createElement('div');
        pad.className = 'drone-pad';
        for (const [code, text] of [['KeyW', '▲'], ['KeyS', '▼'], ['KeyA', '⟲'], ['KeyD', '⟳'], ['ArrowUp', '↑'], ['ArrowDown', '↓'], ['ArrowLeft', '←'], ['ArrowRight', '→']]) {
            const button = doc.createElement('button');
            button.type = 'button';
            button.className = 'btn drone-stick';
            button.textContent = text;
            button.setAttribute('aria-label', code);
            const down = (event) => { event.preventDefault(); this.held[code] = true; };
            const up = () => { delete this.held[code]; };
            button.addEventListener('pointerdown', down);
            for (const type of ['pointerup', 'pointercancel', 'pointerleave']) button.addEventListener(type, up);
            pad.appendChild(button);
        }
        bar.append(help, buttons, pad);
        // The OSD and the reticle over the picture
        const osd = this.osd = doc.createElement('div');
        osd.className = 'drone-osd';
        const reticle = this.reticle = doc.createElement('div');
        reticle.className = 'drone-reticle';
        doc.body.append(osd, reticle);
        doc.body.classList.add('drone-out');
        Modals.open(bar, {
            cancel: () => this.home(),
            focus: bar,
            onKey: (event) => {
                if (!Drone.reads(event.code)) return false;
                this.held[event.code] = true;
                return true;
            }
        });
    }

    flip() { return this.cam.flip(); }

    // K: home and land (or, down already, put away)
    home() {
        const d = this.drone;
        if (d.state === 'crashed' || (d.state === 'landed' && (d.atHome() || d.battery <= 0))) d.state = 'done';
        else d.callHome('asked');
    }

    // One frame: the flight, the camera, the model, the OSD and the reticle. False once the drone is home
    frame(dt) {
        const d = this.drone, game = this.game;
        this.time += dt;
        const controls = Drone.controlsOf(this.held);
        const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
        const pad = pads ? [...pads].find(p => p && p.connected) : null;
        if (pad) Drone.addPad(controls, pad);
        if (d.state === 'crashed' && controls.throttle > 0.3) d.relaunch();
        d.step(dt, controls);
        const view = this.cam.step(dt, d, this.ground);
        const cam = game.camera;
        cam.position.set(view.x, view.y, view.z);
        cam.up.set(0, 1, 0);
        cam.lookAt(view.tx, view.ty, view.tz);
        if (Math.abs(cam.fov - view.fov) > 1e-3) { cam.fov = view.fov; cam.updateProjectionMatrix(); }
        cam.updateMatrixWorld();
        this.model.update(d, this.time);
        this.streamAt.set(d.x, d.y, d.z);
        this.near = this.env.route.project(d.x, d.z, this.near, this.near || {});
        this.showOsd(view);
        return d.state !== 'done';
    }

    streamS() {
        return this.near && this.near.index >= 0 ? this.near.s : this.place.s;
    }

    showOsd() {
        const d = this.drone, now = this.time;
        // The reticle round a drone seen from the ground: on it in view, at the edge toward it out of view
        if (this.cam.mode === 'sight') {
            const at = new THREE.Vector3(d.x, d.y, d.z).project(this.game.camera);
            const behind = at.z > 1;
            let sx = at.x, sy = at.y;
            if (behind) { sx = -sx; sy = -sy; }
            const edge = behind || Math.abs(sx) > 0.95 || Math.abs(sy) > 0.95;
            if (edge) { const m = Math.max(Math.abs(sx), Math.abs(sy)) || 1; sx = sx / m * 0.92; sy = sy / m * 0.92; }
            this.reticle.style.display = 'block';
            this.reticle.style.left = `${(sx + 1) * 50}%`;
            this.reticle.style.top = `${(1 - sy) * 50}%`;
            this.reticle.classList.toggle('drone-reticle-edge', edge);
        } else this.reticle.style.display = 'none';
        if (now - this.osdAt < 0.1) return;
        this.osdAt = now;
        const o = d.osd();
        const parts = [`H ${o.height.toFixed(1)} m`, `D ${Math.round(o.distance)} m`, `BAT ${o.battery}%`, `SIG ${o.signal}%`, `${(o.speed * 3.6).toFixed(0)} km/h`, this.cam.mode === 'fpv' ? 'FPV' : 'LOS'];
        let note = o.state;
        if (d.state === 'home') note = o.reason === 'signal' ? 'Signal lost: return home' : o.reason === 'battery' ? 'Battery low: return home' : 'Return home';
        if (d.state === 'crashed') note = `Crashed into ${d.cause}: W to relaunch`;
        if (d.state === 'landed' && d.battery <= 0) note = 'Battery flat: K to put away';
        this.osd.textContent = `${parts.join('  ')}\n${note}`;
        this.osd.classList.toggle('drone-osd-fpv', this.cam.mode === 'fpv');
        this.osd.classList.toggle('drone-osd-warn', d.signal() < 0.5 || d.battery < Drone.FLIGHT.homeShare || d.state === 'crashed');
    }

    // The session ends: the dialog and the overlays go, the rider back on the bike, the drone put away. The camera
    // view of this last frame, for Game to ease the chase camera back from
    close() {
        this.off.forEach(remove => remove());
        Modals.close(this.bar);
        this.osd.remove();
        this.reticle.remove();
        document.body.classList.remove('drone-out');
        if (this.rider.stood && typeof StopScene !== 'undefined') StopScene.seat(this.rider);
        this.model.dispose();
        this.game.scene.remove(this.controller);
        this.controller.geometry.dispose();
        return { ...this.cam.now };
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { Drone, DroneCamera, DroneWorld, DroneModel, DroneSpot, DroneSession };
