#!/usr/bin/env node
// Records what the game reads of a leg's road, through the public methods that
// exist both before and after the route/ground port, so one capture can be
// taken on a pre-port tree and compared with the same capture on the ported
// tree. Every number is hashed as raw float64 bytes: equality is bit for bit.
//
//   node tools/world/capture-baseline.mjs --tree <worktree at a9e8add> --out tests/fixtures/world/leg-baseline.json [--points 10000]
//
// The tree must hold js/ and node_modules/three is read from this repo. The
// capture is deterministic: points come from a seeded generator, and nothing
// reads the clock or Math.random.
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';

const repoRoot = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const require = createRequire(import.meta.url);

export const BASE_COMMIT = 'a9e8add';
export const DEFAULT_POINTS = 10000;

function mulberry32(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function canvasStub() {
    const gradient = { addColorStop() {} };
    const context = new Proxy({}, {
        get(target, key) {
            if (key in target) return target[key];
            if (key === 'createLinearGradient' || key === 'createRadialGradient' || key === 'createPattern') return () => gradient;
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
    return { createElement: () => ({ width: 300, height: 150, style: {}, getContext: () => context }) };
}

// The game scripts of `tree`, loaded as the browser does (one scope). The
// world files exist only on a ported tree.
function loadTree(tree) {
    const THREE = require('three');
    const world = ['route.js', 'legroute.js', 'ground.js'].filter(name => existsSync(join(tree, 'js/world', name))).map(name => `world/${name}`);
    const files = ['terrain.js', 'course.js', 'race.js', ...world, 'vehicle.js', 'environment.js', 'tours.js', 'rockfalls.js', 'cones.js', 'traffic.js', 'atmosphere.js'];
    const source = files.map(name => readFileSync(join(tree, 'js', name), 'utf8')).join('\n;\n');
    const quiet = { log() {}, warn() {}, error() {} };
    const factory = new Function(
        'THREE', 'document', 'localStorage', 'console',
        `${source}\nreturn { Environment, TourSystem, RockfallSystem, Vehicle, Cones, Car, AIMotorcycle, AtmosphereTrack, Terrain };`
    );
    return { THREE, ...factory(THREE, canvasStub(), { getItem: () => null, setItem() {} }, quiet) };
}

// Game.tunnelRoofY cut out of the tree's main.js by its 4-space indent
function tunnelRoofY(tree) {
    const lines = readFileSync(join(tree, 'js/main.js'), 'utf8').split('\n');
    const start = lines.findIndex(line => /^    tunnelRoofY\(.*\) \{$/.test(line));
    const end = lines.findIndex((line, n) => n > start && line === '    }');
    const source = lines.slice(start, end + 1).join('\n');
    return new Function('Terrain', `return ({ ${source} }).tunnelRoofY;`);
}

// A read that throws on a leg that does not model it (a fall with no rest
// height) records the same marker on both trees
const attempt = read => {
    try {
        return read();
    } catch {
        return -7777;
    }
};

const bits = value => (Number.isFinite(value) ? value + 0 : -1e300);

function hashOf(numbers) {
    const array = Float64Array.from(numbers, bits);
    return createHash('sha256').update(Buffer.from(array.buffer)).digest('hex');
}

// What a leg's road reads as, at `points` seeded points. `tree` is a checkout
// root; the answer for the ported tree must equal the one for the base tree.
export function captureTree(tree, { points = DEFAULT_POINTS, legIndexes = null } = {}) {
    const game = loadTree(tree);
    const { THREE } = game;
    const legs = new game.TourSystem().legs;
    const roofOf = tunnelRoofY(tree);
    const autopilot = readFileSync(join(tree, 'tools/autopilot.js'), 'utf8');
    const result = [];

    legs.forEach((leg, legIndex) => {
        if (legIndexes && !legIndexes.includes(legIndex)) return;
        const scene = new THREE.Scene();
        const env = new game.Environment(scene, leg.startSegment, leg.endSegment, legIndex);
        scene.updateMatrixWorld(true);
        const path = env.roadPath;
        const ported = !!env.route;
        const random = mulberry32(0x2e1f + legIndex);
        const low = Math.max(0, leg.startSegment);
        const high = Math.min(path.length - 2, leg.endSegment);
        const categories = { vehicle: [], elevation: [], traffic: [], cones: [], roof: [], rockground: [], steer: [] };

        const vehicle = new game.Vehicle(scene);
        vehicle.environment = env;
        const tour = new game.TourSystem();
        const cars = Object.create(game.Car.prototype);
        const bikes = Object.create(game.AIMotorcycle.prototype);
        const cone = { rotation: { set() {} }, position: { x: 0, y: 0, z: 0 }, userData: {}, hit: false };
        const cones = Object.create(game.Cones.prototype);
        const rocks = Object.create(game.RockfallSystem.prototype);
        const page = {};
        new Function('window', autopilot)(page);
        const fakeGame = { vehicle: { position: { x: 0, z: 0 }, yawAngle: 0, speed: 0, leanAngle: 0, leanVelocity: 0 }, environment: env, input: {} };
        page.game = fakeGame;
        page.twistyDev.autopilot({ speed: 20, lane: 2 });

        for (let n = 0; n < points; n++) {
            const index = low + Math.floor(random() * (high - low + 1));
            const along = random();
            const lateral = (random() * 80 - 40) * (n % 7 === 0 ? 0.2 : 1);
            const a = path[index];
            const b = path[index + 1];
            const x = a.x + (b.x - a.x) * along + Math.cos(a.heading) * lateral;
            const z = a.z + (b.z - a.z) * along - Math.sin(a.heading) * lateral;
            const y = a.y + random() * 4 - 1;
            const hint = Math.max(0, Math.min(path.length - 1, index + Math.floor(random() * 7) - 3));

            // The vehicle's own reads of the road and the ground
            vehicle.position.set(x, y, z);
            vehicle.currentRoadSegment = hint;
            if (ported) vehicle.routeS = hint * 20;
            vehicle.crashed = false;
            vehicle.fallingOffCliff = false;
            vehicle.wasNearEdge = n % 2 === 1;
            vehicle.offRoadTime = 0;
            vehicle.speed = 12 + (n % 5) * 3;
            vehicle.runoff = null;
            vehicle.isJumping = false;
            vehicle.fallSide = n % 3 === 0 ? -1 : 1;
            const located = vehicle.locateNear(x, z, 10) || {};
            categories.vehicle.push(
                located.index, located.lateral, located.roadY, located.along,
                vehicle.roadYAt(x, z), vehicle.surfaceAt(x, z), vehicle.surfaceAt(x, z, 25),
                attempt(() => vehicle.getTerrainHeightAt(x, z)), attempt(() => vehicle.fallLip())
            );
            vehicle.updateElevation();
            categories.elevation.push(vehicle.position.y);
            vehicle.position.set(x, y, z);
            vehicle.currentRoadSegment = hint;
            vehicle.checkWallCollision(1 / 60);
            categories.vehicle.push(
                vehicle.currentRoadSegment, vehicle.crashed ? 1 : 0, vehicle.fallingOffCliff ? 1 : 0, vehicle.speed,
                vehicle.offRoadTime, vehicle.wasNearEdge ? 1 : 0, vehicle.position.x, vehicle.position.z,
                vehicle.velocity.x, vehicle.velocity.y, vehicle.velocity.z, vehicle.runoff ? 1 : 0
            );
            vehicle.position.set(x, y, z);
            categories.vehicle.push(vehicle.findNearestRoadSegment(), vehicle.currentRoadSegment);

            // Traffic: a car and a bike on the road, wrapped and not
            const total = path.length;
            const segment = index + (n % 11 === 0 ? total : n % 13 === 0 ? -total : 0);
            const progress = random();
            const shared = { environment: env, currentSegment: segment + 0.5, segmentProgress: progress, lane: n % 2 ? 'left' : 'right' };
            const written = [];
            Object.assign(cars, shared, {
                direction: n % 4 < 2 ? 1 : -1, inDetour: n % 5 === 0, detourSide: n % 10 === 0 ? 'left' : 'right',
                carGroup: { position: { set: (...p) => written.push(...p) }, rotation: { y: 0 } }
            });
            cars.updatePosition();
            written.push(cars.carGroup.rotation.y);
            Object.assign(bikes, shared, {
                packLateralOffset: n % 3 === 0 ? 1.5 : 0, overtaking: n % 6 === 0, overtakeProgress: progress,
                leanAngle: 0.1, currentSpeed: 20, currentDeltaTime: 1 / 60,
                bikeGroup: { position: { set: (...p) => written.push(...p) }, rotation: { y: 0, z: 0 } }
            });
            bikes.updatePosition();
            written.push(bikes.bikeGroup.rotation.y, bikes.bikeGroup.rotation.z, bikes.leanAngle);
            categories.traffic.push(...written);

            // A knocked cone sent home with no home position
            cone.position.x = x;
            cone.position.z = z;
            cone.position.y = 0;
            cone.userData = {};
            cones.environment = env;
            cones.cones = [cone];
            cones.activeCones = [];
            cones.reset();
            categories.cones.push(cone.position.y);

            // Rocks: the ground under a rock near a fall
            rocks.environment = env;
            rocks.lastFallSegment = index;
            categories.rockground.push(rocks.groundY(x, z));

            // Tunnel roof over the bike (a stub game: the roof reads only the environment and the bike)
            const roofSegment = n % 2 ? index : low + Math.floor((n / points) * (high - low));
            const roof = roofOf(game.Terrain).call({ environment: env, vehicle: { currentRoadSegment: roofSegment, routeS: roofSegment * 20 } });
            categories.roof.push(roof === null ? -1e9 : roof);

            // The autopilot's steering toward the point `lookahead` ahead of the bike
            fakeGame.vehicle.position.x = x;
            fakeGame.vehicle.position.z = z;
            fakeGame.vehicle.yawAngle = a.heading + (random() - 0.5);
            fakeGame.vehicle.speed = 10 + (n % 6) * 4;
            fakeGame.vehicle.leanAngle = (random() - 0.5) * 0.4;
            fakeGame.vehicle.leanVelocity = (random() - 0.5) * 0.2;
            fakeGame.vehicle.currentRoadSegment = hint;
            fakeGame.vehicle.routeS = hint * 20;
            categories.steer.push(fakeGame.input.getSteeringInput());
        }

        // The start of the leg, and the road height ranges the atmosphere reads
        tour.currentLeg = leg;
        const startOf = position => [position.x, position.y, position.z, position.heading];
        const source = ported ? env.route : path;
        const starts = [...startOf(tour.getStartingPosition(source))];
        tour.currentLeg = null;
        starts.push(...startOf(tour.getStartingPosition(source)));
        const heights = [];
        const lowest = game.AtmosphereTrack.lowestRoadHeight;
        for (let n = 0; n < 50; n++) {
            const start = Math.floor(random() * (path.length + 5));
            const end = start + Math.floor(random() * 200);
            heights.push(lowest(source, start, end));
        }
        const track = game.AtmosphereTrack.forLeg(leg, env.config, env);
        const baseHeights = track.parts.map(part => part.look.baseY);

        const hashes = Object.fromEntries(Object.entries({ ...categories, starts, heights: [...heights, ...baseHeights] })
            .map(([key, numbers]) => [key, { count: numbers.length, head: numbers.slice(0, 6).map(bits), sha256: hashOf(numbers) }]));
        result.push({ id: leg.id, legIndex, hashes });
    });
    return result;
}

function main() {
    const argv = process.argv.slice(2);
    const option = name => {
        const at = argv.indexOf(`--${name}`);
        return at === -1 ? null : argv[at + 1];
    };
    const tree = resolve(option('tree') || repoRoot);
    const points = Number(option('points') || DEFAULT_POINTS);
    const out = option('out');
    const base = execFileSync('git', ['-C', tree, 'rev-parse', '--short=7', 'HEAD'], { encoding: 'utf8' }).trim();
    const document = { base, points, legs: captureTree(tree, { points }) };
    const text = `${JSON.stringify(document, null, 2)}\n`;
    if (out) writeFileSync(resolve(out), text);
    else process.stdout.write(text);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
