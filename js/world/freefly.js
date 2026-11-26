// The free-fly camera of debug mode: a camera of its own that moves along its six axes anywhere over a world, while
// the ride holds still under it. Game opens it with KEY in a world ride with `?debug` only (Game.openFreeFly); its bar
// is a dialog of the stack (js/modals.js), so no other key of the page fires while it flies, and the world streams
// round this camera instead of the bike (Game.stepFreeFly). No THREE and no DOM but the bar.
//
// The camera's turn is yaw about the world's up, then pitch, then roll about its own forward (Euler order YXZ, as
// three's camera reads it): a roll stays a roll and no turn piles up into another. The moves are along the camera's own
// axes. Each move and each key turn eases to its target at a rate (a little inertia), on the exact exponential, so a
// second of flight goes the same way at any frame rate.
class FreeFly {
    static get KEY() { return 'KeyL'; }

    // The base speed (m/s): from min to max, a wheel step multiplies it by step; Shift moves at fast x, Alt at slow x
    static get SPEED() {
        return Object.freeze({ min: 2, max: 500, start: 20, step: 1.25, fast: 5, slow: 0.2 });
    }

    // Ease rates (1/s) of the moves and of the key turns; turn rates (rad/s) of a held key; radians a mouse pixel
    // turns; the most the camera pitches up or down; the stick's dead zone
    static get EASE() { return Object.freeze({ move: 4, turn: 10 }); }
    static get TURN() { return Object.freeze({ keyRad: 1.1, rollRad: 1.2, mouseRad: 0.0022, padRad: 1.6, pitchMax: 1.55, dead: 0.15 }); }

    // Over the ground by this much, with "keep above ground" on
    static get CLEAR_M() { return 2; }

    // The LV95 origin of a world whose manifest names none (x = E - e0, z = -(N - n0))
    static get ORIGIN() { return Object.freeze({ e0: 2688000, n0: 1165000 }); }

    // The keys, by what they do: [codes, label]. The help line is built from these
    static get BINDINGS() {
        return Object.freeze({
            forward: ['KeyW'], back: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
            up: ['KeyR', 'Space'], down: ['KeyF', 'KeyC'],
            yawLeft: ['ArrowLeft'], yawRight: ['ArrowRight'], pitchUp: ['ArrowUp'], pitchDown: ['ArrowDown'],
            rollLeft: ['KeyQ'], rollRight: ['KeyE'], level: ['KeyX'],
            fast: ['ShiftLeft', 'ShiftRight'], slow: ['AltLeft', 'AltRight'],
            slower: ['BracketLeft'], faster: ['BracketRight']
        });
    }

    static get HELP() {
        return 'WASD move · R/Space up · F/C down · arrows or mouse (click) turn · Q/E roll · X level · Shift fast · Alt slow · wheel or [ ] speed · G ground · B bike here · Esc/L back';
    }

    // Whether a key is one the camera reads (the bar's buttons answer G, B and L themselves)
    static reads(code) {
        return Object.values(FreeFly.BINDINGS).some(codes => codes.includes(code));
    }

    // `pose` {x, y, z, yaw, pitch, roll}; `ground(x, z)` the land's height or NaN
    constructor(pose, ground = () => NaN) {
        this.x = pose.x; this.y = pose.y; this.z = pose.z;
        this.yaw = pose.yaw || 0;
        this.pitch = pose.pitch || 0;
        this.roll = pose.roll || 0;
        this.ground = ground;
        this.speed = FreeFly.SPEED.start;
        this.hold = false;
        this.velocity = { x: 0, y: 0, z: 0 };
        this.spin = { yaw: 0, pitch: 0, roll: 0 };
    }

    // The camera's right, up and forward in the world, for its yaw, pitch and roll (Ry Rx Rz on x, y and -z)
    axes() {
        const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
        const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
        const cr = Math.cos(this.roll), sr = Math.sin(this.roll);
        const turn = (x, y, z) => {
            const y1 = y * cp - z * sp, z1 = y * sp + z * cp;
            return { x: x * cy + z1 * sy, y: y1, z: -x * sy + z1 * cy };
        };
        return { right: turn(cr, sr, 0), up: turn(-sr, cr, 0), forward: turn(0, 0, -1) };
    }

    // One wheel notch or bracket key: `steps` > 0 faster, < 0 slower, within SPEED.min to SPEED.max
    scaleSpeed(steps) {
        const S = FreeFly.SPEED;
        this.speed = Math.max(S.min, Math.min(S.max, this.speed * Math.pow(S.step, steps)));
        return this.speed;
    }

    level() {
        this.roll = 0;
        this.spin.roll = 0;
    }

    // What a set of held keys asks for: {move: {x, y, z}, turn: {yaw, pitch, roll}, fast, slow}. `held` has a key's
    // code when it is down
    static controlsOf(held) {
        const B = FreeFly.BINDINGS;
        const on = name => B[name].some(code => held[code]);
        const axis = (plus, minus) => (on(plus) ? 1 : 0) - (on(minus) ? 1 : 0);
        return {
            move: { x: axis('right', 'left'), y: axis('up', 'down'), z: axis('forward', 'back') },
            turn: { yaw: axis('yawLeft', 'yawRight'), pitch: axis('pitchUp', 'pitchDown'), roll: axis('rollLeft', 'rollRight') },
            fast: on('fast'),
            slow: on('slow')
        };
    }

    // A standard gamepad adds to the keys: the left stick moves, the right stick turns, the triggers go down (left)
    // and up (right), the bumpers roll. `pad` is navigator.getGamepads()[i]
    static addPad(controls, pad) {
        if (!pad || !pad.connected || !pad.axes || pad.axes.length < 4) return controls;
        const dead = v => (Math.abs(v) < FreeFly.TURN.dead ? 0 : v);
        const press = i => (pad.buttons[i] ? (pad.buttons[i].value || (pad.buttons[i].pressed ? 1 : 0)) : 0);
        const clamp = v => Math.max(-1, Math.min(1, v));
        controls.move.x = clamp(controls.move.x + dead(pad.axes[0]));
        controls.move.z = clamp(controls.move.z - dead(pad.axes[1]));
        controls.move.y = clamp(controls.move.y + press(7) - press(6));
        controls.turn.yaw = clamp(controls.turn.yaw - dead(pad.axes[2]) * FreeFly.TURN.padRad / FreeFly.TURN.keyRad);
        controls.turn.pitch = clamp(controls.turn.pitch - dead(pad.axes[3]) * FreeFly.TURN.padRad / FreeFly.TURN.keyRad);
        controls.turn.roll = clamp(controls.turn.roll + press(4) - press(5));
        return controls;
    }

    // One frame of `dt` seconds. `controls` as controlsOf gives; `look` {yaw, pitch} radians the mouse turned since
    // the last frame. A value v that eases to the target T at rate k is, after dt: T + (v - T) e^(-k dt), and the
    // distance it covers T dt + (v - T)(1 - e^(-k dt)) / k: exact, so frames of any length add up to the same flight
    step(dt, controls, look = null) {
        if (!(dt > 0)) return;
        const E = FreeFly.EASE, T = FreeFly.TURN, S = FreeFly.SPEED;
        const ease = (v, target, k) => {
            const e = Math.exp(-k * dt);
            return { v: target + (v - target) * e, d: target * dt + (v - target) * (1 - e) / k };
        };

        const rates = { yaw: controls.turn.yaw * T.keyRad, pitch: controls.turn.pitch * T.keyRad, roll: controls.turn.roll * T.rollRad };
        for (const name of ['yaw', 'pitch', 'roll']) {
            const step = ease(this.spin[name], rates[name], E.turn);
            this.spin[name] = step.v;
            this[name] += step.d;
        }
        if (look) {
            this.yaw += look.yaw || 0;
            this.pitch += look.pitch || 0;
        }
        if (Math.abs(this.pitch) > T.pitchMax) {
            this.pitch = Math.sign(this.pitch) * T.pitchMax;
            this.spin.pitch = 0;
        }
        this.yaw = FreeFly.wrap(this.yaw);
        this.roll = FreeFly.wrap(this.roll);

        const m = controls.move, size = Math.hypot(m.x, m.y, m.z);
        const scale = (size > 1 ? 1 / size : 1) * this.speed * (controls.fast ? S.fast : controls.slow ? S.slow : 1);
        const { right, up, forward } = this.axes();
        const target = {
            x: (right.x * m.x + up.x * m.y + forward.x * m.z) * scale,
            y: (right.y * m.x + up.y * m.y + forward.y * m.z) * scale,
            z: (right.z * m.x + up.z * m.y + forward.z * m.z) * scale
        };
        for (const k of ['x', 'y', 'z']) {
            const step = ease(this.velocity[k], target[k], E.move);
            this.velocity[k] = step.v;
            this[k] += step.d;
        }

        if (this.hold) {
            const floor = this.ground(this.x, this.z);
            if (Number.isFinite(floor) && this.y < floor + FreeFly.CLEAR_M) {
                this.y = floor + FreeFly.CLEAR_M;
                this.velocity.y = Math.max(0, this.velocity.y);
            }
        }
    }

    static wrap(angle) {
        return angle - 2 * Math.PI * Math.floor((angle + Math.PI) / (2 * Math.PI));
    }

    // The pose as a three Euler takes it (order YXZ): {x, y, z, pitch, yaw, roll}
    pose() {
        return { x: this.x, y: this.y, z: this.z, yaw: this.yaw, pitch: this.pitch, roll: this.roll };
    }

    // The line under the help: speed, place, LV95 and the nearest ride s. `origin` {e0, n0}; `s` the nearest ride s
    // or null
    readout(origin, s) {
        const o = origin || FreeFly.ORIGIN, round = v => Math.round(v);
        const e = o.e0 + this.x, n = o.n0 - this.z;
        const parts = [
            `${round(this.speed)} m/s`,
            `x ${round(this.x)} y ${round(this.y)} z ${round(this.z)}`,
            `E ${round(e)} N ${round(n)} H ${round(this.y)} m`,
            Number.isFinite(s) ? `ride s ${round(s)}` : 'no ride',
            this.hold ? 'above ground' : 'free'
        ];
        return { e, n, h: this.y, s, text: parts.join(' · ') };
    }

    // The bar: a dialog at the foot of the screen, with the help line, the readout and three buttons. `act(name)`
    // for each: ground, bike, done
    static bar(doc, act) {
        const box = doc.createElement('div');
        box.id = 'free-fly';
        box.className = 'free-fly-bar panel';
        box.setAttribute('aria-label', 'Free-fly camera');
        const help = doc.createElement('p');
        help.className = 'free-fly-help';
        help.textContent = FreeFly.HELP;
        const readout = doc.createElement('p');
        readout.className = 'free-fly-readout';
        readout.dataset.flyReadout = '';
        const buttons = doc.createElement('div');
        buttons.className = 'free-fly-buttons';
        for (const [name, keys, text] of [
            ['ground', 'KeyG', 'Keep above ground (G)'],
            ['bike', 'KeyB', 'Put the bike here (B)'],
            ['done', `Escape,${FreeFly.KEY}`, 'Back to the ride (Esc)']
        ]) {
            const button = doc.createElement('button');
            button.type = 'button';
            button.className = name === 'done' ? 'btn btn-primary' : 'btn';
            button.dataset.fly = name;
            button.dataset.key = keys;
            button.textContent = text;
            button.addEventListener('click', (event) => {
                event.stopPropagation();
                act(name);
            });
            buttons.appendChild(button);
        }
        box.append(help, readout, buttons);
        return box;
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { FreeFly };
