// The land and the wall ends beside the ride, read from the drawn triangles only (the land tiles at full detail, the
// road works' ground and stone, the road ribbons). Shared by the node test (tests/unit/world-spikes.test.js) and
// `node tools/world/verify.mjs spikes`. Two self-contained functions with no imports, so a probe can pass them into a
// page with toString().
//
// spikeWindow(game, env, store, at, nearM) reads what is drawn now within `nearM` of `at` and keeps, once for each:
//   - stretched: a land triangle within `rideM` of the ride's carriageway that is steeper than `slope` (rise over
//     run) and spans more than `spanM` of height, unless it is covered: under a road's surface or the ground a road
//     lays (it cannot be seen from above), or behind a wall's face (the land behind the stone). A height grid of 8 m
//     cannot hold a step: such a triangle stands up beside the road as a spike or a tent. `awayM` is how far from
//     the ride's carriageway it lies: within `besideM` it is `beside` the road, farther it is `setback`
//   - bare: a face of land that closes a cut's step with no stone in front of it (seen from behind it draws black)
//   - ends: the end of a run of retaining wall with no face of stone across it (`open`: the face is a sheet seen
//     edge-on), whose foot stands over the ground in front (`hangs`), or past which the ground in front of the road's
//     edge stands more than `flankM` over the ground in front of the wall with no stone across the step (`flank`: the
//     side of a bank that starts at the wall's end)
//   - overhangs: an outer edge of the ground a road lays (the ground under a verge on a wall, a slope's side or foot)
//     more than `airM` over everything drawn just outside it, with no wall face under it: a shelf over open air
//   - flaps: a wall's end with an open side beside it: within `flapNearM` of the end, an outer edge of the ground a
//     road lays (an edge one triangle holds: the side or the foot of a slope, the end of the ground under a verge)
//     more than `flapM` over what is drawn just outside it, with no stone across it there. The land in front of a
//     wall is levelled under the wall's top, so the side of a slope that starts at the wall's end stood open over
//     it: a triangle of ground beside the stone with the dark under it. `gapM` is the widest of it, `at` where,
//     `edge` the edge
//   - proud: the end of a run of retaining wall that stands more than `proudM` over the ground in front of it there:
//     a wall cut off at its height. A wall's face tapers to nothing past its end (RoadMesh.edgeWorks `taper`), so
//     its run ends with no height (`tapers` counts those), or it ends in the ground (`low`), or another road's wall
//     goes on from it (`joined`). An end counts as tapered when it has no height left, or when its top lies under
//     the ground the road lays on its own line on both sides of it
//   - fins: an upright face of stone, 0.7 m or longer, whose top falls more than 0.4 a metre faster than its road
//     does: a slanted sheet standing out from a wall's end, which no mason builds
//   - unfaced: an upright face of stone that is no parapet's and is not laid and lit as its wall's face (no
//     `wallFace`): it shows paler or darker than the wall it closes
//   - thin: a piece of wall thinner than the wall: a piece past a wall's end (`wallFace` 2, RoadMesh.edgeWorks
//     `taper`) whose top has less stone over it than the wall's coping (`copingM`, a parapet's width) at its own
//     height on either side (`coping`), or any upright face of stone, no parapet's, with nothing drawn at its top on
//     either side (`sheet`): seen from above a face alone reads as a wall of no thickness standing on the land
// spikeReport(store) gives {tiles, stretched, beside, setback, bare, ends, overhangs, flaps, proud, fins, unfaced,
// thin, tapers, low, joined, wallEnds, km}: each a list, worst first, of {s, x, z, ...} (s the metres of ride nearest),
// `tapers`, `low` and `joined` counts, `wallEnds` the wall ends read, and `km` the offenders counted by kilometre
// of ride (one decimal).
//
// What still stands on the Tremola slice, held so it can only shrink (tests/unit/world-spikes.test.js says what each is)
export const SPIKE_LIMITS = { beside: 127, setback: 354, bare: 0, ends: 0, overhangs: 41, flaps: 4, proud: 4, fins: 0, unfaced: 0, thin: 0 };
export const SPIKE_RULES = { rideM: 30, besideM: 10, slope: 1.5, spanM: 2.5, flankM: 1.5, airM: 1, endsNearM: 40, flapNearM: 3, flapM: 0.15, proudM: 0.5, copingM: 0.3 };

export function spikeWindow(game, env, store, at, nearM = 350, rules = { rideM: 30, besideM: 10, slope: 1.5, spanM: 2.5, flankM: 1.5, airM: 1, endsNearM: 40, flapNearM: 3, flapM: 0.15, proudM: 0.5, copingM: 0.3 }) {
    const { THREE } = game;
    store.tiles = store.tiles || new Map();
    store.works = store.works || new Map();
    store.grids = store.grids || new Map();
    const v = new THREE.Vector3();
    const r2 = n => Math.round(n * 100) / 100;

    // The triangles of a mesh from index `start` for `count`, hashed in plan: top(x, z) the highest over (x, z)
    const gridOf = (mesh, start, count, cell, key) => {
        const id = `${mesh.geometry.uuid}:${key}`;
        if (store.grids.has(id)) return store.grids.get(id);
        mesh.updateMatrixWorld(true);
        const pos = mesh.geometry.attributes.position, index = mesh.geometry.index;
        const tris = [], hash = new Map();
        for (let i = start; i + 2 < start + count; i += 3) {
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

    // What is drawn now: the land at full detail, the ground the roads lay, the road surfaces, the decks, the stone
    const land = [], laid = [], ribbons = [], decks = [], stone = [], tiles = [], ground = [], tops = [];
    for (const [key, built] of env.tileMeshes) {
        const mesh = built.mesh || built;
        if (!mesh || !mesh.isMesh || !/lod0$/.test(mesh.name)) continue;
        const index = mesh.geometry.index;
        land.push(gridOf(mesh, 0, index ? index.count : mesh.geometry.attributes.position.count, 8, 'land'));
        tiles.push({ key, mesh });
    }
    for (const group of [...env.roadMeshes.values(), ...env.sideMeshes.values()]) {
        group.traverse(o => {
            if (!o.isMesh) return;
            const count = o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count;
            if (o.name === 'road-works') {
                for (const g of o.geometry.groups) {
                    if (g.materialIndex === 0 || g.materialIndex === 3) { laid.push(gridOf(o, g.start, g.count, 4, `laid${g.materialIndex}`)); ground.push({ mesh: o, start: g.start, count: g.count }); }
                    if (g.materialIndex === 1) decks.push(gridOf(o, g.start, g.count, 4, 'deck'));
                    if (g.materialIndex === 2) { stone.push({ mesh: o, start: g.start, count: g.count }); tops.push(gridOf(o, g.start, g.count, 4, 'stone')); }
                }
            } else if (o.name === 'road-ribbon' || o.name === 'road-side') ribbons.push(gridOf(o, 0, count, 4, 'ribbon'));
            else decks.push(gridOf(o, 0, count, 4, 'deck'));
        });
    }
    const topOf = (grids, x, z) => {
        let best = null;
        for (const g of grids) { const y = g.top(x, z); if (y !== null && (best === null || y > best)) best = y; }
        return best;
    };
    const landTop = (x, z) => topOf(land, x, z);
    const roofTop = (x, z) => { const a = topOf(ribbons, x, z), b = topOf(laid, x, z), c = topOf(decks, x, z); return Math.max(a === null ? -Infinity : a, b === null ? -Infinity : b, c === null ? -Infinity : c); };
    // Everything drawn that a thing can stand on at (x, z): the highest of it, or null with no land there
    const drawnTop = (x, z) => { const a = landTop(x, z); if (a === null) return null; return Math.max(a, roofTop(x, z)); };
    const hint = {};
    const rideS = (x, z) => Math.round(env.route.coldLookup(x, z, hint).s);
    // Metres from the ride's carriageway edge (0 on it), or null farther than `rideM` from it
    const rideAway = (x, z, reach = rules.rideM) => { let best = null; env.carriageways.each(x, z, reach, r => { if (r.road === -1 && (best === null || -r.depth < best)) best = Math.max(0, -r.depth); }, false); return best; };
    const nearRide = (x, z, reach = rules.rideM) => rideAway(x, z, reach) !== null;

    // The stone: every upright quad of a wall (RoadMesh.quad lays six vertices: a b c, a c d), as a plan segment with
    // its heights. `faces` are a wall's own faces (0.7 m or longer, not a parapet's); `all` holds the returns too
    // (a parapet's face stands 0.8 m high, or falls to its 0.3 m kerb at a wall's end: RoadMesh.PARAPET_END_M)
    const quads = [];
    for (const part of stone) {
        const id = `${part.mesh.geometry.uuid}`;
        let held = store.works.get(id);
        if (!held) {
            held = [];
            part.mesh.updateMatrixWorld(true);
            const pos = part.mesh.geometry.attributes.position, owners = part.mesh.geometry.userData.owners, flag = part.mesh.geometry.attributes.wallFace;
            for (let i = part.start; i + 5 < part.start + part.count; i += 6) {
                const q = [0, 1, 2, 5].map(k => { v.fromBufferAttribute(pos, i + k).applyMatrix4(part.mesh.matrixWorld); return [v.x, v.y, v.z]; });
                const pairs = [], used = [false, false, false, false];
                for (let a = 0; a < 4; a++) {
                    if (used[a]) continue;
                    for (let b = a + 1; b < 4; b++) {
                        if (used[b] || Math.hypot(q[a][0] - q[b][0], q[a][2] - q[b][2]) > 1e-3) continue;
                        used[a] = used[b] = true;
                        pairs.push(q[a][1] > q[b][1] ? { x: q[a][0], z: q[a][2], top: q[a][1], foot: q[b][1] } : { x: q[b][0], z: q[b][2], top: q[b][1], foot: q[a][1] });
                        break;
                    }
                }
                if (pairs.length !== 2) continue;
                const [a, b] = pairs;
                held.push({ a, b, len: Math.hypot(b.x - a.x, b.z - a.z), owner: owners ? owners[i / 3] : -1, parapet: [a, b].every(p => Math.abs(p.top - p.foot - 0.8) < 2e-3 || Math.abs(p.top - p.foot - 0.3) < 2e-3), faced: !flag || flag.getY(i) > 0.5, past: !!flag && Math.round(flag.getY(i)) === 2 });
            }
            store.works.set(id, held);
        }
        quads.push(...held);
    }
    const qhash = new Map();
    quads.forEach((q, ref) => {
        for (let cx = Math.floor((Math.min(q.a.x, q.b.x) - 1) / 8); cx <= Math.floor((Math.max(q.a.x, q.b.x) + 1) / 8); cx++) {
            for (let cz = Math.floor((Math.min(q.a.z, q.b.z) - 1) / 8); cz <= Math.floor((Math.max(q.a.z, q.b.z) + 1) / 8); cz++) {
                const h = cx * 65536 + cz;
                (qhash.get(h) || qhash.set(h, []).get(h)).push(ref);
            }
        }
    });
    // Whether stone stands within `reach` of (x, z) in plan and spans the height y (a little over and under)
    const stoneAt = (x, y, z, reach = 0.7, skip = null) => {
        for (const ref of qhash.get(Math.floor(x / 8) * 65536 + Math.floor(z / 8)) || []) {
            const q = quads[ref];
            if (q === skip || q.parapet) continue;
            const dx = q.b.x - q.a.x, dz = q.b.z - q.a.z, run = dx * dx + dz * dz;
            const t = run === 0 ? 0 : Math.max(0, Math.min(1, ((x - q.a.x) * dx + (z - q.a.z) * dz) / run));
            if (Math.hypot(q.a.x + dx * t - x, q.a.z + dz * t - z) > reach) continue;
            const top = q.a.top + (q.b.top - q.a.top) * t, foot = q.a.foot + (q.b.foot - q.a.foot) * t;
            if (y <= top + 0.3 && y >= foot - 0.5) return true;
        }
        return false;
    };

    // The land: each tile's own triangles once for a geometry (a tile cut again is read again)
    for (const { key, mesh } of tiles) {
        const done = store.tiles.get(key);
        if (done && done.uuid === mesh.geometry.uuid) continue;
        const record = { uuid: mesh.geometry.uuid, stretched: [], bare: [] };
        store.tiles.set(key, record);
        mesh.updateMatrixWorld(true);
        const pos = mesh.geometry.attributes.position, index = mesh.geometry.index;
        const parts = mesh.userData.parts || { land: index.count, faces: [0, 0] };
        const tri = i => { const t = []; for (let k = 0; k < 3; k++) { v.fromBufferAttribute(pos, index.getX(i + k)).applyMatrix4(mesh.matrixWorld); t.push([v.x, v.y, v.z]); } return t; };
        for (let i = 0; i + 2 < parts.land; i += 3) {
            const t = tri(i);
            const span = Math.max(t[0][1], t[1][1], t[2][1]) - Math.min(t[0][1], t[1][1], t[2][1]);
            if (span <= rules.spanM) continue;
            const ux = t[1][0] - t[0][0], uy = t[1][1] - t[0][1], uz = t[1][2] - t[0][2], wx = t[2][0] - t[0][0], wy = t[2][1] - t[0][1], wz = t[2][2] - t[0][2];
            const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
            const slope = Math.hypot(nx, nz) / Math.max(1e-9, Math.abs(ny));
            if (slope <= rules.slope) continue;
            const cx = (t[0][0] + t[1][0] + t[2][0]) / 3, cy = (t[0][1] + t[1][1] + t[2][1]) / 3, cz = (t[0][2] + t[1][2] + t[2][2]) / 3;
            const away = rideAway(cx, cz);
            if (away === null) continue;
            // Covered: each corner (a hand inside the triangle) and the middle under a road or behind stone
            const points = [[cx, cy, cz], ...t.map(p => [p[0] + (cx - p[0]) * 0.15, p[1] + (cy - p[1]) * 0.15, p[2] + (cz - p[2]) * 0.15])];
            if (points.every(p => roofTop(p[0], p[2]) >= p[1] - 0.05 || stoneAt(p[0], p[1], p[2]))) continue;
            record.stretched.push({ s: rideS(cx, cz), x: r2(cx), y: r2(cy), z: r2(cz), slope: r2(Math.min(999, slope)), spanM: r2(span), planM2: r2(Math.abs(ny) / 2), awayM: r2(away) });
        }
        for (let i = parts.faces[0]; i + 2 < parts.faces[0] + parts.faces[1]; i += 3) {
            const t = tri(i);
            const span = Math.max(t[0][1], t[1][1], t[2][1]) - Math.min(t[0][1], t[1][1], t[2][1]);
            if (span <= 0.5) continue;
            const cx = (t[0][0] + t[1][0] + t[2][0]) / 3, cy = (t[0][1] + t[1][1] + t[2][1]) / 3, cz = (t[0][2] + t[1][2] + t[2][2]) / 3;
            if (!nearRide(cx, cz)) continue;
            // (a cut that ends on the tile's edge hangs a skirt there: no closing face)
            if (Math.abs(cx / 512 - Math.round(cx / 512)) < 1e-4 || Math.abs(cz / 512 - Math.round(cz / 512)) < 1e-4) continue;
            if (stoneAt(cx, cy, cz) || roofTop(cx, cz) >= cy + span / 2 - 0.05) continue;
            // (a skirt on the tile's own edge hangs under the land: it is no closing face)
            const lt = landTop(cx, cz);
            if (lt !== null && lt >= cy + span / 2 - 0.05 && Math.abs(lt - (cy + span / 2)) > 0.3) continue;
            record.bare.push({ s: rideS(cx, cz), x: r2(cx), y: r2(cy), z: r2(cz), spanM: r2(span) });
        }
    }

    // The walls' runs: faces of one road joined at the top corners they share; an end is a corner one face holds
    store.ends = store.ends || new Map();
    store.wallEnds = store.wallEnds || new Map();
    store.overhangs = store.overhangs || new Map();
    store.rims = store.rims || new Map();
    store.flaps = store.flaps || new Map();
    store.looks = store.looks || new Map();
    store.stones = store.stones || new Map();
    // How thick a piece of stone is at its top: from three places along its top, out to either side, what is drawn
    // at its height. A piece past a wall's end needs stone at its height over the wall's coping on one side
    // (`coping`, with the width it has); any face needs something drawn at its top on one side (`sheet`)
    const stoneTop = (x, z) => topOf(tops, x, z);
    const anyTop = (x, z) => { const a = drawnTop(x, z), b = stoneTop(x, z); return a === null ? b : b === null ? a : Math.max(a, b); };
    const thinAt = q => {
        if (q.len < 0.05) return null;
        const nx = -(q.b.z - q.a.z) / q.len, nz = (q.b.x - q.a.x) / q.len, my = (q.a.top + q.b.top) / 2;
        let worst = null;
        for (const u of [0.25, 0.5, 0.75]) {
            const x = q.a.x + (q.b.x - q.a.x) * u, z = q.a.z + (q.b.z - q.a.z) * u, top = q.a.top + (q.b.top - q.a.top) * u;
            // (a top under or level with a road's surface on both sides shows no face: in a junction)
            if ([1, -1].every(way => { const y = topOf(ribbons, x + nx * way * 0.15, z + nz * way * 0.15); return y !== null && y >= top - 0.05; })) continue;
            const backed = way => [rules.copingM / 3, (rules.copingM * 2) / 3].every(d => { const y = anyTop(x + nx * way * d, z + nz * way * d); return y !== null && y >= top - 0.1; });
            if (!backed(1) && !backed(-1)) return { kind: 'sheet', widthM: 0, y: r2(my) };
            if (!q.past) continue;
            const width = Math.max(...[1, -1].map(way => {
                let most = 0;
                for (let d = 0.025; d < rules.copingM; d += 0.025) { const y = stoneTop(x + nx * way * d, z + nz * way * d); if (y === null || y < top - 0.08) break; most = d + 0.025; }
                return most;
            }));
            if (width < rules.copingM - 0.03 && (worst === null || width < worst.widthM)) worst = { kind: 'coping', widthM: r2(width), y: r2(my) };
        }
        return worst;
    };
    // (a face whose top falls faster than a road does is no face of a run: a fin)
    const faces = quads.filter(q => !q.parapet && q.len >= 0.7 && Math.abs(q.a.top - q.b.top) <= 0.4 * q.len);
    // The stone that is no wall a mason builds: `fins` (an upright face whose top falls more than 0.4 a metre faster
    // than its road, a slanted sheet past a wall's end) and `unfaced` (an upright face of a wall, a return or a closing piece that
    // is not laid and lit as its wall's face is: no `wallFace`), each once for a geometry, near the ride only
    for (const part of stone) {
        const id = `${part.mesh.geometry.uuid}`;
        if (store.stones.has(id)) continue;
        const record = { fins: [], unfaced: [] };
        store.stones.set(id, record);
        for (const q of store.works.get(id) || []) {
            if (q.parapet || Math.max(q.a.top - q.a.foot, q.b.top - q.b.foot) < 0.05) continue;
            const mx = (q.a.x + q.b.x) / 2, mz = (q.a.z + q.b.z) / 2;
            // (the top of a wall of the ride falls as the ride does there: a fin's falls faster than its road's)
            let grade = 0;
            if (q.owner === -1) { const at = env.route.coldLookup(mx, mz, hint).s, lo = env.route.sample(Math.max(0, at - 2), {}), hi = env.route.sample(at + 2, {}); grade = Math.abs(hi.y - lo.y) / Math.max(1e-6, Math.hypot(hi.x - lo.x, hi.z - lo.z)); }
            const fin = q.len >= 0.7 && Math.abs(q.a.top - q.b.top) > (0.4 + grade) * q.len;
            if ((!fin && q.faced) || !nearRide(mx, mz, rules.endsNearM)) continue;
            const where = { s: rideS(mx, mz), owner: q.owner, x: r2(mx), z: r2(mz), lengthM: r2(q.len), fallM: r2(Math.abs(q.a.top - q.b.top)) };
            if (fin) record.fins.push(where);
            if (!q.faced) record.unfaced.push(where);
        }
    }
    // The pieces too thin, once for each place (a section drawn again at another level of detail draws the same
    // piece), each read when it lies well inside the window with the land under it drawn at full detail
    store.thin = store.thin || new Map();
    for (const q of quads) {
        if (q.parapet || q.len < 0.05 || Math.max(q.a.top - q.a.foot, q.b.top - q.b.foot) < 0.05) continue;
        const mx = (q.a.x + q.b.x) / 2, mz = (q.a.z + q.b.z) / 2;
        if (Math.hypot(mx - at.x, mz - at.z) > nearM - rules.endsNearM) continue;
        const id = `${q.owner}|${[q.a, q.b].map(p => `${Math.round(p.x * 10)},${Math.round(p.z * 10)},${Math.round(p.top * 10)}`).sort().join('|')}`;
        if (store.thin.has(id)) continue;
        if (!nearRide(mx, mz, rules.endsNearM)) { store.thin.set(id, null); continue; }
        if (landTop(mx, mz) === null) continue;
        const thin = thinAt(q);
        store.thin.set(id, thin && { s: rideS(mx, mz), owner: q.owner, x: r2(mx), z: r2(mz), lengthM: r2(q.len), ...thin });
    }
    const key3 = (p, owner) => `${owner}|${Math.round(p.x * 100)},${Math.round(p.top * 100)},${Math.round(p.z * 100)}`;
    const corners = new Map();
    for (const f of faces) for (const p of [f.a, f.b]) { const k = key3(p, f.owner); corners.set(k, (corners.get(k) || 0) + 1); }
    for (const f of faces) {
        for (const [end, other] of [[f.a, f.b], [f.b, f.a]]) {
            const id = key3(end, f.owner);
            if (corners.get(id) !== 1 || store.ends.has(id)) continue;
            if (Math.hypot(end.x - at.x, end.z - at.z) > nearM - rules.endsNearM) continue;
            let near = false;
            env.carriageways.each(end.x, end.z, rules.endsNearM, r => { if (r.road === -1) near = true; }, false);
            if (!near) continue;
            const ux = (end.x - other.x) / f.len, uz = (end.z - other.z) / f.len;
            // Out is the side the land in front lies lower on
            const mx = (f.a.x + f.b.x) / 2, mz = (f.a.z + f.b.z) / 2;
            const sideA = drawnTop(mx - uz * 0.5, mz + ux * 0.5), sideB = drawnTop(mx + uz * 0.5, mz - ux * 0.5);
            if (sideA === null || sideB === null) continue;
            const sign = sideA <= sideB ? 1 : -1, ox = -uz * sign, oz = ux * sign;
            // On to a structure (a deck's side, a bridge): the wall meets it and has no end of its own
            if ([0.3, 1, 2].some(d => { const deck = topOf(decks, end.x + ux * d - ox * 0.5, end.z + uz * d - oz * 0.5); return deck !== null && Math.abs(deck - end.top) < 2.5; })) { store.ends.set(id, null); continue; }
            // A face of stone across the end: another quad that holds the end's own upright edge
            const across = quads.some(q => q !== f && !q.parapet && [q.a, q.b].some(p => Math.hypot(p.x - end.x, p.z - end.z) < 0.05 && Math.abs(p.top - end.top) < 0.05));
            const front = drawnTop(end.x - ux * 0.3 + ox * 0.4, end.z - uz * 0.3 + oz * 0.4);
            const past = drawnTop(end.x + ux * 0.4 + ox * 0.4, end.z + uz * 0.4 + oz * 0.4);
            const record = { s: rideS(end.x, end.z), owner: f.owner, x: r2(end.x), z: r2(end.z), heightM: r2(end.top - end.foot), problems: [] };
            store.wallEnds.set(id, { s: record.s, owner: f.owner, x: end.x, z: end.z, top: end.top });
            // How the wall ends: `taper` (its height has fallen to nothing along its run: nothing stands at its
            // end), `low` (it stands no more than `proudM` over the ground in front of it at its end: it ends in
            // the ground) or `proud` (it stops at that height or more over the ground in front, a wall cut off)
            // The ground the roads lay on the end's own line, a hand before it and a hand past it: the lower of the two
            // (the highest of it from just inside the line to a hand out from it: the ground under the verge ends on
            // the line)
            const laidAt = d => [-0.02, 0.005, 0.02, 0.06].reduce((most, out) => { const x = end.x + ux * d + ox * out, z = end.z + uz * d + oz * out, y = landTop(x, z) === null ? null : topOf(laid, x, z); return y === null ? most : most === null ? y : Math.max(most, y); }, null);
            const edge = [-0.1, 0.1].map(laidAt).reduce((least, y) => (y === null || least === null ? null : Math.min(least, y)), Infinity);
            // (tapered to nothing: no height left, or its top under the ground the road lays over it there)
            const died = end.top - end.foot < 0.05 || (edge !== null && edge >= end.top - 0.1);
            const standsM = front === null ? 0 : r2(end.top - front);
            store.looks.set(id, { s: record.s, owner: f.owner, x: r2(end.x), z: r2(end.z), kind: died ? 'taper' : standsM > rules.proudM ? 'proud' : 'low', standsM: died ? 0 : standsM });
            // (a wall that tapers to nothing has no end face to close: the ground must meet it there)
            // (a wall that has tapered to nothing has no end face to close and no foot to hang)
            if (died) { store.ends.set(id, null); continue; }
            if (!across) record.problems.push('open');
            if (front !== null && end.foot > front + 0.05) record.problems.push(`hangs ${r2(end.foot - front)}`);
            // The step across the end, with no stone across it there
            if (front !== null && past !== null && past - front > rules.flankM && !stoneAt(end.x + ox * 0.4, (front + past) / 2, end.z + oz * 0.4, 0.5, f)) record.problems.push(`flank ${r2(past - front)}`);
            store.ends.set(id, record.problems.length ? record : null);
        }
    }

    // The ground the roads lay: each outer edge (one triangle holds it), at its middle, against what is drawn outside
    for (const part of ground) {
        const id = `${part.mesh.geometry.uuid}:${part.start}`;
        if (store.overhangs.has(id)) continue;
        const list = [], rim = [];
        store.overhangs.set(id, list);
        store.rims.set(id, rim);
        part.mesh.updateMatrixWorld(true);
        const pos = part.mesh.geometry.attributes.position;
        const edges = new Map();
        const k3 = p => `${Math.round(p[0] * 100)},${Math.round(p[1] * 100)},${Math.round(p[2] * 100)}`;
        for (let i = part.start; i + 2 < part.start + part.count; i += 3) {
            const t = [0, 1, 2].map(k => { v.fromBufferAttribute(pos, i + k).applyMatrix4(part.mesh.matrixWorld); return [v.x, v.y, v.z]; });
            // (a piece that stands upright has no plan of its own, but it holds its edges: the edge of a slope that
            // an upright piece of the same ground closes is no outer edge)
            const upright = Math.abs((t[1][0] - t[0][0]) * (t[2][2] - t[0][2]) - (t[2][0] - t[0][0]) * (t[1][2] - t[0][2])) < 1e-4;
            if (upright && Math.max(t[0][1], t[1][1], t[2][1]) - Math.min(t[0][1], t[1][1], t[2][1]) < 0.05) continue;
            for (let e = 0; e < 3; e++) {
                const a = t[e], b = t[(e + 1) % 3], c = t[(e + 2) % 3];
                const ka = k3(a), kb = k3(b), id2 = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
                if (ka === kb) continue;
                const held = edges.get(id2);
                if (held) { held.n++; if (held.upright && !upright) Object.assign(held, { a, b, c, upright }); } else edges.set(id2, { a, b, c, n: 1, upright });
            }
        }
        for (const { a, b, c, n, upright } of edges.values()) {
            if (n !== 1 || upright) continue;
            const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
            if (len >= 0.1) rim.push({ a, b, c });
            if (len < 0.3) continue;
            const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, mz = (a[2] + b[2]) / 2;
            if (!nearRide(mx, mz)) continue;
            // Outward: away from the triangle's third corner
            let ox = -(b[2] - a[2]) / len, oz = (b[0] - a[0]) / len;
            if ((c[0] - mx) * ox + (c[2] - mz) * oz > 0) { ox = -ox; oz = -oz; }
            const out = drawnTop(mx + ox * 0.35, mz + oz * 0.35);
            if (out === null || my - out <= rules.airM) continue;
            if (stoneAt(mx, my - 0.3, mz, 0.5) || stoneAt(mx + ox * 0.35, my - 0.3, mz + oz * 0.35, 0.5)) continue;
            // A deck goes on under it
            const deck = topOf(decks, mx + ox * 0.35, mz + oz * 0.35);
            if (deck !== null && deck > my - 2.5) continue;
            list.push({ s: rideS(mx, mz), x: r2(mx), y: r2(my), z: r2(mz), airM: r2(my - out), lengthM: r2(len) });
        }
    }

    // The wall ends: every outer edge of the ground a road lays within `flapNearM` of one, read at five places along
    // it against what is drawn just outside it. Stone across it there (a wall's face that goes on past its end) closes it
    const stoneAcross = (x, y, z) => {
        for (const ref of qhash.get(Math.floor(x / 8) * 65536 + Math.floor(z / 8)) || []) {
            const q = quads[ref];
            if (q.parapet) continue;
            const dx = q.b.x - q.a.x, dz = q.b.z - q.a.z, run = dx * dx + dz * dz;
            const t = run === 0 ? 0 : Math.max(0, Math.min(1, ((x - q.a.x) * dx + (z - q.a.z) * dz) / run));
            if (Math.hypot(q.a.x + dx * t - x, q.a.z + dz * t - z) > 0.12) continue;
            if (y <= q.a.top + (q.b.top - q.a.top) * t + 0.1 && y >= q.a.foot + (q.b.foot - q.a.foot) * t - 0.1) return true;
        }
        return false;
    };
    const rims = ground.map(part => store.rims.get(`${part.mesh.geometry.uuid}:${part.start}`) || []);
    for (const [id, end] of store.wallEnds) {
        if (store.flaps.has(id)) continue;
        let worst = null;
        for (const rim of rims) {
            for (const { a, b, c } of rim) {
                const dx = b[0] - a[0], dz = b[2] - a[2], run = dx * dx + dz * dz, len = Math.sqrt(run);
                const t = Math.max(0, Math.min(1, ((end.x - a[0]) * dx + (end.z - a[2]) * dz) / run));
                if (Math.hypot(a[0] + dx * t - end.x, a[2] + dz * t - end.z) > rules.flapNearM) continue;
                let ox = -dz / len, oz = dx / len;
                if ((c[0] - (a[0] + b[0]) / 2) * ox + (c[2] - (a[2] + b[2]) / 2) * oz > 0) { ox = -ox; oz = -oz; }
                for (const u of [0.1, 0.3, 0.5, 0.7, 0.9]) {
                    const x = a[0] + dx * u, y = a[1] + (b[1] - a[1]) * u, z = a[2] + dz * u;
                    // (hard by the edge too: where a strip's edge lies along a longer one's, the ground goes on)
                    const far = drawnTop(x + ox * 0.25, z + oz * 0.25), close = drawnTop(x + ox * 0.03, z + oz * 0.03);
                    const out = far === null || close === null ? null : Math.max(far, close);
                    if (out === null || y - out <= rules.flapM) continue;
                    if (worst && y - out <= worst.gapM) continue;
                    if (stoneAcross(x, (y + out) / 2, z)) continue;
                    const deck = topOf(decks, x + ox * 0.25, z + oz * 0.25);
                    if (deck !== null && deck > y - 2.5) continue;
                    worst = { s: end.s, owner: end.owner, x: r2(end.x), z: r2(end.z), gapM: r2(y - out), at: [r2(x), r2(y), r2(z)], edge: [a.map(r2), b.map(r2)] };
                }
            }
        }
        store.flaps.set(id, worst);
    }
    return { tiles: store.tiles.size };
}

export function spikeReport(store, besideM = 10) {
    const out = { tiles: (store.tiles || new Map()).size, stretched: [], beside: [], setback: [], bare: [], ends: [], overhangs: [], flaps: [], proud: [], fins: [], unfaced: [], thin: [], tapers: 0, low: 0, joined: 0, wallEnds: (store.wallEnds || new Map()).size, km: {} };
    // (an end another road's wall goes on from is no end: the two walls meet at a junction, `joined`)
    const looks = [...(store.looks || new Map()).values()];
    for (const look of looks) {
        if (look.kind === 'taper') out.tapers++;
        else if (look.kind === 'low') out.low++;
        else if (looks.some(other => other.owner !== look.owner && Math.hypot(other.x - look.x, other.z - look.z) < 0.75)) out.joined++;
        else out.proud.push(look);
    }
    out.proud.sort((a, b) => b.standsM - a.standsM);
    for (const record of (store.stones || new Map()).values()) { out.fins.push(...record.fins); out.unfaced.push(...record.unfaced); }
    for (const record of (store.thin || new Map()).values()) if (record) out.thin.push(record);
    for (const record of (store.flaps || new Map()).values()) if (record) out.flaps.push(record);
    out.flaps.sort((a, b) => b.gapM - a.gapM);
    for (const record of (store.tiles || new Map()).values()) { out.stretched.push(...record.stretched); out.bare.push(...record.bare); }
    for (const record of (store.ends || new Map()).values()) if (record) out.ends.push(record);
    // (one place is drawn by one geometry at a time; a section built again leaves its old geometry's list behind)
    const seen = new Set();
    for (const list of (store.overhangs || new Map()).values()) for (const o of list) { const id = `${o.x},${o.y},${o.z}`; if (!seen.has(id)) { seen.add(id); out.overhangs.push(o); } }
    out.stretched.sort((a, b) => b.spanM - a.spanM);
    for (const o of out.stretched) (o.awayM < besideM ? out.beside : out.setback).push(o);
    out.bare.sort((a, b) => b.spanM - a.spanM);
    out.ends.sort((a, b) => b.heightM - a.heightM);
    out.overhangs.sort((a, b) => b.airM - a.airM);
    out.thin.sort((a, b) => a.widthM - b.widthM);
    for (const kind of ['beside', 'setback', 'bare', 'ends', 'overhangs', 'flaps', 'proud', 'fins', 'unfaced', 'thin']) {
        for (const o of out[kind]) {
            const km = (Math.round(o.s / 100) / 10).toFixed(1);
            out.km[km] = out.km[km] || { beside: 0, setback: 0, bare: 0, ends: 0, overhangs: 0, flaps: 0, proud: 0, fins: 0, unfaced: 0, thin: 0 };
            out.km[km][kind]++;
        }
    }
    return out;
}
