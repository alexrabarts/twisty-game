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
    // High sun, a clean blue sky: the world's valley and pass stages (R5). A new key, so no leg look changes
    day: {
        zenith: 0x2468c0, mid: 0x7ab6ee, glow: 0xffffff, glowStrength: 0.5,
        sunIntensity: 34, cloudLit: 0xffffff, cloudShadow: 0x9aa8c0, coverage: 0.36,
        stars: 0.0, mountain: 0x62789a, saturation: 1.08, contrast: 1.04, tint: 0xffffff, bloom: 0.5
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

// The colour grade of the effects (js/effects.js, 'grade'), after the tone map in display light: `shadow` and `light`
// multiply the darks and the brights (cool shadows, warm highlights), `curve` is the strength of an S-curve of contrast
// about 0.4 that keeps black and white. A weather's row stands in for its time's; Graphics.update eases from one row to the next, so a
// blend zone that switches the time or the weather at its middle does not jump
const GFX_GRADES = {
    dawn: { shadow: [0.95, 0.98, 1.06], light: [1.04, 1.0, 0.95], curve: 0.1 },
    day: { shadow: [0.96, 0.99, 1.05], light: [1.03, 1.01, 0.97], curve: 0.12 },
    golden: { shadow: [0.94, 0.98, 1.07], light: [1.05, 1.01, 0.94], curve: 0.12 },
    sunset: { shadow: [0.93, 0.97, 1.08], light: [1.06, 1.0, 0.92], curve: 0.14 },
    twilight: { shadow: [0.95, 0.98, 1.07], light: [1.0, 1.0, 1.02], curve: 0.08 },
    night: { shadow: [0.95, 0.98, 1.08], light: [1.03, 1.0, 0.96], curve: 0.06 }
};
const GFX_GRADE_WEATHER = {
    rain: { shadow: [0.97, 0.99, 1.04], light: [1.0, 1.0, 0.99], curve: 0.06 },
    snow: { shadow: [0.97, 0.99, 1.04], light: [1.01, 1.0, 0.99], curve: 0.06 },
    fog: { shadow: [0.98, 0.99, 1.02], light: [1.01, 1.0, 0.99], curve: 0.04 }
};

// The samples of the ambient occlusion: a hemisphere round +z, denser near its middle, the same every page
function gfxAoKernel(count) {
    const out = [];
    for (let i = 0; i < count; i++) {
        const u = (i + 0.5) / count;
        const phi = i * 2.399963;
        const z = Math.sqrt(1 - u) * 0.9 + 0.1;
        const r = Math.sqrt(Math.max(0, 1 - z * z));
        const scale = 0.15 + 0.85 * ((i + 1) / count) ** 2;
        out.push(new THREE.Vector3(Math.cos(phi) * r * scale, Math.sin(phi) * r * scale, z * scale));
    }
    return out;
}

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
    uniform float uHorizonSpan;
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
        vec3 sky = mix(uHorizon, uMid, smoothstep(0.0, uHorizonSpan, up));
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

// Ambient occlusion at half resolution, from the depth alone (no normal target): each pixel's view position and normal
// are rebuilt from the depth, and AO_SAMPLES points of a hemisphere uRadius m round it are tested against the depth.
// The rotation of the hemisphere repeats every 4 x 4 pixels, which the blur after it averages away. It fades out by
// uFade m, where the depth's steps would show and the haze hides it anyway
const GFX_AO = `
    uniform sampler2D tDepth;
    uniform vec2 uTexel;
    uniform vec4 uProj; // proj[2][2], proj[3][2], 1 / proj[0][0], 1 / proj[1][1]
    uniform vec3 uKernel[AO_SAMPLES];
    uniform float uRadius;
    uniform float uIntensity;
    uniform float uFade;
    varying vec2 vUv;
    float aoViewZ(float d) { return -uProj.y / (d * 2.0 - 1.0 + uProj.x); }
    vec3 aoView(vec2 uv) {
        float z = aoViewZ(texture2D(tDepth, uv).r);
        return vec3((uv * 2.0 - 1.0) * uProj.zw * -z, z);
    }
    void main() {
        // A half-resolution pixel's centre is a corner of four depth texels: read the middle of one, so a neighbour a
        // texel away is never the same texel by rounding (which flattened the normal in whole rows)
        vec2 at = (floor(vUv / uTexel) + 0.5) * uTexel;
        float d = texture2D(tDepth, at).r;
        if (d >= 0.99999) { gl_FragColor = vec4(1.0); return; }
        vec3 p = aoView(at);
        float dist = -p.z;
        if (dist > uFade) { gl_FragColor = vec4(1.0); return; }
        // The nearer neighbour of each pair, so a silhouette does not tilt the normal
        vec3 r = aoView(at + vec2(uTexel.x, 0.0)), l = aoView(at - vec2(uTexel.x, 0.0));
        vec3 u = aoView(at + vec2(0.0, uTexel.y)), w = aoView(at - vec2(0.0, uTexel.y));
        vec3 dx = abs(r.z - p.z) < abs(p.z - l.z) ? r - p : p - l;
        vec3 dy = abs(u.z - p.z) < abs(p.z - w.z) ? u - p : p - w;
        vec3 n = normalize(cross(dx, dy));
        if (dot(n, p) > 0.0) n = -n;
        vec2 cell = mod(floor(gl_FragCoord.xy), 4.0);
        float angle = 6.2831853 * (cell.x * 4.0 + cell.y + 0.5) / 16.0;
        // A basis of the surface from a helper axis that is never near the normal, turned by the pixel's angle: a
        // random vector made into a tangent fails where it lies along the normal (a band of the road, a wall's face)
        vec3 helper = abs(n.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
        vec3 t0 = normalize(cross(helper, n));
        vec3 b0 = cross(n, t0);
        vec3 t = t0 * cos(angle) + b0 * sin(angle);
        vec3 b = cross(n, t);
        float bias = 0.015 + dist * 0.0015;
        float occ = 0.0;
        for (int i = 0; i < AO_SAMPLES; i++) {
            vec3 k = uKernel[i];
            vec3 s = p + (t * k.x + b * k.y + n * k.z) * uRadius;
            vec2 suv = s.xy / (-s.z * uProj.zw) * 0.5 + 0.5;
            if (suv.x < 0.0 || suv.y < 0.0 || suv.x > 1.0 || suv.y > 1.0) continue;
            float sz = aoViewZ(texture2D(tDepth, suv).r);
            float range = smoothstep(0.0, 1.0, uRadius / max(abs(p.z - sz), 1e-4));
            occ += sz >= s.z + bias ? range : 0.0;
        }
        float ao = 1.0 - occ / float(AO_SAMPLES) * uIntensity;
        // A face seen edge-on has a normal the depth cannot give and samples that fall through it: it keeps its light
        float facing = dot(n, -normalize(p));
        ao = mix(1.0, ao, smoothstep(0.06, 0.25, facing));
        ao = mix(ao, 1.0, smoothstep(uFade * 0.45, uFade, dist));
        gl_FragColor = vec4(clamp(ao, 0.0, 1.0), 0.0, 0.0, 1.0);
    }
`;

// The occlusion's 4 x 4 box, from four bilinear taps each on the corner of four texels (offsets of -1.5 and +0.5), each
// weighed by how near its depth is to the pixel's: the 4 x 4 rotation pattern goes and a silhouette keeps its edge
const GFX_AO_BLUR = `
    uniform sampler2D tAO;
    uniform sampler2D tDepth;
    uniform vec2 uTexel;
    uniform vec4 uProj;
    varying vec2 vUv;
    float aoViewZ(float d) { return -uProj.y / (d * 2.0 - 1.0 + uProj.x); }
    void main() {
        float z = aoViewZ(texture2D(tDepth, vUv).r);
        float sum = 0.0, weight = 0.0;
        for (int i = 0; i < 4; i++) {
            vec2 o = vec2(i == 0 || i == 2 ? -1.5 : 0.5, i < 2 ? -1.5 : 0.5) * uTexel;
            float sz = aoViewZ(texture2D(tDepth, vUv + o).r);
            // A step of more than a tenth of the distance is another surface; a slope seen edge-on is not
            float wt = abs(sz - z) < max(abs(z) * 0.1, 0.3) ? 1.0 : 0.05;
            sum += texture2D(tAO, vUv + o).r * wt;
            weight += wt;
        }
        gl_FragColor = vec4(sum / max(weight, 1e-4), 0.0, 0.0, 1.0);
    }
`;

// The headlight glare: the bright pass at a quarter of the frame smeared along the screen's horizontal, as a lens
// streaks a lamp. Run twice, at a step of 1 and of 7 texels, for a long thin streak from 15 taps a pass
const GFX_STREAK = `
    uniform sampler2D tSource;
    uniform vec2 uTexel;
    uniform float uStep;
    varying vec2 vUv;
    void main() {
        vec3 c = texture2D(tSource, vUv).rgb;
        float total = 1.0;
        for (int i = 1; i <= 7; i++) {
            float w = pow(0.82, float(i));
            vec2 o = vec2(float(i) * uStep * uTexel.x, 0.0);
            c += (texture2D(tSource, vUv + o).rgb + texture2D(tSource, vUv - o).rgb) * w;
            total += 2.0 * w;
        }
        gl_FragColor = vec4(c / total, 1.0);
    }
`;

// Edge smoothing after the composite (FXAA, the small form): five taps find the edge's direction, and two or four
// along it blend across it. It reads the display-encoded frame, as FXAA expects
const GFX_SMOOTH = `
    uniform sampler2D tSource;
    uniform vec2 uTexel;
    varying vec2 vUv;
    void main() {
        vec3 nw = texture2D(tSource, vUv + vec2(-1.0, -1.0) * uTexel).rgb;
        vec3 ne = texture2D(tSource, vUv + vec2(1.0, -1.0) * uTexel).rgb;
        vec3 sw = texture2D(tSource, vUv + vec2(-1.0, 1.0) * uTexel).rgb;
        vec3 se = texture2D(tSource, vUv + vec2(1.0, 1.0) * uTexel).rgb;
        vec4 m = texture2D(tSource, vUv);
        vec3 weights = vec3(0.299, 0.587, 0.114);
        float lnw = dot(nw, weights), lne = dot(ne, weights), lsw = dot(sw, weights), lse = dot(se, weights), lm = dot(m.rgb, weights);
        float lo = min(lm, min(min(lnw, lne), min(lsw, lse)));
        float hi = max(lm, max(max(lnw, lne), max(lsw, lse)));
        vec2 dir = vec2(-((lnw + lne) - (lsw + lse)), (lnw + lsw) - (lne + lse));
        float reduce = max((lnw + lne + lsw + lse) * (0.25 / 8.0), 1.0 / 128.0);
        float scale = 1.0 / (min(abs(dir.x), abs(dir.y)) + reduce);
        dir = clamp(dir * scale, vec2(-8.0), vec2(8.0)) * uTexel;
        vec3 a = 0.5 * (texture2D(tSource, vUv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tSource, vUv + dir * (2.0 / 3.0 - 0.5)).rgb);
        vec3 b = a * 0.5 + 0.25 * (texture2D(tSource, vUv - dir * 0.5).rgb + texture2D(tSource, vUv + dir * 0.5).rgb);
        float lb = dot(b, weights);
        gl_FragColor = vec4(lb < lo || lb > hi ? a : b, 1.0);
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
    // The effects (js/effects.js); each at 0 leaves the frame as it was before it
    uniform sampler2D tAO;
    uniform float uAO;
    uniform sampler2D tStreak;
    uniform float uStreak;
    uniform float uWet;
    uniform float uGrade;
    uniform vec3 uGradeShadow;
    uniform vec3 uGradeLight;
    uniform float uGradeCurve;
    uniform float uGradeDepth;
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

        // Ambient occlusion: before the fog and the haze of the air are mixed in by the composite, so the far land
        // keeps its blue (the occlusion is gone by its fade distance in any case)
        if (uAO > 0.5) color *= texture2D(tAO, vUv).r;

        // The wet road mirrors what is bright above it: the bloom of each lamp and headlight is drawn out downward
        // over flat ground near the camera, as a streak of light on wet asphalt
        if (uWet > 0.001) {
            // The derivatives come before any branch on the depth: they are not defined inside one
            float depth = texture2D(tDepth, vUv).r;
            vec4 view = uProjInv * vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
            vec3 world = (uCamWorld * vec4(view.xyz / view.w, 1.0)).xyz;
            vec3 n = normalize(cross(dFdx(world), dFdy(world)) + vec3(0.0, 1e-6, 0.0));
            if (depth < 0.9999) {
                float level = smoothstep(0.82, 0.96, abs(n.y));
                float reach = level * (1.0 - smoothstep(40.0, 140.0, length(world - uCamWorld[3].xyz))) * uWet;
                if (reach > 0.01) {
                    // Twelve taps up the screen from a start that differs from pixel to pixel, so a small light
                    // draws a smooth streak and not a row of dots
                    vec3 mirrored = vec3(0.0);
                    float jitter = grainHash(gl_FragCoord.xy);
                    for (int i = 0; i < 12; i++) {
                        float f = (float(i) + jitter) / 12.0;
                        vec2 uv = vUv + vec2(0.0, f * 0.24);
                        if (uv.y < 1.0) mirrored += texture2D(tBloom, uv).rgb * (1.0 - f) * (8.0 / 12.0);
                    }
                    color += mirrored * reach * 0.8 * uBloom;
                }
            }
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
        if (uStreak > 0.001) color += texture2D(tStreak, vUv).rgb * vec3(0.8, 0.9, 1.0) * uStreak;
        color += vec3(0.75, 0.82, 1.0) * uFlash;

        color = acesFilmic(color);

        // Grade in display-referred space
        float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
        color = mix(vec3(luma), color, uSaturation);
        // Contrast as a power about mid grey (0.18 linear): the old (c - 0.5) * k + 0.5 in linear light sent every
        // value under 0.5 - 0.5 / k to zero (under sRGB 37 at k 1.04), so shaded land, dark forest and tyres crushed to
        // black. A power never goes below zero and keeps the order of the darks
        color = 0.18 * pow(max(color, vec3(0.0)) / 0.18, vec3(uContrast));
        color *= uTint;

        // The colour grade of the time of day (GFX_GRADES): in a display-like power of 1 / 2.2, an S-curve of contrast
        // about 0.4, then the darks cooled and the brights warmed by their lightness
        // The sky and the land past GRADE_FAR are not graded: their colours are held to the owner's photos by distance
        // (world-haze), and the grade is for the near scene
        float gradeShare = uGrade;
        if (uGrade > 0.001 && uGradeDepth > 0.5) {
            float depth = texture2D(tDepth, vUv).r;
            vec4 view = uProjInv * vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
            gradeShare *= depth >= 0.9999 ? 0.0 : 1.0 - smoothstep(400.0, 1000.0, length(view.xyz / view.w));
        }
        if (gradeShare > 0.001) {
            vec3 g = pow(clamp(color, 0.0, 1.0), vec3(1.0 / 2.2));
            // About 0.4 (a frame's middle in display terms): a power each side, so black and white stay where they are
            float k = 1.0 + uGradeCurve * 2.0;
            vec3 lo = 0.4 * pow(g / 0.4, vec3(k));
            vec3 hi = 1.0 - 0.6 * pow((1.0 - g) / 0.6, vec3(k));
            g = mix(lo, hi, step(0.4, g));
            float light = dot(g, vec3(0.2126, 0.7152, 0.0722));
            g *= mix(uGradeShadow, uGradeLight, smoothstep(0.05, 0.75, light));
            color = mix(color, pow(max(g, vec3(0.0)), vec3(2.2)), gradeShare);
        }

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
            uHorizonSpan: { value: Graphics.HORIZON_SPAN },
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

    // How high the horizon's pale colour reaches up the sky before the mid colour takes over (the sine of the
    // elevation): a leg's sky keeps it low; a world's is wider (WorldLooks.horizonSpan)
    static get HORIZON_SPAN() { return 0.22; }

    setHorizonSpan(value) {
        if (!this.skyUniforms || this.skyUniforms.uHorizonSpan.value === value) return;
        this.skyUniforms.uHorizonSpan.value = value;
        // The panorama is baked with it
        this.panoramaAge = Infinity;
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
            // A geometry built with linear colours (a world terrain tile) says so and is left alone
            if (geometry && geometry.attributes && geometry.attributes.color && !geometry.userData.linearColors && !this.seenGeometries.has(geometry)) {
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
            uTint: { value: new THREE.Color(1, 1, 1) },
            tAO: { value: null },
            uAO: { value: 0 },
            tStreak: { value: null },
            uStreak: { value: 0 },
            uWet: { value: 0 },
            uGrade: { value: 0 },
            uGradeShadow: { value: new THREE.Vector3(1, 1, 1) },
            uGradeLight: { value: new THREE.Vector3(1, 1, 1) },
            uGradeCurve: { value: 0 },
            uGradeDepth: { value: 0 }
        });

        // The effects' passes (js/effects.js). Their targets are made the first time an effect is on
        this.pass = pass;
        const proj = () => ({ value: new THREE.Vector4() });
        if (this.atmosphereSupported) {
            const ao = samples => pass(GFX_AO, {
                tDepth: { value: null },
                uTexel: { value: new THREE.Vector2() },
                uProj: proj(),
                uKernel: { value: gfxAoKernel(samples) },
                uRadius: { value: Graphics.AO.radius },
                uIntensity: { value: Graphics.AO.intensity },
                uFade: { value: Graphics.AO.fade }
            }, { defines: { AO_SAMPLES: samples } });
            this.aoMaterials = [null, ao(Graphics.AO.samples[0]), ao(Graphics.AO.samples[1])];
            this.aoBlurMaterial = pass(GFX_AO_BLUR, { tAO: { value: null }, tDepth: { value: null }, uTexel: { value: new THREE.Vector2() }, uProj: proj() });
        }
        this.streakMaterial = pass(GFX_STREAK, { tSource: { value: null }, uTexel: { value: new THREE.Vector2() }, uStep: { value: 1 } });
        this.smoothMaterial = pass(GFX_SMOOTH, { tSource: { value: null }, uTexel: { value: new THREE.Vector2() } });
    }

    // The occlusion's radius (m), its strength, the distance (m) by which it is gone, and the samples of its low and
    // high levels
    static get AO() { return { radius: 0.6, intensity: 1.2, fade: 90, samples: [8, 16] }; }

    // Puts the effects of js/effects.js in force: ao 0, 1 or 2, and wet, streaks, grade, smoothing, edgeBlur true or
    // false. Each is read where it is drawn, so a change shows on the next frame. Nothing here compiles a material
    setEffects(values) {
        const fx = this.fx || (this.fx = { ao: 0, wet: false, streaks: false, grade: false, smoothing: false, edgeBlur: true });
        Object.assign(fx, values);
        if (!this.postEnabled) return;
        const options = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false };
        if (fx.ao && this.aoMaterials && !this.aoTargets) {
            const small = { ...options, type: THREE.UnsignedByteType };
            this.aoTargets = [new THREE.WebGLRenderTarget(2, 2, small), new THREE.WebGLRenderTarget(2, 2, small)];
        }
        if (fx.streaks && !this.streakTargets) this.streakTargets = [new THREE.WebGLRenderTarget(2, 2, options), new THREE.WebGLRenderTarget(2, 2, options)];
        if (fx.smoothing && !this.smoothTarget) this.smoothTarget = new THREE.WebGLRenderTarget(2, 2, { ...options, type: THREE.UnsignedByteType });
        // The targets take the frame's size at the next draw
        this.targetsSized = null;
    }

    // How strong the glare (0 to 1: the night and the rain) and the wet road's mirror (0 to 1) are this frame; eased in
    // update, so a time or a weather that switches at a blend's middle does not pop
    setGlare(glare, wet) {
        this.glareTarget = Math.max(0, Math.min(1, glare || 0));
        this.wetTarget = Math.max(0, Math.min(1, wet || 0));
    }

    // The quality ladder's share of the drawing (js/quality.js, Game.applyQuality): the samples of the HDR scene
    // target and whether the bloom passes run. Without post-processing neither exists, so there is nothing to set
    setQuality({ msaa = 4, bloom = true } = {}) {
        this.bloomOn = bloom;
        if (!this.postEnabled || this.sceneTarget.samples === msaa) return;
        // A target's samples are read when its framebuffer is made: the old one goes, the next draw makes it again
        this.sceneTarget.samples = msaa;
        this.sceneTarget.dispose();
    }

    resizeTargets() {
        this.renderer.getDrawingBufferSize(this.bufferSize);
        const width = Math.max(2, Math.floor(this.bufferSize.x));
        const height = Math.max(2, Math.floor(this.bufferSize.y));
        if (this.sceneTarget.width === width && this.sceneTarget.height === height && this.targetsSized) return;
        this.targetsSized = true;
        const half = v => Math.max(2, Math.floor(v / 2)), quarter = v => Math.max(2, Math.floor(v / 4));
        if (this.aoTargets) this.aoTargets.forEach(t => t.setSize(half(width), half(height)));
        if (this.streakTargets) this.streakTargets.forEach(t => t.setSize(quarter(width), quarter(height)));
        if (this.smoothTarget) this.smoothTarget.setSize(width, height);
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

        this.easeEffects(deltaTime);

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

    // The grade's row for the sky in force (the weather's when it is rain, snow or fog), and the glare and the wet road,
    // each eased toward its target over about a second. The first call snaps
    easeEffects(deltaTime) {
        const row = GFX_GRADE_WEATHER[this.weatherType] || GFX_GRADES[this.timeKey] || GFX_GRADES.golden;
        const now = this.gradeNow || (this.gradeNow = { shadow: [...row.shadow], light: [...row.light], curve: row.curve, glare: 0, wet: 0 });
        const k = Math.min(1, Math.max(0, deltaTime) * 1.5);
        for (let i = 0; i < 3; i++) {
            now.shadow[i] += (row.shadow[i] - now.shadow[i]) * k;
            now.light[i] += (row.light[i] - now.light[i]) * k;
        }
        now.curve += (row.curve - now.curve) * k;
        now.glare += ((this.glareTarget || 0) - now.glare) * k;
        now.wet += ((this.wetTarget || 0) - now.wet) * k;
    }

    // The effects' passes after the scene and the bloom, and their uniforms in the composite
    renderEffects(camera) {
        const fx = this.fx || {};
        const c = this.compositeMaterial.uniforms;
        const now = this.gradeNow;
        c.uAO.value = 0;
        if (fx.ao && this.aoTargets && this.sceneTarget.depthTexture) {
            const p = camera.projectionMatrix.elements;
            const depth = this.sceneTarget.depthTexture;
            const ao = this.aoMaterials[fx.ao];
            ao.uniforms.tDepth.value = depth;
            ao.uniforms.uTexel.value.set(1 / this.sceneTarget.width, 1 / this.sceneTarget.height);
            ao.uniforms.uProj.value.set(p[10], p[14], 1 / p[0], 1 / p[5]);
            this.renderPass(ao, this.aoTargets[0]);
            const blur = this.aoBlurMaterial;
            blur.uniforms.tAO.value = this.aoTargets[0].texture;
            blur.uniforms.tDepth.value = depth;
            blur.uniforms.uTexel.value.set(1 / this.aoTargets[0].width, 1 / this.aoTargets[0].height);
            blur.uniforms.uProj.value.copy(ao.uniforms.uProj.value);
            this.renderPass(blur, this.aoTargets[1]);
            c.tAO.value = this.aoTargets[1].texture;
            c.uAO.value = 1;
        }
        // The wet road's mirror draws on the bloom and the depth
        c.uWet.value = fx.wet && this.bloomOn !== false && this.atmosphereSupported && now ? now.wet : 0;
        if (c.uWet.value > 0.001) {
            camera.updateMatrixWorld();
            c.tDepth.value = this.sceneTarget.depthTexture;
            c.uProjInv.value.copy(camera.projectionMatrixInverse);
            c.uCamWorld.value.copy(camera.matrixWorld);
        }
        c.uStreak.value = fx.streaks && this.streakDrawn && now ? now.glare * Graphics.STREAK : 0;
        c.uGrade.value = fx.grade && now ? 1 : 0;
        c.uGradeDepth.value = c.uGrade.value && this.atmosphereSupported && this.sceneTarget.depthTexture ? 1 : 0;
        if (c.uGradeDepth.value) {
            c.tDepth.value = this.sceneTarget.depthTexture;
            c.uProjInv.value.copy(camera.projectionMatrixInverse);
        }
        if (c.uGrade.value) {
            c.uGradeShadow.value.fromArray(now.shadow);
            c.uGradeLight.value.fromArray(now.light);
            c.uGradeCurve.value = now.curve;
        }
    }

    // The glare's strength over the bloom at full night or rain
    static get STREAK() { return 2.5; }

    // The glare's two passes, from the bright pass at a quarter of the frame, before the bloom adds its levels into it
    renderStreak(source) {
        const [a, b] = this.streakTargets;
        const m = this.streakMaterial;
        m.uniforms.uTexel.value.set(1 / source.width, 1 / source.height);
        m.uniforms.tSource.value = source.texture;
        m.uniforms.uStep.value = 1;
        this.renderPass(m, a);
        m.uniforms.tSource.value = a.texture;
        m.uniforms.uStep.value = 7;
        this.renderPass(m, b);
        this.compositeMaterial.uniforms.tStreak.value = b.texture;
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
        // What must change before each draw (the far shadow cascade's box: js/effects.js, Cascades)
        if (this.onRender) this.onRender(camera);
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
            this.renderedAt = performance.now();
            return;
        }

        const renderer = this.renderer;
        this.resizeTargets();

        renderer.setRenderTarget(this.sceneTarget);
        renderer.render(scene, camera);

        // Bloom: threshold, blur down a mip chain, then add each level back up
        const targets = this.bloomTargets;
        if (this.bloomOn !== false) this.renderBloom(targets);
        else this.streakDrawn = false;

        const c = this.compositeMaterial.uniforms;
        this.renderAtmosphere(scene, camera);
        this.renderEffects(camera);
        c.tScene.value = this.sceneTarget.texture;
        c.tBloom.value = targets[0].texture;
        c.uExposure.value = renderer.toneMappingExposure;
        c.uBloom.value = this.bloomOn === false ? 0 : this.grade.bloom / this.bloomLevels * 1.6;
        c.uSaturation.value = this.grade.saturation;
        c.uContrast.value = this.grade.contrast;
        c.uTint.value.copy(this.grade.tint);
        const fx = this.fx || {};
        c.uSpeed.value = fx.edgeBlur === false ? 0 : Math.max(0, (this.speedRatio - 0.45) / 0.55);
        c.uTime.value = this.time;
        c.uFlash.value = this.flash;
        if (fx.smoothing && this.smoothTarget) {
            // The composite to a target, then the edge smoothing to the canvas
            this.renderPass(this.compositeMaterial, this.smoothTarget);
            this.smoothMaterial.uniforms.tSource.value = this.smoothTarget.texture;
            this.smoothMaterial.uniforms.uTexel.value.set(1 / this.smoothTarget.width, 1 / this.smoothTarget.height);
            this.renderPass(this.smoothMaterial, null);
        } else {
            this.renderPass(this.compositeMaterial, null);
        }
        this.renderedAt = performance.now();
    }

    renderBloom(targets) {
        const renderer = this.renderer;
        this.prefilterMaterial.uniforms.tSource.value = this.sceneTarget.texture;
        this.prefilterMaterial.uniforms.uThreshold.value = this.grade.threshold;
        this.prefilterMaterial.uniforms.uTexel.value.set(1 / this.sceneTarget.width, 1 / this.sceneTarget.height);
        this.renderPass(this.prefilterMaterial, targets[0]);

        for (let i = 1; i < targets.length; i++) {
            this.downMaterial.uniforms.tSource.value = targets[i - 1].texture;
            this.downMaterial.uniforms.uTexel.value.set(1 / targets[i - 1].width, 1 / targets[i - 1].height);
            this.renderPass(this.downMaterial, targets[i]);
        }

        // The headlight glare reads the bright pass at a quarter before the levels below are added into it
        const fx = this.fx || {};
        this.streakDrawn = !!(fx.streaks && this.streakTargets && this.gradeNow && this.gradeNow.glare > 0.001);
        if (this.streakDrawn) this.renderStreak(targets[1]);

        const autoClear = renderer.autoClear;
        renderer.autoClear = false;
        for (let i = targets.length - 2; i >= 0; i--) {
            this.upMaterial.uniforms.tSource.value = targets[i + 1].texture;
            this.upMaterial.uniforms.uTexel.value.set(1 / targets[i + 1].width, 1 / targets[i + 1].height);
            this.renderPass(this.upMaterial, targets[i]);
        }
        renderer.autoClear = autoClear;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Graphics, SKY_PRESETS, SKY_WEATHER, GFX_GRADES, GFX_GRADE_WEATHER };
}
