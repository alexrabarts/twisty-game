/**
 * @jest-environment node
 */
// The off-road bikes on a world's land (BIKE_MODELS `offroad`, WorldPhysics.offroad and the power slide). The real
// Vehicle on a flat plane with no road, as tests/unit/world-low-speed.test.js rides it; `land` holds the bike on the
// land (Vehicle.runoff and the time on it, offRoadTime, which checkWallCollision and worldLand set from the drawn road
// in a ride).
//
// ROAD is what the first rider's first bike did before the trait existed (b4ce4de, by the same rides):
// a bike with no trait must still do exactly that, on the land and on the road. The yaw of the three turns (3 s of
// full steering) is the one with the owner's lean rate of 1.50 in the defaults (2026-11-21: the bike is at its lean
// sooner, so it has turned further: 2.212, 3.63 and 3.732 before); the lean they settle at and every speed are the same.
//
// The degrees (WorldPhysics.offroad `top`, `rise`, landCover): what each bike of the real catalogue can do on the
// land (tests/helpers/world-offroad-measure.js), in the order of its trait, and against the same bike at c111f28
// (the game's source of that commit, loaded beside this one), when the trait was one straight line to a cap of
// 6.5 m/s, given 2 s late.
import { describe, test, expect } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { loadGame } from '../helpers/load-game.js';
import { landBike, landTick, paceOn, steepest, sustained, crashSpeed, capability } from '../helpers/world-offroad-measure.js';

const DT = 1 / 60;
const game = loadGame();
const world = game.WorldPhysics;
const rad = d => d * Math.PI / 180;
const TRAIL = ['lucy', 'bike15_crf250'], SINGLE = ['guy', 'bike05_g310gs'], TRIPLE = ['alex', 'bike10_tiger900'], SCRAMBLER = ['guy', 'bike04_scrambler'];
const OFFROAD = [TRAIL, SINGLE, TRIPLE, SCRAMBLER];
// The big adventure tourer: its trait is between the triple's and the scrambler's
const TOURER = ['shane', 'bike16_superadv'];
const ROAD_BIKES = [['steve', 'bike08_xsr900'], ['steve', 'bike13_panigale'], ['tim', 'bike14_forza'], ['shane', 'bike11_duke990'], ['guy', 'bike12_tracer9gt']];
const ROAD = {
    landHold: 3.768, landFrom20: [7.956, 4.053, 3.77], landTurn8: { lean: -0.58, yaw: 2.283 }, landLean42: { at: 0.2, lean: -0.663, yaw: 0.202 },
    roadHold: 52.723, roadFrom20: [24.846, 30.234, 34.792], roadTurn8: { lean: -0.873, yaw: 3.834 }
};
// The trail single on the road before the trait: the carriageway is not the trait's
const TRAIL_ROAD = { roadHold: 47.498, roadFrom20: [24.008, 28.621, 32.584], roadTurn8: { lean: -0.873, yaw: 3.906 } };

function bike([character, model], speed, land, physics = world) {
    const v = new game.Vehicle(new game.THREE.Scene(), null, game.CHARACTERS.find(c => c.id === character), model, { model: false });
    v.environment = {
        physics,
        route: { unitCount: 0, fromUnits: u => u, project: () => ({ index: -1 }), sample: () => ({ grade: 0, flags: {} }) }
    };
    // The bike's own lean limit: how far the rider dares to lean (Vehicle.leanOf) is not what is measured here
    v.leanDare = 1;
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
    test('the five off-road bikes carry it in the catalogue, in order, and no other bike does', () => {
        const trait = id => game.Vehicle.offroadOf(id);
        const [trail, single, triple, scrambler] = OFFROAD.map(([, id]) => trait(id));
        expect(trail).toBe(1);
        expect(trail).toBeGreaterThan(single);
        expect(single).toBeGreaterThan(triple);
        expect(triple).toBeGreaterThan(2 * scrambler);
        expect(scrambler).toBeGreaterThan(0);
        const tourer = trait(TOURER[1]);
        expect(tourer).toBe(0.5);
        expect(tourer).toBeLessThan(triple);
        expect(tourer).toBeGreaterThan(scrambler);
        const others = Object.keys(game.BIKE_MODELS).filter(id => ![...OFFROAD, TOURER].some(([, own]) => own === id));
        expect(others.length).toBe(Object.keys(game.BIKE_MODELS).length - 5);
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
            // And its degree: every measure between the two bikes its trait lies between
            const mine = capability(game, who), more = capability(game, TRIPLE), less = capability(game, SCRAMBLER);
            for (const key of ['grass', 'scree', 'rock', 'forest', 'snow', 'crash']) {
                expect([key, mine[key] < more[key], mine[key] > less[key]]).toEqual([key, true, true]);
            }
            expect(mine.steep).toBeLessThanOrEqual(more.steep);
            expect(mine.steep).toBeGreaterThan(less.steep);
        } finally {
            game.CHARACTERS.pop();
            delete game.BIKE_MODELS[id];
        }
    });

    test('a made-up bike at the top of the scale gets the top bike\'s land values from its trait alone', () => {
        const id = 'bike98_test_top';
        game.BIKE_MODELS[id] = { ...game.BIKE_MODELS.bike12_tracer9gt, id, offroad: 1 };
        const rider = { ...game.CHARACTERS.find(c => c.id === 'guy'), id: 'tester', bikes: [id] };
        game.CHARACTERS.push(rider);
        try {
            const land = { ...bike(['tester', id], 4, true).landValues() };
            const trail = bike(TRAIL, 4, true).landValues();
            for (const key of Object.keys(world.offroad.top)) expect([key, land[key]]).toEqual([key, trail[key]]);
            for (const key of Object.keys(world.offroad.top)) expect([key, land[key]]).toEqual([key, world.offroad.top[key]]);
        } finally {
            game.CHARACTERS.pop();
            delete game.BIKE_MODELS[id];
        }
    });

    test('no bike is named in the land rules: the physics reads the trait and nothing else of the catalogue', () => {
        const dir = new URL('../../js/world/', import.meta.url);
        const files = readdirSync(dir).filter(name => name.endsWith('.js'));
        expect(files.length).toBeGreaterThan(5);
        const ids = Object.keys(game.BIKE_MODELS);
        for (const name of files) {
            const text = readFileSync(new URL(name, dir), 'utf8');
            for (const id of ids) expect([name, id, text.includes(id)]).toEqual([name, id, false]);
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
        expect(trail).toBeLessThan(world.offroad.top.landCapSpeed);
    });

    test('the big adventure tourer holds a speed between the scrambler\'s and the adventure triple\'s, and slides between them', () => {
        const speed = hold(TOURER, true);
        console.log(`speed held on flat land at full throttle (m/s): big adventure tourer ${speed.toFixed(2)}`);
        expect(speed).toBeLessThan(hold(TRIPLE, true));
        expect(speed).toBeGreaterThan(hold(SCRAMBLER, true));
        const slid = turn(TOURER, true);
        expect(slid.crashed).toBe(false);
        expect(slid.slide).toBeGreaterThan(turn(SCRAMBLER, true).slide);
        expect(slid.slide).toBeLessThan(turn(TRIPLE, true).slide);
    });

    test('the pace is the bike\'s at once: no time on the land is waited for', () => {
        const v = bike(TRAIL, 4, true);
        // (the carriageway clears the time on the land: nothing reads it)
        v.offRoadTime = 0;
        const first = { ...v.landValues() };
        v.offRoadTime = 60;
        expect({ ...v.landValues() }).toEqual(first);
        expect(first.landCapSpeed).toBe(world.offroad.top.landCapSpeed);
        // From 4 m/s the trail single is over the old cap inside a second and at 12 m/s inside three
        const seen = [];
        for (let i = 0; i < 180; i++) { tick(v, 0, 1, 0); if ((i + 1) % 60 === 0) seen.push(v.speed); }
        expect(seen[0]).toBeGreaterThan(6.5);
        expect(seen[2]).toBeGreaterThan(12);
    });

    test('arriving on the land at 20 m/s the off-road bikes keep their pace in the order of their trait, and a road bike is slowed as before', () => {
        const run = who => {
            const v = bike(who, 20, true);
            const out = [];
            for (let i = 0; i < 360; i++) { tick(v, 0, 1, 0); if ((i + 1) % 60 === 0) out.push(v.speed); }
            return out;
        };
        const road = run(ROAD_BIKES[0]);
        const rows = OFFROAD.map(run);
        console.log(`from 20 m/s onto the land at full throttle, the speed after 1 to 6 s (m/s): road bike ${road.map(x => x.toFixed(1)).join(' ')}; ${rows.map((row, i) => `${OFFROAD[i][1]} ${row.map(x => x.toFixed(1)).join(' ')}`).join('; ')}`);
        ROAD.landFrom20.forEach((speed, i) => close(road[i], speed));
        for (let at = 0; at < 6; at++) {
            expect(rows[0][at]).toBeGreaterThan(rows[1][at]);
            expect(rows[1][at]).toBeGreaterThan(rows[2][at]);
            expect(rows[2][at]).toBeGreaterThan(rows[3][at]);
            expect(rows[3][at]).toBeGreaterThan(road[at]);
        }
        // The trail single never drops under the pace it holds on grass
        expect(Math.min(...rows[0])).toBeGreaterThan(15);
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

describe('degrees of off-road capability', () => {
    const BEFORE = 'c111f28';
    const show = file => execFileSync('git', ['show', `${BEFORE}:js/${file}`], { encoding: 'utf8', maxBuffer: 1 << 26 });
    const before = loadGame(undefined, [], { 'vehicle.js': show('vehicle.js'), 'world/physics.js': show('world/physics.js') });
    // Every bike of the catalogue with the rider who has it, the most off-road first
    const riders = [];
    for (const c of game.CHARACTERS) for (const id of c.bikes || []) if (!riders.some(r => r[1] === id)) riders.push([c.id, id]);
    const trait = who => game.Vehicle.offroadOf(who[1]);
    const offroad = riders.filter(who => trait(who) > 0).sort((a, b) => trait(b) - trait(a));
    const plain = riders.filter(who => trait(who) === 0);
    const tables = new Map();
    const table = (g, who) => {
        const key = `${g === game ? 'now' : 'before'} ${who[1]}`;
        if (!tables.has(key)) tables.set(key, capability(g, who));
        return tables.get(key);
    };
    const MEASURES = ['grass', 'scree', 'rock', 'forest', 'snow', 'steep', 'sustained', 'crash'];

    test('the catalogue has off-road bikes of several degrees and bikes with none', () => {
        expect(offroad.length).toBeGreaterThanOrEqual(4);
        expect(new Set(offroad.map(trait)).size).toBeGreaterThanOrEqual(4);
        expect(trait(offroad[0])).toBe(1);
        expect(plain.length).toBeGreaterThanOrEqual(8);
    });

    test('by the trait: the pace on open grass, the pace on scree and the steepest bank climbed are in the order of the trait', () => {
        const rows = offroad.map(who => ({ who, t: trait(who), ...table(game, who) }));
        console.log(`now, by trait (m/s on grass, scree, rock, forest, snow; steepest 3 m bank; steepest slope held; crash speed):\n${rows.map(r => `${r.who[1]} ${r.t}: ${MEASURES.map(k => r[k]).join(' ')}`).join('\n')}`);
        for (let i = 1; i < rows.length; i++) {
            const more = rows[i - 1], less = rows[i];
            if (more.t === less.t) continue;
            for (const key of ['grass', 'scree', 'rock', 'forest', 'snow', 'crash']) expect([less.who[1], key, more[key] > less[key]]).toEqual([less.who[1], key, true]);
            expect([less.who[1], 'steep', more.steep >= less.steep]).toEqual([less.who[1], 'steep', true]);
        }
        // Strictly from the least to the most over the whole scale
        expect(rows[0].steep).toBeGreaterThan(rows[rows.length - 1].steep + 0.5);
        // And every one of them past any bike with no trait
        const road = table(game, plain[0]);
        for (const r of rows) for (const key of ['grass', 'scree', 'steep', 'crash']) expect([r.who[1], key, r[key] > road[key]]).toEqual([r.who[1], key, true]);
    });

    test(`each off-road bike is at least what it was at ${BEFORE} in every measure`, () => {
        const lines = [];
        for (const who of offroad) {
            const was = table(before, who), now = table(game, who);
            lines.push(`${who[1]} ${trait(who)}: ${MEASURES.map(k => `${k} ${was[k]} -> ${now[k]}`).join(', ')}`);
            for (const key of MEASURES) expect([who[1], key, now[key] >= was[key]]).toEqual([who[1], key, true]);
            // What its tyres hold and put down, value by value
            const old = landBike(before, who), mine = landBike(game, who);
            const a = { ...old.landValues() }, b = { ...mine.landValues() };
            for (const key of ['landTraction', 'landBrakeGrip', 'landGrip', 'landCapSpeed']) expect([who[1], key, b[key] >= a[key] - 1e-9]).toEqual([who[1], key, true]);
            for (const key of ['landRoll', 'landDrag']) expect([who[1], key, b[key] <= a[key] + 1e-9]).toEqual([who[1], key, true]);
        }
        console.log(`${BEFORE} -> now:\n${lines.join('\n')}`);
    });

    test(`every bike with no trait is what it was at ${BEFORE} in every measure, to the last digit`, () => {
        // (the whole table for the first three, which are of three classes; the pace and the crash speed for all)
        for (const who of plain.slice(0, 3)) expect([who[1], table(game, who)]).toEqual([who[1], table(before, who)]);
        for (const who of plain) {
            for (const cover of [5, 4, 1]) expect([who[1], cover, paceOn(game, who, cover)]).toEqual([who[1], cover, paceOn(before, who, cover)]);
            expect(crashSpeed(game, who)).toBe(crashSpeed(before, who));
            expect(landBike(game, who).landValues()).toBe(world);
            // The same ride, step for step: 6 s from 20 m/s on the land at full throttle, on rock, up a slope of 0.3
            const a = landBike(before, who, { speed: 20, slope: 0.3, cover: 3 }), b = landBike(game, who, { speed: 20, slope: 0.3, cover: 3 });
            // The numbers of the owner's tuning (2026-11-21) are today's in both: the comparison is of the land's rule
            a.environment.physics = Object.freeze({ ...before.WorldPhysics, leanRate: world.leanRate, trailBrakeFloor: world.trailBrakeFloor });
            a.brakeForce = b.brakeForce;
            a.steeringForce = b.steeringForce;
            for (let i = 0; i < 360; i++) { landTick(a, 0.2, 1, 0); landTick(b, 0.2, 1, 0); }
            expect([who[1], b.speed, b.leanAngle, b.yawAngle, b.crashed]).toEqual([who[1], a.speed, a.leanAngle, a.yawAngle, a.crashed]);
        }
        // The world's own land values are the ones of that commit
        for (const key of Object.keys(before.WorldPhysics).filter(k => k.startsWith('land') && typeof before.WorldPhysics[k] === 'number')) {
            expect([key, world[key]]).toEqual([key, before.WorldPhysics[key]]);
        }
    });

    test('the top bike rides open ground at a real pace: fast on grass, slower on scree and rock, slow in forest', () => {
        const top = offroad[0];
        const row = table(game, top);
        expect(row.grass).toBeGreaterThanOrEqual(12);
        expect(row.grass).toBeLessThanOrEqual(18);
        expect(row.scree).toBeGreaterThanOrEqual(10);
        expect(row.scree).toBeLessThan(row.grass - 2);
        expect(row.rock).toBeLessThan(row.scree);
        expect(row.snow).toBeLessThan(row.scree);
        expect(row.forest).toBeLessThan(row.rock);
        expect(row.forest).toBeGreaterThan(table(before, top).forest);
        // Every cover class the tile data can hold has a row, and none gives more than open grass
        expect(world.landCover.length).toBe(9);
        for (const cover of world.landCover) {
            expect(cover.pace).toBeGreaterThanOrEqual(0);
            expect(cover.pace).toBeLessThanOrEqual(1);
            expect(cover.on.length).toBeGreaterThan(5);
        }
    });

    test('no "too fast" crash at a pace the bike is built for: held flat out for 30 s on every cover, no off-road bike crashes', () => {
        for (const who of offroad) {
            for (let cover = 0; cover < world.landCover.length; cover++) {
                const v = landBike(game, who, { speed: 4, cover });
                let most = 0;
                for (let i = 0; i < 1800 && !v.crashed; i++) { landTick(v, 0, 1, 0); most = Math.max(most, v.speed); }
                expect([who[1], cover, v.crashed]).toEqual([who[1], cover, false]);
                expect(most).toBeLessThan(crashSpeed(game, who) - 2);
            }
        }
        // Over its crash speed for landCrashS it still falls, and the cause names the ground
        const top = offroad[0];
        expect(crashSpeed(game, top)).toBe(world.offroad.top.landCrashSpeed);
        expect(crashSpeed(game, plain[0])).toBe(world.landCrashSpeed);
    });

    test('the slope takes speed, not the bike: the pace falls as the slope rises, with no crash under the bike\'s own limit', () => {
        const top = offroad[0];
        const land = landBike(game, top).landValues();
        const limit = land.landSteepSlope;
        expect(limit).toBe(world.offroad.top.landSteepSlope);
        expect(limit).toBeGreaterThan(world.landSteepSlope + 0.5);
        // Across a slope (the land steep, the bike's own way level): the pace falls from the grass pace to the least
        const across = [];
        for (let slope = 0; slope <= limit + 1e-9; slope += 0.1) {
            const v = landBike(game, top, { speed: 4 });
            v.slope = 0;
            for (let i = 0; i < 900 && !v.crashed; i++) {
                landTick(v, 0, 1, 0);
                v.landSteep = slope;
            }
            // (landTick sets the slope it climbs; here the land's steepness is given apart from it)
            const u = landBike(game, top, { speed: 4 });
            for (let i = 0; i < 900 && !u.crashed; i++) {
                u.runoff = u.hold;
                u.landAlong = 0;
                u.landSteep = slope;
                u.landCover = 0;
                u.update(1 / 60, 0, 1, 0, 0);
            }
            expect([slope, u.crashed]).toEqual([slope, false]);
            across.push(u.speed);
        }
        console.log(`the top bike across a slope (m/s at slope 0, 0.1, ...): ${across.map(x => x.toFixed(1)).join(' ')}`);
        for (let i = 1; i < across.length; i++) expect(across[i]).toBeLessThanOrEqual(across[i - 1] + 1e-9);
        expect(across[0]).toBeGreaterThan(15);
        expect(across[across.length - 1]).toBeGreaterThan(6);
        expect(across[across.length - 1]).toBeLessThan(7);
        // Straight up: slower with every step of the slope, and it stalls before it crashes
        const up = [];
        for (let slope = 0; slope <= limit + 1e-9; slope += 0.1) up.push(paceOn(game, top, 0, slope));
        for (let i = 1; i < up.length; i++) expect(up[i]).toBeLessThanOrEqual(up[i - 1] + 1e-9);
        expect(up[5]).toBeGreaterThan(8);
        // Straight down with the throttle shut, to its limit: it does not run away to its crash speed
        for (let slope = 0.2; slope <= limit + 1e-9; slope += 0.2) {
            const v = landBike(game, top, { speed: 8, slope: -slope });
            let most = 0;
            for (let i = 0; i < 1200 && !v.crashed; i++) { landTick(v, 0, 0, 0); most = Math.max(most, v.speed); }
            expect([slope, v.crashed]).toEqual([slope, false]);
            expect(most).toBeLessThan(land.landCrashSpeed);
        }
        // Past its limit for landSteepS it falls, as every bike does past its own
        const over = landBike(game, top, { speed: 10, slope: limit + 0.1 });
        for (let i = 0; i < 60 && !over.crashed; i++) landTick(over, 0, 1, 0);
        expect(over.crashed).toBe(true);
        expect(over.crashCause).toBe('Rode onto a slope too steep to hold');
        // What it climbs: a bank 3 m high at over 1 in 1, and a slope without end at about 1 in 1
        expect(steepest(game, top)).toBeGreaterThan(1.2);
        expect(sustained(game, top)).toBeGreaterThanOrEqual(0.85);
        expect(steepest(game, plain[0])).toBeLessThan(0.5);
    });

    test('the drawn bike shows the ground: rougher on rock and scree, and the rider of an off-road bike stands on the pegs', () => {
        const most = (who, cover) => {
            const v = landBike(game, who, { speed: 8, cover });
            let bump = 0;
            for (let i = 0; i < 600; i++) { v.speed = 8; landTick(v, 0, 1, 0); bump = Math.max(bump, Math.abs(v.group.position.y - v.position.y)); }
            return { bump, stand: v.riderStandFactor };
        };
        const top = offroad[0];
        const grass = most(top, 5), rock = most(top, 3), scree = most(top, 4);
        expect(rock.bump).toBeGreaterThan(scree.bump);
        expect(scree.bump).toBeGreaterThan(grass.bump * 1.3);
        expect(grass.stand).toBeCloseTo(world.landStand, 2);
        // A road bike's rider sits, and its bump is the world's own on every cover
        const road = most(plain[0], 5), roadRock = most(plain[0], 3);
        expect(road.stand).toBe(0);
        expect(roadRock.bump).toBe(road.bump);
        // On the road nobody stands
        const v = landBike(game, top, { speed: 8 });
        v.hold = null;
        for (let i = 0; i < 120; i++) { v.runoff = null; v.update(1 / 60, 0, 1, 0, 0); }
        expect(v.riderStandFactor).toBe(0);
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
