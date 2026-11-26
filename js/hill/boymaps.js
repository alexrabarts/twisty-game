// The hill ride's boy's finishes (js/hill/boy.js), drawn once a page into typed arrays from noise, shapes and his own
// numbers, never from a picture: no image file is read for any of them, and none carries a mark or a word.
//   skin     his face and head (laid over the head as HillBoy.headPoint is: across `az`, down `polar`), and in the
//            rows its head never uses (under the cap) his lids, ears and neck: a boy's ruddy skin, the brows, the lips,
//            a few freckles and the hair's colour where the hair grows; a normal map of fine pores
//   eye      an eyeball seen from ahead: the white, the iris and its dark ring, the pupil
//   hair     short strands down the back of his head, ragged where they end
//   knit     plain knitting, stitch by stitch (the jumper, the scarf, the gloves: each tinted by its vertex colour)
//   wool     a twill with flecks of tweed (the breeches and the cap)
//   linen    the whole apron: its weave, its folds' shade, flour and grime, a frayed hem (alpha)
//   leather  the boots: each leg and foot laid flat, laced up the front through eyelets, creased at the ankle, scuffed
//            at the toe; and how shiny each part has worn
class HillBoyMaps {
    static all() {
        if (HillBoyMaps.made) return HillBoyMaps.made;
        const t0 = Date.now();
        const made = {};
        Object.assign(made, HillBoyMaps.skin(), HillBoyMaps.eye(), HillBoyMaps.hair(), HillBoyMaps.knit(), HillBoyMaps.wool(), HillBoyMaps.linen(), HillBoyMaps.leather());
        made.ms = Date.now() - t0;
        HillBoyMaps.made = made;
        return made;
    }

    // A seeded random sequence
    static random(seed) {
        let s = seed >>> 0;
        return () => {
            s = (s + 0x6d2b79f5) >>> 0;
            let t = Math.imul(s ^ (s >>> 15), 1 | s);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // Smooth value noise that repeats every `period` lattice cells, 0..1
    static noise(seed, period) {
        const rand = HillBoyMaps.random(seed), lattice = new Float32Array(period * period);
        for (let i = 0; i < lattice.length; i++) lattice[i] = rand();
        return (x, y) => {
            const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
            const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
            const x0 = ((xi % period) + period) % period, y0 = ((yi % period) + period) % period, x1 = (x0 + 1) % period, y1 = (y0 + 1) % period;
            const a = lattice[y0 * period + x0], b = lattice[y0 * period + x1], c = lattice[y1 * period + x0], d = lattice[y1 * period + x1];
            return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
        };
    }

    // A texture of `data` (RGBA bytes, w by h): mipmapped, repeating, its colour sRGB or not
    static texture(data, w, h, srgb, repeat = 1) {
        const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.magFilter = THREE.LinearFilter;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        t.generateMipmaps = true;
        t.anisotropy = 4;
        t.flipY = false;
        if (srgb) t.encoding = THREE.sRGBEncoding;
        t.repeat.set(repeat, repeat);
        t.needsUpdate = true;
        return t;
    }

    // A tangent-space normal map from a height field (w by h), as HillTextures lays them: each flank leans away from
    // its top (x right, y down the rows, as the maps are laid with flipY off)
    static normals(height, w, h, relief, repeat = 1, wrap = true) {
        const out = new Uint8Array(w * h * 4);
        const at = (x, y) => {
            if (wrap) return height[(((y % h) + h) % h) * w + (((x % w) + w) % w)];
            return height[Math.max(0, Math.min(h - 1, y)) * w + Math.max(0, Math.min(w - 1, x))];
        };
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const sx = (at(x + 1, y) - at(x - 1, y)) * relief, sy = (at(x, y + 1) - at(x, y - 1)) * relief, l = Math.hypot(sx, sy, 1), i = (y * w + x) * 4;
            out[i] = (0.5 - 0.5 * sx / l) * 255;
            out[i + 1] = (0.5 - 0.5 * sy / l) * 255;
            out[i + 2] = (0.5 + 0.5 / l) * 255;
            out[i + 3] = 255;
        }
        const t = HillBoyMaps.texture(out, w, h, false, repeat);
        if (!wrap) t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
        t.userData.height = { data: height, width: w, height: h };
        return t;
    }

    static clamp(x) { return x < 0 ? 0 : x > 255 ? 255 : x; }

    // His skin over the head, and its lids, ears and neck in the rows the head leaves free
    static skin() {
        const W = 1024, H = 1024, data = new Uint8Array(W * H * 4), height = new Float32Array(W * H);
        const n1 = HillBoyMaps.noise(11, 64), n2 = HillBoyMaps.noise(12, 256), n3 = HillBoyMaps.noise(13, 32);
        const rand = HillBoyMaps.random(14);
        const g = (x) => Math.exp(-x * x), sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
        const base = [220, 181, 158], blush = [206, 128, 110], lip = [176, 116, 102], brow = [74, 54, 38], hair = [112, 84, 58];
        const p = new THREE.Vector3(), q = new THREE.Vector3();
        // A few freckles over the nose and the cheeks (as head points)
        const freckles = [];
        for (let i = 0; i < 30; i++) freckles.push([(rand() - 0.5) * 0.08, -0.008 - rand() * 0.035, 0.6 + rand() * 0.5]);
        const mix = (c, d, k) => { c[0] += (d[0] - c[0]) * k; c[1] += (d[1] - c[1]) * k; c[2] += (d[2] - c[2]) * k; };
        const c = [0, 0, 0];
        for (let y = 0; y < H; y++) {
            const v = (y + 0.5) / H;
            for (let x = 0; x < W; x++) {
                const u = (x + 0.5) / W, i = y * W + x;
                const mottle = (n1(u * 64, v * 64) - 0.5) * 0.035 + (n2(u * 256, v * 256) - 0.5) * 0.02;
                c[0] = base[0] * (1 + mottle); c[1] = base[1] * (1 + mottle * 1.2); c[2] = base[2] * (1 + mottle * 1.2);
                height[i] = n2(u * 256, v * 256) * 0.6 + n3(u * 32, v * 32) * 0.4;
                if (v >= 0.12 && v <= 0.98) {
                    // The head: its point, and what grows or shows there
                    const polar = (v - 0.12) / 0.86 * Math.PI, az = (u - 0.5) * Math.PI * 2;
                    HillBoy.headPoint(polar, az, p, true);
                    const ax = Math.abs(p.x), front = p.z > 0;
                    // (where the face is modelled in, a little shade; where it stands out, a little light)
                    {
                        const turn = Math.max(0, Math.cos(az)), form = 1 - 0.24 * Math.pow(1 - turn, 1.6) - 0.1 * sm(-0.066, -0.094, p.y) * turn;
                        c[0] *= form; c[1] *= form; c[2] *= form;
                    }
                    if (front) {
                        const F = HillBoy.FACE, ex = ax - F.eyeX, ey = p.y - F.eyeY;
                        // A little shade where the face is modelled in, a little light where it stands out (its
                        // occlusion, from its own shape)
                        const dz = p.z - HillBoy.headPoint(polar, az, q, false).z;
                        // (and the face's form: a little darker as it turns away towards its sides and under the jaw,
                        // lighter over the cheekbones, the bridge of the nose and the chin)
                        const lit = 0.05 * g((ax - 0.042) / 0.012) * g((p.y + 0.012) / 0.009) + 0.05 * g(p.x / 0.004) * sm(0.006, -0.01, p.y) * sm(-0.032, -0.024, p.y) + 0.04 * g(p.x / 0.012) * g((p.y + 0.081) / 0.007);
                        const k = 1 + Math.max(-0.22, Math.min(0.05, dz * 15)) + lit;
                        c[0] *= k; c[1] *= k; c[2] *= k;
                        // The cheeks' colour, the nose's tip and the chin a little red, the ears' warmth
                        mix(c, blush, 0.3 * g((ax - 0.038) / 0.02) * g((p.y + 0.03) / 0.02) + 0.22 * g(p.x / 0.009) * g((p.y + 0.029) / 0.008) + 0.1 * g(p.x / 0.02) * g((p.y + 0.08) / 0.011));
                        // The lid's crease over each eye, the shade under it, and deep in the socket at its corners
                        mix(c, [168, 118, 102], 0.4 * g(ex / 0.013) * g((ey - 0.0105) / 0.0028) + 0.2 * g(ex / 0.012) * g((ey + 0.0125) / 0.004));
                        mix(c, [110, 66, 62], 0.8 * sm(0.88, 1.0, g(ex / 0.0125) * g(ey / 0.0085)));
                        // (the socket's shade between the lid and the brow, and the pink at the eye's inner corner)
                        mix(c, [150, 100, 90], 0.35 * g(ex / 0.016) * g((ey - 0.012) / 0.006) * sm(0.0, 0.01, ey));
                        mix(c, [196, 110, 104], 0.6 * g((ax - (F.eyeX - 0.0125)) / 0.0022) * g(ey / 0.0022));
                        mix(c, [120, 76, 70], 0.5 * g((ax - 0.0165) / 0.0035) * g((ey - 0.001) / 0.004));
                        // The lips: the upper with its bow, the fuller lower lip, the line between them darker and
                        // shaded into the corners; the shade under the lower lip
                        const bow = 0.0011 * Math.cos(Math.min(1, ax / 0.0075) * Math.PI);
                        const upper = Math.exp(-Math.pow(p.x / 0.0182, 4)) * sm(-0.0535, -0.0522, p.y) * sm(-0.0472 + bow * 0.4, -0.0484 + bow * 0.4, p.y);
                        const lower = Math.exp(-Math.pow(p.x / 0.0162, 4)) * sm(-0.0622, -0.0605, p.y) * sm(-0.0522, -0.0532, p.y);
                        mix(c, lip, 0.62 * upper + 0.55 * lower);
                        mix(c, [104, 58, 54], 0.8 * Math.exp(-Math.pow(p.x / 0.0205, 4)) * g((p.y + 0.0527 - 0.0012 * Math.pow(ax / 0.019, 2)) / 0.0008));
                        mix(c, [140, 88, 78], 0.4 * g((ax - 0.0205) / 0.0026) * g((p.y + 0.053) / 0.003) + 0.25 * g(p.x / 0.014) * g((p.y + 0.0648) / 0.0025));
                        // The brows: short strokes in an arch over each eye
                        const archY = F.eyeY + 0.0185 + 0.0035 * Math.sin(Math.min(1, Math.max(0, (ax - 0.011) / 0.036)) * Math.PI) - 0.002 * sm(0.036, 0.048, ax);
                        const inBrow = g((p.y - archY) / (0.0038 - 0.0013 * sm(0.03, 0.048, ax))) * sm(0.009, 0.014, ax) * sm(0.052, 0.044, ax);
                        if (inBrow > 0.05) {
                            const hairs = 0.55 + 0.45 * Math.sin((p.x * 2600 + p.y * 900) + n2(u * 256, v * 256) * 6);
                            mix(c, brow, Math.min(1, inBrow * 0.95 * (0.6 + 0.4 * hairs)));
                            height[i] += inBrow * hairs * 0.6;
                        }
                        // The nostrils, the shade under the nose and in the folds beside it
                        mix(c, [96, 56, 50], 0.7 * Math.max(0, 1 - Math.hypot((ax - 0.006) / 0.0022, (p.y + 0.0358) / 0.0013)));
                        mix(c, [168, 112, 96], 0.3 * g(p.x / 0.012) * g((p.y + 0.0375) / 0.0025));
                        const fold = Math.abs((ax - 0.017) - (-(p.y + 0.033)) * 0.42);
                        mix(c, [170, 114, 96], 0.3 * g(fold / 0.0025) * sm(-0.03, -0.036, p.y) * sm(-0.06, -0.054, p.y));
                        mix(c, [176, 120, 100], 0.16 * sm(0.048, 0.07, ax) * sm(-0.03, -0.08, p.y));
                        // The sides of the nose a shade darker, so its bridge reads from ahead; the forehead lighter
                        mix(c, [168, 116, 98], 0.3 * g((ax - 0.0085) / 0.0035) * sm(0.004, -0.004, p.y) * sm(-0.03, -0.022, p.y));
                        mix(c, [232, 196, 176], 0.25 * sm(0.022, 0.035, p.y));
                        // Freckles
                        for (const f of freckles) {
                            const d = Math.hypot(p.x - f[0], p.y - f[1]);
                            if (d < 0.0016 * f[2]) mix(c, [180, 120, 90], 0.24 * (1 - d / (0.0016 * f[2])));
                        }
                    }
                    // The hair's colour where it grows (behind the face, above the nape, round the ears; the shell over
                    // it gives the strands)
                    const behind = Math.abs(az);
                    const bottom = behind < 1.38 ? 1.5 + 0.12 * Math.max(0, Math.min(1, (behind - 1.18) / 0.2)) : behind < 2.15 ? 1.42 : 1.42 + (behind - 2.15) / (Math.PI - 2.15) * 0.88;
                    const grows = sm(HillBoy.HAIR.az0 - 0.12, HillBoy.HAIR.az0 + 0.03, behind) * sm(bottom + 0.04, bottom - 0.05, polar);
                    if (grows > 0) mix(c, hair, grows * (0.85 + 0.15 * n2(u * 256, v * 64)));
                    // The ears' and the neck's warmth
                    mix(c, blush, 0.18 * g((behind - 1.78) / 0.2) * g((polar - 1.65) / 0.18));
                } else if (v < 0.05) {
                    // The lids: skin a little pinker, the lash line along the edge (v at the top of this band)
                    const edge = v / 0.05;
                    mix(c, [206, 150, 132], 0.5);
                    mix(c, [58, 40, 32], 0.95 * g(edge / 0.09));
                    mix(c, [150, 92, 88], 0.4 * g((edge - 0.16) / 0.06));
                } else if (v < 0.1) {
                    // The ears: pinker, darker deep in their bowl (v from its middle out to the rim)
                    mix(c, blush, 0.35);
                    mix(c, [120, 70, 62], 0.55 * sm(0.075, 0.058, v));
                } else if (v > 0.975) {
                    // The neck, under the jaw a little shadowed
                    mix(c, [196, 150, 128], 0.4);
                }
                const k = i * 4;
                data[k] = HillBoyMaps.clamp(c[0]);
                data[k + 1] = HillBoyMaps.clamp(c[1]);
                data[k + 2] = HillBoyMaps.clamp(c[2]);
                data[k + 3] = 255;
            }
        }
        const skin = HillBoyMaps.texture(data, W, H, true);
        skin.wrapT = THREE.ClampToEdgeWrapping;
        skin.userData.drawn = 'HillBoyMaps.skin';
        const skinNormal = HillBoyMaps.normals(height, W, H, 0.55);
        skinNormal.wrapT = THREE.ClampToEdgeWrapping;
        return { skin, skinNormal };
    }

    // An eyeball seen from ahead (laid on the ball from its front): the white, the iris (grey-blue, its fibres, a dark
    // ring round it, lighter round the pupil) and the pupil
    static eye() {
        const N = 256, data = new Uint8Array(N * N * 4), n = HillBoyMaps.noise(21, 64);
        const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
            const u = (x + 0.5) / N - 0.5, v = (y + 0.5) / N - 0.5, r = Math.hypot(u, v), a = Math.atan2(v, u);
            let c = [222, 214, 204];
            // The white, a little pink towards its edge, its fine veins
            const vein = Math.pow(n(a * 30 + r * 8, r * 40), 6) * sm(0.3, 0.45, r);
            c = c.map((k, i) => k * (1 - 0.06 * sm(0.3, 0.5, r)) - [0, 40, 40][i] * vein);
            if (r < 0.255) {
                const fibre = 0.75 + 0.25 * n(a * 40, r * 12), ring = sm(0.17, 0.25, r), inner = sm(0.12, 0.07, r);
                const iris = [92 * fibre + 40 * inner, 112 * fibre + 30 * inner, 124 * fibre + 6 * inner].map(k => k * (1 - 0.6 * ring));
                const edge = sm(0.255, 0.24, r);
                c = c.map((k, i) => k + (iris[i] - k) * edge);
                const pupil = sm(0.095, 0.08, r);
                c = c.map(k => k + (14 - k) * pupil);
            }
            // A soft catch of light over the pupil, high to one side (the eye looks wet in any light)
            const glint = sm(0.034, 0.016, Math.hypot(u + 0.06, v - 0.075));
            c = c.map(k => k + (250 - k) * 0.9 * glint);
            const i = (y * N + x) * 4;
            data[i] = HillBoyMaps.clamp(c[0]); data[i + 1] = HillBoyMaps.clamp(c[1]); data[i + 2] = HillBoyMaps.clamp(c[2]); data[i + 3] = 255;
        }
        const eye = HillBoyMaps.texture(data, N, N, true);
        eye.wrapS = eye.wrapT = THREE.ClampToEdgeWrapping;
        return { eye };
    }

    // Short hair: strands down the head (v down from under the cap to the nape, u round from in front of one ear to in
    // front of the other), each strand its own tone, the hair ending raggedly at the sideburns, over the ears and at
    // the nape (as the skin's map paints the scalp under it)
    static hair() {
        const W = 256, H = 256, data = new Uint8Array(W * H * 4), height = new Float32Array(W * H);
        const rand = HillBoyMaps.random(31), n = HillBoyMaps.noise(32, 32);
        const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
        const strands = new Float32Array(W), ends = new Float32Array(W);
        for (let x = 0; x < W; x++) { strands[x] = rand(); ends[x] = rand(); }
        const az0 = HillBoy.HAIR.az0, az1 = 2 * Math.PI - HillBoy.HAIR.az0, p0 = HillBoy.HAIR.p0, p1 = HillBoy.HAIR.p1;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const u = (x + 0.5) / W, v = (y + 0.5) / H;
            const az = az0 + (az1 - az0) * u, polar = p0 + (p1 - p0) * v, behind = Math.abs(Math.atan2(Math.sin(az), Math.cos(az)));
            const bottom = behind < 1.38 ? 1.5 + 0.12 * Math.max(0, Math.min(1, (behind - 1.18) / 0.2)) : behind < 2.15 ? 1.42 : 1.42 + (behind - 2.15) / (Math.PI - 2.15) * 0.88;
            const end = bottom + (ends[x] - 0.5) * 0.12;
            const tone = 0.78 + 0.3 * strands[x] + 0.12 * n(u * 32, v * 8);
            const along = 0.5 + 0.5 * Math.sin(v * 90 + strands[x] * 20);
            const i = (y * W + x) * 4;
            data[i] = HillBoyMaps.clamp(116 * tone);
            data[i + 1] = HillBoyMaps.clamp(88 * tone);
            data[i + 2] = HillBoyMaps.clamp(60 * tone);
            // (whole above its end, a few strands short; nothing in front of the first strands at the face)
            const a = sm(end + 0.02, end - 0.05, polar) * sm(0.0, 0.05, u) * sm(1.0, 0.95, u) * (0.7 + 0.3 * strands[(x + 1) % W]);
            data[i + 3] = HillBoyMaps.clamp(a * 255 * (0.8 + 0.2 * along));
            height[y * W + x] = 0.4 * strands[x] + 0.4 * along + 0.2 * n(u * 32, v * 32);
        }
        const hair = HillBoyMaps.texture(data, W, H, true);
        hair.wrapS = hair.wrapT = THREE.ClampToEdgeWrapping;
        const hairNormal = HillBoyMaps.normals(height, W, H, 3, 1, false);
        return { hair, hairNormal };
    }

    // Plain knitting: columns of V stitches (16 across, 20 up a 6 cm tile), each leg of a V a raised lobe of yarn
    // twisted across, the gaps between them dark; a little heather in the wool
    static knit() {
        const N = 256, data = new Uint8Array(N * N * 4), height = new Float32Array(N * N), cols = 16, rows = 20;
        const n = HillBoyMaps.noise(41, 64), f = HillBoyMaps.noise(42, 128);
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
            const cx = (x + 0.5) / N * cols, cy = (y + 0.5) / N * rows;
            const fx = cx - Math.floor(cx), fy = cy - Math.floor(cy);
            // Each leg: an ellipse leaning in to the V's foot (the V points down, v up the garment)
            let h = 0;
            for (const side of [-1, 1]) {
                const ox = fx - (0.5 + side * 0.23), oy = fy - 0.55;
                const a = side * 0.55, rx = Math.cos(a) * ox - Math.sin(a) * oy, ry = Math.sin(a) * ox + Math.cos(a) * oy;
                const d = (rx / 0.22) ** 2 + (ry / 0.52) ** 2;
                if (d < 1) h = Math.max(h, Math.sqrt(1 - d) * (0.85 + 0.15 * Math.sin((ry * 18) + side)));
            }
            const fibre = (f(x / N * 128, y / N * 128) - 0.5) * 0.25;
            h = Math.max(0, h + fibre * 0.4);
            height[y * N + x] = h;
            const heather = 0.92 + 0.16 * (n(x / N * 64, y / N * 64) - 0.5) + fibre * 0.3;
            const shade = (0.82 + 0.18 * Math.min(1, h * 1.3)) * heather;
            const i = (y * N + x) * 4;
            data[i] = HillBoyMaps.clamp(236 * shade); data[i + 1] = HillBoyMaps.clamp(234 * shade); data[i + 2] = HillBoyMaps.clamp(228 * shade); data[i + 3] = 255;
        }
        const tileM = 0.06;
        return { knit: HillBoyMaps.texture(data, N, N, true, 1 / tileM), knitNormal: HillBoyMaps.normals(height, N, N, 2, 1 / tileM) };
    }

    // A wool twill with tweed's flecks: the diagonal ribs of the weave, flecks of lighter, darker and warmer wool
    static wool() {
        const N = 256, data = new Uint8Array(N * N * 4), height = new Float32Array(N * N);
        const n = HillBoyMaps.noise(51, 64), rand = HillBoyMaps.random(52);
        const flecks = [];
        for (let i = 0; i < 520; i++) flecks.push([rand() * N, rand() * N, 1 + rand() * 2.5, rand() < 0.5 ? 1.35 : rand() < 0.5 ? 0.6 : 1.15, rand() < 0.25]);
        const tone = new Float32Array(N * N * 3).fill(1);
        for (const [fx, fy, r, k, warm] of flecks) {
            for (let dy = -4; dy <= 4; dy++) for (let dx = -8; dx <= 8; dx++) {
                const d = (dx / (r * 2.2)) ** 2 + (dy / r) ** 2;
                if (d > 1) continue;
                const x = ((Math.round(fx + dx) % N) + N) % N, y = ((Math.round(fy + dy) % N) + N) % N, i = (y * N + x) * 3;
                const w = 1 - d;
                tone[i] *= 1 + (k * (warm ? 1.15 : 1) - 1) * w;
                tone[i + 1] *= 1 + (k - 1) * w;
                tone[i + 2] *= 1 + (k * (warm ? 0.85 : 1) - 1) * w;
            }
        }
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
            const rib = 0.5 + 0.5 * Math.sin((x + y) / N * Math.PI * 2 * 32);
            const thread = n(x / N * 64, y / N * 64);
            const h = rib * 0.4 + thread * 0.6;
            height[y * N + x] = h;
            const s = 0.8 + 0.1 * h + (thread - 0.5) * 0.12, i = (y * N + x) * 4, t = (y * N + x) * 3;
            data[i] = HillBoyMaps.clamp(228 * s * tone[t]); data[i + 1] = HillBoyMaps.clamp(224 * s * tone[t + 1]); data[i + 2] = HillBoyMaps.clamp(216 * s * tone[t + 2]); data[i + 3] = 255;
        }
        const tileM = 0.05;
        return { wool: HillBoyMaps.texture(data, N, N, true, 1 / tileM), woolNormal: HillBoyMaps.normals(height, N, N, 2.5, 1 / tileM) };
    }

    // The apron, the whole of it once (u across, v down from the band): a pale grey-cream linen, its weave and slubs,
    // its folds' valleys a little shaded (the same folds as HillBoyPieces.apron), flour dust over its upper part, grime
    // towards the hem, and the hem frayed: the cloth ends raggedly and loose threads hang below it (alpha)
    static linen() {
        const W = 512, H = 768, data = new Uint8Array(W * H * 4), height = new Float32Array(W * H);
        const n = HillBoyMaps.noise(61, 32), s1 = HillBoyMaps.noise(62, 256), s2 = HillBoyMaps.noise(63, 128), rand = HillBoyMaps.random(64);
        const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
        const edge = new Float32Array(W), threads = new Float32Array(W);
        for (let x = 0; x < W; x++) { edge[x] = 0.972 + 0.014 * n(x / W * 32, 3.5) + 0.006 * rand(); threads[x] = rand() < 0.16 ? 0.978 + rand() * 0.02 : 0; }
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const u = (x + 0.5) / W, v = (y + 0.5) / H, a = (u - 0.5) * 2;
            const weave = (x % 2 === y % 2 ? 0.55 : 0.45) + (s1(x / W * 256, y / H * 8) - 0.5) * 0.4 + (s2(x / W * 4, y / H * 128) - 0.5) * 0.3;
            height[y * W + x] = weave;
            const valley = 0.5 - 0.5 * Math.sin(a * 5.2 + 0.8 + v * 1.4);
            const k = 0.95 + (weave - 0.5) * 0.08 - 0.12 * valley * (0.25 + 0.75 * v) - 0.08 * Math.pow(Math.sin(a * 13), 2) * sm(0.12, 0.0, v);
            const flour = sm(0.62, 0.8, n(u * 9, v * 14)) * sm(0.7, 0.1, v);
            const grime = sm(0.5, 1.0, v) * (0.12 + 0.1 * n(u * 12 + 7, v * 20));
            let c = [190 * k, 182 * k, 166 * k];
            c = c.map(q => q + (238 - q) * flour * 0.5);
            c = [c[0] * (1 - grime), c[1] * (1 - grime * 1.05), c[2] * (1 - grime * 1.2)];
            let alpha = v < edge[x] ? 1 : 0;
            if (!alpha && threads[x] && v < threads[x]) alpha = 1;
            const i = (y * W + x) * 4;
            data[i] = HillBoyMaps.clamp(c[0]); data[i + 1] = HillBoyMaps.clamp(c[1]); data[i + 2] = HillBoyMaps.clamp(c[2]); data[i + 3] = alpha * 255;
        }
        const linen = HillBoyMaps.texture(data, W, H, true);
        linen.wrapS = linen.wrapT = THREE.ClampToEdgeWrapping;
        const linenNormal = HillBoyMaps.normals(height, W, H, 0.9, 1, false);
        return { linen, linenNormal };
    }

    // The boots laid flat: below v 0.62 each leg round (u 0.5 its front), from the ankle up to the turned-over top;
    // from v 0.64 the foot (u 0.5 its top), from the heel to the toe. Black leather a little brown where it has worn,
    // creased across the ankle, scuffed at the toe; laced up the front through iron eyelets, the laces crossing; the
    // toe cap's seam. Its roughness (green) shinier where it is worn and polished by wear
    static leather() {
        const N = 512, data = new Uint8Array(N * N * 4), height = new Float32Array(N * N), rough = new Uint8Array(N * N * 4);
        const n = HillBoyMaps.noise(71, 64), m = HillBoyMaps.noise(72, 256);
        const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
        const g = (x) => Math.exp(-x * x);
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
            const u = (x + 0.5) / N, v = (y + 0.5) / N, du = u - 0.5;
            const grain = (m(u * 256, v * 256) - 0.5);
            let c = [36 + 7 * grain, 32 + 5 * grain, 29 + 4 * grain], h = 0.5 + grain * 0.25, r = 0.55 + grain * 0.1;
            const wear = n(u * 18, v * 18);
            if (v < 0.62) {
                // The leg: the laces up the front from the ankle to near the top, the creases at the ankle
                const t = v / 0.62;
                const crease = Math.sin(t * 140 + n(u * 10, t * 4) * 6) * g((t - 0.2) / 0.12);
                h += crease * 0.35;
                r -= Math.max(0, crease) * 0.15;
                const lacing = sm(0.08, 0.1, t) * sm(0.93, 0.9, t);
                if (Math.abs(du) < 0.06 && lacing > 0) {
                    // The tongue under the laces, a little browner
                    c = c.map((q, i) => q + [10, 6, 2][i] * sm(0.06, 0.04, Math.abs(du)));
                    const pitch = 0.085, row = (t - 0.1) / pitch, fr = row - Math.floor(row);
                    // The eyelets each side
                    const ey = Math.hypot((Math.abs(du) - 0.042) / 0.008, (fr - 0.5) * pitch / 0.008);
                    if (ey < 1) { c = [70, 68, 64]; h = 0.9 - ey * 0.4; r = 0.35; }
                    // The laces crossing between them
                    const cross = Math.min(Math.abs(du - (fr - 0.5) * 0.084), Math.abs(du + (fr - 0.5) * 0.084));
                    if (cross < 0.006 && Math.abs(du) < 0.044) { c = [34, 27, 22]; h = 0.95 - cross * 30; r = 0.7; }
                }
                // The top's stitched band
                if (t > 0.93) { c = c.map(q => q * 0.85); if (Math.abs(((t - 0.955) * N * 0.62) % 1) < 0.1 && Math.abs(Math.sin(u * 220)) > 0.6) c = c.map(q => q * 1.4); }
            } else if (v < 0.985) {
                // The foot: the laces' last pairs over the instep, the toe cap's seam, the scuffs at the toe
                const t = (v - 0.64) / 0.34;
                if (Math.abs(du) < 0.05 && t > 0.24 && t < 0.52) {
                    const pitch = 0.09, row = (t - 0.24) / pitch, fr = row - Math.floor(row);
                    const ey = Math.hypot((Math.abs(du) - 0.032) / 0.007, (fr - 0.5) * pitch / 0.012);
                    if (ey < 1) { c = [70, 68, 64]; h = 0.9; r = 0.35; }
                    const cross = Math.min(Math.abs(du - (fr - 0.5) * 0.064), Math.abs(du + (fr - 0.5) * 0.064));
                    if (cross < 0.005 && Math.abs(du) < 0.034) { c = [34, 27, 22]; h = 0.95; r = 0.7; }
                }
                const seam = Math.abs(t - (0.74 - 0.12 * Math.cos(du * Math.PI * 2)));
                if (seam < 0.012) { h -= 0.3 * (1 - seam / 0.012); c = c.map(q => q * 0.8); }
                const scuff = sm(0.8, 1.0, t) * sm(0.45, 0.8, wear);
                c = c.map((q, i) => q + [42, 36, 30][i] * scuff);
                r -= 0.2 * sm(0.75, 1, t);
                // Creased over the joint of the toes
                h += 0.3 * Math.sin(t * 90) * g((t - 0.62) / 0.06);
            } else {
                c = [40, 34, 30];
            }
            // Worn browner here and there
            c = c.map((q, i) => q + [10, 6, 3][i] * sm(0.6, 0.9, wear));
            const i = y * N + x;
            height[i] = h;
            data[i * 4] = HillBoyMaps.clamp(c[0]); data[i * 4 + 1] = HillBoyMaps.clamp(c[1]); data[i * 4 + 2] = HillBoyMaps.clamp(c[2]); data[i * 4 + 3] = 255;
            rough[i * 4] = 0; rough[i * 4 + 1] = HillBoyMaps.clamp(r * 255); rough[i * 4 + 2] = 0; rough[i * 4 + 3] = 255;
        }
        const leather = HillBoyMaps.texture(data, N, N, true);
        const leatherRough = HillBoyMaps.texture(rough, N, N, false);
        const leatherNormal = HillBoyMaps.normals(height, N, N, 2.2, 1, false);
        for (const t of [leather, leatherRough, leatherNormal]) t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
        return { leather, leatherNormal, leatherRough };
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { HillBoyMaps };
