// RideMode: what the page rides, read from the URL here and nowhere else (tests/unit/ride-mode.test.js holds that).
// Everything that differs for a world ride after this keys off the environment (`environment.isWorld`), so a world
// chosen on the menu and a world named in the URL ride the same.
//
//   (no query)        the menu; choosing a rider starts DEFAULT_WORLD, and Classic legs opens the leg screen
//   ?world=<id|all>   that world at once, without the menu
//   ?legs             the menu as it was before the world: the rider goes on to the leg screen
//   ?<HILL_KEY>       the hill ride (js/hill/ride.js) at once, without the menu: a ride of its own, timed only on its end card (js/hill/board.js)
//   &mode=roam        a world ridden in free roam (GameModes; open in debug mode only); time trial otherwise
const RideMode = {
    // The world a rider chosen on the menu rides: the Tremola slice (world/manifest.json)
    DEFAULT_WORLD: 'tremola',

    // What the menu says when the world's data could not load and the legs took over
    FALLBACK_NOTE: 'The Andermatt road could not load here, so the classic legs are open instead.',
    // What the menu says when a world's land stopped loading during a ride (WorldStreamer.landState lost) and the legs
    // took over
    // What the menu says when the hill ride could not start
    HILL_FAIL_NOTE: 'The hill ride could not load here, so the classic legs are open instead.',
    LAND_LOST_NOTE: 'The land beside the road stopped loading, so the ride has ended and the classic legs are open instead.',

    // The address key that opens the hill ride: the only place the key is written
    HILL_KEY: 'hovis',

    // { kind: 'world' | 'legs' | 'hill', world: the stage id or 'all' (null otherwise), direct: start without the menu,
    //   mode: 'roam' when the address asks for free roam (absent otherwise; GameModes decides whether it is open) }
    resolve(search) {
        const params = new URLSearchParams(search || '');
        if (params.has(RideMode.HILL_KEY)) return { kind: 'hill', world: null, direct: true };
        const asked = params.get('world');
        // (free roam is named only when asked for: a time trial is the mode an object without it rides)
        const roam = params.get('mode') === 'roam' ? { mode: 'roam' } : {};
        if (asked) return { kind: 'world', world: asked, direct: true, ...roam };
        if (params.has('legs')) return { kind: 'legs', world: null, direct: false };
        return { kind: 'world', world: RideMode.DEFAULT_WORLD, direct: false, ...roam };
    },

    // The page that starts world `id` at once, keeping the data folder (`worldData`) this page reads from
    worldUrl(location, id, mode = 'trial') {
        const params = new URLSearchParams({ world: id });
        const old = new URLSearchParams(location.search || '');
        const data = old.get('worldData');
        if (data) params.set('worldData', data);
        // (free roam and debug mode go on to the fresh page with it)
        if (mode === 'roam') params.set('mode', 'roam');
        if (old.has('debug')) params.set('debug', '');
        return `${location.pathname}?${params.toString()}`;
    }
};
