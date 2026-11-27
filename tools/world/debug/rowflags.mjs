// Usage: node tools/world/debug/rowflags.mjs <stage> <row from> <row to>
// The ride's rows: s, bits, flags, width, viaduct and stopping-place pads
import { loadStage } from './load.mjs';

const [stage, a, b] = process.argv.slice(2);
const { env } = await loadStage(stage);
for (let i = Number(a); i <= Number(b); i++) { const p = env.route.points[i]; console.log(i, Math.round(p.s * 10) / 10, p.bits, JSON.stringify(p.flags), p.width, !!p.viaduct, p.padN || 0, p.padP || 0); }
