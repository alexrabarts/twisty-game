// StopScene: the scene at a leg's end stop (manifest.stops, tools/world/stops.mjs). After the finish line the ride is
// over: black bars slide in at the top and the foot of the screen, the HUD fades, the camera flies from where the chase
// camera was to the stop's hold, and the group pulls in one by one in its riding order and parks in the stop's slots.
// Each rider gets off and stands beside the bike, helmet on. The result card comes up in the lower bar, with what can
// be done there (a picture; the next leg). Any key before the card skips to it. Nothing here names a place.
//
// The tables are data: KINDS (a stop kind: its hold and the actions it offers), HOLDS (a stop's own hold, matched to
// the owner's photos of the place) and the characters' own `stop` list (CHARACTERS in js/vehicle.js: 'vape' for the
// three the owner named). A new stop or rider needs data only.
//
// The fly (StopScene.flyAt): the camera starts on the chase camera's own pose (its place kept beside the player as the
// player rides on, its aim, roll and lens) and eases over FLY_S to the hold, with no step in place, aim or lens. Then it
// holds until the card. A kind's hold is in the stop's own frame: the origin is the middle of the slots' row, `out`
// points from where the way in leaves the ride to that middle (at a lookout, into the view), `side` is square to it (to
// the right of out), and up is up: { eye: [side, up, out], look: [side, up, out], hfov } (metres, degrees); with `edge`
// its `out` is measured from the area's outline on the out axis (a lookout's rail) instead of the middle.
class StopScene {
    static get KINDS() {
        // In front of the bikes, looking back at the group
        const along = Object.freeze({ eye: [6, 2.6, 9], look: [0, 1, 0], hfov: 65 });
        return Object.freeze({
            // At the rail, over it and down the valley
            lookout: { hold: Object.freeze({ eye: [0, 1.8, -0.6], look: [0, -60, 160], edge: true, hfov: 70 }), actions: ['photo'] },
            restaurant: { hold: along, actions: ['photo'] },
            hotel: { hold: along, actions: ['photo'] },
            fuel: { hold: along, actions: ['photo'] },
            carpark: { hold: along, actions: ['photo'] }
        });
    }

    // A stop's own hold, by stop id, in world terms: the eye at (x, z), upM over the drawn ground there, turned to
    // `bearing` (degrees from north, clockwise), tipped by `pitch` (degrees, down is negative), with `hfov` degrees
    // across the picture and at most `vfovMost` up and down (a tall screen). Matched to the owner's photos
    // (tools/world/photomatch.mjs, the skyline fit; .agent/system/world.md, "The stop scene at a leg's end")
    static get HOLDS() {
        return Object.freeze({
            // (haze: the far slopes 3 to 8 km off and the forest 1 to 3 km off in that photo against the held shot
            // under four depths of haze: 1 / 7500 m is the nearest to both; LandShade.HAZE's own 1 / 4400 m drew them
            // 20 to 40 per cent lighter and bluer)
            'gotthard-north-end': Object.freeze({ x: -831.4, z: 10583.2, upM: 1.6, bearing: 103.05, pitch: -6.9, hfov: 71.5, vfovMost: 56, haze: Object.freeze({ perM: 1 / 7500 }) })
        });
    }

    // The fly from the chase camera to the hold: FLY_S long (longer for a hold far away: no faster than FLY_MOST_MS on
    // average, so a stop behind the line, the Tremola's 644 m back, is flown down the road, not swept to; flyTime), eased so it starts and ends at rest against the place it
    // leaves from and goes to. On the way the eye goes up by at most ARC_M (over the bikes and the rail), and keeps
    // EYE_CLEAR_M over the ground, that clearance eased in from none so the first frame is the chase camera's own
    static get FLY_S() { return 9; }
    static get FLY_MOST_MS() { return 25; }

    // How long the fly from `eye` to the hold takes
    static flyTime(eye, hold) {
        const d = Math.hypot(hold.eye.x - eye.x, hold.eye.y - eye.y, hold.eye.z - eye.z);
        return Math.max(StopScene.FLY_S, Number.isFinite(d) ? d / StopScene.FLY_MOST_MS : 0);
    }
    static get ARC_M() { return 4; }
    // and on a long fly by ARC_SHARE of its length (the Tremola's: about 40 m), so it passes over the road, not along it
    static get ARC_SHARE() { return 0.06; }

    // What the held shot raises over the graphics level in force, by the level's id (Game.raiseShot), from the
    // scene's start, so the land and the trees are built while the camera flies and nothing comes in after it holds.
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

    // How the group pulls in: each rider ARRIVE_GAP_S after the one before, at RIDE_MS on the way in, slowing over the
    // last BRAKE_M to its slot; GET_OFF_S after it stops the rider stands beside the bike, STAND_SIDE_M to its left
    static get RIDE_MS() { return 7; }
    static get ARRIVE_GAP_S() { return 1.6; }
    static get BRAKE_M() { return 9; }
    // How hard a rider brakes into its slot on a long way in (m/s^2), how long the longest way in takes, and how far
    // past where it is a rider turns round for a stop behind it
    static get BRAKE_MS2() { return 3; }
    static get WAY_MOST_S() { return 24; }
    static get TURN_M() { return 12; }
    static get GET_OFF_S() { return 0.8; }
    static get STAND_SIDE_M() { return 0.75; }
    // A rider not near the stop when the scene starts comes in from this far back along the ride
    static get BACK_M() { return 40; }
    // The player rides in from where it is when that is at most FROM_M before the stop (the finish line is 60 m before
    // a lookout's turn-in): no jump. Its way joins the right half of the road JOIN_M on, and its speed eases from the
    // speed it crossed the line at to RIDE_MS at BRAKE_MS2 (slower) or GAIN_MS2 (faster)
    static get FROM_M() { return 300; }
    static get JOIN_M() { return 14; }
    static get GAIN_MS2() { return 2; }
    // The card comes up once the player has parked and this long has gone, or at once on a skip
    static get CARD_AFTER_S() { return 3; }
    // and never before the camera has held its view this long
    static get HOLD_FIRST_S() { return 1; }
    // The bars: as near 2.39:1 as a 16:9 screen gives, each at most BAR_MOST of the screen's height so a tall phone keeps
    // most of its picture (CSS bars over the canvas; the render size does not change)
    static get ASPECT() { return 2.39; }
    static get BAR_MOST() { return 0.12; }
    // A vape cloud: every PUFF_EVERY_S (seeded by the rider), PUFF_S long, from the helmet's front
    static get PUFF_EVERY_S() { return 4; }
    static get PUFF_S() { return 2.6; }
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

    // A point of a kind's hold in world terms ([side, up, out] in the stop's frame f; up over y0)
    static framePoint(f, p, edge, y0) {
        const out = p[2] + (edge ? f.edge : 0);
        return { x: f.ox + p[0] * f.sideX + out * f.outX, y: y0 + p[1], z: f.oz + p[0] * f.sideZ + out * f.outZ };
    }

    // The aim of a camera at `eye` that looks at `look`: {yaw, pitch} as three.js's 'YXZ' rotation reads them (a
    // camera looks down -z; yaw = -bearing)
    static aimOf(eye, look) {
        const dx = look.x - eye.x, dy = look.y - eye.y, dz = look.z - eye.z;
        return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
    }

    // The vertical field of view (degrees) that shows `hfov` degrees across a picture of `aspect`, at most `most`
    static vfovOf(hfov, aspect, most = 60) {
        const r = Math.PI / 180;
        const v = (2 * Math.atan(Math.tan((hfov * r) / 2) / Math.max(0.2, aspect || 16 / 9))) / r;
        return Math.min(most, v);
    }

    // Where the fly ends: {eye: {x, y, z}, yaw, pitch, roll, fov} (radians, fov in degrees, vertical, for `aspect`).
    // The stop's own row of HOLDS when it has one, else the hold its data carries (`hold`: route.json, the importer),
    // else its kind's hold. `groundY(x, z)` the drawn ground
    static holdOf(stop, groundY = () => 0, aspect = 16 / 9) {
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
        const eye = StopScene.framePoint(f, hold.eye, hold.edge, y0);
        const look = StopScene.framePoint(f, hold.look, hold.edge, y0);
        // The eye never under EYE_CLEAR_M over the ground where it stands (a hold's height is over the stop's middle)
        const under = groundY(eye.x, eye.z);
        if (Number.isFinite(under)) eye.y = Math.max(eye.y, under + StopScene.EYE_CLEAR_M);
        return { eye, ...StopScene.aimOf(eye, look), roll: 0, fov: StopScene.vfovOf(hold.hfov, aspect) };
    }

    // The haze t seconds into the fly (over `base`, LandShade.HAZE): eased with the camera from the ride's own to the
    // hold's, so the air changes as the view does and never in one frame; null for a hold with no haze of its own
    static hazeAt(hold, t, base, flyS = StopScene.FLY_S) {
        if (!hold || !hold.haze || !base) return null;
        const w = StopScene.ease(t / flyS), out = { ...base };
        for (const [key, value] of Object.entries(hold.haze)) if (Number.isFinite(base[key])) out[key] = base[key] + (value - base[key]) * w;
        return out;
    }

    // The ease of the fly, 0 to 1 over u 0 to 1: its first and second derivatives are 0 at both ends
    static ease(u) {
        const x = Math.max(0, Math.min(1, u));
        return x * x * x * (x * (6 * x - 15) + 10);
    }

    // The shortest turn from angle a to b (radians)
    static turn(a, b) {
        let d = (b - a) % (2 * Math.PI);
        if (d > Math.PI) d -= 2 * Math.PI;
        if (d < -Math.PI) d += 2 * Math.PI;
        return d;
    }

    // The camera t seconds into the fly: {eye: {x, y, z}, yaw, pitch, roll, fov, look}. `from` is the chase camera at the
    // start: {offset: {x, y, z} (the eye less the player's place), yaw, pitch, roll, fov}; `lead` the player's place now
    // ({x, y, z}); `hold` from holdOf; `flyS` how long the fly takes (flyTime). At t 0 it is the chase camera to the last
    // bit; from flyS on it is the hold
    static flyAt(from, lead, hold, t, groundY = () => NaN, flyS = StopScene.FLY_S, arcM = StopScene.ARC_M) {
        const w = StopScene.ease(t / flyS);
        const y = Number.isFinite(lead.y) ? lead.y : 0;
        const ax = lead.x + from.offset.x, ay = y + from.offset.y, az = lead.z + from.offset.z;
        const eye = {
            x: ax + (hold.eye.x - ax) * w,
            y: ay + (hold.eye.y - ay) * w + arcM * 4 * w * (1 - w),
            z: az + (hold.eye.z - az) * w
        };
        const under = groundY(eye.x, eye.z);
        if (Number.isFinite(under)) eye.y = Math.max(eye.y, under + StopScene.EYE_CLEAR_M * w);
        const yaw = from.yaw + StopScene.turn(from.yaw, hold.yaw) * w;
        const pitch = from.pitch + (hold.pitch - from.pitch) * w;
        const roll = from.roll + StopScene.turn(from.roll, hold.roll) * w;
        const fov = from.fov + (hold.fov - from.fov) * w;
        const c = Math.cos(pitch);
        const look = { x: eye.x - Math.sin(yaw) * c * 10, y: eye.y + Math.sin(pitch) * 10, z: eye.z - Math.cos(yaw) * c * 10 };
        return { eye, yaw, pitch, roll, fov, look };
    }

    // Each rider's way in: the ride from `fromS` to the turn-in (on the right half of the road), then the stop's own
    // path, then the rider's slot. `route.sample(s, out)` gives {x, y, z, heading, width}. Returns [{x, z}] with the
    // metres along each point (`m`) and the total
    // A stop behind the rider (a stop that keeps its stage's line, tools/world/stops.mjs `keepLine`: the Tremola's
    // hospice square, 644 m before its line) is reached by turning round: on TURN_M past where the rider is, a half
    // circle across the road, and back along the other half to the turn-in
    // `from` ({x, z}, the player's own place) starts the way there, and the right half of the road is joined JOIN_M on
    static wayIn(stop, route, fromS, slot, from = null) {
        const pts = [];
        const p = {};
        const join = from ? StopScene.JOIN_M : 0;
        if (from) pts.push({ x: from.x, z: from.z });
        const at = (s, lane) => { route.sample(s, p); return { x: p.x + lane * Math.cos(p.heading), z: p.z - lane * Math.sin(p.heading) }; };
        if (fromS > stop.s + 1) {
            route.sample(fromS, p);
            const w = p.width / 4, turn = fromS + StopScene.TURN_M;
            for (let s = fromS + Math.min(join, StopScene.TURN_M / 2); s < turn; s += 2) pts.push(at(s, -w));
            for (let k = 0; k <= 8; k++) {
                const a = (Math.PI * k) / 8;
                route.sample(turn, p);
                const lane = -w * Math.cos(a), ahead = w * Math.sin(a);
                pts.push({ x: p.x + lane * Math.cos(p.heading) + ahead * Math.sin(p.heading), z: p.z - lane * Math.sin(p.heading) + ahead * Math.cos(p.heading) });
            }
            for (let s = turn; s > stop.s; s -= 2) pts.push(at(s, w));
        } else {
            for (let s = fromS + join; s < stop.s; s += 2) { route.sample(s, p); pts.push(at(s, -p.width / 4)); }
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

    // How a rider rides its way in: [{v, a, dur, m}] phases from the start, and `arriveS`. The ride speed is RIDE_MS (more
    // on a long way in: it is ridden in WAY_MOST_S at the most), and the last BRAKE_M (more at speed: BRAKE_MS2) slows
    // it to a stop (v^2 = 2 a d). A way with a start speed `v0` (the player, as it crossed the line) first eases to the
    // ride speed; where there is no room for that, it slows from v0 to a stop at one rate over the whole way
    static profile(way) {
        if (way.phases) return way.phases;
        const L = way.length;
        const brakeOf = v => Math.max(StopScene.BRAKE_M, (v * v) / (2 * StopScene.BRAKE_MS2));
        let v = Math.max(StopScene.RIDE_MS, (L - StopScene.BRAKE_M) / StopScene.WAY_MOST_S);
        const v0 = Number.isFinite(way.v0) ? Math.max(0, way.v0) : v;
        const rate = speed => (v0 > speed ? StopScene.BRAKE_MS2 : StopScene.GAIN_MS2);
        const easeM = speed => Math.abs(v0 * v0 - speed * speed) / (2 * rate(speed));
        const phases = [];
        if (v0 > v && easeM(v) + brakeOf(v) > L) {
            // (no room to ease to the ride speed: one steady slowing to the slot)
            phases.push({ v: v0, a: -(v0 * v0) / (2 * Math.max(L, 1e-3)), dur: v0 > 0 ? (2 * L) / v0 : 0 });
        } else {
            if (v0 < v && easeM(v) + brakeOf(v) > L) {
                // (a slow start on a short way: the most speed it can reach and still stop, found by halving)
                let lo = v0, hi = v;
                for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (easeM(mid) + brakeOf(mid) > L) hi = mid; else lo = mid; }
                v = Math.max(lo, 1e-3);
            }
            const d1 = easeM(v), db = Math.min(brakeOf(v), Math.max(0, L - d1));
            if (Math.abs(v - v0) > 1e-9) phases.push({ v: v0, a: v > v0 ? rate(v) : -rate(v), dur: Math.abs(v - v0) / rate(v) });
            phases.push({ v, a: 0, dur: Math.max(0, L - d1 - db) / v });
            phases.push({ v, a: -(v * v) / (2 * Math.max(db, 1e-3)), dur: db > 0 ? (2 * db) / v : 0 });
        }
        let m = 0, t = 0;
        for (const ph of phases) { ph.m = m; ph.t = t; m += ph.v * ph.dur + 0.5 * ph.a * ph.dur * ph.dur; t += ph.dur; }
        way.phases = phases;
        way.arriveS = t;
        return phases;
    }

    // Where a rider is on its way in after `t` seconds: {x, z, heading, speed, parked, arriveS}. Parked, it faces its
    // slot's heading
    static along(way, t, slot) {
        const phases = StopScene.profile(way);
        const L = way.length, tStop = way.arriveS;
        let m, speed;
        if (t <= 0) { m = 0; speed = phases.length ? phases[0].v : 0; } else if (t >= tStop) { m = L; speed = 0; } else {
            let k = 0;
            while (k + 1 < phases.length && phases[k + 1].t <= t) k++;
            const ph = phases[k], u = t - ph.t;
            speed = Math.max(0, ph.v + ph.a * u);
            m = ph.m + ph.v * u + 0.5 * ph.a * u * u;
        }
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

    // The scene. `riders`: [{bike: {group or bikeGroup, rider, arms, legs, character, yawAngle?}, s, at?, speed?}] in
    // riding order, the player first (`at` {x, z} its own place, `speed` m/s as it crossed the line). `ground(x, z)` the
    // drawn ground's height. `camera` the chase camera at the start ({offset, yaw, pitch, roll, fov}: flyAt), or none
    // (it then starts on the hold); `aspect` the screen's
    constructor({ stop, route, riders, ground, seed = 1, camera = null, aspect = 16 / 9 }) {
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
            // (the player from where it is: past a stop behind it, it turns round; StopScene.wayIn)
            const here = Number.isFinite(r.s) ? r.s : stop.s - StopScene.BACK_M;
            const fromS = stop.keepLine && here > stop.s ? here : Math.max(stop.s - (k === 0 ? StopScene.FROM_M : StopScene.BACK_M), Math.min(stop.s, here));
            const own = k === 0 && r.at && fromS === here ? r.at : null;
            const way = StopScene.wayIn(stop, route, k === 0 ? fromS : stop.s - StopScene.BACK_M, slot, own);
            if (k === 0 && Number.isFinite(r.speed)) way.v0 = r.speed;
            const actions = (r.bike.character && r.bike.character.stop) || [];
            return { ...r, slot, way, start: k * StopScene.ARRIVE_GAP_S, stood: false, actions, nextPuff: StopScene.PUFF_EVERY_S * (0.3 + ((k * 7 + seed) % 5) / 10) };
        });
        // (the last to park: the last to start, or the player turned round for a stop behind it, whose way is longest)
        this.allParkedS = Math.max(0, ...this.riders.map(r => r.start + StopScene.along(r.way, 1e9, r.slot).arriveS));
        this.playerParkedS = this.riders.length ? StopScene.along(this.riders[0].way, 1e9, this.riders[0].slot).arriveS : 0;
        this.hold = StopScene.holdOf(stop, ground, aspect);
        this.from = camera;
        // (from where the chase camera is at the start: the player's first place and the camera's offset from it)
        const first = this.riders.length ? this.riders[0].way.points[0] : null;
        const y0 = first ? ground(first.x, first.z) : NaN;
        const eye0 = camera && first ? { x: first.x + camera.offset.x, y: (Number.isFinite(y0) ? y0 : 0) + camera.offset.y, z: first.z + camera.offset.z } : null;
        this.flyS = eye0 ? StopScene.flyTime(eye0, this.hold) : StopScene.FLY_S;
        this.arcM = eye0 ? Math.max(StopScene.ARC_M, StopScene.ARC_SHARE * Math.hypot(this.hold.eye.x - eye0.x, this.hold.eye.z - eye0.z)) : StopScene.ARC_M;
    }

    // The screen's shape changed: the hold's lens is made again for it
    resize(aspect) {
        this.hold = StopScene.holdOf(this.stop, this.ground, aspect);
    }

    // When the card comes up
    // (and not before the last rider is off: a player turned round for a stop behind it parks last)
    // (and not before the fly has come to rest on the hold)
    get cardAt() { return Math.max(this.playerParkedS + StopScene.CARD_AFTER_S, this.allParkedS + StopScene.GET_OFF_S, this.flyS + StopScene.HOLD_FIRST_S); }

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
        // From the chase camera beside the player to the hold (StopScene.flyAt); with no chase camera, the hold
        const lead = out[0];
        const camera = this.from && lead ? StopScene.flyAt(this.from, lead, this.hold, this.t, this.ground, this.flyS, this.arcM) : StopScene.flyAt({ offset: { x: 0, y: 0, z: 0 }, yaw: this.hold.yaw, pitch: this.hold.pitch, roll: 0, fov: this.hold.fov }, this.hold.eye, this.hold, this.flyS, () => NaN, this.flyS);
        return { riders: out, camera, card: this.t >= this.cardAt, held: this.t >= this.flyS };
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
