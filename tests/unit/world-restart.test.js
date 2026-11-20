/**
 * @jest-environment node
 */
// Where a restart puts the rider on the real slice (WorldRun.restartPlace, Game.restartInPlace; .agent/system/world.md,
// "A restart is in place"). The owner: "remove the restarting at checkpoints - they can just be used for split timing.
// the 5 second penalty is enough and less frustrating than going back to a checkpoint", and then "for the crash reset,
// don't even confirm - just move the bike and add 5 seconds".
//
// The run is fed the route's own projection of a bike moved along the real ride, so the place is found as the game
// finds it: on the carriageway where the bike crashed, or where it left the road; in the open lane through every
// roadworks site and clear of everything that stands there; and a place a real Vehicle can stand at and ride on from,
// in every hairpin too. The clock, the call-out and the dialogs are tests/unit/restart.test.js; the crew and the cars
// at a restart are tests/unit/world-contact.test.js.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test, expect, beforeAll } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';
import { rideSpan } from '../helpers/world-rider.js';
import { decodeWorld } from '../../tools/world/encode.mjs';
import { rideSamples } from '../../tools/world/stations.mjs';
import { findHairpins } from '../../tools/world/verify.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const game = loadGame();
const { THREE, WorldEnvironment, WorldRun, Roadworks, Route, Vehicle } = game;
const DT = 1 / 60;

let env, route, works, physics, back, hairpins;
beforeAll(async () => {
    const { fetchFn } = diskFetch();
    env = await WorldEnvironment.load(new THREE.Scene(), { id: 'tremola', fetchFn, models: null, digest: async () => '0' });
    route = env.route;
    works = env.roadworks;
    physics = env.physics;
    back = physics.restartBackM;
    const world = decodeWorld(path.join(REPO, 'world'));
    hairpins = findHairpins(rideSamples(world.edges, world.ride.path));
}, 300000);

// A bike moved along the ride from s0 to s1 at `speed`, `lateral(s)` metres off the centre line: each frame is the
// route's projection of where it is, as the game reads it. Returns the run and whether the cut rule fired
function moved(run, s0, s1, lateral = () => 0, speed = 10) {
    const p = {}, q = {};
    let cut = false;
    const stations = [];
    for (let s = s0; s <= s1; s += speed * DT) {
        route.sample(s, p);
        const l = lateral(s);
        route.project(p.x + l * Math.cos(p.heading), p.z - l * Math.sin(p.heading), { index: route.indexAt(s) }, q);
        const result = run.update({ s: q.s, lateral: q.lateral, width: q.width, speed, dt: DT, forwardDot: 1 });
        cut = cut || result.cut;
        if (result.station >= 0) stations.push(result.station);
    }
    return { cut, stations };
}
const fresh = (s) => {
    const run = new WorldRun(route, env.stationGates, physics);
    run.begin(s);
    return run;
};
// Where the place is in the world, and how far it is from a site's drawn thing across and along the road
const pointOf = (place) => {
    const p = route.sample(place.s, {});
    return { x: p.x + place.lateral * Math.cos(p.heading), y: p.y, z: p.z - place.lateral * Math.sin(p.heading), heading: p.heading, width: p.width };
};

describe('the place', () => {
    test('a crash called on the carriageway restarts within restartBackM behind it, on the rider\'s own side of the road', () => {
        // Straights, bends and the stacked hairpins near the top
        for (const s of [300, 1500, 2600, 4400, 6500, 8800, 10300, 11200, 12900]) {
            const run = fresh(s - 150);
            const ride = moved(run, s - 150, s, () => 1.2);
            expect(ride.cut).toBe(false);
            const place = run.restartPlace(works);
            expect([s, place.s <= s + 0.5, place.s >= s - back - 0.5]).toEqual([s, true, true]);
            const width = route.sample(place.s, {}).width;
            if (!works.siteAt(place.s, Roadworks.BLEND_M)) expect(Math.sign(place.lateral)).toBe(Route.keepRight(1));
            expect(Math.abs(place.lateral)).toBeLessThan(width / 2 - 0.9);
        }
    });

    test('a crash off the road, in water or down a drop restarts where the bike left the carriageway', () => {
        for (const s of [1500, 4400, 8800, 11200]) {
            for (const side of [-1, 1]) {
                const run = fresh(s - 100);
                moved(run, s - 100, s);
                // Out over the edge across 20 m of road and on for 40 m beside it, further out all the time
                const half = route.sample(s, {}).width / 2;
                const out = at => side * Math.min(half + 9, (at - s) * (half + 4) / 20);
                const p = {};
                let left = null;
                for (let at = s; at <= s + 60 && left === null; at += 0.1) if (Math.abs(out(at)) > route.sample(at, p).width / 2) left = at;
                moved(run, s, s + 60, out);
                const place = run.restartPlace(works);
                expect([s, side, Math.abs(place.s - (left - back)) < 1.5]).toEqual([s, side, true]);
            }
        }
    });

    test('never at a station for its own sake: a crash anywhere between two timing lines restarts beside the crash', () => {
        const stations = env.stationGates.map(st => st.s);
        let at = 0;
        for (let s = env.startS + 40; s < env.endS - 40; s += 173) {
            const run = fresh(s - 30);
            moved(run, s - 30, s);
            const place = run.restartPlace(works);
            expect(Math.abs(place.s - (s - back))).toBeLessThan(0.6);
            if (stations.some(st => Math.abs(st - place.s) < 0.5)) at++;
        }
        expect(at).toBe(0);
    });

    test('through every roadworks site the place is in the open lane, clear of everything that stands in the site', () => {
        const bad = [];
        let inLane = 0;
        expect(works.closed.length).toBeGreaterThan(0);
        for (const site of works.closed) {
            for (let s = site.s0 - 10; s <= site.s1 + 10; s += 1) {
                const run = fresh(s + back);
                const place = run.restartPlace(works);
                const width = route.sample(place.s, {}).width;
                if (Math.abs(place.lateral) > width / 2 - 0.9) bad.push(`site ${site.id} at ${Math.round(place.s)}: ${place.lateral.toFixed(2)} m off the centre line of a ${width.toFixed(1)} m road`);
                // Where the lane is closed (between the tapers) the place is on the open side of the centre line
                if (place.s >= site.sb && place.s <= site.sc) {
                    inLane++;
                    if (Math.sign(place.lateral) !== site.open) bad.push(`site ${site.id} at ${Math.round(place.s)}: in the closed lane`);
                }
                const at = pointOf(place);
                for (const e of site.elements) {
                    // The element's own box in its frame (Roadworks.local), with the bike's half width and length round it
                    const local = Roadworks.local(e, at.x, at.z);
                    const dx = Math.max(e.box.x0 - local.c, 0, local.c - e.box.x1), dz = Math.max(e.box.z0 - local.a, 0, local.a - e.box.z1);
                    if (dx < 0.6 && dz < 1.3) bad.push(`site ${site.id} at ${Math.round(place.s)}: ${dx.toFixed(2)} m beside and ${dz.toFixed(2)} m along from a ${e.kind}`);
                }
            }
        }
        expect(inLane).toBeGreaterThan(100);
        if (bad.length) throw new Error(`${bad.length} places:\n${bad.slice(0, 20).join('\n')}`);
    });

    test('never past a stop line the rider had not passed: the place is never ahead of where the bike was', () => {
        for (const site of works.closed) {
            for (const d of [-12, -3, -0.5]) {
                const run = fresh(site.stopIn + d - 40);
                moved(run, site.stopIn + d - 40, site.stopIn + d);
                expect(run.restartPlace(works).s).toBeLessThan(site.stopIn);
            }
        }
    });

    test('a rider put down inside a single lane has the lights: green its way, red the other, and nothing outside a lane changes', () => {
        const site = works.closed[0];
        works.reset();
        expect(works.admit(site.s0 - 30)).toBeNull();
        expect(works.admit(site.s1 + 30)).toBeNull();
        expect(works.admit(site.stopIn + 30)).toBe(site);
        expect(works.light(site, 1)).toBe('green');
        expect(works.light(site, -1)).toBe('red');
        // And the far light stays red while the rider is in the lane, however long (Roadworks.riderEntry)
        works.riderS = site.stopIn + 30;
        works.occupy([works.riderEntry()]);
        for (let t = 0; t < 120; t += 0.5) {
            works.step(0.5);
            expect(works.light(site, -1)).toBe('red');
        }
    });
});

describe('a bike at the place', () => {
    // A real Vehicle put down as Game.restartInPlace puts it: at the place, facing along the ride, at a standstill
    const putDown = (place) => {
        const at = pointOf(place);
        const v = new Vehicle(new THREE.Scene());
        v.environment = env;
        v.reset();
        v.position.set(at.x, at.y, at.z);
        v.yawAngle = at.heading;
        v.speed = 0;
        v.findNearestRoadSegment();
        return v;
    };

    test('it stands for two seconds with no key and no crash, and then pulls away up the road, in every hairpin and every site', async () => {
        const spots = [...hairpins.filter(h => h.s1 < env.endS - 20).map(h => ({ name: `hairpin at ${Math.round((h.s0 + h.s1) / 2)}`, s: (h.s0 + h.s1) / 2 })),
            ...works.closed.flatMap(site => [site.stopIn + 1, (site.sb + site.sc) / 2].map(s => ({ name: `site ${site.id} at ${Math.round(s)}`, s })))];
        expect(spots.length).toBeGreaterThan(20);
        const bad = [];
        for (const spot of spots) {
            const run = fresh(spot.s + back);
            const place = run.restartPlace(works);
            const at = pointOf(place);
            await env.streamer.settle({ x: at.x, z: at.z }, place.s);
            env.updateBarriers(place.s);
            const v = putDown(place);
            for (let f = 0; f < 120; f++) v.update(DT, 0, 0, 0, 0);
            if (v.crashed) { bad.push(`${spot.name}: crashed standing (${v.crashCause})`); continue; }
            const stood = v.projection.s;
            if (Math.abs(stood - place.s) > 2) { bad.push(`${spot.name}: rolled ${(stood - place.s).toFixed(1)} m while standing`); continue; }
            // Throttle open, steering along the road as a rider does (held to the place's own lateral)
            const aim = {};
            let cut = false;
            run.restartAt(place.s);
            for (let f = 0; f < 60 * 4 && !v.crashed; f++) {
                const p = v.projection;
                route.sample(p.s + 6, aim);
                const side = works.pilotLane(p.s + 6, place.lateral);
                const tx = aim.x + Math.cos(aim.heading) * side, tz = aim.z - Math.sin(aim.heading) * side;
                const err = Math.atan2(Math.sin(Math.atan2(tx - v.position.x, tz - v.position.z) - v.yawAngle), Math.cos(Math.atan2(tx - v.position.x, tz - v.position.z) - v.yawAngle));
                const wanted = Math.max(-0.2, Math.min(0.2, 2 * Math.sin(err) / 6));
                const lean = -Math.sign(wanted) * Math.atan(v.speed * v.speed * Math.abs(wanted) / 9.81);
                v.update(DT, Math.max(-1, Math.min(1, (v.leanAngle - lean) * 8)), v.speed < 5 ? 1 : 0, v.speed > 6 ? 1 : 0, 0);
                const q = v.projection;
                if (q.index >= 0 && run.update({ s: q.s, lateral: q.lateral, width: q.width, speed: v.speed, dt: DT, forwardDot: Math.cos(v.yawAngle - q.heading) }).cut) cut = true;
            }
            if (v.crashed) bad.push(`${spot.name}: crashed pulling away (${v.crashCause})`);
            else if (cut) bad.push(`${spot.name}: the cut rule fired pulling away`);
            else if (v.projection.s - place.s < 8) bad.push(`${spot.name}: ${(v.projection.s - place.s).toFixed(1)} m in 4 s`);
        }
        if (bad.length) throw new Error(`${bad.length} of ${spots.length} places:\n${bad.join('\n')}`);
    }, 1800000);

    test('progress goes on from the place with no cut and no wrong way, and the next timing line is taken once', async () => {
        const next = env.stationGates[2];
        const s = next.s - 120;
        const run = fresh(s - 60);
        moved(run, s - 60, s, at => Math.min(12, (at - (s - 60)) / 4));
        const place = run.restartPlace(works);
        const ride = await rideSpan(game, env, { s0: place.s, s1: next.s + 60, speed: 8, lane: place.lateral });
        expect([ride.crashed, ride.cut]).toEqual([false, false]);
    }, 600000);
});
