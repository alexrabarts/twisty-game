// What the roadworks sites do (js/world/roadworks.js): the traffic lights that the world's traffic obeys, the ramps that
// throw the bike, the light things it knocks over and the heavy ones it hits, the red light a rider runs, and a careful
// rider through every open lane. The layout is tests/unit/world-markers.test.js.
import { describe, test, expect, beforeAll } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';
import { rideSpan } from '../helpers/world-rider.js';

const log = [];
const game = loadGame(undefined, log);
const { THREE, WorldEnvironment, Roadworks, Traffic, Vehicle } = game;

let env, works;
beforeAll(async () => {
    const { fetchFn } = diskFetch();
    env = await WorldEnvironment.load(new THREE.Scene(), { id: 'tremola', fetchFn, models: null, digest: async () => '0' });
    // Trees and houses are not solid in a world ride: building them is most of the streaming time (world-fairness.test.js)
    env.scenery.buildTile = () => null;
    await env.data.ensureChunks(env.data.manifest.chunks.map((_, k) => k));
    works = env.roadworks;
}, 300000);

describe('the traffic lights and the traffic', () => {
    test('dense traffic stops at red, queues, never holds the single lane from both ways, and clears it before the other way goes', () => {
        const site = works.closed[0];
        const route = env.route;
        const traffic = new Traffic(new THREE.Scene(), env);
        // The game's own Car and AIMotorcycle, from the vehicles a Traffic makes
        const Car = traffic.cars[0].constructor, AIMotorcycle = traffic.motorcycles[0].constructor;
        traffic.cars.forEach(c => c.remove());
        traffic.motorcycles.forEach(m => m.remove());
        traffic.cars = [];
        traffic.motorcycles = [];
        const put = (vehicle, s) => {
            const u = route.toUnits(s);
            vehicle.currentSegment = Math.floor(u);
            vehicle.segmentProgress = u - Math.floor(u);
            vehicle.laneMoving = false;
            vehicle.updatePosition();
        };
        // Eight cars each way and three riders of the crew going up, queued up to each end
        for (let k = 0; k < 8; k++) {
            for (const direction of [1, -1]) {
                const car = new Car(traffic.scene, env, { direction, speed: 6 + (k % 3), startSegment: 0, lane: direction > 0 ? 'left' : 'right', color: 0x808080 });
                put(car, direction > 0 ? site.s0 - 20 - k * 12 : site.s1 + 20 + k * 12);
                traffic.cars.push(car);
            }
        }
        for (let k = 0; k < 3; k++) {
            const bike = new AIMotorcycle(traffic.scene, env, { direction: 1, speed: 14, startSegment: 0, lane: 'left', color: 0xff0000, style: 'sport', skill: 'average', riderName: `R${k}`, helmetColor: 0, suitColor: 0 });
            put(bike, site.s0 - 130 - k * 8);
            traffic.motorcycles.push(bike);
        }
        const all = () => traffic.worldVehicles();
        const far = { x: 1e6, y: 0, z: 1e6 };
        const dt = 1 / 30;
        const cycles = 4;
        const steps = Math.ceil(cycles * site.cycleS / dt);
        const front = v => v.s + v.direction * v.half;
        const last = new Map();
        const bad = [];
        let both = 0, overlap = Infinity, queued = 0, exits = { 1: 0, '-1': 0 }, phase = works.phase(site).index;
        for (let i = 0; i < steps; i++) {
            works.step(dt);
            const now = works.phase(site).index;
            if (now !== phase) {
                // A green starts only on a lane with nothing of the other way in it
                const inside = all().filter(v => v.s + v.half > site.stopIn && v.s - v.half < site.stopOut);
                if (now === 0 && inside.some(v => v.direction < 0)) bad.push(`t ${(i * dt).toFixed(1)}: green up with a car coming down still in the lane`);
                if (now === 3 && inside.some(v => v.direction > 0)) bad.push(`t ${(i * dt).toFixed(1)}: green down with a vehicle going up still in the lane`);
                phase = now;
            }
            traffic.update(dt, far, null);
            const list = all();
            const inside = list.filter(v => v.s + v.half > site.stopIn && v.s - v.half < site.stopOut);
            if (inside.some(v => v.direction > 0) && inside.some(v => v.direction < 0)) both++;
            for (const v of list) {
                const line = v.direction > 0 ? site.stopIn : site.stopOut;
                const exit = v.direction > 0 ? site.stopOut : site.stopIn;
                const was = last.get(v.vehicle);
                const f = front(v);
                if (was !== undefined && (was - line) * v.direction < 0 && (f - line) * v.direction >= 0) {
                    const state = works.light(site, v.direction);
                    if (state === 'red' || (state === 'amber' && v.vehicle.roadworksCommit !== site.id)) bad.push(`t ${(i * dt).toFixed(1)}: a vehicle going ${v.direction} entered on ${state}`);
                }
                if (was !== undefined && (was - exit) * v.direction < 0 && (f - exit) * v.direction >= 0) exits[v.direction]++;
                last.set(v.vehicle, f);
                for (const o of list) {
                    if (o === v || o.direction !== v.direction) continue;
                    const ahead = (o.s - v.s) * v.direction;
                    if (ahead > 0) overlap = Math.min(overlap, ahead - v.half - o.half);
                }
            }
            // A queue at either light: three or more standing before its line
            for (const direction of [1, -1]) {
                const line = direction > 0 ? site.stopIn : site.stopOut;
                const standing = list.filter(v => v.direction === direction && (line - front(v)) * direction >= 0 && (line - front(v)) * direction < 60 && v.vehicle.currentSpeed < 0.1);
                queued = Math.max(queued, standing.length);
            }
            // Round again: what has left the site goes back to the end of its queue
            for (const v of list) {
                if (v.direction > 0 && v.s > site.s1 + 60) {
                    const tail = Math.min(...list.filter(o => o.direction > 0).map(o => o.s));
                    put(v.vehicle, Math.min(site.s0 - 30, tail - 12));
                } else if (v.direction < 0 && v.s < site.s0 - 60) {
                    const tail = Math.max(...list.filter(o => o.direction < 0).map(o => o.s));
                    put(v.vehicle, Math.max(site.s1 + 30, tail + 12));
                }
            }
        }
        if (bad.length) throw new Error(bad.slice(0, 20).join('\n'));
        expect(both).toBe(0);
        expect(overlap).toBeGreaterThan(0);
        expect(queued).toBeGreaterThanOrEqual(3);
        // Traffic flows: both ways go through on every green
        expect(exits[1]).toBeGreaterThanOrEqual(cycles * 2);
        expect(exits[-1]).toBeGreaterThanOrEqual(cycles * 2);
    }, 600000);

    test('the rider is one of the queue: traffic keeps its gap behind a rider at a light, and the lights wait while the rider is in the lane', () => {
        const site = works.closed[0];
        works.reset();
        // Away from every site the traffic does not read the rider
        works.riderS = site.s0 - 300;
        expect(works.riderEntry()).toBeNull();
        // A rider who stands at a stop line, and a car that comes up behind going the same way
        const traffic = new Traffic(new THREE.Scene(), env);
        const car = traffic.cars[0];
        const d = car.direction, line = d > 0 ? site.stopIn : site.stopOut;
        works.riderS = line - d;
        works.riderDirection = d;
        expect(works.riderEntry()).toMatchObject({ s: line - d, direction: d, rider: true });
        const u = env.route.toUnits(line - 12 * d);
        car.currentSegment = Math.floor(u);
        car.segmentProgress = u - Math.floor(u);
        traffic.holdForRoadworks();
        expect(car.stopM).toBeLessThanOrEqual(11 - Roadworks.CAR_HALF_M - Roadworks.BIKE_HALF_M - Roadworks.QUEUE_GAP_M + 1e-6);
        // In the lane the rider holds the all-red phase, as a car does; out of it the lane is free again
        const others = () => traffic.worldVehicles().filter(v => v.s + v.half > site.stopIn && v.s - v.half < site.stopOut).length;
        works.riderS = (site.stopIn + site.stopOut) / 2;
        traffic.holdForRoadworks();
        expect(works.occupied.get(site.id)).toBe(others() + 1);
        works.riderS = site.stopOut + 100;
        traffic.holdForRoadworks();
        expect(works.occupied.get(site.id)).toBe(others());
        works.reset();
    });

    test('the all-red phase is long enough for the slowest car to clear the lane from its stop line', () => {
        for (const site of works.closed) {
            const lane = site.stopOut - site.stopIn + 2 * Roadworks.CAR_HALF_M;
            expect(site.redS * Roadworks.CLEAR_SPEED_MS).toBeGreaterThan(lane);
            expect(site.cycleS).toBe(2 * (Roadworks.GREEN_S + Roadworks.AMBER_S + site.redS));
        }
    });

    test('in the single lane traffic drives the open lane, clear of the beacons', () => {
        const route = env.route;
        const out = {};
        for (const site of works.closed) {
            for (const direction of [1, -1]) {
                for (let s = site.s0; s <= site.s1; s += 1) {
                    route.laneCurve(route.toUnits(s), direction, 0, 0, out);
                    const at = route.project(out.x, out.z, { index: route.indexAt(s) }, {});
                    // The body's nearer side keeps clear of the beacons' feet (the beacon line, also where it tapers out
                    // to the closed lane's edge) and its outer side on the road. Outside the tapers no lane is closed
                    if (s >= site.sa && s <= site.sd) {
                        const near = (at.lateral - Roadworks.beaconLat(site, s)) * site.open - game.Route.CAR_HALF_WIDTH;
                        if (near < 0.3) throw new Error(`site ${site.id} at ${s.toFixed(0)}: a car going ${direction} comes within ${near.toFixed(2)} m of the beacons`);
                    }
                    // A vehicle at a stop line is in its own lane, beside whatever comes out of the single lane
                    if (Math.abs(s - (direction > 0 ? site.stopIn : site.stopOut)) < 0.5 && at.lateral * direction * game.Route.LEFT > -at.width / 8) throw new Error(`site ${site.id}: a car going ${direction} waits at its stop line out of its own lane (${at.lateral.toFixed(2)})`);
                    if (Math.abs(at.lateral) + game.Route.CAR_HALF_WIDTH > at.width / 2) throw new Error(`site ${site.id}: a car off the road`);
                }
            }
        }
    });
});

describe('the rider', () => {
    const stub = (x, y, z, s = null) => ({
        position: new THREE.Vector3(x, y, z), speed: 10, yawAngle: 0, velocity: new THREE.Vector3(), crashed: false, isJumping: false,
        projection: { index: s === null ? -1 : 1, s }, worldCrash(cause) { this.crashed = true; this.crashCause = cause; }, surfaceAt: () => y, land() {}
    });
    const world = (e, c, a) => ({ x: e.x + c * Math.cos(e.yaw) + a * Math.sin(e.yaw), z: e.z - c * Math.sin(e.yaw) + a * Math.cos(e.yaw) });

    test('heavy things collide exactly where they are drawn, and are cleared from above', () => {
        const geo = Roadworks.geometries();
        const bad = [];
        for (const e of works.elements.filter(el => el.role === 'heavy')) {
            const box = geo[e.kind].boundingBox;
            if (e.box.x0 !== box.min.x || e.box.x1 !== box.max.x || e.box.z0 !== box.min.z || e.box.z1 !== box.max.z || e.box.y1 !== box.max.y) bad.push(`${e.kind}: collider is not the drawn box`);
            const mid = (e.box.z0 + e.box.z1) / 2;
            for (const [c, hit] of [[e.box.x1 + Roadworks.BIKE_R + 0.02, false], [e.box.x1 + Roadworks.BIKE_R - 0.02, true], [e.box.x0 - Roadworks.BIKE_R - 0.02, false], [e.box.x0 - Roadworks.BIKE_R + 0.02, true]]) {
                const p = world(e, c, mid);
                const v = stub(p.x, e.y + 0.3, p.z);
                works.ride(v, 1 / 60);
                if (v.crashed !== hit) bad.push(`${e.kind} at s ${Math.round(e.s)}: ${hit ? 'no crash' : 'a crash'} at ${c.toFixed(2)} m across its frame (box ${e.box.x0.toFixed(2)} to ${e.box.x1.toFixed(2)})${v.crashCause ? ` (${v.crashCause})` : ''}`);
                if (hit && v.crashed && !/^Hit the /.test(v.crashCause)) bad.push(`${e.kind}: crash cause ${v.crashCause}`);
            }
            const over = world(e, (e.box.x0 + e.box.x1) / 2, mid);
            const high = stub(over.x, e.y + e.box.y1 + 0.1, over.z);
            works.ride(high, 1 / 60);
            if (high.crashed) bad.push(`${e.kind}: a bike above it crashed`);
        }
        works.reset();
        if (bad.length) throw new Error(bad.slice(0, 20).join('\n'));
    });

    test('light things are knocked over with a wobble and a little speed, and never end a ride', () => {
        const bad = [];
        let knocked = 0;
        for (const e of works.elements.filter(el => el.role === 'light')) {
            const p = world(e, (e.box.x0 + e.box.x1) / 2, (e.box.z0 + e.box.z1) / 2);
            const v = stub(p.x, e.y, p.z);
            works.ride(v, 1 / 60);
            if (v.crashed) bad.push(`${e.kind} at s ${Math.round(e.s)} crashed the bike (${v.crashCause})`);
            if (!e.knock) bad.push(`${e.kind} at s ${Math.round(e.s)} was not knocked over`);
            if (!(v.speed < 10 && v.speed >= 7)) bad.push(`${e.kind}: speed ${v.speed}`);
            if (!v.roadworksWobble) bad.push(`${e.kind}: no wobble`);
            if (e.knock) knocked++;
        }
        works.reset();
        if (bad.length) throw new Error(bad.slice(0, 20).join('\n'));
        expect(knocked).toBeGreaterThan(100);
        expect(works.elements.every(e => !e.knock)).toBe(true);
    });

    const jump = async (kind, speed, tip = 0) => {
        // The first ramp of this kind whose straight line ahead stays on the road and clear of every solid thing. The
        // bike here does not steer, the works differ from site to site (Roadworks.layout), and where the road bends
        // after a ramp the bike leaves the ramps' line for the strip beside it, which is no fault of the ramp. The
        // line is read as far as the bike goes: the flight and half a second of road after the landing (AHEAD_M;
        // the sites stand on roads of 55 m radius and more, where a straight line leaves the lane within 25 m)
        const AHEAD_M = 20;
        const clearAhead = (e) => {
            for (let a = e.box.z0 - 8; a <= e.box.z1 + AHEAD_M; a += 0.5) {
                const p = world(e, 0, a);
                const at = env.route.project(p.x, p.z, { index: env.route.indexAt(Math.min(env.route.length, e.s + a)) }, {});
                if (Math.abs(at.lateral) > at.width / 2 - 0.5) return false;
                if (e.site.elements.some(o => o.role === 'heavy' && Roadworks.gap(o, p.x, p.z) < Roadworks.BIKE_R + 0.3)) return false;
            }
            return true;
        };
        const ramp = works.elements.find(e => e.kind === kind && clearAhead(e));
        const v = new Vehicle(new THREE.Scene());
        v.environment = env;
        const run = 8;
        const start = world(ramp, 0, ramp.box.z0 - run);
        v.position.set(start.x, ramp.y, start.z);
        v.yawAngle = ramp.yaw;
        v.findNearestRoadSegment();
        await env.streamer.settle({ x: start.x, z: start.z }, ramp.s);
        v.speed = speed;
        // The ramp lies on the road's grade (Roadworks.build), so the heights are read over its foot there, and a throw
        // has the road's own climb in it
        const out = { launched: false, vy: null, peak: -Infinity, landed: false, crashed: false, air: 0, grade: ramp.grade };
        // Long enough to reach the ramp and pass it at this speed, and four seconds at least
        const steps = 60 * Math.max(4, (run + ramp.box.z1 - ramp.box.z0 + 6) / speed);
        let rolled = 0;
        for (let i = 0; i < steps && !v.crashed && rolled < 30 && Roadworks.local(ramp, v.position.x, v.position.z).a < ramp.box.z1 + AHEAD_M; i++) {
            if (out.landed) rolled++;
            v.update(1 / 60, 0, v.speed < speed ? 1 : 0, 0, 0);
            if (v.isJumping && !out.launched) { out.launched = true; out.vy = v.jumpVelocityY; out.launchSpeed = v.speed; }
            if (v.isJumping) {
                out.air++;
                if (tip) v.jumpRotation = tip;
            }
            out.peak = Math.max(out.peak, v.position.y - Roadworks.baseY(ramp, v.position.x, v.position.z));
            if (out.launched && !v.isJumping && !out.landed) { out.landed = true; out.landedAt = Roadworks.local(ramp, v.position.x, v.position.z).a - ramp.box.z1; }
        }
        out.crashed = v.crashed;
        out.cause = log.filter(l => /CRASH/.test(l)).pop();
        return out;
    };

    test('a plank ramp throws the bike at its speed times its slope, and it lands under the landing rules', async () => {
        const slope = 0.5 / 3.2;
        const r = await jump('plankRamp', 14);
        expect(r.launched).toBe(true);
        expect(Math.abs(r.vy - r.launchSpeed * (slope + r.grade))).toBeLessThan(0.25);
        expect(r.peak).toBeGreaterThan(0.5);
        expect(r.air).toBeGreaterThan(10);
        expect(r.landed).toBe(true);
        expect(r.landedAt).toBeGreaterThan(1);
        expect(r.crashed).toBe(false);
        // Held nose-up past 90 degrees in the air, it crashes on landing as on the legs
        const tipped = await jump('plankRamp', 14, 1.9);
        expect(tipped.launched).toBe(true);
        expect(tipped.crashed).toBe(true);
        expect(tipped.cause).toMatch(/Bad landing angle/);
    }, 120000);

    test('the steel plate up a gravel heap and the sand heap launch the bike too, and slowly it rides over them', async () => {
        for (const kind of ['plateRamp', 'sandRamp']) {
            const fast = await jump(kind, 14);
            expect(fast.launched).toBe(true);
            expect(fast.peak).toBeGreaterThan(0.6);
            expect(fast.crashed).toBe(false);
            const slow = await jump(kind, 2.5);
            expect(slow.crashed).toBe(false);
            expect(slow.peak).toBeGreaterThan(0.55);
        }
    }, 120000);

    test('running a red costs style and says so; a green does not', () => {
        const site = works.closed[0];
        const keep = { ...works.phase(site) };
        const at = env.route.sample(site.stopIn, {});
        const cross = () => {
            works.takeEvents();
            works.riderS = undefined;
            works.redLight(stub(at.x, at.y, at.z, site.stopIn - 1));
            works.redLight(stub(at.x, at.y, at.z, site.stopIn + 0.5));
            return works.takeEvents();
        };
        Object.assign(site.timer, { index: 3, left: 10 });
        expect(works.light(site, 1)).toBe('red');
        expect(cross()).toEqual([{ kind: 'red', site: site.id }]);
        Object.assign(site.timer, { index: 0, left: 10 });
        expect(cross()).toEqual([]);
        Object.assign(site.timer, keep);
        expect(Roadworks.RED_RUN_STYLE).toBeGreaterThan(0);
    });

    test('a careful rider passes every closed site in the open lane with no crash and no restart', async () => {
        const bad = [];
        // The run-up to the entry gate: up to 60 m, but only road that can be ridden at this speed at the most lean the
        // world allows. A closure ends where the straight does, so a hairpin can stand a few metres before its gate, and
        // no rider holds 15 m/s through that with or without a site
        const runUp = (site, speed) => {
            const most = 9.81 * Math.tan(env.physics.leanCapDeg * Math.PI / 180) / (speed * speed);
            let back = 0;
            while (back < 60 && site.s0 - back - 1 >= 0 && Math.abs(env.route.curvatureAt(site.s0 - back - 5, 8)) < most) back++;
            return back;
        };
        for (const site of works.closed) {
            for (const speed of [8, 15]) {
                const r = await rideSpan(game, env, { s0: site.s0 - runUp(site, speed), s1: site.s1 + 10, speed, lane: site.laneLat });
                if (r.crashed || r.cut) bad.push(`site ${site.id} at ${speed} m/s: ${JSON.stringify(r)}`);
            }
        }
        works.reset();
        if (bad.length) throw new Error(bad.join('\n'));
    }, 600000);
});
