// Water: the lakes of a world drawn as water. The land under a lake is the lake's own surface (the elevation model
// reads the water, not the bed) and TerrainMesh paints it in the water colour; this draws a water surface over it, one
// mesh for each tile that holds water nodes (WorldData.ZONE.water), cut to the mapped shore. The rules are in
// .agent/system/graphics.md, "The lakes".
//
//   surface   Water.surface(tile, near) reads a tile's water nodes and the nodes of the tiles round it: each water node
//             stands at the highest water node within LEVEL_REACH nodes that is within LEVEL_STEP_M of it (so a lake is
//             level and never under the land drawn at its nodes, and a stream that falls keeps its fall; the reach is
//             inside PAD, so two tiles find the same level at the edge they share), the ring of
//             land nodes round the water at the level of the water beside it. Each node carries its distance to the
//             shore (the water's depth and its soft edge). Deep water far from the shore is drawn in blocks of BLOCK
//             cells, so a large lake costs few triangles
//   waves     a tiling slope texture made in code (Water.waveTexture: a sum of waves with whole wave numbers over the
//             tile, so it repeats without a seam), read at three scales, directions and speeds (OCTAVES), with a long
//             swell (SWELL) and slow patches of calm and ruffled water (STREAKS) over them. Calm, as on a mountain lake
//   light     Fresnel (Schlick, water's 0.02 at the normal): dark looking down, the sky's reflection at a grazing view;
//             the sky is scene.environment, the sky baked without its sun; at the top level a planar reflection of the
//             mountains (a mirrored camera, a reduced target, only with a level lake near and in view). The sun's glint
//             is drawn here, sharp and broken by the waves; three's own direct specular is left out (the rim and fill
//             lights of the bike would make glints of their own)
//   colour    deep teal to dark at depth, lighter and more transparent in the shallows; the edge fades out over the
//             land's own water paint, so there is no hard line and no fight with the land (the water is drawn with a
//             polygon offset over the land it lies on)
//   haze      LandShade.haze: the aerial perspective of every world material
//
// The effect row 'water' (js/effects.js) chooses the level; 'off' draws the land as before. The physics never reads it.
class Water {
    static get LEVEL_REACH() { return 6; }
    static get LEVEL_STEP_M() { return 1.0; }
    // How far the shore's distance is read into the tiles round a tile (nodes), and the distance at which water is deep
    static get PAD() { return 8; }
    static get DEEP_M() { return 64; }
    // The cells of a block drawn as one quad where the water is deep at every node of it, its corners' levels within
    // BLOCK_FLAT_M, and the land at every node inside it under the quad
    static get BLOCK() { return 4; }
    static get BLOCK_FLAT_M() { return 0.15; }
    // The height over the nodes (metres): the polygon offset keeps it over the land; this keeps a level lake level
    static get LIFT_M() { return 0.03; }
    // The water fades to the land's paint between these distances (m), so the window's far edge shows no new tone
    static get FADE_M() { return [1800, 2600]; }
    // The planar reflection: only of a lake within this distance of the camera, in view, the camera over it
    static get PLANAR_M() { return 1600; }
    // Its target, as a share of the drawing buffer's side, and the most pixels across
    static get PLANAR_SCALE() { return 0.35; }
    static get PLANAR_MAX_PX() { return 1024; }
    static get BUILDS_PER_FRAME() { return 1; }
    // A lake mirrored has at least this many water nodes on the tile (about a hectare) and covers at least this share
    // of the screen (Water.seen)
    static get PLANAR_NODES() { return 150; }
    static get PLANAR_SCREEN() { return 0.01; }

    // The colours, sRGB: the water's body deep and in the shallows, the light rim at the edge
    static get LOOK() {
        return {
            deep: [0.02, 0.08, 0.09],
            shallow: [0.11, 0.24, 0.21],
            rim: [0.55, 0.62, 0.6],
            // the depth (m from the shore) where the body is half deep
            depthM: 22,
            // the edge's fade: water nodes reach full cover this far from the shore (m)
            edgeM: 10
        };
    }

    // The wave texture's octaves: period (m), direction (radians), speed (m/s along it), slope strength
    static get OCTAVES() {
        return [
            { periodM: 41, dir: 0.55, speed: 0.5, strength: 0.022 },
            { periodM: 12.3, dir: 2.05, speed: 0.32, strength: 0.024 },
            { periodM: 3.4, dir: -0.85, speed: 0.17, strength: 0.03 }
        ];
    }
    // The swell: two long sines (wavelength m, direction, speed m/s), their slope
    static get SWELL() { return { waves: [[83, 0.3, 0.9], [57, 1.25, 0.7]], slope: 0.008 }; }
    // Calm and ruffled patches: the texture's height read over this period (m) as a mask, drifting at this speed
    static get STREAKS() { return { periodM: 310, speed: 0.45, calm: 0.35, ruffled: 1.55 }; }

    // What each level of the effect row draws: octaves, the swell and streaks, the planar reflection
    static get LEVELS() {
        return {
            off: null,
            low: { octaves: 2, swell: 0, streaks: 0, planar: false },
            medium: { octaves: 3, swell: 1, streaks: 1, planar: false },
            high: { octaves: 3, swell: 1, streaks: 1, planar: true }
        };
    }

    // The surface of one tile as plain arrays (no THREE), or null when it has no water: positions are tile-local
    // (metres from the tile's corner, the height absolute), `water` is two values a vertex (the depth 0 to 1, the edge
    // 0 to 1), `index` the triangles; `levels` the level of every water node drawn, for the planar reflection.
    // `near(dx, dz)` gives the decoded tile at that offset from this one (or null)
    // Where a dam holds the lake, the water is deep up to the dam (a reservoir is deepest at its dam): a water node
    // takes as its distance from the shore at least DEEP_M less half its distance to the dam's upstream face, so the
    // dam's face is no shore and the depth eases off away from it over twice DEEP_M. A dam counts for the water within
    // DAM_LEVEL_M of its level
    static get DAM_LEVEL_M() { return 3; }

    // The dams' upstream faces, if the dams are drawn (Dams.faces, js/world/dams.js: {face: [[x, z], ...], water}, the
    // face's line in world metres and the reservoir's level). Optional: without it a dam's face is a shore
    static dams() {
        if (typeof Dams === 'undefined' || !Array.isArray(Dams.faces)) return [];
        return Dams.faces.map(dam => ({ points: dam.face || dam.points, level: Number.isFinite(dam.water) ? dam.water : dam.level }))
            .filter(dam => Array.isArray(dam.points) && dam.points.length >= 2);
    }

    // The distance from (x, z) to the nearest dam face whose level is within DAM_LEVEL_M of `y` (Infinity for none)
    static damDistance(dams, x, z, y) {
        let best = Infinity;
        for (const dam of dams) {
            if (Number.isFinite(dam.level) && Math.abs(dam.level - y) > Water.DAM_LEVEL_M) continue;
            const pts = dam.points;
            for (let k = 1; k < pts.length; k++) {
                const [ax, az] = pts[k - 1], [bx, bz] = pts[k];
                const dx = bx - ax, dz = bz - az, len = dx * dx + dz * dz;
                const t = len > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len)) : 0;
                best = Math.min(best, Math.hypot(x - ax - t * dx, z - az - t * dz));
            }
        }
        return best;
    }

    static surface(tile, near = () => null, dams = Water.dams()) {
        const N = WorldData.TILE_N, P = Water.PAD, W = N + 2 * P, cell = WorldData.CELL_M, ZW = WorldData.ZONE.water;
        let any = false;
        for (let k = 0; k < N * N; k++) if (tile.zones[k] === ZW) { any = true; break; }
        if (!any) return null;
        // The padded grid: a node of a tile round this one is read from it; where it is not here, the nearest node of
        // this tile stands in (the shore is not guessed into a tile that is not loaded)
        const wet = new Uint8Array(W * W), h = new Float32Array(W * W);
        const tiles = new Map();
        const at = (dx, dz) => {
            const key = `${dx},${dz}`;
            if (!tiles.has(key)) tiles.set(key, dx === 0 && dz === 0 ? tile : near(dx, dz) || null);
            return tiles.get(key);
        };
        for (let b = 0; b < W; b++) {
            for (let a = 0; a < W; a++) {
                let i = a - P, j = b - P, dx = 0, dz = 0;
                if (i < 0) { dx = -1; i += N - 1; } else if (i > N - 1) { dx = 1; i -= N - 1; }
                if (j < 0) { dz = -1; j += N - 1; } else if (j > N - 1) { dz = 1; j -= N - 1; }
                let t = at(dx, dz);
                if (!t) { t = tile; i = Math.min(N - 1, Math.max(0, a - P)); j = Math.min(N - 1, Math.max(0, b - P)); }
                const k = j * N + i;
                wet[b * W + a] = t.zones[k] === ZW ? 1 : 0;
                h[b * W + a] = t.heights[k];
            }
        }
        // The distance to the nearest land node (metres), a two-pass chamfer over the padded grid
        const dist = new Float32Array(W * W);
        const BIG = 1e6, ORTH = cell, DIAG = cell * Math.SQRT2;
        for (let k = 0; k < W * W; k++) dist[k] = wet[k] ? BIG : 0;
        for (let b = 0; b < W; b++) {
            for (let a = 0; a < W; a++) {
                const k = b * W + a;
                if (!dist[k]) continue;
                let d = dist[k];
                if (a > 0) d = Math.min(d, dist[k - 1] + ORTH);
                if (b > 0) {
                    d = Math.min(d, dist[k - W] + ORTH);
                    if (a > 0) d = Math.min(d, dist[k - W - 1] + DIAG);
                    if (a < W - 1) d = Math.min(d, dist[k - W + 1] + DIAG);
                }
                dist[k] = d;
            }
        }
        for (let b = W - 1; b >= 0; b--) {
            for (let a = W - 1; a >= 0; a--) {
                const k = b * W + a;
                if (!dist[k]) continue;
                let d = dist[k];
                if (a < W - 1) d = Math.min(d, dist[k + 1] + ORTH);
                if (b < W - 1) {
                    d = Math.min(d, dist[k + W] + ORTH);
                    if (a < W - 1) d = Math.min(d, dist[k + W + 1] + DIAG);
                    if (a > 0) d = Math.min(d, dist[k + W - 1] + DIAG);
                }
                dist[k] = d;
            }
        }
        // The level of each water node of the tile and the ring round it
        const R = Water.LEVEL_REACH, step = Water.LEVEL_STEP_M;
        const level = new Float32Array(N * N).fill(NaN);
        for (let j = 0; j < N; j++) {
            for (let i = 0; i < N; i++) {
                const k = (j + P) * W + (i + P);
                if (!wet[k]) continue;
                let top = h[k];
                for (let db = -R; db <= R; db++) {
                    for (let da = -R; da <= R; da++) {
                        const q = k + db * W + da;
                        if (wet[q] && Math.abs(h[q] - h[k]) <= step && h[q] > top) top = h[q];
                    }
                }
                level[j * N + i] = top + Water.LIFT_M;
            }
        }
        // A land node next to water (a ring node) takes the highest level beside it; its own height is read only to
        // find the water beside it from the padded grid, so the tile's edge ring matches its neighbour's
        const ring = new Float32Array(N * N).fill(NaN);
        const levelAt = (a, b) => {
            const i = a - P, j = b - P;
            if (i >= 0 && i < N && j >= 0 && j < N) return level[j * N + i];
            // a water node of the tile beside: its level as that tile would make it
            const k = b * W + a;
            let top = h[k];
            for (let db = -R; db <= R; db++) {
                for (let da = -R; da <= R; da++) {
                    const qa = a + da, qb = b + db;
                    if (qa < 0 || qb < 0 || qa >= W || qb >= W) continue;
                    const q = qb * W + qa;
                    if (wet[q] && Math.abs(h[q] - h[k]) <= step && h[q] > top) top = h[q];
                }
            }
            return top + Water.LIFT_M;
        };
        for (let j = 0; j < N; j++) {
            for (let i = 0; i < N; i++) {
                const k = (j + P) * W + (i + P);
                if (wet[k]) continue;
                let top = -Infinity;
                for (let db = -1; db <= 1; db++) {
                    for (let da = -1; da <= 1; da++) {
                        const a = i + P + da, b = j + P + db;
                        if (wet[b * W + a]) top = Math.max(top, levelAt(a, b));
                    }
                }
                if (top > -Infinity) ring[j * N + i] = top;
            }
        }
        const L = Water.LOOK;
        const vertex = new Int32Array(N * N).fill(-1);
        const positions = [], water = [], index = [], levels = [];
        const vertexOf = (i, j) => {
            const n = j * N + i;
            if (vertex[n] >= 0) return vertex[n];
            const k = (j + P) * W + (i + P);
            const wetNode = wet[k] === 1;
            const y = wetNode ? level[n] : ring[n];
            if (!Number.isFinite(y)) return -1;
            let d = wetNode ? Math.min(dist[k], Water.DEEP_M * 4) : 0;
            if (wetNode && dams && dams.length) {
                const face = Water.damDistance(dams, tile.tx * WorldData.TILE_M + i * cell, tile.tz * WorldData.TILE_M + j * cell, y);
                if (face < 2 * Water.DEEP_M) d = Math.max(d, Water.DEEP_M - face / 2);
            }
            vertex[n] = positions.length / 3;
            positions.push(i * cell, y, j * cell);
            water.push(1 - Math.exp(-d / L.depthM), wetNode ? Math.min(1, d / L.edgeM) : 0);
            if (wetNode) levels.push(y);
            return vertex[n];
        };
        // A cell is drawn when a corner of it is a water node; a block when every node of it is level deep water
        const B = Water.BLOCK, cells = N - 1;
        const deepAt = (i, j) => {
            const k = (j + P) * W + (i + P);
            return wet[k] && dist[k] >= Water.DEEP_M;
        };
        const quad = (a, b, c, d) => {
            // a b on the near row, c d on the far row (in +z)
            if (a < 0 || b < 0 || c < 0 || d < 0) return false;
            index.push(a, c, b, b, c, d);
            return true;
        };
        const cellDrawn = (i, j) => {
            let wetCorner = false;
            for (const [di, dj] of [[0, 0], [1, 0], [0, 1], [1, 1]]) if (wet[(j + dj + P) * W + (i + di + P)]) wetCorner = true;
            if (!wetCorner) return;
            quad(vertexOf(i, j), vertexOf(i + 1, j), vertexOf(i, j + 1), vertexOf(i + 1, j + 1));
        };
        for (let bj = 0; bj < cells; bj += B) {
            for (let bi = 0; bi < cells; bi += B) {
                const ei = Math.min(cells, bi + B), ej = Math.min(cells, bj + B);
                let block = ei - bi === B && ej - bj === B;
                let land = -Infinity;
                for (let j = bj; block && j <= ej; j++) {
                    for (let i = bi; i <= ei; i++) {
                        if (!deepAt(i, j)) { block = false; break; }
                        land = Math.max(land, h[(j + P) * W + (i + P)]);
                    }
                }
                if (block) {
                    const corners = [level[bj * N + bi], level[bj * N + ei], level[ej * N + bi], level[ej * N + ei]];
                    const lo = Math.min(...corners), hi = Math.max(...corners);
                    block = hi - lo <= Water.BLOCK_FLAT_M && land + 0.01 <= lo;
                }
                if (block) {
                    quad(vertexOf(bi, bj), vertexOf(ei, bj), vertexOf(bi, ej), vertexOf(ei, ej));
                    continue;
                }
                for (let j = bj; j < ej; j++) for (let i = bi; i < ei; i++) cellDrawn(i, j);
            }
        }
        if (!index.length) return null;
        return { positions: new Float32Array(positions), water: new Float32Array(water), index, levels };
    }

    // Up to SIGHTS water vertices of a surface, spread over it (world positions): where the mirror looks for a lake the
    // land does not hide
    static get SIGHTS() { return 16; }
    static sightsOf(surface, origin) {
        const p = surface.positions, w = surface.water, out = [];
        const wet = [];
        for (let v = 0; v < p.length / 3; v++) if (w[v * 2 + 1] > 0) wet.push(v);
        const step = Math.max(1, Math.floor(wet.length / Water.SIGHTS));
        for (let k = 0; k < wet.length && out.length < Water.SIGHTS; k += step) {
            const v = wet[k];
            out.push([origin.x + p[v * 3], p[v * 3 + 1], origin.z + p[v * 3 + 2]]);
        }
        return out;
    }

    // The share of the screen the water of a mesh covers as the eye sees it, roughly: the box on the screen round its
    // sights that are in the view and that the land does not hide from the eye (each ray read every SIGHT_STEP_M, at
    // least 40 steps, against the land's height); 0 with fewer than two such sights
    static get SIGHT_STEP_M() { return 15; }
    static seen(ground, camera, eye, sights) {
        const point = Water.point || (Water.point = new THREE.Vector3());
        let n = 0, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (const [x, y, z] of sights) {
            point.set(x, y, z).project(camera);
            if (point.z > 1 || point.z < -1 || Math.abs(point.x) > 1 || Math.abs(point.y) > 1) continue;
            const sx = point.x, sy = point.y;
            const d = Math.hypot(x - eye.x, z - eye.z);
            const steps = Math.max(40, Math.ceil(d / Water.SIGHT_STEP_M));
            let open = true;
            for (let k = 1; k < steps && open && ground && ground.landY; k++) {
                const t = k / steps;
                const px = eye.x + (x - eye.x) * t, pz = eye.z + (z - eye.z) * t, py = eye.y + (y - eye.y) * t;
                if (ground.landY(px, pz, -Infinity) > py + 1) open = false;
            }
            if (!open) continue;
            n++;
            x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
        }
        return n < 2 ? 0 : (x1 - x0) * (y1 - y0) / 4;
    }

    // The planar reflection's level of a surface: the level most of its water nodes stand at (the fullest half-metre
    // band, its median), and whether the water is a lake (two in five of the nodes in that band) and not a falling
    // stream. `nodes` counts the band. Water off that level (a stream into the lake, a pond above it) takes the sky's
    // reflection (uPlanarY in the shader)
    static levelOf(levels) {
        if (!levels || !levels.length) return null;
        const bands = new Map();
        for (const y of levels) {
            const k = Math.round(y * 2);
            bands.set(k, (bands.get(k) || 0) + 1);
        }
        let best = null, most = -1;
        for (const [k, n] of bands) {
            // a band with its two neighbours: a level that falls on a band's edge is not split
            const sum = n + (bands.get(k - 1) || 0) + (bands.get(k + 1) || 0);
            if (sum > most) { most = sum; best = k; }
        }
        const band = levels.filter(y => Math.abs(y * 2 - best) <= 1.5).sort((p, q) => p - q);
        return { y: band[band.length >> 1], flat: band.length >= 0.4 * levels.length, nodes: band.length };
    }

    // The slope texture: a height field over the unit square made of waves with whole wave numbers (so it repeats with
    // no seam), its two slopes in R and G (scaled to [-RANGE, RANGE]) and its height in B. The same on every page
    static get TEXTURE_N() { return 256; }
    static get RANGE() { return 3; }
    static waveField(n = Water.TEXTURE_N, count = 56, seed = 7) {
        let s = seed >>> 0;
        const random = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
        const waves = [];
        while (waves.length < count) {
            const kx = Math.round((random() * 2 - 1) * 12), ky = Math.round((random() * 2 - 1) * 12);
            const k = Math.hypot(kx, ky);
            if (k < 2 || k > 12) continue;
            waves.push({ kx, ky, phase: random() * Math.PI * 2, amp: Math.pow(k, -1.6) });
        }
        const height = new Float32Array(n * n), sx = new Float32Array(n * n), sy = new Float32Array(n * n);
        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                let hh = 0, gx = 0, gy = 0;
                for (const w of waves) {
                    const arg = 2 * Math.PI * (w.kx * x + w.ky * y) / n + w.phase;
                    hh += w.amp * Math.sin(arg);
                    const c = w.amp * Math.cos(arg) * 2 * Math.PI;
                    gx += c * w.kx; gy += c * w.ky;
                }
                const k = y * n + x;
                height[k] = hh; sx[k] = gx; sy[k] = gy;
            }
        }
        // Slopes to unit RMS, height to [0, 1]
        let rms = 0, lo = Infinity, hi = -Infinity;
        for (let k = 0; k < n * n; k++) { rms += sx[k] * sx[k] + sy[k] * sy[k]; lo = Math.min(lo, height[k]); hi = Math.max(hi, height[k]); }
        rms = Math.sqrt(rms / (2 * n * n)) || 1;
        const out = new Uint8Array(n * n * 4), R = Water.RANGE;
        const byte = v => Math.max(0, Math.min(255, Math.round((v / R * 0.5 + 0.5) * 255)));
        for (let k = 0; k < n * n; k++) {
            out[k * 4] = byte(sx[k] / rms);
            out[k * 4 + 1] = byte(sy[k] / rms);
            out[k * 4 + 2] = Math.round((height[k] - lo) / (hi - lo || 1) * 255);
            out[k * 4 + 3] = 255;
        }
        return out;
    }

    static waveTexture() {
        if (!Water.texture) {
            const n = Water.TEXTURE_N;
            const texture = new THREE.DataTexture(Water.waveField(n), n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
            texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
            texture.magFilter = THREE.LinearFilter;
            texture.minFilter = THREE.LinearMipmapLinearFilter;
            texture.generateMipmaps = true;
            texture.anisotropy = 4;
            texture.needsUpdate = true;
            Water.texture = texture;
        }
        return Water.texture;
    }

    static get uniforms() {
        if (!Water.shared) {
            const O = Water.OCTAVES;
            Water.shared = {
                tWaves: { value: null },
                uWaveOffset: { value: O.map(() => new THREE.Vector2()) },
                uWaveDir: { value: O.map(o => new THREE.Vector2(Math.cos(o.dir), Math.sin(o.dir))) },
                uWavePeriod: { value: new THREE.Vector3(...O.map(o => 1 / o.periodM)) },
                uWaveStrength: { value: new THREE.Vector3(...O.map(o => o.strength)) },
                uOctaves: { value: 3 },
                uSwell: { value: 1 },
                uSwellPhase: { value: new THREE.Vector2() },
                uStreaks: { value: 1 },
                uStreakOffset: { value: new THREE.Vector2() },
                uWaterDeep: { value: new THREE.Color() },
                uWaterShallow: { value: new THREE.Color() },
                uWaterRim: { value: new THREE.Color() },
                uSunView: { value: new THREE.Vector3(0, 1, 0) },
                uSunColor: { value: new THREE.Color(1, 1, 1) },
                uGlint: { value: 1 },
                uFade: { value: new THREE.Vector2(...Water.FADE_M) },
                tReflect: { value: null },
                uReflectMatrix: { value: new THREE.Matrix4() },
                uPlanar: { value: 0 },
                uPlanarY: { value: 0 }
            };
            const L = Water.LOOK;
            Water.shared.uWaterDeep.value.setRGB(...L.deep).convertSRGBToLinear();
            Water.shared.uWaterShallow.value.setRGB(...L.shallow).convertSRGBToLinear();
            Water.shared.uWaterRim.value.setRGB(...L.rim).convertSRGBToLinear();
        }
        return Water.shared;
    }

    static get VERTEX() {
        return {
            common: `
attribute vec2 aWater;
uniform mat4 uReflectMatrix;
varying vec2 vWater;
varying vec3 vWaterWorld;
varying vec4 vWaterReflect;`,
            project: `
vWater = aWater;
vWaterWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
vWaterReflect = uReflectMatrix * vec4(vWaterWorld, 1.0);`
        };
    }

    static get FRAGMENT() {
        const swell = Water.SWELL, S = Water.STREAKS;
        const f = v => Number(v).toFixed(5);
        const swellTerms = swell.waves.map(([len, dir], k) => {
            const kx = Math.cos(dir) * 2 * Math.PI / len, kz = Math.sin(dir) * 2 * Math.PI / len;
            return `s += vec2(${f(kx)}, ${f(kz)}) * cos(dot(p, vec2(${f(kx)}, ${f(kz)})) - uSwellPhase.${'xy'[k]});`;
        }).join('\n    ');
        return {
            common: `
uniform sampler2D tWaves;
uniform vec2 uWaveOffset[3];
uniform vec2 uWaveDir[3];
uniform vec3 uWavePeriod;
uniform vec3 uWaveStrength;
uniform float uOctaves;
uniform float uSwell;
uniform vec2 uSwellPhase;
uniform float uStreaks;
uniform vec2 uStreakOffset;
uniform vec3 uWaterDeep;
uniform vec3 uWaterShallow;
uniform vec3 uWaterRim;
uniform vec3 uSunView;
uniform vec3 uSunColor;
uniform float uGlint;
uniform vec2 uFade;
uniform sampler2D tReflect;
uniform float uPlanar;
uniform float uPlanarY;
varying vec2 vWater;
varying vec3 vWaterWorld;
varying vec4 vWaterReflect;
// One octave's slope at p (world xz): the texture read along its own direction, turned back to the world's axes
vec2 waterOctave(vec2 p, int k, float period, float strength) {
    vec2 d = uWaveDir[k];
    vec2 q = vec2(dot(p, d), dot(p, vec2(-d.y, d.x))) * period + uWaveOffset[k];
    vec2 g = (texture2D(tWaves, q).rg * 2.0 - 1.0) * ${f(Water.RANGE)};
    return (d * g.x + vec2(-d.y, d.x) * g.y) * strength;
}
vec2 waterSlope(vec2 p, vec3 far) {
    vec2 s = vec2(0.0);
    // calm and ruffled patches drift over the lake
    float ruffle = 1.0;
    if (uStreaks > 0.5) {
        float m = texture2D(tWaves, p * ${f(1 / S.periodM)} + uStreakOffset).b;
        ruffle = mix(${f(S.calm)}, ${f(S.ruffled)}, smoothstep(0.3, 0.8, m));
    }
    // each octave fades out as its waves shrink under a pixel: the far water is smoother, not a field of glitter
    s += waterOctave(p, 0, uWavePeriod.x, uWaveStrength.x) * mix(1.0, ruffle, 0.4) * mix(0.2, 1.0, far.z);
    s += waterOctave(p, 1, uWavePeriod.y, uWaveStrength.y) * ruffle * far.y;
    if (uOctaves > 2.5) s += waterOctave(p, 2, uWavePeriod.z, uWaveStrength.z) * ruffle * far.x;
    if (uSwell > 0.5) {
    vec2 w = vec2(0.0);
    ${swellTerms.replace(/s \+=/g, 'w +=')}
    s += w * ${f(swell.slope / (2 * Math.PI / 70))};
    }
    return s;
}`,
            normal: `
float waterDist = length(vViewPosition);
// the ripples fade out with distance, finest first (x the fine octave, y the middle, z the long one)
vec3 waterFar = 1.0 - smoothstep(vec3(60.0, 80.0, 40.0), vec3(260.0, 450.0, 320.0), vec3(waterDist));
vec2 waterS = waterSlope(vWaterWorld.xz, waterFar);
vec3 waterN = normalize(vec3(-waterS.x, 1.0, -waterS.y));
normal = normalize((viewMatrix * vec4(waterN, 0.0)).xyz);`,
            colour: `
float waterDepth = vWater.x;
diffuseColor.rgb = mix(uWaterShallow, uWaterDeep, waterDepth);`,
            output: `
{
    vec3 V = geometry.viewDir;
    vec3 N = geometry.normal;
    float NdV = saturate(dot(N, V));
    float F = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
    vec3 refl = vec3(0.0);
    #ifdef USE_ENVMAP
    // the sky's reflection softens with distance, where the waves under a pixel spread it
    refl = getIBLRadiance(V, N, mix(0.03, 0.16, smoothstep(80.0, 900.0, waterDist)));
    #endif
    if (uPlanar > 0.5 && abs(vWaterWorld.y - uPlanarY) < 1.5) {
        // the waves bend the mirror less far off, where a slope turns a grazing ray from the shore to the sky
        // the waves bend the mirror a little (more would break a house's reflection into confetti); a ray bent off the
        // target reads its edge, so the screen's edge never falls back to the bare sky
        vec2 uv = vWaterReflect.xy / vWaterReflect.w + waterS * mix(0.12, 0.04, smoothstep(30.0, 400.0, waterDist));
        refl = texture2D(tReflect, clamp(uv, vec2(0.002), vec2(0.998))).rgb;
    }
    vec3 R = reflect(-V, N);
    float sr = max(dot(R, normalize(uSunView)), 0.0);
    // the sharp lobe is held down far off, where a wave is under a pixel and its glint would be a lone white speck
    float glint = (pow(sr, 2400.0) * mix(30.0, 6.0, smoothstep(60.0, 500.0, waterDist)) + pow(sr, 260.0) * 2.0) * uGlint * smoothstep(-0.02, 0.08, uSunView.y);
    // the light the water gives back from inside it: less than a lit ground's (the sun goes down into it)
    vec3 body = totalDiffuse * 0.75 * (1.0 - F);
    // a faint light rim where the water laps the shore
    float edge = vWater.y;
    float lap = smoothstep(0.0, 0.25, edge) * (1.0 - smoothstep(0.25, 0.6, edge));
    body += uWaterRim * lap * 0.04 * (0.6 + 0.4 * sin(dot(vWaterWorld.xz, vec2(0.7, 0.5)) * 1.3 + uSwellPhase.x * 3.0));
    outgoingLight = body + refl * F + uSunColor * glint * F * 4.0;
    float cover = smoothstep(0.0, 1.0, edge);
    float alpha = clamp(cover * (0.8 + 0.2 * waterDepth) + F * cover, 0.0, 1.0);
    alpha *= 1.0 - smoothstep(uFade.x, uFade.y, waterDist);
    diffuseColor.a = alpha;
}
#include <output_fragment>`
        };
    }

    static material() {
        if (Water.sharedMaterial) return Water.sharedMaterial;
        const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.08, metalness: 0, transparent: true, depthWrite: false });
        material.polygonOffset = true;
        material.polygonOffsetFactor = -1;
        material.polygonOffsetUnits = -4;
        const u = Water.uniforms;
        u.tWaves.value = Water.waveTexture();
        const V = Water.VERTEX, F = Water.FRAGMENT;
        material.onBeforeCompile = (shader) => {
            Object.assign(shader.uniforms, u);
            shader.vertexShader = shader.vertexShader
                .replace('#include <common>', `#include <common>${V.common}`)
                .replace('#include <project_vertex>', `#include <project_vertex>${V.project}`);
            shader.fragmentShader = shader.fragmentShader
                .replace('#include <common>', `#include <common>${F.common}`)
                .replace('#include <color_fragment>', `#include <color_fragment>${F.colour}`)
                .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>${F.normal}`)
                .replace('#include <output_fragment>', F.output);
        };
        material.customProgramCacheKey = () => 'world-water';
        material.userData.water = true;
        // The aerial perspective of every world material, after the water's own patch
        if (typeof LandShade !== 'undefined') LandShade.haze(material);
        Water.sharedMaterial = material;
        return material;
    }

    // A tile's water mesh, or null
    static buildMesh(tile, near) {
        const surface = Water.surface(tile, near);
        if (!surface) return null;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(surface.positions, 3));
        geometry.setAttribute('aWater', new THREE.BufferAttribute(surface.water, 2));
        const normals = new Float32Array(surface.positions.length);
        for (let k = 1; k < normals.length; k += 3) normals[k] = 1;
        geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
        geometry.setIndex(surface.index);
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        const mesh = new THREE.Mesh(geometry, Water.material());
        mesh.name = `water:${tile.key}`;
        mesh.position.set(tile.tx * WorldData.TILE_M, 0, tile.tz * WorldData.TILE_M);
        mesh.updateMatrixWorld();
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.userData.skipCulling = true;
        mesh.userData.level = Water.levelOf(surface.levels);
        mesh.userData.sights = Water.sightsOf(surface, mesh.position);
        mesh.userData.triangles = surface.index.length / 3;
        mesh.onBeforeRender = (renderer, scene, camera) => Water.beforeRender(renderer, scene, camera);
        return mesh;
    }

    // The effect row's switch: a level of Water.LEVELS. 'off' hides the water (kept built, so the ladder's steps over it
    // build nothing)
    static set(game, level) {
        Water.level = Water.LEVELS[level] ? level : 'off';
        const look = Water.LEVELS[Water.level];
        const state = game && game.waterState;
        if (state) state.group.visible = !!look;
        if (!look) {
            Water.dropPlanar();
            return;
        }
        const u = Water.uniforms;
        u.uOctaves.value = look.octaves;
        u.uSwell.value = look.swell;
        u.uStreaks.value = look.streaks;
        if (!look.planar) Water.dropPlanar();
    }

    static clear(game) {
        const state = game && game.waterState;
        if (!state) return;
        for (const mesh of state.meshes.values()) Water.disposeMesh(mesh);
        state.meshes.clear();
        if (state.group.parent) state.group.parent.remove(state.group);
        game.waterState = null;
        Water.activeGroup = null;
        Water.activeEnv = null;
        Water.activeGame = null;
        Water.dropPlanar();
    }

    static disposeMesh(mesh) {
        if (mesh.parent) mesh.parent.remove(mesh);
        mesh.geometry.dispose();
    }

    static dropPlanar() {
        if (Water.planarTarget) Water.planarTarget.dispose();
        Water.planarTarget = null;
        if (Water.shared) Water.shared.uPlanar.value = 0;
    }

    // Once a frame (Effects.frame): the meshes follow the land's tiles, and the waves, the sun and the reflection move
    static frame(game) {
        const env = game && game.environment;
        const look = Water.LEVELS[Water.level || 'off'];
        if (game && game.waterState && game.waterState.env !== env) Water.clear(game);
        if (!look || !env || !env.isWorld || !env.tileMeshes || !env.data) return;
        let state = game.waterState;
        if (!state || state.env !== env) {
            if (state) Water.clear(game);
            const group = new THREE.Group();
            group.name = 'water';
            env.group.add(group);
            state = game.waterState = { env, group, meshes: new Map(), none: new Set() };
        }
        Water.activeGroup = state.group;
        Water.activeEnv = env;
        // A tile's water is built once while its land is drawn (it does not change with the land's level of detail),
        // one tile a frame: a build of the largest lake's tile takes up to about 12 ms on a desk
        let built = 0;
        for (const key of env.tileMeshes.keys()) {
            if (state.meshes.has(key) || state.none.has(key)) continue;
            if (built++ >= Water.BUILDS_PER_FRAME) break;
            const tile = env.data.tile(key);
            if (!tile) continue;
            const mesh = Water.buildMesh(tile, (dx, dz) => env.data.tile(`${tile.tx + dx},${tile.tz + dz}`));
            if (mesh) {
                state.meshes.set(key, mesh);
                state.group.add(mesh);
            } else state.none.add(key);
        }
        for (const [key, mesh] of state.meshes) {
            if (env.tileMeshes.has(key)) continue;
            Water.disposeMesh(mesh);
            state.meshes.delete(key);
        }
        for (const key of state.none) if (!env.tileMeshes.has(key)) state.none.delete(key);
        Water.step(game, state, look);
    }

    static step(game, state, look) {
        const u = Water.uniforms;
        const t = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
        const time = Number.isFinite(game.waterTime) ? game.waterTime : t;
        Water.OCTAVES.forEach((o, k) => {
            const along = (time * o.speed / o.periodM) % 1;
            u.uWaveOffset.value[k].set(along, 0);
        });
        Water.SWELL.waves.forEach(([len, , speed], k) => {
            const phase = ((time * speed / len) % 1) * 2 * Math.PI;
            if (k === 0) u.uSwellPhase.value.x = phase; else u.uSwellPhase.value.y = phase;
        });
        const S = Water.STREAKS;
        const drift = (time * S.speed / S.periodM) % 1;
        u.uStreakOffset.value.set(drift * 0.8, drift * 0.6);
        const camera = game.camera, g = game.graphics;
        if (camera && g && g.sunDirection) {
            camera.updateMatrixWorld();
            u.uSunView.value.copy(g.sunDirection).transformDirection(camera.matrixWorldInverse);
        }
        const sun = game.directionalLight;
        if (sun) u.uSunColor.value.copy(sun.color).multiplyScalar(sun.intensity);
        // Rain and snow dull the glint (the sun is behind cloud)
        const mix = game.weatherSystem && game.weatherSystem.mix ? game.weatherSystem.mix : null;
        const wet = mix ? Math.min(1, (mix.rain || 0) + (mix.snow || 0) + (mix.fog || 0)) : 0;
        u.uGlint.value = 1 - 0.85 * (Number.isFinite(wet) ? wet : 0);
        // (the lake to mirror is chosen at the draw: Water.beforeRender)
        Water.activeGame = game;
        Water.activeLook = look;
    }

    // The lake the planar reflection mirrors this frame: the nearest level one in view, within PLANAR_M, the camera
    // over it; none when the level has no reflection or the renderer draws no post (its targets are linear)
    static choosePlanar(game, state, look) {
        const u = Water.uniforms;
        Water.planarChosen = null;
        const camera = game.camera, g = game.graphics;
        if (!look.planar || !camera || !g || !g.postEnabled || !state.meshes.size) { u.uPlanar.value = 0; return; }
        const frustum = Water.frustum || (Water.frustum = new THREE.Frustum());
        const m = Water.projScreen || (Water.projScreen = new THREE.Matrix4());
        m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        frustum.setFromProjectionMatrix(m);
        const box = Water.box || (Water.box = new THREE.Box3());
        const eye = camera.getWorldPosition(Water.eye || (Water.eye = new THREE.Vector3()));
        // A lake that crosses tiles is one lake: the tiles' water at one level (to half a metre) is read together
        const lakes = new Map();
        for (const mesh of state.meshes.values()) {
            const level = mesh.userData.level;
            if (!level || !level.flat || eye.y < level.y + 0.5) continue;
            box.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
            const d = box.distanceToPoint(eye);
            if (d >= Water.PLANAR_M || !frustum.intersectsBox(box)) continue;
            const key = Math.round(level.y * 2);
            const lake = lakes.get(key) || lakes.get(key - 1) || lakes.get(key + 1) || { y: level.y, nodes: 0, d: Infinity, sights: [] };
            lakes.set(key, lake);
            lake.nodes += level.nodes;
            lake.d = Math.min(lake.d, d);
            for (const sight of mesh.userData.sights) if (Math.abs(sight[1] - lake.y) < 0.75) lake.sights.push(sight);
        }
        let best = null;
        for (const lake of new Set(lakes.values())) {
            if (lake.nodes < Water.PLANAR_NODES || (best && lake.d >= best.d)) continue;
            // a lake that fills little of the view, or that the land hides (a pond under the hill the road climbs), is
            // left to the sky's reflection: the mirror draws the scene again, and would pay for it with nothing to see
            if (Water.seen(game.environment.ground, camera, eye, lake.sights) < Water.PLANAR_SCREEN) continue;
            best = lake;
        }
        if (!best) { u.uPlanar.value = 0; return; }
        Water.planarChosen = { y: best.y, camera };
        u.uPlanarY.value = best.y;
    }

    // Before the first water mesh of the main camera's draw: the mirrored camera draws the scene into the reflection
    // target, the water hidden (three's Reflector, with the plane level and the near plane cut to it)
    static beforeRender(renderer, scene, camera) {
        const game = Water.activeGame, u = Water.uniforms;
        if (Water.reflecting || !game || camera !== game.camera || !game.waterState) return;
        // Once a draw of the game's camera, at the first water mesh in its view: the mirrored draw leaves the
        // renderer's counts as they are (no reset, so the frame number holds)
        const frame = renderer.info.render.frame;
        if (Water.drawnFrame === frame) return;
        Water.drawnFrame = frame;
        Water.choosePlanar(game, game.waterState, Water.activeLook || {});
        const chosen = Water.planarChosen;
        if (!chosen) return;
        const size = renderer.getDrawingBufferSize(Water.bufferSize || (Water.bufferSize = new THREE.Vector2()));
        const scale = Math.min(Water.PLANAR_SCALE, Water.PLANAR_MAX_PX / Math.max(1, size.x));
        const w = Math.max(64, Math.round(size.x * scale)), h = Math.max(64, Math.round(size.y * scale));
        if (!Water.planarTarget || Water.planarTarget.width !== w || Water.planarTarget.height !== h) {
            if (Water.planarTarget) Water.planarTarget.dispose();
            const float = renderer.capabilities.isWebGL2 && renderer.extensions.has('EXT_color_buffer_float');
            Water.planarTarget = new THREE.WebGLRenderTarget(w, h, { type: float ? THREE.HalfFloatType : THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true });
        }
        const v = Water.virtual || (Water.virtual = {
            camera: new THREE.PerspectiveCamera(),
            normal: new THREE.Vector3(0, 1, 0), plane: new THREE.Plane(), clip: new THREE.Vector4(), q: new THREE.Vector4(),
            point: new THREE.Vector3(), eye: new THREE.Vector3(), view: new THREE.Vector3(), look: new THREE.Vector3(),
            target: new THREE.Vector3(), rotation: new THREE.Matrix4()
        });
        v.point.set(0, chosen.y, 0);
        v.eye.setFromMatrixPosition(camera.matrixWorld);
        v.point.x = v.eye.x; v.point.z = v.eye.z;
        v.view.subVectors(v.point, v.eye);
        if (v.view.dot(v.normal) > 0) { u.uPlanar.value = 0; return; }
        v.view.reflect(v.normal).negate().add(v.point);
        v.rotation.extractRotation(camera.matrixWorld);
        v.look.set(0, 0, -1).applyMatrix4(v.rotation).add(v.eye);
        v.target.subVectors(v.point, v.look).reflect(v.normal).negate().add(v.point);
        const mirror = v.camera;
        mirror.position.copy(v.view);
        mirror.up.set(0, 1, 0).applyMatrix4(v.rotation).reflect(v.normal);
        mirror.lookAt(v.target);
        mirror.far = camera.far;
        mirror.near = camera.near;
        mirror.layers.mask = camera.layers.mask;
        mirror.updateMatrixWorld();
        mirror.projectionMatrix.copy(camera.projectionMatrix);
        mirror.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
        u.uReflectMatrix.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
            .multiply(mirror.projectionMatrix).multiply(mirror.matrixWorldInverse);
        // The near plane cut to the water (an oblique projection), so nothing under the lake is mirrored
        v.plane.setFromNormalAndCoplanarPoint(v.normal, v.point).applyMatrix4(mirror.matrixWorldInverse);
        v.clip.set(v.plane.normal.x, v.plane.normal.y, v.plane.normal.z, v.plane.constant);
        const p = mirror.projectionMatrix.elements;
        v.q.set((Math.sign(v.clip.x) + p[8]) / p[0], (Math.sign(v.clip.y) + p[9]) / p[5], -1, (1 + p[10]) / p[14]);
        v.clip.multiplyScalar(2 / v.clip.dot(v.q));
        p[2] = v.clip.x; p[6] = v.clip.y; p[10] = v.clip.z + 1; p[14] = v.clip.w;
        mirror.projectionMatrixInverse.copy(mirror.projectionMatrix).invert();

        const target = renderer.getRenderTarget();
        const shadows = renderer.shadowMap.autoUpdate;
        const autoWorld = scene.matrixWorldAutoUpdate;
        const autoInfo = renderer.info.autoReset;
        const hidden = [];
        for (const o of Water.hiddenOf()) { hidden.push([o, o.visible]); o.visible = false; }
        Water.reflecting = true;
        try {
            renderer.shadowMap.autoUpdate = false;
            scene.matrixWorldAutoUpdate = false;
            renderer.info.autoReset = false;
            renderer.setRenderTarget(Water.planarTarget);
            renderer.clear();
            renderer.render(scene, mirror);
        } finally {
            Water.reflecting = false;
            renderer.shadowMap.autoUpdate = shadows;
            scene.matrixWorldAutoUpdate = autoWorld;
            renderer.info.autoReset = autoInfo;
            renderer.setRenderTarget(target);
            for (const [o, visible] of hidden) o.visible = visible;
        }
        u.tReflect.value = Water.planarTarget.texture;
        u.uPlanar.value = 1;
        Water.stats.planarFrames++;
    }

    // What the mirrored camera leaves out: the water itself, and the ground cover's clumps round the bike (draw calls
    // for what the waves would hide)
    static hiddenOf() {
        const group = Water.activeGroup;
        const out = group ? [group] : [];
        const world = group && group.parent;
        if (world) for (const o of world.children) if (o.name === 'ground-cover') out.push(o);
        // and the boulders: small, many, and under the waves' blur
        const scenery = Water.activeEnv && Water.activeEnv.scenery;
        if (scenery && scenery.boulderGroup) out.push(scenery.boulderGroup);
        return out;
    }

    // What the water drew, for the probes
    static report(game) {
        const state = game && game.waterState;
        const meshes = state ? [...state.meshes.values()] : [];
        return {
            level: Water.level || 'off',
            meshes: meshes.length,
            triangles: meshes.reduce((sum, mesh) => sum + mesh.userData.triangles, 0),
            planar: Water.uniforms.uPlanar.value > 0.5,
            planarY: Water.planarChosen ? Water.planarChosen.y : null,
            planarFrames: Water.stats.planarFrames,
            lakes: meshes.map(mesh => ({ key: mesh.name.slice(6), level: mesh.userData.level, triangles: mesh.userData.triangles }))
        };
    }
}

Water.level = 'off';
Water.stats = { planarFrames: 0 };
