// The edge furniture's styles (js/world/edgestyles.js): a table as data, the located references and the region rule.
//   - every style has a family, the edges it may guard and, where Scenery draws it, a piece that exists; every link
//     named exists
//   - a place within the radius of a reference takes its family; the shipped slice is far from all of them and takes
//     the alpine mix, the same for the same seed
//   - a wall is never left with nothing on it (a stoned wall has lost its parapet), and a style is only chosen for an
//     edge it may guard
import { describe, test, expect } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';

const { EdgeStyles } = loadGame();
const S = EdgeStyles.STYLES;
// The shipped world's LV95 origin (world/manifest.json)
const TREMOLA = { e0: 2688000, n0: 1165000 };

describe('the table', () => {
    test('every style is whole: a family, the edges it guards, a piece that exists or none, a link that exists or none', () => {
        for (const [id, style] of Object.entries(S)) {
            expect([id, typeof style.family]).toEqual([id, 'string']);
            expect(style.guards.length).toBeGreaterThan(0);
            for (const edge of style.guards) expect(['drop', 'hairpin', 'wall']).toContain(edge);
            if (style.piece) expect(EdgeStyles.PIECES[style.piece]).toBeTruthy();
            if (style.link) expect(style.link in EdgeStyles.LINKS).toBe(true);
            expect(style.step).toBeGreaterThanOrEqual(1);
        }
        // The owner's photos: delineator posts, tall blocks on a kerb, short blocks without, a guardrail, a timber
        // fence, a tube railing on a wall, the parapets, and none
        for (const id of ['posts', 'granite', 'short', 'guardrail', 'timber', 'tubes', 'parapet', 'none']) expect(S[id]).toBeTruthy();
        // The marker stones are shorter than the 0.68 m they were
        expect(EdgeStyles.PIECES.granite.size[1]).toBeLessThan(0.6);
        expect(EdgeStyles.PIECES.short.size[1]).toBeLessThan(0.45);
    });

    test('the references are places with a style each, coordinates only', () => {
        expect(EdgeStyles.REFERENCES.length).toBe(6);
        for (const [lat, lon, style] of EdgeStyles.REFERENCES) {
            expect(lat).toBeGreaterThan(45);
            expect(lat).toBeLessThan(48);
            expect(lon).toBeGreaterThan(5);
            expect(lon).toBeLessThan(11);
            expect(S[style]).toBeTruthy();
        }
    });
});

describe('the region rule', () => {
    test('near a reference its family stands; the shipped slice is outside every radius (its summit 6.3 km from the nearest) and takes the mix', () => {
        for (const [lat, lon, style] of EdgeStyles.REFERENCES) {
            // (at the place itself: two references stand within a kilometre of each other)
            const at = { lat, lon };
            expect(EdgeStyles.family(at)).toBe(S[style].family);
            for (const edge of ['drop', 'hairpin', 'wall']) {
                const id = EdgeStyles.pick(edge, at, 0.37);
                expect(S[id].guards).toContain(edge);
                if (edge !== 'wall' && S[style].guards.includes(edge)) expect(S[id].family).toBe(S[style].family);
            }
        }
        // The slice's start and its summit (the ride's first chunk and its landmark, in world metres)
        for (const [x, z] of [[1000, 11250], [-1927, 7937]]) {
            const at = EdgeStyles.latLon(TREMOLA, x, z);
            expect(at.lat).toBeGreaterThan(46.4);
            expect(at.lat).toBeLessThan(46.7);
            expect(EdgeStyles.family(at)).toBe(null);
            expect(Math.min(...EdgeStyles.REFERENCES.map(([lat, lon]) => EdgeStyles.km(at, { lat, lon })))).toBeGreaterThan(EdgeStyles.REGION.radiusKm);
        }
    });

    test('the mix: the same seed the same style, every style for its edges in it, none on a wall', () => {
        for (const edge of ['drop', 'hairpin', 'wall']) {
            const chosen = new Set();
            for (let i = 0; i < 400; i++) {
                const seed = (i + 0.5) / 400, id = EdgeStyles.pick(edge, null, seed);
                expect(EdgeStyles.pick(edge, null, seed)).toBe(id);
                expect(S[id].guards).toContain(edge);
                expect(S[id].piece).toBeTruthy();
                chosen.add(id);
            }
            const want = Object.keys(S).filter(id => (S[id].weight[edge] || 0) > 0);
            expect([...chosen].sort()).toEqual(want.sort());
        }
    });
});
