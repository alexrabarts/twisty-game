// RideMode: what the page rides, read from the URL here and nowhere else (tests/unit/ride-mode.test.js holds that).
// Everything that differs for a world ride after this keys off the environment (`environment.isWorld`), so a world
// chosen on the menu and a world named in the URL ride the same.
//
//   (no query)        the menu; choosing a rider starts DEFAULT_WORLD (or, of a tour of several legs, the leg picked on the map)
//   ?world=<id|all>   that world at once, without the menu
//   ?<HILL_KEY>       the hill ride (js/hill/ride.js) at once, without the menu: a ride of its own, timed only on its end card (js/hill/board.js)
//   &mode=roam        a world ridden in free roam (GameModes; open in debug mode only); time trial otherwise
//   &start=<where>    free roam's start: place (a stopping place) or summit; the start otherwise
//   &group=alone      free roam without the group; with it (the player leading) otherwise
//   &time=<t>&weather=<w>  free roam's time of day (dawn, day, sunset, night) and weather (clear, fog, rain)
const RideMode = {
    // The world a rider chosen on the menu rides: the Tremola slice (world/manifest.json)
    DEFAULT_WORLD: 'tremola',

    // The error card of a ride that could not load (Game.showLoadError): its title, and its text when the world's data
    // could not load, when the land stopped loading during a ride (WorldStreamer.landState lost) and when the hill ride
    // could not start
    LOAD_FAIL_TITLE: 'The world could not load',
    LOAD_FAIL_NOTE: 'The Andermatt road could not load here. Check the connection, then try again.',
    LAND_LOST_NOTE: 'The land beside the road stopped loading, so the ride has ended.',
    HILL_FAIL_NOTE: 'The hill ride could not load here. Check the connection, then try again.',

    // The address key that opens the hill ride: the only place the key is written
    HILL_KEY: 'hovis',

    // { kind: 'world' | 'hill', world: the stage id or 'all' (null otherwise), direct: start without the menu,
    //   mode: 'roam' when the address asks for free roam (absent otherwise; GameModes decides whether it is open) }
    resolve(search) {
        const params = new URLSearchParams(search || '');
        if (params.has(RideMode.HILL_KEY)) return { kind: 'hill', world: null, direct: true };
        const asked = params.get('world');
        // (free roam is named only when asked for: a time trial is the mode an object without it rides)
        const roam = params.get('mode') === 'roam' ? { mode: 'roam' } : {};
        // (and where it starts: `start=place` or `start=summit`, GameModes.STARTS)
        if (roam.mode && ['place', 'summit'].includes(params.get('start'))) roam.start = params.get('start');
        // (and alone, without the group: `group=alone`)
        if (roam.mode && params.get('group') === 'alone') roam.group = 'alone';
        // (its time of day and weather: `time=dawn|day|sunset|night`, `weather=clear|fog|rain`)
        if (roam.mode && ['dawn', 'day', 'sunset', 'night'].includes(params.get('time'))) roam.time = params.get('time');
        if (roam.mode && ['clear', 'fog', 'rain'].includes(params.get('weather'))) roam.weather = params.get('weather');
        if (asked) return { kind: 'world', world: asked, direct: true, ...roam };
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
