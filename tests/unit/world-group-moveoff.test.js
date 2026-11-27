/**
 * @jest-environment node
 */
// The group moves off one by one (Traffic.GROUP.moveOff; .agent/system/group.md, "Moving off"). The owner
// (2026-11-27): "when we move off as a group, each rider should have a delay so they don't start moving until some time
// after the bike in front. that way we don't all move at the same time and look unnatural like a train".
//
// On the real Tremola slice at 60 frames a second, three move-offs: the crew standing close behind each other (as in a
// car park's bays: the queue is the order they stand in, front first); the crew held behind a player who stands, then
// rides on (the player is the front of the queue); and riders leaving a stopping place they waited in for the player.
// In each, the riders' start times in queue order are strictly increasing; each rider starts no sooner than its own
// delay after the bike in front moved, and only once that one has ridden its own gap from where it stood; and no
// later than LATE_S after both held, when nothing else holds it.
import { describe, test, expect, beforeAll } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';
import { groupRide } from '../helpers/world-group.js';

const game = loadGame(undefined, []);
const { THREE, Traffic, WorldEnvironment, CHARACTERS } = game;
const G = Traffic.GROUP, O = G.moveOff;
const DT = 1 / 60;
const byPlace = place => CHARACTERS.find(c => c.place === place);
const LATE_S = 1.5;

let env, route;
beforeAll(async () => {
    const { fetchFn } = diskFetch();
    env = await WorldEnvironment.load(new THREE.Scene(), { id: 'tremola', fetchFn, models: null, digest: async () => '0' });
    env.scenery.buildTile = () => null;
    route = env.route;
}, 300000);
const sOf = v => route.fromUnits(v.currentSegment + v.segmentProgress);

// Each one's moves off: [{t, s}] the first frame it is faster than standMs after it stood for stoodS, and where it is
// on every frame after, to read when it had ridden a gap
function watcher() {
    const rows = new Map();
    return {
        rows,
        see(key, speed, s, t) {
            // (one that stands from the first frame has stood, as the group reads it: CrewGroup.watchGo)
            const row = rows.get(key) || rows.set(key, { stoodT: speed < O.standMs ? O.stoodS : 0, goes: [], track: [] }).get(key);
            row.track.push({ t, s });
            if (speed < O.standMs) { row.stoodT += DT; return; }
            if (row.stoodT >= O.stoodS) row.goes.push({ t, s });
            row.stoodT = 0;
        }
    };
}
// When `row` had ridden `metres` from where it moved off at `go`
const rodeBy = (row, go, metres) => { const hit = row.track.find(p => p.t >= go.t && p.s - go.s >= metres); return hit ? hit.t : Infinity; };

// The queue's move-off: each rider of `queue` (front first; the front may be the player) and its first move off after
// `after`. Returns the bad rows
function check(w, queue, after, label) {
    const bad = [], rows = [];
    let prev = null;
    for (const key of queue) {
        const row = w.rows.get(key);
        const go = row && row.goes.find(g => g.t >= after);
        rows.push({ who: key.character ? key.character.place : 'player', t: go ? Math.round(go.t * 100) / 100 : null });
        if (!go) { bad.push({ label, who: rows[rows.length - 1].who, error: 'never moved off' }); break; }
        if (prev) {
            const ride = key.ride, behind = go.t - prev.go.t;
            const opened = rodeBy(prev.row, prev.go, ride.goGapM);
            const ready = Math.max(prev.go.t + ride.goDelayS, opened);
            if (!(behind > 0)) bad.push({ label, who: ride.place, error: 'started with or before the bike in front', behind });
            if (go.t < ready - DT - 1e-9) bad.push({ label, who: ride.place, error: 'started before its delay and gap', behind, delay: ride.goDelayS, gap: ride.goGapM });
            if (go.t > ready + LATE_S) bad.push({ label, who: ride.place, error: 'started late', behind, late: Math.round((go.t - ready) * 100) / 100 });
        }
        prev = { row, go };
    }
    return { bad, rows };
}

describe('the group moves off one by one', () => {
    test('each rider\'s numbers: an eager rider waits less, one that keeps its distance opens a longer gap', () => {
        const t = new Traffic(new THREE.Scene(), env, byPlace(6).name);
        t.group.sync();
        const rides = t.group.riders;
        for (const r of rides) {
            expect(r.goDelayS).toBeGreaterThanOrEqual(O.delayS[1] * (1 - O.spread) - 1e-9);
            expect(r.goDelayS).toBeLessThanOrEqual(O.delayS[0] * (1 + O.spread) + 1e-9);
            expect(r.goGapM).toBeGreaterThanOrEqual(O.gapM[0] * (1 - O.spread) - 1e-9);
            expect(r.goGapM).toBeLessThanOrEqual(O.gapM[1] * (1 + O.spread) + 1e-9);
        }
        const daring = r => game.Vehicle.traitOf(r.bike.character, 'daring');
        const bold = rides.slice().sort((a, b) => daring(b) - daring(a))[0], shy = rides.slice().sort((a, b) => daring(a) - daring(b))[0];
        expect(bold.goDelayS).toBeLessThan(shy.goDelayS);
        const far = rides.slice().sort((a, b) => b.own.gapS - a.own.gapS)[0], near = rides.slice().sort((a, b) => a.own.gapS - b.own.gapS)[0];
        expect(far.goGapM).toBeGreaterThan(near.goGapM);
        t.motorcycles.forEach(m => m.remove());
    });

    test('from standing close behind each other (a car park\'s bays), front first', () => {
        const w = watcher();
        const at = [212, 205, 198, 191, 184];
        let queue = null;
        groupRide(game, env, {
            rider: byPlace(6), at, standing: true, seconds: 40,
            onFrame: ({ riders, t }) => {
                if (!queue) queue = riders.slice().sort((a, b) => sOf(b) - sOf(a));
                for (const r of riders) w.see(r, r.currentSpeed, sOf(r), t);
            }
        });
        const { bad, rows } = check(w, queue, 0, 'bays');
        console.log(`MOVEOFF bays ${JSON.stringify(rows)}`);
        expect(bad).toEqual([]);
    }, 300000);

    test('behind a player who stands, then rides on: the player is the front of the queue', () => {
        const w = watcher();
        const standFrom = 20, standTo = 45;
        let queue = null;
        groupRide(game, env, {
            rider: byPlace(1), at: [2560, 2545, 2530, 2515, 2500], player: { s: 2600, pace: t => (t > standFrom && t < standTo ? 0 : 9) }, seconds: 80,
            onFrame: ({ riders, proxy, t }) => {
                w.see('player', proxy.currentSpeed, sOf(proxy), t);
                for (const r of riders) w.see(r, r.currentSpeed, sOf(r), t);
                if (!queue && t > standTo - 1) queue = riders.filter(r => r.currentSpeed < O.standMs && sOf(proxy) - sOf(r) < G.hold.behindM).sort((a, b) => sOf(b) - sOf(a));
            }
        });
        expect(queue.length).toBeGreaterThanOrEqual(3);
        const { bad, rows: out } = check(w, ['player', ...queue], standTo - 1, 'player');
        console.log(`MOVEOFF player ${JSON.stringify(out)}`);
        expect(bad).toEqual([]);
    }, 300000);

    test('out of a stopping place, one after another', () => {
        const w = watcher();
        const standS = 360, outs = [];
        groupRide(game, env, {
            rider: byPlace(6), at: [2300, 2285, 2270, 2255, 2240], player: { s: 2200, pace: t => (t < 60 ? 6 : t < 60 + standS ? 0 : 14) }, seconds: 1000,
            onFrame: ({ riders, t }) => {
                for (const r of riders) {
                    w.see(r, r.currentSpeed, sOf(r), t);
                    if (r.ride.state === 'wait' && r.ride.at.place) r.lastPlace = r.ride.at.place;
                    if (r.ride.state === 'out' && r.wasState === 'wait' && r.lastPlace) outs.push({ r, place: r.lastPlace, t });
                    r.wasState = r.ride.state;
                }
            },
            until: ({ t, riders }) => t > 60 + standS + 10 && riders.every(r => !r.lastPlace || r.ride.state === 'ride')
        });
        const byPlaceOut = new Map();
        for (const o of outs) (byPlaceOut.get(o.place) || byPlaceOut.set(o.place, []).get(o.place)).push(o);
        const queues = [...byPlaceOut.values()].filter(list => list.length >= 2);
        if (!queues.length) throw new Error(`no two riders left one place: ${JSON.stringify(outs.map(o => ({ place: o.r.character.place, at: o.place.id, t: Math.round(o.t) })))}`);
        const bad = [], report = [];
        for (const list of queues) {
            // (the queue is the order they leave the place in; only their own move-offs are read, so the later
            // gap rule against the bike in front is the place's: CrewGroup.waiting)
            const order = list.map(o => o.r);
            const after = list[0].t - 1;
            const { bad: b, rows } = check(w, order, after, `place ${list[0].place.id}`);
            // (a rider in a place may wait longer for the road behind it to clear: no LATE_S there)
            bad.push(...b.filter(x => x.error !== 'started late'));
            report.push(rows);
        }
        console.log(`MOVEOFF place ${JSON.stringify(report)}`);
        expect(bad).toEqual([]);
    }, 900000);
});
