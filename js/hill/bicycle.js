// The hill ride's bicycle (js/hill/ride.js): a heavy delivery bicycle and the boy on it, as data. No engine: the boy
// pushes the pedals, and his push falls away as the cadence rises, to nothing at the most he can turn them. A single
// gear and a freewheel: past that cadence, or with the pedals still, the cranks stop and the bicycle rolls on. Rod
// brakes pull weakly at the rims. Down the hill gravity does the work, against the cobbles' drag and the air's. The
// cobbles shake it: every sett under a wheel lifts it a little (HillLane.cobble).
//
// Past legsOutMs going downhill with the pedals left alone, the boy takes his feet off and holds his legs straight
// out to the sides; he puts them back once the bicycle has slowed under legsInMs, or when he pedals at a speed his
// feet can follow. The pose follows that state over legsBlendS (js/hill/rider.js).
class HillBicycle {
    static get RULE() {
        return Object.freeze({
            // The boy and the bicycle together
            massKg: 74,
            g: 9.81,
            // Rolling drag on the cobbles, as a share of the weight, and the air's (drag area, m2, and air density)
            rollCobbles: 0.04,
            dragAreaM2: 0.7, airKgM3: 1.2,
            // One gear: metres the bicycle goes for one turn of the cranks, and the most turns a minute the boy makes
            developmentM: 4.2, cadenceMostRpm: 92,
            // His push at the pedals, as a force at the road, when they barely turn; it falls to nothing at cadenceMostRpm
            pushN: 150,
            // Rod brakes at full pull: the most they slow the bicycle, m/s2
            brakeMs2: 2.4,
            // Past the end of the ride the boy pulls up hard, dragging his boots
            endBrakeMs2: 4,
            // Across the lane: how fast the bicycle drifts across at full steer, held under the speed at which it reaches
            // that (a slow bicycle turns little), and how near the lane's edge it may go
            acrossMs: 1.6, acrossFullMs: 3, edgeM: 0.4,
            // The lean drawn for a drift across, radians per m/s of drift, and the most
            leanPerMs: 0.12, leanMost: 0.3,
            // The legs: out above legsOutMs going down a grade steeper than legsGrade with no pedalling for legsQuietS;
            // back in under legsInMs. The pose takes legsBlendS to follow
            legsOutMs: 6.5, legsInMs: 4.2, legsGrade: -0.04, legsQuietS: 0.4, legsBlendS: 0.45,
            // The shake: how much of the cobbles' height reaches the frame, and how fast the frame follows it
            judder: 1, judderFollowS: 0.03
        });
    }

    constructor(lane, rule = HillBicycle.RULE) {
        this.lane = lane;
        this.rule = rule;
        this.reset();
    }

    // At the top of the lane, stood still, feet on the pedals
    reset(s = this.lane.rule.startM) {
        this.s = s;
        this.across = 0;
        this.speed = 0;
        this.crank = 0;
        this.cadenceRpm = 0;
        this.pushing = false;
        this.quietS = 0;
        this.legsOut = false;
        this.legs = 0;
        this.lean = 0;
        this.bounce = 0;
        this.pitch = 0;
        this.edgeHit = 0;
        this.finished = false;
        this.timeS = 0;
    }

    // The speed at which the cranks turn as fast as the boy can turn them
    get pedalMostMs() {
        return this.rule.developmentM * this.rule.cadenceMostRpm / 60;
    }

    // The forward force his push makes at `speed`: none at or past the most he can turn the cranks
    pushAt(speed) {
        return this.rule.pushN * Math.max(0, 1 - speed / this.pedalMostMs);
    }

    // One step. `input` is { pedal: 0..1, brake: 0..1, steer: -1..1 (+ to the left) }
    step(dt, input) {
        const r = this.rule;
        const lane = this.lane;
        const p = lane.sample(this.s);
        const pedal = this.finished ? 0 : Math.max(0, Math.min(1, input.pedal || 0));
        const brake = this.finished ? 1 : Math.max(0, Math.min(1, input.brake || 0));
        const steer = this.finished ? 0 : Math.max(-1, Math.min(1, input.steer || 0));

        // The feet: off the pedals at speed downhill, back on when slow or when he pedals at a speed he can follow
        this.quietS = pedal > 0 ? 0 : this.quietS + dt;
        if (!this.legsOut && this.speed > r.legsOutMs && p.grade < r.legsGrade && this.quietS >= r.legsQuietS) this.legsOut = true;
        else if (this.legsOut && (this.speed < r.legsInMs || (pedal > 0 && this.speed < this.pedalMostMs))) this.legsOut = false;
        const toward = this.legsOut ? 1 : 0;
        const rate = dt / r.legsBlendS;
        this.legs = this.legs < toward ? Math.min(toward, this.legs + rate) : Math.max(toward, this.legs - rate);

        // The forces along the lane: his push (none with his feet off), the fall, the cobbles, the air, the brakes
        this.pushing = pedal > 0 && !this.legsOut && this.speed < this.pedalMostMs;
        const push = this.pushing ? pedal * this.pushAt(this.speed) : 0;
        const slope = Math.atan(p.grade);
        const fall = -r.massKg * r.g * Math.sin(slope);
        const roll = this.speed > 0 ? r.rollCobbles * r.massKg * r.g * Math.cos(slope) : 0;
        const air = 0.5 * r.airKgM3 * r.dragAreaM2 * this.speed * this.speed;
        let accel = (push + fall - roll - air) / r.massKg - brake * (this.finished ? r.endBrakeMs2 : r.brakeMs2);
        // Stood still with the brakes on, or with no fall to move it, it stays put
        if (this.speed <= 0 && accel < 0) accel = 0;
        this.speed = Math.max(0, this.speed + accel * dt);
        this.s += this.speed * dt;
        if (this.s >= lane.rule.endM) this.finished = true;
        if (this.s >= lane.rule.lengthM - 1) {
            this.s = lane.rule.lengthM - 1;
            this.speed = 0;
        }

        // Across the lane: a drift that the speed lets grow, stopped at the edges with a knock
        const reach = Math.min(1, this.speed / r.acrossFullMs);
        const drift = steer * r.acrossMs * reach;
        const edge = lane.rule.halfWidthM - r.edgeM;
        this.across += drift * dt;
        this.edgeHit = Math.max(0, this.edgeHit - dt);
        if (Math.abs(this.across) > edge) {
            this.across = Math.sign(this.across) * edge;
            if (this.edgeHit === 0) this.edgeHit = 0.3;
        }
        const leanTo = -Math.max(-r.leanMost, Math.min(r.leanMost, drift * r.leanPerMs * Math.min(1, this.speed / 2)));
        this.lean += (leanTo - this.lean) * Math.min(1, dt / 0.2);

        // The cranks: turned with the wheel while he pushes, still on the freewheel otherwise
        this.cadenceRpm = this.pushing ? this.speed / r.developmentM * 60 : 0;
        this.crank = (this.crank + this.cadenceRpm / 60 * 2 * Math.PI * dt) % (2 * Math.PI);

        // The shake: the cobbles under each wheel lift the frame and pitch it
        const wheelbase = 1.15;
        const front = lane.cobble(this.s + wheelbase / 2, this.across), back = lane.cobble(this.s - wheelbase / 2, this.across);
        const follow = Math.min(1, dt / r.judderFollowS);
        this.bounce += ((front + back) / 2 * r.judder - this.bounce) * follow;
        this.pitch += ((back - front) / wheelbase * r.judder - this.pitch) * follow;
        this.timeS += dt;
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { HillBicycle };
