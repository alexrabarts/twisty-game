/**
 * Atmosphere track
 * What the sky, light, fog and weather do along a ride, as plain data with no
 * scene access. A ride is a list of parts, each with one look; the track blends
 * two neighbouring looks over a zone centred on their boundary (forWorld).
 *
 * A part is { startSegment, endSegment, look } with
 *   look = { timeOfDay, weather, weatherIntensity, fogDensity, heightFog,
 *            shafts, ring, baseY, shadowSpan }
 * `ring` is a number or [from, to], a ramp over the part. `heightFog` is
 * { density, falloff } or null. A look that leaves out a field takes it from
 * the part before it (the first part takes the defaults below), except the
 * weather, which defaults to clear: a tunnel or gallery part can leave out the
 * light and the weather and still be a valid look.
 */

// A blend zone is this many units (1.5 km of a world's track) wide, centred on a part boundary
const ATMOSPHERE_BLEND_SEGMENTS = 15;

// Metres in one unit of a world's track
const WORLD_ATMOSPHERE_UNIT = 100;

const ATMOSPHERE_LOOK_DEFAULTS = {
    timeOfDay: 'golden',
    fogDensity: 0.0018,
    heightFog: null,
    shafts: 0,
    ring: 1,
    baseY: 0,
    shadowSpan: undefined
};

class AtmosphereTrack {
    constructor(parts) {
        this.parts = parts;
        this.half = ATMOSPHERE_BLEND_SEGMENTS / 2;
        this.boundaries = parts.slice(1).map(part => part.startSegment);
    }

    // `parts` in road order; throws on a table that cannot be blended
    static build(parts) {
        if (!Array.isArray(parts) || parts.length === 0) throw new Error('AtmosphereTrack needs at least one part');
        const filled = [];
        parts.forEach((part, index) => {
            if (!(part.endSegment >= part.startSegment)) throw new Error(`part ${index} ends before it starts`);
            if (index > 0) {
                // Two zones may not touch, or no segment between them is a part's own look
                const gap = part.startSegment - parts[index - 1].startSegment;
                if (gap <= ATMOSPHERE_BLEND_SEGMENTS) throw new Error(`part ${index} starts ${gap} segments after the part before it; it needs more than ${ATMOSPHERE_BLEND_SEGMENTS}`);
            }
            filled.push({
                startSegment: part.startSegment,
                endSegment: part.endSegment,
                look: AtmosphereTrack.fillLook(part.look || {}, filled[index - 1] && filled[index - 1].look)
            });
        });
        return new AtmosphereTrack(filled);
    }

    // The leg-start rule for every consumer: weather || 'clear', and an
    // intensity left out is 1.0 (it matters only for a weather that is not clear)
    static fillLook(look, previous) {
        const inherited = key => (look[key] !== undefined ? look[key] : previous && previous[key] !== undefined ? previous[key] : ATMOSPHERE_LOOK_DEFAULTS[key]);
        return {
            timeOfDay: inherited('timeOfDay'),
            weather: look.weather || 'clear',
            weatherIntensity: look.weatherIntensity !== undefined ? look.weatherIntensity : 1.0,
            fogDensity: inherited('fogDensity'),
            heightFog: look.heightFog !== undefined ? look.heightFog : previous ? previous.heightFog : ATMOSPHERE_LOOK_DEFAULTS.heightFog,
            shafts: inherited('shafts'),
            ring: inherited('ring'),
            baseY: inherited('baseY'),
            shadowSpan: inherited('shadowSpan')
        };
    }

    // Metres in one unit of a world's track
    static get WORLD_UNIT_M() { return WORLD_ATMOSPHERE_UNIT; }

    // One track for the whole ride of a world, in units of WORLD_ATMOSPHERE_UNIT metres, so a blend zone
    // is 1.5 km of road. Each stage takes the parts of `looks[stage.id]` (or `looks.default`); a part
    // spans `from` to `to`, shares of the stage's length. A part's baseY is the lowest road under it.
    static forWorld(stages, route, looks) {
        const unit = WORLD_ATMOSPHERE_UNIT;
        const parts = [];
        stages.forEach((stage) => {
            const spec = looks[stage.id] || looks.default;
            const length = stage.to - stage.from;
            spec.forEach((part) => {
                const s0 = stage.from + part.from * length;
                const s1 = stage.from + part.to * length;
                parts.push({
                    startSegment: s0 / unit,
                    endSegment: s1 / unit,
                    look: { baseY: route.heightRange(s0, s1).min, ...part.look }
                });
            });
        });
        return AtmosphereTrack.build(parts);
    }

    // A one-part track from a literal look (the rider showcase)
    static oneLook(look) {
        return AtmosphereTrack.build([{ startSegment: 0, endSegment: 1, look }]);
    }

    // A generator of floats in [0, 1) from a string, so weather that draws
    // from it is the same for every rider (mulberry32 over an FNV-1a hash)
    static seededRandom(seed) {
        let h = 0x811c9dc5;
        for (let i = 0; i < seed.length; i++) {
            h ^= seed.charCodeAt(i);
            h = Math.imul(h, 0x01000193);
        }
        let state = h >>> 0;
        return () => {
            state = (state + 0x6d2b79f5) | 0;
            let t = Math.imul(state ^ (state >>> 15), 1 | state);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // Two 0xRRGGBB colours mixed channel by channel, rounded: exact at 0 and 1
    static lerpHex(a, b, t) {
        const channel = shift => {
            const from = (a >> shift) & 255;
            return Math.round(from + (((b >> shift) & 255) - from) * t);
        };
        return (channel(16) << 16) | (channel(8) << 8) | channel(0);
    }

    // The progress through a part, 0 to 1, as the far-ring ramp reads it
    static progress(part, segment) {
        const raw = (segment - part.startSegment) / Math.max(1, part.endSegment - part.startSegment);
        return Math.min(1, Math.max(0, raw));
    }

    static ringAt(ring, progress) {
        return typeof ring === 'number' ? ring : ring[0] + (ring[1] - ring[0]) * progress;
    }

    // The first segment of the part that holds `segment` where the part has
    // its own look, outside the blend zone at its start
    settledSegment(segment) {
        const { partA } = this.sample(segment);
        const first = this.parts[0] === partA ? partA.startSegment : partA.startSegment + Math.ceil(this.half);
        return Math.min(partA.endSegment, first);
    }

    // The part boundaries strictly inside units (u0, u1) where the look changes its weather or its time of day:
    // [{ at, from, to }], each look named `time/weather`. A world stage holds at least one (WorldLooks)
    changesWithin(u0, u1) {
        const name = look => `${look.timeOfDay}/${look.weather}`;
        return this.boundaries
            .map((at, i) => ({ at, a: this.parts[i].look, b: this.parts[i + 1].look }))
            .filter(({ at, a, b }) => at > u0 && at < u1 && (a.weather !== b.weather || a.timeOfDay !== b.timeOfDay))
            .map(({ at, a, b }) => ({ at, from: name(a), to: name(b) }));
    }

    // Every non-clear weather in the track, in first-seen order: what the weather system prepares
    weatherTypes() {
        const seen = [];
        this.parts.forEach(({ look }) => {
            if (look.weather !== 'clear' && !seen.includes(look.weather)) seen.push(look.weather);
        });
        return seen;
    }

    // { a, b, t, u, ua, ub, partA, partB } at a (fractional) segment.
    // a and b are looks; t is the smoothstep weight of b; outside a blend zone
    // t is exactly 0 and a === b. u is the progress through the nearer part;
    // ua and ub are the progress through each of the two. `out` is reused when given.
    sample(segment, out = {}) {
        // The atmosphere's one way in: a non-finite segment (a NaN progress) reads the last finite one, logged once,
        // so a fault upstream never reaches the fog, the sky or the lights
        if (!Number.isFinite(segment)) {
            if (!this.nonFiniteLogged) {
                this.nonFiniteLogged = true;
                console.error('AtmosphereTrack.sample: non-finite segment', segment, 'held at', this.lastSegment ?? 0);
            }
            segment = this.lastSegment ?? 0;
        }
        this.lastSegment = segment;
        const { parts, boundaries, half } = this;
        let index = 0;
        let t = 0;
        for (let i = 0; i < boundaries.length; i++) {
            const lo = boundaries[i] - half;
            const hi = boundaries[i] + half;
            if (segment <= lo) break;
            if (segment < hi) {
                const x = (segment - lo) / ATMOSPHERE_BLEND_SEGMENTS;
                t = x * x * (3 - 2 * x);
                break;
            }
            index = i + 1;
        }
        const partA = parts[index];
        const partB = t > 0 ? parts[index + 1] : partA;
        out.a = partA.look;
        out.b = partB.look;
        out.t = t;
        out.partA = partA;
        out.partB = partB;
        out.ua = AtmosphereTrack.progress(partA, segment);
        out.ub = AtmosphereTrack.progress(partB, segment);
        out.u = t < 0.5 ? out.ua : out.ub;
        return out;
    }

    // The numbers a sample writes outside time and sky: far ring, height fog,
    // shafts, base fog density, base height and shadow box. `out` is reused.
    static blendLook(sample, out = {}) {
        const { a, b, t } = sample;
        const mix = (x, y) => (t === 0 ? x : x + (y - x) * t);
        out.ring = mix(AtmosphereTrack.ringAt(a.ring, sample.ua), AtmosphereTrack.ringAt(b.ring, sample.ub));
        out.shafts = mix(a.shafts, b.shafts);
        out.fogDensity = mix(a.fogDensity, b.fogDensity);
        out.baseY = mix(a.baseY, b.baseY);
        out.shadowSpan = a.shadowSpan === undefined || b.shadowSpan === undefined ? (t < 0.5 ? a.shadowSpan : b.shadowSpan) : mix(a.shadowSpan, b.shadowSpan);
        if (t === 0 || a.heightFog === b.heightFog) {
            out.heightFog = a.heightFog;
        } else {
            // A part with no height fog is fog of density 0 with its neighbour's falloff
            const fa = a.heightFog || { density: 0, falloff: b.heightFog.falloff };
            const fb = b.heightFog || { density: 0, falloff: a.heightFog.falloff };
            out.heightFog = { density: mix(fa.density, fb.density), falloff: mix(fa.falloff, fb.falloff) };
        }
        return out;
    }

    // The share of each weather in a sample, and the intensity of the weather
    // present: { rain, snow, fog, intensity }. A weather that both looks share
    // keeps a share of 1 while its intensity blends; a clear look takes the
    // remaining share, and no intensity.
    static weatherMix(sample, out = {}) {
        const { a, b, t } = sample;
        out.rain = 0;
        out.snow = 0;
        out.fog = 0;
        const add = (look, weight) => {
            if (look.weather !== 'clear') out[look.weather] += weight;
        };
        if (t === 0 || a.weather === b.weather) {
            add(a, 1);
        } else {
            add(a, 1 - t);
            add(b, t);
        }
        const mixed = (x, y) => (t === 0 ? x : x + (y - x) * t);
        if (t === 0) {
            out.intensity = a.weatherIntensity;
        } else if (a.weather === b.weather) {
            out.intensity = mixed(a.weatherIntensity, b.weatherIntensity);
        } else {
            // The intensity of the weather present: clear looks carry none
            const wa = a.weather === 'clear' ? 0 : 1 - t;
            const wb = b.weather === 'clear' ? 0 : t;
            out.intensity = wa + wb > 0
                ? (a.weatherIntensity * wa + b.weatherIntensity * wb) / (wa + wb)
                : mixed(a.weatherIntensity, b.weatherIntensity);
        }
        return out;
    }
}
