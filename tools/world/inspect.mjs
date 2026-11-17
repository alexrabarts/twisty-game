// W0 data gate. Reads swissTLM3D from the cache, snaps route.json to the road graph and prints one JSON report.
//   node tools/world/inspect.mjs [--gpkg <file>] [--route <route.json>] [--margin <m>] [--stages <ids|all>]
// --stages scopes the report to those stages (default and 'all': the whole route), so its corridorEdges are the
// ones tools/world/verify.mjs graph --stages <ids> compares the built graph with.
// Exit code 4 when a consecutive waypoint pair is not connected (gate outcome 4: stop and change the plan).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GeoPackage } from './gpkg.mjs';
import { resolveCacheDir, findGpkg } from './cache.mjs';
import { scopedRoute } from './stages.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// swissTLM3D 2026-02 GeoPackage: the road layer is tlm_strassen_strasse (the plan's TLM_STRASSE), lower-case columns.
const TABLE = 'tlm_strassen_strasse';
const CORRIDOR_M = 1000;
const NODE_TOL_M = 0.5;
const THROUGH_ROAD_BONUS_M = 150;

const colMatch = (cols, re) => cols.find(c => re.test(c)) ?? null;
const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
const dist = (a, b) => Math.sqrt(dist2(a, b));
const quantile = (sorted, q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : null);
const round = (v, d = 2) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

// Roads that no motor vehicle uses stay out of the graph (gate outcome 5).
const NON_MOTOR_CLASS = /\bweg|wegfragment|klettersteig|faehre|autozug/i;
export const isMotorRoad = e => !NON_MOTOR_CLASS.test(e.cls) && !/treppe/i.test(e.structure ?? '') && e.drivable !== 'Falsch';
// The motorway is in the data but is not the ride: it costs heavily so the shortest path follows the passes.
const MOTORWAY = /autobahn|autostrasse|ausfahrt|einfahrt|raststaette/i;

const TRAFFIC_FACTOR = { Durchgangsstrasse: 1, Verbindungsstrasse: 1.2 };
export function roadPenalty(e) {
  if (MOTORWAY.test(e.cls)) return 25;
  const m = /^(\d+)m/.exec(e.cls);
  const base = m ? (Number(m[1]) >= 6 ? 1 : Number(m[1]) >= 4 ? 1.3 : 2) : 3;
  return base * (TRAFFIC_FACTOR[e.traffic] ?? 1.5);
}

function lineParts(geom) {
  if (geom.type === 'LineString') return [geom.coordinates];
  if (geom.type === 'MultiLineString') return geom.coordinates;
  return [];
}

class Heap {
  constructor() { this.a = []; }
  push(k, v) {
    const a = this.a; a.push([k, v]);
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  }
  pop() {
    const a = this.a; const top = a[0]; const last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
  get size() { return this.a.length; }
}

function spatialIndex(cell) {
  const map = new Map();
  const key = (x, y) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
  return {
    add(x, y, v) { const k = key(x, y); (map.get(k) ?? map.set(k, []).get(k)).push(v); },
    near(x, y, r) {
      const out = [];
      const x0 = Math.floor((x - r) / cell), x1 = Math.floor((x + r) / cell);
      const y0 = Math.floor((y - r) / cell), y1 = Math.floor((y + r) / cell);
      for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) { const c = map.get(`${i},${j}`); if (c) out.push(...c); }
      return out;
    }
  };
}

export function loadEdges(gpkg, route, marginM) {
  const cols = gpkg.columns(TABLE);
  const classField = colMatch(cols, /^objektart$/i);
  const structureField = colMatch(cols, /kunstbaute|bauwerk|tunnel|bruecke/i);
  const nameField = colMatch(cols, /^strassenname$/i);
  const drivableField = colMatch(cols, /^befahrbarkeit$/i);
  const trafficField = colMatch(cols, /^verkehrsbedeutung$/i);
  const surfaceField = colMatch(cols, /^belagsart$/i);
  const xs = route.waypoints.map(w => w.e), ys = route.waypoints.map(w => w.n);
  const bbox = [Math.min(...xs) - marginM, Math.min(...ys) - marginM, Math.max(...xs) + marginM, Math.max(...ys) + marginM];
  const rows = gpkg.query(TABLE, bbox);
  const edges = [];
  for (const r of rows) {
    for (const pts of lineParts(r.geom)) {
      if (pts.length < 2) continue;
      edges.push({
        id: edges.length,
        fid: r[Object.keys(r).find(k => /^(fid|objectid|id)$/i.test(k))] ?? null,
        cls: String(classField ? r[classField] : 'unknown'),
        structure: structureField ? r[structureField] ?? null : null,
        name: nameField ? r[nameField] ?? null : null,
        drivable: drivableField ? r[drivableField] : null,
        traffic: trafficField ? r[trafficField] : null,
        surface: surfaceField ? r[surfaceField] : null,
        pts,
        hasZ: r.geom.hasZ
      });
    }
  }
  return { edges, cols, classField, structureField, nameField, bbox, rowCount: rows.length };
}

// Splits every edge at its snap vertices, welds endpoints within NODE_TOL_M into nodes, builds adjacency.
export function buildGraph(edges, cutsByEdge) {
  const nodes = [];
  const index = spatialIndex(4);
  const nodeAt = (p) => {
    for (const id of index.near(p[0], p[1], NODE_TOL_M)) if (dist(nodes[id].xy, p) <= NODE_TOL_M) return id;
    const id = nodes.length;
    nodes.push({ id, xy: [p[0], p[1]], z: p[2] ?? null, adj: [] });
    index.add(p[0], p[1], id);
    return id;
  };
  const pieces = [];
  for (const e of edges) {
    const cuts = [0, ...(cutsByEdge.get(e.id) ?? []), e.pts.length - 1];
    const uniq = [...new Set(cuts)].sort((a, b) => a - b);
    for (let i = 0; i + 1 < uniq.length; i++) {
      const pts = e.pts.slice(uniq[i], uniq[i + 1] + 1);
      let len = 0;
      for (let k = 1; k < pts.length; k++) len += dist(pts[k - 1], pts[k]);
      const a = nodeAt(pts[0]), b = nodeAt(pts[pts.length - 1]);
      const piece = { id: pieces.length, edge: e.id, a, b, pts, len, cls: e.cls, structure: e.structure, name: e.name, penalty: roadPenalty(e) };
      pieces.push(piece);
      nodes[a].adj.push(piece.id);
      nodes[b].adj.push(piece.id);
    }
  }
  return { nodes, pieces, nodeAt };
}

// Hairpins: the path is resampled every 5 m and the heading change across a 60 m window is measured, so a corner
// the data draws with one coarse vertex still counts. An apex is a local maximum above 120 degrees.
function hairpinStats(pts) {
  const STEP = 5, HALF = 6;
  const line = [];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = dist(pts[i - 1], pts[i]);
    for (let t = STEP - carry; t <= seg; t += STEP) line.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t / seg, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t / seg]);
    carry = (carry + seg) % STEP;
  }
  const turn = [];
  for (let i = HALF; i + HALF < line.length; i++) {
    const a1 = Math.atan2(line[i][1] - line[i - HALF][1], line[i][0] - line[i - HALF][0]);
    const a2 = Math.atan2(line[i + HALF][1] - line[i][1], line[i + HALF][0] - line[i][0]);
    let d = Math.abs(a2 - a1);
    if (d > Math.PI) d = 2 * Math.PI - d;
    turn.push(d);
  }
  const apexes = [];
  for (let i = 1; i + 1 < turn.length; i++) {
    if (turn[i] > Math.PI * 2 / 3 && turn[i] >= turn[i - 1] && turn[i] > turn[i + 1] && (!apexes.length || i - apexes[apexes.length - 1] > 8)) apexes.push(i);
  }
  const vertexSpacing = [];
  for (const i of apexes) {
    const p = line[i + HALF];
    let best = Infinity, at = 1;
    for (let k = 1; k < pts.length; k++) { const d = dist(p, pts[k]); if (d < best) { best = d; at = k; } }
    vertexSpacing.push(dist(pts[at - 1], pts[at]), at + 1 < pts.length ? dist(pts[at], pts[at + 1]) : dist(pts[at - 1], pts[at]));
  }
  vertexSpacing.sort((x, y) => x - y);
  const cx = apexes.length ? apexes.reduce((m, i) => m + line[i + HALF][0], 0) / apexes.length : null;
  const cy = apexes.length ? apexes.reduce((m, i) => m + line[i + HALF][1], 0) / apexes.length : null;
  return {
    apexes: apexes.length,
    centreLv95: cx == null ? null : [Math.round(cx), Math.round(cy)],
    vertexSpacingAtApex: { median: round(quantile(vertexSpacing, 0.5)), p95: round(quantile(vertexSpacing, 0.95)), fractionOver4m: vertexSpacing.length ? round(vertexSpacing.filter(d => d > 4).length / vertexSpacing.length, 3) : null }
  };
}

export function shortestPath(graph, from, to) {
  const { nodes, pieces } = graph;
  const best = new Map([[from, 0]]), prev = new Map(), done = new Set();
  const heap = new Heap(); heap.push(0, from);
  while (heap.size) {
    const [d, n] = heap.pop();
    if (done.has(n)) continue;
    done.add(n);
    if (n === to) break;
    for (const pid of nodes[n].adj) {
      const p = pieces[pid];
      const m = p.a === n ? p.b : p.a;
      const nd = d + p.len * p.penalty;
      if (nd < (best.get(m) ?? Infinity)) { best.set(m, nd); prev.set(m, [n, pid]); heap.push(nd, m); }
    }
  }
  if (!done.has(to)) return null;
  const steps = [];
  for (let n = to; n !== from;) { const [pn, pid] = prev.get(n); steps.push({ piece: pid, from: pn, to: n }); n = pn; }
  return steps.reverse();
}

function components(graph) {
  const label = new Int32Array(graph.nodes.length).fill(-1);
  let c = 0;
  for (const start of graph.nodes) {
    if (label[start.id] >= 0) continue;
    const stack = [start.id]; label[start.id] = c;
    while (stack.length) {
      const n = stack.pop();
      for (const pid of graph.nodes[n].adj) {
        const p = graph.pieces[pid]; const m = p.a === n ? p.b : p.a;
        if (label[m] < 0) { label[m] = c; stack.push(m); }
      }
    }
    c++;
  }
  return label;
}

function componentGap(graph, label, na, nb) {
  const A = graph.nodes.filter(n => label[n.id] === label[na]);
  const B = graph.nodes.filter(n => label[n.id] === label[nb]);
  let best = Infinity;
  for (const a of A) for (const b of B) { const d = dist2(a.xy, b.xy); if (d < best) best = d; }
  return Math.sqrt(best);
}

function countBy(items, keyFn, lenFn) {
  const out = {};
  for (const it of items) {
    const k = String(keyFn(it));
    out[k] ??= { count: 0, lengthM: 0 };
    out[k].count += 1;
    out[k].lengthM += lenFn(it);
  }
  for (const v of Object.values(out)) v.lengthM = Math.round(v.lengthM);
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1].lengthM - a[1].lengthM));
}

// Snaps every waypoint (fields e, n: the planar coordinates of the edge points) to the nearest vertex of a kept
// edge. A through road wins over a nearby side street, so the ride never runs in and out of a spur.
export function snapWaypoints(kept, waypoints) {
  const vIndex = spatialIndex(200);
  for (const e of kept) e.pts.forEach((p, i) => vIndex.add(p[0], p[1], [e, i]));
  const cuts = new Map();
  const snaps = waypoints.map(w => {
    let best = null;
    for (let r = 100; r <= 3200 && !best; r *= 2) {
      for (const [e, i] of vIndex.near(w.e, w.n, r)) {
        const d = dist([w.e, w.n], e.pts[i]);
        const score = d + (e.traffic === 'Durchgangsstrasse' ? 0 : THROUGH_ROAD_BONUS_M);
        if (d <= r && (!best || score < best.score)) best = { d, score, e, i };
      }
    }
    if (!best) throw new Error(`no road within 3.2 km of waypoint ${w.id} ${w.name}`);
    if (!cuts.has(best.e.id)) cuts.set(best.e.id, []);
    cuts.get(best.e.id).push(best.i);
    return { waypoint: w, ...best };
  });
  return { snaps, cuts };
}

export function buildReport(gpkg, route, { marginM = 3000 } = {}) {
  const loaded = loadEdges(gpkg, route, marginM);
  const kept = loaded.edges.filter(isMotorRoad);
  const classCounts = countBy(loaded.edges, e => e.cls, e => e.pts.reduce((s, p, i) => (i ? s + dist(e.pts[i - 1], p) : 0), 0));

  const { snaps, cuts } = snapWaypoints(kept, route.waypoints);

  const graph = buildGraph(kept, cuts);
  return finishReport({ loaded, kept, classCounts, snaps, graph, route });
}

function finishReport({ loaded, kept, classCounts, snaps, graph, route }) {
  const snapNode = snaps.map(s => graph.nodeAt(s.e.pts[s.i]));
  const label = components(graph);
  const connectivity = [];
  const ride = []; // {piece, from, to}
  for (let k = 0; k + 1 < snaps.length; k++) {
    const a = snapNode[k], b = snapNode[k + 1];
    const from = snaps[k].waypoint, to = snaps[k + 1].waypoint;
    if (a === b) { connectivity.push({ from: from.name, to: to.name, gap: false, gapM: 0, lengthM: 0 }); continue; }
    const path = shortestPath(graph, a, b);
    if (!path) {
      connectivity.push({ from: from.name, to: to.name, gap: true, gapM: round(componentGap(graph, label, a, b), 1), lengthM: null });
      continue;
    }
    ride.push(...path);
    connectivity.push({ from: from.name, to: to.name, gap: false, gapM: 0, lengthM: Math.round(path.reduce((s, p) => s + graph.pieces[p.piece].len, 0)) });
  }

  // Corridor test: a 100 m grid stamped with every cell whose centre is within 1 km of the ride polyline.
  const CELL = 100;
  const stamped = new Set();
  const stamp = (x, y) => {
    const r = Math.ceil(CORRIDOR_M / CELL);
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
      const mx = (cx + i + 0.5) * CELL, my = (cy + j + 0.5) * CELL;
      if ((mx - x) ** 2 + (my - y) ** 2 <= CORRIDOR_M ** 2) stamped.add(`${cx + i},${cy + j}`);
    }
  };
  for (const st of ride) {
    const pts = graph.pieces[st.piece].pts;
    stamp(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      const n = Math.max(1, Math.ceil(dist(pts[i - 1], pts[i]) / 50));
      for (let t = 1; t <= n; t++) stamp(pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t / n, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t / n);
    }
  }
  const inCorridor = e => e.pts.some(p => stamped.has(`${Math.floor(p[0] / CELL)},${Math.floor(p[1] / CELL)}`));
  const edgeLen = e => e.pts.reduce((s, p, i) => (i ? s + dist(e.pts[i - 1], p) : 0), 0);
  const corridor = kept.filter(inCorridor);
  const corridorEdges = countBy(corridor, e => e.cls, edgeLen);

  const rideEdges = new Set(ride.map(s => graph.pieces[s.piece].edge));
  const structureOnRide = countBy(ride.map(s => graph.pieces[s.piece]), p => p.structure ?? 'null', p => p.len);

  // Z
  let zPts = 0, zNonZero = 0, zMin = Infinity, zMax = -Infinity;
  for (const st of ride) for (const p of graph.pieces[st.piece].pts) {
    zPts++;
    if (p.length > 2 && Number.isFinite(p[2]) && p[2] !== 0) { zNonZero++; zMin = Math.min(zMin, p[2]); zMax = Math.max(zMax, p[2]); }
  }

  // Tremola: the ride between the Gotthard and Airolo boundaries.
  const iG = route.waypoints.findIndex(w => w.name === 'Gotthard'), iA = route.waypoints.findIndex(w => w.name === 'Airolo');
  const spacing = [], tremolaPts = [];
  let tremolaLen = 0;
  if (iG >= 0 && iA > iG) {
    const sub = [];
    for (let k = iG; k < iA; k++) {
      const path = shortestPath(graph, snapNode[k], snapNode[k + 1]);
      if (path) sub.push(...path);
    }
    for (const st of sub) {
      const piece = graph.pieces[st.piece];
      const pts = st.from === piece.a ? piece.pts : [...piece.pts].reverse();
      for (let i = 0; i < pts.length; i++) {
        if (i) { const d = dist(pts[i - 1], pts[i]); spacing.push(d); tremolaLen += d; }
        if (i || !tremolaPts.length) tremolaPts.push(pts[i]);
      }
    }
  }
  spacing.sort((a, b) => a - b);
  const hairpin = hairpinStats(tremolaPts);

  // Junctions on the ride: nodes of degree 3 or more, and the ones the ride passes through twice.
  // A pass is the ride arriving on one piece and leaving on another. An out-and-back over one piece (a waypoint
  // snapped onto a spur) is a U-turn, listed apart, and does not count as using the junction.
  const visits = new Map();
  const uTurns = [];
  for (let k = 0; k + 1 < ride.length; k++) {
    const a = ride[k], b = ride[k + 1];
    if (a.piece === b.piece) { uTurns.push(a.to); continue; }
    visits.set(a.to, (visits.get(a.to) ?? 0) + 1);
  }
  // The ride's own start and finish nodes are uses of those junctions too.
  if (ride.length) for (const n of [ride[0].from, ride[ride.length - 1].to]) visits.set(n, (visits.get(n) ?? 0) + 1);
  const nearestWaypoint = xy => route.waypoints.reduce((b, w) => { const d = dist(xy, [w.e, w.n]); return d < b.d ? { d, name: w.name } : b; }, { d: Infinity, name: null });
  const junctionRows = [];
  for (const [n, count] of visits) {
    const node = graph.nodes[n];
    const incident = node.adj.map(id => graph.pieces[id]);
    const degree = incident.reduce((s, p) => s + (p.a === n) + (p.b === n), 0);
    if (degree < 3) continue;
    const nw = nearestWaypoint(node.xy);
    const names = [...new Set(incident.map(p => p.name).filter(Boolean))].sort();
    const waypoint = nw.d <= 2000 ? nw.name : null;
    junctionRows.push({
      // The junction is named for the waypoint it sits at; the roads that meet there are listed apart
      name: waypoint ?? (names.join(' / ') || null),
      roads: names.join(' / ') || null,
      nearestWaypoint: waypoint,
      lv95: [Math.round(node.xy[0]), Math.round(node.xy[1])],
      degree,
      roadClasses: [...new Set(incident.map(p => p.cls))].sort(),
      visits: count
    });
  }
  junctionRows.sort((a, b) => a.lv95[1] - b.lv95[1] || a.lv95[0] - b.lv95[0]);

  const keptClasses = new Set(kept.map(e => e.cls));
  const classKept = Object.keys(classCounts).filter(c => keptClasses.has(c));
  const classDropped = Object.keys(classCounts).filter(c => !keptClasses.has(c));

  return {
    tables: null, // filled by main
    strasseColumns: loaded.cols,
    hasZ: zPts > 0 && zNonZero / zPts > 0.99,
    zStats: { ridePoints: zPts, withNonZeroZ: zNonZero, min: zNonZero ? round(zMin, 1) : null, max: zNonZero ? round(zMax, 1) : null },
    structureField: loaded.structureField,
    structureValues: loaded.structureField ? countBy(corridor, e => e.structure ?? 'null', edgeLen) : null,
    structureValuesOnRide: loaded.structureField ? structureOnRide : null,
    roadClassField: loaded.classField,
    roadClassValues: classCounts,
    keptRoadClasses: classKept,
    droppedRoadClasses: classDropped,
    nameField: loaded.nameField,
    tremola: {
      lengthM: Math.round(tremolaLen),
      vertices: spacing.length + 1,
      hairpin,
      spacing: { median: round(quantile(spacing, 0.5)), p95: round(quantile(spacing, 0.95)), max: round(spacing[spacing.length - 1]), fractionOver4m: spacing.length ? round(spacing.filter(d => d > 4).length / spacing.length, 3) : null }
    },
    connectivity,
    junctions: {
      uTurns: uTurns.map(n => graph.nodes[n].xy.map(Math.round)),
      onRide: junctionRows,
      usedTwice: junctionRows.filter(j => j.visits >= 2)
    },
    corridorEdges: { total: { count: corridor.length, lengthM: Math.round(corridor.reduce((s, e) => s + edgeLen(e), 0)) }, byRoadClass: corridorEdges },
    rideEdgeCount: rideEdges.size,
    snaps: snaps.map(s => ({
      id: s.waypoint.id, name: s.waypoint.name, boundary: s.waypoint.boundary,
      from: [s.waypoint.e, s.waypoint.n], vertex: [round(s.e.pts[s.i][0]), round(s.e.pts[s.i][1])],
      distM: round(s.d, 1), road: s.e.name ?? null, roadClass: s.e.cls
    }))
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = n => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : null; };
  const gpkgFile = opt('gpkg') ?? findGpkg(path.join(resolveCacheDir(), 'tlm'));
  const route = scopedRoute(JSON.parse(fs.readFileSync(opt('route') ?? path.join(HERE, 'route.json'), 'utf8')), (opt('stages') ?? 'all').split(','));
  const gpkg = new GeoPackage(gpkgFile);
  const report = buildReport(gpkg, route, { marginM: Number(opt('margin') ?? 3000) });
  report.tables = gpkg.tables().filter(t => !/^(rtree_|gpkg_|sqlite_)/.test(t));
  console.log(JSON.stringify(report, null, 2));
  gpkg.close();
  if (report.connectivity.some(c => c.lengthM == null)) {
    console.error('GATE OUTCOME 4: the waypoint graph has a gap. Stop and change the plan.');
    process.exit(4);
  }
}
