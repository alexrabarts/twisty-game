// Usage: node tools/world/debug/junction.mjs <stage> [j35,j95,...]
// The world-junctions report for some junctions of a stage (all its junctions if none is named), each read with the
// bike put down at the junction, as tests/unit/world-junctions.test.js reads them; prints every fault in full.
import { loadStage, settleAt } from './load.mjs';
import { junctionWindow, junctionReport } from '../../../tests/helpers/world-junctions.js';

const [stage, ids] = process.argv.slice(2);
if (!stage) { console.error('usage: node tools/world/debug/junction.mjs <stage> [j35,j95]'); process.exit(2); }
const { game, env } = await loadStage(stage);
const want = ids ? ids.split(',') : null;
const inStage = j => !env.stage || j.passes.some(p => p.sIn >= env.stage.from - 1 && p.sIn <= env.stage.to + 1);
const store = {};
for (const junction of env.graph.junctions.filter(inStage)) {
    if (want && !want.includes(junction.id) && !want.includes(String(junction.id))) continue;
    const p = await settleAt(env, junction.passes[0].sIn);
    junctionWindow(game, env, store, p, { nearM: 80 });
}
const found = junctionReport(store);
for (const kind of ['steps', 'holes', 'sunk', 'decks', 'open', 'walls', 'blocked', 'cliffs', 'strips', 'pits', 'clefts']) {
    console.log(`${kind}: ${found[kind].length}`);
    for (const item of found[kind]) console.log('  ' + JSON.stringify(item));
}
