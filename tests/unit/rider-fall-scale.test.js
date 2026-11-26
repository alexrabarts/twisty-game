/**
 * @jest-environment node
 */
// The rider's fall is a function of the crash's own numbers (Vehicle.riderCrash, riderFallRow, riderFallNumbers).
// Before, each kind had one fixed throw: under 4 m/s every crash was the tip-over, thrown 4 m/s to the side however
// slow it was, and over it the kind's whole throw (a highside at 4.1 m/s rose 0.43 m); the keys played faster the
// slower the crash. Here, on a flat plane, every number is read from what is drawn (tests/helpers/rider-fall.js):
//   - the launch speed and the slide rise with the crash speed, for every kind
//   - at 5 m/s the rider moves little against the bike and hardly rises
//   - 3.9 and 4.1 m/s fall alike
//   - the lean, the thing hit and the ground change the fall as the tables say, and the row is picked by rule
// The real stage is tests/unit/world-rider-fall-variety.test.js.
import { describe, test, expect } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';
import { DT, bikeAt, poseOf, crashAndWatch } from '../helpers/rider-fall.js';

const game = loadGame();
const { Vehicle } = game;
const RULE = Vehicle.RIDER_FALL, FALLS = Vehicle.RIDER_FALLS;
// A cause class for each kind, as the game raises it
const CLASS = { lowside: 'grip', highside: 'rear', front: 'wall', drop: 'drop', tip: 'stall' };
// At 5 m/s: the most the rider moves against the bike (m/s) and rises over where he sat (m)
const SLOW = 5, SLOW_REL = 2.5, SLOW_RISE = 0.05;
const DEG = Math.PI / 180;

// A crash on the flat plane, measured: launch (m/s, as he leaves), T (the keys' time), rel (the most he moves
// against the bike in the first 2 s, m/s), start (his lowest point over the bike's ground as he leaves), rise (the
// most his middle goes over where he sat), slid (how far he went), pitch (the most his body is pitched, degrees),
// poses (each frame's drawn parts) and the row
function measure(why, speed, { side = 1, lean = 0.5, seconds = 5, setup = null, poses = false } = {}) {
    const v = bikeAt(game, { speed });
    if (setup) setup(v);
    let launch = null, row = null, T = null, start = null, pitch = -Infinity;
    const drawn = [];
    const frames = crashAndWatch(game, v, {
        why, side, lean, seconds, each: (f, bike) => {
            const rf = bike.riderFall;
            if (launch === null) { launch = rf.v.length(); row = rf.row; T = rf.T; start = rf.p.y - bike.position.y; }
            pitch = Math.max(pitch, rf.pose[0]);
            if (poses) drawn.push(poseOf(bike).flat(2));
        }
    });
    const y0 = frames[0].y;
    let rel = 0, rise = -Infinity;
    for (let i = 1; i < frames.length; i++) {
        const a = frames[i - 1], b = frames[i];
        if (b.t < 2) rel = Math.max(rel, Math.hypot((b.x - a.x) - (b.bike[0] - a.bike[0]), (b.z - a.z) - (b.bike[2] - a.bike[2])) / DT);
        rise = Math.max(rise, b.y - y0);
    }
    const last = frames[frames.length - 1];
    return { v, launch, row, T, start, rel, rise, pitch, slid: Math.hypot(last.x - frames[0].x, last.z - frames[0].z), gap: last.gap, frames, poses: drawn };
}

describe('the fall scales with the speed', () => {
    const SPEEDS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13.9, 14.1, 16, 18, 20, 24, 28, 34, 40];

    test('the launch speed and the slide rise with the crash speed, for every kind', () => {
        const table = {};
        for (const [kind, why] of Object.entries(CLASS)) {
            const runs = SPEEDS.map(speed => measure(why, speed));
            table[kind] = runs.map(r => `${r.launch.toFixed(1)}/${r.slid.toFixed(1)}`).join(' ');
            for (let i = 1; i < runs.length; i++) {
                const tag = `${kind} ${SPEEDS[i - 1]} to ${SPEEDS[i]} m/s (${runs[i - 1].row} to ${runs[i].row})`;
                expect([tag, runs[i].launch >= runs[i - 1].launch - 1e-9]).toEqual([tag, true]);
                expect([tag, runs[i].slid >= runs[i - 1].slid - 1e-6]).toEqual([tag, true]);
            }
            // And it is the speed that does it: much further at 40 than at 2
            expect(runs[runs.length - 1].slid).toBeGreaterThan(runs[0].slid + 8);
        }
        console.log(`launch m/s / slide m at ${SPEEDS.join(', ')} m/s:\n${Object.entries(table).map(([k, t]) => `${k}: ${t}`).join('\n')}`);
    });

    test('a slow crash is a slow topple: at 5 m/s he moves little against the bike and hardly rises, and the keys play longer', () => {
        const seen = [];
        for (const [kind, why] of Object.entries(CLASS)) {
            const slow = measure(why, SLOW), fast = measure(why, 28);
            seen.push(`${kind} (${slow.row}): ${slow.rel.toFixed(2)} m/s, ${slow.rise.toFixed(3)} m, ${slow.T.toFixed(2)} s against ${fast.T.toFixed(2)} s at 28`);
            expect([kind, slow.rel < SLOW_REL]).toEqual([kind, true]);
            expect([kind, slow.rise < SLOW_RISE]).toEqual([kind, true]);
            expect([kind, slow.T > fast.T]).toEqual([kind, true]);
        }
        console.log(`at ${SLOW} m/s:\n${seen.join('\n')}`);
    });

    test('no step at the old 4 m/s: 3.9 and 4.1 m/s fall alike in every number and every frame', () => {
        for (const [kind, why] of Object.entries(CLASS)) {
            const a = measure(why, 3.9, { poses: true }), b = measure(why, 4.1, { poses: true });
            expect([kind, a.row]).toEqual([kind, b.row]);
            const gaps = { launch: Math.abs(a.launch - b.launch), T: Math.abs(a.T - b.T), rel: Math.abs(a.rel - b.rel), rise: Math.abs(a.rise - b.rise), slid: Math.abs(a.slid - b.slid), gap: Math.abs(a.gap - b.gap) };
            const bounds = { launch: 0.3, T: 0.05, rel: 0.2, rise: 0.02, slid: 0.3, gap: 0.3 };
            for (const name of Object.keys(bounds)) expect([kind, name, gaps[name] < bounds[name]]).toEqual([kind, name, true]);
            // Frame by frame, no drawn part is far from its place in the other
            let worst = 0;
            for (let i = 0; i < a.poses.length; i++) for (let j = 0; j < a.poses[i].length; j++) worst = Math.max(worst, Math.abs(a.poses[i][j] - b.poses[i][j]));
            expect([kind, worst < 0.25]).toEqual([kind, true]);
            const path = Math.max(...a.frames.map((f, i) => Math.hypot(f.x - b.frames[i].x, f.y - b.frames[i].y, f.z - b.frames[i].z)));
            expect([kind, path < 0.3]).toEqual([kind, true]);
        }
    });

    test('a slow crash goes over to its kind by calmTo: all calm at walking pace, none from calmTo, smooth between', () => {
        const crash = { speed: 0, lean: 30, closing: 0, into: 1, bank: 0, grade: 0 };
        const share = (speed) => Vehicle.riderFallNumbers(FALLS.lowside, FALLS.tip, { ...crash, speed }, {}).calm;
        expect(share(RULE.calmFrom)).toBe(1);
        expect(share(RULE.calmTo)).toBe(0);
        let last = 1;
        for (let speed = RULE.calmFrom; speed <= RULE.calmTo; speed += 0.05) {
            const now = share(speed);
            expect(now).toBeLessThanOrEqual(last + 1e-12);
            expect(last - now).toBeLessThan(0.02);
            last = now;
        }
        // The throw is nothing at walking pace
        const walk = Vehicle.riderFallNumbers(FALLS.highside, FALLS.tip, { ...crash, speed: RULE.walkSpeed }, {});
        expect(walk.out).toBe(0);
        expect(walk.lift).toBe(0);
    });
});

describe('the lean, the thing hit and the ground', () => {
    test('a lowside at 45 degrees starts near the ground and slides long; at 20 degrees he falls further and goes less far', () => {
        // The bike drawn at its lean before the crash, as a real ride has it
        const run = (deg) => measure('grip', 16, { lean: deg * DEG, setup: (v) => { v.leanAngle = deg * DEG; v.updateMesh(); } });
        const deep = run(45), shallow = run(20);
        expect([deep.row, shallow.row]).toEqual(['lowside', 'lowside']);
        // His lowest point as he leaves the seat: nearer the ground on the bike leaned further
        expect(deep.start).toBeLessThan(shallow.start);
        // Less of a throw to the side, and less friction: a short drop and a long slide
        const n = (lean) => Vehicle.riderFallNumbers(FALLS.lowside, FALLS.tip, { speed: 16, lean, closing: 16, into: 1, bank: 0, grade: 0 }, {});
        expect(n(45).out).toBeLessThan(n(20).out * 0.5);
        expect(n(45).drag).toBeLessThan(n(20).drag);
        expect(deep.slid).toBeGreaterThan(shallow.slid + 1);
        const off = (r) => Math.abs(r.frames[r.frames.length - 1].x);
        expect(off(deep)).toBeLessThan(off(shallow));
    });

    test('a front hit under the closing bound is not over the bars: onto the tank and down to the side', () => {
        // A thing 3 m ahead, hit square
        const ahead = (v) => v.blockRider(0, 3.5, 1);
        for (const speed of [3, 5, 6.5]) {
            const r = measure('wall', speed, { setup: ahead });
            expect([speed, r.row]).toEqual([speed, 'slump']);
            // Never pitched past lying forward, and never up over the seat
            expect([speed, r.pitch < 90]).toEqual([speed, true]);
            expect([speed, r.rise < 0.1]).toEqual([speed, true]);
            // and he never goes past the face of what was hit
            for (const f of r.frames) expect(f.z).toBeLessThan(3.5 - 1);
        }
        // Over the bound he goes over the bars: a forward roll, up over the seat
        const over = measure('wall', 9, { setup: ahead });
        expect(over.row).toBe('front');
        expect(over.pitch).toBeGreaterThan(180);
        expect(over.rise).toBeGreaterThan(measure('wall', 6.5, { setup: ahead }).rise + 0.05);
    });

    test('a glancing hit slides along the face: he loses his speed into it and goes on beside it', () => {
        // A wall along the bike's left (x = 1.2 m), met at 15 degrees: its normal points to -x
        const glancing = (v) => { v.yawAngle = 15 * DEG; v.hitFrom(-1, 0); };
        const r = measure('wall', 20, { side: 1, setup: glancing });
        expect(r.row).toBe('glance');
        const rf = r.v.riderFall;
        expect(rf.crash.into).toBeCloseTo(Math.sin(15 * DEG), 6);
        // Not into the wall as he leaves, and on along it
        expect(r.frames[1].x - r.frames[0].x).toBeLessThan(0.02);
        expect(r.frames[r.frames.length - 1].z - r.frames[0].z).toBeGreaterThan(5);
        // The closing speed counts the other's own way: a rider going the same way at nearly the bike's speed is a slump
        const along = measure('rider', 20, { setup: (v) => v.hitFrom(0, -1, 0, 16) });
        expect(along.v.riderFall.crash.closing).toBeCloseTo(4, 6);
        expect(along.row).toBe('slump');
    });

    test('the ground: he slides further downhill, less uphill, and rolls on a steep bank', () => {
        // The plane tilted under him alone (heading 0 is +z; the low side of a lean to the right is -x)
        const tilt = (fn) => (v) => { v.riderGroundY = fn; };
        const slide = (grade) => measure('grip', 12, { seconds: 6, setup: tilt((x, z) => grade * z) });
        const down = slide(-0.15), flat = slide(0), up = slide(0.15);
        expect(down.v.riderFall.crash.grade).toBeCloseTo(-0.15, 6);
        expect(down.slid).toBeGreaterThan(flat.slid + 0.5);
        expect(up.slid).toBeLessThan(flat.slid - 0.5);
        // A bank falling away 0.5 m in each metre toward the low side: a roll down it, at every speed
        const bank = tilt((x) => 0.5 * Math.min(0, x));
        for (const [why, speed, row] of [['grip', 16, 'lowsideRoll'], ['grip', 3, 'lowsideRoll'], ['stall', 2, 'tipRoll']]) {
            const r = measure(why, speed, { setup: bank });
            expect([why, speed, r.v.riderFall.crash.bank]).toEqual([why, speed, 0.5]);
            expect([why, speed, r.row]).toEqual([why, speed, row]);
        }
        // Falling away on the high side throws a fast highside down it, rolling
        const high = measure('rear', 18, { setup: tilt((x) => -0.5 * Math.max(0, x)) });
        expect(high.row).toBe('highsideRoll');
    });
});

describe('the rows', () => {
    test('every row is data: the throw, the times, the friction and its keys; every variant names a kind and a rule', () => {
        const fields = ['slowS', 'fastS', 'fullSpeed', 'keep', 'most', 'out', 'lift', 'liftPerSpeed', 'stop', 'away', 'topple', 'drag', 'scrub', 'bounce'];
        const crashFields = ['speed', 'lean', 'closing', 'into', 'bank', 'highBank', 'grade'];
        const kinds = Object.keys(FALLS).filter(name => !FALLS[name].of);
        for (const [name, row] of Object.entries(FALLS)) {
            for (const field of fields) expect([name, field, Number.isFinite(row[field])]).toEqual([name, field, true]);
            // A slow crash plays longer than a fast one, and the whole of it inside the shortest time a world ride shows a fall
            expect([name, row.slowS >= row.fastS && row.slowS <= 1.5]).toEqual([name, true]);
            expect([name, row.fullSpeed > RULE.walkSpeed]).toEqual([name, true]);
            if (row.calm) expect([name, !!FALLS[row.calm] && !FALLS[row.calm].calm]).toEqual([name, true]);
            if (row.lean) for (const field of Object.keys(row.lean)) expect([name, field, [...fields, 'T'].includes(field)]).toEqual([name, field, true]);
            if (!row.of) continue;
            expect([name, kinds.includes(row.of)]).toEqual([name, true]);
            const rules = Object.entries(row.when);
            expect(rules.length).toBeGreaterThan(0);
            for (const [field, range] of rules) {
                expect([name, field, crashFields.includes(field)]).toEqual([name, field, true]);
                expect(range[0] < range[1]).toBe(true);
            }
        }
        // Two to three variants of each kind besides its own row, and none of tip's but by the land
        for (const kind of kinds) {
            const variants = Object.values(FALLS).filter(row => row.of === kind).length;
            expect([kind, variants >= 1 && variants <= 2]).toEqual([kind, true]);
        }
    });

    test('the row is picked by rule: inside a variant\'s rule its row, outside every rule the kind\'s own', () => {
        const plain = { speed: 16, lean: 30, closing: 16, into: 1, bank: 0, highBank: 0, grade: 0 };
        for (const kind of Object.keys(FALLS).filter(name => !FALLS[name].of)) expect([kind, Vehicle.riderFallRow(kind, plain)]).toEqual([kind, kind]);
        const inside = (row) => {
            const crash = { ...plain };
            for (const [field, [from, under]] of Object.entries(row.when)) crash[field] = Number.isFinite(from) && Number.isFinite(under) ? (from + under) / 2 : Number.isFinite(from) ? from + 0.01 : under - 0.01;
            return crash;
        };
        for (const [name, row] of Object.entries(FALLS)) {
            if (!row.of) continue;
            expect([name, Vehicle.riderFallRow(row.of, inside(row))]).toEqual([name, name]);
            // Just outside each of its bounds it is not taken
            for (const [field, [from, under]] of Object.entries(row.when)) {
                for (const edge of [from - 0.01, under]) {
                    if (!Number.isFinite(edge)) continue;
                    const crash = { ...inside(row), [field]: edge };
                    expect([name, field, edge, Vehicle.riderFallRow(row.of, crash) !== name]).toEqual([name, field, edge, true]);
                }
            }
        }
        // The same crash, the same row, every time
        for (const why of Object.values(CLASS)) expect(measure(why, 18, { seconds: 0.2 }).row).toBe(measure(why, 18, { seconds: 0.2 }).row);
    });
});
