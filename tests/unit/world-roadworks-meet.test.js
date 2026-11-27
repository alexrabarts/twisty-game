/**
 * @jest-environment node
 */
// No meeting in a roadworks single lane (js/world/roadworks.js; .agent/system/world.md, "Roadworks"): at every closed
// site of every built leg, the world's car coming the other way and a player who keeps to the lights (it stops at its
// line for a light that is not green unless too near to stop, as the traffic does: Roadworks.stopDistance) ride
// through the lane with the site's lights started at each part of their cycle and the car at several places before
// its line. The test fails when both are in the lane between its stop lines at once, the car still coming. (On leg 6
// the probes' pilot met the car in site 5's lane: it came to the line at 7 m/s on red and went on, tools/autopilot.js;
// the lights, their occupancy and the car's stop held here)
import { describe, test, expect } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';
import { putAt } from '../helpers/world-contact.js';
import { stagesFor } from '../helpers/world-stages.js';

const DT = 1 / 60;
// Each site's cycle read every PHASE_STEP_S seconds; the car put this far past the far stop line, coming
const PHASE_STEP_S = 9;
const CAR_AT_M = [10, 150];
// The player's cruise, and how far before its line it starts
const PACE_MS = 20;
const START_M = 300;

const game = loadGame(undefined, []);
const { THREE, Traffic, Roadworks, WorldEnvironment, CHARACTERS } = game;
const { fetchFn } = diskFetch();

// One ride through a site's lane: the first frame both are in it with the car still coming, or null
function ride(env, site, phase, carAt, Bike) {
    const route = env.route, works = env.roadworks;
    const sOf = v => route.fromUnits(v.currentSegment + v.segmentProgress);
    works.reset();
    for (const s of works.closed) s.timer = null;
    works.occupied.clear();
    site.timer = null;
    const offset = site.phaseOffsetS;
    site.phaseOffsetS = phase;
    const traffic = new Traffic(new THREE.Scene(), env, CHARACTERS[0].name);
    traffic.dropCrew();
    const car = traffic.cars[0];
    car.direction = -1;
    putAt(car, route, site.stopOut + carAt);
    const player = new Bike(new THREE.Scene(), env, { direction: 1, speed: 0, startSegment: 0 });
    putAt(player, route, site.stopIn - START_M);
    const mine = { position: player.bikeGroup.position, yawAngle: 0, speed: 0, crashed: false, isJumping: false, worldCrash() { this.crashed = true; } };
    let meet = null;
    try {
        for (let f = 0; f < 60 * 240 && !meet; f++) {
            works.step(DT);
            const ps = sOf(player);
            works.riderS = ps;
            works.riderDirection = 1;
            player.baseSpeed = PACE_MS;
            player.stopM = works.stopDistance(player, ps, 1, Roadworks.BIKE_HALF_M, player.currentSpeed, 5.4);
            player.update(DT, null, [player], []);
            mine.yawAngle = player.bikeGroup.rotation.y;
            mine.speed = player.currentSpeed;
            traffic.update(DT, mine.position, null, mine);
            const p = sOf(player), c = sOf(car);
            const inP = p + Roadworks.BIKE_HALF_M > site.stopIn && p - Roadworks.BIKE_HALF_M < site.stopOut;
            const inC = c + Roadworks.CAR_HALF_M > site.stopIn && c - Roadworks.CAR_HALF_M < site.stopOut;
            if (inP && inC && c > p) meet = { phase, carAt, t: Math.round(f * DT * 10) / 10, player: Math.round(p), car: Math.round(c), lights: [works.light(site, 1), works.light(site, -1)] };
            if (p > site.stopOut + 20) break;
        }
    } finally {
        site.phaseOffsetS = offset;
        traffic.cars.forEach(x => x.remove());
    }
    return meet;
}

describe('no meeting in a roadworks single lane', () => {
    for (const id of stagesFor()) {
        test(`${id}: the car and a player who keeps to the lights never meet in a single lane`, async () => {
            const env = await WorldEnvironment.load(new THREE.Scene(), { id, fetchFn, models: null, digest: async () => '0' });
            env.scenery.buildTile = () => null;
            const works = env.roadworks;
            const sites = works ? works.closed : [];
            // (the bike class of the crew, for a player on its lane line)
            const probe = new Traffic(new THREE.Scene(), env, CHARACTERS[0].name);
            const Bike = probe.motorcycles.length ? probe.motorcycles[0].constructor : null;
            probe.motorcycles.forEach(m => m.remove());
            probe.cars.forEach(c => c.remove());
            if (!sites.length || !Bike || !probe.cars.length) return;
            const meets = [];
            let rides = 0;
            for (const site of sites) {
                if (site.stopIn - START_M < 0 || site.stopOut + Math.max(...CAR_AT_M) + 10 > env.route.length) continue;
                for (let phase = 0; phase < site.cycleS; phase += PHASE_STEP_S) {
                    for (const carAt of CAR_AT_M) {
                        rides++;
                        const meet = ride(env, site, phase, carAt, Bike);
                        if (meet) meets.push({ site: site.id, stopIn: Math.round(site.stopIn), stopOut: Math.round(site.stopOut), ...meet });
                    }
                }
            }
            console.log(`MEET ${id}: ${sites.length} sites, ${rides} rides, ${meets.length} meetings`);
            if (meets.length) throw new Error(`${meets.length} meetings in a single lane:\n${meets.slice(0, 8).map(m => JSON.stringify(m)).join('\n')}`);
        }, 1800000);
    }
});
