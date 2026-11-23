// The parapets of the retaining walls as they are drawn: where each one ends against the wall under it. Shared by
// tests/unit/world-parapets.test.js.
//
// parapetWindow(game, env, store) reads the stone of every road's edge works drawn now (the road-works meshes' stone,
// RoadMesh.stoneMaterial: the retaining walls, their faces past their ends and their parapets) and keeps, once for
// each place, every end of a parapet: the face across its end (`cap`: upright, PARAPET_H_M high or the 0.3 m of the
// kerb a parapet fell to at its wall's end before 2026-11, as deep as the parapet and the stone it stands proud by).
// At each it looks past the end, away from the parapet: where the wall's coping still lies there (a top of stone at
// the parapet's foot), the wall goes on past its parapet's end, and the metres it goes on, read along the line of the
// parapet's end and on round a bend, are `pastM`. Where that coping runs into a structure (a bridge's deck or parapet, a viaduct's stone:
// the road works' groups 1 and 4) within `structureM` of its end, the wall's last segment meets the structure, whose
// own parapet is the guard there (RoadMesh.edgeWorks `abutsAt`): `structure`.
// A cap with parapet on both sides of it is a joint inside one parapet (`joints`), not an end.
// parapetReport(store) gives {ends, short, structure, joints}: every parapet end, those whose wall goes on more than
// `flushM` past it to no structure, worst first, those whose wall goes on to a structure, and the joints.
export const PARAPET_RULES = { flushM: 0.05, stepM: 0.25, mostM: 40, kerbM: 0.3, structureM: 1.5 };

export function parapetWindow(game, env, store, rules = PARAPET_RULES) {
    const { THREE, RoadMesh } = game;
    store.seen = store.seen || new Set();
    store.ends = store.ends || new Map();
    store.joints = store.joints || new Map();
    const v = new THREE.Vector3();
    const H = RoadMesh.PARAPET_H_M, deep = RoadMesh.PARAPET_W_M + RoadMesh.STONE_PROUD_M;
    // The structures drawn now, every corner of their triangles hashed in plan (a structure may be another section's)
    const built = new Map(), cellS = 2;
    for (const group of [...env.roadMeshes.values(), ...env.sideMeshes.values()]) {
        group.traverse(o => {
            if (!o.isMesh || o.name !== 'road-works') return;
            o.updateMatrixWorld(true);
            const pos = o.geometry.attributes.position;
            for (const part of o.geometry.groups) {
                if (part.materialIndex !== 1 && part.materialIndex !== 4) continue;
                for (let i = part.start; i < part.start + part.count; i++) {
                    v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
                    const h = Math.floor(v.x / cellS) * 65536 + Math.floor(v.z / cellS);
                    (built.get(h) || built.set(h, []).get(h)).push([v.x, v.y, v.z]);
                }
            }
        });
    }
    const structureNear = (x, y, z) => {
        const r = rules.structureM;
        for (let cx = Math.floor((x - r) / cellS); cx <= Math.floor((x + r) / cellS); cx++) {
            for (let cz = Math.floor((z - r) / cellS); cz <= Math.floor((z + r) / cellS); cz++) {
                for (const q of built.get(cx * 65536 + cz) || []) if (Math.hypot(q[0] - x, q[2] - z) <= r && Math.abs(q[1] - y) <= 2) return true;
            }
        }
        return false;
    };
    for (const group of [...env.roadMeshes.values(), ...env.sideMeshes.values()]) {
        group.traverse(o => {
            if (!o.isMesh || o.name !== 'road-works' || store.seen.has(o.geometry.uuid)) return;
            store.seen.add(o.geometry.uuid);
            const g = o.geometry.groups.find(part => part.materialIndex === 2);
            if (!g) return;
            o.updateMatrixWorld(true);
            const pos = o.geometry.attributes.position, flag = o.geometry.attributes.wallFace, owners = o.geometry.userData.owners;
            const point = i => { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); return [v.x, v.y, v.z]; };
            // Every triangle of the stone, hashed in plan, for the tops that lie over a place
            const tris = [], hash = new Map(), cell = 2;
            for (let i = g.start; i + 2 < g.start + g.count; i += 3) {
                const t = [point(i), point(i + 1), point(i + 2)];
                const area = (t[1][0] - t[0][0]) * (t[2][2] - t[0][2]) - (t[2][0] - t[0][0]) * (t[1][2] - t[0][2]);
                if (Math.abs(area) < 1e-6) continue;
                const ref = tris.push(t) - 1;
                for (let cx = Math.floor(Math.min(t[0][0], t[1][0], t[2][0]) / cell); cx <= Math.floor(Math.max(t[0][0], t[1][0], t[2][0]) / cell); cx++) {
                    for (let cz = Math.floor(Math.min(t[0][2], t[1][2], t[2][2]) / cell); cz <= Math.floor(Math.max(t[0][2], t[1][2], t[2][2]) / cell); cz++) {
                        const h = cx * 65536 + cz;
                        (hash.get(h) || hash.set(h, []).get(h)).push(ref);
                    }
                }
            }
            // Whether a top of stone lies over (x, z) between y0 and y1
            const top = (x, z, y0, y1) => {
                for (const ref of hash.get(Math.floor(x / cell) * 65536 + Math.floor(z / cell)) || []) {
                    const [A, B, C] = tris[ref];
                    const d = (B[2] - C[2]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[2] - C[2]);
                    const a = ((B[2] - C[2]) * (x - C[0]) + (C[0] - B[0]) * (z - C[2])) / d, b = ((C[2] - A[2]) * (x - C[0]) + (A[0] - C[0]) * (z - C[2])) / d, c = 1 - a - b;
                    if (a < -1e-6 || b < -1e-6 || c < -1e-6) continue;
                    const y = a * A[1] + b * B[1] + c * C[1];
                    if (y >= y0 && y <= y1) return true;
                }
                return false;
            };
            // The parapets' ends: upright quads (RoadMesh.quad lays six vertices: a b c, a c d) that are no wall's
            // face or side (`wallFace` 0), H high at both columns and as deep as the parapet
            for (let i = g.start; i + 5 < g.start + g.count; i += 6) {
                if (flag && Math.round(flag.getY(i)) !== 0) continue;
                const q = [0, 1, 2, 5].map(k => point(i + k));
                const cols = [];
                for (const p of q) {
                    const col = cols.find(c => Math.hypot(c.x - p[0], c.z - p[2]) < 1e-3);
                    if (col) { col.lo = Math.min(col.lo, p[1]); col.hi = Math.max(col.hi, p[1]); } else cols.push({ x: p[0], z: p[2], lo: p[1], hi: p[1] });
                }
                if (cols.length !== 2 || cols.some(c => Math.abs(c.hi - c.lo - H) > 2e-3 && Math.abs(c.hi - c.lo - rules.kerbM) > 2e-3)) continue;
                const across = Math.hypot(cols[1].x - cols[0].x, cols[1].z - cols[0].z);
                if (Math.abs(across - deep) > 0.02) continue;
                const mx = (cols[0].x + cols[1].x) / 2, mz = (cols[0].z + cols[1].z) / 2, y0 = (cols[0].lo + cols[1].lo) / 2;
                const id = `${Math.round(mx * 20)},${Math.round(mz * 20)}`;
                if (store.ends.has(id) || store.joints.has(id)) continue;
                // Along the parapet, square to its end: the parapet's own side is the one its top lies over
                const ux = -(cols[1].z - cols[0].z) / across, uz = (cols[1].x - cols[0].x) / across;
                const on = way => top(mx + ux * way * 0.2, mz + uz * way * 0.2, y0 + rules.kerbM - 0.05, y0 + H + 0.1);
                const sides = [on(1), on(-1)];
                if (sides[0] && sides[1]) { store.joints.set(id, { x: Math.round(mx * 100) / 100, z: Math.round(mz * 100) / 100 }); continue; }
                const way = sides[0] ? -1 : sides[1] ? 1 : 0;
                if (!way) continue;
                // Then past its end, away from it, while the wall's coping lies at the parapet's foot, turning with
                // it round a bend
                let pastM = 0, px = mx, pz = mz, dx = ux * way, dz = uz * way;
                for (let d = rules.flushM; d <= rules.mostM; d += d < rules.stepM ? rules.stepM - rules.flushM : rules.stepM) {
                    const step = d - pastM, slack = 0.05 + 0.2 * d;
                    let next = null;
                    for (const turn of [0, 0.15, -0.15, 0.3, -0.3, 0.5, -0.5]) {
                        const cx = dx * Math.cos(turn) - dz * Math.sin(turn), cz = dx * Math.sin(turn) + dz * Math.cos(turn);
                        if (top(px + cx * step, pz + cz * step, y0 - slack, y0 + slack)) { next = [cx, cz]; break; }
                    }
                    if (!next) break;
                    [dx, dz] = next;
                    px += dx * step;
                    pz += dz * step;
                    pastM = d;
                }
                const structure = pastM >= rules.flushM && structureNear(px, y0, pz);
                store.ends.set(id, { x: Math.round(mx * 100) / 100, y: Math.round(y0 * 100) / 100, z: Math.round(mz * 100) / 100, owner: owners ? owners[i / 3] ?? -1 : -1, s: Math.round(env.route.coldLookup(mx, mz, {}).s), pastM: Math.round(pastM * 100) / 100, structure });
            }
        });
    }
}

export function parapetReport(store, rules = PARAPET_RULES) {
    const ends = [...(store.ends || new Map()).values()];
    return { ends, short: ends.filter(e => e.pastM >= rules.flushM && !e.structure).sort((a, b) => b.pastM - a.pastM), structure: ends.filter(e => e.structure), joints: [...(store.joints || new Map()).values()] };
}
