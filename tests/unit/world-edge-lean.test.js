/**
 * @jest-environment node
 */
// The edge lean (WorldPhysics.edgeLean, Vehicle.edgeLean; .agent/system/handling.md, "The edge lean"). The owner: "how
// about we allow the max lean angle to increase as you reach the edge of the road? that would add a slight assist and
// i think make it a little more playable".
//
// A bike that runs wide, near the edge on the outside of its turn, has a little more lean to tighten its line with.
// Held here, on the real Vehicle:
//   - the lean limit by the distance to the outside edge, for every degree of a rider's daring
//   - nothing on the inside edge, past the edge or in the mode with no assist, and half in the mode with half
//   - the tightest turn is tighter by the same share, so it acts in a hairpin too
//   - a bike at the raised limit that loses it never lowsides for that, in any mode and at the tuning row's most
//   - it is whole for a time of use, then gone, and new once the bike has been back in the middle of the road
//   - no rider in any mode leans past the lean the board's floors are worked out at
//   - on every hairpin of a world, a rider who comes in over the advised speed: what the edge lean gains, measured (it
//     is small: the advice leaves over 2 m/s of room, and the edge lean adds under a tenth of a m/s to it)
import { describe, test, expect, beforeAll, afterEach } from '@jest/globals';
import { loadGame, loadScript } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';
import { rideSpan } from '../helpers/world-rider.js';
import { samplesOf, fakeData, allTiles, straight } from '../helpers/world-synthetic.js';

const DT = 1 / 60, G = 9.81, DEG = 180 / Math.PI;
const game = loadGame();
const { THREE, Tuning, Vehicle, WorldPhysics, WorldRoute, WorldGround, WorldEnvironment, WorldAssist, CHARACTERS } = game;
const RiderModes = new Function('Tuning', 'WorldAssist', 'console', `${loadScript('ridermodes.js')}\nreturn RiderModes;`)(Tuning, WorldAssist, { warn() {} });
const rule = WorldPhysics.edgeLean;
const HALF = 5;

afterEach(() => {
    RiderModes.start({ storage: null });
    Tuning.setMode(null);
    Tuning.start({ debug: false });
});

// One rider for each degree of daring the catalogue has, by rule: no test names a rider
const riders = [...new Map(CHARACTERS.map(c => [Vehicle.traitOf(c, Vehicle.RIDER_LEAN.trait), c])).entries()].sort((a, b) => a[0] - b[0]);
const middle = CHARACTERS.find(c => Vehicle.leanOf(c) === (Vehicle.RIDER_LEAN.least + Vehicle.RIDER_LEAN.most) / 2) || riders[0][1];

// The bike on a 10 m road along +z over flat ground, `gap` metres inside the edge on the +lateral side (negative:
// past it). The level is the rider mode's unless given
function onRoad(gap, { character = middle, level = null } = {}) {
    const route = new WorldRoute(samplesOf(straight(3000)), {});
    const ground = new WorldGround(route, fakeData({ tiles: allTiles(-1, 0, -1, 6), zone: x => (Math.abs(x) <= HALF ? 1 : 0) }));
    const v = new Vehicle(new THREE.Scene(), null, character, character.bikes[0], { model: false });
    v.environment = { physics: WorldPhysics, route, ground };
    v.assistLevel = level;
    v.position.set(HALF - gap, 100, 40);
    v.yawAngle = 0;
    v.findNearestRoadSegment();
    return v;
}

// The steering held for `seconds` at `speed` with the bike kept where it is: `away` leans it away from the +lateral
// edge (the lean that turns it back in), else toward it. `fresh` keeps the time of use at nothing
function hold(v, speed, seconds, { away = true, fresh = true, watch = null } = {}) {
    for (let i = 0; i < Math.round(seconds / DT) && !v.crashed; i++) {
        v.speed = speed;
        if (fresh) v.edgeLeanUsedS = 0;
        v.updateWorldPhysics(DT, away ? -1 : 1);
        if (watch) watch(v, i);
    }
    return Math.abs(v.leanAngle) * DEG;
}
const held = (gap, options = {}) => hold(onRoad(gap, options), 30, 3, options);
const smooth = gap => { const x = Math.max(0, Math.min(1, (rule.fromM - gap) / (rule.fromM - rule.fullM))); return x * x * (3 - 2 * x); };
const raised = (capDeg, share) => Math.atan(Math.tan(capDeg / DEG) * (1 + rule.extra * share)) * DEG;

describe('the table', () => {
    test('the gain is under the lowside margin in every mode and at the most the tuning row gives', () => {
        const row = Tuning.row('edgeLean');
        expect(row.scales).toEqual([{ on: 'world', field: 'edgeLean.extra' }]);
        const least = WorldPhysics.lowsideMargin * Math.min(...RiderModes.MODES.map(mode => mode.tune.lowside || 1));
        expect(1 + rule.extra * row.max).toBeLessThan(least);
        expect(rule.fullM).toBeLessThan(rule.fromM);
    });

    test('no rider in any mode leans past the lean the floors are worked out at, the edge lean included', () => {
        const rows = [];
        for (const mode of RiderModes.MODES) {
            const share = WorldAssist.share(WorldPhysics, mode.assist);
            const most = raised(WorldPhysics.leanCapDeg * Vehicle.RIDER_LEAN.most * (mode.tune.leanMax || 1), share);
            rows.push(`${mode.id} ${most.toFixed(2)}`);
            expect(most).toBeLessThanOrEqual(WorldPhysics.floorLeanDeg);
        }
        console.log(`the most lean by mode, at the outside edge, most daring rider (floors at ${WorldPhysics.floorLeanDeg}): ${rows.join(', ')}`);
    });
});

describe('the lean limit by the distance to the outside edge', () => {
    test('it rises from fromM to fullM by a smoothstep, to the grip x (1 + extra), and is the plain limit further in', () => {
        const cap = WorldPhysics.leanCapDeg * Vehicle.leanOf(middle);
        const plain = held(HALF);
        expect(plain).toBeCloseTo(cap, 1);
        const rows = [];
        let last = plain;
        for (const gap of [3, 2, rule.fromM, 1.25, 1, 0.75, rule.fullM, 0.25, 0.01]) {
            const lean = held(gap);
            rows.push(`${gap} m ${lean.toFixed(2)}`);
            expect(lean).toBeCloseTo(raised(cap, smooth(gap)), 1);
            expect(lean).toBeGreaterThanOrEqual(last - 1e-6);
            if (gap >= rule.fromM) expect(lean).toBeCloseTo(plain, 3);
            last = lean;
        }
        expect(held(0.01) - plain).toBeGreaterThan(2.5);
        console.log(`lean held (degrees) by the distance to the outside edge, plain ${plain.toFixed(2)}: ${rows.join(', ')}`);
    });

    test('every degree of daring keeps its own limit under it: about 3 degrees more at the edge', () => {
        const rows = [];
        for (const [daring, character] of riders) {
            const plain = held(HALF, { character }), edge = held(0.01, { character });
            rows.push(`daring ${daring}: ${plain.toFixed(2)} to ${edge.toFixed(2)} (+${(edge - plain).toFixed(2)})`);
            expect(plain).toBeCloseTo(WorldPhysics.leanCapDeg * Vehicle.leanOf(character), 1);
            expect(edge).toBeCloseTo(raised(WorldPhysics.leanCapDeg * Vehicle.leanOf(character), 1), 1);
            expect(edge - plain).toBeGreaterThan(2.7);
            expect(edge - plain).toBeLessThan(3.3);
        }
        console.log(rows.join('\n'));
    });

    test('none on the inside edge (a lean toward the near edge), and none past the edge', () => {
        const plain = held(HALF);
        expect(held(0.01, { away: false })).toBeCloseTo(plain, 3);
        expect(held(-0.05)).toBeCloseTo(plain, 3);
        expect(held(-1)).toBeCloseTo(plain, 3);
        const v = onRoad(0.01);
        hold(v, 30, 1, { away: false });
        expect(v.edgeLeanShare).toBe(0);
    });

    test('by the rider mode\'s assist: whole in the modes with the whole assist, half with half, none with none', () => {
        const rows = [];
        for (const mode of RiderModes.MODES) {
            RiderModes.set(mode.id);
            const share = WorldAssist.share(WorldPhysics, mode.assist);
            const ratio = Math.tan(held(0.01) / DEG) / Math.tan(held(HALF) / DEG);
            rows.push(`${mode.id} ${ratio.toFixed(4)}`);
            expect(ratio).toBeCloseTo(1 + rule.extra * share, 3);
        }
        expect(RiderModes.MODES.map(mode => WorldAssist.share(WorldPhysics, mode.assist)).sort()).toEqual([0, 0.5, 1, 1]);
        console.log(`the grip of the lean at the edge over the plain one, by mode: ${rows.join(', ')}`);
    });

    test('the tightest turn is tighter by the same share, so a bike under the grip\'s speed turns tighter too', () => {
        const radius = (gap) => {
            const v = onRoad(gap);
            hold(v, 7.5, 2);
            const yaw = v.yawAngle;
            hold(v, 7.5, DT);
            return 7.5 * DT / Math.abs(v.yawAngle - yaw);
        };
        expect(radius(HALF)).toBeCloseTo(WorldPhysics.radiusFloor, 2);
        expect(radius(0.01)).toBeCloseTo(WorldPhysics.radiusFloor / (1 + rule.extra), 2);
    });
});

describe('it never drops the bike', () => {
    // At the raised limit at the edge, then in the middle of the road the next tick with the steering still held
    const lose = (options = {}) => {
        const v = onRoad(0.01, options);
        const edge = hold(v, 30, 2);
        v.position.x = 0;
        v.findNearestRoadSegment();
        let over = 0;
        const after = hold(v, 30, 3, { watch: w => { over = Math.max(over, w.lowsideTimerMs); } });
        return { edge, after, over, crashed: v.crashed };
    };

    test('a bike at the raised limit that is at once in the middle of the road is never over the lowside, in any mode', () => {
        for (const mode of RiderModes.MODES) {
            RiderModes.set(mode.id);
            const plain = held(HALF);
            const r = lose();
            expect(r.crashed).toBe(false);
            expect(r.over).toBe(0);
            expect(r.after).toBeCloseTo(plain, 1);
        }
    });

    test('and at the most the tuning row gives, for the most and the least daring rider', () => {
        Tuning.start({ debug: true });
        Tuning.set('edgeLean', Tuning.row('edgeLean').max);
        for (const character of [riders[0][1], riders[riders.length - 1][1]]) {
            const r = lose({ character });
            expect(r.edge).toBeGreaterThan(r.after + 3);
            expect(r.crashed).toBe(false);
            expect(r.over).toBe(0);
        }
    });

    test('the tuning row at 0 is the bike without it', () => {
        const plain = held(HALF);
        Tuning.start({ debug: true });
        Tuning.set('edgeLean', 0);
        expect(held(0.01)).toBeCloseTo(plain, 3);
    });
});

describe('it is not a rail', () => {
    test('whole for holdS of use, gone fadeS later, and new once the bike has been in the middle half of the road', () => {
        const v = onRoad(0.01);
        const shares = [];
        hold(v, 30, rule.holdS + rule.fadeS + 1, { fresh: false, watch: w => shares.push(w.edgeLeanShare) });
        const at = seconds => shares[Math.round(seconds / DT) - 1];
        expect(at(rule.holdS - 0.1)).toBe(1);
        expect(at(rule.holdS + rule.fadeS / 2)).toBeCloseTo(0.5, 1);
        expect(at(rule.holdS + rule.fadeS + 0.1)).toBe(0);
        // The lean came back to the plain limit with the steering held, and the bike is up
        expect(v.crashed).toBe(false);
        expect(Math.abs(v.leanAngle) * DEG).toBeCloseTo(held(HALF), 0);
        // Still at the edge it stays gone
        hold(v, 30, 1, { fresh: false });
        expect(v.edgeLeanShare).toBe(0);
        // Through the middle half of the road, and it is whole again
        v.position.x = HALF / 2 - 0.1;
        v.findNearestRoadSegment();
        hold(v, 30, DT, { fresh: false });
        v.position.x = HALF - 0.01;
        v.findNearestRoadSegment();
        hold(v, 30, DT, { fresh: false });
        expect(v.edgeLeanShare).toBe(1);
    });
});

// A rider who comes into a hairpin `over` m/s above the advised speed and holds that speed through it, on the centre
// line, leaning as far as the bike lets it. `rule` null rides without the edge lean. Off: a wheel past the edge of
// the carriageway, a crash or a restart
const worlds = [
    ['the shipped stage', { id: 'tremola' }],
    ['the synthetic fixture world', { id: 'all', search: '?worldData=tests/fixtures/world/mini' }]
];

describe.each(worlds)('a rider over the advised speed in every hairpin of %s', (name, world) => {
    let env, hairpins;
    beforeAll(async () => {
        env = await WorldEnvironment.load(new THREE.Scene(), { ...world, fetchFn: diskFetch().fetchFn, models: null, digest: async () => '0' });
        hairpins = env.route.hairpins();
    }, 300000);

    async function ride(h, over, edge) {
        env.physics = edge ? WorldPhysics : { ...WorldPhysics, edgeLean: null };
        const cobbles = env.route.sample(h.apex, {}).flags.cobbles;
        const advice = WorldAssist.advice(env.route, WorldPhysics, h.s0 - 5, 40, cobbles ? WorldPhysics.cobbleGrip : 1);
        const pace = (advice ? advice.speed : WorldAssist.advisedSpeed(WorldPhysics, WorldPhysics.rMin)) + over;
        let out = -Infinity, used = 0;
        const r = await rideSpan(game, env, {
            s0: Math.max(env.startS + 5, h.s0 - 25), s1: Math.min(env.endS - 5, h.s1 + 15), wide: true, speed: pace,
            watch: v => {
                out = Math.max(out, Math.abs(v.projection.lateral) - v.projection.width / 2);
                used = Math.max(used, v.edgeLeanShare);
            }
        });
        env.physics = WorldPhysics;
        return { off: out > 0 || r.crashed || r.cut, out, used };
    }

    // The most the rider can be over the advised speed and hold the road, to 1/16 m/s
    async function most(h, edge) {
        let low = 0, high = 8;
        for (let i = 0; i < 7; i++) {
            const mid = (low + high) / 2;
            if ((await ride(h, mid, edge)).off) high = mid; else low = mid;
        }
        return low;
    }

    test('1 m/s over the advised speed nobody runs off, with it or without: the advice leaves more room than that', async () => {
        expect(hairpins.length).toBeGreaterThan(0);
        const off = [];
        for (const h of hairpins) {
            for (const edge of [false, true]) if ((await ride(h, 1, edge)).off) off.push(`${Math.round(h.apex)} ${edge ? 'with' : 'without'}`);
        }
        expect(off).toEqual([]);
    }, 900000);

    test('the speed over the advice at which the rider first runs off is never lower with it; what it gains is small', async () => {
        const rows = [];
        for (const h of hairpins) rows.push({ apex: Math.round(h.apex), without: await most(h, false), with: await most(h, true) });
        const mean = key => rows.reduce((sum, row) => sum + row[key], 0) / rows.length;
        const gains = rows.map(row => row.with - row.without);
        console.log(`${name}: ${rows.length} hairpins, the most over the advised speed that holds the road (m/s, to 1/16): without ${mean('without').toFixed(2)}, with ${mean('with').toFixed(2)}; `
            + `higher in ${gains.filter(g => g > 0).length}, the same in ${gains.filter(g => g === 0).length}, lower in ${gains.filter(g => g < 0).length}; the most gained ${Math.max(...gains).toFixed(3)}\n`
            + rows.map(row => `${row.apex}: ${row.without} / ${row.with}`).join(', '));
        expect(rows.filter(row => row.with < row.without).map(row => row.apex)).toEqual([]);
        // A slight assist, as measured: under 0.5 m/s of entry speed. It is no licence to come in faster
        expect(mean('with') - mean('without')).toBeGreaterThanOrEqual(0);
        expect(mean('with') - mean('without')).toBeLessThan(0.5);
    }, 1800000);
});
