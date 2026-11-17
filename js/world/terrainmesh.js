// TerrainMesh: one 512 m height tile as a vertex-coloured mesh.
//   LOD0: a vertex every 8 m  (64 x 64 cells, 8 192 triangles) within 700 m
//   LOD1: every 16 m          (2 048 triangles) to 2 km
//   LOD2: every 32 m          (512 triangles) beyond
// A 3 m skirt hangs from every tile edge, so the crack between two tiles of
// different detail is never open to the sky. Colours come from the land cover
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

    // The mesh of tile (tx, tz): {mesh, triangles}. `cover` may be null (grass everywhere). `holdY(x, y, z)`, when
    // given, may lower a carved vertex further (under the ride's road, WorldEnvironment.buildTile).
    static build(tile, cover, lod, holdY = null) {
        const n = WorldData.TILE_N;
        const stride = 1 << lod;
        const cells = (n - 1) / stride;
        const side = cells + 1;
        const skirt = TerrainMesh.SKIRT_M;
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
        const copy = (to, from) => {
            positions[to * 3] = positions[from * 3]; positions[to * 3 + 1] = positions[from * 3 + 1] - skirt; positions[to * 3 + 2] = positions[from * 3 + 2];
            shades[to * 3] = shades[from * 3]; shades[to * 3 + 1] = shades[from * 3 + 1]; shades[to * 3 + 2] = shades[from * 3 + 2];
        };
        const grid = TerrainMesh.colours(tile, cover);
        const linear = [0, 0, 0];
        for (let b = 0; b < side; b++) {
            for (let a = 0; a < side; a++) {
                const i = a * stride, j = b * stride;
                const y = tile.heights[j * n + i];
                const zone = tile.zones[j * n + i];
                const carved = zone === WorldData.ZONE.road || zone === WorldData.ZONE.bench;
                const x = baseX + i * WorldData.CELL_M, z = baseZ + j * WorldData.CELL_M;
                let drawnY = carved ? y - TerrainMesh.SINK_M : y;
                if (carved && holdY) drawnY = holdY(x, drawnY, z);
                const at = (j * n + i) * 3;
                linear[0] = grid[at]; linear[1] = grid[at + 1]; linear[2] = grid[at + 2];
                put(b * side + a, x, drawnY, z, linear);
            }
        }
        const indices = new Uint32Array(cells * cells * 6 + 4 * cells * 6 + crowns.length * sides * 3);
        let at = 0;
        for (let b = 0; b < cells; b++) {
            for (let a = 0; a < cells; a++) {
                const v00 = b * side + a, v10 = v00 + 1, v01 = v00 + side, v11 = v01 + 1;
                indices[at++] = v00; indices[at++] = v01; indices[at++] = v10;
                indices[at++] = v10; indices[at++] = v01; indices[at++] = v11;
            }
        }
        // Skirts: a copy of each edge vertex, dropped, joined to the edge
        const edges = [
            (k) => k,                          // z = 0 row
            (k) => (side - 1) * side + k,      // z = max row
            (k) => k * side,                   // x = 0 column
            (k) => k * side + side - 1         // x = max column
        ];
        edges.forEach((edge, e) => {
            const first = side * side + e * side;
            for (let k = 0; k < side; k++) {
                const from = edge(k);
                copy(first + k, from);
            }
            for (let k = 0; k + 1 < side; k++) {
                const a = edge(k), b = edge(k + 1), c = first + k, d = first + k + 1;
                indices[at++] = a; indices[at++] = c; indices[at++] = b;
                indices[at++] = b; indices[at++] = c; indices[at++] = d;
            }
        });
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
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(shades, 3));
        // Already linear (TerrainMesh.colours): Graphics.fixColorSpaces leaves it alone
        geometry.userData.linearColors = true;
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        geometry.computeVertexNormals();
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
        return { mesh, triangles: indices.length / 3 };
    }
}
