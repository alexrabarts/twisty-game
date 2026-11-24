// The hill ride's bicycle on the lane (js/hill/ride.js): the game's own bike (HillVehicle, js/hill/pushbike.js) ridden
// free on the lane's plane, and what the lane and the boy add to it. The lane gives the bike its grade along its
// heading and its height; the kerbs and the house fronts behind them are solid (a glancing touch is a brush, as against
// a world's wall; more is a crash); the cobbles shake it. The boy's own state rides on top: the cranks (turned while he
// pushes, still on the freewheel), his feet off the pedals and his legs out at speed downhill, a foot down when it
// stands, and after a fall a short wait and the bicycle stood up again in place.
//
// Past legsOutMs going downhill with the pedals left alone, the boy takes his feet off and holds his legs straight
// out to the sides; he puts them back once the bicycle has slowed under legsInMs, or when he pedals at a speed his
// feet can follow. The pose follows that state over legsBlendS (js/hill/rider.js). While they are out he now and then
// (every LEGS.everyS, seeded for the ride) puts his feet back on the pedals for a moment (LEGS.forS), the cranks
// level, and swings them out again in a pose of their own each time (LEGS ranges: spread, drop, how far ahead, the knee's
// bend and the toe), the left and the right not mirror images.
class HillBicycle {
    static get RULE() {
        return Object.freeze({
            legsOutMs: 6.5, legsInMs: 4.2, legsGrade: -0.04, legsQuietS: 0.4, legsBlendS: 0.45,
            // How near the kerb the wheels go: the kerb stands at the lane's edge
            kerbM: 0.3,
            // After a fall: how long he lies before the bicycle is stood up again in place
            downS: 2.2,
            // The shake: how much of the cobbles' height reaches the frame, and how fast the frame follows it
            judder: 1, judderFollowS: 0.03
        });
    }

    // The legs out, as data: how often he brings his feet back and for how long (s, a range each), and the ranges of a
    // pose out (each leg its own): spread across (share of the reach), drop below the hip, ahead, the knee's bend (the
    // share of the reach it takes), the toe up (rad). The rider draws them (HillRider.LEGS_OUT: sway, bounce, balance)
    static get LEGS() {
        return Object.freeze({
            everyS: [3, 8], forS: [0.5, 1.5],
            spread: [0.68, 0.92], drop: [-0.62, -0.32], ahead: [0.12, 0.48], bend: [0, 0.16], toe: [0.35, 0.95]
        });
    }

    constructor(lane, rule = HillBicycle.RULE) {
        this.lane = lane;
        this.rule = rule;
        this.vehicle = new HillVehicle();
        this.at = {};
        this.reset();
    }

    get speed() { return this.vehicle.speed; }
    get lean() { return this.vehicle.leanAngle; }
    get yaw() { return this.vehicle.yawAngle; }
    get crashed() { return this.vehicle.crashed; }
    get wheelie() { return this.vehicle.isWheelie ? this.vehicle.wheelieAngle : 0; }
    get pedalMostMs() { return this.vehicle.pedalMostMs; }
    // A foot on the ground: the bicycle stands (or crawls to a stop) and is not down
    get footDown() { return !this.vehicle.crashed && !this.vehicle.isWheelie && (this.vehicle.footDown || this.vehicle.speed < 0.05); }

    // Stood at `s` on the lane, `across` left of its centre, facing down it, a foot down
    reset(s = this.lane.rule.startM, across = 0) {
        const v = this.vehicle;
        v.reset();
        const p = this.lane.sample(s);
        v.position.set(p.x + p.leftX * across, p.y, p.z + p.leftZ * across);
        v.yawAngle = p.heading;
        v.speed = 0;
        v.velocity.set(0, 0, 0);
        v.footDown = true;
        v.prevRenderPos = null;
        this.s = s;
        this.across = across;
        this.crank = 0;
        this.cadenceRpm = 0;
        this.pushing = false;
        this.quietS = 0;
        this.legsOut = false;
        this.legs = 0;
        this.rides = (this.rides || 0) + 1;
        this.legRand = HillLane.random(this.lane.rule.seed + this.rides * 17);
        this.visitIn = 0;
        this.visiting = 0;
        this.legPose = this.legPose || { l: {}, r: {} };
        this.poses = 0;
        this.newPose();
        this.bounce = 0;
        this.pitch = 0;
        this.downS = 0;
        this.timeS = 0;
        this.hits = 0;
        this.place();
    }

    // A new pose out for each leg, from the LEGS ranges
    newPose() {
        const L = HillBicycle.LEGS, pick = ([a, b]) => a + (b - a) * this.legRand();
        for (const side of ['l', 'r']) {
            const pose = this.legPose[side];
            pose.spread = pick(L.spread);
            pose.drop = pick(L.drop);
            pose.ahead = pick(L.ahead);
            pose.bend = pick(L.bend);
            pose.toe = pick(L.toe);
        }
        this.poses++;
    }

    // The bicycle's place on the lane from the vehicle's, and its height on the cobbles
    place() {
        const v = this.vehicle;
        this.lane.project(v.position.x, v.position.z, this.s, this.at);
        this.s = this.at.s;
        this.across = this.at.across;
        v.position.y = this.lane.sample(this.s).y + this.bounce;
    }

    // One step. `input` is { pedal: 0..1, brake: 0..1, steer: -1..1 (+ to the left, the game's sign), wheelie: 0..1 }
    step(dt, input) {
        const r = this.rule, v = this.vehicle;
        const p = this.lane.sample(this.s);
        // The lane's grade along the bicycle's heading
        v.surface.grade = p.grade * Math.cos(v.yawAngle - p.heading);
        v.surface.heading = p.heading;

        const pedal = Math.max(0, Math.min(1, input.pedal || 0));
        this.quietS = pedal > 0 ? 0 : this.quietS + dt;
        if (!this.legsOut && v.speed > r.legsOutMs && p.grade < r.legsGrade && this.quietS >= r.legsQuietS && !v.isWheelie) this.legsOut = true;
        else if (this.legsOut && (v.speed < r.legsInMs || (pedal > 0 && v.speed < v.pedalMostMs))) this.legsOut = false;
        // While out: now and then back on the pedals for a moment, then out again in a new pose
        const L = HillBicycle.LEGS, pick = ([a, b]) => a + (b - a) * this.legRand();
        if (this.legsOut) {
            if (this.wasOut !== true) this.visitIn = pick(L.everyS);
            if (this.visiting > 0) {
                this.visiting -= dt;
                if (this.visiting <= 0) {
                    this.newPose();
                    this.visitIn = pick(L.everyS);
                }
            } else if (this.legs >= 1) {
                this.visitIn -= dt;
                if (this.visitIn <= 0) {
                    this.visiting = pick(L.forS);
                    this.visits = (this.visits || 0) + 1;
                }
            }
        } else {
            if (this.wasOut === true) this.newPose();
            this.visiting = 0;
        }
        this.wasOut = this.legsOut;
        const toward = this.legsOut && !(this.visiting > 0) ? 1 : 0;
        const rate = dt / r.legsBlendS;
        this.legs = this.legs < toward ? Math.min(toward, this.legs + rate) : Math.max(toward, this.legs - rate);

        const push = this.legsOut ? 0 : pedal;
        v.update(dt, input.steer || 0, push, input.brake || 0, input.wheelie || 0);
        this.kerbs(dt);
        if (v.crashed) {
            this.downS += dt;
            if (this.downS >= r.downS) {
                // Stood up again where he fell, on the lane, facing down it
                const s = this.s, across = Math.max(-1.5, Math.min(1.5, this.across));
                this.reset(s, across);
                return;
            }
        }

        // The cranks: turned with the wheel while he pushes, still on the freewheel otherwise
        this.pushing = push > 0 && !v.crashed && v.speed < v.pedalMostMs;
        this.cadenceRpm = this.pushing ? v.speed / HillVehicle.DATA.developmentM * 60 : 0;
        this.crank = (this.crank + this.cadenceRpm / 60 * 2 * Math.PI * dt) % (2 * Math.PI);
        // Feet back on the pedals for a moment at speed: the cranks come level under them
        if (this.visiting > 0) {
            const level = Math.abs(this.crank - Math.PI / 2) < Math.abs(this.crank - 3 * Math.PI / 2) ? Math.PI / 2 : 3 * Math.PI / 2;
            this.crank += (level - this.crank) * Math.min(1, dt * 8);
        }

        // The shake: the cobbles under each wheel lift the frame and pitch it
        const half = HillVehicle.DATA.wheelbaseM / 2;
        const front = this.lane.cobble(this.s + half, this.across), back = this.lane.cobble(this.s - half, this.across);
        const follow = Math.min(1, dt / r.judderFollowS);
        this.bounce += ((front + back) / 2 * r.judder - this.bounce) * follow;
        this.pitch += ((back - front) / (2 * half) * r.judder - this.pitch) * follow;
        this.place();
        this.timeS += dt;
    }

    // The kerbs: the bicycle's wheels go no nearer the lane's edge than kerbM. A glancing touch brushes along the kerb
    // and the house fronts, as a world's bike brushes a wall (Vehicle.wallTouch, brush, brushStep); more is a crash
    kerbs(dt) {
        const v = this.vehicle, r = this.rule;
        this.lane.project(v.position.x, v.position.z, this.s, this.at);
        const limit = this.lane.rule.halfWidthM - r.kerbM;
        // Down and sliding, the bicycle stops at the kerb
        if (v.crashed && Math.abs(this.at.across) > this.lane.rule.halfWidthM - 0.1) {
            const p = this.lane.sample(this.at.s), side = Math.sign(this.at.across);
            const push = Math.abs(this.at.across) - (this.lane.rule.halfWidthM - 0.1);
            v.position.x -= side * p.leftX * push;
            v.position.z -= side * p.leftZ * push;
            v.velocity.multiplyScalar(0.5);
        }
        if (!v.crashed && Math.abs(this.at.across) > limit) {
            const p = this.lane.sample(this.at.s);
            const side = Math.sign(this.at.across);
            // The kerb's face looks back into the lane
            const nx = -side * p.leftX, nz = -side * p.leftZ;
            const push = Math.abs(this.at.across) - limit;
            v.position.x += nx * push;
            v.position.z += nz * push;
            if (v.wallTouch(nx, nz, 0.2)) v.brush(nx, nz);
            else {
                v.worldCrash('Rode into the house fronts', null, 'wall');
                this.hits++;
            }
        }
        if (!v.crashed) v.brushStep(dt);
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { HillBicycle };
