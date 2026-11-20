// The Blender-made bikes and rider (js/bikemodels.js, assets/bikes, built by
// tools/blender): the committed files fit their budgets, and swapping a
// vehicle's procedural model for the modelled one keeps every named part on
// its pivot, the bike's dimensions, the character's colours and the parts
// Vehicle.updateMesh animates. A file that fails leaves the procedural bike.
// The detailed bikes (assets/bikes/detail) sit on their own axles, keep their
// own colours, seat the rider from their own marks and load only when shown.
// Real modules on real three r150; fetch reads the files from disk.
import { readFileSync, statSync } from 'node:fs';
import { Blob } from 'node:buffer';
import { TextDecoder } from 'node:util';
import { canvasStub, loadScript, realThree } from '../helpers/load-game.js';

const root = new URL('../../', import.meta.url);
// A bike file's size and each level's triangles; the shared rider and crew
// files have budgets of their own (the rider file holds every cut of every
// outfit, and a seated rider is one of each). The menu fetches no bike until one is
// shown, then the rider and that one bike.
const BUDGET = { file: 1.2 * 1024 * 1024, near: 40000, far: 10000, rider: 7000, crew: 2600, shared: 700 * 1024, menu: 1.5 * 1024 * 1024 };
// The procedural kinds, each ridden as the character who rode it, in that
// character's old paint
const KINDS = { steve: ['sport', '0xcc1111'], alex: ['adventure', '0xc9a227'], tim: ['scooter', '0x8d96a8'], shane: ['dirt', '0xff6600'], lucy: ['naked', '0x16181c'] };
const IDS = Object.keys(KINDS);
const KIND_IDS = Object.values(KINDS).map(([kind]) => kind);
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
        `${source}\nreturn { Vehicle, CHARACTERS, SceneAssets, BikeModels, AIMotorcycle, BIKE_MODELS };`
    );
    const fetched = [];
    const game = factory(THREE, canvasStub(), { getItem: () => null, setItem() {} }, sink, async url => { fetched.push(url); return fetch(url); }, Blob, TextDecoder, performance);
    return { THREE, log, release, fetched, ...game };
}

// The character `id` on the procedural kind they used to ride, in its old paint
const character = (game, id) => {
    const c = game.CHARACTERS.find(c => c.id === id);
    return KINDS[id] ? { ...c, bikes: [KINDS[id][0]], bikeColor: KINDS[id][1] } : c;
};

function ride(game, id) {
    const scene = new game.THREE.Scene();
    const vehicle = new game.Vehicle(scene, null, character(game, id));
    return vehicle;
}

// The character who owns a detailed bike, on it
function rideBike(game, bike, options) {
    const owner = game.CHARACTERS.find(c => c.bikes.includes(bike));
    return new game.Vehicle(new game.THREE.Scene(), null, owner, bike, options);
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

// The triangles drawn of `object`, at level `level` of each THREE.LOD in it
function triangles(object, level = 0) {
    let count = 0;
    const visit = o => {
        if (o.isMesh) count += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
        (o.isLOD ? [o.levels[Math.min(level, o.levels.length - 1)].object] : o.children).forEach(visit);
    };
    visit(object);
    return count;
}

function levelTriangles(level) {
    let count = 0;
    for (const primitives of level.meshes.values()) for (const { geometry } of primitives) count += (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
    return count;
}

const named = (object, name) => {
    const found = [];
    object.traverse(o => { if (o.name === name) found.push(o); });
    return found;
};

describe('the bike and rider files', () => {
    const game = load();
    const shared = [game.BikeModels.RIDER, game.BikeModels.CREW];
    const bikes = [...Object.values(game.BikeModels.MODELS), ...Object.values(game.BIKE_MODELS).map(bike => bike.file)];
    const size = file => statSync(new URL(file, root)).size;
    const sum = list => list.reduce((a, b) => a + b, 0);

    test('each bike file and the shared files fit the download budget', () => {
        bikes.forEach(file => expect(size(file)).toBeLessThanOrEqual(BUDGET.file));
        expect(sum(shared.map(size))).toBeLessThanOrEqual(BUDGET.shared);
    });

    test('each detailed bike has a near and a far level of the same parts, within their triangle budgets', async () => {
        for (const bike of Object.values(game.BIKE_MODELS)) {
            const model = await game.SceneAssets.loadModel(bike.file);
            const near = model.groups.get('lod0');
            const far = model.groups.get('lod1');
            expect(near).toBeTruthy();
            expect(far).toBeTruthy();
            expect([...far.meshes.keys()].sort()).toEqual([...near.meshes.keys()].sort());
            ['grip', 'peg'].forEach(mark => expect(near.places.has(mark)).toBe(true));
            expect(near.places.has('seat') || Array.isArray(bike.seat)).toBe(true);
            expect(levelTriangles(near)).toBeLessThanOrEqual(BUDGET.near);
            expect(levelTriangles(far)).toBeLessThanOrEqual(BUDGET.far);
        }
    });

    test('the reader takes each named group whatever order the file lists them in', async () => {
        // The Tiger lists lod0 first, the rest lod1 first
        for (const file of [game.BIKE_MODELS.bike10_tiger900.file, game.BIKE_MODELS.bike01_z650.file]) {
            const model = await game.SceneAssets.loadModel(file);
            const json = JSON.parse(new TextDecoder().decode(readFileSync(new URL(file, root)).subarray(20, 20 + readFileSync(new URL(file, root)).readUInt32LE(12))));
            const children = name => json.nodes.find(n => n.name === name).children.map(i => json.nodes[i]);
            for (const name of ['lod0', 'lod1']) {
                const body = children(name).find(n => n.name === 'body');
                const [geometry] = model.groups.get(name).meshes.get('body');
                expect(geometry.geometry.attributes.position.count).toBe(json.accessors[json.meshes[body.mesh].primitives[0].attributes.POSITION].count);
            }
        }
    });

    test('the reader takes their byte normals, vertex colours, pivots and marks', async () => {
        for (const file of Object.values(game.BikeModels.MODELS)) {
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

    test('each procedural kind and the seated rider are within their triangle budgets', async () => {
        await game.BikeModels.preload(Object.keys(game.BikeModels.MODELS));
        for (const id of IDS) {
            const vehicle = ride(game, id);
            expect(vehicle.modelled).toBe(true);
            const rider = triangles(vehicle.rider);
            expect(rider).toBeLessThanOrEqual(BUDGET.rider);
            expect(triangles(vehicle.group) - rider).toBeLessThanOrEqual(BUDGET.near);
        }
    });
});

describe('the menu', () => {
    test('fetches no bike until one is shown, then only the rider and that bike', async () => {
        const game = load();
        // The rider select's stage: every rider's bike, procedural until shown
        const stage = game.CHARACTERS.map(c => new game.Vehicle(new game.THREE.Scene(), null, c, null, { model: false }));
        await new Promise(done => setTimeout(done, 0));
        expect(game.fetched).toEqual([]);
        expect(stage.every(v => !v.modelled && v.group.children.length > 40)).toBe(true);

        // Focusing Tim shows his bike: the procedural stand-in until it is in
        const tim = stage.find(v => v.character.id === 'tim');
        expect(await game.BikeModels.dress(tim)).toBe(true);
        expect(tim.modelled).toBe(true);
        expect([...new Set(game.fetched)].sort()).toEqual([game.BikeModels.RIDER, game.BIKE_MODELS.bike14_forza.file].sort());
        const bytes = [...new Set(game.fetched)].reduce((total, file) => total + statSync(new URL(file, root)).size, 0);
        expect(bytes).toBeLessThanOrEqual(BUDGET.menu);
        expect(stage.filter(v => v.modelled)).toEqual([tim]);
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
        await game.BikeModels.preload(KIND_IDS);
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
        // Dark, unless the outfit has a tinted visor
        expect(vehicle.visor.material.color.getHex()).toBe(vehicle.riderSpec.visorColor ?? 0x0e1218);
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
        // The front end is turned by the drawn bar (Vehicle.shownBar: at this speed and lean, a little into the
        // turn) about the steering axis, the wheel and its disc spun about their own axle inside it
        const { THREE } = game;
        expect(vehicle.barState.shown).toBeLessThan(0);
        const turned = new THREE.Quaternion().setFromAxisAngle(vehicle.steerRig.axis, vehicle.barState.shown)
            .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), vehicle.rearWheel.rotation.x));
        for (const node of ['frontWheel', 'frontDisc']) expect(Math.abs(vehicle[node].quaternion.dot(turned))).toBeCloseTo(1, 9);
        // The rider's own lean into the turn, as that rider does it (tests/unit/rider-lean.test.js)
        expect(vehicle.rider.rotation.z).toBeCloseTo(game.Vehicle.riderLean(0.4, vehicle.character.bodyLean).roll, 12);
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

describe.each(Object.keys(load().BIKE_MODELS))('the detailed bike %s', id => {
    const game = load();
    let vehicle, file, near;

    beforeAll(async () => {
        await game.BikeModels.preload([id]);
        vehicle = rideBike(game, id);
        vehicle.group.position.set(0, 0, 0);
        vehicle.group.rotation.set(0, 0, 0);
        vehicle.group.updateMatrixWorld(true);
        file = await game.SceneAssets.loadModel(game.BIKE_MODELS[id].file);
        near = file.groups.get('lod0');
    });

    const box = object => new game.THREE.Box3().setFromObject(object);
    const world = object => object.getWorldPosition(new game.THREE.Vector3());

    test('is modelled, with no error, its parts in a near and a far level', () => {
        expect(vehicle.modelled).toBe(true);
        expect(vehicle.model).toBe(id);
        expect(game.log).toEqual([]);
        for (const name of ['rearWheel', 'frontWheel', 'rearDisc', 'frontDisc', 'leftFork', 'rightFork', 'handlebar']) {
            expect(vehicle[name].isLOD).toBe(true);
            expect(vehicle[name].levels.map(level => level.distance)).toEqual([0, game.BikeModels.FAR]);
            expect(vehicle[name].parent).toBe(vehicle.group);
        }
        expect(triangles(vehicle.group, 0) - triangles(vehicle.rider)).toBeLessThanOrEqual(BUDGET.near);
        expect(triangles(vehicle.group, 1) - triangles(vehicle.rider)).toBeLessThanOrEqual(BUDGET.far);
    });

    test('turns its wheels on its own axles, each pivot in the middle of its tyre, the tyres on the ground', () => {
        for (const [end, node] of [['rear', 'rearWheel'], ['front', 'frontWheel']]) {
            const [y, z, radius] = vehicle.axles[end];
            expect(vehicle[node].position.toArray()).toEqual([expect.closeTo(0, 6), expect.closeTo(y, 6), expect.closeTo(z, 6)]);
            const tyre = box(vehicle[node].levels[0].object);
            expect((tyre.min.y + tyre.max.y) / 2).toBeCloseTo(y, 3);
            expect((tyre.min.z + tyre.max.z) / 2).toBeCloseTo(z, 3);
            expect(tyre.min.y).toBeCloseTo(0, 2);
            expect(radius).toBeCloseTo(y, 2);
            expect(radius).toBeGreaterThan(0.25);
            expect(radius).toBeLessThan(0.36);
            expect(Math.abs(z)).toBeGreaterThan(0.65);
        }
        // Nothing of the bike under the ground
        expect(box(vehicle.group).min.y).toBeGreaterThan(-0.005);
        // Each disc turns about its wheel's axle
        expect(vehicle.rearDisc.position.y).toBeCloseTo(vehicle.axles.rear[0], 3);
        expect(vehicle.rearDisc.position.z).toBeCloseTo(vehicle.axles.rear[1], 3);
        expect(vehicle.frontDisc.position.y).toBeCloseTo(vehicle.axles.front[0], 3);
        expect(vehicle.frontDisc.position.z).toBeCloseTo(vehicle.axles.front[1], 3);
    });

    test('spins each wheel by its own radius and wheelies about its own rear axle', () => {
        vehicle.wheelRotation = 0;
        vehicle.speed = 30;
        vehicle.currentDeltaTime = 1 / 60;
        vehicle.updateMesh();
        const [, , rear] = vehicle.axles.rear;
        const [, , front] = vehicle.axles.front;
        expect(vehicle.rearWheel.rotation.x).toBeCloseTo(30 / 60 / rear, 6);
        expect(vehicle.frontWheel.rotation.x).toBeCloseTo(30 / 60 / front, 6);
        expect(vehicle.frontDisc.rotation.x).toBe(vehicle.frontWheel.rotation.x);

        vehicle.isWheelie = true;
        vehicle.wheelieAngle = 0.5;
        vehicle.yawAngle = 0;
        vehicle.position.set(0, 0, 0);
        vehicle.updateMesh();
        vehicle.group.updateMatrixWorld(true);
        const axle = vehicle.rearWheel.getWorldPosition(new game.THREE.Vector3());
        expect(axle.y).toBeCloseTo(vehicle.axles.rear[0], 3);
        expect(axle.z).toBeCloseTo(vehicle.axles.rear[1], 3);
        vehicle.isWheelie = false;
        vehicle.wheelieAngle = 0;
        vehicle.speed = 0;
        vehicle.updateMesh();
        vehicle.group.position.set(0, 0, 0);
        vehicle.group.rotation.set(0, 0, 0);
        vehicle.group.updateMatrixWorld(true);
    });

    test('seats the rider from its own marks: hands on the grips, feet on the pegs, hips on the seat', () => {
        const grip = near.places.get('grip');
        const peg = near.places.get('peg');
        const seat = near.places.get('seat');
        const top = seat ? seat.y : game.BIKE_MODELS[id].seat[0];
        const gloves = named(vehicle.rider, 'glove').map(world);
        const boots = named(vehicle.rider, 'boot').map(world);
        expect(gloves.length).toBe(2);
        gloves.forEach(glove => {
            expect(Math.abs(Math.abs(glove.x) - Math.abs(grip.x))).toBeLessThan(0.01);
            expect(glove.y).toBeCloseTo(grip.y, 2);
            expect(glove.z).toBeCloseTo(grip.z, 2);
        });
        boots.forEach(boot => {
            expect(Math.abs(Math.abs(boot.x) - Math.abs(peg.x))).toBeLessThan(0.01);
            expect(boot.y - peg.y).toBeGreaterThan(0.02);
            expect(boot.y - peg.y).toBeLessThan(0.08);
        });
        // The hip (where the thighs start, 0.17 down the torso from its
        // centre) rests on the seat's top, over the seat
        const spec = vehicle.riderSpec;
        const hip = vehicle.rider.position.clone().add(new game.THREE.Vector3(0, -Math.cos(spec.torsoLean), -Math.sin(spec.torsoLean)).multiplyScalar(0.17));
        expect(hip.y - top).toBeGreaterThan(0.05);
        expect(hip.y - top).toBeLessThan(0.2);
        expect(Math.abs(hip.z - (seat ? seat.z : game.BIKE_MODELS[id].seat[1]))).toBeLessThan(0.05);
        named(vehicle.rider, 'thigh').forEach(part => {
            // A limb runs along its +y from its first joint to its second
            const end = part.position.clone().add(vehicle.rider.position).sub(new game.THREE.Vector3(0, part.scale.y * game.BikeModels.LENGTHS.thigh / 2, 0).applyQuaternion(part.quaternion));
            expect(end.distanceTo(hip.clone().setX(end.x))).toBeLessThan(0.02);
        });
        expect(vehicle.rider.position.toArray()).toEqual(vehicle.riderBasePos.toArray());
        ['upper_arm', 'forearm', 'thigh', 'shin'].forEach(name => {
            named(vehicle.rider, name).forEach(part => {
                expect(part.scale.y).toBeGreaterThan(0.8);
                expect(part.scale.y).toBeLessThan(1.3);
            });
        });
    });

    test('keeps its file\'s colours, its paint taking the crash tint and coming back on a reset', () => {
        const paint = game.BIKE_MODELS[id].paint;
        expect(vehicle.frame.material.name).toBe('paint');
        expect(vehicle.frame.material.color.getHex()).toBe(paint);
        expect(parseInt(vehicle.bikeColor)).toBe(paint);
        const source = new Map();
        for (const primitives of near.meshes.values()) for (const { material } of primitives) source.set(material.name, material.color.getHex());
        const drawn = [vehicle.rearWheel, vehicle.frontWheel, vehicle.handlebar, vehicle.leftFork];
        drawn.forEach(part => part.traverse(o => {
            if (o.isMesh) expect(o.material.color.getHex()).toBe(source.get(o.material.name));
        }));
        vehicle.frame.material.color.setHex(0xff0000);
        vehicle.reset();
        expect(vehicle.frame.material.color.getHex()).toBe(paint);
        // Two of one bike share geometry and keep their own paint
        const other = rideBike(game, id);
        expect(other.frame.geometry).toBe(vehicle.frame.geometry);
        expect(other.frame.material).not.toBe(vehicle.frame.material);
    });

    // A bag, a scarf or a backpack never passes through a body: for every rider who rides this bike, seated, riding,
    // leaning and standing on the pegs, no edge of the rider (body, backpack or scarf) crosses a face of the shown luggage or the other way,
    // and no vertex of either lies within 4 cm of the other
    test('its luggage stays clear of every rider who rides it', () => {
        const { THREE } = game;
        if (!vehicle.luggage || !vehicle.luggage.visible) return;
        const hits = [];
        for (const owner of game.CHARACTERS.filter(c => c.bikes.includes(id))) {
            for (const pose of ['seated', 'riding', 'leaning', 'standing']) {
            const ridden = new game.Vehicle(new THREE.Scene(), null, owner, id);
            ridden.currentDeltaTime = 1 / 60;
            if (pose !== 'seated') {
                ridden.speed = 20;
                for (let i = 0; i < 120; i++) {
                    if (pose === 'leaning') ridden.leanAngle = 0.7;
                    // Up on the pegs over a crest (Vehicle.updateMesh's stand-up)
                    if (pose === 'standing') ridden.isJumping = true;
                    ridden.updateMesh();
                }
            }
            ridden.group.position.set(0, 0, 0);
            ridden.group.rotation.set(0, 0, 0);
            ridden.group.updateMatrixWorld(true);
            const bags = [];
            ridden.luggage.traverse(o => { if (o.isMesh && (!o.parent.isLOD || o.parent.levels[0].object === o)) bags.push(o); });
            const sides = bags.map(o => [o, o.material.side]);
            bags.forEach(o => { o.material.side = THREE.DoubleSide; });
            const ray = new THREE.Raycaster();
            const a = new THREE.Vector3(), b = new THREE.Vector3(), dir = new THREE.Vector3();
            const crossing = {};
            const body = [];
            ridden.rider.traverse(o => { if (o.isMesh && (!o.parent.isLOD || o.parent.levels[0].object === o)) body.push(o); });
            const bodySides = body.map(o => [o, o.material.side]);
            body.forEach(o => { o.material.side = THREE.DoubleSide; });
            // Each way: an edge of the rider through a face of the luggage, and an edge of the luggage through the rider
            const edges = (meshes, targets, label) => meshes.forEach(o => {
                const pos = o.geometry.attributes.position, index = o.geometry.index;
                const tri = index ? index.count / 3 : pos.count / 3;
                const at = (t, k) => (index ? index.getX(t * 3 + k) : t * 3 + k);
                for (let t = 0; t < tri; t++) {
                    for (let k = 0; k < 3; k++) {
                        a.fromBufferAttribute(pos, at(t, k)).applyMatrix4(o.matrixWorld);
                        b.fromBufferAttribute(pos, at(t, (k + 1) % 3)).applyMatrix4(o.matrixWorld);
                        const len = a.distanceTo(b);
                        if (len < 1e-6) continue;
                        ray.set(a, dir.subVectors(b, a).normalize());
                        ray.far = len;
                        const hit = ray.intersectObjects(targets, false)[0];
                        if (hit) {
                            const part = label(o, hit.object);
                            crossing[part] = (crossing[part] || 0) + 1;
                        }
                    }
                }
            });
            const name = o => o.name || o.parent.name || o.material.name;
            edges(body, bags, (o, t) => `${name(o)} through ${name(t)}`);
            edges(bags, body, (o, t) => `${name(o)} through ${name(t)}`);
            // And a gap: no vertex of either within CLEAR_M of the other's faces (a bag pressed into a thigh reads as through it)
            const CLEAR_M = 0.04;
            const faces = meshes => {
                const out = [];
                meshes.forEach(o => {
                    const pos = o.geometry.attributes.position, index = o.geometry.index;
                    const n = index ? index.count : pos.count;
                    for (let t = 0; t < n; t += 3) {
                        const v = [0, 1, 2].map(k => new THREE.Vector3().fromBufferAttribute(pos, index ? index.getX(t + k) : t + k).applyMatrix4(o.matrixWorld));
                        out.push({ o, tri: new THREE.Triangle(...v), box: new THREE.Box3().setFromPoints(v).expandByScalar(CLEAR_M) });
                    }
                });
                return out;
            };
            const near = (from, to) => {
                const list = faces(to), q = new THREE.Vector3();
                const all = new THREE.Box3();
                list.forEach(f => all.union(f.box));
                from.forEach(o => {
                    const pos = o.geometry.attributes.position;
                    for (let i = 0; i < pos.count; i++) {
                        const p = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
                        if (!all.containsPoint(p)) continue;
                        const f = list.find(f => f.box.containsPoint(p) && f.tri.closestPointToPoint(p, q).distanceTo(p) < CLEAR_M);
                        if (f) { const part = `${name(o)} within ${CLEAR_M} m of ${name(f.o)}`; crossing[part] = (crossing[part] || 0) + 1; }
                    }
                });
            };
            near(bags, body);
            near(body, bags);
            sides.forEach(([o, side]) => { o.material.side = side; });
            bodySides.forEach(([o, side]) => { o.material.side = side; });
            if (Object.keys(crossing).length) hits.push({ rider: owner.id, pose, crossing });
            }
        }
        expect(hits).toEqual([]);
    });

    test('shows its luggage only if its entry does', () => {
        const has = near.meshes.has('luggage');
        expect(!!vehicle.luggage).toBe(has);
        if (has) expect(vehicle.luggage.visible).toBe(!!game.BIKE_MODELS[id].luggage);
    });
});

// The first-person cameras (js/main.js: Helmet Cam's mount at the visor, Onboard's offset) see out of the rider, never
// the inside of the rider's own head: for every character on each bike they ride, with the meshes the camera is inside
// hidden (Vehicle.hideAround, as the game does before it draws), the camera is inside no part still drawn and a ray
// through the middle of the screen meets no part of the rider within 1 m
describe('the first-person cameras', () => {
    const game = load();
    const MOUNTS = { helmet: [0, 1.18, 0.3], onboard: [0, 1.2, 0.5] };
    beforeAll(() => game.BikeModels.preload([...KIND_IDS, ...Object.keys(game.BIKE_MODELS)]));

    test('see out of the rider, not the inside of the helmet', () => {
        const { THREE } = game;
        const bad = [];
        for (const c of game.CHARACTERS) {
            for (const bike of [...c.bikes, ...(KINDS[c.id] ? [KINDS[c.id][0]] : [])]) {
                const vehicle = new game.Vehicle(new THREE.Scene(), null, c, bike);
                // Riding, as the camera sees the rider: updateMesh poses the rider for speed
                vehicle.currentDeltaTime = 1 / 60;
                vehicle.speed = 20;
                for (let i = 0; i < 60; i++) vehicle.updateMesh();
                vehicle.group.position.set(0, 0, 0);
                vehicle.group.rotation.set(0, 0, 0);
                vehicle.group.updateMatrixWorld(true);
                for (const [mode, at] of Object.entries(MOUNTS)) {
                    const eye = new THREE.Vector3(...at);
                    game.Vehicle.hideAround(vehicle.rider, eye, 0.1);
                    const drawn = [];
                    vehicle.rider.traverse(o => { if (o.isMesh && o.layers.isEnabled(0) && (!o.parent.isLOD || o.parent.levels[0].object === o)) drawn.push(o); });
                    const inside = drawn.filter(o => {
                        const p = eye.clone().applyMatrix4(o.matrixWorld.clone().invert());
                        o.geometry.computeBoundingBox();
                        return o.geometry.boundingBox.containsPoint(p) && game.Vehicle.encloses(o, p, 0);
                    });
                    drawn.forEach(o => { o.material.side = THREE.DoubleSide; });
                    const ray = new THREE.Raycaster(eye, new THREE.Vector3(0, 0, 1), 0, 1);
                    const hits = ray.intersectObjects(drawn, false);
                    if (inside.length || hits.length) bad.push({ rider: c.id, bike, mode, inside: inside.map(o => o.name || o.material.name), hits: hits.map(h => `${h.object.name || h.object.material.name}@${h.distance.toFixed(2)}`) });
                    game.Vehicle.hideAround(vehicle.rider, null);
                }
            }
        }
        expect(bad).toEqual([]);
    });
});

describe('when the files are already in', () => {
    const game = load();

    beforeAll(() => game.BikeModels.preload(KIND_IDS));

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
        await game.BikeModels.preload(KIND_IDS);
        await new Promise(done => setTimeout(done, 0));
        expect(vehicle.modelled).toBeFalsy();
        expect(vehicle.frame).toBe(frame);
        expect(typeof vehicle.modelWaiting).toBe('function');
        vehicle.reset();
        expect(vehicle.modelled).toBe(true);
        expect(vehicle.modelWaiting).toBeNull();
    });
});

describe('a bike the rider select has blacked out before its files arrive', () => {
    const game = load({ held: true });
    const vehicle = ride(game, 'alex');

    test('still takes the model, and tells the rider select so it can black that out too', async () => {
        const flat = new game.THREE.MeshBasicMaterial({ color: 0x05070c });
        vehicle.group.traverse(o => { if (o.isMesh) o.material = flat; });
        let told = 0;
        vehicle.onModel = () => { told++; };
        game.release();
        await game.BikeModels.preload(KIND_IDS);
        await new Promise(done => setTimeout(done, 0));
        expect(game.log).toEqual([]);
        expect(vehicle.modelled).toBe(true);
        expect(told).toBe(1);
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
        await game.BikeModels.preload(KIND_IDS);
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
        await game.BikeModels.preload(KIND_IDS);
        const model = await game.SceneAssets.loadModel(game.BikeModels.MODELS.sport);
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

    beforeAll(() => game.BikeModels.preload(KIND_IDS));

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
        await broken.BikeModels.preload(KIND_IDS);
        const bike = new broken.AIMotorcycle(new broken.THREE.Scene(), null, options);
        const parts = bike.bikeGroup.children.slice();
        expect(await broken.BikeModels.crew(bike)).toBe(false);
        expect(bike.modelled).toBeFalsy();
        expect(bike.bikeGroup.children).toEqual(parts);
        expect(broken.log.some(line => line.includes('crew.glb'))).toBe(true);
    });
});
