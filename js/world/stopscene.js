// StopScene: the scene at a leg's end stop (manifest.stops, tools/world/stops.mjs). After the finish line the clock has
// stopped and the game rides: black bars slide in at the top and the foot of the screen, the HUD fades, and the player
// is ridden on at a calm pace into a bay of the stop, with the riders of the group that kept up behind it, each into
// the bay beside the last (EndShot, js/world/endshot.js: who comes in, the bays, the ways in, the ride). Each rider
// stops with a foot down, then gets off and stands beside the bike, helmet on. The camera is one shot: the chase
// camera at the line, a follow camera behind the player as it rides in, then a crane to a composed view with the
// parked bikes in the lower third and the view beyond (EndShot.compose, EndShot.Camera). The result card fades in once
// the camera has held and everyone has parked, with what can be done there (a picture; the next leg). Enter, Space,
// Escape or a tap before the card skips to it. Nothing here names a place.
//
// The tables are data: KINDS (a stop kind: its fallback hold and the actions it offers), HOLDS (a stop's own photo
// hold: the composed view looks its way) and the characters' own `stop` list (CHARACTERS in js/vehicle.js: 'vape' for
// the three the owner named). A new stop or rider needs data only.
//
// A kind's hold, used only where no composed view fits, is in the stop's own frame: the origin is the middle of the
// slots' row, `out` points from where the way in leaves the ride to that middle (at a lookout, into the view), `side`
// is square to it (to the right of out), and up is up: { eye: [side, up, out], look: [side, up, out], hfov } (metres,
// degrees); with `edge` its `out` is measured from the area's outline on the out axis (a lookout's rail) instead.
class StopScene {
    static get KINDS() {
        // In front of the bikes, looking back at the group
        // (`group`: it frames the bikes parked: StopScene.fitGroup)
        const along = Object.freeze({ eye: [6, 2.6, 9], look: [0, 1, 0], hfov: 65, group: true });
        return Object.freeze({
            // At the rail, over it and down the valley
            lookout: { hold: Object.freeze({ eye: [0, 1.8, -0.6], look: [0, -60, 160], edge: true, hfov: 70 }), actions: ['photo'] },
            restaurant: { hold: along, actions: ['photo'] },
            hotel: { hold: along, actions: ['photo'] },
            fuel: { hold: along, actions: ['photo'] },
            carpark: { hold: along, actions: ['photo'] }
        });
    }

    // A stop's own hold, by stop id, in world terms: the eye at (x, z), upM over the drawn ground, turned to
    // `bearing` (degrees from north, clockwise), tipped by `pitch` (degrees, down is negative), with `hfov` degrees
    // across the picture and at most `vfovMost` up and down (a tall screen). Matched to the owner's photos
    // (tools/world/photomatch.mjs, the skyline fit; .agent/system/world.md, "The stop scene at a leg's end"). The shot
    // composes its view the way the hold looks, with the group in front of it, and takes the hold's air
    static get HOLDS() {
        return Object.freeze({
            // (haze: the far slopes 3 to 8 km off and the forest 1 to 3 km off in that photo against the held shot
            // under four depths of haze: 1 / 7500 m is the nearest to both; LandShade.HAZE's own 1 / 4400 m drew them
            // 20 to 40 per cent lighter and bluer)
            'gotthard-north-end': Object.freeze({ x: -831.4, z: 10583.2, upM: 1.6, bearing: 103.05, pitch: -6.9, hfov: 71.5, vfovMost: 56, haze: Object.freeze({ perM: 1 / 7500 }) })
        });
    }

    // What the held shot raises over the graphics level in force, by the level's id (Game.raiseShot), from the
    // scene's start, so the land and the trees are built while the camera moves and nothing comes in after it holds.
    // A key left out keeps the level's own. Never less than the level has (tests/unit/world-stop-scene.test.js):
    //   tileLodM       the land's level-of-detail distances (WorldStreamer.TILE_LOD_M: 700, 2000 m)
    //   treeShare, treeNear, pixelRatio, shadowMap, msaa, effectMs   as the level's own (js/quality.js)
    //   treeNearM, treeMidM, triangleScale   the near and mid trees' reach and the trees' triangle cap
    //                  (Scenery.TREE_NEAR_M 140 m, TREE_MID_M 420 m, TRIANGLE_CAP)
    // The levels a phone or a tablet starts at (lowest to high, Quality.START) raise only what is built once and costs
    // little to draw: the land's detail and the trees. On the phone page the pixel ratio 2 and the effects over High
    // took its held frame from 6.2 to 8.6 ms (worst 18 ms) on a computer's GPU, so a real phone's would stall. The frame times on the held shot are in .agent/system/graphics.md, "The held shot at a leg's end"
    static get RAISE() {
        const top = Object.freeze({ tileLodM: [2500, 6000], treeShare: 1, treeNear: 48, treeNearM: 220, treeMidM: 1000, triangleScale: 1.4, pixelRatio: 2, shadowMap: 4096, msaa: 4, effectMs: 99 });
        return Object.freeze({
            lowest: Object.freeze({ tileLodM: [1000, 2500], treeShare: 0.6 }),
            low: Object.freeze({ tileLodM: [1200, 3000], treeShare: 0.8 }),
            medium: Object.freeze({ tileLodM: [1500, 4000], treeShare: 1, treeMidM: 600 }),
            high: Object.freeze({ tileLodM: [2000, 5000], treeShare: 1, treeNear: 48, treeMidM: 800, triangleScale: 1.2 }),
            full: top,
            rich: top,
            ultra: top
        });
    }

    // What the held shot builds over the level (RAISE: the land's reach, the trees) is raised in RAISE_STEPS over the
    // scene's first RAISE_RAMP_S, so what it brings into view comes over several frames, not in the first
    static get RAISE_RAMP_S() { return 3; }
    static get RAISE_STEPS() { return 6; }

    // GET_OFF_S after it stops (a foot down, upright, the engine idling) the rider stands beside the bike, STAND_SIDE_M
    // to its left
    static get GET_OFF_S() { return 1.6; }
    static get STAND_SIDE_M() { return 0.75; }
    // The ground is read on the ride's rows within HINT_ROWS of a place's own (WorldGround.locate's hint)
    static get HINT_ROWS() { return 40; }
    // Riders past the stop turn round this far past the front one
    static get TURN_M() { return 12; }
    // A rider with no place on the ride comes in from this far back along it
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
    // The fallback hold's eye keeps this far over the ground under it
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
        // How far out the outline is on the out axis from the middle (a key with `edge` is measured from there)
        let edge = 0;
        while (edge < 300 && StopScene.inside(stop.ring, ox + dx * (edge + 0.5), oz + dz * (edge + 0.5))) edge += 0.5;
        return { ox, oz, outX: dx, outZ: dz, sideX: -dz, sideZ: dx, edge };
    }

    // A point of a kind's hold in world terms ([side, up, out] in the stop's frame f; up over y0)
    static framePoint(f, p, edge, y0) {
        const out = p[2] + (edge ? f.edge : 0);
        return { x: f.ox + p[0] * f.sideX + out * f.outX, y: y0 + p[1], z: f.oz + p[0] * f.sideZ + out * f.outZ };
    }

    static aimOf(eye, look) { return EndShot.aimOf(eye, look); }
    static vfovOf(hfov, aspect, most = 60) { return EndShot.vfovOf(hfov, aspect, most); }

    // The fallback hold, where no composed view fits: {eye: {x, y, z}, yaw, pitch, roll, fov} (radians, fov in degrees,
    // vertical, for `aspect`). The stop's own row of HOLDS when it has one, else the hold its data carries (`hold`:
    // route.json, the importer), else its kind's hold. `groundY(x, z)` the drawn ground
    static holdOf(stop, groundY = () => 0, aspect = 16 / 9, parked = null) {
        const r = Math.PI / 180;
        const own = StopScene.HOLDS[stop.id] || stop.hold;
        if (own) {
            const g = groundY(own.x, own.z);
            const y = (Number.isFinite(g) ? g : StopScene.planeY(stop, own.x, own.z) || 0) + own.upM;
            return { eye: { x: own.x, y, z: own.z }, yaw: -own.bearing * r, pitch: own.pitch * r, roll: 0, fov: StopScene.vfovOf(own.hfov, aspect, own.vfovMost), haze: own.haze || null };
        }
        const hold = (StopScene.KINDS[stop.kind] || StopScene.KINDS.carpark).hold;
        const f = StopScene.frame(stop);
        const base = groundY(f.ox, f.oz);
        const y0 = Number.isFinite(base) ? base : 0;
        let eye = StopScene.framePoint(f, hold.eye, hold.edge, y0);
        let look = StopScene.framePoint(f, hold.look, hold.edge, y0);
        if (hold.group) ({ eye, look } = StopScene.fitGroup(stop, eye, look, StopScene.vfovOf(hold.hfov, aspect), aspect, groundY, y0, parked));
        // The eye never under EYE_CLEAR_M over the ground where it stands (a hold's height is over the stop's middle)
        const under = groundY(eye.x, eye.z);
        if (Number.isFinite(under)) eye.y = Math.max(eye.y, under + StopScene.EYE_CLEAR_M);
        return { eye, ...StopScene.aimOf(eye, look), roll: 0, fov: StopScene.vfovOf(hold.hfov, aspect) };
    }

    // A hold that frames the group: it looks at the middle of the slots the riders park in (the first `parked`, or
    // all), and stands back along its line from there until every bike and rider beside it is inside the picture by
    // FIT_MARGIN of each half (no further than FIT_MOST times as far)
    static get FIT_MARGIN() { return 0.08; }
    static get FIT_MOST() { return 3; }

    static fitGroup(stop, eye, look, vfov, aspect, groundY, y0, parked = null) {
        const slots = stop.slots.slice(0, Math.max(1, Math.min(stop.slots.length, parked || stop.slots.length)));
        const yOf = (x, z) => { const g = groundY(x, z); return Number.isFinite(g) ? g : y0; };
        const points = [];
        for (const slot of slots) {
            const fx = Math.sin(slot.heading), fz = Math.cos(slot.heading);
            for (const along of [-1.2, 1.2]) for (const side of [-0.9, 0.9]) {
                const x = slot.x + fx * along + fz * side, z = slot.z + fz * along - fx * side, y = yOf(x, z);
                points.push({ x, y, z }, { x, y: y + 1.8, z });
            }
        }
        const cx = slots.reduce((n, q) => n + q.x, 0) / slots.length, cz = slots.reduce((n, q) => n + q.z, 0) / slots.length;
        const middle = { x: cx, y: yOf(cx, cz) + 1, z: cz };
        const r = Math.PI / 180, tv = Math.tan((vfov * r) / 2), th = tv * aspect, keep = 1 - StopScene.FIT_MARGIN;
        const fits = (e) => {
            let fx = middle.x - e.x, fy = middle.y - e.y, fz = middle.z - e.z;
            const fl = Math.hypot(fx, fy, fz);
            fx /= fl; fy /= fl; fz /= fl;
            let rx = -fz, rz = fx;
            const rl = Math.hypot(rx, rz) || 1;
            rx /= rl; rz /= rl;
            const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;
            return points.every((p) => {
                const vx = p.x - e.x, vy = p.y - e.y, vz = p.z - e.z;
                const d = vx * fx + vy * fy + vz * fz;
                if (d < 1) return false;
                return Math.abs(vx * rx + vz * rz) <= th * keep * d && Math.abs(vx * ux + vy * uy + vz * uz) <= tv * keep * d;
            });
        };
        const back = { x: eye.x - middle.x, y: eye.y - middle.y, z: eye.z - middle.z };
        let out = eye;
        for (let k = 1; k <= StopScene.FIT_MOST; k += 0.05) {
            out = { x: middle.x + back.x * k, y: middle.y + back.y * k, z: middle.z + back.z * k };
            if (fits(out)) break;
        }
        return { eye: out, look: middle };
    }

    // The haze t seconds into the shot (over `base`, LandShade.HAZE): eased with the crane from the ride's own to the
    // hold's, so the air changes as the view does and never in one frame; null for a hold with no haze of its own.
    // `from` when the crane starts, `flyS` when it holds
    static hazeAt(hold, t, base, flyS, from = 0) {
        if (!hold || !hold.haze || !base) return null;
        const w = StopScene.ease((t - from) / Math.max(1e-3, flyS - from)), out = { ...base };
        for (const [key, value] of Object.entries(hold.haze)) if (Number.isFinite(base[key])) out[key] = base[key] + (value - base[key]) * w;
        return out;
    }

    static ease(u) { return EndShot.ease(u); }
    static turn(a, b) { return EndShot.turn(a, b); }

    // The town down a valley in the held view, as plain houses (walls and a gabled roof each, from the buildings' own
    // footprints and heights), for the ones further than TOWN_FROM_M from the bays: the scenery draws a world's houses
    // within Scenery.BUILDING_REACH_M (450 m) of the bike, and the town over Airolo, 2.3 km down from the lookout, was
    // not drawn at all. One mesh, no shadow, in the world's group so it takes the haze
    static get TOWN_FROM_M() { return 500; }
    static get TOWN_IN_S() { return 3; }
    static townGeometry(houses, groundY, from) {
        const pos = [], col = [];
        const push = (p, c) => { pos.push(p[0], p[1], p[2]); col.push(c[0], c[1], c[2]); };
        const quad = (a, b, c, d, k) => { push(a, k); push(b, k); push(c, k); push(a, k); push(c, k); push(d, k); };
        for (const h of houses) {
            if (!h || Math.hypot(h.x - from.x, h.z - from.z) < StopScene.TOWN_FROM_M) continue;
            const g = groundY(h.x, h.z);
            if (!Number.isFinite(g)) continue;
            const w = Math.max(5, h.w || 8) / 2, d = Math.max(5, h.d || 10) / 2, top = g + Math.max(4, h.h || 7), ridge = top + w * 0.7;
            const c = Math.cos(h.heading || 0), s = Math.sin(h.heading || 0);
            const at = (u, v, y) => [h.x + u * c + v * s, y, h.z - u * s + v * c];
            const k = Math.abs(Math.sin(h.x * 12.9898 + h.z * 78.233)) % 1;
            // (plaster and timber walls, slate and tile roofs, a little lighter than they are near: from 2 km in the haze,
            // white walls stood out as bright as snow and the roofs as black)
            const wall = k > 0.3 ? [0.66 + 0.06 * k, 0.63 + 0.05 * k, 0.57 + 0.05 * k] : [0.46, 0.36, 0.27], roof = k > 0.55 ? [0.45, 0.33, 0.27] : [0.42, 0.42, 0.44];
            const foot = g - 2;
            const A = at(-w, -d, foot), B = at(w, -d, foot), C = at(w, d, foot), D = at(-w, d, foot);
            const a = at(-w, -d, top), b = at(w, -d, top), c2 = at(w, d, top), d2 = at(-w, d, top);
            quad(A, B, b, a, wall); quad(B, C, c2, b, wall); quad(C, D, d2, c2, wall); quad(D, A, a, d2, wall);
            const r0 = at(0, -d, ridge), r1 = at(0, d, ridge);
            quad(a, r0, r1, d2, roof); quad(r0, b, c2, r1, roof);
            push(a, wall); push(b, wall); push(r0, wall);
            push(c2, wall); push(d2, wall); push(r1, wall);
        }
        return { positions: pos, colors: col };
    }

    static townMesh(houses, groundY, from) {
        if (typeof THREE === 'undefined') return null;
        const g = StopScene.townGeometry(houses, groundY, from);
        if (!g.positions.length) return null;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(g.positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(g.colors, 3));
        geometry.computeVertexNormals();
        // (it fades in over TOWN_IN_S from the scene's start, Game.stepStopScene: nothing comes into the shot at once)
        const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0 }));
        mesh.name = 'stop-town';
        return mesh;
    }

    // A puff of vapour: a sprite with a soft round edge (PUFF_TEXTURE), its own material so it fades on its own
    // (Game.prewarmWorldScenery draws one at load: its program compiled at the first puff, 80 ms into the held shot).
    // It was a lit-less sphere, drawn as a flat pale disc with a hard edge over the rider's helmet in the held view
    static get PUFF_M() { return 0.22; }
    static get PUFF_OPACITY() { return 0.32; }
    static puffMesh() {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: StopScene.puffTexture(), color: 0xeef1f4, transparent: true, opacity: StopScene.PUFF_OPACITY, depthWrite: false }));
        sprite.scale.setScalar(StopScene.PUFF_M);
        return sprite;
    }

    // The puff's texture, made once: a disc whose alpha falls from the middle to none at its edge
    static puffTexture() {
        if (StopScene.puffMap !== undefined) return StopScene.puffMap;
        StopScene.puffMap = null;
        if (typeof document === 'undefined' || !document.createElement) return null;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 64;
        const ctx = canvas.getContext && canvas.getContext('2d');
        if (!ctx) return null;
        const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.45, 'rgba(255,255,255,0.55)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 64, 64);
        StopScene.puffMap = new THREE.CanvasTexture(canvas);
        return StopScene.puffMap;
    }

    // The scene. `riders`: [{bike: {group or bikeGroup, rider, arms, legs, character}, s, player, at: {x, z}, speed, yaw,
    // lean}] (the player and every rider of the group, with its place on the ride, its own place, speed, heading and
    // lean as the line was crossed). `ground(x, z, s)` the drawn ground's height, read near ride distance s where two
    // roads or a road and the land stand one over the other (the Schöllenen's way down to Göschenen passes 10 m over
    // the ride: read with no hint, the ground under a bike there flipped between them); `faces(x, z, reach)` the walls and houses
    // near a place (WorldEnvironment.cameraFaces) or null. `camera` the chase camera at the start ({offset: the eye less
    // the player's place, yaw, pitch, roll, fov}), or none (the scene then starts on its held view); `aspect` the
    // screen's, `visible` the share of its height between the bars; `houses` the world's buildings ({x, z}: a view down a
    // valley shows the town in it, EndShot.valleyOf)
    constructor({ stop, route, riders, ground, seed = 1, camera = null, aspect = 16 / 9, faces = null, visible = 0.76, houses = null }) {
        const T = EndShot.TUNING;
        this.stop = stop;
        this.route = route;
        // (the ground at the stop, and under the camera near where the player is on its way: hintS)
        this.groundAt = ground;
        this.hintS = stop.s;
        ground = (x, z) => this.groundAt(x, z, stop.s);
        this.ground = ground;
        this.faces = faces;
        this.t = 0;
        this.card = false;
        this.skipped = false;
        this.puffs = [];
        this.seed = seed;
        this.visible = visible;
        // Who comes in: the player and the riders that kept up (EndShot.keep); the rest never show
        const player = riders.find(r => r.player) || riders[0];
        const crew = riders.filter(r => r !== player);
        const kept = EndShot.keep(stop, { s: player.s, speed: player.speed }, crew);
        let coming = [player, ...crew.filter((r, k) => kept[k])];
        // The bays: as many as the stop's row holds, faced the way the view lies
        const first = stop.slots[0];
        const toward = EndShot.views(stop, first, ground)[0] || null;
        const plan = EndShot.bays(stop, coming.length, toward);
        this.plan = plan;
        // (the riders that reach the stop first take the bays first: by how far each rides to the stop's entry; a
        // row too short leaves out the last of the group)
        const entry = stop.path.slice(0, plan.entry + 1).map(([x, z]) => ({ x, z }));
        // (the riders past the turn-in turn round together, TURN_M past the front one: each turning where it was, the
        // turns of those behind crossed the lane of the ones still riding out)
        const sOf = r => (Number.isFinite(r.s) ? r.s : stop.s - StopScene.BACK_M);
        const past = coming.filter(r => sOf(r) > stop.s + 1);
        const turnAt = past.length ? Math.max(...past.map(sOf)) + StopScene.TURN_M : null;
        // (a rider out of sight ahead of the player at the line finished first: traffic parks a rider that rides off
        // the end of the stage out of sight. It is in its bay already, the furthest along the aisle)
        const early = r => !r.player && r.hidden && sOf(r) >= sOf(player);
        const lead = coming.map((r) => {
            if (early(r)) return { r, raw: [], m: -1, early: true };
            const fromS = sOf(r);
            const road = EndShot.roadPart(stop, route, fromS, r.at || null, 14, StopScene.TURN_M, turnAt);
            const raw = [...road, ...entry];
            let m = 0;
            for (let i = 1; i < raw.length; i++) m += Math.hypot(raw[i].x - raw[i - 1].x, raw[i].z - raw[i - 1].z);
            return { r, raw, m };
        });
        lead.sort((a, b) => a.m - b.m || (b.r.player ? 1 : 0) - (a.r.player ? 1 : 0));
        if (lead.length > plan.bays.length) {
            const keep = lead.filter(l => l.r === player).concat(lead.filter(l => l.r !== player).slice(0, plan.bays.length - 1));
            lead.splice(0, lead.length, ...lead.filter(l => keep.includes(l)));
        }
        coming = lead.map(l => l.r);
        this.left = riders.filter(r => !coming.includes(r));
        this.riders = lead.map(({ r, raw, early: first }, k) => {
            const slot = plan.bays[k];
            const from = raw[raw.length - 1];
            const into = plan.approach(k, from);
            const pts = (first ? [{ x: slot.x - Math.sin(slot.heading), z: slot.z - Math.cos(slot.heading) }, { x: slot.x, z: slot.z }] : [...raw.slice(0, -1), ...into]).map(p => ({ x: p.x, z: p.z, s: Number.isFinite(p.s) ? p.s : stop.s, y: 0 }));
            const way = EndShot.smoothWay(pts);
            // (each point of the way on the ground as drawn, read near its own place on the ride)
            let last = NaN;
            for (let i = 0; i < way.n; i++) {
                const y = this.groundAt(way.x[i], way.z[i], way.s[i]);
                way.y[i] = Number.isFinite(y) ? y : Number.isFinite(last) ? last : 0;
                last = way.y[i];
            }
            StopScene.steady(way.y, StopScene.STEADY_N);
            const actions = (r.bike.character && r.bike.character.stop) || [];
            return { ...r, slot, way, early: !!first, stood: false, actions, nextPuff: StopScene.PUFF_EVERY_S * (0.3 + ((k * 7 + seed) % 5) / 10) };
        });
        // The ride in, planned whole: the player at the group's pace where the way is straight, the group at its own,
        // and everyone calm into the bay
        this.ride = EndShot.ride(this.riders.map((r) => {
            const speed = Number.isFinite(r.speed) ? r.speed : T.calmMs;
            const cruise = r.player ? T.fastMs : Math.max(T.calmMs, Math.min(T.fastMs, speed));
            return r.early ? { way: r.way, v0: 0, cruise, parked: true } : { way: r.way, v0: speed, cruise, h0: r.yaw, lean0: r.lean };
        }));
        this.playerIndex = Math.max(0, this.riders.findIndex(r => r.player));
        this.riders.forEach((r, k) => { r.parkedAt = this.ride.parkedAt[k]; });
        const parked = this.ride.parkedAt.filter(Number.isFinite);
        this.playerParkedS = Number.isFinite(this.ride.parkedAt[this.playerIndex]) ? this.ride.parkedAt[this.playerIndex] : this.ride.frames / this.ride.hz;
        this.allParkedS = parked.length ? Math.max(...parked) : this.playerParkedS;
        // The held view: composed over the bays (EndShot.compose), or the kind's hold where nothing fits
        this.aspect = aspect;
        const bays = this.riders.map(r => r.slot);
        const mx = bays.reduce((n, b) => n + b.x, 0) / bays.length, mz = bays.reduce((n, b) => n + b.z, 0) / bays.length;
        const near = StopScene.facesNear(faces, mx, mz, 120);
        const own = StopScene.HOLDS[stop.id] || stop.hold;
        this.hold = EndShot.compose(stop, bays, ground, aspect, near, visible, houses) || StopScene.holdOf(stop, ground, aspect, bays.length);
        this.composed = !!this.hold.view || !!this.hold.hand;
        this.hold.haze = (own && own.haze) || null;
        // The crane: from craneLeadS before the player parks (followMostS at the latest: a long way in is not followed
        // whole), as long as its way needs, over the least arc that clears
        this.craneAt = Math.max(T.joinS + 0.5, Math.min(T.followMostS, this.playerParkedS - T.craneLeadS));
        this.from = camera;
        this.camera = null;
        if (camera) {
            this.camera = new EndShot.Camera({ from: camera, hold: this.hold, ground: (x, z) => this.groundAt(x, z, this.hintS), faces, craneAt: this.craneAt, craneS: T.craneLeastS });
            const bike = this.playerAt(this.craneAt);
            const fe = { x: bike.x - Math.sin(bike.heading) * this.camera.back, y: bike.y + this.camera.up, z: bike.z - Math.cos(bike.heading) * this.camera.back };
            const far = Math.hypot(this.hold.eye.x - fe.x, this.hold.eye.y - fe.y, this.hold.eye.z - fe.z);
            // (and no faster a turn than craneTurnDegS on average: a held view that looks back the way the player came)
            const turn = Math.abs(EndShot.turn(bike.heading + Math.PI, this.hold.yaw)) * 180 / Math.PI;
            this.camera.craneS = Math.max(T.craneLeastS, Math.min(T.craneMostS, Math.max(far / T.craneMs, turn / T.craneTurnDegS)));
            // (a crane from far away, a long way in's: no faster than craneFarMs on average)
            this.camera.craneS = Math.max(this.camera.craneS, Math.min(T.craneLongMostS, far / T.craneFarMs));
            this.camera.arcM = StopScene.arcOf(fe, this.hold.eye, ground, StopScene.facesNear(faces, (fe.x + this.hold.eye.x) / 2, (fe.z + this.hold.eye.z) / 2, far / 2 + 30));
            this.flyS = this.craneAt + this.camera.craneS;
        } else this.flyS = 0;
    }

    // A way's heights with each point taken as the median of the STEADY_N round it: where one road crosses over
    // another (the way down to Göschenen's car park passes 10 m over the ride), a point or two of the way read the
    // other road even near its own place on the ride, and the bike dropped 10 m and came back in half a second
    static get STEADY_N() { return 9; }
    // and then eased over the same span (a triangle's weights), so a step from the road onto a stop's standing (0.9 m at
    // the lookout over Airolo) is ridden up over a few metres, not in a frame
    static steady(y, n) {
        const half = Math.floor(n / 2), src = Float64Array.from(y), win = [];
        for (let i = 0; i < y.length; i++) {
            win.length = 0;
            for (let k = Math.max(0, i - half); k <= Math.min(y.length - 1, i + half); k++) win.push(src[k]);
            win.sort((a, b) => a - b);
            y[i] = win[win.length >> 1];
        }
        const mid = Float64Array.from(y);
        for (let i = 0; i < y.length; i++) {
            let sum = 0, weight = 0;
            for (let k = -half; k <= half; k++) {
                const j = i + k;
                if (j < 0 || j >= y.length) continue;
                const w = half + 1 - Math.abs(k);
                sum += mid[j] * w;
                weight += w;
            }
            y[i] = sum / weight;
        }
        return y;
    }

    // The walls and houses within `reach` of (x, z), as a copy (WorldEnvironment.cameraFaces keeps one list it fills
    // again for each place it is asked about)
    static facesNear(faces, x, z, reach) {
        if (!faces) return null;
        const held = faces(x, z, reach);
        return held && held.count ? { data: Float64Array.from(held.data.subarray(0, held.count * 9)), count: held.count } : null;
    }

    // The least arc (EndShot.TUNING.arcs) over which the crane from `a` to `b` keeps 1 m over the land and passes no
    // wall or house; the highest where none does
    static arcOf(a, b, ground, faces) {
        const arcs = EndShot.TUNING.arcs;
        for (const arc of arcs) {
            let ok = true, prev = null;
            for (let k = 0; k <= 40 && ok; k++) {
                const p = EndShot.cranePlace(a, b, k / 40, arc);
                const g = ground(p.x, p.z);
                if (k > 0 && k < 40 && Number.isFinite(g) && p.y < g + 1) ok = false;
                if (prev && EndShot.faceShare(faces, prev, p, 0.3) < 1) ok = false;
                prev = p;
            }
            if (ok) return arc;
        }
        return arcs[arcs.length - 1];
    }

    // The player at t seconds: {x, y, z, heading, s}
    playerAt(t) {
        const at = EndShot.trackAt(this.ride, this.playerIndex, t, {});
        const on = EndShot.wayAt(this.riders[this.playerIndex].way, at.m, {});
        return { x: at.x, y: on.y, z: at.z, heading: at.heading, s: on.s };
    }

    // The screen's shape changed: the held view's lens is made again for it
    resize(aspect) {
        this.aspect = aspect;
        const own = StopScene.HOLDS[this.stop.id] || this.stop.hold;
        this.hold.fov = this.composed && !this.hold.hand ? EndShot.vfovOf(this.hold.hfov || EndShot.TUNING.hfov, aspect) : StopScene.vfovOf(own ? own.hfov : 65, aspect, own ? own.vfovMost : 60);
    }

    // When the card comes up: the camera held for holdFirstS, every rider off its bike, and CARD_AFTER_S after the
    // player parked
    get cardAt() { return Math.max(this.flyS + EndShot.TUNING.holdFirstS, this.allParkedS + StopScene.GET_OFF_S + 0.3, this.playerParkedS + StopScene.CARD_AFTER_S); }

    // Whether the card is due: the camera held for holdFirstS, and on the ride's own clock every rider off and
    // CARD_AFTER_S since the player parked (cardAt is when, with no part of the ride run fast: WARP)
    get cardDue() {
        const T = EndShot.TUNING;
        return this.t >= this.flyS + T.holdFirstS && this.rideT >= Math.max(this.allParkedS + StopScene.GET_OFF_S + 0.3, this.playerParkedS + StopScene.CARD_AFTER_S);
    }

    // Skips to where the scene rests: everyone parked and stood, the camera held, the card up
    skip() {
        this.skipped = true;
        this.t = Math.max(this.t, this.cardAt);
        this.rideT = Math.max(this.rideT || 0, this.cardAt);
    }

    // Once the camera holds, the ride runs WARP times as fast while no rider still riding is in the held view: on a long
    // way in (Göschenen's 500 m of access road) the player came into the held view 20 s after the camera held. Seen,
    // a rider rides at its own pace; the camera does not move, so nothing shows the clock that ran fast
    static get WARP() { return 4; }

    // Whether a rider ({x, y, z}) still riding is in the held view (with a margin round it)
    inHold(at) {
        const q = EndShot.project(this.hold.eye, this.hold.yaw, this.hold.pitch, this.hold.fov, this.aspect, { x: at.x, y: (at.y || 0) + 0.9, z: at.z });
        return !!q && Math.abs(q.x) < 1.2 && Math.abs(q.y) < 1.2;
    }

    // One frame: each rider's place on its way in ({x, y, z, heading, speed, lean, parked, stand, shown}), and the camera
    step(dt) {
        dt = Math.max(0, dt);
        this.t += dt;
        if (!Number.isFinite(this.rideT)) this.rideT = 0;
        const ridersAt = t => this.riders.map((r, k) => {
            const at = EndShot.trackAt(this.ride, k, t, {});
            const on = EndShot.wayAt(r.way, at.m, {});
            at.y = on.y;
            at.s = on.s;
            at.shown = true;
            at.parked = t >= r.parkedAt;
            at.stand = at.parked && t - r.parkedAt >= StopScene.GET_OFF_S;
            return at;
        });
        // (the ride's clock: fast while the camera holds and every rider still riding is out of its view)
        let rate = 1;
        if (this.t - dt >= this.flyS && this.camera && !this.skipped) {
            const now = ridersAt(this.rideT);
            const riding = now.filter(at => !at.parked);
            if (riding.length && !riding.some(at => this.inHold(at))) rate = StopScene.WARP;
        }
        this.rideT = this.skipped ? Math.max(this.rideT, this.t) : this.rideT + dt * rate;
        const out = ridersAt(this.rideT);
        const lead = out[this.playerIndex];
        if (lead) this.hintS = lead.s;
        const hold = this.hold;
        const held = { eye: hold.eye, yaw: hold.yaw, pitch: hold.pitch, roll: 0, fov: hold.fov };
        const camera = this.camera && !this.skipped && lead
            ? this.camera.at(this.t, { x: lead.x, y: lead.y, z: lead.z, heading: lead.heading }, dt, this.playerAt(this.rideT + EndShot.TUNING.foreseeS))
            : held;
        return { riders: out, camera, card: this.skipped ? this.t >= this.cardAt : this.cardDue, held: this.t >= this.flyS };
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
    // a soft pale cloud from the helmet's front that grows, rises and fades over PUFF_S. No brand, nothing shown but the cloud
    static puff(scene3d, scene, r, dt) {
        r.nextPuff -= dt;
        if (r.nextPuff > 0) return;
        r.nextPuff = StopScene.PUFF_EVERY_S * (0.8 + 0.4 * ((scene.puffs.length * 13 + scene.seed) % 7) / 7);
        const head = r.bike.helmet || r.bike.rider;
        if (!head) return;
        const at = head.getWorldPosition(new THREE.Vector3());
        const facing = r.bike.rider.getWorldDirection(new THREE.Vector3());
        const mesh = StopScene.puffMesh();
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
            p.mesh.scale.setScalar(StopScene.PUFF_M * (1 + 3.5 * u));
            p.mesh.position.addScaledVector(p.drift, dt).y += 0.25 * dt;
            p.mesh.material.opacity = StopScene.PUFF_OPACITY * (1 - u) * (1 - u);
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
                // (the props' shadow is drawn two-sided, as the world's other casters are: drawn from the back only they
                // needed a depth program of their own, compiled on the first frame they met the sun's shadow box, which
                // in the Tremola's fly was a frame of 460 to 590 ms; world-shot)
                const material = name === 'stop-area' ? StopScene.areaMaterial() : new THREE.MeshLambertMaterial({ vertexColors: true, shadowSide: THREE.DoubleSide });
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
