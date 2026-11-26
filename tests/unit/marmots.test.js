// The marmots of the high pastures (js/world/marmots.js). Held here, on tiles built in memory:
//   - colonies stand only where the rule says: high enough, near water, on open ground that is not steep, between
//     RULE.rideMinM and RULE.rideMaxM of every road band, 2 to 5 animals each, none on a road
//   - the same tile gives the same colonies, whatever else was gathered first
//   - no colony on low land or with no water near
//   - a crossing starts only where the road runs straight before it, and only while the animal clears the road at
//     least CROSSING.marginS before the bike gets there at its speed
//   - an animal sits up facing the bike as it comes, runs home and is gone when it is near, and comes back after the
//     bike has gone on
// The browser probe world-marmots (tools/terrain-check.mjs) checks the shipped stage as drawn.
import { describe, test, expect } from '@jest/globals';
import { loadGame, loadScript, realThree } from '../helpers/load-game.js';
import { samplesOf, straight, eight } from '../helpers/world-synthetic.js';

const game = loadGame();
const { WorldData, WorldRoute } = game;
const THREE = realThree();
const { Marmots, MarmotRule } = new Function('THREE', 'WorldData', 'RoadSurface', 'LandShade', `${loadScript('world/marmots.js')}\nreturn { Marmots, MarmotRule };`)(THREE, WorldData, { VERGE_M: 1.1 }, undefined);

const N = WorldData.TILE_N, CELL = WorldData.CELL_M, M = WorldData.TILE_M;
const R = MarmotRule.RULE;

// A tile at (0, 0): land at `base` m rising gently east, a lake round (lx, lz) of radius lr; a road along x = rx
function tile({ base = 2100, lake = [256, 256, 40], steep = 0 } = {}) {
    const heights = new Float32Array(N * N), zones = new Uint8Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const x = i * CELL, z = j * CELL;
        heights[j * N + i] = base + x * 0.02 + x * steep;
        if (lake && Math.hypot(x - lake[0], z - lake[1]) < lake[2]) zones[j * N + i] = WorldData.ZONE.water;
    }
    return { key: '0,0', tx: 0, tz: 0, heights, zones };
}
const road = rx => ({ clearance: (x, z, reach) => Math.min(reach, Math.abs(x - rx) - 6) });

describe('where marmots live', () => {
    test('only where the rule says, 2 to 5 to a colony', () => {
        const t = tile(), ctx = road(150);
        const colonies = MarmotRule.colonies(t, null, ctx);
        expect(colonies.length).toBeGreaterThan(0);
        for (const c of colonies) {
            expect(c.animals.length).toBeGreaterThanOrEqual(R.least);
            expect(c.animals.length).toBeLessThanOrEqual(R.most);
            for (const a of c.animals) {
                const past = ctx.clearance(a.x, a.z, 1e9);
                expect(past).toBeGreaterThanOrEqual(R.rideMinM);
                expect(past).toBeLessThanOrEqual(R.rideMaxM);
                expect(a.y).toBeGreaterThanOrEqual(R.minY);
                expect(Math.hypot(a.x - c.x, a.z - c.z)).toBeLessThanOrEqual(R.spreadM / 2 + 1e-9);
                const i = Math.round(a.x / CELL), j = Math.round(a.z / CELL);
                expect(t.zones[j * N + i]).toBe(WorldData.ZONE.terrain);
            }
            // Its centre within reach of the water
            expect(Math.hypot(c.x - 256, c.z - 256) - 40).toBeLessThanOrEqual(R.lakeM + CELL);
        }
    });

    test('the same tile gives the same colonies', () => {
        const a = MarmotRule.colonies(tile(), null, road(150)), b = MarmotRule.colonies(tile(), null, road(150));
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });

    test('none on low land, with no water, or on steep ground', () => {
        expect(MarmotRule.colonies(tile({ base: 1200 }), null, road(150))).toEqual([]);
        expect(MarmotRule.colonies(tile({ lake: null }), null, road(150))).toEqual([]);
        expect(MarmotRule.colonies(tile({ steep: 2 }), null, road(150))).toEqual([]);
    });

    test('none where the road is too near or too far', () => {
        // The road through the middle of the colonies' reach: none within RULE.rideMinM of it
        for (const c of MarmotRule.colonies(tile(), null, road(256))) for (const a of c.animals) expect(Math.abs(a.x - 256) - 6).toBeGreaterThanOrEqual(R.rideMinM);
        // A road far off: no animal more than RULE.rideMaxM from it
        expect(MarmotRule.colonies(tile(), null, road(-2000))).toEqual([]);
    });
});

describe('a marmot crossing the road', () => {
    test('only where the road runs straight before it', () => {
        const line = new WorldRoute(samplesOf(straight(800)), {});
        expect(MarmotRule.seenFrom(line, 400)).toBe(true);
        expect(MarmotRule.seenFrom(line, 100)).toBe(false);
        const bendy = new WorldRoute(samplesOf(eight({ halfWidth: 120, halfHeight: 60 })), {});
        let seen = 0;
        for (let s = 200; s < bendy.length; s += 20) seen += MarmotRule.seenFrom(bendy, s) ? 1 : 0;
        expect(seen).toBe(0);
    });

    test('it clears the road before the bike gets there, at any speed', () => {
        const C = Marmots.CROSSING;
        for (const width of [6, 9, 14]) {
            const clear = (C.leadM + width + 2 * C.edgeM) / C.speed;
            for (let speed = 2; speed <= 45; speed += 1) {
                for (let ahead = 0; ahead <= C.sightM + 50; ahead += 1) {
                    if (!MarmotRule.mayStart(ahead, speed, width)) continue;
                    expect(ahead / speed).toBeGreaterThanOrEqual(clear + C.marginS - 1e-9);
                    expect(ahead).toBeLessThanOrEqual(C.sightM);
                }
            }
        }
    });

    test('a ride has one crossing at most, in about the chance share of rides', () => {
        let rides = 0, with1 = 0;
        for (let seed = 1; seed <= 2000; seed++) {
            const m = Object.create(Marmots.prototype);
            m.seed(seed);
            expect(m.crossingLeft).toBeLessThanOrEqual(1);
            rides++;
            with1 += m.crossingLeft;
        }
        expect(with1 / rides).toBeGreaterThan(Marmots.CROSSING.chance - 0.05);
        expect(with1 / rides).toBeLessThan(Marmots.CROSSING.chance + 0.05);
    });
});

describe('a marmot near the bike', () => {
    test('the sentinel sits up facing the bike as it comes; the others go on moving', () => {
        const m = Object.create(Marmots.prototype);
        m.seed(5);
        const a = { id: 'a', x: 0, y: 0, z: 0, look: { x: 3, y: 0, z: 0 }, turn: 0 };
        const b = { id: 'b', x: 6, y: 0, z: 0, look: { x: 9, y: 0, z: 0 }, turn: 0 };
        const colony = { id: 'c', animals: [a, b] };
        const life = m.life(a, colony), other = m.life(b, colony);
        Object.assign(life, { mode: 'walk', target: a.look, bike: { x: 0, z: 30 } });
        Object.assign(other, { bike: { x: 0, z: 30 } });
        const L = Marmots.LIFE;
        const places = new Set();
        for (let k = 0; k < 600; k++) {
            m.step(life, 1 / 60, L.alertM - 10, null);
            m.step(other, 1 / 60, L.alertM - 10, null);
            places.add(`${other.x.toFixed(2)},${other.z.toFixed(2)}`);
        }
        // The sentinel sits up facing the bike; the other goes on moving
        expect(life.mode).toBe('sit');
        expect(life.alert).toBe(true);
        expect(life.heading).toBeCloseTo(Math.atan2(0 - life.x, 30 - life.z), 6);
        expect(places.size).toBeGreaterThan(20);
    });

    test('runs home and goes down its burrow, then comes up once the bike has gone on', () => {
        const m = Object.create(Marmots.prototype);
        m.seed(5);
        const a = { id: 'a', x: 0, y: 0, z: 0, look: { x: 3, y: 0, z: 0 }, turn: 0 };
        const life = m.life(a, { id: 'c' });
        Object.assign(life, { mode: 'sit', x: 3, z: 0, at: 'look' });
        const L = Marmots.LIFE;
        // It bolts while the bike is still LIFE.hideM off, and goes down into its burrow before it is gone
        let sank = false;
        for (let k = 0; k < 120; k++) { m.step(life, 1 / 60, L.hideM - 1, null); sank = sank || life.mode === 'sink'; }
        expect(L.hideM).toBeGreaterThanOrEqual(25);
        expect(sank).toBe(true);
        expect(life.mode).toBe('gone');
        expect(life.x).toBe(0);
        // Still gone while the bike is near, and for backS after it has gone
        for (let k = 0; k < 600; k++) m.step(life, 1 / 60, L.backM - 1, null);
        expect(life.mode).toBe('gone');
        for (let k = 0; k < L.backS * 60 - 2; k++) m.step(life, 1 / 60, L.backM + 1, null);
        expect(life.mode).toBe('gone');
        for (let k = 0; k < 4; k++) m.step(life, 1 / 60, L.backM + 1, null);
        // Up out of its burrow, from under the ground to where it sat
        expect(life.mode).toBe('rise');
        expect(life.y).toBeLessThan(0);
        for (let k = 0; k < L.riseS * 60 + 2; k++) m.step(life, 1 / 60, L.backM + 1, null);
        expect(life.mode).toBe('sit');
        expect(life.y).toBe(0);
    });

    test('a burrow is a mound round a hole that goes down into the ground', () => {
        const g = Marmots.burrowGeometry(), pos = g.attributes.position;
        let low = Infinity, high = -Infinity;
        for (let i = 0; i < pos.count; i++) { low = Math.min(low, pos.getY(i)); high = Math.max(high, pos.getY(i)); }
        expect(low).toBeLessThan(-0.1);
        expect(high).toBeLessThanOrEqual(0.1);
        expect(pos.count / 3).toBeLessThanOrEqual(60);
    });
});
