// The real js/terrain.js and the Environment that reads it, on real three
// r150. Nothing here replicates a formula: heights come from the module and
// the drawn ribbon.
import { buildEnvironment, loadGame, loadScript, rayDown, ribbonMeshes } from '../helpers/load-game.js';

const loadTerrain = () => new Function(`${loadScript('terrain.js')}\nreturn Terrain;`)();

// A straight road along +z at height 10 with a heading of 0, so lateral is x
function straightRoad(length = 60, y = 10) {
    return Array.from({ length }, (_, i) => ({ x: 0, z: i * 20 + 10, y, heading: 0 }));
}

describe('Terrain module (pure)', () => {
    const Terrain = loadTerrain();
    const geo = { path: straightRoad(), roadWidth: 20, startSegment: 0, endSegment: 39 };
    const groundAt = (lateral, exact = false) => Terrain.groundY(Terrain.forLeg(0), geo, lateral, 400, 0, geo.path.length - 1, exact);

    test('every leg maps to the cliffLake profile for now', () => {
        expect(Terrain.LEG_PROFILES).toHaveLength(8);
        Terrain.LEG_PROFILES.forEach(profile => expect(profile).toBe(Terrain.profiles.cliffLake));
        expect(Terrain.forLeg(99)).toBe(Terrain.profiles.cliffLake);
    });

    test('the road and its 2 m ledges sit at road height', () => {
        [-12, -5, 0, 5, 12].forEach(lateral => expect(groundAt(lateral)).toBe(10));
    });

    test('the valley side drops 1.33 per unit past the ledge and floors at the lake', () => {
        expect(groundAt(22)).toBeCloseTo(10 - 10 * 1.33, 9);
        expect(groundAt(400)).toBe(-200);
    });

    test('the mountain side rises 1.6 per unit past the ledge, capped at +40', () => {
        expect(groundAt(-22)).toBeCloseTo(10 + 10 * 1.6, 9);
        expect(groundAt(-200)).toBe(50);
    });

    test('zones: the road, then each side\'s bands, with the edge where each band starts', () => {
        const kindAt = lateral => Terrain.zoneAt(Terrain.forLeg(0), 5, lateral, 10).kind;
        expect([0, 5, 10, -10].map(kindAt)).toEqual(['road', 'road', 'road', 'road']);
        // Left: shoulder to 1 past the road edge, then a wall
        expect([-10.5, -11, -11.01, -30].map(kindAt)).toEqual(['shoulder', 'shoulder', 'wall', 'wall']);
        // Right: shoulder to 2 past the road edge, then a fall
        expect([10.5, 12, 12.01, 300].map(kindAt)).toEqual(['shoulder', 'shoulder', 'fall', 'fall']);
        expect(Terrain.zoneAt(Terrain.forLeg(0), 5, -20, 10)).toMatchObject({ kind: 'wall', sign: -1, start: 11 });
        expect(Terrain.zoneAt(Terrain.forLeg(0), 5, 20, 10)).toMatchObject({ kind: 'fall', sign: 1, start: 12 });
    });

    test('the side that ends in a wall is the one rocks come off', () => {
        const { left, right, ...rest } = Terrain.profiles.cliffLake;
        expect(Terrain.wallSign(Terrain.profiles.cliffLake)).toBe(-1);
        expect(Terrain.wallSign({ ...rest, left: right, right: left })).toBe(1);
        expect(Terrain.wallSign({ ...rest, left: right, right })).toBe(0);
    });

    test('a fall ends at the water\'s rest height, else a set depth below the road, else it is refused', () => {
        const { right } = Terrain.profiles.cliffLake;
        const lake = Terrain.profiles.cliffLake;
        expect(Terrain.restY(lake, right, 30)).toBe(-195);
        const dry = { id: 'dry', floor: { kind: 'none' } };
        expect(Terrain.restY(dry, { fallDepth: 40 }, 30)).toBe(-10);
        expect(() => Terrain.restY(dry, {}, 30)).toThrow(/no rest height/);
    });

    test('a face point lies on the rendered column: the ends are rows, between them is interpolation', () => {
        const ctx = { halfRoad: 10, roadY: 30, column: 7, index: 7, pathLength: 744 };
        [Terrain.profiles.cliffLake.left, Terrain.profiles.cliffLake.right].forEach(side => {
            const foot = Terrain.facePoint(side, 0, ctx, {});
            const top = Terrain.facePoint(side, 1, ctx, {});
            expect(foot).toEqual({ d: Terrain.row(side, 0, ctx, {}).d, y: 30 });
            expect(top.d).toBeCloseTo(Terrain.row(side, Terrain.ROWS, ctx, {}).d, 9);
            expect(top.y).toBeCloseTo(Terrain.row(side, Terrain.ROWS, ctx, {}).y, 9);

            const rowA = Terrain.row(side, 10, ctx, {});
            const rowB = Terrain.row(side, 11, ctx, {});
            const middle = Terrain.facePoint(side, (10 + 0.5) / Terrain.ROWS, ctx, {});
            expect(middle.d).toBeCloseTo((rowA.d + rowB.d) / 2, 9);
            expect(middle.y).toBeCloseTo((rowA.y + rowB.y) / 2, 9);
        });
    });

    test('an empty path answers with the floor', () => {
        expect(Terrain.groundY(Terrain.forLeg(0), { path: [], roadWidth: 20 }, 0, 0, 0, -1, true)).toBe(-200);
    });

    test('a side hands rows out from its own description, whichever way it faces', () => {
        const ctx = { halfRoad: 10, roadY: 30, column: 3, index: 3, pathLength: 744 };
        const { left, right } = Terrain.profiles.cliffLake;
        const wall = Terrain.row(left, 0, ctx, {});
        const drop = Terrain.row(right, 0, ctx, {});
        expect(wall.d).toBeCloseTo(11.4, 9);
        expect(drop.d).toBeCloseTo(12, 9);
        expect(wall.y).toBe(30);
        expect(drop.y).toBe(30);
        expect(Terrain.row(left, Terrain.ROWS, ctx, {}).y).toBeGreaterThan(30);
        expect(Terrain.row(right, Terrain.ROWS, ctx, {}).y).toBeCloseTo(30 - (30 + 206), 9);
    });
});

describe('Environment reads the terrain profile', () => {
    let game;
    beforeAll(() => {
        game = loadGame();
    });

    // Build leg 1 with a stand-in profile, restoring the table afterwards
    const buildWith = (profile) => {
        const original = game.Terrain.LEGS[0].profile;
        game.Terrain.LEGS[0].profile = profile;
        try {
            return buildEnvironment(game, 0);
        } finally {
            game.Terrain.LEGS[0].profile = original;
        }
    };
    const at = (env, segment, lateral) => {
        const point = env.roadPath[segment];
        return env.groundYAt(point.x + Math.cos(point.heading) * lateral, point.z - Math.sin(point.heading) * lateral);
    };
    const firstVertex = mesh => Array.from(mesh.geometry.attributes.position.array.slice(0, 3)).map(v => Math.round(v * 1000) / 1000);

    test('elevation: road height comes from the profile, unchanged', () => {
        const { env } = buildEnvironment(game, 0);
        expect(env.roadPath).toHaveLength(744);
        expect(env.roadPath[5].y).toBeCloseTo(32.543, 3);
        expect(env.roadPath[10].y).toBeCloseTo(33.9288, 4);
        expect(env.roadPath[332].y).toBeCloseTo(27.6484, 4);

        const flat = { ...game.Terrain.profiles.cliffLake, elevation: () => 50 };
        expect(buildWith(flat).env.roadPath[10].y).toBe(50);
    });

    test('mirrored profile: heights and ribbon follow the profile, not the side sign', () => {
        const { left, right, ...rest } = game.Terrain.profiles.cliffLake;
        const mirrored = buildWith({ ...rest, left: right, right: left });
        const normal = buildEnvironment(game, 0);

        expect(at(normal.env, 10, 20)).toBeCloseTo(22.7634, 4);
        expect(at(normal.env, 10, -20)).toBeCloseTo(46.7288, 4);
        expect(at(mirrored.env, 10, 20)).toBeCloseTo(46.7288, 4);
        expect(at(mirrored.env, 10, -20)).toBeCloseTo(22.7634, 4);

        const [normalLeft, normalRight] = ribbonMeshes(normal.env);
        const [mirroredLeft, mirroredRight] = ribbonMeshes(mirrored.env);
        expect(firstVertex(normalLeft)).toEqual([-11.4, 31, 10]);
        expect(firstVertex(normalRight)).toEqual([12, 31, 10]);
        expect(firstVertex(mirroredLeft)).toEqual([-12, 31, 10]);
        expect(firstVertex(mirroredRight)).toEqual([11.4, 31, 10]);
    });

    test('the cliff helpers live in the terrain module only', () => {
        const { prototype } = game.Environment;
        ['dropOffSurfaceY', 'cliffDrop', 'cliffDisplacement', 'cliffDisplacementScale'].forEach(name => {
            expect(typeof prototype[name]).toBe('undefined');
        });
        expect(typeof prototype.buildTerrainRibbon).toBe('function');
        expect(typeof prototype.decorateRockFace).toBe('function');
    });

    test('the valley face is what groundYAt reports; the mountain wall is known to differ', () => {
        const { env, scene } = buildEnvironment(game, 0);
        const ribbons = ribbonMeshes(env);
        ribbons.forEach(mesh => { mesh.material.side = game.THREE.DoubleSide; });
        scene.updateMatrixWorld(true);
        const point = env.roadPath[10];
        const hit = lateral => rayDown(game.THREE, ribbons, point.x + lateral, point.z);
        [13, 20, 34].forEach(lateral => expect(Math.abs(hit(lateral) - at(env, 10, lateral))).toBeLessThanOrEqual(5e-3));
        // Today's left side keeps the plain slope, which the drawn wall does not match (phase 6 closes this)
        expect(hit(-20) - at(env, 10, -20)).toBeGreaterThan(10);
    });
});
