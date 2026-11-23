// RideMode: what the page rides, read from the URL here and nowhere else (tests/unit/ride-mode.test.js holds that).
// Everything that differs for a world ride after this keys off the environment (`environment.isWorld`), so a world
// chosen on the menu and a world named in the URL ride the same.
//
//   (no query)        the menu; choosing a rider starts DEFAULT_WORLD, and Classic legs opens the leg screen
//   ?world=<id|all>   that world at once, without the menu
//   ?legs             the menu as it was before the world: the rider goes on to the leg screen
const RideMode = {
    // The world a rider chosen on the menu rides: the Tremola slice (world/manifest.json)
    DEFAULT_WORLD: 'tremola',

    // What the menu says when the world's data could not load and the legs took over
    FALLBACK_NOTE: 'The Andermatt road could not load here, so the classic legs are open instead.',
    // What the menu says when a world's land stopped loading during a ride (WorldStreamer.landState lost) and the legs
    // took over
    LAND_LOST_NOTE: 'The land beside the road stopped loading, so the ride has ended and the classic legs are open instead.',

    // { kind: 'world' | 'legs', world: the stage id or 'all' (null for the legs), direct: start without the menu }
    resolve(search) {
        const params = new URLSearchParams(search || '');
        const asked = params.get('world');
        if (asked) return { kind: 'world', world: asked, direct: true };
        if (params.has('legs')) return { kind: 'legs', world: null, direct: false };
        return { kind: 'world', world: RideMode.DEFAULT_WORLD, direct: false };
    },

    // The page that starts world `id` at once, keeping the data folder (`worldData`) this page reads from
    worldUrl(location, id) {
        const params = new URLSearchParams({ world: id });
        const data = new URLSearchParams(location.search || '').get('worldData');
        if (data) params.set('worldData', data);
        return `${location.pathname}?${params.toString()}`;
    }
};
