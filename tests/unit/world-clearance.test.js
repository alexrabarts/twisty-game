// Nothing the world places stands in a road. The Tremola slice is ridden in node with the streamer, every tree,
// boulder, house, signpost, landmark and barrier is gathered as it is built, and each one's footprint (its geometry's
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
const { THREE, WorldGround, WorldGraph, RoadClearance } = game;

// One line per offender, for a failure message that says where to look
const list = offenders => offenders.map(o => `${o.level} ${o.type} ${o.name} at (${o.x}, ${o.z}) ${o.clearance} m past the ${o.road} band${o.edgeId !== null ? ` of edge ${o.edgeId}` : ''}${o.s !== null ? ` at s ${o.s}` : ''}`).join('\n');

describe('the Tremola slice: no scenery in a road', () => {
    let gathered, offenders;
    beforeAll(async () => {
        const { fetchFn } = diskFetch();
        gathered = await rideAndGather(game, { fetchFn, stepM: 100, models: modelStandIns(THREE, readFileSync, root) });
        offenders = audit(gathered.bands, gathered.things);
    }, 120000);

    test('every kind of scenery was placed and measured', () => {
        const counts = {};
        for (const t of gathered.things) counts[t.type] = (counts[t.type] || 0) + 1;
        for (const type of ['tree', 'boulder', 'house', 'signpost', 'landmark', 'barrier']) expect(counts[type] || 0).toBeGreaterThan(0);
        expect(counts.tree).toBeGreaterThan(1500);
    });

    test('no footprint reaches into a road band (a barrier only into the side road it closes)', () => {
        const fails = offenders.filter(o => o.level === 'fail');
        if (fails.length) throw new Error(`${fails.length} things stand in a road:\n${list(fails)}`);
    });

    test('trees, boulders and signposts keep their margin from every road edge', () => {
        const near = offenders.filter(o => ['tree', 'boulder', 'signpost', 'landmark'].includes(o.type));
        if (near.length) throw new Error(`${near.length} things within their margin of a road:\n${list(near)}`);
    });

    test('every pass through a junction has its signpost, standing before it beside the ride', () => {
        const env = gathered.env;
        const passes = env.graph.junctions.flatMap(j => j.passes.filter(p => p.inEdge !== null));
        const signs = gathered.things.filter(t => t.type === 'signpost');
        expect(signs).toHaveLength(passes.length);
        const poses = env.scenery.signpostPoses(env.graph.junctions, env.route);
        poses.forEach((pose, i) => {
            const at = env.route.project(pose.x, pose.z, null, {});
            // Beside the ride, not out in the land, and before the junction it names
            expect(Math.abs(at.lateral)).toBeLessThan(at.width / 2 + 12);
            expect(at.s).toBeLessThan(passes[i].sIn);
            expect(passes[i].sIn - at.s).toBeLessThan(45);
        });
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
                    const half = Math.max(3, b.width / 2 + WorldGround.BARRIER_MARGIN_M), depth = WorldGround.BARRIER_DEPTH_M;
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
    for (const kind of ['tree', 'boulder', 'signpost', 'landmark']) expect(MARGIN_M[kind]).toBe(game.Scenery.CLEAR_M[kind]);
});
