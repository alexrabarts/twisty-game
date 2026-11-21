/**
 * @jest-environment node
 */
// The top off-road bike over the map, on the real slice (tests/helpers/world-map.js): the bike at the top of the
// catalogue's off-road scale, the game's own run code (Game.updateWorldRun, the crash steps and restartInPlace on a
// plain object), the real Vehicle, WorldRun and WorldGuide.
//   - it crosses a real open slope from one leg of the ride to another without a crash, and the cut rule then puts it
//     back where it left the road, with one restart and exactly 5 s
//   - a bike with no trait does not get across at any pace
//   - what nobody rides stops it with a cause the rider is shown: water, a wall, a drop, a drawn building
// The places are found by rule in the stage's data, so a new stage is read the same way.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test, expect, beforeAll } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';
import { crossings, rideAcross, hardPlaces, drawnHouses, rideAt, cutThenWander } from '../helpers/world-map.js';
import { byTrait } from '../helpers/world-offroad-measure.js';
import { decodeWorld } from '../../tools/world/encode.mjs';
import { rideSamples } from '../../tools/world/stations.mjs';
import { findHairpins } from '../../tools/world/verify.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const game = loadGame();
const CAUSES = ['Rode into the water', 'Hit the wall', 'Went over the edge of a drop', 'Went over the edge of a steep drop', 'Rode onto a slope too steep to hold', 'Rode into a building', 'Rode off the edge of the mapped land'];

describe('the top off-road bike over the map', () => {
    let env, hairpins, top, plain, penalty;
    beforeAll(async () => {
        const { fetchFn } = diskFetch();
        env = await game.WorldEnvironment.load(new game.THREE.Scene(), { id: 'tremola', fetchFn, models: null, digest: async () => '0' });
        const world = decodeWorld(path.join(REPO, 'world'));
        hairpins = findHairpins(rideSamples(world.edges, world.ride.path));
        const bikes = byTrait(game);
        top = bikes[0];
        plain = bikes[bikes.length - 1];
        expect([top.trait, plain.trait]).toEqual([1, 0]);
        penalty = 5000;
    }, 300000);

    test('it crosses an open slope from one leg of the ride to another without a crash, and the cut rule puts it back with exactly one 5 s', async () => {
        const places = await crossings(game, env, hairpins);
        expect(places.length).toBeGreaterThanOrEqual(3);
        const lines = [];
        let crossed = 0;
        for (const place of places) {
            const r = await rideAcross(game, env, place, { rider: top });
            lines.push(`${place.s} to ${place.s2}, ${Math.round(place.d)} m over the land: ${r.joinedS === null ? `not across (${r.crashes[0] || r.callouts.map(c => c[0]).join('; ') || 'time'})` : `across in ${r.landS.toFixed(1)} s, ${Math.round(r.landM)} m of land, at most ${r.most.toFixed(1)} m/s, slope to ${r.steepest.toFixed(2)}`}; left the road at ${r.leftS === null ? '-' : Math.round(r.leftS)}, put back at ${r.backS === null ? '-' : Math.round(r.backS)}, ${r.restarts} restarts, +${r.penaltyMs / 1000} s (${r.callouts.map(c => c[0]).join('; ')})`);
            // However the ride ends, one stay off the road costs one restart, and a crash names its cause
            expect([place.s, r.restarts <= 1, r.penaltyMs === r.restarts * penalty]).toEqual([place.s, true, true]);
            for (const cause of r.crashes) expect([place.s, CAUSES.includes(cause) || /^Hit the /.test(cause || '')]).toEqual([place.s, true]);
            if (r.joinedS === null) continue;
            crossed++;
            // Across: no crash on the way, at a pace, onto the far leg's carriageway well ahead
            expect([place.s, r.crashes]).toEqual([place.s, []]);
            expect(r.joinedS - r.leftS).toBeGreaterThan(80);
            expect(r.landM).toBeGreaterThan(place.d / 2);
            expect(r.most).toBeGreaterThan(8);
            // And not counted: the cut rule, once, with exactly 5 s, back where the bike left the road
            expect([place.s, r.cuts, r.restarts, r.penaltyMs]).toEqual([place.s, 1, 1, penalty]);
            expect(r.callouts.map(c => c[0])).toEqual(['Cut the road, back where you left it +5 s']);
            expect(r.backS).toBeLessThanOrEqual(r.leftS + 0.5);
            expect(r.backS).toBeGreaterThanOrEqual(r.leftS - env.physics.restartBackM - 2.5);
        }
        console.log(`the top bike from leg to leg:\n${lines.join('\n')}`);
        expect(crossed).toBeGreaterThanOrEqual(1);
    }, 900000);

    // The owner: a cut never counts. Metres ridden on the land after the cut (a loop, a zigzag) do not pay it back:
    // WorldRun holds a stay off the road to the most road it had skipped. Every hairpin of the stage is cut over the
    // land by 30 m each side of its tightest point; with over cutSkipM + 3 m skipped the bike then rides up to 90 m
    // more on the land before it steers back to the road
    test('a hairpin cut by more than the allowance, then a loop or a zigzag on the land, is still a cut: one restart, one 5 s', async () => {
        const most = env.physics.cutSkipM;
        const lines = [];
        let cuts = 0, paid = 0;
        for (const hairpin of hairpins) {
            for (const mode of ['loop', 'zigzag']) {
                const r = await cutThenWander(game, env, hairpin, { rider: top, mode, after: most + 3, wanderM: 90 });
                if (!(r.skipped > most + 3)) continue;
                lines.push(`${hairpin.s0}-${hairpin.s1} ${mode}: ${r.skipped.toFixed(1)} m of road skipped, then ${Math.round(r.wanderM)} m more on the land: ${r.crashes.length ? `crash (${r.crashes[0]})` : r.cuts ? 'cut' : r.wentBack ? 'turned back to the road it left' : 'never back on the road'}, ${r.restarts} restarts, +${r.penaltyMs / 1000} s, left the road at ${r.leftS === null ? '-' : Math.round(r.leftS)}, back at ${r.backS === null ? '-' : Math.round(r.backS)}`);
                // One stay off the road is one restart at the most, with its 5 s, and a crash names its cause
                expect([hairpin.s0, mode, r.restarts <= 1, r.penaltyMs === r.restarts * penalty]).toEqual([hairpin.s0, mode, true, true]);
                for (const cause of r.crashes) expect([hairpin.s0, typeof cause === 'string' && cause.length > 8]).toEqual([hairpin.s0, true]);
                // Never counted: the run's progress stays short of the road past the hairpin unless the game put the bike back
                // (a loop that brings the bike back onto the road where it left it is a rider who turned back: free, and it rides on)
                if (r.restarts === 0) expect([hairpin.s0, mode, r.wentBack || r.countedS < r.apexS]).toEqual([hairpin.s0, mode, true]);
                if (r.crashes.length || r.restarts === 0 || r.wentBack) continue;
                expect([hairpin.s0, mode, r.cuts, r.restarts, r.penaltyMs]).toEqual([hairpin.s0, mode, 1, 1, penalty]);
                expect(r.callouts.map(c => c[0])).toEqual(['Cut the road, back where you left it +5 s']);
                if (r.leftS !== null) expect(r.backS).toBeLessThanOrEqual(r.leftS + 0.5);
                cuts++;
                // (with more metres ridden on the land than road skipped, the sum was back at nothing: the peak is what holds it)
                if (r.wanderM > r.skipped + 5) paid++;
            }
        }
        console.log(`a hairpin cut, then more metres on the land:\n${lines.join('\n')}\n${cuts} cuts, ${paid} of them after more metres on the land than road skipped`);
        expect(cuts).toBeGreaterThanOrEqual(10);
        expect(paid).toBeGreaterThanOrEqual(1);
    }, 1200000);

    test('a bike with no trait does not get across the same slope at a pace, and nothing counts it either', async () => {
        const places = await crossings(game, env, hairpins);
        const lines = [];
        for (const place of places) {
            const mine = await rideAcross(game, env, place, { rider: top });
            if (mine.joinedS === null) continue;
            const r = await rideAcross(game, env, place, { rider: plain });
            lines.push(`${place.s}: ${r.joinedS === null ? 'not across' : 'across'} after ${r.landS.toFixed(1)} s and ${Math.round(r.landM)} m on the land; the top bike ${mine.landS.toFixed(1)} s`);
            // Slower over the land by far, or not there at all; and if it does arrive it is a cut as well
            if (r.joinedS === null) expect(r.landM).toBeLessThan(mine.landM);
            else {
                expect(r.landS).toBeGreaterThan(2 * mine.landS);
                expect([r.cuts, r.penaltyMs]).toEqual([1, penalty]);
            }
        }
        console.log(`a bike with no trait on the slopes the top bike crosses:\n${lines.join('\n')}`);
        expect(lines.length).toBeGreaterThanOrEqual(1);
    }, 900000);

    test('water, a wall and a drop still stop it, each with a cause the rider is shown', async () => {
        const hard = await hardPlaces(game, env);
        const lines = [], seen = { wall: new Map(), drop: new Map(), water: new Map() };
        for (const kind of Object.keys(hard)) {
            expect([kind, hard[kind].length >= 3]).toEqual([kind, true]);
            for (const place of hard[kind]) {
                const r = await rideAt(game, env, place, { rider: top });
                lines.push(`${kind} ${place.at} m off the road at ${place.s}: ${r.end}${r.cause ? ` (${r.cause})` : ''} after ${Math.round(r.landM)} m of land`);
                const key = r.end === 'crash' ? r.cause : r.end;
                seen[kind].set(key, (seen[kind].get(key) || 0) + 1);
                if (r.end === 'crash') expect([kind, place.s, CAUSES.includes(r.cause) || /^Hit the /.test(r.cause || '')]).toEqual([kind, place.s, true]);
            }
        }
        console.log(`the top bike at what nobody rides:\n${lines.join('\n')}`);
        // Water stops it every time
        expect([...seen.water.keys()]).toEqual(['Rode into the water']);
        // A wall of the tile data is a wall, or land too steep for any bike: never ridden through
        expect(seen.wall.get('Hit the wall')).toBeGreaterThanOrEqual(3);
        expect(seen.wall.has('through')).toBe(false);
        // A drop of the tile data is a parapet, an edge to go over, or (where the land shows no drop) plain land
        const fell = (seen.drop.get('Went over the edge of a drop') || 0) + (seen.drop.get('Went over the edge of a steep drop') || 0) + (seen.drop.get('Hit the wall') || 0) + (seen.drop.get('Rode onto a slope too steep to hold') || 0);
        expect(fell).toBeGreaterThanOrEqual(3);
    }, 900000);

    test('a real drop is gone over, by name', async () => {
        // (drops are mostly behind a retaining wall's parapet: the first one with no parapet, of all of them)
        const hard = await hardPlaces(game, env, { every: 20, perKind: 60, apart: 50 });
        let cause = null;
        for (const place of hard.drop) {
            const r = await rideAt(game, env, place, { rider: top, seconds: 12 });
            if (r.end === 'crash' && /edge of a (steep )?drop/.test(r.cause)) { cause = r.cause; break; }
        }
        expect(cause).toMatch(/^Went over the edge of a (steep )?drop$/);
    }, 900000);

    test('a drawn building stops it, and no bike is ever inside one', async () => {
        const houses = await drawnHouses(game, env);
        expect(houses.length).toBeGreaterThanOrEqual(3);
        const lines = [];
        let hit = 0;
        for (const house of houses) {
            for (const rider of [top, plain]) {
                const r = await rideAt(game, env, house, { rider, seconds: 25 });
                lines.push(`the house at ${Math.round(house.s)} on ${rider.bike}: ${r.end}${r.cause ? ` (${r.cause})` : ''}, nearest ${r.near.toFixed(1)} m from its middle`);
                expect([house.s, rider.bike, r.inside]).toEqual([house.s, rider.bike, false]);
                expect(r.end).not.toBe('through');
                if (rider === top && r.end === 'crash' && r.cause === 'Rode into a building') hit++;
            }
        }
        console.log(`drawn buildings:\n${lines.join('\n')}`);
        expect(hit).toBeGreaterThanOrEqual(3);
    }, 900000);

    test('the land past the tiles the world has in detail is not ridden', () => {
        const ground = env.ground;
        const keys = env.data.manifest.tiles.height;
        const m = game.WorldData.TILE_M;
        const [tx, tz] = keys[0];
        expect(ground.mapped((tx + 0.5) * m, (tz + 0.5) * m)).toBe(true);
        const far = Math.max(...keys.map(k => k[0])) + 3;
        expect(ground.mapped((far + 0.5) * m, (tz + 0.5) * m)).toBe(false);
        // A bike on the land there falls with the cause, whatever it is
        for (const rider of [top, plain]) {
            const v = new game.Vehicle(new game.THREE.Scene(), null, game.CHARACTERS.find(c => c.id === rider.character), rider.bike, { model: false });
            v.environment = { ...env, physics: env.physics, ground: { groundY: () => 100, waterLevel: () => null, mapped: () => false }, scenery: null };
            v.runoff = { grip: 0.5 };
            v.getSegmentSearchRange = () => ({ start: 0, end: 1 });
            v.worldLand(1 / 60);
            expect([rider.bike, v.crashed, v.crashCause]).toEqual([rider.bike, true, 'Rode off the edge of the mapped land']);
        }
    });
});
