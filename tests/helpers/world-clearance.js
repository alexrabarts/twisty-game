// Clearance of a world's scenery from its road bands, measured from what was drawn. Independent of the placement
// code: the road bands are rebuilt here from the ride's samples and every side edge's samples (each sample's own
// width, plus the drawn verge), and every scenery instance is measured by its geometry's box under its matrix.
// Plain ESM with no jest dependency, so the audit in the scratch runner and the unit test share it.

// Margins past the band's edge inside which a thing is too close (a warning, not a failure), by kind
export const MARGIN_M = { tree: 2, boulder: 2, house: 3, landmark: 3, stone: 0.15, tuft: 0.2, gate: 1.5 };
// Height over the road under which a thing stands in the rider's way (a station banner is above it)
export const HEADROOM_M = 4.5;
// A thing whose top is this far under the road is under it (a road on a bridge or a viaduct), not in it
export const UNDER_M = 0.5;

const HASH_M = 16;

// The road bands: every ride segment and every side-edge segment with its widths and heights, in a 16 m hash.
// `verge` metres are added to each half width (the drawn verge: RoadSurface.VERGE_M).
export function roadBands(env, verge) {
    const segments = [];
    const points = env.route.points;
    for (let i = 0; i + 1 < points.length; i++) {
        const a = points[i], b = points[i + 1];
        segments.push({ kind: 'ride', edgeId: null, s: env.route.sArray[i], x0: a.x, z0: a.z, y0: a.y, x1: b.x, z1: b.z, y1: b.y, h0: a.width / 2 + verge, h1: b.width / 2 + verge });
    }
    env.data.edges.forEach((edge) => {
        if (edge.onRide) return;
        const e = env.data.edgeSamples(edge.id);
        if (!e) throw new Error(`side edge ${edge.id} is not resident: load every chunk first`);
        for (let i = 0; i + 1 < e.x.length; i++) {
            segments.push({ kind: 'side', edgeId: edge.id, s: null, x0: e.x[i], z0: e.z[i], y0: e.y[i], x1: e.x[i + 1], z1: e.z[i + 1], y1: e.y[i + 1], h0: e.width[i] / 2 + verge, h1: e.width[i + 1] / 2 + verge });
        }
    });
    const hash = new Map();
    segments.forEach((g, ref) => {
        const reach = Math.max(g.h0, g.h1);
        for (let cx = Math.floor((Math.min(g.x0, g.x1) - reach) / HASH_M); cx <= Math.floor((Math.max(g.x0, g.x1) + reach) / HASH_M); cx++) {
            for (let cz = Math.floor((Math.min(g.z0, g.z1) - reach) / HASH_M); cz <= Math.floor((Math.max(g.z0, g.z1) + reach) / HASH_M); cz++) {
                const key = cx * 65536 + cz;
                let list = hash.get(key);
                if (!list) hash.set(key, (list = []));
                list.push(ref);
            }
        }
    });
    return { segments, hash, verge };
}

// Nearest point of segment (a, b) to point p: {t, d}
function toSegment(px, pz, x0, z0, x1, z1) {
    const dx = x1 - x0, dz = z1 - z0;
    const run = dx * dx + dz * dz;
    const t = run === 0 ? 0 : Math.max(0, Math.min(1, ((px - x0) * dx + (pz - z0) * dz) / run));
    return { t, d: Math.hypot(x0 + dx * t - px, z0 + dz * t - pz) };
}

function inside(poly, x, z) {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, zi] = poly[i], [xj, zj] = poly[j];
        if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
    }
    return hit;
}

function segmentsCross(a, b, c, d) {
    const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
    return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

// Gap in plan between a convex polygon and a road segment's centre line, with the t along the segment nearest it
function polygonGap(poly, g) {
    const a = [g.x0, g.z0], b = [g.x1, g.z1];
    if (inside(poly, a[0], a[1])) return { gap: 0, t: 0 };
    if (inside(poly, b[0], b[1])) return { gap: 0, t: 1 };
    for (let i = 0; i < poly.length; i++) if (segmentsCross(a, b, poly[i], poly[(i + 1) % poly.length])) return { gap: 0, t: 0.5 };
    let best = { gap: Infinity, t: 0 };
    for (const [x, z] of poly) {
        const n = toSegment(x, z, g.x0, g.z0, g.x1, g.z1);
        if (n.d < best.gap) best = { gap: n.d, t: n.t };
    }
    for (let i = 0; i < poly.length; i++) {
        const [px, pz] = poly[i], [qx, qz] = poly[(i + 1) % poly.length];
        for (const [x, z, t] of [[g.x0, g.z0, 0], [g.x1, g.z1, 1]]) {
            const n = toSegment(x, z, px, pz, qx, qz);
            if (n.d < best.gap) best = { gap: n.d, t };
        }
    }
    return best;
}

// The clearance of a footprint (a convex polygon in plan, [[x, z]...], standing from y0 to y1) from the road bands:
// {clearance, kind, edgeId, s, roadY} for the nearest band it shares height with, the clearance in metres past the
// band's edge (negative: inside the band). A band the footprint stands wholly over (HEADROOM_M) or under is skipped.
// `skip(segment)` leaves bands out.
export function clearanceOf(bands, poly, y0, y1, skip = null) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const refs = new Set();
    for (let cx = Math.floor(x0 / HASH_M) - 1; cx <= Math.floor(x1 / HASH_M) + 1; cx++) {
        for (let cz = Math.floor(z0 / HASH_M) - 1; cz <= Math.floor(z1 / HASH_M) + 1; cz++) {
            for (const ref of bands.hash.get(cx * 65536 + cz) || []) refs.add(ref);
        }
    }
    let best = { clearance: Infinity, kind: null, edgeId: null, s: null, roadY: null };
    for (const ref of refs) {
        const g = bands.segments[ref];
        if (skip && skip(g)) continue;
        const { gap, t } = polygonGap(poly, g);
        const roadY = g.y0 + (g.y1 - g.y0) * t;
        if (y0 >= roadY + HEADROOM_M || y1 <= roadY - UNDER_M) continue;
        const clearance = gap - (g.h0 + (g.h1 - g.h0) * t);
        if (clearance < best.clearance) best = { clearance, kind: g.kind, edgeId: g.edgeId, s: g.s === null ? null : g.s + t * Math.hypot(g.x1 - g.x0, g.z1 - g.z0), roadY };
    }
    return best;
}

// The plan footprint (the 4 corners of the box, which turns about y only) and height range of a geometry box under a matrix
export function footprint(THREE, box, matrix) {
    const corners = [];
    let y0 = Infinity, y1 = -Infinity;
    const v = new THREE.Vector3();
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
        v.set(x, y, z).applyMatrix4(matrix);
        y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
        if (y === box.min.y) corners.push([v.x, v.z]);
    }
    // corners: (minx,minz) (minx,maxz) (maxx,minz) (maxx,maxz) -> a loop
    return { poly: [corners[0], corners[1], corners[3], corners[2]], y0, y1 };
}

// Every placed thing under `root` that is scenery: [{type, name, poly, y0, y1, x, z}]. `type` comes from the mesh name.
export function sceneryOf(THREE, root) {
    const out = [];
    const matrix = new THREE.Matrix4();
    const world = new THREE.Matrix4();
    root.updateMatrixWorld(true);
    root.traverse((o) => {
        if (!o.isMesh) return;
        const type = typeOf(o);
        if (!type) return;
        // A merged mesh of footings (Scenery.footingMesh) is one thing per footing, each its own box in the world
        if (o.userData.footings) {
            o.userData.footings.forEach((f, i) => {
                const fx = Math.sin(f.rect.heading), fz = Math.cos(f.rect.heading), lx = Math.cos(f.rect.heading), lz = -Math.sin(f.rect.heading);
                const poly = [[-1, -1], [-1, 1], [1, 1], [1, -1]].map(([a, c]) => [f.rect.x + (a * f.rect.along / 2) * fx + (c * f.rect.across / 2) * lx, f.rect.z + (a * f.rect.along / 2) * fz + (c * f.rect.across / 2) * lz]);
                out.push({ type, name: o.name, index: i, poly, y0: f.bottom, y1: f.top, x: f.rect.x, z: f.rect.z, material: o.material });
            });
            return;
        }
        // A merged mesh of tufts (Scenery.tuftMesh) is one thing per tuft
        if (o.userData.tufts) {
            o.userData.tufts.forEach((f, i) => {
                const poly = [[-1, -1], [-1, 1], [1, 1], [1, -1]].map(([a, c]) => [f.x + a * f.radius, f.z + c * f.radius]);
                out.push({ type, name: o.name, index: i, poly, y0: f.y, y1: f.y + f.height, x: f.x, z: f.z, material: o.material });
            });
            return;
        }
        o.geometry.computeBoundingBox();
        const box = o.geometry.boundingBox;
        const count = o.isInstancedMesh ? o.count : 1;
        for (let i = 0; i < count; i++) {
            if (o.isInstancedMesh) {
                o.getMatrixAt(i, matrix);
                world.multiplyMatrices(o.matrixWorld, matrix);
            } else world.copy(o.matrixWorld);
            const f = footprint(THREE, box, world);
            const x = f.poly.reduce((sum, p) => sum + p[0], 0) / 4, z = f.poly.reduce((sum, p) => sum + p[1], 0) / 4;
            // `at`: where the thing itself was put (its own origin: a tree's trunk), which is not its box's middle
            out.push({ type, name: o.name, index: i, ...f, x, z, at: [world.elements[12], world.elements[14]], material: o.material });
        }
    });
    return out;
}

export function typeOf(mesh) {
    const name = mesh.name || '';
    if (name.startsWith('trees:')) return 'tree';
    if (name === 'boulders') return 'boulder';
    if (name.startsWith('houses:')) return 'house';
    if (name.startsWith('landmark:')) return 'landmark';
    if (name === 'stones') return 'stone';
    if (name === 'tufts') return 'tuft';
    return null;
}

// Classifies each thing: 'fail' (in a band), 'warn' (within its margin of a band's edge), or null (clear).
export function audit(bands, things) {
    const offenders = [];
    for (const t of things) {
        const near = clearanceOf(bands, t.poly, t.y0, t.y1);
        const margin = MARGIN_M[t.type] ?? 2;
        const level = near.clearance < 0 ? 'fail' : near.clearance < margin ? 'warn' : null;
        if (level) offenders.push({ level, type: t.type, name: t.name, ...(t.tile ? { tile: t.tile } : {}), x: Math.round(t.x * 10) / 10, z: Math.round(t.z * 10) / 10, clearance: Math.round(near.clearance * 100) / 100, road: near.kind, edgeId: near.edgeId, s: near.s === null ? null : Math.round(near.s) });
    }
    return offenders.sort((p, q) => p.clearance - q.clearance);
}

// Stand-ins for the modelled trees and houses (js/world/scenery.js Scenery.loadModels) in node: one box per shape,
// the size of the shape's mesh in its .glb (the POSITION bounds of its primitives), so footprints are the models' own
export function modelStandIns(THREE, readFileSync, root) {
    const bounds = (file) => {
        const bytes = readFileSync(new URL(file, root));
        const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
        const out = new Map();
        for (const node of json.nodes) {
            if (node.mesh === undefined || !node.name) continue;
            const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
            for (const p of json.meshes[node.mesh].primitives) {
                const a = json.accessors[p.attributes.POSITION];
                for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], a.min[i]); max[i] = Math.max(max[i], a.max[i]); }
            }
            // A packed file stores integer positions under a node scale (village_kit pack_colours: 0.001)
            const t = node.translation || [0, 0, 0], k = node.scale || [1, 1, 1];
            out.set(node.name, { min: min.map((v, i) => v * k[i] + t[i]), max: max.map((v, i) => v * k[i] + t[i]) });
        }
        return out;
    };
    const material = new THREE.MeshBasicMaterial();
    const part = ({ min, max }) => {
        const geometry = new THREE.BoxGeometry(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
        geometry.translate((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
        return [{ geometry, material }];
    };
    const trees = [];
    for (const [file, kind, names] of [['assets/trees/conifer.glb', 'conifer', ['conifer_spruce', 'conifer_fir', 'conifer_pine']], ['assets/trees/broadleaf.glb', 'broadleaf', ['broadleaf_oak', 'broadleaf_beech', 'broadleaf_ash']], ['assets/trees/bush.glb', 'bush', ['bush_round', 'bush_low']]]) {
        const found = bounds(file);
        for (const name of names) if (found.has(name)) trees.push({ kind, name, parts: part(found.get(name)) });
    }
    const houses = [...bounds('assets/village/houses.glb')].filter(([name]) => name.startsWith('house_') && !name.includes(':')).sort((p, q) => p[0].localeCompare(q[0])).map(([name, b]) => ({ name, parts: part(b) }));
    // The landmark models (WorldEnvironment.load reads models.landmarks in place of loading them): asset -> {meshes}
    const assets = JSON.parse(readFileSync(new URL('tools/world/landmarks.json', root), 'utf8')).map(l => l.asset).filter(a => /\.glb$/.test(a));
    const landmarks = new Map([...new Set(assets)].map(asset => [asset, { meshes: new Map([...bounds(asset)].filter(([name]) => !name.includes(':')).map(([name, b]) => [name, part(b)])) }]));
    return { trees, houses, landmarks };
}
