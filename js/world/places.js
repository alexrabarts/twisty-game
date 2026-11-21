// WorldPlaces: the stopping places beside the ride (manifest.places, made by tools/world/places.mjs), where a rider
// can pull in and wait clear of the carriageway. No THREE.
//
//   map     a mapped car park or rest area along the ride. The ride's verge is `depth` metres wider on that side for
//           the place's length (tapered over `taper` at each end): the importer carved the land to it, RoadMesh draws
//           it as hard standing and WorldGround gives it the road's height. It is ground, not scenery.
//   found   a stretch where the drawn verge and the land beside it are level, where the map has no place. Nothing is
//           drawn or carved for it.
//
// In a place of either kind the strip from the carriageway's edge out to the verge and `depth` past it is the verge to
// the physics (Vehicle.worldSurface): no land drag, no speed cap and no land crash. Nothing is planted there
// (RoadClearance). Traffic, the crew's lane and the hairpin assist read the carriageway only, so none of them treats
// a place as road.
//
// A place: {id, kind, source, s, side, length, depth, taper, surface, name, slots, open}. `s` is where it starts,
// `side` is Route's (Route.LEFT +1, Route.RIGHT -1).
class WorldPlaces {
    // How far past the carriageway's edge a waiting bike stands at the least, and the room each bike takes along the road
    static get STAND_MIN_M() { return 1.2; }
    static get SLOT_M() { return 2.6; }
    // A waiting bike keeps this clear of each end of a place (after the taper)
    static get END_CLEAR_M() { return 2; }
    // A place this near a roadworks site, or a station's gate, is closed: a rider waiting there would stand in the works
    static get WORKS_CLEAR_M() { return 20; }

    // The extra verge of a place at ride distance s: its depth, tapered over `taper` at each end, 0 outside it
    // (the importer's padOf: the land is carved to this)
    static padOf(place, s) {
        const into = Math.min(s - place.s, place.s + place.length - s);
        if (into <= 0) return 0;
        return place.depth * (place.taper > 0 ? Math.min(1, into / place.taper) : 1);
    }

    constructor(list, route, { from = 0, to = Infinity } = {}) {
        this.route = route;
        this.all = (list || []).map(p => ({ ...p, slots: WorldPlaces.slotsOf(p), open: p.s >= from && p.s + p.length <= to }))
            .sort((a, b) => a.s - b.s || a.side - b.side);
        this.list = this.all.filter(p => p.open);
        this.apply();
    }

    // How many bikes wait in a place, nose to tail
    static slotsOf(place) {
        const room = place.length - 2 * (place.taper || 0) - 2 * WorldPlaces.END_CLEAR_M;
        return room < 0 ? 0 : Math.floor(room / WorldPlaces.SLOT_M) + 1;
    }

    // Writes each place's extra verge onto the route's points: padN and padP (the -lateral and +lateral side) for a
    // place that is drawn (RoadMesh, WorldGround), safeN and safeP for every place (Vehicle.worldSurface, RoadClearance)
    apply() {
        const points = this.route.points;
        for (const place of this.all) {
            const drawn = place.source === 'map';
            const key = place.side > 0 ? 'P' : 'N';
            for (let i = this.route.indexAt(Math.max(0, place.s)); i < points.length && points[i].s <= place.s + place.length; i++) {
                const p = points[i];
                const pad = WorldPlaces.padOf(place, p.s);
                if (drawn && pad > 0) {
                    p[`pad${key}`] = Math.max(p[`pad${key}`] || 0, pad);
                    p.padSurface = place.surface;
                }
                // A found place has no taper: its strip runs from its first point to its last
                const safe = drawn ? pad : p.s >= place.s ? place.depth : 0;
                if (safe > 0) p[`safe${key}`] = Math.max(p[`safe${key}`] || 0, safe);
            }
        }
    }

    // Closes the places a roadworks site or a gate stands at: `spans` are [{s0, s1}] along the ride
    close(spans) {
        const clear = WorldPlaces.WORKS_CLEAR_M;
        for (const place of this.all) {
            if (spans.some(span => place.s <= span.s1 + clear && place.s + place.length >= span.s0 - clear)) place.open = false;
        }
        this.list = this.all.filter(p => p.open);
        return this;
    }

    // The next open place that starts at or after ride distance s (on `side` when given), or null
    next(s, side = 0) {
        for (const place of this.list) if (place.s >= s && (!side || place.side === side)) return place;
        return null;
    }

    // The open place whose strip holds ride distance s on the side of `lateral`, or null
    at(s, lateral) {
        const side = lateral < 0 ? -1 : 1;
        for (const place of this.list) if (place.side === side && s >= place.s && s <= place.s + place.length) return place;
        return null;
    }

    // Where the rider in `slot` (0 the first to arrive, at the far end; the next behind it) stops in a place:
    // {x, y, z, heading, s, lateral}, clear of the carriageway, facing along the ride, on the ground as `ground` reads
    // it (the road's own height where no ground is given)
    stopAt(place, slot = 0, ground = null, out = {}) {
        const k = Math.max(0, Math.min(Math.max(0, place.slots - 1), slot));
        const s = place.s + place.length - (place.taper || 0) - WorldPlaces.END_CLEAR_M - k * WorldPlaces.SLOT_M;
        const p = this.route.sample(Math.max(place.s, s), this.scratch || (this.scratch = {}));
        const stand = Math.max(WorldPlaces.STAND_MIN_M, (WorldPlaces.verge() + place.depth) / 2);
        const lateral = place.side * (p.width / 2 + stand);
        out.s = Math.max(place.s, s);
        out.lateral = lateral;
        out.x = p.x + lateral * Math.cos(p.heading);
        out.z = p.z - lateral * Math.sin(p.heading);
        out.heading = p.heading;
        const y = ground ? ground.groundY(out.x, out.z) : p.y;
        out.y = Number.isFinite(y) ? y : p.y;
        return out;
    }

    static verge() { return typeof RoadSurface !== 'undefined' ? RoadSurface.VERGE_M : 1.1; }
}
