/**
 * @jest-environment node
 */
// The steer keys of a world ride are eased (SteerEase in js/input.js, WorldPhysics.steerKeys). A key is on or off and
// the world's bike leans at a rate set by the steering, so a rider who tapped a key to hold a line made the lean rock:
// full rate in, the self-righting out. The real Vehicle on a flat plane (as tests/unit/bike-counter-steer.test.js),
// steered by keys through the real SteerEase, against the same keys through the smoothing it replaces.
import { describe, test, expect } from '@jest/globals';
import { loadGame, loadScript } from '../helpers/load-game.js';

const DT = 1 / 60;
const SUB = 16;
const DEG = 180 / Math.PI;
const game = loadGame();
// The rides here are held against commits from before the rider's weight (RIDER_MASS, Vehicle.pairOf), or measure
// the bike alone: every character rides at the reference weight, at which that rule moves nothing to the last bit
// (tests/unit/rider-mass.test.js holds the rule itself)
for (const character of game.CHARACTERS) delete character.kg;
const { Vehicle } = game;
const EASE = game.WorldPhysics.steerKeys;
const clock = { now: 0 };
const handlers = {};
const { SteerEase, InputHandler } = new Function('document', 'window', 'performance', `${loadScript('input.js')}\nreturn { SteerEase, InputHandler };`)(
    { addEventListener: (name, handler) => { handlers[name] = handler; } },
    { addEventListener() {} },
    { now: () => clock.now }
);

// Measured at 50dc816 (the keys through InputHandler's steeringSmoothing, 60 frames a second, 20 m/s): seconds from
// a key pressed on an upright bike to a lean of 20 and of 40 degrees, and from a key changed for the other at the
// full lean (50 degrees) to 20 and 40 degrees the other way. The same commit, keys tapped for 3 s: the lean rocked
// by 3.5 to 6.2 degrees and the drawn bar by 3.2 to 4.7: 0.361, 0.665, 0.829 and 1.133 s.
// With the owner's tuning of 2026-11-21 in the defaults (a lean rate of 1.50, and a lean limit of 54 degrees for this
// rider: .agent/system/handling.md, "The defaults") the same keys through the same smoothing give the times below, and
// tapped keys rock the lean by 5.3 to 6.2 degrees and the bar by 4.8 to 5.2
const BEFORE = { to20: 0.260, to40: 0.462, flick20: 0.599, flick40: 0.802 };

// The lean limit of the rider these tests ride as: the bike's by how daring the rider is (Vehicle.leanOf)
const CAP_DEG = game.WorldPhysics.leanCapDeg * Vehicle.leanOf(game.CHARACTERS[0]);

function bike(speed) {
    const v = new Vehicle(new game.THREE.Scene(), null, game.CHARACTERS[0], undefined, { model: false });
    v.environment = {
        physics: game.WorldPhysics,
        route: { unitCount: 0, fromUnits: u => u, project: () => ({ index: -1 }), sample: () => ({ grade: 0, flags: {} }) }
    };
    v.speed = speed;
    return v;
}
// The keys through SteerEase, with a key change at its own time inside a frame (InputHandler moves the ease on at
// each key event)
function eased(ease = EASE) {
    const steer = new SteerEase();
    return (key, from) => {
        for (let j = 0; j < SUB; j++) {
            steer.turn(key(from + j * DT / SUB), ease);
            steer.advance(DT / SUB);
        }
        return steer.value;
    };
}
// The keys as they were: read once a frame, smoothed by steeringSmoothing (0.4 of the way each 60th of a second)
function smoothed() {
    let value = 0;
    return (key, from) => (value += (key(from + DT - 1e-6) - value) * 0.4);
}
// Rides `v` for `seconds` with the speed held; key(t) is -1, 0 or 1. The lean and the drawn bar in degrees after each frame
function ride(v, steer, key, seconds, speed = v.speed) {
    const rows = [];
    for (let i = 0; i < Math.round(seconds * 60); i++) {
        v.speed = speed;
        v.update(DT, steer(key, i * DT), 0.3, 0, 0);
        rows.push({ t: (i + 1) * DT, lean: v.leanAngle * DEG, bar: v.barState.shown * DEG });
    }
    return rows;
}
const tapped = (on, off) => t => ((t + 1e-9) % (on + off) < on ? 1 : 0);
// Peak to peak over the last second, with the straight trend taken out (the mean lean is still creeping in)
function ripple(rows, field) {
    const last = rows.slice(-60);
    const mean = key => last.reduce((sum, row) => sum + row[key], 0) / last.length;
    const t0 = mean('t'), y0 = mean(field);
    let above = 0, below = 0;
    for (const row of last) {
        above += (row.t - t0) * (row[field] - y0);
        below += (row.t - t0) ** 2;
    }
    const rest = last.map(row => row[field] - y0 - above / below * (row.t - t0));
    return Math.max(...rest) - Math.min(...rest);
}
// The time the field first crosses `level`, between frames
function crossing(rows, field, level) {
    for (let i = 1; i < rows.length; i++) {
        const a = rows[i - 1][field], b = rows[i][field];
        if (a !== b && (a - level) * (b - level) <= 0) return rows[i - 1].t + (level - a) / (b - a) * DT;
    }
    return NaN;
}

describe('SteerEase', () => {
    test('a held key ramps to full steering in keyS, and a change of key to the other side in keyS', () => {
        const steer = new SteerEase();
        steer.turn(1, EASE);
        steer.advance(EASE.keyS / 2);
        expect(steer.value).toBeCloseTo(0.5, 12);
        steer.advance(EASE.keyS / 2);
        expect(steer.value).toBe(1);
        steer.advance(1);
        steer.turn(-1, EASE);
        steer.advance(EASE.keyS / 2);
        expect(steer.value).toBeCloseTo(0, 12);
        steer.advance(EASE.keyS / 2);
        expect(steer.value).toBe(-1);
    });

    test('the third change of the keys in a row within featherGapS, and each after it, ramps over featherS', () => {
        const steer = new SteerEase();
        const overs = [];
        for (const [key, wait] of [[1, 0.08], [0, 0.08], [1, 0.08], [0, 0.08], [1, 0.5], [0, 0.08], [1, 0.08], [0, 0.08]]) {
            steer.turn(key, EASE);
            overs.push(steer.ramps[steer.ramps.length - 1].over);
            steer.advance(wait);
        }
        const { keyS: k, featherS: f } = EASE;
        // After the 0.5 s hold the rider is not tapping: the next two changes are plain again
        expect(overs).toEqual([k, k, f, f, f, k, k, f]);
        // The longest ramp is over before a change can be plain again, so the steering never passes the keys
        expect(EASE.featherGapS).toBeGreaterThan(EASE.featherS);
    });

    test('a press gives the steering of its own length, whatever the ramps: the lean a tap gives does not depend on them', () => {
        for (const taps of [1, 2, 5]) {
            const steer = new SteerEase();
            let sum = 0;
            const step = 1 / 4800;
            const key = t => (t < taps * 0.15 && t % 0.15 < 0.05 - 1e-9 ? 1 : 0);
            for (let i = 0; i < 4800 * 1.5; i++) {
                steer.turn(key(i * step), EASE);
                steer.advance(step);
                sum += steer.value * step;
            }
            expect(steer.value).toBe(0);
            expect(sum).toBeCloseTo(taps * 0.05, 3);
        }
    });

    test('the steering never passes the keys, and moves with no step', () => {
        let seed = 11;
        const random = () => (seed = seed * 16807 % 2147483647) / 2147483647;
        const steer = new SteerEase();
        let last = 0;
        for (let i = 0; i < 400; i++) {
            steer.turn(Math.floor(random() * 3) - 1, EASE);
            const wait = 0.01 + random() * (i % 7 ? 0.12 : 0.6);
            for (let t = 0; t < wait; t += 0.001) {
                steer.advance(0.001);
                expect(Math.abs(steer.value)).toBeLessThanOrEqual(1);
                // Two ramps of 2 over keyS at once at the most
                expect(Math.abs(steer.value - last)).toBeLessThan(2 * 2 * 0.001 / EASE.keyS + 1e-9);
                last = steer.value;
            }
        }
    });
});

describe('tapped keys hold a lean that does not rock', () => {
    test.each([[0.08, 0.08, 15], [0.08, 0.08, 25], [0.12, 0.06, 15], [0.12, 0.06, 25]])('%f s on, %f s off at %i m/s', (on, off, speed) => {
        const rows = ride(bike(speed), eased(), tapped(on, off), 3);
        const before = ride(bike(speed), smoothed(), tapped(on, off), 3);
        // Without the ease: 5.3 to 6.2 degrees of lean and 4.8 to 5.2 of the bar. With it 0.6 to 1.7 of lean (under
        // 0.6 before the lean rate of 1.50: the rock grows with the rate) and 0.1 to 0.6 of the bar
        expect(ripple(before, 'lean')).toBeGreaterThan(3);
        expect(ripple(before, 'bar')).toBeGreaterThan(3);
        expect(ripple(rows, 'lean')).toBeLessThan(2);
        expect(ripple(rows, 'lean')).toBeLessThan(ripple(before, 'lean') / 3);
        expect(ripple(rows, 'bar')).toBeLessThan(1.5);
        // A lean into the turn is held: the bike is neither upright nor on its limit
        const held = -rows.slice(-60).reduce((sum, row) => sum + row.lean, 0) / 60;
        expect(held).toBeGreaterThan(20);
        expect(held).toBeLessThan(CAP_DEG - 1.5);
    });

    test('shorter taps hold less lean, so the taps set the line', () => {
        const held = (on, off) => -ride(bike(20), eased(), tapped(on, off), 4).slice(-60).reduce((sum, row) => sum + row.lean, 0) / 60;
        const light = held(0.05, 0.1), half = held(0.08, 0.08), heavy = held(0.12, 0.06);
        // 21, 49 and 51 degrees (14, 36 and 48 before the lean rate of 1.50): taps of half the time now hold the bike
        // within 6 degrees of its limit, so the line is set by taps of a third of the time or less
        expect(light).toBeGreaterThan(5);
        expect(half).toBeGreaterThan(light + 8);
        expect(heavy).toBeGreaterThan(half + 1);
        expect(heavy).toBeLessThan(CAP_DEG - 1.5);
    });

    test('a gap of 60 to 100 ms between taps does not start a swing back', () => {
        // The most the lean comes back toward upright (a rise: the lean is negative) around one gap in a run of taps
        const swing = (steer, gap) => {
            const v = bike(20);
            ride(v, steer, tapped(0.08, 0.08), 1.6);
            let low = v.leanAngle * DEG, back = 0;
            // 1.6 s is the end of a gap: one more tap, this gap, then the taps again
            const rows = ride(v, steer, t => (t < 0.08 || (t >= 0.08 + gap && (t - 0.08 - gap) % 0.16 < 0.08) ? 1 : 0), 0.4);
            for (const row of rows) {
                low = Math.min(low, row.lean);
                back = Math.max(back, row.lean - low);
            }
            return back;
        };
        for (const gap of [0.06, 0.08, 0.1]) {
            const before = swing(smoothed(), gap), now = swing(eased(), gap);
            // Without the ease 3.6, 3.6 and 5.2 degrees; with it 0, 0 and 1.3 (the longer gap is less steering, so less lean)
            expect(before).toBeGreaterThan(1.5);
            expect(now).toBeLessThan(1.5);
            expect(now).toBeLessThan(before / 3);
        }
    });

    test('a short tap gives a small change of lean with no step, and the bike stands up again', () => {
        const v = bike(20);
        const rows = ride(v, eased(), t => (t < 0.05 ? 1 : 0), 2);
        const peak = -Math.min(...rows.map(row => row.lean));
        expect(peak).toBeGreaterThan(1.5);
        // 3.8 degrees (2.5 before the lean rate of 1.50)
        expect(peak).toBeLessThan(4.5);
        let worst = Math.abs(rows[0].lean);
        for (let i = 1; i < rows.length; i++) worst = Math.max(worst, Math.abs(rows[i].lean - rows[i - 1].lean));
        // The full lean rate is 1.65 degrees a frame
        expect(worst).toBeLessThan(0.9);
        expect(Math.abs(rows[rows.length - 1].lean)).toBeLessThan(0.1);
    });
});

describe('a held key, a flick and a release answer as before', () => {
    const run = (steer) => {
        const v = bike(20);
        const held = ride(v, steer, () => 1, 3);
        const flick = ride(v, steer, () => -1, 3);
        return { to20: crossing(held, 'lean', -20), to40: crossing(held, 'lean', -40), full: held[held.length - 1].lean, flick20: crossing(flick, 'lean', 20), flick40: crossing(flick, 'lean', 40) };
    };

    test('the pinned times are the old smoothing\'s', () => {
        const before = run(smoothed());
        for (const key of Object.keys(BEFORE)) expect(before[key]).toBeCloseTo(BEFORE[key], 3);
    });

    test('the time to 20 and to 40 degrees and the flick are within 10% of them, and a held key still reaches the full lean', () => {
        const now = run(eased());
        for (const key of Object.keys(BEFORE)) {
            expect(now[key]).toBeGreaterThan(BEFORE[key] * 0.9);
            expect(now[key]).toBeLessThan(BEFORE[key] * 1.1);
        }
        expect(now.full).toBeCloseTo(-CAP_DEG, 1);
    });

    test('a flick in the middle of tapping is no more than 10% slower', () => {
        const v = bike(20), steer = eased();
        ride(v, steer, () => 1, 3);
        // Tapping at the full lean, then the other key
        ride(v, steer, tapped(0.12, 0.04), 0.48);
        const flick = ride(v, steer, () => -1, 3);
        expect(crossing(flick, 'lean', 20)).toBeLessThan(BEFORE.flick20 * 1.1);
        expect(crossing(flick, 'lean', 40)).toBeLessThan(BEFORE.flick40 * 1.1);
    });

    test('letting go rights the bike as fast: after a hold, and after tapping', () => {
        const release = (steer, key, seconds) => {
            const v = bike(20);
            ride(v, steer, key, seconds);
            const at = v.leanAngle * DEG;
            const rows = ride(v, steer, () => 0, 4);
            return { at, half: crossing(rows, 'lean', at / 2), up: crossing(rows, 'lean', -2), end: rows[rows.length - 1].lean };
        };
        const before = release(smoothed(), () => 1, 0.5);
        const now = release(eased(), () => 1, 0.5);
        expect(now.at).toBeCloseTo(before.at, 0);
        expect(now.half).toBeLessThan(before.half * 1.1);
        expect(now.up).toBeLessThan(before.up * 1.1);
        expect(Math.abs(now.end)).toBeLessThan(0.1);
        // The last release of a run of taps is a featherS ramp: the bike is upright within 10% more time than the hold's
        const taps = release(eased(), tapped(0.08, 0.08), 1.52);
        expect(-taps.at).toBeGreaterThan(15);
        expect(taps.up).toBeLessThan(before.up * 1.1);
        expect(Math.abs(taps.end)).toBeLessThan(0.1);
    });
});

describe('InputHandler', () => {
    const press = (code, at) => { clock.now = at; handlers.keydown({ code }); };
    const release = (code, at) => { clock.now = at; handlers.keyup({ code }); };
    const frame = (input, at, ease) => { clock.now = at; return input.getSteeringInput(ease); };
    // Frames at 60 a second up to `at` ms
    const frames = (input, at, ease) => {
        let value;
        for (let t = clock.now + 1000 / 60; t < at; t += 1000 / 60) value = frame(input, t, ease);
        return value;
    };

    test('on a world ride the keys are eased, and a key event counts from its own time, not from the frame', () => {
        clock.now = 1000;
        const input = new InputHandler();
        expect(frame(input, 1000, EASE)).toBe(0);
        // Pressed 5 ms after a frame: 11.67 ms of the ramp are done at the next
        press('KeyA', 1005);
        expect(frame(input, 1000 + 1000 / 60, EASE)).toBeCloseTo((1000 / 60 - 5) / 1000 / EASE.keyS, 9);
        expect(frames(input, 1005 + EASE.keyS * 1000 + 20, EASE)).toBe(1);
        // D over A: the other way
        frames(input, 2000, EASE);
        press('KeyD', 2000);
        expect(frame(input, 2000 + EASE.keyS * 500, EASE)).toBeCloseTo(0, 9);
        frames(input, 2500, EASE);
        release('KeyD', 2500);
        release('KeyA', 2500);
        expect(frames(input, 2600, EASE)).toBe(0);
    });

    test('on a classic leg the steering is smoothed as it was, and a change of ride starts the ease from rest', () => {
        clock.now = 5000;
        const input = new InputHandler();
        frame(input, 5000);
        press('KeyA', 5001);
        expect(frame(input, 5000 + 1000 / 60)).toBeCloseTo(0.4, 9);
        expect(frame(input, 5000 + 2000 / 60)).toBeCloseTo(0.64, 9);
        // The key is still down when a world ride starts: the ramp starts there
        frames(input, 6000);
        expect(frame(input, 6000, EASE)).toBe(0);
        expect(frame(input, 6000 + EASE.keyS * 500, EASE)).toBeCloseTo(0.5, 9);
    });

    test('a stall counts as a tenth of a second', () => {
        clock.now = 9000;
        const input = new InputHandler();
        frame(input, 9000, EASE);
        press('KeyA', 9001);
        release('KeyA', 9002);
        // A minute hidden: the 1 ms tap's ramps are not held open, and nothing is left of it
        expect(frame(input, 69000, EASE)).toBe(0);
        expect(input.steerEase.ramps.length).toBe(0);
    });
});
