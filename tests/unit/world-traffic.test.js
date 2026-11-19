/**
 * @jest-environment node
 */
// World traffic keeps right and drives its bends as a car would.
//
// Sides have one convention (Route, js/world/route.js): lateral is measured along (cos h, -sin h), which the chase
// camera shows on the LEFT of the screen, so Route.LEFT is +1 and a heading that grows turns left. The world's
// oncoming car was given the lane named 'left', read as the rider's left but placed at -lateral, the rider's right:
// every car drove on the left of the road (the report at km 8.9). Traffic now takes its side from its direction
// (Route.keepRight), so a car going toward increasing s keeps to Route.RIGHT and one going against s to Route.LEFT.
//
// A car snapped its heading to the chord of the 4 m polyline segment it was on, so in the 6 m hairpins (0.66 rad a
// sample) its body yawed in steps and pointed across the bend. It now drives the smoothed lane line in the ribbon's own
// frame (WorldRoute.laneCurve), takes its heading from that line and slows for each bend. Each vehicle type is driven
// through every hairpin of the slice at 60 frames a second against the drawn road meshes: the yaw rate may change by
// at most YAW_RATE_STEP a frame, the body points along the way it moves to within HEADING_DEG, every wheel touches
// the drawn carriageway, and the vehicle stays on its own half of the road unless it is passing.
import { describe, test, expect, beforeAll } from '@jest/globals';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGame } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';
import { decodeWorld } from '../../tools/world/encode.mjs';
import { rideSamples } from '../../tools/world/stations.mjs';
import { findHairpins } from '../../tools/world/verify.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const log = [];
const game = loadGame(undefined, log);
const { THREE, Route, WorldEnvironment, Traffic, Roadworks } = game;

// A vehicle's centre is on its own half of the road by at least a quarter of the width less this (the smoothed lane
// line keeps inside each corner of the drawn lane, toward the centre line on the outside of a bend)
const SIDE_MARGIN_M = 0.5;
// The most the yaw rate may change from one frame to the next at 60 frames a second (rad/s): 6 rad/s^2, where a car
// turning into a 6 m hairpin at its curve speed asks for under 1
const YAW_RATE_STEP = 0.1;
// The most the body's heading may differ from the way it moves (degrees)
const HEADING_DEG = 3;
// A wheel hub over the drawn carriageway: the drawn column offset no more than this past the half width
const WHEEL_SLACK_M = 0.01;
const DT = 1 / 60;

// The lateral sign of a vehicle's own right, from the screen (the first test proves +lateral is the screen's left):
// written out here rather than read from Route, so the placings are judged by the picture and not by the code under test
const ownRight = direction => (direction < 0 ? 1 : -1);

const list = (items, n = 12) => items.slice(0, n).map(i => JSON.stringify(i)).join('\n');
const wrap = a => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));

async function loadSlice() {
    const { fetchFn } = diskFetch();
    const env = await WorldEnvironment.load(new THREE.Scene(), { id: 'tremola', fetchFn, models: null, digest: async () => '0' });
    env.scenery.buildTile = () => null;
    return env;
}

// The vehicle classes, and the lanes the traffic of a world spawned them in before the fix (Traffic passed the world's
// `oncomingLane` to its car and 'left' to the crew). Traffic now ignores a lane: the side is the direction's.
function fleet(env) {
    const traffic = new Traffic(new THREE.Scene(), env);
    const Car = traffic.cars[0].constructor, AIMotorcycle = traffic.motorcycles[0].constructor;
    const spawn = { car: { lane: env.oncomingLane || 'right' }, crew: { lane: 'left' } };
    return { traffic, Car, AIMotorcycle, spawn };
}

function putAt(vehicle, route, s) {
    const u = route.toUnits(s);
    vehicle.currentSegment = Math.floor(u);
    vehicle.segmentProgress = u - Math.floor(u);
    vehicle.updatePosition();
}

function groupOf(vehicle) {
    return vehicle.carGroup || vehicle.bikeGroup;
}

// Signed lateral on the vehicle's own side: positive on its own right half
function ownSide(route, vehicle, hint) {
    const g = groupOf(vehicle);
    const p = route.project(g.position.x, g.position.z, hint, {});
    return { own: ownRight(vehicle.direction) * p.lateral, width: p.width, s: p.s, index: p.index };
}

// Whether a vehicle is where it belongs across the road: on its own right half; but in the single lane of a roadworks
// site both ways drive the open lane, so there it is on the open half by the same measure, and in the blend in from
// each stop line it is on its way from one to the other (tests/unit/world-roadworks.test.js holds that line)
function onItsSide(env, vehicle, side) {
    const site = env.roadworks ? env.roadworks.siteAt(side.s) : null;
    if (!site) return side.own >= side.width / 4 - SIDE_MARGIN_M;
    if (Roadworks.laneShare(site, side.s) < 1) return true;
    return ownRight(vehicle.direction) * side.own * site.open >= site.half / 2 - SIDE_MARGIN_M;
}

describe('sides: one convention', () => {
    test('+lateral is the left of the chase view, a growing heading turns left, and traffic keeps right', () => {
        const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
        for (const h of [0, 0.7, 2, -2.5]) {
            const fwd = new THREE.Vector3(Math.sin(h), 0, Math.cos(h));
            camera.position.copy(fwd.clone().multiplyScalar(-6)).add(new THREE.Vector3(0, 3, 0));
            camera.lookAt(fwd.clone().multiplyScalar(10));
            camera.updateMatrixWorld(true);
            const lateral = new THREE.Vector3(Math.cos(h), 0, -Math.sin(h)).multiplyScalar(2 * Route.LEFT).add(fwd.clone().multiplyScalar(10));
            expect(lateral.project(camera).x).toBeLessThan(-0.05);
            // A heading a little larger points to the screen's left of the straight-on one
            const turned = new THREE.Vector3(Math.sin(h + 0.2), 0, Math.cos(h + 0.2)).multiplyScalar(20);
            expect(turned.project(camera).x).toBeLessThan(0);
        }
        expect(Route.turnSide(0.2)).toBe('left');
        expect(Route.turnSide(-0.2)).toBe('right');
        expect(Route.turnSide(0.2, 0.35)).toBe('straight');
        expect(Route.keepRight(1)).toBe(Route.RIGHT);
        expect(Route.keepRight(-1)).toBe(Route.LEFT);
        expect([1, -1].map(Route.keepRight)).toEqual([1, -1].map(ownRight));
        expect(Route.RIGHT).toBe(-Route.LEFT);
    });
});

describe('the Tremola slice: traffic keeps right', () => {
    let env;
    beforeAll(async () => { env = await loadSlice(); }, 300000);

    test('every car and rider is on its own right half of the road, everywhere along the slice and both ways', () => {
        const route = env.route;
        const { traffic, Car, AIMotorcycle, spawn } = fleet(env);
        const scene = new THREE.Scene();
        const vehicles = [
            { kind: 'oncoming car (as spawned)', v: traffic.cars[0] },
            { kind: 'car going up the slice', v: new Car(scene, env, { direction: 1, speed: 8, startSegment: 10, ...spawn.crew }) },
            { kind: 'crew rider (as spawned)', v: traffic.motorcycles[0] },
            { kind: 'rider going down the slice', v: new AIMotorcycle(scene, env, { direction: -1, speed: 8, startSegment: 10, ...spawn.car }) }
        ];
        const bad = [];
        let checked = 0;
        for (const { kind, v } of vehicles) {
            for (let s = env.startS; s < env.endS - 10; s += 7) {
                putAt(v, route, s);
                const side = ownSide(route, v, { index: Math.max(0, Math.floor(route.toUnits(s)) - 2) });
                checked++;
                if (!onItsSide(env, v, side)) bad.push({ kind, s: Math.round(s), own: Math.round(side.own * 100) / 100, want: side.width / 4 - SIDE_MARGIN_M });
            }
        }
        expect(checked).toBeGreaterThan(7000);
        if (bad.length) throw new Error(`${bad.length} of ${checked} placings on the wrong side of the centre line:\n${list(bad)}`);
    });

    test('a rider passing swings toward the centre line, crosses it at most briefly, and comes back to its lane', () => {
        const route = env.route;
        const { AIMotorcycle } = fleet(env);
        const hairpins = findHairpins(rideSamples(...(w => [w.edges, w.ride.path])(decodeWorld(path.join(REPO, 'world')))));
        // A straight on a 10 m road and the tightest hairpins, on 7 m of road
        const starts = [2600, ...hairpins.filter(h => h.minRadiusM < 7).map(h => h.s0 - 10)];
        const bad = [];
        for (const s0 of starts) {
            const bike = new AIMotorcycle(new THREE.Scene(), env, { direction: 1, speed: 20, startSegment: 0 });
            putAt(bike, route, s0);
            bike.overtaking = true;
            bike.overtakeProgress = 0;
            let crossedM = 0, passedAt = null, prev = null, lastOwn = null;
            for (let f = 0; f < 60 * 30; f++) {
                bike.update(DT, null, [bike], []);
                const side = ownSide(route, bike, prev ? { index: prev.index } : null);
                if (prev && side.own < 0) crossedM += Math.abs(side.s - prev.s);
                if (!bike.overtaking && passedAt === null) passedAt = side.s;
                prev = side;
                lastOwn = side;
                if (passedAt !== null && side.s > passedAt + 10) break;
            }
            if (passedAt === null) bad.push({ s0, error: 'the pass never ended' });
            else if (crossedM > 10 || lastOwn.own < lastOwn.width / 4 - SIDE_MARGIN_M) bad.push({ s0, crossedM: Math.round(crossedM * 10) / 10, own: Math.round(lastOwn.own * 100) / 100 });
        }
        if (bad.length) throw new Error(`${bad.length} passes crossed the centre line for long or did not come back:\n${list(bad)}`);
    });
});

// The drawn LOD0 ribbon of the resident road sections, filed in 8 m cells: each triangle with its drawn column offsets
// and half widths (RoadMesh.nearRibbon's uv.x and road.x)
function drawnRibbon(env) {
    const CELL = 8;
    const cells = new Map();
    const v = new THREE.Vector3();
    for (const group of env.roadMeshes.values()) {
        group.traverse(o => {
            if (!o.isMesh || !o.geometry.userData.near || !o.geometry.attributes.road) return;
            o.updateMatrixWorld(true);
            const g = o.geometry, pos = g.attributes.position, uv = g.attributes.uv, road = g.attributes.road, index = g.index;
            const count = index ? index.count : pos.count;
            for (let i = 0; i + 2 < count; i += 3) {
                const ids = [0, 1, 2].map(k => (index ? index.getX(i + k) : i + k));
                const tri = [];
                for (const id of ids) { v.fromBufferAttribute(pos, id).applyMatrix4(o.matrixWorld); tri.push(v.x, v.y, v.z); }
                tri.offset = ids.map(id => uv.getX(id));
                tri.half = ids.map(id => road.getX(id));
                const x0 = Math.min(tri[0], tri[3], tri[6]), x1 = Math.max(tri[0], tri[3], tri[6]);
                const z0 = Math.min(tri[2], tri[5], tri[8]), z1 = Math.max(tri[2], tri[5], tri[8]);
                for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
                    for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
                        const k = `${cx},${cz}`;
                        (cells.get(k) || cells.set(k, []).get(k)).push(tri);
                    }
                }
            }
        });
    }
    const bary = (tri, x, z) => {
        const ax = tri[0], az = tri[2], bx = tri[3], bz = tri[5], cx = tri[6], cz = tri[8];
        const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
        if (Math.abs(d) < 1e-12) return null;
        const a = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
        const b = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
        const c = 1 - a - b;
        return a >= -1e-6 && b >= -1e-6 && c >= -1e-6 ? [a, b, c] : null;
    };
    // The drawn ribbon under (x, z) nearest height y: {offset, half}, or null where no ribbon is drawn
    return (x, z, y) => {
        let best = null;
        for (const tri of cells.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`) || []) {
            const b = bary(tri, x, z);
            if (!b) continue;
            const ty = b[0] * tri[1] + b[1] * tri[4] + b[2] * tri[7];
            if (Math.abs(ty - y) > 3 || (best && Math.abs(ty - y) >= Math.abs(best.y - y))) continue;
            best = { y: ty, offset: b[0] * tri.offset[0] + b[1] * tri.offset[1] + b[2] * tri.offset[2], half: b[0] * tri.half[0] + b[1] * tri.half[1] + b[2] * tri.half[2] };
        }
        return best;
    };
}

function wheelsOf(vehicle) {
    if (vehicle.wheels) return vehicle.wheels;
    return [vehicle.rearWheel, vehicle.frontWheel];
}

describe('the Tremola slice: traffic drives every hairpin smoothly, on its side and on the drawn road', () => {
    let env, hairpins, results;
    beforeAll(async () => {
        env = await loadSlice();
        // Only the road meshes are read: the land tiles are most of the streaming time and change no ribbon vertex
        env.buildTile = () => {};
        const world = decodeWorld(path.join(REPO, 'world'));
        hairpins = findHairpins(rideSamples(world.edges, world.ride.path));
        const route = env.route;
        const { Car, AIMotorcycle, spawn } = fleet(env);
        // Each type at the top of its speed in a world (Traffic: a car 25 m/s and a rider 56 m/s, times 0.4)
        const types = [
            { kind: 'car up', make: s => new Car(new THREE.Scene(), env, { direction: 1, speed: 10, startSegment: Math.floor(route.toUnits(s)), ...spawn.crew }), direction: 1 },
            { kind: 'car down', make: s => new Car(new THREE.Scene(), env, { direction: -1, speed: 10, startSegment: Math.floor(route.toUnits(s)), ...spawn.car }), direction: -1 },
            { kind: 'crew rider', make: s => new AIMotorcycle(new THREE.Scene(), env, { direction: 1, speed: 22, startSegment: Math.floor(route.toUnits(s)), ...spawn.crew }), direction: 1 }
        ];
        results = { drives: 0, frames: 0, yaw: [], heading: [], wheel: [], side: [], counts: { yaw: 0, heading: 0, wheel: 0, side: 0 }, worst: { yawStep: 0, headingDeg: 0, wheelOverM: 0 } };
        const note = (key, item) => { results.counts[key]++; if (results[key].length < 30) results[key].push(item); };
        for (const h of hairpins) {
            const from = Math.max(env.startS, h.s0 - 40), to = Math.min(env.endS - 5, h.s1 + 30);
            const mid = (from + to) / 2;
            const p = route.sample(mid, {});
            env.update(p, mid, null, Infinity);
            await env.streamer.settle(p, mid);
            const drawnAt = drawnRibbon(env);
            for (const type of types) {
                const start = type.direction === 1 ? from : to, end = type.direction === 1 ? to : from;
                const v = type.make(start);
                putAt(v, route, start);
                const g = groupOf(v);
                results.drives++;
                let prevYaw = null, prevRate = null, prevPos = null, hint = null;
                for (let f = 0; f < 60 * 120; f++) {
                    if (type.kind === 'crew rider') v.update(DT, null, [v], []);
                    else v.update(DT);
                    g.updateMatrixWorld(true);
                    results.frames++;
                    const side = ownSide(route, v, hint);
                    hint = { index: side.index };
                    const at = { hairpin: `${h.s0}-${h.s1} r${h.minRadiusM}`, kind: type.kind, s: Math.round(side.s * 10) / 10 };
                    const yaw = g.rotation.y;
                    // The step from the last frame is a chord: it points along the mean of the two frames' headings
                    const midYaw = prevYaw === null ? yaw : prevYaw + wrap(yaw - prevYaw) / 2;
                    if (prevYaw !== null) {
                        const rate = wrap(yaw - prevYaw) / DT;
                        if (prevRate !== null) {
                            const step = Math.abs(rate - prevRate);
                            results.worst.yawStep = Math.max(results.worst.yawStep, step);
                            if (step > YAW_RATE_STEP) note('yaw', { ...at, rate: Math.round(rate * 1000) / 1000, prevRate: Math.round(prevRate * 1000) / 1000 });
                        }
                        prevRate = rate;
                    }
                    prevYaw = yaw;
                    if (prevPos) {
                        const dx = g.position.x - prevPos.x, dz = g.position.z - prevPos.z;
                        if (Math.hypot(dx, dz) > 1e-4) {
                            const off = Math.abs(wrap(Math.atan2(dx, dz) - midYaw)) * 180 / Math.PI;
                            results.worst.headingDeg = Math.max(results.worst.headingDeg, off);
                            if (off > HEADING_DEG) note('heading', { ...at, deg: Math.round(off * 10) / 10 });
                        }
                    }
                    prevPos = g.position.clone();
                    for (const wheel of wheelsOf(v)) {
                        const w = new THREE.Vector3().setFromMatrixPosition(wheel.matrixWorld);
                        const drawn = drawnAt(w.x, w.z, g.position.y);
                        const over = drawn ? Math.abs(drawn.offset) - drawn.half : Infinity;
                        if (drawn) results.worst.wheelOverM = Math.max(results.worst.wheelOverM, over);
                        if (over > WHEEL_SLACK_M) note('wheel', { ...at, overM: drawn ? Math.round(over * 100) / 100 : 'no ribbon' });
                    }
                    if (!v.overtaking && !onItsSide(env, v, side)) note('side', { ...at, own: Math.round(side.own * 100) / 100, width: side.width });
                    if (type.direction === 1 ? side.s >= end : side.s <= end) break;
                }
                g.parent && g.parent.remove(g);
            }
        }
    }, 1200000);

    test('every hairpin was driven by every type', () => {
        expect(hairpins.length).toBeGreaterThanOrEqual(20);
        expect(results.drives).toBe(hairpins.length * 3);
        expect(results.frames).toBeGreaterThan(hairpins.length * 3 * 300);
    });

    test(`(a) the yaw rate changes by at most ${YAW_RATE_STEP} rad/s from one frame to the next`, () => {
        if (results.counts.yaw) throw new Error(`${results.counts.yaw} frames with a yaw-rate step over ${YAW_RATE_STEP} rad/s (worst ${results.worst.yawStep.toFixed(3)}):\n${list(results.yaw)}`);
    });

    test(`(b) the body points the way it moves, within ${HEADING_DEG} degrees`, () => {
        if (results.counts.heading) throw new Error(`${results.counts.heading} frames with the body over ${HEADING_DEG} degrees off its path (worst ${results.worst.headingDeg.toFixed(1)}):\n${list(results.heading)}`);
    });

    test('(c) every wheel is on the drawn carriageway', () => {
        if (results.counts.wheel) throw new Error(`${results.counts.wheel} wheel placings off the drawn carriageway (worst ${results.worst.wheelOverM.toFixed(2)} m past the edge):\n${list(results.wheel)}`);
    });

    test('(d) each vehicle stays on its own half of the road', () => {
        if (results.counts.side) throw new Error(`${results.counts.side} frames on the wrong half:\n${list(results.side)}`);
    });
});
