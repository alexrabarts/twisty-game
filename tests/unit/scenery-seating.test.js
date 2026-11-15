// Rocks and bushes sit on the drawn surface (the ribbon's own triangles), not
// on the smooth base model and not stuck to a wall: on a steep face a rock is
// sunk into the face, on gentle ground it rests, and no bush roots in a face
// steeper than a plant could hold. High-pass is bound to the frozen golden and
// keeps its old placement, so it is not measured here.
import { buildEnvironment, loadGame } from '../helpers/load-game.js';

const FROZEN = 4;
const LEGS = [0, 1, 2, 3, 5, 6, 7];

// Steeper than this (40 degrees) is a face. Placement already treats 35 as a
// face, so a rock seated on a bench just under that is judged as resting.
const FACE_NORMAL_Y = Math.cos((40 * Math.PI) / 180);
// The share of a rock on a face that may stand clear of it, of a rock resting
// on gentle ground, and how far any lowest point may stand over the ground.
// Placement judges a face from 35 degrees and sinks a rock further the
// steeper the face (js/environment.js: ROCK_AIR, ROCK_PERCH, ROCK_HANG).
const FACE_AIR = 0.25;
const REST_AIR = 0.7;
const HANG = 0.3;

// A grid of points through the unit ball, evenly spread through its bulk
const BALL = [];
for (let i = -2; i <= 2; i++) {
    for (let j = -2; j <= 2; j++) {
        for (let k = -2; k <= 2; k++) {
            const p = [i / 2.5, j / 2.5, k / 2.5];
            if (Math.hypot(...p) <= 1) BALL.push(p);
        }
    }
}

describe('rocks and bushes sit on the drawn surface', () => {
    let game;
    const measured = new Map();

    beforeAll(() => {
        game = loadGame();
    });

    // Every rock (with its radius and matrix) and bush of a leg, measured
    function measure(index) {
        if (measured.has(index)) return measured.get(index);
        const { THREE, Terrain } = game;
        const { env, scene } = buildEnvironment(game, index);
        const last = env.roadPath.length - 1;
        const clear = p => Terrain.clearance(env.terrain, env.terrainGeometry, p.x, p.y, p.z, 0, last);

        const items = [];
        scene.traverse(object => {
            if (!object.isMesh) return;
            const kind = object.userData.dressing && object.userData.dressing.kind;
            if (kind === 'rock' || kind === 'debris') items.push({ kind, matrix: object.matrixWorld, radius: object.userData.dressing.radius, geometry: object.geometry, label: kind });
            if (object.name === 'outcrops') {
                for (let n = 0; n < object.count; n++) {
                    const matrix = new THREE.Matrix4();
                    object.getMatrixAt(n, matrix);
                    items.push({ kind: 'rock', matrix, radius: 1, geometry: object.geometry, label: `outcrop ${n}` });
                }
            }
        });
        env.groundedObjects.filter(({ label }) => /bush/.test(label)).forEach(({ object, label }) => {
            items.push({ kind: 'bush', matrix: object.matrixWorld, radius: 1, geometry: object.geometry, label });
        });

        const point = new THREE.Vector3();
        const results = items.map(({ kind, matrix, radius, geometry, label }) => {
            const ball = matrix.clone().multiply(new THREE.Matrix4().makeScale(radius, radius, radius));
            const centre = new THREE.Vector3().setFromMatrixPosition(matrix);
            const surface = Terrain.surfaceAt(env.terrain, env.terrainGeometry, centre.x, centre.z, 0, last);
            const air = BALL.filter(p => clear(point.set(...p).applyMatrix4(ball)) > 0.02).length / BALL.length;
            const position = geometry.attributes.position;
            const lowest = new THREE.Vector3(0, Infinity, 0);
            for (let i = 0; i < position.count; i++) {
                point.fromBufferAttribute(position, i).applyMatrix4(matrix);
                if (point.y < lowest.y) lowest.copy(point);
            }
            return { kind, label, face: surface.least < FACE_NORMAL_Y, ny: surface.ny, air, hang: clear(lowest), at: centre.toArray().map(v => Math.round(v * 10) / 10) };
        });
        measured.set(index, results);
        return results;
    }

    test.each(LEGS)('leg %i: a rock on a face is sunk into it, a resting rock does not overhang, no lowest point hangs in the air', (index) => {
        const results = measure(index);
        const rocks = results.filter(r => r.kind !== 'bush');
        expect(rocks.filter(r => r.kind === 'rock' && r.face && r.air > FACE_AIR)).toEqual([]);
        expect(rocks.filter(r => r.kind === 'rock' && !r.face && r.air > REST_AIR)).toEqual([]);
        expect(results.filter(r => r.hang > HANG)).toEqual([]);
    });

    test.each(LEGS)('leg %i: no bush roots in a face', (index) => {
        expect(measure(index).filter(r => r.kind === 'bush' && r.face)).toEqual([]);
    });

    test('the wall legs keep a rock field on their faces, sunk in', () => {
        // Valley-run (its wall), coastal-descent and the gorge
        for (const index of [1, 2, 3]) {
            const onFace = measure(index).filter(r => r.kind === 'rock' && r.face && !/outcrop/.test(r.label));
            expect(onFace.length).toBeGreaterThan(40);
        }
    });

    test('high-pass is not seated by the drawn triangles: its golden recorded the column walk', () => {
        expect(game.Terrain.LEGS[FROZEN].profile.columnWalk).toBe(true);
        expect(LEGS).not.toContain(FROZEN);
    });
});
