// Usage: node tools/world/debug/rows.mjs <stage> <junction id | list> [reach m]
// (`list`: every junction of the stage's folder with its first pass's s and its side roads)
// A junction's node, its passes on the ride and the rows of each road that leaves it (run, x, z, height), from the
// road graph the builders read (env.graph.chainFrom).
import { loadStage, r2 } from './load.mjs';

const [stage, id, reach = '40'] = process.argv.slice(2);
if (!stage || !id) { console.error('usage: node tools/world/debug/rows.mjs <stage> <junction id> [reach m]'); process.exit(2); }
const { env } = await loadStage(stage);
if (id === 'list') {
    for (const j of env.graph.junctions) if (j.passes[0]) console.log(`${j.id}\t${r2(j.passes[0].sIn)}\t${j.incident.filter(i => !env.data.edges[i.edgeId].onRide).map(i => i.edgeId).join(',')}`);
    process.exit(0);
}
const junction = env.graph.junctions.find(j => j.id === id || String(j.id) === id);
if (!junction) { console.error(`no junction ${id}; there are ${env.graph.junctions.length}`); process.exit(1); }
console.log(JSON.stringify({ id: junction.id, node: junction.node, passes: junction.passes }));
for (const { edgeId } of junction.incident) {
    const edge = env.data.edges[edgeId];
    const { rows } = env.graph.chainFrom(edgeId, junction.node, Number(reach));
    console.log(`edge ${edgeId} onRide=${!!edge.onRide} width=${edge.width ?? edge.w ?? '?'} rows=${rows.length}`);
    for (const row of rows) console.log('  ' + JSON.stringify(Object.fromEntries(Object.entries(row).map(([k, v]) => [k, typeof v === 'number' ? r2(v) : v]))));
}
