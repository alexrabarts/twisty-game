// Marmots: small colonies of alpine marmots on the high pastures by the lakes, placed by rule from a world's own data
// (any world gets them where its land and water say so, none by a place's name). The model is assets/animals/marmot.glb
// (tools/blender/marmot.py): three poses, each a node, swapped to animate.
//
//   where     MarmotRule.colonies(tile, cover, ctx): on grass, rock or scree at RULE.minY or higher, within RULE.lakeM of
//             water (a water node or water cover), on ground no steeper than RULE.steep (1 - cos of the slope: 0.14 is
//             about 30 degrees), RULE.rideMinM past every road band (RoadClearance) and within RULE.rideMaxM of the
//             ride's own (where a rider sees them: a colony by a side road alone is not seen), at most one colony to a RULE.cellM cell, 2 to 5 animals within
//             RULE.spreadM. Each cell is chosen by a hash of its own place: the same world gives the same colonies in
//             any order its tiles arrive
//   life      each animal sits up and looks out, drops to all fours and scuttles a few metres to another point of its
//             own, and sits again; when the bike comes within LIFE.hideM it runs to its burrow and is gone, with a
//             whistle, and it comes out again LIFE.backS after the bike is LIFE.backM away. Drawn within LIFE.drawM
//   crossing  very rarely one runs across the road ahead (CROSSING): at most one in a ride, only where the road runs
//             straight for CROSSING.sightM before the place (no blind bend or hairpin), and only while it clears the
//             road at least CROSSING.marginS before the bike gets there. A marmot is never solid: it cannot make the bike
//             crash or stop, so a ride with one and a ride without are equal and the crossing needs no board seed
//
// Nothing here is in the physics. No THREE in MarmotRule (node tests read it).
const MarmotRule = {
    // sight: the eye height over the ride and how far back along it (m) a colony is looked for; seen from two of three
    RULE: Object.freeze({ minY: 2000, lakeM: 140, waterMinM: 4, steep: 0.06, rideMinM: 6, rideMaxM: 35, riseM: 4, eyeM: 2, sightBackM: [30, 50, 70], cellM: 128, share: 0.7, tries: 14, least: 2, most: 5, spreadM: 20, apartM: 2.5, lookM: [2, 5] }),
    // Cover classes of tools/world/landcover.mjs a marmot lives on (none, rock, scree, grass) and the water class
    COVERS: Object.freeze([0, 3, 4, 5]),
    WATER_COVER: 7,

    hash(a, b, salt) {
        let h = Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ Math.imul(salt | 0, 83492791);
        h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
        return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
    },

    // The node of a tile nearest (x, z): {i, j} or null outside it
    nodeOf(tile, x, z) {
        const m = WorldData.TILE_M, cell = WorldData.CELL_M, n = WorldData.TILE_N;
        const i = Math.round((x - tile.tx * m) / cell), j = Math.round((z - tile.tz * m) / cell);
        return i < 0 || j < 0 || i >= n || j >= n ? null : { i, j };
    },

    coverAt(tile, cover, i, j) {
        if (!cover) return 0;
        const ci = Math.min(WorldData.COVER_N - 1, Math.floor((i * WorldData.CELL_M) / 16)), cj = Math.min(WorldData.COVER_N - 1, Math.floor((j * WorldData.CELL_M) / 16));
        return cover[cj * WorldData.COVER_N + ci] || 0;
    },

    // The water of a tile as a list of node indices (a water node, or a node whose cover is water)
    waterOf(tile, cover) {
        const n = WorldData.TILE_N, water = [], Z = WorldData.ZONE;
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
            if (tile.zones[j * n + i] === Z.water || MarmotRule.coverAt(tile, cover, i, j) === MarmotRule.WATER_COVER) water.push(j * n + i);
        }
        return water;
    },

    // Whether a marmot may stand at (x, z) of this tile, and its height there; `water` the tile's water (or null to
    // skip the lake rule, for the animals round a colony that met it). ctx.clearance(x, z, reach): metres past the
    // nearest road band
    standAt(tile, cover, x, z, water, ctx, out = {}) {
        const R = MarmotRule.RULE, n = WorldData.TILE_N, cell = WorldData.CELL_M, Z = WorldData.ZONE;
        const node = MarmotRule.nodeOf(tile, x, z);
        if (!node || node.i < 1 || node.j < 1 || node.i > n - 2 || node.j > n - 2) return null;
        const at = node.j * n + node.i;
        if (tile.zones[at] !== Z.terrain) return null;
        const h = tile.heights[at];
        if (!(h >= R.minY)) return null;
        if (!MarmotRule.COVERS.includes(MarmotRule.coverAt(tile, cover, node.i, node.j))) return null;
        const gx = (tile.heights[at + 1] - tile.heights[at - 1]) / (2 * cell), gz = (tile.heights[at + n] - tile.heights[at - n]) / (2 * cell);
        if (1 - 1 / Math.sqrt(gx * gx + gz * gz + 1) > R.steep) return null;
        if (water) {
            let near = Infinity;
            for (const w of water) {
                const wi = w % n, wj = (w - wi) / n;
                const d = Math.hypot(wi - node.i, wj - node.j) * cell;
                if (d < near) near = d;
            }
            if (near > R.lakeM || near < R.waterMinM) return null;
        }
        // Clear of every road by rideMinM, and near enough the ride itself to be seen from it (a side road does not count)
        const past = ctx.clearance(x, z, R.rideMaxM + 1);
        if (past < R.rideMinM) return null;
        const ride = ctx.rideClearance ? ctx.rideClearance(x, z, R.rideMaxM + 1) : past;
        if (ride > R.rideMaxM) return null;
        out.y = ctx.landY ? ctx.landY(x, z) : h;
        if (!Number.isFinite(out.y)) return null;
        // On the side a rider coming up the ride sees: no bank or cut between the road behind and the animal
        if (ctx.seen && !ctx.seen(x, out.y, z)) return null;
        out.past = ride;
        return out;
    },

    // The colonies of one tile: [{id, x, z, animals: [{id, x, y, z, look: {x, y, z}, turn}]}]
    colonies(tile, cover, ctx) {
        const R = MarmotRule.RULE, n = WorldData.TILE_N, m = WorldData.TILE_M;
        let high = false;
        for (let k = 0; k < n * n && !high; k++) high = tile.heights[k] >= R.minY;
        if (!high) return [];
        const water = MarmotRule.waterOf(tile, cover);
        if (!water.length) return [];
        const out = [], cells = Math.round(m / R.cellM), spot = {};
        for (let cz = 0; cz < cells; cz++) {
            for (let cx = 0; cx < cells; cx++) {
                const gx = tile.tx * cells + cx, gz = tile.tz * cells + cz;
                if (MarmotRule.hash(gx, gz, 1) >= R.share) continue;
                let centre = null;
                for (let t = 0; t < R.tries && !centre; t++) {
                    const x = (gx + MarmotRule.hash(gx, gz, 10 + t)) * R.cellM, z = (gz + MarmotRule.hash(gx, gz, 40 + t)) * R.cellM;
                    if (MarmotRule.standAt(tile, cover, x, z, water, ctx, spot)) centre = { x, z };
                }
                if (!centre) continue;
                const want = R.least + Math.floor(MarmotRule.hash(gx, gz, 2) * (R.most - R.least + 1));
                const animals = [];
                for (let k = 0; k < want * 4 && animals.length < want; k++) {
                    const a = MarmotRule.hash(gx, gz, 100 + k) * Math.PI * 2, r = (0.15 + 0.85 * Math.sqrt(MarmotRule.hash(gx, gz, 200 + k))) * R.spreadM / 2;
                    const x = centre.x + Math.cos(a) * r, z = centre.z + Math.sin(a) * r;
                    if (animals.some(o => Math.hypot(o.x - x, o.z - z) < R.apartM)) continue;
                    if (!MarmotRule.standAt(tile, cover, x, z, null, ctx, spot)) continue;
                    const y = spot.y;
                    // A second point of its own a few metres off, where it scuttles to and looks out from
                    const la = MarmotRule.hash(gx, gz, 300 + k) * Math.PI * 2, lr = R.lookM[0] + (R.lookM[1] - R.lookM[0]) * MarmotRule.hash(gx, gz, 400 + k);
                    const lx = x + Math.cos(la) * lr, lz = z + Math.sin(la) * lr;
                    const look = MarmotRule.standAt(tile, cover, lx, lz, null, ctx, {}) ? { x: lx, y: ctx.landY ? ctx.landY(lx, lz) : y, z: lz } : { x, y, z };
                    animals.push({ id: `${gx},${gz},${animals.length}`, x, y, z, look, turn: MarmotRule.hash(gx, gz, 500 + k) * Math.PI * 2 });
                }
                if (animals.length >= R.least) out.push({ id: `${gx},${gz}`, x: centre.x, z: centre.z, past: spot.past, animals });
            }
        }
        return out;
    },

    // Whether the ride runs straight enough for a crossing at ride distance s to be seen in time: the heading turns
    // less than CROSSING.turnDeg in all over the CROSSING.sightM before it (each way counted: an S-bend is not straight)
    seenFrom(route, s) {
        const C = Marmots.CROSSING;
        if (s - C.sightM < 0) return false;
        let turn = 0;
        for (let at = s - C.sightM; at < s; at += 10) turn += Math.abs(route.headingChange(at, Math.min(s, at + 10)));
        return turn * 180 / Math.PI < C.turnDeg;
    },

    // When a crossing of `width` m of road (both bands and CROSSING.edgeM either side) may start with the bike `ahead`
    // m before the place at `speed` m/s: it must have left the road CROSSING.marginS before the bike arrives, and the
    // bike must be within the sight line
    mayStart(ahead, speed, width) {
        const C = Marmots.CROSSING;
        const clear = (C.leadM + width + 2 * C.edgeM) / C.speed;
        return ahead <= C.sightM && ahead >= Math.max(speed, 1) * (clear + C.marginS);
    }
};

// The life of the colonies round the bike: one instanced mesh per pose, the animals near the camera in it
class Marmots {
    // alertM: within it an animal sits up facing the bike and keeps still; hideM: within it, it bolts; scale over the
    // model's real size, so one reads from the saddle
    static get LIFE() { return Object.freeze({ drawM: 260, alertM: 60, hideM: 8, scale: 1.3, backM: 60, backS: 6, sit: [2.5, 7], walk: 1.1, run: 4.2, reachM: 900, most: 48 }); }
    // speed m/s; leadM the run from where it shows to the road's edge; edgeM past each edge of the band; marginS the
    // least time between it leaving the road and the bike arriving; chance one ride in so many has one
    static get CROSSING() { return Object.freeze({ chance: 0.25, sightM: 150, turnDeg: 12, speed: 4.5, leadM: 8, edgeM: 2, marginS: 1, aheadM: 400 }); }
    static get POSES() { return ['marmot_sit', 'marmot_walk', 'marmot_run']; }

    constructor(env, { seed = Math.floor(Math.random() * 1e9) } = {}) {
        this.env = env;
        this.group = new THREE.Group();
        this.group.name = 'marmots';
        this.colonies = new Map();
        this.animals = new Map();
        this.meshes = null;
        this.crossing = null;
        this.seed(seed);
        if (typeof SceneAssets !== 'undefined' && SceneAssets.loadModel) {
            SceneAssets.loadModel('assets/animals/marmot.glb').then(model => this.dress(model)).catch(error => console.warn(`marmots: the model did not load (${error.message}); none are drawn`));
        }
    }

    // A ride's own draw of the crossing: one crossing at most, and only in a CROSSING.chance share of rides
    seed(seed) {
        this.rideSeed = seed >>> 0;
        this.crossingLeft = MarmotRule.hash(this.rideSeed, 7, 3) < Marmots.CROSSING.chance ? 1 : 0;
        this.crossing = null;
    }

    dress(model) {
        const parts = Marmots.POSES.map(name => model.meshes.get(name));
        if (parts.some(p => !p || !p.length)) throw new Error('the model lacks a pose');
        this.meshes = parts.map((list, k) => {
            const [part] = typeof LandShade !== 'undefined' ? LandShade.adopt([list[0]]) : [list[0]];
            const mesh = new THREE.InstancedMesh(part.geometry, part.material, Marmots.LIFE.most);
            mesh.name = Marmots.POSES[k];
            mesh.count = 0;
            mesh.frustumCulled = false;
            mesh.receiveShadow = true;
            mesh.userData.skipCulling = true;
            mesh.userData.world = 'scenery';
            this.group.add(mesh);
            return mesh;
        });
    }

    // The colonies of the tiles round the bike, made once a tile's data is here
    gather(bike) {
        const env = this.env, m = WorldData.TILE_M, L = Marmots.LIFE;
        const roads = env.scenery && env.scenery.roads;
        if (!roads) return;
        const ctx = { clearance: (x, z, reach) => roads.clearance(x, z, reach), rideClearance: (x, z, reach) => roads.clearance(x, z, reach, () => true), landY: (x, z) => env.ground.tileHeight(x, z), seen: (x, y, z) => this.seen(x, y, z) };
        for (let tz = Math.floor((bike.z - L.reachM) / m); tz <= Math.floor((bike.z + L.reachM) / m); tz++) {
            for (let tx = Math.floor((bike.x - L.reachM) / m); tx <= Math.floor((bike.x + L.reachM) / m); tx++) {
                const key = `${tx},${tz}`;
                if (this.colonies.has(key)) continue;
                const tile = env.data.tile(key);
                if (!tile) continue;
                const list = MarmotRule.colonies(tile, env.data.cover(key), ctx);
                this.colonies.set(key, list);
                for (const colony of list) for (const a of colony.animals) this.animals.set(a.id, this.life(a, colony));
            }
        }
    }

    // Whether a rider coming up the ride sees (x, y, z): the ground there within RULE.riseM of the ride's height beside it,
    // and the line from RULE.eyeM over the ride RULE.sightBackM behind clear of the land, from two of the three
    seen(x, y, z) {
        const R = MarmotRule.RULE, env = this.env, route = env.route, roads = env.scenery.roads;
        const near = {};
        roads.clearance(x, z, R.rideMaxM + 1, () => true, false, near);
        if (!near.segment || near.segment.edgeId !== null) return false;
        const s = route.sArray[near.segment.index], at = route.sample(s, this.scratch || (this.scratch = {}));
        if (Math.abs(y - at.y) > R.riseM) return false;
        let clear = 0;
        for (const back of R.sightBackM) {
            if (s - back < 0) continue;
            const p = route.sample(s - back, this.scratch), ey = p.y + R.eyeM;
            let open = true;
            for (let k = 1; k < 12 && open; k++) {
                const t = k / 12, g = env.ground.tileHeight(p.x + (x - p.x) * t, p.z + (z - p.z) * t);
                if (g !== null && g > ey + (y + 0.3 - ey) * t - 0.1) open = false;
            }
            if (open) clear++;
        }
        return clear >= 2;
    }

    life(a, colony) {
        const random = MarmotRule.hash(this.rideSeed, a.x * 10, a.z * 10);
        return { a, colony, mode: 'sit', t: random * 4, until: 2 + random * 4, x: a.x, y: a.y, z: a.z, heading: a.turn, at: 'home', goneSince: null };
    }

    // Once a frame: the animals near the camera live on and are drawn
    update(dt, bike, speed, camera, sound = null) {
        if (!this.meshes) return;
        const L = Marmots.LIFE;
        this.gather(bike);
        this.updateCrossing(dt, bike, speed);
        const counts = [0, 0, 0];
        const matrix = Marmots.matrix || (Marmots.matrix = new THREE.Matrix4());
        const q = Marmots.quat || (Marmots.quat = new THREE.Quaternion()), p = Marmots.pos || (Marmots.pos = new THREE.Vector3());
        const one = Marmots.one || (Marmots.one = new THREE.Vector3(L.scale, L.scale, L.scale)), up = Marmots.up || (Marmots.up = new THREE.Vector3(0, 1, 0));
        for (const life of this.animals.values()) {
            const near = Math.hypot(life.x - camera.x, life.z - camera.z);
            if (near > L.drawM && life !== (this.crossing && this.crossing.life)) continue;
            life.bike = bike;
            if (!(this.crossing && this.crossing.life === life)) this.step(life, dt, Math.hypot(life.x - bike.x, life.z - bike.z), sound);
            if (life.mode === 'gone') continue;
            const pose = life.mode === 'sit' ? 0 : life.mode === 'walk' ? 1 : 2;
            if (counts[pose] >= L.most) continue;
            matrix.compose(p.set(life.x, life.y, life.z), q.setFromAxisAngle(up, life.heading), one);
            this.meshes[pose].setMatrixAt(counts[pose]++, matrix);
        }
        this.meshes.forEach((mesh, k) => {
            mesh.count = counts[k];
            mesh.instanceMatrix.needsUpdate = true;
        });
    }

    // One animal's life for dt: sit and look out, scuttle between its two points, run home and vanish near the bike
    step(life, dt, bikeM, sound) {
        const L = Marmots.LIFE, a = life.a;
        if (life.mode === 'gone') {
            if (bikeM > L.backM) {
                life.goneSince += dt;
                if (life.goneSince >= L.backS) Object.assign(life, { mode: 'sit', t: 0, until: L.sit[0], x: a.x, y: a.y, z: a.z, at: 'home', goneSince: null });
            } else life.goneSince = 0;
            return;
        }
        // The bike coming: sit up on the spot, turned to it, and watch
        if (bikeM < L.alertM && bikeM >= L.hideM && life.mode !== 'run') {
            if (life.mode !== 'sit' || !life.alert) Object.assign(life, { mode: 'sit', alert: true, t: 0, until: Infinity });
            if (life.bike) life.heading = Math.atan2(life.bike.x - life.x, life.bike.z - life.z);
            return;
        }
        if (life.alert && bikeM >= L.alertM) Object.assign(life, { alert: false, t: 0, until: L.sit[0] });
        if (bikeM < L.hideM && life.mode !== 'run') {
            life.mode = 'run';
            life.target = a;
            // One whistle for the colony: the first that sees the bike calls
            if (sound && life.colony.warned !== true) {
                life.colony.warned = true;
                if (sound.playWhistle) sound.playWhistle(bikeM);
            }
        }
        if (life.mode === 'run' || life.mode === 'walk') {
            const to = life.target, speed = life.mode === 'run' ? L.run : L.walk;
            const dx = to.x - life.x, dz = to.z - life.z, d = Math.hypot(dx, dz);
            if (d > 1e-3) life.heading = Math.atan2(dx, dz);
            const stepM = speed * dt;
            if (d <= stepM) {
                life.x = to.x; life.y = to.y; life.z = to.z;
                if (life.mode === 'run') {
                    life.mode = 'gone';
                    life.goneSince = 0;
                    life.colony.warned = bikeM < L.backM;
                } else {
                    life.mode = 'sit';
                    life.t = 0;
                    life.until = L.sit[0] + (L.sit[1] - L.sit[0]) * MarmotRule.hash(this.rideSeed, Math.floor(life.x * 7), Math.floor(life.z * 7));
                }
            } else {
                life.x += dx / d * stepM; life.z += dz / d * stepM;
                life.y = to.y + (life.y - to.y) * Math.max(0, 1 - stepM / d);
            }
            return;
        }
        life.t += dt;
        if (life.t >= life.until) {
            life.mode = 'walk';
            life.at = life.at === 'home' ? 'look' : 'home';
            life.target = life.at === 'home' ? a : a.look;
        }
    }

    // The one crossing of a ride: planned at a colony ahead where the road runs straight, started when the bike is
    // where the rule allows, and run straight across at CROSSING.speed
    updateCrossing(dt, bike, speed) {
        const C = Marmots.CROSSING, env = this.env, route = env.route;
        if (this.crossing && this.crossing.running) {
            const c = this.crossing, life = c.life;
            const dx = c.to.x - life.x, dz = c.to.z - life.z, d = Math.hypot(dx, dz), stepM = C.speed * dt;
            if (d <= stepM) {
                // Over the road and away into the grass: it does not come back
                this.animals.delete('crossing');
                this.crossing = null;
            } else {
                life.x += dx / d * stepM; life.z += dz / d * stepM;
                life.y = env.ground.groundY(life.x, life.z, { start: c.index - 3, end: c.index + 3 });
            }
            return;
        }
        if (!this.crossingLeft || !Number.isFinite(bike.s)) return;
        if (!this.crossing) {
            // A colony within reach of the road ahead, beside a stretch the bike sees from far enough back
            for (const list of this.colonies.values()) {
                for (const colony of list) {
                    if (colony.past > 60) continue;
                    const loc = env.ground.locate(colony.x, colony.z, null, {});
                    const at = route.sArray[loc.index];
                    if (at - bike.s < C.sightM || at - bike.s > C.aheadM || !MarmotRule.seenFrom(route, at)) continue;
                    // (half the colonies that qualify, by the ride's own draw; a probe may take the first)
                    if (!this.anyColony && MarmotRule.hash(this.rideSeed, colony.x, colony.z) >= 0.5) continue;
                    this.crossing = { colony, s: at, index: loc.index, side: Math.sign(loc.lateral || 1), running: false };
                    break;
                }
                if (this.crossing) break;
            }
            return;
        }
        const c = this.crossing, ahead = c.s - bike.s;
        if (ahead < 0) { this.crossing = null; return; }
        const point = route.sample(c.s, {}), half = point.width / 2 + RoadSurface.VERGE_M;
        if (!MarmotRule.mayStart(ahead, speed, 2 * half)) return;
        // It shows CROSSING.leadM off the edge on its colony's side and runs to the same distance past the other
        const out = side => side * (half + C.edgeM + C.leadM);
        const from = { x: point.x + out(c.side) * Math.cos(point.heading), z: point.z - out(c.side) * Math.sin(point.heading) };
        const to = { x: point.x - out(c.side) * Math.cos(point.heading), z: point.z + out(c.side) * Math.sin(point.heading) };
        const life = this.life({ id: 'crossing', x: from.x, y: env.ground.groundY(from.x, from.z, { start: c.index - 3, end: c.index + 3 }), z: from.z, look: from, turn: 0 }, c.colony);
        life.mode = 'run';
        this.animals.set('crossing', life);
        Object.assign(c, { running: true, life, to, startAhead: ahead, startSpeed: speed });
        this.lastCrossing = c;
        this.crossingLeft--;
    }

    dispose() {
        if (this.group.parent) this.group.parent.remove(this.group);
        if (this.meshes) this.meshes.forEach(mesh => mesh.dispose());
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Marmots, MarmotRule };
}
