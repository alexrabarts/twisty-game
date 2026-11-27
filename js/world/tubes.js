// TubeLining and TubeShade: the inside of every tunnel and gallery of a world, the ride's and the side roads'.
//
// RoadMesh draws a tube as a box round its road (walls WorldRoute.ROOF_M high, a flat roof). TubeLining lines that box
// and fits it out, by one rule for every tube at every level of detail:
//   lining    the walls and the roof in concrete poured in bays (a seam every 10 to 12 m), the walkway each side of
//             the carriageway (its kerb drawn in the shader, flush: the bike rides to the wall's foot), and on the
//             mountain side of the tube rough rock over a concrete plinth (a tunnel's rock, a gallery's rock or
//             shotcrete): its face set in by up to rockInM at LOD0, flat at LOD1 with the same relief in the shader.
//             A gallery's valley side opens between pillars where the land outside falls away below the sill
//   fittings  at LOD0 only: a lamp on the crown every lampM (twice as many within entranceM of a portal), a conduit
//             beside them, a cable tray high on the concrete wall, a pair of jet fans in the roof's corners every
//             fan.everyM in a tube of fan.minRunM or more, and an emergency niche (a door with a green sign over it,
//             a pictogram and no text) every niche.everyM. The marker lights on the walls are drawn in the shader
// Every vertex carries where it is in its tube (`tube`: metres along, height over the floor, kind, the tube's light
// share; `tubeAux`: the tube's way along in plan, metres across from its centre line, metres in from the nearest
// portal; `tubeLocal`: a piece's own coordinates), so the shader lays the bays, the stains and the lamps' light along
// the tube whatever its heading. The normals face into the tube, and the faces are wound so that the inside is the
// front: a face seen from outside (a gallery's openings, a portal seen from the valley) is lit by the day.
//
// TubeShade is the material of both meshes (MeshLambertMaterial, vertex colours, the world haze): the tube's own
// lamps light it, with the sun and the sky held out by the light share. The share grows from 0 at a portal to 1
// dayM in (galleryShare in a gallery: the day comes in through its openings), and the road's near ribbon reads the
// same share and the same lamps (RoadSurface: roadTube), so the road under the roof is lit by the lamps, not the sky.
// Graphics.adaptation lets the eye adapt to the tube (Game.updateTubeAdaptation): a portal reads as riding into a
// tunnel, bright outside and adapted inside, with no step.
class TubeLining {
    static get TUBE() {
        return {
            bayM: 11, bayJitterM: 1, lampM: 8, entranceM: 48, dayM: 30, galleryShare: 0.55,
            lamp: { long: 1.4, wide: 0.34, deep: 0.13, gap: 0.01 },
            conduit: { lat: 0.42, wide: 0.1, deep: 0.07 },
            tray: { down: 1.0, out: 0.34, lip: 0.09 },
            fan: { everyM: 160, firstM: 90, minRunM: 300, radius: 0.4, long: 2.4, top: 0.12, sides: 8, in: 0.55 },
            niche: { everyM: 150, firstM: 70, minRunM: 180, wide: 1.0, high: 2.1, signW: 0.62, signH: 0.42, signUp: 2.35, off: 0.03 },
            plinthM: 1.0, rockInM: 0.32, rockLevels: [1.0, 2.1, 3.2, 4.3, 5.4],
            open: { from: 1.1, to: 5.2, everyM: 6, pillarM: 0.9, inM: 0.3, outM: 0.3, sillDropM: 0.4 }
        };
    }

    // The kind of each surface, in `tube`.z
    static get KIND() { return { concrete: 0, rock: 1, roof: 2, walk: 3, lens: 4, metal: 5, sign: 6, door: 7, pillar: 8, shotcrete: 9, fan: 10 }; }

    // Albedo of each kind (sRGB, as every vertex colour of a world)
    static get COLORS() {
        return {
            concrete: [0.47, 0.46, 0.44], rock: [0.40, 0.38, 0.35], roof: [0.40, 0.39, 0.38], walk: [0.46, 0.45, 0.43],
            lens: [0.95, 0.92, 0.86], metal: [0.46, 0.47, 0.48], sign: [0.06, 0.42, 0.22], door: [0.58, 0.59, 0.58],
            pillar: [0.50, 0.49, 0.47], shotcrete: [0.45, 0.44, 0.42], fan: [0.38, 0.39, 0.40]
        };
    }

    // The share of the tube's own light at `inM` metres in from the nearest portal (negative outside): none at the
    // portal, all of it dayM in; a gallery keeps galleryShare of it, the rest coming in through its openings
    // (`cap`: the most of it, 1 in a tunnel, galleryShare in a gallery; true for a gallery)
    static share(inM, cap = 1) {
        const T = TubeLining.TUBE;
        const t = Math.min(1, Math.max(0, inM / T.dayM));
        const most = cap === true ? T.galleryShare : cap === false ? 1 : cap;
        return t * t * (3 - 2 * t) * most;
    }

    // The pour seams between s0 and s1, as the shader lays them (TubeShade: tubeSeam): one near every bayM, moved
    // by up to half of bayJitterM, so a bay is 10 to 12 m long
    static seams(s0, s1) {
        const T = TubeLining.TUBE, out = [];
        for (let k = Math.floor(s0 / T.bayM) - 1; k <= Math.ceil(s1 / T.bayM) + 1; k++) {
            const at = k * T.bayM + (LandShade.glslHash(k, 17) - 0.5) * T.bayJitterM;
            if (at >= s0 && at <= s1) out.push(at);
        }
        return out;
    }

    // Metres in from the nearest portal of each row (negative outside a tube, at most `reach` out), from the rows'
    // flags (`bits` & 5) and their metres along (`s`, or measured): `ends` [start, end] says whether a run that
    // touches the first or last row has its portal there (true) or goes on past it (false: counted from `beyond`)
    static depths(rows, along, ends = [true, true], reach = 60) {
        const n = rows.length, inM = new Float32Array(n).fill(-reach);
        const tube = rows.map(row => (row.bits & 5) !== 0);
        const portals = [];
        for (let k = 0; k < n; k++) {
            if (k > 0 && tube[k] !== tube[k - 1]) portals.push(tube[k] ? along[k] : along[k - 1]);
        }
        if (tube[0] && ends[0]) portals.push(along[0]);
        if (tube[n - 1] && ends[1]) portals.push(along[n - 1]);
        for (let k = 0; k < n; k++) {
            let near = Infinity;
            for (const p of portals) near = Math.min(near, Math.abs(along[k] - p));
            if (tube[k]) inM[k] = Number.isFinite(near) ? near : 1e4;
            else inM[k] = Math.max(-reach, -near);
        }
        return inM;
    }

    // Empty buffers for the lining and the fittings
    static parts() {
        const buffer = () => ({ positions: [], normals: [], colors: [], tube: [], aux: [], local: [] });
        return { lining: buffer(), fittings: buffer() };
    }

    // One quad a b c d with its normal `n` (the side it is lit from: into the tube), wound so that side is its front.
    // `at(p, k)` gives each corner's attributes {s, h, lat, inM, u, v} (k 0 to 3), `kind` and `color` the piece's
    static quad(buf, a, b, c, d, n, kind, color, at, share) {
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        const w = (uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2];
        let corners = w >= 0 ? [[a, 0], [b, 1], [c, 2], [a, 0], [c, 2], [d, 3]] : [[a, 0], [c, 2], [b, 1], [a, 0], [d, 3], [c, 2]];
        // (a quad whose last corner is its first is one triangle)
        if (d === a) corners = corners.slice(0, 3);
        for (const [p, k] of corners) {
            const e = at(p, k);
            buf.positions.push(p[0], p[1], p[2]);
            buf.normals.push(n[0], n[1], n[2]);
            buf.colors.push(color[0], color[1], color[2]);
            buf.tube.push(e.s, e.h, kind, share(e));
            buf.aux.push(e.ax, e.az, e.lat, e.inM);
            buf.local.push(e.u || 0, e.v || 0);
        }
    }

    // A tube's run of rows, lined and fitted out. `rows`: [{l, r: wall feet [x, y, z], s (metres along), inM (metres
    // in from the nearest portal), roof (metres over the feet), floor: {l, r} where the walkway starts (or none)}], in
    // order along the tube. `opts`: {gallery, rock (-1 the left wall, 1 the right, 0 none), shotcrete (the rock side is
    // sprayed concrete), open (the side with openings, -1, 1 or 0), lod, groundAt(x, z), run: [s0, s1] the whole run's
    // metres along, fittings}
    static run(parts, rows, opts = {}) {
        const T = TubeLining.TUBE, K = TubeLining.KIND, C = TubeLining.COLORS;
        // (a row within a hand of the one before is left out, but the last: no two corners of a wall a hand apart)
        rows = rows.filter((row, k) => k === 0 || k === rows.length - 1 || Math.hypot(row.l[0] - rows[k - 1].l[0], row.l[2] - rows[k - 1].l[2]) >= 0.3);
        if (rows.length > 2) {
            const n = rows.length;
            if (Math.hypot(rows[n - 1].l[0] - rows[n - 2].l[0], rows[n - 1].l[2] - rows[n - 2].l[2]) < 0.3) rows.splice(n - 2, 1);
        }
        // (each row may carry its own kind and sides: a tube that is a gallery and then a tunnel; its `cap` the most
        // of the tube's light, galleryShare in a gallery, eased from one to the other)
        const T0 = TubeLining.TUBE;
        const capOf = row => (Number.isFinite(row.cap) ? row.cap : (row.gallery ?? opts.gallery) ? T0.galleryShare : 1);
        const near = (opts.lod || 0) === 0;
        // Each row's frame: right (from the left foot to the right one), along (square to it), centre, half span
        const frames = rows.map(row => {
            const dx = row.r[0] - row.l[0], dz = row.r[2] - row.l[2], span = Math.hypot(dx, dz) || 1;
            const rx = dx / span, rz = dz / span;
            return { rx, rz, ax: -rz, az: rx, half: span / 2, c: [(row.l[0] + row.r[0]) / 2, (row.l[1] + row.r[1]) / 2, (row.l[2] + row.r[2]) / 2] };
        });
        // Attributes at a point of segment k→k+1 at share t along it, `lat` across, `h` over the floor
        const attr = (k, t, lat, h, u = 0, v = 0) => {
            const a = rows[k], b = rows[k + 1] || a, fa = frames[k], fb = frames[k + 1] || fa;
            const ca = capOf(a), cb = capOf(b);
            return { s: a.s + (b.s - a.s) * t, h, lat, inM: a.inM + (b.inM - a.inM) * t, cap: ca + (cb - ca) * t, ax: fa.ax + (fb.ax - fa.ax) * t, az: fa.az + (fb.az - fa.az) * t, u, v };
        };
        const share = e => TubeLining.share(e.inM, e.cap);
        // A point of the tube in segment k at t along, `lat` across from the centre line, `h` over the floor
        const point = (k, t, lat, h) => {
            const a = rows[k], b = rows[k + 1] || a, fa = frames[k], fb = frames[k + 1] || fa;
            const cx = fa.c[0] + (fb.c[0] - fa.c[0]) * t, cy = fa.c[1] + (fb.c[1] - fa.c[1]) * t, cz = fa.c[2] + (fb.c[2] - fa.c[2]) * t;
            const rx = fa.rx + (fb.rx - fa.rx) * t, rz = fa.rz + (fb.rz - fa.rz) * t;
            return [cx + rx * lat, cy + h, cz + rz * lat];
        };
        const roofOf = (k, t) => rows[k].roof + ((rows[k + 1] || rows[k]).roof - rows[k].roof) * t;
        const { lining, fittings } = parts;
        const openMemo = new Map();
        for (let k = 0; k + 1 < rows.length; k++) {
            const a = rows[k], b = rows[k + 1], fa = frames[k], fb = frames[k + 1];
            const ra = a.roof, rb = b.roof;
            const seg = { ...opts, openMemo, gallery: a.gallery ?? opts.gallery, rock: a.rock ?? opts.rock, open: a.open ?? opts.open, shotcrete: a.shotcrete ?? opts.shotcrete };
            // The roof: from wall top to wall top, lit from under
            {
                const corners = [[a.l, -fa.half, ra, 0], [b.l, -fb.half, rb, 1], [b.r, fb.half, rb, 1], [a.r, fa.half, ra, 0]];
                const ps = corners.map(([p, , roof]) => [p[0], p[1] + roof, p[2]]);
                TubeLining.quad(lining, ps[0], ps[1], ps[2], ps[3], [0, -1, 0], K.roof, C.roof, (p, j) => attr(k, corners[j][3], corners[j][1], corners[j][2]), share);
            }
            // The walls
            for (const sign of [-1, 1]) {
                const key = sign < 0 ? 'l' : 'r';
                const n = [-sign * (fa.rx + fb.rx) / 2, 0, -sign * (fa.rz + fb.rz) / 2];
                const nl = Math.hypot(n[0], n[2]) || 1;
                n[0] /= nl; n[2] /= nl;
                if (seg.open === sign && seg.groundAt) TubeLining.openWall(lining, k, sign, rows, frames, attr, point, roofOf, n, share, { ...seg, thin: !near });
                else if (seg.rock === sign) TubeLining.rockWall(lining, k, sign, rows, frames, attr, n, share, near, seg.shotcrete ? K.shotcrete : K.rock, seg.shotcrete ? C.shotcrete : C.rock);
                else {
                    const pa = a[key], pb = b[key];
                    TubeLining.quad(lining, pa, pb, [pb[0], pb[1] + rb, pb[2]], [pa[0], pa[1] + ra, pa[2]], n, K.concrete, C.concrete, (p, j) => attr(k, j === 1 || j === 2 ? 1 : 0, sign * (j === 1 || j === 2 ? fb.half : fa.half), j >= 2 ? (j === 2 ? rb : ra) : 0), share);
                }
                // The walkway from where it starts out to the wall's foot (u: metres out from its inner edge)
                if (a.floor && b.floor && a.floor[key] && b.floor[key]) {
                    const lift = p => [p[0], p[1] + RoadMesh.LIFT_M + 0.01, p[2]];
                    const ia = lift(a.floor[key]), ib = lift(b.floor[key]), oa = lift(a[key]), ob = lift(b[key]);
                    const wa = Math.hypot(oa[0] - ia[0], oa[2] - ia[2]), wb = Math.hypot(ob[0] - ib[0], ob[2] - ib[2]);
                    const corners = [[ia, 0, fa.half - wa, 0], [ib, 1, fb.half - wb, 0], [ob, 1, fb.half, wb], [oa, 0, fa.half, wa]];
                    TubeLining.quad(lining, corners[0][0], corners[1][0], corners[2][0], corners[3][0], [0, 1, 0], K.walk, C.walk, (p, j) => attr(k, corners[j][1], sign * corners[j][2], 0, corners[j][3], 0), share);
                }
            }
            if (near && opts.fittings !== false) TubeLining.fit(fittings, k, rows, frames, attr, point, roofOf, share, seg);
        }
        return parts;
    }

    // A wall of rough rock over a concrete plinth (or sprayed concrete): the plinth one quad, the rock in rows of
    // rockLevels, its face set in by up to rockInM at LOD0 (the same at each row for both segments it bounds, so no
    // step), none at the plinth's top and at the roof
    static rockWall(buf, k, sign, rows, frames, attr, n, share, near, kind, color) {
        const T = TubeLining.TUBE, K = TubeLining.KIND, C = TubeLining.COLORS;
        const key = sign < 0 ? 'l' : 'r';
        const a = rows[k], b = rows[k + 1], fa = frames[k], fb = frames[k + 1];
        // (flat at LOD1: the plinth and one face of rock, the relief in the shader)
        const levels = near ? [0, ...T.rockLevels.filter(h => h < Math.min(a.roof, b.roof) - 0.3)] : [0, T.plinthM];
        const top = (row) => row.roof;
        // How far in the face stands at (s, h): a smooth relief of a few metres, 0 at the plinth's top and the roof
        const inset = (row, h) => {
            const s = row.s, roof = row.roof;
            if (!near || row.pin || h <= T.plinthM + 1e-6 || h >= roof - 1e-6) return 0;
            const edge = Math.min(1, (h - T.plinthM) / 0.9, (roof - h) / 0.9);
            const n1 = LandShade.noise(s, h, 3.1, 41 + (sign > 0 ? 1 : 0)), n2 = LandShade.noise(s, h, 1.3, 43 + (sign > 0 ? 1 : 0));
            return T.rockInM * edge * Math.min(1, Math.max(0, 0.15 + 0.6 * n1 + 0.35 * n2));
        };
        const vertex = (row, frame, h) => {
            const p = row[key], d = inset(row, h);
            return [p[0] - sign * frame.rx * d, p[1] + h, p[2] - sign * frame.rz * d];
        };
        const hs = [...levels, null];
        for (let i = 0; i + 1 < hs.length; i++) {
            const h0 = hs[i], h1a = hs[i + 1] === null ? top(a) : hs[i + 1], h1b = hs[i + 1] === null ? top(b) : hs[i + 1];
            const pa0 = vertex(a, fa, h0), pb0 = vertex(b, fb, h0), pb1 = vertex(b, fb, h1b), pa1 = vertex(a, fa, h1a);
            const plinth = h0 < T.plinthM - 1e-6;
            const hh = [h0, h0, h1b, h1a];
            const lat = j => sign * (j === 1 || j === 2 ? fb.half : fa.half);
            TubeLining.quad(buf, pa0, pb0, pb1, pa1, n, plinth ? K.concrete : kind, plinth ? C.concrete : color, (p, j) => attr(k, j === 1 || j === 2 ? 1 : 0, lat(j), hh[j]), share);
        }
    }

    // A gallery's valley wall: a parapet to the sill, a lintel from the head to the roof, and pillars every
    // open.everyM, open between them where the land outside lies under the sill (sillDropM under it, from 1.5 m to
    // 35 m out: a bank farther out that stood over the sill was seen through an opening from under the land) and
    // solid where it does not. The sill, the head and the pillars have their depth: the pillars stand inM
    // into the tube, and the parapet and the lintel are outM thick outward, capped. Pillars are placed by metres
    // along the whole run, so a segment's pieces meet its neighbour's
    static openWall(buf, k, sign, rows, frames, attr, point, roofOf, n, share, opts) {
        const T = TubeLining.TUBE, O = T.open, K = TubeLining.KIND, C = TubeLining.COLORS;
        const a = rows[k], b = rows[k + 1], fa = frames[k], fb = frames[k + 1];
        const len = b.s - a.s;
        if (!(len > 0)) return;
        const lat = t => sign * (fa.half + (fb.half - fa.half) * t);
        const P = (t, h, out = 0) => point(k, t, lat(t) + sign * out, h);
        const tOf = s => (s - a.s) / len;
        // Openings between pillars: pillar j stands centred on j * everyM; the opening between j and j + 1
        const open = j => {
            const s = (j + 0.5) * O.everyM;
            const t = tOf(s);
            const groundAt = opts.groundAt;
            const floorY = point(k, t, 0, 0)[1];
            for (const tt of [tOf(j * O.everyM + O.pillarM / 2 + 0.3), t, tOf((j + 1) * O.everyM - O.pillarM / 2 - 0.3)]) {
                for (const out of [1.5, 4, 8, 15, 25, 35]) {
                    const p = point(k, tt, lat(tt) + sign * out, 0);
                    const g = groundAt(p[0], p[2]);
                    if (!Number.isFinite(g) || g > floorY + O.from - O.sillDropM) return false;
                }
            }
            return true;
        };
        // Breaks along the segment: its ends and the pillars' edges in it
        const breaks = [0, 1];
        const j0 = Math.floor(a.s / O.everyM) - 1, j1 = Math.ceil(b.s / O.everyM) + 1;
        // (a pillar's edge within a hand of the segment's end is moved to it: no two corners of the wall stand a
        // hand apart there)
        const hand = 0.3 / len;
        for (let j = j0; j <= j1; j++) for (const e of [j * O.everyM - O.pillarM / 2, j * O.everyM + O.pillarM / 2]) { const t = tOf(e); if (t > hand && t < 1 - hand) breaks.push(t); }
        breaks.sort((x, y) => x - y);
        // (decided once for the run, by the first segment that asks, so its neighbours agree)
        const memo = opts.openMemo || new Map();
        const isOpen = j => { if (!memo.has(j)) memo.set(j, open(j)); return memo.get(j); };
        const pieceOf = t => {
            const s = a.s + len * t;
            const j = Math.round(s / O.everyM);
            if (Math.abs(s - j * O.everyM) < O.pillarM / 2) return { pillar: j, open: isOpen(j - 1) || isOpen(j) };
            const g = Math.floor(s / O.everyM);
            return { gap: g, open: isOpen(g) };
        };
        const inward = n, out = [-n[0], 0, -n[2]];
        const roofA = roofOf(k, 0), roofB = roofOf(k, 1);
        const q = (p0, p1, p2, p3, normal, kind, color, hs, ts, lats, u = null) => TubeLining.quad(buf, p0, p1, p2, p3, normal, kind, color, (p, j) => attr(k, ts[j], lats[j], hs[j], u ? u[j][0] : 0, u ? u[j][1] : 0), share);
        for (let i = 0; i + 1 < breaks.length; i++) {
            const t0 = breaks[i], t1 = breaks[i + 1];
            if (t1 - t0 < 1e-5) continue;
            const piece = pieceOf((t0 + t1) / 2);
            const r0 = roofA + (roofB - roofA) * t0, r1 = roofA + (roofB - roofA) * t1;
            const L0 = lat(t0), L1 = lat(t1);
            if (!piece.open) {
                // Solid: the wall's face from the floor to the roof
                q(P(t0, 0), P(t1, 0), P(t1, r1), P(t0, r0), inward, K.concrete, C.concrete, [0, 0, r1, r0], [t0, t1, t1, t0], [L0, L1, L1, L0]);
                continue;
            }
            const across = [L0, L1, L1, L0], ts = [t0, t1, t1, t0], down = -O.sillDropM;
            // (seen from afar, at LOD1 and on a side road: the openings in the wall's plane, no depth)
            if (opts.thin) {
                if (piece.pillar !== undefined) q(P(t0, 0), P(t1, 0), P(t1, r1), P(t0, r0), inward, K.pillar, C.pillar, [0, 0, r1, r0], ts, across);
                else {
                    q(P(t0, 0), P(t1, 0), P(t1, O.from), P(t0, O.from), inward, K.concrete, C.concrete, [0, 0, O.from, O.from], ts, across);
                    q(P(t0, O.to), P(t1, O.to), P(t1, r1), P(t0, r0), inward, K.concrete, C.concrete, [O.to, O.to, r1, r0], ts, across);
                }
                continue;
            }
            // Over an opening or a pillar: the lintel from the head to the roof, its outer face outM out, capped at the
            // roof
            q(P(t0, O.to), P(t1, O.to), P(t1, r1), P(t0, r0), inward, K.concrete, C.concrete, [O.to, O.to, r1, r0], ts, across);
            q(P(t0, O.to, O.outM), P(t1, O.to, O.outM), P(t1, r1, O.outM), P(t0, r0, O.outM), out, K.pillar, C.pillar, [O.to, O.to, r1, r0], ts, across);
            q(P(t0, r0), P(t1, r1), P(t1, r1, O.outM), P(t0, r0, O.outM), [0, 1, 0], K.pillar, C.pillar, [r0, r1, r1, r0], ts, across);
            // Under it, from a hand under the floor: the outer face and its foot, closed from the valley
            q(P(t0, down, O.outM), P(t1, down, O.outM), P(t1, down), P(t0, down), [0, -1, 0], K.pillar, C.pillar, [down, down, down, down], ts, across);
            // (and its end where the wall beside it is solid: the depth between the wall's line and the outer face)
            // (inside the segment only: at its ends the next segment's pieces are its own to judge)
            for (const [t, dir] of [[t0, -1], [t1, 1]]) {
                if (t <= 1e-4 || t >= 1 - 1e-4 || pieceOf(t + dir * 1e-4).open) continue;
                const along = [fa.ax * dir, 0, fa.az * dir], r = roofA + (roofB - roofA) * t;
                q(P(t, down), P(t, down, O.outM), P(t, r, O.outM), P(t, r), along, K.pillar, C.pillar, [down, down, r, r], [t, t, t, t], [lat(t), lat(t), lat(t), lat(t)]);
            }
            if (piece.pillar !== undefined) {
                // A pillar: its inner face inM into the tube, its outer face outM out, its top under the lintel's inner
                // face, and its sides where the next piece in the segment is not a pillar (none at the segment's end:
                // the pillar goes on in the next segment)
                const inn = -O.inM, ou = O.outM;
                q(P(t0, 0, inn), P(t1, 0, inn), P(t1, O.to, inn), P(t0, O.to, inn), inward, K.pillar, C.pillar, [0, 0, O.to, O.to], ts, across.map(v => v - sign * O.inM));
                q(P(t0, down, ou), P(t1, down, ou), P(t1, O.to, ou), P(t0, O.to, ou), out, K.pillar, C.pillar, [down, down, O.to, O.to], ts, across);
                q(P(t0, O.to, inn), P(t1, O.to, inn), P(t1, O.to, 0), P(t0, O.to, 0), [0, -1, 0], K.pillar, C.pillar, [O.to, O.to, O.to, O.to], ts, across);
                for (const [t, dir] of [[t0, -1], [t1, 1]]) {
                    if (t <= 1e-4 || t >= 1 - 1e-4) continue;
                    const along = [fa.ax * dir, 0, fa.az * dir];
                    q(P(t, 0, inn), P(t, 0, 0), P(t, O.to, 0), P(t, O.to, inn), along, K.pillar, C.pillar, [0, 0, O.to, O.to], [t, t, t, t], [L0, L0, L0, L0]);
                    // (its outer side beside an opening; beside a solid wall the end above closes it)
                    if (pieceOf(t + dir * 1e-4).open) q(P(t, O.from, 0), P(t, O.from, ou), P(t, O.to, ou), P(t, O.to, 0), along, K.pillar, C.pillar, [O.from, O.from, O.to, O.to], [t, t, t, t], [L0, L0, L0, L0]);
                }
            } else {
                // An opening: the parapet to the sill, its top and its outer face, and the lintel's underside
                q(P(t0, 0), P(t1, 0), P(t1, O.from), P(t0, O.from), inward, K.concrete, C.concrete, [0, 0, O.from, O.from], ts, across);
                q(P(t0, O.from), P(t1, O.from), P(t1, O.from, O.outM), P(t0, O.from, O.outM), [0, 1, 0], K.pillar, C.pillar, [O.from, O.from, O.from, O.from], ts, across);
                q(P(t0, down, O.outM), P(t1, down, O.outM), P(t1, O.from, O.outM), P(t0, O.from, O.outM), out, K.pillar, C.pillar, [down, down, O.from, O.from], ts, across);
                q(P(t0, O.to), P(t1, O.to), P(t1, O.to, O.outM), P(t0, O.to, O.outM), [0, -1, 0], K.pillar, C.pillar, [O.to, O.to, O.to, O.to], ts, across);
            }
        }
    }

    // The fittings of segment k: lamps on the crown, a conduit beside them, the cable tray, the jet fans and the niches
    static fit(buf, k, rows, frames, attr, point, roofOf, share, opts) {
        const T = TubeLining.TUBE, K = TubeLining.KIND, C = TubeLining.COLORS;
        const a = rows[k], b = rows[k + 1], fa = frames[k], fb = frames[k + 1];
        const len = b.s - a.s;
        if (!(len > 0)) return;
        const tOf = s => (s - a.s) / len;
        const run = opts.run || [rows[0].s, rows[rows.length - 1].s];
        const runLength = run[1] - run[0];
        const down = [0, -1, 0];
        // A box under the roof from t0 to t1 along, lat0 to lat1 across, its bottom `deep` under the roof: its bottom
        // and its four sides (no top: it hangs a hand under the roof, never in the roof's plane)
        const hung = (t0, t1, lat0, lat1, deep, gap, kind, color, bottomKind = kind, bottomColor = color) => {
            const r = (t) => roofOf(k, t);
            const p = (t, lat, h) => point(k, t, lat, h);
            const hb0 = r(t0) - gap - deep, hb1 = r(t1) - gap - deep, ht0 = r(t0) - gap, ht1 = r(t1) - gap;
            const uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
            TubeLining.quad(buf, p(t0, lat0, hb0), p(t1, lat0, hb1), p(t1, lat1, hb1), p(t0, lat1, hb0), down, bottomKind, bottomColor, (q, j) => attr(k, [t0, t1, t1, t0][j], [lat0, lat0, lat1, lat1][j], [hb0, hb1, hb1, hb0][j], uv[j][0], uv[j][1]), share);
            const along = [(fa.ax + fb.ax) / 2, 0, (fa.az + fb.az) / 2], right = [(fa.rx + fb.rx) / 2, 0, (fa.rz + fb.rz) / 2];
            for (const [lat, n] of [[lat0, right.map(v => -v)], [lat1, right]]) TubeLining.quad(buf, p(t0, lat, hb0), p(t1, lat, hb1), p(t1, lat, ht1), p(t0, lat, ht0), n, kind, color, (q, j) => attr(k, [t0, t1, t1, t0][j], lat, [hb0, hb1, ht1, ht0][j]), share);
            for (const [t, n, hb, ht] of [[t0, along.map(v => -v), hb0, ht0], [t1, along, hb1, ht1]]) TubeLining.quad(buf, p(t, lat0, hb), p(t, lat1, hb), p(t, lat1, ht), p(t, lat0, ht), n, kind, color, (q, j) => attr(k, t, [lat0, lat1, lat1, lat0][j], [hb, hb, ht, ht][j]), share);
        };
        // Lamps: every lampM of metres along, and half way between them within entranceM of a portal
        const L = T.lampM, Lp = T.lamp;
        for (let i = Math.ceil((a.s - Lp.long / 2) / (L / 2)); i * (L / 2) < b.s + Lp.long / 2; i++) {
            const s = i * (L / 2);
            const inM = a.inM + (b.inM - a.inM) * Math.min(1, Math.max(0, tOf(s)));
            if (i % 2 !== 0 && !(inM < T.entranceM)) continue;
            // (a lamp belongs to the segment its middle falls in, cut to it where it reaches past)
            if (!(s >= a.s && s < b.s)) continue;
            // (whole: a lamp that reaches past the segment's end is laid on along its way)
            const t0 = tOf(s - Lp.long / 2), t1 = tOf(s + Lp.long / 2);
            hung(t0, t1, -Lp.wide / 2, Lp.wide / 2, Lp.deep, Lp.gap, K.metal, C.metal, K.lens, C.lens);
        }
        // A conduit beside the lamps' line, the length of the segment
        const Cd = T.conduit;
        hung(0, 1, Cd.lat, Cd.lat + Cd.wide, Cd.deep, Lp.gap, K.metal, C.metal);
        // The cable tray: on the concrete wall of a tunnel, on the mountain side of a gallery (stood off the rock's
        // face there); its bottom and its lip (its back against the wall, its top unseen)
        const side = opts.open ? -opts.open : opts.rock ? -opts.rock : 1;
        const rocky = opts.rock === side;
        {
            const Tr = T.tray;
            const wall = t => side * (fa.half + (fb.half - fa.half) * t - (rocky ? T.rockInM : 0));
            const h0 = roofOf(k, 0) - Tr.down, h1 = roofOf(k, 1) - Tr.down;
            const inner = t => wall(t) - side * Tr.out;
            const right = [(fa.rx + fb.rx) / 2, 0, (fa.rz + fb.rz) / 2];
            TubeLining.quad(buf, point(k, 0, wall(0), h0), point(k, 1, wall(1), h1), point(k, 1, inner(1), h1), point(k, 0, inner(0), h0), down, K.metal, C.metal, (q, j) => attr(k, [0, 1, 1, 0][j], [wall(0), wall(1), inner(1), inner(0)][j], [h0, h1, h1, h0][j]), share);
            TubeLining.quad(buf, point(k, 0, inner(0), h0), point(k, 1, inner(1), h1), point(k, 1, inner(1), h1 + Tr.lip), point(k, 0, inner(0), h0 + Tr.lip), right.map(v => -side * v), K.metal, C.metal, (q, j) => attr(k, [0, 1, 1, 0][j], [inner(0), inner(1), inner(1), inner(0)][j], [h0, h1, h1 + Tr.lip, h0 + Tr.lip][j]), share);
        }
        // Jet fans in pairs, in a long tube, where it is a tunnel (a gallery's openings air it)
        const F = T.fan;
        if (runLength >= F.minRunM && !opts.gallery) {
            for (let s = run[0] + F.firstM; s <= run[1] - F.firstM + 1e-6; s += F.everyM) {
                if (!(s >= a.s && s < b.s)) continue;
                for (const sign of [-1, 1]) {
                    const t = tOf(s), half = fa.half + (fb.half - fa.half) * t;
                    TubeLining.fan(buf, k, t, sign * (half - F.in), roofOf(k, t) - F.top - F.radius, frames, attr, point, share);
                }
            }
        }
        // Emergency niches on the concrete wall: a door and a green sign over it, a hand off the wall
        const N = T.niche;
        if (runLength >= N.minRunM && !rocky && !opts.gallery) {
            for (let s = run[0] + N.firstM; s <= run[1] - N.firstM + 1e-6; s += N.everyM) {
                if (!(s >= a.s && s < b.s)) continue;
                const t = tOf(s), half = fa.half + (fb.half - fa.half) * t;
                const dt = N.wide / 2 / len, w = side * (half - N.off);
                const t0 = Math.max(0, t - dt), t1 = Math.min(1, t + dt);
                const n = [-side * fa.rx, 0, -side * fa.rz];
                TubeLining.quad(buf, point(k, t0, w, 0.02), point(k, t1, w, 0.02), point(k, t1, w, N.high), point(k, t0, w, N.high), n, K.door, C.door, (q, j) => attr(k, [t0, t1, t1, t0][j], w, [0.02, 0.02, N.high, N.high][j], [0, N.wide, N.wide, 0][j], [0, 0, N.high, N.high][j]), share);
                const st = N.signW / 2 / len, sw = side * (half - N.off * 1.5);
                const s0 = Math.max(0, t - st), s1 = Math.min(1, t + st);
                TubeLining.quad(buf, point(k, s0, sw, N.signUp), point(k, s1, sw, N.signUp), point(k, s1, sw, N.signUp + N.signH), point(k, s0, sw, N.signUp + N.signH), n, K.sign, C.sign, (q, j) => attr(k, [s0, s1, s1, s0][j], sw, [N.signUp, N.signUp, N.signUp + N.signH, N.signUp + N.signH][j], [0, 1, 1, 0][j], [0, 0, 1, 1][j]), share);
            }
        }
    }

    // A jet fan: a cylinder of `sides` faces along the tube, centred t along segment k, `lat` across and `h` over the
    // floor, with its two ends (a grille in the shader: local u, v across the disc), laid in its own frame
    static fan(buf, k, t, lat, h, frames, attr, point, share) {
        const F = TubeLining.TUBE.fan, K = TubeLining.KIND, C = TubeLining.COLORS;
        const fa = frames[k], fb = frames[k + 1];
        const rx = (fa.rx + fb.rx) / 2, rz = (fa.rz + fb.rz) / 2, ax = (fa.ax + fb.ax) / 2, az = (fa.az + fb.az) / 2;
        const c = point(k, t, lat, h);
        const at = (o, ang) => [c[0] + ax * o + rx * Math.cos(ang) * F.radius, c[1] + Math.sin(ang) * F.radius, c[2] + az * o + rz * Math.cos(ang) * F.radius];
        const e = attr(k, t, lat, h);
        const fixed = (u, v) => () => ({ ...e, u, v });
        const half = F.long / 2;
        for (let i = 0; i < F.sides; i++) {
            const a0 = (i / F.sides) * Math.PI * 2, a1 = ((i + 1) / F.sides) * Math.PI * 2, mid = (a0 + a1) / 2;
            const n = [rx * Math.cos(mid), Math.sin(mid), rz * Math.cos(mid)];
            TubeLining.quad(buf, at(-half, a0), at(half, a0), at(half, a1), at(-half, a1), n, K.fan, C.fan, fixed(0, 0), share);
            for (const dir of [-1, 1]) {
                const centre = [c[0] + ax * half * dir, c[1], c[2] + az * half * dir];
                const uv = [[0.5, 0.5], [0.5 + 0.5 * Math.cos(a0), 0.5 + 0.5 * Math.sin(a0)], [0.5 + 0.5 * Math.cos(a1), 0.5 + 0.5 * Math.sin(a1)], [0.5, 0.5]];
                TubeLining.quad(buf, centre, at(half * dir, a0), at(half * dir, a1), centre, [ax * dir, 0, az * dir], K.metal, C.fan, (q, j) => ({ ...e, u: uv[j][0], v: uv[j][1] }), share);
            }
        }
    }

    // A buffer as a geometry (non-indexed, its normals as laid), or null when empty
    static geometry(buf) {
        if (!buf.positions.length) return null;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(buf.positions, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(buf.normals, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(buf.colors, 3));
        g.setAttribute('tube', new THREE.Float32BufferAttribute(buf.tube, 4));
        g.setAttribute('tubeAux', new THREE.Float32BufferAttribute(buf.aux, 4));
        g.setAttribute('tubeLocal', new THREE.Float32BufferAttribute(buf.local, 2));
        // (the road each triangle lines, where the buffer holds several: a side chunk's)
        if (buf.owners) g.userData.owners = buf.owners;
        g.computeBoundingSphere();
        return g;
    }

    // The lining and the fittings as meshes ('tube-lining', 'tube-fittings') under `group`; returns their triangles
    static addMeshes(group, parts) {
        let triangles = 0;
        for (const [name, buf] of [['tube-lining', parts.lining], ['tube-fittings', parts.fittings]]) {
            const geometry = TubeLining.geometry(buf);
            if (!geometry) continue;
            const mesh = new THREE.Mesh(geometry, TubeShade.material());
            mesh.name = name;
            mesh.receiveShadow = true;
            mesh.userData.world = 'road';
            group.add(mesh);
            triangles += buf.positions.length / 9;
        }
        return triangles;
    }
}

// The material of a tube's lining and fittings, and the light of its lamps for the road's shader (RoadSurface)
class TubeShade {
    // The lamps (linear): their colour, a warm white; how strong one is at a metre; the share of their light the
    // tube throws back as a fill; the lamps' height over the floor; and what the eye gains deep in a tube
    // (Graphics.adaptation), with how fast it adapts going in and coming out (seconds)
    static get LIGHT() { return { color: [1.0, 0.84, 0.64], strength: 15, fill: 0.24, lampH: 6.3, adapt: 1.35, inS: 1.4, outS: 0.6 }; }

    static get uniforms() {
        if (!TubeShade.shared) {
            const L = TubeShade.LIGHT, T = TubeLining.TUBE;
            TubeShade.shared = {
                uTubeLamp: { value: new THREE.Color().setRGB(L.color[0], L.color[1], L.color[2], THREE.LinearSRGBColorSpace) },
                uTubeLight: { value: new THREE.Vector4(T.lampM, T.entranceM, L.strength, L.lampH) },
                uTubeFill: { value: L.fill },
                uTubeDetail: { value: 1 },
                // The vehicles and riders near the camera (TubeShade.movers): x, z, the tube's light share and the
                // lamps' light where each stands
                uTubeMovers: { value: Array.from({ length: TubeShade.MOVERS }, () => new THREE.Vector4(0, 0, 0, 0)) },
                uTubeMoverCount: { value: 0 }
            };
        }
        return TubeShade.shared;
    }

    // The fine relief and the stains are drawn at every level; the relief's normals only where the level can pay
    // for them (Game.applyQuality: Low and Lowest draw the tube flat-lit)
    // The most vehicles and riders the shader reads, nearest the camera first; an object farther than MOVER_M from
    // every entry keeps the open air's light
    static get MOVERS() { return 16; }
    static get MOVER_M() { return 6; }

    // The tube's light where a vehicle or a rider stands at (x, y, z): {share, lamp, s}. The share is the lining's
    // (TubeLining.share: none at a portal, all of it dayM in, galleryShare in a gallery) where the point lies within
    // the ride's tube (inside its walls, under its roof); the lamp is the lamps' light on a body there
    // (TubeShade.lampsAt). `hint` is the last projection of the same object
    static moverAt(env, x, y, z, hint = null) {
        const none = { share: 0, lamp: 0, s: null };
        if (!env || !env.route || !env.tubeInfo) return none;
        const route = env.route, out = hint || {};
        route.project(x, z, hint && hint.index >= 0 ? hint : null, out);
        if (!(out.index >= 0)) return none;
        const point = route.points[out.index];
        if (Math.abs(out.lateral) > point.width / 2 + RoadMesh.TUBE_WALL_M || y > out.y + WorldRoute.ROOF_M || y < out.y - 2) return { ...none, s: out.s };
        const info = env.tubeInfo(), k = Math.max(0, Math.min(route.points.length - 2, Math.floor(route.toUnits(out.s))));
        const t = Math.min(1, Math.max(0, route.toUnits(out.s) - k));
        const inM = info.inM[k] + (info.inM[k + 1] - info.inM[k]) * t;
        const share = env.tubeShareAt(out.s);
        return { share, lamp: inM > 0 ? TubeShade.lampsAt(out.s, out.lateral, 1.2, inM) : 0, s: out.s };
    }

    // The lamps' light on a body at `s` metres along, `lat` across, `h` over the floor, `inM` in from a portal: the
    // shader's lamps (LAMPS_GLSL) on a face turned a little toward each, and the fill
    static lampsAt(s, lat, h, inM) {
        const T = TubeLining.TUBE, L = TubeShade.LIGHT;
        const at = ls => {
            const d = [ls - s, -lat, L.lampH - h];
            const r2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2] + 0.25, r = Math.sqrt(r2);
            return 0.7 * Math.max(d[2] / r, 0) / r2;
        };
        const k = Math.floor(s / T.lampM);
        let e = 0;
        for (let i = -1; i <= 2; i++) e += at((k + i) * T.lampM);
        const entrance = 1 - Math.min(1, Math.max(0, (inM - (T.entranceM - 4)) / 8));
        if (entrance > 0) for (let i = -1; i <= 1; i++) e += at((k + i + 0.5) * T.lampM) * entrance;
        return e * L.strength + L.fill * (1 + entrance);
    }

    // Writes the movers ([{x, z, share, lamp}], nearest the camera first) for every patched material
    static writeMovers(list) {
        const u = TubeShade.uniforms, n = Math.min(list.length, TubeShade.MOVERS);
        for (let i = 0; i < n; i++) u.uTubeMovers.value[i].set(list[i].x, list[i].z, list[i].share, list[i].lamp);
        u.uTubeMoverCount.value = n;
    }

    // A vehicle's or a rider's material, patched in place once: the shader finds its object's entry among the movers
    // (the one nearest the object's origin, within MOVER_M) and holds out the sun and the sky by its share, lit by the
    // lamps instead, as the lining is. A material the movers do not name keeps the open air's light, so the land seen
    // through a portal is not dimmed. Lit built-in materials only (an unlit one has no light to hold out)
    static patchMover(material) {
        if (!material || material.userData.tubeMover) return false;
        if (!(material.isMeshStandardMaterial || material.isMeshLambertMaterial || material.isMeshPhongMaterial || material.isMeshToonMaterial)) return false;
        material.userData.tubeMover = true;
        const before = material.onBeforeCompile;
        const key = material.customProgramCacheKey();
        const N = TubeShade.MOVERS, M = TubeShade.MOVER_M;
        material.onBeforeCompile = (shader, renderer) => {
            if (before) before.call(material, shader, renderer);
            TubeShade.injectMover(shader, N, M);
        };
        material.customProgramCacheKey = () => `${key}|tube-mover`;
        material.needsUpdate = true;
        return true;
    }

    // The mover's light in a compiling shader (TubeShade.patchMover): the entry is found once per vertex (all of an
    // object's vertices share its origin), and the light is changed before the reflected light is summed
    static injectMover(shader, N = TubeShade.MOVERS, M = TubeShade.MOVER_M) {
        const u = TubeShade.uniforms;
        Object.assign(shader.uniforms, { uTubeMovers: u.uTubeMovers, uTubeMoverCount: u.uTubeMoverCount, uTubeLamp: u.uTubeLamp });
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', `#include <common>
uniform vec4 uTubeMovers[${N}];
uniform int uTubeMoverCount;
varying vec2 vTubeMover;`)
            .replace('#include <project_vertex>', `#include <project_vertex>
{
    vec2 origin = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
    float best = ${M.toFixed(1)};
    vTubeMover = vec2(0.0);
    for (int i = 0; i < ${N}; i++) {
        if (i >= uTubeMoverCount) break;
        float d = distance(origin, uTubeMovers[i].xy);
        if (d < best) { best = d; vTubeMover = uTubeMovers[i].zw; }
    }
}`);
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>
uniform vec3 uTubeLamp;
varying vec2 vTubeMover;`)
            .replace('#include <aomap_fragment>', `#include <aomap_fragment>
// (in a tunnel or a gallery: the sun and the sky held out by the share, the tube's lamps in their place)
reflectedLight.directDiffuse *= 1.0 - vTubeMover.x;
reflectedLight.directSpecular *= 1.0 - vTubeMover.x;
reflectedLight.indirectDiffuse = reflectedLight.indirectDiffuse * (1.0 - vTubeMover.x) + diffuseColor.rgb * uTubeLamp * vTubeMover.y;
reflectedLight.indirectSpecular *= 1.0 - 0.8 * vTubeMover.x;`);
    }

    static setDetail(on) {
        TubeShade.uniforms.uTubeDetail.value = on ? 1 : 0;
    }

    // The light of the tube's lamps in GLSL: the irradiance at a point `s` metres along, `lat` across, `h` over the
    // floor, its normal `n` in the tube's frame (along, across, up), `inM` metres in from a portal. Each lamp is a
    // point on the crown that lights downward and nothing over its height; the four nearest are summed, and within
    // entranceM of a portal the lamps half way between them. The fill is the light the tube's walls throw back
    static get LAMPS_GLSL() {
        return `
uniform vec3 uTubeLamp;
uniform vec4 uTubeLight;
uniform float uTubeFill;
float tubeLampAt(float ls, float s, float lat, float h, vec3 n) {
    vec3 d = vec3(ls - s, -lat, uTubeLight.w - h);
    float r2 = dot(d, d) + 0.25;
    float r = sqrt(r2);
    float facing = max(dot(n, d) / r, 0.0);
    // (a lamp lights down and to the sides, nothing over its own height: no pool of light on the roof round it)
    float beam = max(d.z / r, 0.0);
    return facing * beam / r2;
}
vec3 tubeLamps(float s, float lat, float h, vec3 n, float inM) {
    float L = uTubeLight.x;
    float k = floor(s / L);
    float e = 0.0;
    for (int i = -1; i <= 2; i++) e += tubeLampAt((k + float(i)) * L, s, lat, h, n);
    float entrance = 1.0 - smoothstep(uTubeLight.y - 4.0, uTubeLight.y + 4.0, inM);
    if (entrance > 0.0) {
        float e2 = 0.0;
        for (int i = -1; i <= 1; i++) e2 += tubeLampAt((k + float(i) + 0.5) * L, s, lat, h, n);
        e += e2 * entrance;
    }
    // (the fill: what the lamps' light gives a face after the walls have thrown it back, more where the lamps are dense)
    float fill = uTubeFill * (1.0 + entrance);
    return uTubeLamp * (e * uTubeLight.z + fill);
}`;
    }

    // The concrete, rock, walkway and fittings of the lining in GLSL: albedo and relief by kind
    static material() {
        if (TubeShade.shared && TubeShade.lining) return TubeShade.lining;
        const T = TubeLining.TUBE, K = TubeLining.KIND;
        const f = v => (Number.isInteger(v) ? `${v}.0` : `${v}`);
        const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
        material.name = 'world-tube';
        material.userData.haze = true;
        const uniforms = TubeShade.uniforms;
        material.onBeforeCompile = (shader) => {
            Object.assign(shader.uniforms, uniforms, { uLandFloor: LandShade.uniforms.uLandFloor });
            shader.vertexShader = shader.vertexShader
                .replace('#include <common>', `#include <common>
attribute vec4 tube;
attribute vec4 tubeAux;
attribute vec2 tubeLocal;
varying vec4 vTube;
varying vec4 vTubeAux;
varying vec2 vTubeLocal;
varying vec3 vTubeWorld;
varying vec3 vTubeNormal;`)
                .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
vTube = tube;
vTubeAux = tubeAux;
vTubeLocal = tubeLocal;
vTubeWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
vTubeNormal = mat3(modelMatrix) * objectNormal;`);
            shader.fragmentShader = shader.fragmentShader
                .replace('#include <common>', `#include <common>
uniform float uTubeDetail;
uniform float uLandFloor;
varying vec4 vTube;
varying vec4 vTubeAux;
varying vec2 vTubeLocal;
varying vec3 vTubeWorld;
varying vec3 vTubeNormal;
${TubeShade.LAMPS_GLSL}
float tubeHash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float tubeNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(tubeHash(i), tubeHash(i + vec2(1.0, 0.0)), u.x), mix(tubeHash(i + vec2(0.0, 1.0)), tubeHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float tubeFbm(vec2 p) { return tubeNoise(p) * 0.5 + tubeNoise(p * 2.03 + 7.1) * 0.27 + tubeNoise(p * 4.1 + 3.7) * 0.15 + tubeNoise(p * 8.3 + 1.3) * 0.08; }
// The pour bays: seams near every bayM (jittered), the bay a point lies in and its distance to the nearest seam
float tubeSeam(float k) { return k * ${f(T.bayM)} + (tubeHash(vec2(k, 17.0)) - 0.5) * ${f(T.bayJitterM)}; }
vec2 tubeBay(float s) {
    float k = floor(s / ${f(T.bayM)});
    float here = tubeSeam(k), next = tubeSeam(k + 1.0), last = tubeSeam(k - 1.0);
    float bay = s < here ? k - 1.0 : (s < next ? k : k + 1.0);
    float d = min(min(abs(s - here), abs(s - next)), abs(s - last));
    return vec2(bay, d);
}
// The relief of each kind at (u, v) metres of its own face (along and up, or along and across)
float tubeRelief(float kind, vec2 p) {
    if (kind == ${f(K.rock)}) {
        // Rock: blocky fbm over a few metres, cracks where a ridged noise folds (no two alike, at no one height),
        // and grit
        float crack = 1.0 - abs(2.0 * tubeNoise(vec2(p.x * 0.45 + p.y * 0.2, p.y * 0.9 - p.x * 0.1) + tubeNoise(p * 0.3) * 1.5) - 1.0);
        float clump = smoothstep(0.55, 0.75, tubeNoise(p * 0.22 + 4.0));
        return 0.42 * tubeFbm(p * 0.6) + 0.1 * tubeNoise(p * 2.7) - 0.025 * smoothstep(0.95, 0.995, crack) * clump + 0.014 * tubeNoise(p * 11.0);
    }
    if (kind == ${f(K.shotcrete)}) return 0.2 * tubeFbm(p * 0.9) + 0.05 * tubeNoise(p * 4.5) + 0.02 * tubeNoise(p * 13.0);
    vec2 bay = tubeBay(p.x);
    float seam = -0.012 * (1.0 - smoothstep(0.012, 0.03, bay.y));
    float shift = 0.004 * (tubeHash(vec2(bay.x, 3.0)) - 0.5);
    return seam + shift + 0.003 * tubeNoise(p * 5.0 + bay.x) + 0.0015 * tubeNoise(p * 17.0);
}`)
                .replace('#include <color_fragment>', `#include <color_fragment>
float tubeKind = floor(vTube.z + 0.5);
float tubeS = vTube.x, tubeH = vTube.y;
vec3 tubeEmit = vec3(0.0);
{
    float dist = length(vViewPosition);
    float fine = 1.0 - smoothstep(40.0, 160.0, dist);
    vec2 bay = tubeBay(tubeS);
    float bayTone = 1.0 + 0.11 * (tubeHash(vec2(bay.x, 5.0)) - 0.5);
    float bayTint = 0.03 * (tubeHash(vec2(bay.x, 9.0)) - 0.5);
    vec3 c = diffuseColor.rgb;
    if (tubeKind == ${f(K.concrete)} || tubeKind == ${f(K.roof)} || tubeKind == ${f(K.pillar)} || ((tubeKind == ${f(K.rock)} || tubeKind == ${f(K.shotcrete)}) && tubeH < ${f(T.plinthM)})) {
        bool roof = tubeKind == ${f(K.roof)};
        vec2 p = roof ? vec2(tubeS, vTubeAux.z) : vec2(tubeS, tubeH);
        c *= bayTone * vec3(1.0 + bayTint, 1.0, 1.0 - bayTint);
        // the formwork: a lift line every 1.25 m up, faint, and the tie holes in rows
        if (!roof) {
            float lift = abs(fract(tubeH / 1.25) - 0.5) * 1.25;
            c *= mix(0.93, 1.0, clamp(smoothstep(0.004, 0.02, abs(lift - 0.625)) + 1.0 - fine, 0.0, 1.0));
            vec2 tie = vec2(fract(tubeS / 0.9 + tubeHash(vec2(bay.x, 7.0))) - 0.5, fract((tubeH - 0.35) / 0.75) - 0.5) * vec2(0.9, 0.75);
            c *= mix(1.0, mix(0.55, 1.0, smoothstep(0.018, 0.03, length(tie))), fine * step(1.3, tubeH));
        }
        // the seam: a dark joint, and below some of them lime washed out of it
        c *= mix(0.55, 1.0, smoothstep(0.008, 0.025, bay.y) * fine + (1.0 - fine) * 0.97);
        float lime = step(0.62, tubeHash(vec2(bay.x, 11.0))) * (1.0 - smoothstep(0.05, 0.55 + 0.3 * tubeNoise(vec2(tubeH, bay.x)), bay.y));
        if (!roof) c = mix(c, vec3(0.62, 0.61, 0.58), lime * 0.45 * smoothstep(0.8, 4.0, tubeH) * tubeNoise(vec2(tubeS * 6.0, tubeH * 0.6)));
        // water: streaks run down from the roof in some bays, darker where they are wet
        float streak = smoothstep(0.58, 0.8, tubeNoise(vec2(tubeS * 2.2 + tubeNoise(vec2(tubeH * 0.4, bay.x)) * 0.6, tubeH * 0.07 + bay.x)));
        streak *= step(0.35, tubeHash(vec2(bay.x, 13.0))) * smoothstep(0.5, 3.5, tubeH);
        if (!roof) c *= 1.0 - 0.28 * streak;
        // broad stains over metres
        float stain = tubeFbm(p * 0.35 + 2.0);
        c *= 0.86 + 0.26 * stain;
        if (roof) {
            // soot over the lanes, and the seams across
            float lanes = 1.0 - smoothstep(1.5, 5.5, abs(vTubeAux.z));
            c *= 1.0 - (0.18 + 0.2 * tubeNoise(vec2(tubeS * 0.3, vTubeAux.z * 0.8))) * lanes;
        } else {
            // the dirty band from the traffic: spray and soot low on the wall, darkest a hand over the walkway
            float band = 1.0 - smoothstep(0.35, 1.7 + 0.4 * tubeNoise(vec2(tubeS * 0.25, 1.0)), tubeH);
            float splash = 0.6 + 0.4 * tubeNoise(vec2(tubeS * 3.0, tubeH * 6.0));
            c = mix(c, vec3(0.13, 0.12, 0.11), band * splash * 0.62);
        }
    } else if (tubeKind == ${f(K.rock)} || tubeKind == ${f(K.shotcrete)}) {
        vec2 p = vec2(tubeS, tubeH);
        float tone = tubeFbm(p * 0.45 + 11.0);
        float speck = tubeNoise(p * 9.0);
        if (tubeKind == ${f(K.rock)}) {
            // granite gneiss: blotches of grey and brown, darker cracks, rusty seepage, wet patches
            float beds = tubeNoise(vec2(tubeS * 0.12 + tubeH * 0.3, tubeH * 0.5));
            float crack = 1.0 - abs(2.0 * tubeNoise(vec2(tubeS * 0.45 + tubeH * 0.2, tubeH * 0.9 - tubeS * 0.1) + tubeNoise(p * 0.3) * 1.5) - 1.0);
            c *= (0.68 + 0.55 * tone) * (0.88 + 0.24 * beds) * (0.92 + 0.16 * speck * fine);
            float clump = smoothstep(0.55, 0.75, tubeNoise(p * 0.22 + 4.0));
            c *= mix(1.0, 0.72, smoothstep(0.95, 0.995, crack) * clump * fine);
            c = mix(c, c * vec3(1.15, 0.98, 0.82), smoothstep(0.55, 0.85, tubeNoise(p * 0.3 + 5.0)) * 0.6);
            float wet = smoothstep(0.6, 0.85, tubeNoise(vec2(tubeS * 0.9 + tubeNoise(vec2(tubeH * 0.5, 2.0)), tubeH * 0.12)));
            c *= 1.0 - 0.35 * wet;
        } else {
            // sprayed in passes: blotches of a darker and a paler mix, and the rock's shape under it
            c *= (0.74 + 0.42 * tone) * (0.92 + 0.16 * speck * fine) * (0.9 + 0.2 * smoothstep(0.3, 0.7, tubeNoise(p * 0.8 + 9.0)));
            float wet = smoothstep(0.62, 0.85, tubeNoise(vec2(tubeS * 1.4, tubeH * 0.1)));
            c *= 1.0 - 0.25 * wet;
        }
        // the traffic's dirt on the rock's foot too
        c = mix(c, vec3(0.12, 0.11, 0.10), (1.0 - smoothstep(1.0, 2.2, tubeH)) * 0.4);
    } else if (tubeKind == ${f(K.walk)}) {
        // The walkway: a kerb of precast blocks at its inner edge with its arris worn, then cast slabs, grime
        float u = vTubeLocal.x;
        float kerb = 1.0 - smoothstep(0.24, 0.27, u);
        float block = abs(fract(tubeS / 1.0) - 0.5);
        float slab = abs(fract(tubeS / 2.75) - 0.5) * 2.75;
        c *= mix(1.0, 1.12 + 0.08 * (tubeHash(vec2(floor(tubeS), 21.0)) - 0.5), kerb);
        c *= mix(1.0, mix(0.6, 1.0, smoothstep(0.004, 0.012, block)), kerb * fine);
        c *= mix(1.0, mix(0.62, 1.0, smoothstep(0.006, 0.02, slab)), (1.0 - kerb) * fine);
        // the arris of the kerb, worn and lit, and the dark line of the joint to the road
        c *= mix(1.0, 1.15, (1.0 - smoothstep(0.02, 0.05, u)) * fine);
        c *= mix(0.6, 1.0, smoothstep(0.004, 0.014, u));
        c *= mix(0.7, 1.0, smoothstep(0.004, 0.012, abs(u - 0.255)) * fine + 1.0 - fine);
        float grime = 0.5 + 0.5 * tubeFbm(vec2(tubeS * 0.6, u * 2.0));
        c *= 0.78 + 0.28 * grime;
        c = mix(c, vec3(0.14, 0.13, 0.12), (smoothstep(0.6, 1.4, u) * 0.35 + kerb * 0.15) * grime);
        c *= 0.95 + 0.1 * tubeNoise(vec2(tubeS, u) * 7.0);
    } else if (tubeKind == ${f(K.lens)}) {
        // A lamp's diffuser: bright, a darker frame round it
        vec2 uv = vTubeLocal;
        float frame = smoothstep(0.0, 0.06, min(min(uv.x, 1.0 - uv.x) * 6.0, min(uv.y, 1.0 - uv.y)));
        tubeEmit = uTubeLamp * 4.5 * frame;
        c *= mix(0.35, 1.0, frame);
    } else if (tubeKind == ${f(K.metal)} || tubeKind == ${f(K.fan)}) {
        c *= 0.85 + 0.25 * tubeNoise(vec2(tubeS * 3.0, tubeH * 3.0));
        // a fan's end: a dark grille round its hub
        vec2 uv = vTubeLocal - 0.5;
        if (length(uv) > 0.001) c *= mix(1.0, 0.35 + 0.4 * step(0.5, fract(length(uv) * 9.0)), smoothstep(0.08, 0.12, length(uv)) * step(length(uv), 0.47));
    } else if (tubeKind == ${f(K.sign)}) {
        // A green sign, lit from within, with a white pictogram: a figure going through a door, no text
        vec2 uv = vTubeLocal;
        float border = step(0.05, min(min(uv.x, 1.0 - uv.x) * 0.62 / 0.42, min(uv.y, 1.0 - uv.y)));
        vec2 q = (uv - vec2(0.38, 0.5)) * vec2(0.62 / 0.42, 1.0);
        float head = 1.0 - smoothstep(0.065, 0.08, length(q - vec2(0.0, 0.25)));
        float body = 1.0 - smoothstep(0.03, 0.045, abs(q.x - 0.03 + q.y * 0.35)) ;
        body *= step(-0.3, q.y) * step(q.y, 0.15);
        float door = step(0.66, uv.x) * step(uv.x, 0.84) * step(0.15, uv.y) * step(uv.y, 0.85) * (1.0 - step(0.7, uv.x) * step(uv.x, 0.8) * step(0.21, uv.y) * step(uv.y, 0.79));
        float white = max(max(head, body), door) * border + (1.0 - border);
        c = mix(c, vec3(0.92), white);
        tubeEmit = mix(vec3(0.02, 0.32, 0.12), vec3(0.85), white) * 1.1;
    } else if (tubeKind == ${f(K.door)}) {
        vec2 uv = vTubeLocal;
        float edge = smoothstep(0.02, 0.05, min(min(uv.x, ${f(T.niche.wide)} - uv.x), min(uv.y, ${f(T.niche.high)} - uv.y)));
        c *= mix(0.45, 1.0, edge);
        c *= mix(1.0, 0.8, smoothstep(0.75, 0.8, uv.x) * step(uv.x, 0.85) * step(0.95, uv.y) * step(uv.y, 1.1));
        c = mix(c, vec3(0.14, 0.13, 0.12), (1.0 - smoothstep(0.1, 0.6, uv.y)) * 0.4);
    }
    // Marker lights on both walls at a hand under a metre, every 25 m, amber; and the reflectors between them
    if (tubeKind == ${f(K.concrete)} || tubeKind == ${f(K.rock)} || tubeKind == ${f(K.shotcrete)} || tubeKind == ${f(K.pillar)}) {
        float m = abs(fract(tubeS / 25.0 + 0.5) - 0.5) * 25.0;
        float r = abs(fract(tubeS / 12.5) - 0.5) * 12.5;
        float row = 1.0 - smoothstep(0.03, 0.045, abs(tubeH - 0.85));
        float lamp = (1.0 - smoothstep(0.05, 0.07, m)) * row;
        float reflector = (1.0 - smoothstep(0.03, 0.045, r)) * (1.0 - smoothstep(0.025, 0.04, abs(tubeH - 0.85))) * (1.0 - lamp);
        c = mix(c, vec3(0.95, 0.55, 0.12), max(lamp, reflector * 0.8));
        tubeEmit += vec3(1.0, 0.45, 0.08) * 3.0 * lamp;
    }
    diffuseColor.rgb = c;
}`)
                .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
    // The relief: a height of the face's own metres, its slope along the face's two ways bends the normal. The way
    // along is the tube's; the other is up on an upright face and across on a level one. The normal already faces the
    // eye (three flips it on a back face), so the relief stands toward whoever looks at it, on either side
    float dist = length(vViewPosition);
    float near = uTubeDetail * (1.0 - smoothstep(25.0, 90.0, dist));
    bool rough = tubeKind == ${f(K.rock)} || tubeKind == ${f(K.shotcrete)};
    if (rough) near = uTubeDetail * (1.0 - smoothstep(60.0, 220.0, dist));
    bool plain = tubeKind == ${f(K.lens)} || tubeKind == ${f(K.sign)} || tubeKind == ${f(K.door)} || tubeKind == ${f(K.metal)} || tubeKind == ${f(K.fan)} || tubeKind == ${f(K.walk)};
    if (near > 0.0 && !plain && !(rough && tubeH < ${f(T.plinthM)})) {
        vec3 along = normalize(vec3(vTubeAux.x, 0.0, vTubeAux.y));
        vec3 nWorld = normalize(vTubeNormal);
        bool level = abs(nWorld.y) > 0.7;
        vec3 other = level ? normalize(cross(along, vec3(0.0, 1.0, 0.0))) : vec3(0.0, 1.0, 0.0);
        vec2 p = level ? vec2(tubeS, vTubeAux.z) : vec2(tubeS, tubeH);
        float e = 0.02;
        float h0 = tubeRelief(tubeKind, p);
        float gu = (tubeRelief(tubeKind, p + vec2(e, 0.0)) - h0) / e;
        float gv = (tubeRelief(tubeKind, p + vec2(0.0, e)) - h0) / e;
        vec3 tu = normalize((viewMatrix * vec4(along, 0.0)).xyz), tv = normalize((viewMatrix * vec4(other, 0.0)).xyz);
        // (the face's ways as the eye sees them: the slope bends the normal against them)
        normal = normalize(normal - near * (gu * tu + gv * tv));
    }
}`)
                .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += tubeEmit;`)
                .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
{
    // The tube's own light. Inside (the front of a face, and every fitting), the sun and the sky are held out by the
    // share and the lamps light it; a face seen from outside (a gallery's pillar from the valley) keeps the day
    bool inside = gl_FrontFacing || tubeKind >= ${f(K.lens)};
    float share = inside ? vTube.w : 0.0;
    vec3 nW = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
    vec3 along = normalize(vec3(vTubeAux.x, 0.0, vTubeAux.y));
    vec3 right = vec3(along.z, 0.0, -along.x);
    vec3 nT = vec3(dot(nW, along), dot(nW, right), nW.y);
    vec3 lamps = inside ? tubeLamps(tubeS, vTubeAux.z, tubeH, nT, vTubeAux.w) : vec3(0.0);
    reflectedLight.directDiffuse *= 1.0 - share;
    reflectedLight.indirectDiffuse = reflectedLight.indirectDiffuse * (1.0 - share) + diffuseColor.rgb * lamps;
    // (the day that still comes in, by the share left to it, thrown back by the road and the walls: an underside of a
    // gallery's roof or a portal's soffit is shaded concrete, never a black slab, as RoadMesh.material's floor)
    float upT = dot(normal, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz));
    reflectedLight.indirectDiffuse = max(reflectedLight.indirectDiffuse, diffuseColor.rgb * uLandFloor * 3.0 * (1.0 - share) * (0.8 + 0.2 * upT));
}`);
            LandShade.injectHaze(shader);
        };
        material.customProgramCacheKey = () => 'world-tube-2';
        TubeShade.lining = material;
        return material;
    }
}
