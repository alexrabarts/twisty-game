// The hairpin assist of a world ride (WorldAssist, Vehicle.adviceBraking / lineCapture / recoveryPull), with the
// real js/vehicle.js on a synthetic hairpin: a straight, a half circle of radius R turning toward +lateral, and the
// straight back. The ground beside the road is open run-off, so leaving the road shows as a lateral past the edge.
import { describe, test, expect } from '@jest/globals';
import { loadGame, loadScript } from '../helpers/load-game.js';
import { samplesOf, fakeData, allTiles } from '../helpers/world-synthetic.js';

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

function hairpin(radius) {
    const route = new WorldRoute(samplesOf(hairpinPoints(radius)), {});
    const ground = new WorldGround(route, fakeData({ tiles: allTiles(-1, 0, -1, 0), zone: () => 0 }));
    return { route, ground, radius, bendEnd: STRAIGHT + Math.PI * radius };
}

function bikeOn(world, level, s = 40, lean = 0) {
    const vehicle = new Vehicle(new THREE.Scene());
    vehicle.environment = { physics: WorldPhysics, route: world.route, ground: world.ground };
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
function ride(world, level, { speed = advised(world.radius), lead = 4, input = 1 } = {}) {
    const vehicle = bikeOn(world, level);
    const out = { inside: 0, outside: 0, crashed: false, leans: [] };
    for (let tick = 0; tick < 60 * 20; tick++) {
        const s = vehicle.projection.s;
        const into = world.route.curvatureAt(s + lead, 4) > 1 / 30 || world.route.curvatureAt(s, 4) > 1 / 30;
        vehicle.speed = speed;
        vehicle.update(DT, into ? input : 0, 0, 0);
        out.leans.push(vehicle.leanAngle);
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
        const run = (level, throttle) => {
            const vehicle = bikeOn(world, level, 20);
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
    });

    test('the advice braking is never harder than the rider\'s own full brake', () => {
        const world = hairpin(12);
        const vehicle = bikeOn(world, 'normal', 90);
        vehicle.speed = 25;
        vehicle.brakeForce = 1; // a weak brake: the assist may not beat it
        const before = vehicle.speed;
        vehicle.update(DT, 0, 0, 0);
        const drag = 0.002 * before * before * DT;
        expect(before - vehicle.speed).toBeLessThanOrEqual(1 * DT + drag + 1e-9);
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

    test('it adds no lean with no input or with the input out of the bend', () => {
        const world = hairpin(12);
        for (const input of [0, -1, -0.4]) {
            const off = ride(world, 'off', { input, lead: 4 });
            const normal = ride(world, 'normal', { input, lead: 4 });
            const n = Math.min(off.leans.length, normal.leans.length);
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
        const off = ride(world, 'off', { speed: 20, lead: 6 });
        const normal = ride(world, 'normal', { speed: 20, lead: 6 });
        expect(normal.leans).toEqual(off.leans);
    });
});

describe('recovery', () => {
    // A bike past the outside edge just after the hairpin's apex, facing along the road, no input
    function wide(level, past) {
        const world = hairpin(12);
        const s = STRAIGHT + Math.PI * 12 * 0.7;
        const vehicle = bikeOn(world, level, s);
        const p = world.route.sample(s, {});
        const lateral = -(WIDTH / 2 + past);
        vehicle.position.x = p.x + lateral * Math.cos(p.heading);
        vehicle.position.z = p.z - lateral * Math.sin(p.heading);
        vehicle.findNearestRoadSegment();
        let least = Infinity;
        for (let tick = 0; tick < 90; tick++) {
            vehicle.speed = 6;
            vehicle.yawAngle = world.route.sample(vehicle.projection.s, {}).heading;
            vehicle.update(DT, 0, 0, 0);
            least = Math.min(least, -vehicle.projection.lateral - WIDTH / 2);
        }
        return { least, used: WorldPhysics.recoveryBudgetM - vehicle.recoveryLeft, vehicle };
    }

    test('a bike running wide on the exit is pulled back toward the road edge, mildly', () => {
        const off = wide('off', 1.5);
        const normal = wide('normal', 1.5);
        expect(normal.least).toBeLessThan(off.least - 0.5);
        expect(normal.least).toBeGreaterThanOrEqual(-0.25); // to the edge, not across the road
        expect(normal.used).toBeLessThanOrEqual(WorldPhysics.recoveryBudgetM + 1e-9);
        expect(wide('low', 1.5).used).toBeLessThan(normal.used + 1e-9);
    });

    test('it is limited: nothing beyond recoveryReachM, and never more than the budget in one bend', () => {
        expect(wide('normal', WorldPhysics.recoveryReachM + 1).used).toBe(0);
        const world = hairpin(12);
        const vehicle = bikeOn(world, 'normal', STRAIGHT + 10);
        // Held against the outside edge for 5 s: the pull stops when the budget is spent
        let pulled = 0;
        for (let tick = 0; tick < 300; tick++) {
            const p = world.route.sample(vehicle.projection.s, {});
            const lateral = -(WIDTH / 2 + 1);
            vehicle.position.set(p.x + lateral * Math.cos(p.heading), p.y, p.z - lateral * Math.sin(p.heading));
            vehicle.yawAngle = p.heading;
            vehicle.speed = 0.5;
            const before = vehicle.position.clone();
            vehicle.update(DT, 0, 0, 0);
            const forward = new THREE.Vector3(Math.sin(p.heading), 0, Math.cos(p.heading));
            const moved = vehicle.position.clone().sub(before);
            pulled += Math.abs(moved.x - forward.x * moved.dot(forward)) + Math.abs(moved.z - forward.z * moved.dot(forward));
        }
        expect(vehicle.recoveryLeft).toBeCloseTo(0, 9);
        expect(pulled).toBeLessThanOrEqual(WorldPhysics.recoveryBudgetM * 1.5);
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
        expect(WorldAssist.cycle()).toBe('off');
        expect(WorldAssist.cycle()).toBe('low');
        expect(WorldAssist.setLevel('nonsense')).toBe('low');
    });

    test('a leg never reaches the assist', () => {
        const vehicle = new Vehicle(new THREE.Scene());
        vehicle.environment = { physics: null };
        expect(vehicle.assistShare()).toBe(0);
    });
});
