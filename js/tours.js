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
            // Leg 2: Points leg - no timer, score as much as possible on the
            // fast, open, jump-friendly valley run. (mode: 'points'; every
            // other leg defaults to a time trial.)
            {
                id: 'valley-run',
                name: 'Valley Run',
                description: 'Fast flowing sections through sunlit valleys',
                mode: 'points',
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

    riderDisplayOrder() {
        if (typeof CHARACTERS === 'undefined') return [];
        const unlocks = this.characterUnlocks || {};
        return CHARACTERS.slice().sort((a, b) => (unlocks[a.id] || 0) - (unlocks[b.id] || 0));
    }

    // 'lit' (selectable), 'dimmed' (next to unlock - shows requirement),
    // 'silhouette' (everything beyond - just LOCKED)
    riderTierFor(characterId) {
        if (this.isCharacterUnlocked(characterId)) return 'lit';
        const firstLocked = this.riderDisplayOrder().find(c => !this.isCharacterUnlocked(c.id));
        return firstLocked && firstLocked.id === characterId ? 'dimmed' : 'silhouette';
    }

    legTierFor(index) {
        if (this.isLegUnlocked(index)) return 'lit';
        return this.isLegUnlocked(index - 1) ? 'dimmed' : 'silhouette';
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
                        <div>Speed&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ${statBar(c.stats.speed)}</div>
                        <div>Accel&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ${statBar(c.stats.accel)}</div>
                        <div>Handling&nbsp;&nbsp; ${statBar(c.stats.handling)}</div>
                        <div>Suspension ${statBar(c.stats.suspension)}</div>
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

    // A leg is either a time trial (default) or a points leg. Time legs are
    // ranked by finish time with a live timer; points legs hide the timer and
    // rank by score. Pass a leg object or an id.
    getLegMode(legOrId) {
        const leg = typeof legOrId === 'string' ? this.getLegById(legOrId) : legOrId;
        return leg && leg.mode === 'points' ? 'points' : 'time';
    }

    // m:ss.t clock for the live HUD timer
    static formatClock(milliseconds) {
        const totalSeconds = Math.max(0, milliseconds) / 1000;
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = Math.floor(totalSeconds % 60);
        const tenths = Math.floor((totalSeconds * 10) % 10);
        return `${minutes}:${seconds.toString().padStart(2, '0')}.${tenths}`;
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
        // Rebuildable: lock states change as the player progresses
        this.onLegSelected = onLegSelected || this.onLegSelected;
        const existing = document.querySelector('.tour-selector-overlay');
        if (existing) existing.remove();
        if (this.keyboardHandler) {
            document.removeEventListener('keydown', this.keyboardHandler);
        }

        const selectorHTML = `
            <div class="tour-selector-overlay showcase-mode">
                <div class="tour-selector-panel showcase-panel">
                    <h1 class="tour-title">TWISTY CHALLENGE TOUR</h1>

                    <!-- Screen 1: rider carousel -->
                    <div class="character-select-screen">
                        <div class="rider-select-label showcase-label">CHOOSE YOUR RIDER</div>
                        <div class="showcase-spacer"></div>
                        <div class="showcase-controls">
                            <button class="carousel-arrow" id="riderPrevBtn">‹</button>
                            <div class="showcase-info" id="riderInfoCard"></div>
                            <button class="carousel-arrow" id="riderNextBtn">›</button>
                        </div>
                        <div style="text-align: center; margin-top: 14px;">
                            <button id="riderContinueBtn" class="showcase-continue">CONTINUE →</button>
                        </div>
                    </div>

                    <!-- Screen 2: track carousel -->
                    <div class="track-select-screen" style="display: none;">
                        <div class="showcase-label" style="display: flex; align-items: center; justify-content: center; gap: 16px;">
                            <button id="backToRidersBtn" class="carousel-back">← RIDER</button>
                            <span>CHOOSE YOUR LEG</span>
                        </div>
                        <div class="showcase-spacer"></div>
                        <div class="showcase-controls">
                            <button class="carousel-arrow" id="legPrevBtn">‹</button>
                            <div class="showcase-info" id="legInfoCard"></div>
                            <button class="carousel-arrow" id="legNextBtn">›</button>
                        </div>
                        <div style="text-align: center; margin-top: 14px;">
                            <button id="legStartBtn" class="showcase-continue">START</button>
                            <button id="legLeaderboardBtn" class="showcase-secondary">🏆 BEST TIMES</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        container.insertAdjacentHTML('beforeend', selectorHTML);
        document.body.classList.add('in-menu');

        // Carousel focus state
        const riderOrder = this.riderDisplayOrder();
        this.riderFocusIndex = Math.max(0, riderOrder.findIndex(c => c.id === this.selectedCharacterId));
        this.legFocusIndex = this.firstPlayableLegIndex();
        this.legSelectorActive = true;
        this.menuScreen = 'rider';

        const renderRiderCard = () => {
            const c = riderOrder[this.riderFocusIndex];
            const tier = this.riderTierFor(c.id);
            const statBar = (value) =>
                `<span class="stat-on">${'■'.repeat(value)}</span><span class="stat-off">${'■'.repeat(5 - value)}</span>`;
            const card = document.getElementById('riderInfoCard');
            if (tier === 'silhouette') {
                card.innerHTML = `
                    <div class="showcase-name">🔒 ???</div>
                    <div class="showcase-sub">LOCKED</div>`;
            } else if (tier === 'dimmed') {
                const required = this.characterUnlocks[c.id] || 0;
                card.innerHTML = `
                    <div class="showcase-name">🔒 ${c.name}</div>
                    <div class="showcase-sub">${c.bikeLabel}</div>
                    <div class="showcase-hint">Complete ${required} leg${required === 1 ? '' : 's'} to unlock (${this.completedLegs.length}/${required})</div>`;
            } else {
                card.innerHTML = `
                    <div class="showcase-name">${c.name}</div>
                    <div class="showcase-sub">${c.bikeLabel}</div>
                    <div class="showcase-stats">
                        <div>Speed&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ${statBar(c.stats.speed)}</div>
                        <div>Accel&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ${statBar(c.stats.accel)}</div>
                        <div>Handling&nbsp;&nbsp; ${statBar(c.stats.handling)}</div>
                        <div>Suspension ${statBar(c.stats.suspension)}</div>
                    </div>`;
            }
            document.getElementById('riderContinueBtn').disabled = tier !== 'lit';
            if (this.onRiderShowcase) this.onRiderShowcase(c.id);
        };

        const renderLegCard = () => {
            const index = this.legFocusIndex;
            const leg = this.legs[index];
            const tier = this.legTierFor(index);
            const completed = this.isLegCompleted(leg.id);
            const card = document.getElementById('legInfoCard');
            if (tier !== 'lit') {
                card.innerHTML = `
                    <div class="showcase-name">🔒 LEG ${index + 1}: ${leg.name}</div>
                    <div class="showcase-sub">${leg.description}</div>
                    <div class="showcase-hint">Complete Leg ${index} to unlock</div>`;
            } else {
                const isPoints = this.getLegMode(leg) === 'points';
                const modeBadge = isPoints
                    ? '<span style="color:#f39c12;">◆ POINTS — score attack, no timer</span>'
                    : '<span style="color:#6cf;">◆ TIME TRIAL — beat the clock</span>';
                card.innerHTML = `
                    <div class="showcase-name">LEG ${index + 1}: ${leg.name} ${completed ? '<span style="color:#2ecc71;font-size:13px;">✔ COMPLETED</span>' : ''}</div>
                    <div class="showcase-sub">${leg.description}</div>
                    <div class="showcase-hint">${modeBadge}</div>`;
            }
            document.getElementById('legStartBtn').disabled = tier !== 'lit';
            const lbBtn = document.getElementById('legLeaderboardBtn');
            lbBtn.style.visibility = tier === 'lit' ? 'visible' : 'hidden';
            lbBtn.textContent = this.getLegMode(leg) === 'points' ? '🏆 BEST SCORES' : '🏆 BEST TIMES';
            if (this.onTrackShowcase) this.onTrackShowcase(index);
        };
        this.renderLegCard = renderLegCard;

        const showTrackScreen = () => {
            document.querySelector('.character-select-screen').style.display = 'none';
            document.querySelector('.track-select-screen').style.display = 'block';
            this.menuScreen = 'track';
            renderLegCard();
        };
        const showRiderScreen = () => {
            document.querySelector('.character-select-screen').style.display = 'block';
            document.querySelector('.track-select-screen').style.display = 'none';
            this.menuScreen = 'rider';
            if (this.onRiderShowcaseStart) this.onRiderShowcaseStart(riderOrder[this.riderFocusIndex].id);
            renderRiderCard();
        };
        this.showTrackScreen = showTrackScreen;
        this.showRiderScreen = showRiderScreen;

        const moveRiderFocus = (delta) => {
            this.riderFocusIndex = Math.max(0, Math.min(riderOrder.length - 1, this.riderFocusIndex + delta));
            renderRiderCard();
        };
        const moveLegFocus = (delta) => {
            this.legFocusIndex = Math.max(0, Math.min(this.legs.length - 1, this.legFocusIndex + delta));
            renderLegCard();
        };

        document.getElementById('riderPrevBtn').addEventListener('click', () => moveRiderFocus(-1));
        document.getElementById('riderNextBtn').addEventListener('click', () => moveRiderFocus(1));
        document.getElementById('legPrevBtn').addEventListener('click', () => moveLegFocus(-1));
        document.getElementById('legNextBtn').addEventListener('click', () => moveLegFocus(1));
        document.getElementById('backToRidersBtn').addEventListener('click', showRiderScreen);

        document.getElementById('riderContinueBtn').addEventListener('click', () => {
            const c = riderOrder[this.riderFocusIndex];
            if (!this.isCharacterUnlocked(c.id)) return;
            this.selectCharacter(c.id);
            showTrackScreen();
        });

        document.getElementById('legStartBtn').addEventListener('click', () => {
            const index = this.legFocusIndex;
            if (!this.isLegUnlocked(index)) return;
            const leg = this.selectLeg(this.legs[index].id);
            if (leg && this.onLegSelected) {
                this.legSelectorActive = false;
                this.onLegSelected(leg);
            }
        });

        document.getElementById('legLeaderboardBtn').addEventListener('click', () => {
            if (this.onViewLeaderboard) {
                this.onViewLeaderboard(this.legs[this.legFocusIndex].id);
            }
        });

        // Keyboard navigation
        this.keyboardHandler = (e) => {
            if (!this.legSelectorActive) return;

            const isLeft = e.code === 'ArrowLeft' || e.code === 'KeyA';
            const isRight = e.code === 'ArrowRight' || e.code === 'KeyD';
            const isConfirm = e.code === 'Enter' || e.code === 'Space';

            if (this.menuScreen === 'rider') {
                if (isLeft) { e.preventDefault(); moveRiderFocus(-1); }
                else if (isRight) { e.preventDefault(); moveRiderFocus(1); }
                else if (isConfirm) {
                    e.preventDefault();
                    document.getElementById('riderContinueBtn').click();
                }
                return;
            }

            if (isLeft) { e.preventDefault(); moveLegFocus(-1); }
            else if (isRight) { e.preventDefault(); moveLegFocus(1); }
            else if (e.code === 'Escape') { e.preventDefault(); showRiderScreen(); }
            else if (isConfirm) {
                e.preventDefault();
                document.getElementById('legStartBtn').click();
            }
        };

        document.addEventListener('keydown', this.keyboardHandler);

        // Kick off the 3D rider showcase
        if (this.onRiderShowcaseStart) this.onRiderShowcaseStart(riderOrder[this.riderFocusIndex].id);
        renderRiderCard();
    }

    firstPlayableLegIndex() {
        for (let i = 0; i < this.legs.length; i++) {
            if (this.isLegUnlocked(i) && !this.isLegCompleted(this.legs[i].id)) return i;
        }
        // Everything completed - default to the first leg
        return 0;
    }

    updateLegHighlight() {
        // Carousel UI - focus rendering happens in renderLegCard
        if (this.renderLegCard) this.renderLegCard();
    }

    hideLegSelector() {
        const overlay = document.querySelector('.tour-selector-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
        document.body.classList.remove('in-menu');
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
