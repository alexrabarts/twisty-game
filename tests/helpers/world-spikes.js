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
// spikeReport(store) gives {tiles, stretched, beside, setback, bare, ends, overhangs, km}: each a list, worst first,
// of {s, x, z, ...} (s the metres of ride nearest), and `km` the offenders counted by kilometre of ride (one decimal).
//
// What still stands on the Tremola slice, held so it can only shrink (tests/unit/world-spikes.test.js says what each is)
export const SPIKE_LIMITS = { beside: 179, setback: 354, bare: 0, ends: 0, overhangs: 69 };
export const SPIKE_RULES = { rideM: 30, besideM: 10, slope: 1.5, spanM: 2.5, flankM: 1.5, airM: 1, endsNearM: 40 };

export function spikeWindow(game, env, store, at, nearM = 350, rules = { rideM: 30, besideM: 10, slope: 1.5, spanM: 2.5, flankM: 1.5, airM: 1, endsNearM: 40 }) {
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
    const land = [], laid = [], ribbons = [], decks = [], stone = [], tiles = [], ground = [];
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
                    if (g.materialIndex === 2) stone.push({ mesh: o, start: g.start, count: g.count });
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
    const nearRide = (x, z) => rideAway(x, z) !== null;

    // The stone: every upright quad of a wall (RoadMesh.quad lays six vertices: a b c, a c d), as a plan segment with
    // its heights. `faces` are a wall's own faces (0.7 m or longer, not a parapet's); `all` holds the returns too
    const quads = [];
    for (const part of stone) {
        const id = `${part.mesh.geometry.uuid}`;
        let held = store.works.get(id);
        if (!held) {
            held = [];
            part.mesh.updateMatrixWorld(true);
            const pos = part.mesh.geometry.attributes.position, owners = part.mesh.geometry.userData.owners;
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
                held.push({ a, b, len: Math.hypot(b.x - a.x, b.z - a.z), owner: owners ? owners[i / 3] : -1, parapet: Math.abs(a.top - a.foot - 0.8) < 2e-3 && Math.abs(b.top - b.foot - 0.8) < 2e-3 });
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
    store.overhangs = store.overhangs || new Map();
    const faces = quads.filter(q => !q.parapet && q.len >= 0.7);
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
            if (!across) record.problems.push('open');
            if (front !== null && end.foot > front + 0.05) record.problems.push(`hangs ${r2(end.foot - front)}`);
            // The step across the end, with no stone across it: a wing past the end that spans the step's middle
            if (front !== null && past !== null && past - front > rules.flankM && !stoneAt(end.x + ox * 0.4, (front + past) / 2, end.z + oz * 0.4, 0.5, f)) record.problems.push(`flank ${r2(past - front)}`);
            store.ends.set(id, record.problems.length ? record : null);
        }
    }

    // The ground the roads lay: each outer edge (one triangle holds it), at its middle, against what is drawn outside
    for (const part of ground) {
        const id = `${part.mesh.geometry.uuid}:${part.start}`;
        if (store.overhangs.has(id)) continue;
        const list = [];
        store.overhangs.set(id, list);
        part.mesh.updateMatrixWorld(true);
        const pos = part.mesh.geometry.attributes.position;
        const edges = new Map();
        const k3 = p => `${Math.round(p[0] * 100)},${Math.round(p[1] * 100)},${Math.round(p[2] * 100)}`;
        for (let i = part.start; i + 2 < part.start + part.count; i += 3) {
            const t = [0, 1, 2].map(k => { v.fromBufferAttribute(pos, i + k).applyMatrix4(part.mesh.matrixWorld); return [v.x, v.y, v.z]; });
            if (Math.abs((t[1][0] - t[0][0]) * (t[2][2] - t[0][2]) - (t[2][0] - t[0][0]) * (t[1][2] - t[0][2])) < 1e-4) continue;
            for (let e = 0; e < 3; e++) {
                const a = t[e], b = t[(e + 1) % 3], c = t[(e + 2) % 3];
                const ka = k3(a), kb = k3(b), id2 = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
                const held = edges.get(id2);
                if (held) held.n++; else edges.set(id2, { a, b, c, n: 1 });
            }
        }
        for (const { a, b, c, n } of edges.values()) {
            if (n !== 1) continue;
            const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
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
    return { tiles: store.tiles.size };
}

export function spikeReport(store, besideM = 10) {
    const out = { tiles: (store.tiles || new Map()).size, stretched: [], beside: [], setback: [], bare: [], ends: [], overhangs: [], km: {} };
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
    for (const kind of ['beside', 'setback', 'bare', 'ends', 'overhangs']) {
        for (const o of out[kind]) {
            const km = (Math.round(o.s / 100) / 10).toFixed(1);
            out.km[km] = out.km[km] || { beside: 0, setback: 0, bare: 0, ends: 0, overhangs: 0 };
            out.km[km][kind]++;
        }
    }
    return out;
}
