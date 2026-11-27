// Where two roads meet, or run beside each other, as drawn: every junction node of a world, the ride's and the side
// roads' own (a side road that meets another side road is ridden in free roam), read from the drawn triangles only
// (land tiles at full detail, every road's ribbon and works). Shared by tests/unit/world-meets.test.js. No imports.
//
// meetWindow(game, env, store, nodes) reads each node of `nodes` ({node, s, ride}: the graph node, the ride's metres
// nearest it, whether it is a ride junction) once, within `areaM` of the node:
//   - bands: two roads whose carriageway edges lie less than `bandReachM` apart, read square from each edge every
//     metre, with the top of what is drawn between them more than `bandDipM` under the lower edge, or nothing drawn:
//     land sunk between the two roads, a gap to the valley under them
//   - ledges: on the same lines, the higher road's edge standing more than `ledgeM` over what is drawn just past it,
//     with no wall or bank face under it: a road's edge in the air over the land between two roads
//   - see: from the far and the near chase camera on the ride before the node, a ray at a place between the roads or
//     round the node that meets nothing in `rayM`, or meets the underside of the land: a hole you see through
//   - proud: the end of a wall's or a parapet's top within `areaM` of the node standing more than `proudM` over what is
//     drawn a metre past its end (a wall's end at full height by a mouth or a road beside)
//   - steps: along every road that leaves the node (centre and wheel lines, out to `reachM`), the drawn surface jumping
//     more than `stepM` (two carriageways that meet at two heights); holes: no surface between two that have one
//   - overlaps: a place in the carriageways of two roads where both roads' ribbons are drawn more than `overlapM` apart
//     (torn slivers of one road through the other)
//   - loose: a triangle of a junction's paving whose middle lies more than `looseM` from every carriageway
//   - markings: a line (a centre or an edge line) of one road drawn on top inside the carriageway of a road that has
//     the right of way over it (the ride over every side road; a wider side road over a narrower one)
//   - landIn: the land drawn on top where a road's ribbon or a junction's paving lies under it within 0.5 m
//
// meetReport(store) returns, for each kind, a list of {node, s, ride, places, worst, x, z}, worst first.
export const MEET_KINDS = ['bands', 'ledges', 'see', 'proud', 'steps', 'holes', 'overlaps', 'loose', 'markings', 'landIn'];

export function meetWindow(game, env, store, nodes, { areaM = 30, reachM = 40, lattice = 0.25, bandReachM = 4, bandDipM = 0.25, ledgeM = 0.3, proudM = 1, stepM = 0.2, overlapM = 0.15, looseM = 1.5, rayM = 90, cameras = [[12, 8], [6, 3]], camerasAt = [40, 25, 10] } = {}) {
    const { THREE } = game;
    const M = game.RoadSurface.MARKINGS, lineHalf = M.lineWidthM / 2 + 0.02, inset = M.edge.insetM;
    store.nodes = store.nodes || new Map();
    const r2 = n => Math.round(n * 100) / 100;
    const v = new THREE.Vector3();
    const data = env.data, graph = env.graph;
    const rideGroups = new Set(env.roadMeshes.values());

    // Every triangle drawn near the nodes, hashed in plan by `cell`: [x0 y0 z0 x1 y1 z1 x2 y2 z2] and its kind
    const cell = 2, tris = [], kinds = [], attrs = [], hash = new Map();
    const centres = nodes.map(n => ({ x: data.nodes.x[n.node], z: data.nodes.z[n.node] }));
    const reach = Math.max(areaM + 10, rayM);
    const near = (x, z, pad) => centres.some(c => Math.abs(c.x - x) < reach + pad && Math.abs(c.z - z) < reach + pad);
    const take = (mesh, start, count, kind, attr = null) => {
        const geo = mesh.geometry;
        if (!geo.boundingSphere) geo.computeBoundingSphere();
        mesh.updateMatrixWorld(true);
        const bs = geo.boundingSphere.center.clone().applyMatrix4(mesh.matrixWorld);
        if (!near(bs.x, bs.z, geo.boundingSphere.radius)) return;
        const pos = geo.attributes.position, index = geo.index;
        for (let i = start; i + 2 < start + count; i += 3) {
            const t = new Float64Array(9);
            for (let k = 0; k < 3; k++) { v.fromBufferAttribute(pos, index ? index.getX(i + k) : i + k).applyMatrix4(mesh.matrixWorld); t[k * 3] = v.x; t[k * 3 + 1] = v.y; t[k * 3 + 2] = v.z; }
            if (!near(t[0], t[2], 0)) continue;
            const ref = tris.push(t) - 1;
            kinds[ref] = kind;
            if (attr) attrs[ref] = [0, 1, 2].map(k => attr(index ? index.getX(i + k) : i + k));
            for (let cx = Math.floor(Math.min(t[0], t[3], t[6]) / cell); cx <= Math.floor(Math.max(t[0], t[3], t[6]) / cell); cx++) {
                for (let cz = Math.floor(Math.min(t[2], t[5], t[8]) / cell); cz <= Math.floor(Math.max(t[2], t[5], t[8]) / cell); cz++) {
                    const h = cx * 65536 + cz;
                    (hash.get(h) || hash.set(h, []).get(h)).push(ref);
                }
            }
        }
    };
    for (const tile of env.tileMeshes.values()) {
        const mesh = tile.mesh || tile;
        if (mesh && mesh.isMesh && /lod0$/.test(mesh.name)) take(mesh, 0, mesh.geometry.index ? mesh.geometry.index.count : mesh.geometry.attributes.position.count, 'land');
    }
    for (const group of [...env.roadMeshes.values(), ...env.sideMeshes.values()]) {
        const ride = rideGroups.has(group);
        group.traverse(o => {
            if (!o.isMesh) return;
            const whole = o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count;
            if (o.name === 'road-works') {
                for (const g of o.geometry.groups) take(o, g.start, g.count, g.materialIndex === 0 ? 'ground' : g.materialIndex === 3 ? 'paving' : g.materialIndex === 2 ? 'stone' : 'concrete');
            } else if (o.name === 'road-ribbon' || o.name === 'road-side') {
                const { uv, road, edge } = o.geometry.attributes;
                take(o, 0, whole, ride ? 'ride' : 'side', uv && road && edge ? (i => [uv.getX(i), road.getX(i), road.getZ(i), edge.getX(i), edge.getY(i), road.getW(i)]) : null);
            }
        });
    }

    // Each surface drawn at (x, z): {y, kind, ref, w (barycentric weights)}
    const hitsAt = (x, z) => {
        const out = [];
        for (const ref of hash.get(Math.floor(x / cell) * 65536 + Math.floor(z / cell)) || []) {
            const t = tris[ref];
            const d = (t[5] - t[8]) * (t[0] - t[6]) + (t[6] - t[3]) * (t[2] - t[8]);
            if (Math.abs(d) < 1e-9) continue;
            const a = ((t[5] - t[8]) * (x - t[6]) + (t[6] - t[3]) * (z - t[8])) / d, b = ((t[8] - t[2]) * (x - t[6]) + (t[0] - t[6]) * (z - t[8])) / d, c = 1 - a - b;
            if (a < -1e-9 || b < -1e-9 || c < -1e-9) continue;
            out.push({ y: a * t[1] + b * t[4] + c * t[7], kind: kinds[ref], ref, w: [a, b, c] });
        }
        return out;
    };
    const ROAD = new Set(['ride', 'side']), SURFACE = new Set(['ride', 'side', 'paving', 'ground', 'land', 'stone', 'concrete']);
    // The highest of `set` drawn at (x, z) within `tol` of y
    const topOf = (x, z, y, tol, set = SURFACE) => { let best = null; for (const h of hitsAt(x, z)) if (set.has(h.kind) && Math.abs(h.y - y) <= tol && (best === null || h.y > best.y)) best = h; return best; };
    // How a ribbon draws the place it is hit at: {lat, half, centre, edgeL, edgeR, verge alpha}
    const look = h => {
        const w = attrs[h.ref];
        if (!w) return null;
        const at = j => h.w[0] * w[0][j] + h.w[1] * w[1][j] + h.w[2] * w[2][j];
        const lat = at(0), half = at(1), out = Math.abs(lat) - half;
        const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
        return { lat, half, centre: Math.round(at(2)), edgeL: Math.round(at(3)), edgeR: Math.round(at(4)), out, alpha: out < 0 ? 1 : 1 - smooth(0.3, 1.0, out) };
    };
    // The same, leaving out a ribbon's verge where its shader draws it under half opaque
    const drawnTop = (x, z, y, tol) => { let best = null; for (const h of hitsAt(x, z)) { if (!SURFACE.has(h.kind) || Math.abs(h.y - y) > tol || (best && h.y <= best.y)) continue; const l = ROAD.has(h.kind) ? look(h) : null; if (l && l.alpha < 0.5) continue; best = h; } return best; };
    // Whether an upright face (a wall, a bank's foot face, a deck's side) stands within 0.4 m of (x, z) from under y0
    // up to y1
    const faced = (x, z, y0, y1) => {
        for (let dx = -0.4; dx <= 0.41; dx += 0.4) for (let dz = -0.4; dz <= 0.41; dz += 0.4) {
            for (const ref of hash.get(Math.floor((x + dx) / cell) * 65536 + Math.floor((z + dz) / cell)) || []) {
                const t = tris[ref];
                if (kinds[ref] === 'ride' || kinds[ref] === 'side' || kinds[ref] === 'land') continue;
                const lo = Math.min(t[1], t[4], t[7]), hi = Math.max(t[1], t[4], t[7]);
                if (hi - lo < 0.2 || lo > y0 + 0.15 || hi < y1 - 0.15) continue;
                const mx = Math.min(t[0], t[3], t[6]), Mx = Math.max(t[0], t[3], t[6]), mz = Math.min(t[2], t[5], t[8]), Mz = Math.max(t[2], t[5], t[8]);
                if (x >= mx - 0.4 && x <= Mx + 0.4 && z >= mz - 0.4 && z <= Mz + 0.4) return true;
            }
        }
        return false;
    };
    // The roads whose carriageway holds (x, z) within `depth` of its edge, at a height within `tol` of y
    const roadsAt = (x, z, y, tol, depth = 0) => { const out = []; env.carriageways.each(x, z, Math.max(0, -depth), r => { if (r.depth >= depth && Math.abs(r.y - y) <= tol) out.push(r); }); return out; };
    const priority = road => (road === -1 ? Infinity : graph.stubWidth(road) * 1000 - road / 1e6);
    // A ray from `o` along unit `d`: the nearest triangle it meets within `len`, {t, under} (under: the land met from below)
    const stamp = new Map();
    let pass = 0;
    const ray = (o, d, len) => {
        pass++;
        let best = null;
        const plan = Math.hypot(d.x, d.z), step = cell * 0.5;
        const n = Math.ceil((plan * len) / step) + 1;
        for (let i = 0; i <= n; i++) {
            const s = Math.min(len, (i * step) / Math.max(plan, 1e-6));
            if (best && s > best.t + cell * 2) break;
            const px = o.x + d.x * s, pz = o.z + d.z * s;
            for (const ref of hash.get(Math.floor(px / cell) * 65536 + Math.floor(pz / cell)) || []) {
                if (stamp.get(ref) === pass) continue;
                stamp.set(ref, pass);
                const t = tris[ref];
                const e1x = t[3] - t[0], e1y = t[4] - t[1], e1z = t[5] - t[2], e2x = t[6] - t[0], e2y = t[7] - t[1], e2z = t[8] - t[2];
                const px1 = d.y * e2z - d.z * e2y, py1 = d.z * e2x - d.x * e2z, pz1 = d.x * e2y - d.y * e2x;
                const det = e1x * px1 + e1y * py1 + e1z * pz1;
                if (Math.abs(det) < 1e-12) continue;
                const inv = 1 / det, tx = o.x - t[0], ty = o.y - t[1], tz = o.z - t[2];
                const u = (tx * px1 + ty * py1 + tz * pz1) * inv;
                if (u < 0 || u > 1) continue;
                const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
                const w = (d.x * qx + d.y * qy + d.z * qz) * inv;
                if (w < 0 || u + w > 1) continue;
                const hit = (e2x * qx + e2y * qy + e2z * qz) * inv;
                if (hit <= 1e-4 || hit > len || (best && hit >= best.t)) continue;
                // (the land's normal points up, the sign of its plan cross product: met going the way it points, the ray
                // comes from under the land)
                const up = e1z * e2x - e1x * e2z >= 0 ? 1 : -1;
                best = { t: hit, under: kinds[ref] === 'land' && d.y * up > 0, kind: kinds[ref] };
            }
        }
        return best;
    };

    let fresh = 0;
    for (const n of nodes) {
        if (store.nodes.has(n.node)) continue;
        const nx = data.nodes.x[n.node], nz = data.nodes.z[n.node];
        const incident = graph.edgesAt(n.node).filter(e => !e.onRide);
        const rec = { node: n.node, s: Math.round(n.s), ride: !!n.ride, junction: n.junction ?? null, x: r2(nx), z: r2(nz) };
        for (const kind of MEET_KINDS) rec[kind] = [];
        const ny = (() => { const h = topOf(nx, nz, data.nodes.y ? data.nodes.y[n.node] : 0, 50, ROAD); return h ? h.y : (data.nodes.y ? data.nodes.y[n.node] : 0); })();
        const inTube = (x, z, y) => typeof env.tubeRoofY === 'function' && Number.isFinite(env.tubeRoofY(x, z, y));

        // The roads at the node as lines: the ride round its pass and each road that leaves the node, out to `areaM`
        const lines = [];
        if (n.ride) {
            const rows = [], p = {};
            for (let s = Math.max(env.startS, n.s - areaM); s <= Math.min(env.endS, n.s + areaM) + 1e-9; s += 1) { env.route.sample(s, p); rows.push({ x: p.x, z: p.z, y: p.y, heading: p.heading, half: p.width / 2 }); }
            lines.push({ road: -1, own: new Set([-1]), rows });
        }
        for (const e of incident) {
            const { rows, complete } = graph.chainFrom(e.id, n.node, Math.max(areaM, reachM));
            if (!complete || rows.length < 2) continue;
            lines.push({ road: e.id, own: new Set(rows.map(r => r.edgeId)), rows: rows.map(r => ({ x: r.x, z: r.z, y: r.y, heading: r.heading, half: r.width / 2, run: r.run })), chain: rows });
        }
        // The place `d` metres along a chain and `lat` right of its centre line
        const place = (rows, d, lat) => {
            let k = 0;
            while (k + 2 < rows.length && rows[k + 1].run < d) k++;
            const p = rows[k], q = rows[k + 1];
            const t = q.run > p.run ? Math.max(0, Math.min(1, (d - p.run) / (q.run - p.run))) : 0;
            const h = Math.atan2(q.x - p.x, q.z - p.z);
            return { x: p.x + (q.x - p.x) * t + lat * Math.cos(h), z: p.z + (q.z - p.z) * t - lat * Math.sin(h), y: p.y + (q.y - p.y) * t, half: p.half + (q.half - p.half) * t, bits: (t < 0.5 ? p.bits : q.bits) };
        };

        // steps and holes along each road that leaves the node
        for (const line of lines) {
            if (line.road === -1) continue;
            const rows = line.chain, end = Math.min(reachM, rows[rows.length - 1].run);
            for (const f of [0, -0.35, 0.35]) {
                let last = null, gap = 0;
                for (let d = 0; d <= end + 1e-9; d += 0.5) {
                    const p = place(rows, d, f * 2 * rows[0].width / 2);
                    if (p.bits & 5) { last = null; gap = 0; continue; }
                    const h = topOf(p.x, p.z, last === null ? p.y : last, 3, ROAD);
                    if (!h) { if (last !== null) gap++; continue; }
                    if (last !== null) {
                        if (gap) rec.holes.push({ d: r2(d), road: line.road, worst: r2(gap * 0.5), x: r2(p.x), z: r2(p.z) });
                        else if (Math.abs(h.y - last) > stepM) rec.steps.push({ d: r2(d), road: line.road, worst: r2(h.y - last), x: r2(p.x), z: r2(p.z) });
                    }
                    gap = 0;
                    last = h.y;
                }
            }
        }

        // bands and ledges: square out from each edge of each line, every metre
        const targets = [];
        for (const line of lines) {
            const rows = line.rows;
            for (let i = 0; i < rows.length; i++) {
                const r = rows[i];
                if (Math.hypot(r.x - nx, r.z - nz) > areaM) continue;
                for (const sign of [-1, 1]) {
                    const ox = sign * Math.cos(r.heading), oz = -sign * Math.sin(r.heading);
                    const ex = r.x + ox * r.half, ez = r.z + oz * r.half;
                    const eh = topOf(ex - ox * 0.1, ez - oz * 0.1, r.y, 1.5, ROAD);
                    if (!eh || inTube(ex, ez, eh.y)) continue;
                    let other = null, t0 = null;
                    for (let t = 0.25; t <= bandReachM + 1e-9; t += 0.25) {
                        const rs = roadsAt(ex + ox * t, ez + oz * t, eh.y, 3).filter(q => !line.own.has(q.road));
                        if (rs.length) { other = rs[0]; t0 = t; break; }
                        // (the road's own carriageway, bent back across the line)
                        if (roadsAt(ex + ox * t, ez + oz * t, eh.y, 3).length) break;
                    }
                    if (other === null || t0 < 0.5) continue;
                    const oh = topOf(ex + ox * (t0 + 0.1), ez + oz * (t0 + 0.1), other.y, 1.5, ROAD);
                    if (!oh) continue;
                    const lower = Math.min(eh.y, oh.y);
                    let sunk = null, ledge = null;
                    for (let t = 0.25; t < t0 - 1e-9; t += 0.25) {
                        const x = ex + ox * t, z = ez + oz * t;
                        targets.push({ x, z });
                        const top = drawnTop(x, z, (eh.y + oh.y) / 2, Math.abs(eh.y - oh.y) / 2 + 3);
                        const deep = top === null ? 9.99 : lower - top.y;
                        if (deep > bandDipM && (sunk === null || deep > sunk.worst)) sunk = { worst: r2(deep), x: r2(x), z: r2(z), road: line.road, other: other.road, gapM: t0 };
                    }
                    // The higher edge over what is drawn just past it (on its side of the gap)
                    // (a metre out, past the verge as its shader draws it)
                    const high = eh.y >= oh.y ? { y: eh.y, at: 1, dir: 1 } : { y: oh.y, at: t0 - 1, dir: -1 };
                    if (high.at > 0 && high.at < t0) {
                        const x = ex + ox * high.at, z = ez + oz * high.at;
                        const top = drawnTop(x, z, high.y, 3);
                        const drop = top === null ? 9.99 : high.y - top.y;
                        if (drop > ledgeM && !faced(x, z, high.y - drop, high.y)) ledge = { worst: r2(drop), x: r2(x), z: r2(z), road: line.road, other: other.road, gapM: t0 };
                    }
                    if (sunk) rec.bands.push(sunk);
                    if (ledge) rec.ledges.push(ledge);
                }
            }
        }

        // The lattice round the node: overlaps, markings, the land in a junction, wall ends
        const copingAt = (x, z, y) => { const h = topOf(x, z, y, 0.5, new Set(['stone'])); return h ? h.y : null; };
        const ends = new Map();
        for (let gx = nx - areaM; gx <= nx + areaM + 1e-9; gx += lattice) {
            for (let gz = nz - areaM; gz <= nz + areaM + 1e-9; gz += lattice) {
                if (Math.hypot(gx - nx, gz - nz) > areaM) continue;
                const hits = hitsAt(gx, gz).filter(h => Math.abs(h.y - ny) < 25);
                if (!hits.length) continue;
                const top = hits.reduce((a, b) => (b.y > a.y ? b : a));
                if (inTube(gx, gz, top.y)) continue;
                const ribbons = hits.filter(h => ROAD.has(h.kind));
                // The land drawn over a road's ribbon or the paving within 0.5 m under it
                if (top.kind === 'land') {
                    const under = hits.filter(h => (ROAD.has(h.kind) || h.kind === 'paving') && h.y < top.y - 0.02 && h.y > top.y - 0.5);
                    if (under.length) rec.landIn.push({ worst: r2(top.y - Math.max(...under.map(h => h.y))), x: r2(gx), z: r2(gz), on: under[0].kind });
                }
                if (!ribbons.length) {
                    // A wall's top that ends here: coping behind it along one way, none a metre on, the drawn top past its
                    // end more than `proudM` under it
                    if (top.kind === 'stone' && ((Math.round((gx - nx) / lattice) + Math.round((gz - nz) / lattice)) & 1) === 0) {
                        for (let a = 0; a < 8; a++) {
                            const ux = Math.sin((a * Math.PI) / 4), uz = Math.cos((a * Math.PI) / 4);
                            if (copingAt(gx - ux * 0.6, gz - uz * 0.6, top.y) === null || copingAt(gx - ux * 1.2, gz - uz * 1.2, top.y) === null || copingAt(gx - ux * 1.8, gz - uz * 1.8, top.y) === null) continue;
                            if (copingAt(gx + ux * 0.5, gz + uz * 0.5, top.y) !== null || copingAt(gx + ux * 1.0, gz + uz * 1.0, top.y) !== null) continue;
                            const past = topOf(gx + ux * 1.0, gz + uz * 1.0, top.y, 6);
                            const drop = past === null ? 9.99 : top.y - past.y;
                            if (drop <= proudM) continue;
                            const key = `${Math.round(gx / 2)},${Math.round(gz / 2)}`;
                            if (!ends.has(key) || ends.get(key).worst < drop) ends.set(key, { worst: r2(drop), x: r2(gx), z: r2(gz) });
                        }
                    }
                    continue;
                }
                const roads = roadsAt(gx, gz, top.y, 1.5, 0.3);
                // Two roads' ribbons drawn apart where both carriageways are
                if (roads.length >= 2 && ribbons.length >= 2) {
                    const ys = ribbons.map(h => h.y).sort((a, b) => b - a);
                    const gapY = ys[0] - ys[ys.length - 1];
                    if (gapY > overlapM && gapY < 1.5 && new Set(roads.map(r => r.road)).size >= 2) rec.overlaps.push({ worst: r2(gapY), x: r2(gx), z: r2(gz) });
                }
                // A line drawn on top inside the carriageway of a road with the right of way over the road that draws it
                if (ROAD.has(top.kind) && roads.length >= 2) {
                    const l = look(top);
                    if (!l || l.out > 0) continue;
                    const onCentre = l.centre > 0 && Math.abs(l.lat) < lineHalf;
                    const edgeKind = l.lat < 0 ? l.edgeL : l.edgeR;
                    const onEdge = edgeKind > 0 && Math.abs(Math.abs(l.lat) - (l.half - inset)) < lineHalf;
                    if (!onCentre && !onEdge) continue;
                    // (the road that draws it: the ride for its own ribbon, else the side carriageway of its width whose
                    // depth there is its distance in from the edge)
                    let owner = -1;
                    if (top.kind === 'side') {
                        let best = Infinity;
                        for (const r of roads) if (r.road !== -1) { const miss = Math.abs(r.depth - (l.half - Math.abs(l.lat))) + Math.abs(graph.stubWidth(r.road) / 2 - l.half); if (miss < best) { best = miss; owner = r.road; } }
                    }
                    const over = roads.filter(r => r.road !== owner && r.depth >= 0.3 && !(owner !== -1 && env.carriageways.chainOf(owner).has(r.road)) && priority(r.road) > priority(owner));
                    if (over.length) rec.markings.push({ worst: onCentre ? 'centre' : 'edge', x: r2(gx), z: r2(gz), road: owner, over: over[0].road });
                }
            }
        }
        rec.proud = [...ends.values()];

        // loose paving: the middle of each paving triangle near the node away from every carriageway
        for (let ref = 0; ref < tris.length; ref++) {
            if (kinds[ref] !== 'paving') continue;
            const t = tris[ref], cx = (t[0] + t[3] + t[6]) / 3, cy = (t[1] + t[4] + t[7]) / 3, cz = (t[2] + t[5] + t[8]) / 3;
            if (Math.hypot(cx - nx, cz - nz) > areaM) continue;
            let held = false;
            env.carriageways.each(cx, cz, looseM, r => { if (r.depth >= -looseM && Math.abs(r.y - cy) < 2) held = true; });
            if (!held) rec.loose.push({ worst: 1, x: r2(cx), z: r2(cz) });
        }

        // see: rays from the chase cameras on the ride before the node at each band place and round the node
        if (n.ride) {
            for (let gx = nx - 15; gx <= nx + 15 + 1e-9; gx += 1) for (let gz = nz - 15; gz <= nz + 15 + 1e-9; gz += 1) if (Math.hypot(gx - nx, gz - nz) <= 15) targets.push({ x: gx, z: gz });
            const p = {}, seen = new Map();
            for (const back of camerasAt) {
                const bs = n.s - back;
                if (bs < env.startS) continue;
                env.route.sample(bs, p);
                const bike = { x: p.x, y: p.y, z: p.z, heading: p.heading };
                for (const [dist, up] of cameras) {
                    const o = { x: bike.x - Math.sin(bike.heading) * dist, y: bike.y + up, z: bike.z - Math.cos(bike.heading) * dist };
                    for (const tg of targets) {
                        const top = topOf(tg.x, tg.z, ny, 25);
                        if (!top || inTube(tg.x, tg.z, top.y)) continue;
                        const dx = tg.x - o.x, dy = top.y - 0.03 - o.y, dz = tg.z - o.z, len = Math.hypot(dx, dy, dz);
                        if (len < 1 || dy >= 0) continue;
                        // (a little to each side of the place too: a slit between two meshes)
                        for (const [sx, sz] of [[0, 0], [0.12, 0], [0, 0.12]]) {
                            const ddx = dx + sx, ddz = dz + sz, l2 = Math.hypot(ddx, dy, ddz), d = { x: ddx / l2, y: dy / l2, z: ddz / l2 };
                            const hit = ray(o, d, len + rayM);
                            if (hit && !hit.under) continue;
                            const key = `${Math.round(tg.x)},${Math.round(tg.z)}`;
                            if (!seen.has(key)) seen.set(key, { worst: hit ? 'under' : 'none', x: r2(tg.x), z: r2(tg.z), from: `${dist === cameras[0][0] ? 'far' : 'near'} s ${Math.round(bs)}` });
                        }
                    }
                }
            }
            rec.see = [...seen.values()];
        }
        store.nodes.set(n.node, rec);
        fresh++;
    }
    return { fresh, nodes: store.nodes.size, triangles: tris.length };
}

export function meetReport(store) {
    const recs = [...(store.nodes || new Map()).values()];
    const out = { nodes: recs.length };
    for (const kind of MEET_KINDS) {
        out[kind] = recs.filter(r => r[kind].length).map(r => {
            const num = r[kind].filter(p => typeof p.worst === 'number');
            const worst = num.length ? num.reduce((a, b) => (Math.abs(b.worst) > Math.abs(a.worst) ? b : a)) : r[kind][0];
            return { node: r.node, junction: r.junction, s: r.s, ride: r.ride, places: r[kind].length, worst: worst.worst, x: worst.x, z: worst.z, ...(worst.road !== undefined ? { road: worst.road, other: worst.other ?? worst.over } : {}), ...(worst.from ? { from: worst.from } : {}) };
        }).sort((a, b) => b.places - a.places);
    }
    return out;
}
