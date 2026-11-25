// StopScene: the scene at a leg's end stop (manifest.stops, tools/world/stops.mjs). After the finish line the ride is
// over: black bars slide in at the top and the foot of the screen, the HUD fades, the camera leaves the chase and moves
// over the stop and its view, and the group pulls in one by one in its riding order and parks in the stop's slots. Each
// rider gets off and stands beside the bike, helmet on. The result card comes up in the lower bar, with what can be done
// there (a picture; the next leg). Any key before the card skips to it. Nothing here names a place.
//
// The tables are data: KINDS (a stop kind: its camera path and the actions it offers) and the characters' own
// `stop` list (CHARACTERS in js/vehicle.js: 'vape' for the three the owner named). A new stop or rider needs data only.
//
// While the player rides in the camera stays behind it (CHASE); the kind's path starts where the player parks.
// A camera path is keys in the stop's own frame: the origin is the middle of the slots' row, `out` points from where
// the way in leaves the ride to that middle (at a lookout, into the view), `side` is square to it (to the right of out),
// and up is up. A key: { t (s from the start), eye: [side, up, out], look: [side, up, out] } (metres); with `edge` its
// `out` is measured from the area's outline on the out axis (a lookout's rail) instead of the middle. Between keys the
// camera eases; past the last it holds.
class StopScene {
    static get KINDS() {
        const along = [
            { t: 0, eye: [-5, 3.2, -16], look: [0, 1, -2] },
            { t: 6, eye: [-12, 4.5, -6], look: [0, 1, 0] },
            { t: 12, eye: [-6, 3, 8], look: [0, 1.2, 0] },
            { t: 18, eye: [6, 2.6, 9], look: [0, 1, 0] }
        ];
        return Object.freeze({
            // Along the rail to the view: from behind the bikes, out over the rail and down to the valley
            lookout: { camera: [
                { t: 0, eye: [-5, 3.2, -16], look: [0, 1, -2] },
                { t: 6, eye: [-10, 2.2, -1.5], look: [0, 1, 6], edge: true },
                { t: 12, eye: [-2, 1.7, -0.6], look: [0, -60, 160], edge: true },
                { t: 18, eye: [4, 1.7, -0.6], look: [12, -80, 260], edge: true }
            ], actions: ['photo'] },
            restaurant: { camera: along, actions: ['photo'] },
            hotel: { camera: along, actions: ['photo'] },
            fuel: { camera: along, actions: ['photo'] },
            carpark: { camera: along, actions: ['photo'] }
        });
    }

    // How the group pulls in: each rider ARRIVE_GAP_S after the one before, at RIDE_MS on the way in, slowing over the
    // last BRAKE_M to its slot; GET_OFF_S after it stops the rider stands beside the bike, STAND_SIDE_M to its left
    static get RIDE_MS() { return 7; }
    static get ARRIVE_GAP_S() { return 1.6; }
    static get BRAKE_M() { return 9; }
    static get GET_OFF_S() { return 0.8; }
    static get STAND_SIDE_M() { return 0.75; }
    // A rider not near the stop when the scene starts comes in from this far back along the ride
    static get BACK_M() { return 40; }
    // The card comes up once the player has parked and this long has gone, or at once on a skip
    static get CARD_AFTER_S() { return 3; }
    // The bars: as near 2.39:1 as a 16:9 screen gives, each at most BAR_MOST of the screen's height so a tall phone keeps
    // most of its picture (CSS bars over the canvas; the render size does not change)
    static get ASPECT() { return 2.39; }
    static get BAR_MOST() { return 0.12; }
    // A vape cloud: every PUFF_EVERY_S (seeded by the rider), PUFF_S long, from the helmet's front
    static get PUFF_EVERY_S() { return 4; }
    static get PUFF_S() { return 2.6; }
    // The camera behind the player as it rides in: back, up, the look ahead of it and up from its ground
    static get CHASE() { return Object.freeze({ backM: 7, upM: 2.8, aheadM: 6, lookUpM: 0.9 }); }
    // The camera keeps this far over the ground under it
    static get EYE_CLEAR_M() { return 1.6; }
    // How far the visor turns up about its own middle (rad)
    static get VISOR_UP() { return 1.1; }

    // The height of each bar, px, for a screen w x h
    static barPx(w, h) {
        if (!(w > 0 && h > 0)) return 0;
        return Math.round(Math.max(0, Math.min((h - w / StopScene.ASPECT) / 2, h * StopScene.BAR_MOST)));
    }

    // The stop at the end of a stage, or null
    static stopAt(environment) {
        const stage = environment && environment.stage;
        const stops = environment && environment.stops;
        if (!stage || !Array.isArray(stops)) return null;
        return stops.find(s => s.stage === stage.id && s.at === 'end') || null;
    }

    // The stop's frame: {ox, oz, outX, outZ, sideX, sideZ} (the origin at the middle of the slots' row)
    static frame(stop) {
        const n = stop.slots.length;
        const ox = stop.slots.reduce((p, q) => p + q.x, 0) / n, oz = stop.slots.reduce((p, q) => p + q.z, 0) / n;
        const [ax, az] = stop.path[0];
        let dx = ox - ax, dz = oz - az;
        const len = Math.hypot(dx, dz);
        if (len < 1) { dx = Math.sin(stop.slots[0].heading); dz = Math.cos(stop.slots[0].heading); } else { dx /= len; dz /= len; }
        // (a lookout faces its view: the way the land falls away from it, tools/world/stops.mjs viewOf)
        if (stop.kind === 'lookout' && Number.isFinite(stop.view)) { dx = Math.sin(stop.view); dz = Math.cos(stop.view); }
        // (the side to the right of `out`: a heading h has its right at (-cos h, sin h) in the route's terms)
        // How far out the outline is on the out axis from the middle (a key with `edge` is measured from there)
        let edge = 0;
        while (edge < 300 && StopScene.inside(stop.ring, ox + dx * (edge + 0.5), oz + dz * (edge + 0.5))) edge += 0.5;
        return { ox, oz, outX: dx, outZ: dz, sideX: -dz, sideZ: dx, edge };
    }

    // The camera at time t on the kind's path: {eye: {x, y, z}, look: {x, y, z}}; `groundY(x, z)` sets each key's up
    // over the ground at the frame's origin
    static cameraAt(stop, t, groundY = () => 0, keys = null) {
        const path = keys || (StopScene.KINDS[stop.kind] || StopScene.KINDS.carpark).camera;
        const f = StopScene.frame(stop);
        const base = groundY(f.ox, f.oz);
        const y0 = Number.isFinite(base) ? base : 0;
        let k = 0;
        while (k + 1 < path.length && path[k + 1].t <= t) k++;
        const a = path[k], b = path[Math.min(path.length - 1, k + 1)];
        const u = b.t > a.t ? Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t))) : 1;
        const e = u * u * (3 - 2 * u);
        const at = (p, q) => {
            const side = p[0] + (q[0] - p[0]) * e, up = p[1] + (q[1] - p[1]) * e;
            const out = p[2] + (a.edge ? f.edge : 0) + (q[2] + (b.edge ? f.edge : 0) - p[2] - (a.edge ? f.edge : 0)) * e;
            return { x: f.ox + side * f.sideX + out * f.outX, y: y0 + up, z: f.oz + side * f.sideZ + out * f.outZ };
        };
        const eye = at(a.eye, b.eye);
        // The eye never under EYE_CLEAR_M over the ground where it stands (a key's height is over the stop's middle)
        const under = groundY(eye.x, eye.z);
        if (Number.isFinite(under)) eye.y = Math.max(eye.y, under + StopScene.EYE_CLEAR_M);
        return { eye, look: at(a.look, b.look) };
    }

    // Each rider's way in: the ride from `fromS` to the turn-in (on the right half of the road), then the stop's own
    // path, then the rider's slot. `route.sample(s, out)` gives {x, y, z, heading, width}. Returns [{x, z}] with the
    // metres along each point (`m`) and the total
    static wayIn(stop, route, fromS, slot) {
        const pts = [];
        const p = {};
        const s0 = Math.min(fromS, stop.s);
        for (let s = s0; s < stop.s; s += 2) {
            route.sample(s, p);
            const lane = -p.width / 4;
            pts.push({ x: p.x + lane * Math.cos(p.heading), z: p.z - lane * Math.sin(p.heading) });
        }
        for (const [x, z] of stop.path) pts.push({ x, z });
        // The slot from behind: a point back along its heading, then the slot itself
        const back = 3;
        pts.push({ x: slot.x - Math.sin(slot.heading) * back, z: slot.z - Math.cos(slot.heading) * back }, { x: slot.x, z: slot.z });
        let m = 0;
        const out = [];
        for (let i = 0; i < pts.length; i++) {
            if (i && Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z) < 0.2) continue;
            if (out.length) m += Math.hypot(pts[i].x - out[out.length - 1].x, pts[i].z - out[out.length - 1].z);
            out.push({ x: pts[i].x, z: pts[i].z, m });
        }
        return { points: out, length: m };
    }

    // Where a rider is on its way in after `t` seconds: {x, z, heading, speed, parked}. It rides at RIDE_MS and slows
    // over the last BRAKE_M (v^2 = 2 a d), so it stops at its slot; parked, it faces its slot's heading
    static along(way, t, slot) {
        const L = way.length, v = StopScene.RIDE_MS, brake = StopScene.BRAKE_M;
        const a = v * v / (2 * brake);
        const cruise = Math.max(0, L - brake);
        const tCruise = cruise / v, tStop = tCruise + v / a;
        let m, speed;
        if (t <= 0) { m = 0; speed = v; } else if (t < tCruise) { m = v * t; speed = v; } else if (t < tStop) {
            const u = t - tCruise;
            speed = Math.max(0, v - a * u);
            m = cruise + v * u - 0.5 * a * u * u;
        } else { m = L; speed = 0; }
        m = Math.max(0, Math.min(L, m));
        const pts = way.points;
        let i = 0;
        while (i + 2 < pts.length && pts[i + 1].m < m) i++;
        const p = pts[i], q = pts[Math.min(pts.length - 1, i + 1)];
        const u = q.m > p.m ? (m - p.m) / (q.m - p.m) : 0;
        const parked = t >= tStop;
        const heading = parked ? slot.heading : Math.atan2(q.x - p.x, q.z - p.z);
        return { x: p.x + (q.x - p.x) * u, z: p.z + (q.z - p.z) * u, heading, speed, parked, arriveS: tStop };
    }

    // The scene. `riders`: [{bike: {group or bikeGroup, rider, arms, legs, character, yawAngle?}, s}] in riding order,
    // the player first. `ground(x, z)` the drawn ground's height
    constructor({ stop, route, riders, ground, seed = 1 }) {
        this.stop = stop;
        this.route = route;
        this.ground = ground;
        this.t = 0;
        this.card = false;
        this.skipped = false;
        this.puffs = [];
        this.seed = seed;
        this.riders = riders.map((r, k) => {
            const slot = stop.slots[Math.min(stop.slots.length - 1, k)];
            const fromS = Math.max(stop.s - StopScene.BACK_M - (k === 0 ? 0 : 0), Math.min(stop.s, Number.isFinite(r.s) ? r.s : stop.s - StopScene.BACK_M));
            const way = StopScene.wayIn(stop, route, k === 0 ? fromS : stop.s - StopScene.BACK_M, slot);
            const actions = (r.bike.character && r.bike.character.stop) || [];
            return { ...r, slot, way, start: k * StopScene.ARRIVE_GAP_S, stood: false, actions, nextPuff: StopScene.PUFF_EVERY_S * (0.3 + ((k * 7 + seed) % 5) / 10) };
        });
        const last = this.riders[this.riders.length - 1];
        this.allParkedS = last ? last.start + StopScene.along(last.way, 1e9, last.slot).arriveS : 0;
        this.playerParkedS = this.riders.length ? StopScene.along(this.riders[0].way, 1e9, this.riders[0].slot).arriveS : 0;
    }

    // When the card comes up
    get cardAt() { return this.playerParkedS + StopScene.CARD_AFTER_S; }

    // Skips to where the scene rests: everyone parked and stood, the card up
    skip() {
        this.skipped = true;
        this.t = Math.max(this.t, this.allParkedS + StopScene.GET_OFF_S + 0.01, this.cardAt);
    }

    // One frame: each rider's place on its way in ({x, y, z, heading, speed, parked, stand}), and the camera
    step(dt) {
        this.t += Math.max(0, dt);
        const out = [];
        for (const r of this.riders) {
            const at = StopScene.along(r.way, this.t - r.start, r.slot);
            const y = this.ground(at.x, at.z);
            at.y = Number.isFinite(y) ? y : null;
            at.shown = this.t >= r.start;
            at.stand = at.parked && this.t - r.start - at.arriveS >= StopScene.GET_OFF_S;
            out.push(at);
        }
        // Behind the player as it rides in (CHASE), then the kind's path from where the player parks
        const lead = out[0];
        let camera;
        if (lead && this.t < this.playerParkedS) {
            const C = StopScene.CHASE, sh = Math.sin(lead.heading), ch = Math.cos(lead.heading), y = lead.y === null ? 0 : lead.y;
            const eye = { x: lead.x - C.backM * sh, y: y + C.upM, z: lead.z - C.backM * ch };
            const under = this.ground(eye.x, eye.z);
            if (Number.isFinite(under)) eye.y = Math.max(eye.y, under + StopScene.EYE_CLEAR_M);
            camera = { eye, look: { x: lead.x + C.aheadM * sh, y: y + C.lookUpM, z: lead.z + C.aheadM * ch } };
        } else camera = StopScene.cameraAt(this.stop, this.t - this.playerParkedS, this.ground);
        return { riders: out, camera, card: this.t >= this.cardAt };
    }

    // ---- in the page: the bars, the riders off the bike, the vape clouds ----

    // Two black bars over the canvas that slide in (CSS: .stop-bar, height from 0 to barPx)
    static showBars(doc) {
        const bars = ['top', 'bottom'].map((side) => {
            const bar = doc.createElement('div');
            bar.className = `stop-bar stop-bar-${side}`;
            doc.body.appendChild(bar);
            return bar;
        });
        const size = () => {
            const px = StopScene.barPx(window.innerWidth, window.innerHeight);
            bars.forEach(bar => { bar.style.height = `${px}px`; });
            doc.documentElement.style.setProperty('--stop-bar', `${px}px`);
        };
        // (a moment later, so the height eases from 0)
        setTimeout(size, 50);
        window.addEventListener('resize', size);
        return { bars, size };
    }

    static hideBars(view) {
        if (!view) return;
        window.removeEventListener('resize', view.size);
        view.bars.forEach((bar) => {
            bar.style.height = '0px';
            setTimeout(() => bar.remove(), 600);
        });
    }

    // The rider off the bike, standing on the ground STAND_SIDE_M to the bike's left, turned a little out from it,
    // helmet on: the spine upright (the riding lean is in the rider's own shape: riderSpec.torsoLean), legs straight down,
    // arms at the sides, the boots on the ground at that place. What it changes is kept, so seat() puts it back
    static stand(r, groundY) {
        const bike = r.bike, rider = bike.rider;
        if (!rider || !bike.arms || !bike.legs || !bike.riderBasePos) return false;
        const group = r.player ? bike.group : bike.bikeGroup;
        r.kept = { position: rider.position.clone(), quaternion: rider.quaternion.clone() };
        // The visor up (the owner: helmets on, visors up; no face is modelled, so the open helmet shows its dark inside)
        if (bike.visor) {
            r.kept.visor = { position: bike.visor.position.clone(), rotation: bike.visor.rotation.clone() };
            bike.visor.rotation.x -= StopScene.VISOR_UP;
            bike.visor.position.y += 0.05;
            bike.visor.position.z -= 0.02;
        }
        const lean = (bike.riderSpec && bike.riderSpec.torsoLean) || 0;
        const turn = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.5, 0));
        const upright = new THREE.Quaternion().setFromEuler(new THREE.Euler(-lean, 0, 0));
        rider.quaternion.copy(turn).multiply(upright);
        rider.position.set(bike.riderBasePos.x + StopScene.STAND_SIDE_M, bike.riderBasePos.y, bike.riderBasePos.z - 0.15);
        group.updateMatrixWorld(true);
        // World down in the rider's own axes
        const into = rider.getWorldQuaternion(new THREE.Quaternion()).invert();
        const down = new THREE.Vector3(0, -1, 0).applyQuaternion(into);
        const ahead = new THREE.Vector3(0, 0, 1);
        for (const side of [-1, 1]) {
            const leg = bike.legs[side], arm = bike.arms[side];
            leg.place(leg.root.clone().addScaledVector(down, leg.reach * 0.97).add(new THREE.Vector3(side * 0.03, 0, 0)), null);
            arm.place(arm.root.clone().addScaledVector(down, arm.reach * 0.9).addScaledVector(ahead, 0.06).add(new THREE.Vector3(side * 0.04, 0, 0)), null);
        }
        // The boots on the ground where the rider stands
        rider.updateMatrixWorld(true);
        const foot = rider.localToWorld(bike.legs[-1].at().clone());
        const y = groundY(foot.x, foot.z);
        if (Number.isFinite(y)) {
            const lift = y + 0.03 - foot.y;
            const scale = group.getWorldScale(new THREE.Vector3()).y || 1;
            rider.position.y += lift / scale;
        }
        return true;
    }

    // Back on the bike as built
    static seat(r) {
        const bike = r.bike, rider = bike.rider;
        if (!r.stood || !r.kept || !rider) return;
        rider.position.copy(r.kept.position);
        rider.quaternion.copy(r.kept.quaternion);
        if (r.kept.visor && bike.visor) {
            bike.visor.position.copy(r.kept.visor.position);
            bike.visor.rotation.copy(r.kept.visor.rotation);
        }
        for (const side of [-1, 1]) {
            if (bike.legs && bike.legs[side]) bike.legs[side].rest();
            if (bike.arms && bike.arms[side]) bike.arms[side].rest();
        }
        r.stood = false;
    }

    // A rider with 'vape' in its stop actions breathes out a small cloud now and then (seeded, the same each time):
    // a pale sphere from the helmet's front that grows, rises and fades over PUFF_S. No brand, nothing shown but the cloud
    static puff(scene3d, scene, r, dt) {
        r.nextPuff -= dt;
        if (r.nextPuff > 0) return;
        r.nextPuff = StopScene.PUFF_EVERY_S * (0.8 + 0.4 * ((scene.puffs.length * 13 + scene.seed) % 7) / 7);
        const head = r.bike.helmet || r.bike.rider;
        if (!head) return;
        const at = head.getWorldPosition(new THREE.Vector3());
        const facing = r.bike.rider.getWorldDirection(new THREE.Vector3());
        const mesh = new THREE.Mesh(StopScene.puffGeometry || (StopScene.puffGeometry = new THREE.SphereGeometry(0.1, 10, 8)),
            new THREE.MeshBasicMaterial({ color: 0xeef1f4, transparent: true, opacity: 0.55, depthWrite: false }));
        mesh.name = 'stop-puff';
        mesh.position.copy(at).addScaledVector(facing, 0.22);
        scene3d.add(mesh);
        scene.puffs.push({ mesh, age: 0, drift: facing.multiplyScalar(0.18) });
    }

    static stepPuffs(scene3d, scene, dt) {
        for (let i = scene.puffs.length - 1; i >= 0; i--) {
            const p = scene.puffs[i];
            p.age += dt;
            const u = p.age / StopScene.PUFF_S;
            if (u >= 1) {
                scene3d.remove(p.mesh);
                p.mesh.material.dispose();
                scene.puffs.splice(i, 1);
                continue;
            }
            p.mesh.scale.setScalar(1 + 3.5 * u);
            p.mesh.position.addScaledVector(p.drift, dt).y += 0.25 * dt;
            p.mesh.material.opacity = 0.55 * (1 - u) * (1 - u);
        }
    }

    static clearPuffs(scene3d, scene) {
        for (const p of scene.puffs) { scene3d.remove(p.mesh); p.mesh.material.dispose(); }
        scene.puffs.length = 0;
    }

    // ---- the stop's own ground and props, drawn with the world ----

    // The stop's height at (x, z): its plane (tools/world/stops.mjs groundPlane), or null
    static planeY(stop, x, z) {
        const p = stop.plane;
        return p ? p.y + p.gx * (x - stop.x) + p.gz * (z - stop.z) : null;
    }

    static inside(ring, x, z) {
        let c = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const [xi, zi] = ring[i], [xj, zj] = ring[j];
            if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
        }
        return c;
    }

    // The area as hard standing, AREA_UP_M over the land the importer laid on its plane. One mesh a stop; the stops of
    // one place (the end of one leg is the start of the next) are drawn once
    static get AREA_UP_M() { return 0.05; }
    static get COLORS() {
        // The rail's weathered timber (the lookout photos: a grey-brown post and rail fence)
        return Object.freeze({ timber: [0.43, 0.35, 0.27], table: [0.47, 0.37, 0.25] });
    }

    // The area itself, on its plane: the outline cut into triangles (a plane needs no more), with the asphalt's own
    // texture laid on the ground plane as a junction's paving is (RoadSurface.ASPHALT_M)
    static areaGeometry(stop) {
        const ring = stop.ring.slice(0, stop.ring.length - (stop.ring[0][0] === stop.ring.at(-1)[0] && stop.ring[0][1] === stop.ring.at(-1)[1] ? 1 : 0));
        const up = StopScene.AREA_UP_M;
        const m = typeof RoadSurface !== 'undefined' ? RoadSurface.ASPHALT_M : 4;
        const pos = [], col = [], uv = [];
        const tris = typeof THREE !== 'undefined' ? THREE.ShapeUtils.triangulateShape(ring.map(([x, z]) => new THREE.Vector2(x, z)), []) : [];
        for (const tri of tris) {
            // (wound to face up: x, z as drawn with y up turns the shape's own order over)
            for (const i of [tri[0], tri[2], tri[1]]) {
                const [x, z] = ring[i];
                pos.push(x, StopScene.planeY(stop, x, z) + up, z);
                col.push(1, 1, 1);
                uv.push((x - stop.x) / m, (z - stop.z) / m);
            }
        }
        return { positions: pos, colors: col, uvs: uv };
    }

    // The area's material: the asphalt of a junction's paving, drawn a little nearer than it lies so the land laid on
    // the same plane under it never shows through
    static areaMaterial() {
        if (StopScene.asphalt) return StopScene.asphalt;
        const t = typeof RoadSurface !== 'undefined' ? RoadSurface.textures() : null;
        const material = new THREE.MeshStandardMaterial({ map: t ? t.asphalt.map : null, normalMap: t ? t.asphalt.normal : null, vertexColors: true, roughness: 0.95, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
        material.name = 'stop-area';
        StopScene.asphalt = typeof LandShade !== 'undefined' ? LandShade.patch(material) : material;
        return StopScene.asphalt;
    }

    // The kind's props as boxes: a lookout's timber rail along the outline's sides that face away from the way in
    // (posts every RAIL_STEP_M, two rails), a restaurant's two tables with benches by the slots
    static get RAIL_STEP_M() { return 2; }
    static propsGeometry(stop) {
        const pos = [], col = [];
        const box = (x, y, z, w, h, d, heading, c) => {
            const s = Math.sin(heading), k = Math.cos(heading);
            const at = (u, vy, t) => [x + u * k + t * s, y + vy, z - u * s + t * k];
            const P = [[-w, 0, -d], [w, 0, -d], [w, h, -d], [-w, h, -d], [-w, 0, d], [w, 0, d], [w, h, d], [-w, h, d]].map(([u, vy, t]) => at(u, vy, t));
            for (const [a, b, cc, e] of [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7]]) {
                for (const i of [a, b, cc, a, cc, e]) { pos.push(...P[i]); col.push(c[0], c[1], c[2]); }
            }
        };
        const f = StopScene.frame(stop);
        const C = StopScene.COLORS;
        if (stop.kind === 'lookout') {
            const ring = stop.ring;
            for (let i = 0; i + 1 < ring.length; i++) {
                const [ax, az] = ring[i], [bx, bz] = ring[i + 1];
                const len = Math.hypot(bx - ax, bz - az);
                if (len < 0.5) continue;
                const mx = (ax + bx) / 2, mz = (az + bz) / 2;
                // (the far side of the area from the way in: where the view is)
                if ((mx - f.ox) * f.outX + (mz - f.oz) * f.outZ < 2) continue;
                const heading = Math.atan2(bx - ax, bz - az);
                for (let d = 0; d <= len; d += StopScene.RAIL_STEP_M) {
                    const x = ax + (bx - ax) * d / len, z = az + (bz - az) * d / len;
                    box(x, StopScene.planeY(stop, x, z), z, 0.06, 1.05, 0.06, heading, C.timber);
                }
                for (const h of [0.55, 0.95]) box(mx, StopScene.planeY(stop, mx, mz) + h, mz, 0.04, 0.07, len / 2, heading, C.timber);
            }
        } else if (stop.kind === 'restaurant') {
            // Two tables with their benches, past the slots' row
            for (const side of [-3, 3]) {
                const x = f.ox + side * f.sideX + 4.5 * f.outX, z = f.oz + side * f.sideZ + 4.5 * f.outZ;
                const y = StopScene.planeY(stop, x, z), heading = Math.atan2(f.sideX, f.sideZ);
                box(x, y + 0.72, z, 0.9, 0.05, 0.4, heading, C.table);
                box(x, y, z, 0.06, 0.72, 0.3, heading, C.table);
                for (const t of [-0.75, 0.75]) box(x + t * f.outX, y + 0.42, z + t * f.outZ, 0.9, 0.04, 0.14, heading, C.table);
            }
        }
        return { positions: pos, colors: col };
    }

    // The meshes of every stop of a world (each place once), to add under the world's group
    static buildAll(stops) {
        if (typeof THREE === 'undefined') return [];
        const seen = new Set(), meshes = [];
        for (const stop of stops || []) {
            if (!stop.plane || !Array.isArray(stop.ring)) continue;
            const key = `${stop.x},${stop.z}`;
            if (seen.has(key)) continue;
            seen.add(key);
            for (const [name, g] of [['stop-area', StopScene.areaGeometry(stop)], ['stop-props', StopScene.propsGeometry(stop)]]) {
                if (!g.positions.length) continue;
                const geometry = new THREE.BufferGeometry();
                geometry.setAttribute('position', new THREE.Float32BufferAttribute(g.positions, 3));
                geometry.setAttribute('color', new THREE.Float32BufferAttribute(g.colors, 3));
                if (g.uvs) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(g.uvs, 2));
                geometry.computeVertexNormals();
                const material = name === 'stop-area' ? StopScene.areaMaterial() : new THREE.MeshLambertMaterial({ vertexColors: true });
                const mesh = new THREE.Mesh(geometry, material);
                mesh.name = name;
                mesh.receiveShadow = true;
                mesh.castShadow = name === 'stop-props';
                mesh.userData.stop = stop.id;
                meshes.push(mesh);
            }
        }
        return meshes;
    }
}
