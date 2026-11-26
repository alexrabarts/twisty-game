// What the menu fetches (.agent/system/ui.md, "What the menu fetches"): the owner's order of 2026-11-26, "only load the
// high-res models in the menu screen". A cold menu asks for the rider file and the detail file of the one bike it
// shows, and nothing for the bikes it does not show; each step to a bike not shown before asks for that bike's detail
// file alone; a step back, or to another outfit of the same bike, asks for nothing. The real Vehicle, SceneAssets,
// BikeModels and TourSystem, and Game's own showcase methods on a plain object; fetch reads the files from disk.
// tools/menu-fetch-check.mjs holds the same in the browser, with the sizes and the world ride's start.
import { describe, test, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { Blob } from 'node:buffer';
import { TextDecoder } from 'node:util';
import { canvasStub, loadScript, realThree } from '../helpers/load-game.js';

const root = new URL('../../', import.meta.url);
const main = readFileSync(new URL('js/main.js', root), 'utf8');
const classSource = main.slice(0, main.indexOf('Game.SHOWCASE_TURN = 0.22;') + 'Game.SHOWCASE_TURN = 0.22;'.length);

function menu() {
    const THREE = realThree();
    const fetched = [];
    const fetch = async (url) => {
        fetched.push(url);
        const bytes = readFileSync(new URL(url, root));
        return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
    };
    const store = new Map();
    const storage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) };
    const sink = { log() {}, warn() {}, error() {} };
    const page = { querySelector: () => null, querySelectorAll: () => [], createElement: tag => canvasStub().createElement(tag) };
    const source = ['vehicle.js', 'sceneassets.js', 'bikemodels.js', 'tours.js'].map(loadScript).join('\n;\n');
    const parts = new Function('THREE', 'document', 'localStorage', 'console', 'fetch', 'Blob', 'TextDecoder', 'performance',
        `${source}\nreturn { Vehicle, CHARACTERS, BikeModels, TourSystem, BIKE_MODELS };`)(THREE, page, storage, sink, fetch, Blob, TextDecoder, performance);
    const Game = new Function('THREE', 'Vehicle', 'CHARACTERS', 'BikeModels', 'AtmosphereTrack', 'HomeStage', 'document', 'window', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance',
        `${classSource}\nreturn Game;`)(THREE, parts.Vehicle, parts.CHARACTERS, parts.BikeModels, { oneLook: () => ({}) }, undefined, page, { innerWidth: 1000, innerHeight: 600 }, () => 1, () => {}, performance);
    const tour = new parts.TourSystem({ unlockAll: true });
    const g = Object.assign(Object.create(Game.prototype), {
        scene: new THREE.Scene(),
        camera: new THREE.PerspectiveCamera(50, 1, 0.1, 1000),
        directionalLight: new THREE.DirectionalLight(),
        tourSystem: tour,
        timeConfigs: { golden: { fogColor: 0x888888 } },
        graphics: { fixColorSpaces() {}, update() {}, render() {} },
        snapAtmosphere() {}
    });
    g.scene.fog = new THREE.FogExp2(0xffffff, 0.001);
    return { g, tour, fetched, ...parts };
}

// Until every fetch asked for has arrived and been parsed
const settle = async () => { for (let i = 0; i < 50; i++) await new Promise(done => setTimeout(done, 0)); };
const bikeFiles = list => list.filter(url => url.startsWith('assets/bikes/'));

describe('the menu fetches the bike it shows, and only that bike', () => {
    test('a cold menu asks for the rider file and the shown bike\'s detail file; the other riders stand in with nothing fetched', async () => {
        const { g, tour, fetched, CHARACTERS, BikeModels } = menu();
        const first = tour.riderDisplayOrder()[0];
        g.startRiderShowcase(first.id);
        await settle();
        expect(bikeFiles(fetched).sort()).toEqual([BikeModels.file({ model: tour.getSelectedBike(first.id) }), BikeModels.RIDER].sort());
        expect(fetched.some(url => url.includes('/far/') || url === BikeModels.RIDER_FAR)).toBe(false);
        // Every rider stands on the stage, the shown one in its detail file
        expect(Object.keys(g.showcaseBikes)).toHaveLength(CHARACTERS.length);
        expect(g.showcaseBikes[first.id].modelled).toBe(true);
    });

    test('each step to a bike not shown before asks for that bike\'s detail file alone; a step back or an outfit asks for nothing', async () => {
        const { g, tour, fetched, BikeModels } = menu();
        const order = tour.riderDisplayOrder();
        const rider = order.find(c => Array.isArray(c.bikes) && c.bikes.length > 1 && Array.isArray(c.outfits) && c.outfits.length > 1);
        const other = order.find(c => c !== rider && BikeModels.file({ model: tour.getSelectedBike(c.id) }) !== BikeModels.file({ model: tour.getSelectedBike(rider.id) }));
        g.startRiderShowcase(rider.id);
        await settle();
        const count = () => bikeFiles(fetched).length;
        let before = count();
        const step = async (work, files) => {
            work();
            await settle();
            expect(bikeFiles(fetched.slice(before))).toEqual(files);
            before = count();
        };
        // Another bike of the same rider: one more file, that bike's
        await step(() => { tour.selectBike(rider.id, rider.bikes[1]); g.changeShowcaseBike(rider.id); }, [BikeModels.file({ model: rider.bikes[1] })]);
        // Back to the first bike: in the page's cache, nothing
        await step(() => { tour.selectBike(rider.id, rider.bikes[0]); g.changeShowcaseBike(rider.id); }, []);
        // Another outfit of the same bike: nothing
        await step(() => { tour.selectOutfit(rider.id, rider.outfits[1].id); g.changeShowcaseBike(rider.id); }, []);
        // Another rider: one more file, that rider's bike
        await step(() => g.focusRiderShowcase(other.id), [BikeModels.file({ model: tour.getSelectedBike(other.id) })]);
        // Back: nothing
        await step(() => g.focusRiderShowcase(rider.id), []);
        expect(g.showcaseBikes[rider.id].modelled).toBe(true);
    });
});
