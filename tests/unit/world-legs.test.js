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
const { WorldLegs, WorldData, WorldTour } = new Function(`${loadScript('world/tour.js')}\n${loadScript('world/data.js')}\n${loadScript('world/legs.js')}\nreturn { WorldLegs, WorldData, WorldTour };`)();

const store = (initial = null) => {
    const map = new Map(initial === null ? [] : [[WorldLegs.STORE, initial]]);
    return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v), map };
};

describe('the legs and their folders', () => {
    test('the tour is the list: its twelve legs in ride order, then the legs shipped before it', () => {
        expect(WorldLegs.LIST.filter(l => l.n).map(l => l.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
        expect(WorldLegs.LIST.filter(l => !l.planned && l.n).map(l => l.id)).toEqual(['airolo-lookout', 'lookout-andermatt', 'hospental-summit', 'summit-airolo']);
        expect(WorldLegs.LIST.slice(-2).map(l => l.id)).toEqual(['gotthard-north', 'tremola']);
        // (a group is a run of one pass: the tour comes back over the Gotthard at its end)
        expect(WorldLegs.groups().map(g => g.pass)).toEqual(['Gotthard', 'Schöllenen', 'Susten', 'Grimsel', 'Furka', 'Gotthard', 'Earlier legs']);
    });

    test('every built leg is a stage of the manifest in its own folder, and the Tremola stays in world/', () => {
        expect(WorldData.baseFor('tremola')).toBe('world/');
        expect(WorldData.baseFor('summit-airolo')).toBe('world/');
        expect(WorldData.baseFor('airolo-lookout')).toBe('worlds/airolo/');
        expect(WorldData.baseFor('all')).toBe('world/');
        for (const leg of WorldLegs.LIST.filter(l => !l.planned)) {
            const base = WorldData.baseFor(leg.id);
            const manifest = JSON.parse(fs.readFileSync(path.join(REPO, base, 'manifest.json'), 'utf8'));
            expect(manifest.stages.map(s => s.id)).toContain(leg.id);
        }
    });

    test('each leg of the tour starts at the stop where the built leg before it ended', () => {
        const stopOf = (leg, role) => {
            const manifest = JSON.parse(fs.readFileSync(path.join(REPO, leg.folder, 'manifest.json'), 'utf8'));
            const stage = manifest.stages.find(s => s.id === leg.id);
            const id = role === 'start' ? (stage.startStop || manifest.stops.find(s => s.stage === leg.id && s.at === 'start').id) : (stage.endStop || manifest.stops.find(s => s.stage === leg.id && s.at === 'end').id);
            return manifest.stops.find(s => s.id === id);
        };
        const built = WorldTour.built();
        // (the loop closes: the last leg ends where the first starts)
        for (let k = 0; k < built.length; k++) {
            const before = built[(k + built.length - 1) % built.length], leg = built[k];
            if (before.n + 1 !== leg.n && !(k === 0 && before.n === 12)) continue;
            const a = stopOf(before, 'end'), b = stopOf(leg, 'start');
            expect([leg.id, Math.hypot(a.x - b.x, a.z - b.z) < 30]).toEqual([leg.id, true]);
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
    test('a new rider: leg 1 and the earlier legs are open; leg 1 finished, leg 2 is offered next', () => {
        const s = store();
        expect(WorldLegs.isOpen('airolo-lookout', { storage: s })).toBe(true);
        expect(WorldLegs.isOpen('lookout-andermatt', { storage: s })).toBe(false);
        expect(WorldLegs.isOpen('gotthard-north', { storage: s })).toBe(true);
        expect(WorldLegs.isOpen('tremola', { storage: s })).toBe(true);
        expect(WorldLegs.isOpen('tour-3', { unlockAll: true, storage: s })).toBe(false);
        expect(WorldLegs.suggested({ storage: s })).toBe('airolo-lookout');
        expect(WorldLegs.markFinished('airolo-lookout', s)).toBe(true);
        expect(WorldLegs.markFinished('airolo-lookout', s)).toBe(false);
        expect(WorldLegs.suggested({ storage: s })).toBe('lookout-andermatt');
        // (leg 11 opens after the last built leg before it: leg 2, until legs 3 to 10 are built)
        expect(WorldLegs.find('hospental-summit').opensAfter).toBe('lookout-andermatt');
    });

    test('a leg that opens after another stays shut until that leg is finished', () => {
        const leg = { id: 'later', pass: 'Gotthard', name: 'Later', km: 1, note: '', from: 'A', to: 'B', opensAfter: 'gotthard-north' };
        const list = WorldLegs.LIST;
        WorldLegs.cached = [...list, leg];
        try {
            const s = store();
            expect(WorldLegs.isOpen('later', { storage: s })).toBe(false);
            WorldLegs.markFinished('gotthard-north', s);
            expect(WorldLegs.isOpen('later', { storage: s })).toBe(true);
            expect(WorldLegs.isOpen('later', { unlockAll: true, storage: store() })).toBe(true);
        } finally { WorldLegs.cached = list; }
    });

    test('debug mode opens every leg and saves nothing; unreadable progress starts from leg 1', () => {
        expect(WorldLegs.isOpen('gotthard-north', { unlockAll: true, storage: store() })).toBe(true);
        expect(WorldLegs.finished(store('not json'))).toEqual([]);
        expect(WorldLegs.markFinished('nowhere', store())).toBe(false);
    });
});
