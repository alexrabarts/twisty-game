// On-screen thumb controls for touch devices. Layout, sizes and safe-area
// insets live in css/ui.css, so rotating the phone needs no rebuild.
class VirtualControls {
    constructor() {
        try {
            this.touches = {};
            this.buttons = {};
            this.createControls();
        } catch (error) {
            console.error('VirtualControls initialization error:', error);
            throw error;
        }
    }

    createControls() {
        const icon = name => (typeof UiIcons !== 'undefined' ? UiIcons.svg(name, 'control-icon') : '');

        const left = document.createElement('div');
        left.className = 'virtual-controls-left';
        const right = document.createElement('div');
        right.className = 'virtual-controls-right';

        // Left thumb steers; right thumb has wheelie, throttle and brake from top to bottom
        const buttons = [
            { key: 'KeyA', kind: 'steer', label: 'Steer left', icon: 'left', container: left },
            { key: 'KeyD', kind: 'steer', label: 'Steer right', icon: 'right', container: left },
            { key: 'Space', kind: 'wheelie', label: 'Wheelie', icon: 'wheelie', text: 'WHEELIE', container: right },
            { key: 'KeyW', kind: 'throttle', label: 'Throttle', icon: 'up', text: 'GAS', container: right },
            { key: 'KeyS', kind: 'brake', label: 'Brake', icon: 'down', text: 'BRAKE', container: right }
        ];

        buttons.forEach(spec => {
            const button = document.createElement('div');
            button.className = `virtual-button ${spec.kind}`;
            button.setAttribute('role', 'button');
            button.setAttribute('aria-label', spec.label);
            button.innerHTML = `${icon(spec.icon)}${spec.text ? `<span>${spec.text}</span>` : ''}`;
            this.bindHold(button, spec.key);
            this.buttons[spec.key] = button;
            spec.container.appendChild(button);
        });

        const camera = document.createElement('div');
        camera.className = 'virtual-button-camera';
        camera.setAttribute('role', 'button');
        camera.setAttribute('aria-label', 'Change camera');
        camera.innerHTML = icon('camera');
        this.bindTap(camera, 'KeyZ');
        this.buttons.KeyZ = camera;

        document.body.appendChild(left);
        document.body.appendChild(right);
        document.body.appendChild(camera);
        document.body.classList.add('touch');
    }

    // Held for as long as the finger or mouse is down
    bindHold(button, key) {
        const press = event => {
            event.preventDefault();
            this.touches[key] = true;
            button.classList.add('pressed');
        };
        const release = event => {
            if (event.cancelable) event.preventDefault();
            this.touches[key] = false;
            button.classList.remove('pressed');
        };
        button.addEventListener('touchstart', press);
        button.addEventListener('touchend', release);
        button.addEventListener('touchcancel', release);
        button.addEventListener('mousedown', press);
        button.addEventListener('mouseup', release);
        button.addEventListener('mouseleave', release);
    }

    // One press; InputHandler clears it once read, the timeout covers a missed read
    bindTap(button, key) {
        const press = event => {
            event.preventDefault();
            this.touches[key] = true;
            button.classList.add('pressed');
        };
        const release = event => {
            if (event.cancelable) event.preventDefault();
            setTimeout(() => {
                this.touches[key] = false;
                button.classList.remove('pressed');
            }, 100);
        };
        button.addEventListener('touchstart', press);
        button.addEventListener('touchend', release);
        button.addEventListener('touchcancel', release);
        button.addEventListener('mousedown', press);
        button.addEventListener('mouseup', release);
    }

    getKey(keyCode) {
        return this.touches[keyCode] || false;
    }

    highlightKey(keyCode, active) {
        const button = this.buttons[keyCode];
        if (button) button.classList.toggle('pressed', active);
    }

    destroy() {
        document.querySelectorAll('.virtual-controls-left, .virtual-controls-right, .virtual-button-camera')
            .forEach(el => el.remove());
        document.body.classList.remove('touch');
        this.buttons = {};
        this.touches = {};
    }
}
