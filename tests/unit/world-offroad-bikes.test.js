/**
 * @jest-environment node
 */
// The off-road bikes on a world's land (BIKE_MODELS `offroad`, WorldPhysics.offroad and the power slide). The real
// Vehicle on a flat plane with no road, as tests/unit/world-low-speed.test.js rides it; `land` holds the bike on the
// land (Vehicle.runoff and the time on it, offRoadTime, which checkWallCollision and worldLand set from the drawn road
// in a ride).
//
// ROAD is what the first rider's first bike did before the trait existed (b4ce4de, by the same rides):
// a bike with no trait must still do exactly that, on the land and on the road.
import { describe, test, expect } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';

const DT = 1 / 60;
const game = loadGame();
const world = game.WorldPhysics;
const rad = d => d * Math.PI / 180;
const TRAIL = ['lucy', 'bike15_crf250'], SINGLE = ['guy', 'bike05_g310gs'], TRIPLE = ['alex', 'bike10_tiger900'], SCRAMBLER = ['guy', 'bike04_scrambler'];
const OFFROAD = [TRAIL, SINGLE, TRIPLE, SCRAMBLER];
const ROAD_BIKES = [['steve', 'bike08_xsr900'], ['steve', 'bike13_panigale'], ['tim', 'bike14_forza'], ['shane', 'bike11_duke990'], ['guy', 'bike12_tracer9gt']];
const ROAD = {
    landHold: 3.768, landFrom20: [7.956, 4.053, 3.77], landTurn8: { lean: -0.58, yaw: 2.212 }, landLean42: { at: 0.2, lean: -0.663, yaw: 0.202 },
    roadHold: 52.723, roadFrom20: [24.846, 30.234, 34.792], roadTurn8: { lean: -0.873, yaw: 3.63 }
};
// The trail single on the road before the trait: the carriageway is not the trait's
const TRAIL_ROAD = { roadHold: 47.498, roadFrom20: [24.008, 28.621, 32.584], roadTurn8: { lean: -0.873, yaw: 3.732 } };

function bike([character, model], speed, land, physics = world) {
    const v = new game.Vehicle(new game.THREE.Scene(), null, game.CHARACTERS.find(c => c.id === character), model, { model: false });
    v.environment = {
        physics,
        route: { unitCount: 0, fromUnits: u => u, project: () => ({ index: -1 }), sample: () => ({ grade: 0, flags: {} }) }
    };
    v.speed = speed;
    v.hold = land ? Object.freeze({ drag: 0.35, grip: world.landGrip, floorSpeed: 6 }) : null;
    return v;
}
const tick = (v, steer, throttle, brake) => {
    v.runoff = v.hold;
    if (v.hold) v.offRoadTime += DT;
    v.update(DT, steer, throttle, brake, 0);
};

// Full throttle, no steering: the speed held after 10 s from 4 m/s
function hold(who, land) {
    const v = bike(who, 4, land);
    for (let i = 0; i < 600; i++) tick(v, 0, 1, 0);
    return v.speed;
}
// Full throttle from 20 m/s: the speed after 1, 2 and 3 s
function from20(who, land) {
    const v = bike(who, 20, land);
    const out = [];
    for (let i = 0; i < 180; i++) { tick(v, 0, 1, 0); if ((i + 1) % 60 === 0) out.push(v.speed); }
    return out;
}
// Full steering with the speed held at `speed` for `seconds`, from a lean of `leanDeg` into the turn
function turn(who, land, { speed = 8, throttle = 1, brake = 0, leanDeg = 0, seconds = 3 } = {}) {
    const v = bike(who, speed, land);
    v.leanAngle = -rad(leanDeg);
    v.worldThrottle = throttle;
    let at = null, slide = 0, lead = 0;
    for (let i = 0; i < seconds * 60 && !v.crashed; i++) {
        v.speed = speed;
        tick(v, 1, throttle, brake);
        if (v.crashed) at = Math.round(i * DT * 1000) / 1000;
        else {
            slide = Math.max(slide, Math.abs(v.slideAngle));
            // How far the drawn bike heads into the turn (which is toward +yaw here) past the way it travels
            lead = Math.max(lead, v.group.rotation.y - v.yawAngle);
        }
    }
    return { v, crashed: v.crashed, at, cause: v.crashCause, lean: v.leanAngle, yaw: v.yawAngle, slide, lead };
}
const close = (got, want) => expect(got).toBeCloseTo(want, 2);

describe('the off-road trait is data', () => {
    test('the four off-road bikes carry it in the catalogue, in order, and no other bike does', () => {
        const trait = id => game.Vehicle.offroadOf(id);
        const [trail, single, triple, scrambler] = OFFROAD.map(([, id]) => trait(id));
        expect(trail).toBe(1);
        expect(trail).toBeGreaterThan(single);
        expect(single).toBeGreaterThan(triple);
        expect(triple).toBeGreaterThan(2 * scrambler);
        expect(scrambler).toBeGreaterThan(0);
        const others = Object.keys(game.BIKE_MODELS).filter(id => !OFFROAD.some(([, own]) => own === id));
        expect(others.length).toBe(Object.keys(game.BIKE_MODELS).length - 4);
        for (const id of others) expect(trait(id)).toBe(0);
    });

    test('a procedural kind ridden as itself has its kind\'s trait, and a detailed bike keeps its own whatever stands in for it', () => {
        expect(game.Vehicle.offroadOf('dirt')).toBe(game.Vehicle.offroadOf('bike15_crf250'));
        expect(game.Vehicle.offroadOf('adventure')).toBe(game.Vehicle.offroadOf('bike10_tiger900'));
        for (const kind of ['sport', 'naked', 'scooter', 'nothing']) expect(game.Vehicle.offroadOf(kind)).toBe(0);
        // The sports tourer is built as the adventure kind while its file loads, and is no off-road bike
        expect(game.BIKE_MODELS.bike12_tracer9gt.kind).toBe('adventure');
        expect(bike(['guy', 'bike12_tracer9gt'], 4, true).offroad).toBe(0);
        expect(bike(SINGLE, 4, true).offroad).toBe(game.BIKE_MODELS.bike05_g310gs.offroad);
    });

    test('a new catalogue entry with the trait gets the land speed and the slide with no other change', () => {
        const id = 'bike99_test_tourer';
        game.BIKE_MODELS[id] = { ...game.BIKE_MODELS.bike12_tracer9gt, id, offroad: 0.5 };
        const rider = { ...game.CHARACTERS.find(c => c.id === 'guy'), id: 'tester', bikes: [id] };
        game.CHARACTERS.push(rider);
        try {
            const who = ['tester', id];
            expect(bike(who, 4, true).offroad).toBe(0.5);
            const speed = hold(who, true);
            expect(speed).toBeLessThan(hold(TRIPLE, true));
            expect(speed).toBeGreaterThan(hold(SCRAMBLER, true));
            const slid = turn(who, true);
            expect(slid.crashed).toBe(false);
            expect(slid.slide).toBeGreaterThan(turn(SCRAMBLER, true).slide);
            expect(slid.slide).toBeLessThan(turn(TRIPLE, true).slide);
        } finally {
            game.CHARACTERS.pop();
            delete game.BIKE_MODELS[id];
        }
    });
});

describe('the land slows an off-road bike less', () => {
    test('at full throttle the trail single holds more speed than a road bike, and the four are in the order of their trait', () => {
        const road = hold(ROAD_BIKES[0], true);
        const [trail, single, triple, scrambler] = OFFROAD.map(who => hold(who, true));
        console.log(`speed held on flat land at full throttle (m/s): road bike ${road.toFixed(2)}, trail single ${trail.toFixed(2)}, small adventure single ${single.toFixed(2)}, adventure triple ${triple.toFixed(2)}, scrambler ${scrambler.toFixed(2)}`);
        expect(trail).toBeGreaterThan(road + 2);
        expect(trail).toBeGreaterThan(single);
        expect(single).toBeGreaterThan(triple);
        expect(triple).toBeGreaterThan(scrambler);
        expect(scrambler).toBeGreaterThan(road);
        expect(trail).toBeLessThan(world.offroad.landCapSpeed);
    });

    test('the speed comes with time on the land: in the first seconds the trail single has little of it', () => {
        const to = world.offroad;
        const v = bike(TRAIL, 4, true), road = bike(ROAD_BIKES[0], 4, true);
        let early = 0;
        for (let i = 0; i < 600; i++) {
            tick(v, 0, 1, 0);
            tick(road, 0, 1, 0);
            if (v.offRoadTime <= to.settleS) early = Math.max(early, v.speed - road.speed);
        }
        // Until settleS the cap is up by `soon` of the trait's rise, and after settleS + riseS by all of it
        expect(early).toBeGreaterThan(0);
        expect(early).toBeLessThan((to.landCapSpeed - world.landCapSpeed) * to.soon + 0.3);
        expect(v.landValues().landCapSpeed).toBeCloseTo(to.landCapSpeed, 9);
        expect(v.speed - road.speed).toBeGreaterThan(2);
        // The carriageway clears the time: back on the land the bike starts again
        v.offRoadTime = 0;
        expect(v.landValues().landCapSpeed).toBeCloseTo(world.landCapSpeed + (to.landCapSpeed - world.landCapSpeed) * to.soon, 9);
        // What the tyres grip does not wait
        expect(v.landValues().landGrip).toBe(to.landGrip);
        expect(v.landValues().landTraction).toBe(to.landTraction);
    });

    test('arriving on the land at 20 m/s every bike is slowed as hard at first, and the off-road bikes pick up after', () => {
        const run = who => {
            const v = bike(who, 20, true);
            const out = [];
            for (let i = 0; i < 360; i++) { tick(v, 0, 1, 0); if ((i + 1) % 60 === 0) out.push(v.speed); }
            return out;
        };
        const road = run(ROAD_BIKES[0]);
        const rows = OFFROAD.map(run);
        console.log(`from 20 m/s onto the land at full throttle, the speed after 1 to 6 s (m/s): road bike ${road.map(x => x.toFixed(1)).join(' ')}; trail single ${rows[0].map(x => x.toFixed(1)).join(' ')}`);
        // The first second is the same for all: the speed values wait for settleS (the hairpin cuts)
        for (const row of rows) expect(row[0]).toBeCloseTo(road[0], 6);
        for (const row of rows) expect(row[1]).toBeLessThan(10);
        // From settleS + riseS the four are in the order of their trait
        for (const at of [4, 5]) {
            expect(rows[0][at]).toBeGreaterThan(rows[1][at]);
            expect(rows[1][at]).toBeGreaterThan(rows[2][at]);
            expect(rows[2][at]).toBeGreaterThan(rows[3][at]);
            expect(rows[3][at]).toBeGreaterThan(road[at]);
        }
        expect(rows[0][5]).toBeGreaterThan(road[5] + 2);
        // Still the land: under the speed that crashes a bike held on it
        expect(Math.max(...rows[0].slice(1))).toBeLessThan(world.landCrashSpeed);
    });

    test('the drawn trail single bobs and rocks less on the land', () => {
        const most = who => {
            const v = bike(who, 4, true);
            let bump = 0, rock = 0;
            for (let i = 0; i < 600; i++) {
                tick(v, 0, 1, 0);
                bump = Math.max(bump, Math.abs(v.group.position.y - v.position.y));
                rock = Math.max(rock, Math.abs(v.landRock));
            }
            return { bump, rock };
        };
        const road = most(ROAD_BIKES[0]), trail = most(TRAIL);
        expect(trail.bump).toBeLessThan(road.bump * 0.6);
        expect(trail.rock).toBeLessThan(road.rock * 0.6);
    });
});

describe('a bike with no trait is unchanged', () => {
    test('the first bike rides the land and the road as before', () => {
        const who = ROAD_BIKES[0];
        close(hold(who, true), ROAD.landHold);
        from20(who, true).forEach((speed, i) => close(speed, ROAD.landFrom20[i]));
        close(hold(who, false), ROAD.roadHold);
        from20(who, false).forEach((speed, i) => close(speed, ROAD.roadFrom20[i]));
        for (const [land, want] of [[true, ROAD.landTurn8], [false, ROAD.roadTurn8]]) {
            const r = turn(who, land);
            expect(r.crashed).toBe(false);
            close(r.lean, want.lean);
            close(r.yaw, want.yaw);
            expect(r.slide).toBe(0);
            expect(r.lead).toBe(0);
        }
        const fall = turn(who, true, { speed: 9, leanDeg: 42, seconds: 2 });
        expect(fall).toMatchObject({ crashed: true, at: ROAD.landLean42.at, cause: 'Lost the front on the grass' });
        close(fall.lean, ROAD.landLean42.lean);
        close(fall.yaw, ROAD.landLean42.yaw);
    });

    test('every bike without the trait reads the world\'s own land values, and never slides', () => {
        for (const who of ROAD_BIKES) {
            const v = bike(who, 8, true);
            expect(v.landValues()).toBe(world);
            expect(turn(who, true, { speed: 9, leanDeg: 42, seconds: 2 })).toMatchObject({ crashed: true, at: 0.2, cause: 'Lost the front on the grass', slide: 0 });
        }
    });

    test('the trail single on the carriageway rides as before', () => {
        close(hold(TRAIL, false), TRAIL_ROAD.roadHold);
        from20(TRAIL, false).forEach((speed, i) => close(speed, TRAIL_ROAD.roadFrom20[i]));
        const r = turn(TRAIL, false);
        close(r.lean, TRAIL_ROAD.roadTurn8.lean);
        close(r.yaw, TRAIL_ROAD.roadTurn8.yaw);
        expect(r.slide).toBe(0);
    });
});

describe('the power slide', () => {
    // Arriving on the land at 9 m/s leaned 42 degrees with the steering held: over the land's grip for every bike
    const arrive = { speed: 9, leanDeg: 42, seconds: 2 };

    test('over the grip on the land with the throttle open the trail single slides where a road bike lowsides', () => {
        const road = turn(ROAD_BIKES[0], true, arrive);
        expect(road).toMatchObject({ crashed: true, cause: 'Lost the front on the grass' });
        const trail = turn(TRAIL, true, arrive);
        expect(trail.crashed).toBe(false);
        // The slide angle grows, within its cap, and the drawn bike heads into the turn past the way it travels
        expect(trail.slide).toBeGreaterThan(rad(15));
        expect(trail.slide).toBeLessThanOrEqual(rad(world.slideMaxDeg) + 1e-9);
        expect(trail.lead).toBeCloseTo(trail.slide, 6);
        expect(trail.yaw).toBeGreaterThan(0);
    });

    test('the slide grows from nothing, and the four slide in the order of their trait', () => {
        const v = bike(TRAIL, 8, true);
        const seen = [];
        for (let i = 0; i < 90; i++) { v.speed = 8; tick(v, 1, 1, 0); seen.push(Math.abs(v.slideAngle)); }
        expect(seen[0]).toBeLessThan(rad(1));
        for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1] - 1e-9);
        expect(seen[seen.length - 1]).toBeGreaterThan(rad(15));
        const slides = OFFROAD.map(who => turn(who, true, { speed: 6.5 }));
        for (const r of slides) expect(r.crashed).toBe(false);
        console.log(`slide at 6.5 m/s, full lock and throttle (degrees): ${slides.map(r => (r.slide * 180 / Math.PI).toFixed(1)).join(', ')}`);
        expect(slides[0].slide).toBeGreaterThan(slides[1].slide);
        expect(slides[1].slide).toBeGreaterThan(slides[2].slide);
        expect(slides[2].slide).toBeGreaterThan(slides[3].slide);
        // The scrambler's is a twitch, not a slide
        expect(slides[3].slide).toBeLessThan(rad(5));
    });

    test('the path turns no tighter than the grip gives, and the slide costs speed', () => {
        const v = bike(TRAIL, 8, true);
        for (let i = 0; i < 120; i++) { v.speed = 8; tick(v, 1, 1, 0); }
        const yaw = v.yawAngle;
        v.speed = 8;
        tick(v, 1, 1, 0);
        const grip = Math.tan(rad(world.leanCapDeg)) * v.worldMultipliers().lateralFriction;
        // The turn is made at the speed the tick ends on (the speed is stepped first)
        expect((v.yawAngle - yaw) / DT).toBeLessThanOrEqual(9.81 * grip / v.speed + 1e-6);
        expect((v.yawAngle - yaw) / DT).toBeGreaterThan(0.9 * 9.81 * grip / v.speed);
        expect(v.lastDemand).toBeGreaterThan(grip);
        // No steering and no slide: the same tick from the same speed loses less
        const straight = bike(TRAIL, 8, true);
        straight.worldThrottle = 1;
        tick(straight, 0, 1, 0);
        expect(8 - v.speed).toBeGreaterThan(8 - straight.speed + world.slideScrub * rad(15) * DT);
    });

    test('with the throttle closed the trail single over the limit falls as a road bike does', () => {
        const fall = turn(TRAIL, true, { speed: 9, leanDeg: 50, throttle: 0, seconds: 2 });
        expect(fall).toMatchObject({ crashed: true, at: 0.2, cause: 'Lost the front on the grass', slide: 0 });
        // Shutting the throttle in a held slide does not drop the bike by itself: the slide comes back
        const v = bike(TRAIL, 8, true);
        for (let i = 0; i < 120; i++) { v.speed = 8; tick(v, 1, 1, 0); }
        expect(Math.abs(v.slideAngle)).toBeGreaterThan(rad(15));
        for (let i = 0; i < 120; i++) { v.speed = 8; tick(v, 1, 0, 0); }
        expect(v.crashed).toBe(false);
        expect(v.slideAngle).toBe(0);
    });

    test('past the wider limit the trail single still falls', () => {
        const fall = turn(TRAIL, true, { speed: 12, leanDeg: 72, seconds: 2 });
        expect(fall.crashed).toBe(true);
        expect(fall.at).toBeCloseTo(world.lowsideMs / 1000, 1);
        expect(fall.cause).toBe('Slid too far: the rear came round on the grass');
    });

    test('with the brake on hard while far over it falls', () => {
        expect(turn(TRAIL, true, arrive).crashed).toBe(false);
        const fall = turn(TRAIL, true, { ...arrive, leanDeg: 50, brake: 1 });
        expect(fall).toMatchObject({ crashed: true, at: 0.2, cause: 'Lost the front on the grass' });
        expect(turn(TRAIL, true, { ...arrive, leanDeg: 50 }).crashed).toBe(false);
    });

    test('on the carriageway the trail single lowsides as a road bike does', () => {
        // Leaned 60 degrees at 14 m/s with the steering held: over the road's grip
        const over = { speed: 14, leanDeg: 60, seconds: 2 };
        const road = turn(ROAD_BIKES[0], false, over), trail = turn(TRAIL, false, over);
        expect(road).toMatchObject({ crashed: true, cause: 'Lost the front: too much lean for the grip' });
        expect(trail).toMatchObject({ crashed: true, at: road.at, cause: road.cause, slide: 0, lead: 0 });
    });

    test('the slide is gone after a crash and after a restart', () => {
        const v = bike(TRAIL, 8, true);
        for (let i = 0; i < 120; i++) { v.speed = 8; tick(v, 1, 1, 0); }
        expect(Math.abs(v.slideAngle)).toBeGreaterThan(rad(15));
        v.reset();
        expect(v.slideAngle).toBe(0);
        expect(v.worldBrake).toBe(0);
        expect(v.lowsideTimerMs).toBe(0);

        const fall = bike(TRAIL, 12, true);
        fall.leanAngle = -rad(72);
        fall.worldThrottle = 1;
        let most = 0;
        for (let i = 0; i < 60 && !fall.crashed; i++) { fall.speed = 12; tick(fall, 1, 1, 0); if (!fall.crashed) most = Math.max(most, Math.abs(fall.slideAngle)); }
        expect(most).toBeGreaterThan(rad(5));
        expect(fall.crashed).toBe(true);
        expect(fall.slideAngle).toBe(0);
    });

    test('back on the carriageway the slide that is left costs no speed', () => {
        const v = bike(TRAIL, 8, true);
        for (let i = 0; i < 120; i++) { v.speed = 8; tick(v, 1, 1, 0); }
        expect(Math.abs(v.slideAngle)).toBeGreaterThan(rad(15));
        const plain = bike(TRAIL, 8, false);
        for (const k of ['leanAngle', 'leanVelocity', 'handlebarAngle', 'worldThrottle']) plain[k] = v[k];
        v.hold = null;
        v.speed = 8;
        tick(v, 0, 1, 0);
        tick(plain, 0, 1, 0);
        expect(v.slideAngle).not.toBe(0);
        expect(v.speed).toBe(plain.speed);
    });

    test('the drawn rear wheel turns faster than the front in a slide, and only then', () => {
        const spin = (who) => {
            const v = bike(who, 8, true);
            for (let i = 0; i < 120; i++) { v.speed = 8; v.currentDeltaTime = DT; tick(v, 1, 1, 0); }
            return v.rearWheel.rotation.x - v.wheelRotation;
        };
        expect(spin(TRAIL)).toBeGreaterThan(1);
        expect(spin(ROAD_BIKES[0])).toBe(0);
    });
});

describe('the classic legs', () => {
    const RUNOFF = Object.freeze({ drag: 0.35, grip: 0.5, floorSpeed: 6 });
    const leg = who => {
        const v = bike(who, 20, false);
        v.environment = null;
        v.runoff = RUNOFF;
        return v;
    };

    test('a bike with no trait reads the leg\'s own run-off', () => {
        for (const who of ROAD_BIKES) {
            const v = leg(who);
            expect(v.legRunoff()).toBe(RUNOFF);
            expect(v.physicsMultipliers()).toMatchObject({ lateralFriction: 0.5, brakeForce: 0.5, acceleration: 0.5 });
        }
    });

    test('an off-road bike keeps more grip and speed on a leg\'s run-off, in the order of the trait', () => {
        const rows = OFFROAD.map(who => leg(who).legRunoff());
        for (let i = 0; i < rows.length; i++) {
            const worse = i + 1 < rows.length ? rows[i + 1] : RUNOFF;
            expect(rows[i].drag).toBeLessThan(worse.drag);
            expect(rows[i].grip).toBeGreaterThan(worse.grip);
            expect(rows[i].floorSpeed).toBeGreaterThan(worse.floorSpeed);
        }
        expect(leg(TRAIL).physicsMultipliers().lateralFriction).toBeCloseTo(rows[0].grip, 9);
    });
});
