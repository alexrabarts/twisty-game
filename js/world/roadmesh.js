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
    // How far a retaining wall's end returns under the road
    static get WALL_RETURN_M() { return 0.6; }
    static get PARAPET_H_M() { return 0.8; }
    // A retaining wall carries its parapet only where it drops this far (WorldPhysics.dropDepthM: the physics makes
    // a drop solid from the same depth, so what is drawn and what is solid agree); a lower step is ridden off
    static get PARAPET_DROP_M() { return 2.5; }

    // The apron's colour where no land colour is known: the land's grass, linear
    static get APRON_LINEAR() { return RoadMesh.COLORS.apron.map(v => Math.pow(v, 2.2)); }

    // The apron is land: lit as the land is, and pushed back in depth so the land wins where the two lie together
    static apronMaterial() {
        if (!RoadMesh.sharedApron) {
            RoadMesh.sharedApron = LandShade.patch(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 4 }), { detail: true });
        }
        return RoadMesh.sharedApron;
    }

    // A retaining wall and its parapet: the land's lighting with dry-stone courses drawn in the shader (LandShade
    // `stone`), so the wall reads as the Tremola's granite masonry and not as a grey slab, at no cost in triangles
    static stoneMaterial() {
        if (!RoadMesh.sharedStone) {
            RoadMesh.sharedStone = LandShade.patch(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), { stone: true });
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

    // The edge points of a side road's LOD0 ribbon (nearRibbon's `sides`: the verge's outer edge `l`, `r`, the
    // carriageway's `lc`, `rc`) without building it, for the road's structures and edge works (WorldEnvironment.buildSide)
    static vergeSides(rows, holdY = null) {
        const kept = RoadMesh.decimate(rows, RoadMesh.SIDE_ROW_M, RoadMesh.SIDE_TURN);
        const curve = RoadMesh.curvature(kept);
        return kept.map((row, k) => {
            const h = row.width / 2;
            const bridge = (row.bits & 2) !== 0, tunnel = (row.bits & 5) !== 0;
            const verge = bridge ? RoadMesh.BRIDGE_VERGE_M : tunnel ? RoadMesh.TUNNEL_VERGE_M : RoadSurface.VERGE_M;
            const o = RoadMesh.hold([-h - verge, -h, h, h + verge], curve[k]).offsets;
            const y = row.y + RoadMesh.LIFT_M;
            const at = offset => { const p = RoadMesh.place(row, offset); return [p.x, holdY ? holdY(p.x, y, p.z, row) : y, p.z]; };
            return { bits: row.bits, l: at(o[0]), r: at(o[3]), lc: at(o[1]), rc: at(o[2]) };
        });
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
        let clamped = 0;
        const sides = [];
        const sett = RoadMesh.feather(rows, along, row => (row.bits & 8) !== 0);
        const built = RoadMesh.feather(rows, along, row => (row.bits & 7) !== 0);
        styled.forEach((row, k) => {
            const h = row.width / 2;
            const bridge = (row.bits & 2) !== 0, tunnel = (row.bits & 5) !== 0;
            const verge = bridge ? RoadMesh.BRIDGE_VERGE_M : tunnel ? RoadMesh.TUNNEL_VERGE_M : RoadSurface.VERGE_M;
            const held = RoadMesh.hold(side ? [-h - verge, -h, 0, h, h + verge] : [-h - verge, -h, -h / 2, 0, h / 2, h, h + verge], curve[k]);
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
                // Across a side road's mouth a continuous edge line is broken (RoadSurface.MARKINGS.mouth)
                const brokenAt = (line, mouth) => (mouth && line === RoadSurface.EDGE.solid ? RoadSurface.EDGE.broken : line ?? 0);
                edge.set([brokenAt(row.left, row.mouthL), brokenAt(row.right, row.mouthR), row.mouthL ? 1 : 0, row.mouthR ? 1 : 0], at * 4);
            });
            const l = k * W * 3, r = (k * W + W - 1) * 3;
            const at = c => [positions[c], positions[c + 1], positions[c + 2]];
            sides.push({ bits: row.bits, l: at(l), r: at(r), lc: at(l + 3), rc: at(r - 3) });
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
            const bridge = (row.bits & 2) !== 0, tunnel = (row.bits & 5) !== 0;
            const v = bridge ? RoadMesh.BRIDGE_VERGE_M : tunnel ? RoadMesh.TUNNEL_VERGE_M : RoadSurface.VERGE_M;
            const h = row.width / 2;
            const held = RoadMesh.hold([-h - v, h + v], curve[k]).offsets;
            return { bits: row.bits, l: at(held[0]), r: at(held[1]), lc: at(offsets[0]), rc: at(offsets[1]) };
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
        // front-side material (signposts, barriers) lights the face the viewer sees
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

    // A parapet swept along a run of edge points: `points` are the tops of the road's edge ([x, y, z]), `outward` the unit
    // plan direction out of the road at each (shared by the segments either side, so the run has no step or gap at a
    // row), and the parapet stands on the last `w` metres inside each point, `h` high. Inner face, coping and outer face,
    // a cap at each end (`caps`: [start, end], false where the rail goes on in a neighbouring mesh, whose cap would lie
    // in the same plane), no underside: it sits on the road, and a face there would lie in the ribbon's plane
    static rail(out, points, outward, w, h, color, caps = [true, true]) {
        if (points.length < 2) return;
        const at = (k, inset, up) => [points[k][0] - outward[k][0] * inset, points[k][1] + up, points[k][2] - outward[k][1] * inset];
        for (let k = 0; k + 1 < points.length; k++) {
            RoadMesh.quad(out, at(k, w, 0), at(k + 1, w, 0), at(k + 1, w, h), at(k, w, h), color);
            RoadMesh.quad(out, at(k, w, h), at(k + 1, w, h), at(k + 1, 0, h), at(k, 0, h), color);
            RoadMesh.quad(out, at(k + 1, 0, 0), at(k, 0, 0), at(k, 0, h), at(k + 1, 0, h), color);
        }
        const last = points.length - 1;
        if (caps[0]) RoadMesh.quad(out, at(0, 0, 0), at(0, w, 0), at(0, w, h), at(0, 0, h), color);
        if (caps[1]) RoadMesh.quad(out, at(last, w, 0), at(last, 0, 0), at(last, 0, h), at(last, w, h), color);
    }

    // Runs of consecutive parapet segments ({k, pa, pb, o, drawn}) joined at shared rows into rails (RoadMesh.rail).
    // Only the `drawn` segments are laid (a neighbouring section lays the rest); a run's end takes a cap only where the
    // run really ends, not where it goes on into a segment another section lays
    static rails(out, segments, w, h, color) {
        let run = null;
        const flush = () => {
            if (!run) return;
            const outward = run.points.map((_, i) => {
                const a = run.o[Math.max(0, i - 1)], b = run.o[Math.min(run.o.length - 1, i)];
                const x = a[0] + b[0], z = a[1] + b[1], len = Math.hypot(x, z) || 1;
                return [x / len, z / len];
            });
            const first = run.drawn.indexOf(true), last = run.drawn.lastIndexOf(true);
            if (first >= 0) RoadMesh.rail(out, run.points.slice(first, last + 2), outward.slice(first, last + 2), w, h, color, [first === 0, last === run.drawn.length - 1]);
            run = null;
        };
        for (const seg of segments) {
            const joined = run && run.k === seg.k - 1 && Math.hypot(run.points[run.points.length - 1][0] - seg.pa[0], run.points[run.points.length - 1][2] - seg.pa[2]) < 1e-6;
            if (!joined) {
                flush();
                run = { k: seg.k, points: [seg.pa], o: [], drawn: [] };
            }
            run.points.push(seg.pb);
            run.o.push(seg.o);
            run.drawn.push(seg.drawn !== false);
            run.k = seg.k;
        }
        flush();
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
        const apron = { positions: [], shades: [] }, wall = { positions: [], shades: [] }, stone = { positions: [], shades: [] };
        const colors = RoadMesh.COLORS;
        const rank = { apron: 1, wall: 2, deck: 3 };
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
        const ends = sides.map(side => {
            if (side.bits & 7) return null;
            const dx = side.l[0] - side.r[0], dz = side.l[2] - side.r[2];
            const len = Math.hypot(dx, dz) || 1;
            const out = { l: [dx / len, dz / len], r: [-dx / len, -dz / len] };
            const read = key => {
                const p = side[key];
                const f = foot ? foot(p[0], p[1], p[2], out[key][0], out[key][1]) : null;
                if (!f) return null;
                const y = Number.isFinite(f.y) ? Math.max(p[1] - RoadMesh.DROP_MAX_M, Math.min(p[1] - 0.05, f.y)) : p[1] - RoadMesh.DECK_M;
                const end = { kind: f.kind, y, out: out[key], color: f.color || null, top: f.top || null, at: p, run: Number.isFinite(f.run) ? f.run : null };
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
            return { l: read('l'), r: read('r') };
        });
        // A segment whose two ends clear every other carriageway can still cut across one between them (a side road's
        // edge beside the ride's at a junction): its works are tested every metre along it
        const between = (k, key) => {
            const fa = ends[k][key], fb = ends[k + 1][key];
            if (!guard) return true;
            const pa = fa ? fa.at : sides[k][key], pb = fb ? fb.at : sides[k + 1][key];
            const f = fa || fb;
            const n = Math.floor(Math.hypot(pb[0] - pa[0], pb[2] - pa[2]));
            for (let i = 1; i <= n; i++) {
                const t = i / (n + 1);
                if (depthAt([pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t, pa[2] + (pb[2] - pa[2]) * t], { ...f, y: fa && fb ? fa.y + (fb.y - fa.y) * t : f.y }, f.out) !== null) return false;
            }
            return true;
        };
        // The kind each segment takes on each side (null for none), so a wall knows where its run ends
        const kinds = { l: [], r: [] };
        const kindOf = (k, key) => {
            if (k < 0 || k + 1 >= sides.length) return null;
            if (kinds[key][k] !== undefined) return kinds[key][k];
            const ea = ends[k], eb = ends[k + 1];
            let kind = null;
            if (ea && eb && (ea[key] || eb[key]) && !(ea[key] && ea[key].blocked) && !(eb[key] && eb[key].blocked) && between(k, key)) {
                kind = [ea[key], eb[key]].filter(Boolean).reduce((best, f) => (rank[f.kind] > rank[best] ? f.kind : best), 'apron');
            }
            kinds[key][k] = kind;
            return kind;
        };
        const rails = { stone: { l: [], r: [] }, wall: { l: [], r: [] } };
        // Rows outside `sides.draw` belong to the neighbouring sections: read for the runs, drawn by those sections
        const [drawFrom, drawTo] = sides.draw || [0, sides.length - 1];
        const junk = { positions: [], shades: [] };
        for (let k = 0; k + 1 < sides.length; k++) {
            const ea = ends[k], eb = ends[k + 1];
            if (!ea || !eb) continue;
            const drawn = k >= drawFrom && k < drawTo;
            const apronOut = drawn ? apron : junk, wallOut = drawn ? wall : junk, stoneOut = drawn ? stone : junk;
            let soffit = false;
            for (const key of ['l', 'r']) {
                const kind = kindOf(k, key);
                if (!kind) continue;
                const fa = ea[key], fb = eb[key];
                const pa = fa ? fa.at : sides[k][key], pb = fb ? fb.at : sides[k + 1][key];
                const o = (fa || fb).out;
                const low = (f, p) => (f ? f.y : p[1] - 0.05);
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
                    if (ca && cb && !overOther) RoadMesh.quad(apronOut, under(ca), under(cb), under(pb), under(pa), [topColor(fa), topColor(fb), topColor(fb), topColor(fa)]);
                    // Then from the verge's edge out and down at the batter to the land's height, in strips no longer
                    // than APRON_STRIP_M along the edge, so no apron triangle grows into a large flat face
                    const foot = (f, p) => { const y = low(f, p), run = f ? RoadMesh.apronRun(f, p) : 0; return [p[0] + o[0] * run, Math.min(y, p[1] - RoadMesh.APRON_UNDER_M), p[2] + o[1] * run]; };
                    const ta = under(pa), tb = under(pb), fA = foot(fa, pa), fB = foot(fb, pb);
                    const strips = Math.max(1, Math.ceil(Math.hypot(tb[0] - ta[0], tb[2] - ta[2]) / RoadMesh.APRON_STRIP_M));
                    const lerp = (u, v, t) => u.map((c, i) => c + (v[i] - c) * t);
                    // and down the slope in rows no longer than APRON_STRIP_M * 4 (a foot on land far under the edge
                    // makes a long face, RoadMesh.apronRun)
                    const fall = Math.max(Math.hypot(fA[0] - ta[0], fA[1] - ta[1], fA[2] - ta[2]), Math.hypot(fB[0] - tb[0], fB[1] - tb[1], fB[2] - tb[2]));
                    const rows = Math.max(1, Math.ceil(fall / (RoadMesh.APRON_STRIP_M * 4)));
                    for (let n = 0; n < strips; n++) {
                        const t0 = n / strips, t1 = (n + 1) / strips;
                        const top0 = lerp(ta, tb, t0), top1 = lerp(ta, tb, t1), foot0 = lerp(fA, fB, t0), foot1 = lerp(fA, fB, t1);
                        const c0 = lerp(topColor(fa), topColor(fb), t0), c1 = lerp(topColor(fa), topColor(fb), t1), d0 = lerp(footColor(fa), footColor(fb), t0), d1 = lerp(footColor(fa), footColor(fb), t1);
                        for (let r = 0; r < rows; r++) {
                            const u0 = r / rows, u1 = (r + 1) / rows;
                            RoadMesh.quad(apronOut, lerp(top0, foot0, u0), lerp(top1, foot1, u0), lerp(top1, foot1, u1), lerp(top0, foot0, u1), [lerp(c0, d0, u0), lerp(c1, d1, u0), lerp(c1, d1, u1), lerp(c0, d0, u1)]);
                        }
                    }
                    continue;
                }
                // A wall's end with no wall foot of its own takes the run's: it reaches the land (buried in it where
                // the land meets the edge) and never ends hanging over the drop
                const runFoot = Math.min(...[fa, fb].filter(f => f && f.kind === kind).map(f => f.y));
                const depth = (f, p) => (kind === 'deck' ? p[1] - RoadMesh.DECK_M : Math.min(f && f.kind === kind ? f.y : runFoot, p[1] - RoadMesh.DECK_M));
                // The wall's face follows the road's grade at the top and the land (or the lower road) at the foot
                const out = kind === 'deck' ? wallOut : stoneOut;
                RoadMesh.quad(out, pa, pb, [pb[0], depth(fb, pb), pb[2]], [pa[0], depth(fa, pa), pa[2]], kind === 'deck' ? colors.deck : colors.stone);
                // Each end of a retaining wall's run returns under the road (WALL_RETURN_M), a solid end down to its foot
                // and not a sheet seen edge-on
                if (kind === 'wall') {
                    const cap = (p, d) => {
                        const q = [p[0] - o[0] * RoadMesh.WALL_RETURN_M, p[1], p[2] - o[1] * RoadMesh.WALL_RETURN_M];
                        RoadMesh.quad(stoneOut, p, q, [q[0], d, q[2]], [p[0], d, p[2]], colors.stone);
                    };
                    if (kindOf(k - 1, key) !== 'wall') cap(pa, depth(fa, pa));
                    if (kindOf(k + 1, key) !== 'wall') cap(pb, depth(fb, pb));
                }
                if (kind === 'deck' || Math.max(pa[1] - depth(fa, pa), pb[1] - depth(fb, pb)) >= RoadMesh.PARAPET_DROP_M) rails[kind === 'deck' ? 'wall' : 'stone'][key].push({ k, pa, pb, o, drawn });
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
            RoadMesh.rails(stone, rails.stone[key], W, H, colors.stone);
            RoadMesh.rails(wall, rails.wall[key], W, H, colors.concrete);
        }
        return { apron, wall, stone };
    }

    // The edge works of a ribbon as one mesh, added to `group` ('road-works': the apron in the land's material
    // (group 0), decks and the extra structures in the structures' (1), retaining walls and their parapets in stone
    // (2)): the triangles they cost. Any group but 0 is a structure, not ground
    // `sides` may be a list of rows' sides, or a list of such lists (several roads in one mesh: the side roads of a chunk)
    // `extra` are structure parts ({positions, shades}, sRGB) drawn in the same mesh when it is made at all.
    // `roads` (Carriageways) keeps each run's works out of every other road's carriageway (RoadMesh.edgeWorks guard)
    static addEdgeWorks(group, sides, foot, extra = [], roads = null) {
        const runs = sides.length && Array.isArray(sides[0]) ? sides : [sides];
        const works = { apron: { positions: [], shades: [] }, wall: { positions: [], shades: [] }, stone: { positions: [], shades: [] } };
        // The road each triangle belongs to (a run's or a part's `owner`: a side edge id, -1 for the ride), so a check
        // can tell a road's own structures from another road's
        const owners = { apron: [], wall: [], stone: [] };
        const own = (key, count, owner) => { for (let t = 0; t < count / 9; t++) owners[key].push(owner); };
        for (const run of runs) {
            const part = RoadMesh.edgeWorks(run, foot, roads ? roads.guard(run.owner ?? -1) : null);
            for (const key of ['apron', 'wall', 'stone']) {
                works[key].positions.push(...part[key].positions);
                works[key].shades.push(...part[key].shades);
                own(key, part[key].positions.length, run.owner ?? -1);
            }
        }
        if (!works.apron.positions.length && !works.wall.positions.length && !works.stone.positions.length && !extra.some(part => part.positions.length)) return 0;
        for (const part of extra) {
            works.wall.positions.push(...part.positions);
            works.wall.shades.push(...part.shades);
            own('wall', part.positions.length, part.owner ?? -1);
        }
        const apron = works.apron.positions.length / 3, wall = works.wall.positions.length / 3, stone = works.stone.positions.length / 3;
        // Every apron triangle faces up: a double-sided material flips the normal of a face seen from its back, and an
        // apron lit from underneath drew as a black line along the verge
        const ap = works.apron.positions, ash = works.apron.shades;
        for (let t = 0; t < ap.length; t += 9) {
            const ux = ap[t + 3] - ap[t], uz = ap[t + 5] - ap[t + 2], vx = ap[t + 6] - ap[t], vz = ap[t + 8] - ap[t + 2];
            if (uz * vx - ux * vz >= 0) continue;
            for (let k = 0; k < 3; k++) {
                [ap[t + 3 + k], ap[t + 6 + k]] = [ap[t + 6 + k], ap[t + 3 + k]];
                [ash[t + 3 + k], ash[t + 6 + k]] = [ash[t + 6 + k], ash[t + 3 + k]];
            }
        }
        // One colour space for the mesh: the apron's are the land's (linear), the walls' are made linear here
        const shades = works.apron.shades.concat(works.wall.shades.map(v => Math.pow(v, 2.2)), works.stone.shades.map(v => Math.pow(v, 2.2)));
        const geometry = RoadMesh.geometry(works.apron.positions.concat(works.wall.positions, works.stone.positions), shades);
        geometry.userData.linearColors = true;
        geometry.userData.owners = Int32Array.from(owners.apron.concat(owners.wall, owners.stone));
        geometry.addGroup(0, apron, 0);
        if (wall) geometry.addGroup(apron, wall, 1);
        if (stone) geometry.addGroup(apron + wall, stone, 2);
        // A wall is lit flat across each quad: its two triangles share the quad's normal, so no crease shows. The apron
        // is lit as the land round it is (straight up): lit as a slope it read as a dark seam along the verge
        RoadMesh.flatNormals(geometry, apron / 3);
        const normal = geometry.attributes.normal.array;
        for (let v = 0; v < apron; v++) { normal[v * 3] = 0; normal[v * 3 + 1] = 1; normal[v * 3 + 2] = 0; }
        const mesh = RoadMesh.mesh(geometry, 'road-works', [RoadMesh.apronMaterial(), RoadMesh.material(), RoadMesh.stoneMaterial()]);
        mesh.userData.world = 'works';
        group.add(mesh);
        return (apron + wall + stone) / 3;
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
            return gap(centre(side)) > drop || (gap(side.l) > drop && gap(side.r) > drop);
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
    static section(rows, lod, { groundAt = null, roof = 6.5, foot = null, roads = null, head = 0, tail = 0 } = {}) {
        const group = new THREE.Group();
        group.name = 'world-road-section';
        const first = head, last = rows.length - 1 - tail;
        const ribbon = RoadMesh.ribbon(rows, lod, null, false, [first, last]);
        ribbon.sides.draw = ribbon.draw;
        group.add(RoadMesh.ribbonMesh(ribbon, 'road-ribbon'));
        let triangles = ribbon.triangles;
        const structures = [];
        const guard = roads ? roads.guard(-1) : null;
        // A run clipped to the drawn rows; it ends where it really ends, not where it goes on into a neighbour
        const clip = mask => RoadMesh.runs(rows, mask).map(([from, to]) => [Math.max(from, first), Math.min(to, last), [from >= first, to <= last]]).filter(([from, to]) => to > from);
        for (const [from, to, ends] of clip(1 | 4)) structures.push([RoadMesh.tunnel(rows, from, to, roof, ends), 'tunnel']);
        for (const [from, to, ends] of clip(2)) structures.push([RoadMesh.bridge(rows, from, to, groundAt, guard, ends), 'bridge']);
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
        for (const x of [-0.46, 0.46]) RoadMesh.box(out, x, 0.6, 0, 0.08, 1.2, 0.08, 0, colors.barrierWhite);
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
    each(x, z, margin, fn) {
        const cell = Carriageways.HASH_M, route = this.route, near = this.near;
        const rideSeen = new Set(), sideSeen = new Set();
        // The ride's own hash (WorldRoute.buildHash), in its own cells
        const rc = WorldRoute.HASH_M;
        for (let cx = Math.floor((x - margin) / rc); cx <= Math.floor((x + margin) / rc); cx++) {
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
        const out = { owner, clear: (x, z, y0, y1, margin = 0) => this.standsIn(x, z, y0, y1, skip, margin) === null, depth: (x, z, y0, y1) => this.standsIn(x, z, y0, y1, skip, 0), ceiling };
        // The ride's retaining walls are solid where the physics says so (WorldGround.onRetainingWall reads the same
        // drop zone as edgeFoot), whatever is drawn: across a side road's mouth one stays drawn, or the rider would stop
        // at nothing
        if (owner < 0) out.walls = { depth: () => null };
        return out;
    }
}
