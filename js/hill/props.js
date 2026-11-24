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
            shard: { shape: 'box', w: 0.12, h: 0.05, d: 0.1, kg: 0.5, colour: 0xa65a38, share: 0 }
        });
    }

    // The push and the response: the share of the bicycle's speed a thing of no mass takes, the lift a flying thing
    // gets for each m/s, the bounce, the slide and the roll friction (1/s), how much of the fall a round thing rolls
    // with, the speed a pot breaks at, the speed loss and wobble a light thing costs the bicycle and a heavy one, and
    // the speed over which a heavy one knocks him off
    static get RULE() {
        return Object.freeze({
            seed: 77, edgeShare: 0.1, reachM: 0.34, push: 1.5, fly: 0.35, bounce: 0.3, slide: 4, roll: 0.25, rollFall: 0.6,
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
            ...place, kind: place.kind, vx: 0, vy: 0, vz: 0, spinX: 0, spinZ: 0, tipX: 0, tipZ: place.lean, moving: false, hit: 0, gone: false
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
            item.vy = (kind.fly ? R.fly * 2 : R.fly * 0.5) * v.speed * share;
            item.spinX = (Math.random() - 0.5) * 8 * share;
            item.spinZ = (Math.random() - 0.5) * 8 * share;
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
        const lid = { kind: 'lid', x: item.x, y: item.y + HillProps.KINDS.dustbin.h, z: item.z, yaw: item.yaw, lean: 0, vx: item.vx * 1.2, vy: 2.5, vz: item.vz * 1.2,
            spinX: 6, spinZ: -4, tipX: 0, tipZ: 0, moving: true, hit: 1, gone: false };
        this.items.push(lid);
        this.spares.lid.push(lid);
    }

    // A pot breaks: four shards fly from it, and a puff of soil (HillRide draws the puff)
    shatter(item) {
        item.gone = true;
        for (let i = 0; i < 4; i++) {
            const a = i * Math.PI / 2 + item.yaw;
            const shard = { kind: 'shard', x: item.x, y: item.y + 0.1, z: item.z, yaw: a, lean: 0, vx: item.vx * 0.6 + Math.sin(a) * 1.2, vy: 1.5 + i * 0.3,
                vz: item.vz * 0.6 + Math.cos(a) * 1.2, spinX: 5, spinZ: 3, tipX: 0, tipZ: 0, moving: true, hit: 1, gone: false };
            this.items.push(shard);
            this.spares.shard.push(shard);
        }
        this.puff = { x: item.x, y: item.y + 0.2, z: item.z, t: 0 };
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
                if (item.vy < 0) item.vy = -item.vy * R.bounce;
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
                e.set(item.tipX, item.yaw, item.tipZ, 'YXZ');
                q.setFromEuler(e);
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
