// Rendering pipeline: colour management, procedural sky, image-based lighting
// and HDR post-processing (bloom, tone mapping, grading). Loaded straight
// after three.js so colour management is on before any Color is created.

// Hex and CSS colours are authored in sRGB; lighting has to run in linear
// space or mid-tones crush to black and highlights clip early.
if (typeof THREE !== 'undefined' && THREE.ColorManagement) {
    THREE.ColorManagement.enabled = true;
}

// Sky look per time of day. The horizon colour is not listed here: it always
// follows scene.fog.color so distant geometry dissolves into the sky.
const SKY_PRESETS = {
    dawn: {
        zenith: 0x41639f, mid: 0xd9a0a8, glow: 0xffc38a, glowStrength: 1.1,
        sunIntensity: 22, cloudLit: 0xffe2cc, cloudShadow: 0x8d6f8c, coverage: 0.46,
        stars: 0.0, mountain: 0x6b5873, saturation: 1.08, contrast: 1.04, tint: 0xfff4ea, bloom: 0.75
    },
    golden: {
        zenith: 0x1a4fa8, mid: 0x4f97e0, glow: 0xfff1d0, glowStrength: 0.8,
        sunIntensity: 30, cloudLit: 0xffffff, cloudShadow: 0x8496b3, coverage: 0.42,
        stars: 0.0, mountain: 0x5a6f8c, saturation: 1.1, contrast: 1.05, tint: 0xfffaf0, bloom: 0.65
    },
    sunset: {
        zenith: 0x27376f, mid: 0xc9788f, glow: 0xff8a45, glowStrength: 1.3,
        sunIntensity: 26, cloudLit: 0xffb078, cloudShadow: 0x5a3f66, coverage: 0.5,
        stars: 0.05, mountain: 0x4f3a5c, saturation: 1.12, contrast: 1.06, tint: 0xfff0e4, bloom: 0.85
    },
    twilight: {
        zenith: 0x0d1638, mid: 0x33488f, glow: 0x8a8fd6, glowStrength: 0.7,
        sunIntensity: 0, cloudLit: 0x7f89c2, cloudShadow: 0x1f2748, coverage: 0.4,
        stars: 0.45, mountain: 0x2c3566, saturation: 1.05, contrast: 1.05, tint: 0xeef2ff, bloom: 0.9
    },
    night: {
        zenith: 0x01030b, mid: 0x050b1c, glow: 0x9db4e0, glowStrength: 0.35,
        sunIntensity: 3.5, cloudLit: 0x1c2740, cloudShadow: 0x04060c, coverage: 0.3,
        // Lamps, lit windows and headlit paint are the only bright things at
        // night, so the bloom takes only what is well over white, and less of it:
        // a light reads as a light, not as a halo over the street
        stars: 1.0, mountain: 0x070b16, saturation: 0.95, contrast: 1.08, tint: 0xe6eeff, bloom: 0.6, threshold: 1.8,
        moon: true
    }
};

// Weather overrides blended onto the preset.
const SKY_WEATHER = {
    rain: { coverage: 1.0, cloudLit: 0x6f7780, cloudShadow: 0x2c3138, sunScale: 0.0, zenith: 0x363c45, mid: 0x545c66, stars: 0, saturation: 0.82, fogBlend: 0.35 },
    snow: { coverage: 1.0, cloudLit: 0xe6ebf2, cloudShadow: 0x9aa3b3, sunScale: 0.0, zenith: 0xaab4c4, mid: 0xcfd6e0, stars: 0, saturation: 0.8, fogBlend: 0.45 },
    fog: { coverage: 0.7, sunScale: 0.25, stars: 0, saturation: 0.85, fogBlend: 0.8 }
};

const GFX_NOISE_GLSL = `
    float gfxHash(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
    }
    float gfxNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(gfxHash(i), gfxHash(i + vec2(1.0, 0.0)), f.x),
                   mix(gfxHash(i + vec2(0.0, 1.0)), gfxHash(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    float gfxFbm(vec2 p) {
        float a = 0.5;
        float s = 0.0;
        for (int i = 0; i < 5; i++) {
            s += a * gfxNoise(p);
            p = p * 2.03 + vec2(17.1, 9.2);
            a *= 0.5;
        }
        return s;
    }
    float gfxFbm3(vec2 p) {
        float a = 0.5;
        float s = 0.0;
        for (int i = 0; i < 3; i++) {
            s += a * gfxNoise(p);
            p = p * 2.11 + vec2(5.3, 31.7);
            a *= 0.5;
        }
        return s;
    }
`;

const GFX_SKY_VERTEX = `
    varying vec3 vDir;
    void main() {
        vDir = position;
        // Rotation only: the dome sits at infinity, pinned to the far plane
        vec4 pos = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
        gl_Position = pos.xyww;
    }
`;

// Sky gradient, sun glow and clouds, rendered into a small panorama a few
// times a second. Evaluating ten octaves of noise for every sky pixel at
// full resolution cost a fifth of the frame; the clouds are soft, so the
// panorama loses nothing visible.
// u = azimuth, v = elevation (0 at the horizon, 1 at the zenith).
const GFX_SKY_BAKE_FRAGMENT = `
    uniform vec3 uZenith;
    uniform vec3 uMid;
    uniform vec3 uHorizon;
    uniform vec3 uSunDir;
    uniform vec3 uGlowColor;
    uniform vec3 uCloudLit;
    uniform vec3 uCloudShadow;
    uniform float uGlow;
    uniform float uCoverage;
    uniform float uTime;
    varying vec2 vUv;

    ${GFX_NOISE_GLSL}

    void main() {
        float azimuth = (vUv.x * 2.0 - 1.0) * 3.14159265;
        float elevation = vUv.y * 1.57079633;
        vec3 d = vec3(sin(azimuth) * cos(elevation), sin(elevation), cos(azimuth) * cos(elevation));
        float up = d.y;

        // Three-stop vertical gradient
        vec3 sky = mix(uHorizon, uMid, smoothstep(0.0, 0.22, up));
        sky = mix(sky, uZenith, smoothstep(0.12, 0.75, up));

        float sunDot = max(dot(d, uSunDir), 0.0);

        // Atmospheric glow around the sun, strongest along the horizon
        float horizonBand = exp(-up * 6.0);
        sky += uGlowColor * uGlow * (pow(sunDot, 6.0) * 0.22 + pow(sunDot, 40.0) * 0.5) * (0.35 + 0.65 * horizonBand);

        // Clouds: noise projected onto a plane above the viewer
        float cloudDensity = 0.0;
        if (uCoverage > 0.001) {
            vec2 cuv = d.xz / (up + 0.14) * 1.15 + vec2(uTime * 0.006, uTime * 0.0035);
            float n = gfxFbm(cuv);
            float lo = 1.0 - uCoverage;
            cloudDensity = smoothstep(lo - 0.08, lo + 0.22, n * 1.15);
            // Self-shadowing: compare against a sample taken toward the sun
            vec2 toSun = normalize(uSunDir.xz + vec2(0.0001)) * 0.22;
            float nSun = gfxFbm(cuv + toSun);
            float lit = clamp((n - nSun) * 3.5 + 0.55, 0.0, 1.0);
            vec3 cloud = mix(uCloudShadow, uCloudLit, lit);
            // Silver lining where thin cloud sits in front of the sun
            cloud += uGlowColor * uGlow * pow(sunDot, 7.0) * 0.55 * (1.0 - cloudDensity * 0.6);
            cloudDensity *= smoothstep(0.015, 0.2, up);
            sky = mix(sky, cloud, cloudDensity);
        }

        // Alpha carries cloud cover so the dome can hide the sun and stars
        gl_FragColor = vec4(max(sky, vec3(0.0)), cloudDensity);
    }
`;

const GFX_SKY_FRAGMENT = `
    uniform sampler2D tPanorama;
    uniform vec3 uHorizon;
    uniform vec3 uSunDir;
    uniform vec3 uSunColor;
    uniform vec3 uGlowColor;
    uniform vec3 uCloudLit;
    uniform vec3 uMountain;
    uniform float uSunIntensity;
    uniform float uGlow;
    uniform float uTime;
    uniform float uStars;
    uniform float uFogBlend;
    uniform float uMoon;
    uniform float uMountains;
    varying vec3 vDir;

    ${GFX_NOISE_GLSL}

    // Ridge line height (in elevation units) for a ring of far mountains.
    // Sampled on a circle so the range wraps without a seam.
    float ridgeHeight(float azimuth, float freq, float seed) {
        vec2 p = vec2(cos(azimuth), sin(azimuth)) * freq + seed;
        return gfxFbm3(p);
    }

    void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        float up = max(h, 0.0);
        float az = atan(d.x, d.z);

        vec4 panorama = texture2D(tPanorama, vec2(az / 6.28318531 + 0.5, asin(up) / 1.57079633));
        vec3 sky = panorama.rgb;
        float clear = 1.0 - panorama.a;

        float sunDot = max(dot(d, uSunDir), 0.0);

        // Stars
        if (uStars > 0.001 && h > 0.0) {
            vec2 suv = vec2(az, asin(clamp(h, -1.0, 1.0))) * 110.0;
            vec2 id = floor(suv);
            float r = gfxHash(id);
            vec2 jitter = vec2(gfxHash(id + 3.1), gfxHash(id + 7.7)) - 0.5;
            float dist = length(fract(suv) - 0.5 - jitter * 0.6);
            // A star smaller than a pixel lands on a pixel centre in one frame
            // and between pixels in the next, so it shimmers as the view moves.
            // Spread it over at least a pixel and dim it by the same area: the
            // light it gives is the same at any size, and it no longer flickers.
            vec2 pixel = fwidth(suv);
            float radius = max(0.09, 0.75 * max(pixel.x, pixel.y));
            float spread = (0.09 * 0.09) / (radius * radius);
            // A slow, faint twinkle: 8% at 0.3 to 1.0 rad/s
            float twinkle = 0.92 + 0.08 * sin(uTime * (0.3 + r * 0.7) + r * 60.0);
            float star = step(0.965, r) * (1.0 - smoothstep(0.0, radius, dist)) * spread * twinkle * (0.4 + 0.6 * gfxHash(id + 1.3));
            star *= smoothstep(0.02, 0.25, h);
            sky += vec3(0.85, 0.9, 1.0) * star * uStars * 2.5 * clear;
        }

        // Sun or moon disc. Kept HDR so the bloom pass turns it into glare.
        float discEdge = uMoon > 0.5 ? 0.99965 : 0.99955;
        float disc = smoothstep(discEdge, discEdge + 0.00012, sunDot);
        if (disc > 0.0) {
            vec3 discColor = uSunColor * uSunIntensity;
            if (uMoon > 0.5) {
                // Soft maria so the moon is not a flat circle
                vec2 muv = (d.xy - uSunDir.xy) * 70.0;
                discColor *= 0.75 + 0.25 * gfxNoise(muv * 1.7 + 4.0);
            }
            sky += discColor * disc * clear * smoothstep(-0.01, 0.03, h);
        }

        // Far mountain ranges: two silhouette layers fading into the haze.
        // The ridges never rise above 0.16, so most sky pixels skip this.
        if (uMountains > 0.001 && h < 0.16) {
            float sunAz = atan(uSunDir.x, uSunDir.z);
            for (int layer = 0; layer < 2; layer++) {
                float fl = float(layer);
                float freq = 3.2 + fl * 2.6;
                float seed = 11.0 + fl * 37.0;
                float amp = 0.17 - fl * 0.06;
                float base = -0.02 - fl * 0.012;
                float rh = base + amp * ridgeHeight(az, freq, seed);
                float mask = 1.0 - smoothstep(rh - 0.0015, rh + 0.0015, h);
                if (mask > 0.0) {
                    // Fake facing from the ridge slope so one flank catches the sun
                    float rhNext = base + amp * ridgeHeight(az + 0.02, freq, seed);
                    float slope = (rhNext - rh) / 0.02;
                    float facing = clamp(0.5 - slope * sin(sunAz - az) * 2.2, 0.0, 1.0);
                    float haze = 0.55 - fl * 0.22;
                    vec3 rock = uMountain * (0.55 + 0.75 * facing) + uGlowColor * uGlow * 0.06 * facing;
                    // Snow on the highest ground of the far layer
                    float snow = smoothstep(0.075, 0.105, h) * (1.0 - fl) * (0.5 + 0.5 * facing);
                    rock = mix(rock, mix(uCloudLit, vec3(1.0), 0.5) * (0.5 + 0.5 * facing), snow * 0.8);
                    vec3 col = mix(rock, uHorizon, haze);
                    // Valleys sink into the ground haze
                    col = mix(col, uHorizon, (1.0 - smoothstep(base - 0.03, rh, h)) * 0.85);
                    sky = mix(sky, col, mask * uMountains);
                }
            }
        }

        // Below the horizon everything is haze, matching fogged geometry
        sky = mix(sky, uHorizon, 1.0 - smoothstep(-0.06, 0.0, h));
        // Dense weather swallows the sky
        sky = mix(sky, uHorizon, uFogBlend * (1.0 - smoothstep(0.0, 1.2, up) * (1.0 - uFogBlend)));

        gl_FragColor = vec4(max(sky, vec3(0.0)), 1.0);

        // No-ops inside the HDR pipeline (the composite pass does both).
        // Without it the renderer tone-maps and encodes in each material.
        #include <tonemapping_fragment>
        #include <encodings_fragment>
    }
`;

const GFX_QUAD_VERTEX = `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
    }
`;

const GFX_BLOOM_PREFILTER = `
    uniform sampler2D tSource;
    uniform vec2 uTexel;
    uniform float uThreshold;
    uniform float uKnee;
    varying vec2 vUv;
    void main() {
        vec3 c = texture2D(tSource, vUv + uTexel * vec2(-0.5, -0.5)).rgb
               + texture2D(tSource, vUv + uTexel * vec2(0.5, -0.5)).rgb
               + texture2D(tSource, vUv + uTexel * vec2(-0.5, 0.5)).rgb
               + texture2D(tSource, vUv + uTexel * vec2(0.5, 0.5)).rgb;
        c = clamp(c * 0.25, 0.0, 48.0);
        float br = max(c.r, max(c.g, c.b));
        float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
        soft = soft * soft / (4.0 * uKnee + 0.0001);
        float contribution = max(soft, br - uThreshold) / max(br, 0.0001);
        gl_FragColor = vec4(c * contribution, 1.0);
    }
`;

const GFX_BLOOM_DOWN = `
    uniform sampler2D tSource;
    uniform vec2 uTexel;
    varying vec2 vUv;
    void main() {
        vec3 c = texture2D(tSource, vUv).rgb * 4.0
               + texture2D(tSource, vUv + uTexel * vec2(-1.0, -1.0)).rgb
               + texture2D(tSource, vUv + uTexel * vec2(1.0, -1.0)).rgb
               + texture2D(tSource, vUv + uTexel * vec2(-1.0, 1.0)).rgb
               + texture2D(tSource, vUv + uTexel * vec2(1.0, 1.0)).rgb;
        gl_FragColor = vec4(c / 8.0, 1.0);
    }
`;

const GFX_BLOOM_UP = `
    uniform sampler2D tSource;
    uniform vec2 uTexel;
    uniform float uWeight;
    varying vec2 vUv;
    void main() {
        vec3 c = texture2D(tSource, vUv).rgb * 4.0;
        c += (texture2D(tSource, vUv + uTexel * vec2(-1.0, 0.0)).rgb
            + texture2D(tSource, vUv + uTexel * vec2(1.0, 0.0)).rgb
            + texture2D(tSource, vUv + uTexel * vec2(0.0, -1.0)).rgb
            + texture2D(tSource, vUv + uTexel * vec2(0.0, 1.0)).rgb) * 2.0;
        c += texture2D(tSource, vUv + uTexel * vec2(-1.0, -1.0)).rgb
           + texture2D(tSource, vUv + uTexel * vec2(1.0, -1.0)).rgb
           + texture2D(tSource, vUv + uTexel * vec2(-1.0, 1.0)).rgb
           + texture2D(tSource, vUv + uTexel * vec2(1.0, 1.0)).rgb;
        gl_FragColor = vec4(c / 16.0 * uWeight, 1.0);
    }
`;

// Light shafts: march from each pixel toward the sun's screen position and
// gather bright sky (depth 1) on the way, fading with distance
const GFX_SHAFTS = `
    uniform sampler2D tScene;
    uniform sampler2D tDepth;
    uniform vec2 uSun;
    varying vec2 vUv;
    void main() {
        const int STEPS = 24;
        vec2 delta = (uSun - vUv) * (0.9 / float(STEPS));
        vec2 uv = vUv;
        float decay = 1.0;
        vec3 acc = vec3(0.0);
        for (int i = 0; i < STEPS; i++) {
            uv += delta;
            vec2 sampleUv = clamp(uv, 0.0, 1.0);
            if (texture2D(tDepth, sampleUv).r >= 0.9999) {
                vec3 c = texture2D(tScene, sampleUv).rgb;
                float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
                acc += c * smoothstep(0.6, 2.0, luma) * decay;
            }
            decay *= 0.95;
        }
        gl_FragColor = vec4(min(acc / float(STEPS), vec3(4.0)), 1.0);
    }
`;

const GFX_COMPOSITE = `
    uniform sampler2D tScene;
    uniform sampler2D tBloom;
    uniform sampler2D tDepth;
    uniform sampler2D tShafts;
    uniform mat4 uProjInv;
    uniform mat4 uCamWorld;
    uniform vec3 uFogColor;
    uniform vec3 uHeightFog; // density at base height, base height, falloff per metre
    uniform float uHeightFogOn;
    uniform float uShafts;
    uniform float uFogReach;
    uniform float uExposure;
    uniform float uBloom;
    uniform float uVignette;
    uniform float uSaturation;
    uniform float uContrast;
    uniform float uSpeed;
    uniform float uTime;
    uniform float uFlash;
    uniform vec3 uTint;
    varying vec2 vUv;

    // Same ACES fit three.js uses for ACESFilmicToneMapping
    vec3 RRTAndODTFit(vec3 v) {
        vec3 a = v * (v + 0.0245786) - 0.000090537;
        vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
        return a / b;
    }
    vec3 acesFilmic(vec3 color) {
        const mat3 ACESInputMat = mat3(
            vec3(0.59719, 0.07600, 0.02840),
            vec3(0.35458, 0.90834, 0.13383),
            vec3(0.04823, 0.01566, 0.83777));
        const mat3 ACESOutputMat = mat3(
            vec3(1.60475, -0.10208, -0.00327),
            vec3(-0.53108, 1.10813, -0.07276),
            vec3(-0.07367, -0.00605, 1.07602));
        color *= uExposure / 0.6;
        color = ACESInputMat * color;
        color = RRTAndODTFit(color);
        color = ACESOutputMat * color;
        return clamp(color, 0.0, 1.0);
    }
    float grainHash(vec2 p) {
        p = fract(p * vec2(443.897, 441.423));
        p += dot(p, p.yx + 19.19);
        return fract((p.x + p.y) * p.x);
    }

    void main() {
        vec2 fromCenter = vUv - 0.5;
        float radius = length(fromCenter);

        vec3 color = texture2D(tScene, vUv).rgb;

        // Radial blur toward the screen edges sells speed without touching
        // the centre of the view, where the rider is looking
        if (uSpeed > 0.001) {
            float amount = uSpeed * smoothstep(0.18, 0.75, radius) * 0.07;
            vec3 acc = color;
            for (int i = 1; i <= 5; i++) {
                acc += texture2D(tScene, vUv - fromCenter * amount * (float(i) / 5.0)).rgb;
            }
            color = acc / 6.0;
        }

        // Height fog: the fog thickens toward the floor. Integrate an
        // exponentially falling density along the view ray; sky pixels (depth
        // 1) reach as far as uFogReach, which gives the mist band at the horizon
        if (uHeightFogOn > 0.5) {
            float depth = texture2D(tDepth, vUv).r;
            vec4 view = uProjInv * vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
            vec3 origin = uCamWorld[3].xyz;
            vec3 ray = (uCamWorld * vec4(view.xyz / view.w, 1.0)).xyz - origin;
            float rayLength = max(length(ray), 1e-4);
            // The fog starts 15 m out along the ray: any fog that starts at the
            // camera tints the road at the bike's wheels, so the near road
            // stays exactly clear and only the distance thickens
            const float fogNear = 15.0;
            float reach = max(min(rayLength, uFogReach) - fogNear, 0.0);
            float slope = uHeightFog.z * ray.y / rayLength;
            // Density never exceeds the base density: below the base height it
            // stays flat, so a camera low in a valley does not fog the road at
            // its feet
            float height = origin.y + ray.y / rayLength * fogNear - uHeightFog.y;
            float tau;
            if (height >= 0.0) {
                float atOrigin = uHeightFog.x * exp(-uHeightFog.z * height);
                tau = atOrigin * (abs(slope) < 1e-4 ? reach : (1.0 - exp(-slope * reach)) / slope);
            } else {
                float rise = ray.y / rayLength;
                float level = rise > 1e-4 ? min(-height / rise, reach) : reach;
                tau = uHeightFog.x * level;
                float rest = reach - level;
                if (rest > 0.0) {
                    tau += uHeightFog.x * (abs(slope) < 1e-4 ? rest : (1.0 - exp(-slope * rest)) / slope);
                }
            }
            float amount = 1.0 - exp(-min(tau, 6.0));
            color = mix(color, uFogColor, amount);
        }

        if (uShafts > 0.0) {
            color += texture2D(tShafts, vUv).rgb * uShafts;
        }

        color += texture2D(tBloom, vUv).rgb * uBloom;
        color += vec3(0.75, 0.82, 1.0) * uFlash;

        color = acesFilmic(color);

        // Grade in display-referred space
        float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
        color = mix(vec3(luma), color, uSaturation);
        color = (color - 0.5) * uContrast + 0.5;
        color *= uTint;

        float vig = smoothstep(0.35, 0.95, radius);
        color *= 1.0 - uVignette * vig * vig;

        color = clamp(color, 0.0, 1.0);
        // Linear -> sRGB
        color = mix(color * 12.92, 1.055 * pow(color, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, color));

        // Dither hides banding in the smooth sky gradients
        color += (grainHash(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) / 255.0 * 1.6;

        gl_FragColor = vec4(color, 1.0);
    }
`;

// Water surfaces register here so Graphics.update() can drift their ripples
const GFX_WATER_MATERIALS = [];

// Tileable ripple normal map: a sum of sine waves with whole-number
// frequencies, so the pattern repeats without a seam
function makeWaterNormalTexture(size = 256) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const waves = [
        [1, 2, 0.0, 1.0], [2, -1, 1.3, 0.8], [3, 1, 2.1, 0.55], [-2, 3, 0.7, 0.5],
        [5, 2, 4.2, 0.3], [-4, 5, 5.5, 0.26], [7, -3, 3.3, 0.18], [6, 7, 1.9, 0.14]
    ];
    const tau = Math.PI * 2;
    const height = (x, y) => {
        let h = 0;
        for (const [fx, fy, phase, amp] of waves) {
            h += Math.sin((x * fx + y * fy) * tau + phase) * amp;
        }
        return h;
    };

    const image = ctx.createImageData(size, size);
    const step = 1 / size;
    for (let py = 0; py < size; py++) {
        for (let px = 0; px < size; px++) {
            const x = px / size;
            const y = py / size;
            const dx = (height(x + step, y) - height(x - step, y)) * 0.045 * size / 256;
            const dy = (height(x, y + step) - height(x, y - step)) * 0.045 * size / 256;
            const inv = 1 / Math.sqrt(dx * dx * 1e4 + dy * dy * 1e4 + 1);
            const i = (py * size + px) * 4;
            image.data[i] = (-dx * 100 * inv * 0.5 + 0.5) * 255;
            image.data[i + 1] = (-dy * 100 * inv * 0.5 + 0.5) * 255;
            image.data[i + 2] = (inv * 0.5 + 0.5) * 255;
            image.data[i + 3] = 255;
        }
    }
    ctx.putImageData(image, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(90, 90);
    texture.anisotropy = 8;
    return texture;
}

// Lake surface: glossy, sky-reflecting, with drifting ripples that break up
// the sun's reflection into glitter
function createWaterMaterial() {
    const material = new THREE.MeshStandardMaterial({
        color: 0x1d5f7d,
        roughness: 0.14,
        metalness: 0.65,
        envMapIntensity: 1.5,
        normalMap: makeWaterNormalTexture(),
        normalScale: new THREE.Vector2(0.55, 0.55)
    });
    GFX_WATER_MATERIALS.push(material);
    // Unregister when the leg is torn down
    material.addEventListener('dispose', () => {
        const index = GFX_WATER_MATERIALS.indexOf(material);
        if (index >= 0) GFX_WATER_MATERIALS.splice(index, 1);
    });
    return material;
}

// Frozen lake: pale, glossy and still, so it reads as ice and not as water
function createIceMaterial() {
    return new THREE.MeshStandardMaterial({
        color: 0xcfe3ee,
        roughness: 0.2,
        metalness: 0.1,
        envMapIntensity: 1.2,
        normalMap: makeWaterNormalTexture(),
        normalScale: new THREE.Vector2(0.15, 0.15)
    });
}

class Graphics {
    constructor(renderer, scene, camera) {
        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;
        this.time = 0;
        this.timeKey = 'golden';
        this.weatherType = 'clear';
        this.speedRatio = 0;
        this.flash = 0;
        this.sunDirection = new THREE.Vector3(0.5, 0.8, 0).normalize();
        this.lastColorScan = 0;
        this.linearFogColor = new THREE.Color();
        this.bufferSize = new THREE.Vector2();
        this.seenTextures = new WeakSet();
        this.seenGeometries = new WeakSet();

        // HDR post-processing needs float render targets (WebGL2). Without
        // them the renderer tone-maps straight to the canvas instead.
        const caps = renderer.capabilities;
        this.postEnabled = !!(caps.isWebGL2 && renderer.extensions.has('EXT_color_buffer_float'));

        // The depth texture feeds height fog and light shafts. The mobile
        // multisampled-render-to-texture path is a different, unexamined
        // branch in three r150, so there the atmosphere stays off.
        this.atmosphereSupported = this.postEnabled && !renderer.extensions.has('WEBGL_multisampled_render_to_texture');
        this.atmosphere = null;
        this.shaftsActive = false;
        this.ringStrength = 1;
        // Sky values by time and weather, resolved once (see resolveSky)
        this.skyCache = new Map();
        // The sky values as the last write left them, before fog thickens them
        this.skyBase = { fogBlend: 0, mountains: 0 };
        // How much of the sky's weather is fog (0 to 1)
        this.fogShare = 0;
        // Frames drawn, and the environment bakes: a bake costs about one frame
        this.frames = 0;
        this.stats = { envBakes: 0, lastBakeFrame: 0 };
        // Where in a blend (0 to 1) the sky was written, and where it was last baked
        this.skyBlend = 0;
        this.bakedBlend = 0;
        this.sunScreen = new THREE.Vector2();
        this.sunView = new THREE.Vector3();

        if (this.postEnabled) {
            renderer.toneMapping = THREE.NoToneMapping;
            renderer.outputEncoding = THREE.LinearEncoding;
            this.setupPost();
        } else {
            renderer.toneMapping = THREE.ACESFilmicToneMapping;
            renderer.outputEncoding = THREE.sRGBEncoding;
        }

        this.createSky();
        this.pmrem = new THREE.PMREMGenerator(renderer);
        this.setTimeOfDay('golden', null);
    }

    createSky() {
        this.skyUniforms = {
            uZenith: { value: new THREE.Color() },
            uMid: { value: new THREE.Color() },
            uHorizon: { value: new THREE.Color() },
            uSunDir: { value: this.sunDirection.clone() },
            uSunColor: { value: new THREE.Color(1, 1, 1) },
            uGlowColor: { value: new THREE.Color() },
            uCloudLit: { value: new THREE.Color() },
            uCloudShadow: { value: new THREE.Color() },
            uMountain: { value: new THREE.Color() },
            uSunIntensity: { value: 20 },
            uGlow: { value: 1 },
            uCoverage: { value: 0.4 },
            uTime: { value: 0 },
            uStars: { value: 0 },
            uFogBlend: { value: 0 },
            uMoon: { value: 0 },
            uMountains: { value: 1 },
            tPanorama: { value: null }
        };

        // Panorama the dome samples (see GFX_SKY_BAKE_FRAGMENT)
        const floatTargets = this.renderer.capabilities.isWebGL2 && this.renderer.extensions.has('EXT_color_buffer_float');
        this.panoramaTarget = new THREE.WebGLRenderTarget(1024, 512, {
            type: floatTargets ? THREE.HalfFloatType : THREE.UnsignedByteType,
            format: THREE.RGBAFormat,
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            wrapS: THREE.RepeatWrapping,
            wrapT: THREE.ClampToEdgeWrapping,
            depthBuffer: false,
            stencilBuffer: false
        });
        this.panoramaMaterial = new THREE.ShaderMaterial({
            uniforms: this.skyUniforms,
            vertexShader: GFX_QUAD_VERTEX,
            fragmentShader: GFX_SKY_BAKE_FRAGMENT,
            depthTest: false,
            depthWrite: false,
            toneMapped: false
        });
        this.panoramaScene = new THREE.Scene();
        const panoramaQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.panoramaMaterial);
        panoramaQuad.frustumCulled = false;
        this.panoramaScene.add(panoramaQuad);
        this.panoramaCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.panoramaAge = Infinity;
        this.skyMaterial = new THREE.ShaderMaterial({
            uniforms: this.skyUniforms,
            vertexShader: GFX_SKY_VERTEX,
            fragmentShader: GFX_SKY_FRAGMENT,
            // fwidth() in the star field; WebGL2 has it built in
            extensions: { derivatives: true },
            side: THREE.BackSide,
            depthWrite: false,
            depthFunc: THREE.LessEqualDepth,
            fog: false,
            // Tone-mapped by the composite pass, or here when there is none
            toneMapped: !this.postEnabled
        });
        this.skyMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), this.skyMaterial);
        this.skyMesh.frustumCulled = false;
        // Drawn after every opaque mesh so hidden sky pixels are depth-rejected
        this.skyMesh.renderOrder = 1000;
        this.skyMesh.userData.isSky = true;
        this.scene.add(this.skyMesh);

        // Separate small dome for baking the environment map: the cube camera
        // PMREM uses has a short far plane and must not see the sun disc
        // (a tiny HDR spike turns into fireflies on glossy paint)
        this.envUniforms = THREE.UniformsUtils.clone(this.skyUniforms);
        this.envMaterial = new THREE.ShaderMaterial({
            uniforms: this.envUniforms,
            vertexShader: `
                varying vec3 vDir;
                void main() {
                    vDir = position;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: GFX_SKY_FRAGMENT,
            extensions: { derivatives: true },
            side: THREE.BackSide,
            depthWrite: false,
            fog: false,
            toneMapped: false
        });
        this.envScene = new THREE.Scene();
        this.envScene.add(new THREE.Mesh(new THREE.SphereGeometry(40, 32, 16), this.envMaterial));

        // (assigned after the clone above: render target textures cannot be cloned)
        this.skyUniforms.tPanorama.value = this.panoramaTarget.texture;
    }

    // The sky mesh lives in the game scene, which is emptied between legs
    ensureSkyInScene() {
        if (this.skyMesh.parent !== this.scene) {
            this.scene.add(this.skyMesh);
        }
    }

    // Per-leg depth atmosphere (height fog, light shafts) and far-ring strength.
    // `atmosphere` is a { heightFog, shafts }, `render` its { ring }, `baseY`
    // the lowest road height of the part. Pass null to reset. The ring strength
    // is read when the sky is written, so set this before the sky. Height fog
    // and shafts need the depth texture and stay off without it.
    setAtmosphere(atmosphere, render, baseY = 0) {
        this.setRingStrength(render && render.ring !== undefined ? render.ring : 1);
        this.atmosphere = atmosphere && this.atmosphereSupported
            ? { heightFog: atmosphere.heightFog, shafts: atmosphere.shafts || 0, baseY }
            : null;
    }

    // The far ring's strength, under whatever the weather leaves of it
    setRingStrength(value) {
        if (value === this.ringStrength) return;
        this.ringStrength = value;
        this.skyBase.mountains = (1 - this.skyBase.fogBlend) * value;
        this.skyUniforms.uMountains.value = this.skyBase.mountains;
    }

    setTimeOfDay(timeKey, config) {
        this.timeKey = SKY_PRESETS[timeKey] ? timeKey : 'golden';
        this.timeConfig = config || this.timeConfig || null;
        this.applySky();
    }

    setWeather(type) {
        this.weatherType = type || 'clear';
        this.applySky();
    }

    setSunOffset(offset) {
        if (!offset) return;
        this.sunDirection.set(offset.x, offset.y, offset.z || 0).normalize();
        this.skyUniforms.uSunDir.value.copy(this.sunDirection);
    }

    // The sky for a time and a weather as plain values, the same object every
    // time for the same arguments. Nothing is written until writeSky.
    resolveSky(timeKey, weatherType, config = this.timeConfig) {
        const key = SKY_PRESETS[timeKey] ? timeKey : 'golden';
        const cacheKey = `${key}|${weatherType}|${config ? key : ''}`;
        const cached = this.skyCache.get(cacheKey);
        if (cached && cached.config === config) return cached;

        const preset = SKY_PRESETS[key];
        const weather = SKY_WEATHER[weatherType] || {};
        const pick = (name) => (weather[name] !== undefined ? weather[name] : preset[name]);
        const sunScale = weather.sunScale !== undefined ? weather.sunScale : 1;
        // Overcast weather at night or dusk must not paint a daytime sky
        let dim = 1;
        if ((weatherType === 'rain' || weatherType === 'snow') && (key === 'night' || key === 'twilight')) {
            dim = key === 'night' ? 0.08 : (weatherType === 'snow' ? 0.6 : 0.7);
        }
        const values = {
            timeKey: key,
            weatherType,
            config,
            zenith: pick('zenith'),
            mid: pick('mid'),
            glow: preset.glow,
            cloudLit: pick('cloudLit'),
            cloudShadow: pick('cloudShadow'),
            mountain: preset.mountain,
            coverage: pick('coverage'),
            stars: pick('stars'),
            moon: preset.moon ? 1 : 0,
            sunIntensity: preset.sunIntensity * sunScale,
            glowStrength: preset.glowStrength * (0.25 + 0.75 * sunScale),
            fogBlend: weather.fogBlend || 0,
            fogShare: weatherType === 'fog' ? 1 : 0,
            dim,
            sunColor: config && config.sunColor !== undefined ? (preset.moon ? 0xdfe8ff : config.sunColor) : undefined,
            sunOffset: config && config.sunOffset ? config.sunOffset : undefined,
            saturation: (weather.saturation !== undefined ? weather.saturation : 1) * preset.saturation,
            contrast: preset.contrast,
            tint: preset.tint,
            bloom: preset.bloom,
            threshold: preset.threshold ?? 1.0
        };
        this.skyCache.set(cacheKey, values);
        return values;
    }

    // The sky between two resolved skies, `t` of the way to `b`. Colours and
    // numbers blend; what has no middle (the moon, the names) switches at 0.5.
    blendSky(a, b, t, out = this.skyBlendValues || (this.skyBlendValues = {})) {
        const near = t < 0.5 ? a : b;
        const number = (x, y) => x + (y - x) * t;
        const colour = (x, y) => AtmosphereTrack.lerpHex(x, y, t);
        out.timeKey = near.timeKey;
        out.weatherType = near.weatherType;
        out.config = near.config;
        ['zenith', 'mid', 'glow', 'cloudLit', 'cloudShadow', 'mountain', 'tint'].forEach(name => { out[name] = colour(a[name], b[name]); });
        ['coverage', 'stars', 'sunIntensity', 'glowStrength', 'fogBlend', 'fogShare', 'dim', 'saturation', 'contrast', 'bloom', 'threshold'].forEach(name => { out[name] = number(a[name], b[name]); });
        out.moon = near.moon;
        // The sun and the moon share one disc: it fades out, switches at 0.5, and fades in
        if (a.moon !== b.moon) out.sunIntensity = near.sunIntensity * Math.abs(1 - 2 * t);
        out.sunColor = a.sunColor !== undefined && b.sunColor !== undefined ? colour(a.sunColor, b.sunColor) : near.sunColor;
        const oa = a.sunOffset;
        const ob = b.sunOffset;
        if (oa && ob) {
            out.sunOffset = out.sunOffset || {};
            out.sunOffset.x = number(oa.x, ob.x);
            out.sunOffset.y = number(oa.y, ob.y);
            out.sunOffset.z = number(oa.z || 0, ob.z || 0);
        } else {
            out.sunOffset = near.sunOffset;
        }
        return out;
    }

    // Write resolved sky values to the uniforms and the grade. Does not mark
    // the environment for a bake: applySky snaps, requestRebake paces.
    // `blend` is how far into a blend zone the values are, for the bake pacing.
    writeSky(values, blend = 0) {
        const u = this.skyUniforms;
        this.timeKey = values.timeKey;
        this.weatherType = values.weatherType;
        if (values.config) this.timeConfig = values.config;
        this.skyBlend = blend;

        u.uZenith.value.setHex(values.zenith);
        u.uMid.value.setHex(values.mid);
        u.uGlowColor.value.setHex(values.glow);
        u.uCloudLit.value.setHex(values.cloudLit);
        u.uCloudShadow.value.setHex(values.cloudShadow);
        u.uMountain.value.setHex(values.mountain);
        u.uCoverage.value = values.coverage;
        u.uStars.value = values.stars;
        u.uMoon.value = values.moon;
        u.uSunIntensity.value = values.sunIntensity;
        u.uGlow.value = values.glowStrength;
        u.uFogBlend.value = values.fogBlend;
        this.skyBase.fogBlend = values.fogBlend;
        this.skyBase.mountains = (1 - values.fogBlend) * this.ringStrength;
        u.uMountains.value = this.skyBase.mountains;
        this.fogShare = values.fogShare;

        if (values.dim !== 1) {
            u.uZenith.value.multiplyScalar(values.dim);
            u.uMid.value.multiplyScalar(values.dim);
            u.uCloudLit.value.multiplyScalar(values.dim);
            u.uCloudShadow.value.multiplyScalar(values.dim);
        }

        if (values.sunColor !== undefined) u.uSunColor.value.setHex(values.sunColor);
        if (values.sunOffset) this.setSunOffset(values.sunOffset);

        const grade = this.grade || (this.grade = { tint: new THREE.Color() });
        grade.saturation = values.saturation;
        grade.contrast = values.contrast;
        grade.tint.setHex(values.tint);
        grade.bloom = values.bloom;
        grade.threshold = values.threshold;
    }

    // Snap the sky to the current time and weather, and bake it
    applySky() {
        this.writeSky(this.resolveSky(this.timeKey, this.weatherType));
        this.environmentDirty = true;
    }

    // Ask for a bake of the environment map while the sky blends. A bake
    // costs about one frame, so it waits for 30 frames since the last one and
    // for the blend to have moved 0.125.
    requestRebake() {
        if (this.frames - this.stats.lastBakeFrame < 30) return;
        if (Math.abs(this.skyBlend - this.bakedBlend) < 0.125) return;
        this.environmentDirty = true;
    }

    // Bake the sky into a prefiltered cube map so paint, chrome and wet tarmac
    // reflect the actual sky and every surface gets sky-coloured ambient light
    updateEnvironment() {
        const u = this.skyUniforms;
        const e = this.envUniforms;
        Object.keys(u).forEach(key => {
            const value = u[key].value;
            if (value && (value.isColor || value.isVector3)) e[key].value.copy(value);
            else e[key].value = value;
        });
        e.uSunIntensity.value = 0;
        e.uStars.value = 0;
        e.uMountains.value = 0;

        const previous = this.environmentTarget;
        const savedTarget = this.renderer.getRenderTarget();
        this.environmentTarget = this.pmrem.fromScene(this.envScene, 0.035);
        this.renderer.setRenderTarget(savedTarget);
        this.scene.environment = this.environmentTarget.texture;
        if (previous) previous.dispose();
        this.environmentDirty = false;
        this.stats.envBakes++;
        this.stats.lastBakeFrame = this.frames;
        this.bakedBlend = this.skyBlend;
    }

    // Colour textures and vertex colours created by the game are authored in
    // sRGB. Tag them once so the renderer decodes them to linear for lighting.
    fixColorSpaces(root = this.scene) {
        const slots = ['map', 'emissiveMap'];
        root.traverse(obj => {
            const materials = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
            for (const material of materials) {
                for (const slot of slots) {
                    const texture = material[slot];
                    if (texture && texture.isTexture && !this.seenTextures.has(texture)) {
                        this.seenTextures.add(texture);
                        if (texture.encoding !== THREE.sRGBEncoding) {
                            texture.encoding = THREE.sRGBEncoding;
                            texture.needsUpdate = true;
                        }
                    }
                }
            }
            const geometry = obj.geometry;
            if (geometry && geometry.attributes && geometry.attributes.color && !this.seenGeometries.has(geometry)) {
                this.seenGeometries.add(geometry);
                const attribute = geometry.attributes.color;
                const array = attribute.array;
                // Only float colours need decoding; normalised bytes are rare here
                if (array instanceof Float32Array) {
                    const stride = attribute.itemSize;
                    for (let i = 0; i < array.length; i += stride) {
                        for (let c = 0; c < 3; c++) {
                            const v = array[i + c];
                            array[i + c] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
                        }
                    }
                    attribute.needsUpdate = true;
                }
            }
        });
    }

    setupPost() {
        const targetOptions = {
            type: THREE.HalfFloatType,
            format: THREE.RGBAFormat,
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            depthBuffer: false,
            stencilBuffer: false
        };
        // The depth texture goes in the constructor options: three attaches it
        // when the framebuffer is first set up, so it can never be added later.
        // DepthFormat only (no stencil), and only sampled in a pass that draws
        // to another target.
        const sceneOptions = { depthBuffer: true, samples: 4 };
        if (this.atmosphereSupported) sceneOptions.depthTexture = new THREE.DepthTexture(4, 4);
        this.sceneTarget = new THREE.WebGLRenderTarget(4, 4, Object.assign({}, targetOptions, sceneOptions));
        if (this.atmosphereSupported) {
            this.shaftTarget = new THREE.WebGLRenderTarget(2, 2, targetOptions);
        }
        this.bloomLevels = 5;
        this.bloomTargets = [];
        for (let i = 0; i < this.bloomLevels; i++) {
            this.bloomTargets.push(new THREE.WebGLRenderTarget(4, 4, targetOptions));
        }

        this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.quadScene = new THREE.Scene();
        this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
        this.quad.frustumCulled = false;
        this.quadScene.add(this.quad);

        const pass = (fragmentShader, uniforms, extra = {}) => new THREE.ShaderMaterial(Object.assign({
            uniforms,
            vertexShader: GFX_QUAD_VERTEX,
            fragmentShader,
            depthTest: false,
            depthWrite: false,
            toneMapped: false
        }, extra));

        this.prefilterMaterial = pass(GFX_BLOOM_PREFILTER, {
            tSource: { value: null },
            uTexel: { value: new THREE.Vector2() },
            uThreshold: { value: 1.0 },
            uKnee: { value: 0.5 }
        });
        this.downMaterial = pass(GFX_BLOOM_DOWN, {
            tSource: { value: null },
            uTexel: { value: new THREE.Vector2() }
        });
        this.upMaterial = pass(GFX_BLOOM_UP, {
            tSource: { value: null },
            uTexel: { value: new THREE.Vector2() },
            uWeight: { value: 1.0 }
        }, { blending: THREE.AdditiveBlending, transparent: true });
        if (this.atmosphereSupported) {
            this.shaftsMaterial = pass(GFX_SHAFTS, {
                tScene: { value: null },
                tDepth: { value: null },
                uSun: { value: this.sunScreen }
            });
        }
        this.compositeMaterial = pass(GFX_COMPOSITE, {
            tScene: { value: null },
            tBloom: { value: null },
            tDepth: { value: null },
            tShafts: { value: null },
            uProjInv: { value: new THREE.Matrix4() },
            uCamWorld: { value: new THREE.Matrix4() },
            uFogColor: { value: new THREE.Color(1, 1, 1) },
            uHeightFog: { value: new THREE.Vector3() },
            uHeightFogOn: { value: 0 },
            uShafts: { value: 0 },
            uFogReach: { value: 900 },
            uExposure: { value: 1 },
            uBloom: { value: 0.7 },
            uVignette: { value: 0.28 },
            uSaturation: { value: 1 },
            uContrast: { value: 1 },
            uSpeed: { value: 0 },
            uTime: { value: 0 },
            uFlash: { value: 0 },
            uTint: { value: new THREE.Color(1, 1, 1) }
        });
    }

    resizeTargets() {
        this.renderer.getDrawingBufferSize(this.bufferSize);
        const width = Math.max(2, Math.floor(this.bufferSize.x));
        const height = Math.max(2, Math.floor(this.bufferSize.y));
        if (this.sceneTarget.width === width && this.sceneTarget.height === height) return;
        this.sceneTarget.setSize(width, height);
        if (this.shaftTarget) {
            this.shaftTarget.setSize(Math.max(2, Math.floor(width / 4)), Math.max(2, Math.floor(height / 4)));
        }
        let w = width;
        let h = height;
        for (let i = 0; i < this.bloomLevels; i++) {
            w = Math.max(2, Math.floor(w / 2));
            h = Math.max(2, Math.floor(h / 2));
            this.bloomTargets[i].setSize(w, h);
        }
    }

    renderPass(material, target) {
        this.quad.material = material;
        this.renderer.setRenderTarget(target);
        this.renderer.render(this.quadScene, this.quadCamera);
    }

    // speedRatio drives the edge blur; flash is a 0-1 lightning pulse
    update(deltaTime, speedRatio = 0, flash = 0) {
        this.time += deltaTime;
        this.frames++;
        this.speedRatio = speedRatio;
        this.flash = flash;
        this.skyUniforms.uTime.value = this.time;

        // The horizon is whatever the fog currently is (weather retints it)
        if (this.scene.fog) {
            this.skyUniforms.uHorizon.value.copy(this.scene.fog.color);
            // Thick fog hides the far ranges and the upper sky progressively,
            // by the share of the sky's weather that is fog
            if (this.fogShare > 0 && this.scene.fog.density !== undefined) {
                const thick = Math.min(1, this.scene.fog.density / 0.008);
                const toward = (base, target) => (this.fogShare >= 1 ? target : base + (target - base) * this.fogShare);
                this.skyUniforms.uFogBlend.value = toward(this.skyBase.fogBlend, 0.55 + 0.45 * thick);
                this.skyUniforms.uMountains.value = toward(this.skyBase.mountains, (1 - thick) * this.ringStrength);
            }
        }

        for (const water of GFX_WATER_MATERIALS) {
            if (water.normalMap) {
                water.normalMap.offset.x = (water.normalMap.offset.x + deltaTime * 0.012) % 1;
                water.normalMap.offset.y = (water.normalMap.offset.y + deltaTime * 0.007) % 1;
            }
        }

        // Objects are created throughout a leg (particles, knocked cones)
        const now = performance.now();
        if (now - this.lastColorScan > 1500) {
            this.lastColorScan = now;
            this.fixColorSpaces();
        }
    }

    // Fill the composite pass's atmosphere uniforms, and draw the quarter-
    // resolution light shafts when the sun is in front of the camera
    renderAtmosphere(scene, camera) {
        const c = this.compositeMaterial.uniforms;
        const atmosphere = this.atmosphere;
        const fog = atmosphere && atmosphere.heightFog;
        c.uHeightFogOn.value = fog ? 1 : 0;
        this.shaftsActive = false;
        c.uShafts.value = 0;
        if (!atmosphere) return;

        camera.updateMatrixWorld();
        c.tDepth.value = this.sceneTarget.depthTexture;
        c.uProjInv.value.copy(camera.projectionMatrixInverse);
        c.uCamWorld.value.copy(camera.matrixWorld);
        if (scene.fog) c.uFogColor.value.copy(scene.fog.color);
        // Shafts with no height fog (a part over a deep drop) leave the fog off
        if (fog) c.uHeightFog.value.set(fog.density, atmosphere.baseY, fog.falloff);

        // The moon casts no shafts
        const preset = SKY_PRESETS[this.timeKey];
        if (!(atmosphere.shafts > 0) || (preset && preset.moon)) return;
        this.sunView.copy(this.sunDirection).transformDirection(camera.matrixWorldInverse);
        if (this.sunView.z >= 0) return;
        // Project a point far along the sun direction (camera-relative)
        this.sunView.multiplyScalar(1000).applyMatrix4(camera.projectionMatrix);
        this.sunScreen.set(this.sunView.x * 0.5 + 0.5, this.sunView.y * 0.5 + 0.5);

        const shafts = this.shaftsMaterial.uniforms;
        shafts.tScene.value = this.sceneTarget.texture;
        shafts.tDepth.value = this.sceneTarget.depthTexture;
        this.renderPass(this.shaftsMaterial, this.shaftTarget);
        c.tShafts.value = this.shaftTarget.texture;
        c.uShafts.value = atmosphere.shafts;
        this.shaftsActive = true;
    }

    // Redraw the cloud panorama: at once when the sky changed, otherwise a
    // few times a second (the clouds only drift)
    bakePanorama(force) {
        this.panoramaAge++;
        if (!force && this.panoramaAge < 8) return;
        this.panoramaAge = 0;
        const savedTarget = this.renderer.getRenderTarget();
        this.renderer.setRenderTarget(this.panoramaTarget);
        this.renderer.render(this.panoramaScene, this.panoramaCamera);
        this.renderer.setRenderTarget(savedTarget);
    }

    render(scene, camera) {
        this.ensureSkyInScene();
        if (this.environmentDirty && scene.fog) {
            this.skyUniforms.uHorizon.value.copy(scene.fog.color);
        }
        this.bakePanorama(this.environmentDirty);
        if (this.environmentDirty) {
            this.updateEnvironment();
        }

        if (!this.postEnabled) {
            // Materials mix fog in after they encode to sRGB, so they need
            // the fog colour in sRGB for this path
            const fogColor = scene.fog ? scene.fog.color : null;
            if (fogColor) {
                this.linearFogColor.copy(fogColor);
                fogColor.convertLinearToSRGB();
            }
            this.renderer.setRenderTarget(null);
            this.renderer.render(scene, camera);
            if (fogColor) fogColor.copy(this.linearFogColor);
            return;
        }

        const renderer = this.renderer;
        this.resizeTargets();

        renderer.setRenderTarget(this.sceneTarget);
        renderer.render(scene, camera);

        // Bloom: threshold, blur down a mip chain, then add each level back up
        const targets = this.bloomTargets;
        this.prefilterMaterial.uniforms.tSource.value = this.sceneTarget.texture;
        this.prefilterMaterial.uniforms.uThreshold.value = this.grade.threshold;
        this.prefilterMaterial.uniforms.uTexel.value.set(1 / this.sceneTarget.width, 1 / this.sceneTarget.height);
        this.renderPass(this.prefilterMaterial, targets[0]);

        for (let i = 1; i < targets.length; i++) {
            this.downMaterial.uniforms.tSource.value = targets[i - 1].texture;
            this.downMaterial.uniforms.uTexel.value.set(1 / targets[i - 1].width, 1 / targets[i - 1].height);
            this.renderPass(this.downMaterial, targets[i]);
        }

        const autoClear = renderer.autoClear;
        renderer.autoClear = false;
        for (let i = targets.length - 2; i >= 0; i--) {
            this.upMaterial.uniforms.tSource.value = targets[i + 1].texture;
            this.upMaterial.uniforms.uTexel.value.set(1 / targets[i + 1].width, 1 / targets[i + 1].height);
            this.renderPass(this.upMaterial, targets[i]);
        }
        renderer.autoClear = autoClear;

        const c = this.compositeMaterial.uniforms;
        this.renderAtmosphere(scene, camera);
        c.tScene.value = this.sceneTarget.texture;
        c.tBloom.value = targets[0].texture;
        c.uExposure.value = renderer.toneMappingExposure;
        c.uBloom.value = this.grade.bloom / this.bloomLevels * 1.6;
        c.uSaturation.value = this.grade.saturation;
        c.uContrast.value = this.grade.contrast;
        c.uTint.value.copy(this.grade.tint);
        c.uSpeed.value = Math.max(0, (this.speedRatio - 0.45) / 0.55);
        c.uTime.value = this.time;
        c.uFlash.value = this.flash;
        this.renderPass(this.compositeMaterial, null);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Graphics, SKY_PRESETS, SKY_WEATHER };
}
