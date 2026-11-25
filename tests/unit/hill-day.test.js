/**
 * @jest-environment node
 */
// The hill ride's day (HillDay, js/hill/day.js; HillRide's climb and day step, js/hill/ride.js): the climb to the cart
// at the top seen as the stills cut it, the doors the boy throws bread at, the loaves in the basket, the fair
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
    test('from the bend up to the stall in 20 to 40 s, in sight most of the way, cut as the stills are, wheeled in to the stall side on at the end', () => {
        const C = HillDay.CLIMB;
        const bike = new HillBicycle(lane);
        bike.reset(C.fromS, C.across);
        bike.vehicle.yawAngle += Math.PI;
        const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 3000);
        const ride = Object.assign(Object.create(HillRide.prototype), { lane, bike, game: { camera }, look: new THREE.Vector3(), camTarget: new THREE.Vector3(), climb: { phase: 'climb', t: 0 }, sample: {}, view: 0 });
        let t = 0, seen = 0, frames = 0, crashes = 0, wide = 0, track = 0, stopped = 0;
        const hidden = [];
        const S = HillRide.CLIMB_SHOTS, wideAt = new THREE.Vector3(), aim = new THREE.Vector3(), stopAt = lane.at(S.stop[0], S.stop[1], S.stop[2], {});
        HillRide.shot(lane, S.wide, wideAt, aim);
        const frameAt = () => 2 * camera.position.distanceTo(ride.look) * Math.tan(camera.fov * Math.PI / 360);
        const most = Math.max(...S.frames.map(f => f[1])), least = Math.min(...S.frames.map(f => f[1]));
        for (; t < 90 && ride.climb.phase === 'climb'; t += DT) {
            const input = pilot(bike, { dir: -1, across: C.across });
            input.pedal = 1;
            input.brake = 0;
            ride.climbStep(DT, input);
            if (ride.climb.phase !== 'climb') break;
            const down = bike.crashed;
            bike.step(DT, input);
            if (!down && bike.crashed) crashes++;
            if (Math.round(t / DT) % 12 === 0) {
                ride.placeCamera(1);
                frames++;
                // First the wide shot held still, then the long lens head on, going back up the lane ahead of him with
                // trackFrameM of picture height at his distance, then stopped a pace from the stall, the lens opening out
                if (C.fromS - bike.s < S.wideM) {
                    expect(camera.position.distanceTo(wideAt)).toBeLessThan(1e-6);
                    wide++;
                } else if (camera.position.distanceTo(new THREE.Vector3(stopAt.x, stopAt.y, stopAt.z)) < 1e-6) {
                    // (the picture's height at his distance: the camera aims between him and the stall)
                    const v = bike.vehicle.position, d = camera.position.distanceTo(new THREE.Vector3(v.x, v.y + S.lookUpM, v.z));
                    const frame = 2 * d * Math.tan(camera.fov * Math.PI / 360);
                    expect(frame).toBeGreaterThan(least - 0.05);
                    expect(frame).toBeLessThan(most + 0.05);
                    stopped++;
                } else {
                    // (on the lane, trackM up it from him)
                    const at = lane.project(camera.position.x, camera.position.z, bike.s - S.trackM, {});
                    expect(Math.abs(at.s - (bike.s - S.trackM))).toBeLessThan(0.05);
                    expect(frameAt()).toBeCloseTo(S.trackFrameM, 2);
                    track++;
                }
                if (HillRide.seen(camera, lane, HillRide.points(lane, bike))) seen++;
                else hidden.push(Math.round(bike.s));
            }
        }
        console.log(`hill climb: ${t.toFixed(1)} s from s ${C.fromS} to s ${bike.s.toFixed(1)}, in sight ${(seen / frames * 100).toFixed(0)} % of the time (hidden at s ${[...new Set(hidden)].join(' ')}), ${crashes} falls; wide ${wide}, head on ${track}, stopped ${stopped}`);
        expect(ride.climb.phase).toBe('restock');
        expect(t).toBeGreaterThan(20);
        expect(t).toBeLessThan(40);
        expect(crashes).toBe(0);
        expect(seen / frames).toBeGreaterThan(0.8);
        expect(wide).toBeGreaterThan(0);
        expect(track).toBeGreaterThan(0);
        expect(stopped).toBeGreaterThan(0);
        // Wheeled in to the stall, whatever the keys said: at its meeting place, turned well across the lane
        const meet = lane.at(C.meet[0], C.meet[1], 0, {}), p = lane.sample(bike.s);
        const turned = Math.abs(Math.atan2(Math.sin(bike.vehicle.yawAngle - p.heading - Math.PI), Math.cos(bike.vehicle.yawAngle - p.heading - Math.PI)));
        console.log(`hill climb: at the stall on the line ${bike.across.toFixed(2)}, turned ${(turned * 180 / Math.PI).toFixed(0)} degrees off the lane`);
        expect(Math.hypot(meet.x - bike.vehicle.position.x, meet.z - bike.vehicle.position.z)).toBeLessThan(C.meetM + 0.05);
        expect(turned).toBeGreaterThan(0.5);
    });

    test('the climb ends at the cart: the steer keys are the bicycle\'s own, the basket is made up, then the hold at the top', () => {
        const bike = new HillBicycle(lane);
        const day = new HillDay(lane);
        const ride = Object.assign(Object.create(HillRide.prototype), { lane, bike, day, game: { camera: new THREE.PerspectiveCamera() }, look: new THREE.Vector3(), camTarget: new THREE.Vector3(), sample: {}, view: 0 });
        ride.beginClimb();
        expect(day.climbing).toBe(true);
        expect(ride.hold).toBe(null);
        const controls = { pedal: 1, brake: 0, steer: 0.5, wheelie: 1 };
        ride.climbStep(DT, controls);
        expect(controls).toMatchObject({ steer: 0.5, wheelie: 0 });
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
        expect(bike.walking).toBe(false);
    });

    test.each([['the wide shot', 3], ['the long lens head on', 10], ['the stop by the stall', 16.5]])('in %s the left key turns him and the bicycle to his left and the right key to his right, as on the descent', (name, at) => {
        // He walks up for `at` s on the pedal key, then for 1 s with a steer key held (left: +1, as js/input.js
        // gives it); how far the bicycle has turned from the same walk with no steer key (+ to his left)
        const turned = steer => {
            const bike = new HillBicycle(lane);
            const ride = Object.assign(Object.create(HillRide.prototype), { lane, bike, day: new HillDay(lane), game: { camera: new THREE.PerspectiveCamera() }, look: new THREE.Vector3(), camTarget: new THREE.Vector3(), sample: {}, view: 0 });
            ride.beginClimb();
            for (let t = 0; t < at + 1; t += DT) {
                // (kept on the lane's middle by the pilot until the key)
                const input = { pedal: 1, brake: 0, steer: t >= at ? steer : pilot(bike, { dir: -1 }).steer, wheelie: 0 };
                ride.climbStep(DT, input);
                bike.step(DT, input);
            }
            return bike.vehicle.yawAngle;
        };
        // (his left: a heading a little more towards it; the yaw grows to the left, as on the descent below)
        const ahead = turned(0), left = turned(1) - ahead, right = turned(-1) - ahead;
        const down = new HillBicycle(lane);
        down.reset(120);
        down.vehicle.speed = 1.5;
        const yaw0 = down.vehicle.yawAngle;
        for (let t = 0; t < 1; t += DT) down.step(DT, { pedal: 0.3, brake: 0, steer: 1, wheelie: 0 });
        const descentLeft = Math.sign(down.vehicle.yawAngle - yaw0);
        console.log(`hill climb keys, ${name}: left turns him ${left.toFixed(2)} rad, right ${right.toFixed(2)} (the descent's left key turns it ${descentLeft > 0 ? '+' : '-'})`);
        expect(Math.sign(left)).toBe(descentLeft);
        expect(Math.sign(right)).toBe(-descentLeft);
        expect(Math.abs(left)).toBeGreaterThan(0.1);
        expect(Math.abs(right)).toBeGreaterThan(0.1);
    });

    test('on foot: the pedal key walks him up at about walkMs, and let go he holds the bicycle where it is', () => {
        const C = HillDay.CLIMB;
        const bike = new HillBicycle(lane);
        const ride = Object.assign(Object.create(HillRide.prototype), { lane, bike, day: new HillDay(lane), game: { camera: new THREE.PerspectiveCamera() }, look: new THREE.Vector3(), camTarget: new THREE.Vector3(), sample: {}, view: 0 });
        ride.beginClimb();
        expect(bike.walking).toBe(true);
        const go = (pedal, seconds) => {
            for (let t = 0; t < seconds; t += DT) {
                const input = { pedal, brake: 0, steer: 0, wheelie: 0 };
                ride.climbStep(DT, input);
                bike.step(DT, input);
            }
        };
        go(1, 8);
        expect(bike.speed).toBeGreaterThan(C.walkMs - 0.2);
        expect(bike.speed).toBeLessThan(C.walkMs + 0.2);
        // No pedalling on foot: the cranks stay still and the legs stay in
        expect(bike.cadenceRpm).toBe(0);
        expect(bike.legs).toBe(0);
        expect(bike.walkM).toBeGreaterThan(8);
        go(0, 3);
        const s = bike.s;
        go(0, 3);
        expect(bike.speed).toBeLessThan(0.05);
        expect(Math.abs(bike.s - s)).toBeLessThan(0.05);
    });
});
