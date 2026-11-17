// The atmosphere track: what the light, sky, fog and weather do along a leg, and
// the game code that writes them. Real three, real WeatherSystem, Graphics and
// Environment; the Game methods are cut out of js/main.js and bound to a rig.
import { describe, test, expect, jest } from '@jest/globals';
import { buildEnvironment, canvasStub, gameMethods, legs, loadSharedGame as loadGame, loadScript, realThree } from '../helpers/load-game.js';
// Leg 1 is a converted leg now: these tests are of the shared course, with leg 1 put back on it (Course.release)

const THREE = realThree();
const game = loadGame(THREE);
const { AtmosphereTrack, Environment, Terrain } = game;

const load = (file, name) => new Function('THREE', 'document', 'window', 'AtmosphereTrack', `${loadScript(file)}\nreturn ${name};`)(THREE, canvasStub(), {}, AtmosphereTrack);
const WeatherSystem = load('weather.js', 'WeatherSystem');
const Graphics = load('graphics.js', 'Graphics');

// The Game constructor's time-of-day table, cut out of the real source
const timeConfigs = (() => {
    const lines = loadScript('main.js').split('\n');
    const start = lines.findIndex(line => line === '        this.timeConfigs = {');
    const end = lines.findIndex((line, n) => n > start && line === '        };');
    return new Function(`return ${lines.slice(start, end + 1).join('\n').replace('this.timeConfigs =', '')}`)();
})();

const LEG_INTENSITIES = [0, 0, 0, 4, 0, 0.9, 0, 1];
const oneLook = (extra = {}) => ({ timeOfDay: 'golden', weather: 'clear', weatherIntensity: 0, fogDensity: 0.001, heightFog: null, shafts: 0, ring: 1, baseY: 0, ...extra });
// Two parts that meet at segment 100: dawn in clear air, then night in rain
const twoParts = () => AtmosphereTrack.build([
    { startSegment: 0, endSegment: 99, look: oneLook({ timeOfDay: 'dawn', fogDensity: 0.001, ring: [0.2, 0.6], baseY: 10, heightFog: { density: 0.002, falloff: 0.05 } }) },
    { startSegment: 100, endSegment: 199, look: oneLook({ timeOfDay: 'night', weather: 'rain', weatherIntensity: 0.9, fogDensity: 0.003, ring: 1, baseY: 20, shafts: 0.4 }) }
]);

describe('AtmosphereTrack.sample', () => {
    test('a one-part track gives the same look with no blend at every segment', () => {
        legs(game).forEach((leg, index) => {
            const { env } = buildEnvironment(game, index);
            const track = AtmosphereTrack.forLeg(leg, game.Terrain.legConfig(index), env);
            for (let segment = -5; segment <= 800; segment += 7) {
                const sample = track.sample(segment);
                expect(sample.t).toBe(0);
                expect(sample.a).toBe(sample.b);
            }
        });
    });

    test('the blend zone is 15 segments centred on the boundary, and smooth', () => {
        const track = twoParts();
        expect(track.sample(92.5).t).toBe(0);
        expect(track.sample(92).a).toBe(track.sample(0).a);
        expect(track.sample(93).t).toBeGreaterThan(0);
        expect(track.sample(100).t).toBeCloseTo(0.5, 12);
        expect(track.sample(107).t).toBeLessThan(1);
        const after = track.sample(107.5);
        expect(after.t).toBe(0);
        expect(after.a).toBe(after.b);
        expect(after.a).toBe(track.sample(150).a);
        // The weight of the second part rises from 0 to 1 and never steps
        const weightOfSecond = sample => (sample.a === track.parts[1].look ? 1 : sample.t);
        let last = 0;
        for (let segment = 92.5; segment <= 108; segment += 0.25) {
            const weight = weightOfSecond(track.sample(segment));
            expect(weight).toBeGreaterThanOrEqual(last);
            expect(weight - last).toBeLessThan(0.1);
            last = weight;
        }
        expect(last).toBe(1);
        expect(track.sample(100).a).not.toBe(track.sample(100).b);
    });

    test('a part with several boundaries finds its neighbours', () => {
        const track = AtmosphereTrack.build([0, 50, 100].map(startSegment => ({ startSegment, endSegment: startSegment + 49, look: oneLook({ baseY: startSegment }) })));
        expect(track.sample(60).a.baseY).toBe(50);
        expect(track.sample(100).a.baseY).toBe(50);
        expect(track.sample(100).b.baseY).toBe(100);
        expect(track.sample(140).a.baseY).toBe(100);
    });

    test('settledSegment is the first segment of a part with no blend', () => {
        const track = twoParts();
        expect(track.settledSegment(30)).toBe(0);
        const settled = track.settledSegment(150);
        expect(track.sample(settled).t).toBe(0);
        expect(track.sample(settled - 1).t).toBeGreaterThan(0);
    });
});

describe('AtmosphereTrack.build', () => {
    test('a part that leaves out the light and the weather takes the light of the part before it, in clear air', () => {
        const track = AtmosphereTrack.build([
            { startSegment: 0, endSegment: 49, look: oneLook({ timeOfDay: 'sunset', weather: 'fog', weatherIntensity: 2, heightFog: { density: 0.004, falloff: 0.04 } }) },
            { startSegment: 50, endSegment: 99, look: { fogDensity: 0.0005 } }
        ]);
        const tunnel = track.parts[1].look;
        expect(tunnel.timeOfDay).toBe('sunset');
        expect(tunnel.weather).toBe('clear');
        expect(tunnel.heightFog).toEqual({ density: 0.004, falloff: 0.04 });
        expect(tunnel.fogDensity).toBe(0.0005);
        expect(track.weatherTypes()).toEqual(['fog']);
    });

    test('refuses a track whose blend zones touch, or an empty one', () => {
        expect(() => AtmosphereTrack.build([])).toThrow();
        expect(() => AtmosphereTrack.build([
            { startSegment: 0, endSegment: 9, look: oneLook() },
            { startSegment: 10, endSegment: 19, look: oneLook() }
        ])).toThrow(/more than 15/);
        expect(() => AtmosphereTrack.build([{ startSegment: 5, endSegment: 4, look: oneLook() }])).toThrow();
    });
});

describe('AtmosphereTrack.forLeg', () => {
    test('an unconverted leg is one part with its own look', () => {
        legs(game).forEach((leg, index) => {
            const config = Terrain.legConfig(index);
            const { env } = buildEnvironment(game, index);
            const track = AtmosphereTrack.forLeg(leg, config, env);
            expect(track.parts).toHaveLength(1);
            const look = track.parts[0].look;
            expect(look.timeOfDay).toBe(leg.timeOfDay);
            expect(look.weather).toBe(leg.weather);
            expect(look.fogDensity).toBe(config.look.fogDensity);
            expect(look.heightFog).toBe(config.atmosphere.heightFog);
            expect(look.shafts).toBe(config.atmosphere.shafts);
            expect(look.baseY).toBe(AtmosphereTrack.lowestRoadHeight(env.route, leg.startSegment, leg.endSegment));
        });
    });

    test('the far ring of mountain-dawn rises 0.15, 0.575, 1 over the leg; the others hold', () => {
        const rides = legs(game).map((leg, index) => {
            const { env } = buildEnvironment(game, index);
            const track = AtmosphereTrack.forLeg(leg, Terrain.legConfig(index), env);
            return [0, 0.5, 1].map(f => AtmosphereTrack.blendLook(track.sample(leg.startSegment + f * (leg.endSegment - leg.startSegment))).ring);
        });
        expect(rides[0][0]).toBe(0.15);
        expect(rides[0][1]).toBeCloseTo(0.575, 9);
        expect(rides[0][2]).toBe(1);
        expect(rides[2]).toEqual([0.35, 0.35, 0.35]);
        expect(rides[1]).toEqual([1, 1, 1]);
    });

    test('a converted leg takes its parts from the config, with the base height of each part', () => {
        const leg = legs(game)[0];
        const { env } = buildEnvironment(game, 0);
        const config = {
            ...Terrain.legConfig(0),
            parts: [
                { startSegment: leg.startSegment, endSegment: leg.startSegment + 30, look: { weather: 'rain', weatherIntensity: 0.5 } },
                { startSegment: leg.startSegment + 40, endSegment: leg.endSegment, look: { timeOfDay: 'night' } }
            ]
        };
        const track = AtmosphereTrack.forLeg(leg, config, env);
        expect(track.parts.map(part => part.look.timeOfDay)).toEqual([leg.timeOfDay, 'night']);
        expect(track.parts[0].look.baseY).toBe(AtmosphereTrack.lowestRoadHeight(env.route, leg.startSegment, leg.startSegment + 30));
        expect(track.parts[1].look.fogDensity).toBe(Terrain.legConfig(0).look.fogDensity);
    });
});

describe('intensity rule', () => {
    // Every tours.js leg defines the intensity, and a weather that is not clear has some
    const offenders = list => list.filter(leg => leg.weatherIntensity === undefined || (leg.weather && leg.weather !== 'clear' && !(leg.weatherIntensity > 0)));

    test('the single rule gives the intensities of all 8 legs, and the three old rules agree', () => {
        const all = legs(game);
        const fromTrack = all.map((leg, index) => {
            const { env } = buildEnvironment(game, index);
            return AtmosphereTrack.forLeg(leg, Terrain.legConfig(index), env).parts[0].look.weatherIntensity;
        });
        expect(fromTrack).toEqual(LEG_INTENSITIES);
        expect(all.map(leg => leg.weatherIntensity || 0)).toEqual(LEG_INTENSITIES);
        all.forEach((leg, index) => {
            if (leg.weather !== 'clear') expect(leg.weatherIntensity || 1).toBe(LEG_INTENSITIES[index]);
        });
    });

    test('the guard holds for every leg and catches a copy of storm-valley with intensity 0', () => {
        expect(offenders(legs(game))).toEqual([]);
        const mutated = legs(game).map(leg => (leg.id === 'storm-valley' ? { ...leg, weatherIntensity: 0 } : leg));
        expect(offenders(mutated).map(leg => leg.id)).toEqual(['storm-valley']);
    });

    test('an intensity left out is 1.0, so a part with only a weather still has some', () => {
        const track = AtmosphereTrack.build([{ startSegment: 0, endSegment: 9, look: { weather: 'snow' } }]);
        expect(track.parts[0].look.weatherIntensity).toBe(1);
    });
});

describe('AtmosphereTrack.weatherMix and blendLook', () => {
    test('a one-part track gives a full share and its own intensity', () => {
        const track = AtmosphereTrack.build([{ startSegment: 0, endSegment: 9, look: oneLook({ weather: 'rain', weatherIntensity: 0.9 }) }]);
        expect(AtmosphereTrack.weatherMix(track.sample(5))).toEqual({ rain: 1, snow: 0, fog: 0, intensity: 0.9 });
    });

    test('rain fading in from clear keeps the intensity of the rain', () => {
        const track = twoParts();
        const mix = AtmosphereTrack.weatherMix(track.sample(100));
        expect(mix.rain).toBeCloseTo(0.5, 12);
        expect(mix.intensity).toBeCloseTo(0.9, 12);
        expect(mix.fog + mix.snow).toBe(0);
    });

    test('rain into rain keeps a full share while the intensity blends', () => {
        const track = AtmosphereTrack.build([
            { startSegment: 0, endSegment: 49, look: oneLook({ weather: 'rain', weatherIntensity: 0.4 }) },
            { startSegment: 50, endSegment: 99, look: oneLook({ weather: 'rain', weatherIntensity: 1 }) }
        ]);
        const mix = AtmosphereTrack.weatherMix(track.sample(50));
        expect(mix.rain).toBe(1);
        expect(mix.intensity).toBeCloseTo(0.7, 12);
    });

    test('fog, height fog, base height and ring blend between parts, and are exact outside the zone', () => {
        const track = twoParts();
        const inside = AtmosphereTrack.blendLook(track.sample(100), {});
        expect(inside.fogDensity).toBeCloseTo(0.002, 12);
        expect(inside.baseY).toBeCloseTo(15, 12);
        expect(inside.shafts).toBeCloseTo(0.2, 12);
        // A part with no height fog is fog of density 0 with the falloff of its neighbour
        expect(inside.heightFog.density).toBeCloseTo(0.001, 12);
        expect(inside.heightFog.falloff).toBe(0.05);
        const outside = AtmosphereTrack.blendLook(track.sample(10), {});
        expect(outside.fogDensity).toBe(0.001);
        expect(outside.heightFog).toBe(track.parts[0].look.heightFog);
        expect(outside.ring).toBeCloseTo(0.2 + 0.4 * (10 / 99), 12);
    });
});

describe('seeded random', () => {
    test('the same string gives the same sequence, another string another', () => {
        const draw = seed => { const random = AtmosphereTrack.seededRandom(seed); return Array.from({ length: 5 }, random); };
        expect(draw('mountain-dawn-v3')).toEqual(draw('mountain-dawn-v3'));
        expect(draw('mountain-dawn-v3')).not.toEqual(draw('valley-run-v3'));
        draw('x').forEach(value => { expect(value).toBeGreaterThanOrEqual(0); expect(value).toBeLessThan(1); });
    });

    test('random source: one look keeps the global stream, several looks take no number from it', () => {
        const scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(0xffffff, 0.001);
        expect(new WeatherSystem(scene, null).random).toBe(Math.random);

        // three's own uuids draw from Math.random, so only the weather's own draws are counted
        const intervals = seedMath => {
            const real = Math.random;
            Math.random = seedMath;
            try {
                const system = new WeatherSystem(scene, null, AtmosphereTrack.seededRandom('mountain-dawn-v3'));
                system.prepare(['rain']);
                system.setMix({ rain: 1, intensity: 0.9 });
                const seen = [system.lightningInterval];
                let calls = 0;
                Math.random = () => { calls++; return seedMath(); };
                for (let i = 0; i < 9; i++) {
                    system.update(100, null);
                    seen.push(system.lightningInterval);
                }
                system.dispose();
                return { seen, calls };
            } finally {
                Math.random = real;
            }
        };
        jest.useFakeTimers();
        const first = intervals(() => 0.1);
        const second = intervals(() => 0.9);
        jest.useRealTimers();
        expect(first.calls).toBe(0);
        expect(second.calls).toBe(0);
        expect(first.seen).toEqual(second.seen);
        expect(new Set(first.seen).size).toBeGreaterThan(5);
    });
});

describe('WeatherSystem mix', () => {
    const fogScene = (density = 0.0012) => {
        const scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(0x112233, density);
        return scene;
    };
    const system = (types, density) => {
        const scene = fogScene(density);
        const weather = new WeatherSystem(scene, { position: new THREE.Vector3() });
        weather.prepare(types);
        return { weather, scene };
    };

    test('setMix moves the draw range and reallocates nothing', () => {
        const { weather } = system(['rain', 'snow']);
        const rain = weather.systems.rain.points;
        const buffer = rain.geometry.attributes.position;
        const array = buffer.array;
        const ranges = [0, 0.25, 0.5, 0.75, 1].map(share => {
            weather.setMix({ rain: share, intensity: 0.9 });
            return rain.geometry.drawRange.count;
        });
        expect(ranges).toEqual([0, 750, 1500, 2250, 3000]);
        expect(rain.geometry.attributes.position).toBe(buffer);
        expect(rain.geometry.attributes.position.array).toBe(array);
        expect(rain.visible).toBe(true);
        weather.setMix({ intensity: 0 });
        expect(rain.visible).toBe(false);
        expect(weather.systems.snow.points.visible).toBe(false);
    });

    test('prepare twice leaves one set of particles in the scene', () => {
        const { weather, scene } = system(['rain']);
        weather.prepare(['rain', 'snow']);
        expect(scene.children.filter(child => child.isPoints)).toHaveLength(2);
        weather.dispose();
        expect(scene.children.filter(child => child.isPoints)).toHaveLength(0);
    });

    test('the grip of one look equals the baseline of each leg', () => {
        const expected = {
            'storm-valley': { lateralFriction: 0.6935, brakeForce: 0.779, acceleration: 0.91 },
            'winter-pass': { lateralFriction: 0.34, brakeForce: 0.51, acceleration: 0.7 },
            'night-ride': { lateralFriction: 0.9, brakeForce: 0.9, acceleration: 1 }
        };
        legs(game).forEach((leg, index) => {
            const { weather } = system([]);
            weather.surfaceGrip = Terrain.legConfig(index).grip ?? 1;
            weather.setMix({ rain: leg.weather === 'rain' ? 1 : 0, snow: leg.weather === 'snow' ? 1 : 0, fog: leg.weather === 'fog' ? 1 : 0, intensity: leg.weatherIntensity });
            const grip = weather.getPhysicsMultipliers();
            const want = expected[leg.id] || { lateralFriction: 1, brakeForce: 1, acceleration: 1 };
            Object.keys(want).forEach(key => expect(grip[key]).toBeCloseTo(want[key], 9));
        });
    });

    test('half a rain mix lies strictly between clear and rain', () => {
        const { weather } = system(['rain']);
        weather.setMix({ rain: 0.5, intensity: 0.9 });
        const grip = weather.getPhysicsMultipliers();
        expect(grip.lateralFriction).toBeLessThan(1);
        expect(grip.lateralFriction).toBeGreaterThan(0.73);
    });

    test('the dominant weather is the largest share, clear when none is', () => {
        const { weather } = system(['rain']);
        const dominant = mix => { weather.setMix(mix); return weather.weatherType; };
        expect(dominant({})).toBe('clear');
        expect(dominant({ rain: 0.4 })).toBe('clear');
        expect(dominant({ rain: 0.6 })).toBe('rain');
        expect(dominant({ rain: 0.5 })).toBe('rain');
        expect(dominant({ rain: 0.3, snow: 0.4 })).toBe('snow');
        expect(dominant({ fog: 1 })).toBe('fog');
    });

    test('ice patches need snow over half the road', () => {
        const { weather } = system(['snow']);
        weather.setMix({ snow: 0.5 });
        expect(weather.isIcePatch(23)).toBe(false);
        weather.setMix({ snow: 0.6 });
        expect(weather.isIcePatch(23)).toBe(true);
        expect(weather.isIcePatch(24)).toBe(false);
    });

    test('the fog density is the part density in clear air and the weather density in full weather', () => {
        const { weather, scene } = system(['rain', 'snow']);
        weather.setMix({ fogDensity: 0.002 });
        expect(scene.fog.density).toBe(0.002);
        weather.setMix({ rain: 1, intensity: 0.9, fogDensity: 0.002 });
        expect(scene.fog.density).toBe(0.0015 * 0.9);
        weather.setMix({ snow: 1, intensity: 1, fogDensity: 0.002 });
        expect(scene.fog.density).toBe(0.002 * 1);
        weather.setMix({ rain: 0.5, intensity: 1, fogDensity: 0.002 });
        expect(scene.fog.density).toBeCloseTo(0.5 * 0.002 + 0.5 * 0.0015, 12);
        expect(scene.fog.color.getHex()).not.toBe(0x707880);
        weather.setMix({ rain: 1, intensity: 1, fogDensity: 0.002 });
        expect(scene.fog.color.getHex()).toBe(0x707880);
    });

    test('fog weather thins as the bike climbs, and update is the only writer', () => {
        const { weather, scene } = system([]);
        weather.setMix({ fog: 1, intensity: 4, fogDensity: 0.0008, baseY: 10 });
        expect(scene.fog.density).toBe(0.003 * 4);
        weather.update(0.016, { x: 0, y: 10, z: 0 });
        expect(scene.fog.density).toBe(0.003 * 4);
        weather.update(0.016, { x: 0, y: 60, z: 0 });
        expect(scene.fog.density).toBe(0.003 * 4 * (1 - 0.5));
        // Half fog over a part of fog density 0.002
        weather.setMix({ fog: 0.5, intensity: 4, fogDensity: 0.002, baseY: 10 });
        weather.update(0.016, { x: 0, y: 10, z: 0 });
        expect(scene.fog.density).toBeCloseTo(0.5 * 0.002 + 0.5 * 0.003 * 4, 12);
    });

    test('a weather that goes away and comes back is placed on the camera', () => {
        const camera = { position: new THREE.Vector3(0, 5, 0) };
        const weather = new WeatherSystem(fogScene(), camera);
        weather.prepare(['rain']);
        weather.setMix({ rain: 1, intensity: 1 });
        weather.update(0.016, null);
        weather.setMix({ intensity: 0 });
        camera.position.set(900, 5, 900);
        weather.update(0.016, null);
        weather.setMix({ rain: 1, intensity: 1 });
        weather.update(0.016, null);
        const points = weather.systems.rain.points;
        expect(points.position.x).toBe(900);
        const positions = points.geometry.attributes.position.array;
        for (let i = 0; i < positions.length; i += 3) {
            expect(Math.abs(positions[i])).toBeLessThanOrEqual(100);
            expect(Math.abs(positions[i + 2])).toBeLessThanOrEqual(100);
        }
    });
});

describe('Graphics sky and rebake', () => {
    const rig = () => {
        const colour = () => ({ value: new THREE.Color() });
        const number = () => ({ value: 0 });
        return Object.assign(Object.create(Graphics.prototype), {
            atmosphereSupported: true,
            atmosphere: null,
            ringStrength: 1,
            timeKey: 'golden',
            weatherType: 'clear',
            timeConfig: null,
            skyCache: new Map(),
            skyBase: { fogBlend: 0, mountains: 1 },
            fogShare: 0,
            frames: 0,
            stats: { envBakes: 0, lastBakeFrame: 0 },
            skyBlend: 0,
            bakedBlend: 0,
            environmentDirty: false,
            sunDirection: new THREE.Vector3(),
            skyUniforms: {
                uZenith: colour(), uMid: colour(), uGlowColor: colour(), uCloudLit: colour(), uCloudShadow: colour(),
                uMountain: colour(), uSunColor: colour(), uSunDir: { value: new THREE.Vector3() },
                uCoverage: number(), uStars: number(), uMoon: number(), uSunIntensity: number(), uGlow: number(),
                uFogBlend: number(), uMountains: number()
            }
        });
    };

    test('resolve then write is what applySky wrote, and applySky still snaps', () => {
        const graphics = rig();
        graphics.setTimeOfDay('twilight', timeConfigs.twilight);
        graphics.setWeather('rain');
        expect(graphics.environmentDirty).toBe(true);
        const sky = graphics.resolveSky('twilight', 'rain', timeConfigs.twilight);
        expect(sky).toBe(graphics.resolveSky('twilight', 'rain', timeConfigs.twilight));
        expect(graphics.grade.saturation).toBe(sky.saturation);
        // Rain at twilight dims the sky
        expect(graphics.skyUniforms.uZenith.value.getHex()).not.toBe(sky.zenith);
        expect(graphics.weatherType).toBe('rain');
    });

    test('blendSky is the first sky at 0, the second at 1, and switches the moon at 0.5', () => {
        const graphics = rig();
        const day = graphics.resolveSky('golden', 'clear', timeConfigs.golden);
        const night = graphics.resolveSky('night', 'clear', timeConfigs.night);
        expect(night.moon).toBe(1);
        const at = t => ({ ...graphics.blendSky(day, night, t, {}) });
        expect(at(0).zenith).toBe(day.zenith);
        expect(at(1).zenith).toBe(night.zenith);
        expect(at(0.5).zenith).not.toBe(day.zenith);
        expect(at(0.49).moon).toBe(0);
        expect(at(0.5).moon).toBe(1);
        expect(at(0.5).stars).toBeCloseTo((day.stars + night.stars) / 2, 12);
        // The disc is dark where the moon replaces the sun, and whole at either end
        expect(at(0.5).sunIntensity).toBe(0);
        expect(at(0).sunIntensity).toBe(day.sunIntensity);
        expect(at(1).sunIntensity).toBe(night.sunIntensity);
        expect(at(0.25).sunIntensity).toBeCloseTo(day.sunIntensity * 0.5, 12);
        // Two skies with the same disc blend plainly
        const dusk = graphics.resolveSky('twilight', 'clear', timeConfigs.twilight);
        expect(dusk.moon).toBe(0);
        expect(at(0).moon).toBe(0);
        expect(graphics.blendSky(day, dusk, 0.5, {}).sunIntensity).toBeCloseTo((day.sunIntensity + dusk.sunIntensity) / 2, 12);
    });

    test('rebake waits for 30 frames and for the blend to move 0.125', () => {
        const graphics = rig();
        const ask = (frames, blend) => {
            graphics.frames = frames;
            graphics.skyBlend = blend;
            graphics.environmentDirty = false;
            graphics.requestRebake();
            return graphics.environmentDirty;
        };
        expect(ask(10, 0.5)).toBe(false);
        expect(ask(29, 0.5)).toBe(false);
        expect(ask(30, 0.1)).toBe(false);
        expect(ask(30, 0.125)).toBe(true);
        graphics.bakedBlend = 0.5;
        graphics.stats.lastBakeFrame = 100;
        expect(ask(129, 0.9)).toBe(false);
        expect(ask(130, 0.9)).toBe(true);
        expect(ask(130, 0.55)).toBe(false);
    });

    test('thick fog hides the far ring by the share of fog in the sky', () => {
        const graphics = rig();
        graphics.scene = { fog: { color: new THREE.Color(), density: 0.008 } };
        graphics.skyUniforms.uHorizon = { value: new THREE.Color() };
        graphics.skyUniforms.uTime = { value: 0 };
        graphics.setAtmosphere(null, { ring: 1 });
        graphics.writeSky(graphics.resolveSky('golden', 'fog', timeConfigs.golden));
        expect(graphics.fogShare).toBe(1);
        graphics.time = 0;
        graphics.lastColorScan = Infinity;
        const frame = () => graphics.update(0.016);
        frame();
        expect(graphics.skyUniforms.uFogBlend.value).toBe(0.55 + 0.45 * 1);
        expect(graphics.skyUniforms.uMountains.value).toBe(0);
        graphics.fogShare = 0.5;
        frame();
        expect(graphics.skyUniforms.uMountains.value).toBeCloseTo(0.5 * graphics.skyBase.mountains, 12);
        graphics.fogShare = 0;
        graphics.skyUniforms.uFogBlend.value = -1;
        frame();
        expect(graphics.skyUniforms.uFogBlend.value).toBe(-1);
    });
});

describe('Game atmosphere', () => {
    const NAMES = ['setTimeOfDay', 'resolveTime', 'blendTime', 'writeTime', 'snapAtmosphere', 'applyAtmosphere', 'writeAtmosphere',
        'blendRoadSurface', 'roadPosition', 'applySectionLook', 'applyShadowBox', 'updateCullDistance'];

    const rig = (track, weatherTypes = track.weatherTypes()) => {
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xb8d4e8);
        scene.fog = new THREE.FogExp2(0xc8dae8, 0.0018);
        const graphicsScene = Object.create(Graphics.prototype);
        const colour = () => ({ value: new THREE.Color() });
        const number = () => ({ value: 0 });
        const graphics = Object.assign(graphicsScene, {
            atmosphereSupported: true, atmosphere: null, ringStrength: 1, timeKey: 'golden', weatherType: 'clear', timeConfig: null,
            skyCache: new Map(), skyBase: { fogBlend: 0, mountains: 1 },
            fogShare: 0, frames: 0, stats: { envBakes: 0, lastBakeFrame: 0 }, skyBlend: 0, bakedBlend: 0, environmentDirty: false,
            sunDirection: new THREE.Vector3(),
            skyUniforms: {
                uZenith: colour(), uMid: colour(), uGlowColor: colour(), uCloudLit: colour(), uCloudShadow: colour(), uMountain: colour(),
                uSunColor: colour(), uSunDir: { value: new THREE.Vector3() }, uCoverage: number(), uStars: number(), uMoon: number(),
                uSunIntensity: number(), uGlow: number(), uFogBlend: number(), uMountains: number()
            }
        });
        const environment = Object.assign(Object.create(Environment.prototype), {
            scene: new THREE.Scene(),
            roadMaterial: new THREE.MeshStandardMaterial({ color: 0xffffff }),
            roadPath: []
        });
        environment.route = new game.LegRoute(environment);
        environment.roadMaterial.map = {};
        const weatherSystem = new WeatherSystem(scene, { position: new THREE.Vector3() });
        weatherSystem.prepare(weatherTypes);
        const self = {
            scene, graphics, environment, weatherSystem, timeConfigs,
            renderer: { toneMappingExposure: 1 },
            ambientLight: new THREE.AmbientLight(),
            hemisphereLight: new THREE.HemisphereLight(),
            directionalLight: new THREE.DirectionalLight(),
            distantLight: new THREE.DirectionalLight(),
            fillLight: new THREE.DirectionalLight(),
            rimLight: new THREE.DirectionalLight(),
            headlight: { visible: false, intensity: 0 },
            headlightBeam: { visible: false, material: { uniforms: { uStrength: { value: 0 } } } },
            vehicle: { routeS: 0 },
            atmosphereTrack: track,
            atmosphereHold: false
        };
        Object.assign(self, gameMethods(NAMES, self, { THREE, AtmosphereTrack }));
        return self;
    };

    const timeValues = game => ({
        background: game.scene.background.getHex(),
        fog: game.scene.fog.color.getHex(),
        ambient: game.ambientLight.intensity,
        hemisphere: game.hemisphereLight.intensity,
        sun: game.directionalLight.intensity,
        base: game.baseSunIntensity,
        exposure: game.renderer.toneMappingExposure
    });

    test('resolveTime in clear air is the plain light of the time of day; cloud hides the sun', () => {
        const self = rig(twoParts());
        const night = timeConfigs.night;
        const clear = self.resolveTime('night', 'clear');
        expect(clear.sunIntensity).toBe(night.sunIntensity);
        expect(clear.distantIntensity).toBe(night.sunIntensity * 0.25);
        expect(clear.hemisphereIntensity).toBe(night.hemisphereIntensity);
        const rain = self.resolveTime('twilight', 'rain');
        expect(rain.sunIntensity).toBe(timeConfigs.twilight.sunIntensity * 0.25);
        expect(rain.hemisphereIntensity).toBe(timeConfigs.twilight.hemisphereIntensity * 1.35);
        const fog = self.resolveTime('golden', 'fog');
        expect(fog.sunIntensity).toBe(timeConfigs.golden.sunIntensity * 0.6);
        expect(fog.hemisphereIntensity).toBe(timeConfigs.golden.hemisphereIntensity * 1.15);
        expect(self.resolveTime('night', 'clear')).toBe(clear);
    });

    test('a snap on a one-part leg writes the leg start values of light, sky, fog and road', () => {
        const stormIndex = 5;
        const leg = legs(game)[stormIndex];
        const { env } = buildEnvironment(game, stormIndex);
        const track = AtmosphereTrack.forLeg(leg, Terrain.legConfig(stormIndex), env);
        const self = rig(track);
        self.scene.fog.density = Terrain.legConfig(stormIndex).look.fogDensity;
        self.weatherSystem = new WeatherSystem(self.scene, { position: new THREE.Vector3() });
        self.weatherSystem.prepare(track.weatherTypes());
        self.snapAtmosphere(track, leg.startSegment, { environment: self.environment, weatherSystem: self.weatherSystem });
        const twilight = timeConfigs.twilight;
        expect(self.directionalLight.intensity / twilight.sunIntensity).toBe(0.25);
        expect(self.hemisphereLight.intensity / twilight.hemisphereIntensity).toBe(1.35);
        expect(self.graphics.weatherType).toBe('rain');
        expect(self.graphics.timeKey).toBe('twilight');
        expect(self.environment.roadMaterial.roughness).toBe(0.85 * (1 - 0.9) + 0.2 * 0.9);
        expect(self.environment.roadMaterial.color.getHex()).toBe(0xc8ccd2);
        expect(self.scene.fog.density).toBe(0.0015 * 0.9);
        expect(self.scene.fog.color.getHex()).toBe(0x707880);
        expect(self.graphics.atmosphere.baseY).toBe(track.parts[0].look.baseY);
        expect(self.graphics.environmentDirty).toBe(true);
        expect(self.weatherSystem.mix.rain).toBe(1);
    });

    test('a snap with no weather system writes no fog density and no particles', () => {
        const leg = legs(game)[5];
        const { env } = buildEnvironment(game, 5);
        const track = AtmosphereTrack.forLeg(leg, Terrain.legConfig(5), env);
        const self = rig(track);
        self.scene.fog.density = 0.123;
        self.snapAtmosphere(track, leg.startSegment, { environment: self.environment, weatherSystem: null });
        expect(self.scene.fog.density).toBe(0.123);
        expect(self.weatherSystem.mix.rain).toBe(0);
        expect(self.weatherSystem.systems.rain.points.visible).toBe(false);
        // The tint of the ground and the surface of the road are still the leg's
        expect(self.environment.roadMaterial.color.getHex()).toBe(0xc8ccd2);
        self.snapAtmosphere(AtmosphereTrack.oneLook({ ring: 1 }), 0, {});
        expect(self.graphics.atmosphere).toBeNull();
        expect(self.graphics.ringStrength).toBe(1);
        expect(self.graphics.timeKey).toBe('golden');
        expect(self.graphics.weatherType).toBe('clear');
    });

    test('setTimeOfDay changes the light only, holds, and the next snap clears the hold', () => {
        const track = twoParts();
        const self = rig(track);
        self.snapAtmosphere(track, 10, { environment: self.environment, weatherSystem: self.weatherSystem });
        const fogBefore = self.scene.fog.density;
        const roadBefore = self.environment.roadMaterial.roughness;
        const atmosphereBefore = self.graphics.atmosphere;
        self.setTimeOfDay('night');
        expect(self.atmosphereHold).toBe(true);
        expect(self.directionalLight.intensity).toBe(timeConfigs.night.sunIntensity);
        expect(self.hemisphereLight.intensity).toBe(timeConfigs.night.hemisphereIntensity);
        expect(self.scene.fog.density).toBe(fogBefore);
        expect(self.environment.roadMaterial.roughness).toBe(roadBefore);
        expect(self.graphics.atmosphere).toBe(atmosphereBefore);
        self.snapAtmosphere(track, 10, {});
        expect(self.atmosphereHold).toBe(false);
        expect(self.directionalLight.intensity).toBe(timeConfigs.dawn.sunIntensity);
        jest.spyOn(console, 'error').mockImplementation(() => {});
        self.setTimeOfDay('no-such-time');
        expect(console.error).toHaveBeenCalled();
        console.error.mockRestore();
    });

    test('inside a blend zone the light blends with the road, and a time override is not blended away', () => {
        const track = twoParts();
        const self = rig(track);
        self.snapAtmosphere(track, 10, { environment: self.environment, weatherSystem: self.weatherSystem });
        const start = timeValues(self);
        self.vehicle.routeS = 2000;
        self.applyAtmosphere();
        const middle = timeValues(self);
        expect(middle.background).not.toBe(start.background);
        expect(middle.hemisphere).not.toBe(start.hemisphere);
        expect(self.weatherSystem.mix.rain).toBeCloseTo(0.5, 9);
        expect(self.environment.roadMaterial.roughness).toBeLessThan(0.85);
        expect(self.environment.roadMaterial.roughness).toBeGreaterThan(0.85 * (1 - 0.9) + 0.2 * 0.9);

        // An override stands against 60 frames inside the zone
        self.setTimeOfDay('golden');
        const held = timeValues(self);
        for (let frame = 0; frame < 60; frame++) {
            self.vehicle.routeS = (97 + frame * 0.1) * 20;
            self.applyAtmosphere();
        }
        expect(timeValues(self)).toEqual(held);
        // A snap in the zone ends the hold and blends again
        self.snapAtmosphere(track, 100, {});
        self.vehicle.routeS = 2040;
        self.applyAtmosphere();
        expect(timeValues(self)).not.toEqual(held);
    });

    test('after the zone the part writes its own values once, and a settled part writes only the ring', () => {
        const track = twoParts();
        const self = rig(track);
        self.snapAtmosphere(track, 10, { environment: self.environment, weatherSystem: self.weatherSystem });
        self.vehicle.routeS = 2000;
        self.applyAtmosphere();
        self.vehicle.routeS = 2400;
        self.graphics.environmentDirty = false;
        self.applyAtmosphere();
        expect(self.graphics.environmentDirty).toBe(true);
        expect(self.scene.background.equals(new THREE.Color(timeConfigs.night.skyColor))).toBe(true);
        expect(self.weatherSystem.mix.rain).toBe(1);
        expect(self.environment.roadMaterial.color.getHex()).toBe(0xc8ccd2);

        const writes = jest.spyOn(self.graphics, 'writeSky');
        self.graphics.environmentDirty = false;
        self.vehicle.routeS = 2600;
        self.applyAtmosphere();
        self.vehicle.routeS = 2800;
        self.applyAtmosphere();
        expect(writes).not.toHaveBeenCalled();
        expect(self.graphics.environmentDirty).toBe(false);
    });

    test('the blend follows the bike between segments, not in steps of one segment', () => {
        const path = Array.from({ length: 200 }, (_, i) => ({ x: i * 20, z: 0, y: 0 }));
        const track = twoParts();
        const self = rig(track);
        self.environment.roadPath = path;
        self.vehicle.position = { x: 0, z: 0 };
        self.snapAtmosphere(track, 10, { environment: self.environment, weatherSystem: self.weatherSystem });
        const mix = [];
        for (const x of [97.2 * 20, 97.6 * 20, 98.1 * 20]) {
            self.vehicle.position = { x, z: 0 };
            self.vehicle.routeS = (Math.round(x / 20)) * 20;
            self.applyAtmosphere();
            mix.push(self.weatherSystem.mix.rain);
        }
        expect(mix[0]).toBeLessThan(mix[1]);
        expect(mix[1]).toBeLessThan(mix[2]);
        expect(self.roadPosition()).toBeCloseTo(98.1, 9);
        // With no road to project on it falls back to the segment
        self.environment.roadPath = [];
        expect(self.roadPosition()).toBe(98);
    });

    test('blend writes bake no more often than every 30 frames', () => {
        const track = twoParts();
        const self = rig(track);
        self.snapAtmosphere(track, 93, { environment: self.environment, weatherSystem: self.weatherSystem });
        self.graphics.environmentDirty = false;
        let requests = 0;
        for (let frame = 0; frame < 300; frame++) {
            self.graphics.frames++;
            self.vehicle.routeS = (93 + frame * (14 / 300)) * 20;
            self.graphics.environmentDirty = false;
            self.applyAtmosphere();
            if (self.graphics.environmentDirty) {
                requests++;
                self.graphics.stats.lastBakeFrame = self.graphics.frames;
                self.graphics.bakedBlend = self.graphics.skyBlend;
            }
        }
        expect(requests).toBeGreaterThan(2);
        expect(requests).toBeLessThanOrEqual(8);
    });

    test('the cull distance follows the fog across a zone and the shadow box follows the part', () => {
        const track = AtmosphereTrack.build([
            { startSegment: 0, endSegment: 99, look: oneLook({ fogDensity: 0.0008, shadowSpan: 120 }) },
            { startSegment: 100, endSegment: 199, look: oneLook({ fogDensity: 0.012, shadowSpan: 200 }) }
        ]);
        const self = rig(track);
        self.environment.config = { render: { cullMax: 800 } };
        self.snapAtmosphere(track, 10, { environment: self.environment, weatherSystem: self.weatherSystem });
        self.directionalLight.shadow.camera.far = 0;
        self.applyShadowBox({ shadowSpan: 120 });
        self.vehicle.routeS = 1900;
        self.applyAtmosphere();
        const early = self.cullDistance;
        self.vehicle.routeS = 2120;
        self.applyAtmosphere();
        expect(self.cullDistance).toBeLessThan(early);
        self.vehicle.routeS = 3000;
        self.applyAtmosphere();
        expect(self.cullDistance).toBe(250);
        expect(self.appliedShadowSpan).toBe(200);
        expect(self.directionalLight.shadow.camera.right).toBe(100);
    });
});
