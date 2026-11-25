// The hill ride's bicycle and boy as drawn (assets/hill/bicycle.glb, tools/blender/hill_bike.py): the file's parts
// hung on pivots, set each frame from the bicycle's state (js/hill/bicycle.js). The wheels spin by the road speed, the
// cranks by their own angle, the pedals stay level, and each leg is put together from hip to ankle: on its pedal, or
// straight out to the side when the boy has taken his feet off. On the climb he is off it and walks it up the lane
// (WALK). Nothing is allocated a frame.
class HillRider {
    static get FILE() { return 'assets/hill/bicycle.glb'; }

    // How the legs stand when out: the direction from the hip, for the leg on +x (mirrored for the other), and the
    // way the boot's toe points; the share of the leg's length they reach
    // The pose itself comes from the bicycle (HillBicycle.LEGS, legPose); here how it lives while held out: a slow sway
    // (swayM at swayHz, each leg its own phase), the cobbles' bounce answered after lagS, times bounceGain, and a
    // balance against the lean (leanGain m for each rad). Leaned over past tuckRad, the leg on the low side would meet
    // the cobbles (its boot is there at about 29 degrees), so he lifts it back onto its pedal over tuckS, and puts it out
    // again once the lean is back under untuckRad
    static get LEGS_OUT() {
        return Object.freeze({ reach: 0.996, swayM: 0.017, swayHz: 0.35, lagS: 0.12, bounceGain: 1.7, leanGain: 0.12, tuckRad: 0.31, untuckRad: 0.23, tuckS: 0.25 });
    }

    // On foot, pushing the bicycle up the climb (HillBicycle.walking), as in the reference stills: beside it on its left
    // (+x), his hips at `hip` in the frame, bent forward over the bars by bendRad and turned in towards them by turnRad,
    // a hand on each grip (a shoulder reaching at most reachM forward to the far one). His steps: a pace of strideM (two
    // steps), each foot on the cobbles for `stance` of it and lifted liftM as it swings, the feet footX out from the hips'
    // middle and backM behind it. His head is lifted headUpRad from the bend, so he looks up the lane ahead of him. The
    // bicycle leans in towards him by leanRad; on and off the saddle over blendS
    static get WALK() {
        return Object.freeze({ hip: [0.42, 0.8, -0.2], bendRad: 0.75, turnRad: 0.35, headUpRad: 0.6, reachM: 0.2, strideM: 1.0, stance: 0.6, liftM: 0.09, footX: 0.11,
            backM: 0.12, leanRad: 0.06, blendS: 0.4 });
    }

    // The ankle over its pedal, from the pedal's pivot
    static get ANKLE_ON_PEDAL() { return [0, 0.065, -0.025]; }

    // The knee from the hip and the ankle, for a thigh `upper` and shin `lower` long, bent towards `pole`. Writes `out`
    static knee(hip, ankle, upper, lower, pole, out) {
        const dx = ankle.x - hip.x, dy = ankle.y - hip.y, dz = ankle.z - hip.z;
        const reach = Math.hypot(dx, dy, dz) || 1e-6;
        const d = Math.min(reach, upper + lower - 1e-4);
        // Along the hip-ankle line to the foot of the knee's perpendicular, then out along the pole
        const a = (upper * upper - lower * lower + d * d) / (2 * d);
        const h = Math.sqrt(Math.max(0, upper * upper - a * a));
        const ux = dx / reach, uy = dy / reach, uz = dz / reach;
        const along = pole.x * ux + pole.y * uy + pole.z * uz;
        let px = pole.x - along * ux, py = pole.y - along * uy, pz = pole.z - along * uz;
        const pl = Math.hypot(px, py, pz) || 1;
        px /= pl; py /= pl; pz /= pl;
        out.set(hip.x + ux * a + px * h, hip.y + uy * a + py * h, hip.z + uz * a + pz * h);
        return out;
    }

    constructor(model) {
        const lod = model.groups && model.groups.get('lod0') ? model.groups.get('lod0') : model;
        this.group = new THREE.Group();
        this.group.name = 'hill-bicycle';
        // The bicycle's own frame: its parts hang here, and the judder moves it
        this.frame = new THREE.Group();
        this.group.add(this.frame);
        this.parts = {};
        for (const [name, primitives] of lod.meshes) {
            const pivot = new THREE.Group();
            pivot.name = name;
            pivot.position.copy(lod.places.get(name));
            for (const { geometry, material } of primitives) {
                const mesh = new THREE.Mesh(geometry, material);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                pivot.add(mesh);
            }
            this.frame.add(pivot);
            this.parts[name] = pivot;
        }
        const need = ['wheel_front', 'wheel_rear', 'cranks', 'pedal_l', 'pedal_r', 'thigh_l', 'thigh_r', 'shin_l', 'shin_r', 'foot_l', 'foot_r', 'boy',
            'steer', 'upperarm_l', 'upperarm_r', 'forearm_l', 'forearm_r'];
        const missing = need.filter(name => !this.parts[name]);
        if (missing.length) throw new Error(`${HillRider.FILE} lacks ${missing.join(', ')}`);
        this.rest = {};
        for (const name of need) this.rest[name] = this.parts[name].position.clone();
        const r = this.rest;
        this.radius = { front: r.wheel_front.y, rear: r.wheel_rear.y };
        this.bb = r.cranks.clone();
        this.legs = ['l', 'r'].map(tag => {
            const hip = r[`thigh_${tag}`].clone(), knee = r[`shin_${tag}`].clone(), ankle = r[`foot_${tag}`].clone(), pedal = r[`pedal_${tag}`].clone();
            return {
                tag, hip, side: Math.sign(hip.x) || 1,
                upper: hip.distanceTo(knee), lower: knee.distanceTo(ankle),
                // The pedal's offset from the bottom bracket at crank angle 0, and its crank's start angle (the left is half a turn on)
                pedalX: pedal.x, start: pedal.y < this.bb.y ? 0 : Math.PI,
                crank: Math.abs(pedal.y - this.bb.y),
                thigh: this.parts[`thigh_${tag}`], shin: this.parts[`shin_${tag}`], foot: this.parts[`foot_${tag}`], pedalPart: this.parts[`pedal_${tag}`]
            };
        });
        this.scratch = { hip: new THREE.Vector3(), walkFoot: new THREE.Vector3(), ankle: new THREE.Vector3(), out: new THREE.Vector3(), knee: new THREE.Vector3(), pole: new THREE.Vector3(), toe: new THREE.Vector3(), up: new THREE.Vector3(), m: new THREE.Matrix4(), x: new THREE.Vector3(), y: new THREE.Vector3(), z: new THREE.Vector3() };
        this.spin = { front: 0, rear: 0 };
        // The front wheel turns with the fork and the bars about the head tube
        const steer = this.parts.steer;
        this.frame.remove(this.parts.wheel_front);
        steer.add(this.parts.wheel_front);
        this.parts.wheel_front.position.sub(r.steer);
        const A = HillRider.ARMS;
        this.axis = new THREE.Vector3(0, Math.cos(A.rakeDeg * Math.PI / 180), -Math.sin(A.rakeDeg * Math.PI / 180));
        this.arms = ['l', 'r'].map(tag => {
            const shoulder = r[`upperarm_${tag}`].clone(), side = Math.sign(shoulder.x) || 1;
            return {
                tag, side, shoulder, upper: shoulder.distanceTo(r[`forearm_${tag}`]), lower: A.forearmM,
                grip: new THREE.Vector3(side * A.grip[0], A.grip[1], A.grip[2]),
                upperPart: this.parts[`upperarm_${tag}`], lowerPart: this.parts[`forearm_${tag}`]
            };
        });
        this.steerQ = new THREE.Quaternion();
        // The head (a model file without it has the head in the body): hung on the body, so it goes where he goes
        const head = this.parts.head;
        if (head) {
            this.frame.remove(head);
            this.parts.boy.add(head);
            head.position.sub(r.boy);
        }
    }

    // The boy's parts that leave the bicycle in a fall
    static get BODY() { return ['boy', 'upperarm_l', 'upperarm_r', 'forearm_l', 'forearm_r', 'thigh_l', 'thigh_r', 'shin_l', 'shin_r', 'foot_l', 'foot_r']; }

    // The boy thrown off and falling as the vehicle's own rider falls (Vehicle.beginRiderFall, stepRiderFall,
    // drawRiderFall: the kinds, the rows, the keys and the slide are theirs). His body takes that rider's place and turn,
    // and each limb that limb's direction from its root and its share of its reach, at the boy's own lengths
    fall(v) {
        const s = this.scratch, r = this.rest, rf = v.riderFall;
        v.drawRiderFall();
        if (!this.fallen) {
            this.fallen = new THREE.Group();
            this.fallen.name = 'hill-boy-fallen';
            (this.group.parent || this.group).add(this.fallen);
            for (const name of HillRider.BODY) {
                this.frame.remove(this.parts[name]);
                this.fallen.add(this.parts[name]);
            }
            this.parts.boy.position.set(0, 0, 0);
            this.parts.boy.quaternion.identity();
            if (this.parts.head) this.parts.head.quaternion.identity();
        }
        // (where the vehicle's rider is now drawn, in the world)
        v.group.updateMatrixWorld(true);
        v.rider.getWorldPosition(this.fallen.position);
        v.rider.getWorldQuaternion(this.fallen.quaternion);
        // (the vehicle's rider leans his spine forward by rf.lean in his own shape; the boy is built leaning already)
        let i = 0;
        for (const [rig, mine] of [[v.arms, this.arms], [v.legs, this.legs]]) {
            for (const side of [-1, 1]) {
                const limb = rig[side], end = rf.end[i++];
                const own = mine.find(m => m.side === side);
                const root = s.sh || (s.sh = new THREE.Vector3());
                const isArm = mine === this.arms;
                root.copy(isArm ? own.shoulder : own.hip).sub(r.boy);
                const dir = s.x.subVectors(end, limb.root);
                const share = Math.min(1, dir.length() / limb.reach);
                dir.normalize();
                const length = (own.upper + own.lower) * Math.max(0.55, share);
                s.ankle.copy(root).addScaledVector(dir, length);
                s.pole.set(side * (isArm ? 1 : 0.2), isArm ? -0.6 : 0.3, isArm ? -0.3 : 1);
                HillRider.knee(root, s.ankle, own.upper, own.lower, s.pole, s.knee);
                s.up.set(0, 0, 1);
                if (isArm) {
                    this.point(own.upperPart, root, s.knee, s.up);
                    this.point(own.lowerPart, s.knee, s.ankle, s.up);
                } else {
                    this.point(own.thigh, root, s.knee, s.up);
                    this.point(own.shin, s.knee, s.ankle, s.up);
                    own.foot.position.copy(s.ankle);
                    own.foot.quaternion.copy(own.shin.quaternion);
                }
            }
        }
    }

    // Back on the bicycle after the restart: every part of him on the frame again, where it was built
    remount() {
        for (const name of HillRider.BODY) {
            this.fallen.remove(this.parts[name]);
            this.frame.add(this.parts[name]);
            this.parts[name].position.copy(this.rest[name] || this.parts[name].position);
            this.parts[name].quaternion.identity();
        }
        if (this.fallen.parent) this.fallen.parent.remove(this.fallen);
        this.fallen = null;
    }

    // The arms and the bars: the head tube's rake, where each hand holds its grip (on +x, mirrored), the forearm's
    // length to the hand's middle, the shoulders' turn with the bars (a share of their angle), and how far a shoulder
    // reaches forward to a far grip (m), and how far his body leans into a turn past the bicycle's own lean (a share of
    // it, about the saddle, at most bodyLeanMost rad)
    static get ARMS() {
        return Object.freeze({ rakeDeg: 20, grip: [0.27, 1.02, 0.2], forearmM: 0.31, shoulderTurn: 0.3, shoulderReachM: 0.06, bodyLean: 0.35, bodyLeanMost: 0.25 });
    }

    // The bars turned to `bars` (radians) about the head tube, the shoulders turned a little with them, the body leaned
    // into the turn past the bicycle's `lean`, each arm from its shoulder to its grip with the elbow bent out and down.
    // `walk` (0..1) takes him off the saddle to his place on foot beside it (WALK); his hips' place and turn are kept
    // (boyAt, boyQ) for the legs
    steer(bars, lean = 0, walk = 0) {
        const s = this.scratch, A = HillRider.ARMS, r = this.rest;
        this.steerQ.setFromAxisAngle(this.axis, bars);
        this.parts.steer.quaternion.copy(this.steerQ);
        s.q2 = s.q2 || new THREE.Quaternion();
        s.q2.setFromAxisAngle(s.yAxis || (s.yAxis = new THREE.Vector3(0, 1, 0)), bars * A.shoulderTurn);
        // The roll is about the frame's own forward axis, the way the frame itself leans (Vehicle draws +z roll)
        const into = Math.max(-A.bodyLeanMost, Math.min(A.bodyLeanMost, lean * A.bodyLean));
        s.q3 = s.q3 || new THREE.Quaternion();
        s.q2.multiply(s.q3.setFromAxisAngle(s.zAxis || (s.zAxis = new THREE.Vector3(0, 0, 1)), into));
        // On foot: turned in towards the bars about the upright, then bent forward about his hips
        const W = HillRider.WALK;
        this.boyAt = this.boyAt || new THREE.Vector3();
        this.boyQ = this.boyQ || new THREE.Quaternion();
        this.boyAt.copy(r.boy);
        if (walk > 0) {
            s.q4 = s.q4 || new THREE.Quaternion();
            s.q4.setFromAxisAngle(s.yAxis, -W.turnRad).multiply(s.q3.setFromAxisAngle(s.xAxis || (s.xAxis = new THREE.Vector3(1, 0, 0)), W.bendRad));
            s.q2.slerp(s.q4, walk);
            this.boyAt.lerp(s.walkHip || (s.walkHip = new THREE.Vector3().fromArray(W.hip)), walk);
        }
        this.boyQ.copy(s.q2);
        this.parts.boy.quaternion.copy(s.q2);
        this.parts.boy.position.copy(this.boyAt);
        if (this.parts.head) this.parts.head.quaternion.setFromAxisAngle(s.xAxis || (s.xAxis = new THREE.Vector3(1, 0, 0)), -W.headUpRad * walk);
        s.hand = s.hand || new THREE.Vector3();
        s.sh = s.sh || new THREE.Vector3();
        s.elbow = s.elbow || new THREE.Vector3();
        for (const arm of this.arms) {
            s.hand.copy(arm.grip).sub(r.steer).applyQuaternion(this.steerQ).add(r.steer);
            s.sh.copy(arm.shoulder).sub(r.boy).applyQuaternion(s.q2).add(this.boyAt);
            // A shoulder reaches forward to a grip past the arm's length
            const gap = s.sh.distanceTo(s.hand) - (arm.upper + arm.lower) * 0.97;
            if (gap > 0) s.sh.addScaledVector(s.elbow.subVectors(s.hand, s.sh).normalize(), Math.min(gap, A.shoulderReachM + (W.reachM - A.shoulderReachM) * walk));
            s.pole.set(arm.side, -0.6, -0.3);
            HillRider.knee(s.sh, s.hand, arm.upper, arm.lower, s.pole, s.elbow);
            s.up.set(0, 0, 1);
            this.point(arm.upperPart, s.sh, s.elbow, s.up);
            this.point(arm.lowerPart, s.elbow, s.hand, s.up);
        }
    }

    // Turns `part` so that its local -y runs from `from` to `to` and its local +z leans towards `front`
    point(part, from, to, front) {
        const s = this.scratch;
        s.y.subVectors(from, to).normalize();
        s.z.copy(front).addScaledVector(s.y, -front.dot(s.y));
        if (s.z.lengthSq() < 1e-8) s.z.set(0, 0, 1).addScaledVector(s.y, -s.y.z);
        s.z.normalize();
        s.x.crossVectors(s.y, s.z);
        s.m.makeBasis(s.x, s.y, s.z);
        part.quaternion.setFromRotationMatrix(s.m);
        part.position.copy(from);
    }

    // The ankle of `leg` on foot (WALK), in the frame, into `out`: on the cobbles through its stance, the cobbles under
    // it moving back as he walks on, then swung forward and lifted. The left and the right half a pace apart
    step(leg, bike, lane, out) {
        const W = HillRider.WALK, s = this.scratch;
        const u = ((bike.walkM || 0) / W.strideM + (leg.side > 0 ? 0 : 0.5)) % 1;
        const half = W.stance * W.strideM / 2;
        let along, lift = 0;
        if (u < W.stance) along = half - 2 * half * u / W.stance;
        else {
            const w = (u - W.stance) / (1 - W.stance);
            along = -half + 2 * half * w * w * (3 - 2 * w);
            lift = W.liftM * Math.sin(Math.PI * w);
        }
        out.set(this.boyAt.x + leg.side * W.footX, 0, this.boyAt.z - W.backM + along);
        // Onto the cobbles where it is, whatever the frame's lean and pitch
        this.frame.localToWorld(out);
        lane.project(out.x, out.z, bike.s, s.footAt || (s.footAt = {}));
        out.y = lane.sample(s.footAt.s).y + lane.cobble(s.footAt.s, s.footAt.across) + HillRider.ANKLE_ON_PEDAL[1] + lift;
        return this.frame.worldToLocal(out);
    }

    // Sets every part from the bicycle's state (HillBicycle) on `lane` (HillLane). The frame is placed where the game's
    // bike is, along its heading, pitched with the lane's fall along that heading, leaned as the bike leans (+ to its
    // right, as Vehicle draws it), lifted about the rear axle in a wheelie, leaned onto a foot when it stands, and laid
    // over on its side when it falls
    update(bike, lane, dt) {
        const s = this.scratch, v = bike.vehicle;
        const p = lane.sample(bike.s, s.lane || (s.lane = {}));
        const along = p.grade * Math.cos(bike.yaw - p.heading);
        this.group.position.set(v.position.x, v.position.y, v.position.z);
        // The foot down: the frame leans onto the left foot over FOOT_S, as a motorbike's does (Vehicle.updateFooting)
        const footTo = bike.footDown ? 1 : 0;
        const footStep = dt / Vehicle.FOOT_S;
        this.foot = this.foot === undefined ? footTo : this.foot + Math.max(-footStep, Math.min(footStep, footTo - this.foot));
        // On foot beside it (the climb): blended over WALK.blendS, at once when the bicycle has just been reset
        const W = HillRider.WALK;
        const walkTo = bike.walking && !bike.crashed ? 1 : 0;
        if (this.ridden !== bike || this.rides !== bike.rides) this.walking = walkTo;
        this.ridden = bike;
        this.rides = bike.rides;
        this.walking = (this.walking || 0) + Math.max(-dt / W.blendS, Math.min(dt / W.blendS, walkTo - (this.walking || 0)));
        const walk = this.walking * this.walking * (3 - 2 * this.walking);
        const footShare = this.foot * this.foot * (3 - 2 * this.foot) * (1 - walk);
        // Down after a fall: laid over to the side it went, over 0.45 s
        const fallTo = bike.crashed ? 1 : 0;
        const downStep = dt / 0.45;
        this.down = this.down === undefined ? fallTo : this.down + Math.max(-downStep, Math.min(downStep, fallTo - this.down));
        const fallSide = Math.sign(v.crashAngle || v.leanAngle || 1);
        const roll = bike.crashed || this.down > 0
            ? fallSide * 1.35 * this.down + v.leanAngle * (1 - this.down)
            : v.leanAngle - Vehicle.LEFT * (Vehicle.FOOT_LEAN * footShare + W.leanRad * walk);
        this.group.rotation.set(Math.atan(-along) + bike.pitch, bike.yaw, roll, 'YXZ');
        // The wheelie: the frame turned nose up about the rear axle, the rear tyre kept on the ground
        const w = bike.wheelie;
        s.q = s.q || new THREE.Quaternion();
        s.q.setFromAxisAngle(Vehicle.AXLE, -w);
        this.frame.quaternion.copy(s.q);
        s.rear = s.rear || new THREE.Vector3();
        s.rear.set(0, this.rest.wheel_rear.y, this.rest.wheel_rear.z);
        this.frame.position.copy(s.rear).sub(s.toe.copy(s.rear).applyQuaternion(s.q));
        this.group.updateMatrixWorld(true);

        this.spin.front = (this.spin.front + bike.speed * dt / this.radius.front) % (2 * Math.PI);
        this.spin.rear = (this.spin.rear + bike.speed * dt / this.radius.rear) % (2 * Math.PI);
        this.parts.wheel_front.rotation.x = this.spin.front;
        this.parts.wheel_rear.rotation.x = this.spin.rear;
        this.parts.cranks.rotation.x = bike.crank;
        // Off the bicycle in a fall: the boy has his own place and pose, the motorbike rider's fall (Vehicle.riderFall)
        if (v.riderFall && v.riderFall.on) {
            this.fall(v);
            this.parts.steer.quaternion.identity();
            return;
        }
        if (this.fallen) this.remount();
        this.steer(v.barsDrawn ? v.barsDrawn() : 0, bike.footDown ? 0 : v.leanAngle, walk);

        const out = HillRider.LEGS_OUT;
        const legsOut = bike.legs * bike.legs * (3 - 2 * bike.legs);
        // The legs' own life while out: the time, the cobbles' bounce after a lag
        this.t = (this.t || 0) + dt;
        this.legBounce = (this.legBounce || 0) + (bike.bounce - (this.legBounce || 0)) * Math.min(1, dt / out.lagS);
        this.tuck = this.tuck || { l: 0, r: 0 };
        this.tucked = this.tucked || { l: false, r: false };
        for (const leg of this.legs) {
            // The low side's leg back on its pedal while he leans over (a lean to the right, +, drops the leg on -x)
            const low = -leg.side * v.leanAngle;
            this.tucked[leg.tag] = low > (this.tucked[leg.tag] ? out.untuckRad : out.tuckRad);
            const tuckStep = dt / out.tuckS;
            const t = this.tuck[leg.tag] = Math.max(0, Math.min(1, this.tuck[leg.tag] + (this.tucked[leg.tag] ? tuckStep : -tuckStep)));
            const legsShare = legsOut * (1 - t * t * (3 - 2 * t));
            // The pedal at its crank's angle, level whatever the angle
            const a = bike.crank + leg.start;
            leg.pedalPart.position.set(leg.pedalX, this.bb.y - Math.cos(a) * leg.crank, this.bb.z - Math.sin(a) * leg.crank);
            // The ankle on the pedal, or out to the side, and between the two as the pose changes
            const on = s.ankle.copy(leg.pedalPart.position).add(s.toe.fromArray(HillRider.ANKLE_ON_PEDAL));
            const pose = bike.legPose[leg.tag];
            // Held out the leg is one straight line from the hip (its knee bent about 10 degrees at most, out.reach): the
            // sway, the bounce and the balance move its direction, never its length
            const length = (leg.upper + leg.lower) * out.reach;
            s.out.set(pose.spread * leg.side, pose.drop, pose.ahead).normalize().multiplyScalar(length);
            const phase = leg.side > 0 ? 0 : 1.9;
            s.out.x += Math.sin(this.t * 2 * Math.PI * out.swayHz + phase) * out.swayM * leg.side;
            s.out.y += Math.sin(this.t * 2 * Math.PI * out.swayHz * 0.7 + phase * 1.3) * out.swayM * 0.6
                + (this.legBounce - bike.bounce) * out.bounceGain + leg.side * bike.lean * out.leanGain;
            s.out.setLength(length).add(leg.hip);
            on.lerp(s.out, legsShare);
            // The left foot put down on the cobbles at its own place, FOOT_OUT out from the frame and FOOT_AHEAD ahead
            // of the pedals, never under the ground there
            const down = leg.side === Vehicle.LEFT ? footShare * (1 - legsShare) : 0;
            if (down > 0) {
                s.foot = s.foot || new THREE.Vector3();
                s.foot.set(leg.side * Vehicle.FOOT_OUT, 0, this.bb.z + Vehicle.FOOT_AHEAD);
                this.frame.localToWorld(s.foot);
                lane.project(s.foot.x, s.foot.z, bike.s, s.footAt || (s.footAt = {}));
                s.foot.y = lane.sample(s.footAt.s).y + lane.cobble(s.footAt.s, s.footAt.across) + HillRider.ANKLE_ON_PEDAL[1];
                this.frame.worldToLocal(s.foot);
                on.lerp(s.foot, down);
            }
            // On foot: the hip where his body has it, the foot at its place in the step on the cobbles
            const hip = walk > 0 ? s.hip.copy(leg.hip).sub(this.rest.boy).applyQuaternion(this.boyQ).add(this.boyAt) : leg.hip;
            if (walk > 0) on.lerp(this.step(leg, bike, lane, s.walkFoot), walk);
            // The knee bends forward over the pedal; held out straight, any pole will do, so it turns with the leg
            s.pole.set(0.15 * leg.side * (1 + legsShare * 3 + down * 2), 0.3 + legsShare * 0.5, 1);
            HillRider.knee(hip, on, leg.upper, leg.lower, s.pole, s.knee);
            s.up.set(0, 0, 1);
            this.point(leg.thigh, hip, s.knee, s.up);
            this.point(leg.shin, s.knee, on, s.up);
            // The boot along the pedal, or its toe up and out with the leg
            s.toe.set(0.25 * leg.side * legsShare, Math.sin(pose.toe) * legsShare, 1 - legsShare * (1 - Math.cos(pose.toe))).normalize();
            s.up.set(0, 1, 0).lerp(s.out.set(leg.side * 0.4, 0.2, -0.9), legsShare).normalize();
            leg.foot.position.copy(on);
            s.z.copy(s.toe);
            s.x.crossVectors(s.up, s.z).normalize();
            s.y.crossVectors(s.z, s.x);
            s.m.makeBasis(s.x, s.y, s.z);
            leg.foot.quaternion.setFromRotationMatrix(s.m);
        }
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { HillRider };
