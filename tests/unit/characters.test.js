// The playable roster (CHARACTERS in js/vehicle.js): every character owns
// detailed bikes (BIKE_MODELS) whose files are in the repository, rides the
// first unless another is picked, and rides each with physics scaled from
// their own by the bike's class. Lucy has her own kit; Guy is on the roster
// with his own kit and a scarf he wears only on the scrambler; Tim rides the
// sports scooter.
import { existsSync, readFileSync } from 'node:fs';
import { Blob } from 'node:buffer';
import { TextDecoder } from 'node:util';
import { canvasStub, loadScript, realThree } from '../helpers/load-game.js';

const root = new URL('../../', import.meta.url);

// Who owns which bike, as the owner assigned them (the first is the default)
const OWNERS = {
    steve: ['bike08_xsr900', 'bike13_panigale'],
    alex: ['bike02_speed_triple', 'bike10_tiger900'],
    tim: ['bike14_forza', 'bike06_z750'],
    shane: ['bike03_duke390', 'bike09_duke890', 'bike11_duke990', 'bike16_superadv'],
    lucy: ['bike15_crf250', 'bike01_z650', 'bike07_mt09', 'bike13_panigale_black'],
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
        `${source}\nreturn { Vehicle, CHARACTERS, SceneAssets, BikeModels, BIKE_MODELS, BIKE_CLASSES };`
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
            expect(entry.name).not.toMatch(/kawasaki|triumph|ktm|ducati|bmw|yamaha|tmax|forza|panigale|tiger|duke|tracer|scrambler icon|speed triple/i);
        }
        expect(game.Vehicle.bikeOf(character)).toBe(character.bikes[0]);
        expect(game.BikeModels.BIKES[id]).toBe(game.BIKE_MODELS[character.bikes[0]].file);
        expect(character.name).toBeTruthy();
        expect(character.bikeLabel).toBeTruthy();
        expect(parseInt(character.bikeColor)).toBe(game.BIKE_MODELS[character.bikes[0]].paint);
        // The stars are worked out (Vehicle.statsOf), not written on the character
        expect(character.stats).toBeUndefined();
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
        expect(vehicle.brakeForce).toBe(14 * physics.brakeForce);
        expect(vehicle.steeringForce).toBe(14.25 * physics.steeringForce);
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

    test('Shane\'s big adventure tourer is his last and fastest bike: quicker at the top, softer and slower to turn than his nakeds, with its luggage on', () => {
        const shane = find('shane');
        expect(shane.bikes[shane.bikes.length - 1]).toBe('bike16_superadv');
        expect(shane.bikes[0]).toBe('bike03_duke390');
        expect(game.BIKE_MODELS.bike16_superadv).toMatchObject({ kind: 'adventure', cls: 'adventure', drive: 'chain', rearBrake: 'right', luggage: true });
        expect(game.BIKE_MODELS.bike16_superadv.light).toBeUndefined();
        const tourer = game.Vehicle.physicsOf(shane, 'bike16_superadv');
        const naked = game.Vehicle.physicsOf(shane, 'bike11_duke990');
        expect(tourer.maxSpeed).toBeGreaterThan(naked.maxSpeed);
        expect(tourer.maxSpeed).toBeGreaterThan(shane.physics.maxSpeed);
        expect(tourer.comfortShake).toBeLessThan(naked.comfortShake);
        expect(tourer.steeringForce).toBeLessThan(naked.steeringForce);
        // Jumps and wheelies are the rider's, not the bike's
        expect(tourer.jumpPower).toBe(shane.physics.jumpPower);
        expect(tourer.wheeliePop).toBe(shane.physics.wheeliePop);
        expect(ride('shane', 'bike16_superadv').maxSpeed).toBeCloseTo(68 * tourer.maxSpeed, 9);
        // He wears no backpack on any bike, so none meets the duffel behind him
        for (const bike of shane.bikes) expect(ride('shane', bike).riderSpec.backpackColor).toBeNull();
    });
});

describe('Lucy', () => {
    const lucy = find('lucy');

    test('is a character on her trail bike, her garage in order of power', () => {
        expect(lucy.name).toBe('Lucy');
        expect(lucy.bikes).toEqual(['bike15_crf250', 'bike01_z650', 'bike07_mt09', 'bike13_panigale_black']);
        expect(game.BikeModels.BIKES.lucy).toBe('assets/bikes/detail/bike15_crf250.glb');
        expect(lucy.bikeLabel).toBe('Trail single');
        expect(parseInt(lucy.bikeColor)).toBe(game.BIKE_MODELS.bike15_crf250.paint);
        const top = id => game.Vehicle.physicsOf(lucy, id).maxSpeed;
        expect(top('bike15_crf250')).toBeLessThan(top('bike01_z650'));
        expect(top('bike01_z650')).toBeLessThanOrEqual(top('bike07_mt09'));
        expect(top('bike07_mt09')).toBeLessThan(top('bike13_panigale_black'));
    });

    test('rides her naked twin as she did when it was her first bike', () => {
        // Her own numbers are her on the trail bike now; these are what they were on the twin, to the last digit shown
        const twin = game.Vehicle.physicsOf(lucy, 'bike01_z650');
        const was = { comfortShake: 0.8, maxSpeed: 0.9, acceleration: 1.08, brakeForce: 1.0, steeringForce: 1.12, jumpPower: 1.0, wheeliePop: 1.15, wheelieThrottle: 1.05 };
        expect(Object.keys(twin).sort()).toEqual(Object.keys(was).sort());
        for (const [key, value] of Object.entries(was)) expect(twin[key]).toBeCloseTo(value, 12);
        expect(ride('lucy', 'bike01_z650').maxSpeed).toBeCloseTo(68 * 0.9, 9);
        // On the twin: between the light naked's rider and the adventure rider for speed, and easy to turn
        expect(twin.maxSpeed).toBeGreaterThan(find('shane').physics.maxSpeed);
        expect(twin.maxSpeed).toBeLessThan(find('alex').physics.maxSpeed);
        expect(twin.steeringForce).toBeGreaterThan(1);
    });

    test('rides the trail bike slower, lighter to turn and softer than the twin', () => {
        const twin = game.Vehicle.physicsOf(lucy, 'bike01_z650');
        expect(game.BIKE_MODELS.bike15_crf250).toMatchObject({ kind: 'dirt', cls: 'adventure', light: true, drive: 'chain' });
        expect(lucy.physics.maxSpeed).toBeLessThan(twin.maxSpeed);
        expect(lucy.physics.acceleration).toBeLessThan(twin.acceleration);
        expect(lucy.physics.steeringForce).toBeGreaterThan(twin.steeringForce);
        expect(lucy.physics.comfortShake).toBeLessThan(twin.comfortShake);
        expect(game.Vehicle.statsOf(lucy, lucy.bikes[0]).handling).toBeGreaterThanOrEqual(4);
    });

    test('her superbike is the red one in black, a road bike with its lights, mirrors, plate and indicators, and no tail pack', async () => {
        const real = load({ files: true });
        const [red, black] = await Promise.all(['bike13_panigale', 'bike13_panigale_black'].map(id => real.SceneAssets.loadModel(real.BIKE_MODELS[id].file)));
        const materials = model => new Set([...model.groups.get('lod0').meshes.values()].flat().map(part => part.material.name));
        for (const model of [red, black]) {
            expect(model.groups.get('lod0').meshes.has('headlight')).toBe(true);
            for (const name of ['headlight', 'signal', 'plate']) expect(materials(model).has(name)).toBe(true);
        }
        expect(materials(red).has('luggage')).toBe(true);
        expect(materials(black).has('luggage')).toBe(false);
        expect(game.BIKE_MODELS.bike13_panigale_black).toMatchObject({ name: 'V4 superbike, black', kind: 'sport', cls: 'supersport', year: game.BIKE_MODELS.bike13_panigale.year, pose: game.BIKE_MODELS.bike13_panigale.pose });
        await real.BikeModels.preload(['bike13_panigale_black']);
        const vehicle = new real.Vehicle(new real.THREE.Scene(), null, real.CHARACTERS.find(c => c.id === 'lucy'), 'bike13_panigale_black');
        expect(vehicle.modelled).toBe(true);
        expect(vehicle.model).toBe('bike13_panigale_black');
        expect(named(vehicle.group, 'headlight').length).toBeGreaterThan(0);
    });

    test('her two own bikes carry the marks of their falls at both levels of detail, and no other bike does', async () => {
        const real = load({ files: true });
        const scuffed = ['bike13_panigale_black', 'bike15_crf250'];
        for (const id of Object.keys(real.BIKE_MODELS)) {
            const model = await real.SceneAssets.loadModel(real.BIKE_MODELS[id].file);
            for (const lod of ['lod0', 'lod1']) {
                const marks = [...new Set([...model.groups.get(lod).meshes.values()].flat().map(part => part.material.name))].filter(name => /^(scuff_|tape$)/.test(name));
                if (scuffed.includes(id)) {
                    expect(marks.some(name => name.startsWith('scuff_'))).toBe(true);
                    if (lod === 'lod0') expect(marks).toContain('tape');
                } else {
                    expect([id, lod, marks]).toEqual([id, lod, []]);
                }
            }
        }
    });

    test('builds as her bike in her own kit, with the procedural stand-in until the files are in', () => {
        const vehicle = ride('lucy');
        expect(vehicle.bike).toBe('dirt');
        expect(vehicle.frame.material.color.getHex()).toBe(game.BIKE_MODELS.bike15_crf250.paint);
        expect(vehicle.riderSpec.pantsColor).toBe(lucy.kit.pantsColor);
        expect(vehicle.riderSpec.helmetStyle).toBe('streak');
        // She wears no backpack in any outfit: it hid the jacket
        lucy.outfits.forEach(outfit => expect(outfit.kit.backpackColor).toBeUndefined());
        expect(vehicle.riderSpec.backpackColor).toBeNull();
        expect(vehicle.riderSpec.scarf).toBeNull();
        expect(vehicle.maxSpeed).toBeCloseTo(68 * lucy.physics.maxSpeed, 6);
        expect(vehicle.riderStandHeight).toBe(game.Vehicle.BIKES.dirt.stand);
    });
});

describe('Guy', () => {
    const guy = find('guy');

    test('is a mid-size all-rounder on his scrambler, in his own dark textile kit', () => {
        expect(guy.name).toBe('Guy');
        expect(guy.bikes[0]).toBe('bike04_scrambler');
        expect(game.Vehicle.statsOf(guy, guy.bikes[0])).toEqual({ speed: 2, accel: 3, handling: 3, jump: 3, comfort: 4 });
        // Between Lucy on her naked twin and Alex for pace, softer than Lucy on the twin, easier than Steve
        const twin = game.Vehicle.physicsOf(find('lucy'), 'bike01_z650');
        expect(guy.physics.maxSpeed).toBeGreaterThan(twin.maxSpeed);
        expect(guy.physics.maxSpeed).toBeLessThan(find('alex').physics.maxSpeed);
        expect(guy.physics.comfortShake).toBeLessThan(twin.comfortShake);
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
    test('rides the sports scooter, feet forward on its boards', async () => {
        const tim = find('tim');
        expect(tim.bikes).toEqual(['bike14_forza', 'bike06_z750']);
        const vehicle = ride('tim');
        expect(vehicle.model).toBe('bike14_forza');
        // The id his scooter had before it was remodelled is no bike now: asked for, it is his first
        expect(game.Vehicle.modelOf(tim, 'bike14_tmax')).toBe('bike14_forza');
        expect(ride('tim', 'bike14_tmax').model).toBe('bike14_forza');
        expect(vehicle.bike).toBe('scooter');
        expect(vehicle.maxSpeed).toBe(68 * tim.physics.maxSpeed);

        const real = load({ files: true });
        await real.BikeModels.preload(['bike14_forza']);
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

// What the riders wear (OUTFITS in js/vehicle.js): every rider has two outfits or more, each outfit names cuts of the modelled
// rider that are in the file, the first is the one a rider wears unless another is asked for and carries a mark that reads from
// behind, and nothing in the source says who made the gear or whose it is. These hold for the next rider and the next outfit
// with no change here: a new garment is a node `<part>_<style>` in tools/blender/rider.py and a style and colours in a kit.
describe('the outfits', () => {
    const STYLES = { helmetStyle: ['helmet'], torsoStyle: ['torso'], upperArmStyle: ['upper_arm'], forearmStyle: ['forearm'], thighStyle: ['thigh'],
        shinStyle: ['shin'], gloveStyle: ['glove'], bootStyle: ['boot'] };
    // A part worn only by a kit that names its style: there is no plain one
    const EXTRAS = { backStyle: ['back'] };
    const every = game.CHARACTERS.flatMap(c => c.outfits.map(outfit => [c.id, outfit.id, c, outfit]));
    const nodes = () => {
        const bytes = readFileSync(new URL(game.BikeModels.RIDER, root));
        return new Set(JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + bytes.readUInt32LE(12)))).nodes.map(node => node.name));
    };

    test('every rider has two or more, each with an id, a neutral name and a whole kit', () => {
        for (const character of game.CHARACTERS) {
            expect([character.id, character.outfits.length >= 2]).toEqual([character.id, true]);
            expect(new Set(character.outfits.map(outfit => outfit.id)).size).toBe(character.outfits.length);
            // The kit the rest of the game reads is the first outfit's
            expect(character.kit).toBe(character.outfits[0].kit);
            expect(character.build.height).toBeGreaterThan(0.85);
            expect(character.build.height).toBeLessThan(1.1);
            expect(character.build.width).toBeGreaterThan(0.8);
            expect(character.build.width).toBeLessThan(1.15);
        }
        for (const [, , , outfit] of every) {
            expect(outfit.id).toMatch(/^[a-z]+(-[a-z]+)*$/);
            expect(outfit.name.length).toBeGreaterThan(8);
            ['suitColor', 'suitAccent', 'helmetColor', 'helmetAccent'].forEach(key => expect(Number.isInteger(outfit.kit[key])).toBe(true));
        }
        // The tallest and the slightest
        const build = id => find(id).build;
        game.CHARACTERS.forEach(c => expect(build('steve').height).toBeGreaterThanOrEqual(c.build.height));
        game.CHARACTERS.forEach(c => expect(build('lucy').width).toBeLessThanOrEqual(c.build.width));
    });

    test.each(every)('%s in %s names cuts that are in the rider file', (id, outfitId, character, outfit) => {
        const names = nodes();
        for (const [key, [part]] of Object.entries(STYLES)) {
            const style = outfit.kit[key];
            expect(names.has(style ? `${part}_${style}` : part)).toBe(true);
        }
        for (const [key, [part]] of Object.entries(EXTRAS)) {
            if (outfit.kit[key] !== undefined) expect([key, names.has(`${part}_${outfit.kit[key]}`)]).toEqual([key, true]);
        }
        // No style the dressing does not know
        Object.keys(outfit.kit).filter(key => key.endsWith('Style')).forEach(key => expect([...Object.keys(STYLES), ...Object.keys(EXTRAS)]).toContain(key));
        if (outfit.kit.neckColor !== undefined) expect(names.has('neck')).toBe(true);
        if (outfit.kit.backpackColor !== undefined) expect(names.has('backpack')).toBe(true);
    });

    test('a rider wears the first outfit unless one of their own is asked for', () => {
        for (const character of game.CHARACTERS) {
            expect(game.Vehicle.outfitOf(character)).toBe(character.outfits[0]);
            expect(game.Vehicle.outfitOf(character, 'no-such-outfit')).toBe(character.outfits[0]);
            expect(new game.Vehicle(new game.THREE.Scene(), null, character).outfit).toBe(character.outfits[0]);
            for (const outfit of character.outfits) {
                const vehicle = new game.Vehicle(new game.THREE.Scene(), null, character, null, { outfit: outfit.id });
                expect(vehicle.outfit).toBe(outfit);
                expect(vehicle.riderSpec.suitColor).toBe(outfit.kit.suitColor);
                expect(vehicle.riderSpec.helmetStyle).toBe(outfit.kit.helmetStyle ?? null);
                expect(vehicle.riderSpec.torsoStyle).toBe(outfit.kit.torsoStyle);
                expect(vehicle.riderSpec.build).toBe(character.build);
            }
        }
        // Another rider's outfit is not theirs
        expect(game.Vehicle.outfitOf(find('tim'), 'tan-waxed')).toBe(find('tim').outfits[0]);
        expect(game.Vehicle.outfitOf({ id: 'bare' })).toBeNull();
    });

    test('the modelled rider wears each outfit: its cuts, its colours, its neck tube and its build', async () => {
        const real = load({ files: true });
        await real.BikeModels.preload(real.CHARACTERS.map(c => c.bikes[0]));
        for (const character of real.CHARACTERS) {
            for (const outfit of character.outfits) {
                const vehicle = new real.Vehicle(new real.THREE.Scene(), null, character, null, { outfit: outfit.id });
                expect(vehicle.modelled).toBe(true);
                const colours = new Set();
                vehicle.rider.traverse(o => { if (o.isMesh) colours.add(o.material.color.getHex()); });
                ['suitColor', 'helmetColor', 'pantsColor', 'bootColor', 'neckColor', 'suitPatch'].forEach(key => {
                    if (outfit.kit[key] !== undefined) expect([key, colours.has(outfit.kit[key])]).toEqual([key, true]);
                });
                // Each part is found by its plain name whatever its cut, two of each limb
                expect(named(vehicle.rider, 'torso').length).toBe(1);
                expect(named(vehicle.rider, 'helmet').length).toBe(1);
                ['upper_arm', 'forearm', 'thigh', 'shin', 'glove', 'boot'].forEach(name => expect(named(vehicle.rider, name).length).toBe(2));
                expect(named(vehicle.rider, 'neck').length).toBe(outfit.kit.neckColor === undefined ? 0 : 1);
                expect(named(vehicle.rider, 'back').length).toBe(outfit.kit.backStyle === undefined ? 0 : 1);
                expect(named(vehicle.rider, 'backpack').length).toBe(outfit.kit.backpackColor === undefined ? 0 : 1);
                const [torso] = named(vehicle.rider, 'torso');
                expect(torso.scale.x).toBeCloseTo(character.build.width, 6);
                expect(torso.scale.y).toBeCloseTo(character.build.height, 6);
            }
        }
        // The same cut in two outfits is the same geometry
        const shane = real.CHARACTERS.find(c => c.id === 'shane');
        const [first, second] = shane.outfits.map(outfit => new real.Vehicle(new real.THREE.Scene(), null, shane, null, { outfit: outfit.id }));
        const geometry = v => { let found; named(v.rider, 'torso')[0].traverse(o => { if (o.isMesh && !found) found = o.geometry; }); return found; };
        expect(geometry(first)).toBe(geometry(second));
        expect(named(first.rider, 'helmet')[0]).not.toBe(named(second.rider, 'helmet')[0]);
    });

    test('a kit that names a backpack colour still gets the backpack', async () => {
        const real = load({ files: true });
        const lucy = real.CHARACTERS.find(c => c.id === 'lucy');
        await real.BikeModels.preload([lucy.bikes[0]]);
        const [first] = lucy.outfits;
        const packed = { ...lucy, outfits: [{ ...first, kit: { ...first.kit, backpackColor: 0x18191c } }] };
        const vehicle = new real.Vehicle(new real.THREE.Scene(), null, packed);
        expect(vehicle.modelled).toBe(true);
        const [backpack] = named(vehicle.rider, 'backpack');
        expect(backpack).toBeTruthy();
        backpack.traverse(o => { if (o.isMesh) expect(o.material.color.getHex()).toBe(0x18191c); });
    });

    // Colour as the eye tells it apart: CIE L*a*b* of an sRGB colour, and the distance between two (1976's, where about 2 is the
    // least difference seen side by side)
    const lab = hex => {
        const [r, g, b] = [16, 8, 0].map(shift => ((hex >> shift) & 255) / 255).map(c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
        const f = t => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
        const [x, y, z] = [(0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, 0.2126 * r + 0.7152 * g + 0.0722 * b, (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883].map(f);
        return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
    };
    const apart = (a, b) => Math.hypot(...lab(a).map((value, i) => value - lab(b)[i]));
    // What the chase camera sees of a rider: the helmet, and the jacket with what is worn on its back and the seat of the
    // trousers under it. For each, the area in cm2 of every colour, counting the triangles of the modelled parts that face
    // backward by their area across the view. The colours are the ones the game gives the kit's materials.
    const BACK = { helmet: ['helmet'], jacket: ['torso', 'back', 'backpack', 'hump'] };
    const backView = (real, vehicle) => Object.fromEntries(Object.entries(BACK).map(([zone, parts]) => {
        const areas = new Map();
        const a = new real.THREE.Vector3(), b = new real.THREE.Vector3(), c = new real.THREE.Vector3();
        parts.flatMap(name => named(vehicle.rider, name)).forEach(part => part.traverse(o => {
            if (!o.isMesh) return;
            const position = o.geometry.attributes.position, index = o.geometry.index;
            let sum = 0;
            for (let t = 0; t < index.count; t += 3) {
                a.fromBufferAttribute(position, index.getX(t));
                b.fromBufferAttribute(position, index.getX(t + 1));
                c.fromBufferAttribute(position, index.getX(t + 2));
                const normal = b.sub(a).cross(c.sub(a));
                if (normal.z < -0.3 * normal.length()) sum -= normal.z / 2;
            }
            const hex = o.material.color.getHex();
            areas.set(hex, (areas.get(hex) || 0) + sum * 1e4);
        }));
        return [zone, areas];
    }));
    // The Standard chase camera is about 6.3 m behind the rider's back with a 75 degree view: a 1080-line frame draws about
    // 1.1 pixels to the centimetre there, so 60 cm2 is about 75 pixels.
    // CONTRAST: how far a colour must be from the back view's main colour to be a mark on it. SAME: under this, two colours
    // are one at that distance (a washed black and a black are).
    const MARK_CM2 = 60, APART_CM2 = 180, CONTRAST = 30, SAME = 20;
    const mark = view => {
        const all = new Map();
        Object.values(view).forEach(areas => areas.forEach((area, hex) => all.set(hex, (all.get(hex) || 0) + area)));
        const [ground] = [...all].sort((p, q) => q[1] - p[1])[0];
        return [...all].filter(([hex]) => apart(hex, ground) >= CONTRAST).reduce((sum, [, area]) => sum + area, 0);
    };
    // The area of two back views that is not the same colour in the same place: in the helmet and in the jacket apart, the
    // colours of both grouped where they are within SAME of each other, half the sum of what each group differs by
    const differ = (p, q) => Object.keys(BACK).reduce((total, zone) => {
        const colours = [...new Set([...p[zone].keys(), ...q[zone].keys()])];
        const group = colours.map((_, i) => i);
        colours.forEach((x, i) => colours.forEach((y, j) => {
            if (apart(x, y) >= SAME) return;
            const [from, to] = [group[j], group[i]];
            group.forEach((g, n) => { if (g === from) group[n] = to; });
        }));
        const sums = new Map();
        colours.forEach((hex, i) => sums.set(group[i], (sums.get(group[i]) || 0) + (p[zone].get(hex) || 0) - (q[zone].get(hex) || 0)));
        return total + [...sums.values()].reduce((sum, value) => sum + Math.abs(value), 0) / 2;
    }, 0);

    test('the outfit each rider wears first has a mark that reads from behind, and no two of them look alike from there', async () => {
        const real = load({ files: true });
        await real.BikeModels.preload(real.CHARACTERS.map(c => c.bikes[0]));
        const views = real.CHARACTERS.map(character => {
            const vehicle = new real.Vehicle(new real.THREE.Scene(), null, character);
            expect(vehicle.modelled).toBe(true);
            return [character.id, backView(real, vehicle)];
        });
        // A mark: enough of the back view in a colour well away from its main one (a helmet, a yoke, a panel, a bar)
        expect(views.filter(([, view]) => mark(view) < MARK_CM2).map(([id, view]) => [id, Math.round(mark(view))])).toEqual([]);
        const alike = [];
        views.forEach(([id, view], i) => views.slice(i + 1).forEach(([other, theirs]) => {
            const area = differ(view, theirs);
            if (area < APART_CM2) alike.push([id, other, Math.round(area)]);
        }));
        expect(alike).toEqual([]);
        // The measure tells a marked back from a plain one: without his bar, one rider has no mark and is too like another
        const alex = real.CHARACTERS.find(c => c.id === 'alex');
        const guy = real.CHARACTERS.find(c => c.id === 'guy');
        const { backStyle, ...bare } = alex.outfits[0].kit;
        expect(backStyle).toBe('bar');
        const plain = backView(real, new real.Vehicle(new real.THREE.Scene(), null, { ...alex, outfits: [{ ...alex.outfits[0], kit: bare }] }));
        expect(mark(plain)).toBeLessThan(MARK_CM2);
        expect(differ(plain, backView(real, new real.Vehicle(new real.THREE.Scene(), null, guy)))).toBeLessThan(APART_CM2);
    });

    test('the light rider (the crew\'s, and a stand-in\'s) keeps each first outfit\'s mark from behind, and no two look alike', async () => {
        const real = load({ files: true });
        await real.BikeModels.preload(real.CHARACTERS.map(c => c.bikes[0]));
        const views = real.CHARACTERS.map(character => {
            const vehicle = new real.Vehicle(new real.THREE.Scene(), null, character, null, { model: 'far' });
            expect(vehicle.far).toBe(true);
            return [character.id, backView(real, vehicle)];
        });
        expect(views.filter(([, view]) => mark(view) < MARK_CM2).map(([id, view]) => [id, Math.round(mark(view))])).toEqual([]);
        const alike = [];
        views.forEach(([id, view], i) => views.slice(i + 1).forEach(([other, theirs]) => {
            const area = differ(view, theirs);
            if (area < APART_CM2) alike.push([id, other, Math.round(area)]);
        }));
        expect(alike).toEqual([]);
    });

    test('the source names no maker, no person beyond a first name and no photo', () => {
        // Kept turned by thirteen letters so that this file does not hold the words either
        const turn = word => word.replace(/[a-z]/g, letter => String.fromCharCode((letter.charCodeAt(0) - 97 + 13) % 26 + 97));
        const words = ['nycvarfgnef', 'xyvz', 'fubrv', 'nenv', 'nti', 'uwp', 'xgz', 'evpun', 'qnvarfr', 'erivg', 'oryy', 'qelfgne', 'uneqvfgl', 'enonegf'].map(turn);
        const vehicle = loadScript('vehicle.js');
        const sources = {
            outfits: vehicle.slice(vehicle.indexOf('const OUTFITS'), vehicle.indexOf('const CHARACTERS')),
            'bikemodels.js': loadScript('bikemodels.js'),
            'tours.js': loadScript('tours.js'),
            'rider.py': readFileSync(new URL('tools/blender/rider.py', root), 'utf8'),
            'bike_kit.py': readFileSync(new URL('tools/blender/bike_kit.py', root), 'utf8'),
            names: every.map(([, , , outfit]) => `${outfit.id} ${outfit.name}`).join('\n')
        };
        for (const [name, text] of Object.entries(sources)) {
            for (const word of words) expect([name, word, new RegExp(`\\b${word}\\b`, 'i').test(text)]).toEqual([name, word, false]);
            expect([name, /\b(IMG|PXL|DSC|MVIMG)_?\d|\.(jpe?g|heic)\b/i.test(text)]).toEqual([name, false]);
        }
    });
});

// How the six really ride, as the owner gave it: the pace on country roads, on mountain roads and round hairpins,
// and how daring, 1 to 5; and the home place in the group, 1 at the front
const TRAITS = {
    steve: { country: 5, mountain: 5, hairpins: 4, daring: 3 },
    shane: { country: 2, mountain: 4, hairpins: 5, daring: 5 },
    alex: { country: 2, mountain: 4, hairpins: 3, daring: 2 },
    lucy: { country: 3, mountain: 3, hairpins: 3, daring: 3 },
    tim: { country: 2, mountain: 2, hairpins: 2, daring: 1 },
    guy: { country: 1, mountain: 1, hairpins: 1, daring: 1 }
};
const PLACES = ['steve', 'alex', 'lucy', 'shane', 'tim', 'guy'];

// The stars each card showed for the rider on their first bike while they were written by hand: the worked-out stars
// stay within one of them. Where they differ, and why (each is one star):
//   steve speed 5 to 4 and comfort 1 to 2: his superbike must show more speed and less comfort, and 5 and 1 left no room
//   alex jump 4 to 3: he is not daring, and his adventure bike must show more
//   lucy jump 3 to 4: her first bike is the trail bike, which must show more than her road bikes
//   guy speed 3 to 2 and handling 4 to 3: the rider's part, the slowest of them everywhere
const CARD = {
    steve: { speed: 5, accel: 4, handling: 3, jump: 2, comfort: 1 },
    alex: { speed: 3, accel: 3, handling: 4, jump: 4, comfort: 4 },
    tim: { speed: 2, accel: 2, handling: 4, jump: 1, comfort: 5 },
    shane: { speed: 2, accel: 4, handling: 5, jump: 5, comfort: 3 },
    lucy: { speed: 2, accel: 3, handling: 5, jump: 3, comfort: 4 },
    guy: { speed: 3, accel: 3, handling: 4, jump: 3, comfort: 4 }
};
const DIFFERS = { steve: ['speed', 'comfort'], alex: ['jump'], lucy: ['jump'], guy: ['speed', 'handling'] };

// Vehicle.physicsOf for every rider on every bike of theirs, as it was before the traits (commit 411016e), to six
// places: the traits set the stars and the crew's pace, and none of these multipliers. (Of the player's physics the
// traits touch one number, the lean limit by `daring`: Vehicle.leanOf, tests/unit/tuning-defaults.test.js)
const HEAD_PHYSICS = {
    steve: {
        bike08_xsr900: { comfortShake: 1.25, maxSpeed: 1.1, acceleration: 1.1, brakeForce: 1.05, steeringForce: 1, jumpPower: 0.85, wheeliePop: 1.3, wheelieThrottle: 1.15 },
        bike13_panigale: { comfortShake: 1.4, maxSpeed: 1.2, acceleration: 1.21, brakeForce: 1.15, steeringForce: 0.943396, jumpPower: 0.85, wheeliePop: 1.3, wheelieThrottle: 1.15 }
    },
    alex: {
        bike02_speed_triple: { comfortShake: 0.55, maxSpeed: 1, acceleration: 1, brakeForce: 1.05, steeringForce: 1.1, jumpPower: 1.25, wheeliePop: 1, wheelieThrottle: 1 },
        bike10_tiger900: { comfortShake: 0.378125, maxSpeed: 1.052632, acceleration: 0.925926, brakeForce: 1.1025, steeringForce: 1.080357, jumpPower: 1.25, wheeliePop: 1, wheelieThrottle: 1 }
    },
    tim: {
        bike14_forza: { comfortShake: 0.3, maxSpeed: 0.75, acceleration: 0.8, brakeForce: 1, steeringForce: 1.1, jumpPower: 0.6, wheeliePop: 0.75, wheelieThrottle: 0.9 },
        bike06_z750: { comfortShake: 0.8, maxSpeed: 0.95, acceleration: 1.08, brakeForce: 1, steeringForce: 1.12, jumpPower: 0.6, wheeliePop: 0.75, wheelieThrottle: 0.9 }
    },
    shane: {
        bike03_duke390: { comfortShake: 0.85, maxSpeed: 0.85, acceleration: 1.1, brakeForce: 1, steeringForce: 1.15, jumpPower: 1.5, wheeliePop: 1.2, wheelieThrottle: 1.1 },
        bike09_duke890: { comfortShake: 0.772727, maxSpeed: 1, acceleration: 1.222222, brakeForce: 1.052632, steeringForce: 1.084906, jumpPower: 1.5, wheeliePop: 1.2, wheelieThrottle: 1.1 },
        bike11_duke990: { comfortShake: 0.772727, maxSpeed: 1, acceleration: 1.222222, brakeForce: 1.052632, steeringForce: 1.084906, jumpPower: 1.5, wheeliePop: 1.2, wheelieThrottle: 1.1 },
        bike16_superadv: { comfortShake: 0.53125, maxSpeed: 1.052632, acceleration: 1.131687, brakeForce: 1.105263, steeringForce: 1.065532, jumpPower: 1.5, wheeliePop: 1.2, wheelieThrottle: 1.1 }
    },
    lucy: {
        bike15_crf250: { comfortShake: 0.605, maxSpeed: 0.805263, acceleration: 0.9, brakeForce: 0.9975, steeringForce: 1.166, jumpPower: 1, wheeliePop: 1.15, wheelieThrottle: 1.05 },
        bike01_z650: { comfortShake: 0.8, maxSpeed: 0.9, acceleration: 1.08, brakeForce: 1, steeringForce: 1.12, jumpPower: 1, wheeliePop: 1.15, wheelieThrottle: 1.05 },
        bike07_mt09: { comfortShake: 0.8, maxSpeed: 0.9, acceleration: 1.08, brakeForce: 1, steeringForce: 1.12, jumpPower: 1, wheeliePop: 1.15, wheelieThrottle: 1.05 },
        bike13_panigale_black: { comfortShake: 1.25, maxSpeed: 1.042105, acceleration: 1.1, brakeForce: 1.05, steeringForce: 1, jumpPower: 1, wheeliePop: 1.15, wheelieThrottle: 1.05 }
    },
    guy: {
        bike04_scrambler: { comfortShake: 0.7, maxSpeed: 0.92, acceleration: 1.02, brakeForce: 1, steeringForce: 1.08, jumpPower: 1.05, wheeliePop: 1, wheelieThrottle: 1 },
        bike05_g310gs: { comfortShake: 0.564667, maxSpeed: 0.868889, acceleration: 0.918, brakeForce: 1.05, steeringForce: 1.188, jumpPower: 1.05, wheeliePop: 1, wheelieThrottle: 1 },
        bike07_mt09_black: { comfortShake: 0.746667, maxSpeed: 0.971111, acceleration: 1.1016, brakeForce: 1.052632, steeringForce: 1.141132, jumpPower: 1.05, wheeliePop: 1, wheelieThrottle: 1 },
        bike12_tracer9gt: { comfortShake: 0.56, maxSpeed: 1.042667, acceleration: 1.0404, brakeForce: 1.105263, steeringForce: 1.059623, jumpPower: 1.05, wheeliePop: 1, wheelieThrottle: 1 }
    }
};

describe('the riders\' traits', () => {
    test('are the owner\'s table, exactly, and the places are the group\'s order', () => {
        expect(Object.fromEntries(game.CHARACTERS.map(c => [c.id, c.traits]))).toEqual(TRAITS);
        expect([...game.CHARACTERS].sort((a, b) => a.place - b.place).map(c => c.id)).toEqual(PLACES);
        expect(game.CHARACTERS.map(c => c.place).sort()).toEqual(PLACES.map((id, i) => i + 1));
    });

    test('do not touch the physics: every rider on every bike has the numbers of before', () => {
        expect(game.CHARACTERS.map(c => c.id).sort()).toEqual(Object.keys(HEAD_PHYSICS).sort());
        for (const character of game.CHARACTERS) {
            expect(character.bikes).toEqual(Object.keys(HEAD_PHYSICS[character.id]));
            for (const bike of character.bikes) {
                const now = game.Vehicle.physicsOf(character, bike), before = HEAD_PHYSICS[character.id][bike];
                expect(Object.keys(now).sort()).toEqual(Object.keys(before).sort());
                for (const key of Object.keys(before)) expect([character.id, bike, key, Math.round(now[key] * 1e6) / 1e6]).toEqual([character.id, bike, key, before[key]]);
            }
        }
        // A character with other traits, or with none, has the same physics
        for (const character of game.CHARACTERS) {
            for (const traits of [undefined, { country: 1, mountain: 1, hairpins: 1, daring: 1 }, { country: 5, mountain: 5, hairpins: 5, daring: 5 }]) {
                for (const bike of character.bikes) expect(game.Vehicle.physicsOf({ ...character, traits }, bike)).toEqual(game.Vehicle.physicsOf(character, bike));
            }
        }
    });
});

describe('the stars of the rider card', () => {
    const BARS = ['speed', 'accel', 'handling', 'jump', 'comfort'];
    const stars = (character, bike) => game.Vehicle.statsOf(character, bike);
    const model = bike => game.BIKE_MODELS[bike];
    // Every pair of two bikes of one rider: [character, bike, other]
    const pairs = game.CHARACTERS.flatMap(c => c.bikes.flatMap(a => c.bikes.filter(b => b !== a).map(b => [c, a, b])));
    // An adventure or trail bike, by the catalogue's own facts
    const rough = bike => model(bike).cls === 'adventure' || (model(bike).offroad || 0) >= 0.5;
    // The class that rides the firmest: the superbikes'
    const firmest = Object.keys(game.BIKE_CLASSES).reduce((a, b) => (game.BIKE_CLASSES[b].comfortShake > game.BIKE_CLASSES[a].comfortShake ? b : a));

    test('every bar of every rider on every bike is a whole number of stars from 1 to 5', () => {
        for (const character of game.CHARACTERS) {
            for (const bike of character.bikes) {
                const got = stars(character, bike);
                expect(Object.keys(got)).toEqual(BARS);
                for (const bar of BARS) {
                    expect(Number.isInteger(got[bar])).toBe(true);
                    expect(got[bar]).toBeGreaterThanOrEqual(1);
                    expect(got[bar]).toBeLessThanOrEqual(5);
                }
            }
        }
        // No traits and the two ends of the scale, on the two ends of the physics: still 1 to 5
        const ends = [undefined, { country: 1, mountain: 1, hairpins: 1, daring: 1 }, { country: 5, mountain: 5, hairpins: 5, daring: 5 }];
        for (const traits of ends) {
            for (const scale of [0.1, 3]) {
                const physics = Object.fromEntries(Object.entries(game.CHARACTERS[0].physics).map(([key, value]) => [key, value * scale]));
                const got = stars({ ...game.CHARACTERS[0], traits, physics });
                for (const bar of BARS) expect(got[bar] >= 1 && got[bar] <= 5 && Number.isInteger(got[bar])).toBe(true);
            }
        }
    });

    test('on the first bike they are the card\'s old stars within one, and differ only where it is written down', () => {
        expect(game.CHARACTERS.map(c => c.id).sort()).toEqual(Object.keys(CARD).sort());
        for (const character of game.CHARACTERS) {
            const got = stars(character, character.bikes[0]);
            expect(stars(character)).toEqual(got);
            for (const bar of BARS) expect([character.id, bar, Math.abs(got[bar] - CARD[character.id][bar]) <= 1]).toEqual([character.id, bar, true]);
            expect([character.id, BARS.filter(bar => got[bar] !== CARD[character.id][bar])]).toEqual([character.id, DIFFERS[character.id] || []]);
        }
    });

    test('a bike with more top speed under the same rider never shows less speed, and a tenth more shows more', () => {
        let strict = 0;
        for (const [character, bike, other] of pairs) {
            const more = game.Vehicle.physicsOf(character, bike).maxSpeed - game.Vehicle.physicsOf(character, other).maxSpeed;
            if (more > 0) expect([character.id, bike, other, stars(character, bike).speed >= stars(character, other).speed]).toEqual([character.id, bike, other, true]);
            if (more >= 0.1 - 1e-9) {
                strict++;
                expect([character.id, bike, other, stars(character, bike).speed > stars(character, other).speed]).toEqual([character.id, bike, other, true]);
            }
        }
        expect(strict).toBeGreaterThanOrEqual(game.CHARACTERS.length);
        // The last bike of a rider's list is the most powerful: it shows more speed than the first
        for (const character of game.CHARACTERS.filter(c => c.bikes.length > 1)) {
            expect([character.id, stars(character, character.bikes[character.bikes.length - 1]).speed > stars(character, character.bikes[0]).speed]).toEqual([character.id, true]);
        }
    });

    test('an adventure or trail bike shows more jump and more comfort than the same rider\'s road bikes', () => {
        let jump = 0, comfort = 0;
        for (const [character, bike, other] of pairs) {
            const a = stars(character, bike), b = stars(character, other);
            const offroad = (model(bike).offroad || 0) - (model(other).offroad || 0);
            // More of an off-road bike never jumps less; half an off-road bike more jumps more, unless the other is at 5
            if (offroad > 0) expect([character.id, bike, other, a.jump >= b.jump]).toEqual([character.id, bike, other, true]);
            if (offroad >= 0.5 && b.jump < 5) {
                jump++;
                expect([character.id, bike, other, a.jump > b.jump]).toEqual([character.id, bike, other, true]);
            }
            if (!rough(bike) || rough(other)) continue;
            // Never less comfort than a road bike, and more than one that rides firmer by 0.15 of shake or more
            expect([character.id, bike, other, a.comfort >= b.comfort]).toEqual([character.id, bike, other, true]);
            if (game.Vehicle.physicsOf(character, other).comfortShake - game.Vehicle.physicsOf(character, bike).comfortShake >= 0.15) {
                comfort++;
                expect([character.id, bike, other, a.comfort > b.comfort]).toEqual([character.id, bike, other, true]);
            }
        }
        expect(jump).toBeGreaterThanOrEqual(4);
        expect(comfort).toBeGreaterThanOrEqual(4);
    });

    test('a superbike shows less comfort than every other bike of the same rider', () => {
        let held = 0;
        for (const [character, bike, other] of pairs) {
            if (model(bike).cls !== firmest || model(other).cls === firmest) continue;
            held++;
            expect([character.id, bike, other, stars(character, bike).comfort < stars(character, other).comfort]).toEqual([character.id, bike, other, true]);
        }
        expect(held).toBeGreaterThanOrEqual(2);
    });

    test('the rider is part of the bars: pace moves speed and handling, daring the jump (and, with the hairpins, the handling), and nothing else', () => {
        const low = { country: 1, mountain: 1, hairpins: 1, daring: 1 }, high = { country: 5, mountain: 5, hairpins: 5, daring: 5 };
        const moved = { speed: 0, handling: 0, jump: 0 };
        let rides = 0;
        for (const character of game.CHARACTERS) {
            for (const bike of character.bikes) {
                rides++;
                const slow = stars({ ...character, traits: low }, bike), quick = stars({ ...character, traits: high }, bike);
                for (const bar of Object.keys(moved)) {
                    expect([character.id, bike, bar, quick[bar] >= slow[bar], quick[bar] - slow[bar] <= 1]).toEqual([character.id, bike, bar, true, true]);
                    if (quick[bar] > slow[bar]) moved[bar]++;
                }
                for (const bar of ['accel', 'comfort']) expect([character.id, bike, bar, quick[bar]]).toEqual([character.id, bike, bar, slow[bar]]);
                // A character with no traits is the middle of the scale
                expect(stars({ ...character, traits: undefined }, bike)).toEqual(stars({ ...character, traits: { country: 3, mountain: 3, hairpins: 3, daring: 3 } }, bike));
            }
        }
        // The rider is a fifth of a bar: the slowest and the quickest rider differ by a star on most bikes, never by two
        for (const bar of Object.keys(moved)) expect([bar, moved[bar] > rides / 2]).toEqual([bar, true]);
    });
});
