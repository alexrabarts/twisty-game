// The look of each stage along its road (R5): what AtmosphereTrack.forWorld reads. A part spans `from` to `to`,
// shares of the stage's length, with the look the sky, light, fog and weather take there.
//
// Stage ids are the importer's. A stage with no entry takes `default`. Looks keep to what the hairpins
// need: no rain or snow on a part with a hairpin, because the lowside rule (WorldPhysics lowsideMargin)
// puts a rider who holds full lock on wet cobbles on the road at grip 0.75, so every hairpin part keeps
// weather x surface grip at 0.80 or more. Fog leaves the grip alone.
//
// Clear alpine air: the photo match (round 1) found the land 3 km away had lost almost all its colour under the old
// fog of 0.0008, where the real air is clear to 40 km and more. The clear fog is a twentieth of that, and the
// distance tint is the aerial perspective of LandShade. `ring: 0`: the far land is real terrain (FarLand), so the
// sky's painted ridge is off. Weather fog stays a look a stage can choose (`variants`, `?worldLook=<name>`).
const WORLD_CLEAR_FOG = 0.00004;

const WorldLooks = {
    default: [
        { from: 0, to: 1, look: { timeOfDay: 'day', weather: 'clear', fogDensity: WORLD_CLEAR_FOG, ring: 0, shadowSpan: 120 } }
    ],
    // Airolo up the Tremola to the Gotthard summit, in clear air
    tremola: [
        { from: 0, to: 1, look: { timeOfDay: 'day', weather: 'clear', fogDensity: WORLD_CLEAR_FOG, ring: 0, shadowSpan: 120 } }
    ]
};

// Not stage tables, so not enumerable: Object.values(WorldLooks) lists the stages' parts only
Object.defineProperties(WorldLooks, {
    clearFog: { value: WORLD_CLEAR_FOG },
    // Looks a page may ask for by name instead of a stage's own: `?worldLook=cloud` rides the Tremola into the
    // cloud that often sits on the pass
    variants: {
        value: {
            cloud: {
                tremola: [
                    { from: 0, to: 0.7, look: { timeOfDay: 'day', weather: 'clear', fogDensity: WORLD_CLEAR_FOG, ring: 0, shadowSpan: 120 } },
                    { from: 0.7, to: 1, look: { timeOfDay: 'day', weather: 'fog', weatherIntensity: 0.5, fogDensity: WORLD_CLEAR_FOG, ring: 0, shadowSpan: 120 } }
                ]
            }
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
