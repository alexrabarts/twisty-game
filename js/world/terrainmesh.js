// TerrainMesh: one 512 m height tile as a vertex-coloured mesh.
//   LOD0: a vertex every 8 m  (64 x 64 cells, 8 192 triangles) within 700 m
//   LOD1: every 16 m          (2 048 triangles) to 2 km
//   LOD2: every 32 m          (512 triangles) beyond
// A 3 m skirt hangs from every tile edge, so the crack between two tiles of
// different detail is never open to the sky. Colours come from the land cover
// class (16 m cells) and the tile's zone layer: the carved road and bench are
// bare ground, a wall or drop is rock, and the height fades grass into rock.
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
        return [
            [0.42, 0.52, 0.28], // none
            [0.17, 0.30, 0.17], // forest
            [0.27, 0.40, 0.22], // open forest
            [0.52, 0.50, 0.47], // rock
            [0.60, 0.57, 0.53], // scree
            [0.40, 0.55, 0.28], // grass
            [0.90, 0.93, 0.95], // glacier
            [0.22, 0.42, 0.58], // water
            [0.50, 0.48, 0.42]  // settlement
        ];
    }

    static get BARE() { return TerrainMesh.sharedBARE || (TerrainMesh.sharedBARE = [0.36, 0.31, 0.26]); }
    static get ROCK() { return TerrainMesh.sharedROCK || (TerrainMesh.sharedROCK = [0.50, 0.48, 0.45]); }
    static get SNOW() { return TerrainMesh.sharedSNOW || (TerrainMesh.sharedSNOW = [0.92, 0.94, 0.96]); }

    static material() {
        if (!TerrainMesh.sharedMaterial) TerrainMesh.sharedMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
        return TerrainMesh.sharedMaterial;
    }

    // Triangles of a tile at an LOD, skirts included
    static triangles(lod) {
        const cells = 64 >> lod;
        return cells * cells * 2 + cells * 4 * 2;
    }

    static colorAt(tile, cover, i, j, y) {
        const n = WorldData.TILE_N;
        const zone = tile.zones[j * n + i];
        const zones = WorldData.ZONE;
        let c;
        if (zone === zones.road || zone === zones.bench) c = TerrainMesh.BARE;
        else if (zone === zones.wall || zone === zones.drop) c = TerrainMesh.ROCK;
        else if (zone === zones.water) c = TerrainMesh.COVER_COLORS[7];
        else if (cover) {
            const ci = Math.min(WorldData.COVER_N - 1, Math.floor((i * WorldData.CELL_M) / 16));
            const cj = Math.min(WorldData.COVER_N - 1, Math.floor((j * WorldData.CELL_M) / 16));
            c = TerrainMesh.COVER_COLORS[cover[cj * WorldData.COVER_N + ci]] || TerrainMesh.COVER_COLORS[5];
        } else c = TerrainMesh.COVER_COLORS[5];
        // Above the tree line, grass and forest go to rock, and above 2 500 m to snow
        if (zone === zones.terrain && y > 1900) {
            const rock = Math.min(1, (y - 1900) / 400);
            const snow = Math.max(0, Math.min(1, (y - 2500) / 300));
            const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
            c = mix(mix(c, TerrainMesh.ROCK, rock), TerrainMesh.SNOW, snow);
        }
        return c;
    }

    // The mesh of tile (tx, tz): {mesh, triangles}. `cover` may be null (grass everywhere).
    static build(tile, cover, lod) {
        const n = WorldData.TILE_N;
        const stride = 1 << lod;
        const cells = (n - 1) / stride;
        const side = cells + 1;
        const skirt = TerrainMesh.SKIRT_M;
        const baseX = tile.tx * WorldData.TILE_M, baseZ = tile.tz * WorldData.TILE_M;
        const vertexCount = side * side + side * 4;
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
        for (let b = 0; b < side; b++) {
            for (let a = 0; a < side; a++) {
                const i = a * stride, j = b * stride;
                const y = tile.heights[j * n + i];
                const zone = tile.zones[j * n + i];
                const carved = zone === WorldData.ZONE.road || zone === WorldData.ZONE.bench;
                put(b * side + a, baseX + i * WorldData.CELL_M, carved ? y - TerrainMesh.SINK_M : y, baseZ + j * WorldData.CELL_M, TerrainMesh.colorAt(tile, cover, i, j, y));
            }
        }
        const indices = new Uint32Array(cells * cells * 6 + 4 * cells * 6);
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
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(shades, 3));
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();
        const mesh = new THREE.Mesh(geometry, TerrainMesh.material());
        mesh.name = `world-terrain-${tile.key}-lod${lod}`;
        mesh.receiveShadow = true;
        mesh.userData.world = 'terrain';
        mesh.userData.tile = tile.key;
        return { mesh, triangles: indices.length / 3 };
    }
}
