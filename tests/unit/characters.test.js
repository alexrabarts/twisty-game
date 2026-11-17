// The playable roster (CHARACTERS in js/vehicle.js): every character rides a
// kind of bike the game can build, whose modelled file is in the repository,
// can be unlocked and shows on the rider select. Lucy is on it with her own
// bike and kit.
import { existsSync } from 'node:fs';
import { Blob } from 'node:buffer';
import { TextDecoder } from 'node:util';
import { canvasStub, loadScript, realThree } from '../helpers/load-game.js';

const root = new URL('../../', import.meta.url);

function load() {
    const THREE = realThree();
    const source = ['vehicle.js', 'sceneassets.js', 'bikemodels.js'].map(loadScript).join('\n;\n');
    const sink = { log() {}, warn() {}, error() {} };
    const fetch = async () => ({ ok: false, status: 404 });
    const factory = new Function(
        'THREE', 'document', 'localStorage', 'console', 'fetch', 'Blob', 'TextDecoder', 'performance',
        `${source}\nreturn { Vehicle, CHARACTERS, BikeModels };`
    );
    return { THREE, ...factory(THREE, canvasStub(), { getItem: () => null, setItem() {} }, sink, fetch, Blob, TextDecoder, performance) };
}

const game = load();

describe('the roster', () => {
    test.each(game.CHARACTERS.map(c => [c.id, c]))('%s rides a bike the game builds, from a file that exists', (id, character) => {
        expect(Array.isArray(character.bikes)).toBe(true);
        expect(character.bikes.length).toBeGreaterThan(0);
        for (const bike of character.bikes) {
            const kind = game.Vehicle.BIKES[bike];
            expect(kind).toBeTruthy();
            expect(typeof game.Vehicle.prototype[kind.build]).toBe('function');
            expect(existsSync(new URL(game.BikeModels.MODELS[bike], root))).toBe(true);
        }
        expect(game.Vehicle.bikeOf(character)).toBe(character.bikes[0]);
        expect(game.BikeModels.BIKES[id]).toBe(game.BikeModels.MODELS[character.bikes[0]]);
        expect(character.name).toBeTruthy();
        expect(character.bikeLabel).toBeTruthy();
        expect(Number.isNaN(parseInt(character.bikeColor))).toBe(false);
        Object.values(character.stats).forEach(value => {
            expect(Number.isInteger(value)).toBe(true);
            expect(value).toBeGreaterThanOrEqual(1);
            expect(value).toBeLessThanOrEqual(5);
        });
    });

    test('every kind of bike has a modelled file', () => {
        Object.keys(game.Vehicle.BIKES).forEach(bike => {
            expect(existsSync(new URL(game.BikeModels.MODELS[bike], root))).toBe(true);
        });
    });

    test('ids are unique', () => {
        const ids = game.CHARACTERS.map(c => c.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
});

describe('Lucy', () => {
    const lucy = game.CHARACTERS.find(c => c.id === 'lucy');

    test('is a character on her naked middleweight', () => {
        expect(lucy).toBeTruthy();
        expect(lucy.name).toBe('Lucy');
        expect(lucy.bikes[0]).toBe('naked');
        expect(game.BikeModels.BIKES.lucy).toBe('assets/bikes/naked.glb');
    });

    test('rides between the dirt bike and the adventure bike for speed, and handles well', () => {
        const top = id => game.CHARACTERS.find(c => c.id === id).physics.maxSpeed;
        expect(lucy.physics.maxSpeed).toBeGreaterThan(top('shane'));
        expect(lucy.physics.maxSpeed).toBeLessThan(top('alex'));
        expect(lucy.physics.steeringForce).toBeGreaterThan(1);
        expect(lucy.stats.handling).toBeGreaterThanOrEqual(4);
    });

    test('builds as her bike in her own kit, with the procedural model until the files are in', () => {
        const vehicle = new game.Vehicle(new game.THREE.Scene(), null, lucy);
        expect(vehicle.bike).toBe('naked');
        expect(vehicle.frame.material.color.getHex()).toBe(parseInt(lucy.bikeColor));
        expect(vehicle.riderSpec.pantsColor).toBe(lucy.kit.pantsColor);
        expect(vehicle.riderSpec.helmetStyle).toBe('streak');
        expect(vehicle.riderSpec.backpackColor).toBe(lucy.kit.backpackColor);
        expect(vehicle.maxSpeed).toBeCloseTo(68 * lucy.physics.maxSpeed, 6);
        expect(vehicle.riderStandHeight).toBe(game.Vehicle.BIKES.naked.stand);
    });
});
