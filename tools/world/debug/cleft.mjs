// Usage: node tools/world/debug/cleft.mjs <stage> <ride s> <side -1|1> [rows either side]
// The ride's rows round s on one side, as the cleft rule reads them (WorldEnvironment.cleftAt): each row's s, bits,
// width and verge, whether the ride's wall stands on the segment from it (walledAt) and by it (rideWalledAt), the
// cleft fill there, and the first side road's band within CLEFT_GAP_M out from the verge with the land under it.
import { loadStage, settleAt, r2 } from './load.mjs';

const [stage, sText, signText, spanText = '6'] = process.argv.slice(2);
if (!stage || !sText || !signText) { console.error('usage: node tools/world/debug/cleft.mjs <stage> <ride s> <side -1|1> [rows]'); process.exit(2); }
const { game, env } = await loadStage(stage);
const { RoadMesh, RoadSurface, WorldEnvironment } = game;
const s = Number(sText), sign = Number(signText);
await settleAt(env, s);
const points = env.route.points;
let index = 0, best = Infinity;
points.forEach((p, i) => { const d = Math.abs((p.s ?? i * env.route.step) - s); if (d < best) { best = d; index = i; } });
const span = Number(spanText);
for (let i = index - span; i <= index + span; i++) {
    const p = points[i];
    if (!p) continue;
    const [vn, vp] = RoadMesh.verges(p);
    const reach = p.width / 2 + (sign > 0 ? vp : vn);
    const ox = sign * Math.cos(p.heading), oz = -sign * Math.sin(p.heading);
    const x = p.x + ox * reach, z = p.z + oz * reach;
    let side = null, low = null;
    for (let t = 0.25; t <= WorldEnvironment.CLEFT_GAP_M + 1e-9; t += 0.25) {
        const y = env.ground.sideRoadY(x + ox * t, z + oz * t, RoadSurface.VERGE_M);
        if (y !== null) { side = { t, y: r2(y) }; break; }
        const land = env.ground.tileHeight(x + ox * t, z + oz * t);
        if (land !== null) low = low === null ? land : Math.min(low, land);
    }
    const fill = env.cleftAt(i, sign);
    console.log(JSON.stringify({ row: i, s: r2(p.s ?? NaN), bits: p.bits, y: r2(p.y), width: p.width, verge: r2(sign > 0 ? vp : vn), walled: env.walledAt(i, sign), rideWalled: env.rideWalledAt(i, sign), side, low: low === null ? null : r2(low), fill: fill && { y: r2(fill.y), run: r2(fill.run) } }));
}
