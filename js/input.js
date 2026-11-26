// The steer keys, eased for a world ride (WorldPhysics.steerKeys; the classic legs keep steeringSmoothing). A key is on
// or off, and the world's bike leans at a rate set by the steering, so a rider who taps a key to hold a line gave it
// full rate in, the self-righting out, full rate in: the lean rocked by 4 to 6 degrees and the drawn bar with it.
// Each change of the keys is a straight ramp of the steering instead, over keyS, or over featherS when the two
// changes before it came within featherGapS of each other (the rider is tapping). Tapped keys then give nearly their
// mean, a held key and a flick answer as fast as before, and a ramp gives the lean a press of its length gave
// before, however long the ramp. No DOM: tests/unit/world-steer-ease.test.js rides it
class SteerEase {
    constructor() {
        this.reset();
    }

    reset() {
        this.key = 0;
        this.base = 0;
        this.ramps = [];
        this.since = Infinity;
        this.before = Infinity;
    }

    // The keys are at `key` (-1, 0 or 1) from now on
    turn(key, ease) {
        if (key === this.key) return;
        const tapping = this.since < ease.featherGapS && this.before < ease.featherGapS;
        this.ramps.push({ step: key - this.key, over: tapping ? ease.featherS : ease.keyS, age: 0 });
        this.key = key;
        this.before = this.since;
        this.since = 0;
    }

    advance(seconds) {
        if (!(seconds > 0)) return;
        this.since += seconds;
        for (const ramp of this.ramps) ramp.age += seconds;
        while (this.ramps.length && this.ramps[0].age >= this.ramps[0].over) this.base += this.ramps.shift().step;
    }

    get value() {
        let value = this.base;
        for (const ramp of this.ramps) value += ramp.step * Math.min(1, ramp.age / ramp.over);
        return Math.max(-1, Math.min(1, value));
    }
}

class InputHandler {
    constructor() {
        this.keys = {};
        this.steeringInput = 0;
        this.targetSteeringInput = 0;
        this.throttleInput = 0;
        this.brakeInput = 0;
        this.wheelieInput = 0;
        this.resetPressed = false;
        this.menuReturnPressed = false;
        this.nextLegPressed = false;
        this.soundTogglePressed = false;
        this.checkpointRestartPressed = false;
        this.cameraSwitchPressed = false;
        this.pausePressed = false;
        this.virtualControls = null;
        this.steeringSmoothing = 0.4; // How quickly steering ramps up (0-1, higher = faster)
        this.steerEase = new SteerEase();
        this.steerKeys = null; // WorldPhysics.steerKeys on a world ride (getSteeringInput), null on a leg
        this.menuActive = false; // Track if crash/finish menu is showing
        this.setupEventListeners();
        this.setupMobileControls();
        window.addEventListener('blur', () => this.releaseAllKeys());
    }

    setupEventListeners() {
        document.addEventListener('keydown', (event) => {
            // Typing a leaderboard name must not ride the bike or fire hotkeys
            if (event.target && /^(INPUT|TEXTAREA)$/.test(event.target.tagName)) return;

            this.keys[event.code] = true;
            this.advanceSteerEase();
            this.updateInputs();

            // One-shot actions fire once per press, not on key auto-repeat
            if (event.repeat) return;

            // Highlight virtual controls
            if (this.virtualControls && ['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) {
                this.virtualControls.highlightKey(event.code, true);
            }

            // Check for reset (only when menu is active)
            if (event.code === 'KeyR' && this.menuActive) {
                this.resetPressed = true;
            }

            // Check for menu return (only when menu is active)
            if (event.code === 'KeyM' && this.menuActive) {
                this.menuReturnPressed = true;
            }

            // Check for next leg (only when menu is active)
            if (event.code === 'KeyN' && this.menuActive) {
                this.nextLegPressed = true;
            }

            // Check for sound toggle (only when menu is not active)
            if (event.code === 'KeyM' && !this.menuActive) {
                this.soundTogglePressed = true;
            }

            // Check for checkpoint restart
            if (event.code === 'KeyC') {
                this.checkpointRestartPressed = true;
                console.log('C key pressed - checkpoint restart triggered');
            }

            // A loaf thrown to the left or the right (the hill ride's deliveries; nothing else reads them)
            if (event.code === 'KeyQ') this.throwPressed = 1;
            if (event.code === 'KeyE') this.throwPressed = -1;

            // Check for camera mode switch
            if (event.code === 'KeyZ') {
                this.cameraSwitchPressed = true;
            }

            // Check for pause toggle; Escape pauses too, and the pause panel is the way to the menu. Once a dialog
            // is open the dialog stack (js/modals.js) takes every key, so these only ever pause a ride.
            if (event.code === 'KeyP' || event.code === 'Escape') {
                this.pausePressed = true;
            }

            // Test key to force falling
            if (event.code === 'KeyF') {
                console.log('F key pressed - forcing fall test');
                // This will be handled in main.js
            }
        });

        document.addEventListener('keyup', (event) => {
            this.keys[event.code] = false;
            this.advanceSteerEase();
            this.updateInputs();

            // Unhighlight virtual controls
            if (this.virtualControls && ['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) {
                this.virtualControls.highlightKey(event.code, false);
            }

            // A one-shot press stays until the frame reads it (check*): a tap shorter than a frame, which a slow
            // frame makes common, would otherwise be lost. clearActions drops presses nobody read.
        });
    }

    // A lost keyup (Alt-Tab while holding a key) would leave it held forever
    releaseAllKeys() {
        this.keys = {};
        this.clearActions();
        this.updateInputs();
    }

    // Drops the one-shot presses not yet read, and leaves held keys (steering, throttle) alone. A box that
    // held the game calls it, so a key pressed while it was open does not fire once the game goes on.
    clearActions() {
        this.resetPressed = false;
        this.menuReturnPressed = false;
        this.nextLegPressed = false;
        this.soundTogglePressed = false;
        this.checkpointRestartPressed = false;
        this.cameraSwitchPressed = false;
        this.pausePressed = false;
    }

    updateInputs() {
        // Check both keyboard and virtual controls
        // WASD keys
        const keyA = this.keys['KeyA'] || (this.virtualControls && this.virtualControls.getKey('KeyA'));
        const keyD = this.keys['KeyD'] || (this.virtualControls && this.virtualControls.getKey('KeyD'));
        const keyW = this.keys['KeyW'] || (this.virtualControls && this.virtualControls.getKey('KeyW'));
        const keyS = this.keys['KeyS'] || (this.virtualControls && this.virtualControls.getKey('KeyS'));

        // Arrow keys
        const keyLeft = this.keys['ArrowLeft'];
        const keyRight = this.keys['ArrowRight'];
        const keyUp = this.keys['ArrowUp'];
        const keyDown = this.keys['ArrowDown'];

        // Steering (inverted) - combine WASD and arrow keys
        // Set target steering value
        this.targetSteeringInput = 0;
        if (keyA || keyLeft) {
            this.targetSteeringInput = 1;  // A/Left now steers right
        }
        if (keyD || keyRight) {
            this.targetSteeringInput = -1;  // D/Right now steers left
        }

        if (this.steerKeys) this.steerEase.turn(this.targetSteeringInput, this.steerKeys);

        // Steering smoothing happens in getSteeringInput() - updateInputs()
        // runs on every key event and every getter call, so smoothing here
        // made steering response depend on call frequency and frame rate

        // Throttle and brake - combine WASD and arrow keys
        this.throttleInput = (keyW || keyUp) ? 1 : 0;
        this.brakeInput = (keyS || keyDown) ? 1 : 0;
        
        // Wheelie input - Shift key or Space key (including virtual)
        const virtualSpace = this.virtualControls ? this.virtualControls.getKey('Space') : false;
        this.wheelieInput = (this.keys['ShiftLeft'] || this.keys['ShiftRight'] || this.keys['Space'] || virtualSpace) ? 1 : 0;
    }

    // The eased keys run on their own clock, moved on at each key event as well as each frame, so a tap is as long
    // as the rider made it and not a whole number of frames. A stall (a pause, a hidden tab) counts as 0.1 s
    advanceSteerEase() {
        const now = performance.now();
        if (this.steerKeys) this.steerEase.advance(Math.min((now - (this.steerEaseTime || now)) / 1000, 0.1));
        this.steerEaseTime = now;
    }

    // `ease` is WorldPhysics.steerKeys on a world ride: the keys are eased by SteerEase. With none (a classic leg,
    // whose lean has its own momentum) the steering is smoothed as it always was
    getSteeringInput(ease = null) {
        if (ease !== this.steerKeys) {
            // Between a leg and a world the keys start again; another set of the world's values (the tuning's,
            // js/tuning.js) only changes the ramps to come
            if (!ease || !this.steerKeys) this.steerEase.reset();
            this.steerKeys = ease;
        }
        // Update inputs before returning (for virtual controls and smoothing)
        this.advanceSteerEase();
        this.updateInputs();

        // Smooth steering towards target, scaled by elapsed time so the ramp
        // rate is the same at any display refresh rate
        const now = performance.now();
        const elapsed = Math.min((now - (this.lastSteeringTime || now)) / 1000, 0.1);
        this.lastSteeringTime = now;
        if (ease) {
            this.steeringInput = this.steerEase.value;
            return this.steeringInput;
        }
        const blend = 1 - Math.pow(1 - this.steeringSmoothing, elapsed * 60);
        this.steeringInput = this.steeringInput + (this.targetSteeringInput - this.steeringInput) * blend;

        return this.steeringInput;
    }
    
    getThrottleInput() {
        // Update inputs before returning (for virtual controls)
        if (this.virtualControls) {
            this.updateInputs();
        }
        return this.throttleInput;
    }
    
    getBrakeInput() {
        // Update inputs before returning (for virtual controls)
        if (this.virtualControls) {
            this.updateInputs();
        }
        return this.brakeInput;
    }
    
    getWheelieInput() {
        // Update inputs before returning
        if (this.virtualControls) {
            this.updateInputs();
        }
        return this.wheelieInput;
    }
    
    checkReset() {
        if (this.resetPressed) {
            this.resetPressed = false;
            return true;
        }
        return false;
    }

    checkMenuReturn() {
        if (this.menuReturnPressed) {
            this.menuReturnPressed = false;
            return true;
        }
        return false;
    }

    checkNextLeg() {
        if (this.nextLegPressed) {
            this.nextLegPressed = false;
            return true;
        }
        return false;
    }

    checkSoundToggle() {
        if (this.soundTogglePressed) {
            this.soundTogglePressed = false;
            return true;
        }
        return false;
    }

    checkCheckpointRestart() {
        if (this.checkpointRestartPressed) {
            this.checkpointRestartPressed = false;
            console.log('Checkpoint restart triggered');
            return true;
        }
        return false;
    }
    
    checkCameraSwitch() {
        // Check virtual control camera button
        if (this.virtualControls && this.virtualControls.getKey('KeyZ')) {
            this.virtualControls.touches['KeyZ'] = false; // Clear after use
            return true;
        }

        if (this.cameraSwitchPressed) {
            this.cameraSwitchPressed = false;
            return true;
        }
        return false;
    }

    // A throw asked for since the last frame: 1 to the left (Q), -1 to the right (E), 0 for none; the touch buttons too
    checkThrow() {
        const touches = this.virtualControls && this.virtualControls.touches;
        let side = this.throwPressed || 0;
        if (touches && touches.KeyQ) side = 1;
        if (touches && touches.KeyE) side = -1;
        if (touches) touches.KeyQ = touches.KeyE = false;
        this.throwPressed = 0;
        return side;
    }

    checkPause() {
        // The touch pause button (js/virtualcontrols.js), cleared once read as the camera button is
        if (this.virtualControls && this.virtualControls.getKey('KeyP')) {
            this.virtualControls.touches['KeyP'] = false;
            return true;
        }
        if (this.pausePressed) {
            this.pausePressed = false;
            return true;
        }
        return false;
    }

    // On-screen buttons only on touch-first devices; a touch screen on a
    // laptop gets them at its first touch
    setupMobileControls() {
        if (typeof VirtualControls === 'undefined') return;
        const create = () => {
            if (!this.virtualControls) this.virtualControls = new VirtualControls();
        };
        if (typeof HudRules !== 'undefined' && !HudRules.isTouch(window)) {
            window.addEventListener('touchstart', create, { once: true, passive: true });
            return;
        }
        create();
    }

    setMenuActive(active) {
        this.menuActive = active;
    }
}