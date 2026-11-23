// RoadMesh: the road of a world as meshes. One mesh per piece of road, so a section of the ride costs one draw call,
// plus a mesh for each structure on it.
//
//   LOD0 (within 400 m): a row every sample (4 m), six strips (verge, four across the carriageway, verge) in RoadSurface's near
//                        material: the UV is metres across and along the road, and the attributes carry the row's half
//                        width, surface, centre line, edge lines and side-road mouths (RoadSurface.styles), so the
//                        textures, markings and the verge are drawn in the shader and follow the curve. In a bend a
//                        quad is a trapezoid (its inside column is shorter): `roadArc` carries the metres along and
//                        the heading times q = 1 - offset * curvature, the column's share of the centre's length, so
//                        the shader interpolates them projectively and a line across the road stays straight across
//                        the quad instead of kinking at its diagonal. `roadPlane` is the vertex's ground position from
//                        an origin on a PERIOD_M grid, for the asphalt's grain
//   LOD1 (400 m to 1.5 km): a row every 16 m, or sooner in a bend, one strip of flat colour (the textures' mean)
//   hairpins:            the inside edge of a bend is held inside the bend's
//                        radius, so the ribbon never folds over itself where
//                        the road is as wide as the corner is tight; the held
//                        edge is paved to the end (the apron), with no verge
//   tunnels, galleries:  a tube round the road with a portal frame at each end
//   bridges:             a deck, parapets and piers
//   side roads:          a 60 m stub that ends in a road-closed barrier, and beyond it the same LOD0 ribbon within
//                        400 m of the bike (WorldStreamer.sideNear), with the markings of its swissTLM3D class and its
//                        verge, and LOD1 beyond (D7 c); the road past the ride's finish and before its start is a side
//                        road too, so the world goes on past the line (WorldEnvironment.fromRideEnd)
//   edges:               the importer's land meets each drawn edge (the verge's outer edge at LOD0, the carriageway's
//                        beyond) with an embankment or a cut no steeper than BATTER. Where the land drawn at a coarser
//                        level of detail lies lower, an apron (land-coloured, at the batter) runs from the edge down to
//                        it; where two legs of a switchback lie too close for a slope (the importer's `drop` nodes),
//                        or the edge lies over a lower road's band, a dry-stone retaining wall drops from the edge to
//                        the land or that road, with a stone parapet on top (RoadMesh.stoneMaterial draws the courses).
//                        A deck and soffit only when edgeWorks is asked for one. Never a bare vertical face of land. Not on
//                        bridges, in tunnels or galleries, which have their own. The side roads of a chunk share
//                        one mesh of works (one each overran the window's mesh budget)
// Rows are `{x, y, z, heading, width, bits}`, and may carry `s` (metres along the ride), `cls` (the swissTLM3D road
// class) and the styles RoadSurface.styles gives (`centre`, `left`, `right`) with `mouthL` and `mouthR`; `bits`
// carries the route flags. A heading turns right as it grows, and a lateral offset is positive to the right.
class RoadMesh {
    static get COLORS() {
        // The far ribbon is the mean of the near textures (worn alpine asphalt, the pale granite setts of the Via Tremola)
        const mean = RoadSurface.means();
        return {
            asphalt: mean.asphalt, cobbles: mean.setts, sideAsphalt: [0.37, 0.37, 0.37], concrete: [0.50, 0.50, 0.48],
            tunnel: [0.32, 0.31, 0.30], deck: [0.38, 0.37, 0.36], wall: [0.66, 0.63, 0.57], stone: [0.58, 0.56, 0.52], apron: [0.30, 0.33, 0.20], barrierRed: [0.78, 0.12, 0.10], barrierWhite: [0.92, 0.92, 0.90]
        };
    }

    // Metres above the road centre that the road surface sits
    static get LIFT_M() { return 0.02; }

    // The inside of a bend is held to this share of its radius
    static get INNER_SHARE() { return 0.9; }

    // The edge works (RoadMesh.edgeWorks): the apron's batter (rise over run, the importer's BATTER), the most an apron
    // or a wall drops, the depth of a deck side, and the parapet on a wall or deck (width, height)
    static get BATTER() { return 1 / 1.5; }
    static get DROP_MAX_M() { return 60; }
    static get DECK_M() { return 0.9; }
    // Metres the apron lies under the ribbon (under the verge and at the verge's edge), so the ribbon draws over it
    static get APRON_UNDER_M() { return 0.06; }
    // The longest an apron strip runs along the edge (a far ribbon's rows are up to 16 m apart)
    static get APRON_STRIP_M() { return 2; }
    static get PARAPET_W_M() { return 0.3; }
    // A side road's pier: width across the road, depth along it, and how far its foot goes into the land
    static get PIER_W_M() { return 1.6; }
    static get PIER_D_M() { return 1.2; }
    static get PIER_SINK_M() { return 0.5; }
    // Metres between a deck's piers, and how far past a road's verge a pier keeps
    static get PIER_EVERY_M() { return 24; }
    static get PIER_CLEAR_M() { return 0.3; }
    // How far a retaining wall's end returns under the road where it has no coping of its own over it
    static get WALL_RETURN_M() { return 0.6; }
    // Past its end a retaining wall's face goes on along the road's edge and holds less and less of the fill over
    // this many metres (RoadMesh.edgeWorks `taper`), and stands this deep under the slope that starts at its foot
    static get TAPER_M() { return 12; }
    static get TAPER_UNDER_M() { return 0.8; }
    // Every retaining wall stands at least this far over the road's edge, the wall that goes on past its end
    // (`taper`) too, to its closed end: a rider who leaves the road at the verge meets a wall, not a strip of stone
    // level with the road, and no wall falls to nothing
    static get WALL_MIN_UP_M() { return 0.5; }
    // Every retaining wall's top is a level coping at that height over the road's edge, as wide as a marker stone
    // (Scenery.STONE_WIDTH_M) with COPING_MARGIN_M either side: the stone stands on it (Scenery.wallRuns), and a wall's
    // end and the wall that goes on past it keep the same thickness. Its side to the road is a face of stone down to
    // the verge, and its ends are closed (`wallFace` 3)
    static get COPING_UP_M() { return RoadMesh.WALL_MIN_UP_M; }
    static get COPING_MARGIN_M() { return 0.1; }
    static get COPING_W_M() { return Scenery.STONE_WIDTH_M + 2 * RoadMesh.COPING_MARGIN_M; }

    // How far in along a row's outward `n` a coping's inner edge stands from the face of a segment from a to b, so it
    // is COPING_W_M deep square to that face (the piece that joins two roads' walls)
    static copingIn(n, a, b) {
        const dx = b[0] - a[0], dz = b[2] - a[2], len = Math.hypot(dx, dz) || 1;
        const square = Math.abs(n[0] * dz - n[1] * dx) / len;
        return RoadMesh.COPING_W_M / Math.max(0.5, square);
    }

    // How deep a coping is at each point of a wall's face line `face` ([x, y, z], in order), laid in along each
    // point's own way into the road `inward` ([x, z], unit): one depth for each point, shared by the two pieces that
    // meet there, so they join on one line with no overlap and no gap. A point's depth makes the coping COPING_W_M
    // square to both its pieces (at most MITRE_MAX times that on a sharp turn). Where the face turns toward the road
    // so tightly that a piece's inner edge would run back on itself, or be cut to nothing, the coping is narrowed at
    // that piece's ends until its inner edge runs on, to no less than `floor(i)` square to the face at point i
    static copingDepths(face, inward, floor = () => RoadMesh.PARAPET_W_M) {
        const n = face.length, C = RoadMesh.COPING_W_M;
        const piece = i => { const a = face[i], b = face[i + 1], dx = b[0] - a[0], dz = b[2] - a[2], len = Math.hypot(dx, dz); return len > 1e-6 ? [dx / len, dz / len] : null; };
        const pieces = [];
        for (let i = 0; i + 1 < n; i++) pieces.push(piece(i));
        // (how square a point's way in stands to a piece: the coping's depth there is its width over this)
        const square = (i, d) => (d ? Math.abs(inward[i][0] * d[1] - inward[i][1] * d[0]) : 1);
        const scale = [];
        for (let i = 0; i < n; i++) scale.push(1 / Math.max(1 / RoadMesh.MITRE_MAX, Math.min(1, ...[pieces[i - 1], pieces[i]].filter(Boolean).map(d => square(i, d)))));
        const width = face.map(() => C);
        // (a piece's inner edge must run along its face for at least a tenth of the face's length)
        const runs = i => {
            const a = face[i], b = face[i + 1], da = width[i] * scale[i], db = width[i + 1] * scale[i + 1];
            const dx = b[0] + inward[i + 1][0] * db - a[0] - inward[i][0] * da, dz = b[2] + inward[i + 1][1] * db - a[2] - inward[i][1] * da;
            const fx = b[0] - a[0], fz = b[2] - a[2];
            return dx * fx + dz * fz >= 0.1 * (fx * fx + fz * fz);
        };
        for (let pass = 0; pass < 12; pass++) {
            let changed = false;
            for (let i = 0; i + 1 < n; i++) {
                if (!pieces[i] || runs(i)) continue;
                for (const j of [i, i + 1]) {
                    const next = Math.max(Math.min(floor(j), C), width[j] * 0.8);
                    if (next < width[j] - 1e-6) { width[j] = next; changed = true; }
                }
            }
            if (!changed) break;
        }
        return width.map((w, i) => w * scale[i]);
    }

    // The deepest a coping's mitre goes, in widths of the coping: on a sharper turn its point is cut back
    static get MITRE_MAX() { return 2; }

    // A side of a wall's block of stone that is not its face (`wallFace` 3: drawn from the side it faces only, lit by
    // the way given, its courses laid along the metres given): `out` the stone ({positions, shades, face})

    // Its end, across it from its face's top corner `a` to the coping's inner corner `q`, down to `d`, facing `away`
    // (along the road, out of the wall); its courses go on from the face's (`u` at `a`, on along the road by `turn`)
    static endFace(out, a, q, d, away, u, turn, color) {
        while (out.face.length < (out.positions.length / 3) * 4) out.face.push(0, 0, 0, 0);
        RoadMesh.quad(out, a, q, [q[0], d, q[2]], [a[0], d, a[2]], color);
        const v = u + turn * Math.hypot(q[0] - a[0], q[2] - a[2]);
        for (const m of [u, v, v, u, v, u]) out.face.push(m, 3, away[0], away[1]);
    }

    // Its side to the road, from the coping's inner edge `ta` to `tb` down to `ya` and `yb` (under the verge), facing
    // the road (`na`, `nb`: the wall's outward there, so it faces their opposite), its courses along `ua` to `ub`
    static innerFace(out, ta, tb, ya, yb, na, nb, ua, ub, color) {
        while (out.face.length < (out.positions.length / 3) * 4) out.face.push(0, 0, 0, 0);
        RoadMesh.quad(out, tb, ta, [ta[0], ya, ta[2]], [tb[0], yb, tb[2]], color);
        for (const [m, n] of [[ub, nb], [ua, na], [ua, na], [ub, nb], [ua, na], [ub, nb]]) out.face.push(m, 3, -n[0], -n[1]);
    }
    // A retaining wall's face and its parapet's stand this far out from the road's edge, so the ribbon's own edge
    // (lifted LIFT_M over the wall's top) lies behind the stone and never shows as a line across it
    static get STONE_PROUD_M() { return 0.03; }
    static get PARAPET_H_M() { return 0.8; }
    // Metres to the top of a road-closed barrier's posts (barrierGeometry): what a bike that touches it can meet
    static get BARRIER_H_M() { return 1.2; }
    // Where its wall's run ends a parapet falls to a kerb of PARAPET_END_M over its last segment: the wall's top
    // comes down to the road's edge, where its face goes on and tapers out (edgeWorks `taper`). It is still drawn to
    // the wall's end, where the physics still stops the bike
    static get PARAPET_END_M() { return 0.3; }
    // A retaining wall carries its parapet only where it drops this far (WorldPhysics.dropDepthM: the physics makes
    // a drop solid from the same depth, so what is drawn and what is solid agree); a lower step is ridden off
    static get PARAPET_DROP_M() { return 2.5; }

    // How deep a wall's face goes at edge point p: to its own foot `f` (or the run's, `low`), no deeper than DROP_MAX_M,
    // and into the land drawn in front of it (`reach` at p, `between` at the middle of its segment)
    static wallDepth(f, p, low, reach, between) {
        return Math.max(p[1] - RoadMesh.DROP_MAX_M, Math.min(f ? f.y : low, p[1] - RoadMesh.DECK_M, reach, between));
    }

    // Whether a wall's segment from edge point pa to pb, its face down to da and db, carries a parapet. One rule for
    // the stone that is drawn and for what may stand on the wall's top (WorldEnvironment.wallTop, Scenery.wallRuns)
    static railed(pa, pb, da, db) {
        return Math.max(pa[1] - da, pb[1] - db) >= RoadMesh.PARAPET_DROP_M;
    }
    // The highest retaining wall that holds up a side road along a hillside (RoadMesh.sideStructures)
    static get SIDE_WALL_M() { return 9; }
    // How far behind a piece of wall that joins two roads' walls the ground is laid (RoadMesh.addEdgeWorks)
    static get JOIN_BACK_M() { return 4; }
    static get JOIN_UNDER_M() { return 0.09; }
    static get JOIN_PAST_M() { return 1.5; }

    // The apron's colour where no land colour is known: the land's grass, linear
    // The paving the roads lay between them in a junction (a gore, the corner behind a wall's join), linear
    // (white: its material lays the asphalt's own texture on it, RoadSurface.pavingMaterial)
    static get PAVING_LINEAR() { return [1, 1, 1]; }
    // The ride's end of a junction's paving lies this far under its surface (under the side ribbons held there)
    static get PAVING_UNDER_M() { return 0.13; }
    static get PAVING_PIECE_M() { return 4; }
    static get APRON_LINEAR() { return RoadMesh.COLORS.apron.map(v => Math.pow(v, 2.2)); }

    // The apron is land: lit as the land is, and pushed back in depth so the land wins where the two lie together
    static apronMaterial() {
        if (!RoadMesh.sharedApron) {
            RoadMesh.sharedApron = LandShade.patch(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 4 }), { detail: true });
        }
        return RoadMesh.sharedApron;
    }

    // A retaining wall and its parapet: the land's lighting with dry-stone courses drawn in the shader (LandShade
    // `stone`), so the wall reads as the Tremola's granite masonry and not as a grey slab, at no cost in triangles.
    // A fixed depth offset only, as the near road has: with one scaled by its slope to the view, a wall's coping seen
    // edge-on from its own height was drawn in front of the wall's face as a line across it
    static stoneMaterial() {
        if (!RoadMesh.sharedStone) {
            RoadMesh.sharedStone = LandShade.patch(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: -4 }), { stone: true });
        }
        return RoadMesh.sharedStone;
    }

    // Metres over which a change of surface (asphalt to setts, onto a structure and off it) is blended
    static get FEATHER_M() { return 5; }

    // A surface flag per row (`on(row)`) as a weight 0 to 1 that ramps over FEATHER_M of `along` (metres) centred on
    // each change between two rows, so no change of surface is a hard line across the road
    static feather(rows, along, on) {
        const flags = rows.map(row => (on(row) ? 1 : 0));
        const changes = [];
        for (let k = 1; k < rows.length; k++) if (flags[k] !== flags[k - 1]) changes.push((along[k] + along[k - 1]) / 2);
        const half = RoadMesh.FEATHER_M / 2;
        return flags.map((flag, k) => {
            let near = Infinity;
            for (const at of changes) near = Math.min(near, Math.abs(along[k] - at));
            if (near >= half) return flag;
            const ramp = 0.5 + (0.5 * near) / half;
            return flag ? ramp : 1 - ramp;
        });
    }

    // Verge drawn past the edge on a bridge (inside the deck's overhang) and in a tunnel (up to the wall)
    static get BRIDGE_VERGE_M() { return 0.4; }
    // How far past the carriageway a ride bridge's deck reaches: to its parapet's outer face
    static get BRIDGE_DECK_M() { return 0.5; }
    static get TUNNEL_VERGE_M() { return 0.7; }

    // Structures are flat-lit vertex colour: one material for every tunnel, bridge, gate and stub structure
    static material() {
        if (!RoadMesh.sharedMaterial) {
            // A deck's soffit and a tube's roof are seen from under, away from the sun: lit by the floor, three times
            // the land's, so an underside overhead reads as shaded concrete and not as a black slab across the sky
            RoadMesh.sharedMaterial = LandShade.patch(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), { floor: 3 });
        }
        return RoadMesh.sharedMaterial;
    }

    // Rows kept for a lower level of detail: one every `minM` metres of road, or sooner
    // where the heading has turned `maxTurn` radians since the last kept row; a row marked `keep` always stays
    static decimate(rows, minM = 16, maxTurn = 0.18) {
        if (rows.length < 3) return rows;
        const out = [rows[0]];
        let run = 0;
        let last = rows[0];
        for (let i = 1; i < rows.length; i++) {
            run += Math.hypot(rows[i].x - rows[i - 1].x, rows[i].z - rows[i - 1].z);
            if (i === rows.length - 1 || rows[i].keep || run >= minM || Math.abs(rows[i].heading - last.heading) >= maxTurn) {
                out.push(rows[i]);
                last = rows[i];
                run = 0;
            }
        }
        return out;
    }

    // Signed turning rate (radians a metre, positive turning right) at each row
    static curvature(rows) {
        return rows.map((r, i) => {
            const a = rows[Math.max(0, i - 1)], b = rows[Math.min(rows.length - 1, i + 1)];
            const run = Math.hypot(b.x - a.x, b.z - a.z);
            return run > 0 ? (b.heading - a.heading) / run : 0;
        });
    }

    // The ribbon of a run of rows: {geometry, triangles, clamped, near} (clamped: rows whose inside edge was held).
    // `holdY(x, y, z, row)`, when given, may lower each vertex of `row` (a side road under the ride, RoadMesh.sideRoad).
    // `draw` ([first, last] row indices) draws only the rows between them: the rows outside are the neighbouring
    // sections' (read for the bend and the edge works' runs, drawn by those sections), so two sections share one row
    // and never draw one segment twice in one plane. The ribbon's `sides` and `draw` (in its own rows) cover every row
    static ribbon(rows, lod = 0, holdY = null, side = false, draw = null) {
        return lod === 0 ? RoadMesh.nearRibbon(side ? RoadMesh.decimate(rows, RoadMesh.SIDE_ROW_M, RoadMesh.SIDE_TURN) : rows, holdY, side, draw) : RoadMesh.farRibbon(rows, holdY, side, draw);
    }

    // A side road at LOD0 is seen and not ridden: its rows are LOD1's (a row every SIDE_ROW_M, or sooner where the
    // heading has turned SIDE_TURN radians) and it has five columns (verge, edge, centre, edge, verge). Its structures
    // and edge works stand on the same rows (RoadMesh.vergeSides) at every level of detail, so the side roads within the
    // LOD0 radius cost the window few more triangles than LOD1, and a change of level of detail builds no works
    static get SIDE_ROW_M() { return 16; }
    static get SIDE_TURN() { return 0.18; }

    // Which edges of a row are a side road's mouth by the junction's own record (WorldEnvironment.roadStyles `mouthL`,
    // `mouthR`: the rows within the side road's half width and a margin of the node, on the side it leaves): {l, r}
    static mouthOf(row) {
        return { l: !!row.mouthL, r: !!row.mouthR };
    }

    // The edge points of a side road's LOD0 ribbon (nearRibbon's `sides`: the verge's outer edge `l`, `r`, the
    // carriageway's `lc`, `rc`) without building it, for the road's structures and edge works (WorldEnvironment.buildSide)
    // `every` keeps every row (the ride's near ribbon has them all)
    static vergeSides(rows, holdY = null, every = false) {
        const kept = every ? rows : RoadMesh.decimate(rows, RoadMesh.SIDE_ROW_M, RoadMesh.SIDE_TURN);
        const curve = RoadMesh.curvature(kept);
        return kept.map((row, k) => {
            const h = row.width / 2;
            const [vn, vp] = RoadMesh.verges(row);
            const o = RoadMesh.hold([-h - vn, -h, h, h + vp], curve[k]).offsets;
            const y = row.y + RoadMesh.LIFT_M;
            const at = offset => { const p = RoadMesh.place(row, offset); return [p.x, holdY ? holdY(p.x, y, p.z, row) : y, p.z]; };
            return { bits: row.bits, i: row.i, s: row.s, fill: !!row.fill, l: at(o[0]), r: at(o[3]), lc: at(o[1]), rc: at(o[2]), mouth: RoadMesh.mouthOf(row), viaduct: !!row.viaduct };
        });
    }

    // The verge of a row on its -lateral and its +lateral side: RoadSurface.VERGE_M on open ground (less on a bridge and
    // in a tunnel), and a stopping place's pad more where the ride has one (WorldPlaces: row.padN, row.padP)
    static verges(row) {
        // (a viaduct's ribbon keeps the road's verge, out to its faces and under its parapets: RoadMesh.viaduct)
        const bridge = (row.bits & 2) !== 0 && !row.viaduct, tunnel = (row.bits & 5) !== 0;
        const verge = bridge ? RoadMesh.BRIDGE_VERGE_M : tunnel ? RoadMesh.TUNNEL_VERGE_M : RoadSurface.VERGE_M;
        return [verge + (row.padN || 0), verge + (row.padP || 0)];
    }

    // The lateral offsets of a row, the inside ones held within the bend's radius: {offsets, clamped}
    static hold(offsets, curve) {
        const radius = Math.abs(curve) > 1e-6 ? 1 / Math.abs(curve) : Infinity;
        const limit = RoadMesh.INNER_SHARE * radius;
        if (limit >= Math.max(...offsets.map(Math.abs))) return { offsets, clamped: false };
        const inner = curve > 0 ? 1 : -1;
        return { offsets: offsets.map(o => (Math.sign(o) === inner && Math.abs(o) > limit ? inner * limit : o)), clamped: true };
    }

    // A column's length between two rows as a share of the centre's: 1 - offset * curvature (the inside of a bend
    // is shorter), never below a tenth (the inside edge is held at INNER_SHARE of the radius)
    static columnShare(offset, curve) {
        return Math.max(0.1, 1 - offset * curve);
    }

    static place(row, offset) {
        return { x: row.x + offset * Math.cos(row.heading), z: row.z - offset * Math.sin(row.heading) };
    }

    // LOD0: seven vertices a row (verge, edge, three across the carriageway, edge, verge), indexed. The inner vertices
    // keep the drawn surface within a few centimetres of the physics surface in a bend, where a quad across half the
    // road is not flat. A side road (`side`) has five (verge, edge, centre, edge, verge): no physics rides it.
    // geometry.userData.columns is the count
    static nearRibbon(rows, holdY, side = false, draw = null) {
        const curve = RoadMesh.curvature(rows);
        const C = RoadSurface.CENTRE;
        // Metres along: the ride's own s, else measured on from the row before (from the first row's `s`, else 0); the
        // UV restarts at a multiple of PERIOD_M
        const along = [];
        rows.forEach((row, i) => along.push(row.s !== undefined ? row.s : i === 0 ? 0 : along[i - 1] + Math.hypot(row.x - rows[i - 1].x, row.z - rows[i - 1].z)));
        // A side road's markings by its class (RoadSurface.styles), read along the same metres
        const styled = rows.length && rows[0].centre !== undefined ? rows : RoadSurface.styles(rows.map((row, i) => ({ ...row, s: along[i] }))).map((style, i) => ({ ...rows[i], ...style }));
        const period = RoadSurface.PERIOD_M;
        const base = rows.length ? Math.floor(along[0] / period) : 0;
        const n = rows.length;
        const W = side ? 5 : 7;
        // The heading without its 2 pi steps (the ride's is already continuous; a side road's may not be)
        const turn = [];
        rows.forEach((row, i) => {
            if (i === 0) { turn.push(row.heading); return; }
            let step = row.heading - rows[i - 1].heading;
            step -= Math.round(step / (2 * Math.PI)) * 2 * Math.PI;
            turn.push(turn[i - 1] + step);
        });
        const origin = rows.length ? [Math.floor(rows[0].x / period) * period, Math.floor(rows[0].z / period) * period] : [0, 0];
        const positions = new Float32Array(n * W * 3);
        const uvs = new Float32Array(n * W * 2);
        const arc = new Float32Array(n * W * 3);
        const plane = new Float32Array(n * W * 2);
        const road = new Float32Array(n * W * 4);
        const edge = new Float32Array(n * W * 4);
        const pad = new Float32Array(n * W * 3);
        let clamped = 0;
        const sides = [];
        const sett = RoadMesh.feather(rows, along, row => (row.bits & 8) !== 0);
        // (on a viaduct the road and its verge are drawn as they were on its walls)
        const built = RoadMesh.feather(rows, along, row => (row.bits & 7) !== 0 && !row.viaduct);
        styled.forEach((row, k) => {
            const h = row.width / 2;
            const [vn, vp] = RoadMesh.verges(row);
            const held = RoadMesh.hold(side ? [-h - vn, -h, 0, h, h + vp] : [-h - vn, -h, -h / 2, 0, h / 2, h, h + vp], curve[k]);
            // A stopping place's hard standing: its depth on each side and its surface (RoadSurface.PAD)
            const padKind = row.padN || row.padP ? RoadSurface.PAD[row.padSurface] || RoadSurface.PAD.asphalt : 0;
            if (held.clamped) clamped++;
            const v = along[k] - base * period;
            held.offsets.forEach((offset, j) => {
                const p = RoadMesh.place(row, offset);
                const y = row.y + RoadMesh.LIFT_M;
                const at = k * W + j;
                positions.set([p.x, holdY ? holdY(p.x, y, p.z, row) : y, p.z], at * 3);
                uvs.set([offset, v], at * 2);
                const q = RoadMesh.columnShare(offset, curve[k]);
                arc.set([v * q, turn[k] * q, q], at * 3);
                plane.set([p.x - origin[0], p.z - origin[1]], at * 2);
                road.set([h, sett[k], row.centre ?? C.none, built[k]], at * 4);
                pad.set([row.padN || 0, row.padP || 0, padKind], at * 3);
                // Across a side road's mouth a continuous edge line is broken (RoadSurface.MARKINGS.mouth)
                const brokenAt = (line, mouth) => (mouth && line === RoadSurface.EDGE.solid ? RoadSurface.EDGE.broken : line ?? 0);
                edge.set([brokenAt(row.left, row.mouthL), brokenAt(row.right, row.mouthR), row.mouthL ? 1 : 0, row.mouthR ? 1 : 0], at * 4);
            });
            const l = k * W * 3, r = (k * W + W - 1) * 3;
            const at = c => [positions[c], positions[c + 1], positions[c + 2]];
            // (a viaduct's row, so a wall into its end reaches its face: RoadMesh.edgeWorks `borrowed`. A far ribbon keeps
            // the bridge's reach, as its verge is not drawn to the face)
            sides.push({ bits: row.bits, i: row.i, s: row.s, l: at(l), r: at(r), lc: at(l + 3), rc: at(r - 3), mouth: RoadMesh.mouthOf(row), viaduct: !!row.viaduct });
        });
        const index = [];
        const [first, last] = draw || [0, n - 1];
        for (let k = first; k < last; k++) {
            for (let j = 0; j < W - 1; j++) {
                const a = k * W + j, b = a + 1, c = a + W, d = a + W + 1;
                index.push(a, b, c, b, d, c);
            }
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        geometry.setAttribute('roadArc', new THREE.BufferAttribute(arc, 3));
        geometry.setAttribute('roadPlane', new THREE.BufferAttribute(plane, 2));
        geometry.setAttribute('road', new THREE.BufferAttribute(road, 4));
        geometry.setAttribute('edge', new THREE.BufferAttribute(edge, 4));
        geometry.setAttribute('roadPad', new THREE.BufferAttribute(pad, 3));
        geometry.setAttribute('roadBase', new THREE.BufferAttribute(new Float32Array(n * W).fill(base), 1));
        geometry.setIndex(index);
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();
        geometry.userData.near = true;
        geometry.userData.columns = W;
        return { geometry, triangles: index.length / 3, clamped, near: true, sides, draw: [first, last] };
    }

    // LOD1: one flat-coloured strip, rows decimated
    static farRibbon(rows, holdY, side, draw = null) {
        const colors = RoadMesh.COLORS;
        // The rows a drawn run starts and ends on are always kept, so the neighbouring section meets it there
        const marked = draw ? rows.map((row, i) => (i === draw[0] || i === draw[1] ? { ...row, keep: true } : row)) : rows;
        const kept = RoadMesh.decimate(marked);
        const first = draw ? kept.indexOf(marked[draw[0]]) : 0, last = draw ? kept.indexOf(marked[draw[1]]) : kept.length - 1;
        const curve = RoadMesh.curvature(kept);
        const positions = [];
        const shades = [];
        let clamped = 0;
        const push = (x, y, z, c, row) => { positions.push(x, holdY ? holdY(x, y, z, row) : y, z); shades.push(c[0], c[1], c[2]); };
        // The setts blend in over FEATHER_M (RoadMesh.feather), each row its own colour
        const along = [];
        kept.forEach((row, i) => along.push(row.s !== undefined ? row.s : i === 0 ? 0 : along[i - 1] + Math.hypot(row.x - kept[i - 1].x, row.z - kept[i - 1].z)));
        const sett = RoadMesh.feather(kept, along, row => (row.bits & 8) !== 0);
        const laid = kept.map((row, k) => {
            const h = row.width / 2;
            const held = RoadMesh.hold([-h, h], curve[k]);
            if (held.clamped) clamped++;
            // A side road is seen from far off and from above: worn grey
            const base = side ? colors.sideAsphalt : colors.asphalt;
            const c = base.map((v, j) => v + (colors.cobbles[j] - v) * sett[k]);
            return { offsets: held.offsets, c, row };
        });
        // Every road's edge works stand where its near ribbon's do, at the verge's outer edge (`lc`, `rc` the
        // carriageway's), so a wall does not step 1.1 m when its section changes level of detail and never stands on
        // the carriageway (a parapet laid at the carriageway's edge stood 0.3 m on it)
        const sides = laid.map(({ offsets, row }, k) => {
            const y = row.y + RoadMesh.LIFT_M;
            const at = o => { const p = RoadMesh.place(row, o); return [p.x, holdY ? holdY(p.x, y, p.z, row) : y, p.z]; };
            const [vn, vp] = RoadMesh.verges(row);
            const h = row.width / 2;
            const held = RoadMesh.hold([-h - vn, h + vp], curve[k]).offsets;
            return { bits: row.bits, i: row.i, s: row.s, l: at(held[0]), r: at(held[1]), lc: at(offsets[0]), rc: at(offsets[1]), mouth: RoadMesh.mouthOf(row) };
        });
        // A side road's structures and edge works stand at the verge's outer edge at every level of detail
        // (WorldEnvironment.buildSide), so its far ribbon reaches the verge's edge too, in the road's flat colour (two
        // triangles a row, as before): drawn to the carriageway's edge, a retaining wall stood 1.1 m off it with the
        // drop showing through the gap
        const vergeOf = row => (side && !(row.bits & 7) ? RoadSurface.VERGE_M : 0);
        for (let k = first; k < last; k++) {
            const a = laid[k], b = laid[k + 1];
            const va = vergeOf(a.row), vb = vergeOf(b.row);
            const pa0 = RoadMesh.place(a.row, a.offsets[0] - va), pa1 = RoadMesh.place(a.row, a.offsets[1] + va);
            const pb0 = RoadMesh.place(b.row, b.offsets[0] - vb), pb1 = RoadMesh.place(b.row, b.offsets[1] + vb);
            const ya = a.row.y + RoadMesh.LIFT_M, yb = b.row.y + RoadMesh.LIFT_M;
            push(pa0.x, ya, pa0.z, a.c, a.row); push(pa1.x, ya, pa1.z, a.c, a.row); push(pb0.x, yb, pb0.z, b.c, b.row);
            push(pa1.x, ya, pa1.z, a.c, a.row); push(pb1.x, yb, pb1.z, b.c, b.row); push(pb0.x, yb, pb0.z, b.c, b.row);
        }
        return { geometry: RoadMesh.geometry(positions, shades), triangles: positions.length / 9, clamped, near: false, sides, draw: [first, last] };
    }

    static geometry(positions, shades) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(shades, 3));
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();
        return geometry;
    }

    static mesh(geometry, name, material = RoadMesh.material()) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = name;
        mesh.receiveShadow = true;
        mesh.userData.world = 'road';
        return mesh;
    }

    // A ribbon in its material: the near one textured, the far one flat
    static ribbonMesh(ribbon, name) {
        return RoadMesh.mesh(ribbon.geometry, name, ribbon.near ? RoadSurface.nearMaterial() : RoadSurface.farMaterial());
    }

    // Quads and boxes into position and colour lists
    // `color` is one colour, or four (one for each corner a, b, c, d)
    static quad(out, a, b, c, d, color) {
        const each = Array.isArray(color[0]) ? color : null;
        const corners = [0, 1, 2, 0, 2, 3];
        [a, b, c, a, c, d].forEach((p, i) => {
            const k = each ? each[corners[i]] : color;
            out.positions.push(p[0], p[1], p[2]);
            out.shades.push(k[0], k[1], k[2]);
        });
    }

    static box(out, cx, cy, cz, sx, sy, sz, heading, color) {
        const cos = Math.cos(heading), sin = Math.sin(heading);
        // local x is the road's right, local z its forward direction
        const at = (lx, ly, lz) => [cx + lx * cos + lz * sin, cy + ly, cz - lx * sin + lz * cos];
        const hx = sx / 2, hy = sy / 2, hz = sz / 2;
        const v = [at(-hx, -hy, -hz), at(hx, -hy, -hz), at(hx, hy, -hz), at(-hx, hy, -hz), at(-hx, -hy, hz), at(hx, -hy, hz), at(hx, hy, hz), at(-hx, hy, hz)];
        // Each face wound counter-clockwise seen from outside, so its normal points away from the centre and a
        // front-side material (marker stones, barriers) lights the face the viewer sees
        for (const f of [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]]) RoadMesh.quad(out, v[f[3]], v[f[2]], v[f[1]], v[f[0]], color);
    }

    // Runs of consecutive rows whose flag byte has any bit of `mask`
    static runs(rows, mask) {
        const out = [];
        let open = null;
        rows.forEach((row, i) => {
            const on = (row.bits & mask) !== 0;
            if (on && open === null) open = i;
            if ((!on || i === rows.length - 1) && open !== null) {
                out.push([open, on ? i : i - 1]);
                open = null;
            }
        });
        return out;
    }

    // A tube round the road over a tunnel or gallery run, with a portal frame at each end (`ends`: [start, end], false
    // where the run goes on into the neighbouring section, which draws it)
    static tunnel(rows, from, to, roof, ends = [true, true]) {
        const out = { positions: [], shades: [] };
        const colors = RoadMesh.COLORS;
        const side = (row, sign) => {
            const o = sign * (row.width / 2 + 1.6);
            return [row.x + o * Math.cos(row.heading), row.y, row.z - o * Math.sin(row.heading)];
        };
        for (let i = from; i < to; i++) {
            const a = rows[i], b = rows[i + 1];
            const la = side(a, -1), ra = side(a, 1), lb = side(b, -1), rb = side(b, 1);
            const up = (p) => [p[0], p[1] + roof, p[2]];
            RoadMesh.quad(out, la, lb, up(lb), up(la), colors.tunnel);
            RoadMesh.quad(out, rb, ra, up(ra), up(rb), colors.tunnel);
            RoadMesh.quad(out, up(la), up(lb), up(rb), up(ra), colors.tunnel);
        }
        for (const row of [ends[0] ? rows[from] : null, ends[1] ? rows[to] : null]) {
            if (!row) continue;
            const w = row.width + 3.2;
            const post = (w / 2 + 0.3);
            RoadMesh.box(out, row.x, row.y + roof + 0.6, row.z, w + 1.2, 1.2, 1.4, row.heading, colors.concrete);
            for (const sign of [-1, 1]) {
                RoadMesh.box(out, row.x + sign * post * Math.cos(row.heading), row.y + roof / 2, row.z - sign * post * Math.sin(row.heading), 0.6, roof, 1.4, row.heading, colors.concrete);
            }
        }
        return out;
    }

    // A deck under the road, parapets either side and piers down to the ground (RoadMesh.placePiers), each swept
    // along the rows from `from` to `to` with shared vertices, so neither steps nor gaps at a row on a grade or in a bend.
    // The deck reaches BRIDGE_DECK_M past the carriageway, flush with the parapet's outer face, so the two share their
    // corners; its side faces run from the road's height down DECK_M, under the soffit. The parapet's inner face is 0.2 m
    // past the edge (the physics wall, WorldGround.PARAPET_M, is 0.35 m past it), 1.1 m high, over the ribbon's verge
    // `ends` ([start, end]): whether the run ends there (its parapets take a cap) or goes on into the next section
    static bridge(rows, from, to, groundAt, guard = null, ends = [true, true]) {
        const out = { positions: [], shades: [] };
        const colors = RoadMesh.COLORS;
        const deep = RoadMesh.DECK_M;
        const at = (row, offset, dy) => { const p = RoadMesh.place(row, offset); return [p.x, row.y + dy, p.z]; };
        for (let i = from; i < to; i++) {
            const a = rows[i], b = rows[i + 1];
            const ha = a.width / 2 + RoadMesh.BRIDGE_DECK_M, hb = b.width / 2 + RoadMesh.BRIDGE_DECK_M;
            for (const sign of [-1, 1]) {
                const qa = [at(a, sign * ha, 0), at(a, sign * ha, -deep)], qb = [at(b, sign * hb, 0), at(b, sign * hb, -deep)];
                if (sign < 0) RoadMesh.quad(out, qa[0], qb[0], qb[1], qa[1], colors.deck);
                else RoadMesh.quad(out, qb[0], qa[0], qa[1], qb[1], colors.deck);
            }
            RoadMesh.quad(out, at(a, -ha, -deep), at(b, -hb, -deep), at(b, hb, -deep), at(a, ha, -deep), colors.deck);
        }
        const span = rows.slice(from, to + 1);
        for (const sign of [-1, 1]) {
            const points = span.map(row => at(row, sign * (row.width / 2 + RoadMesh.BRIDGE_DECK_M), 0));
            const outward = span.map(row => [sign * Math.cos(row.heading), -sign * Math.sin(row.heading)]);
            RoadMesh.rail(out, points, outward, 0.3, 1.1, colors.concrete, ends);
        }
        const pts = [];
        span.forEach((row, k) => pts.push({ p: [row.x, row.y, row.z], d: k === 0 ? 0 : pts[k - 1].d + Math.hypot(row.x - span[k - 1].x, row.z - span[k - 1].z) }));
        RoadMesh.placePiers(out, [pts], { groundAt, guard, width: Math.min(3, rows[from].width / 2), depth: 2 });
        return out;
    }

    // Where the ride is walled on both edges an arched stone viaduct stands in place of the two retaining walls
    // (WorldEnvironment.viaducts picks the stretches and lays them out, RoadMesh.viaduct builds one). One table, read
    // on any world:
    //   - the stretch: walled on both edges at the same rows for `minM`, two stretches under `gapM` apart are one, and
    //     each wall stands `dropM` or more under its edge (the wall plan's own measure: how deep its stone stands)
    //   - nothing else in it or within `clearM` of it (a structure, a side road's mouth, a stopping place), none within
    //     `worksM` of a roadworks site; its arches stand where it bends no sharper than `curveMax` radians a metre
    //   - the bays: `spanM` long (`spanMin` to `spanMax`: the stretch in whole bays), each pier `pierShare` of its bay
    //     thick and no thinner than `pierMinM`
    //   - an arch: `crownM` of stone over its crown under the road, its springing `springM` or more over the ground;
    //     semicircular where that leaves room and a face opens, else segmental, springing as high as a face opens,
    //     down to a rise of `riseMin` of its span; its springing `headroomM` over any road under it. A bay that has no
    //     room for one, no pier clear of every road or no face that opens ends the viaduct with an abutment, and a
    //     viaduct of fewer than `minBays` is none
    //   - the ground under it is the lower of the land `groundM` out from each face (never under another road beside
    //     it); within its faces the land is held to it (TerrainMesh.pitCuts: under an arch's opening on the faces' own
    //     line, behind a blind face `cutBackM` out past it). A face opens under its arch only where that ground in front
    //     of it lies `openM` or more under the springing; elsewhere it goes down into the land, `sinkM` deep, as the
    //     piers do everywhere
    //   - its parapet is a bridge's (`parapetW`, `parapetH`), in stone; an arch is drawn in `samples` pieces (near, far);
    //     each face goes on `overlapM` past its ends, in front of the wall's face that goes on from there
    static get VIADUCT() {
        return {
            minM: 24, gapM: RoadMesh.WALL_GAP_M, dropM: 8,
            clearM: 12, worksM: 30, curveMax: 1 / 40,
            spanM: 10, spanMin: 8, spanMax: 12, pierShare: 1 / 6, pierMinM: RoadMesh.PIER_D_M,
            crownM: RoadMesh.DECK_M, springM: 1.5, riseMin: 1 / 6, headroomM: Carriageways.HEADROOM_M, minBays: 2,
            groundM: [0.5, 2, 4], cutBackM: 0.15, openM: 0.3, sinkM: 0.5,
            parapetW: 0.3, parapetH: 1.1, samples: [10, 4], overlapM: 0.25
        };
    }

    // How far past the carriageway a viaduct's face stands: where the retaining walls' faces stood (the verge's edge,
    // STONE_PROUD_M out), so a road beside it meets it as it met the wall; its parapet stands on the face's top, and
    // the ribbon keeps its verge out to it
    static get VIADUCT_FACE_M() { return RoadSurface.VERGE_M + RoadMesh.STONE_PROUD_M; }

    // The underside of a bay's arch at ride metres `s` ({a0, a1, spring, rise}: its opening from a0 to a1, springing
    // at `spring`, rising `rise`, a circle through the two springings and the crown), or null outside its opening
    static archY(bay, s) {
        if (!bay || !(bay.rise > 0) || s < bay.a0 - 1e-9 || s > bay.a1 + 1e-9) return null;
        const half = (bay.a1 - bay.a0) / 2, r = Math.min(bay.rise, half), d = s - (bay.a0 + bay.a1) / 2;
        const radius = (half * half + r * r) / (2 * r);
        return bay.spring + r - radius + Math.sqrt(Math.max(0, radius * radius - d * d));
    }

    // The bay of a viaduct's layout that holds ride metres `s`, or null
    static bayAt(via, s) {
        for (const bay of via.bays) if (s >= bay.b0 - 1e-9 && s <= bay.b1 + 1e-9) return bay;
        return null;
    }

    // The face of a viaduct at ride metres `s` on the `sign` side (+1 the +lateral, RoadMesh's `r`): {x, y, z} its top
    // corner (VIADUCT_FACE_M past the carriageway, at the road's height) and {ox, oz} the way it
    // faces, read between the two ride rows of `rows` (each {x, y, z, heading, width, s}) that hold `s`. `past` moves
    // the point that far out from the face (or in, negative)
    static viaductFace(rows, s, sign, out = {}, past = 0) {
        let k = 0;
        while (k + 2 < rows.length && rows[k + 1].s < s) k++;
        const a = rows[k], b = rows[Math.min(rows.length - 1, k + 1)], t = b.s > a.s ? Math.max(0, Math.min(1, (s - a.s) / (b.s - a.s))) : 0;
        const pa = RoadMesh.place(a, sign * (a.width / 2 + RoadMesh.VIADUCT_FACE_M)), pb = RoadMesh.place(b, sign * (b.width / 2 + RoadMesh.VIADUCT_FACE_M));
        const x = pa.x + (pb.x - pa.x) * t, z = pa.z + (pb.z - pa.z) * t;
        const cx = a.x + (b.x - a.x) * t, cz = a.z + (b.z - a.z) * t, len = Math.hypot(x - cx, z - cz) || 1;
        out.ox = (x - cx) / len;
        out.oz = (z - cz) / len;
        out.x = x + out.ox * past;
        out.z = z + out.oz * past;
        out.y = a.y + (b.y - a.y) * t;
        return out;
    }

    // One viaduct's stone over ride rows `from` to `to` of `rows` (its layout `via`, WorldEnvironment.viaducts): on each
    // side a face from the deck's corner down to its arches and, between them and where the land stands in front of
    // it, to the ground; the arches' undersides from face to face; each pier's sides across under its springing; a
    // bridge's parapet on top. The columns are read on the ride's metres, so two sections draw one viaduct as one.
    // `land(x, z)` is the land as it is drawn (the faces, the piers and their sides stand in it), `ends` whether the
    // viaduct ends at `from` and at `to` (its parapet takes a cap). Returns {positions, shades, viaduct: true, soffit,
    // feet}: `soffit` and `feet` the vertex ranges ([start, count]) of the arches' undersides and of the stone that
    // stands on the land (the piers' faces and sides, a face down to the ground)
    static viaduct(rows, from, to, via, { lod = 0, land = null, ends = [true, true] } = {}) {
        const out = { positions: [], shades: [], viaduct: true, soffit: [], feet: [], lit: [] };
        const V = RoadMesh.VIADUCT, color = RoadMesh.COLORS.stone;
        const span = rows.slice(from, to + 1);
        if (span.length < 2) return out;
        const s0 = span[0].s, s1 = span[span.length - 1].s;
        // The columns: every row, each arch's ends and the points along its curve, the bays' ends
        const n = V.samples[Math.min(V.samples.length - 1, lod)];
        const at = new Set(span.map(row => row.s));
        for (const bay of via.bays) {
            at.add(bay.b0);
            at.add(bay.b1);
            if (!(bay.rise > 0)) continue;
            for (let i = 0; i <= n; i++) at.add(bay.a0 + ((bay.a1 - bay.a0) * i) / n);
        }
        const list = [...at].filter(s => s >= s0 - 1e-6 && s <= s1 + 1e-6).sort((a, b) => a - b).filter((s, i, all) => i === 0 || s - all[i - 1] > 1e-4);
        const bottomAt = (s, sign) => {
            const rowsOf = via.rows;
            let k = 0;
            while (k + 2 < rowsOf.length && rowsOf[k + 1].s < s) k++;
            const a = rowsOf[k], b = rowsOf[Math.min(rowsOf.length - 1, k + 1)], t = b.s > a.s ? Math.max(0, Math.min(1, (s - a.s) / (b.s - a.s))) : 0;
            const key = sign > 0 ? 'r' : 'l';
            return a.bottom[key] + (b.bottom[key] - a.bottom[key]) * t;
        };
        // (each face stands in the land drawn in front of it and under it)
        const into = (x, z) => { const y = land ? land(x, z) : null; return Number.isFinite(y) ? y - V.sinkM : Infinity; };
        const cols = list.map(s => {
            const col = { s };
            for (const sign of [-1, 1]) {
                const f = RoadMesh.viaductFace(span, s, sign);
                // (the land half a metre out in front of the face, and under it)
                const low = Math.min(bottomAt(s, sign), into(f.x + f.ox * 0.5, f.z + f.oz * 0.5), into(f.x - f.ox * 0.3, f.z - f.oz * 0.3));
                col[sign > 0 ? 'r' : 'l'] = { x: f.x, y: f.y, z: f.z, low };
            }
            return col;
        });
        const mark = list => { const start = out.positions.length / 3; return () => list.push([start, out.positions.length / 3 - start]); };
        for (let i = 0; i + 1 < cols.length; i++) {
            const a = cols[i], b = cols[i + 1], mid = (a.s + b.s) / 2, bay = RoadMesh.bayAt(via, mid);
            const ya = RoadMesh.archY(bay, a.s), yb = RoadMesh.archY(bay, b.s);
            const arched = bay && bay.rise > 0 && ya !== null && yb !== null && mid > bay.a0 && mid < bay.a1;
            for (const [key, sign] of [['l', -1], ['r', 1]]) {
                const p = a[key], q = b[key];
                const open = arched && bay.open[key];
                const la = open ? ya : p.low, lb = open ? yb : q.low;
                const done = open ? null : mark(out.feet);
                // Wound to face out from the road (+lateral on the right)
                if (sign > 0) RoadMesh.quad(out, [p.x, p.y, p.z], [q.x, q.y, q.z], [q.x, lb, q.z], [p.x, la, p.z], color);
                else RoadMesh.quad(out, [q.x, q.y, q.z], [p.x, p.y, p.z], [p.x, la, p.z], [q.x, lb, q.z], color);
                if (done) done();
            }
            // The arch's underside, from face to face, facing down. It is lit as the face it opens in is (`lit`): lit
            // from below, as a soffit faces, the vault drew near black in the arch's mouth from the road beside it
            if (arched && (bay.open.l || bay.open.r)) {
                const done = mark(out.soffit);
                const start = out.positions.length / 3;
                RoadMesh.quad(out, [a.r.x, ya, a.r.z], [b.r.x, yb, b.r.z], [b.l.x, yb, b.l.z], [a.l.x, ya, a.l.z], color);
                done();
                const key = bay.open.r ? 'r' : 'l', f = RoadMesh.viaductFace(span, mid, key === 'r' ? 1 : -1);
                out.lit.push([start, out.positions.length / 3 - start, f.ox, f.oz]);
                // and the back of a blind face, its stone 2 cutBackM in from it, from the arch down into the land: the
                // vault's back is stone, and the land's step behind it (WorldEnvironment.viaductOf) is hidden
                for (const [key, sign] of [['l', -1], ['r', 1]]) {
                    if (bay.open[key]) continue;
                    const fa = RoadMesh.viaductFace(span, a.s, sign, {}, -2 * V.cutBackM), fb = RoadMesh.viaductFace(span, b.s, sign, {}, -2 * V.cutBackM);
                    const back = mark(out.feet);
                    if (sign < 0) RoadMesh.quad(out, [fa.x, ya, fa.z], [fb.x, yb, fb.z], [fb.x, b[key].low, fb.z], [fa.x, a[key].low, fa.z], color);
                    else RoadMesh.quad(out, [fb.x, yb, fb.z], [fa.x, ya, fa.z], [fa.x, a[key].low, fa.z], [fb.x, b[key].low, fb.z], color);
                    back();
                }
            }
        }
        // Each face goes on `overlapM` past an end of the viaduct, in front of the wall's face that starts there: two
        // faces that met edge to edge, a few centimetres apart in depth, let the road's underside through between them
        // as a pixel at a time from below (world-floating at s 7900)
        for (const [col, way, end] of [[cols[0], -1, ends[0]], [cols[cols.length - 1], 1, ends[1]]]) {
            if (!end) continue;
            const row = way < 0 ? span[0] : span[span.length - 1], fx = Math.sin(row.heading) * way * V.overlapM, fz = Math.cos(row.heading) * way * V.overlapM;
            for (const [key, sign] of [['l', -1], ['r', 1]]) {
                const p = col[key], q = { x: p.x + fx, y: p.y, z: p.z + fz, low: p.low };
                const [a, b] = way > 0 ? [p, q] : [q, p];
                const done = mark(out.feet);
                if (sign > 0) RoadMesh.quad(out, [a.x, a.y, a.z], [b.x, b.y, b.z], [b.x, b.low, b.z], [a.x, a.low, a.z], color);
                else RoadMesh.quad(out, [b.x, b.y, b.z], [a.x, a.y, a.z], [a.x, a.low, a.z], [b.x, b.low, b.z], color);
                done();
            }
        }
        // Each open arch's two sides: across under the deck from face to face, from the stone over the crowns down into
        // the land (over its springing it stands behind the arch's underside)
        for (const bay of via.bays) {
            if (!(bay.rise > 0) || !(bay.open.l || bay.open.r)) continue;
            for (const [s, toward] of [[bay.a0, 1], [bay.a1, -1]]) {
                if (s < s0 - 1e-6 || s > s1 + 1e-6) continue;
                const l = RoadMesh.viaductFace(span, s, -1), r = RoadMesh.viaductFace(span, s, 1);
                const low = Math.min(bottomAt(s, -1), bottomAt(s, 1), into(l.x, l.z), into(r.x, r.z), into((l.x + r.x) / 2, (l.z + r.z) / 2));
                const top = Math.min(l.y, r.y) - V.crownM;
                const done = mark(out.feet);
                if (toward > 0) RoadMesh.quad(out, [r.x, top, r.z], [l.x, top, l.z], [l.x, low, l.z], [r.x, low, r.z], color);
                else RoadMesh.quad(out, [l.x, top, l.z], [r.x, top, r.z], [r.x, low, r.z], [l.x, low, l.z], color);
                done();
            }
        }
        // Its top under the road: the stone over the arches' crowns from face to face, crownM under the road (closed
        // from above where the ribbon and the parapets leave a gap, and what the checks read as the structure's top)
        for (let k = 0; k + 1 < span.length; k++) {
            const a = span[k], b = span[k + 1];
            const at = (row, sign) => { const p = RoadMesh.place(row, sign * (row.width / 2 + RoadMesh.VIADUCT_FACE_M)); return [p.x, row.y - V.crownM, p.z]; };
            RoadMesh.quad(out, at(a, 1), at(a, -1), at(b, -1), at(b, 1), color);
        }
        // Behind the joint of each face and its parapet, a band of stone a few centimetres in: the face's top has a
        // point at every piece of an arch and the parapet one at every row, and the road's underside showed through
        // that joint a pixel at a time from below (world-floating at s 7900)
        for (let k = 0; k + 1 < span.length; k++) {
            const a = span[k], b = span[k + 1];
            for (const sign of [-1, 1]) {
                const at = (row, up) => { const p = RoadMesh.place(row, sign * (row.width / 2 + RoadMesh.VIADUCT_FACE_M - 0.02)); return [p.x, row.y + up, p.z]; };
                if (sign > 0) RoadMesh.quad(out, at(a, 0.05), at(b, 0.05), at(b, -0.1), at(a, -0.1), color);
                else RoadMesh.quad(out, at(b, 0.05), at(a, 0.05), at(a, -0.1), at(b, -0.1), color);
            }
        }
        // The parapets: a bridge's, on the faces' tops
        for (const sign of [-1, 1]) {
            const points = span.map(row => { const p = RoadMesh.place(row, sign * (row.width / 2 + RoadMesh.VIADUCT_FACE_M)); return [p.x, row.y, p.z]; });
            const outward = span.map(row => [sign * Math.cos(row.heading), -sign * Math.sin(row.heading)]);
            RoadMesh.rail(out, points, outward, V.parapetW, V.parapetH, color, ends);
        }
        return out;
    }

    // A parapet swept along a run of edge points: `points` are the tops of the road's edge ([x, y, z]), `outward` the unit
    // plan direction out of the road at each (shared by the segments either side, so the run has no step or gap at a
    // row), and the parapet stands on the last `w` metres inside each point, `h` high. Inner face, coping and outer face,
    // a cap at each end (`caps`: [start, end], false where the rail goes on in a neighbouring mesh, whose cap would lie
    // in the same plane), no underside: it sits on the road, and a face there would lie in the ribbon's plane
    // `along` (the metres along the edge at each point) makes its outer face one face with the wall under it: the same
    // courses, the same light (edgeWorks `face`)
    // `ramps` ([start, end]) brings an end down to PARAPET_END_M (a retaining wall's own end)
    static rail(out, points, outward, w, h, color, caps = [true, true], along = null, proud = 0, ramps = null) {
        if (points.length < 2) return;
        // (over the whole of its last segment, with no point of its own: one laid on a long segment's chord stood in
        // the carriageway on the outside of a bend)
        const high = points.map((_, k) => (ramps && ((k === 0 && ramps[0]) || (k === points.length - 1 && ramps[1])) ? RoadMesh.PARAPET_END_M : h));
        const at = (k, inset, up) => [points[k][0] - outward[k][0] * inset, points[k][1] + (up ? high[k] : 0), points[k][2] - outward[k][1] * inset];
        // On a retaining wall its outer face stands with the wall's under it (`proud` out from the edge)
        const P = -proud;
        for (let k = 0; k + 1 < points.length; k++) {
            RoadMesh.quad(out, at(k, w, 0), at(k + 1, w, 0), at(k + 1, w, h), at(k, w, h), color);
            RoadMesh.quad(out, at(k, w, h), at(k + 1, w, h), at(k + 1, P, h), at(k, P, h), color);
            if (along && out.face) while (out.face.length < (out.positions.length / 3) * 4) out.face.push(0, 0, 0, 0);
            RoadMesh.quad(out, at(k + 1, P, 0), at(k, P, 0), at(k, P, h), at(k + 1, P, h), color);
            if (along && out.face) for (const j of [k + 1, k, k, k + 1, k, k + 1]) out.face.push(along[j], 1, outward[j][0], outward[j][1]);
        }
        const last = points.length - 1;
        if (caps[0]) RoadMesh.quad(out, at(0, P, 0), at(0, w, 0), at(0, w, h), at(0, P, h), color);
        if (caps[1]) RoadMesh.quad(out, at(last, w, 0), at(last, P, 0), at(last, P, h), at(last, w, h), color);
    }

    // Runs of consecutive parapet segments ({k, pa, pb, o, drawn}) joined at shared rows into rails (RoadMesh.rail).
    // Only the `drawn` segments are laid (a neighbouring section lays the rest); a run's end takes a cap only where the
    // run really ends, not where it goes on into a segment another section lays
    static rails(out, segments, w, h, color, proud = 0) {
        let run = null;
        const flush = () => {
            if (!run) return;
            // Each point's own outward where the segments give it (the wall under a parapet stands by the same), else
            // the mean of the two segments that meet there
            const outward = run.outs.every(Boolean) ? run.outs : run.points.map((_, i) => {
                const a = run.o[Math.max(0, i - 1)], b = run.o[Math.min(run.o.length - 1, i)];
                const x = a[0] + b[0], z = a[1] + b[1], len = Math.hypot(x, z) || 1;
                return [x / len, z / len];
            });
            const first = run.drawn.indexOf(true), last = run.drawn.lastIndexOf(true);
            if (first >= 0) RoadMesh.rail(out, run.points.slice(first, last + 2), outward.slice(first, last + 2), w, h, color, [first === 0, last === run.drawn.length - 1], run.along.every(Number.isFinite) ? run.along.slice(first, last + 2) : null, proud, [first === 0 && run.ends[0], last === run.drawn.length - 1 && run.ends[1]]);
            run = null;
        };
        for (const seg of segments) {
            const joined = run && run.k === seg.k - 1 && Math.hypot(run.points[run.points.length - 1][0] - seg.pa[0], run.points[run.points.length - 1][2] - seg.pa[2]) < 1e-6;
            if (!joined) {
                flush();
                run = { k: seg.k, points: [seg.pa], o: [], drawn: [], along: [seg.ua], outs: [seg.oa], ends: [!!seg.endA, false] };
            }
            run.ends[1] = !!seg.endB;
            run.points.push(seg.pb);
            run.along.push(seg.ub);
            run.outs.push(seg.ob);
            run.o.push(seg.o);
            run.drawn.push(seg.drawn !== false);
            run.k = seg.k;
        }
        flush();
    }

    // A retaining wall is one piece: two runs of one edge closer than WALL_GAP_M are one run (the rows between them are
    // walled too), and a run shorter than WALL_RUN_M is no wall (its rows take the slope the land gives them)
    static get WALL_GAP_M() { return 12; }
    // A far ribbon draws a wall no farther than this past the row its run ends on (RoadMesh.section)
    static get WALL_PAST_M() { return 8; }
    static get WALL_RUN_M() { return 10; }

    // The outward direction of each side of a row's edge points
    static outward(side) {
        const dx = side.l[0] - side.r[0], dz = side.l[2] - side.r[2];
        const len = Math.hypot(dx, dz) || 1;
        return { l: [dx / len, dz / len], r: [-dx / len, -dz / len] };
    }

    // Whether the edge `key` of row `side` is a side road's mouth: a side road lies at its edge point (`foot.mouth`), or,
    // on the ride, the junction's record names it (`side.mouth`, RoadMesh.mouthOf). The record holds the whole mouth: a
    // side road's band read out from one row's edge can start past where it looks, and between two rows a wall stood
    // across the mouth with its taper and its coping
    static atMouth(sides, side, key, foot) {
        if (side.bits & 7) return false;
        if (!(sides.owner >= 0) && side.mouth && side.mouth[key]) return true;
        // (a side road's edge in the ride's road is the ride's mouth seen from the side road: its wall, its coping and
        // its face past an end start where its edge leaves the ride's verge, `foot.inRide`)
        if (sides.owner >= 0 && foot && foot.inRide && foot.inRide(side[key][0], side[key][1], side[key][2]) !== null) return true;
        if (!foot || !foot.mouth) return false;
        const o = RoadMesh.outward(side)[key], p = side[key];
        return !!foot.mouth(p[0], p[1], p[2], o[0], o[1]);
    }

    // The retaining wall an edge point stands on: null (none), {blocked: true} (it would stand in another road's
    // carriageway and no place over the verge clears it) or its end {kind: 'wall', y, out, at}. `foot.wall(x, y, z, ox,
    // oz, forced, on)` says where the land asks for one and how deep it stands (WorldEnvironment.edgeFoot); `forced` asks
    // for the foot of a wall the run needs there whatever the land says (a gap closed between two runs), `on` whether
    // a wall that stands at the row before goes on here
    static wallEnd(side, key, foot, guard, forced = false, on = false) {
        if (side.bits & 7) return null;
        const o = RoadMesh.outward(side)[key];
        const p = side[key];
        const f = foot.wall(p[0], p[1], p[2], o[0], o[1], forced, on);
        if (!f) return null;
        const y = Math.max(p[1] - RoadMesh.DROP_MAX_M, Math.min(p[1] - 0.05, f.y));
        const end = { kind: 'wall', y, out: o, color: null, top: null, at: p, run: null };
        if (!guard) return end;
        const g = guard.walls || guard;
        const W = RoadMesh.PARAPET_W_M, top = p[1] + RoadMesh.PARAPET_H_M;
        const worst = (a, b) => (a === null ? b : b === null ? a : Math.max(a, b));
        const depthAt = q => worst(g.depth(q[0], q[2], y, top), g.depth(q[0] - o[0] * W, q[2] - o[1] * W, y, top));
        let depth = depthAt(p);
        if (depth === null) return end;
        const c = side[key + 'c'];
        const span = c ? Math.hypot(c[0] - p[0], c[2] - p[2]) : 0;
        let d = 0;
        for (let tries = 0; tries < 4 && depth !== null; tries++) {
            d += depth + 0.05;
            if (d > span + 1e-9) return { blocked: true };
            const q = [p[0] + ((c[0] - p[0]) * d) / span, p[1] + ((c[1] - p[1]) * d) / span, p[2] + ((c[2] - p[2]) * d) / span];
            depth = depthAt(q);
            if (depth === null) return { ...end, at: q };
        }
        return { blocked: true };
    }

    // Where the retaining walls of a run of edge points stand: {row: {l, r}, seg: {l, r}, end: {l, r}}. `row[key][k]`
    // says row k's edge is walled (`end[key][k]` its wall end), `seg[key][k]` that the segment from row k to k + 1 is a
    // wall: a segment is walled when either of its rows is and the wall clears every other carriageway between them.
    // Then the runs are made whole (WALL_GAP_M, WALL_RUN_M). `past[key][k]` is how far row k lies along the edge past
    // the nearest wall's end behind it and before the one ahead, and how deep those walls stand at their ends
    // ([behind, ahead, deep behind, deep ahead], RoadMesh.pastEnds): where a wall's face tapers out. Null when `foot` plans no walls (it has no `wall`)
    static wallPlan(sides, foot, guard = null) {
        if (!foot || !foot.wall) return null;
        const n = sides.length;
        const plan = { row: { l: [], r: [] }, seg: { l: [], r: [] }, end: { l: [], r: [] }, past: { l: [], r: [] } };
        const g = guard ? guard.walls || guard : null;
        for (const key of ['l', 'r']) {
            const end = sides.map(side => RoadMesh.wallEnd(side, key, foot, guard));
            const row = end.map(e => !!e && !e.blocked);
            // A wall goes on from its last row while the land still asks for one there (a side road's edge that stands
            // over the land with no slope under it: it ends where the land meets the edge; the ride's edge over the
            // strip of a leg below that no bank down from the wall's end clears: round a hairpin's corner)
            const went = [];
            for (const step of [1, -1]) {
                for (let k = step > 0 ? 1 : n - 2; k >= 0 && k < n; k += step) {
                    if (row[k] || !row[k - step]) continue;
                    const e = RoadMesh.wallEnd(sides[k], key, foot, guard, false, true);
                    if (e && !e.blocked) { end[k] = e; row[k] = true; went[k] = true; }
                }
            }
            // A viaduct's two faces go on as walls from its ends, its abutments (WorldEnvironment.viaducts): to the
            // last walled row under WALL_GAP_M short of either end, the rows between walled too, or for one segment
            // where none is (a wing wall, a wall however short: `wing`)
            // (a wing walls the segment from the viaduct's end to its row only: `wingEnd` is the way out of it)
            const wing = [], wingEnd = [];
            for (let j = 0; j < n; j++) {
                if (!sides[j].viaduct) continue;
                for (const way of [-1, 1]) {
                    if (j + way < 0 || j + way >= n || sides[j + way].viaduct || (sides[j + way].bits & 7)) continue;
                    let k = j + way;
                    while (k >= 0 && k < n && !row[k] && !(sides[k].bits & 7) && Math.hypot(sides[k][key][0] - sides[j][key][0], sides[k][key][2] - sides[j][key][2]) < RoadMesh.WALL_GAP_M) k += way;
                    const reached = k >= 0 && k < n && row[k];
                    for (let m = reached ? k - way : j + way; m !== j; m -= way) {
                        const e = RoadMesh.wallEnd(sides[m], key, foot, guard, true);
                        if (e && !e.blocked) { end[m] = e; row[m] = true; wing[m] = true; if (!reached) wingEnd[m] = way; }
                    }
                }
            }
            const at = k => (row[k] ? end[k].at : sides[k][key]);
            const step = k => Math.hypot(at(k + 1)[0] - at(k)[0], at(k + 1)[2] - at(k)[2]);
            // A wall between two rows is tested every metre against the other carriageways (a side road's edge beside
            // the ride's at a junction)
            // A row at a side road's mouth (RoadMesh.atMouth): no wall's segment reaches it, the mouth stays open
            const mouth = sides.map(side => RoadMesh.atMouth(sides, side, key, foot));
            // A side road's walled row in the ride's road next to one clear of it stands at the place between the two
            // where its edge leaves the ride's verge (`foot.inRide`): the wall starts there, at the ride's wall's end
            if (sides.owner >= 0 && foot.inRide) {
                const inside = p => foot.inRide(p[0], p[1], p[2]) !== null;
                for (let k = 0; k < n; k++) {
                    if (!mouth[k] || !row[k] || !inside(sides[k][key])) continue;
                    const j = [k + 1, k - 1].find(j => j >= 0 && j < n && row[j] && !mouth[j]);
                    if (j === undefined) continue;
                    const a = sides[k][key], b = at(j);
                    let lo = 0, hi = 1;
                    for (let i = 0; i < 12; i++) { const t = (lo + hi) / 2; if (inside(a.map((c, m) => c + (b[m] - c) * t))) lo = t; else hi = t; }
                    // (its top at the ride's height there: the wall holds the ride's verge where it starts, and goes on
                    // as one with the piece that joins it to the ride's wall, WorldEnvironment.wallJoins)
                    const start = a.map((c, m) => c + (b[m] - c) * hi), ride = foot.inRide(...a.map((c, m) => c + (b[m] - c) * lo));
                    end[k] = { ...end[k], at: [start[0], Math.max(start[1], ride), start[2]] };
                    mouth[k] = false;
                }
            }
            const clear = k => {
                if (mouth[k] || mouth[k + 1]) return false;
                // Not between two rows of a structure. From a walled row to a structure's first row a wall goes on: the
                // deck starts at that row, and the edge between the two hung open over the land
                const built = [sides[k].bits & 7, sides[k + 1].bits & 7];
                if (built[0] && built[1]) return false;
                if ((built[0] && !row[k + 1]) || (built[1] && !row[k])) return false;
                if ((end[k] && end[k].blocked) || (end[k + 1] && end[k + 1].blocked)) return false;
                if (!g) return true;
                const pa = at(k), pb = at(k + 1), fa = row[k] ? end[k] : end[k + 1], fb = row[k + 1] ? end[k + 1] : end[k];
                const o = fa.out, W = RoadMesh.PARAPET_W_M;
                // (at its two rows too: a row with no wall of its own may lie in another road, at a junction's node)
                const m = Math.floor(Math.hypot(pb[0] - pa[0], pb[2] - pa[2]));
                for (let i = 0; i <= m + 1; i++) {
                    const t = i / (m + 1);
                    const x = pa[0] + (pb[0] - pa[0]) * t, z = pa[2] + (pb[2] - pa[2]) * t, y = pa[1] + (pb[1] - pa[1]) * t, low = fa.y + (fb.y - fa.y) * t;
                    if (g.depth(x, z, low, y + RoadMesh.PARAPET_H_M) !== null || g.depth(x - o[0] * W, z - o[1] * W, low, y + RoadMesh.PARAPET_H_M) !== null) return false;
                }
                return true;
            };
            const segs = () => { const seg = []; for (let k = 0; k + 1 < n; k++) seg.push((row[k] || row[k + 1]) && clear(k) && !(wingEnd[k] === 1 && !row[k + 1]) && !(wingEnd[k + 1] === -1 && !row[k])); return seg; };
            const runsOf = seg => {
                const out = [];
                for (let k = 0; k < seg.length; k++) {
                    if (!seg[k]) continue;
                    let to = k;
                    while (to + 1 < seg.length && seg[to + 1]) to++;
                    out.push([k, to]);
                    k = to;
                }
                return out;
            };
            // Two runs less than WALL_GAP_M apart are one: the rows between them stand on the wall too, where one can stand
            let seg = segs();
            const runs = runsOf(seg);
            let filled = false;
            for (let r = 0; r + 1 < runs.length; r++) {
                const from = runs[r][1] + 1, to = runs[r + 1][0];
                let gap = 0;
                for (let k = from; k < to; k++) gap += step(k);
                if (gap >= RoadMesh.WALL_GAP_M) continue;
                const forced = [];
                for (let k = from; k <= to; k++) {
                    if (row[k]) continue;
                    const e = RoadMesh.wallEnd(sides[k], key, foot, guard, true);
                    if (!e || e.blocked) { forced.length = 0; break; }
                    forced.push([k, e]);
                }
                for (const [k, e] of forced) { end[k] = e; row[k] = true; filled = true; }
            }
            if (filled) seg = segs();
            // A run shorter than WALL_RUN_M is no wall. A run that reaches the first or the last row goes on past it
            // (the rows a wall only goes on to are not counted: a wall too short to stand does not stand because it
            // went on, 12 m of stone on an open bank with the land it levelled a pit at its foot)
            const own = k => row[k] && !went[k];
            for (const [from, to] of runsOf(seg)) {
                let length = 0;
                for (let k = from; k <= to; k++) if (own(k) || own(k + 1)) length += step(k);
                // (nor is a wall that runs into a viaduct's end, however short: it is the viaduct's wing)
                if (length >= RoadMesh.WALL_RUN_M || from === 0 || to === seg.length - 1 || wing.slice(from, to + 2).some(Boolean) || sides[from].viaduct || sides[to + 1].viaduct) continue;
                for (let k = from; k <= to; k++) seg[k] = false;
                for (let k = from; k <= to + 1; k++) if (!(seg[k - 1] || seg[k])) row[k] = false;
            }
            plan.row[key] = row;
            plan.seg[key] = seg;
            plan.end[key] = end.map((e, k) => (row[k] ? e : null));
            // (a taper does not go on across a junction's paving, onto a structure or across a side road's mouth: no
            // slope is laid there or the side road leaves there, and a piece of it past the gap would stand by
            // itself; as stone with a coping it stood across the mouth as a kerb. Paving takes the slope's place
            // only between two paved rows. And none starts at an end a piece of wall joins to another road's: the
            // wall goes on there)
            const paved = sides.map((side, k) => { const c = side[key + 'c']; if (!foot.gore || !c || side.bits & 7) return false; const o = RoadMesh.outward(side)[key]; return !!foot.gore(c[0], c[1], c[2], o[0], o[1]); });
            plan.past[key] = RoadMesh.pastEnds(seg, step, k => !!(sides[k].bits & 7) || mouth[k] || (paved[k] && (!!paved[k - 1] || !!paved[k + 1])), k => {
                // (a run's first or last row may have no foot of its own: its wall stands as deep as at the row beside it)
                const e = (row[k] && end[k] && !end[k].blocked && end[k]) || (seg[k] && row[k + 1] && end[k + 1]) || (seg[k - 1] && row[k - 1] && end[k - 1]) || null;
                return e && Number.isFinite(e.y) ? at(k)[1] - e.y : 0;
            }, k => !(foot.joined && foot.joined(at(k)[0], at(k)[1], at(k)[2])));
        }
        return plan;
    }

    // How far each row lies past a wall's end, along the edge: [metres on from the last walled segment behind it,
    // metres back from the first one ahead, and how deep each of those two walls stands at its end], Infinity with
    // none. `seg[k]` says the segment from row k is a wall, `step(k)` gives its length, nothing is past a wall's end
    // across a row `stop(k)` names, and `deep(k)` is how far under the edge the wall stands at row k
    // `free(k)` says the wall's end at row k is its own (no other wall goes on from it): only such an end tapers
    static pastEnds(seg, step, stop = () => false, deep = () => 0, free = () => true) {
        const n = seg.length + 1, past = [];
        const depth = k => Math.max(0, Math.min(RoadMesh.DROP_MAX_M, deep(k) || 0));
        for (let k = 0; k < n; k++) {
            if (k > 0 && seg[k - 1]) past.push([seg[k] || free(k) ? 0 : Infinity, Infinity, depth(k), 0]);
            else if (k > 0 && !stop(k)) past.push([past[k - 1][0] + step(k - 1), Infinity, past[k - 1][2], 0]);
            else past.push([Infinity, Infinity, 0, 0]);
        }
        for (let k = n - 1; k >= 0; k--) {
            if (k < n - 1 && seg[k]) { past[k][1] = (k > 0 && seg[k - 1]) || free(k) ? 0 : Infinity; past[k][3] = depth(k); }
            else if (k < n - 1 && !stop(k)) { past[k][1] = past[k + 1][1] + step(k); past[k][3] = past[k + 1][3]; }
        }
        return past;
    }

    // A plan of every row of the ride (`fine`, with `base` the index of its first row) read for a ribbon's own rows,
    // which are some of those rows (`sides[k].i`): a segment between two kept rows is a wall when any of the fine
    // segments it spans is, and its rows then stand on the wall
    static planFor(sides, fine, foot, guard) {
        const n = sides.length;
        const plan = { row: { l: [], r: [] }, seg: { l: [], r: [] }, end: { l: [], r: [] }, past: { l: [], r: [] } };
        for (const key of ['l', 'r']) {
            const seg = [];
            for (let k = 0; k + 1 < n; k++) {
                let on = false;
                for (let i = sides[k].i - fine.base; i < sides[k + 1].i - fine.base && !on; i++) on = !!fine.seg[key][i];
                seg.push(on);
            }
            // A row the fine plan walls keeps its end. A walled segment between two rows it does not wall (the wall
            // lies between them) stands on a wall at both
            const end = sides.map((side, k) => ((seg[k - 1] || seg[k]) && fine.end[key][side.i - fine.base]) || null);
            for (let k = 0; k + 1 < n; k++) {
                if (!seg[k] || end[k] || end[k + 1]) continue;
                for (const j of [k, k + 1]) { const e = RoadMesh.wallEnd(sides[j], key, foot, guard, true); if (e && !e.blocked) end[j] = e; }
                if (!end[k] && !end[k + 1]) seg[k] = false;
            }
            plan.seg[key] = seg;
            plan.end[key] = end;
            plan.row[key] = end.map(e => !!e);
            // Past this ribbon's own wall ends (a far ribbon draws a wall on to its next kept row), and past the
            // ends the plan of every row has outside these rows
            const own = RoadMesh.pastEnds(seg, k => Math.hypot(sides[k + 1][key][0] - sides[k][key][0], sides[k + 1][key][2] - sides[k][key][2]), () => false, k => { const e = end[k] || (seg[k] && end[k + 1]) || (seg[k - 1] && end[k - 1]) || null; return e ? sides[k][key][1] - e.y : 0; });
            // (only where the plan of every row has a taper at all: it knows where one stops, at a junction's paving
            // or a structure)
            plan.past[key] = own.map((d, k) => { const f = fine.past && fine.past[key][sides[k].i - fine.base]; return f ? [Number.isFinite(f[0]) ? Math.min(d[0], f[0]) : Infinity, Number.isFinite(f[1]) ? Math.min(d[1], f[1]) : Infinity, f[0] < d[0] ? f[2] : d[2], f[1] < d[1] ? f[3] : d[3]] : d; });
        }
        return plan;
    }

    // The runs of retaining wall a plan draws along `sides`: [{key, points: [[x, y, z]], out: [[ox, oz]], foot: [y], rows: [k]}],
    // each the wall's top line from its first row to its last, out the way it faces, its foot at every row and the row
    // each of its segments starts at
    static wallRuns(sides, plan, from = 0, to = sides.length - 1) {
        const out = [];
        if (!plan) return out;
        for (const key of ['l', 'r']) {
            const seg = plan.seg[key], end = plan.end[key];
            let run = null;
            const point = k => (end[k] ? end[k].at : sides[k][key]);
            for (let k = from; k < to; k++) {
                if (!seg[k]) { run = null; continue; }
                const o = (end[k] || end[k + 1]).out;
                const low = Math.min(...[end[k], end[k + 1]].filter(Boolean).map(e => e.y));
                const foot = e => (e ? e.y : low);
                if (!run) { run = { key, points: [point(k)], out: [o], foot: [foot(end[k])], rows: [] }; out.push(run); }
                run.rows.push(k);
                run.points.push(point(k + 1));
                run.out.push((end[k + 1] || end[k]).out);
                run.foot.push(foot(end[k + 1]));
            }
        }
        return out;
    }

    // What hangs from each drawn edge of a ribbon. `sides` are its rows' edge points ({bits, l, r}, ribbon.sides);
    // `foot(x, y, z, ox, oz)` (WorldEnvironment.edgeFoot) says what the edge point (x, y, z), facing out along (ox, oz),
    // stands on: null (the land meets it), {kind: 'apron', y} (land lower down: a slope at BATTER to y),
    // {kind: 'wall', y} (a retaining wall down to y) or {kind: 'deck'} (a lower road under the edge). A segment takes
    // the stronger kind of its two ends (deck, wall, apron). Rows with a structure bit take none.
    // `guard` (Carriageways.guard) keeps every piece out of another road's carriageway: an edge point whose works
    // would stand in one moves in toward its own carriageway's edge (`lc`, `rc`: over the verge) until they clear it,
    // and where none clears, the segments either side of it take no works (a retaining wall's run ends there and turns
    // back under the road). So at a junction a side road's walls start where its carriageway leaves the other road's.
    // Returns {apron, wall, stone}: position and colour lists; `stone` holds the retaining walls and their parapets
    // (RoadMesh.stoneMaterial), `wall` the decks, soffits and their parapets.
    // How far out an apron's foot stands from the edge point p: where the land falls away steeper than the batter the
    // foot (WorldEnvironment.edgeFoot) gives its own run and stands on the land there, else the batter sets it
    static apronRun(f, p) {
        return Number.isFinite(f.run) ? f.run : Math.max(0, p[1] - RoadMesh.APRON_UNDER_M - f.y) / RoadMesh.BATTER;
    }

    static edgeWorks(sides, foot = null, guard = null) {
        const apron = { positions: [], shades: [] }, wall = { positions: [], shades: [] }, stone = { positions: [], shades: [], face: [] }, paving = { positions: [], shades: [] };
        // The metres along each edge at each row, from the first row's own metres of road: where a wall's courses lie
        const alongMemo = { l: null, r: null };
        const alongOf = (k, key) => {
            if (!alongMemo[key]) {
                const list = [Number.isFinite(sides[0].s) ? sides[0].s : 0];
                for (let j = 1; j < sides.length; j++) list.push(list[j - 1] + Math.hypot(sides[j][key][0] - sides[j - 1][key][0], sides[j][key][2] - sides[j - 1][key][2]));
                alongMemo[key] = list;
            }
            return alongMemo[key][k];
        };
        // Where the retaining walls stand: the ride's plan as its section was given it (`sides.plan`, read for these
        // rows), else this road's own. With a plan no edge point decides a wall by itself
        const plan = sides.plan ? (sides.plan.base !== undefined ? RoadMesh.planFor(sides, sides.plan, foot, guard) : sides.plan) : RoadMesh.wallPlan(sides, foot, guard);
        const colors = RoadMesh.COLORS;
        const rank = { apron: 1, wall: 2, deck: 3 };
        // A slope's foot stands on the land at its own place (`foot.land`, the land as it is drawn): between two rows
        // the foot is laid in strips, and one laid on the line from one row's foot to the next hung over the land
        // where that falls away between them, a shelf past a wall's end with its underside to the rider
        const landAt = foot && foot.land ? foot.land : null;
        // How deep stone stands in the land in front of it (`foot.under`), for a wall's face past its end too
        const sink = foot && foot.under ? foot.under : null;
        // (not a slope that ends on a side road beside the edge, `meets`: seated on the land under the gap between the
        // two roads it stood as a dark face down into it, seen from the ride)
        let onRoad = false;
        const seated = q => { if (onRoad) return q; const land = landAt ? landAt(q[0], q[2]) : null; return land !== null && q[1] > land + 0.05 ? [q[0], land - 0.2, q[2]] : q; };
        const W = RoadMesh.PARAPET_W_M, H = RoadMesh.PARAPET_H_M;
        // How deep the works of kind f standing at p (out along o) reach into another carriageway, or null where they
        // keep out of every one: the edge, the parapet's inner face and, for an apron, its slope out to its foot
        const depthAt = (p, f, o) => {
            if (!guard) return null;
            const g = f.kind === 'wall' && guard.walls ? guard.walls : guard;
            const top = p[1] + (f.kind === 'apron' ? 0 : H);
            const worst = (a, b) => (a === null ? b : b === null ? a : Math.max(a, b));
            let d = worst(g.depth(p[0], p[2], f.y, top), g.depth(p[0] - o[0] * W, p[2] - o[1] * W, f.y, top));
            if (f.kind !== 'apron') return d;
            const run = RoadMesh.apronRun(f, p);
            for (let t = 1; t < run; t += 1) d = worst(d, guard.depth(p[0] + o[0] * t, p[2] + o[1] * t, f.y, p[1] - t * RoadMesh.BATTER));
            return worst(d, guard.depth(p[0] + o[0] * run, p[2] + o[1] * run, f.y, f.y + 0.1));
        };
        const ends = sides.map((side, k) => {
            if (side.bits & 7) {
                // A structure's row where a wall's run ends (wallPlan): the wall stands there as deep as at the row before
                if (!plan) return null;
                const out = RoadMesh.outward(side);
                const borrowed = key => {
                    const from = plan.seg[key][k - 1] ? plan.end[key][k - 1] : plan.seg[key][k] ? plan.end[key][k + 1] : null;
                    if (!from) return null;
                    // On the ride's own bridge the wall meets the deck's corner (BRIDGE_DECK_M past the carriageway); at a
                    // viaduct it goes on as its face, at the verge's edge
                    const c = side[key + 'c'];
                    const at = !(sides.owner >= 0) && (side.bits & 2) && !side.viaduct && c ? [c[0] + out[key][0] * RoadMesh.BRIDGE_DECK_M, c[1], c[2] + out[key][1] * RoadMesh.BRIDGE_DECK_M] : side[key];
                    return { kind: 'wall', y: from.y, out: out[key], color: null, top: null, at, run: null };
                };
                const l = borrowed('l'), r = borrowed('r');
                return l || r ? { l, r, beside: { l: null, r: null } } : null;
            }
            const dx = side.l[0] - side.r[0], dz = side.l[2] - side.r[2];
            const len = Math.hypot(dx, dz) || 1;
            const out = { l: [dx / len, dz / len], r: [-dx / len, -dz / len] };
            // `slope`: what the row stands on beside its wall, for the segment next to it that is no wall
            const read = (key, slope = false) => {
                if (plan && plan.row[key][k] && !slope) return plan.end[key][k];
                const p = side[key];
                const f = foot ? foot(p[0], p[1], p[2], out[key][0], out[key][1], plan ? false : undefined, !!side.fill) : null;
                if (!f) return null;
                const y = Number.isFinite(f.y) ? Math.max(p[1] - RoadMesh.DROP_MAX_M, Math.min(p[1] - 0.05, f.y)) : p[1] - RoadMesh.DECK_M;
                const end = { kind: f.kind, y, out: out[key], color: f.color || null, top: f.top || null, at: p, run: Number.isFinite(f.run) ? f.run : null, meets: !!f.meets };
                let depth = depthAt(p, end, end.out);
                if (depth === null) return end;
                // In over the verge toward the carriageway's edge by as far as the works reach into the other road (and
                // a little more), until they clear it
                const c = side[key + 'c'];
                const span = c ? Math.hypot(c[0] - p[0], c[2] - p[2]) : 0;
                let d = 0;
                for (let tries = 0; tries < 4 && depth !== null; tries++) {
                    d += depth + 0.05;
                    if (d > span + 1e-9) return { blocked: true };
                    const q = [p[0] + ((c[0] - p[0]) * d) / span, p[1] + ((c[1] - p[1]) * d) / span, p[2] + ((c[2] - p[2]) * d) / span];
                    depth = depthAt(q, end, end.out);
                    if (depth === null) return { ...end, at: q };
                }
                return { blocked: true };
            };
            const beside = key => (plan && plan.row[key][k] && !(plan.seg[key][k - 1] && plan.seg[key][k]) ? read(key, true) : null);
            return { l: read('l'), r: read('r'), beside: { l: beside('l'), r: beside('r') } };
        });
        // The end a segment of a kind reads at a row: a wall's segment its wall end, a slope's what the row stands on
        // beside its wall. Without a plan, the row's one end
        const endOf = (k, key, wall) => {
            const e = ends[k] && ends[k][key];
            if (!plan) return e;
            if (wall) return e && e.kind === 'wall' ? e : null;
            return e && e.kind === 'wall' ? ends[k].beside[key] : e;
        };
        // A segment whose two ends clear every other carriageway can still cut across one between them (a side road's
        // edge beside the ride's at a junction): its works are tested every metre along it
        const between = (k, key) => {
            if (!guard) return true;
            // With a plan this is asked of the slopes only (the plan tested its walls)
            const own = f => (f && !f.blocked ? f : null);
            const fa = own(endOf(k, key, false)), fb = own(endOf(k + 1, key, false));
            const pa = fa ? fa.at : sides[k][key], pb = fb ? fb.at : sides[k + 1][key];
            const f = fa || fb;
            const n = Math.floor(Math.hypot(pb[0] - pa[0], pb[2] - pa[2]));
            for (let i = 1; i <= n; i++) {
                const t = i / (n + 1);
                if (depthAt([pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t, pa[2] + (pb[2] - pa[2]) * t], { ...f, y: fa && fb ? fa.y + (fb.y - fa.y) * t : f.y }, f.out) !== null) return false;
            }
            return true;
        };
        // A side road's edge in the ride's road (`foot.inRide`): nothing stands on a segment from there to a walled
        // row (the ride's verge is there, and the wall that starts where the edge leaves it stood its face past its end
        // back into the verge); a slope elsewhere in the junction stays
        const inRide = { l: [], r: [] };
        for (const key of ['l', 'r']) for (const side of sides) inRide[key].push(sides.owner >= 0 && !!foot && !!foot.inRide && !(side.bits & 7) && foot.inRide(side[key][0], side[key][1], side[key][2]) !== null);
        const rideSeg = (k, key) => inRide[key][k] || inRide[key][k + 1];
        // The kind each segment takes on each side (null for none), so a wall knows where its run ends
        const kinds = { l: [], r: [] };
        const kindOf = (k, key) => {
            if (k < 0 || k + 1 >= sides.length) return null;
            if (kinds[key][k] !== undefined) return kinds[key][k];
            const ea = ends[k], eb = ends[k + 1];
            let kind = null;
            if (plan) {
                // The plan's walls, and between them the slopes: a walled row beside a segment that is no wall gives
                // that segment nothing
                if (plan.seg[key][k]) kind = 'wall';
                else if (rideSeg(k, key) && (plan.row[key][k] || plan.row[key][k + 1])) kind = null;
                else {
                    const fa = ea ? endOf(k, key, false) : null, fb = eb ? endOf(k + 1, key, false) : null;
                    // (none from a wall's end to a row at a side road's mouth: the side road's fill stands there,
                    const atMouth = j => RoadMesh.atMouth(sides, sides[j], key, foot);
                    // behind its wall, which a piece of wall joins to this one's end: `foot.joined`)
                    const joined = j => { const e = plan.end[key][j], p = e ? e.at : sides[j][key]; return !!foot.joined && foot.joined(p[0], p[1], p[2]); };
                    const toMouth = (plan.row[key][k] && atMouth(k + 1) && joined(k)) || (plan.row[key][k + 1] && atMouth(k) && joined(k + 1));
                    if (!toMouth && ea && eb && (fa || fb) && !(fa && fa.blocked) && !(fb && fb.blocked) && between(k, key)) kind = [fa, fb].filter(Boolean).reduce((best, f) => (rank[f.kind] > rank[best] ? f.kind : best), 'apron');
                }
            } else if (ea && eb && (ea[key] || eb[key]) && !(ea[key] && ea[key].blocked) && !(eb[key] && eb[key].blocked) && between(k, key)) {
                kind = [ea[key], eb[key]].filter(Boolean).reduce((best, f) => (rank[f.kind] > rank[best] ? f.kind : best), 'apron');
            }
            kinds[key][k] = kind;
            return kind;
        };
        // A junction's paving: from the carriageway's edge out to the side roads beside it (`foot.gore`), row by row
        const paved = sides.map(side => {
            if (!foot || !foot.gore || side.bits & 7 || !side.lc) return null;
            const o = RoadMesh.outward(side);
            const far = key => { const c = side[key + 'c']; return foot.gore(c[0], c[1], c[2], o[key][0], o[key][1]); };
            return { l: far('l'), r: far('r') };
        });
        const rails = { stone: { l: [], r: [] }, wall: { l: [], r: [] } };
        // Rows outside `sides.draw` belong to the neighbouring sections: read for the runs, drawn by those sections
        const [drawFrom, drawTo] = sides.draw || [0, sides.length - 1];
        const junk = { positions: [], shades: [], face: [] };
        // How deep each row's coping is along its own way in, on either side: one line along the whole edge, so the
        // pieces of a coping meet on one mitre and none folds over the next round a tight bend (RoadMesh.copingDepths).
        // Narrowed there no less than a marker stone and its margins (COPING_W_M) where one may stand on it, and than a
        // parapet (PARAPET_W_M) where the wall falls far enough to carry one (as RoadMesh.railed reads its foot)
        // A low wall the stones' rule chooses carries a row of marker stones in place of its parapet: the ride's plan
        // says which (`stoned`, WorldEnvironment.wallStoned, by the ride's rows a segment spans)
        const stonedAt = sides.plan && typeof sides.plan.stoned === 'function' ? sides.plan.stoned : null;
        const stoned = (k, key) => {
            if (!stonedAt || k < 0 || k + 1 >= sides.length || !Number.isFinite(sides[k].i)) return false;
            for (let i = sides[k].i; i < Math.max(sides[k].i + 1, sides[k + 1].i); i++) if (stonedAt(i, key)) return true;
            return false;
        };
        const coping = {};
        for (const key of ['l', 'r']) {
            const floor = j => { const e = plan.end[key][j]; return e && Number.isFinite(e.y) && sides[j][key][1] - e.y >= RoadMesh.PARAPET_DROP_M && !stoned(j - 1, key) && !stoned(j, key) ? RoadMesh.PARAPET_W_M : RoadMesh.COPING_W_M; };
            coping[key] = RoadMesh.copingDepths(sides.map(side => side[key]), sides.map(side => { const o = RoadMesh.outward(side)[key]; return [-o[0], -o[1]]; }), floor);
            // (at a structure's row the wall meets the deck's corner, BRIDGE_DECK_M past the carriageway, and its coping
            // the bridge's parapet: it stops at the carriageway's edge there. As deep as the wall's, it stood 0.3 m over
            // the carriageway, 0.5 m high, at the ends of the ride's bridges)
            sides.forEach((side, k) => {
                const e = ends[k] && ends[k][key], c = side[key + 'c'];
                if (!(side.bits & 7) || !e || !e.at || !c) return;
                coping[key][k] = Math.min(coping[key][k], Math.hypot(e.at[0] - c[0], e.at[2] - c[2]));
            });
        }
        for (let k = 0; k + 1 < sides.length; k++) {
            const ea = ends[k], eb = ends[k + 1];
            if (!ea || !eb) continue;
            const drawn = k >= drawFrom && k < drawTo;
            const apronOut = drawn ? apron : junk, wallOut = drawn ? wall : junk, stoneOut = drawn ? stone : junk, pavingOut = drawn ? paving : junk;
            let soffit = false;
            for (const key of ['l', 'r']) {
                const ga = paved[k] && paved[k][key], gb = paved[k + 1] && paved[k + 1][key];
                if (ga || gb) {
                    // (level with its far edge where that lies lower: never over a side road that falls away)
                    const low = Math.min(ga ? ga[1] : Infinity, gb ? gb[1] : Infinity);
                    const edge = j => { const c = sides[j][key + 'c']; return [c[0], Math.min(c[1] - RoadMesh.PAVING_UNDER_M, low), c[2]]; };
                    const c = RoadMesh.PAVING_LINEAR;
                    // In pieces no longer than PAVING_PIECE_M either way (a far ribbon's rows are 16 m apart): no
                    // large flat face
                    const a0 = edge(k), b0 = edge(k + 1), a1 = ga || a0, b1 = gb || b0;
                    const mix = (u, v, t) => [u[0] + (v[0] - u[0]) * t, u[1] + (v[1] - u[1]) * t, u[2] + (v[2] - u[2]) * t];
                    const dist = (u, v) => Math.hypot(v[0] - u[0], v[2] - u[2]);
                    const nu = Math.max(1, Math.ceil(Math.max(dist(a0, b0), dist(a1, b1)) / RoadMesh.PAVING_PIECE_M)), nv = Math.max(1, Math.ceil(Math.max(dist(a0, a1), dist(b0, b1)) / RoadMesh.PAVING_PIECE_M));
                    const at = (i, j) => mix(mix(a0, b0, i / nu), mix(a1, b1, i / nu), j / nv);
                    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) RoadMesh.quad(pavingOut, at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1), [c, c, c, c]);
                }
            }
            for (const key of ['l', 'r']) {
                const kind = kindOf(k, key);
                if (!kind) continue;
                // An end of the other kind (a slope's beside a wall, a wall's beside a slope) is no end of this segment's
                const mine = f => (f && !f.blocked ? f : null);
                const fa = mine(endOf(k, key, kind === 'wall')), fb = mine(endOf(k + 1, key, kind === 'wall'));
                onRoad = false;
                if (!fa && !fb) continue;
                const pa = fa ? fa.at : sides[k][key], pb = fb ? fb.at : sides[k + 1][key];
                const o = (fa || fb).out;
                const low = (f, p) => (f ? f.y : p[1] - 0.05);
                // The end of a retaining wall is closed across its whole thickness: from the face's own corner
                // (STONE_PROUD_M out, along the row's outward) to the coping's inner edge, from the coping's top
                // down to the wall's foot, a solid end and not a sheet seen edge-on. Its courses turn the corner with
                // the face's; lit by its own way out (`wallFace` 3, `away`: along the road, out of the wall)
                const cap = (p, d, row, away) => {
                    const out = RoadMesh.outward(sides[row])[key], P = sides[row].bits & 7 ? 0 : RoadMesh.STONE_PROUD_M;
                    const top = p[1] + RoadMesh.COPING_UP_M, back = coping[key][row] - P;
                    const a = [p[0] + out[0] * P, top, p[2] + out[1] * P];
                    const q = [p[0] - out[0] * back, top, p[2] - out[1] * back];
                    RoadMesh.endFace(stoneOut, a, q, d, away, alongOf(row, key), row === k ? -1 : 1, colors.stone);
                };
                if (kind === 'apron') {
                    // Coloured as the land it lies on (linear, WorldEnvironment.edgeFoot): at its top as the land by
                    // the edge, at its foot as the land there, so no seam shows where it meets it and a long apron is
                    // never one flat colour
                    const fallback = (fa && fa.color) || (fb && fb.color) || RoadMesh.APRON_LINEAR;
                    const footColor = f => (f && f.color) || fallback;
                    const topColor = f => (f && (f.top || f.color)) || fallback;
                    const under = p => [p[0], p[1] - RoadMesh.APRON_UNDER_M, p[2]];
                    // Under the verge the land at the road's height: the verge thins out over the ground, and over a
                    // hollow it showed the dark under the ribbon as a seam
                    const ca = sides[k][key + 'c'], cb = sides[k + 1][key + 'c'];
                    // (not where the verge itself lies over another carriageway: the inside of a held hairpin)
                    const overOther = guard && ca && cb && [ca, cb, [(ca[0] + pb[0]) / 2, (ca[1] + pb[1]) / 2, (ca[2] + pb[2]) / 2], [(cb[0] + pa[0]) / 2, (cb[1] + pa[1]) / 2, (cb[2] + pa[2]) / 2]].some(q => guard.depth(q[0], q[2], q[1] - 0.2, q[1] - RoadMesh.APRON_UNDER_M) !== null);
                    // (nor in a junction's paving, where the rows have no verge and a side road lies at the edge: the
                    // ground hid a metre of it. Carriageways holds that road at the importer's height, not as it is held)
                    // The slope from the verge's edge has no place there either: it stood in the side road as a sliver
                    // of land, a dark line along the junction
                    if (paved[k] && paved[k][key] && paved[k + 1] && paved[k + 1][key]) continue;
                    if (ca && cb && !overOther) RoadMesh.quad(apronOut, under(ca), under(cb), under(pb), under(pa), [topColor(fa), topColor(fb), topColor(fb), topColor(fa)]);
                    // Then from the verge's edge out and down at the batter to the land's height, in strips no longer
                    // than APRON_STRIP_M along the edge, so no apron triangle grows into a large flat face
                    const foot = (f, p, way = o) => { const y = low(f, p), run = f ? RoadMesh.apronRun(f, p) : 0; return [p[0] + way[0] * run, Math.min(y, p[1] - RoadMesh.APRON_UNDER_M), p[2] + way[1] * run]; };
                    const ta = under(pa), tb = under(pb), fA = foot(fa, pa), fB = foot(fb, pb);
                    onRoad = !!(fa && fa.meets) || !!(fb && fb.meets);
                    const strips = Math.max(1, Math.ceil(Math.hypot(tb[0] - ta[0], tb[2] - ta[2]) / RoadMesh.APRON_STRIP_M));
                    const lerp = (u, v, t) => u.map((c, i) => c + (v[i] - c) * t);
                    // and down the slope in rows no longer than APRON_STRIP_M * 4 (a foot on land far under the edge
                    // makes a long face, RoadMesh.apronRun)
                    const fall = Math.max(Math.hypot(fA[0] - ta[0], fA[1] - ta[1], fA[2] - ta[2]), Math.hypot(fB[0] - tb[0], fB[1] - tb[1], fB[2] - tb[2]));
                    const rows = Math.max(1, Math.ceil(fall / (RoadMesh.APRON_STRIP_M * 4)));
                    // Past a wall's end the wall's face goes on along the edge and tapers out: at the end it stands as
                    // deep as the slope there falls, and over TAPER_M its foot rises to the road's edge; the slope
                    // starts at its foot, so at the wall's end the slope has no height and no side. (Ended at its
                    // full height, the wall stood cut off over the land its cut levels, with the side of the slope
                    // open beside it; a sheet of stone hung from that side was a slanted fin past the wall's end.)
                    // The face is laid and lit as the wall's own (`face`: the edge's metres, each row's outward)
                    const past = plan && plan.past && plan.past[key][k] && plan.past[key][k + 1] ? [plan.past[key][k], plan.past[key][k + 1]] : null;
                    const length = Math.hypot(pb[0] - pa[0], pb[2] - pa[2]);
                    // (how much of the slope's fall the stone holds at t along the segment: all of it at a wall's
                    // end, none TAPER_M past it)
                    // (only from a wall this slope runs on from with no gap, as far as these rows show: a piece of the
                    // face past a gap, a side road's mouth or another road's carriageway, would stand by itself)
                    const slopes = j => kindOf(j, key) === 'apron' && !(paved[j] && paved[j][key] && paved[j + 1] && paved[j + 1][key]);
                    // (nor across a side road's mouth, as the plan has it: the side road leaves there)
                    const mouthRow = j => RoadMesh.atMouth(sides, sides[j], key, foot);
                    const linked = way => { for (let j = k; ; j += way) { if (mouthRow(way < 0 ? j : j + 1)) return false; if (j + way < 0 || j + way + 1 >= sides.length) return true; if (kindOf(j + way, key) === 'wall') return true; if (!slopes(j + way)) return false; } };
                    const from = [past && Number.isFinite(past[0][0]) && linked(-1), past && Number.isFinite(past[1][1]) && linked(1)];
                    const part = (way, t) => (from[way] ? Math.max(0, 1 - (way ? past[1][1] + (1 - t) * length : past[0][0] + t * length) / RoadMesh.TAPER_M) : 0);
                    // (and to nothing at a row where the slope itself ends, a junction's paving, a structure or the
                    // road's own end, and at a side road's mouth: cut off there, the face ended at a height over land
                    // that falls away)
                    // (or where the plan stops one: the distance past the wall goes no farther than that row)
                    const planned = [!!past && Number.isFinite(past[1][1]) && !Number.isFinite(past[0][1]), !!past && Number.isFinite(past[0][0]) && !Number.isFinite(past[1][0])];
                    const stops = [planned[0] || mouthRow(k) || (kindOf(k - 1, key) !== 'wall' && !slopes(k - 1)), planned[1] || mouthRow(k + 1) || (kindOf(k + 1, key) !== 'wall' && !slopes(k + 1))];
                    const share = t => Math.max(part(0, t), part(1, t)) * (stops[0] ? t : 1) * (stops[1] ? 1 - t : 1);
                    // (between two walls of this edge whose faces past their ends would end under WALL_GAP_M apart, it goes
                    // on to the next at its height however little it holds: two closed ends a few metres apart were two
                    // walls that stopped short, round the inside of a hairpin)
                    const bridged = from[0] && from[1] && !stops[0] && !stops[1] && past[0][0] + length + past[1][1] < 2 * RoadMesh.TAPER_M + RoadMesh.WALL_GAP_M;
                    // (and how far under the edge its foot stands for the wall's own foot at its end: the foot rises
                    // from there along the taper, so no step shows under the wall's corner where the land in front
                    // is drawn lower than the slope's own foot)
                    const sunk = t => (past ? Math.max((past[0][2] || 0) * part(0, t), (past[1][3] || 0) * part(1, t)) : 0);
                    const oa = RoadMesh.outward(sides[k])[key], ob = RoadMesh.outward(sides[k + 1])[key];
                    const ua = alongOf(k, key), ub = alongOf(k + 1, key);
                    // The stone's top at t along the segment: its face on the wall's line, proud of the edge, with the
                    // wall's coping over it (`inner`: its inner edge, COPING_W_M in from the face over the verge). Level
                    // across, so it takes one light all round a bend (tilted to the road, its pieces showed as facets
                    // round a hairpin), and as high as the wall's, WALL_MIN_UP_M over the edge, all the way to its end:
                    // the wall gets lower only as the ground in front of it rises, and no wall falls to nothing
                    const crest = t => {
                        const edge = lerp(pa, pb, t), n = [oa[0] + (ob[0] - oa[0]) * t, oa[1] + (ob[1] - oa[1]) * t], P = RoadMesh.STONE_PROUD_M, C = coping[key][k] + (coping[key][k + 1] - coping[key][k]) * t - P;
                        const up = RoadMesh.COPING_UP_M;
                        return { edge, n, face: [edge[0] + n[0] * P, edge[1] + up, edge[2] + n[1] * P], inner: [edge[0] - n[0] * C, edge[1] + up, edge[2] - n[1] * C] };
                    };
                    // One place along the segment: the slope's top and foot there, and the stone over it
                    const at = (t, low = lerp(fA, fB, t)) => {
                        const edge = lerp(pa, pb, t);
                        const fall = edge[1] - low[1], held = fall * share(t);
                        if (held < 0.1) {
                            if (!bridged) return { top: under(edge), foot: seated(low), stone: null };
                            // (bridging a gap where it holds next to nothing, or the land stands higher: the slope as
                            // it is, the stone on the edge with its foot in the ground under the slope's top)
                            const c = crest(t);
                            let deep = edge[1] - RoadMesh.APRON_UNDER_M - RoadMesh.TAPER_UNDER_M;
                            if (sink) deep = Math.min(deep, sink(c.face[0], edge[1], c.face[2], c.n[0], c.n[1]));
                            return { top: under(edge), foot: seated(low), stone: { face: c.face, inner: c.inner, deep, u: ua + (ub - ua) * t, n: c.n } };
                        }
                        // The slope starts at the stone's foot and keeps its batter: its foot stands that much nearer
                        const left = 1 - held / fall;
                        const foot = left > 1e-3 ? seated([edge[0] + (low[0] - edge[0]) * left, low[1], edge[2] + (low[2] - edge[2]) * left]) : null;
                        // (it goes on from the wall's own corner on the wall's line, its top a coping as wide as the
                        // wall's: as a face alone it read from above as a sheet of no thickness standing on the land)
                        const { n, face, inner } = crest(t);
                        // (a side road's none in another road's carriageway: its wall past its end at a junction stood
                        // half a metre high in the ride's road. The ride's keeps out of a side road's mouth by its plan)
                        if (guard && guard.owner >= 0 && [face, inner].some(q => guard.depth(q[0], q[2], edge[1] - 1, q[1]) !== null)) return { top: under(edge), foot: seated(low), stone: null };
                        // (and it stands in the land drawn in front of it: a slope with little run left stands on land
                        // that falls away under the stone's foot)
                        let deep = Math.min(edge[1] - held - RoadMesh.TAPER_UNDER_M, edge[1] - sunk(t));
                        // (`sink`: as deep as a wall stands there, WorldEnvironment.edgeFoot `under`)
                        if (sink) deep = Math.min(deep, sink(face[0], edge[1], face[2], n[0], n[1]));
                        else if (landAt) { const land = landAt(face[0] + n[0] * 0.2, face[2] + n[1] * 0.2); if (land !== null) deep = Math.min(deep, land - RoadMesh.TAPER_UNDER_M); }
                        const top = [edge[0], edge[1] - held, edge[2]];
                        // (where the stone holds the whole slope, the slope's one point there stands in the land drawn
                        // in front of the stone: the land a wall's cut levels may lie under the slope's own foot, and
                        // the first strip's edge hung over it from the wall's corner)
                        if (!foot && landAt) { const land = landAt(face[0] + n[0] * 0.2, face[2] + n[1] * 0.2); if (land !== null && top[1] > land - 0.2) top[1] = land - 0.2; }
                        return { top, foot: foot || top, stone: { face, inner, deep, u: ua + (ub - ua) * t, n } };
                    };
                    const first = at(0);
                    // The slope before this one stands out along its own outward: on the outside of a bend the two
                    // stood apart at the row they share, each with an open side there. A piece of slope from the
                    // row's edge point to the two feet closes it
                    const before = kindOf(k - 1, key) === 'apron' ? mine(endOf(k - 1, key, false)) : null;
                    if (before && fa && (before.out[0] !== o[0] || before.out[1] !== o[1])) {
                        const other = at(0, foot(fa, pa, before.out));
                        const gap = [first.foot[0] - other.foot[0], first.foot[2] - other.foot[2]];
                        // (one triangle; a gap under a hand is left)
                        if (Math.hypot(gap[0], gap[1]) > 0.1 && gap[0] * (pb[0] - pa[0]) + gap[1] * (pb[2] - pa[2]) > 0) {
                            for (const [q, c] of [[first.top, topColor(fa)], [first.foot, footColor(fa)], [other.foot, footColor(fa)]]) { apronOut.positions.push(q[0], q[1], q[2]); apronOut.shades.push(c[0], c[1], c[2]); }
                        }
                    }
                    let a = first;
                    const pieces = [];
                    for (let n = 0; n < strips; n++) {
                        const t0 = n / strips, t1 = (n + 1) / strips;
                        const b = at(t1);
                        const top0 = a.top, top1 = b.top, foot0 = a.foot, foot1 = b.foot;
                        const c0 = lerp(topColor(fa), topColor(fb), t0), c1 = lerp(topColor(fa), topColor(fb), t1), d0 = lerp(footColor(fa), footColor(fb), t0), d1 = lerp(footColor(fa), footColor(fb), t1);
                        // (no slope where the stone holds all of it at both ends of the strip)
                        for (let r = 0; r < rows && (top0 !== foot0 || top1 !== foot1); r++) {
                            const u0 = r / rows, u1 = (r + 1) / rows;
                            RoadMesh.quad(apronOut, lerp(top0, foot0, u0), lerp(top1, foot1, u0), lerp(top1, foot1, u1), lerp(top0, foot0, u1), [lerp(c0, d0, u0), lerp(c1, d1, u0), lerp(c1, d1, u1), lerp(c0, d0, u1)]);
                        }
                        if (a.stone || b.stone) {
                            // Where the taper ends inside the strip it ends there at its full height, its foot in the
                            // ground under the slope's top, with a closed end (`end`)
                            // (and in the land drawn in front of it, as along the taper)
                            const point = (e, t) => {
                                if (e.stone) return e.stone;
                                const c = crest(t);
                                let deep = c.edge[1] - RoadMesh.APRON_UNDER_M - RoadMesh.TAPER_UNDER_M;
                                if (sink) deep = Math.min(deep, sink(c.face[0], c.edge[1], c.face[2], c.n[0], c.n[1]));
                                else if (landAt) { const land = landAt(c.face[0] + c.n[0] * 0.2, c.face[2] + c.n[1] * 0.2); if (land !== null) deep = Math.min(deep, land - RoadMesh.TAPER_UNDER_M); }
                                return { ...c, deep, u: ua + (ub - ua) * t, end: true };
                            };
                            pieces.push([point(a, t0), point(b, t1)]);
                        }
                        a = b;
                    }
                    // The stone, one piece over the strips it holds in turn: the edge is straight between two rows, so
                    // the piece's top is theirs and only its foot is sunk to lie under every strip's own, about the end
                    // where it dies (which keeps no height) or evenly. Two triangles of face and two of coping for a
                    // segment, as many as its face alone cost in strips
                    const runs = [];
                    for (const [A, B] of pieces) {
                        const run = runs[runs.length - 1];
                        if (run && run.B === A && !(run.A.end && B.end)) { run.B = B; run.inner.push(A); } else runs.push({ A, B, inner: [] });
                    }
                    for (const { A, B, inner } of runs) {
                        let low = 0;
                        for (const e of inner) {
                            const t = (e.u - A.u) / (B.u - A.u || 1), over = A.deep + (B.deep - A.deep) * t - e.deep;
                            low = Math.max(low, over / (A.end ? t : B.end ? 1 - t : 1));
                        }
                        const lowA = A.end ? 0 : low, lowB = B.end ? 0 : low;
                        // Drawn only from the side it faces (`face`: 2, LandShade's stone reads the row's outward):
                        // from the road its back stood right under the rim of the ground under the verge and showed
                        // through it as a dark line along the edge (that ground's depth offset lets what lies just
                        // behind its rim through). Wound as the wall's own face is, so the two take the same light
                        while (stoneOut.face.length < (stoneOut.positions.length / 3) * 4) stoneOut.face.push(0, 0, 0, 0);
                        RoadMesh.quad(stoneOut, A.face, B.face, [B.face[0], B.deep - lowB, B.face[2]], [A.face[0], A.deep - lowA, A.face[2]], colors.stone);
                        for (const e of [A, B, B, A, B, A]) stoneOut.face.push(e.u, 2, e.n[0], e.n[1]);
                        // The coping, lit by its own slope as the parapet's is (`face` 0)
                        RoadMesh.quad(stoneOut, A.face, B.face, B.inner, A.inner, colors.stone);
                        for (let v = 0; v < 6; v++) stoneOut.face.push(0, 0, 0, 0);
                        // its side to the road, and at an end where it stops, that end closed across its thickness
                        RoadMesh.innerFace(stoneOut, A.inner, B.inner, A.inner[1] - RoadMesh.COPING_UP_M - RoadMesh.APRON_UNDER_M, B.inner[1] - RoadMesh.COPING_UP_M - RoadMesh.APRON_UNDER_M, A.n, B.n, A.u, B.u, colors.stone);
                        const len = Math.hypot(B.face[0] - A.face[0], B.face[2] - A.face[2]) || 1, along = [(B.face[0] - A.face[0]) / len, (B.face[2] - A.face[2]) / len];
                        if (A.end) RoadMesh.endFace(stoneOut, A.face, A.inner, A.deep, [-along[0], -along[1]], A.u, -1, colors.stone);
                        if (B.end) RoadMesh.endFace(stoneOut, B.face, B.inner, B.deep, along, B.u, 1, colors.stone);
                    }
                    continue;
                }
                // Under the verge on a wall there is ground too, at the road's height: the verge thins out to nothing
                // at its outer edge, and over a wall nothing lay under it (the land stands at the wall's foot), so the
                // rider saw through the verge to the bank below
                if (kind === 'wall') {
                    const ca = sides[k][key + 'c'], cb = sides[k + 1][key + 'c'];
                    const under = p => [p[0], p[1] - RoadMesh.APRON_UNDER_M, p[2]];
                    // (paving in a junction, where the rows have no verge)
                    const inPaving = paved[k] && paved[k][key] || paved[k + 1] && paved[k + 1][key];
                    const tint = f => (inPaving ? RoadMesh.PAVING_LINEAR : (f && (f.top || f.color)) || RoadMesh.APRON_LINEAR);
                    // (not where the verge itself lies over a carriageway: another road's, or another leg of its own)
                    // (out to the wall, where it stands: a side road's wall that starts where its edge leaves the
                    // ride's verge stands in from its row's edge, and the ground laid on to the edge hung past its start)
                    const va = pa, vb = pb;
                    const lerp3 = (u, v, t) => [u[0] + (v[0] - u[0]) * t, u[1] + (v[1] - u[1]) * t, u[2] + (v[2] - u[2]) * t];
                    let over = false;
                    for (let i = 0; guard && ca && cb && i <= 4 && !over; i++) for (let j = 0; j <= 2 && !over; j++) { const q = lerp3(lerp3(ca, cb, i / 4), lerp3(va, vb, i / 4), j / 2); over = guard.any(q[0], q[2], q[1] - 0.2, q[1] - RoadMesh.APRON_UNDER_M) !== null; }
                    if (ca && cb && !over) RoadMesh.quad(inPaving ? pavingOut : apronOut, under(ca), under(cb), under(vb), under(va), [tint(fa), tint(fb), tint(fb), tint(fa)]);
                }
                // A wall's end with no wall foot of its own takes the run's: it reaches the land (buried in it where
                // the land meets the edge) and never ends hanging over the drop
                const runFoot = Math.min(...[fa, fb].filter(f => f && f.kind === kind).map(f => f.y));
                // and a retaining wall stands in the land in front of it as it is drawn there (`foot.under`), at its
                // rows and between them
                const reach = p => (kind === 'wall' && foot && foot.under ? foot.under(p[0], p[1], p[2], o[0], o[1]) : Infinity);
                const between = reach([(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2]);
                const depth = (f, p) => (kind === 'deck' ? p[1] - RoadMesh.DECK_M : RoadMesh.wallDepth(f && f.kind === kind ? f : null, p, runFoot, reach(p), between));
                // The wall's face follows the road's grade at the top and the land (or the lower road) at the foot
                const out = kind === 'deck' ? wallOut : stoneOut;
                if (kind === 'wall') {
                    // One face along the whole run: the courses are laid along the metres of the wall (`face`: metres
                    // along and the row's own outward, which the shader and the light read in place of each quad's own),
                    // so no joint shows where one segment meets the next at another heading
                    // Each row's own outward, so two segments put the row they share at one place
                    const P = RoadMesh.STONE_PROUD_M;
                    const oa = RoadMesh.outward(sides[k])[key], ob = RoadMesh.outward(sides[k + 1])[key];
                    // (at a structure's row the face stands at the deck's own corner, not proud of it)
                    const Pa = sides[k].bits & 7 && !sides[k].viaduct ? 0 : P, Pb = sides[k + 1].bits & 7 && !sides[k + 1].viaduct ? 0 : P;
                    // (its top a level coping COPING_UP_M over the edge and COPING_W_M deep: the wall's thickness, seen from
                    // above and from the road, where a marker stone can stand)
                    const up = RoadMesh.COPING_UP_M;
                    const qa = [pa[0] + oa[0] * Pa, pa[1] + up, pa[2] + oa[1] * Pa], qb = [pb[0] + ob[0] * Pb, pb[1] + up, pb[2] + ob[1] * Pb];
                    while (stoneOut.face.length < (stoneOut.positions.length / 3) * 4) stoneOut.face.push(0, 0, 0, 0);
                    RoadMesh.quad(stoneOut, qa, qb, [qb[0], depth(fb, pb), qb[2]], [qa[0], depth(fa, pa), qa[2]], colors.stone);
                    const ua = alongOf(k, key), ub = alongOf(k + 1, key);
                    for (const [u, n] of [[ua, oa], [ub, ob], [ub, ob], [ua, oa], [ub, ob], [ua, oa]]) stoneOut.face.push(u, 1, n[0], n[1]);
                    const ca = coping[key][k], cb = coping[key][k + 1];
                    const ia = [qa[0] - oa[0] * ca, qa[1], qa[2] - oa[1] * ca], ib = [qb[0] - ob[0] * cb, qb[1], qb[2] - ob[1] * cb];
                    RoadMesh.quad(stoneOut, qa, qb, ib, ia, colors.stone);
                    for (let v = 0; v < 6; v++) stoneOut.face.push(0, 0, 0, 0);
                    // and its side to the road, from the coping down under the verge
                    RoadMesh.innerFace(stoneOut, ia, ib, pa[1] - RoadMesh.APRON_UNDER_M, pb[1] - RoadMesh.APRON_UNDER_M, oa, ob, ua, ub, colors.stone);
                } else RoadMesh.quad(out, pa, pb, [pb[0], depth(fb, pb), pb[2]], [pa[0], depth(fa, pa), pa[2]], kind === 'deck' ? colors.deck : colors.stone);
                // Each end of a retaining wall's run returns under the road (`cap`)
                const ended = [false, false];
                if (kind === 'wall') {
                    // (none at an end that a piece of wall joins to another road's, `foot.joined`: the wall goes on
                    // there, and the return stood in the junction's paving as a tab of stone)
                    const goesOn = p => !!(foot && foot.joined && foot.joined(p[0], p[1], p[2]));
                    ended[0] = kindOf(k - 1, key) !== 'wall' && !goesOn(pa);
                    ended[1] = kindOf(k + 1, key) !== 'wall' && !goesOn(pb);
                    const len = Math.hypot(pb[0] - pa[0], pb[2] - pa[2]) || 1, along = [(pb[0] - pa[0]) / len, (pb[2] - pa[2]) / len];
                    if (ended[0]) cap(pa, depth(fa, pa), k, [-along[0], -along[1]]);
                    if (ended[1]) cap(pb, depth(fb, pb), k + 1, along);
                }
                // (none on the segment that ends at a structure's row: the structure's own parapet ends there, a hand
                // from where this one would, and the two made a step)
                const abuts = kind === 'wall' && ((sides[k].bits | sides[k + 1].bits) & 7);
                // (a wall's parapet stands on its coping, COPING_UP_M over the edge: its face goes on from the wall's own
                // and the two share their edge)
                const seat = p => (kind === 'wall' ? [p[0], p[1] + RoadMesh.COPING_UP_M, p[2]] : p);
                // (none on a wall whose marker stones stand in its place)
                if (kind === 'deck' || (!abuts && !stoned(k, key) && RoadMesh.railed(pa, pb, depth(fa, pa), depth(fb, pb)))) rails[kind === 'deck' ? 'wall' : 'stone'][key].push({ k, pa: seat(pa), pb: seat(pb), o, drawn, oa: RoadMesh.outward(sides[k])[key], ob: RoadMesh.outward(sides[k + 1])[key], ua: kind === 'wall' ? alongOf(k, key) : NaN, ub: kind === 'wall' ? alongOf(k + 1, key) : NaN, endA: ended[0], endB: ended[1] });
                if (kind === 'deck') soffit = true;
            }
            // Under an overhanging edge: the soffit, from one edge to the other at the deck's depth
            if (soffit) {
                const under = p => [p[0], p[1] - RoadMesh.DECK_M, p[2]];
                RoadMesh.quad(wallOut, under(sides[k].l), under(sides[k + 1].l), under(sides[k + 1].r), under(sides[k].r), colors.deck);
            }
        }
        // The parapets, each run of them one continuous rail along the edge
        for (const key of ['l', 'r']) {
            RoadMesh.rails(stone, rails.stone[key], W, H, colors.stone, RoadMesh.STONE_PROUD_M);
            RoadMesh.rails(wall, rails.wall[key], W, H, colors.concrete);
        }
        while (stone.face.length < (stone.positions.length / 3) * 4) stone.face.push(0, 0, 0, 0);
        return { apron, wall, stone, paving, walls: RoadMesh.wallRuns(sides, plan, drawFrom, drawTo) };
    }

    // The edge works of a ribbon as one mesh, added to `group` ('road-works': the apron in the land's material
    // (group 0), decks and the extra structures in the structures' (1), retaining walls and their parapets in stone
    // (2), a junction's paving in the road's (3), a viaduct's stone (4, RoadMesh.viaduct)): the triangles they cost.
    // Groups 0 and 3 are ground, 1, 2 and 4 structures. `userData.viaduct` holds the vertex ranges ([start, count]) of
    // group 4's arch undersides (`soffits`) and of its stone that stands on the land (`feet`), for the checks
    // `sides` may be a list of rows' sides, or a list of such lists (several roads in one mesh: the side roads of a chunk)
    // `extra` are structure parts ({positions, shades}, sRGB) drawn in the same mesh when it is made at all.
    // `roads` (Carriageways) keeps each run's works out of every other road's carriageway (RoadMesh.edgeWorks guard)
    static addEdgeWorks(group, sides, foot, extra = [], roads = null, join = null) {
        const runs = sides.length && Array.isArray(sides[0]) ? sides : [sides];
        const works = { apron: { positions: [], shades: [] }, wall: { positions: [], shades: [] }, stone: { positions: [], shades: [] }, paving: { positions: [], shades: [] }, arch: { positions: [], shades: [] } };
        const face = [];
        // The road each triangle belongs to (a run's or a part's `owner`: a side edge id, -1 for the ride), so a check
        // can tell a road's own structures from another road's
        const owners = { apron: [], wall: [], stone: [], paving: [], arch: [] };
        const arches = { soffits: [], feet: [], lit: [] };
        const own = (key, count, owner) => { for (let t = 0; t < count / 9; t++) owners[key].push(owner); };
        // The runs of retaining wall drawn here (RoadMesh.wallRuns), for the land that is cut to them
        const walls = group.userData.walls = [];
        for (const run of runs) {
            const part = RoadMesh.edgeWorks(run, foot, roads ? roads.guard(run.owner ?? -1) : null);
            for (const wall of part.walls) walls.push(Object.assign(wall, { owner: run.owner ?? -1 }));
            face.push(...part.stone.face);
            for (const key of ['apron', 'wall', 'stone', 'paving']) {
                works[key].positions.push(...part[key].positions);
                works[key].shades.push(...part[key].shades);
                own(key, part[key].positions.length, run.owner ?? -1);
            }
        }
        // The pieces of wall that join these runs to another road's (`join(walls)`: WorldEnvironment.wallJoins)
        for (const piece of join ? join(walls) : []) {
            const before = works.stone.positions.length;
            RoadMesh.wallJoin(works.stone, face, piece);
            own('stone', works.stone.positions.length - before, piece.owner ?? -1);
            // and the ground behind it, between the two roads' edges: paving at the roads' height (under both
            // ribbons where they are paved), or the corner behind the piece was a pit
            const under = (p, back) => [p[0] - piece.o[0] * back, p[1] - RoadMesh.JOIN_UNDER_M, p[2] - piece.o[1] * back];
            const c = RoadMesh.PAVING_LINEAR, start = works.paving.positions.length;
            // (and JOIN_PAST_M past the ride's end of the piece, in under the ride's edge: between the piece, the end
            // of the ride's wall and the paving from the carriageway a corner stayed open, a hole at the wall's end)
            const len = Math.hypot(piece.b[0] - piece.a[0], piece.b[2] - piece.a[2]) || 1, past = RoadMesh.JOIN_PAST_M / len;
            const b = [piece.b[0] + (piece.b[0] - piece.a[0]) * past, piece.b[1], piece.b[2] + (piece.b[2] - piece.a[2]) * past];
            RoadMesh.quad(works.paving, under(piece.a, 0), under(b, 0), under(b, RoadMesh.JOIN_BACK_M), under(piece.a, RoadMesh.JOIN_BACK_M), [c, c, c, c]);
            own('paving', works.paving.positions.length - start, piece.owner ?? -1);
        }
        if (!works.apron.positions.length && !works.wall.positions.length && !works.stone.positions.length && !works.paving.positions.length && !extra.some(part => part.positions.length)) return 0;
        for (const part of extra) {
            // (a viaduct's stone in its own group, in the stone's material)
            const into = part.viaduct ? works.arch : works.wall;
            const base = into.positions.length / 3;
            if (part.viaduct) for (const key of ['soffit', 'feet']) for (const [start, count] of part[key] || []) arches[key === 'soffit' ? 'soffits' : 'feet'].push([base + start, count]);
            if (part.viaduct) for (const [start, count, ox, oz] of part.lit || []) arches.lit.push([base + start, count, ox, oz]);
            into.positions.push(...part.positions);
            into.shades.push(...part.shades);
            own(part.viaduct ? 'arch' : 'wall', part.positions.length, part.owner ?? -1);
        }
        const apron = works.apron.positions.length / 3, wall = works.wall.positions.length / 3, stone = works.stone.positions.length / 3, paving = works.paving.positions.length / 3, arch = works.arch.positions.length / 3;
        // Every apron triangle faces up: a double-sided material flips the normal of a face seen from its back, and an
        // apron lit from underneath drew as a black line along the verge
        for (const part of [works.apron, works.paving]) {
            const ap = part.positions, ash = part.shades;
            for (let t = 0; t < ap.length; t += 9) {
                const ux = ap[t + 3] - ap[t], uz = ap[t + 5] - ap[t + 2], vx = ap[t + 6] - ap[t], vz = ap[t + 8] - ap[t + 2];
                if (uz * vx - ux * vz >= 0) continue;
                for (let k = 0; k < 3; k++) {
                    [ap[t + 3 + k], ap[t + 6 + k]] = [ap[t + 6 + k], ap[t + 3 + k]];
                    [ash[t + 3 + k], ash[t + 6 + k]] = [ash[t + 6 + k], ash[t + 3 + k]];
                }
            }
        }
        // One colour space for the mesh: the apron's are the land's (linear), the walls' are made linear here
        const shades = works.apron.shades.concat(works.wall.shades.map(v => Math.pow(v, 2.2)), works.stone.shades.map(v => Math.pow(v, 2.2)), works.paving.shades, works.arch.shades.map(v => Math.pow(v, 2.2)));
        const geometry = RoadMesh.geometry(works.apron.positions.concat(works.wall.positions, works.stone.positions, works.paving.positions, works.arch.positions), shades);
        geometry.userData.linearColors = true;
        geometry.userData.owners = Int32Array.from(owners.apron.concat(owners.wall, owners.stone, owners.paving, owners.arch));
        const first = apron + wall + stone + paving;
        geometry.userData.viaduct = { soffits: arches.soffits.map(([start, count]) => [first + start, count]), feet: arches.feet.map(([start, count]) => [first + start, count]) };
        geometry.addGroup(0, apron, 0);
        if (wall) geometry.addGroup(apron, wall, 1);
        if (stone) geometry.addGroup(apron + wall, stone, 2);
        // A junction's paving is road, drawn as a road is (RoadSurface.pavingMaterial): as land it was a pale slab
        if (paving) geometry.addGroup(apron + wall + stone, paving, 3);
        if (arch) geometry.addGroup(first, arch, 4);
        // A wall is lit flat across each quad: its two triangles share the quad's normal, so no crease shows. The apron
        // is lit as the land round it is (straight up): lit as a slope it read as a dark seam along the verge
        RoadMesh.flatNormals(geometry, apron / 3);
        const normal = geometry.attributes.normal.array;
        for (const v0 of [0, apron + wall + stone]) for (let v = v0; v < v0 + (v0 ? paving : apron); v++) { normal[v * 3] = 0; normal[v * 3 + 1] = 1; normal[v * 3 + 2] = 0; }
        // A retaining wall's face is lit as one face along its run (each row's outward), and its courses are laid
        // along its own metres (`wallFace`: metres along, 1 on a wall's face, 2 on one drawn from its front only),
        // LandShade's stone
        const wallFace = new Float32Array((apron + wall + stone + paving + arch) * 2);
        for (let v = 0; v < stone; v++) {
            if (!face[v * 4 + 1]) continue;
            const at = apron + wall + v;
            wallFace[at * 2] = face[v * 4];
            wallFace[at * 2 + 1] = face[v * 4 + 1];
            normal[at * 3] = face[v * 4 + 2]; normal[at * 3 + 1] = 0; normal[at * 3 + 2] = face[v * 4 + 3];
        }
        // (a viaduct's vaults lit as the face each opens in: RoadMesh.viaduct `lit`)
        for (const [start, count, ox, oz] of arches.lit) for (let v = first + start; v < first + start + count; v++) { normal[v * 3] = ox; normal[v * 3 + 1] = 0; normal[v * 3 + 2] = oz; }
        geometry.setAttribute('wallFace', new THREE.BufferAttribute(wallFace, 2));
        // The paving takes the asphalt's texture on the ground plane, at the near ribbon's scale (from a whole tile
        // near the mesh, so the numbers stay small enough for the grain)
        if (paving) {
            const uv = new Float32Array((apron + wall + stone + paving + arch) * 2), pos = geometry.attributes.position.array, m = RoadSurface.ASPHALT_M;
            const first = (apron + wall + stone) * 3, u0 = Math.floor(pos[first] / m), v0 = Math.floor(pos[first + 2] / m);
            for (let v = apron + wall + stone; v < apron + wall + stone + paving; v++) { uv[v * 2] = pos[v * 3] / m - u0; uv[v * 2 + 1] = pos[v * 3 + 2] / m - v0; }
            geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        }
        const mesh = RoadMesh.mesh(geometry, 'road-works', [RoadMesh.apronMaterial(), RoadMesh.material(), RoadMesh.stoneMaterial(), RoadSurface.pavingMaterial(), RoadMesh.stoneMaterial()]);
        mesh.userData.world = 'works';
        group.add(mesh);
        return (apron + wall + stone + paving + arch) / 3;
    }

    // A piece of retaining wall from the end of one run (`a`, its top corner, `outA` the way that run faces there,
    // `footA` its foot) to the end of another (`b`, `outB`, `footB`),
    // facing `o`: its face shares both runs' own corners, and it takes a parapet where both runs have one. `out` is the stone ({positions, shades}), `face` its
    // face data (four numbers a vertex, as edgeWorks lays it)
    static wallJoin(out, face, { a, b, footA, footB, outA, outB, o, parapet }) {
        const P = RoadMesh.STONE_PROUD_M, colors = RoadMesh.COLORS;
        const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
        const up = RoadMesh.COPING_UP_M;
        const qa = [a[0] + outA[0] * P, a[1] + up, a[2] + outA[1] * P], qb = [b[0] + outB[0] * P, b[1] + up, b[2] + outB[1] * P];
        RoadMesh.quad(out, qa, qb, [qb[0], footB, qb[2]], [qa[0], footA, qa[2]], colors.stone);
        for (const u of [0, len, len, 0, len, 0]) face.push(u, 1, o[0], o[1]);
        // (its coping, as every wall's, laid in along each run's own way at its end, so it meets that run's coping; but
        // where those two ways would twist it, its inner edge running against its face or across it, along the
        // piece's own square way)
        const square = [-(qb[2] - qa[2]) / (len || 1), (qb[0] - qa[0]) / (len || 1)], sign = square[0] * o[0] + square[1] * o[1] < 0 ? -1 : 1;
        const own = [square[0] * sign, square[1] * sign];
        const inner = (wa, wb) => { const ca = RoadMesh.copingIn(wa, qa, qb), cb = RoadMesh.copingIn(wb, qa, qb); return [[qa[0] - wa[0] * ca, qa[1], qa[2] - wa[1] * ca], [qb[0] - wb[0] * cb, qb[1], qb[2] - wb[1] * cb]]; };
        const twisted = ([ia, ib]) => {
            const side = p => (qb[0] - qa[0]) * (p[2] - qa[2]) - (qb[2] - qa[2]) * (p[0] - qa[0]);
            return (ib[0] - ia[0]) * (qb[0] - qa[0]) + (ib[2] - ia[2]) * (qb[2] - qa[2]) <= 0 || side(ia) * side(ib) <= 0;
        };
        let ways = [outA, outB];
        if (twisted(inner(...ways))) ways = [own, own];
        const [ia, ib] = inner(...ways);
        RoadMesh.quad(out, qa, qb, ib, ia, colors.stone);
        for (let v = 0; v < 6; v++) face.push(0, 0, 0, 0);
        // (and its side to the road, from the coping down under the verge)
        RoadMesh.innerFace({ positions: out.positions, shades: out.shades, face }, ia, ib, a[1] - RoadMesh.APRON_UNDER_M, b[1] - RoadMesh.APRON_UNDER_M, ways[0], ways[1], 0, len, colors.stone);
        if (parapet) RoadMesh.rail({ positions: out.positions, shades: out.shades, face }, [[a[0], a[1] + up, a[2]], [b[0], b[1] + up, b[2]]], ways, RoadMesh.PARAPET_W_M, RoadMesh.PARAPET_H_M, colors.stone, [false, false], [0, len], P);
        while (face.length < (out.positions.length / 3) * 4) face.push(0, 0, 0, 0);
    }

    // From triangle `first` on, each pair of triangles (a quad of RoadMesh.quad) takes the mean of their face normals
    static flatNormals(geometry, first = 0) {
        const pos = geometry.attributes.position.array;
        const normal = geometry.attributes.normal.array;
        const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), m = new THREE.Vector3();
        const face = (t, out) => {
            a.fromArray(pos, t * 9); b.fromArray(pos, t * 9 + 3); c.fromArray(pos, t * 9 + 6);
            return out.subVectors(c, b).cross(a.clone().sub(b)).normalize();
        };
        for (let t = first; t + 1 < pos.length / 9; t += 2) {
            face(t, n);
            face(t + 1, m);
            n.add(m).normalize();
            for (let v = 0; v < 6; v++) n.toArray(normal, (t * 3 + v) * 3);
        }
        geometry.attributes.normal.needsUpdate = true;
    }

    // A pier's box at (x, z) under a deck at height `top`, turned to `heading`: its foot on the lowest land under any
    // corner of it, at any level of detail the tile is drawn at, and PIER_SINK_M into it, so it never stands on air
    // beside a coarse triangle. Null where no land is known or the deck is too low for one
    static pierAt(x, z, top, heading, groundAt, footAt, w = RoadMesh.PIER_W_M, dz = RoadMesh.PIER_D_M) {
        const fs = Math.sin(heading), fc = Math.cos(heading);
        const corners = [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]].map(([u, v]) => [x + (u * w / 2) * fc + (v * dz / 2) * fs, z - (u * w / 2) * fs + (v * dz / 2) * fc]);
        let floor = Infinity;
        for (const [px, pz] of corners) {
            const f = (footAt || groundAt) ? (footAt || groundAt)(px, pz) : null;
            if (Number.isFinite(f)) floor = Math.min(floor, f);
        }
        if (!Number.isFinite(floor)) return null;
        floor -= RoadMesh.PIER_SINK_M;
        return top - floor > 1 ? { x, z, top, foot: floor, width: w, depth: dz, heading, corners } : null;
    }

    // Piers under deck runs (`runs`: each a list of {p: [x, y, z] the deck's top centre, d: metres along}), one every
    // PIER_EVERY_M from the first span's middle, `width` across and `depth` along the deck. A pier whose place stands in
    // a road or its verge (RoadSurface.VERGE_M and PIER_CLEAR_M past it, `guard`) moves along the run, a metre at a
    // time, to the nearest clear place, so a deck crosses a road in one span. Adds the boxes to `out`; returns the piers
    static placePiers(out, runs, { groundAt = null, footAt = null, guard = null, width = RoadMesh.PIER_W_M, depth = RoadMesh.PIER_D_M } = {}) {
        const piers = [];
        const D = RoadMesh.DECK_M, every = RoadMesh.PIER_EVERY_M;
        const verge = typeof RoadSurface !== 'undefined' ? RoadSurface.VERGE_M : 1.1;
        const along = (pts, d) => {
            let i = 0;
            while (i + 2 < pts.length && pts[i + 1].d < d) i++;
            const a = pts[i], b = pts[i + 1], t = b.d > a.d ? Math.max(0, Math.min(1, (d - a.d) / (b.d - a.d))) : 0;
            return { x: a.p[0] + (b.p[0] - a.p[0]) * t, y: a.p[1] + (b.p[1] - a.p[1]) * t, z: a.p[2] + (b.p[2] - a.p[2]) * t, heading: Math.atan2(b.p[0] - a.p[0], b.p[2] - a.p[2]) };
        };
        const clear = pier => !guard || pier.corners.every(([x, z]) => guard.clear(x, z, pier.foot, pier.top, verge + RoadMesh.PIER_CLEAR_M));
        for (const pts of runs) {
            if (pts.length < 2) continue;
            const length = pts[pts.length - 1].d;
            for (let want = pts[1].d / 2; want <= length; want += every) {
                let placed = null;
                for (let shift = 0; shift <= every / 2 && !placed; shift += 1) {
                    for (const d of shift ? [want - shift, want + shift] : [want]) {
                        if (d < 0 || d > length) continue;
                        const q = along(pts, d);
                        const pier = RoadMesh.pierAt(q.x, q.z, q.y - D, q.heading, groundAt, footAt, width, depth);
                        if (pier && clear(pier) && !piers.some(o => Math.hypot(o.x - pier.x, o.z - pier.z) < every / 3)) { placed = pier; break; }
                    }
                }
                if (!placed) continue;
                const { corners, ...pier } = placed;
                RoadMesh.box(out, pier.x, pier.foot + (pier.top - pier.foot) / 2, pier.z, pier.width, pier.top - pier.foot, pier.depth, pier.heading, RoadMesh.COLORS.concrete);
                piers.push(pier);
            }
        }
        return piers;
    }

    // Every road keeps the ride's rule: a surface more than PARAPET_DROP_M over the land under it stands on a structure.
    // A side row flagged bridge, or that high over the land at its centre or at both edges, rides on a deck (sides
    // from its edges, a soffit under it, parapets and a pier every PIER_EVERY_M down to the land); a tunnel or gallery
    // row gets a tube. `sides` are the ribbon's rows' edges ({bits, l, r}, ribbon.sides); `groundAt(x, z)` is the drawn
    // land, null where it is not known. `guard` (Carriageways.guard) keeps the deck, its parapets and its piers out of
    // every other road's carriageway: a row whose deck would stand in one has none (the deck stops at that road's edge),
    // and a pier whose place falls in a road or its verge moves along the deck to the nearest place clear of both, so
    // the deck spans the road in one. Returns {parts, piers, sides}: the structures ({positions, shades}, sRGB) and
    // the sides with the bridge bit on every decked row, so the edge works leave those to the deck
    static sideStructures(sides, groundAt = null, roof = 6.5, footAt = null, guard = null) {
        const out = { positions: [], shades: [] };
        const colors = RoadMesh.COLORS;
        const drop = RoadMesh.PARAPET_DROP_M, D = RoadMesh.DECK_M, H = RoadMesh.PARAPET_H_M;
        const gap = p => {
            const g = groundAt ? groundAt(p[0], p[2]) : null;
            return Number.isFinite(g) ? p[1] - g : 0;
        };
        const centre = side => [(side.l[0] + side.r[0]) / 2, (side.l[1] + side.r[1]) / 2, (side.l[2] + side.r[2]) / 2];
        const raised = sides.map(side => {
            if (side.bits & 2) return true;
            if (side.bits & 5) return false;
            // On a deck where the land lies under both edges. A road along a hillside, one edge on the land, stands on
            // a fill behind a retaining wall (the edge works) while that wall is no higher than SIDE_WALL_M, and so
            // does a road in a junction's mouth (`fill`): the importer carved no land for these roads, and a concrete
            // deck that started in the junction, a pier in the ride's own bank, is not what stands there
            if (side.fill) return false;
            const l = gap(side.l), r = gap(side.r);
            return (l > drop && r > drop) || Math.max(l, r) > RoadMesh.SIDE_WALL_M;
        });
        // A deck cross-section (soffit to its top, under the road) clear of every other carriageway: at a junction the
        // deck runs on under the road it meets, and only its parapets stop (clearRail)
        const clearRow = side => !guard || [side.l, centre(side), side.r].every(p => guard.clear(p[0], p[2], p[1] - D, p[1] - 0.02));
        const W = RoadMesh.PARAPET_W_M;
        const clearRail = (pa, pb, o) => !guard || [pa, pb].every(p => guard.clear(p[0], p[2], p[1], p[1] + H) && guard.clear(p[0] - o[0] * W, p[2] - o[1] * W, p[1], p[1] + H));
        // The deck reaches one row past each raised run, onto the abutment
        const decked = raised.map((on, k) => (on || (raised[k - 1] && !(sides[k].bits & 5)) || (raised[k + 1] && !(sides[k].bits & 5))) && clearRow(sides[k]));
        const down = (p, m) => [p[0], p[1] - m, p[2]];
        const rails = { l: [], r: [] };
        // The deck's centre line, run by run, for the piers
        const runs = [];
        let run = null;
        for (let k = 0; k + 1 < sides.length; k++) {
            const a = sides[k], b = sides[k + 1];
            if (a.bits & b.bits & 5) {
                // The roof stays under any other road the tube passes beneath, by the deck's depth
                const up = p => {
                    const over = guard ? guard.ceiling(p[0], p[2], p[1]) : null;
                    return [p[0], p[1] + (over === null ? roof : Math.max(1, Math.min(roof, over - D - p[1]))), p[2]];
                };
                RoadMesh.quad(out, a.l, b.l, up(b.l), up(a.l), colors.tunnel);
                RoadMesh.quad(out, b.r, a.r, up(a.r), up(b.r), colors.tunnel);
                RoadMesh.quad(out, up(a.l), up(b.l), up(b.r), up(a.r), colors.tunnel);
                run = null;
                continue;
            }
            if (!(decked[k] && decked[k + 1])) { run = null; continue; }
            // Faces from the edges down, sharing each row's edge points with the segments either side: one swept deck
            const top = 0.02;
            RoadMesh.quad(out, down(a.l, top), down(b.l, top), down(b.l, D), down(a.l, D), colors.deck);
            RoadMesh.quad(out, down(b.r, top), down(a.r, top), down(a.r, D), down(b.r, D), colors.deck);
            RoadMesh.quad(out, down(a.l, D), down(b.l, D), down(b.r, D), down(a.r, D), colors.deck);
            const across = [a.r[0] - a.l[0], a.r[2] - a.l[2]];
            const len = Math.hypot(across[0], across[1]) || 1;
            const ol = [-across[0] / len, -across[1] / len];
            if (clearRail(a.l, b.l, ol)) rails.l.push({ k, pa: a.l, pb: b.l, o: ol });
            if (clearRail(a.r, b.r, [-ol[0], -ol[1]])) rails.r.push({ k, pa: a.r, pb: b.r, o: [-ol[0], -ol[1]] });
            if (!run) runs.push(run = [{ p: centre(a), d: 0 }]);
            const c = centre(b), last = run[run.length - 1];
            run.push({ p: c, d: last.d + Math.hypot(c[0] - last.p[0], c[2] - last.p[2]) });
        }
        RoadMesh.rails(out, rails.l, RoadMesh.PARAPET_W_M, H, colors.concrete);
        RoadMesh.rails(out, rails.r, RoadMesh.PARAPET_W_M, H, colors.concrete);
        const piers = RoadMesh.placePiers(out, runs, { groundAt, footAt, guard });
        return { parts: out.positions.length ? [out] : [], piers, sides: sides.map((side, k) => (decked[k] ? { ...side, bits: side.bits | 2 } : side)) };
    }

    static structureMesh(parts, name) {
        if (!parts.positions.length) return null;
        return RoadMesh.mesh(RoadMesh.geometry(parts.positions, parts.shades), name);
    }

    // One section of the ride as a group: the ribbon at `lod` and, at LOD0 and LOD1, its structures.
    // rows: the ride's rows for the section, including one past each end so sections meet.
    // `roads` (Carriageways) keeps the section's works, bridges and piers out of every other road's carriageway
    // `head` and `tail` rows at each end are the neighbouring sections' (read for the bend, the runs of walls, tunnels and
    // bridges, drawn by those sections): a section draws from its first row to its last, and shares those with its
    // neighbours, so no segment, cap or portal is laid twice in one plane where two sections meet
    static section(rows, lod, { groundAt = null, roof = 6.5, foot = null, roads = null, head = 0, tail = 0, plan = null } = {}) {
        const group = new THREE.Group();
        group.name = 'world-road-section';
        const first = head, last = rows.length - 1 - tail;
        // A row where a wall's run starts or ends is kept at every level of detail when the far ribbon would draw
        // the wall more than WALL_PAST_M past it: the land is cut to the wall's line as the plan of all the rows
        // gives it, and a far ribbon whose kept rows passed over the end drew the wall on to its next row, up to
        // 16 m past the place the land was cut for
        if (lod > 0 && plan) {
            const walled = (key, i) => !!plan.seg[key][i - plan.base];
            // A side road's mouth is kept whole at every level of detail, with the row either side of it. A segment
            // between two kept rows is a wall when any segment of the plan of all the rows it spans is (planFor), so a
            // far ribbon that passed over the mouth drew the wall on into it: the wall's end at its full height on the
            // mouth's row, the slope laid from there open beside it over the land levelled in front of the wall
            const mouth = k => !!rows[k] && !!(rows[k].mouthL || rows[k].mouthR);
            rows = rows.map((row, k) => (mouth(k - 1) || mouth(k) || mouth(k + 1) ? { ...row, keep: true } : row));
            const marked = rows.map((row, i) => (i === first || i === last ? { ...row, keep: true } : row));
            const kept = new Set(RoadMesh.decimate(marked).map(row => row.i));
            const past = RoadMesh.WALL_PAST_M;
            rows = rows.map((row, k) => {
                for (const key of ['l', 'r']) {
                    const before = walled(key, row.i - 1), after = walled(key, row.i);
                    if (before === after) continue;
                    // The ribbon carries the wall on from its end to the next kept row on the side with no wall
                    const step = before ? 1 : -1;
                    let run = 0;
                    for (let j = k; j >= 0 && j < rows.length; j += step) {
                        if (j !== k) run += Math.hypot(rows[j].x - rows[j - step].x, rows[j].z - rows[j - step].z);
                        if (kept.has(rows[j].i)) break;
                    }
                    if (run > past) return { ...row, keep: true };
                }
                return row;
            });
        }
        const ribbon = RoadMesh.ribbon(rows, lod, null, false, [first, last]);
        ribbon.sides.draw = ribbon.draw;
        // The ride's walls stand where the plan of all its rows puts them, at every level of detail
        if (plan) ribbon.sides.plan = plan;
        group.add(RoadMesh.ribbonMesh(ribbon, 'road-ribbon'));
        let triangles = ribbon.triangles;
        const structures = [];
        const guard = roads ? roads.guard(-1) : null;
        // A run clipped to the drawn rows; it ends where it really ends, not where it goes on into a neighbour
        const clip = mask => RoadMesh.runs(rows, mask).map(([from, to]) => [Math.max(from, first), Math.min(to, last), [from >= first, to <= last]]).filter(([from, to]) => to > from);
        for (const [from, to, ends] of clip(1 | 4)) structures.push([RoadMesh.tunnel(rows, from, to, roof, ends), 'tunnel']);
        // (a viaduct's rows carry its layout, WorldEnvironment.viaducts: its stone in place of a bridge's concrete)
        for (const [from, to, ends] of clip(2)) structures.push(rows[from].viaduct ? [RoadMesh.viaduct(rows, from, to, rows[from].viaduct, { lod, land: foot && foot.land ? foot.land : null, ends }), 'viaduct'] : [RoadMesh.bridge(rows, from, to, groundAt, guard, ends), 'bridge']);
        // With edge works the tunnels and bridges join their mesh (same material: the window counts meshes)
        const works = RoadMesh.addEdgeWorks(group, ribbon.sides, foot, structures.map(([parts]) => parts), roads);
        if (works) triangles += works;
        else {
            for (const [parts, name] of structures) {
                const mesh = RoadMesh.structureMesh(parts, name);
                if (mesh) {
                    group.add(mesh);
                    triangles += parts.positions.length / 9;
                }
            }
        }
        group.userData.triangles = triangles;
        group.userData.clamped = ribbon.clamped;
        return group;
    }

    // A side road beyond the junction: the stub at LOD0 when `stub`, else the LOD1 ribbon. `holdY` keeps it under
    // the ride where it crosses the ride's road band (WorldEnvironment.sideHold); `foot` sets its edge works (RoadMesh.edgeWorks);
    // `groundAt(x, z)` is the drawn land its structures stand on (RoadMesh.sideStructures)
    // `guard` (Carriageways.guard of this road) keeps its structures out of every other road's carriageway
    static sideRoad(rows, stub, holdY = null, foot = null, { groundAt = null, footAt = null, roof = 6.5, guard = null } = {}) {
        const group = new THREE.Group();
        group.name = stub ? 'world-road-stub' : 'world-road-side';
        const ribbon = RoadMesh.ribbon(rows, stub ? 0 : 1, holdY, true);
        group.add(RoadMesh.ribbonMesh(ribbon, 'road-side'));
        const built = RoadMesh.sideStructures(ribbon.sides, groundAt, roof, footAt, guard);
        // Without a foot the edge works and structures are left to the caller, which draws those of many side roads as one mesh
        const triangles = ribbon.triangles + (foot ? RoadMesh.addEdgeWorks(group, Object.assign(built.sides, { owner: guard ? guard.owner : -1 }), foot, built.parts) : 0);
        group.userData.triangles = triangles;
        group.userData.sides = built.sides;
        group.userData.structures = built.parts;
        group.userData.piers = built.piers;
        return group;
    }

    // The ribbon meshes under `group` (named 'road-side', the side roads of a chunk) merged into one mesh per material,
    // added to `group`, the old ones freed: a chunk costs the window one mesh per kind of ribbon, however many roads
    // it holds. The roads' own groups stay, with their userData. Returns the meshes it made
    static mergeRibbons(group) {
        const byMaterial = new Map();
        group.traverse(o => { if (o.isMesh && o.name === 'road-side') (byMaterial.get(o.material) || byMaterial.set(o.material, []).get(o.material)).push(o); });
        const made = [];
        for (const [material, meshes] of byMaterial) {
            if (meshes.length < 2) continue;
            const geometry = RoadMesh.mergeGeometries(meshes.map(m => m.geometry));
            meshes.forEach(m => { m.parent.remove(m); m.geometry.dispose(); });
            const mesh = RoadMesh.mesh(geometry, 'road-side', material);
            group.add(mesh);
            made.push(mesh);
        }
        return made;
    }

    // Geometries with the same attributes as one: indexed if any is (the others get an index of their own vertices)
    static mergeGeometries(list) {
        const names = Object.keys(list[0].attributes);
        const out = new THREE.BufferGeometry();
        const count = list.reduce((n, g) => n + g.attributes.position.count, 0);
        for (const name of names) {
            const size = list[0].attributes[name].itemSize;
            const array = new Float32Array(count * size);
            let at = 0;
            for (const g of list) { array.set(g.attributes[name].array, at); at += g.attributes[name].array.length; }
            out.setAttribute(name, new THREE.BufferAttribute(array, size));
        }
        if (list.some(g => g.index)) {
            // Typed throughout: a side chunk's ribbons are merged again at every change of level of detail
            const index = new Uint32Array(list.reduce((n, g) => n + (g.index ? g.index.count : g.attributes.position.count), 0));
            let base = 0, at = 0;
            for (const g of list) {
                if (g.index) for (let i = 0, a = g.index.array; i < a.length; i++) index[at++] = a[i] + base;
                else for (let i = 0; i < g.attributes.position.count; i++) index[at++] = i + base;
                base += g.attributes.position.count;
            }
            out.setIndex(new THREE.BufferAttribute(index, 1));
        }
        Object.assign(out.userData, list[0].userData);
        out.computeBoundingSphere();
        return out;
    }

    // The road-closed barrier, one unit wide: two posts and two striped boards
    static barrierGeometry() {
        const out = { positions: [], shades: [] };
        const colors = RoadMesh.COLORS;
        for (const x of [-0.46, 0.46]) RoadMesh.box(out, x, RoadMesh.BARRIER_H_M / 2, 0, 0.08, RoadMesh.BARRIER_H_M, 0.08, 0, colors.barrierWhite);
        const stripes = 8;
        for (const [y, flip] of [[1.0, 0], [0.62, 1]]) {
            for (let k = 0; k < stripes; k++) {
                const c = (k + flip) % 2 === 0 ? colors.barrierRed : colors.barrierWhite;
                RoadMesh.box(out, -0.5 + (k + 0.5) / stripes, y, 0, 1 / stripes, 0.22, 0.05, 0, c);
            }
        }
        return RoadMesh.geometry(out.positions, out.shades);
    }

    // An instanced mesh of road-closed barriers, `capacity` at most; place() sets them
    static barriers(capacity = 32) {
        const mesh = new THREE.InstancedMesh(RoadMesh.barrierGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }), capacity);
        mesh.name = 'world-barriers';
        mesh.count = 0;
        mesh.frustumCulled = false;
        mesh.userData.world = 'barriers';
        return mesh;
    }

    // Puts `poses` ({x, y, z, heading, width}) into the instanced mesh
    static placeBarriers(mesh, poses) {
        const matrix = new THREE.Matrix4();
        const rotation = new THREE.Quaternion();
        const up = new THREE.Vector3(0, 1, 0);
        const scale = new THREE.Vector3();
        const position = new THREE.Vector3();
        const count = Math.min(poses.length, mesh.instanceMatrix.count);
        for (let i = 0; i < count; i++) {
            const p = poses[i];
            rotation.setFromAxisAngle(up, p.heading);
            // As wide as the box the physics stops the bike at (WorldGround.barrierHalf): what is solid is drawn
            scale.set(2 * WorldGround.barrierHalf(p.width), 1, 1);
            position.set(p.x, p.y, p.z);
            matrix.compose(position, rotation, scale);
            mesh.setMatrixAt(i, matrix);
        }
        mesh.count = count;
        mesh.instanceMatrix.needsUpdate = true;
        return count;
    }

    static dispose(object) {
        object.traverse(child => {
            if (child.geometry) child.geometry.dispose();
        });
    }
}

// Carriageways: the drawn carriageway of every road of a world, for the structures built beside them. The ride is read
// in its ribbon frame (WorldRoute.nearestSegment: the drawn column to the centimetre); each side edge from its samples,
// added the first time its chunk is resident and kept after (the data never changes), so a structure built before a
// side road's mesh still knows where that road runs. No structure of any road (deck, pier, parapet, retaining wall, its
// end, apron, barrier) may stand in another road's carriageway: RoadMesh's builders ask standsIn() before they lay one.
// No THREE.
class Carriageways {
    static get HASH_M() { return 16; }
    // A structure stands in a road when it rises over that road's surface by more than LOW_M and starts under
    // HEADROOM_M over it: a deck whose soffit is HEADROOM_M or more over a road passes over it
    static get LOW_M() { return 0.05; }
    static get HEADROOM_M() { return 4.5; }

    constructor(route, data) {
        this.route = route;
        this.data = data;
        this.segments = [];
        this.hash = new Map();
        this.indexed = new Set();
        this.chunksSeen = new Set();
        this.chains = new Map();
        this.near = {};
    }

    // Adds the side edges of the chunks that have arrived since the last call. The chunks are an LRU map whose size
    // stops growing once it is full, so it is the keys that tell a new chunk, not the count
    sync() {
        const data = this.data;
        if (!data || !data.edges || !data.chunks) return;
        let fresh = false;
        for (const k of data.chunks.keys()) if (!this.chunksSeen.has(k)) { this.chunksSeen.add(k); fresh = true; }
        if (!fresh) return;
        const cell = Carriageways.HASH_M;
        for (const edge of data.edges) {
            if (edge.onRide || this.indexed.has(edge.id)) continue;
            const e = data.edgeSamples(edge.id);
            if (!e) continue;
            this.indexed.add(edge.id);
            for (let i = 0; i + 1 < e.x.length; i++) {
                const g = { edgeId: edge.id, x0: e.x[i], z0: e.z[i], y0: e.y[i], x1: e.x[i + 1], z1: e.z[i + 1], y1: e.y[i + 1], h0: e.width[i] / 2, h1: e.width[i + 1] / 2 };
                const ref = this.segments.push(g) - 1;
                const reach = Math.max(g.h0, g.h1);
                for (let cx = Math.floor((Math.min(g.x0, g.x1) - reach) / cell); cx <= Math.floor((Math.max(g.x0, g.x1) + reach) / cell); cx++) {
                    for (let cz = Math.floor((Math.min(g.z0, g.z1) - reach) / cell); cz <= Math.floor((Math.max(g.z0, g.z1) + reach) / cell); cz++) {
                        const key = cx * 65536 + cz;
                        (this.hash.get(key) || this.hash.set(key, []).get(key)).push(ref);
                    }
                }
            }
        }
    }

    // The side edges a side road goes on as: `edgeId` and every edge joined to it through nodes of degree 2
    chainOf(edgeId) {
        if (this.chains.has(edgeId)) return this.chains.get(edgeId);
        const data = this.data, set = new Set([edgeId]);
        const degree = data.nodes && data.nodes.degree;
        if (!this.byNode) {
            this.byNode = new Map();
            for (const e of data.edges || []) for (const n of [e.a, e.b]) (this.byNode.get(n) || this.byNode.set(n, []).get(n)).push(e);
        }
        const edge = data.edges && data.edges[edgeId];
        if (edge && degree) {
            for (const start of [edge.a, edge.b]) {
                let node = start;
                while (degree[node] === 2) {
                    const next = (this.byNode.get(node) || []).find(e => !set.has(e.id));
                    if (!next || next.onRide) break;
                    set.add(next.id);
                    node = next.a === node ? next.b : next.a;
                }
            }
        }
        this.chains.set(edgeId, set);
        return set;
    }

    // Calls fn({road, depth, y}) for every road whose carriageway reaches within `margin` of (x, z): road -1 for the ride,
    // else the side edge id; depth is metres inside the carriageway's edge (negative outside it), y its surface there
    // `sidesOnly` leaves the ride out (a caller that reads the ride's segments itself)
    each(x, z, margin, fn, sidesOnly = false) {
        const cell = Carriageways.HASH_M, route = this.route, near = this.near;
        const rideSeen = new Set(), sideSeen = new Set();
        // The ride's own hash (WorldRoute.buildHash), in its own cells
        const rc = WorldRoute.HASH_M;
        for (let cx = Math.floor((x - margin) / rc); !sidesOnly && cx <= Math.floor((x + margin) / rc); cx++) {
            for (let cz = Math.floor((z - margin) / rc); cz <= Math.floor((z + margin) / rc); cz++) {
                for (const i of route.hash.get(cx * 65536 + cz) || []) {
                    if (rideSeen.has(i)) continue;
                    rideSeen.add(i);
                    // The chord first: a segment far off cannot frame the point
                    const a = route.points[i], b = route.points[i + 1];
                    const dx = b.x - a.x, dz = b.z - a.z, run = dx * dx + dz * dz;
                    const t = run === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / run));
                    if (Math.hypot(a.x + dx * t - x, a.z + dz * t - z) > Math.max(a.width, b.width) / 2 + margin + 1) continue;
                    route.nearestSegment(x, z, i, i, near);
                    const depth = near.width / 2 - near.distance;
                    if (depth >= -margin) fn({ road: -1, depth, y: near.y });
                }
            }
        }
        for (let cx = Math.floor((x - margin) / cell); cx <= Math.floor((x + margin) / cell); cx++) {
            for (let cz = Math.floor((z - margin) / cell); cz <= Math.floor((z + margin) / cell); cz++) {
                const sides = this.hash.get(cx * 65536 + cz);
                if (sides) for (const ref of sides) {
                    if (sideSeen.has(ref)) continue;
                    sideSeen.add(ref);
                    const g = this.segments[ref];
                    const dx = g.x1 - g.x0, dz = g.z1 - g.z0, run = dx * dx + dz * dz;
                    const t = run === 0 ? 0 : Math.max(0, Math.min(1, ((x - g.x0) * dx + (z - g.z0) * dz) / run));
                    const depth = g.h0 + (g.h1 - g.h0) * t - Math.hypot(g.x0 + dx * t - x, g.z0 + dz * t - z);
                    if (depth >= -margin) fn({ road: g.edgeId, depth, y: g.y0 + (g.y1 - g.y0) * t });
                }
            }
        }
    }

    // How deep a structure spanning heights y0 to y1 at (x, z) stands in the carriageway of a road `skip(road)` does not
    // leave out, counting `margin` metres past each edge as inside: the most metres inside, or null where it stands in none
    standsIn(x, z, y0, y1, skip = null, margin = 0) {
        let worst = null;
        this.each(x, z, margin, r => {
            if (skip && skip(r.road)) return;
            if (y1 <= r.y + Carriageways.LOW_M || y0 >= r.y + Carriageways.HEADROOM_M) return;
            if (worst === null || r.depth > worst) worst = r.depth;
        });
        return worst;
    }

    // A guard for the structures of road `owner` (-1 the ride, else a side edge id): clear(x, z, y0, y1, margin) is true
    // where they stand in no other road's carriageway. A side road's own chain is its own; the ride's own carriageway
    // counts against the ride's structures, which never stand on it (only another leg of it, a hairpin's other side)
    guard(owner) {
        this.sync();
        const own = owner >= 0 ? this.chainOf(owner) : null;
        // The ride's own works never move for the ride: its retaining walls between two legs are the physics' walls
        // (WorldGround.onRetainingWall), and where its verge meets another leg's the physics reads the verge as ground
        const skip = own ? road => road >= 0 && own.has(road) : road => road === -1;
        // The lowest surface of another road over (x, z) more than `above` metres over y, or null: what a tube's roof
        // must stay under
        const ceiling = (x, z, y, above = 1) => {
            let low = null;
            this.each(x, z, 0, r => { if (r.depth >= 0 && !(skip && skip(r.road)) && r.y > y + above && (low === null || r.y < low)) low = r.y; });
            return low;
        };
        // `any`: how deep in any carriageway at all, the owner's own legs too
        const out = { owner, clear: (x, z, y0, y1, margin = 0) => this.standsIn(x, z, y0, y1, skip, margin) === null, depth: (x, z, y0, y1) => this.standsIn(x, z, y0, y1, skip, 0), any: (x, z, y0, y1) => this.standsIn(x, z, y0, y1, null, 0), ceiling };
        // The ride's retaining walls are solid where the physics says so (WorldGround.onRetainingWall reads the same
        // drop zone as edgeFoot), whatever is drawn: across a side road's mouth one stays drawn, or the rider would stop
        // at nothing
        if (owner < 0) out.walls = { depth: () => null };
        return out;
    }
}
