// Rocks and bushes sit on the drawn surface (the ribbon's own triangles), not
// on the smooth base model and not stuck to a wall: on a steep face a rock is
// sunk into the face and takes its colour, on gentle ground it rests, and no bush roots in a face
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
const FACE_AIR = 0.16;
const REST_AIR = 0.7;
const HANG = 0.3;

// A rock seated as part of a face (a steep one, or a bench of a wall) is sunk
// along the face normal by at least this share of its thickness, so the cap
// left out is at most 35% of it, and reaches no further than this from its
// centre (js/environment.js: FACE_SINK, FACE_ROCK_REACH)
const FACE_SUNK = 0.65;
const FACE_REACH = 1.6;
// The legs with a rock face beside the road, whose rocks are outcrops of it
const WALL_LEGS = [1, 2, 3];
// A rock's colour lies within the colours its face has within this many
// metres of it, give or take SHADE on each channel (the rock's own shade)
const NEAR = 6;
const SHADE = 0.06;

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
            if (kind === 'rock' || kind === 'debris') items.push({ kind, matrix: object.matrixWorld, radius: object.userData.dressing.radius, geometry: object.geometry, label: kind, object });
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
        const ribbons = Object.values(env.ribbons);
        // The span of the face's colours near a point, over both ribbons
        const faceColours = centre => {
            const span = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], map: null, gap: Infinity };
            for (const ribbon of ribbons) {
                const at = ribbon.geometry.attributes.position;
                const colour = ribbon.geometry.attributes.color;
                for (let n = 0; n < at.count; n++) {
                    const gap = Math.hypot(at.getX(n) - centre.x, at.getY(n) - centre.y, at.getZ(n) - centre.z);
                    if (gap < span.gap) { span.gap = gap; span.map = ribbon.material.map; }
                    if (gap > NEAR) continue;
                    [colour.getX(n), colour.getY(n), colour.getZ(n)].forEach((v, c) => {
                        span.min[c] = Math.min(span.min[c], v);
                        span.max[c] = Math.max(span.max[c], v);
                    });
                }
            }
            return span;
        };

        const results = items.map(({ kind, matrix, radius, geometry, label, object }) => {
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
            const result = { kind, label, face: surface.least < FACE_NORMAL_Y, ny: surface.ny, air, hang: clear(lowest), at: centre.toArray().map(v => Math.round(v * 10) / 10) };
            const seat = object && object.userData.seat;
            if (seat && seat.face) {
                // How far the centre lies under the seat along its normal, in
                // thicknesses: the centre is the seat moved down the normal
                const scale = new THREE.Vector3().setFromMatrixScale(matrix);
                result.reach = radius * Math.max(scale.x, scale.z);
                result.sunk = (seat.y - centre.y) / (seat.ny * radius * scale.y);
            }
            if (object && WALL_LEGS.includes(index)) {
                const colour = geometry.attributes.color;
                const span = faceColours(centre);
                result.colour = colour ? [colour.getX(0), colour.getY(0), colour.getZ(0)] : null;
                result.span = span;
                result.sameRock = object.material.map === span.map && object.material.vertexColors === true;
            }
            return result;
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

    test.each(WALL_LEGS)('leg %i: a rock of a wall is an outcrop of it: the face\'s texture, and a colour the face has nearby', (index) => {
        const rocks = measure(index).filter(r => r.colour !== undefined);
        expect(rocks.length).toBeGreaterThan(80);
        expect(rocks.filter(r => !r.colour || !r.sameRock).map(r => r.at)).toEqual([]);
        const off = rocks.filter(r => r.colour.some((v, c) => v < r.span.min[c] - SHADE || v > r.span.max[c] + SHADE));
        expect(off.map(r => ({ at: r.at, colour: r.colour, min: r.span.min, max: r.span.max }))).toEqual([]);
    });

    test.each(LEGS)('leg %i: a rock seated in a face is small and shows a low cap only', (index) => {
        const seated = measure(index).filter(r => r.reach !== undefined);
        expect(seated.filter(r => r.reach > FACE_REACH + 1e-6).map(r => ({ at: r.at, reach: r.reach }))).toEqual([]);
        expect(seated.filter(r => r.sunk < FACE_SUNK).map(r => ({ at: r.at, sunk: r.sunk }))).toEqual([]);
        if (WALL_LEGS.includes(index)) expect(seated.length).toBeGreaterThan(40);
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
