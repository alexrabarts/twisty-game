// The menu's rider (Game's showcase, js/main.js): the real Vehicle builds the chosen rider on the chosen bike in a
// real three scene; the stage follows each choice of rider, bike and outfit, builds a bike once per choice, frees
// what a replaced bike held, frames the bike in the menu's stage box (HomeStage), and leaves nothing behind when the
// menu closes. Game's own methods run against a plain object, as tests/unit/restart.test.js does.
import { describe, test, expect, beforeEach } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { loadGame, loadScript, canvasStub } from '../helpers/load-game.js';

const game = loadGame();
const { THREE, Vehicle, CHARACTERS, AtmosphereTrack } = game;
const { HomeStage } = new Function(`${loadScript('home.js')}\nreturn { HomeStage };`)();
const source = readFileSync(new URL('../../js/main.js', import.meta.url), 'utf8');
const classSource = source.slice(0, source.indexOf('Game.SHOWCASE_TURN = 0.22;') + 'Game.SHOWCASE_TURN = 0.22;'.length);

// The stage box the page's layout gives the rider: the left 600 px of a 1000 x 600 window
const stageBox = { left: 0, top: 0, width: 600, height: 600 };
const page = {
    querySelector: sel => (sel === '.home-stage' ? { getBoundingClientRect: () => stageBox } : null),
    createElement: tag => canvasStub().createElement(tag)
};
const frames = [];
const Game = new Function('THREE', 'Vehicle', 'CHARACTERS', 'AtmosphereTrack', 'HomeStage', 'document', 'window', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance',
    `${classSource}\nreturn Game;`)(THREE, Vehicle, CHARACTERS, AtmosphereTrack, HomeStage, page, { innerWidth: 1000, innerHeight: 600 }, (fn) => { frames.push(fn); return frames.length; }, () => {}, { now: () => 0 });

// The tour system with a store of its own: every rider open, nothing chosen yet
function tourSystem() {
    const map = new Map();
    const storage = { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v) };
    const factory = new Function('localStorage', 'CHARACTERS', 'Vehicle', 'document', `${loadScript('tours.js')}\nreturn TourSystem;`);
    const System = factory(storage, CHARACTERS, Vehicle, { querySelectorAll: () => [] });
    return new System({ unlockAll: true });
}

function menuGame() {
    const g = Object.create(Game.prototype);
    Object.assign(g, {
        scene: new THREE.Scene(),
        camera: new THREE.PerspectiveCamera(50, 1000 / 600, 0.1, 1000),
        directionalLight: new THREE.DirectionalLight(),
        tourSystem: tourSystem(),
        timeConfigs: { golden: { fogColor: 0x888888 } },
        graphics: { fixColorSpaces() {}, update() {}, render() { g.rendered = (g.rendered || 0) + 1; } },
        snapAtmosphere() {}
    });
    g.scene.fog = new THREE.FogExp2(0xffffff, 0.001);
    return g;
}

// Every geometry and material under a group, each watched for its dispose event
function watch(group) {
    const freed = new Set(), held = new Set();
    group.traverse((o) => {
        const items = [o.geometry, ...(Array.isArray(o.material) ? o.material : [o.material])].filter(Boolean);
        items.forEach((item) => {
            if (held.has(item)) return;
            held.add(item);
            item.addEventListener('dispose', () => freed.add(item));
        });
    });
    return { held, freed };
}

const showcaseObjects = g => [...Object.values(g.showcaseBikes || {}).map(v => v.group), ...(g.showcaseExtras || [])];

describe('the rider on the menu\'s stage', () => {
    let g;
    beforeEach(() => {
        g = menuGame();
        frames.length = 0;
    });

    test('each rider stands on the stage once, on their chosen bike, in their chosen outfit', () => {
        g.startRiderShowcase(CHARACTERS[0].id);
        expect(Object.keys(g.showcaseBikes).sort()).toEqual(CHARACTERS.map(c => c.id).sort());
        for (const c of CHARACTERS) {
            const v = g.showcaseBikes[c.id];
            expect([c.id, v.model]).toEqual([c.id, g.tourSystem.getSelectedBike(c.id)]);
            expect(g.scene.children).toContain(v.group);
        }
        expect(g.showcaseFocusId).toBe(CHARACTERS[0].id);
        g.focusRiderShowcase(CHARACTERS[1].id);
        expect(g.showcaseFocusId).toBe(CHARACTERS[1].id);
    });

    test('a bike or an outfit chosen: that rider\'s bike is built again, once, and the one it replaces is freed', () => {
        const rider = CHARACTERS.find(c => Array.isArray(c.bikes) && c.bikes.length > 1 && Array.isArray(c.outfits) && c.outfits.length > 1);
        g.startRiderShowcase(rider.id);
        const others = Object.entries(g.showcaseBikes).filter(([id]) => id !== rider.id).map(([, v]) => v);
        const old = g.showcaseBikes[rider.id];
        const { held, freed } = watch(old.group);
        // (a part another bike on the stage still wears is not freed under it)
        const shared = new Set();
        others.forEach(v => v.group.traverse(o => [o.geometry, ...(Array.isArray(o.material) ? o.material : [o.material])].filter(Boolean).forEach(i => shared.add(i))));
        g.tourSystem.selectBike(rider.id, rider.bikes[1]);
        g.changeShowcaseBike(rider.id);
        const now = g.showcaseBikes[rider.id];
        expect(now).not.toBe(old);
        expect(now.model).toBe(rider.bikes[1]);
        expect(g.scene.children).not.toContain(old.group);
        expect(g.scene.children.filter(o => o === now.group)).toHaveLength(1);
        const left = [...held].filter(item => !freed.has(item) && !shared.has(item) && !isUsed(now.group, item));
        expect(left).toEqual([]);

        g.tourSystem.selectOutfit(rider.id, rider.outfits[1].id);
        g.changeShowcaseBike(rider.id);
        expect(g.showcaseBikes[rider.id].outfit.id).toBe(rider.outfits[1].id);
    });

    test('the bike is framed in the stage box: the view is shifted to the box\'s centre, the camera as far off as the box needs', () => {
        g.startRiderShowcase(CHARACTERS[0].id);
        frames.shift()();
        const want = HomeStage.frame({ x: 0, y: 0, w: 600, h: 600 }, { w: 1000, h: 600 }, Game.SHOWCASE_FOV);
        expect(g.camera.view.enabled).toBe(true);
        expect(g.camera.view.offsetX).toBeCloseTo(want.offsetX);
        expect(g.camera.fov).toBe(Game.SHOWCASE_FOV);
        const target = g.showcaseBikes[CHARACTERS[0].id].position;
        expect(Math.hypot(g.camera.position.x - target.x, g.camera.position.z - target.z)).toBeCloseTo(want.distance, 5);
        // The focused bike's centre lands at the stage box's centre on screen
        g.camera.updateMatrixWorld();
        const p = new THREE.Vector3(target.x, target.y + 0.7, target.z).project(g.camera);
        expect((p.x + 1) / 2 * 1000).toBeCloseTo(300, 0);
        // No box in view (a phone's map): nothing is drawn
        const drawn = g.rendered;
        stageBox.width = 0;
        frames.shift()();
        expect(g.rendered).toBe(drawn);
        stageBox.width = 600;
    });

    test('the menu closes: every bike, stand and floor leaves the scene, all they held is freed, and the view is whole again', () => {
        g.startRiderShowcase(CHARACTERS[0].id);
        frames.shift()();
        const objects = showcaseObjects(g);
        const watched = objects.map(watch);
        g.endMenuShowcase();
        objects.forEach(o => expect(g.scene.children).not.toContain(o));
        watched.forEach(({ held, freed }) => expect([...held].filter(i => !freed.has(i))).toEqual([]));
        expect(g.showcaseBikes).toBe(null);
        expect(g.camera.view === null || g.camera.view.enabled === false).toBe(true);
        // Opened again: built again from nothing, the same once more
        g.startRiderShowcase(CHARACTERS[0].id);
        expect(Object.keys(g.showcaseBikes)).toHaveLength(CHARACTERS.length);
        g.endMenuShowcase();
        expect(g.scene.children.filter(o => o.isGroup || o.isMesh)).toEqual([]);
    });
});

function isUsed(group, item) {
    let used = false;
    group.traverse((o) => {
        if (o.geometry === item || o.material === item || (Array.isArray(o.material) && o.material.includes(item))) used = true;
    });
    return used;
}
