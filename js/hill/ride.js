// The hill ride: a short ride of its own down a steep cobbled village lane on a delivery bicycle, opened from the URL
// (RideMode kind 'hill', js/ridemode.js). It starts at the top, stood still; gravity does most of the work, and at
// speed the boy takes his feet off the pedals and holds his legs out. Near the bottom the camera stops high behind him
// (HillLane.RULE.end) and stays while he rolls on round the bend; once he is out of its sight the picture fades and
// the ride ends on a quiet card. It has no clock, no gates and no board: nothing
// is timed and nothing is sent anywhere. It uses the game's renderer, scene lights, input and sound, and nothing of
// the legs or the world.
//
//   the lane and what stands by it    js/hill/lane.js (data), js/hill/scene.js (drawn)
//   the bicycle's physics             js/hill/pushbike.js (the game's own bike), js/hill/bicycle.js (on the lane)
//   the bicycle and boy as drawn      js/hill/rider.js, assets/hill/bicycle.glb (tools/blender/hill_bike.py)
//   the things in the street          js/hill/props.js
//   the music                         js/hill/music.js
//   the last picture                  assets/hill/loaf.glb (tools/blender/hill_loaf.py)
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

    // The light: a low golden sun (elevationDeg over the horizon) at the bottom end of the main straight, so it shines
    // straight up the straight (alongS: a place on it, whose heading the sun lies along) and stands to the right of the
    // start, raking across the house fronts on the left; through a warm haze
    static get LIGHT() {
        return Object.freeze({
            elevationDeg: 14, alongS: 126, sunColour: 0xf8dcb4, sunIntensity: 2.0,
            haze: 0xdedcd6, hazeDensity: 0.0075, ambient: 0.33, sky: 0xcfccc4, ground: 0x6a604c, hemisphere: 0.82
        });
    }

    // The way to the sun from the lane (a unit vector)
    static sunDirection(lane, out = new THREE.Vector3()) {
        const L = HillRide.LIGHT, p = lane.sample(L.alongS), e = L.elevationDeg * Math.PI / 180;
        return out.set(Math.cos(e) * p.alongX, Math.sin(e), Math.cos(e) * p.alongZ);
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

    // The hold at the start: the opening shot for holdS (or until he pedals, after leastS), then the camera eases over
    // easeS to the view chosen while the boy pushes off (push of the pedal for pushS, unless the rider rides himself)
    static get HOLD() { return Object.freeze({ holdS: 3.5, leastS: 0.8, easeS: 2.6, pushS: 1.2, push: 0.7 }); }

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

    static get KEYS_NOTE() {
        return 'Up or W pedals · Down or S brakes · Left and Right steer · Space wheelies · Z changes the view · R starts again from the top · M sound · Esc leaves';
    }

    constructor(game) {
        this.game = game;
        this.lane = new HillLane();
        this.bike = new HillBicycle(this.lane);
        this.music = typeof HillMusic !== 'undefined' ? new HillMusic(game.soundManager) : null;
        this.view = 0;
        this.accumulated = 0;
        this.sample = {};
        this.look = new THREE.Vector3();
        this.camTarget = new THREE.Vector3();
        this.endLook = new THREE.Vector3();
        this.ending = null;
        this.running = false;
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
        // A puff of soil where a pot breaks
        this.puff = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0x5a4430, roughness: 1, transparent: true, opacity: 0 }));
        this.puff.visible = false;
        game.scene.add(this.puff);
        game.scene.add(this.rider.group);
        game.graphics.fixColorSpaces();
        this.light();
        this.overlay();
        this.keys = (event) => {
            if (event.repeat) return;
            if (event.code === 'KeyR') this.restart();
            if (event.code === 'Escape') window.location.assign(window.location.pathname);
        };
        document.addEventListener('keydown', this.keys);
        this.bike.reset(this.lane.rule.startM, this.lane.rule.opening.startAcross);
        this.hold = { phase: 'hold', t: 0 };
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

    light() {
        const game = this.game, L = HillRide.LIGHT;
        game.scene.background = new THREE.Color(L.haze);
        game.scene.fog = new THREE.FogExp2(L.haze, L.hazeDensity);
        game.graphics.setTimeOfDay('golden');
        // The reference frames' sky: pale and hazy, the sun's glow soft in it
        game.graphics.setWeather('fog');
        game.graphics.setRingStrength(0);
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
        line.textContent = 'R rides it again · Esc leaves';
        this.endNote.append(title, line);
        this.endNote.style.display = 'none';
        note.append(this.viewNote, keys);
        document.body.append(note, this.fade, this.endNote);
        this.showView();
    }

    showView() {
        if (this.viewNote) this.viewNote.textContent = `View: ${HillRide.VIEWS[this.view].name}`;
    }

    restart() {
        this.bike.reset(this.lane.rule.startM, this.lane.rule.opening.startAcross);
        if (this.props) this.props.reset();
        if (this.loafShown) this.showLoaf(false);
        this.hold = { phase: 'hold', t: 0 };
        this.accumulated = 0;
        this.ending = null;
        this.cinema = null;
        if (this.endNote) this.endNote.style.display = 'none';
        if (this.fade) this.fade.style.opacity = '0';
        this.placeCamera(1);
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
            this.ending = { phase: 'stopping', t: 0, hidden: 0, from: this.game.camera.position.clone(), lookFrom: this.look.clone() };
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
            this.placeCamera(1);
        }
        if (input.checkSoundToggle() && game.soundManager) game.soundManager.setSetting('muted', !game.soundManager.getSetting('muted'));
        const controls = { pedal: input.getThrottleInput(), brake: input.getBrakeInput(), steer: input.getSteeringInput(HillVehicle.WORLD.steerKeys), wheelie: input.getWheelieInput() };
        // The hold at the start: braked, a foot down, until it is over
        if (this.hold) {
            this.hold.t += dt;
            const H = HillRide.HOLD;
            if (this.hold.phase === 'hold' && (this.hold.t >= H.holdS || (this.hold.t >= H.leastS && controls.pedal > 0))) {
                this.hold.phase = 'ease';
                this.hold.t = 0;
                this.hold.from = this.game.camera.position.clone();
                this.hold.lookFrom = this.look.clone();
                this.hold.fovFrom = this.game.camera.fov;
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
        while (this.accumulated >= HillRide.STEP_S) {
            this.bike.step(HillRide.STEP_S, controls);
            if (this.props) {
                this.props.knock(this.bike, game.soundManager);
                this.props.step(HillRide.STEP_S);
            }
            this.accumulated -= HillRide.STEP_S;
        }
        const phase = this.updateEnding(dt);
        this.draw(dt);
        if (this.music && !phase) this.music.play();
    }

    // Poses the bicycle, moves the camera and the sun with it, and draws
    draw(dt) {
        const game = this.game;
        this.rider.update(this.bike, this.lane, dt);
        if (this.props) {
            this.props.draw();
            const puff = this.props.puff;
            this.puff.visible = !!puff;
            if (puff) {
                const size = 0.15 + puff.t * 0.5;
                this.puff.position.set(puff.x, puff.y + puff.t * 0.4, puff.z);
                this.puff.scale.setScalar(size);
                this.puff.material.opacity = Math.max(0, 0.6 * (1 - puff.t / 1.2));
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
        const cam = this.game.camera, view = HillRide.VIEWS[this.view];
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
        // A named shot held: the opening while the ride holds at the start, or one a tool asks for (forcedShot)
        const held = this.forcedShot || (this.hold && this.hold.phase === 'hold' ? 'opening' : null);
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
            if (cam.fov !== 50) {
                cam.fov = 50;
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
            const back = this.lane.sample(Math.max(0, this.bike.s - view.back), {});
            this.camTarget.set(back.x + back.leftX * this.bike.across * 0.5, back.y + view.up, back.z + back.leftZ * this.bike.across * 0.5);
            const ahead = this.lane.sample(this.bike.s + view.look, {});
            this.look.set(ahead.x, ahead.y + 0.6, ahead.z).lerp(bike, 0.35);
        } else if (view.id === 'cinema') {
            // After a fall or a restart, the camera that sees him
            const down = this.bike.crashed;
            const force = this.cinema === undefined || this.cinema === null || (this.wasDown && !down) || (this.bike.timeS || 0) < (this.cinemaCutAt || 0);
            this.wasDown = down;
            const top = HillRide.cinemaAt(this.lane, HillRide.CINEMA[this.cinemaPick(force)], {});
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
            // follow, all eased, no cut
            const t = Math.min(1, this.hold.t / HillRide.HOLD.easeS), k = t * t * t * (t * (6 * t - 15) + 10);
            cam.position.copy(this.hold.from).lerp(this.camTarget, k);
            this.look.copy(this.hold.lookFrom).lerp(this.look, k);
            fov = this.hold.fovFrom + (fov - this.hold.fovFrom) * k;
        } else cam.position.lerp(this.camTarget, blend);
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
