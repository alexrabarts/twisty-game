// GroundTex: the near ground drawn per pixel, the 'groundTex' effect of js/effects.js (a prototype to choose from).
// Nothing is added to the scene: the land tiles' shader (LandShade.patch with detail) reads textures made at load from
// seeded noise. Three levels, each the one under it and more:
//
//   low      fields: a 24 m pattern of bare soil, stony ground and dry grass metres across, read at two scales and
//            turned, mixed into the land's own colour by the cover rules (slope, the grass's dryness), with a mottle
//            of tussocks. It breaks the 16 m colour blotches of TerrainMesh.colours. No fine texture
//   medium   a texture set: grass, dry grass, soil, scree and rock, each an albedo with its height and a normal map
//            (512 px a 2 m tile; rock 8 m), blended per pixel by height (a stone stands through the grass, grass over
//            the soil), read by hex tiling (three readings, each moved and turned at random per cell of a hex grid,
//            Mikkelsen 2022), so no repeat lines up. Rock on steep land is read on three planes (triplanar)
//   high     and relief: parallax occlusion mapping of the commonest layer within RELIEF_FAR_M, so grass clumps and
//            stones hide what is behind them
//
// The colours the photos matched hold at distance: each layer is stored as its ratio to its own mean (mean 1, in
// every mipmap), and the land's own colour is divided by the blend of the layers' means it expects there. Far off the
// mipmaps average the fine texture to its mean and the fields fade by a smooth function of distance (FIELDS_FAR_M);
// past FIELDS_FAR_M the land is drawn as before, so the haze (LandShade.HAZE) is untouched. Nothing ends at a line.
//
// Off, the uniform is 0 and the shader takes no branch of its own: the land is drawn as before.
const GroundTex = {
    // Levels, as the effect's level names
    LEVELS: { off: 0, low: 1, medium: 2, high: 3 },
    SIZE: 512,
    PATCH_SIZE: 512,
    // Metres a repeat: the fine layers, the rock, and the fields' two readings
    TILE_M: 2,
    ROCK_M: 8,
    PATCH_M: 24,
    PATCH2_M: 61,
    // The fields' mean in each channel, as patch() makes them: the shader divides by them, so a field changes the colour
    // of a place and not of the land as a whole. Kept here so a compile never waits for the pattern to be made
    PATCH_MEAN: [0.1335, 0.0457, 0.4845, 0.4942],
    // The fields fade from FIELDS_NEAR_M to FIELDS_FAR_M; the fine texture fades by the ground a pixel covers (m)
    FIELDS_NEAR_M: 150,
    FIELDS_FAR_M: 700,
    FINE_FOOT: [0.03, 0.12],
    // The relief: the deepest a clump or stone goes (m), and where it fades
    RELIEF_M: 0.08,
    RELIEF_NEAR_M: 10,
    RELIEF_FAR_M: 28,
    RELIEF_STEPS: 10,
    // The least share of the second layer that is read from its texture
    SECOND_MIN: 0.12,
    // How far each layer's height bends the normal (metres of height at full value)
    RELIEF: [0.06, 0.05, 0.02, 0.05, 0.12],
    // The layers: their order in the arrays and their mean colours (sRGB, LandShade.PALETTE's where it has one)
    LAYERS: ['grass', 'dry', 'soil', 'scree', 'rock'],
    SOIL: [0.3, 0.26, 0.2],
    // The share of the scree's colour a stone in the grass keeps (on a slope it is all of it)
    STONE_IN_GRASS: 0.55,

    get uniforms() {
        if (!GroundTex.shared) {
            GroundTex.shared = {
                uGround: { value: 0 },
                tGroundAlbedo: { value: null },
                tGroundNormal: { value: null },
                tGroundPatch: { value: null }
            };
        }
        return GroundTex.shared;
    },

    // level: 'off', 'low', 'medium' or 'high'. A level only writes a uniform: the land's program is the same at every
    // level, so a change never compiles and never makes a texture. Until the textures are made (prepare) the land is
    // drawn as off, and the level wanted goes in force when they are. The land detail's grain (js/world/landdetail.js)
    // is held off while the texture set is drawn: it is the same scale and would draw over it
    set(game, level) {
        const u = GroundTex.uniforms;
        GroundTex.wanted = GroundTex.LEVELS[level] || 0;
        if (game) GroundTex.game = game;
        if (GroundTex.wanted > 0 && GroundTex.state !== 'ready') GroundTex.prepare(game);
        const value = GroundTex.state === 'ready' ? GroundTex.wanted : 0;
        u.uGround.value = value;
        if (typeof LandDetail !== 'undefined' && LandDetail.hold) LandDetail.hold(value >= 2);
    },

    // Makes the textures once, off the main thread (a worker on this same file), and puts them on the GPU when they
    // come back. Called as the graphics settings are read when any level is chosen, so they are made while the world
    // loads and not when the ladder first steps up to a level that needs them. Without workers they are made here
    prepare(game) {
        if (game) GroundTex.game = game;
        if (GroundTex.state) return;
        GroundTex.state = 'making';
        const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
        const make = () => {
            const set = GroundTex.layers();
            return { albedo: set.albedo, normal: set.normal, patch: GroundTex.patch() };
        };
        const done = (data) => {
            const g = GroundTex.game, u = GroundTex.uniforms;
            const renderer = g && g.renderer;
            const anisotropy = renderer && renderer.capabilities ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 8;
            u.tGroundAlbedo.value = GroundTex.texture(data.albedo, GroundTex.SIZE, GroundTex.LAYERS.length, anisotropy);
            u.tGroundNormal.value = GroundTex.texture(data.normal, GroundTex.SIZE, GroundTex.LAYERS.length, anisotropy);
            u.tGroundPatch.value = GroundTex.texture(data.patch, GroundTex.PATCH_SIZE, 0, anisotropy);
            // Up to the GPU now, with their mipmaps, so the first frame that reads them does not pay for it
            if (renderer && renderer.initTexture) [u.tGroundAlbedo.value, u.tGroundNormal.value, u.tGroundPatch.value].forEach(t => renderer.initTexture(t));
            GroundTex.state = 'ready';
            GroundTex.madeMs = typeof performance !== 'undefined' ? performance.now() - t0 : 0;
            const levels = Object.keys(GroundTex.LEVELS);
            GroundTex.set(null, levels.find(id => GroundTex.LEVELS[id] === GroundTex.wanted) || 'off');
        };
        if (typeof Worker === 'undefined' || !GroundTex.SCRIPT) { done(make()); return; }
        try {
            const worker = new Worker(GroundTex.SCRIPT);
            worker.onmessage = (event) => { worker.terminate(); done(event.data); };
            worker.onerror = (event) => {
                console.warn('GroundTex: the worker failed; the textures are made on the main thread:', event.message);
                worker.terminate();
                done(make());
            };
            worker.postMessage('make');
        } catch (error) {
            console.warn('GroundTex: no worker; the textures are made on the main thread:', error);
            done(make());
        }
    },

    // The bytes the textures hold on the GPU, with their mipmaps (a third more)
    bytes() {
        const n = GroundTex.SIZE, p = GroundTex.PATCH_SIZE;
        return Math.round((2 * n * n * GroundTex.LAYERS.length + p * p) * 4 * 4 / 3);
    },

    texture(data, n, depth, anisotropy) {
        const texture = depth
            ? new THREE.DataArrayTexture(data, n, n, depth)
            : new THREE.DataTexture(data, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
        texture.format = THREE.RGBAFormat;
        texture.type = THREE.UnsignedByteType;
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.magFilter = THREE.LinearFilter;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.generateMipmaps = true;
        texture.anisotropy = anisotropy;
        texture.needsUpdate = true;
        return texture;
    },

    random(seed) {
        let s = seed >>> 0;
        return () => {
            s = (s + 0x6d2b79f5) | 0;
            let t = Math.imul(s ^ (s >>> 15), 1 | s);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    },

    // Value noise on a lattice of `cells` that wraps at the tile's edge
    periodicNoise(random, cells) {
        const grid = Array.from({ length: cells * cells }, random);
        return (x, y) => {
            const fx = x * cells, fy = y * cells;
            const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
            const at = (a, b) => grid[(((a % cells) + cells) % cells) + (((b % cells) + cells) % cells) * cells];
            const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
            const lo = at(i, j) + (at(i + 1, j) - at(i, j)) * su, hi = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * su;
            return lo + (hi - lo) * sv;
        };
    },

    // Sums of periodic noise: [[cells, weight], ...], 0 to about 1
    fbm(random, octaves) {
        const list = octaves.map(([cells, weight]) => [GroundTex.periodicNoise(random, cells), weight]);
        const total = octaves.reduce((sum, [, w]) => sum + w, 0);
        return (x, y) => { let v = 0; for (const [noise, w] of list) v += noise(x, y) * w; return v / total; };
    },

    smooth(a, b, x) {
        const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
        return t * t * (3 - 2 * t);
    },

    // Strokes of blades into a height field and a tone field: `count` strokes of `length` px in `angle` (or any way)
    blades(h, tone, n, random, { count, length, lift, angle = null, spread = Math.PI, toneOf }) {
        const wrap = v => ((v % n) + n) % n;
        for (let k = 0; k < count; k++) {
            const x0 = random() * n, y0 = random() * n;
            const a = angle === null ? random() * Math.PI * 2 : angle + (random() - 0.5) * spread;
            const len = length[0] + random() * (length[1] - length[0]), top = lift[0] + random() * (lift[1] - lift[0]), t0 = toneOf(random);
            for (let t = 0; t < len; t += 0.5) {
                const at = wrap(Math.floor(x0 + Math.cos(a) * t)) + wrap(Math.floor(y0 + Math.sin(a) * t)) * n;
                const v = top * (0.35 + 0.65 * t / len);
                if (v > h[at]) { h[at] = v; tone[at] = t0; }
            }
        }
    },

    // Clumps of grass: a ragged mound of blades, its edge frayed (`perM2` a square metre, radius in metres)
    clumps(h, tone, n, random, tileM, { perM2, radius, toneOf }) {
        const wrap = v => ((v % n) + n) % n;
        const ragged = GroundTex.periodicNoise(random, 64);
        const count = Math.round(tileM * tileM * perM2);
        for (let c = 0; c < count; c++) {
            const cx = random() * n, cy = random() * n, r = (radius[0] + random() * random() * (radius[1] - radius[0])) / tileM * n;
            const top = 0.65 + random() * 0.35, t0 = toneOf(random);
            for (let y = Math.floor(-r); y <= r; y++) for (let x = Math.floor(-r); x <= r; x++) {
                const d = Math.hypot(x, y) / r, edge = 0.75 + 0.35 * ragged((cx + x) / n, (cy + y) / n);
                if (d >= edge) continue;
                const at = wrap(Math.floor(cx) + x) + wrap(Math.floor(cy) + y) * n;
                const v = top * Math.sqrt(1 - (d / edge) * (d / edge)) * (0.7 + 0.3 * random());
                if (v > h[at]) { h[at] = v; tone[at] = t0 + (random() - 0.5) * 0.15; }
            }
            // Blades out of the clump every way, so it is a tuft and not a dome
            for (let k = 0; k < r * 4; k++) {
                const a = random() * Math.PI * 2, r0 = r * Math.sqrt(random()) * 0.9, len = 3 + random() * r * 0.7, lift = top * (0.6 + 0.4 * random());
                const x0 = cx + Math.cos(a) * r0, y0 = cy + Math.sin(a) * r0, turn = a + (random() - 0.5) * 1.2, t1 = t0 + (random() - 0.5) * 0.3;
                for (let t = 0; t < len; t += 0.5) {
                    const at = wrap(Math.floor(x0 + Math.cos(turn) * t)) + wrap(Math.floor(y0 + Math.sin(turn) * t)) * n;
                    const v = lift * (1 - 0.5 * t / len);
                    if (v > h[at]) { h[at] = v; tone[at] = t1; }
                }
            }
        }
    },

    // Stones: rounded, a little flat on top, lumpy at the edge; `perM2` of them `radius` m across, each its own tone
    stones(h, tone, n, random, tileM, { perM2, radius, lift = 1 }) {
        const wrap = v => ((v % n) + n) % n;
        const count = Math.round(tileM * tileM * perM2);
        for (let s = 0; s < count; s++) {
            const cx = random() * n, cy = random() * n, r = (radius[0] + random() * random() * (radius[1] - radius[0])) / tileM * n;
            const squash = 0.6 + random() * 0.4, turn = random() * Math.PI, lumps = random() * 6, t0 = random();
            const cos = Math.cos(turn), sin = Math.sin(turn);
            for (let y = Math.floor(-r - 1); y <= r + 1; y++) for (let x = Math.floor(-r - 1); x <= r + 1; x++) {
                const u = (x * cos + y * sin) / r, v = (-x * sin + y * cos) / (r * squash);
                const d = u * u + v * v * (1 + 0.15 * Math.sin(Math.atan2(v, u) * 3 + lumps));
                if (d >= 1) continue;
                const at = wrap(Math.floor(cx) + x) + wrap(Math.floor(cy) + y) * n;
                const value = lift * (0.55 + 0.45 * Math.pow(1 - d, 0.35));
                if (value > h[at]) { h[at] = value; tone[at] = t0; }
            }
        }
    },

    // A box blur that wraps, radius r px
    blur(h, n, r) {
        const out = new Float32Array(n * n), tmp = new Float32Array(n * n), k = 2 * r + 1;
        for (let y = 0; y < n; y++) {
            let sum = 0;
            for (let x = -r; x <= r; x++) sum += h[((x + n) % n) + y * n];
            for (let x = 0; x < n; x++) {
                tmp[x + y * n] = sum / k;
                sum += h[((x + r + 1) % n) + y * n] - h[((x - r + n) % n) + y * n];
            }
        }
        for (let x = 0; x < n; x++) {
            let sum = 0;
            for (let y = -r; y <= r; y++) sum += tmp[x + ((y + n) % n) * n];
            for (let y = 0; y < n; y++) {
                out[x + y * n] = sum / k;
                sum += tmp[x + ((y + r + 1) % n) * n] - tmp[x + ((y - r + n) % n) * n];
            }
        }
        return out;
    },

    // The five layers: { albedo, normal } as RGBA bytes, one 512 px layer after another. Albedo: the colour as its ratio
    // to the layer's mean colour (byte / 127.5, so a ratio of 1 is 127.5), the height in alpha. Normal: the height's
    // slope in x and y (0.5 flat, 1 is a slope of 2), 1 in blue and alpha
    layers() {
        const n = GroundTex.SIZE, count = GroundTex.LAYERS.length;
        const albedo = new Uint8Array(n * n * 4 * count), normal = new Uint8Array(n * n * 4 * count);
        GroundTex.LAYERS.forEach((name, layer) => {
            const { h, rgb } = GroundTex[`${name}Layer`]();
            const tileM = name === 'rock' ? GroundTex.ROCK_M : GroundTex.TILE_M;
            GroundTex.encode(h, rgb, n, GroundTex.RELIEF[layer], tileM, albedo, normal, layer * n * n * 4);
        });
        return { albedo, normal };
    },

    encode(h, rgb, n, reliefM, tileM, albedo, normal, offset) {
        // Crevices are darker (the light the clump's own blades shade off), baked into the colour before it is made
        // relative, so the mean holds
        const near = GroundTex.blur(h, n, 4);
        for (let i = 0; i < n * n; i++) {
            const cavity = Math.max(0.55, Math.min(1.1, 1 - (near[i] - h[i]) * 1.6));
            for (let c = 0; c < 3; c++) rgb[i * 3 + c] *= cavity;
        }
        // Each channel to a mean of 1; twice, since the bytes clip at a ratio of 2
        for (let pass = 0; pass < 3; pass++) {
            for (let c = 0; c < 3; c++) {
                let sum = 0;
                for (let i = 0; i < n * n; i++) sum += rgb[i * 3 + c];
                const k = (n * n) / sum;
                for (let i = 0; i < n * n; i++) rgb[i * 3 + c] = Math.min(2, rgb[i * 3 + c] * k);
            }
        }
        const byte = v => Math.max(0, Math.min(255, Math.round(v * 255)));
        const at = (x, y) => h[((x + n) % n) + ((y + n) % n) * n];
        const px = tileM / n;
        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                const i = x + y * n, o = offset + i * 4;
                albedo[o] = byte(rgb[i * 3] / 2);
                albedo[o + 1] = byte(rgb[i * 3 + 1] / 2);
                albedo[o + 2] = byte(rgb[i * 3 + 2] / 2);
                albedo[o + 3] = byte(h[i]);
                // Slope in metres a metre, stored as 0.5 + slope / 4
                const sx = (at(x + 1, y) - at(x - 1, y)) * reliefM / (2 * px), sy = (at(x, y + 1) - at(x, y - 1)) * reliefM / (2 * px);
                normal[o] = byte(0.5 + sx / 4);
                normal[o + 1] = byte(0.5 + sy / 4);
                normal[o + 2] = 255;
                normal[o + 3] = 255;
            }
        }
    },

    // Green grass: a low floor of short blades, clumps 12 to 40 cm across, a few straw blades, soil in the gaps
    grassLayer() {
        const n = GroundTex.SIZE, random = GroundTex.random(101), m = GroundTex.TILE_M;
        const h = new Float32Array(n * n), tone = new Float32Array(n * n).fill(-1);
        const toneOf = r => (r() < 0.07 ? 2 + r() : r());
        GroundTex.blades(h, tone, n, random, { count: 26000, length: [4, 10], lift: [0.15, 0.45], toneOf });
        GroundTex.clumps(h, tone, n, random, m, { perM2: 9, radius: [0.06, 0.2], toneOf });
        GroundTex.stones(h, tone, n, random, m, { perM2: 3, radius: [0.008, 0.035], lift: 0.4 });
        const mottle = GroundTex.fbm(random, [[8, 0.6], [23, 0.4]]);
        const rgb = new Float32Array(n * n * 3);
        for (let i = 0; i < n * n; i++) {
            const x = (i % n) / n, y = Math.floor(i / n) / n, v = h[i], t = tone[i];
            let c;
            if (t < 0 || v < 0.08) c = [0.62, 0.52, 0.4];
            else if (t >= 2) c = [1.3, 1.15, 0.8].map(k => k * (0.75 + 0.4 * v));
            else c = [0.92 + 0.14 * t, 0.97 + 0.06 * t, 0.92 - 0.1 * t].map(k => k * (0.72 + 0.42 * v));
            const g = 0.85 + 0.3 * mottle(x, y);
            rgb[i * 3] = c[0] * g; rgb[i * 3 + 1] = c[1] * g; rgb[i * 3 + 2] = c[2] * g;
        }
        return { h, rgb };
    },

    // Dry grass: longer blades lying over one way, fewer clumps, more soil between
    dryLayer() {
        const n = GroundTex.SIZE, random = GroundTex.random(202), m = GroundTex.TILE_M;
        const h = new Float32Array(n * n), tone = new Float32Array(n * n).fill(-1);
        const toneOf = r => r();
        GroundTex.blades(h, tone, n, random, { count: 15000, length: [8, 22], lift: [0.2, 0.55], angle: 0.6, spread: 1.4, toneOf });
        GroundTex.clumps(h, tone, n, random, m, { perM2: 4, radius: [0.05, 0.16], toneOf });
        GroundTex.stones(h, tone, n, random, m, { perM2: 5, radius: [0.008, 0.04], lift: 0.4 });
        const rgb = new Float32Array(n * n * 3);
        for (let i = 0; i < n * n; i++) {
            const v = h[i], t = tone[i];
            const c = t < 0 || v < 0.1 ? [0.6, 0.5, 0.38] : [0.95 + 0.2 * t, 0.95 + 0.1 * t, 0.9 - 0.15 * t].map(k => k * (0.5 + 0.9 * v));
            rgb[i * 3] = c[0]; rgb[i * 3 + 1] = c[1]; rgb[i * 3 + 2] = c[2];
        }
        return { h, rgb };
    },

    // Soil: brown crumbs and damp patches with small pebbles, a few blades
    soilLayer() {
        const n = GroundTex.SIZE, random = GroundTex.random(303), m = GroundTex.TILE_M;
        const base = GroundTex.fbm(random, [[6, 0.4], [17, 0.3], [53, 0.2], [151, 0.1]]);
        const h = new Float32Array(n * n), tone = new Float32Array(n * n).fill(-1);
        for (let i = 0; i < n * n; i++) h[i] = base((i % n) / n, Math.floor(i / n) / n) * 0.35;
        GroundTex.stones(h, tone, n, random, m, { perM2: 60, radius: [0.006, 0.03], lift: 0.75 });
        GroundTex.blades(h, tone, n, random, { count: 1500, length: [4, 10], lift: [0.3, 0.5], toneOf: () => 3 });
        const rgb = new Float32Array(n * n * 3);
        for (let i = 0; i < n * n; i++) {
            const t = tone[i], v = h[i];
            let c;
            if (t >= 3) c = [0.8, 1.1, 0.7];
            else if (t >= 0) c = [1.2, 1.3, 1.45].map(k => k * (0.7 + 0.5 * t));
            else c = [1, 1, 1].map(k => k * (0.6 + 1.1 * v));
            rgb[i * 3] = c[0]; rgb[i * 3 + 1] = c[1]; rgb[i * 3 + 2] = c[2];
        }
        return { h, rgb };
    },

    // Scree: angular stones 3 to 15 cm packed edge to edge, each its own tone, dark gaps between
    screeLayer() {
        const n = GroundTex.SIZE, random = GroundTex.random(404), m = GroundTex.TILE_M;
        const cells = 22, seeds = [];
        for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) seeds.push([(i + 0.15 + random() * 0.7) / cells, (j + 0.15 + random() * 0.7) / cells, random(), random()]);
        const grain = GroundTex.fbm(random, [[40, 0.5], [120, 0.5]]);
        const h = new Float32Array(n * n), rgb = new Float32Array(n * n * 3);
        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                const u = x / n, v = y / n, ci = Math.floor(u * cells), cj = Math.floor(v * cells);
                let first = Infinity, second = Infinity, best = null;
                for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
                    const ii = (ci + di + cells) % cells, jj = (cj + dj + cells) % cells, s = seeds[ii + jj * cells];
                    let dx = Math.abs(u - s[0]), dy = Math.abs(v - s[1]);
                    dx = Math.min(dx, 1 - dx); dy = Math.min(dy, 1 - dy);
                    const d = Math.hypot(dx, dy);
                    if (d < first) { second = first; first = d; best = s; } else if (d < second) second = d;
                }
                const edge = (second - first) * cells;
                const i = x + y * n, g = grain(u, v);
                h[i] = Math.min(1, Math.pow(Math.min(1, edge * 2.2), 0.45) * (0.6 + 0.4 * best[2]) + g * 0.12);
                const gap = GroundTex.smooth(0.02, 0.14, edge);
                const tone = (0.82 + 0.36 * best[2]) * (0.85 + 0.3 * g) * (0.6 + 0.4 * gap);
                const warm = (best[3] - 0.5) * 0.12;
                rgb[i * 3] = tone * (1 + warm); rgb[i * 3 + 1] = tone; rgb[i * 3 + 2] = tone * (1 - warm);
            }
        }
        return { h, rgb };
    },

    // Rock: grain over broad bumps, cut by cracks (the edges of a Voronoi pattern), lichen in pale patches
    rockLayer() {
        const n = GroundTex.SIZE, random = GroundTex.random(505);
        const broad = GroundTex.fbm(random, [[4, 0.45], [9, 0.3], [23, 0.17], [57, 0.08], [150, 0.05]]);
        const lichen = GroundTex.fbm(random, [[12, 0.6], [37, 0.4]]);
        // Cracks run only in part of the rock, so the cells do not read as paving
        const broken = GroundTex.fbm(random, [[5, 0.6], [13, 0.4]]);
        const seeds = Array.from({ length: 30 }, () => [random(), random()]);
        const h = new Float32Array(n * n), rgb = new Float32Array(n * n * 3);
        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                const u = x / n, v = y / n;
                let first = Infinity, second = Infinity;
                for (const [sx, sy] of seeds) {
                    const dx = Math.abs(u - sx), dy = Math.abs(v - sy);
                    const d = Math.hypot(Math.min(dx, 1 - dx), Math.min(dy, 1 - dy));
                    if (d < first) { second = first; first = d; } else if (d < second) second = d;
                }
                const crack = (1 - Math.min(1, (second - first) * 160)) * GroundTex.smooth(0.45, 0.65, broken(u, v));
                const i = x + y * n, b = broad(u, v), l = GroundTex.smooth(0.58, 0.7, lichen(u, v));
                h[i] = Math.max(0, b - crack * crack * 0.3);
                const tone = (0.75 + 0.5 * b) * (1 - crack * crack * 0.35);
                rgb[i * 3] = tone * (1 + 0.15 * l); rgb[i * 3 + 1] = tone * (1 + 0.15 * l); rgb[i * 3 + 2] = tone * (1 - 0.1 * l);
            }
        }
        return { h, rgb };
    },

    // The fields (24 m a repeat), RGBA bytes: red bare soil, green stony ground, blue dry grass (0 to 1 each, blue
    // around a mean of 0.5), alpha a mottle of tussocks
    patch() {
        const n = GroundTex.PATCH_SIZE, random = GroundTex.random(606);
        const soil = GroundTex.fbm(random, [[5, 0.5], [13, 0.3], [37, 0.2]]);
        const stone = GroundTex.fbm(random, [[7, 0.5], [19, 0.3], [61, 0.2]]);
        const dry = GroundTex.fbm(random, [[3, 0.5], [8, 0.35], [21, 0.15]]);
        const tussock = GroundTex.fbm(random, [[48, 0.55], [97, 0.45]]);
        const data = new Uint8Array(n * n * 4);
        const byte = v => Math.max(0, Math.min(255, Math.round(v * 255)));
        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                const u = x / n, v = y / n, i = (x + y * n) * 4;
                data[i] = byte(GroundTex.smooth(0.6, 0.72, soil(u, v)));
                data[i + 1] = byte(GroundTex.smooth(0.62, 0.74, stone(u, v)));
                data[i + 2] = byte(GroundTex.smooth(0.3, 0.7, dry(u, v)));
                data[i + 3] = byte(GroundTex.smooth(0.25, 0.75, tussock(u, v)));
            }
        }
        // The means the shader divides by (PATCH_MEAN; tests/unit/groundtex.test.js holds the two the same)
        const sums = [0, 0, 0, 0];
        for (let i = 0; i < n * n; i++) for (let c = 0; c < 4; c++) sums[c] += data[i * 4 + c] / 255;
        GroundTex.patchMean = sums.map(s => s / (n * n));
        return data;
    },

    // sRGB to linear, as Graphics.fixColorSpaces decodes the land's vertex colours
    linear(c) {
        return c.map(v => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    },

    // Adds the ground to a land tile's compiling shader (LandShade.patch with detail: it has vLandPos).
    // The fields' means must be known: patch() sets them, and the values below are what it makes
    inject(shader) {
        const G = GroundTex;
        const f = v => (Number.isInteger(v) ? `${v}.0` : `${v}`);
        const v3 = c => `vec3(${c.map(v => f(Math.round(v * 100000) / 100000)).join(', ')})`;
        const p = typeof LandShade !== 'undefined' ? LandShade.PALETTE : null;
        const means = [p ? p.grass : [0.3, 0.32, 0.21], p ? p.dry : [0.42, 0.38, 0.27], G.SOIL, p ? p.scree : [0.53, 0.51, 0.47], p ? p.rock : [0.43, 0.41, 0.38]].map(G.linear);
        const pm = G.PATCH_MEAN;
        Object.assign(shader.uniforms, G.uniforms);
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>
precision highp sampler2DArray;
uniform float uGround;
uniform sampler2DArray tGroundAlbedo;
uniform sampler2DArray tGroundNormal;
uniform sampler2D tGroundPatch;
const vec3 groundMean[5] = vec3[5](${means.map(v3).join(', ')});
// One hex cell's reading: the cell's weight, its turn and its offset
void groundHex(vec2 st, out vec3 w, out vec2 v1, out vec2 v2, out vec2 v3) {
    st *= 3.4641016;
    vec2 skew = vec2(st.x - 0.57735027 * st.y, 1.15470054 * st.y);
    vec2 base = floor(skew);
    vec3 t = vec3(fract(skew), 0.0);
    t.z = 1.0 - t.x - t.y;
    float s = step(0.0, -t.z), s2 = 2.0 * s - 1.0;
    w = vec3(-t.z * s2, s - t.y * s2, s - t.x * s2);
    v1 = base + vec2(s, s);
    v2 = base + vec2(s, 1.0 - s);
    v3 = base + vec2(1.0 - s, s);
}
// Its own hash: this text goes in before LandShade's landHash
float groundHash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
// The hex frame of a pixel, made once (groundFrame): each of the three cells' turn and offset, and their weights
mat2 groundR[3];
vec2 groundO[3];
vec3 groundW;
void groundFrame(vec2 uv) {
    vec2 c[3];
    groundHex(uv, groundW, c[0], c[1], c[2]);
    for (int i = 0; i < 3; i++) {
        float a = groundHash(c[i] + 17.0) * 6.2831853, cs = cos(a), sn = sin(a);
        groundR[i] = mat2(cs, sn, -sn, cs);
        groundO[i] = vec2(groundHash(c[i] + 3.0), groundHash(c[i] + 41.0));
    }
    // Sharpened, so a pixel mostly reads one cell; a cell that adds under 2% is not read
    groundW = pow(groundW, vec3(4.0));
    groundW /= groundW.x + groundW.y + groundW.z;
}
// A layer read by hex tiling at uv (tile units) with the gradients of the unmoved uv: the albedo ratio and height, and
// the height's slope turned back into the land's x and z
void groundRead(float layer, vec2 uv, vec2 dx, vec2 dy, out vec4 albedo, out vec2 slope) {
    vec4 sumA = vec4(0.0);
    vec2 sumS = vec2(0.0);
    float total = 0.0;
    for (int i = 0; i < 3; i++) {
        float w = groundW[i];
        if (w < 0.02) continue;
        mat2 r = groundR[i];
        vec3 at = vec3(r * uv + groundO[i], layer);
        vec4 a = textureGrad(tGroundAlbedo, at, r * dx, r * dy);
        vec2 n = textureGrad(tGroundNormal, at, r * dx, r * dy).xy * 4.0 - 2.0;
        // By height too, so where cells meet the taller blade or stone shows and the blend is not a smear
        w *= a.a + 0.15;
        sumA += a * w;
        sumS += (n * r) * w;
        total += w;
    }
    albedo = sumA / max(total, 1e-5);
    slope = sumS / max(total, 1e-5);
}
// Rock on three planes, by how far the land faces each: the albedo ratio and height, and the slope as a bend in x, y, z
void groundRock(vec3 p, vec3 dpx, vec3 dpy, vec3 up, out vec4 albedo, out vec3 bend) {
    vec3 bw = pow(abs(up), vec3(4.0));
    bw /= bw.x + bw.y + bw.z;
    vec3 rp = p / ${f(G.ROCK_M)}, rx = dpx / ${f(G.ROCK_M)}, ry = dpy / ${f(G.ROCK_M)};
    vec4 ax = textureGrad(tGroundAlbedo, vec3(rp.zy, 4.0), rx.zy, ry.zy), ay = textureGrad(tGroundAlbedo, vec3(rp.xz, 4.0), rx.xz, ry.xz), az = textureGrad(tGroundAlbedo, vec3(rp.xy, 4.0), rx.xy, ry.xy);
    vec2 nx = textureGrad(tGroundNormal, vec3(rp.zy, 4.0), rx.zy, ry.zy).xy * 4.0 - 2.0;
    vec2 ny = textureGrad(tGroundNormal, vec3(rp.xz, 4.0), rx.xz, ry.xz).xy * 4.0 - 2.0;
    vec2 nz = textureGrad(tGroundNormal, vec3(rp.xy, 4.0), rx.xy, ry.xy).xy * 4.0 - 2.0;
    albedo = ax * bw.x + ay * bw.y + az * bw.z;
    bend = vec3(0.0, nx.y, nx.x) * bw.x + vec3(ny.x, 0.0, ny.y) * bw.y + vec3(nz.x, nz.y, 0.0) * bw.z;
}
// The height for the relief's march: the cell that weighs most only, one reading a step
float groundHeight(float layer, vec2 uv, vec2 dx, vec2 dy, int cell) {
    mat2 r = groundR[cell];
    return textureGrad(tGroundAlbedo, vec3(r * uv + groundO[cell], layer), r * dx, r * dy).a;
}`)
            .replace('#include <color_fragment>', `#include <color_fragment>
vec3 groundBend = vec3(0.0);
// Taken before any branch: a derivative inside one that not every pixel of a quad takes is undefined
vec3 groundDp[2] = vec3[2](dFdx(vLandPos), dFdy(vLandPos));
if (uGround > 0.0) {
    float groundDist = length(vViewPosition);
    float groundAll = 1.0 - smoothstep(${f(G.FIELDS_NEAR_M)}, ${f(G.FIELDS_FAR_M)}, groundDist);
    if (groundAll > 0.0) {
        vec3 base = diffuseColor.rgb;
        vec3 up = normalize((vec4(vNormal, 0.0) * viewMatrix).xyz);
        if (up.y < 0.0) up = -up;
        vec2 xz = vLandPos.xz;
        // The fields, read twice: the second larger and turned, so the 24 m repeat does not line up
        mat2 turn = mat2(0.8, -0.6, 0.6, 0.8);
        vec4 fa = textureGrad(tGroundPatch, xz / ${f(G.PATCH_M)}, groundDp[0].xz / ${f(G.PATCH_M)}, groundDp[1].xz / ${f(G.PATCH_M)});
        vec4 fb = textureGrad(tGroundPatch, turn * xz / ${f(G.PATCH2_M)} + 0.37, turn * groundDp[0].xz / ${f(G.PATCH2_M)}, turn * groundDp[1].xz / ${f(G.PATCH2_M)});
        vec4 field = fa * 0.6 + fb * 0.4;
        const vec4 fieldMean = vec4(${pm.map(v => f(Math.round(v * 10000) / 10000)).join(', ')});
        // The cover rules (LandShade.weather): bare rock from about 40 degrees; the grass's dryness from its own colour
        float steep = smoothstep(0.234, 0.427, 1.0 - up.y);
        vec3 dg = groundMean[1] - groundMean[0];
        float dry0 = clamp(dot(base - groundMean[0], dg) / dot(dg, dg), 0.0, 1.0);
        float lumBase = dot(base, vec3(0.2126, 0.7152, 0.0722));
        float lumRock = dot(groundMean[4], vec3(0.2126, 0.7152, 0.0722)), lumScree = dot(groundMean[3], vec3(0.2126, 0.7152, 0.0722));
        float screeShare = clamp((lumBase - lumRock) / (lumScree - lumRock), 0.0, 1.0);
        float veg = 1.0 - steep;
        // A place's weights, and the weights the land expects on the whole (the fields at their means)
        float soil = field.r * 0.75, stone = field.g * 0.35;
        float bare = min(1.0, soil + stone);
        float dryv = clamp(dry0 + (field.b - fieldMean.b) * 1.3, 0.0, 1.0);
        float w[5];
        w[0] = veg * (1.0 - bare) * (1.0 - dryv);
        w[1] = veg * (1.0 - bare) * dryv;
        w[2] = veg * soil;
        w[3] = veg * stone + steep * screeShare;
        w[4] = steep * (1.0 - screeShare);
        float soilE = fieldMean.r * 0.75, stoneE = fieldMean.g * 0.35, bareE = min(1.0, soilE + stoneE);
        // Stones in the grass are the scree's grey at about the grass's light, not the bright scree of a slope
        vec3 mean[5] = groundMean;
        mean[3] *= mix(${f(G.STONE_IN_GRASS)}, 1.0, steep);
        vec3 expected = mean[0] * veg * (1.0 - bareE) * (1.0 - dry0) + mean[1] * veg * (1.0 - bareE) * dry0
            + mean[2] * veg * soilE + mean[3] * (veg * stoneE + steep * screeShare) + mean[4] * steep * (1.0 - screeShare);
        // The tussocks' mottle: light and shade metres across, about its mean
        float mottle = 1.0 + (field.a - fieldMean.a) * 0.35 * veg;
        vec3 near = vec3(0.0);
        if (uGround < 1.5) {
            for (int i = 0; i < 5; i++) near += mean[i] * w[i];
        } else {
            // The two layers that weigh most are read from the texture set; the others keep their mean colour
            int a = 0, b = 1;
            for (int i = 1; i < 5; i++) if (w[i] > w[a]) a = i;
            if (a == b) b = 0;
            for (int i = 0; i < 5; i++) if (i != a && w[i] > w[b]) b = i;
            vec2 dx = groundDp[0].xz, dy = groundDp[1].xz;
            // The ground one pixel covers: the short axis, or the long one over the anisotropy
            float lx = length(dx), ly = length(dy);
            float foot = max(min(lx, ly), max(lx, ly) / 8.0);
            float fine = 1.0 - smoothstep(${f(G.FINE_FOOT[0])}, ${f(G.FINE_FOOT[1])}, foot);
            for (int i = 0; i < 5; i++) if (i != a && i != b) near += mean[i] * w[i];
            if (fine > 0.0) {
                vec2 uv = xz / ${f(G.TILE_M)};
                vec2 tdx = dx / ${f(G.TILE_M)}, tdy = dy / ${f(G.TILE_M)};
                groundFrame(uv);
                // The relief: march the view ray into the commonest layer's height and read everything where it meets
                if (uGround > 2.5 && a < 4) {
                    float relief = ${f(G.RELIEF_M)} * (1.0 - smoothstep(${f(G.RELIEF_NEAR_M)}, ${f(G.RELIEF_FAR_M)}, groundDist)) * fine;
                    if (relief > 0.001) {
                        vec3 eye = -(transpose(mat3(viewMatrix)) * viewMatrix[3].xyz);
                        vec3 ray = normalize(vLandPos - eye);
                        vec2 march = ray.xz / max(-dot(ray, up), 0.2) * relief / ${f(G.RELIEF_STEPS)} / ${f(G.TILE_M)};
                        float depth = 0.0, lastGap = 0.0;
                        vec2 at = uv;
                        int cell = groundW.x > groundW.y ? (groundW.x > groundW.z ? 0 : 2) : (groundW.y > groundW.z ? 1 : 2);
                        for (int k = 0; k <= ${G.RELIEF_STEPS}; k++) {
                            float h = groundHeight(float(a), at, tdx, tdy, cell);
                            float gap = (1.0 - h) - depth;
                            if (gap <= 0.0) {
                                float t = k == 0 ? 0.0 : lastGap / max(lastGap - gap, 1e-4);
                                at -= march * (1.0 - t);
                                break;
                            }
                            lastGap = gap;
                            depth += 1.0 / ${f(G.RELIEF_STEPS)};
                            at += march;
                        }
                        uv = at;
                    }
                }
                vec4 la, lb; vec3 sa, sb; vec2 s2;
                if (a == 4) groundRock(vLandPos, groundDp[0], groundDp[1], up, la, sa);
                else { groundRead(float(a), uv, tdx, tdy, la, s2); sa = vec3(s2.x, 0.0, s2.y); }
                // The second layer is read only where it has a share worth the readings; else its mean, flat
                float wa = w[a], wb = w[b], sum = max(wa + wb, 1e-5);
                if (wb / sum < ${f(G.SECOND_MIN)}) { lb = vec4(0.5, 0.5, 0.5, 0.0); sb = vec3(0.0); }
                else if (b == 4) groundRock(vLandPos, groundDp[0], groundDp[1], up, lb, sb);
                else { groundRead(float(b), uv, tdx, tdy, lb, s2); sb = vec3(s2.x, 0.0, s2.y); }
                // Height blend of the two: the higher layer shows, the other fades under it over a short band
                float ha = la.a + wa / sum, hb = lb.a + wb / sum, top = max(ha, hb);
                float ba = max(ha - top + 0.25, 0.0), bb = max(hb - top + 0.25, 0.0);
                float pa = ba / (ba + bb), pb = 1.0 - pa;
                vec3 ra = mix(vec3(1.0), la.rgb * 2.0, fine), rb = mix(vec3(1.0), lb.rgb * 2.0, fine);
                near += sum * (mean[a] * ra * pa + mean[b] * rb * pb);
                groundBend = (sa * pa + sb * pb) * fine;
            } else {
                near += mean[a] * w[a] + mean[b] * w[b];
            }
        }
        vec3 ground = base * near / max(expected, vec3(1e-4)) * mottle;
        diffuseColor.rgb = mix(base, ground, groundAll);
    }
}`)
            .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
if (uGround > 1.5 && dot(groundBend, groundBend) > 0.0) {
    vec3 n = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
    n = normalize(n - (groundBend - n * dot(groundBend, n)));
    normal = normalize(mat3(viewMatrix) * n);
}`);
    }
};

// The file's own address, for the worker that makes the textures
GroundTex.SCRIPT = typeof document !== 'undefined' && document.currentScript ? document.currentScript.src : null;

// In that worker: make the textures off the main thread and hand their bytes back
if (typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' && self instanceof WorkerGlobalScope) {
    self.onmessage = () => {
        const set = GroundTex.layers(), patch = GroundTex.patch();
        self.postMessage({ albedo: set.albedo, normal: set.normal, patch }, [set.albedo.buffer, set.normal.buffer, patch.buffer]);
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GroundTex };
}
