// No road's structures stand in a carriageway: the invariant of the road works of a world. Shared by the node test
// (tests/unit/world-structures.test.js) and the scratch audits. One self-contained function with no imports, so a
// probe can pass it into a page with toString().
//
// structureWindow(game, env, {seen, depthM, headroomM}) reads every structure drawn now: the road works of the ride's
// sections and of the side chunks (aprons, retaining walls, parapets, decks, soffits, piers, wall ends, tunnels,
// bridges), and the road-closed barriers as the physics boxes them. Every triangle is tested against the drawn
// carriageway of every road (the ride's in its ribbon frame, WorldRoute.nearestSegment; each side edge's from its
// samples) at the points where it can stand deepest in one (its corners, and where its edges and face pass nearest a
// centre line), each with the heights the face spans there: inside a carriageway by more than `depthM` and standing over
// that road's surface by more than `depthM` and less than `headroomM` intrudes. A road's own
// carriageway does not count against its own works (a side road's parapet stands on its own edge), nor does a side
// road it goes on as (an edge joined to it through a node of degree 2); a barrier counts against no edge of the side
// road it closes. A deck that passes over a road with full headroom is over it, not in it.
// Then the physics: a point the rider can reach on a side road's stub (from the ride's carriageway to the barrier)
// whose zone is a wall the barrier does not make, and a barrier box reaching into the ride's carriageway.
// `seen` (a Set) carries the triangles already counted across calls, so a sweep counts each once.
// Returns {triangles, intrusions, worst: [...], physics: [...]}: worst holds the deepest DETAIL intrusions.
// `done` (a Set of geometry ids) carries the meshes already read across calls: a mesh still resident is not read again.
export function structureWindow(game, env, { seen = new Set(), done = new Set(), depthM = 0.05, headroomM = 4.5, detail = 400 } = {}) {
    const { THREE } = game;
    const SAMPLE_M = 0.25, HASH = 16;
    const route = env.route, data = env.data, ground = env.ground;
    const near = {};
    // The side carriageways in residence, in a hash
    const sideHash = new Map(), sideSegs = [];
    for (const edge of data.edges || []) {
        if (edge.onRide) continue;
        const e = data.edgeSamples(edge.id);
        if (!e) continue;
        for (let i = 0; i + 1 < e.x.length; i++) {
            const g = { edgeId: edge.id, x0: e.x[i], z0: e.z[i], y0: e.y[i], x1: e.x[i + 1], z1: e.z[i + 1], y1: e.y[i + 1], h0: e.width[i] / 2, h1: e.width[i + 1] / 2 };
            const ref = sideSegs.push(g) - 1, reach = Math.max(g.h0, g.h1);
            for (let cx = Math.floor((Math.min(g.x0, g.x1) - reach) / HASH); cx <= Math.floor((Math.max(g.x0, g.x1) + reach) / HASH); cx++) {
                for (let cz = Math.floor((Math.min(g.z0, g.z1) - reach) / HASH); cz <= Math.floor((Math.max(g.z0, g.z1) + reach) / HASH); cz++) {
                    const k = cx * 65536 + cz;
                    (sideHash.get(k) || sideHash.set(k, []).get(k)).push(ref);
                }
            }
        }
    }
    // The edges a side road goes on as (through nodes of degree 2), for each edge asked about
    const degree = data.nodes && data.nodes.degree;
    const byNode = new Map();
    for (const e of data.edges || []) for (const n of [e.a, e.b]) (byNode.get(n) || byNode.set(n, []).get(n)).push(e);
    const chains = new Map();
    const chainOf = id => {
        if (chains.has(id)) return chains.get(id);
        const set = new Set([id]);
        const walk = (edge, from) => {
            let node = edge.a === from ? edge.b : edge.a;
            while (degree && degree[node] === 2) {
                const next = (byNode.get(node) || []).find(e => !set.has(e.id));
                if (!next || next.onRide) break;
                set.add(next.id);
                node = next.a === node ? next.b : next.a;
            }
        };
        const edge = data.edges[id];
        if (edge) { walk(edge, edge.a); walk(edge, edge.b); }
        chains.set(id, set);
        return set;
    };
    // The roads whose carriageway (x, y, z) stands in, by more than depthM, over their surface by depthM to headroomM:
    // [{road: -1 for the ride or the side edge id, depth, over, s}]
    let lowM = depthM;
    const roadsAt = (x, ylo, yhi, z, out) => {
        out.length = 0;
        const win = (ry) => yhi > ry + lowM && ylo < ry + headroomM - 0.02;
        for (const i of route.cellSegments(x, z) || []) {
            // The chord first: a segment far off cannot frame the point
            const a = route.points[i], b = route.points[i + 1];
            const cx = b.x - a.x, cz = b.z - a.z, run = cx * cx + cz * cz;
            const t = run === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * cx + (z - a.z) * cz) / run));
            if (Math.hypot(a.x + cx * t - x, a.z + cz * t - z) > Math.max(a.width, b.width) / 2 + 1) continue;
            route.nearestSegment(x, z, i, i, near);
            const depth = near.width / 2 - near.distance;
            if (depth > depthM && win(near.y)) out.push({ road: -1, depth, over: Math.min(yhi, Math.max(ylo, near.y + lowM)) - near.y, y: near.y, s: near.s });
        }
        for (const ref of sideHash.get(Math.floor(x / HASH) * 65536 + Math.floor(z / HASH)) || []) {
            const g = sideSegs[ref];
            const dx = g.x1 - g.x0, dz = g.z1 - g.z0, run = dx * dx + dz * dz;
            const t = run === 0 ? 0 : Math.max(0, Math.min(1, ((x - g.x0) * dx + (z - g.z0) * dz) / run));
            const depth = g.h0 + (g.h1 - g.h0) * t - Math.hypot(g.x0 + dx * t - x, g.z0 + dz * t - z);
            const ry = g.y0 + (g.y1 - g.y0) * t;
            if (depth > depthM && win(ry)) out.push({ road: g.edgeId, depth, over: Math.min(yhi, Math.max(ylo, ry + lowM)) - ry, y: ry, s: null });
        }
        return out;
    };
    const out = { triangles: 0, intrusions: 0, worst: [], physics: [], byKind: {} };
    const hits = [];
    const v = new THREE.Vector3();
    // One structure triangle (9 numbers), owned by `owner` (-1 the ride, a side edge id, or a Set of edges for a barrier)
    const test = (tri, owner, kind, source) => {
        const key = `${source}:${kind}:${tri.map(c => Math.round(c * 50)).join(',')}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.triangles++;
        const own = owner instanceof Set ? owner : owner >= 0 ? chainOf(owner) : null;
        // An apron is land laid APRON_UNDER_M (6 cm) under the ribbon's edge and drawn behind it (polygon offset): it
        // counts only where it rises 10 cm over a road
        lowM = kind === 'apron' ? 0.1 : depthM;
        // The points of the triangle that can stand deepest in a carriageway: a carriageway is a band about a centre line,
        // so over a triangle its depth is greatest at a corner, or where an edge or the face passes nearest a centre line.
        // Each such plan point is read with the span of heights the triangle has over it (one height for a sloping face,
        // an interval for an upright one: a wall, a pier, a parapet's face)
        const x0 = Math.min(tri[0], tri[3], tri[6]) - 6, x1 = Math.max(tri[0], tri[3], tri[6]) + 6;
        const z0 = Math.min(tri[2], tri[5], tri[8]) - 6, z1 = Math.max(tri[2], tri[5], tri[8]) + 6;
        const lines = [];
        const rc = game.WorldRoute.HASH_M, seenRide = new Set(), seenSide = new Set();
        for (let cx = Math.floor(x0 / rc); cx <= Math.floor(x1 / rc); cx++) for (let cz = Math.floor(z0 / rc); cz <= Math.floor(z1 / rc); cz++) {
            for (const i of route.hash.get(cx * 65536 + cz) || []) {
                if (seenRide.has(i)) continue;
                seenRide.add(i);
                const p = route.points[i], q = route.points[i + 1];
                if (Math.max(p.x, q.x) < x0 || Math.min(p.x, q.x) > x1 || Math.max(p.z, q.z) < z0 || Math.min(p.z, q.z) > z1) continue;
                lines.push([p.x, p.z, q.x, q.z]);
            }
        }
        for (let cx = Math.floor(x0 / HASH); cx <= Math.floor(x1 / HASH); cx++) for (let cz = Math.floor(z0 / HASH); cz <= Math.floor(z1 / HASH); cz++) {
            for (const ref of sideHash.get(cx * 65536 + cz) || []) {
                if (seenSide.has(ref)) continue;
                seenSide.add(ref);
                const g = sideSegs[ref];
                if (Math.max(g.x0, g.x1) < x0 || Math.min(g.x0, g.x1) > x1 || Math.max(g.z0, g.z1) < z0 || Math.min(g.z0, g.z1) > z1) continue;
                lines.push([g.x0, g.z0, g.x1, g.z1]);
            }
        }
        if (!lines.length) return;
        const P = [[tri[0], tri[1], tri[2]], [tri[3], tri[4], tri[5]], [tri[6], tri[7], tri[8]]];
        const plan = [];
        for (const c of P) plan.push([c[0], c[2]]);
        // Closest points between two plan segments: the parameters on each (t on a-b, u on c-d)
        const nearest = (ax, az, bx, bz, cx, cz, dx, dz) => {
            const out = [];
            const proj = (px, pz, sx, sz, ex, ez) => { const vx = ex - sx, vz = ez - sz, l = vx * vx + vz * vz; return l === 0 ? 0 : Math.max(0, Math.min(1, ((px - sx) * vx + (pz - sz) * vz) / l)); };
            out.push(proj(cx, cz, ax, az, bx, bz), proj(dx, dz, ax, az, bx, bz));
            const rx = bx - ax, rz = bz - az, sx = dx - cx, sz = dz - cz, den = rx * sz - rz * sx;
            if (Math.abs(den) > 1e-12) {
                const t = ((cx - ax) * sz - (cz - az) * sx) / den, u = ((cx - ax) * rz - (cz - az) * rx) / den;
                if (t >= 0 && t <= 1 && u >= 0 && u <= 1) out.push(t);
            }
            return out;
        };
        const cand = [[0, 0], [1, 0], [0, 1]];
        const edges = [[0, 1], [1, 2], [2, 0]];
        const toUV = (e, t) => { const [i, j] = edges[e]; const bi = [[0, 0], [1, 0], [0, 1]][i], bj = [[0, 0], [1, 0], [0, 1]][j]; return [bi[0] + (bj[0] - bi[0]) * t, bi[1] + (bj[1] - bi[1]) * t]; };
        const area2 = (plan[1][0] - plan[0][0]) * (plan[2][1] - plan[0][1]) - (plan[2][0] - plan[0][0]) * (plan[1][1] - plan[0][1]);
        for (const [cx, cz, dx, dz] of lines) {
            for (let e = 0; e < 3; e++) {
                const [i, j] = edges[e];
                for (const t of nearest(plan[i][0], plan[i][1], plan[j][0], plan[j][1], cx, cz, dx, dz)) cand.push(toUV(e, t));
            }
            // A centre line's ends inside the face's plan
            if (Math.abs(area2) > 1e-6) for (const [px, pz] of [[cx, cz], [dx, dz]]) {
                const u = ((px - plan[0][0]) * (plan[2][1] - plan[0][1]) - (plan[2][0] - plan[0][0]) * (pz - plan[0][1])) / area2;
                const w = ((plan[1][0] - plan[0][0]) * (pz - plan[0][1]) - (px - plan[0][0]) * (plan[1][1] - plan[0][1])) / area2;
                if (u >= 0 && w >= 0 && u + w <= 1) cand.push([u, w]);
            }
        }
        // The heights the face has over a plan point: an upright face spans the heights of its edges there
        const ux = tri[3] - tri[0], uy = tri[4] - tri[1], uz = tri[5] - tri[2], vx = tri[6] - tri[0], vy = tri[7] - tri[1], vz = tri[8] - tri[2];
        const area3 = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
        const upright = area3 < 1e-9 || Math.abs(area2) < 0.05 * area3;
        const span = (x, z, y) => {
            if (!upright) return [y, y];
            let lo = Infinity, hi = -Infinity;
            for (const [i, j] of edges) {
                const ax = P[i][0], az = P[i][2], bx = P[j][0], bz = P[j][2];
                const vx = bx - ax, vz = bz - az, l = vx * vx + vz * vz;
                const t = l === 0 ? 0 : ((x - ax) * vx + (z - az) * vz) / l;
                if (t < -1e-6 || t > 1 + 1e-6) continue;
                const yy = P[i][1] + (P[j][1] - P[i][1]) * Math.max(0, Math.min(1, t));
                lo = Math.min(lo, yy); hi = Math.max(hi, yy);
            }
            return lo <= hi ? [lo, hi] : [y, y];
        };
        let worst = null;
        const found = [];
        for (const [u, w] of cand) {
            const t = 1 - u - w;
            const x = tri[0] * t + tri[3] * u + tri[6] * w, y = tri[1] * t + tri[4] * u + tri[7] * w, z = tri[2] * t + tri[5] * u + tri[8] * w;
            const [ylo, yhi] = span(x, z, y);
            for (const r of roadsAt(x, ylo, yhi, z, found)) {
                if (r.road !== -1 && own && own.has(r.road)) continue;
                if (!worst || r.depth > worst.depth) worst = { ...r, x, y: Math.min(yhi, Math.max(ylo, r.y + lowM)), z };
            }
        }
        if (!worst) return;
        out.intrusions++;
        out.byKind[`${source}:${kind}`] = (out.byKind[`${source}:${kind}`] || 0) + 1;
        hits.push({ source, kind, owner: owner instanceof Set ? [...owner][0] : owner, road: worst.road === -1 ? 'ride' : worst.road, depthM: Math.round(worst.depth * 100) / 100, overM: Math.round(worst.over * 100) / 100, x: Math.round(worst.x * 10) / 10, y: Math.round(worst.y * 10) / 10, z: Math.round(worst.z * 10) / 10, s: worst.s !== null ? Math.round(worst.s) : Math.round(route.project(worst.x, worst.z, null, {}).s) });
    };
    const kinds = ['apron', 'deck', 'stone'];
    const meshTriangles = (mesh, source, ownerOf) => {
        if (done.has(mesh.geometry.uuid)) return;
        done.add(mesh.geometry.uuid);
        mesh.updateMatrixWorld(true);
        const geometry = mesh.geometry, pos = geometry.attributes.position, index = geometry.index;
        const count = index ? index.count : pos.count;
        const groups = geometry.groups && geometry.groups.length ? geometry.groups : [{ start: 0, count, materialIndex: 1 }];
        const owners = geometry.userData.owners;
        for (const group of groups) {
            for (let i = group.start; i + 2 < group.start + group.count; i += 3) {
                const tri = [];
                for (let k = 0; k < 3; k++) { v.fromBufferAttribute(pos, index ? index.getX(i + k) : i + k).applyMatrix4(mesh.matrixWorld); tri.push(v.x, v.y, v.z); }
                test(tri, owners ? owners[i / 3] : ownerOf, kinds[group.materialIndex] || 'deck', source);
            }
        }
    };
    for (const group of env.roadMeshes.values()) group.traverse(o => { if (o.isMesh && o.name !== 'road-ribbon') meshTriangles(o, 'ride', -1); });
    for (const group of env.sideMeshes.values()) group.traverse(o => { if (o.isMesh && o.name !== 'road-side') meshTriangles(o, 'side', null); });
    // The barriers as the physics boxes them (WorldGround.setBarriers: the drawn fence and BARRIER_DEPTH_M either side)
    const barriers = env.activeBarriers || [];
    barriers.forEach((b, i) => {
        const box = ground.barriers[i];
        if (!box) return;
        const chain = chainOf(b.edgeId);
        const y = Number.isFinite(b.y) ? b.y : ground.landY(b.x, b.z, 0);
        const along = game.WorldGround.BARRIER_DEPTH_M;
        const corner = (a, c) => [b.x + a * box.sin + c * box.cos, y + 0.6, b.z + a * box.cos - c * box.sin];
        const p00 = corner(-along, -box.half), p10 = corner(along, -box.half), p11 = corner(along, box.half), p01 = corner(-along, box.half);
        test([...p00, ...p10, ...p11], chain, 'barrier', 'barrier');
        test([...p00, ...p11, ...p01], chain, 'barrier', 'barrier');
    });
    // The physics on each stub the rider can reach: from the ride's carriageway to the barrier, across the side road
    const graph = env.graph, located = {}, proj = {};
    barriers.forEach(b => {
        const stub = graph.stub(b.edgeId, b.node);
        if (!stub) return;
        const reachM = Math.hypot(b.x - stub[0].x, b.z - stub[0].z);
        for (let k = 0; k < stub.length; k++) {
            const r = stub[k];
            if (Math.hypot(r.x - stub[0].x, r.z - stub[0].z) > reachM - 1) break;
            for (let c = -r.width / 2 + depthM; c <= r.width / 2 - depthM + 1e-9; c += SAMPLE_M) {
                const x = r.x + c * Math.cos(r.heading), z = r.z - c * Math.sin(r.heading);
                route.project(x, z, null, proj);
                if (proj.distance <= proj.width / 2 || Math.abs(proj.y - r.y) > 2) continue;
                const key = `phys:${Math.round(x * 4)},${Math.round(z * 4)}`;
                if (seen.has(key)) continue;
                seen.add(key);
                located.index = proj.index;
                located.lateral = proj.lateral;
                located.x = x;
                located.z = z;
                const zone = ground.zoneAt(located, proj.width / 2);
                if (zone.kind === 'wall' && !ground.inBarrier(x, z) && out.physics.length < detail) out.physics.push({ edge: b.edgeId, s: Math.round(proj.s), lateral: Math.round(proj.lateral * 100) / 100, parapet: !!zone.parapet });
            }
        }
    });
    hits.sort((a, b) => b.depthM - a.depthM);
    out.worst = hits.slice(0, detail);
    out.all = hits;
    return out;
}

// The surfaces drawn now, as triangles ([9 numbers] with .mesh, .kind and .owner): the road ribbons (ride and side) and
// the structures of the road works (decks, soffits, parapets, walls, wall ends, tunnels, bridges, piers). Aprons are
// land, not structures, and are left out. A triangle is `fresh` when its geometry is not in `done` (then added to it).
function drawnSurfaces(game, env, done = null) {
    const { THREE } = game;
    const v = new THREE.Vector3();
    const out = [];
    let id = 0;
    const take = (mesh, kindOf) => {
        mesh.updateMatrixWorld(true);
        const geometry = mesh.geometry, pos = geometry.attributes.position, index = geometry.index;
        const count = index ? index.count : pos.count;
        const groups = geometry.groups && geometry.groups.length ? geometry.groups : [{ start: 0, count, materialIndex: -1 }];
        const owners = geometry.userData.owners;
        const meshId = id++;
        const fresh = !done || !done.has(geometry.uuid);
        if (done) done.add(geometry.uuid);
        for (const group of groups) {
            const kind = kindOf(group.materialIndex);
            if (!kind) continue;
            for (let i = group.start; i + 2 < group.start + group.count; i += 3) {
                const tri = [];
                for (let k = 0; k < 3; k++) { v.fromBufferAttribute(pos, index ? index.getX(i + k) : i + k).applyMatrix4(mesh.matrixWorld); tri.push(v.x, v.y, v.z); }
                tri.mesh = meshId;
                tri.kind = kind;
                tri.owner = owners ? owners[i / 3] : null;
                tri.fresh = fresh;
                out.push(tri);
            }
        }
    };
    const works = m => (m === 0 ? null : m === 2 ? 'stone' : 'structure');
    for (const group of env.roadMeshes.values()) group.traverse(o => { if (o.isMesh) take(o, o.name === 'road-ribbon' ? () => 'ribbon' : o.name === 'road-works' ? works : () => 'structure'); });
    for (const group of env.sideMeshes.values()) group.traverse(o => { if (o.isMesh) take(o, o.name === 'road-side' ? () => 'side-ribbon' : o.name === 'road-works' ? works : () => 'structure'); });
    return out;
}

// Steps and gaps in the structures: two corners of structure triangles of one mesh and one road that lie more than
// `seamM` but less than `nearM` apart. A swept deck, rail or wall shares each row's corners with the segment either side,
// so its corners coincide; a piece laid per segment (a level box on a grade, a box turned to each chord) leaves its
// corners a step or a gap apart from its neighbour's. `seen` carries pairs already counted across calls.
// Returns {pairs, worst: [{x, y, z, apartM, kind}]}
// `done` (a Set of geometry ids) carries the meshes already read: seams lie within one mesh, so each is read once.
export function structureSeams(game, env, { seen = new Set(), done = new Set(), seamM = 0.025, nearM = 0.25, detail = 200 } = {}) {
    const corners = new Map();
    const cell = nearM;
    for (const tri of drawnSurfaces(game, env, done)) {
        if (!tri.fresh || (tri.kind !== 'structure' && tri.kind !== 'stone')) continue;
        for (let k = 0; k < 9; k += 3) {
            const key = `${tri.mesh}:${tri.owner}:${Math.round(tri[k] * 1000)},${Math.round(tri[k + 1] * 1000)},${Math.round(tri[k + 2] * 1000)}`;
            if (!corners.has(key)) corners.set(key, { x: tri[k], y: tri[k + 1], z: tri[k + 2], group: `${tri.mesh}:${tri.owner}`, kind: tri.kind });
        }
    }
    const hash = new Map();
    for (const c of corners.values()) {
        const key = `${c.group}:${Math.floor(c.x / cell)},${Math.floor(c.y / cell)},${Math.floor(c.z / cell)}`;
        (hash.get(key) || hash.set(key, []).get(key)).push(c);
    }
    const out = { pairs: 0, worst: [] };
    for (const c of corners.values()) {
        const cx = Math.floor(c.x / cell), cy = Math.floor(c.y / cell), cz = Math.floor(c.z / cell);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
            for (const o of hash.get(`${c.group}:${cx + dx},${cy + dy},${cz + dz}`) || []) {
                if (o === c) continue;
                const d = Math.hypot(o.x - c.x, o.y - c.y, o.z - c.z);
                if (d <= seamM || d >= nearM) continue;
                const a = `${Math.round(c.x * 100)},${Math.round(c.y * 100)},${Math.round(c.z * 100)}`, b = `${Math.round(o.x * 100)},${Math.round(o.y * 100)},${Math.round(o.z * 100)}`;
                const key = a < b ? `${a}|${b}` : `${b}|${a}`;
                if (seen.has(key)) continue;
                seen.add(key);
                out.pairs++;
                if (out.worst.length < detail) out.worst.push({ x: Math.round(c.x * 10) / 10, y: Math.round(c.y * 10) / 10, z: Math.round(c.z * 10) / 10, apartM: Math.round(d * 1000) / 1000, kind: c.kind, s: Math.round(env.route.project(c.x, c.z, null, {}).s) });
            }
        }
    }
    return out;
}

// Pairs of drawn triangles (road ribbons and structures, any two meshes or one) that lie in one plane, within `planeM`,
// facing the same or the opposite way, and overlap over more than `areaM2`: the depth test cannot order them, and they
// flicker (z-fighting). Neighbours on one surface touch along an edge and overlap over nothing, so they do not count.
// `seen` carries pairs already counted across calls. Returns {pairs, byKinds, worst: [{kinds, x, y, z, areaM2, s}]}
// `done` (a Set of geometry ids) carries the meshes already read: a pair of two of them, resident together then, was
// tested then, so only pairs with a mesh new since are tested.
export function coplanarOverlaps(game, env, { seen = new Set(), done = new Set(), planeM = 0.02, areaM2 = 0.01, cosMin = 0.9995, detail = 200 } = {}) {
    const tris = drawnSurfaces(game, env, done);
    const CELL = 4;
    const hash = new Map();
    const geo = tris.map(t => {
        const ux = t[3] - t[0], uy = t[4] - t[1], uz = t[5] - t[2], vx = t[6] - t[0], vy = t[7] - t[1], vz = t[8] - t[2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const len = Math.hypot(nx, ny, nz);
        if (len < 1e-9) return null;
        nx /= len; ny /= len; nz /= len;
        return { n: [nx, ny, nz], d: nx * t[0] + ny * t[1] + nz * t[2], area: len / 2 };
    });
    tris.forEach((t, i) => {
        if (!geo[i]) return;
        const x0 = Math.min(t[0], t[3], t[6]), x1 = Math.max(t[0], t[3], t[6]), z0 = Math.min(t[2], t[5], t[8]), z1 = Math.max(t[2], t[5], t[8]);
        for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
            const key = cx * 65536 + cz;
            (hash.get(key) || hash.set(key, []).get(key)).push(i);
        }
    });
    // The overlap of two triangles in their common plane: both dropped onto the plane's two axes, one clipped by the other
    const overlap = (a, b, n) => {
        const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
        const [p, q] = ay >= ax && ay >= az ? [0, 2] : ax >= az ? [1, 2] : [0, 1];
        const poly = tri => [[tri[p], tri[q]], [tri[p + 3], tri[q + 3]], [tri[p + 6], tri[q + 6]]];
        const area = pts => { let s = 0; for (let i = 0; i < pts.length; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length]; s += x0 * y1 - x1 * y0; } return s / 2; };
        let subject = poly(a);
        let clip = poly(b);
        if (area(clip) < 0) clip = clip.reverse();
        for (let i = 0; i < 3 && subject.length; i++) {
            const [cx0, cy0] = clip[i], [cx1, cy1] = clip[(i + 1) % 3];
            const inside = ([x, y]) => (cx1 - cx0) * (y - cy0) - (cy1 - cy0) * (x - cx0) >= -1e-9;
            const cut = ([x0, y0], [x1, y1]) => {
                const a1 = (cx1 - cx0) * (y0 - cy0) - (cy1 - cy0) * (x0 - cx0), a2 = (cx1 - cx0) * (y1 - cy0) - (cy1 - cy0) * (x1 - cx0);
                const t = a1 / (a1 - a2);
                return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
            };
            const next = [];
            for (let k = 0; k < subject.length; k++) {
                const cur = subject[k], prev = subject[(k + subject.length - 1) % subject.length];
                if (inside(cur)) { if (!inside(prev)) next.push(cut(prev, cur)); next.push(cur); } else if (inside(prev)) next.push(cut(prev, cur));
            }
            subject = next;
        }
        if (subject.length < 3) return 0;
        // The area in the plane, not in its projection
        return Math.abs(area(subject)) / Math.max(ax, ay, az);
    };
    const out = { pairs: 0, byKinds: {}, worst: [] };
    const checked = new Set();
    for (const list of hash.values()) {
        for (let x = 0; x < list.length; x++) {
            const i = list[x], gi = geo[i], ti = tris[i];
            for (let y = x + 1; y < list.length; y++) {
                const j = list[y], gj = geo[j], tj = tris[j];
                if (!ti.fresh && !tj.fresh) continue;
                const dot = gi.n[0] * gj.n[0] + gi.n[1] * gj.n[1] + gi.n[2] * gj.n[2];
                if (Math.abs(dot) < cosMin) continue;
                // Every corner of j within planeM of i's plane
                let far = false;
                for (let k = 0; k < 9 && !far; k += 3) if (Math.abs(gi.n[0] * tj[k] + gi.n[1] * tj[k + 1] + gi.n[2] * tj[k + 2] - gi.d) > planeM) far = true;
                if (far) continue;
                const pair = i < j ? `${i}:${j}` : `${j}:${i}`;
                if (checked.has(pair)) continue;
                checked.add(pair);
                const area = overlap(ti, tj, gi.n);
                if (area <= areaM2) continue;
                const round = t => t.map(c => Math.round(c * 50)).join(',');
                const a = round(ti), b = round(tj);
                const key = a < b ? `${a}|${b}` : `${b}|${a}`;
                if (seen.has(key)) continue;
                seen.add(key);
                out.pairs++;
                const kinds = [ti.kind, tj.kind].sort().join('/');
                out.byKinds[kinds] = (out.byKinds[kinds] || 0) + 1;
                if (out.worst.length < detail) {
                    const cx = (ti[0] + ti[3] + ti[6]) / 3, cz = (ti[2] + ti[5] + ti[8]) / 3;
                    out.worst.push({ kinds, x: Math.round(cx * 10) / 10, y: Math.round((ti[1] + ti[4] + ti[7]) / 3 * 10) / 10, z: Math.round(cz * 10) / 10, areaM2: Math.round(area * 1000) / 1000, s: Math.round(env.route.project(cx, cz, null, {}).s) });
                }
            }
        }
    }
    return out;
}
