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
//
// FarLand.join closes each level onto the one round it: a skirt hangs from the inner grid's outer edge down under the
// outer level drawn there, and the inner grid's colours and normals run into the outer's over the last JOIN_CELLS of
// the outer's cells, so the edge shows neither a crack (the sky through the land) nor a line of a new tone.
class Horizon {
    // Metres under the true height the far mesh is drawn
    static get SINK_M() { return 8; }

    static get MAX_TRIANGLES() { return 60000; }

    // The box the far grid is drawn over at its stride: [x0, z0, x1, z1]. A grid whose side is no whole number of
    // strides is drawn short of its own box by up to a stride less one cell (the levels round it must start there)
    static drawnBox(far) {
        const stride = Horizon.strideFor(far);
        return [far.x0, far.z0, far.x0 + Math.floor((far.nx - 1) / stride) * stride * far.cell, far.z0 + Math.floor((far.nz - 1) / stride) * stride * far.cell];
    }

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
        // (the normals of the land as it stands: the sink hides the grid under the land within it, and a sunk vertex
        // lit by the slope down to it read as a line of a new tone where the grid meets the land round it)
        const sunk = Float32Array.from(positions);
        for (let v = 0; v < nx * nz; v++) positions[v * 3 + 1] += sinkAt(positions[v * 3], positions[v * 3 + 2]);
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        geometry.setAttribute('position', new THREE.BufferAttribute(sunk, 3));
        geometry.computeBoundingSphere();
        const mesh = new THREE.Mesh(geometry, Horizon.material());
        mesh.name = name;
        mesh.frustumCulled = false;
        // The lattice of the grid's own vertices (the first nx * nz), for FarLand.join and the checks
        mesh.userData.lattice = { x0: grid.x0, z0: grid.z0, cell, nx, nz };
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
    // (far.bin's grid as drawn at its stride, Horizon.drawnBox, then each level in turn). With `horizon` (far.bin's
    // mesh as drawn) each level is tucked under the grid within it (FarLand.tuck)
    static build(levels, inner, horizon = null) {
        const out = [];
        let within = Horizon.drawnBox(inner), mesh = horizon;
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
            if (mesh) FarLand.tuck(built.mesh, mesh, within);
            built.mesh.userData.world = 'farland';
            out.push(built);
            within = FarLand.box(level);
            mesh = built.mesh;
        });
        return out;
    }

    // Metres a level stays under the grid within it, and the passes and the least share of a triangle's sunk corners
    // FarLand.tuck works with
    static get UNDER_M() { return 4; }
    static get TUCK_PASSES() { return 4; }
    static get TUCK_SHARE() { return 0.25; }

    // Lowers the vertices of a level (a grid mesh) inside `box` (the grid within it, `inner`, a grid mesh) until its
    // triangles there stand UNDER_M under the inner grid, read at each of the inner grid's cells. A level is coarser
    // and its sink alone (SINK_M) does not keep it under: a 250 m node on a ridge stood 3 m over far.bin's land drawn
    // there (airolo-lookout), and its triangles stood through far.bin with their open edges in the air, the sky seen
    // past them (world-far-seams). A point where the sunk corners' share of the triangle is under TUCK_SHARE (within
    // a quarter of a cell of the box's edge) is left to the inner grid's skirt (FarLand.join)
    static tuck(mesh, inner, box) {
        const g = mesh.userData.lattice, pos = mesh.geometry.attributes.position.array;
        const [bx0, bz0, bx1, bz1] = box;
        // (a vertex on the box's line too: the inner grid's rim stands there, and a level whose lattice falls on the
        // line kept its vertex there at its height, over far.bin's sunk rim, on susten's west edge)
        const inside = v => { const x = pos[v * 3], z = pos[v * 3 + 2]; return x >= bx0 && x <= bx1 && z >= bz0 && z <= bz1; };
        // (read on a lattice a quarter of the inner grid's cell, laid on its nodes: the inner grid is lowest at a node
        // of its own, and both grids are straight between their nodes)
        const n = inner.userData.lattice, step = n.cell / 4;
        const first = (from, origin) => origin + Math.ceil((from - origin) / step) * step;
        for (let pass = 0; pass < FarLand.TUCK_PASSES; pass++) {
            let moved = 0;
            for (let z = first(bz0, n.z0); z <= bz1; z += step) {
                const fz = (z - g.z0) / g.cell, j = Math.min(g.nz - 2, Math.floor(fz)), fw = fz - j;
                if (j < 0) continue;
                for (let x = first(bx0, n.x0); x <= bx1; x += step) {
                    const fx = (x - g.x0) / g.cell, i = Math.min(g.nx - 2, Math.floor(fx)), fu = fx - i;
                    if (i < 0) continue;
                    const a = j * g.nx + i, b = a + 1, c = a + g.nx, d = c + 1;
                    const corners = fu + fw <= 1 ? [[a, 1 - fu - fw], [b, fu], [c, fw]] : [[d, fu + fw - 1], [b, 1 - fw], [c, 1 - fu]];
                    let y = 0, share = 0;
                    for (const [v, f] of corners) { y += pos[v * 3 + 1] * f; if (inside(v)) share += f; }
                    if (share < FarLand.TUCK_SHARE) continue;
                    const at = FarLand.sample(inner, x, z);
                    if (!at) continue;
                    const over = y - (at.y - FarLand.UNDER_M);
                    if (over <= 0) continue;
                    for (const [v] of corners) if (inside(v)) pos[v * 3 + 1] -= over / share;
                    moved++;
                }
            }
            if (!moved) break;
        }
        // (the normals stay those of the land as it stands, Horizon.grid)
        mesh.geometry.attributes.position.needsUpdate = true;
        mesh.geometry.computeBoundingSphere();
    }

    // The far land of a world's data as drawn: far.bin's grid (Horizon.build, with its cover shares and sinks) and the
    // levels round it (FarLand.build), each closed onto the next (FarLand.join). {horizon, levels, triangles}
    static assemble(far, cover, sinks, levels) {
        const horizon = Horizon.build(far, cover, sinks);
        const outer = FarLand.build(levels || [], far, horizon.mesh);
        let triangles = horizon.triangles + outer.reduce((n, o) => n + o.triangles, 0);
        const meshes = [horizon.mesh, ...outer.map(o => o.mesh)];
        meshes.forEach((mesh, k) => { triangles += FarLand.join(mesh, meshes[k + 1]); });
        return { horizon: horizon.mesh, levels: outer.map(o => o.mesh), triangles };
    }

    // Metres the skirt's foot stands under the outer level, and the least height of a skirt
    static get SKIRT_UNDER_M() { return 4; }
    static get SKIRT_MIN_M() { return 4; }
    static get SKIRT_STEP_M() { return 10; }

    // Outer cells over which the inner grid's colours and normals run into the outer level's
    static get JOIN_CELLS() { return 2; }

    // The drawn height, colour and normal of a grid mesh at (x, z), on its own triangles (a cell split on the 01-10
    // diagonal, Horizon.grid), from its first nx * nz vertices; null off the lattice
    static sample(mesh, x, z) {
        const g = mesh.userData.lattice;
        const fx = (x - g.x0) / g.cell, fz = (z - g.z0) / g.cell;
        if (fx < 0 || fz < 0 || fx > g.nx - 1 || fz > g.nz - 1) return null;
        const i = Math.min(g.nx - 2, Math.floor(fx)), j = Math.min(g.nz - 2, Math.floor(fz));
        const u = fx - i, v = fz - j;
        const a = j * g.nx + i, b = a + 1, c = a + g.nx, d = c + 1;
        // (weights of the three corners of the triangle (u, v) lies in)
        const w = u + v <= 1 ? [[a, 1 - u - v], [b, u], [c, v]] : [[d, u + v - 1], [b, 1 - v], [c, 1 - u]];
        const geometry = mesh.geometry, pos = geometry.attributes.position.array, col = geometry.attributes.color.array, nor = geometry.attributes.normal.array;
        const out = { y: 0, colour: [0, 0, 0], normal: [0, 0, 0] };
        for (const [k, f] of w) {
            out.y += pos[k * 3 + 1] * f;
            for (let c3 = 0; c3 < 3; c3++) { out.colour[c3] += col[k * 3 + c3] * f; out.normal[c3] += nor[k * 3 + c3] * f; }
        }
        return out;
    }

    // The vertices of a lattice's outer ring in order round it
    static ring(g) {
        const out = [];
        for (let i = 0; i < g.nx - 1; i++) out.push(i);
        for (let j = 0; j < g.nz - 1; j++) out.push(j * g.nx + g.nx - 1);
        for (let i = g.nx - 1; i > 0; i--) out.push((g.nz - 1) * g.nx + i);
        for (let j = g.nz - 1; j > 0; j--) out.push(j * g.nx);
        return out;
    }

    // Closes `inner` (a grid mesh: the far grid or a level) onto `outer` (the level round it), in place, before any
    // colour is made linear. A skirt hangs from each vertex of the inner grid's outer ring to SKIRT_UNDER_M under the
    // lowest the outer level is drawn along the ring's two edges at that vertex (SKIRT_MIN_M at the least), with the
    // edge vertex's colour and normal: a ray over the inner grid's edge meets the skirt or the outer land, never the
    // sky. Within JOIN_CELLS of the outer's cells of the edge each inner vertex takes the outer's colour and normal,
    // all of them at the edge. Returns the skirt's triangles
    static join(inner, outer) {
        const g = inner.userData.lattice;
        if (!g || !outer || !outer.userData.lattice) return 0;
        const geometry = inner.geometry;
        const count = g.nx * g.nz;
        const pos = geometry.attributes.position.array, col = geometry.attributes.color.array, nor = geometry.attributes.normal.array;
        const x1 = g.x0 + (g.nx - 1) * g.cell, z1 = g.z0 + (g.nz - 1) * g.cell;
        const reach = FarLand.JOIN_CELLS * outer.userData.lattice.cell;
        // The run into the outer's colour and normal (the missing vertices, held at 0 and left out of the triangles,
        // are left as they are)
        for (let v = 0; v < count; v++) {
            const x = pos[v * 3], z = pos[v * 3 + 2];
            const edge = Math.min(x - g.x0, x1 - x, z - g.z0, z1 - z);
            if (edge >= reach) continue;
            const at = FarLand.sample(outer, x, z);
            if (!at) continue;
            const t = 1 - edge / reach;
            for (let c = 0; c < 3; c++) {
                col[v * 3 + c] += (at.colour[c] - col[v * 3 + c]) * t;
                nor[v * 3 + c] += (at.normal[c] - nor[v * 3 + c]) * t;
            }
            const len = Math.hypot(nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]) || 1;
            for (let c = 0; c < 3; c++) nor[v * 3 + c] /= len;
        }
        if (inner.userData.drawn) {
            inner.userData.drawn.colours = col.slice(0, count * 3);
            inner.userData.drawn.normals = nor.slice(0, count * 3);
        }
        // The skirt: the lowest of the outer land along the ring's edges either side of each ring vertex, read every
        // SKIRT_STEP_M (a foot under the lowest of both edges at each end is under the outer all along)
        const ring = FarLand.ring(g);
        const step = FarLand.SKIRT_STEP_M;
        const lowest = (a, b) => {
            const ax = pos[a * 3], az = pos[a * 3 + 2], bx = pos[b * 3], bz = pos[b * 3 + 2];
            const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
            let low = Infinity;
            for (let k = 0; k <= n; k++) {
                const at = FarLand.sample(outer, ax + (bx - ax) * k / n, az + (bz - az) * k / n);
                if (at) low = Math.min(low, at.y);
            }
            return low;
        };
        const lows = ring.map((v, k) => lowest(v, ring[(k + 1) % ring.length]));
        const extra = ring.length;
        const positions = new Float32Array((count + extra) * 3), colours = new Float32Array((count + extra) * 3), normals = new Float32Array((count + extra) * 3);
        positions.set(pos.subarray(0, count * 3));
        colours.set(col.subarray(0, count * 3));
        normals.set(nor.subarray(0, count * 3));
        ring.forEach((v, k) => {
            const s = count + k;
            const under = Math.min(lows[k], lows[(k + ring.length - 1) % ring.length]);
            const top = pos[v * 3 + 1];
            positions[s * 3] = pos[v * 3];
            positions[s * 3 + 1] = Math.min(top - FarLand.SKIRT_MIN_M, Number.isFinite(under) ? under - FarLand.SKIRT_UNDER_M : top - FarLand.SKIRT_MIN_M);
            positions[s * 3 + 2] = pos[v * 3 + 2];
            for (let c = 0; c < 3; c++) { colours[s * 3 + c] = col[v * 3 + c]; normals[s * 3 + c] = nor[v * 3 + c]; }
        });
        // (an edge of the ring with a missing vertex at either end has no land to close)
        const kept = new Set();
        const index = geometry.index.array;
        for (let t = 0; t < index.length; t++) kept.add(index[t]);
        const indices = Array.from(index);
        let added = 0;
        ring.forEach((v, k) => {
            const w = ring[(k + 1) % ring.length];
            if (!kept.has(v) || !kept.has(w)) return;
            const sv = count + k, sw = count + (k + 1) % ring.length;
            indices.push(v, sv, w, w, sv, sw);
            added += 2;
        });
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
        geometry.setIndex(indices);
        geometry.computeBoundingSphere();
        inner.userData.skirtFrom = count;
        return added;
    }
}
