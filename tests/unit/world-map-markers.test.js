/**
 * @jest-environment node
 */
// The group on the mini map (WorldGuide.markers; Game.groupOnMap hands it the riders): a dot for each rider of the
// group in that rider's own map colour (CHARACTERS `mapColor`), and a rider off the map held at its edge toward
// where it is. Every rule reads CHARACTERS, so a new rider needs only a colour.
import { describe, test, expect } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';

const game = loadGame(undefined, []);
const { CHARACTERS, WorldGuide } = game;
const SIZE = WorldGuide.MAP_SIZE, SPAN = WorldGuide.MAP_SPAN_M, INSET = WorldGuide.MARKER_INSET;
const rgb = n => [(n >> 16) & 255, (n >> 8) & 255, n & 255];
const apart = (a, b) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]));

describe('the group on the mini map', () => {
    test('every rider has a map colour, told apart from each other, from the player\'s arrow and from the ride', () => {
        const fixed = { arrow: 0xff4a3d, ride: 0xffd23f };
        for (const c of CHARACTERS) {
            expect(Number.isInteger(c.mapColor)).toBe(true);
            for (const other of CHARACTERS) if (other !== c) expect(apart(c.mapColor, other.mapColor)).toBeGreaterThan(80);
            for (const colour of Object.values(fixed)) expect(apart(c.mapColor, colour)).toBeGreaterThan(80);
            // Bright enough on the dark map
            expect(Math.max(...rgb(c.mapColor))).toBeGreaterThan(200);
        }
    });

    test('a rider on the map is a dot at its own place, north up, as the roads are drawn', () => {
        const at = { x: 1000, z: -2000 };
        const riders = CHARACTERS.slice(1).map((c, i) => ({ x: at.x + 100 * (i - 2), z: at.z - 50 * i, color: c.mapColor }));
        const marks = WorldGuide.markers(riders, at, SIZE, SPAN);
        expect(marks).toHaveLength(riders.length);
        marks.forEach((m, i) => {
            expect(m.edge).toBe(false);
            expect(m.x).toBeCloseTo(SIZE / 2 + (riders[i].x - at.x) * SIZE / SPAN, 9);
            expect(m.y).toBeCloseTo(SIZE / 2 + (riders[i].z - at.z) * SIZE / SPAN, 9);
            expect(m.color).toBe(`#${riders[i].color.toString(16).padStart(6, '0')}`);
        });
        // A rider to the north (z less) is higher on the map
        expect(marks[3].y).toBeLessThan(marks[1].y);
    });

    test('a rider off the map is held at its edge, toward where it is', () => {
        const at = { x: 0, z: 0 };
        const far = [{ x: 5000, z: 0, color: 1 }, { x: 0, z: -9000, color: 2 }, { x: -3000, z: 3000, color: 3 }, { x: SPAN / 2 - 1, z: 0, color: 4 }];
        const [east, north, southWest, nearEdge] = WorldGuide.markers(far, at, SIZE, SPAN);
        expect(east).toMatchObject({ edge: true, x: SIZE - INSET, y: SIZE / 2 });
        expect(north).toMatchObject({ edge: true, x: SIZE / 2, y: INSET });
        expect(southWest).toMatchObject({ edge: true, x: INSET, y: SIZE - INSET });
        // Inside the last pixels of the map it is held in too, so the dot is never cut by the frame
        expect(nearEdge.edge).toBe(true);
        for (const m of [east, north, southWest, nearEdge]) for (const v of [m.x, m.y]) {
            expect(v).toBeGreaterThanOrEqual(INSET);
            expect(v).toBeLessThanOrEqual(SIZE - INSET);
        }
    });

    test('no riders, or a rider with no place, draw nothing, and the list is used again', () => {
        const out = [];
        expect(WorldGuide.markers(undefined, { x: 0, z: 0 }, SIZE, SPAN, out)).toHaveLength(0);
        const two = WorldGuide.markers([{ x: 1, z: 1, color: 5 }, { x: NaN, z: 0, color: 6 }, { x: 2, z: 2, color: 7 }], { x: 0, z: 0 }, SIZE, SPAN, out);
        expect(two).toBe(out);
        expect(two).toHaveLength(2);
        const first = out[0];
        expect(WorldGuide.markers([{ x: 9, z: 9, color: 5 }], { x: 0, z: 0 }, SIZE, SPAN, out)[0]).toBe(first);
        expect(out).toHaveLength(1);
    });
});
