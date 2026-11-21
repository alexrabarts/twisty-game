/**
 * @jest-environment node
 */
// Every route and ground query of a world is defined everywhere, and a bike put down anywhere on the ride takes a
// finite physics step. A bike put down at a ride vertex's exact s (a checkpoint restart, a resume, a probe's put-down:
// stations sit at sample s values) took a NaN height on its first step: the projection lands on the vertex at
// distance 0, and Vehicle.updateElevation's blend toward the next vertex, also at distance 0, divided 0 by 0. The NaN
// reached the fog density through WeatherSystem.fogElevation and bloom spread it over the whole frame (pure black).
//
// The queries are read at every sample's exact s, at s +- 1e-9, at both ends and past them, and at points on the
// centre line and the drawn ribbon's edges (each row's own normal) at and between the rows. The put-downs go through
// the restart path (Game.restartAtStation) at every station and every sample of every hairpin, at the restart speed
// and at rest (a probe's put-down). The physics guard (Vehicle.update holds the last finite state) must not fire:
// the step is finite because it computes a finite step, not because the guard caught it.
import { describe, test, expect, beforeAll } from '@jest/globals';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadGame } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';
import { decodeWorld } from '../../tools/world/encode.mjs';
import { rideSamples } from '../../tools/world/stations.mjs';
import { findHairpins } from '../../tools/world/verify.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const log = [];
const game = loadGame(undefined, log);
const { THREE, WorldEnvironment, WorldRun, Vehicle } = game;

const list = (items, n = 12) => items.slice(0, n).map(i => JSON.stringify(i)).join('\n');

// The names of the non-finite numbers in a query's output (its own numeric fields, one level deep)
function nonFinite(out, prefix = '') {
    const bad = [];
    if (typeof out === 'number') return Number.isFinite(out) ? bad : [prefix || 'value'];
    for (const [k, v] of Object.entries(out || {})) {
        if (typeof v === 'number' && !Number.isFinite(v)) bad.push(prefix + k);
    }
    return bad;
}

async function loadSlice() {
    const { fetchFn } = diskFetch();
    const env = await WorldEnvironment.load(new THREE.Scene(), { id: 'tremola', fetchFn, models: null, digest: async () => '0' });
    env.scenery.buildTile = () => null;
    return env;
}

describe('the Tremola slice: every route and ground query is finite', () => {
    let env, route, ground;
    beforeAll(async () => {
        env = await loadSlice();
        route = env.route;
        ground = env.ground;
    }, 300000);

    test('sample, toUnits, frames, curvature and heights at every exact s, s +- 1e-9 and both ends', () => {
        const bad = [];
        const S = route.sArray;
        const at = [-1, 0, route.length, route.length + 1];
        for (let i = 0; i < route.points.length; i++) at.push(S[i], S[i] - 1e-9, S[i] + 1e-9);
        const scratch = {};
        for (const s of at) {
            const check = (name, out) => { const b = nonFinite(out); if (b.length) bad.push({ s, name, bad: b }); };
            check('sample', route.sample(s, scratch));
            check('toUnits', route.toUnits(s));
            check('fromUnits', route.fromUnits(route.toUnits(s)));
            check('curveAt', route.curveAt(s, scratch));
            check('headingChange', route.headingChange(s, s + 4));
            check('curvatureAt', route.curvatureAt(s, 8));
            check('smoothCurvatureAt', route.smoothCurvatureAt(s, 12));
            check('heightRange', route.heightRange(s - 2, s + 2));
            check('laneOffset', route.laneOffset(s));
            const p = route.sample(s, {});
            check('smoothFrame', route.smoothFrame(p.x, p.z, s, {}));
        }
        if (bad.length) throw new Error(`${bad.length} non-finite route outputs:\n${list(bad)}`);
        expect(at.length).toBeGreaterThan(3 * 1000);
    });

    test('laneCurve at every row, row +- 1e-9 and between rows, both directions, passing or not', () => {
        const bad = [];
        const last = route.points.length - 1;
        const out = {};
        for (let i = -1; i <= last + 1; i++) {
            for (const u of [i, i - 1e-9, i + 1e-9, i + 0.5]) {
                for (const direction of [1, -1]) {
                    for (const [extra, rate] of [[0, 0], [2, 0.1]]) {
                        const b = nonFinite(route.laneCurve(u, direction, extra, rate, out));
                        if (b.length) bad.push({ u, direction, extra, bad: b });
                    }
                }
            }
        }
        if (bad.length) throw new Error(`${bad.length} non-finite lane outputs:\n${list(bad)}`);
    });

    // Points on the centre line and on the drawn ribbon's edges and verge (P + l n with n the row's own normal) at
    // each row, a hair either side of it, and between rows (on the blend of the rows' normals, as the quad is drawn)
    function ribbonPoints() {
        const pts = [];
        const P = route.points;
        for (let i = 0; i < P.length; i++) {
            const a = P[i], b = P[i + 1] || a;
            for (const t of [0, 1e-9, 0.5, 1 - 1e-9]) {
                const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
                const nx = Math.cos(a.heading) * (1 - t) + Math.cos(b.heading) * t;
                const nz = -Math.sin(a.heading) * (1 - t) - Math.sin(b.heading) * t;
                const half = (a.width + (b.width - a.width) * t) / 2;
                for (const l of [0, half, -half, half + 1, -(half + 1)]) pts.push({ i, t, l, x: x + l * nx, z: z + l * nz });
            }
        }
        return pts;
    }

    test('project and nearestSegment at every vertex, row boundary and ribbon edge, with a hint and from cold', () => {
        const bad = [];
        const pts = ribbonPoints();
        const last = route.points.length - 2;
        const out = {}, hint = {};
        for (const p of pts) {
            const check = (name, o) => { const b = nonFinite(o); if (b.length || o.index < 0) bad.push({ i: p.i, t: p.t, l: p.l, name, bad: b, index: o.index }); };
            check('nearestSegment', route.nearestSegment(p.x, p.z, Math.max(0, p.i - 1), Math.min(last, p.i + 1), out));
            hint.index = Math.min(last, p.i);
            hint.heading = route.points[p.i].heading;
            check('project', route.project(p.x, p.z, hint, out));
        }
        // A first fix scans the whole ride: every hundredth row and both ends
        for (const p of pts) {
            if (p.i % 100 && p.i !== 0 && p.i < route.points.length - 2) continue;
            const o = route.project(p.x, p.z, null, out);
            const b = nonFinite(o);
            if (b.length || o.index < 0) bad.push({ i: p.i, t: p.t, l: p.l, name: 'project cold', bad: b });
        }
        if (bad.length) throw new Error(`${bad.length} non-finite projections of ${pts.length} points:\n${list(bad)}`);
        expect(pts.length).toBeGreaterThan(20000);
    });

    test('locate, groundY, heightAt, zoneAt and halfRoad at the same points', () => {
        const bad = [];
        const pts = ribbonPoints();
        const last = route.points.length - 2;
        const loc = {};
        for (const p of pts) {
            const hint = { start: Math.max(0, p.i - 2), end: Math.min(last, p.i + 2) };
            const y = ground.groundY(p.x, p.z, hint, false, loc);
            const half = ground.halfRoad(loc);
            const zone = ground.zoneAt(loc, half);
            const at = ground.position(loc);
            const b = [...nonFinite(loc, 'loc.'), ...nonFinite(y, 'groundY'), ...nonFinite(ground.heightAt(loc, true), 'heightAt exact'),
                ...nonFinite(half, 'halfRoad'), ...nonFinite(zone.start, 'zone.start'), ...nonFinite(at, 'position.')];
            if (b.length) bad.push({ i: p.i, t: p.t, l: p.l, bad: b });
        }
        if (bad.length) throw new Error(`${bad.length} non-finite ground outputs of ${pts.length} points:\n${list(bad)}`);
    });
});

describe('the Tremola slice: a bike put down anywhere takes a finite physics step', () => {
    let env, route, run, hairpins, v;
    beforeAll(async () => {
        env = await loadSlice();
        // One bike for every put-down, as the game has: the restart path resets it
        v = new Vehicle(new THREE.Scene());
        v.environment = env;
        route = env.route;
        run = new WorldRun(route, env.stationGates, env.physics);
        const world = decodeWorld(path.join(REPO, 'world'));
        hairpins = findHairpins(rideSamples(world.edges, world.ride.path));
    }, 300000);

    // Game.restartAtStation's put-down, then one fixed step
    function putDown(s, speed) {
        v.reset();
        const heldBefore = v.nonFiniteSteps || 0;
        const point = route.sample(s, {});
        v.position.set(point.x, point.y, point.z);
        v.yawAngle = point.heading;
        v.speed = speed === 'restart' ? run.restartSpeed(s) : speed;
        v.findNearestRoadSegment();
        v.update(1 / 60, 0, 0, 0, 0);
        const state = { x: v.position.x, y: v.position.y, z: v.position.z, speed: v.speed, lean: v.leanAngle, yaw: v.yawAngle };
        return { state, held: (v.nonFiniteSteps || 0) - heldBefore, bad: nonFinite(state) };
    }

    function putDownAll(list) {
        const bad = [];
        for (const s of list) {
            for (const speed of ['restart', 0]) {
                const r = putDown(s, speed);
                if (r.bad.length || r.held) bad.push({ s, speed, ...r });
            }
        }
        return bad;
    }

    test('at every station', () => {
        const stations = (env.stationGates || []).map(g => g.s);
        expect(stations.length).toBeGreaterThan(0);
        const bad = putDownAll([env.startS, ...stations]);
        if (bad.length) throw new Error(`${bad.length} put-downs at stations left a non-finite state:\n${list(bad)}`);
    });

    test('at every sample\'s exact s in every hairpin', () => {
        expect(hairpins.length).toBeGreaterThanOrEqual(20);
        const at = [];
        for (const h of hairpins) {
            for (let i = route.indexAt(h.s0); i < route.points.length && route.sArray[i] <= h.s1; i++) at.push(route.sArray[i]);
        }
        expect(at.length).toBeGreaterThan(100);
        const bad = putDownAll(at);
        if (bad.length) throw new Error(`${bad.length} of ${at.length * 2} put-downs in hairpins left a non-finite state:\n${list(bad)}`);
    });

    test('the reported vertex: s 6569.245793820582 at rest', () => {
        const r = putDown(6569.245793820582, 0);
        expect(r.bad).toEqual([]);
        expect(r.held).toBe(0);
    });
});

describe('the guards on the way into physics and rendering', () => {
    test('a physics step that leaves a non-finite number is undone and logged once', async () => {
        const env = await loadSlice();
        const v = new Vehicle(new THREE.Scene());
        v.environment = env;
        v.reset();
        const point = env.route.sample(1000, {});
        v.position.set(point.x, point.y, point.z);
        v.yawAngle = point.heading;
        v.speed = 5;
        v.findNearestRoadSegment();
        v.update(1 / 60, 0, 0, 0, 0);
        const before = { x: v.position.x, y: v.position.y, z: v.position.z, speed: v.speed };
        log.length = 0;
        v.integrate = function () { this.position.y = NaN; this.speed = NaN; };
        v.update(1 / 60, 0.5, 1, 0, 0);
        v.update(1 / 60, 0.5, 1, 0, 0);
        const errors = log.filter(l => /non-finite/.test(l));
        expect({ x: v.position.x, y: v.position.y, z: v.position.z, speed: v.speed }).toEqual(before);
        expect(v.nonFiniteSteps).toBe(2);
        expect(errors.length).toBe(1);
        expect(errors[0]).toMatch(/non-finite speed, position/);
        expect(errors[0]).toMatch(/"steeringInput":0.5/);
    }, 300000);

    test('the fog density and the atmosphere stay finite when the bike height and progress are not', () => {
        const { AtmosphereTrack } = game;
        const WeatherSystem = new Function(`${readFileSync(path.join(REPO, 'js', 'weather.js'), 'utf8')}\nreturn WeatherSystem;`)();
        const fog = { density: 0.0012 };
        const weather = Object.assign(Object.create(WeatherSystem.prototype), {
            scene: { fog }, baseY: 0, fogElevation: 0, originalFogDensity: 0.0012, weatherIntensity: 0.5, mix: { rain: 0, snow: 0, fog: 0.4 }
        });
        const look = { timeOfDay: 'golden', weather: 'clear', weatherIntensity: 0, fogDensity: 0.001, heightFog: null, shafts: 0, ring: 1, baseY: 0 };
        const track = AtmosphereTrack.build([{ startSegment: 0, endSegment: 99, look }, { startSegment: 100, endSegment: 199, look: { ...look, fogDensity: 0.003 } }]);
        // The weather runs on the real console here, the atmosphere on the game's (log)
        const errors = [];
        const original = console.error;
        console.error = (...args) => errors.push(args.join(' '));
        log.length = 0;
        try {
            weather.updateFogDensity({ x: 0, y: 1500, z: 0 });
            const good = fog.density;
            weather.updateFogDensity({ x: 0, y: NaN, z: 0 });
            weather.updateFogDensity({ x: 0, y: NaN, z: 0 });
            expect(fog.density).toBe(good);
            track.sample(50, {});
            const held = AtmosphereTrack.blendLook(track.sample(NaN, {}));
            expect(Number.isFinite(held.fogDensity)).toBe(true);
            expect(Number.isFinite(held.ring)).toBe(true);
        } finally {
            console.error = original;
        }
        expect(errors.length).toBe(1);
        expect(errors[0]).toMatch(/non-finite fog density/);
        expect(log.filter(l => /non-finite segment/.test(l)).length).toBe(1);
    });
});
