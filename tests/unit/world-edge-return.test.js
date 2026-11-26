// No assist ever acts against the rider. A bike just past the edge line (0.5, 1 and 2 m) at 5, 10 and 15 m/s, on a
// straight and on both sides of a hairpin, with the rider steering back toward the road at full input: the hairpin
// assist (line capture, edge assist, the old recovery pull) may add steering toward the road or nothing, and the
// bike is back on the carriageway no later, and in no more distance, than with the assist off.
//
// Before (aaa6f8c) the assist acted past the edge: in a hairpin the line capture blended the rider's lean rate toward
// the bend's line, which took lean off a rider steering back from the outside, and its handlebar blend turned the bar
// back against the rider at walking pace.
import { describe, test, expect } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import { loadGame } from '../helpers/load-game.js';
import { samplesOf, fakeData, allTiles } from '../helpers/world-synthetic.js';

const DT = 1 / 60;
const BEFORE = 'aaa6f8c';
const show = file => execFileSync('git', ['show', `${BEFORE}:js/${file}`], { encoding: 'utf8', maxBuffer: 1 << 26 });
const games = {
    after: loadGame(),
    before: loadGame(undefined, [], { 'vehicle.js': show('vehicle.js'), 'world/physics.js': show('world/physics.js') })
};
const WIDTH = 10, STRAIGHT = 120, RADIUS = 12;

// A straight, a half circle of RADIUS turning toward +lateral, and the straight back, on flat land at road height
function course(game) {
    const points = [];
    for (let z = 0; z < STRAIGHT; z += 2) points.push({ x: 0, y: 100, z, heading: 0, width: WIDTH });
    const n = Math.ceil(Math.PI * RADIUS / 2);
    for (let i = 0; i <= n; i++) {
        const h = Math.PI * i / n;
        points.push({ x: RADIUS - RADIUS * Math.cos(h), y: 100, z: STRAIGHT + RADIUS * Math.sin(h), heading: h, width: WIDTH });
    }
    for (let z = STRAIGHT - 2; z > 0; z -= 2) points.push({ x: 2 * RADIUS, y: 100, z, heading: Math.PI, width: WIDTH });
    const route = new game.WorldRoute(samplesOf(points), {});
    const ground = new game.WorldGround(route, fakeData({ tiles: allTiles(-1, 0, -1, 0), zone: () => 0 }));
    return { physics: game.WorldPhysics, route, ground };
}

// The bike `out` m past the edge on `side` at s, heading 4 degrees further off, the rider steering back at full input
// and holding the speed. Returns {back, time, metres, against}: back on the carriageway, when and how far ridden, and
// the worst assist contribution against the input (rad/s on the lean rate)
function ret(game, env, { s, side, out, speed, assist }) {
    const v = new game.Vehicle(new game.THREE.Scene());
    v.environment = env;
    v.assistLevel = assist;
    const p = env.route.sample(s, {});
    const lat = side * (WIDTH / 2 + out);
    v.position.set(p.x + Math.cos(p.heading) * lat, p.y, p.z - Math.sin(p.heading) * lat);
    v.yawAngle = p.heading + side * 4 * Math.PI / 180;
    v.findNearestRoadSegment();
    v.speed = speed;
    const u = -side;
    const res = { back: false, time: 0, metres: 0, against: 0 };
    for (let tick = 0; tick < 6 * 60; tick++) {
        const x = v.position.x, z = v.position.z;
        v.update(DT, u, v.speed < speed ? 1 : 0, v.speed > speed + 0.5 ? 1 : 0, 0);
        res.time += DT;
        res.metres += Math.hypot(v.position.x - x, v.position.z - z);
        const applied = v.assistApplied !== undefined ? v.assistApplied : v.assistLeanRate;
        // The rider's lean rate is -u x leanRate: an assist with the sign of u works against it
        if (applied * u > 0) res.against = Math.max(res.against, Math.abs(applied));
        if (v.crashed) break;
        if (Math.abs(v.projection.lateral) <= v.projection.width / 2) { res.back = true; break; }
    }
    return res;
}

function sweep(game) {
    const env = course(game);
    const rows = [];
    // The straight, and the bend near its apex: side +1 is the inside, -1 the outside
    for (const [place, s] of [['straight', 60], ['hairpin', STRAIGHT + Math.PI * RADIUS / 2 - 6]]) {
        for (const side of [-1, 1]) {
            for (const out of [0.5, 1, 2]) {
                for (const speed of [5, 10, 15]) {
                    const on = ret(game, env, { s, side, out, speed, assist: 'normal' });
                    const off = ret(game, env, { s, side, out, speed, assist: 'off' });
                    rows.push({ place, side, out, speed, on, off });
                }
            }
        }
    }
    return rows;
}

const bad = rows => rows.filter(r => r.on.against > 1e-9 || (r.off.back && (!r.on.back || r.on.time > r.off.time + 1e-9 || r.on.metres > r.off.metres + 1e-6)));
const line = r => `${r.place} side ${r.side} ${r.out} m ${r.speed} m/s: assist ${r.on.back ? r.on.time.toFixed(2) + ' s ' + r.on.metres.toFixed(1) + ' m' : 'not back'}, off ${r.off.back ? r.off.time.toFixed(2) + ' s ' + r.off.metres.toFixed(1) + ' m' : 'not back'}, against ${r.on.against.toFixed(3)}`;

describe('steering back onto the road from just past the edge', () => {
    test('before: an assist acted against the rider, or slowed the return', () => {
        const rows = sweep(games.before);
        const found = bad(rows);
        console.log(`before (${BEFORE}): ${found.length} of ${rows.length}\n${found.map(line).join('\n')}`);
        expect(found.length).toBeGreaterThan(0);
    });

    test('now: no assist against the input, and the return is as quick and as short as with the assist off', () => {
        const rows = sweep(games.after);
        const found = bad(rows);
        if (found.length) throw new Error(`${found.length} of ${rows.length} returns:\n${found.map(line).join('\n')}`);
        for (const r of rows) expect(r.on.back).toBe(r.off.back);
    });
});
