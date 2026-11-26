// The Blender-made traffic cars (js/carmodels.js, assets/cars, built by
// tools/blender/car_*.py): the committed files fit their budgets, and swapping
// a car's procedural model for the modelled one keeps the wheels on their
// hubs, the car's footprint, its colours and the parts Car.update drives. It
// draws no random number, and a file that fails leaves the procedural car.
// Real modules on real three r150; fetch reads the files from disk.
import { readFileSync, statSync } from 'node:fs';
import { Blob } from 'node:buffer';
import { TextDecoder } from 'node:util';
import { jest } from '@jest/globals';
import { canvasStub, loadScript, realThree } from '../helpers/load-game.js';

const root = new URL('../../', import.meta.url);
const BUDGET = { car: 5000, file: 150 * 1024, total: 1024 * 1024 };
const HATCH = 0x8b0000;
const VAN = 0xf5f5f5;
const INDICATORS = ['leftFrontIndicator', 'rightFrontIndicator', 'leftRearIndicator', 'rightRearIndicator'];
// Car.checkCollision: a ball of this radius about the car's origin
const REACH = 2.2;

function load({ failing = [], held = false, models = true } = {}) {
    const THREE = realThree();
    const source = ['sceneassets.js', ...(models ? ['carmodels.js'] : []), 'world/route.js', 'world/legroute.js', 'traffic.js'].map(loadScript).join('\n;\n');
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
        `${source}\nreturn { SceneAssets, CarModels: typeof CarModels === 'undefined' ? null : CarModels, Car, Traffic, LegRoute };`
    );
    const game = factory(THREE, canvasStub(), { getItem: () => null, setItem() {} }, sink, fetch, Blob, TextDecoder, performance);
    return { THREE, log, release, ...game };
}

// A straight, level road for Car.update to drive along
function road(length = 40) {
    const roadPath = Array.from({ length }, (unused, i) => ({ x: 0, y: 0, z: i * 20, heading: 0 }));
    return { roadPath, startSegment: 0, endSegment: length - 20 };
}

function drive(game, color, environment = null) {
    if (environment && !environment.route) environment.route = new game.LegRoute(environment);
    return new game.Car(new game.THREE.Scene(), environment, { direction: -1, speed: 20, startSegment: 10, lane: 'right', color });
}

function measure(game, car) {
    const { THREE } = game;
    car.carGroup.position.set(0, 0, 0);
    car.carGroup.rotation.set(0, 0, 0);
    car.carGroup.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(car.carGroup);
    const tyre = new THREE.Box3().setFromObject(car.wheels[0]);
    return { box, size: box.getSize(new THREE.Vector3()), tyre: tyre.getSize(new THREE.Vector3()).y / 2, hubs: car.wheels.map(wheel => wheel.position.toArray()) };
}

function triangles(object) {
    let count = 0;
    object.traverse(o => {
        if (o.isMesh) count += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
    });
    return count;
}

const settle = () => new Promise(done => setTimeout(done, 0));

describe('the car files', () => {
    const game = load();
    const files = Object.values(game.CarModels.CARS);

    test('each file and all of them together fit the download budget', () => {
        const sizes = files.map(file => statSync(new URL(file, root)).size);
        sizes.forEach(size => expect(size).toBeLessThanOrEqual(BUDGET.file));
        expect(sizes.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(BUDGET.total);
    });

    test('the reader takes their byte normals, vertex colours and the wheel\'s hub', async () => {
        for (const file of files) {
            const model = await game.SceneAssets.loadModel(file);
            ['body', 'wheel', 'headlights', 'taillights', 'indicator_fl', 'indicator_fr', 'indicator_rl', 'indicator_rr'].forEach(name => {
                expect(model.meshes.has(name)).toBe(true);
            });
            expect(model.places.get('wheel').toArray()).toEqual([expect.closeTo(0.76, 5), expect.closeTo(game.CarModels.HUB, 5), expect.closeTo(1.35, 5)]);
            const names = new Set();
            for (const primitives of model.meshes.values()) {
                for (const { geometry, material } of primitives) {
                    names.add(material.name);
                    const normal = geometry.attributes.normal;
                    expect(normal.array).toBeInstanceOf(Int8Array);
                    expect(normal.normalized).toBe(true);
                    const length = Math.hypot(normal.getX(0), normal.getY(0), normal.getZ(0));
                    expect(length).toBeGreaterThan(0.97);
                    expect(length).toBeLessThan(1.03);
                    expect(geometry.attributes.color.array).toBeInstanceOf(Uint8Array);
                    expect(material.vertexColors).toBe(true);
                }
            }
            ['paint', 'glass', 'headlight', 'taillight', 'indicator', 'rubber'].forEach(name => expect(names.has(name)).toBe(true));
        }
    });

    test('a car as drawn, with its four wheels, is within the triangle budget', async () => {
        await game.CarModels.preload();
        for (const color of [HATCH, VAN]) {
            const car = drive(game, color);
            expect(car.modelled).toBe(true);
            expect(triangles(car.carGroup)).toBeLessThanOrEqual(BUDGET.car);
            let meshes = 0;
            car.carGroup.traverse(o => { if (o.isMesh) meshes++; });
            expect(meshes).toBeLessThan(40);
        }
    });
});

describe('which body a car gets', () => {
    const game = load();

    test('its colour decides, and the traffic\'s palette holds both kinds', () => {
        const traffic = Object.create(game.Traffic.prototype);
        const spy = jest.spyOn(Math, 'random');
        const kinds = {};
        for (let i = 0; i < 12; i++) {
            spy.mockReturnValueOnce((i + 0.5) / 12);
            const color = traffic.getRandomCarColor();
            kinds[game.CarModels.kind({ color })] = (kinds[game.CarModels.kind({ color })] || 0) + 1;
        }
        spy.mockRestore();
        expect(kinds).toEqual({ hatchback: 8, van: 4 });
        expect(game.CarModels.kind({ color: VAN })).toBe('van');
        expect(game.CarModels.kind({ color: HATCH })).toBe('hatchback');
    });

    test('building a car draws the same random numbers with the models as without', async () => {
        await game.CarModels.preload();
        const plain = load({ models: false });
        const count = (from, color) => {
            const spy = jest.spyOn(Math, 'random').mockReturnValue(0.5);
            drive(from, color);
            const calls = spy.mock.calls.length;
            spy.mockRestore();
            return calls;
        };
        // three draws an id for each object it makes; the swap's objects take theirs elsewhere
        for (const color of [HATCH, VAN]) {
            expect(count(game, color)).toBe(count(plain, color));
            expect(drive(game, color).modelled).toBe(true);
        }
        // Two-tone or not, the roll is Car's own
        const spy = jest.spyOn(Math, 'random').mockReturnValue(0.1);
        const car = drive(game, HATCH);
        spy.mockRestore();
        expect(car.roofColor).toBe(0x1a1a1a);
        const roofs = [];
        car.carGroup.traverse(o => { if (o.isMesh && o.material.name === 'paint_roof') roofs.push(o.material.color.getHex()); });
        expect(roofs).toContain(0x1a1a1a);
    });
});

describe.each([['hatchback', HATCH], ['van', VAN]])('swapping the model of a %s', (kind, color) => {
    const game = load({ held: true });
    const car = drive(game, color, road());
    const procedural = measure(game, car);
    const before = { children: car.carGroup.children.length, body: car.body, paint: car.body.material, wheels: car.wheels.slice() };
    let modelled;

    beforeAll(async () => {
        game.release();
        await game.CarModels.preload();
        await settle();
        modelled = measure(game, car);
    });

    test('the procedural car stands until the file is in, then the model takes its place', () => {
        expect(before.children).toBeGreaterThan(25);
        expect(car.modelled).toBe(true);
        expect(car.kind).toBe(kind);
        expect(car.body).not.toBe(before.body);
        expect(before.body.parent).toBeNull();
        before.wheels.forEach(wheel => expect(wheel.parent).toBeNull());
        expect(car.carGroup.children.length).toBe(5);
        expect(game.log).toEqual([]);
    });

    test('its wheels are on the hubs and the tyres are the size Car spins them for', () => {
        expect(modelled.hubs).toEqual(procedural.hubs);
        expect(modelled.tyre).toBeCloseTo(0.32, 2);
        expect(procedural.tyre).toBeCloseTo(0.32, 2);
        // Tyres on the road: Car lifts its origin by the wheel radius
        expect(modelled.box.min.y).toBeCloseTo(-0.32, 2);
    });

    test('its footprint is the procedural car\'s, inside what the collision reaches', () => {
        expect(Math.abs(modelled.size.z - procedural.size.z)).toBeLessThan(0.15);
        expect(Math.abs(modelled.size.x - procedural.size.x)).toBeLessThan(0.2);
        expect(Math.abs(modelled.box.max.z - procedural.box.max.z)).toBeLessThan(0.1);
        expect(Math.abs(modelled.box.min.z - procedural.box.min.z)).toBeLessThan(0.1);
        expect(modelled.box.max.z).toBeLessThan(REACH);
        expect(-modelled.box.min.z).toBeLessThan(REACH);
        expect(modelled.box.max.x).toBeLessThan(1.1);
        expect(modelled.box.min.x).toBeCloseTo(-modelled.box.max.x, 2);
    });

    test('it wears the car\'s paint, on the material the collision flash writes to', () => {
        expect(car.body.material).toBe(before.paint);
        expect(car.body.material.color.getHex()).toBe(color);
        car.carGroup.traverse(o => {
            if (!o.isMesh) return;
            expect(o.geometry.attributes.color).toBeTruthy();
            expect(o.material.vertexColors).toBe(true);
            expect(o.castShadow).toBe(true);
        });
        jest.useFakeTimers();
        car.onCollision();
        const painted = [];
        car.carGroup.traverse(o => { if (o.isMesh && o.material === car.body.material) painted.push(o); });
        expect(painted.length).toBeGreaterThan(0);
        painted.forEach(o => expect(o.material.color.getHex()).toBe(0xff0000));
        jest.advanceTimersByTime(250);
        jest.useRealTimers();
        expect(car.body.material.color.getHex()).toBe(color);
    });

    test('update still spins the wheels, blinks the indicators and lights the brakes', () => {
        const lamps = INDICATORS.map(name => car[name]);
        lamps.forEach(lamp => {
            expect(lamp.isMesh).toBe(true);
            expect(lamp.material.emissiveIntensity).toBe(0);
        });
        expect(new Set(lamps.map(lamp => lamp.material)).size).toBe(4);
        // Left is +x, as on the procedural car
        expect(car.leftFrontIndicator.getWorldPosition(new game.THREE.Vector3()).x).toBeGreaterThan(0.5);
        expect(car.rightRearIndicator.getWorldPosition(new game.THREE.Vector3()).x).toBeLessThan(-0.3);
        expect(car.leftFrontIndicator.getWorldPosition(new game.THREE.Vector3()).z).toBeGreaterThan(1.5);
        expect(car.rightRearIndicator.getWorldPosition(new game.THREE.Vector3()).z).toBeLessThan(-1.5);

        car.update(1 / 60);
        const spin = car.wheels[0].rotation.x;
        expect(spin).not.toBe(0);
        car.wheels.forEach(wheel => expect(wheel.rotation.x).toBe(spin));

        car.inDetour = true;
        car.detourSide = 'left';
        car.indicatorTimer = 0;
        car.update(1 / 60);
        expect(car.leftFrontIndicator.material.emissive.getHex()).toBe(0xff8800);
        expect(car.leftFrontIndicator.material.emissiveIntensity).toBe(0.6);
        expect(car.rightFrontIndicator.material.emissiveIntensity).toBe(0);
        car.inDetour = false;
        car.detourSide = null;

        car.previousSpeed = car.currentSpeed + 2;
        car.update(1 / 60);
        expect(car.leftRearIndicator.material.emissive.getHex()).toBe(0xff0000);
        expect(car.rightRearIndicator.material.emissiveIntensity).toBe(1);
        car.update(1 / 60);
        expect(car.rightRearIndicator.material.emissiveIntensity).toBe(0);
    });

    test('its lamps are lit as the procedural car\'s were', () => {
        const glow = {};
        car.carGroup.traverse(o => { if (o.isMesh && o.material.emissive.getHex() !== 0 && o.material.emissiveIntensity > 0) glow[o.material.name] = [o.material.emissive.getHex(), o.material.emissiveIntensity]; });
        expect(glow).toEqual({ headlight: [0xffffee, 0.8], taillight: [0xff0000, 0.3] });
    });

    test('its headlamps come on with the rider\'s headlight, as a uniform only, and go off again', () => {
        const lamps = [];
        car.carGroup.traverse(o => { if (o.isMesh && o.material.name === 'headlight') lamps.push(o.material); });
        expect(lamps.length).toBeGreaterThan(0);
        const versions = lamps.map(m => m.version);
        // The rider's threshold: any headlight strength over 0 (rain in a world, or the dark)
        expect(game.Traffic.headlightsOn(0)).toBe(false);
        expect(game.Traffic.headlightsOn(0.5)).toBe(true);
        car.setHeadlights(game.Traffic.headlightsOn(0.5));
        lamps.forEach(m => expect(m.emissiveIntensity).toBe(game.Car.LAMP_ON));
        // No material is marked for a new program: the switch costs no shader compile when the rain arrives
        expect(lamps.map(m => m.version)).toEqual(versions);
        car.setHeadlights(false);
        lamps.forEach(m => expect(m.emissiveIntensity).toBe(game.Car.LAMP_DAY));
    });

    test('removing it frees the model without spoiling the next car', () => {
        const scene = car.carGroup.parent;
        car.remove();
        expect(car.carGroup.parent).toBeNull();
        expect(scene.children).toEqual([]);
        const next = drive(game, color);
        expect(next.modelled).toBe(true);
        expect(next.body.geometry.attributes.position.count).toBeGreaterThan(0);
    });
});

describe('when the files are already in', () => {
    const game = load();

    beforeAll(() => game.CarModels.preload());

    test('a new car is modelled as it is built', () => {
        expect(drive(game, HATCH).modelled).toBe(true);
        expect(game.CarModels.dress(drive(game, VAN))).toBe(true);
    });

    test('two cars of one kind share geometry and keep their own paint', () => {
        const a = drive(game, HATCH);
        const b = drive(game, 0x1a1a1a);
        expect(a.body.geometry).toBe(b.body.geometry);
        expect(a.body.material).not.toBe(b.body.material);
        expect(a.body.material.color.getHex()).toBe(HATCH);
        expect(b.body.material.color.getHex()).toBe(0x1a1a1a);
        expect(a.leftRearIndicator.material).not.toBe(b.leftRearIndicator.material);
    });
});

describe('a car that is on the road when its file arrives', () => {
    const game = load({ held: true });
    const environment = road();
    const car = drive(game, VAN, environment);

    test('keeps its procedural model until it wraps round the leg, out of sight', async () => {
        car.update(1 / 60);
        const body = car.body;
        game.release();
        await game.CarModels.preload();
        await settle();
        expect(car.modelled).toBeFalsy();
        expect(car.body).toBe(body);
        expect(typeof car.modelWaiting).toBe('function');
        car.update(1 / 60);
        expect(car.modelled).toBeFalsy();

        // Off the start of the leg: Car hides it and puts it back at the far end
        jest.useFakeTimers();
        car.currentSegment = -1;
        car.update(1 / 60);
        expect(car.carGroup.visible).toBe(false);
        expect(car.modelled).toBe(true);
        expect(car.modelWaiting).toBeNull();
        expect(car.wheels[0].rotation.x).not.toBe(0);
        jest.advanceTimersByTime(150);
        jest.useRealTimers();
        expect(game.log).toEqual([]);
    });
});

describe('a car without its file', () => {
    const game = load({ failing: ['hatchback.glb'] });
    const car = drive(game, HATCH, road());
    const parts = car.carGroup.children.slice();

    test('keeps its procedural model, whole and working, while the other kind is modelled', async () => {
        await game.CarModels.preload();
        expect(await game.CarModels.dress(car)).toBe(false);
        expect(car.modelled).toBeFalsy();
        expect(car.carGroup.children).toEqual(parts);
        expect(game.log.some(line => line.includes('hatchback.glb') && line.includes('procedural'))).toBe(true);
        car.previousSpeed = car.currentSpeed + 2;
        car.update(1 / 60);
        expect(car.leftRearIndicator.material.emissiveIntensity).toBe(1);
        expect(car.wheels[0].rotation.x).not.toBe(0);
        // The procedural headlamps switch as the modelled ones do
        car.setHeadlights(true);
        const lamps = car.carGroup.children.filter(o => o.name === 'headlights');
        expect(lamps).toHaveLength(2);
        lamps.forEach(o => expect(o.material.emissiveIntensity).toBe(game.Car.LAMP_ON));
        expect(drive(game, VAN).modelled).toBe(true);
    });
});

describe('a car file that lacks a part', () => {
    const game = load();

    test('is refused before anything of the procedural car is removed', async () => {
        await game.CarModels.preload();
        const model = await game.SceneAssets.loadModel(game.CarModels.CARS.van);
        const lamp = model.meshes.get('indicator_rr');
        model.meshes.delete('indicator_rr');
        const car = drive(game, VAN);
        model.meshes.set('indicator_rr', lamp);
        expect(car.modelled).toBeFalsy();
        expect(car.carGroup.children.length).toBeGreaterThan(25);
        expect(car.body.parent).toBe(car.carGroup);
        expect(car.body.material.vertexColors).toBe(false);
        expect(game.log.some(line => line.includes('indicator_rr'))).toBe(true);
    });
});
