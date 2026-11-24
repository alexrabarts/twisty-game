// The hill ride's village as drawn (js/hill/ride.js), from the lane's data (js/hill/lane.js): the cobbled lane, the raised
// path and its rail, the buttressed wall, the cottages stepping down the left side, the roofs of the lower village and
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
        return Object.freeze({
            stone: 0xc4bcaa, lime: 0xe6e2d6, dark: 0x9c9484, wall: 0x8a8478, wallDark: 0x6e695f, coping: 0x9a948a,
            thatch: 0x6e6150, tile: 0x7a5442, chimney: 0x8a7a66, pot: 0x8a5a40,
            glass: 0x1d2024, frame: 0xd8d4c8, door: 0x3a2e24, step: 0x9a9384,
            path: 0x8d877b, kerb: 0x7a756a, post: 0x2e2a24,
            grass: 0x6f7f4a, field: [0x7d8d52, 0x6a7a44, 0x8a9a5e, 0x748448, 0x93a066], hedge: 0x3f4a2c, tree: 0x4c5636, bare: 0x4a4038,
            haze: 0xc8c0ae
        });
    }

    static rgb(hex) {
        const c = new THREE.Color(hex);
        // Vertex colours are read linear
        c.convertSRGBToLinear();
        return [c.r, c.g, c.b];
    }

    // The cobbles drawn on a canvas: rows of rounded setts, staggered, in greys and browns, dark joints between, and a
    // shallow channel down the middle of the lane. Returns the colour map and the bump map (THREE.CanvasTexture)
    static cobbleTextures(lane) {
        const size = 1024;
        const r = lane.rule;
        // The texture spans the lane's width once and settRows rows along it
        const width = r.halfWidthM * 2;
        const rows = Math.round(width / r.settLongM * 0.5) * 2;
        const along = rows * r.settLongM;
        const colour = document.createElement('canvas');
        colour.width = colour.height = size;
        const bump = document.createElement('canvas');
        bump.width = bump.height = size;
        const cc = colour.getContext('2d'), bc = bump.getContext('2d');
        cc.fillStyle = '#3a3630';
        cc.fillRect(0, 0, size, size);
        bc.fillStyle = '#000';
        bc.fillRect(0, 0, size, size);
        const rand = HillLane.random(r.seed + 11);
        const sx = size / width, sy = size / along;
        for (let row = 0; row < rows; row++) {
            const y0 = row * r.settLongM * sy;
            const shift = row % 2 === 0 ? 0 : 0.5;
            const count = Math.ceil(width / r.settWideM) + 1;
            for (let k = -1; k < count; k++) {
                const x0 = (k + shift) * r.settWideM * sx;
                // Field stones, not cut setts: each its own size, shape and turn, off the grid a little
                const w = r.settWideM * sx * (0.62 + rand() * 0.34), h = r.settLongM * sy * (0.6 + rand() * 0.34);
                const cx = x0 + r.settWideM * sx / 2 + (rand() - 0.5) * r.settWideM * sx * 0.3, cy = y0 + r.settLongM * sy / 2 + (rand() - 0.5) * r.settLongM * sy * 0.3;
                const shade = 0.55 + rand() * 0.7;
                const warm = rand();
                const base = [100 + warm * 46, 96 + warm * 30, 90 + warm * 12].map(v => Math.round(Math.min(255, v * shade)));
                const turn = (rand() - 0.5) * 1.2;
                const grad = cc.createRadialGradient(cx - w * 0.15, cy - h * 0.2, 1, cx, cy, Math.max(w, h) * 0.6);
                grad.addColorStop(0, `rgb(${base.map(v => Math.min(255, v + 45)).join(',')})`);
                grad.addColorStop(1, `rgb(${base.join(',')})`);
                cc.fillStyle = grad;
                cc.beginPath();
                cc.ellipse(cx, cy, w / 2, h / 2, turn, 0, Math.PI * 2);
                cc.fill();
                const dome = bc.createRadialGradient(cx, cy, 1, cx, cy, Math.max(w, h) * 0.55);
                dome.addColorStop(0, '#fff');
                dome.addColorStop(1, '#333');
                bc.fillStyle = dome;
                bc.beginPath();
                bc.ellipse(cx, cy, w / 2, h / 2, turn, 0, Math.PI * 2);
                bc.fill();
            }
        }
        // The channel down the middle: flatter, darker setts laid along the lane
        const mid = size / 2, half = 0.22 * sx;
        cc.fillStyle = 'rgba(40, 36, 32, 0.55)';
        cc.fillRect(mid - half, 0, half * 2, size);
        bc.fillStyle = 'rgba(0, 0, 0, 0.6)';
        bc.fillRect(mid - half, 0, half * 2, size);
        const map = new THREE.CanvasTexture(colour);
        map.encoding = THREE.sRGBEncoding;
        const bumpMap = new THREE.CanvasTexture(bump);
        for (const t of [map, bumpMap]) {
            t.wrapS = t.wrapT = THREE.RepeatWrapping;
            t.anisotropy = 8;
        }
        return { map, bumpMap, along };
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

    // Builds the village into a group: { group, sunTarget }
    static build(lane) {
        const C = HillScene.COLOURS, rgb = HillScene.rgb;
        const r = lane.rule;
        const group = new THREE.Group();
        group.name = 'hill-village';
        // Both sides drawn: the shapes are joined from quads of either winding, and three turns the normal of a back face
        const plain = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
        const meshes = { stone: new HillMesh(), roof: new HillMesh(), thatch: new HillMesh(), glass: new HillMesh(), ground: new HillMesh() };
        const step = 1;
        const p = {}, q = {};

        // The lane: a ribbon over the cobbles, its texture running along it
        const cobbles = HillScene.cobbleTextures(lane);
        const laneMesh = new HillMesh();
        const white = [1, 1, 1];
        for (let s = 0; s < r.lengthM; s += step) {
            const a0 = lane.at(s, -r.halfWidthM, 0, {}), a1 = lane.at(s, r.halfWidthM, 0, {});
            const b0 = lane.at(s + step, -r.halfWidthM, 0, {}), b1 = lane.at(s + step, r.halfWidthM, 0, {});
            const v0 = s / cobbles.along, v1 = (s + step) / cobbles.along;
            laneMesh.quad([a0.x, a0.y, a0.z], [a1.x, a1.y, a1.z], [b1.x, b1.y, b1.z], [b0.x, b0.y, b0.z], white, [[0, v0], [1, v0], [1, v1], [0, v1]]);
        }
        // The quads above face down for a lane running +z with its left at +x; turn them up
        HillScene.flip(laneMesh);
        const laneMaterial = new THREE.MeshStandardMaterial({ map: cobbles.map, bumpMap: cobbles.bumpMap, bumpScale: 0.04, roughness: 0.3, metalness: 0.08, vertexColors: true, side: THREE.DoubleSide });
        const surface = laneMesh.mesh(laneMaterial);
        surface.name = 'hill-cobbles';
        surface.castShadow = false;
        group.add(surface);

        // The wall's side (-x): kerb, the raised path, its rail, the wall and its buttresses
        const stone = meshes.stone;
        const path = rgb(C.path), kerb = rgb(C.kerb), post = rgb(C.post), wall = rgb(C.wall), wallDark = rgb(C.wallDark), coping = rgb(C.coping);
        const edge = -r.halfWidthM, back = -(r.halfWidthM + r.pathM);
        const wallFoot = back - 0.6;
        for (let s = 0; s < r.lengthM; s += step) {
            const e0 = lane.at(s, edge, 0, {}), e1 = lane.at(s + step, edge, 0, {});
            const t0 = lane.at(s, edge, r.pathUpM, {}), t1 = lane.at(s + step, edge, r.pathUpM, {});
            const k0 = lane.at(s, back, r.pathUpM, {}), k1 = lane.at(s + step, back, r.pathUpM, {});
            // The kerb's face, then the path's top
            stone.quad([e0.x, e0.y, e0.z], [e1.x, e1.y, e1.z], [t1.x, t1.y, t1.z], [t0.x, t0.y, t0.z], kerb);
            stone.quad([t0.x, t0.y, t0.z], [t1.x, t1.y, t1.z], [k1.x, k1.y, k1.z], [k0.x, k0.y, k0.z], path);
            // The wall's face, from under the path to its top, and the coping over it
            const f0 = lane.at(s, back, -0.5, {}), f1 = lane.at(s + step, back, -0.5, {});
            const w0 = lane.at(s, back, r.wallUpM, {}), w1 = lane.at(s + step, back, r.wallUpM, {});
            const tone = (Math.floor(s / 3) % 3 === 0) ? wallDark : wall;
            stone.quad([f0.x, f0.y, f0.z], [f1.x, f1.y, f1.z], [w1.x, w1.y, w1.z], [w0.x, w0.y, w0.z], tone);
            const c0 = lane.at(s, wallFoot, r.wallUpM + 0.25, {}), c1 = lane.at(s + step, wallFoot, r.wallUpM + 0.25, {});
            const o0 = lane.at(s, back + 0.1, r.wallUpM + 0.25, {}), o1 = lane.at(s + step, back + 0.1, r.wallUpM + 0.25, {});
            stone.quad([w0.x, w0.y, w0.z], [w1.x, w1.y, w1.z], [o1.x, o1.y, o1.z], [o0.x, o0.y, o0.z], coping);
            stone.quad([o0.x, o0.y, o0.z], [o1.x, o1.y, o1.z], [c1.x, c1.y, c1.z], [c0.x, c0.y, c0.z], coping);
        }
        // The rail: a post every postEveryM on the path's lane edge, a rail along their tops
        for (let s = 1; s < r.lengthM - 1; s += r.postEveryM) {
            const at = lane.at(s, edge - 0.15, r.pathUpM + r.railUpM / 2, p);
            const smp = lane.sample(s, q);
            stone.box([at.x, at.y, at.z], [smp.leftX * 0.06, 0, smp.leftZ * 0.06], [0, r.railUpM / 2, 0], [smp.alongX * 0.06, 0, smp.alongZ * 0.06], post);
        }
        for (let s = 1; s < r.lengthM - 1; s += step) {
            const a = lane.at(s, edge - 0.15, r.pathUpM + r.railUpM - 0.08, {}), b = lane.at(s + step, edge - 0.15, r.pathUpM + r.railUpM - 0.08, {});
            const smp = lane.sample(s + step / 2, q);
            stone.box([(a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2], [smp.leftX * 0.035, 0, smp.leftZ * 0.035], [0, 0.04, 0],
                [(b.x - a.x) / 2, (b.y - a.y) / 2, (b.z - a.z) / 2], post);
        }
        // The buttresses: stepped slopes of stone standing out from the wall onto the path
        for (const s of lane.buttresses) {
            const smp = lane.sample(s, q);
            const out = r.buttressOutM, up = r.buttressUpM, half = r.buttressWideM / 2;
            const L = [smp.leftX, 0, smp.leftZ], A = [smp.alongX, 0, smp.alongZ];
            const base = lane.at(s, back, r.pathUpM, {});
            const pt = (across, rise, along) => [base.x + L[0] * across + A[0] * along, base.y + rise, base.z + L[2] * across + A[2] * along];
            for (const [o, top, tone] of [[out, up * 0.55, wall], [out * 0.62, up, wallDark]]) {
                const foot = -0.3;
                // Front slope, two sides, the cap
                stone.quad(pt(o, foot, -half), pt(o, foot, half), pt(o * 0.35, top, half), pt(o * 0.35, top, -half), tone);
                stone.quad(pt(0, foot, -half), pt(o, foot, -half), pt(o * 0.35, top, -half), pt(0, top, -half), tone);
                stone.quad(pt(o, foot, half), pt(0, foot, half), pt(0, top, half), pt(o * 0.35, top, half), tone);
                stone.quad(pt(o * 0.35, top, -half), pt(o * 0.35, top, half), pt(0, top + 0.12, half), pt(0, top + 0.12, -half), coping);
            }
        }

        // The cottages on the left (+x), behind a strip of flags
        const flagsFrom = r.halfWidthM, front = r.halfWidthM + r.flagsM;
        for (let s = Math.max(0, r.cottagesFromM); s < r.lengthM; s += step) {
            const a0 = lane.at(s, flagsFrom, 0.08, {}), a1 = lane.at(s + step, flagsFrom, 0.08, {});
            const b0 = lane.at(s, front + 0.2, 0.08, {}), b1 = lane.at(s + step, front + 0.2, 0.08, {});
            stone.quad([b0.x, b0.y, b0.z], [b1.x, b1.y, b1.z], [a1.x, a1.y, a1.z], [a0.x, a0.y, a0.z], path);
            const e0 = lane.at(s, flagsFrom, 0, {}), e1 = lane.at(s + step, flagsFrom, 0, {});
            stone.quad([a0.x, a0.y, a0.z], [a1.x, a1.y, a1.z], [e1.x, e1.y, e1.z], [e0.x, e0.y, e0.z], kerb);
        }
        for (const cottage of lane.cottages) HillScene.cottage(lane, cottage, front, meshes);

        // The lower village: roofs below the end of the lane, scattered over the slope
        const rand = HillLane.random(r.seed + 23);
        const end = lane.sample(r.lengthM);
        for (let i = 0; i < 46; i++) {
            const ahead = 30 + rand() * 260, aside = (rand() - 0.5) * 220;
            const x = end.x + end.alongX * ahead + end.leftX * aside, z = end.z + end.alongZ * ahead + end.leftZ * aside;
            const y = HillScene.groundY(lane, x, z);
            const wide = 6 + rand() * 6, deep = 5 + rand() * 3, turn = end.heading + (rand() < 0.5 ? 0 : Math.PI / 2) + (rand() - 0.5) * 0.3;
            HillScene.house(x, y, z, wide, deep, 4.2 + rand() * 1.5, turn, rand() < 0.4 ? 'thatch' : 'tile', rand() < 0.4 ? C.lime : C.stone, meshes);
        }

        for (const [key, mesh] of Object.entries(meshes)) {
            if (!mesh.position.length) continue;
            const material = key === 'glass' ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2, metalness: 0.4, side: THREE.DoubleSide })
                : key === 'thatch' ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide }) : plain;
            const built = mesh.mesh(material);
            built.name = `hill-${key}`;
            group.add(built);
        }

        // The vale: the hillside and the fields falling away beyond the village, to low hills in the haze
        group.add(HillScene.vale(lane));
        group.add(HillScene.trees(lane));
        return { group, sunTarget: lane.at(r.lengthM * 0.4, 0, 0, {}) };
    }

    // Reverses every triangle (a ribbon built facing down faces up)
    static flip(mesh) {
        const pos = mesh.position, nor = mesh.normal, uv = mesh.uv, col = mesh.color;
        for (let i = 0; i < pos.length; i += 9) {
            for (let k = 0; k < 3; k++) {
                [pos[i + 3 + k], pos[i + 6 + k]] = [pos[i + 6 + k], pos[i + 3 + k]];
                [col[i + 3 + k], col[i + 6 + k]] = [col[i + 6 + k], col[i + 3 + k]];
            }
            const t = i / 9 * 6;
            [uv[t + 2], uv[t + 4]] = [uv[t + 4], uv[t + 2]];
            [uv[t + 3], uv[t + 5]] = [uv[t + 5], uv[t + 3]];
            for (let k = 0; k < 9; k++) nor[i + k] = -nor[i + k];
        }
    }

    // One cottage of the row: its front on the flags' back edge, along the lane from `from` to `to`
    static cottage(lane, c, front, meshes) {
        const C = HillScene.COLOURS, rgb = HillScene.rgb;
        const r = lane.rule;
        const smp = lane.sample(c.mid);
        const L = [smp.leftX, 0, smp.leftZ], A = [smp.alongX, 0, smp.alongZ];
        const centre = lane.at(c.mid, front + r.cottageDeepM / 2, 0, {});
        const eaves = c.storeys === 2 ? r.eavesUpM : r.eavesUpM - 1.4;
        const hw = c.wide / 2, hd = r.cottageDeepM / 2;
        const bottom = c.foot, top = c.floor + eaves;
        const wallTone = rgb(c.wall === 'lime' ? C.lime : c.wall === 'dark' ? C.dark : C.stone);
        const o = [centre.x, (bottom + top) / 2, centre.z];
        meshes.stone.box(o, [A[0] * hw, 0, A[2] * hw], [0, (top - bottom) / 2, 0], [L[0] * hd, 0, L[2] * hd], wallTone);
        const pt = (along, rise, across) => [centre.x + A[0] * along + L[0] * across, rise, centre.z + A[2] * along + L[2] * across];
        // The roof: along the lane with eaves to the front, or a gable to the lane
        const ridge = top + r.ridgeUpM, over = 0.45;
        const thatch = c.roof === 'thatch';
        const roof = thatch ? meshes.thatch : meshes.roof;
        const tone = rgb(thatch ? C.thatch : C.tile);
        const thick = thatch ? 0.45 : 0.12;
        if (!c.gable) {
            const e = hw + (thatch ? 0.35 : 0.2);
            for (const side of [-1, 1]) {
                const eave = pt(0, top - (thatch ? 0.35 : 0.05), side * (hd + over));
                roof.quad(pt(-e, eave[1], side * (hd + over)), pt(e, eave[1], side * (hd + over)), pt(e, ridge, 0), pt(-e, ridge, 0), tone);
                roof.quad(pt(e, eave[1], side * (hd + over)), pt(-e, eave[1], side * (hd + over)), pt(-e, eave[1] - thick, side * (hd + over)), pt(e, eave[1] - thick, side * (hd + over)), tone);
            }
            for (const end of [-1, 1]) {
                meshes.stone.tri(pt(end * hw, top, -hd), pt(end * hw, top, hd), pt(end * hw, ridge - 0.2, 0), wallTone);
                meshes.stone.tri(pt(end * hw, top, hd), pt(end * hw, top, -hd), pt(end * hw, ridge - 0.2, 0), wallTone);
            }
            if (thatch) {
                // The thatch's rounded ridge
                roof.box(pt(0, ridge + 0.05, 0), [A[0] * (e + 0.05), 0, A[2] * (e + 0.05)], [0, 0.22, 0], [L[0] * 0.35, 0, L[2] * 0.35], tone);
            }
        } else {
            const e = hd + over;
            for (const side of [-1, 1]) {
                const eave = top - (thatch ? 0.35 : 0.05);
                roof.quad(pt(side * (hw + over), eave, e), pt(side * (hw + over), eave, -e), pt(0, ridge, -e), pt(0, ridge, e), tone);
            }
            for (const end of [-1, 1]) {
                meshes.stone.tri(pt(-hw, top, end * hd), pt(hw, top, end * hd), pt(0, ridge - 0.2, end * hd), wallTone);
                meshes.stone.tri(pt(hw, top, end * hd), pt(-hw, top, end * hd), pt(0, ridge - 0.2, end * hd), wallTone);
            }
        }
        // A chimney on one end, its pots
        if (c.chimney) {
            const at = pt(c.chimney * (hw - 0.5), ridge + 0.4, c.gable ? 0 : 0);
            meshes.stone.box(at, [A[0] * 0.4, 0, A[2] * 0.4], [0, 1.1, 0], [L[0] * 0.35, 0, L[2] * 0.35], rgb(C.chimney));
            meshes.stone.box([at[0], at[1] + 1.25, at[2]], [A[0] * 0.1, 0, A[2] * 0.1], [0, 0.18, 0], [L[0] * 0.1, 0, L[2] * 0.1], rgb(C.pot));
        }
        // The front: a door with a step, windows in white frames on each storey
        const face = -hd - 0.02;
        const doorAt = -hw + c.wide * c.door;
        meshes.glass.box(pt(doorAt, c.floor + 1.0, face), [A[0] * 0.45, 0, A[2] * 0.45], [0, 1.0, 0], [L[0] * 0.05, 0, L[2] * 0.05], rgb(C.door));
        meshes.stone.box(pt(doorAt, c.floor - 0.05, face - 0.3), [A[0] * 0.6, 0, A[2] * 0.6], [0, 0.2, 0], [L[0] * 0.3, 0, L[2] * 0.3], rgb(C.step));
        const windows = Math.max(1, Math.floor(c.wide / 2.6));
        for (let storey = 0; storey < c.storeys; storey++) {
            const y = c.floor + 1.5 + storey * 2.2;
            for (let i = 0; i < windows; i++) {
                const along = -hw + (i + 0.5) * c.wide / windows;
                if (storey === 0 && Math.abs(along - doorAt) < 1.1) continue;
                meshes.stone.box(pt(along, y, face - 0.01), [A[0] * 0.42, 0, A[2] * 0.42], [0, 0.52, 0], [L[0] * 0.03, 0, L[2] * 0.03], rgb(C.frame));
                meshes.glass.box(pt(along, y, face - 0.03), [A[0] * 0.37, 0, A[2] * 0.37], [0, 0.47, 0], [L[0] * 0.03, 0, L[2] * 0.03], rgb(c.lit && storey === 0 ? 0x6e5232 : C.glass));
                // The glazing bars: a cross over the glass
                meshes.stone.box(pt(along, y, face - 0.05), [A[0] * 0.37, 0, A[2] * 0.37], [0, 0.025, 0], [L[0] * 0.02, 0, L[2] * 0.02], rgb(C.frame));
                meshes.stone.box(pt(along, y, face - 0.05), [A[0] * 0.025, 0, A[2] * 0.025], [0, 0.47, 0], [L[0] * 0.02, 0, L[2] * 0.02], rgb(C.frame));
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
        meshes.stone.box(pt(hw - 0.6, ridge + 0.5, 0), [A[0] * 0.35, 0, A[2] * 0.35], [0, 0.9, 0], [L[0] * 0.3, 0, L[2] * 0.3], rgb(C.chimney));
    }

    // The ground's height at (x, z): the hillside the lane is cut into near it, falling to the vale beyond its end,
    // and low hills far off
    static groundY(lane, x, z) {
        const r = lane.rule;
        const end = lane.sample(r.lengthM);
        // How far along the lane's line, and across it
        const t = (x - end.x) * end.alongX + (z - end.z) * end.alongZ;
        let nearY, across;
        if (t < 0) {
            // Beside the lane: the lane's height at the nearest station, and how far from its centre. Behind the wall
            // (its right, -x) the ground stays under the wall's top; behind the cottages it rises as the hillside
            let best = Infinity, near = lane.points[0];
            for (let i = 0; i < lane.points.length; i += 4) {
                const pnt = lane.points[i];
                const d = Math.hypot(x - pnt.x, z - pnt.z);
                if (d < best) { best = d; near = pnt; }
            }
            nearY = near.y;
            const side = (x - near.x) * Math.cos(near.heading) - (z - near.z) * Math.sin(near.heading);
            across = side > 0 ? best : 0;
        } else {
            nearY = lane.bottomY - 32 * HillScene.smooth(t / 420);
            across = Math.abs((x - end.x) * end.leftX + (z - end.z) * end.leftZ);
        }
        const hills = 70 * HillScene.smooth((t - 900) / 900);
        // Under the village the ground stays well below the lane (the grid is coarse, the lane steep); out past the
        // cottages and the wall it rises as the hillside
        const rise = across > 16 ? (across - 16) * 0.3 : 0;
        const ripple = 3 * Math.sin(x * 0.011) * Math.cos(z * 0.009) + 1.5 * Math.sin(x * 0.031 + z * 0.017);
        return nearY - 3 + rise * (t < 0 ? 1 : 0.4) + hills + ripple * HillScene.smooth((t + 40) / 200);
    }

    static smooth(t) {
        const c = Math.max(0, Math.min(1, t));
        return c * c * (3 - 2 * c);
    }

    // The vale: one grid of ground round the village and out to the hills, the fields laid over it
    static vale(lane) {
        const size = 2400, n = 240;
        const end = lane.sample(lane.rule.lengthM);
        const cx = end.x + end.alongX * 900, cz = end.z + end.alongZ * 900;
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
        const end = lane.sample(lane.rule.lengthM);
        const crown = new THREE.IcosahedronGeometry(1, 1);
        const material = new THREE.MeshStandardMaterial({ color: HillScene.COLOURS.tree, roughness: 1, flatShading: true });
        const count = 520;
        const trees = new THREE.InstancedMesh(crown, material, count);
        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), at = new THREE.Vector3();
        let placed = 0;
        for (let i = 0; i < count * 2 && placed < count; i++) {
            const ahead = -150 + rand() * 1700, aside = (rand() - 0.5) * 1400;
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
