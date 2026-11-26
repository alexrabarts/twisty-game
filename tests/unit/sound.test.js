/**
 * The sound engine (js/sound.js, .agent/system/sound.md): the gearbox of the sound and the HUD (its ratios, its
 * shift points, its hysteresis, no hunting at a steady speed, the scooter with no steps), the gear indicator's text,
 * the voices' partial tables, the ramps that never step, no node made per frame, the settings and a page without
 * audio.
 */

import { readFileSync } from 'fs';

const read = name => readFileSync(new URL(`../../js/${name}`, import.meta.url), 'utf8');

// The bike data alone, cut from js/vehicle.js: the catalogue and the procedural kinds (plain literals)
const vehicleSource = read('vehicle.js');
const block = (start, end) => {
    const from = vehicleSource.indexOf(start);
    return vehicleSource.slice(from, vehicleSource.indexOf(end, from) + end.length);
};
const bikes = `${block('const BIKE_MODELS = {', '\n};')}\nconst Vehicle = {};\n${block('Vehicle.BIKES = {', '\n};')}`;
const { Sound, Gearbox, SoundManager, BIKE_MODELS, HudRules, Hud } = (0, eval)(`(function () { ${bikes}\n${read('sound.js')}\n${read('hud.js')}\nreturn { Sound, Gearbox, SoundManager, BIKE_MODELS, HudRules, Hud }; })()`);

const FRAME = 1 / 60;

// Rides a gearbox through `seconds` of frames, `inputs(t)` giving { share, throttle, brake }; returns each frame
const ride = (box, seconds, inputs, dt = FRAME) => {
    const frames = [];
    for (let t = 0; t < seconds; t += dt) {
        const { share, throttle = 0, brake = 0 } = inputs(t);
        box.update(dt, share, throttle, brake);
        frames.push({ t, share, gear: box.gear, revs: box.revs, shift: box.shift, cut: box.cut, shifts: box.shifts, target: box.target });
    }
    return frames;
};

// A fake AudioContext: every node is counted when made, and every scheduled value of every parameter is kept
class FakeParam {
    constructor(name, value = 0) {
        this.name = name;
        this.value = value;
        this.events = [];
    }
    setValueAtTime(value, time) { this.events.push({ kind: 'set', value, time }); }
    linearRampToValueAtTime(value, time) { this.events.push({ kind: 'ramp', value, time }); }
    exponentialRampToValueAtTime(value, time) { this.events.push({ kind: 'exp', value, time }); }
    setTargetAtTime(value, time, constant) { this.events.push({ kind: 'target', value, time, constant }); }
    cancelScheduledValues(time) { this.events.push({ kind: 'cancel', time }); }
    cancelAndHoldAtTime(time) { this.events.push({ kind: 'hold', time }); }
}

class FakeContext {
    constructor() {
        this.currentTime = 0;
        this.sampleRate = 8000;
        this.state = 'running';
        this.made = 0;
        this.params = [];
        this.destination = { connect() {} };
    }
    param(name, value) {
        const p = new FakeParam(name, value);
        this.params.push(p);
        return p;
    }
    node(fields) {
        this.made++;
        return { connect() {}, disconnect() {}, start() {}, stop() {}, ...fields };
    }
    createGain() { return this.node({ gain: this.param('gain', 1) }); }
    createOscillator() { return this.node({ frequency: this.param('frequency', 440), detune: this.param('detune', 0), type: 'sine', setPeriodicWave(wave) { this.wave = wave; } }); }
    createBiquadFilter() { return this.node({ type: 'lowpass', frequency: this.param('frequency', 350), Q: this.param('Q', 1), gain: this.param('filterGain', 0) }); }
    createBufferSource() { return this.node({ buffer: null, loop: false }); }
    createWaveShaper() { return this.node({ curve: null, oversample: 'none' }); }
    createConvolver() { return this.node({ buffer: null }); }
    createStereoPanner() { return this.node({ pan: this.param('pan', 0) }); }
    createDynamicsCompressor() { return this.node({ threshold: this.param('t'), knee: this.param('k'), ratio: this.param('r'), attack: this.param('a'), release: this.param('re') }); }
    createBuffer(channels, length) {
        const data = Array.from({ length: channels }, () => new Float32Array(length));
        return { getChannelData: i => data[i] };
    }
    createPeriodicWave(real, imag) { return { real, imag }; }
    resume() { this.state = 'running'; return Promise.resolve(); }
}

// A storage that keeps strings, or throws on every call
const memoryStorage = () => {
    const map = new Map();
    return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), map };
};
const brokenStorage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };

// A sound manager on the fake context, unmuted
const live = () => {
    const ctx = new FakeContext();
    const storage = memoryStorage();
    const sound = new SoundManager({ context: () => ctx, storage, doc: null });
    sound.setSetting('muted', false);
    return { ctx, sound, storage };
};

// A frame of the ride, as Game.soundFrame fills it
const frameOf = (box, fields = {}) => ({ dt: FRAME, gearbox: box, engine: 'triple', throttle: 0, brake: 0, speed: 0, maxSpeed: 68, crashed: false, surface: 'asphalt', wet: false, slide: 0, others: null, x: 0, z: 0, heading: 0, random: () => 0.5, ...fields });

describe('the gearbox of the sound and the HUD', () => {
    test('six gears whose steps are just intervals, first 2.5 x top', () => {
        const box = new Gearbox('bike07_mt09');
        expect(box.auto).toBe(false);
        expect(box.top).toBe(6);
        expect(box.ratios[5]).toBe(1);
        expect(box.ratios[0]).toBeCloseTo(2.5, 9);
        const just = [4 / 3, 5 / 4, 6 / 5, 9 / 8, 10 / 9];
        for (let g = 0; g < 5; g++) expect(box.ratios[g] / box.ratios[g + 1]).toBeCloseTo(just[g], 9);
        // Every stepped bike of the catalogue has the same six; only the scooter has none
        Object.keys(BIKE_MODELS).forEach(id => {
            const gearbox = new Gearbox(id);
            expect(gearbox.auto).toBe(BIKE_MODELS[id].cls === 'scooter');
            if (!gearbox.auto) expect(gearbox.top).toBe(6);
        });
    });

    test('the shift rules leave no speed with two gears that answer it, for every step', () => {
        const rules = Sound.GEARBOX;
        const most = Math.max(...rules.steps);
        expect(rules.up.least / most).toBeGreaterThan(rules.down);
        expect(rules.down * most).toBeLessThan(rules.up.least);
        expect(rules.brakeDown).toBeLessThan(1);
        expect(rules.up.most).toBeLessThan(1);
    });

    test('on full throttle it shifts up one gear at a time near the top of the band, and never over the redline', () => {
        const box = new Gearbox('bike07_mt09');
        // A share of top speed that rises as a bike does: fast in the low gears, slower at the top
        const frames = ride(box, 20, t => ({ share: 1 - Math.exp(-t / 6), throttle: 1 }));
        const gears = frames.map(f => f.gear);
        expect(Math.max(...gears)).toBe(6);
        for (let i = 1; i < frames.length; i++) {
            expect(gears[i] - gears[i - 1]).toBeGreaterThanOrEqual(0);
            expect(gears[i] - gears[i - 1]).toBeLessThanOrEqual(1);
            expect(frames[i].revs).toBeLessThanOrEqual(1 + 1e-9);
            if (gears[i] > gears[i - 1]) {
                // The revs it shifted at, in the old gear: the full throttle's point
                expect(box.revsIn(gears[i - 1], frames[i].share)).toBeGreaterThanOrEqual(Sound.GEARBOX.up.most);
                // and the new gear's revs are the old ones over the step: an interval down, not under the downshift
                expect(box.revsIn(gears[i], frames[i].share)).toBeGreaterThan(Sound.GEARBOX.down);
            }
        }
    });

    test('an upshift cuts the ignition and drops the revs; a downshift blips over the new gear', () => {
        const box = new Gearbox('bike01_z650');
        const up = ride(box, 6, t => ({ share: Math.min(0.5, t * 0.2), throttle: 1 }));
        const shiftAt = up.findIndex((f, i) => i > 0 && f.gear > up[i - 1].gear);
        expect(shiftAt).toBeGreaterThan(0);
        expect(up[shiftAt].cut).toBe(Sound.GEARBOX.cutLevel);
        // The revs fall over the next frames toward the new gear's, by about the step
        const before = up[shiftAt - 1].revs;
        const after = up[shiftAt + 8].revs;
        expect(after / before).toBeLessThan(0.85);
        const down = ride(box, 6, t => ({ share: Math.max(0.02, 0.5 - t * 0.12), brake: 1 }));
        const downAt = down.findIndex((f, i) => i > 0 && f.gear < down[i - 1].gear);
        expect(downAt).toBeGreaterThan(0);
        expect(down[downAt].cut).toBe(Sound.GEARBOX.blipLevel);
        expect(down[downAt].target).toBeGreaterThan(box.revsIn(down[downAt].gear, down[downAt].share));
    });

    test('braking to a stop shifts down to first, each downshift under the brake rule', () => {
        const box = new Gearbox('bike13_panigale');
        ride(box, 20, t => ({ share: Math.min(0.95, t * 0.1), throttle: 1 }));
        expect(box.gear).toBe(6);
        const frames = ride(box, 8, t => ({ share: Math.max(0, 0.95 - t * 0.15), brake: 1 }));
        expect(box.gear).toBe(1);
        for (let i = 1; i < frames.length; i++) if (frames[i].gear < frames[i - 1].gear) expect(box.revsIn(frames[i].gear, frames[i].share)).toBeLessThan(Sound.GEARBOX.brakeDown * Math.max(...Sound.GEARBOX.steps));
    });

    test('at any steady speed and throttle it settles in one gear and never hunts between two', () => {
        for (let share = 0.04; share <= 1; share += 0.04) {
            for (const throttle of [0, 0.1, 0.3, 0.6, 1]) {
                const box = new Gearbox('bike09_duke890');
                // Come up to the speed on the throttle, then hold it
                ride(box, 10, t => ({ share: share * Math.min(1, t / 6), throttle: 1 }));
                const settled = ride(box, 4, () => ({ share, throttle }));
                const held = ride(box, 60, () => ({ share, throttle }));
                expect(held[held.length - 1].shifts - settled[settled.length - 1].shifts).toBe(0);
                const gears = new Set(held.map(f => f.gear));
                expect(gears.size).toBe(1);
            }
        }
    });

    test('a throttle rocked open and shut at a steady speed never takes it back and forth between two gears', () => {
        const box = new Gearbox('bike06_z750');
        ride(box, 10, t => ({ share: 0.3 * Math.min(1, t / 6), throttle: 1 }));
        const frames = ride(box, 60, t => ({ share: 0.3, throttle: Math.floor(t * 2) % 2 ? 0.9 : 0.05 }));
        const changes = [];
        for (let i = 1; i < frames.length; i++) if (frames[i].gear !== frames[i - 1].gear) changes.push(frames[i].gear);
        // At most one settling shift, never a return
        expect(changes.length).toBeLessThanOrEqual(1);
    });

    test('the scooter is twist and go: no steps, "D", its revs in its band on the throttle and at idle off it', () => {
        const box = new Gearbox('bike14_forza');
        expect(box.auto).toBe(true);
        expect(HudRules.gearText(box)).toBe('D');
        const idle = Sound.idleShare(Sound.ENGINES.single);
        const [low, high] = Sound.AUTOMATIC.band;
        const frames = ride(box, 30, t => ({ share: Math.min(0.75, t * 0.05), throttle: t < 20 ? 0.4 + 0.6 * Math.abs(Math.sin(t)) : 0 }));
        expect(new Set(frames.map(f => f.gear))).toEqual(new Set([1]));
        expect(frames[frames.length - 1].shifts).toBe(0);
        frames.forEach(f => {
            expect(f.revs).toBeGreaterThanOrEqual(idle - 1e-9);
            expect(f.revs).toBeLessThanOrEqual(high + 1e-9);
        });
        // Held on the throttle above the clutch's speed, the revs stay in the band
        frames.filter(f => f.t > 3 && f.t < 20).forEach(f => expect(f.revs).toBeGreaterThanOrEqual(low - 0.02));
        // The procedural scooter kind is the same
        expect(new Gearbox('scooter').auto).toBe(true);
    });

    test('in neutral (a crash, the finish) the revs fall to the idle and it shows N', () => {
        const box = new Gearbox('bike02_speed_triple');
        ride(box, 5, t => ({ share: t * 0.1, throttle: 1 }));
        box.neutral = true;
        ride(box, 3, () => ({ share: 0.5, throttle: 1 }));
        expect(box.revs).toBeCloseTo(box.idle, 3);
        expect(HudRules.gearText(box)).toBe('N');
    });
});

describe('the gear indicator', () => {
    test('its text for each state', () => {
        expect(HudRules.gearText(null)).toBe('');
        expect(HudRules.gearText(undefined)).toBe('');
        const box = new Gearbox('bike07_mt09');
        for (let g = 1; g <= 6; g++) {
            box.gear = g;
            expect(HudRules.gearText(box)).toBe(String(g));
        }
        box.neutral = true;
        expect(HudRules.gearText(box)).toBe('N');
        expect(HudRules.gearText(new Gearbox('bike14_forza'))).toBe('D');
        expect(HudRules.gearText({ gear: 0 })).toBe('');
    });

    test('the rev bar lights amber near an upshift, red at the limiter, and never asks for a shift in top gear', () => {
        const box = new Gearbox('bike07_mt09');
        box.gear = 3;
        box.revs = 0.5;
        expect(HudRules.revLight(box)).toBe('');
        box.revs = Sound.GEARBOX.light;
        expect(HudRules.revLight(box)).toBe('shift');
        box.revs = Sound.GEARBOX.limit;
        expect(HudRules.revLight(box)).toBe('limit');
        box.gear = 6;
        box.revs = Sound.GEARBOX.light;
        expect(HudRules.revLight(box)).toBe('');
        expect(HudRules.revLight(null)).toBe('');
        const scooter = new Gearbox('bike14_forza');
        scooter.revs = 0.9;
        expect(HudRules.revLight(scooter)).toBe('');
    });

    test('Hud.setGear writes the slot and the bar only when they change', () => {
        document.body.innerHTML = '<div id="hudGear"></div><div id="hudRevs"></div>';
        const hud = new Hud(document, { location: { search: '' }, localStorage: null, matchMedia: () => ({ matches: false }) });
        const gear = document.getElementById('hudGear'), revs = document.getElementById('hudRevs');
        hud.setGear(null);
        expect(gear.textContent).toBe('');
        expect('on' in revs.dataset).toBe(false);
        const box = new Gearbox('bike07_mt09');
        box.gear = 2;
        box.revs = 0.9;
        hud.setGear(box);
        expect(gear.textContent).toBe('2');
        expect(revs.style.getPropertyValue('--revs')).toBe('90%');
        expect(revs.dataset.light).toBe('shift');
        const node = gear.firstChild;
        box.gear = 3;
        box.revs = 0.6;
        hud.setGear(box);
        expect(gear.firstChild).toBe(node);
        expect(gear.textContent).toBe('3');
        expect(revs.dataset.light).toBeUndefined();
        hud.setGear(null);
        expect('on' in revs.dataset).toBe(false);
    });
});

describe('the engine voices', () => {
    test('every bike of the catalogue and every procedural kind has a voice from its own engine fact', () => {
        const kinds = new Set();
        Object.entries(BIKE_MODELS).forEach(([id, bike]) => {
            expect(Sound.ENGINES[bike.engine]).toBeDefined();
            expect(Sound.engineOf(id)).toBe(bike.engine);
            kinds.add(bike.engine);
        });
        expect([...kinds].sort()).toEqual(['four', 'parallel-twin', 'single', 'triple', 'v-twin', 'v4']);
        expect(Sound.engineOf('no-such-bike')).toBe(Sound.DEFAULT_ENGINE);
    });

    test('each partial table sums to at most 1, the closed throttle is softer in the top, and no table has a constant', () => {
        Object.entries(Sound.ENGINES).forEach(([kind, voice]) => {
            const full = Sound.partials(voice, 1), closed = Sound.partials(voice, 0);
            expect(full.real.length).toBe(Sound.PARTIALS + 1);
            expect(Sound.partialSum(full)).toBeCloseTo(1, 6);
            expect(Sound.partialSum(closed)).toBeLessThanOrEqual(1);
            expect(full.real[0]).toBe(0);
            expect(full.imag[0]).toBe(0);
            const top = t => { let sum = 0; for (let k = 20; k <= Sound.PARTIALS; k++) sum += Math.hypot(t.real[k], t.imag[k]); return sum; };
            expect(top(closed)).toBeLessThan(top(full));
            [full, closed].forEach(t => { for (let k = 0; k <= Sound.PARTIALS; k++) expect(Number.isFinite(t.real[k]) && Number.isFinite(t.imag[k])).toBe(true); });
            expect(kind).toBeTruthy();
        });
    });

    test('the partials follow the firing: a four is strongest at its fourth harmonic, a triple at its third, a single at its first', () => {
        const strongest = voice => {
            const t = Sound.partials(voice, 1);
            let best = 1;
            for (let k = 1; k <= Sound.PARTIALS; k++) if (Math.hypot(t.real[k], t.imag[k]) > Math.hypot(t.real[best], t.imag[best])) best = k;
            return best;
        };
        expect(strongest(Sound.ENGINES.single)).toBe(1);
        expect(strongest(Sound.ENGINES.triple)).toBe(3);
        expect(strongest(Sound.ENGINES.four)).toBe(4);
        // A twin of 180 degrees fires twice in half a cycle and then waits: its pulses fall on every fourth harmonic, and
        // the wait keeps the cycle's own (which an even four lacks), as the uneven twin and the V4 do
        const at = (voice, k) => { const t = Sound.partials(voice, 1); return Math.hypot(t.real[k], t.imag[k]); };
        expect(strongest(Sound.ENGINES['parallel-twin'])).toBe(4);
        expect(at(Sound.ENGINES['parallel-twin'], 1)).toBeGreaterThan(at(Sound.ENGINES.four, 1) * 3);
        expect(at(Sound.ENGINES['v-twin'], 1)).toBeGreaterThan(at(Sound.ENGINES.four, 1) * 3);
        expect(at(Sound.ENGINES.v4, 1)).toBeGreaterThan(at(Sound.ENGINES.four, 1) * 2);
    });

    test('the idle is an A: a four fires at 55 Hz, and each rev band is a whole harmonic of its idle', () => {
        expect(Sound.IDLE_RPM / 30).toBeCloseTo(55, 9);
        Object.values(Sound.ENGINES).forEach(voice => expect(Number.isInteger(voice.redline)).toBe(true));
    });

    test('the surface under the tyres', () => {
        expect(Sound.surfaceOf(null)).toBe('asphalt');
        expect(Sound.surfaceOf({ worldSurfaceGrip: 1 })).toBe('asphalt');
        expect(Sound.surfaceOf({ worldSurfaceGrip: 0.8 })).toBe('cobbles');
        expect(Sound.surfaceOf({ runoff: {}, worldSurfaceGrip: 0.8 })).toBe('loose');
    });
});

describe('the sound manager', () => {
    // A minute of a ride: away from rest through the gears, a steady stretch, braking hard, a crash and its slide, a
    // stop, away again; frames of uneven length; three riders and a car pass. Returns the manager and its context
    const simulate = () => {
        const { ctx, sound } = live();
        const box = new Gearbox('bike08_xsr900');
        const traffic = {
            motorcycles: [0, 1].map(i => ({ model: i ? 'bike13_panigale' : 'bike04_scrambler', bikeGroup: { visible: true, position: { x: 3, z: -80 - i * 20 } } })),
            cars: [{ carGroup: { visible: true, position: { x: -3, z: 150 } } }]
        };
        let speed = 0, z = 0;
        const dts = [FRAME, FRAME, 1 / 30, FRAME, 0.05, FRAME];
        let frames = 0;
        for (let t = 0; t < 60; frames++) {
            const dt = dts[frames % dts.length];
            t += dt;
            ctx.currentTime += dt;
            const phase = t < 20 ? 'away' : t < 28 ? 'steady' : t < 34 ? 'brake' : t < 37 ? 'crash' : t < 40 ? 'stop' : 'away';
            const throttle = phase === 'away' ? 1 : phase === 'steady' ? 0.4 : 0;
            const brake = phase === 'brake' ? 1 : 0;
            if (phase === 'away') speed = Math.min(60, speed + 4 * dt);
            if (phase === 'brake' || phase === 'crash') speed = Math.max(0, speed - 8 * dt);
            if (phase === 'stop') speed = 0;
            z += speed * dt;
            traffic.motorcycles.forEach((m, i) => { m.bikeGroup.position.z += (i ? 40 : 25) * dt; });
            traffic.cars[0].carGroup.position.z -= 20 * dt;
            box.neutral = phase === 'crash';
            box.update(dt, speed / 68, throttle, brake);
            sound.update(frameOf(box, { dt, throttle, brake, speed, crashed: phase === 'crash', z, surface: t > 45 ? 'cobbles' : 'asphalt', wet: t > 50, slide: phase === 'crash' ? 0 : 0.1, others: traffic }));
        }
        return { ctx, sound, frames };
    };

    test('no node is made per frame: a simulated minute of a ride makes none after the first frame', () => {
        const { ctx, sound } = live();
        const box = new Gearbox('bike07_mt09');
        sound.update(frameOf(box));
        const built = ctx.made;
        expect(built).toBeGreaterThan(10);
        const { ctx: ride, frames } = simulate();
        expect(frames).toBeGreaterThan(2400);
        // (the simulation's own context: its count after the build is the same as the one above)
        expect(ride.made).toBe(built);
        expect(sound.audioContext).toBe(ctx);
    });

    test('each ramp moves a parameter no more than its rate allows in one frame', () => {
        const { sound } = simulate();
        const g = sound.graph, ramps = Sound.RAMPS;
        const steps = (param, map = v => v) => {
            const values = param.events.filter(e => e.kind === 'ramp').map(e => map(e.value));
            let most = 0;
            for (let i = 1; i < values.length; i++) most = Math.max(most, Math.abs(values[i] - values[i - 1]));
            return { most, count: values.length };
        };
        const eps = 1e-9;
        const pitch = steps(g.loadOsc.frequency, Math.log2);
        expect(pitch.count).toBeGreaterThan(2000);
        expect(pitch.most).toBeLessThanOrEqual(Sound.maxStep(ramps.pitch, ramps.frameS) + eps);
        expect(pitch.most).toBeGreaterThan(0);
        for (const param of [g.engineGain.gain, g.loadGain.gain, g.offGain.gain, g.windGain.gain, g.roadGain.gain, g.wetGain.gain, g.scrapeGain.gain]) {
            const step = steps(param);
            expect(step.most).toBeLessThanOrEqual(Sound.maxStep(ramps.gain, ramps.frameS) + eps);
        }
        for (const param of [g.tone.frequency, g.windTop.frequency, g.roadBand.frequency]) {
            expect(steps(param, Math.log2).most).toBeLessThanOrEqual(Sound.maxStep(ramps.filter, ramps.frameS) + eps);
        }
    });

    test('an engine kind is a voice from its partial tables, and a new bike changes the voice without a node', () => {
        const { ctx, sound } = live();
        const box = new Gearbox('bike13_panigale');
        sound.update(frameOf(box, { engine: 'v4' }));
        const made = ctx.made;
        expect(sound.graph.loadOsc.wave.real).toEqual(Sound.partials(Sound.ENGINES.v4, 1).real);
        sound.update(frameOf(box, { engine: 'single' }));
        expect(sound.graph.offOsc.wave.real).toEqual(Sound.partials(Sound.ENGINES.single, 0).real);
        expect(ctx.made).toBe(made);
    });

    test('a passing source is higher as it comes and lower as it goes (Doppler)', () => {
        const { ctx, sound } = live();
        const box = new Gearbox('bike07_mt09');
        const car = { carGroup: { visible: true, position: { x: 2, z: -60 } } };
        const pitches = [];
        for (let i = 0; i < 360; i++) {
            ctx.currentTime += FRAME;
            car.carGroup.position.z += 30 * FRAME;
            sound.update(frameOf(box, { others: { motorcycles: [], cars: [car] } }));
            const events = sound.graph.passing[0].osc.frequency.events.filter(e => e.kind === 'ramp');
            pitches.push({ z: car.carGroup.position.z, f: events.length ? events[events.length - 1].value : NaN });
        }
        // The gearbox of the car is steady by then; compare at the same distance before and after
        const before = pitches.find(p => p.z > -20).f, after = pitches.find(p => p.z > 20).f;
        expect(before / after).toBeGreaterThan(1.1);
    });

    test('the settings: rows as data, held to their range, kept, applied at once, and read back', () => {
        Sound.SETTINGS.forEach(row => {
            expect(typeof row.id).toBe('string');
            expect(typeof row.label).toBe('string');
            expect(['slider', 'toggle']).toContain(row.kind);
            if (row.kind === 'slider') {
                expect(row.range[0]).toBeLessThan(row.range[1]);
                expect(row.default).toBeGreaterThanOrEqual(row.range[0]);
                expect(row.default).toBeLessThanOrEqual(row.range[1]);
            } else expect(typeof row.default).toBe('boolean');
        });
        const { ctx, sound, storage } = live();
        sound.update(frameOf(new Gearbox('bike07_mt09')));
        expect(sound.setSetting('master', 7)).toBe(1);
        expect(sound.setSetting('master', -1)).toBe(0);
        expect(sound.setSetting('master', 0.43)).toBeCloseTo(0.45, 9);
        expect(sound.getSetting('master')).toBeCloseTo(0.45, 9);
        expect(sound.setSetting('balance', 'nonsense')).toBe(0.5);
        expect(sound.setSetting('nope', 1)).toBeUndefined();
        expect(JSON.parse(storage.map.get(Sound.STORE_KEY)).master).toBeCloseTo(0.45, 9);
        // Applied at once: the master gain was sent the square of the volume
        const master = sound.graph.master.gain.events.filter(e => e.kind === 'target');
        expect(master[master.length - 1].value).toBeCloseTo(0.45 * 0.45, 9);
        sound.setSetting('balance', 1);
        const effects = sound.graph.fxBus.gain.events.filter(e => e.kind === 'target');
        expect(effects[effects.length - 1].value).toBe(0);
        // A new manager reads what was kept
        const again = new SoundManager({ context: () => ctx, storage, doc: null });
        expect(again.getSetting('master')).toBeCloseTo(0.45, 9);
        expect(again.getSetting('balance')).toBe(1);
        expect(again.getSetting('muted')).toBe(false);
        // A watcher hears each change, the M key's too
        const heard = [];
        again.watchSettings((id, value) => heard.push([id, value]));
        again.toggleSound();
        expect(heard).toEqual([['muted', true]]);
    });

    test('the settings start muted as before, and a storage that throws or holds rubbish leaves the defaults', () => {
        const fresh = new SoundManager({ context: () => null, storage: memoryStorage(), doc: null });
        expect(fresh.getSetting('muted')).toBe(true);
        expect(fresh.enabled).toBe(false);
        const broken = new SoundManager({ context: () => null, storage: brokenStorage, doc: null });
        expect(() => broken.setSetting('master', 0.2)).not.toThrow();
        expect(broken.getSetting('master')).toBe(0.2);
        const rubbish = memoryStorage();
        rubbish.setItem(Sound.STORE_KEY, '{not json');
        expect(Sound.readSettings(rubbish).master).toBe(Sound.SETTINGS.find(r => r.id === 'master').default);
        rubbish.setItem(Sound.STORE_KEY, JSON.stringify({ master: 'loud', muted: 'yes' }));
        expect(Sound.readSettings(rubbish)).toEqual({ muted: true, master: 0.7, balance: 0.5 });
    });

    test('a ride default holds only while the player has never chosen the setting, and is never saved', () => {
        const storage = memoryStorage();
        const fresh = new SoundManager({ context: () => null, storage, doc: null });
        expect(fresh.defaultTo('muted', false)).toBe(false);
        expect(fresh.enabled).toBe(true);
        expect(storage.map.has(Sound.STORE_KEY)).toBe(false);
        expect(new SoundManager({ context: () => null, storage, doc: null }).getSetting('muted')).toBe(true);
        const chosen = memoryStorage();
        const player = new SoundManager({ context: () => null, storage: chosen, doc: null });
        player.setSetting('muted', false);
        player.setSetting('muted', true);
        const again = new SoundManager({ context: () => null, storage: chosen, doc: null });
        expect(again.defaultTo('muted', false)).toBe(true);
        expect(again.enabled).toBe(false);
        expect(new SoundManager({ context: () => null, storage: brokenStorage, doc: null }).defaultTo('muted', false)).toBe(false);
    });

    test('nothing throws without an AudioContext (node, an old browser)', () => {
        const none = new SoundManager({ context: () => null, storage: null, doc: null });
        none.setSetting('muted', false);
        const box = new Gearbox('bike07_mt09');
        expect(() => {
            none.update(frameOf(box));
            none.update(null);
            none.cue('checkpoint');
            none.playCrashSound();
            none.playTireScreech();
            none.playEngineSound(0.5, 1);
            none.stopEngineSound();
            none.sleep();
            none.toggleSound();
        }).not.toThrow();
        // The page's own default: jsdom has no AudioContext
        expect(() => new SoundManager().update(frameOf(box))).not.toThrow();
        const throwing = new SoundManager({ context: () => { throw new Error('no audio'); }, storage: null, doc: null });
        throwing.setSetting('muted', false);
        expect(() => throwing.update(frameOf(box))).not.toThrow();
    });

    test('muted, a frame makes nothing and schedules nothing', () => {
        const ctx = new FakeContext();
        const sound = new SoundManager({ context: () => ctx, storage: null, doc: null });
        sound.update(frameOf(new Gearbox('bike07_mt09')));
        expect(ctx.made).toBe(0);
    });

    test('a cue is in A major, and an event sound makes its own short nodes and lets them go', () => {
        const a = [0, 2, 4, 5, 7, 9, 11];
        Object.values(Sound.CUES).forEach(cue => cue.notes.forEach(n => expect(a).toContain(((n % 12) + 12) % 12)));
        const { ctx, sound } = live();
        sound.update(frameOf(new Gearbox('bike07_mt09')));
        const before = ctx.made;
        sound.cue('checkpoint');
        expect(ctx.made - before).toBe(2 * Sound.CUES.checkpoint.notes.length);
        sound.playCrashSound();
        expect(() => sound.cue('no-such-cue')).not.toThrow();
    });
});
