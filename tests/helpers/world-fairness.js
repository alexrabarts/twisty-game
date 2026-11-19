// The fairness invariant of a world ride: physics can only kill the rider where the rider can see why. Shared by the
// node test (tests/unit/world-fairness.test.js) and the GPU probe world-fairness (tools/terrain-check.mjs), which
// passes fairnessWindow into the page with toString(), so it is one self-contained function with no imports.
//
// fairnessWindow(game, env, vehicle, {s0, s1, stepM, acrossM}) looks at the ride from s0 to s1 every stepM metres,
// across the drawn carriageway and verge every acrossM metres, against the meshes drawn there now (the caller streams
// the window in first). Each point is found on the drawn LOD0 ribbon (its own triangles: the drawn column offset and
// half width), and the physics reads it as the bike would (route.project, WorldGround.zoneAt, Vehicle.worldZone).
// It returns {points, width, solid, runoff}:
//   - width: the physics lateral or half width more than WIDTH_M off the drawn column offset or half width
//   - solid: a wall or a fall on the drawn ribbon with nothing drawn within VISIBLE_M of it that the rider could hit
//     (a retaining wall, parapet, deck side, tunnel or bridge part of the road works, a barrier) and, for a wall, no
//     drawn land standing wallRiseM over the road there
//   - runoff: run-off (the off-road timer) on the drawn carriageway
export function fairnessWindow(game, env, vehicle, { s0, s1, stepM = 1, acrossM = 0.25 }) {
    const { THREE, RoadSurface, TerrainMesh } = game;
    const WIDTH_M = 0.1, VISIBLE_M = 0.5, CELL = 8, DETAIL = 40;
    const route = env.route, ground = env.ground, world = env.physics;
    const verge = RoadSurface.VERGE_M;
    const key = (x, z) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
    const ribbon = new Map(), works = new Map();
    const file = (map, tri) => {
        const x0 = Math.min(tri[0], tri[3], tri[6]), x1 = Math.max(tri[0], tri[3], tri[6]);
        const z0 = Math.min(tri[2], tri[5], tri[8]), z1 = Math.max(tri[2], tri[5], tri[8]);
        for (let cx = Math.floor((x0 - VISIBLE_M) / CELL); cx <= Math.floor((x1 + VISIBLE_M) / CELL); cx++) {
            for (let cz = Math.floor((z0 - VISIBLE_M) / CELL); cz <= Math.floor((z1 + VISIBLE_M) / CELL); cz++) {
                const k = `${cx},${cz}`;
                (map.get(k) || map.set(k, []).get(k)).push(tri);
            }
        }
    };
    const v = new THREE.Vector3();
    const triangles = (mesh, take) => {
        mesh.updateMatrixWorld(true);
        const geometry = mesh.geometry, pos = geometry.attributes.position, index = geometry.index;
        const count = index ? index.count : pos.count;
        const groups = geometry.groups && geometry.groups.length ? geometry.groups : [{ start: 0, count, materialIndex: 0 }];
        for (const group of groups) {
            for (let i = group.start; i + 2 < group.start + group.count; i += 3) {
                const ids = [0, 1, 2].map(k => (index ? index.getX(i + k) : i + k));
                const tri = [];
                for (const id of ids) { v.fromBufferAttribute(pos, id).applyMatrix4(mesh.matrixWorld); tri.push(v.x, v.y, v.z); }
                take(tri, ids, group.materialIndex, geometry);
            }
        }
    };
    for (const group of env.roadMeshes.values()) {
        group.traverse(o => {
            if (!o.isMesh) return;
            if (o.geometry.userData.near && o.geometry.attributes.road) {
                const uv = o.geometry.attributes.uv, road = o.geometry.attributes.road;
                triangles(o, (tri, ids) => { tri.offset = ids.map(id => uv.getX(id)); tri.half = ids.map(id => road.getX(id)); file(ribbon, tri); });
            } else if (o.name !== 'road-ribbon') {
                // The road works: apron and paving (materials 0 and 3) are ground; decks, walls, parapets, tunnels and bridges stand up
                const apronIsGround = o.name === 'road-works';
                triangles(o, (tri, ids, material) => { if (!(apronIsGround && (material === 0 || material === 3))) file(works, tri); });
            }
        });
    }
    // The barriers as drawn: the instanced mesh's own matrices on its geometry's box
    const barriers = [];
    const mesh = env.barrierMesh;
    if (mesh && mesh.count) {
        mesh.geometry.computeBoundingBox();
        const box = mesh.geometry.boundingBox, m = new THREE.Matrix4();
        for (let i = 0; i < mesh.count; i++) {
            mesh.getMatrixAt(i, m);
            const corners = [[box.min.x, box.min.z], [box.max.x, box.min.z], [box.max.x, box.max.z], [box.min.x, box.max.z]].map(([x, z]) => new THREE.Vector3(x, box.min.y, z).applyMatrix4(m));
            barriers.push({ poly: corners.map(c => [c.x, c.z]), y0: corners[0].y, y1: corners[0].y + (box.max.y - box.min.y) });
        }
    }
    const segGap = (px, pz, ax, az, bx, bz) => {
        const dx = bx - ax, dz = bz - az, run = dx * dx + dz * dz;
        const t = run === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / run));
        return Math.hypot(ax + dx * t - px, az + dz * t - pz);
    };
    // Barycentric (u, v, w) of (x, z) in the triangle's plan, or null outside it (with a hair of slack)
    const bary = (tri, x, z) => {
        const ax = tri[0], az = tri[2], bx = tri[3], bz = tri[5], cx = tri[6], cz = tri[8];
        const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
        if (Math.abs(d) < 1e-12) return null;
        const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
        const w = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
        const t = 1 - u - w;
        return u >= -1e-6 && w >= -1e-6 && t >= -1e-6 ? [u, w, t] : null;
    };
    // The drawn ribbon at (x, z) nearest height y: {offset, half, y}, or null off the drawn ribbon
    const drawnAt = (x, z, y) => {
        let best = null;
        for (const tri of ribbon.get(key(x, z)) || []) {
            const b = bary(tri, x, z);
            if (!b) continue;
            const ty = b[0] * tri[1] + b[1] * tri[4] + b[2] * tri[7];
            if (Math.abs(ty - y) > 3 || (best && Math.abs(ty - y) >= Math.abs(best.y - y))) continue;
            best = { offset: b[0] * tri.offset[0] + b[1] * tri.offset[1] + b[2] * tri.offset[2], half: b[0] * tri.half[0] + b[1] * tri.half[1] + b[2] * tri.half[2], y: ty };
        }
        return best;
    };
    // Something drawn the rider could hit within VISIBLE_M of (x, z), standing at the road's height y
    const visibleNear = (x, z, y) => {
        for (const tri of works.get(key(x, z)) || []) {
            const lo = Math.min(tri[1], tri[4], tri[7]), hi = Math.max(tri[1], tri[4], tri[7]);
            if (hi < y + 0.2 || lo > y + 1.5) continue;
            if (bary(tri, x, z)) return true;
            if (segGap(x, z, tri[0], tri[2], tri[3], tri[5]) <= VISIBLE_M || segGap(x, z, tri[3], tri[5], tri[6], tri[8]) <= VISIBLE_M || segGap(x, z, tri[6], tri[8], tri[0], tri[2]) <= VISIBLE_M) return true;
        }
        for (const b of barriers) {
            if (b.y1 < y + 0.2 || b.y0 > y + 1.5) continue;
            const p = b.poly;
            let inside = false;
            for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > z) !== (p[j][1] > z) && x < ((p[j][0] - p[i][0]) * (z - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) inside = !inside;
            if (inside) return true;
            for (let i = 0; i < p.length; i++) if (segGap(x, z, p[i][0], p[i][1], p[(i + 1) % p.length][0], p[(i + 1) % p.length][1]) <= VISIBLE_M) return true;
        }
        return false;
    };
    const out = { points: 0, width: [], solid: [], runoff: [], widthCount: 0, solidCount: 0, runoffCount: 0, worstWidthM: 0 };
    const note = (list, item) => { if (list.length < DETAIL) list.push(item); };
    const p = {}, located = {};
    for (let s = s0; s <= s1 + 1e-6; s += stepM) {
        route.sample(s, p);
        if (p.flags && (p.flags.tunnel || p.flags.gallery || p.flags.bridge)) continue;
        const hint = route.project(p.x, p.z, null, {});
        if (Math.abs(hint.s - s) > 1) continue;
        const reach = p.width / 2 + verge;
        for (let lat = -reach; lat <= reach + 1e-6; lat += acrossM) {
            const x = p.x + lat * Math.cos(p.heading), z = p.z - lat * Math.sin(p.heading);
            const drawn = drawnAt(x, z, p.y);
            if (!drawn) continue;
            out.points++;
            const proj = route.project(x, z, { index: hint.index }, {});
            const at = { s: Math.round(s * 10) / 10, lateral: Math.round(lat * 100) / 100 };
            const off = Math.max(Math.abs(proj.lateral - drawn.offset), Math.abs(proj.width / 2 - drawn.half));
            if (off > out.worstWidthM) out.worstWidthM = off;
            if (off > WIDTH_M) {
                out.widthCount++;
                note(out.width, { ...at, physicsLateral: Math.round(proj.lateral * 100) / 100, drawnOffset: Math.round(drawn.offset * 100) / 100, physicsHalf: Math.round(proj.width / 2 * 100) / 100, drawnHalf: Math.round(drawn.half * 100) / 100 });
            }
            located.index = proj.index;
            located.lateral = proj.lateral;
            located.x = undefined;
            located.z = undefined;
            const zone = vehicle.worldZone(ground.zoneAt(located, proj.width / 2), located, proj.y);
            if (zone.kind === 'runoff' && Math.abs(drawn.offset) <= drawn.half - WIDTH_M) {
                out.runoffCount++;
                note(out.runoff, { ...at, drawnOffset: Math.round(drawn.offset * 100) / 100 });
            }
            if (zone.kind !== 'wall' && zone.kind !== 'fall') continue;
            if (visibleNear(x, z, drawn.y)) continue;
            const land = ground.tileHeight(x, z);
            if (zone.kind === 'wall' && land !== null && land - TerrainMesh.SINK_M >= proj.y + world.wallRiseM - 0.25) continue;
            out.solidCount++;
            note(out.solid, { ...at, kind: zone.kind, parapet: !!zone.parapet, drawnOffset: Math.round(drawn.offset * 100) / 100, drawnHalf: Math.round(drawn.half * 100) / 100 });
        }
    }
    out.worstWidthM = Math.round(out.worstWidthM * 1000) / 1000;
    return out;
}
