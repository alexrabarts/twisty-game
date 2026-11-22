/**
 * @jest-environment node
 */
// Every row of Vehicle.RIDER_FALLS is reached on the real stage, by its rule (Vehicle.riderFallRow over the crash's
// own numbers, Vehicle.riderCrash): the Tremola slice is streamed in node, and the real Vehicle is crashed at a
// straight, against the walls beside the ride, and at the road's edge where the land falls away. Each crash is read
// from what is drawn (tests/helpers/rider-fall.js), and keeps the rules of every fall: on the ground, out of the
// walls. The flat-plane rules are tests/unit/rider-fall-scale.test.js.
import { describe, test, expect, beforeAll } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';
import { DT, bikeAt, crashAndWatch, sidesAt } from '../helpers/rider-fall.js';

const game = loadGame(undefined, []);
const { THREE, WorldEnvironment, Vehicle } = game;
const FALLS = Vehicle.RIDER_FALLS;
const GROUND_M = 0.02;
// The straight of tests/unit/world-rider-fall.test.js
const STRAIGHT_S = 900;

describe('every row of falls is reached on the real stage', () => {
    let env;
    const settle = async (s) => {
        const p = env.route.sample(s, {});
        env.update(p, s, null, Infinity);
        await env.streamer.settle(p, s);
        env.updateBarriers(s);
        return p;
    };
    // A bike on the ride at s, `lateral` m off the centre line (bikeAt's x: + is to the left of the way), turned
    // `toward` rad
    const bikeOn = (p, { lateral = 0, toward = 0, speed }) => bikeAt(game, {
        environment: env, x: p.x + Math.cos(p.heading) * lateral, y: p.y, z: p.z - Math.sin(p.heading) * lateral, heading: p.heading + toward, speed
    });
    // A crash where it stands, watched for `seconds`: the row, the numbers, and the worst under the ground
    const crash = (v, why, { side = 1, lean = 0.5, seconds = 2.2 } = {}) => {
        const frames = crashAndWatch(game, v, { why, side, lean, seconds });
        return { row: v.riderFall.row, crash: { ...v.riderFall.crash }, under: Math.max(...frames.map(f => f.under)), middle: Math.max(...frames.map(f => f.middle)) };
    };
    const seen = {};
    const note = (name, result, where) => {
        if (!seen[result.row] || where.startsWith('a wall')) seen[result.row] = where;
        expect([where, result.under < GROUND_M]).toEqual([where, true]);
        expect([where, !(result.middle > 0.3)]).toEqual([where, true]);
    };

    beforeAll(async () => {
        const { fetchFn } = diskFetch();
        env = await WorldEnvironment.load(new THREE.Scene(), { id: 'tremola', fetchFn, models: null, digest: async () => '0' });
    }, 300000);

    test('on a straight: by the speed and the lean', async () => {
        const p = await settle(STRAIGHT_S);
        const cases = [
            ['grip', 16, 0.5, 'lowside'], ['grip', 22, 0.3, 'lowsideTumble'], ['rear', 20, 0.5, 'highside'], ['rear', 10, 0.5, 'highsideShort'],
            ['drop', 16, 0.5, 'drop'], ['drop', 6, 0.5, 'dropFeet'], ['stall', 2, 0.5, 'tip']
        ];
        for (const [why, speed, lean, row] of cases) {
            const r = crash(bikeOn(p, { speed }), why, { lean });
            expect([why, speed, r.row]).toEqual([why, speed, row]);
            note(row, r, `${why} at ${speed} m/s on the straight`);
        }
        // A car met square, fast and slow (as Game raises it: blockRider and hitFrom from the car's middle)
        for (const [speed, row] of [[12, 'front'], [5, 'slump']]) {
            const v = bikeOn(p, { speed });
            const car = { x: p.x + Math.sin(p.heading) * 2.5, z: p.z + Math.cos(p.heading) * 2.5 };
            v.update(DT, 0, 0, 0, 0);
            v.blockRider(car.x, car.z, 1.1);
            v.hitFrom(v.position.x - car.x, v.position.z - car.z);
            const r = crash(v, 'car');
            expect([speed, r.row]).toEqual([speed, row]);
            note(row, r, `a car at ${speed} m/s`);
        }
    }, 300000);

    test('against the walls beside the ride: a glance, a slow hit and a square fast one', async () => {
        const want = new Set(['glance', 'slump', 'front']), walls = {};
        for (let s = env.startS + 100; s < env.endS - 100 && [...want].some(row => !walls[row]); s += 40) {
            const p = await settle(s);
            const probe = bikeOn(p, { speed: 0 });
            const wall = sidesAt(probe, s + 20, 2.5).find(side => side.kind === 'wall');
            if (!wall || Math.abs(env.route.curvatureAt(s + 20, 8)) > 1 / 80) continue;
            for (const [speed, toward] of [[16, 0.3], [8, 0.6], [16, 0.6], [28, 0.6]]) {
                const v = bikeOn(p, { toward: wall.sign * toward, speed });
                let ticks = 0;
                while (!v.crashed && ticks++ < 300) { v.speed = speed; v.leanAngle = 0; v.update(DT, 0, 0, 0, 0); }
                if (v.crashWhy !== 'wall') continue;
                // (the ground and the walls against such a hit are tests/unit/world-rider-fall.test.js)
                v.update(DT, 0, 0, 0, 0);
                const r = { row: v.riderFall.row, crash: v.riderFall.crash, under: -Infinity, middle: -Infinity };
                expect(r.crash.hit).toBe(true);
                walls[r.row] = true;
                note(r.row, r, `a wall at ${s} at ${speed} m/s, ${toward} rad to it`);
            }
        }
        for (const row of want) expect([row, !!walls[row]]).toEqual([row, true]);
    }, 600000);

    test('at the road\'s edge where the land falls away: a roll down the bank on either side', async () => {
        const want = new Set(['lowsideRoll', 'highsideRoll', 'tipRoll']);
        for (let s = env.startS + 100; s < env.endS - 100 && [...want].some(row => !seen[row]); s += 30) {
            const p = await settle(s);
            for (const sign of [-1, 1]) {
                const edge = sign * (p.width / 2 - 0.4);
                // The lean toward the edge (the low side there) and away from it (the high side there)
                for (const side of [-1, 1]) {
                    const look = crash(bikeOn(p, { lateral: edge, speed: 2 }), 'stall', { side, seconds: 0.05 });
                    const tries = [];
                    if (look.crash.bank >= FALLS.lowsideRoll.when.bank[0]) tries.push(['grip', 16, 'lowsideRoll'], ['stall', 2, 'tipRoll']);
                    if (look.crash.highBank >= FALLS.highsideRoll.when.highBank[0]) tries.push(['rear', 20, 'highsideRoll']);
                    for (const [why, speed, row] of tries) {
                        if (seen[row]) continue;
                        const r = crash(bikeOn(p, { lateral: edge, speed }), why, { side });
                        expect([s, why, r.row]).toEqual([s, why, row]);
                        note(row, r, `${why} at ${speed} m/s at the edge at ${s}`);
                    }
                }
            }
        }
        for (const row of want) expect([row, !!seen[row]]).toEqual([row, true]);
    }, 900000);

    test('and so every row of the table', () => {
        expect(Object.keys(seen).sort()).toEqual(Object.keys(FALLS).sort());
        console.log(`rows reached: ${Object.entries(seen).map(([row, where]) => `${row}: ${where}`).join('; ')}`);
    });
});
