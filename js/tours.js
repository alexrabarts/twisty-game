class TourSystem {
    // `unlockAll` (debug mode, Game.debugEnabled): every leg and every rider is open, and nothing is saved as unlocked
    constructor({ unlockAll = false } = {}) {
        this.unlockAll = unlockAll;

        // Progression: riders unlock by the count of legs finished (TourSystem.RIDER_UNLOCKS, legsFinished). Everyone
        // starts on Tim's scooter and works up. The world's legs open one by one in their own store (WorldLegs).
        this.characterUnlocks = { ...TourSystem.RIDER_UNLOCKS };
        let savedProgress = {};
        try {
            savedProgress = JSON.parse(localStorage.getItem('twistyProgress') || '{}');
        } catch (e) {
            console.warn('TourSystem: the saved progress could not be read; starting from the first leg:', e);
        }
        // The legs of the old procedural tour that a save from before 2026-11-27 finished. No new one is added: they
        // are kept, and counted with the world's legs, so that no rider they opened locks again
        this.completedLegs = Array.isArray(savedProgress.completedLegs) ? savedProgress.completedLegs.filter(id => typeof id === 'string') : [];
        // The riders earned, kept so that none locks again when the thresholds move. A save from before the list was
        // kept has the riders the old thresholds gave its old legs (TourSystem.LEGACY_UNLOCKS)
        this.earnedRiders = Array.isArray(savedProgress.riders)
            ? savedProgress.riders.filter(id => typeof id === 'string')
            : Object.keys(TourSystem.LEGACY_UNLOCKS).filter(id => this.completedLegs.length >= TourSystem.LEGACY_UNLOCKS[id]);
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

    // Every leg the rider has finished, once each: the world's legs (WorldLegs, the store that opens the next world leg)
    // and the old legs of a save from before 2026-11-27 (twistyProgress `completedLegs`, which no ride adds to now)
    finishedLegIds() {
        const world = typeof WorldLegs !== 'undefined' ? WorldLegs.finished() : [];
        return [...new Set([...this.completedLegs, ...world])];
    }

    legsFinished() {
        return this.finishedLegIds().length;
    }

    // A rider is open once earned (kept, so it never locks again) or once enough legs are finished
    isCharacterUnlocked(characterId) {
        const required = this.characterUnlocks[characterId];
        if (required === undefined) return false;
        return this.unlockAll || this.earnedRiders.includes(characterId) || this.legsFinished() >= required;
    }

    // The riders open now, by id
    unlockedRiderIds() {
        return (typeof CHARACTERS !== 'undefined' ? CHARACTERS : []).filter(c => this.isCharacterUnlocked(c.id)).map(c => c.id);
    }

    saveProgress() {
        try {
            localStorage.setItem('twistyProgress', JSON.stringify({ completedLegs: this.completedLegs, riders: this.earnedRiders }));
        } catch (e) {
            console.warn('TourSystem: the progress could not be saved:', e);
        }
    }

    // The riders a finish opened, given the ids open before it: kept as earned, badged NEW, and saved
    openedRiders(before) {
        const characters = (typeof CHARACTERS !== 'undefined' ? CHARACTERS : [])
            .filter(c => this.isCharacterUnlocked(c.id) && !before.includes(c.id));
        for (const c of characters) {
            if (!this.earnedRiders.includes(c.id)) this.earnedRiders.push(c.id);
            this.freshRiders.add(c.id);
        }
        this.saveProgress();
        return characters;
    }

    static unlocks(legs = [], characters = []) {
        return { newLegs: legs.map(l => l.name), newCharacters: characters.map(c => c.name), legs, characters };
    }

    // Records a finished world leg in the store that opens the next one (WorldLegs.markFinished), and returns what it
    // newly unlocked so the finish card can announce it: names (newLegs, newCharacters) and the records themselves
    // (legs, characters) for pictures, colours and ids, the world legs as { id, name, description }. Debug mode saves
    // nothing
    markWorldLegFinished(legId) {
        if (this.unlockAll || typeof WorldLegs === 'undefined') return TourSystem.unlocks();
        const before = this.unlockedRiderIds();
        const wasOpen = WorldLegs.LIST.filter(leg => WorldLegs.isOpen(leg.id)).map(leg => leg.id);
        if (!WorldLegs.markFinished(legId)) return TourSystem.unlocks();
        const characters = this.openedRiders(before);
        const legs = WorldLegs.LIST
            .filter(leg => !wasOpen.includes(leg.id) && WorldLegs.isOpen(leg.id))
            .map(leg => ({ id: leg.id, name: leg.name, description: leg.note || '' }));
        return TourSystem.unlocks(legs, characters);
    }

    // The next rider still locked and how many more finished legs it needs
    nextCharacterUnlock() {
        const next = this.riderDisplayOrder().find(c => !this.isCharacterUnlocked(c.id));
        if (!next) return null;
        const required = this.characterUnlocks[next.id] || 0;
        const done = this.legsFinished();
        return { character: next, required, done, remaining: Math.max(0, required - done) };
    }

    unlockProgressText() {
        const next = this.nextCharacterUnlock();
        if (!next) return '';
        const legs = next.remaining === 1 ? 'leg' : 'legs';
        return `${next.remaining} more ${legs} to unlock ${next.character.name}'s ${next.character.bikeLabel}`;
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

    // The menu: the rider, the bike and the outfit, the modes, and RIDE. `onRide` is what RIDE does (Game.chooseWorld)
    createMenu(container, onRide) {
        // Rebuildable: lock states change as the player progresses
        this.onRide = onRide || this.onRide;
        const existing = document.querySelector('.tour-selector-overlay');
        if (existing) {
            Modals.close(existing);
            existing.remove();
        }

        const icon = name => (typeof UiIcons !== 'undefined' ? UiIcons.svg(name) : '');
        const selectorHTML = `
            <div class="tour-selector-overlay showcase-mode home">
                <!-- The stage: the game draws the rider in this box (js/home.js) -->
                <div class="home-stage" aria-hidden="true"></div>
                <div class="tour-selector-panel showcase-panel home-panel">
                    <h1 class="tour-title">TWISTY CHALLENGE TOUR</h1>

                    <!-- The rider, the bike and the outfit, the modes, and the way on -->
                    <div class="character-select-screen">
                        <div class="rider-select-label showcase-label">CHOOSE YOUR RIDER</div>
                        <div class="showcase-controls">
                            <button class="carousel-arrow" id="riderPrevBtn">‹</button>
                            <div class="showcase-info" id="riderInfoCard"></div>
                            <button class="carousel-arrow" id="riderNextBtn">›</button>
                        </div>
                        <div class="showcase-mode" id="gameModeRow"></div>
                        <div class="showcase-mode" id="riderModeRow"></div>
                        <div class="showcase-actions">
                            <button id="riderContinueBtn" class="showcase-continue">RIDE →</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        container.insertAdjacentHTML('beforeend', selectorHTML);
        document.body.classList.add('in-menu');
        // The data credit of the real-map world lives in a Credits panel, not on screen (js/world/credits.js)
        if (typeof WorldCredits !== 'undefined') container.querySelector('.character-select-screen .showcase-actions').appendChild(WorldCredits.button('showcase-secondary'));
        // The settings (graphics and sound) open over the menu through the dialog stack (js/settings.js)
        if (typeof SettingsDialog !== 'undefined') container.querySelector('.character-select-screen .showcase-actions').appendChild(SettingsDialog.button('showcase-secondary'));

        // The game mode (js/gamemodes.js), for the world ride: Time trial, and Free roam with its lock (open in debug mode)
        const gameRow = container.querySelector('#gameModeRow');
        if (gameRow && typeof GameModes !== 'undefined') {
            gameRow.appendChild(GameModes.control(document, { debug: !!this.unlockAll, icon, after: () => focusPrimary('riderContinueBtn') }));
        }

        // The rider mode (js/ridermodes.js): free on the menu. A choice
        // gives the focus back to the primary button, so Enter still rides
        if (typeof RiderModes !== 'undefined') {
            const row = container.querySelector('#riderModeRow');
            row.appendChild(RiderModes.control(document, { after: () => focusPrimary('riderContinueBtn') }));
            if (RiderModes.note) {
                const note = document.createElement('div');
                note.className = 'mode-picker-note';
                note.setAttribute('role', 'status');
                note.textContent = RiderModes.note;
                row.appendChild(note);
            }
        }

        // Carousel focus state
        const riderOrder = this.riderDisplayOrder();
        this.riderFocusIndex = Math.max(0, riderOrder.findIndex(c => c.id === this.selectedCharacterId));
        this.menuActive = true;

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
                const done = this.legsFinished();
                const remaining = Math.max(0, required - done);
                card.innerHTML = `
                    <div class="showcase-name">${icon('lock')} ${c.name}</div>
                    <div class="showcase-sub">${c.bikeLabel}</div>
                    <div class="showcase-hint">Finish ${remaining} more leg${remaining === 1 ? '' : 's'} to unlock (${done}/${required} legs finished)</div>`;
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

        // Focus follows the screen, so Enter presses its primary button
        const focusPrimary = (id) => {
            const button = document.getElementById(id);
            if (button && !button.disabled) button.focus({ preventScroll: true });
        };

        const moveRiderFocus = (delta) => {
            this.riderFocusIndex = Math.max(0, Math.min(riderOrder.length - 1, this.riderFocusIndex + delta));
            renderRiderCard();
        };

        document.getElementById('riderPrevBtn').addEventListener('click', () => moveRiderFocus(-1));
        document.getElementById('riderNextBtn').addEventListener('click', () => moveRiderFocus(1));

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
            this.menuActive = false;
            if (this.onRide) this.onRide();
        });

        // Keyboard navigation. The menu is the bottom of the dialog stack (js/modals.js), which hands it a key only
        // while nothing (credits, settings) is open on it. Returns true when it used the key.
        this.keyboardHandler = (e) => {
            if (!this.menuActive) return false;

            const isLeft = e.code === 'ArrowLeft' || e.code === 'KeyA';
            const isRight = e.code === 'ArrowRight' || e.code === 'KeyD';
            const isUp = e.code === 'ArrowUp' || e.code === 'KeyW';
            const isDown = e.code === 'ArrowDown' || e.code === 'KeyS';
            const isConfirm = e.code === 'Enter' || e.code === 'Space';

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
        };

        // The overlay stays in view (the 3D showcase behind it) while credits or settings sit on it, and stays in the
        // page when hidden for a ride
        const overlay = container.querySelector('.tour-selector-overlay');
        Modals.open(overlay, {
            under: 'show',
            keep: true,
            focus: document.getElementById('riderContinueBtn'),
            onKey: event => this.keyboardHandler(event)
        });

        // Kick off the 3D rider showcase
        if (this.onRiderShowcaseStart) this.onRiderShowcaseStart(riderOrder[this.riderFocusIndex].id);
        renderRiderCard();
        focusPrimary('riderContinueBtn');
    }

    hideMenu() {
        const overlay = document.querySelector('.tour-selector-overlay');
        if (overlay) {
            overlay.style.display = 'none';
            Modals.close(overlay);
        }
        document.body.classList.remove('in-menu');
        this.menuActive = false;
    }
}

// The legs finished that open each rider, each leg once (TourSystem.legsFinished). The order is the power of each
// rider's first bike (BIKE_MODELS `spare`, about 1.75 x its peak kW for each kg of bike and an 80 kg rider): the
// scooter, then the trail single (about 13 kW), the light naked single (32 kW), the scrambler (53 kW), the retro sports
// triple (89 kW) and the naked triple (111 kW), spread over the ten legs of the tour
TourSystem.RIDER_UNLOCKS = Object.freeze({ tim: 0, lucy: 1, shane: 2, guy: 3, steve: 5, alex: 7 });

// The thresholds before 2026-11-26, on the old procedural legs alone: a save from then keeps the riders they gave it
TourSystem.LEGACY_UNLOCKS = Object.freeze({ tim: 0, shane: 2, lucy: 3, guy: 4, alex: 5, steve: 6 });
