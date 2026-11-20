// Loads the real game scripts (classic browser scripts, no exports) against the
// real three r150 instead of the mock in tests/setup.js. Plain ESM with no jest
// dependency, so tools/terrain-check.mjs uses the same code to capture goldens.
//
// three and the browser globals are passed to the scripts as function
// parameters, so tests/setup.js's global THREE mock is neither used nor
// replaced: there is nothing to restore after a test file.
import { createHash, webcrypto } from 'node:crypto';
import { TextDecoder as NodeTextDecoder } from 'node:util';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const root = new URL('../../', import.meta.url);

// Classes that environment.js grounds against the terrain and that the
// phase 5 clamp or D6 lift will move; the `stable` fingerprint skips them.
export const D6_CLASSES = [
    /^embedded cliff rock .*side -1\)$/,
    /^cliff rock cluster/,
    /^construction bulldozer/,
    /^construction barrier/,
    /^work truck/,
    /^hairpin barrier/
];

export const LATERALS = [-80, -40, -20, -12, 0, 12, 20, 40, 80];

export function realThree() {
    return createRequire(import.meta.url)('three');
}

export function loadScript(name) {
    return readFileSync(new URL(`js/${name}`, root), 'utf8');
}

// A 2D context that accepts every drawing call and reads back blank pixels
export function canvasStub() {
    const gradient = { addColorStop() {} };
    const context = new Proxy({}, {
        get(target, key) {
            if (key in target) return target[key];
            if (key === 'createLinearGradient' || key === 'createRadialGradient' || key === 'createPattern') {
                return () => gradient;
            }
            if (key === 'measureText') return () => ({ width: 0 });
            if (key === 'getImageData' || key === 'createImageData') {
                return (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h * 4)) });
            }
            return () => {};
        },
        set(target, key, value) {
            target[key] = value;
            return true;
        }
    });
    const document = {
        createElement(tag) {
            if (tag !== 'canvas') throw new Error(`document.createElement('${tag}') is not stubbed`);
            return { width: 300, height: 150, style: {}, getContext: () => context };
        }
    };
    return document;
}

// The world physics parameters on their own, as the importer and the floor
// tool read them (no THREE, no DOM)
export function loadWorldPhysics() {
    return new Function(`${loadScript('world/physics.js')}\nreturn WorldPhysics;`)();
}

// The game classes, built once per THREE and per file set. `log` receives the
// console lines the build prints (FLOATING OBJECTS, TERRAIN-ROAD OVERLAP).
// `sources` replaces a file's text by name ('vehicle.js': an older revision's).
export function loadGame(THREE = realThree(), log = [], sources = {}) {
    const files = ['terrain.js', 'course.js', 'race.js', 'world/physics.js', 'world/route.js', 'world/legroute.js', 'world/data.js', 'world/graph.js', 'world/worldroute.js', 'world/worldground.js', 'world/streamer.js', 'world/landshade.js', 'world/roadsurface.js', 'world/roadmesh.js', 'world/terrainmesh.js', 'world/horizon.js', 'world/vegetation.js', 'world/scenery.js', 'world/roadworks.js', 'world/places.js', 'world/guide.js', 'world/run.js', 'world/camera.js', 'world/looks.js', 'world/environment.js', 'vehicle.js', 'environment.js', 'tours.js', 'rockfalls.js', 'cones.js', 'traffic.js', 'atmosphere.js'];
    const source = files.map(name => (sources[name] !== undefined ? sources[name] : loadScript(name))).join('\n;\n');
    const sink = {
        log: (...args) => log.push(args.join(' ')),
        warn: (...args) => log.push(args.join(' ')),
        error: (...args) => log.push(args.join(' '))
    };
    const storage = { getItem: () => null, setItem() {} };
    const factory = new Function(
        'THREE', 'document', 'localStorage', 'console', 'TextDecoder', 'crypto',
        `${source}\nreturn { WorldPhysics, CHARACTERS, BIKE_MODELS, Environment, TourSystem, RockfallSystem, Vehicle, Terrain, Course, RaceTiming, Cones, Traffic, AtmosphereTrack, Route, PolylineRoute, LegRoute, Ground, LegGround, WorldData, WorldGraph, WorldRoute, WorldGround, WorldStreamer, RoadMesh, RoadSurface, TerrainMesh, Horizon, FarLand, LandShade, RoadClearance, Scenery, Roadworks, WorldPlaces, WorldGuide, WorldRun, WorldCamera, WorldLooks, WorldEnvironment };`
    );
    return { THREE, log, ...factory(THREE, canvasStub(), storage, sink, NodeTextDecoder, webcrypto) };
}

// The game with every leg on the shared course, as before the long-leg
// conversions: for tests whose subject is a shared-course leg that has since
// been converted (leg 1). Course.release is the rollback of a conversion.
export function loadSharedGame(THREE = realThree(), log = []) {
    const game = loadGame(THREE, log);
    Object.keys(game.Course.LEGS).forEach((id) => game.Course.release(id));
    return game;
}

export function legs(game) {
    return new game.TourSystem().legs;
}

// The real constructor into a fresh scene, as Game.initializeGameWithLeg calls it
export function buildEnvironment(game, legIndex) {
    const leg = legs(game)[legIndex];
    const scene = new game.THREE.Scene();
    const env = new game.Environment(scene, leg.startSegment, leg.endSegment, legIndex);
    scene.updateMatrixWorld(true);
    return { env, scene, leg };
}

const sha256 = (...parts) => {
    const hash = createHash('sha256');
    parts.forEach(part => hash.update(part));
    return hash.digest('hex');
};

const bytes = typed => Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
const f64 = array => bytes(new Float64Array(array));

// The ribbon is the pair of cliff meshes: vertex-coloured, one 144-vertex row per segment
export function ribbonMeshes(env) {
    const rows = Math.min(743, env.endSegment + 20) - env.startSegment + 1;
    const found = [];
    env.scene.traverse(object => {
        const position = object.isMesh && object.geometry.attributes.position;
        if (position && object.geometry.attributes.color && position.count === rows * 144) {
            found.push(object);
        }
    });
    return found;
}

const hasFlag = (object, flag) => {
    for (let node = object; node; node = node.parent) {
        if (node.userData && node.userData[flag]) return true;
    }
    return false;
};

// Per-side (left first, then right) decal meshes: floating-allowed meshes in a ribbon's group
export function decalMeshes(env) {
    return ribbonMeshes(env).map(ribbon => {
        const decals = [];
        ribbon.parent.traverse(object => {
            if (object.isMesh && object !== ribbon && hasFlag(object, 'allowFloating')) decals.push(object);
        });
        return decals;
    });
}

export function groundedMatching(env) {
    return env.groundedObjects.filter(({ label }) => D6_CLASSES.some(pattern => pattern.test(label)));
}

// One line per mesh: sha256 over type, world matrix, positions and instance
// matrices. Names are left out so a later rename cannot move a hash. A mode
// joins the lines of the meshes it keeps and hashes that, so the in-page
// version in tools/terrain-check.mjs follows the same steps.
const meshLine = mesh => {
    const hash = createHash('sha256');
    hash.update(`${mesh.type}|`);
    hash.update(f64(mesh.matrixWorld.elements));
    hash.update(bytes(mesh.geometry.attributes.position.array));
    if (mesh.isInstancedMesh) hash.update(bytes(mesh.instanceMatrix.array));
    return hash.digest('hex');
};

export function fingerprints(env, scene) {
    scene.updateMatrixWorld(true);
    const decals = new Set(decalMeshes(env).flat());
    const floating = new Set();
    scene.traverse(object => {
        if (object.isMesh && hasFlag(object, 'allowFloating')) floating.add(object);
    });
    const d6 = new Set();
    groundedMatching(env).forEach(({ object }) => object.traverse(child => d6.add(child)));

    const lines = { full: [], noDecal: [], stable: [] };
    scene.traverse(object => {
        if (!object.isMesh) return;
        const line = meshLine(object);
        lines.full.push(line);
        if (decals.has(object)) return;
        lines.noDecal.push(line);
        if (floating.has(object) || d6.has(object)) return;
        lines.stable.push(line);
    });
    return Object.fromEntries(Object.entries(lines).map(([mode, list]) => [
        mode,
        { hash: sha256(list.join('\n')).slice(0, 16), meshes: list.length }
    ]));
}

// Straight-down ray against the given meshes; first hit y, or null
export function rayDown(THREE, meshes, x, z, fromY = 500) {
    const raycaster = new THREE.Raycaster(new THREE.Vector3(x, fromY, z), new THREE.Vector3(0, -1, 0));
    const hit = raycaster.intersectObjects(meshes, false)[0];
    return hit ? hit.point.y : null;
}

// Per grounded object: label, world position and a hash of its descendants' local position buffers
export function groundedRecords(env) {
    return env.groundedObjects.map(({ object, label }) => {
        object.updateWorldMatrix(true, false);
        const position = object.getWorldPosition(new env.scene.position.constructor());
        const hash = createHash('sha256');
        object.traverse(child => {
            // The stripes on a hairpin barrier are its children now; the record is of the barrier's own box
            if (child.isMesh && !child.userData.barrierStripe) hash.update(bytes(child.geometry.attributes.position.array));
        });
        return {
            label,
            position: [position.x, position.y, position.z].map(v => Math.round(v * 1000) / 1000),
            hash: hash.digest('hex').slice(0, 16)
        };
    });
}

export function groundGrid(env) {
    const rows = [];
    for (let segment = env.startSegment; segment <= env.endSegment; segment += 10) {
        const point = env.roadPath[segment];
        const rx = Math.cos(point.heading);
        const rz = -Math.sin(point.heading);
        rows.push([segment, ...LATERALS.map(lateral => {
            const y = env.groundYAt(point.x + rx * lateral, point.z + rz * lateral);
            return Math.round(y * 1e6) / 1e6;
        })]);
    }
    return rows;
}

// Everything the jest golden records for one leg, from the real constructor
export function captureLeg(game, legIndex) {
    const { env, scene } = buildEnvironment(game, legIndex);
    const ribbons = ribbonMeshes(env);
    const record = {
        randState: env.randState,
        meshes: scene.children.length,
        fingerprints: fingerprints(env, scene),
        faceHashes: ribbons.map(mesh => sha256(bytes(mesh.geometry.attributes.position.array)).slice(0, 16)),
        decalCounts: decalMeshes(env).map(list => list.length),
        d6Entries: groundedMatching(env).length,
        groundGrid: groundGrid(env)
    };
    if (legIndex === 0 || legIndex === 4) record.grounded = groundedRecords(env);
    return record;
}

// Methods of the Game class in js/main.js, which cannot be loaded whole (it
// builds the page on load). Each named method is cut out of the real source by
// its 4-space indent and bound to `self`; `globals` are the free names it reads.
export function gameMethods(names, self = {}, globals = {}) {
    const lines = loadScript('main.js').split('\n');
    const found = {};
    for (const name of names) {
        const start = lines.findIndex(line => new RegExp(`^    (async )?${name}\\(.*\\) \\{$`).test(line));
        if (start === -1) throw new Error(`Game.${name} not found in js/main.js`);
        const end = lines.findIndex((line, n) => n > start && line === '    }');
        const source = lines.slice(start, end + 1).join('\n');
        const factory = new Function(...Object.keys(globals), `return ({ ${source} });`);
        found[name] = factory(...Object.values(globals))[name].bind(self);
    }
    return found;
}
