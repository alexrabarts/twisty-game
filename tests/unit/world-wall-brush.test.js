/**
 * @jest-environment node
 */
// A touch on a wall with the tyres alone is a brush, not a crash (WorldPhysics.wallBrush, Vehicle.wallTouch;
// .agent/system/handling.md, "A brush against a wall"). The owner: "also, if we're banked and it's only the tires that
// contact the wall, i don't think that should cause a crash".
//
// Held here on the real Vehicle, against every kind of wall a world has (a rock face beside a tunnel's road, a
// bridge's parapet, a rock face of the land, a building):
//   - leaned away from the wall at a glance: no crash, speed lost, and the bike is never in the wall
//   - upright or leaned toward a wall as high as the rider: the crash it was, with its class
//   - a wall lower than the bars is met by the tyres alone when the bike is upright too
//   - over the closing speed, or head-on, at any lean: a crash
//   - a contact that lasts: a crash
//   - on the hairpins of a world that have a wall on the outside, ridden wide: what happens, measured
import { describe, test, expect, beforeAll } from '@jest/globals';
import { loadGame, gameMethods } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';
import { rideSpan } from '../helpers/world-rider.js';
import { samplesOf, fakeData, allTiles, straight } from '../helpers/world-synthetic.js';

const DT = 1 / 60, DEG = 180 / Math.PI;
// What the game's scripts print (their console is this list): a crash's own line names its cause
const printed = [];
const game = loadGame(undefined, printed);
const { THREE, Vehicle, WorldPhysics, WorldRoute, WorldGround, WorldData, WorldEnvironment, WorldAssist, RoadMesh, CHARACTERS } = game;
const rule = WorldPhysics.wallBrush;
const HALF = 5;
// The least speed one contact scrubs from 15 m/s: scrub x holdS of it, less a fifth for the steps and the speed lost
const SCRUBBED = 15 * rule.scrub * rule.holdS * 0.8;

// The walls, each on the +lateral side of a 10 m road along +z: {env, face, height}. `face` is the lateral of the
// wall's face; a wall with no height is as high as the rider
const roadOf = (flags, data) => {
    const route = new WorldRoute(samplesOf(straight(3000), { flags }), {});
    return { physics: WorldPhysics, route, ground: new WorldGround(route, data || fakeData({ tiles: allTiles(-1, 0, -1, 6), zone: x => (Math.abs(x) <= HALF ? 1 : 0) })) };
};
const WALLS = {
    'the rock beside a tunnel\'s road': () => ({ env: roadOf(WorldRoute.FLAG.tunnel), face: HALF + WorldGround.BENCH_M }),
    'a bridge\'s parapet': () => ({ env: roadOf(WorldRoute.FLAG.bridge), face: HALF + WorldGround.PARAPET_M, height: RoadMesh.PARAPET_H_M }),
    // The tile's zone layer has a wall from x = 12 (its nodes are 8 m apart, read at the nearest), where the land
    // stands 4 m over the road
    'a rock face of the land': () => ({
        env: roadOf(0, fakeData({ tiles: allTiles(-1, 0, -1, 6), zone: x => (Math.abs(x) <= HALF ? WorldData.ZONE.road : x > 12 ? WorldData.ZONE.wall : 0), shape: x => (x > 12 ? 104 : 100) })),
        face: null
    }),
    'a building': () => {
        const env = roadOf(0);
        const walls = { x: 14, z: 60, heading: 0, along: 60, across: 10 };
        env.scenery = { houseAt: (x, z, margin = 0) => (Math.abs(x - walls.x) <= walls.across / 2 + margin && Math.abs(z - walls.z) <= walls.along / 2 + margin ? walls : null) };
        return { env, face: walls.x - walls.across / 2 - WorldPhysics.houseHitM };
    }
};
const inWall = (env, v) => {
    if (env.scenery && env.scenery.houseAt(v.position.x, v.position.z, WorldPhysics.houseHitM)) return true;
    const p = v.projection;
    const loc = { index: p.index, lateral: p.lateral };
    return v.worldZone(env.ground.zoneAt(loc, p.width / 2), loc, p.y).kind === 'wall';
};

// The face of a wall that has no line of its own, found from the road outward
function faceOf(wall) {
    if (wall.face !== null) return wall.face;
    const v = new Vehicle(new THREE.Scene(), null, CHARACTERS[0], CHARACTERS[0].bikes[0], { model: false });
    v.environment = wall.env;
    for (let x = HALF; x < 30; x += 0.01) {
        v.position.set(x, 100, 40);
        v.findNearestRoadSegment();
        if (inWall(wall.env, v)) return x;
    }
    throw new Error('no wall found');
}

// A bike `gap` m before the wall's face at `speed`, its heading `angle` degrees toward the wall and leaned `away`
// degrees off it (negative: toward it), the rider holding that lean. Ridden for `seconds`. Returns what happened:
// {crashed, why, cause, brushes, said, deep, speed, lost, yaw}: `deep` the most the bike was past the face after a
// step (m, 0 when never), `lost` the most speed the wall's scrub took (against the same ride with a scrub of nothing, step by step)
function touch(make, { away, angle = 6, speed = 15, gap = 0.05, seconds = 0.8, against = 0 }) {
    const ride = (physics) => {
        const wall = make();
        const face = faceOf(wall);
        wall.env.physics = physics;
        const v = new Vehicle(new THREE.Scene(), null, CHARACTERS[0], CHARACTERS[0].bikes[0], { model: false });
        v.environment = wall.env;
        v.assistLevel = 'off';
        v.position.set(face - gap, 100, 40);
        v.yawAngle = angle / DEG;
        v.leanAngle = away / DEG;
        v.speed = speed;
        v.findNearestRoadSegment();
        // `against`: the bike has been against a wall for that long already, in a contact that still lasts
        if (against > 0) {
            v.brushS = against;
            v.brushLeftS = rule.holdS;
        }
        const out = { crashed: false, why: null, cause: null, brushes: 0, said: 0, deep: 0, speeds: [], yaw: 0 };
        for (let i = 0; i < Math.round(seconds / DT) && !v.crashed; i++) {
            v.update(DT, Math.max(-1, Math.min(1, (v.leanAngle - away / DEG) * 8)), 0, 0, 0);
            if (v.brushNew) { out.said++; v.brushNew = false; }
            if (!v.crashed) out.deep = Math.max(out.deep, v.position.x - face);
            out.speeds.push(v.speed);
        }
        return Object.assign(out, { crashed: v.crashed, why: v.crashWhy, cause: v.crashCause, brushes: v.brushes || 0, yaw: v.yawAngle * DEG });
    };
    const hit = ride(WorldPhysics), free = ride({ ...WorldPhysics, wallBrush: { ...rule, scrub: 0 } });
    return { ...hit, lost: Math.max(0, ...hit.speeds.map((speed, i) => (i < free.speeds.length ? free.speeds[i] - speed : 0))) };
}

describe('the table', () => {
    test('the parts are over the tyre, a leaned bike clears them, and the numbers are in range', () => {
        expect(rule.parts.length).toBeGreaterThan(0);
        for (const part of rule.parts) {
            expect(part.half).toBeGreaterThan(rule.tyreM);
            expect(part.height).toBeGreaterThan(0.5);
        }
        // The least lean away at which every part is inside the line of the tyres, whatever the wall's height
        const clears = a => rule.parts.every(part => part.half * Math.cos(a / DEG) - part.height * Math.sin(a / DEG) <= rule.tyreM);
        let least = 0;
        while (!clears(least)) least += 0.1;
        console.log(`a tall wall is met by the tyres alone from ${least.toFixed(1)} degrees of lean away from it`);
        expect(least).toBeGreaterThan(10);
        expect(least).toBeLessThan(20);
        expect(rule.closeMax).toBeGreaterThan(0);
        expect(rule.mostS).toBeGreaterThan(rule.holdS);
        expect(rule.scrub).toBeGreaterThan(0);
        expect(rule.kickDeg).toBeGreaterThan(0);
    });
});

describe.each(Object.entries(WALLS))('%s', (name, make) => {
    const tall = make().height === undefined;
    // A wall with a line of its own and a building are met a step ahead: the bike is never past the face. A rock face
    // of the land is met where the crash was: the bike is in it for one step, the closing speed x the step at the most
    const DEEP = name === 'a rock face of the land' ? rule.closeMax * DT : 0;

    test.each([20, 35, 45])('leaned %i degrees away, a glancing touch under the closing bound: a brush, speed lost, never in the wall', (away) => {
        const r = touch(make, { away });
        expect(15 * Math.sin(6 / DEG)).toBeLessThan(rule.closeMax);
        expect([r.crashed, r.cause]).toEqual([false, null]);
        expect(r.brushes).toBeGreaterThan(0);
        expect(r.said).toBe(1);
        expect(r.deep).toBeLessThanOrEqual(DEEP);
        // At least the scrub of one contact: scrub x holdS of the speed, less a fifth for the steps and the speed lost
        expect(r.lost).toBeGreaterThan(SCRUBBED);
        // Turned off the wall: the heading that went 6 degrees into it now goes away from it
        expect(r.yaw).toBeLessThan(0);
    });

    test('upright, and leaned toward it: the bars and the rider meet a wall as high as they are, a wall under the bars is met by the tyres', () => {
        const toward = touch(make, { away: -35 });
        expect(toward.crashed).toBe(true);
        expect(toward.brushes).toBe(0);
        const upright = touch(make, { away: 0 });
        expect(upright.crashed).toBe(tall);
        if (!tall) expect(upright.deep).toBeLessThanOrEqual(DEEP);
        for (const r of [toward, upright]) {
            if (!r.crashed) continue;
            expect(r.why).toBe(name === 'a building' ? 'building' : 'wall');
            expect(r.cause).toBe(name === 'a building' ? 'Rode into a building' : 'Hit the wall');
        }
    });

    test.each([20, 35, 45])('leaned %i degrees away over the closing bound: a crash', (away) => {
        // 15 m/s at 16 degrees closes at 4.1 m/s
        expect(15 * Math.sin(16 / DEG)).toBeGreaterThan(rule.closeMax);
        const r = touch(make, { away, angle: 16, gap: 0.2 });
        expect(r.crashed).toBe(true);
        expect(r.brushes).toBe(0);
    });

    test('leaned away at a glance, but against a wall for mostS already: a crash', () => {
        const r = touch(make, { away: 35, against: rule.mostS - DT });
        expect(r.crashed).toBe(true);
        expect(touch(make, { away: 35, against: rule.mostS / 2 }).crashed).toBe(false);
    });

    test('found far into the wall (the projection came over from another strand): the crash it was, not a brush', () => {
        const r = touch(make, { away: 35, gap: -(rule.deepM + 0.25), seconds: 0.1 });
        expect(r.crashed).toBe(true);
        expect(r.brushes).toBe(0);
    });

    test('slowly but head-on, leaned away: a crash', () => {
        const angle = rule.glanceDeg + 10;
        expect(4 * Math.sin(angle / DEG)).toBeLessThan(rule.closeMax);
        const r = touch(make, { away: 20, angle, speed: 4, gap: 0.1 });
        expect(r.crashed).toBe(true);
    });
});

describe('a contact that lasts', () => {
    test('the verdict is a crash once the bike has been against the wall for mostS', () => {
        const wall = WALLS['the rock beside a tunnel\'s road']();
        const v = new Vehicle(new THREE.Scene(), null, CHARACTERS[0], CHARACTERS[0].bikes[0], { model: false });
        v.environment = wall.env;
        v.speed = 15;
        v.leanAngle = 35 / DEG;
        expect(v.wallTouch(-1, 0, undefined)).toBe(true);
        v.brushS = rule.mostS;
        expect(v.wallTouch(-1, 0, undefined)).toBe(false);
    });

    // A half circle of 12 m in a tunnel: the rock is 19 m from its centre on the outside. A bike leaned 50 degrees
    // into the bend at the wall turns wider than the wall at 16.5 m/s and over
    const bend = () => {
        const points = [], R = 12, LEAD = 120;
        for (let z = 0; z < LEAD; z += 2) points.push({ x: 0, y: 100, z, heading: 0, width: 10 });
        const n = Math.ceil(Math.PI * R / 2);
        for (let i = 0; i <= n; i++) {
            const h = Math.PI * i / n;
            points.push({ x: R - R * Math.cos(h), y: 100, z: LEAD + R * Math.sin(h), heading: h, width: 10 });
        }
        for (let z = LEAD - 2; z > 0; z -= 2) points.push({ x: 2 * R, y: 100, z, heading: Math.PI, width: 10 });
        const route = new WorldRoute(samplesOf(points, { flags: WorldRoute.FLAG.tunnel }), {});
        return { physics: WorldPhysics, route, ground: new WorldGround(route, fakeData({ tiles: allTiles(-1, 0, -1, 0), zone: () => 0 })) };
    };
    // Along the outside wall from the start of the bend, leaned into it, the speed left to the wall and the engine
    const along = (speed) => {
        const env = bend();
        const v = new Vehicle(new THREE.Scene(), null, CHARACTERS[0], CHARACTERS[0].bikes[0], { model: false });
        v.environment = env;
        v.assistLevel = 'off';
        const face = HALF + WorldGround.BENCH_M;
        v.position.set(-(face - 0.05), 100, 118);
        v.yawAngle = 0;
        v.leanAngle = -50 / DEG;
        v.speed = speed;
        v.findNearestRoadSegment();
        let against = 0, deep = 0;
        for (let i = 0; i < 4 * 60 && !v.crashed; i++) {
            v.update(DT, Math.max(-1, Math.min(1, (v.leanAngle + 50 / DEG) * 8)), 0, 0, 0);
            against = Math.max(against, v.brushS);
            if (!v.crashed) deep = Math.max(deep, Math.abs(v.projection.lateral) - face);
        }
        return { crashed: v.crashed, why: v.crashWhy, against, deep, speed: v.speed, brushes: v.brushes || 0 };
    };

    test('round the outside wall of a bend a little too fast: the wall turns the bike a little, scrubs its speed, and it rides on', () => {
        const rows = [];
        for (const speed of [17, 18, 20, 22]) {
            const r = along(speed);
            rows.push(`${speed} m/s: ${r.brushes} touches, ${r.against.toFixed(2)} s against it, ${r.speed.toFixed(1)} m/s after`);
            expect(r.brushes).toBeGreaterThan(0);
            expect(r.crashed).toBe(false);
            expect(r.against).toBeLessThan(rule.mostS);
            expect(r.deep).toBeLessThanOrEqual(0);
        }
        console.log(rows.join('\n'));
    });

    test('far too fast the wall would have to carry the bike round: the speed into it passes closeMax, a crash, class wall', () => {
        for (const speed of [25, 30]) {
            const r = along(speed);
            expect([r.crashed, r.why]).toEqual([true, 'wall']);
        }
    });

    test('the wall is no brake worth riding into: under 16 m/s its scrub is under the bike\'s own brake at full lean', () => {
        const v = new Vehicle(new THREE.Scene(), null, CHARACTERS[0], CHARACTERS[0].bikes[0], { model: false });
        v.environment = bend();
        const least = v.worldBrakeLeast(v.worldMultipliers());
        expect(rule.scrub * 16).toBeLessThan(least);
    });
});

describe('the game says it', () => {
    test('one call-out in the warn tone for each new contact, with the tyre\'s screech; none after a crash', () => {
        const said = [], sounds = [];
        const Game = { BRUSH_TEXT: 'Brushed the wall', CALLOUT_MS: { brush: 1500 } };
        const self = { vehicle: { brushNew: false, crashed: false }, finished: false, soundManager: { playTireScreech: () => sounds.push(1) } };
        const { sayBrush } = gameMethods(['sayBrush'], self, { Game, showCallout: (...args) => said.push(args) });
        sayBrush();
        expect(said).toEqual([]);
        self.vehicle.brushNew = true;
        sayBrush();
        sayBrush();
        expect(said).toEqual([['Brushed the wall', 'warn', 1500]]);
        expect(sounds).toHaveLength(1);
        expect(self.vehicle.brushNew).toBe(false);
        self.vehicle.brushNew = true;
        self.vehicle.crashed = true;
        sayBrush();
        expect(said).toHaveLength(1);
    });
});

// The hairpins of a world that have a wall on the outside of the bend, within REACH_M of the edge of the carriageway
// on the arc (the longest run of it). A rider at the advised speed runs wide there: the line is half a metre past
// the wall's face until the tyres touch it or the wall has ended, then the middle of the road again
const REACH_M = 4;
const worlds = [
    ['the shipped stage', { id: 'tremola' }],
    ['the synthetic fixture world', { id: 'all', search: '?worldData=tests/fixtures/world/mini' }]
];

describe.each(worlds)('the hairpins of %s with a wall on the outside, ridden wide at the advised speed', (name, world) => {
    let env, walled;
    beforeAll(async () => {
        env = await WorldEnvironment.load(new THREE.Scene(), { ...world, fetchFn: diskFetch().fetchFn, models: null, digest: async () => '0' });
        const probe = new Vehicle(new THREE.Scene(), null, CHARACTERS[0], CHARACTERS[0].bikes[0], { model: false });
        probe.environment = env;
        walled = [];
        const p = {}, loc = {};
        for (const h of env.route.hairpins()) {
            env.route.sample(h.apex, p);
            await env.streamer.settle({ x: p.x, z: p.z }, h.apex);
            // The outside of the bend is the side the road turns away from
            const side = -h.sign;
            // The longest run of the arc with a wall there: {from, to, face, past, height, parapet}, the face as near
            // the road as it comes in the run
            let run = null, best = null;
            for (let s = h.s0; s <= h.s1 + 2; s += 2) {
                env.route.sample(s, p);
                loc.index = env.route.indexAt(s);
                let found = null;
                for (let d = p.width / 2; d <= p.width / 2 + REACH_M && s <= h.s1; d += 0.1) {
                    loc.lateral = side * d;
                    const zone = probe.worldZone(env.ground.zoneAt(loc, p.width / 2), loc, p.y);
                    if (zone.kind !== 'wall') continue;
                    found = { face: d, past: d - p.width / 2, height: zone.height, parapet: !!zone.parapet };
                    break;
                }
                if (found && run) {
                    run.to = s;
                    if (found.past < run.past) Object.assign(run, found);
                } else if (found) run = { from: s, to: s, ...found };
                if (!found && run) {
                    if (!best || run.to - run.from > best.to - best.from) best = run;
                    run = null;
                }
            }
            if (best) walled.push({ h, side, ...best });
        }
    }, 1800000);

    test('the tyres brush the wall and the bike rides on', async () => {
        const rows = [];
        for (const w of walled) {
            const cobbles = env.route.sample(w.h.apex, {}).flags.cobbles;
            const advice = WorldAssist.advice(env.route, WorldPhysics, w.h.s0 - 5, 40, cobbles ? WorldPhysics.cobbleGrip : 1);
            const pace = advice ? advice.speed : WorldAssist.advisedSpeed(WorldPhysics, WorldPhysics.rMin);
            let touched = 0, lean = 0, said = 0, tilt = 0;
            const r = await rideSpan(game, env, {
                log: printed,
                s0: Math.max(env.startS + 5, w.h.s0 - 25), s1: Math.min(env.endS - 5, w.h.s1 + 15), speed: pace,
                lane: (s, v) => (v.brushes > 0 || s > w.to + 3 ? 0 : w.side * (w.face + 0.5)),
                watch: (v) => {
                    if ((v.brushes || 0) > touched && !touched) lean = Math.abs(v.leanAngle) * DEG;
                    touched = v.brushes || 0;
                    if (v.brushNew) { said++; v.brushNew = false; }
                    // Drawn against the wall, the bike leans as it rides: the coping beside it is a face, not a bank
                    // under it (WorldGround.drawnY; it read a 0.5 m coping as 32 degrees and laid the bike down)
                    if (touched && !v.crashed) {
                        v.updateMesh();
                        tilt = Math.max(tilt, Math.abs(v.groundTilt || 0) * DEG);
                    }
                }
            });
            rows.push({ apex: Math.round(w.h.apex), length: w.to - w.from, past: w.past, height: w.height, parapet: w.parapet, pace, touched, said, lean, tilt, crashed: r.crashed, cut: r.cut, cause: r.cause });
        }
        const brushed = rows.filter(row => row.touched > 0 && !row.crashed && !row.cut);
        const crashed = rows.filter(row => row.crashed);
        console.log(`${name}: ${walled.length} of ${env.route.hairpins().length} hairpins have a wall within ${REACH_M} m of the outside edge. Ridden wide at the advised speed: `
            + `${brushed.length} brushed the wall and rode on, ${crashed.length} crashed, ${rows.filter(row => !row.crashed && !row.touched).length} never reached it\n`
            + rows.map(row => `${row.apex}: wall for ${row.length} m, ${row.past.toFixed(1)} m past the edge${row.height ? ` (${row.height} m high${row.parapet ? ', a parapet' : ''})` : ''}, ${row.pace.toFixed(1)} m/s: `
                + `${row.crashed ? `CRASH ${row.cause}` : row.cut ? 'restart' : row.touched ? `brush x${row.touched} at ${row.lean.toFixed(0)} degrees` : 'no touch'}`).join('\n'));
        // No ride that came to a wall at the advised speed ends as a wall crash (a crash into something else that
        // stands on the wide line, a roadworks board, is not the wall's), and where a world has such walls some are met
        expect(rows.filter(row => row.crashed && /wall/i.test(String(row.cause))).map(row => row.apex)).toEqual([]);
        if (walled.length) expect(brushed.length).toBeGreaterThan(0);
        for (const row of brushed) expect(row.said).toBeGreaterThan(0);
        expect(brushed.filter(row => row.tilt > 3).map(row => `${row.apex}: ${row.tilt.toFixed(1)} degrees`)).toEqual([]);
    }, 1800000);
});
