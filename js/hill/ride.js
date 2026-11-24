// The hill ride: a short ride of its own down a steep cobbled village lane on a delivery bicycle, opened from the URL
// (RideMode kind 'hill', js/ridemode.js). It starts at the top, stood still; gravity does most of the work, and at
// speed the boy takes his feet off the pedals and holds his legs out. It has no clock, no gates and no board: nothing
// is timed and nothing is sent anywhere. It uses the game's renderer, scene lights, input and sound, and nothing of
// the legs or the world.
//
//   the lane and what stands by it    js/hill/lane.js (data), js/hill/scene.js (drawn)
//   the bicycle's physics             js/hill/bicycle.js
//   the bicycle and boy as drawn      js/hill/rider.js, assets/hill/bicycle.glb (tools/blender/hill_bike.py)
//   the music                         js/hill/music.js
class HillRide {
    static get STEP_S() { return 1 / 120; }

    // The views, Z steps through them: behind and over the boy looking down the lane; at the top of the lane watching
    // him go, the lens closing in as he gets further; ahead of him looking back up the hill
    static get VIEWS() {
        return Object.freeze([
            { id: 'follow', name: 'Behind', back: 6.5, up: 3.4, look: 9, fov: 60 },
            { id: 'top', name: 'From the top', s: 36, across: 1.2, up: 3.6, fovNear: 55, fovFar: 16, frameM: 6 },
            { id: 'front', name: 'In front', ahead: 7, up: 1.3, fov: 55 }
        ]);
    }

    // The low winter sun ahead and over the wall, lighting the cottages' fronts, through the haze
    static get LIGHT() {
        return Object.freeze({ sun: [-0.45, 0.35, 0.82], sunColour: 0xffe2b8, sunIntensity: 1.1, haze: 0xcfc6b2, hazeDensity: 0.0028, ambient: 0.55, sky: 0xbfd0d8, ground: 0x6a6450, hemisphere: 0.95 });
    }

    static get KEYS_NOTE() {
        return 'Up or W pedals · Down or S brakes · Left and Right steer · Z changes the view · R starts again from the top · M sound · Esc leaves';
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
        this.running = false;
    }

    async start() {
        const game = this.game;
        document.body.classList.add('hill-on');
        const { group } = HillScene.build(this.lane);
        this.village = group;
        game.scene.add(group);
        const model = await SceneAssets.loadModel(HillRider.FILE);
        this.rider = new HillRider(model);
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
        this.bike.reset();
        this.rider.update(this.bike, this.lane.sample(this.bike.s, this.sample), 0);
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
        game.graphics.setWeather('fog');
        game.graphics.setRingStrength(0);
        this.sun = new THREE.Vector3().fromArray(L.sun).normalize();
        game.graphics.setSunOffset({ x: this.sun.x, y: this.sun.y, z: this.sun.z });
        const sun = game.directionalLight;
        sun.color.set(L.sunColour);
        sun.intensity = L.sunIntensity;
        const shadow = sun.shadow.camera;
        shadow.left = shadow.bottom = -45;
        shadow.right = shadow.top = 45;
        shadow.far = 400;
        shadow.updateProjectionMatrix();
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
        this.endNote = document.createElement('div');
        this.endNote.className = 'hill-end';
        this.endNote.textContent = 'The bottom of the hill. R to ride it again.';
        this.endNote.style.display = 'none';
        note.append(this.viewNote, keys);
        document.body.append(note, this.endNote);
        this.showView();
    }

    showView() {
        if (this.viewNote) this.viewNote.textContent = `View: ${HillRide.VIEWS[this.view].name}`;
    }

    restart() {
        this.bike.reset();
        this.accumulated = 0;
        if (this.endNote) this.endNote.style.display = 'none';
        this.placeCamera(1);
    }

    // One displayed frame: the input, the physics in fixed steps, the pose, the camera, the light, the music
    frame(dt) {
        const game = this.game, input = game.input;
        // The pause key and the leg keys mean nothing here; their flags are cleared so they do not pile up
        input.checkPause();
        input.checkCheckpointRestart();
        if (input.checkCameraSwitch()) {
            this.view = (this.view + 1) % HillRide.VIEWS.length;
            this.showView();
            this.placeCamera(1);
        }
        if (input.checkSoundToggle() && game.soundManager) game.soundManager.setSetting('muted', !game.soundManager.getSetting('muted'));
        const controls = { pedal: input.getThrottleInput(), brake: input.getBrakeInput(), steer: input.getSteeringInput(null) };
        this.accumulated += dt;
        while (this.accumulated >= HillRide.STEP_S) {
            this.bike.step(HillRide.STEP_S, controls);
            this.accumulated -= HillRide.STEP_S;
        }
        if (this.bike.finished && this.endNote) this.endNote.style.display = '';
        this.draw(dt);
        if (this.music) this.music.play();
    }

    // Poses the bicycle, moves the camera and the sun with it, and draws
    draw(dt) {
        const game = this.game;
        const p = this.lane.sample(this.bike.s, this.sample);
        this.rider.update(this.bike, p, dt);
        this.placeCamera(Math.min(1, dt * 6));
        const at = this.rider.group.position;
        const sun = game.directionalLight;
        sun.position.copy(at).addScaledVector(this.sun, 120);
        sun.target.position.copy(at);
        sun.target.updateMatrixWorld();
        game.graphics.update(dt, Math.min(1, this.bike.speed / 15), 0);
        game.graphics.render(game.scene, game.camera);
    }

    // The camera for the view, moved `blend` of the way to where it should be (1 puts it there)
    placeCamera(blend) {
        const cam = this.game.camera, view = HillRide.VIEWS[this.view];
        const p = this.lane.sample(this.bike.s, this.sample);
        const bike = this.rider ? this.rider.group.position : this.lane.at(this.bike.s, 0, 0, {});
        let fov = view.fov;
        if (view.id === 'follow') {
            const back = this.lane.sample(Math.max(0, this.bike.s - view.back), {});
            this.camTarget.set(back.x + back.leftX * this.bike.across * 0.5, back.y + view.up, back.z + back.leftZ * this.bike.across * 0.5);
            const ahead = this.lane.sample(this.bike.s + view.look, {});
            this.look.set(ahead.x, ahead.y + 0.6, ahead.z).lerp(bike, 0.35);
        } else if (view.id === 'top') {
            const top = this.lane.at(view.s, view.across, view.up, {});
            this.camTarget.set(top.x, top.y, top.z);
            this.look.set(bike.x, bike.y + 0.9, bike.z);
            // The lens closes in to keep him about frameM of the picture's height
            const d = this.camTarget.distanceTo(this.look);
            fov = Math.max(view.fovFar, Math.min(view.fovNear, 2 * Math.atan(view.frameM / 2 / Math.max(1, d)) * 180 / Math.PI * 1.6));
            blend = 1;
        } else {
            const ahead = this.lane.sample(this.bike.s + view.ahead, {});
            this.camTarget.set(ahead.x + ahead.leftX * 0.8, ahead.y + view.up, ahead.z + ahead.leftZ * 0.8);
            this.look.set(bike.x, bike.y + 0.8, bike.z);
        }
        cam.position.lerp(this.camTarget, blend);
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
