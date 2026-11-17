// Horizon: the far land as one mesh, built from far.bin (a 100 m grid over the
// ride's box plus its surround). It is drawn a few metres under the true height,
// so wherever a resident tile stands (at true height) it hides the far mesh: that
// is the "hole under the tiles" without a hole to cut. Where the grid has no
// data the cell is left out. The mesh keeps to about 60 000 triangles by taking
// every `stride`-th grid node of a large grid.
class Horizon {
    // Metres under the true height the far mesh is drawn
    static get SINK_M() { return 8; }

    static get MAX_TRIANGLES() { return 60000; }

    static strideFor(far) {
        const cells = (far.nx - 1) * (far.nz - 1);
        return Math.max(1, Math.ceil(Math.sqrt((cells * 2) / Horizon.MAX_TRIANGLES)));
    }

    static colorAt(y) {
        const rock = Math.max(0, Math.min(1, (y - 1700) / 500));
        const snow = Math.max(0, Math.min(1, (y - 2400) / 300));
        const grass = [0.33, 0.46, 0.25], stone = [0.50, 0.48, 0.45], ice = [0.92, 0.94, 0.96];
        const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
        return lerp(lerp(grass, stone, rock), ice, snow);
    }

    // {mesh, triangles} for a far grid {x0, z0, nx, nz, cell, data}
    static build(far) {
        const stride = Horizon.strideFor(far);
        const nx = Math.floor((far.nx - 1) / stride) + 1, nz = Math.floor((far.nz - 1) / stride) + 1;
        const positions = new Float32Array(nx * nz * 3);
        const shades = new Float32Array(nx * nz * 3);
        const missing = new Uint8Array(nx * nz);
        for (let j = 0; j < nz; j++) {
            for (let i = 0; i < nx; i++) {
                const raw = far.data[j * stride * far.nx + i * stride];
                const v = j * nx + i;
                if (raw === -32768) missing[v] = 1;
                const y = raw === -32768 ? 0 : raw - Horizon.SINK_M;
                positions[v * 3] = far.x0 + i * stride * far.cell;
                positions[v * 3 + 1] = y;
                positions[v * 3 + 2] = far.z0 + j * stride * far.cell;
                const c = Horizon.colorAt(raw);
                shades[v * 3] = c[0]; shades[v * 3 + 1] = c[1]; shades[v * 3 + 2] = c[2];
            }
        }
        const indices = [];
        for (let j = 0; j + 1 < nz; j++) {
            for (let i = 0; i + 1 < nx; i++) {
                const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
                if (missing[a] || missing[b] || missing[c] || missing[d]) continue;
                indices.push(a, c, b, b, c, d);
            }
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(shades, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();
        const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
        mesh.name = 'world-horizon';
        mesh.frustumCulled = false;
        mesh.userData.world = 'horizon';
        return { mesh, triangles: indices.length / 3 };
    }
}
