// Usage: node tools/world/debug/band.mjs <stage> <ride s,s,...> <side -1|1>
// What the physics reads of the ride's wall plan at each s on one side (WorldGround.wallBand's inputs): the row,
// walledAt, taperAt, parapetAt, bridgedAt, and the drawn taper the plan records (RoadMesh.edgeWorks `drawn`)
import { loadStage, settleAt, r2 } from './load.mjs';

const [stage, sText, signText] = process.argv.slice(2);
if (!stage || !sText || !signText) { console.error('usage: node tools/world/debug/band.mjs <stage> <s,s> <side>'); process.exit(2); }
const { env } = await loadStage(stage);
const sign = Number(signText);
for (const s of sText.split(',').map(Number)) {
    await settleAt(env, s);
    const at = env.route.sample(s, {}), i = env.route.indexAt(s), t = (s - env.route.points[i].s) / (env.route.points[i + 1].s - env.route.points[i].s);
    const walls = env.rideWalls(env.rowSection[i]), key = sign > 0 ? 'r' : 'l', k = i - walls.plan.base;
    console.log(JSON.stringify({ s, row: i, t: r2(t), y: r2(at.y), walled: env.walledAt(i, sign), taper: r2(env.taperAt(i, sign, t)), parapet: !!env.parapetAt(i, sign, t), bridged: env.bridgedAt(i, sign), past: [walls.plan.past[key][k], walls.plan.past[key][k + 1]], drawn: walls.plan.drawn ? walls.plan.drawn[key][k] : 'none' }));
}
