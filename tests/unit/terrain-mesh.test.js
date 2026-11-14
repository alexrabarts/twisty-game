// Rock dressing reads the profile's face description, not the side sign.
import { buildEnvironment, decalMeshes, groundedRecords, loadGame, rayDown, ribbonMeshes } from '../helpers/load-game.js';

describe('embedded rock spread reads side.face.rockSpread', () => {
    let game;
    beforeAll(() => {
        game = loadGame();
    });

    const cliffLake = () => game.Terrain.profiles.cliffLake;
    const withSpread = (profile, leftSpread, rightSpread) => ({
        ...profile,
        left: { ...profile.left, face: { ...profile.left.face, rockSpread: leftSpread } },
        right: { ...profile.right, face: { ...profile.right.face, rockSpread: rightSpread } }
    });

    // Distance past the road edge of each embedded rock, by side
    function spreads(profile) {
        const original = game.Terrain.LEGS[0].profile;
        game.Terrain.LEGS[0].profile = profile;
        let built;
        try {
            built = buildEnvironment(game, 0);
        } finally {
            game.Terrain.LEGS[0].profile = original;
        }
        const { env } = built;
        const bySide = { '-1': [], 1: [] };
        groundedRecords(env).forEach(({ label, position }) => {
            const match = /^embedded cliff rock \(segment (\d+), side (-?1)\)$/.exec(label);
            if (!match) return;
            const point = env.roadPath[Number(match[1])];
            const lateral = (position[0] - point.x) * Math.cos(point.heading) - (position[2] - point.z) * Math.sin(point.heading);
            bySide[match[2]].push(Math.abs(lateral) - env.roadWidth / 2);
        });
        return { env, bySide };
    }
    const range = list => ({ n: list.length, min: Math.min(...list), max: Math.max(...list) });

    test('cliffLake keeps its measured spread on both sides', () => {
        const { bySide } = spreads(cliffLake());
        const left = range(bySide['-1']);
        const right = range(bySide[1]);
        expect(left.n).toBe(59);
        expect(left.min).toBeCloseTo(1.045, 2);
        expect(left.max).toBeCloseTo(7.854, 2);
        expect(bySide['-1'].filter(s => s > 3.5)).toHaveLength(41);
        expect(right.n).toBe(52);
        expect(right.min).toBeCloseTo(1.787, 2);
        expect(right.max).toBeCloseTo(8.741, 2);
        expect(bySide[1].filter(s => s > 3.5)).toHaveLength(37);
    });

    test('a side with no spread keeps its rocks within 3.5 of the road edge; the other side still spreads', () => {
        const flatLeft = spreads(withSpread(cliffLake(), 0, 25));
        expect(Math.max(...flatLeft.bySide['-1'])).toBeLessThanOrEqual(3.5 + 1e-9);
        expect(Math.max(...flatLeft.bySide[1])).toBeGreaterThan(3.5);

        const flatRight = spreads(withSpread(cliffLake(), 20, 0));
        expect(Math.max(...flatRight.bySide[1])).toBeLessThanOrEqual(3.5 + 1e-9);
        expect(Math.max(...flatRight.bySide['-1'])).toBeGreaterThan(3.5);

        // The spread changes sizes and positions, never the number of draws
        const cliff = spreads(cliffLake());
        expect(flatLeft.env.randState).toBe(cliff.env.randState);
        expect(flatRight.env.randState).toBe(cliff.env.randState);
    });

    test('swapping the faces swaps the spread with them', () => {
        const { left, right, ...rest } = cliffLake();
        const { bySide } = spreads({ ...rest, left: right, right: left });
        expect(bySide['-1'].some(s => s > 3.5)).toBe(true);
        expect(bySide[1].some(s => s > 3.5)).toBe(true);
    });
});

describe('decals sit on the drawn face', () => {
    let game;
    beforeAll(() => {
        game = loadGame();
    });

    const FACE_DECALS = ['crack', 'seepage', 'vine', 'snow'];

    function build(legIndex, swap = false) {
        const original = game.Terrain.LEGS[legIndex].profile;
        if (swap) {
            const { left, right, ...rest } = original;
            game.Terrain.LEGS[legIndex].profile = { ...rest, left: right, right: left };
        }
        try {
            return buildEnvironment(game, legIndex);
        } finally {
            game.Terrain.LEGS[legIndex].profile = original;
        }
    }

    // Smallest distance from the decal centre to the ribbon along +perp, -perp, up
    // and down. A decal sits exactly on a column of vertices, so the first and
    // last column are mesh edges, which a ray misses; each ray also starts 1 cm
    // either side along the road.
    function faceDistance(env, ribbons, decal) {
        const { THREE } = game;
        let nearest = env.roadPath[0];
        let best = Infinity;
        env.roadPath.forEach(point => {
            const d = (point.x - decal.position.x) ** 2 + (point.z - decal.position.z) ** 2;
            if (d < best) { best = d; nearest = point; }
        });
        const perp = new THREE.Vector3(Math.cos(nearest.heading), 0, -Math.sin(nearest.heading));
        const along = new THREE.Vector3(Math.sin(nearest.heading), 0, Math.cos(nearest.heading));
        const directions = [perp, perp.clone().negate(), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0)];
        const origins = [0.01, -0.01].map(shift => decal.position.clone().addScaledVector(along, shift));
        return Math.min(...origins.flatMap(origin => directions.map(direction => {
            const hit = new THREE.Raycaster(origin, direction).intersectObjects(ribbons, false)[0];
            return hit ? hit.distance : Infinity;
        })));
    }

    const faceDecals = env => ribbonMeshes(env)
        .flatMap(ribbon => ribbon.parent.children)
        .filter(object => FACE_DECALS.includes(object.userData.decal));

    test.each([[0, 'mountain-dawn'], [2, 'coastal-descent'], [4, 'high-pass']])('%i (%s): every decal centre is within 0.75 of the face', (legIndex) => {
        const { env, scene } = build(legIndex);
        scene.updateMatrixWorld(true);
        const ribbons = ribbonMeshes(env);
        const decals = faceDecals(env);
        expect(decals.length).toBeGreaterThan(0);
        decals.forEach(decal => expect(faceDistance(env, ribbons, decal)).toBeLessThanOrEqual(0.75));
    }, 60000);

    test('the decal set is exactly the meshes tagged userData.decal, and the counts per side are unchanged', () => {
        // Legs 1 and 5 are as the golden has them; the coast dresses its sea cliff only, not its beach
        const counts = [[13, 7], [11, 8], [13, 7]];
        [0, 4, 2].forEach((legIndex, n) => {
            const { env } = build(legIndex);
            const byTag = [];
            env.scene.traverse(object => {
                if (object.userData && object.userData.decal) byTag.push(object);
            });
            expect(new Set(byTag)).toEqual(new Set(decalMeshes(env).flat()));
            expect(decalMeshes(env).map(list => list.length)).toEqual(counts[n]);
        });
    }, 60000);

    test('a mirrored profile puts decals above the road on the rising side and below on the dropping side', () => {
        const { env, scene } = build(0, true);
        scene.updateMatrixWorld(true);
        const ribbons = ribbonMeshes(env);
        faceDecals(env).forEach(decal => {
            let nearest = env.roadPath[0];
            let best = Infinity;
            env.roadPath.forEach(point => {
                const d = (point.x - decal.position.x) ** 2 + (point.z - decal.position.z) ** 2;
                if (d < best) { best = d; nearest = point; }
            });
            const lateral = (decal.position.x - nearest.x) * Math.cos(nearest.heading) - (decal.position.z - nearest.z) * Math.sin(nearest.heading);
            if (lateral > 0) expect(decal.position.y).toBeGreaterThanOrEqual(nearest.y);
            else expect(decal.position.y).toBeLessThanOrEqual(nearest.y);
            expect(faceDistance(env, ribbons, decal)).toBeLessThanOrEqual(0.75);
        });
    }, 60000);
});

describe('the ground the bike rides is the wall it sees', () => {
    let game;
    beforeAll(() => {
        game = loadGame();
    });

    // A canyon and a sea-road hill rise from the ribbon's own first row, 1.4 m
    // past the road edge. The ground model must start the wall there too, or a
    // bike a metre into the wall rides inside it.
    test.each([
        [3, 'foggy-gorge', [239, 249, 259]],
        [2, 'coastal-descent', [175, 185, 195, 225]]
    ])('leg %i (%s): groundYAt agrees with a ray down the drawn wall at +-12 m', (legIndex, name, segments) => {
        const { env, scene } = buildEnvironment(game, legIndex);
        scene.updateMatrixWorld(true);
        const ribbons = ribbonMeshes(env);
        let checked = 0;
        segments.forEach(index => {
            const point = env.roadPath[index];
            [-12, 12].forEach(lateral => {
                const x = point.x + Math.cos(point.heading) * lateral;
                const z = point.z - Math.sin(point.heading) * lateral;
                const hit = rayDown(game.THREE, ribbons, x, z);
                if (hit === null) return;
                checked++;
                expect(Math.abs(hit - env.groundYAt(x, z))).toBeLessThanOrEqual(0.75);
            });
        });
        expect(checked).toBeGreaterThan(0);
    }, 60000);
});

describe('raycast: the drawn wall and the ground the physics reads', () => {
    let game;
    beforeAll(() => {
        game = loadGame();
    });

    // A folded wall puts a fold of its rows exactly at a lateral now and then; a
    // ray finds the highest fold there, and so must the ground model
    test.each([
        [3, 'foggy-gorge', 270, 20],
        [3, 'foggy-gorge', 270, -20],
        [4, 'high-pass', 402, -34]
    ])('leg %i (%s) seg %i, lateral %i: the highest fold of the wall, at every column', (legIndex, name, segment, lateral) => {
        const { env, scene } = buildEnvironment(game, legIndex);
        const ribbons = ribbonMeshes(env);
        ribbons.forEach(mesh => { mesh.material.side = game.THREE.DoubleSide; });
        scene.updateMatrixWorld(true);
        [0, 0.25, 0.5, 0.75].forEach(fraction => {
            const { hit, ground } = across(game, env, ribbons, segment, fraction, lateral);
            expect(hit).not.toBeNull();
            expect(Math.abs(hit - ground)).toBeLessThanOrEqual(5e-3);
        });
    }, 60000);
});

function across(game, env, ribbons, segment, fraction, lateral) {
    const a = env.roadPath[segment];
    const b = env.roadPath[segment + 1];
    const heading = a.heading + (b.heading - a.heading) * fraction;
    const x = a.x + (b.x - a.x) * fraction + Math.cos(heading) * lateral;
    const z = a.z + (b.z - a.z) * fraction - Math.sin(heading) * lateral;
    return { hit: rayDown(game.THREE, ribbons, x, z), ground: env.groundYAt(x, z) };
}

describe('span blend: the ground model blends rows at a span edge as the ribbon does', () => {
    let game;
    beforeAll(() => {
        game = loadGame();
    });

    // The tunnel on leg 7 (segments 514 to 521) and the bridge on leg 4 (285 to 292)
    test.each([
        [6, 'night-ride tunnel', [512, 513, 514, 520, 521, 522], 8],
        [3, 'foggy-gorge bridge', [284, 285, 292, 293], 10]
    ])('leg %i (%s): ray and groundYAt agree at the edges, columns 0 to 0.75', (legIndex, name, segments, halfRoad) => {
        const { env, scene } = buildEnvironment(game, legIndex);
        const ribbons = ribbonMeshes(env);
        ribbons.forEach(mesh => { mesh.material.side = game.THREE.DoubleSide; });
        scene.updateMatrixWorld(true);
        let checked = 0;
        segments.forEach(segment => [-20, -12, -10, 10, 12, 20].forEach(lateral => [0, 0.25, 0.5, 0.75].forEach(fraction => {
            const { hit, ground } = across(game, env, ribbons, segment, fraction, lateral);
            // Nothing is drawn on the road itself
            if (hit === null) return;
            checked++;
            // The first drawn row of the ribbon, at the road edge, is a ledge a ray finds a little off the model
            const bound = Math.abs(lateral) <= halfRoad + 0.5 ? 0.12 : 5e-3;
            expect(Math.abs(hit - ground)).toBeLessThanOrEqual(bound);
        })));
        expect(checked).toBeGreaterThan(60);
    }, 60000);
});
