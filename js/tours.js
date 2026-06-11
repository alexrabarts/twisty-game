class TourSystem {
    constructor() {
        this.legs = [
            // Leg 1: Easy warm-up (35 segments = 700m)
            {
                id: 'mountain-dawn',
                name: 'Mountain Dawn',
                description: 'Gentle winding roads through misty mountain passes',
                startSegment: 0,
                endSegment: 34,
                timeOfDay: 'dawn',
                landscapeVariation: 'mountain',
                weather: 'clear',
                weatherIntensity: 0
            },
            // Leg 2: Build confidence (40 segments = 800m)
            {
                id: 'valley-run',
                name: 'Valley Run',
                description: 'Fast flowing sections through sunlit valleys',
                startSegment: 35,
                endSegment: 74,
                timeOfDay: 'golden',
                landscapeVariation: 'valley',
                weather: 'clear',
                weatherIntensity: 0
            },
            // Leg 3: Technical descents (42 segments = 840m)
            {
                id: 'coastal-descent',
                name: 'Coastal Descent',
                description: 'Sweeping descents with ocean views',
                startSegment: 75,
                endSegment: 116,
                timeOfDay: 'twilight',
                landscapeVariation: 'coastal',
                weather: 'clear',
                weatherIntensity: 0
            },
            // Leg 4: First weather challenge - visibility (44 segments = 880m)
            {
                id: 'foggy-gorge',
                name: 'Foggy Gorge',
                description: 'Navigate through dense morning fog and mist',
                startSegment: 117,
                endSegment: 160,
                timeOfDay: 'golden', // Morning light, but foggy
                landscapeVariation: 'valley',
                weather: 'fog',
                weatherIntensity: 1.5
            },
            // Leg 5: Technical hairpins (46 segments = 920m)
            {
                id: 'high-pass',
                name: 'High Pass',
                description: 'Technical hairpins and dramatic elevation changes',
                startSegment: 161,
                endSegment: 206,
                timeOfDay: 'sunset',
                landscapeVariation: 'alpine',
                weather: 'clear',
                weatherIntensity: 0
            },
            // Leg 6: Weather + grip challenge (48 segments = 960m)
            {
                id: 'storm-valley',
                name: 'Storm Valley',
                description: 'Battle heavy rain and wet roads in a valley storm',
                startSegment: 207,
                endSegment: 254,
                timeOfDay: 'twilight', // Dark stormy afternoon
                landscapeVariation: 'valley',
                weather: 'rain',
                weatherIntensity: 0.9
            },
            // Leg 7: Darkness challenge (49 segments = 980m)
            {
                id: 'night-ride',
                name: 'Night Ride',
                description: 'Mixed technical challenges under the stars',
                startSegment: 255,
                endSegment: 303,
                timeOfDay: 'night',
                landscapeVariation: 'mixed',
                weather: 'clear',
                weatherIntensity: 0
            },
            // Leg 8: Ultimate finale - ice and snow (48 segments = 960m)
            {
                id: 'winter-pass',
                name: 'Winter Pass',
                description: 'Conquer icy roads and snowfall in the mountain pass',
                startSegment: 304,
                endSegment: 351,
                timeOfDay: 'twilight', // Overcast winter day
                landscapeVariation: 'alpine',
                weather: 'snow',
                weatherIntensity: 1.0
            }
        ];

        this.currentLeg = null;
    }

    getLegs() {
        return this.legs;
    }

    getLegById(id) {
        return this.legs.find(leg => leg.id === id);
    }

    selectLeg(legId) {
        const leg = this.getLegById(legId);
        if (!leg) {
            console.error('Invalid leg ID:', legId);
            return null;
        }

        this.currentLeg = leg;
        console.log(`Selected leg: ${leg.name} (segments ${leg.startSegment}-${leg.endSegment})`);
        return leg;
    }

    getCurrentLeg() {
        return this.currentLeg;
    }

    getCurrentLegIndex() {
        if (!this.currentLeg) return -1;
        return this.legs.findIndex(leg => leg.id === this.currentLeg.id);
    }

    getNextLeg() {
        const currentIndex = this.getCurrentLegIndex();
        if (currentIndex === -1 || currentIndex >= this.legs.length - 1) {
            return null; // No next leg (on last leg or no leg selected)
        }
        return this.legs[currentIndex + 1];
    }

    getFirstLeg() {
        return this.legs[0];
    }

    isLastLeg() {
        const currentIndex = this.getCurrentLegIndex();
        return currentIndex === this.legs.length - 1;
    }

    getStartingPosition(roadPath) {
        if (!this.currentLeg) {
            console.warn('No leg selected, using default start position');
            return roadPath[0];
        }

        const startSegment = Math.min(this.currentLeg.startSegment, roadPath.length - 1);
        return roadPath[startSegment];
    }

    getCheckpointPositions(roadPath) {
        if (!this.currentLeg) {
            console.warn('No leg selected, using full track for checkpoints');
            return this.generateCheckpoints(roadPath, 0, roadPath.length - 1);
        }

        return this.generateCheckpoints(
            roadPath,
            this.currentLeg.startSegment,
            this.currentLeg.endSegment
        );
    }

    generateCheckpoints(roadPath, startSegment, endSegment) {
        const checkpoints = [];
        const segmentRange = endSegment - startSegment;
        const checkpointInterval = Math.floor(segmentRange / 10); // 10 checkpoints per leg

        for (let i = 1; i <= 10; i++) {
            const segmentIndex = startSegment + (checkpointInterval * i);
            if (segmentIndex < roadPath.length) {
                checkpoints.push(roadPath[segmentIndex]);
            }
        }

        return checkpoints;
    }

    getLandscapeConfig() {
        if (!this.currentLeg) {
            return { variation: 'mountain' };
        }

        const configs = {
            mountain: {
                grassColor: 0x4a7c4a,
                mountainColor: 0x6b5c42,
                fogDensity: 0.0015,
                treeTypes: ['pine', 'spruce'],
                rockFrequency: 0.3
            },
            valley: {
                grassColor: 0x5a9c5a,
                mountainColor: 0x7a6c52,
                fogDensity: 0.0008,
                treeTypes: ['oak', 'pine'],
                rockFrequency: 0.15
            },
            alpine: {
                grassColor: 0x3a6c3a,
                mountainColor: 0x8b8b8b,
                fogDensity: 0.002,
                treeTypes: ['pine'],
                rockFrequency: 0.5
            },
            coastal: {
                grassColor: 0x6aac6a,
                mountainColor: 0x5a4c32,
                fogDensity: 0.001,
                treeTypes: ['palm', 'oak'],
                rockFrequency: 0.2
            },
            mixed: {
                grassColor: 0x4a8c4a,
                mountainColor: 0x6a5c42,
                fogDensity: 0.0012,
                treeTypes: ['pine', 'oak'],
                rockFrequency: 0.25
            }
        };

        return configs[this.currentLeg.landscapeVariation] || configs.mountain;
    }

    createLegSelector(container, onLegSelected) {
        const selectorHTML = `
            <div class="tour-selector-overlay">
                <div class="tour-selector-panel">
                    <h1 class="tour-title">TWISTY CHALLENGE TOUR</h1>
                    <div class="leg-grid">
                        ${this.legs.map((leg, index) => `
                            <div class="leg-card" data-leg-id="${leg.id}" data-leg-index="${index}">
                                <div class="leg-number">LEG ${index + 1}</div>
                                <h3 class="leg-name">${leg.name}</h3>
                                <p class="leg-description">${leg.description}</p>
                                <button class="select-leg-btn" data-leg-id="${leg.id}">START</button>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        container.insertAdjacentHTML('beforeend', selectorHTML);

        // Initialize keyboard navigation
        this.selectedLegIndex = 0;
        this.legSelectorActive = true;
        this.updateLegHighlight();

        // Add event listeners for mouse clicks
        document.querySelectorAll('.select-leg-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const legId = e.target.dataset.legId;
                const leg = this.selectLeg(legId);
                if (leg && onLegSelected) {
                    this.legSelectorActive = false;
                    onLegSelected(leg);
                }
            });
        });

        // Add keyboard navigation
        this.keyboardHandler = (e) => {
            if (!this.legSelectorActive) return;

            switch(e.code) {
                case 'ArrowUp':
                case 'KeyW':
                case 'ArrowLeft':
                case 'KeyA':
                    e.preventDefault();
                    if (this.selectedLegIndex > 0) {
                        this.selectedLegIndex--;
                    }
                    this.updateLegHighlight();
                    break;

                case 'ArrowDown':
                case 'KeyS':
                case 'ArrowRight':
                case 'KeyD':
                    e.preventDefault();
                    if (this.selectedLegIndex < this.legs.length - 1) {
                        this.selectedLegIndex++;
                    }
                    this.updateLegHighlight();
                    break;

                case 'Enter':
                case 'Space':
                    e.preventDefault();
                    const selectedLeg = this.legs[this.selectedLegIndex];
                    const leg = this.selectLeg(selectedLeg.id);
                    if (leg && onLegSelected) {
                        this.legSelectorActive = false;
                        onLegSelected(leg);
                    }
                    break;
            }
        };

        document.addEventListener('keydown', this.keyboardHandler);
    }

    updateLegHighlight() {
        // Remove highlight from all cards
        document.querySelectorAll('.leg-card').forEach(card => {
            card.classList.remove('selected');
        });

        // Add highlight to selected card
        const selectedCard = document.querySelector(`.leg-card[data-leg-index="${this.selectedLegIndex}"]`);
        if (selectedCard) {
            selectedCard.classList.add('selected');
            selectedCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    hideLegSelector() {
        const overlay = document.querySelector('.tour-selector-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
        this.legSelectorActive = false;

        // Remove keyboard event listener
        if (this.keyboardHandler) {
            document.removeEventListener('keydown', this.keyboardHandler);
        }
    }

    showLegSelector() {
        const overlay = document.querySelector('.tour-selector-overlay');
        if (overlay) {
            overlay.style.display = 'flex';
        }
        this.legSelectorActive = true;

        // Re-register keyboard navigation (hideLegSelector removed it; without
        // this, arrows/Enter are dead after returning to the menu)
        if (this.keyboardHandler) {
            document.removeEventListener('keydown', this.keyboardHandler);
            document.addEventListener('keydown', this.keyboardHandler);
        }

        // Re-highlight the selected card
        if (typeof this.selectedLegIndex !== 'undefined') {
            this.updateLegHighlight();
        }
    }
}
