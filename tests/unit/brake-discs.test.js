// The brake discs of the Blender-made bikes as the game shows them: each
// bike's modelled parts swapped in by js/bikemodels.js, the wheels spun by
// Vehicle.updateMesh, read in the bike's own axes. Each disc stands upright
// on its axle (its face turned along the axle, x, at every point of its
// spin), is centred on the axle, is a believable size, clears the swingarm,
// the forks, the frame and the wheel, and its caliper straddles it.
//
// Sizes: the procedural kinds are modelled a little under life size (the
// dirt bike's 18-inch rear rim is 0.40 m across), the detailed bikes at life
// size, so a 200-340 mm disc is a radius of 0.10-0.17 m (the scrambler's
// front disc is 330 mm). Each bike's axles are its own (vehicle.axles).
import { readFileSync } from 'node:fs';
import { Blob } from 'node:buffer';
import { TextDecoder } from 'node:util';
import { canvasStub, loadScript, realThree } from '../helpers/load-game.js';
import { planeNormal } from '../helpers/bike-rig.js';

const root = new URL('../../', import.meta.url);
const RADIUS = [0.1, 0.17];
const AXLE = { disc_rear: [0.3, -0.7], disc_front: [0.3, 0.7] };
const WHEEL = { disc_rear: 'rear', disc_front: 'front' };
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
        `${source}\nreturn { Vehicle, CHARACTERS, SceneAssets, BikeModels, BIKE_MODELS };`
    );
    return { THREE, ...factory(THREE, canvasStub(), { getItem: () => null, setItem() {} }, sink, fetch, Blob, TextDecoder, performance) };
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

// Every mesh under `object` with the material name the model file gave it,
// in the level of detail drawn near the camera (a THREE.LOD's first level)
function meshes(object, names) {
    const found = [];
    const visit = o => {
        if (o.isMesh) found.push({ mesh: o, name: names.get(o.geometry) });
        (o.isLOD ? [o.levels[0].object] : o.children).forEach(visit);
    };
    visit(object);
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
// Every detailed bike and every procedural kind's file, ridden by Steve
const bikes = [...Object.keys(game.BIKE_MODELS), ...Object.keys(game.BikeModels.MODELS)].map(id => [game.BikeModels.entry(id).file.replace(/.*\//, ''), id, game.BikeModels.entry(id).file]);

describe.each(bikes)('%s brake discs in the game', (label, id, file) => {
    let vehicle, names;
    const axle = node => vehicle.axles[WHEEL[node]].slice(0, 2);
    beforeAll(async () => {
        await game.BikeModels.preload([id]);
        const rider = { ...game.CHARACTERS[0], bikes: [id] };
        vehicle = new game.Vehicle(new game.THREE.Scene(), null, rider, id);
        const model = await game.SceneAssets.loadModel(file);
        names = new Map();
        const levels = model.groups.size ? [...model.groups.values()] : [model];
        for (const level of levels) for (const primitives of level.meshes.values()) for (const { geometry, material } of primitives) names.set(geometry, material.name);
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
        return [-1, 1].map(side => list.filter(p => Math.sign(p[0]) === side)).filter(side => side.length > 20).map(side => stance(side, axle(node)));
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
            const disc = { ...stood, axle: axle(node), inner: stood.radius * 0.5, x: [stood.x[0] - 0.001, stood.x[1] + 0.001] };
            // The caliper on this disc's side and its end of the bike
            const callers = others.filter(({ name }) => name === 'caliper').map(({ mesh }) => points(mesh))
                .map(list => list.filter(p => Math.sign(p[0]) === Math.sign(stood.mid[0]) && Math.abs(p[2] - axle(node)[1]) < stood.radius * 1.3))
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
