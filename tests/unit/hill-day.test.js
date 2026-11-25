/**
 * @jest-environment node
 */
// The hill ride's day (HillDay, js/hill/day.js; HillRide's climb and day step, js/hill/ride.js): the climb to the cart
// at the top seen from the opening's camera, the doors the boy throws bread at, the loaves in the basket, the fair
// hazards and the freewheel, ridden on the real lane and bicycle.
import { describe, test, expect } from '@jest/globals';
import { loadGame, loadScript, realThree } from '../helpers/load-game.js';

const THREE = realThree();
const { Vehicle, WorldPhysics, CHARACTERS } = loadGame(THREE);
const { HillLane, HillBicycle, HillBoard, HillDay, HillRide } = new Function('THREE', 'Vehicle', 'WorldPhysics', 'CHARACTERS', 'window',
    `${['lane', 'pushbike', 'bicycle', 'board', 'day', 'ride'].map(n => loadScript(`hill/${n}.js`)).join('\n')}\nreturn { HillLane, HillBicycle, HillBoard, HillDay, HillRide };`
)(THREE, Vehicle, WorldPhysics, CHARACTERS, { location: { search: '' } });

const DT = HillRide.STEP_S;
const lane = new HillLane();

// The autopilot of the other hill tests, both ways: steers for a point ahead along its way on the lane (`dir` -1 up
// the lane), holds the line `across`, and brakes to `most`
function pilot(bike, { most = Infinity, bend = Infinity, dir = 1, across = 0 } = {}) {
    const v = bike.speed, ahead = lane.at(bike.s + dir * (4 + v * 0.6), across, 0, {}), at = bike.vehicle.position;
    let err = Math.atan2(ahead.x - at.x, ahead.z - at.z) - bike.yaw;
    err = Math.atan2(Math.sin(err), Math.cos(err));
    const turn = 2.2 * err * Math.max(1, v);
    const lean = -Math.atan(Math.max(0, v) * Math.max(-3, Math.min(3, turn / Math.max(1, v))) / 9.81);
    const steer = Math.max(-1, Math.min(1, (bike.lean - lean) * 5));
    let limit = most;
    for (let d = 0; d <= 60; d += 2) if (Math.abs(lane.radiusAt(bike.s + dir * d)) < 30) limit = Math.min(limit, bend);
    return { pedal: 0, brake: v > limit ? 1 : 0, steer };
}

// A bicycle at s rolling down at `speed`, and a day on the descent
function descent(s, speed, across = 0) {
    const bike = new HillBicycle(lane);
    bike.reset(s, across);
    bike.vehicle.speed = speed;
    bike.vehicle.footDown = false;
    const day = new HillDay(lane);
    day.begin();
    return { bike, day };
}

// Rides on at about `speed` (pedalling to hold it on the flatter parts) until `untilS`, stepping the day
function rideTo(bike, day, untilS, { speed = 10, across = 0, onStep = () => {} } = {}) {
    const events = [];
    for (let t = 0; t < 120 && bike.s < untilS; t += DT) {
        const input = pilot(bike, { most: speed, across });
        input.pedal = bike.speed < speed - 0.5 && !input.brake ? 1 : 0;
        onStep(bike, day);
        bike.step(DT, input);
        events.push(...day.step(DT, bike, input));
    }
    return events;
}

describe('the doors', () => {
    test('four front doors down the lane, on both sides, none in a side road\'s mouth or the sharp right', () => {
        const day = new HillDay(lane);
        expect(day.doors).toHaveLength(HillDay.DOORS.length);
        day.doors.forEach((d, i) => {
            expect(Math.abs(d.s - HillDay.DOORS[i].s)).toBeLessThan(6);
            expect(Math.sign(d.across)).toBe(HillDay.DOORS[i].side);
            expect(Math.abs(d.across)).toBeLessThan(lane.rule.halfWidthM + 2);
            for (const m of lane.sideRoads) expect(Math.abs(d.s - m.s)).toBeGreaterThan(5);
            expect(d.s < lane.rule.sharpRight.fromS - 10 || d.s > lane.rule.sharpRight.toS + 10).toBe(true);
            if (i) expect(d.s).toBeGreaterThan(day.doors[i - 1].s + 40);
        });
        expect(new Set(day.doors.map(d => d.side)).size).toBe(2);
    });
});

describe('the throw', () => {
    // Throws at door 0 from `before` m short of it at 10 m/s: whether it is delivered, and the loaves after
    function throwAt(before, side = 1) {
        const { bike, day } = descent(day0().s - 40, 10);
        let thrown = null;
        const events = rideTo(bike, day, day0().s + 30, {
            onStep: (b, d) => { if (!thrown && b.s >= day0().s - before) thrown = d.throw(side, b); }
        });
        // The loaf comes to rest
        for (let i = 0; i < 600; i++) events.push(...day.step(DT, bike, {}));
        return { day, thrown, delivered: events.some(e => e.delivered === 0) };
    }
    const day0 = () => new HillDay(lane).doors[0];

    test('a throw at the right moment lands on the step; too early or too late, it lies in the street', () => {
        const sweep = [];
        for (let before = -4; before <= 20; before += 1) sweep.push([before, throwAt(before).delivered]);
        const good = sweep.filter(([, d]) => d).map(([b]) => b);
        console.log(`hill throw at 10 m/s: delivered when thrown ${Math.min(...good)} to ${Math.max(...good)} m before the door`);
        expect(good.length).toBeGreaterThan(0);
        // A window of a few metres: timing matters
        expect(Math.max(...good) - Math.min(...good)).toBeLessThan(6);
        expect(throwAt(20).delivered).toBe(false);
        expect(throwAt(-4).delivered).toBe(false);
        const late = throwAt(-4);
        const loaf = late.day.loose[0];
        expect(loaf.moving).toBe(false);
        expect(loaf.door).toBe(-1);
        expect(late.day.states[0]).toBe('missed');
    });

    test('a throw to the wrong side never delivers; every throw takes a loaf; an empty basket throws nothing', () => {
        const good = [...Array(25).keys()].map(k => k - 4).find(before => throwAt(before).delivered);
        expect(throwAt(good, -1).delivered).toBe(false);
        const { bike, day } = descent(150, 8);
        day.doors.length = 0;
        for (let i = 0; i < HillDay.BASKET; i++) {
            expect(day.throw(i % 2 ? 1 : -1, bike)).not.toBeNull();
            expect(day.loaves).toBe(HillDay.BASKET - i - 1);
        }
        expect(day.throw(1, bike)).toBeNull();
        expect(day.thrown).toBe(HillDay.BASKET);
    });

    test('off the descent (the climb, the hold) nothing is thrown', () => {
        const bike = new HillBicycle(lane);
        const day = new HillDay(lane);
        expect(day.throw(1, bike)).toBeNull();
        expect(day.loaves).toBe(HillDay.BASKET);
    });
});

describe('the round', () => {
    test('a door passed without its loaf is missed and costs 5 s on the clock; a clean round is every door and no loaf lost', () => {
        const { bike, day } = descent(day1s() - 5, 10);
        const board = new HillBoard(lane);
        board.begin(bike.s);
        const ride = Object.assign(Object.create(HillRide.prototype), { lane, bike, board, day, game: {} });
        bike.reset(day.doors[0].s + HillDay.JUDGE_M + 1);
        const before = board.ms;
        const events = ride.dayStep(DT, {});
        expect(events).toEqual([{ missed: 0 }]);
        expect(board.ms - before).toBe(HillDay.MISS_MS);
        expect(day.summary()).toMatchObject({ missed: day.doors.length, clean: false });
        day.states = day.doors.map(() => 'delivered');
        day.loaves = HillDay.BASKET - day.doors.length;
        expect(day.summary()).toMatchObject({ delivered: day.doors.length, missed: 0, missMs: 0, clean: true });
        day.lost = 1;
        expect(day.summary().clean).toBe(false);
    });
    const day1s = () => new HillDay(lane).doors[0].s;

    test('a fall spills the basket, and a hard knock on a kerb shakes one loaf out', () => {
        const { bike, day } = descent(110, 9);
        bike.vehicle.brushNew = true;
        expect(day.step(DT, bike, {})).toEqual([{ lost: 1 }]);
        expect(day.loaves).toBe(HillDay.BASKET - 1);
        expect(day.loose).toHaveLength(1);
        bike.vehicle.speed = 2;
        bike.vehicle.brushNew = true;
        expect(day.step(DT, bike, {})).toEqual([]);
        bike.vehicle.crashed = true;
        expect(day.step(DT, bike, {})).toEqual([{ lost: HillDay.BASKET - 1 }]);
        expect(day.summary()).toMatchObject({ loaves: 0, lost: HillDay.BASKET, falls: 1 });
    });

    test('a loaf in the street is knocked by a wheel and costs the bicycle a little speed', () => {
        const { bike, day } = descent(150, 8);
        const at = lane.at(153, 0, 0, {});
        day.loose.push({ x: at.x, y: at.y + 0.07, z: at.z, vx: 0, vy: 0, vz: 0, s: 153, moving: false, door: -1, thrown: true, spin: 0 });
        const events = rideTo(bike, day, 156, { speed: 8 });
        expect(events).toContainEqual({ knock: 'street' });
    });
});

describe('the hazards: seen in time, room to pass, the same every ride', () => {
    test('the cat sets off when the bicycle is 30 m short and is across before a centre-line rider at any pace gets there', () => {
        const H = HillDay.HAZARDS.cat;
        for (const speed of [4, 8, 12, 16]) {
            const { bike, day } = descent(H.s - 60, speed);
            const events = rideTo(bike, day, H.s + 10, { speed });
            expect(events.filter(e => e.hazard === 'cat')).toEqual([]);
            expect(day.cat.state).not.toBe('waiting');
        }
    });

    test('the cart comes up the lane on its side: a rider on the centre line passes it, one on its line falls', () => {
        const H = HillDay.HAZARDS.cart;
        for (const across of [0, 0.8]) {
            const { bike, day } = descent(150, 12);
            const events = rideTo(bike, day, H.fromS + 10, { speed: 12, across });
            expect(events.filter(e => e.hazard === 'cart')).toEqual([]);
            expect(day.cart.s).toBeLessThan(H.fromS);
        }
        const { bike, day } = descent(150, 12);
        const events = rideTo(bike, day, H.fromS + 10, { speed: 12, across: H.across });
        expect(events).toContainEqual({ hazard: 'cart', fall: true });
    });

    test('the washing blows out over one side only: the middle of the lane is always clear', () => {
        const H = HillDay.HAZARDS.washing;
        for (const [across, hit] of [[0, false], [H.side * 2.3, true]]) {
            let found = false;
            for (let start = 0; start < H.periodS; start += 0.5) {
                const { bike, day } = descent(H.s - 30, 6);
                day.since = start;
                const events = rideTo(bike, day, H.s + H.lengthM + 2, { speed: 6, across });
                if (events.some(e => e.hazard === 'washing')) found = true;
            }
            expect(found).toBe(hit);
        }
    });
});

describe('the freewheel', () => {
    test('counts the metres with the legs out, no pedal and no brake, and keeps the longest', () => {
        const { bike, day } = descent(230, 12);
        bike.legsOut = true;
        const legs = bike.legsOut;
        expect(legs).toBe(true);
        for (let i = 0; i < 120; i++) {
            bike.legsOut = true;
            day.step(DT, bike, { pedal: 0, brake: 0 });
        }
        const run = day.freewheel.best;
        expect(run).toBeGreaterThan(10);
        day.step(DT, bike, { pedal: 0, brake: 1 });
        expect(day.freewheel.run).toBe(0);
        expect(day.freewheel.best).toBe(run);
        expect(day.summary().freewheelM).toBe(Math.round(run));
    });
});

describe('the climb', () => {
    test('from the top stretch up to the cart in 20 to 40 s, in sight of the opening camera most of the way', () => {
        const C = HillDay.CLIMB;
        const bike = new HillBicycle(lane);
        bike.reset(C.fromS, C.across);
        bike.vehicle.yawAngle += Math.PI;
        const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 3000);
        const ride = Object.assign(Object.create(HillRide.prototype), { lane, bike, game: { camera }, look: new THREE.Vector3(), camTarget: new THREE.Vector3(), climb: { phase: 'climb', t: 0 }, sample: {}, view: 0 });
        let t = 0, seen = 0, frames = 0, crashes = 0;
        const hidden = [];
        for (; t < 90 && bike.s > C.triggerS; t += DT) {
            const input = pilot(bike, { dir: -1, across: C.across });
            input.pedal = 1;
            input.brake = 0;
            // The player steers as the camera sees him, which the climb turns back (climbStep)
            input.steer = -input.steer;
            ride.climbStep(DT, input);
            const down = bike.crashed;
            bike.step(DT, input);
            if (!down && bike.crashed) crashes++;
            if (Math.round(t / DT) % 12 === 0) {
                ride.placeCamera(1);
                frames++;
                if (HillRide.seen(camera, lane, HillRide.points(lane, bike))) seen++;
                else hidden.push(Math.round(bike.s));
            }
        }
        console.log(`hill climb: ${t.toFixed(1)} s from s ${C.fromS} to ${C.triggerS}, in sight ${(seen / frames * 100).toFixed(0)} % of the time (hidden at s ${[...new Set(hidden)].join(' ')}), ${crashes} falls`);
        expect(bike.s).toBeLessThanOrEqual(C.triggerS);
        expect(t).toBeGreaterThan(20);
        expect(t).toBeLessThan(40);
        expect(crashes).toBe(0);
        expect(seen / frames).toBeGreaterThan(0.8);
    });

    test('the climb ends at the cart: the steer keys are turned for the camera, the basket fills, then the hold at the top', () => {
        const bike = new HillBicycle(lane);
        const day = new HillDay(lane);
        const ride = Object.assign(Object.create(HillRide.prototype), { lane, bike, day, game: { camera: new THREE.PerspectiveCamera() }, look: new THREE.Vector3(), camTarget: new THREE.Vector3(), sample: {}, view: 0 });
        ride.beginClimb();
        expect(day.climbing).toBe(true);
        expect(ride.hold).toBe(null);
        const controls = { pedal: 1, brake: 0, steer: 0.5, wheelie: 1 };
        ride.climbStep(DT, controls);
        expect(controls).toMatchObject({ steer: -0.5, wheelie: 0 });
        bike.reset(HillDay.CLIMB.triggerS - 0.5);
        ride.climbStep(DT, {});
        expect(ride.climb.phase).toBe('restock');
        const held = {};
        for (let t = 0; t < HillDay.CLIMB.restockS + 0.1; t += DT) ride.climbStep(DT, held);
        expect(ride.climb).toBe(null);
        expect(ride.hold).toMatchObject({ phase: 'hold' });
        expect(bike.s).toBe(lane.rule.startM);
        expect(day.loaves).toBe(HillDay.BASKET);
        expect(day.climbing).toBe(false);
    });
});
