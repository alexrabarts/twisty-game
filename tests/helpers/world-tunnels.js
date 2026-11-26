// Land and the tubes of tunnels and galleries, as they are drawn. One window function for jest
// (tests/unit/world-tunnels.test.js) and for the page (tools/terrain-check.mjs world-tunnels): it is passed to the page
// as source, so it reads nothing from outside its own body but `game` (for THREE) and `env`.
//
// A tube is the box RoadMesh draws round a road over a run of tunnel or gallery rows: the ride's from each row's
// centre WALL_M past half its width either side (RoadMesh.tunnel), a side road's from its verge's outer edges
// (RoadMesh.sideStructures), from the road up WorldRoute.ROOF_M. Every place of the window's tubes is read against the
// drawn land (the tiles' land and the faces that close their cuts, at the level of detail they are drawn at, and the
// far grid and far land drawn under them):
//   inside  land in the box: higher than the floor and lower than the roof, by more than `tolM`
//   floor   a place across the floor between the road's drawn edge and the wall with no surface drawn at the floor
//           (a slot down to the land)
//   mouth   land in front of a portal over the opening: from the portal out `mouthM` along the road, across between the
//           walls, higher than the road by more than `mouthTolM` and lower than the roof
//   face    at a portal, over the tube: land that stands across the portal's plane between the roof and `faceM` over
//           it with nothing drawn in that plane to front it (the land cut by the portal face, seen from outside)
// `store` keeps the runs, the portals and the faults read so far (a place is read once): tunnelReport(store) sums them.
export function tunnelWindow(game, env, store, at, { nearM = 300, stepM = 1, acrossM = 0.5, tolM = 0.05, mouthM = 10, mouthTolM = 0.15, faceM = 6, wallM = 1.6, roofM = 6.5 } = {}) {
    const { THREE } = game;
    store.runs = store.runs || new Map();
    store.read = store.read || new Set();
    store.portals = store.portals || new Map();
    const v = new THREE.Vector3();
    const r2 = n => Math.round(n * 100) / 100;

    // Triangles of a mesh in plan, hashed by 4 m cells: ys(x, z) gives the height of each over (x, z)
    store.grids = store.grids || new Map();
    const gridOf = (mesh, ranges, cell = 4) => {
        const id = `g:${mesh.geometry.uuid}:${cell}:${ranges.map(r => r.join('+')).join(',')}`;
        if (store.grids.has(id)) return store.grids.get(id);
        mesh.updateMatrixWorld(true);
        const pos = mesh.geometry.attributes.position, index = mesh.geometry.index;
        const tris = [], hash = new Map();
        for (const [start, count] of ranges) {
            for (let i = start; i + 2 < start + count; i += 3) {
                const t = new Float64Array(9);
                for (let k = 0; k < 3; k++) { v.fromBufferAttribute(pos, index ? index.getX(i + k) : i + k).applyMatrix4(mesh.matrixWorld); t[k * 3] = v.x; t[k * 3 + 1] = v.y; t[k * 3 + 2] = v.z; }
                if (Math.abs((t[3] - t[0]) * (t[8] - t[2]) - (t[6] - t[0]) * (t[5] - t[2])) < 1e-7) continue;
                const ref = tris.push(t) - 1;
                for (let cx = Math.floor(Math.min(t[0], t[3], t[6]) / cell); cx <= Math.floor(Math.max(t[0], t[3], t[6]) / cell); cx++) {
                    for (let cz = Math.floor(Math.min(t[2], t[5], t[8]) / cell); cz <= Math.floor(Math.max(t[2], t[5], t[8]) / cell); cz++) {
                        const h = cx * 65536 + cz;
                        (hash.get(h) || hash.set(h, []).get(h)).push(ref);
                    }
                }
            }
        }
        const grid = {
            ys(x, z, out) {
                for (const ref of hash.get(Math.floor(x / cell) * 65536 + Math.floor(z / cell)) || []) {
                    const t = tris[ref];
                    const d = (t[5] - t[8]) * (t[0] - t[6]) + (t[6] - t[3]) * (t[2] - t[8]);
                    const a = ((t[5] - t[8]) * (x - t[6]) + (t[6] - t[3]) * (z - t[8])) / d, b = ((t[8] - t[2]) * (x - t[6]) + (t[0] - t[6]) * (z - t[8])) / d, c = 1 - a - b;
                    if (a < -1e-9 || b < -1e-9 || c < -1e-9) continue;
                    out.push(a * t[1] + b * t[4] + c * t[7]);
                }
                return out;
            }
        };
        store.grids.set(id, grid);
        return grid;
    };
    // Upright faces in plan by their boxes: fronts(x, z, y0, y1) is true where one stands within 0.3 m of (x, z) and
    // covers from y0 up to y1
    // Whether the spans [low, high] together cover y0 to y1 (5 cm either end, and no gap between two of 5 cm)
    const covers = (spans, y0, y1) => {
        let reach = y0 + 0.05;
        for (const [a, b] of spans.slice().sort((p, q) => p[0] - q[0])) {
            if (a > reach + 0.05) break;
            reach = Math.max(reach, b);
            if (reach >= y1 - 0.05) return true;
        }
        return reach >= y1 - 0.05;
    };
    const facesOf = (mesh, ranges) => {
        const id = `f:${mesh.geometry.uuid}`;
        if (store.grids.has(id)) return store.grids.get(id);
        mesh.updateMatrixWorld(true);
        const pos = mesh.geometry.attributes.position, index = mesh.geometry.index;
        const boxes = [], hash = new Map(), cell = 4;
        for (const [start, count] of ranges) {
            for (let i = start; i + 2 < start + count; i += 3) {
                const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
                for (let k = 0; k < 3; k++) { v.fromBufferAttribute(pos, index ? index.getX(i + k) : i + k).applyMatrix4(mesh.matrixWorld); b[0] = Math.min(b[0], v.x); b[1] = Math.min(b[1], v.y); b[2] = Math.min(b[2], v.z); b[3] = Math.max(b[3], v.x); b[4] = Math.max(b[4], v.y); b[5] = Math.max(b[5], v.z); }
                if (b[4] - b[1] < 0.2) continue;
                const ref = boxes.push(b) - 1;
                for (let cx = Math.floor((b[0] - 0.3) / cell); cx <= Math.floor((b[3] + 0.3) / cell); cx++) for (let cz = Math.floor((b[2] - 0.3) / cell); cz <= Math.floor((b[5] + 0.3) / cell); cz++) { const h = cx * 65536 + cz; (hash.get(h) || hash.set(h, []).get(h)).push(ref); }
            }
        }
        // (fronted by the faces at (x, z) together: a portal's beam from its roof and the headwall from the beam's top
        // up to the land are two faces, one over the other)
        const faces = {
            spans(x, z) { const out = []; for (const ref of hash.get(Math.floor(x / cell) * 65536 + Math.floor(z / cell)) || []) { const b = boxes[ref]; if (x >= b[0] - 0.3 && x <= b[3] + 0.3 && z >= b[2] - 0.3 && z <= b[5] + 0.3) out.push([b[1], b[4]]); } return out; },
            fronts(x, z, y0, y1) { return covers(faces.spans(x, z), y0, y1); }
        };
        store.grids.set(id, faces);
        return faces;
    };

    // (nothing to read where no tube is near)
    const anyNear = () => {
        for (let i = 0; i + 1 < env.route.points.length; i++) {
            const p = env.route.points[i];
            if (p.bits & 5 && Math.hypot(p.x - at.x, p.z - at.z) <= nearM) return true;
        }
        let found = false;
        for (const group of env.sideMeshes.values()) group.traverse(o => { const d = o.userData; if (!found && d && Array.isArray(d.sides) && d.sides.some(side => side.bits & 5 && Math.hypot(side.l[0] - at.x, side.l[2] - at.z) <= nearM)) found = true; });
        return found;
    };
    if (!anyNear()) return store;
    // (only the grids of meshes drawn now are kept: a ride along a stage builds thousands, and the page ran out of
    // memory holding them all)
    const live = new Set();
    for (const tile of env.tileMeshes.values()) { const mesh = tile.mesh || tile; if (mesh && mesh.geometry) live.add(mesh.geometry.uuid); }
    for (const group of [...env.roadMeshes.values(), ...env.sideMeshes.values()]) group.traverse(o => { if (o.isMesh && o.geometry) live.add(o.geometry.uuid); });
    for (const mesh of [env.horizon, ...(env.farLand || [])]) if (mesh && mesh.geometry) live.add(mesh.geometry.uuid);
    for (const id of [...store.grids.keys()]) if (!live.has(id.split(':')[1])) store.grids.delete(id);
    // The drawn land: every tile's land and closing faces as drawn now (not its skirts, under its edge)
    const land = [];
    for (const tile of env.tileMeshes.values()) {
        const mesh = tile.mesh || tile;
        if (!mesh || !mesh.isMesh || !mesh.visible) continue;
        const parts = mesh.userData.parts || { land: mesh.geometry.index ? mesh.geometry.index.count : 0, faces: [0, 0] };
        land.push(gridOf(mesh, [[0, parts.land], parts.faces]));
    }
    // and the far grid and the far land under the tiles: cut away, a tile shows what lies under it (km 13.2 of the
    // Gotthard leg: the far grid stood in the tube where the tiles' land was cut, and no tile read it)
    for (const mesh of [env.horizon, ...(env.farLand || [])]) {
        if (!mesh || !mesh.isMesh || !mesh.visible || !mesh.geometry.index) continue;
        // (in cells of 100 m: its triangles are 100 m and more across)
        land.push(gridOf(mesh, [[0, mesh.geometry.index.count]], 100));
    }
    // The floors (every ribbon and every road's works) and the upright structure faces (the works' concrete and stone)
    const floors = [], uprights = [];
    for (const group of [...env.roadMeshes.values(), ...env.sideMeshes.values()]) {
        group.traverse(o => {
            if (!o.isMesh) return;
            const whole = [[0, o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count]];
            if (/road-(ribbon|side)/.test(o.name)) floors.push(gridOf(o, whole));
            else { floors.push(gridOf(o, whole)); uprights.push(facesOf(o, whole)); }
        });
    }
    const landYs = (x, z) => { const out = []; for (const g of land) g.ys(x, z, out); return out; };
    const floorAt = (x, z, y) => { const out = []; for (const g of floors) g.ys(x, z, out); return out.some(h => Math.abs(h - y) <= 0.15); };
    const fronted = (x, z, y0, y1) => covers(uprights.flatMap(f => f.spans(x, z)), y0, y1);

    // The tubes near `at`: { key, road, rows: [{x, y, z, l: [x, y, z], r: [x, y, z], s}], tube: [k...] (rows in a tube) }
    const roads = [];
    const points = env.route.points, sArray = env.route.sArray;
    const rideRows = [];
    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const o = p.width / 2 + wallM;
        rideRows.push({ x: p.x, y: p.y, z: p.z, s: sArray[i], tube: (p.bits & 5) !== 0, gallery: (p.bits & 4) !== 0, l: [p.x - o * Math.cos(p.heading), p.y, p.z + o * Math.sin(p.heading)], r: [p.x + o * Math.cos(p.heading), p.y, p.z - o * Math.sin(p.heading)], edgeM: p.width / 2 + 0.75 });
    }
    roads.push({ road: 'ride', rows: rideRows });
    for (const group of env.sideMeshes.values()) {
        group.traverse(o => {
            const d = o.userData;
            if (!d || !Array.isArray(d.sides) || !Array.isArray(d.rows) || d.edge === undefined) return;
            if (!d.sides.some(side => side.bits & 5)) return;
            const rows = d.sides.map(side => ({ x: (side.l[0] + side.r[0]) / 2, y: (side.l[1] + side.r[1]) / 2, z: (side.l[2] + side.r[2]) / 2, s: null, tube: (side.bits & 5) !== 0, gallery: (side.bits & 4) !== 0, l: side.l, r: side.r, edgeM: null }));
            // (a side road's tube is lowered under a road over it: its roof as drawn, RoadMesh.sideStructures `tubes`)
            const roofs = new Map((d.tubes || []).map(seg => [`${seg.la[0]},${seg.la[2]}`, seg.roof]));
            rows.forEach((row, k) => { row.roof = roofs.get(`${d.sides[k].l[0]},${d.sides[k].l[2]}`); });
            roads.push({ road: `e${d.edge}`, rows, through: d.through || [false, false] });
        });
    }

    const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const runOf = (road, k) => {
        // The run a tube row belongs to: its first and last row
        let a = k, b = k;
        while (a > 0 && road.rows[a - 1].tube) a--;
        while (b + 1 < road.rows.length && road.rows[b + 1].tube) b++;
        return [a, b];
    };
    const fault = (key, kind, record) => {
        const run = store.runs.get(key);
        run[kind].count++;
        const worst = run[kind].worst;
        if (!worst || record.m > worst.m) run[kind].worst = record;
    };
    for (const road of roads) {
        const rows = road.rows;
        for (let k = 0; k + 1 < rows.length; k++) {
            const a = rows[k], b = rows[k + 1];
            if (!(a.tube && b.tube)) continue;
            const mid = lerp3(a.l, b.r, 0.5);
            if (Math.hypot(mid[0] - at.x, mid[2] - at.z) > nearM) continue;
            const [first, last] = runOf(road, k);
            const key = `${road.road}:${road.road === 'ride' ? Math.round(rows[first].s) : `${Math.round(rows[first].x)},${Math.round(rows[first].z)}`}`;
            if (!store.runs.has(key)) {
                const len = rows.slice(first, last).reduce((p, row, j) => p + Math.hypot(rows[first + j + 1].x - row.x, rows[first + j + 1].z - row.z), 0);
                store.runs.set(key, { key, road: road.road, kind: rows[first].gallery ? 'gallery' : 'tunnel', s: rows[first].s === null ? null : Math.round(rows[first].s), x: Math.round(rows[first].x), z: Math.round(rows[first].z), lengthM: Math.round(len), places: 0, inside: { count: 0, worst: null }, floor: { count: 0, worst: null }, mouth: { count: 0, worst: null }, face: { count: 0, worst: null } });
            }
            const id = `${road.road}:${k}:${Math.round(a.x)},${Math.round(a.z)}`;
            if (store.read.has(id)) continue;
            store.read.add(id);
            const run = store.runs.get(key);
            const lengthM = Math.hypot(b.x - a.x, b.z - a.z);
            const wide = Math.hypot(a.r[0] - a.l[0], a.r[2] - a.l[2]);
            const along = Math.max(1, Math.ceil(lengthM / stepM)), across = Math.max(2, Math.ceil(wide / acrossM));
            for (let u = 0; u < along; u++) {
                const t = (u + 0.5) / along;
                const L = lerp3(a.l, b.l, t), R = lerp3(a.r, b.r, t);
                for (let w = 0; w <= across; w++) {
                    const q = Math.min(1 - 0.01, Math.max(0.01, w / across));
                    const p = lerp3(L, R, q);
                    run.places++;
                    const floor = p[1], roof = floor + (Number.isFinite(a.roof) ? a.roof : roofM);
                    for (const y of landYs(p[0], p[2])) {
                        if (y > floor + tolM && y < roof - tolM) fault(key, 'inside', { x: r2(p[0]), z: r2(p[2]), s: a.s === null ? null : r2(a.s + t * (b.s - a.s)), overFloorM: r2(y - floor), m: r2(Math.min(y - floor, roof - y)) });
                    }
                    // (the ride's floor past its drawn edge, out to the wall)
                    if (road.road === 'ride') {
                        const off = Math.abs(q - 0.5) * wide;
                        if (off > a.edgeM && !floorAt(p[0], p[2], floor)) fault(key, 'floor', { x: r2(p[0]), z: r2(p[2]), s: r2(a.s + t * (b.s - a.s)), offM: r2(off), m: r2(off - a.edgeM) });
                    }
                }
            }
            // A portal at either end of the segment where the next row is open
            for (const [end, step] of [[k, -1], [k + 1, 1]]) {
                // (a road whose drawn rows end at its tube's end has its portal there, unless it goes on as a tube)
                const open = !rows[end + step] && road.through && !road.through[step < 0 ? 0 : 1];
                const out = rows[end + step] || (open ? { x: 2 * rows[end].x - rows[end - step].x, z: 2 * rows[end].z - rows[end - step].z, tube: false } : null);
                if (!out || out.tube) continue;
                const pkey = `${road.road}:${Math.round(rows[end].x)},${Math.round(rows[end].z)}`;
                if (store.portals.has(pkey)) continue;
                const P = rows[end];
                let dx = out.x - P.x, dz = out.z - P.z;
                const dl = Math.hypot(dx, dz) || 1;
                dx /= dl; dz /= dl;
                const half = Math.hypot(P.r[0] - P.l[0], P.r[2] - P.l[2]) / 2;
                store.portals.set(pkey, { key: pkey, run: key, road: road.road, x: r2(P.x), y: r2(P.y), z: r2(P.z), s: P.s === null ? null : r2(P.s), out: [r2(dx), r2(dz)], half: r2(half), l: P.l.map(r2), r: P.r.map(r2) });
                // In front of the opening: along the rows outward, across between the walls' lines
                let j = end, walked = 0, prev = P;
                while (walked < mouthM && rows[j + step]) {
                    const next = rows[j + step];
                    const seg = Math.hypot(next.x - prev.x, next.z - prev.z) || 1e-6;
                    for (let d = 0.5; d <= seg && walked + d <= mouthM; d += 0.5) {
                        const t = d / seg;
                        // (the opening is the portal's: its walls' lines carried out along the road)
                        const c = lerp3([prev.x, prev.y, prev.z], [next.x, next.y, next.z], t);
                        const hx = next.x - prev.x, hz = next.z - prev.z, hl = Math.hypot(hx, hz) || 1;
                        const nx = -hz / hl, nz = hx / hl;
                        for (let lat = -half + 0.05; lat <= half - 0.05 + 1e-9; lat += acrossM) {
                            const px = c[0] + nx * lat, pz = c[2] + nz * lat;
                            run.places++;
                            for (const y of landYs(px, pz)) {
                                if (y > c[1] + mouthTolM && y < c[1] + roofM) fault(key, 'mouth', { x: r2(px), z: r2(pz), outM: r2(walked + d), overRoadM: r2(y - c[1]), m: r2(y - c[1]) });
                            }
                        }
                    }
                    walked += seg;
                    prev = next;
                    j += step;
                }
                // The portal's plane over the tube: land that crosses it between the roof and faceM over it, unfronted
                const nx = -dz, nz = dx;
                for (let lat = -half; lat <= half + 1e-9; lat += acrossM) {
                    const px = P.x + nx * lat, pz = P.z + nz * lat;
                    const inY = landYs(px - dx * 0.6, pz - dz * 0.6), outY = landYs(px + dx * 0.6, pz + dz * 0.6);
                    const top = P.y + (Number.isFinite(P.roof) ? P.roof : roofM);
                    const hi = Math.max(...inY, -Infinity), lo = Math.min(...outY, Infinity);
                    // (the land behind the plane stands over the roof and the land in front of it lower: the step between
                    // them must be fronted by something drawn in the plane)
                    if (!Number.isFinite(hi) || hi <= top + tolM) continue;
                    const from = Math.max(top, Number.isFinite(lo) ? lo : top), to = Math.min(hi, top + faceM);
                    if (to - from <= 0.3) continue;
                    run.places++;
                    if (!fronted(px, pz, from, to)) fault(key, 'face', { x: r2(px), z: r2(pz), lat: r2(lat), fromM: r2(from - P.y), toM: r2(to - P.y), m: r2(to - from) });
                }
            }
        }
    }
    return store;
}

// The runs read, worst first, and the count of faults of each kind over them
export function tunnelReport(store) {
    const runs = [...(store.runs || new Map()).values()];
    const sum = kind => runs.reduce((p, r) => p + r[kind].count, 0);
    const rank = r => r.inside.count + r.floor.count + r.mouth.count + r.face.count;
    return {
        runs: runs.length,
        portals: (store.portals || new Map()).size,
        places: runs.reduce((p, r) => p + r.places, 0),
        inside: sum('inside'), floor: sum('floor'), mouth: sum('mouth'), face: sum('face'),
        list: runs.sort((p, q) => rank(q) - rank(p)).map(r => ({ key: r.key, kind: r.kind, s: r.s, x: r.x, z: r.z, lengthM: r.lengthM, places: r.places, inside: r.inside.count, floor: r.floor.count, mouth: r.mouth.count, face: r.face.count, worst: { inside: r.inside.worst, floor: r.floor.worst, mouth: r.mouth.worst, face: r.face.worst } })),
        portalList: [...(store.portals || new Map()).values()]
    };
}

// What a shipped world may still show: none of any kind
export const TUNNEL_LIMITS = { inside: 0, floor: 0, mouth: 0, face: 0 };
