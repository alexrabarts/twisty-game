// The hill ride's last picture (js/hill/ride.js): a crusty bloomer on a worn bread board, one slice cut off and lying
// in front of it, a bread knife beside, crumbs. Built here, not from a file, and only when the ride reaches its end: the
// loaf a fine grid displaced by its own field (rounded, its base flattened, five deep slashes with torn raised edges, a
// split along one side where it rose), its maps drawn from the same field (the colour golden to deep brown with flour
// on top and pale cuts, the crust's crackle and the crumb's pores in the normal map, flour matte in the roughness); the
// crumb's air holes on the cut face and the slice; the board's grain and knife marks; the table behind going soft, as
// a short lens at this distance makes it. No mark, name or wrapper anywhere.
class HillLoaf {
    static get RULE() {
        return Object.freeze({
            // The loaf: half its length, width and height (m), where the slice was cut off (z), the slice's thickness
            halfM: 0.17, wideM: 0.105, highM: 0.12, cutZ: 0.105, sliceM: 0.016,
            // The slashes: how many, the first one's z, the gap between, their angle from straight across (rad), half
            // length, depth, opening and lip height (m)
            slashes: { count: 5, fromZ: -0.12, gapM: 0.055, angle: 0.45, halfM: 0.075, deepM: 0.013, openM: 0.0075, lipM: 0.006 },
            // The grid of the loaf (along, around), its maps' size
            grid: [240, 180], map: [1024, 512],
            board: [0.62, 0.035, 0.42], seed: 509
        });
    }

    // A value noise in 3D, 0 to 1, smooth, the same every time
    static noise(x, y, z) {
        const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
        const tx = x - fx, ty = y - fy, tz = z - fz;
        const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty), sz = tz * tz * (3 - 2 * tz);
        const h = (i, j, k) => {
            let n = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k, 2147483647);
            n = Math.imul(n ^ (n >>> 13), 1274126177);
            return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
        };
        const lerp = (a, b, t) => a + (b - a) * t;
        return lerp(
            lerp(lerp(h(fx, fy, fz), h(fx + 1, fy, fz), sx), lerp(h(fx, fy + 1, fz), h(fx + 1, fy + 1, fz), sx), sy),
            lerp(lerp(h(fx, fy, fz + 1), h(fx + 1, fy, fz + 1), sx), lerp(h(fx, fy + 1, fz + 1), h(fx + 1, fy + 1, fz + 1), sx), sy), sz);
    }

    static fbm(x, y, z, octaves = 4) {
        let sum = 0, amp = 0.5, total = 0;
        for (let i = 0; i < octaves; i++) {
            sum += HillLoaf.noise(x, y, z) * amp;
            total += amp;
            x *= 2.03; y *= 2.03; z *= 2.03;
            amp *= 0.5;
        }
        return sum / total;
    }

    // The distance to the nearest cell edge of a 3D Voronoi pattern (F2 - F1): the crust's crackle
    static cells(x, y, z) {
        const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
        let f1 = 9, f2 = 9;
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
            const cx = fx + i, cy = fy + j, cz = fz + k;
            const px = cx + HillLoaf.noise(cx * 7.1, cy * 7.1, cz * 7.1 + 1.3), py = cy + HillLoaf.noise(cx * 7.1 + 5.2, cy * 7.1, cz * 7.1), pz = cz + HillLoaf.noise(cx * 7.1, cy * 7.1 + 9.4, cz * 7.1);
            const d = Math.hypot(px - x, py - y, pz - z);
            if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
        }
        return f2 - f1;
    }

    // The loaf's undisplaced surface at (u along 0 to 1, t round 0 to 1, base edge to base edge over the top): its point
    // and its outward direction, into `out`
    static base(u, t, out) {
        const R = HillLoaf.RULE;
        const z = -R.halfM + u * (R.cutZ + R.halfM);
        const e = Math.abs(z) / R.halfM;
        const w = R.wideM * Math.sqrt(Math.max(0.02, 1 - e ** 5)), h = R.highM * Math.sqrt(Math.max(0.04, 1 - e ** 4));
        const a = t * Math.PI, c = Math.cos(a), s = Math.sin(a);
        // A rounded box in section, drawn in a little at the foot where it sat on the tray
        const x = w * Math.sign(c) * Math.abs(c) ** 0.7 * (1 - 0.07 * (1 - s) ** 4);
        const y = h * Math.abs(s) ** 0.8;
        let nx = x / (w * w), ny = y / (h * h), nz = Math.sign(z) * e ** 3 * 6;
        const l = Math.hypot(nx, ny, nz) || 1;
        out.x = x; out.y = y; out.z = z; out.nx = nx / l; out.ny = ny / l; out.nz = nz / l; out.w = w; out.h = h;
        return out;
    }

    // The field at a surface point `p` (HillLoaf.base): the displacement (m), how much of a cut it is (0 to 1), the
    // lips' rise, how high on the loaf (0 at the base, 1 on top). Writes `out`
    static field(p, out) {
        const S = HillLoaf.RULE.slashes;
        const top = Math.max(0, Math.min(1, p.y / p.h));
        let disp = 0.0025 * (HillLoaf.fbm(p.x * 25, p.y * 25, p.z * 25) - 0.5) * 2 + 0.0008 * (HillLoaf.noise(p.x * 140, p.y * 140, p.z * 140) - 0.5);
        let cut = 0, lip = 0;
        const ca = Math.cos(S.angle), sa = Math.sin(S.angle);
        const onTop = Math.max(0, Math.min(1, (top - 0.45) / 0.25));
        for (let i = 0; i < S.count; i++) {
            const zc = S.fromZ + i * S.gapM;
            const dz = p.z - zc;
            const along = p.x * ca + dz * sa, q = -p.x * sa + dz * ca;
            const ends = 1 - Math.max(0, Math.min(1, (Math.abs(along) - S.halfM * 0.6) / (S.halfM * 0.4)));
            const reach = ends * onTop;
            if (reach <= 0) continue;
            // Torn: the opening and the lips waver along the cut
            const tear = HillLoaf.noise(along * 90 + i * 11, i * 3.1, 0.5);
            const open = S.openM * (0.75 + 0.5 * tear) * (0.4 + 0.6 * ends);
            const groove = Math.exp(-((q / open) ** 2));
            const ear = Math.exp(-(((q - 1.5 * open) / (0.8 * open)) ** 2)) * (0.6 + 0.8 * HillLoaf.noise(along * 60, i, 2.2));
            const other = Math.exp(-(((q + 1.5 * open) / (0.8 * open)) ** 2)) * 0.45;
            disp += reach * (-S.deepM * groove + S.lipM * (ear + other));
            cut = Math.max(cut, reach * Math.exp(-((q / (open * 1.15)) ** 2)));
            lip = Math.max(lip, reach * (ear + other));
        }
        // The split where it rose: a tear along the +x side, a little over halfway up
        if (p.x > 0) {
            const q2 = (top - 0.5 - 0.06 * (HillLoaf.noise(p.z * 30, 1.7, 0) - 0.5)) / 0.045;
            const span = Math.max(0, Math.min(1, (0.13 - Math.abs(p.z + 0.02)) / 0.04));
            const split = Math.exp(-q2 * q2) * span;
            disp += -0.004 * split + 0.0025 * Math.exp(-((q2 + 1.6) ** 2)) * span;
            cut = Math.max(cut, split * 0.75);
        }
        out.disp = disp; out.cut = cut; out.lip = lip; out.top = top;
        return out;
    }

    static build(anisotropy = 8) {
        const R = HillLoaf.RULE;
        const group = new THREE.Group();
        group.name = 'hill-loaf';
        const loaf = HillLoaf.loafMesh(anisotropy);
        loaf.position.y = R.board[1];
        group.add(loaf);
        const crumbMaps = HillLoaf.crumbMaps(anisotropy);
        // The slice lying flat on the board in front of the cut face, a little turned
        const slice = HillLoaf.slice(crumbMaps);
        slice.position.set(0.05, R.board[1] + R.sliceM, R.cutZ + 0.1);
        slice.rotation.set(-Math.PI / 2, 0, 0.35);
        group.add(slice);
        group.add(HillLoaf.board(anisotropy));
        const knife = HillLoaf.knife();
        knife.position.set(-0.19, R.board[1] + 0.001, 0.04);
        knife.rotation.y = -0.3;
        group.add(knife);
        group.add(HillLoaf.crumbs());
        group.add(HillLoaf.table(anisotropy));
        group.add(HillLoaf.backdrop());
        group.traverse(o => {
            if (o.isMesh) {
                o.castShadow = !o.userData.flat;
                o.receiveShadow = true;
            }
        });
        return group;
    }

    // The loaf itself: its grid displaced by the field, its back end closed, its cut face of crumb with a crust rim
    static loafMesh(anisotropy) {
        const R = HillLoaf.RULE;
        const [NU, NT] = R.grid;
        const p = {}, f = {};
        const positions = [], uvs = [], index = [];
        for (let i = 0; i <= NU; i++) {
            for (let j = 0; j <= NT; j++) {
                const u = i / NU, t = j / NT;
                HillLoaf.base(u, t, p);
                HillLoaf.field(p, f);
                // Near the base edges the displacement dies away, so the foot stays flat
                const d = f.disp * Math.min(1, f.top * 6);
                positions.push(p.x + p.nx * d, p.y + p.ny * d, p.z + p.nz * d);
                uvs.push(u, t);
            }
        }
        const row = NT + 1;
        for (let i = 0; i < NU; i++) for (let j = 0; j < NT; j++) {
            const a = i * row + j, b = a + row;
            index.push(a, b, a + 1, b, b + 1, a + 1);
        }
        // The flat base between the two foot edges, and the back end closed
        for (let i = 0; i < NU; i++) {
            const a = i * row, b = a + row;
            index.push(a, a + NT, b, b, a + NT, b + NT);
        }
        const centre = positions.length / 3;
        HillLoaf.base(0, 0.5, p);
        positions.push(0, p.y * 0.4, p.z);
        uvs.push(0, 0.5);
        for (let j = 0; j < NT; j++) index.push(centre, j + 1, j);
        index.push(centre, 0, NT);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setIndex(index);
        geometry.computeVertexNormals();
        const maps = HillLoaf.crustMaps(anisotropy);
        const crust = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
            map: maps.map, normalMap: maps.normalMap, normalScale: new THREE.Vector2(1.2, 1.2), roughnessMap: maps.roughnessMap, roughness: 1, metalness: 0, side: THREE.DoubleSide
        }));
        crust.name = 'hill-loaf-crust';
        const group = new THREE.Group();
        group.add(crust);
        // The cut face: the last ring of the grid, filled with crumb and a dark rim of crust
        const face = HillLoaf.face((j) => {
            const k = NU * row + j;
            return [positions[k * 3], positions[k * 3 + 1], positions[k * 3 + 2]];
        }, NT, 1);
        group.add(new THREE.Mesh(face, HillLoaf.crumbMaterial(HillLoaf.crumbMaps(anisotropy))));
        return group;
    }

    // A cut face from an outline of `count` + 1 points (the foot edge to the foot edge over the top, closed along the
    // base): crumb in the middle, the crust's dark rim round it; facing +z when `facing` is 1
    static face(outline, count, facing) {
        const ring = [];
        for (let j = 0; j <= count; j++) ring.push(outline(j));
        const cx = 0, cy = ring.reduce((n, q) => n + q[1], 0) / ring.length * 0.85, cz = ring[0][2];
        const positions = [cx, cy, cz], uvs = [0.5, 0.5], colours = [1, 1, 1], index = [];
        const W = Math.max(...ring.map(q => Math.abs(q[0]))) * 2, H = Math.max(...ring.map(q => q[1]));
        for (const [share, colour] of [[0.93, [1, 1, 1]], [0.985, [0.62, 0.42, 0.22]], [1, [0.36, 0.2, 0.08]]]) {
            for (const q of ring) {
                const x = cx + (q[0] - cx) * share, y = cy + (q[1] - cy) * share;
                positions.push(x, y, cz + 0.0005 * facing);
                uvs.push(x / W + 0.5, y / H);
                colours.push(...colour);
            }
        }
        const n = ring.length;
        for (let j = 0; j < n; j++) {
            const a = 1 + j, b = 1 + (j + 1) % n;
            if (facing > 0) index.push(0, a, b); else index.push(0, b, a);
            for (let k = 0; k < 2; k++) {
                const a0 = 1 + k * n + j, b0 = 1 + k * n + (j + 1) % n, a1 = a0 + n, b1 = b0 + n;
                if (facing > 0) index.push(a0, a1, b0, b0, a1, b1); else index.push(a0, b0, a1, b0, b1, a1);
            }
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
        geometry.setIndex(index);
        geometry.computeVertexNormals();
        return geometry;
    }

    static crumbMaterial(maps) {
        return new THREE.MeshStandardMaterial({ map: maps.map, normalMap: maps.normalMap, normalScale: new THREE.Vector2(1.4, 1.4), vertexColors: true, roughness: 0.95, metalness: 0 });
    }

    // The slice: the cut face's outline (with no slashes deep at that end) as a thin slab, crumb both sides, crust round
    static slice(maps) {
        const R = HillLoaf.RULE;
        const NT = 96, p = {};
        const outline = (j, z) => {
            HillLoaf.base(1, j / NT, p);
            return [p.x, p.y, z];
        };
        const group = new THREE.Group();
        const material = HillLoaf.crumbMaterial(maps);
        group.add(new THREE.Mesh(HillLoaf.face(j => outline(j, 0), NT, 1), material));
        group.add(new THREE.Mesh(HillLoaf.face(j => outline(j, -R.sliceM), NT, -1), material));
        // The crust round its edge
        const positions = [], index = [];
        for (let j = 0; j <= NT + 1; j++) {
            const q = outline(j % (NT + 1), 0);
            positions.push(q[0], q[1], 0, q[0], q[1], -R.sliceM);
        }
        for (let j = 0; j <= NT; j++) {
            const a = j * 2;
            index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }
        const rim = new THREE.BufferGeometry();
        rim.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        rim.setIndex(index);
        rim.computeVertexNormals();
        group.add(new THREE.Mesh(rim, new THREE.MeshStandardMaterial({ color: 0x8a4e20, roughness: 0.75, side: THREE.DoubleSide })));
        return group;
    }

    // A canvas texture
    static texture(canvas, srgb, anisotropy) {
        const t = new THREE.CanvasTexture(canvas);
        if (srgb) t.encoding = THREE.sRGBEncoding;
        t.anisotropy = anisotropy;
        return t;
    }

    // A normal map from a height array of `W` by `H`, `relief` its strength; `wrap` wraps the edges
    static normals(height, W, H, relief, wrap) {
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d'), img = ctx.createImageData(W, H);
        const at = (x, y) => {
            if (wrap) { x = (x + W) % W; y = (y + H) % H; } else { x = Math.max(0, Math.min(W - 1, x)); y = Math.max(0, Math.min(H - 1, y)); }
            return height[y * W + x];
        };
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const sx = (at(x + 1, y) - at(x - 1, y)) * relief, sy = (at(x, y + 1) - at(x, y - 1)) * relief;
            const l = Math.hypot(sx, sy, 1), i = (y * W + x) * 4;
            img.data[i] = (0.5 - 0.5 * sx / l) * 255;
            img.data[i + 1] = (0.5 + 0.5 * sy / l) * 255;
            img.data[i + 2] = (0.5 + 0.5 / l) * 255;
            img.data[i + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
        return canvas;
    }

    // The crust's maps in the loaf's (u, t) space, drawn from the field: colour, normal and roughness
    static crustMaps(anisotropy) {
        const [W, H] = HillLoaf.RULE.map;
        const colour = document.createElement('canvas'), rough = document.createElement('canvas');
        colour.width = rough.width = W;
        colour.height = rough.height = H;
        const cc = colour.getContext('2d'), rc = rough.getContext('2d');
        const ci = cc.createImageData(W, H), ri = rc.createImageData(W, H);
        const height = new Float32Array(W * H);
        const p = {}, f = {};
        const mix = (a, b, k) => a + (b - a) * k;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            // The canvas's top row is the texture's t = 1 (flipY)
            HillLoaf.base(x / (W - 1), 1 - y / (H - 1), p);
            HillLoaf.field(p, f);
            const n = HillLoaf.fbm(p.x * 40, p.y * 40, p.z * 40, 3);
            // Baked: darker on top and on the lips, golden down the sides, pale in the cuts
            const bake = Math.max(0, Math.min(1, 0.25 + 0.5 * f.top + 1.2 * f.lip + 0.5 * (n - 0.5)));
            let r = mix(0.82, 0.4, bake), g = mix(0.55, 0.21, bake), b = mix(0.26, 0.07, bake);
            const cut = f.cut;
            r = mix(r, 0.9 + 0.05 * n, cut); g = mix(g, 0.72 + 0.06 * n, cut); b = mix(b, 0.45 + 0.05 * n, cut);
            // Flour on top, patchy, none in the cuts (it went on before the slashing)
            const flourNoise = HillLoaf.fbm(p.x * 14 + 3, p.y * 14, p.z * 14, 4);
            const flour = Math.max(0, Math.min(1, (flourNoise - 0.48) / 0.18)) * f.top ** 1.6 * (1 - cut) * (0.7 + 0.3 * HillLoaf.noise(p.x * 300, p.y * 300, p.z * 300));
            r = mix(r, 0.94, flour * 0.85); g = mix(g, 0.91, flour * 0.85); b = mix(b, 0.85, flour * 0.85);
            const i = (y * W + x) * 4;
            ci.data[i] = r * 255; ci.data[i + 1] = g * 255; ci.data[i + 2] = b * 255; ci.data[i + 3] = 255;
            const roughness = mix(mix(0.6, 0.85, cut), 0.97, flour);
            ri.data[i] = ri.data[i + 1] = ri.data[i + 2] = roughness * 255; ri.data[i + 3] = 255;
            // The crust crackled in small plates; pores in the cuts
            const crack = 1 - Math.min(1, HillLoaf.cells(p.x * 220, p.y * 220, p.z * 220) / 0.12);
            const pore = Math.max(0, (HillLoaf.noise(p.x * 700, p.y * 700, p.z * 700) - 0.62) / 0.38);
            height[y * W + x] = 0.4 * n - 0.35 * crack * (1 - cut) * (1 - flour * 0.6) - 0.6 * pore * cut;
        }
        cc.putImageData(ci, 0, 0);
        rc.putImageData(ri, 0, 0);
        return {
            map: HillLoaf.texture(colour, true, anisotropy),
            normalMap: HillLoaf.texture(HillLoaf.normals(height, W, H, 3, false), false, anisotropy),
            roughnessMap: HillLoaf.texture(rough, false, anisotropy)
        };
    }

    // The crumb: cream, open, its air holes of every size shaded inside
    static crumbMaps(anisotropy) {
        if (HillLoaf.crumbKept) return HillLoaf.crumbKept;
        const N = 512, rand = HillLane.random(HillLoaf.RULE.seed);
        const colour = new Float32Array(N * N * 3), height = new Float32Array(N * N);
        for (let i = 0; i < N * N; i++) {
            const x = i % N, y = Math.floor(i / N), n = HillLoaf.fbm(x * 0.05, y * 0.05, 0.3, 3);
            colour[i * 3] = 0.93 + 0.05 * n; colour[i * 3 + 1] = 0.85 + 0.05 * n; colour[i * 3 + 2] = 0.68 + 0.05 * n;
            height[i] = 0.5 + 0.2 * n;
        }
        for (let k = 0; k < 1400; k++) {
            const r = 1 + 9 * rand() ** 3, sx = r * (1 + rand() * 0.8), sy = r * (0.6 + rand() * 0.5), cx = rand() * N, cy = rand() * N, turn = rand() * Math.PI;
            const c = Math.cos(turn), s = Math.sin(turn);
            for (let dy = -Math.ceil(sx); dy <= sx; dy++) for (let dx = -Math.ceil(sx); dx <= sx; dx++) {
                const u = (dx * c + dy * s) / sx, v = (-dx * s + dy * c) / sy, d = u * u + v * v;
                if (d > 1.4) continue;
                const x = Math.round(cx + dx), y = Math.round(cy + dy);
                if (x < 0 || y < 0 || x >= N || y >= N) continue;
                const i = y * N + x;
                if (d < 1) {
                    // Inside the hole: deeper and darker, its upper edge lit
                    const shade = 0.55 + 0.25 * d + 0.15 * Math.max(0, v);
                    colour[i * 3] *= shade; colour[i * 3 + 1] *= shade; colour[i * 3 + 2] *= shade * 0.95;
                    height[i] = Math.min(height[i], 0.5 - 0.5 * (1 - d));
                } else height[i] += 0.05;
            }
        }
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = N;
        const ctx = canvas.getContext('2d'), img = ctx.createImageData(N, N);
        for (let i = 0; i < N * N; i++) {
            img.data[i * 4] = Math.min(255, colour[i * 3] * 255); img.data[i * 4 + 1] = Math.min(255, colour[i * 3 + 1] * 255);
            img.data[i * 4 + 2] = Math.min(255, colour[i * 3 + 2] * 255); img.data[i * 4 + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
        HillLoaf.crumbKept = { map: HillLoaf.texture(canvas, true, anisotropy), normalMap: HillLoaf.texture(HillLoaf.normals(height, N, N, 4, false), false, anisotropy) };
        return HillLoaf.crumbKept;
    }

    // Wood: grain along x warped by noise, the board's knife marks and its worn middle; `marks` how many cuts, `soft`
    // the share of the far side drawn soft (the table, out of focus)
    static wood(W, H, base, marks, soft, anisotropy) {
        const rand = HillLane.random(HillLoaf.RULE.seed + marks);
        const colour = document.createElement('canvas');
        colour.width = W;
        colour.height = H;
        const ctx = colour.getContext('2d'), img = ctx.createImageData(W, H);
        const height = new Float32Array(W * H);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const warp = HillLoaf.fbm(x * 0.004, y * 0.02, 0.7, 4) * 30;
            const ring = 0.5 + 0.5 * Math.sin((y + warp) * 0.35 + HillLoaf.noise(x * 0.01, y * 0.05, 2) * 4);
            const fine = HillLoaf.noise(x * 0.3, y * 2, 4.4);
            const worn = marks ? Math.exp(-(((x / W - 0.5) / 0.3) ** 2 + ((y / H - 0.5) / 0.35) ** 2)) * 0.12 : 0;
            const k = 0.8 + 0.22 * ring + 0.08 * fine + worn;
            const i = (y * W + x) * 4;
            img.data[i] = Math.min(255, base[0] * k); img.data[i + 1] = Math.min(255, base[1] * k); img.data[i + 2] = Math.min(255, base[2] * k); img.data[i + 3] = 255;
            height[y * W + x] = 0.3 * ring + 0.1 * fine;
        }
        ctx.putImageData(img, 0, 0);
        // The knife marks: short straight cuts every way, darker in the groove, a hair of light beside it
        for (let k = 0; k < marks; k++) {
            const x0 = W * (0.15 + 0.7 * rand()), y0 = H * (0.15 + 0.7 * rand()), a = rand() * Math.PI, len = 10 + rand() * 70;
            const x1 = x0 + Math.cos(a) * len, y1 = y0 + Math.sin(a) * len;
            ctx.strokeStyle = `rgba(40, 24, 12, ${0.25 + rand() * 0.3})`;
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
            ctx.strokeStyle = 'rgba(255, 230, 200, 0.12)';
            ctx.beginPath(); ctx.moveTo(x0 + 1, y0 + 1); ctx.lineTo(x1 + 1, y1 + 1); ctx.stroke();
            for (let s = 0; s <= len; s++) {
                const x = Math.round(x0 + Math.cos(a) * s), y = Math.round(y0 + Math.sin(a) * s);
                if (x >= 0 && y >= 0 && x < W && y < H) height[y * W + x] -= 0.5;
            }
        }
        if (soft > 0) {
            // The far side (the canvas's top) blurred more the further it is
            const sharp = document.createElement('canvas');
            sharp.width = W;
            sharp.height = H;
            sharp.getContext('2d').drawImage(colour, 0, 0);
            for (let band = 0; band < 8; band++) {
                const y0 = H * soft * band / 8, y1 = H * soft * (band + 1) / 8;
                ctx.save();
                ctx.beginPath();
                ctx.rect(0, y0, W, y1 - y0);
                ctx.clip();
                ctx.filter = `blur(${(8 - band) * 1.6}px)`;
                ctx.drawImage(sharp, 0, 0);
                ctx.restore();
            }
        }
        return { map: HillLoaf.texture(colour, true, anisotropy), normalMap: HillLoaf.texture(HillLoaf.normals(height, W, H, 2, false), false, anisotropy) };
    }

    static board(anisotropy) {
        const [w, h, d] = HillLoaf.RULE.board;
        const maps = HillLoaf.wood(1024, 700, [150, 104, 62], 220, 0, anisotropy);
        const edge = new THREE.MeshStandardMaterial({ color: 0x7a5232, roughness: 0.75 });
        const top = new THREE.MeshStandardMaterial({ map: maps.map, normalMap: maps.normalMap, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.72, metalness: 0 });
        const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [edge, edge, top, edge, edge, edge]);
        board.position.y = h / 2;
        board.name = 'hill-loaf-board';
        return board;
    }

    // The bread knife: a long blade with a scalloped edge, a rounded tip, on a wooden handle with three rivets
    static knife() {
        const group = new THREE.Group();
        const shape = new THREE.Shape();
        const L = 0.22, H = 0.026;
        shape.moveTo(0, 0);
        for (let x = 0; x < L - 0.02; x += 0.006) shape.quadraticCurveTo(x + 0.003, -0.0022, x + 0.006, 0);
        shape.quadraticCurveTo(L + 0.004, 0.002, L - 0.008, H * 0.8);
        shape.lineTo(0, H);
        shape.lineTo(0, 0);
        const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.0016, bevelEnabled: false, curveSegments: 4 }),
            new THREE.MeshStandardMaterial({ color: 0xc4c8cc, metalness: 0.9, roughness: 0.28 }));
        blade.rotation.x = -Math.PI / 2;
        group.add(blade);
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.018, 0.026), new THREE.MeshStandardMaterial({ color: 0x4a2e1c, roughness: 0.55 }));
        handle.position.set(-0.06, 0.009, -H / 2);
        group.add(handle);
        for (const x of [-0.025, -0.06, -0.095]) {
            const rivet = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.0185, 10), new THREE.MeshStandardMaterial({ color: 0xb8a070, metalness: 0.8, roughness: 0.35 }));
            rivet.position.set(x, 0.009, -H / 2);
            group.add(rivet);
        }
        return group;
    }

    // Crumbs on the board, most by the slice and the knife
    static crumbs() {
        const rand = HillLane.random(HillLoaf.RULE.seed + 7), R = HillLoaf.RULE;
        const count = 80;
        const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), count);
        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
        for (let i = 0; i < count; i++) {
            const near = rand() < 0.6;
            const x = near ? 0.05 + (rand() - 0.5) * 0.2 : (rand() - 0.5) * 0.5, z = near ? R.cutZ + 0.1 + (rand() - 0.5) * 0.15 : (rand() - 0.5) * 0.36;
            const s = 0.0012 + rand() ** 2 * 0.0035;
            q.setFromEuler(e.set(rand() * 6, rand() * 6, rand() * 6));
            m.compose(new THREE.Vector3(x, R.board[1] + s * 0.6, z), q, new THREE.Vector3(s, s * 0.7, s * 1.2));
            mesh.setMatrixAt(i, m);
            mesh.setColorAt(i, c.setHex(rand() < 0.65 ? 0xe6d2a4 : 0x8a4e20));
        }
        mesh.name = 'hill-loaf-crumbs';
        return mesh;
    }

    // The table under the board: dark old wood, going soft towards the back
    static table(anisotropy) {
        const maps = HillLoaf.wood(1024, 1024, [70, 48, 32], 0, 0.55, anisotropy);
        const table = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.MeshStandardMaterial({ map: maps.map, roughness: 0.7 }));
        table.rotation.x = -Math.PI / 2;
        table.userData.flat = true;
        table.name = 'hill-loaf-table';
        return table;
    }

    // Behind, out of focus: a warm dark room with the soft discs of a bright window's light
    static backdrop() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        const g = ctx.createLinearGradient(0, 0, 0, 256);
        g.addColorStop(0, '#1c130c');
        g.addColorStop(1, '#3a2617');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 512, 256);
        const rand = HillLane.random(HillLoaf.RULE.seed + 3);
        ctx.filter = 'blur(10px)';
        for (let i = 0; i < 14; i++) {
            ctx.fillStyle = `rgba(255, ${190 + Math.round(rand() * 40)}, 130, ${0.12 + rand() * 0.2})`;
            ctx.beginPath();
            ctx.arc(300 + rand() * 200, 40 + rand() * 120, 12 + rand() * 26, 0, Math.PI * 2);
            ctx.fill();
        }
        const texture = HillLoaf.texture(canvas, true, 1);
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.6), new THREE.MeshBasicMaterial({ map: texture }));
        plane.position.set(-0.9, 0.5, -1.1);
        plane.rotation.y = 0.6;
        plane.userData.flat = true;
        plane.name = 'hill-loaf-backdrop';
        return plane;
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { HillLoaf };
