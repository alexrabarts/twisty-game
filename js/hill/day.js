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
    // of `meet`, or at triggerS. He slows as he wheels it in, to slowM of his pace at `meet`. After the restock (restockS)
    // he gets on in a fade to black (HillRide.FADES), turned round where he stands, and the descent starts from there
    static get CLIMB() {
        return Object.freeze({ fromS: 64, triggerS: 27, across: -0.6, stall: [28.1, 2.65], meet: [28.6, 1.15], turnInM: 5.5, turnGain: 2.0, meetM: 0.4, slowM: 0.55,
            restockS: 1.4, walkMs: 1.5, walkBase: 0.4, walkGain: 1.2, walkHold: 0.6 });
    }

    // The washing's sheets keep clearM from every house, porch and wall through their whole flap (tests/unit/hill-day.test.js):
    // they hang plumb at rest and blow out only towards the lane, so their line stands clearM in from the nearest face
    // of anything on its side along its length (HillDay.washingFaces), and never further out than lineM over the lane's
    // edge
    // foldM: how far the cloth's folds stand out of its plane either way, and bendM how much nearer the houses the ends
    // of a wide piece come where the lane bends under it (the line stands that much further in, so they keep clearM
    // too); the pieces on the line: [width, drop, kind]
    static get WASHING() {
        return Object.freeze({ clearM: 0.15, lineM: 0.1, upM: 2.6, foldM: 0.035, bendM: 0.01, pieces: [[1.1, 1.3, 'sheet'], [0.62, 0.78, 'shirt'], [0.55, 0.85, 'towel']] });
    }

    // How far out from the lane's middle (m, on the washing's side) the nearest face stands along the washing's length:
    // a front wall or railing at the flags' edge, a porch, a shop's bay, a house front, a wall in a gap
    static washingFace(lane) {
        const H = HillDay.HAZARDS.washing, r = lane.rule, edge = r.halfWidthM + r.flagsM;
        let face = edge;
        for (const c of lane.cottages) {
            if (c.side !== H.side || c.to < H.s - 0.6 || c.from > H.s + H.lengthM + 0.6) continue;
            const out = edge + (c.back || 0);
            if (c.front === 'garden' || c.front === 'railing') face = Math.min(face, out - (r.flagsM - 0.15) - 0.15);
            if (c.porch) face = Math.min(face, out - 1.0);
            if (c.bay) face = Math.min(face, out - 0.5);
            face = Math.min(face, out);
        }
        for (const w of lane.walls) {
            if (w.side !== H.side || w.to < H.s - 0.6 || w.from > H.s + H.lengthM + 0.6) continue;
            face = Math.min(face, edge + 0.15 - 0.15);
        }
        return face;
    }

    // Where the washing's line stands across the lane (m out from the middle, on its side)
    static washingLine(lane) {
        const W = HillDay.WASHING;
        return Math.min(lane.rule.halfWidthM + W.lineM, HillDay.washingFace(lane) - W.clearM - W.foldM - W.bendM);
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

    // A piece of washing hung from its line at y = 0, `w` wide and `drop` long, as shapes: the cloth in soft folds (more
    // towards its foot, WASHING.foldM at most either way), a shirt with its sleeves hanging from its shoulders, a towel
    // with a band across its foot
    static clothPieces(w, drop, kind) {
        const F = HillDay.WASHING.foldM;
        const cloth = (width, height, x0, y0, phase) => {
            const g = new THREE.PlaneGeometry(width, height, 8, 8), p = g.attributes.position;
            for (let i = 0; i < p.count; i++) {
                const x = p.getX(i), y = p.getY(i), down = (height / 2 - y) / height;
                p.setZ(i, F * (0.35 + 0.65 * down) * Math.sin((x / width) * Math.PI * 5 + phase) * Math.min(1, down * 3 + 0.2));
                p.setXYZ(i, x + x0, y + y0, p.getZ(i));
            }
            g.computeVertexNormals();
            return g;
        };
        if (kind === 'shirt') {
            const body = cloth(w * 0.62, drop, 0, -drop / 2, 0.7);
            const sleeves = [-1, 1].map(a => cloth(w * 0.17, drop * 0.62, a * w * 0.4, -drop * 0.31 - 0.04, a * 1.3));
            return [body, ...sleeves];
        }
        const main = cloth(w, drop, 0, -drop / 2, kind === 'towel' ? 2.1 : 0);
        if (kind === 'towel') return [main, cloth(w, 0.07, 0, -drop + 0.12, 2.1).translate(0, 0, 0.004)];
        return [main];
    }

    // Boxes (each [w, h, d, x, y, z]) as one shape
    static boxes(list) {
        const positions = [], normals = [];
        for (const [w, h, d, x, y, z] of list) {
            const n = new THREE.BoxGeometry(w, h, d).translate(x, y, z).toNonIndexed();
            positions.push(...n.attributes.position.array);
            normals.push(...n.attributes.normal.array);
        }
        const out = new THREE.BufferGeometry();
        out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        out.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        return out;
    }

    // A baker's bread crate on the step, its foot at 0: a slatted floor, a post at each corner, two slats along each
    // side with a gap between, a hand hole's bar at each end
    static crateShape() {
        const w = 0.5, h = 0.28, d = 0.36, t = 0.018, list = [[w, t, d, 0, t / 2, 0]];
        for (const a of [-1, 1]) for (const b of [-1, 1]) list.push([0.035, h, 0.035, a * (w / 2 - 0.018), h / 2, b * (d / 2 - 0.018)]);
        for (const y of [0.07, 0.2]) {
            for (const b of [-1, 1]) list.push([w - 0.04, 0.07, t, 0, y, b * (d / 2 - t / 2)]);
            for (const a of [-1, 1]) list.push([t, 0.07, d - 0.04, a * (w / 2 - t / 2), y, 0]);
        }
        return HillDay.boxes(list);
    }

    // The door lamp's iron: a cap over the glass, a base under it, the four corner bars, and the bracket back to the
    // wall with its stay (the glass is a box of its own, lit by the day)
    static lanternShape() {
        const list = [[0.18, 0.03, 0.18, 0, 0.1, 0], [0.11, 0.04, 0.11, 0, 0.135, 0], [0.04, 0.05, 0.04, 0, 0.17, 0], [0.16, 0.025, 0.16, 0, -0.095, 0]];
        for (const a of [-1, 1]) for (const b of [-1, 1]) list.push([0.014, 0.18, 0.014, a * 0.068, 0, b * 0.068]);
        // (the bracket from the lamp's top back to the wall, and the stay under it)
        list.push([0.02, 0.02, 0.22, 0, 0.2, -0.11], [0.016, 0.14, 0.016, 0, 0.14, -0.2]);
        return HillDay.boxes(list);
    }

    // The horse and cart drawn from their model (HillHorse) in place of the plain blocks built with the day
    dressCart(horse) {
        if (!this.cartMesh || !horse) return false;
        const at = this.cartMesh.parent;
        if (at) at.remove(this.cartMesh);
        this.cartMesh = horse.group;
        this.horse = horse;
        if (at) at.add(horse.group);
        return true;
    }

    // The thrown loaves drawn as the basket's own (HillSpill.wear): its loaves' `material` and their mean colour `crust`
    wearLoaves(material, crust) {
        if (!material || !crust || !this.loafMeshes || !this.loafMeshes.length) return false;
        const geometry = HillSpill.wear(this.loafMeshes[0].geometry, crust, HillDay.THROW.r);
        for (const mesh of this.loafMeshes) {
            mesh.geometry = geometry;
            mesh.material = material;
        }
        return true;
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
        this.waiters = [];
        this.halls = [];
        this.pools = [];
        const WAIT = HillDay.WAITING;
        const crateShape = HillDay.crateShape(), lanternShape = HillDay.lanternShape(), iron = mat(0x23201c, { roughness: 0.6, metalness: 0.4 });
        for (const d of this.doors) {
            const crate = new THREE.Mesh(crateShape, wood);
            crate.castShadow = true;
            crate.receiveShadow = true;
            crate.position.set(d.x + d.outX * 0.32 - d.alongX * 0.2, d.y, d.z + d.outZ * 0.32 - d.alongZ * 0.2);
            crate.rotation.y = yawOf(d.outX, d.outZ);
            g.add(crate);
            // The lamp over the door, on its iron bracket: its glass lit for the next door only
            const lantern = new THREE.Mesh(lanternShape, iron);
            lantern.position.set(d.x + d.outX * 0.2, d.y + 2.35, d.z + d.outZ * 0.2);
            lantern.rotation.y = crate.rotation.y;
            lantern.castShadow = true;
            g.add(lantern);
            const lamp = box(0.13, 0.17, 0.13, new THREE.MeshStandardMaterial({ color: 0x302820, emissive: 0xffb050, emissiveIntensity: 0, roughness: 0.2 }));
            lamp.castShadow = false;
            lamp.position.copy(lantern.position);
            lamp.rotation.y = crate.rotation.y;
            g.add(lamp);
            this.lamps.push(lamp);
            const woman = HillDay.waiting(mat, box, this.doors.indexOf(d));
            // (on the door's uphill side, so the rider coming down sees her first)
            const lp = lane.sample(d.s);
            d.waitSide = d.alongX * lp.alongX + d.alongZ * lp.alongZ > 0 ? -1 : 1;
            woman.position.set(d.x + d.outX * WAIT.outM + d.alongX * WAIT.alongM * d.waitSide, d.y, d.z + d.outZ * WAIT.outM + d.alongZ * WAIT.alongM * d.waitSide);
            woman.rotation.y = crate.rotation.y;
            g.add(woman);
            this.waiters.push(woman);
            // The door stands open on a warm lit hall while it waits (WAITING.glow), and shuts once served
            const hall = box(0.84, 1.95, 0.02, new THREE.MeshStandardMaterial({ color: 0x2a1c10, emissive: 0xffb466, emissiveIntensity: 0 }));
            hall.position.set(d.x + d.outX * 0.11, d.y + 0.99, d.z + d.outZ * 0.11);
            hall.rotation.y = crate.rotation.y;
            hall.castShadow = false;
            g.add(hall);
            this.halls.push(hall);
            // The hall's light thrown out on the flags before the door: a soft warm pool, seen from the chase camera at
            // speed when the door itself is edge on to it
            const pool = new THREE.Mesh(new THREE.CircleGeometry(WAIT.poolM, 24), new THREE.MeshBasicMaterial({ color: 0xffc27a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
            const px = d.x + d.outX * WAIT.poolOutM, pz = d.z + d.outZ * WAIT.poolOutM;
            pool.position.set(px, lane.ground().surfaceAt(px, pz) + 0.02, pz);
            pool.rotation.x = -Math.PI / 2;
            g.add(pool);
            this.pools.push(pool);
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
        // The cat: a dark tabby, long and low: a round body deeper at the chest, a round head with its ears up and a short
        // muzzle, a white bib, the tail curving up behind
        const cat = new THREE.Group();
        const tabby = mat(0x3a332c), bib = mat(0xd8d0c2), part = (geometry, m) => {
            const mesh = new THREE.Mesh(geometry, m);
            mesh.castShadow = true;
            return mesh;
        };
        const body = part(new THREE.CapsuleGeometry(0.075, 0.24, 4, 10).rotateX(Math.PI / 2).scale(0.95, 1, 1), tabby);
        body.position.y = 0.2;
        const chest = part(new THREE.SphereGeometry(0.068, 10, 8).scale(1, 1.1, 0.9), bib);
        chest.position.set(0, 0.19, 0.15);
        const head = new THREE.Group();
        head.position.set(0, 0.3, 0.24);
        head.add(part(new THREE.SphereGeometry(0.062, 12, 10).scale(1.05, 0.95, 1), tabby));
        const snout = part(new THREE.SphereGeometry(0.03, 8, 6).scale(1.2, 0.8, 1), bib);
        snout.position.set(0, -0.02, 0.05);
        head.add(snout);
        for (const a of [-1, 1]) {
            const ear = part(new THREE.ConeGeometry(0.024, 0.05, 4), tabby);
            ear.position.set(a * 0.035, 0.06, 0.0);
            ear.rotation.z = -a * 0.25;
            head.add(ear);
        }
        const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.22, -0.18), new THREE.Vector3(0, 0.26, -0.3), new THREE.Vector3(0, 0.36, -0.38), new THREE.Vector3(0, 0.46, -0.36)]);
        const tail = part(new THREE.TubeGeometry(curve, 10, 0.016, 6, false), tabby);
        // Each leg on a pivot at its hip or shoulder (CAT_GAIT), the leg hanging from it
        const G = HillDay.CAT_GAIT;
        this.catLegs = [-1, 1].flatMap(a => [-1, 1].map(b => {
            const pivot = new THREE.Group();
            pivot.position.set(a * 0.05, G.legM, b * 0.14);
            const l = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.016, G.legM, 6), tabby);
            l.castShadow = true;
            l.position.y = -G.legM / 2;
            pivot.add(l);
            const paw = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 4).scale(1, 0.6, 1.3), b > 0 ? bib : tabby);
            paw.position.set(0, -G.legM + 0.008, 0.008);
            pivot.add(paw);
            // (a gallop: the fore legs a little apart, the hind legs half a stride on)
            pivot.userData.phase = (b > 0 ? 0 : 0.5) + (a > 0 ? 0.08 : 0);
            return pivot;
        }));
        cat.add(body, chest, head, tail, ...this.catLegs);
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
        const peg = new THREE.BoxGeometry(0.018, 0.07, 0.022), pegWood = mat(0xb89a70);
        const shades = [0xece6d8, 0x9aa8b8, 0xd8c8a8];
        let along = H.s + 0.2;
        HillDay.WASHING.pieces.forEach(([w, drop, kind], i) => {
            const pivot = new THREE.Group(), stuff = mat(shades[i % shades.length], { side: THREE.DoubleSide });
            along += w / 2 + 0.1;
            for (const piece of HillDay.clothPieces(w, drop, kind)) {
                const m = new THREE.Mesh(piece, stuff);
                m.castShadow = true;
                pivot.add(m);
            }
            for (const x of kind === 'sheet' ? [-w / 2 + 0.03, 0, w / 2 - 0.03] : [-w / 2 + 0.03, w / 2 - 0.03]) {
                const p = new THREE.Mesh(peg, pegWood);
                p.position.set(x, 0, 0);
                pivot.add(p);
            }
            g.add(pivot);
            this.sheets.push({ pivot, s: along });
            along += w / 2;
        });
        this.washLine = HillDay.washingLine(lane);
        const a = lane.at(H.s, H.side * this.washLine, HillDay.WASHING.upM, {}), b = lane.at(H.s + H.lengthM, H.side * this.washLine, HillDay.WASHING.upM, {});
        const line = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z), 4), dark);
        line.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
        line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z).normalize());
        g.add(line);
        // The stall at the top, where the climb ends (HillDay.stall)
        g.add(HillDay.stall(lane, { mat, box, dark }));
        this.group = g;
        this.draw();
        return g;
    }

    // The stall at the top where the climb ends, as the last stills have it: a trestle table along the lane's edge on
    // the left going down (CLIMB.stall: its middle, long side along the lane), its top level and each leg down to the
    // cobbles under it; on it a pair of scales with a brass pan, willow baskets of greens, cabbages and roots high on a shelf at the back, carrots
    // and a marrow along its front, a tray of the bakery's loaves, a big basket tipped up at the back; a churn and a
    // crate under it; and over it a blank board hung from an iron arm on a post (no words on it). Local axes: x down the
    // lane, z out towards its middle, y up
    static stall(lane, { mat, box, dark }) {
        const C = HillDay.CLIMB, [s0, a0] = C.stall, p = lane.sample(s0), at = lane.at(s0, a0, 0, {});
        const group = new THREE.Group();
        group.name = 'hill-stall';
        group.position.set(at.x, at.y, at.z);
        group.rotation.y = p.heading - Math.PI / 2;
        const ground = x => lane.at(s0 + x, a0, 0, {}).y - at.y;
        const put = (mesh, x, y, z, rx = 0, ry = 0, rz = 0) => {
            mesh.position.set(x, y, z);
            mesh.rotation.set(rx, ry, rz);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            group.add(mesh);
            return mesh;
        };
        const T = typeof HillTextures !== 'undefined' && typeof document !== 'undefined' && document.createElement ? HillTextures.all().wicker : null;
        const willow = mat(0xa89a80, T ? { map: T.map, normalMap: T.normalMap } : {});
        const boards = mat(0x6a5440), iron = mat(0x2a2826, { roughness: 0.6, metalness: 0.3 }), brass = mat(0xb08a4a, { roughness: 0.35, metalness: 0.7 });
        const half = 0.9, deep = 0.38, high = Math.max(ground(-half), ground(half)) + 0.86;
        // The top, level, and the trestles, each leg to the cobbles under it
        put(box(half * 2, 0.05, deep * 2, boards), 0, high, 0);
        for (const x of [-half + 0.12, half - 0.12]) {
            for (const z of [-deep + 0.06, deep - 0.06]) {
                const foot = ground(x), leg = high - foot;
                put(box(0.06, leg, 0.06, boards), x, foot + leg / 2, z, z > 0 ? -0.08 : 0.08);
            }
            put(box(0.05, 0.05, deep * 2 - 0.1, boards), x, (high + ground(x)) / 2, 0);
        }
        const top = high + 0.025;
        // The scales at the uphill end: an iron foot and pillar, a brass pan, a brass plate for the weights
        put(box(0.3, 0.05, 0.16, iron), -half + 0.3, top + 0.025, 0.12);
        put(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.16, 8), iron), -half + 0.2, top + 0.13, 0.12);
        put(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.09, 0.07, 16, 1, true), brass), -half + 0.2, top + 0.24, 0.12).material.side = THREE.DoubleSide;
        put(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.015, 12), brass), -half + 0.42, top + 0.07, 0.12);
        // Willow baskets of greens, cabbages and roots along the back
        // A shelf along the back, so the baskets stand high as the stills have them
        const shelf = top + 0.3;
        put(box(half * 2 - 0.1, 0.3, 0.3, boards), 0, top + 0.15, -deep + 0.16);
        const basket = (x, z, r, h, base = shelf) => {
            const b = put(new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.85, h, 18, 1, true), willow), x, base + h / 2, z);
            b.material.side = THREE.DoubleSide;
            put(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.85, r * 0.85, 0.01, 18), willow), x, base + 0.005, z);
            put(new THREE.Mesh(new THREE.TorusGeometry(r, 0.014, 6, 24), willow), x, base + h, z, Math.PI / 2);
            return base + h;
        };
        const rand = HillLane.random(4271);
        const greens = [0x5e7a3a, 0x6e8a44, 0x4e6a30], roots = [0xd8ccb0, 0xc8b898, 0xe0d4bc];
        // The goods' shapes: a cabbage (a firm head in cupped outer leaves), a turnip or an onion (a bulb narrowing to its
        // top, a tuft or a dry tip), an apple (a little flat, a stalk)
        const cabbage = (size, colour) => {
            const g = new THREE.Group(), leaf = mat(colour), heart = mat(new THREE.Color(colour).lerp(new THREE.Color(0xc8d890), 0.35).getHex());
            g.add(new THREE.Mesh(new THREE.SphereGeometry(size * 0.72, 10, 8), heart));
            for (let k = 0; k < 5; k++) {
                const cup = new THREE.Mesh(new THREE.SphereGeometry(size, 8, 6, 0, Math.PI * 0.8, Math.PI * 0.35, Math.PI * 0.5), leaf);
                cup.material.side = THREE.DoubleSide;
                cup.rotation.set(0, k * 1.26 + rand() * 0.3, 0);
                g.add(cup);
            }
            return g;
        };
        const bulb = (size, colour, onion) => {
            const g = new THREE.Group();
            const profile = [[0, -1], [0.55, -0.85], [0.95, -0.3], [0.9, 0.2], [0.55, 0.65], [0.18, 0.95], [0, 1]].map(([r, y]) => new THREE.Vector2(r * size, y * size));
            g.add(new THREE.Mesh(new THREE.LatheGeometry(profile, 10), mat(colour)));
            const tip = new THREE.Mesh(new THREE.ConeGeometry(size * (onion ? 0.12 : 0.3), size * (onion ? 0.5 : 1.1), 5), mat(onion ? 0x9a7a4a : 0x5a7a34));
            tip.position.y = size * (onion ? 1.15 : 1.4);
            g.add(tip);
            return g;
        };
        const fill = (x, z, r, rim, make, size) => {
            for (let i = 0; i < 7; i++) {
                const a = i * 2.4, d = i === 0 ? 0 : r * 0.55;
                const m = make(i, size * (0.85 + rand() * 0.3));
                m.rotation.set((rand() - 0.5) * 0.6, rand() * 6.28, (rand() - 0.5) * 0.6);
                m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
                m.position.set(x + Math.cos(a) * d, rim - size * 0.2 + rand() * size * 0.3, z + Math.sin(a) * d);
                group.add(m);
            }
        };
        fill(-0.1, -0.22, 0.24, basket(-0.1, -0.22, 0.27, 0.2), (i, size) => cabbage(size, greens[i % greens.length]), 0.1);
        fill(0.42, -0.22, 0.2, basket(0.42, -0.22, 0.23, 0.18), (i, size) => bulb(size, roots[i % roots.length], i % 2 === 1), 0.065);
        fill(-0.5, 0.12, 0.17, basket(-0.5, 0.12, 0.19, 0.14, top), (i, size) => {
            // Apples, red and russet, each with its stalk
            const g = new THREE.Group();
            g.add(new THREE.Mesh(new THREE.SphereGeometry(size * 0.62, 10, 8).scale(1, 0.88, 1), mat([0xa8322a, 0x8a5a2a, 0xb8442e][i % 3])));
            const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.004, size * 0.35, 4), mat(0x4a3424));
            stalk.position.y = size * 0.6;
            g.add(stalk);
            return g;
        }, 0.08);
        // A big basket tipped up against the back, its mouth to the lane
        const tipped = put(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.27, 0.38, 18, 1, true), willow), -0.62, shelf + 0.32, -0.26, -1.05);
        tipped.material.side = THREE.DoubleSide;
        // Carrots in a row along the front, a marrow beside them
        // (each carrot with its feathery top, tied in a bunch at the root end)
        const carrot = new THREE.ConeGeometry(0.022, 0.18, 6), orange = mat(0xd0722a), fronds = mat(0x4e7a2e);
        const frond = new THREE.ConeGeometry(0.018, 0.12, 4);
        for (let i = 0; i < 9; i++) {
            const turn = Math.PI / 2 + (rand() - 0.5) * 0.3, x = -0.25 + i * 0.05;
            put(new THREE.Mesh(carrot, orange), x, top + 0.025, 0.27, 0, 0, turn);
            put(new THREE.Mesh(frond, fronds), x - 0.012, top + 0.03, 0.27 - 0.14, -Math.PI / 2 + (rand() - 0.5) * 0.5, 0, (rand() - 0.5) * 0.4);
        }
        put(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 8), mat(0x8a6a4a)), -0.05, top + 0.03, 0.15, Math.PI / 2, 0, 0);
        // The marrow, dark and striped with pale bands, its stalk at one end
        const marrow = put(new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.24, 4, 12), mat(0x3e5a2a)), 0.35, top + 0.06, 0.2, 0, 0.3, Math.PI / 2);
        for (const k of [-0.08, 0, 0.08]) {
            const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0605, 0.0605, 0.025, 12, 1, true), mat(0x8aa060));
            band.position.y = k;
            marrow.add(band);
        }
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.014, 0.05, 6), mat(0x5a6a3a));
        stem.position.y = 0.17;
        marrow.add(stem);
        // A tray of brown eggs by the scales
        put(box(0.2, 0.025, 0.14, mat(0xc8b8a0)), -half + 0.62, top + 0.0125, 0.22);
        const egg = new THREE.SphereGeometry(0.022, 8, 6).scale(1, 1.3, 1), shell = mat(0xc89a6a);
        for (let i = 0; i < 6; i++) put(new THREE.Mesh(egg, shell), -half + 0.55 + (i % 3) * 0.065, top + 0.045, 0.19 + Math.floor(i / 3) * 0.06);
        // The bakery's loaves in a shallow willow tray at the downhill end
        put(box(0.5, 0.06, 0.4, willow), 0.62, top + 0.03, 0.08);
        // Tin loaves: the tin's square sides and a crown risen over them, a little wider, darker where it is baked hardest
        const tin = new THREE.BoxGeometry(0.2, 0.08, 0.11), crown = new THREE.CylinderGeometry(0.062, 0.062, 0.2, 10, 1, false, -Math.PI / 2, Math.PI).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2).scale(1, 0.75, 1);
        const baked = mat(0x8c5a36), browned = mat(0x6e4026);
        for (let i = 0; i < 6; i++) {
            const loaf = put(new THREE.Mesh(tin, baked), 0.5 + (i % 3) * 0.12, top + 0.1, -0.02 + Math.floor(i / 3) * 0.2, 0, Math.PI / 2);
            const dome = new THREE.Mesh(crown, browned);
            dome.position.y = 0.04;
            dome.castShadow = true;
            loaf.add(dome);
        }
        // Under it: a churn and a crate
        const churn = put(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.55, 14), mat(0x8a8a86, { roughness: 0.5, metalness: 0.4 })), -0.4, ground(-0.4) + 0.275, 0.1);
        put(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.15, 0.12, 14), churn.material), -0.4, ground(-0.4) + 0.61, 0.1);
        put(box(0.45, 0.28, 0.35, boards), 0.45, ground(0.45) + 0.14, -0.05);
        // The sign: an iron post at the back uphill corner, its arm out over the stall, a blank board hung from it
        const postX = -half + 0.05, postFoot = ground(postX), signTop = high + 1.75;
        put(box(0.05, signTop - postFoot, 0.05, iron), postX, (signTop + postFoot) / 2, -deep - 0.04);
        put(box(0.03, 0.03, 0.75, iron), postX, signTop - 0.05, -deep + 0.3);
        put(box(0.02, 0.32, 0.02, iron), postX, signTop - 0.24, -deep + 0.08, 0.6);
        const board = put(box(0.04, 0.62, 0.5, mat(0x3c2e24)), postX, signTop - 0.5, -deep + 0.4);
        put(box(0.045, 0.56, 0.44, mat(0x4a3a2c)), postX, signTop - 0.5, -deep + 0.4);
        for (const z of [-0.18, 0.18]) put(box(0.008, 0.12, 0.008, dark), postX, signTop - 0.13, -deep + 0.4 + z);
        board.name = 'hill-stall-sign';
        return group;
    }

    // The cat's legs as she runs: a gallop whose stride matches her speed over the ground. Each foot is on the ground
    // for `stance` of a stride and sweeps back under her at her speed, so it does not slide: the leg (legM long) turns
    // from swingRad ahead to swingRad behind while the cat goes stance × strideM, so strideM = 2 legM sin(swingRad) /
    // stance; then it swings forward, folded `fold` shorter, off the ground. Stopped, her legs stand straight (settleS)
    static get CAT_GAIT() { return Object.freeze({ legM: 0.16, swingRad: 0.5, stance: 0.35, fold: 0.4, settleS: 0.2 }); }

    static catStride() {
        const G = HillDay.CAT_GAIT;
        return 2 * G.legM * Math.sin(G.swingRad) / G.stance;
    }

    // A leg's turn (+ its foot back) at `u` (0..1) of its stride: the stance with its foot fixed on the ground, then
    // the swing forward
    static catLeg(u) {
        const G = HillDay.CAT_GAIT, reach = G.legM * Math.sin(G.swingRad);
        if (u < G.stance) return Math.asin((-reach + 2 * reach * u / G.stance) / G.legM);
        const w = (u - G.stance) / (1 - G.stance);
        return G.swingRad - 2 * G.swingRad * w * w * (3 - 2 * w);
    }

    // The leg's length as a share of legM at `u`: whole on the ground, folded up to foldShare shorter as it swings,
    // so the foot clears the ground
    static catFold(u) {
        const G = HillDay.CAT_GAIT;
        return u < G.stance ? 1 : 1 - G.fold * Math.sin(Math.PI * (u - G.stance) / (1 - G.stance));
    }

    // Who waits at a door for its bread, so the door reads from the descent at speed with no sign: a woman on the
    // flags beside the door on its uphill side, in a dress of her own colour and a white apron (outM out from the door,
    // alongM along it), the door open on a warm lit hall (glow: its light, waiting and for the next door), and its light
    // a soft pool on the flags (pool: its strength, the same; poolM across, poolOutM out from the door).
    // At the next door she waves (waveHz); once her bread is delivered she steps back in over inS and is gone
    static get WAITING() { return Object.freeze({ glow: [0.55, 1.6], pool: [0.18, 0.45], poolM: 1.1, poolOutM: 1.0, outM: 0.85, alongM: 0.75, waveHz: 1.6, inS: 0.8, inM: 0.8, dresses: [0x7a2e2a, 0x2e4a6a, 0x3e5a3a, 0x6a4a6a] }); }

    // A woman as built for WAITING: her feet at the origin, facing +z (out from the door)
    static waiting(mat, box, i) {
        const W = HillDay.WAITING, g = new THREE.Group();
        g.name = 'hill-door-waiting';
        const dress = mat(W.dresses[i % W.dresses.length]), white = mat(0xeee8dc), skin = mat(0xe2b596), hair = mat(0x4a3424);
        const part = (mesh, x, y, z) => { mesh.position.set(x, y, z); mesh.castShadow = true; g.add(mesh); return mesh; };
        part(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, 0.82, 12), dress), 0, 0.41, 0);
        part(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.5, 12), dress), 0, 1.07, 0);
        part(box(0.3, 0.62, 0.02, white), 0, 0.62, 0.2).rotation.x = -0.12;
        part(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.1, 8), skin), 0, 1.36, 0);
        part(new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), skin), 0, 1.5, 0.01);
        part(new THREE.Mesh(new THREE.SphereGeometry(0.115, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hair), 0, 1.52, -0.01);
        part(new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), hair), 0, 1.52, -0.11);
        // A knitted shawl over her shoulders, the apron's band and its ties at her waist, her shoes under the hem
        const shawl = mat(0x5a5048);
        part(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.23, 0.2, 14, 1, true), shawl), 0, 1.25, 0).material.side = THREE.DoubleSide;
        part(new THREE.Mesh(new THREE.CylinderGeometry(0.168, 0.168, 0.04, 14), white), 0, 0.9, 0);
        part(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 0.012), white), 0.03, 0.82, -0.17).rotation.z = 0.2;
        for (const x of [-0.07, 0.07]) part(new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6).scale(0.8, 0.5, 1.4), mat(0x2a2420)), x, 0.03, 0.18);
        // Her arms in their sleeves, a hand at each: the left at her side, the right on a pivot at its shoulder, which
        // waves
        const sleeveShape = new THREE.CylinderGeometry(0.045, 0.036, 0.46, 8), handShape = new THREE.SphereGeometry(0.035, 8, 6);
        const left = part(new THREE.Mesh(sleeveShape, dress), -0.2, 1.05, 0);
        left.rotation.z = 0.12;
        part(new THREE.Mesh(handShape, skin), -0.23, 0.8, 0);
        const arm = new THREE.Group();
        arm.position.set(0.2, 1.28, 0);
        const sleeve = new THREE.Mesh(sleeveShape, dress);
        sleeve.position.y = -0.23;
        sleeve.castShadow = true;
        const hand = new THREE.Mesh(handShape, skin);
        hand.position.y = -0.49;
        arm.add(sleeve, hand);
        g.add(arm);
        g.userData.arm = arm;
        return g;
    }

    // Moves the drawing to the state
    draw(dt = 1 / 60) {
        if (!this.group) return;
        this.drawDt = dt;
        const lane = this.lane, H = HillDay.HAZARDS, next = this.next;
        const pulse = 0.5 + 0.5 * Math.sin((this.since || 0) * 3);
        this.lamps.forEach((lamp, i) => { lamp.material.emissiveIntensity = i === next && !this.climbing ? 1.2 + pulse * 0.8 : 0; });
        // The woman at each door: waving at the next one, gone in once her bread has come
        const WAIT = HillDay.WAITING, now = this.since || 0;
        this.servedAt = this.servedAt || [];
        this.waiters.forEach((woman, i) => {
            const state = this.states[i];
            if (state !== 'delivered') this.servedAt[i] = undefined;
            else if (this.servedAt[i] === undefined) this.servedAt[i] = now;
            const gone = state === 'delivered' ? Math.min(1, (now - this.servedAt[i]) / WAIT.inS) : 0;
            const d = this.doors[i];
            woman.visible = gone < 1 && state !== 'missed';
            const side = WAIT.alongM * (d.waitSide || 1);
            woman.position.set(d.x + d.outX * (WAIT.outM - WAIT.inM * gone) + d.alongX * side, d.y, d.z + d.outZ * (WAIT.outM - WAIT.inM * gone) + d.alongZ * side);
            const wave = i === next && !this.climbing && state === 'waiting';
            const lit = state === 'waiting' && !this.climbing, k = i === next ? 0.85 + 0.15 * pulse : 1;
            this.halls[i].material.emissiveIntensity = lit ? WAIT.glow[i === next ? 1 : 0] * k : 0;
            this.pools[i].material.opacity = lit ? WAIT.pool[i === next ? 1 : 0] * k : 0;
            this.pools[i].visible = lit;
            woman.userData.arm.rotation.z = wave ? 2.5 + 0.45 * Math.sin(now * WAIT.waveHz * 2 * Math.PI) : 0.12;
        });
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
        // Her gait from the ground she has covered since the last drawing (drawDt: the time it took, from HillDay.draw's
        // caller)
        const track = this.catTrack || (this.catTrack = { x: catAt.x, z: catAt.z, phase: 0, run: 0 });
        const moved = Math.hypot(catAt.x - track.x, catAt.z - track.z);
        track.x = catAt.x;
        track.z = catAt.z;
        if (moved < 1) track.phase = (track.phase + moved / HillDay.catStride()) % 1;
        const running = cat.state === 'running' && moved > 1e-4;
        track.run = running ? 1 : Math.max(0, track.run - (this.drawDt || 1 / 60) / HillDay.CAT_GAIT.settleS);
        for (const leg of this.catLegs) {
            const u = (track.phase + leg.userData.phase) % 1;
            leg.rotation.x = HillDay.catLeg(u) * track.run;
            leg.scale.y = 1 - (1 - HillDay.catFold(u)) * track.run;
        }
        const cart = this.cart, cartAt = lane.at(cart.s, cart.across, 0, {}), kp = lane.sample(cart.s);
        // Its speed from how far it went since the last drawing (the horse's stride and the wheels are matched to it)
        const was = this.cartWas === undefined ? cart.s : this.cartWas;
        const speed = Math.abs(was - cart.s) / (this.drawDt || 1 / 60);
        this.cartWas = cart.s;
        this.cartMesh.position.set(cartAt.x, cartAt.y, cartAt.z);
        // Facing up the lane, pitched up its grade
        this.cartMesh.rotation.set(0, 0, 0);
        this.cartMesh.rotation.order = 'YXZ';
        this.cartMesh.rotation.y = kp.heading + Math.PI;
        if (this.horse) {
            this.cartMesh.rotation.x = Math.atan(kp.grade || 0);
            this.horse.update(this.drawDt || 1 / 60, speed, this.eye || null);
        }
        for (const sheet of this.sheets) {
            const at = lane.at(sheet.s, H.washing.side * this.washLine, HillDay.WASHING.upM, {}), sp = lane.sample(sheet.s);
            sheet.pivot.position.set(at.x, at.y, at.z);
            // The sheet hangs along the line, and is blown out about it towards the middle of the lane
            sheet.pivot.rotation.set(0, sp.heading + Math.PI / 2, 0);
            sheet.pivot.rotateX(H.washing.side * this.washing.blow * 1.2);
        }
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { HillDay };
