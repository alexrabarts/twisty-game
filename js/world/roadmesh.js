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
//   side roads:          a 60 m stub that ends in a road-closed barrier, and
//                        LOD1 ribbons beyond it (D7 c)
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
    static ribbon(rows, lod = 0, holdY = null, side = false) {
        return lod === 0 ? RoadMesh.nearRibbon(rows, holdY) : RoadMesh.farRibbon(rows, holdY, side);
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
    // road is not flat
    static nearRibbon(rows, holdY) {
        const curve = RoadMesh.curvature(rows);
        const C = RoadSurface.CENTRE;
        const styled = rows.length && rows[0].centre !== undefined ? rows : RoadSurface.styles(rows).map((style, i) => ({ ...rows[i], ...style }));
        // Metres along: the ride's own s, else measured from the first row; the UV restarts at a multiple of PERIOD_M
        const along = [];
        rows.forEach((row, i) => along.push(row.s !== undefined ? row.s : i === 0 ? 0 : along[i - 1] + Math.hypot(row.x - rows[i - 1].x, row.z - rows[i - 1].z)));
        const period = RoadSurface.PERIOD_M;
        const base = rows.length ? Math.floor(along[0] / period) : 0;
        const n = rows.length;
        const W = 7;
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
            const held = RoadMesh.hold([-h - verge, -h, -h / 2, 0, h / 2, h, h + verge], curve[k]);
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
                edge.set([row.left ?? 0, row.right ?? 0, row.mouthL ? 1 : 0, row.mouthR ? 1 : 0], at * 4);
            });
            const l = k * W * 3, r = (k * W + W - 1) * 3;
            const at = c => [positions[c], positions[c + 1], positions[c + 2]];
            sides.push({ bits: row.bits, l: at(l), r: at(r), lc: at(l + 3), rc: at(r - 3) });
        });
        const index = [];
        for (let k = 0; k + 1 < n; k++) {
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
        return { geometry, triangles: index.length / 3, clamped, near: true, sides };
    }

    // LOD1: one flat-coloured strip, rows decimated
    static farRibbon(rows, holdY, side) {
        const colors = RoadMesh.COLORS;
        const kept = RoadMesh.decimate(rows);
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
        const sides = laid.map(({ offsets, row }) => {
            const y = row.y + RoadMesh.LIFT_M;
            const at = o => { const p = RoadMesh.place(row, o); return [p.x, holdY ? holdY(p.x, y, p.z, row) : y, p.z]; };
            return { bits: row.bits, l: at(offsets[0]), r: at(offsets[1]) };
        });
        for (let k = 0; k + 1 < laid.length; k++) {
            const a = laid[k], b = laid[k + 1];
            const pa0 = RoadMesh.place(a.row, a.offsets[0]), pa1 = RoadMesh.place(a.row, a.offsets[1]);
            const pb0 = RoadMesh.place(b.row, b.offsets[0]), pb1 = RoadMesh.place(b.row, b.offsets[1]);
            const ya = a.row.y + RoadMesh.LIFT_M, yb = b.row.y + RoadMesh.LIFT_M;
            push(pa0.x, ya, pa0.z, a.c, a.row); push(pa1.x, ya, pa1.z, a.c, a.row); push(pb0.x, yb, pb0.z, b.c, b.row);
            push(pa1.x, ya, pa1.z, a.c, a.row); push(pb1.x, yb, pb1.z, b.c, b.row); push(pb0.x, yb, pb0.z, b.c, b.row);
        }
        return { geometry: RoadMesh.geometry(positions, shades), triangles: positions.length / 9, clamped, near: false, sides };
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
        for (const f of [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]]) RoadMesh.quad(out, v[f[0]], v[f[1]], v[f[2]], v[f[3]], color);
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

    // A tube round the road over a tunnel or gallery run, with a portal frame at each end
    static tunnel(rows, from, to, roof) {
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
        for (const row of [rows[from], rows[to]]) {
            const w = row.width + 3.2;
            const post = (w / 2 + 0.3);
            RoadMesh.box(out, row.x, row.y + roof + 0.6, row.z, w + 1.2, 1.2, 1.4, row.heading, colors.concrete);
            for (const sign of [-1, 1]) {
                RoadMesh.box(out, row.x + sign * post * Math.cos(row.heading), row.y + roof / 2, row.z - sign * post * Math.sin(row.heading), 0.6, roof, 1.4, row.heading, colors.concrete);
            }
        }
        return out;
    }

    // A deck under the road, parapets either side and a pier every 24 m down to the ground
    static bridge(rows, from, to, groundAt) {
        const out = { positions: [], shades: [] };
        const colors = RoadMesh.COLORS;
        let sincePier = 24;
        for (let i = from; i < to; i++) {
            const a = rows[i], b = rows[i + 1];
            const run = Math.hypot(b.x - a.x, b.z - a.z);
            const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, my = (a.y + b.y) / 2;
            const heading = Math.atan2(b.x - a.x, b.z - a.z);
            const half = (a.width + b.width) / 4;
            // The deck box is level: held under the lower of the segment's two ends, so on a grade its top never shows through the road
            RoadMesh.box(out, mx, my - 0.5 - Math.abs(b.y - a.y) / 2, mz, half * 2 + 1.2, 0.9, run + 0.05, heading, colors.deck);
            for (const sign of [-1, 1]) {
                const o = sign * (half + 0.35);
                RoadMesh.box(out, mx + o * Math.cos(heading), my + 0.55, mz - o * Math.sin(heading), 0.3, 1.1, run + 0.05, heading, colors.concrete);
            }
            sincePier += run;
            if (sincePier >= 24) {
                sincePier = 0;
                const floor = groundAt ? groundAt(mx, mz) : my - 12;
                const height = my - 0.95 - floor;
                if (height > 1) RoadMesh.box(out, mx, floor + height / 2, mz, Math.min(3, half), height, 2, heading, colors.concrete);
            }
        }
        return out;
    }

    // What hangs from each drawn edge of a ribbon. `sides` are its rows' edge points ({bits, l, r}, ribbon.sides);
    // `foot(x, y, z, ox, oz)` (WorldEnvironment.edgeFoot) says what the edge point (x, y, z), facing out along (ox, oz),
    // stands on: null (the land meets it), {kind: 'apron', y} (land lower down: a slope at BATTER to y),
    // {kind: 'wall', y} (a retaining wall down to y) or {kind: 'deck'} (a lower road under the edge). A segment takes
    // the stronger kind of its two ends (deck, wall, apron). Rows with a structure bit take none.
    // Returns {apron, wall, stone}: position and colour lists; `stone` holds the retaining walls and their parapets
    // (RoadMesh.stoneMaterial), `wall` the decks, soffits and their parapets.
    static edgeWorks(sides, foot = null) {
        const apron = { positions: [], shades: [] }, wall = { positions: [], shades: [] }, stone = { positions: [], shades: [] };
        const colors = RoadMesh.COLORS;
        const rank = { apron: 1, wall: 2, deck: 3 };
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
                return { kind: f.kind, y, out: out[key], color: f.color || null };
            };
            return { l: read('l'), r: read('r') };
        });
        const parapet = (out, pa, pb, o, color) => {
            const run = Math.hypot(pb[0] - pa[0], pb[2] - pa[2]);
            if (run < 1e-3) return;
            const heading = Math.atan2(pb[0] - pa[0], pb[2] - pa[2]);
            const w = RoadMesh.PARAPET_W_M, h = RoadMesh.PARAPET_H_M;
            const mx = (pa[0] + pb[0]) / 2 - (o[0] * w) / 2, mz = (pa[2] + pb[2]) / 2 - (o[1] * w) / 2;
            RoadMesh.box(out, mx, (pa[1] + pb[1]) / 2 + h / 2, mz, w, h, run + 0.02, heading, color);
        };
        // The kind each segment takes on each side (null for none), so a wall knows where its run ends
        const kindOf = (k, key) => {
            const ea = ends[k], eb = ends[k + 1];
            if (!ea || !eb || (!ea[key] && !eb[key])) return null;
            return [ea[key], eb[key]].filter(Boolean).reduce((best, f) => (rank[f.kind] > rank[best] ? f.kind : best), 'apron');
        };
        for (let k = 0; k + 1 < sides.length; k++) {
            const ea = ends[k], eb = ends[k + 1];
            if (!ea || !eb) continue;
            let soffit = false;
            for (const key of ['l', 'r']) {
                const fa = ea[key], fb = eb[key];
                if (!fa && !fb) continue;
                const kind = kindOf(k, key);
                const pa = sides[k][key], pb = sides[k + 1][key];
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
                    if (ca && cb) RoadMesh.quad(apron, under(ca), under(cb), under(pb), under(pa), [topColor(fa), topColor(fb), topColor(fb), topColor(fa)]);
                    // Then from the verge's edge out and down at the batter to the land's height, in strips no longer
                    // than APRON_STRIP_M along the edge, so no apron triangle grows into a large flat face
                    const foot = (f, p) => { const y = low(f, p), run = Math.max(0, p[1] - RoadMesh.APRON_UNDER_M - y) / RoadMesh.BATTER; return [p[0] + o[0] * run, Math.min(y, p[1] - RoadMesh.APRON_UNDER_M), p[2] + o[1] * run]; };
                    const ta = under(pa), tb = under(pb), fA = foot(fa, pa), fB = foot(fb, pb);
                    const strips = Math.max(1, Math.ceil(Math.hypot(tb[0] - ta[0], tb[2] - ta[2]) / RoadMesh.APRON_STRIP_M));
                    const lerp = (u, v, t) => u.map((c, i) => c + (v[i] - c) * t);
                    for (let n = 0; n < strips; n++) {
                        const t0 = n / strips, t1 = (n + 1) / strips;
                        RoadMesh.quad(apron, lerp(ta, tb, t0), lerp(ta, tb, t1), lerp(fA, fB, t1), lerp(fA, fB, t0),
                            [lerp(topColor(fa), topColor(fb), t0), lerp(topColor(fa), topColor(fb), t1), lerp(footColor(fa), footColor(fb), t1), lerp(footColor(fa), footColor(fb), t0)]);
                    }
                    continue;
                }
                // A wall's end with no wall foot of its own takes the run's: it reaches the land (buried in it where
                // the land meets the edge) and never ends hanging over the drop
                const runFoot = Math.min(...[fa, fb].filter(f => f && f.kind === kind).map(f => f.y));
                const depth = (f, p) => (kind === 'deck' ? p[1] - RoadMesh.DECK_M : Math.min(f && f.kind === kind ? f.y : runFoot, p[1] - RoadMesh.DECK_M));
                // The wall's face follows the road's grade at the top and the land (or the lower road) at the foot
                const out = kind === 'deck' ? wall : stone;
                RoadMesh.quad(out, pa, pb, [pb[0], depth(fb, pb), pb[2]], [pa[0], depth(fa, pa), pa[2]], kind === 'deck' ? colors.deck : colors.stone);
                // Each end of a retaining wall's run returns under the road (WALL_RETURN_M), a solid end down to its foot
                // and not a sheet seen edge-on
                if (kind === 'wall') {
                    const cap = (p, d) => {
                        const q = [p[0] - o[0] * RoadMesh.WALL_RETURN_M, p[1], p[2] - o[1] * RoadMesh.WALL_RETURN_M];
                        RoadMesh.quad(stone, p, q, [q[0], d, q[2]], [p[0], d, p[2]], colors.stone);
                    };
                    if (kindOf(k - 1, key) !== 'wall') cap(pa, depth(fa, pa));
                    if (kindOf(k + 1, key) !== 'wall') cap(pb, depth(fb, pb));
                }
                if (kind === 'deck' || Math.max(pa[1] - depth(fa, pa), pb[1] - depth(fb, pb)) >= RoadMesh.PARAPET_DROP_M) parapet(out, pa, pb, o, kind === 'deck' ? colors.concrete : colors.stone);
                if (kind === 'deck') soffit = true;
            }
            // Under an overhanging edge: the soffit, from one edge to the other at the deck's depth
            if (soffit) {
                const under = p => [p[0], p[1] - RoadMesh.DECK_M, p[2]];
                RoadMesh.quad(wall, under(sides[k].l), under(sides[k + 1].l), under(sides[k + 1].r), under(sides[k].r), colors.deck);
            }
        }
        return { apron, wall, stone };
    }

    // The edge works of a ribbon as one mesh, added to `group` ('road-works': the apron in the land's material
    // (group 0), decks and the extra structures in the structures' (1), retaining walls and their parapets in stone
    // (2)): the triangles they cost. Any group but 0 is a structure, not ground
    // `sides` may be a list of rows' sides, or a list of such lists (several roads in one mesh: the side roads of a chunk)
    // `extra` are structure parts ({positions, shades}, sRGB) drawn in the same mesh when it is made at all.
    static addEdgeWorks(group, sides, foot, extra = []) {
        const runs = sides.length && Array.isArray(sides[0]) ? sides : [sides];
        const works = { apron: { positions: [], shades: [] }, wall: { positions: [], shades: [] }, stone: { positions: [], shades: [] } };
        for (const run of runs) {
            const part = RoadMesh.edgeWorks(run, foot);
            for (const key of ['apron', 'wall', 'stone']) { works[key].positions.push(...part[key].positions); works[key].shades.push(...part[key].shades); }
        }
        if (!works.apron.positions.length && !works.wall.positions.length && !works.stone.positions.length && !extra.some(part => part.positions.length)) return 0;
        for (const part of extra) { works.wall.positions.push(...part.positions); works.wall.shades.push(...part.shades); }
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

    // Every road keeps the ride's rule: a surface more than PARAPET_DROP_M over the land under it stands on a structure.
    // A side row flagged bridge, or that high over the land at its centre or at both edges, rides on a deck (sides
    // from its edges, a soffit under it, parapets and a pier every 24 m down to the land); a tunnel or gallery row gets
    // a tube. `sides` are the ribbon's rows' edges ({bits, l, r}, ribbon.sides); `groundAt(x, z)` is the drawn land,
    // null where it is not known. Returns {parts, sides}: the structures ({positions, shades}, sRGB) and the sides with
    // the bridge bit on every decked row, so the edge works leave those to the deck
    static sideStructures(sides, groundAt = null, roof = 6.5, footAt = null) {
        const out = { positions: [], shades: [] };
        const colors = RoadMesh.COLORS;
        const drop = RoadMesh.PARAPET_DROP_M;
        const gap = p => {
            const g = groundAt ? groundAt(p[0], p[2]) : null;
            return Number.isFinite(g) ? p[1] - g : 0;
        };
        const raised = sides.map(side => {
            if (side.bits & 2) return true;
            if (side.bits & 5) return false;
            const c = [(side.l[0] + side.r[0]) / 2, (side.l[1] + side.r[1]) / 2, (side.l[2] + side.r[2]) / 2];
            return gap(c) > drop || (gap(side.l) > drop && gap(side.r) > drop);
        });
        // The deck reaches one row past each raised run, onto the abutment
        const decked = raised.map((on, k) => on || (raised[k - 1] && !(sides[k].bits & 5)) || (raised[k + 1] && !(sides[k].bits & 5)));
        const down = (p, m) => [p[0], p[1] - m, p[2]];
        const parapet = (pa, pb, inward) => {
            const run = Math.hypot(pb[0] - pa[0], pb[2] - pa[2]);
            if (run < 1e-3) return;
            const heading = Math.atan2(pb[0] - pa[0], pb[2] - pa[2]);
            const w = RoadMesh.PARAPET_W_M, h = RoadMesh.PARAPET_H_M;
            RoadMesh.box(out, (pa[0] + pb[0]) / 2 + (inward[0] * w) / 2, (pa[1] + pb[1]) / 2 + h / 2, (pa[2] + pb[2]) / 2 + (inward[1] * w) / 2, w, h, run + 0.02, heading, colors.concrete);
        };
        let sincePier = 24;
        const piers = [];
        for (let k = 0; k + 1 < sides.length; k++) {
            const a = sides[k], b = sides[k + 1];
            const run = Math.hypot((a.l[0] + a.r[0] - b.l[0] - b.r[0]) / 2, (a.l[2] + a.r[2] - b.l[2] - b.r[2]) / 2);
            if (a.bits & b.bits & 5) {
                const up = p => [p[0], p[1] + roof, p[2]];
                RoadMesh.quad(out, a.l, b.l, up(b.l), up(a.l), colors.tunnel);
                RoadMesh.quad(out, b.r, a.r, up(a.r), up(b.r), colors.tunnel);
                RoadMesh.quad(out, up(a.l), up(b.l), up(b.r), up(a.r), colors.tunnel);
                continue;
            }
            if (!(decked[k] && decked[k + 1])) { sincePier = 24; continue; }
            const D = RoadMesh.DECK_M, top = 0.02;
            RoadMesh.quad(out, down(a.l, top), down(b.l, top), down(b.l, D), down(a.l, D), colors.deck);
            RoadMesh.quad(out, down(b.r, top), down(a.r, top), down(a.r, D), down(b.r, D), colors.deck);
            RoadMesh.quad(out, down(a.l, D), down(b.l, D), down(b.r, D), down(a.r, D), colors.deck);
            const across = [a.r[0] - a.l[0], a.r[2] - a.l[2]];
            const len = Math.hypot(across[0], across[1]) || 1;
            parapet(a.l, b.l, [across[0] / len, across[1] / len]);
            parapet(a.r, b.r, [-across[0] / len, -across[1] / len]);
            sincePier += run;
            if (sincePier >= 24) {
                sincePier = 0;
                const mx = (a.l[0] + a.r[0] + b.l[0] + b.r[0]) / 4, mz = (a.l[2] + a.r[2] + b.l[2] + b.r[2]) / 4, my = (a.l[1] + a.r[1] + b.l[1] + b.r[1]) / 4;
                const heading = Math.atan2(b.l[0] + b.r[0] - a.l[0] - a.r[0], b.l[2] + b.r[2] - a.l[2] - a.r[2]);
                // The pier's foot: the lowest land under any corner of it, at any level of detail the tile is drawn
                // at, and PIER_SINK_M into it, so it never stands on air beside a coarse triangle
                const w = RoadMesh.PIER_W_M, dz = RoadMesh.PIER_D_M;
                const fs = Math.sin(heading), fc = Math.cos(heading);
                let floor = Infinity;
                for (const [u, v] of [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
                    const x = mx + (u * w / 2) * fc + (v * dz / 2) * fs, z = mz - (u * w / 2) * fs + (v * dz / 2) * fc;
                    const f = (footAt || groundAt) ? (footAt || groundAt)(x, z) : null;
                    if (Number.isFinite(f)) floor = Math.min(floor, f);
                }
                if (!Number.isFinite(floor)) continue;
                floor -= RoadMesh.PIER_SINK_M;
                const height = my - D - floor;
                if (height > 1) {
                    RoadMesh.box(out, mx, floor + height / 2, mz, w, height, dz, heading, colors.concrete);
                    piers.push({ x: mx, z: mz, top: my - D, foot: floor, width: w, depth: dz, heading });
                }
            }
        }
        return { parts: out.positions.length ? [out] : [], piers, sides: sides.map((side, k) => (decked[k] ? { ...side, bits: side.bits | 2 } : side)) };
    }

    static structureMesh(parts, name) {
        if (!parts.positions.length) return null;
        return RoadMesh.mesh(RoadMesh.geometry(parts.positions, parts.shades), name);
    }

    // One section of the ride as a group: the ribbon at `lod` and, at LOD0 and LOD1, its structures.
    // rows: the ride's rows for the section, including one past each end so sections meet.
    static section(rows, lod, { groundAt = null, roof = 6.5, foot = null } = {}) {
        const group = new THREE.Group();
        group.name = 'world-road-section';
        const ribbon = RoadMesh.ribbon(rows, lod);
        group.add(RoadMesh.ribbonMesh(ribbon, 'road-ribbon'));
        let triangles = ribbon.triangles;
        const structures = [];
        for (const [from, to] of RoadMesh.runs(rows, 1 | 4)) if (to > from) structures.push([RoadMesh.tunnel(rows, from, to, roof), 'tunnel']);
        for (const [from, to] of RoadMesh.runs(rows, 2)) if (to > from) structures.push([RoadMesh.bridge(rows, from, to, groundAt), 'bridge']);
        // With edge works the tunnels and bridges join their mesh (same material: the window counts meshes)
        const works = RoadMesh.addEdgeWorks(group, ribbon.sides, foot, structures.map(([parts]) => parts));
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
    static sideRoad(rows, stub, holdY = null, foot = null, { groundAt = null, footAt = null, roof = 6.5 } = {}) {
        const group = new THREE.Group();
        group.name = stub ? 'world-road-stub' : 'world-road-side';
        const ribbon = RoadMesh.ribbon(rows, stub ? 0 : 1, holdY, true);
        group.add(RoadMesh.ribbonMesh(ribbon, 'road-side'));
        const built = RoadMesh.sideStructures(ribbon.sides, groundAt, roof, footAt);
        // Without a foot the edge works and structures are left to the caller, which draws those of many side roads as one mesh
        const triangles = ribbon.triangles + (foot ? RoadMesh.addEdgeWorks(group, built.sides, foot, built.parts) : 0);
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
            const index = [];
            let base = 0;
            for (const g of list) {
                if (g.index) for (let i = 0; i < g.index.count; i++) index.push(g.index.getX(i) + base);
                else for (let i = 0; i < g.attributes.position.count; i++) index.push(i + base);
                base += g.attributes.position.count;
            }
            out.setIndex(index);
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
