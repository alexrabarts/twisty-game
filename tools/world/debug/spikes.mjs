// Usage: node tools/world/debug/spikes.mjs <stage> [from s] [to s] [kinds, e.g. overhangs,flaps]
// The world-spikes report of a stage (or of its stretch from..to), streamed and read every 300 m as
// tests/unit/world-spikes.test.js reads it: the count of each kind, then every entry of the kinds asked for (all
// kinds that are not `beside` or `setback` by default).
import { loadStage, settleAt } from './load.mjs';
import { spikeWindow, spikeReport, SPIKE_RULES } from '../../../tests/helpers/world-spikes.js';

const [stage, fromText, toText, kindsText] = process.argv.slice(2);
if (!stage) { console.error('usage: node tools/world/debug/spikes.mjs <stage> [from s] [to s] [kinds]'); process.exit(2); }
const { game, env } = await loadStage(stage);
const W = 300, from = fromText ? Number(fromText) : env.startS, to = toText ? Number(toText) : env.endS;
const store = {};
for (let s = Math.max(env.startS, from - W / 2); s < Math.min(env.endS, to); s += W) {
    const p = await settleAt(env, s + W / 2);
    spikeWindow(game, env, store, p, 350, SPIKE_RULES);
}
const report = spikeReport(store, SPIKE_RULES.besideM);
const KINDS = ['beside', 'setback', 'bare', 'ends', 'overhangs', 'flaps', 'proud', 'fins', 'unfaced', 'thin', 'folds', 'low', 'jogs', 'strays', 'piers', 'soffits'];
console.log(JSON.stringify(Object.fromEntries(KINDS.map(k => [k, report[k].length]))));
const show = kindsText ? kindsText.split(',') : KINDS.filter(k => k !== 'beside' && k !== 'setback');
for (const kind of show) for (const item of report[kind]) console.log(kind, JSON.stringify(item));
