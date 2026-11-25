// Horizon: the far land as one mesh, built from far.bin (a 100 m grid over the
// ride's box plus its surround). It is drawn a few metres under the true height,
// so wherever a resident tile stands (at true height) it hides the far mesh: that
// is the "hole under the tiles" without a hole to cut. Where the grid has no
// data the cell is left out. The mesh keeps to about 60 000 triangles by taking
// every `stride`-th grid node of a large grid.
//
// FarLand: the levels beyond far.bin (tools/world/farland.mjs), out to 40 km. A
// level leaves out each cell that lies wholly inside the box of the level within
// it, and sinks its vertices inside that box, so a cell across the edge runs
// under the finer land: no seam opens and no two surfaces fight for the depth.
//
// Both colour the land from the cover shares of each vertex (LandShade.farColor)
// and drop with the Earth's curvature in the vertex shader (LandShade.patch).
class Horizon {
    // Metres under the true height the far mesh is drawn
    static get SINK_M() { return 8; }

    static get MAX_TRIANGLES() { return 60000; }

    static strideFor(far) {
        const cells = (far.nx - 1) * (far.nz - 1);
        return Math.max(1, Math.ceil(Math.sqrt((cells * 2) / Horizon.MAX_TRIANGLES)));
    }

    static material() {
        // Detail too: off the tiles (a photo stop up a slope) the horizon is the ground underfoot
        if (!Horizon.sharedMaterial) Horizon.sharedMaterial = LandShade.patch(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), { curvature: true, detail: true });
        return Horizon.sharedMaterial;
    }

    // Slope (1 - normal.y) and north facing of a grid at node (i, j), from its neighbours
    static slopeAt(heightAt, i, j, cell) {
        const gx = (heightAt(i + 1, j) - heightAt(i - 1, j)) / (2 * cell), gz = (heightAt(i, j + 1) - heightAt(i, j - 1)) / (2 * cell);
        const len = Math.sqrt(gx * gx + gz * gz + 1);
        const across = Math.sqrt(gx * gx + gz * gz) / len;
        return { slope: 1 - 1 / len, north: across > 0.02 ? (gz / len / across) * Math.min(1, across * 4) : 0 };
    }

    // A grid {x0, z0, nx, nz, cell} with height(i, j) (NaN for no data) and shares(v) (4 numbers 0 to 1, or null),
    // drawn every `stride` nodes. `sinkAt(x, z)` gives the metres a vertex is drawn under its height; `skipCell(x0, z0,
    // x1, z1)` leaves a cell out. Returns {mesh, triangles}.
    static grid(grid, { height, shares = null, stride = 1, sinkAt = () => 0, skipCell = null, name, keep = false }) {
        const nx = Math.floor((grid.nx - 1) / stride) + 1, nz = Math.floor((grid.nz - 1) / stride) + 1;
        const positions = new Float32Array(nx * nz * 3);
        const colours = new Float32Array(nx * nz * 3);
        const missing = new Uint8Array(nx * nz);
        const cell = grid.cell * stride;
        const at = (i, j) => {
            const h = height(Math.max(0, Math.min(grid.nx - 1, i)), Math.max(0, Math.min(grid.nz - 1, j)));
            return Number.isNaN(h) ? height(Math.max(0, Math.min(grid.nx - 1, i - Math.sign(i))), j) : h;
        };
        const colour = [0, 0, 0];
        const share = [0, 0, 0, 0];
        for (let j = 0; j < nz; j++) {
            for (let i = 0; i < nx; i++) {
                const gi = i * stride, gj = j * stride;
                const raw = height(gi, gj);
                const v = j * nx + i;
                const x = grid.x0 + gi * grid.cell, z = grid.z0 + gj * grid.cell;
                if (Number.isNaN(raw)) missing[v] = 1;
                const y = Number.isNaN(raw) ? 0 : raw;
                positions[v * 3] = x;
                positions[v * 3 + 1] = y - sinkAt(x, z);
                positions[v * 3 + 2] = z;
                const { slope, north } = Number.isNaN(raw) ? { slope: 0, north: 0 } : Horizon.slopeAt((a, b) => { const h = at(a, b); return Number.isNaN(h) ? y : h; }, gi, gj, grid.cell);
                const s = shares ? shares(gj * grid.nx + gi, share) : null;
                LandShade.farColor(x, z, y, slope, north, s || [0, 0, 0, 0], colour);
                colours[v * 3] = colour[0]; colours[v * 3 + 1] = colour[1]; colours[v * 3 + 2] = colour[2];
            }
        }
        const indices = [];
        for (let j = 0; j + 1 < nz; j++) {
            for (let i = 0; i + 1 < nx; i++) {
                const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
                if (missing[a] || missing[b] || missing[c] || missing[d]) continue;
                if (skipCell && skipCell(positions[a * 3], positions[a * 3 + 2], positions[d * 3], positions[d * 3 + 2])) continue;
                indices.push(a, c, b, b, c, d);
            }
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();
        const mesh = new THREE.Mesh(geometry, Horizon.material());
        mesh.name = name;
        mesh.frustumCulled = false;
        // The grid as drawn, for the tiles' edge at the window (Horizon.edgeTextures): its colours as built (sRGB,
        // before Graphics.fixColorSpaces decodes them in place) and its normals
        if (keep) mesh.userData.drawn = { x0: grid.x0, z0: grid.z0, cell, nx, nz, colours: colours.slice(), normals: geometry.attributes.normal.array.slice(), missing };
        return { mesh, triangles: indices.length / 3 };
    }

    // The far grid's colour (sRGB, alpha 0 where it has no data) and normal (0.5 + n / 2) at each of its vertices, as
    // two textures a tile's shader reads where it meets the far land (LandShade.patch `edge`), and the box they span:
    // [x0, z0, x1, z1] of the vertices' centres
    static edgeTextures(mesh) {
        const d = mesh.userData.drawn;
        if (!d) return null;
        const count = d.nx * d.nz, colour = new Uint8Array(count * 4), normal = new Uint8Array(count * 4);
        const byte = v => Math.max(0, Math.min(255, Math.round(v * 255)));
        for (let v = 0; v < count; v++) {
            for (let c = 0; c < 3; c++) {
                colour[v * 4 + c] = byte(d.colours[v * 3 + c]);
                normal[v * 4 + c] = byte(0.5 + d.normals[v * 3 + c] / 2);
            }
            colour[v * 4 + 3] = d.missing[v] ? 0 : 255;
            normal[v * 4 + 3] = 255;
        }
        const texture = data => {
            const t = new THREE.DataTexture(data, d.nx, d.nz, THREE.RGBAFormat, THREE.UnsignedByteType);
            t.magFilter = THREE.LinearFilter;
            t.minFilter = THREE.LinearFilter;
            t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
            t.needsUpdate = true;
            return t;
        };
        return { colour: texture(colour), normal: texture(normal), nx: d.nx, nz: d.nz, box: [d.x0, d.z0, d.x0 + (d.nx - 1) * d.cell, d.z0 + (d.nz - 1) * d.cell] };
    }

    // The 4 cover shares (0 to 1) of vertex v from a Uint8Array of 4 bytes per vertex
    static sharesOf(bytes) {
        if (!bytes) return null;
        return (v, out) => {
            for (let k = 0; k < 4; k++) out[k] = bytes[v * 4 + k] / 255;
            return out;
        };
    }

    // {mesh, triangles} for a far grid {x0, z0, nx, nz, cell, data} and, when given, the cover shares of its vertices
    // and the metres each vertex is sunk (far/sink0.bin: deeper under the tiles, where the grid would poke through)
    static build(far, cover = null, sinks = null) {
        const sunk = sinks && sinks.length === far.nx * far.nz ? sinks : null;
        const built = Horizon.grid(far, {
            height: (i, j) => { const raw = far.data[j * far.nx + i]; return raw === -32768 ? NaN : raw; },
            shares: cover && cover.length === far.nx * far.nz * 4 ? Horizon.sharesOf(cover) : null,
            stride: Horizon.strideFor(far),
            sinkAt: (x, z) => (sunk ? sunk[Math.round((z - far.z0) / far.cell) * far.nx + Math.round((x - far.x0) / far.cell)] : Horizon.SINK_M),
            name: 'world-horizon',
            keep: true
        });
        built.mesh.userData.world = 'horizon';
        return built;
    }
}

class FarLand {
    // Metres a level's vertex inside the box of the level within it is sunk, per km from the camera's likely place
    // (the depth buffer's step grows with distance: about d^2 / (near 2^24))
    static get SINK_M() { return [40, 160]; }

    // The box a grid covers: [x0, z0, x1, z1]
    static box(grid) { return [grid.x0, grid.z0, grid.x0 + (grid.nx - 1) * grid.cell, grid.z0 + (grid.nz - 1) * grid.cell]; }

    // [{mesh, triangles}] for the levels [{x0, z0, nx, nz, cell, heights, shares}], each inside-out of `inner`
    // (far.bin's grid, then each level in turn)
    static build(levels, inner) {
        const out = [];
        let within = FarLand.box(inner);
        levels.forEach((level, k) => {
            const [bx0, bz0, bx1, bz1] = within;
            const inside = (x, z) => x > bx0 && x < bx1 && z > bz0 && z < bz1;
            const sink = FarLand.SINK_M[Math.min(k, FarLand.SINK_M.length - 1)];
            const built = Horizon.grid(level, {
                height: (i, j) => { const raw = level.heights[j * level.nx + i]; return raw === -32768 ? NaN : raw; },
                shares: Horizon.sharesOf(level.shares),
                sinkAt: (x, z) => (inside(x, z) ? sink : 0),
                skipCell: (x0, z0, x1, z1) => x0 >= bx0 && x1 <= bx1 && z0 >= bz0 && z1 <= bz1,
                name: `world-farland-${k + 1}`
            });
            built.mesh.userData.world = 'farland';
            out.push(built);
            within = FarLand.box(level);
        });
        return out;
    }
}
