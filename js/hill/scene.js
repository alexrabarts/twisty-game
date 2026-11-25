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
        // (linear already: HillScene.rgb)
        geometry.userData.linearColors = true;
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
            thatch: 0xaa9c82, tile: 0x9a7a68, slate: 0x727880,
            coping: 0xcfc6b4, gardenWall: 0xd6ccb8, flags: 0xc4beb2, kerb: 0xa8a294, step: 0xbdb4a2, sill: 0xd8d0be,
            frame: 0xf1ede3, glass: 0xc8ccd0, lit: 0x8a6a42, iron: 0x26262a, pot: 0xa0684a,
            doors: [0x3e5a44, 0x7a2e2a, 0x2e4058, 0x5a4430, 0x2c2c2e],
            field: [0x7d8d52, 0x6a7a44, 0x8a9a5e, 0x748448, 0x93a066], tree: 0x4c5636,
            haze: 0xc8c0ae
        });
    }

    // An sRGB hex colour as the linear vertex colour the shader reads, decoded once here and nowhere else: the meshes
    // say so (HillMesh.mesh, `linearColors`), so Graphics.fixColorSpaces leaves them alone. (THREE.Color(hex) is not
    // used: with colour management on it decodes already, and decoding that again, then again in fixColorSpaces, put
    // the thatch's albedo at 0.016 for 0.40)
    static rgb(hex) {
        const decode = v => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
        return [decode(((hex >> 16) & 255) / 255), decode(((hex >> 8) & 255) / 255), decode((hex & 255) / 255)];
    }

    // three r150 turns a normal map inside out on the back face of a two-sided surface: its tangent frame is built from
    // the normal already turned to the viewer, then turned again by the face's side (perturbNormal2Arb's scale). The
    // lane is wound face down, so every cobble showed lit on the side away from the sun, a hollow, not a dome. This
    // drops the second turn for each normal-mapped material under root, so a stone is a dome from either side
    static bumpsBothSides(root) {
        const wrong = 'faceDirection * inversesqrt( det )';
        root.traverse(o => {
            const list = !o.material ? [] : Array.isArray(o.material) ? o.material : [o.material];
            for (const m of list) {
                if (!m.normalMap || m.userData.bumpsBothSides) continue;
                m.userData.bumpsBothSides = true;
                const before = m.onBeforeCompile;
                m.onBeforeCompile = (shader, renderer) => {
                    if (before) before.call(m, shader, renderer);
                    if (!shader.fragmentShader.includes('#include <normalmap_pars_fragment>')) return;
                    const pars = THREE.ShaderChunk.normalmap_pars_fragment;
                    if (!pars.includes(wrong)) throw new Error('HillScene.bumpsBothSides: three\'s tangent frame has changed; check the back face again');
                    shader.fragmentShader = shader.fragmentShader.replace('#include <normalmap_pars_fragment>', pars.replace(wrong, 'inversesqrt( det )'));
                };
                const key = m.customProgramCacheKey;
                m.customProgramCacheKey = () => key.call(m) + '|bumps-both-sides';
                m.needsUpdate = true;
            }
        });
        return root;
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
        const normalMap = texture(normal, false);
        // (the height it was drawn from, canvas row by row, for the tests that check each stone is a dome)
        normalMap.userData.height = { data: height, width: W, height: H };
        return { map: texture(colour, true), normalMap, aoMap: aoRough, roughnessMap: aoRough };
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
        const land = lane.ground();
        const group = new THREE.Group();
        group.name = 'hill-village';
        const T = HillTextures.all(options.anisotropy || 8);
        // One mesh for each finish: every face of that finish in the village is one draw
        const meshes = {};
        for (const name of ['rubble', 'dressed', 'render', 'brick', 'thatch', 'slate', 'tile', 'trim', 'glass', 'dark', 'door', 'grass', 'plain']) meshes[name] = new HillMesh();
        // Parts repeated many times are instanced: railing posts, chimney pots, leaves and flowers, gravestones
        // `stands` is every piece that stands on the ground, with its footprint and its foot (HillScene.stand): the check
        // that nothing floats reads it
        const repeats = { shrubRand: HillLane.random(lane.rule.seed + 71), posts: [], pots: [], leaves: [], shrubs: [], shrubsB: [], hedges: [], yews: [], crosses: [], flowers: [], stones: [], trunks: [], bare: [], leafy: [], stands: [] };
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
            const y = land.heightAt(x, z);
            const wide = 6 + rand() * 6, deep = 5 + rand() * 3, turn = down.heading + (rand() < 0.5 ? 0 : Math.PI / 2) + (rand() - 0.5) * 0.3;
            HillScene.house(land, repeats, x, y, z, wide, deep, 4.2 + rand() * 1.5, turn, rand() < 0.4 ? 'thatch' : 'tile', [C.lime, C.rubble, C.cream][Math.floor(rand() * 3)], meshes);
            // A tree beside some of them, the bare ones as in the reference frames
            if (rand() < 0.5) {
                const tx = x + (rand() - 0.5) * 16, tz = z + (rand() - 0.5) * 16;
                HillScene.tree(repeats, tx, land.heightAt(tx, tz) - 0.1, tz, 5 + rand() * 4, rand() < 0.45, rand);
            }
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
            // (the lawns lie on the land: they take shadows but cast none, or they shade themselves in stripes)
            if (key === 'grass') built.castShadow = false;
            built.name = `hill-${key}`;
            group.add(built);
        }
        const posts = HillScene.instanced(new THREE.BoxGeometry(0.035, 1, 0.035), C.iron, repeats.posts, 'hill-railing-posts');
        const pots = HillScene.instanced(new THREE.CylinderGeometry(0.11, 0.13, 1, 8), C.pot, repeats.pots, 'hill-chimney-pots');
        const leaves = HillScene.instanced(new THREE.DodecahedronGeometry(1, 0), 0xffffff, repeats.leaves, 'hill-leaves', true);
        const flowers = HillScene.instanced(new THREE.IcosahedronGeometry(1, 0), 0xffffff, repeats.flowers, 'hill-flowers', true);
        const stones = HillScene.instanced(HillScene.headstoneShape(), 0xffffff, repeats.stones, 'hill-gravestones', true);
        const crosses = HillScene.instanced(HillScene.crossShape(), 0xffffff, repeats.crosses, 'hill-crosses', true);
        const trunks = HillScene.instanced(new THREE.CylinderGeometry(0.6, 1, 1, 6).translate(0, 0.5, 0), 0x4a4038, repeats.trunks, 'hill-trunks');
        const bare = HillScene.instanced(HillScene.bareTree(), 0x4a4038, repeats.bare, 'hill-bare-trees');
        let leafy = null;
        if (repeats.leafy.length) {
            leafy = new THREE.InstancedMesh(HillScene.leafyTree(), new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.9, flatShading: true }), repeats.leafy.length);
            repeats.leafy.forEach((m, i) => leafy.setMatrixAt(i, m));
            leafy.castShadow = true;
            leafy.receiveShadow = true;
            leafy.name = 'hill-leafy-trees';
        }
        // The shrubs and hedges in two shapes, each shrub tinted its own way; the churchyard's yews
        const shrubbery = (shape, list, name) => {
            if (!list.length) return null;
            const mesh = new THREE.InstancedMesh(shape, new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.9, flatShading: true }), list.length);
            const tint = new THREE.Color();
            list.forEach((o, i) => {
                mesh.setMatrixAt(i, o.m || o);
                if (o.colour !== undefined) mesh.setColorAt(i, tint.setHex(o.colour));
            });
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.name = name;
            return mesh;
        };
        const shrubs = shrubbery(HillScene.shrubShape(613), repeats.shrubs, 'hill-shrubs');
        const shrubsB = shrubbery(HillScene.shrubShape(617), repeats.shrubsB, 'hill-shrubs-b');
        const hedges = shrubbery(HillScene.shrubShape(619, true), repeats.hedges, 'hill-hedges');
        const yews = shrubbery(HillScene.yewShape(), repeats.yews, 'hill-yews');
        for (const m of [posts, pots, leaves, shrubs, shrubsB, hedges, yews, flowers, stones, crosses, trunks, bare, leafy]) if (m) group.add(m);

        // The land: round the village and out over the vale to low hills in the haze
        group.add(HillScene.vale(lane));
        group.add(HillScene.trees(lane, repeats));
        HillScene.stands = repeats.stands;
        return { group, posts: repeats.posts.length, pots: repeats.pots.length, stands: repeats.stands };
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
            // (the twigs thin and open-ended, so the finer outline costs little)
            const g = new THREE.CylinderGeometry(radius * 0.6, radius, length, depth === 0 ? 4 : 5, 1, depth === 0);
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
        limb(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), 0.42, 0.035, 3);
        const merged = HillScene.mergeGeometries(parts);
        return merged;
    }

    // A leafy tree as one shape, a metre tall, for instancing, its colours in it: a trunk that forks into four limbs
    // rising and spreading, each ending in a cluster of small leaf clumps, and a few clumps over the top, so the crown is
    // open and ragged against the sky rather than one ball. Leaves in three greens, a clump's underside darker
    static leafyTree() {
        const rand = HillLane.random(523), positions = [], normals = [], colours = [];
        const add = (g, hex, shade = null) => {
            const n = g.index ? g.toNonIndexed() : g;
            n.computeVertexNormals();
            const c = new THREE.Color(hex), p = n.attributes.position, q = n.attributes.normal;
            for (let i = 0; i < p.count; i++) {
                positions.push(p.getX(i), p.getY(i), p.getZ(i));
                normals.push(q.getX(i), q.getY(i), q.getZ(i));
                const k = shade ? shade(q.getY(i)) : 1;
                colours.push(c.r * k, c.g * k, c.b * k);
            }
        };
        const bark = 0x4a4038, greens = [0x55693a, 0x4a5e34, 0x627646, 0x5a6e3e];
        const limb = (from, to, radius, ends) => {
            const d = to.clone().sub(from), length = d.length();
            const g = new THREE.CylinderGeometry(radius * 0.6, radius, length, 5, 1, ends);
            g.translate(0, length / 2, 0);
            g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
            g.translate(from.x, from.y, from.z);
            add(g, bark);
        };
        const clump = (at, r) => {
            const g = new THREE.IcosahedronGeometry(r, 0);
            g.scale(1, 0.8, 1);
            g.rotateY(rand() * Math.PI);
            g.translate(at.x, at.y, at.z);
            add(g, greens[Math.floor(rand() * greens.length)], ny => 0.72 + 0.28 * (ny * 0.5 + 0.5));
        };
        const fork = new THREE.Vector3(0, 0.42, 0);
        limb(new THREE.Vector3(0, 0, 0), fork, 0.035, false);
        for (let i = 0; i < 4; i++) {
            const a = i * Math.PI / 2 + rand() * 0.6, out = 0.16 + rand() * 0.1, up = 0.6 + rand() * 0.14;
            const end = new THREE.Vector3(Math.cos(a) * out, up, Math.sin(a) * out);
            limb(fork, end, 0.02, true);
            for (let k = 0; k < 3; k++) clump(end.clone().add(new THREE.Vector3((rand() - 0.5) * 0.22, (rand() - 0.2) * 0.14, (rand() - 0.5) * 0.22)), 0.11 + rand() * 0.07);
        }
        for (let k = 0; k < 4; k++) clump(new THREE.Vector3((rand() - 0.5) * 0.2, 0.8 + rand() * 0.12, (rand() - 0.5) * 0.2), 0.12 + rand() * 0.06);
        const out = new THREE.BufferGeometry();
        out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        out.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        out.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
        // (its colours are linear already, as THREE.Color gives them with colour management on)
        out.userData.linearColors = true;
        return out;
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
        HillScene.stand(repeats, 'tree', [x, z], [1, 0], 0.15, [0, 1], 0.15, y);
        const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI * 2);
        if (bare) {
            repeats.bare.push(m.clone().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(height, height, height)));
            return;
        }
        // (a little wider than tall, as the village's trees are)
        repeats.leafy.push(m.clone().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(height * (1.05 + rand() * 0.2), height, height * (1.05 + rand() * 0.2))));
    }

    // A clump of leaves (a shrub, a hedge piece, ivy on a wall, a window box's plants) at a point, sized sx, sy, sz
    static leaf(repeats, at, sx, sy, sz, colour, turn = 0) {
        const m = new THREE.Matrix4().compose(new THREE.Vector3(at[0], at[1], at[2]), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), turn), new THREE.Vector3(sx, sy, sz));
        repeats.leaves.push({ m, colour });
    }

    // A shrub (or a piece of hedge) at a point, sized sx, sy, sz as a leaf clump is: drawn from the shrub shape
    // (HillScene.shrubShape), turned its own way, one of its tints (SHRUB.tints) over the shape's own greens. Its variety
    // comes from the shrubs' own random sequence (repeats.shrubRand), so the places of everything else are as they were
    static shrub(repeats, at, sx, sy, sz, turn = 0, hedge = false) {
        const rand = repeats.shrubRand, S = HillScene.SHRUB, k = 1 + (rand() - 0.5) * S.sizeShare;
        // (a hedge's piece keeps its line along the hedge, turned end for end at most)
        const spin = hedge ? (rand() < 0.5 ? 0 : Math.PI) : rand() * Math.PI * 2;
        const m = new THREE.Matrix4().compose(new THREE.Vector3(at[0], at[1], at[2]), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), turn + spin),
            new THREE.Vector3(sx * k, sy * k * (1 + (rand() - 0.5) * S.sizeShare), sz * k));
        const list = hedge ? repeats.hedges : rand() < 0.5 ? repeats.shrubs : repeats.shrubsB;
        list.push({ m, colour: S.tints[Math.floor(rand() * S.tints.length)] });
    }

    // A churchyard yew, clipped to a tapering column, its foot at `at`
    static yew(repeats, at) {
        const rand = repeats.shrubRand;
        const m = new THREE.Matrix4().compose(new THREE.Vector3(at[0], at[1], at[2]), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI * 2),
            new THREE.Vector3(1, 0.95 + rand() * 0.15, 1));
        repeats.yews.push(m);
    }

    // The shrubs: a broken leafy outline of clumps over a few stems at the foot. sizeShare: how much each shrub's size
    // varies; tints: what each shrub's greens are multiplied by, for variety of tone
    static get SHRUB() {
        return Object.freeze({ clumps: 7, hedgeClumps: 4, roughShare: 0.16, stems: 3, sizeShare: 0.25,
            greens: [0x4e6236, 0x5d7440, 0x445a30, 0x52683a], bark: 0x4a3c30, tints: [0xffffff, 0xe6eedc, 0xf4ecd8, 0xd8e0d0] });
    }

    // The shrub's shape, a unit across like the leaf clump it replaces (its foot at y -1): leaf clumps, each a rough ball
    // of twenty faces, round a middle one and over it, darker underneath; three thin stems under them to the ground.
    // `seed` makes the two shapes the shrubs are drawn from
    static shrubShape(seed, hedge = false) {
        const S = HillScene.SHRUB, rand = HillLane.random(seed), positions = [], colours = [];
        const add = (g, hex, shade) => {
            const n = g.index ? g.toNonIndexed() : g, c = HillScene.rgb(hex), p = n.attributes.position;
            n.computeVertexNormals();
            const q = n.attributes.normal;
            for (let i = 0; i < p.count; i++) {
                positions.push(p.getX(i), p.getY(i), p.getZ(i));
                const k = shade ? shade(q.getY(i), p.getY(i)) : 1;
                colours.push(c[0] * k, c[1] * k, c[2] * k);
            }
        };
        const clump = (x, y, z, r) => {
            const g = new THREE.IcosahedronGeometry(r, 0), p = g.attributes.position;
            // (each corner pushed in or out, the same corner of every face alike, so the clump is rough and closed)
            const moved = new Map();
            for (let i = 0; i < p.count; i++) {
                const key = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
                if (!moved.has(key)) moved.set(key, 1 + (rand() - 0.5) * 2 * S.roughShare);
                const k = moved.get(key);
                p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
            }
            g.rotateY(rand() * Math.PI);
            g.translate(x, y, z);
            add(g, S.greens[Math.floor(rand() * S.greens.length)], (ny, py) => (0.68 + 0.32 * (ny * 0.5 + 0.5)) * (0.85 + 0.15 * Math.min(1, (py + 1) / 1.6)));
        };
        if (hedge) {
            // A hedge's piece: clumps along it (its length is x), filled out to its ends, no stems (the hedge is dense)
            for (let i = 0; i < S.hedgeClumps; i++) {
                const x = -0.75 + 1.5 * i / (S.hedgeClumps - 1);
                clump(x + (rand() - 0.5) * 0.15, (rand() - 0.5) * 0.2, (rand() - 0.5) * 0.3, 0.42 + rand() * 0.12);
            }
        } else {
            clump(0, 0.05, 0, 0.58);
            for (let i = 0; i < S.clumps - 2; i++) {
                const a = (i + rand() * 0.6) * 2 * Math.PI / (S.clumps - 2), out = 0.46 + rand() * 0.14;
                clump(Math.cos(a) * out, -0.22 + rand() * 0.42, Math.sin(a) * out, 0.36 + rand() * 0.14);
            }
            clump((rand() - 0.5) * 0.3, 0.48, (rand() - 0.5) * 0.3, 0.38);
        }
        for (let i = 0; i < (hedge ? 0 : S.stems); i++) {
            const a = (i + rand() * 0.5) * 2 * Math.PI / S.stems, x = Math.cos(a) * 0.12, z = Math.sin(a) * 0.12;
            const g = new THREE.CylinderGeometry(0.025, 0.04, 0.62, 3, 1, true);
            g.translate(0, -0.69, 0);
            g.rotateZ((rand() - 0.5) * 0.4);
            g.translate(x, 0, z);
            add(g, S.bark);
        }
        const out = new THREE.BufferGeometry();
        out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        out.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
        out.computeVertexNormals();
        // (its colours decoded once already, HillScene.rgb)
        out.userData.linearColors = true;
        return out;
    }

    // A clipped yew in metres, its foot at 0: a short trunk under a tapering column of leaf clumps, 4.4 m high
    static yewShape() {
        const rand = HillLane.random(907), positions = [], colours = [];
        const greens = [0x2e3e26, 0x34462c, 0x2a3822];
        const add = (g, hex, shade) => {
            const n = g.index ? g.toNonIndexed() : g, c = HillScene.rgb(hex), p = n.attributes.position;
            n.computeVertexNormals();
            const q = n.attributes.normal;
            for (let i = 0; i < p.count; i++) {
                positions.push(p.getX(i), p.getY(i), p.getZ(i));
                const k = shade ? shade(q.getY(i)) : 1;
                colours.push(c[0] * k, c[1] * k, c[2] * k);
            }
        };
        add(new THREE.CylinderGeometry(0.12, 0.16, 0.7, 5, 1, true).translate(0, 0.35, 0), HillScene.SHRUB.bark);
        const rows = 6;
        for (let k = 0; k < rows; k++) {
            const y = 0.75 + k * 0.62, wide = 1.15 * (1 - k / (rows + 1.2)), count = k < rows - 1 ? 6 : 3;
            for (let i = 0; i < count; i++) {
                const a = (i + rand() * 0.5 + k * 0.4) * 2 * Math.PI / count, out = wide * (0.55 + rand() * 0.2), r = 0.32 + wide * 0.22 + rand() * 0.08;
                const g = new THREE.IcosahedronGeometry(r, 0);
                g.scale(1, 0.85, 1);
                g.rotateY(rand() * Math.PI);
                g.translate(Math.cos(a) * out, y + (rand() - 0.5) * 0.15, Math.sin(a) * out);
                add(g, greens[Math.floor(rand() * greens.length)], ny => 0.7 + 0.3 * (ny * 0.5 + 0.5));
            }
            add(new THREE.IcosahedronGeometry(wide * 0.62, 0).translate(0, y, 0), greens[k % 2], ny => 0.7 + 0.3 * (ny * 0.5 + 0.5));
        }
        add(new THREE.IcosahedronGeometry(0.3, 0).translate(0, 0.75 + rows * 0.62, 0), greens[1], ny => 0.75 + 0.25 * (ny * 0.5 + 0.5));
        const out = new THREE.BufferGeometry();
        out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        out.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
        out.computeVertexNormals();
        out.userData.linearColors = true;
        return out;
    }

    // The gravestones' weathered tones (multiplied over the stone's own grey)
    static get STONE_TINTS() { return [0xb8b2a6, 0xa8a49a, 0xc4beb0, 0x9a968c, 0xb0aa98]; }

    // A headstone a unit across, high and thick (scaled by each stone): its face and back flat, its top rounded in an
    // arch with shoulders, its edges cut back a little
    static headstoneShape() {
        const shape = new THREE.Shape(), w = 0.5, h = 0.5, shoulder = 0.22;
        shape.moveTo(-w, -h);
        shape.lineTo(w, -h);
        shape.lineTo(w, h - shoulder);
        shape.lineTo(w * 0.9, h - shoulder);
        shape.absarc(0, h - shoulder, w * 0.9, 0, Math.PI, false);
        shape.lineTo(-w, h - shoulder);
        shape.lineTo(-w, -h);
        const g = new THREE.ExtrudeGeometry(shape, { depth: 0.84, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.04, bevelSegments: 1, curveSegments: 7 });
        g.translate(0, 0, -0.5);
        // (the arch's top within the unit: the stone's height is its scale)
        g.computeBoundingBox();
        const b = g.boundingBox;
        g.translate(0, -(b.max.y + b.min.y) / 2, 0);
        g.scale(1 / (b.max.x - b.min.x), 1 / (b.max.y - b.min.y), 1);
        return g;
    }

    // A plain stone cross on a two-stepped base, its foot at 0, 1 high (scaled by each cross's height)
    static crossShape() {
        const parts = [
            new THREE.BoxGeometry(0.46, 0.08, 0.3).translate(0, 0.04, 0),
            new THREE.BoxGeometry(0.32, 0.07, 0.22).translate(0, 0.115, 0),
            new THREE.BoxGeometry(0.11, 0.86, 0.09).translate(0, 0.15 + 0.43, 0),
            new THREE.BoxGeometry(0.44, 0.1, 0.09).translate(0, 0.76, 0)
        ];
        const positions = [], normals = [];
        for (const g of parts) {
            const n = g.toNonIndexed();
            positions.push(...n.attributes.position.array);
            normals.push(...n.attributes.normal.array);
        }
        const out = new THREE.BufferGeometry();
        out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        out.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        return out;
    }

    static flower(repeats, at, size, colour) {
        const m = new THREE.Matrix4().compose(new THREE.Vector3(at[0], at[1], at[2]), new THREE.Quaternion(), new THREE.Vector3(size, size, size));
        repeats.flowers.push({ m, colour });
    }

    // Notes a piece that stands on the ground: its footprint (centre [x, z], half `hu` along the unit [ux, uz], half `hv`
    // along [vx, vz]) and its foot's height
    static stand(repeats, kind, at, u, hu, v, hv, y) {
        repeats.stands.push({ kind, x: at[0], z: at[1], ux: u[0], uz: u[1], hu, vx: v[0], vz: v[1], hv, y });
    }

    // A box that stands on the ground up to `top`: its foot `sink` under the lowest land or paved surface under it (or
    // lower, `low`), noted with HillScene.stand. `o` is its centre on the ground's plan [x, z], `ax` and `az` its
    // half-extents as plan vectors. Returns the foot
    static standing(lane, repeats, kind, mesh, o, ax, az, top, colour, { sink = 0.05, low = Infinity } = {}) {
        const hu = Math.hypot(ax[0], ax[1]) || 1e-6, hv = Math.hypot(az[0], az[1]) || 1e-6;
        const u = [ax[0] / hu, ax[1] / hu], v = [az[0] / hv, az[1] / hv];
        const foot = Math.min(low, HillScene.lowestSurface(lane, o[0], o[1], u, hu, v, hv) - sink);
        mesh.box([o[0], (foot + top) / 2, o[1]], [ax[0], 0, ax[1]], [0, (top - foot) / 2, 0], [az[0], 0, az[1]], colour);
        HillScene.stand(repeats, kind, o, u, hu, v, hv, foot);
        return foot;
    }

    // The lowest ground under a footprint: the land, or a paved surface where one covers it (HillLand.surfaceAt)
    static lowestSurface(lane, x, z, u, hu, v, hv) {
        const land = lane.ground();
        let least = Infinity;
        const nu = Math.max(1, Math.ceil(2 * hu / 0.5)), nv = Math.max(1, Math.ceil(2 * hv / 0.5));
        for (let a = 0; a <= nu; a++) for (let b = 0; b <= nv; b++) {
            const s = -hu + 2 * hu * a / nu, t = -hv + 2 * hv * b / nv;
            least = Math.min(least, land.surfaceAt(x + u[0] * s + v[0] * t, z + u[1] * s + v[1] * t));
        }
        return least;
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
        const rand = HillScene.gapRandom(gap);
        const front = gap.side * (r.halfWidthM + r.flagsM + 0.15);
        const garden = gap.kind === 'garden' || gap.kind === 'front';
        const hedge = garden && rand() < 0.45;
        const gateAt = HillScene.gateAt(gap);
        if (gap.gate) rand();
        // The green is open to the lane: no wall along it
        for (let s = gap.from; s < gap.to - 0.05 && gap.kind !== 'green'; s += 1) {
            const e = Math.min(s + 1, gap.to);
            if (gateAt !== null && Math.abs((s + e) / 2 - gateAt) < 0.6) {
                // The gate: two stone piers and a wooden gate between, a little open
                const p = lane.sample(gateAt), at = lane.at(gateAt, front, 0, {});
                for (const k of [-0.65, 0.65]) {
                    HillScene.standing(lane, repeats, 'gate pier', meshes.dressed, [at.x + p.alongX * k, at.z + p.alongZ * k], [p.alongX * 0.15, p.alongZ * 0.15], [p.leftX * 0.18, p.leftZ * 0.18], at.y + 1.25, rgb(C.coping));
                }
                meshes.plain.box([at.x, at.y + 0.55, at.z], [p.alongX * 0.48, 0, p.alongZ * 0.48], [0, 0.42, 0], [p.leftX * 0.025, 0, p.leftZ * 0.025], rgb(0x4a5a46));
                continue;
            }
            const mid = lane.sample((s + e) / 2);
            const at = lane.at((s + e) / 2, front, 0, {});
            const half = (e - s) / 2 + 0.01;
            if (hedge) {
                // A hedge's foot a little into the lowest ground under it
                const ground = HillScene.lowestSurface(lane, at.x, at.z, [mid.alongX, mid.alongZ], half, [mid.leftX, mid.leftZ], 0.3);
                rand();
                HillScene.shrub(repeats, [at.x, ground + 0.55, at.z], half * 1.1, 0.6, 0.35, mid.heading, true);
                HillScene.stand(repeats, 'hedge', [at.x, at.z], [mid.alongX, mid.alongZ], half, [mid.leftX, mid.leftZ], 0.3, ground - 0.05);
                continue;
            }
            const top = mid.y + (gap.upM || r.lowWallUpM);
            HillScene.standing(lane, repeats, gap.kind === 'churchyard' ? 'churchyard wall' : 'wall', meshes.rubble, [at.x, at.z], [mid.alongX * half, mid.alongZ * half], [mid.leftX * 0.15, mid.leftZ * 0.15], top, rgb(C.gardenWall), { sink: 0.3, low: mid.y - 0.3 });
            meshes.dressed.box([at.x, top + 0.05, at.z], [mid.alongX * (half + 0.02), 0, mid.alongZ * (half + 0.02)], [0, 0.05, 0], [mid.leftX * 0.2, 0, mid.leftZ * 0.2], rgb(C.coping));
            // Moss along the coping here and there
            if (rand() < 0.22) HillScene.leaf(repeats, [at.x + mid.alongX * (rand() - 0.5) * half, top + 0.1, at.z + mid.alongZ * (rand() - 0.5) * half], half * 0.5, 0.035, 0.16, [0x4a5a30, 0x56683a][Math.floor(rand() * 2)], mid.heading);
            if (gap === HillScene.catWall(lane) && Math.abs((s + e) / 2 - HillScene.catAt(gap)) < 0.5) HillScene.cat(meshes, at, top + 0.1, mid, gap.side);
            if (gap.kind === 'view') {
                // The view's railing on the wall's coping: posts on it, a rail along their tops falling with the wall
                const m = new THREE.Matrix4(), q = new THREE.Quaternion(), size = new THREE.Vector3(1, 0.85, 1);
                for (let k = 0; k < 4; k++) {
                    const pt = lane.at(s + (k + 0.5) * (e - s) / 4, front, 0, {}), y = lane.sample(s + (k + 0.5) * (e - s) / 4).y + gap.upM + 0.1;
                    repeats.posts.push(m.clone().compose(new THREE.Vector3(pt.x, y + 0.425, pt.z), q, size));
                }
                const a = lane.at(s, front, 0, {}), b = lane.at(e, front, 0, {});
                const ya = lane.sample(s).y + gap.upM + 0.92, yb = lane.sample(e).y + gap.upM + 0.92;
                meshes.dark.box([(a.x + b.x) / 2, (ya + yb) / 2, (a.z + b.z) / 2], [(b.x - a.x) / 2, (yb - ya) / 2, (b.z - a.z) / 2], [0, 0.025, 0], [mid.leftX * 0.025, 0, mid.leftZ * 0.025], rgb(C.iron));
            }
        }
        if (gap.kind === 'green') HillScene.green(lane, gap, meshes, repeats);
        if (!garden && gap.kind !== 'churchyard' && gap.kind !== 'green') return;
        // The garden behind, as deep as a cottage (a front garden to its house, the green and the churchyard their own),
        // with shrubs and flowers along its edges and a tree
        const deep = gap.kind === 'churchyard' ? r.church.backM + r.church.nave[1] + 4 : gap.kind === 'front' ? gap.deep - 0.15 : gap.deep || r.cottageDeepM;
        // (the lawn is the land itself, drawn as grass; the path and the beds are laid on it)
        const land = lane.ground();
        const on = (s, across) => {
            const q = lane.at(s, across, 0, {});
            return [q.x, land.heightAt(q.x, q.z) + 0.05, q.z];
        };
        if (gap.kind === 'churchyard' || gap.kind === 'green') return;
        if (gap.kind === 'front' && gateAt !== null) {
            // The path from the gate to the door, flags laid on the land
            const flags = rgb(C.flags);
            for (let k = 0; k < Math.ceil(deep); k++) {
                const a0 = front + gap.side * (0.15 + k * deep / Math.ceil(deep)), a1 = front + gap.side * (0.15 + (k + 1) * deep / Math.ceil(deep));
                const lift = (q) => [q[0], q[1] + 0.02, q[2]];
                meshes.dressed.quad(lift(on(gateAt - 0.45, a0)), lift(on(gateAt + 0.45, a0)), lift(on(gateAt + 0.45, a1)), lift(on(gateAt - 0.45, a1)), flags);
            }
        }
        const greens = [0x4e6236, 0x5d7440, 0x445a30];
        const blooms = [0xc8463a, 0xe0c04a, 0xe8e2d8, 0x9a5aa0];
        if (gap.kind === 'front') {
            // A border of flowers inside the front wall, clear of the gate
            for (let s = gap.from + 0.5; s < gap.to - 0.4; s += 1.2) {
                if (gateAt !== null && Math.abs(s - gateAt) < 0.9) continue;
                const a = lane.at(s, front + gap.side * 0.45, 0, {}), ground = HillScene.lowestSurface(lane, a.x, a.z, [1, 0], 0.2, [0, 1], 0.2);
                rand();
                HillScene.shrub(repeats, [a.x, ground + 0.15, a.z], 0.3, 0.2, 0.2);
                HillScene.stand(repeats, 'shrub', [a.x, a.z], [1, 0], 0.1, [0, 1], 0.1, ground - 0.05);
                for (let k = 0; k < 2; k++) HillScene.flower(repeats, [a.x + (rand() - 0.5) * 0.4, ground + 0.36, a.z + (rand() - 0.5) * 0.3], 0.05, blooms[Math.floor(rand() * blooms.length)]);
            }
        }
        if (gap.kind === 'garden' && gap.to - gap.from > 5 && rand() < 0.35) {
            // Washing on a line across the garden, its posts in the land
            const out = front + gap.side * 3.2, wood = rgb(0x6a5a48), p = lane.sample((gap.from + gap.to) / 2);
            const ends = [gap.from + 1, gap.to - 1].map(s => lane.at(s, out, 0, {}));
            const tops = ends.map(a => {
                const top = land.surfaceAt(a.x, a.z) + 2;
                HillScene.standing(lane, repeats, 'washing post', meshes.plain, [a.x, a.z], [p.alongX * 0.04, p.alongZ * 0.04], [p.leftX * 0.04, p.leftZ * 0.04], top, wood);
                return top - 0.1;
            });
            const [a, b] = ends;
            meshes.plain.box([(a.x + b.x) / 2, (tops[0] + tops[1]) / 2, (a.z + b.z) / 2], [(b.x - a.x) / 2, (tops[1] - tops[0]) / 2, (b.z - a.z) / 2], [0, 0.006, 0], [p.leftX * 0.006, 0, p.leftZ * 0.006], rgb(0xe8e4dc));
            for (let k = 0; k < 4; k++) {
                const t = 0.2 + k * 0.2 + (rand() - 0.5) * 0.06, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, y = tops[0] + (tops[1] - tops[0]) * t;
                meshes.plain.box([x, y - 0.26, z], [p.alongX * (0.2 + rand() * 0.1), 0, p.alongZ * (0.2 + rand() * 0.1)], [0, 0.25, 0], [p.leftX * 0.01, 0, p.leftZ * 0.01], rgb([0xe8e4dc, 0xc8b8a0, 0x9aa8b8, 0xd0c0c8][k]));
            }
        }
        for (let i = 0; i < 3 + Math.floor(rand() * 4); i++) {
            const s = gap.from + 0.5 + rand() * (gap.to - gap.from - 1);
            const a = lane.at(s, front + gap.side * (0.8 + rand() * (deep - 1.6)), 0.4, {});
            const size = 0.4 + rand() * 0.6;
            // A shrub: its foot a little into the lowest land under it
            a.y = HillScene.lowestSurface(lane, a.x, a.z, [1, 0], size * 0.5, [0, 1], size * 0.5) + size * 0.7;
            HillScene.shrub(repeats, [a.x, a.y, a.z], size, size * 0.8, size);
            HillScene.stand(repeats, 'shrub', [a.x, a.z], [1, 0], 0.1, [0, 1], 0.1, a.y - size * 0.8);
            if (rand() < 0.6) for (let k = 0; k < 4; k++) HillScene.flower(repeats, [a.x + (rand() - 0.5) * size, a.y + size * 0.6, a.z + (rand() - 0.5) * size], 0.06, blooms[Math.floor(rand() * blooms.length)]);
        }
        if (gap.kind === 'garden' && gap.to - gap.from > 4 && rand() < 0.7) {
            const s = (gap.from + gap.to) / 2, a = lane.at(s, front + gap.side * (deep - 1.5), 0, {});
            HillScene.tree(repeats, a.x, HillScene.lowestSurface(lane, a.x, a.z, [1, 0], 0.4, [0, 1], 0.4) - 0.1, a.z, 6 + rand() * 4, rand() < 0.5, rand);
        }
    }

    // The green's things (HillLane.RULE.green): a big tree, a bench facing the lane and an iron pump over a stone
    // trough, each standing in the land
    static green(lane, gap, meshes, repeats) {
        const C = HillScene.COLOURS, rgb = HillScene.rgb, r = lane.rule, g = r.green, land = lane.ground();
        const edge = r.halfWidthM + r.flagsM + 0.3;
        const place = (share, out) => {
            const s = gap.from + (gap.to - gap.from) * share, p = lane.sample(s), q = lane.at(s, gap.side * (edge + out), 0, {});
            return { x: q.x, z: q.z, a: [p.alongX, p.alongZ], o: [p.leftX * gap.side, p.leftZ * gap.side], heading: p.heading };
        };
        // The tree: the leafy tree's limbs and clumps (HillScene.leafyTree), broad, two of them turned about each other so
        // its crown is full and ragged
        const t = place(g.tree[0], g.tree[1]), high = g.tree[2];
        const ground = HillScene.lowestSurface(lane, t.x, t.z, [1, 0], 0.7, [0, 1], 0.7) - 0.1;
        HillScene.stand(repeats, 'tree', [t.x, t.z], [1, 0], 0.3, [0, 1], 0.3, ground);
        for (const [turn, wide] of [[0, 1.5], [0.8, 1.35]]) {
            repeats.leafy.push(new THREE.Matrix4().compose(new THREE.Vector3(t.x, ground, t.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), turn), new THREE.Vector3(high * wide, high, high * wide)));
        }
        // The bench: two stone ends standing in the land, a timber seat and back between, along the lane
        const b = place(g.bench[0], g.bench[1]), wood = rgb(0x6a5440), stone = rgb(C.coping);
        // (the seat at the higher end's ground, so both ends reach it)
        const ends = [-0.75, 0.75].map(k => [b.x + b.a[0] * k, b.z + b.a[1] * k]);
        const seat = Math.max(...ends.map(at => land.surfaceAt(at[0], at[1])));
        const top = seat + 0.45;
        for (const k of [-0.75, 0.75]) HillScene.standing(lane, repeats, 'bench end', meshes.dressed, [b.x + b.a[0] * k, b.z + b.a[1] * k], [b.a[0] * 0.06, b.a[1] * 0.06], [b.o[0] * 0.22, b.o[1] * 0.22], top, stone);
        // (the seat three slats with gaps between, the back two, leaning back a little, an arm along each end)
        for (const across of [-0.16, 0, 0.16]) meshes.plain.box([b.x + b.o[0] * across, top + 0.03, b.z + b.o[1] * across], [b.a[0] * 0.9, 0, b.a[1] * 0.9], [0, 0.025, 0], [b.o[0] * 0.065, 0, b.o[1] * 0.065], wood);
        for (const [up, back] of [[0.24, 0.22], [0.44, 0.25]]) meshes.plain.box([b.x + b.o[0] * back, top + up, b.z + b.o[1] * back], [b.a[0] * 0.9, 0, b.a[1] * 0.9], [b.o[0] * 0.012, 0.06, b.o[1] * 0.012], [b.o[0] * 0.02, 0, b.o[1] * 0.02], wood);
        for (const k of [-0.75, 0.75]) meshes.plain.box([b.x + b.a[0] * k, top + 0.25, b.z + b.a[1] * k], [b.a[0] * 0.04, 0, b.a[1] * 0.04], [0, 0.025, 0], [b.o[0] * 0.24, 0, b.o[1] * 0.24], wood);
        // The pump: a stone trough and the iron column beside it, its spout over the trough and its handle
        const p = place(g.pump[0], g.pump[1]);
        const trough = HillScene.standing(lane, repeats, 'trough', meshes.dressed, [p.x, p.z], [p.a[0] * 0.6, p.a[1] * 0.6], [p.o[0] * 0.3, p.o[1] * 0.3], land.heightAt(p.x, p.z) + 0.5, stone);
        const col = [p.x + p.o[0] * 0.55, p.z + p.o[1] * 0.55];
        const colTop = trough + 0.3 + 1.45;
        HillScene.standing(lane, repeats, 'pump', meshes.dark, col, [p.a[0] * 0.09, p.a[1] * 0.09], [p.o[0] * 0.09, p.o[1] * 0.09], colTop, rgb(C.iron));
        meshes.dark.box([col[0] - p.o[0] * 0.2, colTop - 0.35, col[1] - p.o[1] * 0.2], [p.a[0] * 0.03, 0, p.a[1] * 0.03], [0, 0.03, 0], [p.o[0] * 0.2, 0, p.o[1] * 0.2], rgb(C.iron));
        meshes.dark.box([col[0] + p.a[0] * 0.3, colTop - 0.1, col[1] + p.a[1] * 0.3], [p.a[0] * 0.3, 0.12, p.a[1] * 0.3], [0, 0.02, 0], [p.o[0] * 0.02, 0, p.o[1] * 0.02], rgb(C.iron));
        meshes.dark.box([col[0], colTop + 0.06, col[1]], [p.a[0] * 0.12, 0, p.a[1] * 0.12], [0, 0.06, 0], [p.o[0] * 0.12, 0, p.o[1] * 0.12], rgb(C.iron));
        // (its cap's knob, a collar under the cap, a plinth at its foot, the handle's knob)
        meshes.dark.box([col[0], colTop + 0.15, col[1]], [p.a[0] * 0.05, 0, p.a[1] * 0.05], [0, 0.03, 0], [p.o[0] * 0.05, 0, p.o[1] * 0.05], rgb(C.iron));
        meshes.dark.box([col[0], colTop - 0.06, col[1]], [p.a[0] * 0.11, 0, p.a[1] * 0.11], [0, 0.025, 0], [p.o[0] * 0.11, 0, p.o[1] * 0.11], rgb(C.iron));
        meshes.dark.box([col[0], trough - 0.4, col[1]], [p.a[0] * 0.14, 0, p.a[1] * 0.14], [0, 0.1, 0], [p.o[0] * 0.14, 0, p.o[1] * 0.14], rgb(C.iron));
        meshes.dark.box([col[0] + p.a[0] * 0.58, colTop - 0.06, col[1] + p.a[1] * 0.58], [p.a[0] * 0.035, 0, p.a[1] * 0.035], [0, 0.035, 0], [p.o[0] * 0.035, 0, p.o[1] * 0.035], rgb(C.iron));
    }

    // The wall the cat sits on: the first garden or front wall on the left between s 96 and 180 at least 3 m long,
    // seen from the chase view down the main straight
    static catWall(lane) {
        if (lane.catWall === undefined) lane.catWall = lane.walls.find(w => w.side === 1 && (w.kind === 'garden' || w.kind === 'front') && w.from >= 96 && w.to <= 180 && w.to - w.from >= 3) || null;
        return lane.catWall;
    }

    // Where along the cat's wall it sits: at the end away from the gate
    static catAt(gap) {
        const gate = HillScene.gateAt(gap), mid = (gap.from + gap.to) / 2;
        return gate !== null && gate < mid ? gap.to - 0.8 : gap.from + 0.8;
    }

    // A cat sitting on a wall's coping (`y` its top), side on to the lane, its tail down the wall's face
    static cat(meshes, at, y, p, side) {
        const fur = HillScene.rgb(0x9a5a2a), dark = HillScene.rgb(0x5a3418);
        const A = [p.alongX, p.alongZ], L = [p.leftX * side, p.leftZ * side];
        const box = (along, up, out, ha, hu, ho, colour) => meshes.plain.box([at.x + A[0] * along + L[0] * out, y + up, at.z + A[1] * along + L[1] * out], [A[0] * ha, 0, A[1] * ha], [0, hu, 0], [L[0] * ho, 0, L[1] * ho], colour);
        box(0, 0.09, 0, 0.11, 0.09, 0.07, fur);
        box(0.08, 0.17, 0, 0.05, 0.12, 0.06, fur);
        box(0.1, 0.31, 0, 0.055, 0.05, 0.055, fur);
        for (const k of [-1, 1]) box(0.1, 0.38, k * 0.035, 0.012, 0.025, 0.012, dark);
        box(-0.1, -0.12, -0.23, 0.015, 0.14, 0.015, fur);
    }

    // A gap's own random sequence (HillScene.gap draws from it in order: the hedge, then the gate's place)
    static gapRandom(gap) {
        return HillLane.random(Math.round(gap.from * 31) + gap.side * 7);
    }

    // Where a gap's gate stands along the lane (s), or null
    static gateAt(gap) {
        if (gap.gateS !== undefined) return gap.gateS;
        if (!gap.gate) return null;
        const rand = HillScene.gapRandom(gap);
        if (gap.kind === 'garden') rand();
        return gap.from + (gap.to - gap.from) * (0.3 + rand() * 0.4);
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
        HillScene.stand(repeats, 'church', [c.x, c.z], [c.alongX, c.alongZ], hw, [c.outX, c.outZ], hd, c.foot);
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
        const towerAt = pt(tAlong, 0, tOut);
        HillScene.stand(repeats, 'church tower', [towerAt[0], towerAt[2]], [c.alongX, c.alongZ], tw / 2, [c.outX, c.outZ], td / 2, c.foot);
        meshes.door.box(pt(tAlong, c.floor + 1.3, tOut - td / 2 - 0.03), vec(0.7, 0, 0), [0, 1.3, 0], vec(0, 0, 0.05), rgb(0x5a4430));
        for (const k of [-1, 1]) meshes.dark.box(pt(tAlong + k * 0.9, c.floor + th - 2.5, tOut - td / 2 - 0.03), vec(0.3, 0, 0), [0, 0.8, 0], vec(0, 0, 0.04), rgb(0x2a2e34));
        // The spire: four faces up to a point
        const base = c.floor + th, apex = pt(tAlong, base + R.spire, tOut);
        const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => pt(tAlong + a * tw / 2, base, tOut + b * td / 2));
        for (let i = 0; i < 4; i++) meshes.slate.tri(corners[i], corners[(i + 1) % 4], apex, rgb(C.slate));
        // The yard: gravestones in rows, two yews, each with its foot in the land; a flagged path from the gate to the
        // tower's door
        const land = lane.ground();
        const rand = HillLane.random(Math.round(c.from * 13));
        for (let row = 0; row < 5; row++) for (let i = 0; i < 6; i++) {
            if (rand() < 0.3) continue;
            const along = -hw + 1 + i * (length - 2) / 5 + (rand() - 0.5) * 0.6;
            const turn = c.heading + (rand() - 0.5) * 0.2, high = 0.7 + rand() * 0.3;
            const at = pt(along, 0, -hd - 2 - row * 1.8);
            const ux = Math.sin(turn), uz = Math.cos(turn);
            const ground = HillScene.lowestSurface(lane, at[0], at[2], [ux, uz], 0.25, [uz, -ux], 0.05);
            const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), turn);
            // Each its own weathered tone (STONE_TINTS), a little out of true as old stones are; its foot in the land
            const tint = HillScene.STONE_TINTS[Math.floor(repeats.shrubRand() * HillScene.STONE_TINTS.length)];
            q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (repeats.shrubRand() - 0.5) * 0.08));
            if (rand() < 0.3) {
                // A plain cross on a stepped base (HillScene.crossShape: its foot at 0, 1 high and 0.5 across)
                repeats.crosses.push({ m: new THREE.Matrix4().compose(new THREE.Vector3(at[0], ground - 0.12, at[2]), q, new THREE.Vector3(1, high + 0.2, 1)), colour: tint });
            } else repeats.stones.push({ m: new THREE.Matrix4().compose(new THREE.Vector3(at[0], ground - 0.12 + high / 2, at[2]), q, new THREE.Vector3(0.5, high, 0.1)), colour: tint });
            HillScene.stand(repeats, 'gravestone', [at[0], at[2]], [ux, uz], 0.25, [uz, -ux], 0.05, ground - 0.12);
        }
        for (const [along, out] of [[-hw + 1, -hd - 11], [hw - 1, -hd - 11], [-hw - 4, -hd - 3], [hw + 1.5, -hd - 4]]) {
            const at = pt(along, 0, out);
            const ground = HillScene.lowestSurface(lane, at[0], at[2], [c.alongX, c.alongZ], 0.8, [c.outX, c.outZ], 0.8);
            // A yew: a dark column of clumps narrowing to its top
            HillScene.yew(repeats, [at[0], ground - 0.1, at[2]]);
            HillScene.stand(repeats, 'yew', [at[0], at[2]], [c.alongX, c.alongZ], 0.3, [c.outX, c.outZ], 0.3, ground - 0.1);
        }
        const gate = lane.walls.find(w => w.kind === 'churchyard');
        if (gate) {
            const door = pt(tAlong, 0, tOut - td / 2 - 0.6);
            const front = lane.rule.halfWidthM + lane.rule.flagsM + 0.3;
            const g = HillScene.gateAt(gate), from = lane.at(g, c.side * front, 0, {});
            const dx = door[0] - from.x, dz = door[2] - from.z, l = Math.hypot(dx, dz), ux = dx / l, uz = dz / l;
            const flags = rgb(C.flags);
            for (let d = 0; d < l - 1e-6; d += 1) {
                const e = Math.min(l, d + 1);
                const q = (t, w) => {
                    const x = from.x + ux * t - uz * w, z = from.z + uz * t + ux * w;
                    return [x, land.surfaceAt(x, z) + 0.04, z];
                };
                meshes.dressed.quad(q(d, -0.6), q(d, 0.6), q(e, 0.6), q(e, -0.6), flags);
            }
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
        // A piece standing in the yard up to `top`: its foot at the yard's level (`low`) or under the land, where lower
        const stand = (kind, mesh, along, out, ha, ho, top, colour, low = c.floor) => {
            const at = pt(along, 0, out);
            return HillScene.standing(lane, repeats, kind, mesh, [at[0], at[2]], [A[0] * ha, A[2] * ha], [O[0] * ho, O[2] * ho], top, colour, { sink: 0.05, low });
        };
        const rand = HillLane.random(Math.round(c.from * 29) + c.side * 5);
        const hw = c.hw, hd = c.hd, back = hd;
        const frame = rgb(C.frame), glass = rgb(C.glass), iron = rgb(C.iron);
        const { mesh: wallMesh, hex: wallHex } = HillScene.wallOf(c, meshes);
        if (c.seen.back) {
            const doorAt = (rand() - 0.5) * hw;
            box(meshes.trim, doorAt, c.floor + 1.05, back + 0.03, 0.46, 1.06, 0.04, frame);
            box(meshes.door, doorAt, c.floor + 0.95, back + 0.06, 0.4, 0.95, 0.03, rgb(C.doors[(c.doorColour + 2) % 5]));
            stand('step', meshes.dressed, doorAt, back + 0.25, 0.5, 0.25, c.floor + 0.06, rgb(C.step), c.floor - 0.18);
            for (let storey = 0; storey < c.storeys; storey++) {
                for (const along of [-hw * 0.55, hw * 0.55]) {
                    if (storey === 0 && Math.abs(along - doorAt) < 1) continue;
                    const y = c.floor + 1.6 + storey * 2.1;
                    box(meshes.trim, along, y, back + 0.02, 0.32, 0.4, 0.025, frame);
                    box(meshes.glass, along, y, back + 0.035, 0.27, 0.35, 0.02, glass);
                    box(meshes.dressed, along, y - 0.45, back + 0.07, 0.38, 0.04, 0.08, rgb(C.sill));
                }
            }
            // The gutter along the back's eave (thatch has none), the drainpipe and the soil stack
            if (c.roof !== 'thatch' && !c.gable) box(meshes.dark, 0, c.eaves - 0.05 - 0.135 - 0.04, back + 0.24, hw + 0.15, 0.045, 0.06, iron);
            box(meshes.dark, hw - 0.2, (c.floor + c.eaves) / 2, back + 0.08, 0.04, (c.eaves - c.floor) / 2, 0.04, iron);
            box(meshes.dark, -hw * 0.2, (c.floor + c.eaves + 0.6) / 2, back + 0.1, 0.06, (c.eaves + 0.6 - c.floor) / 2, 0.06, iron);
            // A lean-to shed against the back, its roof sloping away
            if (rand() < 0.5) {
                const along = (rand() < 0.5 ? -1 : 1) * hw * 0.5, w = 0.9 + rand() * 0.6, dp = 1.2 + rand() * 0.6, h = 2 + rand() * 0.3;
                stand('shed', rand() < 0.5 ? meshes.brick : wallMesh, along, back + dp / 2, w, dp / 2, c.floor + h, rgb(rand() < 0.5 ? 0xffffff : wallHex), c.floor - 0.2);
                const hi = pt(along, c.floor + h + 0.25, back), lo = pt(along, c.floor + h - 0.35, back + dp + 0.25);
                meshes.slate.box([(hi[0] + lo[0]) / 2, (hi[1] + lo[1]) / 2 + 0.05, (hi[2] + lo[2]) / 2], vec(w + 0.12, 0, 0), [0, 0.04, 0],
                    [(lo[0] - hi[0]) / 2, (lo[1] - hi[1]) / 2, (lo[2] - hi[2]) / 2], rgb(C.slate));
                box(meshes.door, along, c.floor + 0.85, back + dp + 0.03, 0.35, 0.85, 0.02, rgb(0x5a4a38));
            }
            // A water butt by the downpipe
            if (rand() < 0.6) stand('water butt', meshes.plain, hw - 0.5, back + 0.4, 0.3, 0.3, c.floor + 0.9, rgb(0x2e4632));
            // A rear extension with its own roof
            if (rand() < 0.22) {
                const along = -hw * 0.4, w = Math.min(1.8, hw * 0.6), dp = 2.5, h = c.storeys > 1 ? 3.2 : 2.6;
                stand('extension', wallMesh, along, back + dp / 2, w, dp / 2, c.floor + h, rgb(wallHex), c.foot);
                for (const side of [-1, 1]) {
                    const mid = pt(along + side * w / 2, c.floor + h + 0.5, back + dp / 2);
                    meshes.tile.box([mid[0], mid[1], mid[2]], vec(w / 2 + 0.1, 0.5 * 0, 0), [0, 0.05, 0], vec(0, 0, dp / 2 + 0.15), rgb(C.tile));
                }
                box(meshes.trim, along, c.floor + 1.5, back + dp + 0.02, 0.3, 0.4, 0.025, frame);
            }
            // A washing line across the garden, a few cloths on it
            if (rand() < 0.3) {
                const far = back + 4 + rand() * 2;
                for (const along of [-hw * 0.7, hw * 0.7]) stand('washing post', meshes.plain, along, far, 0.04, 0.04, c.floor + 2.2, rgb(0x6a5a48));
                box(meshes.plain, 0, c.floor + 2.1, far, hw * 0.7, 0.008, 0.008, rgb(0xe8e4dc));
                for (let k = 0; k < 4; k++) {
                    const along = -hw * 0.5 + k * hw * 0.33 + (rand() - 0.5) * 0.2;
                    box(meshes.plain, along, c.floor + 1.8, far, 0.22 + rand() * 0.1, 0.28, 0.01, rgb([0xe8e4dc, 0xc8b8a0, 0x9aa8b8, 0xd0c0c8][k]));
                }
            }
            // The back garden's fence: across the far end of the yard and down both its sides to the house, so it closes
            // the garden and never stands alone; each post's foot in the ground
            if (rand() < 0.45) {
                const far = back + 7, wood = rgb(0x5a4a38), side = hw - 0.1;
                for (let along = -side; along <= side + 1e-6; along += side / Math.max(1, Math.round(side / 0.75))) stand('fence post', meshes.plain, along, far, 0.05, 0.05, c.floor + 1.2, wood);
                for (const end of [-1, 1]) for (let out = back + 1.4; out < far - 0.3; out += 1.4) stand('fence post', meshes.plain, end * side, out, 0.05, 0.05, c.floor + 1.2, wood);
                for (const y of [0.4, 0.95]) {
                    box(meshes.plain, 0, c.floor + y, far, side, 0.04, 0.02, wood);
                    for (const end of [-1, 1]) box(meshes.plain, end * side, c.floor + y, (back + far) / 2, 0.02, 0.04, (far - back) / 2, wood);
                }
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
                HillScene.standing(lane, repeats, 'step', meshes.dressed, [p.x, p.z], [p.crossX * half, p.crossZ * half], [p.dirX * S.treadM / 2, p.dirZ * S.treadM / 2], top, rgb(0xc8c0b0), { sink: 0.3, low: base });
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
                    rand();
                    HillScene.shrub(repeats, [a[0], y + 0.8, a[2]], (e - d) / 2 * 1.15, 0.85, 0.4, Math.atan2(p.dirX, p.dirZ), true);
                    continue;
                }
                const top = y + (steps ? 2.2 : 1.6);
                HillScene.standing(lane, repeats, 'wall', meshes.rubble, [a[0], a[2]], [p.dirX * (e - d) / 2, p.dirZ * (e - d) / 2], [p.crossX * 0.2, p.crossZ * 0.2], top, rgb(C.gardenWall), { sink: 0.3, low: Math.min(y, road.y0) - 0.4 });
                meshes.dressed.box([a[0], top + 0.05, a[2]], [p.dirX * ((e - d) / 2 + 0.02), 0, p.dirZ * ((e - d) / 2 + 0.02)], [0, 0.05, 0], [p.crossX * 0.25, 0, p.crossZ * 0.25], rgb(C.coping));
            }
        }
        if (!road.ride) return;
        // What closes it: a timber gate between stone piers, a wall across, or a yard's wall with a barn behind it
        const p = lane.roadPoint(road, road.ride), y = lane.roadY(road, road.ride, 0), c = at(road.ride, 0);
        const span = (h, colour, mesh) => HillScene.standing(lane, repeats, 'wall', mesh, [c[0], c[2]], [p.crossX * (half + 0.2), p.crossZ * (half + 0.2)], [p.dirX * 0.2, p.dirZ * 0.2], y + h, colour, { sink: 0.3, low: y - 0.1 });
        if (road.end === 'gate') {
            for (const sgn of [-1, 1]) {
                const q = at(road.ride, sgn * (half + 0.1));
                HillScene.standing(lane, repeats, 'gate pier', meshes.dressed, [q[0], q[2]], [p.crossX * 0.22, p.crossZ * 0.22], [p.dirX * 0.22, p.dirZ * 0.22], y + 1.85, rgb(C.coping));
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
                HillScene.standing(lane, repeats, 'barn', meshes.rubble, [b[0], b[2]], [p.crossX * 4, p.crossZ * 4], [p.dirX * 2.5, p.dirZ * 2.5], y + 4.4, rgb(0xb8ae9c), { sink: 0.3, low: y - 0.4 });
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
        // The fence on the right: thick dark timber posts close together on the flags, a round rail along their tops
        // falling with them, post to post
        const [f0, f1, fa] = o.fence, timber = rgb(0x3a3028), tops = [];
        for (let s = f0; s <= f1 + 1e-6; s += o.fenceStepM) {
            const f = frame(s), c = p(s, fa, 0), top = c.y + 0.1 + 1.02;
            HillScene.standing(lane, repeats, 'fence post', meshes.plain, [c.x, c.z], [f.alongX * 0.06, f.alongZ * 0.06], [f.leftX * 0.06, f.leftZ * 0.06], top, timber);
            tops.push([c.x, top - 0.07, c.z, f.leftX, f.leftZ]);
        }
        for (let i = 1; i < tops.length; i++) {
            const a = tops[i - 1], b = tops[i];
            meshes.plain.box([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [(b[0] - a[0]) / 2, (b[1] - a[1]) / 2, (b[2] - a[2]) / 2], [0, 0.04, 0],
                [a[3] * 0.04, 0, a[4] * 0.04], timber);
        }
        // The high wall on the inside of the bend, behind the top wall, and its buttresses stepping out to the flags
        const [w0, w1, wa, wu] = o.buttressWall, dark = rgb(0x6e685c);
        for (let s = w0; s < w1 - 1e-6; s += 1) {
            const e = Math.min(s + 1, w1), f = frame((s + e) / 2), c = p((s + e) / 2, wa - 0.3, 0);
            HillScene.standing(lane, repeats, 'wall', meshes.rubble, [c.x, c.z], [f.alongX * (e - s) / 2, f.alongZ * (e - s) / 2], [f.leftX * 0.3, f.leftZ * 0.3], c.y + wu, dark, { sink: 0.3 });
        }
        for (const b of o.buttresses) {
            // (each a block and a narrower one over it, set back: the stepped face of an old buttress)
            const f = frame(b), lo = p(b, wa + 0.35, 0), hi = p(b, wa + 0.2, 0);
            HillScene.standing(lane, repeats, 'buttress', meshes.rubble, [lo.x, lo.z], [f.alongX * 0.45, f.alongZ * 0.45], [f.leftX * 0.35, f.leftZ * 0.35], lo.y + wu * 0.55, dark, { sink: 0.3 });
            HillScene.standing(lane, repeats, 'buttress', meshes.rubble, [hi.x, hi.z], [f.alongX * 0.38, f.alongZ * 0.38], [f.leftX * 0.2, f.leftZ * 0.2], hi.y + wu * 0.9, dark, { sink: 0.3 });
        }
        // By the cottages the climb's wide shot sees: a sawhorse trestle on the flags, its legs splayed to them
        const [ts, ta] = o.trestle, wood = rgb(0x5a4632);
        {
            // (its beam falls with the flags, each end 0.72 m over them)
            const f = frame(ts), c = p(ts, ta, 0), ends = [-0.48, 0.48].map(end => [end, p(ts + end, ta, 0).y + 0.1]);
            const lo = p(ts - 0.6, ta, 0.1 + 0.72), hi = p(ts + 0.6, ta, 0.1 + 0.72);
            meshes.plain.box([(lo.x + hi.x) / 2, (lo.y + hi.y) / 2, (lo.z + hi.z) / 2], [(hi.x - lo.x) / 2, (hi.y - lo.y) / 2, (hi.z - lo.z) / 2], [0, 0.05, 0],
                [f.leftX * 0.06, 0, f.leftZ * 0.06], wood);
            for (const [end, floor] of ends) {
                for (const out of [-1, 1]) {
                    const top = [c.x + f.alongX * end, floor + 0.72, c.z + f.alongZ * end];
                    const foot = [top[0] + f.leftX * out * 0.24, floor - 0.02, top[2] + f.leftZ * out * 0.24];
                    const leg = [(top[0] - foot[0]) / 2, (top[1] - foot[1]) / 2, (top[2] - foot[2]) / 2];
                    // (its thickness across the leg: square to the lane's way and to the leg)
                    const n = [f.alongZ * leg[1], f.alongX * leg[2] - f.alongZ * leg[0], -f.alongX * leg[1]], nl = Math.hypot(...n) || 1;
                    meshes.plain.box([(top[0] + foot[0]) / 2, (top[1] + foot[1]) / 2, (top[2] + foot[2]) / 2], [f.alongX * 0.035, 0, f.alongZ * 0.035], leg,
                        n.map(v => v * 0.03 / nl), wood);
                }
            }
            HillScene.stand(repeats, 'trestle', [c.x, c.z], [f.alongX, f.alongZ], 0.5, [f.leftX, f.leftZ], 0.26, Math.min(...ends.map(e => e[1])) - 0.02);
        }
        // A short iron railing on the flags beside a door's step: posts with knobs, a top rail and a bottom rail
        const [rs, ra, rl] = o.railing;
        for (let k = 0; k <= 4; k++) {
            const s = rs - rl / 2 + rl * k / 4, f = frame(s), c = p(s, ra, 0);
            HillScene.standing(lane, repeats, 'railing post', meshes.dark, [c.x, c.z], [f.alongX * 0.012, f.alongZ * 0.012], [f.leftX * 0.012, f.leftZ * 0.012], c.y + 0.1 + 0.95, rgb(C.iron));
            box(meshes.dark, s, ra, 1.07, 0.025, 0.025, 0.025, rgb(C.iron));
        }
        for (const up of [0.2, 0.93]) {
            const a = p(rs - rl / 2, ra, 0.1 + up), b = p(rs + rl / 2, ra, 0.1 + up), f = frame(rs);
            meshes.dark.box([(a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2], [(b.x - a.x) / 2, (b.y - a.y) / 2, (b.z - a.z) / 2], [0, 0.012, 0], [f.leftX * 0.012, 0, f.leftZ * 0.012], rgb(C.iron));
        }
        // The big tree: its crown where the frame has it (its foot was once tru - 2.2 trr over the lane), its trunk down
        // to the land, the tree scaled to reach
        const [trs, tra, tru, trr] = o.tree;
        const t = p(trs, tra, 0), ground = lane.ground().heightAt(t.x, t.z) - 0.1;
        const high = HillScene.bareHigh(), top = t.y + tru - trr * 2.2 + trr * 2.6 * high, size = (top - ground) / high;
        repeats.bare.push(new THREE.Matrix4().compose(new THREE.Vector3(t.x, ground, t.z), new THREE.Quaternion(), new THREE.Vector3(trr * 2.6, size, trr * 2.6)));
        HillScene.stand(repeats, 'tree', [t.x, t.z], [1, 0], 0.15, [0, 1], 0.15, ground);
    }

    // Where a building's windows go, each { along (m from its middle), storey, y (the window's middle) }: from its
    // layout (the top's cottages, HillLane.RULE.opening.left) or by the rule, evenly (the opening's thatched cottages a
    // little off the even spacing, and fewer). A cottage's upper windows sit under its eaves, those under an eyebrow up in
    // the thatch's sweep
    static windowPlaces(c) {
        const hw = c.wide / 2, list = [];
        const upper = c.opening ? Math.min(c.floor + 3.65, c.eaves - 0.8) : c.floor + 3.65;
        const brows = c.layout && c.layout.eyebrows ? c.layout.eyebrows.map(u => -hw + c.wide * u) : [];
        const y = (storey, along) => storey === 0 ? c.floor + 1.55 : brows.some(b => Math.abs(b - along) < 0.3) ? Math.min(c.floor + 3.65, c.eaves - 0.45) : upper;
        if (c.layout) {
            for (const [u, storey] of c.layout.windows) list.push({ along: -hw + c.wide * u, storey, y: y(storey, -hw + c.wide * u) });
            return list;
        }
        const cottagey = c.opening && c.roof === 'thatch' && c.storeys > 1;
        const windows = Math.max(1, Math.floor(c.wide / (cottagey ? 3.4 : 2.3)));
        const shift = HillLane.random(Math.round(c.from * 31) + 7);
        const offsets = Array.from({ length: windows }, () => (cottagey ? (shift() - 0.5) * 0.9 : 0));
        for (let storey = 0; storey < c.storeys; storey++) {
            for (let i = 0; i < windows; i++) {
                const along = -hw + (i + 0.5) * c.wide / windows + offsets[i] * (storey > 0 ? 0.6 : 1);
                list.push({ along, storey, y: storey === 0 ? c.floor + 1.55 : cottagey ? Math.min(c.floor + 3.65, c.eaves - 1.05) : c.floor + 1.55 + storey * 2.1 });
            }
        }
        return list;
    }

    // A thatched roof as one rounded mass along the building (THATCH): its cross-section the stills' thatch, thick and
    // soft, rolled over at the eaves front and back and rounded over the ridge, run from end to end and rounded in at
    // each end like a half hip; over each window in `brows` (along, m) the front eave sweeps up in an eyebrow. `pt` maps
    // (along, height, out) to the world; colours: the thatch, its ridge (darker), its eave rolls (lighter)
    static get THATCH() { return Object.freeze({ endM: 0.45, rollM: 0.32, ridgeM: 0.5, browUpM: 0.75, browWideM: 1.1, stepM: 1000 }); }

    static thatchMass(mesh, pt, c, hw, hd, over, brows, colour, ridgeColour, rollColour) {
        const T = HillScene.THATCH, e = c.eaves - 0.35, R = c.ridge;
        // The cross-section, front to back, as [out, height]: under the eave at the wall, the eave's lip, its roll, the
        // slope, the rounded ridge; then the same behind
        // (the slope a little full, as laid reed is, between the roll and the ridge)
        const slope = (t, bulge) => [-(hd + over) * (1 - t) + 0.1 * (1 - t), e + 0.42 + (R + T.ridgeM * 0.7 - e - 0.42) * t + bulge];
        const front = [[-hd + 0.02, c.eaves - 0.02], [-hd - over, e - 0.2], [-hd - over - T.rollM * 0.5, e + T.rollM * 0.4],
            [-hd - over + 0.1, e + 0.42], slope(0.33, 0.16), slope(0.66, 0.16), [-0.35, R + T.ridgeM * 0.7], [0, R + T.ridgeM]];
        const section = [...front, ...front.slice(0, -1).reverse().map(([o, y]) => [-o, y])];
        const n = section.length;
        const tone = i => (i >= 6 && i <= n - 8 ? ridgeColour : i === 1 || i === 2 || i === n - 3 || i === n - 4 ? rollColour : colour);
        // Along: from end to end in steps, the ends drawn in over endM
        // (only at the ends and through each eyebrow, where the shape changes: along the plain run it is the same)
        const L = hw + over * 0.6, stations = [-L, L];
        for (let a = -L; a < L; a += T.stepM) stations.push(a);
        for (const sign of [-1, 1]) for (let k = 1; k <= 2; k++) stations.push(sign * (L - T.endM * k / 2));
        for (const b of brows) for (let k = -2; k <= 2; k++) stations.push(b + k * T.browWideM / 2);
        stations.sort((p, q) => p - q);
        for (let i = stations.length - 1; i > 0; i--) if (stations[i] - stations[i - 1] < 0.05 || Math.abs(stations[i]) > L) stations.splice(i, 1);
        const at = (a) => {
            const end = Math.max(0, (Math.abs(a) - (L - T.endM)) / T.endM), k = 1 - 0.55 * end * end;
            const brow = brows.reduce((m, b) => Math.max(m, Math.max(0, 1 - ((a - b) / T.browWideM) ** 2)), 0) ** 1.5;
            return section.map(([o, y], i) => {
                // (the eyebrow lifts the front eave and its roll; the ends round in towards the ridge's line and down)
                const lift = i >= 1 && i <= 3 ? T.browUpM * brow * (i === 3 ? 0.7 : 1) : 0;
                return pt(a * (1 - 0.0 * end), y + lift - (R - y) * 0 - end * end * 0.3 * (y > e ? (y - e) / (R - e + 1e-6) : 0), o * k);
            });
        };
        let prev = at(stations[0]);
        // The ends: each closed with a fan from the section's middle
        const cap = (ring, a) => {
            const mid = pt(a, (e + R) / 2, 0);
            for (let i = 0; i < ring.length - 1; i++) mesh.tri(mid, ring[i], ring[i + 1], colour);
        };
        cap(prev, stations[0]);
        for (let j = 1; j < stations.length; j++) {
            const next = at(stations[j]);
            for (let i = 0; i < section.length - 1; i++) mesh.quad(prev[i], next[i], next[i + 1], prev[i + 1], tone(i));
            prev = next;
        }
        cap(prev, stations[stations.length - 1]);
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

        // A piece in front of the house standing on the flags or the land up to `top`, its foot at `low` or lower
        const stand = (kind, mesh, along, out, ha, ho, top, colour, low) => {
            const at = pt(along, 0, out);
            return HillScene.standing(lane, repeats, kind, mesh, [at[0], at[2]], [A[0] * ha, A[2] * ha], [O[0] * ho, O[2] * ho], top, colour, { sink: 0.05, low });
        };

        // The walls, a plinth along the front, quoins at the front corners of a stone or rendered cottage
        box(wallMesh, 0, (c.foot + c.eaves) / 2, 0, hw, (c.eaves - c.foot) / 2, hd, wall);
        HillScene.stand(repeats, c.kind, [c.x, c.z], [c.alongX, c.alongZ], hw, [c.outX, c.outZ], hd, c.foot);
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
        // The upper windows the thatch sweeps up over (the layout's eyebrows, or the rule's)
        const brows = thatch && c.storeys > 1 && (c.dormers || (c.layout && c.layout.eyebrows))
            ? (c.layout && c.layout.eyebrows ? c.layout.eyebrows.map(u => -hw + c.wide * u) : HillScene.windowPlaces(c).filter(w => w.storey > 0).map(w => w.along)) : [];
        if (!c.gable && thatch) {
            HillScene.thatchMass(roofMesh, pt, c, hw, hd, over, brows, roof, rgb(shade(C.thatch, 0.82)), rgb(shade(C.thatch, 1.08)));
            for (const end of [-1, 1]) {
                wallMesh.tri(pt(end * hw, c.eaves, -hd), pt(end * hw, c.eaves, hd), pt(end * hw, c.ridge - 0.15, 0), wall);
                wallMesh.tri(pt(end * hw, c.eaves, hd), pt(end * hw, c.eaves, -hd), pt(end * hw, c.ridge - 0.15, 0), wall);
            }
        } else if (!c.gable) {
            for (const side of [-1, 1]) slab(0, side * (hd + over), eaveY - over * 0.45, 0, 0, c.ridge, hw + over * 0.6, 'along');
            for (const end of [-1, 1]) {
                wallMesh.tri(pt(end * hw, c.eaves, -hd), pt(end * hw, c.eaves, hd), pt(end * hw, c.ridge - 0.15, 0), wall);
                wallMesh.tri(pt(end * hw, c.eaves, hd), pt(end * hw, c.eaves, -hd), pt(end * hw, c.ridge - 0.15, 0), wall);
            }
            {
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
            // Pots of their own shapes: one to three on a stack, tall and thin or short and wide
            const potRand = HillLane.random(Math.round(c.from * 7 + ch.along * 13) + 5);
            const count = 1 + Math.floor(potRand() * 3);
            for (let k = 0; k < count; k++) {
                const wide = 0.8 + potRand() * 0.5, high = 0.3 + potRand() * 0.45;
                const q = pt(ch.along + (k - (count - 1) / 2) * 0.28, top + 0.1 + high / 2, out);
                repeats.pots.push(pot.clone().compose(new THREE.Vector3(q[0], q[1], q[2]), new THREE.Quaternion(), new THREE.Vector3(wide, high, wide)));
            }
        }

        // The door: frame, panelled door, fanlight, step, and now and then a porch
        const doorAt = -hw + c.wide * c.door;
        box(meshes.trim, doorAt, c.floor + 1.1, face - 0.03, 0.55, 1.12, 0.04, rgb(C.frame));
        box(meshes.door, doorAt, c.floor + 0.98, face - 0.06, 0.45, 0.98, 0.03, rgb(C.doors[c.doorColour]));
        box(meshes.glass, doorAt, c.floor + 2.07, face - 0.06, 0.42, 0.1, 0.03, rgb(C.glass));
        stand('door step', meshes.dressed, doorAt, face - 0.3, 0.62, 0.3, c.floor + 0.06, rgb(C.step), c.floor - 0.18);
        // The step worn hollow in its middle, a knocker on the door, and now and then an iron boot scraper beside it
        box(meshes.dressed, doorAt, c.floor + 0.062, face - 0.32, 0.32, 0.004, 0.17, rgb(shade(C.step, 0.86)));
        if (c.kind !== 'barn' && c.kind !== 'shop') box(meshes.dark, doorAt, c.floor + 1.32, face - 0.1, 0.04, 0.05, 0.015, rgb(0x8a7444));
        if (HillLane.random(Math.round(c.from * 19) + 3)() < 0.4) stand('boot scraper', meshes.dark, doorAt + 0.85, face - 0.25, 0.14, 0.04, c.floor + 0.12, rgb(C.iron), c.floor - 0.1);
        // The layout's other doors, each with its frame and step
        for (const u of c.layout ? c.layout.doors.slice(1) : []) {
            const at = -hw + c.wide * u;
            box(meshes.trim, at, c.floor + 1.1, face - 0.03, 0.55, 1.12, 0.04, rgb(C.frame));
            box(meshes.door, at, c.floor + 0.98, face - 0.06, 0.45, 0.98, 0.03, rgb(C.doors[(c.doorColour + 2) % 5]));
            stand('door step', meshes.dressed, at, face - 0.3, 0.62, 0.3, c.floor + 0.06, rgb(C.step), c.floor - 0.18);
        }
        if (c.porch) {
            const y = c.floor + 2.45;
            for (const k of [-1, 1]) {
                stand('porch post', meshes.trim, doorAt + k * 0.65, face - 0.85, 0.05, 0.05, c.floor + 2.4, rgb(C.frame), c.floor);
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
                stand('stall riser', meshes.trim, mid, face - proud, half + 0.05, proud, c.floor + 0.7, rgb(fascia), c.floor);
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
        const frame = rgb(C.frame), sill = rgb(C.sill), glass = rgb(C.glass), lit = rgb(C.lit);
        const greens = [0x4e6236, 0x5d7440, 0x445a30], blooms = [0xc8463a, 0xe0c04a, 0xe8e2d8, 0xd87a9a];
        const rand = HillLane.random(Math.round(c.from * 17) + c.side * 3);
        for (const { along, storey, y } of HillScene.windowPlaces(c)) {
            {
                if (!c.layout && storey === 0 && Math.abs(along - doorAt) < 1.15) continue;
                if (storey === 0 && shop && along < doorAt) continue;
                if (Math.abs(along) > hw - 0.55) continue;
                // Small casements, as the stills have them
                box(meshes.trim, along, y, face - 0.02, 0.36, 0.5, 0.025, frame);
                box(meshes.glass, along, y, face - 0.05, 0.31, 0.45, 0.01, c.lit && storey === 0 ? lit : glass);
                // Curtains drawn back to each side of some panes
                if (rand() < 0.45) {
                    const cloth = rgb([0xe8dcc8, 0x9a3a32, 0x4a5a7a, 0xd8c890, 0x6a7a5a][Math.floor(rand() * 5)]);
                    for (const k of [-1, 1]) box(meshes.plain, along + k * 0.24, y + 0.02, face - 0.063, 0.065, 0.42, 0.003, cloth);
                }
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
        // Weathering: patched render and a crack or two on a rendered front; moss on thatch, lichen on slate and tile
        if (c.wall === 'lime' || c.wall === 'cream' || c.wall === 'blush') {
            for (let k = 0; k < 2; k++) {
                if (rand() < 0.4) continue;
                const along = (rand() - 0.5) * (c.wide - 1.6), up = c.floor + 0.4 + rand() * (c.eaves - c.floor - 1.4);
                box(wallMesh, along, up, face - 0.006, 0.3 + rand() * 0.5, 0.2 + rand() * 0.35, 0.004, rgb(shade(wallHex, 0.9 + rand() * 0.06)));
            }
            if (rand() < 0.6) {
                // A crack: two short strokes, each leaning its own way, from under a window's sill
                let along = (rand() - 0.5) * (c.wide - 2), up = c.floor + 1.0;
                for (let k = 0; k < 2; k++) {
                    const lean = (rand() - 0.5) * 0.16, high = 0.18 + rand() * 0.12;
                    const mid = pt(along + lean / 2, up - high, face - 0.008);
                    meshes.dark.box(mid, vec(0.006, 0, 0), [A[0] * lean / 2, high, A[2] * lean / 2], vec(0, 0, 0.003), rgb(0x7a7266));
                    along += lean;
                    up -= 2 * high;
                }
            }
        }
        {
            const patches = thatch ? 4 : c.roof === 'slate' || c.roof === 'tile' ? 3 : 0;
            const spots = c.gable ? 0 : patches;
            for (let k = 0; k < spots; k++) {
                // A spot on the front slope, from its eave towards its ridge
                // (on the slope's top face: its underside line, raised by the thickness along the slope's normal)
                const t = 0.35 + rand() * 0.5, along = (rand() - 0.5) * 2 * (hw - 0.3);
                const run = hd + over, rise = c.ridge - (eaveY - over * 0.45);
                const outAt = -run * (1 - t), y = (eaveY - over * 0.45) + rise * t + thick * Math.hypot(run, rise) / run + 0.01;
                const at = pt(along, y, outAt);
                if (thatch) HillScene.leaf(repeats, at, 0.35 + rand() * 0.3, 0.04, 0.12, [0x46522e, 0x4e5c34, 0x3c4828][k % 3], c.heading);
                else {
                    // (lichen: a flat pale disc on the slates)
                    const size = 0.12 + rand() * 0.1;
                    repeats.flowers.push({ m: new THREE.Matrix4().compose(new THREE.Vector3(at[0], at[1], at[2]), new THREE.Quaternion(), new THREE.Vector3(size, size * 0.25, size)), colour: [0x8e8c70, 0x84866a, 0x9a9474][k % 3] });
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
            // Each post on the flags under it, 0.95 m high, and the rail along their tops, falling with the flags
            const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
            const land = lane.ground();
            const flagsAt = along => {
                const p = pt(along, 0, line);
                return land.surfaceAt(p[0], p[2]);
            };
            for (let along = -hw + 0.1; along <= hw - 0.1; along += 0.26) {
                if (Math.abs(along - doorAt) < 0.7) continue;
                const p = pt(along, 0, line), y = flagsAt(along) - 0.05;
                repeats.posts.push(m.clone().compose(new THREE.Vector3(p[0], y + 0.5, p[2]), q, s));
                HillScene.stand(repeats, 'railing post', [p[0], p[2]], [c.alongX, c.alongZ], 0.02, [c.outX, c.outZ], 0.02, y);
            }
            for (const [from, to] of [[-hw + 0.1, doorAt - 0.7], [doorAt + 0.7, hw - 0.1]]) {
                if (to - from < 0.3) continue;
                const a = pt(from, flagsAt(from) + 0.88, line), b = pt(to, flagsAt(to) + 0.88, line);
                meshes.dark.box([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [(b[0] - a[0]) / 2, (b[1] - a[1]) / 2, (b[2] - a[2]) / 2], [0, 0.025, 0], vec(0, 0, 0.025), rgb(C.iron));
            }
        } else if (c.front === 'garden' && !shop) {
            for (const [from, to] of [[-hw, doorAt - 0.7], [doorAt + 0.7, hw]]) {
                if (to - from < 0.3) continue;
                stand('front wall', meshes.rubble, (from + to) / 2, line, (to - from) / 2, 0.15, c.floor + 0.75, rgb(C.gardenWall), c.foot + 0.3);
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
    static house(land, repeats, x, y, z, wide, deep, eaves, turn, roofKind, wallHex, meshes) {
        const rgb = HillScene.rgb, C = HillScene.COLOURS;
        const A = [Math.sin(turn), 0, Math.cos(turn)], L = [Math.cos(turn), 0, -Math.sin(turn)];
        const hw = wide / 2, hd = deep / 2;
        const pt = (along, rise, across) => [x + A[0] * along + L[0] * across, rise, z + A[2] * along + L[2] * across];
        const wall = rgb(wallHex);
        const foot = Math.min(y - 1, land.footOf(x, z, A[0], A[2], hw, L[0], L[2], hd));
        meshes.rubble.box([x, (foot + y + eaves) / 2, z], [A[0] * hw, 0, A[2] * hw], [0, (y + eaves - foot) / 2, 0], [L[0] * hd, 0, L[2] * hd], wall);
        HillScene.stand(repeats, 'house', [x, z], [A[0], A[2]], hw, [L[0], L[2]], hd, foot);
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

    static smooth(t) {
        const c = Math.max(0, Math.min(1, t));
        return c * c * (3 - 2 * c);
    }

    // The bare tree's height in its own units (HillScene.bareTree), kept
    static bareHigh() {
        if (!HillScene.bareTop) {
            const g = HillScene.bareTree();
            g.computeBoundingBox();
            HillScene.bareTop = g.boundingBox.max.y;
        }
        return HillScene.bareTop;
    }

    // The land as drawn (HillLand, lane.ground()): the fine grid round the lane and its side roads and the coarse grid
    // out to the hills where the fine one is not, edge to edge, one mesh with the fields laid over it in the plan's own
    // coordinates, so the two grids show one patchwork
    static vale(lane) {
        const land = lane.ground(), R = HillLand.RULE;
        const position = [], uv = [], index = [];
        const S = R.valeM, u0 = land.coarse.x0, v0 = land.coarse.z0;
        const vertex = (x, y, z) => {
            position.push(x, y, z);
            uv.push((x - u0) / S, 1 - (z - v0) / S);
            return position.length / 3 - 1;
        };
        const grid = (g, keep) => {
            const w = g.nz + 1, ids = new Map();
            const id = (i, j) => {
                const k = i * w + j;
                if (!ids.has(k)) ids.set(k, vertex(g.x0 + i * g.c, g.heights[k], g.z0 + j * g.c));
                return ids.get(k);
            };
            for (let i = 0; i < g.nx; i++) {
                for (let j = 0; j < g.nz; j++) {
                    if (!keep(i, j)) continue;
                    // (a, b, c, d) round the cell; split along a-c, as HillLand.onGrid reads it, wound to face up
                    const a = id(i, j), bb = id(i + 1, j), c = id(i + 1, j + 1), d = id(i, j + 1);
                    index.push(a, c, bb, a, d, c);
                }
            }
        };
        const f = land.fine, drawn = (i, j) => i >= 0 && j >= 0 && i < f.nx && j < f.nz && f.drawn[i * f.nz + j] === 1;
        grid(f, drawn);
        grid(land.coarse, (i, j) => !land.coarse.covered[i * land.coarse.nz + j]);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        geometry.setIndex(index);
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();
        const map = HillScene.fieldTexture(lane.rule.seed + 31);
        const material = new THREE.MeshStandardMaterial({ map, roughness: 1, metalness: 0, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = 'hill-vale';
        mesh.receiveShadow = true;
        return mesh;
    }

    // Trees: round dark crowns along the hedges and the slopes, and some bare ones near the village
    static trees(lane, repeats) {
        const land = lane.ground();
        const rand = HillLane.random(lane.rule.seed + 41);
        const end = lane.sample(lane.rule.lengthM / 2);
        // (the plainest crown: far off in the haze its faces do not show, and the land round the village needs the budget;
        // a crown alone read as a grey shape hung in the air, so each stands on a trunk, three faces, to the ground)
        const crown = HillScene.farTree();
        const material = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 1, flatShading: true });
        const count = 520;
        const trees = new THREE.InstancedMesh(crown, material, count);
        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), at = new THREE.Vector3();
        let placed = 0;
        for (let i = 0; i < count * 2 && placed < count; i++) {
            const ahead = -900 + rand() * 1800, aside = (rand() - 0.5) * 1800;
            const x = end.x + end.alongX * ahead + end.leftX * aside, z = end.z + end.alongZ * ahead + end.leftZ * aside;
            // Not on the lane, its path or the cottages, nor in the band of houses and yards along it; and not within
            // nearM of the lane, where its few faces read as a grey shape in the haze (the leafy and bare trees stand there)
            const near = HillScene.nearLane(lane, x, z);
            if (near < HillScene.FAR_TREE.nearM) continue;
            // Only where land is drawn: past the coarse grid's edge there is none, and a crown there hung in the sky
            if (HillLand.onGrid(land.coarse, x, z) === null) continue;
            const n = land.near(x, z);
            if (n.d < land.bandAt(x, z, n).band + 6) continue;
            const size = 2.5 + rand() * 3.5, high = size * (0.8 + rand() * 0.5);
            // (the trunk's foot a little into the land under it; each crown turned its own way, so no two show one outline)
            const ground = land.heightAt(x, z), F = HillScene.FAR_TREE;
            at.set(x, ground + high * F.upM, z);
            s.set(size, high, size);
            HillScene.stand(repeats, 'crown', [x, z], [1, 0], 0.1, [0, 1], 0.1, ground - high * F.sinkM);
            q.setFromEuler(new THREE.Euler((rand() - 0.5) * F.tiltRad, rand() * Math.PI * 2, (rand() - 0.5) * F.tiltRad));
            m.compose(at, q, s);
            trees.setMatrixAt(placed++, m);
        }
        trees.count = placed;
        trees.castShadow = true;
        trees.name = 'hill-trees';
        return trees;
    }

    // A far tree in a unit of its size (its crown 1 across, scaled by the tree's size and height): the crown's centre
    // upM over the ground, its trunk down from inside the crown to sinkM under the ground, trunkM across; none nearer
    // the lane than nearM
    static get FAR_TREE() {
        return Object.freeze({ nearM: 100, upM: 1.25, sinkM: 0.1, trunkM: 0.09, tiltRad: 0.3, crown: 0x4c5636, bark: 0x4a4038 });
    }

    static farTree() {
        const F = HillScene.FAR_TREE;
        const crown = new THREE.IcosahedronGeometry(1, 0);
        const position = Array.from(crown.attributes.position.array), colour = [];
        const leaf = HillScene.rgb(F.crown), bark = HillScene.rgb(F.bark);
        for (let i = 0; i < position.length / 3; i++) colour.push(...leaf);
        // The trunk: three faces from inside the crown to the foot
        const top = -0.5, foot = -F.upM - F.sinkM, r = F.trunkM / 2;
        const ring = [0, 1, 2].map(k => [Math.cos(k * 2.094) * r, Math.sin(k * 2.094) * r]);
        for (let k = 0; k < 3; k++) {
            const [ax, az] = ring[k], [bx, bz] = ring[(k + 1) % 3];
            position.push(ax, foot, az, bx, top, bz, ax, top, az, ax, foot, az, bx, foot, bz, bx, top, bz);
            for (let i = 0; i < 6; i++) colour.push(...bark);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colour, 3));
        geometry.computeVertexNormals();
        // (its colours already decoded once, HillScene.rgb)
        geometry.userData.linearColors = true;
        crown.dispose();
        return geometry;
    }

    static nearLane(lane, x, z) {
        let best = Infinity;
        for (let i = 0; i < lane.points.length; i += 3) best = Math.min(best, Math.hypot(x - lane.points[i].x, z - lane.points[i].z));
        return best;
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { HillScene, HillMesh };
