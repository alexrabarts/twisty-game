// The hill ride: a short ride of its own down a steep cobbled village lane on a delivery bicycle, opened from the URL
// (RideMode kind 'hill', js/ridemode.js). It starts at the top, stood still; gravity does most of the work, and at
// speed the boy takes his feet off the pedals and holds his legs out. Near the bottom the camera stops high behind him
// (HillLane.RULE.end) and stays while he rolls on round the bend; once he is out of its sight the picture fades and
// the ride ends on a quiet card. It is timed from the roll-off to the finish on the last left (HillBoard,
// js/hill/board.js), but no clock shows during the ride: the time, the rider's best and the online board show only on
// the end card. It uses the game's renderer, scene lights, input, sound and leaderboard service, and nothing of the
// legs or the world.
//
//   the lane and what stands by it    js/hill/lane.js (data), js/hill/scene.js (drawn)
//   the bicycle's physics             js/hill/pushbike.js (the game's own bike), js/hill/bicycle.js (on the lane)
//   the bicycle and boy as drawn      js/hill/rider.js, assets/hill/bicycle.glb (tools/blender/hill_bike.py)
//   the things in the street          js/hill/props.js
//   the music                         js/hill/music.js
//   the last picture                  assets/hill/loaf.glb (tools/blender/hill_loaf.py)
//   the time and the board            js/hill/board.js, functions/hill-courses.json
class HillRide {
    static get STEP_S() { return 1 / 120; }

    // The views, Z steps through them: behind and over the boy looking down the lane; at the top of the lane watching
    // him go, the lens closing in as he gets further; ahead of him looking back up the hill
    static get VIEWS() {
        return Object.freeze([
            { id: 'follow', name: 'Behind', back: 8.5, up: 3.6, look: 10, fov: 46 },
            { id: 'cinema', name: 'Cinematic', fovNear: 55, fovFar: 12, frameM: 3.2 },
            { id: 'front', name: 'In front', ahead: 7, up: 1.3, fov: 55 }
        ]);
    }

    // The one light of the whole ride, the climb and the descent alike, so nothing changes when the camera hands over:
    // a low golden sun (elevationDeg over the horizon) at world heading headingRad (+ towards +x), down the lane from the
    // top: a little to the right going down the top stretch, so the boy climbing is lit from behind and the wet cobbles
    // between him and the camera at the top glint, and a little to the left down the main straight, so the chase camera
    // sees the cobbles glint ahead; through a warm haze, with a weak fill and the baked sky's share envIntensity. The
    // cobbles are wet the whole ride: their roughness is cobbleRough of the dry one (each worn crown its own glint, its
    // relief cobbleNormal times the dry one), their colour cobbleTone of it
    static get LIGHT() {
        return Object.freeze({
            headingRad: -0.1, elevationDeg: 10, sunColour: 0xffe4bc, sunIntensity: 1.2,
            haze: 0xe2ded4, hazeDensity: 0.01, ambient: 0.1, sky: 0xd8d4cc, ground: 0x726850, hemisphere: 0.32, envIntensity: 0.16,
            cobbleRough: 0.45, cobbleNormal: 2, cobbleTone: 0.62
        });
    }

    // The way to the sun from the lane (a unit vector)
    static sunDirection(lane, out = new THREE.Vector3()) {
        const L = HillRide.LIGHT, e = L.elevationDeg * Math.PI / 180;
        return out.set(Math.cos(e) * Math.sin(L.headingRad), Math.sin(e), Math.cos(e) * Math.cos(L.headingRad));
    }

    // The named shots: each a camera place and a point it looks at, both as [s, across (+ left going down), up] on the
    // lane, and a field of view (degrees), matched to the scenes the owner gave as reference (the side-by-side sheets,
    // tools/terrain-check.mjs hill-compare). `opening` is where the ride opens and holds before the bicycle rolls (HOLD):
    // at the top, a little to the left by the houses, looking down the lane with the low sun to the right. The end's
    // fixed camera (HillLane.RULE.end) is framed as `opening` is, high behind and looking down the lane
    static get SHOTS() {
        return Object.freeze({
            opening: HillRide.openingShot(),
            climbFoot: { position: [148, 1.6, 1.7], target: [100, -0.5, 6], fov: 46 },
            climbShop: { position: [118, -2.3, 1.3], target: [88, 0.8, 4.5], fov: 52 },
            shopSide: { position: [106.5, -3.4, 1.35], target: [109.5, -0.3, 0.9], fov: 50 },
            basket: { position: [105, 0.2, 1.35], target: [108.5, 0, 1.0], fov: 42 }
        });
    }

    // The hold at the start: the opening shot until the player pedals (not before leastS), then the camera eases over
    // easeS to the view chosen while the boy pushes off (push of the pedal for pushS, unless the rider rides himself)
    static get HOLD() { return Object.freeze({ leastS: 0.8, easeS: 2.6, pushS: 1.2, push: 0.7 }); }

    // The climb's shots, cut as the reference stills of the boy pushing the bicycle up are ([s, across, up] on the lane):
    // - `wide`: held still until he has walked wideM. A long lens, low on the lane's right just inside the fence, its
    //   posts close at the right of the picture, looks across the bend at the cottages; he comes up past the fence's
    //   far end, small against them;
    // - then a long lens head on, trackM up the lane ahead of him and `up` over the lane there, on his line, aimed lookUpM
    //   over the bicycle, keeping trackFrameM of picture height at his distance. It goes back up the lane as he comes on;
    // - at `stop`, uphill of the stall and in line with its front, it stays. As he comes on the lens opens out and then
    //   closes in to his distance (`frames`: [his distance in m, the picture's height there in m], eased between), and
    //   it turns with him, aimed up to stallAim of the way to the stall's front as he comes within aimNearM of it, as he
    //   wheels the bicycle in to it, side on
    static get CLIMB_SHOTS() {
        return Object.freeze({
            wideM: 12, wide: { position: [32, -2.0, 0.95], target: [64, 2.5, 2.4], fov: 15 },
            trackM: 16, up: 1.2, lookUpM: 0.85, trackFrameM: 1.4, stop: [23.6, 1.4, 1.3], stallAim: 0.5, aimNearM: [5, 9],
            frames: [[16, 1.4], [14.5, 1.5], [11.5, 3.0], [9, 3.2], [7, 2.7], [5.5, 2.4], [4.2, 2.0], [3, 1.65]]
        });
    }

    // The only breaks in the picture: a fade to black and up again when he gets off the bicycle (the climb starts in
    // black and comes up over inS) and when he gets on it at the stall (down over outS, up over inS)
    static get FADES() { return Object.freeze({ outS: 0.5, inS: 0.7 }); }

    // The camera never cuts: a change of camera glides there, eased (a smootherstep of place, aim and lens). handS: from
    // the stall to the chase camera after he gets on; cutS: from one cinematic camera to the next, longer when they are far
    // apart (speedMs, the glide's mean speed at most); viewS: to the view
    // chosen with Z; wideM: the climb's wide shot glides into the long lens head on over the metres he walks from
    // wideM[0] to wideM[1]
    static get GLIDE() { return Object.freeze({ handS: 2.6, cutS: 1.2, viewS: 0.9, speedMs: 18, arcM: 0.2, arcMostM: 6, wideM: [9, 15] }); }

    // How black the picture is now (0 to 1)
    curtainShare() {
        const c = this.curtain;
        if (!c) return 0;
        const k = Math.min(1, c.t / c.s), e = k * k * (3 - 2 * k);
        return c.from + (c.to - c.from) * e;
    }

    curtainTo(to, seconds) {
        this.curtain = { from: this.curtainShare(), to, t: 0, s: seconds };
    }

    // A glide from where the camera is now, over `seconds`
    glideFrom(seconds) {
        const cam = this.game.camera, v = this.bike.vehicle.position;
        // (the aim kept as an offset from him, so it follows him through the glide; the place lifted in an arc over the
        // roofs between two cameras far apart: arcM for each metre between them, at most arcMostM)
        this.glide = { pos: cam.position.clone(), lookOff: this.look.clone().sub(v), fov: cam.fov, t: 0, s: seconds };
    }

    // The camera's time: the fades and the glides run on it
    cameraStep(dt) {
        if (this.curtain) this.curtain.t += dt;
        if (this.glide) {
            this.glide.t += dt;
            if (this.glide.t >= this.glide.s) this.glide = null;
        }
        if (this.fade && !this.ending) this.fade.style.opacity = String(this.curtainShare());
    }

    // The picture's height (m) at `d` m from the climb's stopped camera (CLIMB_SHOTS.frames, smoothstepped between knots)
    static climbFrame(d) {
        const F = HillRide.CLIMB_SHOTS.frames;
        if (d >= F[0][0]) return F[0][1];
        for (let i = 1; i < F.length; i++) {
            if (d >= F[i][0]) {
                const k = (F[i - 1][0] - d) / (F[i - 1][0] - F[i][0]), e = k * k * (3 - 2 * k);
                return F[i - 1][1] + (F[i][1] - F[i - 1][1]) * e;
            }
        }
        return F[F.length - 1][1];
    }

    // The chase camera behind him (VIEWS' behind) for where he is now, into `at` and `look`; returns its field of view
    followShot(at, look) {
        const view = HillRide.VIEWS[0], bike = this.rider ? this.rider.group.position : this.lane.at(this.bike.s, this.bike.across, 0, {});
        const back = this.lane.sample(Math.max(0, this.bike.s - view.back), {});
        at.set(back.x + back.leftX * this.bike.across * 0.5, back.y + view.up, back.z + back.leftZ * this.bike.across * 0.5);
        const ahead = this.lane.sample(this.bike.s + view.look, {});
        look.set(ahead.x, ahead.y + 0.6, ahead.z).lerp(bike, 0.35);
        return view.fov;
    }

    // The climb's camera for the boy now, into `at` and `look`; returns its field of view (degrees)
    climbCamera(at, look) {
        const S = HillRide.CLIMB_SHOTS, G = HillRide.GLIDE, bike = this.bike, lane = this.lane, v = bike.vehicle.position;
        const walked = HillDay.CLIMB.fromS - bike.s;
        if (walked < G.wideM[0]) return HillRide.shot(lane, S.wide, at, look).fov;
        if (walked < G.wideM[1]) {
            // The wide shot glides into the long lens head on: one shot, its place, aim and lens eased together
            const wideAt = this.wideAt || (this.wideAt = new THREE.Vector3()), wideLook = this.wideLook || (this.wideLook = new THREE.Vector3());
            const wideFov = HillRide.shot(lane, S.wide, wideAt, wideLook).fov;
            const k = (walked - G.wideM[0]) / (G.wideM[1] - G.wideM[0]), e = k * k * k * (k * (6 * k - 15) + 10);
            const trackFov = this.trackCamera(at, look);
            at.lerpVectors(wideAt, at, e);
            look.lerpVectors(wideLook, look, e);
            return wideFov + (trackFov - wideFov) * e;
        }
        return this.trackCamera(at, look);
    }

    // The climb's camera after the wide shot: head on, then stopped by the stall
    trackCamera(at, look) {
        const S = HillRide.CLIMB_SHOTS, bike = this.bike, lane = this.lane, v = bike.vehicle.position;
        look.set(v.x, v.y + S.lookUpM, v.z);
        const s = bike.s - S.trackM;
        if (s > S.stop[0]) {
            // Head on, on his line, as far ahead as it keeps; it comes to the stop's line as it nears it
            const k = Math.max(0, Math.min(1, (S.stop[0] + 4 - s) / 4)), e = k * k * (3 - 2 * k);
            const p = lane.at(s, bike.across + (S.stop[1] - bike.across) * e, S.up + (S.stop[2] - S.up) * e, this.climbAt || (this.climbAt = {}));
            at.set(p.x, p.y, p.z);
            return 2 * Math.atan(S.trackFrameM / 2 / Math.max(1, at.distanceTo(look))) * 180 / Math.PI;
        }
        const p = lane.at(S.stop[0], S.stop[1], S.stop[2], this.climbAt || (this.climbAt = {}));
        at.set(p.x, p.y, p.z);
        const d = Math.max(0.5, at.distanceTo(look));
        // Aimed stallAim of the way from him to the stall's front, so the stall runs away at the left of the picture
        // as he comes in to it
        // (only as he comes near it: from aimNearM[0] out to aimNearM[1] the aim turns from him alone to the share)
        const C = HillDay.CLIMB, front = lane.at(C.stall[0], C.stall[1] - 0.4, 1.0, this.stallAt || (this.stallAt = {}));
        const near = Math.max(0, Math.min(1, (S.aimNearM[1] - d) / (S.aimNearM[1] - S.aimNearM[0]))), share = S.stallAim * near * near * (3 - 2 * near);
        look.x += (front.x - look.x) * share;
        look.y += (front.y - look.y) * share;
        look.z += (front.z - look.z) * share;
        return 2 * Math.atan(HillRide.climbFrame(d) / 2 / d) * 180 / Math.PI;
    }

    // The opening shot from the lane's opening camera (HillLane.RULE.opening.camera: fitted to the reference frame):
    // its place, a point 30 m along its aim, its field of view
    static openingShot() {
        const rule = HillLane.RULE;
        const [s, across, up, yaw, pitch, fov] = rule.opening.camera;
        const lane = HillRide.laneOnce || (HillRide.laneOnce = new HillLane());
        const p = lane.sample(s), h = p.heading + yaw, at = lane.at(s, across, up, {});
        const tx = at.x + Math.sin(h) * Math.cos(pitch) * 30, ty = at.y + Math.sin(pitch) * 30, tz = at.z + Math.cos(h) * Math.cos(pitch) * 30;
        const t = lane.project(tx, tz, null, {});
        return { position: [s, across, up], target: [t.s, t.across, ty - lane.sample(t.s).y], fov };
    }

    // The cinematic cameras down the course, in order: [s, across, up] on the lane (from doorways and high windows by
    // the house fronts, low by the cobbles, two of SHOTS' key frames), or { road, d, up } in a side road's mouth. Each
    // turns to follow the bicycle and closes its lens to keep him frameM of the picture's height
    static get CINEMA() {
        return Object.freeze([
            [30, -2.4, 0.4], [60, 3.85, 1.6], [95, -3.85, 4.6], [118, -2.3, 1.3], { road: 0, d: 4, up: 1.7 }, [148, 1.6, 1.7], { road: 1, d: 3, up: 1.5 },
            [185, -3.85, 4.8], [215, -2.4, 0.35], [250, 3.85, 1.6], [280, -3.85, 4.5], { road: 3, d: 4, up: 1.7 }, [335, -3.85, 1.6],
            { road: 4, d: 6, up: 2 }, [372, -2.4, 0.4], [398, 3.85, 4.5], [405, -3.85, 1.6], [420, -3.85, 1.6], [430, 2.4, 3]
        ]);
    }

    // The cuts: none sooner than gapS after the last; a camera keeps the bicycle while it sees it now and aheadS on
    // and is within mostM; the next is the one that sees him longest down the course from now (looked for every
    // stepS up to lookS), the nearer to bestM the better
    static get CUTS() { return Object.freeze({ gapS: 1.5, aheadS: 0.8, mostM: 45, lookS: 5, stepS: 0.5, bestM: 14 }); }

    // A cinematic camera's place in the world
    static cinemaAt(lane, cam, out = {}) {
        if (Array.isArray(cam)) return lane.at(cam[0], cam[1], cam[2], out);
        const road = lane.sideRoads[cam.road], p = lane.roadPoint(road, cam.d);
        out.x = p.x;
        out.y = lane.roadY(road, cam.d, 0) + cam.up;
        out.z = p.z;
        return out;
    }

    // The bicycle's points a camera must see: its wheels and his head, where it is and `ahead` s on along its way
    static bikePoints(bike, ahead = 0) {
        const v = bike.vehicle, fx = Math.sin(v.yawAngle), fz = Math.cos(v.yawAngle);
        const go = v.speed * ahead, x = v.position.x + fx * go, z = v.position.z + fz * go;
        const y = ahead > 0 ? bike.lane.sample(bike.s + go).y : v.position.y;
        return [{ x: x - fx * 0.55, y: y + 0.4, z: z - fz * 0.55 }, { x: x + fx * 0.55, y: y + 0.4, z: z + fz * 0.55 }, { x, y: y + 1.65, z }];
    }

    // Whether the camera at `eye` sees the bicycle's points: all of them near enough and none behind a building
    static clear(lane, eye, points) {
        const C = HillRide.CUTS;
        return points.every(p => Math.hypot(p.x - eye.x, p.y - eye.y, p.z - eye.z) < C.mostM && !lane.blocks(eye, p));
    }

    // The cinematic camera for the bicycle now: the one it has while it still sees him, or after gapS the one that
    // sees him longest down the course. `force` picks afresh (the start, a restart, after a fall)
    cinemaPick(force = false) {
        const C = HillRide.CUTS, lane = this.lane, bike = this.bike, now = bike.timeS || 0;
        const cams = HillRide.CINEMA, eye = this.cinemaEye || (this.cinemaEye = {});
        const keep = this.cinema;
        if (!force && keep !== undefined && keep !== null) {
            HillRide.cinemaAt(lane, cams[keep], eye);
            const fine = HillRide.clear(lane, eye, HillRide.bikePoints(bike)) && HillRide.clear(lane, eye, HillRide.bikePoints(bike, C.aheadS));
            if (fine || now - this.cinemaCutAt < C.gapS) return keep;
        }
        if (force) this.cinemaCutAt = now;
        let best = keep, bestScore = -Infinity;
        for (let i = 0; i < cams.length; i++) {
            HillRide.cinemaAt(lane, cams[i], eye);
            let seen = 0;
            for (let t = 0; t <= C.lookS; t += C.stepS) {
                if (!HillRide.clear(lane, eye, HillRide.bikePoints(bike, t))) break;
                seen++;
            }
            if (seen === 0) continue;
            const d = Math.hypot(eye.x - bike.vehicle.position.x, eye.z - bike.vehicle.position.z);
            const score = seen * 10 - Math.abs(d - C.bestM) * 0.2 - (i === keep ? 0 : 0.5);
            if (score > bestScore) {
                bestScore = score;
                best = i;
            }
        }
        if (best !== keep) {
            this.cinemaCutAt = now;
            this.cinemaCuts = (this.cinemaCuts || 0) + 1;
        }
        this.cinema = best === undefined ? 0 : best;
        return this.cinema;
    }

    // A shot's place and aim in the world, into `at` and `look`; `name` is a name of SHOTS or a shot itself
    static shot(lane, name, at, look) {
        const shot = typeof name === 'string' ? HillRide.SHOTS[name] : name;
        const a = lane.at(shot.position[0], shot.position[1], shot.position[2], {}), t = lane.at(shot.target[0], shot.target[1], shot.target[2], {});
        at.set(a.x, a.y, a.z);
        look.set(t.x, t.y, t.z);
        return shot;
    }

    // The prompt at the start of the climb, until he has come goneM up the lane: the keys, or the touch screen's button
    static get START_PROMPT() {
        return Object.freeze({
            keys: 'Press \u2191 or W to push the bicycle up the hill', touch: 'Hold GAS to push the bicycle up the hill', goneM: 0.3,
            // A day that starts on the bicycle at the top, and the top after the climb: the same, to ride off
            rideKeys: 'Press \u2191 or W to ride down the hill', rideTouch: 'Hold GAS to ride down the hill', clearShare: 0.05
        });
    }

    // The start prompt now: 'push' on the climb before he has moved off, 'ride' held at the top before he pushes off
    // (once the picture is up), else null
    startPrompt() {
        const P = HillRide.START_PROMPT;
        if (this.climb) return this.climb.phase === 'climb' && HillDay.CLIMB.fromS - this.bike.s < P.goneM ? 'push' : null;
        if (this.hold && this.hold.phase === 'hold' && !this.ending && this.curtainShare() < P.clearShare) return 'ride';
        return null;
    }

    startPromptShown() {
        return this.startPrompt() !== null;
    }

    // The start prompt on the page: its words for the push or the ride, the touch form on a touch screen
    showStart() {
        if (!this.startNote) return;
        const which = this.startPrompt(), P = HillRide.START_PROMPT;
        this.startNote.style.display = which ? '' : 'none';
        const words = !which ? '' : which === 'push' ? (this.startTouch ? P.touch : P.keys) : (this.startTouch ? P.rideTouch : P.rideKeys);
        if (which && this.startNote.textContent !== words) this.startNote.textContent = words;
    }

    static get KEYS_NOTE() {
        return 'Up or W pedals · Down or S brakes · Left and Right steer · Q and E throw a loaf left and right · Space wheelies · Z changes the view · R starts the day again · M sound · Esc leaves';
    }

    // The local best on this device, in seconds, as the legs keep theirs (Game.bestTimeKey)
    static get BEST_KEY() { return `motorcycleBestTime_${HillBoard.ID}`; }

    // What the card says about the board when it cannot show it
    static get BOARD_NOTES() {
        return Object.freeze({
            loading: 'Loading the board…',
            unavailable: 'Board unavailable',
            empty: 'No times on the board yet',
            untimed: 'This ride is not on the board: debug mode, test data, a tuned ride or a place set by a tool',
            notOpen: 'Board unavailable: the online board for this ride is not open yet'
        });
    }

    // The hill's own mute (the owner: the music on by default here). The game's mute (Sound, its default on) is not
    // read or changed: the hill keeps its own choice under `key`, off unless the player pressed M on the hill, and puts
    // it on the sound manager for this page only. The first key or tap wakes the sound (Sound's own listener)
    static get SOUND() {
        return Object.freeze({ key: 'twistyHillSound', muted: false });
    }

    static storage() {
        try {
            return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
        } catch (error) {
            console.warn('HillRide: no storage, the hill\'s mute lasts for this page only:', error);
            return null;
        }
    }

    static hillMuted(storage) {
        try {
            const text = storage ? storage.getItem(HillRide.SOUND.key) : null;
            const stored = text ? JSON.parse(text) : null;
            return stored && typeof stored.muted === 'boolean' ? stored.muted : HillRide.SOUND.muted;
        } catch (error) {
            console.warn('HillRide: the hill\'s mute unreadable, the default stands:', error);
            return HillRide.SOUND.muted;
        }
    }

    // On the sound manager for this page, not kept in the game's settings
    static applyMute(sound, muted) {
        if (!sound) return muted;
        sound.settings.muted = muted;
        if (muted) sound.stopEngineSound();
        sound.applySettings();
        return muted;
    }

    static toggleMute(sound, storage) {
        const muted = !HillRide.hillMuted(storage);
        try {
            if (storage) storage.setItem(HillRide.SOUND.key, JSON.stringify({ muted }));
        } catch (error) {
            console.warn('HillRide: the hill\'s mute not saved:', error);
        }
        HillRide.applyMute(sound, muted);
        if (!muted && sound) sound.wake();
        if (typeof showCallout === 'function') showCallout(`Sound ${muted ? 'off' : 'on'}`, muted ? 'info' : 'good', 1000);
        return muted;
    }

    constructor(game) {
        this.game = game;
        this.lane = new HillLane();
        this.bike = new HillBicycle(this.lane);
        this.music = typeof HillMusic !== 'undefined' ? new HillMusic(game.soundManager) : null;
        // The band is part of the ride: sound is on here unless the player has muted it on this ride (HillRide.SOUND)
        HillRide.applyMute(game.soundManager, HillRide.hillMuted(HillRide.storage()));
        this.view = 0;
        this.accumulated = 0;
        this.sample = {};
        this.look = new THREE.Vector3();
        this.camTarget = new THREE.Vector3();
        this.endLook = new THREE.Vector3();
        this.ending = null;
        this.running = false;
        // The clock and the board's session for this run (HillBoard); the session opens at the roll-off
        this.board = typeof HillBoard !== 'undefined' ? new HillBoard(this.lane) : null;
        this.session = null;
        // The day's round: the climb, the restock, the doors, the loaves, the hazards (HillDay)
        this.day = typeof HillDay !== 'undefined' ? new HillDay(this.lane) : null;
        this.climb = null;
    }

    async start() {
        const game = this.game;
        document.body.classList.add('hill-on');
        // The cobbles' occlusion only where the ambient occlusion effect is on (the low levels leave it out)
        const anisotropy = game.renderer && game.renderer.capabilities ? game.renderer.capabilities.getMaxAnisotropy() : 8;
        const { group } = HillScene.build(this.lane, { anisotropy, ao: !(game.effectLevels && game.effectLevels.ao === 'off'), sun: HillRide.sunDirection(this.lane) });
        this.village = group;
        game.scene.add(group);
        const model = await SceneAssets.loadModel(HillRider.FILE);
        this.rider = new HillRider(model);
        this.props = new HillProps(this.lane);
        this.props.sound = game.soundManager;
        game.scene.add(this.props.group);
        // The splash of milk where a bottle smashes
        this.puff = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xf8f7f2, roughness: 0.4, transparent: true, opacity: 0 }));
        this.puff.visible = false;
        game.scene.add(this.puff);
        game.scene.add(this.rider.group);
        // The loaves thrown out of the basket when he comes off
        this.spill = typeof HillSpill !== 'undefined' ? new HillSpill(this.lane, this.rider) : null;
        if (this.spill) game.scene.add(this.spill.group);
        if (this.day) game.scene.add(this.day.build());
        // The horse and cart from their model; without it the day keeps its plain blocks, and says why
        if (this.day && typeof HillHorse !== 'undefined') {
            try {
                this.day.dressCart(new HillHorse(await SceneAssets.loadModel(HillHorse.FILE)));
            } catch (error) {
                console.error('HillRide: the horse and cart did not load; the plain ones stand in:', error);
            }
        }
        // Every loose loaf, spilt or thrown, as the basket's own
        if (this.day && this.spill && this.spill.crust) this.day.wearLoaves(this.spill.loaves[0].mesh.material, this.spill.crust);
        game.graphics.fixColorSpaces();
        HillScene.bumpsBothSides(game.scene);
        this.light();
        this.overlay();
        this.keys = (event) => {
            if (event.repeat) return;
            if (event.code === 'KeyR') this.restart();
            if (event.code === 'Escape') window.location.assign(window.location.pathname);
        };
        document.addEventListener('keydown', this.keys);
        this.beginClimb();
        this.rider.update(this.bike, this.lane, 0);
        this.placeCamera(1);
        this.running = true;
        game.clock.getDelta();
        const loop = () => {
            if (!this.running) return;
            this.frameId = requestAnimationFrame(loop);
            this.frame(Math.min(game.clock.getDelta(), 0.05));
        };
        this.frameId = requestAnimationFrame(loop);
    }

    // The ride's one light (LIGHT) and its wet cobbles
    light() {
        const game = this.game, L = HillRide.LIGHT;
        game.scene.background = new THREE.Color(L.haze);
        game.scene.fog = new THREE.FogExp2(L.haze, L.hazeDensity);
        game.graphics.setTimeOfDay('golden');
        // The reference frames' sky: pale and hazy, the sun's glow soft in it
        game.graphics.setWeather('fog');
        game.graphics.setRingStrength(0);
        const cobbles = this.village && this.village.getObjectByName('hill-cobbles');
        if (cobbles) {
            cobbles.material.roughness = L.cobbleRough;
            cobbles.material.color.setScalar(L.cobbleTone);
            cobbles.material.normalScale.setScalar(L.cobbleNormal);
        }
        // The baked sky lights everything too (Graphics: scene.environment): its share on what the ride draws, but
        // for the panes, which mirror a sky of their own
        for (const group of [this.village, this.props && this.props.group, this.day && this.day.group, this.rider && this.rider.group]) {
            if (!group) continue;
            // (a mesh of several finishes, the boy's body, has a list of them)
            group.traverse(o => {
                for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m && m.isMeshStandardMaterial && !m.envMap && !m.userData.ownSky) m.envMapIntensity = L.envIntensity;
            });
        }
        this.sun = HillRide.sunDirection(this.lane);
        game.graphics.setSunOffset({ x: this.sun.x, y: this.sun.y, z: this.sun.z });
        // The far shadow cascade reads the sun's way and the bike's place (Cascades.follow)
        game.sunOffset = { x: this.sun.x * 100, y: this.sun.y * 100, z: this.sun.z * 100 };
        game.vehicle = this.bike.vehicle;
        if (game.applyShadowBox) game.applyShadowBox({ shadowSpan: 120 });
        const sun = game.directionalLight;
        sun.color.set(L.sunColour);
        sun.intensity = L.sunIntensity;
        if (game.ambientLight) game.ambientLight.intensity = L.ambient;
        if (game.hemisphereLight) {
            game.hemisphereLight.color.set(L.sky);
            game.hemisphereLight.groundColor.set(L.ground);
            game.hemisphereLight.intensity = L.hemisphere;
        }
    }

    overlay() {
        const note = document.createElement('div');
        note.className = 'hill-note';
        note.id = 'hill-note';
        const keys = document.createElement('div');
        keys.className = 'hill-keys';
        keys.textContent = HillRide.KEYS_NOTE;
        this.viewNote = document.createElement('div');
        this.viewNote.className = 'hill-view';
        // The fade and the end card over it
        this.fade = document.createElement('div');
        this.fade.className = 'hill-fade';
        this.fade.style.opacity = '0';
        this.endNote = document.createElement('div');
        this.endNote.className = 'hill-end';
        const title = document.createElement('div');
        title.className = 'hill-end-title';
        title.textContent = 'Down the hill';
        const line = document.createElement('div');
        line.className = 'hill-end-keys';
        line.textContent = 'G goes round again · R starts again from the first day · Esc leaves';
        // The time, the best and the board: filled when the card opens (showCard)
        const part = (tag, className) => {
            const el = document.createElement(tag);
            el.className = className;
            return el;
        };
        const button = (text, key, className, click) => {
            const el = part('button', `hill-end-btn${className ? ` ${className}` : ''}`);
            el.type = 'button';
            el.textContent = text;
            el.dataset.key = key;
            el.addEventListener('click', click);
            return el;
        };
        this.card = {
            time: part('div', 'hill-end-time'),
            best: part('div', 'hill-end-best'),
            round: part('div', 'hill-end-round'),
            board: part('div', 'hill-end-board'),
            name: button('Put my name on the board', 'KeyN', 'primary', () => this.enterName()),
            next: button('Next day', 'KeyG', '', () => this.restart(true)),
            again: button('Ride again', 'KeyR', '', () => this.restart()),
            leave: button('Leave', 'Escape', '', () => window.location.assign(window.location.pathname))
        };
        this.card.name.hidden = true;
        const buttons = part('div', 'hill-end-buttons');
        buttons.append(this.card.name, this.card.next, this.card.again, this.card.leave);
        this.endNote.append(title, this.card.time, this.card.best, this.card.round, this.card.board, buttons, line);
        this.endNote.style.display = 'none';
        note.append(this.viewNote, keys);
        // The start prompt: plain, in the middle of the picture's top, the touch form on a touch screen
        this.startNote = document.createElement('div');
        this.startNote.className = 'hill-start';
        const touch = typeof HudRules !== 'undefined' && HudRules.isTouch(window);
        this.startTouch = touch;
        Object.assign(this.startNote.style, {
            position: 'fixed', left: '50%', top: '16%', transform: 'translateX(-50%)', padding: '8px 16px', maxWidth: 'calc(100% - 32px)',
            background: 'rgba(30, 26, 20, 0.62)', color: '#f4efe2', font: '600 16px/1.4 system-ui, sans-serif', borderRadius: '6px',
            textAlign: 'center', pointerEvents: 'none', display: 'none'
        });
        document.body.append(note, this.startNote, this.fade, this.endNote);
        this.showView();
    }

    showView() {
        if (this.viewNote) this.viewNote.textContent = `View: ${HillRide.VIEWS[this.view].name}`;
    }

    // R: the day again, from its start. `nextDay` goes round again a day on. Only the first day of the page starts with
    // the climb on foot (the owner); the days after start on the bicycle at the top (beginClimb). The day's number lives
    // in this page's HillDay and is not kept: a new page is the first day
    restart(nextDay = false) {
        this.closeCard();
        this.dropSession();
        if (this.board) this.board.reset();
        if (this.day && nextDay) this.day.day += 1;
        if (this.props) this.props.reset();
        if (this.spill) this.spill.reset();
        if (this.loafShown) this.showLoaf(false);
        this.beginClimb();
        this.accumulated = 0;
        this.ending = null;
        this.cinema = null;
        if (this.endNote) this.endNote.style.display = 'none';
        if (this.fade) this.fade.style.opacity = String(this.curtainShare());
        this.placeCamera(1);
    }

    // The climb: the boy at the bend below the top stretch facing up the lane, the basket full (CLIMB_SHOTS sees him).
    // Without the day (HillDay not loaded) the ride opens on the hold at the top as before. From the second day he
    // starts at the stall, the restock done: in the dark, as at the end of the climb, so the picture comes up and the
    // camera glides from the stall to the chase camera (endClimb)
    beginClimb() {
        const day = this.day;
        if (!day) {
            this.bike.reset(this.lane.rule.startM, this.lane.rule.opening.startAcross);
            this.hold = { phase: 'hold', t: 0 };
            return;
        }
        const C = HillDay.CLIMB;
        if (day.day > 1) {
            day.restock();
            day.climbing = true;
            this.bike.reset(C.meet[0], C.meet[1]);
            this.bike.vehicle.yawAngle += Math.PI;
            this.bike.walking = true;
            this.hold = null;
            this.climb = { phase: 'mount', t: HillRide.FADES.outS, hold: 0 };
            this.handedOver = false;
            this.glide = null;
            this.curtain = { from: 1, to: 1, t: 0, s: HillRide.FADES.inS };
            if (this.spill) this.spill.spilt = true;
            return;
        }
        day.restock();
        day.climbing = true;
        this.bike.reset(C.fromS, C.across);
        this.bike.vehicle.yawAngle += Math.PI;
        this.bike.walking = true;
        this.bike.crank = HillBicycle.WALK_CRANK;
        this.hold = null;
        this.climb = { phase: 'climb', t: 0, hold: 0 };
        this.handedOver = false;
        this.glide = null;
        // He is off the bicycle: the day comes up from black (FADES)
        this.curtain = { from: 1, to: 0, t: 0, s: HillRide.FADES.inS };
        // Nothing to spill on the way up
        if (this.spill) this.spill.spilt = true;
    }

    // At the cart: the basket is full, and the ride goes to the opening hold at the top, facing down
    endClimb() {
        this.climb = null;
        if (this.day) {
            this.day.climbing = false;
            this.day.restock();
        }
        if (this.spill) this.spill.reset();
        // He gets on where he stands, facing down the lane: no jump. The camera is already behind him (the hand-over in
        // placeCamera) and holds there until he pushes off
        this.bike.reset(this.bike.s, this.bike.across);
        this.bike.walking = false;
        // (the same bicycle going on: he gets on over the rider's blend, not at once)
        if (this.rider) this.rider.rides = this.bike.rides;
        this.hold = { phase: 'hold', t: 0 };
        this.handedOver = true;
        this.cinema = null;
        // Up from the black where the camera was, and from there one smooth move to the chase camera behind him (GLIDE)
        this.glideFrom(HillRide.GLIDE.handS);
        this.curtainTo(0, HillRide.FADES.inS);
    }

    // The climb's part of a frame: the steer keys as seen from the camera ahead of him, and at the top the restock.
    // Changes `controls`; true while the climb holds the ride
    climbStep(dt, controls) {
        const climb = this.climb;
        if (!climb) return false;
        const C = HillDay.CLIMB;
        climb.t += dt;
        if (climb.phase === 'climb') {
            // The keys are the bicycle's own, as on the descent: the left key turns its bars and him to his left. (They were
            // once turned for the cameras, which face him, so that the left key moved him to the left of the picture; the
            // owner found that backwards: he steers the bicycle, not the picture)
            controls.wheelie = 0;
            // On foot, pushing: the pedal key walks him on at walkMs, and let go he holds the bicycle where it is
            this.bike.walking = true;
            // (he slows as he wheels it in to the stall: slowM of his pace at the meeting place)
            const near = Math.max(0, Math.min(1, (C.meet[0] + C.turnInM - this.bike.s) / C.turnInM));
            const short = C.walkMs * (1 - (1 - C.slowM) * near) - this.bike.speed;
            if ((controls.pedal || 0) > 0) {
                climb.hold = Math.max(-0.5, Math.min(0.6, (climb.hold || 0) + short * dt * C.walkHold));
                controls.pedal = Math.max(0, Math.min(1, C.walkBase + short * C.walkGain + climb.hold));
            } else {
                controls.pedal = 0;
                controls.brake = 1;
            }
            // The last turnInM to the stall: he wheels the bicycle in to it, steering for `meet`, whatever the steer keys
            const into = Math.max(0, Math.min(1, (C.meet[0] + C.turnInM - this.bike.s) / C.turnInM));
            const v = this.bike.vehicle, meet = this.lane.at(C.meet[0], C.meet[1], 0, climb.meetAt || (climb.meetAt = {}));
            if (into > 0) {
                const off = Math.atan2(meet.x - v.position.x, meet.z - v.position.z) - v.yawAngle;
                const turn = Math.max(-1, Math.min(1, Math.atan2(Math.sin(off), Math.cos(off)) * C.turnGain));
                controls.steer = controls.steer * (1 - into) + turn * into;
            }
            // After a fall he stands up facing down the lane (HillBicycle.reset): on the climb, he turns to face up it
            const p = this.lane.sample(this.bike.s);
            if (!this.bike.crashed && v.speed < 0.3 && Math.cos(v.yawAngle - p.heading) > 0) v.yawAngle = p.heading + Math.PI;
            if (this.bike.s <= C.triggerS || (into > 0 && Math.hypot(meet.x - v.position.x, meet.z - v.position.z) < C.meetM)) {
                climb.phase = 'restock';
                climb.t = 0;
            }
        }
        if (climb.phase === 'restock') {
            Object.assign(controls, { pedal: 0, brake: 1, steer: 0, wheelie: 0 });
            if (climb.t >= C.restockS) {
                // He gets on: the picture fades to black (FADES), and in the dark he turns the bicycle round to face down
                // the lane and mounts
                climb.phase = 'mount';
                climb.t = 0;
                this.curtainTo(1, HillRide.FADES.outS);
            }
        }
        if (climb.phase === 'mount') {
            Object.assign(controls, { pedal: 0, brake: 1, steer: 0, wheelie: 0 });
            if (climb.t >= HillRide.FADES.outS) {
                const v = this.bike.vehicle;
                v.yawAngle = this.lane.sample(this.bike.s).heading;
                this.endClimb();
            }
        }
        return true;
    }

    // The day's step after the bicycle's: a missed door costs time on the clock; knocks sound
    dayStep(dt, controls) {
        const events = this.day.step(dt, this.bike, controls);
        for (const event of events) {
            if (event.missed !== undefined && this.board) this.board.penalise(HillDay.MISS_MS);
            const sound = this.game.soundManager;
            if ((event.knock || event.hazard || event.delivered !== undefined) && typeof HillProps !== 'undefined') HillProps.clatter(sound, event.hazard === 'cart' ? 0.8 : 0.15, false);
        }
        return events;
    }

    // The roll-off: the clock starts, and a run that may go to the board opens its session with the server (times
    // recorded before the reply are signed when it comes: RunSession). Debug mode, a tuned ride or test data runs the
    // clock but opens none
    beginTiming() {
        if (!this.board) return;
        this.dropSession();
        this.board.begin(this.bike.s);
        if (this.day) this.day.begin();
        const tuned = typeof Tuning !== 'undefined' && typeof Tuning.beginRide === 'function' && Tuning.beginRide();
        const search = typeof window !== 'undefined' && window.location ? window.location.search : '';
        if (!HillBoard.allowed(search, tuned) || this.forcedShot) {
            this.board.trusted = false;
            return;
        }
        const service = this.game.leaderboardService;
        if (!service) return;
        this.session = service.openSession(HillBoard.ID, HillBoard.expected());
        // The name entry (Game.showLeaderboardEntryUI) submits through the service's own session
        service.session = this.session;
    }

    // Each frame: a ride tuned at any moment, or one a tool holds on a shot, is no longer sent anywhere
    watchTrust() {
        if (!this.board || !this.board.running) return;
        const tuned = typeof Tuning !== 'undefined' && Tuning.ride && Tuning.ride.tuned;
        if (tuned || this.forcedShot) this.board.trusted = false;
        if (!this.board.trusted) this.dropSession();
    }

    // One physics step of the clock; `fell` on the step a fall begins. Gates, falls and the finish go to the session
    timeStep(dt, fell) {
        const event = this.board.step(dt, this.bike.s, fell);
        if (!this.board.trusted) this.dropSession();
        const session = this.session;
        if (!event || !session) return event;
        if (event.fell) session.recordRestart();
        if (event.gate !== undefined) session.recordCheckpoint(event.gate, event.ms);
        if (event.finish !== undefined) session.recordFinish(event.finish);
        return event;
    }

    dropSession() {
        if (this.session) this.session.cancel();
        this.session = null;
    }

    // The rider's best on this device in ms, after keeping `ms` if it beats it (null: no best yet)
    keepBest(ms) {
        let best = NaN;
        try {
            best = parseFloat(window.localStorage.getItem(HillRide.BEST_KEY));
            if (ms !== null && !(best * 1000 <= ms)) {
                window.localStorage.setItem(HillRide.BEST_KEY, String(ms / 1000));
                best = ms / 1000;
            }
        } catch (error) {
            console.warn('Hill ride: the best time cannot be kept on this device:', error);
            if (ms !== null) best = ms / 1000;
        }
        return Number.isFinite(best) ? Math.round(best * 1000) : null;
    }

    // The end card over the last picture: the time, the best, the board's top 10, and the name entry when the run
    // can go to the board. It is a dialog of the one stack (js/modals.js): R, Esc and N are its buttons' keys
    async showCard() {
        const board = this.board, card = this.card, notes = HillRide.BOARD_NOTES;
        if (!card) return;
        const ran = (this.cardRun = (this.cardRun || 0) + 1);
        const timed = board.finished && board.trusted;
        const ms = board.finished ? board.finishMs : null;
        const falls = board.restarts > 0 ? ` (${board.restarts} ${board.restarts === 1 ? 'fall' : 'falls'}, +${board.restarts * HillBoard.LIMITS.penaltyMs / 1000} s)` : '';
        const sum = this.day ? this.day.summary() : null;
        const missed = sum && sum.missed > 0 ? ` (${sum.missed} ${sum.missed === 1 ? 'door' : 'doors'} missed, +${sum.missMs / 1000} s)` : '';
        const clean = sum && sum.clean ? ' · a clean round' : '';
        card.time.textContent = ms !== null ? `Your time ${HillBoard.format(ms)}${falls}${missed}${clean}` : 'Not timed';
        card.round.replaceChildren(...(sum ? this.roundLines(sum) : []));
        const before = this.keepBest(null);
        const best = timed ? this.keepBest(ms) : before;
        card.best.textContent = best === null ? 'No best yet' : `Your best ${HillBoard.format(best)}${timed && best === ms && before !== ms ? ' · a new best' : ''}`;
        card.name.hidden = true;
        card.board.textContent = timed ? notes.loading : notes.untimed;
        this.endNote.style.display = '';
        if (typeof Modals !== 'undefined') Modals.open(this.endNote, { keep: true, under: 'show' });
        const session = timed ? this.session : null;
        let open = false;
        if (session) {
            const started = await session.ready;
            if (ran !== this.cardRun) return;
            open = started === true && session.isActive();
            // A server that has no row for the board: nothing to read. A session that failed (offline, rate limited)
            // still reads the board, with no name entry
            if (session.unsupported) {
                card.board.textContent = notes.notOpen;
                return;
            }
        }
        if (!timed) return;
        await this.fillBoard(ran);
        if (ran !== this.cardRun || !open) return;
        card.name.hidden = false;
        card.name.focus({ preventScroll: true });
    }

    // The day on the card: the doors, the loaves, the freewheel and its best on this device, the day
    roundLines(sum) {
        let best = sum.freewheelM;
        try {
            const kept = parseFloat(window.localStorage.getItem(HillDay.FREEWHEEL_KEY));
            if (kept > best) best = kept;
            else window.localStorage.setItem(HillDay.FREEWHEEL_KEY, String(best));
        } catch (error) {
            console.warn('Hill ride: the freewheel best cannot be kept on this device:', error);
        }
        return [
            `Day ${sum.day}`,
            `Bread delivered ${sum.delivered} of ${sum.doors}`,
            `Loaves left ${sum.loaves}${sum.lost > 0 ? ` (${sum.lost} lost)` : ''}`,
            `Longest freewheel ${sum.freewheelM} m · best ${Math.round(best)} m`
        ].map(text => {
            const el = document.createElement('div');
            el.textContent = text;
            return el;
        });
    }

    // The board's top 10 into the card; a board that cannot be read says so and the time stays
    async fillBoard(ran) {
        const card = this.card, notes = HillRide.BOARD_NOTES, service = this.game.leaderboardService;
        if (!service) {
            card.board.textContent = notes.unavailable;
            return;
        }
        let result = null;
        try {
            result = await service.fetchLeaderboard(HillBoard.ID, 10);
        } catch (error) {
            console.warn('Hill ride: the board could not be read:', error);
        }
        if (ran !== this.cardRun) return;
        if (!result || !result.success || !Array.isArray(result.entries)) {
            card.board.textContent = notes.unavailable;
            return;
        }
        if (result.entries.length === 0) {
            card.board.textContent = notes.empty;
            return;
        }
        const table = document.createElement('table');
        table.className = 'lb-table';
        result.entries.forEach((entry, i) => {
            const row = table.insertRow();
            const falls = entry.restarts > 0 ? ` ${entry.restarts}R` : '';
            const cells = [
                [`${entry.rank !== undefined ? entry.rank : i + 1}.`, 'lb-rank'],
                [String(entry.playerName), 'lb-name'],
                [`${HillBoard.format(entry.totalTime)}${falls}${entry.flagged ? ' (flagged)' : ''}`, 'lb-time']
            ];
            for (const [text, className] of cells) {
                const cell = row.insertCell();
                cell.className = className;
                cell.textContent = text;
            }
        });
        card.board.replaceChildren(table);
    }

    // The game's own name entry over the card; afterwards the board is read again with the time on it
    enterName() {
        if (!this.session || !this.session.isActive() || typeof this.game.showLeaderboardEntryUI !== 'function') return;
        this.card.name.hidden = true;
        const ran = this.cardRun;
        this.game.showLeaderboardEntryUI(() => {
            if (ran !== this.cardRun) return;
            this.session = null;
            this.card.board.textContent = HillRide.BOARD_NOTES.loading;
            this.fillBoard(ran);
        });
    }

    closeCard() {
        this.cardRun = (this.cardRun || 0) + 1;
        if (this.endNote && typeof Modals !== 'undefined' && Modals.isOpen(this.endNote)) Modals.close(this.endNote);
        if (this.endNote) this.endNote.style.display = 'none';
    }

    // The points of the boy and the bicycle the camera must see: the wheels' hubs and his head, from the lane and the
    // bicycle's state (so the rule needs no drawing)
    static points(lane, bike) {
        return [lane.at(bike.s - 0.55, bike.across, 0.4, {}), lane.at(bike.s + 0.55, bike.across, 0.4, {}), lane.at(bike.s, bike.across, 1.65, {})];
    }

    // Whether any of `points` is in the camera's view: inside its frustum and with no cottage between
    static seen(camera, lane, points) {
        camera.updateMatrixWorld();
        const frustum = HillRide.frustum || (HillRide.frustum = new THREE.Frustum());
        const m = HillRide.viewMatrix || (HillRide.viewMatrix = new THREE.Matrix4());
        frustum.setFromProjectionMatrix(m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
        const v = HillRide.scratchPoint || (HillRide.scratchPoint = new THREE.Vector3());
        const eye = camera.position;
        return points.some(p => frustum.containsPoint(v.set(p.x, p.y, p.z)) && !lane.blocks(eye, p));
    }

    // Where the camera stands and looks once it has stopped, into `at` and `look`
    static endView(lane, at, look) {
        const end = lane.rule.end;
        const a = lane.at(end.s, end.across, end.up, {}), l = lane.at(end.lookS, 0, end.lookUpM, {});
        at.set(a.x, a.y, a.z);
        look.set(l.x, l.y, l.z);
    }

    // The last picture: the loaf on its board on a table, far below the village, in a warm low light from the side
    static get LOAF() {
        return Object.freeze({ at: [0, -400, 0], camera: [0.42, 0.36, 0.62], fov: 34, light: [0.8, 0.55, 0.35], colour: 0xffdcb0, intensity: 1.5, table: 0x2e2018, revealS: 1.4 });
    }

    // Builds the last picture (HillLoaf) if it is not built yet: only once the ride reaches its end
    makeLoaf() {
        if (this.loaf || typeof HillLoaf === 'undefined') return this.loaf;
        const L = HillRide.LOAF;
        const group = HillLoaf.build(this.game.renderer ? this.game.renderer.capabilities.getMaxAnisotropy() : 8);
        group.position.fromArray(L.at);
        group.visible = false;
        this.game.scene.add(group);
        this.game.graphics.fixColorSpaces(group);
        HillScene.bumpsBothSides(group);
        this.loaf = group;
        return group;
    }

    // Shows the last picture: the village put away, the loaf in its light, the camera on it
    showLoaf(on) {
        const game = this.game, L = HillRide.LOAF;
        if (this.village) this.village.visible = !on;
        if (this.rider) this.rider.group.visible = !on;
        if (this.props) this.props.group.visible = !on;
        if (on) this.makeLoaf();
        if (this.loaf) this.loaf.visible = on;
        if (on && game.scene) {
            this.savedFog = game.scene.fog;
            game.scene.fog = null;
        } else if (this.savedFog && game.scene) {
            game.scene.fog = this.savedFog;
            this.savedFog = null;
        }
        this.loafShown = on;
    }

    // The end of the ride, a step of `dt`: the camera stopping, the bicycle watched out of sight, the fade, the last
    // picture coming up out of the dark with the band's last chord, the card. Returns the phase
    updateEnding(dt) {
        const end = this.lane.rule.end;
        if (!this.ending) {
            if (this.bike.s < end.stopS) return null;
            this.ending = { phase: 'stopping', t: 0, hidden: 0, from: this.game.camera.position.clone(), lookFrom: this.look.clone(), fovFrom: this.game.camera.fov };
            this.glide = null;
        }
        const e = this.ending;
        e.t += dt;
        if (e.phase === 'stopping' && e.t >= end.endEaseS) e.phase = 'watching';
        if (e.phase === 'watching') {
            e.hidden = HillRide.seen(this.game.camera, this.lane, HillRide.points(this.lane, this.bike)) ? 0 : e.hidden + dt;
            if (e.hidden >= end.hiddenS) {
                e.phase = 'fading';
                // The last picture is built under the fade, the screen going dark
                this.makeLoaf();
                e.fadeAt = e.t;
                if (this.music) this.music.stop(end.fadeS);
            }
        }
        if (e.phase === 'fading') {
            const share = Math.min(1, (e.t - e.fadeAt) / end.fadeS);
            if (this.fade) this.fade.style.opacity = String(share);
            if (share >= 1) {
                e.phase = 'loaf';
                e.loafAt = e.t;
                this.showLoaf(true);
                if (this.music && this.music.close) this.music.close();
            }
        }
        if (e.phase === 'loaf') {
            const share = Math.min(1, (e.t - e.loafAt) / HillRide.LOAF.revealS);
            if (this.fade) this.fade.style.opacity = String(1 - share);
            if (share >= 1) {
                e.phase = 'done';
                if (this.endNote) this.endNote.style.display = '';
                if (this.board) this.showCard();
            }
        }
        return e.phase;
    }

    // One displayed frame: the input, the physics in fixed steps, the pose, the camera, the light, the music
    frame(dt) {
        const game = this.game, input = game.input;
        // The graphics ladder reads the frame time, as on a world ride (Game.adaptResolution, js/quality.js)
        if (game.adaptResolution) game.adaptResolution(performance.now());
        // The pause key and the leg keys mean nothing here; their flags are cleared so they do not pile up
        input.checkPause();
        input.checkCheckpointRestart();
        if (input.checkCameraSwitch()) {
            this.view = (this.view + 1) % HillRide.VIEWS.length;
            this.showView();
            this.glideFrom(HillRide.GLIDE.viewS);
        }
        if (input.checkSoundToggle() && game.soundManager) HillRide.toggleMute(game.soundManager, HillRide.storage());
        this.cameraStep(dt);
        const controls = { pedal: input.getThrottleInput(), brake: input.getBrakeInput(), steer: input.getSteeringInput(HillVehicle.WORLD.steerKeys), wheelie: input.getWheelieInput() };
        // The climb to the cart at the top, then the restock
        this.climbStep(dt, controls);
        // A loaf thrown at a door, once the descent is on (Q left, E right)
        const thrown = typeof input.checkThrow === 'function' ? input.checkThrow() : 0;
        if (thrown && this.day && !this.climb && !(this.hold && this.hold.phase === 'hold') && this.day.throw(thrown, this.bike)) {
            // His hand flings it, and he watches the door it goes to (the nearest on that side)
            this.rider.throwAt(thrown);
            let near = null;
            for (const d of this.day.doors) if (d.side === thrown && Math.abs(d.s - this.bike.s) < 20 && (!near || Math.abs(d.s - this.bike.s) < Math.abs(near.s - this.bike.s))) near = d;
            this.thrownDoor = near;
        }
        // The hold at the start: braked, a foot down, until it is over
        if (this.hold) {
            this.hold.t += dt;
            const H = HillRide.HOLD;
            if (this.hold.phase === 'hold' && this.hold.t >= H.leastS && controls.pedal > 0) {
                // The bicycle rolls: the clock starts
                this.beginTiming();
                this.hold.phase = 'ease';
                this.hold.t = 0;
                this.hold.from = this.game.camera.position.clone();
                this.hold.lookFrom = this.look.clone();
                this.hold.fovFrom = this.game.camera.fov;
                // (the ease takes over from the camera as it is: no glide on top of it)
                this.glide = null;
            } else if (this.hold.phase === 'ease' && this.hold.t >= H.easeS) {
                this.hold = null;
            }
            if (this.hold && this.hold.phase === 'hold') Object.assign(controls, { pedal: 0, brake: 1, steer: 0, wheelie: 0 });
            // Off the stand: if the rider does nothing, the boy pushes off himself and the hill takes him
            else if (this.hold && this.hold.t < H.pushS && !controls.brake) controls.pedal = Math.max(controls.pedal, H.push);
        }
        // Near the end of the lane he pulls up
        if (this.bike.s > this.lane.rule.lengthM - 12) controls.brake = 1;
        this.accumulated += dt;
        this.watchTrust();
        while (this.accumulated >= HillRide.STEP_S) {
            const down = this.bike.crashed;
            this.bike.step(HillRide.STEP_S, controls);
            if (this.board) this.timeStep(HillRide.STEP_S, !down && this.bike.crashed);
            if (this.day && !this.climb) this.dayStep(HillRide.STEP_S, controls);
            if (this.props) {
                this.props.knock(this.bike, game.soundManager);
                this.props.step(HillRide.STEP_S);
            }
            if (this.spill) this.spill.step(this.bike, HillRide.STEP_S);
            this.accumulated -= HillRide.STEP_S;
        }
        const phase = this.updateEnding(dt);
        this.draw(dt);
        if (this.music && !phase) this.music.play();
    }

    // Where the boy looks (HillBoy.live): at the door he threw at while he watches it, else at the next door that waits
    // once it is ahead within LOOK.doorM, else (null) ahead of him
    lookTarget() {
        const day = this.day, bike = this.bike, boy = this.rider && this.rider.boy;
        if (!day || this.climb || !boy) return null;
        let door = boy.lookAtDoorT > 0 ? this.thrownDoor : null;
        if (!door) {
            const i = day.next;
            const d = i >= 0 ? day.doors[i] : null;
            if (d && d.s - bike.s > 3 && d.s - bike.s < HillBoy.LOOK.doorM) door = d;
        }
        if (!door) return null;
        return (this.doorLook || (this.doorLook = new THREE.Vector3())).set(door.x, door.y + 1.3, door.z);
    }

    // Poses the bicycle, moves the camera and the sun with it, and draws
    draw(dt) {
        const game = this.game;
        this.showStart();
        // (where he looks, and how far the camera is: his near or far body)
        this.rider.eye = game.camera.position;
        this.rider.lookAt = this.lookTarget();
        this.rider.update(this.bike, this.lane, dt);
        if (this.day) {
            this.day.eye = game.camera.position;
            this.day.draw(dt || 1 / 60);
            // The basket: full up the climb, as he brings the bread up to the cart, then as many as are left
            const basket = this.spill ? this.spill.inBasket : null;
            if (this.climb) {
                if (basket) basket.forEach(o => { o.visible = true; });
            } else this.day.showBasket(basket, this.spill && this.spill.spilt);
        }
        if (this.props) {
            this.props.draw();
            const puff = this.props.puff;
            this.puff.visible = !!puff;
            if (puff) {
                // Up and out quickly, then down flat onto the ground as it goes
                const up = Math.min(1, puff.t / 0.12), size = 0.03 + up * 0.06;
                this.puff.position.set(puff.x, puff.y + up * 0.06 - Math.max(0, puff.t - 0.12) * 0.2, puff.z);
                this.puff.scale.set(size * (1 + puff.t * 2), size * 0.7 * Math.max(0.15, 1 - puff.t * 1.5), size * (1 + puff.t * 2));
                this.puff.material.opacity = Math.max(0, 0.85 * (1 - puff.t / 0.6));
            }
        }
        this.placeCamera(Math.min(1, dt * 6));
        const sun = game.directionalLight;
        if (this.loafShown && this.loaf) {
            // The last picture's own warm light from the side
            const L = HillRide.LOAF;
            sun.position.copy(this.loaf.position).add(new THREE.Vector3().fromArray(L.light).multiplyScalar(10));
            sun.target.position.copy(this.loaf.position);
            sun.color.set(L.colour);
            sun.intensity = L.intensity;
        } else {
            const at = this.rider.group.position;
            sun.position.copy(at).addScaledVector(this.sun, 120);
            sun.target.position.copy(at);
            sun.color.set(HillRide.LIGHT.sunColour);
            sun.intensity = HillRide.LIGHT.sunIntensity;
        }
        sun.target.updateMatrixWorld();
        // The effects in force, as a world ride has them (js/effects.js), then the sky, the post-processing and the draw
        if (game.effectLevels && typeof Effects !== 'undefined') Effects.frame(game);
        game.graphics.update(dt, Math.min(1, this.bike.speed / 15), 0);
        game.graphics.render(game.scene, game.camera);
    }

    // The camera for the view, moved `blend` of the way to where it should be (1 puts it there)
    placeCamera(blend) {
        // (held at the start after the hand-over, the camera stays behind him until he pushes off, whatever the view)
        const cam = this.game.camera, view = HillRide.VIEWS[this.hold && this.hold.phase === 'hold' && this.handedOver ? 0 : this.view];
        if (this.loafShown && this.loaf) {
            const L = HillRide.LOAF;
            cam.position.copy(this.loaf.position).add(new THREE.Vector3().fromArray(L.camera));
            cam.up.set(0, 1, 0);
            if (cam.fov !== L.fov) {
                cam.fov = L.fov;
                cam.updateProjectionMatrix();
            }
            cam.lookAt(this.loaf.position.x, this.loaf.position.y + 0.08, this.loaf.position.z);
            cam.updateMatrixWorld();
            return null;
        }
        // The climb: the wide shot held while he comes up into it, then the long lens head on, then the stop by the
        // stall (CLIMB_SHOTS)
        if (this.climb && !this.forcedShot) {
            const fov = this.climbCamera(this.camTarget, this.look);
            cam.position.copy(this.camTarget);
            cam.up.set(0, 1, 0);
            if (cam.fov !== fov) {
                cam.fov = fov;
                cam.updateProjectionMatrix();
            }
            cam.lookAt(this.look);
            cam.updateMatrixWorld();
            return null;
        }
        // A named shot held: the opening while the ride holds at the start, or one a tool asks for (forcedShot)
        const held = this.forcedShot || (this.hold && this.hold.phase === 'hold' && !this.handedOver ? 'opening' : null);
        if (held) {
            const shot = HillRide.shot(this.lane, held, this.camTarget, this.look);
            cam.position.copy(this.camTarget);
            cam.up.set(0, 1, 0);
            if (cam.fov !== shot.fov) {
                cam.fov = shot.fov;
                cam.updateProjectionMatrix();
            }
            cam.lookAt(this.look);
            cam.updateMatrixWorld();
            return null;
        }
        if (this.ending) {
            // Eased from where it was to the fixed point high behind the bicycle, then held there
            const e = this.ending;
            HillRide.endView(this.lane, this.camTarget, this.endLook);
            const t = Math.min(1, e.t / this.lane.rule.end.endEaseS), k = t * t * (3 - 2 * t);
            cam.position.copy(e.from).lerp(this.camTarget, k);
            this.look.copy(e.lookFrom).lerp(this.endLook, k);
            cam.up.set(0, 1, 0);
            // (its lens eased too)
            const lens = (e.fovFrom === undefined ? 50 : e.fovFrom) + (50 - (e.fovFrom === undefined ? 50 : e.fovFrom)) * k;
            if (cam.fov !== lens) {
                cam.fov = lens;
                cam.updateProjectionMatrix();
            }
            cam.lookAt(this.look);
            cam.updateMatrixWorld();
            return null;
        }
        const p = this.lane.sample(this.bike.s, this.sample);
        const bike = this.rider ? this.rider.group.position : this.lane.at(this.bike.s, 0, 0, {});
        let fov = view.fov;
        if (view.id === 'follow') {
            this.followShot(this.camTarget, this.look);
        } else if (view.id === 'cinema') {
            // After a fall or a restart, the camera that sees him
            const down = this.bike.crashed;
            const force = this.cinema === undefined || this.cinema === null || (this.wasDown && !down) || (this.bike.timeS || 0) < (this.cinemaCutAt || 0);
            this.wasDown = down;
            const before = this.cinema, pick = this.cinemaPick(force);
            // (a new camera: glide to it, never cut)
            const top = HillRide.cinemaAt(this.lane, HillRide.CINEMA[pick], {});
            if (before !== undefined && before !== null && pick !== before) {
                const far = Math.hypot(top.x - cam.position.x, top.y - cam.position.y, top.z - cam.position.z);
                this.glideFrom(Math.max(HillRide.GLIDE.cutS, far / HillRide.GLIDE.speedMs));
            }
            const v = this.bike.vehicle.position;
            this.camTarget.set(top.x, top.y, top.z);
            this.look.set(v.x, v.y + 0.9, v.z);
            // The lens closes in to keep him about frameM of the picture's height
            const d = this.camTarget.distanceTo(this.look);
            fov = Math.max(view.fovFar, Math.min(view.fovNear, 2 * Math.atan(view.frameM / 2 / Math.max(1, d)) * 180 / Math.PI * 1.6));
            blend = 1;
        } else {
            const ahead = this.lane.sample(this.bike.s + view.ahead, {});
            this.camTarget.set(ahead.x + ahead.leftX * 0.8, ahead.y + view.up, ahead.z + ahead.leftZ * 0.8);
            this.look.set(bike.x, bike.y + 0.8, bike.z);
        }
        if (this.hold && this.hold.phase === 'ease') {
            // From the opening shot to the view as he pushes off: the camera cranes up and back, the aim and the lens
            // follow, all eased, no cut. It eases to the view's own damped camera, run all through the ease, not to
            // the place the view wants: at the end the camera is then that camera, lag and speed and all, and the
            // view takes over without the stall of a damped camera that starts with no lag behind a rolling bicycle
            const h = this.hold;
            if (!h.chase) h.chase = this.camTarget.clone();
            else h.chase.lerp(this.camTarget, blend);
            const t = Math.min(1, h.t / HillRide.HOLD.easeS), k = t * t * t * (t * (6 * t - 15) + 10);
            cam.position.copy(h.from).lerp(h.chase, k);
            // (to the view's aim: from where the aim was at the push-off)
            const aim = this.easeLook || (this.easeLook = new THREE.Vector3());
            aim.copy(this.look);
            this.look.copy(this.hold.lookFrom).lerp(aim, k);
            fov = this.hold.fovFrom + (fov - this.hold.fovFrom) * k;
        } else cam.position.lerp(this.camTarget, blend);
        // A glide (GLIDE): from where the camera was to where the view has it, eased, place, aim and lens together
        if (this.glide) {
            const g = this.glide, k = Math.min(1, g.t / g.s), e = k * k * k * (k * (6 * k - 15) + 10), G = HillRide.GLIDE;
            const far = g.pos.distanceTo(cam.position), from = this.glideLook || (this.glideLook = new THREE.Vector3());
            cam.position.lerpVectors(g.pos, cam.position, e);
            cam.position.y += Math.min(G.arcMostM, far * G.arcM) * Math.sin(Math.PI * e);
            from.copy(this.bike.vehicle.position).add(g.lookOff);
            this.look.lerpVectors(from, this.look, e);
            fov = g.fov + (fov - g.fov) * e;
        }
        cam.up.set(0, 1, 0);
        if (cam.fov !== fov) {
            cam.fov = fov;
            cam.updateProjectionMatrix();
        }
        cam.lookAt(this.look);
        cam.updateMatrixWorld();
        return p;
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { HillRide };
