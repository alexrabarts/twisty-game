// LandDetail: the near land's grain, the 'landDetail' effect of js/effects.js. Two tiling textures made at load from
// seeded noise, each 256 px with its height's slope in red and green and a shade in alpha: grass (blades and tufts) and
// rock (grain and cracks; scree is the same at a larger scale). The land tiles' shader (LandShade.patch with detail)
// reads them within FAR_M of the camera, by the slope of the land as LandShade.ground colours it (grass on the gentle
// ground, rock from about 40 degrees), shades the albedo and bends the normal, and both fade to nothing by FAR_M.
// Off, the uniform is 0 and the shader reads neither texture: the land is drawn as before.
const LandDetail = {
    // The grain is gone by FAR_M m and full inside NEAR_M m; SIZE px a tile, GRASS_M and ROCK_M metres a repeat
    NEAR_M: 12,
    FAR_M: 60,
    SIZE: 256,
    GRASS_M: 1.8,
    ROCK_M: 2.9,
    // How far the normal bends at full strength, and the share of the albedo the shade moves
    BEND: 0.55,
    SHADE: 0.5,

    get uniforms() {
        if (!LandDetail.shared) {
            LandDetail.shared = {
                uLandDetail: { value: 0 },
                tLandGrass: { value: null },
                tLandRock: { value: null }
            };
        }
        return LandDetail.shared;
    },

    set(on) {
        const u = LandDetail.uniforms;
        if (on && !u.tLandGrass.value) {
            u.tLandGrass.value = LandDetail.texture(LandDetail.grass());
            u.tLandRock.value = LandDetail.texture(LandDetail.rock());
        }
        u.uLandDetail.value = on ? 1 : 0;
    },

    // A seeded generator (mulberry32), so the textures are the same on every page
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

    // Grass: short strokes of blades in every direction over a few tufts, as a height field (0 to 1)
    grass() {
        const n = LandDetail.SIZE, h = new Float32Array(n * n), random = LandDetail.random(17);
        const tufts = LandDetail.periodicNoise(random, 6);
        for (let k = 0; k < 5200; k++) {
            const x0 = random() * n, y0 = random() * n, angle = random() * Math.PI * 2, length = 5 + random() * 11, lift = 0.5 + random() * 0.5;
            for (let t = 0; t < length; t += 0.5) {
                const x = Math.floor(x0 + Math.cos(angle) * t), y = Math.floor(y0 + Math.sin(angle) * t);
                const at = ((x % n) + n) % n + (((y % n) + n) % n) * n;
                h[at] = Math.max(h[at], lift * (0.35 + 0.65 * t / length));
            }
        }
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) h[x + y * n] = h[x + y * n] * 0.75 + tufts(x / n, y / n) * 0.25;
        return LandDetail.encode(h, 3.2);
    },

    // Rock: fine grain over broad bumps, cut by the cracks between wrapped cells (the edges of a Voronoi pattern)
    rock() {
        const n = LandDetail.SIZE, h = new Float32Array(n * n), random = LandDetail.random(29);
        const octaves = [[4, 0.45], [9, 0.3], [23, 0.17], [57, 0.08]].map(([cells, weight]) => [LandDetail.periodicNoise(random, cells), weight]);
        const seeds = Array.from({ length: 22 }, () => [random(), random()]);
        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                const u = x / n, v = y / n;
                let value = 0;
                for (const [noise, weight] of octaves) value += noise(u, v) * weight;
                let first = Infinity, second = Infinity;
                for (const [sx, sy] of seeds) {
                    const dx = Math.abs(u - sx), dy = Math.abs(v - sy);
                    const d = Math.hypot(Math.min(dx, 1 - dx), Math.min(dy, 1 - dy));
                    if (d < first) { second = first; first = d; } else if (d < second) second = d;
                }
                const crack = 1 - Math.min(1, (second - first) * 40);
                h[x + y * n] = value - crack * crack * 0.35;
            }
        }
        return LandDetail.encode(h, 2.4);
    },

    // RGBA bytes: the height's slope in x and y (0.5 is flat) scaled by `relief`, and the height as a shade in alpha
    encode(h, relief) {
        const n = LandDetail.SIZE, data = new Uint8Array(n * n * 4);
        let lo = Infinity, hi = -Infinity;
        for (const value of h) { lo = Math.min(lo, value); hi = Math.max(hi, value); }
        const span = hi - lo || 1;
        const at = (x, y) => (h[((x + n) % n) + ((y + n) % n) * n] - lo) / span;
        const byte = v => Math.max(0, Math.min(255, Math.round(v * 255)));
        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                const i = (x + y * n) * 4;
                data[i] = byte(0.5 + (at(x + 1, y) - at(x - 1, y)) * relief * 0.5);
                data[i + 1] = byte(0.5 + (at(x, y + 1) - at(x, y - 1)) * relief * 0.5);
                data[i + 2] = 255;
                data[i + 3] = byte(at(x, y));
            }
        }
        return data;
    },

    texture(data) {
        const n = LandDetail.SIZE;
        const texture = new THREE.DataTexture(data, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.magFilter = THREE.LinearFilter;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.generateMipmaps = true;
        texture.anisotropy = 8;
        texture.needsUpdate = true;
        return texture;
    },

    // Adds the grain to a land tile's compiling shader (LandShade.patch with detail: it has vLandPos, the world position)
    inject(shader) {
        const f = v => (Number.isInteger(v) ? `${v}.0` : `${v}`);
        Object.assign(shader.uniforms, LandDetail.uniforms);
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>
uniform float uLandDetail;
uniform sampler2D tLandGrass;
uniform sampler2D tLandRock;`)
            .replace('#include <color_fragment>', `#include <color_fragment>
float landNear = 0.0;
vec2 landGrassBend = vec2(0.0);
vec2 landRockBend = vec2(0.0);
float landRock = 0.0;
if (uLandDetail > 0.0) {
    landNear = uLandDetail * (1.0 - smoothstep(${f(LandDetail.NEAR_M)}, ${f(LandDetail.FAR_M)}, length(vViewPosition)));
    if (landNear > 0.0) {
        vec3 up = normalize((vec4(vNormal, 0.0) * viewMatrix).xyz);
        // Grass on the gentle ground, rock from about 40 degrees, as LandShade.ground colours it
        landRock = smoothstep(0.2, 0.42, 1.0 - abs(up.y));
        vec4 grass = mix(texture2D(tLandGrass, vLandPos.xz / ${f(LandDetail.GRASS_M)}), texture2D(tLandGrass, vLandPos.xz / ${f(LandDetail.GRASS_M * 3.7)} + 0.37), 0.35);
        // Rock is read on the face's own plane where it is steep, so a cliff is not streaked
        vec3 across = normalize(cross(vec3(0.0, 1.0, 0.0), up) + vec3(1e-4, 0.0, 0.0));
        vec2 face = landRock > 0.5 ? vec2(dot(vLandPos, across), vLandPos.y) : vLandPos.xz;
        vec4 rock = mix(texture2D(tLandRock, face / ${f(LandDetail.ROCK_M)}), texture2D(tLandRock, face / ${f(LandDetail.ROCK_M * 4.1)} + 0.61), 0.4);
        float shade = mix(grass.a, rock.a, landRock);
        diffuseColor.rgb *= mix(1.0, ${f(1 - LandDetail.SHADE / 2)} + ${f(LandDetail.SHADE)} * shade, landNear);
        landGrassBend = (grass.rg * 2.0 - 1.0) * (1.0 - landRock);
        landRockBend = (rock.rg * 2.0 - 1.0) * landRock;
    }
}`)
            .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
if (landNear > 0.0) {
    vec3 n = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
    vec3 across = normalize(cross(vec3(0.0, 1.0, 0.0), n) + vec3(1e-4, 0.0, 0.0));
    vec3 rockU = landRock > 0.5 ? across : vec3(1.0, 0.0, 0.0);
    vec3 rockV = landRock > 0.5 ? vec3(0.0, 1.0, 0.0) : vec3(0.0, 0.0, 1.0);
    vec3 bend = vec3(landGrassBend.x, 0.0, landGrassBend.y) + rockU * landRockBend.x + rockV * landRockBend.y;
    n = normalize(n - (bend - n * dot(bend, n)) * ${f(LandDetail.BEND)} * landNear);
    normal = normalize(mat3(viewMatrix) * n);
}`);
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { LandDetail };
}
