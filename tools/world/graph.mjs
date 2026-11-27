// The corridor road graph (D7 a) and the ride as a path through it.
//
// Input edges and waypoints are planar in metres: pts are [x, z, height?] and a waypoint is { id, name, e, n } with
// (e, n) = (x, z). The caller converts from LV95. The graph keeps every motor road within CORRIDOR_M of the ride;
// the ride is an ordered list of edge uses. A gap between waypoints stops the import, and nothing bridges it.
import { isMotorRoad, buildGraph, shortestPath, snapWaypoints } from './inspect.mjs';

export const CORRIDOR_M = 1000;
const STAMP_CELL_M = 100;

export class GraphGapError extends Error {}

const planar = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const lineLength = pts => pts.reduce((s, p, i) => (i ? s + planar(pts[i - 1], p) : 0), 0);

// Cells of STAMP_CELL_M whose centre lies within `radius` of the polyline.
function stampCorridor(lines, radius) {
  const stamped = new Set();
  const r = Math.ceil(radius / STAMP_CELL_M);
  const stamp = (x, z) => {
    const cx = Math.floor(x / STAMP_CELL_M), cz = Math.floor(z / STAMP_CELL_M);
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
      const mx = (cx + i + 0.5) * STAMP_CELL_M, mz = (cz + j + 0.5) * STAMP_CELL_M;
      if ((mx - x) ** 2 + (mz - z) ** 2 <= radius * radius) stamped.add(`${cx + i},${cz + j}`);
    }
  };
  for (const pts of lines) {
    stamp(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      const n = Math.max(1, Math.ceil(planar(pts[i - 1], pts[i]) / (STAMP_CELL_M / 2)));
      for (let t = 1; t <= n; t++) stamp(pts[i - 1][0] + ((pts[i][0] - pts[i - 1][0]) * t) / n, pts[i - 1][1] + ((pts[i][1] - pts[i - 1][1]) * t) / n);
    }
  }
  return stamped;
}

function sideOrder(a, b) {
  const key = e => {
    const mid = e.srcPts[e.srcPts.length >> 1];
    return [Math.floor(mid[1] / 512), Math.floor(mid[0] / 512), Math.round(mid[0] * 1000), Math.round(mid[1] * 1000), Math.round(e.length * 1000), e.fid ?? 0];
  };
  const ka = key(a), kb = key(b);
  for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
  return 0;
}

// stages: [{ id, name, waypoints: [{ id, name, e, n }] }], in ride order, each starting where the one before ends.
// Returns { nodes, edges, ride, stageSteps, snaps }.
//   nodes  [{ id, x, z, y }]
//   edges  [{ id, a, b, cls, structure, surface, name, srcPts, hasZ, onRide, length, fid }] with srcPts oriented a to b
//   ride   [{ edgeId, dir, stage }]; dir 1 runs a to b
export function buildCorridorGraph({ edges, stages, corridorM = CORRIDOR_M }) {
  const kept = edges.filter(isMotorRoad);
  const sourceOf = new Map(kept.map(e => [e.id, e]));
  const allWaypoints = stages.flatMap(s => s.waypoints);
  const { snaps, cuts } = snapWaypoints(kept, allWaypoints);
  const graph = buildGraph(kept, cuts);
  const snapNode = snaps.map(s => graph.nodeAt(s.e.pts[s.i]));

  const steps = [];
  let at = 0;
  const stageSteps = stages.map(stage => {
    const from = steps.length;
    for (let k = 0; k + 1 < stage.waypoints.length; k++, at++) {
      const a = snapNode[at], b = snapNode[at + 1];
      if (a === b) continue;
      const path = shortestPath(graph, a, b);
      if (!path) throw new GraphGapError(`no road between waypoints ${stage.waypoints[k].name} and ${stage.waypoints[k + 1].name}`);
      for (const p of path) steps.push({ ...p, stage: stage.id });
    }
    at++;
    return { id: stage.id, from, to: steps.length };
  });
  for (let k = 0; k + 1 < steps.length; k++) {
    if (steps[k].to !== steps[k + 1].from) throw new GraphGapError(`the ride is not continuous at step ${k}: stages must follow each other`);
  }

  // Ride pieces first, in order of first use.
  const rideOrder = [];
  const rideSeen = new Set();
  for (const st of steps) if (!rideSeen.has(st.piece)) { rideSeen.add(st.piece); rideOrder.push(st.piece); }

  const stamped = stampCorridor(rideOrder.map(id => graph.pieces[id].pts), corridorM);
  const inCorridor = p => stamped.has(`${Math.floor(p[0] / STAMP_CELL_M)},${Math.floor(p[1] / STAMP_CELL_M)}`);

  const nodes = [];
  const nodeIds = new Map();
  const nodeFor = (key, x, z, y) => {
    if (!nodeIds.has(key)) { nodeIds.set(key, nodes.length); nodes.push({ id: nodes.length, x, z, y }); }
    return nodeIds.get(key);
  };
  const graphNode = id => nodeFor(`g${id}`, graph.nodes[id].xy[0], graph.nodes[id].xy[1], graph.nodes[id].z ?? 0);

  const makeEdge = (piece, onRide) => {
    let pts = piece.pts;
    let a, b;
    if (onRide) {
      a = graphNode(piece.a);
      b = graphNode(piece.b);
    } else {
      // A side line is cut to the stretch inside the corridor. A cut end is a dead end of its own.
      let first = pts.findIndex(inCorridor);
      let last = pts.length - 1 - [...pts].reverse().findIndex(inCorridor);
      if (first < 0) return null;
      first = Math.max(0, first - 1);
      last = Math.min(pts.length - 1, last + 1);
      if (last <= first) return null;
      const cutStart = first > 0, cutEnd = last < pts.length - 1;
      pts = pts.slice(first, last + 1);
      a = cutStart ? nodeFor(`s${piece.id}`, pts[0][0], pts[0][1], pts[0][2] ?? 0) : graphNode(piece.a);
      b = cutEnd ? nodeFor(`e${piece.id}`, pts[pts.length - 1][0], pts[pts.length - 1][1], pts[pts.length - 1][2] ?? 0) : graphNode(piece.b);
    }
    pts = pts.map(p => [...p]);
    pts[0][0] = nodes[a].x; pts[0][1] = nodes[a].z;
    pts[pts.length - 1][0] = nodes[b].x; pts[pts.length - 1][1] = nodes[b].z;
    const source = sourceOf.get(piece.edge);
    return {
      a, b, cls: piece.cls, structure: piece.structure ?? null, surface: source?.surface ?? null, name: piece.name ?? null,
      fid: source?.fid ?? null, srcPts: pts, hasZ: pts.every(p => p.length > 2 && Number.isFinite(p[2]) && p[2] !== 0),
      onRide, length: lineLength(pts), pieceId: piece.id
    };
  };

  const out = [];
  const edgeOfPiece = new Map();
  for (const id of rideOrder) {
    const e = makeEdge(graph.pieces[id], true);
    e.id = out.length;
    edgeOfPiece.set(id, e);
    out.push(e);
  }
  const side = [];
  for (const piece of graph.pieces) {
    if (rideSeen.has(piece.id)) continue;
    // A piece that the ride splits shares its node with the ride; any other piece is judged by the corridor.
    if (!piece.pts.some(inCorridor)) continue;
    const e = makeEdge(piece, false);
    if (e) side.push(e);
  }
  side.sort(sideOrder);
  for (const e of looseKept(out, side, nodes.length)) { e.id = out.length; out.push(e); }

  const ride = steps.map(st => ({ edgeId: edgeOfPiece.get(st.piece).id, dir: st.from === graph.pieces[st.piece].a ? 1 : -1, stage: st.stage }));
  return { nodes, edges: out, ride, stageSteps, snaps: snaps.map(s => ({ name: s.waypoint.name, distM: s.d, road: s.e.name ?? null })) };
}

// The side edges a world keeps of `side`: a bridge whose end is a dead end (a node no other kept edge meets) is
// dropped, then every piece no longer joined to the ride. In the source an old road's bridge is a motor road while
// the ways that lead to it are paths (Weg), which stay out (isMotorRoad): the bridge was kept alone and drawn as a
// deck in the air (andermatt-goeschenen, edges 730 and 731 at ride km 1.9 and 2.1). Repeats until nothing changes,
// as a dropped bridge can leave another dead end
export function looseKept(ride, side, nodeCount) {
  const bridge = e => /br(ue|ü)cke/i.test(e.structure ?? '');
  let kept = side.slice();
  for (let changed = true; changed;) {
    changed = false;
    const deg = new Uint16Array(nodeCount);
    for (const e of [...ride, ...kept]) { deg[e.a]++; deg[e.b]++; }
    const next = kept.filter(e => !(bridge(e) && (deg[e.a] === 1 || deg[e.b] === 1)));
    if (next.length !== kept.length) { kept = next; changed = true; }
  }
  // (and a piece that only a dropped bridge joined to the ride: joined before, cut off now. A piece the corridor
  // cut off on its own stays as it was)
  const reached = list => {
    const reach = new Set();
    for (const e of ride) { reach.add(e.a); reach.add(e.b); }
    for (let grew = true; grew;) {
      grew = false;
      for (const e of list) if (reach.has(e.a) !== reach.has(e.b)) { reach.add(e.a); reach.add(e.b); grew = true; }
    }
    return reach;
  };
  if (kept.length === side.length) return kept;
  const before = reached(side), after = reached(kept);
  return kept.filter(e => after.has(e.a) || !before.has(e.a));
}

export function degreeOf(nodes, edges) {
  const deg = new Uint8Array(nodes.length);
  for (const e of edges) { deg[e.a] = Math.min(255, deg[e.a] + 1); deg[e.b] = Math.min(255, deg[e.b] + 1); }
  return deg;
}
