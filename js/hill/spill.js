// HillSpill: the loaves thrown out of the basket when the boy comes off (js/hill/ride.js). The basket's own loaves
// (the model's `loaf` material on its `basket` node) are hidden and six loose ones fly out with the bicycle's speed, a
// little lift and a tumble, bounce low off the cobbles, slide and come to rest; the house fronts turn them back. They
// lie where they fell, the basket empty, until R puts them back (reset). A second fall with an empty basket throws
// nothing.
class HillSpill {
    // The loose loaf (a capsule: radius, middle length), how much of the bicycle's speed it keeps, the lift and the
    // spread it is thrown with (m/s), its tumble (rad/s), its bounce, its slide on the ground (1/s), the speed it rests
    // under, and the seed of the throw
    static get RULE() {
        return Object.freeze({ r: 0.065, lengthM: 0.1, keep: 0.75, lift: [1.6, 2.8], spread: 1.2, spin: 7, bounce: 0.2, slide: 4, restMs: 0.08, seed: 41 });
    }

    // `lane` the HillLane, `rider` the HillRider whose basket holds the loaves
    constructor(lane, rider) {
        this.lane = lane;
        this.rider = rider;
        this.group = new THREE.Group();
        this.group.name = 'hill-spill';
        // The basket's loaves, as the model draws them
        this.inBasket = [];
        const basket = rider.parts.basket;
        let material = null;
        if (basket) {
            basket.traverse(o => {
                if (o.isMesh && o.material && o.material.name === 'loaf') {
                    this.inBasket.push(o);
                    material = o.material;
                }
            });
        }
        if (!this.inBasket.length) console.warn('HillSpill: the basket has no loaves; nothing falls out');
        const R = HillSpill.RULE;
        const geometry = new THREE.CapsuleGeometry(R.r, R.lengthM, 4, 10);
        geometry.rotateX(Math.PI / 2);
        // The model's loaf takes its colour from its vertex colours (the material's own colour is only a dark base),
        // so the loose loaf carries them too: their mean, the crown a little lighter and the base a little darker
        const crust = HillSpill.meanColour(this.inBasket);
        this.crust = crust;
        if (crust) HillSpill.wear(geometry, crust, R.r);
        else material = null;
        material = material || new THREE.MeshStandardMaterial({ color: 0xa8743e, roughness: 0.85 });
        this.loaves = [];
        for (let i = 0; i < 6; i++) {
            const mesh = new THREE.Mesh(geometry, material);
            mesh.name = 'hill-spilt-loaf';
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.visible = false;
            this.group.add(mesh);
            this.loaves.push({ mesh, x: 0, y: 0, z: 0, s: 0, vx: 0, vy: 0, vz: 0, spin: new THREE.Vector3(), moving: false });
        }
        this.at = {};
        this.v = new THREE.Vector3();
        this.q = new THREE.Quaternion();
        this.reset();
    }

    // The loaves back in the basket
    reset() {
        this.spilt = false;
        this.wasDown = false;
        this.rand = HillSpill.seeded(HillSpill.RULE.seed);
        for (const o of this.inBasket) o.visible = true;
        for (const loaf of this.loaves) {
            loaf.mesh.visible = false;
            loaf.moving = false;
        }
    }

    // Colours a loose loaf's `geometry` (radius r, its crown up) as the basket's loaves: their mean `crust`, the crown a
    // little lighter and the base a little darker. Every loose loaf, spilt or thrown, is coloured here and drawn with the
    // basket loaves' material, so it draws as they do
    static wear(geometry, crust, r) {
        const position = geometry.attributes.position, colours = new Float32Array(position.count * 3);
        for (let i = 0; i < position.count; i++) {
            const k = 0.85 + 0.3 * (position.getY(i) / r + 1) / 2;
            colours[i * 3] = crust.r * k;
            colours[i * 3 + 1] = crust.g * k;
            colours[i * 3 + 2] = crust.b * k;
        }
        geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
        // (the model's colours are linear, as glTF keeps them, and so is their mean: marked so the page does not decode
        // them a second time, which drew the loose loaves dark the moment they fell out)
        geometry.userData.linearColors = true;
        return geometry;
    }

    // The mean of the vertex colours of `meshes` (linear, as stored), or null when they carry none
    static meanColour(meshes) {
        let r = 0, g = 0, b = 0, n = 0;
        for (const mesh of meshes) {
            const colour = mesh.geometry && mesh.geometry.attributes.color;
            if (!colour) continue;
            for (let i = 0; i < colour.count; i++) {
                r += colour.getX(i);
                g += colour.getY(i);
                b += colour.getZ(i);
                n++;
            }
        }
        return n ? { r: r / n, g: g / n, b: b / n } : null;
    }

    static seeded(seed) {
        let state = seed >>> 0;
        return () => {
            state = (state * 1664525 + 1013904223) >>> 0;
            return state / 4294967296;
        };
    }

    // One step: on the step the bicycle goes down, the basket empties; then the loose loaves move
    step(bike, dt) {
        const down = bike.crashed;
        if (down && !this.wasDown && !this.spilt && this.inBasket.length) this.throw(bike);
        this.wasDown = down;
        for (const loaf of this.loaves) if (loaf.moving) this.move(loaf, dt);
    }

    // Each loaf from its place in the basket, the way the bicycle was going
    throw(bike) {
        const R = HillSpill.RULE, rand = this.rand, v = bike.vehicle;
        this.spilt = true;
        const basket = this.rider.parts.basket;
        const from = new THREE.Vector3();
        if (basket) {
            this.rider.group.updateMatrixWorld(true);
            basket.getWorldPosition(from);
        } else from.set(v.position.x, v.position.y + 0.9, v.position.z);
        for (const o of this.inBasket) o.visible = false;
        const fx = Math.sin(v.yawAngle), fz = Math.cos(v.yawAngle);
        const speed = Math.max(bike.speed, v.speed || 0) * R.keep;
        this.loaves.forEach((loaf, i) => {
            // Two rows of three, as they sat
            const across = (i % 3 - 1) * 0.16, ahead = i < 3 ? 0.12 : -0.12;
            loaf.x = from.x + fz * across + fx * ahead;
            loaf.z = from.z - fx * across + fz * ahead;
            loaf.y = from.y + 0.25;
            const side = (rand() - 0.5) * 2 * R.spread, up = R.lift[0] + (R.lift[1] - R.lift[0]) * rand();
            loaf.vx = fx * speed + fz * side;
            loaf.vz = fz * speed - fx * side;
            loaf.vy = up;
            loaf.spin.set((rand() - 0.5) * 2 * R.spin, (rand() - 0.5) * 2 * R.spin, (rand() - 0.5) * 2 * R.spin);
            loaf.s = bike.s;
            loaf.mesh.quaternion.setFromAxisAngle(this.v.set(0, 1, 0), v.yawAngle + rand() * Math.PI);
            loaf.mesh.visible = true;
            loaf.moving = true;
            loaf.mesh.position.set(loaf.x, loaf.y, loaf.z);
        });
    }

    // Gravity, a low bounce off the ground, the slide to rest and the house fronts
    move(loaf, dt) {
        const R = HillSpill.RULE, lane = this.lane, r = lane.rule, at = this.at;
        loaf.vy -= 9.81 * dt;
        loaf.x += loaf.vx * dt;
        loaf.y += loaf.vy * dt;
        loaf.z += loaf.vz * dt;
        lane.project(loaf.x, loaf.z, loaf.s, at);
        loaf.s = at.s;
        const p = lane.sample(at.s);
        // The house fronts turn a loaf back into the lane
        const wall = r.halfWidthM + r.flagsM - 0.15 - R.r;
        if (Math.abs(at.across) > wall) {
            const side = Math.sign(at.across), nx = p.leftX * side, nz = p.leftZ * side;
            const into = loaf.vx * nx + loaf.vz * nz;
            if (into > 0) {
                loaf.vx -= (1 + R.bounce) * into * nx;
                loaf.vz -= (1 + R.bounce) * into * nz;
            }
            loaf.x -= nx * (Math.abs(at.across) - wall);
            loaf.z -= nz * (Math.abs(at.across) - wall);
        }
        const ground = p.y + (Math.abs(at.across) > r.halfWidthM ? 0.1 : HillLane.COBBLES.upM) + R.r;
        let grounded = false;
        // On the ground it follows the lane's fall (a loaf does not roll; going down the slope it stays on the cobbles)
        if (loaf.y <= ground || (loaf.y < ground + 0.03 && loaf.vy <= 0.3)) {
            loaf.y = ground;
            if (loaf.vy < 0) loaf.vy = -loaf.vy * R.bounce;
            if (loaf.vy < 0.3) loaf.vy = 0;
            const keep = Math.max(0, 1 - R.slide * dt);
            loaf.vx *= keep;
            loaf.vz *= keep;
            loaf.spin.multiplyScalar(keep);
            grounded = true;
        }
        if (grounded && loaf.vy === 0 && Math.hypot(loaf.vx, loaf.vz) < R.restMs) {
            loaf.moving = false;
            loaf.vx = loaf.vz = 0;
            // At rest it lies on its side along the ground, not on an end
            const yaw = new THREE.Euler().setFromQuaternion(loaf.mesh.quaternion, 'YXZ').y;
            loaf.mesh.quaternion.setFromAxisAngle(this.v.set(0, 1, 0), yaw);
        } else {
            const turn = loaf.spin.length();
            if (turn > 1e-4) loaf.mesh.quaternion.premultiply(this.q.setFromAxisAngle(this.v.copy(loaf.spin).divideScalar(turn), turn * dt));
        }
        loaf.mesh.position.set(loaf.x, loaf.y, loaf.z);
    }

    dispose() {
        if (this.group.parent) this.group.parent.remove(this.group);
        if (this.loaves.length) this.loaves[0].mesh.geometry.dispose();
    }
}
