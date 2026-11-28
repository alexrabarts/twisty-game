// The dams the tour's worlds show, from swissTLM3D (tlm_bauten_staubaute: Staumauer, a concrete wall, and Staudamm,
// an embankment), into js/world/dam-data.js: each dam's plan as two chains of the footprint's outline, the upstream
// one (its face on the water: the chain nearer the lake's shore, tlm_gewaesser_stehendes_gewaesser) and the downstream
// one (the face's foot on the ground, with the ground's height), sampled in rows across the dam; its crest height (the
// highest of the outline's heights in its middle and of a road on it, kunstbaute "Staumauer, Wehr"); its kind (an
// arch, a gravity wall or an embankment) by rule. Reads no world's tiles, so a re-import of the land does not stale it.
//   node tools/dams/extract.mjs [--out js/world/dam-data.js] [--only <id,id>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GeoPackage } from '../world/gpkg.mjs';
import { resolveCacheDir } from '../world/cache.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const TILE_M = 512;

// The rule. A Staumauer is an arch when its crest line bows (sagitta over chord) by `archBent` or more, or by `archBow`
// or more with a footprint thin for its height (`archThin`: base over height); otherwise a gravity wall. Rows every `rowM` along the crest
export const RULE = Object.freeze({ archBow: 0.06, archBent: 0.15, archThin: 0.45, rowM: 4, minRows: 6, shoreM: 400, freeM: 1.5, topM: 6 });

const local = (p, origin) => [p[0] - origin.e0, -(p[1] - origin.n0), p[2]];

// The ring split at its two ends along its long axis into two chains, each from end A to end B
export function chains(ring) {
  const pts = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring.slice();
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cz = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  let sxx = 0, szz = 0, sxz = 0;
  for (const p of pts) { const dx = p[0] - cx, dz = p[1] - cz; sxx += dx * dx; szz += dz * dz; sxz += dx * dz; }
  const angle = 0.5 * Math.atan2(2 * sxz, sxx - szz), ax = Math.cos(angle), az = Math.sin(angle);
  const proj = p => (p[0] - cx) * ax + (p[1] - cz) * az;
  let a = 0, b = 0;
  pts.forEach((p, i) => { if (proj(p) < proj(pts[a])) a = i; if (proj(p) > proj(pts[b])) b = i; });
  const walk = (from, to, step) => { const out = []; for (let i = from; ; i = (i + step + pts.length) % pts.length) { out.push(pts[i]); if (i === to) break; } return out; };
  return [walk(a, b, 1), walk(a, b, -1)];
}

const lengthOf = chain => { let l = 0; for (let i = 1; i < chain.length; i++) l += Math.hypot(chain[i][0] - chain[i - 1][0], chain[i][1] - chain[i - 1][1]); return l; };

// A chain at `n` points, evenly by its own length
export function resample(chain, n) {
  const total = lengthOf(chain), out = [];
  let i = 0, run = 0;
  for (let k = 0; k < n; k++) {
    const want = (total * k) / (n - 1);
    while (i < chain.length - 2 && run + Math.hypot(chain[i + 1][0] - chain[i][0], chain[i + 1][1] - chain[i][1]) < want) { run += Math.hypot(chain[i + 1][0] - chain[i][0], chain[i + 1][1] - chain[i][1]); i++; }
    const seg = Math.hypot(chain[i + 1][0] - chain[i][0], chain[i + 1][1] - chain[i][1]) || 1, t = Math.max(0, Math.min(1, (want - run) / seg));
    out.push([0, 1, 2].map(c => chain[i][c] + (chain[i + 1][c] - chain[i][c]) * t));
  }
  return out;
}

// The downstream chain's point across from each upstream row: the chain's nearest point to it, no farther back along
// the chain than the row before's, so two rows never cross; its height is the chain's own there
export function across(up, chain) {
  const dense = resample(chain, Math.max(up.length * 8, chain.length * 2));
  let from = 0;
  return up.map(p => {
    let best = from, bestD = Infinity;
    for (let i = from; i < dense.length; i++) {
      const d = Math.hypot(dense[i][0] - p[0], dense[i][1] - p[1]);
      if (d < bestD) { bestD = d; best = i; }
    }
    from = best;
    return dense[best].slice();
  });
}

const nearest = (p, pts) => { let best = Infinity; for (const q of pts) best = Math.min(best, Math.hypot(p[0] - q[0], p[1] - q[1])); return best; };
const inside = (p, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c; } return c; };

// One dam from its row: the chains in local metres, the upstream one first
export function damOf(row, origin, shore, roads) {
  const ring = row.geom.coordinates[0].map(p => local(p, origin));
  let [one, two] = chains(ring);
  const near = ch => ch.reduce((a, p) => a + nearest(p, shore), 0) / ch.length;
  const high = ch => ch.reduce((a, p) => a + p[2], 0) / ch.length;
  // (the chain nearer the shore holds the water; with no shore in reach, the higher chain: the downstream foot is low)
  const upFirst = shore.length ? near(one) <= near(two) : high(one) >= high(two);
  if (!upFirst) [one, two] = [two, one];
  const crestLen = (lengthOf(one) + lengthOf(two)) / 2;
  const n = Math.max(RULE.minRows, Math.round(crestLen / RULE.rowM) + 1);
  const up = resample(one, n), down = across(up, two);
  // (the two chains meet at the ends: there the dam is as wide as its crest)
  down[0] = up[0].slice();
  down[n - 1] = up[n - 1].slice();
  // (a road on the dam: its points inside the footprint)
  const onDam = [];
  for (const r of roads) for (const p of r.points) if (inside(p, ring)) onDam.push({ x: p[0], z: p[1], y: p[2], cls: r.cls });
  const zs = ring.map(p => p[2]).sort((a, b) => a - b);
  const middle = up.slice(Math.floor(n * 0.2), Math.ceil(n * 0.8)).concat(down.slice(Math.floor(n * 0.2), Math.ceil(n * 0.8)));
  // (the upstream chain lies on the water line: its median height is the reservoir's level; a crest the outline puts
  // at the water stands `freeM` over it, or as high as the outline's highest point within `topM` of the water)
  const ups = up.map(p => p[2]).sort((x, y) => x - y), water = ups[Math.floor(ups.length / 2)];
  const crest = Math.max(...middle.map(p => p[2]), ...onDam.map(p => p.y), water + RULE.freeM, Math.min(zs[zs.length - 1], water + RULE.topM));
  const base = zs[0], height = crest - base;
  const thick = Math.max(...up.map((p, k) => Math.hypot(p[0] - down[k][0], p[1] - down[k][1])));
  // (the bow: the mid point of the crest's line off the chord between its ends)
  const mid = up.map((p, k) => [(p[0] + down[k][0]) / 2, (p[1] + down[k][1]) / 2]), a = mid[0], b = mid[mid.length - 1];
  const chord = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const sag = Math.max(...mid.map(p => Math.abs(((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) / chord)));
  const bow = sag / chord;
  const kind = row.objektart === 'Staudamm' ? 'embankment' : bow >= RULE.archBent || (bow >= RULE.archBow && thick / Math.max(1, height) <= RULE.archThin) ? 'arch' : 'gravity';
  const r1 = v => Math.round(v * 10) / 10;
  return {
    id: row.uuid ? row.uuid.replace(/[{}]/g, '').slice(0, 8) : String(row.id), name: row.name || null, kind,
    crest: r1(crest), water: r1(water), base: r1(base), height: r1(height), length: r1(crestLen), thick: r1(thick), bow: Math.round((sag / chord) * 1000) / 1000,
    road: onDam.length ? { y: r1(Math.max(...onDam.map(p => p.y))), cls: onDam[0].cls } : null,
    up: up.map(p => p.map(r1)), down: down.map(p => p.map(r1))
  };
}

// Two outlines of one dam (the same name, within 100 m: swissTLM3D draws some as the crest's outline and the face's
// apart) are one dam: the one that stands highest over its base, with the higher crest and the road of either
export function merged(dams) {
  const out = [];
  const centre = d => [d.up.concat(d.down).reduce((a, p) => a + p[0], 0) / (d.up.length * 2), d.up.concat(d.down).reduce((a, p) => a + p[1], 0) / (d.up.length * 2)];
  for (const d of dams.slice().sort((a, b) => b.height - a.height)) {
    const twin = d.name && out.find(o => o.name === d.name && Math.hypot(centre(o)[0] - centre(d)[0], centre(o)[1] - centre(d)[1]) < 100);
    if (!twin) { out.push({ ...d }); continue; }
    twin.crest = Math.max(twin.crest, d.crest);
    twin.height = Math.round((twin.crest - twin.base) * 10) / 10;
    twin.road = twin.road || d.road;
    twin.merged = (twin.merged || []).concat(d.id);
  }
  return out;
}

export function extract({ gpkgFile, repoRoot = ROOT, only = null } = {}) {
  const g = new GeoPackage(gpkgFile);
  const tour = fs.readFileSync(path.join(repoRoot, 'js/world/tour.js'), 'utf8');
  const folders = [...new Set([...tour.matchAll(/folder: '([^']+)'/g)].map(m => m[1]))];
  const out = {};
  for (const folder of folders) {
    const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, folder, 'manifest.json'), 'utf8'));
    const origin = manifest.origin, set = new Set(manifest.tiles.height.map(t => t.join(',')));
    const xs = manifest.tiles.height.map(t => t[0]), zs = manifest.tiles.height.map(t => t[1]);
    const bbox = [origin.e0 + Math.min(...xs) * TILE_M, origin.n0 - (Math.max(...zs) + 1) * TILE_M, origin.e0 + (Math.max(...xs) + 1) * TILE_M, origin.n0 - Math.min(...zs) * TILE_M];
    const dams = [];
    for (const row of g.query('tlm_bauten_staubaute', bbox, { where: "objektart in ('Staumauer','Staudamm')" })) {
      const ring = row.geom.coordinates[0].map(p => local(p, origin));
      // (a dam the world draws: every point of its outline on a height tile)
      if (!ring.every(p => set.has(`${Math.floor(p[0] / TILE_M)},${Math.floor(p[1] / TILE_M)}`))) continue;
      const e = row.geom.coordinates[0].map(p => p[0]), n = row.geom.coordinates[0].map(p => p[1]);
      const box = [Math.min(...e) - RULE.shoreM, Math.min(...n) - RULE.shoreM, Math.max(...e) + RULE.shoreM, Math.max(...n) + RULE.shoreM];
      const shore = [];
      for (const l of g.query('tlm_gewaesser_stehendes_gewaesser', box)) {
        const flat = c => (typeof c[0] === 'number' ? [c] : c.flatMap(flat));
        for (const p of flat(l.geom.coordinates)) shore.push(local(p, origin));
      }
      const roads = g.query('tlm_strassen_strasse', [Math.min(...e), Math.min(...n), Math.max(...e), Math.max(...n)], { where: "kunstbaute like 'Stau%'" })
        .map(r => ({ cls: r.objektart, points: (typeof r.geom.coordinates[0][0] === 'number' ? r.geom.coordinates : r.geom.coordinates.flat()).map(p => local(p, origin)) }));
      dams.push(damOf(row, origin, shore, roads));
    }
    out[folder] = merged(dams).filter(d => !only || only.includes(d.id)).sort((a, b) => a.id.localeCompare(b.id));
  }
  g.close();
  return out;
}

export function moduleText(table) {
  const body = Object.entries(table).map(([folder, dams]) => `    '${folder}': [\n${dams.map(d => `        ${JSON.stringify(d)}`).join(',\n')}\n    ]`).join(',\n');
  return `// The dams of each shipped world folder (js/world/dams.js), written by tools/dams/extract.mjs from swissTLM3D 2026-02:
// each dam's upstream and downstream chains in rows [x, z, y] (the outline's own heights), its crest height, its kind.
// Do not edit by hand: run the tool again
const WorldDamData = Object.freeze({
${body}
});

if (typeof module !== 'undefined') module.exports = WorldDamData;
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const at = process.argv.indexOf('--out');
  const file = path.resolve(ROOT, at > 0 ? process.argv[at + 1] : 'js/world/dam-data.js');
  const gpkgFile = path.join(resolveCacheDir(), 'tlm', 'SWISSTLM3D_2026_LV95_LN02.gpkg');
  const pick = process.argv.indexOf('--only');
  const table = extract({ gpkgFile, only: pick > 0 ? process.argv[pick + 1].split(',') : null });
  fs.writeFileSync(file, moduleText(table));
  for (const [folder, dams] of Object.entries(table)) for (const d of dams) console.log(folder, d.id, d.name, d.kind, `crest ${d.crest} height ${d.height} length ${d.length} thick ${d.thick} bow ${d.bow}`, d.road ? `road ${d.road.cls} ${d.road.y}` : '');
}
