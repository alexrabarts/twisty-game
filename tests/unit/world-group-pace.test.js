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
        stopped: Math.round((1 - row.moving / row.frames) * 1000) / 1000,
        nearMost: Math.round(row.near / row.frames * 100) / 100, bent: Math.round(row.bent / row.frames * 100) / 100, limit: Math.round(row.limit * 1000) / 1000
    })).sort((a, b) => a.place - b.place);
    const group = each.reduce((sum, e) => sum + e.meanMs, 0) / each.length;
    const moving = each.reduce((sum, e) => sum + e.movingMs, 0) / each.length;
    const stopped = each.reduce((sum, e) => sum + e.stopped, 0) / each.length;
    return { seconds: Math.round(frames / 60), group: Math.round(group * 100) / 100, moving: Math.round(moving * 100) / 100, stopped: Math.round(stopped * 1000) / 1000, each, over, overlaps: ride.overlaps, events: ride.traffic.group.events };
}

describe('the group\'s pace', () => {
    test('measured over the stage from the group\'s places', () => {
        const a = measure(byPlace(6)), b = measure(byPlace(1));
        console.log(`PACE ${JSON.stringify({ pace: G.pace, crewWithoutPlace6: a, crewWithoutPlace1: b })}`);
        expect(a.over).toBe(0);
        expect(b.over).toBe(0);
        expect(a.overlaps).toEqual([]);
        expect(b.overlaps).toEqual([]);
        // Nobody is held for good: riders that waited on the roadside for the back, with the back queued behind them,
        // once stood there for the rest of the ride (1.8 km of the slice ridden in 1400 s)
        for (const e of [...a.each, ...b.each]) expect(e.metres).toBeGreaterThan(route.length / 2);
        // The owner's orders: a quicker group that stands less (2026-11-25), then a fair bit faster at 1 g with fewer
        // pull-overs (2026-11-26). With the slowest rider in it the crew rode 10.92 m/s with its stops, 16.87 moving
        // (2026-11-25), then 12.49 and 18.46, now 14.58 and 20.14; without it 14.54 and 18.87, now 14.66 and 21.19. The
        // roadworks lights hold the Tremola's mean speed with the stops near 14.5: a quicker group comes sooner to the
        // same red light
        expect(b.stopped).toBeLessThan(0.33);
        expect(b.group).toBeGreaterThan(14);
        expect(b.moving).toBeGreaterThan(19.5);
        expect(a.moving).toBeGreaterThan(20.5);
    }, 900000);

    test('every rider of the group rides the group\'s pace: its traits\' pace times GROUP.pace, its bends at the square of it, held at gripMost, its braking planned at planMost at most', () => {
        expect(G.pace).toBeGreaterThan(1);
        const grip = Math.min(G.pace * G.pace, G.gripMost);
        // (the bends at 1 g at the most)
        expect(4 * grip).toBeLessThanOrEqual(9.81);
        const ride = groupRide(game, env, { rider: byPlace(6), at: IN_PLACE, seconds: 5 });
        for (const r of ride.riders) {
            const kind = route.kindAt(sOf(r), {});
            const pace = Traffic.paceOf(Traffic.roadTrait(r.character, kind));
            expect(r.baseSpeed).toBeCloseTo((pace.speed + r.pace.luck * pace.spread) * r.pace.scale * G.pace, 1);
            expect(r.drive.plan).toBeCloseTo(Math.min(3 * grip, G.planMost), 6);
            expect(r.drive.brake).toBe(G.brakeMs);
            // (it never plans to stop in less room than its hard braking stops it in, which the following rule reads)
            expect(r.drive.plan).toBeLessThanOrEqual(r.drive.brake);
            expect(r.drive.lateral).toBeLessThanOrEqual(4 * grip + 1e-9);
            // (its cornering is the crew's narrowed to GROUP.cornerSpan of its spread, so the slowest still corners least)
            const corner = 4 - (4 - pace.corner) * G.cornerSpan;
            expect(r.drive.lateral).toBeLessThanOrEqual(corner * grip * Math.max(1, r.ride.own.most) ** 2 + 1e-9);
            expect(r.drive.lateral).toBeGreaterThan(Traffic.PACES[0].corner * grip * r.ride.own.least ** 2);
        }
    }, 300000);
});

describe('a rider ahead of the player', () => {
    const A = G.ahead, F = G.far;
    // Whether a rider at s1 is far ahead of one at s0 moving at `speed`, as GROUP.far reads it
    const farOf = (group, ride, s0, speed) => (ride.s - s0) / Math.max(speed, F.paceMs) >= F.farS && (ride.s - s0 >= F.sightM || !group.sees(ride, s0));

    test('ahead of a slow player it eases to the player\'s pace and does not pull over while it is near: in sight, or less than farS ahead', () => {
        const bad = [];
        let easing = 0, most = 0, pulls = 0, stood = 0, stoodMost = 0;
        const ride = groupRide(game, env, {
            rider: byPlace(6), at: [2300, 2285, 2270, 2255, 2240], player: { s: 2200, pace: () => 6 }, seconds: 420,
            onFrame: ({ t, riders, traffic, proxy, playerS }) => {
                const group = traffic.group;
                // (the longest the player stood, at a light: the riders ahead ride on at A.leastMs meanwhile)
                stood = proxy.currentSpeed < 1 ? stood + 1 / 60 : 0;
                stoodMost = Math.max(stoodMost, stood);
                for (const r of riders) {
                    const ahead = sOf(r) - playerS;
                    if (t > 30) most = Math.max(most, ahead);
                    if (r.ride.state === 'toWait' && r.ride.wasState !== 'toWait') {
                        pulls++;
                        if (!farOf(group, r.ride, playerS, proxy.currentSpeed)) bad.push({ t, name: r.riderName, ahead: Math.round(ahead), why: r.ride.why });
                    }
                    r.ride.wasState = r.ride.state;
                    if (!r.ride.easing) { r.easedS = 0; continue; }
                    easing++;
                    // It has slowed to the player's pace once it could at a firm 5 m/s^2 from the speed it started to ease at:
                    // the player's speed eased over A.paceS, never under A.leastMs (a rider held to the player's speed of
                    // the moment stood in its lane while the player stood)
                    const pace = Math.max(A.leastMs, group.leadPace);
                    if (!r.easedS) r.settleS = Math.max(3, (r.currentSpeed - pace) / 5);
                    r.easedS = (r.easedS || 0) + 1 / 60;
                    if (r.easedS > r.settleS && r.currentSpeed > pace + 0.3) bad.push({ t, name: r.riderName, speed: r.currentSpeed, pace, player: proxy.currentSpeed });
                }
            }
        });
        expect(easing).toBeGreaterThan(60 * 30);
        if (bad.length) throw new Error(`${bad.length} frames: ${JSON.stringify(bad.slice(0, 6))}`);
        // (held to the player's pace from aheadM, it never gets far: nobody pulls over)
        expect(pulls).toBe(0);
        // (and the metres a rider rides on at A.leastMs while the player stands at a light)
        expect(most).toBeLessThan(A.aheadM + 120 + A.leastMs * stoodMost);
        expect(ride.overlaps).toEqual([]);
    }, 600000);

    test('ahead of a stopped player it rides on at a crawl, pulls in at a place on its side only once it is far ahead and out of the player\'s sight, and falls in behind the player when it rides again', () => {
        const seen = new Map(), crawl = [];
        const standS = 360;
        const ride = groupRide(game, env, {
            rider: byPlace(6), at: [2300, 2285, 2270, 2255, 2240], player: { s: 2200, pace: t => (t < 60 ? 6 : t < 60 + standS ? 0 : 14) }, seconds: 1000,
            onFrame: ({ t, riders, traffic, playerS }) => {
                const group = traffic.group;
                for (const r of riders) {
                    const me = seen.get(r) || seen.set(r, { r }).get(r);
                    // (after its grace and the time to ease from its pace to the crawl)
                    if (group.halted && group.haltedS > F.graceS + 30 && sOf(r) > group.haltS && r.ride.state === 'ride' && r.currentSpeed > F.creepMs + 0.3) crawl.push({ t, name: r.riderName, speed: r.currentSpeed });
                    if (r.ride.state === 'toWait' && me.decided === undefined) me.decided = { t, gap: sOf(r) - playerS, far: farOf(group, r.ride, playerS, 0), why: r.ride.why };
                    if (r.ride.state === 'wait' && !me.wait) {
                        const g = r.bikeGroup.position, p = route.project(g.x, g.z, null, {});
                        me.wait = { t, s: sOf(r), place: env.places.at(sOf(r), p.lateral), off: Math.abs(p.lateral) - p.width / 2 - 0.4 };
                    }
                    if (me.wait && !me.out && r.ride.state === 'out') me.out = { t, s: sOf(r), playerS };
                }
            },
            until: ({ t }) => t > 60 + standS + 10 && [...seen.values()].every(m => !m.wait || m.out)
        });
        const pulled = [...seen.values()].filter(m => m.decided);
        const report = JSON.stringify({ events: ride.traffic.group.events, pulled: pulled.map(m => ({ name: m.r.riderName, decided: m.decided, wait: m.wait && { s: Math.round(m.wait.s), place: m.wait.place && m.wait.place.id }, out: m.out })) });
        if (pulled.length < 2) throw new Error(`fewer than two riders pulled over for a player stood ${standS} s: ${report}`);
        if (crawl.length) throw new Error(`${crawl.length} frames over the crawl ahead of a stopped player: ${JSON.stringify(crawl.slice(0, 4))}`);
        for (const m of pulled) {
            expect(m.decided.why).toBe('player');
            // (far: farS or more ahead at paceMs, and out of sight)
            expect(m.decided.gap).toBeGreaterThanOrEqual(F.farS * F.paceMs);
            expect(m.decided.far).toBe(true);
            if (!m.wait) continue;
            expect(m.wait.place).toBeTruthy();
            expect(m.wait.place.side).toBe(Route.keepRight(1));
            expect(m.wait.off).toBeGreaterThanOrEqual(0);
            if (m.out) expect(m.out.playerS).toBeGreaterThan(m.wait.s + G.rejoin.joinM - 1);
        }
        expect(ride.overlaps).toEqual([]);
    }, 900000);
});
