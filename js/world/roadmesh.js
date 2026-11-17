// RoadMesh: the road of a world as meshes. One vertex-coloured mesh per piece
// of road, so a section of the ride costs one draw call, plus a mesh for each
// structure on it.
//
//   LOD0 (within 400 m): a row every sample (4 m) with kerbs, edge lines and a
//                        centre line, and cobbles where the route says so
//   LOD1 (400 m to 1.5 km): a row every 16 m, or sooner in a bend, one strip of
//                        asphalt and no markings
//   hairpins:            the inside edge of a bend is held inside the bend's
//                        radius, so the ribbon never folds over itself where
//                        the road is as wide as the corner is tight; the held
//                        kerb is drawn as asphalt (the paved apron)
//   tunnels, galleries:  a tube round the road with a portal frame at each end
//   bridges:             a deck, parapets and piers
//   side roads:          a 60 m stub that ends in a road-closed barrier, and
//                        LOD1 ribbons beyond it (D7 c)
// Rows are `{x, y, z, heading, width, bits}`; `bits` carries the route flags.
// A heading turns right as it grows, and a lateral offset is positive to the right.
class RoadMesh {
    static get COLORS() {
        return {
            asphalt: [0.20, 0.20, 0.21], cobbles: [0.43, 0.40, 0.35], kerb: [0.55, 0.54, 0.52],
            edgeLine: [0.85, 0.85, 0.82], centreLine: [0.86, 0.72, 0.18], concrete: [0.50, 0.50, 0.48],
            tunnel: [0.32, 0.31, 0.30], deck: [0.38, 0.37, 0.36], barrierRed: [0.78, 0.12, 0.10], barrierWhite: [0.92, 0.92, 0.90]
        };
    }

    // Metres above the road centre that the markings sit
    static get LIFT_M() { return 0.02; }

    // The inside of a bend is held to this share of its radius
    static get INNER_SHARE() { return 0.9; }

    // A rider sees a flat-lit road: the surface material is shared by every road mesh
    static material() {
        if (!RoadMesh.sharedMaterial) {
            RoadMesh.sharedMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
        }
        return RoadMesh.sharedMaterial;
    }

    // Rows kept for a lower level of detail: one every `minM` metres of road, or sooner
    // where the heading has turned `maxTurn` radians since the last kept row
    static decimate(rows, minM = 16, maxTurn = 0.18) {
        if (rows.length < 3) return rows;
        const out = [rows[0]];
        let run = 0;
        let last = rows[0];
        for (let i = 1; i < rows.length; i++) {
            run += Math.hypot(rows[i].x - rows[i - 1].x, rows[i].z - rows[i - 1].z);
            if (i === rows.length - 1 || run >= minM || Math.abs(rows[i].heading - last.heading) >= maxTurn) {
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

    // The ribbon of a run of rows: {mesh, triangles, clamped} (clamped: rows whose inside edge was held)
    static ribbon(rows, lod = 0) {
        const colors = RoadMesh.COLORS;
        const kept = lod === 0 ? rows : RoadMesh.decimate(rows);
        const curve = RoadMesh.curvature(kept);
        const positions = [];
        const shades = [];
        let clamped = 0;
        const push = (x, y, z, c) => { positions.push(x, y, z); shades.push(c[0], c[1], c[2]); };
        const place = (row, offset) => ({ x: row.x + offset * Math.cos(row.heading), z: row.z - offset * Math.sin(row.heading) });

        // Lateral offsets of a row and the colour of the strip that starts at each
        const layout = (row, k) => {
            const h = row.width / 2;
            const cobbles = (row.bits & 8) !== 0;
            const road = cobbles ? colors.cobbles : colors.asphalt;
            let offsets, strips;
            if (lod === 0) {
                offsets = [-h - 0.5, -h, -h + 0.25, -h + 0.45, -0.08, 0.08, h - 0.45, h - 0.25, h, h + 0.5];
                strips = [colors.kerb, road, cobbles ? road : colors.edgeLine, road, cobbles ? road : colors.centreLine, road, cobbles ? road : colors.edgeLine, road, colors.kerb];
            } else {
                offsets = [-h, h];
                strips = [road];
            }
            // The inside of a bend: right offsets when the road turns right
            const radius = Math.abs(curve[k]) > 1e-6 ? 1 / Math.abs(curve[k]) : Infinity;
            const limit = RoadMesh.INNER_SHARE * radius;
            if (limit < h + 0.5) {
                clamped++;
                const inner = curve[k] > 0 ? 1 : -1;
                offsets = offsets.map(o => (Math.sign(o) === inner && Math.abs(o) > limit ? inner * limit : o));
                if (lod === 0) strips = strips.map((c, s) => ((inner > 0 ? s === strips.length - 1 : s === 0) ? colors.asphalt : c));
            }
            return { offsets, strips, row };
        };

        const laid = kept.map(layout);
        for (let k = 0; k + 1 < laid.length; k++) {
            const a = laid[k], b = laid[k + 1];
            for (let s = 0; s < a.strips.length; s++) {
                const lift = s === 2 || s === 4 || s === 6 ? RoadMesh.LIFT_M * 1.6 : RoadMesh.LIFT_M;
                const pa0 = place(a.row, a.offsets[s]), pa1 = place(a.row, a.offsets[s + 1]);
                const pb0 = place(b.row, b.offsets[s]), pb1 = place(b.row, b.offsets[s + 1]);
                const c = a.strips[s];
                const ya = a.row.y + lift, yb = b.row.y + lift;
                push(pa0.x, ya, pa0.z, c); push(pa1.x, ya, pa1.z, c); push(pb0.x, yb, pb0.z, c);
                push(pa1.x, ya, pa1.z, c); push(pb1.x, yb, pb1.z, c); push(pb0.x, yb, pb0.z, c);
            }
        }
        return { geometry: RoadMesh.geometry(positions, shades), triangles: positions.length / 9, clamped };
    }

    static geometry(positions, shades) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(shades, 3));
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();
        return geometry;
    }

    static mesh(geometry, name) {
        const mesh = new THREE.Mesh(geometry, RoadMesh.material());
        mesh.name = name;
        mesh.receiveShadow = true;
        mesh.userData.world = 'road';
        return mesh;
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
        group.add(RoadMesh.mesh(ribbon.geometry, 'road-ribbon'));
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

    // A side road beyond the junction: the stub at LOD0 when `stub`, else the LOD1 ribbon
    static sideRoad(rows, stub) {
        const group = new THREE.Group();
        group.name = stub ? 'world-road-stub' : 'world-road-side';
        const ribbon = RoadMesh.ribbon(rows, stub ? 0 : 1);
        group.add(RoadMesh.mesh(ribbon.geometry, 'road-side'));
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
