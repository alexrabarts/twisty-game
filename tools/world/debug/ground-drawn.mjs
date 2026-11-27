// Usage: node tools/world/debug/ground-drawn.mjs <stage> [from s] [to s]
// Where the physics' height across the ride's verge and wall band differs from the height drawn there
// (tests/helpers/world-ground-drawn.js), streamed every 300 m as tests/unit/world-ground-drawn.test.js reads it:
// the count, then every place, worst first.
import { loadStage, settleAt } from './load.mjs';
import { groundDrawnWindow, groundDrawnReport } from '../../../tests/helpers/world-ground-drawn.js';

const [stage, fromText, toText] = process.argv.slice(2);
if (!stage) { console.error('usage: node tools/world/debug/ground-drawn.mjs <stage> [from s] [to s]'); process.exit(2); }
const { game, env } = await loadStage(stage);
const W = 300, from = fromText ? Number(fromText) : env.startS, to = toText ? Number(toText) : env.endS;
const store = {};
for (let s = Math.max(env.startS, from); s < Math.min(env.endS, to); s += W) {
    await settleAt(env, s + W / 2);
    groundDrawnWindow(game, env, store, s, Math.min(s + W, to));
    store.grids.clear();
}
const report = groundDrawnReport(store);
console.log(`${stage}: ${report.length} places`);
for (const r of report) console.log(JSON.stringify(r));
