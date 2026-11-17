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
// Rows are `{x, y, z, heading, width, bits}`, and may carry `s` (metres along the ride), `cls` (the swissTLM3D road
// class) and the styles RoadSurface.styles gives (`centre`, `left`, `right`) with `mouthL` and `mouthR`; `bits`
// carries the route flags. A heading turns right as it grows, and a lateral offset is positive to the right.
class RoadMesh {
    static get COLORS() {
        // The far ribbon is the mean of the near textures (worn alpine asphalt, the pale granite setts of the Via Tremola)
        const mean = RoadSurface.means();
        return {
            asphalt: mean.asphalt, cobbles: mean.setts, sideAsphalt: [0.37, 0.37, 0.37], concrete: [0.50, 0.50, 0.48],
            tunnel: [0.32, 0.31, 0.30], deck: [0.38, 0.37, 0.36], barrierRed: [0.78, 0.12, 0.10], barrierWhite: [0.92, 0.92, 0.90]
        };
    }

    // Metres above the road centre that the road surface sits
    static get LIFT_M() { return 0.02; }

    // The inside of a bend is held to this share of its radius
    static get INNER_SHARE() { return 0.9; }

    // Verge drawn past the edge on a bridge (inside the deck's overhang) and in a tunnel (up to the wall)
    static get BRIDGE_VERGE_M() { return 0.4; }
    static get TUNNEL_VERGE_M() { return 0.7; }

    // Structures are flat-lit vertex colour: one material for every tunnel, bridge, gate and stub structure
    static material() {
        if (!RoadMesh.sharedMaterial) {
            RoadMesh.sharedMaterial = LandShade.patch(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
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
                road.set([h, (row.bits & 8) !== 0 ? 1 : 0, row.centre ?? C.none, bridge || tunnel ? 1 : 0], at * 4);
                edge.set([row.left ?? 0, row.right ?? 0, row.mouthL ? 1 : 0, row.mouthR ? 1 : 0], at * 4);
            });
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
        return { geometry, triangles: index.length / 3, clamped, near: true };
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
        const laid = kept.map((row, k) => {
            const h = row.width / 2;
            const held = RoadMesh.hold([-h, h], curve[k]);
            if (held.clamped) clamped++;
            // A side road is seen from far off and from above: worn grey
            const c = (row.bits & 8) !== 0 ? colors.cobbles : side ? colors.sideAsphalt : colors.asphalt;
            return { offsets: held.offsets, c, row };
        });
        for (let k = 0; k + 1 < laid.length; k++) {
            const a = laid[k], b = laid[k + 1];
            const pa0 = RoadMesh.place(a.row, a.offsets[0]), pa1 = RoadMesh.place(a.row, a.offsets[1]);
            const pb0 = RoadMesh.place(b.row, b.offsets[0]), pb1 = RoadMesh.place(b.row, b.offsets[1]);
            const ya = a.row.y + RoadMesh.LIFT_M, yb = b.row.y + RoadMesh.LIFT_M;
            push(pa0.x, ya, pa0.z, a.c, a.row); push(pa1.x, ya, pa1.z, a.c, a.row); push(pb0.x, yb, pb0.z, a.c, b.row);
            push(pa1.x, ya, pa1.z, a.c, a.row); push(pb1.x, yb, pb1.z, a.c, b.row); push(pb0.x, yb, pb0.z, a.c, b.row);
        }
        return { geometry: RoadMesh.geometry(positions, shades), triangles: positions.length / 9, clamped, near: false };
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
    static quad(out, a, b, c, d, color) {
        for (const p of [a, b, c, a, c, d]) { out.positions.push(p[0], p[1], p[2]); out.shades.push(color[0], color[1], color[2]); }
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
            RoadMesh.box(out, mx, my - 0.5, mz, half * 2 + 1.2, 0.9, run + 0.05, heading, colors.deck);
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

    static structureMesh(parts, name) {
        if (!parts.positions.length) return null;
        return RoadMesh.mesh(RoadMesh.geometry(parts.positions, parts.shades), name);
    }

    // One section of the ride as a group: the ribbon at `lod` and, at LOD0 and LOD1, its structures.
    // rows: the ride's rows for the section, including one past each end so sections meet.
    static section(rows, lod, { groundAt = null, roof = 6.5 } = {}) {
        const group = new THREE.Group();
        group.name = 'world-road-section';
        const ribbon = RoadMesh.ribbon(rows, lod);
        group.add(RoadMesh.ribbonMesh(ribbon, 'road-ribbon'));
        let triangles = ribbon.triangles;
        const add = (parts, name) => {
            const mesh = RoadMesh.structureMesh(parts, name);
            if (mesh) {
                group.add(mesh);
                triangles += parts.positions.length / 9;
            }
        };
        for (const [from, to] of RoadMesh.runs(rows, 1 | 4)) if (to > from) add(RoadMesh.tunnel(rows, from, to, roof), 'tunnel');
        for (const [from, to] of RoadMesh.runs(rows, 2)) if (to > from) add(RoadMesh.bridge(rows, from, to, groundAt), 'bridge');
        group.userData.triangles = triangles;
        group.userData.clamped = ribbon.clamped;
        return group;
    }

    // A side road beyond the junction: the stub at LOD0 when `stub`, else the LOD1 ribbon. `holdY` keeps it under
    // the ride where it crosses the ride's road band (WorldEnvironment.sideHold)
    static sideRoad(rows, stub, holdY = null) {
        const group = new THREE.Group();
        group.name = stub ? 'world-road-stub' : 'world-road-side';
        const ribbon = RoadMesh.ribbon(rows, stub ? 0 : 1, holdY, true);
        group.add(RoadMesh.ribbonMesh(ribbon, 'road-side'));
        group.userData.triangles = ribbon.triangles;
        return group;
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
            scale.set(Math.max(4, p.width + 1), 1, 1);
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
