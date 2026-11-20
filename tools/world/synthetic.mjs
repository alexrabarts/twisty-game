// The synthetic source for `import.mjs --synthetic`: a made-up mountain road of three 2 km stages with the features
// the tests and the board contract need, run through the same pipeline as the real data. Nothing here is random.
//   stage 1: a 20 degree kink at R = 20 m and a 180 degree hairpin at R = 10 m, and a car park beside the first straight
//   stage 2: a stacked switchback pair, the legs 25 m apart (hairpins at R = 12.5 m)
//   stage 3: a four-way junction, a 120 m tunnel and gentle bends
const STEP_M = 3;
const STAGE_M = 2000;

class Turtle {
  constructor() { this.x = 0; this.z = 0; this.h = 0; this.pts = [[0, 0]]; this.arc = 0; }

  straight(length) {
    const n = Math.max(1, Math.round(length / STEP_M));
    for (let i = 0; i < n; i++) this.advance(length / n, 0);
    return this;
  }

  // Turns by `deg` degrees at `radius`; positive turns toward +x when heading along +z.
  arcTurn(radius, deg) {
    const sweep = (Math.abs(deg) * Math.PI) / 180;
    const length = radius * sweep;
    const n = Math.max(2, Math.round(length / STEP_M));
    for (let i = 0; i < n; i++) this.advance(length / n, (Math.sign(deg) * sweep) / n);
    return this;
  }

  advance(length, turn) {
    this.h += turn / 2;
    this.x += length * Math.sin(this.h);
    this.z += length * Math.cos(this.h);
    this.h += turn / 2;
    this.arc += length;
    this.pts.push([this.x, this.z]);
  }
}

// The terrain: a climbing slope with swell, smooth so that the bench has something to cut into.
export const syntheticDem = (x, z) => 1500 + 0.06 * z + 12 * Math.sin(x / 70) * Math.cos(z / 110);
// The road climbs along its length on top of the ground, so stacked legs sit at different heights.
const roadHeight = (x, z, arc) => syntheticDem(x, z) + 0.04 * arc + 1.5;

const cumulative = pts => { const c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return c; };

export function syntheticSource() {
  const t = new Turtle();
  // stage 1
  t.straight(600).arcTurn(20, 20).straight(500).arcTurn(10, 180).straight(600);
  t.straight(STAGE_M - t.arc);
  // stage 2: two hairpins joined by a 140 m leg
  t.straight(300).arcTurn(12.5, 180).straight(140).arcTurn(12.5, -180).straight(500).arcTurn(40, -60).straight(400);
  t.straight(2 * STAGE_M - t.arc);
  // stage 3
  t.straight(300);
  const junctionAt = t.pts.length - 1;
  t.straight(300).arcTurn(60, 45).straight(200);
  const tunnelFrom = t.pts.length - 1;
  t.straight(120);
  const tunnelTo = t.pts.length - 1;
  t.arcTurn(80, -50).straight(300);
  t.straight(3 * STAGE_M - t.arc);

  const cum = cumulative(t.pts);
  const withZ = (pts, from = 0) => pts.map(([x, z], i) => [x, z, roadHeight(x, z, cum[from + i])]);
  const slice = (a, b) => withZ(t.pts.slice(a, b + 1), a);
  const base = { drivable: 'Wahr', traffic: 'Durchgangsstrasse', surface: 'Hart', hasZ: true };
  const [jx, jz] = t.pts[junctionAt];
  const side = (fid, name, cls, dx, dz, length) => {
    const n = Math.round(length / STEP_M);
    const pts = [];
    for (let i = 0; i <= n; i++) { const x = jx + (dx * i * STEP_M), z = jz + (dz * i * STEP_M); pts.push([x, z, syntheticDem(x, z) + 1.5]); }
    return { ...base, id: fid, fid, cls, structure: null, name, traffic: 'Verbindungsstrasse', pts };
  };
  const edges = [
    { ...base, id: 0, fid: 0, cls: '6m Strasse', structure: null, name: 'Passstrasse', pts: slice(0, junctionAt) },
    { ...base, id: 1, fid: 1, cls: '6m Strasse', structure: null, name: 'Passstrasse', pts: slice(junctionAt, tunnelFrom) },
    { ...base, id: 2, fid: 2, cls: '6m Strasse', structure: 'Tunnel', name: 'Passstrasse', pts: slice(tunnelFrom, tunnelTo) },
    { ...base, id: 3, fid: 3, cls: '6m Strasse', structure: null, name: 'Passstrasse', pts: slice(tunnelTo, t.pts.length - 1) },
    side(4, 'Seitenstrasse', '4m Strasse', -1, 0, 240),
    side(5, 'Alpweg', '3m Strasse', 0.8, -0.6, 150)
  ];

  const at = s => t.pts[Math.max(0, cum.findIndex(c => c >= s))];
  const stages = [1, 2, 3].map(k => {
    const from = at((k - 1) * STAGE_M), to = k === 3 ? t.pts[t.pts.length - 1] : at(k * STAGE_M);
    return { id: `mini-${k}`, name: `Mini ${k}`, waypoints: [{ id: 2 * k, name: `Mini ${k} start`, e: from[0], n: from[1] }, { id: 2 * k + 1, name: `Mini ${k} end`, e: to[0], n: to[1] }] };
  });
  const xs = t.pts.map(p => p[0]), zs = t.pts.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const rect = (cls, x0, z0, x1, z1) => ({ cls, rings: [[[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]]] });
  return {
    origin: { e0: 0, n0: 0 },
    credit: 'synthetic test data',
    sources: { tlm: 'synthetic', alti3d: [] },
    keptRoadClasses: ['3m Strasse', '4m Strasse', '6m Strasse'],
    stages,
    edges,
    demAt: syntheticDem,
    prepare: async () => {},
    coverPolys: () => [rect(3, minX - 400, minZ - 300, minX - 100, maxZ), rect(1, (minX + maxX) / 2 - 80, minZ, (minX + maxX) / 2 + 200, (minZ + maxZ) / 2), rect(7, maxX + 60, minZ, maxX + 300, minZ + 500)],
    buildings: samples => [40, 90, 140].map((k, i) => ({ x: samples.x[k] + 35, z: samples.z[k], w: 8 + i, d: 12, heading: 0.3 * i, h: 7, kind: 1 })),
    // A car park along the first straight, on the rider's right: 40 m long, from inside the drawn road to 9 m out
    areas: () => [{ cls: 'Oeffentliches Parkplatzareal', name: null, ring: [[-9, 300], [-3.5, 300], [-3.5, 340], [-9, 340], [-9, 300]] }, { cls: 'Verkehrsflaeche', name: null, ring: [[3.5, 100], [9, 100], [9, 140], [3.5, 140], [3.5, 100]] }],
    landmarks: []
  };
}
