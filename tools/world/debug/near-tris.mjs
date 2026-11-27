// Usage: node tools/world/debug/near-tris.mjs <stage> <ride s> <x,z> [reach m]
// Every drawn triangle of the road meshes (the ride's sections and the side chunks, ribbons left out) over or within `reach` (0.5 m)
// of a point in plan, the bike put down at ride s first: mesh, group, owner, corners.
import { loadStage, settleAt, r2 } from './load.mjs';

const [stage, sText, xzText, reachText = '0.5'] = process.argv.slice(2);
if (!stage || !sText || !xzText) { console.error('usage: node tools/world/debug/near-tris.mjs <stage> <ride s> <x,z> [reach]'); process.exit(2); }
const { game, env } = await loadStage(stage);
await settleAt(env, Number(sText));
const [x, z] = xzText.split(',').map(Number), reach = Number(reachText);
const v = new game.THREE.Vector3();
// How far (x, z) lies from a triangle in plan: 0 inside it, else the distance to its nearest edge
const planDistance = (t, px, pz) => {
    const side = (a, b) => (b[0] - a[0]) * (pz - a[2]) - (b[2] - a[2]) * (px - a[0]);
    const s0 = side(t[0], t[1]), s1 = side(t[1], t[2]), s2 = side(t[2], t[0]);
    if ((s0 >= 0 && s1 >= 0 && s2 >= 0) || (s0 <= 0 && s1 <= 0 && s2 <= 0)) return 0;
    let best = Infinity;
    for (const [a, b] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) {
        const dx = b[0] - a[0], dz = b[2] - a[2], run = dx * dx + dz * dz;
        const u = run === 0 ? 0 : Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[2]) * dz) / run));
        best = Math.min(best, Math.hypot(a[0] + dx * u - px, a[2] + dz * u - pz));
    }
    return best;
};
for (const [source, groups] of [['ride', env.roadMeshes], ['side', env.sideMeshes]]) for (const group of groups.values()) group.traverse(o => {
    if (!o.isMesh || o.name === 'road-side' || o.name === 'road-ribbon') return;
    o.updateMatrixWorld(true);
    const pos = o.geometry.attributes.position, index = o.geometry.index, owners = o.geometry.userData.owners;
    const groupsOf = o.geometry.groups.length ? o.geometry.groups : [{ start: 0, count: index ? index.count : pos.count, materialIndex: -1 }];
    for (const g of groupsOf) for (let i = g.start; i + 2 < g.start + g.count; i += 3) {
        const t = [];
        for (let k = 0; k < 3; k++) { v.fromBufferAttribute(pos, index ? index.getX(i + k) : i + k).applyMatrix4(o.matrixWorld); t.push([v.x, v.y, v.z]); }
        if (planDistance(t, x, z) > reach) continue;
        console.log(source, o.name, 'group', g.materialIndex, 'owner', owners ? owners[i / 3] : '', JSON.stringify(t.map(p => p.map(r2))));
    }
});
