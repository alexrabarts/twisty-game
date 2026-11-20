/**
 * @jest-environment node
 */
// Riding off the road is costly, and every cost is one the rider can see. The real Vehicle, the cut rule and the
// off-route restart on the streamed Tremola slice (tests/helpers/world-offroad.js), at full throttle, leaving the road
// on gentle grass beside a straight, on a steep hillside, off the outside of a hairpin, and cutting across the inside
// of every hairpin, at 10, 15, 20 and 30 m/s.
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
import { offRoadPlaces, leaveRoad, rideHairpin, CUTS, ROAD_LINES } from '../helpers/world-offroad.js';
import { decodeWorld } from '../../tools/world/encode.mjs';
import { rideSamples } from '../../tools/world/stations.mjs';
import { findHairpins } from '../../tools/world/verify.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BEFORE = 'aaa6f8c';
const SPEEDS = [10, 15, 20, 30];
// A cut counts as one across the land when it spends this long past the drawn verge: a clip of the verge (drawn as
// part of the road) is not one
const LAND_CUT_S = 0.25;
// The scripted road lines are not the fastest possible, so a land cut that ties one within this is no gain (the closest
// now: 0.09 s, a 6 m clip of 11133-11269 at 20 m/s with 0.77 s on the land; before, cuts gained up to 1.3 s)
const TIE_S = 0.15;
// The best off-road bike in the catalogue and its rider
const TRAIL = { character: 'lucy', bike: 'bike15_crf250' };
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
        if (speed === 30 && !crashedBy(3)) bad.push(`30 m/s held off the road ends within 3 s: ${line}`);
        if (r.at5 !== null && r.at5 > 10) bad.push(`at most 10 m/s 5 s off the road: ${line}`);
        // Up a hillside the bike may stall before the steepest of it: stopped there, it goes nowhere either
        if (place.kind === 'steep' && !crashedBy(5) && !(r.at5 !== null && r.at5 <= 1)) bad.push(`a steep hillside crashes or stalls the bike within 5 s: ${line}`);
    }
    return bad;
}

describe('the Tremola slice off the road', () => {
    let games, envs, places, hairpins;
    beforeAll(async () => {
        games = { after: loadGame(), before: loadGame(undefined, [], { 'vehicle.js': show('vehicle.js'), 'world/physics.js': show('world/physics.js') }) };
        envs = { after: await slice(games.after), before: await slice(games.before) };
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

    // Every scripted cut of every hairpin (or of `only`: [{h, speed}]) on the default bike or on `rider`'s: the land
    // cuts that beat the best road line by more than TIE_S, as {key, h, speed, time, line}, and the best road line of
    // each hairpin and speed (`road`, by `${h.s0} ${speed}`)
    async function landCuts(rider = null, only = null) {
        const game = games.after, env = envs.after;
        const bad = [], rows = [], roads = new Map();
        let cuts = 0, wins = 0, most = -Infinity;
        for (const h of hairpins) {
            for (const speed of SPEEDS) {
                if (only && !only.some(o => o.h === h && o.speed === speed)) continue;
                const road = [];
                for (const plan of ROAD_LINES) {
                    const r = await rideHairpin(game, env, h, plan, { speed, rider });
                    if (r.end === 'exit') road.push(r.time);
                }
                const parts = [], tried = [];
                for (const L of CUTS) {
                    const r = await rideHairpin(game, env, h, { cut: L }, { speed, rider });
                    tried.push({ L, r });
                    // A chord that keeps to the road and its verge is a road line too
                    if (r.end === 'exit' && r.landS < LAND_CUT_S) road.push(r.time);
                    parts.push(`${L}:${r.end === 'exit' ? `${r.time}/${r.landS}` : r.end}`);
                }
                const best = road.length ? Math.min(...road) : Infinity;
                roads.set(`${h.s0} ${speed}`, best);
                for (const { L, r } of tried) {
                    if (r.landS < LAND_CUT_S) continue;
                    cuts++;
                    if (r.end !== 'exit') continue;
                    if (r.time < best) wins++;
                    most = Math.max(most, best - r.time);
                    if (r.time < best - TIE_S) bad.push({ key: `${h.s0}-${h.s1} at ${speed} m/s, cut ${L} m`, h, speed, time: r.time, line: `${h.s0}-${h.s1} at ${speed} m/s, cut ${L} m: ${r.time} s with ${r.landS} s on the land, the road ${best} s` });
                }
                rows.push(`${h.s0}-${h.s1} ${speed}: road ${best} s; ${parts.join(' ')}`);
            }
        }
        return { cuts, wins, most, bad, rows, roads };
    }

    test('now: no cut across the land inside a hairpin beats the road', async () => {
        const { cuts, wins, most, bad, rows } = await landCuts();
        console.log(`hairpin cuts (time/seconds on the land, or how the cut ended):\n${rows.join('\n')}\n${cuts} land cuts, ${wins} under the best road line, by at most ${most.toFixed(2)} s, ${bad.length} by more than ${TIE_S} s`);
        expect(cuts).toBeGreaterThan(50);
        if (bad.length) throw new Error(`${bad.length} cuts beat the road:\n${bad.map(b => b.line).join('\n')}`);
    }, 1800000);

    test('now: the trail single is still slowed hard off the road in its first seconds, and a steep hillside stops it', async () => {
        const rides = [];
        for (const kind of ['grass', 'steep', 'outside']) {
            for (const place of places[kind]) {
                for (const mode of ['exit', 'along']) {
                    for (const speed of SPEEDS) rides.push({ place, mode, speed, r: await leaveRoad(games.after, envs.after, place, { speed, mode, rider: TRAIL }) });
                }
            }
        }
        console.log(`the trail single:\n${rides.map(x => fmt(x.place, x.mode, x.speed, x.r)).join('\n')}`);
        const bad = judge(rides);
        if (bad.length) throw new Error(`${bad.length} rides:\n${bad.join('\n')}`);
    }, 600000);

    // The best off-road bike, the trail single (BIKE_MODELS offroad 1), against the same bar. Its rider's scripted
    // road lines are weaker than the first rider's: on any of her bikes, off-road trait or none, a 20 m chord that
    // clips the land for under a second beats them at two hairpins (the first rider's same chord stays on the road
    // and is his road line). Those cuts are not the trait's, so the bar is held on what the trait adds: a cut that
    // beats the road on the trail single must beat it on the same bike and rider with the trait taken away
    // (rider.offroad 0), by the same TIE_S. The road it must not beat is the better of the two bikes' road lines: the
    // carriageway is the same for both, and a scripted road line that strays onto the land at a 45 degree lean is
    // slowed there by the slide (at 7963-8106 the trait's cut takes the same 23.9 s and its road line 0.3 s more).
    test('now: the off-road trait makes no cut across the land inside a hairpin beat the road', async () => {
        const trail = await landCuts(TRAIL);
        console.log(`the trail single's hairpin cuts:\n${trail.rows.join('\n')}\n${trail.cuts} land cuts, ${trail.wins} under the best road line, by at most ${trail.most.toFixed(2)} s, ${trail.bad.length} by more than ${TIE_S} s`);
        expect(trail.cuts).toBeGreaterThan(50);
        const plain = trail.bad.length ? await landCuts({ ...TRAIL, offroad: 0 }, trail.bad) : { bad: [], roads: new Map() };
        const known = new Set(plain.bad.map(b => b.key));
        console.log(`with the trait taken away, of those:\n${plain.bad.map(b => b.line).join('\n') || 'none'}`);
        const road = b => Math.min(trail.roads.get(`${b.h.s0} ${b.speed}`), plain.roads.get(`${b.h.s0} ${b.speed}`));
        const added = trail.bad.filter(b => !known.has(b.key) && b.time < road(b) - TIE_S);
        if (added.length) throw new Error(`${added.length} cuts beat the road on the trail single and not without its off-road trait:\n${added.map(b => b.line).join('\n')}`);
    }, 3600000);
});
