// The in-game HUD. HudRules holds the decisions (when the hint shows, whether
// the FPS counter is on, which devices get touch controls) as pure functions
// so they can be tested without a page; Hud owns the DOM writes. Per-frame
// writes go to existing text nodes and only when the shown value changes.
const HudRules = {
    HINT_MS: 6000,
    // Once the rider is riding, the hint has done its job
    HINT_AFTER_INPUT_MS: 2500,
    START_CARD_MS: 2800,
    // The first frames of a leg compile shaders and can take seconds each
    START_CARD_DELAY_FRAMES: 3,
    SPLIT_MS: 3000,
    // Above this many gates the pips shrink (css/ui.css, #hudGatePips[data-many])
    MANY_GATES: 8,
    CALLOUT_LIMIT: 3,
    // Above this many gates a row of pips cannot fit: the row shows the count only
    MAX_PIPS: 20,
    FPS_KEY: 'twistyShowFps',

    hintVisible(elapsed, firstInputAt) {
        if (!Number.isFinite(elapsed) || elapsed >= HudRules.HINT_MS) return false;
        if (Number.isFinite(firstInputAt) && elapsed - firstInputAt >= HudRules.HINT_AFTER_INPUT_MS) return false;
        return true;
    },

    // ?fps=1 or ?fps=0 in the address wins over the stored toggle
    fpsEnabled(search, stored) {
        const match = /[?&]fps=([^&#]*)/.exec(search || '');
        if (match) return match[1] === '1' || match[1] === 'true';
        return stored === '1';
    },

    // A touch-first device: a phone or tablet, not a laptop with a touch screen
    isTouch(win) {
        if (!win || typeof win.matchMedia !== 'function') return false;
        const matches = query => win.matchMedia(query).matches;
        return matches('(pointer: coarse)') || (matches('(any-pointer: coarse)') && !matches('(any-pointer: fine)'));
    },

    // Every number the HUD and the run's boxes show goes through here: a value that is not a finite number (a
    // division by a section of no time, a lost reading) shows as a dash, never as "Infinity", "NaN" or "∞"
    number(value, { digits = 0, sign = false } = {}) {
        if (typeof value !== 'number' || !Number.isFinite(value)) return '\u2014';
        const text = value.toLocaleString('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits });
        return sign && value > 0 ? `+${text}` : text;
    },

    // The fastest average a section is credited at (km/h): two gates passed in one tick after a put-down, or a
    // section of no time, is no proof of speed
    SECTION_KMH_MAX: 250,

    // Style points for passing a checkpoint: 100, plus 1.5 for each km/h the section's average speed is over 60,
    // times the combo multiplier. A section of no time or no length earns the 100 alone
    checkpointPoints(distanceM, sectionS, multiplier = 1) {
        let base = 100;
        if (Number.isFinite(distanceM) && Number.isFinite(sectionS) && distanceM > 0 && sectionS > 0) {
            const kmh = Math.min(HudRules.SECTION_KMH_MAX, (distanceM / sectionS) * 3.6);
            base += Math.floor(Math.max(0, kmh - 60) * 1.5);
        }
        return Math.round(base * (Number.isFinite(multiplier) ? multiplier : 1));
    },

    // m:ss.t for a stage clock in milliseconds
    stageClock(ms) {
        const tenths = Math.max(0, Math.floor(ms / 100));
        const minutes = Math.floor(tenths / 600);
        const rest = tenths - minutes * 600;
        const seconds = Math.floor(rest / 10);
        return `${minutes}:${String(seconds).padStart(2, '0')}.${rest % 10}`;
    },

    // "Stage 8/14 · Tremola  3:12.4" under the progress bar. A ride of one stage shows nothing: its stage clock
    // is the main clock and "Stage 1/1" says nothing
    stageLine(index, count, name, ms) {
        return count > 1 ? `Stage ${index}/${count} · ${name}  ${HudRules.stageClock(ms)}` : '';
    },

    // The start card of a world ride: the stage's name, with its number only when the ride has more than one
    stageLabel(index, count, name) {
        return count > 1 ? `Stage ${index}/${count} · ${name}` : name;
    },

    // The share of a stage ridden, 0 to 1
    stageShare(s, from, to) {
        return to > from ? Math.min(1, Math.max(0, (s - from) / (to - from))) : 0;
    },

    // "km 3.2 / 13.3": the distance along the whole ride
    kmText(s, length) {
        return `km ${(Math.max(0, s) / 1000).toFixed(1)} / ${(length / 1000).toFixed(1)}`;
    },

    // The ticks of the progress bar: the share of the span (from, to) at which each checkpoint stands. A station
    // that is not a checkpoint (the start, the end, a stage boundary) and one outside the span get no tick, so the
    // ticks are as many as the count beside the bar
    progressMarks(stations, from, to) {
        return (stations || [])
            .filter(station => station.kind === 'gate' && station.s >= from - 0.01 && station.s <= to + 0.01)
            .map(station => HudRules.stageShare(station.s, from, to));
    },

    // -1 stopped, 0 too slow, 1 slow, 2 at pace
    speedBand(mph) {
        return mph <= 0 ? -1 : mph < 20 ? 0 : mph < 40 ? 1 : 2;
    },

    // The gauge arc has pathLength 100: the dash offset is the unfilled part
    gaugeOffset(mph, maxMph) {
        if (!(maxMph > 0)) return 100;
        const fraction = Math.min(1, Math.max(0, mph / maxMph));
        return Math.round((1 - fraction) * 1000) / 10;
    }
};

class Hud {
    constructor(doc = document, win = window) {
        this.doc = doc;
        this.win = win;
        const byId = id => doc.getElementById(id);
        this.el = {
            timer: byId('raceTimer'),
            score: byId('score'),
            combo: byId('comboDisplay'),
            speed: byId('speed'),
            speedBox: byId('hudSpeed'),
            speedFill: byId('speedFill'),
            gates: byId('hudGates'),
            pips: byId('hudGatePips'),
            gateCount: byId('hudGateCount'),
            split: byId('splitPopup'),
            callouts: byId('callouts'),
            hint: byId('hudHint'),
            fps: byId('fps'),
            tuned: byId('hudTuned'),
            quality: byId('hudQuality'),
            mode: byId('hudMode'),
            start: byId('startCard'),
            startLeg: byId('startLeg'),
            progress: byId('hudProgress'),
            progressBar: byId('hudProgressBar'),
            progressMarks: byId('hudProgressMarks'),
            progressCount: byId('hudProgressCount'),
            progressKm: byId('hudProgressKm'),
            stageText: byId('hudStageText')
        };
        // A world ride shows its checkpoints on the progress bar; the classic legs on the pips
        this.progressOn = false;
        this.shown = {};
        this.hintShown = true;
        this.gateTotal = 0;
        this.timers = {};

        this.fpsVisible = HudRules.fpsEnabled(win.location ? win.location.search : '', this.readStored(HudRules.FPS_KEY));
        this.applyFps();
        doc.addEventListener('keydown', event => {
            if (event.code !== 'Backquote' || event.repeat) return;
            if (event.target && /^(INPUT|TEXTAREA)$/.test(event.target.tagName)) return;
            this.toggleFps();
        });
    }

    readStored(key) {
        try {
            return this.win.localStorage ? this.win.localStorage.getItem(key) : null;
        } catch (error) {
            console.warn('HUD setting unreadable:', key, error);
            return null;
        }
    }

    // Rewrites the element's only text node instead of replacing it
    setText(el, text) {
        if (!el) return;
        const node = el.firstChild;
        if (node && node.nodeType === 3 && !node.nextSibling) {
            if (node.nodeValue !== text) node.nodeValue = text;
        } else {
            el.textContent = text;
        }
    }

    setTime(text) {
        if (this.shown.time === text) return;
        this.shown.time = text;
        this.setText(this.el.timer, text);
    }

    setScore(score) {
        if (this.shown.score === score) return;
        this.shown.score = score;
        this.setText(this.el.score, HudRules.number(score));
    }

    setCombo(combo) {
        if (this.shown.combo === combo) return;
        const grew = combo > (this.shown.combo || 0);
        this.shown.combo = combo;
        const el = this.el.combo;
        if (!el) return;
        this.setText(el, combo > 0 ? `COMBO x${combo}` : '');
        if (grew) this.replay(el, 'bump');
    }

    setSpeed(mph, maxMph) {
        const shown = Math.round(mph);
        if (this.shown.speed === shown) return;
        this.shown.speed = shown;
        this.setText(this.el.speed, String(shown));
        const band = HudRules.speedBand(shown);
        if (this.el.speedBox && this.shown.band !== band) {
            this.shown.band = band;
            this.el.speedBox.dataset.band = String(band);
        }
        if (this.el.speedFill) this.el.speedFill.style.strokeDashoffset = String(HudRules.gaugeOffset(shown, maxMph));
    }

    // Checkpoints passed, of how many. One display holds them: the progress bar of a world ride (its ticks and
    // the count at its end), else the pips of a classic leg
    setGates(passed, total) {
        if (this.progressOn) {
            const marks = this.el.progressMarks;
            if (marks) Array.from(marks.children).forEach((mark, i) => mark.classList.toggle('on', i < passed));
            this.setText(this.el.progressCount, `${passed}/${total}`);
            return;
        }
        const pips = this.el.pips;
        if (pips && total !== this.gateTotal) {
            this.gateTotal = total;
            pips.textContent = '';
            // A stage with more gates than fit shows the count alone
            if (total <= HudRules.MAX_PIPS) for (let i = 0; i < total; i++) pips.appendChild(this.doc.createElement('i'));
            // A long leg has 14 to 20 gates: smaller pips keep the row on a phone
            if (total > HudRules.MANY_GATES) pips.dataset.many = '';
            else delete pips.dataset.many;
        }
        if (pips) {
            Array.from(pips.children).forEach((pip, i) => pip.classList.toggle('on', i < passed));
        }
        this.setText(this.el.gateCount, `${passed}/${total}`);
    }

    // The progress element of a world ride, in place of the pips: a bar for the stage being ridden with a tick at
    // each checkpoint (`marks`: shares of the stage, HudRules.progressMarks), the rider's place on it and the
    // count. Leg pages never show it.
    showProgress(marks) {
        const box = this.el.progress;
        if (!box) return;
        box.hidden = false;
        this.progressOn = true;
        if (this.el.gates) this.el.gates.hidden = true;
        this.shown.stageLine = null;
        this.shown.progressShare = null;
        this.shown.progressKm = null;
        const holder = this.el.progressMarks;
        if (holder) {
            holder.textContent = '';
            marks.forEach((share) => {
                const mark = this.doc.createElement('i');
                mark.style.left = `${(share * 100).toFixed(2)}%`;
                holder.appendChild(mark);
            });
        }
    }

    hideProgress() {
        this.progressOn = false;
        if (this.el.progress) this.el.progress.hidden = true;
        if (this.el.gates) this.el.gates.hidden = false;
        this.setText(this.el.progressKm, '');
        this.setText(this.el.stageText, '');
    }

    // Once per frame in a world: only a changed value touches the DOM. `share` is the rider's place in the stage
    // (one custom property moves the fill and the marker), `stageLine` is empty for a ride of one stage
    setProgress(share, km, stageLine = '') {
        const rounded = Math.round(share * 1000) / 10;
        if (this.shown.progressShare !== rounded) {
            this.shown.progressShare = rounded;
            if (this.el.progressBar) this.el.progressBar.style.setProperty('--at', `${rounded}%`);
        }
        if (this.shown.progressKm !== km) {
            this.shown.progressKm = km;
            this.setText(this.el.progressKm, km);
        }
        if (this.shown.stageLine !== stageLine) {
            this.shown.stageLine = stageLine;
            this.setText(this.el.stageText, stageLine);
        }
    }

    // A new run: the hint back on, nothing left over from the last run. The
    // leg name and GO wait a few frames so a slow start cannot swallow them
    startRun(legLabel) {
        this.clearTransient();
        this.doc.body.classList.remove('run-over');
        this.hintShown = true;
        if (this.el.hint) this.el.hint.classList.remove('hidden', 'recall');
        this.pendingStart = legLabel || '';
        this.startDelayFrames = HudRules.START_CARD_DELAY_FRAMES;
    }

    // Once per frame with the race clock
    update(elapsed, firstInputAt) {
        if (this.pendingStart !== null && this.pendingStart !== undefined && --this.startDelayFrames <= 0) {
            this.showStartCard(this.pendingStart);
            this.pendingStart = null;
        }
        this.updateHint(elapsed, firstInputAt);
    }

    showStartCard(label) {
        if (!this.el.start) return;
        this.setText(this.el.startLeg, label);
        this.replay(this.el.start, 'active');
        clearTimeout(this.timers.start);
        this.timers.start = setTimeout(() => this.el.start.classList.remove('active'), HudRules.START_CARD_MS);
    }

    updateHint(elapsed, firstInputAt) {
        const visible = HudRules.hintVisible(elapsed, firstInputAt);
        if (visible === this.hintShown || !this.el.hint) return;
        this.hintShown = visible;
        this.el.hint.classList.toggle('hidden', !visible);
    }

    // The key hints fade after the first seconds; the pause panel brings them back for as long as it is open
    recallHint(on) {
        if (this.el.hint) this.el.hint.classList.toggle('recall', !!on);
    }

    showSplit(html) {
        const popup = this.el.split;
        if (!popup) return false;
        clearTimeout(this.timers.split);
        clearTimeout(this.timers.splitGone);
        popup.innerHTML = html;
        popup.classList.remove('leaving');
        this.replay(popup, 'show');
        this.timers.split = setTimeout(() => this.hideSplit(), HudRules.SPLIT_MS);
        return true;
    }

    hideSplit(immediately = false) {
        const popup = this.el.split;
        clearTimeout(this.timers.split);
        clearTimeout(this.timers.splitGone);
        if (!popup || !popup.classList.contains('show')) return;
        popup.classList.remove('show');
        if (immediately) {
            popup.classList.remove('leaving');
            return;
        }
        popup.classList.add('leaving');
        this.timers.splitGone = setTimeout(() => popup.classList.remove('leaving'), 260);
    }

    // tone: info, good, bad, warn or gold. The same text again restarts the
    // one already shown rather than stacking a copy
    callout(text, tone = 'info', durationMs = 1200) {
        const box = this.el.callouts;
        if (!box) return null;
        let item = Array.from(box.children).find(child => child.textContent === text && !child.classList.contains('leaving'));
        if (item) {
            clearTimeout(item.hudTimer);
            this.replay(item, 'callout');
        } else {
            item = this.doc.createElement('div');
            item.textContent = text;
            box.appendChild(item);
        }
        item.className = `callout tone-${tone}`;
        while (box.children.length > HudRules.CALLOUT_LIMIT) box.firstElementChild.remove();
        item.hudTimer = setTimeout(() => {
            item.classList.add('leaving');
            item.hudTimer = setTimeout(() => item.remove(), 240);
        }, durationMs);
        return item;
    }

    clearTransient() {
        this.pendingStart = null;
        clearTimeout(this.timers.start);
        if (this.el.start) this.el.start.classList.remove('active');
        this.hideSplit(true);
        if (this.el.callouts) {
            Array.from(this.el.callouts.children).forEach(child => {
                clearTimeout(child.hudTimer);
                child.remove();
            });
        }
    }

    setFps(fps) {
        if (this.fpsVisible) this.setText(this.el.fps, `FPS ${fps}`);
    }

    toggleFps() {
        this.fpsVisible = !this.fpsVisible;
        try {
            if (this.win.localStorage) this.win.localStorage.setItem(HudRules.FPS_KEY, this.fpsVisible ? '1' : '0');
        } catch (error) {
            console.warn('FPS setting not saved:', error);
        }
        this.applyFps();
        return this.fpsVisible;
    }

    // The "tuned" tag: this ride had a tuning multiplier off 1 and submits no time (Game.watchTuning)
    setTuned(on) {
        if (this.el.tuned) this.el.tuned.hidden = !on;
    }

    // The graphics level's tag of debug mode (Game.showQuality); '' hides it
    setQuality(text) {
        const el = this.el.quality;
        if (!el) return;
        if (el.textContent !== text) el.textContent = text;
        el.hidden = !text;
    }

    // The rider mode's tag in its slot beside the speed gauge (js/ridermodes.js); `tone` colours it, '' for none
    setMode(name, tone = '') {
        const el = this.el.mode;
        if (!el) return;
        if (el.textContent !== name) el.textContent = name;
        if (tone) el.dataset.tone = tone;
        else delete el.dataset.tone;
    }

    applyFps() {
        if (this.el.fps) this.el.fps.hidden = !this.fpsVisible;
    }

    // Restarts a class-driven CSS animation
    replay(el, className) {
        el.classList.remove(className);
        void el.offsetWidth;
        el.classList.add(className);
    }
}

// Line icons in the HUD's stroke style; emoji render differently on every platform
const UiIcons = {
    paths: {
        lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
        unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.6-1.8"/>',
        trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4"/><path d="M12 13v4M9 20h6M10 17h4"/>',
        check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
        camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
        left: '<path d="M15 5l-7 7 7 7"/>',
        right: '<path d="M9 5l7 7-7 7"/>',
        up: '<path d="M5 15l7-7 7 7"/>',
        down: '<path d="M5 9l7 7 7-7"/>',
        wheelie: '<circle cx="6" cy="17" r="3"/><circle cx="18" cy="9" r="3"/><path d="M6 17L18 9"/>',
        flag: '<path d="M5 21V4M5 4h12l-2 4 2 4H5"/>',
        pause: '<path d="M9 5v14M15 5v14"/>'
    },

    svg(name, className = 'icon') {
        return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true">${UiIcons.paths[name] || ''}</svg>`;
    }
};
