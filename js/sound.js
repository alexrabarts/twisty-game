// The game's sound (.agent/system/sound.md). The rules are data here: the engine voices by engine kind, the gearbox,
// the surfaces, the pass-by voices, the cues and the settings. SoundManager builds one graph of nodes when the sound
// first starts and from then on only moves its parameters, so a frame makes no node. A gesture starts the audio
// (browsers refuse it before one), and nothing here throws when there is no AudioContext (node, an old browser).
const Sound = {};

// Every pitched sound is in A. An idle of IDLE_RPM puts each engine's firing on an A or its fifth (a four fires at
// rpm / 30: 55 Hz), the rev band of each kind is a whole harmonic of its idle, and the gear steps are just intervals
Sound.KEY = Object.freeze({ a4: 440 });
Sound.IDLE_RPM = 1650;

// The note `semitones` from A4, in Hz
Sound.note = (semitones) => Sound.KEY.a4 * Math.pow(2, semitones / 12);

// The engine voices by engine kind. A voice is a harmonic series on the engine's cycle (two turns of the crank, rpm /
// 120), made from its facts:
// `firing` the crank angles (degrees of the 720 of a cycle) at which each cylinder fires, and `levels` each pulse's
// strength (cylinders are never quite equal: that is what gives a triple its howl);
// `corner` the harmonic of the cycle where the pulse's own spectrum falls by half on a closed throttle, and `open`
// how much higher it lies on full load (brighter on load, softer and rounder off it);
// `beat` a second voice detuned by this many cents at `beatLevel`, a slight slow beat;
// `redline` the top of the rev band as a whole multiple of the idle;
// `exhaust` and `intake` the two fixed resonances (Hz, Q, dB; the intake's dB is reached on full load), which stay
// where they are while the pitch moves, as a real exhaust's do;
// `burble` how much the exhaust pops on a closed throttle at high revs; `drive` the saturation; `level` the gain
Sound.ENGINES = Object.freeze({
    single: { firing: [0], levels: [1], corner: 4, open: 2.4, beat: 0, beatLevel: 0, redline: 6, exhaust: [105, 1.1, 5], intake: [480, 1.4, 4], burble: 0.9, drive: 1.8, level: 1 },
    'parallel-twin': { firing: [0, 180], levels: [1, 0.9], corner: 7, open: 2.2, beat: 3, beatLevel: 0.12, redline: 6, exhaust: [140, 1.2, 5], intake: [620, 1.4, 4], burble: 0.6, drive: 1.6, level: 0.95 },
    'v-twin': { firing: [0, 270], levels: [1, 0.94], corner: 6, open: 2.2, beat: 5, beatLevel: 0.16, redline: 6, exhaust: [95, 1.0, 6], intake: [540, 1.3, 4], burble: 0.8, drive: 1.9, level: 1 },
    triple: { firing: [0, 240, 480], levels: [1, 0.8, 0.9], corner: 11, open: 2.3, beat: 3, beatLevel: 0.1, redline: 7, exhaust: [180, 1.2, 5], intake: [820, 1.5, 5], burble: 0.7, drive: 1.5, level: 0.9 },
    four: { firing: [0, 180, 360, 540], levels: [1, 0.9, 0.96, 0.86], corner: 15, open: 2.4, beat: 2, beatLevel: 0.08, redline: 8, exhaust: [230, 1.3, 4], intake: [1100, 1.6, 5], burble: 0.4, drive: 1.3, level: 0.85 },
    v4: { firing: [0, 90, 290, 380], levels: [1, 0.94, 0.9, 0.88], corner: 13, open: 2.4, beat: 4, beatLevel: 0.12, redline: 8, exhaust: [160, 1.2, 5], intake: [960, 1.5, 5], burble: 0.8, drive: 1.5, level: 0.9 },
    // The traffic's cars: a four at a car's revs (an idle of half the bikes', 8 times that at the top), muffled
    car: { firing: [0, 180, 360, 540], levels: [1, 0.95, 0.97, 0.93], corner: 9, open: 1.6, beat: 2, beatLevel: 0.1, redline: 8, idleRpm: 825, exhaust: [120, 1.0, 4], intake: [600, 1.2, 2], burble: 0, drive: 1.2, level: 0.7 }
});

// The kind a bike without an `engine` fact is heard as
Sound.DEFAULT_ENGINE = 'four';

// The harmonics a voice holds (of the cycle): enough for a four's firing to reach its fourth multiple's tenth
Sound.PARTIALS = 64;

// The partial amplitudes of a voice, `load` 0 (closed throttle) or 1 (full load), as the real and imaginary parts of
// a PeriodicWave (index 0 is the constant and stays 0). Each harmonic is the sum of the pulses' phasors at it times
// the pulse's own roll-off. Both tables share one scale, set so the full-load table's magnitudes sum to 1: the wave
// never peaks above 1, and the closed-throttle table is the same voice, quieter in the top
Sound.partials = (voice, load = 1) => {
    const count = Sound.PARTIALS;
    const total = voice.levels.reduce((sum, level) => sum + level, 0);
    const table = (open) => {
        const real = new Float32Array(count + 1), imag = new Float32Array(count + 1);
        const corner = voice.corner * open;
        for (let k = 1; k <= count; k++) {
            let re = 0, im = 0;
            voice.firing.forEach((angle, i) => {
                const phase = -2 * Math.PI * k * angle / 720;
                re += voice.levels[i] * Math.cos(phase);
                im += voice.levels[i] * Math.sin(phase);
            });
            const roll = 1 / (1 + (k / corner) * (k / corner));
            real[k] = (re / total) * roll;
            imag[k] = (im / total) * roll;
        }
        return { real, imag };
    };
    const full = table(voice.open), closed = table(1);
    const sum = Sound.partialSum(full);
    const scale = sum > 0 ? 1 / sum : 0;
    const chosen = load >= 1 ? full : load <= 0 ? closed : null;
    const mix = chosen || { real: full.real.map((v, i) => v * load + closed.real[i] * (1 - load)), imag: full.imag.map((v, i) => v * load + closed.imag[i] * (1 - load)) };
    return { real: mix.real.map(v => v * scale), imag: mix.imag.map(v => v * scale) };
};

// The sum of a table's magnitudes: the most the wave can ever reach
Sound.partialSum = (table) => {
    let sum = 0;
    for (let k = 1; k < table.real.length; k++) sum += Math.hypot(table.real[k], table.imag[k]);
    return sum;
};

// The engine kind a bike is heard as: its `engine` fact (BIKE_MODELS, or a procedural kind's Vehicle.BIKES)
Sound.engineOf = (bikeId) => {
    const models = typeof BIKE_MODELS !== 'undefined' ? BIKE_MODELS : {};
    const kinds = typeof Vehicle !== 'undefined' && Vehicle.BIKES ? Vehicle.BIKES : {};
    const bike = models[bikeId] || kinds[bikeId];
    const kind = bike && bike.engine;
    return Sound.ENGINES[kind] ? kind : Sound.DEFAULT_ENGINE;
};

// The gearbox of the sound and the HUD, never of the physics: the speed and its curve stay the bike's own. Revs are
// the speed's share of the top speed x the gear's ratio, as a share of the redline.
// `steps` each gear's ratio over the next (a fourth, a major third, a minor third, a major tone, a minor tone: a shift
// drops the pitch by that interval), so six gears and first is 2.5 x top;
// `topShare` the revs at top speed in top gear;
// `up` the revs an upshift waits for, `least` on a touch of throttle to `most` on full throttle, and only while the
// throttle is open (`throttle`): a closed throttle never shifts up;
// `down` the revs under which it shifts down; `brakeDown` on the brake it shifts down while the lower gear's revs
// stay under this; `holdS` the least time between two shifts (`brakeHoldS` on the brake);
// `idle` the revs at rest, and `launch` the most the clutch lets first gear rev at a standstill;
// `cutS`, `cutLevel` the ignition cut of an upshift; `shiftS` the time the revs take to the new gear; `blip` the
// rise over the new gear's revs that a downshift's blip makes, and `blipLevel` its gain.
// Each rule holds with every step: up.least / the largest step > down, and down x the largest step < up.least, so
// no speed has two gears that answer it (tests/unit/sound.test.js)
Sound.GEARBOX = Object.freeze({
    steps: [4 / 3, 5 / 4, 6 / 5, 9 / 8, 10 / 9],
    topShare: 0.92,
    up: { least: 0.55, most: 0.9 },
    throttle: 0.08,
    down: 0.36,
    brakeDown: 0.72,
    brake: 0.1,
    holdS: 0.35,
    brakeHoldS: 0.22,
    launch: 0.32,
    cutS: 0.06,
    cutLevel: 0.25,
    shiftS: 0.08,
    blip: 0.12,
    blipLevel: 1.25,
    // The revs of the rev bar's shift light and its limit light
    light: 0.86,
    limit: 0.97
});

// A twist-and-go scooter (its class or kind `scooter`): a belt that varies its own gearing, so no steps. Its revs
// hold in a band while the throttle is open (`band`, low on a touch to high on full) and fall toward the idle on a
// closed one; `engage` the share of top speed under which the clutch still slips
Sound.AUTOMATIC = Object.freeze({ band: [0.5, 0.72], engage: 0.06, fallShare: 0.35 });

// Which gearbox a bike has: the automatic for a scooter, else the six-speed
Sound.gearboxOf = (bikeId) => {
    const models = typeof BIKE_MODELS !== 'undefined' ? BIKE_MODELS : {};
    const bike = models[bikeId];
    const scooter = bike ? bike.cls === 'scooter' || bike.kind === 'scooter' : bikeId === 'scooter';
    return scooter ? { auto: true, ...Sound.AUTOMATIC } : { auto: false, ...Sound.GEARBOX };
};

// The overall ratios of a stepped box, top gear 1: first is the product of every step
Sound.ratios = (steps) => {
    const ratios = [1];
    for (let i = steps.length - 1; i >= 0; i--) ratios.unshift(ratios[0] * steps[i]);
    return ratios;
};

// The idle as a share of the redline
Sound.idleShare = (voice) => 1 / voice.redline;

class Gearbox {
    // `bikeId` the bike (BIKE_MODELS id or kind); `rules` and `voice` default to the bike's own
    constructor(bikeId, rules = Sound.gearboxOf(bikeId), voice = Sound.ENGINES[Sound.engineOf(bikeId)]) {
        this.bike = bikeId;
        this.rules = rules;
        this.voice = voice;
        this.auto = !!rules.auto;
        this.ratios = this.auto ? [] : Sound.ratios(rules.steps);
        this.idle = Sound.idleShare(voice);
        this.neutral = false;
        this.reset();
    }

    reset() {
        this.gear = 1;
        this.revs = this.idle;
        this.target = this.idle;
        this.since = 0;
        this.shift = null;
        this.shiftT = 0;
        this.cut = 1;
        this.shifts = 0;
    }

    get top() {
        return this.ratios.length;
    }

    // The revs (share of the redline) of a gear (1 up) at a share of top speed, before the clutch and the limiter
    revsIn(gear, share) {
        return share * this.ratios[gear - 1] * this.rules.topShare;
    }

    // The revs an upshift waits for at this throttle
    upAt(throttle) {
        const up = this.rules.up;
        return up.least + (up.most - up.least) * Math.min(1, Math.max(0, throttle));
    }

    // One frame: `share` the speed's share of the top speed, `throttle` and `brake` 0 to 1. Sets `gear`, `revs` (the
    // revs heard and shown, share of the redline), `shift` ('up', 'down' or null while one plays) and `cut` (the
    // gain the shift leaves the engine)
    update(dt, share, throttle, brake) {
        const step = Math.min(Math.max(dt, 0), 0.1);
        share = Math.max(0, Number.isFinite(share) ? share : 0);
        throttle = Math.min(1, Math.max(0, throttle || 0));
        brake = Math.min(1, Math.max(0, brake || 0));
        this.since += step;
        if (this.neutral) {
            this.target = this.idle;
            this.shift = null;
            this.cut = 1;
            this.revs += (this.target - this.revs) * (1 - Math.exp(-step / 0.25));
            return this;
        }
        this.target = this.auto ? this.automaticRevs(share, throttle) : this.steppedRevs(step, share, throttle, brake);
        // The shift's own time: an upshift cuts the ignition, a downshift blips over the new gear's revs
        let lag = 0.045;
        this.cut = 1;
        if (this.shift) {
            this.shiftT += step;
            const rules = this.rules;
            if (this.shift === 'up' && this.shiftT < rules.cutS) this.cut = rules.cutLevel;
            if (this.shift === 'down' && this.shiftT < rules.shiftS) {
                this.target *= 1 + rules.blip;
                this.cut = rules.blipLevel;
            }
            lag = rules.shiftS / 2.5;
            if (this.shiftT >= Math.max(rules.cutS, rules.shiftS) * 1.6) this.shift = null;
        }
        this.revs += (this.target - this.revs) * (1 - Math.exp(-step / lag));
        return this;
    }

    steppedRevs(step, share, throttle, brake) {
        const rules = this.rules;
        const braking = brake >= rules.brake;
        const hold = braking ? rules.brakeHoldS : rules.holdS;
        if (this.since >= hold) {
            const now = this.revsIn(this.gear, share);
            if (!braking && throttle >= rules.throttle && this.gear < this.top && now >= this.upAt(throttle)) this.change(1);
            else if (this.gear > 1 && (now < rules.down || (braking && this.revsIn(this.gear - 1, share) < rules.brakeDown))) this.change(-1);
        }
        let revs = this.revsIn(this.gear, share);
        // The clutch slips in first, so the engine revs a little over the wheel at a standstill
        if (this.gear === 1) revs = Math.max(revs, this.idle + (rules.launch - this.idle) * throttle * Math.max(0, 1 - revs / rules.launch));
        return Math.min(1, Math.max(this.idle, revs));
    }

    change(by) {
        this.gear += by;
        this.since = 0;
        this.shift = by > 0 ? 'up' : 'down';
        this.shiftT = 0;
        this.shifts++;
    }

    automaticRevs(share, throttle) {
        const rules = this.rules;
        const [low, high] = rules.band;
        if (throttle >= 0.02) {
            const want = low + (high - low) * throttle;
            // The clutch still slips: the revs rise from the idle as the throttle opens
            return share < rules.engage ? this.idle + (want - this.idle) * Math.min(1, throttle * 2) : want;
        }
        return this.idle + (low - this.idle) * Math.min(1, share / rules.fallShare);
    }
}
Sound.Gearbox = Gearbox;

// The road under the tyres: `freq` and `q` the band of its roar, `level` its gain at speed (reached at `fullMs`),
// `knock` the depth of the rumble each stone makes and `pitchM` the stones' spacing, so the rumble's rate is the
// speed over it. `wet` is laid over any of them: a hiss above `wet.freq`
Sound.SURFACES = Object.freeze({
    asphalt: { freq: 420, q: 0.7, level: 0.012, knock: 0, pitchM: 1 },
    cobbles: { freq: 300, q: 0.9, level: 0.03, knock: 0.7, pitchM: 0.16 },
    loose: { freq: 1500, q: 0.6, level: 0.045, knock: 0.35, pitchM: 0.05 },
    fullMs: 25,
    wet: { freq: 2600, level: 0.02, fullMs: 18 }
});

// Which surface the bike is on: the land off the road is loose (gravel or grass), a route's cobbles grip less
// (Vehicle.syncWorldSurface), everything else is asphalt
Sound.surfaceOf = (vehicle) => {
    if (!vehicle) return 'asphalt';
    if (vehicle.runoff) return 'loose';
    return vehicle.worldSurfaceGrip < 1 ? 'cobbles' : 'asphalt';
};

// The wind: band-limited noise over `low` Hz, its top rising from `from` to `to` Hz with the speed, its gain `level`
// x the speed share squared. It stays above the engine's band and at most `underEngine` of the engine's gain at that
// moment plus `floor`, so it never masks the engine
Sound.WIND = Object.freeze({ low: 380, from: 900, to: 3600, level: 0.04, underEngine: 0.2, floor: 0.008 });

// The others on the road, heard as they pass: the `voices` nearest within `rangeM` m, each `level` at `nearM` m and
// falling with the distance; its lowpass closes with the distance (air and the bodywork); the Doppler shift is the
// speed of sound over that plus the source's speed away from the rider (`sound` m/s), held to `doppler`
Sound.PASSING = Object.freeze({ voices: 3, rangeM: 140, nearM: 7, level: 0.22, carLevel: 0.6, sound: 343, doppler: [0.8, 1.25], lowpass: [700, 7000] });

// How fast each sounded parameter may move, per second, so no frame steps it by more than its share (a frame is at
// most `frameS`): the pitch in octaves (an upshift's drop takes about 0.1 s), the gains in their own units, the
// filters in octaves
Sound.RAMPS = Object.freeze({ pitch: 6, gain: 10, filter: 8, frameS: 1 / 30, aheadS: 0.035 });

// The most a value may move in one frame
Sound.maxStep = (rate, dt) => rate * Math.min(Math.max(dt, 0), Sound.RAMPS.frameS);

// One step of a value toward its target, no further than `rate` per second
Sound.slew = (value, target, rate, dt) => {
    const most = Sound.maxStep(rate, dt);
    return value + Math.max(-most, Math.min(most, target - value));
};

// The cues: notes in A major (semitones from A4) on a soft bell voice, `gap` s apart, each `decay` s long. A new cue
// is a row here; play it with soundManager.cue(name)
Sound.CUES = Object.freeze({
    checkpoint: { notes: [12, 16, 19], gap: 0.085, decay: 0.5, level: 0.35 },
    jump: { notes: [7, 12], gap: 0.05, decay: 0.22, level: 0.25 },
    cone: { notes: [-17, -24], gap: 0.05, decay: 0.18, level: 0.35, knock: true },
    select: { notes: [12], gap: 0, decay: 0.12, level: 0.18 },
    confirm: { notes: [7, 12], gap: 0.06, decay: 0.2, level: 0.2 },
    back: { notes: [7, 0], gap: 0.06, decay: 0.16, level: 0.16 },
    unlock: { notes: [12, 16, 19, 24], gap: 0.09, decay: 0.7, level: 0.3 },
    brake: { notes: [-24], gap: 0, decay: 0.08, level: 0.12, knock: true }
});

// The bell voice of the cues: a fundamental and two soft overtones
Sound.BELL = Object.freeze([0, 1, 0.28, 0.1, 0.04]);

// The settings the menu shows (one row each) and soundManager.setSetting takes: `range` [least, most] and `step` for
// a slider, `default` for both kinds. Kept in localStorage (STORE_KEY)
Sound.SETTINGS = Object.freeze([
    Object.freeze({ id: 'muted', label: 'Mute', kind: 'toggle', default: true }),
    Object.freeze({ id: 'master', label: 'Volume', kind: 'slider', range: [0, 1], step: 0.05, default: 0.7 }),
    Object.freeze({ id: 'balance', label: 'Engine and effects', kind: 'slider', range: [0, 1], step: 0.05, default: 0.5, ends: ['Effects', 'Engine'] })
]);
Sound.STORE_KEY = 'twistySound';

// The value a setting takes from what was given: a toggle a boolean, a slider a finite number held to its range and
// rounded to its step; anything else the default
Sound.settingValue = (row, value) => {
    if (row.kind === 'toggle') return typeof value === 'boolean' ? value : value === 'true' || value === 1 ? true : value === 'false' || value === 0 ? false : row.default;
    const number = typeof value === 'string' ? Number(value) : value;
    if (typeof number !== 'number' || !Number.isFinite(number)) return row.default;
    const [least, most] = row.range;
    const stepped = row.step ? Math.round(number / row.step) * row.step : number;
    return Math.min(most, Math.max(least, Number(stepped.toFixed(6))));
};

// The settings stored, each one checked, the default for any that is missing or broken
Sound.readSettings = (storage) => {
    let stored = {};
    try {
        const text = storage ? storage.getItem(Sound.STORE_KEY) : null;
        if (text) stored = JSON.parse(text) || {};
    } catch (error) {
        console.warn('Sound: settings unreadable, the defaults stand:', error);
        stored = {};
    }
    const settings = {};
    Sound.SETTINGS.forEach(row => { settings[row.id] = row.id in stored ? Sound.settingValue(row, stored[row.id]) : row.default; });
    return settings;
};

// The two buses' gains from the balance: 0.5 leaves both at 1, toward an end the other side falls to nothing
Sound.busGains = (balance) => ({ engine: Math.min(1, 2 * balance), effects: Math.min(1, 2 * (1 - balance)) });

// The master gain of a volume: the ear hears a square law as even steps
Sound.masterGain = (settings) => (settings.muted ? 0 : settings.master * settings.master);

// The levels of the mix (gains before the master): the player's engine, the reverb's send, the compressor
Sound.MIX = Object.freeze({
    engine: 0.6,
    // The engine's level into the saturation: the two resonances lift a wave of peak 1 by up to 10 dB, and this keeps
    // their sum inside the curve's soft part, never at its flat end
    drive: 0.3,
    reverb: { send: 0.16, seconds: 1.3, decay: 3.2, lowpass: 0.35 },
    compressor: { threshold: -16, knee: 10, ratio: 3, attack: 0.008, release: 0.25 },
    scrape: { freq: 1900, q: 1.6, level: 0.16, slideRad: 0.4, fallMs: 12 },
    burble: { rate: 9, least: 0.45, level: 0.5 }
});

class SoundManager {
    // `options.context` makes the AudioContext (tests pass a fake, the clip tool an OfflineAudioContext),
    // `options.storage` keeps the settings, `options.doc` hears the first gesture
    constructor(options = {}) {
        this.makeContext = options.context || SoundManager.browserContext;
        this.storage = 'storage' in options ? options.storage : SoundManager.browserStorage();
        this.settings = Sound.readSettings(this.storage);
        this.watchers = [];
        this.audioContext = null;
        this.graph = null;
        this.waves = {};
        this.live = false;
        this.state = { pitch: Math.log2(Sound.IDLE_RPM / 120), load: 0, gain: 0, tone: Math.log2(600), wind: 0, windTop: Math.log2(Sound.WIND.from), road: 0, roadFreq: Math.log2(Sound.SURFACES.asphalt.freq), knock: 0, knockRate: 1, wet: 0, scrape: 0, intake: 0, burbleAt: 0 };
        this.voiceKind = null;
        const doc = 'doc' in options ? options.doc : (typeof document !== 'undefined' ? document : null);
        if (doc && doc.addEventListener) {
            const wake = () => { if (this.enabled) this.wake(); };
            ['pointerdown', 'keydown', 'touchend'].forEach(type => doc.addEventListener(type, wake, { capture: true, passive: true }));
        }
    }

    static browserContext() {
        if (typeof window === 'undefined') return null;
        const Context = window.AudioContext || window.webkitAudioContext;
        return Context ? new Context({ latencyHint: 'interactive' }) : null;
    }

    static browserStorage() {
        try {
            return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
        } catch (error) {
            console.warn('Sound: no storage, the settings last for this page only:', error);
            return null;
        }
    }

    get enabled() {
        return !this.settings.muted;
    }

    getSetting(id) {
        return id in this.settings ? this.settings[id] : undefined;
    }

    // Sets one row of Sound.SETTINGS, keeps it and applies it at once; returns the value it took
    setSetting(id, value) {
        const row = Sound.SETTINGS.find(r => r.id === id);
        if (!row) {
            console.warn('Sound: no setting', id);
            return undefined;
        }
        const next = Sound.settingValue(row, value);
        if (this.settings[id] === next) return next;
        this.settings[id] = next;
        try {
            if (this.storage) this.storage.setItem(Sound.STORE_KEY, JSON.stringify(this.settings));
        } catch (error) {
            console.warn('Sound: setting not saved:', error);
        }
        if (id === 'muted') {
            if (next) this.stopEngineSound();
            else this.wake();
        }
        this.applySettings();
        this.watchers.forEach(fn => {
            try { fn(id, next); } catch (error) { console.error('Sound: a settings watcher failed:', error); }
        });
        return next;
    }

    // `fn(id, value)` after each change, so a menu shows a change the M key made
    watchSettings(fn) {
        this.watchers.push(fn);
        return () => { this.watchers = this.watchers.filter(w => w !== fn); };
    }

    applySettings() {
        const g = this.graph;
        if (!g) return;
        const t = this.audioContext.currentTime;
        const buses = Sound.busGains(this.settings.balance);
        g.master.gain.setTargetAtTime(Sound.masterGain(this.settings), t, 0.03);
        g.engineBus.gain.setTargetAtTime(buses.engine, t, 0.03);
        g.fxBus.gain.setTargetAtTime(buses.effects, t, 0.03);
    }

    // The context and the graph, once; then the context running. Only after a gesture does the browser let it run
    wake() {
        if (!this.audioContext) {
            try {
                this.audioContext = this.makeContext();
            } catch (error) {
                console.warn('Sound: no audio here:', error);
                this.audioContext = null;
            }
            if (!this.audioContext) {
                this.makeContext = () => null;
                return false;
            }
        }
        if (!this.graph) {
            try {
                this.build();
            } catch (error) {
                console.error('Sound: the graph could not be built:', error);
                this.graph = null;
                return false;
            }
        }
        if (this.audioContext.state === 'suspended' && this.audioContext.resume) {
            const resumed = this.audioContext.resume();
            if (resumed && resumed.catch) resumed.catch(error => console.warn('Sound: the context did not resume:', error));
        }
        return true;
    }

    // The voice of an engine kind, made once: the full-load and the closed-throttle waves
    wavesOf(kind) {
        if (this.waves[kind]) return this.waves[kind];
        const voice = Sound.ENGINES[kind];
        const make = (load) => {
            const table = Sound.partials(voice, load);
            return this.audioContext.createPeriodicWave(table.real, table.imag, { disableNormalization: true });
        };
        this.waves[kind] = { load: make(1), off: make(0) };
        return this.waves[kind];
    }

    // Every node the game's sound uses, made here once. The chain: each source into its bus (engine or effects), the
    // two buses into the master, the master into a compressor and the speakers, with a send to a short reverb that
    // comes back into the compressor
    build() {
        const ctx = this.audioContext;
        const mix = Sound.MIX;
        const g = {};
        const gain = (value, to) => {
            const node = ctx.createGain();
            node.gain.value = value;
            if (to) node.connect(to);
            return node;
        };
        const filter = (type, freq, q, to) => {
            const node = ctx.createBiquadFilter();
            node.type = type;
            node.frequency.value = freq;
            node.Q.value = q;
            if (to) node.connect(to);
            return node;
        };

        g.compressor = ctx.createDynamicsCompressor();
        const c = mix.compressor;
        g.compressor.threshold.value = c.threshold;
        g.compressor.knee.value = c.knee;
        g.compressor.ratio.value = c.ratio;
        g.compressor.attack.value = c.attack;
        g.compressor.release.value = c.release;
        g.compressor.connect(ctx.destination);
        g.master = gain(0, g.compressor);
        g.reverb = ctx.createConvolver();
        g.reverb.buffer = this.impulse();
        g.reverb.connect(g.compressor);
        g.send = gain(mix.reverb.send, g.reverb);
        g.master.connect(g.send);
        const buses = Sound.busGains(this.settings.balance);
        g.engineBus = gain(buses.engine, g.master);
        g.fxBus = gain(buses.effects, g.master);

        // The player's engine: two waves of one voice at one pitch (full load and closed throttle, crossfaded by the
        // throttle), a detuned copy for the beat, the two fixed resonances, a tone filter that opens on load, a gentle
        // saturation and the engine's gain
        g.engineGain = gain(0, g.engineBus);
        g.shaper = ctx.createWaveShaper();
        g.shaper.curve = SoundManager.saturation(1.6);
        g.shaper.oversample = '2x';
        g.shaper.connect(g.engineGain);
        g.tone = filter('lowpass', 1200, 0.5, g.shaper);
        g.intake = filter('peaking', 800, 1.4, g.tone);
        g.exhaust = filter('peaking', 150, 1.2, g.intake);
        g.engineSum = gain(mix.drive, g.exhaust);
        g.loadGain = gain(0, g.engineSum);
        g.offGain = gain(1, g.engineSum);
        g.beatGain = gain(0, g.engineSum);
        g.loadOsc = ctx.createOscillator();
        g.offOsc = ctx.createOscillator();
        g.beatOsc = ctx.createOscillator();
        [[g.loadOsc, g.loadGain], [g.offOsc, g.offGain], [g.beatOsc, g.beatGain]].forEach(([osc, to]) => {
            osc.frequency.value = Sound.IDLE_RPM / 120;
            osc.connect(to);
        });

        // One loop of noise feeds the wind, the road, the wet hiss, the scrape and the exhaust's pops
        g.noise = ctx.createBufferSource();
        g.noise.buffer = this.noiseBuffer();
        g.noise.loop = true;
        g.windGain = gain(0, g.fxBus);
        g.windTop = filter('lowpass', Sound.WIND.from, 0.5, g.windGain);
        g.windLow = filter('highpass', Sound.WIND.low, 0.5, g.windTop);
        g.noise.connect(g.windLow);
        g.roadGain = gain(0, g.fxBus);
        g.roadKnock = gain(1, g.roadGain);
        g.roadBand = filter('bandpass', Sound.SURFACES.asphalt.freq, Sound.SURFACES.asphalt.q, g.roadKnock);
        g.noise.connect(g.roadBand);
        g.knockOsc = ctx.createOscillator();
        g.knockOsc.type = 'sine';
        g.knockOsc.frequency.value = 1;
        g.knockDepth = gain(0, g.roadKnock.gain);
        g.knockOsc.connect(g.knockDepth);
        g.wetGain = gain(0, g.fxBus);
        g.wetBand = filter('highpass', Sound.SURFACES.wet.freq, 0.6, g.wetGain);
        g.noise.connect(g.wetBand);
        g.scrapeGain = gain(0, g.fxBus);
        g.scrapeBand = filter('bandpass', mix.scrape.freq, mix.scrape.q, g.scrapeGain);
        g.noise.connect(g.scrapeBand);
        g.burbleGain = gain(0, g.engineBus);
        g.burbleBand = filter('bandpass', 300, 2.5, g.burbleGain);
        g.noise.connect(g.burbleBand);

        // The others on the road: a few voices, each given to the nearest source in turn
        g.passing = [];
        for (let i = 0; i < Sound.PASSING.voices; i++) {
            const out = gain(0, g.engineBus);
            const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
            if (pan) pan.connect(out);
            const lowpass = filter('lowpass', 2000, 0.6, pan || out);
            const osc = ctx.createOscillator();
            osc.connect(lowpass);
            g.passing.push({ osc, lowpass, pan, out, source: null, kind: null, distance: 0, radial: 0, x: 0, z: 0, speed: 0, gearbox: null, level: 0 });
        }

        const t = ctx.currentTime;
        [g.loadOsc, g.offOsc, g.beatOsc, g.knockOsc, ...g.passing.map(p => p.osc)].forEach(osc => osc.start(t));
        g.noise.start(t);
        this.graph = g;
        this.setVoice(Sound.DEFAULT_ENGINE);
        g.passing.forEach(p => p.osc.setPeriodicWave(this.wavesOf('car').off));
        this.applySettings();
    }

    // Gives the player's engine the voice of an engine kind (a new bike); no node is made
    setVoice(kind) {
        if (!this.graph || this.voiceKind === kind) return;
        const g = this.graph, voice = Sound.ENGINES[kind];
        const waves = this.wavesOf(kind);
        g.loadOsc.setPeriodicWave(waves.load);
        g.offOsc.setPeriodicWave(waves.off);
        g.beatOsc.setPeriodicWave(waves.load);
        g.beatOsc.detune.value = voice.beat;
        g.shaper.curve = SoundManager.saturation(voice.drive);
        const t = this.audioContext.currentTime;
        g.exhaust.frequency.setValueAtTime(voice.exhaust[0], t);
        g.exhaust.Q.setValueAtTime(voice.exhaust[1], t);
        g.exhaust.gain.setValueAtTime(voice.exhaust[2], t);
        g.intake.frequency.setValueAtTime(voice.intake[0], t);
        g.intake.Q.setValueAtTime(voice.intake[1], t);
        g.burbleBand.frequency.setValueAtTime(voice.exhaust[0] * 3, t);
        this.voiceKind = kind;
    }

    // A soft clip: tanh of the drive, scaled back so a full-scale input still reaches 1
    static saturation(drive) {
        const count = 1024, curve = new Float32Array(count), norm = Math.tanh(drive);
        for (let i = 0; i < count; i++) {
            const x = (i / (count - 1)) * 2 - 1;
            curve[i] = Math.tanh(drive * x) / norm;
        }
        return curve;
    }

    // Two seconds of white noise, made once
    noiseBuffer() {
        if (this.noise) return this.noise;
        const ctx = this.audioContext;
        const length = Math.floor(ctx.sampleRate * 2);
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let seed = 1234567;
        for (let i = 0; i < length; i++) {
            seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
            data[i] = (seed / 4294967296) * 2 - 1;
        }
        this.noise = buffer;
        return buffer;
    }

    // The reverb's impulse: stereo noise falling away over a little more than a second, its top dulled as it falls,
    // as an open valley answers; made once
    impulse() {
        const ctx = this.audioContext, rule = Sound.MIX.reverb;
        const length = Math.floor(ctx.sampleRate * rule.seconds);
        const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
        for (let channel = 0; channel < 2; channel++) {
            const data = buffer.getChannelData(channel);
            let seed = 99991 + channel * 7919, low = 0;
            for (let i = 0; i < length; i++) {
                seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
                const white = (seed / 4294967296) * 2 - 1;
                const fall = i / length;
                low += (white - low) * (1 - rule.lowpass * fall);
                // (a few ms of silence first: the nearest rock face is some metres off)
                data[i] = i < ctx.sampleRate * 0.012 ? 0 : low * Math.exp(-rule.decay * fall * rule.seconds);
            }
        }
        return buffer;
    }

    // Ramps a parameter to a value by the end of this frame's look-ahead: a straight line from where it was, so it
    // never steps
    ramp(param, value, at) {
        param.linearRampToValueAtTime(value, at);
    }

    // Once a frame with the ride's state (Game.soundFrame); `frame` null fades the ride's sound out
    update(frame) {
        if (!frame) {
            this.stopEngineSound();
            return;
        }
        if (!this.enabled || !this.wake()) return;
        const ctx = this.audioContext, g = this.graph, s = this.state, ramps = Sound.RAMPS;
        const dt = Math.min(Math.max(frame.dt || 0, 0), ramps.frameS);
        const at = ctx.currentTime + ramps.aheadS;
        this.live = true;
        const kind = frame.engine && Sound.ENGINES[frame.engine] ? frame.engine : Sound.DEFAULT_ENGINE;
        this.setVoice(kind);
        const voice = Sound.ENGINES[kind];
        const box = frame.gearbox;
        const running = !!box && !box.neutral && !frame.engineOff;
        const idleRpm = voice.idleRpm || Sound.IDLE_RPM;
        const rpm = idleRpm * voice.redline * (box ? box.revs : 1 / voice.redline);
        const throttle = Math.min(1, Math.max(0, frame.throttle || 0));

        s.pitch = Sound.slew(s.pitch, Math.log2(rpm / 120), ramps.pitch, dt);
        const f0 = Math.pow(2, s.pitch);
        this.ramp(g.loadOsc.frequency, f0, at);
        this.ramp(g.offOsc.frequency, f0, at);
        this.ramp(g.beatOsc.frequency, f0, at);
        s.load = Sound.slew(s.load, running ? throttle : 0, ramps.gain, dt);
        this.ramp(g.loadGain.gain, s.load, at);
        this.ramp(g.offGain.gain, 1 - s.load, at);
        this.ramp(g.beatGain.gain, voice.beatLevel, at);
        const revs = box ? box.revs : 0;
        const want = running ? Sound.MIX.engine * voice.level * (0.65 + 0.35 * s.load) * (0.7 + 0.3 * revs) * box.cut : 0;
        s.gain = Sound.slew(s.gain, want, ramps.gain, dt);
        this.ramp(g.engineGain.gain, s.gain, at);
        s.tone = Sound.slew(s.tone, Math.log2(Math.min(6000, Math.max(350, f0 * (9 + 27 * s.load)))), ramps.filter, dt);
        this.ramp(g.tone.frequency, Math.pow(2, s.tone), at);
        s.intake = Sound.slew(s.intake, voice.intake[2] * s.load, ramps.gain * 4, dt);
        this.ramp(g.intake.gain, s.intake, at);
        this.burble(frame, voice, running, revs, throttle);

        // The wind, under the engine
        const speed = Math.max(0, frame.speed || 0);
        const share = Math.min(1.2, speed / Math.max(1, frame.maxSpeed || 60));
        const wind = Sound.WIND;
        s.wind = Sound.slew(s.wind, Math.min(wind.level * share * share, s.gain * wind.underEngine + wind.floor * share), ramps.gain, dt);
        this.ramp(g.windGain.gain, s.wind, at);
        s.windTop = Sound.slew(s.windTop, Math.log2(wind.from + (wind.to - wind.from) * Math.min(1, share)), ramps.filter, dt);
        this.ramp(g.windTop.frequency, Math.pow(2, s.windTop), at);

        // The tyres on the road, and the wet over it
        const surfaces = Sound.SURFACES;
        const road = surfaces[frame.surface] || surfaces.asphalt;
        const rolling = frame.crashed ? 0 : Math.min(1, speed / surfaces.fullMs);
        s.road = Sound.slew(s.road, road.level * rolling, ramps.gain, dt);
        this.ramp(g.roadGain.gain, s.road, at);
        s.roadFreq = Sound.slew(s.roadFreq, Math.log2(road.freq), ramps.filter, dt);
        this.ramp(g.roadBand.frequency, Math.pow(2, s.roadFreq), at);
        s.knock = Sound.slew(s.knock, road.knock * 0.5, ramps.gain, dt);
        this.ramp(g.knockDepth.gain, s.knock, at);
        this.ramp(g.roadKnock.gain, 1 - s.knock, at);
        s.knockRate = Sound.slew(s.knockRate, Math.max(1, Math.min(120, speed / road.pitchM)), 400, dt);
        this.ramp(g.knockOsc.frequency, s.knockRate, at);
        s.wet = Sound.slew(s.wet, frame.wet && !frame.crashed ? surfaces.wet.level * Math.min(1, speed / surfaces.wet.fullMs) : 0, ramps.gain, dt);
        this.ramp(g.wetGain.gain, s.wet, at);

        // A slide: the tyres scrubbing on the land, or the bike on its side after a fall
        const scrape = Sound.MIX.scrape;
        const slide = frame.crashed ? Math.min(1, speed / scrape.fallMs) : Math.min(1, Math.abs(frame.slide || 0) / scrape.slideRad);
        s.scrape = Sound.slew(s.scrape, scrape.level * slide, ramps.gain, dt);
        this.ramp(g.scrapeGain.gain, s.scrape, at);

        this.updatePassing(frame, dt, at);
    }

    // The exhaust pops on a closed throttle at high revs: short swells of the noise at the exhaust's band, scheduled
    // on the one gain (no node is made)
    burble(frame, voice, running, revs, throttle) {
        const rule = Sound.MIX.burble, s = this.state, g = this.graph;
        const t = this.audioContext.currentTime;
        if (!running || throttle > 0.05 || revs < rule.least || !voice.burble || t < s.burbleAt) return;
        const random = frame.random || Math.random;
        if (random() > rule.rate * voice.burble * Math.min(frame.dt || 0, Sound.RAMPS.frameS)) return;
        const when = t + Sound.RAMPS.aheadS + random() * 0.02;
        const level = rule.level * voice.burble * s.gain * (0.5 + random() * 0.5);
        g.burbleGain.gain.setTargetAtTime(level, when, 0.004);
        g.burbleGain.gain.setTargetAtTime(0, when + 0.018, 0.02);
        s.burbleAt = when + 0.06;
    }

    // The nearest of the crew and the cars, each on a voice of its own engine kind, by distance and with its Doppler
    // shift. `frame.others` is the traffic (motorcycles and cars); `frame.x`, `frame.z`, `frame.heading` the rider
    updatePassing(frame, dt, at) {
        const g = this.graph, rule = Sound.PASSING;
        const traffic = frame.others;
        const pool = g.passing;
        const taken = this.passingTaken || (this.passingTaken = new Array(pool.length).fill(null));
        // The nearest sources in range, by insertion into a fixed list (no array is made)
        const near = this.passingNear || (this.passingNear = pool.map(() => ({ source: null, d: Infinity, car: false })));
        near.forEach(n => { n.source = null; n.d = Infinity; });
        const offer = (source, group, car) => {
            if (!group || group.visible === false) return;
            const dx = group.position.x - frame.x, dz = group.position.z - frame.z;
            const d = Math.hypot(dx, dz);
            if (!(d < rule.rangeM)) return;
            for (let i = 0; i < near.length; i++) {
                if (d < near[i].d) {
                    for (let j = near.length - 1; j > i; j--) { near[j].source = near[j - 1].source; near[j].d = near[j - 1].d; near[j].car = near[j - 1].car; }
                    near[i].source = source; near[i].d = d; near[i].car = car;
                    return;
                }
            }
        };
        if (traffic && Number.isFinite(frame.x)) {
            (traffic.motorcycles || []).forEach(m => offer(m, m.bikeGroup, false));
            (traffic.cars || []).forEach(c => offer(c, c.carGroup, true));
        }
        // A voice keeps its source while that one is still among the nearest, so a pass is heard whole
        pool.forEach((voice, i) => {
            const still = voice.source && near.some(n => n.source === voice.source);
            if (!still) taken[i] = null;
            else taken[i] = voice.source;
        });
        near.forEach(n => {
            if (!n.source || taken.includes(n.source)) return;
            const free = taken.indexOf(null);
            if (free < 0) return;
            taken[free] = n.source;
            this.assignPassing(pool[free], n.source, n.car);
        });
        pool.forEach((voice, i) => {
            if (!taken[i]) {
                voice.source = null;
                voice.level = Sound.slew(voice.level, 0, Sound.RAMPS.gain, dt);
                this.ramp(voice.out.gain, voice.level, at);
                return;
            }
            this.stepPassing(voice, frame, dt, at);
        });
    }

    assignPassing(voice, source, car) {
        voice.source = source;
        const kind = car ? 'car' : Sound.engineOf(source.model);
        if (voice.kind !== kind) {
            voice.osc.setPeriodicWave(this.wavesOf(kind).load);
            voice.kind = kind;
        }
        voice.car = car;
        voice.gearbox = new Gearbox(car ? 'car' : source.model, car ? { auto: false, ...Sound.GEARBOX } : Sound.gearboxOf(source.model), Sound.ENGINES[kind]);
        const group = car ? source.carGroup : source.bikeGroup;
        voice.x = group.position.x;
        voice.z = group.position.z;
        voice.distance = NaN;
        voice.radial = 0;
        voice.speed = 0;
    }

    stepPassing(voice, frame, dt, at) {
        const rule = Sound.PASSING;
        const group = voice.car ? voice.source.carGroup : voice.source.bikeGroup;
        const x = group.position.x, z = group.position.z;
        const dx = x - frame.x, dz = z - frame.z;
        const d = Math.max(0.5, Math.hypot(dx, dz));
        if (dt > 0) {
            const moved = Math.hypot(x - voice.x, z - voice.z) / dt;
            const accel = (moved - voice.speed) / dt;
            voice.speed += (moved - voice.speed) * Math.min(1, dt * 4);
            if (Number.isFinite(voice.distance)) voice.radial += ((d - voice.distance) / dt - voice.radial) * Math.min(1, dt * 6);
            voice.gearbox.update(dt, voice.speed / (voice.car ? 40 : 60), accel > 0.3 ? 0.7 : 0.15, accel < -1.5 ? 0.5 : 0);
        }
        voice.x = x;
        voice.z = z;
        voice.distance = d;
        const v = Sound.ENGINES[voice.kind];
        const rpm = (v.idleRpm || Sound.IDLE_RPM) * v.redline * voice.gearbox.revs;
        const [least, most] = rule.doppler;
        const shift = Math.min(most, Math.max(least, rule.sound / (rule.sound + voice.radial)));
        this.ramp(voice.osc.frequency, (rpm / 120) * shift, at);
        const near = rule.nearM / Math.max(rule.nearM, d);
        const fade = Math.min(1, (rule.rangeM - d) / (rule.rangeM * 0.25));
        voice.level = Sound.slew(voice.level, rule.level * (voice.car ? rule.carLevel : 1) * near * Math.max(0, fade), Sound.RAMPS.gain, dt);
        this.ramp(voice.out.gain, voice.level, at);
        const [dull, clear] = rule.lowpass;
        this.ramp(voice.lowpass.frequency, dull + (clear - dull) * near, at);
        if (voice.pan) {
            // The rider's right is (-cos h, sin h) on the ground
            const h = frame.heading || 0;
            const pan = (dx * -Math.cos(h) + dz * Math.sin(h)) / d;
            this.ramp(voice.pan.pan, Math.max(-0.9, Math.min(0.9, pan)), at);
        }
    }

    // Fades every sound of the ride (a crash's own sound plays on); no node stops, so nothing clicks and the next ride
    // starts on the same graph
    stopEngineSound() {
        if (!this.graph || !this.live) return;
        this.live = false;
        const g = this.graph, t = this.audioContext.currentTime, s = this.state;
        [g.engineGain, g.windGain, g.roadGain, g.wetGain, g.scrapeGain, g.burbleGain, ...g.passing.map(p => p.out)].forEach(node => {
            // (held where it is, not cut back to the last event's value: that would step)
            if (node.gain.cancelAndHoldAtTime) node.gain.cancelAndHoldAtTime(t);
            else node.gain.cancelScheduledValues(t);
            node.gain.setTargetAtTime(0, t, 0.06);
        });
        s.gain = s.wind = s.road = s.wet = s.scrape = 0;
        g.passing.forEach(p => { p.level = 0; p.source = null; });
        if (this.passingTaken) this.passingTaken.fill(null);
    }

    // The old call: today's engine from a speed share and a throttle, with no gearbox (kept for a caller without one)
    playEngineSound(speed = 0, throttle = 0) {
        const box = this.looseBox || (this.looseBox = new Gearbox('sport'));
        box.update(1 / 60, speed, throttle, 0);
        this.update({ dt: 1 / 60, gearbox: box, throttle, speed: speed * 60, maxSpeed: 60, engine: Sound.DEFAULT_ENGINE });
    }

    // A cue of Sound.CUES on the bell voice, in the effects bus
    cue(name) {
        const rule = Sound.CUES[name];
        if (!rule || !this.enabled || !this.wake()) return;
        const ctx = this.audioContext, g = this.graph;
        const t = ctx.currentTime + 0.01;
        const bell = this.bellWave || (this.bellWave = ctx.createPeriodicWave(new Float32Array(Sound.BELL.length), Float32Array.from(Sound.BELL)));
        rule.notes.forEach((semitones, i) => {
            const start = t + i * rule.gap;
            const osc = ctx.createOscillator();
            const env = ctx.createGain();
            if (rule.knock) osc.type = 'sine';
            else osc.setPeriodicWave(bell);
            osc.frequency.setValueAtTime(Sound.note(semitones), start);
            if (rule.knock) osc.frequency.exponentialRampToValueAtTime(Sound.note(semitones) * 0.7, start + rule.decay);
            env.gain.setValueAtTime(0, start);
            env.gain.linearRampToValueAtTime(rule.level, start + 0.006);
            env.gain.setTargetAtTime(0, start + 0.006, rule.decay / 4);
            osc.connect(env);
            env.connect(g.fxBus);
            osc.start(start);
            osc.stop(start + rule.decay * 1.6 + 0.05);
            osc.onended = () => { osc.disconnect(); env.disconnect(); };
        });
    }

    playCheckpointSound() { this.cue('checkpoint'); }
    playConeHitSound() { this.cue('cone'); }
    playJumpSound() { this.cue('jump'); }
    playBrakeSound() { this.cue('brake'); }

    // A marmot's alarm whistle (js/world/marmots.js), `metres` away: one short, high call that rises and falls,
    // quieter with distance, in the effects bus
    playWhistle(metres = 20) {
        if (!this.enabled || !this.wake()) return;
        const ctx = this.audioContext, g = this.graph;
        const t = ctx.currentTime + 0.01, level = 0.16 * Math.min(1, 20 / Math.max(10, metres));
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(2300, t);
        osc.frequency.linearRampToValueAtTime(3100, t + 0.07);
        osc.frequency.linearRampToValueAtTime(2500, t + 0.28);
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(level, t + 0.02);
        env.gain.setTargetAtTime(0, t + 0.2, 0.04);
        osc.connect(env);
        env.connect(g.fxBus);
        osc.start(t);
        osc.stop(t + 0.45);
        osc.onended = () => { osc.disconnect(); env.disconnect(); };
    }

    // A crash: a low thud and a short burst of dulled noise, both soft; the scrape that follows is the bike sliding
    // (update, `crashed`)
    playCrashSound() {
        if (!this.enabled || !this.wake()) return;
        const ctx = this.audioContext, g = this.graph;
        const t = ctx.currentTime + 0.005;
        const thud = ctx.createOscillator();
        const thudGain = ctx.createGain();
        thud.type = 'sine';
        thud.frequency.setValueAtTime(Sound.note(-36), t);
        thud.frequency.exponentialRampToValueAtTime(Sound.note(-43), t + 0.35);
        thudGain.gain.setValueAtTime(0, t);
        thudGain.gain.linearRampToValueAtTime(0.5, t + 0.008);
        thudGain.gain.setTargetAtTime(0, t + 0.008, 0.09);
        thud.connect(thudGain);
        thudGain.connect(g.fxBus);
        thud.start(t);
        thud.stop(t + 0.7);
        const burst = ctx.createBufferSource();
        burst.buffer = this.noiseBuffer();
        const dull = ctx.createBiquadFilter();
        dull.type = 'lowpass';
        dull.frequency.setValueAtTime(1600, t);
        dull.frequency.exponentialRampToValueAtTime(400, t + 0.5);
        const burstGain = ctx.createGain();
        burstGain.gain.setValueAtTime(0, t);
        burstGain.gain.linearRampToValueAtTime(0.32, t + 0.01);
        burstGain.gain.setTargetAtTime(0, t + 0.03, 0.14);
        burst.connect(dull);
        dull.connect(burstGain);
        burstGain.connect(g.fxBus);
        burst.start(t, Math.random());
        burst.stop(t + 0.9);
        thud.onended = () => { thud.disconnect(); thudGain.disconnect(); };
        burst.onended = () => { burst.disconnect(); dull.disconnect(); burstGain.disconnect(); };
    }

    // A tyre's short squeal on a wall brush: a narrow band of noise falling from E6, soft
    playTireScreech() {
        if (!this.enabled || !this.wake()) return;
        const ctx = this.audioContext, g = this.graph;
        const t = ctx.currentTime + 0.005;
        const source = ctx.createBufferSource();
        source.buffer = this.noiseBuffer();
        const band = ctx.createBiquadFilter();
        band.type = 'bandpass';
        band.Q.value = 9;
        band.frequency.setValueAtTime(Sound.note(19), t);
        band.frequency.exponentialRampToValueAtTime(Sound.note(7), t + 0.3);
        const env = ctx.createGain();
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(0.35, t + 0.03);
        env.gain.setTargetAtTime(0, t + 0.12, 0.07);
        source.connect(band);
        band.connect(env);
        env.connect(g.fxBus);
        source.start(t, Math.random());
        source.stop(t + 0.6);
        source.onended = () => { source.disconnect(); band.disconnect(); env.disconnect(); };
    }

    // The M key: mute or not, kept like any setting
    toggleSound() {
        const muted = this.setSetting('muted', !this.settings.muted);
        if (typeof showCallout === 'function') showCallout(`Sound ${muted ? 'off' : 'on'}`, muted ? 'info' : 'good', 1000);
        return !muted;
    }

    // A hidden tab: everything fades, then the context sleeps until the next frame of a ride
    sleep() {
        this.stopEngineSound();
        const ctx = this.audioContext;
        if (ctx && ctx.state === 'running' && ctx.suspend) setTimeout(() => { if (!this.live && ctx.suspend) ctx.suspend().catch(() => {}); }, 300);
    }
}
Sound.SoundManager = SoundManager;
