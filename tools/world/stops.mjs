// The stops at the ends of a leg: a real place where the group pulls in and parks (a hotel, a restaurant, a lookout,
// a fuel station, a car park). route.json names each stop by its kind and a coordinate (a slice's `stops.start` and
// `stops.end`: where the owner's photos cluster as a stop, or a building with a use); everything else is found here by
// rule from the map:
//
//   area     the public car park or rest area (tlm_areale_verkehrsareal, AREA_KINDS of places.mjs) nearest the
//            coordinate, within STOP.areaReachM of it.
//   access   how the ride reaches it. `direct` when the area comes within STOP.directM of the ride: the turn-in is the
//            ride sample nearest the area. `road` otherwise: the shortest way along the side roads from a node of the
//            ride to a side-road sample inside the area (or within STOP.laneM of it), at most STOP.pathMaxM long.
//   turnS    the ride distance of the turn-in. A stop at a stage's end moves that end (its finish line, and the next
//            stage's start) to STOP.leadM before it, so the timed ride ends before the pull-in and a stage is never a
//            parking contest. The ride itself runs on to the turn-in.
//   path     the way in, from the ride at turnS to the slots' row, in local metres (what the stop scene rides).
//   slots    where the bikes park: STOP.slots bikes side by side, STOP.slotGapM apart, along the area's long axis,
//            each nose to the area's middle line, every slot STOP.marginM inside the area's outline.
//
//   plane    the area's ground: the plane of the land inside it (groundPlane), on which the importer lays that land
//            and the game draws the area as hard standing.
//   view     the heading in which the land falls away furthest from the area (viewOf): a lookout's rail and camera
//
// A stop: { id, kind, stage, at, s: turnS, side, access, x, z, ring, path, slots, plane }. Nothing here names a place.
import { AREA_KINDS } from './places.mjs';

export const STOP_KINDS = Object.freeze(['hotel', 'restaurant', 'lookout', 'fuel', 'carpark']);

export const STOP = Object.freeze({
  areaReachM: 300,
  directM: 16,
  laneM: 6,
  pathMaxM: 400,
  // the ride's nodes searched for a way in: within this of the stage's boundary
  searchM: 800,
  leadM: 60,
  slots: 8,
  slotGapM: 2.2,
  rowGapM: 3,
  marginM: 1.2,
  // a parked bike's half length and half width, for the outline test
  bikeHalfM: [1.1, 0.5],
  ringMax: 32,
  // the steepest a stop's levelled ground may be
  gradeMax: 0.06,
  // the view: bearings read round the area, and the reach past the outline they read the land at
  viewBearings: 24, viewFromM: 40, viewToM: 160
});

const r2 = v => Math.round(v * 100) / 100;

function inside(ring, x, z) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

function edgeDistance(ring, x, z) {
  let best = Infinity;
  for (let i = 0; i + 1 < ring.length; i++) {
    const [ax, az] = ring[i], [bx, bz] = ring[i + 1];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx - x, az + t * dz - z));
  }
  return best;
}

// Metres from (x, z) to the area: 0 inside it
export function areaDistance(ring, x, z) { return inside(ring, x, z) ? 0 : edgeDistance(ring, x, z); }

function centroid(ring) {
  let a = 0, cx = 0, cz = 0;
  for (let i = 0; i + 1 < ring.length; i++) {
    const [x0, z0] = ring[i], [x1, z1] = ring[i + 1];
    const f = x0 * z1 - x1 * z0;
    a += f; cx += (x0 + x1) * f; cz += (z0 + z1) * f;
  }
  if (Math.abs(a) < 1e-9) return [ring.reduce((p, q) => p + q[0], 0) / ring.length, ring.reduce((p, q) => p + q[1], 0) / ring.length];
  return [cx / (3 * a), cz / (3 * a)];
}

// The outline with at most `max` points: the points that change its shape least are dropped first
function simplify(ring, max) {
  const open = ring.slice(0, ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1] ? -1 : undefined);
  while (open.length > max) {
    let worst = -1, least = Infinity;
    for (let i = 0; i < open.length; i++) {
      const a = open[(i + open.length - 1) % open.length], b = open[i], c = open[(i + 1) % open.length];
      const area = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]));
      if (area < least) { least = area; worst = i; }
    }
    open.splice(worst, 1);
  }
  return [...open, open[0]];
}

// The slots: rows along the area's long axis through its middle, then rows either side of it
export function slotsIn(ring, count = STOP.slots) {
  const [cx, cz] = centroid(ring);
  let xx = 0, zz = 0, xz = 0;
  const closed = ring.length > 1 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1];
  for (const [x, z] of closed ? ring.slice(0, -1) : ring) { xx += (x - cx) ** 2; zz += (z - cz) ** 2; xz += (x - cx) * (z - cz); }
  const angle = 0.5 * Math.atan2(2 * xz, xx - zz);
  const ax = [Math.cos(angle), Math.sin(angle)], nx = [-Math.sin(angle), Math.cos(angle)];
  // A slot's heading: its nose along the normal of the row (heading = atan2(dx, dz), 0 = +z)
  const heading = Math.atan2(nx[0], nx[1]);
  const [hl, hw] = STOP.bikeHalfM;
  const fits = (x, z) => [[hl, hw], [hl, -hw], [-hl, hw], [-hl, -hw]].every(([u, v]) => {
    const px = x + u * nx[0] + v * ax[0], pz = z + u * nx[1] + v * ax[1];
    return inside(ring, px, pz) && edgeDistance(ring, px, pz) >= STOP.marginM;
  });
  const slots = [];
  for (const row of [0, 1, -1, 2, -2, 3, -3]) {
    const ox = cx + row * STOP.rowGapM * nx[0], oz = cz + row * STOP.rowGapM * nx[1];
    for (let k = 0; slots.length < count && k < 60; k++) {
      const along = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * STOP.slotGapM;
      const x = ox + along * ax[0], z = oz + along * ax[1];
      if (fits(x, z)) slots.push({ x: r2(x), z: r2(z), heading: Math.round(heading * 1e4) / 1e4 });
    }
    if (slots.length >= count) break;
  }
  return slots.slice(0, count);
}

// The ride's nodes with the ride distance at each
function rideNodes(edges, ride) {
  const out = [];
  let s = 0;
  ride.forEach(use => {
    const e = edges[use.edgeId];
    out.push({ node: use.dir === 1 ? e.a : e.b, s });
    s += e.length;
  });
  if (ride.length) { const e = edges[ride.at(-1).edgeId]; out.push({ node: ride.at(-1).dir === 1 ? e.b : e.a, s }); }
  return out;
}

// The shortest way along the side roads from a node to the first side-road sample in the area: { length, pts } or null
function wayIn(edges, adjacency, from, ring) {
  const best = new Map([[from, { d: 0, prev: null }]]);
  const queue = [[0, from]];
  let found = null;
  while (queue.length) {
    queue.sort((p, q) => p[0] - q[0]);
    const [d, node] = queue.shift();
    if (d > (best.get(node)?.d ?? Infinity) + 1e-9 || d > STOP.pathMaxM) continue;
    for (const { edge, other } of adjacency.get(node) ?? []) {
      if (edge.onRide) continue;
      const fwd = edge.a === node;
      const n = edge.x.length;
      let run = d, last = null;
      for (let k = 0; k < n; k++) {
        const i = fwd ? k : n - 1 - k;
        if (last) run += Math.hypot(edge.x[i] - last[0], edge.z[i] - last[1]);
        last = [edge.x[i], edge.z[i]];
        if (run > STOP.pathMaxM) break;
        if (areaDistance(ring, edge.x[i], edge.z[i]) <= STOP.laneM && (!found || run < found.length)) {
          const pts = [];
          for (let j = 0; j <= k; j++) { const t = fwd ? j : n - 1 - j; pts.push([edge.x[t], edge.z[t]]); }
          found = { length: run, node, edge, pts };
          break;
        }
      }
      const nd = d + edge.length;
      if (nd < (best.get(other)?.d ?? Infinity)) { best.set(other, { d: nd, prev: node, edge }); queue.push([nd, other]); }
    }
  }
  if (!found) return null;
  // The whole polyline: back along the edges from the node where the last edge starts
  const chain = [];
  for (let at = found.node; at !== from;) {
    const step = best.get(at);
    const e = step.edge, fwd = e.a === step.prev;
    const pts = [];
    for (let k = 0; k < e.x.length; k++) { const i = fwd ? k : e.x.length - 1 - k; pts.push([e.x[i], e.z[i]]); }
    chain.unshift(...(chain.length ? pts.slice(0, -1) : pts));
    at = step.prev;
  }
  return { length: found.length, pts: [...chain, ...(chain.length ? found.pts.slice(1) : found.pts)] };
}

// The ground of a stop's area: the least-squares plane of the land inside its outline (the DEM every 2 m), its grade
// held to STOP.gradeMax. {y, gx, gz} with the height y at the stop's middle (x, z) and the rise per metre along x and z.
// The importer lays the land inside the outline on it (bench.mjs `pads`) and the game draws the area on it
export function groundPlane(ring, cx, cz, demAt) {
  const xs = ring.map(p => p[0]), zs = ring.map(p => p[1]);
  let n = 0, sx = 0, sz = 0, sy = 0, sxx = 0, szz = 0, sxz = 0, sxy = 0, szy = 0;
  for (let x = Math.min(...xs); x <= Math.max(...xs); x += 2) {
    for (let z = Math.min(...zs); z <= Math.max(...zs); z += 2) {
      if (!inside(ring, x, z)) continue;
      const y = demAt(x, z);
      if (!Number.isFinite(y)) continue;
      const u = x - cx, v = z - cz;
      n++; sx += u; sz += v; sy += y; sxx += u * u; szz += v * v; sxz += u * v; sxy += u * y; szy += v * y;
    }
  }
  if (n < 3) return null;
  // Normal equations of y = a + b u + c v
  const m = [[n, sx, sz], [sx, sxx, sxz], [sz, sxz, szz]], r = [sy, sxy, szy];
  const det = M => M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
  const d = det(m);
  if (Math.abs(d) < 1e-9) return { y: Math.round((sy / n) * 100) / 100, gx: 0, gz: 0 };
  const col = k => m.map((row, i) => row.map((v, j) => (j === k ? r[i] : v)));
  let [a, b, c] = [0, 1, 2].map(k => det(col(k)) / d);
  const grade = Math.hypot(b, c);
  if (grade > STOP.gradeMax) { b *= STOP.gradeMax / grade; c *= STOP.gradeMax / grade; }
  return { y: Math.round(a * 100) / 100, gx: Math.round(b * 1e4) / 1e4, gz: Math.round(c * 1e4) / 1e4 };
}

// The way the view goes from a stop: the bearing (heading, atan2(dx, dz)) of the VIEW_BEARINGS round the area's middle
// in which the land falls furthest under the area's plane, read on the DEM from viewFromM to viewToM past the outline.
// A lookout's rail stands on that side and its camera looks that way
export function viewOf(ring, cx, cz, plane, demAt) {
  let best = null;
  for (let k = 0; k < STOP.viewBearings; k++) {
    const h = (2 * Math.PI * k) / STOP.viewBearings, sx = Math.sin(h), cz2 = Math.cos(h);
    // the outline's distance on this bearing
    let edge = 0;
    while (edge < 400 && inside(ring, cx + sx * (edge + 1), cz + cz2 * (edge + 1))) edge++;
    let drop = 0, n = 0;
    for (let d = STOP.viewFromM; d <= STOP.viewToM; d += 10) {
      const x = cx + sx * (edge + d), z = cz + cz2 * (edge + d);
      const y = demAt(x, z);
      if (!Number.isFinite(y)) continue;
      drop += plane.y + plane.gx * (x - cx) + plane.gz * (z - cz) - y;
      n++;
    }
    if (n && (!best || drop / n > best.drop)) best = { h, drop: drop / n };
  }
  return best ? Math.round(Math.atan2(Math.sin(best.h), Math.cos(best.h)) * 1e4) / 1e4 : null;
}

// stopDefs: [{ stage (index), at: 'start'|'end', kind, x, z }] in local metres. bounds: the stages' [{ id, from, to }].
// Returns the stops, and moves each stage end with a stop to STOP.leadM before its turn-in (bounds are changed).
export function findStops({ stopDefs, samples, edges, ride, areas, bounds, demAt = null }) {
  const adjacency = new Map();
  for (const e of edges) {
    for (const [node, other] of [[e.a, e.b], [e.b, e.a]]) {
      if (!adjacency.has(node)) adjacency.set(node, []);
      adjacency.get(node).push({ edge: e, other });
    }
  }
  const nodesOnRide = rideNodes(edges, ride);
  const stops = [];
  for (const def of stopDefs) {
    if (!STOP_KINDS.includes(def.kind)) throw new Error(`stop kind "${def.kind}" is not one of ${STOP_KINDS.join(', ')}`);
    const stage = bounds[def.stage];
    const boundaryS = def.at === 'start' ? stage.from : stage.to;
    const candidates = areas.filter(a => AREA_KINDS[a.cls]).map(a => ({ a, d: areaDistance(a.ring, def.x, def.z) })).filter(c => c.d <= STOP.areaReachM).sort((p, q) => p.d - q.d);
    if (!candidates.length) throw new Error(`stop ${def.kind} at the ${def.at} of ${stage.id}: no public car park or rest area within ${STOP.areaReachM} m of its coordinate`);
    let made = null;
    for (const { a } of candidates) {
      // Direct: the area comes within directM of the ride's edge near the boundary. The turn-in is the first sample
      // of the run of such samples nearest the boundary: the rider turns in where the area begins
      const runs = [];
      for (let i = 0; i < samples.s.length; i++) {
        if (Math.abs(samples.s[i] - boundaryS) > STOP.searchM) continue;
        const d = areaDistance(a.ring, samples.x[i], samples.z[i]) - samples.width[i] / 2;
        if (d > STOP.directM) continue;
        const last = runs.at(-1);
        if (last && last.to === i - 1) { last.to = i; last.gap = Math.min(last.gap, Math.abs(samples.s[i] - boundaryS)); } else runs.push({ from: i, to: i, gap: Math.abs(samples.s[i] - boundaryS) });
      }
      const run = runs.sort((p, q) => p.gap - q.gap)[0];
      const near = run ? { i: run.from, s: samples.s[run.from] } : null;
      const [cx, cz] = centroid(a.ring);
      if (near) {
        const i = near.i;
        const lateral = (cx - samples.x[i]) * Math.cos(samples.heading[i]) - (cz - samples.z[i]) * Math.sin(samples.heading[i]);
        made = { a, access: 'direct', s: near.s, side: lateral >= 0 ? 1 : -1, path: [[samples.x[i], samples.z[i]]] };
        break;
      }
      // By road: the shortest way in from a node of the ride near the boundary
      let way = null;
      for (const rn of nodesOnRide) {
        if (Math.abs(rn.s - boundaryS) > STOP.searchM) continue;
        const w = wayIn(edges, adjacency, rn.node, a.ring);
        if (w && (!way || w.length < way.length)) way = { ...w, s: rn.s };
      }
      if (way) {
        const i = samples.s.findIndex(v => v >= way.s - 1e-6);
        const [px, pz] = way.pts[1] ?? way.pts[0];
        const lateral = (px - samples.x[i]) * Math.cos(samples.heading[i]) - (pz - samples.z[i]) * Math.sin(samples.heading[i]);
        made = { a, access: 'road', s: way.s, side: lateral >= 0 ? 1 : -1, path: way.pts };
        break;
      }
    }
    if (!made) throw new Error(`stop ${def.kind} at the ${def.at} of ${stage.id}: no area the ride reaches within ${STOP.pathMaxM} m`);
    const slots = slotsIn(made.a.ring);
    if (slots.length < STOP.slots) throw new Error(`stop ${def.kind} at the ${def.at} of ${stage.id}: room for ${slots.length} bikes, not ${STOP.slots}`);
    const [cx, cz] = centroid(made.a.ring);
    const plane = demAt ? groundPlane(made.a.ring, cx, cz, demAt) : null;
    const view = plane ? viewOf(made.a.ring, cx, cz, plane, demAt) : null;
    // The way in ends at the middle of the slots' row
    const row = slots.reduce((p, q) => [p[0] + q.x / slots.length, p[1] + q.z / slots.length], [0, 0]);
    const path = [...made.path, [cx, cz], row].map(([x, z]) => [r2(x), r2(z)]).filter((p, i, all) => i === 0 || Math.hypot(p[0] - all[i - 1][0], p[1] - all[i - 1][1]) > 0.5);
    stops.push({
      id: `${stage.id}-${def.at}`, kind: def.kind, stage: stage.id, at: def.at, s: Math.round(made.s * 10) / 10, side: made.side, access: made.access,
      x: r2(cx), z: r2(cz), ring: simplify(made.a.ring, STOP.ringMax).map(([x, z]) => [r2(x), r2(z)]), path, slots, ...(plane ? { plane } : {}), ...(view !== null ? { view } : {})
    });
  }
  // A stop at a stage's end moves the end (and the next stage's start) to leadM before the turn-in
  for (const stop of stops) {
    if (stop.at !== 'end') continue;
    const k = bounds.findIndex(b => b.id === stop.stage);
    const line = Math.round((stop.s - STOP.leadM) * 100) / 100;
    if (!(line > bounds[k].from + 500)) throw new Error(`stop at the end of ${stop.stage}: its line at s ${line} leaves the stage under 500 m`);
    bounds[k].to = line;
    if (bounds[k + 1]) bounds[k + 1].from = line;
  }
  return stops;
}

// The lanes in a stop's area lie on its ground: every sample of a side road inside the outline takes the area's plane,
// and over LANE_BLEND_M outside it the road goes back to its own height (the ride is never moved). A car park's lanes
// kept their own heights over the levelled area: a step, a pit and land over a lane at the lookout's hairpin
export const LANE_BLEND_M = 10;
export function layLanes(edges, stops) {
  let moved = 0;
  for (const stop of stops) {
    if (!stop.plane) continue;
    const planeY = (x, z) => stop.plane.y + stop.plane.gx * (x - stop.x) + stop.plane.gz * (z - stop.z);
    for (const e of edges) {
      if (e.onRide) continue;
      for (let i = 0; i < e.x.length; i++) {
        const d = areaDistance(stop.ring, e.x[i], e.z[i]);
        if (d >= LANE_BLEND_M) continue;
        const t = d / LANE_BLEND_M, w = 1 - t * t * (3 - 2 * t);
        e.y[i] += (planeY(e.x[i], e.z[i]) - e.y[i]) * w;
        moved++;
      }
    }
  }
  return moved;
}
