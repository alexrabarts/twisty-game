// Usage: node tools/world/debug/walls.mjs <stage> <ride s> <x,z> [reach m]
// The wall runs drawn within `reach` (6 m) of a point, the bike put down at ride s first: for each run its owner
// (-1 the ride), its key, and its points near the point with their foot, outward and parapet, ends marked.
import { loadStage, settleAt, r2 } from './load.mjs';

const [stage, sText, xzText, reachText = '6'] = process.argv.slice(2);
if (!stage || !sText || !xzText) { console.error('usage: node tools/world/debug/walls.mjs <stage> <ride s> <x,z> [reach]'); process.exit(2); }
const { env } = await loadStage(stage);
await settleAt(env, Number(sText));
const [x, z] = xzText.split(',').map(Number), reach = Number(reachText);
const runs = [];
for (const [k, list] of env.sideWalls) for (const run of list) runs.push({ chunk: k, run });
for (const section of env.streamer.sections) if (env.rideWallCache.has(section.index)) for (const run of env.rideWallCache.get(section.index).runs) runs.push({ chunk: `ride:${section.index}`, run });
for (const { chunk, run } of runs) {
    const close = run.points.map((p, i) => [p, i]).filter(([p]) => Math.hypot(p[0] - x, p[2] - z) < reach);
    if (!close.length) continue;
    console.log(`run owner=${run.owner ?? -1} key=${run.key} chunk=${chunk} points=${run.points.length}`);
    for (const [p, i] of close) console.log(`  ${i === 0 ? 'START' : i === run.points.length - 1 ? 'END  ' : '     '} ${i}\t${r2(p[0])},${r2(p[1])},${r2(p[2])}\tfoot ${r2(run.foot[i])}\tout ${run.out[i].map(r2)}\trail ${run.rail ? run.rail[Math.min(i, run.rail.length - 1)] : ''}`);
}
