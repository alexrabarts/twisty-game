// The playable roster (CHARACTERS in js/vehicle.js): every character owns
// detailed bikes (BIKE_MODELS) whose files are in the repository, rides the
// first unless another is picked, and rides each with physics scaled from
// their own by the bike's class. Lucy has her own kit; Guy is on the roster
// with his own kit and a scarf he wears only on the scrambler; Tim rides the
// maxi scooter.
import { existsSync, readFileSync } from 'node:fs';
import { Blob } from 'node:buffer';
import { TextDecoder } from 'node:util';
import { canvasStub, loadScript, realThree } from '../helpers/load-game.js';

const root = new URL('../../', import.meta.url);

// Who owns which bike, as the owner assigned them (the first is the default)
const OWNERS = {
    steve: ['bike08_xsr900', 'bike13_panigale'],
    alex: ['bike02_speed_triple', 'bike10_tiger900'],
    tim: ['bike14_tmax', 'bike06_z750'],
    shane: ['bike03_duke390', 'bike09_duke890', 'bike11_duke990'],
    lucy: ['bike01_z650', 'bike07_mt09'],
    guy: ['bike04_scrambler', 'bike05_g310gs', 'bike07_mt09_black', 'bike12_tracer9gt']
};

function load({ files = false } = {}) {
    const THREE = realThree();
    const source = ['vehicle.js', 'sceneassets.js', 'bikemodels.js'].map(loadScript).join('\n;\n');
    const sink = { log() {}, warn() {}, error() {} };
    const fetch = files
        ? async url => {
            const bytes = readFileSync(new URL(url, root));
            return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
        }
        : async () => ({ ok: false, status: 404 });
    const factory = new Function(
        'THREE', 'document', 'localStorage', 'console', 'fetch', 'Blob', 'TextDecoder', 'performance',
        `${source}\nreturn { Vehicle, CHARACTERS, BikeModels, BIKE_MODELS, BIKE_CLASSES };`
    );
    return { THREE, ...factory(THREE, canvasStub(), { getItem: () => null, setItem() {} }, sink, fetch, Blob, TextDecoder, performance) };
}

const game = load();
const find = id => game.CHARACTERS.find(c => c.id === id);
const ride = (id, bike) => new game.Vehicle(new game.THREE.Scene(), null, find(id), bike);
const named = (object, name) => {
    const found = [];
    object.traverse(o => { if (o.name === name) found.push(o); });
    return found;
};

describe('the roster', () => {
    test('is the six riders, each owning the bikes assigned to them', () => {
        expect(Object.fromEntries(game.CHARACTERS.map(c => [c.id, c.bikes]))).toEqual(OWNERS);
    });

    test.each(game.CHARACTERS.map(c => [c.id, c]))('%s rides bikes the game builds, from files that exist', (id, character) => {
        for (const bike of character.bikes) {
            const entry = game.BIKE_MODELS[bike];
            expect(entry).toBeTruthy();
            expect(existsSync(new URL(entry.file, root))).toBe(true);
            const kind = game.Vehicle.BIKES[entry.kind];
            expect(typeof game.Vehicle.prototype[kind.build]).toBe('function');
            expect(game.BIKE_CLASSES[entry.cls]).toBeTruthy();
            expect(entry.name).toBeTruthy();
            expect(Number.isInteger(entry.year)).toBe(true);
            expect(game.Vehicle.bikeTitle(bike)).toBe(`${entry.name} (${entry.year})`);
            // The rider select shows descriptive names, never a maker's
            expect(entry.name).not.toMatch(/kawasaki|triumph|ktm|ducati|bmw|yamaha|tmax|panigale|tiger|duke|tracer|scrambler icon|speed triple/i);
        }
        expect(game.Vehicle.bikeOf(character)).toBe(character.bikes[0]);
        expect(game.BikeModels.BIKES[id]).toBe(game.BIKE_MODELS[character.bikes[0]].file);
        expect(character.name).toBeTruthy();
        expect(character.bikeLabel).toBeTruthy();
        expect(parseInt(character.bikeColor)).toBe(game.BIKE_MODELS[character.bikes[0]].paint);
        Object.values(character.stats).forEach(value => {
            expect(Number.isInteger(value)).toBe(true);
            expect(value).toBeGreaterThanOrEqual(1);
            expect(value).toBeLessThanOrEqual(5);
        });
    });

    test('a vehicle rides the bike asked for if the rider owns it, else their first', () => {
        expect(ride('guy', 'bike12_tracer9gt').model).toBe('bike12_tracer9gt');
        expect(ride('guy', 'bike13_panigale').model).toBe('bike04_scrambler');
        expect(ride('guy').model).toBe('bike04_scrambler');
        expect(ride('steve', 'bike13_panigale').bike).toBe('sport');
    });

    test('every kind of procedural bike still has its modelled file', () => {
        Object.keys(game.Vehicle.BIKES).forEach(bike => {
            expect(existsSync(new URL(game.BikeModels.MODELS[bike], root))).toBe(true);
        });
    });

    test('ids are unique', () => {
        const ids = game.CHARACTERS.map(c => c.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
});

describe('the physics of a rider on a bike', () => {
    test.each(game.CHARACTERS.map(c => [c.id, c]))('%s rides their first bike on their own physics, unchanged', (id, character) => {
        const vehicle = ride(id);
        const physics = character.physics;
        expect(vehicle.maxSpeed).toBe(68 * physics.maxSpeed);
        expect(vehicle.acceleration).toBe(15 * physics.acceleration);
        expect(vehicle.brakeForce).toBe(20 * physics.brakeForce);
        expect(vehicle.steeringForce).toBe(9.5 * physics.steeringForce);
        expect(vehicle.comfortShake).toBe(physics.comfortShake);
        expect(game.Vehicle.physicsOf(character, character.bikes[0])).toEqual(physics);
    });

    test('another bike scales them by its class against the first, within the tuned range', () => {
        const steve = find('steve');
        const superbike = game.Vehicle.physicsOf(steve, 'bike13_panigale');
        expect(superbike.maxSpeed).toBeGreaterThan(steve.physics.maxSpeed);
        expect(superbike.maxSpeed).toBeLessThanOrEqual(1.2);
        expect(superbike.comfortShake).toBeGreaterThan(steve.physics.comfortShake);
        // Jumps and wheelies are the rider's, not the bike's
        expect(superbike.jumpPower).toBe(steve.physics.jumpPower);
        const alex = find('alex');
        const adventure = game.Vehicle.physicsOf(alex, 'bike10_tiger900');
        expect(adventure.comfortShake).toBeLessThan(alex.physics.comfortShake);
        const shane = find('shane');
        expect(game.Vehicle.physicsOf(shane, 'bike11_duke990').maxSpeed).toBeGreaterThan(shane.physics.maxSpeed);
        expect(ride('shane', 'bike11_duke990').maxSpeed).toBeCloseTo(68 * game.Vehicle.physicsOf(shane, 'bike11_duke990').maxSpeed, 9);
    });
});

describe('Lucy', () => {
    const lucy = find('lucy');

    test('is a character on her naked middleweight', () => {
        expect(lucy.name).toBe('Lucy');
        expect(lucy.bikes[0]).toBe('bike01_z650');
        expect(game.BikeModels.BIKES.lucy).toBe('assets/bikes/detail/bike01_z650.glb');
    });

    test('rides between the dirt-bike rider and the adventure rider for speed, and handles well', () => {
        const top = id => find(id).physics.maxSpeed;
        expect(lucy.physics.maxSpeed).toBeGreaterThan(top('shane'));
        expect(lucy.physics.maxSpeed).toBeLessThan(top('alex'));
        expect(lucy.physics.steeringForce).toBeGreaterThan(1);
        expect(lucy.stats.handling).toBeGreaterThanOrEqual(4);
    });

    test('builds as her bike in her own kit, with the procedural stand-in until the files are in', () => {
        const vehicle = ride('lucy');
        expect(vehicle.bike).toBe('naked');
        expect(vehicle.frame.material.color.getHex()).toBe(game.BIKE_MODELS.bike01_z650.paint);
        expect(vehicle.riderSpec.pantsColor).toBe(lucy.kit.pantsColor);
        expect(vehicle.riderSpec.helmetStyle).toBe('streak');
        expect(vehicle.riderSpec.backpackColor).toBe(lucy.kit.backpackColor);
        expect(vehicle.riderSpec.scarf).toBeNull();
        expect(vehicle.maxSpeed).toBeCloseTo(68 * lucy.physics.maxSpeed, 6);
        expect(vehicle.riderStandHeight).toBe(game.Vehicle.BIKES.naked.stand);
    });
});

describe('Guy', () => {
    const guy = find('guy');

    test('is a mid-size all-rounder on his scrambler, in his own dark textile kit', () => {
        expect(guy.name).toBe('Guy');
        expect(guy.bikes[0]).toBe('bike04_scrambler');
        expect(guy.stats).toEqual({ speed: 3, accel: 3, handling: 4, jump: 3, comfort: 4 });
        // Between Lucy and Alex for pace, softer than Lucy, easier than Steve
        expect(guy.physics.maxSpeed).toBeGreaterThan(find('lucy').physics.maxSpeed);
        expect(guy.physics.maxSpeed).toBeLessThan(find('alex').physics.maxSpeed);
        expect(guy.physics.comfortShake).toBeLessThan(find('lucy').physics.comfortShake);
        const vehicle = ride('guy');
        expect(vehicle.riderSpec.suitColor).toBe(guy.kit.suitColor);
        expect(vehicle.riderSpec.helmetColor).toBe(guy.kit.helmetColor);
        expect(vehicle.riderSpec.bootColor).toBe(guy.kit.bootColor);
    });

    test.each(OWNERS.guy)('wears his scarf only on the scrambler: %s', bike => {
        const vehicle = ride('guy', bike);
        const on = bike === 'bike04_scrambler';
        expect(vehicle.riderSpec.scarf).toBe(on ? guy.kit.scarfColor : null);
        expect(named(vehicle.rider, 'scarf').length).toBe(on ? 1 : 0);
    });

    test('nobody else wears a scarf on any bike', () => {
        for (const character of game.CHARACTERS.filter(c => c.id !== 'guy')) {
            for (const bike of character.bikes) expect(ride(character.id, bike).riderSpec.scarf).toBeNull();
        }
    });

    test('keeps the scarf on the modelled rider of the scrambler, and only there', async () => {
        const real = load({ files: true });
        await real.BikeModels.preload(['bike04_scrambler', 'bike12_tracer9gt']);
        const guyOf = real.CHARACTERS.find(c => c.id === 'guy');
        const scrambler = new real.Vehicle(new real.THREE.Scene(), null, guyOf, 'bike04_scrambler');
        const tourer = new real.Vehicle(new real.THREE.Scene(), null, guyOf, 'bike12_tracer9gt');
        expect(scrambler.modelled).toBe(true);
        expect(tourer.modelled).toBe(true);
        const [scarf] = named(scrambler.rider, 'scarf');
        expect(scarf).toBeTruthy();
        expect(scarf.parent).toBe(scrambler.rider);
        scarf.traverse(o => { if (o.isMesh) expect(o.material.color.getHex()).toBe(guyOf.kit.scarfColor); });
        expect(named(tourer.rider, 'scarf')).toEqual([]);
    });
});

describe('Tim', () => {
    test('rides the maxi scooter, feet forward on its boards', async () => {
        const tim = find('tim');
        expect(tim.bikes).toEqual(['bike14_tmax', 'bike06_z750']);
        const vehicle = ride('tim');
        expect(vehicle.model).toBe('bike14_tmax');
        expect(vehicle.bike).toBe('scooter');
        expect(vehicle.maxSpeed).toBe(68 * tim.physics.maxSpeed);

        const real = load({ files: true });
        await real.BikeModels.preload(['bike14_tmax']);
        const modelled = new real.Vehicle(new real.THREE.Scene(), null, real.CHARACTERS.find(c => c.id === 'tim'));
        expect(modelled.modelled).toBe(true);
        modelled.group.updateMatrixWorld(true);
        const hip = modelled.rider.position.z - Math.sin(modelled.riderSpec.torsoLean) * 0.17;
        named(modelled.rider, 'boot').forEach(boot => expect(boot.getWorldPosition(new real.THREE.Vector3()).z - hip).toBeGreaterThan(0.35));
        expect(modelled.riderSpec.torsoLean).toBeLessThan(0.1);
    });
});

describe('Steve', () => {
    test('tucks in on the superbike and sits up on the retro triple', () => {
        const real = load({ files: true });
        return real.BikeModels.preload(['bike13_panigale', 'bike08_xsr900']).then(() => {
            const steve = real.CHARACTERS.find(c => c.id === 'steve');
            const superbike = new real.Vehicle(new real.THREE.Scene(), null, steve, 'bike13_panigale');
            const retro = new real.Vehicle(new real.THREE.Scene(), null, steve, 'bike08_xsr900');
            expect(superbike.riderSpec.torsoLean).toBeGreaterThan(0.7);
            expect(superbike.riderSpec.style).toBe('race');
            expect(named(superbike.rider, 'hump').length).toBe(1);
            expect(retro.riderSpec.torsoLean).toBeLessThan(0.35);
            // The tuck puts the helmet low and forward, over the tank
            const head = v => named(v.rider, 'head')[0].getWorldPosition(new real.THREE.Vector3());
            superbike.group.updateMatrixWorld(true);
            retro.group.updateMatrixWorld(true);
            expect(head(superbike).y).toBeLessThan(head(retro).y - 0.1);
            expect(head(superbike).z).toBeGreaterThan(head(retro).z + 0.1);
        });
    });
});
