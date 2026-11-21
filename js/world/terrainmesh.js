// TerrainMesh: one 512 m height tile as a vertex-coloured mesh.
//   LOD0: a vertex every 8 m  (64 x 64 cells, 8 192 triangles) within 700 m
//   LOD1: every 16 m          (2 048 triangles) to 2 km
//   LOD2: every 32 m          (512 triangles) beyond
// The land is watertight: two tiles draw their shared edge from the same nodes
// at the same LOD (a vertex reads the nodes of the neighbouring tile across the
// edge), and a skirt hangs from every tile edge down to the lowest the edge is
// drawn at any LOD, so the step between two tiles of different detail is closed. Colours come from the land cover
// class (16 m cells), the slope, facing and height (LandShade) and the tile's zone
// layer: the carved road and bench are bare ground, a wall or drop is rock.
class TerrainMesh {
    static get SKIRT_M() { return 3; }

    // Metres the carved road and bench are drawn under the height the physics reads, so the ribbon always wins the depth test over it
    static get SINK_M() { return 0.12; }

    // Land cover classes (tools/world/landcover.mjs COVER)
    static get COVER_COLORS() {
        // Made once: this is read for every vertex of every tile
        if (!TerrainMesh.coverColors) TerrainMesh.coverColors = TerrainMesh.makeCoverColors();
        return TerrainMesh.coverColors;
    }

    static makeCoverColors() {
        const p = LandShade.PALETTE;
        return [p.grass, p.forest, p.openForest, p.rock, p.scree, p.grass, p.snow, p.water, p.settlement];
    }

    static get BARE() { return LandShade.PALETTE.bare; }
    static get ROCK() { return LandShade.PALETTE.rock; }
    static get SNOW() { return LandShade.PALETTE.snow; }

    static material() {
        if (!TerrainMesh.sharedMaterial) TerrainMesh.sharedMaterial = LandShade.patch(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), { detail: true });
        return TerrainMesh.sharedMaterial;
    }

    // A node the importer carved for a road (road, bench), or a drop node that took a lower road's height under the
    // upper road's strip (tools/world/bench.mjs): drawn SINK_M under its height
    static carved(zone) {
        const zones = WorldData.ZONE;
        return zone === zones.road || zone === zones.bench || zone === zones.drop;
    }

    // The tile and its eight neighbours as `near(key)` gives them now (null where one is not resident): the ring
    // TerrainMesh.node reads, made once for a build or a vertex rather than once for every node
    static ring(tile, near) {
        const tiles = new Array(9);
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) tiles[(dz + 1) * 3 + dx + 1] = dx || dz ? near(`${tile.tx + dx},${tile.tz + dz}`) : tile;
        return { ring: true, tile, tiles };
    }

    // The node (i, j) of a tile, i and j up to one tile beyond its edges: {h, zone}. A node on an edge or a corner is
    // held by two or four tiles, each file with its own copy; it is read from the resident one with the highest tx,
    // then tz, so every tile reads one copy of each node. `near` is a function key -> resident tile or null, or a
    // ring (TerrainMesh.ring); without it the node is the nearest of the tile's own.
    static node(tile, i, j, near = null, out = {}) {
        const n = WorldData.TILE_N, last = n - 1;
        if (!near || (i > 0 && j > 0 && i < last && j < last)) {
            const a = Math.max(0, Math.min(last, i)), b = Math.max(0, Math.min(last, j));
            out.h = tile.heights[b * n + a];
            out.zone = tile.zones[b * n + a];
            return out;
        }
        const ring = near.ring ? near : TerrainMesh.ring(tile, near);
        // Along each axis the tile first tried and the one after it: a node on the shared edge is read from the tile
        // with the higher index, one beyond the edge from the neighbour, and without either from the tile's own
        const px = i > last ? 1 : i === last ? 1 : i > 0 ? 0 : i === 0 ? 0 : -1;
        const pa = i > last ? i - last : i === last ? 0 : i >= 0 ? i : i + last;
        const fx = i >= last ? 0 : i <= 0 ? (i === 0 ? -1 : 0) : 2, fa = i >= last ? last : i === 0 ? last : 0;
        const pz = j > last ? 1 : j === last ? 1 : j > 0 ? 0 : j === 0 ? 0 : -1;
        const pb = j > last ? j - last : j === last ? 0 : j >= 0 ? j : j + last;
        const fz = j >= last ? 0 : j <= 0 ? (j === 0 ? -1 : 0) : 2, fb = j >= last ? last : j === 0 ? last : 0;
        const tiles = ring.tiles;
        for (let c = 0; c < 4; c++) {
            const dx = c < 2 ? px : fx, a = c < 2 ? pa : fa, dz = c % 2 ? fz : pz, b = c % 2 ? fb : pb;
            if (dx === 2 || dz === 2) continue;
            const t = tiles[(dz + 1) * 3 + dx + 1];
            if (!t) continue;
            out.h = t.heights[b * n + a];
            out.zone = t.zones[b * n + a];
            return out;
        }
        out.h = tile.heights[Math.max(0, Math.min(last, j)) * n + Math.max(0, Math.min(last, i))];
        out.zone = tile.zones[Math.max(0, Math.min(last, j)) * n + Math.max(0, Math.min(last, i))];
        return out;
    }

    // The height a vertex (i, j) of a tile is drawn at, at an LOD. A carved node is drawn SINK_M under the tile's height.
    // At a coarser LOD a vertex stands for the nodes round it, and a coarse triangle that reached from a cut slope over
    // a road would stand over the road: a vertex is held no higher than the lowest carved node within one stride, the
    // neighbouring tile's included (`near`, TerrainMesh.node), so a vertex on a shared edge is the same in both tiles
    // (WorldEnvironment.edgeFoot reads the same heights, so the edge works meet the land drawn at any LOD).
    static vertexY(tile, lod, i, j, near = null) {
        const last = WorldData.TILE_N - 1;
        // A ring is made only for a vertex whose window reaches an edge
        if (near && !near.ring && (i <= (1 << lod) || j <= (1 << lod) || i >= last - (1 << lod) || j >= last - (1 << lod))) near = TerrainMesh.ring(tile, near);
        const own = TerrainMesh.node(tile, i, j, near, TerrainMesh.scratch || (TerrainMesh.scratch = {}));
        let y = TerrainMesh.carved(own.zone) ? own.h - TerrainMesh.SINK_M : own.h;
        if (lod === 0) return y;
        const stride = 1 << lod, n = WorldData.TILE_N;
        // A window inside the tile (or with no neighbour to read) is read from the tile's own arrays
        if (!near || (i - stride > 0 && j - stride > 0 && i + stride < last && j + stride < last)) {
            const zones = tile.zones, heights = tile.heights, zr = WorldData.ZONE;
            for (let b = Math.max(0, j - stride); b <= Math.min(last, j + stride); b++) {
                for (let a = Math.max(0, i - stride); a <= Math.min(last, i + stride); a++) {
                    const z = zones[b * n + a];
                    if ((z === zr.road || z === zr.bench || z === zr.drop) && heights[b * n + a] - TerrainMesh.SINK_M < y) y = heights[b * n + a] - TerrainMesh.SINK_M;
                }
            }
            return y;
        }
        const q = TerrainMesh.scratchQ || (TerrainMesh.scratchQ = {});
        for (let b = j - stride; b <= j + stride; b++) {
            for (let a = i - stride; a <= i + stride; a++) {
                TerrainMesh.node(tile, a, b, near, q);
                if (TerrainMesh.carved(q.zone)) y = Math.min(y, q.h - TerrainMesh.SINK_M);
            }
        }
        return y;
    }

    // How far the skirt hangs under edge vertex k (in nodes along the edge `edge(k)` -> [i, j]) of a tile drawn at
    // `lod`: down to the lowest the edge is drawn at any LOD between its two neighbouring vertices (a neighbour tile
    // draws its side of the edge at its own LOD, from the same nodes), and SKIRT_M at least
    static skirtDepth(tile, lod, k, edge, near, y, memo = null) {
        const last = WorldData.TILE_N - 1, own = 1 << lod;
        let low = y - TerrainMesh.SKIRT_M;
        for (let l = 0; l <= 2; l++) {
            const step = 1 << l;
            const from = Math.max(0, Math.floor((k - own) / step) * step), to = Math.min(last, Math.ceil((k + own) / step) * step);
            for (let m = from; m <= to; m += step) {
                const [i, j] = edge(m);
                const key = (l * 128 + i) * 128 + j;
                let v = memo ? memo.get(key) : undefined;
                if (v === undefined) { v = TerrainMesh.vertexY(tile, l, i, j, near); if (memo) memo.set(key, v); }
                low = Math.min(low, v - 0.5);
            }
        }
        return y - low;
    }

    // Triangles of a tile at an LOD, skirts included
    static triangles(lod) {
        const cells = 64 >> lod;
        return cells * cells * 2 + cells * 4 * 2;
    }

    // The colour of vertex (i, j) at height y. `slope` is 1 - normal.y, `north` how far the ground faces north
    // (-1 to 1), (x, z) the vertex in world metres for the noise. Writes into `out` when given.
    static colorAt(tile, cover, i, j, y, slope = 0, north = 0, x = 0, z = 0, out = [0, 0, 0]) {
        const n = WorldData.TILE_N;
        const zone = tile.zones[j * n + i];
        const zones = WorldData.ZONE;
        const set = c => { out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; return out; };
        // The road's own cells show only past the ribbon's edge, and a bench is the cut and fill beside it: both are
        // grassed verges with worn ground, not a bare band wider than the road
        if (zone === zones.road || zone === zones.bench) return LandShade.mix(LandShade.grass(x, z, y, out), TerrainMesh.BARE, zone === zones.road ? 0.6 : 0.35, out);
        if (zone === zones.wall || zone === zones.drop) return set(TerrainMesh.ROCK);
        if (zone === zones.water) return set(TerrainMesh.COVER_COLORS[7]);
        let cls = 5;
        if (cover) {
            const ci = Math.min(WorldData.COVER_N - 1, Math.floor((i * WorldData.CELL_M) / 16));
            const cj = Math.min(WorldData.COVER_N - 1, Math.floor((j * WorldData.CELL_M) / 16));
            cls = cover[cj * WorldData.COVER_N + ci] || 5;
        }
        if (cls === 5) LandShade.grass(x, z, y, out);
        else set(TerrainMesh.COVER_COLORS[cls] || TerrainMesh.COVER_COLORS[5]);
        // Forest holds on steeper ground than grass does; glacier and water keep their own colour
        if (cls !== 6 && cls !== 7) LandShade.weather(out, x, z, y, cls === 1 || cls === 2 ? slope * 0.6 : slope, north, out);
        return out;
    }

    // sRGB to linear through a table: a tile decodes 13 000 values
    static toLinear(v) {
        const table = TerrainMesh.linearTable || (TerrainMesh.linearTable = Float32Array.from({ length: 4097 }, (_, k) => {
            const c = k / 4096;
            return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        }));
        return table[Math.round(Math.min(1, Math.max(0, v)) * 4096)];
    }

    // The linear colour of every full-detail vertex of a tile (65 x 65 x 3), made once for the tile and its cover and
    // kept with it: an LOD change rebuilds the mesh, not the colours. The land is coloured every other vertex (16 m,
    // the cover's own cells) and the vertices between take the mean of their coloured neighbours, unless their own
    // zone differs (road, bench, wall, water): those are coloured themselves. Slope and facing come from the 8 m grid.
    static colours(tile, cover) {
        const cache = TerrainMesh.colourCache || (TerrainMesh.colourCache = new WeakMap());
        const held = cache.get(tile);
        if (held && held.cover === cover) return held.grid;
        const n = WorldData.TILE_N, cell = WorldData.CELL_M;
        const baseX = tile.tx * WorldData.TILE_M, baseZ = tile.tz * WorldData.TILE_M;
        const heights = tile.heights, zones = tile.zones;
        const grid = new Float32Array(n * n * 3);
        const colour = [0, 0, 0];
        const paint = (i, j) => {
            const up = Math.max(0, j - 1) * n, down = Math.min(n - 1, j + 1) * n;
            const left = Math.max(0, i - 1), right = Math.min(n - 1, i + 1);
            const gx = (heights[j * n + right] - heights[j * n + left]) / (2 * cell), gz = (heights[down + i] - heights[up + i]) / (2 * cell);
            const len = Math.sqrt(gx * gx + gz * gz + 1);
            const across = Math.sqrt(gx * gx + gz * gz) / len;
            // The ground faces north (-z) where it rises toward +z
            const north = across > 0.02 ? (gz / len / across) * Math.min(1, across * 4) : 0;
            TerrainMesh.colorAt(tile, cover, i, j, heights[j * n + i], 1 - 1 / len, north, baseX + i * cell, baseZ + j * cell, colour);
            const at = (j * n + i) * 3;
            grid[at] = TerrainMesh.toLinear(colour[0]); grid[at + 1] = TerrainMesh.toLinear(colour[1]); grid[at + 2] = TerrainMesh.toLinear(colour[2]);
        };
        for (let j = 0; j < n; j += 2) for (let i = 0; i < n; i += 2) paint(i, j);
        for (let j = 0; j < n; j++) {
            for (let i = 0; i < n; i++) {
                if (i % 2 === 0 && j % 2 === 0) continue;
                const zone = zones[j * n + i];
                const i0 = i - (i % 2), j0 = j - (j % 2);
                const i1 = Math.min(n - 1, i0 + (i % 2 ? 2 : 0)), j1 = Math.min(n - 1, j0 + (j % 2 ? 2 : 0));
                if (zone !== WorldData.ZONE.terrain || [[i0, j0], [i1, j0], [i0, j1], [i1, j1]].some(([u, w]) => zones[w * n + u] !== zone)) {
                    paint(i, j);
                    continue;
                }
                const at = (j * n + i) * 3;
                for (let c = 0; c < 3; c++) grid[at + c] = (grid[(j0 * n + i0) * 3 + c] + grid[(j0 * n + i1) * 3 + c] + grid[(j1 * n + i0) * 3 + c] + grid[(j1 * n + i1) * 3 + c]) / 4;
            }
        }
        cache.set(tile, { cover, grid });
        return grid;
    }

    // Forest seen from 700 m to 2 km: a crown clump (a five-sided cone, 5 triangles) on forest cells of LOD1 tiles, in
    // the tile's own geometry, so it costs no mesh. The modelled trees (Scenery) stand on the nearer tiles; beyond 2 km
    // the forest's own colour carries it, and the window's triangles are spent on the far land.
    static get CLUMP_SIDES() { return 5; }

    // [{x, y, z, r, h, c}] of the tile's clumps at an LOD, none but at LOD1 or without cover
    static clumps(tile, cover, lod) {
        if (!cover || lod !== 1) return [];
        const out = [];
        const n = WorldData.TILE_N, cn = WorldData.COVER_N;
        const cell = WorldData.TILE_M / cn;
        for (let cj = 0; cj < cn; cj++) {
            for (let ci = 0; ci < cn; ci++) {
                const cls = cover[cj * cn + ci];
                const chance = cls === 1 ? 0.5 : cls === 2 ? 0.2 : 0;
                if (!chance) continue;
                const ix = tile.tx * cn + ci, iz = tile.tz * cn + cj;
                if (Scenery.hash(ix, iz, 21) >= chance) continue;
                const fx = ci + 0.2 + 0.6 * Scenery.hash(ix, iz, 22), fz = cj + 0.2 + 0.6 * Scenery.hash(ix, iz, 23);
                const i = Math.min(n - 1, Math.round((fx * cell) / WorldData.CELL_M)), j = Math.min(n - 1, Math.round((fz * cell) / WorldData.CELL_M));
                if (tile.zones[j * n + i] !== WorldData.ZONE.terrain) continue;
                const y = tile.heights[j * n + i];
                if (y > 2250) continue;
                const size = 0.8 + 0.5 * Scenery.hash(ix, iz, 24);
                const tone = 0.8 + 0.4 * Scenery.hash(ix, iz, 25);
                out.push({ x: tile.tx * WorldData.TILE_M + fx * cell, y: y - 1.5, z: tile.tz * WorldData.TILE_M + fz * cell, r: 7 * size, h: 11 * size, c: tone });
            }
        }
        return out;
    }

    // The land in front of a retaining wall reaches this far behind the wall's face, so the stone stands in it
    static get CUT_BACK_M() { return 0.3; }
    // Over a wall's last metres the cut closes: the land in front rises to the wall's top at its end
    static get CUT_TAPER_M() { return 6; }
    // The nodes in front of a wall within this of a point on its foot set the land's height there
    static get CUT_REACH_M() { return 12.5; }
    // The steepest the land in front of a wall rises to the wall's end and to the land past it (rise over run): a
    // little steeper than a fill stands (RoadMesh.BATTER), so the bank takes less of the wall
    static get CUT_BANK() { return 0.8; }

    // The steepest the land drawn at full detail may stand between two nodes (rise over run): a bank, not a step. A
    // triangle of nodes within it is no steeper than about 1.4
    static get LAY_SLOPE() { return 1.3; }
    // How many nodes a step is laid back over at the most
    static get LAY_REACH() { return 8; }
    // A road's strip holds the free nodes within this many nodes of it up at the batter (its own fill)
    static get LAY_HOLD() { return 3; }

    // The land laid back: a height grid cannot hold a step, and the importer leaves one wherever two rules meet (the
    // midline between two legs too close for a slope at the batter, the end of a road's cut on a steep hillside):
    // 8 to 16 m of height in one 8 m cell, drawn as a row of stretched triangles that stand up beside the road like
    // spikes. So at full detail a free node (not a road's strip, not water) is lowered, never raised:
    //   - between two roads: no higher than LAY_SLOPE up from a road's strip within LAY_REACH nodes (the bank over the
    //     lower leg), and for that no lower than LAY_SLOPE down from a strip (the bank under the upper leg). Where the
    //     two disagree it stands on the upper leg's bank: a gap no bank closes is a retaining wall's to hold
    //   - then every free node no more than LAY_SLOPE up from any node beside it (LAY_REACH passes: a cut above a
    //     road is laid back up the hillside), but for that never lower than a fill at the batter down from a strip
    //     within LAY_HOLD nodes: a road's own fill is not undercut by a fall of the land below it
    // A node is lowered by what lies within 2 x LAY_REACH + LAY_HOLD nodes of it only, read across the tile's edges
    // (`near`), so two tiles lay the nodes they share alike.
    // Returns {at(i, j)} the height of node (i, j) for i, j from -`margin` to 64 + `margin`, and `lowered`, a Map from
    // a node of the tile (j * 65 + i) to its lowered height
    static laidBack(tile, near = null, margin = 0) {
        if (near && !near.ring) near = TerrainMesh.ring(tile, near);
        const n = WorldData.TILE_N, cells = n - 1, c = WorldData.CELL_M, zones = WorldData.ZONE;
        const K = TerrainMesh.LAY_REACH, S = TerrainMesh.LAY_SLOPE, hold = TerrainMesh.LAY_HOLD, batter = RoadMesh.BATTER;
        const pad = margin + 2 * K + hold, span = cells + 2 * pad + 1, count = span * span;
        const raw = new Float32Array(count), fixed = new Uint8Array(count);
        const q = {};
        for (let j = -pad; j <= cells + pad; j++) {
            for (let i = -pad; i <= cells + pad; i++) {
                const at = (j + pad) * span + i + pad;
                TerrainMesh.node(tile, i, j, near, q);
                raw[at] = q.h;
                fixed[at] = q.zone === zones.road || q.zone === zones.bench || q.zone === zones.water ? 1 : 0;
            }
        }
        const rise = [c * S, c * S * Math.SQRT2];
        // Nothing to lay back where no node stands a step over the one beside it (most tiles away from the roads)
        let steps = false;
        for (let j = 0; j < span && !steps; j++) {
            for (let i = 0; i + 1 < span; i++) {
                const at = j * span + i;
                if (Math.abs(raw[at] - raw[at + 1]) > rise[0] || (j + 1 < span && (Math.abs(raw[at] - raw[at + span]) > rise[0] || Math.abs(raw[at] - raw[at + span + 1]) > rise[1] || Math.abs(raw[at + 1] - raw[at + span]) > rise[1]))) { steps = true; break; }
            }
        }
        const lowered = new Map();
        if (!steps) return { at: (i, j) => raw[(j + pad) * span + i + pad], lowered };
        // What the roads' strips ask of each node: the bank over a strip (`over`), the bank under one (`under`) and
        // the fill under one (`fill`)
        const over = new Float32Array(count).fill(Infinity), under = new Float32Array(count).fill(-Infinity), fill = new Float32Array(count).fill(-Infinity);
        for (let j = 0; j < span; j++) {
            for (let i = 0; i < span; i++) {
                if (!fixed[j * span + i] ) continue;
                const h = raw[j * span + i];
                for (let b = Math.max(0, j - K); b <= Math.min(span - 1, j + K); b++) {
                    for (let a = Math.max(0, i - K); a <= Math.min(span - 1, i + K); a++) {
                        const at = b * span + a, d = c * Math.hypot(a - i, b - j);
                        if (h + S * d < over[at]) over[at] = h + S * d;
                        if (h - S * d > under[at]) under[at] = h - S * d;
                        if (Math.abs(a - i) <= hold && Math.abs(b - j) <= hold && h - batter * d > fill[at]) fill[at] = h - batter * d;
                    }
                }
            }
        }
        let now = new Float32Array(count), next = new Float32Array(count);
        for (let at = 0; at < count; at++) now[at] = fixed[at] ? raw[at] : Math.min(raw[at], Math.max(over[at], under[at]));
        for (let pass = 0; pass < K; pass++) {
            let moved = false;
            for (let j = 0; j < span; j++) {
                for (let i = 0; i < span; i++) {
                    const at = j * span + i;
                    let y = now[at];
                    if (!fixed[at]) {
                        for (let b = -1; b <= 1; b++) {
                            if (j + b < 0 || j + b >= span) continue;
                            for (let a = -1; a <= 1; a++) {
                                if ((!a && !b) || i + a < 0 || i + a >= span) continue;
                                const top = now[at + b * span + a] + rise[a && b ? 1 : 0];
                                if (top < y) y = top;
                            }
                        }
                        // (held up by a strip's fill, but never over the height it has)
                        if (y < fill[at]) y = Math.min(now[at], fill[at]);
                    }
                    next[at] = y;
                    if (y !== now[at]) moved = true;
                }
            }
            [now, next] = [next, now];
            if (!moved) break;
        }
        // (a node moved by less than 5 cm keeps its own height, in its own tile and as its neighbours read it)
        for (let at = 0; at < count; at++) if (now[at] >= raw[at] - 0.05) now[at] = raw[at];
        for (let j = 0; j <= cells; j++) {
            for (let i = 0; i <= cells; i++) {
                const at = (j + pad) * span + i + pad;
                if (now[at] < raw[at]) lowered.set(j * n + i, now[at]);
            }
        }
        return { at: (i, j) => now[(j + pad) * span + i + pad], lowered };
    }

    // The land of a tile cut to the retaining walls that cross it. A height grid of 8 m nodes cannot hold a wall: the
    // triangle from the last node in front of the wall to the first node behind it is a ramp through the wall's
    // plane, a mound of land in front of the stone. So:
    //   - each full-detail triangle a wall's line crosses is cut along that line (CUT_BACK_M behind the face): the part
    //     in front keeps the height of the node in front (the land meets the wall's foot, level), the part behind keeps
    //     the triangle's own plane (under the road), and a face of land closes the step between them behind the stone.
    //     Over a wall's last CUT_TAPER_M the step closes: the wall ends in the ground
    //   - a node in front of a wall, within CUT_REACH_M of it, that stands higher than a slope at the batter
    //     (RoadMesh.BATTER) up from a node farther from the wall (with no wall between the two) stands level with the
    //     lowest such node instead: land does not climb to a wall steeper than a fill stands, the wall holds that
    //     height, and a node the importer carved for the road above just outside its drawn edge is no tooth of land
    //     in front of the stone
    // `runs` are the walls' top lines ([{points: [[x, y, z]], out: [[ox, oz]]}], RoadMesh.wallRuns); `near` reads the
    // neighbouring tiles' nodes (TerrainMesh.node). Returns a Map from a triangle (cell * 2 + which, cell = b * 64 + a)
    // to {nodes: [[i, j] x 3], chain, front: {verts, tris}, behind: {verts, tris}}: a vertex is {x, z, node (0 to 2, or
    // -1), w (its weights on the three nodes), tau (how far the step has closed there: 0 the full step, 1 none)} and,
    // on the cut, where the land in front stands: `fn` (the node in front on the edge it lies on), `mix` (between two
    // such, along the cut) or `f` (a height). The Map's `lowered` is a Map from a node (j * 65 + i) to its lowered
    // height. Null when nothing is cut or lowered
    // `roadOver(ax, az, bx, bz)` gives the highest road surface between two points (or -Infinity): a node is never
    // lowered under a road that lies between it and the lower ground, so the land still meets that road's edge.
    static cuts(tile, runs, near = null, roadOver = null) {
        if (near && !near.ring) near = TerrainMesh.ring(tile, near);
        const W = 4;
        // The land the walls stand in is the land laid back (TerrainMesh.laidBack): what a wall's levelling reads and
        // lowers further
        const laid = TerrainMesh.laidBack(tile, near, W);
        const none = () => { if (!laid.lowered.size) return null; const only = new Map(); only.lowered = laid.lowered; return only; };
        if (!runs || !runs.length) return none();
        const n = WorldData.TILE_N, cells = n - 1, c = WorldData.CELL_M;
        const baseX = tile.tx * WorldData.TILE_M, baseZ = tile.tz * WorldData.TILE_M;
        const back = TerrainMesh.CUT_BACK_M, taper = TerrainMesh.CUT_TAPER_M, reach = TerrainMesh.CUT_REACH_M;
        const out = new Map();
        const q = {};
        // The walls' lines: each top line set back, and on past each end (closing over the taper, then closed)
        const lines = [];
        for (const run of runs) {
            const m = run.points.length;
            if (m < 2) continue;
            const chain = run.points.map((p, k) => ({ x: p[0] - run.out[k][0] * back, z: p[2] - run.out[k][1] * back, nx: run.out[k][0], nz: run.out[k][1], tau: 0 }));
            // A wall ends in the ground: over its last CUT_TAPER_M the step closes, so the land in front rises to
            // the wall's top at its end and the land past it is as the nodes give it
            const along = [0];
            for (let k = 1; k < m; k++) along.push(along[k - 1] + Math.hypot(chain[k].x - chain[k - 1].x, chain[k].z - chain[k - 1].z));
            chain.forEach((p, k) => { p.tau = Math.max(0, 1 - Math.min(along[k], along[m - 1] - along[k]) / taper); });
            const extend = (end, next) => {
                const len = Math.hypot(end.x - next.x, end.z - next.z) || 1;
                const ux = (end.x - next.x) / len, uz = (end.z - next.z) / len;
                return [taper, taper + 24].map(d => ({ x: end.x + ux * d, z: end.z + uz * d, nx: end.nx, nz: end.nz, tau: 1 }));
            };
            const head = extend(chain[0], chain[1]), tail = extend(chain[m - 1], chain[m - 2]);
            const line = [head[1], head[0], ...chain, tail[0], tail[1]];
            // The wall's two ends, at its top: a node levelled in front stands no lower than a bank down from each (`cone`)
            line.ends = [run.points[0], run.points[m - 1]].map((p, e) => ({ x: chain[e ? m - 1 : 0].x, y: p[1], z: chain[e ? m - 1 : 0].z }));
            let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
            for (const p of line) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
            const pad = 5 * c;
            if (x1 < baseX - pad || z1 < baseZ - pad || x0 > baseX + WorldData.TILE_M + pad || z0 > baseZ + WorldData.TILE_M + pad) continue;
            line.box = [x0, z0, x1, z1];
            // Metres along the line at each of its points (cutTriangle gives each cut vertex its own, `u`)
            line.along = [0];
            for (let k = 1; k < line.length; k++) line.along.push(line.along[k - 1] + Math.hypot(line[k].x - line[k - 1].x, line[k].z - line[k - 1].z));
            lines.push(line);
        }
        if (!lines.length) return none();
        // Metres in front of a wall's line (negative behind it), read on the wall itself (not past its ends);
        // `ended` when the nearest of it is one of its ends
        const side = { d: 0, ended: false };
        const sideOf = (line, x, z) => {
            let best = Infinity;
            for (let k = 2; k + 3 < line.length; k++) {
                const a = line[k], b = line[k + 1];
                const dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz;
                const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2));
                const px = a.x + dx * t, pz = a.z + dz * t, dist = (x - px) * (x - px) + (z - pz) * (z - pz);
                if (dist < best) {
                    best = dist;
                    side.d = (x - px) * (a.nx + (b.nx - a.nx) * t) + (z - pz) * (a.nz + (b.nz - a.nz) * t);
                    side.ended = (k === 2 && t === 0) || (k + 4 === line.length && t === 1);
                    side.tau = a.tau + (b.tau - a.tau) * t;
                }
            }
            side.near = Math.sqrt(best);
            return side;
        };
        // Whether a wall lies between two points
        const walled = (ax, az, bx, bz) => {
            for (const line of lines) {
                const [x0, z0, x1, z1] = line.box;
                if (Math.max(ax, bx) < x0 || Math.min(ax, bx) > x1 || Math.max(az, bz) < z0 || Math.min(az, bz) > z1) continue;
                for (let k = 2; k + 3 < line.length; k++) {
                    const p = line[k], r = line[k + 1];
                    const d1 = (bx - ax) * (p.z - az) - (bz - az) * (p.x - ax), d2 = (bx - ax) * (r.z - az) - (bz - az) * (r.x - ax);
                    if ((d1 > 0) === (d2 > 0)) continue;
                    const d3 = (r.x - p.x) * (az - p.z) - (r.z - p.z) * (ax - p.x), d4 = (r.x - p.x) * (bz - p.z) - (r.z - p.z) * (bx - p.x);
                    if ((d3 > 0) !== (d4 > 0)) return true;
                }
            }
            return false;
        };
        // The nodes in front of a wall within reach, a little past the tile's edges so two tiles lower the nodes they
        // share alike: each with the wall it is nearest in front of
        const span = cells + 2 * W + 1;
        const slot = (i, j) => (j + W) * span + i + W;
        const heightOf = (i, j) => laid.at(i, j);
        const front = new Map();
        for (const line of lines) {
            for (let k = 2; k + 3 < line.length; k++) {
                const a = line[k], b = line[k + 1];
                const i0 = Math.max(-W, Math.floor((Math.min(a.x, b.x) - reach - baseX) / c)), i1 = Math.min(cells + W, Math.ceil((Math.max(a.x, b.x) + reach - baseX) / c));
                const j0 = Math.max(-W, Math.floor((Math.min(a.z, b.z) - reach - baseZ) / c)), j1 = Math.min(cells + W, Math.ceil((Math.max(a.z, b.z) + reach - baseZ) / c));
                for (let j = j0; j <= j1; j++) {
                    for (let i = i0; i <= i1; i++) {
                        const key = slot(i, j);
                        const held = front.get(key);
                        if (held && held.line === line) continue;
                        const at = sideOf(line, baseX + i * c, baseZ + j * c);
                        if (at.ended || at.d <= 0 || at.d > reach || at.near > reach) continue;
                        if (!held || at.d < held.d) front.set(key, { i, j, d: at.d, line, tau: at.tau });
                    }
                }
            }
        }
        const lowered = new Map(laid.lowered);
        const low = new Map();
        const batter = RoadMesh.BATTER;
        // A levelled node keeps within CUT_BANK of the nodes past its wall's ends that no wall levels and no wall parts
        // from it (the land past the end, the road's own height there): the land in front of a wall rises to its end
        // as a bank. Levelled whatever stood beside it, the nodes by a wall's end stood a wall's height under the next
        // ones, a tent of land against the stone
        // and no lower than a bank at CUT_BANK down from each end of its wall, at the wall's top there: the land a
        // wall levels rises to the wall's end as a cone of ground, and the wall ends in it. (Closed over the wall's
        // last metres whatever its height, the land was a tent against the stone, 10 m of height in less than a cell)
        const cone = (line, x, z) => Math.max(...line.ends.map(e => e.y - TerrainMesh.CUT_BANK * Math.hypot(x - e.x, z - e.z)));
        const bank = (node, x, z) => {
            let most = -Infinity;
            for (let j = node.j - 2; j <= node.j + 2; j++) {
                for (let i = node.i - 2; i <= node.i + 2; i++) {
                    if ((i === node.i && j === node.j) || i < -W || j < -W || i > cells + W || j > cells + W || front.has(slot(i, j))) continue;
                    const ox = baseX + i * c, oz = baseZ + j * c;
                    const held = heightOf(i, j) - TerrainMesh.CUT_BANK * c * Math.hypot(i - node.i, j - node.j);
                    if (held > most && sideOf(node.line, ox, oz).ended && !walled(x, z, ox, oz)) most = held;
                }
            }
            return most;
        };
        for (const node of [...front.values()].sort((p, r) => r.d - p.d || p.j - r.j || p.i - r.i)) {
            const x = baseX + node.i * c, z = baseZ + node.j * c;
            const own = heightOf(node.i, node.j);
            let y = own;
            for (let j = node.j - 2; j <= node.j + 2; j++) {
                for (let i = node.i - 2; i <= node.i + 2; i++) {
                    if ((i === node.i && j === node.j) || i < -W || j < -W || i > cells + W || j > cells + W) continue;
                    let far = low.has(slot(i, j)) ? low.get(slot(i, j)) : heightOf(i, j);
                    const dist = Math.hypot(i - node.i, j - node.j) * c;
                    if (far + batter * dist >= own) continue;
                    // Farther from the wall than this node, with no wall between the two
                    const ox = baseX + i * c, oz = baseZ + j * c;
                    const at = sideOf(node.line, ox, oz);
                    if (at.d < node.d + 1 || walled(x, z, ox, oz)) continue;
                    // Not under a road that lies between: the land by that road stays at its edge
                    if (roadOver) far = Math.max(far, roadOver(x, z, ox, oz));
                    if (far + batter * dist >= own) continue;
                    if (far < y) y = far;
                }
            }
            // Less toward the wall's end, where the land in front rises to its top (the cut closes there)
            y = own - (own - y) * (1 - Math.min(1, Math.max(0, node.tau)));
            // Toward a wall's end the land it levels rises as a bank (`bank`, `cone`)
            if (y < own - 0.05) y = Math.min(own, Math.max(y, bank(node, x, z), cone(node.line, x, z)));
            if (y > own - 0.05) continue;
            low.set(slot(node.i, node.j), y);
            if (node.i >= 0 && node.j >= 0 && node.i <= cells && node.j <= cells) lowered.set(node.j * n + node.i, y);
        }
        // The height of the land in front at a point of a line with no node in front on its own edge: the nodes in
        // front of the wall within reach, the nearest by far the most, or null with none
        const frontAt = line => (x, z) => {
            let sum = 0, weight = 0;
            const ci = Math.round((x - baseX) / c), cj = Math.round((z - baseZ) / c);
            for (let j = cj - 2; j <= cj + 2; j++) {
                for (let i = ci - 2; i <= ci + 2; i++) {
                    if (i < -W || j < -W || i > cells + W || j > cells + W) continue;
                    const dx = baseX + i * c - x, dz = baseZ + j * c - z, d2 = dx * dx + dz * dz;
                    if (d2 > reach * reach || sideOf(line, baseX + i * c, baseZ + j * c).d <= 0) continue;
                    const w = 1 / (d2 * d2 + 1);
                    sum += (low.has(slot(i, j)) ? low.get(slot(i, j)) : heightOf(i, j)) * w;
                    weight += w;
                }
            }
            return weight ? sum / weight : null;
        };
        // The cells each line passes, and each of their two triangles cut by the part of the line inside it
        // (and the cells up to G past the tile's edges, cut only to be read: the land at a wall's foot there bounds
        // the land at its foot here, and two tiles bound the edge they share alike)
        const G = W - 1, wide = cells + 2 * G;
        const nodeNow = ([i, j]) => (low.has(slot(i, j)) ? low.get(slot(i, j)) : heightOf(i, j));
        for (const line of lines) {
            const seen = new Set();
            const ahead = frontAt(line);
            const foot = [];
            for (let k = 0; k + 1 < line.length; k++) {
                const a = line[k], b = line[k + 1];
                if (a.tau >= 1 && b.tau >= 1) continue;
                const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 2));
                for (let e = 0; e <= steps; e++) {
                    const x = a.x + ((b.x - a.x) * e) / steps, z = a.z + ((b.z - a.z) * e) / steps;
                    const ca = Math.floor((x - baseX) / c), cb = Math.floor((z - baseZ) / c);
                    for (let db = -1; db <= 1; db++) for (let da = -1; da <= 1; da++) {
                        const ia = ca + da, ib = cb + db;
                        if (ia < -G || ib < -G || ia >= cells + G || ib >= cells + G) continue;
                        const inside = ia >= 0 && ib >= 0 && ia < cells && ib < cells;
                        for (let which = 0; which < 2; which++) {
                            const mark = ((ib + G) * wide + ia + G) * 2 + which;
                            if (seen.has(mark)) continue;
                            seen.add(mark);
                            const id = (ib * cells + ia) * 2 + which;
                            if (inside && out.has(id)) continue;
                            const nodes = which === 0 ? [[ia, ib], [ia, ib + 1], [ia + 1, ib]] : [[ia + 1, ib], [ia, ib + 1], [ia + 1, ib + 1]];
                            const record = TerrainMesh.cutTriangle(nodes.map(([i, j]) => [baseX + i * c, baseZ + j * c]), line, ahead);
                            if (!record) continue;
                            record.nodes = nodes;
                            if (inside) out.set(id, record);
                            for (const v of [record.chain[0], record.chain[record.chain.length - 1]]) {
                                if (v.tau >= 1) continue;
                                const y = v.fn >= 0 ? nodeNow(nodes[v.fn]) : v.f;
                                // (`least`: a bank down from the node in front on its own edge to the wall)
                                if (y !== null) foot.push({ v, u: v.u, y, least: y - v.lift });
                            }
                        }
                    }
                }
            }
            // The land at a wall's foot rises along the wall no steeper than a bank (CUT_BANK). A vertex on the wall's
            // line takes the height of the node in front on its own edge, and where the line passes close by a node
            // behind it, two vertices a metre apart took the heights of two nodes 8 m apart: a tooth of land against
            // the stone. Lowered only, and no lower than a bank down from its own node to the wall
            foot.sort((p, r) => p.u - r.u);
            const bank = TerrainMesh.CUT_BANK;
            for (let k = 1; k < foot.length; k++) foot[k].y = Math.min(foot[k].y, foot[k - 1].y + bank * (foot[k].u - foot[k - 1].u));
            for (let k = foot.length - 2; k >= 0; k--) foot[k].y = Math.min(foot[k].y, foot[k + 1].y + bank * (foot[k + 1].u - foot[k].u));
            for (const p of foot) p.v.cap = Math.max(p.y, p.least);
        }
        if (!out.size && !lowered.size) return null;
        out.lowered = lowered;
        return out;
    }

    // One triangle (three [x, z]) cut by the first part of `line` that crosses it from one edge to another. Null when
    // the line does not cross it, or closes nothing there
    static cutTriangle(tri, line, frontAt) {
        const area = (tri[1][0] - tri[0][0]) * (tri[2][1] - tri[0][1]) - (tri[2][0] - tri[0][0]) * (tri[1][1] - tri[0][1]);
        const sign = area > 0 ? 1 : -1;
        // How far inside edge e (from corner e to corner e + 1) a point is
        const inside = (e, x, z) => { const a = tri[e], b = tri[(e + 1) % 3]; return sign * ((b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0])); };
        const part = [];
        let entry = -1, exit = -1;
        for (let k = 0; k + 1 < line.length && exit < 0; k++) {
            const a = line[k], b = line[k + 1];
            let t0 = 0, t1 = 1, e0 = -1, e1 = -1;
            for (let e = 0; e < 3 && t0 <= t1; e++) {
                const da = inside(e, a.x, a.z), db = inside(e, b.x, b.z);
                if (da < 0 && db < 0) { t0 = 2; break; }
                if (da < 0) { const t = da / (da - db); if (t > t0) { t0 = t; e0 = e; } }
                else if (db < 0) { const t = da / (da - db); if (t < t1) { t1 = t; e1 = e; } }
            }
            if (t1 - t0 < 1e-9) {
                // Left through a corner, or only touched: not a crossing this can cut
                if (part.length) return null;
                continue;
            }
            const at = t => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, nx: a.nx + (b.nx - a.nx) * t, nz: a.nz + (b.nz - a.nz) * t, tau: a.tau + (b.tau - a.tau) * t, u: line.along ? line.along[k] + (line.along[k + 1] - line.along[k]) * t : 0 });
            if (!part.length) {
                // The line starts inside the triangle only at its own first point, which lies far past the wall: no
                // cut of that, and the line is read on
                if (e0 < 0) continue;
                entry = e0;
                part.push(at(t0));
            }
            part.push(at(t1));
            if (e1 < 0) continue;
            // A crossing that closes nothing (the line's run on past a wall's end) is no cut, and the line is read
            // on: at a hairpin a wall's own line past its start crosses the triangles its later course stands in,
            // and those were left whole, a ramp of land through the stone
            if (part.every(p => p.tau >= 1 - 1e-6)) { part.length = 0; entry = -1; continue; }
            exit = e1;
        }
        if (entry < 0 || exit < 0) return null;
        if (part.every(p => p.tau >= 1 - 1e-6)) return null;
        const run = [0];
        for (let k = 0; k + 1 < part.length; k++) run.push(run[k] + Math.hypot(part[k + 1].x - part[k].x, part[k + 1].z - part[k].z));
        const length = run[run.length - 1];
        if (length < 0.05) return null;
        const bary = (x, z) => {
            const w1 = ((x - tri[0][0]) * (tri[2][1] - tri[0][1]) - (tri[2][0] - tri[0][0]) * (z - tri[0][1])) / area;
            const w2 = ((tri[1][0] - tri[0][0]) * (z - tri[0][1]) - (x - tri[0][0]) * (tri[1][1] - tri[0][1])) / area;
            return [1 - w1 - w2, w1, w2];
        };
        const corner = e => ({ x: tri[e][0], z: tri[e][1], node: e, w: [e === 0 ? 1 : 0, e === 1 ? 1 : 0, e === 2 ? 1 : 0], tau: 1 });
        // (`cone`: the bank down from the wall's ends, which the land in front on the wall's line stands no lower
        // than; `lift`: the most it stands over the land in front of it for that, a bank from there to the wall)
        const coneAt = (x, z) => (line.ends ? Math.max(...line.ends.map(e => e.y - TerrainMesh.CUT_BANK * Math.hypot(x - e.x, z - e.z))) : -Infinity);
        const chain = part.map(p => ({ x: p.x, z: p.z, node: -1, w: bary(p.x, p.z), tau: Math.min(1, Math.max(0, p.tau)), fn: -1, mix: null, f: null, u: p.u, cap: Infinity, nx: p.nx, nz: p.nz, cone: coneAt(p.x, p.z), lift: TerrainMesh.CUT_BANK * WorldData.CELL_M / 2 }));
        // Where along the triangle's outline a point of edge e lies: e + its share of the edge
        const along = (e, p) => { const a = tri[e], b = tri[(e + 1) % 3]; return e + Math.hypot(p.x - a[0], p.z - a[1]) / Math.hypot(b[0] - a[0], b[1] - a[1]); };
        const pe = along(entry, part[0]), px = along(exit, part[part.length - 1]);
        const corners = (from, to) => { const list = []; const end = to > from ? to : to + 3; for (let k = Math.floor(from) + 1; k <= end; k++) list.push(corner(k % 3)); return list; };
        const first = chain[0], last = chain[chain.length - 1], inner = chain.slice(1, -1);
        // The outline from the entry round to the exit and back along the line, and the other way
        const one = [first, ...corners(pe, px), last, ...inner.slice().reverse()];
        const two = [last, ...corners(px, pe), first, ...inner];
        const within = (poly, x, z) => {
            let on = false;
            for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
                if ((poly[i].z > z) !== (poly[j].z > z) && x < ((poly[j].x - poly[i].x) * (z - poly[i].z)) / (poly[j].z - poly[i].z) + poly[i].x) on = !on;
            }
            return on;
        };
        const mid = Math.floor((part.length - 1) / 2);
        const mx = (part[mid].x + part[mid + 1].x) / 2, mz = (part[mid].z + part[mid + 1].z) / 2;
        const nx = part[mid].nx + part[mid + 1].nx, nz = part[mid].nz + part[mid + 1].nz, nl = Math.hypot(nx, nz) || 1;
        const ahead = [mx + (nx / nl) * 0.02, mz + (nz / nl) * 0.02], behind = [mx - (nx / nl) * 0.02, mz - (nz / nl) * 0.02];
        let frontIs;
        if (within(one, ahead[0], ahead[1]) || within(two, behind[0], behind[1])) frontIs = one;
        else if (within(two, ahead[0], ahead[1]) || within(one, behind[0], behind[1])) frontIs = two;
        else return null;
        // Where the land in front stands at each end of the cut: at the node in front on the edge the end lies on
        // (so two triangles that share the edge agree), else as the nodes in front round it give
        const inFront = new Set(frontIs.filter(v => v.node >= 0).map(v => v.node));
        [[first, entry], [last, exit]].forEach(([v, e]) => {
            const a = e, b = (e + 1) % 3;
            if (inFront.has(a) !== inFront.has(b)) { v.fn = inFront.has(a) ? a : b; v.lift = TerrainMesh.CUT_BANK * Math.hypot(v.x - tri[v.fn][0], v.z - tri[v.fn][1]); }
            else v.f = frontAt(v.x, v.z);
        });
        // (a vertex between the two ends rises with the bank as far as they do, by its place between them: with a
        // lift of its own, it stood a step under the end beside it)
        inner.forEach((v, k) => { v.mix = { a: first, b: last, t: run[k + 1] / length }; v.lift = first.lift + (last.lift - first.lift) * v.mix.t; });
        for (const v of [first, last]) if (v.fn < 0 && v.f === null) v.tau = 1;
        const shape = poly => {
            const verts = [];
            for (const v of poly) {
                const prior = verts[verts.length - 1];
                if (prior && Math.hypot(prior.x - v.x, prior.z - v.z) < 1e-6) continue;
                verts.push(v);
            }
            if (verts.length > 1 && Math.hypot(verts[0].x - verts[verts.length - 1].x, verts[0].z - verts[verts.length - 1].z) < 1e-6) verts.pop();
            if (verts.length < 3) return { verts: [], tris: [] };
            // Wound as the triangle itself is, so every part is lit from the same side as the land round it
            const tris = THREE.ShapeUtils.triangulateShape(verts.map(v => new THREE.Vector2(v.x, v.z)), []).map(([a, b, c]) => {
                const turn = (verts[b].x - verts[a].x) * (verts[c].z - verts[a].z) - (verts[c].x - verts[a].x) * (verts[b].z - verts[a].z);
                return turn * sign > 0 ? [a, b, c] : [a, c, b];
            });
            return { verts, tris };
        };
        return { chain, front: shape(frontIs), behind: shape(frontIs === one ? two : one) };
    }

    // The height of the land at (x, z) of a tile, on the triangles it is drawn with at full detail: the nodes' two
    // triangles a cell, or the cut ones (TerrainMesh.cuts). The heights are the tile's own (not sunk: what the physics reads)
    static heightAt(tile, x, z, cuts = null) {
        const n = WorldData.TILE_N, m = WorldData.TILE_M, c = WorldData.CELL_M;
        const fx = (x - tile.tx * m) / c, fz = (z - tile.tz * m) / c;
        const i = Math.max(0, Math.min(n - 2, Math.floor(fx))), j = Math.max(0, Math.min(n - 2, Math.floor(fz)));
        const u = Math.max(0, Math.min(1, fx - i)), v = Math.max(0, Math.min(1, fz - j));
        const h = tile.heights;
        let h00 = h[j * n + i], h10 = h[j * n + i + 1], h01 = h[(j + 1) * n + i], h11 = h[(j + 1) * n + i + 1];
        if (cuts && cuts.lowered.size) {
            const low = cuts.lowered;
            let y;
            if ((y = low.get(j * n + i)) !== undefined) h00 = y;
            if ((y = low.get(j * n + i + 1)) !== undefined) h10 = y;
            if ((y = low.get((j + 1) * n + i)) !== undefined) h01 = y;
            if ((y = low.get((j + 1) * n + i + 1)) !== undefined) h11 = y;
        }
        const which = u + v <= 1 ? 0 : 1;
        const record = cuts ? cuts.get((j * (n - 1) + i) * 2 + which) : undefined;
        if (record) {
            const nodeH = which === 0 ? [h00, h01, h10] : [h10, h01, h11];
            const y = TerrainMesh.cutHeight(record, x, z, nodeH);
            if (y !== null) return y;
        }
        // The same two triangles TerrainMesh draws (split along the 01-10 diagonal), so the ground is the drawn ground
        return which === 0 ? h00 + u * (h10 - h00) + v * (h01 - h00) : h11 + (1 - u) * (h01 - h11) + (1 - v) * (h10 - h11);
    }

    // Where the land in front stands at a vertex on a cut, the three nodes at `nodeH`; null where it is not known.
    // No higher than the bank along the wall's foot allows (`cap`, TerrainMesh.cuts)
    static cutFrontY(vertex, nodeH, sink) {
        if (vertex.fn >= 0) return Math.min(nodeH[vertex.fn], vertex.cap - sink);
        if (vertex.mix) {
            const a = TerrainMesh.cutFrontY(vertex.mix.a, nodeH, sink), b = TerrainMesh.cutFrontY(vertex.mix.b, nodeH, sink);
            return a === null ? b : b === null ? a : a + (b - a) * vertex.mix.t;
        }
        return vertex.f === null ? null : Math.min(vertex.f, vertex.cap) - sink;
    }

    // The height a tile's mesh (TerrainMesh.build) draws its land at over (x, z), on its own triangles: the nodes' two
    // a cell at its level of detail, or the parts of a cut triangle
    static drawnAt(mesh, x, z) {
        const lod = mesh.userData.lod, stride = 1 << lod, cell = WorldData.CELL_M * stride, side = (WorldData.TILE_N - 1) / stride + 1;
        const [tx, tz] = mesh.userData.tile.split(',').map(Number);
        const pos = mesh.geometry.attributes.position.array;
        const fx = (x - tx * WorldData.TILE_M) / cell, fz = (z - tz * WorldData.TILE_M) / cell;
        const i = Math.max(0, Math.min(side - 2, Math.floor(fx))), j = Math.max(0, Math.min(side - 2, Math.floor(fz)));
        const u = fx - i, v = fz - j;
        const Y = (a, b) => pos[((j + b) * side + i + a) * 3 + 1];
        const which = u + v <= 1 ? 0 : 1;
        const record = mesh.userData.cuts ? mesh.userData.cuts.get((j * (side - 1) + i) * 2 + which) : undefined;
        if (record) {
            const y = TerrainMesh.cutHeight(record, x, z, which === 0 ? [Y(0, 0), Y(0, 1), Y(1, 0)] : [Y(1, 0), Y(0, 1), Y(1, 1)], TerrainMesh.SINK_M);
            if (y !== null) return y;
        }
        return which === 0 ? Y(0, 0) + u * (Y(1, 0) - Y(0, 0)) + v * (Y(0, 1) - Y(0, 0)) : Y(1, 1) + (1 - u) * (Y(0, 1) - Y(1, 1)) + (1 - v) * (Y(1, 0) - Y(1, 1));
    }

    // The height of a vertex of a cut triangle whose three nodes stand at `nodeH`: in front of the wall the land in
    // front's (a height of its own less `sink`), closing to the triangle's own plane by its tau, and no lower than
    // the bank down from the wall's ends (`cone`) where the land in front of it has risen with that bank (`lift`);
    // behind it the triangle's own plane
    static cutVertexY(vertex, nodeH, front, sink = 0) {
        if (vertex.node >= 0) return nodeH[vertex.node];
        const plane = vertex.w[0] * nodeH[0] + vertex.w[1] * nodeH[1] + vertex.w[2] * nodeH[2];
        if (!front || vertex.tau >= 1) return plane;
        const f = TerrainMesh.cutFrontY(vertex, nodeH, sink);
        return f === null ? plane : Math.min(plane, Math.max(f + (plane - f) * vertex.tau, Math.min(vertex.cone - sink, f + vertex.lift)));
    }

    // The height at (x, z) inside a cut triangle, or null where no part of it holds the point
    static cutHeight(record, x, z, nodeH, sink = 0) {
        for (const part of [record.front, record.behind]) {
            const front = part === record.front;
            for (const [a, b, c] of part.tris) {
                const A = part.verts[a], B = part.verts[b], C = part.verts[c];
                const d = (B.z - C.z) * (A.x - C.x) + (C.x - B.x) * (A.z - C.z);
                if (Math.abs(d) < 1e-12) continue;
                const wa = ((B.z - C.z) * (x - C.x) + (C.x - B.x) * (z - C.z)) / d, wb = ((C.z - A.z) * (x - C.x) + (A.x - C.x) * (z - C.z)) / d, wc = 1 - wa - wb;
                if (wa < -1e-7 || wb < -1e-7 || wc < -1e-7) continue;
                return wa * TerrainMesh.cutVertexY(A, nodeH, front, sink) + wb * TerrainMesh.cutVertexY(B, nodeH, front, sink) + wc * TerrainMesh.cutVertexY(C, nodeH, front, sink);
            }
        }
        return null;
    }

    // The mesh of tile (tx, tz): {mesh, triangles}. `cover` may be null (grass everywhere). `holdY(x, y, z)`, when
    // given, may lower a carved vertex further (under the ride's road, WorldEnvironment.buildTile). `near(key)` gives a
    // resident neighbouring tile or null (TerrainMesh.node): the tile reads its neighbours' nodes across its edges.
    // `cuts` (TerrainMesh.cuts) are the full-detail triangles cut to the retaining walls: drawn at LOD0 in place of the
    // nodes' own.
    static build(tile, cover, lod, holdY = null, near = null, cuts = null) {
        if (lod !== 0) cuts = null;
        if (near && !near.ring) near = TerrainMesh.ring(tile, near);
        const n = WorldData.TILE_N;
        const stride = 1 << lod;
        const cells = (n - 1) / stride;
        const side = cells + 1;
        const baseX = tile.tx * WorldData.TILE_M, baseZ = tile.tz * WorldData.TILE_M;
        const crowns = TerrainMesh.clumps(tile, cover, lod);
        const sides = TerrainMesh.CLUMP_SIDES;
        const ground = side * side + side * 4;
        const vertexCount = ground + crowns.length * (sides + 1);
        const positions = new Float32Array(vertexCount * 3);
        const shades = new Float32Array(vertexCount * 3);
        // No array is made per vertex: a tile has 4 000 and the garbage collector's pause lands in a build step
        const put = (v, x, y, z, c) => {
            positions[v * 3] = x; positions[v * 3 + 1] = y; positions[v * 3 + 2] = z;
            shades[v * 3] = c[0]; shades[v * 3 + 1] = c[1]; shades[v * 3 + 2] = c[2];
        };
        const copy = (to, from, depth) => {
            positions[to * 3] = positions[from * 3]; positions[to * 3 + 1] = positions[from * 3 + 1] - depth; positions[to * 3 + 2] = positions[from * 3 + 2];
            shades[to * 3] = shades[from * 3]; shades[to * 3 + 1] = shades[from * 3 + 1]; shades[to * 3 + 2] = shades[from * 3 + 2];
        };
        const grid = TerrainMesh.colours(tile, cover);
        const linear = [0, 0, 0];
        for (let b = 0; b < side; b++) {
            for (let a = 0; a < side; a++) {
                const i = a * stride, j = b * stride;
                const zone = tile.zones[j * n + i];
                const carved = TerrainMesh.carved(zone);
                const x = baseX + i * WorldData.CELL_M, z = baseZ + j * WorldData.CELL_M;
                let drawnY = TerrainMesh.vertexY(tile, lod, i, j, near);
                const lowered = cuts ? cuts.lowered.get(j * n + i) : undefined;
                if (lowered !== undefined) drawnY = Math.min(drawnY, carved ? lowered - TerrainMesh.SINK_M : lowered);
                if (carved && holdY) drawnY = holdY(x, drawnY, z);
                const at = (j * n + i) * 3;
                linear[0] = grid[at]; linear[1] = grid[at + 1]; linear[2] = grid[at + 2];
                put(b * side + a, x, drawnY, z, linear);
            }
        }
        let indices = new Uint32Array(cells * cells * 6 + 4 * cells * 6 + crowns.length * sides * 3);
        let at = 0;
        for (let b = 0; b < cells; b++) {
            for (let a = 0; a < cells; a++) {
                const v00 = b * side + a, v10 = v00 + 1, v01 = v00 + side, v11 = v01 + 1;
                const id = (b * cells + a) * 2;
                if (!cuts || !cuts.has(id)) { indices[at++] = v00; indices[at++] = v01; indices[at++] = v10; }
                if (!cuts || !cuts.has(id + 1)) { indices[at++] = v10; indices[at++] = v01; indices[at++] = v11; }
            }
        }
        // The cut triangles: their parts in front of and behind each wall, the face that closes the step between
        // them, and where a cut meets the tile's edge, the two heights the skirt hangs from there
        const extra = { positions: [], shades: [], land: [], faces: [], flat: [] };
        const edgeCuts = new Map();
        if (cuts) {
            const add = (x, y, z, colour) => { extra.positions.push(x, y, z); extra.shades.push(colour[0], colour[1], colour[2]); return vertexCount + extra.positions.length / 3 - 1; };
            const mix = [0, 0, 0];
            for (const record of cuts.values()) {
                const own = record.nodes.map(([i, j]) => j * side + i);
                const nodeY = own.map(v => positions[v * 3 + 1]);
                const colourOf = vertex => {
                    for (let k = 0; k < 3; k++) mix[k] = vertex.w[0] * shades[own[0] * 3 + k] + vertex.w[1] * shades[own[1] * 3 + k] + vertex.w[2] * shades[own[2] * 3 + k];
                    return mix;
                };
                const drawn = new Map();
                for (const part of [record.front, record.behind]) {
                    const front = part === record.front;
                    const index = part.verts.map(vertex => {
                        if (vertex.node >= 0) return own[vertex.node];
                        let y = TerrainMesh.cutVertexY(vertex, nodeY, front, TerrainMesh.SINK_M);
                        if (front && holdY) y = holdY(vertex.x, y, vertex.z);
                        const v = add(vertex.x, y, vertex.z, colourOf(vertex));
                        drawn.set(`${front ? 'f' : 'b'}${record.chain.indexOf(vertex)}`, v);
                        return v;
                    });
                    for (const [a, b, c] of part.tris) extra.land.push(index[a], index[b], index[c]);
                }
                // The face between the two parts along the cut, where the step is open
                for (let k = 0; k + 1 < record.chain.length; k++) {
                    const a = record.chain[k], b = record.chain[k + 1];
                    if (a.tau >= 1 && b.tau >= 1) continue;
                    const fa = drawn.get(`f${k}`), fb = drawn.get(`f${k + 1}`), ba = drawn.get(`b${k}`), bb = drawn.get(`b${k + 1}`);
                    if (fa === undefined || fb === undefined || ba === undefined || bb === undefined) continue;
                    // Wound to face out from the wall, the side it is seen from
                    const px = extra.positions[(fa - vertexCount) * 3], pz = extra.positions[(fa - vertexCount) * 3 + 2], qx = extra.positions[(fb - vertexCount) * 3], qz = extra.positions[(fb - vertexCount) * 3 + 2];
                    const out = (qz - pz) * a.nx - (qx - px) * a.nz > 0;
                    const at4 = (out ? [fa, fb, bb, ba] : [fb, fa, ba, bb]).map(v => { const o = (v - vertexCount) * 3; const w = add(extra.positions[o], extra.positions[o + 1], extra.positions[o + 2], extra.shades.slice(o, o + 3)); extra.flat.push(w); return w; });
                    extra.faces.push(at4[0], at4[1], at4[2], at4[0], at4[2], at4[3]);
                }
                // A cut's end on the tile's edge: the heights of the two parts there
                [0, record.chain.length - 1].forEach(k => {
                    const vertex = record.chain[k];
                    const fi = (vertex.x - baseX) / WorldData.CELL_M, fj = (vertex.z - baseZ) / WorldData.CELL_M;
                    const edge = Math.abs(fj) < 1e-7 ? 0 : Math.abs(fj - cells) < 1e-7 ? 1 : Math.abs(fi) < 1e-7 ? 2 : Math.abs(fi - cells) < 1e-7 ? 3 : -1;
                    const f = drawn.get(`f${k}`), b = drawn.get(`b${k}`);
                    if (edge < 0 || f === undefined || b === undefined) return;
                    const t = edge < 2 ? fi : fj, seg = Math.max(0, Math.min(cells - 1, Math.floor(t)));
                    // Which of the two parts holds the edge's node before the cut
                    const before = edge < 2 ? [seg, edge === 0 ? 0 : cells] : [edge === 2 ? 0 : cells, seg];
                    const frontFirst = record.front.verts.some(v => v.node >= 0 && record.nodes[v.node][0] === before[0] && record.nodes[v.node][1] === before[1]);
                    edgeCuts.set(edge * 128 + seg, { f, b, frontFirst });
                });
            }
        }
        // Skirts: a copy of each edge vertex, dropped to the lowest the edge is drawn at any LOD, joined to the edge
        const edges = [
            (k) => k,                          // z = 0 row
            (k) => (side - 1) * side + k,      // z = max row
            (k) => k * side,                   // x = 0 column
            (k) => k * side + side - 1         // x = max column
        ];
        // The same edges in nodes of the tile: k nodes along it -> [i, j]
        const last = n - 1;
        const lines = [m => [m, 0], m => [m, last], m => [0, m], m => [last, m]];
        const memo = new Map();
        // A coarser tile's skirt reaches down to its edge as the tile beside it draws it laid back at full detail
        // (TerrainMesh.laidBack lowers the same nodes there): hung from the nodes' own heights only, it ended over
        // the lowered edge and the rider saw through the seam, 700 m off
        const laidEdge = lod > 0 ? TerrainMesh.laidBack(tile, near).lowered : null;
        edges.forEach((edge, e) => {
            const first = side * side + e * side;
            for (let k = 0; k < side; k++) {
                const from = edge(k);
                let depth = TerrainMesh.skirtDepth(tile, lod, k * stride, lines[e], near, positions[from * 3 + 1], memo);
                if (laidEdge && laidEdge.size) {
                    for (let m = Math.max(0, (k - 1) * stride); m <= Math.min(last, (k + 1) * stride); m++) {
                        const [i, j] = lines[e](m);
                        const low = laidEdge.get(j * n + i);
                        if (low !== undefined) depth = Math.max(depth, positions[from * 3 + 1] - low + 0.5);
                    }
                }
                copy(first + k, from, depth);
            }
            for (let k = 0; k + 1 < side; k++) {
                const a = edge(k), b = edge(k + 1), c = first + k, d = first + k + 1;
                const cut = edgeCuts.get(e * 128 + k);
                if (cut) {
                    // The skirt hangs from each part of the cut edge, as deep as the deeper of its two neighbours
                    const low = Math.min(positions[c * 3 + 1], positions[d * 3 + 1]);
                    const hang = v => { const o = (v - vertexCount) * 3; extra.positions.push(extra.positions[o], Math.min(low, extra.positions[o + 1] - TerrainMesh.SKIRT_M), extra.positions[o + 2]); extra.shades.push(extra.shades[o], extra.shades[o + 1], extra.shades[o + 2]); const w = vertexCount + extra.positions.length / 3 - 1; extra.flat.push(w); return w; };
                    const [p, q] = cut.frontFirst ? [cut.f, cut.b] : [cut.b, cut.f];
                    extra.faces.push(a, c, p, p, c, hang(p), q, hang(q), b, b, hang(q), d);
                    continue;
                }
                indices[at++] = a; indices[at++] = c; indices[at++] = b;
                indices[at++] = b; indices[at++] = c; indices[at++] = d;
            }
        });
        // The land's triangles first (the nodes' own, then the cut ones), then the skirts and the closing faces
        const gridLand = cells * cells * 6 - (cuts ? cuts.size * 3 : 0);
        let landCount = gridLand;
        let positionsAll = positions, shadesAll = shades;
        if (cuts) {
            const rest = indices.subarray(gridLand, at);
            const joined = new Uint32Array(gridLand + extra.land.length + rest.length + extra.faces.length + crowns.length * sides * 3);
            joined.set(indices.subarray(0, gridLand), 0);
            joined.set(extra.land, gridLand);
            joined.set(rest, gridLand + extra.land.length);
            joined.set(extra.faces, gridLand + extra.land.length + rest.length);
            at = gridLand + extra.land.length + rest.length + extra.faces.length;
            landCount = gridLand + extra.land.length;
            indices = joined;
            positionsAll = new Float32Array(positions.length + extra.positions.length);
            positionsAll.set(positions, 0);
            positionsAll.set(extra.positions, positions.length);
            shadesAll = new Float32Array(shades.length + extra.shades.length);
            shadesAll.set(shades, 0);
            shadesAll.set(extra.shades, shades.length);
        }
        const crown = LandShade.PALETTE.forest.map(TerrainMesh.toLinear);
        const tint = [0, 0, 0];
        crowns.forEach((c, k) => {
            const apex = ground + k * (sides + 1);
            tint[0] = crown[0] * c.c * 1.12; tint[1] = crown[1] * c.c * 1.12; tint[2] = crown[2] * c.c * 1.12;
            put(apex, c.x, c.y + c.h, c.z, tint);
            tint[0] = crown[0] * c.c; tint[1] = crown[1] * c.c; tint[2] = crown[2] * c.c;
            for (let e = 0; e < sides; e++) {
                const turn = (e / sides) * Math.PI * 2 + c.c * 3;
                put(apex + 1 + e, c.x + c.r * Math.cos(turn), c.y, c.z + c.r * Math.sin(turn), tint);
            }
            for (let e = 0; e < sides; e++) {
                indices[at++] = apex; indices[at++] = apex + 1 + ((e + 1) % sides); indices[at++] = apex + 1 + e;
            }
        });
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positionsAll, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(shadesAll, 3));
        // Already linear (TerrainMesh.colours): Graphics.fixColorSpaces leaves it alone
        geometry.userData.linearColors = true;
        // Lit from the land's own triangles only, and each skirt vertex as the edge vertex it hangs from: a skirt is
        // the land closed down to its neighbour, so it reads as the hillside above it, and the edge keeps the land's
        // shade (a skirt's sideways normal averaged into it drew a dark line along every tile edge)
        geometry.setIndex(new THREE.BufferAttribute(indices.subarray(0, landCount), 1));
        geometry.computeVertexNormals();
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        const lit = geometry.attributes.normal.array;
        // A cut triangle lays its own vertices along the cut, so two cut triangles that share an edge each lit their
        // own copy of the vertex on it by their own parts only: the land in front of a wall showed every cell's edge
        // as a straight crease across the bank at the wall's end. The copies that stand at one place are lit alike
        if (extra.land.length) {
            const groups = new Map();
            for (const v of new Set(extra.land)) {
                if (v < vertexCount) continue;
                const id = `${Math.round(positionsAll[v * 3] * 1000)},${Math.round(positionsAll[v * 3 + 1] * 1000)},${Math.round(positionsAll[v * 3 + 2] * 1000)}`;
                (groups.get(id) || groups.set(id, []).get(id)).push(v);
            }
            for (const group of groups.values()) {
                if (group.length < 2) continue;
                let nx = 0, ny = 0, nz = 0;
                for (const v of group) { nx += lit[v * 3]; ny += lit[v * 3 + 1]; nz += lit[v * 3 + 2]; }
                const l = Math.hypot(nx, ny, nz) || 1;
                for (const v of group) { lit[v * 3] = nx / l; lit[v * 3 + 1] = ny / l; lit[v * 3 + 2] = nz / l; }
            }
        }
        // A closing face and a cut's skirt are lit as the land above them
        for (const v of extra.flat) { lit[v * 3] = 0; lit[v * 3 + 1] = 1; lit[v * 3 + 2] = 0; }
        edges.forEach((edge, e) => {
            for (let k = 0; k < side; k++) {
                const to = side * side + e * side + k, from = edge(k);
                lit[to * 3] = lit[from * 3]; lit[to * 3 + 1] = lit[from * 3 + 1]; lit[to * 3 + 2] = lit[from * 3 + 2];
            }
        });
        // A crown clump is lit as canopy seen from afar, mostly from above: a cone's own normals put half of every
        // clump in black shade and draw it as a spike
        const normals = geometry.attributes.normal.array;
        crowns.forEach((c, k) => {
            const apex = ground + k * (sides + 1);
            normals[apex * 3] = 0; normals[apex * 3 + 1] = 1; normals[apex * 3 + 2] = 0;
            for (let e = 0; e < sides; e++) {
                const v = apex + 1 + e;
                const dx = positions[v * 3] - c.x, dz = positions[v * 3 + 2] - c.z;
                const len = Math.hypot(dx, dz) || 1;
                const nx = (dx / len) * 0.35, nz = (dz / len) * 0.35, l = Math.hypot(nx, 1, nz);
                normals[v * 3] = nx / l; normals[v * 3 + 1] = 1 / l; normals[v * 3 + 2] = nz / l;
            }
        });
        geometry.computeBoundingSphere();
        const mesh = new THREE.Mesh(geometry, TerrainMesh.material());
        mesh.name = `world-terrain-${tile.key}-lod${lod}`;
        mesh.receiveShadow = true;
        mesh.userData.world = 'terrain';
        mesh.userData.tile = tile.key;
        // What a check needs to read the mesh on its own triangles (TerrainMesh.drawnAt): its cuts, and the vertices
        // of what closes a step (the cuts' faces and skirts), which are no land seen from above
        mesh.userData.lod = lod;
        mesh.userData.cuts = cuts;
        mesh.userData.closing = extra.flat;
        // Where each kind of triangle lies in the index: the land's own (from 0), then the tile's skirts, then the
        // faces that close the cuts' steps with the cut edges' skirts ([start, count])
        mesh.userData.parts = { land: landCount, faces: cuts ? [at - crowns.length * sides * 3 - extra.faces.length, extra.faces.length] : [0, 0] };
        return { mesh, triangles: indices.length / 3 };
    }
}
