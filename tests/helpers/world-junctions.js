// The junctions of a world as they are drawn. Shared by the node test (tests/unit/world-junctions.test.js) and the GPU
// probe (tools/terrain-check.mjs world-junctions). Two self-contained functions with no imports, so a probe can pass
// them into a page with toString().
//
// junctionWindow(game, env, store, at) reads every ride junction within `nearM` of `at`, once, from the drawn triangles
// only (road ribbons, road works, land), never the builders' own records. For each side road that leaves the junction
// it walks the road's centre line and its two wheel lines from the node out to `reachM`, every `stepM`, and reads the
// road surface drawn there (the highest ribbon within 3 m of the surface at the step before, so a bridge over the
// place is not read as the road):
//   - steps: the surface jumps more than `stepTolM` between two places `stepM` apart (a side road that does not meet
//     the ride at the ride's height, or two pieces of one road at two heights)
//   - holes: no road surface is drawn at a place between two places that have one
//   - sunk: the land or an apron stands over the road's surface (the road runs in the ground)
// and in the mouth (the first `mouthM` of the side road past the ride's edge):
//   - decks: a deck, soffit, pier or parapet of the side road (the road leaves the ride on a bridge that starts in the
//     junction: grey concrete on the ride's edge, a dark underside over the bank)
//   - open: the side road's drawn edge hangs more than `openM` over the ground with nothing drawn under it (no wall,
//     no deck's side)
//   - walls: the ride's own stone (a retaining wall, its coping, its parapet, a wall past its end or one that bridges a
//     gap) drawn over the side road's centre line or wheel lines, from the junction's node to `mouthM` past the ride's
//     edge, more than `wallUpM` over the road's surface: the side road is shut by a wall
//   - blocked: the same lines as the physics meets them (WorldGround.zoneAt and wallBand, the one exception to the drawn
//     triangles): a place on the side road beside the ride where the ride's wall band makes a wall, so a rider who turns
//     off is stopped at the mouth
//
//   - cliffs: the ground a road lays in the mouth (a slope, the ground under a verge) standing as a face: a triangle
//     steeper than `cliffSlope` that falls more than `openM` (a slope's foot dropped to the land under the gap between
//     the ride and a side road beside it a little under the ride: a dark face between the two roads, seen from the ride)
//
// junctionReport(store) returns {junctions, roads, steps, holes, sunk, decks, open, walls, blocked, cliffs}: each a list, worst first, of
// {s, junction, edge, ...} (s the metres of ride at the junction).
// (cliffs: at d2c4527 eight on the Tremola slice, the km 2.3 mouth worst, a slope's foot 3 m down in the gap between
// the ride and the side road; three stand, at km 5.2, 5.3 and 6.1, 0.66 to 1.01 m, not of that kind; none on the fixture)
export const JUNCTION_LIMITS = { steps: 0, holes: 0, sunk: 0, decks: 0, open: 0, walls: 0, blocked: 0, cliffs: 3 };

export function junctionWindow(game, env, store, at, { nearM = 350, reachM = 40, stepM = 0.5, stepTolM = 0.2, mouthM = 12, openM = 0.6, wallUpM = 0.15, cliffSlope = 3 } = {}) {
    const { THREE } = game;
    store.roads = store.roads || new Map();
    store.grids = store.grids || new Map();
    const v = new THREE.Vector3();
    const r2 = n => Math.round(n * 100) / 100;

    // The triangles of a mesh from `start` for `count` vertices, hashed in plan: ys(x, z) is the height of each over
    // (x, z). `pick(i)` leaves a triangle out. Made once for a geometry
    const gridOf = (mesh, start, count, cell, key, pick = null) => {
        const id = `${mesh.geometry.uuid}:${key}`;
        if (store.grids.has(id)) return store.grids.get(id);
        mesh.updateMatrixWorld(true);
        const pos = mesh.geometry.attributes.position, index = mesh.geometry.index;
        const tris = [], hash = new Map();
        for (let i = start; i + 2 < start + count; i += 3) {
            if (pick && !pick(i / 3)) continue;
            const t = new Float64Array(9);
            for (let k = 0; k < 3; k++) { v.fromBufferAttribute(pos, index ? index.getX(i + k) : i + k).applyMatrix4(mesh.matrixWorld); t[k * 3] = v.x; t[k * 3 + 1] = v.y; t[k * 3 + 2] = v.z; }
            if (Math.abs((t[3] - t[0]) * (t[8] - t[2]) - (t[6] - t[0]) * (t[5] - t[2])) < 1e-6) continue;
            const ref = tris.push(t) - 1;
            for (let cx = Math.floor(Math.min(t[0], t[3], t[6]) / cell); cx <= Math.floor(Math.max(t[0], t[3], t[6]) / cell); cx++) {
                for (let cz = Math.floor(Math.min(t[2], t[5], t[8]) / cell); cz <= Math.floor(Math.max(t[2], t[5], t[8]) / cell); cz++) {
                    const h = cx * 65536 + cz;
                    (hash.get(h) || hash.set(h, []).get(h)).push(ref);
                }
            }
        }
        const grid = {
            ys(x, z, out = []) {
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

    // The upright faces of the works (walls, parapets, a deck's sides), hashed in plan by their boxes: closes(x, z, y0,
    // y1) is true where one stands within 0.4 m of (x, z) and reaches from under y0 + 0.3 up to y1 - 0.3 or higher
    const facesOf = (mesh, start, count, key) => {
        const id = `${mesh.geometry.uuid}:${key}`;
        if (store.grids.has(id)) return store.grids.get(id);
        mesh.updateMatrixWorld(true);
        const pos = mesh.geometry.attributes.position, index = mesh.geometry.index;
        const boxes = [], hash = new Map(), cell = 4;
        for (let i = start; i + 2 < start + count; i += 3) {
            const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
            for (let k = 0; k < 3; k++) { v.fromBufferAttribute(pos, index ? index.getX(i + k) : i + k).applyMatrix4(mesh.matrixWorld); b[0] = Math.min(b[0], v.x); b[1] = Math.min(b[1], v.y); b[2] = Math.min(b[2], v.z); b[3] = Math.max(b[3], v.x); b[4] = Math.max(b[4], v.y); b[5] = Math.max(b[5], v.z); }
            if (b[4] - b[1] < 0.3) continue;
            const ref = boxes.push(b) - 1;
            for (let cx = Math.floor((b[0] - 0.4) / cell); cx <= Math.floor((b[3] + 0.4) / cell); cx++) for (let cz = Math.floor((b[2] - 0.4) / cell); cz <= Math.floor((b[5] + 0.4) / cell); cz++) { const h = cx * 65536 + cz; (hash.get(h) || hash.set(h, []).get(h)).push(ref); }
        }
        const faces = { closes(x, z, y0, y1) { for (const ref of hash.get(Math.floor(x / cell) * 65536 + Math.floor(z / cell)) || []) { const b = boxes[ref]; if (x >= b[0] - 0.4 && x <= b[3] + 0.4 && z >= b[2] - 0.4 && z <= b[5] + 0.4 && b[1] <= y0 + 0.3 && b[4] >= y1 - 0.3) return true; } return false; } };
        store.grids.set(id, faces);
        return faces;
    };

    const land = [], aprons = [], ribbons = [], built = [], upright = [], stone = [], laid = [], rideRibbons = [], sideRibbons = [];
    for (const tile of env.tileMeshes.values()) {
        const mesh = tile.mesh || tile;
        if (!mesh || !mesh.isMesh || !/lod0$/.test(mesh.name)) continue;
        land.push(gridOf(mesh, 0, mesh.geometry.index ? mesh.geometry.index.count : mesh.geometry.attributes.position.count, 8, 'land'));
    }
    const rideGroups = new Set(env.roadMeshes.values());
    for (const group of [...env.roadMeshes.values(), ...env.sideMeshes.values()]) {
        group.traverse(o => {
            if (!o.isMesh) return;
            const whole = o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count;
            if (o.name === 'road-works') {
                const owners = o.geometry.userData.owners;
                for (const g of o.geometry.groups) {
                    if (g.materialIndex === 0 || g.materialIndex === 3) aprons.push(gridOf(o, g.start, g.count, 4, g.materialIndex ? 'paving' : 'apron'));
                    if (g.materialIndex === 0) laid.push({ mesh: o, start: g.start, count: g.count, ride: rideGroups.has(group) });
                    // The concrete (decks, soffits, piers, tubes and their parapets) of the side roads, by its road
                    else if (g.materialIndex === 1 || g.materialIndex >= 4) built.push({ mesh: o, start: g.start, count: g.count, owners });
                    if (g.materialIndex === 1 || g.materialIndex === 2 || g.materialIndex >= 4) upright.push(facesOf(o, g.start, g.count, `faces${g.materialIndex}`));
                    // (the ride's own stone, its walls and their copings: a top in plan over a side road shuts it)
                    if (g.materialIndex === 2 && rideGroups.has(group)) stone.push(gridOf(o, g.start, g.count, 4, 'stone'));
                }
            } else if (o.name === 'road-ribbon' || o.name === 'road-side') {
                const grid = gridOf(o, 0, whole, 4, 'ribbon');
                ribbons.push(grid);
                (rideGroups.has(group) ? rideRibbons : sideRibbons).push(grid);
            }
        });
    }
    const all = (grids, x, z) => { const out = []; for (const g of grids) g.ys(x, z, out); return out; };
    // The road surface drawn at (x, z) nearest under or over `y`, within 3 m of it; the highest of two that lie
    // within 5 cm of each other (a side ribbon held under the ride's)
    const roadAt = (x, z, y) => {
        let best = null;
        for (const h of all(ribbons, x, z)) if (Math.abs(h - y) <= 3 && (best === null || h > best)) best = h;
        return best;
    };
    const groundAt = (x, z) => { const hs = [...all(land, x, z), ...all(aprons, x, z)]; return hs.length ? Math.max(...hs) : null; };
    const near = {};

    let fresh = 0;
    for (const junction of env.graph.junctions) {
        const pass = junction.passes[0];
        if (!pass) continue;
        for (const { edgeId } of junction.incident) {
            const edge = env.data.edges[edgeId];
            if (!edge || edge.onRide) continue;
            const id = `${junction.id}:${edgeId}`;
            if (store.roads.has(id)) continue;
            const { rows, complete } = env.graph.chainFrom(edgeId, junction.node, reachM);
            if (!complete || rows.length < 2) continue;
            if (Math.hypot(rows[0].x - at.x, rows[0].z - at.z) > nearM) continue;
            const width = env.graph.stubWidth(edgeId);
            const chain = new Set(rows.map(r => r.edgeId));
            const road = { junction: junction.id, name: junction.name, edge: edgeId, s: Math.round(pass.sIn), width: r2(width), lengthM: r2(rows[rows.length - 1].run), steps: [], holes: [], sunk: [], decks: [], open: [], walls: [], blocked: [], cliffs: [], samples: 0 };
            // The place `d` metres along the side road and `lat` metres right of its centre line
            let k = 0;
            const place = (d, lat) => {
                while (k + 2 < rows.length && rows[k + 1].run < d) k++;
                while (k > 0 && rows[k].run > d) k--;
                const p = rows[k], q = rows[k + 1];
                const t = q.run > p.run ? Math.max(0, Math.min(1, (d - p.run) / (q.run - p.run))) : 0;
                const h = Math.atan2(q.x - p.x, q.z - p.z);
                return { x: p.x + (q.x - p.x) * t + lat * Math.cos(h), z: p.z + (q.z - p.z) * t - lat * Math.sin(h), y: p.y + (q.y - p.y) * t };
            };
            // Where the side road's centre line leaves the ride's carriageway
            let edgeD = 0;
            for (let d = 0; d <= Math.min(reachM, road.lengthM); d += stepM) {
                const p = place(d, 0);
                let inside = false;
                env.carriageways.each(p.x, p.z, 0, r => { if (r.road === -1 && r.depth >= 0 && Math.abs(r.y - p.y) < 3) inside = true; });
                if (inside) edgeD = d + stepM;
            }
            road.edgeM = r2(edgeD);
            for (const lat of [0, -0.35 * width, 0.35 * width]) {
                let last = null, gap = 0;
                for (let d = 0; d <= Math.min(reachM, road.lengthM) + 1e-9; d += stepM) {
                    const p = place(d, lat);
                    const y = roadAt(p.x, p.z, last === null ? p.y : last.y);
                    road.samples++;
                    if (y === null) { gap++; continue; }
                    if (last !== null) {
                        if (gap) road.holes.push({ d: r2(d - gap * stepM), lat: r2(lat), lengthM: r2(gap * stepM), x: r2(p.x), z: r2(p.z) });
                        // A hole is not a step too: the surface is compared across `stepM` only
                        else if (Math.abs(y - last.y) > stepTolM) road.steps.push({ d: r2(d), lat: r2(lat), stepM: r2(y - last.y), x: r2(p.x), y: r2(y), z: r2(p.z) });
                    }
                    gap = 0;
                    last = { y };
                    const g = groundAt(p.x, p.z);
                    if (g !== null && g > y + 0.05) road.sunk.push({ d: r2(d), lat: r2(lat), overM: r2(g - y), x: r2(p.x), z: r2(p.z) });
                }
            }
            // The ride's stone over the side road in its mouth, drawn and as the physics meets it
            const locate = {}, hint = { start: env.route.indexAt(road.s) - 12, end: env.route.indexAt(road.s) + 12 };
            for (const lat of [0, -0.35 * width, 0.35 * width]) {
                for (let d = 0; d <= Math.min(edgeD + mouthM, road.lengthM) + 1e-9; d += stepM) {
                    const p = place(d, lat);
                    const y = roadAt(p.x, p.z, p.y) ?? p.y;
                    const over = all(stone, p.x, p.z).filter(h => h > y + wallUpM && h < y + 3);
                    if (over.length) road.walls.push({ d: r2(d), lat: r2(lat), upM: r2(Math.max(...over) - y), x: r2(p.x), z: r2(p.z) });
                    const loc = env.ground.locate(p.x, p.z, hint, locate);
                    const half = loc.width / 2, reach = Math.abs(loc.lateral);
                    if (reach <= half || Math.abs(loc.roadY - y) > 1.5 || typeof env.ground.wallBand !== 'function') continue;
                    const band = env.ground.wallBand(loc, half);
                    if (band && reach >= band.from && env.ground.zoneAt(loc, half).kind === 'wall') road.blocked.push({ d: r2(d), lat: r2(lat), s: Math.round(env.route.points[loc.index].s), reachM: r2(reach), x: r2(p.x), z: r2(p.z) });
                }
            }
            // The side road's own concrete in the mouth: the plan of each triangle's centre against the road's first metres
            for (const part of built) {
                if (!part.owners) continue;
                const pos = part.mesh.geometry.attributes.position, index = part.mesh.geometry.index;
                for (let i = part.start; i + 2 < part.start + part.count; i += 3) {
                    if (!chain.has(part.owners[i / 3])) continue;
                    let cx = 0, cy = 0, cz = 0;
                    for (let c = 0; c < 3; c++) { v.fromBufferAttribute(pos, index ? index.getX(i + c) : i + c).applyMatrix4(part.mesh.matrixWorld); cx += v.x / 3; cy += v.y / 3; cz += v.z / 3; }
                    if (Math.hypot(cx - rows[0].x, cz - rows[0].z) > edgeD + mouthM + width) continue;
                    // Metres along the side road: the nearest of its places
                    let best = Infinity, bestD = 0;
                    for (let d = 0; d <= Math.min(reachM, road.lengthM); d += 1) { const p = place(d, 0); const far = Math.hypot(p.x - cx, p.z - cz); if (far < best) { best = far; bestD = d; } }
                    if (bestD <= edgeD + mouthM && best <= width / 2 + 2) road.decks.push({ d: bestD, x: r2(cx), y: r2(cy), z: r2(cz) });
                }
            }
            // The side road's two drawn edges in the mouth: from the carriageway out to the last place its ribbon is
            // drawn, and the drop from there to the ground just past it
            for (const side of [-1, 1]) {
                for (let d = edgeD + 1; d <= Math.min(edgeD + mouthM, road.lengthM); d += 1) {
                    let lat = width / 2 - 0.3;
                    let on = place(d, side * lat);
                    let y = roadAt(on.x, on.z, on.y);
                    if (y === null) continue;
                    for (let more = lat + 0.25; more <= width / 2 + 4; more += 0.25) {
                        const p = place(d, side * more), h = roadAt(p.x, p.z, y);
                        if (h === null) break;
                        lat = more; on = p; y = h;
                    }
                    // Another road beside it (the ride, at the mouth) closes the edge
                    if (lat > width / 2 + 3.5) continue;
                    const out = place(d, side * (lat + 0.3));
                    const g = groundAt(out.x, out.z);
                    if (g === null || y - g <= openM) continue;
                    if (upright.some(f => f.closes(out.x, out.z, g, y) || f.closes(on.x, on.z, g, y))) continue;
                    road.open.push({ d: r2(d), side, dropM: r2(y - g), x: r2(out.x), z: r2(out.z) });
                }
            }
            // The ground the roads lay in the mouth that stands as a face: a triangle steeper than `cliffSlope` that
            // falls more than `openM` (a slope whose foot was dropped to the land under the gap between the ride and a
            // side road a little under it: a dark face between the two roads, seen from the ride)
            for (const part of laid) {
                const pos = part.mesh.geometry.attributes.position, index = part.mesh.geometry.index;
                for (let i = part.start; i + 2 < part.start + part.count; i += 3) {
                    const t = [];
                    for (let c = 0; c < 3; c++) { v.fromBufferAttribute(pos, index ? index.getX(i + c) : i + c).applyMatrix4(part.mesh.matrixWorld); t.push([v.x, v.y, v.z]); }
                    const cx = (t[0][0] + t[1][0] + t[2][0]) / 3, cz = (t[0][2] + t[1][2] + t[2][2]) / 3;
                    if (Math.hypot(cx - rows[0].x, cz - rows[0].z) > edgeD + mouthM + width) continue;
                    const span = Math.max(t[0][1], t[1][1], t[2][1]) - Math.min(t[0][1], t[1][1], t[2][1]);
                    if (span <= openM) continue;
                    const ux = t[1][0] - t[0][0], uy = t[1][1] - t[0][1], uz = t[1][2] - t[0][2], wx = t[2][0] - t[0][0], wy = t[2][1] - t[0][1], wz = t[2][2] - t[0][2];
                    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
                    if (Math.hypot(nx, nz) <= cliffSlope * Math.abs(ny)) continue;
                    // (seen beside the other road, not under it: a corner of it lies past every ribbon, and the other
                    // road's surface, the side road's beside the ride's ground or the ride's beside a side road's,
                    // within `openM` of that corner stands more than `openM` over the face's foot)
                    const lowY = Math.min(t[0][1], t[1][1], t[2][1]);
                    const bare = t.filter(q => { const a = [q[0] + (cx - q[0]) * 0.1, q[2] + (cz - q[2]) * 0.1]; return all(ribbons, a[0], a[1]).every(h => h < q[1] - 0.05); });
                    if (!bare.length) continue;
                    let over = -Infinity;
                    const other = part.ride ? sideRibbons : rideRibbons;
                    for (const q of bare) for (const [dx, dz] of [[openM, 0], [-openM, 0], [0, openM], [0, -openM]]) for (const h of all(other, q[0] + dx, q[2] + dz)) if (h > over && h - q[1] < 3) over = h;
                    if (over - lowY <= openM) continue;
                    let best = Infinity, bestD = 0;
                    for (let d = 0; d <= Math.min(reachM, road.lengthM); d += 1) { const p = place(d, 0); const far = Math.hypot(p.x - cx, p.z - cz); if (far < best) { best = far; bestD = d; } }
                    if (bestD > edgeD + mouthM || best > width / 2 + 3) continue;
                    road.cliffs.push({ d: bestD, dropM: r2(span), x: r2(cx), z: r2(cz) });
                }
            }
            env.route.project(rows[0].x, rows[0].z, null, near);
            store.roads.set(id, road);
            fresh++;
        }
    }
    return { fresh, roads: store.roads.size };
}

export function junctionReport(store) {
    const roads = [...(store.roads || new Map()).values()];
    const out = { junctions: new Set(roads.map(r => r.junction)).size, roads: roads.length, samples: roads.reduce((n, r) => n + r.samples, 0), steps: [], holes: [], sunk: [], decks: [], open: [], walls: [], blocked: [], cliffs: [] };
    for (const road of roads) {
        const where = { s: road.s, junction: road.junction, edge: road.edge };
        if (road.steps.length) { const worst = road.steps.reduce((a, b) => (Math.abs(b.stepM) > Math.abs(a.stepM) ? b : a)); out.steps.push({ ...where, places: road.steps.length, worstM: worst.stepM, d: worst.d, x: worst.x, z: worst.z }); }
        if (road.holes.length) { const worst = road.holes.reduce((a, b) => (b.lengthM > a.lengthM ? b : a)); out.holes.push({ ...where, places: road.holes.length, worstM: worst.lengthM, d: worst.d, x: worst.x, z: worst.z }); }
        if (road.sunk.length) { const worst = road.sunk.reduce((a, b) => (b.overM > a.overM ? b : a)); out.sunk.push({ ...where, places: road.sunk.length, worstM: worst.overM, d: worst.d, x: worst.x, z: worst.z }); }
        if (road.decks.length) out.decks.push({ ...where, triangles: road.decks.length, d: Math.min(...road.decks.map(p => p.d)), x: road.decks[0].x, z: road.decks[0].z });
        if (road.open.length) { const worst = road.open.reduce((a, b) => (b.dropM > a.dropM ? b : a)); out.open.push({ ...where, places: road.open.length, worstM: worst.dropM, d: worst.d, x: worst.x, z: worst.z }); }
        if (road.walls.length) { const worst = road.walls.reduce((a, b) => (b.upM > a.upM ? b : a)); out.walls.push({ ...where, places: road.walls.length, worstM: worst.upM, d: worst.d, x: worst.x, z: worst.z }); }
        if (road.cliffs.length) { const worst = road.cliffs.reduce((a, b) => (b.dropM > a.dropM ? b : a)); out.cliffs.push({ ...where, triangles: road.cliffs.length, worstM: worst.dropM, d: worst.d, x: worst.x, z: worst.z }); }
        if (road.blocked.length) out.blocked.push({ ...where, places: road.blocked.length, worstM: Math.min(...road.blocked.map(b => b.d)), d: road.blocked[0].d, rideS: road.blocked[0].s, x: road.blocked[0].x, z: road.blocked[0].z });
    }
    for (const kind of ['steps', 'holes', 'sunk', 'open', 'walls', 'blocked', 'cliffs']) out[kind].sort((a, b) => Math.abs(b.worstM) - Math.abs(a.worstM));
    out.decks.sort((a, b) => b.triangles - a.triangles);
    return out;
}
