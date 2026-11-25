/**
 * @jest-environment node
 */
// The group in free roam (Traffic.roam, GROUP.roam in js/traffic.js; .agent/system/world.md, "Free roam"): the player
// leads. A rider more than GROUP.roam.aheadM up the road from a riding player pulls in and waits for it; nobody passes
// the player; a player gone off the ride (down a side road) has stopped for the group. And ridden alone, the crew goes
// and stays gone after a restart.
import { describe, test, expect, beforeAll } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';
import { groupRide } from '../helpers/world-group.js';

const game = loadGame(undefined, []);
const { THREE, Traffic, WorldEnvironment, CHARACTERS } = game;
const G = Traffic.GROUP;
let env, route;
beforeAll(async () => {
    const { fetchFn } = diskFetch();
    env = await WorldEnvironment.load(new THREE.Scene(), { id: 'tremola', fetchFn, models: null, digest: async () => '0' });
    env.scenery.buildTile = () => null;
    route = env.route;
}, 300000);

const sOf = v => route.fromUnits(v.currentSegment + v.segmentProgress);
const player = CHARACTERS.find(c => c.place === 3);

describe('the group in free roam', () => {
    test('the player leads: the crew starts behind it, follows it and never passes it', () => {
        let worst = -Infinity, set = false, behind = 0, first = null, nearest = Infinity;
        const { overlaps } = groupRide(game, env, {
            rider: player, seed: 5, seconds: 120,
            // (a quick player and a slow one in turn: the riders keep behind both)
            player: { s: 60, pace: t => (Math.floor(t / 20) % 2 ? 6 : 14) },
            onFrame: ({ t, traffic, riders, playerS }) => {
                if (!set) {
                    traffic.roam = true;
                    traffic.group.playerPlace = null;
                    traffic.gridBehind(playerS);
                    set = true;
                }
                for (const r of riders) {
                    if (!r.bikeGroup.visible || !r.ride || r.ride.aside) continue;
                    worst = Math.max(worst, sOf(r) - playerS);
                    // (the gap to the player, origin to origin)
                    if (t > 10) nearest = Math.min(nearest, playerS - sOf(r));
                }
                if (t < 1 / 30) first = riders.map(r => sOf(r) - playerS);
                if (process.env.DBG && Math.abs(t % 10) < 1 / 60) console.log(t.toFixed(0), playerS.toFixed(0), riders.map(r => [Math.round(sOf(r) - playerS), r.ride.state, r.ride.easing, +r.currentSpeed.toFixed(1), r.ride.capMs === Infinity ? 'inf' : +r.ride.capMs.toFixed(1), r.ride.index, r.ride.pass.phase].join(' ')).join(' | '));
                if (t > 119) behind = riders.filter(r => r.bikeGroup.visible && sOf(r) < playerS).length;
            }
        });
        expect(Math.max(...first)).toBeLessThan(-G.roam.backM + 1);
        expect(worst).toBeLessThan(0);
        expect(behind).toBe(5);
        // (as the player drops from 14 to 6 m/s the riders close in, and never touch it or each other)
        expect(nearest).toBeGreaterThan(4);
        expect(overlaps).toEqual([]);
    }, 300000);

    test('a player gone down a side road has stopped for the group, and the riders ahead go to wait', () => {
        let group = null, at = 0;
        groupRide(game, env, {
            rider: player, seed: 5, at: [300, 260, 220, 180, 140], seconds: 10,
            player: { s: 100, pace: () => 8 },
            onFrame: ({ traffic, playerS }) => {
                traffic.roam = true;
                group = traffic.group;
                at = playerS;
            }
        });
        // Off the ride, traffic reads no lead (Traffic.playerLead: null past the road's edge); the game's vehicle keeps
        // its progress along the ride, routeS
        group.lead = null;
        const away = { crashed: false, routeS: at, speed: 8 };
        group.watchPlayer(1 / 60, away);
        expect(group.halted).toBe(true);
        expect(group.haltS).toBeCloseTo(at, 3);
        // (every rider, behind the player too, goes to wait; none stands on the road)
        for (const ride of group.riders) {
            ride.tickT = 0;
            group.rideOn(ride, 1 / 60);
            expect(['toWait', 'wait']).toContain(ride.state);
        }
        // (and a time trial does not: there a player off the ride is a crash or nothing)
        group.halted = group.standing = false;
        group.traffic.roam = false;
        group.watchPlayer(1 / 60, away);
        expect(group.halted).toBe(false);
    }, 300000);

    test('ridden alone, the crew goes and stays gone after a restart', () => {
        const traffic = new Traffic(new THREE.Scene(), env, player.name);
        expect(traffic.motorcycles.length).toBeGreaterThan(0);
        traffic.dropCrew();
        expect(traffic.motorcycles).toEqual([]);
        expect(traffic.group).toBe(null);
        traffic.reset();
        expect(traffic.motorcycles).toEqual([]);
    }, 300000);
});
