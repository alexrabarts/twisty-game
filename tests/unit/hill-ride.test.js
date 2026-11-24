/**
 * @jest-environment node
 */
// The hill ride (js/hill/): opened by its address key alone (RideMode, js/ridemode.js), down a cobbled village lane
// (HillLane) on the game's own bike with a delivery bicycle's numbers (HillVehicle) and the boy's state on top
// (HillBicycle), the boy drawn on it (HillRider, assets/hill/bicycle.glb), to a brass band (HillMusic). The physics and
// the lane run here as the page runs them; the pose is the real model's.
import { describe, test, expect } from '@jest/globals';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canvasStub, loadGame, loadScript, realThree } from '../helpers/load-game.js';

const root = fileURLToPath(new URL('../..', import.meta.url));
const THREE = realThree();
const game = loadGame(THREE);
const { Vehicle, WorldPhysics, CHARACTERS } = game;
const RideMode = new Function(`${loadScript('ridemode.js')}\nreturn RideMode;`)();
const { HillLane, HillVehicle, HillBicycle, HillMusic, HillRide, HillProps, HillScene } = new Function('THREE', 'Vehicle', 'WorldPhysics', 'CHARACTERS',
    `${['lane', 'pushbike', 'bicycle', 'music', 'ride', 'props', 'scene'].map(n => loadScript(`hill/${n}.js`)).join('\n')}\nreturn { HillLane, HillVehicle, HillBicycle, HillMusic, HillRide, HillProps, HillScene };`
)(THREE, Vehicle, WorldPhysics, CHARACTERS);

const DT = 1 / 120;
const quiet = { pedal: 0, brake: 0, steer: 0 };
// A flat lane: the same lane with no fall and no bend
const flat = () => new HillLane({ ...HillLane.RULE, grade: [[0, -1e-9], [1, -1e-9]], heading: [[0, 0], [1, 0]], sharpRight: HillLane.RULE.sharpRight });
const ride = (bike, input, seconds) => {
    for (let t = 0; t < seconds; t += DT) bike.step(DT, input);
};
// A simple autopilot: steers for a point ahead on the lane's centre (the lean it needs for the turn there, as the
// steering's lean rate gives it) and brakes to `most` m/s, or to `bend` m/s for `before` m ahead of a tight turn
function pilot(bike, { most = Infinity, bend = Infinity, before = 0 } = {}) {
    const lane = bike.lane, v = bike.speed;
    const ahead = lane.sample(bike.s + 4 + v * 0.6);
    const at = bike.vehicle.position;
    const want = Math.atan2(ahead.x - at.x, ahead.z - at.z);
    let err = want - bike.yaw;
    err = Math.atan2(Math.sin(err), Math.cos(err));
    const turn = 2.2 * err * Math.max(1, v);
    const lean = -Math.atan(Math.max(0, v) * Math.max(-3, Math.min(3, turn / Math.max(1, v))) / 9.81);
    const steer = Math.max(-1, Math.min(1, (bike.lean - lean) * 5));
    let limit = most;
    for (let d = 0; d <= before; d += 2) if (Math.abs(lane.radiusAt(bike.s + d)) < 30) limit = Math.min(limit, bend);
    return { pedal: 0, brake: v > limit ? 1 : 0, steer };
}

describe('the address', () => {
    test('its key opens the hill ride at once, before any other mode, and nothing else changes', () => {
        const key = RideMode.HILL_KEY;
        expect(RideMode.resolve(`?${key}`)).toEqual({ kind: 'hill', world: null, direct: true });
        expect(RideMode.resolve(`?world=tremola&${key}`)).toEqual({ kind: 'hill', world: null, direct: true });
        expect(RideMode.resolve('?legs')).toEqual({ kind: 'legs', world: null, direct: false });
        expect(RideMode.resolve('')).toEqual({ kind: 'world', world: 'tremola', direct: false });
    });

    test('the key is written in js/ridemode.js and nowhere else in the game, the tools or the assets', () => {
        const key = RideMode.HILL_KEY.toLowerCase();
        const found = [];
        const walk = dir => {
            for (const name of readdirSync(dir)) {
                const path = join(dir, name);
                const where = relative(root, path);
                if (name.toLowerCase().includes(key)) found.push(where);
                if (statSync(path).isDirectory()) walk(path);
                else if (/\.(js|mjs|py|html|css|json)$/.test(name) && readFileSync(path, 'utf8').toLowerCase().includes(key)) found.push(where);
            }
        };
        for (const dir of ['js', 'tools', 'assets']) walk(join(root, dir));
        if (readFileSync(join(root, 'index.html'), 'utf8').toLowerCase().includes(key)) found.push('index.html');
        expect(found).toEqual(['js/ridemode.js']);
    });
});

describe('the lane', () => {
    const lane = new HillLane();

    test('is the same on every load', () => {
        const again = new HillLane();
        expect(again.points).toEqual(lane.points);
        expect(again.cottages).toEqual(lane.cottages);
        expect(again.walls).toEqual(lane.walls);
    });

    test('the course: a gentle right-hander from the start onto the main straight, a left curve, a fast steep part, a sharp right, a last gentle left', () => {
        const grades = lane.points.map(p => p.grade);
        expect(Math.max(...grades)).toBeLessThan(0);
        expect(Math.min(...grades)).toBeLessThan(-0.2);
        expect(Math.min(...grades)).toBeGreaterThan(-0.26);
        expect(lane.rule.lengthM).toBe(600);
        expect(lane.sample(lane.rule.startM).y - lane.sample(lane.rule.lengthM).y).toBeGreaterThan(60);
        const straight = (from, to) => {
            for (let s = from; s <= to; s++) expect(Math.abs(lane.radiusAt(s))).toBeGreaterThan(1000);
        };
        // The gentle right-hander: a turn to the right of about the angle the start's view has the sun off it, never tight
        const right = lane.sample(lane.rule.mainStraight.fromS).heading - lane.sample(lane.rule.startM).heading;
        expect(right).toBeLessThan(-0.45);
        expect(right).toBeGreaterThan(-0.8);
        for (let s = 30; s <= 110; s++) expect(Math.abs(lane.radiusAt(s))).toBeGreaterThan(40);
        straight(lane.rule.mainStraight.fromS, lane.rule.mainStraight.toS);
        straight(312, 418);
        // The left curve between them
        let left = 0;
        for (let s = 230; s <= 290; s++) if (lane.radiusAt(s) > 0) left++;
        expect(left).toBeGreaterThan(50);
        // The sharp right: its tightest radius as the rule gives it, and it turns right (the radius is negative)
        const { fromS, toS, leastRadiusM } = lane.rule.sharpRight;
        let least = Infinity;
        for (let s = fromS; s <= toS; s += 0.25) {
            const r = lane.radiusAt(s);
            expect(r).toBeLessThan(0);
            least = Math.min(least, Math.abs(r));
        }
        expect(least).toBeGreaterThanOrEqual(leastRadiusM[0]);
        expect(least).toBeLessThanOrEqual(leastRadiusM[1]);
        // The last curve is gentle and to the left, and the camera holds at its start
        for (let s = 490; s <= 560; s += 5) expect(lane.radiusAt(s)).toBeGreaterThan(60);
        expect(lane.rule.end.s).toBeGreaterThan(475);
        expect(lane.rule.end.s).toBeLessThan(495);
    });

    test('the low sun lies along the main straight: ahead down it, to the right at the start', () => {
        const sun = HillRide.sunDirection(lane);
        const flat = Math.hypot(sun.x, sun.z);
        expect(Math.asin(sun.y) * 180 / Math.PI).toBeGreaterThanOrEqual(8);
        expect(Math.asin(sun.y) * 180 / Math.PI).toBeLessThanOrEqual(15);
        for (let s = lane.rule.mainStraight.fromS; s <= lane.rule.mainStraight.toS; s += 10) {
            const p = lane.sample(s);
            expect((sun.x * p.alongX + sun.z * p.alongZ) / flat).toBeGreaterThan(0.995);
        }
        // At the start the sun is off to the right of the way down: the right of a heading is its left's opposite
        const p = lane.sample(lane.rule.startM);
        expect(-(sun.x * p.leftX + sun.z * p.leftZ) / flat).toBeGreaterThan(0.45);
        expect((sun.x * p.alongX + sun.z * p.alongZ) / flat).toBeGreaterThan(0.6);
    });

    test('a terrace stands on each side all the way down, end to end without overlapping, each side its own', () => {
        for (const side of [1, -1]) {
            const row = lane.cottages.filter(c => c.side === side);
            expect(row.length).toBeGreaterThan(55);
            // Low walls stand only for short stretches
            for (const w of lane.walls.filter(g => g.side === side && !g.upM)) expect(w.to - w.from).toBeLessThanOrEqual(3.01);
            // The left from the top; the right after the top wall
            expect(row[0].from).toBeLessThanOrEqual(side > 0 ? lane.rule.startM - 10 : lane.rule.topWallToS + 3);
            expect(row[row.length - 1].to).toBeGreaterThan(lane.rule.lengthM - 12);
            for (let i = 1; i < row.length; i++) expect(row[i].from).toBeGreaterThanOrEqual(row[i - 1].to - 1e-9);
            // Its gaps are where its low walls run
            const gaps = lane.walls.filter(w => w.side === side);
            for (let i = 1; i < row.length; i++) {
                for (let s = row[i - 1].to + 0.05; s < row[i].from - 0.05; s += 0.25) expect([side, s, gaps.some(w => w.from <= s && s <= w.to)]).toEqual([side, s, true]);
            }
            for (const c of row) {
                expect(c.foot).toBeLessThan(Math.min(lane.sample(c.from).y, lane.sample(c.to).y));
                expect(c.ridge).toBeGreaterThan(c.eaves + 2);
            }
        }
        // No two neighbours across the lane or along it alike in every finish
        const key = c => [c.wall, c.roof, c.storeys, c.gable, c.front, c.porch, c.doorColour].join();
        const left = lane.cottages.filter(c => c.side === 1).map(key), right = lane.cottages.filter(c => c.side === -1).map(key);
        for (const row of [left, right]) for (let i = 1; i < row.length; i++) expect(row[i]).not.toBe(row[i - 1]);
        expect(left.slice(0, 20)).not.toEqual(right.slice(0, 20));
    });

    test('no cottage stands on the lane: every corner of every one is clear of the cobbles and its flags', () => {
        const near = (x, z) => {
            let best = Infinity;
            for (const p of lane.points) best = Math.min(best, Math.hypot(x - p.x, z - p.z));
            return best;
        };
        const clear = lane.rule.halfWidthM + lane.rule.flagsM * 0.75;
        for (const c of lane.cottages) {
            for (const along of [-c.hw, 0, c.hw]) {
                for (const out of [-c.hd, c.hd]) {
                    const x = c.x + c.alongX * along + c.outX * out, z = c.z + c.alongZ * along + c.outZ * out;
                    expect(near(x, z)).toBeGreaterThan(clear);
                }
            }
        }
    });

    test('a line of sight through a cottage is blocked, and one along the lane is not', () => {
        const c = lane.cottages.find(h => h.side === 1 && h.mid > 60);
        const through = [{ x: c.x - c.outX * 10, y: c.floor + 2, z: c.z - c.outZ * 10 }, { x: c.x + c.outX * 10, y: c.floor + 2, z: c.z + c.outZ * 10 }];
        expect(lane.blocks(...through)).toBe(true);
        const a = lane.at(60, 0, 1.5, {}), b = lane.at(80, 0, 1.5, {});
        expect(lane.blocks(a, b)).toBe(false);
        // Over the roofs is clear
        const over = through.map(p => ({ ...p, y: c.ridge + 3 }));
        expect(lane.blocks(...over)).toBe(false);
    });

    test('its cobbles are one height field: domes of their own sizes and heights, deep mortar between, no repeat in a run of tiles', () => {
        const C = HillLane.COBBLES;
        let most = 0, sum = 0, zero = 0, n = 0;
        for (let s = 0; s < 6; s += 0.011) {
            for (let a = -2.7; a < 2.7; a += 0.013) {
                const h = lane.cobble(s, a);
                expect(h).toBeGreaterThanOrEqual(0);
                expect(h).toBeLessThanOrEqual(C.upM + 1e-12);
                most = Math.max(most, h);
                sum += h;
                if (h === 0) zero++;
                n++;
            }
        }
        expect(most).toBeGreaterThan(C.upM * 0.9);
        // Mortar between the stones: a good share of the surface is at the bottom
        expect(zero / n).toBeGreaterThan(0.08);
        expect(zero / n).toBeLessThan(0.6);
        // The tiles are laid four ways: in any eight in a row at least three ways are used
        const ways = new Set();
        for (let k = 0; k < 8; k++) ways.add(HillLane.tileFlip(k));
        expect(ways.size).toBeGreaterThanOrEqual(3);
        // Off the lane there are no cobbles
        expect(lane.cobble(10, lane.rule.halfWidthM + 0.1)).toBe(0);
    });
});

describe("the bicycle: the game's own bike with a delivery bicycle's numbers", () => {
    test("steered left at speed it leans left and turns left, through the vehicle's own lean path", () => {
        const bike = new HillBicycle(flat());
        bike.reset(20);
        bike.vehicle.speed = 7;
        const yaw = bike.yaw;
        ride(bike, { pedal: 0.4, brake: 0, steer: 1 }, 0.8);
        // The vehicle's sign: a positive lean is to the right, a turn to the left raises the yaw
        expect(bike.lean).toBeLessThan(-0.1);
        expect(bike.yaw - yaw).toBeGreaterThan(0.1);
        expect(bike.crashed).toBe(false);
        // And right, the other way
        const other = new HillBicycle(flat());
        other.reset(20);
        other.vehicle.speed = 7;
        ride(other, { pedal: 0.4, brake: 0, steer: -1 }, 0.8);
        expect(other.lean).toBeGreaterThan(0.1);
        expect(other.yaw).toBeLessThan(0);
    });

    test("its lean is slower than a motorbike's, and at 7 m/s it turns as a bicycle does", () => {
        const rate = (v) => {
            v.speed = 7;
            for (let t = 0; t < 0.25; t += DT) {
                v.speed = 7;
                v.update(DT, 1, 0.3, 0, 0);
            }
            return Math.abs(v.leanAngle) / 0.25;
        };
        const plane = { physics: WorldPhysics, route: { unitCount: 0, fromUnits: u => u, project: () => ({ index: -1 }), sample: () => ({ grade: 0, flags: {} }) } };
        const motorbike = new Vehicle(new THREE.Scene(), null, CHARACTERS[0], undefined, { model: false });
        motorbike.environment = plane;
        const bicycle = new HillVehicle();
        bicycle.surface.grade = 0;
        const bikeRate = rate(bicycle), motoRate = rate(motorbike);
        expect(bikeRate).toBeLessThan(motoRate * 0.8);
        // Held hard over at 7 m/s: the tightest circle the grip on cobbles gives a bicycle
        const held = new HillVehicle();
        for (let t = 0; t < 3; t += DT) {
            held.speed = 7;
            held.update(DT, 1, 0.3, 0, 0);
        }
        const radius = 49 / (9.81 * Math.tan(Math.abs(held.leanAngle)));
        expect(radius).toBeGreaterThan(5);
        expect(radius).toBeLessThan(15);
        console.log(`hill bicycle: lean rate ${bikeRate.toFixed(2)} rad/s against a motorbike's ${motoRate.toFixed(2)}; held over at 7 m/s, lean ${(Math.abs(held.leanAngle) * 180 / Math.PI).toFixed(1)} deg, radius ${radius.toFixed(1)} m`);
    });

    test('stood at the top it rolls off on the fall alone, the legs come out at speed, and the autopilot takes it to the last curve', () => {
        const bike = new HillBicycle(new HillLane());
        const r = bike.rule;
        expect(bike.s).toBe(bike.lane.rule.startM);
        expect(bike.footDown).toBe(true);
        let outAt = null, top = 0, crashes = 0, cranks = 0, straightTop = 0;
        for (let t = 0; t < 160 && bike.s < 500; t += DT) {
            const input = pilot(bike, { bend: 8, before: 45 });
            // A push off from the stand, then nothing but the bars and the brakes
            if (t < 1.5) input.pedal = 1;
            bike.step(DT, input);
            if (bike.crashed) crashes++;
            top = Math.max(top, bike.speed);
            if (bike.s > 370 && bike.s < 400) straightTop = Math.max(straightTop, bike.speed);
            cranks = Math.max(cranks, bike.crank);
            if (outAt === null && bike.legs >= 1) outAt = { s: bike.s, speed: bike.speed };
        }
        expect(crashes).toBe(0);
        expect(bike.s).toBeGreaterThanOrEqual(500);
        expect(outAt).not.toBeNull();
        expect(outAt.speed).toBeGreaterThan(r.legsOutMs);
        expect(outAt.s).toBeLessThan(160);
        // Real pace at the bottom of the straight, nothing touched but the bars
        expect(straightTop).toBeGreaterThan(15);
        expect(straightTop).toBeLessThan(18.5);
    });

    test('the sharp right cannot be taken at full speed: he runs wide into the house fronts, or falls', () => {
        const bike = new HillBicycle(new HillLane());
        bike.reset(385);
        bike.vehicle.speed = 15;
        let trouble = 0;
        for (let t = 0; t < 8 && bike.s < 450; t += DT) {
            bike.step(DT, pilot(bike));
            if (bike.crashed || bike.vehicle.brushNew) trouble++;
            bike.vehicle.brushNew = false;
        }
        expect(trouble).toBeGreaterThan(0);
    });

    test('a stop puts a foot down; pedalling off lifts it', () => {
        const bike = new HillBicycle(flat());
        bike.reset(20);
        ride(bike, { pedal: 0, brake: 1, steer: 0 }, 1);
        expect(bike.footDown).toBe(true);
        ride(bike, { pedal: 1, brake: 0, steer: 0 }, 1.5);
        expect(bike.speed).toBeGreaterThan(1);
        expect(bike.footDown).toBe(false);
        ride(bike, { pedal: 0, brake: 1, steer: 0 }, 3);
        expect(bike.footDown).toBe(true);
    });

    test('pedalled on the flat it reaches a pace under the most his feet can turn, and no faster', () => {
        const bike = new HillBicycle(flat());
        bike.reset(10);
        let cadence = 0;
        for (let t = 0; t < 30; t += DT) {
            bike.step(DT, { pedal: 1, brake: 0, steer: 0 });
            cadence = Math.max(cadence, bike.cadenceRpm);
            if (bike.s > 400) bike.reset(10);
        }
        expect(bike.speed).toBeGreaterThan(3);
        expect(bike.speed).toBeLessThan(bike.pedalMostMs);
        expect(cadence).toBeLessThan(HillVehicle.DATA.cadenceMostRpm);
    });

    test('the rod brakes slow it weakly: about their own pull with the drag added', () => {
        const bike = new HillBicycle(flat());
        bike.reset(20);
        bike.vehicle.speed = 8;
        bike.step(DT, { pedal: 0, brake: 1, steer: 0 });
        const decel = (8 - bike.speed) / DT;
        expect(decel).toBeGreaterThan(HillVehicle.DATA.brakeMs2);
        expect(decel).toBeLessThan(HillVehicle.DATA.brakeMs2 + 1.2);
    });

    test('the legs stay out while it is too fast for his feet, and come in once it slows', () => {
        const bike = new HillBicycle(flat());
        bike.reset(20);
        bike.vehicle.speed = 9;
        bike.legsOut = true;
        bike.legs = 1;
        ride(bike, { pedal: 1, brake: 0, steer: 0 }, 0.2);
        expect(bike.legsOut).toBe(true);
        let back = null;
        for (let t = 0; t < 20 && back === null; t += DT) {
            bike.step(DT, { pedal: 0, brake: 1, steer: 0 });
            if (!bike.legsOut) back = bike.speed;
        }
        expect(back).toBeLessThan(bike.rule.legsInMs);
    });

    test.each([['from a standstill on the flat', 0, false], ['at walking pace on the flat', 1.5, false], ['at walking pace on the hill', 1.5, true]])(
        'a wheelie is reachable %s, by a hard push and the wheelie key', (_, speed, hill) => {
            const bike = new HillBicycle(hill ? new HillLane() : flat());
            bike.reset(hill ? 70 : 20);
            bike.vehicle.speed = speed;
            bike.vehicle.footDown = false;
            let most = 0;
            for (let t = 0; t < 1.2; t += DT) {
                bike.step(DT, { pedal: 1, brake: 0, steer: 0, wheelie: t < 0.1 ? 1 : 0 });
                most = Math.max(most, bike.wheelie);
            }
            expect(most).toBeGreaterThan(0.25);
        });

    test('held on full push the front goes over backwards: the fall, then stood up again with a foot down', () => {
        const bike = new HillBicycle(flat());
        bike.reset(20);
        bike.vehicle.footDown = false;
        let fell = false;
        for (let t = 0; t < 12 && !fell; t += DT) {
            // Held at a crawl, as up a slope: the push keeps all its lift
            bike.vehicle.speed = Math.min(bike.vehicle.speed, 1);
            bike.step(DT, { pedal: 1, brake: 0, steer: 0, wheelie: 1 });
            fell = bike.crashed;
        }
        expect(fell).toBe(true);
        expect(bike.vehicle.crashWhy).toBe('flip');
        ride(bike, quiet, bike.rule.downS + 0.2);
        expect(bike.crashed).toBe(false);
        expect(bike.footDown).toBe(true);
    });

    test('steered hard into the kerb it stays on the lane, against the kerb or down', () => {
        const bike = new HillBicycle(flat());
        bike.reset(20);
        bike.vehicle.speed = 5;
        for (let t = 0; t < 4; t += DT) {
            bike.step(DT, { pedal: 0.5, brake: 0, steer: -1 });
            expect(Math.abs(bike.across)).toBeLessThanOrEqual(bike.lane.rule.halfWidthM);
        }
    });

    test('the cobbles shake it as it rolls, no higher than a stone stands', () => {
        const bike = new HillBicycle(flat());
        bike.reset(20);
        const seen = new Set();
        for (let t = 0; t < 3; t += DT) {
            bike.vehicle.speed = 6;
            bike.step(DT, quiet);
            expect(bike.bounce).toBeGreaterThanOrEqual(0);
            expect(bike.bounce).toBeLessThanOrEqual(HillLane.COBBLES.upM);
            seen.add(Math.round(bike.bounce * 1e4));
        }
        expect(seen.size).toBeGreaterThan(10);
    });
});

describe('the end of the ride', () => {
    const camera = () => {
        const cam = new THREE.PerspectiveCamera(50, 16 / 9, 0.25, 5000);
        const at = new THREE.Vector3(), look = new THREE.Vector3();
        HillRide.endView(new HillLane(), at, look);
        cam.position.copy(at);
        cam.lookAt(look);
        cam.updateMatrixWorld();
        return cam;
    };

    test('the stopped camera sees him come into the last curve, then loses him round it, and he stays out of sight', () => {
        const lane = new HillLane();
        const bike = new HillBicycle(lane);
        bike.reset(462);
        bike.vehicle.speed = 9;
        const cam = camera();
        const end = lane.rule.end;
        let seenFrom = null, lostAt = null, seenAfter = false;
        for (let t = 0; t < 40 && bike.s < lane.rule.lengthM - 14; t += DT) {
            bike.step(DT, pilot(bike, { most: 9 }));
            if (bike.s < end.stopS) continue;
            const seen = HillRide.seen(cam, lane, HillRide.points(lane, bike));
            if (seen && seenFrom === null) seenFrom = bike.s;
            if (!seen && seenFrom !== null && lostAt === null) lostAt = bike.s;
            if (seen && lostAt !== null) seenAfter = true;
        }
        expect(seenFrom).toBeLessThan(end.stopS + 1);
        expect(lostAt - seenFrom).toBeGreaterThan(20);
        expect(lostAt).toBeGreaterThan(510);
        expect(seenAfter).toBe(false);
    });

    test('the ride ends only once he has been out of sight for a moment: the camera stops, the picture fades, the card shows', () => {
        const lane = new HillLane();
        const cam = camera();
        const bike = new HillBicycle(lane);
        bike.reset(462);
        bike.vehicle.speed = 9;
        const ride = Object.assign(Object.create(HillRide.prototype), {
            lane, bike, game: { camera: cam }, music: { stop() { this.stopped = true; }, close() { this.closed = true; } }, look: new THREE.Vector3(),
            camTarget: new THREE.Vector3(), endLook: new THREE.Vector3(), ending: null, fade: { style: { opacity: '0' } }, endNote: { style: { display: 'none' } }
        });
        const phases = [];
        for (let t = 0; t < 60; t += DT) {
            bike.step(DT, pilot(bike, { most: 9 }));
            const phase = ride.updateEnding(DT);
            if (phases[phases.length - 1] !== phase) phases.push(phase);
            if (phase === 'done') break;
        }
        expect(phases).toEqual([null, 'stopping', 'watching', 'fading', 'loaf', 'done']);
        expect(ride.music.stopped).toBe(true);
        // The picture came up again out of the dark onto the last picture
        expect(ride.fade.style.opacity).toBe('0');
        expect(ride.loafShown).toBe(true);
        expect(ride.endNote.style.display).toBe('');
    });
});

describe('the music', () => {
    test('is the Largo theme, its tune opening on the third, the fifth and the fifth of D flat major', () => {
        const { list, lengthS } = HillMusic.events();
        const tune = list.filter(e => e.voice === 'cornet');
        expect(tune.slice(0, 3).map(e => e.midi)).toEqual([65, 68, 68]);
        expect(tune.length).toBe(HillMusic.SCORE.tune.length);
        for (const e of list) {
            expect(e.midi).toBeGreaterThanOrEqual(30);
            expect(e.midi).toBeLessThanOrEqual(80);
            expect(e.at + e.durS).toBeLessThanOrEqual(lengthS);
        }
        expect(new Set(list.map(e => e.voice))).toEqual(new Set(['cornet', 'horn', 'tuba']));
    });
});

describe('the boy on the bicycle', () => {
    const fetch = async url => {
        const bytes = readFileSync(join(root, url));
        return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
    };
    const { SceneAssets, HillRider } = new Function('THREE', 'document', 'console', 'fetch', 'Blob', 'TextDecoder', 'Vehicle',
        `${loadScript('sceneassets.js')}\n${loadScript('hill/rider.js')}\nreturn { SceneAssets, HillRider };`)(THREE, canvasStub(), console, fetch, Blob, TextDecoder, Vehicle);
    const lane = flat();
    const at = new THREE.Vector3();
    const world = (part, out = at) => {
        part.updateWorldMatrix(true, false);
        return out.setFromMatrixPosition(part.matrixWorld);
    };
    let rider;
    // A bicycle rolling at 4 m/s on the flat lane, the cranks at `crank`, the legs at `legs`
    const bike = (crank, legs, footDown = false) => {
        const b = new HillBicycle(lane);
        b.reset(20);
        b.vehicle.speed = footDown ? 0 : 4;
        b.vehicle.footDown = footDown;
        b.crank = crank;
        b.legs = legs;
        return b;
    };

    test('loads the model with every part the pose moves', async () => {
        rider = new HillRider(await SceneAssets.loadModel(HillRider.FILE));
        for (const name of ['wheel_front', 'wheel_rear', 'cranks', 'pedal_l', 'pedal_r', 'thigh_l', 'thigh_r', 'shin_l', 'shin_r', 'foot_l', 'foot_r', 'boy', 'basket', 'plate']) {
            expect(rider.parts[name]).toBeTruthy();
        }
        expect(rider.legs.map(l => l.side).sort()).toEqual([-1, 1]);
    });

    test('pedalling, each ankle is on its pedal, the leg keeps its length and nothing goes into the ground', () => {
        const hip = new THREE.Vector3(), knee = new THREE.Vector3(), ankle = new THREE.Vector3(), pedal = new THREE.Vector3();
        for (let k = 0; k < 12; k++) {
            const b = bike(k / 12 * 2 * Math.PI, 0);
            rider.foot = 0;
            rider.update(b, lane, 0);
            for (const leg of rider.legs) {
                world(leg.thigh, hip);
                world(leg.shin, knee);
                world(leg.foot, ankle);
                world(leg.pedalPart, pedal);
                expect(hip.distanceTo(knee)).toBeCloseTo(leg.upper, 4);
                expect(knee.distanceTo(ankle)).toBeCloseTo(leg.lower, 2);
                const want = leg.pedalPart.position.clone().add(new THREE.Vector3().fromArray(HillRider.ANKLE_ON_PEDAL));
                expect(leg.foot.position.distanceTo(want)).toBeLessThan(0.02);
                expect(ankle.y - lane.sample(20).y).toBeGreaterThan(0.08);
            }
        }
    });

    test('legs out, each leg is straight out to its own side, below the hip and clear of the bicycle and the ground', () => {
        rider.foot = 0;
        rider.update(bike(0, 1), lane, 0);
        const hip = new THREE.Vector3(), ankle = new THREE.Vector3();
        for (const leg of rider.legs) {
            hip.copy(leg.thigh.position);
            ankle.copy(leg.foot.position);
            expect(hip.distanceTo(ankle)).toBeGreaterThan((leg.upper + leg.lower) * (HillRider.LEGS_OUT.reach - HillBicycle.LEGS.bend[1]) - 0.08);
            expect(Math.sign(ankle.x)).toBe(leg.side);
            expect(Math.abs(ankle.x)).toBeGreaterThan(0.55);
            expect(ankle.y).toBeLessThan(hip.y);
            expect(ankle.y).toBeGreaterThan(0.4);
        }
    });

    test('held out over a long run, he brings his feet back now and then and no two poses out are alike; never through the frame or the ground', () => {
        const where = new HillLane();
        const b = new HillBicycle(where);
        b.reset(125);
        b.vehicle.speed = 9;
        const poses = new Set();
        let visits = 0, wasVisiting = false;
        const ankle = new THREE.Vector3();
        for (let t = 0; t < 40; t += DT) {
            b.vehicle.speed = 9;
            b.step(DT, pilot(b));
            if (b.s > 220) b.reset(125), b.vehicle.speed = 9, b.legsOut = true, b.legs = 1;
            if (b.visiting > 0 && !wasVisiting) visits++;
            wasVisiting = b.visiting > 0;
            if (b.legs >= 1) poses.add(JSON.stringify(b.legPose));
            rider.foot = 0;
            rider.update(b, where, DT);
            if (b.legs > 0.5) {
                for (const leg of rider.legs) {
                    // Out to its own side of the frame, over the cobbles under it
                    expect(leg.foot.position.x * leg.side).toBeGreaterThan(0.2);
                    world(leg.foot, ankle);
                    const p = where.project(ankle.x, ankle.z, b.s, {});
                    expect(ankle.y).toBeGreaterThan(where.sample(p.s).y + 0.05);
                }
            }
        }
        expect(visits).toBeGreaterThanOrEqual(3);
        expect(poses.size).toBeGreaterThanOrEqual(visits);
    });

    test.each([['on the flat', false], ['on the steepest grade', true]])('stood with a foot down %s, the foot is on the cobbles at its own place, never under them', (_, steep) => {
        const where = steep ? new HillLane() : lane;
        const b = new HillBicycle(where);
        b.reset(steep ? 200 : 20);
        b.vehicle.footDown = true;
        rider.foot = 1;
        rider.update(b, where, 0);
        const leg = rider.legs.find(l => l.side === Vehicle.LEFT);
        const ankle = world(leg.foot, new THREE.Vector3());
        const p = where.project(ankle.x, ankle.z, b.s, {});
        const ground = where.sample(p.s).y + where.cobble(p.s, p.across);
        expect(ankle.y - ground).toBeGreaterThan(HillRider.ANKLE_ON_PEDAL[1] - 0.03);
        expect(ankle.y - ground).toBeLessThan(HillRider.ANKLE_ON_PEDAL[1] + 0.03);
    });
});

describe('the things in the street', () => {
    const lane = new HillLane();

    test("stand on the ground in front of the houses, a few at the lane's edge, none out in the lane", () => {
        const places = HillProps.place(lane);
        expect(places.length).toBeGreaterThan(100);
        expect(HillProps.place(lane)).toEqual(places);
        let edge = 0;
        for (const p of places) {
            expect(Math.abs(p.across)).toBeGreaterThan(lane.rule.halfWidthM - 0.6);
            expect(Math.abs(p.across)).toBeLessThan(lane.rule.halfWidthM + lane.rule.flagsM);
            const ground = lane.sample(p.s).y + (Math.abs(p.across) > lane.rule.halfWidthM ? 0.1 : lane.cobble(p.s, p.across));
            expect(Math.abs(p.y - ground)).toBeLessThan(1e-9);
            if (Math.abs(p.across) < lane.rule.halfWidthM) edge++;
        }
        expect(edge).toBeGreaterThan(3);
        expect(new Set(places.map(p => p.kind)).size).toBeGreaterThanOrEqual(8);
    });

    test('a knock moves a thing away from the bicycle and costs the bicycle; R puts it back', () => {
        const props = new HillProps(lane);
        const item = props.items.find(i => Math.abs(i.across) < lane.rule.halfWidthM && !HillProps.KINDS[i.kind].heavy);
        const bike = new HillBicycle(lane);
        bike.reset(item.s - 6, item.across);
        bike.vehicle.speed = 5;
        let knocked = 0;
        for (let t = 0; t < 3 && knocked === 0; t += DT) {
            bike.step(DT, { pedal: 0, brake: 0, steer: 0 });
            knocked = props.knock(bike, null);
            props.step(DT);
        }
        expect(knocked).toBeGreaterThan(0);
        const before = { x: item.x, z: item.z };
        for (let t = 0; t < 0.5; t += DT) props.step(DT);
        const moved = Math.hypot(item.x - before.x, item.z - before.z);
        expect(moved).toBeGreaterThan(0.2);
        const v = bike.vehicle;
        const away = (item.x - v.position.x) * Math.sin(v.yawAngle) + (item.z - v.position.z) * Math.cos(v.yawAngle);
        expect(away).toBeGreaterThan(0);
        expect(bike.speed).toBeLessThan(5.2);
        props.reset();
        expect(props.items.length).toBe(props.places.length);
        expect(props.items.every((i, k) => i.x === props.places[k].x && i.z === props.places[k].z && !i.moving)).toBe(true);
    });

    test('the heavy churn at speed knocks him off', () => {
        const props = new HillProps(lane);
        const bike = new HillBicycle(lane);
        const item = props.items.find(i => Math.abs(i.across) < lane.rule.halfWidthM && i.s > 130 && i.s < 220);
        Object.assign(item, { kind: 'churn' });
        bike.reset(item.s - 3, item.across);
        let hit = 0;
        for (let t = 0; t < 1 && !hit; t += DT) {
            bike.vehicle.speed = 8;
            bike.step(DT, quiet);
            hit = props.knock(bike, null);
        }
        expect(hit).toBeGreaterThan(0);
        expect(bike.crashed).toBe(true);
    });
});

describe('the village within its budget', () => {
    const lane = new HillLane();

    test('the lane, houses, walls, vale, trees and things together keep under 300,000 triangles', () => {
        const keep = HillScene.cobbleTextures;
        HillScene.cobbleTextures = () => ({ map: null, normalMap: null, aoMap: null, roughnessMap: null });
        const fieldKeep = HillScene.fieldTexture;
        HillScene.fieldTexture = () => null;
        const { group } = HillScene.build(lane);
        HillScene.cobbleTextures = keep;
        HillScene.fieldTexture = fieldKeep;
        let triangles = 0;
        group.traverse(o => {
            if (!o.isMesh) return;
            const g = o.geometry;
            const n = (g.index ? g.index.count : g.attributes.position.count) / 3;
            triangles += n * (o.isInstancedMesh ? o.count : 1);
        });
        const props = new HillProps(lane);
        for (const mesh of Object.values(props.meshes)) triangles += (mesh.geometry.index ? mesh.geometry.index.count : mesh.geometry.attributes.position.count) / 3 * mesh.count;
        console.log(`hill village: ${Math.round(triangles)} triangles`);
        expect(triangles).toBeLessThan(300000);
    });
});
