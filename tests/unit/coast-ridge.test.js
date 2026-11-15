// Phase 5: the coast (coastal-descent) and the ridge (winter-pass). A side that
// changes along a leg (spans), a sea and a frozen floor, a fall with no water
// to end it, and the bike on all of it. Real modules on real three r150.
import { buildEnvironment, loadGame, ribbonMeshes } from '../helpers/load-game.js';

const DT = 1 / 60;
const COAST = 2;
const RIDGE = 7;
const CRASHES = /CRASHED|FALLING/;

describe('spans and the two new profiles (pure)', () => {
    const game = loadGame();
    const { Terrain } = game;
    const coast = Terrain.profiles.coast;
    const ridge = Terrain.profiles.ridge;
    const [beachSpan] = coast.spans;
    const ctxFor = (halfRoad, roadY, s) => ({ halfRoad, roadY, column: 0, index: Math.floor(s), s, pathLength: 744 });

    test('a span replaces one side from `from`, and nowhere before it; the other side is untouched', () => {
        expect(beachSpan.from).toBe(216);
        expect(Terrain.sideAt(coast, 1, 215)).toBe(coast.right);
        expect(Terrain.sideAt(coast, 1, 216)).toBe(beachSpan.right);
        expect(Terrain.sideAt(coast, 1, 400)).toBe(beachSpan.right);
        expect(Terrain.sideAt(coast, -1, 215)).toBe(coast.left);
        expect(Terrain.sideAt(coast, -1, 230)).toBe(coast.left);
        // A profile with no spans answers with its own sides
        expect(Terrain.sideAt(ridge, 1, 650)).toBe(ridge.right);
        expect(Terrain.sidesOf(coast, 1)).toEqual([coast.right, beachSpan.right]);
        expect(Terrain.sidesOf(coast, -1)).toEqual([coast.left]);
    });

    test('a span with an end hands the side back after it', () => {
        const inner = Terrain.heightfieldSide({
            stations: [[0, 0], [10, -1]], bands: [{ to: 5, kind: 'runoff' }, { kind: 'wall' }], runoff: { drag: 0.35, grip: 0.5, floorSpeed: 6 }
        });
        const profile = { ...coast, spans: [{ from: 10, to: 20, right: inner }] };
        expect(Terrain.sideAt(profile, 1, 9)).toBe(coast.right);
        expect(Terrain.sideAt(profile, 1, 10)).toBe(inner);
        expect(Terrain.sideAt(profile, 1, 19)).toBe(inner);
        expect(Terrain.sideAt(profile, 1, 20)).toBe(coast.right);
    });

    test('the zone changes from a fall to run-off at the span edge, and only on that side', () => {
        const zone = (segment, lateral) => Terrain.zoneAt(coast, segment, lateral, 10).kind;
        expect(zone(215, 12.6)).toBe('fall');
        expect(zone(216, 12.6)).toBe('runoff');
        expect(zone(216, 30.1)).toBe('fall');
        expect(zone(215, -11.5)).toBe('wall');
        expect(zone(230, -11.5)).toBe('wall');
        // The road and its ledge are the road either way
        expect(zone(215, 11)).toBe('shoulder');
        expect(zone(230, 5)).toBe('road');
    });

    test('rideable limit and gate reach follow the side in force', () => {
        expect(Terrain.rideableLimit(coast, 215, 1, 10)).toBe(12);
        expect(Terrain.rideableLimit(coast, 216, 1, 10)).toBe(30);
        expect(Terrain.rideableLimit(coast, 230, -1, 10)).toBe(11);
        expect(Terrain.gateReach(coast, 215, 1, 10)).toBe(12);
        expect(Terrain.gateReach(coast, 238, 1, 10)).toBe(32);
        expect(Terrain.gateReach(coast, 238, -1, 10)).toBe(12);
    });

    test('rows blend over the one segment before the edge: the sea cliff before it, the beach from it', () => {
        const row = (s, j) => Terrain.rowAt(coast, 1, j, ctxFor(10, 20, s), {});
        const cliff = (s, j) => Terrain.row(coast.right, j, ctxFor(10, 20, s), {});
        const sand = (s, j) => Terrain.row(beachSpan.right, j, ctxFor(10, 20, s), {});
        [0, 7, 20, 35].forEach(j => {
            expect(row(214, j)).toEqual(cliff(214, j));
            expect(row(215, j)).toEqual(cliff(215, j));
            expect(row(216, j)).toEqual(sand(216, j));
            expect(row(240, j)).toEqual(sand(240, j));
            const halfway = row(215.5, j);
            const a = cliff(215.5, j);
            const b = sand(215.5, j);
            expect(halfway.d).toBeCloseTo((a.d + b.d) / 2, 9);
            expect(halfway.y).toBeCloseTo((a.y + b.y) / 2, 9);
        });
        // The left side has no span, and a profile without spans is row() itself
        expect(Terrain.rowAt(coast, -1, 12, ctxFor(10, 20, 215.5), {})).toEqual(Terrain.row(coast.left, 12, ctxFor(10, 20, 215.5), {}));
        expect(Terrain.rowAt(ridge, 1, 12, ctxFor(8, 20, 650.5), {})).toEqual(Terrain.row(ridge.right, 12, ctxFor(8, 20, 650.5), {}));
    });

    test('only the segments whose side is a rock face are dressed', () => {
        expect(Terrain.faceRange(coast, 1, 150, 253)).toEqual({ from: 150, to: 215 });
        expect(Terrain.faceRange(coast, -1, 150, 253)).toEqual({ from: 150, to: 253 });
        expect(Terrain.faceRange(Terrain.profiles.cliffLake, 1, 0, 90)).toEqual({ from: 0, to: 90 });
        expect(Terrain.faceRange(ridge, 1, 608, 723)).toBeNull();
        expect(Terrain.faceRange(Terrain.profiles.valleyFloor, -1, 70, 169)).toBeNull();
    });

    test('coast: a hill on the left, a sea cliff with a short lip on the right, the sea at an absolute height', () => {
        expect(coast.left.bands).toEqual(Terrain.profiles.cliffLake.left.bands);
        expect(coast.right.bands).toEqual([{ to: 2, kind: 'shoulder' }, { kind: 'fall' }]);
        expect(coast.right.lipDepth).toBe(2);
        expect(beachSpan.right.lipDepth).toBe(2);
        expect(coast.floor).toEqual({ kind: 'sea', y: 0, restY: 0.5 });
        expect(Terrain.waterLevel(coast, 40)).toBe(0);
        expect(Terrain.waterLevel(coast, 5)).toBe(0);
        // A fall ends just above the sea, on both of the right sides
        expect(Terrain.restY(coast, coast.right, 30)).toBe(0.5);
        expect(Terrain.restY(coast, beachSpan.right, 8)).toBe(0.5);
    });

    test('coast: the road descends from high above the sea to a few metres over it, in gentle steps', () => {
        const { startSegment, endSegment } = new game.TourSystem().legs[COAST];
        const y = Array.from({ length: 744 }, (_, i) => Terrain.elevation(coast, i, startSegment, endSegment));
        expect(y[startSegment]).toBeGreaterThanOrEqual(55);
        expect(y[endSegment]).toBeLessThanOrEqual(8);
        y.slice(1).forEach((value, n) => expect(Math.abs(value - y[n])).toBeLessThanOrEqual(1.6));
        // Always down, once it starts
        for (let i = startSegment + 1; i <= endSegment; i++) expect(y[i]).toBeLessThan(y[i - 1]);
        // The beach starts where the drop to the sea has fallen under 10 m
        expect(y[beachSpan.from] - coast.floor.y).toBeLessThan(10);
        expect(y[beachSpan.from - 8] - coast.floor.restY).toBeGreaterThan(10);
    });

    test('ridge: a snowfield 6 m wide, then a fall of 40 m, both sides, over a frozen floor', () => {
        const zone = (lateral) => Terrain.zoneAt(ridge, 650, lateral, 8).kind;
        [-1, 1].forEach(sign => {
            expect(zone(sign * (8 + 3))).toBe('runoff');
            expect(zone(sign * (8 + 5.9))).toBe('runoff');
            expect(zone(sign * (8 + 7))).toBe('fall');
        });
        expect(Terrain.rideableLimit(ridge, 650, -1, 8)).toBe(14);
        expect(Terrain.rideableLimit(ridge, 650, 1, 8)).toBe(14);
        expect(ridge.floor).toEqual({ kind: 'ice', y: -200 });
        expect(ridge.left.fallDepth).toBe(40);
        // No water floor to end a fall: it ends 40 m under the road
        expect(Terrain.restY(ridge, ridge.left, 22)).toBe(-18);
    });

    test('ridge: the road climbs gently over the leg', () => {
        const { startSegment, endSegment } = new game.TourSystem().legs[RIDGE];
        const y = Array.from({ length: 744 }, (_, i) => Terrain.elevation(ridge, i, startSegment, endSegment));
        expect(y[startSegment]).toBeCloseTo(14, 9);
        expect(y[endSegment]).toBeGreaterThan(y[startSegment] + 10);
        y.slice(1).forEach((value, n) => expect(Math.abs(value - y[n])).toBeLessThanOrEqual(0.5));
    });

    const sides = [
        ['coast hill', coast.left, 10],
        ['coast sea cliff', coast.right, 10],
        ['coast beach', beachSpan.right, 10],
        ['ridge left', ridge.left, 8],
        ['ridge right', ridge.right, 8]
    ];

    // Rows wider than half the tightest bend's radius would fold over on its inside
    test.each([['coast', 10, 181], ['ridge', 8, 142]])('%s: no row reaches past half the tightest bend radius of its leg', (name, halfRoad, limit) => {
        const profile = Terrain.profiles[name];
        [profile.left, profile.right, ...(profile.spans || []).map(span => span.right)].forEach(side => {
            expect(Terrain.outermost(side, ctxFor(halfRoad, 30, 7))).toBeLessThanOrEqual(limit);
        });
    });

    test.each(sides.filter(([name]) => /beach|ridge/.test(name)))('%s: the physics base equals the drawn row at every row, and is finite out to 400', (name, side, halfRoad) => {
        const ctx = ctxFor(halfRoad, 30, 7.25);
        for (let j = 0; j <= Terrain.ROWS; j++) {
            const row = Terrain.row(side, j, ctx, {});
            expect(Math.abs(side.base(row.d - halfRoad, 30, ctx.s) - row.y)).toBeLessThan(1e-9);
        }
        for (let d = 0; d <= 400; d++) expect(Number.isFinite(side.base(d, 30, 3.5))).toBe(true);
    });
});

describe('the coast and the ridge built', () => {
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
            built.set(index, { ...buildEnvironment(game, index), log: [...log] });
        }
        return built.get(index);
    }

    const lateralOf = (env, x, z) => {
        let best = Infinity;
        let nearest = 0;
        for (let i = env.startSegment; i <= env.endSegment + 20; i++) {
            const point = env.roadPath[i];
            const d = (x - point.x) ** 2 + (z - point.z) ** 2;
            if (d < best) { best = d; nearest = i; }
        }
        const point = env.roadPath[nearest];
        return (x - point.x) * Math.cos(point.heading) - (z - point.z) * Math.sin(point.heading);
    };

    const world = (env, segment, lateral) => {
        const point = env.roadPath[segment];
        return [point.x + Math.cos(point.heading) * lateral, point.z - Math.sin(point.heading) * lateral];
    };
    const at = (env, segment, lateral) => env.groundYAt(...world(env, segment, lateral));

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
        return hit ? { y: hit.point.y, name: hit.object.name, material: hit.object.material.name } : null;
    }

    function treeLaterals(env, scene) {
        const laterals = [];
        const matrix = new game.THREE.Matrix4();
        scene.traverse(object => {
            // The forest only: a pass also has instanced poles, cairns and rocks
            if (!object.isInstancedMesh || !/^forest-/.test(object.name)) return;
            for (let n = 0; n < object.count; n++) {
                object.getMatrixAt(n, matrix);
                laterals.push(lateralOf(env, matrix.elements[12], matrix.elements[14]));
            }
        });
        return laterals;
    }

    test.each([[COAST, 10], [RIDGE, 8]])('leg %i: nothing floats, nothing overlaps the road, one ribbon each side', (index, halfRoad) => {
        const { env, log: lines } = leg(index);
        expect(lines.filter(line => /FLOATING|TERRAIN-ROAD OVERLAP/.test(line))).toEqual([]);
        expect(lines.some(line => line.includes('Grounding validation passed'))).toBe(true);
        expect(ribbonMeshes(env)).toHaveLength(2);
        expect(env.roadWidth / 2).toBe(halfRoad);
    });

    test('coast: the drawn ribbon agrees with the ground the physics reads, on the cliff and on the beach', () => {
        const { env, scene } = leg(COAST);
        const ribbons = ribbonMeshes(env);
        ribbons.forEach(mesh => { mesh.material.side = game.THREE.DoubleSide; });
        scene.updateMatrixWorld(true);
        const raycaster = new game.THREE.Raycaster();
        const hitAt = (x, z) => {
            raycaster.set(new game.THREE.Vector3(x, 500, z), new game.THREE.Vector3(0, -1, 0));
            const hit = raycaster.intersectObjects(ribbons, false)[0];
            return hit ? hit.point.y : null;
        };
        let cliff = 0;
        let sand = 0;
        // The sea cliff walks its drawn face; the beach is the smooth model, within 0.10
        [160, 180, 205, 212].forEach(segment => [13, 20, 34].forEach(lateral => {
            const [x, z] = world(env, segment, lateral);
            const hit = hitAt(x, z);
            if (hit === null) return;
            // Under the sea the drawn face carries on down; the model stops at the water
            expect(Math.abs(Math.max(hit, 0) - env.groundYAt(x, z))).toBeLessThanOrEqual(5e-3);
            cliff++;
        }));
        [220, 226, 232, 240].forEach(segment => [11, 14, 18, 25, 29].forEach(lateral => {
            const [x, z] = world(env, segment, lateral);
            const hit = hitAt(x, z);
            expect(hit).not.toBeNull();
            expect(Math.abs(hit - env.groundYAt(x, z))).toBeLessThanOrEqual(0.10);
            sand++;
        }));
        expect(cliff).toBeGreaterThanOrEqual(8);
        expect(sand).toBe(20);
        // The hill on the left is a drawn wall like the cliff legs': scenery rests on it
        let wall = 0;
        [160, 180, 205].forEach(segment => [-13, -20, -34].forEach(lateral => {
            const [lx, lz] = world(env, segment, lateral);
            const hit = hitAt(lx, lz);
            // Beyond the last row of the wall there is nothing drawn to meet
            if (hit === null) return;
            expect(Math.abs(hit - env.groundYAt(lx, lz))).toBeLessThanOrEqual(5e-3);
            wall++;
        }));
        expect(wall).toBeGreaterThanOrEqual(6);
    });

    test('coast: the sea is one plane at absolute height 0, and it is what a ray finds past the cliff', () => {
        const { env, scene } = leg(COAST);
        const seas = [];
        scene.traverse(object => { if (object.name === 'floor-sea') seas.push(object); });
        expect(seas).toHaveLength(1);
        expect(seas[0].position.y).toBe(0);
        expect(seas[0].userData.part).toBe('floor');
        const [x, z] = world(env, 170, 60);
        expect(topHit(scene, ['ground', 'floor'], x, z).name).toBe('floor-sea');
        // On the beach, 4 m past the road edge, the ground is within 4 m of the road
        const road = env.roadPath[225].y;
        const [bx, bz] = world(env, 225, 14);
        const beach = topHit(scene, ['ground', 'floor'], bx, bz);
        expect(beach.name).not.toBe('floor-sea');
        expect(Math.abs(beach.y - road)).toBeLessThan(4);
        // Water does not ride in the leg's backdrop: no fixed peaks
        const mountains = [];
        scene.traverse(object => { if (object.userData.type === 'mountain') mountains.push(object); });
        expect(mountains).toHaveLength(0);
    });

    test('coast: rock dressing hangs on the sea cliff only, and nothing grows on the beach', () => {
        const { env, scene } = leg(COAST);
        const decals = [];
        scene.traverse(object => { if (object.userData && object.userData.decal) decals.push(object); });
        expect(decals.length).toBeGreaterThan(0);
        decals.forEach(decal => {
            const lateral = lateralOf(env, decal.position.x, decal.position.z);
            // A right-hand decal is on the cliff, so before the beach
            if (lateral > 0) {
                let nearest = env.startSegment;
                let best = Infinity;
                for (let i = env.startSegment; i <= env.endSegment + 20; i++) {
                    const point = env.roadPath[i];
                    const d = (decal.position.x - point.x) ** 2 + (decal.position.z - point.z) ** 2;
                    if (d < best) { best = d; nearest = i; }
                }
                expect(nearest).toBeLessThanOrEqual(217);
            }
        });
        // Trees stand only where the face is 15 m over the sea: none on the beach third
        const matrix = new game.THREE.Matrix4();
        scene.traverse(object => {
            if (!object.isInstancedMesh) return;
            for (let n = 0; n < object.count; n++) {
                object.getMatrixAt(n, matrix);
                expect(matrix.elements[13]).toBeGreaterThanOrEqual(14);
            }
        });
        // The land side is a hill: the roadworks plant is not built up it, and nothing is solid
        expect(env.boulders.filter(b => b.solid)).toHaveLength(0);
        expect(env.groundedObjects.filter(({ label }) => /construction bulldozer|construction barrier|work truck/.test(label))).toEqual([]);
        expect(env.roadworkObstacles.map(o => o.type).sort()).toEqual(['container', 'container']);
    });

    test('ridge: a frozen lake at -200 under both sides, and no water', () => {
        const { env, scene } = leg(RIDGE);
        const floors = [];
        scene.traverse(object => { if (object.userData.part === 'floor') floors.push(object); });
        expect(floors).toHaveLength(1);
        expect(floors[0].name).toBe('floor-lake');
        expect(floors[0].position.y).toBe(-200);
        expect(floors[0].material.name).toBe('ice');
        const [x, z] = world(env, 650, 60);
        expect(topHit(scene, ['ground', 'floor'], x, z).y).toBeCloseTo(env.roadPath[650].y - 40, 0);
    });

    test('ridge: snowy conifers on the slopes only, none within 12 m of the road edge, none reachable', () => {
        const { env, scene } = leg(RIDGE);
        const laterals = treeLaterals(env, scene).map(Math.abs);
        expect(laterals.length).toBeGreaterThan(100);
        expect(laterals.length).toBeLessThanOrEqual(1400);
        expect(Math.min(...laterals)).toBeGreaterThanOrEqual(env.roadWidth / 2 + 12 - 0.5);
        expect(env.boulders.filter(b => b.label === 'tree')).toHaveLength(0);
        // No walls on either side, so no rock face to dress
        const decals = [];
        scene.traverse(object => { if (object.userData && object.userData.decal) decals.push(object); });
        expect(decals).toHaveLength(0);
    });

    test('ridge: a high pass, with peaks clear of the road, poles and cairns on the snowfield and a summit marker', () => {
        const { env, scene } = leg(RIDGE);
        const halfRoad = env.roadWidth / 2;
        const named = name => {
            let found = null;
            scene.traverse(object => { if (object.name === name) found = object; });
            return found;
        };
        // Peaks either side, none within its radius plus 60 m of the road drawn
        expect(env.passPeaks.length).toBeGreaterThan(20);
        expect(new Set(env.passPeaks.map(peak => Math.sign(lateralOf(env, peak.x, peak.z)))).size).toBe(2);
        env.passPeaks.forEach(peak => {
            for (let i = env.startSegment; i <= env.endSegment + 20; i++) {
                expect(Math.hypot(peak.x - env.roadPath[i].x, peak.z - env.roadPath[i].z)).toBeGreaterThanOrEqual(peak.radius + 60);
            }
        });
        // Poles stand in the snowfield, sunk 0.3 m into the ground under them
        const poles = named('snow-poles');
        const matrix = new game.THREE.Matrix4();
        expect(poles.count).toBeGreaterThan(150);
        for (let n = 0; n < poles.count; n++) {
            poles.getMatrixAt(n, matrix);
            const [x, y, z] = [matrix.elements[12], matrix.elements[13], matrix.elements[14]];
            expect(Math.abs(Math.abs(lateralOf(env, x, z)) - (halfRoad + 3.5))).toBeLessThan(0.6);
            expect(y).toBeCloseTo(env.groundYAt(x, z) - 0.3, 1);
        }
        // Cairns and the summit posts are solid, inside the snowfield a bike can reach
        const cairns = env.boulders.filter(b => b.label === 'cairn');
        expect(cairns.length).toBe(named('cairns').count);
        expect(cairns.length).toBeGreaterThanOrEqual(8);
        [...cairns, ...env.boulders.filter(b => b.label === 'summit marker post')].forEach(b => {
            expect(b.solid).toBe(true);
            expect(Math.abs(lateralOf(env, b.position.x, b.position.z)) + b.radius).toBeLessThanOrEqual(halfRoad + 6);
        });
        // The marker stands short of the finish, where the gantry is
        expect(named('summit-marker')).not.toBeNull();
        expect(env.summitSegment).toBeLessThanOrEqual(env.endSegment - 4);
        expect(env.summitSegment).toBeGreaterThan(env.endSegment - 20);
    });

    test('only the pass has pass dressing', () => {
        const { scene } = leg(COAST);
        scene.traverse(object => expect(['snow-poles', 'cairns', 'summit-marker', 'pass-peaks']).not.toContain(object.name));
        expect(leg(COAST).env.passPeaks).toBeUndefined();
    });

    test('ridge: the roadworks plant stands on the snowfield as solid circles, and the legacy entries are gone', () => {
        const { env } = leg(RIDGE);
        const halfRoad = env.roadWidth / 2;
        const plant = env.boulders.filter(b => b.solid && /bulldozer|barrier|work truck/.test(b.label));
        expect(plant.length).toBeGreaterThanOrEqual(5);
        plant.forEach(b => {
            const lateral = lateralOf(env, b.position.x, b.position.z);
            expect(lateral).toBeLessThan(-halfRoad);
            // Past the road edge, and inside the 6 m snowfield (the plant is up to 3 m wide)
            expect(-lateral).toBeGreaterThan(halfRoad + 0.5);
            expect(-lateral).toBeLessThan(halfRoad + 6 + 1);
        });
        expect(env.roadworkObstacles.map(o => o.type).sort()).toEqual(['container', 'container']);
    });

    test('ridge: the plant is pinned inside the 7 m of run-off the ridge allows, not at the valley-run offsets', () => {
        // The ridge allows run-off to halfRoad + 7 = 15, so the plan's -17/-14/-14 would be over the drop
        const { env } = leg(RIDGE);
        // A barrier or truck is two circles side by side along its length: pin the centre
        const centre = label => {
            const list = env.boulders.filter(b => b.solid && b.label === label).map(b => lateralOf(env, b.position.x, b.position.z));
            return list.reduce((sum, l) => sum + l, 0) / list.length;
        };
        expect(centre('bulldozer')).toBeCloseTo(-12.5, 1);
        expect(centre('barrier')).toBeCloseTo(-10.5, 1);
        expect(centre('work truck')).toBeCloseTo(-11, 1);
    });

    test('ridge and coast have no rockfall', () => {
        [COAST, RIDGE].forEach(index => {
            const { env, scene } = leg(index);
            const rocks = new game.RockfallSystem(scene, env);
            expect(rocks.enabled).toBe(false);
        });
    });

    test('gates reach across the snowfield and the beach, and only the ledge beside a hill or a sea cliff', () => {
        const ridge = leg(RIDGE).env;
        ridge.checkpoints.concat(ridge.finishGate).forEach(gate => {
            expect(gate.left).toBe(8 + 6 + 2);
            expect(gate.right).toBe(8 + 6 + 2);
        });
        const coast = leg(COAST).env;
        // The finish is on the beach; the hill side is the ledge, the beach side the rideable sand
        expect(coast.finishGate.segmentIndex).toBeGreaterThanOrEqual(216);
        expect(coast.finishGate.left).toBe(12);
        expect(coast.finishGate.right).toBe(10 + 20 + 2);
        // Early checkpoints are above the sea cliff: the ledge both sides
        const early = coast.checkpoints.filter(gate => gate.segmentIndex < 216);
        expect(early.length).toBeGreaterThan(0);
        early.forEach(gate => {
            expect(gate.left).toBe(12);
            expect(gate.right).toBe(12);
        });
    });

    test('the finish gate stands on beach ground, with a limit post where the sand ends', () => {
        const { env } = leg(COAST);
        const posts = env.groundedObjects.filter(({ label }) => /finish gate limit post$/.test(label));
        expect(posts).toHaveLength(1);
        const gate = env.finishGate;
        const lateral = lateralOf(env, posts[0].object.position.x, posts[0].object.position.z);
        expect(lateral).toBeCloseTo(gate.right - 2, 0);
    });
});

describe('the bike on the coast and the ridge', () => {
    let game;
    let log;
    const envs = new Map();

    beforeAll(() => {
        log = [];
        game = loadGame(undefined, log);
    });

    function environment(index) {
        if (!envs.has(index)) envs.set(index, buildEnvironment(game, index));
        const entry = envs.get(index);
        // Ground and the sea, not the clutter on it: trunks and rocks get their own tests
        entry.env.boulders = [];
        return entry;
    }

    function place(index, segment, lateral, speed) {
        const { env, scene } = environment(index);
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

    function ride(vehicle, ticks) {
        log.length = 0;
        const history = [null];
        for (let tick = 1; tick <= ticks; tick++) {
            vehicle.update(DT, 0, 0, 0);
            history.push({
                speed: vehicle.speed,
                y: vehicle.position.y,
                crashed: vehicle.crashed,
                falling: vehicle.fallingOffCliff,
                hitGround: vehicle.hitGround,
                finite: Number.isFinite(vehicle.position.y)
            });
        }
        const crashTick = history.findIndex(entry => entry && entry.crashed);
        return { history, crashTick: crashTick === -1 ? null : crashTick, lines: log.filter(line => CRASHES.test(line)) };
    }

    const roadYAt = (index, segment) => environment(index).env.roadPath[segment].y;
    const lateralFrom = (env, vehicle, segment) => {
        const point = env.roadPath[segment];
        return (vehicle.position.x - point.x) * Math.cos(point.heading) - (vehicle.position.z - point.z) * Math.sin(point.heading);
    };

    test.each([[-15, -1, Math.PI / 4, 'LEFT'], [15, 1, -Math.PI / 4, 'RIGHT']])(
        'ridge: lateral %i goes over the edge at once, stays finite, and comes to rest 40 m under the road',
        (lateral, fallSide, crashAngle, name) => {
            const segment = 650;
            const vehicle = place(RIDGE, segment, lateral, 25);
            const startY = vehicle.position.y;
            const { history, crashTick, lines } = ride(vehicle, 1500);

            expect(crashTick).toBe(1);
            expect(history[1].falling).toBe(true);
            expect(vehicle.fallSide).toBe(fallSide);
            expect(vehicle.crashAngle).toBeCloseTo(crashAngle, 12);
            expect(lines).toContain(`=== FALLING OFF ${name} EDGE ===`);
            expect(history.slice(1).every(entry => entry.finite)).toBe(true);
            expect(history[60].y).toBeLessThan(startY - 3);
            const landed = history.findIndex(entry => entry && entry.hitGround);
            expect(landed).toBeGreaterThanOrEqual(120);
            expect(landed).toBeLessThanOrEqual(1500);
            // Final height: 40 m under the road here, plus the bike's half metre
            const located = roadYAt(RIDGE, vehicle.currentRoadSegment);
            expect(Math.abs(vehicle.position.y - (located - 40 + 0.5))).toBeLessThanOrEqual(0.5);
        }
    );

    test('ridge: the snowfield is run-off, slows the bike, and crashes it once after 6 s', () => {
        const { history, crashTick, lines } = ride(place(RIDGE, 650, 12, 25), 600);
        expect(history[60].speed).toBeLessThan(history[1].speed);
        expect(history[60].speed).toBeGreaterThan(6);
        // 6 s of run-off, a tick for the bike to reach the snowfield
        expect(crashTick).toBeGreaterThanOrEqual(360);
        expect(crashTick).toBeLessThanOrEqual(362);
        expect(lines.filter(line => line.startsWith('CRASHED! Off the road'))).toHaveLength(1);
        expect(lines.some(line => line.includes('FALLING OFF'))).toBe(false);
    });

    test('ridge: the bike rides on the snowfield ground, not the road height', () => {
        const segment = 650;
        const vehicle = place(RIDGE, segment, 8 + 3, 25);
        ride(vehicle, 3);
        const { env } = environment(RIDGE);
        const road = env.roadPath[segment].y;
        const ground = env.groundYAt(vehicle.position.x, vehicle.position.z);
        expect(Math.abs(ground - road)).toBeLessThan(0.5);
        expect(Math.abs(vehicle.position.y - ground)).toBeLessThan(1.2);
    });

    // The segment on the sea cliff where the drop to the sea's rest height is 10 m, to within 1
    function lowCliff() {
        const { env } = environment(COAST);
        let found = null;
        for (let i = env.startSegment; i < 216; i++) {
            if (Math.abs(env.roadPath[i].y - 0.5 - 10) <= 1) found = i;
        }
        return found;
    }

    test('coast: a low sea cliff drops onto the sand at the sea, and the bike comes to rest there', () => {
        const segment = lowCliff();
        expect(segment).not.toBeNull();
        const { env } = environment(COAST);
        const vehicle = place(COAST, segment, 12.6, 25);
        const { history, crashTick, lines } = ride(vehicle, 900);

        expect(crashTick).toBe(1);
        expect(history[1].falling).toBe(true);
        expect(vehicle.fallSide).toBe(1);
        expect(lines).toContain('=== FALLING OFF RIGHT EDGE ===');
        expect(history.slice(1).every(entry => entry.finite)).toBe(true);
        expect(history.some(entry => entry && entry.hitGround)).toBe(true);
        expect(Math.abs(vehicle.position.y - (0.5 + 0.5))).toBeLessThanOrEqual(0.5);
        expect(Math.abs(lateralFrom(env, vehicle, vehicle.currentRoadSegment))).toBeLessThanOrEqual(10 + 40);
    });

    test('coast: a tall sea cliff is the same fall, from far higher up', () => {
        const vehicle = place(COAST, 160, 12.6, 25);
        const start = vehicle.position.y;
        const { history, crashTick } = ride(vehicle, 1200);
        expect(start).toBeGreaterThan(40);
        expect(crashTick).toBe(1);
        expect(history.slice(1).every(entry => entry.finite)).toBe(true);
        expect(history.some(entry => entry && entry.hitGround)).toBe(true);
        expect(vehicle.position.y).toBeLessThan(2);
        expect(vehicle.position.y).toBeGreaterThanOrEqual(0.5);
    });

    test('coast: the beach is run-off, not a fall: the bike rides it, is slowed, and crashes only at 6 s', () => {
        const { history, crashTick, lines } = ride(place(COAST, 222, 10 + 6, 25), 600);
        expect(history[1].falling).toBe(false);
        expect(history[60].speed).toBeLessThan(history[1].speed);
        expect(crashTick).toBeGreaterThanOrEqual(360);
        expect(crashTick).toBeLessThanOrEqual(362);
        expect(lines.filter(line => line.startsWith('CRASHED! Off the road'))).toHaveLength(1);
    });

    test('coast: past the sand the shore is a fall into the sea', () => {
        const vehicle = place(COAST, 226, 10 + 21, 25);
        const { history, crashTick, lines } = ride(vehicle, 900);
        expect(crashTick).toBe(1);
        expect(history[1].falling).toBe(true);
        expect(lines).toContain('=== FALLING OFF RIGHT EDGE ===');
        expect(history.slice(1).every(entry => entry.finite)).toBe(true);
        expect(history.some(entry => entry && entry.hitGround)).toBe(true);
    });

    test('coast: the hill side is a wall, as on the cliff legs', () => {
        [170, 225].forEach(segment => {
            const vehicle = place(COAST, segment, -11.5, 25);
            const { history, crashTick, lines } = ride(vehicle, 5);
            expect(crashTick).toBe(1);
            expect(history[1].falling).toBe(false);
            expect(lines.some(line => line.startsWith('CRASHED! Hit the left wall at'))).toBe(true);
        });
    });

    test('coast: the same bike offset 12.6 is a fall just before the beach and run-off just after it', () => {
        const before = ride(place(COAST, 215, 12.6, 25), 2);
        const after = ride(place(COAST, 216, 12.6, 25), 2);
        expect(before.history[1].falling).toBe(true);
        expect(after.history[1].falling).toBe(false);
        expect(after.history[2].crashed).toBe(false);
    });

    test('coast: coasting on the road never crashes, from the top to the beach', () => {
        [155, 200, 230].forEach(segment => {
            const { crashTick } = ride(place(COAST, segment, 0, 25), 300);
            expect(crashTick).toBeNull();
        });
    });
});
