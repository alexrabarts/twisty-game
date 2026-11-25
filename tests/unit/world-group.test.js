/**
 * @jest-environment node
 */
// The group ride of a world's crew (CrewGroup and Traffic.GROUP in js/traffic.js, each rider's CHARACTERS `group`;
// .agent/system/group.md). The owner: ride as a group with each rider's own ways, not rigid, spread out or bunched at
// times; a stopped player is waited for (behind it on the road, ahead of it in the next stopping place), and once it
// has passed the riders fall in behind it and pass back toward their places; the player's pace pulls the riders behind
// it, to a point; the slowest rider pulls in now and then and catches up.
//
// Every ride here is on the real Tremola slice at 60 frames a second, with a seeded group (env.groupSeed) and the
// crew's start draws seeded (seeded), so each replays exactly. Boxes are measured by tests/helpers/world-contact.js,
// apart from the game's own test.
import { describe, test, expect, beforeAll } from '@jest/globals';
import { loadGame, loadScript } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';
import { putAt } from '../helpers/world-contact.js';
import { groupRide as rideGroup } from '../helpers/world-group.js';

const game = loadGame(undefined, []);
const { THREE, Traffic, Route, Roadworks, WorldEnvironment, CHARACTERS } = game;
const G = Traffic.GROUP;
const DT = 1 / 60;
const byPlace = place => CHARACTERS.find(c => c.place === place);
const list = (items, n = 12) => items.slice(0, n).map(i => JSON.stringify(i)).join('\n');

let env, route, works;
beforeAll(async () => {
    const { fetchFn } = diskFetch();
    env = await WorldEnvironment.load(new THREE.Scene(), { id: 'tremola', fetchFn, models: null, digest: async () => '0' });
    env.scenery.buildTile = () => null;
    route = env.route;
    works = env.roadworks;
}, 300000);

const sOf = v => route.fromUnits(v.currentSegment + v.segmentProgress);
const laneLateral = (s) => route.laneCurve(route.toUnits(s), 1, 0, 0, {}).lateral;
// Where a bike stands across the road: its lateral and the carriageway's half width there
function across(v) {
    const g = v.bikeGroup.position;
    const p = route.project(g.x, g.z, null, {});
    return { s: p.s, lateral: p.lateral, half: p.width / 2 };
}

const groupRide = options => rideGroup(game, env, options);

// The places in the group, front first, of the riders on the road
const orderOf = riders => riders.filter(r => r.bikeGroup.visible).sort((a, b) => sOf(b) - sOf(a)).map(r => r.character.place);
// How far each rider is from its own place among the riders, on the mean
function displacement(riders) {
    const order = orderOf(riders), wish = order.slice().sort((a, b) => a - b);
    return order.reduce((sum, place, k) => sum + Math.abs(wish.indexOf(place) - k), 0) / order.length;
}
const nearEnd = riders => riders.some(r => sOf(r) > route.length - 400);
// The crew near the start, by place: in place order (place 1 the furthest up the road), and the reverse of it
const IN_PLACE = [116, 102, 88, 74, 60];
const REVERSE = [60, 74, 88, 102, 116];

describe('the riders\' numbers', () => {
    test('each rider\'s group numbers are data in range; the lowest traits stop most, place 5 keeps the longest gap, and the rules name nobody', () => {
        const sum = c => c.traits.country + c.traits.mountain + c.traits.hairpins + c.traits.daring;
        for (const c of CHARACTERS) {
            const g = c.group;
            expect(g).toBeTruthy();
            expect(g.gapS).toBeGreaterThan(0);
            expect(g.least).toBeGreaterThan(0.5);
            expect(g.least).toBeLessThan(1);
            expect(g.most).toBeGreaterThan(1);
            expect(g.most).toBeLessThanOrEqual(1.3);
            expect(g.passPerS).toBeGreaterThan(0);
            expect(g.passPerS).toBeLessThanOrEqual(1);
            if (g.spurt) expect(g.spurt.gain).toBeLessThanOrEqual(g.most);
        }
        const slowest = CHARACTERS.slice().sort((a, b) => sum(a) - sum(b))[0];
        const chance = c => (c.group.stop ? c.group.stop.chance : 0);
        expect(Math.max(...CHARACTERS.map(chance))).toBe(chance(slowest));
        expect(CHARACTERS.filter(c => chance(c) > 0).length).toBeLessThanOrEqual(2);
        // Spells for places 2, 4 and 5; none for places 1 and 6
        for (const place of [2, 4, 5]) expect(byPlace(place).group.spurt).toBeTruthy();
        for (const place of [1, 6]) expect(byPlace(place).group.spurt).toBeNull();
        expect(byPlace(5).group.gapS).toBe(Math.max(...CHARACTERS.map(c => c.group.gapS)));
        // The rules read `place` and the numbers, never a name
        const source = loadScript('traffic.js');
        const rules = source.slice(source.indexOf('const GROUP = {'), source.indexOf('// Metres between the lane line'));
        expect(rules.length).toBeGreaterThan(5000);
        for (const c of CHARACTERS) expect(rules.includes(c.name)).toBe(false);
    });
});

describe('the line', () => {
    let reverse, held;
    beforeAll(() => {
        // The whole crew but the slowest, with no player: from the reverse of their places, and from their places
        const rows = { reverse: [], held: [] };
        const sample = key => ({ t, riders }) => { if (Math.round(t * 60) % 120 === 0 && !nearEnd(riders)) rows[key].push({ t, d: displacement(riders), order: orderOf(riders).join(''), s: riders.map(sOf).sort((a, b) => b - a) }); };
        const rideOf = (key, at) => groupRide({ rider: byPlace(6), at, seconds: 1300, onFrame: sample(key), until: ({ riders }) => nearEnd(riders) });
        reverse = { ...rideOf('reverse', REVERSE), rows: rows.reverse };
        held = { ...rideOf('held', IN_PLACE), rows: rows.held };
    }, 600000);

    test('from the reverse of their places the riders pass each other into place order, and stay near it', () => {
        const rows = reverse.rows, half = Math.floor(rows.length / 2);
        const mean = part => part.reduce((sum, r) => sum + r.d, 0) / part.length;
        const first = mean(rows.slice(0, half)), second = mean(rows.slice(half));
        const report = { first, second, passes: reverse.traffic.group.events.passes, aborts: reverse.traffic.group.events.aborts, orders: rows.filter((r, k) => k % 25 === 0).map(r => r.order) };
        expect(rows[0].order).toBe('54321');
        if (!(second < first && second <= 0.6)) throw new Error(`the line did not form: ${JSON.stringify(report)}`);
        expect(report.passes).toBeGreaterThanOrEqual(5);
        expect(reverse.overlaps).toEqual([]);
    });

    test('from their places the line holds within a band: near place order all the ride, nobody ever more than two places off', () => {
        const rows = held.rows;
        const off = r => r.order.split('').map((p, k) => Math.abs(Number(p) - 1 - k));
        // In place order, or two neighbours swapped
        const near = rows.filter(r => off(r).reduce((a, b) => a + b, 0) <= 2).length / rows.length;
        const worst = Math.max(...rows.map(r => Math.max(...off(r))));
        const mean = rows.reduce((sum, r) => sum + r.d, 0) / rows.length;
        if (!(near >= 0.8 && worst <= 2 && mean <= 0.6)) throw new Error(`near order ${near}, worst ${worst}, mean ${mean}: ${rows.filter((r, k) => k % 25 === 0).map(r => r.order).join(' ')}`);
        expect(held.overlaps).toEqual([]);
    });

    test('the group spreads out and bunches up: the line\'s length and each gap change over the ride', () => {
        const lengths = held.rows.map(r => r.s[0] - r.s[r.s.length - 1]);
        const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
        const sd = Math.sqrt(lengths.reduce((a, b) => a + (b - mean) ** 2, 0) / lengths.length);
        const sorted = lengths.slice().sort((a, b) => a - b);
        const low = sorted[Math.floor(sorted.length * 0.1)], high = sorted[Math.floor(sorted.length * 0.9)];
        const report = { mean: Math.round(mean), sd: Math.round(sd), low: Math.round(low), high: Math.round(high) };
        if (!(sd / mean > 0.3 && high > 2.5 * low)) throw new Error(`the line kept one length: ${JSON.stringify(report)}`);
        // And each gap between two riders next to each other
        for (let k = 0; k < 4; k++) {
            const gaps = held.rows.map(r => r.s[k] - r.s[k + 1]).sort((a, b) => a - b);
            expect(gaps[Math.floor(gaps.length * 0.9)]).toBeGreaterThan(2 * gaps[Math.floor(gaps.length * 0.1)]);
        }
    });
});

describe('the player\'s pace', () => {
    // The player is the rider of place 1, so every rider's place is behind it and nobody passes it. It takes its bends
    // as a rider of the group does at the group's pace (GROUP.pace)
    const grip = Math.min(G.pace * G.pace, G.gripMost);
    const behind = (pace) => {
        const shares = new Map(), over = [], near = [];
        let passedPlayer = 0;
        const ride = groupRide({
            rider: byPlace(1), at: [2560, 2545, 2530, 2515, 2500], player: { s: 2600, pace: () => pace, drive: { lateral: 4 * grip, plan: Math.min(3 * grip, G.planMost), accel: 3 * grip, brake: 6, turnIn: 3 * grip } }, seconds: 300,
            onFrame: ({ riders, playerS, proxy, t }) => {
                // (a player that stands, at a red light, is followed by nobody: its pace is the one that moves)
                if (t < 20 || proxy.currentSpeed < 5) return;
                const first = riders.slice().sort((a, b) => sOf(b) - sOf(a))[0];
                for (const r of riders) {
                    const want = r.baseSpeed * r.ride.factor;
                    if (want > r.baseSpeed * r.ride.own.most + 1e-9) over.push({ name: r.riderName, want, limit: r.baseSpeed * r.ride.own.most });
                    if (sOf(r) > playerS) passedPlayer++;
                    // The share of its pace of each rider, and of the one next behind the player while the player is in its sight
                    if (!shares.has(r)) shares.set(r, []);
                    shares.get(r).push(r.ride.factor);
                    if (r === first && playerS - sOf(r) < G.line.lookM) near.push(r.ride.factor);
                }
            },
            until: ({ playerS }) => playerS > 7000
        });
        const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
        return { ride, over, passedPlayer, next: mean(near), all: mean([...shares.values()].flat()) };
    };

    test('a fast player pulls the riders behind it up to their limit and never past it; a slow one makes them ease off', () => {
        // (fast for the group's pace: its riders ride G.pace times their traits' pace; 9 m/s is slow at any pace)
        const fast = behind(22 * G.pace), slow = behind(9);
        const report = { fast: { next: fast.next, all: fast.all }, slow: { next: slow.next, all: slow.all } };
        expect(fast.over).toEqual([]);
        expect(slow.over).toEqual([]);
        // (the rider next behind a fast player rode at 1.088 of its pace on the mean at a pace of 1.5 with its bends at 0.8 g,
        // 1.079 at 1.6 and 0.9 g, 1.065 with the crew's cornering narrowed to GROUP.cornerSpan 0.5: it loses less to the
        // player in the bends, so it needs less pull to keep its gap)
        if (!(fast.next > 1.06 && slow.next < 0.95 && fast.all > slow.all + 0.1)) throw new Error(`the player's pace did not pull: ${JSON.stringify(report)}`);
        // Nobody whose place is behind the player passes it, fast or slow
        expect(fast.passedPlayer).toBe(0);
        expect(slow.passedPlayer).toBe(0);
        expect(fast.ride.overlaps).toEqual([]);
        expect(slow.ride.overlaps).toEqual([]);
    }, 300000);
});

describe('a player who stops', () => {
    // The player is the slowest rider (place 6), so every rider would be ahead of it. It stops at STOP_S with two riders
    // behind it and three ahead, stands for a minute and a half and rides on
    const STOP_S = 4700;
    let ride, at50, outs = [], rejoined = new Map(), events, aheadAtEnd, ahead30;
    beforeAll(() => {
        const standS = 90;
        ride = groupRide({
            rider: byPlace(6), cars: true, at: [4810, 4775, 4740, 4650, 4610], player: { s: STOP_S, pace: t => (t < standS ? 0 : 13) }, seconds: 1100,
            onFrame: ({ t, riders, traffic, playerS }) => {
                if (Math.abs(t - 85) < DT / 2) at50 = riders.map(r => ({ r, s: sOf(r), state: r.ride.state, speed: r.currentSpeed, across: across(r), lane: laneLateral(sOf(r)), place: env.places.at(sOf(r), across(r).lateral) }));
                for (const r of riders) {
                    // (the first time each rider that waited for the player pulls out)
                    if (t > 85 && r.ride.state === 'out' && at50.some(x => x.r === r && x.state === 'wait') && !outs.some(o => o.r === r)) outs.push({ r, t, playerS, atS: sOf(r) });
                    if (t > standS && r.ride.state === 'ride' && outs.some(o => o.r === r) && !rejoined.has(r)) rejoined.set(r, { t, s: sOf(r), playerS });
                }
                if (Math.abs(t - (standS + 300)) < DT / 2) ahead30 = riders.filter(r => sOf(r) > playerS).length;
                events = traffic.group.events;
            },
            until: ({ playerS }) => playerS > 10500
        });
        aheadAtEnd = ride.riders.filter(r => sOf(r) > sOf(ride.proxy)).length;
    }, 600000);

    test('riders behind stand behind it on their lane at a gap; riders ahead wait in the next stopping place, off the carriageway', () => {
        const behindRiders = at50.filter(x => x.s < STOP_S).sort((a, b) => b.s - a.s);
        const aheadRiders = at50.filter(x => x.s > STOP_S);
        expect(behindRiders.length).toBe(2);
        expect(aheadRiders.length).toBe(3);
        // (the gaps run from where the player stands, which a quicker group's proxy reaches a little past STOP_S)
        let front = ride.traffic.group.standS;
        expect(Math.abs(front - STOP_S)).toBeLessThan(1);
        for (const x of behindRiders) {
            expect(x.state).toBe('hold');
            expect(x.speed).toBeLessThan(0.05);
            expect(front - x.s).toBeGreaterThanOrEqual(G.hold.gapM - 0.5);
            expect(Math.abs(x.across.lateral - x.lane)).toBeLessThan(0.15);
            front = x.s;
        }
        const width = Traffic.sizeOf('bike').width;
        for (const x of aheadRiders) {
            expect(x.state).toBe('wait');
            expect(x.speed).toBe(0);
            // Off the carriageway, on the rider's own side, in an open place
            expect(Math.abs(x.across.lateral) - width / 2).toBeGreaterThanOrEqual(x.across.half);
            expect(Math.sign(x.across.lateral)).toBe(Route.keepRight(1));
            expect(x.place).toBeTruthy();
        }
        expect(new Set(aheadRiders.map(x => x.place.id)).size).toBe(1);
        expect(ride.overlaps).toEqual([]);
    });

    test('once the player has passed, the waiting riders pull out behind it, and then pass it back toward their places', () => {
        expect(outs.length).toBe(3);
        for (const o of outs) expect(o.playerS).toBeGreaterThan(o.atS + G.rejoin.joinM - 1);
        for (const [, r] of rejoined) expect(r.s).toBeLessThan(r.playerS);
        // All five were behind the player once it had passed the place; over the next kilometres they pass it (and a
        // rider that gets too far ahead of it waits for it again: GROUP.ahead, so the count at the end may be lower)
        if (!(Math.max(aheadAtEnd, ahead30) >= 2 && events.passes >= 2)) throw new Error(`riders ahead of the player at the end: ${aheadAtEnd} (${ahead30} five minutes after it rode on); ${JSON.stringify(events)}`);
    });
});

describe('a pass is only where it is safe', () => {
    test('no pass in a hairpin, at a roadworks single lane, or toward a car coming the other way', () => {
        const ride = groupRide({ rider: byPlace(6), cars: true, seconds: 1 });
        const group = ride.traffic.group;
        // A straight the passes start on (the first of the slice's long straights)
        let straightS = null;
        for (let s = 300; s < route.length - 400 && straightS === null; s += 10) if (group.clearRoad(s, 150, 14)) straightS = s;
        expect(straightS).not.toBeNull();
        for (const h of route.hairpins()) expect(group.clearRoad(h.s0 - 20, 60, 10)).toBe(false);
        for (const site of works.closed) expect(group.clearRoad(site.stopIn - 40, 60, 10)).toBe(false);
        // An oncoming car 250 m up the straight
        const car = ride.traffic.cars[0];
        expect(car.direction).toBe(-1);
        putAt(car, route, straightS + 250);
        expect(group.clearRoad(straightS, 150, 14)).toBe(false);
        putAt(car, route, straightS - 50);
        expect(group.clearRoad(straightS, 150, 14)).toBe(true);
    });

    test('in whole rides with the world\'s car, a rider out toward the centre line is never in a hairpin, a single lane, or near a car coming the other way', () => {
        const bad = [];
        let outFrames = 0;
        const kind = {};
        const ride = groupRide({
            rider: byPlace(6), cars: true, at: REVERSE, seconds: 1300,
            onFrame: ({ t, riders, traffic }) => {
                for (const r of riders) {
                    const towardCentre = -Route.keepRight(1) * r.ride.off;
                    if (towardCentre < 0.5) continue;
                    outFrames++;
                    const s = sOf(r);
                    if (route.kindAt(s, kind).hairpin > 0.1) bad.push({ t, name: r.riderName, s: Math.round(s), why: 'hairpin' });
                    if (r.inSingleLane || works.siteAt(s)) bad.push({ t, name: r.riderName, s: Math.round(s), why: 'single lane' });
                    for (const car of traffic.cars) if (car.direction < 0 && Math.abs(sOf(car) - s) < 30) bad.push({ t, name: r.riderName, s: Math.round(s), why: 'oncoming car' });
                }
            },
            until: ({ riders }) => nearEnd(riders)
        });
        expect(ride.traffic.group.events.passes).toBeGreaterThan(3);
        expect(outFrames).toBeGreaterThan(300);
        if (bad.length) throw new Error(`${bad.length} frames out toward the centre line where it is not safe:\n${list(bad)}`);
        expect(ride.overlaps).toEqual([]);
    }, 300000);
});

describe('the slowest rider', () => {
    test('pulls in at stopping places now and then, waits off the carriageway, and catches the group up', () => {
        const slow = CHARACTERS.slice().sort((a, b) => (a.group.stop ? a.group.stop.chance : 0) - (b.group.stop ? b.group.stop.chance : 0)).pop();
        const stops = [];
        let current = null, was = 'ride';
        const ride = groupRide({
            rider: byPlace(1), seconds: 1400,
            onFrame: ({ t, riders }) => {
                const me = riders.find(r => r.character === slow);
                const state = me.ride.state;
                if (state === 'wait' && was !== 'wait') {
                    const a = across(me);
                    current = { t, s: Math.round(sOf(me)), off: Math.abs(a.lateral) - Traffic.sizeOf('bike').width / 2 - a.half, place: !!env.places.at(sOf(me), a.lateral), why: me.ride.why };
                    stops.push(current);
                }
                if (current && state === 'out' && was === 'wait') current.waitS = t - current.t;
                // The distance to the nearest other rider, from when it is back on its lane until it stops again
                if (current && current.waitS !== undefined && state === 'ride') {
                    current.rodeS = (current.rodeS || 0) + DT;
                    const near = riders.filter(r => r !== me).map(r => Math.abs(sOf(r) - sOf(me)));
                    if (near.length) {
                        const gap = Math.min(...near);
                        if (current.backGap === undefined) current.backGap = Math.round(gap);
                        current.least = Math.round(Math.min(current.least === undefined ? Infinity : current.least, gap));
                    }
                }
                if (state === 'toWait') current = null;
                was = state;
            },
            until: ({ riders }) => nearEnd(riders)
        });
        const events = ride.traffic.group.events;
        const report = { events, stops };
        if (!(stops.length >= 1)) throw new Error(`the slowest rider never stopped: ${JSON.stringify(report)}`);
        for (const stop of stops) {
            expect(stop.place).toBe(true);
            expect(stop.off).toBeGreaterThanOrEqual(0);
            if (stop.waitS !== undefined) expect(stop.waitS).toBeGreaterThanOrEqual(slow.group.stop.waitS[0] - 1);
        }
        // It comes back to the group: after a stop the nearest other rider comes to under half the distance it was, or
        // to a group's gap (judged after a stop with five minutes of riding before its next stop or the end of the ride:
        // a rider 466 m behind the next after a stop 2 km before the end, at s 10 693, was still 438 m behind it 205 s
        // later, as the leader's ease to 0.7 of its pace is about the slowest rider's own most there)
        const done = stops.filter(stop => stop.backGap !== undefined && stop.rodeS >= 300);
        expect(done.length).toBeGreaterThanOrEqual(1);
        for (const stop of done) if (!(stop.least < Math.max(60, stop.backGap / 2))) throw new Error(`no catch-up after a stop: ${JSON.stringify(report)}`);
        expect(ride.overlaps).toEqual([]);
    }, 300000);
});

describe('the same ride', () => {
    test('the same seed rides the same ride, another seed another, and the group draws nothing from Math.random', () => {
        const trace = seed => {
            const out = [];
            const ride = groupRide({ rider: byPlace(6), seed, at: REVERSE, seconds: 240, onFrame: ({ riders, t }) => { if (Math.round(t * 60) % 30 === 0) out.push(riders.map(r => sOf(r).toFixed(4) + r.ride.off.toFixed(4)).join(',')); } });
            return { out: out.join('|'), draws: ride.draws };
        };
        const a = trace(21), b = trace(21), c = trace(22);
        expect(a.out).toBe(b.out);
        expect(a.out).not.toBe(c.out);
        expect(a.draws).toBe(0);
    }, 300000);

    test('the crew still stop at the roadworks lights: no rider crosses a stop line on red', () => {
        const bad = [];
        const prev = new Map();
        groupRide({
            rider: byPlace(6), cars: true, at: REVERSE, seconds: 1300,
            onFrame: ({ t, riders }) => {
                for (const r of riders) {
                    // (past the line by more than Roadworks.LINE_SLACK_M: a rider standing on the line is held there, not in the lane)
                    const front = sOf(r) + Roadworks.BIKE_HALF_M;
                    const before = prev.get(r);
                    prev.set(r, front);
                    if (before === undefined) continue;
                    for (const site of works.closed) {
                        if (before < site.stopIn + Roadworks.LINE_SLACK_M && front > site.stopIn + Roadworks.LINE_SLACK_M && works.light(site, 1) === 'red' && r.roadworksCommit !== site.id) bad.push({ t, name: r.riderName, site: site.id });
                    }
                }
            },
            until: ({ riders }) => nearEnd(riders)
        });
        if (bad.length) throw new Error(`riders crossed a red light:\n${list(bad)}`);
    }, 300000);
});
