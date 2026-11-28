// WorldDams: the dams a world shows, each a model built from its own data (js/world/dam-data.js, swissTLM3D's outline
// of the dam: the upstream chain on the water, the downstream chain at the face's foot with the ground's height, the
// crest's height and the dam's kind), seated in its valley:
//   - the land under the dam is cut (`pits`, TerrainMesh.pitCuts): within the outline, INSET_M in from it, the land is
//     held under the model's floor, so no land of the old dam-shaped ground stands through the concrete; the land past
//     the outline keeps its heights, so the abutments are the rock as it was, up to the model's faces
//   - the physics reads the dam's top as the ground there (heightAt, WorldGround.tileHeight), so it rides what is drawn
//   - a road on the crest is the road's own (its ribbon, its walls, its physics): the crest stands ROAD_SINK_M under
//     it and wide enough for its carriageway and verge
// Kinds: 'arch' and 'gravity' are concrete walls (an upright upstream face, a crest, a downstream face down to the
// foot the data gives: thin for an arch, broad for a gravity wall), 'embankment' an earth and rock bank (both faces
// sloped, the crest in the middle). No maker's or operator's name, logo or sign text is drawn on any of them.
class WorldDams {
    static get RULE() {
        return Object.freeze({
            // the crest's width by kind (a road on it widens it to its carriageway and verge)
            crestM: { arch: 5, gravity: 6.5, embankment: 8 },
            // metres the floor stands under the lower of the two feet: the faces go down to it, the land in the pit under it
            floorM: 4,
            // metres past each foot the land is read for the foot's height and the floor
            footM: 1.5,
            // the pit's edge in from the model's faces, so the land's step stands behind the concrete
            insetM: 0.3,
            // the parapets on the crest: upstream a concrete wall, downstream a low upstand and a steel railing
            parapet: { h: 1.05, w: 0.35, upstand: 0.3, rail: 1.1 },
            // a spillway in the crest of a wall longer than `minM`: `share` of its length in the middle, its sill `dropM`
            // under the crest, a pier every `pierRows` rows carrying the walkway's slab
            spill: { minM: 110, share: 0.16, dropM: 2.4, pierRows: 2, slabM: 0.5 },
            // the valve house on the crest's downstream edge, near the first end: along, across, high
            house: { along: 6, across: 4.2, high: 3.4, at: 0.12 },
            // the model's level of detail: the near model within lodM of the camera, the far one (every `farRows` row,
            // no parapets, house or spillway) past it
            lodM: 650, farRows: 3
        });
    }

    static get INSET_M() { return WorldDams.RULE.insetM; }
    // Rows either side a row's width and foot are eased over
    static get EASE() { return 2; }
    // A row cut back short of the next one it would cross stops this far before it
    static get CLEAR_M() { return 1; }
    // A wall that holds back land higher than the dam's top stands this far over the land (WorldDams.holds)
    static get HOLD_M() { return 0.3; }
    // A crest under a road: its top this far under the road's surface (the ribbon lies on it)
    static get ROAD_SINK_M() { return 0.12; }
    // Off a road the crest climbs back to its own height at this grade, so a road that leaves the dam lower takes only
    // the crest's end down with it, not the whole crest
    static get CREST_GRADE() { return 0.08; }
    // The lake against an upstream face: the first water node within LAKE_M upstream of a row, at the reservoir's level
    // (within LAKE_LEVEL_M of the data's); WorldDams.flood makes the land between it and the face lake
    static get LAKE_M() { return 40; }
    static get LAKE_LEVEL_M() { return 3; }
    // A land node within this of the lake's level is the lake's surface too (the lake's outline and the elevation
    // model's flat water part by a cell or two)
    static get LAKE_FLAT_M() { return 0.3; }
    // A node flooded stands no farther downstream than this past the face, and its ring of water (one cell on, Water)
    // no farther than the downstream foot: the water stays inside the dam
    static get FLOOD_IN_M() { return 4; }
    // The land between the water and a face that is not flooded (a thin dam's) stands this far under the lake
    static get LAKE_SINK_M() { return 1; }
    // A node this far or less under the lake takes the lake's level as water (Water.LEVEL_STEP_M: the water's own
    // level reaches it); one lower is left as land
    static get LAKE_STEP_M() { return 1; }

    // The dams of a data folder (WorldDamData), or none
    static listOf(folder) {
        const table = typeof WorldDamData !== 'undefined' ? WorldDamData : null;
        return (table && folder && table[folder]) || [];
    }

    // The chunks of side roads round a folder's dams (WorldData.chunksNear), which WorldEnvironment.load has before the
    // dams are laid out
    static chunksOf(data) {
        const wanted = new Set();
        for (const d of WorldDams.listOf(data.base)) {
            const pts = d.up.concat(d.down), x = pts.reduce((a, p) => a + p[0], 0) / pts.length, z = pts.reduce((a, p) => a + p[1], 0) / pts.length;
            const reach = Math.max(...pts.map(p => Math.hypot(p[0] - x, p[1] - z))) + 40;
            for (const k of data.chunksNear(x, z, reach)) wanted.add(k);
        }
        return [...wanted];
    }

    // The height tiles under a folder's dams, which WorldEnvironment.load has before the dams are laid out
    static tilesOf(data) {
        const wanted = new Set(), m = WorldData.TILE_M;
        for (const d of WorldDams.listOf(data.base)) {
            const pts = d.up.concat(d.down);
            const x0 = Math.min(...pts.map(p => p[0])) - 40, x1 = Math.max(...pts.map(p => p[0])) + 40, z0 = Math.min(...pts.map(p => p[1])) - 40, z1 = Math.max(...pts.map(p => p[1])) + 40;
            for (let tx = Math.floor(x0 / m); tx <= Math.floor(x1 / m); tx++) for (let tz = Math.floor(z0 / m); tz <= Math.floor(z1 / m); tz++) wanted.add(`${tx},${tz}`);
        }
        return [...wanted].filter(k => data.hasTile(k));
    }

    // `list` the folder's dams; `roadAt(x, z)` the highest road surface whose carriageway or verge holds (x, z), or null
    // `groundAt(x, z)` the land's own height there (the tile's nodes, before any cut), or null; `data` the world's data
    // (WorldData), whose water nodes show where each lake meets its dam
    constructor(list, { roadAt = null, groundAt = null, data = null } = {}) {
        this.roadAt = roadAt;
        const lakeAt = data ? WorldDams.lakeReader(data) : null;
        this.dams = list.map(d => WorldDams.plan(d, roadAt, groundAt, lakeAt));
        // The one table the lake water reads (js/world/water.js): each dam's upstream face as a line in plan, the
        // reservoir's level on it and the crest, so the water is drawn deep up to the face
        Dams.faces = this.dams.map(d => Object.freeze({ id: d.data.id, face: d.rows.map(r => [r.u[0], r.u[1]]), water: d.data.water, crest: d.crest }));
    }

    // A reader of the nodes: (x, z) to the nearest node's {wet, h} (whether it is water, its height), or null
    static lakeReader(data) {
        const m = WorldData.TILE_M, cell = WorldData.CELL_M, n = WorldData.TILE_N;
        return (x, z) => {
            const tx = Math.floor(x / m), tz = Math.floor(z / m), tile = data.tile(`${tx},${tz}`);
            if (!tile) return null;
            const i = Math.max(0, Math.min(n - 1, Math.round((x - tx * m) / cell))), j = Math.max(0, Math.min(n - 1, Math.round((z - tz * m) / cell)));
            return { wet: tile.zones[j * n + i] === WorldData.ZONE.water, h: tile.heights[j * n + i] };
        };
    }

    // One dam laid out: its rows (each {u, a, L, H, zu, zd, f, c0, c1, road, spill, pier, lake}), the pit and the boxes
    static plan(data, roadAt = null, groundAt = null, lakeAt = null) {
        const R = WorldDams.RULE, n = data.up.length;
        const rows = [];
        for (let k = 0; k < n; k++) {
            const u = data.up[k], d = data.down[k];
            rows.push({ u: [u[0], u[1]], d: [d[0], d[1]], zu: u[2], zd: d[2] });
        }
        // Across each row: square to the crest (a row along the crest ran out past the abutment into the rock, and
        // rows that followed the outline's foot crossed)
        const side = [];
        for (let k = 0; k < n; k++) {
            const p = rows[Math.max(0, k - 1)].u, q = rows[Math.min(n - 1, k + 1)].u;
            const tx = q[0] - p[0], tz = q[1] - p[1], tl = Math.hypot(tx, tz) || 1;
            side.push([-tz / tl, tx / tl]);
        }
        // (the normal's sign: toward the downstream chain, as most rows have it)
        let vote = 0;
        rows.forEach((row, k) => { vote += (row.d[0] - row.u[0]) * side[k][0] + (row.d[1] - row.u[1]) * side[k][1]; });
        const sign = vote < 0 ? -1 : 1;
        // (each row square to the crest, its normal eased over EASE rows either side, as far across as the data's foot
        // lies along it)
        rows.forEach((row, k) => {
            let x = 0, z = 0;
            for (let j = Math.max(0, k - WorldDams.EASE - 1); j <= Math.min(n - 1, k + WorldDams.EASE + 1); j++) { x += side[j][0]; z += side[j][1]; }
            const len = Math.hypot(x, z) || 1;
            row.a = [(x / len) * sign, (z / len) * sign];
            row.L = Math.max(0, (row.d[0] - row.u[0]) * row.a[0] + (row.d[1] - row.u[1]) * row.a[1]);
        });
        // The crest: under the road where one runs on the dam, else the data's
        const width = R.crestM[data.kind] || R.crestM.gravity;
        let crest = data.crest;
        for (const row of rows) {
            row.road = null;
            row.H = crest;
            if (!roadAt) continue;
            const span = Math.max(row.L, width), steps = Math.max(4, Math.ceil(span / 1.5));
            for (let s = 0; s <= steps; s++) {
                const t = (span * s) / steps, y = roadAt(row.u[0] + row.a[0] * t, row.u[1] + row.a[1] * t);
                if (y === null) continue;
                row.road = row.road || { y: -Infinity, t0: Infinity, t1: -Infinity };
                row.road.y = Math.max(row.road.y, y);
                row.road.t0 = Math.min(row.road.t0, t);
                row.road.t1 = Math.max(row.road.t1, t);
            }
            row.H = row.road ? Math.min(crest, row.road.y - WorldDams.ROAD_SINK_M) : crest;
        }
        // (each row's crest no higher than a road's row plus CREST_GRADE of the way along to it: the crest takes a ramp
        // down to a road that leaves the dam lower, and keeps its own height elsewhere)
        const along = [0];
        for (let k = 1; k < n; k++) along.push(along[k - 1] + Math.hypot(rows[k].u[0] - rows[k - 1].u[0], rows[k].u[1] - rows[k - 1].u[1]));
        const low = rows.map(r => r.H);
        rows.forEach((row, k) => { for (let j = 0; j < n; j++) if (low[j] < crest) row.H = Math.min(row.H, low[j] + WorldDams.CREST_GRADE * Math.abs(along[k] - along[j])); });
        // The lake against the face: its level the median of the first water node at the reservoir's level upstream of
        // each row within LAKE_M (no farther than land over the crest: the valley's side, and a lake past it is not this
        // face's); then on each row the reach to the first node of the lake (water, or land at its level), eased (the
        // largest of the row and its neighbours, so no row between two that reach the water falls short of it)
        const walk = (row, take) => {
            for (let d = 0; d <= WorldDams.LAKE_M; d += WorldData.CELL_M / 2) {
                const node = lakeAt(row.u[0] - row.a[0] * d, row.u[1] - row.a[1] * d);
                if (!node || node.h > row.H) return null;
                if (take(node)) return { d, h: node.h };
            }
            return null;
        };
        const levels = [];
        if (lakeAt && Number.isFinite(data.water)) for (const row of rows) {
            const hit = walk(row, node => node.wet && Math.abs(node.h - data.water) <= WorldDams.LAKE_LEVEL_M);
            if (hit) levels.push(hit.h);
        }
        levels.sort((a, b) => a - b);
        const level = levels.length ? levels[Math.floor(levels.length / 2)] : null;
        for (const row of rows) {
            const hit = level === null ? null : walk(row, node => Math.abs(node.h - level) <= (node.wet ? WorldDams.LAKE_LEVEL_M : WorldDams.LAKE_FLAT_M));
            row.lake = hit ? hit.d : null;
        }
        const reach = rows.map(r => r.lake);
        rows.forEach((row, k) => {
            const near = [reach[k - 1], reach[k], reach[k + 1]].filter(d => d !== null && d !== undefined);
            row.lake = near.length && reach[k] !== null ? Math.max(...near) : null;
        });
        // (the outline's foot eased over EASE rows either side: swissTLM3D's foot steps round outlets and stairs, and
        // drawn row by row it was a face of notches)
        const ease = (key) => {
            const raw = rows.map(r => r[key]);
            rows.forEach((row, k) => {
                if (k === 0 || k === n - 1) return;
                let sum = 0, count = 0;
                for (let j = Math.max(1, k - WorldDams.EASE); j <= Math.min(n - 2, k + WorldDams.EASE); j++) { sum += raw[j]; count++; }
                row[key] = sum / count;
            });
        };
        ease('L');
        ease('zd');
        // Each row's section: the crest from c0 to c1 across, at least the kind's width (and the road's band), and the
        // row as wide as its crest
        for (const row of rows) {
            let c0 = 0, c1 = width;
            if (data.kind === 'embankment') {
                c0 = Math.max(0, (row.L - width) / 2);
                c1 = c0 + width;
            }
            if (row.road) {
                c0 = Math.min(c0, Math.max(0, row.road.t0 - 1.5));
                c1 = Math.max(c1, row.road.t1 + 1.5);
            }
            row.L = Math.max(row.L, c1);
            row.c0 = c0;
            row.c1 = c1;
            // (a foot over the crest is the abutment's rock at the crest: the face ends there)
            // (the foot meets the land as drawn where it is lower than the data's: no gap under the toe; the floor is
            // under both feet and the land just past them)
            const past = (t) => groundAt ? groundAt(row.u[0] + row.a[0] * t, row.u[1] + row.a[1] * t) : null;
            const foot = past(row.L + R.footM), lake = past(-R.footM);
            if (foot !== null) row.zd = Math.min(row.zd, foot);
            row.zd = Math.min(row.zd, row.H);
            row.zu = Math.min(row.zu, row.H);
            row.f = Math.min(row.zu, row.zd, foot === null ? Infinity : foot, lake === null ? Infinity : lake) - R.floorM;
            // (the land at the pit's edges, INSET_M in from the faces: where it stands over the dam's top there, a wall
            // holds it back, in front of the land's cut step, which stood over the crest stretched; WorldDams.holds)
            row.gu = past(WorldDams.INSET_M);
            row.gd = past(row.L - WorldDams.INSET_M);
            // (where the lake meets the face, the land there is made lake and lake bed: WorldDams.flood)
            if (row.lake !== null && row.gu !== null) row.gu = Math.min(row.gu, level - WorldDams.LAKE_SINK_M);
        }
        // (no two rows cross: on the inside of a bend a row is cut back short of the next one, CLEAR_M before they meet;
        // and no row stands out past both its neighbours by more than CLEAR_M, so a row cut back takes its neighbours
        // down with it in a smooth dip, not a notch the land showed through)
        const full = rows.map(r => r.L);
        for (let pass = 0; pass < 40; pass++) {
            let moved = false;
            for (let k = 0; k + 1 < n; k++) {
                const a = rows[k], b = rows[k + 1];
                const hit = WorldDams.meet(a.u, [a.u[0] + a.a[0] * a.L, a.u[1] + a.a[1] * a.L], b.u, [b.u[0] + b.a[0] * b.L, b.u[1] + b.a[1] * b.L]);
                if (!hit) continue;
                a.L = Math.max(a.c1, hit[0] * a.L - WorldDams.CLEAR_M);
                b.L = Math.max(b.c1, hit[1] * b.L - WorldDams.CLEAR_M);
                moved = true;
            }
            for (let k = 0; k < n; k++) {
                const near = Math.min(k > 0 ? rows[k - 1].L : Infinity, k + 1 < n ? rows[k + 1].L : Infinity) + WorldDams.CLEAR_M * 2;
                if (rows[k].L > near + 1e-6) { rows[k].L = Math.max(rows[k].c1, near); moved = true; }
            }
            if (!moved) break;
        }
        // (a row cut back has its foot where it now ends: its foot's height and the land at its pit's edge were read at
        // the foot before, lower down the valley's side, so its face ran down under the land and the pit's cut step stood
        // up to 22 m over it at Räterichsboden, its texture stretched)
        if (groundAt) rows.forEach((row, k) => {
            if (row.L >= full[k] - 1e-6) return;
            const past = t => groundAt(row.u[0] + row.a[0] * t, row.u[1] + row.a[1] * t);
            const foot = past(row.L + R.footM);
            if (foot !== null) row.zd = Math.max(row.zd, Math.min(row.H, foot));
            row.gd = past(row.L - WorldDams.INSET_M);
        });
        // The ends: the land at the pit's end edges, every metre across
        const endGround = (k, j) => {
            const a = rows[k], b = rows[j], dx = b.u[0] - a.u[0], dz = b.u[1] - a.u[1], len = Math.hypot(dx, dz) || 1, e = [dx / len, dz / len];
            const out = [], count = Math.max(1, Math.ceil(a.L));
            for (let i = 0; i <= count; i++) {
                const t = (a.L * i) / count;
                out.push({ t, e, y: groundAt ? groundAt(a.u[0] + a.a[0] * t + e[0] * WorldDams.INSET_M, a.u[1] + a.a[1] * t + e[1] * WorldDams.INSET_M) : null });
            }
            return out;
        };
        rows[0].ends = endGround(0, 1);
        rows[n - 1].ends = endGround(n - 1, n - 2);
        // The spillway: the middle of a long concrete wall, its sill under the crest, a pier every pierRows rows
        const length = data.length || 0;
        const spill = data.kind !== 'embankment' && length >= R.spill.minM;
        const mid = (n - 1) / 2, half = Math.max(1, Math.round(((n - 1) * R.spill.share) / 2));
        rows.forEach((row, k) => {
            row.spill = spill && Math.abs(k - mid) <= half;
            row.pier = row.spill && (Math.round(k - mid) % R.spill.pierRows === 0 || Math.abs(k - mid) >= half);
        });
        const drawn = rows;
        // The pit: each quad between two rows of the outline, INSET_M in from the faces
        const quads = [];
        let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
        const inset = WorldDams.INSET_M;
        const at = (row, t) => [row.u[0] + row.a[0] * t, row.u[1] + row.a[1] * t];
        for (let k = 0; k + 1 < n; k++) {
            const a = rows[k], b = rows[k + 1];
            const first = k === 0, last = k + 1 === n - 1;
            const c = [at(a, inset), at(b, inset), at(b, b.L - inset), at(a, a.L - inset)];
            // (and INSET_M in from each end's wall)
            const pull = (p, q) => { const dx = q[0] - p[0], dz = q[1] - p[1], len = Math.hypot(dx, dz) || 1, m = Math.min(inset, len / 3); return [p[0] + (dx / len) * m, p[1] + (dz / len) * m]; };
            if (first) { c[0] = pull(c[0], c[1]); c[3] = pull(c[3], c[2]); }
            if (last) { c[1] = pull(c[1], c[0]); c[2] = pull(c[2], c[3]); }
            if (WorldDams.convex(c)) {
                quads.push({ c, f: [a.f, b.f], outer: [true, last, true, first] });
                continue;
            }
            // (a quad that does not turn one way round: two triangles on the diagonal that lies inside it, each a quad
            // with its last corner doubled, on the lower of the two floors; they keep the rows' shared edges)
            const low = Math.min(a.f, b.f);
            const split = WorldDams.turns([c[0], c[1], c[2]]) === WorldDams.turns([c[0], c[2], c[3]]) && WorldDams.turns([c[0], c[1], c[2]]) !== 0;
            if (split) {
                quads.push({ c: [c[0], c[1], c[2], c[2]], f: [low, low], outer: [true, last, false, false] });
                quads.push({ c: [c[0], c[2], c[3], c[3]], f: [low, low], outer: [false, true, false, first] });
            } else {
                quads.push({ c: [c[1], c[2], c[3], c[3]], f: [low, low], outer: [last, true, false, false] });
                quads.push({ c: [c[1], c[3], c[0], c[0]], f: [low, low], outer: [false, first, false, true] });
            }
        }
        for (const row of drawn) for (const p of [row.u, at(row, row.L)]) { x0 = Math.min(x0, p[0]); z0 = Math.min(z0, p[1]); x1 = Math.max(x1, p[0]); z1 = Math.max(z1, p[1]); }
        const box = [x0 - 2, z0 - 2, x1 + 2, z1 + 2];
        // (the box takes in the lake's reach upstream, which WorldDams.flood reads)
        const reachM = rows.reduce((a, r) => Math.max(a, r.lake || 0), 0) + WorldData.CELL_M;
        const lakeBox = [x0 - reachM, z0 - reachM, x1 + reachM, z1 + reachM];
        return { data, kind: data.kind, crest: Math.max(...rows.map(r => r.H)), rows, drawn, pits: { quads, box }, box, spill, level, lakeBox };
    }

    // Where segments p0-p1 and q0-q1 ([x, z]) cross: [the share along the first, along the second], or null
    static meet(p0, p1, q0, q1) {
        const rx = p1[0] - p0[0], rz = p1[1] - p0[1], sx = q1[0] - q0[0], sz = q1[1] - q0[1], den = rx * sz - rz * sx;
        if (Math.abs(den) < 1e-9) return null;
        const t = ((q0[0] - p0[0]) * sz - (q0[1] - p0[1]) * sx) / den, u = ((q0[0] - p0[0]) * rz - (q0[1] - p0[1]) * rx) / den;
        return t > 1e-6 && t <= 1 && u > 1e-6 && u <= 1 ? [t, u] : null;
    }

    // Which way three points ([x, z]) turn: 1, -1, or 0 in a line
    static turns(p) {
        const cross = (p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) - (p[1][1] - p[0][1]) * (p[2][0] - p[0][0]);
        return Math.abs(cross) < 1e-6 ? 0 : Math.sign(cross);
    }

    // Whether a quad's four corners ([x, z]) turn one way round
    static convex(c) {
        let sign = 0;
        for (let k = 0; k < 4; k++) {
            const p = c[k], q = c[(k + 1) % 4], r = c[(k + 2) % 4];
            const cross = (q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0]);
            if (Math.abs(cross) < 1e-6) continue;
            if (sign && Math.sign(cross) !== sign) return false;
            sign = Math.sign(cross);
        }
        return sign !== 0;
    }

    // The section's top at `t` metres across a row (from its upstream face), without the spillway's notch
    static profileAt(row, t, kind) {
        if (t < 0 || t > row.L) return null;
        if (kind === 'embankment') {
            if (t < row.c0) return row.zu + (row.H - row.zu) * (row.c0 > 0 ? t / row.c0 : 1);
            if (t <= row.c1) return row.H;
            return row.H + (row.zd - row.H) * (row.L > row.c1 ? (t - row.c1) / (row.L - row.c1) : 1);
        }
        if (t <= row.c1) return row.H;
        return row.H + (row.zd - row.H) * (row.L > row.c1 ? (t - row.c1) / (row.L - row.c1) : 1);
    }

    // Where (x, z) lies on a dam: {dam, row (the blend of the two rows it lies between), t across, k, v}, or null. Each
    // quad between two drawn rows (the ends past the outline too) is read by the inverse of its bilinear map
    locate(x, z) {
        for (const dam of this.dams) {
            const b = dam.box;
            if (x < b[0] || x > b[2] || z < b[1] || z > b[3]) continue;
            const rows = dam.drawn;
            for (let k = 0; k + 1 < rows.length; k++) {
                const a = rows[k], c = rows[k + 1];
                const p0 = a.u, p1 = c.u, p2 = [c.u[0] + c.a[0] * c.L, c.u[1] + c.a[1] * c.L], p3 = [a.u[0] + a.a[0] * a.L, a.u[1] + a.a[1] * a.L];
                const lo = [Math.min(p0[0], p1[0], p2[0], p3[0]) - 0.01, Math.min(p0[1], p1[1], p2[1], p3[1]) - 0.01, Math.max(p0[0], p1[0], p2[0], p3[0]) + 0.01, Math.max(p0[1], p1[1], p2[1], p3[1]) + 0.01];
                if (x < lo[0] || x > lo[2] || z < lo[1] || z > lo[3]) continue;
                const uv = WorldDams.inverse(p0, p1, p2, p3, x, z);
                if (!uv || uv[0] < -1e-6 || uv[0] > 1 + 1e-6 || uv[1] < -1e-6 || uv[1] > 1 + 1e-6) continue;
                const v = Math.max(0, Math.min(1, uv[1])), mix = (p, q) => p + (q - p) * v;
                const ax = mix(a.a[0], c.a[0]), az = mix(a.a[1], c.a[1]), al = Math.hypot(ax, az) || 1;
                const L = mix(a.L, c.L);
                const row = { u: [mix(a.u[0], c.u[0]), mix(a.u[1], c.u[1])], a: [ax / al, az / al], L, H: mix(a.H, c.H), zu: mix(a.zu, c.zu), zd: mix(a.zd, c.zd), c0: mix(a.c0, c.c0), c1: mix(a.c1, c.c1), f: mix(a.f, c.f) };
                return { dam, row, t: Math.max(0, Math.min(1, uv[0])) * L, k, v };
            }
        }
        return null;
    }

    // (u, v) of (x, z) in the quad p0 p1 p2 p3 ([x, z]: the first row's upstream point, the second row's, the second
    // row's downstream point, the first row's): u across, v along; null where it has none
    static inverse(p0, p1, p2, p3, x, z) {
        const ax = p0[0], az = p0[1], ex = p3[0] - ax, ez = p3[1] - az, fx = p1[0] - ax, fz = p1[1] - az;
        const gx = ax - p3[0] + p2[0] - p1[0], gz = az - p3[1] + p2[1] - p1[1], hx = x - ax, hz = z - az;
        const cross = (ux, uz, vx, vz) => ux * vz - uz * vx;
        const k2 = cross(gx, gz, fx, fz), k1 = cross(ex, ez, fx, fz) + cross(hx, hz, gx, gz), k0 = cross(hx, hz, ex, ez);
        let v;
        if (Math.abs(k2) < 1e-9) { if (Math.abs(k1) < 1e-12) return null; v = -k0 / k1; } else {
            const disc = k1 * k1 - 4 * k0 * k2;
            if (disc < 0) return null;
            const w = Math.sqrt(disc), r1 = (-k1 - w) / (2 * k2), r2 = (-k1 + w) / (2 * k2);
            v = Math.abs(r1 - 0.5) <= Math.abs(r2 - 0.5) ? r1 : r2;
        }
        const bx = ex + gx * v, bz = ez + gz * v, run = bx * bx + bz * bz;
        if (run < 1e-12) return null;
        const u = ((hx - fx * v) * bx + (hz - fz * v) * bz) / run;
        return [u, v];
    }

    // The top of a dam at (x, z) (its crest, its faces), or null off every dam: the physics' ground there
    heightAt(x, z) {
        const at = this.locate(x, z);
        return at ? WorldDams.profileAt(at.row, at.t, at.dam.kind) : null;
    }

    // The pits of the dams near a tile (TerrainMesh.pitCuts): the land under each dam held under its floor
    pitsNear(tile) {
        const m = WorldData.TILE_M, x0 = tile.tx * m, z0 = tile.tz * m;
        return this.dams.filter(d => d.box[2] >= x0 && d.box[0] <= x0 + m && d.box[3] >= z0 && d.box[1] <= z0 + m && d.pits.quads.length).map(d => d.pits);
    }

    // A coarse tile's node under a dam (no cut is made there): held half a metre under the dam's top, so the land
    // drawn coarse does not stand through the model; null off every dam
    lowAt(x, z) {
        const h = this.heightAt(x, z);
        return h === null ? null : h - 0.5;
    }

    // A height tile made lake up to each dam's face (WorldData.reshape runs it on every tile as it is decoded). The
    // elevation model is a lake's surface, and round a dam it is smeared: a bank of land 3 to 6 m over the lake and 8 to
    // 30 m wide stood between the water and the face, over the crest in places. Each node upstream of a row that reaches
    // the lake (row.lake), out to the first water node, is lake (a water node at the reservoir's level) as far as
    // FLOOD_IN_M past the face and no nearer than one ring of water (a cell, diagonally) short of the downstream foot;
    // the land between that and the face (a thin dam's) and under the dam's upstream half stands LAKE_SINK_M under the
    // lake. No node under a road is changed
    flood(tile) {
        const m = WorldData.TILE_M, cell = WorldData.CELL_M, n = WorldData.TILE_N, x0 = tile.tx * m, z0 = tile.tz * m;
        const water = WorldData.ZONE.water, ring = cell * Math.SQRT2 + 0.5;
        for (const dam of this.dams) {
            const b = dam.lakeBox;
            if (dam.level === null || !b || b[2] < x0 || b[0] > x0 + m || b[3] < z0 || b[1] > z0 + m) continue;
            const rows = dam.rows;
            for (let j = 0; j < n; j++) {
                const z = z0 + j * cell;
                if (z < b[1] || z > b[3]) continue;
                for (let i = 0; i < n; i++) {
                    const x = x0 + i * cell;
                    if (x < b[0] || x > b[2]) continue;
                    // (the nearest point of the face's line, between rows k and k + 1)
                    let best = null;
                    for (let k = 0; k + 1 < rows.length; k++) {
                        const p = rows[k].u, q = rows[k + 1].u, dx = q[0] - p[0], dz = q[1] - p[1], run = dx * dx + dz * dz;
                        const raw = run ? ((x - p[0]) * dx + (z - p[1]) * dz) / run : 0, v = Math.max(0, Math.min(1, raw));
                        const d = Math.hypot(p[0] + dx * v - x, p[1] + dz * v - z);
                        if (!best || d < best.d) best = { k, v, raw, d, px: p[0] + dx * v, pz: p[1] + dz * v };
                    }
                    if (!best || (best.k === 0 && best.raw < 0) || (best.k + 2 === rows.length && best.raw > 1)) continue;
                    const a = rows[best.k], c = rows[best.k + 1], v = best.v;
                    if (a.lake === null && c.lake === null) continue;
                    const reach = (a.lake || 0) + ((c.lake || 0) - (a.lake || 0)) * v;
                    const L = a.L + (c.L - a.L) * v;
                    const ax = a.a[0] + (c.a[0] - a.a[0]) * v, az = a.a[1] + (c.a[1] - a.a[1]) * v, al = Math.hypot(ax, az) || 1;
                    // (metres downstream of the face; upstream is negative)
                    const t = ((x - best.px) * ax + (z - best.pz) * az) / al;
                    if (t < -(reach + cell / 2) || t > Math.min(L / 2, cell)) continue;
                    const node = j * n + i;
                    if (tile.zones[node] === water || this.nearRoad(x, z)) continue;
                    // (lowered only, never raised: a node more than a step under the lake stays land, as it was)
                    const h = tile.heights[node];
                    if (t <= Math.min(WorldDams.FLOOD_IN_M, L - ring) && h >= dam.level - WorldDams.LAKE_STEP_M && this.ringHeld(dam, x, z)) {
                        tile.zones[node] = water;
                        tile.heights[node] = Math.min(h, dam.level);
                    } else tile.heights[node] = Math.min(h, dam.level - WorldDams.LAKE_SINK_M);
                }
            }
        }
    }

    // Whether a road's carriageway or verge holds (x, z) or any point a cell round it (the land triangles the node is a
    // corner of): flood changes no land a road's band or its edge works stand on
    nearRoad(x, z) {
        if (!this.roadAt) return false;
        const cell = WorldData.CELL_M;
        for (let dz = -1; dz <= 1; dz += 0.5) for (let dx = -1; dx <= 1; dx += 0.5) if (this.roadAt(x + dx * cell, z + dz * cell) !== null) return true;
        return false;
    }

    // Whether the ring of water round a node made lake at (x, z) (its eight neighbours, Water's ring) stays upstream of
    // the dam's face or inside the dam: no ring node lies past the face's line and off the dam (past a short row's foot
    // at a curved end, the water stood out over the valley's side)
    ringHeld(dam, x, z) {
        const cell = WorldData.CELL_M, rows = dam.rows;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dz) continue;
            const px = x + dx * cell, pz = z + dz * cell;
            if (this.locate(px, pz)) continue;
            for (const row of rows) {
                const t = (px - row.u[0]) * row.a[0] + (pz - row.u[1]) * row.a[1];
                const side = Math.abs((px - row.u[0]) * -row.a[1] + (pz - row.u[1]) * row.a[0]);
                if (t > 0 && side <= cell) return false;
            }
        }
        return true;
    }

    // Every dam as a level of detail: the near model and the far one (THREE.LOD), in one group
    group() {
        const group = new THREE.Group();
        group.name = 'world-dams';
        this.triangles = { near: 0, far: 0 };
        for (const dam of this.dams) {
            const lod = new THREE.LOD();
            lod.name = `world-dam:${dam.data.id}`;
            const near = WorldDams.build(dam, false), far = WorldDams.build(dam, true);
            const centre = [(dam.box[0] + dam.box[2]) / 2, (dam.crest + dam.rows.reduce((a, r) => Math.min(a, r.f), Infinity)) / 2, (dam.box[1] + dam.box[3]) / 2];
            for (const [parts, dist] of [[near, 0], [far, WorldDams.RULE.lodM]]) {
                const mesh = RoadMesh.structureMesh(parts, `world-dam:${dam.data.id}:${dist ? 'far' : 'near'}`);
                if (!mesh) continue;
                mesh.geometry.translate(-centre[0], -centre[1], -centre[2]);
                mesh.castShadow = true;
                mesh.userData.skipCulling = true;
                lod.addLevel(mesh, dist);
                this.triangles[dist ? 'far' : 'near'] += parts.positions.length / 9;
            }
            lod.position.set(centre[0], centre[1], centre[2]);
            dam.lod = lod;
            group.add(lod);
        }
        return group;
    }

    // The parts of one dam: {positions, shades, mark} (StructureShade's marks). `far` the far model: every farRows row
    static build(dam, far = false) {
        const R = WorldDams.RULE, out = { positions: [], shades: [], mark: [] };
        const kind = dam.kind, wall = kind !== 'embankment', look = wall ? 'cast' : 'stone';
        const all = dam.drawn;
        const rows = far ? all.filter((_, k) => k === 0 || k === all.length - 1 || k % R.farRows === 0) : all;
        const concrete = [0.64, 0.63, 0.6], rock = [0.55, 0.53, 0.5];
        const base = wall ? concrete : rock;
        const at = (row, t, y) => [row.u[0] + row.a[0] * t, y, row.u[1] + row.a[1] * t];
        // (a row's section, upstream foot to downstream foot: [t, y, part] corners in turn)
        const levels = far ? 1 : 4;
        const section = row => {
            const top = row.spill && !far ? row.H - R.spill.dropM : row.H;
            const pts = [];
            if (wall) {
                pts.push([0, row.f, 'up'], [0, top, 'up'], [row.c1, top, 'crest']);
            } else {
                pts.push([0, row.f, 'up'], [0, row.zu, 'up'], [row.c0, row.H, 'crest'], [row.c1, row.H, 'crest']);
            }
            // the downstream face in levels, so its stains and its wet foot are drawn by the vertices' colours
            const c = wall ? row.c1 : row.c1, y0 = wall ? top : row.H;
            for (let l = 1; l <= levels; l++) {
                const s = l / levels;
                pts.push([c + (row.L - c) * s, y0 + (row.zd - y0) * s, 'down']);
            }
            pts.push([row.L, row.f, 'toe']);
            return pts;
        };
        // (the stain on a column of the downstream face: dark under the drains, a white lime streak now and then)
        const stain = (row, k, y) => {
            const h = StructureStyles.hash(Math.round(row.u[0] * 4), Math.round(row.u[1] * 4), 7);
            const down = Math.max(0, Math.min(1, (row.H - y) / Math.max(1, row.H - row.zd)));
            let m = 1;
            if (h > 0.72) m *= 1 - 0.32 * (1 - down * 0.7);
            else if (h < 0.06) m *= 1.07;
            // the foot is damp
            m *= 1 - 0.18 * Math.max(0, down - 0.75) / 0.25;
            return m;
        };
        const tint = (c, m) => [c[0] * m, c[1] * m, c[2] * m];
        const sections = rows.map(section);
        for (let k = 0; k + 1 < rows.length; k++) {
            const a = rows[k], b = rows[k + 1], sa = sections[k], sb = sections[k + 1];
            if (sa.length !== sb.length) continue;
            for (let j = 0; j + 1 < sa.length; j++) {
                const part = sa[j + 1][2] === 'toe' ? 'toe' : sa[j][2] === 'up' && sa[j + 1][2] === 'up' ? 'up' : sa[j + 1][2] === 'fin' ? 'up' : sa[j + 1][2];
                const pa0 = at(a, sa[j][0], sa[j][1]), pa1 = at(a, sa[j + 1][0], sa[j + 1][1]), pb0 = at(b, sb[j][0], sb[j][1]), pb1 = at(b, sb[j + 1][0], sb[j + 1][1]);
                const color = part === 'down' ? [tint(base, stain(a, k, sa[j][1])), tint(base, stain(b, k + 1, sb[j][1])), tint(base, stain(b, k + 1, sb[j + 1][1])), tint(base, stain(a, k, sa[j + 1][1]))] : part === 'up' && wall ? tint(base, 0.93) : base;
                const spillFace = !far && a.spill && b.spill && part === 'down';
                const kindOf = part === 'crest' ? 'plain' : 'pier', lookOf = spillFace ? 'smooth' : look;
                // (a pier's metres down from the crest: the streaks are darkest under it)
                StructureShade.quad(out, pa0, pb0, pb1, pa1, spillFace ? tint(base, 0.9) : color, kindOf, lookOf, [a.H - sa[j][1], b.H - sb[j][1], b.H - sb[j + 1][1], a.H - sa[j + 1][1]]);
            }
        }
        WorldDams.holds(out, dam, rows, at, tint(base, 0.88), look);
        // The ends: each closed by its section, a fan from the floor's middle
        for (const [k, flip] of [[0, false], [rows.length - 1, true]]) {
            const row = rows[k], s = sections[k];
            const mid = at(row, row.L / 2, row.f);
            for (let j = 0; j + 1 < s.length; j++) {
                const p = at(row, s[j][0], s[j][1]), q = at(row, s[j + 1][0], s[j + 1][1]);
                StructureShade.quad(out, mid, q, p, mid, tint(base, 0.85), 'pier', look);
                StructureShade.quad(out, mid, p, q, mid, tint(base, 0.85), 'pier', look);
            }
        }
        if (far) return out;
        if (wall) WorldDams.crestWorks(out, dam, rows, at);
        else WorldDams.kerbs(out, dam, rows, at);
        return out;
    }

    // The walls that hold back land higher than the dam's top at the pit's edges (the upstream and downstream edges and
    // the ends): each HOLD_IN_M in from the faces, in front of the land's cut step there, up to HOLD_M over the land at
    // the pit's edge, with a top HOLD_W_M wide toward the dam
    static holds(out, dam, rows, at, color, look) {
        const kind = dam.kind, F = WorldDams.INSET_M + 0.05, W = 0.4, hold = WorldDams.HOLD_M;
        const strip = (pa, pb, ya, yb, ha, hb, ia, ib) => {
            if (ha <= ya + 1e-3 && hb <= yb + 1e-3) return;
            const A = [pa[0], ya, pa[1]], B = [pb[0], yb, pb[1]], C = [pb[0], Math.max(yb, hb), pb[1]], D = [pa[0], Math.max(ya, ha), pa[1]];
            // (both ways round: it is seen from the dam and from the slope)
            StructureShade.quad(out, A, B, C, D, color, 'pier', look, [D[1] - A[1], C[1] - B[1], 0, 0]);
            StructureShade.quad(out, B, A, D, C, color, 'pier', look, [C[1] - B[1], D[1] - A[1], 0, 0]);
            const Ci = [C[0] + ib[0] * W, C[1], C[2] + ib[1] * W], Di = [D[0] + ia[0] * W, D[1], D[2] + ia[1] * W];
            StructureShade.quad(out, D, C, Ci, Di, color, 'cap', look);
            StructureShade.quad(out, C, D, Di, Ci, color, 'cap', look);
        };
        for (let k = 0; k + 1 < rows.length; k++) {
            const a = rows[k], b = rows[k + 1];
            if (a.gu !== null && b.gu !== null) {
                const pa = at(a, F, 0), pb = at(b, F, 0);
                strip([pa[0], pa[2]], [pb[0], pb[2]], WorldDams.profileAt(a, F, kind), WorldDams.profileAt(b, F, kind), a.gu + hold, b.gu + hold, a.a, b.a);
            }
            if (a.gd !== null && b.gd !== null) {
                const ta = Math.max(F, a.L - F), tb = Math.max(F, b.L - F), pa = at(a, ta, 0), pb = at(b, tb, 0);
                strip([pa[0], pa[2]], [pb[0], pb[2]], WorldDams.profileAt(a, ta, kind), WorldDams.profileAt(b, tb, kind), a.gd + hold, b.gd + hold, [-a.a[0], -a.a[1]], [-b.a[0], -b.a[1]]);
            }
        }
        for (const row of [rows[0], rows[rows.length - 1]]) {
            const ends = row.ends || [];
            for (let i = 0; i + 1 < ends.length; i++) {
                const p = ends[i], q = ends[i + 1];
                if (p.y === null || q.y === null) continue;
                const pa = at(row, p.t, 0), pb = at(row, q.t, 0);
                const A = [pa[0] + p.e[0] * F, pa[2] + p.e[1] * F], B = [pb[0] + q.e[0] * F, pb[2] + q.e[1] * F];
                strip(A, B, WorldDams.profileAt(row, Math.min(p.t, row.L), kind), WorldDams.profileAt(row, Math.min(q.t, row.L), kind), p.y + hold, q.y + hold, p.e, q.e);
            }
        }
    }

    // A box from four corners at its foot (a, b, c, d in turn) `h` high, each side marked
    static block(out, foot, h, color, kind, look, top = true) {
        const up = foot.map(p => [p[0], p[1] + h, p[2]]);
        for (let k = 0; k < 4; k++) {
            const j = (k + 1) % 4;
            StructureShade.quad(out, foot[k], foot[j], up[j], up[k], color, kind, look, [h, h, 0, 0]);
        }
        if (top) StructureShade.quad(out, up[0], up[1], up[2], up[3], color, kind, look);
    }

    // The crest of a concrete wall: the upstream parapet, the downstream upstand and railing, the spillway's piers and
    // slab, the valve house
    static crestWorks(out, dam, rows, at) {
        const R = WorldDams.RULE, P = R.parapet, S = R.spill, concrete = [0.68, 0.67, 0.64];
        for (let k = 0; k + 1 < rows.length; k++) {
            const a = rows[k], b = rows[k + 1];
            const bridge = a.spill && b.spill;
            // (over the spillway the parapets stand on the walkway's slab, the slab on the piers)
            if (bridge) {
                const y = a.H - S.slabM;
                const foot = [at(a, 0, y), at(b, 0, y), at(b, a.c1, y), at(a, a.c1, y)];
                WorldDams.block(out, foot, S.slabM, concrete, 'fascia', 'smooth');
                // the slab's underside
                StructureShade.quad(out, foot[3], foot[2], foot[1], foot[0], concrete, 'soffit', 'smooth');
            }
            if (a.pier && !b.spill) {
                // (the last pier, at the spillway's end row: the wall itself)
            }
            // the upstream parapet: concrete, its top a coping
            WorldDams.block(out, [at(a, 0, a.H), at(b, 0, b.H), at(b, P.w, b.H), at(a, P.w, a.H)], P.h, concrete, 'parapet', 'board');
            // the downstream upstand and its railing, on the crest's edge
            const ea = a.c1, eb = b.c1;
            WorldDams.block(out, [at(a, ea - P.w, a.H), at(b, eb - P.w, b.H), at(b, eb, b.H), at(a, ea, a.H)], P.upstand, concrete, 'parapet', 'board');
            const ra = at(a, ea - P.w / 2, a.H + P.upstand), rb = at(b, eb - P.w / 2, b.H + P.upstand), lift = P.rail - P.upstand;
            StructureShade.quad(out, ra, rb, [rb[0], rb[1] + lift, rb[2]], [ra[0], ra[1] + lift, ra[2]], [0.6, 0.61, 0.62], 'rail', 'board', [0, 0, lift, lift]);
        }
        // The spillway's piers: across the notch at every pier row, from the sill to the slab
        for (const row of rows) {
            if (!row.pier) continue;
            const e = [-row.a[1], row.a[0]], w = 0.6;
            const sill = row.H - S.dropM;
            const foot = [[-w, 0], [w, 0], [w, row.c1], [-w, row.c1]].map(([s, t]) => [row.u[0] + e[0] * s + row.a[0] * t, sill, row.u[1] + e[1] * s + row.a[1] * t]);
            WorldDams.block(out, foot, S.dropM - S.slabM, concrete, 'pier', 'smooth', false);
        }
        // The valve house: on the crest's downstream edge, near the first end, over the face on a corbel
        const H = R.house, k = Math.max(1, Math.min(rows.length - 2, Math.round((rows.length - 1) * H.at)));
        const row = rows[k], e0 = rows[k - 1], e1 = rows[k + 1];
        const ex = e1.u[0] - e0.u[0], ez = e1.u[1] - e0.u[1], el = Math.hypot(ex, ez) || 1, e = [ex / el, ez / el];
        const t0 = Math.max(0, row.c1 - 1.2), t1 = t0 + H.across;
        const corner = (s, t, y) => [row.u[0] + e[0] * s + row.a[0] * t, y, row.u[1] + e[1] * s + row.a[1] * t];
        const floor = row.H + 0.05;
        const walls = [0.78, 0.76, 0.71], roof = [0.36, 0.35, 0.34], dark = [0.14, 0.15, 0.17];
        const foot = [corner(-H.along / 2, t0, floor), corner(H.along / 2, t0, floor), corner(H.along / 2, t1, floor), corner(-H.along / 2, t1, floor)];
        WorldDams.block(out, foot, H.high, walls, 'cap', 'smooth', false);
        // its roof: a slab that overhangs by a hand
        const o = 0.35, roofFoot = [corner(-H.along / 2 - o, t0 - o, floor + H.high), corner(H.along / 2 + o, t0 - o, floor + H.high), corner(H.along / 2 + o, t1 + o, floor + H.high), corner(-H.along / 2 - o, t1 + o, floor + H.high)];
        WorldDams.block(out, roofFoot, 0.3, roof, 'cap', 'smooth');
        StructureShade.quad(out, roofFoot[3], roofFoot[2], roofFoot[1], roofFoot[0], roof, 'soffit', 'smooth');
        // a door on the crest's side and a row of windows on the valley's, a hand proud of the wall
        const proud = 0.03;
        const door = [corner(-0.6, t0 - proud, floor), corner(0.6, t0 - proud, floor), corner(0.6, t0 - proud, floor + 2.2), corner(-0.6, t0 - proud, floor + 2.2)];
        StructureShade.quad(out, door[1], door[0], door[3], door[2], dark, 'cap', 'smooth');
        for (const s of [-1.8, 0, 1.8]) {
            const win = [corner(s - 0.55, t1 + proud, floor + 1.4), corner(s + 0.55, t1 + proud, floor + 1.4), corner(s + 0.55, t1 + proud, floor + 2.5), corner(s - 0.55, t1 + proud, floor + 2.5)];
            StructureShade.quad(out, win[0], win[1], win[2], win[3], dark, 'cap', 'smooth');
        }
        // the corbel under the part over the face: from the house's outer foot back down to the face
        const faceAt = t => WorldDams.profileAt(row, Math.min(row.L, t), dam.kind);
        const under = Math.max(floor - 2.5, faceAt(t1));
        if (t1 > row.c1) {
            const a = corner(-H.along / 2, t1, floor), b = corner(H.along / 2, t1, floor), c = corner(H.along / 2, row.c1, under), d = corner(-H.along / 2, row.c1, under);
            StructureShade.quad(out, a, b, c, d, walls, 'soffit', 'board');
            for (const s of [-H.along / 2, H.along / 2]) StructureShade.quad(out, corner(s, t1, floor), corner(s, row.c1, floor), corner(s, row.c1, under), corner(s, row.c1, under), walls, 'pier', 'board');
        }
    }

    // An embankment's crest: a low kerb of stone on each edge
    static kerbs(out, dam, rows, at) {
        const kerb = [0.7, 0.69, 0.66];
        for (let k = 0; k + 1 < rows.length; k++) {
            const a = rows[k], b = rows[k + 1];
            for (const [ta, tb] of [[a.c0, b.c0], [a.c1 - 0.4, b.c1 - 0.4]]) {
                WorldDams.block(out, [at(a, ta, a.H), at(b, tb, b.H), at(b, tb + 0.4, b.H), at(a, ta + 0.4, a.H)], 0.4, kerb, 'parapet', 'stone');
            }
        }
    }
}

// The dams' faces for other parts of the world to read (WorldDams sets them for the world it lays out)
const Dams = { faces: [] };

if (typeof module !== 'undefined') module.exports = WorldDams;
