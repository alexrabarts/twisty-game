// The hill ride's bicycle on the lane (js/hill/ride.js): the game's own bike (HillVehicle, js/hill/pushbike.js) ridden
// free on the lane's plane, and what the lane and the boy add to it. The lane gives the bike its grade along its
// heading and its height; the kerbs and the house fronts behind them are solid (a glancing touch is a brush, as against
// a world's wall; more is a crash); the cobbles shake it. The boy's own state rides on top: the cranks (turned while he
// pushes, still on the freewheel), his feet off the pedals and his legs out at speed downhill, a foot down when it
// stands, and after a fall a short wait and the bicycle stood up again in place. While `walking` (the climb, set by
// js/hill/ride.js) he is off the saddle and pushes it up the lane on foot: the cranks stay still, the legs stay in,
// and walkM counts the metres walked, which set his steps.
//
// Past legsOutMs going downhill with the pedals left alone, the boy takes his feet off and holds his legs straight
// out to the sides; he puts them back once the bicycle has slowed under legsInMs, or when he pedals at a speed his
// feet can follow. The pose follows that state over legsBlendS (js/hill/rider.js). Even then he keeps his feet on the
// pedals most of the time (LEGS.forS, the cranks level) and only now and then swings them out (for LEGS.everyS,
// seeded for the ride), in a pose of their own each time (LEGS ranges: spread, drop, how far ahead, the knee's
// bend and the toe), the left and the right not mirror images.
class HillBicycle {
    // The cranks' angle while he pushes it on foot: the pedal on his side (the left, +x) up and forward of the bracket
    static get WALK_CRANK() { return Math.PI / 4; }

    static get RULE() {
        return Object.freeze({
            legsOutMs: 6.5, legsInMs: 4.2, legsGrade: -0.04, legsQuietS: 0.4, legsBlendS: 0.3,
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
            everyS: [2.5, 5], forS: [4, 9],
            // The opening stretch, as in the stills: from the start down through the first right-hander the legs go out
            // as soon as he stops pedalling over alwaysMs, and stay out, with no turn back to the pedals
            alwaysToS: 66, alwaysMs: 2.5,
            // Seen from behind, each leg 37 to 44 degrees out from straight down, as the stills measure (about 35 to 50)
            spread: [0.6, 0.7], drop: [-0.8, -0.72], ahead: [0.15, 0.3], toe: [0.5, 0.8]
        });
    }

    constructor(lane, rule = HillBicycle.RULE) {
        this.lane = lane;
        this.rule = rule;
        this.vehicle = new HillVehicle();
        // The ground his fall lands on (HillVehicle.riderGroundY)
        this.vehicle.lane = lane;
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
        // In a side road, its own surface
        const road = this.lane.sideAt(v.position.x, v.position.z, this.road || (this.road = {}));
        this.inRoad = road && road.road.ride > 0 && road.d > 0 ? road : null;
        v.position.y = (this.inRoad ? this.lane.roadY(road.road, road.d, road.w) : this.lane.sample(this.s).y) + this.bounce;
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
        const L = HillBicycle.LEGS, pick = ([a, b]) => a + (b - a) * this.legRand();
        const opening = this.s < L.alwaysToS;
        const quiet = this.quietS >= r.legsQuietS && !v.isWheelie;
        if (!this.legsOut && quiet && (opening ? v.speed > L.alwaysMs : v.speed > r.legsOutMs && p.grade < r.legsGrade)) this.legsOut = true;
        else if (this.legsOut && (v.speed < (opening ? L.alwaysMs * 0.6 : r.legsInMs) || (pedal > 0 && v.speed < v.pedalMostMs))) this.legsOut = false;
        // While out: now and then back on the pedals for a moment, then out again in a new pose; on the opening stretch
        // they stay out
        if (this.legsOut && opening) {
            if (this.visiting > 0) this.newPose();
            this.visiting = 0;
            this.visitIn = pick(L.everyS);
        } else if (this.legsOut) {
            // He starts on the pedals and puts his legs out only after a while
            if (this.wasOut !== true) this.visiting = pick(L.forS);
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

        // On foot beside it: nothing of the legs out
        if (this.walking) {
            this.legsOut = false;
            this.legs = 0;
            this.visiting = 0;
        }
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
        this.pushing = push > 0 && !v.crashed && v.speed < v.pedalMostMs && !this.walking;
        this.walkM = (this.walkM || 0) + (this.walking && !v.crashed ? v.speed * dt : 0);
        this.cadenceRpm = this.pushing ? v.speed / HillVehicle.DATA.developmentM * 60 : 0;
        this.crank = (this.crank + this.cadenceRpm / 60 * 2 * Math.PI * dt) % (2 * Math.PI);
        // Pushed on foot, the cranks are parked with his side's pedal up and forward, out of his boots' way: the low
        // pedal hung at the height of his feet, just inside them, and from the side it looked like a plate under a boot
        if (this.walking) {
            const off = Math.atan2(Math.sin(HillBicycle.WALK_CRANK - this.crank), Math.cos(HillBicycle.WALK_CRANK - this.crank));
            this.crank = (this.crank + off * Math.min(1, dt * 4) + 2 * Math.PI) % (2 * Math.PI);
        }
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
        // A side road that can be ridden: its mouth is open, its sides and its end are walls
        const road = this.lane.sideAt(v.position.x, v.position.z, this.road || (this.road = {}));
        const open = road && road.road.ride > 0 && Math.sign(this.at.across) === road.road.side && Math.abs(road.w) < road.road.wide / 2 - r.kerbM;
        if (road && road.road.ride > 0 && road.d > 0) {
            const R = road.road, p = this.lane.roadPoint(R, road.d);
            const side = Math.abs(road.w) - (R.wide / 2 - r.kerbM), end = road.d - (R.ride - r.kerbM);
            const touch = (nx, nz, push) => {
                v.position.x += nx * push;
                v.position.z += nz * push;
                if (v.crashed) {
                    v.velocity.multiplyScalar(0.5);
                    return;
                }
                if (v.wallTouch(nx, nz, 0.2)) v.brush(nx, nz);
                else {
                    v.worldCrash(R.end === 'gate' && end > 0 ? 'Rode into the gate' : 'Rode into the wall', null, 'wall');
                    this.hits++;
                }
            };
            if (side > 0 && road.d > r.kerbM) touch(-Math.sign(road.w) * p.crossX, -Math.sign(road.w) * p.crossZ, side);
            if (end > 0) touch(-p.dirX, -p.dirZ, end);
            // In it, past the lane's edge: the lane's kerbs are behind him
            if (road.d > r.kerbM) {
                if (!v.crashed) v.brushStep(dt);
                return;
            }
        }
        if (open) {
            if (!v.crashed) v.brushStep(dt);
            return;
        }
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
