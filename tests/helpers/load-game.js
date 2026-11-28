// Loads the real game scripts (classic browser scripts, no exports) against the
// real three r150 instead of the mock in tests/setup.js. Plain ESM with no jest
// dependency, so a tool can load the game the same way.
//
// three and the browser globals are passed to the scripts as function
// parameters, so tests/setup.js's global THREE mock is neither used nor
// replaced: there is nothing to restore after a test file.
import { webcrypto } from 'node:crypto';
import { TextDecoder as NodeTextDecoder } from 'node:util';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const root = new URL('../../', import.meta.url);

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
    const files = ['tuning.js', 'terrain.js', 'course.js', 'race.js', 'world/physics.js', 'world/route.js', 'world/legroute.js', 'world/tour.js', 'world/data.js', 'world/graph.js', 'world/worldroute.js', 'world/worldground.js', 'world/streamer.js', 'world/landshade.js', 'world/tubes.js', 'world/structures.js', 'world/roadsurface.js', 'world/roadmesh.js', 'world/terrainmesh.js', 'world/horizon.js', 'world/vegetation.js', 'world/edgestyles.js', 'world/scenery.js', 'world/roadworks.js', 'world/places.js', 'world/placemesh.js', 'world/guide.js', 'world/run.js', 'world/camera.js', 'world/looks.js', 'world/water.js', 'world/dam-data.js', 'world/dams.js', 'world/environment.js', 'vehicle.js', 'environment.js', 'tours.js', 'rockfalls.js', 'cones.js', 'traffic.js', 'atmosphere.js'];
    const source = files.map(name => (sources[name] !== undefined ? sources[name] : loadScript(name))).join('\n;\n');
    const sink = {
        log: (...args) => log.push(args.join(' ')),
        warn: (...args) => log.push(args.join(' ')),
        error: (...args) => log.push(args.join(' '))
    };
    const storage = { getItem: () => null, setItem() {} };
    const factory = new Function(
        'THREE', 'document', 'localStorage', 'console', 'TextDecoder', 'crypto',
        `${source}\nreturn { Tuning: typeof Tuning === 'undefined' ? undefined : Tuning, WorldPhysics, CHARACTERS, BIKE_MODELS, Environment, TourSystem, RockfallSystem, Vehicle, Terrain, Course, RaceTiming, Cones, Traffic, AtmosphereTrack, Route, PolylineRoute, LegRoute, Ground, LegGround, WorldData, WorldGraph, WorldRoute, WorldGround, WorldStreamer, RoadMesh, RoadSurface, TubeLining, TubeShade, StructureStyles, StructureShade, StructureBuild, TerrainMesh, Horizon, FarLand, LandShade, RoadClearance, EdgeStyles, Scenery, Roadworks, WorldPlaces, PlaceMesh, WorldGuide, WorldRun, WorldAssist, WorldCamera, WorldLooks, WorldDams, WorldDamData, Dams, Water: typeof Water === 'undefined' ? undefined : Water, WorldEnvironment };`
    );
    return { THREE, log, ...factory(THREE, canvasStub(), storage, sink, NodeTextDecoder, webcrypto) };
}

// The old procedural legs (js/environment.js, js/terrain.js, js/course.js): the game no longer rides them, and only
// the world suites that still build one read them (tests/unit/world-route.test.js, world-verge.test.js). Their segment
// ranges, as js/tours.js held them; a leg that has its own course (Course.forLeg) is numbered from segment 0
const OLD_LEGS = [
    ['mountain-dawn', 0, 69], ['valley-run', 70, 149], ['coastal-descent', 150, 233], ['foggy-gorge', 234, 321],
    ['high-pass', 322, 413], ['storm-valley', 414, 509], ['night-ride', 510, 607], ['winter-pass', 608, 703]
];

export function legs(game) {
    return OLD_LEGS.map(([id, startSegment, endSegment]) => {
        const course = game.Course.forLeg(id);
        return course ? { id, startSegment: 0, endSegment: course.segments - 1 } : { id, startSegment, endSegment };
    });
}

// An old leg's Environment built into a fresh scene, as the game once built it
export function buildEnvironment(game, legIndex) {
    const leg = legs(game)[legIndex];
    const scene = new game.THREE.Scene();
    const env = new game.Environment(scene, leg.startSegment, leg.endSegment, legIndex);
    scene.updateMatrixWorld(true);
    return { env, scene, leg };
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
