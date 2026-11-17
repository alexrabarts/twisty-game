// Floating roads, land over the road, overlapping road bands and the batter, on the committed Tremola slice and on a
// synthetic switchback stack (tools/world/verify.mjs `floating` and `overlap`, tools/world/bench.mjs, widths.mjs).
import { describe, test, expect, beforeAll } from '@jest/globals';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeWorld } from '../../tools/world/encode.mjs';
import { createBencher, TILE_M, CELL_M, VERGE_M, BATTER } from '../../tools/world/bench.mjs';
import { narrowRide, MIN_RIDE_WIDTH_M } from '../../tools/world/widths.mjs';
import { rideSamples } from '../../tools/world/stations.mjs';
import { checkFloating, checkOverlap, checkDem, tileHeightAt, FLOATING } from '../../tools/world/verify.mjs';
import { ladder } from '../fixtures/world/stacked-ladder.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('the committed Tremola slice', () => {
    let world, floating, overlap, ride;
    beforeAll(() => {
        world = decodeWorld(path.join(REPO, 'world'));
        floating = checkFloating(world, { worst: 1e6 });
        overlap = checkOverlap(world);
        ride = rideSamples(world.edges, world.ride.path);
    });

    test('the land meets every drawn road edge and verge, and stands over no carriageway', () => {
        expect(floating.details.problems).toEqual([]);
        expect(floating.details.below).toBe(0);
        expect(floating.details.above).toBe(0);
        expect(floating.details.overRoad).toEqual([]);
        expect(floating.details.probes).toBeGreaterThan(100000);
    });

    test('the land beside every road keeps the 1:1.5 batter, or is a listed retaining wall between two roads', () => {
        expect(floating.details.steep).toEqual([]);
        expect(floating.details.walls.ride.length).toBeGreaterThan(0);
    });

    test('no two road bands overlap outside a junction, and the width never steps', () => {
        expect(overlap.details.problems).toEqual([]);
        expect(overlap.details.worstStepM).toBeLessThanOrEqual(0.5);
        expect(overlap.details.narrowestRide.widthM).toBeGreaterThanOrEqual(MIN_RIDE_WIDTH_M);
    });

    // The places the play-test and the probes found: the land was 5 to 11 m under the edge, or over the road
    const named = [
        { s: 800, sides: [-1, 1] }, { s: 3600, sides: [-1, 1] }, { s: 6300, sides: [-1] }, { s: 7800, sides: [-1, 1] },
        { s: 7900, sides: [-1, 1] }, { s: 7990, sides: [-1, 1] }, { s: 8800, sides: [1] }
    ];
    test.each(named)('at s $s the edge meets the land or its fill, or stands on a listed retaining wall, and no land is over the road', ({ s, sides }) => {
        const runs = [...floating.details.walls.ride, ...floating.details.bends];
        const walled = side => runs.some(r => s + 40 >= r.s0 && s - 40 <= r.s1 && r.sides.includes(side > 0 ? 'right' : 'left'));
        for (let i = 0; i < ride.s.length; i++) {
            if (Math.abs(ride.s[i] - s) > 40 || ride.flags[i] & 7) continue;
            const half = ride.width[i] / 2;
            const at = o => tileHeightAt(world.tiles, ride.x[i] + o * Math.cos(ride.heading[i]), ride.z[i] - o * Math.sin(ride.heading[i]));
            for (let f = -1; f <= 1; f += 0.25) expect(at(f * half) - ride.y[i]).toBeLessThanOrEqual(FLOATING.inside);
            for (const side of sides) {
                // Within one 8 m triangle's fall at the batter the drawn fill (RoadMesh) meets it; more is a listed wall
                const gap = ride.y[i] - at(side * (half + VERGE_M));
                if (gap > FLOATING.below + BATTER * CELL_M * Math.SQRT2) expect(walled(side)).toBe(true);
            }
        }
    });
});

// Three legs of a switchback ladder 11 m apart, climbing 8%, on a hillside rising across them at 0.5: the drawn bands
// of 10 m and the verge would overlap, the lower legs' embankments meet the upper legs' cuts
describe('a synthetic switchback stack', () => {
    const build = () => {
        const points = ladder({ separation: 11, legLength: 80 });
        const n = points.length;
        const edge = {
            x: Float64Array.from(points, p => p.x), z: Float64Array.from(points, p => p.z), y: Float64Array.from(points, p => 1000 + p.y),
            heading: Float64Array.from(points, p => p.heading), width: new Float32Array(n).fill(10), flags: new Uint8Array(n),
            spacing: 4, cls: '4m Strasse', onRide: true, length: 0
        };
        for (let i = 1; i < n; i++) edge.length += Math.hypot(edge.x[i] - edge.x[i - 1], edge.z[i] - edge.z[i - 1]);
        edge.spacing = edge.length / (n - 1);
        const edges = [edge];
        const ride = [{ edgeId: 0, dir: 1 }];
        const demAt = (x, z) => 1000 + 0.5 * z;
        return { edges, ride, demAt };
    };
    const tilesOf = (edges, bencher) => {
        const tiles = new Map();
        const xs = edges[0].x, zs = edges[0].z;
        for (let tx = Math.floor((Math.min(...xs) - 60) / TILE_M); tx <= Math.floor((Math.max(...xs) + 60) / TILE_M); tx++) {
            for (let tz = Math.floor((Math.min(...zs) - 60) / TILE_M); tz <= Math.floor((Math.max(...zs) + 60) / TILE_M); tz++) tiles.set(`${tx},${tz}`, bencher.tile(tx, tz));
        }
        return tiles;
    };

    test('the ride narrows where its legs come close, tapered, and never below the bike\'s width', () => {
        const { edges, ride } = build();
        const narrow = narrowRide(edges, ride);
        expect(narrow.narrowed).toBeGreaterThan(0);
        expect(narrow.narrowest.widthM).toBeGreaterThanOrEqual(MIN_RIDE_WIDTH_M);
        expect(narrow.narrowest.widthM).toBeLessThan(10);
        const world = { edges, ride: { path: ride } };
        const overlap = checkOverlap(world);
        expect(overlap.details.problems).toEqual([]);
        expect(overlap.details.worstStepM).toBeLessThanOrEqual(0.5);
    });

    test('every edge meets its land or a retaining wall, no land stands over a road, and the batter holds', () => {
        const { edges, ride, demAt } = build();
        narrowRide(edges, ride);
        const bencher = createBencher({ edges, demAt });
        const result = checkFloating({ edges, tiles: tilesOf(edges, bencher), ride: { path: ride } });
        expect(result.details.problems).toEqual([]);
        expect(result.details.overRoad).toEqual([]);
        expect(result.details.walls.ride.length + result.details.walled).toBeGreaterThan(0);
    });

    test('away from the roads and their earthwork the land is the DEM: no shelf', () => {
        const { edges, ride, demAt } = build();
        narrowRide(edges, ride);
        const tiles = tilesOf(edges, createBencher({ edges, demAt }));
        const result = checkDem({ edges, tiles }, demAt);
        expect(result.details.problems).toEqual([]);
        expect(result.details.away.nodes).toBeGreaterThan(1000);
        expect(result.details.away.maxM).toBeLessThan(0.1);
    });
});
