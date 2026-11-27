// Usage: node tools/world/debug/clearance.mjs
// The world-clearance gather of the Tremola slice (tests/helpers/world-clearance-run.js) with no time limit, and
// the things that float over the ground or lie under it as tests/unit/world-clearance.test.js "nothing floats" reads
// them, with the time the gather took
import { readFileSync } from 'node:fs';
import { loadGame } from '../../../tests/helpers/load-game.js';
import { diskFetch } from '../../../tests/helpers/world-fetch.js';
import { modelStandIns } from '../../../tests/helpers/world-clearance.js';
import { rideAndGather } from '../../../tests/helpers/world-clearance-run.js';

const root = new URL('../../../', import.meta.url);
const game = loadGame();
const t0 = Date.now();
const gathered = await rideAndGather(game, { fetchFn: diskFetch().fetchFn, stepM: 100, models: modelStandIns(game.THREE, readFileSync, root) });
console.log(`gathered ${gathered.things.length} things in ${Math.round((Date.now() - t0) / 1000)} s`);
for (const t of gathered.things) {
    if (!['tree', 'boulder', 'stone', 'tuft'].includes(t.type)) continue;
    if (!(t.y0 > t.groundY + 0.1 || t.y1 < t.groundY)) continue;
    console.log(`${t.type} at (${t.x.toFixed(1)}, ${t.z.toFixed(1)}): foot ${t.y0.toFixed(2)}, top ${t.y1.toFixed(2)}, ground ${t.groundY.toFixed(2)}`);
}
