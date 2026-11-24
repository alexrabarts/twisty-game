// The hill ride's music (js/hill/ride.js): the slow theme of the Largo of Dvorak's Ninth Symphony (1893, in the public
// domain), set here for a small brass band and played by the game's own sound (js/sound.js): a cornet on the tune,
// two horns holding the chords, a tuba under them. Every voice is synthesised: a buzzing saw through a filter that
// opens as the note speaks, as a brass note does. It follows the game's sound settings (Mute, Volume).
class HillMusic {
    // The score: the tune as [scale degree, beats] in D flat major (degree 1 is D flat 4; 0 is a rest), and one chord
    // a bar as [tuba root, two horn notes] in MIDI numbers
    static get SCORE() {
        return Object.freeze({
            tonic: 61,
            beatS: 0.95,
            tune: [
                [3, 1.5], [5, 0.5], [5, 2],
                [3, 1.5], [2, 0.5], [1, 2],
                [2, 1], [3, 1], [5, 1], [3, 1],
                [2, 4],
                [3, 1.5], [5, 0.5], [5, 2],
                [3, 1.5], [2, 0.5], [1, 2],
                [2, 1], [3, 1], [2, 1.5], [1, 0.5],
                [1, 4]
            ],
            // One a bar (4 beats): I, IV, V, V, I, IV, V, I
            chords: [[37, 53, 56], [42, 54, 58], [44, 51, 56], [44, 51, 55], [37, 53, 56], [42, 54, 58], [44, 51, 55], [37, 53, 56]],
            // Beats of quiet before it comes round again
            restBeats: 2
        });
    }

    // The semitones of each scale degree over the tonic
    static get DEGREES() { return Object.freeze({ 1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11 }); }

    // How each voice sounds: its level, the filter's opening (Hz, at rest and at the peak), the attack and release
    static get VOICES() {
        return Object.freeze({
            cornet: { level: 0.14, rest: 700, peak: 2600, attackS: 0.06, releaseS: 0.25, vibratoCents: 6 },
            horn: { level: 0.045, rest: 450, peak: 1300, attackS: 0.12, releaseS: 0.4, vibratoCents: 0 },
            tuba: { level: 0.11, rest: 260, peak: 700, attackS: 0.08, releaseS: 0.3, vibratoCents: 0 }
        });
    }

    // Every note of one time through, in seconds from its start: { at, durS, midi, voice }; and its length
    static events(score = HillMusic.SCORE) {
        const list = [];
        let beat = 0;
        for (const [degree, beats] of score.tune) {
            if (degree) list.push({ at: beat * score.beatS, durS: beats * score.beatS * 0.95, midi: score.tonic + HillMusic.DEGREES[degree], voice: 'cornet' });
            beat += beats;
        }
        score.chords.forEach(([root, a, b], bar) => {
            const at = bar * 4 * score.beatS;
            // The tuba on the root, then the fifth over it; the horns hold the bar
            list.push({ at, durS: 2 * score.beatS * 0.9, midi: root, voice: 'tuba' });
            list.push({ at: at + 2 * score.beatS, durS: 2 * score.beatS * 0.9, midi: root + 7, voice: 'tuba' });
            list.push({ at, durS: 4 * score.beatS * 0.97, midi: a, voice: 'horn' });
            list.push({ at, durS: 4 * score.beatS * 0.97, midi: b, voice: 'horn' });
        });
        return { list: list.sort((x, y) => x.at - y.at), lengthS: (Math.max(beat, score.chords.length * 4) + score.restBeats) * score.beatS };
    }

    static hz(midi) {
        return 440 * Math.pow(2, (midi - 69) / 12);
    }

    constructor(sound) {
        this.sound = sound;
        this.playing = false;
        this.timer = null;
        this.score = HillMusic.events();
    }

    // Starts the band once the game's sound is awake (a key or a tap wakes it); safe to call every frame
    play() {
        const sound = this.sound;
        if (this.playing || !sound || !sound.audioContext || !sound.graph) return;
        const ctx = sound.audioContext;
        this.out = ctx.createGain();
        this.out.gain.value = 0;
        this.out.gain.setTargetAtTime(1, ctx.currentTime, 0.5);
        this.out.connect(sound.graph.master);
        this.playing = true;
        this.start = ctx.currentTime + 0.2;
        this.next = 0;
        this.round = 0;
        this.timer = setInterval(() => this.schedule(), 120);
        this.schedule();
    }

    stop() {
        if (!this.playing) return;
        clearInterval(this.timer);
        this.timer = null;
        const ctx = this.sound.audioContext;
        this.out.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
        const out = this.out;
        setTimeout(() => out.disconnect(), 1500);
        this.playing = false;
    }

    // Schedules the notes that start within the next half second
    schedule() {
        const ctx = this.sound.audioContext;
        const ahead = ctx.currentTime + 0.5;
        const { list, lengthS } = this.score;
        for (;;) {
            if (this.next >= list.length) {
                this.next = 0;
                this.round++;
            }
            const event = list[this.next];
            const at = this.start + this.round * lengthS + event.at;
            if (at > ahead) break;
            if (at >= ctx.currentTime - 0.05) this.note(event, at);
            this.next++;
        }
    }

    note(event, at) {
        const ctx = this.sound.audioContext;
        const voice = HillMusic.VOICES[event.voice];
        const end = at + event.durS;
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = HillMusic.hz(event.midi);
        // A second saw a few cents off thickens it
        const twin = ctx.createOscillator();
        twin.type = 'sawtooth';
        twin.frequency.value = HillMusic.hz(event.midi);
        twin.detune.value = 7;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.Q.value = 1.2;
        filter.frequency.setValueAtTime(voice.rest, at);
        filter.frequency.linearRampToValueAtTime(voice.peak, at + voice.attackS);
        filter.frequency.setTargetAtTime((voice.rest + voice.peak) / 2, at + voice.attackS, 0.3);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(voice.level, at + voice.attackS);
        gain.gain.setTargetAtTime(voice.level * 0.8, at + voice.attackS, 0.4);
        gain.gain.setTargetAtTime(0, end, voice.releaseS / 3);
        if (voice.vibratoCents) {
            const lfo = ctx.createOscillator();
            lfo.frequency.value = 5;
            const depth = ctx.createGain();
            depth.gain.value = voice.vibratoCents;
            lfo.connect(depth);
            depth.connect(osc.detune);
            lfo.start(at + 0.25);
            lfo.stop(end + voice.releaseS);
        }
        osc.connect(filter);
        twin.connect(filter);
        filter.connect(gain);
        gain.connect(this.out);
        for (const o of [osc, twin]) {
            o.start(at);
            o.stop(end + voice.releaseS);
        }
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { HillMusic };
