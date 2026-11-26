// Height tiles with the road bench carved in, for every stored edge, so free-roam later needs no new height data.
//
// The ground must meet every drawn road edge (no road hangs in the air), and the terrain is drawn as 8 m triangles.
// Every node of every triangle that reaches into the drawn strip of a road (the ribbon, its width, plus VERGE_M of
// verge each side, plus CLAIM_MARGIN_M) is claimed by that road; a claimed node within the strip takes the road's
// height at its nearest point (`road` within width/2, `bench` beyond). Where strips of two strands claim one node
// (stacked hairpin legs, crossing edges, the two sides of a hairpin) the node keeps the lowest road's height, so the
// land never stands over a road; only under the ride's own carriageway and verge does the ride keep its height against
// a road at about its height (JOIN_M, a junction). A node nearer an upper road than the road whose height it took, and
// beyond that road's strip, is a `drop`: the upper road's edge stands on a retaining wall there (RoadMesh edgeWorks).
// Round a tight bend the strip's nodes are lowered until no point of the road lies under its land, then raised back
// where every point keeps room.
//
// Past the strip a claimed node is the fill at BATTER (1:1.5) down to the ground, or the ground where it stands
// higher, but never over the road; a node no strip claims is the ground held within BATTER of the nearest road (fill
// under it, cut above it) out to EARTHWORK_M past the strip, and the DEM beyond. No flat shelf: the land beside a road
// is the least earthwork that meets it. RoadMesh draws the fill from the verge's edge where the 8 m triangles lie
// under it. Where two strands are near and the height between them cannot be closed at the batter, the node is a
// cliff face (`wall`, nearer the lower road) or a drop (nearer the upper road). Road is
// never carved under bridges, galleries or over tunnels.
import { ROOFED, FLAG } from './profile.mjs';

export const TILE_M = 512;
export const CELL_M = 8;
export const TILE_N = TILE_M / CELL_M + 1;
export const ZONE = Object.freeze({ terrain: 0, road: 1, bench: 2, wall: 3, drop: 4, water: 5 });
export const COVER_WATER = 7;

// Metres of verge RoadMesh draws past the carriageway edge (RoadSurface.VERGE_M)
export const VERGE_M = 1.1;
// Two strands within this height of each other at a node are one surface (a junction), not stacked
export const JOIN_M = 1.5;
export const STRAND_GAP_M = 60;
const CLAIM_MARGIN_M = 0.5;
// At a junction the ride owns the nodes this far past its verge too, against a side road within JOIN_M of it, where
// the node is on no other road's own carriageway and verge: a node left at the side road's lower height pulled the
// land under the ride's verge, a gap between the two roads 0.3 to 0.7 m under both. Half a cell: at a cell (8 m) the
// re-import of the Tremola left a side road's wall end open beside the land the ride held (3.1 m, at its start)
const RIDE_OWN_PAST_M = 4;
// ... and only where no side road among the claims stands more than this over the ride there
const RIDE_OWN_OVER_M = 0.1;
// On a bridge the land is not carved, but no land stands over the deck: every node of a triangle that reaches into a
// bridge's strip is held this far under the deck's surface (a bank that rises to an abutment came up through the deck's
// last metres: 0.96 m over the carriageway's edge at a bridge end of the run-in from the north)
const BRIDGE_UNDER_M = 0.15;
// A stop's levelled ground reaches this far past its outline (stops.mjs groundPlane, `pads`)
const PAD_FLAT_M = 4;
const CLAIM_STEP_M = 0.5;
const SAME_STRAND_M = 2 * CELL_M;
const LOWER_PASSES = 4;
const RAISE_BELOW_M = 0.2;
const BENCH_M = 2;
const SLOPE_REACH_M = 22;
// The steepest the land beside a road may be (rise over run): a 1:1.5 batter, for the fill under the road and the cut
// above it. Where two roads lie too close for it, the face is a retaining wall (`walled` in verify.mjs `floating`),
// which the runtime draws with a parapet (RoadMesh)
export const BATTER = 1 / 1.5;
// How far past the strip the earthwork holds the land to the batter; beyond, the land is the DEM's
export const EARTHWORK_M = 16;
const HASH_M = 16;
const PACK = 1 << 20;
const NODE_BIAS = 1 << 15;
const nodeKey = (gi, gj) => (gi + NODE_BIAS) * 65536 + (gj + NODE_BIAS);

// Half the drawn strip of a road `width` wide: the ribbon, its verge and the probe margin
export const stripHalf = width => width / 2 + VERGE_M + CLAIM_MARGIN_M;

// The extra verge of edge `e` between samples i and i + 1 at share t, on the side of (x, z): a stopping place
// (places.mjs applyPads: e.padP on the edge's +lateral side, e.padN on the other), 0 for every other edge
function padAt(e, i, t, x, z) {
  if (!e.padP && !e.padN) return 0;
  const dx = e.x[i + 1] - e.x[i], dz = e.z[i + 1] - e.z[i];
  const pad = (x - (e.x[i] + dx * t)) * dz - (z - (e.z[i] + dz * t)) * dx >= 0 ? e.padP : e.padN;
  return pad ? pad[i] + (pad[i + 1] - pad[i]) * t : 0;
}

function insidePad(ring, x, z) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

function padEdge(ring, x, z) {
  let best = Infinity;
  for (let i = 0; i + 1 < ring.length; i++) {
    const [ax, az] = ring[i], [bx, bz] = ring[i + 1];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx - x, az + t * dz - z));
  }
  return best;
}

// A hash of every segment outside a structure, for "which strands lie near (x, z)": near(x, z) gives, per edge and
// per STRAND_GAP_M of its length, the nearest point within `reach` of that road's band: {edge, arc, d, y, w, low},
// `low` the lowest road height of that strand within reach
export function segmentIndex(edges, reach = 0) {
  const hash = new Map();
  edges.forEach((e, ei) => {
    for (let i = 0; i + 1 < e.x.length; i++) {
      if ((e.flags[i] | e.flags[i + 1]) & ROOFED) continue;
      const r = Math.max(e.width[i], e.width[i + 1]) / 2 + reach;
      for (let ci = Math.floor((Math.min(e.x[i], e.x[i + 1]) - r) / HASH_M); ci <= Math.floor((Math.max(e.x[i], e.x[i + 1]) + r) / HASH_M); ci++) {
        for (let cj = Math.floor((Math.min(e.z[i], e.z[i + 1]) - r) / HASH_M); cj <= Math.floor((Math.max(e.z[i], e.z[i + 1]) + r) / HASH_M); cj++) {
          const key = ci * 65536 + cj;
          let list = hash.get(key);
          if (!list) hash.set(key, (list = []));
          list.push(ei * PACK + i);
        }
      }
    }
  });
  const spacingOf = e => e.spacing ?? (e.length && e.x.length > 1 ? e.length / (e.x.length - 1) : 4);
  return {
    near(x, z) {
      const list = hash.get(Math.floor(x / HASH_M) * 65536 + Math.floor(z / HASH_M));
      if (!list) return [];
      const best = new Map();
      for (const ref of list) {
        const ei = Math.floor(ref / PACK), i = ref - ei * PACK;
        const e = edges[ei];
        const dx = e.x[i + 1] - e.x[i], dz = e.z[i + 1] - e.z[i];
        const run = dx * dx + dz * dz;
        const t = run === 0 ? 0 : Math.max(0, Math.min(1, ((x - e.x[i]) * dx + (z - e.z[i]) * dz) / run));
        const d = Math.hypot(e.x[i] + dx * t - x, e.z[i] + dz * t - z);
        const w = e.width[i] + (e.width[i + 1] - e.width[i]) * t;
        if (d > w / 2 + reach) continue;
        const arc = (i + t) * spacingOf(e);
        const key = `${ei}:${Math.floor(arc / STRAND_GAP_M)}`;
        const y = e.y[i] + (e.y[i + 1] - e.y[i]) * t;
        const held = best.get(key);
        if (!held) best.set(key, { edge: ei, arc, d, y, w, low: y });
        else {
          held.low = Math.min(held.low, y);
          if (d < held.d) Object.assign(held, { arc, d, y, w });
        }
      }
      return [...best.values()];
    }
  };
}


// `pads`: the stops' areas (stops.mjs), [{ring, x, z, plane: {y, gx, gz}}]: a node no road claims inside an area is the
// area's plane, and past its outline a bank that rises over the plane is cut back to the batter out to EARTHWORK_M;
// land that falls away keeps its fall
export function createBencher({ edges, demAt, coverAt = () => 0, pads = [] }) {
  // A stop's area: the plane inside it, and the land held to the batter from its edge out to EARTHWORK_M (null: no pad)
  const padGround = (x, z, dem) => {
    let best = null;
    for (const pad of pads) {
      // (a node within PAD_FLAT_M of the outline is on the plane too, so no 8 m triangle that reaches into the area
      // lifts the land over it)
      const inRing = insidePad(pad.ring, x, z) || padEdge(pad.ring, x, z) <= PAD_FLAT_M;
      const d = inRing ? 0 : padEdge(pad.ring, x, z) - PAD_FLAT_M;
      if (d > EARTHWORK_M) continue;
      const y = pad.plane.y + pad.plane.gx * (x - pad.x) + pad.plane.gz * (z - pad.z);
      // (past the outline only a bank that rises is cut back to the batter; land that falls away keeps its fall: a
      // lookout's view starts at its rail, and held to the batter the land stood up in front of it as a shelf)
      const held = inRing || Number.isNaN(dem) ? y : Math.min(y + d * BATTER, dem);
      if (!best || d < best.d) best = { d, y: held, zone: inRing ? ZONE.bench : ZONE.terrain };
    }
    return best;
  };

  // The land at (x, z): a stop's levelled ground where one reaches, else the DEM
  const landAt = (x, z) => {
    const dem = demAt(x, z);
    const pad = pads.length ? padGround(x, z, dem) : null;
    return pad ? pad.y : dem;
  };

  const hash = new Map();
  const insert = (ci, cj, ref) => {
    const key = ci * 65536 + cj;
    let list = hash.get(key);
    if (!list) hash.set(key, (list = []));
    list.push(ref);
  };
  edges.forEach((e, ei) => {
    for (let i = 0; i + 1 < e.x.length; i++) {
      if ((e.flags[i] | e.flags[i + 1]) & ROOFED) continue;
      const reach = Math.max(e.width[i], e.width[i + 1]) / 2 + BENCH_M + SLOPE_REACH_M;
      const x0 = Math.min(e.x[i], e.x[i + 1]) - reach, x1 = Math.max(e.x[i], e.x[i + 1]) + reach;
      const z0 = Math.min(e.z[i], e.z[i + 1]) - reach, z1 = Math.max(e.z[i], e.z[i + 1]) + reach;
      for (let ci = Math.floor(x0 / HASH_M); ci <= Math.floor(x1 / HASH_M); ci++) {
        for (let cj = Math.floor(z0 / HASH_M); cj <= Math.floor(z1 / HASH_M); cj++) insert(ci, cj, ei * PACK + i);
      }
    }
  });

  function candidates(x, z) {
    const list = hash.get(Math.floor(x / HASH_M) * 65536 + Math.floor(z / HASH_M));
    const out = [];
    if (!list) return out;
    for (const ref of list) {
      const ei = Math.floor(ref / PACK), i = ref - ei * PACK;
      const e = edges[ei];
      const dx = e.x[i + 1] - e.x[i], dz = e.z[i + 1] - e.z[i];
      const run = dx * dx + dz * dz;
      const t = run === 0 ? 0 : Math.max(0, Math.min(1, ((x - e.x[i]) * dx + (z - e.z[i]) * dz) / run));
      const px = e.x[i] + dx * t, pz = e.z[i] + dz * t;
      const d = Math.hypot(px - x, pz - z);
      const w = e.width[i] + (e.width[i + 1] - e.width[i]) * t;
      if (d > w / 2 + BENCH_M + SLOPE_REACH_M) continue;
      out.push({ d, w, v: VERGE_M + padAt(e, i, t, x, z), y: e.y[i] + (e.y[i + 1] - e.y[i]) * t, edge: ei, arc: (i + t) * e.spacing, px, pz });
    }
    return out;
  }

  // The claims on each node: per strand (an edge, within SAME_STRAND_M of arc) the nearest point of that road to the
  // node, from every triangle that reaches into the road's drawn strip. The strip is laid as RoadMesh lays the ribbon:
  // each quad between two samples is bilinear between their cross-sections.
  const claims = new Map();
  const claim = (gi, gj, e, ei, i) => {
    const x = gi * CELL_M, z = gj * CELL_M;
    const dx = e.x[i + 1] - e.x[i], dz = e.z[i + 1] - e.z[i];
    const run = dx * dx + dz * dz;
    const t = run === 0 ? 0 : Math.max(0, Math.min(1, ((x - e.x[i]) * dx + (z - e.z[i]) * dz) / run));
    const d = Math.hypot(e.x[i] + dx * t - x, e.z[i] + dz * t - z);
    const arc = (i + t) * e.spacing;
    const key = nodeKey(gi, gj);
    let list = claims.get(key);
    if (!list) claims.set(key, (list = []));
    // One claim per strand: the same edge within SAME_STRAND_M of arc is the same piece of road (the two sides of a
    // hairpin are not, though they lie within STRAND_GAP_M)
    const held = list.find(c => c.edge === ei && Math.abs(c.arc - arc) <= SAME_STRAND_M);
    const c = { edge: ei, arc, d, v: VERGE_M + padAt(e, i, t, x, z), y: e.y[i] + (e.y[i + 1] - e.y[i]) * t, w: e.width[i] + (e.width[i + 1] - e.width[i]) * t, ride: !!e.onRide };
    if (!held) list.push(c);
    else if (d < held.d) Object.assign(held, c);
  };
  // Every point of every road's drawn strip, CLAIM_STEP_M apart, with the triangle of the 8 m grid it falls in:
  // visit(e, ei, i, t, fx, fz) with (fx, fz) the point in cells
  const strips = visit => edges.forEach((e, ei) => {
    for (let i = 0; i + 1 < e.x.length; i++) {
      if ((e.flags[i] | e.flags[i + 1]) & ROOFED) continue;
      const run = Math.hypot(e.x[i + 1] - e.x[i], e.z[i + 1] - e.z[i]);
      const ha = stripHalf(e.width[i]), hb = stripHalf(e.width[i + 1]);
      const along = Math.max(1, Math.ceil(run / CLAIM_STEP_M));
      const across = Math.max(1, Math.ceil((2 * Math.max(ha, hb)) / CLAIM_STEP_M));
      const ca = Math.cos(e.heading[i]), sa = Math.sin(e.heading[i]), cb = Math.cos(e.heading[i + 1]), sb = Math.sin(e.heading[i + 1]);
      for (let a = 0; a <= along; a++) {
        const t = a / along;
        for (let b = 0; b <= across; b++) {
          const f = (b / across) * 2 - 1;
          const xa = e.x[i] + f * ha * ca, za = e.z[i] - f * ha * sa;
          const xb = e.x[i + 1] + f * hb * cb, zb = e.z[i + 1] - f * hb * sb;
          visit(e, ei, i, t, (xa + (xb - xa) * t) / CELL_M, (za + (zb - za) * t) / CELL_M);
        }
        // A stopping place's side of the strip goes on past the usual verge, by its pad
        for (const [pad, sign] of [[e.padP, 1], [e.padN, -1]]) {
          if (!pad || !(pad[i] > 0 || pad[i + 1] > 0)) continue;
          const more = Math.max(pad[i], pad[i + 1]);
          for (let d = CLAIM_STEP_M; d < more + CLAIM_STEP_M; d += CLAIM_STEP_M) {
            const oa = sign * (ha + Math.min(d, pad[i])), ob = sign * (hb + Math.min(d, pad[i + 1]));
            const xa = e.x[i] + oa * ca, za = e.z[i] - oa * sa;
            const xb = e.x[i + 1] + ob * cb, zb = e.z[i + 1] - ob * sb;
            visit(e, ei, i, t, (xa + (xb - xa) * t) / CELL_M, (za + (zb - za) * t) / CELL_M);
          }
        }
      }
    }
  });
  // The three nodes of the triangle under (fx, fz) and the point's weights on them
  const corners = (fx, fz) => {
    const gi = Math.floor(fx), gj = Math.floor(fz);
    const u = fx - gi, v = fz - gj;
    return u + v <= 1
      ? [[gi, gj, 1 - u - v], [gi + 1, gj, u], [gi, gj + 1, v]]
      : [[gi + 1, gj + 1, u + v - 1], [gi, gj + 1, 1 - u], [gi + 1, gj, 1 - v]];
  };
  let lastTri = -1;
  strips((e, ei, i, t, fx, fz) => {
    const gi = Math.floor(fx), gj = Math.floor(fz);
    const tri = nodeKey(gi, gj) * 2 + (fx - gi + (fz - gj) > 1 ? 1 : 0);
    if (tri === lastTri) return;
    lastTri = tri;
    for (const [a, b] of corners(fx, fz)) claim(a, b, e, ei, i);
  });
  const byNear = (p, q) => p.d - q.d || p.edge - q.edge || p.arc - q.arc;
  // {y, zone} of a claimed node, or null
  const resolved = new Map();
  function claimed(gi, gj) {
    const key = nodeKey(gi, gj);
    if (resolved.has(key)) return resolved.get(key);
    const list = claims.get(key);
    let out = null;
    if (list) {
      const low = Math.min(...list.map(c => c.y));
      // The lowest road owns the node, so no land stands over any road; but under its own carriageway and verge the
      // ride owns it when it is within JOIN_M of the lowest (a junction: the side road is drawn under the ride there)
      const onOther = list.some(c => !c.ride && c.d <= c.w / 2 + c.v);
      // (past its verge only against side roads that lie under it: where one climbs over the ride's height there, the
      // node held at the ride's left that road's edge hanging over the land, 3.7 m at the Tremola's km 12.4, and a wall
      // end open beside it at the start, as the re-import of the Tremola showed)
      const besideLower = c => !list.some(o => !o.ride && o.y > c.y + RIDE_OWN_OVER_M);
      const own = list.filter(c => c.ride && c.d <= c.w / 2 + c.v + (onOther || !besideLower(c) ? 0 : RIDE_OWN_PAST_M) && c.y <= low + JOIN_M).sort(byNear);
      const lowest = [...list].sort((p, q) => p.y - q.y || byNear(p, q))[0];
      // The ride is one road across its edges: where the lowest claim is the ride, the nearest piece of the ride
      // within JOIN_M of it owns the node (two edges of the ride meet at a node at one height)
      const ride = lowest.ride ? list.filter(c => c.ride && c.y <= low + JOIN_M).sort(byNear) : [];
      const win = own[0] ?? ride[0] ?? lowest;
      const nearest = [...list].sort(byNear)[0];
      // A node nearer an upper road than the road it took its height from is a drop (the upper road's retaining wall)
      // only beyond that road's strip: on the strip it stays bench, so the drop never reaches onto the verge
      const zone = nearest.y > win.y + JOIN_M && nearest.d > stripHalf(nearest.w) + (nearest.v - VERGE_M) ? ZONE.drop : win.d <= win.w / 2 ? ZONE.road : ZONE.bench;
      // Past the road's strip (in a triangle that only reaches into it) the node is the fill at the batter down to the
      // ground, or the ground where it stands higher, but never over the road: no flat shelf, no land over the verge
      const past = win.d - (win.w / 2 + win.v);
      let y = win.y;
      if (past > 0) {
        const dem = landAt(gi * CELL_M, gj * CELL_M);
        y = Number.isNaN(dem) ? win.y : Math.min(win.y, Math.max(dem, win.y - BATTER * past));
      }
      out = { y, zone, edge: win.edge };
    }
    resolved.set(key, out);
    return out;
  }
  // Nearest-point heights are exact along a straight road (the height is linear across a triangle) but not round a
  // tight bend, where a triangle spans many metres of road and the land between its nodes rises over the road. So
  // each point of a strip whose triangle stands over the road's height there lowers the nodes of that triangle its own
  // road owns, until no point of any road stands under its own land (a few passes: lowering is monotone).
  for (let pass = 0; pass < LOWER_PASSES; pass++) {
    const need = new Map();
    strips((e, ei, i, t, fx, fz) => {
      const y = e.y[i] + (e.y[i + 1] - e.y[i]) * t;
      const nodes = corners(fx, fz).map(([a, b, w]) => [claimed(a, b), w, nodeKey(a, b)]);
      if (nodes.some(([c]) => !c)) return;
      const over = nodes.reduce((sum, [c, w]) => sum + c.y * w, 0) - y;
      if (over <= 0) return;
      for (const [c, , key] of nodes) if (c.edge === ei && (need.get(key) ?? 0) < over) need.set(key, over);
    });
    if (!need.size) break;
    for (const [key, by] of need) resolved.get(key).y -= by;
  }
  // Then each point whose land lies more than RAISE_BELOW_M under its road raises the nodes its road owns, by no more
  // than a third of the room every point of their triangles has under its own road, so no land rises over a road.
  for (let pass = 0; pass < LOWER_PASSES; pass++) {
    const room = new Map(), want = new Map();
    strips((e, ei, i, t, fx, fz) => {
      const y = e.y[i] + (e.y[i + 1] - e.y[i]) * t;
      const nodes = corners(fx, fz).map(([a, b, w]) => [claimed(a, b), w, nodeKey(a, b)]);
      if (nodes.some(([c]) => !c)) return;
      const under = y - nodes.reduce((sum, [c, w]) => sum + c.y * w, 0);
      for (const [c, , key] of nodes) {
        room.set(key, Math.min(room.get(key) ?? Infinity, under));
        if (under > RAISE_BELOW_M && c.edge === ei && (want.get(key) ?? 0) < under) want.set(key, under);
      }
    });
    let moved = 0;
    for (const [key, by] of want) {
      const step = Math.min(by, Math.max(0, room.get(key)) / 3);
      if (step > 1e-3) { resolved.get(key).y += step; moved++; }
    }
    if (!moved) break;
  }

  // The most each node under a bridge's strip may stand: the deck's surface less BRIDGE_UNDER_M (bridges only: a tunnel
  // and a gallery have their land over them)
  const decks = new Map();
  edges.forEach(e => {
    for (let i = 0; i + 1 < e.x.length; i++) {
      if (!((e.flags[i] | e.flags[i + 1]) & FLAG.bridge) || (e.flags[i] | e.flags[i + 1]) & (FLAG.tunnel | FLAG.gallery)) continue;
      const run = Math.hypot(e.x[i + 1] - e.x[i], e.z[i + 1] - e.z[i]);
      const ha = stripHalf(e.width[i]), hb = stripHalf(e.width[i + 1]);
      const along = Math.max(1, Math.ceil(run / CLAIM_STEP_M)), across = Math.max(1, Math.ceil((2 * Math.max(ha, hb)) / CLAIM_STEP_M));
      const ca = Math.cos(e.heading[i]), sa = Math.sin(e.heading[i]), cb = Math.cos(e.heading[i + 1]), sb = Math.sin(e.heading[i + 1]);
      for (let a = 0; a <= along; a++) {
        const t = a / along;
        for (let b = 0; b <= across; b++) {
          const f = (b / across) * 2 - 1;
          const xa = e.x[i] + f * ha * ca, za = e.z[i] - f * ha * sa, xb = e.x[i + 1] + f * hb * cb, zb = e.z[i + 1] - f * hb * sb;
          for (const [gi, gj] of corners((xa + (xb - xa) * t) / CELL_M, (za + (zb - za) * t) / CELL_M)) {
            // The deck's height over the node itself, along the segment, and past the deck's end the road's line carried
            // on at its grade (a node there, whose cell reaches under the deck's last metres, is the road's beyond it).
            // Held to the deck's height where the band point lay, a node 8 m on up a grade stood 0.75 m under the road
            // there, a dip at every deck's end (the Tremola's layby p5 lost 6 m to it)
            const nx = gi * CELL_M - e.x[i], nz = gj * CELL_M - e.z[i], sx = e.x[i + 1] - e.x[i], sz = e.z[i + 1] - e.z[i];
            const u = (nx * sx + nz * sz) / (run * run || 1);
            const own = e.y[i] + (e.y[i + 1] - e.y[i]) * u - BRIDGE_UNDER_M;
            const key = nodeKey(gi, gj);
            if (!(decks.get(key) <= own)) decks.set(key, own);
          }
        }
      }
    }
  });

  // Height and zone at a node of the 8 m grid: a claimed node as resolved, any other the land by distance from the roads,
  // and no higher than a bridge's deck over it
  function node(gi, gj) {
    const g = claimed(gi, gj) ?? ground(gi * CELL_M, gj * CELL_M);
    const top = decks.get(nodeKey(gi, gj));
    return top !== undefined && g.y > top ? { ...g, y: top } : g;
  }

  // Height and zone at one point, by distance from the roads (a node of the grid takes node() instead).
  function ground(x, z) {
    const dem0 = demAt(x, z);
    const pad = pads.length ? padGround(x, z, dem0) : null;
    const dem = pad ? pad.y : dem0;
    if (pad && pad.d === 0 && !candidates(x, z).some(c => c.d <= c.w / 2 + c.v)) return { y: pad.y, zone: pad.zone };
    const cands = candidates(x, z);
    if (!cands.length) return { y: dem, zone: ZONE.terrain };
    cands.sort((p, q) => p.d - q.d || p.edge - q.edge || p.arc - q.arc);
    const a = cands[0];
    if (a.d <= a.w / 2) return { y: a.y, zone: ZONE.road };
    // The earthwork: past the strip the ground, held within the batter of the road (fill under it, cut above it) out
    // to EARTHWORK_M; beyond it the ground itself
    const past = a.d - (a.w / 2 + a.v);
    const y = Number.isNaN(dem) || past <= 0 ? a.y : past > EARTHWORK_M ? dem : Math.max(a.y - past * BATTER, Math.min(a.y + past * BATTER, dem));
    if (past <= 0) return { y, zone: ZONE.bench };
    // Two strands too close and too far apart in height for the batter: a cliff face, `wall` nearer the lower road
    // and `drop` nearer the upper
    const band = a.w / 2 + BENCH_M;
    const b = cands.find(c => c.edge !== a.edge || Math.abs(c.arc - a.arc) > STRAND_GAP_M);
    if (b) {
      const sep = Math.hypot(a.px - b.px, a.pz - b.pz);
      const room = Math.max(0, sep - band - (b.w / 2 + BENCH_M));
      if (Math.abs(a.y - b.y) > room * BATTER + 1.5) return { y, zone: a.y > b.y ? ZONE.drop : ZONE.wall };
    }
    return { y, zone: ZONE.terrain };
  }

  // One 512 m tile at 8 m: 65 x 65 nodes, row-major with z as the row.
  function tile(tx, tz) {
    const heights = new Float32Array(TILE_N * TILE_N);
    const zones = new Uint8Array(TILE_N * TILE_N);
    let missing = 0;
    for (let j = 0; j < TILE_N; j++) {
      for (let i = 0; i < TILE_N; i++) {
        const x = tx * TILE_M + i * CELL_M, z = tz * TILE_M + j * CELL_M;
        const g = node(tx * (TILE_N - 1) + i, tz * (TILE_N - 1) + j);
        let zone = g.zone;
        if (zone === ZONE.terrain && coverAt(x, z) === COVER_WATER) zone = ZONE.water;
        heights[j * TILE_N + i] = g.y;
        zones[j * TILE_N + i] = zone;
        if (Number.isNaN(g.y)) missing++;
      }
    }
    if (missing) {
      const good = Array.from(heights).filter(v => !Number.isNaN(v));
      const fill = good.length ? good.reduce((p, q) => p + q, 0) / good.length : 0;
      for (let k = 0; k < heights.length; k++) if (Number.isNaN(heights[k])) heights[k] = fill;
    }
    return { heights, zones, missing };
  }

  return { tile, ground, node, claimsAt: (gi, gj) => claims.get(nodeKey(gi, gj)) ?? [] };
}
