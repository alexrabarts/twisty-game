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
    shane: ['bike03_duke390', 'bike09_duke890', 'bike11_duke990'],
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
        expect(lucy.stats.handling).toBeGreaterThanOrEqual(4);
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
        expect(vehicle.riderSpec.backpackColor).toBe(lucy.kit.backpackColor);
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
        expect(guy.stats).toEqual({ speed: 3, accel: 3, handling: 4, jump: 3, comfort: 4 });
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

// What the riders wear (OUTFITS in js/vehicle.js): each outfit names cuts of the modelled rider that are in the file, the
// first is the one a rider wears unless another is asked for, and nothing in the source says who made the gear or whose it is
describe('the outfits', () => {
    const STYLES = { helmetStyle: ['helmet'], torsoStyle: ['torso'], upperArmStyle: ['upper_arm'], forearmStyle: ['forearm'], thighStyle: ['thigh'],
        shinStyle: ['shin'], gloveStyle: ['glove'], bootStyle: ['boot'] };
    const every = game.CHARACTERS.flatMap(c => c.outfits.map(outfit => [c.id, outfit.id, c, outfit]));
    const nodes = () => {
        const bytes = readFileSync(new URL(game.BikeModels.RIDER, root));
        return new Set(JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + bytes.readUInt32LE(12)))).nodes.map(node => node.name));
    };

    test('every rider has one or more, each with an id, a neutral name and a whole kit', () => {
        expect(game.CHARACTERS.map(c => [c.id, c.outfits.length])).toEqual([['steve', 1], ['alex', 2], ['tim', 1], ['shane', 3], ['lucy', 1], ['guy', 3]]);
        for (const character of game.CHARACTERS) {
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
        // No style the dressing does not know
        Object.keys(outfit.kit).filter(key => key.endsWith('Style')).forEach(key => expect(Object.keys(STYLES)).toContain(key));
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
