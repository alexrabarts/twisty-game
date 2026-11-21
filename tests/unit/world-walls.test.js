/**
 * @jest-environment node
 */
// The retaining walls of the Tremola slice against the land drawn round them (tests/helpers/world-walls.js reads the
// drawn triangles of every wall within 350 m of the bike, every 300 m of the ride):
//   1. no land inside or in front of a wall: `buried` (the land in front stands to the wall's top) and `climbs` (the
//      land goes on through the wall's plane, steeper than a fill stands)
//   2. no gap at a wall's top or foot: `top` (no road surface meets the top), `hangs` (the foot is over the land) and
//      `open` (past a wall's end the road's edge hangs over the land with nothing under it)
//   3. no steps between wall pieces: `blocks` (a run shorter than 10 m) and `steps` (two runs of one edge less than
//      12 m apart)
//
// Before the land was cut to the walls (8911b42): 13 buried faces, 45 that the land climbed, 29 blocks, 28 steps and
// 29 open ends, of 759 faces in 157 runs. The 8 m height grid cannot hold a wall, so the triangle from the last node
// in front of a wall to the first node behind it was a ramp of land through the stone; a wall was decided row by row
// on the nearest zone node, so it came in pieces with a slab of slope between them; and the slope beside a wall's end
// started at nothing, a missing triangle under the road's edge.
//
// What still stands, held here so it can only shrink:
//   - 4 buried faces and 6 the land climbs: side roads' walls where two side roads' walls meet at a node, and the
//     ride's where a wall turns the inside of a hairpin (a line that leaves a triangle and comes back into it is
//     cut once). At 7bcc7cb the land climbed 25: 13 had come with the bank a wall ends in (TerrainMesh.CUT_BANK), where
//     a node near the wall's end keeps its own height under the bank down from the end and the land's own ramp to
//     the wall is steeper than a fill stands. 19 went with two rules of tests/unit/world-spikes.test.js: the land at
//     a wall's foot rises along the wall as a bank (TerrainMesh.cuts `cap`: a vertex on the wall's line no longer
//     takes the full height of a node 8 m off beside a vertex a metre away), and a wall's line cuts every triangle
//     its wall stands in (the first crossing of a triangle was taken, and where that was the line's own run on past
//     the wall's start, at a hairpin, the triangle was left whole)
//   - 1 face whose top a side road's own ribbon does not meet (its far ribbon is drawn 0.1 m lower there)
//   - 1 block: a side road's wall of 4.7 m at the first metres of the ride, between a deck and a junction
//   - 15 open ends: side roads that go on over another road with no deck under them, and the ride at a junction's
//     mouth where a side road lies a metre under its edge. (A wall now goes on to a bridge's first row, a side
//     road's wall is joined to the end of the ride's beside it, and two walls that stand end to end at a node close
//     each other: with that last rule read on the build before, it had 17)
import { describe, test, expect, beforeAll } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';
import { wallWindow, wallRuns, WALL_LIMITS } from '../helpers/world-walls.js';

const LIMIT = WALL_LIMITS;

const game = loadGame(undefined, []);
const { THREE, WorldEnvironment, WorldData, TerrainMesh } = game;

const list = (items, n = 12) => items.slice(0, n).map(i => JSON.stringify(i)).join('\n');

describe('the Tremola slice: the land meets every retaining wall', () => {
    let env, walls;
    const cut = { tiles: 0, records: 0, lowered: 0, holes: [], edges: [], nodes: [] };
    beforeAll(async () => {
        const { fetchFn } = diskFetch();
        env = await WorldEnvironment.load(new THREE.Scene(), { id: 'tremola', fetchFn, models: null, digest: async () => '0' });
        // Trees and houses are not walls; their building is most of the streaming time
        env.scenery.buildTile = () => null;
        const store = {};
        const seen = new Set();
        const W = 300;
        for (let s = env.startS; s < env.endS; s += W) {
            const p = env.route.sample(s + W / 2, {});
            env.update(p, s, null, Infinity);
            await env.streamer.settle(p, s + W / 2);
            wallWindow(game, env, store, p);
            // The cuts of every tile drawn at full detail here
            for (const [key, built] of env.tileMeshes) {
                if (seen.has(key) || !/lod0$/.test(built.mesh.name)) continue;
                seen.add(key);
                const cuts = env.cutsOf(key);
                if (!cuts) continue;
                cut.tiles++;
                cut.lowered += cuts.lowered.size;
                const [tx, tz] = key.split(',').map(Number);
                const n = WorldData.TILE_N, m = WorldData.TILE_M;
                for (const [id, record] of cuts) {
                    cut.records++;
                    let area = 0;
                    for (const part of [record.front, record.behind]) {
                        for (const [a, b, c] of part.tris) {
                            const A = part.verts[a], B = part.verts[b], C = part.verts[c];
                            area += Math.abs((B.x - A.x) * (C.z - A.z) - (C.x - A.x) * (B.z - A.z)) / 2;
                        }
                    }
                    const whole = (WorldData.CELL_M * WorldData.CELL_M) / 2;
                    if (Math.abs(area - whole) > 1e-3) cut.holes.push({ key, id, areaM2: Math.round(area * 1000) / 1000 });
                    // A cut's end on the tile's edge: the tile across the edge ends a cut at the same place
                    for (const v of [record.chain[0], record.chain[record.chain.length - 1]]) {
                        const fx = (v.x - tx * m) / WorldData.CELL_M, fz = (v.z - tz * m) / WorldData.CELL_M;
                        const dx = Math.abs(fx) < 1e-7 ? -1 : Math.abs(fx - (n - 1)) < 1e-7 ? 1 : 0, dz = Math.abs(fz) < 1e-7 ? -1 : Math.abs(fz - (n - 1)) < 1e-7 ? 1 : 0;
                        if (!dx && !dz) continue;
                        const other = `${tx + dx},${tz + dz}`;
                        if (!env.data.tile(other)) continue;
                        const across = env.cutsOf(other);
                        const met = across && [...across.values()].some(r => [r.chain[0], r.chain[r.chain.length - 1]].some(w => Math.hypot(w.x - v.x, w.z - v.z) < 1e-6 && Math.abs(w.tau - v.tau) < 1e-9));
                        if (!met && v.tau < 1) cut.edges.push({ key, other, x: Math.round(v.x * 100) / 100, z: Math.round(v.z * 100) / 100 });
                    }
                }
                // A lowered node on the tile's edge is lowered alike in the tile across it
                for (const [at, y] of cuts.lowered) {
                    const i = at % n, j = Math.floor(at / n);
                    for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                        if ((dx < 0 && i !== 0) || (dx > 0 && i !== n - 1) || (dz < 0 && j !== 0) || (dz > 0 && j !== n - 1) || (!dx && !dz)) continue;
                        const other = `${tx + dx},${tz + dz}`;
                        if (!env.data.tile(other)) continue;
                        const across = env.cutsOf(other);
                        const theirs = across ? across.lowered.get((dz ? (dz < 0 ? n - 1 : 0) : j) * n + (dx ? (dx < 0 ? n - 1 : 0) : i)) : undefined;
                        if (theirs === undefined || Math.abs(theirs - y) > 1e-6) cut.nodes.push({ key, other, i, j, y, theirs });
                    }
                }
            }
        }
        walls = wallRuns(store);
        console.log(`walls: ${walls.faces} faces in ${walls.runs} runs; ${walls.buried.length} buried, ${walls.climbs.length} climbed, ${walls.hangs.length} hanging, ${walls.top.length} tops, ${walls.blocks.length} blocks, ${walls.steps.length} steps, ${walls.open.length} open ends; ${cut.records} cut triangles and ${cut.lowered} lowered nodes in ${cut.tiles} tiles`);
    }, 3600000);

    test('the walls of the whole slice were read, and the land is cut to them', () => {
        expect(walls.faces).toBeGreaterThan(500);
        expect(walls.measured).toBe(walls.faces);
        expect(cut.records).toBeGreaterThan(1000);
    });

    test('no land stands inside or in front of a wall', () => {
        if (walls.buried.length > LIMIT.buried) throw new Error(`${walls.buried.length} wall faces with the land in front at their top (at most ${LIMIT.buried}):\n${list(walls.buried)}`);
        if (walls.climbs.length > LIMIT.climbs) throw new Error(`${walls.climbs.length} wall faces the land climbs steeper than a fill stands (at most ${LIMIT.climbs}):\n${list(walls.climbs)}`);
    });

    test('no gap at a wall\'s top, at its foot or past its end', () => {
        if (walls.top.length > LIMIT.top) throw new Error(`${walls.top.length} wall tops no road surface meets (at most ${LIMIT.top}):\n${list(walls.top)}`);
        if (walls.hangs.length > LIMIT.hangs) throw new Error(`${walls.hangs.length} wall feet over the land (at most ${LIMIT.hangs}):\n${list(walls.hangs)}`);
        if (walls.open.length > LIMIT.open) throw new Error(`${walls.open.length} wall ends past which the road's edge hangs open (at most ${LIMIT.open}):\n${list(walls.open)}`);
    });

    test('a wall is one run: no blocks and no steps between pieces', () => {
        if (walls.blocks.length > LIMIT.blocks) throw new Error(`${walls.blocks.length} runs of wall under 10 m (at most ${LIMIT.blocks}):\n${list(walls.blocks)}`);
        if (walls.steps.length > LIMIT.steps) throw new Error(`${walls.steps.length} pairs of runs under 12 m apart (at most ${LIMIT.steps}):\n${list(walls.steps)}`);
    });

    test('the parts of every cut triangle cover it, and two tiles cut and lower their shared edge alike', () => {
        if (cut.holes.length) throw new Error(`${cut.holes.length} cut triangles whose parts do not cover them:\n${list(cut.holes)}`);
        if (cut.edges.length) throw new Error(`${cut.edges.length} cuts that end on a tile's edge with no cut across it:\n${list(cut.edges)}`);
        if (cut.nodes.length) throw new Error(`${cut.nodes.length} nodes lowered in one tile and not alike in the tile across the edge:\n${list(cut.nodes)}`);
    });

    test('the physics reads the land as it is cut: level in front of a wall, the road\'s height behind it', () => {
        // Across the wall above km 2.7 (the upper leg's edge, 16 m up the bank from the lower leg): before the cut the
        // land was a ramp from the lower road to the upper one, 10 m of it in front of the stone
        const p = env.route.sample(2684, {});
        const at = d => env.ground.tileHeight(p.x + d * Math.cos(p.heading), p.z - d * Math.sin(p.heading)) - p.y;
        env.update(p, 2684, null, Infinity);
        for (const d of [8, 10, 12, 14]) expect(Math.abs(at(d))).toBeLessThan(0.5);
        expect(at(17.5)).toBeGreaterThan(12);
        expect(TerrainMesh.CUT_BACK_M).toBeGreaterThan(0);
    });
});
