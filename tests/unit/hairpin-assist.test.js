// The hairpin assist of a world ride (WorldAssist, Vehicle.adviceBraking / lineCapture / edgeAssistRate), with the
// real js/vehicle.js on a synthetic hairpin: a straight, a half circle of radius R turning toward +lateral, and the
// straight back. The ground beside the road is open run-off, so leaving the road shows as a lateral past the edge.
import { describe, test, expect } from '@jest/globals';
import { loadGame, loadScript } from '../helpers/load-game.js';
import { samplesOf, fakeData, allTiles, straight } from '../helpers/world-synthetic.js';

const DT = 1 / 60;
const G = 9.81;
const game = loadGame();
const { THREE, WorldRoute, WorldGround, WorldPhysics, Vehicle } = game;
const WorldAssist = new Function(`${loadScript('world/run.js')}\nreturn WorldAssist;`)();

const STRAIGHT = 120;
const WIDTH = 10;

function hairpinPoints(radius, step = 2) {
    const points = [];
    for (let z = 0; z < STRAIGHT; z += step) points.push({ x: 0, y: 100, z, heading: 0, width: WIDTH });
    const n = Math.ceil(Math.PI * radius / step);
    for (let i = 0; i <= n; i++) {
        const h = Math.PI * i / n;
        points.push({ x: radius - radius * Math.cos(h), y: 100, z: STRAIGHT + radius * Math.sin(h), heading: h, width: WIDTH });
    }
    for (let z = STRAIGHT - step; z > 0; z -= step) points.push({ x: 2 * radius, y: 100, z, heading: Math.PI, width: WIDTH });
    return points;
}

function hairpin(radius, step = 2) {
    const route = new WorldRoute(samplesOf(hairpinPoints(radius, step)), {});
    const ground = new WorldGround(route, fakeData({ tiles: allTiles(-1, 0, -1, 0), zone: () => 0 }));
    return { route, ground, radius, bendEnd: STRAIGHT + Math.PI * radius };
}

// The physics with the edge assist off, for the tests that isolate the line capture
const NO_EDGE = Object.freeze({ ...WorldPhysics, edgeLeanRate: 0 });
// The physics with the throttle-closed engine braking off, for the tests that isolate the speed advice
const NO_ENGINE_BRAKE = Object.freeze({ ...WorldPhysics, engineBrake: 0 });

function bikeOn(world, level, s = 40, lean = 0, physics = WorldPhysics) {
    const vehicle = new Vehicle(new THREE.Scene());
    vehicle.environment = { physics, route: world.route, ground: world.ground };
    vehicle.assistLevel = level;
    const p = world.route.sample(s, {});
    vehicle.position.set(p.x, p.y, p.z);
    vehicle.yawAngle = p.heading;
    vehicle.leanAngle = lean;
    vehicle.findNearestRoadSegment();
    vehicle.projection.s = s;
    return vehicle;
}

const advised = radius => Math.sqrt(G * radius * Math.tan(WorldPhysics.adviceLeanDeg * Math.PI / 180));

// The scripted rider: full steering into the bend once the curvature `lead` metres ahead passes 1/30 m, held
// while the bend is under the bike, released after; the speed held at `speed`. Records the run through the bend.
function ride(world, level, { speed = advised(world.radius), lead = 4, input = 1, physics = WorldPhysics } = {}) {
    const vehicle = bikeOn(world, level, 40, 0, physics);
    const out = { inside: 0, outside: 0, crashed: false, leans: [], places: [] };
    for (let tick = 0; tick < 60 * 20; tick++) {
        const s = vehicle.projection.s;
        const into = world.route.curvatureAt(s + lead, 4) > 1 / 30 || world.route.curvatureAt(s, 4) > 1 / 30;
        vehicle.speed = speed;
        vehicle.update(DT, into ? input : 0, 0, 0);
        out.leans.push(vehicle.leanAngle);
        out.places.push(vehicle.position.x * 1e6 + vehicle.position.z);
        if (vehicle.crashed) { out.crashed = true; break; }
        const p = vehicle.projection;
        if (p.s > STRAIGHT - 15 && p.s < world.bendEnd + 15) {
            out.inside = Math.max(out.inside, p.lateral);
            out.outside = Math.max(out.outside, -p.lateral);
        }
        if (p.s > world.bendEnd + 20) break;
    }
    return out;
}

describe('speed advice', () => {
    test('the advised speed is sqrt(g R tan(adviceLeanDeg)) x grip, never tighter than the radius floor', () => {
        expect(WorldPhysics.adviceLeanDeg).toBeGreaterThanOrEqual(30);
        expect(WorldPhysics.adviceLeanDeg).toBeLessThanOrEqual(40);
        const tan = Math.tan(WorldPhysics.adviceLeanDeg * Math.PI / 180);
        for (const radius of [8, 10, 12, 18, 25]) {
            expect(WorldAssist.advisedSpeed(WorldPhysics, radius)).toBeCloseTo(Math.sqrt(G * radius * tan), 9);
            expect(WorldAssist.advisedSpeed(WorldPhysics, radius, 0.85)).toBeCloseTo(Math.sqrt(G * radius * tan * 0.85), 9);
        }
        expect(WorldAssist.advisedSpeed(WorldPhysics, 2)).toBeCloseTo(Math.sqrt(G * WorldPhysics.radiusFloor * tan), 9);
    });

    test('the bend ahead is found with its radius, its side and how far off it starts', () => {
        for (const radius of [10, 12, 20]) {
            const world = hairpin(radius);
            const bend = WorldAssist.bendAhead(world.route, WorldPhysics, 40, 150);
            expect(bend.sign).toBe(1);
            expect(bend.radius).toBeGreaterThan(radius * 0.95);
            expect(bend.radius).toBeLessThan(radius * 1.05);
            expect(Math.abs(40 + bend.distance - STRAIGHT)).toBeLessThanOrEqual(WorldPhysics.assistSpanM + 2);
            expect(WorldAssist.bendAhead(world.route, WorldPhysics, 0, 40)).toBeNull();
        }
    });

    test('with no throttle and well over the advice the engine brakes toward it, never past it and not with throttle', () => {
        const world = hairpin(12);
        const target = advised(12);
        // With the engine braking off, so the assist's own share shows; the ride with it is checked below
        const run = (level, throttle, physics = NO_ENGINE_BRAKE) => {
            const vehicle = bikeOn(world, level, 20, 0, physics);
            vehicle.speed = 20;
            let least = Infinity;
            while (vehicle.projection.s < STRAIGHT - 2) {
                vehicle.update(DT, 0, throttle, 0);
                least = Math.min(least, vehicle.speed);
            }
            return { speed: vehicle.speed, least };
        };
        const off = run('off', 0);
        const normal = run('normal', 0);
        expect(normal.speed).toBeLessThan(off.speed - 4);
        expect(normal.speed).toBeLessThanOrEqual(target * 1.1 + 0.5);
        expect(normal.least).toBeGreaterThanOrEqual(target - 0.3);
        const low = run('low', 0);
        expect(low.speed).toBeGreaterThan(normal.speed);
        expect(low.speed).toBeLessThan(off.speed);
        // Throttle held: the assist leaves the speed alone
        expect(run('normal', 0.3).speed).toBeCloseTo(run('off', 0.3).speed, 9);
        // With the engine braking on, the two together still slow the bike to the advice and not past it
        const engined = run('normal', 0, WorldPhysics);
        expect(engined.speed).toBeLessThanOrEqual(target * 1.1 + 0.5);
        expect(engined.least).toBeGreaterThanOrEqual(target - 0.3);
        expect(engined.speed).toBeLessThan(run('off', 0, WorldPhysics).speed);
    });

    test('the advice braking is never harder than the rider\'s own full brake', () => {
        const world = hairpin(12);
        const vehicle = bikeOn(world, 'normal', 90, 0, NO_ENGINE_BRAKE);
        vehicle.speed = 25;
        vehicle.brakeForce = 1; // a weak brake: the assist may not beat it (the world's full brake is x brakeGain)
        const before = vehicle.speed;
        vehicle.update(DT, 0, 0, 0);
        const drag = 0.002 * before * before * DT;
        expect(before - vehicle.speed).toBeGreaterThan(drag);
        expect(before - vehicle.speed).toBeLessThanOrEqual(WorldPhysics.brakeGain * DT + drag + 1e-9);
    });
});

describe('line capture', () => {
    test('full steering held through a 12 m hairpin at the advised speed stays on the road with the assist on', () => {
        const world = hairpin(12);
        const normal = ride(world, 'normal');
        expect(normal.crashed).toBe(false);
        expect(normal.inside).toBeLessThanOrEqual(WIDTH / 2);
        expect(normal.outside).toBeLessThanOrEqual(WIDTH / 2);
    });

    test('the same rider with the assist off leaves the road (full lock turns tighter than the hairpin)', () => {
        const world = hairpin(12);
        const off = ride(world, 'off');
        expect(off.crashed || off.inside > WIDTH / 2 || off.outside > WIDTH / 2).toBe(true);
    });

    test('full steering held into a 10 m hairpin at 9 m/s, over turnBlendSpeed and the advice, is held on the line at normal; off it cuts the inside', () => {
        // (holdSpeedMs, holdTightR: full lean turns the bike on about 8 m, tighter than the line, and outside the capture
        // window; leg 3's hairpins at s 2 980 and 4 060 put a rider on the grass inside at 9 m/s)
        const world = hairpin(10);
        expect(9.2).toBeGreaterThan(WorldPhysics.turnBlendSpeed);
        expect(9.2).toBeLessThanOrEqual(WorldPhysics.holdSpeedMs);
        expect(10).toBeLessThanOrEqual(WorldPhysics.holdTightR);
        const normal = ride(world, 'normal', { speed: 9.2 });
        expect(normal.crashed).toBe(false);
        expect(normal.inside).toBeLessThanOrEqual(WIDTH / 2);
        const off = ride(world, 'off', { speed: 9.2 });
        expect(off.crashed || off.inside > WIDTH / 2).toBe(true);
    });

    test('it adds no lean with no input or with the input out of the bend', () => {
        const world = hairpin(12);
        for (const input of [0, -1, -0.4]) {
            const off = ride(world, 'off', { input, lead: 4, physics: NO_EDGE });
            const normal = ride(world, 'normal', { input, lead: 4, physics: NO_EDGE });
            // Compared while the two bikes stand in the same place
            const moved = normal.places.findIndex((p, i) => i < off.places.length && p !== off.places[i]);
            const n = Math.min(off.leans.length, normal.leans.length, moved < 0 ? Infinity : moved);
            expect(n).toBeGreaterThan(300);
            for (let i = 0; i < n; i++) expect(normal.leans[i]).toBe(off.leans[i]);
        }
    });

    // On the arc of a 12 m hairpin, a bike turning at a radius near the line's ends on it; one far off is left alone
    function onArc(level, radius, input, seconds) {
        const world = hairpin(12);
        const v = advised(12);
        const lean = -Math.atan(v * v / (G * radius));
        const vehicle = bikeOn(world, level, STRAIGHT + 2, lean);
        const out = { leans: [], radii: [], laterals: [] };
        for (let tick = 0; tick < seconds * 60; tick++) {
            vehicle.speed = v;
            vehicle.update(DT, input, 0, 0);
            out.leans.push(vehicle.leanAngle);
            out.radii.push(v * v / (G * Math.tan(Math.abs(vehicle.leanAngle))));
            out.laterals.push(vehicle.projection.lateral);
        }
        out.vehicle = vehicle;
        return out;
    }

    test('a rider who enters near the right radius ends on the arc and is held there', () => {
        for (const start of [12 * 1.2, 12 * 0.85]) {
            const normal = onArc('normal', start, 1, 2.5);
            const off = onArc('off', start, 1, 2.5);
            const end = normal.radii.length - 1;
            // The line is the road's radius at the bike's offset: within 15% of 12 m on this lane
            expect(Math.abs(normal.radii[end] / 12 - 1)).toBeLessThan(0.15);
            expect(Math.max(...normal.laterals.map(Math.abs))).toBeLessThan(WIDTH / 2 - 0.5);
            // Without it the held key leans on to the limit: far tighter than the road, or off it
            const offLeft = Math.max(...off.laterals.map(Math.abs)) > WIDTH / 2;
            expect(offLeft || Math.abs(off.radii[end] / 12 - 1) > 0.15).toBe(true);
        }
    });

    test('a rider far off the line is not yanked onto it', () => {
        // Barely leaned (radius about 4 x the line): until the rider's own steering brings the radius into twice
        // the window, the lean is exactly what it is with the assist off
        const normal = onArc('normal', 48, 0.3, 1.5);
        const off = onArc('off', 48, 0.3, 1.5);
        let checked = 0;
        for (let i = 0; i < off.radii.length; i++) {
            if (Math.abs(off.radii[i] / 12 - 1) <= WorldPhysics.lineCapture * 2 + 0.2) break;
            expect(normal.leans[i]).toBe(off.leans[i]);
            checked++;
        }
        expect(checked).toBeGreaterThan(10);
    });

    test('a gentle bend gets no capture', () => {
        expect(WorldAssist.fade(WorldPhysics, WorldPhysics.assistGentleR)).toBe(0);
        expect(WorldAssist.fade(WorldPhysics, 200)).toBe(0);
        expect(WorldAssist.fade(WorldPhysics, WorldPhysics.assistTightR)).toBe(1);
        const world = hairpin(80);
        const off = ride(world, 'off', { speed: 20, lead: 6, physics: NO_EDGE });
        const normal = ride(world, 'normal', { speed: 20, lead: 6, physics: NO_EDGE });
        expect(normal.leans).toEqual(off.leans);
    });
});

describe('past the edge', () => {
    // A bike past the outside edge just after the hairpin's apex, facing along the road, no input. The assist acts
    // only on the carriageway: past the edge nothing pulls the bike (the old recovery pull moved it back to the edge,
    // with nothing drawn to explain the move)
    function wide(level, past) {
        const world = hairpin(12);
        const s = STRAIGHT + Math.PI * 12 * 0.7;
        const vehicle = bikeOn(world, level, s);
        const p = world.route.sample(s, {});
        const lateral = -(WIDTH / 2 + past);
        vehicle.position.x = p.x + lateral * Math.cos(p.heading);
        vehicle.position.z = p.z - lateral * Math.sin(p.heading);
        vehicle.findNearestRoadSegment();
        const laterals = [];
        for (let tick = 0; tick < 90; tick++) {
            vehicle.speed = 6;
            vehicle.yawAngle = world.route.sample(vehicle.projection.s, {}).heading;
            vehicle.update(DT, 0, 0, 0);
            laterals.push(vehicle.projection.lateral);
        }
        return laterals;
    }

    test('a bike running wide on the exit is left to the rider: the same as with the assist off', () => {
        for (const past of [0.5, 1.5, 3]) expect(wide('normal', past)).toEqual(wide('off', past));
    });
});

// The road data is a polyline of samples about 4 m apart. The assist reads its curvature and its frame from the
// route's smooth profile and centreline (WorldRoute.smoothCurvatureAt, smoothFrame) and reaches the lean rate
// low-passed over assistSmoothing, so the target lean and the push it gives do not step from sample to sample
describe('smoothness', () => {
    // A 12 m hairpin sampled every 4 m, the scripted rider at the advised speed with the assist at normal: the
    // largest frame-to-frame step of the line's target lean (over frames captured both times) and of the
    // assist's share of the lean rate
    function steps(world, physics = WorldPhysics) {
        const vehicle = bikeOn(world, 'normal', 40, 0, physics);
        const speed = advised(world.radius);
        let lastTarget = null, lastRate = 0, target = 0, rate = 0, captured = 0;
        for (let tick = 0; tick < 60 * 20; tick++) {
            const s = vehicle.projection.s;
            const into = world.route.curvatureAt(s + 4, 4) > 1 / 30 || world.route.curvatureAt(s, 4) > 1 / 30;
            vehicle.lineLeanTarget = null;
            vehicle.speed = speed;
            vehicle.update(DT, into ? 1 : 0, 0, 0);
            const now = vehicle.lineCaptured ? vehicle.lineLeanTarget : null;
            if (now !== null) captured++;
            if (now !== null && lastTarget !== null) target = Math.max(target, Math.abs(now - lastTarget));
            lastTarget = now;
            rate = Math.max(rate, Math.abs(vehicle.assistLeanRate - lastRate));
            lastRate = vehicle.assistLeanRate;
            if (vehicle.projection.s > world.bendEnd + 20) break;
        }
        return { target: target * 180 / Math.PI, rate, captured, crashed: vehicle.crashed };
    }

    // The same route with the smooth profile and centreline hidden, read as the polyline
    function polyline(world) {
        const route = Object.create(world.route);
        route.smoothCurvatureAt = undefined;
        route.smoothFrame = undefined;
        return { ...world, route };
    }

    test('through a 4 m sampled 12 m hairpin the target lean steps under 1 degree a frame and the push under 0.5 rad/s', () => {
        const run = steps(hairpin(12, 4));
        expect(run.crashed).toBe(false);
        expect(run.captured).toBeGreaterThan(60);
        expect(run.target).toBeLessThan(1);
        expect(run.rate).toBeLessThan(0.5);
    });

    // The target lean no longer steps off the polyline either: the projection is in the ribbon's frame
    // (WorldRoute.nearestSegment), so the progress and lateral it reads have no step at a sample. The low-pass still
    // carries the push
    test('planted: read off the polyline and not low-passed, the push steps several times over', () => {
        const run = steps(polyline(hairpin(12, 4)), { ...WorldPhysics, assistSmoothing: 1e-9 });
        expect(run.target).toBeLessThan(2);
        expect(run.rate).toBeGreaterThan(1.5);
    });

    test('the smooth curvature has no steps and agrees with the polyline on the arc', () => {
        const world = hairpin(12, 4);
        let last = WorldAssist.curvature(world.route, WorldPhysics, 0), worst = 0;
        for (let s = 0.05; s < world.route.length; s += 0.05) {
            const k = WorldAssist.curvature(world.route, WorldPhysics, s);
            worst = Math.max(worst, Math.abs(k - last));
            last = k;
        }
        expect(worst).toBeLessThan(0.002);
        expect(world.route.smoothCurvatureAt(STRAIGHT + Math.PI * 6, WorldPhysics.assistSpanM)).toBeCloseTo(1 / 12, 2);
    });

    test('the smooth frame is continuous where the polyline frame jumps', () => {
        const world = hairpin(12, 4);
        // Along the inside of the arc, 1.5 m in from the centreline
        let last = null, worstS = 0, worstLateral = 0;
        for (let a = 0.05; a < Math.PI - 0.05; a += 0.002) {
            const x = 12 - 10.5 * Math.cos(a), z = STRAIGHT + 10.5 * Math.sin(a);
            const frame = world.route.smoothFrame(x, z, world.route.project(x, z, null, {}).s, {});
            if (last) {
                worstS = Math.max(worstS, Math.abs(frame.s - last.s));
                worstLateral = Math.max(worstLateral, Math.abs(frame.lateral - last.lateral));
            }
            last = { ...frame };
            expect(Math.abs(frame.lateral - 1.5)).toBeLessThan(0.05);
        }
        expect(worstS).toBeLessThan(0.05);
        expect(worstLateral).toBeLessThan(0.01);
    });
});

// 4. The edge assist, on a straight 10 m road with open run-off either side
describe('edge assist', () => {
    function straightWorld(flags = 0) {
        const route = new WorldRoute(samplesOf(straight(800), { flags }), {});
        const ground = new WorldGround(route, fakeData({ tiles: allTiles(-1, 0, -1, 1), zone: () => 0 }));
        return { route, ground };
    }

    // A bike at `lateral` heading `angle` (radians) toward +lateral at 20 m/s; `input(tick, vehicle)` steers
    function drift(level, { lateral = 3, angle = 0.07, seconds = 4, input = () => 0, physics = WorldPhysics, flags = 0 } = {}) {
        const world = straightWorld(flags);
        const vehicle = new Vehicle(new THREE.Scene());
        vehicle.environment = { physics, route: world.route, ground: world.ground };
        vehicle.assistLevel = level;
        vehicle.position.set(lateral, 100, 40);
        vehicle.yawAngle = angle;
        vehicle.findNearestRoadSegment();
        const out = { most: -Infinity, laterals: [], leans: [], shares: [], vehicle };
        for (let tick = 0; tick < seconds * 60 && !vehicle.crashed; tick++) {
            vehicle.speed = 20;
            vehicle.update(DT, input(tick, vehicle), 0, 0);
            out.laterals.push(vehicle.projection.lateral);
            out.leans.push(vehicle.leanAngle);
            out.shares.push(vehicle.edgeShare);
            out.most = Math.max(out.most, vehicle.projection.lateral);
        }
        return out;
    }

    test('a bike drifting off the edge of a straight at 20 m/s with no input is nudged back; with the assist off it leaves', () => {
        const off = drift('off');
        const normal = drift('normal');
        expect(off.most).toBeGreaterThan(WIDTH / 2 + 1);
        // Onto the drawn verge at most (the nudge acts only on the carriageway), heading along the road or back toward it
        expect(normal.most).toBeLessThan(WIDTH / 2 + game.RoadSurface.VERGE_M);
        expect(normal.laterals[normal.laterals.length - 1]).toBeLessThan(WIDTH / 2 + game.RoadSurface.VERGE_M);
        expect(Math.sin(normal.vehicle.yawAngle)).toBeLessThanOrEqual(0.01);
        // low gives less, but still some
        const low = drift('low');
        expect(low.most).toBeGreaterThan(normal.most);
        expect(low.most).toBeLessThan(off.most);
    });

    test('nothing in the middle of the road, nor heading back toward it', () => {
        const middle = drift('normal', { lateral: 0, angle: 0.03, seconds: 1 });
        expect(middle.shares.every(x => x === 0)).toBe(true);
        const back = drift('normal', { lateral: 4.5, angle: -0.05, seconds: 1 });
        expect(back.shares.every(x => x === 0)).toBe(true);
    });

    test('steering back toward the road gets no extra help', () => {
        const steer = (tick, vehicle) => (vehicle.projection.lateral > 0 ? -0.5 : 0);
        const off = drift('off', { lateral: 4, input: steer, seconds: 3 });
        const normal = drift('normal', { lateral: 4, input: steer, seconds: 3 });
        let checked = 0;
        for (let i = 0; i < off.laterals.length && off.laterals[i] > 0; i++) {
            expect(normal.leans[i]).toBe(off.leans[i]);
            checked++;
        }
        expect(checked).toBeGreaterThan(30);
    });

    test('it is no rail: steered on toward the edge, it fades out over edgeBudgetS and the bike leaves the road', () => {
        const toward = () => 0.25;
        const off = drift('off', { lateral: 3, angle: 0, input: toward, seconds: 6 });
        const normal = drift('normal', { lateral: 3, angle: 0, input: toward, seconds: 6 });
        expect(off.most).toBeGreaterThan(WIDTH / 2);
        expect(normal.most).toBeGreaterThan(WIDTH / 2);
        // It acted, then stopped acting within the budget of continuous use
        const acting = normal.shares.map(x => x > 0);
        const first = acting.indexOf(true);
        expect(first).toBeGreaterThanOrEqual(0);
        const lastActing = acting.lastIndexOf(true);
        expect((lastActing - first) * DT).toBeLessThanOrEqual(WorldPhysics.edgeBudgetS + 0.05);
        // (and never past the edge: the bike reaches it before the budget is spent)
        expect(normal.vehicle.edgeUsedS).toBeGreaterThan(0);
        // The budget refills once the bike is back in the middle half of the road
        const vehicle = normal.vehicle;
        vehicle.crashed = false;
        vehicle.position.set(0, 100, 300);
        vehicle.yawAngle = 0;
        vehicle.leanAngle = 0;
        vehicle.leanVelocity = 0;
        vehicle.findNearestRoadSegment();
        vehicle.speed = 20;
        vehicle.update(DT, 0, 0, 0);
        expect(vehicle.edgeUsedS).toBe(0);
    });

    test('it is off in a tunnel, where the wall response has the edge', () => {
        const tunnel = drift('normal', { flags: WorldRoute.FLAG.tunnel, seconds: 2 });
        expect(tunnel.shares.every(x => x === 0)).toBe(true);
    });

    test('past the edge of a straight nothing pulls the bike: the same as with the assist off', () => {
        const off = drift('off', { lateral: WIDTH / 2 + 1.5, angle: 0, seconds: 1.5 });
        const normal = drift('normal', { lateral: WIDTH / 2 + 1.5, angle: 0, seconds: 1.5 });
        expect(normal.laterals).toEqual(off.laterals);
        expect(normal.shares.every(x => x === 0)).toBe(true);
    });
});

describe('assist level', () => {
    test('off, low and normal scale the assist 0, 0.5 and 1, and the default is normal', () => {
        expect(WorldAssist.share(WorldPhysics, 'off')).toBe(0);
        expect(WorldAssist.share(WorldPhysics, 'low')).toBe(0.5);
        expect(WorldAssist.share(WorldPhysics, 'normal')).toBe(1);
        expect(WorldAssist.share(WorldPhysics, 'bogus')).toBe(0);
        WorldAssist.chosen = undefined;
        expect(WorldAssist.level()).toBe('normal');
    });

    // The level is the rider mode's (js/ridermodes.js, tests/unit/rider-modes.test.js): the assist has no setting,
    // no key and no storage of its own
    test('the level is what it is set to, a level no table knows gives no assist, and nothing here is stored', () => {
        WorldAssist.chosen = undefined;
        expect(WorldAssist.setLevel('low')).toBe('low');
        expect(WorldAssist.level()).toBe('low');
        expect(WorldAssist.setLevel('')).toBe('low');
        expect(WorldAssist.setLevel(undefined)).toBe('low');
        expect(WorldAssist.share(WorldPhysics, WorldAssist.setLevel('made-up'))).toBe(0);
        for (const gone of ['cycle', 'store', 'pauseButton', 'STORAGE_KEY', 'ORDER']) expect(WorldAssist[gone]).toBeUndefined();
        expect(loadScript('world/run.js')).not.toMatch(/localStorage|location\.search/);
        expect(loadScript('world/guide.js')).not.toMatch(/keydown/);
        WorldAssist.chosen = undefined;
    });

    test('a leg never reaches the assist', () => {
        const vehicle = new Vehicle(new THREE.Scene());
        vehicle.environment = { physics: null };
        expect(vehicle.assistShare()).toBe(0);
    });
});
