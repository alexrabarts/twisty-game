// Every road drawn within the LOD0 radius looks like a road, whatever its role: the ride inside the stage, the road
// that goes on before the start and past the finish, the stubs and every side road. Over the shipped Tremola slice,
// with the bike at each station, the start and the finish: every road ribbon triangle within ROAD_LOD_M[0] of the bike
// is in the near material (textured asphalt or setts, markings by class) and its rows carry a verge on both sides.
// tools/terrain-check.mjs world-road-look counts the same in the drawn picture (flat LOD1 road pixels near the camera).
import { describe, test, expect, beforeAll } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';
import { readFileSync } from 'node:fs';

const game = loadGame();
const { THREE, WorldEnvironment, WorldStreamer, RoadSurface, RoadMesh } = game;

// The ride's section is LOD0 by the distance to the box of its centre line; a triangle's centroid can lie a quarter of
// the road's width outside that box
const NEAR_M = WorldStreamer.ROAD_LOD_M[0] - 5;
// A verge on a side is its outer column at least this far past the carriageway's edge (the bridge verge is 0.4 m)
const VERGE_MIN_M = 0.3;

// The road ribbon triangles within NEAR_M of (x, z): {near, flat, noVerge, held, roads}. `flat` counts triangles not in
// the near material, `noVerge` those of a row without a verge on a side (`held` the hairpin's inside edge, held
// within the bend: paved to the end by design, RoadMesh.hold)
function measure(env, x, z) {
    const out = { near: 0, flat: 0, noVerge: 0, held: 0, flatAt: [] };
    const nearMaterial = RoadSurface.nearMaterial();
    const meshes = [];
    for (const group of [env.roadGroup, env.sideGroup]) group.traverse(o => { if (o.isMesh && (o.name === 'road-ribbon' || o.name === 'road-side')) meshes.push(o); });
    for (const mesh of meshes) {
        const geometry = mesh.geometry;
        const pos = geometry.attributes.position.array;
        const index = geometry.index ? geometry.index.array : null;
        const count = index ? index.length / 3 : pos.length / 9;
        const uv = geometry.attributes.uv ? geometry.attributes.uv.array : null;
        const road = geometry.attributes.road ? geometry.attributes.road.array : null;
        // The near ribbon's columns a row (RoadMesh.nearRibbon: seven on the ride, five on a side road)
        const W = geometry.userData.columns || (geometry.userData.near ? 7 : 0);
        for (let t = 0; t < count; t++) {
            const v = [0, 1, 2].map(k => (index ? index[t * 3 + k] : t * 3 + k));
            const cx = (pos[v[0] * 3] + pos[v[1] * 3] + pos[v[2] * 3]) / 3, cz = (pos[v[0] * 3 + 2] + pos[v[1] * 3 + 2] + pos[v[2] * 3 + 2]) / 3;
            if (Math.hypot(cx - x, cz - z) > NEAR_M) continue;
            if (mesh.material !== nearMaterial || !mesh.material.map || !uv || !road || !W) {
                out.flat++;
                if (out.flatAt.length < 3) out.flatAt.push([Math.round(cx), Math.round(cz)]);
                continue;
            }
            out.near++;
            // Each row of the triangle: its outer columns lie past the carriageway's half width on both sides
            for (const row of new Set(v.map(i => Math.floor(i / W)))) {
                const first = row * W;
                const h = road[first * 4];
                const left = -uv[first * 2], right = uv[(first + W - 1) * 2];
                const leftEdge = -uv[(first + 1) * 2], rightEdge = uv[(first + W - 2) * 2];
                for (const [outer, edge] of [[left, leftEdge], [right, rightEdge]]) {
                    if (outer >= h + VERGE_MIN_M) continue;
                    if (Math.abs(outer - edge) < 1e-4 && edge < h) out.held++;
                    else out.noVerge++;
                }
            }
        }
    }
    return out;
}

describe('every road within the LOD0 radius looks like a road', () => {
    let env;
    beforeAll(async () => {
        const { fetchFn } = diskFetch();
        env = await WorldEnvironment.load(new THREE.Scene(), { id: 'tremola', search: '', fetchFn, models: null, digest: async () => '0' });
        // Only the roads are looked at: the land and what stands on it are not built (the roads' edge works then
        // read the land where no tile is resident, as they do before a tile arrives)
        env.streamer.hooks.buildTile = () => {};
        env.streamer.hooks.buildScenery = () => {};
    }, 60000);

    // The stage's start and finish and every station, read from the shipped ride
    const ride = JSON.parse(readFileSync(new URL('../../world/ride.json', import.meta.url), 'utf8'));
    const stage = ride.stages[0];
    const places = [
        ['the start', stage.from + WorldEnvironment.START_M],
        ['the finish', stage.to],
        ...ride.stations.filter(st => st.s > stage.from && st.s < stage.to).map(st => [`station ${st.id} (${st.kind})`, st.s])
    ];

    test.each(places)('%s: every road within the radius is textured, with a verge each side', async (name, s) => {
        const p = env.route.sample(Math.min(s, env.route.length), {});
        env.update(p, s, null, Infinity);
        await env.streamer.settle(p, s);
        const r = measure(env, p.x, p.z);
        // Enough road is measured that a pass means something
        expect(r.near).toBeGreaterThan(500);
        expect({ flat: r.flat, at: r.flatAt, noVerge: r.noVerge }).toEqual({ flat: 0, at: [], noVerge: 0 });
    }, 120000);

    test('a side road breaks its edge line and leaves out its verge across the mouth of a road that leaves its end', () => {
        const degree = new Map();
        for (const e of env.data.edges) for (const n of [e.a, e.b]) degree.set(n, (degree.get(n) || 0) + 1);
        let marked = 0, checked = 0;
        for (const edge of env.data.edges) {
            if (edge.onRide || degree.get(edge.b) < 3) continue;
            const samples = env.graph.samples(edge.id);
            if (!samples || samples.x.length < 12) continue;
            const rows = Array.from(samples.x, (_, i) => ({ x: samples.x[i], y: samples.y[i], z: samples.z[i], heading: samples.heading[i], width: samples.width[i], bits: samples.flags[i], cls: '8m Strasse' }));
            const out = env.sideMouths(edge, rows, false, true);
            checked++;
            const last = out[out.length - 1];
            if (last.mouthL || last.mouthR) marked++;
            // Only within the mouth's reach of the node (16 m at most)
            expect(out[0].mouthL || out[0].mouthR || false).toBe(false);
            // The ribbon draws a broken edge line there
            const ribbon = RoadMesh.ribbon(out, 0, null, true);
            const edgeAttr = ribbon.geometry.attributes.edge.array;
            const W = ribbon.geometry.userData.columns, n = edgeAttr.length / 4 / W;
            const end = (n - 1) * W * 4;
            if (last.mouthL) expect(edgeAttr[end]).toBe(RoadSurface.EDGE.broken);
            if (last.mouthR) expect(edgeAttr[end + 1]).toBe(RoadSurface.EDGE.broken);
            ribbon.geometry.dispose();
        }
        expect(checked).toBeGreaterThan(5);
        expect(marked).toBeGreaterThan(5);
    });

    test('the road goes on past the finish and before the start, as wide as the ride where it leaves it', () => {
        const ends = env.rideEnds();
        expect(ends.size).toBeGreaterThan(0);
        for (const [node, end] of ends) {
            const edge = env.data.edges.find(e => !e.onRide && (e.a === node || e.b === node));
            const samples = env.graph.samples(edge.id);
            const rows = Array.from(samples.x, (_, i) => ({ x: samples.x[i], y: samples.y[i], z: samples.z[i], heading: samples.heading[i], width: samples.width[i], bits: samples.flags[i] }));
            const { rows: away, s0 } = env.fromRideEnd(edge, rows);
            expect(s0).toBeCloseTo(end.s, 6);
            expect(away[0].x).toBeCloseTo(end.row.x, 6);
            expect(away[0].z).toBeCloseTo(end.row.z, 6);
            expect(away[0].width).toBe(end.width);
            // Narrowed to its own width within RIDE_TAPER_M
            const own = rows[rows.length >> 1].width;
            let run = 0;
            for (let i = 1; i < away.length; i++) {
                run += Math.hypot(away[i].x - away[i - 1].x, away[i].z - away[i - 1].z);
                if (run > WorldEnvironment.RIDE_TAPER_M) expect(away[i].width).toBe(own);
            }
        }
    });
});

describe('the LOD0 part of a side chunk', () => {
    const enter = WorldStreamer.SIDE_NEAR_M + WorldStreamer.SIDE_PAD_M, leave = enter + WorldStreamer.SIDE_SLACK_M;

    test('a side road is cut into LOD0 and LOD1 runs, the runs sharing their joint row and going on in s', () => {
        const rows = Array.from({ length: 200 }, (_, i) => ({ x: i * 4, y: 0, z: 0, heading: Math.PI / 2, width: 6, bits: 0, i }));
        const near = row => row.i >= 64 && row.i <= 96;
        const runs = WorldEnvironment.sideRuns(rows, near, 60);
        expect(runs.map(r => r.near)).toEqual([false, true, false]);
        for (let i = 1; i < runs.length; i++) expect(runs[i].rows[0].x).toBe(runs[i - 1].rows[runs[i - 1].rows.length - 1].x);
        // Every LOD0 row is in a LOD0 run, and every quad with a LOD0 row is drawn at LOD0
        for (const row of rows) if (near(row)) expect(runs.some(r => r.near && r.rows.some(q => q.x === row.x))).toBe(true);
        expect(runs[1].rows[0].s).toBeCloseTo(60 + runs[1].rows[0].x, 6);
        expect(WorldEnvironment.sideRuns(rows, null).map(r => r.near)).toEqual([false]);
    });

    test('a piece turns LOD0 within the radius and back only past the slack, so the chunk is not rebuilt at every step', () => {
        const pieces = [{ box: [500, 0, 600, 10] }, { box: [2000, 0, 2100, 10] }];
        const streamer = Object.create(WorldStreamer.prototype);
        streamer.hooks = { sidePieces: () => pieces };
        expect(streamer.sideNear(1, { x: 500 - enter - 1, z: 0 }, null)).toBe('');
        expect(streamer.sideNear(2, { x: 500 - enter + 1, z: 0 }, null)).toBe('0');
        // Held: it stays until the bike is past the slack
        expect(streamer.sideNear(3, { x: 500 - leave + 1, z: 0 }, { near: '0' })).toBe('0');
        expect(streamer.sideNear(4, { x: 500 - leave - 1, z: 0 }, { near: '0' })).toBe('');
        expect(streamer.sideNear(5, { x: 1950, z: 0 }, { near: '0' })).toBe('1');
        // Each chunk is read once for the bike's place (a chunk number of its own here): within SIDE_STILL_M of where it
        // was last read, the answer stands
        expect(streamer.sideNear(2, { x: 500 - enter - 1, z: 0 }, null)).toBe('0');
        // No pieces known: nothing at LOD0
        streamer.hooks = {};
        streamer.sideMemo = null;
        expect(streamer.sideNear(6, { x: 0, z: 0 }, null)).toBe('');
    });
});
