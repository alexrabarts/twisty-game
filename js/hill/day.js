// HillDay: the hill ride's round as a day's work (js/hill/ride.js runs it). Each day:
//   - the climb: the boy comes up into the opening shot from the bend and pushes the bicycle up the lane on foot, the
//     basket full, to the bakery's cart at the top, seen as the reference stills cut it (CLIMB, HillRide.CLIMB_SHOTS).
//     The climb is not timed;
//   - the restock: at the cart the basket is made up (BASKET loaves), then the ride goes to the opening hold and down;
//   - the deliveries: plain doors down the lane wait for bread (DOORS), each with an empty bread crate on its step. The
//     next one has a lamp lit over it. Q throws a loaf to the left, E to the right; the loaf leaves the basket with the
//     bicycle's speed and the throw (THROW) and flies, bounces and slides. One that comes to the doorstep or the door is
//     delivered; one that misses lies in the street, where a wheel can knock it. A door passed by JUDGE_M without its
//     loaf is missed and adds MISS_MS to the clock (HillBoard.penalise), so the board's time holds it;
//   - the loaves: each throw, a fall (the basket spills) and a hard knock on a kerb (one shakes out) cost loaves. A
//     clean round is every door delivered and no loaf lost;
//   - the hazards: a cat that runs across, a horse and cart coming up the lane and washing that blows out over the lane
//     (HAZARDS). They are the same on every ride, set by where the bicycle is or by the time since the roll-off, so the
//     board stays fair, and each leaves room to pass;
//   - the freewheel: the longest distance ridden with the legs out, no pedal and no brake.
// Nothing of this shows during the ride but the lamp over the next door; the end card shows the rest (summary).
class HillDay {
    // The climb: from fromS (just out of the opening shot, behind the wall at the bend) up to triggerS (s on the lane;
    // the cart stands just above), starting on the line `across`. The hill is too steep to ride: he walks beside the
    // bicycle and pushes it at about walkMs while the pedal key is held (the push is walkBase of the drive, more by
    // walkGain for each m/s under walkMs, and by walkHold, which builds up for each m/s over a second and holds the pace
    // on any grade), and holds it on the brake when the key is let go. The stall stands at `stall` ([s, across] of its
    // middle, its long side along the lane). Over the last turnInM before `meet` ([s, across]: in front of the stall)
    // he wheels the bicycle in to it, whatever the keys say, steering for `meet` (turnGain of the steer for each radian
    // off), so it comes to the stall nearly across the lane, as the last stills have it; the climb ends within meetM
    // of `meet`, or at triggerS
    static get CLIMB() {
        return Object.freeze({ fromS: 64, triggerS: 27, across: -0.6, stall: [28.6, 2.65], meet: [28.6, 1.15], turnInM: 5.5, turnGain: 2.0, meetM: 0.4,
            restockS: 1.4, walkMs: 1.5, walkBase: 0.4, walkGain: 1.2, walkHold: 0.6 });
    }

    // The loaves the basket holds when full
    static get BASKET() { return 6; }

    // The doors that wait for bread: a cottage's front door near s on the side (+1 left going down)
    static get DOORS() {
        return Object.freeze([{ s: 104, side: 1 }, { s: 174, side: -1 }, { s: 259, side: 1 }, { s: 343, side: -1 }]);
    }

    // A door is judged once the bicycle is this far past it; a missed one costs this on the clock
    static get JUDGE_M() { return 22; }
    static get MISS_MS() { return 5000; }

    // The throw: across (m/s, to the side), up (m/s), from the basket (ahead, up of the bicycle's place); the loaf's
    // radius, its bounce, its slide (1/s) and the speed it rests under. The doorstep: along the door, out from the
    // wall over the step, and up from the floor
    static get THROW() {
        return Object.freeze({ across: 5.2, up: 2.4, ahead: 0.55, from: 1.0, r: 0.08, bounce: 0.25, slide: 5, restMs: 0.1, g: 9.81,
            step: { along: 0.85, out: 1.4, up: 2.3 } });
    }

    // A kerb knock over this speed shakes a loaf out
    static get BUMP_MS() { return 5; }

    // The hazards. cat: it waits by a door on `side` at s and runs across the lane at speedMs when the bicycle is
    // triggerM short of it. cart: a horse and cart that sets off up the lane from fromS at speedMs at the roll-off,
    // keeping to `across`. washing: sheets on a line along the house fronts on `side` from s to s + lengthM, which blow
    // out over the lane up to reachM on a cycle of periodS
    static get HAZARDS() {
        return Object.freeze({
            cat: { s: 205, side: 1, triggerM: 30, speedMs: 3.5 },
            cart: { fromS: 262, speedMs: 1.2, across: -1.55, halfW: 0.75, halfL: 2.7, stopS: 30 },
            washing: { s: 318, side: 1, lengthM: 4, reachM: 1.9, periodS: 5, lowM: 0.9 }
        });
    }

    // The local bests the card shows (localStorage)
    static get FREEWHEEL_KEY() { return 'hillFreewheelBest'; }

    constructor(lane) {
        this.lane = lane;
        this.doors = HillDay.findDoors(lane);
        this.day = 1;
        this.loose = [];
        this.at = {};
        this.restock();
        this.climbing = false;
    }

    // The doors from the lane's cottages: for each wanted place, the front door on that side nearest it
    static findDoors(lane) {
        const found = [];
        for (const want of HillDay.DOORS) {
            let best = null;
            for (const c of lane.cottages) {
                if (c.side !== want.side || !(c.wide > 0) || !(c.door >= 0)) continue;
                const along = -c.hw + c.wide * c.door;
                const x = c.x + c.alongX * along - c.outX * c.hd, z = c.z + c.alongZ * along - c.outZ * c.hd;
                const at = lane.project(x, z, want.s, {});
                // Only a door that fronts the lane, behind its strip of flags
                if (Math.abs(at.across) > lane.rule.halfWidthM + 2) continue;
                const d = Math.abs(at.s - want.s);
                if (!best || d < best.d) best = { d, c, along, x, z, s: at.s, across: at.across };
            }
            if (best) {
                const { c, along, x, z, s, across } = best;
                found.push({ c, along, x, z, y: c.floor, s, across, side: want.side, outX: -c.outX, outZ: -c.outZ, alongX: c.alongX, alongZ: c.alongZ });
            }
        }
        return found;
    }

    // A new day: the basket full, every door waiting, the street clear of loaves, the hazards back at their places
    restock() {
        this.loaves = HillDay.BASKET;
        this.thrown = 0;
        this.lost = 0;
        this.falls = 0;
        this.bumps = 0;
        this.states = this.doors.map(() => 'waiting');
        for (const loaf of this.loose) loaf.gone = true;
        this.loose = [];
        this.wasDown = false;
        this.running = false;
        this.since = 0;
        this.freewheel = { run: 0, best: 0 };
        const H = HillDay.HAZARDS;
        this.cat = { state: 'waiting', s: H.cat.s, across: H.cat.side * (this.lane.rule.halfWidthM + 0.9), hit: false };
        this.cart = { s: H.cart.fromS, across: H.cart.across, hit: false };
        this.washing = { blow: 0, hit: false };
        this.events = [];
    }

    // The roll-off: the hazards that run on time start now
    begin() {
        this.running = true;
        this.since = 0;
    }

    // The next door that waits, or -1
    get next() {
        return this.states.indexOf('waiting');
    }

    get delivered() { return this.states.filter(s => s === 'delivered').length; }
    get missed() { return this.states.filter(s => s === 'missed').length; }

    // A throw to `side` (+1 left, -1 right) from the bicycle: a loaf leaves the basket with the bicycle's speed and the
    // throw. Returns the loaf, or null with an empty basket or off the descent
    throw(side, bike) {
        if (!this.running || this.loaves <= 0 || bike.crashed) return null;
        const T = HillDay.THROW, v = bike.vehicle, p = this.lane.sample(bike.s);
        const fx = Math.sin(v.yawAngle), fz = Math.cos(v.yawAngle);
        const loaf = {
            x: v.position.x + fx * T.ahead, y: v.position.y + T.from, z: v.position.z + fz * T.ahead,
            vx: fx * v.speed + p.leftX * side * T.across, vy: T.up, vz: fz * v.speed + p.leftZ * side * T.across,
            s: bike.s, moving: true, door: -1, knocked: false, thrown: true, spin: 0
        };
        this.loaves--;
        this.thrown++;
        this.loose.push(loaf);
        return loaf;
    }

    // A loaf shaken out by a knock: it drops beside the basket
    shake(bike) {
        const v = bike.vehicle;
        this.loose.push({ x: v.position.x, y: v.position.y + 0.9, z: v.position.z, vx: Math.sin(v.yawAngle) * v.speed * 0.6, vy: 1, vz: Math.cos(v.yawAngle) * v.speed * 0.6, s: bike.s, moving: true, door: -1, thrown: false, spin: 0 });
    }

    // One physics step: the loaves in the air, the doors, the basket, the hazards and the freewheel. `controls` is the
    // step's input. Returns the step's events: { delivered: door }, { missed: door }, { knock }, { lost: n },
    // { hazard: name, fall }
    step(dt, bike, controls = {}) {
        const events = [];
        const v = bike.vehicle;
        if (this.running) this.since += dt;
        for (const loaf of this.loose) if (loaf.moving) this.fly(loaf, dt, events);

        if (this.running) {
            // A fall spills what the basket holds (HillSpill throws them)
            const down = bike.crashed;
            if (down && !this.wasDown) {
                this.falls++;
                if (this.loaves > 0) events.push({ lost: this.loaves });
                this.lost += this.loaves;
                this.loaves = 0;
            }
            this.wasDown = down;
            // A hard knock on a kerb shakes one out
            if (v.brushNew) {
                v.brushNew = false;
                if (!down && v.speed > HillDay.BUMP_MS && this.loaves > 0) {
                    this.loaves--;
                    this.lost++;
                    this.bumps++;
                    this.shake(bike);
                    events.push({ lost: 1 });
                }
            }
            // A door passed without its loaf
            this.states.forEach((state, i) => {
                if (state === 'waiting' && bike.s > this.doors[i].s + HillDay.JUDGE_M) {
                    this.states[i] = 'missed';
                    events.push({ missed: i });
                }
            });
            this.hazards(dt, bike, events);
            this.ride(dt, bike, controls);
            // A loaf lying in the street is knocked by a wheel, and costs the bicycle a little
            for (const loaf of this.loose) {
                if (loaf.door >= 0 || loaf.gone) continue;
                const dx = loaf.x - v.position.x, dz = loaf.z - v.position.z;
                if (!loaf.moving && dx * dx + dz * dz < 0.45 * 0.45 && v.speed > 1) {
                    loaf.moving = true;
                    loaf.vx = Math.sin(v.yawAngle) * v.speed * 0.5 + dx * 2;
                    loaf.vz = Math.cos(v.yawAngle) * v.speed * 0.5 + dz * 2;
                    loaf.vy = 1.2;
                    v.speed *= 0.97;
                    events.push({ knock: 'street' });
                }
            }
        }
        this.events.push(...events);
        return events;
    }

    // A loaf in the air or sliding: falls, bounces off the cobbles, slides to rest; a doorstep or a door takes it; a
    // house front turns it back with a knock
    fly(loaf, dt, events) {
        const T = HillDay.THROW, lane = this.lane;
        loaf.vy -= T.g * dt;
        loaf.x += loaf.vx * dt;
        loaf.y += loaf.vy * dt;
        loaf.z += loaf.vz * dt;
        loaf.spin += dt * 9;
        // The door it was thrown at: a waiting door whose step or door the loaf reaches
        if (loaf.thrown && !loaf.knocked && loaf.door < 0) {
            for (let i = 0; i < this.doors.length; i++) {
                if (this.states[i] !== 'waiting') continue;
                const d = this.doors[i], dx = loaf.x - d.x, dz = loaf.z - d.z;
                const u = dx * d.alongX + dz * d.alongZ, w = dx * d.outX + dz * d.outZ, up = loaf.y - d.y;
                if (Math.abs(u) < T.step.along && w < T.step.out && w > -0.3 && up < T.step.up && up > -0.4) {
                    this.states[i] = 'delivered';
                    loaf.door = i;
                    loaf.moving = false;
                    // On the step, by the crate
                    loaf.x = d.x + d.outX * 0.3 + d.alongX * 0.18;
                    loaf.z = d.z + d.outZ * 0.3 + d.alongZ * 0.18;
                    loaf.y = d.y + T.r;
                    loaf.vx = loaf.vy = loaf.vz = 0;
                    events.push({ delivered: i });
                    return;
                }
            }
        }
        // A house front: the loaf knocks and drops back into the street
        for (const c of lane.solids) {
            const dx = loaf.x - c.x, dz = loaf.z - c.z, far = c.hw + c.hd + 0.2;
            if (Math.abs(dx) > far || Math.abs(dz) > far) continue;
            const u = dx * c.alongX + dz * c.alongZ, w = dx * c.outX + dz * c.outZ;
            if (Math.abs(u) < c.hw && Math.abs(w) < c.hd) {
                const back = -(c.hd + 0.02) - w;
                loaf.x += c.outX * back;
                loaf.z += c.outZ * back;
                // It drops back off the wall with little of its speed
                const into = loaf.vx * c.outX + loaf.vz * c.outZ;
                if (into > 0) {
                    loaf.vx -= c.outX * into * 1.2;
                    loaf.vz -= c.outZ * into * 1.2;
                }
                loaf.vx *= 0.3;
                loaf.vz *= 0.3;
                if (!loaf.knocked) events.push({ knock: 'house' });
                loaf.knocked = true;
            }
        }
        lane.project(loaf.x, loaf.z, loaf.s, this.at);
        loaf.s = this.at.s;
        const ground = lane.sample(this.at.s).y + T.r;
        if (loaf.y < ground) {
            loaf.y = ground;
            if (loaf.vy < -1) loaf.vy = -loaf.vy * T.bounce;
            else loaf.vy = 0;
            const keep = Math.exp(-T.slide * dt);
            loaf.vx *= keep;
            loaf.vz *= keep;
            if (Math.hypot(loaf.vx, loaf.vz) < T.restMs && loaf.vy === 0) loaf.moving = false;
        }
    }

    // The cat, the cart and the washing: each a fair hazard with room to pass
    hazards(dt, bike, events) {
        const H = HillDay.HAZARDS, v = bike.vehicle, half = this.lane.rule.halfWidthM;
        // The cat: off once the bicycle is triggerM short of it, across the lane and away; a wheel into it is a wobble
        const cat = this.cat;
        if (cat.state === 'waiting' && bike.s > H.cat.s - H.cat.triggerM) cat.state = 'running';
        if (cat.state === 'running') {
            cat.across -= H.cat.side * H.cat.speedMs * dt;
            if (Math.abs(cat.across) > half + 1 && Math.sign(cat.across) === -H.cat.side) cat.state = 'gone';
            if (!cat.hit && !bike.crashed && Math.abs(bike.s - cat.s) < 0.7 && Math.abs(bike.across - cat.across) < 0.45) {
                cat.hit = true;
                v.speed *= 0.8;
                events.push({ hazard: 'cat', fall: false });
            }
        }
        // The cart: up the lane on its side from the roll-off; into it at speed is a fall, slowly a stop
        const cart = this.cart;
        if (cart.s > H.cart.stopS) cart.s = Math.max(H.cart.stopS, H.cart.fromS - H.cart.speedMs * this.since);
        if (!bike.crashed && Math.abs(bike.s - cart.s) < H.cart.halfL + 0.6 && Math.abs(bike.across - cart.across) < H.cart.halfW + 0.35) {
            if (!cart.hit) events.push({ hazard: 'cart', fall: v.speed > 4 });
            cart.hit = true;
            if (v.speed > 4) {
                v.crashed = true;
                v.crashWhy = 'obstacle';
            } else v.speed = 0;
        } else cart.hit = false;
        // The washing: blows out from the side on its cycle; through it at head height is a wobble
        const wash = this.washing, t = this.since / H.washing.periodS;
        wash.blow = Math.max(0, Math.sin(t * Math.PI * 2)) ** 2;
        const reach = half - H.washing.reachM * wash.blow;
        const into = H.washing.side > 0 ? bike.across > reach : bike.across < -reach;
        if (wash.blow > 0.3 && !wash.hit && into && bike.s > H.washing.s && bike.s < H.washing.s + H.washing.lengthM) {
            wash.hit = true;
            v.speed *= 0.85;
            events.push({ hazard: 'washing', fall: false });
        }
    }

    // The freewheel: legs out, no pedal and no brake, on the bicycle
    ride(dt, bike, controls) {
        const f = this.freewheel;
        if (bike.legsOut && !bike.crashed && !(controls.pedal > 0) && !(controls.brake > 0)) {
            f.run += bike.speed * dt;
            f.best = Math.max(f.best, f.run);
        } else f.run = 0;
    }

    // The basket as the loaves left: `inBasket` the model's loaf meshes (HillSpill); after a spill they stay hidden
    showBasket(inBasket, spilt) {
        if (!inBasket || spilt) return;
        const share = this.loaves / HillDay.BASKET;
        inBasket.forEach((o, i) => { o.visible = i < Math.round(share * inBasket.length); });
    }

    // What the end card shows of the day
    summary() {
        const doors = this.doors.length, delivered = this.delivered;
        return {
            day: this.day, doors, delivered, missed: doors - delivered, loaves: this.loaves, lost: this.lost, falls: this.falls,
            clean: delivered === doors && this.lost === 0, freewheelM: Math.round(this.freewheel.best), missMs: (doors - delivered) * HillDay.MISS_MS
        };
    }

    // The drawing: the crates and lamps at the doors, the loose loaves, the cat, the horse and cart, the washing and
    // the bakery's cart at the top. Plain shapes, no text
    build() {
        const g = new THREE.Group();
        g.name = 'hill-day';
        const lane = this.lane, T = HillDay.THROW;
        const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
        const wood = mat(0x7a5a3a), crust = mat(0xb87a3e), dark = mat(0x2a2622), cloth = mat(0xece6d8, { side: THREE.DoubleSide });
        const box = (w, h, d, m) => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            return mesh;
        };
        const yawOf = (x, z) => Math.atan2(x, z);
        this.lamps = [];
        for (const d of this.doors) {
            const crate = box(0.5, 0.28, 0.36, wood);
            crate.position.set(d.x + d.outX * 0.32 - d.alongX * 0.2, d.y + 0.14, d.z + d.outZ * 0.32 - d.alongZ * 0.2);
            crate.rotation.y = yawOf(d.outX, d.outZ);
            g.add(crate);
            // The lamp over the door: lit for the next door only
            const lamp = box(0.18, 0.24, 0.12, new THREE.MeshStandardMaterial({ color: 0x302820, emissive: 0xffb050, emissiveIntensity: 0 }));
            lamp.position.set(d.x + d.outX * 0.12, d.y + 2.35, d.z + d.outZ * 0.12);
            lamp.rotation.y = crate.rotation.y;
            g.add(lamp);
            this.lamps.push(lamp);
        }
        const loafGeometry = new THREE.CapsuleGeometry(T.r, 0.16, 4, 10);
        loafGeometry.rotateX(Math.PI / 2);
        this.loafMeshes = [];
        for (let i = 0; i < HillDay.BASKET + 8; i++) {
            const mesh = new THREE.Mesh(loafGeometry, crust);
            mesh.castShadow = true;
            mesh.visible = false;
            g.add(mesh);
            this.loafMeshes.push(mesh);
        }
        // The cat: a low dark body, a head and a tail
        const cat = new THREE.Group();
        const body = box(0.14, 0.14, 0.4, dark);
        body.position.y = 0.2;
        const head = box(0.12, 0.12, 0.12, dark);
        head.position.set(0, 0.3, 0.24);
        const tail = box(0.03, 0.03, 0.3, dark);
        tail.position.set(0, 0.3, -0.3);
        tail.rotation.x = -0.6;
        const legs = [-1, 1].flatMap(a => [-1, 1].map(b => { const l = box(0.04, 0.16, 0.04, dark); l.position.set(a * 0.05, 0.08, b * 0.14); return l; }));
        cat.add(body, head, tail, ...legs);
        this.catMesh = cat;
        g.add(cat);
        // The horse and cart: the horse ahead, up the lane, the cart behind with two wheels
        const cart = new THREE.Group();
        const bay = mat(0x5a3a26);
        const horse = box(0.55, 0.7, 1.6, bay);
        horse.position.set(0, 1.25, 1.3);
        const neck = box(0.3, 0.7, 0.35, bay);
        neck.position.set(0, 1.75, 2.05);
        neck.rotation.x = 0.5;
        const muzzle = box(0.25, 0.25, 0.5, bay);
        muzzle.position.set(0, 2.0, 2.35);
        const horseLegs = [-1, 1].flatMap(a => [-1, 1].map(b => { const l = box(0.12, 0.95, 0.12, bay); l.position.set(a * 0.18, 0.47, 1.3 + b * 0.6); return l; }));
        const bed = box(1.3, 0.35, 2.0, wood);
        bed.position.set(0, 0.85, -0.9);
        const shafts = [-1, 1].map(a => { const s = box(0.06, 0.06, 1.6, wood); s.position.set(a * 0.4, 1.0, 0.6); return s; });
        const wheels = [-1, 1].map(a => {
            const w = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.08, 16), dark);
            w.rotation.z = Math.PI / 2;
            w.position.set(a * 0.72, 0.55, -0.9);
            w.castShadow = true;
            return w;
        });
        cart.add(horse, neck, muzzle, ...horseLegs, bed, ...shafts, ...wheels);
        this.cartMesh = cart;
        g.add(cart);
        // The washing: a line along the house fronts on its side, three sheets on it
        const H = HillDay.HAZARDS.washing;
        this.sheets = [];
        for (let i = 0; i < 3; i++) {
            const pivot = new THREE.Group();
            const sheet = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.3), cloth);
            sheet.position.y = -0.65;
            sheet.castShadow = true;
            pivot.add(sheet);
            g.add(pivot);
            this.sheets.push({ pivot, s: H.s + 0.7 + i * 1.3 });
        }
        const a = lane.at(H.s, H.side * (lane.rule.halfWidthM + 0.1), 2.6, {}), b = lane.at(H.s + H.lengthM, H.side * (lane.rule.halfWidthM + 0.1), 2.6, {});
        const line = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z), 4), dark);
        line.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
        line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z).normalize());
        g.add(line);
        // The bakery's cart at the top, where the climb ends: a handcart with trays of loaves
        const C = HillDay.CLIMB, top = lane.at(C.stall[0], C.stall[1], 0, {}), p = lane.sample(C.stall[0]);
        const handcart = new THREE.Group();
        const tray = box(1.0, 0.12, 0.7, wood);
        tray.position.y = 0.85;
        const legsCart = [-1, 1].map(k => { const l = box(0.06, 0.8, 0.06, wood); l.position.set(k * 0.45, 0.4, -0.3); return l; });
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 14), dark);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(0, 0.3, 0.3);
        handcart.add(tray, ...legsCart, wheel);
        for (let i = 0; i < 6; i++) {
            const loaf = new THREE.Mesh(loafGeometry, crust);
            loaf.position.set(-0.3 + (i % 3) * 0.3, 0.98, -0.15 + Math.floor(i / 3) * 0.3);
            handcart.add(loaf);
        }
        handcart.position.set(top.x, top.y, top.z);
        handcart.rotation.y = p.heading + Math.PI / 2;
        g.add(handcart);
        this.group = g;
        this.draw();
        return g;
    }

    // Moves the drawing to the state
    draw() {
        if (!this.group) return;
        const lane = this.lane, H = HillDay.HAZARDS, next = this.next;
        const pulse = 0.5 + 0.5 * Math.sin((this.since || 0) * 3);
        this.lamps.forEach((lamp, i) => { lamp.material.emissiveIntensity = i === next && !this.climbing ? 1.2 + pulse * 0.8 : 0; });
        // The latest loaves, as many as there are meshes
        const shown = this.loose.filter(l => !l.gone).slice(-this.loafMeshes.length);
        this.loafMeshes.forEach((mesh, i) => {
            const loaf = shown[i];
            mesh.visible = !!loaf;
            if (loaf) {
                mesh.position.set(loaf.x, loaf.y, loaf.z);
                mesh.rotation.set(0, Math.atan2(loaf.vx, loaf.vz) || 0, loaf.moving ? loaf.spin : 0);
            }
        });
        const cat = this.cat, catAt = lane.at(cat.s, cat.across, 0, {}), cp = lane.sample(cat.s);
        this.catMesh.visible = cat.state !== 'gone';
        this.catMesh.position.set(catAt.x, catAt.y, catAt.z);
        this.catMesh.rotation.y = cp.heading + (H.cat.side > 0 ? -Math.PI / 2 : Math.PI / 2);
        const cart = this.cart, cartAt = lane.at(cart.s, cart.across, 0, {}), kp = lane.sample(cart.s);
        this.cartMesh.position.set(cartAt.x, cartAt.y, cartAt.z);
        // Facing up the lane
        this.cartMesh.rotation.y = kp.heading + Math.PI;
        for (const sheet of this.sheets) {
            const at = lane.at(sheet.s, H.washing.side * (lane.rule.halfWidthM + 0.1), 2.6, {}), sp = lane.sample(sheet.s);
            sheet.pivot.position.set(at.x, at.y, at.z);
            // The sheet hangs along the line, and is blown out about it towards the middle of the lane
            sheet.pivot.rotation.set(0, sp.heading + Math.PI / 2, 0);
            sheet.pivot.rotateX(H.washing.side * this.washing.blow * 1.2);
        }
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { HillDay };
