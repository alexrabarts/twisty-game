// The frozen phase 0 goldens are the definition of "unchanged" for the terrain
// work. Each leg is built through the real Environment constructor on real
// three r150 and compared with tests/golden/terrain-baseline.json, which
// tools/terrain-check.mjs record-jest captured from untouched source.
import { readFileSync } from 'fs';
import { buildEnvironment, captureLeg, fingerprints, loadGame } from '../helpers/load-game.js';

const golden = JSON.parse(readFileSync(new URL('../golden/terrain-baseline.json', import.meta.url), 'utf8'));
const LEG_IDS = ['mountain-dawn', 'valley-run', 'coastal-descent', 'foggy-gorge', 'high-pass', 'storm-valley', 'night-ride', 'winter-pass'];

describe('terrain equivalence with the phase 0 golden', () => {
    let game;
    beforeAll(() => {
        game = loadGame();
    });

    test('the golden came from untouched game source', () => {
        expect(golden.provenance.gameSourceClean).toBe(true);
        expect(golden.legs).toHaveLength(8);
    });

    test('the leg table the golden was captured against is unchanged', () => {
        expect(new game.TourSystem().legs.map(leg => leg.id)).toEqual(LEG_IDS);
    });

    test.each(LEG_IDS.map((id, index) => [id, index]))('%s builds to the golden', (id, index) => {
        const captured = captureLeg(game, index);
        // Compared piece by piece so a failure names the quantity that moved
        expect(captured.randState).toBe(golden.legs[index].randState);
        expect(captured.fingerprints).toEqual(golden.legs[index].fingerprints);
        expect(captured.faceHashes).toEqual(golden.legs[index].faceHashes);
        expect(captured.decalCounts).toEqual(golden.legs[index].decalCounts);
        expect(captured.d6Entries).toBe(golden.legs[index].d6Entries);
        expect(captured.groundGrid).toEqual(golden.legs[index].groundGrid);
        expect(captured.grounded).toEqual(golden.legs[index].grounded);
    }, 30000);

    test('a build is repeatable, so a changed hash is a changed world', () => {
        const first = buildEnvironment(game, 0);
        const second = buildEnvironment(game, 0);
        expect(fingerprints(second.env, second.scene)).toEqual(fingerprints(first.env, first.scene));
    });

    test('every fingerprint mode reacts to a change of terrain', () => {
        const { env, scene } = buildEnvironment(game, 0);
        const clean = fingerprints(env, scene);
        const ribbon = scene.children
            .flatMap(child => [child, ...child.children])
            .find(object => object.isMesh && object.geometry.attributes.color && object.geometry.attributes.position.count === 12960);
        ribbon.geometry.attributes.position.array[1] += 0.5;
        const moved = fingerprints(env, scene);
        Object.keys(clean).forEach(mode => expect(moved[mode].hash).not.toBe(clean[mode].hash));
    });
});
