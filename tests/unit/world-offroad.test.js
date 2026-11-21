/**
 * @jest-environment node
 */
// Riding off the road is costly on a road bike, and every cost is one the rider can see. The real Vehicle, the cut
// rule and the off-route restart on the streamed Tremola slice (tests/helpers/world-offroad.js), at full throttle,
// leaving the road on gentle grass beside a straight, on a steep hillside, off the outside of a hairpin, and cutting
// across the inside of every hairpin.
//
// A cut is not counted, on any bike. Before c111f28's successor the land's low speed was what held a cut ("no cut
// beats the road line by more than 0.15 s", with an off-road bike's pace given 2 s late for it). An off-road bike
// now has its pace at once, and the cut rule holds the cut instead (WorldRun `skip`): a ride that skips more road
// over the land than WorldPhysics.cutSkipM is never counted, and the rider is put back where the bike left the road.
//
// Before (aaa6f8c) the land past the road was mostly the tile's carved bench (its 'shoulder', 0.1/s of drag and no
// clock) or one of its road nodes (no drag, and the off-road clock reset): at full throttle the bike gained speed off
// the road (10 m/s at the edge, 23 m/s 2 s later, 28-33 m/s riding along the grass) and only a 10 s timer or a wall
// far out ended it; and cutting inside a hairpin across the land beat the best road line in 19 of 560 cuts (by up to 1.3 s).
import { describe, test, expect, beforeAll } from '@jest/globals';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadGame } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';
import { offRoadPlaces, leaveRoad, rideHairpin, CUTS } from '../helpers/world-offroad.js';
import { byTrait } from '../helpers/world-offroad-measure.js';
import { decodeWorld } from '../../tools/world/encode.mjs';
import { rideSamples } from '../../tools/world/stations.mjs';
import { findHairpins } from '../../tools/world/verify.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BEFORE = 'aaa6f8c';
const SPEEDS = [10, 15, 20, 30];
// The speeds the hairpin cuts are tried at: a hairpin pace and the pace the top bike holds on open grass
const CUT_SPEEDS = [10, 17];
// The road skipped is measured from the bike's positions a frame at a time: this much over the allowance is the
// measure's own slack, not a cut that was counted
const SKIP_SLACK_M = 1;
const show = file => execFileSync('git', ['show', `${BEFORE}:js/${file}`], { encoding: 'utf8', maxBuffer: 1 << 26 });

async function slice(game) {
    const { fetchFn } = diskFetch();
    const env = await game.WorldEnvironment.load(new game.THREE.Scene(), { id: 'tremola', fetchFn, models: null, digest: async () => '0' });
    env.scenery.buildTile = () => null;
    return env;
}

const fmt = (place, mode, speed, r) => `${place.kind} ${place.s}${place.side > 0 ? 'R' : 'L'} ${mode} ${speed}: ${r.end} after ${r.endS} s, entry ${r.entry}, 2 s ${r.at2}, 5 s ${r.at5}, ${r.offM} m off${r.cause && r.end === 'crash' ? ` (${r.cause})` : ''}`;

// The off-road rules, as failures: [] when every ride is costly
function judge(rides) {
    const bad = [];
    for (const { place, mode, speed, r } of rides) {
        const line = fmt(place, mode, speed, r);
        const crashedBy = s => r.end !== 'ride' && r.endS !== null && r.endS <= s;
        if (place.kind === 'grass' && speed >= 20 && !crashedBy(2) && !(r.at2 !== null && r.at2 <= speed / 2)) bad.push(`at least half the speed gone in 2 s: ${line}`);
        // (the cut rule no longer judges a bike on the land, so a ride it used to end there may go on: then the bike
        // must be at a standstill, which is as far from 30 m/s as a crash is)
        if (speed === 30 && !crashedBy(3) && !(r.at5 !== null && r.at5 <= 1)) bad.push(`30 m/s held off the road ends within 3 s, or the bike has stopped in 5 s: ${line}`);
        if (r.at5 !== null && r.at5 > 10) bad.push(`at most 10 m/s 5 s off the road: ${line}`);
        // Up a hillside the bike may stall before the steepest of it: stopped there, it goes nowhere either
        if (place.kind === 'steep' && !crashedBy(5) && !(r.at5 !== null && r.at5 <= 1)) bad.push(`a steep hillside crashes or stalls the bike within 5 s: ${line}`);
    }
    return bad;
}

describe('the Tremola slice off the road', () => {
    // TRAIL: the bike at the top of the off-road scale and a rider who has it, from the catalogue
    let games, envs, places, hairpins, TRAIL;
    beforeAll(async () => {
        games = { after: loadGame(), before: loadGame(undefined, [], { 'vehicle.js': show('vehicle.js'), 'world/physics.js': show('world/physics.js') }) };
        envs = { after: await slice(games.after), before: await slice(games.before) };
        TRAIL = byTrait(games.after)[0];
        expect(TRAIL.trait).toBe(1);
        const world = decodeWorld(path.join(REPO, 'world'));
        hairpins = findHairpins(rideSamples(world.edges, world.ride.path));
        places = await offRoadPlaces(games.after, envs.after, hairpins);
    }, 900000);

    async function leave(name, kinds) {
        const rides = [];
        for (const kind of kinds) {
            for (const place of places[kind]) {
                for (const mode of ['exit', 'along']) {
                    for (const speed of SPEEDS) rides.push({ place, mode, speed, r: await leaveRoad(games[name], envs[name], place, { speed, mode }) });
                }
            }
        }
        return rides;
    }

    test('places of each kind were found', () => {
        for (const kind of ['grass', 'steep', 'outside', 'inside']) expect(places[kind].length).toBeGreaterThanOrEqual(1);
    });

    test('before: the land cost nothing (the check fails on aaa6f8c)', async () => {
        const rides = await leave('before', ['grass', 'steep']);
        const bad = judge(rides);
        console.log(`before (${BEFORE}):\n${rides.map(x => fmt(x.place, x.mode, x.speed, x.r)).join('\n')}`);
        expect(bad.length).toBeGreaterThan(0);
    }, 600000);

    test('now: off the road the bike slows hard, held fast it crashes, and a steep hillside crashes it', async () => {
        const rides = await leave('after', ['grass', 'steep', 'outside']);
        console.log(`now:\n${rides.map(x => fmt(x.place, x.mode, x.speed, x.r)).join('\n')}`);
        const bad = judge(rides);
        if (bad.length) throw new Error(`${bad.length} rides:\n${bad.join('\n')}`);
    }, 600000);

    // Every scripted cut of every hairpin on the default bike or on `rider`'s, at each of `speeds`: how each ride ended
    // ('exit': the run counted the hairpin's exit) and the road it skipped
    async function cuts(rider, speeds) {
        const game = games.after, env = envs.after;
        const rides = [], rows = [];
        for (const h of hairpins) {
            for (const speed of speeds) {
                const parts = [];
                for (const L of CUTS) {
                    const r = await rideHairpin(game, env, h, { cut: L }, { speed, rider, seconds: 45 });
                    rides.push({ h, speed, L, r, line: `${h.s0}-${h.s1} at ${speed} m/s, cut ${L} m: ${r.end}${r.end === 'crash' ? ` (${r.cause})` : ''}, ${r.landS} s on the land, ${r.landSkipM} m of road skipped over the land (${r.netSkipM} m when it came back), ${r.skipM} m off the carriageway` });
                    parts.push(`${L}:${r.end === 'exit' ? r.time : r.end}/${r.landS}/${r.landSkipM}`);
                }
                rows.push(`${h.s0}-${h.s1} ${speed}: ${parts.join(' ')}`);
            }
        }
        return { rides, rows };
    }

    // The rule, as failures: a ride the run counted skipped no more road over the land than the allowance; a ride
    // ended as a cut did skip road (nobody is put back for nothing); and every crash has a cause the rider is shown.
    // A ride that never came back to the road in its 45 s ('timeout') was not counted either
    function judgeCuts(rides) {
        const most = games.after.WorldPhysics.cutSkipM;
        const bad = [];
        for (const { r, line } of rides) {
            if (r.end === 'exit' && r.landSkipM > most + SKIP_SLACK_M) bad.push(`counted with road skipped: ${line}`);
            if (r.end === 'cut' && Math.max(r.skipM, r.landSkipM) < most - SKIP_SLACK_M) bad.push(`a cut with no road skipped: ${line}`);
            if (r.end === 'crash' && (!r.cause || r.cause === 'crash')) bad.push(`a crash with no cause: ${line}`);
        }
        return bad;
    }

    test('now: a cut across the land inside a hairpin is not counted on a road bike', async () => {
        const { rides, rows } = await cuts(null, CUT_SPEEDS.slice(0, 1));
        const ended = kind => rides.filter(x => x.r.end === kind).length;
        const most = Math.max(0, ...rides.filter(x => x.r.end === 'exit').map(x => x.r.landSkipM));
        console.log(`a road bike's hairpin cuts (time or how it ended / seconds on the land / road skipped over the land):\n${rows.join('\n')}\n${rides.length} rides: ${ended('exit')} counted (most road skipped over the land ${most} m), ${ended('cut')} cuts, ${ended('crash')} crashes`);
        expect(rides.length).toBeGreaterThan(150);
        const bad = judgeCuts(rides);
        if (bad.length) throw new Error(`${bad.length} rides:\n${bad.join('\n')}`);
    }, 1800000);

    test('now: a cut is not counted on the top off-road bike at its own pace, and the rule finds the cuts', async () => {
        const { rides, rows } = await cuts(TRAIL, CUT_SPEEDS);
        const ended = kind => rides.filter(x => x.r.end === kind);
        const counted = ended('exit');
        // (cuts whose sum had come back under the allowance by the time the bike rejoined: metres ridden on the land after the skip, which no longer pay it back)
        const paid = ended('cut').filter(x => x.r.netSkipM <= games.after.WorldPhysics.cutSkipM && x.r.landSkipM > games.after.WorldPhysics.cutSkipM);
        console.log(`the top bike's hairpin cuts (time or how it ended / seconds on the land / road skipped over the land):\n${rows.join('\n')}\n${rides.length} rides: ${counted.length} counted (most road skipped over the land ${Math.max(0, ...counted.map(x => x.r.landSkipM))} m), ${ended('cut').length} cuts, ${ended('crash').length} crashes; ${paid.length} of the cuts had ridden the skip off on the land before they rejoined:\n${paid.map(x => x.line).join('\n')}`);
        expect(rides.length).toBeGreaterThan(300);
        const bad = judgeCuts(rides);
        if (bad.length) throw new Error(`${bad.length} rides:\n${bad.join('\n')}`);
        // The rule is not idle: with the pace the bike now has, many of these lines reach the road ahead and are cuts
        expect(ended('cut').length).toBeGreaterThan(40);
        // And the hairpins are still ridden: a line that keeps to the road and its verge is counted
        expect(counted.length).toBeGreaterThan(60);
    }, 3600000);

    test('now: the top off-road bike holds a real pace on open grass beside the road: no crash, no cut, 12 to 18 m/s', async () => {
        const game = games.after, env = envs.after;
        const lines = [];
        for (const place of places.grass) {
            for (const speed of [10, 17, 30]) {
                // (the place is known to be open for its first metres: 3 s of it)
                const r = await leaveRoad(game, env, place, { speed, mode: 'along', rider: TRAIL, seconds: 3 });
                lines.push(fmt(place, 'along', speed, r));
                expect([place.s, speed, r.end]).toEqual([place.s, speed, 'ride']);
                expect(r.at2).toBeGreaterThanOrEqual(12);
                expect(r.at2).toBeLessThanOrEqual(18);
            }
        }
        console.log(`the top bike beside the road:\n${lines.join('\n')}`);
        expect(lines.length).toBeGreaterThanOrEqual(3);
    }, 600000);

    test('now: every crash of the top off-road bike off the road has a cause the rider is shown', async () => {
        const game = games.after, env = envs.after;
        const lines = [], causes = new Set();
        for (const kind of ['grass', 'steep', 'outside']) {
            for (const place of places[kind]) {
                for (const speed of SPEEDS) {
                    const r = await leaveRoad(game, env, place, { speed, mode: 'exit', rider: TRAIL, seconds: 15 });
                    lines.push(fmt(place, 'exit', speed, r));
                    if (r.end === 'crash') {
                        causes.add(r.cause);
                        expect([place.s, speed, typeof r.cause === 'string' && r.cause.length > 8 && !/^CRASHED/.test(r.cause)]).toEqual([place.s, speed, true]);
                    }
                }
            }
        }
        console.log(`the top bike leaving the road:\n${lines.join('\n')}\ncauses: ${[...causes].join('; ')}`);
    }, 600000);
});
