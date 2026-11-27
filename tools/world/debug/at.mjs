// Usage: node tools/world/debug/at.mjs <stage> <ride s> [lateral m,lateral m,...] [--settle <s>] [--xz x,z;x,z]
// Everything drawn under and over the points across the ride at s (lateral metres along (cos h, -sin h), + the rider's left, as in
// js/world/route.js): a vertical ray through each point lists every mesh it meets, by name, height and
// facing, and the physics ground's height there. The bike is put down at s (or at --settle) first. With --xz the
// points are those world points instead (x,z pairs split by ';').
import { loadStage, settleAt, r2 } from './load.mjs';

const args = process.argv.slice(2);
const flag = args.indexOf('--settle');
const settle = flag >= 0 ? Number(args.splice(flag, 2)[1]) : null;
const xzFlag = args.indexOf('--xz');
const xz = xzFlag >= 0 ? args.splice(xzFlag, 2)[1].split(';').map(t => t.split(',').map(Number)) : null;
const [stage, sText, latText = '-8,-6,-4,-2,0,2,4,6,8'] = args;
if (!stage || !sText) { console.error('usage: node tools/world/debug/at.mjs <stage> <ride s> [lat,lat] [--settle <s>]'); process.exit(2); }
const { game, env } = await loadStage(stage);
const { THREE } = game;
const s = Number(sText);
await settleAt(env, settle ?? s);
const p = env.route.sample(s, {});
const nx = Math.cos(p.heading), nz = -Math.sin(p.heading);
console.log(JSON.stringify({ s, x: r2(p.x), y: r2(p.y), z: r2(p.z), nx: r2(nx), nz: r2(nz) }));
const ray = new THREE.Raycaster();
ray.params.Line = { threshold: 0 };
const scene = env.scene || env.root;
scene.updateMatrixWorld(true);
const points = xz ? xz.map(([x, z]) => ({ lat: `${x},${z}`, x, z })) : latText.split(',').map(Number).map(lat => ({ lat, x: p.x + nx * lat, z: p.z + nz * lat }));
for (const { lat, x, z } of points) {
    ray.set(new THREE.Vector3(x, p.y + 300, z), new THREE.Vector3(0, -1, 0));
    ray.far = 1000;
    const hits = ray.intersectObject(scene, true).map(h => ({ name: h.object.name || h.object.parent?.name || h.object.type, y: r2(h.point.y), up: h.face ? r2(h.face.normal.clone().transformDirection(h.object.matrixWorld).y) : null }));
    const ground = env.ground.groundY(x, z, null);
    console.log(`lat ${lat}: physics ${Number.isFinite(ground) ? r2(ground) : ground}`);
    for (const h of hits) console.log(`  ${h.y}\t${h.up}\t${h.name}`);
}
