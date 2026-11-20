class TourSystem {
    // `unlockAll` (debug mode, Game.debugEnabled): every leg and every rider is open, and nothing is saved as unlocked
    constructor({ unlockAll = false } = {}) {
        this.unlockAll = unlockAll;
        this.legs = [
            // Leg 1: Easy warm-up (70 segments = 1400m)
            {
                id: 'mountain-dawn',
                name: 'Mountain Dawn',
                description: 'From the misty plain over a stone bridge and through a foothill village, up the lake cliffs to the first pass',
                startSegment: 0,
                endSegment: 69,
                timeOfDay: 'dawn',
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
                weather: 'snow',
                weatherIntensity: 1.0
            }
        ];

        // A converted leg has its own road, numbered from segment 0
        this.legs.forEach(leg => {
            const course = typeof Course !== 'undefined' ? Course.forLeg(leg.id) : null;
            if (course) {
                leg.startSegment = 0;
                leg.endSegment = course.segments - 1;
            }
        });

        this.currentLeg = null;

        // Progression: legs unlock sequentially; riders unlock at completion
        // milestones. Everyone starts on Tim's scooter and works up.
        this.characterUnlocks = { tim: 0, shane: 2, lucy: 3, guy: 4, alex: 5, steve: 6 };
        let savedProgress = {};
        try {
            savedProgress = JSON.parse(localStorage.getItem('twistyProgress') || '{}');
        } catch (e) { /* corrupted - start fresh */ }
        this.completedLegs = Array.isArray(savedProgress.completedLegs) ? savedProgress.completedLegs : [];
        // Riders unlocked this session and not yet looked at: badged NEW
        this.freshRiders = new Set();

        // Rider selection (persisted; must be unlocked). CHARACTERS is
        // defined in vehicle.js, loaded before this file.
        const savedCharacter = localStorage.getItem('twistyCharacter');
        this.selectedCharacterId =
            (typeof CHARACTERS !== 'undefined' &&
             CHARACTERS.some(c => c.id === savedCharacter) &&
             this.isCharacterUnlocked(savedCharacter))
                ? savedCharacter : 'tim';
        // Each rider's chosen bike, by character id (the rider select's
        // picker); a rider with none saved rides their first
        this.selectedBikes = {};
        try {
            const saved = JSON.parse(localStorage.getItem('twistyBikes') || '{}');
            if (saved && typeof saved === 'object') this.selectedBikes = saved;
        } catch (e) {
            console.warn('TourSystem: the saved bike choices could not be read; every rider starts on their first bike:', e);
        }
        // How many of each rider's bikes are open, by character id (a rider with none saved has their first only):
        // a rider's bikes open one by one, least powerful first (TourSystem.markRideFinished)
        this.bikeUnlocks = {};
        try {
            const saved = JSON.parse(localStorage.getItem('twistyBikeUnlocks') || '{}');
            if (saved && typeof saved === 'object') this.bikeUnlocks = saved;
        } catch (e) {
            console.warn('TourSystem: the saved bike unlocks could not be read; every rider starts with their first bike:', e);
        }
        // Each rider's chosen outfit, by character id; a rider with none
        // saved wears their first
        this.selectedOutfits = {};
        try {
            const saved = JSON.parse(localStorage.getItem('twistyOutfits') || '{}');
            if (saved && typeof saved === 'object') this.selectedOutfits = saved;
        } catch (e) {
            console.warn('TourSystem: the saved outfit choices could not be read; every rider starts in their first outfit:', e);
        }
    }

    // The bikes of a rider that are open, least powerful first: the first, and one more for each ride finished on
    // the best open one (markRideFinished). Debug mode opens them all. A rider's own bikes only: swapping bikes
    // between riders is not here
    openBikes(characterId) {
        const character = typeof CHARACTERS !== 'undefined' ? CHARACTERS.find(c => c.id === characterId) : null;
        if (!character || !Array.isArray(character.bikes)) return [];
        if (this.unlockAll) return character.bikes.slice();
        const open = Math.floor(Number(this.bikeUnlocks[characterId])) || 1;
        return character.bikes.slice(0, Math.max(1, Math.min(character.bikes.length, open)));
    }

    isBikeUnlocked(characterId, bikeId) {
        return this.openBikes(characterId).includes(bikeId);
    }

    // A ride finished by this rider on this bike. On the best bike the rider has open, it opens the next one:
    // returns that bike ({ id, title, paint }) for the finish screen, or null. Debug mode saves nothing
    markRideFinished(characterId, bikeId) {
        const character = typeof CHARACTERS !== 'undefined' ? CHARACTERS.find(c => c.id === characterId) : null;
        if (!character || this.unlockAll) return null;
        const open = this.openBikes(characterId);
        if (open.length >= character.bikes.length || open[open.length - 1] !== bikeId) return null;
        this.bikeUnlocks[characterId] = open.length + 1;
        try {
            localStorage.setItem('twistyBikeUnlocks', JSON.stringify(this.bikeUnlocks));
        } catch (e) {
            console.warn('TourSystem: the bike unlock could not be saved:', e);
        }
        const id = character.bikes[open.length];
        const model = typeof BIKE_MODELS !== 'undefined' ? BIKE_MODELS[id] : null;
        return { id, title: TourSystem.bikeTitle(id), paint: model ? model.paint : parseInt(character.bikeColor), rider: character.name };
    }

    // The bike a rider rides: the one chosen for them if they have it open, else their first
    getSelectedBike(characterId) {
        if (typeof CHARACTERS === 'undefined') return null;
        const character = CHARACTERS.find(c => c.id === characterId);
        if (!character || !Array.isArray(character.bikes) || !character.bikes.length) return null;
        const chosen = this.selectedBikes[characterId];
        return this.isBikeUnlocked(characterId, chosen) ? chosen : character.bikes[0];
    }

    // Chooses a bike for a rider and remembers it
    selectBike(characterId, bikeId) {
        const character = typeof CHARACTERS !== 'undefined' ? CHARACTERS.find(c => c.id === characterId) : null;
        if (!character || !this.isBikeUnlocked(characterId, bikeId)) return;
        this.selectedBikes[characterId] = bikeId;
        try {
            localStorage.setItem('twistyBikes', JSON.stringify(this.selectedBikes));
        } catch (e) {
            console.warn('TourSystem: the bike choice could not be saved:', e);
        }
    }

    // The outfit a rider wears, by id: the one chosen for them if they have it, else their first
    getSelectedOutfit(characterId) {
        if (typeof CHARACTERS === 'undefined') return null;
        const character = CHARACTERS.find(c => c.id === characterId);
        if (!character || !Array.isArray(character.outfits) || !character.outfits.length) return null;
        const chosen = this.selectedOutfits[characterId];
        return character.outfits.some(outfit => outfit.id === chosen) ? chosen : character.outfits[0].id;
    }

    // Chooses an outfit for a rider and remembers it
    selectOutfit(characterId, outfitId) {
        const character = typeof CHARACTERS !== 'undefined' ? CHARACTERS.find(c => c.id === characterId) : null;
        if (!character || !Array.isArray(character.outfits) || !character.outfits.some(outfit => outfit.id === outfitId)) return;
        this.selectedOutfits[characterId] = outfitId;
        try {
            localStorage.setItem('twistyOutfits', JSON.stringify(this.selectedOutfits));
        } catch (e) {
            console.warn('TourSystem: the outfit choice could not be saved:', e);
        }
    }

    // The rider select's text for a bike: its descriptive name and year
    static bikeTitle(bikeId) {
        const bike = typeof BIKE_MODELS !== 'undefined' ? BIKE_MODELS[bikeId] : null;
        return bike ? `${bike.name} (${bike.year})` : bikeId;
    }

    // The rider select's stars for a character on a bike, 1 to 5 a bar: the bike's part and the rider's (Vehicle.statsOf)
    static statsOf(character, bikeId) {
        return Vehicle.statsOf(character, bikeId);
    }

    // The id the leaderboard and the local best time are keyed by. A leg whose
    // course changed carries a track version above 1 and so gets a board of its
    // own; version 1 keeps the plain leg id and its history. Takes a leg or an
    // id; an unknown id throws, so a typo cannot read another leg's board.
    static boardId(leg) {
        const id = typeof leg === 'string' ? leg : leg.id;
        const { trackVersion } = Terrain.legConfig(id);
        return trackVersion === 1 ? id : `${id}-v${trackVersion}`;
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
        if (index <= 0 || this.unlockAll) return true;
        return this.isLegCompleted(this.legs[index - 1].id);
    }

    isCharacterUnlocked(characterId) {
        const required = this.characterUnlocks[characterId];
        if (required === undefined) return false;
        return this.unlockAll || this.completedLegs.length >= required;
    }

    // Records a completed leg; returns what it newly unlocked so the finish
    // screen can announce it: names (newLegs, newCharacters) and the records
    // themselves (legs, characters) for pictures, colours and ids
    markLegCompleted(legId) {
        if (this.isLegCompleted(legId)) return { newLegs: [], newCharacters: [], legs: [], characters: [] };

        const charactersBefore = (typeof CHARACTERS !== 'undefined' ? CHARACTERS : [])
            .filter(c => this.isCharacterUnlocked(c.id)).map(c => c.id);
        const legIndex = this.legs.findIndex(l => l.id === legId);

        this.completedLegs.push(legId);
        localStorage.setItem('twistyProgress', JSON.stringify({ completedLegs: this.completedLegs }));

        const characters = (typeof CHARACTERS !== 'undefined' ? CHARACTERS : [])
            .filter(c => this.isCharacterUnlocked(c.id) && !charactersBefore.includes(c.id));
        const legs = [];
        if (legIndex >= 0 && legIndex + 1 < this.legs.length && !this.isLegCompleted(this.legs[legIndex + 1].id)) {
            legs.push(this.legs[legIndex + 1]);
        }
        characters.forEach(c => this.freshRiders.add(c.id));
        return {
            newLegs: legs.map(l => l.name),
            newCharacters: characters.map(c => c.name),
            legs,
            characters
        };
    }

    // The next rider still locked and how many more completed legs it needs
    nextCharacterUnlock() {
        const next = this.riderDisplayOrder().find(c => !this.isCharacterUnlocked(c.id));
        if (!next) return null;
        const required = this.characterUnlocks[next.id] || 0;
        return { character: next, required, remaining: Math.max(0, required - this.completedLegs.length) };
    }

    unlockProgressText() {
        const next = this.nextCharacterUnlock();
        if (!next) return '';
        const legs = next.remaining === 1 ? 'leg' : 'legs';
        return `${next.remaining} more ${legs} to unlock ${next.character.name}'s ${next.character.bikeLabel}`;
    }

    // What the finish screen offers first. A new rider sends the player back
    // to the rider screen to try it; otherwise the tour carries on.
    static finishFlow(unlocks, isLastLeg) {
        const riders = unlocks && Array.isArray(unlocks.characters) ? unlocks.characters.map(c => c.id) : [];
        let primary = isLastLeg ? 'restart-tour' : 'next-leg';
        if (riders.length > 0) primary = 'choose-rider';
        return { primary, riders };
    }

    isRiderFresh(characterId) {
        return this.freshRiders.has(characterId);
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
                    const stats = TourSystem.statsOf(c, this.getSelectedBike(c.id));
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
                        <div>Speed&nbsp;&nbsp;&nbsp; ${statBar(stats.speed)}</div>
                        <div>Accel&nbsp;&nbsp;&nbsp;&nbsp; ${statBar(stats.accel)}</div>
                        <div>Handling ${statBar(stats.handling)}</div>
                        <div>Jump&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ${statBar(stats.jump)}</div>
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

    getStartingPosition(route) {
        if (!this.currentLeg) {
            console.warn('No leg selected, using default start position');
            return route.sample(0);
        }

        // Spawn at the start line (5 segments into the leg) so the abrupt
        // edge where the rendered road begins is behind the camera
        const startSegment = Math.min(this.currentLeg.startSegment + 5, route.unitCount - 1);
        return route.sample(route.fromUnits(startSegment));
    }

    createLegSelector(container, onLegSelected) {
        // Rebuildable: lock states change as the player progresses
        this.onLegSelected = onLegSelected || this.onLegSelected;
        const existing = document.querySelector('.tour-selector-overlay');
        if (existing) {
            Modals.close(existing);
            existing.remove();
        }

        const icon = name => (typeof UiIcons !== 'undefined' ? UiIcons.svg(name) : '');
        // With a world to ride (Game.openRide sets onWorldSelected), the rider's primary button rides it and Classic
        // legs goes to the leg screen; without one the rider goes on to the leg screen as before
        const world = typeof this.onWorldSelected === 'function';
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
                        <div class="showcase-actions">
                            <button id="riderContinueBtn" class="showcase-continue">${world ? 'RIDE →' : 'CONTINUE →'}</button>
                            ${world ? '<button id="riderClassicBtn" class="showcase-secondary">CLASSIC LEGS</button>' : ''}
                        </div>
                    </div>

                    <!-- Screen 2: track carousel -->
                    <div class="track-select-screen" style="display: none;">
                        <div class="showcase-label">
                            <button id="backToRidersBtn" class="carousel-back">← RIDER</button>
                            <span>${world ? 'CHOOSE A CLASSIC LEG' : 'CHOOSE YOUR LEG'}</span>
                        </div>
                        <div class="showcase-spacer"></div>
                        <div class="showcase-controls">
                            <button class="carousel-arrow" id="legPrevBtn">‹</button>
                            <div class="showcase-info" id="legInfoCard"></div>
                            <button class="carousel-arrow" id="legNextBtn">›</button>
                        </div>
                        <div class="showcase-actions">
                            <button id="legStartBtn" class="showcase-continue">START</button>
                            <button id="legLeaderboardBtn" class="showcase-secondary">${icon('trophy')} BEST TIMES</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        container.insertAdjacentHTML('beforeend', selectorHTML);
        document.body.classList.add('in-menu');
        // The data credit of the real-map world lives in a Credits panel, not on screen (js/world/credits.js)
        if (typeof WorldCredits !== 'undefined') container.querySelector('.character-select-screen .showcase-actions').appendChild(WorldCredits.button('showcase-secondary'));

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
                `<span class="stat-bar" aria-label="${value} of 5">${Array.from({ length: 5 }, (_, i) => `<i${i < value ? ' class="on"' : ''}></i>`).join('')}</span>`;
            const card = document.getElementById('riderInfoCard');
            card.classList.remove('fresh');
            if (tier === 'silhouette') {
                card.innerHTML = `
                    <div class="showcase-name">${icon('lock')} ???</div>
                    <div class="showcase-sub">LOCKED</div>`;
            } else if (tier === 'dimmed') {
                const required = this.characterUnlocks[c.id] || 0;
                const remaining = Math.max(0, required - this.completedLegs.length);
                card.innerHTML = `
                    <div class="showcase-name">${icon('lock')} ${c.name}</div>
                    <div class="showcase-sub">${c.bikeLabel}</div>
                    <div class="showcase-hint">${remaining} more leg${remaining === 1 ? '' : 's'} to unlock (${this.completedLegs.length}/${required} completed)</div>`;
            } else {
                const fresh = this.isRiderFresh(c.id);
                card.classList.toggle('fresh', fresh);
                const bikes = Array.isArray(c.bikes) ? c.bikes : [];
                const open = this.openBikes(c.id);
                const bike = this.getSelectedBike(c.id);
                const at = Math.max(0, bikes.indexOf(bike));
                // The next bike opens with a ride finished on the best one open
                const locked = open.length < bikes.length;
                const hint = !locked ? '' : `<span class="bike-count bike-locked" id="bikeLockHint">${icon('lock')} ${at === open.length - 1 ? 'Finish a ride on this bike to open the next' : 'Finish a ride on the last open bike to open the next'}</span>`;
                const picker = bikes.length > 1 ? `
                    <div class="bike-picker" role="group" aria-label="Bike">
                        <div class="bike-name" id="bikeName">${TourSystem.bikeTitle(bike)}<span class="bike-count">${at + 1} / ${bikes.length}</span>${hint}</div>
                        <div class="bike-arrows">
                            <button class="bike-arrow" id="bikePrevBtn" aria-label="Previous bike"${at === 0 ? ' disabled' : ''}>▲</button>
                            <button class="bike-arrow" id="bikeNextBtn" aria-label="Next bike"${at >= open.length - 1 ? ' disabled' : ''}>▼</button>
                        </div>
                    </div>` : `<div class="showcase-sub bike-name" id="bikeName">${TourSystem.bikeTitle(bike)}</div>`;
                // The outfit row, under the bike row: the rider's own outfits, the first their usual one
                const outfits = Array.isArray(c.outfits) ? c.outfits : [];
                const worn = Math.max(0, outfits.findIndex(outfit => outfit.id === this.getSelectedOutfit(c.id)));
                const wardrobe = outfits.length > 1 ? `
                    <div class="bike-picker outfit-picker" role="group" aria-label="Outfit">
                        <div class="bike-name" id="outfitName">${outfits[worn].name}<span class="bike-count">OUTFIT ${worn + 1} / ${outfits.length}</span></div>
                        <div class="bike-arrows outfit-arrows">
                            <button class="bike-arrow" id="outfitPrevBtn" aria-label="Previous outfit (Q)" title="Q"${worn === 0 ? ' disabled' : ''}>◀</button>
                            <button class="bike-arrow" id="outfitNextBtn" aria-label="Next outfit (E)" title="E"${worn === outfits.length - 1 ? ' disabled' : ''}>▶</button>
                        </div>
                    </div>` : '';
                // The stars are the rider on the bike in the row above, so they change as the row steps
                const stats = TourSystem.statsOf(c, bike);
                card.innerHTML = `
                    ${fresh ? '<div class="new-badge">NEW BIKE UNLOCKED</div>' : ''}
                    <div class="showcase-name">${c.name}</div>
                    ${picker}
                    ${wardrobe}
                    <div class="showcase-stats">
                        <span>SPEED</span>${statBar(stats.speed)}
                        <span>ACCEL</span>${statBar(stats.accel)}
                        <span>HANDLING</span>${statBar(stats.handling)}
                        <span>JUMP</span>${statBar(stats.jump)}
                        <span>COMFORT</span>${statBar(stats.comfort)}
                    </div>`;
            }
            document.getElementById('riderContinueBtn').disabled = tier !== 'lit';
            const classicButton = document.getElementById('riderClassicBtn');
            if (classicButton) classicButton.disabled = tier !== 'lit';
            const prev = document.getElementById('bikePrevBtn');
            const next = document.getElementById('bikeNextBtn');
            if (prev) prev.addEventListener('click', () => moveBikeFocus(-1));
            if (next) next.addEventListener('click', () => moveBikeFocus(1));
            const before = document.getElementById('outfitPrevBtn'), after = document.getElementById('outfitNextBtn');
            if (before) before.addEventListener('click', () => moveOutfitFocus(-1));
            if (after) after.addEventListener('click', () => moveOutfitFocus(1));
            if (this.onRiderShowcase) this.onRiderShowcase(c.id);
        };

        // Steps the focused rider's bikes up or down their list, remembers the
        // choice and puts that bike on the stage. The list has two ends (the
        // least powerful bike first): it does not wrap round
        const moveBikeFocus = (delta) => {
            const c = riderOrder[this.riderFocusIndex];
            if (this.riderTierFor(c.id) !== 'lit' || !Array.isArray(c.bikes) || c.bikes.length < 2) return;
            const at = c.bikes.indexOf(this.getSelectedBike(c.id));
            const to = Math.max(0, Math.min(this.openBikes(c.id).length - 1, at + delta));
            if (to === at) return;
            this.selectBike(c.id, c.bikes[to]);
            renderRiderCard();
            if (this.onBikeShowcase) this.onBikeShowcase(c.id);
        };
        this.moveBikeFocus = moveBikeFocus;

        // Steps the focused rider's outfits, remembers the choice and dresses the rider on the stage. Two ends, as
        // the bikes
        const moveOutfitFocus = (delta) => {
            const c = riderOrder[this.riderFocusIndex];
            if (this.riderTierFor(c.id) !== 'lit' || !Array.isArray(c.outfits) || c.outfits.length < 2) return;
            const at = c.outfits.findIndex(outfit => outfit.id === this.getSelectedOutfit(c.id));
            const to = Math.max(0, Math.min(c.outfits.length - 1, at + delta));
            if (to === at) return;
            this.selectOutfit(c.id, c.outfits[to].id);
            renderRiderCard();
            if (this.onBikeShowcase) this.onBikeShowcase(c.id);
        };
        this.moveOutfitFocus = moveOutfitFocus;

        const renderLegCard = () => {
            const index = this.legFocusIndex;
            const leg = this.legs[index];
            const tier = this.legTierFor(index);
            const completed = this.isLegCompleted(leg.id);
            const card = document.getElementById('legInfoCard');
            if (tier !== 'lit') {
                card.innerHTML = `
                    <div class="showcase-name">${icon('lock')} Leg ${index + 1}: ${leg.name}</div>
                    <div class="showcase-sub">${leg.description}</div>
                    <div class="showcase-hint">Complete Leg ${index} to unlock</div>`;
            } else {
                card.innerHTML = `
                    <div class="showcase-name">Leg ${index + 1}: ${leg.name}</div>
                    <div class="showcase-sub">${leg.description}</div>
                    ${completed ? `<div class="showcase-done">${icon('check')} COMPLETED</div>` : ''}`;
            }
            const progress = this.unlockProgressText();
            if (progress) {
                card.insertAdjacentHTML('beforeend', `<div class="showcase-progress">${icon('unlock')} ${progress}</div>`);
            }
            document.getElementById('legStartBtn').disabled = tier !== 'lit';
            document.getElementById('legLeaderboardBtn').style.visibility = tier === 'lit' ? 'visible' : 'hidden';
            if (this.onTrackShowcase) this.onTrackShowcase(index);
        };
        this.renderLegCard = renderLegCard;

        // Focus follows the screen, so Enter presses the screen's own primary button
        const focusPrimary = (id) => {
            const button = document.getElementById(id);
            if (button && !button.disabled) button.focus({ preventScroll: true });
        };
        const showTrackScreen = () => {
            document.querySelector('.character-select-screen').style.display = 'none';
            document.querySelector('.track-select-screen').style.display = 'flex';
            this.menuScreen = 'track';
            renderLegCard();
            focusPrimary('legStartBtn');
        };
        const showRiderScreen = () => {
            document.querySelector('.character-select-screen').style.display = 'flex';
            document.querySelector('.track-select-screen').style.display = 'none';
            this.menuScreen = 'rider';
            if (this.onRiderShowcaseStart) this.onRiderShowcaseStart(riderOrder[this.riderFocusIndex].id);
            renderRiderCard();
            focusPrimary('riderContinueBtn');
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

        // Chooses the focused rider; false when it is locked
        const chooseRider = () => {
            const c = riderOrder[this.riderFocusIndex];
            if (!this.isCharacterUnlocked(c.id)) return false;
            this.selectCharacter(c.id);
            // Once chosen past, nothing is new any more
            this.freshRiders.clear();
            return true;
        };

        document.getElementById('riderContinueBtn').addEventListener('click', () => {
            if (!chooseRider()) return;
            if (!world) {
                showTrackScreen();
                return;
            }
            this.legSelectorActive = false;
            this.onWorldSelected();
        });

        const classic = document.getElementById('riderClassicBtn');
        if (classic) classic.addEventListener('click', () => { if (chooseRider()) showTrackScreen(); });

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

        // Keyboard navigation. The menu is the bottom of the dialog stack (js/modals.js), which hands it a key only
        // while nothing (credits, best times) is open on it. Returns true when it used the key.
        this.keyboardHandler = (e) => {
            if (!this.legSelectorActive) return false;

            const isLeft = e.code === 'ArrowLeft' || e.code === 'KeyA';
            const isRight = e.code === 'ArrowRight' || e.code === 'KeyD';
            const isUp = e.code === 'ArrowUp' || e.code === 'KeyW';
            const isDown = e.code === 'ArrowDown' || e.code === 'KeyS';
            const isConfirm = e.code === 'Enter' || e.code === 'Space';

            if (this.menuScreen === 'rider') {
                if (isLeft) { e.preventDefault(); moveRiderFocus(-1); }
                else if (isRight) { e.preventDefault(); moveRiderFocus(1); }
                else if (isUp) { e.preventDefault(); moveBikeFocus(-1); }
                else if (isDown) { e.preventDefault(); moveBikeFocus(1); }
                else if (e.code === 'KeyQ') { e.preventDefault(); moveOutfitFocus(-1); }
                else if (e.code === 'KeyE') { e.preventDefault(); moveOutfitFocus(1); }
                else if (isConfirm) {
                    e.preventDefault();
                    document.getElementById('riderContinueBtn').click();
                }
                else return false;
                return true;
            }

            if (isLeft) { e.preventDefault(); moveLegFocus(-1); }
            else if (isRight) { e.preventDefault(); moveLegFocus(1); }
            else if (isConfirm) {
                e.preventDefault();
                document.getElementById('legStartBtn').click();
            }
            else return false;
            return true;
        };

        // The overlay stays in view (the 3D showcase behind it) while credits or best times sit on it, and stays
        // in the page when hidden for a ride. Escape goes back from the leg screen to the rider screen.
        const overlay = container.querySelector('.tour-selector-overlay');
        Modals.open(overlay, {
            under: 'show',
            keep: true,
            focus: document.getElementById('riderContinueBtn'),
            onKey: event => this.keyboardHandler(event),
            cancel: () => { if (this.menuScreen === 'track') showRiderScreen(); }
        });

        // Kick off the 3D rider showcase
        if (this.onRiderShowcaseStart) this.onRiderShowcaseStart(riderOrder[this.riderFocusIndex].id);
        renderRiderCard();
    }

    // A short line on the menu, under its title (the world's data failing to load, js/ridemode.js FALLBACK_NOTE)
    showNotice(text) {
        const panel = document.querySelector('.tour-selector-panel');
        if (!panel) return;
        let notice = panel.querySelector('.menu-notice');
        if (!notice) {
            notice = document.createElement('div');
            notice.className = 'menu-notice';
            notice.setAttribute('role', 'status');
            panel.querySelector('.tour-title').insertAdjacentElement('afterend', notice);
        }
        notice.textContent = text;
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
            Modals.close(overlay);
        }
        document.body.classList.remove('in-menu');
        this.legSelectorActive = false;
    }

    // After a bike unlocks: open the rider screen on the new bike
    showRiderSelector(focusId) {
        this.createLegSelector(document.body, this.onLegSelected);
        const order = this.riderDisplayOrder();
        const index = order.findIndex(c => c.id === focusId);
        if (index >= 0) this.riderFocusIndex = index;
        if (this.showRiderScreen) this.showRiderScreen();
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
