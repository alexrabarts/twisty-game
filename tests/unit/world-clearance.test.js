// Nothing the world places stands in a road. The Tremola slice is ridden in node with the streamer, every tree,
// boulder, house, marker stone, tuft, landmark and barrier is gathered as it is built, and each one's footprint (its geometry's
// box under its matrix) is measured against every road band rebuilt from the samples: the ride and every side edge,
// each sample's own width plus the verge. The trees and houses are boxes the size of their .glb models
// (tests/helpers/world-clearance.js modelStandIns), so the footprints are the drawn ones.
// The browser probe world-clearance (tools/terrain-check.mjs) proves the same against the drawn meshes, by raycast.
import { describe, test, expect, beforeAll } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { loadGame } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';
import { audit, clearanceOf, modelStandIns, roadBands, MARGIN_M } from '../helpers/world-clearance.js';
import { rideAndGather } from '../helpers/world-clearance-run.js';

const root = new URL('../../', import.meta.url);
const game = loadGame();
const { THREE, WorldGround, WorldGraph, RoadClearance, RoadSurface } = game;
// The most a thing's lowest point may stand over the drawn ground under its middle
const FLOAT_M = 0.1;

// One line per offender, for a failure message that says where to look
const list = offenders => offenders.map(o => `${o.level} ${o.type} ${o.name} at (${o.x}, ${o.z}) ${o.clearance} m past the ${o.road} band${o.edgeId !== null ? ` of edge ${o.edgeId}` : ''}${o.s !== null ? ` at s ${o.s}` : ''}`).join('\n');

describe('the Tremola slice: no scenery in a road', () => {
    let gathered, offenders;
    beforeAll(async () => {
        const { fetchFn } = diskFetch();
        gathered = await rideAndGather(game, { fetchFn, stepM: 100, models: modelStandIns(THREE, readFileSync, root) });
        offenders = audit(gathered.bands, gathered.things);
    }, 300000);

    test('every kind of scenery was placed and measured', () => {
        const counts = {};
        for (const t of gathered.things) counts[t.type] = (counts[t.type] || 0) + 1;
        for (const type of ['tree', 'boulder', 'house', 'stone', 'tuft', 'landmark', 'barrier']) expect(counts[type] || 0).toBeGreaterThan(0);
        expect(counts.tree).toBeGreaterThan(1500);
    });

    test('no footprint reaches into a road band (a barrier only into the side road it closes)', () => {
        const fails = offenders.filter(o => o.level === 'fail');
        if (fails.length) throw new Error(`${fails.length} things stand in a road:\n${list(fails)}`);
    });

    test('trees, boulders, marker stones and tufts keep their margin from every road edge', () => {
        const near = offenders.filter(o => ['tree', 'boulder', 'stone', 'tuft', 'landmark'].includes(o.type));
        if (near.length) throw new Error(`${near.length} things within their margin of a road:\n${list(near)}`);
    });

    test('the marker stones stand in rows on the ride\'s own edge, a spacing apart (their drops: world-stones.test.js)', () => {
        const env = gathered.env;
        const stones = gathered.things.filter(t => t.type === 'stone');
        const at = stones.map(stone => env.route.project(stone.x, stone.z, null, {}));
        for (const a of at) {
            expect(Math.abs(a.lateral)).toBeGreaterThan(a.width / 2 + RoadSurface.VERGE_M);
            expect(Math.abs(a.lateral)).toBeLessThan(a.width / 2 + RoadSurface.VERGE_M + 1.2);
            // No stone stands alone: another of its row is one spacing along the same edge
            expect(at.some(b => b !== a && Math.sign(b.lateral) === Math.sign(a.lateral) && Math.abs(Math.abs(b.s - a.s) - game.Scenery.STONE_GAP_M) < 0.3)).toBe(true);
        }
    });

    // The rule for every kind (Scenery.footY): a thing's height is read from the drawn ground at its own place. The
    // yellow signposts this replaced took the road's height beside them, and stood in the air over a bank that falls
    // away from the road, or in the bank where it rises
    test('nothing floats: the foot of every tree, boulder, marker stone and tuft is in the drawn ground under it', () => {
        const floating = [];
        for (const t of gathered.things) {
            if (!['tree', 'boulder', 'stone', 'tuft'].includes(t.type)) continue;
            expect(Number.isFinite(t.groundY)).toBe(true);
            if (t.y0 > t.groundY + FLOAT_M || t.y1 < t.groundY) floating.push(`${t.type} at (${t.x.toFixed(1)}, ${t.z.toFixed(1)}): foot ${t.y0.toFixed(2)}, top ${t.y1.toFixed(2)}, ground ${t.groundY.toFixed(2)}`);
        }
        if (floating.length) throw new Error(`${floating.length} things float over the ground or lie under it (${[...new Set(floating.map(f => f.split(' ')[0]))].join(', ')}):\n${floating.slice(0, 40).join('\n')}`);
    });

    test('planted: a thing set at the road\'s height beside it, as the signposts were, floats or is buried', () => {
        const env = gathered.env;
        const p = {};
        let off = 0, most = 0, places = 0;
        for (const junction of env.graph.junctions) for (const pass of junction.passes) {
            if (pass.inEdge === null || pass.sIn < 20) continue;
            env.route.sample(pass.sIn - 15, p);
            // Where a signpost stood: past the verge by its board and its margin
            const o = game.Route.RIGHT * (p.width / 2 + RoadSurface.VERGE_M + 2.5);
            const x = p.x + o * Math.cos(p.heading), z = p.z - o * Math.sin(p.heading);
            const ground = env.ground.landY(x, z, null);
            if (ground === null) continue;
            places++;
            const gap = Math.abs(p.y - env.ground.groundY(x, z, null));
            most = Math.max(most, gap);
            if (gap > FLOAT_M) off++;
        }
        expect(places).toBeGreaterThan(5);
        expect(off).toBeGreaterThan(0);
        expect(most).toBeGreaterThan(0.5);
    });
});

describe('the gate frames', () => {
    test('no post of a gate frame stands in a side road (the start gate at Airolo stood in one)', async () => {
        const { fetchFn } = diskFetch();
        const env = await game.WorldEnvironment.load(new THREE.Scene(), { id: 'tremola', fetchFn, models: null, digest: async () => '0' });
        await env.data.ensureChunks(env.data.manifest.chunks.map((_, k) => k));
        const bands = roadBands(env, game.RoadSurface.VERGE_M);
        const pos = env.gateMesh.geometry.attributes.position;
        // The posts are the frame's vertices from the ground to 5.2 m over the road; any of them over a side band fails
        const bad = [];
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
            const near = clearanceOf(bands, [[x - 0.01, z - 0.01], [x + 0.01, z - 0.01], [x + 0.01, z + 0.01], [x - 0.01, z + 0.01]], y, y, g => g.kind === 'ride');
            if (near.clearance < 0) bad.push(`(${x.toFixed(1)}, ${z.toFixed(1)}) ${near.clearance.toFixed(2)} m past side edge ${near.edgeId}`);
        }
        if (bad.length) throw new Error(`gate posts in a side road:\n${[...new Set(bad)].slice(0, 20).join('\n')}`);
    }, 60000);

    test('nothing of a roadworks site stands in a side road', async () => {
        const { fetchFn } = diskFetch();
        const env = await game.WorldEnvironment.load(new THREE.Scene(), { id: 'tremola', fetchFn, models: null, digest: async () => '0' });
        await env.data.ensureChunks(env.data.manifest.chunks.map((_, k) => k));
        const bands = roadBands(env, game.RoadSurface.VERGE_M);
        const bad = [];
        for (const e of env.roadworks.elements) {
            // Its box in plan, under its place and yaw (game.Roadworks.local's frame)
            const cos = Math.cos(e.yaw), sin = Math.sin(e.yaw);
            const poly = [[e.box.x0, e.box.z0], [e.box.x1, e.box.z0], [e.box.x1, e.box.z1], [e.box.x0, e.box.z1]].map(([c, a]) => [e.x + c * cos + a * sin, e.z - c * sin + a * cos]);
            const near = clearanceOf(bands, poly, e.y, e.y + e.box.y1, g => g.kind === 'ride');
            if (near.clearance < 0) bad.push(`${e.kind} of the site at s ${Math.round(e.site.s)}: ${near.clearance.toFixed(2)} m past side edge ${near.edgeId}`);
        }
        if (bad.length) throw new Error(`roadworks in a side road:\n${bad.join('\n')}`);
    }, 60000);
});

describe('the barriers close side roads and never the ride', () => {
    let env, bands, things;
    beforeAll(async () => {
        const { fetchFn } = diskFetch();
        ({ env, bands, things } = await rideAndGather(game, { fetchFn, stepM: 2000 }));
    }, 120000);

    test('every barrier of every pass is placed', () => {
        const want = env.graph.junctions.reduce((n, j) => n + j.passes.reduce((m, p) => m + p.barriers.length, 0), 0);
        expect(things.filter(t => t.type === 'barrier')).toHaveLength(want);
    });

    test('the wall a barrier makes (WorldGround.setBarriers) stays off the ride band, every metre across it', () => {
        const on = [];
        for (const junction of env.graph.junctions) {
            for (const pass of junction.passes) {
                for (const b of env.graph.barriersFor(pass.sIn, 1, env.scenery.roads).filter(x => x.junctionId === junction.id)) {
                    const half = WorldGround.barrierHalf(b.width), depth = WorldGround.BARRIER_DEPTH_M;
                    const f = [Math.sin(b.heading), Math.cos(b.heading)], l = [Math.cos(b.heading), -Math.sin(b.heading)];
                    const poly = [[-depth, -half], [depth, -half], [depth, half], [-depth, half]].map(([a, c]) => [b.x + a * f[0] + c * l[0], b.z + a * f[1] + c * l[1]]);
                    const near = clearanceOf(bands, poly, -Infinity, Infinity, g => g.kind === 'side');
                    if (near.clearance < 0) on.push(`${junction.id} edge ${b.edgeId} at (${b.x.toFixed(1)}, ${b.z.toFixed(1)}): ${near.clearance.toFixed(2)} m past the ride band at s ${Math.round(near.s)}`);
                }
            }
        }
        if (on.length) throw new Error(`barriers on the ride:\n${on.join('\n')}`);
    });

    test('a barrier stands across its own side road', () => {
        for (const t of things.filter(x => x.type === 'barrier')) {
            const near = clearanceOf(bands, t.poly, t.y0, t.y1, g => !(g.kind === 'side' && t.chain.includes(g.edgeId)));
            expect(near.clearance).toBeLessThan(0);
            // On the road's surface, not left at the height of a tile that was not here yet
            expect(Math.abs(t.y0 - (near.roadY - 0.1))).toBeLessThan(0.5);
        }
    });

    test('the importer pose of a side road shorter than the stub is moved off the far junction', () => {
        // j68's edge 140 is 19 m long: the importer put its barrier on the node where edges 139 and 141 meet
        const junction = env.graph.junctions.find(j => j.id === 'j68');
        const barrier = junction.passes[0].barriers[0];
        expect(env.data.edges[barrier.edgeId].length).toBeLessThan(WorldGraph.STUB_M);
        const placed = env.graph.barrierPose(junction, barrier, env.graph.stubWidth(barrier.edgeId), env.scenery.roads);
        expect(Math.hypot(placed.x - barrier.x, placed.z - barrier.z)).toBeGreaterThan(1);
    });
});

describe('RoadClearance', () => {
    const route = { points: [{ x: 0, z: 0, width: 10 }, { x: 0, z: 100, width: 10 }] };
    const verge = game.RoadSurface.VERGE_M;
    const edges = [{ id: 0, onRide: true, first: 0, count: 2 }, { id: 1, onRide: false, first: 2, count: 2 }];
    const data = {
        edges, chunks: new Map([[0, {}]]), chunkOf: () => 0,
        edgeSamples: id => (id === 1 ? { x: [30, 30], z: [0, 100], width: [4, 4] } : null)
    };
    const roads = new RoadClearance(route, data);

    test('measures past each sample\'s own width and the verge, the ride and the side roads alike', () => {
        expect(roads.clearance(5 + verge + 2, 50, 20)).toBeCloseTo(2, 9);
        expect(roads.clearance(0, 50, 20)).toBeCloseTo(-5 - verge, 9);
        expect(roads.clearance(30 - 2 - verge - 3, 50, 20)).toBeCloseTo(3, 9);
        expect(roads.clearOfRoad(15, 50, 2, 1)).toBe(true);
        expect(roads.clearOfRoad(9, 50, 2, 1)).toBe(false);
        // A side edge left out is not there
        expect(roads.clearance(30, 50, 20, id => id === 1)).toBeGreaterThan(0);
    });

    test('a rectangle is clear only when all of its outline is', () => {
        expect(roads.clearOfRoadBox(17.5, 50, 0, 10, 6, 0)).toBe(true);
        expect(roads.clearOfRoadBox(15, 50, 0, 10, 20, 0)).toBe(false);
    });
});

test('the margins of the audit are the placement\'s own', () => {
    for (const kind of ['tree', 'boulder', 'stone', 'tuft', 'landmark']) expect(MARGIN_M[kind]).toBe(game.Scenery.CLEAR_M[kind]);
});
