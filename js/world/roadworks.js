// Roadworks: every checkpoint of a world ride is a Swiss roadworks site (Baustelle) on the straight after its station.
//
//   end gates     at each end, on each verge, three red and white boards side by side on one foot frame (the board of
//                 the old checkpoint markers, a fifth taller: 2.45 m, five bands, red at the foot and the top, a silver strip on each white
//                 band). The group on the closed lane's side carries the red-bordered roadworks triangle on the face
//                 toward the traffic that arrives at that end
//   single lane   one lane is closed from the station (the entry gate) to the exit gate. The closed side is drawn from the station id
//                 (Roadworks.random), so it is the same on every ride and every restart. Leitbaken (red and white
//                 chevron boards on a black rubber foot) stand along the centre line, with a taper at each end out to
//                 the closed lane's edge; their chevrons point toward the open lane. A Swiss mobile traffic light
//                 stands at each entry, on the open lane's verge, with a stop line STOP_M in from the gate
//   repair zone   where the lane is fully closed (Roadworks.repairSpan: between the tapers, never under one) it has
//                 another surface (RoadSurface.setWorks: milled asphalt, fresh dark patches, a gravel strip at the
//                 edge, feathered into the old surface). The tapers keep the road's own surface
//   works         cones and barrier planks, and the works in GROUPS of things that belong together (a dig, surfacing,
//                 a stores area, a welfare corner, setts on a cobbled road), with open stretches of plain closed lane
//                 between two. Each site draws its groups, their order and their spacing from its own id
//                 (Roadworks.layout), no kind stands more often in one site than Roadworks.MOST allows, and a site
//                 never has the layout of the site before it, nor of any site before where its draws give another. Some of it is a ramp (a plank ramp, a steel plate up a
//                 gravel heap, a sand heap with a flat top)
//
// The checkpoint line is the station's own s, and the site begins there: the entry gate stands on it, the first stop
// line STOP_M past it, so the split is taken before the rider waits at the light or picks a way through the works.
// The importer puts a station only where a full site fits ahead (tools/world/stations.mjs), so no checkpoint is the
// bare gates; Roadworks.problems names a site that is. A checkpoint is a timing line and nothing else: a rider who
// crashes goes on from where they crashed (Game.restartInPlace), in the open lane when that is inside a site.
//
// Contact (Roadworks.ride, from Vehicle.update): light things (beacons, cones, barrier planks) are knocked over and
// slow the bike a little with a wobble; heavy things (the end gates, the lights, the fence, the pallets, the roller,
// the digger, the sign and the rest of the plant and stores: ROLE) are solid exactly as drawn, their geometry's own
// box; the heaps, ramps and plates are ridden:
// the bike stands on the drawn surface, and leaves it where following it would need more than the game's jump gravity
// (Vehicle.updateJump), with the vertical speed the surface gave it, so a ramp throws it at its speed times its slope.
// The lane traffic keeps through a site (WorldRoute.laneWeight, laneTarget) and the stop lines (stopDistance) are here
// too, and the lights' cycle (Roadworks.update): green one way, amber, all red until the lane is clear, then the other.
class Roadworks {
    // A site's length, gate to gate: at least LENGTH_MIN_M (or the closure is skipped) and at most LENGTH_MAX_M. Each
    // site has a most of its own between LENGTH_SHORT_M and LENGTH_MAX_M (Roadworks.mostOf, from the station's id), so
    // some works are a short closure and some run on for half a kilometre where the road gives the room
    static get LENGTH_MIN_M() { return 64; }
    static get LENGTH_SHORT_M() { return 110; }
    static get LENGTH_MAX_M() { return 550; }
    // An end gate's board: its foot over the ground and the height of each of its five bands (2.45 m to its top)
    static get GATE_LOW_M() { return 0.1; }
    static get GATE_BAND_M() { return 0.47; }
    // The open stretch of plain closed lane between two groups of works (cones and surface only), drawn between these
    static get GROUP_GAP_M() { return [12, 30]; }
    // A group's first piece stands this far past the last one's start at the least, and the pieces of a group stand
    // PIECE_GAP_M apart (drawn between the two)
    static get PIECE_GAP_M() { return [1.2, 2.6]; }
    // The works start this far into the full width of the closed lane, past the planks across it; the first group may
    // stand up to LEAD_MAX_M further on where the lane gives the room
    static get WORKS_IN_M() { return 3; }
    static get LEAD_MAX_M() { return 10; }
    // The ramps' line in from the centre line, the clear lane kept after each ramp for the landing, and the room a
    // plate laid in that landing needs before the lane ends
    static get RAMP_LAT_M() { return 2.4; }
    // The strip the widest solid pieces need in from the closed lane's edge (the digger and the cabin), and the gap a
    // bike on the ramps' line keeps to a solid piece
    static get STRIP_M() { return 1.7; }
    static get LINE_CLEAR_M() { return 0.1; }
    static get LANDING_M() { return 9; }
    // The repair surface starts this far inside the closed lane's full width at each end: more than its ragged edge
    // reaches (RoadSurface.shader, roadWorksAt: 0.19 m of noise and a 0.12 m feather), so none of it lies under a taper
    static get REPAIR_INSET_M() { return 0.5; }
    // No stretch of the closed lane's full width longer than this is bare (outside every group of works): a group
    // that does not fit whole before the lane's end stands as far as the lane goes when the end would be barer. And
    // the least solid pieces a site's works hold (Roadworks.problems)
    static get BARE_MAX_M() { return 30; }
    static get TAIL_ROOM_M() { return 8; }
    static get SOLID_MIN() { return 3; }
    // How often a site draws again when its layout is the one of a site before it
    static get LAYOUT_DRAWS() { return 8; }

    // The most of a kind in one site, whatever its length. A group whose piece is at its most stands without it
    static get MOST() { return { digger: 2, roller: 2, compressor: 1, cabin: 1, toilet: 1, van: 1 }; }

    // What stands in the outer strip of the closed lane: each kind's length along the road, its centre in from the
    // closed lane's edge and, for a solid thing, its half width (a piece that would reach the ramps' line on a narrow
    // road is left out, so that line is clear of every solid thing from end to end), and the most a heap is turned
    static get PIECES() {
        return {
            digger: { length: 2.6, out: 0.8, wide: 0.75 }, roller: { length: 2.3, out: 0.75, wide: 0.6 }, pallets: { length: 1.3, out: 0.55, wide: 0.4 },
            heap: { length: 2.5, out: 1.0, turn: 0.6 }, fence: { length: 3.6, out: 0.2, wide: 0.13 }, sign: { length: 0.6, out: 0.5, wide: 0.33 },
            pipes: { length: 3.2, out: 0.75, wide: 0.62 }, kerbs: { length: 1.3, out: 0.55, wide: 0.4 }, compressor: { length: 2.2, out: 0.7, wide: 0.5 },
            cabin: { length: 3.2, out: 0.9, wide: 0.8 }, toilet: { length: 1.2, out: 0.7, wide: 0.58 }, van: { length: 3.9, out: 0.9, wide: 0.75 },
            setts: { length: 1.3, out: 0.55, wide: 0.4 }
        };
    }

    // The ramps and plates of the middle line: their length along the road
    static get RAMPS() { return { plankRamp: 3.2, plateRamp: 4.4, sandRamp: 5.2, plate: 2.4 }; }

    // The groups of works: `strip` the pieces along the outer strip in their order, `mid` the ramps of the middle line
    // (a 'plate' lies in the landing of the ramp before it), `extra` the pieces of which a group may have one more
    // somewhere along its strip, `on` the road surface a group belongs to ('asphalt' or 'cobbles'; none: any), `most`
    // how often it may stand in one site. A site's first group is one with a ramp
    static get GROUPS() {
        return {
            // A trench: the digger, its spoil, a fence along it and a steel plate up the spoil
            dig: { strip: ['fence', 'digger', 'heap'], extra: ['fence', 'sign', 'pallets'], mid: ['plateRamp', 'plate'] },
            // New surfacing: the roller, a heap of chippings, the sign and a heap of sand
            surfacing: { on: 'asphalt', strip: ['sign', 'roller', 'heap'], extra: ['pallets', 'compressor', 'heap'], mid: ['sandRamp'] },
            // The stores: pallets, a stack of pipes, kerb stones, the compressor, and planks up a trestle
            stores: { strip: ['pallets', 'pipes', 'kerbs', 'compressor'], extra: ['pallets', 'fence'], mid: ['plankRamp', 'plate'] },
            // The welfare corner: the site cabin, a portable toilet and a parked van
            welfare: { most: 1, strip: ['cabin', 'toilet', 'van'], extra: ['sign', 'fence'], mid: [] },
            // On a cobbled road: pallets of setts, kerb stones and the sand they are bedded in
            setts: { on: 'cobbles', strip: ['setts', 'kerbs', 'setts'], extra: ['pallets', 'setts'], mid: ['sandRamp', 'plate'] }
        };
    }
    // The taper's length out from the closed lane's edge to the centre line. It ends BLEND_M in from the stop line, where
    // the traffic is in the open lane (Roadworks.laneShare)
    static get TAPER_M() { return 16; }
    static get TAPER_LAG_M() { return 3; }
    // Gate to its stop line (and light)
    static get STOP_M() { return 3; }
    // Beacons: along the centre line about every BEACON_EVERY_M, every TAPER_EVERY_M in a taper, their centres
    // BEACON_LAT_M into the closed half (the rubber foot then stops 3 cm short of the centre line)
    static get BEACON_EVERY_M() { return 7; }
    static get TAPER_EVERY_M() { return 3.2; }
    static get BEACON_LAT_M() { return 0.28; }
    static get BEACON_HALF_M() { return 0.25; }
    // The narrowest open lane a closure may leave, and the tightest bend it may stand in (1/m: 50 m radius)
    static get OPEN_MIN_M() { return 3.2; }
    static get CURVE_MAX() { return 0.02; }
    // Metres from a ride junction a closure keeps, and from a bridge or a tunnel ahead of its exit gate
    static get JUNCTION_CLEAR_M() { return 25; }
    static get STRUCTURE_CLEAR_M() { return 6; }
    // A gate group's centre and a light's past the carriageway edge, on the drawn verge
    static get GROUP_OUT_M() { return 0.6; }
    static get LIGHT_OUT_M() { return 0.55; }
    // A site is drawn while the bike is within this many metres of it (in plan)
    static get REACH_M() { return 230; }
    // The lights: green for GREEN_S, amber for AMBER_S, then all red for as long as a car at CLEAR_SPEED_MS (the
    // slowest car's lane speed) needs to clear the single lane from a rolling start, plus CLEAR_LAG_S; and longer while
    // anything is still in the lane
    static get GREEN_S() { return 20; }
    static get AMBER_S() { return 3; }
    static get CLEAR_SPEED_MS() { return 6; }
    static get CLEAR_LAG_S() { return 4; }
    // Style a rider earns for jumping a red, once for each site (shown; it cost style before)
    static get RED_RUN_STYLE() { return 250; }
    // The bike's half width for contact, and the most a knock costs of its speed
    static get BIKE_R() { return 0.35; }
    // Traffic: half lengths of a car and a rider, the gap a queue keeps, and the speed under which a vehicle at a
    // turning light stops rather than goes on through
    static get CAR_HALF_M() { return 2.3; }
    static get BIKE_HALF_M() { return 1.1; }
    static get QUEUE_GAP_M() { return 1.5; }
    // How far before a single lane the traffic starts to read the rider as one of the queue (Roadworks.riderEntry)
    static get RIDER_QUEUE_M() { return 60; }
    static get RIDER_IN_M() { return 1; }
    static get COMMIT_SPEED_MS() { return 2; }
    // The lane traffic drives through a site blends to the open lane over BLEND_M in from each stop line, inside the
    // site: a vehicle that waits at a light stands in its own lane, and one that leaves is back in its own lane at the
    // far stop line, beside the queue there. Blended before the line, the queue stood in the open lane and whoever
    // came out of the single lane met its first car head-on
    static get BLEND_M() { return 22; }

    // How much of the way to the open lane's middle the traffic is at s (0 its own lane, 1 the open lane)
    static laneShare(site, s) {
        if (s <= site.stopIn || s >= site.stopOut) return 0;
        return Roadworks.smooth(Math.min(1, (s - site.stopIn) / Roadworks.BLEND_M, (site.stopOut - s) / Roadworks.BLEND_M));
    }
    // Gravity a ridden surface may ask of the bike before it leaves it: the jump's own (Vehicle.updateJump)
    static get LEAVE_G() { return 9.81 * 2; }

    // A seeded random in [0, 1) (mulberry32): the same station id gives the same site on every ride
    static random(seed) {
        let a = seed >>> 0;
        return () => {
            a = (a + 0x6d2b79f5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    static seedOf(id) {
        return (Math.imul((id | 0) + 1, 2654435761) ^ 0x5bd1e995) >>> 0;
    }

    // The closed side of the station with this id: Route.LEFT or Route.RIGHT
    static closedSide(id) {
        return Roadworks.random(Roadworks.seedOf(id))() < 0.5 ? Route.LEFT : Route.RIGHT;
    }

    static smooth(t) {
        const x = Math.max(0, Math.min(1, t));
        return x * x * (3 - 2 * x);
    }

    // Every checkpoint station as a site: [{id, s, side, open, closed, reason, s0, s1, ...}] (no THREE: the node tests read it)
    static plan(route, stations, junctionS = []) {
        const sites = [];
        // (the layouts of the closed sites so far, the last one the site just before)
        const before = [];
        for (const st of stations) {
            const site = Roadworks.site(route, st, junctionS, before);
            if (site.closed) before.push(site.layout);
            sites.push(site);
        }
        return sites;
    }

    // The most metres the site of the station with this id may run: its own draw between the short closure and the
    // longest (a seed of its own, so the closed side and the layout keep their draws)
    static mostOf(id) {
        const t = Roadworks.random(Roadworks.seedOf(id) ^ 0x9e3779b9)();
        return Math.round(Roadworks.LENGTH_SHORT_M + (Roadworks.LENGTH_MAX_M - Roadworks.LENGTH_SHORT_M) * t);
    }

    // Where a closure may run on from the station: how many metres ahead stay straight enough, wide enough for the
    // open lane, clear of a junction and out of a tunnel or gallery, and the reason the stretch ends
    static stretch(route, s, junctionS, most = Roadworks.LENGTH_MAX_M) {
        const p = {};
        const why = (at) => {
            // (a structure STRUCTURE_CLEAR_M ahead too: the verge narrows toward a bridge or a tunnel over the row before
            // it, and an end gate there had no verge to stand on)
            for (const ahead of [Roadworks.STRUCTURE_CLEAR_M, 0]) {
                route.sample(Math.min(route.length, at + ahead), p);
                if (p.flags && (p.flags.tunnel || p.flags.gallery)) return 'a tunnel';
                if (p.flags && p.flags.bridge) return 'a bridge';
            }
            if (junctionS.some(j => Math.abs(j - at) < Roadworks.JUNCTION_CLEAR_M)) return 'a junction';
            const k = Math.abs(route.curvatureAt(at - 4, 8));
            if (k >= Roadworks.CURVE_MAX) return `a bend of ${Math.round(1 / k)} m radius`;
            const open = p.width / 2 - Roadworks.BEACON_HALF_M + Roadworks.BEACON_LAT_M;
            if (open < Roadworks.OPEN_MIN_M) return `a road that leaves an open lane of ${open.toFixed(2)} m`;
            return null;
        };
        let on = 0, reason = why(s);
        while (!reason && on < most && s + on + 1 <= route.length) {
            reason = why(s + on + 1);
            if (!reason) on++;
        }
        return { on, reason: on >= most ? null : reason || 'the end of the ride' };
    }

    // `before` holds the layouts of the closed sites before this one along the ride (or the one layout of the site just
    // before): this one takes none of them where its draws give another, and never the last
    static site(route, st, junctionS, before = null) {
        const rand = Roadworks.random(Roadworks.seedOf(st.id));
        const side = rand() < 0.5 ? Route.LEFT : Route.RIGHT;
        const p = route.sample(st.s, {});
        const most = Roadworks.mostOf(st.id);
        const { on, reason } = Roadworks.stretch(route, st.s, junctionS, most);
        const length = Math.min(most, on);
        const site = { id: st.id, s: st.s, side, open: -side, closed: false, reason: null, s0: st.s, rand, most };
        // The narrowest carriageway over the site, and the open lane it leaves (centre line to its edge, past the beacons' feet)
        let half = p.width / 2;
        for (let d = 0; d <= length; d += 4) half = Math.min(half, route.sample(st.s + d, {}).width / 2);
        site.half = half;
        site.openWidth = half - Roadworks.BEACON_HALF_M + Roadworks.BEACON_LAT_M;
        if (length < Roadworks.LENGTH_MIN_M) {
            site.reason = `the straight after it is ${on} m long (it ends at ${reason}), under the ${Roadworks.LENGTH_MIN_M} m a closure needs`;
        } else if (site.openWidth < Roadworks.OPEN_MIN_M) {
            site.reason = `the open lane would be ${site.openWidth.toFixed(2)} m wide, under ${Roadworks.OPEN_MIN_M} m`;
        } else {
            site.closed = true;
        }
        if (!site.closed) {
            // The end gates alone, a short warning stretch with no lane closed, no lights and no works
            site.s1 = Math.min(route.length, st.s + 24);
            site.gates = [{ s: site.s0, facing: 1 }, { s: site.s1, facing: -1 }];
            site.lights = [];
            site.items = [];
            return site;
        }
        const s0 = st.s, s1 = st.s + length;
        Object.assign(site, { s0, s1, length });
        site.stopIn = s0 + Roadworks.STOP_M;
        site.stopOut = s1 - Roadworks.STOP_M;
        // (the taper closes the lane TAPER_LAG_M after the traffic has left it: on a narrow road a car still on its way
        // across came within a hand of the taper's beacons)
        site.sb = site.stopIn + Roadworks.BLEND_M + Roadworks.TAPER_LAG_M;
        site.sa = site.sb - Roadworks.TAPER_M;
        site.sc = site.stopOut - Roadworks.BLEND_M - Roadworks.TAPER_LAG_M;
        site.sd = site.sc + Roadworks.TAPER_M;
        // The lane both directions drive in the single lane: the middle of the open lane
        site.laneLat = site.open * half / 2;
        site.gates = [{ s: s0, facing: 1 }, { s: s1, facing: -1 }];
        // (each on the verge of the road as wide as it is there: over a long site the road's width changes, and a light
        // placed by the site's narrowest width stood in the open lane where the road was wider)
        const halfAt = s => route.sample(s, {}).width / 2;
        site.lights = [
            { s: site.stopIn, lat: site.open * (halfAt(site.stopIn) + Roadworks.LIGHT_OUT_M), facing: 1, direction: 1 },
            { s: site.stopOut, lat: site.open * (halfAt(site.stopOut) + Roadworks.LIGHT_OUT_M), facing: -1, direction: -1 }
        ];
        // The road the works stand on: cobbles where most of the closed lane is cobbled (the groups' `on`)
        let cobbled = 0, samples = 0;
        for (let s = site.sb; s <= site.sc; s += 4, samples++) if ((route.sample(s, {}).flags || {}).cobbles) cobbled++;
        site.surface = cobbled * 2 > samples ? 'cobbles' : 'asphalt';
        const earlier = Array.isArray(before) ? before : before === null ? [] : [before];
        const last = earlier[earlier.length - 1];
        let spare = null;
        for (let draw = 0; draw < Roadworks.LAYOUT_DRAWS; draw++) {
            site.items = Roadworks.layout(site, draw);
            if (!earlier.includes(site.layout)) { spare = null; break; }
            // (a short lane has few layouts to draw: the first that is not its neighbour's stands if none is new)
            if (spare === null && site.layout !== last) spare = draw;
        }
        if (spare !== null) site.items = Roadworks.layout(site, spare);
        // The light cycle: the all-red phase clears the single lane at the slowest car's speed from a rolling start
        const lane = site.stopOut - site.stopIn + 2 * Roadworks.CAR_HALF_M;
        site.redS = Math.ceil(lane / Roadworks.CLEAR_SPEED_MS + Roadworks.CLEAR_LAG_S);
        site.cycleS = 2 * (Roadworks.GREEN_S + Roadworks.AMBER_S + site.redS);
        // (a seed of its own: the layout's draws do not move a site's lights)
        site.phaseOffsetS = Math.floor(Roadworks.random(Roadworks.seedOf(st.id) ^ 0x85ebca6b)() * site.cycleS);
        return site;
    }

    // The closed lane's lateral at s: from the closed edge (taper start) in to the beacon line, along it, and out again
    static beaconLat(site, s) {
        const edge = site.half - 0.35, line = Roadworks.BEACON_LAT_M;
        let t = 1;
        if (s < site.sb) t = (s - site.sa) / (site.sb - site.sa);
        else if (s > site.sc) t = (site.sd - s) / (site.sd - site.sc);
        t = Math.max(0, Math.min(1, t));
        return site.side * (edge + (line - edge) * t);
    }

    // The stretch of a closed site that has the repair surface, [from, to] along the ride: the lane's full width less
    // REPAIR_INSET_M at each end. Under the tapers the surface is the road's own, drawn and ridden (the bike reads no
    // grip from a site: Vehicle.syncWorldSurface)
    static repairSpan(site) {
        return [site.sb + Roadworks.REPAIR_INSET_M, site.sc - Roadworks.REPAIR_INSET_M];
    }

    // What stands in the closed lane, as {kind, s, lat, yaw}: the beacons, cones along its edge, and in its full width
    // (sb to sc) the barrier planks across it and the works in groups (GROUPS): each group's pieces along the outer
    // strip, its ramps on the middle line with a clear landing after each, and plain lane between two groups. The
    // groups, their order, which way round each stands and every spacing come from the site's id and `draw` (a site
    // draws again when its layout is its neighbour's). Sets site.groups ([{name, s0, s1, flip, strip1}]: `strip1`
    // where its strip ends, `s1` where its last thing or landing does) and site.layout
    static layout(site, draw = 0) {
        const items = [];
        const side = site.side, half = site.half;
        const rand = Roadworks.random((Roadworks.seedOf(site.id) ^ 0xc2b2ae35) + Math.imul(draw, 0x27d4eb2f));
        const add = (kind, s, lat, yaw = 0) => items.push({ kind, s, lat: side * lat, yaw });
        const beacon = (s) => items.push({ kind: 'beacon', s, lat: Roadworks.beaconLat(site, s), yaw: 0 });
        for (let s = site.sa; s < site.sb - 0.5; s += Roadworks.TAPER_EVERY_M) beacon(s);
        const core = site.sc - site.sb;
        const n = Math.max(1, Math.round(core / Roadworks.BEACON_EVERY_M));
        for (let k = 0; k <= n; k++) beacon(site.sb + core * k / n);
        for (let s = site.sd; s > site.sc + 0.5; s -= Roadworks.TAPER_EVERY_M) beacon(s);
        // Cones: along the closed lane's edge in the tapers, and inside the beacon line in its full width (the works
        // have the edge there), clear of the plate across the lane at its start
        for (let s = site.sa + 2; s <= site.sd - 2; s += 9) {
            if (s < site.sb || s > site.sc) add('cone', s, half - 0.45);
            else if (Math.abs(s - (site.sb + 3)) > 1.4) add('cone', s, 1.0);
        }
        // The planks across the lane at the start of its full width, and a plate across it behind them
        add('planks', site.sb + 1.2, 2.1, Math.PI / 2);
        add('plate', site.sb + 3, 1.25, Math.PI / 2);

        const G = Roadworks.GROUPS, P = Roadworks.PIECES, R = Roadworks.RAMPS, most = Roadworks.MOST;
        const between = ([low, high]) => low + (high - low) * rand();
        const shuffled = (list) => {
            const out = list.slice();
            for (let i = out.length - 1; i > 0; i--) {
                const j = Math.floor(rand() * (i + 1));
                [out[i], out[j]] = [out[j], out[i]];
            }
            return out;
        };
        const ramped = name => G[name].mid.some(kind => kind !== 'plate');
        const names = Object.keys(G).filter(name => !G[name].on || G[name].on === site.surface);
        // The order the groups come in: every group once before any comes again, the first of all one with a ramp
        let order = shuffled(names);
        const lead = order.findIndex(ramped);
        if (lead > 0) order.unshift(order.splice(lead, 1)[0]);
        const stood = {}, count = {};
        let turn = 0;
        const next = () => {
            for (let tries = 0; tries < names.length * 2; tries++) {
                if (turn === order.length) {
                    // (again in another order, not starting with the group that has just stood)
                    const last = order[order.length - 1];
                    order = shuffled(names);
                    if (order.length > 1 && order[0] === last) order.push(order.shift());
                    turn = 0;
                }
                const name = order[turn++];
                if ((stood[name] || 0) < (G[name].most || Infinity)) return name;
            }
            return null;
        };
        const end = site.sc - 1;
        const groups = [];
        const solid = () => items.filter(item => P[item.kind] && P[item.kind].wide).length;
        let at = site.sb + Roadworks.WORKS_IN_M;
        // The ramps' line: at RAMP_LAT_M, or nearer the centre line where the road is too narrow to hold the strip
        // beside it, but never so near that a ramp reaches the beacons' feet
        const reach = Roadworks.BIKE_R + Roadworks.LINE_CLEAR_M;
        const rampLat = Math.max(Roadworks.BEACON_LAT_M + Roadworks.BEACON_HALF_M + 1, Math.min(Roadworks.RAMP_LAT_M, half - Roadworks.STRIP_M - reach));
        const clear = kind => !P[kind].wide || half - P[kind].out - P[kind].wide >= rampLat + reach - 1e-9;
        site.rampLat = rampLat;
        while (at + 4 < end) {
            const name = next();
            if (!name) break;
            const group = G[name];
            const flip = rand() < 0.5;
            const pieces = flip ? group.strip.slice().reverse() : group.strip.slice();
            // One of its extras, or none, anywhere along the strip
            const extra = Math.floor(rand() * ((group.extra || []).length + 1)), where = Math.floor(rand() * (pieces.length + 1));
            if (extra < (group.extra || []).length) pieces.splice(where, 0, group.extra[extra]);
            const held = {};
            const strip = pieces.filter(kind => clear(kind) && (count[kind] || 0) + (held[kind] = (held[kind] || 0) + 1) <= (most[kind] || Infinity));
            const gaps = strip.map(() => between(Roadworks.PIECE_GAP_M));
            const length = strip.reduce((sum, kind, i) => sum + P[kind].length + gaps[i], 0);
            // A group after the first stands whole, or not at all where the lane then ends bare for BARE_MAX_M at the
            // most and the site has its SOLID_MIN solid pieces; else it stands as far as the lane goes, as the first does
            if (groups.length && at + length > end && site.sc - groups[groups.length - 1].s1 <= Roadworks.BARE_MAX_M && solid() >= Roadworks.SOLID_MIN) break;
            if (!groups.length) at += rand() * Math.min(Roadworks.LEAD_MAX_M, Math.max(0, end - at - Math.max(length, 3 + (R[group.mid[0]] || 0) + Roadworks.LANDING_M)));
            const s0 = at;
            let s1 = at;
            strip.forEach((kind, i) => {
                const piece = P[kind];
                if (at + piece.length > end) return;
                add(kind, at + piece.length / 2, half - piece.out, piece.turn ? (rand() - 0.5) * piece.turn : 0);
                count[kind] = (count[kind] || 0) + 1;
                at += piece.length + gaps[i];
                s1 = at - gaps[i];
            });
            const stripS1 = s1;
            // The middle line: each ramp with LANDING_M of clear lane after it, a plate in that landing
            let s = s0 + 3, landed = null;
            for (const kind of group.mid) {
                if (kind === 'plate') {
                    if (landed !== null && landed + Roadworks.LANDING_M + R.plate + 4 < site.sc) add('plate', landed + Roadworks.LANDING_M / 2, rampLat, 0);
                    continue;
                }
                if (s + R[kind] + Roadworks.LANDING_M > site.sc) break;
                add(kind, s + R[kind] / 2, rampLat);
                s += R[kind] + Roadworks.LANDING_M;
                landed = s - Roadworks.LANDING_M;
                s1 = Math.max(s1, s);
            }
            // (a group of which nothing found room is no group)
            if (s1 === s0) break;
            stood[name] = (stood[name] || 0) + 1;
            groups.push({ name, s0, s1, flip, strip1: stripS1 });
            // The plain lane to the next group, from this one's last thing. Where the lane would end bare for longer
            // than BARE_MAX_M, the next group starts with TAIL_ROOM_M of lane left, so some of it stands
            let gap = between(Roadworks.GROUP_GAP_M);
            if (site.sc - s1 > Roadworks.BARE_MAX_M) gap = Math.min(gap, end - s1 - Roadworks.TAIL_ROOM_M);
            at = s1 + gap;
        }
        // A site still short of its solid pieces (a short lane, a small group) has pallets stood after a group's
        // strip, the last group's first, where the lane or the plain stretch to the next group gives the room
        for (let i = groups.length - 1; i >= 0; i--) {
            const group = groups[i];
            const limit = i + 1 < groups.length ? groups[i + 1].s0 - Roadworks.GROUP_GAP_M[0] : end;
            for (let s = group.strip1; solid() < Roadworks.SOLID_MIN && clear('pallets');) {
                s += between(Roadworks.PIECE_GAP_M);
                if (s + P.pallets.length > limit) break;
                add('pallets', s + P.pallets.length / 2, half - P.pallets.out);
                s += P.pallets.length;
                group.s1 = Math.max(group.s1, s);
            }
        }
        site.groups = groups;
        site.layout = groups.map(group => group.name).join(' ');
        return items;
    }

    // The longest stretch of a closed site's full-width lane that is outside every group of works, in metres
    static bare(site) {
        let from = site.sb, longest = 0;
        for (const group of site.groups || []) {
            longest = Math.max(longest, group.s0 - from);
            from = Math.max(from, group.s1);
        }
        return Math.max(longest, site.sc - from);
    }

    // The solid pieces of a site's works (the plant and the stores: not the gates, the lights or the beacons)
    static solid(site) {
        const pieces = Roadworks.PIECES;
        return (site.items || []).filter(item => pieces[item.kind] && pieces[item.kind].wide).length;
    }

    // Why a checkpoint's site is not real roadworks, as a list of sentences (none: it is): no lane closed, no group
    // of works, under SOLID_MIN solid pieces, or a bare stretch over BARE_MAX_M
    static problems(site) {
        if (!site.closed) return [`no lane is closed: ${site.reason}`];
        const out = [];
        const core = Math.round(site.sc - site.sb);
        if (!(site.groups || []).length) out.push(`no works stand in its closed lane of ${core} m`);
        const solid = Roadworks.solid(site);
        if (solid < Roadworks.SOLID_MIN) out.push(`${solid} solid pieces in its closed lane of ${core} m, under ${Roadworks.SOLID_MIN}`);
        const bare = Roadworks.bare(site);
        if (bare > Roadworks.BARE_MAX_M + 1e-6) out.push(`${bare.toFixed(1)} m of its closed lane is bare, over ${Roadworks.BARE_MAX_M} m`);
        return out;
    }

    // The ride's stations that are checkpoints (every station but the start and the finish)
    static checkpointStations(stations) {
        return stations.slice(1, -1);
    }

    constructor(env, stations) {
        this.env = env;
        this.route = env.route;
        const junctionS = [];
        for (const j of (env.graph && env.graph.junctions) || []) for (const pass of j.passes) junctionS.push(pass.sIn);
        this.sites = Roadworks.plan(this.route, Roadworks.checkpointStations(stations || []), junctionS);
        this.closed = this.sites.filter(site => site.closed);
        this.clock = 0;
        this.events = [];
        this.occupied = new Map();
        this.laneShift();
        if (typeof THREE !== 'undefined') this.build();
    }

    // The lane traffic drives (WorldRoute.laneCurve): each row near a closed site blends from its own lane to the
    // open lane's middle over BLEND_M in from each stop line (Roadworks.laneShare), and holds it between them
    laneShift() {
        const pts = this.route.points;
        const weight = new Float32Array(pts.length), target = new Float32Array(pts.length);
        for (const site of this.closed) {
            for (let k = this.route.indexAt(Math.max(0, site.stopIn)); k < pts.length && pts[k].s <= site.stopOut; k++) {
                const w = Roadworks.laneShare(site, pts[k].s);
                if (w > weight[k]) { weight[k] = w; target[k] = site.laneLat; }
            }
        }
        this.route.laneWeight = weight;
        this.route.laneTarget = target;
    }

    // The light's state for traffic going in `direction` at a site: 'green', 'amber' or 'red'
    light(site, direction) {
        const phase = this.phase(site).index;
        if (phase === 0) return direction > 0 ? 'green' : 'red';
        if (phase === 1) return direction > 0 ? 'amber' : 'red';
        if (phase === 3) return direction < 0 ? 'green' : 'red';
        if (phase === 4) return direction < 0 ? 'amber' : 'red';
        return 'red';
    }

    // The phase a site is in: 0 green one way (toward increasing s), 1 amber, 2 all red, 3 green the other way, 4 amber,
    // 5 all red. Each site holds its own timer, which an all-red phase cannot leave while the lane holds a vehicle
    phase(site) {
        if (!site.timer) site.timer = { index: 0, left: 0, started: false };
        if (!site.timer.started) {
            // Start each site part way through its cycle (seeded), so they are not all in step
            site.timer.started = true;
            let t = site.phaseOffsetS % site.cycleS;
            let index = 0;
            while (t >= this.phaseLength(site, index)) { t -= this.phaseLength(site, index); index = (index + 1) % 6; }
            site.timer.index = index;
            site.timer.left = this.phaseLength(site, index) - t;
        }
        return site.timer;
    }

    phaseLength(site, index) {
        return index === 0 || index === 3 ? Roadworks.GREEN_S : index === 1 || index === 4 ? Roadworks.AMBER_S : site.redS;
    }

    // Advances the lights by dt seconds
    step(dt) {
        if (!(dt > 0)) return;
        this.clock += dt;
        for (const site of this.closed) {
            const timer = this.phase(site);
            timer.left -= dt;
            while (timer.left <= 0) {
                // All red ends only once the single lane is empty (Traffic tells occupy what is in it)
                if ((timer.index === 2 || timer.index === 5) && this.occupied.get(site.id)) { timer.left = 0; break; }
                timer.index = (timer.index + 1) % 6;
                timer.left += this.phaseLength(site, timer.index);
                this.lampsDirty = true;
            }
        }
    }

    // The vehicles traffic moves this frame: [{s, direction, half}]. Records what is in each single lane (between its
    // stop lines), which holds an all-red phase until the lane is clear
    occupy(vehicles) {
        for (const site of this.closed) {
            let n = 0;
            for (const v of vehicles) {
                // (the rider only once past a stop line by RIDER_IN_M: a rider who waits with the wheel on the line is
                // not in the lane, and counted there held its own light red for ever)
                const half = v.rider ? -Roadworks.RIDER_IN_M : v.half;
                if (v.s + half > site.stopIn && v.s - half < site.stopOut) n++;
            }
            this.occupied.set(site.id, n);
        }
    }

    // The metres a vehicle at s going in `direction` (front `half` metres ahead of s), at `speed` and able to brake at
    // `brake`, may still move before it must stand at a stop line: Infinity when no light holds it. A vehicle past its
    // stop line is never held; one that was too near to stop when its light left green (committed) goes on through.
    stopDistance(vehicle, s, direction, half, speed, brake) {
        let best = Infinity;
        for (const site of this.closed) {
            const line = direction > 0 ? site.stopIn : site.stopOut;
            const d = (line - (s + direction * half)) * direction;
            if (d < -0.01 || d > 200) {
                if (vehicle.roadworksCommit === site.id && d > 200) vehicle.roadworksCommit = null;
                continue;
            }
            const stopping = speed * speed / (2 * brake);
            if (vehicle.roadworksCommit === site.id && d > stopping + 5) vehicle.roadworksCommit = null;
            const state = this.light(site, direction);
            if (state === 'green') {
                if (speed >= Roadworks.COMMIT_SPEED_MS && d <= stopping + 0.5) vehicle.roadworksCommit = site.id;
                continue;
            }
            if (vehicle.roadworksCommit === site.id) continue;
            best = Math.min(best, Math.max(0, d));
        }
        return best;
    }

    // The closed site whose single lane holds s (stopIn to stopOut), or null
    siteAt(s, margin = 0) {
        for (const site of this.closed) if (s >= site.stopIn - margin && s <= site.stopOut + margin) return site;
        return null;
    }

    // A place for a vehicle at s going in `direction` that is out of every single lane: s itself, or the nearest
    // place before the lane's entry in its direction of travel (so it queues at its light)
    clearOf(s, direction, half) {
        for (const site of this.closed) {
            if (s + half > site.stopIn - 1 && s - half < site.stopOut + 1) return direction > 0 ? site.stopIn - half - 6 : site.stopOut + half + 6;
        }
        return s;
    }

    // Whether a rider passing should hold off: a single lane within `ahead` metres in its direction of travel
    siteAhead(s, direction, ahead) {
        for (const site of this.closed) {
            const near = direction > 0 ? site.stopIn - s : s - site.stopOut;
            const inside = s > site.stopIn - Roadworks.BLEND_M && s < site.stopOut + Roadworks.BLEND_M;
            if (inside || (near > 0 && near < ahead)) return site;
        }
        return null;
    }

    // The lateral a pilot rides at s: its own, or the open lane's middle through a closed site (blended as traffic's)
    pilotLane(s, own = 0) {
        for (const site of this.closed) {
            if (s <= site.stopIn || s >= site.stopOut) continue;
            return own + (site.laneLat - own) * Roadworks.laneShare(site, s);
        }
        return own;
    }

    // Metres a pilot going toward increasing s has until a stop line it must stop at (red or amber ahead), else Infinity
    pilotStop(s) {
        for (const site of this.closed) {
            const d = site.stopIn - s;
            if (d < 0 || d > 150) continue;
            if (this.light(site, 1) !== 'green') return d;
        }
        return Infinity;
    }

    // The events since the last call ({kind: 'red', site}), which Game turns into a callout and the style cost
    takeEvents() {
        const out = this.events;
        this.events = [];
        return out;
    }

    // ---- what is drawn and what it does

    // The atlas of printed faces, drawn in code: the roadworks triangle (a red border, a figure digging at a heap) in
    // its top-left quarter, the beacon's chevrons in the column at u 0.5 to 0.75
    static atlas() {
        if (Roadworks.atlasTexture) return Roadworks.atlasTexture;
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const g = canvas.getContext('2d');
        g.fillStyle = '#d9d9d6';
        g.fillRect(0, 0, 256, 256);
        // The triangle: apex up in the box (0, 0)-(128, 112)
        const tri = (inset, colour) => {
            g.beginPath();
            g.moveTo(64, 4 + inset * 1.9);
            g.lineTo(124 - inset * 1.65, 108 - inset);
            g.lineTo(4 + inset * 1.65, 108 - inset);
            g.closePath();
            g.fillStyle = colour;
            g.fill();
        };
        tri(0, '#c8102e');
        tri(11, '#f4f4f0');
        g.fillStyle = '#111111';
        // The heap
        g.beginPath();
        g.moveTo(72, 96); g.quadraticCurveTo(86, 70, 100, 96); g.closePath(); g.fill();
        // The figure: head, body bent over, legs, and the spade into the heap
        g.beginPath(); g.arc(57, 46, 5, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.moveTo(50, 52); g.lineTo(62, 54); g.lineTo(58, 74); g.lineTo(48, 72); g.closePath(); g.fill();
        g.fillRect(47, 72, 5, 24);
        g.fillRect(55, 72, 5, 24);
        g.lineWidth = 3;
        g.strokeStyle = '#111111';
        g.beginPath(); g.moveTo(58, 60); g.lineTo(80, 84); g.stroke();
        g.beginPath(); g.moveTo(77, 82); g.lineTo(86, 88); g.lineTo(82, 92); g.closePath(); g.fill();
        g.fillRect(36, 95, 70, 3);
        // The chevrons: white, with red wedges pointing toward u = 0.5 (the left of the column)
        g.fillStyle = '#f4f4f0';
        g.fillRect(128, 0, 64, 256);
        g.fillStyle = '#c8102e';
        for (let y = 0; y < 256; y += 64) {
            g.beginPath();
            g.moveTo(192, y + 4); g.lineTo(131, y + 32); g.lineTo(192, y + 60);
            g.closePath();
            g.fill();
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.encoding = THREE.sRGBEncoding;
        texture.anisotropy = 4;
        texture.name = 'roadworks-atlas';
        Roadworks.atlasTexture = texture;
        return texture;
    }

    // Quads and boxes in an element's own frame (x across the road toward +lateral, y up, z along the road), wound so
    // each face's normal points out of the solid
    static face(out, a, b, c, d, color) {
        for (const p of [a, b, c, a, c, d]) out.positions.push(p[0], p[1], p[2]);
        for (let i = 0; i < 6; i++) out.shades.push(color[0], color[1], color[2]);
    }

    static tri(out, a, b, c, color) {
        for (const p of [a, b, c]) out.positions.push(p[0], p[1], p[2]);
        for (let i = 0; i < 3; i++) out.shades.push(color[0], color[1], color[2]);
    }

    static box(out, x0, x1, y0, y1, z0, z1, color, top = true) {
        const f = Roadworks.face;
        f(out, [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], color);
        f(out, [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, z1], color);
        f(out, [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], color);
        f(out, [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], color);
        if (top) f(out, [x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], color);
    }

    // A prism with `sides` faces round the x axis (a drum or a roller), from x0 to x1, centred at (y, z)
    static drum(out, x0, x1, y, z, r, sides, color) {
        for (let k = 0; k < sides; k++) {
            const a0 = (k / sides) * Math.PI * 2, a1 = ((k + 1) / sides) * Math.PI * 2;
            const p = a => [y + r * Math.cos(a), z + r * Math.sin(a)];
            const [ya, za] = p(a0), [yb, zb] = p(a1);
            Roadworks.face(out, [x0, ya, za], [x0, yb, zb], [x1, yb, zb], [x1, ya, za], color);
        }
    }

    // A surface over a grid from the profile h(a, c): `along` the a of each row (the profile's own breaks among them, so
    // the drawn surface and the ridden one agree there), `nc` columns across [-lc, lc]
    static surface(out, h, along, lc, nc, color, tint = null) {
        const na = along.length - 1;
        const at = (i, j) => {
            const a = along[i], c = -lc + (2 * lc * j) / nc;
            return [c, h(a, c) + 0.005, a];
        };
        for (let i = 0; i < na; i++) {
            for (let j = 0; j < nc; j++) {
                const k = tint ? tint(along[i], j) : color;
                Roadworks.face(out, at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1), k);
            }
        }
    }

    static get COLORS() {
        return {
            red: [0.78, 0.07, 0.07], white: [0.94, 0.94, 0.92], silver: [0.70, 0.72, 0.76], metal: [0.38, 0.39, 0.41],
            black: [0.05, 0.05, 0.05], rubber: [0.08, 0.08, 0.08], yellow: [0.95, 0.72, 0.08], orange: [0.95, 0.35, 0.05],
            grey: [0.45, 0.46, 0.47], steel: [0.42, 0.44, 0.47], wood: [0.58, 0.43, 0.26], gravel: [0.52, 0.51, 0.48],
            sand: [0.76, 0.66, 0.46], sack: [0.85, 0.83, 0.78], glass: [0.12, 0.16, 0.2], concrete: [0.62, 0.62, 0.6], mesh: [0.55, 0.57, 0.58],
            pipe: [0.72, 0.36, 0.16], granite: [0.5, 0.5, 0.53], panel: [0.74, 0.77, 0.76], blue: [0.13, 0.33, 0.58], green: [0.2, 0.42, 0.3]
        };
    }

    // The ridden surfaces: h(a, c) in metres over the element's foot, along a (toward +z) and across c; null outside
    static get PROFILES() {
        const s = Roadworks.smooth;
        return {
            // Two planks up a trestle: a wedge 3.2 m long rising to 0.5 m, cut off square at its lip
            plankRamp: { la: 1.6, lc: 0.6, h: (a, c) => (Math.abs(a) <= 1.6 && Math.abs(c) <= 0.6 ? 0.5 * (a + 1.6) / 3.2 : null) },
            // A gravel heap with a steel plate laid up its front: the plate rises straight to 0.6 m at its crest, the
            // gravel falls away behind it and to the sides
            plateRamp: { la: 2.2, lc: 1.0, h: (a, c) => {
                if (Math.abs(a) > 2.2 || Math.abs(c) > 1.0) return null;
                const along = a < 0.6 ? (a + 2.2) / 2.8 : s((2.2 - a) / 1.6);
                const across = Math.abs(c) <= 0.6 && a < 0.6 ? 1 : s((1.0 - Math.abs(c)) / 0.4);
                return 0.6 * along * across + (Math.abs(c) <= 0.6 && a < 0.6 ? 0.03 : 0);
            } },
            // A sand heap: a straight run up to a flat top 0.7 m high, smooth across, falling away behind
            sandRamp: { la: 2.6, lc: 0.95, h: (a, c) => {
                if (Math.abs(a) > 2.6 || Math.abs(c) > 0.95) return null;
                const along = a < -0.2 ? (a + 2.6) / 2.4 : a < 1.0 ? 1 : s((2.6 - a) / 1.6);
                return 0.7 * along * s((0.95 - Math.abs(c)) / 0.35);
            } },
            // A heap of gravel to ride over
            heap: { la: 1.25, lc: 0.9, h: (a, c) => (Math.abs(a) > 1.25 || Math.abs(c) > 0.9 ? null : 0.55 * s(1 - Math.abs(a) / 1.25) * s(1 - Math.abs(c) / 0.9)) },
            // A steel road plate, 3 cm thick
            plate: { la: 1.2, lc: 0.75, h: (a, c) => (Math.abs(a) <= 1.2 && Math.abs(c) <= 0.75 ? 0.03 : null) }
        };
    }

    // What each kind does on contact
    static get ROLE() {
        return {
            gate: 'heavy', light: 'heavy', fence: 'heavy', pallets: 'heavy', roller: 'heavy', digger: 'heavy', sign: 'heavy',
            pipes: 'heavy', kerbs: 'heavy', compressor: 'heavy', cabin: 'heavy', toilet: 'heavy', van: 'heavy', setts: 'heavy',
            beacon: 'light', cone: 'light', planks: 'light',
            plankRamp: 'surface', plateRamp: 'surface', sandRamp: 'surface', heap: 'surface', plate: 'surface'
        };
    }

    // What a rider is told it hit
    static get NAMES() {
        return {
            gate: 'roadworks boards', light: 'traffic light', fence: 'site fence', pallets: 'stack of pallets', roller: 'road roller',
            digger: 'digger', sign: 'roadworks sign', pipes: 'stack of pipes', kerbs: 'pallet of kerb stones', compressor: 'compressor',
            cabin: 'site cabin', toilet: 'portable toilet', van: 'works van', setts: 'pallet of setts'
        };
    }

    // The share of its speed a bike keeps when it knocks a light thing over
    static get KNOCK_KEEP() { return { beacon: 0.88, cone: 0.94, planks: 0.75 }; }

    // Each kind's geometry, in its own frame
    static geometries() {
        if (Roadworks.built) return Roadworks.built;
        const C = Roadworks.COLORS;
        const make = (fill) => {
            const out = { positions: [], shades: [] };
            fill(out);
            const geometry = RoadMesh.geometry(out.positions, out.shades);
            geometry.computeBoundingBox();
            return geometry;
        };
        const B = Roadworks.box;
        const geo = {};
        // The end gate: three boards on one foot frame, faces along the road
        geo.gate = make(out => {
            // Each board as its faces only (boxes for each band would cost three times as much): the bands front and
            // back, a silver strip on each white band, the two edges and the top
            const half = 0.095, depth = 0.0125, band = Roadworks.GATE_BAND_M, low = Roadworks.GATE_LOW_M, top = low + 5 * band;
            const F = Roadworks.face;
            for (const x of [-0.29, 0, 0.29]) {
                const x0 = x - half, x1 = x + half;
                for (let k = 0; k < 5; k++) {
                    const y0 = low + band * k, y1 = y0 + band, color = k % 2 ? C.white : C.red;
                    F(out, [x0, y0, -depth], [x0, y1, -depth], [x1, y1, -depth], [x1, y0, -depth], color);
                    F(out, [x1, y0, depth], [x1, y1, depth], [x0, y1, depth], [x0, y0, depth], color);
                    if (k % 2) {
                        const d = depth + 0.003, s0 = x - 0.03, s1 = x + 0.03, v0 = y0 + 0.04, v1 = y1 - 0.04;
                        F(out, [s0, v0, -d], [s0, v1, -d], [s1, v1, -d], [s1, v0, -d], C.silver);
                        F(out, [s1, v0, d], [s1, v1, d], [s0, v1, d], [s0, v0, d], C.silver);
                    }
                }
                F(out, [x0, low, depth], [x0, top, depth], [x0, top, -depth], [x0, low, -depth], C.white);
                F(out, [x1, low, -depth], [x1, top, -depth], [x1, top, depth], [x1, low, depth], C.white);
                F(out, [x0, top, -depth], [x0, top, depth], [x1, top, depth], [x1, top, -depth], C.white);
            }
            // The frame: a cross bar under the boards and two feet along the road
            B(out, -0.42, 0.42, 0.16, 0.22, depth, depth + 0.04, C.metal);
            B(out, -0.44, -0.38, 0.01, 0.06, -0.3, 0.3, C.metal);
            B(out, 0.38, 0.44, 0.01, 0.06, -0.3, 0.3, C.metal);
            B(out, -0.42, -0.4, 0.06, 0.2, depth, depth + 0.04, C.metal);
            B(out, 0.4, 0.42, 0.06, 0.2, depth, depth + 0.04, C.metal);
        });
        // The traffic light: a weighted base, a post and a yellow housing with three black visors; its lamps face -z
        geo.light = make(out => {
            B(out, -0.3, 0.3, 0.01, 0.13, -0.25, 0.25, C.rubber);
            B(out, -0.04, 0.04, 0.13, 1.72, -0.04, 0.04, C.grey);
            B(out, -0.18, 0.18, 1.7, 2.65, -0.11, 0.11, C.yellow);
            for (const y of Roadworks.LAMP_Y) B(out, -0.13, 0.13, y + 0.1, y + 0.125, -0.24, -0.11, C.black);
        });
        // The beacon's foot and stem; its board is in the atlas (beaconBoard)
        geo.beacon = make(out => {
            B(out, -0.25, 0.25, 0.01, 0.13, -0.15, 0.15, C.rubber);
            B(out, -0.02, 0.02, 0.13, 0.27, -0.02, 0.02, C.grey);
        });
        // A cone: six sides in three bands (orange, white, orange) on a black foot
        geo.cone = make(out => {
            B(out, -0.17, 0.17, 0.01, 0.04, -0.17, 0.17, C.black);
            const bands = [[0.04, 0.2, 0.14, 0.1, C.orange], [0.2, 0.32, 0.1, 0.07, C.white], [0.32, 0.55, 0.07, 0.02, C.orange]];
            for (const [y0, y1, r0, r1, color] of bands) {
                for (let k = 0; k < 6; k++) {
                    const a0 = k * Math.PI / 3, a1 = (k + 1) * Math.PI / 3;
                    Roadworks.face(out, [r0 * Math.sin(a0), y0, r0 * Math.cos(a0)], [r0 * Math.sin(a1), y0, r0 * Math.cos(a1)], [r1 * Math.sin(a1), y1, r1 * Math.cos(a1)], [r1 * Math.sin(a0), y1, r1 * Math.cos(a0)], color);
                }
            }
        });
        // Barrier planks on two trestles, 2 m long (along z)
        geo.planks = make(out => {
            for (const z of [-0.85, 0.85]) {
                B(out, -0.3, -0.25, 0.01, 1.0, z - 0.03, z + 0.03, C.wood);
                B(out, 0.25, 0.3, 0.01, 1.0, z - 0.03, z + 0.03, C.wood);
            }
            // Each plank's two faces in red and white stripes, and its top
            for (const y of [0.55, 0.85]) {
                for (let k = 0; k < 4; k++) {
                    const z0 = -1.0 + k * 0.5, z1 = z0 + 0.5, color = k % 2 ? C.white : C.red;
                    Roadworks.face(out, [-0.02, y, z1], [-0.02, y + 0.15, z1], [-0.02, y + 0.15, z0], [-0.02, y, z0], color);
                    Roadworks.face(out, [0.02, y, z0], [0.02, y + 0.15, z0], [0.02, y + 0.15, z1], [0.02, y, z1], color);
                }
                Roadworks.face(out, [-0.02, y + 0.15, -1.0], [-0.02, y + 0.15, 1.0], [0.02, y + 0.15, 1.0], [0.02, y + 0.15, -1.0], C.white);
            }
        });
        // A mesh fence panel on two concrete feet, 3.5 m along the road
        geo.fence = make(out => {
            B(out, -0.125, 0.125, 0.01, 0.16, -1.75, -1.45, C.concrete);
            B(out, -0.125, 0.125, 0.01, 0.16, 1.45, 1.75, C.concrete);
            for (const z of [-1.72, 1.72]) B(out, -0.02, 0.02, 0.16, 2.0, z - 0.02, z + 0.02, C.metal);
            B(out, -0.02, 0.02, 1.96, 2.0, -1.72, 1.72, C.metal);
            B(out, -0.02, 0.02, 0.2, 0.24, -1.72, 1.72, C.metal);
            B(out, -0.005, 0.005, 0.24, 1.96, -1.7, 1.7, C.mesh, false);
        });
        // Three pallets with sacks on top
        geo.pallets = make(out => {
            for (let k = 0; k < 2; k++) B(out, -0.4, 0.4, 0.01 + k * 0.15, 0.15 + k * 0.15, -0.6, 0.6, C.wood);
            B(out, -0.36, 0.36, 0.31, 0.7, -0.55, 0.55, C.sack);
        });
        // A small roller: two drums, a yellow frame, a seat
        geo.roller = make(out => {
            for (const z of [-0.75, 0.75]) Roadworks.drum(out, -0.6, 0.6, 0.38, z, 0.37, 8, C.steel);
            B(out, -0.5, 0.5, 0.45, 1.05, -0.45, 0.45, C.yellow);
            B(out, -0.25, 0.25, 1.05, 1.55, -0.2, 0.2, C.black);
            B(out, -0.6, -0.55, 0.75, 1.0, -1.12, 1.12, C.yellow);
            B(out, 0.55, 0.6, 0.75, 1.0, -1.12, 1.12, C.yellow);
        });
        // A mini digger: tracks, body, cab and the arm folded over the front with its bucket down
        geo.digger = make(out => {
            B(out, -0.75, -0.4, 0.01, 0.45, -1.15, 1.15, C.black);
            B(out, 0.4, 0.75, 0.01, 0.45, -1.15, 1.15, C.black);
            B(out, -0.65, 0.65, 0.45, 1.25, -0.8, 0.7, C.yellow);
            B(out, -0.55, 0.35, 1.25, 2.3, -0.75, 0.1, C.glass);
            B(out, -0.6, 0.4, 2.3, 2.38, -0.8, 0.15, C.yellow);
            B(out, 0.4, 0.6, 1.0, 2.0, 0.6, 0.85, C.yellow);
            B(out, 0.42, 0.58, 0.35, 1.1, 0.9, 1.1, C.yellow);
            B(out, 0.3, 0.7, 0.05, 0.4, 0.85, 1.2, C.metal);
        });
        // A stack of pipes on two timber bearers: three and two on top, six-sided, open at the ends, 3 m along the road
        geo.pipes = make(out => {
            for (const z of [-1.0, 1.0]) B(out, -0.62, 0.62, 0.01, 0.09, z - 0.05, z + 0.05, C.wood);
            const r = 0.2;
            for (const [x, y] of [[-0.4, 0.29], [0, 0.29], [0.4, 0.29], [-0.2, 0.635], [0.2, 0.635]]) {
                for (let k = 0; k < 6; k++) {
                    const a0 = k * Math.PI / 3, a1 = (k + 1) * Math.PI / 3;
                    Roadworks.face(out, [x + r * Math.cos(a0), y + r * Math.sin(a0), -1.5], [x + r * Math.cos(a1), y + r * Math.sin(a1), -1.5], [x + r * Math.cos(a1), y + r * Math.sin(a1), 1.5], [x + r * Math.cos(a0), y + r * Math.sin(a0), 1.5], C.pipe);
                }
            }
        });
        // Kerb stones on a pallet: a full layer and a part layer
        geo.kerbs = make(out => {
            B(out, -0.4, 0.4, 0.01, 0.15, -0.6, 0.6, C.wood);
            B(out, -0.38, 0.38, 0.15, 0.4, -0.5, 0.5, C.concrete);
            B(out, -0.38, 0.12, 0.4, 0.65, -0.5, 0.5, C.concrete);
        });
        // Setts on a pallet: a banded block of them and a loose row on top
        geo.setts = make(out => {
            B(out, -0.4, 0.4, 0.01, 0.15, -0.6, 0.6, C.wood);
            B(out, -0.37, 0.37, 0.15, 0.72, -0.55, 0.55, C.granite);
            B(out, -0.37, 0.37, 0.72, 0.84, -0.2, 0.55, C.granite);
        });
        // A towed compressor: one axle, a green housing, the tow bar and its jockey leg
        geo.compressor = make(out => {
            B(out, -0.5, 0.5, 0.01, 0.5, -0.02, 0.38, C.black);
            B(out, -0.42, 0.42, 0.3, 1.15, -0.5, 0.9, C.green);
            B(out, -0.04, 0.04, 0.36, 0.44, -1.1, -0.5, C.metal);
            B(out, -0.03, 0.03, 0.01, 0.36, -1.02, -0.96, C.metal);
        });
        // The site cabin: a small hut on two skids, a door and a window on each long side
        geo.cabin = make(out => {
            for (const x of [-0.6, 0.45]) B(out, x, x + 0.15, 0.01, 0.12, -1.5, 1.5, C.metal);
            B(out, -0.75, 0.75, 0.12, 2.2, -1.5, 1.5, C.panel);
            B(out, -0.8, 0.8, 2.2, 2.28, -1.55, 1.55, C.white);
            for (const sign of [-1, 1]) {
                const x = sign * 0.755;
                const quad = (z0, z1, y0, y1, color) => (sign < 0
                    ? Roadworks.face(out, [x, y0, z1], [x, y1, z1], [x, y1, z0], [x, y0, z0], color)
                    : Roadworks.face(out, [x, y0, z0], [x, y1, z0], [x, y1, z1], [x, y0, z1], color));
                quad(-1.2, -0.4, 0.14, 2.0, C.grey);
                quad(0.1, 1.1, 1.1, 1.8, C.glass);
            }
        });
        // A portable toilet: a dark base, a blue cabin with its door toward -z, a white roof
        geo.toilet = make(out => {
            B(out, -0.57, 0.57, 0.01, 0.14, -0.57, 0.57, C.black);
            B(out, -0.55, 0.55, 0.14, 2.2, -0.55, 0.55, C.blue);
            B(out, -0.58, 0.58, 2.2, 2.3, -0.58, 0.58, C.white);
            Roadworks.face(out, [-0.35, 0.2, -0.555], [-0.35, 1.95, -0.555], [0.35, 1.95, -0.555], [0.35, 0.2, -0.555], C.white);
        });
        // A parked works van: its nose toward -z, a glazed cab, a box body and an amber bar on the roof
        geo.van = make(out => {
            for (const z of [-1.2, 1.2]) B(out, -0.75, 0.75, 0.01, 0.6, z - 0.3, z + 0.3, C.black);
            B(out, -0.72, 0.72, 0.3, 1.05, -1.9, 1.9, C.white);
            B(out, -0.7, 0.7, 1.05, 1.85, -1.2, 1.9, C.white);
            Roadworks.face(out, [-0.64, 1.1, -1.205], [-0.64, 1.75, -1.205], [0.64, 1.75, -1.205], [0.64, 1.1, -1.205], C.glass);
            Roadworks.face(out, [-0.705, 1.15, -0.4], [-0.705, 1.7, -0.4], [-0.705, 1.7, -1.15], [-0.705, 1.15, -1.15], C.glass);
            Roadworks.face(out, [0.705, 1.15, -1.15], [0.705, 1.7, -1.15], [0.705, 1.7, -0.4], [0.705, 1.15, -0.4], C.glass);
            B(out, -0.4, 0.4, 1.85, 1.93, -1.0, -0.85, C.orange);
        });
        // The portable sign's A frame; its triangle face is the atlas's (signFace)
        geo.sign = make(out => {
            for (const x of [-0.3, 0.3]) {
                B(out, x - 0.025, x + 0.025, 0.01, 1.3, -0.2, -0.15, C.metal);
                B(out, x - 0.025, x + 0.025, 0.01, 0.06, -0.2, 0.25, C.metal);
            }
            B(out, -0.33, 0.33, 0.55, 0.6, -0.17, -0.12, C.metal);
        });
        // The ridden surfaces from their profiles (the physics reads the same functions)
        const P = Roadworks.PROFILES;
        geo.plankRamp = make(out => {
            const { la, lc } = P.plankRamp, top = 0.5, low = 0.005;
            // The sloping deck, the square lip and the trestle's two sides
            Roadworks.face(out, [-lc, low, -la], [-lc, top, la], [lc, top, la], [lc, low, -la], C.wood);
            Roadworks.face(out, [lc, low, la], [lc, top, la], [-lc, top, la], [-lc, low, la], C.metal);
            Roadworks.tri(out, [-lc, low, -la], [-lc, low, la], [-lc, top, la], C.metal);
            Roadworks.tri(out, [lc, low, la], [lc, low, -la], [lc, top, la], C.metal);
        });
        geo.plateRamp = make(out => {
            const p = P.plateRamp;
            Roadworks.surface(out, (a, c) => p.h(Math.max(-p.la, Math.min(p.la, a)), Math.max(-p.lc, Math.min(p.lc, c))), [-2.2, -1.5, -0.8, -0.1, 0.6, 1.0, 1.4, 1.8, 2.2], p.lc, 5, C.gravel, (a, j) => (a < 0.6 && j > 0 && j < 4 ? C.steel : C.gravel));
        });
        geo.sandRamp = make(out => {
            const p = P.sandRamp;
            Roadworks.surface(out, (a, c) => p.h(Math.max(-p.la, Math.min(p.la, a)), Math.max(-p.lc, Math.min(p.lc, c))), [-2.6, -2.0, -1.4, -0.8, -0.2, 0.4, 1.0, 1.4, 1.8, 2.2, 2.6], p.lc, 4, C.sand);
        });
        geo.heap = make(out => {
            const p = P.heap;
            Roadworks.surface(out, (a, c) => p.h(Math.max(-p.la, Math.min(p.la, a)), Math.max(-p.lc, Math.min(p.lc, c))), [-1.25, -0.8, -0.4, 0, 0.4, 0.8, 1.25], p.lc, 4, C.gravel);
        });
        geo.plate = make(out => B(out, -0.75, 0.75, 0.005, 0.03, -1.2, 1.2, C.steel));
        // The lamp lens: an octagon facing -z
        geo.lamp = (() => {
            const out = { positions: [], shades: [] };
            for (let k = 0; k < 8; k++) {
                const a0 = k * Math.PI / 4, a1 = (k + 1) * Math.PI / 4, r = 0.085;
                for (const p of [[0, 0, 0], [r * Math.cos(a1), r * Math.sin(a1), 0], [r * Math.cos(a0), r * Math.sin(a0), 0]]) out.positions.push(p[0], p[1], p[2]);
                for (let i = 0; i < 3; i++) out.shades.push(1, 1, 1);
            }
            const geometry = RoadMesh.geometry(out.positions, out.shades);
            geometry.computeBoundingBox();
            return geometry;
        })();
        // The printed faces: the triangle (0.9 m a side, the printed face toward -z, a grey back) and the beacon board
        const printed = (quads) => {
            const pos = [], uv = [];
            for (const [corners, uvs] of quads) {
                const order = corners.length === 3 ? [0, 1, 2] : [0, 1, 2, 0, 2, 3];
                for (const i of order) { pos.push(...corners[i]); uv.push(...uvs[i]); }
            }
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
            geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
            geometry.computeVertexNormals();
            geometry.computeBoundingBox();
            geometry.computeBoundingSphere();
            return geometry;
        };
        const triangle = (y0, side) => {
            const h = side * Math.sqrt(3) / 2;
            const u = (px) => px / 256, v = (py) => 1 - py / 256;
            // Seen from -z the face's -x is on the viewer's right: the picture's right corner goes there
            const front = [[[0, y0 + h, -0.01], [-side / 2, y0, -0.01], [side / 2, y0, -0.01]], [[u(64), v(4)], [u(124), v(108)], [u(4), v(108)]]];
            const back = [[[0, y0 + h, 0.0], [side / 2, y0, 0.0], [-side / 2, y0, 0.0]], [[u(250), v(250)], [u(250), v(250)], [u(250), v(250)]]];
            return [front, back];
        };
        geo.triangle = printed(triangle(0.95, 0.9));
        geo.signFace = printed(triangle(0.55, 0.62).map(([corners, uvs]) => [corners.map(p => [p[0], p[1], p[2] - 0.16]), uvs]));
        geo.beaconBoard = (() => {
            const w = 0.125, y0 = 0.27, y1 = 1.27, d = 0.012;
            const u0 = 0.5, u1 = 0.75;
            // Both faces map the same world points to the same texels, so the chevrons point the same way seen from either
            return printed([
                [[[-w, y0, -d], [-w, y1, -d], [w, y1, -d], [w, y0, -d]], [[u0, 0], [u0, 1], [u1, 1], [u1, 0]]],
                [[[w, y0, d], [w, y1, d], [-w, y1, d], [-w, y0, d]], [[u1, 0], [u1, 1], [u0, 1], [u0, 0]]],
                [[[-w, y0, d], [-w, y1, d], [-w, y1, -d], [-w, y0, -d]], [[0.98, 0.02], [0.98, 0.02], [0.98, 0.02], [0.98, 0.02]]],
                [[[w, y0, -d], [w, y1, -d], [w, y1, d], [w, y0, d]], [[0.98, 0.02], [0.98, 0.02], [0.98, 0.02], [0.98, 0.02]]],
                [[[-w, y1, -d], [-w, y1, d], [w, y1, d], [w, y1, -d]], [[0.98, 0.02], [0.98, 0.02], [0.98, 0.02], [0.98, 0.02]]]
            ]);
        })();
        Roadworks.built = geo;
        return geo;
    }

    // Heights of the lamps' centres on the housing: red at the top, then amber, then green
    static get LAMP_Y() { return [2.42, 2.15, 1.88]; }

    // The lamp colours: lit over the bloom threshold, as a car's headlamps are; dark when off
    static get LAMPS() {
        return {
            red: { on: [3.2, 0.18, 0.1], off: [0.16, 0.03, 0.03] },
            amber: { on: [3.0, 1.5, 0.1], off: [0.16, 0.1, 0.02] },
            green: { on: [0.2, 2.8, 1.0], off: [0.03, 0.12, 0.06] }
        };
    }

    // Every element of every site placed in the world, and the meshes that draw them. Each element:
    // {kind, role, site, x, y, z, yaw, matrix, box: {hx, hz, y0, y1} in its own frame}
    build() {
        const geo = Roadworks.geometries();
        const route = this.route;
        const p = {};
        const elements = [];
        const place = (site, kind, s, lat, yaw, extra = {}) => {
            route.sample(Math.max(0, Math.min(route.length, s)), p);
            const box = geo[kind].boundingBox;
            // What stands in the closed lane lies on the road's grade (a heap or a ramp level on a 10% climb floated at one
            // end and sank at the other); the gates and the lights on the verge stand upright
            const tilt = kind !== 'gate' && kind !== 'triangle' && kind !== 'light';
            const element = {
                kind, role: Roadworks.ROLE[kind] || 'none', site, s, lat,
                x: p.x + lat * Math.cos(p.heading), y: p.y + RoadMesh.LIFT_M, z: p.z - lat * Math.sin(p.heading),
                yaw: p.heading + yaw, heading: p.heading, grade: tilt ? p.grade || 0 : 0,
                box: { x0: box.min.x, x1: box.max.x, z0: box.min.z, z1: box.max.z, y0: box.min.y, y1: box.max.y }, ...extra
            };
            elements.push(element);
            return element;
        };
        for (const site of this.sites) {
            site.elements = [];
            const keep = e => { site.elements.push(e); return e; };
            for (const gate of site.gates) {
                const yaw = gate.facing > 0 ? 0 : Math.PI;
                for (const sign of [Route.LEFT, Route.RIGHT]) {
                    const half = route.sample(gate.s, p).width / 2;
                    const lat = sign * (half + Roadworks.GROUP_OUT_M);
                    keep(place(site, 'gate', gate.s, lat, yaw));
                    // The triangle on the closed lane's side, in front of the boards toward the arriving traffic
                    if (sign === site.side) keep(place(site, 'triangle', gate.s, lat, yaw, { role: 'none' }));
                }
            }
            for (const light of site.lights) {
                const yaw = light.facing > 0 ? 0 : Math.PI;
                const body = keep(place(site, 'light', light.s, light.lat, yaw));
                body.direction = light.direction;
                light.element = body;
            }
            for (const item of site.items) {
                // A beacon turns so its chevrons point toward the open lane (the atlas's point toward its -x)
                const yaw = item.kind === 'beacon' ? (site.open === Route.LEFT ? Math.PI : 0) : item.yaw;
                const e = keep(place(site, item.kind, item.s, item.lat, yaw));
                if (item.kind === 'beacon') e.board = true;
                if (item.kind === 'sign') e.face = true;
            }
        }
        this.elements = elements;
        // The meshes, one for each kind, drawn only for the sites near the bike (update)
        // Plain materials, as the marker stones': the land's shading reads the model matrix, which an instance does not move
        const lambert = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
        const printed = new THREE.MeshLambertMaterial({ map: Roadworks.atlas(), side: THREE.DoubleSide });
        this.group = new THREE.Group();
        this.group.name = 'world-roadworks';
        this.meshes = {};
        const kinds = ['gate', 'triangle', 'light', 'beacon', 'beaconBoard', 'cone', 'planks', 'fence', 'pallets', 'roller', 'digger', 'sign', 'signFace', 'pipes', 'kerbs', 'setts', 'compressor', 'cabin', 'toilet', 'van', 'plankRamp', 'plateRamp', 'sandRamp', 'heap', 'plate'];
        const count = kind => elements.filter(e => e.kind === kind || (kind === 'beaconBoard' && e.board) || (kind === 'signFace' && e.face)).length;
        for (const kind of kinds) {
            const n = count(kind);
            if (!n) continue;
            const material = kind === 'triangle' || kind === 'beaconBoard' || kind === 'signFace' ? printed : lambert;
            const mesh = new THREE.InstancedMesh(geo[kind], material, n);
            mesh.name = `roadworks:${kind}`;
            mesh.count = 0;
            mesh.frustumCulled = false;
            mesh.userData.skipCulling = true;
            mesh.userData.world = 'roadworks';
            this.meshes[kind] = mesh;
            this.group.add(mesh);
        }
        // The lamps: three to a light, their colours switched in place (no new material, no new program)
        const lights = elements.filter(e => e.kind === 'light');
        if (lights.length) {
            const lamps = new THREE.InstancedMesh(geo.lamp, new THREE.MeshBasicMaterial({ toneMapped: false }), lights.length * 3);
            lamps.name = 'roadworks:lamps';
            lamps.count = 0;
            lamps.frustumCulled = false;
            lamps.userData.skipCulling = true;
            const off = new THREE.Color(0, 0, 0);
            for (let i = 0; i < lights.length * 3; i++) lamps.setColorAt(i, off);
            this.meshes.lamps = lamps;
            this.group.add(lamps);
        }
        this.group.visible = false;
        this.near = [];
        this.placedKey = null;
    }

    // An element's matrix: its place and yaw on the road's grade (its frame's up the road's normal), tipped over by its
    // knock (a light thing knocked flat)
    static matrixOf(e, out) {
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), e.yaw);
        if (e.grade) {
            const h = e.heading;
            const lateral = new THREE.Vector3(Math.cos(h), 0, -Math.sin(h));
            const along = new THREE.Vector3(Math.sin(h), e.grade, Math.cos(h)).normalize();
            const normal = new THREE.Vector3().crossVectors(along, lateral).normalize();
            const road = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(lateral, normal, along));
            q.copy(road.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), e.yaw - h)));
        }
        const position = new THREE.Vector3(e.x, e.y, e.z);
        if (e.knock) {
            const k = e.knock;
            const t = Math.min(1, k.t / 0.35);
            const angle = (Math.PI / 2 - 0.08) * Roadworks.smooth(t);
            // About the horizontal axis square to the push, at the foot, and slid along the push
            const axis = new THREE.Vector3(Math.cos(k.heading), 0, -Math.sin(k.heading));
            q.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, angle));
            position.x += Math.sin(k.heading) * 0.4 * t;
            position.z += Math.cos(k.heading) * 0.4 * t;
        }
        return out.compose(position, q, new THREE.Vector3(1, 1, 1));
    }

    // Draws the sites within REACH_M of (x, z) and no others, and keeps the lamps and the repair surface on the sites
    // drawn. Rewrites the instances only when the set changes or something was knocked over
    place(x, z, reach = Roadworks.REACH_M) {
        if (!this.group) return;
        const near = this.sites.filter(site => site.elements.some(e => Math.hypot(e.x - x, e.z - z) < reach));
        const key = near.map(site => site.id).join(',');
        if (key !== this.placedKey || this.knocking) {
            this.placedKey = key;
            this.near = near;
            this.knocking = false;
            const matrix = new THREE.Matrix4();
            const counts = {};
            for (const kind of Object.keys(this.meshes)) counts[kind] = 0;
            const set = (kind, e) => {
                const mesh = this.meshes[kind];
                if (!mesh) return;
                mesh.setMatrixAt(counts[kind]++, Roadworks.matrixOf(e, matrix));
            };
            for (const site of near) {
                for (const e of site.elements) {
                    if (e.knock && e.knock.t < 0.35) this.knocking = true;
                    set(e.kind, e);
                    if (e.board) set('beaconBoard', e);
                    if (e.face) set('signFace', e);
                }
            }
            for (const [kind, mesh] of Object.entries(this.meshes)) {
                if (kind === 'lamps') continue;
                mesh.count = counts[kind];
                mesh.instanceMatrix.needsUpdate = true;
            }
            this.group.visible = near.length > 0;
            this.lampsDirty = true;
            if (typeof RoadSurface !== 'undefined' && RoadSurface.setWorks) RoadSurface.setWorks(near.filter(site => site.closed).slice(0, 2));
        }
        if (this.lampsDirty) this.writeLamps();
    }

    // The lamps of the lights drawn: each light's state in its colours
    writeLamps() {
        this.lampsDirty = false;
        const lamps = this.meshes && this.meshes.lamps;
        if (!lamps) return;
        const L = Roadworks.LAMPS;
        const matrix = new THREE.Matrix4(), local = new THREE.Matrix4(), color = new THREE.Color();
        let i = 0;
        for (const site of this.near) {
            for (const light of site.lights) {
                const e = light.element;
                const state = this.light(site, light.direction);
                Roadworks.matrixOf(e, matrix);
                ['red', 'amber', 'green'].forEach((name, k) => {
                    local.makeTranslation(0, Roadworks.LAMP_Y[k], -0.115);
                    lamps.setMatrixAt(i, local.clone().premultiply(matrix));
                    const lit = name === state ? L[name].on : L[name].off;
                    lamps.setColorAt(i, color.setRGB(lit[0], lit[1], lit[2]));
                    i++;
                });
            }
        }
        lamps.count = i;
        lamps.instanceMatrix.needsUpdate = true;
        if (lamps.instanceColor) lamps.instanceColor.needsUpdate = true;
    }

    // One step of the world: the lights' timers, and what is drawn round the bike
    update(position, dtSec = 0) {
        this.step(dtSec);
        for (const site of this.near || []) {
            for (const e of site.elements) if (e.knock && e.knock.t < 0.35) { e.knock.t += dtSec; this.knocking = true; }
        }
        if (position) this.place(position.x, position.z);
    }

    // A rider put down at s (a restart in place, a debug skip): where that is inside a single lane, its lights go
    // to green the rider's way, as for a rider who had entered on green. The traffic is moved out of every single
    // lane at the same time (Traffic.clearOfRoadworks), so nothing comes the other way in the lane
    admit(s) {
        const site = this.siteAt(s);
        if (!site) return null;
        site.timer = { index: 0, left: Roadworks.GREEN_S, started: true };
        this.lampsDirty = true;
        return site;
    }

    // A restart: every knocked thing stands again
    reset() {
        this.riderS = undefined;
        this.riderDirection = 1;
        for (const e of this.elements || []) e.knock = null;
        this.knocking = true;
    }

    // The height of an element's foot under (x, z): its own on the road's grade
    static baseY(e, x, z) {
        return e.y + e.grade * ((x - e.x) * Math.sin(e.heading) + (z - e.z) * Math.cos(e.heading));
    }

    // (x, z) in an element's frame: {a along, c across}
    static local(e, x, z) {
        const dx = x - e.x, dz = z - e.z;
        const cos = Math.cos(e.yaw), sin = Math.sin(e.yaw);
        return { c: dx * cos - dz * sin, a: dx * sin + dz * cos };
    }

    // The gap from (x, z) to an element's box in plan (0 inside)
    static gap(e, x, z) {
        const { a, c } = Roadworks.local(e, x, z);
        const dc = Math.max(e.box.x0 - c, 0, c - e.box.x1);
        const da = Math.max(e.box.z0 - a, 0, a - e.box.z1);
        return Math.hypot(dc, da);
    }

    // The elements of the sites within `reach` of (x, z)
    nearElements(x, z, reach = 30) {
        const out = [];
        for (const site of this.sites) {
            if (!site.elements) continue;
            const mid = site.elements[0];
            if (!mid || Math.hypot(mid.x - x, mid.z - z) > (site.length || 30) + reach) continue;
            for (const e of site.elements) out.push(e);
        }
        return out;
    }

    // The top of the ridden surfaces at (x, z), absolute, or null where none is
    surfaceAt(x, z, list = null) {
        let best = null;
        const P = Roadworks.PROFILES;
        for (const e of list || this.nearElements(x, z)) {
            if (e.role !== 'surface') continue;
            const { a, c } = Roadworks.local(e, x, z);
            const h = P[e.kind].h(a, c);
            if (h === null) continue;
            const y = Roadworks.baseY(e, x, z) + h;
            if (best === null || y > best) best = y;
        }
        return best;
    }

    // Contact for the rider's bike, after Vehicle.update has moved it: the ridden surfaces, the light things it knocks,
    // the heavy ones it hits, and the red light it runs
    ride(vehicle, dt) {
        if (!this.elements || vehicle.crashed || !(dt > 0)) return;
        const pos = vehicle.position;
        const list = this.nearElements(pos.x, pos.z);
        this.redLight(vehicle);
        if (!list.length) { vehicle.roadworksSurface = null; return; }
        const r = Roadworks.BIKE_R;
        for (const e of list) {
            if (e.role !== 'light' && e.role !== 'heavy') continue;
            if (e.knock) continue;
            if (pos.y >= Roadworks.baseY(e, pos.x, pos.z) + e.box.y1 - 0.05) continue;
            if (Roadworks.gap(e, pos.x, pos.z) > r) continue;
            if (e.role === 'light') {
                e.knock = { t: 0, heading: vehicle.yawAngle };
                this.knocking = true;
                vehicle.speed *= Roadworks.KNOCK_KEEP[e.kind] || 0.9;
                vehicle.roadworksWobble = (vehicle.roadworksWobble || 0) + (Math.random() < 0.5 ? -1 : 1) * 0.12;
                continue;
            }
            const names = Roadworks.NAMES;
            const dx = pos.x - e.x, dz = pos.z - e.z, len = Math.hypot(dx, dz) || 1;
            vehicle.velocity.set(dx / len * vehicle.speed * 0.5, 2, dz / len * vehicle.speed * 0.5);
            vehicle.isJumping = false;
            vehicle.worldCrash(`Hit the ${names[e.kind] || 'roadworks'}`, null, 'obstacle');
            if (vehicle.blockRider) vehicle.blockRider(e.x, e.z, Math.min(e.box.x1 - e.box.x0, e.box.z1 - e.box.z0) / 2);
            vehicle.roadworksSurface = null;
            return;
        }
        if (vehicle.roadworksWobble) vehicle.roadworksWobble *= Math.exp(-4 * dt);
        this.surfaces(vehicle, dt, list);
    }

    // The ridden surfaces: on one, the bike stands on it as drawn; it leaves it where following it would ask more than
    // LEAVE_G of it downward (a lip, a crest taken fast), with the vertical speed the surface was giving it. In the air,
    // a surface under the bike is landed on as the road is (Vehicle.land and its rules)
    surfaces(vehicle, dt, list) {
        const pos = vehicle.position;
        const top = this.surfaceAt(pos.x, pos.z, list);
        // A surface the bike was on a frame ago and not here now (a restart moved it) is forgotten
        let was = vehicle.roadworksSurface;
        if (was && Math.hypot(pos.x - was.x, pos.z - was.z) > Math.max(3, vehicle.speed * dt * 3)) was = vehicle.roadworksSurface = null;
        if (vehicle.isJumping) {
            vehicle.roadworksSurface = null;
            if (top !== null && vehicle.jumpVelocityY < 0 && pos.y <= top) vehicle.land(top);
            return;
        }
        if (top === null && !was) return;
        const road = vehicle.surfaceAt(pos.x, pos.z);
        const ground = top === null ? road : Math.max(top, road);
        if (!was) {
            // Onto a surface from the road
            if (top !== null && top > pos.y - 0.3) {
                vehicle.roadworksSurface = { y: top, vy: 0, x: pos.x, z: pos.z, road };
                pos.y = top;
            }
            return;
        }
        const vy = (ground - was.y) / dt;
        const moving = vehicle.speed > 0.5;
        // A plate's 3 cm edge is a step down, not a jump: the bike leaves only what stands clear of the road or rises
        // from it. Both are measured from the road, which climbs or falls under the surface itself: on a climb a flat
        // plate rises as fast as the road does, and read alone that threw the bike off its far edge
        const climb = (road - was.road) / dt;
        const clear = was.y - was.road > 0.08 || was.vy - climb > 0.5;
        if (moving && clear && was.vy - vy > Roadworks.LEAVE_G * dt) {
            // Airborne at the speed the surface gave it: the jump's own flight, landing and scoring take over
            vehicle.isJumping = true;
            vehicle.jumpStartHeight = was.y;
            vehicle.jumpVelocityY = was.vy;
            vehicle.jumpRotation = 0;
            vehicle.jumpAngularVel = 0;
            vehicle.jumpWheelSpin = Math.min(vehicle.speed / 50, 0.4);
            pos.y = was.y + was.vy * dt;
            vehicle.roadworksSurface = null;
            vehicle.rampPitch = 0;
            return;
        }
        if (top === null) {
            vehicle.roadworksSurface = null;
            vehicle.rampPitch = 0;
            return;
        }
        pos.y = top;
        // The pitch over the road's own (Vehicle.updateMesh adds it to the road's grade)
        vehicle.rampPitch = Math.atan2(vy - climb, Math.max(0.5, vehicle.speed));
        vehicle.roadworksSurface = { y: top, vy, x: pos.x, z: pos.z, road };
    }

    // The rider as the traffic and the lights read it near a single lane: {s, direction, half, rider}, or null away from
    // every site. Traffic keeps its queue gap behind a rider who waits at a light (a car drove on to its place at the
    // line through the bike), and the lights hold their all-red phase while the rider is still in the lane (the far
    // light went green and sent traffic in head-on, which on a long site every rider met)
    riderEntry() {
        const s = this.riderS;
        if (s === null || s === undefined) return null;
        const direction = this.riderDirection || 1;
        return this.siteAhead(s, direction, Roadworks.RIDER_QUEUE_M) ? { vehicle: null, s, direction, half: Roadworks.BIKE_HALF_M, rider: true } : null;
    }

    // A rider who passes a stop line toward increasing s while its light is red has run it: the style cost and a callout
    redLight(vehicle) {
        const s = vehicle.projection && vehicle.projection.index >= 0 ? vehicle.projection.s : null;
        const before = this.riderS;
        this.riderS = s;
        // (the way the rider goes along the ride, for the traffic: riderEntry)
        if (s !== null && before !== null && before !== undefined && s !== before && Math.abs(s - before) <= 5) this.riderDirection = Math.sign(s - before);
        if (s === null || before === null || before === undefined || s <= before || s - before > 5) return;
        for (const site of this.closed) {
            if (before < site.stopIn && s >= site.stopIn && this.light(site, 1) === 'red') this.events.push({ kind: 'red', site: site.id });
        }
    }
}
