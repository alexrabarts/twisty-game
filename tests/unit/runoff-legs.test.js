// The legs with open run-off ground: the valley (mountain-dawn, which took the
// profile valley-run had in phase 4) and the forest (storm-valley). The
// profiles, their drawn ribbons, the trees and roadworks plant that stand on
// them, the gates that reach across them, the board ids, and the bike on them.
// Valley-run is the mirrored cliff now, the walled leg these are set against.
// Real modules on real three r150.
import { jest } from '@jest/globals';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { buildEnvironment, gameMethods, loadGame, loadScript, ribbonMeshes } from '../helpers/load-game.js';

const DT = 1 / 60;
const VALLEY = 0;
const FOREST = 5;
const CLIFF = 1;

// What each leg's course hashes to. A change to a road height, a band width, a
// run-off rate or where trees stand changes lap times, so it must change this
// value, and a changed value needs a new trackVersion (a new board). Every leg
// but high-pass is version 2; high-pass is version 1 and must never move. (Legs
// 1, 2 and 4 changed again under version 2 on this branch: no version 2 board
// had shipped to players yet.)
const COURSE_DIGESTS = [
    '062f790295a7e5d4', '5b41d6a35ad33203', '1d8e018d4b1500c6', 'dec5762639099e6c',
    'b5649303e1d76374', '5abc36dddb5df4ec', '461f8fb9e4ed5ad6', '4193062a49e547f3'
];

describe('run-off profiles (pure)', () => {
    // Loaded while the file is collected: the test tables below read the profiles
    const game = loadGame();
    const { Terrain } = game;

    const ctxFor = (halfRoad, roadY = 30, s = 7) => ({ halfRoad, roadY, column: 0, index: 7, s, pathLength: 744 });
    const runoffSides = () => [
        ['valley left', Terrain.profiles.valleyFloor.left, 10],
        ['valley right', Terrain.profiles.valleyFloor.right, 10],
        ['forest left', Terrain.profiles.forest.left, 8],
        ['forest right', Terrain.profiles.forest.right, 8]
    ];

    test.each(runoffSides())('%s: rows run outward from the road edge and sit on the stations', (name, side, halfRoad) => {
        const ctx = ctxFor(halfRoad);
        const rows = Array.from({ length: Terrain.ROWS + 1 }, (_, j) => Terrain.row(side, j, ctx, {}));
        expect(rows[0].d).toBe(halfRoad);
        expect(rows[0].y).toBe(30);
        rows.slice(1).forEach((row, n) => expect(row.d).toBeGreaterThan(rows[n].d));
        side.stations.forEach(([dPast]) => {
            expect(rows.some(row => Math.abs(row.d - (halfRoad + dPast)) < 1e-9)).toBe(true);
        });
    });

    test.each(runoffSides())('%s: the physics base equals the drawn row at every row, and is finite out to 400', (name, side, halfRoad) => {
        const ctx = ctxFor(halfRoad, 30, 7.25);
        for (let j = 0; j <= Terrain.ROWS; j++) {
            const row = Terrain.row(side, j, ctx, {});
            expect(Math.abs(side.base(row.d - halfRoad, 30, ctx.s) - row.y)).toBeLessThan(1e-9);
        }
        for (let d = 0; d <= 400; d++) expect(Number.isFinite(side.base(d, 30, 3.5))).toBe(true);
    });

    test('a side that does not end in an unbounded wall or fall is refused, so its rideable limit is finite', () => {
        const stations = [[0, 0], [10, 0]];
        const runoff = { drag: 0.35, grip: 0.5, floorSpeed: 6 };
        expect(() => Terrain.heightfieldSide({ stations, bands: [{ kind: 'runoff' }], runoff })).toThrow(/unbounded/);
        expect(() => Terrain.heightfieldSide({ stations, bands: [{ to: 5, kind: 'wall' }], runoff })).toThrow(/unbounded/);
        expect(() => Terrain.heightfieldSide({ stations: Array.from({ length: 37 }, (_, n) => [n, 0]), bands: [{ kind: 'wall' }], runoff })).toThrow(/at most 36/);
    });

    test('zones: run-off out to 35 (open valley) and 25 (forest) past the road edge, then a wall', () => {
        const valley = Terrain.profiles.valleyFloor;
        const kind = (profile, segment, lateral, halfRoad) => Terrain.zoneAt(profile, segment, lateral, halfRoad).kind;
        // Open country (the first 30% of leg 1)
        expect([0, 10, 10.01, 45, 45.01, -45, -45.01].map(l => kind(valley, 10, l, 10)))
            .toEqual(['road', 'road', 'runoff', 'runoff', 'wall', 'runoff', 'wall']);
        // The foothills: the run-off has narrowed to 14 on the left and 24 on the right
        expect([-24, -24.01, 34, 34.01].map(l => kind(valley, 80, l, 10))).toEqual(['runoff', 'wall', 'runoff', 'wall']);
        const forest = Terrain.profiles.forest;
        expect([8, 8.01, 33, 33.01, -33.01].map(l => kind(forest, 80, l, 8))).toEqual(['road', 'runoff', 'runoff', 'wall', 'wall']);
        expect(Terrain.zoneAt(valley, 10, 20, 10)).toMatchObject({ kind: 'runoff', sign: 1, start: 10 });
        expect(Terrain.zoneAt(valley, 10, 50, 10)).toMatchObject({ kind: 'wall', sign: 1, start: 45 });
        expect(Terrain.zoneAt(valley, 80, 40, 10)).toMatchObject({ kind: 'wall', sign: 1, start: 34 });
    });

    test('rideableLimit is the outer edge of the last shoulder or run-off band', () => {
        const limit = (profile, sign, halfRoad, segment = 80) => Terrain.rideableLimit(profile, segment, sign, halfRoad);
        const valley = Terrain.profiles.valleyFloor;
        expect([limit(valley, -1, 10, 10), limit(valley, 1, 10, 10)]).toEqual([45, 45]);
        expect([limit(valley, -1, 10), limit(valley, 1, 10)]).toEqual([24, 34]);
        expect([limit(Terrain.profiles.forest, -1, 8), limit(Terrain.profiles.forest, 1, 8)]).toEqual([33, 33]);
        // cliffLake: a 1 m shoulder before the wall, a 2 m ledge before the fall
        expect([limit(Terrain.profiles.cliffLake, -1, 10), limit(Terrain.profiles.cliffLake, 1, 10)]).toEqual([11, 12]);
    });

    test('a gate reaches the rideable limit plus 2 over run-off, and only the ledge beside a wall or fall', () => {
        const reach = (profile, sign, halfRoad, segment = 80) => Terrain.gateReach(profile, segment, sign, halfRoad);
        const valley = Terrain.profiles.valleyFloor;
        expect([reach(valley, -1, 10, 10), reach(valley, 1, 10, 10)]).toEqual([47, 47]);
        expect([reach(valley, -1, 10), reach(valley, 1, 10)]).toEqual([26, 36]);
        expect([reach(Terrain.profiles.forest, -1, 8), reach(Terrain.profiles.forest, 1, 8)]).toEqual([35, 35]);
        expect([reach(Terrain.profiles.cliffLake, -1, 10), reach(Terrain.profiles.cliffLake, 1, 10)]).toEqual([12, 12]);
    });

    test('water: a river keeps below the road, a lake is absolute, a forest has none', () => {
        expect(Terrain.waterLevel(Terrain.profiles.valleyFloor, 20)).toBe(17);
        expect(Terrain.waterLevel(Terrain.profiles.cliffLake, 20)).toBe(-200);
        expect(Terrain.waterLevel(Terrain.profiles.forest, 20)).toBeNull();
    });

    // Rows wider than half the tightest bend's radius would fold over on its inside
    test.each([
        ['valleyFloor', 10, 200],
        ['forest', 8, 181]
    ])('%s: no row reaches past half the tightest bend radius of its leg', (name, halfRoad, limit) => {
        const profile = Terrain.profiles[name];
        [profile.left, profile.right].forEach(side => {
            expect(Terrain.outermost(side, ctxFor(halfRoad))).toBeLessThanOrEqual(limit);
        });
    });

    test('every side ends in ground that rises well above the road, so no ribbon stops against the haze', () => {
        runoffSides().forEach(([, side]) => {
            for (const stations of [side.stations, side.closedStations].filter(Boolean)) {
                expect(stations[stations.length - 1][1]).toBeGreaterThanOrEqual(30);
            }
        });
        // And at every weight between, rolling ridge included
        const valley = Terrain.profiles.valleyFloor;
        for (let s = 0; s <= 89; s += 0.25) {
            [valley.left, valley.right].forEach(side => {
                expect(Terrain.row(side, Terrain.ROWS, ctxFor(10, 0, s), {}).y).toBeGreaterThanOrEqual(30);
            });
        }
    });

    test('road heights: gentle steps along the whole path, and the two leg shapes differ', () => {
        const legs = new game.TourSystem().legs;
        [VALLEY, FOREST].forEach(index => {
            const { profile } = Terrain.LEGS[index];
            const { startSegment, endSegment } = legs[index];
            const y = Array.from({ length: 744 }, (_, i) => Terrain.elevation(profile, i, startSegment, endSegment));
            y.slice(1).forEach((value, n) => expect(Math.abs(value - y[n])).toBeLessThanOrEqual(0.5));
            expect(y.every(Number.isFinite)).toBe(true);
        });
        expect(Terrain.elevation(Terrain.LEGS[VALLEY].profile, 0, 0, 69)).toBeCloseTo(12, 9);
        expect(Terrain.elevation(Terrain.LEGS[FOREST].profile, 414, 414, 509)).toBeCloseTo(34, 9);
    });

    describe('leg 1 closes in toward the mountains', () => {
        const valley = Terrain.profiles.valleyFloor;
        const sides = [['left', valley.left], ['right', valley.right]];
        const legs = new game.TourSystem().legs;

        test('one weight, from the leg\'s own range: open for the first 30%, closed from 80%, smooth between', () => {
            expect([legs[VALLEY].startSegment, legs[VALLEY].endSegment]).toEqual([0, 69]);
            const w = s => Terrain.closingAt(valley, s);
            for (let s = 0; s <= 0.3 * 69; s += 0.25) expect(w(s)).toBe(0);
            for (let s = 0.8 * 69; s <= 89; s += 0.25) expect(w(s)).toBe(1);
            for (let s = 0.25; s <= 89; s += 0.25) {
                expect(w(s)).toBeGreaterThanOrEqual(w(s - 0.25));
                // No step: at most 0.02 a column (0.25 of a segment)
                expect(w(s) - w(s - 0.25)).toBeLessThanOrEqual(0.02);
            }
            expect(w(0.55 * 69)).toBeCloseTo(0.5, 9);
            // A profile that keeps one shape never closes
            expect(Terrain.closingAt(Terrain.profiles.forest, 60)).toBe(0);
        });

        test.each(sides)('%s: at every weight the physics base equals the drawn row, and rows run outward', (name, side) => {
            for (const s of [0, 20.7, 30.25, 37.5, 44.75, 55.2, 69, 80]) {
                const ctx = ctxFor(10, 25, s);
                let previous = -Infinity;
                for (let j = 0; j <= Terrain.ROWS; j++) {
                    const row = Terrain.row(side, j, ctx, {});
                    expect(row.d).toBeGreaterThan(previous);
                    previous = row.d;
                    expect(Math.abs(side.base(row.d - 10, 25, s) - row.y)).toBeLessThan(1e-9);
                }
                expect(Terrain.row(side, 0, ctx, {})).toMatchObject({ d: 10, y: 25 });
            }
        });

        test.each(sides)('%s: every station of both shapes is a row at its own weight', (name, side) => {
            [[0, side.stations], [80, side.closedStations]].forEach(([s, stations]) => {
                const rows = Array.from({ length: Terrain.ROWS + 1 }, (_, j) => Terrain.row(side, j, ctxFor(10, 0, s), {}).d);
                stations.forEach(([dPast]) => expect(rows.some(d => Math.abs(d - (10 + dPast)) < 1e-9)).toBe(true));
            });
        });

        test.each(sides)('%s: slopes stay buildable and the run-off stays rideable at every weight', (name, side) => {
            for (let s = 0; s <= 89; s += 0.25) {
                const ctx = ctxFor(10, 0, s);
                const limit = Terrain.rideableLimit(valley, s, name === 'left' ? -1 : 1, 10);
                let previous = Terrain.row(side, 0, ctx, {});
                for (let j = 1; j <= Terrain.ROWS; j++) {
                    const row = Terrain.row(side, j, ctx, {});
                    const slope = Math.abs(row.y - previous.y) / (row.d - previous.d);
                    // About 50 degrees at the steepest foothill
                    expect(slope).toBeLessThanOrEqual(1.2);
                    // Inside the run-off (left of the river bank) the ground is near level
                    if (row.d <= Math.min(limit, 35)) expect(slope).toBeLessThanOrEqual(0.15);
                    previous = row;
                }
            }
        });

        test.each(sides)('%s: no row jumps between two columns (5 m along the road)', (name, side) => {
            for (let s = 0.25; s <= 89; s += 0.25) {
                for (let j = 0; j <= Terrain.ROWS; j++) {
                    const now = Terrain.row(side, j, ctxFor(10, 0, s), {});
                    const before = Terrain.row(side, j, ctxFor(10, 0, s - 0.25), {});
                    // No steeper along the road than the steepest slope across it
                    expect(Math.abs(now.y - before.y)).toBeLessThanOrEqual(1.2 * 5);
                    expect(Math.abs(now.d - before.d)).toBeLessThanOrEqual(1);
                }
            }
        });

        test('the left bank rises where the run-off ends, at every weight', () => {
            for (const s of [0, 30, 38, 45, 55, 80]) {
                const edge = Terrain.rideableLimit(valley, s, -1, 10) - 10;
                const at = d => valley.left.base(d, 0, s);
                expect(at(edge + 4)).toBeGreaterThan(at(edge) + 2);
            }
        });

        test('the river bed holds its place at every weight: the water is a fixed ribbon', () => {
            for (const s of [0, 30, 40, 50, 80]) {
                for (let d = 0; d <= 40; d += 0.5) expect(valley.right.base(d, 0, s)).toBeCloseTo(valley.right.base(d, 0, 0), 9);
                // Below the water (3 m under the road) from 27.5 to 38 past the edge only
                expect(valley.right.base(32, 0, s)).toBeLessThan(-3);
                expect(valley.right.base(26, 0, s)).toBeGreaterThan(-3);
                expect(valley.right.base(40, 0, s)).toBeGreaterThan(-3);
            }
        });

        test('the valley sides rise from low hills to foothills over 100 m high', () => {
            const top = (side, s) => side.base(150, 0, s);
            sides.forEach(([, side]) => {
                expect(top(side, 0)).toBeLessThan(25);
                expect(top(side, 80)).toBeGreaterThan(80);
            });
            // 50 m past the road edge the open meadow is still low and the foothill already high
            expect(valley.left.base(50, 0, 0)).toBeLessThan(4);
            expect(valley.left.base(50, 0, 80)).toBeGreaterThan(25);
        });

        test('no row reaches past half the tightest bend radius at any weight', () => {
            for (let s = 0; s <= 89; s += 0.25) {
                sides.forEach(([, side]) => expect(Terrain.outermost(side, ctxFor(10, 0, s))).toBeLessThanOrEqual(200));
            }
        });

        test('the road climbs out of the valley and meets leg 2 with no step', () => {
            const { profile } = Terrain.LEGS[VALLEY];
            const y = i => Terrain.elevation(profile, i, 0, 69);
            // Low through the open country, climbing through the middle
            expect(Math.max(...Array.from({ length: 21 }, (_, i) => y(i)))).toBeLessThan(15);
            expect(y(62) - y(20)).toBeGreaterThan(14);
            // From the end of the leg on, the road is leg 2's own, so the finish
            // and the 20 built segments past it are leg 2's road, and leg 2 starts where leg 1 ends
            const cliff = Terrain.LEGS[CLIFF].profile;
            for (let i = 69; i <= 89; i++) expect(y(i)).toBe(Terrain.elevation(cliff, i, 70, 149));
            expect(Math.abs(y(69) - Terrain.elevation(cliff, 70, 70, 149))).toBeLessThanOrEqual(0.5);
        });
    });

    // R5: the course guard
    function courseDigest(index) {
        const leg = new game.TourSystem().legs[index];
        const config = Terrain.LEGS[index];
        const { profile } = config;
        // Where a fall ends and how long its lip is change a fall's outcome, so they
        // are part of the course; a side that has neither hashes as it always did
        const side = s => ({
            flat: s.flat, bands: s.bands, runoff: s.runoff ?? null, stations: s.stations ?? null, undulation: s.undulation ?? null,
            ...(s.fallDepth !== undefined && { fallDepth: s.fallDepth }),
            ...(s.lipDepth !== undefined && { lipDepth: s.lipDepth }),
            // How tall a gorge wall stands and how much it swings (the mountain walls have no variation)
            ...(s.face && s.face.variation !== undefined && { wall: [s.face.height, s.face.variation] }),
            // A side that closes in along the leg: its other shape, and how far it has closed at each segment
            ...(s.closedStations && {
                closed: s.closedStations, roll: s.roll, wave: s.wave,
                closing: Array.from({ length: 744 }, (_, i) => Math.round(s.closing(i) * 1e6))
            })
        });
        const elevation = Array.from({ length: 744 }, (_, i) =>
            Math.round(Terrain.elevation(profile, i, leg.startSegment, leg.endSegment) * 1e6));
        return createHash('sha256').update(JSON.stringify({
            version: config.trackVersion,
            roadWidth: config.roadWidth,
            floor: profile.floor,
            trees: config.dressing.forest?.layout ?? null,
            ...(config.dressing.forest?.closed && { treesClosed: config.dressing.forest.closed }),
            elevation,
            left: side(profile.left),
            right: side(profile.right),
            // A side that changes along the leg, and where the roadworks plant stands
            ...(profile.spans && {
                spans: profile.spans.map(span => ({
                    from: span.from, to: span.to ?? null,
                    ...(span.type !== undefined && { type: span.type }),
                    ...(span.ceiling !== undefined && { ceiling: span.ceiling }),
                    left: span.left ? side(span.left) : null, right: span.right ? side(span.right) : null
                }))
            }),
            ...(config.plant && { plant: config.plant }),
            // A high pass's cairns and summit marker are solid, on the snowfield
            ...(config.dressing.pass && { pass: config.dressing.pass })
        })).digest('hex').slice(0, 16);
    }

    test('the course guard: each leg hashes to the value pinned for its track version', () => {
        // Print the new value when this fails on purpose, and bump trackVersion with it
        const actual = Terrain.LEGS.map((leg, index) => courseDigest(index));
        expect(actual).toEqual(COURSE_DIGESTS);
    });
});

describe('the run-off legs built', () => {
    let game;
    let log;
    const built = new Map();

    beforeAll(() => {
        log = [];
        game = loadGame(undefined, log);
    });

    function leg(index) {
        if (!built.has(index)) {
            log.length = 0;
            const result = buildEnvironment(game, index);
            built.set(index, { ...result, log: [...log] });
        }
        return built.get(index);
    }

    const lateralOf = (env, x, z) => {
        let best = Infinity;
        let nearest = 0;
        for (let i = env.startSegment; i <= env.endSegment + 20; i++) {
            const point = env.roadPath[i];
            const d = (x - point.x) ** 2 + (z - point.z) ** 2;
            if (d < best) {
                best = d;
                nearest = i;
            }
        }
        const point = env.roadPath[nearest];
        return (x - point.x) * Math.cos(point.heading) - (z - point.z) * Math.sin(point.heading);
    };

    // The nearest built segment to (x, z)
    const segmentOf = (env, x, z) => {
        let best = Infinity;
        let nearest = 0;
        for (let i = env.startSegment; i <= env.endSegment + 20; i++) {
            const d = (x - env.roadPath[i].x) ** 2 + (z - env.roadPath[i].z) ** 2;
            if (d < best) {
                best = d;
                nearest = i;
            }
        }
        return nearest;
    };

    // Every tree instance (the forest meshes are named for their kind)
    function trees(env, scene) {
        const out = [];
        const matrix = new game.THREE.Matrix4();
        scene.traverse(object => {
            if (!object.isInstancedMesh || !/^forest-/.test(object.name)) return;
            for (let n = 0; n < object.count; n++) {
                object.getMatrixAt(n, matrix);
                const [x, z] = [matrix.elements[12], matrix.elements[14]];
                out.push({ x, y: matrix.elements[13], z, lateral: lateralOf(env, x, z), segment: segmentOf(env, x, z), kind: object.name.slice(7) });
            }
        });
        return out;
    }
    const treeLaterals = (env, scene) => trees(env, scene).map(tree => tree.lateral);

    const at = (env, segment, lateral) => {
        const point = env.roadPath[segment];
        return env.groundYAt(point.x + Math.cos(point.heading) * lateral, point.z - Math.sin(point.heading) * lateral);
    };

    // Highest surface of the given parts under (x, z)
    function topHit(scene, parts, x, z) {
        const meshes = [];
        scene.traverse(object => {
            if (object.isMesh && !object.isInstancedMesh && parts.includes(object.userData.part)) {
                object.material.side = game.THREE.DoubleSide;
                meshes.push(object);
            }
        });
        scene.updateMatrixWorld(true);
        const raycaster = new game.THREE.Raycaster(new game.THREE.Vector3(x, 500, z), new game.THREE.Vector3(0, -1, 0));
        const hit = raycaster.intersectObjects(meshes, false)[0];
        return hit ? { y: hit.point.y, name: hit.object.name } : null;
    }

    test.each([[VALLEY, 10], [FOREST, 8]])('leg %i: the drawn ribbon agrees with the ground the physics reads', (index, halfRoad) => {
        const { env, scene } = leg(index);
        const ribbons = ribbonMeshes(env);
        expect(ribbons).toHaveLength(2);
        ribbons.forEach(mesh => { mesh.material.side = game.THREE.DoubleSide; });
        scene.updateMatrixWorld(true);
        const raycaster = new game.THREE.Raycaster();
        const hitAt = (x, z) => {
            raycaster.set(new game.THREE.Vector3(x, 500, z), new game.THREE.Vector3(0, -1, 0));
            const hit = raycaster.intersectObjects(ribbons, false)[0];
            return hit ? hit.point.y : null;
        };
        // Fixed laterals either side of the road, at three places along the leg
        const laterals = [13, 20, 34, 3 + halfRoad, 12 + halfRoad, 24 + halfRoad];
        let checked = 0;
        [env.startSegment + 10, env.startSegment + 40, env.endSegment - 10].forEach(segment => {
            const point = env.roadPath[segment];
            [-1, 1].forEach(sign => laterals.forEach(lateral => {
                const x = point.x + Math.cos(point.heading) * lateral * sign;
                const z = point.z - Math.sin(point.heading) * lateral * sign;
                const hit = hitAt(x, z);
                expect(hit).not.toBeNull();
                // An exact read is the drawn triangles themselves
                expect(Math.abs(hit - at(env, segment, lateral * sign))).toBeLessThanOrEqual(5e-3);
                checked++;
            }));
        });
        expect(checked).toBe(36);
    });

    test('mountain-dawn: on the run-off the drawn ground and the smooth ground the bike rides agree to 0.10, all along the closing valley', () => {
        const { env, scene } = leg(VALLEY);
        const ribbons = ribbonMeshes(env);
        ribbons.forEach(mesh => { mesh.material.side = game.THREE.DoubleSide; });
        scene.updateMatrixWorld(true);
        const raycaster = new game.THREE.Raycaster();
        let worst = 0;
        let checked = 0;
        for (let segment = env.startSegment + 1; segment <= env.endSegment + 5; segment += 2) {
            const point = env.roadPath[segment];
            for (const along of [0, 7.5]) {
                for (const sign of [-1, 1]) {
                    for (let lateral = 10.5; lateral <= 46; lateral += 1.5) {
                        const x = point.x + Math.cos(point.heading) * lateral * sign + Math.sin(point.heading) * along;
                        const z = point.z - Math.sin(point.heading) * lateral * sign + Math.cos(point.heading) * along;
                        // Run-off as the bike reads it: the band beside its own nearest segment
                        const loc = game.Terrain.locate(env.roadPath, x, z, 0, env.roadPath.length - 1, {});
                        if (Math.abs(loc.lateral) > game.Terrain.rideableLimit(env.terrain, loc.index, sign, 10)) continue;
                        raycaster.set(new game.THREE.Vector3(x, 500, z), new game.THREE.Vector3(0, -1, 0));
                        const hit = raycaster.intersectObjects(ribbons, false)[0];
                        expect(hit).toBeDefined();
                        const smooth = game.Terrain.groundY(env.terrain, env.terrainGeometry, x, z, 0, env.roadPath.length - 1, false);
                        worst = Math.max(worst, Math.abs(hit.point.y - smooth));
                        checked++;
                    }
                }
            }
        }
        expect(checked).toBeGreaterThan(2000);
        expect(worst).toBeLessThanOrEqual(0.10);
    });

    test('mountain-dawn: a river 3 m below the road shows from lateral 37.5 to 48 on the right and nowhere else', () => {
        const { env, scene } = leg(VALLEY);
        const rivers = [];
        scene.traverse(object => { if (object.name === 'floor-river') rivers.push(object); });
        expect(rivers).toHaveLength(1);
        expect(rivers[0].userData.part).toBe('floor');

        const segment = env.startSegment + 40;
        const point = env.roadPath[segment];
        const probe = lateral => topHit(
            scene, ['ground', 'floor'],
            point.x + Math.cos(point.heading) * lateral, point.z - Math.sin(point.heading) * lateral
        );
        const water = probe(42);
        expect(water.name).toBe('floor-river');
        expect(Math.abs(water.y - (point.y - 3.0))).toBeLessThan(0.1);
        expect(probe(20).name).not.toBe('floor-river');
        expect(probe(-42).name).not.toBe('floor-river');
        expect(probe(60).name).not.toBe('floor-river');
        // No lake plane under either run-off leg
        [VALLEY, FOREST].forEach(index => {
            const floors = [];
            leg(index).scene.traverse(object => { if (object.userData.part === 'floor') floors.push(object.name); });
            expect(floors).toEqual(index === VALLEY ? ['floor-river'] : []);
        });
    });

    test('mountain-dawn: sparse broadleaf meadow at the start, conifer forest at the end, none in the river, none nearer than 16', () => {
        const { env, scene } = leg(VALLEY);
        const all = trees(env, scene);
        const laterals = all.map(tree => tree.lateral);
        // Open country: segments 0 to 20, closed: 56 on (the weight is 1 from 55.2)
        const open = all.filter(tree => tree.segment <= 20);
        const closed = all.filter(tree => tree.segment >= 56);
        const perSegment = (list, from, to) => list.length / (to - from + 1);
        [-1, 1].forEach(sign => {
            const side = list => list.filter(tree => Math.sign(tree.lateral) === sign);
            expect(perSegment(side(open), 0, 20)).toBeGreaterThanOrEqual(1);
            expect(perSegment(side(open), 0, 20)).toBeLessThanOrEqual(3);
            expect(perSegment(side(closed), 56, 89)).toBeGreaterThanOrEqual(3);
            expect(perSegment(side(closed), 56, 89)).toBeLessThanOrEqual(5.5);
        });
        expect(open.filter(tree => tree.kind === 'conifer')).toHaveLength(0);
        expect(closed.filter(tree => tree.kind === 'conifer').length / closed.length).toBeGreaterThanOrEqual(0.7);
        expect(Math.min(...laterals.map(Math.abs))).toBeGreaterThanOrEqual(16.0);
        expect(Math.min(...laterals.map(Math.abs))).toBeLessThanOrEqual(18.0);
        expect(laterals.filter(l => l >= 33 && l <= 52)).toHaveLength(0);
        // Every tree stands on the drawn ground (planted 0.6 into it; the instance matrix is float32)
        all.slice(0, 200).forEach(tree => expect(tree.y).toBeCloseTo(env.groundYAt(tree.x, tree.z) - 0.6, 4));
    });

    test('mountain-dawn: rock outcrops only where the valley has closed in, out of reach, out of the river, set into the ground', () => {
        const { env, scene } = leg(VALLEY);
        const meshes = [];
        scene.traverse(object => { if (object.name === 'outcrops') meshes.push(object); });
        expect(meshes).toHaveLength(1);
        const [outcrops] = meshes;
        expect(outcrops.isInstancedMesh).toBe(true);
        expect(outcrops.count).toBeGreaterThan(60);
        const matrix = new game.THREE.Matrix4();
        const position = new game.THREE.Vector3();
        const scale = new game.THREE.Vector3();
        const quaternion = new game.THREE.Quaternion();
        const segments = [];
        for (let n = 0; n < outcrops.count; n++) {
            outcrops.getMatrixAt(n, matrix);
            matrix.decompose(position, quaternion, scale);
            const segment = segmentOf(env, position.x, position.z);
            segments.push(segment);
            const lateral = lateralOf(env, position.x, position.z);
            // No bike reaches one (it is not a solid entry)
            expect(Math.abs(lateral)).toBeGreaterThan(game.Terrain.rideableLimit(env.terrain, segment, Math.sign(lateral), 10) + 2);
            // Clear of the river band, rock and all
            const reach = Math.max(scale.x, scale.z) * 1.3;
            expect(lateral + reach < 33 || lateral - reach > 52).toBe(true);
            // The centre is under the drawn ground: the rock shows as a cap the ground cuts
            expect(position.y).toBeLessThan(env.groundYAt(position.x, position.z));
        }
        // None in open country; most where the valley has closed
        expect(Math.min(...segments)).toBeGreaterThanOrEqual(19);
        expect(segments.filter(s => s >= 50).length).toBeGreaterThan(segments.length / 2);
        expect(env.boulders.filter(b => b.solid && b.label === 'rock')).toHaveLength(
            env.groundedObjects.filter(({ label }) => /^cliff rock cluster/.test(label)).length
        );
    });

    test('mountain-dawn: the next leg\'s mountains stand ahead, clear of the road, fading in as the rider nears', () => {
        const { env, scene } = leg(VALLEY);
        const ranges = [];
        const mountains = [];
        scene.traverse(object => {
            if (object.name === 'approach-range') ranges.push(object);
            if (object.userData.type === 'mountain') mountains.push(object);
        });
        // One merged mesh, and no other backdrop
        expect(ranges).toHaveLength(1);
        expect(mountains).toEqual(ranges);
        const [range] = ranges;
        expect(range.userData.skipCulling).toBe(true);
        const { near, far } = range.userData.fade;
        const peaks = env.approachPeaks;
        expect(peaks.length).toBeGreaterThanOrEqual(15);
        const distance = (peak, segment) => Math.hypot(peak.x - env.roadPath[segment].x, peak.z - env.roadPath[segment].z);
        // Clear of every road segment this leg draws, by the peak's own radius
        peaks.forEach(peak => {
            for (let i = env.startSegment; i <= env.endSegment + 20; i++) expect(distance(peak, i)).toBeGreaterThan(peak.radius + 100);
        });
        // At 10% of the leg every peak's foot is past where the fade starts, and most are gone;
        // at 95% the nearest stand inside the fade, whole
        const nearest = segment => Math.min(...peaks.map(peak => distance(peak, segment) - peak.radius));
        const start = env.startSegment + 7;
        const end = env.startSegment + 66;
        expect(nearest(start)).toBeGreaterThan(near);
        expect(peaks.filter(peak => distance(peak, start) > far).length).toBeGreaterThan(peaks.length / 2);
        expect(nearest(end)).toBeLessThan(near / 2);
        // And they draw nearer all the way
        for (let i = start + 1; i <= end; i++) expect(nearest(i)).toBeLessThan(nearest(start));
        // The range stands on a base below the lowest road of the leg, under the valley sides
        range.geometry.computeBoundingBox();
        expect(range.geometry.boundingBox.min.y).toBeLessThan(Math.min(...env.roadPath.slice(0, 70).map(p => p.y)) - 50);
    });

    test('storm-valley: dense forest both sides, nothing nearer than 13 or beyond 90, 1400 at most', () => {
        const { env, scene } = leg(FOREST);
        const laterals = treeLaterals(env, scene);
        const left = laterals.filter(l => l < 0).length;
        const right = laterals.filter(l => l > 0).length;
        expect(left).toBeGreaterThanOrEqual(450);
        expect(left).toBeLessThanOrEqual(700);
        expect(right).toBeGreaterThanOrEqual(450);
        expect(right).toBeLessThanOrEqual(700);
        expect(laterals.length).toBeLessThanOrEqual(1400);
        const reach = laterals.map(Math.abs);
        expect(Math.min(...reach)).toBeGreaterThanOrEqual(13.0);
        expect(Math.min(...reach)).toBeLessThanOrEqual(15.0);
        expect(Math.max(...reach)).toBeLessThanOrEqual(90.0);
    });

    test('every solid trunk stands within the planted band, read from its nearest segment', () => {
        const { env } = leg(VALLEY);
        const trunks = env.boulders.filter(b => b.solid && b.label === 'tree');
        expect(trunks.length).toBeGreaterThanOrEqual(20);
        trunks.forEach(trunk => {
            const lateral = Math.abs(lateralOf(env, trunk.position.x, trunk.position.z));
            expect(lateral).toBeGreaterThanOrEqual(10 + 3);
            expect(lateral).toBeLessThanOrEqual(10 + 35);
        });
    });

    test.each([VALLEY, FOREST])('leg %i: every trunk a bike can reach is solid, and none further out is', (index) => {
        const { env, scene } = leg(index);
        const halfRoad = env.roadWidth / 2;
        // The rideable limit beside a point's nearest segment (it narrows along the valley)
        const reachable = (x, z, lateral) => game.Terrain.rideableLimit(env.terrain, segmentOf(env, x, z), Math.sign(lateral) || 1, halfRoad);
        const trunks = env.boulders.filter(b => b.solid && b.label === 'tree');
        trunks.forEach(trunk => {
            expect(trunk.radius).toBe(0.6);
            expect(trunk.height).toBe(6);
            const lateral = lateralOf(env, trunk.position.x, trunk.position.z);
            expect(Math.abs(lateral)).toBeLessThanOrEqual(reachable(trunk.position.x, trunk.position.z, lateral) + 1e-6);
        });
        const withinReach = trees(env, scene).filter(tree => Math.abs(tree.lateral) <= reachable(tree.x, tree.z, tree.lateral));
        expect(trunks).toHaveLength(withinReach.length);
        expect(trunks.length).toBeGreaterThan(0);
        // A trunk stands on the ground it was planted in
        trunks.slice(0, 20).forEach(trunk => {
            expect(trunk.position.y).toBeCloseTo(env.groundYAt(trunk.position.x, trunk.position.z), 9);
        });
    });

    test.each([[VALLEY, 10], [FOREST, 8]])('leg %i: roadworks plant stands on the run-off ground as solid circles, not in the old list', (index, halfRoad) => {
        const { env } = leg(index);
        const plant = env.boulders.filter(b => b.solid && b.height !== 6 && b.label !== 'rock');
        const labelled = label => plant.filter(b => b.label === label);
        const lateral = b => lateralOf(env, b.position.x, b.position.z);

        expect(labelled('bulldozer')).toHaveLength(1);
        expect(labelled('bulldozer')[0].radius).toBe(3);
        expect(lateral(labelled('bulldozer')[0])).toBeCloseTo(-(halfRoad + 9), 1);
        expect(labelled('work truck')).toHaveLength(2);
        labelled('work truck').forEach(b => expect(b.radius).toBe(2));
        // The truck's two circles sit side by side along its length, centred on -(halfRoad + 6)
        const truckLaterals = labelled('work truck').map(lateral);
        expect((truckLaterals[0] + truckLaterals[1]) / 2).toBeCloseTo(-(halfRoad + 6), 0);
        // Barriers: two circles of radius 1 for each barrier, 2 m of length each
        expect(labelled('barrier').length).toBeGreaterThan(0);
        expect(labelled('barrier').length % 2).toBe(0);
        labelled('barrier').forEach(b => expect(b.radius).toBe(1));
        plant.forEach(b => expect(b.height).toBe(3));

        // The wall-side entries would hold a bike off a place it never reaches, and crash an airborne one
        expect(env.roadworkObstacles.map(o => o.type).sort()).toEqual(['container', 'container']);
        // Containers on the road keep their entries at -6 and -7
        env.roadworkObstacles.forEach(o => expect(Math.abs(lateralOf(env, o.position.x, o.position.z))).toBeGreaterThan(5.5));
    });

    test('valley-run (the mirrored cliff): nothing solid, no plant on the drop or up the wall, only the containers on the road are obstacles', () => {
        const { env } = leg(CLIFF);
        expect(env.boulders.filter(b => b.solid)).toHaveLength(0);
        expect(env.roadworkObstacles.map(o => o.type).sort()).toEqual(['container', 'container']);
        expect(env.groundedObjects.filter(({ label }) => /construction bulldozer|construction barrier|work truck/.test(label))).toEqual([]);
    });

    test.each([VALLEY, FOREST])('leg %i: nothing floats and nothing overlaps the road', (index) => {
        const { log: lines } = leg(index);
        expect(lines.filter(line => /FLOATING|TERRAIN-ROAD OVERLAP/.test(line))).toEqual([]);
        expect(lines.some(line => line.includes('Grounding validation passed'))).toBe(true);
    });

    test('with no wall there is no rockfall on either run-off leg', () => {
        [VALLEY, FOREST].forEach(index => {
            const { env, scene } = leg(index);
            const rockfalls = new game.RockfallSystem(scene, env);
            expect(rockfalls.enabled).toBe(false);
        });
    });

    test('rock clusters on run-off ground are solid; the face decoration of the cliff legs is gone', () => {
        const { env } = leg(VALLEY);
        const { groundedObjects } = env;
        expect(groundedObjects.filter(({ label }) => /^embedded cliff rock/.test(label))).toHaveLength(0);
        const rocks = env.boulders.filter(b => b.label === 'rock');
        const clusters = groundedObjects.filter(({ label }) => /^cliff rock cluster/.test(label));
        expect(rocks.length).toBeGreaterThan(0);
        expect(rocks).toHaveLength(clusters.length);
    });

    describe('gates', () => {
        let inGate;
        beforeAll(() => {
            ({ inGate } = gameMethods(['inGate']));
        });

        // A position on a gate's road space
        const onGate = (gate, along, across) => ({
            x: gate.position.x + Math.sin(gate.heading) * along + Math.cos(gate.heading) * across,
            z: gate.position.z + Math.cos(gate.heading) * along - Math.sin(gate.heading) * across
        });

        test('the finish is one gate record, and the loose finish fields are gone', () => {
            [CLIFF, VALLEY, FOREST].forEach(index => {
                const { env } = leg(index);
                expect(env.finishGate).toMatchObject({ kind: 'finish', segmentIndex: env.endSegment + 5 });
                expect(env.finishLinePosition).toBeUndefined();
                expect(env.finishLineHeading).toBeUndefined();
                expect(env.checkpoints).toHaveLength(5);
                env.checkpoints.forEach(cp => expect(cp.kind).toBe('checkpoint'));
            });
        });

        test('over run-off a gate reaches the rideable limit plus 2; beside a wall or fall only the ledge', () => {
            // The valley's finish stands in the foothills, where the run-off has narrowed
            expect([leg(VALLEY).env.finishGate.left, leg(VALLEY).env.finishGate.right]).toEqual([26, 36]);
            expect([leg(FOREST).env.finishGate.left, leg(FOREST).env.finishGate.right]).toEqual([35, 35]);
            expect([leg(CLIFF).env.finishGate.left, leg(CLIFF).env.finishGate.right]).toEqual([12, 12]);
            // Each valley gate spans its own segment's rideable ground, narrowing along the leg
            const gates = [...leg(VALLEY).env.checkpoints, leg(VALLEY).env.finishGate];
            gates.forEach(gate => {
                expect(gate.left).toBe(game.Terrain.rideableLimit(leg(VALLEY).env.terrain, gate.segmentIndex, -1, 10) + 2);
                expect(gate.right).toBe(game.Terrain.rideableLimit(leg(VALLEY).env.terrain, gate.segmentIndex, 1, 10) + 2);
            });
            expect([gates[0].left, gates[0].right]).toEqual([47, 47]);
            gates.slice(1).forEach((gate, n) => {
                expect(gate.left).toBeLessThanOrEqual(gates[n].left);
                expect(gate.right).toBeLessThanOrEqual(gates[n].right);
            });
        });

        test('a rider anywhere on the rideable ground fires the gate, and one beyond it does not', () => {
            const { env } = leg(VALLEY);
            [env.finishGate, ...env.checkpoints].forEach(gate => {
                const near = across => inGate(gate, onGate(gate, 0, across));
                // The rideable limit each side at this gate
                const right = gate.right - 2;
                const left = gate.left - 2;
                expect(near(0)).toBe(true);
                expect(near(right - 1)).toBe(true);
                expect(near(right + 1)).toBe(true);
                expect(near(-(left - 1))).toBe(true);
                expect(near(-(left + 1))).toBe(true);
                expect(near(right + 4)).toBe(false);
                expect(near(-(left + 4))).toBe(false);
                // The band along the road is 5 m each way
                expect(inGate(gate, onGate(gate, 4.9, 0))).toBe(true);
                expect(inGate(gate, onGate(gate, 5.1, 0))).toBe(false);
                expect(inGate(gate, onGate(gate, -5.1, 0))).toBe(false);
            });
        });

        test('beside a wall or fall the gate is the road and its ledges, as it was', () => {
            const { env } = leg(CLIFF);
            const finish = env.finishGate;
            expect(inGate(finish, onGate(finish, 0, 11.9))).toBe(true);
            expect(inGate(finish, onGate(finish, 0, -11.9))).toBe(true);
            expect(inGate(finish, onGate(finish, 0, 13))).toBe(false);
            expect(inGate(finish, onGate(finish, 0, -13))).toBe(false);
        });

        test('there is no segment argument: the band is the only guard, and a bike far down the road does not fire it', () => {
            const { env } = leg(VALLEY);
            expect(inGate.length).toBe(2);
            const finish = env.finishGate;
            const farther = env.roadPath[finish.segmentIndex - 10];
            expect(inGate(finish, { x: farther.x, z: farther.z })).toBe(false);
        });

        test('no gate has another stretch of road inside its band', () => {
            // The widest band is 47 each side; the nearest foreign road centre must be
            // further than that plus the 5 m band
            [CLIFF, VALLEY, FOREST].forEach(index => {
                const { env } = leg(index);
                [env.finishGate, ...env.checkpoints].forEach(gate => {
                    for (let i = 0; i < env.roadPath.length; i++) {
                        if (Math.abs(i - gate.segmentIndex) <= 3) continue;
                        const point = env.roadPath[i];
                        const dx = point.x - gate.position.x;
                        const dz = point.z - gate.position.z;
                        const along = dx * Math.sin(gate.heading) + dz * Math.cos(gate.heading);
                        const across = dx * Math.cos(gate.heading) - dz * Math.sin(gate.heading);
                        if (Math.abs(along) < 5) expect(Math.abs(across)).toBeGreaterThan(Math.max(gate.left, gate.right) + 5);
                    }
                });
            });
        });

        test('limit posts mark the reach over run-off ground and nowhere else', () => {
            const posts = index => leg(index).env.groundedObjects.filter(({ label }) => /limit post$/.test(label));
            // Six gates, a post each side
            expect(posts(VALLEY)).toHaveLength(12);
            expect(posts(FOREST)).toHaveLength(12);
            expect(posts(CLIFF)).toHaveLength(0);
        });
    });
});

describe('board ids and best-time keys', () => {
    let game;
    beforeAll(() => {
        game = loadGame();
    });

    test('only the changed legs carry a version; progression keeps plain ids', () => {
        const legs = new game.TourSystem().legs;
        expect(legs.map(l => game.TourSystem.boardId(l))).toEqual([
            'mountain-dawn-v2', 'valley-run-v2', 'coastal-descent-v2', 'foggy-gorge-v2',
            'high-pass', 'storm-valley-v2', 'night-ride-v2', 'winter-pass-v2'
        ]);
        expect(legs.map(l => l.id)).toEqual([
            'mountain-dawn', 'valley-run', 'coastal-descent', 'foggy-gorge',
            'high-pass', 'storm-valley', 'night-ride', 'winter-pass'
        ]);
    });

    test('a leg or its id gives the same board, and an unknown id throws instead of reading another board', () => {
        expect(game.TourSystem.boardId('valley-run')).toBe('valley-run-v2');
        expect(game.TourSystem.boardId({ id: 'valley-run' })).toBe('valley-run-v2');
        expect(() => game.TourSystem.boardId('valley-run-v2')).toThrow('Unknown leg id');
        expect(() => game.TourSystem.boardId({ id: 'nowhere' })).toThrow('Unknown leg id');
    });

    test('Game.bestTimeKey follows the board', () => {
        const { bestTimeKey } = gameMethods(['bestTimeKey'], {}, { TourSystem: game.TourSystem });
        expect(bestTimeKey({ id: 'valley-run' })).toBe('motorcycleBestTime_valley-run-v2');
        expect(bestTimeKey('storm-valley')).toBe('motorcycleBestTime_storm-valley-v2');
        expect(bestTimeKey({ id: 'mountain-dawn' })).toBe('motorcycleBestTime_mountain-dawn-v2');
        expect(bestTimeKey({ id: 'high-pass' })).toBe('motorcycleBestTime_high-pass');
    });

    test('no site in main.js builds a board id or best-time key from the plain leg id', () => {
        const source = loadScript('main.js');
        expect(source).not.toMatch(/startRun\(leg\.id\)/);
        expect(source).not.toMatch(/BestTime_\$\{currentLeg\.id\}/);
        expect(source).not.toMatch(/BestTime_\$\{legId\}/);
        expect(source).not.toMatch(/fetchLeaderboard\(legId/);
        expect((source.match(/TourSystem\.boardId\(/g) || []).length).toBeGreaterThanOrEqual(4);
        expect(source).not.toMatch(/finishLinePosition|finishLineHeading/);
        expect((source.match(/this\.inGate\(/g) || []).length).toBe(2);
        // Local leg ids still key progress
        expect(readFileSync(new URL('../../js/tours.js', import.meta.url), 'utf8')).toMatch(/twistyProgress/);
    });

    test('the menu preview camera asks the leg how far out to stand', () => {
        const forest = game.Terrain.legConfig('storm-valley').preview;
        const meadow = game.Terrain.legConfig('mountain-dawn').preview;
        expect(forest.radius).toBeLessThan(13);
        expect(meadow.radius).toBeGreaterThan(16);
        // The mirrored cliff looks back from over the lake, on the left
        expect(game.Terrain.legConfig('valley-run').preview).toEqual({ radius: 30, height: 9, side: -1 });
        expect(game.Terrain.legConfig('high-pass').preview).toBeUndefined();
    });
});

describe('the bike on the run-off legs', () => {
    let game;
    let log;
    let env;
    let scene;

    beforeAll(() => {
        log = [];
        game = loadGame(undefined, log);
        ({ env, scene } = buildEnvironment(game, VALLEY));
    });

    // Five segments into the leg, on its first straight: the same place on the
    // valley profile as segment 75 was when valley-run had it
    const SEGMENT = 5;
    const CRASHES = /CRASHED|FALLING/;

    function place(segment, lateral, speed) {
        const vehicle = new game.Vehicle(scene);
        const point = env.roadPath[segment];
        vehicle.environment = env;
        vehicle.position.set(
            point.x + Math.cos(point.heading) * lateral,
            point.y,
            point.z - Math.sin(point.heading) * lateral
        );
        vehicle.yawAngle = point.heading;
        vehicle.speed = speed;
        vehicle.currentRoadSegment = segment;
        return vehicle;
    }

    function ride(vehicle, ticks, { throttle = 0 } = {}) {
        log.length = 0;
        const history = [null];
        for (let tick = 1; tick <= ticks; tick++) {
            vehicle.update(DT, 0, throttle, 0);
            history.push({
                speed: vehicle.speed,
                y: vehicle.position.y,
                crashed: vehicle.crashed,
                offRoadTime: vehicle.offRoadTime
            });
        }
        const crashTick = history.findIndex(entry => entry && entry.crashed);
        return { history, crashTick: crashTick === -1 ? null : crashTick, lines: log.filter(line => CRASHES.test(line)) };
    }

    // The timer and Y-follow runs are about the ground, not the trees and rocks
    // that stand on it: those get their own tests below
    let solids;
    beforeEach(() => {
        solids = env.boulders;
        env.boulders = [];
    });
    afterEach(() => {
        env.boulders = solids;
    });

    test('run-off slows the bike, crashes it once after 6 s, and the crashed bike comes to rest', () => {
        const coast = ride(place(SEGMENT, 0, 25), 360).history;
        const { history, crashTick, lines } = ride(place(SEGMENT, 13, 25), 600);

        expect(history[36].crashed).toBe(false);
        expect(history[60].speed).toBeGreaterThan(15.5);
        expect(history[60].speed).toBeLessThan(18.0);
        expect(coast[60].speed - history[60].speed).toBeGreaterThan(5.0);
        expect(history[300].crashed).toBe(false);
        expect(history[300].speed).toBeGreaterThan(5.85);
        expect(history[300].speed).toBeLessThan(6.10);

        expect([360, 361]).toContain(crashTick);
        expect(history[crashTick + 1].speed).toBeLessThan(history[crashTick].speed);
        expect(history[crashTick + 60].speed).toBeGreaterThan(1.5);
        expect(history[crashTick + 60].speed).toBeLessThan(2.0);
        expect(history[520].speed).toBeLessThan(0.5);
        expect(history[600].speed).toBeLessThan(0.5);
        expect(history[600].offRoadTime).toBe(history[crashTick].offRoadTime);
        expect(lines.filter(line => line.includes('Off the road for 6.0 s'))).toHaveLength(1);
        history.slice(1).forEach(entry => expect(Number.isFinite(entry.y)).toBe(true));
    });

    test('returning to the road after a long run-off does not crash, and the bike can accelerate', () => {
        const point = env.roadPath[SEGMENT];
        const vehicle = place(SEGMENT, 13, 25);
        const out = ride(vehicle, 330);
        expect(out.history[330].crashed).toBe(false);
        expect(out.history[330].speed).toBeGreaterThan(5.85);
        expect(out.history[330].speed).toBeLessThan(6.10);
        expect(out.history[330].offRoadTime).toBeCloseTo(5.5, 1);

        const along = (vehicle.position.x - point.x) * Math.sin(point.heading) + (vehicle.position.z - point.z) * Math.cos(point.heading);
        vehicle.position.set(point.x + Math.sin(point.heading) * along, vehicle.position.y, point.z + Math.cos(point.heading) * along);
        const back = ride(vehicle, 120);
        expect(back.history[1].offRoadTime).toBe(0);
        back.history.slice(1).forEach(entry => expect(entry.crashed).toBe(false));
        expect(back.history[120].speed).toBeGreaterThanOrEqual(5.5);

        const fast = ride(place(SEGMENT, 0, 6), 60, { throttle: 1 });
        expect(fast.history[60].speed).toBeGreaterThanOrEqual(15);
    });

    test('a bike that enters below the floor speed is not sped up', () => {
        const reference = ride(place(SEGMENT, 0, 5), 60).history;
        const { history } = ride(place(SEGMENT, 13, 5), 60);
        expect(Math.abs(history[1].speed - reference[1].speed)).toBeLessThan(0.01);
        expect(Math.abs(history[60].speed - reference[60].speed)).toBeLessThan(0.1);
        expect(history[60].crashed).toBe(reference[60].crashed);
    });

    test('run-off never raises speed: entering at 5 m/s the speed stays at or below 5 on every tick', () => {
        const { history } = ride(place(SEGMENT, 13, 5), 60);
        history.slice(1).forEach(entry => expect(entry.speed).toBeLessThanOrEqual(5.0));
    });

    test('the bike rides on the drawn ground beside the road, not the road height', () => {
        const vehicle = place(SEGMENT, 20, 15);
        const { history } = ride(vehicle, 60);
        expect(history[60].crashed).toBe(false);

        const loc = {};
        game.Terrain.locate(env.roadPath, vehicle.position.x, vehicle.position.z, 0, env.roadPath.length - 1, loc);
        const next = env.roadPath[loc.index + (loc.along >= 0 ? 1 : -1)];
        const roadY = loc.roadY + (next.y - loc.roadY) * Math.min(1, Math.abs(loc.along) / game.Terrain.SEGMENT_LENGTH);
        expect(Math.abs(vehicle.position.y - (roadY - 0.06 * (Math.abs(loc.lateral) - env.roadWidth / 2)))).toBeLessThan(0.15);

        // And it is where the ribbon is
        const ribbons = ribbonMeshes(env);
        ribbons.forEach(mesh => { mesh.material.side = game.THREE.DoubleSide; });
        scene.updateMatrixWorld(true);
        const raycaster = new game.THREE.Raycaster(
            new game.THREE.Vector3(vehicle.position.x, 500, vehicle.position.z), new game.THREE.Vector3(0, -1, 0)
        );
        const hit = raycaster.intersectObjects(ribbons, false)[0];
        expect(Math.abs(vehicle.position.y - hit.point.y)).toBeLessThan(0.15);
    });

    test('the river is water: riding into it crashes once, at lateral 40 on the right and not on the left', () => {
        const heading = env.roadPath[SEGMENT].heading;
        const rider = place(SEGMENT, 40, 25);
        rider.velocity.set(Math.sin(heading) * 25, 0, Math.cos(heading) * 25);
        const { crashTick, history, lines } = ride(rider, 120);
        expect(crashTick).toBe(1);
        expect(lines.filter(line => line.startsWith('CRASHED! Rode into the water'))).toHaveLength(1);
        expect(history[120].speed).toBeLessThan(history[2].speed);

        const dry = place(SEGMENT, -40, 25);
        expect(ride(dry, 20).crashTick).toBeNull();
    });

    test('the wall at the edge of the run-off stops a bike that is already sliding, instead of letting it through', () => {
        const point = env.roadPath[SEGMENT];
        const sliding = place(SEGMENT, 40, 0);
        sliding.crashed = true;
        sliding.velocity.set(Math.cos(point.heading) * 10, 0, -Math.sin(point.heading) * 10); // outward, to the right
        const reach = 10 + 35;
        let farthest = 0;
        for (let tick = 0; tick < 90; tick++) {
            sliding.update(DT, 0, 0, 0);
            const lateral = (sliding.position.x - point.x) * Math.cos(point.heading) - (sliding.position.z - point.z) * Math.sin(point.heading);
            farthest = Math.max(farthest, lateral);
        }
        expect(farthest).toBeGreaterThan(40);
        // Past the wall by at most the tick's own travel; unclamped it slides about 8 m further
        expect(farthest).toBeLessThanOrEqual(reach + 0.1);
        expect(Number.isFinite(sliding.position.y)).toBe(true);
    });

    describe('solid obstacles', () => {
        const solidAt = (vehicle, away, height = 6, radius = 0.6) => {
            const heading = vehicle.yawAngle;
            // Beside the bike, across the road
            return {
                position: new game.THREE.Vector3(
                    vehicle.position.x + Math.cos(heading) * away, vehicle.position.y, vehicle.position.z - Math.sin(heading) * away
                ),
                radius, solid: true, height, label: 'tree'
            };
        };

        test('a trunk crashes the bike inside radius + 1.0 and not outside it', () => {
            const near = place(SEGMENT, 0, 25);
            env.boulders = [solidAt(near, 1.5)];
            const hit = ride(near, 1);
            expect(hit.crashTick).toBe(1);
            expect(log.some(line => line.startsWith('CRASHED! Hit a tree at'))).toBe(true);
            // The impact velocity is half the speed, away from the trunk
            expect(Math.hypot(near.velocity.x, near.velocity.z)).toBeCloseTo(12.5, 1);

            const clear = place(SEGMENT, 0, 25);
            env.boulders = [solidAt(clear, 1.7)];
            expect(ride(clear, 1).crashTick).toBeNull();
        });

        test('a trunk is never hopped, whatever the bike', () => {
            const vehicle = place(SEGMENT, 0, 25);
            vehicle.jumpPowerMult = 3;
            const hop = jest.spyOn(vehicle, 'attemptHop');
            env.boulders = [solidAt(vehicle, 1.2, 6, 0.3)];
            expect(ride(vehicle, 1).crashTick).toBe(1);
            expect(hop).not.toHaveBeenCalled();
        });

        test('an airborne bike below the top of a trunk hits it and leaves the jump state; one above clears it', () => {
            const airborne = height => {
                const vehicle = place(SEGMENT, 0, 15);
                vehicle.isJumping = true;
                vehicle.jumpVelocityY = 0;
                vehicle.jumpStartHeight = vehicle.position.y;
                vehicle.position.y += height;
                env.boulders = [solidAt(vehicle, 1.0, 6)];
                // The trunk stands on the ground the bike jumped from
                env.boulders[0].position.y -= height;
                return vehicle;
            };
            const low = airborne(3.0);
            expect(ride(low, 1).crashTick).toBe(1);
            expect(low.isJumping).toBe(false);

            const high = airborne(12.0);
            expect(ride(high, 1).crashTick).toBeNull();
            expect(high.isJumping).toBe(true);
        });

        test('a loose boulder is as before: skipped in the air, hopped on the ground by a bike that can', () => {
            const vehicle = place(SEGMENT, 0, 25);
            vehicle.jumpPowerMult = 3;
            vehicle.isJumping = true;
            vehicle.jumpVelocityY = 5;
            vehicle.jumpRotation = 0;
            vehicle.jumpAngularVel = 0;
            vehicle.jumpStartHeight = vehicle.position.y;
            vehicle.position.y += 2;
            // Level with the bike: only the airborne skip keeps it from a hit
            env.boulders = [{ position: vehicle.position.clone(), radius: 0.4 }];
            expect(ride(vehicle, 1).crashTick).toBeNull();

            const grounded = place(SEGMENT, 0, 25);
            grounded.jumpPowerMult = 3;
            env.boulders = [{ position: grounded.position.clone(), radius: 0.4 }];
            ride(grounded, 1);
            expect(grounded.crashed).toBe(false);
            expect(grounded.isJumping).toBe(true);
        });

        test('the real bulldozer circle of the roadworks crashes a bike that rides into it', () => {
            env.boulders = solids;
            const bulldozer = solids.find(b => b.label === 'bulldozer');
            const heading = env.roadPath[SEGMENT].heading;
            const vehicle = place(SEGMENT, 0, 15);
            // 3.5 from its centre, on the ground beside it
            vehicle.position.set(bulldozer.position.x + Math.cos(heading) * 3.5, bulldozer.position.y, bulldozer.position.z - Math.sin(heading) * 3.5);
            vehicle.yawAngle = heading;
            vehicle.currentRoadSegment = Math.round(env.roadPath.findIndex((p, i) => i > 0 && Math.hypot(p.x - bulldozer.position.x, p.z - bulldozer.position.z) < 25));
            const { crashTick } = ride(vehicle, 1);
            expect(crashTick).toBe(1);
            expect(log.some(line => line.startsWith('CRASHED! Hit a bulldozer'))).toBe(true);
        });
    });
});
