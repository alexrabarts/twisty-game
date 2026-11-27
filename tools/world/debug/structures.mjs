// Usage: node tools/world/debug/structures.mjs [stage] [kinds, e.g. intrusions,coplanar] [from s] [to s]
// The world-structures sweep of a stage (the Tremola by default), streamed every 800 m as
// tests/unit/world-structures.test.js reads it: the counts, then every intrusion grouped by source, kind, road and
// 10 m of ride s (each group's count and deepest), and the coplanar pairs and seams when asked for. Two runs of the
// same commit differ only where the counts move with the order the chunks build in.
import { loadStage, settleAt } from './load.mjs';
import { structureWindow, structureSeams, coplanarOverlaps } from '../../../tests/helpers/world-structures.js';

const [stageText, kindsText, fromText, toText] = process.argv.slice(2);
const stage = stageText || 'tremola';
const kinds = kindsText ? kindsText.split(',') : ['intrusions'];
const { game, env } = await loadStage(stage);
const W = 800, from = fromText ? Number(fromText) : env.startS, to = toText ? Number(toText) : env.endS;
const seen = { structures: new Set(), seams: new Set(), coplanar: new Set() };
const done = { structures: new Set(), seams: new Set(), coplanar: new Set() };
const sweep = { triangles: 0, intrusions: [], physics: [], seams: [], coplanar: [], seamCount: 0, coplanarCount: 0 };
for (let s = from; s < to; s += W) {
    const p = await settleAt(env, s + W / 2);
    const r = structureWindow(game, env, { seen: seen.structures, done: done.structures, detail: 100000 });
    sweep.triangles += r.triangles;
    sweep.intrusions.push(...r.all);
    sweep.physics.push(...r.physics);
    const seams = structureSeams(game, env, { seen: seen.seams, done: done.seams, detail: 100000 });
    sweep.seamCount += seams.pairs;
    sweep.seams.push(...seams.worst);
    const flat = coplanarOverlaps(game, env, { seen: seen.coplanar, done: done.coplanar, detail: 100000 });
    sweep.coplanarCount += flat.pairs;
    sweep.coplanar.push(...flat.worst);
}
console.log(`structures: ${sweep.triangles} triangles, ${sweep.intrusions.length} in a carriageway, ${sweep.physics.length} stub walls, ${sweep.seamCount} seams, ${sweep.coplanarCount} coplanar pairs`);
if (kinds.includes('intrusions')) {
    const groups = new Map();
    for (const i of sweep.intrusions) {
        const key = `${i.source} ${i.kind} owner=${i.owner} road=${i.road} s~${Math.round(i.s / 10) * 10}`;
        const g = groups.get(key) || groups.set(key, { n: 0, worst: i }).get(key);
        g.n++;
        if (i.depthM > g.worst.depthM) g.worst = i;
    }
    for (const [key, g] of [...groups].sort((a, b) => a[1].worst.s - b[1].worst.s)) console.log(`${g.n}\t${key}\t${JSON.stringify(g.worst)}`);
}
if (kinds.includes('physics')) for (const p of sweep.physics) console.log('physics', JSON.stringify(p));
if (kinds.includes('seams')) for (const p of sweep.seams) console.log('seam', JSON.stringify(p));
if (kinds.includes('coplanar')) for (const p of sweep.coplanar.sort((a, b) => a.s - b.s)) console.log('coplanar', JSON.stringify(p));
