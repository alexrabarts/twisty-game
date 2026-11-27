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
    // Andermatt (1,437 m) up the north side to the Gotthard summit (2,093 m), past the hospice square and down the
    // modern road to the lookout over Airolo (1,931 m), 14.5 km. Clear and bright up the north side (the owner's word),
    // as the owner's photos of the stops at Andermatt, a clear afternoon. A thin cloud lies on the summit plateau from
    // 0.678 (s 9,840 m), as the clouds over the pass in the lookout photos, and stays through the galleries; it clears
    // at 0.909 (s 13,188 m) for the clear morning of the lookout photos (clear sky with fair-weather cumulus, haze in
    // the valley), the last 1.3 km clear. (The places of the two changes are the two old legs' own.)
    'gotthard-north': [
        { from: 0, to: 0.678, look: { ...WORLD_LOOK_BASE, weather: 'clear' } },
        { from: 0.678, to: 0.909, look: { ...WORLD_LOOK_BASE, weather: 'fog', weatherIntensity: 0.1 } },
        { from: 0.909, to: 1, look: { ...WORLD_LOOK_BASE, weather: 'clear' } }
    ],
    // The tour (js/world/tour.js). Leg 1, Airolo (1,184 m) up the modern pass road to the lookout (1,931 m), 10.7 km:
    // clear all the way, as every photo within 1 km of it (three trips, September and July mornings and one late
    // afternoon: blue sky with fair-weather cumulus, no cloud on the road). It starts in the low light of the morning
    // in the valley and is full day from 0.16 (s 1,710 m, the first ramps). (The lookout's own light was tried as the
    // golden hour from 0.8: the mid slopes went 20 points yellower than the photos)
    'airolo-lookout': [
        { from: 0, to: 0.16, look: { ...WORLD_LOOK_BASE, timeOfDay: 'dawn', weather: 'clear' } },
        { from: 0.16, to: 1, look: { ...WORLD_LOOK_BASE, weather: 'clear' } }
    ],
    // Leg 2, the lookout over the summit to Andermatt: gotthard-north the other way, its two changes at the same places
    // (the cloud on the summit plateau and through the galleries, clear down the north side)
    'lookout-andermatt': [
        { from: 0, to: 0.11, look: { ...WORLD_LOOK_BASE, weather: 'clear' } },
        { from: 0.11, to: 0.32, look: { ...WORLD_LOOK_BASE, weather: 'fog', weatherIntensity: 0.1 } },
        { from: 0.32, to: 1, look: { ...WORLD_LOOK_BASE, weather: 'clear' } }
    ],
    // Legs 3 to 5 (worlds/susten): clear all the way, as every photo within 1 km of them (two trips, early September,
    // mornings and late afternoons), in the morning's low light for their first part. Leg 3 down the Schöllenen to
    // Göschenen, 6.4 km; leg 4 down to Wassen and up the Meiental to the Susten pass, 21.9 km (a cloud first set over the
    // pass put its skyline 3.3 degrees from the photos'); leg 5 down to Gadmen, 15.8 km (likewise its first 3 km)
    'andermatt-goeschenen': [
        { from: 0, to: 0.3, look: { ...WORLD_LOOK_BASE, timeOfDay: 'dawn', weather: 'clear' } },
        { from: 0.3, to: 1, look: { ...WORLD_LOOK_BASE, weather: 'clear' } }
    ],
    'goeschenen-susten': [
        { from: 0, to: 0.1, look: { ...WORLD_LOOK_BASE, timeOfDay: 'dawn', weather: 'clear' } },
        { from: 0.1, to: 1, look: { ...WORLD_LOOK_BASE, weather: 'clear' } }
    ],
    'susten-gadmen': [
        { from: 0, to: 0.1, look: { ...WORLD_LOOK_BASE, timeOfDay: 'dawn', weather: 'clear' } },
        { from: 0.1, to: 1, look: { ...WORLD_LOOK_BASE, weather: 'clear' } }
    ],
    // Legs 6 to 8 (worlds/haslital): clear all the way, as every photo within 1 km of them (two trips, September, late
    // morning to mid afternoon: blue sky with fair-weather cumulus). Leg 6 down to Innertkirchen, 12.4 km, in the
    // morning's low light for its first part, as legs 3 to 5; leg 7 up the Haslital to Guttannen, 8.1 km, in a warmer
    // light over its last 1.6 km into the village (its photos stand at its start); leg 8 up to the Grimsel pass,
    // 17.5 km, out of that light in its first 1.7 km (its photos stand near the pass)
    'gadmen-innertkirchen': [
        { from: 0, to: 0.15, look: { ...WORLD_LOOK_BASE, timeOfDay: 'dawn', weather: 'clear' } },
        { from: 0.15, to: 1, look: { ...WORLD_LOOK_BASE, weather: 'clear' } }
    ],
    'innertkirchen-guttannen': [
        { from: 0, to: 0.8, look: { ...WORLD_LOOK_BASE, weather: 'clear' } },
        { from: 0.8, to: 1, look: { ...WORLD_LOOK_BASE, timeOfDay: 'golden', weather: 'clear' } }
    ],
    'guttannen-grimsel': [
        { from: 0, to: 0.1, look: { ...WORLD_LOOK_BASE, timeOfDay: 'golden', weather: 'clear' } },
        { from: 0.1, to: 1, look: { ...WORLD_LOOK_BASE, weather: 'clear' } }
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
    //   gotthard-north    13 photos at the lookout at its end: 8 km on 96, 126, 161 (hue 212, saturation 0.41, value
    //                     0.63), 3 to 8 km 84, 101, 117 (hue 209, 0.28, 0.46), sky over the skyline 191, 205, 221.
    //                     Greyer air than the Tremola's: its air's saturation and value scaled by the far band's (0.41 /
    //                     0.46, 0.63 / 0.67). The north ramp has no photo of distant land of its own (its 4 photos are
    //                     of the village at the start in the evening), so the leg's one measure is the lookout's
    stageAir: {
        value: Object.freeze({
            'gotthard-north': Object.freeze({ s: 0.45, v: 0.55, photos: 13 }),
            // (the tour's legs over the same land: the lookout's photos are leg 1's end and leg 2's start)
            'airolo-lookout': Object.freeze({ from: 'gotthard-north', photos: 0 }),
            'lookout-andermatt': Object.freeze({ from: 'gotthard-north', photos: 0 }),
            'andermatt-goeschenen': Object.freeze({ from: 'gotthard-north', photos: 0 }),
            'goeschenen-susten': Object.freeze({ from: 'gotthard-north', photos: 0 }),
            'susten-gadmen': Object.freeze({ from: 'gotthard-north', photos: 0 }),
            'gadmen-innertkirchen': Object.freeze({ from: 'gotthard-north', photos: 0 }),
            'innertkirchen-guttannen': Object.freeze({ from: 'gotthard-north', photos: 0 }),
            'guttannen-grimsel': Object.freeze({ from: 'gotthard-north', photos: 0 })
        })
    },
    // The look of each stage's land, haze and sky, measured on the photos within 1 km of it (tools/world/photomatch.mjs
    // --stage <id> --margin 1000, the side-by-side rounds of .agent/sop/photo-match.md, "Each leg of the tour"):
    //   horizonSpan  how high the horizon's pale colour reaches up the sky (Graphics.setHorizonSpan; else horizonSpan)
    //   hazePerM     the haze's depth (LandShade.HAZE.perM; else HAZE's)
    //   palette      the land's colours (sRGB, over LandShade.PALETTE's)
    //   sceneryScale the share of Scenery.TRIANGLE_CAP its scenery may take (else 1). No leg needs less now:
    //                Game.budgetWindow fits the houses and trees to the window's budget by rule (world-window at 1 on
    //                legs 1 and 3: at most 435 889 and 435 772 triangles)
    // `from` takes another stage's row (a leg with no photos of its own); `photos` the count measured on. A stage with
    // no row has the shared values.
    stageView: {
        value: Object.freeze({
            // Leg 1: 10 photos with a high confidence, all but two at the lookout at its end (three trips: July and
            // September; mornings and one late afternoon). Four rounds; from the first to the last, the mean sRGB
            // distance of photo and game: sky 62.8 to 42.4 (a bluer sky: the horizon's pale colour a third as high),
            // land from 3 km 62.1 to 33.0 (thinner haze: the far slopes were 26 points too pale), the near ground 41.4
            // to 37.6 (drier grass: its green share 0.58 to 0.30, the photos' 0.29), the whole picture 28.9 to 19.9.
            // The land 0.6 to 3 km stayed at 23 to 25 (the photos' forest there is darker and bluer). The skyline is the
            // height data's: 0.47 degrees from the photos' (the photos' own fit to the data 0.43)
            'airolo-lookout': Object.freeze({ horizonSpan: 0.15, hazePerM: 1 / 6000, palette: Object.freeze({ grass: [0.33, 0.31, 0.2], dry: [0.44, 0.39, 0.26] }), photos: 10 }),
            // Leg 2: most of its photos are the same view as leg 1's (the lookout, where both pass): leg 1's land, haze
            // and sky, at the shared scenery's full share. 19 photos, the lookout and the hotel at Andermatt: whole
            // picture 37.3 to 34.7, sky 66.8 to 58.4, land from 3 km 53.2 to 48.5, near 42.3 to 41.6, land 0.6 to 3 km
            // 44.8 to 48.5. A haze of its own (1 / 7 000 m) and greener grass were tried in a third round: each moved
            // it by under 3 points, the land 0.6 to 3 km the wrong way
            'lookout-andermatt': Object.freeze({ from: 'airolo-lookout', sceneryScale: 1, photos: 19 }),
            // Legs 3 to 5 (worlds/susten), on the photos within 1 km of each (two trips, early September, mornings and
            // late afternoons). Leg 3, 15 photos, nearly all over the Schöllenen at km 2.5: five rounds; leg 1's values
            // and the gorge's granite darker (rock, scree) took the whole picture from 68.5 to 57.9, the sky 73.1 to
            // 67.2, land from 3 km 60.7 to 55.5 and the near ground 80.1 to 68.0; the land 0.6 to 3 km went 53.1 to 72.5
            // (the photos' slopes there are grey rock in shade, the game's golden grass), and a sky with its pale band a
            // half as high again (0.08) and a deeper haze moved nothing by more than 3 points. Leg 4, 17 photos, all at
            // km 26 under the pass (one 3 km on): whole 42.7 to 39.4, sky 80.0 to 46.6, 0.6 to 3 km 54.2 to 46.0, near
            // 39.5 to 38.9. Its skyline is 3.3 degrees from the photos' where the game draws a retaining wall at the
            // photos' place on the grass slope, which hides the view. Leg 5, 22 photos: whole 41.8 to 36.4, sky 60.1
            // to 54.5, from 3 km 75.6 to 55.4, 0.6 to 3 km 53.6 to 36.9, near 49.7 to 47.3; skyline 0.82 degrees
            'andermatt-goeschenen': Object.freeze({ from: 'airolo-lookout', palette: Object.freeze({ grass: [0.33, 0.31, 0.2], dry: [0.44, 0.39, 0.26], rock: [0.33, 0.33, 0.32], scree: [0.42, 0.41, 0.38] }), photos: 15 }),
            'goeschenen-susten': Object.freeze({ from: 'airolo-lookout', sceneryScale: 1, photos: 17 }),
            'susten-gadmen': Object.freeze({ from: 'airolo-lookout', sceneryScale: 1, photos: 22 }),
            'gadmen-innertkirchen': Object.freeze({ from: 'airolo-lookout', palette: Object.freeze({ grass: [0.33, 0.31, 0.2], dry: [0.44, 0.39, 0.26], rock: [0.5, 0.48, 0.44], scree: [0.56, 0.54, 0.5] }), sceneryScale: 1, photos: 12 }),
            'innertkirchen-guttannen': Object.freeze({ from: 'gadmen-innertkirchen', photos: 0 }),
            'guttannen-grimsel': Object.freeze({ from: 'airolo-lookout', hazePerM: 1 / 9000, palette: Object.freeze({ grass: [0.3, 0.31, 0.22], dry: [0.36, 0.35, 0.3], rock: [0.3, 0.3, 0.29], scree: [0.4, 0.39, 0.36], water: [0.45, 0.5, 0.45] }), sceneryScale: 1, photos: 2 })
        })
    },
    // A stage's view: its own row over its `from` stage's, or {} (the shared values)
    viewOf: {
        value(id) {
            const row = id ? WorldLooks.stageView[id] : null;
            if (!row) return {};
            const { from, photos, ...own } = row;
            return from ? { ...WorldLooks.viewOf(from), ...own } : own;
        }
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
