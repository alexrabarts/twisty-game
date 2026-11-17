// LandShade: how the land of a world is coloured and lit, shared by the tiles (TerrainMesh), the far grid (Horizon)
// and the far land beyond it (FarLand).
//
// Colours are authored in sRGB, as everywhere in the game (Graphics.fixColorSpaces decodes vertex colours once).
// They were measured against the owner's photos of the Tremola (the photo match, .agent/sop/photo-match.md): olive
// grass that turns gold with height in late summer, near-black spruce forest, grey-brown rock.
//
// Distances come from vViewPosition (view space): three does not upload cameraPosition to a Lambert material, and
// the eye of the curvature drop is taken from the view matrix for the same reason.
//
// LandShade.patch(material) gives a world material:
//   aerial perspective  distant land shifts toward a desaturated blue, 1 - exp(-d / reach), before the scene fog;
//                       the scene fog stays for weather (a fog look, rain, snow)
//   curvature           far meshes drop d^2 (1 - k) / 2R under the camera's horizon, as the real land does
//   detail              world-space value noise on the albedo near the camera, so open ground is not flat paint
//   stone               dry-stone courses in world space on a retaining wall (RoadMesh.stoneMaterial): courses of
//                       uneven height, granite blocks 0.3 to 0.6 m of mixed length and tone with thin joints and
//                       broad stains, fading to their mean far off (LandShade.STONE)
//   shade               the sky's fill light is held back, so the side of a valley away from the sun is dark, but
//                       never below the sky's floor (FLOOR of the albedo): no land face crushes to black
class LandShade {
    static get PALETTE() {
        if (!LandShade.palette) {
            LandShade.palette = {
                grass: [0.30, 0.32, 0.21],
                dry: [0.42, 0.38, 0.27],
                forest: [0.15, 0.22, 0.13],
                openForest: [0.22, 0.28, 0.16],
                rock: [0.43, 0.41, 0.38],
                scree: [0.53, 0.51, 0.47],
                snow: [0.90, 0.92, 0.95],
                ice: [0.70, 0.74, 0.77],
                water: [0.15, 0.24, 0.28],
                settlement: [0.46, 0.43, 0.39],
                bare: [0.40, 0.36, 0.30]
            };
        }
        return LandShade.palette;
    }

    // Earth radius and the usual refraction coefficient: a point d away drops d^2 (1 - k) / 2R
    static get DROP_PER_M2() { return (1 - 0.13) / (2 * 6371000); }

    // Smooth value noise in [0, 1] at (x, z) over cells of `scale` metres; the same everywhere and every time
    static noise(x, z, scale, salt = 0) {
        const gx = x / scale, gz = z / scale;
        const i = Math.floor(gx), j = Math.floor(gz);
        const u = gx - i, v = gz - j;
        const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
        const s = Math.imul(salt + 1, 83492791);
        const a = LandShade.hash(i, j, s), b = LandShade.hash(i + 1, j, s), c = LandShade.hash(i, j + 1, s), d = LandShade.hash(i + 1, j + 1, s);
        return (a + (b - a) * su) * (1 - sv) + (c + (d - c) * su) * sv;
    }

    static hash(a, b, s) {
        let k = Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ s;
        k = Math.imul(k ^ (k >>> 13), 0x5bd1e995);
        return ((k ^ (k >>> 15)) >>> 0) / 4294967296;
    }

    static mix(a, b, t, out = [0, 0, 0]) {
        out[0] = a[0] + (b[0] - a[0]) * t;
        out[1] = a[1] + (b[1] - a[1]) * t;
        out[2] = a[2] + (b[2] - a[2]) * t;
        return out;
    }

    // Open grass at (x, z, y): olive low down, gold and brown in patches and with height (late summer)
    static grass(x, z, y, out = [0, 0, 0]) {
        const p = LandShade.PALETTE;
        const patches = LandShade.noise(x, z, 140, 3) * 0.7 + LandShade.noise(x, z, 37, 4) * 0.3;
        const dry = Math.min(1, Math.max(0, (y - 1400) / 800) * 0.75 + Math.max(0, patches - 0.45) * 1.1);
        return LandShade.mix(p.grass, p.dry, dry, out);
    }

    // Rock, scree and snow over a base colour, by slope (0 flat, 1 vertical: 1 - normal.y), north (the normal's
    // share facing north, -z) and height. Snow only lies in patches high up and out of the sun (late summer).
    static weather(base, x, z, y, slope, north, out = base) {
        const p = LandShade.PALETTE;
        // Steep ground is bare rock: from about 40 degrees, all of it by 55 (grass holds on the steep flanks here)
        const steep = Math.min(1, Math.max(0, (slope - 0.234) / 0.193));
        const bare = Math.max(steep, Math.min(1, Math.max(0, (y - 2350) / 500)) * 0.7);
        if (bare > 0) LandShade.mix(out, LandShade.noise(x, z, 60, 5) > 0.5 ? p.rock : p.scree, bare, out);
        if (y > 2600 && slope < 0.45) {
            const patch = LandShade.noise(x, z, 90, 6);
            const snow = Math.min(1, Math.max(0, (y - 2700) / 500 + north * 0.9 + patch - 1.3) * 2);
            if (snow > 0) LandShade.mix(out, p.snow, Math.min(1, snow), out);
        }
        return out;
    }

    // The colour of far land from its cover shares (forest, rock, ice, known; 0 to 1). Where swissTLM3D does not reach
    // (known 0, outside Switzerland) the height decides: forest low down, rock high up.
    static farColor(x, z, y, slope, north, shares, out = [0, 0, 0]) {
        const p = LandShade.PALETTE;
        let [forest, rock, ice, known] = shares;
        if (known < 0.5) {
            const guess = 1 - known;
            forest = forest * known + guess * (y < 1750 ? 0.6 : Math.max(0, 0.6 - (y - 1750) / 400));
            rock = rock * known + guess * Math.min(1, Math.max(0, (y - 2100) / 600));
            ice = ice * known + guess * Math.min(1, Math.max(0, (y - 3100) / 400));
        }
        LandShade.grass(x, z, y, out);
        // A forest edge is an edge, not a fade: the share is sharpened before it mixes
        const wood = Math.min(1, Math.max(0, (forest - 0.15) / 0.45));
        LandShade.mix(out, p.forest, wood * wood * (3 - 2 * wood), out);
        LandShade.mix(out, LandShade.noise(x, z, 300, 7) > 0.5 ? p.rock : p.scree, Math.min(1, rock), out);
        LandShade.weather(out, x, z, y, slope * (1 - Math.min(1, forest) * 0.6), north, out);
        // Old ice and firn by late summer: grey-white, not fresh snow
        LandShade.mix(out, p.ice, Math.min(1, ice), out);
        return out;
    }

    // Uniforms every patched material shares; update() writes them once a frame
    static get uniforms() {
        if (!LandShade.shared) {
            LandShade.shared = {
                uAerialColor: { value: new THREE.Color(0.32, 0.42, 0.56) },
                uAerialReach: { value: LandShade.AERIAL_REACH_M },
                uAerialMax: { value: LandShade.AERIAL_MAX },
                uDrop: { value: LandShade.DROP_PER_M2 },
                uIndirect: { value: LandShade.INDIRECT },
                uLandFloor: { value: LandShade.FLOOR },
                uDetail: { value: 1 }
            };
        }
        return LandShade.shared;
    }

    // Metres over which the aerial tint reaches 63% of its most, and its most
    static get AERIAL_REACH_M() { return 14000; }
    static get AERIAL_MAX() { return 0.85; }
    // The dry-stone courses of a retaining wall (metres): a band of two courses whose split falls between splitMin and
    // splitMax of it (so the courses run 0.18 to 0.36 m high), blocks lengthMin to lengthMax long (real dry-stone
    // blocks, 0.3 to 0.6 m: longer read as brick), the courses wandering wanderM up and down. LandShade.stoneCell is
    // the same pattern in JS
    static get STONE() { return { bandM: 0.54, splitMin: 0.34, splitMax: 0.66, lengthMin: 0.28, lengthMax: 0.62, wanderM: 0.2 }; }

    // The block of the stone pattern at (u metres along the face, y metres up), as the shader draws it: {row, col,
    // courseM, lengthM} (row and col name the block)
    static stoneCell(u, y) {
        const S = LandShade.STONE;
        const hash = LandShade.glslHash;
        const noise = LandShade.glslNoise;
        const yy = y + S.wanderM * (noise(u * 0.9, y * 0.5) - 0.5);
        const band = Math.floor(yy / S.bandM);
        const inBand = yy / S.bandM - band;
        const split = S.splitMin + (S.splitMax - S.splitMin) * hash(band, 5);
        const upper = inBand >= split ? 1 : 0;
        const row = band * 2 + upper;
        const lengthM = S.lengthMin + (S.lengthMax - S.lengthMin) * hash(row, 7);
        const col = Math.floor(u / lengthM + hash(row, 3));
        return { row, col, courseM: S.bandM * (upper ? 1 - split : split), lengthM };
    }

    // The GLSL landHash and landNoise in JS
    static glslHash(x, y) {
        const fr = v => v - Math.floor(v);
        const a = fr(x * 0.1031), b = fr(y * 0.1031), c = a;
        const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33);
        return fr((a + d + b + d) * (c + d));
    }
    static glslNoise(x, y) {
        const i = Math.floor(x), j = Math.floor(y), f = x - i, g = y - j;
        const u = f * f * (3 - 2 * f), v = g * g * (3 - 2 * g);
        const h = LandShade.glslHash;
        const lo = h(i, j) + (h(i + 1, j) - h(i, j)) * u, hi = h(i, j + 1) + (h(i + 1, j + 1) - h(i, j + 1)) * u;
        return lo + (hi - lo) * v;
    }

    // The share of the sky's fill light the land keeps
    static get INDIRECT() { return 0.8; }
    // The least share of its albedo a land face keeps as sky light, however it faces the sun (the near-black share of
    // world-floating's views, LAND_BLACK_SHARE, holds it)
    static get FLOOR() { return 0.25; }

    // The aerial colour: the blue of distant ridges in the photos (far land, 3 km and more, about sRGB 80, 103, 128),
    // a little of the sky's horizon in it, so a weather look still tints it (linear)
    static update(scene, graphics) {
        const u = LandShade.uniforms;
        const fog = scene && scene.fog ? scene.fog.color : null;
        const blue = LandShade.blue || (LandShade.blue = new THREE.Color(0.075, 0.13, 0.22));
        if (fog) u.uAerialColor.value.copy(fog).multiplyScalar(0.3).lerp(blue, 0.8);
        // The no-post path mixes fog after the colour is encoded to sRGB (Graphics.render does the same for the fog)
        if (graphics && !graphics.postEnabled) u.uAerialColor.value.convertLinearToSRGB();
    }

    // Patches a built-in material (Lambert or Standard) in place; `curvature` for far meshes, `detail` for the tiles,
    // `floor` scales the sky's floor (a structure's underside sees the light the land and the sky throw back)
    static patch(material, { curvature = false, detail = false, stone = false, floor = 1 } = {}) {
        if (material.userData.landShade) return material;
        const S = LandShade.STONE;
        const f = v => (Number.isInteger(v) ? `${v}.0` : `${v}`);
        material.userData.landShade = true;
        const shared = LandShade.uniforms;
        material.onBeforeCompile = (shader) => {
            Object.assign(shader.uniforms, shared);
            shader.vertexShader = shader.vertexShader
                .replace('#include <common>', `#include <common>\nuniform float uDrop;\nvarying vec3 vLandPos;${stone ? '\nvarying vec3 vLandNormal;' : ''}`)
                .replace('#include <begin_vertex>', curvature
                    ? `#include <begin_vertex>\n{ vec3 eye = -(transpose(mat3(viewMatrix)) * viewMatrix[3].xyz); vec2 d = (modelMatrix * vec4(transformed, 1.0)).xz - eye.xz; transformed.y -= dot(d, d) * uDrop; }`
                    : '#include <begin_vertex>')
                .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>\nvLandPos = (modelMatrix * vec4(transformed, 1.0)).xyz;${stone ? '\nvLandNormal = mat3(modelMatrix) * objectNormal;' : ''}`);
            shader.fragmentShader = shader.fragmentShader
                .replace('#include <common>', `#include <common>
uniform vec3 uAerialColor;
uniform float uAerialReach;
uniform float uAerialMax;
uniform float uIndirect;
uniform float uLandFloor;
uniform float uDetail;
varying vec3 vLandPos;
${stone ? 'varying vec3 vLandNormal;' : ''}
float landHash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float landNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(landHash(i), landHash(i + vec2(1.0, 0.0)), u.x), mix(landHash(i + vec2(0.0, 1.0)), landHash(i + vec2(1.0, 1.0)), u.x), u.y);
}`)
                .replace('#include <color_fragment>', detail ? `#include <color_fragment>
{
    float dist = length(vViewPosition);
    // Tufts and stones close by, then patches, then the lie of the land; each fades before it would shimmer
    float tuft = landNoise(vLandPos.xz * 1.3) * (1.0 - smoothstep(15.0, 90.0, dist));
    float fine = landNoise(vLandPos.xz * 0.45) * 0.4 + landNoise(vLandPos.xz * 0.11) * 0.35 + landNoise(vLandPos.xz * 0.029) * 0.25;
    float broad = landNoise(vLandPos.xz * 0.006);
    float near = 1.0 - smoothstep(120.0, 1400.0, dist);
    diffuseColor.rgb *= mix(1.0, 0.5 + 1.0 * fine, near * uDetail) * (0.86 + 0.28 * broad) * (1.0 + (tuft - 0.5) * 0.5 * uDetail);
}` : stone ? `#include <color_fragment>
{
    // Dry-stone granite (LandShade.STONE): courses of their own height that wander up and down, blocks of mixed length
    // offset from the course below, each block its own tone and a warm or cool cast, thin soft joints; broad stains
    // (lichen, damp, weathering) over metres, so one wall and the next never repeat. Along the face's own horizontal,
    // so a wall reads the same at any heading
    vec3 n = normalize(vLandNormal);
    vec2 t = normalize(vec2(-n.z, n.x) + vec2(1e-4, 0.0));
    float u = dot(vLandPos.xz, t);
    float y = vLandPos.y + ${f(S.wanderM)} * (landNoise(vec2(u * 0.9, vLandPos.y * 0.5)) - 0.5);
    float band = floor(y / ${f(S.bandM)});
    float inBand = fract(y / ${f(S.bandM)});
    // Two courses to a band, split at a height of the band's own: courses of uneven height
    float split = ${f(S.splitMin)} + ${f(S.splitMax - S.splitMin)} * landHash(vec2(band, 5.0));
    float upper = step(split, inBand);
    float row = band * 2.0 + upper;
    float courseH = ${f(S.bandM)} * mix(split, 1.0 - split, upper);
    float vIn = (inBand - upper * split) / mix(split, 1.0 - split, upper);
    float len = ${f(S.lengthMin)} + ${f(S.lengthMax - S.lengthMin)} * landHash(vec2(row, 7.0));
    float w = u / len + landHash(vec2(row, 3.0));
    float col = floor(w);
    vec2 f = vec2(fract(w), vIn);
    float joint = min(min(f.x, 1.0 - f.x) * len, min(f.y, 1.0 - f.y) * courseH);
    float h = landHash(vec2(col, row)), tint = landHash(vec2(row, col + 11.0)) - 0.5;
    float stain = landNoise(vec2(u, vLandPos.y) * 0.35) * 0.6 + landNoise(vec2(u, vLandPos.y) * 0.08) * 0.4;
    float tone = (0.68 + 0.5 * h + 0.24 * (landNoise(vec2(u, vLandPos.y) * 5.0) - 0.5)) * (0.78 + 0.36 * stain);
    vec3 face = vec3(tone * (1.0 + 0.14 * tint), tone * (1.0 + 0.04 * (stain - 0.5)), tone * (1.0 - 0.14 * tint)) * mix(0.66, 1.0, smoothstep(0.006, 0.035, joint));
    float far = smoothstep(30.0, 140.0, length(vViewPosition));
    diffuseColor.rgb *= mix(face, vec3(0.84 + 0.2 * (stain - 0.5)), far);
}` : '#include <color_fragment>')
                .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
reflectedLight.indirectDiffuse *= uIndirect;
// The sky's floor: a face turned from the sun still sees the sky, so it keeps uLandFloor of its albedo (all of it
// facing up, 0.6 of it facing down) and never crushes to black
{
    float up = dot(normal, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz));
    reflectedLight.indirectDiffuse = max(reflectedLight.indirectDiffuse, diffuseColor.rgb * uLandFloor * ${f(floor)} * (0.8 + 0.2 * up));
}`)
                .replace('#include <fog_fragment>', `{
    float dist = length(vViewPosition);
    float aerial = uAerialMax * (1.0 - exp(-dist / uAerialReach));
    gl_FragColor.rgb = mix(gl_FragColor.rgb, uAerialColor, aerial);
}
#include <fog_fragment>`);
        };
        const key = `land-${curvature ? 1 : 0}${detail ? 1 : 0}${stone ? 1 : 0}${floor === 1 ? '' : `-${floor}`}`;
        material.customProgramCacheKey = () => key;
        material.needsUpdate = true;
        return material;
    }
}
