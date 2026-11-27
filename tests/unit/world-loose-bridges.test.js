/**
 * @jest-environment node
 */
// The importer keeps no bridge whose end is a dead end (tools/world/graph.mjs looseKept): in the source an old road's
// bridge is a motor road while the paths that lead to it stay out, and the bridge alone was drawn as a deck in the air
import { describe, test, expect } from '@jest/globals';
import { looseKept } from '../../tools/world/graph.mjs';

const ride = [{ a: 0, b: 1 }, { a: 1, b: 2 }];
const e = (a, b, structure = 'Keine') => ({ a, b, structure });

describe('looseKept', () => {
    test('a bridge with a dead end goes; a bridge between two roads and a dead-end road stay', () => {
        const side = [e(1, 3), e(3, 4, 'Bruecke'), e(4, 7), e(5, 6, 'Bruecke')];
        expect(looseKept(ride, side, 10)).toEqual([e(1, 3), e(3, 4, 'Bruecke'), e(4, 7)]);
    });

    test('a bridge ending in the air goes and the road before it stays', () => {
        const side = [e(2, 10), e(10, 11, 'Bruecke'), e(11, 12), e(12, 13, 'Bruecke')];
        const kept = looseKept(ride, side, 14);
        expect(kept).toEqual([e(2, 10), e(10, 11, 'Bruecke'), e(11, 12)]);
    });

    test('a chain of bridges ending in the air goes whole; a road the corridor cut off stays', () => {
        const side = [e(2, 20, 'Bruecke'), e(20, 21, 'Bruecke'), e(30, 31)];
        expect(looseKept(ride, side, 32)).toEqual([e(30, 31)]);
    });
});
