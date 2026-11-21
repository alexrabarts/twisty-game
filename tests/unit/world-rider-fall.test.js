/**
 * @jest-environment node
 */
// The rider's fall on the real stage (Vehicle.beginRiderFall, stepRiderFall, drawRiderFall). The Tremola slice is
// streamed in node and the real Vehicle is crashed on it, by every kind of fall, at a straight, at seven hairpins
// (the stacked ones with their retaining walls among them), beside a wall and beside a drop in the land, at three
// speeds, leaned to each side, along the road and turned 0.5 rad toward its edge. Every frame is read from what is
// drawn (tests/helpers/rider-fall.js):
//   - no point of the rider's body is more than GROUND_M under the ground the bike's own physics has there
//   - his middle is never in a wall, a barrier or a parapet, and no point of him is more than LIMB_M into one
//   - he ends within NEAR_M + NEAR_PER_SPEED x the crash speed of the bike
// A drawn building and the thing the bike hit stop him too. The flat-plane rules are tests/unit/rider-fall.test.js.
import { describe, test, expect, beforeAll } from '@jest/globals';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGame } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';
import { DT, bikeAt, crashAndWatch, sidesAt, wallDepth } from '../helpers/rider-fall.js';
import { decodeWorld } from '../../tools/world/encode.mjs';
import { rideSamples } from '../../tools/world/stations.mjs';
import { findHairpins } from '../../tools/world/verify.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const game = loadGame(undefined, []);
const { THREE, WorldEnvironment, Vehicle } = game;
const RULE = Vehicle.RIDER_FALL;

const GROUND_M = 0.02, LIMB_M = 0.6, NEAR_M = 4, NEAR_PER_SPEED = 0.6;
// A bike ridden into a wall stands against its face, and the rider leaves from there: for FACE_S his middle may read
// this far in (as he rode into it), and after that not at all
const FACE_M = 0.25, FACE_S = 0.3;
// A bike this far over or under the rider at the end is on another strand of a stack of hairpins
const STRAND_M = 5;
// How many of the sweep's falls end so today: all at 16 or 28 m/s straight on at the apex of a stacked hairpin. It is
// the sliding bike's own projection, as it was before the rider had a fall of his own; held so it can only shrink
const STRAND_LIMIT = 31;
// A cause class for each kind, as the game raises it
const CLASS = { lowside: 'grip', highside: 'rear', front: 'wall', drop: 'drop', tip: 'stall' };
const SPEEDS = [8, 16, 28];
const list = (items, n = 14) => items.slice(0, n).join('\n') + (items.length > n ? `\n... ${items.length} in all` : '');

describe('the rider falls on the real stage', () => {
    let env, hairpins, probe;
    const settle = async (s) => {
        const p = env.route.sample(s, {});
        env.update(p, s, null, Infinity);
        await env.streamer.settle(p, s);
        env.updateBarriers(s);
        return p;
    };
    // A bike on the ride at s, `lateral` m right of the centre line, turned `toward` rad to its right
    const bikeOn = (p, { lateral = 0, toward = 0, speed }) => bikeAt(game, {
        environment: env, x: p.x + Math.cos(p.heading) * lateral, y: p.y, z: p.z - Math.sin(p.heading) * lateral, heading: p.heading + toward, speed
    });
    // Every kind at a place: the frames' worst, and what broke a rule
    const sweep = (name, p, bad, seen) => {
        for (const [kind, why] of Object.entries(CLASS)) {
            for (const speed of kind === 'tip' ? [2] : SPEEDS) {
                for (const side of [-1, 1]) {
                    for (const toward of [0, side * 0.5]) {
                        const v = bikeOn(p, { lateral: side * 1.5, toward, speed });
                        const frames = crashAndWatch(game, v, {
                            why, side, fall: kind === 'lowside' ? 'lowside' : null,
                            each: (frame, bike) => {
                                frame.bikeInWall = wallDepth(bike, bike.position.x, bike.position.z, bike.currentRoadSegment) > 0;
                            }
                        });
                        const tag = `${name} ${kind} at ${speed} m/s, side ${side}, toward ${toward}`;
                        expect(frames[0].kind).toBe(kind);
                        seen.runs++;
                        const under = Math.max(...frames.map(f => f.under));
                        // A rider who falls with the bike is where the bike is: he is held to a wall the bike is out of
                        const held = frames.filter(f => !(v.riderFall.rule.withBike && f.bikeInWall));
                        const middle = Math.max(-Infinity, ...held.map(f => f.middle));
                        const limb = Math.max(-Infinity, ...held.map(f => f.wall));
                        const last = frames[frames.length - 1];
                        seen.under = Math.max(seen.under, under);
                        seen.limb = Math.max(seen.limb, limb);
                        if (!frames.every(f => Number.isFinite(f.x + f.y + f.z))) bad.push(`${tag}: not a number`);
                        if (under > GROUND_M) bad.push(`${tag}: ${under.toFixed(3)} m under the ground`);
                        if (middle > 0) bad.push(`${tag}: his middle ${middle.toFixed(2)} m into a wall`);
                        if (limb > LIMB_M) bad.push(`${tag}: a point of him ${limb.toFixed(2)} m into a wall`);
                        // The sliding bike is the game's own. In a stack of hairpins it can go over to the strand above
                        // or below (it reads the nearest road within 60 m, and ends metres over or under where it
                        // slid); the rider stays on the strand he fell on, and is not held to the bike there
                        if (Math.abs(last.drop) > STRAND_M) { seen.strand++; seen.strands.push(`${name} ${kind} ${speed}`); }
                        else {
                            seen.gap = Math.max(seen.gap, last.gap - NEAR_PER_SPEED * speed);
                            if (last.gap > NEAR_M + NEAR_PER_SPEED * speed) bad.push(`${tag}: ends ${last.gap.toFixed(1)} m from the bike`);
                        }
                    }
                }
            }
        }
    };

    beforeAll(async () => {
        const { fetchFn } = diskFetch();
        env = await WorldEnvironment.load(new THREE.Scene(), { id: 'tremola', fetchFn, models: null, digest: async () => '0' });
        const world = decodeWorld(path.join(REPO, 'world'));
        hairpins = findHairpins(rideSamples(world.edges, world.ride.path));
        probe = new Vehicle(new THREE.Scene());
        probe.environment = env;
    }, 300000);

    test('a straight and seven hairpins: on the ground, out of the walls, near the bike', async () => {
        expect(hairpins.length).toBeGreaterThanOrEqual(20);
        // The first hairpin, the tightest, and the stacks further up with a wall on the outside of each strand
        const tight = hairpins.reduce((a, b) => (b.minRadiusM < a.minRadiusM ? b : a));
        const chosen = [hairpins[0], hairpins[3], hairpins[9], tight, hairpins[14], hairpins[17], hairpins[26]];
        const places = [{ name: 'straight', s: 900 }, ...chosen.map(h => ({ name: `hairpin ${h.s0}-${h.s1}`, s: (h.s0 + h.s1) / 2 }))];
        expect(Math.abs(env.route.curvatureAt(900, 8))).toBeLessThan(1 / 200);
        const bad = [], seen = { runs: 0, under: -Infinity, limb: -Infinity, gap: -Infinity, strand: 0, strands: [] };
        let walled = 0;
        for (const place of places) {
            const p = await settle(place.s);
            probe.position.set(p.x, p.y, p.z);
            probe.findNearestRoadSegment();
            for (let s = place.s - 40; s <= place.s + 40; s += 10) if (sidesAt(probe, s, 4).some(side => side.kind === 'wall')) { walled++; break; }
            sweep(place.name, p, bad, seen);
        }
        if (bad.length) throw new Error(`${bad.length} of ${seen.runs} falls broke a rule:\n${list(bad)}`);
        expect(seen.runs).toBe(places.length * (4 * SPEEDS.length + 1) * 4);
        // At least three of the hairpins have a wall beside them
        expect(walled).toBeGreaterThanOrEqual(3);
        // The bike went over to another strand in some of the fast ones at the stacks, and nowhere else
        expect(seen.strand).toBeLessThanOrEqual(STRAND_LIMIT);
        expect(seen.strands.filter(name => name.startsWith('straight'))).toEqual([]);
        console.log(`stage sweep: ${seen.runs} falls, worst ${seen.under.toExponential(1)} m under the ground, a point ${seen.limb.toFixed(2)} m into a wall, ${(seen.gap).toFixed(1)} m over ${NEAR_PER_SPEED} m per m/s from the bike, ${seen.strand} where the bike changed strand`);
    }, 600000);

    test('beside a wall: a bike ridden into it throws the rider over the bars, and he stops against it', async () => {
        const bad = [], seen = { hits: 0 };
        // Two stretches with a wall close beside the road: found by the bike's own zones
        const stretches = [];
        for (let s = env.startS + 100; s < env.endS - 100 && stretches.length < 2; s += 10) {
            const p = await settle(s);
            probe.position.set(p.x, p.y, p.z);
            probe.findNearestRoadSegment();
            const wall = sidesAt(probe, s + 20, 2.5).find(side => side.kind === 'wall');
            if (wall && Math.abs(env.route.curvatureAt(s + 20, 8)) < 1 / 80) { stretches.push({ s, sign: wall.sign }); s += 3000; }
        }
        expect(stretches.length).toBe(2);
        for (const { s, sign } of stretches) {
            for (const speed of SPEEDS) {
                const p = await settle(s);
                const v = bikeOn(p, { toward: sign * 0.3, speed });
                let ticks = 0;
                while (!v.crashed && ticks++ < 300) { v.speed = speed; v.leanAngle = 0; v.update(DT, 0, 0, 0, 0); }
                const tag = `wall at ${s} at ${speed} m/s`;
                expect([tag, v.crashWhy]).toEqual([tag, 'wall']);
                seen.hits++;
                // The measure sees this wall: a metre past its face, beside the bike that stands against it, is in it
                const q = v.projection, out = Math.sign(q.lateral);
                const past = wallDepth(v, v.position.x + Math.cos(q.heading) * out, v.position.z - Math.sin(q.heading) * out, v.currentRoadSegment);
                expect(past).toBeGreaterThan(0.7);
                expect(past).toBeLessThan(1.6);
                const at = new THREE.Vector3();
                let index = v.currentRoadSegment, peak = -Infinity, deepest = -Infinity;
                const from = v.position.clone();
                for (let i = 0; i < 132; i++) {
                    v.update(DT, 0, 0, 0, 0);
                    v.group.updateMatrixWorld(true);
                    v.rider.getWorldPosition(at);
                    index = env.ground.locate(at.x, at.z, { start: Math.max(0, index - 3), end: index + 3 }, {}).index;
                    const depth = wallDepth(v, at.x, at.z, index, at.y);
                    if (depth > (i * DT < FACE_S ? FACE_M : 0)) bad.push(`${tag}: his middle ${depth.toFixed(3)} m into the wall at ${(i * DT).toFixed(2)} s`);
                    deepest = Math.max(deepest, depth);
                    peak = Math.max(peak, at.y - v.position.y);
                }
                expect([tag, v.riderFall.kind]).toEqual([tag, 'front']);
                // Over the bars: he rose over the seat's height, and went on past where the bike stopped
                expect(peak).toBeGreaterThan(1.1);
                const on = Math.hypot(at.x - from.x, at.z - from.z);
                expect(on).toBeGreaterThan(0.5);
                expect(on).toBeLessThan(NEAR_M + NEAR_PER_SPEED * speed);
                seen.deepest = Math.max(seen.deepest || -Infinity, deepest);
            }
        }
        if (bad.length) throw new Error(list(bad));
        expect(seen.hits).toBe(6);
        console.log(`beside a wall: his middle at most ${seen.deepest.toFixed(4)} m into it`);
    }, 600000);

    test('beside a drop in the land: every kind stays on the ground there, and the drop kind goes down with the bike', async () => {
        // Where the land 9 m beside the road lies more than 4 m under it, with no wall between
        let place = null;
        for (let s = env.startS + 200; s < env.endS - 200 && !place; s += 20) {
            const p = await settle(s);
            probe.position.set(p.x, p.y, p.z);
            probe.findNearestRoadSegment();
            for (const side of sidesAt(probe, s, 6)) {
                if (side.kind !== 'runoff') continue;
                const x = p.x + Math.cos(p.heading) * side.sign * 9, z = p.z - Math.sin(p.heading) * side.sign * 9;
                if (p.y - env.ground.groundY(x, z, { start: probe.currentRoadSegment - 3, end: probe.currentRoadSegment + 3 }, false, {}) > 4) place = { s, sign: side.sign, p };
            }
        }
        expect(place).not.toBeNull();
        const bad = [], seen = { runs: 0, under: -Infinity, limb: -Infinity, gap: -Infinity, strand: 0, strands: [] };
        sweep(`drop at ${place.s}`, place.p, bad, seen);
        if (bad.length) throw new Error(`${bad.length} of ${seen.runs} falls broke a rule:\n${list(bad)}`);
        // The drop kind, ridden off the edge toward the low land: he goes down with the bike, never across the air
        const v = bikeOn(place.p, { lateral: place.sign * 1.5, toward: place.sign * 0.5, speed: 28 });
        const frames = crashAndWatch(game, v, { why: 'drop', side: place.sign });
        const last = frames[frames.length - 1];
        expect(frames[0].kind).toBe('drop');
        expect(place.p.y - last.y).toBeGreaterThan(1);
        for (const f of frames) {
            expect(f.gap).toBeLessThan(2.5);
            expect(f.under).toBeLessThan(GROUND_M);
            // On the ground the bike is on, or beside it: never left in the air behind it
            expect(Math.abs(f.drop)).toBeLessThan(2.5);
        }
    }, 600000);

    test('a drawn building stops him: his middle is never in its walls', async () => {
        const p = await settle(900);
        const houseAt = env.scenery.houseAt;
        // A house across the road 9 m on, 6 m deep and 12 m wide: the game's own test of a wall rect
        const wall = { x: p.x + Math.sin(p.heading) * 12, z: p.z + Math.cos(p.heading) * 12, heading: p.heading, along: 6, across: 12 };
        env.scenery.houseAt = (x, z, margin = 0) => {
            const dx = x - wall.x, dz = z - wall.z, cos = Math.cos(wall.heading), sin = Math.sin(wall.heading);
            return Math.abs(dx * cos - dz * sin) <= wall.across / 2 + margin && Math.abs(dx * sin + dz * cos) <= wall.along / 2 + margin ? wall : null;
        };
        try {
            for (const why of ['grip', 'rear', 'building']) {
                for (const speed of SPEEDS) {
                    const v = bikeOn(p, { speed });
                    const frames = crashAndWatch(game, v, { why });
                    for (const f of frames) expect([why, speed, !!env.scenery.houseAt(f.x, f.z, 0)]).toEqual([why, speed, false]);
                    // The faster ones reach it and lie against it
                    const last = frames[frames.length - 1];
                    const short = (wall.x - last.x) * Math.sin(p.heading) + (wall.z - last.z) * Math.cos(p.heading) - wall.along / 2;
                    expect(short).toBeGreaterThan(0);
                    if (speed >= 16) expect(short).toBeLessThan(RULE.bodyM + 0.6);
                }
            }
        } finally {
            env.scenery.houseAt = houseAt;
        }
    }, 120000);

    test('the thing the bike hit stops him: he goes round a car or lies against it, never through it', async () => {
        const p = await settle(900);
        for (const speed of SPEEDS) {
            for (const aside of [0, 0.6]) {
                const v = bikeOn(p, { speed });
                const car = { x: p.x + Math.sin(p.heading) * 5 + Math.cos(p.heading) * aside, z: p.z + Math.cos(p.heading) * 5 - Math.sin(p.heading) * aside, r: 1.1 };
                v.update(DT, 0, 0, 0, 0);
                v.speed = speed;
                v.rodeSpeed = speed;
                // As Game raises a car hit: after the bike's own step
                v.crashed = true;
                v.crashWhy = 'car';
                v.blockRider(car.x, car.z, car.r);
                const at = new THREE.Vector3();
                let nearest = Infinity;
                for (let i = 0; i < 132; i++) {
                    v.update(DT, 0, 0, 0, 0);
                    v.group.updateMatrixWorld(true);
                    v.rider.getWorldPosition(at);
                    nearest = Math.min(nearest, Math.hypot(at.x - car.x, at.z - car.z));
                }
                expect(v.riderFall.kind).toBe('front');
                expect(nearest).toBeGreaterThan(car.r);
                // He reached it
                expect(nearest).toBeLessThan(car.r + RULE.bodyM + 0.3);
                // The next crash is not held by this one's car
                v.reset();
                expect(v.riderBlock.on).toBe(false);
            }
        }
    }, 120000);
});
