class TourSystem {
    constructor() {
        this.legs = [
            // Leg 1: Easy warm-up (70 segments = 1400m)
            {
                id: 'mountain-dawn',
                name: 'Mountain Dawn',
                description: 'Gentle winding roads through misty mountain passes',
                startSegment: 0,
                endSegment: 69,
                timeOfDay: 'dawn',
                landscapeVariation: 'mountain',
                weather: 'clear',
                weatherIntensity: 0
            },
            // Leg 2: Build confidence (80 segments = 1600m)
            {
                id: 'valley-run',
                name: 'Valley Run',
                description: 'Fast flowing sections through sunlit valleys',
                startSegment: 70,
                endSegment: 149,
                timeOfDay: 'golden',
                landscapeVariation: 'valley',
                weather: 'clear',
                weatherIntensity: 0
            },
            // Leg 3: Technical descents (84 segments = 1680m)
            {
                id: 'coastal-descent',
                name: 'Coastal Descent',
                description: 'Sweeping descents with ocean views',
                startSegment: 150,
                endSegment: 233,
                timeOfDay: 'twilight',
                landscapeVariation: 'coastal',
                weather: 'clear',
                weatherIntensity: 0
            },
            // Leg 4: First weather challenge - visibility (88 segments = 1760m)
            {
                id: 'foggy-gorge',
                name: 'Foggy Gorge',
                description: 'Navigate through dense morning fog and mist',
                startSegment: 234,
                endSegment: 321,
                timeOfDay: 'golden', // Morning light, but foggy
                landscapeVariation: 'valley',
                weather: 'fog',
                weatherIntensity: 4.0
            },
            // Leg 5: Technical hairpins (92 segments = 1840m)
            {
                id: 'high-pass',
                name: 'High Pass',
                description: 'Technical hairpins and dramatic elevation changes',
                startSegment: 322,
                endSegment: 413,
                timeOfDay: 'sunset',
                landscapeVariation: 'alpine',
                weather: 'clear',
                weatherIntensity: 0
            },
            // Leg 6: Weather + grip challenge (96 segments = 1920m)
            {
                id: 'storm-valley',
                name: 'Storm Valley',
                description: 'Battle heavy rain and wet roads in a valley storm',
                startSegment: 414,
                endSegment: 509,
                timeOfDay: 'twilight', // Dark stormy afternoon
                landscapeVariation: 'valley',
                weather: 'rain',
                weatherIntensity: 0.9
            },
            // Leg 7: Darkness challenge (98 segments = 1960m)
            {
                id: 'night-ride',
                name: 'Night Ride',
                description: 'Mixed technical challenges under the stars',
                startSegment: 510,
                endSegment: 607,
                timeOfDay: 'night',
                landscapeVariation: 'mixed',
                weather: 'clear',
                weatherIntensity: 0
            },
            // Leg 8: Ultimate finale - ice and snow (96 segments = 1920m)
            {
                id: 'winter-pass',
                name: 'Winter Pass',
                description: 'Conquer icy roads and snowfall in the mountain pass',
                startSegment: 608,
                endSegment: 703,
                timeOfDay: 'twilight', // Overcast winter day
                landscapeVariation: 'alpine',
                weather: 'snow',
                weatherIntensity: 1.0
            }
        ];

        this.currentLeg = null;

        // Progression: legs unlock sequentially; riders unlock at completion
        // milestones. Everyone starts on Tim's scooter and works up.
        this.characterUnlocks = { tim: 0, shane: 2, alex: 4, steve: 6 };
        let savedProgress = {};
        try {
            savedProgress = JSON.parse(localStorage.getItem('twistyProgress') || '{}');
        } catch (e) { /* corrupted - start fresh */ }
        this.completedLegs = Array.isArray(savedProgress.completedLegs) ? savedProgress.completedLegs : [];

        // Rider selection (persisted; must be unlocked). CHARACTERS is
        // defined in vehicle.js, loaded before this file.
        const savedCharacter = localStorage.getItem('twistyCharacter');
        this.selectedCharacterId =
            (typeof CHARACTERS !== 'undefined' &&
             CHARACTERS.some(c => c.id === savedCharacter) &&
             this.isCharacterUnlocked(savedCharacter))
                ? savedCharacter : 'tim';
    }

    isLegCompleted(legId) {
        return this.completedLegs.includes(legId);
    }

    isLegUnlocked(index) {
        if (index <= 0) return true;
        return this.isLegCompleted(this.legs[index - 1].id);
    }

    isCharacterUnlocked(characterId) {
        const required = this.characterUnlocks[characterId];
        if (required === undefined) return false;
        return this.completedLegs.length >= required;
    }

    // Records a completed leg; returns names of anything newly unlocked so
    // the finish screen can announce it
    markLegCompleted(legId) {
        if (this.isLegCompleted(legId)) return { newLegs: [], newCharacters: [] };

        const charactersBefore = (typeof CHARACTERS !== 'undefined' ? CHARACTERS : [])
            .filter(c => this.isCharacterUnlocked(c.id)).map(c => c.id);
        const legIndex = this.legs.findIndex(l => l.id === legId);

        this.completedLegs.push(legId);
        localStorage.setItem('twistyProgress', JSON.stringify({ completedLegs: this.completedLegs }));

        const newCharacters = (typeof CHARACTERS !== 'undefined' ? CHARACTERS : [])
            .filter(c => this.isCharacterUnlocked(c.id) && !charactersBefore.includes(c.id))
            .map(c => c.name);
        const newLegs = [];
        if (legIndex >= 0 && legIndex + 1 < this.legs.length && !this.isLegCompleted(this.legs[legIndex + 1].id)) {
            newLegs.push(this.legs[legIndex + 1].name);
        }
        return { newLegs, newCharacters };
    }

    getSelectedCharacter() {
        if (typeof CHARACTERS === 'undefined') return null;
        return CHARACTERS.find(c => c.id === this.selectedCharacterId) || CHARACTERS[0];
    }

    selectCharacter(characterId) {
        if (!this.isCharacterUnlocked(characterId)) return;
        this.selectedCharacterId = characterId;
        localStorage.setItem('twistyCharacter', characterId);
        document.querySelectorAll('.rider-card').forEach(card => {
            card.classList.toggle('selected', card.dataset.characterId === characterId);
        });
    }

    buildRiderSelectorHTML() {
        if (typeof CHARACTERS === 'undefined') return '';
        const statBar = (value) =>
            `<span style="letter-spacing: 1px; color: #ffd700;">${'■'.repeat(value)}</span><span style="letter-spacing: 1px; color: #334;">${'■'.repeat(5 - value)}</span>`;
        return `
            <div class="rider-row" style="display: flex; gap: 12px; justify-content: center; margin-bottom: 18px; flex-wrap: wrap;">
                ${CHARACTERS.map(c => {
                    const swatch = '#' + parseInt(c.bikeColor).toString(16).padStart(6, '0');
                    const unlocked = this.isCharacterUnlocked(c.id);
                    const required = this.characterUnlocks[c.id] || 0;
                    const lockHint = unlocked ? '' : `
                        <div style="color: #cc8833; margin-top: 6px; font-size: 10px;">
                            🔒 Complete ${required} leg${required === 1 ? '' : 's'} to unlock
                        </div>`;
                    return `
                    <div class="rider-card ${c.id === this.selectedCharacterId ? 'selected' : ''} ${unlocked ? '' : 'locked'}" data-character-id="${c.id}" style="
                        background: rgba(10, 16, 32, 0.85);
                        border: 2px solid rgba(120, 140, 200, 0.35);
                        border-radius: 10px;
                        padding: 10px 14px;
                        min-width: 150px;
                        cursor: ${unlocked ? 'pointer' : 'not-allowed'};
                        text-align: left;
                        font-size: 11px;
                        color: #aab;
                        ${unlocked ? '' : 'opacity: 0.45; filter: grayscale(0.8);'}
                    ">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                            <span style="width: 14px; height: 14px; border-radius: 50%; background: ${swatch}; display: inline-block; border: 1px solid rgba(255,255,255,0.4);"></span>
                            <span style="color: white; font-weight: bold; font-size: 14px;">${unlocked ? '' : '🔒 '}${c.name}</span>
                        </div>
                        <div style="color: #8899bb; margin-bottom: 6px;">${c.bikeLabel}</div>
                        <div>Speed&nbsp;&nbsp;&nbsp; ${statBar(c.stats.speed)}</div>
                        <div>Accel&nbsp;&nbsp;&nbsp;&nbsp; ${statBar(c.stats.accel)}</div>
                        <div>Handling ${statBar(c.stats.handling)}</div>
                        <div>Jump&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ${statBar(c.stats.jump)}</div>
                        ${lockHint}
                    </div>`;
                }).join('')}
            </div>`;
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

        // Spawn at the start line (5 segments into the leg) so the abrupt
        // edge where the rendered road begins is behind the camera
        const startSegment = Math.min(this.currentLeg.startSegment + 5, roadPath.length - 1);
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
        // Rebuildable: lock states change as the player progresses, so the
        // selector is torn down and re-rendered on every menu visit
        this.onLegSelected = onLegSelected || this.onLegSelected;
        const existing = document.querySelector('.tour-selector-overlay');
        if (existing) existing.remove();
        if (this.keyboardHandler) {
            document.removeEventListener('keydown', this.keyboardHandler);
        }

        const selectorHTML = `
            <div class="tour-selector-overlay">
                <div class="tour-selector-panel">
                    <h1 class="tour-title">TWISTY CHALLENGE TOUR</h1>

                    <!-- Screen 1: rider selection -->
                    <div class="character-select-screen">
                        <div class="rider-select-label" style="text-align: center; color: #8899bb; letter-spacing: 3px; font-size: 13px; margin-bottom: 8px;">CHOOSE YOUR RIDER</div>
                        ${this.buildRiderSelectorHTML()}
                        <div style="text-align: center; margin-top: 10px;">
                            <button id="riderContinueBtn" style="
                                padding: 14px 60px;
                                background: linear-gradient(135deg, #2ecc71, #27ae60);
                                color: white;
                                border: none;
                                border-radius: 10px;
                                font-size: 18px;
                                font-weight: bold;
                                letter-spacing: 2px;
                                cursor: pointer;
                                box-shadow: 0 4px 18px rgba(46, 204, 113, 0.4);
                            ">CONTINUE →</button>
                        </div>
                    </div>

                    <!-- Screen 2: track selection -->
                    <div class="track-select-screen" style="display: none;">
                        <div style="display: flex; align-items: center; justify-content: center; gap: 16px; margin-bottom: 14px;">
                            <button id="backToRidersBtn" style="
                                padding: 8px 18px;
                                background: rgba(120, 140, 200, 0.15);
                                border: 1px solid rgba(120, 140, 200, 0.45);
                                border-radius: 8px;
                                color: #aac;
                                font-size: 13px;
                                font-weight: bold;
                                cursor: pointer;
                            ">← RIDER</button>
                            <div class="rider-select-label" style="color: #8899bb; letter-spacing: 3px; font-size: 13px;">CHOOSE YOUR LEG</div>
                        </div>
                        <div class="leg-grid">
                            ${this.legs.map((leg, index) => {
                                const unlocked = this.isLegUnlocked(index);
                                const completed = this.isLegCompleted(leg.id);
                                const badge = completed
                                    ? '<span style="color: #2ecc71;">✔ COMPLETED</span>'
                                    : (unlocked ? '' : '🔒 LOCKED');
                                return `
                                <div class="leg-card ${unlocked ? '' : 'locked'}" data-leg-id="${leg.id}" data-leg-index="${index}" style="${unlocked ? '' : 'opacity: 0.45; filter: grayscale(0.8);'}">
                                    <div class="leg-number">LEG ${index + 1} <span style="float: right; font-size: 10px;">${badge}</span></div>
                                    <h3 class="leg-name">${leg.name}</h3>
                                    <p class="leg-description">${unlocked ? leg.description : `Complete Leg ${index} to unlock`}</p>
                                    ${unlocked ? `
                                        <button class="select-leg-btn" data-leg-id="${leg.id}">START</button>
                                        <button class="view-leaderboard-btn" data-leg-id="${leg.id}" style="
                                            margin-top: 6px;
                                            width: 100%;
                                            padding: 6px 0;
                                            background: rgba(255, 215, 0, 0.12);
                                            border: 1px solid rgba(255, 215, 0, 0.45);
                                            border-radius: 6px;
                                            color: #ffd700;
                                            font-size: 12px;
                                            font-weight: bold;
                                            cursor: pointer;
                                            letter-spacing: 1px;
                                        ">🏆 BEST TIMES</button>
                                    ` : `
                                        <button class="select-leg-btn" disabled style="opacity: 0.4; cursor: not-allowed;">🔒 LOCKED</button>
                                    `}
                                </div>`;
                            }).join('')}
                        </div>
                    </div>
                </div>
            </div>
        `;

        container.insertAdjacentHTML('beforeend', selectorHTML);

        // Initialize keyboard navigation on the first unlocked, uncompleted leg
        this.selectedLegIndex = this.firstPlayableLegIndex();
        this.legSelectorActive = true;
        this.menuScreen = 'rider';
        this.updateLegHighlight();

        const showTrackScreen = () => {
            document.querySelector('.character-select-screen').style.display = 'none';
            document.querySelector('.track-select-screen').style.display = 'block';
            this.menuScreen = 'track';
        };
        const showRiderScreen = () => {
            document.querySelector('.character-select-screen').style.display = 'block';
            document.querySelector('.track-select-screen').style.display = 'none';
            this.menuScreen = 'rider';
        };
        this.showTrackScreen = showTrackScreen;
        this.showRiderScreen = showRiderScreen;

        document.getElementById('riderContinueBtn').addEventListener('click', showTrackScreen);
        document.getElementById('backToRidersBtn').addEventListener('click', showRiderScreen);

        // Leg start buttons (unlocked only)
        document.querySelectorAll('.select-leg-btn:not([disabled])').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const legId = e.target.dataset.legId;
                const leg = this.selectLeg(legId);
                if (leg && this.onLegSelected) {
                    this.legSelectorActive = false;
                    this.onLegSelected(leg);
                }
            });
        });

        // Rider selection cards (locked ones are rejected in selectCharacter)
        document.querySelectorAll('.rider-card').forEach(card => {
            card.addEventListener('click', () => {
                this.selectCharacter(card.dataset.characterId);
            });
        });

        // Leaderboard buttons - handled by the game (set via onViewLeaderboard)
        document.querySelectorAll('.view-leaderboard-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.onViewLeaderboard) {
                    this.onViewLeaderboard(e.target.dataset.legId);
                }
            });
        });

        // Keyboard navigation
        this.keyboardHandler = (e) => {
            if (!this.legSelectorActive) return;

            // Rider screen: left/right cycles unlocked riders, Enter continues
            if (this.menuScreen === 'rider') {
                const unlockedIds = CHARACTERS.filter(c => this.isCharacterUnlocked(c.id)).map(c => c.id);
                const current = unlockedIds.indexOf(this.selectedCharacterId);
                switch (e.code) {
                    case 'ArrowLeft':
                    case 'KeyA':
                        e.preventDefault();
                        this.selectCharacter(unlockedIds[Math.max(0, current - 1)]);
                        break;
                    case 'ArrowRight':
                    case 'KeyD':
                        e.preventDefault();
                        this.selectCharacter(unlockedIds[Math.min(unlockedIds.length - 1, current + 1)]);
                        break;
                    case 'Enter':
                    case 'Space':
                        e.preventDefault();
                        showTrackScreen();
                        break;
                }
                return;
            }

            // Track screen: navigate unlocked legs only
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
                    if (this.selectedLegIndex < this.legs.length - 1 && this.isLegUnlocked(this.selectedLegIndex + 1)) {
                        this.selectedLegIndex++;
                    }
                    this.updateLegHighlight();
                    break;

                case 'Escape':
                    e.preventDefault();
                    showRiderScreen();
                    break;

                case 'Enter':
                case 'Space':
                    e.preventDefault();
                    if (!this.isLegUnlocked(this.selectedLegIndex)) break;
                    const selectedLeg = this.legs[this.selectedLegIndex];
                    const leg = this.selectLeg(selectedLeg.id);
                    if (leg && this.onLegSelected) {
                        this.legSelectorActive = false;
                        this.onLegSelected(leg);
                    }
                    break;
            }
        };

        document.addEventListener('keydown', this.keyboardHandler);
    }

    firstPlayableLegIndex() {
        for (let i = 0; i < this.legs.length; i++) {
            if (this.isLegUnlocked(i) && !this.isLegCompleted(this.legs[i].id)) return i;
        }
        // Everything completed - default to the first leg
        return 0;
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
        // Rebuild from scratch so newly unlocked legs/riders render correctly
        this.createLegSelector(document.body, this.onLegSelected);

        // Returning players land on the track screen; their rider is kept
        if (this.showTrackScreen) {
            this.showTrackScreen();
        }
    }
}
