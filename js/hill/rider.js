// The hill ride's bicycle and boy as drawn (assets/hill/bicycle.glb, tools/blender/hill_bike.py): the file's parts
// hung on pivots, set each frame from the bicycle's state (js/hill/bicycle.js). The wheels spin by the road speed, the
// cranks by their own angle, the pedals stay level, and each leg is put together from hip to ankle: on its pedal, or
// straight out to the side when the boy has taken his feet off. Nothing is allocated a frame.
class HillRider {
    static get FILE() { return 'assets/hill/bicycle.glb'; }

    // How the legs stand when out: the direction from the hip, for the leg on +x (mirrored for the other), and the
    // way the boot's toe points; the share of the leg's length they reach
    // The pose itself comes from the bicycle (HillBicycle.LEGS, legPose); here how it lives while held out: a slow sway
    // (swayM at swayHz, each leg its own phase), the cobbles' bounce answered after lagS, times bounceGain, and a
    // balance against the lean (leanGain m for each rad)
    static get LEGS_OUT() {
        return Object.freeze({ reach: 0.985, swayM: 0.05, swayHz: 0.6, lagS: 0.08, bounceGain: 5, leanGain: 0.25 });
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
        const need = ['wheel_front', 'wheel_rear', 'cranks', 'pedal_l', 'pedal_r', 'thigh_l', 'thigh_r', 'shin_l', 'shin_r', 'foot_l', 'foot_r', 'boy'];
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
        this.scratch = { ankle: new THREE.Vector3(), out: new THREE.Vector3(), knee: new THREE.Vector3(), pole: new THREE.Vector3(), toe: new THREE.Vector3(), up: new THREE.Vector3(), m: new THREE.Matrix4(), x: new THREE.Vector3(), y: new THREE.Vector3(), z: new THREE.Vector3() };
        this.spin = { front: 0, rear: 0 };
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

    // Sets every part from the bicycle's state (HillBicycle) on `lane` (HillLane). The frame is placed where the game's
    // bike is, along its heading, pitched with the lane's fall along that heading, leaned as the bike leans (+ to its
    // right, as Vehicle draws it), lifted about the rear axle in a wheelie, leaned onto a foot when it stands, and laid
    // over on its side when it falls
    update(bike, lane, dt) {
        const s = this.scratch, v = bike.vehicle;
        const p = lane.sample(bike.s, s.lane || (s.lane = {}));
        const along = p.grade * Math.cos(bike.yaw - p.heading);
        this.group.position.set(v.position.x, p.y + bike.bounce, v.position.z);
        // The foot down: the frame leans onto the left foot over FOOT_S, as a motorbike's does (Vehicle.updateFooting)
        const footTo = bike.footDown ? 1 : 0;
        const footStep = dt / Vehicle.FOOT_S;
        this.foot = this.foot === undefined ? footTo : this.foot + Math.max(-footStep, Math.min(footStep, footTo - this.foot));
        const footShare = this.foot * this.foot * (3 - 2 * this.foot);
        // Down after a fall: laid over to the side it went, over 0.45 s
        const fallTo = bike.crashed ? 1 : 0;
        const downStep = dt / 0.45;
        this.down = this.down === undefined ? fallTo : this.down + Math.max(-downStep, Math.min(downStep, fallTo - this.down));
        const fallSide = Math.sign(v.crashAngle || v.leanAngle || 1);
        const roll = bike.crashed || this.down > 0
            ? fallSide * 1.35 * this.down + v.leanAngle * (1 - this.down)
            : v.leanAngle - Vehicle.LEFT * Vehicle.FOOT_LEAN * footShare;
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

        const out = HillRider.LEGS_OUT;
        const legsShare = bike.legs * bike.legs * (3 - 2 * bike.legs);
        // The legs' own life while out: the time, the cobbles' bounce after a lag
        this.t = (this.t || 0) + dt;
        this.legBounce = (this.legBounce || 0) + (bike.bounce - (this.legBounce || 0)) * Math.min(1, dt / out.lagS);
        for (const leg of this.legs) {
            // The pedal at its crank's angle, level whatever the angle
            const a = bike.crank + leg.start;
            leg.pedalPart.position.set(leg.pedalX, this.bb.y - Math.cos(a) * leg.crank, this.bb.z - Math.sin(a) * leg.crank);
            // The ankle on the pedal, or out to the side, and between the two as the pose changes
            const on = s.ankle.copy(leg.pedalPart.position).add(s.toe.fromArray(HillRider.ANKLE_ON_PEDAL));
            const pose = bike.legPose[leg.tag];
            const length = (leg.upper + leg.lower) * (out.reach - pose.bend);
            s.out.set(pose.spread * leg.side, pose.drop, pose.ahead).normalize().multiplyScalar(length).add(leg.hip);
            const phase = leg.side > 0 ? 0 : 1.9;
            s.out.x += Math.sin(this.t * 2 * Math.PI * out.swayHz + phase) * out.swayM * leg.side;
            s.out.y += Math.sin(this.t * 2 * Math.PI * out.swayHz * 0.7 + phase * 1.3) * out.swayM * 0.6
                + (this.legBounce - bike.bounce) * out.bounceGain + leg.side * bike.lean * out.leanGain;
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
            // The knee bends forward over the pedal; held out straight, any pole will do, so it turns with the leg
            s.pole.set(0.15 * leg.side * (1 + legsShare * 3 + down * 2), 0.3 + legsShare * 0.5, 1);
            HillRider.knee(leg.hip, on, leg.upper, leg.lower, s.pole, s.knee);
            s.up.set(0, 0, 1);
            this.point(leg.thigh, leg.hip, s.knee, s.up);
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
