// The hill ride's street things (js/hill/ride.js): flower pots, window-box tubs, milk bottles on the steps, a churn, tin
// buckets, wicker baskets, dustbins with their lids, crates and brooms, set out in front of the cottages from the seed
// (the same street on every load), most at the fronts and steps, a few out at the lane's edge where a rider can reach
// them. Any of them can be knocked: no physics library, a simple rigid body each. On contact the bicycle's speed and
// heading give the thing a push; it slides, tumbles and bounces, a round one rolls on down the hill, lids and bottles
// fly a little, a pot breaks into shards with a puff of soil. A light thing costs the bicycle a little speed and a
// wobble; a heavy one (the churn, a dustbin) a bigger jolt, and at speed it knocks the boy off. R puts everything back.
class HillProps {
    // Each kind: its shape ('can' upright cylinder, 'box'), size (m: radius and height, or width, height, depth), mass,
    // whether it rolls, breaks or is heavy, its colour, and the share of houses that put one out
    static get KINDS() {
        return Object.freeze({
            pot: { shape: 'can', r: 0.17, h: 0.26, kg: 5, round: true, breaks: true, colour: 0xa65a38, share: 0.45 },
            tub: { shape: 'box', w: 0.7, h: 0.28, d: 0.26, kg: 9, colour: 0x5e4a36, share: 0.25, flowers: true },
            bottle: { shape: 'can', r: 0.034, h: 0.24, kg: 0.6, round: true, fly: true, colour: 0xf2f0ea, share: 0.35 },
            churn: { shape: 'can', r: 0.19, h: 0.62, kg: 26, round: true, heavy: true, colour: 0xb8bcc0, share: 0.06 },
            bucket: { shape: 'can', r: 0.15, h: 0.27, kg: 2, round: true, colour: 0x9aa0a4, share: 0.15 },
            basket: { shape: 'box', w: 0.46, h: 0.26, d: 0.34, kg: 2, colour: 0x9a7546, share: 0.15 },
            dustbin: { shape: 'can', r: 0.25, h: 0.74, kg: 18, round: true, heavy: true, lid: true, colour: 0x6e7276, share: 0.12 },
            lid: { shape: 'can', r: 0.27, h: 0.05, kg: 1, round: true, fly: true, colour: 0x7a7e82, share: 0 },
            crate: { shape: 'box', w: 0.5, h: 0.34, d: 0.4, kg: 6, colour: 0x8a6a44, share: 0.15 },
            broom: { shape: 'box', w: 0.04, h: 1.3, d: 0.04, kg: 1, fly: true, colour: 0x6a5032, share: 0.12, leans: true },
            shard: { shape: 'box', w: 0.12, h: 0.05, d: 0.1, kg: 0.5, colour: 0xa65a38, share: 0 },
            // The old leather football: light and bouncy, the one thing that does not settle (HillProps.BALL)
            ball: { shape: 'ball', r: 0.11, h: 0.22, kg: 0.45, round: true, colour: 0xffffff, share: 0 }
        });
    }

    // The football: where it rests (along the main straight at a share of its length, on the side, how far in from the
    // lane's edge), its bounce off the ground, a wall, a kerb or a thing, its rolling friction (1/s), the share of the
    // fall it rolls with (a hollow ball), the lift a hit gives it for each m/s, and the bounce speed its thud starts at
    static get BALL() {
        return Object.freeze({ at: 0.42, side: 1, inM: 0.35, bounce: 0.7, roll: 0.08, rollFall: 0.6, lift: 0.3, thudMs: 0.4, restMs: 0.35 });
    }

    // The push and the response: the share of the bicycle's speed a thing of no mass takes, the lift a flying thing
    // gets for each m/s, the bounce, the slide and the roll friction (1/s), how much of the fall a round thing rolls
    // with, the speed a pot breaks at, the speed loss and wobble a light thing costs the bicycle and a heavy one, and
    // the speed over which a heavy one knocks him off
    static get RULE() {
        return Object.freeze({
            seed: 77, edgeShare: 0.1, reachM: 0.34, push: 1.5, fly: 0.15, bounce: 0.1, heavyBounce: 0.02, slide: 7, roll: 0.5, rollFall: 0.6, spinDamp: 2.5,
            breakMs: 2.2, lightLoss: 0.04, heavyLoss: 0.3, wobble: 0.6, heavyFallMs: 5.5, sleepMs: 0.05
        });
    }

    // Every thing's place as data (pure): { kind, x, y, z, yaw, s, across, lean }
    static place(lane) {
        const K = HillProps.KINDS, R = HillProps.RULE, r = lane.rule;
        const rand = HillLane.random(R.seed);
        const list = [];
        const kinds = Object.entries(K).filter(([, k]) => k.share > 0);
        const put = (kind, s, across, yaw = 0, lean = 0) => {
            const p = lane.sample(s);
            const on = Math.abs(across) > r.halfWidthM ? 0.1 : lane.cobble(s, across);
            list.push({ kind, s, across, x: p.x + p.leftX * across, y: p.y + on, z: p.z + p.leftZ * across, yaw, lean });
        };
        // The opening frame's milk churn on the cobbles by the camera
        if (r.opening) {
            const [cs, ca] = r.opening.churn;
            put('churn', cs, ca, 0);
            list[list.length - 1].opening = true;
        }
        // The football, resting at the lane's edge outside a house on the main straight
        const B = HillProps.BALL;
        put('ball', r.mainStraight.fromS + (r.mainStraight.toS - r.mainStraight.fromS) * B.at, B.side * (r.halfWidthM - B.inM), 0);
        for (const c of lane.cottages) {
            const front = r.halfWidthM + r.flagsM - 0.35;
            const doorS = c.from + c.wide * c.door;
            for (const [name, kind] of kinds) {
                if (rand() >= kind.share) continue;
                // Bottles stand on the step; the rest along the front, clear of the door, now and then at the lane's edge
                let s = name === 'bottle' ? doorS + (rand() - 0.5) * 0.5 : c.from + 0.6 + rand() * (c.wide - 1.2);
                if (name !== 'bottle' && Math.abs(s - doorS) < 0.8) s = doorS + (s < doorS ? -0.9 : 0.9);
                const edge = name !== 'bottle' && name !== 'broom' && rand() < R.edgeShare;
                const across = c.side * (edge ? r.halfWidthM - 0.45 : front);
                if (name === 'bottle') {
                    const n = 1 + Math.floor(rand() * 3);
                    for (let i = 0; i < n; i++) put('bottle', s + i * 0.08, c.side * (r.halfWidthM + r.flagsM - 0.55), 0);
                    continue;
                }
                const yaw = c.heading + (rand() - 0.5) * 0.8;
                put(name, s, name === 'broom' ? c.side * (front + 0.2) : across, yaw, name === 'broom' ? -c.side * 0.25 : 0);
            }
        }
        return list;
    }

    constructor(lane) {
        this.lane = lane;
        this.places = HillProps.place(lane);
        this.group = new THREE.Group();
        this.group.name = 'hill-props';
        this.meshes = {};
        this.scratch = { m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(0, 0, 0, 'YXZ'), p: new THREE.Vector3(), s: new THREE.Vector3(1, 1, 1), at: {} };
        const counts = {};
        for (const place of this.places) counts[place.kind] = (counts[place.kind] || 0) + 1;
        // Room for every lid and every shard a knock can make
        counts.lid = counts.dustbin || 0;
        counts.shard = (counts.pot || 0) * 4;
        for (const [name, kind] of Object.entries(HillProps.KINDS)) {
            if (!counts[name]) continue;
            if (kind.shape === 'ball') {
                const geometry = new THREE.SphereGeometry(kind.r, 24, 16);
                geometry.translate(0, kind.r, 0);
                const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial({ map: HillProps.leather(), roughness: 0.65, metalness: 0 }), counts[name]);
                mesh.name = 'hill-prop-ball';
                mesh.castShadow = mesh.receiveShadow = true;
                mesh.frustumCulled = false;
                this.group.add(mesh);
                this.meshes[name] = mesh;
                continue;
            }
            const geometry = kind.shape === 'can' ? new THREE.CylinderGeometry(kind.r * (name === 'pot' ? 1.15 : 1), kind.r, kind.h, name === 'bottle' ? 6 : 10) : new THREE.BoxGeometry(kind.w, kind.h, kind.d);
            geometry.translate(0, kind.h / 2, 0);
            const material = new THREE.MeshStandardMaterial({ color: kind.colour, roughness: name === 'churn' || name === 'bucket' || name === 'dustbin' || name === 'lid' ? 0.45 : 0.85, metalness: name === 'churn' || name === 'bucket' ? 0.6 : 0 });
            const mesh = new THREE.InstancedMesh(geometry, material, counts[name]);
            mesh.name = `hill-prop-${name}`;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.frustumCulled = false;
            this.group.add(mesh);
            this.meshes[name] = mesh;
        }
        this.reset();
    }

    // Everything back in its place, standing
    reset() {
        this.items = this.places.map(place => ({
            ...place, kind: place.kind, vx: 0, vy: 0, vz: 0, spinX: 0, spinZ: 0, tipX: 0, tipZ: place.lean, moving: false, hit: 0, gone: false,
            turn: place.kind === 'ball' ? new THREE.Quaternion() : null
        }));
        this.spares = { lid: [], shard: [] };
        this.hits = 0;
        this.draw();
    }

    // The bicycle against every thing near it: a knock pushes the thing and costs the bicycle (HillBicycle)
    knock(bike, sound = null) {
        const R = HillProps.RULE, K = HillProps.KINDS;
        const v = bike.vehicle;
        if (v.crashed || v.speed < 0.3) return 0;
        const fx = Math.sin(v.yawAngle), fz = Math.cos(v.yawAngle);
        const half = HillVehicle.DATA.wheelbaseM / 2;
        let knocked = 0;
        for (const item of this.items) {
            if (item.gone || item.hit > 0) continue;
            const kind = K[item.kind];
            const radius = kind.shape === 'can' ? kind.r : Math.max(kind.w, kind.d) / 2;
            // The thing against the bicycle's line from its rear wheel to its front
            const dx = item.x - v.position.x, dz = item.z - v.position.z;
            const along = Math.max(-half, Math.min(half, dx * fx + dz * fz));
            const ox = dx - fx * along, oz = dz - fz * along;
            const d = Math.hypot(ox, oz);
            if (d > radius + R.reachM || Math.abs(item.y - v.position.y) > 1.5) continue;
            knocked++;
            this.hits++;
            item.hit = 0.4;
            item.moving = true;
            // Pushed the way the bicycle goes and away from its line, by the share its mass leaves
            const share = R.push * 60 / (60 + kind.kg);
            const away = d > 1e-3 ? 1 / d : 0;
            item.vx = (fx * 0.8 + ox * away * 0.6) * v.speed * share;
            item.vz = (fz * 0.8 + oz * away * 0.6) * v.speed * share;
            item.vy = (kind.shape === 'ball' ? HillProps.BALL.lift : kind.fly ? R.fly * 2 : R.fly * 0.5) * v.speed * share;
            item.spinX = (Math.random() - 0.5) * 4 * share;
            item.spinZ = (Math.random() - 0.5) * 4 * share;
            if (kind.lid && !item.lidOff) this.lidOff(item);
            if (kind.breaks && v.speed > R.breakMs) this.shatter(item);
            if (kind.heavy) {
                const before = v.speed;
                v.speed *= 1 - R.heavyLoss;
                if (before > R.heavyFallMs) v.worldCrash(`Ran into the ${item.kind === 'churn' ? 'milk churn' : 'dustbin'}`, null, 'obstacle');
                else v.leanVelocity += (Math.random() - 0.5) * R.wobble * 2;
            } else {
                v.speed *= 1 - R.lightLoss * Math.min(2, kind.kg / 5);
                v.leanVelocity += (Math.random() - 0.5) * R.wobble;
            }
            if (sound) HillProps.clatter(sound, kind.heavy ? 1 : kind.kg > 3 ? 0.6 : 0.35, kind.shape === 'can' && kind.colour !== 0xa65a38);
        }
        return knocked;
    }

    // A dustbin's lid comes off and flies
    lidOff(item) {
        item.lidOff = true;
        const lid = { kind: 'lid', x: item.x, y: item.y + HillProps.KINDS.dustbin.h, z: item.z, yaw: item.yaw, lean: 0, vx: item.vx * 1.1, vy: 1.1, vz: item.vz * 1.1,
            spinX: 3, spinZ: -2, tipX: 0, tipZ: 0, moving: true, hit: 1, gone: false };
        this.items.push(lid);
        this.spares.lid.push(lid);
    }

    // A pot breaks: four shards fly from it, and a puff of soil (HillRide draws the puff)
    shatter(item) {
        item.gone = true;
        for (let i = 0; i < 4; i++) {
            const a = i * Math.PI / 2 + item.yaw;
            const shard = { kind: 'shard', x: item.x, y: item.y + 0.1, z: item.z, yaw: a, lean: 0, vx: item.vx * 0.6 + Math.sin(a) * 0.8, vy: 0.7 + i * 0.15,
                vz: item.vz * 0.6 + Math.cos(a) * 1.2, spinX: 5, spinZ: 3, tipX: 0, tipZ: 0, moving: true, hit: 1, gone: false };
            this.items.push(shard);
            this.spares.shard.push(shard);
        }
        this.puff = { x: item.x, y: item.y + 0.2, z: item.z, t: 0 };
    }

    // The football's step: a hollow ball that bounces off the cobbles, the kerb, the house fronts and the other
    // things, rolls on down the fall with its spin, and thuds at each bounce
    ball(item, kind, dt) {
        const B = HillProps.BALL, lane = this.lane, r = lane.rule, at = this.scratch.at;
        lane.project(item.x, item.z, item.s, at);
        item.s = at.s;
        const p = lane.sample(at.s);
        const out = Math.abs(at.across) > r.halfWidthM;
        // (a ball of its size rides over the cobbles' crowns: it meets the lane as smooth)
        const ground = p.y + (out ? 0.1 : HillLane.COBBLES.upM);
        item.vy -= 9.81 * dt;
        const fromAcross = at.across;
        item.x += item.vx * dt;
        item.y += item.vy * dt;
        item.z += item.vz * dt;
        lane.project(item.x, item.z, item.s, at);
        const reflect = (nx, nz) => {
            const into = item.vx * nx + item.vz * nz;
            if (into <= 0) return 0;
            item.vx -= (1 + B.bounce) * into * nx;
            item.vz -= (1 + B.bounce) * into * nz;
            return into;
        };
        let knock = 0;
        // The house fronts, and the kerb's face when the ball is low enough to meet it
        const side = Math.sign(at.across);
        const wall = r.halfWidthM + r.flagsM - 0.15 - kind.r;
        if (Math.abs(at.across) > wall) {
            knock = Math.max(knock, reflect(p.leftX * side, p.leftZ * side));
            const back = Math.abs(at.across) - wall;
            item.x -= p.leftX * side * back;
            item.z -= p.leftZ * side * back;
        } else if (Math.abs(fromAcross) <= r.halfWidthM && Math.abs(at.across) > r.halfWidthM - kind.r * 0.5 && item.y < p.y + 0.1 - kind.r * 0.4) {
            knock = Math.max(knock, reflect(p.leftX * side, p.leftZ * side));
        }
        // The other things: a ball meets each as a circle and bounces off it, a light one nudged
        for (const other of this.items) {
            if (other === item || other.gone) continue;
            const o = HillProps.KINDS[other.kind];
            const radius = o.shape === 'can' ? o.r : Math.max(o.w, o.d) / 2;
            const dx = item.x - other.x, dz = item.z - other.z, d = Math.hypot(dx, dz);
            if (d >= radius + kind.r || d < 1e-6 || item.y > other.y + o.h) continue;
            const nx = dx / d, nz = dz / d;
            const into = reflect(-nx, -nz);
            item.x = other.x + nx * (radius + kind.r);
            item.z = other.z + nz * (radius + kind.r);
            knock = Math.max(knock, into);
            if (!o.heavy && into > 0.5) {
                other.moving = true;
                other.vx -= nx * into * kind.kg / o.kg;
                other.vz -= nz * into * kind.kg / o.kg;
            }
        }
        item.rolling = false;
        if (item.y <= ground) {
            // The ground's normal on the fall of the lane: a bounce turns back the speed into it, so on the hill the
            // bounces die away against the slope as on the flat, and it rolls on down
            const g = p.grade, n = 1 / Math.hypot(g, 1);
            const nx = -g * p.alongX * n, ny = n, nz = -g * p.alongZ * n;
            const into = item.vx * nx + item.vy * ny + item.vz * nz;
            item.y = ground;
            if (into < 0) {
                const fall = -into;
                const back = fall > B.restMs ? 1 + B.bounce : 1;
                item.vx -= back * into * nx;
                item.vy -= back * into * ny;
                item.vz -= back * into * nz;
                knock = Math.max(knock, fall);
                if (fall > B.restMs) {
                    item.bounces = (item.bounces || 0) + 1;
                    item.bounceMs = fall * B.bounce;
                } else {
                    // Rolling: a hollow ball takes rollFall of the slope's pull, and loses a little to the cobbles
                    item.rolling = true;
                    const pull = 9.81 * dt * (1 - B.rollFall);
                    const tx = -pull * (0 - ny * nx), ty = -pull * (1 - ny * ny), tz = -pull * (0 - ny * nz);
                    item.vx -= tx;
                    item.vy -= ty;
                    item.vz -= tz;
                    const keep = Math.max(0, 1 - B.roll * dt);
                    item.vx *= keep;
                    item.vz *= keep;
                }
            }
        }
        // Rolling: it turns about the axis across its way, as far as it goes over its radius
        const pace = Math.hypot(item.vx, item.vz);
        if (pace > 1e-4) {
            const axis = this.scratch.axis || (this.scratch.axis = new THREE.Vector3());
            axis.set(item.vz / pace, 0, -item.vx / pace);
            const step = this.scratch.turn || (this.scratch.turn = new THREE.Quaternion());
            item.turn.premultiply(step.setFromAxisAngle(axis, pace * dt / kind.r));
        }
        if (knock > B.thudMs && this.sound) HillProps.thud(this.sound, Math.min(1, knock / 8));
        if (item.rolling && pace < 0.03 && Math.abs(p.grade) < 0.01) item.moving = false;
        if (at.s >= r.lengthM - 1) item.gone = true;
    }

    // One step of everything moving: gravity, the bounce off the ground, the slide and the roll (a round thing rolls
    // on down the fall), the house fronts as a wall
    step(dt) {
        const R = HillProps.RULE, K = HillProps.KINDS, lane = this.lane, r = lane.rule;
        const at = this.scratch.at;
        let moved = false;
        for (const item of this.items) {
            if (item.hit > 0) item.hit -= dt;
            if (!item.moving || item.gone) continue;
            moved = true;
            const kind = K[item.kind];
            if (kind.shape === 'ball') {
                this.ball(item, kind, dt);
                continue;
            }
            lane.project(item.x, item.z, item.s, at);
            item.s = at.s;
            const p = lane.sample(at.s);
            const ground = p.y + (Math.abs(at.across) > r.halfWidthM ? 0.1 : 0);
            item.vy -= 9.81 * dt;
            item.x += item.vx * dt;
            item.y += item.vy * dt;
            item.z += item.vz * dt;
            item.tipX += item.spinX * dt;
            item.tipZ += item.spinZ * dt;
            const damp = Math.max(0, 1 - R.spinDamp * dt);
            item.spinX *= damp;
            item.spinZ *= damp;
            // The house fronts: no thing goes through them
            const wall = r.halfWidthM + r.flagsM - 0.15;
            if (Math.abs(at.across) > wall) {
                const side = Math.sign(at.across);
                const into = item.vx * p.leftX * side + item.vz * p.leftZ * side;
                if (into > 0) {
                    item.vx -= (1 + R.bounce) * into * p.leftX * side;
                    item.vz -= (1 + R.bounce) * into * p.leftZ * side;
                }
            }
            if (item.y <= ground) {
                item.y = ground;
                if (item.vy < 0) item.vy = -item.vy * (kind.heavy ? R.heavyBounce : R.bounce);
                if (item.vy < 0.4) item.vy = 0;
                // On the ground: a round thing lies on its side and rolls on down the fall; a square one slides to a stop
                const friction = kind.round ? R.roll : R.slide;
                const keep = Math.max(0, 1 - friction * dt);
                item.vx *= keep;
                item.vz *= keep;
                if (kind.round) {
                    const fall = -p.grade * 9.81 * R.rollFall;
                    item.vx += p.alongX * fall * dt;
                    item.vz += p.alongZ * fall * dt;
                    item.tipZ += (Math.sign(item.tipZ || 1) * Math.PI / 2 - item.tipZ) * Math.min(1, dt * 8);
                    item.spinX = Math.hypot(item.vx, item.vz) / Math.max(0.03, kind.r || 0.1);
                    item.tipX += 0;
                } else {
                    item.spinX *= keep;
                    item.spinZ *= keep;
                }
                const flat = Math.hypot(item.vx, item.vz);
                // Square things settle; round ones rest only on the flat
                if (item.vy === 0 && flat < R.sleepMs && (!kind.round || Math.abs(p.grade) < 0.01)) item.moving = false;
            }
            // Far off the end of the lane a thing is gone
            if (at.s >= r.lengthM - 1) item.gone = true;
        }
        if (this.puff) {
            this.puff.t += dt;
            if (this.puff.t > 1.2) this.puff = null;
        }
        return moved;
    }

    // The instances from the items
    draw() {
        const { m, q, e, p, s } = this.scratch;
        const used = {};
        for (const item of this.items) {
            const mesh = this.meshes[item.kind];
            if (!mesh) continue;
            const i = used[item.kind] = (used[item.kind] || 0);
            used[item.kind]++;
            if (i >= mesh.count) continue;
            if (item.gone) {
                m.makeScale(0, 0, 0);
            } else {
                if (item.turn) q.copy(item.turn);
                else q.setFromEuler(e.set(item.tipX, item.yaw, item.tipZ, 'YXZ'));
                p.set(item.x, item.y, item.z);
                m.compose(p, q, s);
            }
            mesh.setMatrixAt(i, m);
        }
        for (const [name, mesh] of Object.entries(this.meshes)) {
            // Instances not in use yet (lids and shards before a knock) are drawn at no size
            for (let i = used[name] || 0; i < mesh.count; i++) mesh.setMatrixAt(i, m.makeScale(0, 0, 0));
            mesh.instanceMatrix.needsUpdate = true;
        }
    }

    // The football's leather: worn brown panels in rows, their seams dark, the lace on one panel; no mark or name
    static leather() {
        if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        const rand = HillLane.random(431);
        for (let row = 0; row < 3; row++) for (let col = 0; col < 6; col++) {
            const x = col * 512 / 6 + (row % 2) * 512 / 12, y = row * 256 / 3;
            const tone = 96 + Math.round(rand() * 26);
            ctx.fillStyle = `rgb(${tone + 8}, ${Math.round(tone * 0.66)}, ${Math.round(tone * 0.42)})`;
            ctx.fillRect(x, y, 512 / 6, 256 / 3);
            ctx.fillRect(x - 512, y, 512 / 6, 256 / 3);
        }
        // Wear: lighter scuffs and darker grime
        for (let i = 0; i < 260; i++) {
            ctx.fillStyle = rand() < 0.5 ? `rgba(220, 190, 150, ${rand() * 0.12})` : `rgba(30, 18, 8, ${rand() * 0.15})`;
            ctx.beginPath();
            ctx.ellipse(rand() * 512, rand() * 256, 2 + rand() * 14, 1 + rand() * 5, rand() * 3, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.strokeStyle = 'rgba(40, 22, 10, 0.9)';
        ctx.lineWidth = 3;
        for (let row = 0; row <= 3; row++) {
            ctx.beginPath(); ctx.moveTo(0, row * 256 / 3); ctx.lineTo(512, row * 256 / 3); ctx.stroke();
            for (let col = 0; col <= 6; col++) {
                const x = col * 512 / 6 + (row % 2) * 512 / 12;
                ctx.beginPath(); ctx.moveTo(x, row * 256 / 3); ctx.lineTo(x, (row + 1) * 256 / 3); ctx.stroke();
            }
        }
        // The lace: a slit with cross stitches over it
        ctx.strokeStyle = 'rgb(60, 36, 18)';
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(256, 100); ctx.lineTo(256, 156); ctx.stroke();
        ctx.strokeStyle = 'rgb(200, 170, 120)';
        ctx.lineWidth = 3;
        for (let y = 104; y < 156; y += 8) { ctx.beginPath(); ctx.moveTo(248, y); ctx.lineTo(264, y + 4); ctx.stroke(); }
        const texture = new THREE.CanvasTexture(canvas);
        texture.encoding = THREE.sRGBEncoding;
        return texture;
    }

    // The football's hollow thud: a low tone falling in pitch and a soft knock, quieter as it slows (`strength` 0 to 1)
    static thud(sound, strength) {
        if (!sound || !sound.audioContext || !sound.graph || !sound.enabled) return;
        const ctx = sound.audioContext, t = ctx.currentTime;
        const tone = ctx.createOscillator();
        tone.type = 'sine';
        tone.frequency.setValueAtTime(150, t);
        tone.frequency.exponentialRampToValueAtTime(70, t + 0.12);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.05 + 0.45 * strength, t + 0.006);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        tone.connect(gain);
        gain.connect(sound.graph.master);
        tone.start(t);
        tone.stop(t + 0.2);
        HillProps.clatter(sound, 0.05 * strength, false);
    }

    // A clatter through the game's sound (js/sound.js): a short burst of filtered noise, lower and longer for a heavy
    // thing, ringing for a tin one
    static clatter(sound, weight, tin) {
        if (!sound || !sound.audioContext || !sound.graph || !sound.enabled) return;
        const ctx = sound.audioContext, t = ctx.currentTime;
        const length = 0.12 + weight * 0.25;
        const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * length), ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = tin ? 'bandpass' : 'lowpass';
        filter.frequency.value = tin ? 2400 - weight * 900 : 900 - weight * 400;
        filter.Q.value = tin ? 6 : 0.8;
        const gain = ctx.createGain();
        gain.gain.value = 0.25 + weight * 0.35;
        source.connect(filter);
        filter.connect(gain);
        gain.connect(sound.graph.master);
        source.start(t);
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { HillProps };
