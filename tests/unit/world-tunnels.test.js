/**
 * @jest-environment node
 */
// No land in a tunnel or a gallery, and none across its portals (tests/helpers/world-tunnels.js reads every tube of
// the ride and of the side roads as drawn, with the bike put down every WALK_M along the stage):
//   inside  no land in a tube's box, between its floor and its roof
//   floor   the ride's floor drawn out to the tube's walls
//   mouth   no land over the road in front of a portal, between its walls
//   face    land that stands over the roof behind a portal is fronted in the portal's plane
// The rules that hold these are the builders' own, for any world (.agent/system/world.md, "Land and the tunnels").
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';
import { stagesFor } from '../helpers/world-stages.js';
import { diskFetch } from '../helpers/world-fetch.js';
import { tunnelWindow, tunnelReport, TUNNEL_LIMITS } from '../helpers/world-tunnels.js';

const game = loadGame(undefined, []);
const { THREE } = game;
const WALK_M = 200;
// Every tube within this of the bike is read: the side roads' tubes stand up to some hundreds of metres off the ride
const NEAR_M = 500;

describe('the rule (TerrainMesh.tubeClip)', () => {
    const { TerrainMesh } = game;
    // A slope of land rising across x through a tube 10 m wide along z, its floor at 0 and its roof at 6.5
    const tube = TerrainMesh.tubeBox([-5, 0, 0], [5, 0, 0], [5, 0, 20], [-5, 0, 20], 6.5);
    const land = (y0, slope) => {
        const positions = [], shades = [], index = [];
        for (let j = 0; j <= 4; j++) for (let i = 0; i <= 4; i++) { const x = -16 + i * 8, z = -8 + j * 8; positions.push(x, y0 + slope * x, z); shades.push(0.5, 0.5, 0.5); }
        for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { const v = j * 5 + i; index.push(v, v + 5, v + 1, v + 1, v + 5, v + 6); }
        return { positions: Float32Array.from(positions), shades: Float32Array.from(shades), index: Uint32Array.from(index) };
    };
    const inBox = (p) => Math.abs(p[0]) < 5 - 1e-6 && p[2] > 1e-6 && p[2] < 20 - 1e-6 && p[1] > -TerrainMesh.TUBE_UNDER_M + 1e-6 && p[1] < 6.5 + TerrainMesh.TUBE_OVER_M - 1e-6;
    const area = (positions, list) => { let a = 0; for (let i = 0; i < list.length; i += 3) { const [p, q, r] = [0, 1, 2].map(k => [positions[list[i + k] * 3], positions[list[i + k] * 3 + 1], positions[list[i + k] * 3 + 2]]); const u = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], w = [r[0] - p[0], r[1] - p[1], r[2] - p[2]]; a += Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]) / 2; } return a; };

    test('no piece of land is left in the box; what lies outside it, or over the roof, keeps its whole area', () => {
        const { positions, shades, index } = land(2, 0.3);
        const out = TerrainMesh.tubeClip(positions, shades, [index], [tube]);
        expect(out).not.toBeNull();
        const list = out.lists[0];
        for (let i = 0; i < list.length; i += 3) {
            const tri = [0, 1, 2].map(k => [out.positions[list[i + k] * 3], out.positions[list[i + k] * 3 + 1], out.positions[list[i + k] * 3 + 2]]);
            const mid = [0, 1, 2].map(j => (tri[0][j] + tri[1][j] + tri[2][j]) / 3);
            expect(inBox(mid)).toBe(false);
        }
        // The land in the box's plan between y 0 and 6.53 is x from -5 to 1.77 (y = 2 + 0.3 x), 20 m along
        const cut = (Math.min(5, (6.5 + TerrainMesh.TUBE_OVER_M - 2) / 0.3) - Math.max(-5, (-TerrainMesh.TUBE_UNDER_M - 2) / 0.3)) * 20 * Math.hypot(1, 0.3);
        expect(area(out.positions, list)).toBeCloseTo(area(positions, index) - cut, 1);
    });

    test('land wholly over the roof or under the floor is not cut', () => {
        for (const y0 of [20, -10]) {
            const { positions, shades, index } = land(y0, 0);
            expect(TerrainMesh.tubeClip(positions, shades, [index], [tube])).toBeNull();
        }
    });
});

const list = (items, kind, n = 8) => items.filter(r => r[kind] > 0).slice(0, n).map(r => JSON.stringify({ key: r.key, kind: r.kind, s: r.s, lengthM: r.lengthM, [kind]: r[kind], worst: r.worst[kind] })).join('\n');

for (const stage of stagesFor()) describe(`the ${stage} stage: no land in a tube or across its portals`, () => {
    // Each stage has a game of its own, so nothing the builders keep between worlds (shared materials, caches) lives
    // on past the stage
    let found, env, own;
    beforeAll(async () => {
        own = loadGame(undefined, []);
        const { fetchFn } = diskFetch();
        env = await own.WorldEnvironment.load(new own.THREE.Scene(), { id: stage, fetchFn, models: null, digest: async () => '0' });
        env.scenery.buildTile = () => null;
        const store = {};
        for (let s = env.startS + 1; s < env.endS; s += WALK_M) {
            const p = env.route.sample(s, {});
            env.update(p, s, null, Infinity);
            await env.streamer.settle(p, s);
            tunnelWindow(own, env, store, p, { nearM: NEAR_M });
        }
        found = tunnelReport(store);
        console.log(`tunnels (heap ${Math.round(process.memoryUsage().heapUsed / 1048576)} MB): ${found.runs} runs, ${found.portals} portals, ${found.places} places; ${found.inside} with land inside, ${found.floor} with no floor, ${found.mouth} with land in front of a mouth, ${found.face} with land unfronted across a portal\n${JSON.stringify(found.list.slice(0, 12).map(r => ({ key: r.key, kind: r.kind, lengthM: r.lengthM, inside: r.inside, floor: r.floor, mouth: r.mouth, face: r.face })))}`);
    }, 3600000);
    // Each stage's world is let go when its tests are done: every stage's env and readings held to the file's end ran
    // the worker out of its heap after four or five of the tour's stages
    afterAll(() => {
        if (env) env.dispose();
        env = null;
        found = null;
        own = null;
        const g = typeof gc === 'function' ? gc : (globalThis.gc || null);
        if (g) g();
        console.log(`MEM after ${stage}: gc ${!!g} heap ${Math.round(process.memoryUsage().heapUsed / 1048576)} MB`);
    });

    test('the far grid is cut only in the tubes\' boxes: every triangle clear of them is kept whole, every attribute at the vertex count', () => {
        const whole = env.horizonWhole, geometry = env.horizon.geometry, tubes = [...env.rideTubes(), ...[...env.sideTubes.values()].flat()];
        const count = geometry.attributes.position.count;
        for (const name of Object.keys(geometry.attributes)) expect([name, geometry.attributes[name].count]).toEqual([name, count]);
        const clear = (positions, a, b, c) => {
            const xs = [a, b, c].map(v => positions[v * 3]), zs = [a, b, c].map(v => positions[v * 3 + 2]);
            const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
            return !tubes.some(({ box }) => box[2] >= x0 && box[0] <= x1 && box[3] >= z0 && box[1] <= z1);
        };
        const kept = (positions, index, base) => {
            const out = new Set();
            for (let i = 0; i < index.length; i += 3) if (index[i] < base && index[i + 1] < base && index[i + 2] < base && clear(positions, index[i], index[i + 1], index[i + 2])) out.add(`${index[i]},${index[i + 1]},${index[i + 2]}`);
            return out;
        };
        const base = whole.positions.length / 3, before = kept(whole.positions, whole.index, base), after = kept(geometry.attributes.position.array, geometry.index.array, base);
        expect(before.size).toBeGreaterThan(0);
        expect([...before].filter(k => !after.has(k))).toEqual([]);
        // (the grid's own vertices where they were: the cut adds vertices after them and moves none)
        expect(Array.from(geometry.attributes.position.array.subarray(0, base * 3))).toEqual(Array.from(whole.positions));
    });

    test('no land in a tube, between its floor and its roof', () => {
        if (found.inside > TUNNEL_LIMITS.inside) throw new Error(`${found.inside} places with land inside a tube:\n${list(found.list, 'inside')}`);
    });

    test('the ride\'s floor reaches its tube\'s walls', () => {
        if (found.floor > TUNNEL_LIMITS.floor) throw new Error(`${found.floor} places of a tube's floor with nothing drawn:\n${list(found.list, 'floor')}`);
    });

    test('no land over the road in front of a portal', () => {
        if (found.mouth > TUNNEL_LIMITS.mouth) throw new Error(`${found.mouth} places with land in front of a mouth:\n${list(found.list, 'mouth')}`);
    });

    test('land over the roof behind a portal is fronted in the portal\'s plane', () => {
        if (found.face > TUNNEL_LIMITS.face) throw new Error(`${found.face} places with land unfronted across a portal:\n${list(found.list, 'face')}`);
    });
});
