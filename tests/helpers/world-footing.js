// Where the world draws water, and how a placed building meets the drawn land. The rule it measures: no building or
// landmark stands in drawn water, and its foot meets the ground on a slope (no corner floating over the land, no door
// sunk under it). The water is the land drawn in the water colour (js/world/terrainmesh.js TerrainMesh.colours): a
// vertex is water where its zone is water, or where it is coloured from a water cover cell, and a vertex between
// coloured ones takes their mean, so a triangle shows water where any of its three vertices does.

// The metres a foot may stand over the land, or a floor under it
export const FOOT_TOLERANCE_M = 0.3;

// Whether full-detail vertex (i, j) of a tile is drawn with water in its colour
export function wetVertex(game, tile, cover, i, j) {
    const { WorldData } = game;
    const n = WorldData.TILE_N, zones = tile.zones, water = WorldData.ZONE.water;
    const painted = (a, b) => {
        const zone = zones[b * n + a];
        if (zone === water) return true;
        if (zone !== WorldData.ZONE.terrain || !cover) return false;
        const ci = Math.min(WorldData.COVER_N - 1, Math.floor((a * WorldData.CELL_M) / 16));
        const cj = Math.min(WorldData.COVER_N - 1, Math.floor((b * WorldData.CELL_M) / 16));
        return cover[cj * WorldData.COVER_N + ci] === 7;
    };
    if (i % 2 === 0 && j % 2 === 0) return painted(i, j);
    const zone = zones[j * n + i];
    const i0 = i - (i % 2), j0 = j - (j % 2);
    const i1 = Math.min(n - 1, i0 + (i % 2 ? 2 : 0)), j1 = Math.min(n - 1, j0 + (j % 2 ? 2 : 0));
    const corners = [[i0, j0], [i1, j0], [i0, j1], [i1, j1]];
    // Coloured itself where its zone differs from the land's or from a corner's (TerrainMesh.colours)
    if (zone !== WorldData.ZONE.terrain || corners.some(([a, b]) => zones[b * n + a] !== zone)) return painted(i, j);
    return corners.some(([a, b]) => painted(a, b));
}

// Whether the drawn land at (x, z) shows water: the triangle under it (split on the 01-10 diagonal) has a wet vertex.
// null where the tile is not resident.
export function wetAt(game, data, x, z) {
    const { WorldData } = game;
    const m = WorldData.TILE_M, n = WorldData.TILE_N;
    const tx = Math.floor(x / m), tz = Math.floor(z / m);
    const key = `${tx},${tz}`;
    const tile = data.tile(key);
    if (!tile) return null;
    const fx = (x - tx * m) / WorldData.CELL_M, fz = (z - tz * m) / WorldData.CELL_M;
    const i = Math.max(0, Math.min(n - 2, Math.floor(fx))), j = Math.max(0, Math.min(n - 2, Math.floor(fz)));
    const u = fx - i, v = fz - j;
    const verts = u + v <= 1 ? [[i, j], [i + 1, j], [i, j + 1]] : [[i + 1, j + 1], [i, j + 1], [i + 1, j]];
    const cover = data.cover(key);
    return verts.some(([a, b]) => wetVertex(game, tile, cover, a, b));
}

// Points over an oriented rectangle (centre x, z; `heading` the way `along` runs; `across` square to it) every `step`
// metres, its edges and corners included
export function rectSamples(x, z, heading, along, across, step = 1) {
    const fx = Math.sin(heading), fz = Math.cos(heading), lx = Math.cos(heading), lz = -Math.sin(heading);
    const na = Math.max(1, Math.ceil(along / step)), nc = Math.max(1, Math.ceil(across / step));
    const out = [];
    for (let a = 0; a <= na; a++) for (let c = 0; c <= nc; c++) {
        const p = (a / na - 0.5) * along, q = (c / nc - 0.5) * across;
        out.push([x + p * fx + q * lx, z + p * fz + q * lz]);
    }
    return out;
}

export function rectCorners(x, z, heading, along, across) {
    const fx = Math.sin(heading), fz = Math.cos(heading), lx = Math.cos(heading), lz = -Math.sin(heading);
    return [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, c]) => [x + (a * along / 2) * fx + (c * across / 2) * lx, z + (a * along / 2) * fz + (c * across / 2) * lz]);
}

// The rectangle round a set of plan points that share one turn (the corners of a building's parts): the turn is read
// from the first part's edge
function rectOf(polys) {
    const [a, b] = polys[0];
    const heading = Math.atan2(b[0] - a[0], b[1] - a[1]);
    const fx = Math.sin(heading), fz = Math.cos(heading), lx = Math.cos(heading), lz = -Math.sin(heading);
    let p0 = Infinity, p1 = -Infinity, q0 = Infinity, q1 = -Infinity;
    for (const poly of polys) for (const [x, z] of poly) {
        const p = x * fx + z * fz, q = x * lx + z * lz;
        p0 = Math.min(p0, p); p1 = Math.max(p1, p); q0 = Math.min(q0, q); q1 = Math.max(q1, q);
    }
    const pc = (p0 + p1) / 2, qc = (q0 + q1) / 2;
    return { x: pc * fx + qc * lx, z: pc * fz + qc * lz, heading, along: p1 - p0, across: q1 - q0 };
}

// The buildings of a set of gathered things (tests/helpers/world-clearance.js sceneryOf, one entry per part and
// instance): [{type, name, x, z, heading, along, across, floor, foot, base}]. A house's parts share their mesh name and
// instance index in a tile, a landmark's its name. `floor` is the height of the model's y 0 (its door sill: the
// lowest of its parts plus `plinthOf(name)`, the plinth its model draws under y 0). A footing (a mesh named
// houses:footing, or <landmark>:footing) holding the building's middle is what meets the land: `foot` is its bottom
// and `base` its rectangle; with none they are the body's own.
export function buildingsOf(things, { plinthOf = () => 0 } = {}) {
    const groups = new Map();
    const footings = [];
    for (const t of things) {
        if (t.type !== 'house' && t.type !== 'landmark') continue;
        if (t.name === 'houses:footing' || t.name.endsWith(':footing')) { footings.push(t); continue; }
        const key = t.type === 'landmark' ? t.name : `${t.tile}|${t.name}|${t.index}`;
        const g = groups.get(key) || { type: t.type, name: t.name, polys: [], low: Infinity, high: -Infinity };
        g.polys.push(t.poly);
        g.low = Math.min(g.low, t.y0);
        g.high = Math.max(g.high, t.y1);
        groups.set(key, g);
    }
    const inside = (r, x, z) => {
        const dx = x - r.x, dz = z - r.z;
        return Math.abs(dx * Math.sin(r.heading) + dz * Math.cos(r.heading)) <= r.along / 2 + 0.01 && Math.abs(dx * Math.cos(r.heading) - dz * Math.sin(r.heading)) <= r.across / 2 + 0.01;
    };
    const out = [];
    for (const g of groups.values()) {
        const r = rectOf(g.polys);
        const under = footings.filter(f => inside(r, f.x, f.z)).sort((p, q) => Math.hypot(p.x - r.x, p.z - r.z) - Math.hypot(q.x - r.x, q.z - r.z));
        const footing = under[0] || null;
        if (footing) footing.owned = true;
        const base = footing ? rectOf([footing.poly]) : r;
        out.push({ type: g.type, name: g.name, ...r, floor: g.low + plinthOf(g.name, g.high - g.low), foot: footing ? Math.min(g.low, footing.y0) : g.low, footTop: footing ? footing.y1 : null, footing: !!footing, base });
    }
    // A footing no building stands on (left behind where its house was left out)
    out.orphans = footings.filter(f => !f.owned).map(f => ({ name: f.name, x: Math.round(f.x * 10) / 10, z: Math.round(f.z * 10) / 10 }));
    return out;
}

// Each building measured against the drawn land: `wet` whether any of its plan (1 m samples, the eaves included)
// stands on drawn water, `float` the most a corner of what meets the land (its footing, else its body) stands over
// the land, `buried` the most the land stands over its floor at a corner of the same.
export function auditFooting(game, data, ground, buildings, { tolerance = FOOT_TOLERANCE_M } = {}) {
    return buildings.map((b) => {
        const samples = rectSamples(b.x, b.z, b.heading, b.along, b.across, 1);
        let wet = 0, known = 0;
        for (const [x, z] of samples) {
            const w = wetAt(game, data, x, z);
            if (w === null) continue;
            known++;
            if (w) wet++;
        }
        let float = -Infinity, buried = -Infinity;
        for (const [x, z] of rectCorners(b.base.x, b.base.z, b.base.heading, b.base.along, b.base.across)) {
            const g = ground.tileHeight(x, z);
            if (g === null) continue;
            float = Math.max(float, b.foot - g);
            buried = Math.max(buried, g - b.floor);
        }
        // A footing reaches up into the walls: no gap between its top and the floor
        const gap = b.footTop === null ? 0 : b.floor - b.footTop;
        const round = v => Math.round(v * 100) / 100;
        return { type: b.type, name: b.name, x: round(b.x), z: round(b.z), wetShare: known ? round(wet / known) : null, wet: wet > 0, floatM: round(float), buriedM: round(buried), floats: float > tolerance, buries: buried > tolerance, footing: b.footing, gapM: round(gap) };
    });
}

// The plinth each village model draws under its y 0 (the depth of its lowest part under y 0 in its .glb), by the mesh
// name the world gives it: houses:<node> and landmark:<name> (landmarks.json gives the asset), scaled as the model is
// drawn (`drawn`, its drawn height, against its height in the file). A hut or a wall block has none.
export function modelPlinths(readFileSync, root) {
    const lowest = (file, pick, top = false) => {
        const bytes = readFileSync(new URL(file, root));
        const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
        const out = new Map();
        for (const node of json.nodes) {
            if (node.mesh === undefined || !node.name || node.name.includes(':') || !pick(node.name)) continue;
            const k = node.scale ? node.scale[1] : 1, t = node.translation ? node.translation[1] : 0;
            const prims = json.meshes[node.mesh].primitives.map(p => json.accessors[p.attributes.POSITION]);
            const low = Math.min(...prims.map(a => a.min[1] * k + t)), high = Math.max(...prims.map(a => a.max[1] * k + t));
            const held = out.get(node.name);
            out.set(node.name, held ? { low: Math.min(held.low, low), high: Math.max(held.high, high) } : { low, high });
        }
        return out;
    };
    const plinths = new Map();
    for (const [name, b] of lowest('assets/village/houses.glb', n => n.startsWith('house_'))) plinths.set(`houses:${name}`, b);
    for (const l of JSON.parse(readFileSync(new URL('tools/world/landmarks.json', root), 'utf8'))) {
        if (!/\.glb$/.test(l.asset)) continue;
        const all = [...lowest(l.asset, () => true).values()];
        plinths.set(`landmark:${l.name}`, { low: Math.min(...all.map(b => b.low)), high: Math.max(...all.map(b => b.high)) });
    }
    return (name, drawn) => {
        const b = plinths.get(name);
        return b ? Math.max(0, -b.low) * (drawn / (b.high - b.low)) : 0;
    };
}
