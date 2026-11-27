// The physics stands on what is drawn: across the ride's verge and the band of a wall's coping, the height the bike
// stands at (WorldGround.groundY) is the height of the surface drawn there. Shared by the node test
// (tests/unit/world-ground-drawn.test.js) and tools/world/debug/ground-drawn.mjs.
//
// groundDrawnWindow(game, env, store, s0, s1) reads the ride's segments from s0 to s1 (a quarter and three quarters of the way along each: on a row
// itself a point belongs to both its segments, and a wall's end there is read from the one that has it),
// on each side, at laterals from just past the carriageway's edge to `faceM` short of the verge's edge (the coping's
// band lies in the verge, COPING_W_M in from a face STONE_PROUD_M past it; within a hand of the face the two read the
// face's line a few centimetres apart), and keeps every point where the two differ by more than `stepM`: the drawn top is the highest drawn
// surface (land at full detail, road ribbons, the road works: ground, paving, stone, decks) no higher than `overM`
// over the physics. A point where the physics makes a fall or a wall of a parapet's height is left out
// (world-fairness reads those; a wall's coping is a wall zone COPING_UP_M high that the bike stands on, so it is
// read), and so is a point with nothing drawn under it. A step stands on a coping past a wall's end that the drawing never laid
// (leg 5 s 37 555: the ground 0.5 m over the verge drawn there), or sinks under a surface that is drawn.
// groundDrawnReport(store) gives the places, once each by 10 m of ride s and side: {s, side, lateral, physicsY,
// drawnY, stepM}, worst first.
export const GROUND_DRAWN_RULES = { stepM: 0.2, overM: 0.3, lateralStepM: 0.2, faceM: 0.3 };

export function groundDrawnWindow(game, env, store, s0, s1, rules = GROUND_DRAWN_RULES) {
    const { THREE } = game;
    const v = new THREE.Vector3();
    store.grids = store.grids || new Map();
    store.places = store.places || new Map();
    const gridOf = (mesh, start, count) => {
        const id = `${mesh.geometry.uuid}:${start}`;
        if (store.grids.has(id)) return store.grids.get(id);
        mesh.updateMatrixWorld(true);
        const pos = mesh.geometry.attributes.position, index = mesh.geometry.index, cell = 4;
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
            top(x, z, under) {
                let best = null;
                for (const ref of hash.get(Math.floor(x / cell) * 65536 + Math.floor(z / cell)) || []) {
                    const t = tris[ref];
                    const d = (t[5] - t[8]) * (t[0] - t[6]) + (t[6] - t[3]) * (t[2] - t[8]);
                    const a = ((t[5] - t[8]) * (x - t[6]) + (t[6] - t[3]) * (z - t[8])) / d, b = ((t[8] - t[2]) * (x - t[6]) + (t[0] - t[6]) * (z - t[8])) / d, c = 1 - a - b;
                    if (a < -1e-9 || b < -1e-9 || c < -1e-9) continue;
                    const y = a * t[1] + b * t[4] + c * t[7];
                    if (y <= under && (best === null || y > best)) best = y;
                }
                return best;
            }
        };
        store.grids.set(id, grid);
        return grid;
    };
    // What is drawn now: the land at full detail, every road mesh (a tube's fittings and lining hang over the road)
    const grids = [];
    for (const built of env.tileMeshes.values()) {
        const mesh = built.mesh || built;
        if (!mesh || !mesh.isMesh || !/lod0$/.test(mesh.name)) continue;
        grids.push(gridOf(mesh, 0, mesh.geometry.index ? mesh.geometry.index.count : mesh.geometry.attributes.position.count));
    }
    for (const [index, group] of env.roadMeshes) {
        const held = env.streamer && env.streamer.roads.get(index);
        // (a far section's rows are 16 m apart: read at full detail only)
        if (held && held.lod > 0) continue;
        group.traverse(o => { if (o.isMesh && o.name !== 'tube-fittings') grids.push(gridOf(o, 0, o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count)); });
    }
    for (const group of env.sideMeshes.values()) group.traverse(o => { if (o.isMesh && o.name !== 'tube-fittings') grids.push(gridOf(o, 0, o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count)); });
    const drawnTop = (x, z, under) => { let best = null; for (const g of grids) { const y = g.top(x, z, under); if (y !== null && (best === null || y > best)) best = y; } return best; };
    const route = env.route, points = route.points, located = {};
    const verge = game.RoadSurface.VERGE_M;
    const from = Math.max(0, route.indexAt(s0)), to = Math.min(points.length - 2, route.indexAt(s1));
    for (let i = from; i <= to; i++) {
        for (const t of [0.25, 0.75]) {
            const a = points[i], b = points[i + 1];
            const s = a.s + (b.s - a.s) * t;
            const p = route.sample(s, {});
            const half = p.width / 2, nx = Math.cos(p.heading), nz = -Math.sin(p.heading);
            for (const side of [-1, 1]) {
                // (the verge as the physics has it there: narrowed at a side road's mouth, WorldGround.vergeAt)
                const edge = env.ground.vergeAt ? env.ground.vergeAt(i, side * (half + 0.5), t) : verge;
                for (let d = half + 0.1; d <= half + edge - rules.faceM + 1e-6; d += rules.lateralStepM) {
                    const x = p.x + nx * d * side, z = p.z + nz * d * side;
                    // (located on this row's own leg, as the bike rides it: in a hairpin or under a road the other
                    // leg is its own; WorldGround.locate with a hint)
                    const y = env.ground.groundY(x, z, { start: Math.max(0, i - 1), end: i + 1 }, false, located);
                    if (Math.abs(located.lateral) <= located.width / 2) continue;
                    const zone = env.ground.zoneAt(located, located.width / 2);
                    // (a fall, and a wall the bike meets as a face, a parapet or a tube's rock, are world-fairness's: a wall's
                    // coping, COPING_UP_M high, is a step the bike stands on)
                    if (zone && (zone.kind === 'fall' || (zone.kind === 'wall' && !(zone.height <= game.RoadMesh.COPING_UP_M + 1e-6)))) continue;
                    if (!Number.isFinite(y)) continue;
                    const drawn = drawnTop(x, z, y + rules.overM);
                    if (drawn === null) continue;
                    const step = y - drawn;
                    if (Math.abs(step) <= rules.stepM) continue;
                    const key = `${Math.round(s / 10)}|${side}`;
                    const old = store.places.get(key);
                    if (!old || Math.abs(step) > Math.abs(old.stepM)) store.places.set(key, { s: Math.round(s * 10) / 10, side, lateral: Math.round(d * 100) / 100, x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, physicsY: Math.round(y * 100) / 100, drawnY: Math.round(drawn * 100) / 100, stepM: Math.round(step * 100) / 100 });
                }
            }
        }
    }
}

export function groundDrawnReport(store) {
    return [...(store.places || new Map()).values()].sort((a, b) => Math.abs(b.stepM) - Math.abs(a.stepM));
}
