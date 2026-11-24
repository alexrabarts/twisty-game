// The hill ride's village as drawn (js/hill/ride.js), from the lane's data (js/hill/lane.js): the cobbled lane, the flags
// and the terraces of cottages stepping down both sides, low walls in their gaps, the roofs of the lower village and
// the vale beyond in a warm haze. Everything is built here from the seed, the same on every load. Shapes of one finish
// are joined into one mesh (HillMesh), so the whole village is a few dozen draws.
class HillMesh {
    constructor() {
        this.position = [];
        this.normal = [];
        this.color = [];
        this.uv = [];
    }

    // A flat quad a-b-c-d (counter-clockwise seen from its front), one colour, with UVs as given
    quad(a, b, c, d, colour, uvs = [[0, 0], [1, 0], [1, 1], [0, 1]]) {
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
        const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const l = Math.hypot(nx, ny, nz) || 1;
        nx /= l; ny /= l; nz /= l;
        for (const [i, p] of [[0, a], [1, b], [2, c], [0, a], [2, c], [3, d]]) {
            this.position.push(p[0], p[1], p[2]);
            this.normal.push(nx, ny, nz);
            this.color.push(colour[0], colour[1], colour[2]);
            this.uv.push(uvs[i][0], uvs[i][1]);
        }
    }

    tri(a, b, c, colour) {
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
        const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const l = Math.hypot(nx, ny, nz) || 1;
        for (const p of [a, b, c]) {
            this.position.push(p[0], p[1], p[2]);
            this.normal.push(nx / l, ny / l, nz / l);
            this.color.push(colour[0], colour[1], colour[2]);
            this.uv.push(0, 0);
        }
    }

    // A box on a frame: `o` its centre, `ax`, `ay`, `az` its half-extents as vectors (any directions)
    box(o, ax, ay, az, colour, faces = 'all') {
        const c = (sx, sy, sz) => [o[0] + ax[0] * sx + ay[0] * sy + az[0] * sz, o[1] + ax[1] * sx + ay[1] * sy + az[1] * sz, o[2] + ax[2] * sx + ay[2] * sy + az[2] * sz];
        const p = { a: c(-1, -1, -1), b: c(1, -1, -1), c: c(1, 1, -1), d: c(-1, 1, -1), e: c(-1, -1, 1), f: c(1, -1, 1), g: c(1, 1, 1), h: c(-1, 1, 1) };
        this.quad(p.e, p.f, p.g, p.h, colour);
        this.quad(p.b, p.a, p.d, p.c, colour);
        this.quad(p.f, p.b, p.c, p.g, colour);
        this.quad(p.a, p.e, p.h, p.d, colour);
        this.quad(p.h, p.g, p.c, p.d, colour);
        if (faces === 'all') this.quad(p.a, p.b, p.f, p.e, colour);
    }

    mesh(material) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.position, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normal, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.color, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
        geometry.computeBoundingSphere();
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        return mesh;
    }
}

class HillScene {
    // Colours (sRGB hex), from the light of a low winter sun through haze
    static get COLOURS() {
        // Light walls by the owner's word: pale stone, honey stone, cream, blush and lime render
        return Object.freeze({
            stone: 0xd2cbbd, honey: 0xdccdaa, cream: 0xe8e0cc, blush: 0xe4d8cc, lime: 0xefede6,
            thatch: 0x6e6455, tile: 0x7e5e4e, slate: 0x5d636b,
            coping: 0xcfc6b4, gardenWall: 0xd6ccb8, flags: 0xb3ab9c, kerb: 0x9a9384, step: 0xbdb4a2, sill: 0xd8d0be,
            frame: 0xf1ede3, glass: 0xc8ccd0, lit: 0x8a6a42, iron: 0x26262a, pot: 0xa0684a,
            doors: [0x3e5a44, 0x7a2e2a, 0x2e4058, 0x5a4430, 0x2c2c2e],
            field: [0x7d8d52, 0x6a7a44, 0x8a9a5e, 0x748448, 0x93a066], tree: 0x4c5636,
            haze: 0xc8c0ae
        });
    }

    static rgb(hex) {
        const c = new THREE.Color(hex);
        // Vertex colours are read linear
        c.convertSRGBToLinear();
        return [c.r, c.g, c.b];
    }

    // The cobbles' maps, baked from the lane's one height field (HillLane.field, the same the bicycle rides over) over a
    // tile: the stones' colours (each its own grey or brown, a little darker towards its edge, the mortar dark), a
    // tangent-space normal map from the field's slopes, an occlusion that darkens the gaps, and a roughness that keeps
    // the stones matte with a slight sheen on their worn tops. Returns { map, normalMap, aoMap, roughnessMap }
    static cobbleTextures(lane, anisotropy = 8) {
        const C = HillLane.COBBLES;
        const width = lane.rule.halfWidthM * 2;
        const W = 1536, H = Math.round(W * C.tileM / width / 4) * 4;
        const height = new Float32Array(W * H);
        const stoneRow = new Int16Array(W * H), stoneCol = new Int16Array(W * H);
        const out = {};
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                const i = y * W + x;
                height[i] = HillLane.field((x + 0.5) / W, (y + 0.5) / H, width, out);
                stoneRow[i] = out.row;
                stoneCol[i] = out.col;
            }
        }
        const canvas = (draw) => {
            const c = document.createElement('canvas');
            c.width = W;
            c.height = H;
            const ctx = c.getContext('2d');
            const image = ctx.createImageData(W, H);
            draw(image.data);
            ctx.putImageData(image, 0, 0);
            return c;
        };
        const at = (x, y) => height[((y + H) % H) * W + Math.max(0, Math.min(W - 1, x))];
        // Metres a pixel spans, across and along, and the field's height in metres
        const px = width / W, py = C.tileM / H;
        const colour = canvas(d => {
            for (let i = 0; i < W * H; i++) {
                const h = height[i];
                let r, g, b;
                if (stoneRow[i] < 0) {
                    r = 62; g = 54; b = 44;
                } else {
                    const tone = HillLane.stone(stoneRow[i], stoneCol[i], 6), warm = HillLane.stone(stoneRow[i], stoneCol[i], 7);
                    const shade = (0.6 + 0.55 * tone) * (0.8 + 0.2 * Math.min(1, h * 2.2));
                    r = (120 + warm * 40) * shade; g = (112 + warm * 26) * shade; b = (100 + warm * 10) * shade;
                }
                d[i * 4] = Math.min(255, r); d[i * 4 + 1] = Math.min(255, g); d[i * 4 + 2] = Math.min(255, b); d[i * 4 + 3] = 255;
            }
        });
        const normal = canvas(d => {
            for (let y = 0; y < H; y++) {
                for (let x = 0; x < W; x++) {
                    const i = y * W + x;
                    const sx = (at(x + 1, y) - at(x - 1, y)) * C.upM / (2 * px);
                    const sy = (at(x, y + 1) - at(x, y - 1)) * C.upM / (2 * py);
                    const l = Math.hypot(sx, sy, 1);
                    d[i * 4] = (0.5 - 0.5 * sx / l) * 255;
                    d[i * 4 + 1] = (0.5 - 0.5 * sy / l) * 255;
                    d[i * 4 + 2] = (0.5 + 0.5 / l) * 255;
                    d[i * 4 + 3] = 255;
                }
            }
        });
        // Occlusion in red, roughness in green (three reads each from its own channel)
        const packed = canvas(d => {
            for (let i = 0; i < W * H; i++) {
                const h = height[i];
                const ao = 0.38 + 0.62 * Math.min(1, h / 0.35);
                const rough = h > 0.78 ? 0.6 + (0.92 - 0.6) * (1 - (h - 0.78) / 0.22) : 0.93;
                d[i * 4] = ao * 255; d[i * 4 + 1] = rough * 255; d[i * 4 + 2] = 0; d[i * 4 + 3] = 255;
            }
        });
        const texture = (c, srgb) => {
            const t = new THREE.CanvasTexture(c);
            if (srgb) t.encoding = THREE.sRGBEncoding;
            t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
            // Row y of the canvas is v = y / H, as the field was read
            t.flipY = false;
            t.anisotropy = anisotropy;
            return t;
        };
        const aoRough = texture(packed, false);
        return { map: texture(colour, true), normalMap: texture(normal, false), aoMap: aoRough, roughnessMap: aoRough };
    }

    // The vale's fields as a canvas: a patchwork of greens with dark hedges between
    static fieldTexture(seed) {
        const size = 1024;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const c = canvas.getContext('2d');
        const rand = HillLane.random(seed);
        const fields = HillScene.COLOURS.field;
        c.fillStyle = '#5e6c3e';
        c.fillRect(0, 0, size, size);
        for (let i = 0; i < 420; i++) {
            const x = rand() * size, y = rand() * size, w = 30 + rand() * 90, h = 24 + rand() * 70;
            c.save();
            c.translate(x, y);
            c.rotate((rand() - 0.5) * 0.7);
            c.fillStyle = `#${fields[Math.floor(rand() * fields.length)].toString(16).padStart(6, '0')}`;
            c.fillRect(-w / 2, -h / 2, w, h);
            c.strokeStyle = '#3f4a2c';
            c.lineWidth = 2.5;
            c.strokeRect(-w / 2, -h / 2, w, h);
            c.restore();
        }
        const map = new THREE.CanvasTexture(canvas);
        map.encoding = THREE.sRGBEncoding;
        map.anisotropy = 8;
        return map;
    }

    // Builds the village into a group: { group, posts, pots }. `options`: anisotropy for the cobbles' maps, ao false
    // to leave the cobbles' occlusion out (the low graphics levels)
    static build(lane, options = {}) {
        const C = HillScene.COLOURS, rgb = HillScene.rgb;
        const r = lane.rule;
        const group = new THREE.Group();
        group.name = 'hill-village';
        // Both sides drawn: the shapes are joined from quads of either winding, and three turns the normal of a back face
        const plain = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
        const meshes = { stone: new HillMesh(), roof: new HillMesh(), thatch: new HillMesh(), glass: new HillMesh(), dark: new HillMesh() };
        // Parts repeated many times are instanced: railing posts and chimney pots
        const repeats = { posts: [], pots: [] };
        const step = 1;

        // The lane: a ribbon over the cobbles, laid in the height field's tiles, each mirrored as HillLane.cobble reads it
        const cobbles = HillScene.cobbleTextures(lane, options.anisotropy || 8);
        const laneMesh = new HillMesh();
        const white = [1, 1, 1];
        const T = HillLane.COBBLES.tileM;
        for (let s = 0; s < r.lengthM; s += step) {
            const a0 = lane.at(s, -r.halfWidthM, 0, {}), a1 = lane.at(s, r.halfWidthM, 0, {});
            const b0 = lane.at(s + step, -r.halfWidthM, 0, {}), b1 = lane.at(s + step, r.halfWidthM, 0, {});
            const k = Math.floor((s + step / 2) / T), flip = HillLane.tileFlip(k);
            const along = t => (flip & 2 ? 1 - t : t);
            const across = u => (flip & 1 ? 1 - u : u);
            const v0 = along((s - k * T) / T), v1 = along((s + step - k * T) / T);
            laneMesh.quad([a0.x, a0.y, a0.z], [a1.x, a1.y, a1.z], [b1.x, b1.y, b1.z], [b0.x, b0.y, b0.z], white,
                [[across(0), v0], [across(1), v0], [across(1), v1], [across(0), v1]]);
        }
        const laneMaterial = new THREE.MeshStandardMaterial({
            map: cobbles.map, normalMap: cobbles.normalMap, normalScale: new THREE.Vector2(1, 1),
            aoMap: options.ao === false ? null : cobbles.aoMap, aoMapIntensity: 1, roughnessMap: cobbles.roughnessMap, roughness: 1, metalness: 0,
            vertexColors: true, side: THREE.DoubleSide
        });
        const surface = laneMesh.mesh(laneMaterial);
        // The occlusion map reads the second UV set in three r150
        surface.geometry.setAttribute('uv2', surface.geometry.attributes.uv);
        surface.name = 'hill-cobbles';
        surface.castShadow = false;
        group.add(surface);

        // The flags on both sides, a kerb at the lane's edge
        const stone = meshes.stone;
        const flags = rgb(C.flags), kerb = rgb(C.kerb);
        for (const side of [1, -1]) {
            const edge = side * r.halfWidthM, back = side * (r.halfWidthM + r.flagsM + 0.3);
            for (let s = Math.max(0, r.cottagesFromM); s < r.lengthM; s += step) {
                const a0 = lane.at(s, edge, 0.1, {}), a1 = lane.at(s + step, edge, 0.1, {});
                const b0 = lane.at(s, back, 0.1, {}), b1 = lane.at(s + step, back, 0.1, {});
                stone.quad([a0.x, a0.y, a0.z], [a1.x, a1.y, a1.z], [b1.x, b1.y, b1.z], [b0.x, b0.y, b0.z], flags);
                const e0 = lane.at(s, edge, 0, {}), e1 = lane.at(s + step, edge, 0, {});
                stone.quad([a0.x, a0.y, a0.z], [a1.x, a1.y, a1.z], [e1.x, e1.y, e1.z], [e0.x, e0.y, e0.z], kerb);
            }
        }
        for (const cottage of lane.cottages) HillScene.cottage(lane, cottage, meshes, repeats);
        // A low garden wall across each gap between cottages, on the line of their fronts
        for (const gap of lane.walls) HillScene.lowWall(lane, gap, stone);

        // The lower village: roofs below the end of the lane, scattered over the slope
        const rand = HillLane.random(r.seed + 23);
        // Down the hillside on the sun's side of the village, clear of the lane and its terraces
        const end = lane.sample(r.lengthM / 2), down = lane.sample((r.mainStraight.fromS + r.mainStraight.toS) / 2);
        for (let i = 0, placed = 0; i < 200 && placed < 46; i++) {
            const ahead = 40 + rand() * 320, aside = (rand() - 0.5) * 520;
            const x = end.x + down.alongX * ahead + down.leftX * aside, z = end.z + down.alongZ * ahead + down.leftZ * aside;
            if (HillScene.nearLane(lane, x, z) < 30) continue;
            placed++;
            const y = HillScene.groundY(lane, x, z);
            const wide = 6 + rand() * 6, deep = 5 + rand() * 3, turn = end.heading + (rand() < 0.5 ? 0 : Math.PI / 2) + (rand() - 0.5) * 0.3;
            HillScene.house(x, y, z, wide, deep, 4.2 + rand() * 1.5, turn, rand() < 0.4 ? 'thatch' : 'tile', [C.lime, C.stone, C.cream][Math.floor(rand() * 3)], meshes);
        }

        for (const [key, mesh] of Object.entries(meshes)) {
            if (!mesh.position.length) continue;
            // The panes mirror a sky of their own (HillScene.paneSky): the low sun's golden glow on the horizon, so a
            // pane facing it glints gold
            const material = key === 'glass' ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 1, envMap: HillScene.paneSky(options.sun), envMapIntensity: 1.4, side: THREE.DoubleSide })
                : key === 'dark' ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.2, side: THREE.DoubleSide })
                : key === 'thatch' ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide }) : plain;
            const built = mesh.mesh(material);
            built.name = `hill-${key}`;
            group.add(built);
        }
        const posts = HillScene.instanced(new THREE.BoxGeometry(0.035, 1, 0.035), C.iron, repeats.posts, 'hill-railing-posts');
        const pots = HillScene.instanced(new THREE.CylinderGeometry(0.11, 0.13, 1, 8), C.pot, repeats.pots, 'hill-chimney-pots');
        if (posts) group.add(posts);
        if (pots) group.add(pots);

        // The vale: the hillside and the fields falling away beyond the village, to low hills in the haze
        group.add(HillScene.vale(lane));
        group.add(HillScene.trees(lane));
        return { group, posts: repeats.posts.length, pots: repeats.pots.length };
    }

    // The sky the window panes mirror: an equirectangular map, pale overhead, a golden band on the horizon brightest
    // towards the sun (`sun`, the way to it; none gives a band all round), dark ground below
    static paneSky(sun) {
        const W = 128, H = 64;
        const data = new Float32Array(W * H * 4);
        const sunAz = sun ? Math.atan2(sun.x, sun.z) : 0;
        for (let y = 0; y < H; y++) {
            const v = (y + 0.5) / H;
            const elevation = (v - 0.5) * Math.PI;
            for (let x = 0; x < W; x++) {
                const az = (x + 0.5) / W * 2 * Math.PI - Math.PI;
                const toward = sun ? Math.pow(Math.max(0, Math.cos(az - sunAz)), 3) : 0.5;
                const band = Math.exp(-Math.pow(elevation / 0.12, 2));
                const sky = elevation > 0 ? [0.55, 0.57, 0.6] : [0.1, 0.09, 0.08];
                const glow = band * (0.25 + 2.6 * toward);
                const i = (y * W + x) * 4;
                data[i] = sky[0] + glow * 1.0;
                data[i + 1] = sky[1] + glow * 0.72;
                data[i + 2] = sky[2] + glow * 0.38;
                data[i + 3] = 1;
            }
        }
        const texture = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType);
        texture.mapping = THREE.EquirectangularReflectionMapping;
        texture.magFilter = texture.minFilter = THREE.LinearFilter;
        texture.needsUpdate = true;
        return texture;
    }

    // One InstancedMesh of `geometry` at each of `matrices`
    static instanced(geometry, hex, matrices, name) {
        if (!matrices.length) return null;
        const material = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.8, metalness: 0.1 });
        const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
        matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.name = name;
        return mesh;
    }

    static shade(hex, by) {
        const c = new THREE.Color(hex);
        return c.multiplyScalar(by).getHex();
    }

    // A low wall across a gap: stepped down the lane a section a metre, a coping along its top
    static lowWall(lane, gap, stone) {
        const C = HillScene.COLOURS, rgb = HillScene.rgb;
        const r = lane.rule;
        const across = gap.side * (r.halfWidthM + r.flagsM + 0.15);
        for (let s = gap.from; s < gap.to - 0.05; s += 1) {
            const e = Math.min(s + 1, gap.to);
            const mid = lane.sample((s + e) / 2);
            const at = lane.at((s + e) / 2, across, 0, {});
            const low = Math.min(lane.sample(s).y, lane.sample(e).y) - 0.3;
            const top = mid.y + (gap.upM || r.lowWallUpM);
            const half = (e - s) / 2 + 0.01;
            stone.box([at.x, (low + top) / 2, at.z], [mid.alongX * half, 0, mid.alongZ * half], [0, (top - low) / 2, 0], [mid.leftX * 0.15, 0, mid.leftZ * 0.15], rgb(C.gardenWall));
            stone.box([at.x, top + 0.05, at.z], [mid.alongX * (half + 0.02), 0, mid.alongZ * (half + 0.02)], [0, 0.05, 0], [mid.leftX * 0.2, 0, mid.leftZ * 0.2], rgb(C.coping));
        }
    }

    // One cottage, from its data (HillLane.placeCottages): walls in stone or render with a plinth and, for stone,
    // quoins; a pitched roof with overhang and ridge in thatch, tile or slate; a chimney with pots; a framed door with
    // a step and a fanlight, now and then a porch; sash windows with sills and lintels; a gutter and a drainpipe; and at
    // the front flags, railings or a low garden wall
    static cottage(lane, c, meshes, repeats) {
        const C = HillScene.COLOURS, rgb = HillScene.rgb, shade = HillScene.shade;
        const r = lane.rule;
        const A = [c.alongX, 0, c.alongZ], O = [c.outX, 0, c.outZ];
        const pt = (along, rise, out) => [c.x + c.alongX * along + c.outX * out, rise, c.z + c.alongZ * along + c.outZ * out];
        const vec = (along, up, out) => [A[0] * along + O[0] * out, up, A[2] * along + O[2] * out];
        const box = (mesh, along, rise, out, ha, hu, ho, colour) => mesh.box(pt(along, rise, out), vec(ha, 0, 0), [0, hu, 0], vec(0, 0, ho), colour);
        const hw = c.hw, hd = c.hd;
        const wallHex = C[c.wall];
        const wall = rgb(wallHex);
        const face = -hd;

        // The walls, a plinth along the front, quoins at the front corners of a stone cottage
        box(meshes.stone, 0, (c.foot + c.eaves) / 2, 0, hw, (c.eaves - c.foot) / 2, hd, wall);
        box(meshes.stone, 0, (c.foot + c.floor + 0.3) / 2, face - 0.03, hw + 0.02, (c.floor + 0.3 - c.foot) / 2, 0.04, rgb(shade(wallHex, 0.72)));
        if (c.quoins && (c.wall === 'stone' || c.wall === 'honey')) {
            const quoin = rgb(shade(wallHex, 1.08));
            let k = 0;
            for (let y = c.floor + 0.3; y < c.eaves - 0.25; y += 0.32, k++) {
                const w = k % 2 === 0 ? 0.2 : 0.13;
                for (const end of [-1, 1]) box(meshes.stone, end * (hw - w), y + 0.14, face - 0.02, w, 0.14, 0.03, quoin);
            }
        }

        // The roof: along the lane, eaves to the front and back; or a gable to the lane
        const over = c.roof === 'thatch' ? 0.5 : 0.3;
        const thick = c.roof === 'thatch' ? 0.38 : 0.09;
        const roofHex = C[c.roof];
        const roofMesh = c.roof === 'thatch' ? meshes.thatch : meshes.roof;
        const roof = rgb(roofHex);
        const slab = (lowAlong, lowOut, lowY, highAlong, highOut, highY, span, spanAxis) => {
            // A slab from its low edge to the ridge, `span` either side along spanAxis ('along' or 'out')
            const mid = pt((lowAlong + highAlong) / 2, (lowY + highY) / 2, (lowOut + highOut) / 2);
            const down = vec((highAlong - lowAlong) / 2, (highY - lowY) / 2, (highOut - lowOut) / 2);
            const across = spanAxis === 'along' ? vec(span, 0, 0) : vec(0, 0, span);
            // Up from the slab: the cross of its run with its span, turned to point up
            const len = Math.hypot(...down);
            let nx = down[1] * across[2] - down[2] * across[1], ny = down[2] * across[0] - down[0] * across[2], nz = down[0] * across[1] - down[1] * across[0];
            const nl = Math.hypot(nx, ny, nz) || 1;
            const sign = ny < 0 ? -1 : 1;
            nx *= sign * thick / 2 / nl; ny *= sign * thick / 2 / nl; nz *= sign * thick / 2 / nl;
            roofMesh.box([mid[0] + nx, mid[1] + ny, mid[2] + nz], across, [nx, ny, nz], down.map(v => v * (len + 0.02) / len), roof);
        };
        const eaveY = c.eaves - (c.roof === 'thatch' ? 0.3 : 0.05);
        if (!c.gable) {
            for (const side of [-1, 1]) slab(0, side * (hd + over), eaveY - over * 0.45, 0, 0, c.ridge, hw + over * 0.6, 'along');
            for (const end of [-1, 1]) {
                meshes.stone.tri(pt(end * hw, c.eaves, -hd), pt(end * hw, c.eaves, hd), pt(end * hw, c.ridge - 0.15, 0), wall);
                meshes.stone.tri(pt(end * hw, c.eaves, hd), pt(end * hw, c.eaves, -hd), pt(end * hw, c.ridge - 0.15, 0), wall);
            }
            // The ridge: a thatch's rounded roll, or ridge tiles
            if (c.roof === 'thatch') box(roofMesh, 0, c.ridge + 0.12, 0, hw + over * 0.6, 0.2, 0.3, rgb(shade(roofHex, 0.85)));
            else box(roofMesh, 0, c.ridge + 0.06, 0, hw + over * 0.6, 0.08, 0.12, rgb(shade(roofHex, 0.8)));
            // The gutter along the front eaves, the drainpipe down one corner
            if (c.roof !== 'thatch') box(meshes.dark, 0, eaveY - over * 0.45 - 0.04, -(hd + over * 0.8), hw + over * 0.5, 0.045, 0.06, rgb(C.iron));
        } else {
            for (const side of [-1, 1]) slab(side * (hw + over), 0, eaveY - over * 0.45, 0, 0, c.ridge, hd + over * 0.6, 'out');
            for (const end of [-1, 1]) {
                meshes.stone.tri(pt(-hw, c.eaves, end * hd), pt(hw, c.eaves, end * hd), pt(0, c.ridge - 0.15, end * hd), wall);
                meshes.stone.tri(pt(hw, c.eaves, end * hd), pt(-hw, c.eaves, end * hd), pt(0, c.ridge - 0.15, end * hd), wall);
            }
            box(roofMesh, 0, c.ridge + 0.06, 0, 0.12, 0.08, hd + over * 0.6, rgb(shade(roofHex, 0.8)));
        }
        box(meshes.dark, c.pipe * (hw - 0.18), (c.floor + eaveY) / 2, face - 0.07, 0.04, (eaveY - c.floor) / 2, 0.04, rgb(C.iron));

        // The chimney on one end with its pots
        if (c.chimney) {
            const along = c.gable ? 0 : c.chimney * (hw - 0.55);
            const out = c.gable ? c.chimney * (hd - 0.6) : 0;
            const base = c.gable ? c.eaves : c.ridge - 0.6;
            const top = c.ridge + 1.1;
            box(meshes.stone, along, (base + top) / 2, out, 0.45, (top - base) / 2, 0.32, rgb(shade(wallHex, 0.9)));
            box(meshes.stone, along, top + 0.05, out, 0.5, 0.06, 0.37, rgb(C.coping));
            const m = new THREE.Matrix4();
            for (const k of [-1, 1]) {
                const p = pt(along + k * 0.2, top + 0.3, out);
                repeats.pots.push(m.clone().compose(new THREE.Vector3(p[0], p[1], p[2]), new THREE.Quaternion(), new THREE.Vector3(1, 0.45, 1)));
            }
        }

        // The door: frame, door, fanlight, step, and now and then a porch
        const doorAt = -hw + c.wide * c.door;
        const doorHex = C.doors[c.doorColour];
        box(meshes.stone, doorAt, c.floor + 1.1, face - 0.03, 0.55, 1.12, 0.04, rgb(C.frame));
        box(meshes.dark, doorAt, c.floor + 0.98, face - 0.06, 0.45, 0.98, 0.03, rgb(doorHex));
        box(meshes.glass, doorAt, c.floor + 2.07, face - 0.06, 0.42, 0.1, 0.03, rgb(C.glass));
        box(meshes.stone, doorAt, c.floor - 0.06, face - 0.3, 0.62, 0.12, 0.3, rgb(C.step));
        if (c.porch) {
            const y = c.floor + 2.45;
            for (const k of [-1, 1]) {
                box(meshes.stone, doorAt + k * 0.65, c.floor + 1.2, face - 0.85, 0.05, 1.2, 0.05, rgb(C.frame));
                // Its little pitched roof, each side a slab from the eave to the ridge over the door
                const eave = pt(doorAt + k * 0.85, y, face - 0.5), ridge = pt(doorAt, y + 0.45, face - 0.5);
                roofMesh.box([(eave[0] + ridge[0]) / 2, (eave[1] + ridge[1]) / 2 + 0.03, (eave[2] + ridge[2]) / 2], vec(0, 0, 0.55),
                    [0, 0.03, 0], [(ridge[0] - eave[0]) / 2, (ridge[1] - eave[1]) / 2, (ridge[2] - eave[2]) / 2], roof);
            }
        }

        // Sash windows on each storey: a white frame, two sashes of panes, a stone sill and a lintel
        const windows = Math.max(1, Math.floor(c.wide / 2.3));
        const frame = rgb(C.frame), sill = rgb(C.sill), glass = rgb(C.glass), lit = rgb(C.lit);
        for (let storey = 0; storey < c.storeys; storey++) {
            const y = c.floor + 1.55 + storey * 2.1;
            for (let i = 0; i < windows; i++) {
                const along = -hw + (i + 0.5) * c.wide / windows;
                if (storey === 0 && Math.abs(along - doorAt) < 1.15) continue;
                if (Math.abs(along) > hw - 0.55) continue;
                box(meshes.stone, along, y, face - 0.02, 0.44, 0.62, 0.025, frame);
                box(meshes.glass, along, y, face - 0.035, 0.38, 0.56, 0.02, c.lit && storey === 0 ? lit : glass);
                // The meeting rail, the bars of each sash
                box(meshes.stone, along, y, face - 0.05, 0.38, 0.03, 0.015, frame);
                box(meshes.stone, along, y, face - 0.05, 0.016, 0.56, 0.015, frame);
                for (const k of [-1, 1]) box(meshes.stone, along, y + k * 0.28, face - 0.05, 0.38, 0.012, 0.012, frame);
                box(meshes.stone, along, y - 0.68, face - 0.08, 0.52, 0.04, 0.1, sill);
                box(meshes.stone, along, y + 0.7, face - 0.03, 0.54, 0.07, 0.045, sill);
            }
        }

        // The front: flags only, railings, or a low garden wall, each open at the door
        const line = -(hd + r.flagsM - 0.15);
        if (c.front === 'railing') {
            const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 0.95, 1);
            for (let along = -hw + 0.1; along <= hw - 0.1; along += 0.26) {
                if (Math.abs(along - doorAt) < 0.7) continue;
                const p = pt(along, c.floor - 0.1 + 0.475, line);
                repeats.posts.push(m.clone().compose(new THREE.Vector3(p[0], p[1], p[2]), q, s));
            }
            for (const [from, to] of [[-hw + 0.1, doorAt - 0.7], [doorAt + 0.7, hw - 0.1]]) {
                if (to - from < 0.3) continue;
                box(meshes.dark, (from + to) / 2, c.floor + 0.88, line, (to - from) / 2, 0.025, 0.025, rgb(C.iron));
            }
        } else if (c.front === 'garden') {
            const low = c.foot + 0.3;
            for (const [from, to] of [[-hw, doorAt - 0.7], [doorAt + 0.7, hw]]) {
                if (to - from < 0.3) continue;
                box(meshes.stone, (from + to) / 2, (low + c.floor + 0.75) / 2, line, (to - from) / 2, (c.floor + 0.75 - low) / 2, 0.15, rgb(C.gardenWall));
                box(meshes.stone, (from + to) / 2, c.floor + 0.8, line, (to - from) / 2 + 0.02, 0.05, 0.19, rgb(C.coping));
            }
        }
    }

    // A plain house of the lower village
    static house(x, y, z, wide, deep, eaves, turn, roofKind, wallHex, meshes) {
        const rgb = HillScene.rgb, C = HillScene.COLOURS;
        const A = [Math.sin(turn), 0, Math.cos(turn)], L = [Math.cos(turn), 0, -Math.sin(turn)];
        const hw = wide / 2, hd = deep / 2;
        const pt = (along, rise, across) => [x + A[0] * along + L[0] * across, rise, z + A[2] * along + L[2] * across];
        const wall = rgb(wallHex);
        meshes.stone.box([x, y + eaves / 2 - 1, z], [A[0] * hw, 0, A[2] * hw], [0, eaves / 2 + 1, 0], [L[0] * hd, 0, L[2] * hd], wall);
        const ridge = y + eaves + 2.4, top = y + eaves;
        const roof = roofKind === 'thatch' ? meshes.thatch : meshes.roof;
        const tone = rgb(roofKind === 'thatch' ? C.thatch : C.tile);
        for (const side of [-1, 1]) roof.quad(pt(-hw - 0.3, top, side * (hd + 0.4)), pt(hw + 0.3, top, side * (hd + 0.4)), pt(hw + 0.3, ridge, 0), pt(-hw - 0.3, ridge, 0), tone);
        for (const end of [-1, 1]) {
            meshes.stone.tri(pt(end * hw, top, -hd), pt(end * hw, top, hd), pt(end * hw, ridge - 0.1, 0), wall);
            meshes.stone.tri(pt(end * hw, top, hd), pt(end * hw, top, -hd), pt(end * hw, ridge - 0.1, 0), wall);
        }
        meshes.stone.box(pt(hw - 0.6, ridge + 0.5, 0), [A[0] * 0.35, 0, A[2] * 0.35], [0, 0.9, 0], [L[0] * 0.3, 0, L[2] * 0.3], rgb(HillScene.shade(wallHex, 0.9)));
    }

    // The ground's height at (x, z): under the village well below the lane (the grid is coarse, the lane steep), and
    // out past the cottages the hillside the lane is cut into: it falls away towards the vale on the sun's side (the
    // sun lies down the main straight, over the vale, so no hill stands between it and the street) and rises on the
    // other, with low hills far off over the vale
    static groundY(lane, x, z) {
        const r = lane.rule;
        if (!lane.downhill) {
            const m = lane.sample((r.mainStraight.fromS + r.mainStraight.toS) / 2);
            lane.downhill = { x: m.alongX, z: m.alongZ };
        }
        let best = Infinity, near = lane.points[0];
        for (let i = 0; i < lane.points.length; i += 4) {
            const pnt = lane.points[i];
            const d = Math.hypot(x - pnt.x, z - pnt.z);
            if (d < best) { best = d; near = pnt; }
        }
        const ox = x - near.x, oz = z - near.z;
        const towards = best > 1e-6 ? (ox * lane.downhill.x + oz * lane.downhill.z) / best : 0;
        const out = Math.max(0, best - 14);
        const slope = towards > 0 ? -0.22 * towards : 0.3 * -towards;
        const fall = Math.max(-70, slope * out);
        const hills = 60 * HillScene.smooth((out * towards - 1100) / 700);
        const ripple = 3 * Math.sin(x * 0.011) * Math.cos(z * 0.009) + 1.5 * Math.sin(x * 0.031 + z * 0.017);
        return near.y - 3 + fall + hills + ripple * HillScene.smooth(out / 60);
    }

    static smooth(t) {
        const c = Math.max(0, Math.min(1, t));
        return c * c * (3 - 2 * c);
    }

    // The vale: one grid of ground round the village and out to the hills, the fields laid over it
    static vale(lane) {
        const size = 2400, n = 160;
        const mid = lane.sample(lane.rule.lengthM / 2), m = lane.sample((lane.rule.mainStraight.fromS + lane.rule.mainStraight.toS) / 2);
        const cx = mid.x + m.alongX * 500, cz = mid.z + m.alongZ * 500;
        const geometry = new THREE.PlaneGeometry(size, size, n, n);
        geometry.rotateX(-Math.PI / 2);
        const pos = geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i) + cx, z = pos.getZ(i) + cz;
            pos.setXYZ(i, x, HillScene.groundY(lane, x, z), z);
        }
        geometry.computeVertexNormals();
        const map = HillScene.fieldTexture(lane.rule.seed + 31);
        const material = new THREE.MeshStandardMaterial({ map, roughness: 1, metalness: 0 });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = 'hill-vale';
        mesh.receiveShadow = true;
        return mesh;
    }

    // Trees: round dark crowns along the hedges and the slopes, and some bare ones near the village
    static trees(lane) {
        const rand = HillLane.random(lane.rule.seed + 41);
        const end = lane.sample(lane.rule.lengthM / 2);
        const crown = new THREE.IcosahedronGeometry(1, 1);
        const material = new THREE.MeshStandardMaterial({ color: HillScene.COLOURS.tree, roughness: 1, flatShading: true });
        const count = 520;
        const trees = new THREE.InstancedMesh(crown, material, count);
        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), at = new THREE.Vector3();
        let placed = 0;
        for (let i = 0; i < count * 2 && placed < count; i++) {
            const ahead = -900 + rand() * 1800, aside = (rand() - 0.5) * 1800;
            const x = end.x + end.alongX * ahead + end.leftX * aside, z = end.z + end.alongZ * ahead + end.leftZ * aside;
            // Not on the lane, its path or the cottages
            const near = HillScene.nearLane(lane, x, z);
            if (near < 18) continue;
            const size = 2.5 + rand() * 3.5;
            at.set(x, HillScene.groundY(lane, x, z) + size * 0.9, z);
            s.set(size, size * (0.8 + rand() * 0.5), size);
            m.compose(at, q, s);
            trees.setMatrixAt(placed++, m);
        }
        trees.count = placed;
        trees.castShadow = true;
        trees.name = 'hill-trees';
        return trees;
    }

    static nearLane(lane, x, z) {
        let best = Infinity;
        for (let i = 0; i < lane.points.length; i += 3) best = Math.min(best, Math.hypot(x - lane.points[i].x, z - lane.points[i].z));
        return best;
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { HillScene, HillMesh };
