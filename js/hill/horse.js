// HillHorse: the heavy horse and its cart that come up the lane (HillDay's hazard, js/hill/day.js), drawn from
// assets/hill/horse.glb (tools/blender/hill_horse.py) and posed here each frame.
//
// The walk is the horse's own four-beat walk: the hooves land one at a time, left hind, left fore, right hind, right
// fore, a quarter of a stride apart (GAIT.order), each on the ground for `duty` of the stride. The stride is `strideM`
// long and the cycle runs at the speed over it, so a hoof on the ground stays where it landed: it moves back under the
// horse at the horse's own speed. A leg is put together from its top (the elbow or the stifle) to the fetlock by two
// bones that bend as a horse's do (the knee forward, the hock back), the pastern and hoof below flat on the ground in
// the stance and curled back as the leg swings. The head nods with the stride, the body rises and falls a little, the
// tail swings and the ears turn now and then.
//
// Stood still (at the top of the lane) the horse breathes, rests a hind leg and shifts its weight from one to the
// other, and now and then tosses its head or stamps a fore hoof (STAND). The cart's wheels turn at the speed over
// their radius, the bed rocks on the cobbles and follows the shafts up and down with the horse, and the carter sways
// with it. Near the camera the detailed model is drawn, past `farM` the plain one.
class HillHorse {
    static get FILE() { return 'assets/hill/horse.glb'; }

    // strideM: one full stride; duty: the share of it each hoof is on the ground; order: when each hoof lands, as a
    // share of the stride; pivotM: how far over the top of the leg (the elbow, the stifle) the shoulder or hip is that
    // it swings about, and `swing` how much of the hoof's angle from there it takes; lift: how high a hoof swings (fore,
    // hind); sinkM: how much lower the body is carried than the straight legs would hold it (so they are never quite
    // straight and the bob never stretches them); bobM: the body's rise and fall; nodRad: the
    // head's nod; tailRad: the tail's swing; earS: the mean time between the ears' turns; settleS: how long a leg
    // takes to step back under the horse when it stops
    static get GAIT() {
        return Object.freeze({
            strideM: 1.6, duty: 0.62, pivotM: 0.45, swing: 0.75, sinkM: 0.03, order: { hind_l: 0, fore_l: 0.25, hind_r: 0.5, fore_r: 0.75 }, lift: { fore: 0.15, hind: 0.11 },
            bobM: 0.014, nodRad: 0.055, tailRad: 0.12, earS: 3.5, settleS: 0.45, movingMs: 0.05
        });
    }

    // Stood still: the breath (hz, share of the barrel), the rested hind leg (held restS, the hip dropped hipRad), the
    // head tossed or a fore hoof stamped about every tossS
    static get STAND() {
        return Object.freeze({ breathHz: 0.22, breath: 0.006, restS: 7, hipRad: 0.025, tossS: 9, tossRad: 0.32, stampM: 0.09 });
    }

    // The cart: the wheels' radius, how much the bed rocks (rad) on the cobbles, the carter's sway; farM: the distance
    // past which the plain model is drawn; modelZ: the model moved forward so the horse and cart stand about its middle
    static get CART() {
        return Object.freeze({ wheelM: 0.62, rockRad: 0.012, rockHz: 2.3, swayRad: 0.02, farM: 40, modelZ: 0.8 });
    }

    static get LEGS() { return ['fore_l', 'fore_r', 'hind_l', 'hind_r']; }

    // The pastern's slope forward from upright on the ground, and the hoof's height (as the model is built)
    static get PASTERN_RAD() { return Math.atan2(0.05, 0.13); }
    static get HOOF_M() { return 0.07; }

    // The middle joint of a two-bone limb from `top` to `end`, the bones `upper` and `lower` long, bent towards `pole`
    static knee(top, end, upper, lower, pole, out) {
        const dx = end.x - top.x, dy = end.y - top.y, dz = end.z - top.z;
        const reach = Math.hypot(dx, dy, dz) || 1e-6;
        const d = Math.min(reach, upper + lower - 1e-4);
        const a = (upper * upper - lower * lower + d * d) / (2 * d);
        const h = Math.sqrt(Math.max(0, upper * upper - a * a));
        const ux = dx / reach, uy = dy / reach, uz = dz / reach;
        const along = pole.x * ux + pole.y * uy + pole.z * uz;
        let px = pole.x - along * ux, py = pole.y - along * uy, pz = pole.z - along * uz;
        const pl = Math.hypot(px, py, pz) || 1;
        px /= pl; py /= pl; pz /= pl;
        return out.set(top.x + ux * a + px * h, top.y + uy * a + py * h, top.z + uz * a + pz * h);
    }

    // `model` the loaded file (SceneAssets.loadModel)
    constructor(model) {
        this.group = new THREE.Group();
        this.group.name = 'hill-horse';
        this.rigs = [];
        for (const name of ['lod0', 'lod1']) {
            const lod = model.groups && model.groups.get(name);
            if (!lod) throw new Error(`${HillHorse.FILE} lacks ${name}`);
            const rig = this.rig(lod);
            rig.root.name = `hill-horse-${name}`;
            this.group.add(rig.root);
            this.rigs.push(rig);
        }
        this.rigs[1].root.visible = false;
        this.t = 0;
        this.phase = 0;
        this.moving = 0;
        this.wheel = 0;
        this.rand = HillHorse.seeded(73);
        this.ears = { l: 0, r: 0, next: 1.5, which: 'l', to: 0 };
        this.stand = { rest: 'hind_l', restT: 0, toss: 0, tossNext: 4, stamp: null };
        this.hooves = {};
        this.scratch = { a: new THREE.Vector3(), b: new THREE.Vector3(), knee: new THREE.Vector3(), pole: new THREE.Vector3(), y: new THREE.Vector3(),
            z: new THREE.Vector3(), x: new THREE.Vector3(), fet: new THREE.Vector3(), m: new THREE.Matrix4(), front: new THREE.Vector3(0, 0, 1), q: new THREE.Quaternion() };
    }

    // One level's pivots, its parts hung as the horse's body is: the neck on the body, the head on the neck, the ears on
    // the head, the tail on the body; the legs and the cart's parts on the root, posed in its space
    rig(lod) {
        const root = new THREE.Group(), model = new THREE.Group();
        model.position.z = HillHorse.CART.modelZ;
        root.add(model);
        const parts = {}, places = {};
        for (const [name, primitives] of lod.meshes) {
            const pivot = new THREE.Group();
            pivot.name = name;
            places[name] = lod.places.get(name).clone();
            for (const { geometry, material } of primitives) {
                const mesh = new THREE.Mesh(geometry, material);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                pivot.add(mesh);
            }
            parts[name] = pivot;
        }
        const need = ['body', 'neck', 'head', 'ear_l', 'ear_r', 'tail', 'cart_bed', 'wheel_l', 'wheel_r', 'driver',
            ...HillHorse.LEGS.flatMap(leg => ['upper', 'lower', 'hoof'].map(bit => `${leg}_${bit}`))];
        const missing = need.filter(name => !parts[name]);
        if (missing.length) throw new Error(`${HillHorse.FILE} lacks ${missing.join(', ')}`);
        const hang = (child, parent) => {
            parts[child].position.copy(places[child]).sub(parent ? places[parent] : new THREE.Vector3());
            (parent ? parts[parent] : model).add(parts[child]);
        };
        hang('body');
        hang('neck', 'body');
        hang('head', 'neck');
        hang('ear_l', 'head');
        hang('ear_r', 'head');
        hang('tail', 'body');
        hang('cart_bed');
        hang('driver', 'cart_bed');
        hang('wheel_l');
        hang('wheel_r');
        for (const leg of HillHorse.LEGS) for (const bit of ['upper', 'lower', 'hoof']) hang(`${leg}_${bit}`);
        // Each leg's lengths and rest places, from the pivots
        const legs = {};
        for (const leg of HillHorse.LEGS) {
            const top = places[`${leg}_upper`], joint = places[`${leg}_lower`], fet = places[`${leg}_hoof`];
            legs[leg] = { top, joint, fet, upper: top.distanceTo(joint), lower: joint.distanceTo(fet), fore: leg.startsWith('fore'),
                // The hoof's top on the ground at rest: under the fetlock, a little ahead (the pastern's slope), and the
                // pastern's length to it
                rest: new THREE.Vector3(fet.x, HillHorse.HOOF_M, fet.z + 0.05), pastern: Math.hypot(fet.y - HillHorse.HOOF_M, 0.05) };
        }
        return { root, model, parts, places, legs };
    }

    // Draws the horse and cart for `dt` seconds at `speedMs` along the lane, the camera at `eye` (world) for the level
    // of detail
    update(dt, speedMs, eye = null) {
        const G = HillHorse.GAIT, S = HillHorse.STAND, C = HillHorse.CART;
        dt = Math.max(0, Math.min(0.1, dt || 0));
        this.t += dt;
        const v = Math.max(0, speedMs || 0);
        const movingTo = v > G.movingMs ? 1 : 0;
        this.moving += Math.max(-dt / G.settleS, Math.min(dt / G.settleS, movingTo - this.moving));
        // The stride's clock: at the speed over the stride, so a hoof on the ground stays put
        this.phase = (this.phase + v * dt / G.strideM) % 1;
        this.wheel = (this.wheel + v * dt / C.wheelM) % (2 * Math.PI);
        this.lifeStep(dt, v);
        if (eye) {
            const at = this.group.getWorldPosition(this.scratch.a);
            const far = at.distanceTo(eye) > C.farM;
            this.rigs[0].root.visible = !far;
            this.rigs[1].root.visible = far;
        }
        for (const rig of this.rigs) if (rig.root.visible) this.pose(rig, v);
    }

    // The life of a horse stood still, and the ears and tail at any time
    lifeStep(dt, v) {
        const S = HillHorse.STAND, G = HillHorse.GAIT, ears = this.ears, stand = this.stand;
        ears.next -= dt;
        if (ears.next <= 0) {
            ears.which = this.rand() < 0.5 ? 'l' : 'r';
            ears.to = (this.rand() - 0.3) * 0.9;
            ears.next = G.earS * (0.4 + this.rand() * 1.2);
        }
        ears[ears.which] += (ears.to - ears[ears.which]) * Math.min(1, dt * 6);
        const other = ears.which === 'l' ? 'r' : 'l';
        ears[other] += (0 - ears[other]) * Math.min(1, dt * 2);
        if (this.moving > 0.5) {
            stand.restT = 0;
            stand.toss = 0;
            stand.stamp = null;
            return;
        }
        stand.restT += dt;
        if (stand.restT > S.restS) {
            stand.restT = 0;
            stand.rest = stand.rest === 'hind_l' ? 'hind_r' : 'hind_l';
        }
        stand.tossNext -= dt;
        if (stand.tossNext <= 0 && stand.toss <= 0 && !stand.stamp) {
            if (this.rand() < 0.55) stand.toss = 1;
            else stand.stamp = { leg: this.rand() < 0.5 ? 'fore_l' : 'fore_r', t: 0 };
            stand.tossNext = S.tossS * (0.6 + this.rand() * 0.8);
        }
        if (stand.toss > 0) stand.toss = Math.max(0, stand.toss - dt / 0.9);
        if (stand.stamp) {
            stand.stamp.t += dt / 0.5;
            if (stand.stamp.t >= 1) stand.stamp = null;
        }
    }

    // Where a leg's hoof is, in the model's space, and how its hoof is turned (+ the toe up): `u` its place in the stride
    hoof(leg, rig, v, out) {
        const G = HillHorse.GAIT, S = HillHorse.STAND, L = rig.legs[leg];
        const u = ((this.phase - G.order[leg]) % 1 + 1) % 1, reach = G.strideM * G.duty;
        let along, lift = 0, curl = 0;
        if (u < G.duty) {
            along = reach * (0.5 - u / G.duty);
        } else {
            const w = (u - G.duty) / (1 - G.duty), e = w * w * (3 - 2 * w);
            along = reach * (-0.5 + e);
            // (a fore hoof lifts most early in its swing, a hind one in the middle)
            const peak = L.fore ? Math.sin(Math.PI * Math.pow(w, 0.75)) : Math.sin(Math.PI * w);
            lift = (L.fore ? G.lift.fore : G.lift.hind) * peak;
            curl = (L.fore ? 1.3 : 0.9) * Math.sin(Math.PI * Math.min(1, w * 1.25));
        }
        const m = this.moving;
        along *= m;
        lift *= m;
        curl *= m;
        // Stood: a hind leg rested on its toe, a fore hoof stamped
        const stand = this.stand;
        if (m < 1) {
            const still = 1 - m;
            if (leg === stand.rest) {
                const r = Math.min(1, Math.min(stand.restT, S.restS - stand.restT) / 0.8);
                lift += 0.05 * r * still;
                along += 0.06 * r * still;
                curl += -0.5 * r * still;
            }
            if (stand.stamp && stand.stamp.leg === leg) {
                const k = Math.sin(Math.PI * stand.stamp.t);
                lift += S.stampM * k * still;
                curl += 0.6 * k * still;
            }
        }
        out.set(L.rest.x, L.rest.y + lift, L.rest.z + along);
        return curl;
    }

    // Poses one level's rig: the legs from the hooves up, the body, the head and neck, the tail, the ears, the cart
    pose(rig, v) {
        const G = HillHorse.GAIT, S = HillHorse.STAND, C = HillHorse.CART, P = rig.parts, s = this.scratch, m = this.moving;
        const cycle = this.phase * 2 * Math.PI;
        // The body rises and falls twice a stride, and breathes stood still
        const bob = G.bobM * Math.cos(2 * cycle) * m;
        const breath = Math.sin(this.t * 2 * Math.PI * S.breathHz) * S.breath * (1 - m);
        const hip = this.stand.rest === 'hind_l' ? 1 : -1;
        const rested = (1 - m) * Math.min(1, Math.min(this.stand.restT, S.restS - this.stand.restT) / 0.8);
        P.body.position.copy(rig.places.body);
        P.body.position.y += bob - G.sinkM;
        P.body.rotation.set(0.006 * Math.sin(2 * cycle + 0.8) * m, 0, hip * S.hipRad * rested + 0.008 * Math.sin(cycle) * m);
        P.body.scale.set(1 + breath, 1 + breath * 0.6, 1);
        // The head nods with the stride (down as each fore hoof bears the weight), and tossed stood still
        const toss = this.stand.toss > 0 ? Math.sin(Math.PI * (1 - this.stand.toss)) : 0;
        P.neck.rotation.set(G.nodRad * Math.sin(2 * cycle - 0.6) * m - S.tossRad * toss * 0.6, 0.03 * Math.sin(this.t * 0.3), 0);
        P.head.rotation.set(0.5 * G.nodRad * Math.sin(2 * cycle - 1.1) * m - S.tossRad * toss * 0.4, 0, 0);
        P.tail.rotation.set(0.05 + 0.04 * Math.sin(this.t * 0.9), 0, G.tailRad * Math.sin(this.t * 1.3 + 0.5 * cycle));
        P.ear_l.rotation.set(0, -this.ears.l, 0);
        P.ear_r.rotation.set(0, this.ears.r, 0);
        P.body.updateMatrix();
        // The legs: each top where the body carries it, the fetlock over the hoof, two bones between
        for (const leg of HillHorse.LEGS) {
            const L = rig.legs[leg];
            const hoof = s.b, curl = this.hoof(leg, rig, v, hoof);
            // The top swings with the leg about the shoulder or the hip above it (G.swing), so the leg reaches the hoof
            // fore and aft with its joints bent
            const reach = Math.atan2(hoof.z - L.rest.z, G.pivotM) * G.swing;
            const top = s.a.set(L.top.x, L.top.y - G.pivotM * (1 - Math.cos(reach)), L.top.z + G.pivotM * Math.sin(reach));
            top.sub(rig.places.body).applyMatrix4(P.body.matrix);
            // The fetlock over the hoof, the pastern sloped forward on the ground and turned back with the curl
            const slope = HillHorse.PASTERN_RAD - curl;
            const fet = s.fet.set(hoof.x, hoof.y + L.pastern * Math.cos(slope), hoof.z - L.pastern * Math.sin(slope));
            s.pole.set(0, 0, L.fore ? 1 : -1);
            HillHorse.knee(top, fet, L.upper, L.lower, s.pole, s.knee);
            this.point(P[`${leg}_upper`], top, s.knee);
            this.point(P[`${leg}_lower`], s.knee, fet);
            P[`${leg}_hoof`].position.copy(fet);
            P[`${leg}_hoof`].rotation.set(curl, 0, 0);
        }
        // The cart: the wheels turn on the axle; the bed follows the shafts up and down with the horse's body and rocks
        // on the cobbles; the carter sways with it
        P.wheel_l.rotation.set(this.wheel, 0, 0);
        P.wheel_r.rotation.set(this.wheel, 0, 0);
        const tug = rig.places.cart_bed.distanceTo(rig.places.body) || 3;
        const rock = C.rockRad * (Math.sin(this.t * 2 * Math.PI * C.rockHz) * 0.6 + Math.sin(this.t * 2 * Math.PI * C.rockHz * 1.7 + 1.3) * 0.4) * Math.min(1, v / 0.8);
        P.cart_bed.rotation.set(-Math.atan2(bob, tug), 0, rock);
        P.driver.rotation.set(0.015 * Math.sin(2 * cycle + 0.4) * m, 0, -rock * 1.5 + C.swayRad * Math.sin(this.t * 1.1) * 0.3);
    }

    // Turns `part` so that its local -y runs from `from` to `to`, its +z towards the front
    point(part, from, to) {
        const s = this.scratch;
        s.y.subVectors(from, to).normalize();
        s.z.copy(s.front).addScaledVector(s.y, -s.front.dot(s.y)).normalize();
        s.x.crossVectors(s.y, s.z);
        s.m.makeBasis(s.x, s.y, s.z);
        part.quaternion.setFromRotationMatrix(s.m);
        part.position.copy(from);
    }

    static seeded(seed) {
        let state = seed >>> 0;
        return () => {
            state = (state * 1664525 + 1013904223) >>> 0;
            return state / 4294967296;
        };
    }
}
