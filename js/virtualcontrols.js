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
        // Calculate responsive sizes based on viewport
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;
        const isMobileLandscape = viewportWidth > viewportHeight && viewportHeight < 500;

        // Split-hand motorcycle layout: Left = Steering, Right = Throttle/Brake
        const buttonSize = isMobileLandscape ? 60 : Math.min(70, viewportHeight * 0.08);
        const gap = 10;
        const tallButtonHeight = buttonSize * 2 + gap; // For W/S buttons

        // Calculate safe margins
        const safeBottomMargin = Math.min(20, viewportHeight * 0.02);
        const bottomPosition = safeBottomMargin;
        
        // LEFT SIDE - Steering buttons (A/D)
        const leftContainer = document.createElement('div');
        leftContainer.className = 'virtual-controls-left';
        leftContainer.style.cssText = `
            position: fixed;
            bottom: ${bottomPosition}px;
            left: ${safeBottomMargin}px;
            z-index: 1000;
            touch-action: none;
            user-select: none;
        `;
        
        // RIGHT SIDE - Throttle/Brake buttons (W/S) - SWAPPED FOR MOTORCYCLE STYLE
        const rightContainer = document.createElement('div');
        rightContainer.className = 'virtual-controls-right';
        rightContainer.style.cssText = `
            position: fixed;
            bottom: ${bottomPosition}px;
            right: ${safeBottomMargin}px;
            z-index: 1000;
            touch-action: none;
            user-select: none;
        `;
        
        // Button definitions with new split layout
        const buttons = [
            // LEFT SIDE - Steering
            { key: 'KeyA', label: '← STEER', container: leftContainer, x: 0, y: 0, width: buttonSize, height: buttonSize },
            { key: 'KeyD', label: 'STEER →', container: leftContainer, x: buttonSize + gap, y: 0, width: buttonSize, height: buttonSize },
            
            // RIGHT SIDE - Throttle/Brake
            { key: 'KeyW', label: '↑ THROTTLE', container: rightContainer, x: 0, y: tallButtonHeight/2 + gap/2, width: buttonSize, height: tallButtonHeight/2 - gap/2 },
            { key: 'KeyS', label: '↓ BRAKE', container: rightContainer, x: 0, y: 0, width: buttonSize, height: tallButtonHeight/2 - gap/2 },
            
            // UTILITY - Wheelie button (right side, above throttle)
            { key: 'Space', label: 'WHEELIE', container: rightContainer, x: 0, y: tallButtonHeight + gap * 2, width: buttonSize, height: buttonSize * 0.7 }
        ];
        
        buttons.forEach(btn => {
            const button = document.createElement('div');
            button.className = 'virtual-button';
            button.innerHTML = btn.label;
            
            // Determine button styling based on type
            const isSpaceButton = btn.key === 'Space';
            const isThrottleButton = btn.label.includes('THROTTLE');
            const isBrakeButton = btn.label.includes('BRAKE');
            const isSteerButton = btn.label.includes('STEER');
            
            // Colors
            let bgColor, borderColor, textColor, fontSize;
            if (isSpaceButton) {
                bgColor = 'rgba(255, 200, 0, 0.15)';
                borderColor = 'rgba(255, 200, 0, 0.5)';
                textColor = '#ffc800';
                fontSize = Math.floor(btn.height * 0.2);
            } else if (isThrottleButton) {
                bgColor = 'rgba(0, 255, 100, 0.15)';
                borderColor = 'rgba(0, 255, 100, 0.5)';
                textColor = '#00ff66';
                fontSize = Math.floor(btn.height * 0.18);
            } else if (isBrakeButton) {
                bgColor = 'rgba(255, 50, 50, 0.15)';
                borderColor = 'rgba(255, 50, 50, 0.5)';
                textColor = '#ff5555';
                fontSize = Math.floor(btn.height * 0.18);
            } else if (isSteerButton) {
                bgColor = 'rgba(100, 150, 255, 0.15)';
                borderColor = 'rgba(100, 150, 255, 0.5)';
                textColor = '#6096ff';
                fontSize = Math.floor(btn.height * 0.2);
            } else {
                bgColor = 'rgba(255, 255, 255, 0.1)';
                borderColor = 'rgba(255, 255, 255, 0.3)';
                textColor = 'white';
                fontSize = Math.floor(btn.height * 0.25);
            }
            
            const isRightContainer = btn.container === rightContainer;
            button.style.cssText = `
                position: absolute;
                width: ${btn.width}px;
                height: ${btn.height}px;
                ${isRightContainer ? `right: ${btn.x}px;` : `left: ${btn.x}px;`}
                bottom: ${btn.y}px;
                background: ${bgColor};
                border: 3px solid ${borderColor};
                border-radius: ${isSpaceButton ? '8px' : '12px'};
                color: ${textColor};
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: ${fontSize}px;
                font-weight: bold;
                font-family: monospace;
                cursor: pointer;
                transition: all 0.1s;
                text-align: center;
                line-height: 1.2;
            `;

            // Store button reference
            this.buttons[btn.key] = button;
            
            // Touch events
            button.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.touches[btn.key] = true;
                if (isSpaceButton) {
                    button.style.background = 'rgba(255, 200, 0, 0.4)';
                    button.style.borderColor = 'rgba(255, 200, 0, 0.7)';
                } else {
                    button.style.background = 'rgba(255, 255, 255, 0.3)';
                    button.style.borderColor = 'rgba(255, 255, 255, 0.6)';
                }
            });
            
            button.addEventListener('touchend', (e) => {
                e.preventDefault();
                this.touches[btn.key] = false;
                if (isSpaceButton) {
                    button.style.background = 'rgba(255, 200, 0, 0.1)';
                    button.style.borderColor = 'rgba(255, 200, 0, 0.4)';
                } else {
                    button.style.background = 'rgba(255, 255, 255, 0.1)';
                    button.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                }
            });
            
            button.addEventListener('touchcancel', (e) => {
                e.preventDefault();
                this.touches[btn.key] = false;
                if (isSpaceButton) {
                    button.style.background = 'rgba(255, 200, 0, 0.1)';
                    button.style.borderColor = 'rgba(255, 200, 0, 0.4)';
                } else {
                    button.style.background = 'rgba(255, 255, 255, 0.1)';
                    button.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                }
            });
            
            // Mouse events for testing
            button.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this.touches[btn.key] = true;
                button.style.background = 'rgba(255, 255, 255, 0.3)';
                button.style.borderColor = 'rgba(255, 255, 255, 0.6)';
            });
            
            button.addEventListener('mouseup', (e) => {
                e.preventDefault();
                this.touches[btn.key] = false;
                button.style.background = 'rgba(255, 255, 255, 0.1)';
                button.style.borderColor = 'rgba(255, 255, 255, 0.3)';
            });
            
            button.addEventListener('mouseleave', (e) => {
                this.touches[btn.key] = false;
                button.style.background = 'rgba(255, 255, 255, 0.1)';
                button.style.borderColor = 'rgba(255, 255, 255, 0.3)';
            });
            
            btn.container.appendChild(button);
        });
        
        // Camera button (Z)
        const cameraButtonSize = isMobileLandscape ? 60 : Math.min(80, viewportHeight * 0.09);
        const utilityButtonsOffset = buttonSize + gap + safeBottomMargin;
        const cameraButton = document.createElement('div');
        cameraButton.className = 'virtual-button-camera';
        cameraButton.innerHTML = 'Z';
        cameraButton.style.cssText = `
            position: fixed;
            bottom: ${bottomPosition}px;
            right: ${utilityButtonsOffset}px;
            width: ${cameraButtonSize}px;
            height: ${cameraButtonSize}px;
            background: rgba(100, 200, 255, 0.2);
            border: 2px solid rgba(100, 200, 255, 0.4);
            border-radius: 50%;
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: ${Math.floor(cameraButtonSize * 0.35)}px;
            font-weight: bold;
            font-family: monospace;
            z-index: 1000;
            cursor: pointer;
            touch-action: none;
            user-select: none;
            transition: background 0.1s;
        `;

        // Store camera button reference
        this.buttons['KeyZ'] = cameraButton;
        
        cameraButton.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.touches['KeyZ'] = true;
            cameraButton.style.background = 'rgba(100, 200, 255, 0.5)';
            cameraButton.style.borderColor = 'rgba(100, 200, 255, 0.7)';
        });
        
        cameraButton.addEventListener('touchend', (e) => {
            e.preventDefault();
            setTimeout(() => {
                this.touches['KeyZ'] = false;
                cameraButton.style.background = 'rgba(100, 200, 255, 0.2)';
                cameraButton.style.borderColor = 'rgba(100, 200, 255, 0.4)';
            }, 100);
        });
        
        cameraButton.addEventListener('touchcancel', (e) => {
            e.preventDefault();
            this.touches['KeyZ'] = false;
            cameraButton.style.background = 'rgba(100, 200, 255, 0.2)';
            cameraButton.style.borderColor = 'rgba(100, 200, 255, 0.4)';
        });
        
        // Mouse events for testing
        cameraButton.addEventListener('mousedown', (e) => {
            e.preventDefault();
            this.touches['KeyZ'] = true;
            cameraButton.style.background = 'rgba(100, 200, 255, 0.5)';
            cameraButton.style.borderColor = 'rgba(100, 200, 255, 0.7)';
        });
        
        cameraButton.addEventListener('mouseup', (e) => {
            e.preventDefault();
            setTimeout(() => {
                this.touches['KeyZ'] = false;
                cameraButton.style.background = 'rgba(100, 200, 255, 0.2)';
                cameraButton.style.borderColor = 'rgba(100, 200, 255, 0.4)';
            }, 100);
        });

        document.body.appendChild(leftContainer);
        document.body.appendChild(rightContainer);
        document.body.appendChild(cameraButton);
        
        // Instructions - position above controls
        const controlsHeight = tallButtonHeight;
        const instructionsBottom = bottomPosition + controlsHeight + 10;
        const instructions = document.createElement('div');
        instructions.style.cssText = `
            position: fixed;
            left: 50%;
            bottom: ${Math.min(instructionsBottom, viewportHeight - 50)}px;
            transform: translateX(-50%);
            color: rgba(255, 255, 255, 0.6);
            font-size: ${isMobileLandscape ? '10px' : '12px'};
            text-align: center;
            z-index: 999;
            font-family: monospace;
            pointer-events: none;
        `;
        instructions.innerHTML = 'Left: Steering | Right: ↓Throttle ↑Brake<br>Z: Camera';
        document.body.appendChild(instructions);
        
        // Handle orientation changes
        this.handleOrientationChange = () => {
            setTimeout(() => {
                this.destroy();
                this.createControls();
            }, 100);
        };
        window.addEventListener('orientationchange', this.handleOrientationChange);

        // Handle resize
        this.handleResize = () => {
            clearTimeout(this.resizeTimeout);
            this.resizeTimeout = setTimeout(() => {
                this.destroy();
                this.createControls();
            }, 250);
        };
        window.addEventListener('resize', this.handleResize);
    }
    
    getKey(keyCode) {
        return this.touches[keyCode] || false;
    }

    highlightKey(keyCode, active) {
        const button = this.buttons[keyCode];
        if (button) {
            if (active) {
                button.style.background = 'rgba(255, 255, 255, 0.3)';
                button.style.borderColor = 'rgba(255, 255, 255, 0.6)';
            } else {
                button.style.background = 'rgba(255, 255, 255, 0.1)';
                button.style.borderColor = 'rgba(255, 255, 255, 0.3)';
            }
        }
    }
    
    destroy() {
        const leftControls = document.querySelector('.virtual-controls-left');
        const rightControls = document.querySelector('.virtual-controls-right');
        const instructions = document.querySelector('[style*="Throttle"]');
        if (leftControls) leftControls.remove();
        if (rightControls) rightControls.remove();
        if (instructions) instructions.remove();
        
        // Clean up event listeners
        window.removeEventListener('orientationchange', this.handleOrientationChange);
        window.removeEventListener('resize', this.handleResize);
        clearTimeout(this.resizeTimeout);
    }
}