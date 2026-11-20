/**
 * @jest-environment node
 */
// The weather and the light along a world ride (R5, P46). Three rules, on the stage table the game ships:
//   - every stage of the manifest has at least one change of weather or of time of day along it, so a stage added to
//     the manifest with no look of its own fails here until it is given one
//   - on every part that holds a hairpin, the weather lateral grip x the surface grip is 0.80 or more (P46): below
//     that, a rider who holds full lock in a hairpin lowsides (the boundary of tests/unit/world-physics.test.js P35)
//   - what the weather writes along the ride (shares, fog, grip, the road's wetness) moves by no more than one step
//     of the 1.5 km blend between two road samples 10 m apart
import { describe, test, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canvasStub, loadGame, loadScript, realThree } from '../helpers/load-game.js';
import { decodeWorld } from '../../tools/world/encode.mjs';
import { rideSamples } from '../../tools/world/stations.mjs';
import { findHairpins } from '../../tools/world/verify.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const THREE = realThree();
const game = loadGame(THREE);
const { AtmosphereTrack, WorldLooks, WorldPhysics, WorldEnvironment } = game;
const WeatherSystem = new Function('THREE', 'document', `${loadScript('weather.js')}\nreturn WeatherSystem;`)(THREE, canvasStub());

const manifest = JSON.parse(readFileSync(path.join(REPO, 'world/manifest.json'), 'utf8'));
const UNIT = AtmosphereTrack.WORLD_UNIT_M;
// The transition and grip rules need no heights: a flat route gives every part baseY 0
const flat = { heightRange: () => ({ min: 0, max: 0 }) };
const trackOf = (looks, stages = manifest.stages) => AtmosphereTrack.forWorld(stages, flat, looks);

// The stages of `stages` with no change of weather or time of day inside them
function stagesWithoutChange(track, stages) {
    return stages.filter(stage => track.changesWithin(stage.from / UNIT, stage.to / UNIT).length === 0).map(stage => stage.id);
}

describe('every stage changes its weather or its light along it', () => {
    test('the manifest names stages, and each has a change inside it', () => {
        expect(manifest.stages.length).toBeGreaterThan(0);
        const track = trackOf(WorldLooks);
        expect(stagesWithoutChange(track, manifest.stages)).toEqual([]);
        manifest.stages.forEach((stage) => {
            const changes = track.changesWithin(stage.from / UNIT, stage.to / UNIT);
            changes.forEach(change => expect(change.from).not.toBe(change.to));
        });
    });

    test('the Tremola goes from clear air to cloud to rain, and back to clear air before the top', () => {
        const stage = manifest.stages.find(s => s.id === 'tremola');
        const changes = trackOf(WorldLooks).changesWithin(stage.from / UNIT, stage.to / UNIT);
        expect(changes.map(c => c.to)).toEqual(['day/fog', 'day/rain', 'day/clear']);
    });

    test('planted: a stage in one look all the way fails, a stage with no entry fails, and a change of light alone passes', () => {
        const one = { default: WorldLooks.default, tremola: [{ from: 0, to: 1, look: { timeOfDay: 'day', weather: 'clear' } }] };
        expect(stagesWithoutChange(trackOf(one), manifest.stages)).toEqual(['tremola']);
        const added = [...manifest.stages, { id: 'not-yet-looked', from: 13187.4, to: 25000 }];
        expect(stagesWithoutChange(trackOf(WorldLooks, added), added)).toEqual(['not-yet-looked']);
        const light = { default: WorldLooks.default, tremola: [{ from: 0, to: 0.5, look: { timeOfDay: 'day' } }, { from: 0.5, to: 1, look: { timeOfDay: 'golden' } }] };
        expect(stagesWithoutChange(trackOf(light), manifest.stages)).toEqual([]);
    });
});

// The slice as the importer rode it: the samples, their cobbles and the hairpins (verify.mjs findHairpins)
const world = decodeWorld(path.join(REPO, 'world'));
const samples = rideSamples(world.edges, world.ride.path);
const hairpins = findHairpins(samples);
const COBBLES = 8;
const surfaceAt = (i) => (samples.flags[i] & COBBLES ? WorldPhysics.cobbleGrip : 1);

// A world's weather system with no scene: the grip it gives for a mix
function weatherOf(grip) {
    const weather = new WeatherSystem({ fog: null }, null);
    weather.grip = grip;
    return weather;
}

// The least weather lateral grip x surface grip at every sample of every hairpin, through the track's own blend
function hairpinGrip(track, grip) {
    const weather = weatherOf(grip);
    const mix = {};
    const low = [];
    let least = Infinity;
    for (const h of hairpins) {
        for (let i = 0; i < samples.s.length; i++) {
            const s = samples.s[i];
            if (s < h.s0 || s > h.s1) continue;
            weather.setMix(AtmosphereTrack.weatherMix(track.sample(s / UNIT, {}), mix));
            const product = weather.weatherPhysics().lateralFriction * surfaceAt(i);
            least = Math.min(least, product);
            if (product < WorldLooks.hairpinGrip) low.push({ hairpin: `${h.s0}-${h.s1}`, s: Math.round(s), product: Math.round(product * 1e4) / 1e4 });
        }
    }
    return { least, low };
}

// P46 as the plan words it: each part's own look on the worst surface under a hairpin it holds
function partGrip(track, grip) {
    const weather = weatherOf(grip);
    return track.parts.map((part) => {
        const s0 = part.startSegment * UNIT, s1 = part.endSegment * UNIT;
        const held = hairpins.filter(h => h.s1 >= s0 && h.s0 <= s1);
        let surface = 1;
        for (let i = 0; i < samples.s.length; i++) {
            if (held.some(h => samples.s[i] >= h.s0 && samples.s[i] <= h.s1)) surface = Math.min(surface, surfaceAt(i));
        }
        const { look } = part;
        weather.setMix({ rain: look.weather === 'rain' ? 1 : 0, snow: look.weather === 'snow' ? 1 : 0, fog: look.weather === 'fog' ? 1 : 0, intensity: look.weatherIntensity });
        return { weather: look.weather, hairpins: held.length, surface, product: weather.weatherPhysics().lateralFriction * surface };
    });
}

describe('hairpin parts keep enough grip in the weather (P46)', () => {
    const track = trackOf(WorldLooks);

    test('the slice has its hairpins, and the cobbled ones lie in the rain', () => {
        expect(hairpins.length).toBeGreaterThanOrEqual(20);
        const rainFrom = track.parts.find(p => p.look.weather === 'rain').startSegment * UNIT;
        const cobbled = hairpins.filter(h => samples.s.some((s, i) => s >= h.s0 && s <= h.s1 && samples.flags[i] & COBBLES));
        expect(cobbled.length).toBeGreaterThanOrEqual(10);
        expect(cobbled.every(h => h.s0 > rainFrom)).toBe(true);
    });

    test('every part that holds a hairpin keeps weather x surface grip at 0.80 or more', () => {
        const parts = partGrip(track, WorldLooks.grip);
        expect(parts.filter(p => p.hairpins > 0).length).toBe(track.parts.length);
        const low = parts.filter(p => p.hairpins > 0 && p.product < WorldLooks.hairpinGrip);
        expect(low).toEqual([]);
    });

    test('every sample of every hairpin, through the blends, keeps 0.80 or more, and wet cobbles sit at the bound', () => {
        const { least, low } = hairpinGrip(track, WorldLooks.grip);
        if (low.length) throw new Error(`${low.length} hairpin samples under ${WorldLooks.hairpinGrip}:\n${low.slice(0, 12).map(l => JSON.stringify(l)).join('\n')}`);
        // At the bound, not far over it: rain is meant to be harder
        expect(least).toBeGreaterThanOrEqual(WorldLooks.hairpinGrip);
        expect(least).toBeLessThan(WorldLooks.hairpinGrip + 0.005);
    });

    test('the rider gets the same grip: getPhysicsMultipliers on wet cobbles is the rain grip x 0.85, and braking is the legs\'', () => {
        const weather = weatherOf(WorldLooks.grip);
        weather.surfaceGrip = WorldPhysics.cobbleGrip;
        weather.setMix({ rain: 1, intensity: 1 });
        const m = weather.getPhysicsMultipliers();
        expect(m.lateralFriction).toBeCloseTo(0.942 * 0.85, 12);
        expect(m.lateralFriction).toBeGreaterThanOrEqual(WorldLooks.hairpinGrip);
        expect(m.brakeForce).toBeCloseTo(WeatherSystem.GRIP.rain.brake * 0.85, 12);
        // The legs keep their own rain
        expect(new WeatherSystem({ fog: null }, null).grip).toBe(WeatherSystem.GRIP);
        expect(WeatherSystem.GRIP.rain.lateral).toBe(0.7);
    });

    test('planted: the legs\' rain at 1.0 on the cobbled hairpins fails (0.7 x 0.85 = 0.595)', () => {
        const { least, low } = hairpinGrip(track, WeatherSystem.GRIP);
        expect(least).toBeCloseTo(0.595, 6);
        expect(low.length).toBeGreaterThan(0);
        expect(partGrip(track, WeatherSystem.GRIP).some(p => p.product < WorldLooks.hairpinGrip)).toBe(true);
    });
});

// The largest change between two neighbours of `values`, against the most a smoothstep blend of `range` moves in one
// step of `stepM` over `blendM` (its steepest slope is 1.5 / blend). A value that is the product of two blended
// values (a share times the blended intensity) moves at most `factor` 2 times that
function worstJump(values, stepM, factor = 1, blendM = 15 * UNIT) {
    const range = Math.max(...values) - Math.min(...values);
    let worst = 0, at = -1;
    for (let i = 1; i < values.length; i++) {
        const d = Math.abs(values[i] - values[i - 1]);
        if (d > worst) { worst = d; at = i; }
    }
    return { worst, at, limit: factor * range * 1.5 * stepM / blendM * 1.001 + 1e-12, range };
}

describe('the weather along the Tremola is continuous (P47)', () => {
    const stage = manifest.stages.find(s => s.id === 'tremola');
    const STEP = 10;
    // What the game writes at each 10 m of road: the weather shares, the scene fog, the grip and the road's wetness
    const series = (track) => {
        const scene = { fog: new THREE.FogExp2(0xffffff, WorldLooks.clearFog) };
        const weather = new WeatherSystem(scene, null);
        weather.grip = WorldLooks.grip;
        const env = Object.create(WorldEnvironment.prototype);
        const out = { s: [], rain: [], fog: [], density: [], lateral: [], brake: [], wet: [] };
        const mix = {}, sample = {};
        for (let s = stage.from; s <= stage.to; s += STEP) {
            track.sample(s / UNIT, sample);
            const m = AtmosphereTrack.weatherMix(sample, mix);
            weather.setMix({ ...m, fogDensity: AtmosphereTrack.blendLook(sample).fogDensity });
            const physics = weather.weatherPhysics();
            const a = env.resolveRoadSurface(sample.a.weather, sample.a.weatherIntensity).wet;
            const b = env.resolveRoadSurface(sample.b.weather, sample.b.weatherIntensity).wet;
            out.s.push(s);
            out.rain.push(m.rain);
            out.fog.push(m.fog);
            out.density.push(scene.fog.density);
            out.lateral.push(physics.lateralFriction);
            out.brake.push(physics.brakeForce);
            out.wet.push(a + (b - a) * sample.t);
        }
        return out;
    };

    test('rain comes in over 1.5 km, is full for a time, and the last kilometre to the top is dry and clear', () => {
        const values = series(trackOf(WorldLooks));
        const first = values.rain.findIndex(r => r > 0);
        const full = values.rain.findIndex(r => r >= 1);
        expect(first).toBeGreaterThan(0);
        expect(full).toBeGreaterThan(first);
        const spanM = values.s[full] - values.s[first - 1];
        expect(Math.abs(spanM - 1500)).toBeLessThanOrEqual(100);
        const last = values.rain.length - 1 - values.rain.slice().reverse().findIndex(r => r >= 1);
        expect(values.s[last] - values.s[full]).toBeGreaterThanOrEqual(1000);
        const top = values.s.findIndex(s => s >= stage.to - 1000);
        for (const key of ['rain', 'fog', 'wet']) expect(Math.max(...values[key].slice(top))).toBe(0);
    });

    test('no value the weather writes jumps more than a blend step between samples 10 m apart', () => {
        const values = series(trackOf(WorldLooks));
        // The shares and the road's wetness are one blend each; the fog density and the grip are a share times an intensity
        for (const [key, factor] of [['rain', 1], ['fog', 1], ['wet', 1], ['density', 2], ['lateral', 2], ['brake', 2]]) {
            const jump = worstJump(values[key], STEP, factor);
            if (jump.worst > jump.limit) throw new Error(`${key} jumps ${jump.worst} at s ${values.s[jump.at]} (limit ${jump.limit})`);
            expect(jump.range).toBeGreaterThan(0);
        }
    });

    test('planted: a look cut in without a blend is a jump', () => {
        const cut = series(trackOf(WorldLooks));
        const i = Math.floor(cut.rain.length * 0.6);
        const stepped = cut.rain.map((r, k) => (k < i ? 0 : 1));
        const jump = worstJump(stepped, STEP);
        expect(jump.worst).toBeGreaterThan(jump.limit);
    });
});
