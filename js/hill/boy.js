// The hill ride's boy as drawn: one skinned body (THREE.SkinnedMesh) built here from code, on the rig of the bicycle's
// model (assets/hill/bicycle.glb: the hips, thighs, shins, feet, upper arms, forearms, head and apron pivots, which
// HillRider poses) and bones of its own hung on them: the chest, the breath, the collar bones, the skull, the eyes and
// their lids, the hands and every finger joint, and the scarf's two ends. Built once a page, from numbers only: no
// picture is read for any part of him (his face and every finish are drawn by HillBoyMaps from noise and shapes), and
// he carries no text. Two levels of detail share the one skeleton; the far one is drawn past FAR.fromM.
//
// His shape is his clothes over a boy's build, 1.6 m and 40 kg: a grey knitted jumper (ribbed at the waist, cuffs and
// collar, full at the shoulders and elbows), a dark scarf knotted at the throat with two fringed ends, a long linen
// apron with a frayed hem, dark wool breeches into black leather boots laced up the front, dark knitted gloves, and a
// flat cap of tweed with a short peak and a button, pulled low over his brow, his hair short under it.
//
// His life (live, after): he breathes, harder when he works and when he is tired; he blinks; his eyes and his head go
// where he looks (up the lane, the next door that waits, the door he throws at, and back at it once he is past); he
// shifts his weight when he stands; he balances on the saddle; he rises out of it when he pushes hard; his hands close
// on the grips and open to throw; the scarf's ends swing and stream back at speed and the apron flaps over the bumps
// (a verlet chain and a damped spring, stepped at a fixed rate, so a slow frame changes nothing). Nothing is allocated
// a frame.
class HillBoy {
    // The rig's own bones, as [name, parent, place in the frame at rest (m)]: the place is worked from the model's
    // joints at load (see bones())
    static get FAR() { return Object.freeze({ fromM: 13, backM: 11 }); }

    // How far his chest bends on past his hips' bend on foot (rad): a rounded back over the bars
    static get STOOP() { return 0.26; }

    // His cost: the most triangles of the near and the far body (each one draw a finish, seven at most)
    static get BUDGET() { return Object.freeze({ near: 52000, far: 10000 }); }

    // The breath: rests and works (Hz, and the chest's swell at each); how fast effort comes and goes (s)
    static get BREATH() { return Object.freeze({ restHz: 0.24, workHz: 0.62, restSwell: 0.012, workSwell: 0.042, riseS: 1.5, fallS: 6 }); }

    // The blink: every 1.8 to 5.5 s, closing over closeS and opening over openS; one in five is a double
    static get BLINK() { return Object.freeze({ fromS: 1.8, toS: 5.5, closeS: 0.06, openS: 0.11, doubleShare: 0.2 }); }

    // Where he looks: the head turns `share` of the way the eyes must turn (at most headRad), the chest a further
    // share past chestFromRad (at most chestRad: to look back); the eyes the rest (at most eyeRad); eased over easeS
    static get LOOK() { return Object.freeze({ share: 0.62, headRad: 1.05, chestFromRad: 0.9, chestRad: 0.35, eyeRad: 0.5, eyePitchRad: 0.32, easeS: 0.28, aheadM: 14, doorM: 34 }); }

    // The throw (HillRider.throwAt): the hand to the basket by reachS, out to the side by flingS (the loaf leaves at
    // releaseS), back on the grip by backS; the head looks at the door for lookS after
    static get THROW() { return Object.freeze({ reachS: 0.16, releaseS: 0.3, flingS: 0.36, backS: 0.62, lookS: 1.6 }); }

    // The scarf: wound round his neck, its ends crossed over his chest and tucked under the apron's band tuckX each
    // side of his middle, their tails hanging out over the apron: links of linkM, the long tail's and the short's
    // count, the air's drag (/s), damping (/s), the step (s), the tails' width and the crossed bands' width (m)
    static get SCARF() { return Object.freeze({ linkM: 0.045, long: 4, short: 3, drag: 2.6, damp: 0.8, stepS: 1 / 120, wideM: 0.07, bandM: 0.125, tuckX: 0.07 }); }

    // The apron's own swing over its hang (HillRider.APRON): its spring (rad/s2 a rad), damping (/s), how the
    // frame's braking and the cobbles' bounce drive it, the flutter with speed; never back into his legs
    static get APRON_SWING() { return Object.freeze({ spring: 46, damp: 5.5, brake: 0.05, bounce: 2.6, flutter: 0.0016, mostRad: 0.35, swayRad: 0.07 }); }

    constructor(rider) {
        this.rider = rider;
        const P = rider.parts, R = rider.rest;
        this.bones = [];
        this.byName = {};
        const add = (name, bone) => { bone.name = bone.name || name; this.byName[name] = this.bones.length; this.bones.push(bone); return bone; };
        // The model's own pivots are bones as they are
        for (const name of ['boy', 'head', 'thigh_l', 'thigh_r', 'shin_l', 'shin_r', 'foot_l', 'foot_r', 'upperarm_l', 'upperarm_r', 'forearm_l', 'forearm_r', 'apron_long', 'apron_hem']) {
            if (P[name]) add(name, P[name]);
        }
        this.rest = {};
        // Where each of them is at rest, in the frame
        const at = (part) => {
            const p = new THREE.Vector3();
            let o = part;
            while (o && o !== rider.frame) { p.add(o.position); o = o.parent; }
            return p;
        };
        for (const name of Object.keys(this.byName)) this.rest[name] = at(P[name]);
        const r = this.rest;
        // (the head's centre and the neck's top from the head pivot at the neck's foot)
        const neck = r.head;
        this.headAt = new THREE.Vector3(0, neck.y + 0.136, neck.z + 0.024);
        const place = (name, parent, p) => {
            const bone = new THREE.Bone();
            bone.name = name;
            const parentRest = this.rest[parent] || at(this.byName[parent] !== undefined ? this.bones[this.byName[parent]] : P[parent]);
            bone.position.subVectors(p, parentRest);
            this.bones[this.byName[parent]].add(bone);
            this.rest[name] = p.clone();
            return add(name, bone);
        };
        // The chest: the spine's middle, its breath (a leaf: its swell moves no other bone), the collar bones where
        // the shoulders hang, the head hung on it
        this.chest = place('chest', 'boy', new THREE.Vector3(0, r.boy.y + 0.22, r.boy.z + 0.035));
        this.breath = place('breath', 'chest', this.rest.chest.clone().add(new THREE.Vector3(0, 0.02, 0.01)));
        this.clavicles = ['l', 'r'].map(tag => place(`clavicle_${tag}`, 'chest', r[`upperarm_${tag}`].clone()));
        // The head pivot hangs on the chest, so the neck goes where the chest goes
        const head = P.head;
        head.parent.remove(head);
        this.chest.add(head);
        head.position.subVectors(r.head, this.rest.chest);
        this.skull = place('skull', 'head', new THREE.Vector3(0, neck.y + 0.085, neck.z + 0.005));
        const E = HillBoy.FACE;
        const eyeZ = HillBoy.eyeZ();
        this.eyes = [1, -1].map(side => place(`eye_${side > 0 ? 'l' : 'r'}`, 'skull', this.headAt.clone().add(new THREE.Vector3(side * E.eyeX, E.eyeY, eyeZ))));
        this.lids = [1, -1].map(side => place(`lid_${side > 0 ? 'l' : 'r'}`, 'skull', this.headAt.clone().add(new THREE.Vector3(side * E.eyeX, E.eyeY, eyeZ))));
        // The hands at the wrists, each finger's three joints, and the thumb's
        const H = HillBoy.HAND;
        this.hands = ['l', 'r'].map(tag => {
            const side = tag === 'l' ? 1 : -1, wrist = r[`forearm_${tag}`].clone().add(new THREE.Vector3(0, -H.wristM, 0));
            const hand = place(`hand_${tag}`, `forearm_${tag}`, wrist);
            const fingers = H.fingers.map((f, i) => {
                const joints = [];
                let p = new THREE.Vector3(wrist.x - side * f.x, wrist.y - H.palmM - f.drop, wrist.z + f.z);
                let parent = `hand_${tag}`;
                for (let j = 0; j < 3; j++) {
                    const name = `f${i}${j}_${tag}`;
                    joints.push(place(name, parent, p));
                    parent = name;
                    p = p.clone().add(new THREE.Vector3(0, -f.lengths[j], 0));
                }
                return { joints, tip: p };
            });
            // The thumb from the palm's heel on the inner side (towards his middle), down and across the palm
            const dir = new THREE.Vector3(-side * H.thumb.dir[0], H.thumb.dir[1], H.thumb.dir[2]).normalize();
            let p = new THREE.Vector3(wrist.x - side * H.thumb.base[0], wrist.y + H.thumb.base[1], wrist.z + H.thumb.base[2]);
            let parent = `hand_${tag}`;
            const joints = [];
            for (let j = 0; j < 3; j++) {
                const name = `t${j}_${tag}`;
                joints.push(place(name, parent, p));
                parent = name;
                p = p.clone().addScaledVector(dir, H.thumb.lengths[j]);
            }
            return { tag, side, bone: hand, wrist, fingers, thumb: { joints, dir, tip: p } };
        });
        // The scarf's two tails, where its ends come out from under the apron's band, link by link down over the apron
        // (each a bone of his hips: the chain is simulated in the world and each link set from it)
        const S = HillBoy.SCARF, waist = r.apron_long || new THREE.Vector3(0, r.boy.y + 0.1, r.boy.z + 0.1);
        this.scarf = [[S.long, -1], [S.short, 1]].map(([count, side], end) => {
            const links = [], top = new THREE.Vector3(side * S.tuckX, waist.y + 0.004, HillBoy.frontZ(this, side * S.tuckX, waist.y) + 0.026);
            for (let i = 0; i <= count; i++) links.push(place(`scarf${end}${i}`, 'boy', new THREE.Vector3(top.x, top.y - i * S.linkM, top.z)));
            return { links, count, side, parent: P.boy, points: new Float32Array((count + 1) * 3), prev: new Float32Array((count + 1) * 3), knot: new Float32Array(3), ready: false };
        });
        // The skeleton at rest: every bone at its rest place, none turned, so each one's inverse is its rest place
        // in the frame taken off; the body is bound in the frame's own space (it hangs on the frame)
        this.skeleton = new THREE.Skeleton(this.bones, this.bones.map(b => new THREE.Matrix4().makeTranslation(-this.rest[b.name].x, -this.rest[b.name].y, -this.rest[b.name].z)));
        this.materials = HillBoy.materials();
        this.levels = [1, HillBoy.FAR_DETAIL].map((detail, i) => {
            const shape = HillBoy.shape(this, detail);
            const mesh = new THREE.SkinnedMesh(shape.geometry, this.materials.list);
            mesh.name = i ? 'hill-boy-far' : 'hill-boy';
            mesh.userData.boy = true;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            // (the body leaves the frame in a fall: its bounds are the bones', so it is never culled)
            // (bounds round him on the bicycle, wide enough for his reach; a fall widens them: see after())
            mesh.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.3);
            mesh.visible = i === 0;
            rider.frame.add(mesh);
            mesh.bind(this.skeleton, new THREE.Matrix4());
            if (mesh.morphTargetInfluences) mesh.morphTargetInfluences.fill(0);
            return { mesh, shape };
        });
        this.mesh = this.levels[0].mesh;
        this.pieces = this.levels[0].shape.pieces;
        this.far = false;
        // The life: its clocks, its seeded randomness, the eased look and the springs
        this.random = HillBoy.random(1931);
        this.t = 0;
        this.effort = 0;
        this.breathPhase = 0;
        this.blinkIn = 2;
        this.blinkT = -1;
        this.blinkTwice = false;
        this.lid = 0;
        this.lookYaw = 0;
        this.flick = new Float32Array(2);
        this.curl = { l: 1, r: 1 };
        this.foldShares = new Float32Array(HillBoyShape.FOLDS.length);
        this.lookPitch = 0;
        this.eyeYaw = 0;
        this.eyePitch = 0;
        this.throwT = -1;
        this.throwSide = 0;
        this.lookAtDoorT = 0;
        this.rise = 0;
        this.apron = { flap: 0, flapV: 0, sway: 0, swayV: 0, lastSpeed: 0 };
        this.acc = 0;
        this.scratch = {
            m: new THREE.Matrix4(), mi: new THREE.Matrix4(), q: new THREE.Quaternion(), q2: new THREE.Quaternion(), v: new THREE.Vector3(), w: new THREE.Vector3(),
            a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), x: new THREE.Vector3(), y: new THREE.Vector3(), z: new THREE.Vector3(),
            e: new THREE.Euler(), look: new THREE.Vector3(), head: new THREE.Vector3(), last: new THREE.Vector3(), anchor: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0),
            colliders: new Float32Array(HillBoy.COLLIDERS.length * 4), between: new Float32Array(HillBoy.COLLIDERS.length * 4), knotWorld: new THREE.Vector3(), forward: new THREE.Vector3()
        };
        this.lastColliders = new Float32Array(HillBoy.COLLIDERS.length * 4);
    }

    // His life before the pose (HillRider.update calls it before it turns the body and solves the arms): the effort
    // and the breath, the rise out of the saddle, the balance, the weight shift, where he looks. `ctx`: { walk (0..1
    // on foot), tired (0..1), look (a point in the world, or null), fallen }
    live(dt, bike, ctx) {
        const B = HillBoy.BREATH, v = bike.vehicle, s = this.scratch;
        this.t += dt;
        // The effort: walking the bicycle up (more when tired), pushing hard on the pedals at a crawl, a fall
        let want = 0.08;
        if (ctx.walk > 0.5) want = bike.speed > 0.3 ? 0.6 + 0.4 * (ctx.tired || 0) : 0.5;
        else if (bike.pushing) want = 0.2 + 0.8 * (bike.push || 0) * Math.max(0, Math.min(1, 1 - bike.speed / 9));
        if (bike.crashed) want = 0.75;
        if (dt > 0) this.effort += (want - this.effort) * Math.min(1, dt / (want > this.effort ? B.riseS : B.fallS));
        const e = this.effort;
        this.breathPhase = (this.breathPhase + dt * (B.restHz + (B.workHz - B.restHz) * e)) % 1;
        const swell = (B.restSwell + (B.workSwell - B.restSwell) * e) * (0.5 - 0.5 * Math.cos(this.breathPhase * Math.PI * 2));
        this.breath.scale.set(1 + swell * 0.7, 1 + swell * 0.25, 1 + swell * 1.2);
        this.swell = swell;
        // Out of the saddle when he pushes hard at a crawl (not on foot, not stood, not in a fall)
        const riseTo = !ctx.walk && !ctx.fallen && bike.pushing && (bike.push || 0) > 0.6 && bike.speed < 4.5 && !v.footDown ? 1 : 0;
        if (dt > 0) this.rise += Math.max(-dt / 0.45, Math.min(dt / 0.3, riseTo - this.rise));
        // Where he looks: the point given, or ahead of him along the bicycle
        const look = ctx.look || (s.look.set(0, 1.45, HillBoy.LOOK.aheadM), this.rider.group.localToWorld(s.look));
        this.aim(dt, look, ctx);
        this.blink(dt);
        if (this.throwT >= 0) {
            this.throwT += dt;
            if (this.throwT > HillBoy.THROW.backS) this.throwT = -1;
        }
        if (this.lookAtDoorT > 0) this.lookAtDoorT = Math.max(0, this.lookAtDoorT - dt);
    }

    // The chest's own turn this frame (into `q`): the breath's lift, the rise's lean, the balance on the saddle, the
    // lean into the throw and the turn to look back; `walk` 0..1 on foot, `standing` when stood still
    chestTurn(q, walk) {
        const t = this.t, s = this.scratch;
        const ride = 1 - walk;
        const balanceRoll = ride * (0.011 * Math.sin(t * 2.1) + 0.007 * Math.sin(t * 3.7 + 1.1));
        const balancePitch = ride * 0.008 * Math.sin(t * 1.3 + 0.4) - 0.25 * (this.swell || 0);
        const T = HillBoy.THROW, th = this.throwT;
        const reach = th >= 0 ? (th < T.reachS ? th / T.reachS : th < T.flingS ? 1 - (th - T.reachS) / (T.flingS - T.reachS) * 0.6 : Math.max(0, 0.4 * (1 - (th - T.flingS) / (T.backS - T.flingS)))) : 0;
        // (on foot his back rounds over the bars as the stills have it: the chest bends on past the hips' bend)
        const pitch = balancePitch + 0.13 * this.rise + 0.12 * reach * reach * (3 - 2 * reach) + HillBoy.STOOP * walk;
        const roll = balanceRoll + (th >= 0 ? -0.08 * this.throwSide * Math.sin(Math.min(1, th / T.backS) * Math.PI) : 0);
        s.e.set(pitch, this.chestYaw || 0, roll, 'YXZ');
        return q.setFromEuler(s.e);
    }

    // The head and the eyes turned towards `target` (a point in the world): the head a share of the way, the chest
    // past a quarter turn (to look back over his shoulder), the eyes the rest, each eased; now and then the eyes flick
    aim(dt, target, ctx) {
        const L = HillBoy.LOOK, s = this.scratch, head = this.rider.parts.head;
        if (!head) return;
        head.updateWorldMatrix(true, false);
        s.mi.copy(head.matrixWorld).invert();
        s.v.copy(target).applyMatrix4(s.mi).sub(s.w.copy(this.skull.position).add(s.a.set(0, 0.08, 0.02)));
        const yaw = Math.atan2(s.v.x, s.v.z), pitch = Math.atan2(s.v.y, Math.hypot(s.v.x, s.v.z));
        const k = dt > 0 ? 1 - Math.exp(-dt / L.easeS) : 0, ke = dt > 0 ? 1 - Math.exp(-dt / 0.05) : 0;
        const chestTo = ctx.fallen ? 0 : Math.sign(yaw) * Math.min(L.chestRad, Math.max(0, Math.abs(yaw) - L.chestFromRad) * 0.7);
        const headTo = ctx.fallen ? 0 : HillBoy.clamp(yaw * L.share, L.headRad);
        const pitchTo = HillBoy.clamp(-pitch * 0.45, 0.35);
        this.chestYaw = (this.chestYaw || 0) + (chestTo - (this.chestYaw || 0)) * k;
        this.lookYaw += (headTo - this.lookYaw) * k;
        this.lookPitch += (pitchTo - this.lookPitch) * k;
        // (the eyes' own small flicks, every 0.6 to 2 s)
        this.flickIn = (this.flickIn || 0) - dt;
        if (this.flickIn <= 0) {
            this.flickIn = 0.6 + 1.4 * this.random();
            this.flick[0] = (this.random() - 0.5) * 0.08;
            this.flick[1] = (this.random() - 0.5) * 0.05;
        }
        const f = this.flick;
        const eyeYawTo = HillBoy.clamp(yaw - this.lookYaw - this.chestYaw + f[0], L.eyeRad), eyePitchTo = HillBoy.clamp(-pitch - this.lookPitch + f[1], L.eyePitchRad);
        this.eyeYaw += (eyeYawTo - this.eyeYaw) * ke;
        this.eyePitch += (eyePitchTo - this.eyePitch) * ke;
        s.e.set(this.lookPitch, this.lookYaw, 0, 'YXZ');
        this.skull.quaternion.setFromEuler(s.e);
        s.e.set(this.eyePitch, this.eyeYaw, 0, 'YXZ');
        for (const eye of this.eyes) eye.quaternion.setFromEuler(s.e);
    }

    // The blink: the upper lids down and up again now and then (a double now and then), and lower when he looks down
    blink(dt) {
        const K = HillBoy.BLINK, F = HillBoy.FACE;
        if (this.blinkT < 0) {
            this.blinkIn -= dt;
            if (this.blinkIn <= 0) {
                this.blinkT = 0;
                this.blinkTwice = this.random() < K.doubleShare;
                this.blinkIn = K.fromS + (K.toS - K.fromS) * this.random();
            }
        } else {
            this.blinkT += dt;
            if (this.blinkT > K.closeS + K.openS) {
                this.blinkT = this.blinkTwice ? 0 : -1;
                this.blinkTwice = false;
            }
        }
        const b = this.blinkT < 0 ? 0 : this.blinkT < K.closeS ? this.blinkT / K.closeS : 1 - (this.blinkT - K.closeS) / K.openS;
        this.lid = b;
        const down = Math.max(0, this.eyePitch) * 0.7 + (this.effort > 0.7 ? 0.1 : 0);
        const angle = Math.min(F.lidShutRad, down + (F.lidShutRad - down) * b);
        for (const lid of this.lids) lid.quaternion.setFromAxisAngle(this.scratch.a.set(1, 0, 0), angle);
    }

    // The throw begins: his `side`'s hand (+1 his left) to the basket, out to that side, back to the grip; he looks
    // at the door
    throwAt(side) {
        this.throwT = 0;
        this.throwSide = side;
        this.lookAtDoorT = HillBoy.THROW.lookS;
    }

    // Where the throwing hand is wanted now (in the frame, into `out`), or null: from the grip `grip` to the basket,
    // out to the side, back
    throwHand(arm, grip, out) {
        const T = HillBoy.THROW, t = this.throwT;
        if (t < 0 || arm.side !== this.throwSide) return null;
        const sm = HillBoy.ease;
        const basket = this.scratch.b.set(arm.side * 0.13, 1.02, 0.42), wide = this.scratch.c.set(arm.side * 0.62, 1.42, 0.08);
        if (t < T.reachS) return out.copy(grip).lerp(basket, sm(t / T.reachS));
        if (t < T.flingS) {
            const k = (t - T.reachS) / (T.flingS - T.reachS);
            return out.copy(basket).lerp(wide, k * k * (3 - 2 * k)).add(this.scratch.a.set(0, 0.12 * Math.sin(k * Math.PI), 0));
        }
        return out.copy(wide).lerp(grip, sm((t - T.flingS) / (T.backS - T.flingS)));
    }

    // His hands: each finger's joints curled round the grip, open for the throw, half closed in a fall; the wrist laid
    // over the bar
    grip(dt, ctx) {
        const H = HillBoy.HAND, T = HillBoy.THROW, s = this.scratch;
        const k = dt > 0 ? 1 - Math.exp(-dt / 0.07) : 1;
        for (const hand of this.hands) {
            let want = 1;
            const t = this.throwT;
            if (ctx.fallen) want = 0.35;
            else if (t >= 0 && hand.side === this.throwSide) want = t < T.reachS * 0.7 ? 0.1 : t < T.releaseS ? 0.75 : t < T.flingS + 0.1 ? 0 : 0.6;
            const c = this.curl[hand.tag] += (want - this.curl[hand.tag]) * k;
            for (let i = 0; i < hand.fingers.length; i++) {
                const f = hand.fingers[i];
                for (let j = 0; j < 3; j++) {
                    const open = H.open[j] + 0.04 * i * (j === 0 ? 1 : 0);
                    f.joints[j].quaternion.setFromAxisAngle(s.a.set(1, 0, 0), open + (H.grip[j] + 0.05 * i - open) * c);
                }
            }
            // (the thumb across the palm, about its own axis)
            s.a.crossVectors(hand.thumb.dir, s.b.set(0, 0, -1)).normalize();
            for (let j = 0; j < 3; j++) hand.thumb.joints[j].quaternion.setFromAxisAngle(s.a, H.thumbOpen[j] + (H.thumbGrip[j] - H.thumbOpen[j]) * c);
            // The wrist: laid back a little to put the palm over the bar, straight when the hand is open
            hand.bone.quaternion.setFromAxisAngle(s.b.set(1, 0, 0), (ctx.fallen ? 0.1 : -0.32) * c);
        }
    }

    // His life after the pose (HillRider.update calls it once every part is placed and the frame's matrices are
    // fresh): the hands, the folds that follow the joints, the scarf's ends and the apron's swing, stepped at a fixed
    // rate; the level of detail for the camera at `eye`
    after(dt, bike, ctx) {
        this.grip(dt, ctx);
        this.folds(ctx);
        // (thrown off, the body leaves the frame: its bounds are opened to cover where he falls)
        for (const level of this.levels) level.mesh.geometry.boundingSphere.radius = ctx.fallen ? 6 : 1.3;
        const S = HillBoy.SCARF;
        // A step of more than a metre (a reset, a restart, a tool placing him) starts the swinging parts afresh
        const at = this.rider.group.position;
        if (this.scratch.last.distanceToSquared(at) > 1) for (const end of this.scarf) end.ready = false;
        this.scratch.last.copy(at);
        this.acc = Math.min(this.acc + dt, S.stepS * 12);
        this.rider.group.updateMatrixWorld(true);
        this.colliders();
        for (const end of this.scarf) if (!end.ready) this.settleScarf(end);
        // (the steps this frame, the knot and the body moved evenly through them from where they were last frame)
        const steps = Math.floor(this.acc / S.stepS + 1e-6);
        for (let k = 0; k < steps; k++) {
            this.acc -= S.stepS;
            const share = (k + 1) / steps;
            for (const end of this.scarf) this.stepScarf(end, S.stepS, share);
            this.stepApron(S.stepS, bike);
        }
        for (const end of this.scarf) {
            this.knotAt(end, this.scratch.v);
            end.knot.set([this.scratch.v.x, this.scratch.v.y, this.scratch.v.z]);
        }
        this.lastColliders.set(this.scratch.colliders);
        for (const end of this.scarf) this.placeScarf(end);
        if (ctx.eye) this.level(ctx.eye);
    }

    // The folds' depths from the joints' bends: each elbow and knee, and the body's bend forward at the waist
    folds(ctx) {
        const r = this.rider, s = this.scratch, w = this.foldShares, P = r.parts;
        w[0] = HillBoy.joint(this.bend(P.upperarm_l, P.forearm_l));
        w[1] = HillBoy.joint(this.bend(P.upperarm_r, P.forearm_r));
        w[2] = HillBoy.joint(this.bend(P.thigh_l, P.shin_l));
        w[3] = HillBoy.joint(this.bend(P.thigh_r, P.shin_r));
        s.z.set(0, 1, 0).applyQuaternion(this.chest.quaternion).applyQuaternion(P.boy.quaternion);
        w[4] = HillBoy.step(0.05, 0.5, Math.acos(Math.max(-1, Math.min(1, s.z.y))) + 0.1 * this.rise);
        w[5] = HillBoy.step(0.55, 1.3, r.apronAngle || 0);
        for (const level of this.levels) {
            const m = level.mesh.morphTargetInfluences;
            if (m) for (let i = 0; i < w.length && i < m.length; i++) m[i] = w[i];
        }
    }

    // How far one limb's bone is bent from the one it hangs from (rad)
    bend(a, b) {
        const s = this.scratch;
        s.y.set(0, -1, 0).applyQuaternion(a.quaternion);
        s.x.set(0, -1, 0).applyQuaternion(b.quaternion);
        return Math.acos(Math.max(-1, Math.min(1, s.y.dot(s.x))));
    }

    // The near or the far body for an eye at `eye` (in the world), with a little room either way
    level(eye) {
        const F = HillBoy.FAR, d = eye.distanceTo(this.rider.group.position);
        const far = this.far ? d > F.backM : d > F.fromM;
        if (far === this.far) return;
        this.far = far;
        this.levels[0].mesh.visible = !far;
        this.levels[1].mesh.visible = far;
    }

    // The spheres the scarf's tails lie on, in the world now
    colliders() {
        const list = HillBoy.COLLIDERS, out = this.scratch.colliders, v = this.scratch.v;
        for (let i = 0; i < list.length; i++) {
            const bone = this.bones[this.byName[list[i][0]]];
            v.set(list[i][1], list[i][2], list[i][3]).applyMatrix4(bone.matrixWorld);
            out[i * 4] = v.x;
            out[i * 4 + 1] = v.y;
            out[i * 4 + 2] = v.z;
            out[i * 4 + 3] = list[i][4];
        }
    }

    // Where a tail comes out from under the band, in the world, into `out`
    knotAt(end, out) {
        return out.copy(this.rest[end.links[0].name]).sub(this.rest[end.parent.name]).applyMatrix4(end.parent.matrixWorld);
    }

    // A scarf end laid where the pose has it, at rest (after a reset)
    settleScarf(end) {
        const v = this.scratch.v;
        this.knotAt(end, v);
        end.knot.set([v.x, v.y, v.z]);
        this.lastColliders.set(this.scratch.colliders);
        for (let i = 0; i < end.links.length; i++) {
            v.copy(this.rest[end.links[i].name]).sub(this.rest[end.parent.name]).applyMatrix4(end.parent.matrixWorld);
            end.points.set([v.x, v.y, v.z], i * 3);
            end.prev.set([v.x, v.y, v.z], i * 3);
        }
        end.ready = true;
    }

    // One step of a scarf end: verlet under gravity and the air's drag (the air still, the boy moving through it), its
    // links held to their length and a little stiff, its first point on the knot, the rest off his body
    stepScarf(end, h, share) {
        const S = HillBoy.SCARF, p = end.points, q = end.prev, n = end.links.length, now = this.scratch.colliders, was = this.lastColliders, c = this.scratch.between;
        const k = this.knotAt(end, this.scratch.anchor);
        k.x = end.knot[0] + (k.x - end.knot[0]) * share;
        k.y = end.knot[1] + (k.y - end.knot[1]) * share;
        k.z = end.knot[2] + (k.z - end.knot[2]) * share;
        for (let i = 0; i < now.length; i++) c[i] = was[i] + (now[i] - was[i]) * share;
        const damp = Math.exp(-S.damp * h), drag = S.drag * h;
        for (let i = 1; i < n; i++) {
            const j = i * 3;
            for (let a = 0; a < 3; a++) {
                const vel = (p[j + a] - q[j + a]) * damp;
                q[j + a] = p[j + a];
                // (the drag pulls its speed towards the still air's)
                p[j + a] += vel * (1 - drag) + (a === 1 ? -9.81 * h * h : 0);
            }
        }
        p[0] = k.x; p[1] = k.y; p[2] = k.z;
        q[0] = k.x; q[1] = k.y; q[2] = k.z;
        for (let pass = 0; pass < 4; pass++) {
            for (let i = 1; i < n; i++) {
                const a = (i - 1) * 3, b = i * 3;
                const dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2], d = Math.hypot(dx, dy, dz) || 1e-6;
                const f = (d - S.linkM) / d;
                if (i === 1) {
                    p[b] -= dx * f; p[b + 1] -= dy * f; p[b + 2] -= dz * f;
                } else {
                    p[a] += dx * f * 0.5; p[a + 1] += dy * f * 0.5; p[a + 2] += dz * f * 0.5;
                    p[b] -= dx * f * 0.5; p[b + 1] -= dy * f * 0.5; p[b + 2] -= dz * f * 0.5;
                }
            }
            for (let i = 1; i < n && pass < 3; i++) {
                const b = i * 3;
                for (let s = 0; s < c.length; s += 4) {
                    const dx = p[b] - c[s], dy = p[b + 1] - c[s + 1], dz = p[b + 2] - c[s + 2], d = Math.hypot(dx, dy, dz), r = c[s + 3] + 0.022;
                    if (d < r && d > 1e-6) {
                        const f = (r - d) / d;
                        p[b] += dx * f; p[b + 1] += dy * f; p[b + 2] += dz * f;
                    }
                }
            }
        }
        HillBoy.holdScarf(p, n, S.linkM);
    }

    // (a last pass from the knot down: no link longer than its length, whatever the passes above left)
    static holdScarf(p, n, link) {
        for (let i = 1; i < n; i++) {
            const a = (i - 1) * 3, b = i * 3;
            const dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2], d = Math.hypot(dx, dy, dz);
            if (d > link) {
                const f = link / d;
                p[b] = p[a] + dx * f; p[b + 1] = p[a + 1] + dy * f; p[b + 2] = p[a + 2] + dz * f;
            }
        }
    }

    // Each link of a scarf tail set from its points: at its point, its -y along to the next (in its parent's space)
    placeScarf(end) {
        const s = this.scratch, p = end.points, n = end.links.length;
        s.mi.copy(end.parent.matrixWorld).invert();
        for (let i = 0; i < n; i++) {
            const bone = end.links[i];
            s.a.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]).applyMatrix4(s.mi);
            const j = Math.min(n - 1, i + 1), k = j === i ? i - 1 : i;
            s.b.set(p[j * 3], p[j * 3 + 1], p[j * 3 + 2]).applyMatrix4(s.mi);
            s.c.set(p[k * 3], p[k * 3 + 1], p[k * 3 + 2]).applyMatrix4(s.mi);
            // (down the chain: from this point to the next, or from the one before to this at the end)
            if (j === i) s.y.subVectors(s.c, s.a);
            else s.y.subVectors(s.a, s.b);
            if (s.y.lengthSq() < 1e-10) s.y.set(0, 1, 0);
            s.y.normalize();
            s.z.set(0, 0, 1).addScaledVector(s.y, -s.y.z);
            if (s.z.lengthSq() < 1e-8) s.z.set(0, 1, 0);
            s.z.normalize();
            s.x.crossVectors(s.y, s.z);
            s.m.makeBasis(s.x, s.y, s.z);
            bone.quaternion.setFromRotationMatrix(s.m);
            bone.position.copy(s.a);
        }
    }

    // One step of the apron's own swing: a damped spring about its hang, driven by the frame's braking and the
    // cobbles' bounce, a flutter with speed; the swing is only ever forward of the hang (never into his legs)
    stepApron(h, bike) {
        const A = HillBoy.APRON_SWING, ap = this.apron, v = bike.vehicle;
        const accel = (bike.speed - ap.lastSpeed) / h;
        ap.lastSpeed = bike.speed;
        const bounceV = ((bike.bounce || 0) - (ap.lastBounce === undefined ? bike.bounce || 0 : ap.lastBounce)) / h;
        ap.lastBounce = bike.bounce || 0;
        ap.time = (ap.time || 0) + h;
        const flutter = A.flutter * bike.speed * bike.speed * (Math.sin(ap.time * 17.3) + 0.6 * Math.sin(ap.time * 29.1 + 1.3));
        const drive = -accel * A.brake + bounceV * A.bounce + flutter * A.spring;
        ap.flapV += (drive - A.spring * ap.flap - A.damp * ap.flapV) * h;
        ap.flap += ap.flapV * h;
        if (ap.flap < 0) { ap.flap = 0; if (ap.flapV < 0) ap.flapV *= -0.2; }
        if (ap.flap > A.mostRad) { ap.flap = A.mostRad; ap.flapV = Math.min(0, ap.flapV); }
        const lean = (v.leanAngle || 0) - (ap.lastLean || 0);
        ap.lastLean = v.leanAngle || 0;
        ap.swayV += (-lean / h * 0.15 - A.spring * 0.6 * ap.sway - A.damp * ap.swayV) * h;
        ap.sway = Math.max(-A.swayRad, Math.min(A.swayRad, ap.sway + ap.swayV * h));
    }

    // Where the hand is held over its grip's middle (in the frame, m): the palm over the bar, the fingers round it
    static get GRIP_BY() { return [0, 0.026, -0.03]; }

    // A shoulder's place in the frame now (into `out`): the collar bone's rest place on the chest as turned, lifted a
    // little by the in-breath, on the hips at `hips` turned by `q`
    shoulderAt(arm, hips, q, out) {
        const s = this.scratch, R = this.rest, clav = `clavicle_${arm.tag}`;
        out.copy(R[clav]).sub(R.chest);
        out.y += (this.swell || 0) * 0.12;
        out.applyQuaternion(this.chest.quaternion).add(s.w.copy(R.chest).sub(R.boy)).applyQuaternion(q).add(hips);
        return out;
    }

    // The collar bone moved to put the shoulder at `at` (in the frame): the jumper's shoulder goes with the arm
    setShoulder(arm, at, hips, q) {
        const s = this.scratch, R = this.rest, bone = this.clavicles[arm.tag === 'l' ? 0 : 1];
        s.q.copy(q).invert();
        s.v.copy(at).sub(hips).applyQuaternion(s.q).sub(s.w.copy(R.chest).sub(R.boy));
        s.q.copy(this.chest.quaternion).invert();
        bone.position.copy(s.v.applyQuaternion(s.q));
    }

    // Everything of his own back at rest (a fall takes over the limbs from the rest pose)
    atRest() {
        const R = this.rest;
        this.chest.quaternion.identity();
        this.clavicles.forEach((bone, i) => bone.position.copy(R[`clavicle_${i ? 'r' : 'l'}`]).sub(R.chest));
        this.breath.scale.set(1, 1, 1);
        this.rise = 0;
        this.throwT = -1;
    }

    // The far level's share of the near level's rings and segments
    static get FAR_DETAIL() { return 0.42; }

    // How far ahead of the head's centre each eye's centre sits: the cornea just behind where the face would be with no
    // socket (HillBoy.headPoint without its features), so the ball shows through the socket between the lids
    static eyeZ() {
        const F = HillBoy.FACE, p = new THREE.Vector3();
        let best = Infinity, z = 0.06;
        for (let polar = 1.2; polar < 1.8; polar += 0.004) {
            for (let az = 0.15; az < 0.7; az += 0.004) {
                HillBoy.headPoint(polar, az, p, false);
                const d = Math.hypot(p.x - F.eyeX, p.y - F.eyeY);
                if (d < best) { best = d; z = p.z; }
            }
        }
        return z - 0.0042 - F.eyeR;
    }

    // The jumper's front at rest at (x, y) in the frame: how far forward its surface is there (HillBoyPieces.torso's
    // own rows)
    static frontZ(boy, x, y) {
        const K = HillBoyKit, rows = HillBoyPieces.torsoRows(boy.rest);
        const w = K.curve(rows, y, 2), f = K.curve(rows, y, 3), e = K.curve(rows, y, 5), z = K.curve(rows, y, 1);
        const sn = Math.min(1, Math.abs(x) / w), th = Math.asin(Math.pow(sn, e / 2));
        return z + Math.pow(Math.cos(th), 2 / e) * f;
    }

    static clamp(x, m) { return Math.max(-m, Math.min(m, x)); }

    // A smoothstep of x from a to b, and of x over 0..1
    static step(a, b, x) {
        const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
        return k * k * (3 - 2 * k);
    }

    static ease(x) { return HillBoy.step(0, 1, x); }

    // A knee's or an elbow's fold for its bend (rad): eased in, then on past one for a hard bend, where a skinned
    // joint loses most
    static joint(bend) { return HillBoy.step(0.25, 1.5, bend) + 0.7 * Math.max(0, bend - 1.5); }

    // A small seeded random sequence (the same blinks on every load)
    static random(seed) {
        let s = seed >>> 0;
        return () => {
            s = (s + 0x6d2b79f5) >>> 0;
            let t = Math.imul(s ^ (s >>> 15), 1 | s);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // The hand: the wrist up the forearm from its end (m), the palm's length to the knuckles, each finger (from his
    // middle outwards: index, middle, ring, little) its place across the knuckles from the wrist's line, how far its
    // knuckle sits below the line, forward of it, and its three bones' lengths; the thumb's root from the wrist, its
    // way and its lengths. A boy's hand in a knitted glove
    static get HAND() {
        return Object.freeze({
            wristM: 0.255, palmM: 0.078,
            fingers: [
                { x: 0.024, drop: 0.002, z: 0.0, lengths: [0.032, 0.021, 0.018], r: 0.0088 },
                { x: 0.008, drop: 0.0, z: 0.0, lengths: [0.036, 0.024, 0.019], r: 0.009 },
                { x: -0.008, drop: 0.002, z: 0.0, lengths: [0.033, 0.022, 0.018], r: 0.0085 },
                { x: -0.023, drop: 0.007, z: 0.0, lengths: [0.026, 0.017, 0.016], r: 0.0076 }
            ],
            thumb: { base: [0.019, -0.012, -0.006], dir: [0.42, -0.8, -0.42], lengths: [0.03, 0.025, 0.021], r: 0.0105 },
            // The curl of each joint (rad, towards the palm) on a grip, open to throw, and at rest
            grip: [1.05, 1.35, 0.55], open: [0.08, 0.12, 0.08], rest: [0.35, 0.5, 0.3], thumbGrip: [0.25, 0.55, 0.45], thumbOpen: [-0.1, 0.05, 0.05]
        });
    }

    // The face: the eyes' place from the head's centre (across, up), the eyeball's radius, the lids' rest and the
    // blink (rad of the upper lid from open)
    static get FACE() {
        return Object.freeze({ eyeX: 0.0292, eyeY: 0.001, eyeR: 0.0119, lidOpenRad: 0.0, lidShutRad: 1.05 });
    }

    // The spheres the scarf's tails lie on: [bone, x, y, z from the bone, r] (the belly under the apron, each thigh
    // and knee under it, the chest)
    static get COLLIDERS() {
        return Object.freeze([['boy', 0, 0.06, 0.02, 0.115], ['boy', 0, -0.02, 0.04, 0.11], ['chest', 0, 0.02, 0.03, 0.11],
            ['thigh_l', 0, -0.12, 0, 0.1], ['thigh_l', 0, -0.3, 0, 0.085], ['thigh_l', 0, -0.45, 0, 0.08],
            ['thigh_r', 0, -0.12, 0, 0.1], ['thigh_r', 0, -0.3, 0, 0.085], ['thigh_r', 0, -0.45, 0, 0.08]]);
    }

    // The finishes, each one draw: skin (face, neck, ears, lids), eyes, hair, knit (the jumper, the scarf and the gloves
    // by their vertex colours), wool (the breeches and the cap), linen (the apron) and leather (the boots)
    static materials() {
        if (HillBoy.made) return HillBoy.made;
        const maps = typeof HillBoyMaps !== 'undefined' ? HillBoyMaps.all() : {};
        const physical = THREE.MeshPhysicalMaterial || THREE.MeshStandardMaterial;
        const finish = (name, Kind, o) => {
            const m = new Kind(o);
            m.name = `boy-${name}`;
            return m;
        };
        const skin = finish('skin', THREE.MeshStandardMaterial, { map: maps.skin || null, normalMap: maps.skinNormal || null, roughness: 0.6, metalness: 0 });
        HillBoy.subsurface(skin, [0.55, 0.16, 0.08]);
        const eye = finish('eye', physical, { map: maps.eye || null, roughness: 0.25, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04 });
        // (the eyes keep the sky's full share in their clear coat: it is their wetness; HillRide leaves them so)
        eye.userData.ownSky = true;
        const hair = finish('hair', THREE.MeshStandardMaterial, { map: maps.hair || null, normalMap: maps.hairNormal || null, roughness: 0.55, metalness: 0, alphaTest: 0.45, side: THREE.DoubleSide });
        const knit = finish('knit', physical, { map: maps.knit || null, normalMap: maps.knitNormal || null, roughness: 0.96, metalness: 0, vertexColors: true, sheen: 1, sheenRoughness: 0.8, sheenColor: new THREE.Color(0.16, 0.16, 0.16) });
        const wool = finish('wool', physical, { map: maps.wool || null, normalMap: maps.woolNormal || null, roughness: 0.93, metalness: 0, vertexColors: true, sheen: 0.7, sheenRoughness: 0.85, sheenColor: new THREE.Color(0.1, 0.1, 0.1) });
        const linen = finish('linen', THREE.MeshStandardMaterial, { map: maps.linen || null, normalMap: maps.linenNormal || null, roughness: 0.9, metalness: 0, alphaTest: 0.5, side: THREE.DoubleSide });
        const leather = finish('leather', physical, { map: maps.leather || null, normalMap: maps.leatherNormal || null, roughnessMap: maps.leatherRough || null, roughness: 1, metalness: 0, vertexColors: true, clearcoat: 0.25, clearcoatRoughness: 0.5 });
        const list = [skin, eye, hair, knit, wool, linen, leather];
        if (maps.knitNormal) for (const m of list) if (m.normalMap) m.normalScale.set(1, 1);
        HillBoy.made = { list, index: { skin: 0, eye: 1, hair: 2, knit: 3, wool: 4, linen: 5, leather: 6 } };
        return HillBoy.made;
    }

    // A soft look of light through skin, cheaply: past the edge of the lit side the light wraps on a little, tinted
    // `tint` (the red of blood under the skin), as if it had passed through
    static subsurface(material, tint) {
        const add = 'RE_Direct( directLight, geometry, material, reflectedLight );';
        material.userData.sss = tint;
        material.onBeforeCompile = (shader) => {
            shader.uniforms.sssTint = { value: new THREE.Vector3().fromArray(tint) };
            const chunk = THREE.ShaderChunk.lights_fragment_begin;
            if (!chunk.includes(add)) throw new Error('HillBoy.subsurface: three\'s light loop has changed');
            const lit = chunk.split(add).join(`${add}\n\t\treflectedLight.directDiffuse += boyWrap( directLight, geometry ) * material.diffuseColor;`);
            shader.fragmentShader = shader.fragmentShader
                .replace('void main() {', 'uniform vec3 sssTint;\nvec3 boyWrap( const in IncidentLight light, const in GeometricContext geometry ) {\n\tfloat d = dot( geometry.normal, light.direction );\n\tfloat wrap = clamp( ( d + 0.5 ) / 1.5, 0.0, 1.0 );\n\treturn light.color * sssTint * max( 0.0, wrap * wrap - max( d, 0.0 ) * 0.6 );\n}\nvoid main() {')
                .replace('#include <lights_fragment_begin>', lit);
        };
        material.customProgramCacheKey = () => 'hill-boy-skin';
    }

}

// A body being built: its points with their bones and weights, colours and UVs, its triangles by finish, its named
// pieces (where each one's points are) and its folds (each a displacement along the surface, a morph target)
class HillBoyShape {
    constructor(boy, detail) {
        this.boy = boy;
        this.detail = detail;
        this.p = [];
        this.n = [];
        this.t = [];
        this.c = [];
        this.si = [];
        this.sw = [];
        this.folds = HillBoyShape.FOLDS.map(() => []);
        this.tris = HillBoy.materials().list.map(() => []);
        this.pieces = {};
        this.o = { p: new THREE.Vector3(), w: null, c: null, t: [0, 0], fold: null };
    }

    // The folds that follow the pose, as morph targets: the inside of each elbow, the back of each knee, the jumper
    // bunched at his waist when he bends, the apron's sides falling round his thighs when it lies over his lap
    static get FOLDS() { return ['elbow_l', 'elbow_r', 'knee_l', 'knee_r', 'waist', 'lap']; }

    // A count of rings or segments at this level of detail
    k(n, least = 3) { return Math.max(least, Math.round(n * this.detail)); }

    // A grid surface: `at(u, v, o)` sets the point o.p for u along (0..1, nu steps) and v around (0..1, nv steps, the
    // last one meeting the first when `closed`), its weights o.w ([bone name, weight] pairs), colour o.c, UV o.t and
    // folds o.fold ({ fold name: m along the surface }). The faces turn outwards (`out`: 'auto' from the grid's own
    // middle, or 1 / -1 as built)
    grid(name, finish, nu, nv, closed, at, out = 'auto') {
        // (a closed grid's last column is its first again, with its own UVs, so no texture is squeezed across the seam)
        const cols = nv + 1, count = (nu + 1) * cols;
        const P = new Float32Array(count * 3), W = [], C = [], T = new Float32Array(count * 2), F = [];
        const o = this.o;
        for (let i = 0; i <= nu; i++) {
            for (let j = 0; j < cols; j++) {
                o.w = null;
                o.c = null;
                o.fold = null;
                o.t[0] = 0;
                o.t[1] = 0;
                at(i / nu, j / nv, o);
                const k = i * cols + j;
                P[k * 3] = o.p.x; P[k * 3 + 1] = o.p.y; P[k * 3 + 2] = o.p.z;
                W.push(o.w || [['boy', 1]]);
                C.push(o.c ? o.c.slice() : [1, 1, 1]);
                T[k * 2] = o.t[0]; T[k * 2 + 1] = o.t[1];
                F.push(o.fold ? { ...o.fold } : null);
            }
        }
        // A closed grid's seam: its last column put exactly on its first
        if (closed) for (let i = 0; i <= nu; i++) for (let c = 0; c < 3; c++) P[(i * cols + nv) * 3 + c] = P[(i * cols) * 3 + c];
        const at3 = (pts, i, j, v) => v.set(pts[(i * cols + j) * 3], pts[(i * cols + j) * 3 + 1], pts[(i * cols + j) * 3 + 2]);
        const a = new THREE.Vector3(), b = new THREE.Vector3(), n = new THREE.Vector3(), c = new THREE.Vector3(), d = new THREE.Vector3();
        const normals = (pts) => {
            const N = new Float32Array(pts.length);
            for (let i = 0; i <= nu; i++) {
                for (let j = 0; j < cols; j++) {
                    const i0 = Math.max(0, i - 1), i1 = Math.min(nu, i + 1);
                    let j0 = j - 1, j1 = j + 1;
                    if (closed) {
                        if (j0 < 0) j0 = nv - 1;
                        if (j1 > nv) j1 = 1;
                    } else {
                        j0 = Math.max(0, j0);
                        j1 = Math.min(nv, j1);
                    }
                    at3(pts, i1, j, a).sub(at3(pts, i0, j, d));
                    at3(pts, i, j1, b).sub(at3(pts, i, j0, d));
                    n.crossVectors(a, b);
                    if (n.lengthSq() < 1e-18) {
                        // A ring drawn to a point (a pole): the normal points along the axis, away from the next rings
                        const m = i === 0 ? Math.min(nu, 2) : Math.max(0, i - 2);
                        c.set(0, 0, 0);
                        for (let q = 0; q < nv; q++) c.add(at3(pts, m, q, d));
                        c.multiplyScalar(1 / nv);
                        at3(pts, i, j, n).sub(c);
                    }
                    n.normalize();
                    const k = (i * cols + j) * 3;
                    N[k] = n.x; N[k + 1] = n.y; N[k + 2] = n.z;
                }
            }
            return N;
        };
        const N = normals(P);
        // Which way is out
        // ('auto': away from the grid's own middle; a point: away from that point; else 1 or -1 as built)
        let sign = out === 'auto' || (out && out.isVector3) ? 0 : out;
        if (!sign) {
            const mid = new THREE.Vector3();
            if (out && out.isVector3) mid.copy(out);
            else {
                for (let k = 0; k < count; k++) mid.x += P[k * 3], mid.y += P[k * 3 + 1], mid.z += P[k * 3 + 2];
                mid.multiplyScalar(1 / count);
            }
            let dot = 0;
            for (let k = 0; k < count; k++) dot += N[k * 3] * (P[k * 3] - mid.x) + N[k * 3 + 1] * (P[k * 3 + 1] - mid.y) + N[k * 3 + 2] * (P[k * 3 + 2] - mid.z);
            sign = dot < 0 ? -1 : 1;
        }
        if (sign < 0) for (let k = 0; k < N.length; k++) N[k] = -N[k];
        // The folds: the grid displaced along its normals, the normals of that, both kept as deltas
        const foldNames = HillBoyShape.FOLDS;
        const deltas = foldNames.map(fold => {
            if (!F.some(f => f && f[fold])) return null;
            const D = P.slice();
            for (let k = 0; k < count; k++) {
                const dd = F[k] && F[k][fold] ? F[k][fold] : 0;
                D[k * 3] += N[k * 3] * dd;
                D[k * 3 + 1] += N[k * 3 + 1] * dd;
                D[k * 3 + 2] += N[k * 3 + 2] * dd;
            }
            const DN = normals(D);
            if (sign < 0) for (let k = 0; k < DN.length; k++) DN[k] = -DN[k];
            return { D, DN };
        });
        const base = this.p.length / 3;
        for (let k = 0; k < count; k++) {
            this.p.push(P[k * 3], P[k * 3 + 1], P[k * 3 + 2]);
            this.n.push(N[k * 3], N[k * 3 + 1], N[k * 3 + 2]);
            this.t.push(T[k * 2], T[k * 2 + 1]);
            this.c.push(C[k][0], C[k][1], C[k][2]);
            const w = HillBoyShape.top4(W[k], this.boy.byName);
            this.si.push(...w.i);
            this.sw.push(...w.w);
            foldNames.forEach((fold, f) => {
                const dl = deltas[f];
                if (dl) this.folds[f].push(dl.D[k * 3] - P[k * 3], dl.D[k * 3 + 1] - P[k * 3 + 1], dl.D[k * 3 + 2] - P[k * 3 + 2], dl.DN[k * 3] - N[k * 3], dl.DN[k * 3 + 1] - N[k * 3 + 1], dl.DN[k * 3 + 2] - N[k * 3 + 2]);
                else this.folds[f].push(0, 0, 0, 0, 0, 0);
            });
        }
        const list = this.tris[HillBoy.materials().index[finish]];
        for (let i = 0; i < nu; i++) {
            for (let j = 0; j < nv; j++) {
                const q0 = base + i * cols + j, q1 = base + (i + 1) * cols + j, q2 = base + i * cols + j + 1, q3 = base + (i + 1) * cols + j + 1;
                if (sign < 0) list.push(q0, q2, q1, q1, q2, q3);
                else list.push(q0, q1, q2, q1, q3, q2);
            }
        }
        const piece = this.pieces[name] || (this.pieces[name] = { finish, ranges: [], nu, nv });
        piece.ranges.push([base, count]);
        return piece;
    }

    // The four heaviest of a list of [bone name, weight], normalised, as indices into the skeleton
    static top4(list, byName) {
        const merged = new Map();
        for (const [name, w] of list) {
            if (!(w > 0)) continue;
            const i = byName[name];
            if (i === undefined) throw new Error(`HillBoy: no bone ${name}`);
            merged.set(i, (merged.get(i) || 0) + w);
        }
        const sorted = [...merged.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
        const sum = sorted.reduce((s, e) => s + e[1], 0) || 1;
        const out = { i: [0, 0, 0, 0], w: [0, 0, 0, 0] };
        sorted.forEach(([i, w], k) => { out.i[k] = i; out.w[k] = w / sum; });
        if (!sorted.length) out.w[0] = 1;
        return out;
    }

    // The geometry: every point, its weights, colours, UVs (twice: three reads the occlusion through uv2), its
    // triangles in one index with a group for each finish, and the folds as relative morph targets
    geometry() {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(this.t, 2));
        g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
        g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
        g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
        const index = [];
        this.tris.forEach((list, finish) => {
            if (!list.length) return;
            g.addGroup(index.length, list.length, finish);
            for (const i of list) index.push(i);
        });
        g.setIndex(index);
        g.userData.linearColors = true;
        const count = this.p.length / 3;
        g.morphAttributes.position = [];
        g.morphAttributes.normal = [];
        this.folds.forEach((list) => {
            const p = new Float32Array(count * 3), n = new Float32Array(count * 3);
            for (let k = 0; k < count; k++) {
                p[k * 3] = list[k * 6]; p[k * 3 + 1] = list[k * 6 + 1]; p[k * 3 + 2] = list[k * 6 + 2];
                n[k * 3] = list[k * 6 + 3]; n[k * 3 + 1] = list[k * 6 + 4]; n[k * 3 + 2] = list[k * 6 + 5];
            }
            g.morphAttributes.position.push(new THREE.BufferAttribute(p, 3));
            g.morphAttributes.normal.push(new THREE.BufferAttribute(n, 3));
        });
        g.morphTargetsRelative = true;
        g.computeBoundingBox();
        g.computeBoundingSphere();
        return g;
    }
}


// The numbers of his shape, small helpers for them
const HillBoyKit = {
    sm(a, b, x) {
        const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
        return t * t * (3 - 2 * t);
    },
    g(x) { return Math.exp(-x * x); },
    // A smooth curve through rows of [x, value, value...] (x rising): Catmull-Rom on value `k`
    curve(rows, x, k = 1) {
        const n = rows.length;
        if (x <= rows[0][0]) return rows[0][k];
        if (x >= rows[n - 1][0]) return rows[n - 1][k];
        let i = 0;
        while (i < n - 2 && x > rows[i + 1][0]) i++;
        const x0 = rows[i][0], x1 = rows[i + 1][0], t = (x - x0) / (x1 - x0);
        const p0 = rows[Math.max(0, i - 1)][k], p1 = rows[i][k], p2 = rows[i + 1][k], p3 = rows[Math.min(n - 1, i + 2)][k];
        const t2 = t * t, t3 = t2 * t;
        return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
    },
    // An sRGB colour as linear shares
    lin(hex) {
        return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map(c => {
            const v = c / 255;
            return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
    },
    // A superellipse's reach at angle th (0 ahead, pi/2 to +x) for half width w, depth ahead f and behind b
    ring(th, w, f, b, e) {
        const s = Math.sin(th), c = Math.cos(th), q = 2 / e;
        return [Math.sign(s) * Math.pow(Math.abs(s), q) * w, Math.sign(c) * Math.pow(Math.abs(c), q) * (c >= 0 ? f : b)];
    }
};

// His colours (sRGB, as the stills' light and shade give them, made a little lighter for the low sun): the jumper's
// grey wool, the scarf and gloves near black, the breeches' dark wool, the cap's darker tweed (each over its finish's
// near white); the boots' leather is its own map's colour, the soles and their welt a share of it
HillBoy.COLOURS = Object.freeze({
    jumper: 0x9e9990, scarf: 0x2a2522, glove: 0x272320, breeches: 0x2b2825, cap: 0x726658, boot: 0xf0f0f0, sole: 0x9a9a9a, welt: 0xc8b49c
});

// The whole body at one level of detail (1 near; less far): every piece on the rest pose of the rig
HillBoy.shape = function (boy, detail) {
    const shape = new HillBoyShape(boy, detail);
    for (const piece of ['torso', 'hips', 'legs', 'boots', 'arms', 'hands', 'neck', 'head', 'eyes', 'ears', 'hair', 'cap', 'scarf', 'apron']) HillBoyPieces[piece](shape, boy);
    shape.geometry = shape.geometry();
    return shape;
};

const HillBoyPieces = {
    // The jumper over his chest and back, from below his waist to the collar, and its ribbed band, the collar's rib
    // The jumper's sections: [y, z of the middle, half width, depth ahead, depth behind, roundness]
    torsoRows(R) {
        const y0 = R.boy.y + 0.05, y1 = R.head.y + 0.012;
        return [
            [y0, R.boy.z, 0.150, 0.100, 0.106, 2.3], [y0 + 0.05, R.boy.z + 0.004, 0.141, 0.094, 0.1, 2.3], [y0 + 0.1, R.boy.z + 0.01, 0.135, 0.09, 0.095, 2.35],
            [y0 + 0.17, R.boy.z + 0.026, 0.142, 0.093, 0.098, 2.45], [y0 + 0.23, R.boy.z + 0.045, 0.152, 0.098, 0.102, 2.6], [y0 + 0.29, R.boy.z + 0.066, 0.159, 0.095, 0.1, 2.7],
            [y0 + 0.33, R.boy.z + 0.08, 0.16, 0.09, 0.097, 2.7], [y0 + 0.36, R.boy.z + 0.088, 0.152, 0.08, 0.09, 2.6], [y0 + 0.385, R.boy.z + 0.1, 0.124, 0.066, 0.076, 2.4],
            [y0 + 0.405, R.boy.z + 0.108, 0.088, 0.055, 0.063, 2.2], [y1, R.head.z - 0.012, 0.058, 0.048, 0.052, 2.1]
        ];
    },

    torso(shape, boy) {
        const K = HillBoyKit, R = boy.rest, C = K.lin(HillBoy.COLOURS.jumper);
        const y0 = R.boy.y + 0.05, y1 = R.head.y + 0.012;
        const rows = HillBoyPieces.torsoRows(R);
        const nu = shape.k(30, 8), nv = shape.k(72, 12);
        const at = (y, th, o, grow = 0) => {
            const z = K.curve(rows, y, 1), w = K.curve(rows, y, 2) + grow, f = K.curve(rows, y, 3) + grow, b = K.curve(rows, y, 4) + grow, e = K.curve(rows, y, 5);
            let [x, d] = K.ring(th, w, f, b, e);
            // The chest a little full ahead, the shoulder blades behind, the knit sagging a little round the waist
            const front = Math.cos(th), side = Math.abs(Math.sin(th));
            const swell = 1 + 0.035 * K.g((y - (y0 + 0.26)) / 0.06) * Math.max(0, front) * side + 0.04 * K.g((y - (y0 + 0.28)) / 0.07) * Math.max(0, -front) * K.g((side - 0.55) / 0.3)
                + 0.012 * Math.sin(y * 170 + th * 2) * K.g((y - (y0 + 0.08)) / 0.06)
                // (the knit drawn into folds under the arms, where it gathers)
                + 0.02 * Math.sin(y * 95 + th * 3) * K.g((y - (y0 + 0.3)) / 0.05) * K.g((side - 0.95) / 0.12);
            o.p.set(x * swell, y, z + d * swell);
            return o;
        };
        shape.grid('torso', 'knit', nu, nv, true, (u, v, o) => {
            const y = y0 + 0.03 + (y1 - y0 - 0.03) * u, th = v * Math.PI * 2;
            at(y, th, o);
            const chest = K.sm(R.boy.y + 0.1, R.boy.y + 0.24, y), front = Math.cos(th);
            const breath = chest * 0.65 * K.g((y - (R.chest.y + 0.07)) / 0.09) * K.sm(-0.5, 0.2, front);
            const collar = K.sm(R.chest.y + 0.12, R.chest.y + 0.21, y) * K.sm(0.06, 0.14, Math.abs(o.p.x)) * 0.85;
            const side = o.p.x >= 0 ? 'l' : 'r';
            o.w = [['boy', 1 - chest], ['chest', chest * (1 - collar) - breath], ['breath', breath], [`clavicle_${side}`, chest * collar]];
            o.c = C;
            o.t[0] = th * 0.12;
            o.t[1] = y;
            // Bent forward, the jumper bunches over his belly in soft rolls
            o.fold = { waist: 0.0075 * K.sm(-0.2, 0.5, front) * K.g((y - (y0 + 0.1)) / 0.07) * Math.pow(Math.sin((y - y0) * Math.PI * 2 / 0.042), 2) };
        });
        // The ribbed band at the waist and the rolled collar: knitted in ribs, so drawn as ribs
        const rib = (name, from, to, grow, count) => {
            shape.grid(name, 'knit', shape.k(4, 2), shape.k(count, 24), true, (u, v, o) => {
                const y = from + (to - from) * u, th = v * Math.PI * 2;
                const ribs = Math.round(count / 2);
                at(y, th, o, grow + 0.0028 * Math.cos(th * ribs) + 0.002 * Math.sin(u * Math.PI));
                const chest = K.sm(R.boy.y + 0.1, R.boy.y + 0.24, y);
                o.w = [['boy', 1 - chest], ['chest', chest]];
                o.c = C;
                o.t[0] = th * 0.12;
                o.t[1] = y;
            });
        };
        rib('torso-band', y0 - 0.002, y0 + 0.06, 0.006, 120);
        rib('torso-collar', y1 - 0.045, y1 + 0.004, 0.006, 96);
    },

    // His breeches over the seat and hips, closed under him
    hips(shape, boy) {
        const K = HillBoyKit, R = boy.rest, C = K.lin(HillBoy.COLOURS.breeches);
        const y0 = R.boy.y - 0.058, y1 = R.boy.y + 0.1;
        const rows = [[y0, 0.0, 0.0, 0.0], [y0 + 0.01, 0.07, 0.045, 0.06], [y0 + 0.03, 0.125, 0.074, 0.094], [y0 + 0.06, 0.15, 0.085, 0.106],
            [y0 + 0.1, 0.149, 0.088, 0.101], [y1, 0.138, 0.084, 0.093]];
        shape.grid('hips', 'wool', shape.k(12, 5), shape.k(40, 10), true, (u, v, o) => {
            const y = y0 + (y1 - y0) * Math.pow(u, 0.8), th = v * Math.PI * 2;
            const [x, d] = K.ring(th, K.curve(rows, y, 1), K.curve(rows, y, 2), K.curve(rows, y, 3), 2.3);
            o.p.set(x, y, R.boy.z + 0.005 * (y - y0) / (y1 - y0) + d);
            const side = x >= 0 ? 'l' : 'r', thigh = 0.5 * K.sm(R.boy.y + 0.01, R.boy.y - 0.04, y) * K.sm(0.03, 0.1, Math.abs(x));
            o.w = [['boy', 1 - thigh], [`thigh_${side}`, thigh]];
            o.c = C;
            o.t[0] = th * 0.12;
            o.t[1] = y;
        });
    },

    // Each leg in its breeches, from inside his hips to inside the boot's top: the thigh, the knee and its cap, the
    // calf; the cloth creased behind the knee as it bends
    legs(shape, boy) {
        const K = HillBoyKit, R = boy.rest, C = K.lin(HillBoy.COLOURS.breeches);
        for (const tag of ['l', 'r']) {
            const side = tag === 'l' ? 1 : -1, hip = R[`thigh_${tag}`], knee = R[`shin_${tag}`];
            const y0 = hip.y + 0.055, y1 = knee.y - 0.215;
            const rows = [[y1, 0.042], [y1 + 0.025, 0.048], [knee.y - 0.15, 0.054], [knee.y - 0.1, 0.057], [knee.y - 0.04, 0.059], [knee.y, 0.061], [knee.y + 0.04, 0.061],
                [knee.y + 0.12, 0.067], [knee.y + 0.25, 0.076], [hip.y - 0.08, 0.083], [hip.y, 0.078], [hip.y + 0.03, 0.066], [y0, 0.05]];
            shape.grid(`leg_${tag}`, 'wool', shape.k(26, 9), shape.k(26, 9), true, (u, v, o) => {
                const y = y0 + (y1 - y0) * u, th = v * Math.PI * 2;
                const front = Math.cos(th), out = Math.sin(th) * side;
                let r = K.curve(rows, y);
                // The kneecap ahead, the calf behind, the inner thigh a little flat
                r += 0.008 * K.g((y - knee.y + 0.005) / 0.028) * Math.pow(Math.max(0, front), 3);
                r += 0.007 * K.g((y - (knee.y - 0.13)) / 0.06) * Math.max(0, -front);
                r *= 1 - 0.06 * K.sm(knee.y + 0.15, hip.y - 0.05, y) * Math.max(0, -out);
                // The breeches gathered over the boot's top in loose folds
                r += 0.0035 * Math.sin(th * 5 + y * 60) * K.sm(knee.y - 0.1, knee.y - 0.19, y);
                o.p.set(hip.x + Math.sin(th) * r, y, hip.z + Math.cos(th) * r);
                const thigh = K.sm(hip.y + 0.065, hip.y - 0.035, y), shin = K.sm(knee.y + 0.04, knee.y - 0.035, y);
                o.w = [['boy', 1 - thigh], [`thigh_${tag}`, thigh * (1 - shin)], [`shin_${tag}`, shin]];
                o.c = C;
                o.t[0] = th * 0.06;
                o.t[1] = y;
                o.fold = { [`knee_${tag}`]: K.g((y - knee.y) / 0.045) * (0.0075 * Math.max(0, -front) * (0.55 + 0.45 * Math.sin((y - knee.y) * Math.PI * 2 / 0.026)) + 0.003 * Math.max(0, front)) + 0.017 * K.g((y - knee.y) / 0.05) };
            });
        }
    },

    // The boots: the leg of each from the middle of the calf to the ankle, its top turned over; the foot, its toe cap,
    // instep and heel; the sole and heel under it. Laced up the front (the leather's map)
    boots(shape, boy) {
        const K = HillBoyKit, R = boy.rest, boot = K.lin(HillBoy.COLOURS.boot), sole = K.lin(HillBoy.COLOURS.sole), welt = K.lin(HillBoy.COLOURS.welt);
        const lift = HillRider.ANKLE_ON_PEDAL[1];
        for (const tag of ['l', 'r']) {
            const side = tag === 'l' ? 1 : -1, knee = R[`shin_${tag}`], ankle = R[`foot_${tag}`];
            const top = knee.y - 0.175, y1 = ankle.y - 0.006;
            const rows = [[y1, 0.044], [ankle.y + 0.02, 0.046], [ankle.y + 0.05, 0.0435], [ankle.y + 0.1, 0.046], [ankle.y + 0.16, 0.05], [ankle.y + 0.22, 0.053], [top - 0.012, 0.056], [top, 0.058]];
            shape.grid(`boot_${tag}`, 'leather', shape.k(14, 6), shape.k(24, 9), true, (u, v, o) => {
                // (the top turned over: up the outside to the rim, then a little way down inside it)
                const rim = 0.08;
                let y, r;
                if (u < rim) {
                    y = top - 0.016 * (1 - u / rim);
                    r = 0.05 + 0.008 * Math.sin(u / rim * Math.PI / 2);
                } else {
                    const w = (u - rim) / (1 - rim);
                    y = top + (y1 - top) * w;
                    r = K.curve(rows, y);
                }
                const th = v * Math.PI * 2, front = Math.cos(th);
                r += 0.005 * K.g((y - (knee.y - 0.2)) / 0.07) * Math.max(0, -front);
                // Creased across the ankle where it bends
                r += 0.0016 * Math.sin((y - ankle.y) * 260) * K.g((y - ankle.y - 0.035) / 0.03) * Math.max(0, front);
                o.p.set(ankle.x + Math.sin(th) * r, y, ankle.z + Math.cos(th) * r * (1 + 0.08 * Math.max(0, front)));
                const foot = 0.85 * K.sm(ankle.y + 0.075, ankle.y - 0.004, y);
                o.w = [[`shin_${tag}`, 1 - foot], [`foot_${tag}`, foot]];
                o.c = boot;
                o.t[0] = 0.5 + Math.atan2(Math.sin(th), Math.cos(th)) / (Math.PI * 2) * side;
                o.t[1] = 0.62 * (y - ankle.y + 0.01) / (top - ankle.y + 0.01);
            });
            // The foot: along the boot from the heel to the toe, flat under, rounded over, its instep high at the ankle
            const sy = ankle.y - lift, sz = ankle.z;
            const rows2 = [
                // [z from the ankle, top over the sole, half width, roundness of the top]
                [-0.086, 0.035, 0.0, 2.2], [-0.08, 0.06, 0.03, 2.2], [-0.066, 0.115, 0.037, 2.4], [-0.03, 0.135, 0.043, 2.4], [0.02, 0.11, 0.047, 2.6],
                [0.065, 0.075, 0.049, 2.6], [0.11, 0.055, 0.048, 2.6], [0.15, 0.047, 0.043, 2.4], [0.178, 0.04, 0.032, 2.2], [0.193, 0.03, 0.0, 2.2]
            ];
            const z0 = rows2[0][0], z1 = rows2[rows2.length - 1][0], base = sy + 0.013;
            shape.grid(`foot_${tag}`, 'leather', shape.k(20, 8), shape.k(18, 9), true, (u, v, o) => {
                const z = z0 + (z1 - z0) * u, th = v * Math.PI * 2;
                const hi = K.curve(rows2, z, 1), w = Math.max(0, K.curve(rows2, z, 2)), e = K.curve(rows2, z, 3);
                const s = Math.sin(th), c = Math.cos(th);
                // (th from straight up: up is rounded, the underside flat on the sole)
                const x = Math.sign(s) * Math.pow(Math.abs(s), 2 / (c > 0 ? e : 8)) * w;
                const y = c > 0 ? Math.pow(c, 2 / e) * hi * (w > 0 ? 1 : 0) : -Math.pow(-c, 2 / 8) * 0.004;
                // The toe cap a little raised, worn round the toe
                const cap = 0.0015 * K.sm(0.13, 0.15, z);
                o.p.set(ankle.x + x * (1 + cap * 20), base + Math.max(0, y) + (y < 0 ? y : 0) + cap, sz + z);
                o.w = [[`foot_${tag}`, 1]];
                o.c = boot;
                o.t[0] = 0.5 + Math.atan2(s, c) / (Math.PI * 2) * 0.5 * side;
                o.t[1] = 0.64 + 0.34 * (z - z0) / (z1 - z0);
            });
            // The sole and the heel: a slab under the foot, rounded at its edges, darker, its welt a little browner
            shape.grid(`sole_${tag}`, 'leather', shape.k(12, 6), shape.k(10, 8), true, (u, v, o) => {
                const z = z0 + 0.004 + (z1 - z0 - 0.002) * u, th = v * Math.PI * 2;
                const w = Math.max(0.0, K.curve(rows2, Math.min(z1 - 0.004, Math.max(z0 + 0.006, z)), 2)) + 0.004;
                const heel = K.sm(-0.02, -0.035, z);
                const h = 0.0065 + 0.006 * heel;
                const s = Math.sin(th), c = Math.cos(th);
                const x = Math.sign(s) * Math.pow(Math.abs(s), 0.3) * w, y = Math.sign(c) * Math.pow(Math.abs(c), 0.3) * h;
                o.p.set(ankle.x + x, sy + h + y, sz + z);
                o.w = [[`foot_${tag}`, 1]];
                o.c = c > 0.3 ? welt : sole;
                o.t[0] = 0.98;
                o.t[1] = 0.99;
            });
        }
    },

    // The sleeves: full at the shoulder (its top over the jumper's shoulder), easing to the elbow where the knit
    // bags, slimmer to the ribbed cuff; creased inside the elbow as it bends
    arms(shape, boy) {
        const K = HillBoyKit, R = boy.rest, C = K.lin(HillBoy.COLOURS.jumper);
        for (const tag of ['l', 'r']) {
            const side = tag === 'l' ? 1 : -1, sh = R[`upperarm_${tag}`], el = R[`forearm_${tag}`], wrist = el.y - HillBoy.HAND.wristM;
            const top = sh.y + 0.036, end = wrist + 0.05;
            const rows = [[end, 0.035], [end + 0.03, 0.037], [el.y - 0.12, 0.042], [el.y - 0.05, 0.046], [el.y, 0.049], [el.y + 0.05, 0.048], [el.y + 0.14, 0.05],
                [sh.y - 0.05, 0.057], [sh.y - 0.02, 0.059], [sh.y + 0.005, 0.054], [sh.y + 0.022, 0.042], [sh.y + 0.031, 0.026], [top, 0.0]];
            shape.grid(`sleeve_${tag}`, 'knit', shape.k(28, 9), shape.k(28, 9), true, (u, v, o) => {
                const y = top + (end - top) * (u < 0.15 ? Math.pow(u / 0.15, 1.6) * 0.15 : u), th = v * Math.PI * 2;
                const front = Math.cos(th), out = Math.sin(th) * side;
                let r = K.curve(rows, y);
                // (the knit hangs a little looser on the outer side of the upper arm)
                r *= 1 + 0.05 * Math.max(0, out) * K.sm(el.y + 0.02, sh.y - 0.04, y);
                r += 0.0025 * Math.sin(th * 3 + y * 47) * K.g((y - el.y) / 0.1);
                // (the knit pushed up the forearm in soft rings over the cuff, and drawn in loose folds down the upper arm)
                r += 0.0032 * Math.pow(Math.sin((y - end) * 150), 2) * K.g((y - end - 0.06) / 0.035);
                r += 0.0024 * Math.sin(th * 2 + y * 60 + side) * K.g((y - el.y - 0.13) / 0.08) * Math.max(0, -front);
                o.p.set(sh.x + Math.sin(th) * r - side * 0.004 * K.sm(sh.y - 0.06, top, y), y, sh.z + Math.cos(th) * r);
                const upper = 0.35 + 0.65 * K.sm(top - 0.002, sh.y - 0.06, y), fore = K.sm(el.y + 0.035, el.y - 0.04, y);
                o.w = [[`clavicle_${tag}`, 1 - upper], [`upperarm_${tag}`, upper * (1 - fore)], [`forearm_${tag}`, fore]];
                o.c = C;
                o.t[0] = th * 0.05;
                o.t[1] = y;
                o.fold = { [`elbow_${tag}`]: K.g((y - el.y + 0.01) / 0.05) * (0.0065 * Math.max(0, front) * (0.5 + 0.5 * Math.sin((y - el.y) * Math.PI * 2 / 0.022)) + 0.004 * Math.max(0, -front)) + 0.019 * K.g((y - el.y) / 0.045) };
            });
            // The ribbed cuff
            shape.grid(`cuff_${tag}`, 'knit', shape.k(4, 2), shape.k(48, 20), true, (u, v, o) => {
                const y = end + 0.042 - 0.062 * u, th = v * Math.PI * 2;
                const r = 0.034 - 0.003 * u + 0.0018 * Math.cos(th * 16) + 0.0015 * Math.sin(u * Math.PI);
                o.p.set(sh.x + Math.sin(th) * r, y, sh.z + Math.cos(th) * r);
                const hand = 0.25 * K.sm(wrist + 0.005, wrist - 0.008, y);
                o.w = [[`forearm_${tag}`, 1 - hand], [`hand_${tag}`, hand]];
                o.c = C;
                o.t[0] = th * 0.034;
                o.t[1] = y;
            });
        }
    },

    // The gloved hands: the palm from inside the cuff to the knuckles, four fingers of three joints and the thumb
    hands(shape, boy) {
        const K = HillBoyKit, H = HillBoy.HAND, C = K.lin(HillBoy.COLOURS.glove);
        for (const hand of boy.hands) {
            const { tag, side, wrist } = hand;
            const y0 = wrist.y + 0.016, y1 = wrist.y - H.palmM;
            shape.grid(`palm_${tag}`, 'knit', shape.k(10, 4), shape.k(20, 8), true, (u, v, o) => {
                const y = y0 + (y1 - y0) * u, th = v * Math.PI * 2;
                const t = (wrist.y - y) / H.palmM;
                const w = K.curve([[-0.3, 0.025], [0, 0.026], [0.5, 0.033], [0.9, 0.037], [1, 0.036]], t), back = K.curve([[-0.3, 0.017], [0, 0.0135], [1, 0.0105]], t),
                    palm = K.curve([[-0.3, 0.017], [0, 0.0145], [0.5, 0.016], [1, 0.0115]], t);
                const [x, d] = K.ring(th, w, back, palm, 3.2);
                // The ball of the thumb on the palm's inner side
                const ball = 0.005 * K.g((t - 0.35) / 0.3) * Math.max(0, -Math.cos(th)) * Math.max(0, -Math.sin(th) * side);
                o.p.set(wrist.x + x, y, wrist.z + d - ball);
                const fore = 0.45 * K.sm(wrist.y - 0.004, wrist.y + 0.014, y);
                o.w = [[`hand_${tag}`, 1 - fore], [`forearm_${tag}`, fore]];
                o.c = C;
                o.t[0] = th * 0.02;
                o.t[1] = y;
            });
            const digit = (name, joints, lengths, radius, dir) => {
                const total = lengths[0] + lengths[1] + lengths[2], start = -0.01;
                const root = boy.rest[joints[0].name];
                shape.grid(name, 'knit', shape.k(12, 5), shape.k(9, 5), true, (u, v, o) => {
                    const along = start + (total - start) * u, th = v * Math.PI * 2;
                    const end = total - along;
                    let r = radius * (1 - 0.18 * along / total);
                    if (end < radius) r *= Math.sqrt(Math.max(0, 1 - Math.pow(1 - end / radius, 2)));
                    // (the joints a little fuller, the knit creased over them)
                    let j = lengths[0];
                    for (let k = 0; k < 2; k++) {
                        r *= 1 + 0.06 * K.g((along - j) / 0.004);
                        j += lengths[k + 1];
                    }
                    const a = dir, px = Math.abs(a.y) > 0.9 ? 1 : 0;
                    const xa = new THREE.Vector3(px, 1 - px, 0).cross(a).normalize(), za = new THREE.Vector3().crossVectors(a, xa).normalize();
                    o.p.copy(root).addScaledVector(a, along).addScaledVector(xa, Math.sin(th) * r).addScaledVector(za, Math.cos(th) * r);
                    const b1 = K.sm(lengths[0] - 0.004, lengths[0] + 0.004, along), b2 = K.sm(lengths[0] + lengths[1] - 0.004, lengths[0] + lengths[1] + 0.004, along);
                    const b0 = K.sm(-0.006, 0.003, along);
                    o.w = [[`hand_${tag}`, 1 - b0], [joints[0].name, b0 * (1 - b1)], [joints[1].name, b1 * (1 - b2)], [joints[2].name, b2]];
                    o.c = C;
                    o.t[0] = th * 0.008;
                    o.t[1] = along;
                });
            };
            const down = new THREE.Vector3(0, -1, 0);
            hand.fingers.forEach((f, i) => digit(`finger${i}_${tag}`, f.joints, H.fingers[i].lengths, H.fingers[i].r, down));
            digit(`thumb_${tag}`, hand.thumb.joints, H.thumb.lengths, H.thumb.r, hand.thumb.dir);
        }
    },

    // The neck, from inside the collar to inside the head
    neck(shape, boy) {
        const K = HillBoyKit, R = boy.rest, N = R.head;
        const y0 = N.y - 0.04, y1 = N.y + 0.105;
        shape.grid('neck', 'skin', shape.k(10, 4), shape.k(24, 8), true, (u, v, o) => {
            const y = y0 + (y1 - y0) * u, th = v * Math.PI * 2;
            const r = 0.04 - 0.004 * u + 0.002 * K.g((u - 0.45) / 0.2) * Math.max(0, Math.cos(th));
            o.p.set(Math.sin(th) * r * 1.02, y, N.z - 0.025 + 0.038 * u + Math.cos(th) * r * 0.95);
            const head = K.sm(N.y - 0.01, N.y + 0.03, y), skull = K.sm(N.y + 0.05, N.y + 0.09, y);
            o.w = [['chest', 1 - head], ['head', head * (1 - skull)], ['skull', head * skull]];
            o.t[0] = 0.02 + 0.08 * v;
            o.t[1] = 0.98;
        });
    },

    // The head: a boy's skull and face (HillBoy.headPoint), drawn from its own numbers, its features modelled: the
    // brow, the eyes' sockets, the nose and its wings, the cheekbones, the lips, the chin and the jaw
    head(shape, boy) {
        const c = boy.headAt, nu = shape.k(74, 14), nv = shape.k(108, 16), q = new THREE.Vector3();
        // (the rings densest at the nose and mouth, uc: the share of the way down where they thin out most)
        const a = 0.58, uc = 0.06, wa = 0.66;
        shape.grid('head', 'skin', nu, nv, true, (u, v, o) => {
            // (more rings through the face than at the crown and under the chin, more segments over the face than
            // round the back)
            const m = u + a * (Math.sin(2 * Math.PI * (u - uc)) + Math.sin(2 * Math.PI * uc)) / (2 * Math.PI), w = 2 * v - 1;
            const polar = Math.PI * m, az = Math.PI * (w - wa * Math.sin(Math.PI * w) / Math.PI);
            HillBoy.headPoint(polar, az, q, true);
            o.p.copy(q).add(c);
            o.w = [['skull', 1]];
            o.t[0] = 0.5 + az / (Math.PI * 2);
            o.t[1] = 0.12 + 0.86 * polar / Math.PI;
        });
    },

    // The eyes: each ball (its iris and pupil the eye's map, ahead along its +z), and the lids: the upper on its own
    // bone (it closes to blink), the lower on the skull
    eyes(shape, boy) {
        const F = HillBoy.FACE, c = boy.headAt;
        for (const [i, side] of [[0, 1], [1, -1]]) {
            const tag = side > 0 ? 'l' : 'r', at = boy.rest[`eye_${tag}`];
            shape.grid(`eye_${tag}`, 'eye', shape.k(14, 6), shape.k(22, 8), true, (u, v, o) => {
                const polar = Math.PI * u, az = v * Math.PI * 2;
                // (polar from straight ahead)
                const x = Math.sin(polar) * Math.cos(az), y = Math.sin(polar) * Math.sin(az), z = Math.cos(polar);
                o.p.set(at.x + x * F.eyeR, at.y + y * F.eyeR, at.z + z * F.eyeR);
                o.w = [[`eye_${tag}`, 1]];
                o.t[0] = 0.5 + 0.5 * x * (z > 0 ? 1 : 1.0);
                o.t[1] = 0.5 + 0.5 * y;
                if (z < 0) { o.t[0] = 0.02; o.t[1] = 0.5; }
            });
            // The lids: shells over the ball, from their edges back into the socket; the upper's edge rolled
            // (each lid's edge curves: the upper's down and the lower's up towards the corners, where they meet, so the
            // eye shows an almond between them)
            const lid = (name, bone, from, to, edgeAt, r, curve, thick) => {
                shape.grid(name, 'skin', shape.k(8, 3), shape.k(18, 6), false, (u, v, o) => {
                    const az = (v - 0.5) * 2.7, edgeHere = from + curve * Math.pow(Math.min(1.25, Math.abs(az) / 1.18), 2);
                    const el = edgeHere + (to - edgeHere) * u;
                    // (its edge rolled: in against the ball, then the lid's thickness proud of it, then its body)
                    const k = u;
                    const rr = F.eyeR * (k < 1e-6 ? 1.0 : k < 0.2 ? r + thick : r) * (1 - 0.06 * Math.pow(Math.abs(v - 0.5) * 2, 3));
                    const x = Math.cos(el) * Math.sin(az), y = Math.sin(el), z = Math.cos(el) * Math.cos(az);
                    o.p.set(at.x + x * rr, at.y + y * rr, at.z + z * rr);
                    o.w = [[bone, 1]];
                    o.t[0] = 0.03 + 0.18 * v;
                    o.t[1] = 0.005 + 0.045 * u;
                }, at);
            };
            lid(`lid_${tag}`, `lid_${tag}`, 0.3, 1.45, 0.3, 1.12, -0.36, 0.05);
            lid(`lidlow_${tag}`, 'skull', -0.4, -1.35, -0.4, 1.06, 0.36, 0.025);
            // The upper lashes: a short dark fringe from the lid's edge, out and up a little
            shape.grid(`lash_${tag}`, 'skin', 2, shape.k(14, 6), false, (u, v, o) => {
                const az = (v - 0.5) * 2.1, el = 0.3 - 0.36 * Math.pow(Math.abs(az) / 1.18, 2) + 0.16 * u, rr = F.eyeR * (1.0 + 0.2 * u) * (1 - 0.12 * Math.pow(Math.abs(v - 0.5) * 2, 3));
                const x = Math.cos(el) * Math.sin(az), y = Math.sin(el), z = Math.cos(el) * Math.cos(az);
                o.p.set(at.x + x * rr, at.y + y * rr - 0.0004 * u, at.z + z * rr);
                o.w = [[`lid_${tag}`, 1]];
                o.t[0] = 0.05;
                o.t[1] = 0.003;
            }, at);
        }
    },

    // The ears: each a lens of skin standing a little out from the side of the head, its rim rolled and its bowl
    // hollow
    ears(shape, boy) {
        const K = HillBoyKit, c = boy.headAt;
        for (const side of [1, -1]) {
            const tag = side > 0 ? 'l' : 'r';
            const root = new THREE.Vector3(side * 0.067, -0.015, -0.014).add(c);
            const out = new THREE.Vector3(side * Math.cos(0.3), 0, -Math.sin(0.3)), up = new THREE.Vector3(0, 1, 0), back = new THREE.Vector3().crossVectors(out, up).multiplyScalar(-side);
            shape.grid(`ear_${tag}`, 'skin', shape.k(14, 4), shape.k(24, 8), true, (u, v, o) => {
                const polar = Math.PI * u, az = v * Math.PI * 2;
                // (a lens: out is its thin axis)
                const a = Math.sin(polar) * Math.sin(az), b = Math.sin(polar) * Math.cos(az), t = Math.cos(polar);
                // (wider at the top, a small lobe below)
                const H = 0.03 * (a > 0 ? 1 : 0.85), W = 0.0175 * (1 - 0.3 * K.sm(0, -1, a));
                let thick = 0.006 * t;
                // The outer face: its rim rolled up, its bowl hollowed, the small flap at its front over the opening
                const rad = Math.sin(polar);
                if (t > 0) thick += 0.0045 * K.sm(0.72, 0.93, rad) - 0.006 * K.g((rad - 0.2) / 0.32) * K.sm(-0.7, 0.1, -a) + 0.0035 * K.g((b + 0.75) / 0.18) * K.g((a + 0.15) / 0.25);
                o.p.copy(root).addScaledVector(up, a * H).addScaledVector(back, b * W + 0.009).addScaledVector(out, thick + 0.004 + 0.015 * Math.max(0, b) + 0.004 * Math.max(0, a));
                o.w = [['skull', 1]];
                o.t[0] = 0.25 + 0.2 * (0.5 + 0.5 * a);
                o.t[1] = 0.055 + 0.03 * (t > 0 ? rad : 1);
            });
        }
    },

    // His hair under the cap: short, light brown, over the back of the head and down to the nape, short at the sides
    hair(shape, boy) {
        const c = boy.headAt, q = new THREE.Vector3(), n = new THREE.Vector3(), q2 = new THREE.Vector3();
        const az0 = HillBoy.HAIR.az0, az1 = 2 * Math.PI - HillBoy.HAIR.az0, p0 = HillBoy.HAIR.p0, p1 = HillBoy.HAIR.p1;
        shape.grid('hair', 'hair', shape.k(16, 5), shape.k(44, 10), false, (u, v, o) => {
            const polar = p0 + (p1 - p0) * u, az = az0 + (az1 - az0) * v;
            HillBoy.headPoint(polar, az, q, false);
            HillBoy.headPoint(polar + 0.01, az, q2, false);
            n.copy(q).normalize();
            // (thicker over the crown, thin at its edges)
            const edge = Math.min(u, 1 - u, v, 1 - v);
            o.p.copy(q).addScaledVector(n, 0.0015 + 0.0045 * Math.min(1, edge * 5)).add(c);
            o.w = [['skull', 1]];
            o.t[0] = v;
            o.t[1] = u;
        }, 1);
    },

    // The flat cap of tweed: a soft crown flattened on top and pulled forward over a stiff peak, set low on his brow
    // and higher behind, so his hair shows at the sides and the back; the seam where the top meets the sides, the
    // seam down the middle of its front, a button on top, and the peak's stitched edge and darker underside
    cap(shape, boy) {
        const K = HillBoyKit, c = boy.headAt, C = K.lin(HillBoy.COLOURS.cap), under = C.map(k => k * 0.55);
        const Y = HillBoy.CAP;
        const band = (phi, out) => {
            const back = 0.5 - 0.5 * Math.cos(phi);
            out.set(Math.sin(phi) * Y.sideM, Y.frontY + (Y.backY - Y.frontY) * back, -0.004 + Math.cos(phi) * (Math.cos(phi) > 0 ? Y.frontM : Y.backM));
            return out;
        };
        // [share of the way to the top, its reach over the band, its rise over the band]
        const back = [[0, 1, 0], [0.2, 1.05, 0.016], [0.45, 1.02, 0.03], [0.7, 0.74, 0.04], [0.9, 0.33, 0.045], [1, 0, 0.046]];
        const side = [[0, 1, 0], [0.2, 1.12, 0.014], [0.45, 1.11, 0.03], [0.7, 0.8, 0.042], [0.9, 0.36, 0.047], [1, 0, 0.048]];
        const front = [[0, 1, 0], [0.12, 1.2, 0.003], [0.3, 1.33, 0.013], [0.5, 1.24, 0.03], [0.72, 0.88, 0.042], [0.9, 0.4, 0.047], [1, 0, 0.048]];
        const b = new THREE.Vector3(), top = new THREE.Vector3(0, 0, 0.01);
        const crown = (t, phi, out) => {
            const cf = Math.cos(phi), fw = Math.pow(K.sm(-0.1, 1, cf), 1.4), bw = Math.pow(K.sm(0.1, -1, cf), 1.4), sw = 1 - fw - bw;
            const r = K.curve(front, t) * fw + K.curve(side, t) * sw + K.curve(back, t) * bw;
            const h = K.curve(front, t, 2) * fw + K.curve(side, t, 2) * sw + K.curve(back, t, 2) * bw;
            band(phi, b);
            // (flat on top: every way up ends at the one height of the top)
            const y = b.y + h + (Y.topY - (b.y + h)) * K.sm(0.5, 1, t);
            const soft = 1 + 0.018 * Math.sin(phi * 3 + 0.6) * Math.sin(t * Math.PI);
            return out.set(top.x + (b.x - top.x) * r * soft, y, top.z + (b.z - top.z) * r * soft);
        };
        const nu = shape.k(26, 6);
        shape.grid('cap', 'wool', nu, shape.k(60, 12), true, (u, v, o) => {
            // (rings close together at the seam round the top)
            const t = u + 0.5 * (Math.sin(2 * Math.PI * (u - 0.05)) + Math.sin(2 * Math.PI * 0.05)) / (2 * Math.PI);
            const phi = v * Math.PI * 2;
            crown(t, phi, o.p);
            // The seams: round the top where it meets the sides, and down the middle of the front from the button
            const seam = -0.0022 * K.g((t - 0.55) / 0.018) - 0.0016 * K.g(Math.atan2(Math.sin(phi), Math.cos(phi)) / 0.035) * K.sm(0.45, 0.6, t) * K.sm(0.98, 0.9, t);
            o.p.x += Math.sin(phi) * seam * (1 - K.sm(0.4, 0.9, t));
            o.p.z += Math.cos(phi) * seam * (1 - K.sm(0.4, 0.9, t));
            o.p.y += seam * K.sm(0.4, 0.9, t);
            o.p.add(c);
            o.w = [['skull', 1]];
            o.c = C;
            o.t[0] = phi * 0.06;
            o.t[1] = t * 0.08;
        });
        // The crown's underside where it overhangs the band (seen from below, it is cloth, not the head through it)
        shape.grid('cap-under', 'wool', shape.k(4, 2), shape.k(60, 12), true, (u, v, o) => {
            const phi = v * Math.PI * 2;
            crown(0.32 * u, phi, o.p);
            band(phi, b);
            o.p.lerp(b, u * 0.4).add(c);
            o.p.y -= 0.0015;
            o.w = [['skull', 1]];
            o.c = under;
            o.t[0] = phi * 0.036;
            o.t[1] = u * 0.01;
        }, -1);
        // The peak: a stiff blade from the band's front, out and down, its edge rounded and stitched, its underside
        // darker
        const pa = 1.32;
        shape.grid('cap-peak', 'wool', shape.k(20, 6), shape.k(12, 6), true, (u, v, o) => {
            const phi = (u - 0.5) * 2 * pa, th = v * Math.PI * 2;
            band(phi, b);
            const reach = Y.peakM * Math.pow(Math.max(0, Math.cos(phi / pa * Math.PI / 2)), 0.55);
            const outX = Math.sin(phi), outZ = Math.cos(phi);
            const along = (0.5 + 0.5 * Math.cos(th)) * reach, thick = 0.0042 * Math.sin(th) * (reach > 0.002 ? 1 : 0.3);
            // (the stitching: a fine groove a little in from the edge, on top)
            const stitch = Math.sin(th) > 0 ? -0.0006 * K.g((reach - along - 0.006) / 0.0015) : 0;
            const drop = 0.36 * along + 0.006 * Math.pow(along / Math.max(1e-6, reach), 2);
            o.p.set(b.x + outX * (along - 0.009), b.y - 0.001 - drop + thick + stitch, b.z + outZ * (along - 0.009)).add(c);
            o.w = [['skull', 1]];
            o.c = Math.sin(th) < -0.2 ? under : C;
            o.t[0] = phi * 0.036;
            o.t[1] = along * 0.4;
        });
        // The button on the top
        shape.grid('cap-button', 'wool', shape.k(4, 2), shape.k(10, 5), true, (u, v, o) => {
            const polar = Math.PI / 2 * u, az = v * Math.PI * 2;
            o.p.set(Math.sin(polar) * Math.cos(az) * 0.0075, Y.topY + Math.cos(polar) * 0.0035, Math.sin(polar) * Math.sin(az) * 0.0075).add(top).add(c);
            o.w = [['skull', 1]];
            o.c = C.map(k => k * 0.8);
            o.t[0] = az * 0.004;
            o.t[1] = polar * 0.004;
        });
    },

    // The scarf: wound twice round his neck over the collar, knotted at the throat, its two ends hanging from the
    // knot (each link on its own bone), each end fringed
    scarf(shape, boy) {
        const K = HillBoyKit, R = boy.rest, N = R.head, C = K.lin(HillBoy.COLOURS.scarf), S = HillBoy.SCARF;
        const wrap = (name, y, rx, rz, tube, tilt, z0, head) => {
            shape.grid(name, 'knit', shape.k(34, 12), shape.k(10, 6), false, (u, v, o) => {
                const phi = u * Math.PI * 2, th = v * Math.PI * 2;
                const front = Math.cos(phi);
                // (a band of knitting folded round, taller than it is thick, a little twisted and lumpy along it)
                const lump = 1 + 0.1 * Math.sin(phi * 3 + 1) + 0.06 * Math.sin(phi * 7);
                const twist = 0.35 * Math.sin(phi * 2 + 0.5);
                const cx = Math.sin(phi) * rx, cz = z0 + Math.cos(phi) * rz, cy = y - tilt * front;
                const out = new THREE.Vector3(Math.sin(phi), 0, Math.cos(phi));
                const a = Math.cos(th) * tube * 0.62 * lump, b = Math.sin(th) * tube * 1.25 * lump;
                o.p.set(cx, cy, cz).addScaledVector(out, a * Math.cos(twist) - b * Math.sin(twist) * 0.3).add({ x: 0, y: b * Math.cos(twist) + a * Math.sin(twist), z: 0 });
                const h = head * K.sm(0, 1, (o.p.y - (N.y - 0.02)) / 0.06);
                o.w = [['chest', 1 - h], ['head', h]];
                o.c = C;
                o.t[0] = phi * 0.07;
                o.t[1] = th * 0.02;
            });
        };
        wrap('scarf-low', N.y - 0.008, 0.072, 0.07, 0.024, 0.02, N.z - 0.014, 0.0);
        wrap('scarf-high', N.y + 0.03, 0.06, 0.058, 0.024, 0.016, N.z - 0.0, 0.6);
        // Its ends crossed over his chest from his throat to the far side of his waist, under the apron's band: each a
        // flat band of knitting laid on the jumper (the one over the other where they cross), weighed as the jumper
        // under it, so it breathes and bends with him
        const waist = R.apron_long || R.boy;
        for (const [side, lift] of [[1, 0.0], [-1, 0.006]]) {
            const from = [side * 0.05, N.y - 0.035], to = [-side * (S.tuckX + 0.02), waist.y + 0.012];
            const dx = to[0] - from[0], dy = to[1] - from[1], len = Math.hypot(dx, dy), px = -dy / len, py = dx / len;
            shape.grid(`scarf-band${side > 0 ? 'l' : 'r'}`, 'knit', shape.k(16, 5), shape.k(10, 6), true, (u, v, o) => {
                const th = v * Math.PI * 2, wide = S.bandM * (0.62 + 0.38 * Math.sin(Math.min(1, u * 1.6) * Math.PI / 2)) / 2;
                const x = from[0] + dx * u + px * Math.cos(th) * wide, y = from[1] + dy * u + py * Math.cos(th) * wide;
                // (lying on the jumper, a little proud of it and rounded over its edges; folded a little over itself)
                const z = HillBoy.frontZ(boy, x, y) + 0.008 + lift + 0.0045 * Math.sin(th) + 0.003 * Math.sin(u * 19 + side);
                o.p.set(x, y, z);
                const chest = K.sm(R.boy.y + 0.1, R.boy.y + 0.24, y);
                const breath = chest * 0.65 * K.g((y - (R.chest.y + 0.07)) / 0.09) * 0.8;
                o.w = [['boy', 1 - chest], ['chest', chest - breath], ['breath', breath]];
                o.c = C;
                o.t[0] = th * 0.015;
                o.t[1] = u * len;
            });
        }
        // The tails, hanging from the band over the apron, each a flat strip along its links, then its fringe
        boy.scarf.forEach((end, e) => {
            const links = end.links, n = links.length, length = (n - 1) * S.linkM;
            const pts = links.map(b => boy.rest[b.name]);
            shape.grid(`scarf-end${e}`, 'knit', shape.k(n * 4, n), shape.k(10, 6), true, (u, v, o) => {
                const along = u * length, i = Math.min(n - 2, Math.floor(along / S.linkM)), f = along / S.linkM - i;
                const a = pts[i], b2 = pts[i + 1];
                const th = v * Math.PI * 2;
                const wide = S.wideM * (1 - 0.12 * u) / 2, thick = 0.005;
                o.p.set(a.x + (b2.x - a.x) * f + Math.sin(th) * wide, a.y + (b2.y - a.y) * f, a.z + (b2.z - a.z) * f + Math.cos(th) * thick);
                const sm = K.sm(0, 1, f);
                o.w = [[links[i].name, 1 - sm], [links[i + 1].name, sm]];
                o.c = C;
                o.t[0] = th * 0.012;
                o.t[1] = along;
            });
            const last = pts[n - 1], tassels = shape.detail < 1 ? 4 : 7;
            for (let t = 0; t < tassels; t++) {
                const x = last.x + (t / (tassels - 1) - 0.5) * S.wideM * 0.85, len = 0.03 + 0.012 * Math.sin(t * 2.3 + e);
                shape.grid(`scarf-fringe${e}`, 'knit', 2, 4, true, (u, v, o) => {
                    const th = v * Math.PI * 2, r = 0.0024 * (1 - 0.6 * u);
                    o.p.set(x + Math.sin(th) * r, last.y - u * len, last.z + Math.cos(th) * r);
                    o.w = [[links[n - 1].name, 1]];
                    o.c = C;
                    o.t[0] = th * 0.003;
                    o.t[1] = u * len;
                });
            }
        });
    },

    // The apron: a long linen sheet from his waist to his shins (its upper part on `apron_long`, its hem on
    // `apron_hem`, bent smoothly between), gathered at the band, falling in soft folds deeper towards the frayed hem;
    // the band round his waist and its ties behind
    apron(shape, boy) {
        const K = HillBoyKit, R = boy.rest, A = HillRider.APRON;
        if (!R.apron_long) return;
        const W = R.apron_long, upper = A.upperM, hem = 0.3, total = upper + hem;
        const jag = (a) => 0.012 * (0.5 + 0.5 * Math.sin(a * 23.1 + 1.3) * Math.sin(a * 7.7));
        shape.grid('apron', 'linen', shape.k(28, 8), shape.k(24, 8), false, (u, v, o) => {
            const a = (v - 0.5) * 2, down = u * total + (u === 1 ? jag(a) : 0);
            const t = down / total;
            const half = down < upper ? 0.18 + 0.03 * down / upper : 0.21 + 0.03 * (down - upper) / hem;
            // Its folds: gathers at the band, then long soft folds, deeper to the foot; never back into his legs
            const gather = 0.004 * Math.pow(Math.sin(a * 13), 2) * K.sm(0.12, 0.0, t);
            const fold = 0.0095 * (0.25 + 0.75 * t) * (0.5 + 0.5 * Math.sin(a * 5.2 + 0.8 + t * 1.4)) + 0.003 * (0.5 + 0.5 * Math.sin(a * 11.3 + t * 3));
            o.p.set(W.x + a * half, W.y - down, W.z + 0.02 - 0.06 * a * a + gather + fold);
            const h = K.sm(upper - 0.05, upper + 0.05, down);
            o.w = [['apron_long', 1 - h], ['apron_hem', h]];
            o.t[0] = v;
            o.t[1] = t;
            // (over his lap its sides fall away round his thighs, behind the sheet; the middle, over the legs, stays)
            o.fold = { lap: -0.075 * K.sm(0.72, 1, Math.abs(a)) * K.sm(upper + 0.12, upper - 0.05, down) * K.sm(0, 0.12, down) };
        }, 1);
        // The band round his waist over the jumper's foot, and its ties hanging behind
        const y = W.y + 0.01, z = R.boy.z + 0.004;
        shape.grid('apron-band', 'linen', shape.k(3, 2), shape.k(48, 12), true, (u, v, o) => {
            const th = v * Math.PI * 2, yy = y + 0.03 * (u - 0.5);
            const [x, d] = HillBoyKit.ring(th, 0.15, 0.104, 0.108, 2.3);
            o.p.set(x, yy, z + d);
            o.w = [['boy', 0.75], ['chest', 0.25]];
            o.t[0] = 0.02 + 0.02 * v;
            o.t[1] = 0.01 + 0.01 * u;
        });
        for (const side of [1, -1]) {
            shape.grid(`apron-tie`, 'linen', shape.k(6, 2), 2, false, (u, v, o) => {
                const x = side * (0.012 + 0.012 * u) + (v - 0.5) * 0.02;
                o.p.set(x, y - 0.22 * u, z - 0.112 - 0.012 * u);
                o.w = [['boy', 1]];
                o.t[0] = 0.04 + 0.02 * v;
                o.t[1] = 0.01;
            }, -1);
        }
    }
};

// The cap's band round his head (from the head's centre, m): low at the front, higher behind; its reach to the
// side, ahead and behind; the height of its flat top; the peak's reach
HillBoy.CAP = Object.freeze({ frontY: 0.037, backY: 0.057, sideM: 0.0815, frontM: 0.099, backM: 0.106, topY: 0.113, peakM: 0.05 });

// Where his hair grows under the cap: round the head from az0 (in front of each ear) and down from p0 (under the cap)
// to p1 (the nape), rad
HillBoy.HAIR = Object.freeze({ az0: 1.18, p0: 0.78, p1: 2.38 });

// A point of his head (from its centre, m) in the direction `polar` from the crown and `az` round from his front
// (+ to his left, +x): a boy's skull, narrowing to the jaw and the chin, deeper behind; with `face`, its features
// modelled on the front: the brow, the eyes' sockets, the nose, the cheekbones, the lips and the chin. No one's face:
// these are numbers of an ordinary boy's proportions
HillBoy.headPoint = function (polar, az, out, face = true) {
    const K = HillBoyKit, R = HillBoy.HEAD;
    // The height from the direction, then the section of the head at that height: its half width, its depth ahead and
    // behind its middle, the middle's place, and how square it is ahead (a face is flatter than a skull)
    const sy = Math.cos(polar), y = sy * (sy > 0 ? R.crownM : R.chinM);
    const w = K.curve(R.rows, y, 1), f = K.curve(R.rows, y, 2), b = K.curve(R.rows, y, 3), zc = K.curve(R.rows, y, 4);
    const sa = Math.sin(az), ca = Math.cos(az), e = ca > 0 ? 2.5 : 2.05;
    const x = Math.sign(sa) * Math.pow(Math.abs(sa), 2 / e) * w;
    let z = zc + Math.sign(ca) * Math.pow(Math.abs(ca), 2 / e) * (ca > 0 ? f : b);
    if (face && ca > 0) {
        const ax = Math.abs(x), G = K.g, F = HillBoy.FACE;
        let dz = 0;
        // The brow over the eyes, a soft rise between them, and the eyes' sockets under it, deepest at the inner corner
        dz += 0.0045 * G((y - 0.017) / 0.007) * K.sm(0.004, 0.014, ax) * K.sm(0.054, 0.042, ax) + 0.0018 * G(x / 0.008) * G((y - 0.013) / 0.006);
        dz -= 0.013 * G((ax - F.eyeX) / 0.0135) * G((y - F.eyeY) / 0.0095) + 0.0025 * G((ax - 0.017) / 0.005) * G((y - 0.006) / 0.006);
        // The nose: a bridge between the eyes, out to a rounded tip, the wings each side, the nostrils under the tip
        const ny = Math.max(0, Math.min(1, (0.006 - y) / 0.036));
        const nose = (0.0042 + 0.0172 * Math.pow(ny, 1.3)) * K.sm(0.013, 0.004, y) * K.sm(-0.0385, -0.0295, y);
        dz += nose * G(x / (0.0046 + 0.005 * ny)) + 0.003 * G((y + 0.028) / 0.006) * G(x / 0.0075);
        dz += 0.0046 * G((ax - 0.0105) / 0.0042) * G((y + 0.031) / 0.0046);
        dz -= 0.004 * G((ax - 0.006) / 0.0019) * G((y + 0.0357) / 0.0015);
        // The philtrum's two ridges and its groove, under the nose to the lip
        const lipZone = K.sm(-0.0485, -0.045, y) * K.sm(-0.037, -0.04, y);
        dz += lipZone * (0.0011 * G((ax - 0.0042) / 0.0016) - 0.0009 * G(x / 0.0022));
        // The folds from the nose's wings down past the mouth
        const fold = Math.abs((ax - 0.017) - (-(y + 0.033)) * 0.42);
        dz -= 0.0016 * G(fold / 0.0028) * K.sm(-0.03, -0.036, y) * K.sm(-0.06, -0.054, y);
        // The cheekbones and a boy's full cheeks
        dz += 0.0035 * G((ax - 0.044) / 0.012) * G((y + 0.011) / 0.01) + 0.005 * G((ax - 0.038) / 0.016) * G((y + 0.036) / 0.018);
        // The lips: the upper a little ahead, its bow; the mouth's line, turned in at its corners; the fuller lower lip;
        // the dip under it and the chin
        const upperW = Math.exp(-Math.pow(x / 0.0185, 4)), lowerW = Math.exp(-Math.pow(x / 0.0165, 4));
        const bow = 0.0011 * Math.cos(Math.min(1, ax / 0.0075) * Math.PI);
        dz += 0.0038 * G((y + 0.0498 - bow * 0.3) / 0.0027) * upperW;
        dz += 0.0047 * G((y + 0.0572) / 0.0033) * lowerW;
        dz -= 0.0034 * G((y + 0.0527 - 0.0012 * Math.pow(ax / 0.019, 2)) / 0.001) * Math.exp(-Math.pow(x / 0.0205, 4));
        dz -= 0.0016 * G((ax - 0.0205) / 0.0028) * G((y + 0.053) / 0.0034);
        dz -= 0.0021 * G((y + 0.065) / 0.0032) * G(x / 0.016);
        dz += 0.0045 * G((y + 0.0765) / 0.008) * G(x / 0.017);
        z += dz * K.sm(0.15, 0.5, ca);
    }
    out.set(x, y, z);
    return out;
};

// The head's sections, from his crown to under his chin (m, from the head's centre): [y, half width, depth ahead,
// depth behind, the section's middle forward]. A boy's proportions: wide over the temples, a rounded jaw, a small
// chin; the face's plane upright from brow to chin
HillBoy.HEAD = Object.freeze({
    crownM: 0.104, chinM: 0.096,
    rows: [
        [-0.096, 0.0, 0.012, 0.0, 0.03], [-0.093, 0.024, 0.032, 0.012, 0.03], [-0.086, 0.038, 0.048, 0.025, 0.024], [-0.072, 0.051, 0.062, 0.046, 0.016],
        [-0.053, 0.0595, 0.073, 0.068, 0.008], [-0.03, 0.0672, 0.082, 0.088, 0.002], [-0.005, 0.0735, 0.086, 0.098, 0.0], [0.02, 0.0745, 0.088, 0.101, 0.0],
        [0.045, 0.073, 0.084, 0.099, 0.0], [0.07, 0.064, 0.068, 0.088, 0.0], [0.09, 0.045, 0.042, 0.06, 0.0], [0.104, 0.0, 0.0, 0.0, 0.0]
    ]
});

if (typeof module !== 'undefined' && module.exports) module.exports = { HillBoy, HillBoyShape, HillBoyKit };
