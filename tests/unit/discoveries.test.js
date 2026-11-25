// Discoveries in free roam (js/world/discoveries.js; .agent/system/world.md, "Free roam"): every open stopping place,
// every side road and the summit, each found once within its reach, the side roads once their rows are in, and kept
// in the store between rides (a store that throws keeps them for the ride only)
import { describe, test, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const { WorldDiscoveries } = new Function(`${readFileSync(`${root}js/world/discoveries.js`, 'utf8')}\nreturn { WorldDiscoveries };`)();

// A stand-in world: a straight ride north of 2 km, two places, one side road going east from s 1000 whose rows stream in
function world() {
    const route = { sample: (s, out = {}) => Object.assign(out, { x: 0, z: s, heading: 0 }) };
    const places = {
        list: [{ id: 'p1', kind: 'layby', s: 400 }, { id: 'p2', kind: 'viewpoint', s: 1500 }],
        stopAt: (place, slot, ground, out) => Object.assign(out, { s: place.s + 10, x: 5, z: place.s + 10 })
    };
    const graph = {
        loaded: false,
        junctions: [{ node: 7, passes: [{ sIn: 1000 }] }],
        sideStubs: () => new Map([[42, 7]]),
        chainFrom: (edge, node, len) => ({ rows: graph.loaded ? [{ x: 0, z: 1000 }, { x: len, z: 1000 }] : [] })
    };
    return { route, places, graph, startS: 0, endS: 2000, config: { id: 'test' } };
}
const memory = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) }; };

describe('discoveries', () => {
    test('the list: each place, each side road and the summit, named for the player', () => {
        const d = new WorldDiscoveries(world(), memory());
        expect(d.items.map(i => i.id)).toEqual(['place:p1', 'place:p2', 'side:42', 'summit']);
        expect(d.items.map(i => i.name)).toEqual(['Lay-by, km 0.4', 'Viewpoint, km 1.5', 'Side road, km 1.0', 'The summit']);
        expect(d.text()).toBe('Discoveries 0/4');
    });

    test('each is found once within its reach; a side road once its rows are in', () => {
        const env = world(), d = new WorldDiscoveries(env, memory());
        const at = (x, z) => d.step(x, z, 1);
        expect(at(5 + WorldDiscoveries.RULE.placeM + 1, 410)).toBe(null);
        expect(at(5, 410).id).toBe('place:p1');
        expect(at(5, 410)).toBe(null);
        expect(at(150, 1000)).toBe(null);
        env.graph.loaded = true;
        expect(at(150, 1000).id).toBe('side:42');
        expect(at(0, 2000).id).toBe('summit');
        expect(d.text()).toBe('Discoveries 3/4');
    });

    test('kept between rides in the store; a store that throws keeps them for the ride', () => {
        const store = memory();
        new WorldDiscoveries(world(), store).step(5, 410, 1);
        expect(new WorldDiscoveries(world(), store).count).toBe(1);
        const broken = { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); } };
        const d = new WorldDiscoveries(world(), broken);
        expect(d.step(5, 410, 1).id).toBe('place:p1');
        expect(d.count).toBe(1);
    });
});
