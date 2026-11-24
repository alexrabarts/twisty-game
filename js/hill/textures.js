// The hill ride's surfaces (js/hill/scene.js): every wall and roof finish drawn once on a canvas from the seed, as a
// colour map and a tangent-space normal map from its height, each tiling over `metres` of the surface (the UVs of the
// village are in metres). The colours are near white and grey: each building's own colour comes from its vertex colour,
// which the map multiplies. Made once a page and shared.
class HillTextures {
    // Each finish: the metres one copy covers, the canvas size, and its relief (the normal map's strength)
    static get KINDS() {
        return Object.freeze({
            dressed: { metres: 2.4, size: 512, relief: 3 },
            rubble: { metres: 2.4, size: 512, relief: 4 },
            render: { metres: 3.2, size: 512, relief: 1 },
            brick: { metres: 1.72, size: 512, relief: 3 },
            thatch: { metres: 2, size: 512, relief: 5 },
            slate: { metres: 1.6, size: 512, relief: 4 },
            tile: { metres: 1.2, size: 512, relief: 4 },
            door: { metres: 1, size: 256, relief: 4 },
            grass: { metres: 2, size: 256, relief: 1 }
        });
    }

    static all(anisotropy = 8) {
        if (HillTextures.made) return HillTextures.made;
        const made = {};
        for (const [name, kind] of Object.entries(HillTextures.KINDS)) made[name] = HillTextures.make(name, kind, anisotropy);
        HillTextures.made = made;
        return made;
    }

    // One finish: draws its colour and height on two canvases, the normal map from the height
    static make(name, kind, anisotropy) {
        const N = kind.size;
        const colour = new Float32Array(N * N * 3).fill(0.85);
        const height = new Float32Array(N * N).fill(0.5);
        const rand = HillLane.random(name.length * 977 + name.charCodeAt(0));
        const put = (x, y, h, c) => {
            const xi = ((x % N) + N) % N, yi = ((y % N) + N) % N, i = yi * N + xi;
            height[i] = h;
            if (c) { colour[i * 3] = c[0]; colour[i * 3 + 1] = c[1]; colour[i * 3 + 2] = c[2]; }
        };
        // A block (a stone, a brick, a slate) from (x0, y0) of size w, h px: a raised face with a rounded edge, its own tone
        const block = (x0, y0, w, h, tone, raise = 0.75, round = 0.25) => {
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const ex = Math.min(x, w - 1 - x) / (w * round), ey = Math.min(y, h - 1 - y) / (h * round);
                    const edge = Math.min(1, ex, ey);
                    const grain = (rand() - 0.5) * 0.08;
                    put(x0 + x, y0 + y, 0.2 + raise * Math.sqrt(edge) + grain * 0.3, tone.map(v => Math.max(0, Math.min(1, v + grain))));
                }
            }
        };
        const grey = (base, spread) => { const v = base + (rand() - 0.5) * spread; const w = (rand() - 0.5) * spread * 0.4; return [v + w, v, v - w]; };
        const mortar = [0.62, 0.6, 0.55];
        if (name === 'dressed') {
            for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) put(x, y, 0.15, mortar);
            const rows = 9;
            for (let r = 0; r < rows; r++) {
                const h = N / rows;
                let x = r % 2 ? -N / 12 : 0;
                while (x < N) {
                    const w = N / 6 * (0.7 + rand() * 0.6);
                    block(Math.round(x) + 2, Math.round(r * h) + 2, Math.round(w) - 3, Math.round(h) - 3, grey(0.86, 0.18), 0.7, 0.12);
                    x += w;
                }
            }
        } else if (name === 'rubble') {
            for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) put(x, y, 0.1, [0.6, 0.57, 0.52]);
            for (let i = 0; i < 260; i++) {
                const w = 18 + rand() * 46, h = 12 + rand() * 26, x = rand() * N, y = rand() * N, tone = grey(0.82, 0.3);
                for (let dy = -h; dy < h; dy++) for (let dx = -w; dx < w; dx++) {
                    const d = (dx / w) ** 2 + (dy / h) ** 2 + (rand() - 0.5) * 0.15;
                    if (d < 1) put(Math.round(x + dx), Math.round(y + dy), 0.25 + 0.7 * Math.sqrt(1 - Math.min(1, d)), tone);
                }
            }
        } else if (name === 'render') {
            // Lime render: soft, uneven, with stains running down from the top and patches where it has worn
            for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
                const n = 0.5 + 0.04 * Math.sin(x * 0.05 + Math.sin(y * 0.03) * 3) + (rand() - 0.5) * 0.04;
                put(x, y, n, [0.93, 0.92, 0.88].map(v => v + (n - 0.5) * 0.6));
            }
            for (let i = 0; i < 26; i++) {
                const x = rand() * N, len = 40 + rand() * 200, w = 3 + rand() * 10, dark = 0.06 + rand() * 0.1;
                for (let y = 0; y < len; y++) for (let dx = -w; dx < w; dx++) {
                    const i2 = ((Math.round(y) % N) * N + ((Math.round(x + dx + Math.sin(y * 0.1) * 2) % N) + N) % N) * 3;
                    const k = dark * (1 - y / len) * (1 - Math.abs(dx) / w);
                    colour[i2] -= k; colour[i2 + 1] -= k * 0.95; colour[i2 + 2] -= k * 0.85;
                }
            }
        } else if (name === 'brick') {
            for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) put(x, y, 0.15, [0.82, 0.8, 0.74]);
            const rows = 24, cols = 8;
            for (let r = 0; r < rows; r++) for (let c = -1; c < cols; c++) {
                const w = N / cols, h = N / rows, x = c * w + (r % 2 ? w / 2 : 0);
                const t = 0.75 + (rand() - 0.5) * 0.25;
                block(Math.round(x) + 1, Math.round(r * h) + 1, Math.round(w) - 2, Math.round(h) - 2, [t + 0.05, t * 0.62, t * 0.48], 0.6, 0.15);
            }
        } else if (name === 'thatch') {
            // Reed laid in courses: fine strands down the slope, darker in the shadow under each course
            for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) put(x, y, 0.5, [0.7, 0.62, 0.5]);
            for (let i = 0; i < 9000; i++) {
                const x = rand() * N, y = rand() * N, len = 10 + rand() * 30, tone = 0.55 + rand() * 0.4;
                for (let k = 0; k < len; k++) put(Math.round(x + k * 0.08), Math.round(y + k), 0.45 + rand() * 0.4, [tone * 0.95, tone * 0.85, tone * 0.68]);
            }
            const courses = 8;
            for (let c = 0; c < courses; c++) {
                const y0 = Math.round((c + 1) * N / courses) - 6;
                for (let y = 0; y < 6; y++) for (let x = 0; x < N; x++) {
                    const i = (((y0 + y) % N) * N + x);
                    height[i] *= 0.5 + y * 0.06;
                    colour[i * 3] *= 0.7; colour[i * 3 + 1] *= 0.7; colour[i * 3 + 2] *= 0.7;
                }
            }
        } else if (name === 'slate' || name === 'tile') {
            const rows = name === 'slate' ? 8 : 10, cols = name === 'slate' ? 6 : 8;
            for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) put(x, y, 0.1, [0.3, 0.3, 0.3]);
            for (let r = 0; r < rows; r++) for (let c = -1; c < cols; c++) {
                const w = N / cols, h = N / rows, x = c * w + (r % 2 ? w / 2 : 0);
                const t = name === 'slate' ? 0.7 + (rand() - 0.5) * 0.2 : 0.8 + (rand() - 0.5) * 0.25;
                // Each laid over the one below: thick at its foot, thin at its head
                for (let y = 0; y < h - 1; y++) for (let xx = 1; xx < w - 1; xx++) {
                    const f = y / h;
                    put(Math.round(x + xx), Math.round(r * h + y), 0.25 + 0.65 * f, [t, t * (name === 'tile' ? 0.95 : 1), t * (name === 'tile' ? 0.9 : 1.02)].map(v => v + (rand() - 0.5) * 0.05));
                }
            }
        } else if (name === 'door') {
            // Four panels in a frame: stiles and rails proud, the panels sunk with a moulded edge
            for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) put(x, y, 0.8, [0.9, 0.9, 0.9]);
            for (const [px, py] of [[0.14, 0.08], [0.56, 0.08], [0.14, 0.52], [0.56, 0.52]]) {
                const x0 = Math.round(px * N), y0 = Math.round(py * N), w = Math.round(0.3 * N), h = Math.round(0.38 * N);
                for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                    const e = Math.min(x, w - 1 - x, y, h - 1 - y) / 8;
                    put(x0 + x, y0 + y, 0.8 - 0.5 * Math.min(1, e), [0.84, 0.84, 0.84]);
                }
            }
        } else if (name === 'grass') {
            for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
                const t = 0.75 + (rand() - 0.5) * 0.35;
                put(x, y, 0.4 + rand() * 0.3, [t * 0.85, t, t * 0.7]);
            }
        }
        const colourCanvas = document.createElement('canvas'), normalCanvas = document.createElement('canvas');
        colourCanvas.width = colourCanvas.height = normalCanvas.width = normalCanvas.height = N;
        const cc = colourCanvas.getContext('2d'), nc = normalCanvas.getContext('2d');
        const ci = cc.createImageData(N, N), ni = nc.createImageData(N, N);
        const h = (x, y) => height[(((y % N) + N) % N) * N + (((x % N) + N) % N)];
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
            const i = y * N + x;
            ci.data[i * 4] = Math.max(0, Math.min(255, colour[i * 3] * 255));
            ci.data[i * 4 + 1] = Math.max(0, Math.min(255, colour[i * 3 + 1] * 255));
            ci.data[i * 4 + 2] = Math.max(0, Math.min(255, colour[i * 3 + 2] * 255));
            ci.data[i * 4 + 3] = 255;
            const sx = (h(x + 1, y) - h(x - 1, y)) * kind.relief, sy = (h(x, y + 1) - h(x, y - 1)) * kind.relief;
            const l = Math.hypot(sx, sy, 1);
            ni.data[i * 4] = (0.5 - 0.5 * sx / l) * 255;
            ni.data[i * 4 + 1] = (0.5 - 0.5 * sy / l) * 255;
            ni.data[i * 4 + 2] = (0.5 + 0.5 / l) * 255;
            ni.data[i * 4 + 3] = 255;
        }
        cc.putImageData(ci, 0, 0);
        nc.putImageData(ni, 0, 0);
        const texture = (canvas, srgb) => {
            const t = new THREE.CanvasTexture(canvas);
            if (srgb) t.encoding = THREE.sRGBEncoding;
            t.wrapS = t.wrapT = THREE.RepeatWrapping;
            t.flipY = false;
            t.repeat.set(1 / kind.metres, 1 / kind.metres);
            t.anisotropy = anisotropy;
            return t;
        };
        return { map: texture(colourCanvas, true), normalMap: texture(normalCanvas, false) };
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { HillTextures };
