// The tour's derived stages (js/world/tour.js): a leg that rides a stage a folder already holds, the other way or a
// part of it, is written into that folder as a stage of its own, with no data copied. Runs after an import, and is
// safe to run again: it gives the same bytes.
//   node tools/world/tour.mjs [--courses <file>]
//
// For each built leg with a `base` stage:
//   - the ride as the leg rides it (`dir` -1: the path from its other end), and its samples (stations.mjs);
//   - its ends: it starts at its start stop's turn-in and its timed line is STOP.leadM before its end stop's turn-in,
//     as an imported stage's (stops.mjs). Riding against the ride, a stop beside it is turned into at the far end of
//     the run of the ride beside its area (`s1`, which this writes on a stop that has none);
//   - its stations by the importer's rule (placeStations) and its time floors (stageFloors), on those samples.
// Every distance is written in the ride's own run (the forward frame), as every other stage's: `from` < `to`, and the
// game turns them round for a stage with `dir` -1 (WorldData.useStage). The folder's SHA256SUMS and dataHash are made
// again, and its legs' board rows go into functions/world-courses.json beside every other row.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { decodeWorld } from './encode.mjs';
import { rideSamples, placeStations } from './stations.mjs';
import { stageFloors } from './floors.mjs';
import { STOP, areaDistance } from './stops.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

// The tour table, read from the page's own script (a classic script: no module, no DOM)
export function readTour(root = ROOT) {
  const text = fs.readFileSync(path.join(root, 'js', 'world', 'tour.js'), 'utf8');
  return new Function(`${text}\nreturn WorldTour;`)();
}

const r1 = v => Math.round(v * 10) / 10;
const r2 = v => Math.round(v * 100) / 100;
const sha = buf => crypto.createHash('sha256').update(buf).digest('hex');

// The far end of the run of ride samples beside a stop's area that its turn-in starts (the importer's `direct` rule)
export function turnSpan(samples, stop) {
  if (stop.access !== 'direct') return stop.s;
  let i = samples.s.findIndex(s => s >= stop.s - 1e-6);
  if (i < 0) return stop.s;
  let last = i;
  for (; i < samples.s.length; i++) {
    if (areaDistance(stop.ring, samples.x[i], samples.z[i]) - samples.width[i] / 2 > STOP.directM) break;
    last = i;
  }
  return r1(samples.s[last]);
}

// One leg derived from its folder's ride: { stage, stations (forward s), row }
export function deriveLeg(world, leg, { spacingM = world.manifest.stationSpacingM, versions = {} } = {}) {
  const { manifest, ride, edges } = world;
  const L = ride.length;
  const dir = leg.dir === -1 ? -1 : 1;
  const path = dir === 1 ? ride.path : ride.path.slice().reverse().map(use => ({ ...use, dir: -use.dir }));
  const samples = rideSamples(edges, path);
  const at = s => (dir === 1 ? s : L - s);
  const stop = id => {
    const found = manifest.stops.find(st => st.id === id);
    if (!found) throw new Error(`leg ${leg.n} (${leg.id}): no stop ${id} in ${leg.folder}`);
    return found;
  };
  const turnIn = st => (dir === 1 ? st.s : at(Number.isFinite(st.s1) ? st.s1 : st.s));
  const from = r2(turnIn(stop(leg.start)));
  const to = r2(turnIn(stop(leg.end)) - STOP.leadM);
  if (!(to - from > 500)) throw new Error(`leg ${leg.n} (${leg.id}): ${Math.round(to - from)} m between its stops`);
  const junctionS = world.junctions.flatMap(j => j.passes.map(p => at(p.sIn)));
  const mapped = manifest.places.filter(p => p.source === 'map').map(p => ({ ...p, s: dir === 1 ? p.s : at(p.s + p.length) }));
  const placed = placeStations(samples, [{ id: leg.id, from, to }], junctionS, { spacingM, places: mapped });
  const picks = placed.perStage[0].s;
  const floors = stageFloors(samples, picks);
  const forward = picks.map(s => r2(at(s)));
  const [f0, f1] = dir === 1 ? [from, to] : [r2(at(to)), r2(at(from))];
  const stage = { id: leg.id, name: leg.name, from: f0, to: f1, length: r2(to - from), gates: picks.length - 2, dir, base: leg.base, startStop: leg.start, endStop: leg.end, ...floors };
  const row = { kind: 'stage', gates: stage.gates, metres: Math.round(to - from), floorMs: floors.floorMs, gateFloorsMs: floors.gateFloorsMs };
  return { stage, stations: forward, row, id: `world-${leg.id}-v${versions[leg.id] ?? 1}`, dropped: placed.dropped };
}

// Writes the derived legs of one folder into its manifest and ride.json, and seals the folder again
export function writeFolder(dir, legs, { versions = {}, log = () => {} } = {}) {
  const world = decodeWorld(dir);
  const { manifest, ride } = world;
  const forward = rideSamples(world.edges, ride.path);
  // (a stop beside the ride: where its run ends, for a stage that rides past it the other way)
  for (const st of manifest.stops) if (st.access === 'direct' && !Number.isFinite(st.s1)) st.s1 = turnSpan(forward, st);
  const ids = new Set(legs.map(l => l.id));
  const derived = new Set(manifest.stages.filter(s => s.base).map(s => s.id));
  // A derived stage of an earlier run is made again; the importer's stages and their stations stay as they are
  const keepStations = ride.stations.filter(st => !derived.has(st.stage) && !ids.has(st.stage));
  const remap = new Map(keepStations.map((st, i) => [st.id, i]));
  const stations = keepStations.map((st, i) => ({ ...st, id: i }));
  const stages = manifest.stages.filter(s => !derived.has(s.id) && !ids.has(s.id)).map(s => ({ ...s, stations: s.stations.map(i => remap.get(i)) }));
  const rows = {};
  for (const leg of legs) {
    const made = deriveLeg(world, leg, { versions });
    for (const d of made.dropped) log(`leg ${leg.n}: no full roadworks site within reach of s ${Math.round(d.target)} (${d.reason}); no checkpoint there`);
    const list = made.stations.map((s, k) => {
      stations.push({ id: stations.length, s, stage: leg.id, kind: k === 0 ? 'start' : k === made.stations.length - 1 ? 'end' : 'gate' });
      return stations.length - 1;
    });
    const { floorMs, gateFloorsMs, ...stage } = made.stage;
    stages.push({ ...stage, stations: list });
    rows[made.id] = made.row;
    log(`leg ${leg.n} ${leg.id}: ${(made.stage.length / 1000).toFixed(2)} km, ${made.stage.gates} checkpoints, floor ${(floorMs / 1000).toFixed(1)} s`);
  }
  manifest.stages = stages;
  manifest.stationCount = stations.length;
  const json = v => Buffer.from(`${JSON.stringify(v)}\n`);
  fs.writeFileSync(path.join(dir, 'ride.json'), json({ ...ride, stations }));
  seal(dir, manifest, json);
  return rows;
}

// The folder's dataHash (every data file but the manifest) and SHA256SUMS (every file), as encode.mjs makes them
function seal(dir, manifest, json) {
  const files = [];
  const walk = rel => {
    for (const name of fs.readdirSync(path.join(dir, rel))) {
      const p = rel ? `${rel}/${name}` : name;
      if (fs.statSync(path.join(dir, p)).isDirectory()) walk(p); else if (p !== 'SHA256SUMS' && p !== 'manifest.json') files.push(p);
    }
  };
  walk('');
  const line = p => `${sha(fs.readFileSync(path.join(dir, p)))}  ${p}\n`;
  manifest.dataHash = sha(Buffer.from(files.sort().map(line).join('')));
  fs.writeFileSync(path.join(dir, 'manifest.json'), json(manifest));
  fs.writeFileSync(path.join(dir, 'SHA256SUMS'), [...files, 'manifest.json'].sort().map(line).join(''));
}

function readBoardVersions() {
  const file = path.join(HERE, 'boards.json');
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(Object.entries(JSON.parse(fs.readFileSync(file, 'utf8'))).map(([id, v]) => [id, v.version]));
}

export function main(argv = []) {
  const at = argv.indexOf('--courses');
  const courses = path.resolve(at >= 0 ? argv[at + 1] : path.join(ROOT, 'functions', 'world-courses.json'));
  const tour = readTour();
  const versions = readBoardVersions();
  const byFolder = new Map();
  for (const leg of tour.built()) if (leg.base) (byFolder.get(leg.folder) || byFolder.set(leg.folder, []).get(leg.folder)).push(leg);
  const log = m => console.error(m);
  const rows = {};
  for (const [folder, legs] of byFolder) Object.assign(rows, writeFolder(path.join(ROOT, folder), legs, { versions, log }));
  // The derived legs' rows replace their own (any version) and keep every other row
  const own = new Set([...byFolder.values()].flat().map(l => `world-${l.id}-`));
  const kept = fs.existsSync(courses) ? Object.entries(JSON.parse(fs.readFileSync(courses, 'utf8'))).filter(([id]) => ![...own].some(prefix => id.startsWith(prefix) && /^v\d+$/.test(id.slice(prefix.length)))) : [];
  const all = Object.fromEntries([...kept, ...Object.entries(rows)].sort((a, b) => (a[0] < b[0] ? -1 : 1)));
  fs.writeFileSync(courses, `${JSON.stringify(all, null, 2)}\n`);
  log(`wrote ${Object.keys(rows).length} board rows to ${courses}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exit(2); }
}
