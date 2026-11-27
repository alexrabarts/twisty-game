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
//   side roads:          a 60 m stub from the ride's junction, and beyond it the same LOD0 ribbon within
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
            tunnel: [0.32, 0.31, 0.30], deck: [0.38, 0.37, 0.36], wall: [0.66, 0.63, 0.57], stone: [0.58, 0.56, 0.52], apron: [0.30, 0.33, 0.20]
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
    // The longest row down a far section's slope that reaches the coarse land: a triangle of a 2 m strip stays under
    // 20 m2, which no slope's triangle passes (tests/unit/world-environment.test.js)
    static get DEEP_ROW_M() { return 18; }
    // Near a side road the ground under the verge is laid in pieces this long, each held under that road (edgeWorks)
    static get SIDE_UNDER_PIECE_M() { return 1; }
    // and this far under that road's centre line (its surface is held to the ride's at each of its own points, so it
    // lies a few centimetres lower toward an edge than on its centre: WorldEnvironment.sideHold)
    static get SIDE_GROUND_UNDER_M() { return 0.12; }
    static get SIDE_UNDER_REACH_M() { return 0.3; }
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

    // Where along a segment the taper past a wall's end is recorded for the physics (edgeWorks `drawn`)
    static get TAPER_SAMPLES() { return [0, 0.25, 0.5, 0.75, 1]; }

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
    // A retaining wall carries a parapet only where some of it drops this far (WorldPhysics.dropDepthM: the physics
    // makes a drop solid from the same depth, so what is drawn and what is solid agree); a lower wall is ridden off.
    // A wall that carries one carries it along its whole length, on over the face it goes on as past its end (edgeWorks
    // `taper`), at its full height to the wall's closed end, where it ends flush with a face of its own
    // (WorldEnvironment.wallRailed, edgeWorks `wallRailed`)
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
    // How often the edge between two of the ride's rows is read for the side road a junction's paving reaches out to
    static get PAVING_STEP_M() { return 0.5; }
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

    // How far the stone under a viaduct's deck is turned down from the face its arch opens in (radians): its light
    // is never more than that face's, and less of the sky's
    static get VAULT_TILT() { return Math.PI / 12; }
    // An arch's underside carries its metres across the road in wallFace's second value, offset by this so it can never
    // be read as a wall's 1 or 2 (LandShade's stone: over 2.5 is a barrel, its metres across that less BARREL)
    static get BARREL() { return 50; }

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
        const cutL = new Float32Array(n * W * 4), cutR = new Float32Array(n * W * 4);
        // The light of a tunnel or gallery over the road (TubeShade): its share and the metres in from the nearest portal,
        // the ride's from its whole route (WorldEnvironment.tubeRows), a side road's from its own rows
        const tubeAt = new Float32Array(n * W * 2);
        const depth = rows.some(row => row.bits & 5 && row.tubeIn === undefined) ? TubeLining.depths(rows, along) : null;
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
                // Across a side road's mouth a continuous edge line is broken (RoadSurface.MARKINGS.mouth). The ride's
                // verge is left out where a junction's paving lies beside the row (`pavedL`, `pavedR`) and where a side
                // road crosses it (`cutL`, `cutR`: the ride's metres it covers, WorldEnvironment.rowsOf, in this ribbon's
                // metres); a side road's at the mouths its rows name (`mouthL`, `mouthR`)
                const brokenAt = (line, mouth) => (mouth && line === RoadSurface.EDGE.solid ? RoadSurface.EDGE.broken : line ?? 0);
                const bare = side ? [row.mouthL, row.mouthR] : [row.pavedL, row.pavedR];
                edge.set([brokenAt(row.left, row.mouthL), brokenAt(row.right, row.mouthR), bare[0] ? 1 : 0, bare[1] ? 1 : 0], at * 4);
                if (row.cutL) cutL.set(row.cutL.map(m => m - base * period), at * 4);
                if (row.cutR) cutR.set(row.cutR.map(m => m - base * period), at * 4);
                const inM = row.tubeIn !== undefined ? row.tubeIn : depth ? depth[k] : -60;
                tubeAt.set([TubeLining.share(inM, row.tubeCap !== undefined ? row.tubeCap : (row.bits & 5) === 4), inM], at * 2);
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
        geometry.setAttribute('roadCutL', new THREE.BufferAttribute(cutL, 4));
        geometry.setAttribute('roadCutR', new THREE.BufferAttribute(cutR, 4));
        geometry.setAttribute('roadBase', new THREE.BufferAttribute(new Float32Array(n * W).fill(base), 1));
        geometry.setAttribute('roadTube', new THREE.BufferAttribute(tubeAt, 2));
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
        // front-side material (marker stones) lights the face the viewer sees
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
    // where the run goes on into the neighbouring section, which draws it). The land is cut to the tube's box
    // (TerrainMesh.tubeClip), so the tube closes everything the land no longer does (RoadMesh.tubeWorks):
    //   floor     a concrete strip from TUBE_FLOOR_M past the carriageway's edge out to each wall, over the ribbon's
    //             verge, which thins out there
    //   footing   each wall's face carried down to the land at its foot where the land lies under the floor (a gallery
    //             on a hillside stands on its wall, not over a gap)
    //   headwall  over a portal's beam, a face in the portal's plane up to the land behind it, at most TUBE_HEAD_M
    // `groundAt(x, z)` is the land (null where it is not known: no footing and no headwall there)
    // The walls, the roof and the walkways (the floor out to the walls) are the lining's (TubeLining.run, into
    // `lining`): concrete in pour bays, rock on the mountain side, a gallery's openings, and at LOD0 the fittings. Each
    // row may carry `tubeIn` (metres in from the nearest portal of the whole ride) and `tubeRun` (its run's kind and
    // sides, WorldEnvironment.tubeInfo); without them the rows' own flags give both
    static tunnel(rows, from, to, roof, ends = [true, true], groundAt = null, lining = null, lod = 0) {
        const out = { positions: [], shades: [] };
        const side = (row, sign, o = row.width / 2 + RoadMesh.TUBE_WALL_M) => [row.x + sign * o * Math.cos(row.heading), row.y, row.z - sign * o * Math.sin(row.heading)];
        for (let i = from; i < to; i++) {
            const a = rows[i], b = rows[i + 1];
            const la = side(a, -1), ra = side(a, 1), lb = side(b, -1), rb = side(b, 1);
            RoadMesh.tubeWorks(out, { la, ra, lb, rb, roof }, groundAt);
        }
        if (lining) {
            // (metres along: the ride's own, else measured from the first row)
            const along = [];
            rows.forEach((row, i) => along.push(Number.isFinite(row.s) ? row.s : i === 0 ? 0 : along[i - 1] + Math.hypot(row.x - rows[i - 1].x, row.z - rows[i - 1].z)));
            const depth = rows.slice(from, to + 1).some(row => row.tubeIn === undefined) ? TubeLining.depths(rows, along, ends) : null;
            const plain = row => ({ gallery: (row.bits & 5) === 4, rock: 0, open: 0, shotcrete: false, tube: [along[from], along[to]] });
            const floor = row => ({ l: side(row, -1, row.width / 2 + RoadMesh.TUBE_FLOOR_M), r: side(row, 1, row.width / 2 + RoadMesh.TUBE_FLOOR_M) });
            const tubeRows = [];
            for (let i = from; i <= to; i++) {
                const row = rows[i], run = row.tubeRun || plain(row);
                // (a row where the section's drawing starts or ends, or the tube's kind changes, keeps the rock's face
                // on the wall's line, so a neighbour at another level of detail or of another kind meets it)
                const turn = i > from && (rows[i - 1].tubeRun || plain(rows[i - 1])) !== run && !!(row.tubeRun && rows[i - 1].tubeRun);
                tubeRows.push({ l: side(row, -1), r: side(row, 1), s: along[i], inM: depth ? depth[i] : row.tubeIn, cap: row.tubeCap, roof, floor: floor(row), pin: i === from || i === to || turn || (i < to && rows[i + 1].tubeRun !== row.tubeRun), gallery: run.gallery, rock: run.rock, open: run.open, shotcrete: run.shotcrete });
            }
            const whole = (rows[from].tubeRun || plain(rows[from])).tube;
            TubeLining.run(lining, tubeRows, { lod, groundAt, run: whole });
        }
        for (const [row, inward] of [[ends[0] ? rows[from] : null, 1], [ends[1] ? rows[to] : null, -1]]) {
            if (!row) continue;
            RoadMesh.wings(out, RoadMesh.mouthLines(rows, inward > 0 ? from : to, -inward, (r, sign) => side(r, sign)), groundAt, null, [Math.sin(row.heading) * inward, Math.cos(row.heading) * inward]);
            RoadMesh.mouthFloor(out, rows, inward > 0 ? from : to, -inward, groundAt);
            // (the frame square to the row, its forward into the tube)
            RoadMesh.portalFrame(out, side(row, -1), side(row, 1), inward > 0 ? row.heading : row.heading + Math.PI, roof, groundAt);
        }
        return out;
    }

    // How far past half the road's width a ride tube's walls stand
    static get TUBE_WALL_M() { return 1.6; }
    // How far out in front of a portal the land is cut to the tube's walls and roof, and a wing wall stands on each
    // wall's line (RoadMesh.wings): the land over the approach, laid from the carved road to the land over the tube,
    // stood up to 0.9 m over the road there
    static get TUBE_MOUTH_M() { return 12; }
    // How deep a portal's frame is, out from the portal
    static get TUBE_FRAME_M() { return 1.4; }
    // Past the carriageway's edge, where a tube's concrete floor begins
    static get TUBE_FLOOR_M() { return 0.3; }
    // The most a portal's headwall stands over its road
    static get TUBE_HEAD_M() { return 14; }
    // How far under the land a tube's footing reaches
    static get TUBE_FOOT_M() { return 0.3; }

    // A tube segment's floor strips and footings (RoadMesh.tunnel): `seg` {la, ra, lb, rb, roof} its walls' feet at its
    // two rows; `floor` {l: [a, b], r: [a, b]} where each floor strip starts (none for a road whose verge reaches its
    // walls)
    static tubeWorks(out, seg, groundAt, floor = null) {
        const colors = RoadMesh.COLORS;
        const lift = p => [p[0], p[1] + RoadMesh.LIFT_M + 0.01, p[2]];
        if (floor) {
            RoadMesh.quad(out, lift(floor.l[0]), lift(floor.l[1]), lift(seg.lb), lift(seg.la), colors.concrete);
            RoadMesh.quad(out, lift(seg.ra), lift(seg.rb), lift(floor.r[1]), lift(floor.r[0]), colors.concrete);
        }
        if (!groundAt) return;
        for (const [a, b] of [[seg.la, seg.lb], [seg.ra, seg.rb]]) {
            const ga = groundAt(a[0], a[2]), gb = groundAt(b[0], b[2]);
            if (!Number.isFinite(ga) || !Number.isFinite(gb)) continue;
            // (only where the land lies under the floor; at least TUBE_FOOT_M deep at both ends, no sliver)
            if (!(ga < a[1] - 0.05 || gb < b[1] - 0.05)) continue;
            const da = a[1] - Math.max(RoadMesh.TUBE_FOOT_M, a[1] - ga + RoadMesh.TUBE_FOOT_M), db = b[1] - Math.max(RoadMesh.TUBE_FOOT_M, b[1] - gb + RoadMesh.TUBE_FOOT_M);
            RoadMesh.quad(out, [a[0], da, a[2]], [b[0], db, b[2]], b, a, colors.tunnel);
        }
    }

    // The wing walls in front of a portal: along each wall's line from the portal out TUBE_MOUTH_M (`lines`: the wall
    // feet [l, r] of each row outward, the portal's first), from the road up to the land outside the line where it
    // stands over the road. The land between the lines is cut there as in the tube (TerrainMesh.tubeClip): the faces
    // close its sides
    static wings(out, lines, groundAt, guard = null, forward = null) {
        if (!groundAt || lines.length < 2) return;
        // (from the portal frame's outer face on: the frame's posts close the first TUBE_FRAME_M, and each wing starts at
        // its post's outer corner, `forward` the frame's way into the tube)
        const [fx, fz] = forward || [0, 0];
        const out0 = p => [p[0] - fx * RoadMesh.TUBE_FRAME_M, p[1], p[2] - fz * RoadMesh.TUBE_FRAME_M];
        const past = p => -((p[0] - lines[0][0][0]) * fx + (p[2] - lines[0][0][2]) * fz) > RoadMesh.TUBE_FRAME_M + 0.05;
        lines = [[out0(lines[0][0]), out0(lines[0][1])], ...lines.slice(1).filter(line => past(line[0]) && past(line[1]))];
        for (let k = 0; k + 1 < lines.length; k++) {
            for (const side of [0, 1]) {
                const a = lines[k][side], b = lines[k + 1][side];
                const ga = groundAt(a[0], a[2]), gb = groundAt(b[0], b[2]);
                if (!Number.isFinite(ga) || !Number.isFinite(gb)) continue;
                if (!(ga > a[1] + 0.05 || gb > b[1] + 0.05)) continue;
                const top = Math.max(ga, gb) + 0.1;
                if (guard && [a, b].some(p => { const over = guard.ceiling(p[0], p[2], p[1]); return over !== null && over - RoadMesh.DECK_M < top; })) continue;
                if (guard && ![0, 0.5, 1].every(f => guard.clear(a[0] + (b[0] - a[0]) * f, a[2] + (b[2] - a[2]) * f, Math.min(a[1], b[1]), top, 0.3))) continue;
                RoadMesh.quad(out, a, b, [b[0], Math.max(b[1], gb) + 0.1, b[2]], [a[0], Math.max(a[1], ga) + 0.1, a[2]], RoadMesh.COLORS.concrete);
            }
        }
    }

    // The floor in front of a ride portal, out along `step` from row `at` for TUBE_MOUTH_M: from under the verge's
    // outer edge out to the wall's line, each side, a hand under the road. The land is cut in front of a portal to the
    // walls' lines (TerrainMesh.tubeClip, a box marked `mouth`) and the wing walls close its sides, but nothing lay
    // between the verge and the wing: where the land stood over the road there, the cut left a slot down to nothing
    // beside the road (leg 4 s 22 522 and leg 3 s 3 200, at a gallery's portal: 571 and 162 pixels seen through).
    // Only where the land stood at or over the floor there (`groundAt`): where it falls away it was not cut
    static mouthFloor(out, rows, at, step, groundAt = null) {
        if (!groundAt) return;
        const W = RoadMesh.TUBE_WALL_M, drop = 0.03;
        const up = (a, b, c, d) => {
            const n = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
            if (n >= 0) RoadMesh.quad(out, a, b, c, d, RoadMesh.COLORS.concrete);
            else RoadMesh.quad(out, d, c, b, a, RoadMesh.COLORS.concrete);
        };
        const at3 = (row, o) => [row.x + o * Math.cos(row.heading), row.y - drop, row.z - o * Math.sin(row.heading)];
        let walked = 0;
        for (let j = at; rows[j + step] && walked < RoadMesh.TUBE_MOUTH_M; j += step) {
            const a = rows[j], b = rows[j + step];
            walked += Math.hypot(b.x - a.x, b.z - a.z);
            if ((a.bits & 5) && (b.bits & 5)) continue;
            const [va, pa] = RoadMesh.verges(a), [vb, pb] = RoadMesh.verges(b);
            for (const [sign, ea, eb] of [[-1, va, vb], [1, pa, pb]]) {
                const ia = a.width / 2 + Math.max(0, ea - 0.1), ib = b.width / 2 + Math.max(0, eb - 0.1);
                const oa = a.width / 2 + W, ob = b.width / 2 + W;
                if (oa <= ia && ob <= ib) continue;
                const pa2 = at3(a, sign * oa), pb2 = at3(b, sign * ob);
                const ga = groundAt(pa2[0], pa2[2]), gb = groundAt(pb2[0], pb2[2]);
                if (!(Number.isFinite(ga) && ga > pa2[1] - 0.05) && !(Number.isFinite(gb) && gb > pb2[1] - 0.05)) continue;
                up(at3(a, sign * ia), at3(a, sign * oa), at3(b, sign * ob), at3(b, sign * ib));
            }
        }
    }

    // The wall feet [l, r] of `rows` from row `at` out along `step` (+1 on, -1 back) for TUBE_MOUTH_M, as `foot(row,
    // sign)` gives them: the portal's row first
    static mouthLines(rows, at, step, foot) {
        const lines = [[foot(rows[at], -1), foot(rows[at], 1)]];
        let walked = 0;
        for (let j = at; rows[j + step] && walked < RoadMesh.TUBE_MOUTH_M; j += step) {
            walked += Math.hypot(rows[j + step].x - rows[j].x, rows[j + step].z - rows[j].z);
            lines.push([foot(rows[j + step], -1), foot(rows[j + step], 1)]);
        }
        return lines;
    }

    // A side road's portal at the tube's row `at` (its wall feet {l, r}), the tube running on to `next`: a beam over the
    // opening, a post at each wall and the headwall over the beam to the land behind (RoadMesh.headwall), all square to
    // the line from l to r, so each post's inner face runs through its wall's foot and no corner of the frame stands a
    // hand from the tube's. Each piece keeps out of another road's carriageway (`guard`)
    static sidePortal(out, at, next, roof, groundAt, guard = null) {
        const [lx, , lz] = at.l, [rx, , rz] = at.r;
        // (square to the line from l to r: a heading h has its right at (cos h, -sin h); forward into the tube)
        let heading = Math.atan2(-(rz - lz), rx - lx);
        const nx = (next.l[0] + next.r[0]) / 2 - (lx + rx) / 2, nz = (next.l[2] + next.r[2]) / 2 - (lz + rz) / 2;
        if (Math.sin(heading) * nx + Math.cos(heading) * nz < 0) heading += Math.PI;
        return RoadMesh.portalFrame(out, at.l, at.r, heading, roof, groundAt, guard);
    }

    // A portal's frame at the walls' feet l and r, `heading` its forward into the tube, square to the line from l to r:
    // a post at each wall (its inner face through the wall's foot, from the portal's plane out TUBE_FRAME_M, up into the
    // beam), the beam over the opening (from FRAME_IN_M inside the plane out past the posts, its foot FRAME_IN_M over the
    // roof) and the headwall over the beam in the beam's inner face (RoadMesh.headwall). No two of its faces, nor one
    // of them and the tube's, share a plane where they overlap, and no corner of it stands a hand from another's.
    // Each piece keeps out of another road's carriageway (`guard`). Returns its forward [x, z]
    static portalFrame(out, l, r, heading, roof, groundAt, guard = null) {
        const span = Math.hypot(r[0] - l[0], r[2] - l[2]) || 1, ux = (r[0] - l[0]) / span, uz = (r[2] - l[2]) / span;
        const fx = Math.sin(heading), fz = Math.cos(heading), deep = RoadMesh.TUBE_FRAME_M, inM = RoadMesh.FRAME_IN_M;
        const c = RoadMesh.COLORS.concrete, cy = (l[1] + r[1]) / 2;
        const clear = (x, z, y0, y1, w, d0, d1) => !guard || [-w, 0, w].every(a => [d0, d1].every(d => guard.clear(x + ux * a + fx * d, z + uz * a + fz * d, y0, y1, 0.1)));
        const mx = (l[0] + r[0]) / 2, mz = (l[2] + r[2]) / 2;
        // The beam: along from -deep - inM to +inM
        const bAlong = -deep / 2, bDeep = deep + 2 * inM;
        // (a hand wider than the posts' outer faces, so its ends stand in no plane of theirs)
        if (clear(mx, mz, cy + roof, cy + roof + 1.2, span / 2 + 0.7, -deep - inM, inM)) RoadMesh.box(out, mx + fx * bAlong, cy + roof + inM + (1.2 - inM) / 2, mz + fz * bAlong, span + 1.4, 1.2 - inM, bDeep, heading, c);
        for (const [p, sign] of [[l, -1], [r, 1]]) {
            const x = p[0] + sign * ux * 0.3 - fx * deep / 2, z = p[2] + sign * uz * 0.3 - fz * deep / 2;
            // (up to the beam's middle from its own foot)
            const top = cy + roof + 0.6;
            if (clear(x, z, p[1], top, 0.3, -deep / 2, deep / 2)) RoadMesh.box(out, x, (p[1] + top) / 2, z, 0.6, top - p[1], deep, heading, c);
        }
        if (clear(mx, mz, cy + roof + 1.2, cy + RoadMesh.TUBE_HEAD_M, span / 2, 0, inM)) RoadMesh.headwall(out, { x: mx + fx * inM, y: cy, z: mz + fz * inM, heading }, span / 2 + 0.7, cy + roof + 1.2, cy + RoadMesh.TUBE_HEAD_M, 1, groundAt, guard);
        return [fx, fz];
    }

    // How far into the tube a portal's beam reaches, and how far over the roof its foot stands
    static get FRAME_IN_M() { return 0.1; }

    // A portal's headwall: in the plane of `row`, from `bottom` up to the land just inside the tube (`inward` +1 along
    // the row's heading, -1 against it), at most `most`, across `half` either side of the centre line. The land over
    // the tube is cut at its roof (TerrainMesh.tubeClip): the face closes the step from the beam to the land behind
    static headwall(out, row, half, bottom, most, inward, groundAt, guard = null) {
        if (!groundAt) return;
        const fx = Math.sin(row.heading) * inward, fz = Math.cos(row.heading) * inward;
        const rx = Math.cos(row.heading), rz = -Math.sin(row.heading);
        const steps = Math.max(2, Math.ceil((2 * half) / 0.5));
        const tops = [];
        for (let k = 0; k <= steps; k++) {
            const lat = -half + (2 * half * k) / steps;
            const x = row.x + rx * lat, z = row.z + rz * lat;
            // (the highest land within the first metre and a half behind the plane: what the face must reach)
            let top = -Infinity;
            for (const d of [0.3, 0.8, 1.5]) { const g = groundAt(x + fx * d, z + fz * d); if (Number.isFinite(g)) top = Math.max(top, g); }
            // (and a deck's depth under any other road over it: a tube under a road meets that road's own works)
            const over = guard ? guard.ceiling(x, z, row.y) : null;
            tops.push({ x, z, top: Math.min(most, top, over === null ? Infinity : over - RoadMesh.DECK_M) });
        }
        for (let k = 0; k < steps; k++) {
            const a = tops[k], b = tops[k + 1];
            if (!(a.top > bottom + 0.05 || b.top > bottom + 0.05)) continue;
            const ta = Math.max(bottom, a.top) + 0.1, tb = Math.max(bottom, b.top) + 0.1;
            RoadMesh.quad(out, [a.x, bottom, a.z], [b.x, bottom, b.z], [b.x, tb, b.z], [a.x, ta, a.z], RoadMesh.COLORS.concrete);
        }
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

    // The metres round an arch's curve from its crown to ride metres `s` (negative before it), on the circle archY draws
    static archArc(bay, s) {
        const half = (bay.a1 - bay.a0) / 2, r = Math.min(bay.rise, half), d = s - (bay.a0 + bay.a1) / 2;
        const radius = (half * half + r * r) / (2 * r);
        return radius * Math.asin(Math.max(-1, Math.min(1, d / radius)));
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
    // viaduct ends at `from` and at `to` (its parapet takes a cap). Returns {positions, shades, face, vault, viaduct: true,
    // soffit, feet}: `vault` the arches' undersides, `soffit` their vertex ranges in it, `feet` those of the stone that
    // stands on the land (the piers' faces and sides, a face down to the ground)
    static viaduct(rows, from, to, via, { lod = 0, land = null, ends = [true, true] } = {}) {
        const out = { positions: [], shades: [], face: [], vault: { positions: [], shades: [], feet: [], out: [], along: [], kind: [] }, viaduct: true, soffit: [], feet: [] };
        const V = RoadMesh.VIADUCT, color = RoadMesh.COLORS.stone;
        const span = rows.slice(from, to + 1);
        if (span.length < 2) return out;
        // Its stone is a retaining wall's (RoadMesh.edgeWorks `face`): each face lit as one face along its run (each
        // column's outward), its courses laid along the ride's metres, so it reads as the walls that run into it; every
        // other piece of it is lit by its own slope, as a wall's coping is. `faces` gives each of a quad's corners
        // [metres along, outward] in RoadMesh.quad's order, or none
        const put = (a, b, c, d, faces = null) => {
            RoadMesh.quad(out, a, b, c, d, color);
            for (const corner of [0, 1, 2, 0, 2, 3]) out.face.push(...(faces ? [faces[corner][0], 1, faces[corner][1][0], faces[corner][1][1]] : [0, 0, 0, 0]));
        };
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
                col[sign > 0 ? 'r' : 'l'] = { x: f.x, y: f.y, z: f.z, low, o: [f.ox, f.oz] };
            }
            return col;
        });
        const mark = list => { const start = out.positions.length / 3; return () => list.push([start, out.positions.length / 3 - start]); };
        // The stone under the deck (an arch's underside, its sides, the back of a blind face): the same stone, lit as
        // the face its arch opens in, turned down (`vault`, RoadMesh.addEdgeWorks): `way` that face's outward. Lit by its
        // own way, an arch's side or back that faced the sun drew white under the deck, which casts no shadow (km 7.9)
        // `along` the metres each corner's courses are laid along (its own horizontal: as a wall's face is laid, so an
        // arch's side across the road reads as blocks, not as one course drawn out into stripes)
        // An arch's underside passes `across`, each corner's metres across the road from its middle: its `kind` is then
        // RoadMesh.BARREL plus that (always over 2.5), and its `along` the arch's own metres round its curve
        // (RoadMesh.archArc). Every other piece is kind 1
        const under = (a, b, c, d, way, along, feet = false, across = null) => {
            const start = out.vault.positions.length / 3;
            RoadMesh.quad(out.vault, a, b, c, d, color);
            out.vault.out.push(way, way, way, way, way, way);
            for (const corner of [0, 1, 2, 0, 2, 3]) { out.vault.along.push(along[corner]); out.vault.kind.push(across ? RoadMesh.BARREL + across[corner] : 1); }
            if (feet) out.vault.feet.push([start, 6]);
            return [start, 6];
        };
        // (the outward of the face an arch opens in, at ride metres s)
        const opening = (bay, s) => { const f = RoadMesh.viaductFace(span, s, bay.open.r ? 1 : -1); return [f.ox, f.oz]; };
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
                const A = [a.s, p.o], B = [b.s, q.o];
                if (sign > 0) put([p.x, p.y, p.z], [q.x, q.y, q.z], [q.x, lb, q.z], [p.x, la, p.z], [A, B, B, A]);
                else put([q.x, q.y, q.z], [p.x, p.y, p.z], [p.x, la, p.z], [q.x, lb, q.z], [B, A, A, B]);
                if (done) done();
            }
            // The arch's underside, from face to face: the same stone in a deck's shade (`vault`, RoadMesh.addEdgeWorks)
            if (arched && (bay.open.l || bay.open.r)) {
                const way = opening(bay, mid);
                const ra = RoadMesh.archArc(bay, a.s), rb = RoadMesh.archArc(bay, b.s);
                const wa = Math.hypot(a.r.x - a.l.x, a.r.z - a.l.z) / 2, wb = Math.hypot(b.r.x - b.l.x, b.r.z - b.l.z) / 2;
                out.soffit.push(under([a.r.x, ya, a.r.z], [b.r.x, yb, b.r.z], [b.l.x, yb, b.l.z], [a.l.x, ya, a.l.z], way, [ra, rb, rb, ra], false, [wa, wb, -wb, -wa]));
                // and the back of a blind face, its stone 2 cutBackM in from it, from the arch down into the land: the
                // vault's back is stone, and the land's step behind it (WorldEnvironment.viaductOf) is hidden
                for (const [key, sign] of [['l', -1], ['r', 1]]) {
                    if (bay.open[key]) continue;
                    const fa = RoadMesh.viaductFace(span, a.s, sign, {}, -2 * V.cutBackM), fb = RoadMesh.viaductFace(span, b.s, sign, {}, -2 * V.cutBackM);
                    if (sign < 0) under([fa.x, ya, fa.z], [fb.x, yb, fb.z], [fb.x, b[key].low, fb.z], [fa.x, a[key].low, fa.z], way, [a.s, b.s, b.s, a.s], true);
                    else under([fb.x, yb, fb.z], [fa.x, ya, fa.z], [fa.x, a[key].low, fa.z], [fb.x, b[key].low, fb.z], way, [b.s, a.s, a.s, b.s], true);
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
                const p = col[key], q = { x: p.x + fx, y: p.y, z: p.z + fz, low: p.low, o: p.o };
                const [a, b] = way > 0 ? [p, q] : [q, p];
                const A = [way > 0 ? col.s : col.s - V.overlapM, a.o], B = [way > 0 ? col.s + V.overlapM : col.s, b.o];
                const done = mark(out.feet);
                if (sign > 0) put([a.x, a.y, a.z], [b.x, b.y, b.z], [b.x, b.low, b.z], [a.x, a.low, a.z], [A, B, B, A]);
                else put([b.x, b.y, b.z], [a.x, a.y, a.z], [a.x, a.low, a.z], [b.x, b.low, b.z], [B, A, A, B]);
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
                const w = s + Math.hypot(l.x - r.x, l.z - r.z);
                if (toward > 0) under([r.x, top, r.z], [l.x, top, l.z], [l.x, low, l.z], [r.x, low, r.z], opening(bay, s), [s, w, w, s], true);
                else under([l.x, top, l.z], [r.x, top, r.z], [r.x, low, r.z], [l.x, low, l.z], opening(bay, s), [w, s, s, w], true);
            }
        }
        // Its top under the road: the stone over the arches' crowns from face to face, crownM under the road (closed
        // from above where the ribbon and the parapets leave a gap, and what the checks read as the structure's top)
        for (let k = 0; k + 1 < span.length; k++) {
            const a = span[k], b = span[k + 1];
            const at = (row, sign) => { const p = RoadMesh.place(row, sign * (row.width / 2 + RoadMesh.VIADUCT_FACE_M)); return [p.x, row.y - V.crownM, p.z]; };
            put(at(a, 1), at(a, -1), at(b, -1), at(b, 1));
        }
        // Behind the joint of each face and its parapet, a band of stone a few centimetres in: the face's top has a
        // point at every piece of an arch and the parapet one at every row, and the road's underside showed through
        // that joint a pixel at a time from below (world-floating at s 7900)
        for (let k = 0; k + 1 < span.length; k++) {
            const a = span[k], b = span[k + 1];
            for (const sign of [-1, 1]) {
                const at = (row, up) => { const p = RoadMesh.place(row, sign * (row.width / 2 + RoadMesh.VIADUCT_FACE_M - 0.02)); return [p.x, row.y + up, p.z]; };
                if (sign > 0) put(at(a, 0.05), at(b, 0.05), at(b, -0.1), at(a, -0.1));
                else put(at(b, 0.05), at(a, 0.05), at(a, -0.1), at(b, -0.1));
            }
        }
        // The parapets: a bridge's, on the faces' tops, its outer face laid as the face under it (`along`)
        for (const sign of [-1, 1]) {
            const points = span.map(row => { const p = RoadMesh.place(row, sign * (row.width / 2 + RoadMesh.VIADUCT_FACE_M)); return [p.x, row.y, p.z]; });
            const outward = span.map(row => [sign * Math.cos(row.heading), -sign * Math.sin(row.heading)]);
            RoadMesh.rail(out, points, outward, V.parapetW, V.parapetH, color, ends, span.map(row => row.s));
        }
        while (out.face.length < (out.positions.length / 3) * 4) out.face.push(0, 0, 0, 0);
        return out;
    }

    // A parapet swept along a run of edge points: `points` are the tops of the road's edge ([x, y, z]), `outward` the unit
    // plan direction out of the road at each (shared by the segments either side, so the run has no step or gap at a
    // row), and the parapet stands on the last `w` metres inside each point, `h` high. Inner face, coping and outer face,
    // a cap at each end (`caps`: [start, end], false where the rail goes on in a neighbouring mesh, whose cap would lie
    // in the same plane), no underside: it sits on the road, and a face there would lie in the ribbon's plane
    // `along` (the metres along the edge at each point) makes its outer face one face with the wall under it: the same
    // courses, the same light (edgeWorks `face`)
    static rail(out, points, outward, w, h, color, caps = [true, true], along = null, proud = 0) {
        if (points.length < 2) return;
        const at = (k, inset, up) => [points[k][0] - outward[k][0] * inset, points[k][1] + up, points[k][2] - outward[k][1] * inset];
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

    // Runs of consecutive parapet segments ({k, pa, pb, o, drawn}) joined at shared rows into rails (RoadMesh.rail):
    // segment k + 1 goes on from k, and several pieces of one segment k (a wall's face past its end, edgeWorks) go on
    // from each other, where they share their point. Only the `drawn` segments are laid (a neighbouring section lays
    // the rest); a run's end takes a cap only where the run really ends, not where it goes on into a segment another
    // section lays
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
            if (first >= 0) RoadMesh.rail(out, run.points.slice(first, last + 2), outward.slice(first, last + 2), w, h, color, [first === 0, last === run.drawn.length - 1], run.along.every(Number.isFinite) ? run.along.slice(first, last + 2) : null, proud);
            run = null;
        };
        for (const seg of segments) {
            // (within a millimetre: a wall's face past its end is laid from the row's own edge point, the wall's own end
            // from its plan, and the two meet to rounding)
            const joined = run && (run.k === seg.k - 1 || run.k === seg.k) && Math.hypot(run.points[run.points.length - 1][0] - seg.pa[0], run.points[run.points.length - 1][2] - seg.pa[2]) < 1e-3;
            if (!joined) {
                flush();
                run = { k: seg.k, points: [seg.pa], o: [], drawn: [], along: [seg.ua], outs: [seg.oa] };
            }
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
    // A build in steps (a generator) run to its end: its result (WorldStreamer.drain)
    static drain(steps) {
        let step = steps.next();
        while (!step.done) step = steps.next();
        return step.value;
    }

    static wallPlan(sides, foot, guard = null) {
        return RoadMesh.drain(RoadMesh.wallPlanSteps(sides, foot, guard));
    }

    // The same in steps, a row at a time (WorldStreamer: a build no frame waits on whole)
    static *wallPlanSteps(sides, foot, guard = null) {
        if (!foot || !foot.wall) return null;
        const n = sides.length;
        const plan = { row: { l: [], r: [] }, seg: { l: [], r: [] }, end: { l: [], r: [] }, past: { l: [], r: [] } };
        const g = guard ? guard.walls || guard : null;
        for (const key of ['l', 'r']) {
            const end = [];
            for (const side of sides) {
                end.push(RoadMesh.wallEnd(side, key, foot, guard));
                yield;
            }
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
            const mouth = [];
            for (const side of sides) {
                mouth.push(RoadMesh.atMouth(sides, side, key, foot));
                yield;
            }
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
            const segs = function* () { const seg = []; for (let k = 0; k + 1 < n; k++) { seg.push((row[k] || row[k + 1]) && clear(k) && !(wingEnd[k] === 1 && !row[k + 1]) && !(wingEnd[k + 1] === -1 && !row[k])); yield; } return seg; };
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
            let seg = yield* segs();
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
            if (filled) seg = yield* segs();
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
            // A side road's wall is left out where its edge faces the ride's wall across a cleft (`foot.facesRide`,
            // WorldEnvironment.cleftAt): the ride's wall is the one face between the two roads, and the side road's
            // surface runs on to its foot over the ground that closes the cleft. (Two walls there, the side road's with
            // its parapet, read as a trench.) After the runs are judged, so what is left of a run stands as it did
            if (foot.facesRide) {
                const faces = sides.map(side => { const o = RoadMesh.outward(side)[key], p = side[key]; return !(side.bits & 7) && !!foot.facesRide(p[0], p[1], p[2], o[0], o[1]); });
                const cut = [];
                // (and every 2 m between them: a side road's rows lie up to 16 m apart, and the cleft can end between two)
                const facesAll = k => {
                    const a = sides[k][key], b = sides[k + 1][key], oa = RoadMesh.outward(sides[k])[key], ob = RoadMesh.outward(sides[k + 1])[key];
                    const parts = Math.ceil(Math.hypot(b[0] - a[0], b[2] - a[2]) / 2);
                    for (let j = 1; j < parts; j++) {
                        const t = j / parts, ox = oa[0] + (ob[0] - oa[0]) * t, oz = oa[1] + (ob[1] - oa[1]) * t, len = Math.hypot(ox, oz) || 1;
                        if (!foot.facesRide(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, ox / len, oz / len)) return false;
                    }
                    return true;
                };
                for (let k = 0; k + 1 < n; k++) {
                    if (seg[k] && faces[k] && faces[k + 1] && facesAll(k)) { seg[k] = false; cut[k] = true; }
                    yield;
                }
                // (and a piece of such a run left shorter than WALL_RUN_M is none, as any run that short: two stubs of
                // wall either side of the ride's, where the roads meet and part)
                for (const [from, to] of runsOf(seg)) {
                    if (!(cut[from - 1] || cut[to + 1])) continue;
                    let length = 0;
                    for (let k = from; k <= to; k++) length += step(k);
                    if (length < RoadMesh.WALL_RUN_M) for (let k = from; k <= to; k++) seg[k] = false;
                }
                for (let k = 0; k < n; k++) if (row[k] && !seg[k - 1] && !seg[k]) row[k] = false;
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
        return RoadMesh.drain(RoadMesh.edgeWorksSteps(sides, foot, guard));
    }

    // The same in steps, a row at a time
    static *edgeWorksSteps(sides, foot = null, guard = null) {
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
        const plan = sides.plan ? (sides.plan.base !== undefined ? RoadMesh.planFor(sides, sides.plan, foot, guard) : sides.plan) : yield* RoadMesh.wallPlanSteps(sides, foot, guard);
        // The share of the slope's fall the stone past a wall's end holds, as drawn, recorded in the ride's plan for each
        // of its segments these rows lay at full detail (`drawn`: TAPER_SAMPLES of it along the segment, null where
        // none is laid), so the physics stands on the taper that is drawn (WorldEnvironment.taperAt). A far ribbon's
        // rows skip rows of the plan and record nothing
        const fine = sides.plan && sides.plan.base !== undefined && sides.every((side, k) => k === 0 || side.i === sides[k - 1].i + 1) ? sides.plan : null;
        if (fine) {
            fine.drawn = fine.drawn || { l: [], r: [] };
            fine.band = fine.band || { l: [], r: [] };
            fine.kind = fine.kind || { l: [], r: [] };
            for (let k = 0; k + 1 < sides.length; k++) for (const key of ['l', 'r']) { fine.drawn[key][sides[k].i - fine.base] = null; fine.band[key][sides[k].i - fine.base] = null; }
        }
        // and the coping it lays on each such segment, as reaches from the ride's centre line (`band`: the face's and the
        // inner edge's at each row, null where none), so the physics stands on the coping where it is drawn
        // (WorldGround.wallBand). Read from the verge and COPING_W_M, its band stood on the verge where the drawn coping
        // is narrowed or its wall point moved in, 0.48 m over what is drawn
        const reachOf = (p, j) => { const a = sides[j].lc, b = sides[j].rc; return Math.hypot(p[0] - (a[0] + b[0]) / 2, p[2] - (a[2] + b[2]) / 2); };
        const banded = (k, key, fa, ia, fb, ib) => { if (fine) fine.band[key][sides[k].i - fine.base] = [reachOf(fa, k), reachOf(ia, k), reachOf(fb, k + 1), reachOf(ib, k + 1)]; };
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
        // A far section's slope (WorldEnvironment.edgeFoot `far`, `deep`) is laid as at full detail, and from its foot a
        // face hangs down to the lowest the land is drawn there (`foot.landLow`): at full detail it lies under the land,
        // over a coarser tile it closes the gap. (Taken down to that land itself, the slope stood steeper than the bank
        // it met at full detail, a ledge of ground over the land 1 to 2 m down: 85 more `overhangs` of world-spikes on
        // the Gotthard leg)
        const landLow = foot && foot.landLow ? foot.landLow : null;
        // The ground under the verge lies APRON_UNDER_M under the road, SIDE_GROUND_UNDER_M under any side road's
        // carriageway that lies there and APRON_UNDER_M under its verge (as drawn: `foot.sideUnder`, the lowest within
        // `r`). A side road in a mouth is held a few centimetres under the ride, and ground at the ride's own depth stood
        // over it as a strip of grass across the mouth (held as deep under the side road's verge, it lay a groove between
        // the two roads where that verge is left out). Near one the ground is laid in pieces of SIDE_UNDER_PIECE_M along the edge, shorter
        // than a side road's verge is wide, so a piece that runs from the ride's depth down to the side road's does so
        // over the side road's verge, never over its carriageway (each corner read within SIDE_UNDER_REACH_M: read over a
        // whole piece, the ground beside a side road lay 0.3 m under the ride's edge where the verge is left out)
        const sideUnder = foot && foot.sideUnder ? foot.sideUnder : null;
        const underAt = (p, r = RoadMesh.SIDE_UNDER_REACH_M) => {
            const road = sideUnder ? sideUnder(p[0], p[1], p[2], r) : null, verge = sideUnder ? sideUnder(p[0], p[1], p[2], r, RoadSurface.VERGE_M) : null;
            return [p[0], Math.min(p[1] - RoadMesh.APRON_UNDER_M, road === null ? Infinity : road - RoadMesh.SIDE_GROUND_UNDER_M, verge === null ? Infinity : verge - RoadMesh.APRON_UNDER_M), p[2]];
        };
        const groundUnder = (out, ca, cb, pb, pa, ta, tb) => {
            const near = !!sideUnder && [ca, cb, pa, pb].some(p => sideUnder(p[0], p[1], p[2], 2 * RoadMesh.SIDE_UNDER_PIECE_M, RoadSurface.VERGE_M) !== null);
            // (it gives its corners as laid from row a to row b, each [inner, outer]: the outer edge from pa to pb)
            if (!near) { const down = p => [p[0], p[1] - RoadMesh.APRON_UNDER_M, p[2]]; RoadMesh.quad(out, down(ca), down(cb), down(pb), down(pa), [ta, tb, tb, ta]); return [[down(ca), down(pa)], [down(cb), down(pb)]]; }
            const mix = (u, v, t) => u.map((c, i) => c + (v[i] - c) * t);
            const n = Math.max(1, Math.ceil(Math.max(Math.hypot(cb[0] - ca[0], cb[2] - ca[2]), Math.hypot(pb[0] - pa[0], pb[2] - pa[2])) / RoadMesh.SIDE_UNDER_PIECE_M));
            for (let i = 0; i < n; i++) {
                const c0 = mix(ca, cb, i / n), c1 = mix(ca, cb, (i + 1) / n), p0 = mix(pa, pb, i / n), p1 = mix(pa, pb, (i + 1) / n);
                const t0 = mix(ta, tb, i / n), t1 = mix(ta, tb, (i + 1) / n);
                RoadMesh.quad(out, underAt(c0), underAt(c1), underAt(p1), underAt(p0), [t0, t1, t1, t0]);
            }
            return Array.from({ length: n + 1 }, (_, i) => [underAt(mix(ca, cb, i / n)), underAt(mix(pa, pb, i / n))]);
        };
        const W = RoadMesh.PARAPET_W_M, H = RoadMesh.PARAPET_H_M;
        // How deep the works of kind f standing at p (out along o) reach into another carriageway, or null where they
        // keep out of every one: the edge, the parapet's inner face and, for an apron, its slope out to its foot
        const depthAt = (p, f, o) => {
            if (!guard) return null;
            const g = f.kind === 'wall' && guard.walls ? guard.walls : guard;
            // (a slope's top where it is drawn: under the verge, and under a side road's surface in a mouth, underAt. Read
            // at the edge's own height, a side road held a few centimetres under the ride in its mouth stood in every
            // slope there, and a far section left the mouth open down to the coarse land, a notch metres deep where the
            // side road is not drawn)
            // (a far section's only, `deep`: at full detail the slope's tests stay as they were)
            const top = f.kind === 'apron' ? (f.deep ? underAt(p)[1] : p[1]) : p[1] + H;
            const worst = (a, b) => (a === null ? b : b === null ? a : Math.max(a, b));
            let d = worst(g.depth(p[0], p[2], f.y, top), g.depth(p[0] - o[0] * W, p[2] - o[1] * W, f.y, top));
            if (f.kind !== 'apron') return d;
            const run = RoadMesh.apronRun(f, p);
            for (let t = 1; t < run; t += 1) d = worst(d, guard.depth(p[0] + o[0] * t, p[2] + o[1] * t, f.y, p[1] - t * RoadMesh.BATTER));
            return worst(d, guard.depth(p[0] + o[0] * run, p[2] + o[1] * run, f.y, f.y + 0.1));
        };
        const endOfRow = (side, k) => {
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
                const end = { kind: f.kind, y, out: out[key], color: f.color || null, top: f.top || null, at: p, run: Number.isFinite(f.run) ? f.run : null, meets: !!f.meets, deep: !!f.deep };
                // A far section's deep slope (WorldEnvironment.edgeFoot `far`) keeps its foot at full detail too: where
                // the deep one stands in a road below, the segment is laid with the full-detail one instead of none
                if (f.deep && Number.isFinite(f.shallow)) end.y = Math.max(p[1] - RoadMesh.DROP_MAX_M, Math.min(p[1] - 0.05, f.shallow));
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
        };
        const ends = [];
        for (let k = 0; k < sides.length; k++) {
            ends.push(endOfRow(sides[k], k));
            yield;
        }
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
            // (no slope on a side road's segment with an end by the ride's wall across a cleft: the ground that closes
            // the cleft lies there, and a slope from the next row stood down from that end as a face)
            if (kind === 'apron' && foot && foot.byRideWall && [k, k + 1].some(j => { const p = sides[j][key], o = RoadMesh.outward(sides[j])[key]; return !(sides[j].bits & 7) && foot.byRideWall(p[0], p[1], p[2], o[0], o[1]); })) kind = null;
            kinds[key][k] = kind;
            // (the kind laid on each full-detail segment of the ride, for the physics: WorldEnvironment.slopeAt)
            if (fine) fine.kind[key][sides[k].i - fine.base] = kind;
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
        // Which walls carry a parapet: a whole wall does, to its ends and on over its face past them, or none of it does.
        // On the ride its plan says it for the whole wall, which may reach into other sections (`railed`, `railedPast`:
        // WorldEnvironment.wallRailed); a side road's own walls are whole in its rows: one that has a segment dropping
        // PARAPET_DROP_M or more (RoadMesh.railed, as its face is drawn below) and no marker stones in its parapet's place,
        // or that goes on in another piece of its road with one (`railedEnds`)
        const railedAt = sides.plan && typeof sides.plan.railed === 'function' ? sides.plan.railed : null;
        const railedPast = sides.plan && typeof sides.plan.railedPast === 'function' ? sides.plan.railedPast : null;
        const own = f => (f && !f.blocked ? f : null);
        // (a segment meets a structure where one of its rows is a structure's that goes on away from the wall: a lone
        // structure row of a side road has no deck or parapet of its own, and the wall's parapet goes on over it)
        const built = j => j < 0 || j >= sides.length || !!(sides[j].bits & 7);
        const abutsAt = k => (!!(sides[k].bits & 7) && built(k - 1)) || (!!(sides[k + 1].bits & 7) && built(k + 2));
        // (the wall's segment as it is drawn: its edge points and how deep its face goes at each, RoadMesh.wallDepth)
        const wallGeom = (k, key) => {
            const fa = own(endOf(k, key, true)), fb = own(endOf(k + 1, key, true));
            if (!fa && !fb) return null;
            const pa = fa ? fa.at : sides[k][key], pb = fb ? fb.at : sides[k + 1][key], o = (fa || fb).out;
            const runFoot = Math.min(...[fa, fb].filter(Boolean).map(f => f.y));
            const reach = p => (foot && foot.under ? foot.under(p[0], p[1], p[2], o[0], o[1]) : Infinity);
            const between = reach([(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2]);
            return { pa, pb, da: RoadMesh.wallDepth(fa, pa, runFoot, reach(pa), between), db: RoadMesh.wallDepth(fb, pb, runFoot, reach(pb), between) };
        };
        const railMemo = { l: [], r: [] };
        const wallRailed = (k, key) => {
            if (kindOf(k, key) !== 'wall') return false;
            if (railMemo[key][k] !== undefined) return railMemo[key][k];
            let on = false;
            if (railedAt && Number.isFinite(sides[k].i)) {
                for (let i = sides[k].i; i < Math.max(sides[k].i + 1, sides[k + 1].i) && !on; i++) on = !!railedAt(i, key);
                railMemo[key][k] = on;
                return on;
            }
            let a = k, b = k;
            while (kindOf(a - 1, key) === 'wall') a--;
            while (kindOf(b + 1, key) === 'wall') b++;
            for (let j = a; j <= b && !on; j++) {
                if (stoned(j, key)) continue;
                const g = wallGeom(j, key);
                on = !!g && RoadMesh.railed(g.pa, g.pb, g.da, g.db);
            }
            // (or where it goes on as a wall with one in another piece of its road: RoadMesh.addEdgeWorks)
            const at = j => (plan.end[key][j] ? plan.end[key][j].at : sides[j][key]);
            if (!on && sides.railedEnds) on = [at(a), at(b + 1)].some(p => sides.railedEnds.some(q => Math.hypot(p[0] - q[0], p[2] - q[2]) < 0.05));
            for (let j = a; j <= b; j++) railMemo[key][j] = on;
            return on;
        };
        // (none on a wall whose marker stones stand in its place, nor on its segment that ends at a structure's row: the
        // structure's own parapet ends there, 0.2 m from where this one would and lower, and the two made a step, its
        // corners and faces a hand apart and its end over the structure's (world-structures `seams`, `coplanar`))
        const parapetOn = (k, key) => wallRailed(k, key) && !abutsAt(k) && !stoned(k, key);
        // Whether the wall that the face past a wall's end at segment k goes on from carries a parapet: behind it
        // (way 0) or ahead (way 1)
        const railedFrom = (k, key, way) => {
            if (railedPast && Number.isFinite(sides[k].i) && Number.isFinite(sides[k + 1].i)) return !!(way ? railedPast(sides[k + 1].i, key, 1) : railedPast(sides[k].i, key, -1));
            for (let j = way ? k + 1 : k - 1; j >= 0 && j + 1 < sides.length; j += way ? 1 : -1) {
                const kind = kindOf(j, key);
                if (kind === 'wall') return wallRailed(j, key);
                if (kind !== 'apron') return false;
            }
            return false;
        };
        for (let k = 0; k + 1 < sides.length; k++) {
            yield;
            const ea = ends[k], eb = ends[k + 1];
            if (!ea || !eb) continue;
            const drawn = k >= drawFrom && k < drawTo;
            const apronOut = drawn ? apron : junk, wallOut = drawn ? wall : junk, stoneOut = drawn ? stone : junk, pavingOut = drawn ? paving : junk;
            let soffit = false;
            for (const key of ['l', 'r']) {
                // The paving is laid between the rows, not row by row: the edge between two rows is read every
                // PAVING_STEP_M for the side road beside it (`foot.gore`), and each step paved out to it. The ride's rows
                // are about 4 m apart, and a side road that leaves at an angle crossed the gore's reach between two of
                // them: row by row, one row was paved alone and laid nothing (a lone row's triangle had reached into the
                // corner past the side road), and the land lay in the corner between the two roads (the run-in's pits
                // at km 1.1, 11.0 and 14.08)
                const near = [k - 1, k, k + 1, k + 2].some(j => paved[j] && paved[j][key]);
                // (and on to a bridge's first row from the open row before it: a side road that leaves just before a
                // bridge lay beside the segment to the deck's first row with the land 1.4 m down between the two, leg
                // 3's j35. The bridge row's own end reads no side road, so the paving closes to the edge there. On every
                // segment the lines between are turned toward the side road where square to the ride they meet none:
                // edgeFoot `gore`)
                const open = j => !(sides[j].bits & 7), bridged = j => !(sides.owner >= 0) && (sides[j].bits & 7) === 2 && !sides[j].viaduct;
                const bridging = (open(k) && bridged(k + 1)) || (bridged(k) && open(k + 1));
                if (!near || !foot || !foot.gore || !((open(k) && open(k + 1)) || bridging) || !sides[k].lc || !sides[k + 1].lc) continue;
                const ca = sides[k][key + 'c'], cb = sides[k + 1][key + 'c'];
                const oa = RoadMesh.outward(sides[k])[key], ob = RoadMesh.outward(sides[k + 1])[key];
                const steps = Math.max(1, Math.ceil(Math.hypot(cb[0] - ca[0], cb[2] - ca[2]) / RoadMesh.PAVING_STEP_M));
                const line = [];
                for (let j = 0; j <= steps; j++) {
                    const u = j / steps;
                    const c = [ca[0] + (cb[0] - ca[0]) * u, ca[1] + (cb[1] - ca[1]) * u, ca[2] + (cb[2] - ca[2]) * u];
                    let ox = oa[0] + (ob[0] - oa[0]) * u, oz = oa[1] + (ob[1] - oa[1]) * u;
                    const ol = Math.hypot(ox, oz) || 1;
                    ox /= ol; oz /= ol;
                    // (the rows' own reads at the ends, so two segments meet on one line)
                    const g = j === 0 ? paved[k] && paved[k][key] : j === steps ? paved[k + 1] && paved[k + 1][key] : foot.gore(c[0], c[1], c[2], ox, oz, true);
                    line.push({ c, g: g || null });
                }
                const c = RoadMesh.PAVING_LINEAR;
                // (from the ride's edge, PAVING_UNDER_M under it, sloping to the side road's near edge where that lies
                // lower: laid level with the lower, the paving lay a side road's fall under the ride's edge)
                // (from the edge up to where it meets the side road, at that road's height there, then on under the road
                // to the far edge: `near`, edgeFoot `gore`)
                const nearOf = g => g.near || g;
                const edgeOf = (q, g) => [q.c[0], Math.min(q.c[1] - RoadMesh.PAVING_UNDER_M, nearOf(g)[1] + RoadMesh.PAVING_UNDER_M), q.c[2]];
                const mix = (u, v, s) => [u[0] + (v[0] - u[0]) * s, u[1] + (v[1] - u[1]) * s, u[2] + (v[2] - u[2]) * s];
                const strip = (a0, b0, a1, b1) => {
                    // In pieces no longer than PAVING_PIECE_M out from the edge: no large flat face
                    const nv = Math.max(1, Math.ceil(Math.max(Math.hypot(a1[0] - a0[0], a1[2] - a0[2]), Math.hypot(b1[0] - b0[0], b1[2] - b0[2])) / RoadMesh.PAVING_PIECE_M));
                    for (let v = 0; v < nv; v++) RoadMesh.quad(pavingOut, mix(a0, a1, v / nv), mix(b0, b1, v / nv), mix(b0, b1, (v + 1) / nv), mix(a0, a1, (v + 1) / nv), [c, c, c, c]);
                };
                for (let j = 0; j < steps; j++) {
                    const qa = line[j], qb = line[j + 1];
                    if (!qa.g && !qb.g) continue;
                    // (where the side road comes into reach between two places, the paving closes to the edge there)
                    const ga = qa.g || qb.g, gb = qb.g || qa.g;
                    const a0 = edgeOf(qa, ga), b0 = edgeOf(qb, gb);
                    const an = qa.g ? nearOf(qa.g) : a0, bn = qb.g ? nearOf(qb.g) : b0;
                    strip(a0, b0, an, bn);
                    // (on the segment to a bridge's first row, where it closes to the edge, the side from the edge out to the
                    // side road comes down to the land: it ended over the land under the abutment, 1.2 to 2 m down, leg 3's
                    // j35)
                    if (bridging && !qa.g !== !qb.g && landAt) {
                        const [p, q] = qa.g ? [b0, an] : [a0, bn];
                        const lp = landAt(p[0], p[2]), lq = landAt(q[0], q[2]);
                        if (lp !== null && lq !== null && (lp < p[1] - 0.05 || lq < q[1] - 0.05)) RoadMesh.quad(pavingOut, p, q, [q[0], Math.min(q[1], lq - 0.2), q[2]], [p[0], Math.min(p[1], lp - 0.2), p[2]], [c, c, c, c]);
                    }
                    // (then on under the side road's edge at its own height, PAVING_TUCK_M: the ribbon closes the rest. Laid
                    // on under the whole road to its far edge, flat or along the road, it stood over the ribbon where the
                    // road beside the ride bends or dips)
                    const prof = (g, n) => (g && g.under && g.under.length ? [n, g.under[0]] : [n]);
                    const pa = prof(qa.g, an), pb = prof(qb.g, bn), m = Math.max(pa.length, pb.length);
                    // (its far edge comes down to the land where it stands more than a hand over it: at a side road that
                    // ends in the ride's verge as its stub, the edge stood 1 to 3.6 m over the land falling away past the
                    // verge, leg 3's j54, 8 of world-spikes' overhangs. With it the lines are turned on every segment)
                    const drop = (ea, eb) => {
                        if (!landAt) return;
                        const la = landAt(ea[0], ea[2]), lb = landAt(eb[0], eb[2]);
                        if (la !== null && lb !== null && (la < ea[1] - 0.25 || lb < eb[1] - 0.25)) RoadMesh.quad(pavingOut, ea, eb, [eb[0], Math.min(eb[1], lb - 0.2), eb[2]], [ea[0], Math.min(ea[1], la - 0.2), ea[2]], [c, c, c, c]);
                    };
                    // (and there not where the paving closes to the edge: closed to the edge too, the piece under the road
                    // stood as a sliver from under the side road back to the ride's edge, open over the land, leg 3's j35)
                    if (m < 2 && qa.g && qb.g) drop(an, bn);
                    if (m < 2 || (bridging && (!qa.g || !qb.g))) continue;
                    const at = (list, i) => { const f = (i * (list.length - 1)) / (m - 1), lo = Math.floor(f), hi = Math.min(list.length - 1, lo + 1); return mix(list[lo], list[hi], f - lo); };
                    for (let i = 0; i + 1 < m; i++) strip(at(pa, i), at(pb, i), at(pa, i + 1), at(pb, i + 1));
                    drop(at(pa, m - 1), at(pb, m - 1));
                }
            }
            // The ground that closes a narrow gap between the ride and a side road beside it (WorldEnvironment.cleftAt),
            // between two rows that both have it, from the verge's edge out at the lower road's height
            for (const key of ['l', 'r']) {
                if (sides.owner >= 0 || !foot || !foot.cleft || !Number.isFinite(sides[k].i) || !Number.isFinite(sides[k + 1].i)) continue;
                const sign = key === 'r' ? 1 : -1, ca = foot.cleft(sides[k].i, sign), cb = foot.cleft(sides[k + 1].i, sign);
                if (!ca && !cb) continue;
                // (at the end of a run the fill comes down to the land at the next row, over the same run: ended level
                // at that row, its side stood open over the land metres down)
                const down = (j, c) => {
                    const p = sides[j][key], o = RoadMesh.outward(sides[j])[key], q = [p[0] + o[0] * c.run, 0, p[2] + o[1] * c.run];
                    const lp = landAt ? landAt(p[0], p[2]) : null, lq = landAt ? landAt(q[0], q[2]) : null;
                    return lp === null || lq === null ? null : { y: Math.min(c.y, lp), at: [q[0], Math.min(c.y, lq), q[2]] };
                };
                // (in a side road's mouth, where the ride lays nothing on the segment, it comes down to the side road
                // beside the ride at that row instead, as the ground that closes a cleft lies: brought down to the land
                // there, the ground under the verge stood over it as a face 2.7 m high, leg 6's j12)
                const open = (j, c) => (!kindOf(k, key) && foot.cleft(sides[j].i, sign, false)) || down(j, c);
                const fa = ca || open(k, cb), fb = cb || open(k + 1, ca);
                if (!fa || !fb) continue;
                const na = [sides[k][key][0], fa.y, sides[k][key][2]], nb = [sides[k + 1][key][0], fb.y, sides[k + 1][key][2]];
                const ta = (ca || cb).color || RoadMesh.APRON_LINEAR, tb = (cb || ca).color || RoadMesh.APRON_LINEAR;
                RoadMesh.quad(apronOut, na, nb, fb.at, fa.at, [ta, tb, tb, ta]);
                // (and under the ride's verge, where the segment lays nothing there: from the wall's end to the next row
                // in a side road's mouth, where the verge is cut for the side road, the fill started at the verge's edge
                // and the metre under the verge stood open 3 m down to the land, leg 5's j260. Closed down to the land
                // at a row the fill does not reach)
                const va = sides[k][key + 'c'], vb = sides[k + 1][key + 'c'];
                if (!kindOf(k, key) && va && vb && !(paved[k] && paved[k][key] && paved[k + 1] && paved[k + 1][key])) {
                    const pa = sides[k][key], pb = sides[k + 1][key];
                    const rim = groundUnder(apronOut, va, vb, pb, pa, ta, tb);
                    // (its outer edge down to the fill, at the lower road's height: no wall stands there to close the step)
                    const mix = (u, v, t) => u.map((x, i) => x + (v[i] - x) * t);
                    for (let i = 0; i + 1 < rim.length; i++) {
                        const ua = rim[i][1], ub = rim[i + 1][1], da = mix(na, nb, i / (rim.length - 1)), db = mix(na, nb, (i + 1) / (rim.length - 1));
                        if (ua[1] - da[1] > 0.05 || ub[1] - db[1] > 0.05) RoadMesh.quad(apronOut, ua, ub, [db[0], Math.min(ub[1], db[1]), db[2]], [da[0], Math.min(ua[1], da[1]), da[2]], [ta, tb, tb, ta]);
                    }
                    for (const [f, top] of [[ca, rim[0]], [cb, rim[rim.length - 1]]]) {
                        if (f) continue;
                        const lands = top.map(q => (landAt ? landAt(q[0], q[2]) : null));
                        if (lands.some(l => l === null) || top.every((q, i) => q[1] - lands[i] < 0.25)) continue;
                        RoadMesh.quad(apronOut, top[0], top[1], [top[1][0], Math.min(top[1][1], lands[1] - 0.2), top[1][2]], [top[0][0], Math.min(top[0][1], lands[0] - 0.2), top[0][2]], [ta, ta, tb, tb]);
                    }
                }
                // (and from its far edge, under the side road's verge, down to the land: the side road has no wall there,
                // and the edge hung over the land)
                const la = landAt ? landAt(fa.at[0], fa.at[2]) : null, lb = landAt ? landAt(fb.at[0], fb.at[2]) : null;
                if (la !== null && lb !== null && (la < fa.at[1] - 0.05 || lb < fb.at[1] - 0.05)) RoadMesh.quad(apronOut, fa.at, fb.at, [fb.at[0], Math.min(fb.at[1], lb - 0.2), fb.at[2]], [fa.at[0], Math.min(fa.at[1], la - 0.2), fa.at[2]], [ta, tb, tb, ta]);
            }
            for (const key of ['l', 'r']) {
                const kind = kindOf(k, key);
                // A far section's segment that lays no slope (a junction's paving, a side road's mouth, a carriageway in
                // the way) over land drawn coarser than at full detail: a face hangs from the slope's top down to that
                // land, along the edge, so the mouth is no notch down to it (`deep` feet at both rows, or `under` where a
                // slope ends on a side road's surface: WorldEnvironment.edgeFoot `far`). Under a side road drawn there it
                // lies under that road's surface (underAt); at full detail it lies under the land
                const pavedSegment = !!(paved[k] && paved[k][key] && paved[k + 1] && paved[k + 1][key]);
                if ((!kind || (kind === 'apron' && pavedSegment)) && foot && !(sides[k].bits & 7) && !(sides[k + 1].bits & 7)) {
                    const pa = sides[k][key], pb = sides[k + 1][key], oa = RoadMesh.outward(sides[k])[key], ob = RoadMesh.outward(sides[k + 1])[key];
                    // (a side road's segment with no wall, past its fill rows in the ride's band: its far ribbon is drawn from
                    // SIDE_NEAR_M on over tiles drawn coarser, and it stood over them with its underside to a rider on
                    // the valley floor, the red lines up the hillsides of world-floating's view at leg 3 s 250; `foot.coarse`)
                    const side = sides.owner >= 0;
                    const fa = side ? null : foot(pa[0], pa[1], pa[2], oa[0], oa[1], plan ? false : undefined), fb = side ? null : foot(pb[0], pb[1], pb[2], ob[0], ob[1], plan ? false : undefined);
                    const low = f => (f && f.deep ? f.y : f && Number.isFinite(f.under) ? f.under : null);
                    const coarse = (j, p, o) => (side && foot.coarse && !sides[j].fill ? foot.coarse(p[0], p[1], p[2], o[0], o[1]) : null);
                    const la = side ? coarse(k, pa, oa) : low(fa), lb = side ? coarse(k + 1, pb, ob) : low(fb);
                    if (la !== null && lb !== null && !(side && kind)) {
                        const ta = underAt(pa), tb = underAt(pb), ba = [pa[0], Math.min(la, ta[1]), pa[2]], bb = [pb[0], Math.min(lb, tb[1]), pb[2]];
                        // (a side road's face in one piece along its segment: a far ribbon's segment is seen from 400 m and
                        // more, and in 2 m strips the faces of the side roads cost 70 000 to 90 000 triangles in a window)
                        const along = side ? 1 : Math.max(1, Math.ceil(Math.hypot(pb[0] - pa[0], pb[2] - pa[2]) / RoadMesh.APRON_STRIP_M));
                        const down = Math.max(1, Math.ceil(Math.max(ta[1] - ba[1], tb[1] - bb[1]) / RoadMesh.DEEP_ROW_M));
                        const mix = (u, v, t) => u.map((c, i) => c + (v[i] - c) * t);
                        const ca = (fa && (fa.top || fa.color)) || RoadMesh.APRON_LINEAR, cb = (fb && (fb.top || fb.color)) || RoadMesh.APRON_LINEAR;
                        const fca = (fa && fa.color) || ca, fcb = (fb && fb.color) || cb;
                        for (let i = 0; i < along; i++) {
                            const u0 = i / along, u1 = (i + 1) / along;
                            const t0 = mix(ta, tb, u0), t1 = mix(ta, tb, u1), f0 = mix(ba, bb, u0), f1 = mix(ba, bb, u1);
                            const c0 = mix(ca, cb, u0), c1 = mix(ca, cb, u1), d0 = mix(fca, fcb, u0), d1 = mix(fca, fcb, u1);
                            for (let r = 0; r < down; r++) {
                                const v0 = r / down, v1 = (r + 1) / down;
                                RoadMesh.quad(apronOut, mix(t0, f0, v0), mix(t1, f1, v0), mix(t1, f1, v1), mix(t0, f0, v1), [mix(c0, d0, v0), mix(c1, d1, v0), mix(c1, d1, v1), mix(c0, d0, v1)]);
                            }
                        }
                    }
                }
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
                    const under = p => underAt(p);
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
                    if (ca && cb && !overOther) {
                        groundUnder(apronOut, ca, cb, pb, pa, topColor(fa), topColor(fb));
                        // Where the next segment lays no slope (a structure's, a wall's, or none), the ground under the
                        // verge ends at the row with its side open: a face closes it down to the land, as drawn there
                        // (the lowest drawn at any level under a far section: the kept row beside a bridge's first row
                        // left a 1.1 m edge 1 to 2 m over the land, world-spikes' overhangs)
                        const close = (j, c, p, color) => {
                            if (kindOf(j, key) === 'apron') return;
                            const far = !!(fa && fa.deep) || !!(fb && fb.deep);
                            const lands = [c, p].map(q => (far && landLow ? landLow(q[0], q[2]) : landAt ? landAt(q[0], q[2]) : null));
                            if (lands.some(l => l === null)) return;
                            const top = [c, p].map(q => underAt(q));
                            const low = top.map((q, i) => [q[0], Math.min(q[1], lands[i] - 0.2), q[2]]);
                            if (top.every((q, i) => q[1] - low[i][1] < 0.05)) return;
                            RoadMesh.quad(apronOut, top[0], top[1], low[1], low[0], color);
                        };
                        close(k - 1, ca, pa, topColor(fa));
                        close(k + 1, cb, pb, topColor(fb));
                    }
                    // Then from the verge's edge out and down at the batter to the land's height, in strips no longer
                    // than APRON_STRIP_M along the edge, so no apron triangle grows into a large flat face
                    const foot = (f, p, way = o) => { const y = low(f, p), run = f ? RoadMesh.apronRun(f, p) : 0; return [p[0] + way[0] * run, Math.min(y, under(p)[1]), p[2] + way[1] * run]; };
                    const ta = under(pa), tb = under(pb), fA = foot(fa, pa), fB = foot(fb, pb);
                    onRoad = !!(fa && fa.meets) || !!(fb && fb.meets);
                    const deep = !!(fa && fa.deep) || !!(fb && fb.deep);
                    // (a face from a foot down to the coarse land, in rows of DEEP_ROW_M, where it clears every road below)
                    const hang = (f0, f1, c0, c1) => {
                        if (!deep || !landLow) return;
                        const l0 = landLow(f0[0], f0[2]), l1 = landLow(f1[0], f1[2]);
                        if (l0 === null || l1 === null) return;
                        const b0 = [f0[0], Math.min(f0[1], l0 - 0.2), f0[2]], b1 = [f1[0], Math.min(f1[1], l1 - 0.2), f1[2]];
                        if (f0[1] - b0[1] < 0.3 && f1[1] - b1[1] < 0.3) return;
                        if (guard && [f0, f1].some((q, i) => guard.depth(q[0], q[2], (i ? b1 : b0)[1], q[1] - 0.05) !== null)) return;
                        // (no triangle over 18 m2: the rows are shorter where the feet stand far apart, round a bend's outside)
                        const wide = Math.max(0.1, Math.hypot(f1[0] - f0[0], f1[2] - f0[2]));
                        const rows2 = Math.max(1, Math.ceil(Math.max(f0[1] - b0[1], f1[1] - b1[1]) / Math.min(RoadMesh.DEEP_ROW_M, 36 / wide)));
                        for (let r = 0; r < rows2; r++) RoadMesh.quad(apronOut, lerp(f0, b0, r / rows2), lerp(f1, b1, r / rows2), lerp(f1, b1, (r + 1) / rows2), lerp(f0, b0, (r + 1) / rows2), [c0, c1, c1, c0]);
                    };
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
                    if (fine) fine.drawn[key][sides[k].i - fine.base] = RoadMesh.TAPER_SAMPLES.map(share);
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
                    { const c0 = crest(0), c1 = crest(1); banded(k, key, c0.face, c0.inner, c1.face, c1.inner); }
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
                            hang(other.foot, first.foot, footColor(fa), footColor(fa));
                        }
                    }
                    let a = first;
                    const pieces = [];
                    // The parapet of the wall it goes on from goes on over it too, at its full height, to its closed
                    // end (a wall whose parapet stopped at the wall's end ran on as a bare coping; `railedFrom`): over
                    // each piece where the stone is that wall's (`part`), or, bridging to the next wall, either's
                    const railed = [from[0] && railedFrom(k, key, 0), from[1] && railedFrom(k, key, 1)];
                    const railOn = t => (bridged && (railed[0] || railed[1])) || (railed[0] && part(0, t) > 0) || (railed[1] && part(1, t) > 0);
                    // (on the stone's own line: its face less STONE_PROUD_M, the way it faces made unit)
                    const seatOf = e => { const len = Math.hypot(e.n[0], e.n[1]) || 1, n = [e.n[0] / len, e.n[1] / len], P = RoadMesh.STONE_PROUD_M; return { p: [e.face[0] - e.n[0] * P, e.face[1], e.face[2] - e.n[1] * P], n }; };
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
                        hang(foot0, foot1, d0, d1);
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
                            // (a piece whose stone starts or ends inside its strip is laid over the whole strip:
                            // its parapet is read at both ends)
                            pieces.push([point(a, t0), point(b, t1), railOn(t0) || railOn(t1)]);
                        }
                        a = b;
                    }
                    // (the slope's side at a row beside a structure, where the segment on lays no slope: closed down to
                    // the land drawn under it. Open, it stood 1 to 1.3 m over the land under a bridge's end, the
                    // first open row past four of legs 4 and 5's bridges, world-spikes' flaps)
                    for (const [j, row, seg, e] of [[k, k - 1, k - 1, first], [k + 1, k + 2, k + 1, a]]) {
                        if (!landAt || !(sides[row] && sides[row].bits & 7) || kindOf(seg, key) === 'apron') continue;
                        const n = Math.max(1, rows), line = [];
                        for (let r = 0; r <= n; r++) line.push(lerp(e.top, e.foot, r / n));
                        for (let r = 0; r < n; r++) {
                            const p = line[r], q = line[r + 1], lp = landAt(p[0], p[2]), lq = landAt(q[0], q[2]);
                            if (lp === null || lq === null || (p[1] - lp < 0.25 && q[1] - lq < 0.25)) continue;
                            RoadMesh.quad(apronOut, p, q, [q[0], Math.min(q[1], lq - 0.2), q[2]], [p[0], Math.min(p[1], lp - 0.2), p[2]], j === k ? topColor(fa) : topColor(fb));
                        }
                    }
                    // The stone, one piece over the strips it holds in turn: the edge is straight between two rows, so
                    // the piece's top is theirs and only its foot is sunk to lie under every strip's own, about the end
                    // where it dies (which keeps no height) or evenly. Two triangles of face and two of coping for a
                    // segment, as many as its face alone cost in strips
                    // (and its parapet, where it has one, one piece over the same strips)
                    const runs = [];
                    for (const [A, B, rail] of pieces) {
                        const run = runs[runs.length - 1];
                        if (run && run.B === A && !(run.A.end && B.end) && run.rail === rail) { run.B = B; run.inner.push(A); } else runs.push({ A, B, inner: [], rail });
                    }
                    for (const { A, B, inner, rail } of runs) {
                        if (rail) {
                            const sa = seatOf(A), sb = seatOf(B);
                            rails.stone[key].push({ k, pa: sa.p, pb: sb.p, o, drawn, oa: sa.n, ob: sb.n, ua: A.u, ub: B.u });
                        }
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
                    if (ca && cb && !over) groundUnder(inPaving ? pavingOut : apronOut, ca, cb, vb, va, tint(fa), tint(fb));
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
                    banded(k, key, qa, ia, qb, ib);
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
                // (a wall's parapet stands on its coping, COPING_UP_M over the edge: its face goes on from the wall's own
                // and the two share their edge; parapetOn says which walls carry one)
                // (at a structure's row the wall's face stands at the row's edge, not proud of it: the parapet over a
                // lone one stands in by as much, so its face stays the wall's)
                const seat = (p, j) => {
                    if (kind !== 'wall') return p;
                    const n = RoadMesh.outward(sides[j])[key], P = sides[j].bits & 7 && !sides[j].viaduct ? RoadMesh.STONE_PROUD_M : 0;
                    return [p[0] - n[0] * P, p[1] + RoadMesh.COPING_UP_M, p[2] - n[1] * P];
                };
                if (kind === 'deck' || parapetOn(k, key)) rails[kind === 'deck' ? 'wall' : 'stone'][key].push({ k, pa: seat(pa, k), pb: seat(pb, k + 1), o, drawn, oa: RoadMesh.outward(sides[k])[key], ob: RoadMesh.outward(sides[k + 1])[key], ua: kind === 'wall' ? alongOf(k, key) : NaN, ub: kind === 'wall' ? alongOf(k + 1, key) : NaN });
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
        // (each run's segments say whether they carry a parapet, `rail`: the camera's faces and a piece joining two
        // roads' walls read it, WorldEnvironment.runParapet)
        const walls = RoadMesh.wallRuns(sides, plan, drawFrom, drawTo).map(run => Object.assign(run, { rail: run.rows.map(k => parapetOn(k, run.key)) }));
        return { apron, wall, stone, paving, walls };
    }

    // The edge works of a ribbon as one mesh, added to `group` ('road-works': the apron in the land's material
    // (group 0), decks and the extra structures in the structures' (1), retaining walls and their parapets in stone
    // (2), a junction's paving in the road's (3), a viaduct's stone (4, RoadMesh.viaduct, the walls' own) and the
    // stone under its deck (5, the same)): the triangles they cost. Groups 0 and 3 are ground, 1, 2, 4 and 5
    // structures. `userData.viaduct` holds the vertex ranges ([start, count]) of the arches' undersides (`soffits`, group
    // 5) and of the stone that stands on the land (`feet`, group 4), for the checks
    // `sides` may be a list of rows' sides, or a list of such lists (several roads in one mesh: the side roads of a chunk)
    // `extra` are structure parts ({positions, shades}, sRGB) drawn in the same mesh when it is made at all.
    // `roads` (Carriageways) keeps each run's works out of every other road's carriageway (RoadMesh.edgeWorks guard)
    static addEdgeWorks(group, sides, foot, extra = [], roads = null, join = null) {
        return RoadMesh.drain(RoadMesh.addEdgeWorksSteps(group, sides, foot, extra, roads, join));
    }

    // The same in steps (edgeWorksSteps)
    static *addEdgeWorksSteps(group, sides, foot, extra = [], roads = null, join = null) {
        const runs = sides.length && Array.isArray(sides[0]) ? sides : [sides];
        const works = { apron: { positions: [], shades: [] }, wall: { positions: [], shades: [] }, stone: { positions: [], shades: [] }, paving: { positions: [], shades: [] }, arch: { positions: [], shades: [] }, vault: { positions: [], shades: [] } };
        const face = [];
        // The road each triangle belongs to (a run's or a part's `owner`: a side edge id, -1 for the ride), so a check
        // can tell a road's own structures from another road's
        const owners = { apron: [], wall: [], stone: [], paving: [], arch: [], vault: [] };
        const arches = { soffits: [], feet: [], underFeet: [] };
        const vaultOut = [], vaultAlong = [], vaultKind = [];
        const archFace = [];
        const own = (key, count, owner) => { for (let t = 0; t < count / 9; t++) owners[key].push(owner); };
        // The runs of retaining wall drawn here (RoadMesh.wallRuns), for the land that is cut to them
        const walls = group.userData.walls = [];
        const parts = [];
        for (const run of runs) parts.push(yield* RoadMesh.edgeWorksSteps(run, foot, roads ? roads.guard(run.owner ?? -1) : null));
        // A road drawn in pieces (a side road's stub and the road on from it) cuts a wall that runs across the joint in
        // two: one piece's wall carried a parapet and stopped at the joint, the other's ran on as a bare coping. A wall
        // that carries one in a piece carries it in the other too (edgeWorks `railedEnds`)
        const railedEnds = parts.map(part => part.walls.filter(w => w.rail.some(Boolean)).flatMap(w => [w.points[0], w.points[w.points.length - 1]]));
        for (let i = 0; i < runs.length; i++) {
            const run = runs[i];
            const others = runs.flatMap((other, j) => (j !== i && (other.owner ?? -1) === (run.owner ?? -1) ? railedEnds[j] : []));
            const meets = w => [w.points[0], w.points[w.points.length - 1]].some(p => others.some(q => Math.hypot(p[0] - q[0], p[2] - q[2]) < 0.05));
            if (!others.length || !parts[i].walls.some(w => !w.rail.some(Boolean) && meets(w))) continue;
            run.railedEnds = others;
            parts[i] = yield* RoadMesh.edgeWorksSteps(run, foot, roads ? roads.guard(run.owner ?? -1) : null);
        }
        runs.forEach((run, i) => {
            const part = parts[i];
            for (const wall of part.walls) walls.push(Object.assign(wall, { owner: run.owner ?? -1 }));
            face.push(...part.stone.face);
            for (const key of ['apron', 'wall', 'stone', 'paving']) {
                works[key].positions.push(...part[key].positions);
                works[key].shades.push(...part[key].shades);
                own(key, part[key].positions.length, run.owner ?? -1);
            }
        });
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
            if (part.viaduct) {
                for (const [start, count] of part.feet) arches.feet.push([base + start, count]);
                archFace.push(...part.face);
                const vaultBase = works.vault.positions.length / 3;
                for (const [start, count] of part.soffit) arches.soffits.push([vaultBase + start, count]);
                for (const [start, count] of part.vault.feet) arches.underFeet.push([vaultBase + start, count]);
                vaultOut.push(...part.vault.out);
                vaultAlong.push(...part.vault.along);
                vaultKind.push(...part.vault.kind);
                works.vault.positions.push(...part.vault.positions);
                works.vault.shades.push(...part.vault.shades);
                own('vault', part.vault.positions.length, part.owner ?? -1);
            }
            into.positions.push(...part.positions);
            into.shades.push(...part.shades);
            own(part.viaduct ? 'arch' : 'wall', part.positions.length, part.owner ?? -1);
        }
        const apron = works.apron.positions.length / 3, wall = works.wall.positions.length / 3, stone = works.stone.positions.length / 3, paving = works.paving.positions.length / 3, arch = works.arch.positions.length / 3, vault = works.vault.positions.length / 3;
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
        const shades = works.apron.shades.concat(works.wall.shades.map(v => Math.pow(v, 2.2)), works.stone.shades.map(v => Math.pow(v, 2.2)), works.paving.shades, works.arch.shades.map(v => Math.pow(v, 2.2)), works.vault.shades.map(v => Math.pow(v, 2.2)));
        const geometry = RoadMesh.geometry(works.apron.positions.concat(works.wall.positions, works.stone.positions, works.paving.positions, works.arch.positions, works.vault.positions), shades);
        geometry.userData.linearColors = true;
        geometry.userData.owners = Int32Array.from(owners.apron.concat(owners.wall, owners.stone, owners.paving, owners.arch, owners.vault));
        const first = apron + wall + stone + paving;
        geometry.userData.viaduct = { soffits: arches.soffits.map(([start, count]) => [first + arch + start, count]), feet: arches.feet.map(([start, count]) => [first + start, count]).concat(arches.underFeet.map(([start, count]) => [first + arch + start, count])) };
        geometry.addGroup(0, apron, 0);
        if (wall) geometry.addGroup(apron, wall, 1);
        if (stone) geometry.addGroup(apron + wall, stone, 2);
        // A junction's paving is road, drawn as a road is (RoadSurface.pavingMaterial): as land it was a pale slab
        if (paving) geometry.addGroup(apron + wall + stone, paving, 3);
        if (arch) geometry.addGroup(first, arch, 4);
        // The stone under a viaduct's deck: the same stone, lit as its arch's face turned down (VAULT_TILT)
        if (vault) geometry.addGroup(first + arch, vault, 5);
        // A wall is lit flat across each quad: its two triangles share the quad's normal, so no crease shows. The apron
        // is lit as the land round it is (straight up): lit as a slope it read as a dark seam along the verge
        RoadMesh.flatNormals(geometry, apron / 3);
        const normal = geometry.attributes.normal.array;
        for (const v0 of [0, apron + wall + stone]) for (let v = v0; v < v0 + (v0 ? paving : apron); v++) { normal[v * 3] = 0; normal[v * 3 + 1] = 1; normal[v * 3 + 2] = 0; }
        // A retaining wall's face is lit as one face along its run (each row's outward), and its courses are laid
        // along its own metres (`wallFace`: metres along, 1 on a wall's face, 2 on one drawn from its front only),
        // LandShade's stone
        const wallFace = new Float32Array((apron + wall + stone + paving + arch + vault) * 2);
        for (let v = 0; v < stone; v++) {
            if (!face[v * 4 + 1]) continue;
            const at = apron + wall + v;
            wallFace[at * 2] = face[v * 4];
            wallFace[at * 2 + 1] = face[v * 4 + 1];
            normal[at * 3] = face[v * 4 + 2]; normal[at * 3 + 1] = 0; normal[at * 3 + 2] = face[v * 4 + 3];
        }
        // (the stone under a viaduct's deck is lit as the face its arch opens in, turned down VAULT_TILT: whatever the sun,
        // no more light falls on it than on that face, and it keeps the sky's light that face has. Lit by its own way
        // an arch's side or back that faced the sun glowed white under the deck; lit straight down it drew near black)
        for (let v = 0; v < vault; v++) {
            const [ox, oz] = vaultOut[v], at = first + arch + v, c = Math.cos(RoadMesh.VAULT_TILT);
            normal[at * 3] = ox * c; normal[at * 3 + 1] = -Math.sin(RoadMesh.VAULT_TILT); normal[at * 3 + 2] = oz * c;
            wallFace[at * 2] = vaultAlong[v];
            wallFace[at * 2 + 1] = vaultKind[v] || 1;
        }
        // (and a viaduct's, laid and lit as a wall's: RoadMesh.viaduct `face`)
        for (let v = 0; v < arch; v++) {
            if (!archFace[v * 4 + 1]) continue;
            const at = first + v;
            wallFace[at * 2] = archFace[v * 4];
            wallFace[at * 2 + 1] = archFace[v * 4 + 1];
            normal[at * 3] = archFace[v * 4 + 2]; normal[at * 3 + 1] = 0; normal[at * 3 + 2] = archFace[v * 4 + 3];
        }
        geometry.setAttribute('wallFace', new THREE.BufferAttribute(wallFace, 2));
        // The paving takes the asphalt's texture on the ground plane, at the near ribbon's scale (from a whole tile
        // near the mesh, so the numbers stay small enough for the grain)
        if (paving) {
            const uv = new Float32Array((apron + wall + stone + paving + arch + vault) * 2), pos = geometry.attributes.position.array, m = RoadSurface.ASPHALT_M;
            const first = (apron + wall + stone) * 3, u0 = Math.floor(pos[first] / m), v0 = Math.floor(pos[first + 2] / m);
            for (let v = apron + wall + stone; v < apron + wall + stone + paving; v++) { uv[v * 2] = pos[v * 3] / m - u0; uv[v * 2 + 1] = pos[v * 3 + 2] / m - v0; }
            geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        }
        const mesh = RoadMesh.mesh(geometry, 'road-works', [RoadMesh.apronMaterial(), RoadMesh.material(), RoadMesh.stoneMaterial(), RoadSurface.pavingMaterial(), RoadMesh.stoneMaterial(), RoadMesh.stoneMaterial()]);
        mesh.userData.world = 'works';
        group.add(mesh);
        return (apron + wall + stone + paving + arch + vault) / 3;
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
    // `through` ([start, end]): the road goes on as a tube past its first or last row (no portal there)
    static sideStructures(sides, groundAt = null, roof = 6.5, footAt = null, guard = null, through = [false, false]) {
        return RoadMesh.drain(RoadMesh.sideStructuresSteps(sides, groundAt, roof, footAt, guard, through));
    }

    // The same in steps: SIDE_STRUCTURE_STEP segments at a time, a tube's segment and its portals each one, then the
    // parapets, the piers and each tube's lining (a long side road's structures took up to 16 ms in one)
    static get SIDE_STRUCTURE_STEP() { return 12; }

    // `faceAt(x, z)`: the land a portal's headwall reaches up to (RoadMesh.headwall), `groundAt` by default: a long
    // side road is drawn whole from one chunk, and its far portal stands where only the far grid is drawn
    static *sideStructuresSteps(sides, groundAt = null, roof = 6.5, footAt = null, guard = null, through = [false, false], faceAt = groundAt) {
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
        const tubes = [];
        const tubeRuns = [];
        // The deck's centre line, run by run, for the piers
        const runs = [];
        let run = null;
        for (let k = 0; k + 1 < sides.length; k++) {
            if (k % RoadMesh.SIDE_STRUCTURE_STEP === RoadMesh.SIDE_STRUCTURE_STEP - 1) yield;
            const a = sides[k], b = sides[k + 1];
            if (a.bits & b.bits & 5) {
                yield;
                // The roof stays under any other road the tube passes beneath, by the deck's depth
                const up = p => {
                    const over = guard ? guard.ceiling(p[0], p[2], p[1]) : null;
                    return [p[0], p[1] + (over === null ? roof : Math.max(1, Math.min(roof, over - D - p[1]))), p[2]];
                };
                // (its walls and roof are the lining's: TubeLining.run, after the loop)
                const last = tubeRuns[tubeRuns.length - 1];
                if (last && last[last.length - 1] === k - 1) last.push(k);
                else tubeRuns.push([k]);
                // (the land is cut to the tube's box: its lowest roof over the segment; its walls stand on the land, and
                // where the run ends, a portal: RoadMesh.tubeWorks, sidePortal)
                const low = Math.min(...[a.l, a.r, b.l, b.r].map(p => up(p)[1] - p[1]));
                tubes.push({ la: a.l, ra: a.r, rb: b.r, lb: b.l, roof: low });
                RoadMesh.tubeWorks(out, { la: a.l, ra: a.r, lb: b.l, rb: b.r, roof: low }, groundAt);
                // (in front of a portal the land is cut to the walls and roof too, and wing walls close its sides)
                const rowsOf = sides.map(side => ({ x: (side.l[0] + side.r[0]) / 2, z: (side.l[2] + side.r[2]) / 2, side }));
                const mouth = (at, step, forward) => {
                    const lines = RoadMesh.mouthLines(rowsOf, at, step, (r, sign) => (sign < 0 ? r.side.l : r.side.r));
                    for (let j = 0; j + 1 < lines.length; j++) tubes.push({ la: lines[j][0], ra: lines[j][1], rb: lines[j + 1][1], lb: lines[j + 1][0], roof: low, mouth: true });
                    RoadMesh.wings(out, lines, groundAt, guard, forward);
                };
                if (sides[k - 1] ? !(sides[k - 1].bits & 5) : !through[0]) mouth(k, -1, RoadMesh.sidePortal(out, a, b, low, faceAt, guard));
                if (sides[k + 2] ? !(sides[k + 2].bits & 5) : !through[1]) mouth(k + 1, 1, RoadMesh.sidePortal(out, b, a, low, faceAt, guard));
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
        yield;
        const piers = RoadMesh.placePiers(out, runs, { groundAt, footAt, guard });
        yield;
        // The lining of each tube run: metres along from the road's first row, metres in from its portals (none where
        // it goes on past the drawn rows), its rock on the side where the land outside stands higher. A side road is
        // seen from the ride, so it has its lining and no fittings
        const lining = TubeLining.parts();
        if (tubeRuns.length) {
            const along = [0];
            for (let k = 1; k < sides.length; k++) along.push(along[k - 1] + Math.hypot(sides[k].l[0] + sides[k].r[0] - sides[k - 1].l[0] - sides[k - 1].r[0], sides[k].l[2] + sides[k].r[2] - sides[k - 1].l[2] - sides[k - 1].r[2]) / 2);
            const depth = TubeLining.depths(sides, along, [!through[0], !through[1]]);
            for (const segs of tubeRuns) {
                const first = segs[0], last = segs[segs.length - 1] + 1;
                const roofAt = k => Math.min(...segs.filter(j => j === k || j === k - 1).map(j => tubes.find(t => t.la === sides[j].l).roof));
                const rows = [];
                for (let k = first; k <= last; k++) rows.push({ l: sides[k].l, r: sides[k].r, s: along[k], inM: depth[k], roof: roofAt(k), floor: null });
                const sideRock = () => {
                    if (!groundAt) return 0;
                    let lean = 0;
                    for (const row of rows) {
                        const dx = row.r[0] - row.l[0], dz = row.r[2] - row.l[2], span = Math.hypot(dx, dz) || 1;
                        const gl = groundAt(row.l[0] - dx / span * 8, row.l[2] - dz / span * 8), gr = groundAt(row.r[0] + dx / span * 8, row.r[2] + dz / span * 8);
                        if (Number.isFinite(gl) && Number.isFinite(gr)) lean += gr - gl;
                    }
                    return lean > 0 ? 1 : lean < 0 ? -1 : 0;
                };
                const rock = sideRock(), gallery = (sides[first].bits & 5) === 4;
                TubeLining.run(lining, rows, { gallery, rock, open: gallery ? -rock : 0, shotcrete: gallery, lod: 1, groundAt, run: [along[first], along[last]], fittings: false });
                yield;
            }
        }
        return { parts: out.positions.length ? [out] : [], lining, piers, tubes, sides: sides.map((side, k) => (decked[k] ? { ...side, bits: side.bits | 2 } : side)) };
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
    static section(rows, lod, options = {}) {
        return RoadMesh.drain(RoadMesh.sectionSteps(rows, lod, options));
    }

    // The same in steps: the ribbon, each structure, the edge works a row at a time
    static *sectionSteps(rows, lod, { groundAt = null, roof = 6.5, foot = null, roads = null, head = 0, tail = 0, plan = null } = {}) {
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
            // The row before a structure's first row and after its last is kept too: a structure's row has no slope, and
            // the far ribbon's segment from the last kept row to it (up to 19 m) had none either, a cleft beside the
            // road to the coarse land at every bridge and gallery
            const structure = k => !!rows[k] && !!(rows[k].bits & 7);
            rows = rows.map((row, k) => (!structure(k) && (structure(k - 1) || structure(k + 1)) ? { ...row, keep: true } : row));
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
        yield;
        let triangles = ribbon.triangles;
        const structures = [];
        const guard = roads ? roads.guard(-1) : null;
        // A run clipped to the drawn rows; it ends where it really ends, not where it goes on into a neighbour
        const clip = mask => RoadMesh.runs(rows, mask).map(([from, to]) => [Math.max(from, first), Math.min(to, last), [from >= first, to <= last]]).filter(([from, to]) => to > from);
        // (the tubes' lining and fittings: two meshes of their own material, TubeShade)
        const lining = TubeLining.parts();
        for (const [from, to, ends] of clip(1 | 4)) {
            structures.push([RoadMesh.tunnel(rows, from, to, roof, ends, groundAt, lining, lod), 'tunnel']);
            yield;
        }
        triangles += TubeLining.addMeshes(group, lining);
        // (a viaduct's rows carry its layout, WorldEnvironment.viaducts: its stone in place of a bridge's concrete)
        for (const [from, to, ends] of clip(2)) {
            structures.push(rows[from].viaduct ? [RoadMesh.viaduct(rows, from, to, rows[from].viaduct, { lod, land: foot && foot.land ? foot.land : null, ends }), 'viaduct'] : [RoadMesh.bridge(rows, from, to, groundAt, guard, ends), 'bridge']);
            yield;
        }
        // With edge works the tunnels and bridges join their mesh (same material: the window counts meshes)
        const works = yield* RoadMesh.addEdgeWorksSteps(group, ribbon.sides, foot, structures.map(([parts]) => parts), roads);
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
        // The rows as drawn, each edge where the ribbon has it (tests/unit/world-far-edges.test.js reads them)
        group.userData.sides = ribbon.sides;
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
        const triangles = ribbon.triangles + (foot ? RoadMesh.addEdgeWorks(group, Object.assign(built.sides, { owner: guard ? guard.owner : -1 }), foot, built.parts) + TubeLining.addMeshes(group, built.lining) : 0);
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
// end, apron) may stand in another road's carriageway: RoadMesh's builders ask standsIn() before they lay one.
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
