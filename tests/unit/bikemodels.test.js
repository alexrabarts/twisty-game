// The Blender-made bikes and rider (js/bikemodels.js, assets/bikes, built by
// tools/blender): the committed files fit their budgets, and swapping a
// vehicle's procedural model for the modelled one keeps every named part on
// its pivot, the bike's dimensions, the character's colours and the parts
// Vehicle.updateMesh animates. A file that fails leaves the procedural bike.
// Real modules on real three r150; fetch reads the files from disk.
import { readFileSync, statSync } from 'node:fs';
import { Blob } from 'node:buffer';
import { TextDecoder } from 'node:util';
import { canvasStub, loadScript, realThree } from '../helpers/load-game.js';

const root = new URL('../../', import.meta.url);
const BUDGET = { bike: 12000, rider: 5000, crew: 2600, file: 400 * 1024, total: 1.5 * 1024 * 1024 };
const IDS = ['steve', 'alex', 'tim', 'shane'];
const PIVOTS = ['rearWheel', 'frontWheel', 'rearDisc', 'frontDisc', 'leftFork', 'rightFork', 'handlebar', 'brakeLight', 'headlight', 'rider'];

function load({ failing = [], held = false } = {}) {
    const THREE = realThree();
    const source = ['vehicle.js', 'sceneassets.js', 'bikemodels.js', 'traffic.js'].map(loadScript).join('\n;\n');
    const log = [];
    const sink = { log() {}, warn: (...a) => log.push(a.join(' ')), error: (...a) => log.push(a.join(' ')) };
    let release;
    const gate = held ? new Promise(done => { release = done; }) : Promise.resolve();
    const fetch = async url => {
        await gate;
        if (failing.some(part => url.includes(part))) return { ok: false, status: 404 };
        const bytes = readFileSync(new URL(url, root));
        return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
    };
    const factory = new Function(
        'THREE', 'document', 'localStorage', 'console', 'fetch', 'Blob', 'TextDecoder', 'performance',
        `${source}\nreturn { Vehicle, CHARACTERS, SceneAssets, BikeModels, AIMotorcycle };`
    );
    const game = factory(THREE, canvasStub(), { getItem: () => null, setItem() {} }, sink, fetch, Blob, TextDecoder, performance);
    return { THREE, log, release, ...game };
}

const character = (game, id) => game.CHARACTERS.find(c => c.id === id);

function ride(game, id) {
    const scene = new game.THREE.Scene();
    const vehicle = new game.Vehicle(scene, null, character(game, id));
    return vehicle;
}

// What the rest of the game reads off a bike: where its parts pivot, how big
// its wheels and its outline are, and where the rider's hands and feet go
function measure(game, vehicle) {
    const { THREE } = game;
    vehicle.group.position.set(0, 0, 0);
    vehicle.group.rotation.set(0, 0, 0);
    vehicle.group.updateMatrixWorld(true);
    const box = object => new THREE.Box3().setFromObject(object);
    const size = object => box(object).getSize(new THREE.Vector3());
    const pivots = {};
    PIVOTS.forEach(name => { if (vehicle[name]) pivots[name] = vehicle[name].position.toArray(); });
    const base = new THREE.Vector3(0, vehicle.riderSpec.y, vehicle.riderSpec.z);
    return {
        pivots,
        rearTyre: size(vehicle.rearWheel).y / 2,
        frontTyre: size(vehicle.frontWheel).y / 2,
        outline: box(vehicle.group),
        lowest: box(vehicle.group).min.y,
        hand: new THREE.Vector3(...vehicle.riderSpec.hand).add(base),
        foot: new THREE.Vector3(...vehicle.riderSpec.foot).add(base)
    };
}

function triangles(object) {
    let count = 0;
    object.traverse(o => {
        if (o.isMesh) count += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
    });
    return count;
}

const named = (object, name) => {
    const found = [];
    object.traverse(o => { if (o.name === name) found.push(o); });
    return found;
};

describe('the bike and rider files', () => {
    const game = load();
    const files = [game.BikeModels.RIDER, game.BikeModels.CREW, ...Object.values(game.BikeModels.BIKES)];

    test('each file and all of them together fit the download budget', () => {
        const sizes = files.map(file => statSync(new URL(file, root)).size);
        sizes.forEach(size => expect(size).toBeLessThanOrEqual(BUDGET.file));
        expect(sizes.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(BUDGET.total);
    });

    test('the reader takes their byte normals, vertex colours, pivots and marks', async () => {
        for (const file of Object.values(game.BikeModels.BIKES)) {
            const model = await game.SceneAssets.loadModel(file);
            ['body', 'wheel_front', 'wheel_rear', 'disc_front', 'disc_rear', 'fork_left', 'fork_right', 'handlebar', 'brake_light'].forEach(name => {
                expect(model.meshes.has(name)).toBe(true);
            });
            expect(model.places.get('wheel_front').toArray()).toEqual([0, expect.closeTo(0.3, 5), expect.closeTo(0.7, 5)]);
            expect(model.places.get('wheel_rear').toArray()).toEqual([0, expect.closeTo(0.3, 5), expect.closeTo(-0.7, 5)]);
            expect(model.places.has('grip')).toBe(true);
            expect(model.places.has('peg')).toBe(true);
            for (const primitives of model.meshes.values()) {
                for (const { geometry, material } of primitives) {
                    const normal = geometry.attributes.normal;
                    expect(normal.array).toBeInstanceOf(Int8Array);
                    expect(normal.normalized).toBe(true);
                    // A unit normal, as a signed byte reads back
                    const length = Math.hypot(normal.getX(0), normal.getY(0), normal.getZ(0));
                    expect(length).toBeGreaterThan(0.97);
                    expect(length).toBeLessThan(1.03);
                    expect(geometry.attributes.color.array).toBeInstanceOf(Uint8Array);
                    expect(material.vertexColors).toBe(true);
                    expect(material.name).toBeTruthy();
                }
            }
        }
    });

    test('each bike and the seated rider are within their triangle budgets', async () => {
        await game.BikeModels.preload();
        for (const id of IDS) {
            const vehicle = ride(game, id);
            expect(vehicle.modelled).toBe(true);
            const rider = triangles(vehicle.rider);
            expect(rider).toBeLessThanOrEqual(BUDGET.rider);
            expect(triangles(vehicle.group) - rider).toBeLessThanOrEqual(BUDGET.bike);
        }
    });
});

describe.each(IDS)('swapping the model of %s', id => {
    const game = load({ held: true });
    const vehicle = ride(game, id);
    const procedural = measure(game, vehicle);
    const before = { children: vehicle.group.children.length, frame: vehicle.frame, rider: vehicle.rider };
    let notified = 0;
    vehicle.onModel = () => { notified++; };
    let modelled;

    beforeAll(async () => {
        game.release();
        await game.BikeModels.preload();
        await new Promise(done => setTimeout(done, 0));
        modelled = measure(game, vehicle);
    });

    test('the procedural bike stands until the files are in, then the model takes its place', () => {
        expect(before.children).toBeGreaterThan(40);
        expect(vehicle.modelled).toBe(true);
        expect(notified).toBe(1);
        expect(vehicle.frame).not.toBe(before.frame);
        expect(vehicle.rider).not.toBe(before.rider);
        expect(before.rider.parent).toBeNull();
        expect(vehicle.rider.parent).toBe(vehicle.group);
        expect(vehicle.group.children.length).toBeLessThan(16);
        expect(game.log).toEqual([]);
    });

    test('every named part is there, on the pivot the procedural one had', () => {
        Object.entries(procedural.pivots).forEach(([name, at]) => {
            expect(vehicle[name]).toBeTruthy();
            expect(vehicle[name].parent).toBe(vehicle.group);
            modelled.pivots[name].forEach((value, axis) => expect(value).toBeCloseTo(at[axis], 4));
        });
        ['frame', 'fuelTank', 'helmet', 'visor', 'leftArm', 'rightArm', 'leftForearm', 'rightForearm', 'leftLeg', 'rightLeg'].forEach(name => {
            expect(vehicle[name]).toBeTruthy();
        });
        // Rigid segments parented to the rider, not a skinned mesh
        ['torso', 'head', 'upper_arm', 'forearm', 'thigh', 'shin', 'glove', 'boot'].forEach(name => {
            const parts = named(vehicle.rider, name);
            expect(parts.length).toBe(name === 'torso' || name === 'head' ? 1 : 2);
            parts.forEach(part => expect(part.parent).toBe(vehicle.rider));
        });
        vehicle.group.traverse(o => expect(o.isSkinnedMesh).toBeFalsy());
    });

    test('its wheels, its outline and its stance match the procedural bike', () => {
        expect(modelled.rearTyre).toBeCloseTo(procedural.rearTyre, 1);
        expect(modelled.frontTyre).toBeCloseTo(procedural.frontTyre, 1);
        expect(Math.abs(modelled.rearTyre - procedural.rearTyre)).toBeLessThan(0.025);
        expect(Math.abs(modelled.frontTyre - procedural.frontTyre)).toBeLessThan(0.025);
        // Tyres on the ground the physics puts the bike on
        expect(Math.abs(modelled.lowest)).toBeLessThan(0.03);
        const span = box => box.getSize(new game.THREE.Vector3());
        const was = span(procedural.outline);
        const now = span(modelled.outline);
        expect(Math.abs(now.z - was.z)).toBeLessThan(0.3);
        expect(Math.abs(now.y - was.y)).toBeLessThan(0.2);
        expect(Math.abs(now.x - was.x)).toBeLessThan(0.2);
        expect(vehicle.wheelbase).toBe(1.4);
    });

    test('the rider sits where it sat, hands on the grips and feet on the pegs', () => {
        expect(vehicle.rider.position.toArray()).toEqual(vehicle.riderBasePos.toArray());
        const world = part => part.getWorldPosition(new game.THREE.Vector3());
        const gloves = named(vehicle.rider, 'glove').map(world);
        const boots = named(vehicle.rider, 'boot').map(world);
        [-1, 1].forEach((side, n) => {
            const hand = procedural.hand.clone().setX(side * procedural.hand.x);
            const foot = procedural.foot.clone().setX(side * procedural.foot.x);
            expect(gloves[n].distanceTo(hand)).toBeLessThan(0.04);
            expect(boots[n].distanceTo(foot)).toBeLessThan(0.09);
        });
        // Limbs keep their modelled length to within a stretch that does not show
        ['upper_arm', 'forearm', 'thigh', 'shin'].forEach(name => {
            named(vehicle.rider, name).forEach(part => {
                expect(part.scale.y).toBeGreaterThan(0.85);
                expect(part.scale.y).toBeLessThan(1.25);
            });
        });
    });

    test('it wears the character\'s paint and the rider\'s colours', () => {
        const paint = parseInt(character(game, id).bikeColor);
        expect(vehicle.frame.material).toBe(vehicle.palette.paint);
        expect(vehicle.fuelTank.material).toBe(vehicle.palette.paint);
        expect(vehicle.frame.material.color.getHex()).toBe(paint);
        const colours = new Map();
        vehicle.rider.traverse(o => { if (o.isMesh) colours.set(o.material.color.getHex(), true); });
        expect(colours.has(vehicle.riderSpec.suitColor)).toBe(true);
        expect(colours.has(vehicle.riderSpec.helmetColor)).toBe(true);
        expect(vehicle.visor.material.color.getHex()).toBe(0x0e1218);
        // Every drawn part carries its baked occlusion
        vehicle.group.traverse(o => {
            if (!o.isMesh) return;
            expect(o.geometry.attributes.color).toBeTruthy();
            expect(o.material.vertexColors).toBe(true);
        });
    });

    test('updateMesh still drives the wheels, the rider, the brake light and the tints', () => {
        vehicle.speed = 30;
        vehicle.currentDeltaTime = 1 / 60;
        vehicle.currentBrakeInput = 1;
        vehicle.leanAngle = 0.4;
        vehicle.steeringAngle = 0.2;
        vehicle.updateMesh();
        expect(vehicle.rearWheel.rotation.x).toBeGreaterThan(0);
        expect(vehicle.frontWheel.rotation.x).toBe(vehicle.rearWheel.rotation.x);
        expect(vehicle.frontDisc.rotation.x).toBe(vehicle.rearWheel.rotation.x);
        expect(vehicle.frontWheel.rotation.y).toBeCloseTo(0.1, 6);
        expect(vehicle.rider.rotation.z).toBeCloseTo(0.08, 6);
        expect(vehicle.brakeLight.material.emissive.getHex()).toBe(0xff0000);
        expect(vehicle.brakeLight.material.emissiveIntensity).toBe(1);
        expect(vehicle.brakeLight.material).not.toBe(vehicle.palette.paint);

        vehicle.currentBrakeInput = 0;
        vehicle.isJumping = true;
        for (let i = 0; i < 120; i++) vehicle.updateMesh();
        expect(vehicle.rider.position.y).toBeCloseTo(vehicle.riderBasePos.y + vehicle.riderStandHeight, 2);
        expect(vehicle.brakeLight.material.emissiveIntensity).toBe(0);
        vehicle.isJumping = false;

        // The crash tint Vehicle writes to this.frame reaches the painted bodywork
        vehicle.frame.material.color.setHex(0xff0000);
        const painted = [];
        vehicle.group.traverse(o => { if (o.isMesh && o.material === vehicle.palette.paint) painted.push(o); });
        expect(painted.length).toBeGreaterThan(0);
        painted.forEach(o => expect(o.material.color.getHex()).toBe(0xff0000));
        vehicle.reset();
        expect(vehicle.frame.material.color.getHex()).toBe(parseInt(character(game, id).bikeColor));
        // The rider eases back onto the seat
        for (let i = 0; i < 240; i++) vehicle.updateMesh();
        expect(vehicle.rider.position.y).toBeCloseTo(vehicle.riderBasePos.y, 2);
    });
});

describe('when the files are already in', () => {
    const game = load();

    beforeAll(() => game.BikeModels.preload());

    test('a new vehicle is modelled as it is built', () => {
        const vehicle = ride(game, 'steve');
        expect(vehicle.modelled).toBe(true);
        expect(game.BikeModels.dress(ride(game, 'tim'))).toBe(true);
    });

    test('two bikes of one kind share geometry and keep their own paint', () => {
        const a = ride(game, 'alex');
        const b = ride(game, 'alex');
        expect(a.frame.geometry).toBe(b.frame.geometry);
        expect(a.frame.material).not.toBe(b.frame.material);
        a.frame.material.color.setHex(0x123456);
        expect(b.frame.material.color.getHex()).toBe(parseInt(character(game, 'alex').bikeColor));
    });
});

describe('a bike that is being ridden when its files arrive', () => {
    const game = load({ held: true });
    const vehicle = ride(game, 'shane');

    test('keeps its procedural model until the next reset', async () => {
        // update() has run: the player is looking at this bike
        vehicle.prevRenderPos = vehicle.position.clone();
        const frame = vehicle.frame;
        game.release();
        await game.BikeModels.preload();
        await new Promise(done => setTimeout(done, 0));
        expect(vehicle.modelled).toBeFalsy();
        expect(vehicle.frame).toBe(frame);
        expect(typeof vehicle.modelWaiting).toBe('function');
        vehicle.reset();
        expect(vehicle.modelled).toBe(true);
        expect(vehicle.modelWaiting).toBeNull();
    });
});

describe.each([
    ['its own file', 'sport.glb'],
    ['the rider\'s file', 'rider.glb']
])('a bike without %s', (label, missing) => {
    const game = load({ failing: [missing] });
    const vehicle = ride(game, 'steve');
    const procedural = measure(game, vehicle);
    const parts = vehicle.group.children.slice();

    test('keeps its procedural model, whole and working', async () => {
        await game.BikeModels.preload();
        expect(await game.BikeModels.dress(vehicle)).toBe(false);
        expect(vehicle.modelled).toBeFalsy();
        expect(vehicle.group.children).toEqual(parts);
        expect(measure(game, vehicle).pivots).toEqual(procedural.pivots);
        expect(game.log.some(line => line.includes(missing) && line.includes('procedural'))).toBe(true);
        vehicle.speed = 30;
        vehicle.currentBrakeInput = 1;
        vehicle.updateMesh();
        expect(vehicle.brakeLight.material.emissiveIntensity).toBe(1);
    });
});

describe('a bike file that lacks a part', () => {
    const game = load();

    test('is refused before anything of the procedural bike is removed', async () => {
        await game.BikeModels.preload();
        const model = await game.SceneAssets.loadModel(game.BikeModels.BIKES.steve);
        const fork = model.meshes.get('fork_right');
        model.meshes.delete('fork_right');
        const vehicle = ride(game, 'steve');
        model.meshes.set('fork_right', fork);
        expect(vehicle.modelled).toBeFalsy();
        expect(vehicle.group.children.length).toBeGreaterThan(40);
        expect(vehicle.rider.parent).toBe(vehicle.group);
        expect(game.log.some(line => line.includes('fork_right'))).toBe(true);
    });
});

describe('a touring-crew rider', () => {
    const game = load();
    const options = { color: 0x0000ff, style: 'sport', riderName: 'Guy', helmetColor: 0xffffff, suitColor: 0x4a4a4a };
    const crew = () => new game.AIMotorcycle(new game.THREE.Scene(), null, options);

    beforeAll(() => game.BikeModels.preload());

    test('rides the low-detail bike in its own colours, on geometry the crew shares', () => {
        const a = crew();
        const b = new game.AIMotorcycle(new game.THREE.Scene(), null, { ...options, color: 0x00ff00 });
        expect(a.modelled).toBe(true);
        expect(a.frame.material.color.getHex()).toBe(0x0000ff);
        expect(b.frame.material.color.getHex()).toBe(0x00ff00);
        expect(a.frame.geometry).toBe(b.frame.geometry);
        expect(a.frame.material).not.toBe(b.frame.material);
        expect(triangles(a.bikeGroup) - triangles(a.rider)).toBeLessThanOrEqual(BUDGET.crew);
        const kit = new Set();
        a.rider.traverse(o => { if (o.isMesh) kit.add(o.material.color.getHex()); });
        expect(kit.has(0x4a4a4a)).toBe(true);
        expect(kit.has(0xffffff)).toBe(true);
        // A fraction of the player's bike, and of its draw calls
        const player = ride(game, 'steve');
        expect(triangles(a.bikeGroup)).toBeLessThan(triangles(player.group) * 0.45);
        let meshes = 0;
        a.bikeGroup.traverse(o => { if (o.isMesh) meshes++; });
        expect(meshes).toBeLessThan(60);
    });

    test('keeps the parts AIMotorcycle drives', () => {
        const bike = crew();
        [bike.rearWheel, bike.frontWheel, bike.brakeLight, bike.frame, bike.rider].forEach(part => {
            let top = part;
            while (top.parent) top = top.parent;
            expect(top).toBe(bike.bikeGroup.parent);
        });
        bike.brakeLight.material.emissive.setHex(0xff0000);
        expect(bike.frame.material.emissive.getHex()).toBe(0x000000);
        bike.onCollision();
        expect(bike.frame.material.color.getHex()).toBe(0xff0000);
        bike.remove();
    });

    test('keeps the procedural bike when the files fail', async () => {
        const broken = load({ failing: ['crew.glb'] });
        await broken.BikeModels.preload();
        const bike = new broken.AIMotorcycle(new broken.THREE.Scene(), null, options);
        const parts = bike.bikeGroup.children.slice();
        expect(await broken.BikeModels.crew(bike)).toBe(false);
        expect(bike.modelled).toBeFalsy();
        expect(bike.bikeGroup.children).toEqual(parts);
        expect(broken.log.some(line => line.includes('crew.glb'))).toBe(true);
    });
});
