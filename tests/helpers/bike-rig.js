// The bikes as Vehicle draws them, for the checks on their moving parts
// (tests/unit/bike-wheels.test.js, bike-footing.test.js, bike-stand.test.js,
// brake-discs.test.js): the real vehicle.js, sceneassets.js and bikemodels.js
// on real three r150, the model files read from disk, and every bike the game
// draws: each detailed bike, each procedural kind's file, and each procedural
// kind built from primitives (the stand-in while a file loads).
import { readFileSync } from 'node:fs';
import { Blob } from 'node:buffer';
import { TextDecoder } from 'node:util';
import { canvasStub, loadScript, realThree } from './load-game.js';

const root = new URL('../../', import.meta.url);

export function loadBikes({ failing = [] } = {}) {
    const THREE = realThree();
    const source = ['vehicle.js', 'sceneassets.js', 'bikemodels.js', 'traffic.js'].map(loadScript).join('\n;\n');
    const log = [];
    const fetched = [];
    const sink = { log() {}, warn: (...a) => log.push(a.join(' ')), error: (...a) => log.push(a.join(' ')) };
    const fetch = async url => {
        fetched.push(url);
        if (failing.some(part => url.includes(part))) return { ok: false, status: 404 };
        const bytes = readFileSync(new URL(url, root));
        return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
    };
    const factory = new Function(
        'THREE', 'document', 'localStorage', 'console', 'fetch', 'Blob', 'TextDecoder', 'performance',
        `${source}\nreturn { Vehicle, CHARACTERS, OUTFITS, SceneAssets, BikeModels, BIKE_MODELS, AIMotorcycle, Traffic };`
    );
    return { THREE, log, fetched, ...factory(THREE, canvasStub(), { getItem: () => null, setItem() {} }, sink, fetch, Blob, TextDecoder, performance) };
}

// [label, bike id, modelled]: every detailed bike, every procedural kind's
// file and every procedural kind from primitives
export function everyBike(game) {
    const kinds = Object.keys(game.BikeModels.MODELS);
    return [
        ...Object.keys(game.BIKE_MODELS).map(id => [id, id, true]),
        ...kinds.map(id => [`${id}.glb`, id, true]),
        ...kinds.map(id => [`procedural ${id}`, id, false])
    ];
}

// A bike ridden by Steve (who may ride any of them here), modelled or not,
// at rest at the origin
export async function rideAny(game, id, modelled) {
    if (modelled) await game.BikeModels.preload([id]);
    const rider = { ...game.CHARACTERS[0], bikes: [id] };
    const vehicle = new game.Vehicle(new game.THREE.Scene(), null, rider, id, modelled ? {} : { model: false });
    if (modelled && !vehicle.modelled) throw new Error(`${id} did not take its model: ${game.log.join('; ')}`);
    return vehicle;
}

// The part an object draws near the camera: a THREE.LOD's first level
export const near = object => (object.isLOD ? object.levels[0].object : object);

// Every vertex of `object` (its near level) in the axes of `frame`
export function vertices(THREE, object, frame) {
    frame.updateMatrixWorld(true);
    const into = frame.matrixWorld.clone().invert();
    const list = [];
    const m = new THREE.Matrix4();
    near(object).traverse(o => {
        if (!o.isMesh) return;
        m.multiplyMatrices(into, o.matrixWorld);
        const position = o.geometry.attributes.position;
        for (let i = 0; i < position.count; i++) list.push(new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(m));
    });
    return list;
}

// The unit normal of a near-flat cloud of points: the eigenvector of its
// covariance with the smallest eigenvalue (Jacobi rotations on a 3x3). With
// `largest`, the eigenvector with the largest: the line of a long cloud.
export function planeNormal(list, largest = false) {
    const mid = [0, 1, 2].map(a => list.reduce((s, p) => s + p[a], 0) / list.length);
    const m = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (const p of list) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m[i][j] += (p[i] - mid[i]) * (p[j] - mid[j]);
    const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (let sweep = 0; sweep < 50; sweep++) {
        for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
            if (Math.abs(m[p][q]) < 1e-15) continue;
            const theta = (m[q][q] - m[p][p]) / (2 * m[p][q]);
            const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
            const c = 1 / Math.sqrt(t * t + 1), s = t * c;
            for (let k = 0; k < 3; k++) {
                const a = m[k][p], b = m[k][q];
                m[k][p] = c * a - s * b; m[k][q] = s * a + c * b;
            }
            for (let k = 0; k < 3; k++) {
                const a = m[p][k], b = m[q][k];
                m[p][k] = c * a - s * b; m[q][k] = s * a + c * b;
            }
            for (let k = 0; k < 3; k++) {
                const a = v[k][p], b = v[k][q];
                v[k][p] = c * a - s * b; v[k][q] = s * a + c * b;
            }
        }
    }
    const pick = [0, 1, 2].reduce((best, i) => ((largest ? m[i][i] > m[best][best] : m[i][i] < m[best][best]) ? i : best), 0);
    return { normal: [v[0][pick], v[1][pick], v[2][pick]], mid };
}
