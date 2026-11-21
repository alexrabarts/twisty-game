// The retaining walls of a world against the land drawn round them. Shared by the node test
// (tests/unit/world-walls.test.js) and the GPU probe (tools/terrain-check.mjs world-walls). Two self-contained functions
// with no imports, so a probe can pass them into a page with toString().
//
// wallWindow(game, env, store, at) reads every retaining wall face drawn now within `nearM` of `at` (the stone quads of
// the road works that are not a parapet or a wall end; near the bike every road and the land are drawn at full detail,
// further off a coarser copy of the same wall is drawn) and measures each, once. It reads the
// drawn triangles only (land tiles, aprons, road ribbons, the works), never the builders' own records, so it says the
// same of any build. Along each face, every metre:
//   - buried: the land 0.2 m in front of the face stands within 0.25 m of the wall's top, so the wall holds nothing up
//   - climbs: the land 0.2 m in front stands higher than the land 2.2 m in front by more than a slope at the batter
//     allows (land that goes on through the wall's plane up to the road, in front of the stone)
//   - hangs: the wall's foot is over the land in front of it
//   - top: no road surface meets the wall's top behind it (nor the ground the roads lay between two of them, behind
//     a piece of wall that joins their walls)
// and past each end of each face (used only where a run really ends): `open`, the road's edge hanging over the land
// with nothing drawn under it (no slope, and no deck or bridge the road goes on over).
//
// A wall ends in the ground: within `endM` of a run's end the land may stand to the wall's top and rise to it, so the
// faces there are not held to `buried` and `climbs`; and farther along a high wall the land in front may stand as high
// as a bank at `bank` down from the end's top (the cone of ground the land's cut lays there, TerrainMesh.CUT_BANK).
//
// wallRuns(store) joins the faces of one road that share a top corner into runs and reports, with the measurements:
//   - blocks: a run shorter than `minRunM`
//   - steps: two runs of one road and one side whose ends are less than `minGapM` apart
//   - open: a run's end past which the road's edge hangs open
//   - flanks: a run's end where the ground past it stands more than `flankM` over the ground in front of the wall,
//     with no face of stone across the end (the open side of the slope that goes on from the wall)
// Returns {faces, measured, runs, buried, climbs, hangs, top, blocks, steps, open}: each a list, worst first, of
// {s, x, z, ...} (s the metres of ride nearest to it).
// What still stands on the Tremola slice, held so it can only shrink (tests/unit/world-walls.test.js says what each is)
export const WALL_LIMITS = { buried: 4, climbs: 6, hangs: 0, top: 1, blocks: 1, steps: 0, open: 15 };

export function wallWindow(game, env, store, at, nearM = 350) {
    const { THREE } = game;
    const BATTER = 1 / 1.5, PARAPET = 0.8;
    store.faces = store.faces || new Map();
    store.grids = store.grids || new Map();
    const v = new THREE.Vector3();
    const r3 = n => Math.round(n * 1000) / 1000;

    // The triangles of a mesh from `start` for `count` vertices, hashed in plan: top(x, z) is the highest of them over
    // (x, z), or null. Made once for a geometry
    const gridOf = (mesh, start, count, cell, key) => {
        const id = `${mesh.geometry.uuid}:${key}`;
        if (store.grids.has(id)) return store.grids.get(id);
        mesh.updateMatrixWorld(true);
        const pos = mesh.geometry.attributes.position, index = mesh.geometry.index;
        const tris = [], hash = new Map();
        for (let i = start; i + 2 < start + count; i += 3) {
            const t = new Float64Array(9);
            for (let k = 0; k < 3; k++) { v.fromBufferAttribute(pos, index ? index.getX(i + k) : i + k).applyMatrix4(mesh.matrixWorld); t[k * 3] = v.x; t[k * 3 + 1] = v.y; t[k * 3 + 2] = v.z; }
            // A face seen edge-on from above (a skirt) is no ground
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
            all(x, z) {
                const out = [];
                for (const ref of hash.get(Math.floor(x / cell) * 65536 + Math.floor(z / cell)) || []) {
                    const t = tris[ref];
                    const d = (t[5] - t[8]) * (t[0] - t[6]) + (t[6] - t[3]) * (t[2] - t[8]);
                    const a = ((t[5] - t[8]) * (x - t[6]) + (t[6] - t[3]) * (z - t[8])) / d, b = ((t[8] - t[2]) * (x - t[6]) + (t[0] - t[6]) * (z - t[8])) / d, c = 1 - a - b;
                    if (a < -1e-9 || b < -1e-9 || c < -1e-9) continue;
                    out.push(a * t[1] + b * t[4] + c * t[7]);
                }
                return out;
            },
            top(x, z) {
                let best = null;
                for (const ref of hash.get(Math.floor(x / cell) * 65536 + Math.floor(z / cell)) || []) {
                    const t = tris[ref];
                    const d = (t[5] - t[8]) * (t[0] - t[6]) + (t[6] - t[3]) * (t[2] - t[8]);
                    const a = ((t[5] - t[8]) * (x - t[6]) + (t[6] - t[3]) * (z - t[8])) / d, b = ((t[8] - t[2]) * (x - t[6]) + (t[0] - t[6]) * (z - t[8])) / d, c = 1 - a - b;
                    if (a < -1e-9 || b < -1e-9 || c < -1e-9) continue;
                    const y = a * t[1] + b * t[4] + c * t[7];
                    if (best === null || y > best) best = y;
                }
                return best;
            }
        };
        store.grids.set(id, grid);
        return grid;
    };

    // What is drawn now: the land at full detail, the aprons (land the roads own), the road surfaces, the stone
    const land = [], aprons = [], ribbons = [], stone = [], decks = [];
    for (const built of env.tileMeshes.values()) {
        const mesh = built.mesh || built;
        if (!mesh || !mesh.isMesh || !/lod0$/.test(mesh.name)) continue;
        const index = mesh.geometry.index;
        land.push(gridOf(mesh, 0, index ? index.count : mesh.geometry.attributes.position.count, 8, 'land'));
    }
    const works = (mesh) => {
        const owners = mesh.geometry.userData.owners;
        for (const g of mesh.geometry.groups) {
            if (g.materialIndex === 0 || g.materialIndex === 3) aprons.push(gridOf(mesh, g.start, g.count, 4, g.materialIndex ? 'paving' : 'apron'));
            // The decks, soffits and tubes (and their parapets): a road that goes on over a structure hangs over nothing
            if (g.materialIndex === 1) decks.push(gridOf(mesh, g.start, g.count, 4, 'deck'));
            if (g.materialIndex === 2) stone.push({ mesh, start: g.start, count: g.count, owners });
        }
    };
    for (const group of [...env.roadMeshes.values(), ...env.sideMeshes.values()]) {
        group.traverse(o => {
            if (!o.isMesh) return;
            if (o.name === 'road-works') works(o);
            else if (o.name === 'road-ribbon' || o.name === 'road-side') ribbons.push(gridOf(o, 0, o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count, 4, 'ribbon'));
            else decks.push(gridOf(o, 0, o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count, 4, 'deck'));
        });
    }
    const topOf = (grids, x, z) => {
        let best = null;
        for (const g of grids) { const y = g.top(x, z); if (y !== null && (best === null || y > best)) best = y; }
        return best;
    };
    const nearOf = (grids, x, z, y) => {
        let best = null;
        for (const g of grids) for (const h of g.all(x, z)) if (best === null || Math.abs(h - y) < Math.abs(best - y)) best = h;
        return best;
    };
    const landTop = (x, z) => topOf(land, x, z);
    // The land and the aprons together: what closes a road's edge
    const groundTop = (x, z) => { const a = landTop(x, z); if (a === null) return null; const b = topOf(aprons, x, z); return b === null ? a : Math.max(a, b); };
    // Whether (x, z) lies on a road (its carriageway or its verge)
    const onRoad = (x, z) => { let on = false; env.carriageways.each(x, z, 1, r => { if (r.depth >= -0.7) on = true; }); return on; };
    // How far inside its own road's carriageway a point by a wall's top lies: the leg of the road at the top's own
    // height (another leg of a hairpin lies metres lower)
    const ownDepth = (owner, x, z, y) => {
        let best = -Infinity;
        const own = owner >= 0 ? env.carriageways.chainOf(owner) : null;
        env.carriageways.each(x, z, 3, r => { if ((own ? r.road >= 0 && own.has(r.road) : r.road === -1) && Math.abs(r.y - y) < 1.5 && r.depth > best) best = r.depth; });
        return best;
    };
    const near = {};
    const rideS = (x, z) => { const p = env.route.project(x, z, null, near); return Math.round(p.s); };

    let fresh = 0;
    for (const part of stone) {
        const { mesh } = part;
        mesh.updateMatrixWorld(true);
        const pos = mesh.geometry.attributes.position;
        // RoadMesh.quad lays a quad as six vertices: a b c, a c d
        for (let i = part.start; i + 5 < part.start + part.count; i += 6) {
            const q = [0, 1, 2, 5].map(k => { v.fromBufferAttribute(pos, i + k).applyMatrix4(mesh.matrixWorld); return [v.x, v.y, v.z]; });
            // An upright quad: two corners over two corners
            const pairs = [];
            const used = [false, false, false, false];
            for (let a = 0; a < 4; a++) {
                if (used[a]) continue;
                for (let b = a + 1; b < 4; b++) {
                    if (used[b] || Math.hypot(q[a][0] - q[b][0], q[a][2] - q[b][2]) > 1e-3) continue;
                    used[a] = used[b] = true;
                    pairs.push(q[a][1] > q[b][1] ? { top: q[a], foot: q[b][1] } : { top: q[b], foot: q[a][1] });
                    break;
                }
            }
            if (pairs.length !== 2) continue;
            const [a, b] = pairs;
            const len = Math.hypot(b.top[0] - a.top[0], b.top[2] - a.top[2]);
            // Not a wall end's return or a parapet's end (short), nor a parapet's face (PARAPET high at both ends)
            if (len < 0.7) continue;
            // nor a wing down the side of a slope (RoadMesh.edgeWorks `wing`): its top falls with the slope, a wall's
            // with the road
            if (Math.abs(a.top[1] - b.top[1]) > 0.4 * len) continue;
            if (Math.abs(a.top[1] - a.foot - PARAPET) < 2e-3 && Math.abs(b.top[1] - b.foot - PARAPET) < 2e-3) continue;
            const owner = part.owners ? part.owners[i / 3] : -1;
            const ux = (b.top[0] - a.top[0]) / len, uz = (b.top[2] - a.top[2]) / len;
            const mx = (a.top[0] + b.top[0]) / 2, mz = (a.top[2] + b.top[2]) / 2;
            // Out is the side away from the wall's own road
            const my = (a.top[1] + b.top[1]) / 2;
            const side = ownDepth(owner, mx - uz, mz + ux, my) >= ownDepth(owner, mx + uz, mz - ux, my) ? -1 : 1;
            const ox = -uz * side, oz = ux * side;
            // The parapet's inner face is a wall face's twin 0.3 m in: a face whose foot is its road's surface is no wall
            const id = [a, b].map(p => `${Math.round(p.top[0] * 100)},${Math.round(p.top[1] * 100)},${Math.round(p.top[2] * 100)}`).sort().join('|') + `|${owner}`;
            if (store.faces.has(id) || Math.hypot(mx - at.x, mz - at.z) > nearM) continue;
            const face = { owner, a, b, len, ox, oz, s: rideS(mx, mz), buried: 0, climbs: 0, hangs: 0, top: 0, samples: 0, worstClimb: 0, worstHang: 0, ends: [], climbAt: [] };
            const n = Math.max(1, Math.round(len));
            for (let k = 0; k < n; k++) {
                const t = (k + 0.5) / n;
                const x = a.top[0] + (b.top[0] - a.top[0]) * t, z = a.top[2] + (b.top[2] - a.top[2]) * t, y = a.top[1] + (b.top[1] - a.top[1]) * t;
                const foot = a.foot + (b.foot - a.foot) * t;
                const hf = groundTop(x + ox * 0.2, z + oz * 0.2);
                if (hf === null) continue;
                face.samples++;
                if (hf > y - 0.25) { face.buried++; continue; }
                const far = onRoad(x + ox * 2.2, z + oz * 2.2) ? null : groundTop(x + ox * 2.2, z + oz * 2.2);
                if (far !== null && hf - far > 2 * BATTER + 0.3) { face.climbs++; face.worstClimb = Math.max(face.worstClimb, r3(hf - far)); face.climbAt.push({ x, z, y: hf, by: r3(hf - far) }); }
                if (foot > hf + 0.02) { face.hangs++; face.worstHang = Math.max(face.worstHang, r3(foot - hf)); }
                // (the surface nearest the top's own height: a viaduct 30 m over a side road's wall is not its road)
                const behind = nearOf([...ribbons, ...aprons], x - ox * 0.15, z - oz * 0.15, y);
                if (behind === null || Math.abs(behind - y) > 0.1) { face.top++; face.worstTop = behind === null ? null : r3(behind - y); }
            }
            // Past each end, along the road's edge: whether the edge hangs over the ground with nothing under it
            for (const [end, dir] of [[a, -1], [b, 1]]) {
                let open = 0, worst = 0;
                for (const d of [0.3, 1, 2]) {
                    const x = end.top[0] + ux * dir * d + ox * 0.15, z = end.top[2] + uz * dir * d + oz * 0.15;
                    const g = groundTop(x, z);
                    if (g === null) continue;
                    // On a structure (a deck's side, a bridge) the edge does not hang
                    if ([0.3, 0.8, 1.5].some(inM => { const deck = topOf(decks, x - ox * inM, z - oz * inM); return deck !== null && deck > end.top[1] - 2; })) continue;
                    const drop = end.top[1] - g - d * 0.15;
                    if (drop > 1) { open++; worst = Math.max(worst, r3(drop)); }
                }
                // The flank of what lies past the end: the ground in front of the wall just before its end against the
                // ground in front of the road's edge just past it (a slope that starts at the wall's end stands a
                // metre or two over the land in front of the wall, and with nothing across the end its side is open)
                const before = groundTop(end.top[0] - ux * dir * 0.3 + ox * 0.4, end.top[2] - uz * dir * 0.3 + oz * 0.4);
                const after = groundTop(end.top[0] + ux * dir * 0.3 + ox * 0.4, end.top[2] + uz * dir * 0.3 + oz * 0.4);
                const flank = before !== null && after !== null ? r3(after - before) : 0;
                face.ends.push({ x: r3(end.top[0]), y: r3(end.top[1]), z: r3(end.top[2]), open, dropM: worst, height: r3(end.top[1] - end.foot), flankM: flank });
            }
            store.faces.set(id, face);
            fresh++;
        }
    }
    return { fresh, faces: store.faces.size };
}

export function wallRuns(store, { minRunM = 10, minGapM = 12, endM = 6, flankM = 0.6, bank = 0.8 } = {}) {
    const faces = [...(store.faces || new Map()).values()];
    const key = p => `${Math.round(p.top[0] * 100)},${Math.round(p.top[1] * 100)},${Math.round(p.top[2] * 100)}`;
    // Faces of one road joined at the top corners they share
    const at = new Map();
    faces.forEach((f, i) => { for (const p of [f.a, f.b]) { const k = `${f.owner}|${key(p)}`; (at.get(k) || at.set(k, []).get(k)).push(i); } });
    const runOf = new Array(faces.length).fill(-1);
    const runs = [];
    faces.forEach((f, i) => {
        if (runOf[i] >= 0) return;
        const run = { owner: f.owner, faces: [], lengthM: 0, ends: [], ox: f.ox, oz: f.oz };
        const stack = [i];
        runOf[i] = runs.length;
        while (stack.length) {
            const j = stack.pop(), g = faces[j];
            run.faces.push(j);
            run.lengthM += g.len;
            [g.a, g.b].forEach((p, e) => {
                const joined = at.get(`${g.owner}|${key(p)}`);
                if (joined.length === 1) run.ends.push({ ...g.ends[e], s: g.s, ox: g.ox, oz: g.oz });
                for (const k of joined) if (runOf[k] < 0) { runOf[k] = runs.length; stack.push(k); }
            });
        }
        run.s = Math.min(...run.faces.map(j => faces[j].s));
        runs.push(run);
    });
    const r1 = n => Math.round(n * 10) / 10;
    const out = { faces: faces.length, measured: faces.filter(f => f.samples).length, runs: runs.length, buried: [], climbs: [], hangs: [], top: [], blocks: [], steps: [], open: [], flanks: [] };
    faces.forEach((f, i) => {
        const mx = (f.a.top[0] + f.b.top[0]) / 2, mz = (f.a.top[2] + f.b.top[2]) / 2;
        f.atEnd = runs[runOf[i]].ends.some(end => Math.hypot(end.x - mx, end.z - mz) < endM + f.len / 2);
        // The bank a wall ends in (TerrainMesh.CUT_BANK): land that stands no higher than a slope at `bank` down from
        // the top of one of its run's ends rises to that end, and is no land the wall should hold
        const held = (f.climbAt || []).filter(c => !runs[runOf[i]].ends.some(end => c.y <= end.y - bank * Math.hypot(end.x - c.x, end.z - c.z) + 0.5));
        if (f.climbAt) { f.climbs = held.length; f.worstClimb = held.reduce((most, c) => Math.max(most, c.by), 0); }
    });
    for (const f of faces) {
        const where = { s: f.s, owner: f.owner, x: r1((f.a.top[0] + f.b.top[0]) / 2), z: r1((f.a.top[2] + f.b.top[2]) / 2) };
        if (f.buried && !f.atEnd) out.buried.push({ ...where, samples: f.buried, of: f.samples });
        if (f.climbs && !f.atEnd) out.climbs.push({ ...where, samples: f.climbs, of: f.samples, worstM: f.worstClimb });
        if (f.hangs) out.hangs.push({ ...where, samples: f.hangs, of: f.samples, worstM: f.worstHang });
        if (f.top) out.top.push({ ...where, samples: f.top, of: f.samples, roadOverTopM: f.worstTop });
    }
    for (const run of runs) {
        if (run.lengthM < minRunM) out.blocks.push({ s: run.s, owner: run.owner, lengthM: r1(run.lengthM), x: r1(faces[run.faces[0]].a.top[0]), z: r1(faces[run.faces[0]].a.top[2]) });
        // (not where another wall goes on from the end: the road a side road goes on as through a node has its own
        // run, and the two stand end to end)
        const met = end => runs.some(other => other !== run && other.ends.some(e => Math.hypot(e.x - end.x, e.z - end.z) < 0.75 && Math.abs(e.y - end.y) < 1.5));
        for (const end of run.ends) if (end.flankM > flankM && !met(end)) out.flanks.push({ s: end.s, owner: run.owner, x: end.x, z: end.z, flankM: end.flankM });
        for (const end of run.ends) if (end.open && !met(end)) out.open.push({ s: end.s, owner: run.owner, x: end.x, z: end.z, dropM: end.dropM, wallM: end.height });
    }
    // Two runs of one road, facing the same way, whose ends are close: one wall in pieces
    for (let i = 0; i < runs.length; i++) {
        for (let j = i + 1; j < runs.length; j++) {
            const p = runs[i], q = runs[j];
            if (p.owner !== q.owner || p.ox * q.ox + p.oz * q.oz < 0.5) continue;
            let best = Infinity, where = null;
            for (const a of p.ends) for (const b of q.ends) { const d = Math.hypot(a.x - b.x, a.z - b.z); if (d < best) { best = d; where = a; } }
            if (best < minGapM) out.steps.push({ s: where.s, owner: p.owner, gapM: r1(best), x: where.x, z: where.z, lengthsM: [r1(p.lengthM), r1(q.lengthM)] });
        }
    }
    out.climbs.sort((a, b) => b.worstM - a.worstM);
    out.hangs.sort((a, b) => b.worstM - a.worstM);
    out.open.sort((a, b) => b.dropM - a.dropM);
    out.flanks.sort((a, b) => b.flankM - a.flankM);
    out.buried.sort((a, b) => b.samples - a.samples);
    out.steps.sort((a, b) => a.gapM - b.gapM);
    out.blocks.sort((a, b) => a.lengthM - b.lengthM);
    return out;
}
