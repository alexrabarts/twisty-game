// Photo mode in free roam: the ride stops, the HUD goes, and a camera of the rider's own goes round the bike. It opens
// with KEY while riding or from the pause panel (Photo (V)); its bar is a dialog of the stack (js/modals.js), so its
// buttons hold the keys: A and D (or the arrows) go round, W and S up and down, + and - closer and further, C saves the
// picture (the canvas alone, as a PNG), Escape or V go back to the ride.
//
// The camera stays out of the ground (ground() + CLEAR_M at its own place) and looks at the rider's middle.
class PhotoMode {
    static get KEY() { return 'KeyV'; }
    static get STEP() {
        return Object.freeze({ yaw: Math.PI / 12, pitch: 0.08, distance: 1.2 });
    }
    static get LIMITS() {
        return Object.freeze({ pitchMin: -0.15, pitchMax: 1.35, distanceMin: 2.5, distanceMax: 30 });
    }
    static get CLEAR_M() { return 0.3; }
    static get LOOK_UP_M() { return 0.9; }

    // `bike` {position, yawAngle}; `ground(x, z)` the ground's height or NaN. Starts behind the bike, as the chase does
    constructor(bike, ground) {
        this.bike = bike;
        this.ground = ground;
        this.yaw = 0;
        this.pitch = 0.25;
        this.distance = 7;
    }

    orbit(turns) { this.yaw += turns * PhotoMode.STEP.yaw; }

    tilt(steps) {
        const L = PhotoMode.LIMITS;
        this.pitch = Math.max(L.pitchMin, Math.min(L.pitchMax, this.pitch + steps * PhotoMode.STEP.pitch));
    }

    zoom(steps) {
        const L = PhotoMode.LIMITS;
        this.distance = Math.max(L.distanceMin, Math.min(L.distanceMax, this.distance + steps * PhotoMode.STEP.distance));
    }

    // Where the camera stands and what it looks at: {x, y, z, look: {x, y, z}}
    pose() {
        const p = this.bike.position, heading = this.bike.yawAngle + Math.PI + this.yaw;
        const flat = this.distance * Math.cos(this.pitch);
        const look = { x: p.x, y: p.y + PhotoMode.LOOK_UP_M, z: p.z };
        const at = { x: p.x + flat * Math.sin(heading), y: look.y + this.distance * Math.sin(this.pitch), z: p.z + flat * Math.cos(heading) };
        const floor = this.ground(at.x, at.z);
        if (Number.isFinite(floor)) at.y = Math.max(at.y, floor + PhotoMode.CLEAR_M);
        return { ...at, look };
    }

    apply(camera) {
        const pose = this.pose();
        camera.position.set(pose.x, pose.y, pose.z);
        camera.up.set(0, 1, 0);
        camera.lookAt(pose.look.x, pose.look.y, pose.look.z);
    }

    // The bar: a dialog at the foot of the screen. `act(name)` for each button: left, right, up, down, closer,
    // further, save, done
    static bar(doc, act) {
        const box = doc.createElement('div');
        box.id = 'photo-bar';
        box.className = 'photo-bar panel';
        box.setAttribute('aria-label', 'Photo mode');
        const buttons = [
            ['left', 'KeyA,ArrowLeft', '◀ Round (A)'],
            ['right', 'KeyD,ArrowRight', 'Round ▶ (D)'],
            ['up', 'KeyW,ArrowUp', 'Up (W)'],
            ['down', 'KeyS,ArrowDown', 'Down (S)'],
            ['closer', 'Equal,NumpadAdd', 'Closer (+)'],
            ['further', 'Minus,NumpadSubtract', 'Further (−)'],
            ['save', 'KeyC', 'Save picture (C)'],
            ['done', `Escape,${PhotoMode.KEY}`, 'Back to the ride (Esc)']
        ];
        for (const [name, keys, text] of buttons) {
            const button = doc.createElement('button');
            button.type = 'button';
            button.className = name === 'save' ? 'btn btn-primary' : 'btn';
            button.dataset.photo = name;
            button.dataset.key = keys;
            button.textContent = text;
            button.addEventListener('click', (event) => {
                event.stopPropagation();
                act(name);
            });
            box.appendChild(button);
        }
        return box;
    }

    // A file name for a saved picture: the time only (no place names)
    static fileName(date) {
        const pad = n => String(n).padStart(2, '0');
        return `twisty-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.png`;
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { PhotoMode };
