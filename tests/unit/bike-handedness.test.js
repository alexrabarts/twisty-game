// Which side of each bike is which, as the game draws it. In three.js the
// chase camera looks up +z with +y up, so +x is on the left of the screen:
// the rider's left. Every bike carries its chain (or the scooter its belt)
// on the rider's left, +x, and its rear disc on the side the real bike does
// (BIKE_MODELS rearBrake), whichever convention its file was written in:
// the files written with +x on the rider's right are mirrored as they load
// (BIKE_MODELS mirror, BikeModels' kinds and the crew bike), the procedural
// bike as it is built (Vehicle.mirrorParts).
import { readFileSync } from 'node:fs';
import { Blob } from 'node:buffer';
import { TextDecoder } from 'node:util';
import { canvasStub, loadScript, realThree } from '../helpers/load-game.js';

const root = new URL('../../', import.meta.url);
const LEFT = 1;
const RIGHT = -1;

function load() {
    const THREE = realThree();
    const source = ['vehicle.js', 'sceneassets.js', 'bikemodels.js', 'traffic.js'].map(loadScript).join('\n;\n');
    const log = [];
    const sink = { log() {}, warn: (...a) => log.push(a.join(' ')), error: (...a) => log.push(a.join(' ')) };
    const fetch = async url => {
        const bytes = readFileSync(new URL(url, root));
        return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
    };
    const factory = new Function(
        'THREE', 'document', 'localStorage', 'console', 'fetch', 'Blob', 'TextDecoder', 'performance',
        `${source}\nreturn { Vehicle, CHARACTERS, BikeModels, BIKE_MODELS, AIMotorcycle };`
    );
    return { THREE, log, ...factory(THREE, canvasStub(), { getItem: () => null, setItem() {} }, sink, fetch, Blob, TextDecoder, performance) };
}

const game = load();
const { THREE } = game;

// The triangles of `object`'s near level in the bike's axes, with their material names
function triangles(object) {
    const found = [];
    object.updateMatrixWorld(true);
    const visit = o => {
        if (o.isMesh) {
            const position = o.geometry.attributes.position;
            const index = o.geometry.index;
            const count = index ? index.count : position.count;
            const at = k => new THREE.Vector3().fromBufferAttribute(position, index ? index.getX(k) : k).applyMatrix4(o.matrixWorld).toArray();
            for (let i = 0; i < count; i += 3) found.push({ points: [at(i), at(i + 1), at(i + 2)], material: o.material.name });
        }
        (o.isLOD ? [o.levels[0].object] : o.children).forEach(visit);
    };
    visit(object);
    return found;
}

// The side of the chain's lower run: long thin faces running forward from
// the rear sprocket, below the axle and outboard of the wheel's middle.
// Null when there is none (a belt, a shaft or a covered drive).
export function chainSide(body, [axleY, axleZ]) {
    const votes = { [LEFT]: 0, [RIGHT]: 0 };
    for (const { points } of body) {
        const extent = axis => Math.max(...points.map(p => p[axis])) - Math.min(...points.map(p => p[axis]));
        const mid = axis => points.reduce((sum, p) => sum + p[axis], 0) / 3;
        if (extent(2) < 0.2 || extent(0) > 0.03) continue;
        const x = mid(0);
        if (Math.abs(x) < 0.05 || Math.abs(x) > 0.2) continue;
        if (Math.min(...points.map(p => p[2])) > axleZ + 0.15 || Math.max(...points.map(p => p[2])) < axleZ + 0.3) continue;
        const y = mid(1);
        if (y < axleY - 0.03 && y > axleY - 0.2) votes[Math.sign(x)]++;
    }
    if (votes[LEFT] === votes[RIGHT]) return null;
    return votes[LEFT] > votes[RIGHT] ? LEFT : RIGHT;
}

// The side of a belt drive's rear pulley: a wide dark disc round the rear
// axle well outboard of the tyre
function beltSide(body, [axleY, axleZ]) {
    let sum = 0;
    for (const { points, material } of body) {
        if (material !== 'dark_metal') continue;
        for (const [x, y, z] of points) {
            if (Math.abs(x) > 0.15 && Math.abs(x) < 0.25 && Math.hypot(y - axleY, z - axleZ) < 0.13) sum += Math.sign(x);
        }
    }
    return Math.sign(sum) || null;
}

const middle = list => list.reduce((sum, p) => sum + p[0], 0) / list.length;
const points = object => triangles(object).flatMap(t => t.points);

describe('the screen', () => {
    test('a camera behind the bike looking up +z sees +x on its left', () => {
        const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
        camera.position.set(0, 1.5, -5);
        camera.lookAt(0, 0.8, 0);
        camera.updateMatrixWorld(true);
        expect(new THREE.Vector3(1, 0.8, 0).project(camera).x).toBeLessThan(0);
    });
});

const detailed = Object.entries(game.BIKE_MODELS).map(([id, bike]) => [id, bike]);
const kinds = Object.keys(game.BikeModels.MODELS).map(id => [id, { drive: id === 'adventure' || id === 'scooter' ? null : 'chain', rearBrake: 'right' }]);

describe.each([...detailed, ...kinds])('the modelled %s', (id, bike) => {
    let vehicle;
    beforeAll(async () => {
        await game.BikeModels.preload([id]);
        const rider = { ...game.CHARACTERS[0], bikes: [id] };
        vehicle = new game.Vehicle(new THREE.Scene(), null, rider, id);
        vehicle.group.position.set(0, 0, 0);
        vehicle.group.rotation.set(0, 0, 0);
    });

    test('carries its drive on the rider\'s left', () => {
        expect(vehicle.modelled).toBe(true);
        const body = triangles(vehicle.group.children.find(child => child.name === 'body'));
        const axle = vehicle.axles.rear;
        if (bike.drive === 'chain') expect(chainSide(body, axle)).toBe(LEFT);
        if (bike.drive === 'belt') expect(beltSide(body, axle)).toBe(LEFT);
        // A bike with no chain shows no chain run on either side
        if (!bike.drive) expect(chainSide(body, axle)).toBeNull();
    });

    test('carries its rear disc and caliper on the side the real bike does', () => {
        const side = bike.rearBrake === 'left' ? LEFT : RIGHT;
        expect(Math.sign(middle(points(vehicle.rearDisc)))).toBe(side);
        const body = triangles(vehicle.group.children.find(child => child.name === 'body'));
        const [, axleZ] = vehicle.axles.rear;
        const caliper = body.filter(t => t.material === 'caliper').flatMap(t => t.points).filter(p => Math.abs(p[2] - axleZ) < 0.25);
        expect(caliper.length).toBeGreaterThan(0);
        expect(Math.sign(middle(caliper))).toBe(side);
    });

    test('keeps its forks named for the rider\'s sides', () => {
        expect(vehicle.leftFork.position.x).toBeGreaterThan(0);
        expect(vehicle.rightFork.position.x).toBeLessThan(0);
    });
});

describe.each(Object.keys(game.Vehicle.BIKES))('the procedural %s', kind => {
    test('carries its rear disc on the rider\'s right and its forks on their sides', () => {
        const vehicle = new game.Vehicle(new THREE.Scene(), null, { ...game.CHARACTERS[0], bikes: [kind] }, kind, { model: false });
        vehicle.group.position.set(0, 0, 0);
        vehicle.group.rotation.set(0, 0, 0);
        expect(vehicle.modelled).toBeFalsy();
        expect(Math.sign(middle(points(vehicle.rearDisc)))).toBe(RIGHT);
        expect(vehicle.leftFork.position.x).toBeGreaterThan(0);
        expect(vehicle.rightFork.position.x).toBeLessThan(0);
        // Mirrored, not turned: the wheels still spin and steer the right way
        // At walking pace, where the bar is drawn with the steering (Vehicle.shownBar)
        vehicle.speed = 1;
        vehicle.steeringAngle = 0.2;
        vehicle.currentDeltaTime = 1 / 60;
        vehicle.updateMesh();
        vehicle.group.updateMatrixWorld(true);
        const ahead = new THREE.Vector3(0, 0, 1).transformDirection(vehicle.frontWheel.matrixWorld);
        expect(ahead.x).toBeGreaterThan(0);
    });
});

describe('the touring crew\'s bike', () => {
    test('carries its chain on the rider\'s left', async () => {
        await game.BikeModels.preload([]);
        const bike = new game.AIMotorcycle(new THREE.Scene(), null, { color: 0x0000ff, style: 'sport', riderName: 'Steve', helmetColor: 0xffffff, suitColor: 0x222222 });
        expect(bike.modelled).toBe(true);
        bike.bikeGroup.position.set(0, 0, 0);
        bike.bikeGroup.rotation.set(0, 0, 0);
        const body = triangles(bike.bikeGroup.children.find(child => child.name === 'body'));
        expect(chainSide(body, [0.3, -0.7])).toBe(LEFT);
        bike.remove();
    });
});
