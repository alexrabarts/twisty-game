#!/usr/bin/env node
// Offline clips of the game's sound, for the ear (.agent/system/sound.md): each engine kind through the gears, the
// scooter, and the crew and a car passing, rendered by the real js/sound.js in an OfflineAudioContext of a browser
// page, the frames driven at 60 a second. Each clip is 10 s of 48 kHz stereo WAV. With --before <file> the engine of an
// older js/main.js (its SoundManager class) rides the same throttle for a clip of its own.
//
//   node tools/sound-clips.mjs --out <dir> [--before <old main.js>] [--chrome <path>]
//
// It also writes <dir>/report.json: for each clip two harmonic-to-noise figures, the brightness, the peak, and the
// clicks found.
// `hnrDb`: the wave against itself one period of its fundamental earlier (the engine's own track: the cycle of
// rpm / 120; the older engine's half its oscillators' pitch). Their sum is the harmonic part, their difference the
// rest; in the spectrum that is a comb with a tooth at each harmonic against the gaps between the teeth. The figure is
// 10 log10 of the two energies' ratio over each 100 ms with sound, median of those. White noise gets 0 dB.
// `steadyHnrDb` is the same over the blocks whose fundamental moves less than 1 % (a glide's own smear left out).
// `autocorrHnrDb`: the median of 10 log10(r / (1 - r)), r the normalised autocorrelation's peak at a period from
// 1/1000 to 1/12 s, a measure of how periodic the wave is (a gliding pitch lowers it).
// `centroidHz` and `over2k`: the spectrum's centre of mass and the share of its energy over 2 kHz (to 12 kHz), median
// of the frames: how bright or harsh a clip is, which the harmonic figure cannot say (a raw sawtooth is perfectly
// harmonic and still harsh).
// A click is a sample step over 0.02 and over CLICK_RATIO times every step of the 100 ms before it (an edge the wave
// repeats each period has met its like before; a step out of nothing has not); the first and last samples' level is
// given too.
import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const RATE = 48000, SECONDS = 10, CLICK_RATIO = 12;

// The clips: a bike (its engine kind is its data's) or the pass-by
const CLIPS = [
    { name: 'single', bike: 'bike03_duke390' },
    { name: 'parallel-twin', bike: 'bike09_duke890' },
    { name: 'v-twin', bike: 'bike16_superadv' },
    { name: 'triple', bike: 'bike07_mt09' },
    { name: 'four', bike: 'bike06_z750' },
    { name: 'v4', bike: 'bike13_panigale' },
    { name: 'scooter', bike: 'bike14_forza' },
    { name: 'passing', bike: 'bike07_mt09', passing: true }
];

function chromePath() {
    const candidate = option('chrome') || process.env.TWISTY_CHROME || process.env.PUPPETEER_EXECUTABLE_PATH;
    if (candidate) return candidate;
    const own = puppeteer.executablePath();
    if (own && spawnSync(own, ['--version']).status === 0) return own;
    console.error('Set TWISTY_CHROME or run: npx puppeteer browsers install chrome');
    process.exit(2);
}

// Runs in the page: renders one clip. `profile(t)` is the ride: idle, full throttle through the gears, the throttle
// shut (the overrun), the brake (downshifts), the engine off at the end
async function render(spec, rate, seconds) {
    const offline = new OfflineAudioContext(2, rate * seconds, rate);
    // The engines see a context that runs: the render's own suspends are the clock here, and only the loop resumes
    const ctx = new Proxy(offline, { get: (o, k) => (k === 'state' ? 'running' : typeof o[k] === 'function' ? o[k].bind(o) : o[k]) });
    const profile = (t) => {
        if (t < 1) return { share: 0, throttle: 0, brake: 0 };
        if (t < 6.5) return { share: 0.82 * (1 - Math.exp(-(t - 1) / 2.6)), throttle: 1, brake: 0 };
        const top = 0.82 * (1 - Math.exp(-5.5 / 2.6));
        if (t < 8) return { share: top - (t - 6.5) * 0.02, throttle: 0, brake: 0 };
        return { share: Math.max(0.04, top - 0.03 - (t - 8) * 0.22), throttle: 0, brake: t < 9.6 ? 1 : 0 };
    };
    const maxSpeed = 68;
    const frameS = 1 / 60;
    let state = { share: 0, x: 0, z: 0 };
    // The fundamental of the harmonic series sounded at each frame, for the spectral figure: the engine's cycle (the
    // older engine's: half its oscillators' pitch, where its triangle an octave down sat)
    const track = [];
    let drive;
    if (spec.before) {
        // The older engine: its own class, on this context, played as the game played it
        const Old = new Function('showCallout', `${spec.before}\nreturn SoundManager;`)(() => {});
        const old = Object.create(Old.prototype);
        Object.assign(old, { audioContext: ctx, masterVolume: 0.3, enabled: true, sounds: {} });
        drive = (t) => {
            const p = profile(t);
            if (t >= 9.7) old.stopEngineSound();
            else old.playEngineSound(p.share, p.throttle);
            track.push(t >= 9.7 ? 0 : (70 + p.share * 55 + p.throttle * 18) / 2);
            if (spec.engineOnly && old.engineSound) {
                old.engineSound.windGain.gain.cancelScheduledValues(0);
                old.engineSound.windGain.gain.value = 0;
            }
        };
    } else {
        const sound = new SoundManager({ context: () => ctx, storage: null, doc: null });
        sound.setSetting('muted', false);
        sound.setSetting('master', 0.7);
        const box = new Gearbox(spec.bike);
        const traffic = spec.passing ? {
            motorcycles: [{ model: 'bike13_panigale', bikeGroup: { visible: true, position: { x: 2.5, z: -90 } } }, { model: 'bike04_scrambler', bikeGroup: { visible: true, position: { x: 2.5, z: -140 } } }],
            cars: [{ carGroup: { visible: true, position: { x: -3, z: 420 } } }]
        } : null;
        let random = 12345;
        const frame = { dt: frameS, gearbox: box, engine: Sound.engineOf(spec.bike), throttle: 0, brake: 0, speed: 0, maxSpeed, crashed: false, surface: 'asphalt', wet: false, slide: 0, others: traffic, x: 0, z: 0, heading: 0, random: () => ((random = (Math.imul(random, 1103515245) + 12345) >>> 0) / 4294967296) };
        drive = (t) => {
            // The pass-by: the rider holds 20 m/s in a steady gear while two of the crew come past at 34 and 30 m/s and
            // a car comes the other way at 22 m/s
            const p = spec.passing ? { share: 20 / maxSpeed, throttle: 0.35, brake: 0 } : profile(t);
            box.update(frameS, p.share, p.throttle, p.brake);
            state.z += p.share * maxSpeed * frameS;
            if (traffic) {
                traffic.motorcycles[0].bikeGroup.position.z += 34 * frameS;
                traffic.motorcycles[1].bikeGroup.position.z += 30 * frameS;
                traffic.cars[0].carGroup.position.z -= 22 * frameS;
            }
            Object.assign(frame, { throttle: p.throttle, brake: p.brake, speed: spec.engineOnly ? 0 : p.share * maxSpeed, z: state.z, engineOff: t >= 9.7 });
            box.neutral = t >= 9.7;
            sound.update(frame);
            track.push(spec.passing || t >= 9.7 ? 0 : Math.pow(2, sound.state.pitch));
        };
    }
    for (let i = 0; i * frameS < seconds - frameS; i++) {
        const t = i * frameS;
        offline.suspend(t).then(() => { drive(t); offline.resume(); });
    }
    const buffer = await offline.startRendering();
    // 16-bit PCM, interleaved, as base64
    const left = buffer.getChannelData(0), right = buffer.getChannelData(1);
    const pcm = new Int16Array(left.length * 2);
    let peak = 0;
    for (let i = 0; i < left.length; i++) {
        peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
        pcm[2 * i] = Math.max(-32768, Math.min(32767, Math.round(left[i] * 32767)));
        pcm[2 * i + 1] = Math.max(-32768, Math.min(32767, Math.round(right[i] * 32767)));
    }
    const bytes = new Uint8Array(pcm.buffer);
    let text = '';
    for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    // (each frame's value is reached at the end of its ramp: the older engine's 0.06 s, this one's Sound.RAMPS.aheadS)
    return { pcm: btoa(text), peak, track, lagS: spec.before ? 0.06 : Sound.RAMPS.aheadS };
}

function wav(pcm) {
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + pcm.length, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(2, 22);
    header.writeUInt32LE(RATE, 24);
    header.writeUInt32LE(RATE * 4, 28);
    header.writeUInt16LE(4, 32);
    header.writeUInt16LE(16, 34);
    header.write('data', 36);
    header.writeUInt32LE(pcm.length, 40);
    return Buffer.concat([header, pcm]);
}

// The mono samples of interleaved 16-bit stereo
function mono(pcm) {
    const samples = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length / 2);
    const out = new Float32Array(samples.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = (samples[2 * i] + samples[2 * i + 1]) / 65534;
    return out;
}

// The harmonic-to-noise ratio (dB): over frames of 8192 samples (170 ms) with a Hann window, the normalised
// autocorrelation's highest peak at a lag of a period between 1/1000 s and 1/12 s, corrected for the window, as
// 10 log10(r / (1 - r)); the median of the frames that are not silent
function hnr(x) {
    const size = 8192, hop = 4096;
    const window = new Float32Array(size).map((_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (size - 1)));
    const lags = [Math.floor(RATE / 1000), Math.floor(RATE / 12)];
    const windowAc = new Float64Array(lags[1] + 1);
    for (let lag = 0; lag <= lags[1]; lag++) { let s = 0; for (let i = 0; i + lag < size; i++) s += window[i] * window[i + lag]; windowAc[lag] = s; }
    const values = [];
    const frame = new Float32Array(size);
    for (let start = 0; start + size <= x.length; start += hop) {
        let energy = 0;
        for (let i = 0; i < size; i++) { frame[i] = x[start + i] * window[i]; energy += frame[i] * frame[i]; }
        if (energy / size < 1e-7) continue;
        // (every 4th lag, then the best one's neighbours: the lags are many and the peaks broad)
        const ac = lag => { let s = 0; for (let i = 0; i + lag < size; i++) s += frame[i] * frame[i + lag]; return (s / energy) / (windowAc[lag] / windowAc[0]); };
        let best = -1, bestLag = lags[0];
        for (let lag = lags[0]; lag <= lags[1]; lag += 4) { const r = ac(lag); if (r > best) { best = r; bestLag = lag; } }
        for (let lag = Math.max(lags[0], bestLag - 4); lag <= Math.min(lags[1], bestLag + 4); lag++) best = Math.max(best, ac(lag));
        const r = Math.min(0.99999, Math.max(1e-5, best));
        values.push(10 * Math.log10(r / (1 - r)));
    }
    values.sort((a, b) => a - b);
    return values.length ? Number(values[Math.floor(values.length / 2)].toFixed(2)) : null;
}

// An FFT of a power of two, in place
function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
    }
    for (let len = 2; len <= n; len <<= 1) {
        const angle = -2 * Math.PI / len, wr = Math.cos(angle), wi = Math.sin(angle);
        for (let i = 0; i < n; i += len) {
            let cr = 1, ci = 0;
            for (let k = 0; k < len / 2; k++) {
                const ar = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, ai = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
                re[i + k + len / 2] = re[i + k] - ar; im[i + k + len / 2] = im[i + k] - ai;
                re[i + k] += ar; im[i + k] += ai;
                const next = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = next;
            }
        }
    }
}

// The harmonic-to-noise figure of a clip against its fundamental's track (one value a frame of 1/60 s, sounded
// `lagS` later): the wave against itself one period of the fundamental earlier. Their sum is the harmonic part (in the
// spectrum, a comb with a tooth at each harmonic), their difference the rest (the gaps between the teeth). The figure
// is 10 log10 of the ratio of the two energies over each 100 ms with sound, median of those; white noise gets 0 dB
function combHnr(x, track, lagS) {
    const block = Math.floor(RATE * 0.1);
    const f0At = n => {
        const at = (n / RATE - lagS) * 60;
        const i = Math.max(0, Math.min(track.length - 2, Math.floor(at)));
        const w = Math.max(0, Math.min(1, at - i));
        return track[i] * (1 - w) + track[i + 1] * w;
    };
    const values = [], steady = [];
    for (let start = RATE; start + block <= x.length; start += block) {
        let harmonic = 0, rest = 0, ok = true, low = Infinity, high = 0;
        for (let n = start; n < start + block; n++) {
            const f0 = f0At(n);
            low = Math.min(low, f0);
            high = Math.max(high, f0);
            if (!(f0 >= 8)) { ok = false; break; }
            const back = n - RATE / f0, i = Math.floor(back), w = back - i;
            if (i < 0) { ok = false; break; }
            const past = x[i] * (1 - w) + x[i + 1] * w;
            harmonic += (x[n] + past) * (x[n] + past);
            rest += (x[n] - past) * (x[n] - past);
        }
        if (!ok || harmonic / block < 1e-7) continue;
        const value = 10 * Math.log10(harmonic / Math.max(rest, 1e-12));
        values.push(value);
        if (high / low < 1.01) steady.push(value);
    }
    const median = list => { const sorted = [...list].sort((a, b) => a - b); return sorted.length ? Number(sorted[Math.floor(sorted.length / 2)].toFixed(2)) : null; };
    return { hnrDb: median(values), blocks: values.length, steadyHnrDb: median(steady), steadyBlocks: steady.length };
}

// The brightness of a clip: the median centroid and share over 2 kHz of its frames
function brightness(x) {
    const size = 8192, hop = 8192, bin = RATE / size, limit = Math.floor(12000 / bin), split = Math.floor(2000 / bin);
    const window = new Float32Array(size).map((_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (size - 1)));
    const centroids = [], shares = [];
    for (let start = 0; start + size <= x.length; start += hop) {
        const re = new Float64Array(size), im = new Float64Array(size);
        let energy = 0;
        for (let i = 0; i < size; i++) { re[i] = x[start + i] * window[i]; energy += re[i] * re[i]; }
        if (energy / size < 1e-8) continue;
        fft(re, im);
        let total = 0, moment = 0, high = 0;
        for (let i = 1; i <= limit; i++) { const p = re[i] * re[i] + im[i] * im[i]; total += p; moment += p * i * bin; if (i >= split) high += p; }
        centroids.push(moment / total);
        shares.push(high / total);
    }
    const median = list => { const sorted = [...list].sort((a, b) => a - b); return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null; };
    return { centroidHz: Math.round(median(centroids)), over2k: Number(median(shares).toFixed(4)) };
}

// Clicks: a step between two samples over 0.02 and over CLICK_RATIO times the largest step of the 100 ms before it
// (skipping the last millisecond, which is the same edge), and the level of the first and last samples
function clicks(x) {
    const span = Math.floor(RATE * 0.1), skip = Math.floor(RATE * 0.001);
    const steps = new Float32Array(x.length);
    for (let i = 1; i < x.length; i++) steps[i] = Math.abs(x[i] - x[i - 1]);
    // The largest step of each block of 1 ms, so the 100 ms before a sample is 100 blocks to read
    const block = skip, blocks = new Float32Array(Math.ceil(x.length / block));
    for (let i = 0; i < x.length; i++) blocks[Math.floor(i / block)] = Math.max(blocks[Math.floor(i / block)], steps[i]);
    const found = [];
    for (let i = 1; i < x.length; i++) {
        if (steps[i] <= 0.02) continue;
        const last = Math.floor(i / block) - 1, first = Math.max(0, Math.floor((i - span) / block));
        let before = 0;
        for (let b = first; b < last; b++) before = Math.max(before, blocks[b]);
        if (steps[i] > CLICK_RATIO * before) found.push(Number((i / RATE).toFixed(4)));
    }
    let tail = 0;
    for (let i = x.length - span; i < x.length; i++) tail = Math.max(tail, Math.abs(x[i]));
    return { count: found.length, at: found.slice(0, 10), first: Math.abs(x[0]), lastTenMsPeak: Number(tail.toFixed(5)) };
}

async function main() {
    const out = option('out');
    if (!out) {
        console.error('usage: node tools/sound-clips.mjs --out <dir> [--before <old main.js>]');
        process.exit(2);
    }
    mkdirSync(out, { recursive: true });
    const beforePath = option('before');
    const before = beforePath ? (() => {
        const source = readFileSync(beforePath, 'utf8');
        const from = source.indexOf('class SoundManager {');
        return source.slice(from, source.indexOf('\n}\n', from) + 2);
    })() : null;
    const browser = await puppeteer.launch({ executablePath: chromePath(), headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
    // The click finder must find a click: a sine of 0.3 at 110 Hz cut off mid-wave, and the same wave fading out
    const cut = new Float32Array(RATE).map((_, i) => (i < RATE * 0.6 + 37 ? 0.3 * Math.sin(2 * Math.PI * 110 * i / RATE) : 0));
    const faded = new Float32Array(RATE).map((_, i) => 0.3 * Math.sin(2 * Math.PI * 110 * i / RATE) * Math.max(0, Math.min(1, (RATE * 0.65 - i) / (RATE * 0.05))));
    const check = { cut: clicks(cut).count, faded: clicks(faded).count };
    if (check.cut < 1 || check.faded !== 0) {
        console.error(`the click finder is wrong: ${JSON.stringify(check)}`);
        process.exit(1);
    }
    const report = { rate: RATE, seconds: SECONDS, clickFinder: check, clips: {} };
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(String(e)));
        await page.goto('about:blank');
        const vehicle = readFileSync(join(root, 'js/vehicle.js'), 'utf8');
        const cut = (start, end) => { const from = vehicle.indexOf(start); return vehicle.slice(from, vehicle.indexOf(end, from) + end.length); };
        await page.addScriptTag({ content: `${cut('const BIKE_MODELS = {', '\n};')}\nconst Vehicle = {};\n${cut('Vehicle.BIKES = {', '\n};')}` });
        await page.addScriptTag({ path: join(root, 'js/sound.js') });
        await page.evaluate(`window.renderClip = ${render.toString()}`);
        const jobs = [...CLIPS.map(c => ({ ...c, file: c.name })), ...CLIPS.filter(c => !c.passing).map(c => ({ ...c, engineOnly: true, file: `engine-only/${c.name}` }))];
        if (before) jobs.push({ name: 'before', before, file: 'before' }, { name: 'before', before, engineOnly: true, file: 'engine-only/before' });
        mkdirSync(join(out, 'engine-only'), { recursive: true });
        for (const job of jobs) {
            const result = await page.evaluate((spec, rate, seconds) => window.renderClip(spec, rate, seconds), job, RATE, SECONDS);
            const pcm = Buffer.from(result.pcm, 'base64');
            writeFileSync(join(out, `${job.file}.wav`), wav(pcm));
            const x = mono(pcm);
            report.clips[job.file] = { ...combHnr(x, result.track, result.lagS), autocorrHnrDb: hnr(x), ...brightness(x), peak: Number(result.peak.toFixed(4)), clicks: clicks(x) };
            console.error(`${job.file}: ${JSON.stringify(report.clips[job.file])}`);
        }
        if (errors.length) report.pageErrors = errors;
    } finally {
        await browser.close();
    }
    writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 1));
    console.log(JSON.stringify(report, null, 1));
}

main().catch(error => { console.error(error); process.exit(1); });
