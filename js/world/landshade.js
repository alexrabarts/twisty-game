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
//   haze                the one aerial perspective of everything a world draws (LandShade.HAZE): with distance the
//                       colour loses its own saturation and goes toward the air's colour, before the scene fog; the
//                       scene fog stays for weather (a fog look, rain, snow). LandShade.haze(material) gives the same
//                       term to a world material that is not land (a house, a boulder, a sign), LandShade.hazeTree
//                       to every material under a group
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
                uHazeColor: { value: new THREE.Color(0.08, 0.13, 0.22) },
                uHaze: { value: new THREE.Vector4() },
                uHazeBaseY: { value: LandShade.HAZE.baseY },
                uHazeOnset: { value: LandShade.HAZE.onset },
                uDrop: { value: LandShade.DROP_PER_M2 },
                uIndirect: { value: LandShade.INDIRECT },
                uLandFloor: { value: LandShade.FLOOR },
                uDetail: { value: 1 }
            };
            LandShade.writeHaze(LandShade.HAZE);
        }
        return LandShade.shared;
    }

    // The haze of clear alpine air, measured in the owner's photos of the Tremola and the Leventina by
    // `node tools/world/photomatch.mjs haze` (19 photos with a camera that can be trusted; the mean display colour,
    // HSV 0 to 1, hue in degrees). Distant land in the photos:
    //   1 to 3 km   90, 95, 88: the land's own colour still (green, olive, brown; blue only in shade)
    //   3 to 8 km   76, 98, 121: hue 211, saturation 0.37, value 0.47
    //   8 km on     92, 125, 170: hue 214, saturation 0.46, value 0.67
    //   sky 1 to 8% of the picture's height over the skyline: 188, 203, 224: hue 215, saturation 0.16, value 0.88
    // So distant land takes the hue of the sky at the horizon, but deeper: the air in front of a dark slope scatters a
    // saturated mid blue, not the near-white of the sky behind it. `air` is that colour (sRGB, display); the scene
    // fog's colour gives its hue (LandShade.airColor), so the air follows the sky. The share of the air grows as
    // 1 - exp(-tau^onset): tau is the optical depth of the ray, `perM` per metre at `baseY`, thinning with height over
    // `scaleM` (the haze lies in the valleys, but the summit still sees blue ridges). `onset` over 1 keeps the first
    // kilometres clear, as the photos are: with a plain exponential the forest 2 km off was already blue. `most` is
    // the share it never passes, `desat` how much of its own saturation the land loses at the full share (the
    // grade's saturation of 1.08 boosts the land's green too). Before this the tint was a grey-blue that reached 63%
    // at 14 km: land 3 to 8 km off read hue 170 to 180, greener than the sky behind it. The browser probe world-haze
    // (tools/terrain-check.mjs) holds each band to the photos
    static get HAZE() {
        return { perM: 1 / 4400, baseY: 1500, scaleM: 6000, onset: 2, most: 0.94, desat: 0.85, air: { s: 0.5, v: 0.58 } };
    }

    static writeHaze(h) {
        LandShade.uniforms.uHaze.value.set(h.perM, h.most, h.desat, 1 / h.scaleM);
        LandShade.uniforms.uHazeBaseY.value = h.baseY;
        LandShade.uniforms.uHazeOnset.value = h.onset;
    }
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

    // The colour of the air for a scene fog colour (linear, out): the fog's hue (the sky at the horizon) at the
    // saturation and value of LandShade.HAZE.air in display terms; a weather look (`weather` 0 to 1: mist, rain,
    // snow) takes the fog's own colour instead, so a mist reads as mist
    static airColor(fog, weather, out = new THREE.Color()) {
        const hsl = {};
        const display = fog.clone().convertLinearToSRGB();
        display.getHSL(hsl);
        const { s, v } = LandShade.HAZE.air;
        // HSV (h, s, v) to HSL for Color.setHSL
        const l = v * (1 - s / 2);
        const sl = l > 0 && l < 1 ? (v - l) / Math.min(l, 1 - l) : 0;
        out.setHSL(hsl.h, sl, l).convertSRGBToLinear();
        return out.lerp(fog, Math.min(1, Math.max(0, weather)));
    }

    // Writes this frame's air colour from the scene fog and the weather's share (WeatherSystem.mix), and gives every
    // material under `group` the haze (LandShade.hazeTree) before it is first drawn. A colour that is not finite (a
    // fault upstream) keeps the last one
    static update(scene, graphics, weather = null, group = null) {
        const u = LandShade.uniforms;
        const fog = scene && scene.fog ? scene.fog.color : null;
        if (fog && Number.isFinite(fog.r + fog.g + fog.b)) {
            const mix = weather && weather.mix ? weather.mix : null;
            const share = mix ? Math.min(1, (mix.rain || 0) + (mix.snow || 0) + (mix.fog || 0)) : 0;
            const air = LandShade.airColor(fog, Number.isFinite(share) ? share : 0, LandShade.air || (LandShade.air = new THREE.Color()));
            u.uHazeColor.value.copy(air);
            // The no-post path mixes fog after the colour is encoded to sRGB (Graphics.render does the same for the fog)
            if (graphics && !graphics.postEnabled) u.uHazeColor.value.convertLinearToSRGB();
        }
        if (group) LandShade.hazeTree(group);
    }

    // The haze in GLSL: the fragment's colour c at view-space position p goes toward the air (LandShade.HAZE). The
    // optical depth of an exponential haze along a ray from the eye (height eyeY) to the fragment (dy higher) over
    // distance d is perM d exp(-(eyeY - baseY) / scaleM) (1 - exp(-k)) / k, k = dy / scaleM
    static get HAZE_GLSL() {
        return `
uniform vec3 uHazeColor;
uniform vec4 uHaze;
uniform float uHazeBaseY;
uniform float uHazeOnset;
vec3 worldHaze(vec3 c, vec3 p) {
    mat3 toWorld = transpose(mat3(viewMatrix));
    float eyeY = -(toWorld * viewMatrix[3].xyz).y;
    float k = clamp((toWorld * p).y * uHaze.w, -20.0, 20.0);
    float shape = abs(k) < 1e-3 ? 1.0 - 0.5 * k : (1.0 - exp(-k)) / k;
    float tau = uHaze.x * length(p) * exp(clamp(-(eyeY - uHazeBaseY) * uHaze.w, -6.0, 6.0)) * shape;
    float t = uHaze.y * (1.0 - exp(-pow(max(tau, 0.0), uHazeOnset)));
    c = mix(c, vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), uHaze.z * t);
    return mix(c, uHazeColor, t);
}`;
    }

    // Adds the haze to a compiling shader: a view-space varying (instancing included) and the mix before the fog
    static injectHaze(shader) {
        Object.assign(shader.uniforms, { uHazeColor: LandShade.uniforms.uHazeColor, uHaze: LandShade.uniforms.uHaze, uHazeBaseY: LandShade.uniforms.uHazeBaseY, uHazeOnset: LandShade.uniforms.uHazeOnset });
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vHazeView;')
            .replace('#include <project_vertex>', '#include <project_vertex>\nvHazeView = mvPosition.xyz;');
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>\nvarying vec3 vHazeView;${LandShade.HAZE_GLSL}`)
            .replace('#include <fog_fragment>', 'gl_FragColor.rgb = worldHaze(gl_FragColor.rgb, vHazeView);\n#include <fog_fragment>');
    }

    // Whether a material can take the haze: a built-in material with a fog chunk (not a ShaderMaterial)
    static hazeable(material) {
        return !!material && !material.isShaderMaterial && !material.isRawShaderMaterial && !material.isPointsMaterial && !material.isSpriteMaterial;
    }

    // Gives a world material that is not land the haze, in place, after any patch it already has (a material that
    // LandShade.patch made has it already). Its program key carries the haze
    static haze(material) {
        if (!LandShade.hazeable(material) || material.userData.haze) return material;
        material.userData.haze = true;
        const before = material.onBeforeCompile;
        // The key of the program it compiles to now (three's default is the source of onBeforeCompile), plus the haze
        const key = `${material.customProgramCacheKey()}|haze`;
        material.onBeforeCompile = (shader, renderer) => {
            if (before) before.call(material, shader, renderer);
            LandShade.injectHaze(shader);
        };
        material.customProgramCacheKey = () => key;
        material.needsUpdate = true;
        return material;
    }

    // Every material under a group takes the haze (LandShade.haze); cheap once all have it
    static hazeTree(group) {
        group.traverse(o => {
            if (!o.material) return;
            if (Array.isArray(o.material)) o.material.forEach(m => LandShade.haze(m));
            else LandShade.haze(o.material);
        });
    }

    // A world copy of a model's parts ([{geometry, material}]) whose materials take the haze: a model's own materials
    // are shared with the legs (SceneAssets.loadModel caches each file), which never take it. One copy per material
    static adopt(parts) {
        const copies = LandShade.copies || (LandShade.copies = new Map());
        return parts.map(part => {
            if (!part.material || Array.isArray(part.material)) return part;
            if (!copies.has(part.material)) copies.set(part.material, LandShade.haze(part.material.clone()));
            return { ...part, material: copies.get(part.material) };
        });
    }

    // A world copy of a loaded model ({meshes: name -> parts, ...}) for the haze (LandShade.adopt)
    static adoptModel(model) {
        return { ...model, meshes: new Map([...model.meshes].map(([name, parts]) => [name, LandShade.adopt(parts)])) };
    }

    // Stone drawn as instances (the kerb course under the marker stones: Scenery.kerbPart) is read at each instance's
    // own place in the world, so its courses run on from one piece to the next
    static get INSTANCED() { return '\n#ifdef USE_INSTANCING\nvLandPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;\nvLandNormal = mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal;\n#endif'; }

    // Patches a built-in material (Lambert or Standard) in place; `curvature` for far meshes, `detail` for the tiles,
    // `floor` scales the sky's floor (a structure's underside sees the light the land and the sky throw back)
    static patch(material, { curvature = false, detail = false, stone = false, floor = 1 } = {}) {
        if (material.userData.landShade) return material;
        const S = LandShade.STONE;
        const f = v => (Number.isInteger(v) ? `${v}.0` : `${v}`);
        material.userData.landShade = true;
        material.userData.haze = true;
        const shared = LandShade.uniforms;
        material.onBeforeCompile = (shader) => {
            Object.assign(shader.uniforms, shared);
            shader.vertexShader = shader.vertexShader
                .replace('#include <common>', `#include <common>\nuniform float uDrop;\nvarying vec3 vLandPos;${stone ? '\nvarying vec3 vLandNormal;\nattribute vec2 wallFace;\nvarying vec2 vWallFace;' : ''}`)
                .replace('#include <begin_vertex>', curvature
                    ? `#include <begin_vertex>\n{ vec3 eye = -(transpose(mat3(viewMatrix)) * viewMatrix[3].xyz); vec2 d = (modelMatrix * vec4(transformed, 1.0)).xz - eye.xz; transformed.y -= dot(d, d) * uDrop; }`
                    : '#include <begin_vertex>')
                .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>\nvLandPos = (modelMatrix * vec4(transformed, 1.0)).xyz;${stone ? '\nvLandNormal = mat3(modelMatrix) * objectNormal;\nvWallFace = wallFace;' : ''}${stone ? LandShade.INSTANCED : ''}`);
            shader.fragmentShader = shader.fragmentShader
                .replace('#include <common>', `#include <common>
uniform float uIndirect;
uniform float uLandFloor;
uniform float uDetail;
varying vec3 vLandPos;
${stone ? 'varying vec3 vLandNormal;\nvarying vec2 vWallFace;' : ''}
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
    // A retaining wall's face gives its own metres along (RoadMesh.edgeWorks wallFace), so the courses run on across
    // its segments; any other stone is read along its own horizontal
    // (a face that tapers out past a wall's end is drawn only from the side it faces: wallFace 2, its normal the
    // way out from its road; read in view space, where the eye is the origin)
    if (vWallFace.y > 1.5 && dot(vViewPosition, vNormal) < 0.0) discard;
    float u = vWallFace.y > 0.5 ? vWallFace.x : dot(vLandPos.xz, t);
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
}`);
            LandShade.injectHaze(shader);
            // The near grain of the land detail effect (js/world/landdetail.js), read only while it is on
            if (detail && typeof LandDetail !== 'undefined') LandDetail.inject(shader);
        };
        const key = `land-${curvature ? 1 : 0}${detail ? 1 : 0}${stone ? 1 : 0}${floor === 1 ? '' : `-${floor}`}${detail && typeof LandDetail !== 'undefined' ? '-grain' : ''}`;
        material.customProgramCacheKey = () => key;
        material.needsUpdate = true;
        return material;
    }
}
