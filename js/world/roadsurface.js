// RoadSurface: what the world road is made of and how it is painted. The textures are made here at load, from
// seeded noise, so the repo holds their source and no picture (tools/world/road-textures.mjs writes them out as PNG
// files to look at).
//
//   asphalt   a 1.5 m tile of chip-sealed alpine asphalt: aggregate chips in a dark binder, as the pass roads
//             above Airolo are surfaced. Albedo and roughness in one texture, the normal and the height in another
//   setts     a 1.6 m tile of the Via Tremola's granite setts laid in segmental arcs: rows of 10 cm setts that follow
//             arcs of 1.6 m chord and 0.3 m rise, the arcs of one row joined end to end across the road, with sanded
//             joints. The normal texture's alpha holds a number for each sett, so the shader can tone each sett again
//             in each copy of the tile and no copy repeats the last
//
// The ride's near ribbon (RoadMesh LOD0) reads them in nearMaterial(): its UV is metres across the road (positive to
// the right) and metres along it, so markings, wheel tracks, patches and cracks are drawn from the road's own
// coordinates and follow every bend smoothly. The textures themselves keep their size across the road in a bend: the
// asphalt's grain is laid on the ground plane (it has no direction), and each 1.6 m arc of setts takes its own metres
// along the road, those of its middle (settAlong), so the inside of a hairpin is not squashed; neighbouring arcs then
// meet out of step at the joint between them, as arcs laid round a bend do. Fine detail fades by the size of the
// patch of texture a pixel covers, measured both ways and allowing for the anisotropic filter (footprint), not by
// distance alone: the sett pattern, its normal and its roughness go to their means before the joints can beat against
// the pixels, and the normal map weakens where the road is seen edge-on. LOD1 keeps a flat colour (farMaterial), the
// mean of the textures, so the change of level is not seen.
//
// Markings follow the Swiss rules (SSV, SR 741.21, Art. 72 to 74; VSS SN 640 850a, as applied in canton Lucerne's
// Richtlinie Markierung 653.201): every longitudinal line is white (yellow is for bus and cycle lanes, parking and
// temporary works); a continuous edge line (Randlinie) 15 cm wide where the carriageway is at least 5.20 m; a broken
// centre line (Leitlinie) of 3 m dashes and 6 m gaps outside built-up areas, 15 cm wide, only where the carriageway
// is at least 6.00 m; a continuous centre line (Sicherheitslinie) where the sight is short (here a bend of less than
// 80 m radius) with a warning line (Vorwarnlinie) of 4 m dashes and 2 m gaps for at least 60 m before it; and an edge
// line broken 50/50 across a side road's mouth. The ride is always drawn 10 m wide (D2), so the rules read the
// width of the real road from its swissTLM3D class, not the drawn width: the old Tremola road ("4m Strasse") has no
// markings, as in the photos, and the main roads at Airolo and the summit have them.
class RoadSurface {
    static get MARKINGS() {
        return {
            // sRGB: road paint with glass beads, a little grey with wear
            paint: [0.86, 0.86, 0.83],
            lineWidthM: 0.15,
            edge: { insetM: 0.3, minWidthM: 5.2 },
            centre: { minWidthM: 6.0, solidRadiusM: 80 },
            broken: { dashM: 3, gapM: 6 },
            warning: { dashM: 4, gapM: 2, lengthM: 60 },
            mouth: { dashM: 0.5, gapM: 0.5 },
            // swissTLM3D road classes and the carriageway width each stands for (m)
            classWidthM: {
                'Autobahn': 11, 'Autostrasse': 9, '10m Strasse': 10, '8m Strasse': 8, '6m Strasse': 6, '4m Strasse': 4,
                '3m Strasse': 3, 'Ausfahrt': 6, 'Einfahrt': 6, 'Verbindung': 4, 'Dienstzufahrt': 3, 'Platz': 0, 'Markierte Spur': 3
            }
        };
    }

    // Values of a row's centre and edge styles (vertex attributes; neighbouring kinds differ by one)
    static get CENTRE() { return { none: 0, broken: 1, warning: 2, solid: 3 }; }
    static get EDGE() { return { none: 0, solid: 1, broken: 2 }; }

    // Metres one copy of each texture covers, and the period every pattern of the road shares: the ribbon's along-road
    // UV restarts at a multiple of it, so every pattern meets itself across a section joint
    static get ASPHALT_M() { return 1.5; }
    static get SETTS_M() { return 1.6; }
    static get PERIOD_M() { return 72; }
    // The setts' arcs: one tile wide, rising 0.3 m at the middle
    static get SETT_RISE_M() { return 0.3; }
    static get SETT_RADIUS_M() { const c = RoadSurface.SETTS_M, r = RoadSurface.SETT_RISE_M; return (c * c / 4 + r * r) / (2 * r); }

    // How many taps along a pixel's long axis the fade counts on from the anisotropic filter: half of what it is set to,
    // as the filter is an approximation and the lit relief aliases sooner than the colour
    static get FOOTPRINT_TAPS() { return RoadSurface.ANISOTROPY / 2; }

    // The metres along the road the setts are laid by at `lat` metres across: those of the middle of the 1.6 m arc that
    // holds `lat`, which is `along` (the centre's metres) less the arc's offset times the heading (`turn`, radians).
    // A column `o` across is 1 - o * curvature as long as the centre, so the arc keeps the setts' size through a bend
    static settAlong(along, turn, lat) {
        const S = RoadSurface.SETTS_M;
        return along - (Math.floor(lat / S) + 0.5) * S * turn;
    }

    // Which copy of the tile (counted along the road) the sett at `t` metres along (settAlong) and `lat` across belongs
    // to: that of its row's arc, which rises `sag` toward the arc's ends, so a sett cut by the tile's edge is one sett.
    // The shader tones each sett again by it
    static settCopy(t, lat) {
        const S = RoadSurface.SETTS_M, R = RoadSurface.SETT_RADIUS_M;
        const u = (lat / S - Math.floor(lat / S) - 0.5) * S;
        return Math.floor((t + R - Math.sqrt(R * R - u * u)) / S);
    }

    // The metres of texture a pixel covers once filtered, from its two screen-space gradients (metres a pixel each
    // way): the short axis, or the long one over the anisotropic filter's taps when that is more
    static footprint(gx, gy) {
        const a = Math.hypot(gx[0], gx[1]), b = Math.hypot(gy[0], gy[1]);
        return Math.max(Math.min(a, b), Math.max(a, b) / RoadSurface.FOOTPRINT_TAPS);
    }
    static get SIZE() { return 512; }

    // Metres of verge drawn past the carriageway edge: gravel, then grass that thins out over the ground
    static get VERGE_M() { return 1.1; }

    // The carriageway width a swissTLM3D class stands for; an unknown class is a narrow road
    static realWidth(cls) {
        const width = RoadSurface.MARKINGS.classWidthM[cls];
        return width === undefined ? 4 : width;
    }

    // The centre and edge style of each row: [{centre, left, right}]. `rows` carry {s, heading, bits} and `cls` (or
    // every row takes `cls` when one is given). A cobbled row is never painted.
    static styles(rows, cls = null) {
        const m = RoadSurface.MARKINGS;
        const C = RoadSurface.CENTRE, E = RoadSurface.EDGE;
        const n = rows.length;
        const out = rows.map(row => {
            const width = RoadSurface.realWidth(cls ?? row.cls);
            const painted = (row.bits & 8) === 0;
            const edge = painted && width >= m.edge.minWidthM ? E.solid : E.none;
            return { centre: painted && width >= m.centre.minWidthM ? C.broken : C.none, left: edge, right: edge };
        });
        if (n < 2) return out;
        // A bend tighter than solidRadiusM over 24 m of road takes a continuous centre line, 10 m past each end
        const along = rows.map((row, i) => (row.s !== undefined ? row.s : i * 4));
        const tight = new Uint8Array(n);
        let a = 0, b = 0;
        for (let i = 0; i < n; i++) {
            while (along[i] - along[a] > 12) a++;
            while (b < n - 1 && along[b + 1] - along[i] <= 12) b++;
            const run = along[b] - along[a];
            const turn = Math.abs(rows[b].heading - rows[a].heading);
            if (run > 0 && turn > 0 && run / turn < m.centre.solidRadiusM) tight[i] = 1;
        }
        const solid = new Uint8Array(n);
        for (let i = 0; i < n; i++) {
            if (!tight[i]) continue;
            for (let j = i; j >= 0 && along[i] - along[j] <= 10; j--) solid[j] = 1;
            for (let j = i; j < n && along[j] - along[i] <= 10; j++) solid[j] = 1;
        }
        // A broken stretch too short for its two warning lines and one dash and gap goes solid
        const shortest = 2 * m.warning.lengthM + m.broken.dashM + m.broken.gapM;
        let last = -1;
        for (let i = 0; i < n; i++) {
            if (!solid[i]) continue;
            if (last >= 0 && i - last > 1 && along[i] - along[last] < shortest) for (let j = last + 1; j < i; j++) solid[j] = 1;
            last = i;
        }
        for (let i = 0; i < n; i++) if (solid[i] && out[i].centre !== C.none) out[i].centre = C.solid;
        // Warning lines before and after each continuous line, for either way of travel
        for (let i = 0; i < n; i++) {
            if (out[i].centre !== C.solid) continue;
            for (const step of [-1, 1]) {
                const next = i + step;
                if (next < 0 || next >= n || out[next].centre === C.solid) continue;
                for (let j = next; j >= 0 && j < n && Math.abs(along[j] - along[i]) <= m.warning.lengthM && out[j].centre === C.broken; j += step) out[j].centre = C.warning;
            }
        }
        return out;
    }

    // Small seeded generator (mulberry32), so every load makes the same textures
    static random(seed) {
        let a = seed >>> 0;
        return () => {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    static hash(i, j, salt) {
        let k = Math.imul(i, 73856093) ^ Math.imul(j, 19349663) ^ Math.imul(salt + 1, 83492791);
        k = Math.imul(k ^ (k >>> 13), 0x5bd1e995);
        return ((k ^ (k >>> 15)) >>> 0) / 4294967296;
    }

    // Tileable value noise over `cells` cells across the tile, at pixel (x, y) of an n-pixel tile
    static noise(x, y, n, cells, salt) {
        const gx = (x / n) * cells, gy = (y / n) * cells;
        const i = Math.floor(gx), j = Math.floor(gy);
        const u = gx - i, v = gy - j;
        const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
        const h = (a, b) => RoadSurface.hash(((a % cells) + cells) % cells, ((b % cells) + cells) % cells, salt);
        const a = h(i, j), b = h(i + 1, j), c = h(i, j + 1), d = h(i + 1, j + 1);
        return (a + (b - a) * su) * (1 - sv) + (c + (d - c) * su) * sv;
    }

    // The normal of a tileable height field (RGB, 0.5 is flat), `strength` scaling its slopes
    static normals(height, n, strength, alpha) {
        const out = new Uint8Array(n * n * 4);
        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                const at = (dx, dy) => height[((y + dy + n) % n) * n + ((x + dx + n) % n)];
                const sx = (at(1, -1) + 2 * at(1, 0) + at(1, 1) - at(-1, -1) - 2 * at(-1, 0) - at(-1, 1)) / 8;
                const sy = (at(-1, 1) + 2 * at(0, 1) + at(1, 1) - at(-1, -1) - 2 * at(0, -1) - at(1, -1)) / 8;
                let nx = -sx * strength, ny = -sy * strength;
                const len = Math.hypot(nx, ny, 1);
                const o = (y * n + x) * 4;
                out[o] = Math.round((nx / len * 0.5 + 0.5) * 255);
                out[o + 1] = Math.round((ny / len * 0.5 + 0.5) * 255);
                out[o + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
                out[o + 3] = Math.round(Math.min(1, Math.max(0, alpha[y * n + x])) * 255);
            }
        }
        return out;
    }

    // Chip-sealed asphalt: {albedo (sRGB RGB, roughness in A), normal (RGB, height in A), mean (sRGB)}
    static asphalt(n = RoadSurface.SIZE) {
        const rand = RoadSurface.random(1871);
        // A chip every 4 px (about 12 mm) on a jittered grid, 1 to 2.8 px in radius
        const step = 4, cells = n / step;
        const chips = new Float32Array(cells * cells * 6);
        for (let k = 0; k < cells * cells; k++) {
            const i = k % cells, j = Math.floor(k / cells);
            const kind = rand();
            const tone = kind < 0.1 ? 0.37 + rand() * 0.05 : kind < 0.7 ? 0.30 + rand() * 0.05 : 0.26 + rand() * 0.04;
            chips.set([(i + 0.15 + rand() * 0.7) * step, (j + 0.15 + rand() * 0.7) * step, 1.3 + Math.pow(rand(), 0.7) * 1.3, tone, 0.97 + rand() * 0.05, 0.6 + rand() * 0.4], k * 6);
        }
        const height = new Float32Array(n * n);
        const albedo = new Uint8Array(n * n * 4);
        let sum = [0, 0, 0], roughSum = 0;
        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                const ci = Math.floor(x / step), cj = Math.floor(y / step);
                let best = 1, chip = -1;
                for (let dj = -1; dj <= 1; dj++) {
                    for (let di = -1; di <= 1; di++) {
                        const i = (ci + di + cells) % cells, j = (cj + dj + cells) % cells;
                        const k = (j * cells + i) * 6;
                        // The chip's centre, moved by whole tiles to the copy nearest this pixel
                        let dx = chips[k] - x, dy = chips[k + 1] - y;
                        dx -= Math.round(dx / n) * n;
                        dy -= Math.round(dy / n) * n;
                        const d = Math.hypot(dx, dy) / chips[k + 2];
                        if (d < best) { best = d; chip = k; }
                    }
                }
                const sand = RoadSurface.hash(x, y, 5);
                const grain = RoadSurface.noise(x, y, n, 64, 6);
                let tone, warm, rough, h;
                if (chip >= 0) {
                    const dome = Math.sqrt(1 - best * best);
                    h = 0.2 + dome * chips[chip + 5] * 0.6;
                    tone = chips[chip + 3] * (0.94 + 0.08 * dome) * (0.97 + sand * 0.06);
                    warm = chips[chip + 4];
                    rough = 0.8 + 0.06 * (1 - dome) + sand * 0.03;
                } else {
                    h = 0.1 * grain + 0.05 * sand;
                    tone = 0.24 + 0.03 * grain + 0.02 * sand;
                    warm = 1.02;
                    rough = 0.9;
                }
                height[y * n + x] = h;
                const o = (y * n + x) * 4;
                const r = Math.min(1, tone * warm), g = Math.min(1, tone), b = Math.min(1, tone * (2 - warm) * 0.98);
                albedo[o] = Math.round(r * 255);
                albedo[o + 1] = Math.round(g * 255);
                albedo[o + 2] = Math.round(b * 255);
                albedo[o + 3] = Math.round(rough * 255);
                sum[0] += r; sum[1] += g; sum[2] += b;
                roughSum += albedo[o + 3] / 255;
            }
        }
        const normal = RoadSurface.normals(height, n, 0.9, height.map(h => h / 0.85));
        return { albedo, normal, mean: sum.map(v => v / (n * n)), rough: roughSum / (n * n), size: n };
    }

    // Granite setts in segmental arcs: {albedo (sRGB, roughness in A), normal (RGB, a number per sett in A), mean}
    static setts(n = RoadSurface.SIZE) {
        const tile = RoadSurface.SETTS_M;
        const px = tile / n;
        // One arc a tile wide; a row of setts every 10 cm along the road (16 to the tile); 12 mm joints
        const chord = tile, pitch = 0.1, joint = 0.012;
        const radius = RoadSurface.SETT_RADIUS_M;
        const height = new Float32Array(n * n);
        const ids = new Float32Array(n * n);
        const albedo = new Uint8Array(n * n * 4);
        const rows = Math.round(tile / pitch);
        let sum = [0, 0, 0], roughSum = 0;
        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                const u = x * px - chord / 2;
                const v = y * px;
                // Distance along the road from the arc through this point's row: rows are arcs, highest mid-chord
                const sag = radius - Math.sqrt(radius * radius - u * u);
                const w = v + sag;
                const row = Math.floor(w / pitch);
                const across = (w / pitch - row) * pitch;
                const ring = ((row % rows) + rows) % rows;
                // Along the arc: its length from mid-chord; each row starts its setts at its own place
                const t = radius * Math.asin(u / radius);
                const size = 0.09 + RoadSurface.hash(ring, 1, 11) * 0.04;
                const shift = RoadSurface.hash(ring, 2, 12) * size;
                const k = Math.floor((t + shift) / size);
                const alongIn = (t + shift) - k * size;
                // Metres to the nearest joint: the row's two edges, the sett's two ends, and the seam where arcs meet
                const edge = Math.min(across, pitch - across, alongIn, size - alongIn, chord / 2 - Math.abs(u));
                const id = RoadSurface.hash(ring, k, 13);
                const inJoint = edge < joint / 2;
                const speck = RoadSurface.hash(x, y, 14);
                const mottle = RoadSurface.noise(x, y, n, 96, 15);
                let r, g, b, rough, h;
                if (inJoint) {
                    // Sand and grit in the joint, a little dirt
                    const grit = 0.2 + 0.08 * speck + 0.04 * mottle;
                    r = grit * 1.08; g = grit; b = grit * 0.88;
                    rough = 0.96;
                    h = 0.05 * speck;
                } else {
                    // Grey granite, a warmer or darker sett here and there; black mica and white feldspar specks
                    const pick = RoadSurface.hash(ring, k, 16);
                    let tone = 0.46 + (id - 0.5) * 0.12 + (pick > 0.9 ? -0.08 : 0);
                    const warm = pick > 0.8 && pick <= 0.9 ? 1.06 : 1 + (RoadSurface.hash(ring, k, 17) - 0.5) * 0.04;
                    tone *= 0.9 + 0.2 * mottle;
                    if (speck > 0.95) tone *= 0.6;
                    else if (speck < 0.04) tone = Math.min(0.85, tone * 1.25);
                    // The arrises are worn round and hold dirt; the tops are polished
                    const round = Math.min(1, (edge - joint / 2) / 0.018);
                    const dome = 1 - Math.pow(Math.abs(alongIn / size - 0.5) * 2, 2) * 0.25 - Math.pow(Math.abs(across / pitch - 0.5) * 2, 2) * 0.25;
                    h = 0.25 + 0.75 * Math.sin(round * Math.PI / 2) * dome;
                    tone *= 0.8 + 0.2 * round;
                    r = tone * warm * 1.02; g = tone; b = tone * (2 - warm) * 0.93;
                    rough = 0.62 + 0.22 * (1 - round) + 0.08 * RoadSurface.hash(ring, k, 18);
                }
                height[y * n + x] = h;
                ids[y * n + x] = inJoint ? 0 : id;
                const o = (y * n + x) * 4;
                albedo[o] = Math.round(Math.min(1, r) * 255);
                albedo[o + 1] = Math.round(Math.min(1, g) * 255);
                albedo[o + 2] = Math.round(Math.min(1, b) * 255);
                albedo[o + 3] = Math.round(rough * 255);
                sum[0] += r; sum[1] += g; sum[2] += b;
                roughSum += albedo[o + 3] / 255;
            }
        }
        const normal = RoadSurface.normals(height, n, 3.0, ids);
        return { albedo, normal, mean: sum.map(v => v / (n * n)), rough: roughSum / (n * n), size: n };
    }

    // A repeating, mipmapped, anisotropically filtered texture of `data` (RGBA bytes)
    static texture(data, n, srgb, name) {
        const texture = new THREE.DataTexture(data, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
        texture.name = name;
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.magFilter = THREE.LinearFilter;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.generateMipmaps = true;
        texture.anisotropy = RoadSurface.ANISOTROPY;
        texture.flipY = false;
        if (srgb) texture.encoding = THREE.sRGBEncoding;
        texture.needsUpdate = true;
        return texture;
    }

    static get ANISOTROPY() { return 8; }

    // The four textures and their means, made once: {asphalt: {map, normal, mean}, setts: {...}, bytes}
    static textures() {
        if (!RoadSurface.made) {
            const a = RoadSurface.asphalt(), s = RoadSurface.setts();
            RoadSurface.made = {
                asphalt: { map: RoadSurface.texture(a.albedo, a.size, true, 'road-asphalt'), normal: RoadSurface.texture(a.normal, a.size, false, 'road-asphalt-normal'), mean: a.mean, rough: a.rough },
                setts: { map: RoadSurface.texture(s.albedo, s.size, true, 'road-setts'), normal: RoadSurface.texture(s.normal, s.size, false, 'road-setts-normal'), mean: s.mean, rough: s.rough },
                // GPU bytes: four RGBA8 textures with their mip chains (a third more)
                bytes: Math.round((a.size * a.size + s.size * s.size) * 4 * 2 * 4 / 3)
            };
        }
        return RoadSurface.made;
    }

    // The mean colours of the two surfaces (sRGB), for the flat far ribbon and the structures
    static means() {
        const t = RoadSurface.textures();
        return { asphalt: t.asphalt.mean, setts: t.setts.mean };
    }

    // The far ribbon (LOD1) and side roads: flat vertex colours, lit like the near ribbon so the change of level hides
    static farMaterial() {
        if (!RoadSurface.far) {
            RoadSurface.far = LandShade.patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
        }
        return RoadSurface.far;
    }

    // The near ribbon: textured asphalt or setts, markings, wear and the verge (see the header)
    static nearMaterial() {
        if (RoadSurface.near) return RoadSurface.near;
        const t = RoadSurface.textures();
        const material = new THREE.MeshStandardMaterial({
            map: t.asphalt.map, normalMap: t.asphalt.normal, roughness: 1, metalness: 0, side: THREE.DoubleSide,
            polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, alphaToCoverage: true
        });
        material.name = 'world-road-near';
        LandShade.patch(material);
        const land = material.onBeforeCompile;
        const m = RoadSurface.MARKINGS;
        const linear = c => new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);
        const grass = LandShade.PALETTE.grass;
        const uniforms = {
            roadSettMap: { value: t.setts.map },
            roadSettNormal: { value: t.setts.normal },
            roadPaint: { value: linear(m.paint) },
            roadGrass: { value: linear(grass) },
            roadGravel: { value: linear([0.40, 0.38, 0.34]) },
            roadAsphaltMean: { value: linear(t.asphalt.mean) },
            roadSettMean: { value: linear(t.setts.mean) },
            roadAsphaltRough: { value: t.asphalt.rough },
            roadSettRough: { value: t.setts.rough }
        };
        material.userData.roadUniforms = uniforms;
        material.onBeforeCompile = (shader, renderer) => {
            land(shader, renderer);
            Object.assign(shader.uniforms, uniforms);
            RoadSurface.shader(shader);
        };
        material.customProgramCacheKey = () => 'world-road-near-2';
        RoadSurface.near = material;
        return material;
    }

    static swap(source, chunk, code) {
        if (!source.includes(chunk)) throw new Error(`road surface shader: no ${chunk} to replace`);
        return source.replace(chunk, code);
    }

    static shader(shader) {
        const m = RoadSurface.MARKINGS;
        const f = v => v.toFixed(4);
        shader.vertexShader = RoadSurface.swap(shader.vertexShader, '#include <common>', `#include <common>
attribute vec4 road;
attribute vec4 edge;
attribute float roadBase;
attribute vec3 roadArc;
attribute vec2 roadPlane;
varying vec4 vRoad;
varying vec4 vEdge;
varying float vRoadBase;
varying vec3 vRoadArc;
varying vec2 vRoadPlane;`);
        shader.vertexShader = RoadSurface.swap(shader.vertexShader, '#include <uv_vertex>', `#include <uv_vertex>
vRoad = road;
vEdge = edge;
vRoadBase = roadBase;
vRoadArc = roadArc;
vRoadPlane = roadPlane;`);
        shader.fragmentShader = RoadSurface.swap(shader.fragmentShader, '#include <common>', `#include <common>
uniform sampler2D roadSettMap;
uniform sampler2D roadSettNormal;
uniform vec3 roadPaint;
uniform vec3 roadGrass;
uniform vec3 roadGravel;
uniform vec3 roadAsphaltMean;
uniform vec3 roadSettMean;
uniform float roadAsphaltRough;
uniform float roadSettRough;
varying vec4 vRoad;
varying vec4 vEdge;
varying float vRoadBase;
varying vec3 vRoadArc;
varying vec2 vRoadPlane;
// RoadSurface.footprint: metres of texture a pixel covers once the anisotropic filter has done what it can
float roadFootprint(vec2 gx, vec2 gy) {
    float a = length(gx), b = length(gy);
    return max(min(a, b), max(a, b) / ${f(RoadSurface.FOOTPRINT_TAPS)});
}
// Share of [x - fw/2, x + fw/2] inside a line of width w centred on c: a box filter, so a line far off fades to its
// mean cover instead of flickering
float roadLine(float x, float c, float w, float fw) {
    fw = max(fw, 1e-4);
    return (clamp(x + 0.5 * fw - c, -0.5 * w, 0.5 * w) - clamp(x - 0.5 * fw - c, -0.5 * w, 0.5 * w)) / fw;
}
// The integral of a dash pattern (dash d, period p) from 0 to x, for the same box filter along the road
float roadDashSum(float x, float d, float p) { return floor(x / p) * d + min(mod(x, p), d); }
float roadDash(float x, float d, float p, float fw) {
    fw = max(fw, 1e-4);
    return (roadDashSum(x + 0.5 * fw, d, p) - roadDashSum(x - 0.5 * fw, d, p)) / fw;
}`);
        shader.fragmentShader = RoadSurface.swap(shader.fragmentShader, '#include <map_fragment>', `
float roadLat = vUv.x;
// Metres along the centre and the heading, divided out of their projective form (RoadMesh: q is the column's share of
// the centre's length), so a line across the road stays straight across a trapezoid quad in a bend
float roadAlong = vRoadArc.x / vRoadArc.z;
float roadTurn = vRoadArc.y / vRoadArc.z;
// Metres along the ride from its start, for noise only (the UV restarts every ${RoadSurface.PERIOD_M} m)
float roadS = roadAlong + vRoadBase * ${f(RoadSurface.PERIOD_M)};
float roadHalf = vRoad.x;
float roadSide = roadLat < 0.0 ? -1.0 : 1.0;
float roadDist = length(vViewPosition);
vec2 roadDx = vec2(dFdx(roadLat), dFdx(roadAlong));
vec2 roadDy = vec2(dFdy(roadLat), dFdy(roadAlong));
vec2 roadDTurn = vec2(dFdx(roadTurn), dFdy(roadTurn));
// Taken here, outside the branches below: a derivative inside a branch the pixels of one quad may not all take is undefined
vec2 gxA = dFdx(vRoadPlane), gyA = dFdy(vRoadPlane);
float roadFwLat = abs(roadDx.x) + abs(roadDy.x);
float roadFwAlong = abs(roadDx.y) + abs(roadDy.y);
// Detail that fades with distance: the normal, the cracks' relief
float roadNear = 1.0 - smoothstep(18.0, 140.0, roadDist);

vec4 roadA;
vec4 roadN;
float roadSett = step(0.5, vRoad.y);
float roadFine;
if (roadSett > 0.5) {
    // Each 1.6 m arc takes the metres along of its own middle (RoadSurface.settAlong), so the setts keep their size on
    // the inside of a bend; the gradients follow it, without the step at the joint between two arcs
    float settBand = floor(roadLat / ${f(RoadSurface.SETTS_M)});
    float settMid = (settBand + 0.5) * ${f(RoadSurface.SETTS_M)};
    float settT = roadAlong - settMid * roadTurn;
    vec2 uvS = vec2(roadLat, settT) / ${f(RoadSurface.SETTS_M)};
    vec2 gxS = vec2(roadDx.x, roadDx.y - settMid * roadDTurn.x);
    vec2 gyS = vec2(roadDy.x, roadDy.y - settMid * roadDTurn.y);
    roadA = textureGrad(roadSettMap, uvS, gxS / ${f(RoadSurface.SETTS_M)}, gyS / ${f(RoadSurface.SETTS_M)});
    roadN = textureGrad(roadSettNormal, uvS, gxS / ${f(RoadSurface.SETTS_M)}, gyS / ${f(RoadSurface.SETTS_M)});
    // Each sett toned again in each copy of the tile, so no two copies match. The copy is that of the sett's own row
    // (the arc through it, up to the tile's edge), not the pixel's, so a sett across the tile's edge keeps one tone
    float settU = (fract(uvS.x) - 0.5) * ${f(RoadSurface.SETTS_M)};
    float settSag = ${f(RoadSurface.SETT_RADIUS_M)} - sqrt(${f(RoadSurface.SETT_RADIUS_M * RoadSurface.SETT_RADIUS_M)} - settU * settU);
    float settCopy = floor((settT + settSag) / ${f(RoadSurface.SETTS_M)}) + vRoadBase * ${f(RoadSurface.PERIOD_M / RoadSurface.SETTS_M)};
    float again = landHash(vec2(roadN.a * 251.0, settBand * 17.0 + settCopy * 3.0));
    // By the patch a pixel covers: the relief goes flat first (its light aliases soonest), then once a pixel spans
    // about half a sett the colour and roughness are the means, before the joints can beat against the pixels (moire)
    roadFine = roadFootprint(gxS, gyS);
    float settFade = smoothstep(0.02, 0.06, roadFine);
    roadA.rgb *= mix(1.0, 0.86 + 0.28 * again, step(0.004, roadN.a) * (1.0 - settFade));
    roadA = mix(roadA, vec4(roadSettMean, roadSettRough), settFade);
    roadN.xyz = mix(roadN.xyz, vec3(0.5, 0.5, 1.0), smoothstep(0.006, 0.03, roadFine));
} else {
    // The grain has no direction: it is laid on the ground plane, so it keeps its size round any bend
    vec2 uvA = vRoadPlane / ${f(RoadSurface.ASPHALT_M)};
    // A second, larger copy (72 m / 13), turned square to the first, breaks the 1.5 m repeat; it only modulates the first
    vec2 uvB = vec2(-vRoadPlane.y, vRoadPlane.x) / ${f(RoadSurface.PERIOD_M / 13)} + vec2(0.37, 0.0);
    roadA = textureGrad(map, uvA, gxA / ${f(RoadSurface.ASPHALT_M)}, gyA / ${f(RoadSurface.ASPHALT_M)});
    roadN = textureGrad(normalMap, uvA, gxA / ${f(RoadSurface.ASPHALT_M)}, gyA / ${f(RoadSurface.ASPHALT_M)});
    vec4 roadB = textureGrad(map, uvB, vec2(-gxA.y, gxA.x) / ${f(RoadSurface.PERIOD_M / 13)}, vec2(-gyA.y, gyA.x) / ${f(RoadSurface.PERIOD_M / 13)});
    roadA.rgb *= mix(1.0, roadB.g / max(roadAsphaltMean.g, 0.01), 0.35);
    // The aggregate is read only close to: past about 8 mm a pixel it is the mean, and its relief goes sooner
    roadFine = roadFootprint(gxA, gyA);
    float grainFade = smoothstep(0.004, 0.016, roadFine);
    roadA.rgb = mix(roadA.rgb, roadAsphaltMean * (roadB.g / max(roadAsphaltMean.g, 0.01) * 0.35 + 0.65), grainFade * 0.7);
    roadA.a = mix(roadA.a, roadAsphaltRough, grainFade);
    roadN.xyz = mix(roadN.xyz, vec3(0.5, 0.5, 1.0), max(grainFade, smoothstep(4.0, 30.0, roadDist)));
}
vec3 roadAlbedo = roadA.rgb;
float roadRough = roadA.a;

// Tone across the road and along it: broad patches of older and newer surface, and the lanes' centres darker with drips
float roadBroad = landNoise(vec2(roadS * 0.021, roadLat * 0.09 + 3.0)) * 0.6 + landNoise(vLandPos.xz * 0.11) * 0.4;
roadAlbedo *= (0.82 + 0.22 * roadBroad) * mix(0.92, 0.95, roadSett);

// Wheel tracks, two to a lane: polished smoother, darker on asphalt. Their polish shows only where the road faces the eye:
// seen edge-on its sheen is the sky's reflection near full strength (Fresnel) and draws bright stripes along the road
float roadLane = roadSide * roadHalf * 0.5;
float roadWobble = (landNoise(vec2(roadS * 0.05, roadSide * 5.0)) - 0.5) * 0.5;
float roadTrack = 0.0;
for (int k = 0; k < 2; k++) {
    float c = roadLane + (float(k) * 2.0 - 1.0) * 0.85 + roadWobble;
    float d = (roadLat - c) / 0.32;
    roadTrack += exp(-d * d);
}
roadTrack = min(1.0, roadTrack) * step(abs(roadLat), roadHalf);
roadAlbedo *= 1.0 - roadTrack * mix(0.12, -0.03, roadSett);
roadRough -= roadTrack * 0.2 * smoothstep(0.12, 0.5, abs(dot(normalize(vNormal), normalize(vViewPosition))));

// Repairs on asphalt: a patch of newer surface in some 24 m cells, and sealed cracks
float roadCell = floor(roadAlong / 24.0) + vRoadBase * 3.0;
float roadPick = landHash(vec2(roadCell, 7.0));
if (roadSett < 0.5) {
    if (roadPick < 0.38) {
        float patchFrom = landHash(vec2(roadCell, 8.0)) * 12.0;
        float len = 2.5 + landHash(vec2(roadCell, 9.0)) * 8.0;
        float inner = landHash(vec2(roadCell, 10.0)) > 0.5 ? 1.0 : -1.0;
        float a0 = inner * (0.4 + landHash(vec2(roadCell, 11.0)) * 1.5);
        float a1 = inner * (roadHalf - 0.2 - landHash(vec2(roadCell, 12.0)) * 1.8);
        float lo = min(a0, a1), hi = max(a0, a1);
        float at = mod(roadAlong, 24.0);
        float jag = (landNoise(vec2(roadS * 3.1, roadLat * 3.1)) - 0.5) * 0.06;
        float inside = step(patchFrom + jag, at) * step(at, patchFrom + len + jag) * step(lo + jag, roadLat) * step(roadLat, hi + jag);
        roadAlbedo *= mix(1.0, 0.8, inside);
        roadRough += inside * 0.03;
        // The seam round it, sealed with bitumen
        float seam = max(max(roadLine(at, patchFrom + jag, 0.05, roadFwAlong), roadLine(at, patchFrom + len + jag, 0.05, roadFwAlong)) * step(lo, roadLat) * step(roadLat, hi),
                         max(roadLine(roadLat, lo + jag, 0.05, roadFwLat), roadLine(roadLat, hi + jag, 0.05, roadFwLat)) * step(patchFrom, at) * step(at, patchFrom + len));
        roadAlbedo = mix(roadAlbedo, roadAlbedo * 0.35, seam * 0.8);
        roadRough -= seam * 0.3;
    }
    // Transverse cracks, one in some 8 m cells: a jagged run part way across the road; a longitudinal joint along some stretches
    float crackCell = floor(roadAlong / 8.0) + vRoadBase * 9.0;
    float crackPick = landHash(vec2(crackCell, 21.0));
    float crackFrom = (landHash(vec2(crackCell, 23.0)) * 2.0 - 1.0) * roadHalf;
    float crackLen = 1.2 + landHash(vec2(crackCell, 24.0)) * 3.5;
    float crackAt = mod(roadAlong, 8.0) - 1.0 - landHash(vec2(crackCell, 22.0)) * 6.0 - 0.3 * (landNoise(vec2(roadLat * 1.1, crackCell)) - 0.5) - 0.07 * (landNoise(vec2(roadLat * 7.0, crackCell + 3.0)) - 0.5);
    float crackSpan = smoothstep(0.0, 0.3, roadLat - crackFrom) * smoothstep(0.0, 0.3, crackFrom + crackLen - roadLat);
    float crack = roadLine(crackAt, 0.0, 0.012 + 0.012 * crackPick, roadFwAlong) * step(crackPick, 0.3) * crackSpan * step(abs(roadLat), roadHalf - 0.1);
    float jointAt = 0.12 * roadSide + (landNoise(vec2(roadS * 0.4, 1.0)) - 0.5) * 0.18;
    crack = max(crack, roadLine(roadLat, jointAt, 0.025, roadFwLat) * smoothstep(0.55, 0.62, landNoise(vec2(roadS * 0.012, 4.0))));
    roadAlbedo = mix(roadAlbedo, vec3(0.025), crack * 0.85);
    roadRough -= crack * 0.45;
}

// Markings: white, worn through where the surface is low, with a slightly uneven edge
float roadPaintCover = 0.0;
if (roadSett < 0.5) {
    float wear = smoothstep(0.15, 0.55, landNoise(vec2(roadS * 1.7, roadLat * 6.0)) * 0.55 + roadN.a * 0.7);
    float edgeKind = floor((roadSide < 0.0 ? vEdge.x : vEdge.y) + 0.5);
    float lineC = roadSide * (roadHalf - ${f(m.edge.insetM)});
    float uneven = (landNoise(vec2(roadS * 3.0, roadSide * 9.0)) - 0.5) * 0.02;
    float across = roadLine(roadLat + uneven, lineC, ${f(m.lineWidthM)}, roadFwLat);
    // A broken edge line is spaced along the edge itself (its metres are 1 - lineC * curvature of the centre's)
    float edgeLine = edgeKind > 1.5 ? across * roadDash(roadS - lineC * roadTurn, ${f(m.mouth.dashM)}, ${f(m.mouth.dashM + m.mouth.gapM)}, roadFwAlong) : edgeKind > 0.5 ? across : 0.0;
    float centreKind = floor(vRoad.z + 0.5);
    float centreAcross = roadLine(roadLat + uneven, 0.0, ${f(m.lineWidthM)}, roadFwLat);
    float centre = centreKind > 2.5 ? centreAcross
        : centreKind > 1.5 ? centreAcross * roadDash(roadAlong, ${f(m.warning.dashM)}, ${f(m.warning.dashM + m.warning.gapM)}, roadFwAlong)
        : centreKind > 0.5 ? centreAcross * roadDash(roadAlong, ${f(m.broken.dashM)}, ${f(m.broken.dashM + m.broken.gapM)}, roadFwAlong) : 0.0;
    roadPaintCover = max(edgeLine, centre) * mix(0.45, 0.95, wear);
    roadAlbedo = mix(roadAlbedo, roadPaint * (0.92 + 0.08 * roadN.a), roadPaintCover);
    roadRough = mix(roadRough, 0.55, roadPaintCover);
}

// The edge of the carriageway: ragged, a lighter worn strip, then gravel, then grass thinning out over the ground.
// Where a side road leaves (vEdge.z, w) or the road is on a bridge or in a tunnel (vRoad.w), the verge is not drawn
// or is hard
float roadMouth = roadSide < 0.0 ? vEdge.z : vEdge.w;
float roadRag = (landNoise(vec2(roadS * 1.3, roadSide * 13.0)) - 0.5) * 0.22 + (landNoise(vec2(roadS * 7.0, roadSide * 7.0)) - 0.5) * 0.08;
float roadOut = abs(roadLat) - roadHalf - roadRag * (1.0 - vRoad.w);
float roadWorn = smoothstep(-0.5, 0.0, roadOut) * (1.0 - step(0.0, roadOut));
roadAlbedo = mix(roadAlbedo, roadAlbedo * 1.12 + roadGravel * 0.08, roadWorn * (1.0 - roadSett) * 0.7);
float roadVerge = smoothstep(-0.015, 0.015, roadOut);
float roadAlpha = 1.0;
if (roadVerge > 0.0) {
    float tuft = landNoise(vec2(roadS * 2.7, roadLat * 2.7)) * 0.7 + landNoise(vec2(roadS * 9.0, roadLat * 9.0)) * 0.3;
    vec3 gravel = roadGravel * (0.7 + 0.6 * roadA.g / max(roadAsphaltMean.g, 0.01)) * (0.9 + 0.2 * tuft);
    float green = smoothstep(0.08, 0.55, roadOut + (tuft - 0.5) * 0.5) * (1.0 - vRoad.w);
    vec3 verge = mix(gravel, roadGrass * (0.75 + 0.5 * tuft), green);
    roadAlbedo = mix(roadAlbedo, verge, roadVerge);
    roadRough = mix(roadRough, 0.95, roadVerge);
    roadAlpha = mix(1.0, 1.0 - smoothstep(0.3, 1.0, roadOut + (tuft - 0.5) * 0.45), (1.0 - vRoad.w) * roadVerge);
    roadAlpha *= 1.0 - roadMouth * roadVerge;
}
diffuseColor.rgb *= roadAlbedo;
diffuseColor.a *= roadAlpha;
`);
        // An opaque material writes alpha 1; the verge needs its alpha for alpha-to-coverage
        shader.fragmentShader = RoadSurface.swap(shader.fragmentShader, '#include <output_fragment>', 'gl_FragColor = vec4(outgoingLight, roadAlpha);');
        shader.fragmentShader = RoadSurface.swap(shader.fragmentShader, '#include <roughnessmap_fragment>', `float roughnessFactor = clamp(roadRough, 0.2, 1.0);`);
        shader.fragmentShader = RoadSurface.swap(shader.fragmentShader, '#include <normal_fragment_maps>', `
vec3 mapN = roadN.xyz * 2.0 - 1.0;
// Seen edge-on, the relief's light is all in the pixels' few last rows and flickers: it weakens as the road turns away
float roadFacing = smoothstep(0.03, 0.3, abs(dot(normal, normalize(vViewPosition))));
mapN.xy *= normalScale * mix(0.25, 1.0, roadNear) * roadFacing * (1.0 - roadPaintCover * 0.6) * (1.0 - roadVerge * 0.5);
normal = perturbNormal2Arb(-vViewPosition, normal, mapN, faceDirection);`);
    }
}
