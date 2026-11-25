/**
 * @jest-environment node
 */
// The world's legs on the menu (js/world/legs.js) and the data folder of each (WorldData.baseFor): the order, the
// unlocks, the saved progress, and that every leg names a stage its folder's manifest holds.
import { describe, test, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadScript } from '../helpers/load-game.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { WorldLegs, WorldData } = new Function(`${loadScript('world/data.js')}\n${loadScript('world/legs.js')}\nreturn { WorldLegs, WorldData };`)();

const store = (initial = null) => {
    const map = new Map(initial === null ? [] : [[WorldLegs.STORE, initial]]);
    return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v), map };
};

describe('the legs and their folders', () => {
    test('the run-in from the north over the summit to the lookout is leg 1, the Tremola after it', () => {
        expect(WorldLegs.LIST.map(l => l.id)).toEqual(['gotthard-north', 'tremola']);
        expect(WorldLegs.groups().map(g => g.pass)).toEqual(['Gotthard']);
    });

    test('every leg is a stage of the manifest in its own folder, and the Tremola stays in world/', () => {
        expect(WorldData.baseFor('tremola')).toBe('world/');
        expect(WorldData.baseFor('all')).toBe('world/');
        for (const leg of WorldLegs.LIST) {
            const base = WorldData.baseFor(leg.id);
            const manifest = JSON.parse(fs.readFileSync(path.join(REPO, base, 'manifest.json'), 'utf8'));
            expect(manifest.stages.map(s => s.id)).toContain(leg.id);
        }
    });

    test('a shipped folder read by its stage is not overridden, so it may be trusted; a folder elsewhere is not', () => {
        expect(WorldData.resolveBase(null, 'gotthard-north')).toEqual({ base: 'worlds/gotthard/', overridden: false });
        expect(WorldData.resolveBase('worlds/gotthard')).toEqual({ base: 'worlds/gotthard/', overridden: false });
        expect(WorldData.resolveBase('worlds/other')).toEqual({ base: 'worlds/other/', overridden: true });
        expect(WorldData.resolveBase('worlds/../world')).toMatchObject({ error: expect.any(String) });
    });
});

describe('which legs are open', () => {
    test('a new rider: leg 1 and the Tremola are open; leg 1 finished, the Tremola is offered next', () => {
        const s = store();
        expect(WorldLegs.isOpen('gotthard-north', { storage: s })).toBe(true);
        expect(WorldLegs.isOpen('tremola', { storage: s })).toBe(true);
        expect(WorldLegs.suggested({ storage: s })).toBe('gotthard-north');
        expect(WorldLegs.markFinished('gotthard-north', s)).toBe(true);
        expect(WorldLegs.markFinished('gotthard-north', s)).toBe(false);
        expect(WorldLegs.suggested({ storage: s })).toBe('tremola');
    });

    test('a leg that opens after another stays shut until that leg is finished', () => {
        const leg = { id: 'later', pass: 'Gotthard', name: 'Later', km: 1, note: '', from: 'A', to: 'B', opensAfter: 'gotthard-north' };
        WorldLegs.LIST.push(leg);
        try {
            const s = store();
            expect(WorldLegs.isOpen('later', { storage: s })).toBe(false);
            WorldLegs.markFinished('gotthard-north', s);
            expect(WorldLegs.isOpen('later', { storage: s })).toBe(true);
            expect(WorldLegs.isOpen('later', { unlockAll: true, storage: store() })).toBe(true);
        } finally { WorldLegs.LIST.pop(); }
    });

    test('debug mode opens every leg and saves nothing; unreadable progress starts from leg 1', () => {
        expect(WorldLegs.isOpen('gotthard-north', { unlockAll: true, storage: store() })).toBe(true);
        expect(WorldLegs.finished(store('not json'))).toEqual([]);
        expect(WorldLegs.markFinished('nowhere', store())).toBe(false);
    });
});
