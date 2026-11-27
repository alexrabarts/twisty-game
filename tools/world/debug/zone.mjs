// Usage: node tools/world/debug/zone.mjs <stage> <ride s> <lateral,lateral,...>
// The physics at points across the ride at s (lateral metres, + the rider's left): the zone WorldGround.zoneAt gives
// (kind, start, height, parapet) and the ground height, with what is drawn under each point
import { loadStage, settleAt, r2 } from './load.mjs';

const [stage, sText, latText] = process.argv.slice(2);
const { game, env } = await loadStage(stage);
const s = Number(sText);
await settleAt(env, s);
const p = env.route.sample(s, {}), nx = Math.cos(p.heading), nz = -Math.sin(p.heading);
const ray = new game.THREE.Raycaster(), scene = env.scene || env.root;
scene.updateMatrixWorld(true);
for (const lat of latText.split(',').map(Number)) {
    const x = p.x + nx * lat, z = p.z + nz * lat, proj = env.route.project(x, z, null, {});
    const loc = { index: proj.index, t: proj.along, lateral: proj.lateral, x, z, roadY: proj.y, flags: proj.flags };
    const zone = env.ground.zoneAt(loc, proj.width / 2);
    ray.set(new game.THREE.Vector3(x, p.y + 30, z), new game.THREE.Vector3(0, -1, 0));
    const hits = ray.intersectObject(scene, true).filter(h => h.point.y > p.y - 3).map(h => `${h.object.name}@${r2(h.point.y)}`).join(' ');
    console.log(JSON.stringify({ lat, half: r2(proj.width / 2), index: proj.index, t: r2(proj.along), zone: { kind: zone.kind, start: r2(zone.start), height: zone.height, parapet: zone.parapet }, y: r2(env.ground.groundY(x, z, null)), roadY: r2(proj.y) }), hits);
}
