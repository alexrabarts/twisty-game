// The whole built scene of each leg, and the vertex colours of its ribbon, in
// node (procedural dressing only; modelled assets are pinned by the `scene`
// probe of tools/terrain-check.mjs). A builder refactor that moves one
// instance, one vertex colour or one random draw changes a hash here.
import { describe, test, expect, beforeAll } from '@jest/globals';
import { createHash } from 'node:crypto';
import { loadGame, buildEnvironment, fingerprints, ribbonMeshes } from '../helpers/load-game.js';

// storm-valley, night-ride and winter-pass have roadworks: since ac6508b their dozer and works truck are one
// vertex-coloured mesh each (and the truck's beacon), where they were five and seven boxes, so each of those legs
// has 9 meshes fewer and a new hash. The ribbon colours did not change.
const PINS = [
    ['valley-run', '4e45e7c3ef41f628', 527, 'f31bf570a7f834af'],
    ['coastal-descent', 'ceb9e603923427cb', 444, '57f9dfd74f8a2e57'],
    ['foggy-gorge', '3aee9006530f255d', 461, 'f1f6c992da342ff5'],
    ['high-pass', '97829027766d1adc', 758, '4f5d43cafd55b407'],
    ['storm-valley', 'cd3d7cf34c4f5e92', 382, '93f4dd5bd083cfc1'],
    ['night-ride', '4625dccb25dce01a', 384, '13dbcb34cd620146'],
    ['winter-pass', 'bb497e1d7137e30f', 376, '5d5daa1355109534']
];

describe('the built scene, per leg', () => {
    let game;
    beforeAll(() => {
        game = loadGame();
    });

    test.each(PINS.map((pin) => [...pin, ['mountain-dawn', 'valley-run', 'coastal-descent', 'foggy-gorge', 'high-pass', 'storm-valley', 'night-ride', 'winter-pass'].indexOf(pin[0])]))('%s keeps its scene hash and ribbon colour', (id, full, meshes, colour, index) => {
        const quiet = console.log;
        console.log = () => {};
        let built;
        try {
            built = buildEnvironment(game, index);
        } finally {
            console.log = quiet;
        }
        const { env, scene, leg } = built;
        expect(leg.id).toBe(id);
        const prints = fingerprints(env, scene);
        expect(prints.full.hash).toBe(full);
        expect(prints.full.meshes).toBe(meshes);
        const hash = createHash('sha256');
        for (const mesh of ribbonMeshes(env)) {
            const attribute = mesh.geometry.attributes.color;
            if (attribute) hash.update(Buffer.from(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength));
        }
        expect(hash.digest('hex').slice(0, 16)).toBe(colour);
    });
});
