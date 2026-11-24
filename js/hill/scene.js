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

    // A flat quad a-b-c-d (counter-clockwise seen from its front), one colour, with UVs as given; with none, in metres
    // along a-b and a-d from where a stands, so a finish's texture runs on across the faces of one wall and its size is
    // its size in metres (HillTextures)
    quad(a, b, c, d, colour, uvs = null) {
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
        const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const l = Math.hypot(nx, ny, nz) || 1;
        nx /= l; ny /= l; nz /= l;
        if (!uvs) {
            const lu = Math.hypot(ux, uy, uz) || 1, lv = Math.hypot(vx, vy, vz) || 1;
            // The start of each run: where a lies along it, so neighbouring faces of one plane line up
            const u0 = (a[0] * ux + a[1] * uy + a[2] * uz) / lu, v0 = (a[0] * vx + a[1] * vy + a[2] * vz) / lv;
            uvs = [[u0, v0], [u0 + lu, v0], [u0 + lu, v0 + lv], [u0, v0 + lv]];
        }
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
        // In metres on the triangle's own plane: along a-b, and up it
        const lu = Math.hypot(ux, uy, uz) || 1;
        const ex = ux / lu, ey = uy / lu, ez = uz / lu;
        const fx = (ny * ez - nz * ey) / l, fy = (nz * ex - nx * ez) / l, fz = (nx * ey - ny * ex) / l;
        for (const p of [a, b, c]) {
            this.position.push(p[0], p[1], p[2]);
            this.normal.push(nx / l, ny / l, nz / l);
            this.color.push(colour[0], colour[1], colour[2]);
            this.uv.push(p[0] * ex + p[1] * ey + p[2] * ez, p[0] * fx + p[1] * fy + p[2] * fz);
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
        // Light walls by the owner's word: pale rubble and dressed stone, honey stone, cream, blush and lime render, and
        // brick (its colour is its texture's)
        return Object.freeze({
            rubble: 0xc9c5bb, dressed: 0xd5d0c5, honey: 0xd6ccb4, cream: 0xe4e0d6, blush: 0xe2d8cc, lime: 0xeeece6, brick: 0xd8d0cc, stone: 0xc9c5bb,
            thatch: 0x9c907a, tile: 0x9a7a68, slate: 0x727880,
            coping: 0xcfc6b4, gardenWall: 0xd6ccb8, flags: 0xc4beb2, kerb: 0xa8a294, step: 0xbdb4a2, sill: 0xd8d0be,
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
                    r = 70; g = 66; b = 60;
                } else {
                    // Grey stones, each its own tone, a few warmer, darker towards the edge
                    const tone = HillLane.stone(stoneRow[i], stoneCol[i], 8), warm = HillLane.stone(stoneRow[i], stoneCol[i], 9);
                    const shade = (0.62 + 0.5 * tone) * (0.78 + 0.22 * Math.min(1, h * 2.2));
                    r = (118 + warm * 18) * shade; g = (116 + warm * 11) * shade; b = (112 + warm * 3) * shade;
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
                // Matte, the worn tops a little less so; in wet patches the tops shine (the stills' wet stone)
                const x = i % W, y = Math.floor(i / W);
                const wet = Math.max(0, Math.sin(x / W * 6.283 * 1.3 + Math.sin(y / H * 6.283) * 2) * Math.sin(y / H * 6.283 * 0.9 + 1.1) - 0.35) / 0.65;
                const top = h > 0.6 ? Math.min(1, (h - 0.6) / 0.3) : 0;
                const rough = 0.93 - top * (0.25 + 0.4 * wet);
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

    // Builds the village into a group: { group, posts, pots }. `options`: anisotropy for the maps, ao false to leave
    // the cobbles' occlusion out (the low graphics levels), sun (the way to it) for the panes' glint
    static build(lane, options = {}) {
        const C = HillScene.COLOURS, rgb = HillScene.rgb;
        const r = lane.rule;
        const group = new THREE.Group();
        group.name = 'hill-village';
        const T = HillTextures.all(options.anisotropy || 8);
        // One mesh for each finish: every face of that finish in the village is one draw
        const meshes = {};
        for (const name of ['rubble', 'dressed', 'render', 'brick', 'thatch', 'slate', 'tile', 'trim', 'glass', 'dark', 'door', 'grass', 'plain']) meshes[name] = new HillMesh();
        // Parts repeated many times are instanced: railing posts, chimney pots, leaves and flowers, gravestones
        const repeats = { posts: [], pots: [], leaves: [], flowers: [], stones: [], trunks: [], bare: [] };
        const step = 1;

        // The lane: a ribbon over the cobbles, laid in the height field's tiles, each mirrored as HillLane.cobble reads it
        const cobbles = HillScene.cobbleTextures(lane, options.anisotropy || 8);
        const laneMesh = new HillMesh();
        const white = [1, 1, 1];
        const TM = HillLane.COBBLES.tileM;
        for (let s = 0; s < r.lengthM; s += step) {
            const a0 = lane.at(s, -r.halfWidthM, 0, {}), a1 = lane.at(s, r.halfWidthM, 0, {});
            const b0 = lane.at(s + step, -r.halfWidthM, 0, {}), b1 = lane.at(s + step, r.halfWidthM, 0, {});
            const k = Math.floor((s + step / 2) / TM), flip = HillLane.tileFlip(k);
            const along = t => (flip & 2 ? 1 - t : t);
            const across = u => (flip & 1 ? 1 - u : u);
            const v0 = along((s - k * TM) / TM), v1 = along((s + step - k * TM) / TM);
            laneMesh.quad([a0.x, a0.y, a0.z], [a1.x, a1.y, a1.z], [b1.x, b1.y, b1.z], [b0.x, b0.y, b0.z], white,
                [[across(0), v0], [across(1), v0], [across(1), v1], [across(0), v1]]);
        }
        const laneMaterial = new THREE.MeshStandardMaterial({
            map: cobbles.map, normalMap: cobbles.normalMap, normalScale: new THREE.Vector2(1, 1),
            aoMap: options.ao === false ? null : cobbles.aoMap, aoMapIntensity: 1, roughnessMap: cobbles.roughnessMap, roughness: 1, metalness: 0,
            vertexColors: true, side: THREE.DoubleSide
        });
        const surface = laneMesh.mesh(laneMaterial);
        surface.geometry.setAttribute('uv2', surface.geometry.attributes.uv);
        surface.name = 'hill-cobbles';
        surface.castShadow = false;
        group.add(surface);

        // The flags on both sides, a kerb at the lane's edge
        const flags = rgb(C.flags), kerb = rgb(C.kerb);
        for (const side of [1, -1]) {
            const edge = side * r.halfWidthM, back = side * (r.halfWidthM + r.flagsM + 0.3);
            for (let s = Math.max(0, r.cottagesFromM); s < r.lengthM; s += step) {
                // (a side road's mouth is open: its own surface meets the cobbles there)
                if (lane.sideRoads.some(m => m.side === side && m.kind !== 'steps' && s + step > m.from + 1e-6 && s < m.to - 1e-6)) continue;
                const a0 = lane.at(s, edge, 0.1, {}), a1 = lane.at(s + step, edge, 0.1, {});
                const b0 = lane.at(s, back, 0.1, {}), b1 = lane.at(s + step, back, 0.1, {});
                meshes.dressed.quad([a0.x, a0.y, a0.z], [a1.x, a1.y, a1.z], [b1.x, b1.y, b1.z], [b0.x, b0.y, b0.z], flags);
                const e0 = lane.at(s, edge, 0, {}), e1 = lane.at(s + step, edge, 0, {});
                meshes.dressed.quad([a0.x, a0.y, a0.z], [a1.x, a1.y, a1.z], [e1.x, e1.y, e1.z], [e0.x, e0.y, e0.z], kerb);
            }
        }
        for (const cottage of lane.cottages) HillScene.cottage(lane, cottage, meshes, repeats);
        // The backs and ends the lane's cameras see (HillLane.seenFaces) get the fronts' care; the rest stay plain
        const before = Object.values(meshes).reduce((n, m) => n + m.position.length, 0);
        const seen = lane.seenFaces();
        for (const cottage of lane.cottages) HillScene.rear(lane, cottage, meshes, repeats);
        HillScene.rearCost = { faces: seen, triangles: (Object.values(meshes).reduce((n, m) => n + m.position.length, 0) - before) / 9 };
        // The gaps: low walls, gardens behind a wall or a hedge (now and then a gate), the churchyard and its church
        for (const gap of lane.walls) HillScene.gap(lane, gap, meshes, repeats);
        if (lane.church) HillScene.church(lane, lane.church, meshes, repeats);
        for (const road of lane.sideRoads) HillScene.sideRoad(lane, road, meshes, repeats);
        HillScene.opening(lane, meshes, repeats);

        // The lower village: roofs down the hillside on the sun's side of the village, clear of the lane
        const rand = HillLane.random(r.seed + 23);
        const end = lane.sample(r.lengthM / 2), down = lane.sample((r.mainStraight.fromS + r.mainStraight.toS) / 2);
        for (let i = 0, placed = 0; i < 200 && placed < 46; i++) {
            const ahead = 40 + rand() * 320, aside = (rand() - 0.5) * 520;
            const x = end.x + down.alongX * ahead + down.leftX * aside, z = end.z + down.alongZ * ahead + down.leftZ * aside;
            if (HillScene.nearLane(lane, x, z) < 30) continue;
            placed++;
            const y = HillScene.groundY(lane, x, z);
            const wide = 6 + rand() * 6, deep = 5 + rand() * 3, turn = down.heading + (rand() < 0.5 ? 0 : Math.PI / 2) + (rand() - 0.5) * 0.3;
            HillScene.house(x, y, z, wide, deep, 4.2 + rand() * 1.5, turn, rand() < 0.4 ? 'thatch' : 'tile', [C.lime, C.rubble, C.cream][Math.floor(rand() * 3)], meshes);
            // A tree beside some of them, the bare ones as in the reference frames
            if (rand() < 0.5) HillScene.tree(repeats, x + (rand() - 0.5) * 16, y, z + (rand() - 0.5) * 16, 5 + rand() * 4, rand() < 0.45, rand);
        }

        // The finishes: each mesh with its texture (HillTextures) and its colour from the vertex colours
        const finish = {
            rubble: T.rubble, dressed: T.dressed, render: T.render, brick: T.brick, thatch: T.thatch, slate: T.slate, tile: T.tile, door: T.door, grass: T.grass
        };
        for (const [key, mesh] of Object.entries(meshes)) {
            if (!mesh.position.length) continue;
            let material;
            if (key === 'glass') {
                // The panes mirror a sky of their own (HillScene.paneSky): the low sun's golden glow on the horizon
                material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 1, envMap: HillScene.paneSky(options.sun), envMapIntensity: 1.4, side: THREE.DoubleSide });
            } else if (key === 'dark') {
                material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.2, side: THREE.DoubleSide });
            } else {
                const t = finish[key];
                material = new THREE.MeshStandardMaterial({
                    vertexColors: true, map: t ? t.map : null, normalMap: t ? t.normalMap : null, roughness: key === 'trim' ? 0.7 : 0.95, metalness: 0, side: THREE.DoubleSide
                });
            }
            const built = mesh.mesh(material);
            built.name = `hill-${key}`;
            group.add(built);
        }
        const posts = HillScene.instanced(new THREE.BoxGeometry(0.035, 1, 0.035), C.iron, repeats.posts, 'hill-railing-posts');
        const pots = HillScene.instanced(new THREE.CylinderGeometry(0.11, 0.13, 1, 8), C.pot, repeats.pots, 'hill-chimney-pots');
        const leaves = HillScene.instanced(new THREE.DodecahedronGeometry(1, 0), 0xffffff, repeats.leaves, 'hill-leaves', true);
        const flowers = HillScene.instanced(new THREE.IcosahedronGeometry(1, 0), 0xffffff, repeats.flowers, 'hill-flowers', true);
        const stones = HillScene.instanced(new THREE.BoxGeometry(1, 1, 1), 0xb8b2a6, repeats.stones, 'hill-gravestones');
        const trunks = HillScene.instanced(new THREE.CylinderGeometry(0.6, 1, 1, 6).translate(0, 0.5, 0), 0x4a4038, repeats.trunks, 'hill-trunks');
        const bare = HillScene.instanced(HillScene.bareTree(), 0x4a4038, repeats.bare, 'hill-bare-trees');
        for (const m of [posts, pots, leaves, flowers, stones, trunks, bare]) if (m) group.add(m);

        // The vale: the hillside and the fields falling away beyond the village, to low hills in the haze
        group.add(HillScene.vale(lane));
        group.add(HillScene.trees(lane));
        return { group, posts: repeats.posts.length, pots: repeats.pots.length };
    }

    // One InstancedMesh of `geometry` at each of `matrices` (each a Matrix4, or { m, colour } with `coloured`)
    static instanced(geometry, hex, matrices, name, coloured = false) {
        if (!matrices.length) return null;
        const material = new THREE.MeshStandardMaterial({ color: hex, roughness: coloured ? 0.9 : 0.8, metalness: coloured ? 0 : 0.1, flatShading: coloured });
        const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
        const colour = new THREE.Color();
        matrices.forEach((m, i) => {
            mesh.setMatrixAt(i, m.m || m);
            if (coloured) mesh.setColorAt(i, colour.setHex(m.colour));
        });
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.name = name;
        return mesh;
    }

    // A bare tree as one shape (a trunk and branches forking up and out, the twigs), a metre tall, for instancing
    static bareTree() {
        const parts = [];
        const rand = HillLane.random(311);
        const limb = (from, dir, length, radius, depth) => {
            const to = from.clone().addScaledVector(dir, length);
            const g = new THREE.CylinderGeometry(radius * 0.6, radius, length, 5);
            g.translate(0, length / 2, 0);
            g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
            g.translate(from.x, from.y, from.z);
            parts.push(g);
            if (depth === 0) return;
            for (let i = 0; i < 3; i++) {
                const a = rand() * Math.PI * 2, lift = 0.35 + rand() * 0.5;
                const d = dir.clone().multiplyScalar(0.6).add(new THREE.Vector3(Math.cos(a) * (1 - lift), lift, Math.sin(a) * (1 - lift))).normalize();
                limb(to, d, length * (0.55 + rand() * 0.2), radius * 0.6, depth - 1);
            }
        };
        limb(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), 0.42, 0.035, 2);
        const merged = HillScene.mergeGeometries(parts);
        return merged;
    }

    static mergeGeometries(parts) {
        const positions = [], normals = [];
        for (const g of parts) {
            const n = g.index ? g.toNonIndexed() : g;
            n.computeVertexNormals();
            positions.push(...n.attributes.position.array);
            normals.push(...n.attributes.normal.array);
        }
        const out = new THREE.BufferGeometry();
        out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        out.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        return out;
    }

    // A tree at (x, y, z), `height` m: a bare one (the reference frames' winter trees) or a leafy one
    static tree(repeats, x, y, z, height, bare, rand) {
        const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI * 2);
        if (bare) {
            repeats.bare.push(m.clone().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(height, height, height)));
            return;
        }
        repeats.trunks.push(m.clone().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(0.22, height * 0.5, 0.22)));
        const greens = [0x55693a, 0x4a5e34, 0x627646];
        for (let i = 0; i < 4; i++) {
            const r = height * (0.22 + rand() * 0.12);
            repeats.leaves.push({ m: m.clone().compose(new THREE.Vector3(x + (rand() - 0.5) * height * 0.4, y + height * (0.55 + rand() * 0.3), z + (rand() - 0.5) * height * 0.4), q, new THREE.Vector3(r, r * 0.85, r)), colour: greens[i % 3] });
        }
    }

    // A clump of leaves (a shrub, a hedge piece, ivy on a wall, a window box's plants) at a point, sized sx, sy, sz
    static leaf(repeats, at, sx, sy, sz, colour, turn = 0) {
        const m = new THREE.Matrix4().compose(new THREE.Vector3(at[0], at[1], at[2]), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), turn), new THREE.Vector3(sx, sy, sz));
        repeats.leaves.push({ m, colour });
    }

    static flower(repeats, at, size, colour) {
        const m = new THREE.Matrix4().compose(new THREE.Vector3(at[0], at[1], at[2]), new THREE.Quaternion(), new THREE.Vector3(size, size, size));
        repeats.flowers.push({ m, colour });
    }

    static shade(hex, by) {
        const c = new THREE.Color(hex);
        return c.multiplyScalar(by).getHex();
    }

    // The mesh of a wall finish, and its colour
    static wallOf(c, meshes) {
        const C = HillScene.COLOURS;
        const mesh = c.wall === 'brick' ? meshes.brick : c.wall === 'rubble' ? meshes.rubble : c.wall === 'dressed' || c.wall === 'honey' ? meshes.dressed : meshes.render;
        return { mesh, hex: C[c.wall] || C.rubble };
    }

    // A gap between buildings (HillLane.walls): a low wall stepped down the lane a section a metre; a garden behind a
    // wall or a hedge with a lawn, shrubs, flowers and a tree, now and then a gate; the churchyard behind its wall
    static gap(lane, gap, meshes, repeats) {
        const C = HillScene.COLOURS, rgb = HillScene.rgb;
        const r = lane.rule;
        const rand = HillLane.random(Math.round(gap.from * 31) + gap.side * 7);
        const front = gap.side * (r.halfWidthM + r.flagsM + 0.15);
        const hedge = gap.kind === 'garden' && rand() < 0.45;
        const gateAt = gap.gate ? gap.from + (gap.to - gap.from) * (0.3 + rand() * 0.4) : null;
        for (let s = gap.from; s < gap.to - 0.05; s += 1) {
            const e = Math.min(s + 1, gap.to);
            if (gateAt !== null && Math.abs((s + e) / 2 - gateAt) < 0.6) {
                // The gate: two stone piers and a wooden gate between, a little open
                const p = lane.sample(gateAt), at = lane.at(gateAt, front, 0, {});
                for (const k of [-0.65, 0.65]) meshes.dressed.box([at.x + p.alongX * k, at.y + 0.6, at.z + p.alongZ * k], [p.alongX * 0.15, 0, p.alongZ * 0.15], [0, 0.65, 0], [p.leftX * 0.18, 0, p.leftZ * 0.18], rgb(C.coping));
                meshes.plain.box([at.x, at.y + 0.55, at.z], [p.alongX * 0.48, 0, p.alongZ * 0.48], [0, 0.42, 0], [p.leftX * 0.025, 0, p.leftZ * 0.025], rgb(0x4a5a46));
                continue;
            }
            const mid = lane.sample((s + e) / 2);
            const at = lane.at((s + e) / 2, front, 0, {});
            const low = Math.min(lane.sample(s).y, lane.sample(e).y) - 0.3;
            const half = (e - s) / 2 + 0.01;
            if (hedge) {
                HillScene.leaf(repeats, [at.x, mid.y + 0.55, at.z], half * 1.1, 0.6, 0.35, [0x4a5e34, 0x55693a][Math.floor(rand() * 2)], mid.heading);
                continue;
            }
            const top = mid.y + (gap.upM || r.lowWallUpM);
            meshes.rubble.box([at.x, (low + top) / 2, at.z], [mid.alongX * half, 0, mid.alongZ * half], [0, (top - low) / 2, 0], [mid.leftX * 0.15, 0, mid.leftZ * 0.15], rgb(C.gardenWall));
            meshes.dressed.box([at.x, top + 0.05, at.z], [mid.alongX * (half + 0.02), 0, mid.alongZ * (half + 0.02)], [0, 0.05, 0], [mid.leftX * 0.2, 0, mid.leftZ * 0.2], rgb(C.coping));
        }
        if (gap.kind !== 'garden' && gap.kind !== 'churchyard') return;
        // The lawn behind, as deep as a cottage, with shrubs and flowers along its edges and a tree
        const deep = gap.kind === 'churchyard' ? r.church.backM + r.church.nave[1] + 4 : r.cottageDeepM;
        for (let s = gap.from; s < gap.to - 0.05; s += 1) {
            const e = Math.min(s + 1, gap.to);
            const f0 = lane.at(s, front + gap.side * 0.2, 0.12, {}), f1 = lane.at(e, front + gap.side * 0.2, 0.12, {});
            const b0 = lane.at(s, front + gap.side * deep, 0.12, {}), b1 = lane.at(e, front + gap.side * deep, 0.12, {});
            meshes.grass.quad([f0.x, f0.y, f0.z], [f1.x, f1.y, f1.z], [b1.x, b1.y, b1.z], [b0.x, b0.y, b0.z], rgb(0x7f9a5a));
        }
        if (gap.kind === 'churchyard') return;
        const greens = [0x4e6236, 0x5d7440, 0x445a30];
        const blooms = [0xc8463a, 0xe0c04a, 0xe8e2d8, 0x9a5aa0];
        for (let i = 0; i < 3 + Math.floor(rand() * 4); i++) {
            const s = gap.from + 0.5 + rand() * (gap.to - gap.from - 1);
            const a = lane.at(s, front + gap.side * (0.8 + rand() * (deep - 1.6)), 0.4, {});
            const size = 0.4 + rand() * 0.6;
            HillScene.leaf(repeats, [a.x, a.y, a.z], size, size * 0.8, size, greens[i % 3]);
            if (rand() < 0.6) for (let k = 0; k < 4; k++) HillScene.flower(repeats, [a.x + (rand() - 0.5) * size, a.y + size * 0.6, a.z + (rand() - 0.5) * size], 0.06, blooms[Math.floor(rand() * blooms.length)]);
        }
        if (gap.to - gap.from > 4 && rand() < 0.7) {
            const s = (gap.from + gap.to) / 2, a = lane.at(s, front + gap.side * (deep - 1.5), 0, {});
            HillScene.tree(repeats, a.x, a.y, a.z, 6 + rand() * 4, rand() < 0.5, rand);
        }
    }

    // The church, set back behind its churchyard: a nave of dressed stone under a slate roof, a square tower at its
    // front corner with a spire, tall windows, a door; gravestones and dark yews in the yard
    static church(lane, c, meshes, repeats) {
        const C = HillScene.COLOURS, rgb = HillScene.rgb;
        const R = lane.rule.church;
        const [length, deep, eavesUp, ridgeUp] = R.nave;
        const A = [c.alongX, 0, c.alongZ], O = [c.outX, 0, c.outZ];
        const pt = (along, rise, out) => [c.x + c.alongX * along + c.outX * out, rise, c.z + c.alongZ * along + c.outZ * out];
        const vec = (along, up, out) => [A[0] * along + O[0] * out, up, A[2] * along + O[2] * out];
        const stone = rgb(0xcfc8b8);
        const hw = c.hw, hd = c.hd, eaves = c.floor + eavesUp, ridge = c.floor + ridgeUp;
        meshes.dressed.box(pt(0, (c.foot + eaves) / 2, 0), vec(hw, 0, 0), [0, (eaves - c.foot) / 2, 0], vec(0, 0, hd), stone);
        for (const side of [-1, 1]) {
            const mid = pt(0, (eaves + ridge) / 2, side * hd / 2);
            const down = vec(0, (eaves - ridge) / 2, side * (hd + 0.4) / 2);
            meshes.slate.box([mid[0], mid[1] + 0.1, mid[2]], vec(hw + 0.3, 0, 0), [0, 0.08, 0], down, rgb(C.slate));
        }
        for (const end of [-1, 1]) {
            meshes.dressed.tri(pt(end * hw, eaves, -hd), pt(end * hw, eaves, hd), pt(end * hw, ridge, 0), stone);
            meshes.dressed.tri(pt(end * hw, eaves, hd), pt(end * hw, eaves, -hd), pt(end * hw, ridge, 0), stone);
        }
        // Tall pointed windows along the side to the lane, a door at the tower's foot
        for (let i = 0; i < 4; i++) {
            const along = -hw + 3 + i * (length - 6) / 3;
            meshes.dark.box(pt(along, c.floor + 3, -hd - 0.03), vec(0.45, 0, 0), [0, 1.4, 0], vec(0, 0, 0.04), rgb(0x2a2e34));
            meshes.dressed.box(pt(along, c.floor + 4.55, -hd - 0.05), vec(0.55, 0, 0), [0, 0.18, 0], vec(0, 0, 0.05), rgb(0xd8d0c0));
        }
        const [tw, td, th] = R.tower;
        const tAlong = -hw - tw / 2 + 0.5, tOut = -hd + td / 2;
        meshes.dressed.box(pt(tAlong, (c.foot + c.floor + th) / 2, tOut), vec(tw / 2, 0, 0), [0, (c.floor + th - c.foot) / 2, 0], vec(0, 0, td / 2), stone);
        meshes.door.box(pt(tAlong, c.floor + 1.3, tOut - td / 2 - 0.03), vec(0.7, 0, 0), [0, 1.3, 0], vec(0, 0, 0.05), rgb(0x5a4430));
        for (const k of [-1, 1]) meshes.dark.box(pt(tAlong + k * 0.9, c.floor + th - 2.5, tOut - td / 2 - 0.03), vec(0.3, 0, 0), [0, 0.8, 0], vec(0, 0, 0.04), rgb(0x2a2e34));
        // The spire: four faces up to a point
        const base = c.floor + th, apex = pt(tAlong, base + R.spire, tOut);
        const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => pt(tAlong + a * tw / 2, base, tOut + b * td / 2));
        for (let i = 0; i < 4; i++) meshes.slate.tri(corners[i], corners[(i + 1) % 4], apex, rgb(C.slate));
        // The yard: gravestones in rows, two yews
        const rand = HillLane.random(Math.round(c.from * 13));
        for (let row = 0; row < 3; row++) for (let i = 0; i < 6; i++) {
            if (rand() < 0.3) continue;
            const along = -hw + 1 + i * (length - 2) / 5 + (rand() - 0.5) * 0.6;
            const at = pt(along, c.floor + 0.35, -hd - 2 - row * 1.8);
            const m = new THREE.Matrix4().compose(new THREE.Vector3(at[0], at[1], at[2]), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.heading + (rand() - 0.5) * 0.2), new THREE.Vector3(0.5, 0.7 + rand() * 0.3, 0.1));
            repeats.stones.push(m);
        }
        for (const along of [-hw + 1, hw - 1]) {
            const at = pt(along, c.floor, -hd - 7.5);
            // A yew: a dark column of clumps narrowing to its top
            for (let k = 0; k < 4; k++) HillScene.leaf(repeats, [at[0], at[1] + 0.9 + k * 1.1, at[2]], 1.3 - k * 0.25, 0.9, 1.3 - k * 0.25, [0x2e3e26, 0x34462c][k % 2]);
        }
    }

    // A cottage's back and ends where the lane's cameras see them (c.seen): a back door with its step, small windows,
    // a drainpipe and a soil stack, now and then a lean-to shed, a water butt, a washing line, a back-garden fence, a
    // rear extension with its own roof; on a seen end a small window and a pipe
    static rear(lane, c, meshes, repeats) {
        if (!c.seen || (!c.seen.back && !c.seen.start && !c.seen.end)) return;
        const C = HillScene.COLOURS, rgb = HillScene.rgb;
        const A = [c.alongX, 0, c.alongZ], O = [c.outX, 0, c.outZ];
        const pt = (along, rise, out) => [c.x + c.alongX * along + c.outX * out, rise, c.z + c.alongZ * along + c.outZ * out];
        const vec = (along, up, out) => [A[0] * along + O[0] * out, up, A[2] * along + O[2] * out];
        const box = (mesh, along, rise, out, ha, hu, ho, colour) => mesh.box(pt(along, rise, out), vec(ha, 0, 0), [0, hu, 0], vec(0, 0, ho), colour);
        const rand = HillLane.random(Math.round(c.from * 29) + c.side * 5);
        const hw = c.hw, hd = c.hd, back = hd;
        const frame = rgb(C.frame), glass = rgb(C.glass), iron = rgb(C.iron);
        const { mesh: wallMesh, hex: wallHex } = HillScene.wallOf(c, meshes);
        if (c.seen.back) {
            const doorAt = (rand() - 0.5) * hw;
            box(meshes.trim, doorAt, c.floor + 1.05, back + 0.03, 0.46, 1.06, 0.04, frame);
            box(meshes.door, doorAt, c.floor + 0.95, back + 0.06, 0.4, 0.95, 0.03, rgb(C.doors[(c.doorColour + 2) % 5]));
            box(meshes.dressed, doorAt, c.floor - 0.06, back + 0.25, 0.5, 0.12, 0.25, rgb(C.step));
            for (let storey = 0; storey < c.storeys; storey++) {
                for (const along of [-hw * 0.55, hw * 0.55]) {
                    if (storey === 0 && Math.abs(along - doorAt) < 1) continue;
                    const y = c.floor + 1.6 + storey * 2.1;
                    box(meshes.trim, along, y, back + 0.02, 0.32, 0.4, 0.025, frame);
                    box(meshes.glass, along, y, back + 0.035, 0.27, 0.35, 0.02, glass);
                    box(meshes.dressed, along, y - 0.45, back + 0.07, 0.38, 0.04, 0.08, rgb(C.sill));
                }
            }
            // The drainpipe and the soil stack
            box(meshes.dark, hw - 0.2, (c.floor + c.eaves) / 2, back + 0.08, 0.04, (c.eaves - c.floor) / 2, 0.04, iron);
            box(meshes.dark, -hw * 0.2, (c.floor + c.eaves + 0.6) / 2, back + 0.1, 0.06, (c.eaves + 0.6 - c.floor) / 2, 0.06, iron);
            // A lean-to shed against the back, its roof sloping away
            if (rand() < 0.5) {
                const along = (rand() < 0.5 ? -1 : 1) * hw * 0.5, w = 0.9 + rand() * 0.6, dp = 1.2 + rand() * 0.6, h = 2 + rand() * 0.3;
                box(rand() < 0.5 ? meshes.brick : wallMesh, along, c.floor + h / 2 - 0.2, back + dp / 2, w, h / 2 + 0.2, dp / 2, rgb(rand() < 0.5 ? 0xffffff : wallHex));
                const hi = pt(along, c.floor + h + 0.25, back), lo = pt(along, c.floor + h - 0.35, back + dp + 0.25);
                meshes.slate.box([(hi[0] + lo[0]) / 2, (hi[1] + lo[1]) / 2 + 0.05, (hi[2] + lo[2]) / 2], vec(w + 0.12, 0, 0), [0, 0.04, 0],
                    [(lo[0] - hi[0]) / 2, (lo[1] - hi[1]) / 2, (lo[2] - hi[2]) / 2], rgb(C.slate));
                box(meshes.door, along, c.floor + 0.85, back + dp + 0.03, 0.35, 0.85, 0.02, rgb(0x5a4a38));
            }
            // A water butt by the downpipe
            if (rand() < 0.6) box(meshes.plain, hw - 0.5, c.floor + 0.45, back + 0.4, 0.3, 0.45, 0.3, rgb(0x2e4632));
            // A rear extension with its own roof
            if (rand() < 0.22) {
                const along = -hw * 0.4, w = Math.min(1.8, hw * 0.6), dp = 2.5, h = c.storeys > 1 ? 3.2 : 2.6;
                box(wallMesh, along, (c.foot + c.floor + h) / 2, back + dp / 2, w, (c.floor + h - c.foot) / 2, dp / 2, rgb(wallHex));
                for (const side of [-1, 1]) {
                    const mid = pt(along + side * w / 2, c.floor + h + 0.5, back + dp / 2);
                    meshes.tile.box([mid[0], mid[1], mid[2]], vec(w / 2 + 0.1, 0.5 * 0, 0), [0, 0.05, 0], vec(0, 0, dp / 2 + 0.15), rgb(C.tile));
                }
                box(meshes.trim, along, c.floor + 1.5, back + dp + 0.02, 0.3, 0.4, 0.025, frame);
            }
            // A washing line across the garden, a few cloths on it
            if (rand() < 0.3) {
                const far = back + 4 + rand() * 2;
                for (const along of [-hw * 0.7, hw * 0.7]) box(meshes.plain, along, c.floor + 1.1, far, 0.04, 1.1, 0.04, rgb(0x6a5a48));
                box(meshes.plain, 0, c.floor + 2.1, far, hw * 0.7, 0.008, 0.008, rgb(0xe8e4dc));
                for (let k = 0; k < 4; k++) {
                    const along = -hw * 0.5 + k * hw * 0.33 + (rand() - 0.5) * 0.2;
                    box(meshes.plain, along, c.floor + 1.8, far, 0.22 + rand() * 0.1, 0.28, 0.01, rgb([0xe8e4dc, 0xc8b8a0, 0x9aa8b8, 0xd0c0c8][k]));
                }
            }
            // The back garden's fence
            if (rand() < 0.45) {
                const far = back + 7;
                for (let along = -hw; along <= hw + 1e-6; along += 1.5) box(meshes.plain, along, c.floor + 0.6, far, 0.05, 0.6, 0.05, rgb(0x5a4a38));
                for (const y of [0.4, 0.95]) box(meshes.plain, 0, c.floor + y, far, hw, 0.04, 0.02, rgb(0x5a4a38));
            }
        }
        for (const [name, end] of [['start', -1], ['end', 1]]) {
            if (!c.seen[name]) continue;
            const x = end * (hw + 0.02);
            for (let storey = 0; storey < c.storeys; storey++) {
                const y = c.floor + 1.6 + storey * 2.1;
                c.alongX !== undefined && meshes.trim.box(pt(end * (hw + 0.025), y, 0), vec(0.025, 0, 0), [0, 0.38, 0], vec(0, 0, 0.3), frame);
                meshes.glass.box(pt(end * (hw + 0.04), y, 0), vec(0.02, 0, 0), [0, 0.33, 0], vec(0, 0, 0.25), glass);
            }
            meshes.dark.box(pt(x + end * 0.06, (c.floor + c.eaves) / 2, hd - 0.3), vec(0.04, 0, 0), [0, (c.eaves - c.floor) / 2, 0], vec(0, 0, 0.04), iron);
        }
    }

    // A side road (HillLane.sideRoad): its surface from the lane's edge (cobbles of grey stone, gravel with grass at
    // its edges, or flags and then steps), the houses fronting it, walls or hedges between, and what closes it
    static side(lane, road, d, w, up) {
        const p = lane.roadPoint(road, d);
        return [p.x + p.crossX * w, lane.roadY(road, d, w) + up, p.z + p.crossZ * w];
    }

    static sideRoad(lane, road, meshes, repeats) {
        const rgb = HillScene.rgb, C = HillScene.COLOURS, r = lane.rule;
        const at = (d, w, up = 0) => HillScene.side(lane, road, d, w, up);
        const half = road.wide / 2;
        const steps = road.kind === 'steps', flat = r.flagsM + 0.3;
        const surface = road.kind === 'gravel' ? meshes.plain : meshes.rubble;
        const tone = road.kind === 'gravel' ? rgb(0xb4a88e) : rgb(0x9c9890);
        const across = Math.max(2, Math.ceil(road.wide));
        for (let d = 0; d < road.length - 1e-6; d += 1) {
            const e = Math.min(d + 1, road.length);
            for (let k = 0; k < across; k++) {
                const w0 = -half + road.wide * k / across, w1 = -half + road.wide * (k + 1) / across;
                if (steps && d >= flat) continue;
                const mesh = steps ? meshes.dressed : surface;
                mesh.quad(at(d, w0), at(d, w1), at(e, w1), at(e, w0), steps ? rgb(C.flags) : tone);
            }
            if (road.kind === 'gravel') for (const sgn of [-1, 1]) {
                meshes.grass.quad(at(d, sgn * half, 0.01), at(d, sgn * (half - 0.35), 0.01), at(e, sgn * (half - 0.35), 0.01), at(e, sgn * half, 0.01), rgb(0x7f9a5a));
            }
        }
        if (steps) {
            const S = HillLane.SIDE;
            for (let d = flat; d < road.length - S.treadM; d += S.treadM) {
                const p = lane.roadPoint(road, d + S.treadM / 2), top = lane.roadY(road, d + S.treadM / 2, 0);
                const base = lane.roadY(road, flat - 0.01, 0) - 0.3;
                meshes.dressed.box([p.x, (top + base) / 2, p.z], [p.crossX * half, 0, p.crossZ * half], [0, (top - base) / 2, 0], [p.dirX * S.treadM / 2, 0, p.dirZ * S.treadM / 2], rgb(0xc8c0b0));
            }
        }
        for (const house of road.houses) HillScene.cottage(lane, house, meshes, repeats);
        const rand = HillLane.random(Math.round(road.s * 7));
        for (const wall of road.walls) {
            for (let d = wall.from; d < wall.to - 0.05; d += 1) {
                const e = Math.min(d + 1, wall.to), mid = (d + e) / 2, p = lane.roadPoint(road, mid);
                const a = at(mid, wall.side * (half + 0.25));
                const y = lane.roadY(road, mid, 0);
                if (wall.hedge) {
                    HillScene.leaf(repeats, [a[0], y + 0.8, a[2]], (e - d) / 2 * 1.15, 0.85, 0.4, [0x4a5e34, 0x55693a][Math.floor(rand() * 2)], Math.atan2(p.dirX, p.dirZ));
                    continue;
                }
                const top = y + (steps ? 2.2 : 1.6);
                const low = Math.min(y, road.y0) - 0.4;
                meshes.rubble.box([a[0], (low + top) / 2, a[2]], [p.dirX * (e - d) / 2, 0, p.dirZ * (e - d) / 2], [0, (top - low) / 2, 0], [p.crossX * 0.2, 0, p.crossZ * 0.2], rgb(C.gardenWall));
                meshes.dressed.box([a[0], top + 0.05, a[2]], [p.dirX * ((e - d) / 2 + 0.02), 0, p.dirZ * ((e - d) / 2 + 0.02)], [0, 0.05, 0], [p.crossX * 0.25, 0, p.crossZ * 0.25], rgb(C.coping));
            }
        }
        if (!road.ride) return;
        // What closes it: a timber gate between stone piers, a wall across, or a yard's wall with a barn behind it
        const p = lane.roadPoint(road, road.ride), y = lane.roadY(road, road.ride, 0), c = at(road.ride, 0);
        const span = (h, colour, mesh, up = 0) => mesh.box([c[0], y + up + h / 2, c[2]], [p.crossX * (half + 0.2), 0, p.crossZ * (half + 0.2)], [0, h / 2, 0], [p.dirX * 0.2, 0, p.dirZ * 0.2], colour);
        if (road.end === 'gate') {
            for (const sgn of [-1, 1]) {
                const q = at(road.ride, sgn * (half + 0.1));
                meshes.dressed.box([q[0], y + 0.9, q[2]], [p.crossX * 0.22, 0, p.crossZ * 0.22], [0, 0.95, 0], [p.dirX * 0.22, 0, p.dirZ * 0.22], rgb(C.coping));
            }
            for (const up of [0.25, 0.75, 1.25]) meshes.plain.box([c[0], y + up, c[2]], [p.crossX * (half - 0.1), 0, p.crossZ * (half - 0.1)], [0, 0.06, 0], [p.dirX * 0.03, 0, p.dirZ * 0.03], rgb(0x5a4a38));
            for (let k = -2; k <= 2; k++) {
                const q = at(road.ride, k * (half - 0.2) / 2);
                meshes.plain.box([q[0], y + 0.75, q[2]], [p.crossX * 0.05, 0, p.crossZ * 0.05], [0, 0.6, 0], [p.dirX * 0.03, 0, p.dirZ * 0.03], rgb(0x5a4a38));
            }
        } else {
            span(road.end === 'yard' ? 2.4 : 2, rgb(C.gardenWall), meshes.rubble);
            if (road.end === 'yard') {
                // The barn beyond the yard wall, its slate roof over the wall
                const b = at(road.ride + 5, 0);
                meshes.rubble.box([b[0], y + 2, b[2]], [p.crossX * 4, 0, p.crossZ * 4], [0, 2.4, 0], [p.dirX * 2.5, 0, p.dirZ * 2.5], rgb(0xb8ae9c));
                for (const sgn of [-1, 1]) {
                    meshes.slate.box([b[0] + p.dirX * sgn * 1.3, y + 5, b[2] + p.dirZ * sgn * 1.3], [p.crossX * 4.3, 0, p.crossZ * 4.3], [0, 0.08, 0],
                        [p.dirX * sgn * 1.45, -0.7, p.dirZ * sgn * 1.45], rgb(C.slate));
                }
            }
        }
    }

    // The pieces of the opening frame (HillLane.RULE.opening): the milk churn on its stone step, the iron post with its
    // arm and the rough stones on the left, the rail on the right, the big bare tree beyond the thatched roof
    static opening(lane, meshes, repeats) {
        const C = HillScene.COLOURS, rgb = HillScene.rgb;
        const o = lane.rule.opening;
        const p = (s, across, up = 0) => lane.at(s, across, up, {});
        const frame = s => lane.sample(s);
        const box = (mesh, s, across, up, ha, hu, ho, colour) => {
            const f = frame(s), a = p(s, across, up);
            mesh.box([a.x, a.y, a.z], [f.alongX * ha, 0, f.alongZ * ha], [0, hu, 0], [f.leftX * ho, 0, f.leftZ * ho], colour);
        };
        const [ps, pa, pu] = o.post;
        box(meshes.dark, ps, pa, pu / 2, 0.035, pu / 2, 0.035, rgb(C.iron));
        box(meshes.dark, ps, pa + 0.45, pu - 0.25, 0.025, 0.025, 0.45, rgb(C.iron));
        box(meshes.dark, ps, pa, pu + 0.05, 0.06, 0.06, 0.06, rgb(C.iron));
        const rand = HillLane.random(907);
        // On the left by the churn: rough stones heaped along the lane's edge, as the stills have, in place of a railing
        const [s0, s1, sa] = o.stones;
        for (let s = s0; s < s1; s += 0.55 + rand() * 0.3) {
            const h = 0.18 + rand() * 0.22;
            box(meshes.rubble, s, sa + (rand() - 0.5) * 0.3, h / 2 - 0.05, 0.22 + rand() * 0.12, h / 2 + 0.05, 0.25 + rand() * 0.12, rgb(0xb4aea2));
        }
        const [f0, f1, fa] = o.fence;
        for (let s = f0; s <= f1; s += 2) box(meshes.plain, s, fa, 0.5, 0.06, 0.5, 0.06, rgb(0x3a342c));
        for (let s = f0; s < f1; s += 1) box(meshes.plain, s + 0.5, fa, 0.85, 0.52, 0.03, 0.03, rgb(0x3a342c));
        const [trs, tra, tru, trr] = o.tree;
        const t = p(trs, tra, 0);
        repeats.bare.push(new THREE.Matrix4().compose(new THREE.Vector3(t.x, t.y + tru - trr * 2.2, t.z), new THREE.Quaternion(), new THREE.Vector3(trr * 2.6, trr * 2.6, trr * 2.6)));
    }

    // One building, from its data (HillLane.placeCottages): walls in rubble or dressed stone, lime render or brick, with
    // a plinth and, for stone, quoins; a pitched roof with overhang and ridge in thatch (with its thick rounded eave),
    // clay tile or slate; chimneys with pots; a panelled door in its frame with a step and a fanlight, now and then a
    // porch; sash windows with sills and lintels; a gutter and a drainpipe; ivy up some fronts and window boxes under
    // some windows; at the front flags, railings or a low wall. A shop has a shop window (flat or a bay) under a blank
    // fascia and an awning; a pub a blank sign hung from an iron arm
    static cottage(lane, c, meshes, repeats) {
        const C = HillScene.COLOURS, rgb = HillScene.rgb, shade = HillScene.shade;
        const r = lane.rule;
        const A = [c.alongX, 0, c.alongZ], O = [c.outX, 0, c.outZ];
        const pt = (along, rise, out) => [c.x + c.alongX * along + c.outX * out, rise, c.z + c.alongZ * along + c.outZ * out];
        const vec = (along, up, out) => [A[0] * along + O[0] * out, up, A[2] * along + O[2] * out];
        const box = (mesh, along, rise, out, ha, hu, ho, colour) => mesh.box(pt(along, rise, out), vec(ha, 0, 0), [0, hu, 0], vec(0, 0, ho), colour);
        const hw = c.hw, hd = c.hd;
        const { mesh: wallMesh, hex: wallHex } = HillScene.wallOf(c, meshes);
        const wall = rgb(wallHex);
        const face = -hd;

        // The walls, a plinth along the front, quoins at the front corners of a stone or rendered cottage
        box(wallMesh, 0, (c.foot + c.eaves) / 2, 0, hw, (c.eaves - c.foot) / 2, hd, wall);
        box(meshes.dressed, 0, (c.foot + c.floor + 0.3) / 2, face - 0.03, hw + 0.02, (c.floor + 0.3 - c.foot) / 2, 0.04, rgb(shade(0xb8b0a0, 0.85)));
        if (c.quoins && c.wall !== 'brick' && c.wall !== 'rubble') {
            const quoin = rgb(0xd8d0c0);
            let k = 0;
            for (let y = c.floor + 0.3; y < c.eaves - 0.25; y += 0.32, k++) {
                const w = k % 2 === 0 ? 0.2 : 0.13;
                for (const end of [-1, 1]) box(meshes.dressed, end * (hw - w), y + 0.14, face - 0.02, w, 0.14, 0.03, quoin);
            }
        }

        // The roof: along the lane, eaves to the front and back; or a gable to the lane
        const thatch = c.roof === 'thatch';
        const over = thatch ? 0.55 : 0.3;
        const thick = thatch ? 0.42 : 0.09;
        const roofMesh = meshes[c.roof] || meshes.tile;
        const roof = rgb(C[c.roof] || C.tile);
        const slab = (lowAlong, lowOut, lowY, highAlong, highOut, highY, span, spanAxis) => {
            const mid = pt((lowAlong + highAlong) / 2, (lowY + highY) / 2, (lowOut + highOut) / 2);
            const down = vec((highAlong - lowAlong) / 2, (highY - lowY) / 2, (highOut - lowOut) / 2);
            const across = spanAxis === 'along' ? vec(span, 0, 0) : vec(0, 0, span);
            const len = Math.hypot(...down);
            let nx = down[1] * across[2] - down[2] * across[1], ny = down[2] * across[0] - down[0] * across[2], nz = down[0] * across[1] - down[1] * across[0];
            const nl = Math.hypot(nx, ny, nz) || 1;
            const sign = ny < 0 ? -1 : 1;
            nx *= sign * thick / 2 / nl; ny *= sign * thick / 2 / nl; nz *= sign * thick / 2 / nl;
            roofMesh.box([mid[0] + nx, mid[1] + ny, mid[2] + nz], across, [nx, ny, nz], down.map(v => v * (len + 0.02) / len), roof);
        };
        const eaveY = c.eaves - (thatch ? 0.35 : 0.05);
        if (!c.gable) {
            for (const side of [-1, 1]) slab(0, side * (hd + over), eaveY - over * 0.45, 0, 0, c.ridge, hw + over * 0.6, 'along');
            for (const end of [-1, 1]) {
                wallMesh.tri(pt(end * hw, c.eaves, -hd), pt(end * hw, c.eaves, hd), pt(end * hw, c.ridge - 0.15, 0), wall);
                wallMesh.tri(pt(end * hw, c.eaves, hd), pt(end * hw, c.eaves, -hd), pt(end * hw, c.ridge - 0.15, 0), wall);
            }
            if (thatch) {
                // The thatch's thick ridge, its cap a darker band laid over it, and its deep rounded eave along the
                // front and the back, a second roll over it
                box(roofMesh, 0, c.ridge + 0.14, 0, hw + over * 0.6, 0.24, 0.36, rgb(shade(C.thatch, 0.85)));
                for (const side of [-1, 1]) box(roofMesh, 0, c.ridge - 0.02, side * 0.38, hw + over * 0.55, 0.12, 0.14, rgb(shade(C.thatch, 0.7)));
                for (const side of [-1, 1]) {
                    box(roofMesh, 0, eaveY - over * 0.45 - 0.08, side * (hd + over * 0.95), hw + over * 0.6, 0.24, 0.26, roof);
                    box(roofMesh, 0, eaveY - over * 0.45 + 0.14, side * (hd + over * 0.7), hw + over * 0.6, 0.16, 0.2, rgb(shade(C.thatch, 1.06)));
                }
                // Eyebrow dormers: the thatch swept up and over each upper window that breaks the eave
                if (c.dormers && c.storeys > 1) {
                    const count = Math.max(1, Math.floor(c.wide / 2.3));
                    for (let i = 0; i < count; i++) {
                        const along = -hw + (i + 0.5) * c.wide / count;
                        if (Math.abs(along) > hw - 0.7) continue;
                        box(roofMesh, along, eaveY + 0.1, -(hd + over * 0.5), 0.7, 0.2, 0.45, roof);
                    }
                }
            } else {
                box(roofMesh, 0, c.ridge + 0.06, 0, hw + over * 0.6, 0.08, 0.12, rgb(shade(C[c.roof] || C.tile, 0.8)));
                box(meshes.dark, 0, eaveY - over * 0.45 - 0.04, -(hd + over * 0.8), hw + over * 0.5, 0.045, 0.06, rgb(C.iron));
            }
        } else {
            for (const side of [-1, 1]) slab(side * (hw + over), 0, eaveY - over * 0.45, 0, 0, c.ridge, hd + over * 0.6, 'out');
            for (const end of [-1, 1]) {
                wallMesh.tri(pt(-hw, c.eaves, end * hd), pt(hw, c.eaves, end * hd), pt(0, c.ridge - 0.15, end * hd), wall);
                wallMesh.tri(pt(hw, c.eaves, end * hd), pt(-hw, c.eaves, end * hd), pt(0, c.ridge - 0.15, end * hd), wall);
            }
            box(roofMesh, 0, c.ridge + 0.06, 0, 0.12, 0.08, hd + over * 0.6, rgb(shade(C[c.roof] || C.tile, 0.8)));
        }
        box(meshes.dark, c.pipe * (hw - 0.18), (c.floor + eaveY) / 2, face - 0.07, 0.04, (eaveY - c.floor) / 2, 0.04, rgb(C.iron));

        // Chimneys with their pots: where the data puts them, or one at an end
        const chimneys = c.chimneys || (c.chimney ? [{ along: c.gable ? 0 : c.chimney * (hw - 0.55), top: c.ridge + 1.1, out: c.gable ? c.chimney * (hd - 0.6) : 0 }] : []);
        const pot = new THREE.Matrix4();
        for (const ch of chimneys) {
            const base = c.gable ? c.eaves : c.ridge - 0.6;
            const top = ch.top, out = ch.out || 0;
            box(c.wall === 'brick' ? meshes.brick : meshes.rubble, ch.along, (base + top) / 2, out, 0.45, (top - base) / 2, 0.32, rgb(c.wall === 'brick' ? 0xffffff : shade(0xd2cbbd, 0.9)));
            box(meshes.dressed, ch.along, top + 0.05, out, 0.5, 0.06, 0.37, rgb(C.coping));
            // Thatch wraps round a chimney where it comes through
            if (thatch) box(roofMesh, ch.along, c.ridge - 0.05, out, 0.62, 0.3, 0.48, rgb(shade(C.thatch, 0.9)));
            for (const k of [-1, 1]) {
                const q = pt(ch.along + k * 0.2, top + 0.3, out);
                repeats.pots.push(pot.clone().compose(new THREE.Vector3(q[0], q[1], q[2]), new THREE.Quaternion(), new THREE.Vector3(1, 0.45, 1)));
            }
        }

        // The door: frame, panelled door, fanlight, step, and now and then a porch
        const doorAt = -hw + c.wide * c.door;
        box(meshes.trim, doorAt, c.floor + 1.1, face - 0.03, 0.55, 1.12, 0.04, rgb(C.frame));
        box(meshes.door, doorAt, c.floor + 0.98, face - 0.06, 0.45, 0.98, 0.03, rgb(C.doors[c.doorColour]));
        box(meshes.glass, doorAt, c.floor + 2.07, face - 0.06, 0.42, 0.1, 0.03, rgb(C.glass));
        box(meshes.dressed, doorAt, c.floor - 0.06, face - 0.3, 0.62, 0.12, 0.3, rgb(C.step));
        if (c.porch) {
            const y = c.floor + 2.45;
            for (const k of [-1, 1]) {
                box(meshes.trim, doorAt + k * 0.65, c.floor + 1.2, face - 0.85, 0.05, 1.2, 0.05, rgb(C.frame));
                const eave = pt(doorAt + k * 0.85, y, face - 0.5), ridge = pt(doorAt, y + 0.45, face - 0.5);
                roofMesh.box([(eave[0] + ridge[0]) / 2, (eave[1] + ridge[1]) / 2 + 0.03, (eave[2] + ridge[2]) / 2], vec(0, 0, 0.55),
                    [0, 0.03, 0], [(ridge[0] - eave[0]) / 2, (ridge[1] - eave[1]) / 2, (ridge[2] - eave[2]) / 2], roof);
            }
        }

        // The shop front: a stall riser, a shop window flat or as a bay, a blank fascia, an awning
        const shop = c.kind === 'shop';
        if (shop) {
            const from = -hw + 0.35, to = doorAt - 0.75, mid = (from + to) / 2, half = (to - from) / 2;
            if (half > 0.5) {
                const fascia = [0x2e4a3a, 0x5a2a2a, 0x2e3a52, 0x3a3a3a][c.fascia];
                const proud = c.bay ? 0.45 : 0.05;
                box(meshes.trim, mid, c.floor + 0.35, face - proud, half + 0.05, 0.35, proud, rgb(fascia));
                box(meshes.glass, mid, c.floor + 1.45, face - proud - 0.01, half, 0.75, proud * 0.9, rgb(C.glass));
                for (let k = -half; k <= half + 1e-6; k += half / 2) box(meshes.trim, mid + k, c.floor + 1.45, face - proud * 2 - 0.02, 0.03, 0.78, 0.02, rgb(C.frame));
                box(meshes.trim, mid, c.floor + 2.5, face - proud - 0.05, half + 0.3, 0.22, 0.06, rgb(fascia));
                // The awning: a sloping canvas over the window
                const top = pt(mid, c.floor + 2.25, face - proud - 0.1), low = pt(mid, c.floor + 1.95, face - proud - 1.1);
                meshes.plain.box([(top[0] + low[0]) / 2, (top[1] + low[1]) / 2, (top[2] + low[2]) / 2], vec(half + 0.2, 0, 0), [0, 0.015, 0],
                    [(low[0] - top[0]) / 2, (low[1] - top[1]) / 2, (low[2] - top[2]) / 2], rgb([0x7a3a32, 0x3e5a44, 0xb0a070, 0x485868][c.fascia]));
            }
        }
        if (c.kind === 'pub') {
            // The sign: a blank board hung from an iron arm by the door
            const along = doorAt + 1.2 * (doorAt < 0 ? 1 : -1);
            box(meshes.dark, along, c.floor + 3.1, face - 0.5, 0.03, 0.03, 0.5, rgb(C.iron));
            box(meshes.trim, along, c.floor + 2.55, face - 0.85, 0.42, 0.52, 0.04, rgb(0x3a2a20));
            box(meshes.trim, along, c.floor + 2.55, face - 0.88, 0.36, 0.46, 0.02, rgb(0x5a4a38));
        }

        // Sash windows on each storey: a white frame, two sashes of panes, a stone sill and a lintel; a window box
        // under some ground-floor ones
        const windows = Math.max(1, Math.floor(c.wide / 2.3));
        const frame = rgb(C.frame), sill = rgb(C.sill), glass = rgb(C.glass), lit = rgb(C.lit);
        const greens = [0x4e6236, 0x5d7440, 0x445a30], blooms = [0xc8463a, 0xe0c04a, 0xe8e2d8, 0xd87a9a];
        const rand = HillLane.random(Math.round(c.from * 17) + c.side * 3);
        for (let storey = 0; storey < c.storeys; storey++) {
            const y = c.floor + 1.55 + storey * 2.1;
            for (let i = 0; i < windows; i++) {
                const along = -hw + (i + 0.5) * c.wide / windows;
                if (storey === 0 && Math.abs(along - doorAt) < 1.15) continue;
                if (storey === 0 && shop && along < doorAt) continue;
                if (Math.abs(along) > hw - 0.55) continue;
                // Small casements, as the stills have them
                box(meshes.trim, along, y, face - 0.02, 0.36, 0.5, 0.025, frame);
                box(meshes.glass, along, y, face - 0.05, 0.31, 0.45, 0.01, c.lit && storey === 0 ? lit : glass);
                box(meshes.trim, along, y, face - 0.065, 0.31, 0.022, 0.008, frame);
                box(meshes.trim, along, y, face - 0.065, 0.014, 0.45, 0.008, frame);
                for (const k of [-1, 1]) box(meshes.trim, along, y + k * 0.22, face - 0.065, 0.31, 0.01, 0.008, frame);
                box(meshes.dressed, along, y - 0.55, face - 0.08, 0.42, 0.04, 0.1, sill);
                box(meshes.dressed, along, y + 0.57, face - 0.03, 0.44, 0.06, 0.045, sill);
                if (c.boxes && storey === 0) {
                    box(meshes.plain, along, y - 0.6, face - 0.2, 0.45, 0.09, 0.1, rgb(0x5a4a38));
                    for (let k = -2; k <= 2; k++) {
                        const q = pt(along + k * 0.18, y - 0.45, face - 0.2);
                        HillScene.leaf(repeats, q, 0.12, 0.1, 0.1, greens[(k + 2) % 3]);
                        HillScene.flower(repeats, [q[0], q[1] + 0.08, q[2]], 0.045, blooms[Math.floor(rand() * blooms.length)]);
                    }
                }
            }
        }
        // Ivy up the front from one corner
        if (c.climber) {
            const end = rand() < 0.5 ? -1 : 1;
            // Many small clumps, thick at the foot and thinning up the wall, held close to it
            for (let k = 0; k < 26; k++) {
                const up = rand() ** 1.6;
                const along = end * (hw - 0.25 - rand() * Math.min(2.4, hw) * (1 - up * 0.5)), y = c.floor + 0.2 + up * (c.eaves - c.floor - 0.4);
                HillScene.leaf(repeats, pt(along, y, face - 0.05), 0.16 + rand() * 0.12, 0.14 + rand() * 0.1, 0.05, greens[k % 3], c.heading);
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
        } else if (c.front === 'garden' && !shop) {
            const low = c.foot + 0.3;
            for (const [from, to] of [[-hw, doorAt - 0.7], [doorAt + 0.7, hw]]) {
                if (to - from < 0.3) continue;
                box(meshes.rubble, (from + to) / 2, (low + c.floor + 0.75) / 2, line, (to - from) / 2, (c.floor + 0.75 - low) / 2, 0.15, rgb(C.gardenWall));
                box(meshes.dressed, (from + to) / 2, c.floor + 0.8, line, (to - from) / 2 + 0.02, 0.05, 0.19, rgb(C.coping));
            }
        }
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

    // A plain house of the lower village
    static house(x, y, z, wide, deep, eaves, turn, roofKind, wallHex, meshes) {
        const rgb = HillScene.rgb, C = HillScene.COLOURS;
        const A = [Math.sin(turn), 0, Math.cos(turn)], L = [Math.cos(turn), 0, -Math.sin(turn)];
        const hw = wide / 2, hd = deep / 2;
        const pt = (along, rise, across) => [x + A[0] * along + L[0] * across, rise, z + A[2] * along + L[2] * across];
        const wall = rgb(wallHex);
        meshes.rubble.box([x, y + eaves / 2 - 1, z], [A[0] * hw, 0, A[2] * hw], [0, eaves / 2 + 1, 0], [L[0] * hd, 0, L[2] * hd], wall);
        const ridge = y + eaves + 2.4, top = y + eaves;
        const roof = roofKind === 'thatch' ? meshes.thatch : meshes.tile;
        const tone = rgb(roofKind === 'thatch' ? C.thatch : C.tile);
        for (const side of [-1, 1]) roof.quad(pt(-hw - 0.3, top, side * (hd + 0.4)), pt(hw + 0.3, top, side * (hd + 0.4)), pt(hw + 0.3, ridge, 0), pt(-hw - 0.3, ridge, 0), tone);
        for (const end of [-1, 1]) {
            meshes.rubble.tri(pt(end * hw, top, -hd), pt(end * hw, top, hd), pt(end * hw, ridge - 0.1, 0), wall);
            meshes.rubble.tri(pt(end * hw, top, hd), pt(end * hw, top, -hd), pt(end * hw, ridge - 0.1, 0), wall);
        }
        meshes.rubble.box(pt(hw - 0.6, ridge + 0.5, 0), [A[0] * 0.35, 0, A[2] * 0.35], [0, 0.9, 0], [L[0] * 0.3, 0, L[2] * 0.3], rgb(HillScene.shade(wallHex, 0.9)));
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
