/**
 * @jest-environment node
 */
// The group's pace (Traffic.GROUP.pace) and a rider too far ahead of the player (Traffic.GROUP.ahead), on the real
// Tremola slice (.agent/system/group.md). The pace: the whole ride of the crew from its places, the mean speed of the
// group and of each rider, printed (PACE ...), and no rider past its `most`. Too far ahead: a rider more than aheadM
// up the road from a slow player pulls in at the next place on its side and waits until the player has passed, then
// falls in behind it; with no place in reach it rides at the player's pace.
import { describe, test, expect, beforeAll } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';
import { groupRide } from '../helpers/world-group.js';

const game = loadGame(undefined, []);
const { THREE, Traffic, Route, WorldEnvironment, CHARACTERS } = game;
const G = Traffic.GROUP;
// (PACE in the environment measures another pace, for choosing it)
if (process.env.PACE) G.pace = Number(process.env.PACE);
const byPlace = place => CHARACTERS.find(c => c.place === place);

let env, route;
beforeAll(async () => {
    const { fetchFn } = diskFetch();
    env = await WorldEnvironment.load(new THREE.Scene(), { id: 'tremola', fetchFn, models: null, digest: async () => '0' });
    env.scenery.buildTile = () => null;
    route = env.route;
}, 300000);

const sOf = v => route.fromUnits(v.currentSegment + v.segmentProgress);
const IN_PLACE = [116, 102, 88, 74, 60];

// The crew's ride from its places with no player, to 400 m before the end: each rider's mean speed over the metres it
// rode, how near its limit it rode, and how much of the ride a bend held it under its pace
function measure(rider) {
    const rows = new Map();
    let frames = 0, over = 0;
    const ride = groupRide(game, env, {
        rider, at: IN_PLACE, seconds: 1400,
        onFrame: ({ riders }) => {
            frames++;
            for (const r of riders) {
                if (!rows.has(r)) rows.set(r, { name: r.character.place, s0: sOf(r), frames: 0, moving: 0, near: 0, bent: 0, limit: 0 });
                const row = rows.get(r);
                row.frames++;
                const most = r.baseSpeed * r.ride.own.most;
                row.limit = Math.max(row.limit, r.currentSpeed / most);
                if (r.currentSpeed > most + 1e-6) over++;
                if (r.currentSpeed > 0.5) row.moving++;
                if (r.currentSpeed > 0.97 * most) row.near++;
                if (r.currentSpeed < r.baseSpeed * r.ride.factor - 0.5) row.bent++;
            }
        },
        until: ({ riders }) => riders.some(r => sOf(r) > route.length - 400)
    });
    const each = [...rows.entries()].map(([r, row]) => ({
        place: row.name, metres: Math.round(sOf(r) - row.s0), meanMs: Math.round((sOf(r) - row.s0) / (row.frames / 60) * 100) / 100,
        movingMs: Math.round((sOf(r) - row.s0) / (row.moving / 60) * 100) / 100,
        nearMost: Math.round(row.near / row.frames * 100) / 100, bent: Math.round(row.bent / row.frames * 100) / 100, limit: Math.round(row.limit * 1000) / 1000
    })).sort((a, b) => a.place - b.place);
    const group = each.reduce((sum, e) => sum + e.meanMs, 0) / each.length;
    const moving = each.reduce((sum, e) => sum + e.movingMs, 0) / each.length;
    return { seconds: Math.round(frames / 60), group: Math.round(group * 100) / 100, moving: Math.round(moving * 100) / 100, each, over, overlaps: ride.overlaps, events: ride.traffic.group.events };
}

describe('the group\'s pace', () => {
    test('measured over the stage from the group\'s places', () => {
        const a = measure(byPlace(6)), b = measure(byPlace(1));
        console.log(`PACE ${JSON.stringify({ pace: G.pace, crewWithoutPlace6: a, crewWithoutPlace1: b })}`);
        expect(a.over).toBe(0);
        expect(b.over).toBe(0);
        expect(a.overlaps).toEqual([]);
        expect(b.overlaps).toEqual([]);
    }, 900000);

    test('every rider of the group rides the group\'s pace: its traits\' pace times GROUP.pace, its bends at the square of it, held at gripMost', () => {
        expect(G.pace).toBeGreaterThan(1);
        const grip = Math.min(G.pace * G.pace, G.gripMost);
        expect(4 * grip).toBeLessThanOrEqual(8);
        const ride = groupRide(game, env, { rider: byPlace(6), at: IN_PLACE, seconds: 5 });
        for (const r of ride.riders) {
            const kind = route.kindAt(sOf(r), {});
            const pace = Traffic.paceOf(Traffic.roadTrait(r.character, kind));
            expect(r.baseSpeed).toBeCloseTo((pace.speed + r.pace.luck * pace.spread) * r.pace.scale * G.pace, 2);
            expect(r.drive.plan).toBeCloseTo(3 * grip, 6);
            expect(r.drive.brake).toBe(6);
            expect(r.drive.lateral).toBeLessThanOrEqual(4 * grip + 1e-9);
        }
    }, 300000);
});

describe('a rider too far ahead of the player', () => {
    const A = G.ahead;
    // The player is the slowest rider's character, riding at 6 m/s from s 2200 with the crew just up the road
    const slowRide = (onFrame, seconds = 420) => groupRide(game, env, { rider: byPlace(6), at: [2300, 2285, 2270, 2255, 2240], player: { s: 2200, pace: () => 6 }, seconds, onFrame });

    test('pulls in at the next place on its own side, off the carriageway, waits until the player has passed it, then falls in behind', () => {
        const seen = new Map();
        const ride = slowRide(({ t, riders, playerS }) => {
            for (const r of riders) {
                const me = seen.get(r) || seen.set(r, { r }).get(r);
                if (r.ride.state === 'toWait' && r.ride.why === 'ahead' && me.decided === undefined) me.decided = sOf(r) - playerS;
                if (r.ride.state === 'wait' && r.ride.why === 'ahead' && !me.wait) {
                    const g = r.bikeGroup.position, p = route.project(g.x, g.z, null, {});
                    me.wait = { t, s: sOf(r), place: env.places.at(sOf(r), p.lateral), off: Math.abs(p.lateral) - p.width / 2 - 0.4, playerS };
                }
                if (me.wait && !me.out && r.ride.state === 'out') me.out = { t, s: sOf(r), playerS };
                if (me.out && !me.behind && r.ride.state === 'ride') me.behind = { s: sOf(r), playerS };
            }
        });
        const waited = [...seen.values()].filter(m => m.wait);
        const report = JSON.stringify({ events: ride.traffic.group.events, waited: waited.map(m => ({ name: m.r.riderName, decided: m.decided, wait: m.wait && { s: Math.round(m.wait.s), place: m.wait.place && m.wait.place.id, off: m.wait.off }, out: m.out && { s: Math.round(m.out.s), playerS: Math.round(m.out.playerS) } })) });
        if (waited.length < 2) throw new Error(`fewer than two riders waited for the slow player: ${report}`);
        for (const m of waited) {
            expect(m.decided).toBeGreaterThan(A.aheadM);
            expect(m.wait.place).toBeTruthy();
            expect(m.wait.place.side).toBe(Route.keepRight(1));
            expect(m.wait.off).toBeGreaterThanOrEqual(0);
            if (!m.out) throw new Error(`a rider never pulled out: ${report}`);
            expect(m.out.playerS).toBeGreaterThan(m.wait.s + G.rejoin.joinM - 1);
            if (m.behind) expect(m.behind.s).toBeLessThan(m.behind.playerS);
        }
        expect(ride.traffic.group.events.roadside).toBe(0);
        expect(ride.overlaps).toEqual([]);
    }, 600000);

    test('with no place in reach it rides at the player\'s pace on its lane, and never waits on the carriageway', () => {
        const next = env.places.next;
        env.places.next = () => null;
        const bad = [];
        let easing = 0, most = 0;
        let ride;
        try {
            ride = slowRide(({ t, riders, proxy, playerS }) => {
                for (const r of riders) {
                    const ahead = sOf(r) - playerS;
                    if (t > 30) most = Math.max(most, ahead);
                    if (r.ride.state !== 'ride' && r.ride.state !== 'out') bad.push({ t, name: r.riderName, state: r.ride.state, why: r.ride.why });
                    if (!r.ride.easing) { r.easedS = 0; continue; }
                    easing++;
                    // It has slowed to the player's pace once it could at a firm 5 m/s^2 from the speed it started to ease at
                    if (!r.easedS) r.settleS = Math.max(3, (r.currentSpeed - proxy.currentSpeed) / 5);
                    r.easedS = (r.easedS || 0) + 1 / 60;
                    if (r.easedS > r.settleS && r.currentSpeed > proxy.currentSpeed + 0.3) bad.push({ t, name: r.riderName, speed: r.currentSpeed, player: proxy.currentSpeed });
                }
            }, 300);
        } finally { env.places.next = next; }
        expect(easing).toBeGreaterThan(60 * 30);
        if (bad.length) throw new Error(`${bad.length} frames: ${JSON.stringify(bad.slice(0, 6))}`);
        expect(most).toBeLessThan(A.aheadM + 120);
        expect(ride.traffic.group.events.roadside).toBe(0);
        expect(ride.overlaps).toEqual([]);
    }, 600000);
});
