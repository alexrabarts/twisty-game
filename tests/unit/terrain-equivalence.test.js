// The frozen phase 0 goldens are the definition of "unchanged" for the terrain
// work. Each leg is built through the real Environment constructor on real
// three r150 and compared with tests/golden/terrain-baseline.json, which
// tools/terrain-check.mjs record-jest captured from untouched source. The one
// declared differences are the decals (D5) and, on high-pass, the one cliff leg
// still bound, the exact left wall (D6). Mountain-dawn was bound too until it
// became the open valley (trackVersion 2); its bindings moved to high-pass.
import { readFileSync } from 'fs';
import { D6_CLASSES, LATERALS, buildEnvironment, captureLeg, fingerprints, groundedRecords, loadSharedGame as loadGame, rayDown, ribbonMeshes } from '../helpers/load-game.js';
// Leg 1 is a converted leg now: these tests are of the shared course, with leg 1 put back on it (Course.release)

const golden = JSON.parse(readFileSync(new URL('../golden/terrain-baseline.json', import.meta.url), 'utf8'));
const LEG_IDS = ['mountain-dawn', 'valley-run', 'coastal-descent', 'foggy-gorge', 'high-pass', 'storm-valley', 'night-ride', 'winter-pass'];

// The golden leg 5 stable fingerprint without its 108 hairpin stripe meshes: one registry, shared with the browser probe
const AMENDED_LEG5_STABLE = JSON.parse(readFileSync(new URL('../golden/amendments.json', import.meta.url), 'utf8'))['high-pass'].jestStable;

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
    // coastal-descent and winter-pass in phase 5, foggy-gorge and night-ride in
    // phase 6, and mountain-dawn (now the open valley) in the follow-up, so the
    // golden no longer describes them; high-pass is still bound by it (it keeps
    // its hairpins, its heights and its unversioned board)
    const CHANGED = ['mountain-dawn', 'valley-run', 'storm-valley', 'coastal-descent', 'winter-pass', 'foggy-gorge', 'night-ride'];
    const BOUND = LEG_IDS.map((id, index) => [id, index]).filter(([id]) => !CHANGED.includes(id));

    test('exactly the seven changed legs are released from the golden', () => {
        expect(BOUND.map(([, index]) => index)).toEqual([4]);
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

    // Declared delta D6: the left wall is exact, so what rests on it follows the drawn
    // wall. The two cliff legs are bound by everything D6 does not touch.
    const PLANT = /^(construction bulldozer|construction barrier|work truck)/;
    const isClass = label => D6_CLASSES.some(pattern => pattern.test(label));
    // Declared delta S1: no sign, post or marker reaches into a wall band
    // (tests/unit/signs.test.js). On high-pass the wall-side posts and chevrons
    // stand nearer the road edge, the warning boards stand on the drop side and
    // the finish gantry's poles stand 0.8 m past each edge, its banner narrower
    // with them. They move across the road's line only, never along it.
    const SIGN_CLEAR = /^(delineator post left|curve post|chevron marker|hairpin warning sign|construction sign|finish banner gantry)/;

    test.each(BOUND)('%s builds to the golden, apart from declared delta D6', (id, index) => {
        const captured = captureLeg(game, index);
        const record = golden.legs[index];
        // Compared piece by piece so a failure names the quantity that moved
        expect(captured.randState).toBe(record.randState);
        expect(captured.faceHashes).toEqual(record.faceHashes);
        expect(captured.decalCounts).toEqual(record.decalCounts);
        // The roadworks plant (bulldozer, one barrier, work truck) is no longer built up the wall
        expect(captured.d6Entries).toBe(record.d6Entries - 3);
        // D5 moved the decals, D6 moves the left-wall rocks and the plant: every whole-scene hash moves
        expect(captured.fingerprints.full.hash).not.toBe(record.fingerprints.full.hash);
        expect(captured.fingerprints.noDecal.hash).not.toBe(record.fingerprints.noDecal.hash);
    }, 30000);

    test('stable: nothing D6 does not touch has moved on high-pass', () => {
        // Leg 5: each of the 36 hairpin barriers carries three stripe meshes
        // (BoxGeometry 0.5 x 1.2 x 0.51). They were loose scene meshes in the
        // golden and are children of their barrier now, so they ride with it and
        // the stable mode skips them with it: that is 108 meshes fewer. The
        // golden's stable hash therefore cannot equal this one. What binds the
        // rest of the scene is the golden build's own stable hash with those
        // same 108 meshes left out: AMENDED_LEG5_STABLE, captured by building
        // leg 5 from the 6c525be sources (git archive js, with the loader of
        // e44721d) and skipping every BoxGeometry(0.5, 1.2, 0.51) mesh.
        const { env, scene } = buildEnvironment(game, 4);
        const barriers = env.groundedObjects.filter(({ label }) => /^hairpin barrier/.test(label));
        expect(barriers).toHaveLength(36);
        let stripes = 0;
        barriers.forEach(({ object }) => {
            expect(object.children.map(child => child.geometry.parameters.width)).toEqual([0.5, 0.5, 0.5]);
            // Local y 0: each stripe stands exactly where its barrier is grounded
            object.children.forEach(child => expect(child.position.y).toBe(0));
            stripes += object.children.length;
        });
        expect(stripes).toBe(108);
        expect(golden.legs[4].fingerprints.stable.meshes - stripes).toBe(AMENDED_LEG5_STABLE.meshes);
        expect(fingerprints(env, scene).stable).toEqual(AMENDED_LEG5_STABLE);
    }, 30000);

    test.each(BOUND)('%s: D6 moves only the left-wall rocks and the wall-side hairpin barriers, and builds three fewer props', (id, index) => {
        const { env, scene } = buildEnvironment(game, index);
        const halfRoad = env.roadWidth / 2;
        const now = groundedRecords(env);
        const before = golden.legs[index].grounded.filter(({ label }) => !PLANT.test(label));
        // The same objects, in the same order, less the three plant items
        expect(golden.legs[index].grounded.length - before.length).toBe(3);
        expect(now.map(r => r.label)).toEqual(before.map(r => r.label));

        const ribbons = ribbonMeshes(env);
        ribbons.forEach(mesh => { mesh.material.side = game.THREE.DoubleSide; });
        scene.updateMatrixWorld(true);
        // The lateral the ground model reads: from the nearest centre-line point
        const lateralOf = (x, z) => game.Terrain.locate(env.roadPath, x, z, 0, env.roadPath.length - 1, {}).lateral;

        let onWall = 0;
        now.forEach((record, n) => {
            const was = before[n];
            const same = record.position.every((v, k) => Math.abs(v - was.position[k]) < 1e-9);
            const [x, y, z] = was.position;
            if (SIGN_CLEAR.test(record.label)) {
                // Along the road the sign stands where it stood; only the gantry is rebuilt
                const p = env.roadPath[game.Terrain.locate(env.roadPath, x, z, 0, env.roadPath.length - 1, {}).index];
                const along = (v, w) => (v[0] - w[0]) * Math.sin(p.heading) + (v[2] - w[2]) * Math.cos(p.heading);
                expect(Math.abs(along(record.position, was.position))).toBeLessThan(0.01);
                if (!/^finish banner gantry/.test(record.label)) expect(record.hash).toBe(was.hash);
                return;
            }
            // Nothing is rebuilt: every object keeps its geometry
            expect(record.hash).toBe(was.hash);
            const moves = isClass(record.label);
            if (!moves) {
                // P23 (4): every object outside the D6 classes keeps its position
                expect(same).toBe(true);
                return;
            }
            // x and z never move; y moves up the wall, or not at all
            expect(Math.abs(record.position[0] - x)).toBeLessThan(1e-9);
            expect(Math.abs(record.position[2] - z)).toBeLessThan(1e-9);
            if (/^hairpin barrier/.test(record.label)) {
                expect(record.position[1] - y).toBeGreaterThanOrEqual(-1e-9);
                return;
            }
            // A rock on the wall rests on what is drawn there
            const lateral = lateralOf(x, z);
            if (lateral >= -(halfRoad + 2)) {
                expect(same).toBe(true);
            } else {
                // The wall's column walk meets the ribbon between two columns, so a rock
                // can sit up to a third of a metre off the surface a ray finds
                const hit = rayDown(game.THREE, ribbons, x, z);
                // (the rock at the very start of a leg stands just before the first drawn column)
                if (hit === null) return;
                expect(Math.abs(record.position[1] - hit)).toBeLessThanOrEqual(0.35);
                onWall++;
            }
        });
        // 38 or more of the cliff leg's left-wall rocks and clusters stand beyond the ledge
        expect(onWall).toBeGreaterThanOrEqual(38);

        // The obstacle list: a hairpin barrier's entry is where its mesh is
        env.roadworkObstacles.filter(o => o.type === 'hairpin_barrier').forEach(o => {
            const barrier = env.groundedObjects.find(({ object }) => Math.abs(object.position.x - o.position.x) < 1e-9 && Math.abs(object.position.z - o.position.z) < 1e-9);
            expect(Math.abs(barrier.object.position.y - o.position.y)).toBeLessThan(1e-9);
        });
        // And none of the three props has an entry
        expect(env.roadworkObstacles.map(o => o.type).filter(type => type !== 'hairpin_barrier').sort()).toEqual(['container', 'container']);
    }, 30000);

    test.each(BOUND)('%s: the ground grid is the golden\'s beside the road and the ledge, and the wall below it is what is drawn', (id, index) => {
        const captured = captureLeg(game, index);
        const grid = golden.legs[index].groundGrid;
        const halfRoad = 8;
        let changed = 0;
        captured.groundGrid.forEach((row, r) => {
            row.slice(1).forEach((y, k) => {
                const lateral = LATERALS[k];
                // Strictly beyond the ledge: the ledge's own edge is where the model switches
                if (lateral > -(halfRoad + 2)) expect(y).toBe(grid[r][k + 1]);
                else if (y !== grid[r][k + 1]) changed++;
            });
        });
        expect(changed).toBeGreaterThan(0);
    }, 30000);

    test('groundYAt grid: the heights the scenery and physics read', () => {
        const at = (env, segment, lateral) => {
            const point = env.roadPath[segment];
            return env.groundYAt(point.x + Math.cos(point.heading) * lateral, point.z - Math.sin(point.heading) * lateral);
        };
        // High-pass: beside the road, the ledge and the valley the golden's values; on the wall the drawn wall (D6)
        const pass = buildEnvironment(game, 4).env;
        expect(pass.roadPath[332].y).toBeCloseTo(27.6484, 4);
        const passGrid = { '-9.5': 27.6484, '-11.5': 32.9343, '-20': 44.2557, 11.5: 25.5521, 20: 13.7306, 80: -64.6008 };
        Object.entries(passGrid).forEach(([lateral, y]) => expect(at(pass, 332, Number(lateral))).toBeCloseTo(y, 4));
    });

    // A changed leg asserts what it now is, not only that it differs: every released leg is
    // here, on its own board (trackVersion 2); the forest legs draw no floor
    const NOW = [
        ['mountain-dawn', 'valleyFloor', ['floor-river'], ['runoff', 'wall'], ['runoff', 'wall']],
        ['valley-run', 'cliffLakeMirrored', ['floor-lake'], ['shoulder', 'fall'], ['shoulder', 'wall']],
        ['coastal-descent', 'coast', ['floor-sea'], ['shoulder', 'wall'], ['shoulder', 'fall']],
        ['foggy-gorge', 'canyon', ['floor-lake'], ['shoulder', 'wall'], ['shoulder', 'wall']],
        ['storm-valley', 'forest', [], ['runoff', 'wall'], ['runoff', 'wall']],
        ['night-ride', 'forest', [], ['runoff', 'wall'], ['runoff', 'wall']],
        ['winter-pass', 'ridge', ['floor-lake'], ['runoff', 'fall'], ['runoff', 'fall']]
    ];

    test('every changed leg has a positive record', () => {
        expect(NOW.map(([id]) => id).sort()).toEqual([...CHANGED].sort());
    });

    test.each(NOW)('%s is what it was changed to: profile, floor, band kinds and board', (id, profile, floors, left, right) => {
        const { env, scene } = buildEnvironment(game, LEG_IDS.indexOf(id));
        expect(env.terrain.id).toBe(profile);
        const drawn = [];
        scene.traverse(object => { if (object.userData && object.userData.part === 'floor') drawn.push(object.name); });
        expect(drawn).toEqual(floors);
        expect(env.terrain.left.bands.map(band => band.kind)).toEqual(left);
        expect(env.terrain.right.bands.map(band => band.kind)).toEqual(right);
        expect(game.Terrain.legConfig(id).trackVersion).toBe(2);
    }, 30000);

    test('high-pass keeps its unversioned board', () => {
        expect(game.Terrain.legConfig('high-pass').trackVersion).toBe(1);
    });

    test('a build is repeatable, so a changed hash is a changed world', () => {
        const first = buildEnvironment(game, 4);
        const second = buildEnvironment(game, 4);
        expect(fingerprints(second.env, second.scene)).toEqual(fingerprints(first.env, first.scene));
    });

    test('every fingerprint mode reacts to a change of terrain', () => {
        const { env, scene } = buildEnvironment(game, 4);
        const clean = fingerprints(env, scene);
        const [ribbon] = ribbonMeshes(env);
        ribbon.geometry.attributes.position.array[1] += 0.5;
        const moved = fingerprints(env, scene);
        Object.keys(clean).forEach(mode => expect(moved[mode].hash).not.toBe(clean[mode].hash));
    });
});
