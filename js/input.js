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
        this.escapePressed = false;
        this.virtualControls = null;
        this.steeringSmoothing = 0.4; // How quickly steering ramps up (0-1, higher = faster)
        this.menuActive = false; // Track if crash/finish menu is showing
        this.setupEventListeners();
        this.setupMobileControls();
    }

    setupEventListeners() {
        document.addEventListener('keydown', (event) => {
            this.keys[event.code] = true;
            this.updateInputs();

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

            // Check for camera mode switch
            if (event.code === 'KeyZ') {
                this.cameraSwitchPressed = true;
            }

            // Check for pause toggle
            if (event.code === 'KeyP') {
                this.pausePressed = true;
            }

            // Escape brings up the menu mid-race (handled in the game loop)
            if (event.code === 'Escape') {
                this.escapePressed = true;
            }

            // Test key to force falling
            if (event.code === 'KeyF') {
                console.log('F key pressed - forcing fall test');
                // This will be handled in main.js
            }
        });

        document.addEventListener('keyup', (event) => {
            this.keys[event.code] = false;
            this.updateInputs();

            // Unhighlight virtual controls
            if (this.virtualControls && ['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) {
                this.virtualControls.highlightKey(event.code, false);
            }

            if (event.code === 'KeyR') {
                this.resetPressed = false;
            }

            if (event.code === 'KeyM') {
                this.menuReturnPressed = false;
                this.soundTogglePressed = false;
            }

            if (event.code === 'KeyN') {
                this.nextLegPressed = false;
            }

            if (event.code === 'KeyC') {
                this.checkpointRestartPressed = false;
            }

            if (event.code === 'KeyZ') {
                this.cameraSwitchPressed = false;
            }

            if (event.code === 'KeyP') {
                this.pausePressed = false;
            }

            if (event.code === 'Escape') {
                this.escapePressed = false;
            }
        });
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

    getSteeringInput() {
        // Update inputs before returning (for virtual controls and smoothing)
        this.updateInputs();

        // Smooth steering towards target, scaled by elapsed time so the ramp
        // rate is the same at any display refresh rate
        const now = performance.now();
        const elapsed = Math.min((now - (this.lastSteeringTime || now)) / 1000, 0.1);
        this.lastSteeringTime = now;
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

    checkPause() {
        if (this.pausePressed) {
            this.pausePressed = false;
            return true;
        }
        return false;
    }

    // One-shot: true the frame Escape was pressed (used to bail to the menu)
    checkEscape() {
        if (this.escapePressed) {
            this.escapePressed = false;
            return true;
        }
        return false;
    }

    setupMobileControls() {
        // Always create virtual controls for WASD-style on-screen buttons
        if (typeof VirtualControls !== 'undefined') {
            this.virtualControls = new VirtualControls();
        }
    }

    setMenuActive(active) {
        this.menuActive = active;
    }
}