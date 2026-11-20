/**
 * @jest-environment node
 */
// The touring crew are the characters the player did not pick, each on its own bike in its own first outfit, drawn
// from the far files (assets/bikes/far/<id>.glb and rider_far.glb, tools/blender/far.py), and a rider select bike
// that is not looked at is drawn from its own file once that is in memory (js/bikemodels.js, js/traffic.js). Every
// rule is read from CHARACTERS, BIKE_MODELS, OUTFITS and the files, so a new character, bike or outfit is held with
// no line added here.
// Real modules on real three r150; fetch reads the files from disk.
import { describe, test, expect, beforeAll } from '@jest/globals';
import { readdirSync, statSync } from 'node:fs';
import { loadBikes } from '../helpers/bike-rig.js';

const root = new URL('../../', import.meta.url);
// What the crew cost before: a rider on the one light sport bike (2416 triangles) with the plain rider (3736) was
// 6152, and 2576 as the procedural bike that stood until its files were in, which is what the window's budget probe
// counted (world-budget: four of them, 10304). A far bike and a light rider are held to about half the first, each
// and all five together; Scenery.TRIANGLE_CAP pays what five of them cost over the four the probe counted.
const BUDGET = { bike: 2300, bikeBytes: 72 * 1024, riderBytes: 176 * 1024, worn: 1300, rider: 3600, crew: 17000, meshes: 60 };
const NODES = ['body', 'wheel_front', 'wheel_rear', 'brake_light'];

const count = geometry => (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
// The triangles drawn of `object`, at the nearest level of each THREE.LOD in it
function triangles(object) {
    let total = 0;
    const visit = o => {
        if (o.isMesh) total += count(o.geometry);
        (o.isLOD ? [o.levels[0].object] : o.children).forEach(visit);
    };
    visit(object);
    return total;
}
const levelTriangles = level => [...level.meshes.values()].flat().reduce((sum, { geometry }) => sum + count(geometry), 0);
const geometries = object => {
    const found = new Set();
    object.traverse(o => { if (o.isMesh) found.add(o.geometry); });
    return found;
};
const colours = object => {
    const found = new Set();
    object.traverse(o => { if (o.isMesh) found.add(o.material.color.getHex()); });
    return found;
};

const game = loadBikes();
const { CHARACTERS, BIKE_MODELS, BikeModels, SceneAssets, Vehicle, AIMotorcycle, Traffic, THREE } = game;
const crewRider = character => new AIMotorcycle(new THREE.Scene(), null, { character, model: BikeModels.crewBike(character), color: 0x0000ff, style: 'sport' });

describe('the far files', () => {
    test('every detailed bike has a far file, and no far file is without its bike', () => {
        const files = readdirSync(new URL('assets/bikes/far/', root)).filter(file => file.endsWith('.glb')).map(file => `assets/bikes/far/${file}`).sort();
        expect(files).toEqual(Object.values(BIKE_MODELS).map(bike => bike.far).sort());
    });

    test.each(Object.keys(BIKE_MODELS))('%s: the far file has the parts the crew draw, the marks its rider sits on, its paint and its luggage, within its budget', async (id) => {
        const bike = BIKE_MODELS[id];
        const far = await SceneAssets.loadModel(bike.far);
        const detail = (await SceneAssets.loadModel(bike.file)).groups.get('lod1');
        NODES.forEach(name => expect(far.meshes.has(name)).toBe(true));
        ['grip', 'peg'].forEach(mark => expect(far.places.get(mark).distanceTo(detail.places.get(mark))).toBeLessThan(1e-4));
        expect(far.places.has('seat') || Array.isArray(bike.seat)).toBe(true);
        expect(far.meshes.has('luggage')).toBe(detail.meshes.has('luggage'));
        expect(far.meshes.get('body').some(({ material }) => material.name === 'paint')).toBe(true);
        expect(levelTriangles(far)).toBeLessThanOrEqual(BUDGET.bike);
        expect(levelTriangles(far)).toBeLessThan(levelTriangles(detail) * 0.5);
        expect(statSync(new URL(bike.far, root)).size).toBeLessThanOrEqual(BUDGET.bikeBytes);
        // Each wheel stands on the ground where the detail file's does
        for (const name of ['wheel_front', 'wheel_rear']) {
            const box = level => level.meshes.get(name).reduce((all, { geometry }) => all.union(geometry.boundingBox), new THREE.Box3());
            const low = level => box(level).min.y + level.places.get(name).y;
            expect(Math.abs(low(far) - low(detail))).toBeLessThan(0.01);
            expect(Math.abs(low(far))).toBeLessThan(0.02);
        }
    });

    test('the light rider has every part and every cut of the rider, each a fraction of it, in a file within its budget', async () => {
        const near = await SceneAssets.loadModel(BikeModels.RIDER);
        const far = await SceneAssets.loadModel(BikeModels.RIDER_FAR);
        expect([...far.meshes.keys()].sort()).toEqual([...near.meshes.keys()].sort());
        for (const [name, parts] of far.meshes) {
            const some = list => list.reduce((sum, { geometry }) => sum + count(geometry), 0);
            expect(some(parts)).toBeLessThanOrEqual(Math.max(24, some(near.meshes.get(name)) * 0.5));
            // The outfit's colours reach the same materials
            const names = list => new Set(list.map(({ material }) => material.name));
            for (const material of names(parts)) expect(names(near.meshes.get(name)).has(material)).toBe(true);
        }
        expect(statSync(new URL(BikeModels.RIDER_FAR, root)).size).toBeLessThanOrEqual(BUDGET.riderBytes);
    });
});

describe('the touring crew', () => {
    beforeAll(() => BikeModels.preload());

    test.each(CHARACTERS.map(c => c.id))('with %s as the player, the crew are the other characters and nobody else', (id) => {
        const player = CHARACTERS.find(c => c.id === id);
        const crew = Traffic.crewOf(player.name);
        expect(crew.length).toBe(CHARACTERS.length - 1);
        crew.forEach(character => expect(CHARACTERS).toContain(character));
        expect(new Set(crew).size).toBe(crew.length);
        expect(crew).not.toContain(player);
        expect(crew.map(c => c.name)).not.toContain(player.name);
    });

    test('nobody of the crew has a name that is not a character\'s', () => {
        const source = Traffic.prototype.initializeMotorcycles.toString();
        expect(source).toContain('Traffic.crewOf(this.playerRiderName)');
        expect(source).toContain('riderName: character.name');
        expect(Traffic.prototype.getRiderName).toBeUndefined();
    });

    test('the paces are the crew\'s as they were: expert, fast, two average and slow', () => {
        expect(Traffic.CREW_PACES.map(pace => [pace.skill, pace.speed, pace.spread])).toEqual([['expert', 48, 8], ['fast', 42, 6], ['average', 36, 5], ['average', 36, 5], ['slow', 30, 5]]);
    });

    test.each(CHARACTERS.map(c => c.id))('%s rides its own first bike from its far file, in its own first outfit and build', async (id) => {
        const character = CHARACTERS.find(c => c.id === id);
        const bike = crewRider(character);
        expect(bike.modelled).toBe(true);
        expect(bike.riderName).toBe(character.name);
        expect(BikeModels.crewBike(character)).toBe(character.bikes[0]);
        const entry = BIKE_MODELS[character.bikes[0]];
        const far = await SceneAssets.loadModel(entry.far);
        const own = new Set([...far.meshes.values()].flat().map(({ geometry }) => geometry));
        const rider = await SceneAssets.loadModel(BikeModels.RIDER_FAR);
        const light = new Set([...rider.meshes.values()].flat().map(({ geometry }) => geometry));
        const body = bike.bikeGroup.children.filter(child => child !== bike.rider);
        // Nothing of the near levels and nothing built from primitives but a scarf
        for (const part of body) for (const geometry of geometries(part)) expect(own.has(geometry)).toBe(true);
        let foreign = 0;
        for (const geometry of geometries(bike.rider)) if (!light.has(geometry)) foreign++;
        expect(foreign).toBeLessThanOrEqual(bike.rider.getObjectByName('scarf') ? geometries(bike.rider.getObjectByName('scarf')).size : 0);
        // The file's own paint, and the luggage the entry shows
        expect(bike.frame.material.color.getHex()).toBe(far.meshes.get('body').find(({ material }) => material.name === 'paint').material.color.getHex());
        expect(!!bike.bikeGroup.getObjectByName('luggage')).toBe(!!entry.luggage && far.meshes.has('luggage'));
        // The first outfit's colours and cuts, and the character's size
        const kit = character.outfits[0].kit;
        const worn = colours(bike.rider);
        expect(worn.has(kit.suitColor)).toBe(true);
        expect(worn.has(kit.helmetColor)).toBe(true);
        const torso = bike.rider.getObjectByName('torso');
        expect(geometries(torso)).toEqual(new Set(rider.meshes.get(kit.torsoStyle ? `torso_${kit.torsoStyle}` : 'torso').map(({ geometry }) => geometry)));
        const helmet = bike.rider.getObjectByName('helmet');
        expect(geometries(helmet)).toEqual(new Set(rider.meshes.get(kit.helmetStyle ? `helmet_${kit.helmetStyle}` : 'helmet').map(({ geometry }) => geometry)));
        expect(torso.scale.x).toBeCloseTo(character.build.width, 6);
        expect(torso.scale.y).toBeCloseTo(character.build.height, 6);
        // Light: the bike, the rider, and the draw calls
        expect(triangles(bike.bikeGroup) - triangles(bike.rider)).toBeLessThanOrEqual(BUDGET.bike);
        expect(triangles(bike.rider)).toBeLessThanOrEqual(BUDGET.worn);
        expect(triangles(bike.bikeGroup)).toBeLessThanOrEqual(BUDGET.rider);
        let meshes = 0;
        bike.bikeGroup.traverse(o => { if (o.isMesh) meshes++; });
        expect(meshes).toBeLessThan(BUDGET.meshes);
        bike.remove();
    });

    test.each(CHARACTERS.map(c => c.id))('with %s as the player, the whole crew draws within its budget', (id) => {
        const crew = Traffic.crewOf(CHARACTERS.find(c => c.id === id).name).map(crewRider);
        const total = crew.reduce((sum, bike) => sum + triangles(bike.bikeGroup), 0);
        expect(total).toBeLessThanOrEqual(BUDGET.crew);
        crew.forEach(bike => bike.remove());
    });

    test('every outfit of every character is within the light rider\'s budget as worn', () => {
        for (const character of CHARACTERS) {
            for (const outfit of character.outfits) {
                const bike = crewRider({ ...character, outfits: [outfit], kit: outfit.kit });
                expect(bike.modelled).toBe(true);
                expect(triangles(bike.rider)).toBeLessThanOrEqual(BUDGET.worn);
                bike.remove();
            }
        }
    });

    test.each(CHARACTERS.map(c => c.id))('%s leans off the bike as the character does, hands on the grips and feet on the pegs', (id) => {
        const character = CHARACTERS.find(c => c.id === id);
        const bike = crewRider(character);
        const ends = () => {
            bike.bikeGroup.updateMatrixWorld(true);
            const list = [];
            bike.rider.traverse(o => { if (o.name === 'glove' || o.name === 'boot') list.push(bike.bikeGroup.worldToLocal(o.getWorldPosition(new THREE.Vector3()))); });
            return list;
        };
        const before = ends();
        expect(before.length).toBe(4);
        bike.leanAngle = 0.6;
        bike.leanRider();
        const lean = Vehicle.riderLean(0.6, character.bodyLean);
        expect(bike.rider.rotation.z).toBeCloseTo(lean.roll, 9);
        expect(bike.rider.position.x).toBeCloseTo(lean.shift, 9);
        if (character.bodyLean > 0) expect(Math.abs(bike.rider.rotation.z)).toBeGreaterThan(0.01);
        else expect(bike.rider.rotation.z).toBe(0);
        ends().forEach((at, i) => expect(at.distanceTo(before[i])).toBeLessThan(0.03));
        // Upright again, the rider sits as before
        bike.leanAngle = 0;
        bike.leanRider();
        expect(bike.rider.rotation.z).toBeCloseTo(0, 9);
        ends().forEach((at, i) => expect(at.distanceTo(before[i])).toBeLessThan(1e-6));
        bike.remove();
    });

    // A far file keeps the handedness of its detail file (some are mirrored as they load): the bike the crew draw
    // lies on the far level of the same bike as the player rides it, and not on its mirror image
    test.each(Object.keys(BIKE_MODELS))('%s: the crew\'s bike has its chain, its silencer and its discs on the sides the bike has them', async (id) => {
        const owner = CHARACTERS.find(c => c.bikes.includes(id));
        await BikeModels.preload([id]);
        const points = (root, skip) => {
            root.updateMatrixWorld(true);
            const list = [];
            const visit = o => {
                if (o === skip) return;
                if (o.isMesh) {
                    const position = o.geometry.attributes.position;
                    for (let i = 0; i < position.count; i += 3) list.push(new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(o.matrixWorld));
                }
                o.children.forEach(visit);
            };
            visit(root);
            return list;
        };
        const stand = new Vehicle(new THREE.Scene(), null, owner, id, { model: 'far' });
        expect(stand.far).toBe(true);
        stand.group.position.set(0, 0, 0);
        stand.group.rotation.set(0, 0, 0);
        const reference = points(stand.group, stand.rider);
        const bike = new AIMotorcycle(new THREE.Scene(), null, { character: owner, model: id, style: 'sport' });
        expect(bike.modelled).toBe(true);
        // The places (5 cm cells) only one side of the bike fills: the far bike fills those, not their mirror images
        const cell = (p, flip) => `${Math.round(p.x * flip / 0.05)},${Math.round(p.y / 0.05)},${Math.round(p.z / 0.05)}`;
        const filled = new Set(reference.map(p => cell(p, 1)));
        const oneSided = new Set(reference.filter(p => Math.abs(p.x) > 0.04 && !filled.has(cell(p, -1))).map(p => cell(p, 1)));
        expect(oneSided.size).toBeGreaterThan(10);
        const mine = points(bike.bikeGroup, bike.rider);
        const hits = flip => mine.filter(p => oneSided.has(cell(p, flip))).length;
        expect(hits(1)).toBeGreaterThan(hits(-1) * 1.25);
        expect(hits(1)).toBeGreaterThan(10);
        bike.remove();
    });

    test('keeps the parts AIMotorcycle drives', () => {
        const bike = crewRider(CHARACTERS[0]);
        [bike.rearWheel, bike.frontWheel, bike.brakeLight, bike.frame, bike.rider].forEach(part => {
            let top = part;
            while (top.parent) top = top.parent;
            expect(top).toBe(bike.bikeGroup.parent);
        });
        const paint = bike.frame.material.color.getHex();
        bike.brakeLight.material.emissive.setHex(0xff0000);
        expect(bike.frame.material.emissive.getHex()).toBe(0x000000);
        bike.onCollision();
        expect(bike.frame.material.color.getHex()).toBe(0xff0000);
        // Two riders on the same bike share its geometry and not its paint
        const twin = crewRider(CHARACTERS[0]);
        expect(twin.frame.geometry).toBe(bike.frame.geometry);
        expect(twin.frame.material).not.toBe(bike.frame.material);
        expect(twin.frame.material.color.getHex()).toBe(paint);
        bike.remove();
        twin.remove();
    });

    test('keeps the procedural bike when its far file fails, and says which', async () => {
        const broken = loadBikes({ failing: ['assets/bikes/far/'] });
        const character = broken.CHARACTERS[0];
        const bike = new broken.AIMotorcycle(new broken.THREE.Scene(), null, { character, model: broken.BikeModels.crewBike(character), style: 'sport' });
        const parts = bike.bikeGroup.children.slice();
        expect(await broken.BikeModels.crew(bike)).toBe(false);
        expect(bike.modelled).toBeFalsy();
        expect(bike.bikeGroup.children).toEqual(parts);
        expect(broken.log.some(line => line.includes(broken.BIKE_MODELS[character.bikes[0]].far))).toBe(true);
    });

    test('a rider already on the road when its files arrive takes its bike out of sight, and no swap draws from Math.random', async () => {
        const fresh = loadBikes();
        const character = fresh.CHARACTERS[0];
        const bike = new fresh.AIMotorcycle(new fresh.THREE.Scene(), null, { character, model: fresh.BikeModels.crewBike(character), style: 'sport' });
        const parts = bike.bikeGroup.children.slice();
        bike.wheelRotation = 0.4;
        expect(await fresh.BikeModels.crew(bike)).toBe(false);
        expect(bike.modelled).toBeFalsy();
        expect(typeof bike.modelWaiting).toBe('function');
        // In view of the player it stays as it is
        bike.takeModel({ x: 30, y: 0, z: 0 });
        expect(bike.bikeGroup.children).toEqual(parts);
        const random = Math.random;
        let draws = 0;
        Math.random = () => { draws++; return random(); };
        try {
            bike.takeModel({ x: fresh.AIMotorcycle.UNSEEN_M + 1, y: 0, z: 0 });
        } finally {
            Math.random = random;
        }
        expect(bike.modelled).toBe(true);
        expect(bike.modelWaiting).toBeNull();
        expect(draws).toBe(0);
    });

    test('a rider that stays in sight takes its bike after a short wait, not minutes later', async () => {
        const fresh = loadBikes();
        const character = fresh.CHARACTERS[1];
        const bike = new fresh.AIMotorcycle(new fresh.THREE.Scene(), null, { character, model: fresh.BikeModels.crewBike(character), style: 'sport' });
        // On the road already: its wheels have turned
        bike.wheelRotation = 0.4;
        expect(await fresh.BikeModels.crew(bike)).toBe(false);
        const near = { x: 15, y: 0, z: 0 };
        for (let i = 0; i < fresh.AIMotorcycle.SEEN_WAIT_FRAMES; i++) bike.takeModel(near);
        expect(bike.modelled).toBeFalsy();
        bike.takeModel(near);
        expect(bike.modelled).toBe(true);
        expect(bike.modelWaiting).toBeNull();
        expect(fresh.AIMotorcycle.SEEN_WAIT_FRAMES).toBeLessThanOrEqual(120);
    });

    test('a ride fetches no near bike for the crew', async () => {
        const fresh = loadBikes();
        const character = fresh.CHARACTERS[0];
        const bike = new fresh.AIMotorcycle(new fresh.THREE.Scene(), null, { character, model: fresh.BikeModels.crewBike(character), style: 'sport' });
        expect(await fresh.BikeModels.crew(bike)).toBe(true);
        expect([...new Set(fresh.fetched)].sort()).toEqual([fresh.BikeModels.RIDER_FAR, fresh.BIKE_MODELS[character.bikes[0]].far].sort());
    });
});

describe('the stand-in of a rider select bike', () => {
    const every = CHARACTERS.flatMap(character => character.bikes.map(bike => [character.id, bike]));

    test('is built from primitives the first time, and nothing is fetched for it', async () => {
        const fresh = loadBikes();
        const stage = fresh.CHARACTERS.map(c => new fresh.Vehicle(new fresh.THREE.Scene(), null, c, null, { model: 'far' }));
        await new Promise(done => setTimeout(done, 0));
        expect(fresh.fetched).toEqual([]);
        expect(stage.every(v => !v.modelled && v.group.children.length > 40)).toBe(true);
    });

    test.each(every)('%s on %s: once the file is in memory the stand-in is the bike\'s own far level, and looking at it dresses it', async (id, bike) => {
        const fresh = loadBikes();
        const character = fresh.CHARACTERS.find(c => c.id === id);
        const shown = new fresh.Vehicle(new fresh.THREE.Scene(), null, character, bike);
        expect(await fresh.BikeModels.dress(shown)).toBe(true);
        const fetched = fresh.fetched.length;
        const again = new fresh.Vehicle(new fresh.THREE.Scene(), null, character, bike, { model: 'far' });
        expect(again.modelled).toBe(true);
        expect(again.far).toBe(true);
        expect(fresh.fetched.length).toBe(fetched);
        // Nothing built from primitives is left but a scarf: every mesh is the file's
        const file = await fresh.SceneAssets.loadModel(fresh.BIKE_MODELS[bike].file);
        const level = file.groups.get('lod1');
        const own = new Set([...level.meshes.values()].flat().map(({ geometry }) => geometry));
        for (const part of again.group.children.filter(child => child !== again.rider)) for (const geometry of geometries(part)) expect(own.has(geometry)).toBe(true);
        expect(triangles(again.group) - triangles(again.rider)).toBeLessThanOrEqual(levelTriangles(level));
        // What Vehicle animates is all there
        ['frontWheel', 'rearWheel', 'frontDisc', 'rearDisc', 'leftFork', 'rightFork', 'handlebar', 'brakeLight', 'frame', 'rider', 'helmet'].forEach(name => expect(again[name]).toBeTruthy());
        again.updateMesh();
        expect(await fresh.BikeModels.dress(again)).toBe(true);
        expect(again.far).toBe(false);
        expect(triangles(again.group)).toBe(triangles(shown.group));
    });

    test('wears the light rider once that is in memory', async () => {
        const fresh = loadBikes();
        const character = fresh.CHARACTERS[0];
        await fresh.BikeModels.preload([character.bikes[0]]);
        const near = new fresh.Vehicle(new fresh.THREE.Scene(), null, character);
        const far = new fresh.Vehicle(new fresh.THREE.Scene(), null, character, null, { model: 'far' });
        expect(far.far).toBe(true);
        expect(triangles(far.rider)).toBeLessThanOrEqual(BUDGET.worn);
        expect(triangles(far.rider)).toBeLessThan(triangles(near.rider) * 0.5);
    });

    test('a plain { model: false } bike stays procedural', async () => {
        const fresh = loadBikes();
        const character = fresh.CHARACTERS[0];
        await fresh.BikeModels.preload([character.bikes[0]]);
        const plain = new fresh.Vehicle(new fresh.THREE.Scene(), null, character, null, { model: false });
        expect(plain.modelled).toBeFalsy();
    });
});
