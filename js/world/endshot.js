// EndShot: a leg's end as one shot (the owner, 2026-11-27: "at the end of the stage, i want the game to take over the
// riding and actually ride me in to the parking spot (hopefully with the others if they've kept up) and then position
// the camera for the great view all in one smooth, continuous camera shot"). No THREE and no DOM: StopScene builds it,
// Game draws what it gives.
//
// What it plans, once, as the scene starts (the clock has stopped at the line):
//   - who comes in (keep): the player, and each rider of the group that kept up, within keepM and keepS of the player
//     at the line (behind it, or ahead of it and not more than aheadPastM past the stop's turn-in). The others never
//     show in the shot.
//   - the bays (bays): a tidy row of the stop's own slots (manifest.stops[].slots, the one table the start of the next
//     leg reads too), one bay a rider, faced toward the view where the area has room behind the row for an aisle,
//     filled from the far end of the aisle in, so nobody rides behind a bay that someone is turning into.
//   - each rider's way (wayOf): from where it is, on the right half of the road (or round, for a stop behind it), the
//     stop's own path in, along the aisle behind the row, and forward into its bay; the corners rounded (chaikin) and
//     the way read every stepM metres with its heading and its bend.
//   - the ride in (ride): every rider at once, frame by frame at frameHz, at a calm pace for the player (its own pace,
//     at most crewMostMs, for the group): no faster than the bend allows (latMs2), braking for the bay, and never
//     closer to a bike ahead of it than followGapM (parkedGapM to one parked). Leaned as the bend and the speed ask.
//   - the view (views, compose): the way the land opens furthest from the bays (or the stop's own view: a lookout's,
//     a photo's hold), and a camera behind and beside the bays that holds them in the lower third, to one side of the
//     picture (the card comes up on the other), every bike and rider in the picture and in a clear line from the eye,
//     and the view in front clear of walls and houses. A stop's own `shot` (or EndShot.SHOTS) sets it by hand.
//   - the camera (Camera): the chase camera's own pose at the line, eased onto a follow camera behind the player as it
//     rides in (its boom drawn in short of a wall, a house or the land), then craned to the composed view once the
//     player is about to park, over an arc high enough to clear what lies between. It holds there; the card fades in
//     once it has held for holdFirstS and everyone has parked.
class EndShot {
    static get TUNING() {
        return EndShot.tuning || (EndShot.tuning = Object.freeze({
            // Who comes in: a rider behind the player at the line within keepM and keepS of riding at its own speed
            // (at least keepLeastMs); one ahead of it no more than aheadPastM past the turn-in
            keepM: 300, keepS: 20, keepLeastMs: 8, aheadPastM: 150,
            // The pace: the player calmMs (a long way in is ridden in longMostS at the most), the group its own pace from
            // calmMs to crewMostMs, a long way at most longMostMs; speeding up at gainMs2, easing down at brakeMs2 (more where the line was crossed fast
            // and close to the bay), round a bend at latMs2 across, never under leastMs until the bay
            calmMs: 8, crewMostMs: 16, longMostS: 24, longMostMs: 22, gainMs2: 2, brakeMs2: 3, latMs2: 2.2, leastMs: 1.4,
            // Following: a bike that stands within followClearM of a rider's way ahead is kept followGapM off along the way
            // (parkedGapM when it is parked), braking at followMs2
            followGapM: 6, parkedGapM: 2.6, followMs2: 4, followClearM: 1.5,
            // The aisle behind the bays: aisleM behind their middles (the least that fits, from aisles), a bay turned into
            // from turnM along it; round a row's end roundM past the last bay; the way keeps marginM inside the area
            aisles: [3.6, 3.0, 2.5], turnM: 2.4, roundM: 2.8, marginM: 0.4,
            // The way: read every stepM metres, its corners rounded by `smooth` passes
            stepM: 0.5, smooth: 3,
            // The ride's first blendS seconds ease the heading from the bike's own; the lean follows at leanRate, at
            // most leanMost
            blendS: 0.8, leanRate: 6, leanMost: 0.6,
            // The follow camera: joinS from the chase camera, its boom turned after the bike at turnRate (at most
            // turnMostDegS), hung from headM
            // over the bike, looking lookAheadM ahead at lookUpM over it; drawn in at boomIn, out at boomOut, clearM short
            // of a wall or the land, read where it is and where it will be foreseeS on
            joinS: 2.5, turnRate: 2.2, turnMostDegS: 50, headM: 1.2, lookUpM: 1.0, lookAheadM: 4, boomIn: 4, boomOut: 1.5, clearM: 0.6, foreseeS: 0.8,
            // The crane: from craneLeadS before the player parks, at craneMs on average and turning at craneTurnDegS
            // (craneLeastS to craneMostS), up
            // by the least of `arcs` that clears the land, the walls and the houses on the way
            craneLeadS: 2.5, craneLeastS: 6, craneMostS: 14, craneMs: 5, craneTurnDegS: 25, arcs: [0, 2, 4, 7, 11, 16, 24, 35],
            // The composed view: hfov across; the bays' middle at groupY (picture height, -1 the foot) and sideX to one
            // side; the view at most yawMostDeg from the way the land opens; pitched pitchLeastDeg to pitchMostDeg; tried
            // at these distances back, heights over the bays and shifts across
            hfov: 60, groupY: -0.4, sideX: 0.38, yawMostDeg: 30, pitchLeastDeg: -16, pitchMostDeg: 4,
            distances: [12, 15, 19, 24, 30, 38], heights: [3, 4.5, 6.5, 9], shifts: [0, 5, -5, 10, -10],
            // The eye keeps eyeClearM over the land when composed; the card waits holdFirstS on the held view
            eyeClearM: 2, holdFirstS: 1,
            // The ride is planned at frameHz for at most mostS
            frameHz: 60, mostS: 120
        }));
    }

    // A stop's composed view set by hand, by stop id: {x, z, upM, bearing, pitch, hfov} (bearing degrees from north,
    // clockwise; pitch degrees, down negative), as StopScene.HOLDS. A stop's own data may carry one as `shot`
    static get SHOTS() { return Object.freeze({}); }

    // The ease of a blend, 0 to 1: its first and second derivatives are 0 at both ends
    static ease(u) {
        const x = Math.max(0, Math.min(1, u));
        return x * x * x * (x * (6 * x - 15) + 10);
    }

    static turn(a, b) {
        let d = (b - a) % (2 * Math.PI);
        if (d > Math.PI) d -= 2 * Math.PI;
        if (d < -Math.PI) d += 2 * Math.PI;
        return d;
    }

    static inside(ring, x, z) {
        let c = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const [xi, zi] = ring[i], [xj, zj] = ring[j];
            if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
        }
        return c;
    }

    // How far (x, z) is from the outline
    static edgeM(ring, x, z) {
        let best = Infinity;
        for (let i = 0; i + 1 < ring.length; i++) {
            const [ax, az] = ring[i], [bx, bz] = ring[i + 1];
            const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz;
            const u = l > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l)) : 0;
            best = Math.min(best, Math.hypot(x - ax - dx * u, z - az - dz * u));
        }
        return best;
    }

    // A polyline [{x, z}] inside the outline by `margin` everywhere (read every half metre)
    static within(ring, pts, margin) {
        for (let i = 0; i + 1 < pts.length; i++) {
            const a = pts[i], b = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.5));
            for (let k = 0; k <= n; k++) {
                const x = a.x + (b.x - a.x) * k / n, z = a.z + (b.z - a.z) * k / n;
                if (!EndShot.inside(ring, x, z) || EndShot.edgeM(ring, x, z) < margin) return false;
            }
        }
        return true;
    }

    // Who comes in. `player` {s, speed}; `crew` [{s, speed}]; `stop` {s, keepLine}. True for each rider that kept up
    static keep(stop, player, crew) {
        const T = EndShot.TUNING;
        return crew.map((r) => {
            if (!Number.isFinite(r.s)) return false;
            const gap = player.s - r.s;
            if (gap >= 0) return gap <= Math.min(T.keepM, T.keepS * Math.max(T.keepLeastMs, r.speed || 0));
            // (ahead of the player: still short of the turn-in, or not far past it; a stop behind the line is ridden
            // back to by everyone)
            return -gap <= T.keepM && (stop.keepLine || r.s <= stop.s + T.aheadPastM);
        });
    }

    // The bays for n riders at a stop, and the way along the aisle into each. `toward` {x, z}: the way the view lies
    // (a unit vector) or null. Returns {bays: [{x, z, heading}] in the order they fill, approach(k, from) the points
    // from the entry `from` ({x, z}, the last of the stop's path outside the row) to bay k, entry (that point's index
    // in stop.path), aisle (m), facing (+1 the slots' own heading, -1 turned round), fallback (no aisle fitted)}.
    // The bays are the stop's slots (manifest.stops[].slots): the start of the next leg parks its riders in the same
    static bays(stop, n, toward = null) {
        const T = EndShot.TUNING;
        const slots = stop.slots;
        const h = slots[0].heading, nx = Math.sin(h), nz = Math.cos(h), ax = Math.cos(h), az = -Math.sin(h);
        const o = slots[0];
        const u = p => (p.x - o.x) * ax + (p.z - o.z) * az, v = p => (p.x - o.x) * nx + (p.z - o.z) * nz;
        const at = (uu, vv) => ({ x: o.x + uu * ax + vv * nx, z: o.z + uu * az + vv * nz });
        // (the row of slot 0, the middle of the area's long axis: tools/world/stops.mjs slotsIn)
        const row = slots.filter(s => Math.abs(v(s)) < 0.5).sort((a, b) => u(a) - u(b));
        const count = Math.max(1, Math.min(n, row.length));
        let first = 0, cost = Infinity;
        for (let i = 0; i + count <= row.length; i++) {
            const mid = Math.abs((u(row[i]) + u(row[i + count - 1])) / 2);
            if (mid < cost - 1e-9) { cost = mid; first = i; }
        }
        const chosen = row.slice(first, first + count);
        const us = chosen.map(u), lo = Math.min(...us), hi = Math.max(...us), mid = (lo + hi) / 2;
        const path = stop.path.map(([x, z]) => ({ x, z }));
        const ring = stop.ring;
        const prefer = toward ? (toward.x * nx + toward.z * nz >= 0 ? 1 : -1) : 1;
        for (const f of [prefer, -prefer]) {
            for (const aisle of T.aisles) {
                const va = -f * aisle;
                // The entry: the last point of the path outside the box of the bays and the aisle
                const box = p => u(p) > lo - 1.5 && u(p) < hi + 1.5 && v(p) > Math.min(0, va) - 1 && v(p) < Math.max(0, va) + 1;
                let entry = path.length - 1;
                while (entry > 0 && box(path[entry])) entry--;
                const e = path[entry];
                if (box(e)) continue;
                // Onto the aisle: straight across from the aisle's own side or past the row's ends, else round an end
                const pu = u(e), pv = v(e);
                const lead = [];
                let uin;
                const past = pu < lo - 1.2 || pu > hi + 1.2;
                if (Math.sign(pv) === -f || Math.abs(pv) < 0.01 || past) {
                    uin = Math.max(lo - T.roundM, Math.min(hi + T.roundM, pu));
                } else {
                    uin = pu >= mid ? hi + T.roundM : lo - T.roundM;
                    lead.push(at(uin, pv));
                }
                lead.push(at(uin, va));
                const order = chosen.map((s, k) => k).sort((a, b) => Math.abs(us[b] - uin) - Math.abs(us[a] - uin) || us[a] - us[b]);
                const approach = (k, from = e) => {
                    const uk = us[k], d = uk >= uin ? 1 : -1, pts = [from, ...lead];
                    if (Math.abs(uk - uin) > T.turnM) pts.push(at(uk - d * T.turnM, va));
                    pts.push(at(uk, va), at(uk, 0));
                    return pts;
                };
                // (inside the area from where the way meets the aisle or goes round the row's end: the entry itself may be on the
                // road)
                if (!chosen.every((s, k) => EndShot.within(ring, approach(k).slice(1), T.marginM))) continue;
                const heading = f > 0 ? h : h + Math.PI;
                return {
                    bays: order.map(k => ({ x: chosen[k].x, z: chosen[k].z, heading: Math.atan2(Math.sin(heading), Math.cos(heading)) })),
                    approach: (k, from = e) => approach(order[k], from),
                    entry, aisle, facing: f, fallback: false
                };
            }
        }
        // No aisle fits: in along the stop's path, then into each bay from behind it (the slots' own heading)
        return {
            bays: chosen.map(s => ({ x: s.x, z: s.z, heading: s.heading })),
            approach: (k, from = path[path.length - 1]) => [from, { x: chosen[k].x - nx * 3, z: chosen[k].z - nz * 3 }, { x: chosen[k].x, z: chosen[k].z }],
            entry: path.length - 1, aisle: 0, facing: 1, fallback: true
        };
    }

    // The ride from fromS to the stop's turn-in on the right half of the road (from `from`, the rider's own place, the
    // half joined joinM on), turned round turnM past where it is for a stop behind it (or at `turnAt`, where the group
    // turns round together, so every rider turns in the same place and follows the one ahead): [{x, z, y, s}] (y the road's
    // own height, s its place on the ride)
    static roadPart(stop, route, fromS, from, joinM = 14, turnM = 12, turnAt = null) {
        const pts = [];
        const p = {};
        if (from) { route.sample(fromS, p); pts.push({ x: from.x, z: from.z, y: p.y, s: fromS }); }
        const join = from ? joinM : 0;
        const at = (s, lane) => { route.sample(s, p); return { x: p.x + lane * Math.cos(p.heading), z: p.z - lane * Math.sin(p.heading), y: p.y, s }; };
        if (fromS > stop.s + 1) {
            route.sample(fromS, p);
            const w = p.width / 4, turn = Number.isFinite(turnAt) ? Math.max(turnAt, fromS + 1) : fromS + turnM;
            for (let s = fromS + Math.min(join, turnM / 2); s < turn; s += 2) pts.push(at(s, -w));
            for (let k = 0; k <= 8; k++) {
                const a = (Math.PI * k) / 8;
                route.sample(turn, p);
                const lane = -w * Math.cos(a), ahead = w * Math.sin(a);
                pts.push({ x: p.x + lane * Math.cos(p.heading) + ahead * Math.sin(p.heading), z: p.z - lane * Math.sin(p.heading) + ahead * Math.cos(p.heading), y: p.y, s: turn });
            }
            for (let s = turn; s > stop.s; s -= 2) pts.push(at(s, w));
        } else {
            for (let s = fromS + join; s < stop.s; s += 2) { route.sample(s, p); pts.push(at(s, -p.width / 4)); }
        }
        return pts;
    }

    // A polyline's corners rounded by `passes` of corner cutting (its ends kept), read every `step` metres:
    // {x, z, y, s, h (heading), k (bend, 1/m), m} arrays and the length (y and s as its points carry them, else NaN)
    static smoothWay(raw, passes = EndShot.TUNING.smooth, step = EndShot.TUNING.stepM) {
        const mix = (a, b, u) => ({ x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u, y: a.y + (b.y - a.y) * u, s: a.s + (b.s - a.s) * u });
        let pts = [];
        for (const q of raw) if (!pts.length || Math.hypot(q.x - pts[pts.length - 1].x, q.z - pts[pts.length - 1].z) > 0.05) pts.push(q);
        for (let k = 0; k < passes && pts.length > 2; k++) {
            const out = [pts[0]];
            for (let i = 0; i + 1 < pts.length; i++) {
                const a = pts[i], b = pts[i + 1];
                if (i > 0) out.push(mix(a, b, 0.25));
                if (i + 2 < pts.length) out.push(mix(a, b, 0.75));
            }
            out.push(pts[pts.length - 1]);
            pts = out;
        }
        // (read every step metres along it)
        const cum = [0];
        for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
        const length = cum[cum.length - 1];
        const n = Math.max(2, Math.ceil(length / step) + 1);
        const x = new Float64Array(n), z = new Float64Array(n), y = new Float64Array(n), ss = new Float64Array(n), m = new Float64Array(n), hh = new Float64Array(n), k = new Float64Array(n);
        let j = 0;
        for (let i = 0; i < n; i++) {
            const at = Math.min(length, (i * length) / (n - 1));
            while (j + 2 < cum.length && cum[j + 1] < at) j++;
            const span = cum[j + 1] - cum[j], u = span > 0 ? (at - cum[j]) / span : 0;
            const a = pts[j], b = pts[Math.min(pts.length - 1, j + 1)];
            x[i] = a.x + (b.x - a.x) * u;
            z[i] = a.z + (b.z - a.z) * u;
            y[i] = a.y + (b.y - a.y) * u;
            ss[i] = a.s + (b.s - a.s) * u;
            m[i] = at;
        }
        for (let i = 0; i < n; i++) {
            const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
            hh[i] = Math.atan2(x[b] - x[a], z[b] - z[a]);
        }
        // (the bend over 1.5 m either side)
        const span = Math.max(1, Math.round(1.5 / (length / (n - 1) || step)));
        for (let i = 0; i < n; i++) {
            const a = Math.max(0, i - span), b = Math.min(n - 1, i + span);
            k[i] = b > a ? EndShot.turn(hh[a], hh[b]) / Math.max(1e-6, m[b] - m[a]) : 0;
        }
        return { x, z, y, s: ss, h: hh, k, m, n, length };
    }

    // How far along a way from m (within `look` metres) it first comes within `clear` of (x, z), or null
    static reach(way, m, look, x, z, clear) {
        const d = way.length / (way.n - 1 || 1);
        const i0 = Math.max(0, Math.floor(m / d)), i1 = Math.min(way.n - 1, Math.ceil((m + look) / d));
        for (let i = i0; i <= i1; i++) {
            if (Math.hypot(way.x[i] - x, way.z[i] - z) < clear) return Math.max(0, i * d - m);
        }
        return null;
    }

    // The way at m metres: {x, z, y, s, h, k}
    static wayAt(way, at, out = {}) {
        const n = way.n, d = way.length / (n - 1 || 1);
        const f = Math.max(0, Math.min(n - 1, d > 0 ? at / d : 0));
        const i = Math.min(n - 2, Math.floor(f)), u = f - i;
        out.x = way.x[i] + (way.x[i + 1] - way.x[i]) * u;
        out.z = way.z[i] + (way.z[i + 1] - way.z[i]) * u;
        out.y = way.y[i] + (way.y[i + 1] - way.y[i]) * u;
        out.s = way.s[i] + (way.s[i + 1] - way.s[i]) * u;
        out.h = way.h[i] + EndShot.turn(way.h[i], way.h[i + 1]) * u;
        out.k = way.k[i] + (way.k[i + 1] - way.k[i]) * u;
        return out;
    }

    // The most speed at each point of a way: the bend's (latMs2 across), and braking at `brake` for what follows, to a
    // stop at its end
    static caps(way, brake) {
        const T = EndShot.TUNING, n = way.n, cap = new Float64Array(n);
        for (let i = 0; i < n; i++) cap[i] = Math.max(T.leastMs, Math.sqrt(T.latMs2 / Math.max(1e-4, Math.abs(way.k[i]))));
        cap[n - 1] = 0;
        for (let i = n - 2; i >= 0; i--) cap[i] = Math.min(cap[i], Math.sqrt(cap[i + 1] * cap[i + 1] + 2 * brake * (way.m[i + 1] - way.m[i])));
        return cap;
    }

    // The ride in of every rider at once: riders [{way, v0, cruise, h0, lean0, parked}] in the order they arrive (the first
    // leads). Returns {hz, frames, tracks: [Float32Array of frames x 6: x, z, heading, speed, lean, m], parkedAt: [s]}
    static ride(riders) {
        const T = EndShot.TUNING, dt = 1 / T.frameHz, g = 9.81;
        const state = riders.map((r) => {
            const way = r.way;
            // (braking hard enough to make every bend and the bay from the speed it starts at)
            const raw = EndShot.caps(way, 1e9);
            let brake = T.brakeMs2;
            for (let i = 1; i < way.n; i++) if (r.v0 > raw[i]) brake = Math.max(brake, (r.v0 * r.v0 - raw[i] * raw[i]) / (2 * Math.max(0.5, way.m[i])));
            // (a rider parked already, `parked`: in its bay from the start)
            if (r.parked) return { r, way, cap: raw, m: way.length, v: 0, lean: 0, parked: true, at: {}, parkedAt: 0, track: [] };
            return { r, way, cap: EndShot.caps(way, brake * 1.02), m: 0, v: Math.max(0, r.v0), lean: r.lean0 || 0, parked: false, at: {}, parkedAt: Infinity, track: [] };
        });
        const most = Math.ceil(T.mostS * T.frameHz);
        let frame = 0;
        const capAt = (st, m) => {
            const way = st.way, d = way.length / (way.n - 1 || 1), f = Math.max(0, Math.min(way.n - 1, m / d)), i = Math.min(way.n - 2, Math.floor(f));
            return st.cap[i] + (st.cap[i + 1] - st.cap[i]) * (f - i);
        };
        const record = (st, t) => {
            const at = EndShot.wayAt(st.way, st.m, st.at);
            const w = 1 - EndShot.ease(t / T.blendS);
            const heading = at.h + EndShot.turn(at.h, Number.isFinite(st.r.h0) ? st.r.h0 : at.h) * w;
            st.track.push(at.x, at.z, heading, st.v, st.lean, st.m);
        };
        state.forEach(st => record(st, 0));
        for (frame = 1; frame <= most; frame++) {
            const t = frame * dt;
            for (let i = 0; i < state.length; i++) {
                const st = state[i];
                if (st.parked) continue;
                const here = EndShot.wayAt(st.way, st.m, {});
                let top = Math.min(capAt(st, st.m), Math.max(st.v, 0) + T.gainMs2 * dt);
                // (toward its own pace, eased down at brakeMs2)
                if (st.v > st.r.cruise) top = Math.min(top, Math.max(st.r.cruise, st.v - T.brakeMs2 * dt));
                else top = Math.min(top, st.r.cruise);
                // (behind a bike that stands on its way ahead: the first point of its way within followClearM of that bike, and
                // the bike's own pace along it. Read on the way, not by a cone: where the way turns sharp off the road,
                // a rider that has turned is beside the next one, not in front of it)
                const look = Math.max(8, (st.v * st.v) / (2 * T.followMs2) + T.followGapM + 2);
                for (let j = 0; j < i; j++) {
                    const o = state[j];
                    const ox = o.track[o.track.length - 6], oz = o.track[o.track.length - 5], oh = o.track[o.track.length - 4];
                    if (Math.abs(ox - here.x) > look + 3 || Math.abs(oz - here.z) > look + 3) continue;
                    const d = EndShot.reach(st.way, st.m, look, ox, oz, T.followClearM);
                    if (d === null) continue;
                    const at = EndShot.wayAt(st.way, Math.min(st.way.length, st.m + d), {});
                    const pace = o.parked ? 0 : Math.max(0, o.v * Math.cos(oh - at.h));
                    const gap = o.parked ? T.parkedGapM : T.followGapM;
                    top = Math.min(top, pace + Math.sqrt(2 * T.followMs2 * Math.max(0, d - gap)));
                }
                st.v = Math.max(0, Math.min(top, st.v + T.gainMs2 * dt));
                st.m += st.v * dt;
                // (the last few centimetres at the least speed, so the bay is reached)
                if (st.m >= st.way.length - 0.02 || (st.v < 1e-3 && st.way.length - st.m < 0.3)) {
                    st.m = st.way.length;
                    st.v = 0;
                    st.parked = true;
                    st.parkedAt = t;
                }
                const k = EndShot.wayAt(st.way, st.m, {}).k;
                const want = Math.max(-T.leanMost, Math.min(T.leanMost, -Math.atan(st.v * st.v * k / g)));
                st.lean += (want - st.lean) * Math.min(1, T.leanRate * dt);
            }
            // (a parked rider's lean eases to upright)
            for (const st of state) {
                if (st.parked) st.lean += (0 - st.lean) * Math.min(1, T.leanRate * dt);
                record(st, t);
            }
            if (state.every(st => st.parked && Math.abs(st.lean) < 1e-3)) break;
        }
        return { hz: T.frameHz, frames: Math.min(frame, most) + 1, tracks: state.map(st => Float32Array.from(st.track)), parkedAt: state.map(st => st.parkedAt) };
    }

    // A rider at t seconds of a ride: {x, z, heading, speed, lean, m}
    static trackAt(ride, k, t, out = {}) {
        const tr = ride.tracks[k], n = tr.length / 6;
        const f = Math.max(0, Math.min(n - 1, t * ride.hz)), i = Math.min(n - 2, Math.floor(f)), u = n > 1 ? f - i : 0;
        const a = i * 6, b = Math.min(n - 1, i + 1) * 6;
        out.x = tr[a] + (tr[b] - tr[a]) * u;
        out.z = tr[a + 1] + (tr[b + 1] - tr[a + 1]) * u;
        out.heading = tr[a + 2] + EndShot.turn(tr[a + 2], tr[b + 2]) * u;
        out.speed = tr[a + 3] + (tr[b + 3] - tr[a + 3]) * u;
        out.lean = tr[a + 4] + (tr[b + 4] - tr[a + 4]) * u;
        out.m = tr[a + 5] + (tr[b + 5] - tr[a + 5]) * u;
        return out;
    }

    // The first share (0 to 1) of the segment a to b ({x, y, z}) that meets a face of `faces` ({data, count}, stride 9:
    // ax, az, bx, bz, topA, topB, footA, footB, road: WorldEnvironment.cameraFaces), or 1 with none
    static faceShare(faces, a, b, over = 0.2) {
        if (!faces || !faces.count) return 1;
        const d = faces.data, N = 9;
        const rx = b.x - a.x, rz = b.z - a.z;
        let best = 1;
        for (let f = 0; f < faces.count; f++) {
            const i = f * N, px = d[i], pz = d[i + 1], sx = d[i + 2] - px, sz = d[i + 3] - pz;
            const den = rx * sz - rz * sx;
            if (Math.abs(den) < 1e-9) continue;
            const qx = px - a.x, qz = pz - a.z;
            const t = (qx * sz - qz * sx) / den, u = (qx * rz - qz * rx) / den;
            if (t < 0 || t > best || u < 0 || u > 1) continue;
            const y = a.y + (b.y - a.y) * t;
            const top = d[i + 4] + (d[i + 5] - d[i + 4]) * u, foot = d[i + 6] + (d[i + 7] - d[i + 6]) * u;
            if (y <= top + over && y >= foot - 0.1) best = t;
        }
        return best;
    }

    // The first share of the segment a to b under the land (`ground(x, z)`, read every stepM), or 1; the last `spareM`
    // metres not read (the segment ends on a bike on the ground)
    static landShare(ground, a, b, clear = 0.1, spareM = 0, stepM = 1) {
        const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
        const n = Math.max(1, Math.ceil(len / stepM));
        for (let k = 1; k <= n; k++) {
            const t = k / n;
            if (len * (1 - t) < spareM) break;
            const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, z = a.z + (b.z - a.z) * t;
            const g = ground(x, z);
            if (Number.isFinite(g) && y < g + clear) return (k - 1) / n;
        }
        return 1;
    }

    // The ways the view might be taken, best first: [{x, z} unit vectors]. A stop's hand-set hold or shot looks its
    // own way, a lookout its view; else the bearings where the land's skyline stands lowest from the bays' middle `at`
    // (the land falls away or the valley opens)
    static views(stop, at, ground) {
        const r = Math.PI / 180;
        const hand = EndShot.SHOTS[stop.id] || stop.shot || (typeof StopScene !== 'undefined' && StopScene.HOLDS[stop.id]) || stop.hold;
        const around = (b, offs) => offs.map(o => ({ x: Math.sin(b + o * r), z: Math.cos(b + o * r) }));
        // (a hold's bearing is degrees from north, clockwise: the way its camera looks, yaw = -bearing, a camera looking
        // down -z; in the route's terms that is the heading of (-sin yaw, -cos yaw))
        if (hand && Number.isFinite(hand.bearing)) {
            const yaw = -hand.bearing * r;
            return around(Math.atan2(-Math.sin(yaw), -Math.cos(yaw)), [0, -10, 10, -20, 20]);
        }
        if (stop.kind === 'lookout' && Number.isFinite(stop.view)) return around(stop.view, [0, -10, 10, -20, 20, -35, 35]);
        const base = ground(at.x, at.z);
        const y0 = (Number.isFinite(base) ? base : 0) + 2;
        const scored = [];
        for (let k = 0; k < 36; k++) {
            const b = k * 10 * r, sx = Math.sin(b), sz = Math.cos(b);
            let sky = -Math.PI / 2, far = 0;
            for (let d = 25; d < 6000; d *= 1.12) {
                const g = ground(at.x + sx * d, at.z + sz * d);
                if (!Number.isFinite(g)) continue;
                const e = Math.atan2(g - y0, d);
                if (e > sky) { sky = e; far = d; }
            }
            scored.push({ x: sx, z: sz, score: -sky / r + Math.min(3, far / 1000) });
        }
        scored.sort((a, b) => b.score - a.score);
        // (the best few, at least 30 degrees apart)
        const out = [];
        for (const s of scored) {
            if (out.every(o => o.x * s.x + o.z * s.z < Math.cos(30 * r))) out.push({ x: s.x, z: s.z });
            if (out.length >= 5) break;
        }
        return out;
    }

    // A point's place in a picture from `eye` turned yaw, pitch (a camera looking down -z, 'YXZ'), at vertical field of
    // view vfov (degrees) and `aspect`: {x, y} (-1 to 1 each way) and its depth, or null behind the eye
    static project(eye, yaw, pitch, vfov, aspect, p) {
        const dx = p.x - eye.x, dy = p.y - eye.y, dz = p.z - eye.z;
        // (into the camera's frame: undo the yaw about y, then the pitch about x)
        const cy = Math.cos(-yaw), sy = Math.sin(-yaw);
        const x1 = dx * cy + dz * sy, z1 = -dx * sy + dz * cy;
        const cp = Math.cos(-pitch), sp = Math.sin(-pitch);
        const y2 = dy * cp - z1 * sp, z2 = dy * sp + z1 * cp;
        const depth = -z2;
        if (depth < 0.5) return null;
        const tv = Math.tan((vfov * Math.PI / 180) / 2);
        return { x: x1 / (depth * tv * aspect), y: y2 / (depth * tv), depth };
    }

    // The aim of a camera at `eye` looking at `look`: {yaw, pitch}
    static aimOf(eye, look) {
        const dx = look.x - eye.x, dy = look.y - eye.y, dz = look.z - eye.z;
        return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
    }

    static vfovOf(hfov, aspect, most = 60) {
        const r = Math.PI / 180;
        return Math.min(most, (2 * Math.atan(Math.tan((hfov * r) / 2) / Math.max(0.2, aspect || 16 / 9))) / r);
    }

    // The composed view over the bays: {eye: {x, y, z}, yaw, pitch, roll, fov, side (-1 the group on the left), view}
    // or null where nothing fits. `bays` [{x, z, heading}] (the bikes parked there, each rider standing STAND_M to its
    // left); `ground(x, z)`; `faces` the walls and houses near ({data, count}); `visible` the share of the picture's
    // height between the bars
    static compose(stop, bays, ground, aspect = 16 / 9, faces = null, visible = 0.76) {
        const T = EndShot.TUNING, r = Math.PI / 180;
        const hand = EndShot.SHOTS[stop.id] || stop.shot;
        const vfov = EndShot.vfovOf(T.hfov, aspect);
        if (hand) {
            const g = ground(hand.x, hand.z);
            const eye = { x: hand.x, y: (Number.isFinite(g) ? g : 0) + hand.upM, z: hand.z };
            return { eye, yaw: -hand.bearing * r, pitch: hand.pitch * r, roll: 0, fov: EndShot.vfovOf(hand.hfov || T.hfov, aspect), side: 0, view: null, hand: true };
        }
        const yOf = (x, z) => { const g = ground(x, z); return Number.isFinite(g) ? g : 0; };
        const mx = bays.reduce((n, b) => n + b.x, 0) / bays.length, mz = bays.reduce((n, b) => n + b.z, 0) / bays.length;
        const my = yOf(mx, mz);
        // What must be in the picture and in sight: each bike's corners at the ground and at its top, and its rider
        const points = [], sights = [];
        for (const b of bays) {
            const fx = Math.sin(b.heading), fz = Math.cos(b.heading), y = yOf(b.x, b.z);
            for (const al of [-1.1, 1.1]) for (const ac of [-0.45, 0.45]) {
                const x = b.x + fx * al + fz * ac, z = b.z + fz * al - fx * ac;
                points.push({ x, y, z }, { x, y: y + 1.2, z });
            }
            // (the rider stands STAND_SIDE_M along the bike's own +x: StopScene.stand)
            const rx = b.x + Math.cos(b.heading) * 0.75, rz = b.z - Math.sin(b.heading) * 0.75;
            points.push({ x: rx, y: yOf(rx, rz) + 1.85, z: rz });
            sights.push({ x: b.x, y: y + 0.9, z: b.z }, { x: rx, y: yOf(rx, rz) + 1.6, z: rz });
        }
        const edgeY = visible - 0.04;
        const bend = Math.atan(Math.abs(T.groupY) * Math.tan((vfov * r) / 2));
        for (const dir of EndShot.views(stop, { x: mx, z: mz }, ground)) {
            const sx = dir.z, sz = -dir.x;
            for (const side of [-1, 1]) {
                for (const D of T.distances) for (const H of T.heights) for (const S of T.shifts) {
                    const ex = mx - dir.x * D + sx * S, ez = mz - dir.z * D + sz * S;
                    const under = ground(ex, ez);
                    const eye = { x: ex, y: my + H, z: ez };
                    if (Number.isFinite(under) && eye.y < under + T.eyeClearM) continue;
                    // (turned so the bays' middle is sideX to `side` of the picture's middle, pitched so it is at groupY)
                    const toward = Math.atan2(-(mx - ex), -(mz - ez));
                    const off = Math.atan(T.sideX * Math.tan((vfov * r) / 2) * aspect);
                    const yaw = toward + side * off;
                    const ahead = Math.atan2(-dir.x, -dir.z);
                    if (Math.abs(EndShot.turn(ahead, yaw)) > T.yawMostDeg * r) continue;
                    const flat = Math.hypot(mx - ex, mz - ez);
                    const pitch = Math.atan2(my + 0.6 - eye.y, flat) + bend;
                    if (pitch < T.pitchLeastDeg * r || pitch > T.pitchMostDeg * r) continue;
                    let fits = true;
                    for (const p of points) {
                        const q = EndShot.project(eye, yaw, pitch, vfov, aspect, p);
                        if (!q || Math.abs(q.x) > 0.95 || q.y < -edgeY || q.y > 0.1) { fits = false; break; }
                        // (and clear of the middle, where the card comes up)
                        if (q.x * side < -0.08) { fits = false; break; }
                    }
                    if (!fits) continue;
                    let clear = true;
                    for (const p of sights) {
                        if (EndShot.faceShare(faces, eye, p, 0) < 1 || EndShot.landShare(ground, eye, p, 0.05, 1.5) < 1) { clear = false; break; }
                    }
                    if (!clear) continue;
                    // (the view in front: nothing stands in it for 80 m)
                    const cp = Math.cos(pitch);
                    const far = { x: eye.x - Math.sin(yaw) * cp * 80, y: eye.y + Math.sin(Math.max(pitch, -2 * r)) * 80, z: eye.z - Math.cos(yaw) * cp * 80 };
                    if (EndShot.faceShare(faces, eye, far, 0) < 1 || EndShot.landShare(ground, eye, far, 0.3, 0, 2) < 0.5) continue;
                    return { eye, yaw, pitch, roll: 0, fov: vfov, side, view: dir, hand: false };
                }
            }
        }
        return null;
    }
}

// The camera of the shot: the chase camera's pose at the line, eased onto the follow camera behind the player, then
// craned to the composed view (`hold`). `from` {offset: {x, y, z} (the eye less the bike's place), yaw, pitch, roll,
// fov}; `ground(x, z)`; `faces(x, z, reach)` the walls and houses near; `craneAt` and `craneS` when the crane starts and
// how long it takes; `arcM` how high it goes on the way
EndShot.Camera = class {
    constructor({ from, hold, ground, faces = null, craneAt, craneS, arcM = 0 }) {
        const T = EndShot.TUNING;
        this.from = from;
        this.hold = hold;
        this.ground = ground;
        this.faces = faces;
        this.craneAt = craneAt;
        this.craneS = craneS;
        this.arcM = arcM;
        // The follow camera's boom: as long and as high as the chase camera's at the line, within reason
        this.back = Math.max(4.5, Math.min(14, Math.hypot(from.offset.x, from.offset.z)));
        this.up = Math.max(1.6, Math.min(8, from.offset.y));
        this.gaps = {};
        this.share = 1;
        this.T = T;
    }

    // The share of a boom behind `bike` turned to heading h that is clear of the walls, the houses and the land
    clearOf(bike, h) {
        const T = this.T;
        const head = { x: bike.x, y: bike.y + T.headM, z: bike.z };
        const end = { x: bike.x - Math.sin(h) * this.back, y: bike.y + this.up, z: bike.z - Math.cos(h) * this.back };
        const faces = this.faces ? this.faces(bike.x, bike.z, this.back + 8) : null;
        return { head, end, wall: EndShot.faceShare(faces, head, end, 0.3), hit: Math.min(EndShot.faceShare(faces, head, end, 0.3), EndShot.landShare(this.ground, head, end, T.clearM, 0, 0.5)) };
    }

    // The follow camera behind the bike ({x, y, z, heading}): its boom turned after the bike's heading, drawn in short of
    // a wall, a house or the land, and already drawing in for one that the boom will meet foreseeS on (`ahead`, the
    // bike then), so it is drawn in on its spring and not caught in a frame. `dt` 0 sets it where it is
    follow(bike, dt, ahead = null) {
        const T = this.T;
        if (this.hs === undefined) {
            // (its first heading: the chase camera's boom, so its first place is the chase camera's own)
            const o = this.from.offset, l = Math.hypot(o.x, o.z);
            this.hs = l > 0.5 ? Math.atan2(-o.x, -o.z) : bike.heading;
            this.hr = 0;
        }
        if (dt > 0) {
            const w = T.turnRate, most = T.turnMostDegS * Math.PI / 180;
            this.hr += (w * w * EndShot.turn(this.hs, bike.heading) - 2 * w * this.hr) * dt;
            // (no faster than turnMostDegS: where the way turns round in a few metres, the spring swung the boom round
            // faster than a frame's turn may be)
            this.hr = Math.max(-most, Math.min(most, this.hr));
            this.hs += this.hr * dt;
        }
        // (its height follows the ground under the bike on a spring: where the way steps from the road onto a stop's
        // standing, or over the edge of a land triangle, the camera does not step with it)
        if (this.baseY === undefined || !(dt > 0)) { this.baseY = bike.y; this.baseRate = 0; } else {
            const w = 6;
            this.baseRate += (w * w * (bike.y - this.baseY) - 2 * w * this.baseRate) * dt;
            this.baseY += this.baseRate * dt;
        }
        bike = { ...bike, y: this.baseY };
        const fx = Math.sin(this.hs), fz = Math.cos(this.hs);
        const { head, end, hit, wall } = this.clearOf(bike, this.hs);
        const len = Math.hypot(end.x - head.x, end.y - head.y, end.z - head.z);
        // (the boom as it will be: the bike foreseeS on, the boom's heading carried on at its rate)
        const soon = ahead ? this.clearOf(ahead, this.hs + this.hr * T.foreseeS).hit : 1;
        const near = Math.min(hit, soon);
        const want = near < 1 ? Math.max(0.15, near - T.clearM / len) : 1;
        // (held at once short of a wall or a house only: the land is kept off by the shot's soft floor, and a bank that
        // stands over the boom's head, where the way steps up onto a stop, drew it in to the head in a frame)
        const hard = wall < 1 ? Math.max(0.1, wall - 0.25 / len) : 1;
        if (dt > 0) this.share += (want - this.share) * Math.min(1, (want < this.share ? T.boomIn : T.boomOut) * dt);
        else this.share = want;
        this.share = Math.min(this.share, hard);
        const eye = { x: head.x + (end.x - head.x) * this.share, y: head.y + (end.y - head.y) * this.share, z: head.z + (end.z - head.z) * this.share };
        const look = { x: bike.x + fx * T.lookAheadM, y: bike.y + T.lookUpM, z: bike.z + fz * T.lookAheadM };
        return { ...eye, ...EndShot.aimOf(eye, look), roll: 0, fov: this.from.fov };
    }

    // Two poses blended by w; each angle's gap followed from frame to frame (a hold turned near 180 degrees from the
    // follow camera's aim would flip sides the shorter way round)
    mix(key, a, b, w) {
        const gap = (k, x, y) => {
            const raw = EndShot.turn(x, y), g = this.gaps;
            g[k] = g[k] === undefined ? raw : g[k] + EndShot.turn(g[k], raw);
            return g[k];
        };
        return {
            x: a.x + (b.x - a.x) * w, y: a.y + (b.y - a.y) * w, z: a.z + (b.z - a.z) * w,
            yaw: a.yaw + gap(`${key}yaw`, a.yaw, b.yaw) * w, pitch: a.pitch + (b.pitch - a.pitch) * w,
            roll: a.roll + gap(`${key}roll`, a.roll, b.roll) * w, fov: a.fov + (b.fov - a.fov) * w
        };
    }

    // The camera t seconds into the shot with the player's bike at `bike` ({x, y, z, heading}): {eye, yaw, pitch, roll,
    // fov, look}
    at(t, bike, dt, ahead = null) {
        const T = this.T, from = this.from;
        const chase = { x: bike.x + from.offset.x, y: bike.y + from.offset.y, z: bike.z + from.offset.z, yaw: from.yaw, pitch: from.pitch, roll: from.roll, fov: from.fov };
        const w1 = EndShot.ease(t / T.joinS), w2 = EndShot.ease((t - this.craneAt) / this.craneS);
        let c;
        if (w2 >= 1) c = { x: this.hold.eye.x, y: this.hold.eye.y, z: this.hold.eye.z, yaw: this.hold.yaw, pitch: this.hold.pitch, roll: 0, fov: this.hold.fov };
        else {
            const follow = this.follow(bike, dt, ahead);
            const held = { x: this.hold.eye.x, y: this.hold.eye.y, z: this.hold.eye.z, yaw: this.hold.yaw, pitch: this.hold.pitch, roll: 0, fov: this.hold.fov };
            if (!(w2 > 0)) { this.gaps.holdyaw = undefined; this.gaps.holdroll = undefined; }
            c = this.mix('hold', this.mix('join', chase, follow, w1), held, w2);
            c.y += this.arcM * 4 * w2 * (1 - w2);
            // (never under the land: a soft floor on a spring that follows the ground, eased in from none at the line
            // and out as the crane comes to the hold, which keeps its own clearance)
            let under = this.ground(c.x, c.z);
            if (Number.isFinite(under)) {
                if (this.floorY === undefined) { this.floorY = under; this.floorRate = 0; } else if (dt > 0) {
                    const w = 6;
                    this.floorRate += (w * w * (under - this.floorY) - 2 * w * this.floorRate) * dt;
                    this.floorY += this.floorRate * dt;
                }
                under = this.floorY;
                const share = w1 * (1 - w2), knee = Math.max(1e-6, 0.6 * share);
                const floor = under + 1.2 * share, x = (c.y - floor) / knee;
                c.y = floor + knee * (x > 30 ? x : Math.log1p(Math.exp(x)));
            }
        }
        const cp = Math.cos(c.pitch);
        return { eye: { x: c.x, y: c.y, z: c.z }, yaw: c.yaw, pitch: c.pitch, roll: c.roll, fov: c.fov, look: { x: c.x - Math.sin(c.yaw) * cp * 10, y: c.y + Math.sin(c.pitch) * 10, z: c.z - Math.cos(c.yaw) * cp * 10 } };
    }
};
