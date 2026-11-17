// Helpers for the sections of a converted leg (tests/unit/sections.test.js
// and the per-leg course tests): build, hash, seams and ground reads.
import { createHash } from 'node:crypto';
import { loadGame } from './load-game.js';
import { FIXTURE_LEG, fixtureCourse } from '../fixtures/course-fixture.js';

export const quietly = (work) => {
    const log = console.log;
    console.log = () => {};
    try {
        return work();
    } finally {
        console.log = log;
    }
};

// A game with the course installed on leg `legIndex` (the fixture by default)
export function courseGame(install = (game) => {
    game.Course.LEGS[FIXTURE_LEG] = fixtureCourse(game.Terrain);
    game.Terrain.adopt(game.Course.LEGS);
}) {
    const game = loadGame();
    install(game);
    return game;
}

// A built environment and its cones; `options` reach the Environment constructor
export function build(game, legIndex, options) {
    return quietly(() => {
        const leg = new game.TourSystem().legs[legIndex];
        const scene = new game.THREE.Scene();
        const env = new game.Environment(scene, leg.startSegment, leg.endSegment, legIndex, options);
        const cones = new game.Cones(scene, env);
        return { env, scene, cones };
    });
}

export function buildAll(env) {
    quietly(() => env.sections.forEach((section) => env.buildSectionNow(section)));
}

const bytes = (typed) => Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);

// One hash per section: every mesh under it (type, world matrix, positions,
// colours, instance matrices), sorted, and its cones' positions
export function sectionHash(section) {
    section.group.updateMatrixWorld(true);
    const lines = [];
    section.group.traverse((object) => {
        if (!object.isMesh) return;
        const hash = createHash('sha256');
        hash.update(`${object.type}|`);
        hash.update(bytes(new Float64Array(object.matrixWorld.elements)));
        hash.update(bytes(object.geometry.attributes.position.array));
        if (object.geometry.attributes.color) hash.update(bytes(object.geometry.attributes.color.array));
        if (object.isInstancedMesh) hash.update(bytes(object.instanceMatrix.array.subarray(0, object.count * 16)));
        lines.push(hash.digest('hex'));
    });
    const cones = section.cones.map((cone) => [cone.position.x, cone.position.y, cone.position.z].join(',')).sort();
    return createHash('sha256').update(lines.sort().join('\n')).update(cones.join('|')).digest('hex').slice(0, 16);
}

// The ribbon of side `sign` that holds leg-wide column `column`
const ribbonAt = (game, env, sign, column) => {
    const rows = game.Terrain.ROWS + 1;
    const found = [];
    env.sections.forEach((section) => section.group && section.group.traverse((object) => {
        if (!object.isMesh || object.userData.side !== sign || object.userData.firstColumn === undefined) return;
        const columns = object.geometry.attributes.position.count / rows;
        if (column >= object.userData.firstColumn && column < object.userData.firstColumn + columns) found.push(object);
    }));
    return found;
};

export function seamReport(game, env) {
    const H = game.Terrain.COLUMNS_PER_SEGMENT;
    const rows = game.Terrain.ROWS + 1;
    let seams = 0;
    let mismatches = 0;
    let worstNormal = 0;
    env.sections.slice(1).forEach((section) => {
        const column = section.from * H;
        for (const sign of [-1, 1]) {
            const both = ribbonAt(game, env, sign, column);
            if (both.length !== 2) {
                mismatches++;
                continue;
            }
            seams++;
            const [a, b] = both.map((mesh) => {
                const at = (column - mesh.userData.firstColumn) * rows;
                const slice = (name, size) => Array.from(mesh.geometry.attributes[name].array.slice(at * size, (at + rows) * size));
                return { position: slice('position', 3), color: slice('color', 3), normal: slice('normal', 3) };
            });
            if (a.position.some((v, n) => v !== b.position[n])) mismatches++;
            if (a.color.some((v, n) => v !== b.color[n])) mismatches++;
            a.normal.forEach((v, n) => { worstNormal = Math.max(worstNormal, Math.abs(v - b.normal[n])); });
        }
    });
    return { seams, mismatches, worstNormal };
}

// Ground read against a ray down through the drawn ground meshes, at
// `count` points: half within 2 m of a section boundary
export function groundReport(game, env, count = 200) {
    const { THREE, Terrain } = game;
    const ground = [];
    const verge = [];
    env.scene.traverse((object) => {
        // The verge strip sits 0.1 under the road on purpose (it would flicker
        // through it): it is read only where it is all that is drawn, the
        // shoulder between the road edge and a rock side's first row
        if (object.isMesh && object.userData.part === 'ground') (object.userData.type === 'terrain' ? verge : ground).push(object);
    });
    env.scene.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    const last = env.roadPath.length - 1;
    const read = (x, z) => Terrain.groundY(env.terrain, env.terrainGeometry, x, z, 0, last, true);
    let seed = 7;
    const random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
    };
    const points = [];
    const built = env.sections.filter((section) => section.state === 'built');
    const legEnd = env.endSegment;
    for (let n = 0; n < count; n++) {
        let s;
        if (n % 2 === 0 && built.length > 1) {
            const boundary = built[1 + Math.floor(random() * (built.length - 1))].from;
            s = boundary + (random() * 2 - 1) * 0.1;
        } else {
            s = built[0].from + random() * (Math.min(legEnd, built[built.length - 1].to - 1) - built[0].from);
        }
        s = Math.max(1, Math.min(legEnd - 1, s));
        const i = Math.floor(s);
        const f = s - i;
        const p = env.roadPath[i];
        const q = env.roadPath[i + 1];
        const heading = p.heading + (q.heading - p.heading) * f;
        // Out to 25 m: past a wall's top the model describes ground that is not drawn (as on every leg)
        const lateral = (random() < 0.5 ? -1 : 1) * (random() * 25);
        const x = p.x + (q.x - p.x) * f + Math.cos(heading) * lateral;
        const z = p.z + (q.z - p.z) * f - Math.sin(heading) * lateral;
        points.push({ x, z, s });
    }
    let worst = 0;
    let worstShoulder = 0;
    let shoulder = 0;
    let missed = 0;
    points.forEach(({ x, z }) => {
        ray.set(new THREE.Vector3(x, 2000, z), down);
        const hit = ray.intersectObjects(ground, false)[0];
        if (hit) {
            worst = Math.max(worst, Math.abs(hit.point.y - read(x, z)));
            return;
        }
        const strip = ray.intersectObjects(verge, false)[0];
        if (!strip) {
            missed++;
            return;
        }
        shoulder++;
        worstShoulder = Math.max(worstShoulder, Math.abs(strip.point.y - read(x, z)));
    });
    return { points, worst, worstShoulder, shoulder, missed, read };
}

