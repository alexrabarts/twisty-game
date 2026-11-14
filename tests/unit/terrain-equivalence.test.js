// The frozen phase 0 goldens are the definition of "unchanged" for the terrain
// work. Each leg is built through the real Environment constructor on real
// three r150 and compared with tests/golden/terrain-baseline.json, which
// tools/terrain-check.mjs record-jest captured from untouched source. The one
// declared difference is the decals (D5), so `full` must differ.
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

    // valley-run and storm-valley changed profile and road height in phase 4,
    // coastal-descent and winter-pass in phase 5, and foggy-gorge and night-ride
    // in phase 6, so the golden no longer describes them; the two cliff legs are
    // still bound by it (high-pass keeps its hairpins, its heights and its
    // unversioned board)
    const CHANGED = ['valley-run', 'storm-valley', 'coastal-descent', 'winter-pass', 'foggy-gorge', 'night-ride'];
    const BOUND = LEG_IDS.map((id, index) => [id, index]).filter(([id]) => !CHANGED.includes(id));

    test('exactly the six changed legs are released from the golden', () => {
        expect(BOUND.map(([, index]) => index)).toEqual([0, 4]);
    });

    test.each(CHANGED.map(id => [id, LEG_IDS.indexOf(id)]))('%s no longer builds to the golden', (id, index) => {
        const captured = captureLeg(game, index);
        // Different ground, different trees, different draws
        expect(captured.randState).not.toBe(golden.legs[index].randState);
        ['full', 'noDecal', 'stable'].forEach(mode => {
            expect(captured.fingerprints[mode].hash).not.toBe(golden.legs[index].fingerprints[mode].hash);
        });
        expect(captured.faceHashes).not.toEqual(golden.legs[index].faceHashes);
    }, 30000);

    test.each(BOUND)('%s builds to the golden', (id, index) => {
        const captured = captureLeg(game, index);
        // Compared piece by piece so a failure names the quantity that moved
        expect(captured.randState).toBe(golden.legs[index].randState);
        // The four decal placers read the drawn face now (declared delta D5):
        // only the decals move, so `full` differs and nothing else does
        const { full, ...rest } = captured.fingerprints;
        const { full: goldenFull, ...goldenRest } = golden.legs[index].fingerprints;
        expect(rest).toEqual(goldenRest);
        expect(full.hash).not.toBe(goldenFull.hash);
        expect(full.meshes).toBe(goldenFull.meshes);
        expect(captured.faceHashes).toEqual(golden.legs[index].faceHashes);
        expect(captured.decalCounts).toEqual(golden.legs[index].decalCounts);
        expect(captured.d6Entries).toBe(golden.legs[index].d6Entries);
        expect(captured.groundGrid).toEqual(golden.legs[index].groundGrid);
        expect(captured.grounded).toEqual(golden.legs[index].grounded);
    }, 30000);

    test('groundYAt grid: the heights the scenery and physics read', () => {
        const at = (env, segment, lateral) => {
            const point = env.roadPath[segment];
            return env.groundYAt(point.x + Math.cos(point.heading) * lateral, point.z - Math.sin(point.heading) * lateral);
        };
        const dawn = buildEnvironment(game, 0).env;
        expect(dawn.roadPath[10].y).toBeCloseTo(33.9288, 4);
        const dawnGrid = { '-40': 73.9288, '-20': 46.7288, '-13': 35.5288, 13: 32.5331, 20: 22.7634, 34: 4.8271, 40: -2.4664, 80: -56.1025, 200: -200 };
        Object.entries(dawnGrid).forEach(([lateral, y]) => expect(at(dawn, 10, Number(lateral))).toBeCloseTo(y, 4));

        const pass = buildEnvironment(game, 4).env;
        expect(pass.roadPath[332].y).toBeCloseTo(27.6484, 4);
        const passGrid = { '-11.5': 30.0484, 11.5: 25.5521, 20: 13.7306, 80: -64.6008 };
        Object.entries(passGrid).forEach(([lateral, y]) => expect(at(pass, 332, Number(lateral))).toBeCloseTo(y, 4));
    });

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
