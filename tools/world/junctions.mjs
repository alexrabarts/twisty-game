// Ride junctions (D7 c). For each graph node of degree 3 or more that the ride uses, the incident edges with their
// headings and, for each pass of the ride through it, the edge in and the edge out. Every other incident edge gets a
// stub: its first STUB_M from the node, ending in a barrier pose. The barrier set therefore differs per pass at a
// junction used twice.
export const STUB_M = 60;

// Position and heading at `dist` metres from the node, walking edge `e` away from it. dir 1: node is e.a.
function along(edge, dir, dist) {
  const n = edge.x.length;
  const at = Math.min(dist, edge.spacing * (n - 1)) / edge.spacing;
  const i = Math.min(n - 2, Math.floor(at));
  const t = at - i;
  const [p, q] = dir === 1 ? [i, i + 1] : [n - 1 - i, n - 2 - i];
  return {
    x: edge.x[p] + (edge.x[q] - edge.x[p]) * t,
    z: edge.z[p] + (edge.z[q] - edge.z[p]) * t,
    heading: Math.atan2(edge.x[q] - edge.x[p], edge.z[q] - edge.z[p])
  };
}

// Heading leaving the node along an edge.
function leaving(edge, dir) { return along(edge, dir, Math.min(8, edge.spacing * (edge.x.length - 1))).heading; }

export function buildJunctions({ nodes, edges, ride, degree, waypoints = [] }) {
  const incident = nodes.map(() => []);
  edges.forEach(e => { incident[e.a].push({ edge: e, dir: 1 }); incident[e.b].push({ edge: e, dir: -1 }); });
  // Cumulative ride distance at each step boundary.
  const sAt = [0];
  for (const use of ride) sAt.push(sAt[sAt.length - 1] + edges[use.edgeId].length);

  const passes = new Map();
  const addPass = (node, pass) => { if (!passes.has(node)) passes.set(node, []); passes.get(node).push(pass); };
  const endNode = (use, atEnd) => { const e = edges[use.edgeId]; return (use.dir === 1) === atEnd ? e.b : e.a; };
  if (ride.length) addPass(endNode(ride[0], false), { sIn: 0, inEdge: null, outEdge: ride[0].edgeId });
  for (let k = 0; k + 1 < ride.length; k++) addPass(endNode(ride[k], true), { sIn: sAt[k + 1], inEdge: ride[k].edgeId, outEdge: ride[k + 1].edgeId });
  if (ride.length) addPass(endNode(ride[ride.length - 1], true), { sIn: sAt[ride.length], inEdge: ride[ride.length - 1].edgeId, outEdge: null });

  const nearestWaypoint = (x, z) => waypoints.reduce((b, w) => { const d = Math.hypot(w.e - x, w.n - z); return d < b.d ? { d, name: w.name } : b; }, { d: Infinity, name: null });
  const rows = [];
  for (const [node, list] of [...passes].sort((p, q) => p[0] - q[0])) {
    if (degree[node] < 3) continue;
    const inc = incident[node];
    const names = [...new Set(inc.map(i => i.edge.name).filter(Boolean))].sort();
    const near = nearestWaypoint(nodes[node].x, nodes[node].z);
    list.sort((p, q) => p.sIn - q.sIn);
    rows.push({
      id: `j${node}`,
      node,
      name: names.join(' / ') || null,
      nearestWaypoint: near.d <= 2000 ? near.name : null,
      incident: inc.map(({ edge, dir }) => ({ edgeId: edge.id, heading: Math.round(leaving(edge, dir) * 1e4) / 1e4 })),
      passes: list.map(p => ({
        sIn: Math.round(p.sIn * 100) / 100,
        inEdge: p.inEdge,
        outEdge: p.outEdge,
        barriers: inc
          .filter(({ edge }) => edge.id !== p.inEdge && edge.id !== p.outEdge)
          .map(({ edge, dir }) => {
            const b = along(edge, dir, STUB_M);
            return { edgeId: edge.id, x: Math.round(b.x * 1000) / 1000, z: Math.round(b.z * 1000) / 1000, heading: Math.round(b.heading * 1e4) / 1e4 };
          })
      }))
    });
  }
  return rows;
}
