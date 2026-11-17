// The look of each stage along its road (R5): what AtmosphereTrack.forWorld reads. A part spans `from` to `to`,
// shares of the stage's length, with the look the sky, light, fog and weather take there.
//
// Stage ids are the importer's. A stage with no entry takes `default`. Looks keep to what the hairpins
// need: no rain or snow on a part with a hairpin, because the lowside rule (WorldPhysics lowsideMargin)
// puts a rider who holds full lock on wet cobbles on the road at grip 0.75, so every hairpin part keeps
// weather x surface grip at 0.80 or more. Fog leaves the grip alone.
const WorldLooks = {
    default: [
        { from: 0, to: 1, look: { timeOfDay: 'day', weather: 'clear', fogDensity: 0.0008, ring: 1, shadowSpan: 120 } }
    ],
    // Airolo up the Tremola to the Gotthard summit: clear, then the pass in cloud
    tremola: [
        { from: 0, to: 0.7, look: { timeOfDay: 'day', weather: 'clear', fogDensity: 0.0008, ring: 1, shadowSpan: 120 } },
        { from: 0.7, to: 1, look: { timeOfDay: 'day', weather: 'fog', weatherIntensity: 0.5, fogDensity: 0.0008, ring: 1, shadowSpan: 120 } }
    ]
};
