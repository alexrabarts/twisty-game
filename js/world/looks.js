// The look of each stage along its road (R5): what AtmosphereTrack.forWorld reads. A part spans `from` to `to`,
// shares of the stage's length, with the look the sky, light, fog and weather take there.
//
// Stage ids are the importer's. A stage with no entry takes `default`. Every stage of the manifest has at least one
// change of weather or of time of day along it (tests/unit/world-looks.test.js reads the manifest, so a stage added
// there with no entry here fails until it is given one).
//
// Grip in the weather: the lowside rule (WorldPhysics lowsideMargin) puts a rider who holds full lock in a hairpin
// on the road below a grip of 0.80, so on every part with a hairpin the weather lateral grip x the surface grip
// (cobbles 0.85) stays at `hairpinGrip` or more. A world's rain takes the grip of `grip.rain`: its lateral grip is
// held at that bound on wet cobbles, and its braking and acceleration are the legs' (braking 0.8: longer stops).
// Fog leaves the grip alone.
//
// Clear alpine air: the photo match (round 1) found the land 3 km away had lost almost all its colour under the old
// fog of 0.0008, where the real air is clear to 40 km and more. The clear fog is a twentieth of that, and the
// distance tint is the aerial perspective of LandShade. `ring: 0`: the far land is real terrain (FarLand), so the
// sky's painted ridge is off. Other looks a page may ask for by name are `variants` (`?worldLook=<name>`).
const WORLD_CLEAR_FOG = 0.00004;

// The parts of a look every world part shares
const WORLD_LOOK_BASE = { timeOfDay: 'day', fogDensity: WORLD_CLEAR_FOG, ring: 0, shadowSpan: 120 };

const WorldLooks = {
    default: [
        { from: 0, to: 1, look: { ...WORLD_LOOK_BASE, weather: 'clear' } }
    ],
    // Andermatt (1,437 m) up the north side to the Gotthard summit (2,093 m): the first leg, clear and bright (the
    // owner's word), in the owner's photos of the stops on it a clear afternoon. A thin cloud lies on the summit
    // plateau from 0.85 (s 9,840 m), as the clouds over the pass in the lookout photos: the leg's one change
    'gotthard-north': [
        { from: 0, to: 0.85, look: { ...WORLD_LOOK_BASE, weather: 'clear' } },
        { from: 0.85, to: 1, look: { ...WORLD_LOOK_BASE, weather: 'fog', weatherIntensity: 0.1 } }
    ],
    // The summit down the modern road to the lookout over Airolo (1,931 m): the thin cloud of the summit through the
    // galleries, then the clear morning of the lookout photos (clear sky with fair-weather cumulus, haze in the valley).
    // A part is at least 1.5 km (AtmosphereTrack): the leg is 2.9 km, so the cloud clears at 0.55 (s 1,610 m of it),
    // the last 1.3 km clear
    'gotthard-lookout': [
        { from: 0, to: 0.55, look: { ...WORLD_LOOK_BASE, weather: 'fog', weatherIntensity: 0.1 } },
        { from: 0.55, to: 1, look: { ...WORLD_LOOK_BASE, weather: 'clear' } }
    ],
    // Airolo (1,184 m) up the Tremola to the Gotthard summit (2,104 m). Clear in the Leventina valley, cloud
    // building over the first ramps (a thin mist, the sky closing over), and rain from the middle of the climb: the
    // boundary at 0.53 (s 6,989 m, road 1,677 m) blends over 1.5 km, so the first drops fall at s 6,240 m
    // (about 1,630 m) and the rain is full from s 7,740 m (about 1,740 m), before the cobbled hairpins stack
    // (the first at s 7,808 m). The rain ends before the top: the boundary at 0.8 (s 10,550 m) thins it from
    // s 9,800 m, and the air is clear and the road dry from s 11,300 m, so the last 1.9 km to the summit are dry
    tremola: [
        { from: 0, to: 0.25, look: { ...WORLD_LOOK_BASE, weather: 'clear' } },
        { from: 0.25, to: 0.53, look: { ...WORLD_LOOK_BASE, weather: 'fog', weatherIntensity: 0.15 } },
        { from: 0.53, to: 0.8, look: { ...WORLD_LOOK_BASE, weather: 'rain', weatherIntensity: 1 } },
        { from: 0.8, to: 1, look: { ...WORLD_LOOK_BASE, weather: 'clear' } }
    ]
};

// Not stage tables, so not enumerable: Object.values(WorldLooks) lists the stages' parts only
Object.defineProperties(WorldLooks, {
    clearFog: { value: WORLD_CLEAR_FOG },
    // How high the horizon's pale colour reaches up a world's sky (Graphics.setHorizonSpan). In the photos the sky
    // just over the ridges, 5 to 15 degrees up, is still the pale blue of the horizon (saturation 0.16); with a
    // leg's span it was already the mid sky's (0.26 to 0.40), bluer than the distant land in front of it
    horizonSpan: { value: 0.5 },
    // The least weather lateral grip x surface grip on a part with a hairpin: the lowside boundary at full lock
    hairpinGrip: { value: 0.8 },
    // The weather's grip in a world (WeatherSystem.GRIP): rain's lateral grip is the hairpin bound over the cobbles
    // (0.80 / 0.85 = 0.9412, rounded up), so wet cobbles in a hairpin give 0.8007
    grip: {
        value: Object.freeze({
            rain: Object.freeze({ lateral: 0.942, brake: 0.8, acceleration: 0.9 }),
            snow: Object.freeze({ lateral: 0.4, brake: 0.6, acceleration: 0.7 })
        })
    },
    // How a world draws its rain (WeatherSystem.RAIN): the legs' 3000 drops in a box 90 m across, not 200 m, so
    // about five times as many fall near the rider, as brighter, wider streaks that read at riding speed. A steady
    // alpine rain, with no lightning (its flash triples the sky light)
    rain: { value: Object.freeze({ count: 3000, extent: 45, color: 0xd4dce4, size: 1.6, opacity: 0.7, streakPx: 4, capPx: 90, lightning: false }) },
    // Looks a page may ask for by name instead of a stage's own: `?worldLook=cloud` rides the Tremola into the
    // cloud that often sits on the pass; `?worldLook=dry` rides it in clear air all the way (the frame-time probe's
    // control)
    variants: {
        value: {
            cloud: {
                tremola: [
                    { from: 0, to: 0.7, look: { ...WORLD_LOOK_BASE, weather: 'clear' } },
                    { from: 0.7, to: 1, look: { ...WORLD_LOOK_BASE, weather: 'fog', weatherIntensity: 0.5 } }
                ]
            },
            dry: {
                tremola: [
                    { from: 0, to: 1, look: { ...WORLD_LOOK_BASE, weather: 'clear' } }
                ]
            }
        }
    },
    // The air of each stage: the saturation and value of distant land's haze (LandShade.HAZE.air), measured on that
    // stage's own photos with `node tools/world/photomatch.mjs haze --data <folder> --stage <id>` (the photos with a
    // camera that can be trusted, distant land by its real distance). A stage with no photo of distant land takes the
    // air of the stage it names in `from`, and says so. The Tremola's is LandShade.HAZE.air itself (19 photos: land
    // 8 km on at saturation 0.46, value 0.67; 3 to 8 km 0.37, 0.47).
    //   gotthard-lookout  13 photos at the lookout: 8 km on 96, 126, 161 (hue 212, saturation 0.41, value 0.63), 3 to
    //                     8 km 84, 101, 117 (hue 209, 0.28, 0.46), sky over the skyline 191, 205, 221. Greyer air than
    //                     the Tremola's: its air's saturation and value scaled by the far band's (0.41 / 0.46, 0.63 /
    //                     0.67)
    //   gotthard-north    4 photos, all of the village at the start in the evening, its land reddened by the low sun and
    //                     one photo of land 8 km off: no measure of the ramp's air, so the Tremola's
    stageAir: {
        value: Object.freeze({
            'gotthard-lookout': Object.freeze({ s: 0.45, v: 0.55, photos: 13 }),
            'gotthard-north': Object.freeze({ from: 'tremola', photos: 0 })
        })
    },
    // The air of a stage: its own, its `from` stage's, or null (LandShade.HAZE.air)
    airOf: {
        value(id) {
            const row = WorldLooks.stageAir[id];
            if (!row) return null;
            return row.from ? WorldLooks.airOf(row.from) : { s: row.s, v: row.v };
        }
    },
    // Free roam's pickers (GameModes.TIMES, GameModes.WEATHERS): every part of every stage of `looks` at one time of day
    // and one weather; 'stage' keeps a stage's own. The weather's strength is `strength` (rain at full, fog as the
    // cloud variant's). No snow: its grip (grip.snow, lateral 0.4) puts a rider at full lock in a hairpin on the
    // road, under hairpinGrip
    strength: { value: Object.freeze({ clear: 0, fog: 0.5, rain: 1 }) },
    fixed: {
        value(looks, time = 'stage', weather = 'stage') {
            if (time === 'stage' && weather === 'stage') return looks;
            const out = { ...looks };
            for (const [id, parts] of Object.entries(looks)) {
                out[id] = parts.map(part => {
                    const look = { ...part.look };
                    if (time !== 'stage') look.timeOfDay = time;
                    if (weather !== 'stage') {
                        look.weather = weather;
                        look.weatherIntensity = WorldLooks.strength[weather];
                    }
                    return { ...part, look };
                });
            }
            return out;
        }
    },
    // The looks table for a page: a named variant over the stage defaults, or the defaults
    pick: {
        value(search) {
            const name = new URLSearchParams(search || '').get('worldLook');
            const variant = name && Object.prototype.hasOwnProperty.call(WorldLooks.variants, name) ? WorldLooks.variants[name] : null;
            return variant ? { ...WorldLooks, ...variant } : WorldLooks;
        }
    }
});
