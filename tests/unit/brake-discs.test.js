// The brake discs of the Blender-made bikes as the game shows them: each
// bike's modelled parts swapped in by js/bikemodels.js, the wheels spun by
// Vehicle.updateMesh, read in the bike's own axes. Each disc stands upright
// on its axle (its face turned along the axle, x, at every point of its
// spin), is centred on the axle, is a believable size, clears the swingarm,
// the forks, the frame and the wheel, and its caliper straddles it.
//
// Sizes: the bikes are modelled a little under life size (the dirt bike's
// 18-inch rear rim is 0.40 m across), so a 200-320 mm disc is a radius of
// 0.10-0.16 m here.
import { readFileSync } from 'node:fs';
import { Blob } from 'node:buffer';
import { TextDecoder } from 'node:util';
import { canvasStub, loadScript, realThree } from '../helpers/load-game.js';

const root = new URL('../../', import.meta.url);
const RADIUS = [0.1, 0.16];
const AXLE = { disc_rear: [0.3, -0.7], disc_front: [0.3, 0.7] };
const NODE = { disc_rear: 'rearDisc', disc_front: 'frontDisc' };

function load() {
    const THREE = realThree();
    const source = ['vehicle.js', 'sceneassets.js', 'bikemodels.js', 'traffic.js'].map(loadScript).join('\n;\n');
    const sink = { log() {}, warn() {}, error() {} };
    const fetch = async url => {
        const bytes = readFileSync(new URL(url, root));
        return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
    };
    const factory = new Function(
        'THREE', 'document', 'localStorage', 'console', 'fetch', 'Blob', 'TextDecoder', 'performance',
        `${source}\nreturn { Vehicle, CHARACTERS, SceneAssets, BikeModels };`
    );
    return { THREE, ...factory(THREE, canvasStub(), { getItem: () => null, setItem() {} }, sink, fetch, Blob, TextDecoder, performance) };
}

// The unit normal of a near-flat cloud of points: the eigenvector of its
// covariance with the smallest eigenvalue (Jacobi rotations on a 3x3)
export function planeNormal(list) {
    const mid = [0, 1, 2].map(a => list.reduce((s, p) => s + p[a], 0) / list.length);
    const m = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (const p of list) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m[i][j] += (p[i] - mid[i]) * (p[j] - mid[j]);
    const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (let sweep = 0; sweep < 50; sweep++) {
        for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
            if (Math.abs(m[p][q]) < 1e-15) continue;
            const theta = (m[q][q] - m[p][p]) / (2 * m[p][q]);
            const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
            const c = 1 / Math.sqrt(t * t + 1), s = t * c;
            for (let k = 0; k < 3; k++) {
                const a = m[k][p], b = m[k][q];
                m[k][p] = c * a - s * b; m[k][q] = s * a + c * b;
            }
            for (let k = 0; k < 3; k++) {
                const a = m[p][k], b = m[q][k];
                m[p][k] = c * a - s * b; m[q][k] = s * a + c * b;
            }
            for (let k = 0; k < 3; k++) {
                const a = v[k][p], b = v[k][q];
                v[k][p] = c * a - s * b; v[k][q] = s * a + c * b;
            }
        }
    }
    const least = [0, 1, 2].reduce((best, i) => (m[i][i] < m[best][best] ? i : best), 0);
    return { normal: [v[0][least], v[1][least], v[2][least]], mid };
}

// How one disc stands: its tilt off the axle in degrees, its centre's
// distance from the axle across the wheel's plane, its radius, and the slab
// its outer half (the ring and the carrier's arms) fills along the axle. The
// inner half is the carrier's boss, which bolts to the hub.
export function stance(list, axle) {
    const { normal, mid } = planeNormal(list);
    const tilt = Math.acos(Math.min(1, Math.abs(normal[0]))) * 180 / Math.PI;
    const out = ([, y, z]) => Math.hypot(y - axle[0], z - axle[1]);
    const radius = Math.max(...list.map(out));
    const xs = list.filter(p => out(p) >= radius * 0.5).map(p => p[0]);
    return { tilt, offset: Math.hypot(mid[1] - axle[0], mid[2] - axle[1]), radius, x: [Math.min(...xs), Math.max(...xs)], mid };
}

// Whether a triangle reaches into the disc's slab between `inner` and the
// rim, split until its pieces are under 2 mm
export function cuts(a, b, c, disc, depth = 0) {
    const xs = [a[0], b[0], c[0]];
    if (Math.max(...xs) < disc.x[0] || Math.min(...xs) > disc.x[1]) return false;
    const ys = [a[1], b[1], c[1]], zs = [a[2], b[2], c[2]];
    const [ay, az] = disc.axle, r = disc.radius;
    if (Math.max(...ys) < ay - r || Math.min(...ys) > ay + r || Math.max(...zs) < az - r || Math.min(...zs) > az + r) return false;
    const inside = p => p[0] >= disc.x[0] && p[0] <= disc.x[1] && Math.hypot(p[1] - ay, p[2] - az) >= disc.inner && Math.hypot(p[1] - ay, p[2] - az) <= r;
    const centre = [0, 1, 2].map(k => (a[k] + b[k] + c[k]) / 3);
    if (inside(a) || inside(b) || inside(c) || inside(centre)) return true;
    const edge = Math.max(...[[a, b], [b, c], [c, a]].map(([p, q]) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])));
    if (edge < 0.002 || depth > 14) return false;
    const ab = a.map((v, k) => (v + b[k]) / 2), bc = b.map((v, k) => (v + c[k]) / 2), ca = c.map((v, k) => (v + a[k]) / 2);
    return cuts(a, ab, ca, disc, depth + 1) || cuts(ab, b, bc, disc, depth + 1) || cuts(ca, bc, c, disc, depth + 1) || cuts(ab, bc, ca, disc, depth + 1);
}

// Every mesh under `object` with the material name the model file gave it
function meshes(object, names) {
    const found = [];
    object.traverse(o => { if (o.isMesh) found.push({ mesh: o, name: names.get(o.geometry) }); });
    return found;
}

// A mesh's vertices in the bike's axes (the group sits at the origin)
function points(mesh) {
    const position = mesh.geometry.attributes.position;
    const list = [];
    for (let i = 0; i < position.count; i++) {
        const w = mesh.localToWorld(new game.THREE.Vector3(position.getX(i), position.getY(i), position.getZ(i)));
        list.push([w.x, w.y, w.z]);
    }
    return list;
}

function triangles(mesh, visit) {
    const list = points(mesh);
    const index = mesh.geometry.index;
    const count = index ? index.count : list.length;
    for (let i = 0; i < count; i += 3) {
        const [a, b, c] = [i, i + 1, i + 2].map(k => list[index ? index.getX(k) : k]);
        if (visit(a, b, c)) return true;
    }
    return false;
}

const game = load();
const bikes = Object.entries(game.BikeModels.BIKES).map(([id, file]) => [file.replace(/.*\//, ''), id, file]);

describe.each(bikes)('%s brake discs in the game', (label, id, file) => {
    let vehicle, names;
    beforeAll(async () => {
        await game.BikeModels.preload();
        vehicle = new game.Vehicle(new game.THREE.Scene(), null, game.CHARACTERS.find(c => c.id === id));
        const model = await game.SceneAssets.loadModel(file);
        names = new Map();
        for (const primitives of model.meshes.values()) for (const { geometry, material } of primitives) names.set(geometry, material.name);
    });

    // The bike at rest at the origin, its wheels spun to `turn`
    function spin(turn) {
        vehicle.speed = 0;
        vehicle.steeringAngle = 0;
        vehicle.leanAngle = 0;
        vehicle.wheelRotation = turn;
        vehicle.updateMesh();
        vehicle.group.position.set(0, 0, 0);
        vehicle.group.rotation.set(0, 0, 0);
        vehicle.group.updateMatrixWorld(true);
    }

    // Each disc of a node, split by side for a twin-disc bike
    function discs(node) {
        const list = meshes(vehicle[NODE[node]], names).flatMap(({ mesh }) => points(mesh));
        return [-1, 1].map(side => list.filter(p => Math.sign(p[0]) === side)).filter(side => side.length > 20).map(side => stance(side, AXLE[node]));
    }

    test('swaps in the modelled discs', () => {
        expect(vehicle.modelled).toBe(true);
        expect(vehicle.rearDisc.name).toBe('disc_rear');
        expect(vehicle.frontDisc.name).toBe('disc_front');
    });

    test.each(Object.keys(AXLE))('the %s stands on its axle at every point of its spin', node => {
        for (const turn of [0, 0.7, 1.9, 3.4, 5.1]) {
            spin(turn);
            const found = discs(node);
            expect(found.length).toBeGreaterThan(0);
            for (const disc of found) {
                expect(disc.tilt).toBeLessThan(3);
                expect(disc.offset).toBeLessThan(0.003);
                expect(disc.radius).toBeGreaterThanOrEqual(RADIUS[0]);
                expect(disc.radius).toBeLessThanOrEqual(RADIUS[1]);
                // Thin across the axle: a disc turned on its edge would span its diameter
                expect(disc.x[1] - disc.x[0]).toBeLessThan(0.03);
            }
        }
    });

    test.each(Object.keys(AXLE))('the %s clears the swingarm, forks, frame and wheel, and its caliper straddles it', node => {
        spin(0);
        const others = [];
        vehicle.group.children.forEach(child => {
            if (child === vehicle.rearDisc || child === vehicle.frontDisc || child === vehicle.rider) return;
            others.push(...meshes(child, names));
        });
        for (const stood of discs(node)) {
            const disc = { ...stood, axle: AXLE[node], inner: stood.radius * 0.5, x: [stood.x[0] - 0.001, stood.x[1] + 0.001] };
            // The caliper on this disc's side and its end of the bike
            const callers = others.filter(({ name }) => name === 'caliper').map(({ mesh }) => points(mesh))
                .map(list => list.filter(p => Math.sign(p[0]) === Math.sign(stood.mid[0]) && Math.abs(p[2] - AXLE[node][1]) < stood.radius * 1.3))
                .filter(list => list.length);
            expect(callers.length).toBeGreaterThan(0);
            for (const list of callers) {
                const xs = list.map(p => p[0]);
                expect(Math.min(...xs)).toBeLessThan(stood.mid[0]);
                expect(Math.max(...xs)).toBeGreaterThan(stood.mid[0]);
            }
            const clashes = others.filter(({ name }) => name !== 'caliper').filter(({ mesh }) => triangles(mesh, (a, b, c) => cuts(a, b, c, disc)))
                .map(({ mesh, name }) => `${mesh.parent && mesh.parent.name ? mesh.parent.name + '/' : ''}${mesh.name || ''}:${name}`);
            expect(clashes).toEqual([]);
        }
    });
});

describe('the check itself', () => {
    // A ring of radius 0.11 at x 0.07 round the rear axle, turned `tilt` radians about z
    const ring = tilt => {
        const list = [];
        for (let k = 0; k < 24; k++) for (const dx of [-0.003, 0.003]) {
            const a = k * Math.PI / 12, x = dx, y = Math.cos(a) * 0.11;
            list.push([0.07 + x * Math.cos(tilt) - y * Math.sin(tilt), 0.3 + x * Math.sin(tilt) + y * Math.cos(tilt), -0.7 + Math.sin(a) * 0.11]);
        }
        return list;
    };

    test('reads a disc square to its axle, one tilted and one lying flat', () => {
        expect(stance(ring(0), AXLE.disc_rear).tilt).toBeLessThan(0.01);
        expect(stance(ring(0), AXLE.disc_rear).offset).toBeLessThan(1e-6);
        expect(stance(ring(0), AXLE.disc_rear).radius).toBeCloseTo(0.11, 4);
        expect(stance(ring(5 * Math.PI / 180), AXLE.disc_rear).tilt).toBeCloseTo(5, 1);
        expect(stance(ring(Math.PI / 2), AXLE.disc_rear).tilt).toBeCloseTo(90, 1);
    });

    test('sees a beam face lying in the disc plane and passes one beside it', () => {
        const disc = { x: [0.066, 0.074], axle: AXLE.disc_rear, radius: 0.11, inner: 0.033 };
        // A long triangle with no vertex near the disc, crossing it
        expect(cuts([0.07, 0.36, -0.2], [0.07, 0.29, -0.2], [0.07, 0.3, -0.9], disc)).toBe(true);
        expect(cuts([0.06, 0.36, -0.2], [0.08, 0.29, -0.2], [0.07, 0.3, -0.95], disc)).toBe(true);
        expect(cuts([0.075, 0.36, -0.2], [0.1, 0.29, -0.2], [0.075, 0.3, -0.9], disc)).toBe(false);
        // Inside the slab but within the carrier, at the axle
        expect(cuts([0.07, 0.31, -0.71], [0.07, 0.29, -0.71], [0.07, 0.3, -0.69], disc)).toBe(false);
    });
});
