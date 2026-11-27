/**
 * @jest-environment node
 */
// A rider of the group stops only where it should (.agent/system/group.md, "Where a rider stops"). The owner
// (2026-11-27, Tremola km 4.0, a straight with a parapet, the player at 25 mph): "why did some of the group stop here?
// they should only be stopping in the designated stopping places". Two riders stood or crawled in their lane up the
// road from the player.
//
// The whole crew rides every stage of every world (tests/helpers/world-stages.js; WORLD_STAGES narrows them) with a
// careful player at 11 m/s (25 mph) that stands for STAND_S once, a third of the way along, as a player does who stops
// to look or falls at a stop. A rider slower than SLOW_MS for more than SLOW_S fails unless it is:
// - in a stopping place, or going into one (its slot booked: CrewGroup.book);
// - held at a roadworks light, or queued within QUEUE_M behind a vehicle that is slower than SLOW_MS (the player too:
//   the riders behind a player who stands stop with it, as traffic does);
// - near the stage's end (END_M).
// There is no give-way rule at a junction in the group yet, so no stop is let off for one. KNOWN holds the stops that
// fail today by stage and may only shrink.
import { describe, test, expect } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';
import { groupRide } from '../helpers/world-group.js';
import { stagesFor } from '../helpers/world-stages.js';

const game = loadGame(undefined, []);
const { THREE, WorldEnvironment, CHARACTERS, Roadworks } = game;
const DT = 1 / 60;
const byPlace = place => CHARACTERS.find(c => c.place === place);

const SLOW_MS = 2;
const SLOW_S = 2;
const QUEUE_M = 20;
const END_M = 250;
const PACE_MS = 11;
const STAND_S = 20;
const KNOWN = {};

// Why a slow rider is slow, when it is somewhere it may be; null on the open road
function excused(env, r, riders, proxy, sOf) {
    const route = env.route, s = sOf(r), ride = r.ride;
    // (pulling out of a place: off the road until it is back on its lane)
    if (((ride.state === 'wait' || ride.state === 'toWait') && ride.at.place) || (ride.state === 'out' && ride.aside)) return 'place';
    if (s > route.length - END_M) return 'end';
    const works = env.roadworks;
    if (works && (works.stopDistance(r, s, r.direction, Roadworks.BIKE_HALF_M, r.currentSpeed || 0, 5) < 2 * QUEUE_M || works.siteAhead(s, r.direction, 3 * QUEUE_M))) return 'light';
    for (const o of proxy ? [...riders, proxy] : riders) {
        if (o === r || !o.bikeGroup.visible || (o.ride && o.ride.aside)) continue;
        const ahead = sOf(o) - s;
        if (ahead > 0 && ahead < QUEUE_M && (o.currentSpeed || 0) < SLOW_MS) return 'queue';
    }
    return null;
}

function rideStage(env) {
    const route = env.route, sOf = v => route.fromUnits(v.currentSegment + v.segmentProgress);
    const start = route.fromUnits(env.startSegment || 0), standAt = start + (route.length - start) / 3;
    let standT = null;
    const slow = new Map(), stops = [];
    const ride = groupRide(game, env, {
        rider: byPlace(6), seconds: 3000,
        player: { s: start, pace: (t, s) => (standT === null && s >= standAt ? (standT = t, 0) : standT !== null && t < standT + STAND_S ? 0 : PACE_MS) },
        onFrame: ({ riders, proxy, t }) => {
            for (const r of riders) {
                if (!r.bikeGroup.visible || (r.currentSpeed || 0) >= SLOW_MS || excused(env, r, riders, proxy, sOf)) { slow.set(r, 0); continue; }
                const held = (slow.get(r) || 0) + DT;
                slow.set(r, held);
                if (held > SLOW_S && held - DT <= SLOW_S) {
                    const ride = r.ride;
                    stops.push({ t: Math.round(t), place: r.character.place, s: Math.round(sOf(r)), speed: Math.round(r.currentSpeed * 10) / 10, state: ride.state, why: ride.why, easing: ride.easing, creep: ride.creep, roadside: ride.state !== 'ride' && !ride.at.place, player: Math.round(sOf(proxy)) });
                }
            }
        },
        until: ({ riders, playerS }) => playerS > route.length - END_M && riders.every(r => !r.bikeGroup.visible || sOf(r) > route.length - END_M || r.ride.state === 'wait')
    });
    return { stops, events: ride.traffic.group.events };
}

describe('where a rider of the group stops', () => {
    for (const id of stagesFor()) {
        test(`${id}: only in a stopping place, at a light, in a queue or at the end`, async () => {
            const { fetchFn } = diskFetch();
            const env = await WorldEnvironment.load(new THREE.Scene(), { id, fetchFn, models: null, digest: async () => '0' });
            env.scenery.buildTile = () => null;
            const { stops, events } = rideStage(env);
            console.log(`STOPS ${id} ${stops.length} ${JSON.stringify(events)}\n${stops.slice(0, 20).map(x => JSON.stringify(x)).join('\n')}`);
            expect(stops.length).toBeLessThanOrEqual(KNOWN[id] || 0);
        }, 3600000);
    }
});
