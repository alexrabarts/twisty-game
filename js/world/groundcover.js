// GroundCover: the near ground of a world, the 'groundCover' effect of js/effects.js (a prototype). Two parts:
//
//   surface   the land tiles' shader (LandShade.patch with detail) paints the ground within FAR_M of the camera from a
//             pattern made at load from seeded noise: grass clumps 15 to 45 cm across with their blades, small stones
//             and the soil between them, blended by height (a clump stands over the soil, a stone through the grass)
//             and by fields of dry grass and bare ground metres across, so the 16 m cover colours of TerrainMesh no
//             longer read as one smooth olive smear. The clumps and stones bend the normal. A coarser field of dry and
//             bare patches goes on to MACRO_M
//   scatter   grass tufts and small stones as instances on the plain land within REACH_M of the camera, made by
//             16 m chunk from a hash of the chunk, so a place always has the same tufts. They grow out of the ground
//             with distance (the vertex shader scales each by its rank against the share kept there): nothing pops
//
// Nothing of the scatter is solid: a tuft is at most TUFT_H_M high and a stone STONE_H_M over the ground, and the
// physics reads neither (the fairness rule: solid only where something solid is drawn; these are ground cover). They
// stand only on land the physics calls runoff: never on a road or its verge, a stopping place, a side road's mouth
// (RoadClearance, CLEAR_M past every band), a bench, wall, drop or water node, or a retaining wall's coping or face.
//
// Off, the uniform is 0, the shader takes no branch of its own and the scatter is not in the scene: the land is drawn
// as before, to the bit.
const GroundCover = {
    // The surface: full within NEAR_M, gone by FAR_M; a pattern tile is PATTERN_M across, SIZE px
    NEAR_M: 30,
    FAR_M: 110,
    MACRO_M: 300,
    PATTERN_M: 3.2,
    SIZE: 512,
    // The scatter: within REACH_M, chunks of CHUNK_M, a place every SPACING_M; all kept within FULL_M, KEEP_FAR of them
    // at REACH_M
    REACH_M: 45,
    CHUNK_M: 16,
    SPACING_M: 0.5,
    FULL_M: 14,
    KEEP_FAR: 0.3,
    CLEAR_M: 0.35,
    // How far from the ride a wall is looked for, and how far past a wall's band (its coping and face) a thing keeps
    WALL_REACH_M: 12,
    WALL_CLEAR_M: 0.6,
    LAND_TOL_M: 0.08,
    // A tuft's and a stone's size (the instance's scale, from the smallest to the largest), and the most either stands
    // over the ground: low enough to be ground cover, not a thing the bike would meet
    TUFT_SCALE: [0.2, 0.45],
    STONE_SCALE: [0.05, 0.17],
    TUFT_H_M: 0.45,
    STONE_H_M: 0.12,
    // Most instances held at once, and the ms of a frame given to making chunks once the first set is made
    MAX_TUFTS: 16000,
    MAX_STONES: 5000,
    BUDGET_MS: 1.5,
    // A stone is flattened to STONE_FLAT of its height and sunk STONE_SINK of its size into the ground
    STONE_FLAT: 0.55,
    STONE_SINK: 0.5,

    get uniforms() {
        if (!GroundCover.shared) {
            GroundCover.shared = {
                uGroundCover: { value: 0 },
                tCoverPattern: { value: null },
                tCoverBend: { value: null }
            };
        }
        return GroundCover.shared;
    },

    set(game, on) {
        const u = GroundCover.uniforms;
        if (on && !u.tCoverPattern.value) {
            const { pattern, bend } = GroundCover.pattern();
            const anisotropy = game && game.renderer && game.renderer.capabilities ? game.renderer.capabilities.getMaxAnisotropy() : 8;
            u.tCoverPattern.value = GroundCover.texture(pattern, anisotropy);
            u.tCoverBend.value = GroundCover.texture(bend, anisotropy);
        }
        u.uGroundCover.value = on ? 1 : 0;
        GroundCover.on = on;
        if (!on && GroundCover.scatter) GroundCover.drop();
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

    // The pattern, RGBA bytes: red the grass's height (clumps of blades), green the stones' height, blue a field of
    // bare ground (0.4 to 1 m), alpha fine grain. `bend`: the clumps' slope in red and green, the stones' in blue and
    // alpha (0.5 flat)
    pattern() {
        const n = GroundCover.SIZE, m = GroundCover.PATTERN_M, random = GroundCover.random(41);
        const grass = new Float32Array(n * n), stone = new Float32Array(n * n);
        const wrap = v => ((v % n) + n) % n;
        // The ground between clumps is short grass: a low floor of strokes
        for (let k = 0; k < 26000; k++) {
            const x0 = random() * n, y0 = random() * n, angle = random() * Math.PI * 2, length = 3 + random() * 6, lift = 0.15 + random() * 0.25;
            for (let t = 0; t < length; t += 0.5) {
                const at = wrap(Math.floor(x0 + Math.cos(angle) * t)) + wrap(Math.floor(y0 + Math.sin(angle) * t)) * n;
                grass[at] = Math.max(grass[at], lift * (0.4 + 0.6 * t / length));
            }
        }
        // Clumps: seen from above a clump is a dense, ragged mound of blades, not a star: a dome broken by short
        // strokes every way, its edge frayed
        const clumps = Math.round(m * m * 10);
        const ragged = GroundCover.periodicNoise(random, 64);
        for (let c = 0; c < clumps; c++) {
            const cx = random() * n, cy = random() * n, radius = (0.06 + random() * random() * 0.16) / m * n, top = 0.6 + random() * 0.4;
            for (let y = Math.floor(-radius); y <= radius; y++) for (let x = Math.floor(-radius); x <= radius; x++) {
                const d = Math.hypot(x, y) / radius;
                const edge = 0.75 + 0.35 * ragged((cx + x) / n, (cy + y) / n);
                if (d >= edge) continue;
                const at = wrap(Math.floor(cx) + x) + wrap(Math.floor(cy) + y) * n;
                grass[at] = Math.max(grass[at], top * Math.sqrt(1 - (d / edge) * (d / edge)) * (0.7 + 0.3 * random()));
            }
            for (let k = 0; k < radius * 3; k++) {
                const angle = random() * Math.PI * 2, r0 = radius * Math.sqrt(random()) * 0.9, length = 2 + random() * radius * 0.5, lift = top * (0.5 + 0.5 * random());
                const x0 = cx + Math.cos(angle) * r0, y0 = cy + Math.sin(angle) * r0, turn = random() * Math.PI * 2;
                for (let t = 0; t < length; t += 0.5) {
                    const at = wrap(Math.floor(x0 + Math.cos(turn) * t)) + wrap(Math.floor(y0 + Math.sin(turn) * t)) * n;
                    grass[at] = Math.max(grass[at], lift * (1 - 0.4 * t / length));
                }
            }
        }
        // Stones: rounded, a little flat on top, 2 to 14 cm across, more of the small
        for (let s = 0; s < Math.round(m * m * 3); s++) {
            const cx = random() * n, cy = random() * n, r = (0.01 + random() * random() * 0.06) / m * n, squash = 0.6 + random() * 0.4, turn = random() * Math.PI;
            const cos = Math.cos(turn), sin = Math.sin(turn), lumps = random() * 6;
            for (let y = Math.floor(-r - 1); y <= r + 1; y++) for (let x = Math.floor(-r - 1); x <= r + 1; x++) {
                const u = (x * cos + y * sin) / r, v = (-x * sin + y * cos) / (r * squash);
                const d = u * u + v * v * (1 + 0.15 * Math.sin(Math.atan2(v, u) * 3 + lumps));
                if (d >= 1) continue;
                const at = wrap(Math.floor(cx) + x) + wrap(Math.floor(cy) + y) * n;
                stone[at] = Math.max(stone[at], Math.pow(1 - d, 0.4) * (0.5 + 0.5 * Math.min(1, r / 6)));
            }
        }
        const bare = [GroundCover.periodicNoise(random, 4), GroundCover.periodicNoise(random, 9)];
        const fine = GroundCover.periodicNoise(random, 96);
        const pattern = new Uint8Array(n * n * 4), bend = new Uint8Array(n * n * 4);
        const byte = v => Math.max(0, Math.min(255, Math.round(v * 255)));
        const at = (h, x, y) => h[wrap(x) + wrap(y) * n];
        // The slope over one pixel, scaled so a blade's flank or a stone's shoulder bends the normal well over
        const relief = 2.5;
        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                const i = (x + y * n) * 4;
                pattern[i] = byte(grass[x + y * n]);
                pattern[i + 1] = byte(stone[x + y * n]);
                pattern[i + 2] = byte(bare[0](x / n, y / n) * 0.6 + bare[1](x / n, y / n) * 0.4);
                pattern[i + 3] = byte(fine(x / n, y / n));
                bend[i] = byte(0.5 + (at(grass, x + 1, y) - at(grass, x - 1, y)) * relief * 0.5);
                bend[i + 1] = byte(0.5 + (at(grass, x, y + 1) - at(grass, x, y - 1)) * relief * 0.5);
                bend[i + 2] = byte(0.5 + (at(stone, x + 1, y) - at(stone, x - 1, y)) * relief);
                bend[i + 3] = byte(0.5 + (at(stone, x, y + 1) - at(stone, x, y - 1)) * relief);
            }
        }
        return { pattern, bend };
    },

    texture(data, anisotropy) {
        const n = GroundCover.SIZE;
        const texture = new THREE.DataTexture(data, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.magFilter = THREE.LinearFilter;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.generateMipmaps = true;
        texture.anisotropy = anisotropy;
        texture.needsUpdate = true;
        return texture;
    },

    // Colours of the surface (linear): the soil between the clumps, straw at the tips of dry grass, stone
    SOIL: [0.085, 0.062, 0.038],
    STRAW: [0.40, 0.32, 0.15],
    STONE: [0.2, 0.19, 0.17],

    // Adds the surface to a land tile's compiling shader (LandShade.patch with detail: it has vLandPos and landNoise)
    inject(shader) {
        const f = v => (Number.isInteger(v) ? `${v}.0` : `${v}`);
        const v3 = c => `vec3(${c.map(f).join(', ')})`;
        const lum = c => Math.round((0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) * 10000) / 10000;
        const G = GroundCover;
        Object.assign(shader.uniforms, G.uniforms);
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>
uniform float uGroundCover;
uniform sampler2D tCoverPattern;
uniform sampler2D tCoverBend;`)
            .replace('#include <color_fragment>', `#include <color_fragment>
float coverNear = 0.0;
vec3 coverBend = vec3(0.0);
if (uGroundCover > 0.0) {
    float coverDist = length(vViewPosition);
    float coverMacro = uGroundCover * (1.0 - smoothstep(${f(G.NEAR_M)}, ${f(G.MACRO_M)}, coverDist));
    if (coverMacro > 0.0) {
        vec3 up = normalize((vec4(vNormal, 0.0) * viewMatrix).xyz);
        float steep = smoothstep(0.2, 0.42, 1.0 - abs(up.y));
        vec2 p = vLandPos.xz;
        // Fields metres across: where the grass is dry, where the ground is bare, where it is stony
        float m1 = landNoise(p * 0.23 + 5.0), m2 = landNoise(p * 0.071 + 11.0), m3 = landNoise(p * 0.61 + 3.0);
        float dry = smoothstep(0.4, 0.78, m1 * 0.55 + m2 * 0.45);
        float bareField = smoothstep(0.5, 0.8, m2 * 0.6 + m3 * 0.4);
        float stony = clamp(0.25 + steep * 0.6 + bareField * 0.4 + (m3 - 0.5) * 0.5, 0.0, 1.0);
        vec3 base = diffuseColor.rgb;
        // Far off only the fields: dry patches toward straw, bare ones toward soil, so no 16 m blotch is one colour
        // Each at the base's own brightness, so a field changes the hue and not the light
        float baseLum = dot(base, vec3(0.2126, 0.7152, 0.0722));
        vec3 macro = mix(base, ${v3(G.STRAW)} * baseLum / ${f(lum(G.STRAW))}, dry * 0.3 * (1.0 - steep));
        macro = mix(macro, ${v3(G.SOIL)} * baseLum * 0.85 / ${f(lum(G.SOIL))}, bareField * 0.25 * (1.0 - steep));
        macro *= 0.9 + 0.2 * m3;
        coverNear = uGroundCover * (1.0 - smoothstep(${f(G.NEAR_M)}, ${f(G.FAR_M)}, coverDist));
        vec3 surface = macro;
        if (coverNear > 0.0) {
            // Two readings of the pattern, one turned and larger, crossing over in patches, so no repeat lines up
            vec2 q = p / ${f(G.PATTERN_M)};
            vec2 r = mat2(0.8, -0.6, 0.6, 0.8) * p / ${f(G.PATTERN_M * 1.73)} + 0.31;
            float pick = smoothstep(0.35, 0.65, m3);
            vec4 pat = mix(texture2D(tCoverPattern, q), texture2D(tCoverPattern, r), pick);
            vec4 bendTex = mix(texture2D(tCoverBend, q), texture2D(tCoverBend, r), pick);
            float grassH = (0.22 + 0.78 * pat.r) * (1.0 - steep * 0.7);
            float stoneH = pat.g * (0.35 + 0.9 * stony);
            float soilH = 0.04 + 0.6 * bareField * pat.b + steep * 0.25;
            // Height blend: the highest layer shows, the others under it fade over a short band
            float top = max(grassH, max(stoneH, soilH));
            float wg = max(grassH - top + 0.14, 0.0), ws = max(stoneH - top + 0.08, 0.0), wl = max(soilH - top + 0.14, 0.0);
            float sum = wg + ws + wl;
            wg /= sum; ws /= sum; wl /= sum;
            float grain = 0.85 + 0.3 * pat.a;
            vec3 blade = macro * (0.8 + 0.38 * pat.r) * grain;
            blade = mix(blade, ${v3(G.STRAW)} * (0.6 + 0.5 * pat.r), pat.r * pat.r * pat.r * (0.05 + 0.4 * dry));
            // On steep ground the bare layer is the rock's own scree, not brown soil
            vec3 soil = mix(${v3(G.SOIL)} * baseLum * 0.7 / ${f(lum(G.SOIL))}, base * 0.85, steep) * grain;
            vec3 rock = ${v3(G.STONE)} * (0.5 + 0.4 * pat.g) * (0.8 + 0.4 * m1);
            vec3 near = blade * wg + rock * ws + soil * wl;
            surface = mix(macro, near, coverNear);
            coverBend = vec3(bendTex.r * 2.0 - 1.0, 0.0, bendTex.g * 2.0 - 1.0) * wg * 0.35 + vec3(bendTex.b * 2.0 - 1.0, 0.0, bendTex.a * 2.0 - 1.0) * ws * 1.0;
            coverBend *= coverNear;
        }
        diffuseColor.rgb = mix(base, surface, coverMacro);
    }
}`)
            .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
if (coverNear > 0.0) {
    vec3 n = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
    n = normalize(n - (coverBend - n * dot(coverBend, n)));
    normal = normalize(mat3(viewMatrix) * n);
}`);
    },

    // The scatter

    hash(a, b, salt) {
        let h = Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(salt, 83492791);
        h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
        return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
    },

    // One tuft: BLADES thin blades round a foot, each a triangle from a 3 cm base to a point that leans out; normals
    // all up, so a tuft is lit as the ground under it is and its flanks never go black. The colour is a shade over the
    // instance's colour: dark at the foot, lighter and straw-tinted at the tips
    tuftGeometry() {
        const blades = 8, random = GroundCover.random(7);
        const positions = [], colours = [], normals = [];
        for (let b = 0; b < blades; b++) {
            const angle = (b / blades) * Math.PI * 2 + random() * 0.6, lean = 0.08 + random() * 0.3, h = 0.6 + random() * 0.4;
            const out = 0.03 + random() * 0.05, w = 0.035 + random() * 0.025;
            const cx = Math.cos(angle), sz = Math.sin(angle);
            const bx = cx * out, bz = sz * out;
            positions.push(bx - sz * w, 0, bz + cx * w, bx + sz * w, 0, bz - cx * w, bx + cx * lean * h, h, bz + sz * lean * h);
            colours.push(0.62, 0.62, 0.58, 0.62, 0.62, 0.58, 1.15, 1.15, 1.0);
            normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geometry.userData.linearColors = true;
        return geometry;
    },

    stoneGeometry() {
        const geometry = new THREE.IcosahedronGeometry(1, 0).toNonIndexed();
        const pos = geometry.attributes.position, random = GroundCover.random(13);
        // A rough stone, not a gem: each corner pushed in or out a little, the bottom half under the ground
        const moved = new Map();
        for (let i = 0; i < pos.count; i++) {
            const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
            if (!moved.has(key)) moved.set(key, 0.8 + random() * 0.35);
            const k = moved.get(key);
            pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k);
        }
        geometry.computeVertexNormals();
        return geometry;
    },

    // The vertex shader's part: an instance grows out of the ground by its rank against the share kept at its distance
    grow(material, key) {
        const G = GroundCover;
        const f = v => (Number.isInteger(v) ? `${v}.0` : `${v}`);
        material.onBeforeCompile = (shader) => {
            shader.vertexShader = shader.vertexShader
                .replace('#include <common>', '#include <common>\nattribute float coverRank;')
                .replace('#include <begin_vertex>', `#include <begin_vertex>
{
    vec3 root = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vec3 eye = -(transpose(mat3(viewMatrix)) * viewMatrix[3].xyz);
    float d = distance(root, eye);
    float keep = 1.0 - smoothstep(${f(G.FULL_M)}, ${f(G.REACH_M)}, d) * ${f(1 - G.KEEP_FAR)};
    float grow = clamp((keep - coverRank) / 0.15, 0.0, 1.0) * (1.0 - smoothstep(${f(G.REACH_M - 6)}, ${f(G.REACH_M)}, d));
    transformed *= grow;
}`);
        };
        material.customProgramCacheKey = () => key;
        return LandShade.haze(material);
    },

    // The plain land at (x, z) for a thing of plan radius `radius`: its height on the drawn tile and the tile's colour
    // there (linear), or null
    site(env, x, z, radius, out) {
        const m = WorldData.TILE_M, n = WorldData.TILE_N, cell = WorldData.CELL_M;
        const tx = Math.floor(x / m), tz = Math.floor(z / m), key = `${tx},${tz}`;
        const held = env.tileMeshes.get(key);
        if (!held || !held.mesh) return null;
        const tile = env.data.tile(key);
        if (!tile) return null;
        // No wall or water node at a corner of the 8 m cell. A road, bench or drop node is the importer's 8 m mark of
        // the carved band; what is drawn there is read below (the road bands, the walls, the ground the physics reads)
        const fi = (x - tx * m) / cell, fj = (z - tz * m) / cell;
        const i = Math.min(n - 2, Math.floor(fi)), j = Math.min(n - 2, Math.floor(fj));
        const zones = tile.zones, Z = WorldData.ZONE;
        for (const k of [j * n + i, j * n + i + 1, (j + 1) * n + i, (j + 1) * n + i + 1]) {
            const zone = zones[k];
            if (zone === Z.wall || zone === Z.water) return null;
        }
        // A triangle the walls cut is drawn at the cut's heights (TerrainMesh.drawnAt reads them)
        const mesh = held.mesh;
        const roads = env.scenery && env.scenery.roads, clear = radius + GroundCover.CLEAR_M, near = GroundCover.near || (GroundCover.near = {});
        near.segment = null;
        if (roads && roads.clearance(x, z, GroundCover.WALL_REACH_M, null, false, near) < clear) return null;
        if (env.ground.sideRoadY(x, z, clear) !== null) return null;
        // Beside the ride, not on a retaining wall's coping or against its face: WALL_CLEAR_M past the wall's band, and
        // past the parapet of a road that stands on a wall
        if (near.segment && near.segment.edgeId === null) {
            const g = env.ground, loc = GroundCover.loc || (GroundCover.loc = {});
            g.locate(x, z, { start: near.segment.index - 3, end: near.segment.index + 3 }, loc);
            const half = g.halfRoad(loc), reach = Math.abs(loc.lateral);
            const band = g.wallBand(loc, half);
            if (band && reach < band.to + GroundCover.WALL_CLEAR_M) return null;
            if (reach < half + g.vergeAt(loc.index, loc.lateral, loc.t) + GroundCover.WALL_CLEAR_M + 0.5 && g.onRetainingWall(loc, half)) return null;
        }
        out.y = TerrainMesh.drawnAt(mesh, x, z);
        if (!Number.isFinite(out.y)) return null;
        // The land is the top of what is drawn here: the ground the physics reads (the fill beside the road, a
        // stopping place, a side road) is the tile itself, within LAND_TOL_M; a carved node is drawn SINK_M under it
        // (only by the ride: past WALL_REACH_M of it, and beside a side road, the ground is the tile's)
        if (near.segment && near.segment.edgeId === null) {
            const top = env.ground.groundY(x, z, { start: near.segment.index - 3, end: near.segment.index + 3 }, false, GroundCover.loc || (GroundCover.loc = {}));
            if (!Number.isFinite(top) || top - out.y < -GroundCover.LAND_TOL_M || top - out.y > TerrainMesh.SINK_M + GroundCover.LAND_TOL_M) return null;
        }
        // The slope from the drawn ground half a metre either way (0 flat, 1 vertical)
        const gx = TerrainMesh.drawnAt(mesh, x + 0.5, z) - out.y, gz = TerrainMesh.drawnAt(mesh, x, z + 0.5) - out.y;
        out.slope = 1 - 0.5 / Math.sqrt(gx * gx + gz * gz + 0.25);
        const grid = TerrainMesh.colours(tile, env.data.cover(key));
        const a = fi - i, b = fj - j;
        for (let c = 0; c < 3; c++) {
            const v00 = grid[(j * n + i) * 3 + c], v10 = grid[(j * n + i + 1) * 3 + c], v01 = grid[((j + 1) * n + i) * 3 + c], v11 = grid[((j + 1) * n + i + 1) * 3 + c];
            out.colour[c] = (v00 * (1 - a) + v10 * a) * (1 - b) + (v01 * (1 - a) + v11 * a) * b;
        }
        out.mesh = mesh;
        return out;
    },

    // Makes the tufts and stones of chunk (job.cx, job.cz) row by row until `until` (performance.now()); `job` carries
    // the rows made so far. Done (true), the job holds for each kind its instances' matrices (16 floats), colours (3)
    // and ranks, ready to copy into the instanced meshes, and the tile meshes it was read from
    chunk(env, job, until = Infinity) {
        const G = GroundCover, size = G.CHUNK_M, step = G.SPACING_M, per = Math.round(size / step);
        const out = G.scratch || (G.scratch = { colour: [0, 0, 0] });
        const m = G.matrix || (G.matrix = new THREE.Matrix4()), q = new THREE.Quaternion(), p = new THREE.Vector3(), k = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
        const put = (list, x, y, z, turn, scale, flat, rank, r, g, b) => {
            m.compose(p.set(x, y, z), q.setFromAxisAngle(up, turn), k.set(scale, scale * flat, scale));
            for (let e = 0; e < 16; e++) list.matrices.push(m.elements[e]);
            list.colours.push(r, g, b);
            list.ranks.push(rank);
        };
        if (!job.tufts) Object.assign(job, { row: 0, tufts: { matrices: [], colours: [], ranks: [] }, stones: { matrices: [], colours: [], ranks: [] }, meshes: new Set() });
        const { cx, cz } = job;
        for (; job.row < per; job.row++) {
            if (performance.now() > until) return false;
            const b = job.row;
            for (let a = 0; a < per; a++) {
                const ia = cx * per + a, ib = cz * per + b;
                const x = (ia + G.hash(ia, ib, 1)) * step, z = (ib + G.hash(ia, ib, 2)) * step;
                const pick = G.hash(ia, ib, 3), rank = G.hash(ia, ib, 4), turn = G.hash(ia, ib, 5) * Math.PI * 2, grade = G.hash(ia, ib, 6);
                if (!G.site(env, x, z, 0.25, out)) continue;
                job.meshes.add(out.mesh);
                const steep = Math.min(1, Math.max(0, (out.slope - 0.2) / 0.22));
                // More stones and fewer tufts as the ground steepens toward rock
                const stoneShare = 0.04 + 0.4 * steep, tuftShare = 0.8 * (1 - steep * 0.85);
                const c = out.colour;
                if (pick < stoneShare) {
                    const scale = G.STONE_SCALE[0] + (G.STONE_SCALE[1] - G.STONE_SCALE[0]) * grade * grade, grey = 0.45 + 0.3 * G.hash(ia, ib, 7);
                    put(job.stones, x, out.y - scale * G.STONE_SINK, z, turn, scale, G.STONE_FLAT, rank, 0.30 * grey, 0.285 * grey, 0.26 * grey);
                } else if (pick < stoneShare + tuftShare) {
                    const scale = G.TUFT_SCALE[0] + (G.TUFT_SCALE[1] - G.TUFT_SCALE[0]) * grade, dry = G.hash(ia, ib, 8), tint = 0.8 + 0.45 * G.hash(ia, ib, 9);
                    // The land's own colour, turned toward straw on the dry ones
                    const d = dry * dry * dry * 0.5;
                    put(job.tufts, x, out.y - 0.02, z, turn, scale, 1, rank,
                        (c[0] * (1 - d) + G.STRAW[0] * d) * tint, (c[1] * (1 - d) + G.STRAW[1] * d) * tint, (c[2] * (1 - d) + G.STRAW[2] * d) * tint);
                }
            }
        }
        for (const kind of [job.tufts, job.stones]) {
            kind.matrices = new Float32Array(kind.matrices);
            kind.colours = new Float32Array(kind.colours);
            kind.ranks = new Float32Array(kind.ranks);
        }
        return true;
    },

    // The two instanced meshes, made once and kept under the world's group while the effect is on
    make(env) {
        const G = GroundCover;
        const tuftGeometry = G.tuftGeometry(), stoneGeometry = G.stoneGeometry();
        tuftGeometry.setAttribute('coverRank', new THREE.InstancedBufferAttribute(new Float32Array(G.MAX_TUFTS), 1));
        stoneGeometry.setAttribute('coverRank', new THREE.InstancedBufferAttribute(new Float32Array(G.MAX_STONES), 1));
        const tuftMaterial = G.grow(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), 'cover-tuft');
        const stoneMaterial = G.grow(new THREE.MeshLambertMaterial({ flatShading: true }), 'cover-stone');
        const tufts = new THREE.InstancedMesh(tuftGeometry, tuftMaterial, G.MAX_TUFTS);
        const stones = new THREE.InstancedMesh(stoneGeometry, stoneMaterial, G.MAX_STONES);
        const group = new THREE.Group();
        group.name = 'ground-cover';
        for (const [mesh, name] of [[tufts, 'cover-tufts'], [stones, 'cover-stones']]) {
            mesh.name = name;
            mesh.count = 0;
            mesh.frustumCulled = false;
            mesh.receiveShadow = true;
            mesh.userData.skipCulling = true;
            mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            mesh.setColorAt(0, new THREE.Color(1, 1, 1));
            group.add(mesh);
        }
        env.group.add(group);
        return { env, group, tufts, stones, chunks: new Map(), job: null };
    },

    drop() {
        const s = GroundCover.scatter;
        GroundCover.scatter = null;
        if (!s) return;
        s.group.parent && s.group.parent.remove(s.group);
        for (const mesh of [s.tufts, s.stones]) { mesh.geometry.dispose(); mesh.material.dispose(); mesh.dispose(); }
    },

    // Once a frame while the effect is on: the chunks round the camera are made (all at once the first time, then in
    // BUDGET_MS of a frame, nearest first), and the instances written again when the set changes
    frame(game) {
        const G = GroundCover, env = game.environment;
        if (!G.on || !env || !env.isWorld || !env.tileMeshes) return;
        if (G.scatter && G.scatter.env !== env) G.drop();
        if (!G.scatter) G.scatter = G.make(env);
        const s = G.scatter, eye = game.camera.position, size = G.CHUNK_M, reach = G.REACH_M + size * 0.75;
        const wanted = [];
        for (let cz = Math.floor((eye.z - reach) / size); cz <= Math.floor((eye.z + reach) / size); cz++) {
            for (let cx = Math.floor((eye.x - reach) / size); cx <= Math.floor((eye.x + reach) / size); cx++) {
                const d = Math.hypot((cx + 0.5) * size - eye.x, (cz + 0.5) * size - eye.z);
                if (d <= reach) wanted.push({ key: `${cx},${cz}`, cx, cz, d });
            }
        }
        wanted.sort((a, b) => a.d - b.d);
        // The first set is made at once (a ride's start, a restart, a jump); after it the chunks are made in BUDGET_MS of
        // each frame, nearest first, a chunk carried over from frame to frame
        const until = s.chunks.size ? performance.now() + G.BUDGET_MS : Infinity;
        let changed = false;
        // A chunk read from a tile mesh that has since been built again is made again
        for (const [key, chunk] of s.chunks) {
            if ([...chunk.meshes].some(mesh => !mesh.parent)) { s.chunks.delete(key); changed = true; }
        }
        const keys = new Set(wanted.map(w => w.key));
        if (s.job && !keys.has(s.job.key)) s.job = null;
        for (const w of wanted) {
            if (s.chunks.has(w.key)) continue;
            if (!s.job) s.job = { key: w.key, cx: w.cx, cz: w.cz };
            if (s.job.key !== w.key) continue;
            if (!G.chunk(env, s.job, until)) break;
            s.chunks.set(w.key, s.job);
            s.job = null;
            changed = true;
            if (performance.now() > until) break;
        }
        for (const key of [...s.chunks.keys()]) if (!keys.has(key)) { s.chunks.delete(key); changed = true; }
        if (changed) G.write(s, wanted);
    },

    write(s, wanted) {
        const G = GroundCover;
        for (const [mesh, field, max] of [[s.tufts, 'tufts', G.MAX_TUFTS], [s.stones, 'stones', G.MAX_STONES]]) {
            const matrices = mesh.instanceMatrix.array, colours = mesh.instanceColor.array, ranks = mesh.geometry.attributes.coverRank;
            let k = 0;
            for (const w of wanted) {
                const chunk = s.chunks.get(w.key);
                if (!chunk) continue;
                const list = chunk[field], n = Math.min(list.ranks.length, max - k);
                if (n <= 0) break;
                matrices.set(list.matrices.subarray(0, n * 16), k * 16);
                colours.set(list.colours.subarray(0, n * 3), k * 3);
                ranks.array.set(list.ranks.subarray(0, n), k);
                k += n;
            }
            mesh.count = k;
            mesh.instanceMatrix.needsUpdate = true;
            mesh.instanceColor.needsUpdate = true;
            ranks.needsUpdate = true;
        }
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GroundCover };
}
