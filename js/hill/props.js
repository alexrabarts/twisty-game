// The hill ride's street things (js/hill/ride.js): what the milkman has left at the doors, milk bottles on most steps
// and now and then a loaf in its paper, set out from the seed (the same street on every load), most on the steps, a
// few out at the lane's edge where a rider can reach them; the churn of the opening frame and an old football. Any of
// them can be knocked: no physics library, a simple rigid body each. On contact the bicycle's speed and heading give
// the thing a push; it slides, tumbles and bounces, a round one rolls on down the hill, a bottle smashes into glass
// with a splash of milk and leaves a pool of it on the ground. A light thing costs the bicycle a little speed and a
// wobble; the heavy churn a bigger jolt, and at speed it knocks the boy off. R puts everything back.
class HillProps {
    // Each kind: its shape ('can' upright cylinder, 'box'), size (m: radius and height, or width, height, depth), mass,
    // whether it rolls, breaks or is heavy, its colour, and the share of houses that put one out
    static get KINDS() {
        return Object.freeze({
            // A pint of milk, its foil cap on: glass, it smashes at any knock (HillProps.RULE.smashMs)
            bottle: { shape: 'bottle', r: 0.034, h: 0.21, kg: 0.6, round: true, fly: true, breaks: true, colour: 0xf4f2ec, share: 0.7 },
            // A large baked loaf, on fewer steps than the milk
            bread: { shape: 'loaf', w: 0.27, h: 0.12, d: 0.14, kg: 0.8, colour: 0xa8692f, share: 0.16 },
            churn: { shape: 'can', r: 0.19, h: 0.62, kg: 26, round: true, heavy: true, colour: 0x6c6b66, share: 0 },
            // A smashed bottle's glass, and the pool of its milk on the ground (flat: nothing knocks it)
            glass: { shape: 'box', w: 0.045, h: 0.008, d: 0.035, kg: 0.05, colour: 0xd6e6df, share: 0 },
            milk: { shape: 'pool', r: 0.2, h: 0.004, kg: 0, flat: true, colour: 0xf6f5f0, share: 0 },
            // The old leather football: light and bouncy, the one thing that does not settle (HillProps.BALL)
            ball: { shape: 'ball', r: 0.11, h: 0.22, kg: 0.45, round: true, colour: 0xffffff, share: 0 }
        });
    }

    // The football: where it rests (along the main straight at a share of its length, on the side, how far in from the
    // lane's edge), its bounce off the ground, a wall, a kerb or a thing, its rolling friction (1/s), the share of the
    // How far a thing reaches from its middle on the ground: its radius when it is round (a can or the ball), else half
    // its longer side. The ball has no width or depth, so reading those for it gives no number at all
    static radius(kind) {
        return 'r' in kind ? kind.r : Math.max(kind.w, kind.d) / 2;
    }

    // fall it rolls with (a hollow ball), the lift a hit gives it for each m/s, and the bounce speed its thud starts at
    static get BALL() {
        return Object.freeze({ at: 0.42, side: 1, inM: 0.35, bounce: 0.7, roll: 0.08, rollFall: 0.6, lift: 0.3, thudMs: 0.4, restMs: 0.35 });
    }

    // The push and the response: the share of the bicycle's speed a thing of no mass takes, the lift a flying thing
    // gets for each m/s, the bounce, the slide and the roll friction (1/s), how much of the fall a round thing rolls
    // with, the speed a bottle smashes at and the bits of glass it makes, the speed loss and wobble a light thing costs the bicycle and a heavy one, and
    // the speed over which a heavy one knocks him off
    static get RULE() {
        return Object.freeze({
            seed: 77, edgeShare: 0.12, reachM: 0.34, push: 1.5, fly: 0.15, bounce: 0.1, heavyBounce: 0.02, slide: 7, roll: 0.5, rollFall: 0.6, spinDamp: 2.5,
            smashMs: 0.6, glassBits: 3, lightLoss: 0.04, heavyLoss: 0.3, wobble: 0.6, heavyFallMs: 5.5, sleepMs: 0.05
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
                // On the step by the door (the bread to one side of where the milk stands), now and then left out at
                // the lane's edge
                const edge = rand() < R.edgeShare;
                const across = c.side * (edge ? r.halfWidthM - 0.45 : front - 0.2);
                if (name === 'bottle') {
                    const s = doorS + (rand() - 0.5) * 0.4, n = 1 + Math.floor(rand() * 3);
                    for (let i = 0; i < n; i++) put('bottle', s + i * 0.08, across, 0);
                    continue;
                }
                const s = doorS + (rand() < 0.5 ? -1 : 1) * (0.32 + rand() * 0.12);
                put(name, s, across, c.heading + (rand() - 0.5) * 0.6);
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
        // Room for the glass and the pool of milk of every bottle a knock can smash
        counts.glass = (counts.bottle || 0) * HillProps.RULE.glassBits;
        counts.milk = counts.bottle || 0;
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
            if (name === 'churn') {
                const mesh = new THREE.InstancedMesh(HillProps.churn(), new THREE.MeshStandardMaterial({ color: kind.colour, roughness: 0.8, metalness: 0.3 }), counts[name]);
                mesh.name = 'hill-prop-churn';
                mesh.castShadow = mesh.receiveShadow = true;
                mesh.frustumCulled = false;
                this.group.add(mesh);
                this.meshes[name] = mesh;
                continue;
            }
            let geometry;
            if (kind.shape === 'bottle') geometry = HillProps.bottle(kind);
            else if (kind.shape === 'pool') geometry = HillProps.pool(kind);
            else if (kind.shape === 'loaf') geometry = HillProps.loaf(kind);
            else {
                geometry = kind.shape === 'can' ? new THREE.CylinderGeometry(kind.r, kind.r, kind.h, 10) : new THREE.BoxGeometry(kind.w, kind.h, kind.d);
                geometry.translate(0, kind.h / 2, 0);
            }
            const glassy = name === 'bottle' || name === 'glass';
            const material = new THREE.MeshStandardMaterial({ color: kind.colour, vertexColors: name === 'bottle', roughness: glassy ? 0.2 : name === 'milk' ? 0.35 : 0.85, metalness: 0,
                transparent: name === 'glass', opacity: name === 'glass' ? 0.7 : 1 });
            const mesh = new THREE.InstancedMesh(geometry, material, counts[name]);
            mesh.name = `hill-prop-${name}`;
            mesh.castShadow = !kind.flat;
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
        this.spares = { glass: [], milk: [] };
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
            if (kind.flat) continue;
            const radius = HillProps.radius(kind);
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
            const smashed = kind.breaks && v.speed > R.smashMs;
            if (smashed) this.smash(item, sound);
            if (kind.heavy) {
                const before = v.speed;
                v.speed *= 1 - R.heavyLoss;
                if (before > R.heavyFallMs) v.worldCrash('Ran into the milk churn', null, 'obstacle');
                else v.leanVelocity += (Math.random() - 0.5) * R.wobble * 2;
            } else {
                v.speed *= 1 - R.lightLoss * Math.min(2, kind.kg / 5);
                v.leanVelocity += (Math.random() - 0.5) * R.wobble;
            }
            if (sound && !smashed) HillProps.clatter(sound, kind.heavy ? 1 : kind.kg > 3 ? 0.6 : 0.35, kind.heavy);
        }
        return knocked;
    }

    // A bottle smashes: its glass flies, the milk splashes up (HillRide draws the splash) and spreads in a pool on the
    // ground where it stood
    smash(item, sound = null) {
        const R = HillProps.RULE;
        item.gone = true;
        for (let i = 0; i < R.glassBits; i++) {
            const a = i * 2 * Math.PI / R.glassBits + item.yaw + Math.random() * 0.6;
            const glass = { kind: 'glass', x: item.x, y: item.y + 0.08, z: item.z, yaw: a, lean: 0, vx: item.vx * 0.5 + Math.sin(a) * (0.6 + Math.random() * 0.8),
                vy: 0.6 + Math.random() * 0.8, vz: item.vz * 0.5 + Math.cos(a) * (0.6 + Math.random() * 0.8), spinX: 8, spinZ: 6, tipX: 0, tipZ: 0, moving: true, hit: 1, gone: false };
            this.items.push(glass);
            this.spares.glass.push(glass);
        }
        const p = this.lane.sample(item.s);
        const pool = { kind: 'milk', x: item.x + item.vx * 0.08, y: item.y + 0.003, z: item.z + item.vz * 0.08, yaw: Math.random() * Math.PI, lean: 0, vx: 0, vy: 0, vz: 0,
            spinX: 0, spinZ: 0, tipX: 0, tipZ: 0, moving: false, hit: 1, gone: false, size: 0.15, grows: true, s: item.s, across: item.across };
        this.items.push(pool);
        this.spares.milk.push(pool);
        this.puff = { x: item.x, y: item.y + 0.12, z: item.z, t: 0, colour: 0xf8f7f2, alongX: p.alongX, alongZ: p.alongZ };
        if (sound) HillProps.tinkle(sound);
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
            if (o.flat) continue;
            const radius = HillProps.radius(o);
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
            // A pool of milk spreads over its first second
            if (item.grows) {
                item.size = Math.min(1, item.size + dt * 1.6);
                if (item.size >= 1) item.grows = false;
            }
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
                if (item.size !== undefined) s.set(item.size, 1, item.size);
                m.compose(p, q, s);
                s.set(1, 1, 1);
            }
            mesh.setMatrixAt(i, m);
        }
        for (const [name, mesh] of Object.entries(this.meshes)) {
            // Instances not in use yet (glass and milk before a smash) are drawn at no size
            for (let i = used[name] || 0; i < mesh.count; i++) mesh.setMatrixAt(i, m.makeScale(0, 0, 0));
            mesh.instanceMatrix.needsUpdate = true;
        }
    }

    // A pint milk bottle: the thick base, the straight body, the shoulder in to the neck, the lip and its foil cap,
    // the cap silver through the vertex colours and the rest the milk's white through the glass
    static bottle(kind) {
        const h = kind.h, r = kind.r;
        // (six sides: a hundred and more of them stand in the street)
        const profile = [[0, 0], [r, h * 0.03], [r, h * 0.55], [r * 0.6, h * 0.8], [r * 0.5, h * 0.94], [r * 0.58, h], [0, h]].map(([x, y]) => new THREE.Vector2(x, y));
        const geometry = new THREE.LatheGeometry(profile, 6);
        const p = geometry.attributes.position, colours = new Float32Array(p.count * 3);
        for (let i = 0; i < p.count; i++) {
            const cap = p.getY(i) > h * 0.94;
            colours.set(cap ? [0.78, 0.8, 0.84] : [1, 1, 1], i * 3);
        }
        geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
        geometry.computeVertexNormals();
        return geometry;
    }

    // A loaf: a long rounded crust, domed on top and flatter underneath, its length along the thing's own z
    static loaf(kind) {
        const geometry = new THREE.CapsuleGeometry(kind.d / 2, kind.w - kind.d, 3, 8);
        geometry.rotateX(Math.PI / 2);
        geometry.scale(1, kind.h / kind.d, 1);
        const p = geometry.attributes.position;
        for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) p.setY(i, p.getY(i) * 0.4);
        geometry.translate(0, kind.h * 0.4, 0);
        geometry.computeVertexNormals();
        return geometry;
    }

    // A pool of spilt milk: a flat disc on the ground with a ragged edge
    static pool(kind) {
        const n = 14, shape = new THREE.Shape();
        for (let i = 0; i <= n; i++) {
            const a = i / n * 2 * Math.PI, k = kind.r * (0.75 + 0.25 * Math.abs(Math.sin(a * 2.5 + 1)) + (i % 3 === 0 ? 0.12 : 0));
            if (i === 0) shape.moveTo(Math.cos(a) * k, Math.sin(a) * k);
            else shape.lineTo(Math.cos(a) * k, Math.sin(a) * k);
        }
        const geometry = new THREE.ShapeGeometry(shape);
        geometry.rotateX(-Math.PI / 2);
        return geometry;
    }

    // A milk bottle smashing: a sharp crack of high noise and a few short rings of glass after it
    static tinkle(sound) {
        if (!sound || !sound.audioContext || !sound.graph || !sound.enabled) return;
        const ctx = sound.audioContext, t = ctx.currentTime;
        const length = 0.18;
        const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * length), ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 5);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 2600;
        const gain = ctx.createGain();
        gain.gain.value = 0.5;
        source.connect(filter);
        filter.connect(gain);
        gain.connect(sound.graph.master);
        source.start(t);
        for (let i = 0; i < 4; i++) {
            const at = t + 0.03 + i * 0.045 + Math.random() * 0.03;
            const ring = ctx.createOscillator();
            ring.type = 'sine';
            ring.frequency.value = 3200 + Math.random() * 2600;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, at);
            g.gain.exponentialRampToValueAtTime(0.06, at + 0.004);
            g.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
            ring.connect(g);
            g.connect(sound.graph.master);
            ring.start(at);
            ring.stop(at + 0.1);
        }
    }

    // An old milk churn: a body, its shoulder in to the neck, a lip and the lid with its knob, dented here and there
    static churn() {
        const profile = [[0, 0], [0.17, 0], [0.185, 0.03], [0.19, 0.38], [0.17, 0.44], [0.1, 0.5], [0.09, 0.56], [0.11, 0.57], [0.11, 0.6], [0.06, 0.62], [0.03, 0.66], [0, 0.66]]
            .map(([r, y]) => new THREE.Vector2(r, y));
        const geometry = new THREE.LatheGeometry(profile, 20);
        const p = geometry.attributes.position;
        for (let i = 0; i < p.count; i++) {
            const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
            if (y < 0.03 || y > 0.42) continue;
            // A few dents in the body: shallow, wide
            const dent = Math.max(0, Math.cos(a * 3 + 1) * Math.cos((y - 0.25) * 18)) ** 4 * 0.012 + Math.max(0, Math.sin(a * 5 - 2) * Math.sin(y * 30)) ** 6 * 0.008;
            const k = 1 - dent / Math.max(0.05, Math.hypot(x, z));
            p.setX(i, x * k);
            p.setZ(i, z * k);
        }
        geometry.computeVertexNormals();
        return geometry;
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
