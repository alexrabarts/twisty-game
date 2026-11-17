// The world data format: encode a built world into compact files, and decode them back (verify.mjs and the tests
// read the files through decodeWorld, so the format has one definition). Little-endian throughout.
//
//   manifest.json            format, sources, origin, road classes, stages, stations, tile and chunk indexes, structures
//   ride.json                the ride as a path of edge uses, stages and stations
//   graph/nodes.bin          16 B per node: x z y Int32 mm, degree Uint8, flags Uint8 (1 junction, 2 on ride, 4 used twice), 2 B spare
//   graph/edges.bin          24 B per edge: id from to length(mm) firstSample Uint32, sampleCount Uint16, class Uint8, flags Uint8 (1 on ride)
//   graph/e-<k>.bin          edge samples, 16 B each: x z y Int32 mm, heading Int16 (1e-4 rad), width Uint8 (0.1 m), flags Uint8
//   graph/junctions.json     ride junctions with their passes and barrier poses
//   height/h-<tx>_<tz>.bin   512 m tile at 8 m: Float32 base, 65 x 65 Int16 (0.1 m over base), 65 x 65 Uint8 zone
//   cover/c-<tx>_<tz>.bin    32 x 32 Uint8 land cover classes at 16 m
//   far.bin                  header (x0 mm, z0 mm Int32, nx, nz, cell Uint16, 2 B spare) then Int16 metres, -32768 = no data
//   far/l<k>.bin             far land level k (tools/world/farland.mjs): far.bin's header, Int16 metres, then 4 Uint8 per
//                            vertex (forest, rock, ice, known shares, 0 to 255)
//   far/cover0.bin           the same 4 shares for each far.bin vertex
//   far/sink0.bin            Uint8 metres each far.bin vertex is drawn under its height (farland.mjs horizonSinks)
//   buildings.bin            16 B each: x z Int32 mm, w d Uint16 (0.1 m), heading Int16 (1e-4 rad), h Uint8 (0.5 m), kind Uint8
//   SHA256SUMS               sha256 of every other file, `shasum -a 256 -c` format
//
// An edge's samples are one run of the global sample sequence (edges in id order); chunks cut that sequence into runs
// of at most MAX_CHUNK_SAMPLES samples whose bounding box is at most MAX_CHUNK_EXTENT_M across, so a chunk is a place
// and not a stretch of the file. Samples of one edge may span several chunks.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { TILE_N } from './bench.mjs';

export const FORMAT_VERSION = 1;
export const MAX_CHUNK_SAMPLES = 256;
export const MAX_CHUNK_EXTENT_M = 640;
export const NODE_BYTES = 16;
export const EDGE_BYTES = 24;
export const SAMPLE_BYTES = 16;
export const BUILDING_BYTES = 16;
export const NODE_FLAG = Object.freeze({ junction: 1, onRide: 2, usedTwice: 4 });

const mm = v => Math.round(v * 1000);
const r2 = v => Math.round(v * 100) / 100;
const tileName = v => (v < 0 ? `m${-v}` : `${v}`);
export const heightFile = (tx, tz) => `height/h-${tileName(tx)}_${tileName(tz)}.bin`;
export const coverFile = (tx, tz) => `cover/c-${tileName(tx)}_${tileName(tz)}.bin`;
export const chunkFile = k => `graph/e-${k}.bin`;

export function planChunks(edges) {
  const chunks = [];
  let open = null, index = 0;
  for (const e of edges) {
    for (let i = 0; i < e.x.length; i++, index++) {
      if (open) {
        const x0 = Math.min(open.bbox[0], e.x[i]), z0 = Math.min(open.bbox[1], e.z[i]);
        const x1 = Math.max(open.bbox[2], e.x[i]), z1 = Math.max(open.bbox[3], e.z[i]);
        if (open.count >= MAX_CHUNK_SAMPLES || x1 - x0 > MAX_CHUNK_EXTENT_M || z1 - z0 > MAX_CHUNK_EXTENT_M) { chunks.push(open); open = null; }
        else open.bbox = [x0, z0, x1, z1];
      }
      if (!open) open = { first: index, count: 0, bbox: [e.x[i], e.z[i], e.x[i], e.z[i]] };
      open.count++;
    }
  }
  if (open) chunks.push(open);
  return chunks.map((c, k) => ({ file: chunkFile(k), first: c.first, count: c.count, bbox: c.bbox.map(r2) }));
}

function encodeSamples(edges, chunks) {
  const all = [];
  for (const e of edges) for (let i = 0; i < e.x.length; i++) all.push([e, i]);
  return chunks.map(c => {
    const buf = Buffer.alloc(c.count * SAMPLE_BYTES);
    for (let k = 0; k < c.count; k++) {
      const [e, i] = all[c.first + k];
      const o = k * SAMPLE_BYTES;
      buf.writeInt32LE(mm(e.x[i]), o);
      buf.writeInt32LE(mm(e.z[i]), o + 4);
      buf.writeInt32LE(mm(e.y[i]), o + 8);
      buf.writeInt16LE(Math.round(e.heading[i] * 1e4), o + 12);
      buf.writeUInt8(Math.min(255, Math.round(e.width[i] * 10)), o + 14);
      buf.writeUInt8(e.flags[i], o + 15);
    }
    return buf;
  });
}

function encodeNodes(nodes) {
  const buf = Buffer.alloc(nodes.length * NODE_BYTES);
  nodes.forEach((n, i) => {
    const o = i * NODE_BYTES;
    buf.writeInt32LE(mm(n.x), o);
    buf.writeInt32LE(mm(n.z), o + 4);
    buf.writeInt32LE(mm(n.y), o + 8);
    buf.writeUInt8(n.degree, o + 12);
    buf.writeUInt8(n.flags, o + 13);
  });
  return buf;
}

function encodeEdges(edges, classes) {
  const buf = Buffer.alloc(edges.length * EDGE_BYTES);
  let first = 0;
  edges.forEach((e, i) => {
    const o = i * EDGE_BYTES;
    buf.writeUInt32LE(e.id, o);
    buf.writeUInt32LE(e.a, o + 4);
    buf.writeUInt32LE(e.b, o + 8);
    buf.writeUInt32LE(mm(e.length), o + 12);
    buf.writeUInt32LE(first, o + 16);
    buf.writeUInt16LE(e.x.length, o + 20);
    buf.writeUInt8(classes.indexOf(e.cls), o + 22);
    buf.writeUInt8(e.onRide ? 1 : 0, o + 23);
    first += e.x.length;
  });
  return buf;
}

function encodeHeightTile(t) {
  const base = Math.fround(Math.min(...t.heights));
  const buf = Buffer.alloc(4 + TILE_N * TILE_N * 3);
  buf.writeFloatLE(base, 0);
  for (let i = 0; i < t.heights.length; i++) buf.writeInt16LE(Math.max(0, Math.min(32767, Math.round((t.heights[i] - base) * 10))), 4 + i * 2);
  Buffer.from(t.zones).copy(buf, 4 + t.heights.length * 2);
  return buf;
}

function encodeFarLevel(level) {
  const n = level.nx * level.nz;
  const buf = Buffer.alloc(16 + n * 2 + level.shares.length);
  buf.writeInt32LE(mm(level.x0), 0);
  buf.writeInt32LE(mm(level.z0), 4);
  buf.writeUInt16LE(level.nx, 8);
  buf.writeUInt16LE(level.nz, 10);
  buf.writeUInt16LE(level.cell, 12);
  for (let i = 0; i < n; i++) buf.writeInt16LE(level.heights[i], 16 + i * 2);
  Buffer.from(level.shares).copy(buf, 16 + n * 2);
  return buf;
}

function encodeFar(far) {
  const buf = Buffer.alloc(16 + far.nx * far.nz * 2);
  buf.writeInt32LE(mm(far.x0), 0);
  buf.writeInt32LE(mm(far.z0), 4);
  buf.writeUInt16LE(far.nx, 8);
  buf.writeUInt16LE(far.nz, 10);
  buf.writeUInt16LE(far.cell, 12);
  for (let i = 0; i < far.data.length; i++) buf.writeInt16LE(far.data[i], 16 + i * 2);
  return buf;
}

function encodeBuildings(list) {
  const buf = Buffer.alloc(list.length * BUILDING_BYTES);
  list.forEach((b, i) => {
    const o = i * BUILDING_BYTES;
    buf.writeInt32LE(mm(b.x), o);
    buf.writeInt32LE(mm(b.z), o + 4);
    buf.writeUInt16LE(Math.min(65535, Math.round(b.w * 10)), o + 8);
    buf.writeUInt16LE(Math.min(65535, Math.round(b.d * 10)), o + 10);
    buf.writeInt16LE(Math.round(Math.atan2(Math.sin(b.heading), Math.cos(b.heading)) * 1e4), o + 12);
    buf.writeUInt8(Math.min(255, Math.round(b.h * 2)), o + 14);
    buf.writeUInt8(b.kind, o + 15);
  });
  return buf;
}

const json = v => Buffer.from(`${JSON.stringify(v)}\n`);
const sha = buf => crypto.createHash('sha256').update(buf).digest('hex');

// world: see import.mjs buildWorld. Returns the files as Map path -> Buffer (nothing is written).
export function encodeFiles(world) {
  const files = new Map();
  const classes = [...new Set(world.edges.map(e => e.cls))].sort();
  const chunks = planChunks(world.edges);
  encodeSamples(world.edges, chunks).forEach((buf, k) => files.set(chunks[k].file, buf));
  files.set('graph/nodes.bin', encodeNodes(world.nodes));
  files.set('graph/edges.bin', encodeEdges(world.edges, classes));
  files.set('graph/junctions.json', json(world.junctions));

  let sStart = 0;
  const path_ = world.ride.map(use => {
    const row = { edgeId: use.edgeId, dir: use.dir, sStart: r2(sStart) };
    sStart += world.edges[use.edgeId].length;
    return row;
  });
  files.set('ride.json', json({ path: path_, length: r2(sStart), stages: world.stages.map(s => ({ id: s.id, name: s.name, from: r2(s.from), to: r2(s.to) })), stations: world.stations.map((s, i) => ({ id: i, s: r2(s.s), stage: s.stage, kind: s.kind })) }));

  const tiles = [...world.tiles].map(([key, t]) => [key.split(',').map(Number), t]).sort((a, b) => a[0][0] - b[0][0] || a[0][1] - b[0][1]);
  for (const [[tx, tz], t] of tiles) files.set(heightFile(tx, tz), encodeHeightTile(t));
  const coverTiles = [...world.cover].map(([key, g]) => [key.split(',').map(Number), g]).sort((a, b) => a[0][0] - b[0][0] || a[0][1] - b[0][1]);
  for (const [[tx, tz], g] of coverTiles) files.set(coverFile(tx, tz), Buffer.from(g));
  files.set('far.bin', encodeFar(world.far));
  if (world.farLand) {
    world.farLand.levels.forEach((level, k) => files.set(`far/l${k + 1}.bin`, encodeFarLevel(level)));
    files.set('far/cover0.bin', Buffer.from(world.farLand.cover0));
    if (world.farLand.sink0) files.set('far/sink0.bin', Buffer.from(world.farLand.sink0));
  }
  files.set('buildings.bin', encodeBuildings(world.buildings));

  const dataHash = sha(Buffer.from([...files].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([p, b]) => `${sha(b)}  ${p}\n`).join('')));
  const manifest = {
    format: FORMAT_VERSION,
    credit: world.credit,
    ...(world.notice ? { notice: world.notice } : {}),
    sources: world.sources,
    origin: world.origin,
    spacingM: world.spacingM,
    stationSpacingM: world.stationSpacingM,
    roadClasses: classes,
    keptRoadClasses: world.keptRoadClasses,
    stages: world.stages.map(s => ({ id: s.id, name: s.name, from: r2(s.from), to: r2(s.to), length: r2(s.to - s.from), gates: s.gates, stations: s.stationIds })),
    stationCount: world.stations.length,
    tiles: { height: tiles.map(([k]) => k), cover: coverTiles.map(([k]) => k), sizeM: 512, cellM: 8 },
    chunks,
    junctions: world.junctions.map(j => ({ id: j.id, node: j.node, name: j.name, passes: j.passes.map(p => r2(p.sIn)) })),
    structures: world.structures,
    landmarks: world.landmarks,
    ...(world.farLand ? { farLevels: world.farLand.levels.map((l, k) => ({ file: `far/l${k + 1}.bin`, cell: l.cell, nx: l.nx, nz: l.nz })) } : {}),
    counts: { nodes: world.nodes.length, edges: world.edges.length, samples: chunks.reduce((p, c) => p + c.count, 0), buildings: world.buildings.length },
    dataHash
  };
  files.set('manifest.json', json(manifest));
  return files;
}

export function sumsOf(files) {
  return [...files].filter(([p]) => p !== 'SHA256SUMS').sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([p, b]) => `${sha(b)}  ${p}\n`).join('');
}

// Writes the files under outDir (which is emptied of the world's own subfolders first) and SHA256SUMS last.
export function writeWorld(world, outDir) {
  const files = encodeFiles(world);
  for (const sub of ['graph', 'height', 'cover', 'far']) fs.rmSync(path.join(outDir, sub), { recursive: true, force: true });
  for (const f of ['manifest.json', 'ride.json', 'far.bin', 'buildings.bin', 'SHA256SUMS']) fs.rmSync(path.join(outDir, f), { force: true });
  for (const [p, buf] of files) {
    fs.mkdirSync(path.dirname(path.join(outDir, p)), { recursive: true });
    fs.writeFileSync(path.join(outDir, p), buf);
  }
  fs.writeFileSync(path.join(outDir, 'SHA256SUMS'), sumsOf(files));
  return files;
}

// The stage and tour board rows for functions/world-courses.json. Nothing in functions/ reads that file yet: it is
// wired in with the world leaderboards (R6), and until then the server has no row for a world board.
export function courseRows(world, versions = {}) {
  const rows = {};
  const ver = id => versions[id] ?? 1;
  for (const s of world.stages) {
    rows[`world-${s.id}-v${ver(s.id)}`] = { kind: 'stage', gates: s.gates, metres: Math.round(s.to - s.from), floorMs: s.floorMs, gateFloorsMs: s.gateFloorsMs };
  }
  if (world.stages.length > 1) {
    const gateFloorsMs = world.stages.map(s => s.floorMs);
    rows[`world-tour-v${ver('tour')}`] = { kind: 'tour', gates: world.stages.length - 1, metres: Math.round(world.stages[world.stages.length - 1].to - world.stages[0].from), floorMs: gateFloorsMs.reduce((p, q) => p + q, 0), gateFloorsMs };
  }
  return Object.fromEntries(Object.entries(rows).sort((a, b) => (a[0] < b[0] ? -1 : 1)));
}

export function writeCourses(world, file, versions) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(courseRows(world, versions), null, 2)}\n`);
}

// ---- decode ----

function readSamples(dir, manifest) {
  const buffers = manifest.chunks.map(c => fs.readFileSync(path.join(dir, c.file)));
  const total = manifest.chunks.reduce((p, c) => p + c.count, 0);
  const x = new Float64Array(total), z = new Float64Array(total), y = new Float64Array(total), heading = new Float64Array(total), width = new Float64Array(total), flags = new Uint8Array(total);
  manifest.chunks.forEach((c, k) => {
    for (let j = 0; j < c.count; j++) {
      const o = j * SAMPLE_BYTES, g = c.first + j;
      x[g] = buffers[k].readInt32LE(o) / 1000;
      z[g] = buffers[k].readInt32LE(o + 4) / 1000;
      y[g] = buffers[k].readInt32LE(o + 8) / 1000;
      heading[g] = buffers[k].readInt16LE(o + 12) / 1e4;
      width[g] = buffers[k].readUInt8(o + 14) / 10;
      flags[g] = buffers[k].readUInt8(o + 15);
    }
  });
  return { x, z, y, heading, width, flags };
}

export function decodeWorld(dir) {
  const read = f => fs.readFileSync(path.join(dir, f));
  const manifest = JSON.parse(read('manifest.json'));
  const samples = readSamples(dir, manifest);
  const nb = read('graph/nodes.bin');
  const nodes = [];
  for (let i = 0; i < nb.length / NODE_BYTES; i++) {
    const o = i * NODE_BYTES;
    nodes.push({ id: i, x: nb.readInt32LE(o) / 1000, z: nb.readInt32LE(o + 4) / 1000, y: nb.readInt32LE(o + 8) / 1000, degree: nb.readUInt8(o + 12), flags: nb.readUInt8(o + 13) });
  }
  const eb = read('graph/edges.bin');
  const edges = [];
  for (let i = 0; i < eb.length / EDGE_BYTES; i++) {
    const o = i * EDGE_BYTES;
    const first = eb.readUInt32LE(o + 16), count = eb.readUInt16LE(o + 20);
    edges.push({
      id: eb.readUInt32LE(o), a: eb.readUInt32LE(o + 4), b: eb.readUInt32LE(o + 8), length: eb.readUInt32LE(o + 12) / 1000,
      cls: manifest.roadClasses[eb.readUInt8(o + 22)], onRide: (eb.readUInt8(o + 23) & 1) === 1,
      x: samples.x.subarray(first, first + count), z: samples.z.subarray(first, first + count), y: samples.y.subarray(first, first + count),
      heading: samples.heading.subarray(first, first + count), width: samples.width.subarray(first, first + count), flags: samples.flags.subarray(first, first + count)
    });
  }
  const tiles = new Map();
  for (const [tx, tz] of manifest.tiles.height) {
    const b = read(heightFile(tx, tz));
    const n = TILE_N * TILE_N, base = b.readFloatLE(0);
    const heights = new Float32Array(n), zones = new Uint8Array(n);
    for (let i = 0; i < n; i++) { heights[i] = base + b.readInt16LE(4 + i * 2) / 10; zones[i] = b[4 + n * 2 + i]; }
    tiles.set(`${tx},${tz}`, { heights, zones });
  }
  const cover = new Map();
  for (const [tx, tz] of manifest.tiles.cover) cover.set(`${tx},${tz}`, new Uint8Array(read(coverFile(tx, tz))));
  const fb = read('far.bin');
  const far = { x0: fb.readInt32LE(0) / 1000, z0: fb.readInt32LE(4) / 1000, nx: fb.readUInt16LE(8), nz: fb.readUInt16LE(10), cell: fb.readUInt16LE(12), data: new Int16Array(fb.length / 2 - 8) };
  for (let i = 0; i < far.data.length; i++) far.data[i] = fb.readInt16LE(16 + i * 2);
  const farLevels = (manifest.farLevels || []).map(l => {
    const b = read(l.file);
    const n = b.readUInt16LE(8) * b.readUInt16LE(10);
    const heights = new Int16Array(n);
    for (let i = 0; i < n; i++) heights[i] = b.readInt16LE(16 + i * 2);
    return { x0: b.readInt32LE(0) / 1000, z0: b.readInt32LE(4) / 1000, nx: b.readUInt16LE(8), nz: b.readUInt16LE(10), cell: b.readUInt16LE(12), heights, shares: new Uint8Array(b.subarray(16 + n * 2)) };
  });
  const bb = read('buildings.bin');
  const buildings = [];
  for (let i = 0; i < bb.length / BUILDING_BYTES; i++) {
    const o = i * BUILDING_BYTES;
    buildings.push({ x: bb.readInt32LE(o) / 1000, z: bb.readInt32LE(o + 4) / 1000, w: bb.readUInt16LE(o + 8) / 10, d: bb.readUInt16LE(o + 10) / 10, heading: bb.readInt16LE(o + 12) / 1e4, h: bb[o + 14] / 2, kind: bb[o + 15] });
  }
  return { manifest, nodes, edges, ride: JSON.parse(read('ride.json')), junctions: JSON.parse(read('graph/junctions.json')), tiles, cover, far, farLevels, buildings };
}
