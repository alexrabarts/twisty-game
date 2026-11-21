/**
 * @jest-environment node
 */
// The world importer on synthetic data: every module of tools/world/ that makes world data, run through the same
// pipeline as the real import (`import.mjs --synthetic`). No cache and no network.
import { describe, test, expect, beforeAll } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildWorld, classWidth, stageDefs, landmarkAssetProblem } from '../../tools/world/import.mjs';
import { narrowRide, MIN_RIDE_WIDTH_M, RIDE_WIDTH_M } from '../../tools/world/widths.mjs';
import { syntheticSource, syntheticDem } from '../../tools/world/synthetic.mjs';
import { resampleEdge, resampleLine, R_MIN, R_HAIRPIN, nearestOnPolyline, polylineLengths, circumradius } from '../../tools/world/resample.mjs';
import { buildCorridorGraph, GraphGapError } from '../../tools/world/graph.mjs';
import { createBencher, ZONE, TILE_N, TILE_M, CELL_M, BATTER, VERGE_M } from '../../tools/world/bench.mjs';
import { savitzkyGolay, FLAG } from '../../tools/world/profile.mjs';
import { rideSamples, placeStations } from '../../tools/world/stations.mjs';
import { linkFloorMs, stageFloors, TOP_SPEED, FLOOR_FACTOR } from '../../tools/world/floors.mjs';
import { encodeFiles, writeWorld, decodeWorld, courseRows, sumsOf, MAX_CHUNK_SAMPLES, MAX_CHUNK_EXTENT_M } from '../../tools/world/encode.mjs';
import { rasterizeCover, coverLookup, COVER } from '../../tools/world/landcover.mjs';
import { orientedBox, clearOfRoads, roadBands, boxesOverlap, ROAD_CLEAR_M, NUDGE_MAX_M } from '../../tools/world/buildings.mjs';
import { findHairpins, checkHairpins, checkSize, checkStacked, checkStations, checkCrests, checkGraph, checkBuildings, checkHorizon, checkLandmarks, LIMITS } from '../../tools/world/verify.mjs';
import { wgs84ToLv95, lv95ToWgs84 } from '../../tools/world/dem.mjs';
import { rasterizeCoverGrid, buildLevel, levelBoxes, horizonSinks, LEVELS } from '../../tools/world/farland.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MINI = path.join(REPO, 'tests', 'fixtures', 'world', 'mini');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'world-test-'));

const semicircle = (radius, legM = 100, step = 3) => {
    const pts = [];
    for (let z = 0; z < legM; z += 8) pts.push([0, z]);
    const n = Math.ceil((Math.PI * radius) / step);
    for (let i = 0; i <= n; i++) {
        const a = (Math.PI * i) / n;
        pts.push([radius - radius * Math.cos(a), legM + radius * Math.sin(a)]);
    }
    for (let z = legM - 8; z >= 0; z -= 8) pts.push([2 * radius, z]);
    return pts;
};

// A ladder of hairpins: `n` legs `legM` long and `apart` metres apart, joined by semicircles of radius apart / 2,
// alternately at the top and the bottom (the Tremola's stacked switchbacks)
const ladder = (apart, n = 4, legM = 80, step = 3) => {
    const pts = [];
    const r = apart / 2;
    for (let k = 0; k < n; k++) {
        const x = k * apart, up = k % 2 === 0;
        for (let d = 0; d < legM; d += 8) pts.push([x, up ? d : legM - d]);
        if (k === n - 1) { pts.push([x, up ? legM : 0]); break; }
        const m = Math.ceil((Math.PI * r) / step);
        for (let i = 0; i <= m; i++) {
            const a = (Math.PI * i) / m;
            pts.push([x + r - r * Math.cos(a), up ? legM + r * Math.sin(a) : -r * Math.sin(a)]);
        }
    }
    return pts;
};

// The least distance from each point of a polyline to the line more than `same` metres from it along the line
const legGap = (xs, zs, same = 60) => {
    const cum = [0];
    for (let i = 1; i < xs.length; i++) cum.push(cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]));
    let least = Infinity;
    for (let i = 0; i < xs.length; i++) for (let j = 0; j < xs.length; j++) if (Math.abs(cum[i] - cum[j]) > same) least = Math.min(least, Math.hypot(xs[i] - xs[j], zs[i] - zs[j]));
    return least;
};

describe('resample.mjs', () => {
    test('stacked hairpins 11 m apart: an R_MIN arc pushed the legs to 3 m apart; held to R_HAIRPIN they stay as mapped', () => {
        const pts = ladder(11);
        const mapped = legGap(pts.map(p => p[0]), pts.map(p => p[1]));
        // R_MIN everywhere (no hold): the legs come far nearer than the map has them
        const plain = resampleLine(pts, [], { rHairpin: R_MIN });
        expect(legGap(plain.segments[0].x, plain.segments[0].z)).toBeLessThan(mapped - 3);
        expect(plain.squeezed.length).toBeGreaterThan(0);
        const r = resampleLine(pts);
        const seg = r.segments[0];
        expect(r.hairpins.length).toBeGreaterThan(0);
        expect(r.squeezed).toEqual([]);
        expect(legGap(seg.x, seg.z)).toBeGreaterThanOrEqual(mapped - 1.5);
        expect(seg.minRadius).toBeGreaterThanOrEqual(R_HAIRPIN * 0.995);
        expect(seg.minRadius).toBeLessThan(R_MIN);
    });

    test('stacked hairpins 25 m apart keep their R_MIN fillets: no hairpin is held', () => {
        const r = resampleLine(ladder(25));
        expect(r.hairpins).toEqual([]);
        expect(r.squeezed).toEqual([]);
        expect(r.segments[0].minRadius).toBeGreaterThanOrEqual(R_MIN * 0.995);
    });

    test('a held hairpin narrows the ride to the minimum, so its inner edge is not a point on the bend', () => {
        const seg = resampleLine(ladder(11)).segments[0];
        const e = { x: seg.x, z: seg.z, width: new Float32Array(seg.x.length).fill(RIDE_WIDTH_M), flags: new Uint8Array(seg.x.length), cls: '4m Strasse', onRide: true, length: seg.length };
        narrowRide([e], [{ edgeId: 0, dir: 1 }]);
        for (let i = 1; i + 1 < seg.x.length; i++) {
            const r = circumradius(seg.x[i - 1], seg.z[i - 1], seg.x[i], seg.z[i], seg.x[i + 1], seg.z[i + 1]);
            if (r < R_MIN * 0.95) expect(e.width[i]).toBeCloseTo(MIN_RIDE_WIDTH_M, 5);
        }
    });

    test('a hairpin tighter than R_MIN comes out at R_MIN or wider, and still turns the full 180 degrees', () => {
        const r = resampleEdge(semicircle(5));
        expect(r.minRadius).toBeGreaterThanOrEqual(R_MIN * 0.995);
        let turn = 0;
        for (let i = 1; i < r.heading.length; i++) {
            let d = r.heading[i] - r.heading[i - 1];
            d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI;
            turn += d;
        }
        expect(Math.abs(turn)).toBeGreaterThan(Math.PI * 0.98);
        expect(Math.abs(turn)).toBeLessThan(Math.PI * 1.02);
        expect(r.fillets.length).toBeGreaterThan(0);
        expect(r.fillets.every(f => f.explained)).toBe(true);
    });

    test('a bend gentler than R_MIN stays as mapped', () => {
        const pts = [];
        for (let i = 0; i <= 20; i++) { const a = (i * 8) / 60; pts.push([60 - 60 * Math.cos(a), 60 * Math.sin(a)]); }
        const cum = polylineLengths(pts);
        const r = resampleEdge(pts);
        const worst = Math.max(...Array.from(r.x, (x, i) => nearestOnPolyline(pts, cum, x, r.z[i]).dist));
        expect(worst).toBeLessThan(0.5);
        expect(r.fillets).toEqual([]);
    });

    test('samples are at most 4 m apart and the heading follows the line', () => {
        const r = resampleEdge([[0, 0], [0, 100], [50, 150]]);
        for (let i = 1; i < r.x.length; i++) expect(Math.hypot(r.x[i] - r.x[i - 1], r.z[i] - r.z[i - 1])).toBeLessThanOrEqual(4.0001);
        expect(r.heading[0]).toBeCloseTo(0, 1);
        expect(r.heading.at(-1)).toBeCloseTo(Math.PI / 4, 1);
    });

    test('a line of zero length is refused', () => {
        expect(() => resampleEdge([[1, 1], [1, 1]])).toThrow(/zero length/);
    });

    test('a ride resampled as one line and cut at a node shares the node sample, and the bend across the cut stays smooth', () => {
        const pts = semicircle(5, 100);
        const cut = 100 + 8; // inside the bend
        const r = resampleLine(pts, [cut]);
        expect(r.segments).toHaveLength(2);
        const [a, b] = r.segments;
        expect(a.x.at(-1)).toBe(b.x[0]);
        expect(a.z.at(-1)).toBe(b.z[0]);
        expect(r.cuts[0]).toEqual({ x: a.x.at(-1), z: a.z.at(-1) });
        const xs = [...a.x, ...b.x.slice(1)], zs = [...a.z, ...b.z.slice(1)];
        for (let i = 1; i + 1 < xs.length; i++) expect(circumradius(xs[i - 1], zs[i - 1], xs[i], zs[i], xs[i + 1], zs[i + 1])).toBeGreaterThanOrEqual(R_MIN * 0.99);
    });
});

describe('profile.mjs', () => {
    test('Savitzky-Golay keeps a straight grade exactly and flattens noise', () => {
        const ramp = Float64Array.from({ length: 50 }, (_, i) => 100 + i * 0.3);
        const out = savitzkyGolay(ramp, 4);
        out.forEach((v, i) => expect(v).toBeCloseTo(ramp[i], 6));
        const noisy = Float64Array.from({ length: 50 }, (_, i) => 100 + (i % 2 ? 1 : -1));
        const smooth = savitzkyGolay(noisy, 4);
        expect(Math.max(...smooth.slice(5, 45).map(v => Math.abs(v - 100)))).toBeLessThan(0.5);
    });
});

describe('the synthetic world', () => {
    let world;
    beforeAll(async () => { world = await buildWorld(syntheticSource(), { stationSpacingM: 1000 }); });

    test('is three 2 km stages, one checkpoint each (the spacing is 1 km), and a tour of two gates', () => {
        expect(world.stages).toHaveLength(3);
        world.stages.forEach(s => {
            expect(s.to - s.from).toBeGreaterThan(1990);
            expect(s.to - s.from).toBeLessThan(2010);
            expect(s.gates).toBe(1);
        });
        const rows = courseRows(world);
        expect(Object.keys(rows)).toEqual(['world-mini-1-v1', 'world-mini-2-v1', 'world-mini-3-v1', 'world-tour-v1']);
        expect(rows['world-tour-v1'].gates).toBe(2);
    });

    test('stations are 500 to 1500 m apart (half the spacing to one and a half), none inside 80 m of a tunnel or a ride junction', () => {
        const ids = world.stages.flatMap(s => s.stationIds);
        expect(new Set(ids).size).toBe(ids.length - 2); // the two stage boundaries are shared
        world.stages.forEach(s => {
            const at = s.stationIds.map(i => world.stations[i].s);
            expect(at[0]).toBeCloseTo(s.from, 3);
            expect(at.at(-1)).toBeCloseTo(s.to, 3);
            for (let k = 1; k < at.length; k++) {
                expect(at[k] - at[k - 1]).toBeGreaterThanOrEqual(500 - 0.5);
                expect(at[k] - at[k - 1]).toBeLessThanOrEqual(1500 + 0.5);
            }
        });
        const interior = world.stations.filter(s => s.kind === 'gate').map(s => s.s);
        const keepOut = [...world.structures.map(t => [t.s0, t.s1]), ...world.junctions.flatMap(j => j.passes.map(p => [p.sIn, p.sIn]))];
        for (const s of interior) for (const [a, b] of keepOut) expect(s < a - 80 || s > b + 80).toBe(true);
    });

    test('has the planted features: a tightened R = 10 m hairpin, stacked legs 25 m apart, a tunnel and a junction', () => {
        const samples = rideSamples(world.edges, world.ride);
        const hairpins = findHairpins(samples);
        expect(hairpins).toHaveLength(3);
        hairpins.forEach(h => expect(h.minRadiusM).toBeGreaterThanOrEqual(R_MIN * 0.995));
        expect(Math.min(...hairpins.map(h => h.minRadiusM))).toBeLessThan(11);
        expect(world.structures.map(s => s.kind)).toContain('tunnel');
        expect(world.junctions).toHaveLength(1);
        expect(world.junctions[0].incident).toHaveLength(4);
    });

    test('a junction gives every edge that is not its pass a stub and a barrier 60 m out', () => {
        const j = world.junctions[0];
        const [pass] = j.passes;
        expect(pass.barriers).toHaveLength(2);
        expect(pass.barriers.every(b => !world.edges[b.edgeId].onRide)).toBe(true);
        expect(pass.barriers.map(b => world.edges[b.edgeId].name).sort()).toEqual(['Alpweg', 'Seitenstrasse']);
        for (const b of pass.barriers) {
            const e = world.edges[b.edgeId];
            const node = world.nodes[j.node];
            expect(Math.hypot(b.x - node.x, b.z - node.z)).toBeCloseTo(Math.min(60, e.length), 0);
        }
    });

    test('ground under the road is the road, and tunnel ground is not carved', () => {
        const rideEdge = world.edges[0];
        const key = i => `${Math.floor(rideEdge.x[i] / TILE_M)},${Math.floor(rideEdge.z[i] / TILE_M)}`;
        const i = 20;
        const t = world.tiles.get(key(i));
        const col = Math.round((rideEdge.x[i] - Math.floor(rideEdge.x[i] / TILE_M) * TILE_M) / CELL_M);
        const row = Math.round((rideEdge.z[i] - Math.floor(rideEdge.z[i] / TILE_M) * TILE_M) / CELL_M);
        expect([ZONE.road, ZONE.bench]).toContain(t.zones[row * TILE_N + col]);
        const tunnel = world.edges.find(e => (e.flags[0] & FLAG.tunnel) !== 0);
        const mid = tunnel.x.length >> 1;
        const tt = world.tiles.get(`${Math.floor(tunnel.x[mid] / TILE_M)},${Math.floor(tunnel.z[mid] / TILE_M)}`);
        const c = Math.round((tunnel.x[mid] - Math.floor(tunnel.x[mid] / TILE_M) * TILE_M) / CELL_M);
        const rw = Math.round((tunnel.z[mid] - Math.floor(tunnel.z[mid] / TILE_M) * TILE_M) / CELL_M);
        expect(tt.zones[rw * TILE_N + c]).not.toBe(ZONE.road);
    });

    test('is deterministic: two builds give the same bytes', async () => {
        const again = await buildWorld(syntheticSource(), { stationSpacingM: 1000 });
        const a = encodeFiles(world), b = encodeFiles(again);
        expect([...a.keys()]).toEqual([...b.keys()]);
        for (const [name, buf] of a) expect(Buffer.compare(buf, b.get(name))).toBe(0);
    });

    test('the committed mini fixture is what the importer makes', () => {
        const files = encodeFiles(world);
        const listed = [];
        const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => (e.isDirectory() ? walk(path.join(d, e.name)) : listed.push(path.relative(MINI, path.join(d, e.name)))));
        walk(MINI);
        expect(listed.filter(f => f !== 'SHA256SUMS' && f !== 'world-courses.json').sort()).toEqual([...files.keys()].sort());
        for (const [name, buf] of files) expect(Buffer.compare(fs.readFileSync(path.join(MINI, name)), buf)).toBe(0);
        expect(fs.readFileSync(path.join(MINI, 'SHA256SUMS'), 'utf8')).toBe(sumsOf(files));
        expect(JSON.parse(fs.readFileSync(path.join(MINI, 'world-courses.json'), 'utf8'))).toEqual(courseRows(world));
    });
});

describe('encode.mjs', () => {
    let world, dir;
    beforeAll(async () => {
        world = await buildWorld(syntheticSource(), { stationSpacingM: 1000 });
        dir = tmp();
        writeWorld(world, dir);
    });

    test('round trips: the decoded world matches the built one to a millimetre', () => {
        const d = decodeWorld(dir);
        expect(d.nodes).toHaveLength(world.nodes.length);
        expect(d.edges).toHaveLength(world.edges.length);
        d.edges.forEach((e, i) => {
            const w = world.edges[i];
            expect(e.x.length).toBe(w.x.length);
            expect(e.a).toBe(w.a);
            expect(e.b).toBe(w.b);
            expect(e.onRide).toBe(w.onRide);
            expect(Math.abs(e.length - w.length)).toBeLessThan(0.01);
            for (let k = 0; k < e.x.length; k++) {
                expect(Math.abs(e.x[k] - w.x[k])).toBeLessThan(0.001);
                expect(Math.abs(e.y[k] - w.y[k])).toBeLessThan(0.001);
                expect(e.flags[k]).toBe(w.flags[k]);
            }
        });
        expect(d.tiles.size).toBe(world.tiles.size);
        for (const [key, t] of world.tiles) {
            const dt = d.tiles.get(key);
            expect(Buffer.from(dt.zones).equals(Buffer.from(t.zones))).toBe(true);
            for (let i = 0; i < t.heights.length; i += 97) expect(Math.abs(dt.heights[i] - t.heights[i])).toBeLessThan(0.06);
        }
        expect(d.buildings).toHaveLength(world.buildings.length);
        expect(d.far.nx * d.far.nz).toBe(d.far.data.length);
    });

    test('every chunk is a place: at most the sample cap and the extent cap, with its bounding box in the manifest', () => {
        const { manifest, edges } = decodeWorld(dir);
        const all = edges.flatMap(e => Array.from(e.x, (x, i) => [x, e.z[i]]));
        for (const c of manifest.chunks) {
            expect(c.count).toBeLessThanOrEqual(MAX_CHUNK_SAMPLES);
            expect(c.bbox[2] - c.bbox[0]).toBeLessThanOrEqual(MAX_CHUNK_EXTENT_M + 0.01);
            expect(c.bbox[3] - c.bbox[1]).toBeLessThanOrEqual(MAX_CHUNK_EXTENT_M + 0.01);
            const inside = all.slice(c.first, c.first + c.count);
            expect(Math.min(...inside.map(p => p[0]))).toBeGreaterThanOrEqual(c.bbox[0] - 0.01);
            expect(Math.max(...inside.map(p => p[1]))).toBeLessThanOrEqual(c.bbox[3] + 0.01);
        }
        expect(manifest.chunks.reduce((p, c) => p + c.count, 0)).toBe(all.length);
    });

    test('SHA256SUMS is in `shasum -a 256 -c` form and covers every other file', () => {
        const sums = fs.readFileSync(path.join(dir, 'SHA256SUMS'), 'utf8').trim().split('\n');
        const names = [];
        const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => (e.isDirectory() ? walk(path.join(d, e.name)) : names.push(path.relative(dir, path.join(d, e.name)))));
        walk(dir);
        expect(sums.map(l => l.split('  ')[1])).toEqual(names.filter(n => n !== 'SHA256SUMS').sort());
        for (const line of sums) {
            const [hash, name] = line.split('  ');
            expect(hash).toMatch(/^[0-9a-f]{64}$/);
            expect(crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, name))).digest('hex')).toBe(hash);
        }
    });

    test('the credit and the format version are in the manifest', () => {
        const { manifest } = decodeWorld(dir);
        expect(manifest.format).toBe(1);
        expect(manifest.dataHash).toMatch(/^[0-9a-f]{64}$/);
        expect(manifest.stationSpacingM).toBe(1000);
    });
});

describe('graph.mjs and junctions.mjs', () => {
    const line = (...pts) => pts.map(([x, z]) => [x, z, 1000]);
    const road = (id, pts, name = 'Strasse') => ({ id, fid: id, cls: '6m Strasse', structure: null, name, drivable: 'Wahr', traffic: 'Durchgangsstrasse', surface: 'Hart', hasZ: true, pts: line(...pts) });
    const wp = (id, name, [x, z]) => ({ id, name, e: x, n: z });

    // A loop: west to J, J to east, east round a loop edge, back to J from the south, J on to the north.
    // The ride passes J twice.
    const figureEight = () => ({
        edges: [
            road(0, [[-300, 0], [0, 0]]), road(1, [[0, 0], [300, 0]]), road(2, [[300, 0], [300, 200], [0, 200], [0, 100]]),
            road(3, [[0, 100], [0, 0]]), road(4, [[0, 0], [0, -300]]), road(5, [[0, 0], [-20, 40]])
        ],
        stages: [{ id: 'eight', name: 'Eight', waypoints: [wp(0, 'West', [-300, 0]), wp(1, 'East loop', [300, 200]), wp(2, 'North', [0, -300])] }]
    });

    test('the ride is an ordered path through the graph and a junction used twice differs per pass', () => {
        const { nodes, edges, ride } = buildCorridorGraph(figureEight());
        expect(ride.length).toBeGreaterThanOrEqual(5);
        let at = null;
        for (const u of ride) {
            const e = edges[u.edgeId];
            const [from, to] = u.dir === 1 ? [e.a, e.b] : [e.b, e.a];
            if (at !== null) expect(from).toBe(at);
            at = to;
        }
        expect(nodes.length).toBeGreaterThan(4);
    });

    test('built into a world, junction J has two passes with different barrier sets', async () => {
        const g = figureEight();
        const source = { ...syntheticSource(), ...g, demAt: () => 1000, coverPolys: () => [], buildings: () => [], landmarks: [], keptRoadClasses: ['6m Strasse'] };
        const w = await buildWorld(source, { stationSpacingM: 1000 });
        const twice = w.junctions.filter(j => j.passes.length >= 2);
        expect(twice).toHaveLength(1);
        const [a, b] = twice[0].passes;
        const ids = p => p.barriers.map(x => x.edgeId).sort();
        expect(ids(a)).not.toEqual(ids(b));
        expect(a.barriers.some(x => x.edgeId === a.outEdge)).toBe(false);
        expect(b.barriers.some(x => x.edgeId === b.outEdge)).toBe(false);
        const node = w.nodes[twice[0].node];
        expect(node.flags & 4).toBe(4);
    });

    test('a gap between waypoints stops the import', () => {
        const g = figureEight();
        g.edges.push(road(9, [[1000, 1000], [1100, 1000]]));
        g.stages[0].waypoints[1] = wp(1, 'Island', [1100, 1000]);
        expect(() => buildCorridorGraph(g)).toThrow(GraphGapError);
    });

    test('a side road is cut to the corridor, a road outside it is left out', () => {
        const g = figureEight();
        g.edges.push(road(7, [[0, 0], [0, 1500], [0, 5000]], 'Long spur'), road(8, [[4000, 4000], [4100, 4000]], 'Far away'));
        const r = buildCorridorGraph(g);
        expect(r.edges.some(e => e.name === 'Far away')).toBe(false);
        const spur = r.edges.find(e => e.name === 'Long spur');
        expect(spur.srcPts.at(-1)[1]).toBeLessThan(2600);
    });
});

describe('bench.mjs', () => {
    const edge = (x0, y, heights) => {
        const n = 40;
        return {
            x: Float64Array.from({ length: n }, () => x0), z: Float64Array.from({ length: n }, (_, i) => i * 4), y: Float64Array.from({ length: n }, () => y),
            heading: new Float64Array(n), width: new Float32Array(n).fill(10), flags: new Uint8Array(n), spacing: 4, heights
        };
    };
    const flat = () => 1000;

    test('the road, its bench and the cut-and-fill slope', () => {
        const b = createBencher({ edges: [edge(0, 1010)], demAt: flat });
        expect(b.ground(0, 80)).toEqual({ y: 1010, zone: ZONE.road });
        expect(b.ground(6, 80).zone).toBe(ZONE.bench); // within width/2 + 2
        const slope = b.ground(10, 80);
        expect(slope.zone).toBe(ZONE.terrain);
        // Past the strip (5 m and the verge) the fill falls at the batter toward the ground, no flatter, no steeper
        expect(slope.y).toBeCloseTo(1010 - (10 - 5 - VERGE_M) * BATTER, 6);
        // Beyond the earthwork the land is the ground
        expect(b.ground(60, 80).y).toBe(1000);
    });

    test('a node of a triangle that reaches into the drawn strip takes the road height inside the strip, the fill past it', () => {
        const b = createBencher({ edges: [edge(4, 1010)], demAt: flat });
        // The strip reaches 5 + VERGE_M + 0.5 m either side of x = 4: nodes at x 0 and 8 lie in it
        for (const gi of [0, 1]) expect(b.node(gi, 10).y).toBeCloseTo(1010, 6);
        // x -8 and 16 only share a triangle with it: the fill at the batter from the verge's edge, not a shelf
        for (const gi of [-1, 2]) {
            const past = Math.abs(gi * CELL_M - 4) - 5 - VERGE_M;
            expect(b.claimsAt(gi, 10).length).toBeGreaterThan(0);
            // (raised a little where every point of its triangles keeps room under the road)
            expect(b.node(gi, 10).y).toBeGreaterThanOrEqual(1010 - past * BATTER - 1e-6);
            expect(b.node(gi, 10).y).toBeLessThanOrEqual(1010 - past * BATTER + 0.25);
        }
        // Where the ground stands higher (a cut) the claimed node keeps the road's height, never more
        const cut = createBencher({ edges: [edge(4, 1010)], demAt: () => 1030 });
        expect(cut.node(-1, 10).y).toBeCloseTo(1010, 6);
        expect(cut.node(-2, 10).y).toBeCloseTo(1010 + (20 - 5 - VERGE_M) * BATTER, 6);
    });

    test('a node two strips claim keeps the lower road: no land stands over a road, the upper edge is a drop beyond its strip', () => {
        const b = createBencher({ edges: [edge(0, 1000), edge(14, 1008)], demAt: flat });
        // x = 8 lies in a triangle of both strips
        expect(b.node(1, 10).y).toBeCloseTo(1000, 6);
        expect(b.node(1, 10).zone).toBe(ZONE.bench);
        expect(b.claimsAt(1, 10).map(c => Math.round(c.y))).toEqual(expect.arrayContaining([1000, 1008]));
    });

    test('where two legs cannot be joined at the batter, the ground nearer the lower leg is a wall and nearer the upper a drop', () => {
        const b = createBencher({ edges: [edge(0, 1000), edge(22, 1015)], demAt: flat });
        expect(b.ground(9, 80).zone).toBe(ZONE.wall);
        expect(b.ground(13, 80).zone).toBe(ZONE.drop);
        expect(b.ground(11, 80).y).toBeGreaterThanOrEqual(1000);
        expect(b.ground(11, 80).y).toBeLessThan(1015);
        // The same two legs 9 m closer in height can be joined at the batter: no wall, no drop.
        const gentle = createBencher({ edges: [edge(0, 1000), edge(22, 1006)], demAt: flat });
        expect([9, 11, 13].map(x => gentle.ground(x, 80).zone)).toEqual([ZONE.terrain, ZONE.terrain, ZONE.terrain]);
    });

    test('nothing is carved under a bridge or over a tunnel', () => {
        const e = edge(0, 1050);
        e.flags.fill(FLAG.tunnel);
        const b = createBencher({ edges: [e], demAt: flat });
        expect(b.ground(0, 80)).toEqual({ y: 1000, zone: ZONE.terrain });
    });

    test('a tile is 65 x 65 nodes and water cover marks water', () => {
        const b = createBencher({ edges: [edge(2000, 1010)], demAt: flat, coverAt: () => COVER.water });
        const t = b.tile(0, 0);
        expect(t.heights).toHaveLength(TILE_N * TILE_N);
        expect(new Set(t.zones)).toEqual(new Set([ZONE.water]));
    });
});

describe('landcover.mjs and buildings.mjs', () => {
    test('rasterizes polygons at 16 m, holes stay open, everything else is grass', () => {
        const outer = [[0, 0], [160, 0], [160, 160], [0, 160], [0, 0]];
        const hole = [[48, 48], [112, 48], [112, 112], [48, 112], [48, 48]];
        const grids = rasterizeCover([{ cls: COVER.forest, rings: [outer, hole] }], [[0, 0]]);
        const at = coverLookup(grids);
        expect(at(8, 8)).toBe(COVER.forest);
        expect(at(80, 80)).toBe(COVER.grass);
        expect(at(300, 300)).toBe(COVER.grass);
        expect(at(-600, 0)).toBe(COVER.none);
    });

    test('water is drawn only where the square 8 m round a cell corner is all lake, so its half tint keeps to the shore', () => {
        const lake = [[36, 36], [204, 36], [204, 204], [36, 204], [36, 36]];
        const grid = rasterizeCover([{ cls: COVER.water, rings: [lake] }], [[0, 0]]).get('0,0');
        const water = [];
        for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) if (grid[j * 32 + i] === COVER.water) water.push([i * 16, j * 16]);
        // Corners 48 to 192 hold a square of 8 m in the lake (36 to 204): 10 x 10 cells
        expect(water.length).toBe(100);
        for (const [x, z] of water) {
            expect(Math.min(x - 36, 204 - x, z - 36, 204 - z)).toBeGreaterThanOrEqual(8);
        }
        // A pond too small to hold one square is drawn as the land round it
        const pond = [[100, 100], [112, 100], [112, 112], [100, 112], [100, 100]];
        expect([...rasterizeCover([{ cls: COVER.water, rings: [pond] }], [[0, 0]]).get('0,0')].includes(COVER.water)).toBe(false);
    });

    test('the oriented box is the smallest rectangle round a footprint', () => {
        const ring = [[0, 0], [10, 0], [10, 4], [0, 4], [0, 0]];
        const box = orientedBox(ring);
        expect(box.w * box.d).toBeCloseTo(40, 6);
        expect(Math.max(box.w, box.d)).toBeCloseTo(10, 6);
        expect(box.x).toBeCloseTo(5, 6);
        expect(box.z).toBeCloseTo(2, 6);
    });
});

describe('buildings off the road bands', () => {
    // A straight 10 m road along z, from z = -200 to 200, sampled every 4 m
    const road = (() => {
        const n = 101;
        return [{ id: 0, onRide: true, x: new Float64Array(n), z: Float64Array.from({ length: n }, (_, i) => -200 + 4 * i), width: new Float32Array(n).fill(10) }];
    })();
    const house = (x, z, extra = {}) => ({ x, z, w: 8, d: 10, heading: 0, h: 7, kind: 1, ...extra });

    test('a house clear of the band stays where the map put it', () => {
        const out = clearOfRoads([house(20, 0)], road);
        expect(out.buildings).toEqual([house(20, 0)]);
        expect(out.nudged + out.dropped).toBe(0);
    });

    test('a house a little over the band is moved out to the clearance, away from the road', () => {
        // Its near wall is at x = 5, on the edge of the 5 m half band
        const out = clearOfRoads([house(9, 0)], road);
        expect(out.nudged).toBe(1);
        const [moved] = out.buildings;
        expect(moved.x).toBeGreaterThan(9);
        expect(moved.x - 9).toBeLessThanOrEqual(NUDGE_MAX_M);
        expect(roadBands(road).clearance(moved).gap).toBeGreaterThanOrEqual(ROAD_CLEAR_M);
        expect(moved.z).toBeCloseTo(0, 6);
    });

    test('a house astride the road is left out', () => {
        const out = clearOfRoads([house(0, 0)], road);
        expect(out.buildings).toEqual([]);
        expect(out.dropped).toBe(1);
    });

    test('a moved house that would land on a neighbour is left out, and the neighbour stays', () => {
        const neighbour = house(19, 0);
        const out = clearOfRoads([house(9, 0), neighbour], road);
        expect(out.buildings).toEqual([neighbour]);
        expect(out.dropped).toBe(1);
        expect(boxesOverlap(house(12, 0), neighbour)).toBe(true);
        expect(boxesOverlap(house(30, 0), neighbour)).toBe(false);
    });

    test('checkBuildings fails on a house over a band and passes once the importer has cleared it', () => {
        const decoded = { edges: road, buildings: [house(9, 0)] };
        expect(checkBuildings(decoded).ok).toBe(false);
        expect(checkBuildings({ edges: road, buildings: clearOfRoads(decoded.buildings, road).buildings }).ok).toBe(true);
    });
});

describe('stations.mjs', () => {
    const straight = (n, flags = {}) => {
        const s = Float64Array.from({ length: n }, (_, i) => i * 4);
        return { s, x: s, z: new Float64Array(n), y: new Float64Array(n), heading: new Float64Array(n), width: new Float32Array(n).fill(10), flags: Uint8Array.from({ length: n }, (_, i) => flags[i] ?? 0), radius: new Float64Array(n).fill(Infinity) };
    };

    test('a dropped station that leaves a gap over twice the spacing fails loudly', () => {
        const samples = straight(1001, Object.fromEntries(Array.from({ length: 1001 }, (_, i) => [i, i * 4 > 600 && i * 4 < 3400 ? FLAG.tunnel : 0])));
        expect(() => placeStations(samples, [{ id: 'a', from: 0, to: 4000 }], [], { spacingM: 1000 })).toThrow(/gap/);
    });

    test('picks the place nearest its target where a full roadworks site fits ahead, not one in a bend', () => {
        const samples = straight(501);
        // A tight bend near s = 1000 (8 m radius over 80 m of road)
        for (let i = 0, h = 0; i < 501; i++) { if (i > 240 && i <= 260) h += 4 / 8; samples.heading[i] = h; }
        const r = placeStations(samples, [{ id: 'a', from: 0, to: 2000 }], [], { spacingM: 1000 });
        const [from, gate, to] = r.perStage[0].s;
        expect([from, to]).toEqual([0, 2000]);
        // Just past the bend: the bend is behind the line, the whole site ahead of it is straight
        expect(gate).toBe(1048);
        expect(r.dropped).toEqual([]);
    });

    test('a stage shorter than the minimum gap has no gate', () => {
        const r = placeStations(straight(101), [{ id: 'a', from: 0, to: 300 }], [], { spacingM: 1000 });
        expect(r.perStage[0].s).toEqual([0, 300]);
    });
});

describe('floors.mjs', () => {
    const straightRide = (length, extra = {}) => {
        const n = Math.round(length / 4) + 1;
        const s = Float64Array.from({ length: n }, (_, i) => i * 4);
        return { s, x: s, z: new Float64Array(n), y: new Float64Array(n), heading: new Float64Array(n), width: new Float32Array(n).fill(10), flags: new Uint8Array(n), radius: new Float64Array(n).fill(Infinity), ...extra };
    };

    test('a straight link is the length at top speed, times 0.9', () => {
        const ms = linkFloorMs(straightRide(1000), 0, 1000, { leanCapDeg: 50 });
        expect(ms).toBe(Math.ceil((FLOOR_FACTOR * 1000 / TOP_SPEED) * 1000));
    });

    test('a hairpin raises the floor, and a wider R raises the allowed speed', () => {
        const s = straightRide(400);
        const tight = straightRide(400);
        for (let i = 40; i < 60; i++) tight.radius[i] = 10;
        // 180 degrees of turn across the bend
        for (let i = 40; i < 60; i++) tight.heading[i] = ((i - 40) / 19) * Math.PI;
        for (let i = 60; i < tight.heading.length; i++) tight.heading[i] = Math.PI;
        expect(linkFloorMs(tight, 0, 400, { leanCapDeg: 50 })).toBeGreaterThan(linkFloorMs(s, 0, 400, { leanCapDeg: 50 }));
        const wide = straightRide(400);
        for (let i = 40; i < 60; i++) wide.radius[i] = 40;
        for (let i = 40; i < 60; i++) wide.heading[i] = ((i - 40) / 19) * Math.PI;
        for (let i = 60; i < wide.heading.length; i++) wide.heading[i] = Math.PI;
        expect(linkFloorMs(wide, 0, 400, { leanCapDeg: 50 })).toBeLessThan(linkFloorMs(tight, 0, 400, { leanCapDeg: 50 }));
    });

    test('a bend is a run that turns one way: two hairpins that turn opposite ways hold the rider in each, not on the road between', () => {
        // Two hairpins of 10 m radius, 80 m long each, the second 32 m after the first: right then left, and right twice
        const pair = (second) => {
            const ride = straightRide(600);
            let heading = 0;
            for (let i = 0; i < ride.s.length; i++) {
                const first = i >= 40 && i < 60, other = i >= 68 && i < 88;
                if (first || other) ride.radius[i] = 10;
                if (first) heading += Math.PI / 20;
                if (other) heading += second * Math.PI / 20;
                ride.heading[i] = heading;
            }
            return ride;
        };
        const one = (() => { const ride = pair(0); for (let i = 68; i < 88; i++) ride.radius[i] = Infinity; return ride; })();
        const lone = linkFloorMs(one, 0, 600, { leanCapDeg: 50 }), straight = linkFloorMs(straightRide(600), 0, 600, { leanCapDeg: 50 });
        const opposite = linkFloorMs(pair(-1), 0, 600, { leanCapDeg: 50 }), same = linkFloorMs(pair(1), 0, 600, { leanCapDeg: 50 });
        // What one hairpin adds to the straight, twice: the 32 m between the two are ridden at top speed
        expect(Math.abs((opposite - straight) - 2 * (lone - straight))).toBeLessThan(0.02 * (lone - straight));
        // Two that turn the same way are one bend of 360 degrees, and the road between them is inside it: a higher floor
        expect(same).toBeGreaterThan(opposite * 1.2);
    });

    test('is a lower bound: no ideal rider on the inner edge of a real bend is faster than the floor', async () => {
        const world = await buildWorld(syntheticSource(), { stationSpacingM: 1000 });
        const samples = rideSamples(world.edges, world.ride);
        for (const stage of world.stages) {
            const at = stage.stationIds.map(i => world.stations[i].s);
            const r = stageFloors(samples, at);
            expect(r.gateFloorsMs).toHaveLength(stage.gates + 1);
            expect(r.floorMs).toBe(r.gateFloorsMs.reduce((p, q) => p + q, 0));
            // The floor is below the time at top speed along the whole link: an upper limit no rider beats at 82 m/s is
            // not exceeded by the floor itself.
            r.gateFloorsMs.forEach((ms, k) => expect(ms).toBeGreaterThanOrEqual(Math.floor(FLOOR_FACTOR * (at[k + 1] - at[k]) * 0.5 / TOP_SPEED * 1000)));
        }
    });
});

describe('the board rows', () => {
    const POLICY = { maxGateMs: 20 * 60 * 1000, maxTotalMs: 2 * 60 * 60 * 1000 };

    const problemsOf = (rows, manifest) => {
        const problems = [];
        for (const [id, row] of Object.entries(rows)) {
            if (!/^world-.*-v\d+$/.test(id)) problems.push(`${id}: bad id`);
            if (!['stage', 'tour'].includes(row.kind)) problems.push(`${id}: kind`);
            if (!(row.gates > 0)) problems.push(`${id}: gates`);
            if (row.gateFloorsMs.length !== row.gates + 1) problems.push(`${id}: gateFloorsMs length`);
            if (row.gateFloorsMs.some(f => !(f > 0) || f >= POLICY.maxGateMs)) problems.push(`${id}: a gate floor`);
            if (row.floorMs < row.gateFloorsMs.reduce((p, q) => p + q, 0)) problems.push(`${id}: floorMs under the sum`);
            if (row.floorMs >= POLICY.maxTotalMs) problems.push(`${id}: floorMs over the policy`);
            if (row.kind === 'stage') {
                const stage = manifest.stages.find(s => id === `world-${s.id}-v1`);
                if (!stage) problems.push(`${id}: no such stage in the manifest`);
                else if (stage.gates !== row.gates || Math.round(stage.length) !== row.metres) problems.push(`${id}: differs from the manifest`);
            }
        }
        return problems;
    };

    test('the mini rows are valid and equal to the manifest, and a planted off-by-one fails', () => {
        const manifest = JSON.parse(fs.readFileSync(path.join(MINI, 'manifest.json'), 'utf8'));
        const rows = JSON.parse(fs.readFileSync(path.join(MINI, 'world-courses.json'), 'utf8'));
        expect(problemsOf(rows, manifest)).toEqual([]);
        const broken = JSON.parse(JSON.stringify(rows));
        broken['world-mini-2-v1'].gates += 1;
        expect(problemsOf(broken, manifest).length).toBeGreaterThan(0);
    });

    test('functions/world-courses.json holds the committed slice and equals its manifest', () => {
        const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'world', 'manifest.json'), 'utf8'));
        const rows = JSON.parse(fs.readFileSync(path.join(REPO, 'functions', 'world-courses.json'), 'utf8'));
        expect(Object.keys(rows)).toEqual(manifest.stages.map(s => `world-${s.id}-v1`));
        expect(problemsOf(rows, manifest)).toEqual([]);
    });
});

describe('the committed Tremola slice (world/)', () => {
    const dir = path.join(REPO, 'world');
    let decoded;
    beforeAll(() => { decoded = decodeWorld(dir); });

    test('is within the size budget (P17)', () => {
        const r = checkSize(dir);
        expect(r.details.problems).toEqual([]);
        expect(r.details.totalBytes).toBeLessThanOrEqual(LIMITS.sliceBytes);
    });

    test('every file matches SHA256SUMS and the list of files is the list of sums (P1)', () => {
        const sums = fs.readFileSync(path.join(dir, 'SHA256SUMS'), 'utf8').trim().split('\n').map(l => l.split('  '));
        for (const [hash, name] of sums) expect(crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, name))).digest('hex')).toBe(hash);
        const names = [];
        const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => (e.isDirectory() ? walk(path.join(d, e.name)) : names.push(path.relative(dir, path.join(d, e.name)))));
        walk(dir);
        expect(sums.map(s => s[1]).sort()).toEqual(names.filter(n => n !== 'SHA256SUMS').sort());
    });

    test('no raw swisstopo download is committed (P2)', () => {
        const files = spawnSync('git', ['ls-files'], { cwd: REPO, encoding: 'utf8' }).stdout.split('\n');
        expect(files.filter(f => /\.(gpkg|tif|tiff|zip)$/i.test(f))).toEqual([]);
        expect(['a/b.gpkg', 'c.tif', 'd.zip'].filter(f => /\.(gpkg|tif|tiff|zip)$/i.test(f))).toHaveLength(3);
    });

    test('has 20 or more real hairpins, none tighter than R_MIN outside a held stacked hairpin, none under R_HAIRPIN (P4)', () => {
        const r = checkHairpins(decoded);
        expect(r.details.problems).toEqual([]);
        expect(r.details.hairpins).toBeGreaterThanOrEqual(20);
    });

    test('its stations, graph and stacked legs pass their gates (P22)', () => {
        expect(checkStations(decoded).details.problems).toEqual([]);
        expect(checkStacked(decoded).details.problems).toEqual([]);
        expect(checkBuildings(decoded).details.problems).toEqual([]);
        const g = checkGraph(decoded, { nodes: decoded.nodes, edges: decoded.edges });
        expect(g.details.problems).toEqual([]);
        expect(decoded.junctions.length).toBeGreaterThanOrEqual(1);
    });

    test('the graph keeps the whole corridor inspect counts for the slice (P22): 588 source edges, 2 stubs under 1 m dropped', () => {
        const built = { nodes: decoded.nodes, edges: decoded.edges, stats: { corridor: { sourceEdges: 588, stubsDropped: 2 } } };
        expect(checkGraph(decoded, built, { corridorEdges: 588 }).details.problems).toEqual([]);
        // The count inspect.mjs gave for the whole ride, which is not this slice's corridor
        expect(checkGraph(decoded, built, { corridorEdges: 5445 }).ok).toBe(false);
    });

    test('no crest needs an airborne state: the smallest lift-off speed is 35 m/s or more, 5 crests listed (P39)', () => {
        const r = checkCrests(decoded);
        expect(r.details.problems).toEqual([]);
        expect(r.details.minLiftoffMps).toBeGreaterThanOrEqual(35);
        expect(r.details.lowest).toHaveLength(5);
    });

    test('the stations are where the placement rule puts them, and a tight bend is listed, not hidden (P36)', () => {
        const r = checkStations(decoded);
        expect(r.details.problems).toEqual([]);
        // (a bend within 50 m behind the line: the site runs on from it, so it may begin just out of a hairpin)
        expect(r.details.tightBend.map(b => b.s)).toEqual([5725.3, 9216.5, 11477.2]);
    });

    test('the stacked gate fails when the cap on banked allowance is raised past half the closest pair', () => {
        const closest = checkStacked(decoded).details.minStackedDs;
        expect(checkStacked(decoded, { maxBankM: closest / 2 + 1 }).ok).toBe(false);
    });

    test('rides from about 1 180 m at Airolo to the Gotthard summit at about 2 107 m (P5)', () => {
        const s = rideSamples(decoded.edges, decoded.ride.path);
        expect(s.y[0]).toBeGreaterThan(LIMITS.startY[0]);
        expect(s.y[0]).toBeLessThan(LIMITS.startY[1]);
        expect(s.y.at(-1)).toBeGreaterThan(LIMITS.summitY[0]);
        expect(s.y.at(-1)).toBeLessThan(LIMITS.summitY[1]);
        // swisstopo for the land, and the Copernicus notice for the far land outside Switzerland (licence Art. 6)
        expect(decoded.manifest.credit).toBe('© swisstopo · Copernicus WorldDEM-30 © DLR e.V., © Airbus');
        expect(decoded.manifest.notice).toMatch(/^produced using Copernicus WorldDEM-30 © DLR e\.V\. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved\./);
        expect(decoded.manifest.notice).toMatch(/do not incur any liability for any use of the Copernicus WorldDEM-30\.$/);
    });
});

describe('the command line and the helpers', () => {
    test('a cache inside the repo is refused (P2)', () => {
        const r = spawnSync('node', ['tools/world/import.mjs', '--stages', 'tremola', '--cache', path.join(REPO, 'cache'), '--out', tmp()], { cwd: REPO, encoding: 'utf8' });
        expect(r.status).not.toBe(0);
        expect(r.stderr).toMatch(/cache must be outside the repo/);
    });

    test('an unknown stage names the known ones', () => {
        const route = JSON.parse(fs.readFileSync(path.join(REPO, 'tools', 'world', 'route.json'), 'utf8'));
        expect(() => stageDefs(route, ['nowhere'])).toThrow(/Known: tremola/);
        const [tremola] = stageDefs(route, ['tremola']);
        expect(tremola.waypoints.map(w => w.name)).toEqual(['Airolo', 'Tremola lower', 'Tremola upper', 'Gotthard']);
        expect(stageDefs(route, ['all'])).toHaveLength(20);
    });

    test('class widths: the class width on side roads, never under 3 m', () => {
        expect(classWidth('6m Strasse')).toBe(6);
        expect(classWidth('1m Weg')).toBe(3);
        expect(classWidth('Autobahn')).toBe(9);
    });

    test('LV95 and WGS84 convert both ways to a few metres', () => {
        const w = lv95ToWgs84(2688447, 1165379);
        const back = wgs84ToLv95(w.lon, w.lat);
        expect(Math.hypot(back.e - 2688447, back.n - 1165379)).toBeLessThan(2);
        expect(w.lat).toBeCloseTo(46.634, 2);
    });

    test('the synthetic terrain is smooth', () => {
        expect(Math.abs(syntheticDem(0, 0) - syntheticDem(1, 0))).toBeLessThan(0.5);
    });
});

describe('farland.mjs: the land out to 40 km', () => {
    test('the cover grid fills polygons by scanline, a hole stays open, and rock paints over forest', () => {
        const grid = { x0: 0, z0: 0, nx: 20, nz: 20, cell: 50, cls: new Uint8Array(400).fill(255), rank: new Int8Array(400).fill(-1) };
        const square = (a, b) => [[a, a], [b, a], [b, b], [a, b], [a, a]];
        rasterizeCoverGrid([{ cls: COVER.forest, rings: [square(0, 1000), square(400, 600)] }, { cls: COVER.rock, rings: [square(0, 200)] }], grid);
        expect(grid.cls[10 * 20 + 10]).toBe(255);
        expect(grid.cls[15 * 20 + 15]).toBe(COVER.forest);
        expect(grid.cls[1 * 20 + 1]).toBe(COVER.rock);
        // Order does not matter: forest after rock still leaves rock
        const again = { ...grid, cls: new Uint8Array(400).fill(255), rank: new Int8Array(400).fill(-1) };
        rasterizeCoverGrid([{ cls: COVER.rock, rings: [square(0, 200)] }, { cls: COVER.forest, rings: [square(0, 1000)] }], again);
        expect(again.cls[1 * 20 + 1]).toBe(COVER.rock);
    });

    test('a level vertex is its window mean raised halfway to the window top, with its cover shares', () => {
        // A 250 m window over 50 m cells: one cell 100 m higher than the rest
        const peak = (e, n) => e > 1040 && e < 1060 && n > 990 && n < 1010;
        const heightCell = (e, n) => ({ mean: peak(e, n) ? 1100 : 1000, max: peak(e, n) ? 1150 : 1000, alti: true });
        const cover = { x0: 0, z0: -500, nx: 100, nz: 100, cell: 50, cls: new Uint8Array(10000).fill(COVER.forest) };
        const level = buildLevel({ x0: 1000, z0: 0, nx: 1, nz: 1, cell: 250 }, { heightCell, cover, origin: { e0: 0, n0: 1000 } });
        expect(level.heights[0]).toBe(Math.round(1004 + 0.5 * (1150 - 1004)));
        expect([...level.shares]).toEqual([255, 0, 0, 255]);
    });

    test('outside Switzerland (no swissALTI3D, no polygon) the cover is unknown, not grass', () => {
        const heightCell = () => ({ mean: 1500, max: 1500, alti: false });
        const cover = { x0: 0, z0: 0, nx: 10, nz: 10, cell: 50, cls: new Uint8Array(100).fill(255) };
        const level = buildLevel({ x0: 100, z0: 100, nx: 1, nz: 1, cell: 100 }, { heightCell, cover, origin: { e0: 0, n0: 0 } });
        expect(level.shares[3]).toBe(0);
        expect(level.copernicus).toBeGreaterThan(0);
    });

    test('the levels are centred on far.bin and the outer one reaches 40 km', () => {
        const far = { x0: -4600, z0: 5100, nx: 88, nz: 88, cell: 100 };
        const [inner, outer] = levelBoxes(far);
        expect(inner.cell).toBe(LEVELS[0].cellM);
        const middle = far.x0 + ((far.nx - 1) * far.cell) / 2;
        expect(outer.x0).toBeLessThanOrEqual(middle - LEVELS[1].reachM);
        expect(outer.x0 + (outer.nx - 1) * outer.cell).toBeGreaterThanOrEqual(middle + LEVELS[1].reachM - outer.cell);
    });

    test('the horizon is sunk under each tile cell by the most it stands above the tile, and 8 m elsewhere', () => {
        // A far grid with a ridge vertex the tile does not have: the bilinear surface stands over the tile's gully
        const data = new Int16Array(25).fill(1000);
        data[2 * 5 + 2] = 1040;
        const far = { x0: 0, z0: 0, nx: 5, nz: 5, cell: 100, data };
        const heights = new Float32Array(TILE_N * TILE_N).fill(1000);
        const sinks = horizonSinks(far, new Map([['0,0', { heights }]]), { tileM: TILE_M, tileN: TILE_N, cellM: CELL_M });
        // The tile's nearest vertex to the ridge is 4 m off it, where the surface is about 37 m over the tile
        expect(sinks[2 * 5 + 2]).toBeGreaterThanOrEqual(39);
        expect(sinks[2 * 5 + 2]).toBeLessThanOrEqual(43);
        expect(sinks[0]).toBe(8);
    });

    // The far mesh never stands over the land a resident tile draws (at any level of detail): the committed data's sinks hold it under
    test('the committed horizon lies under every tile node as drawn at every level of detail', () => {
        const horizon = checkHorizon(decodeWorld(path.join(REPO, 'world')));
        expect({ over: horizon.details.over, sinks: horizon.details.sinks }).toEqual({ over: 0, sinks: true });
        expect(horizon.details.nodes).toBeGreaterThan(100000);
    });

    // No placeholder ships: the importer and the data check refuse a landmark that is not a model in assets/
    test('every committed landmark is a model, and a box or a missing file is refused', () => {
        const landmarks = checkLandmarks(decodeWorld(path.join(REPO, 'world')));
        expect(landmarks.details).toMatchObject({ landmarks: 1, bad: 0 });
        expect(landmarkAssetProblem({ name: 'x', asset: 'box', size: [1, 1, 1] })).toMatch(/placeholder/);
        expect(landmarkAssetProblem({ name: 'x', asset: 'assets/village/none.glb', size: [1, 1, 1] })).toMatch(/does not exist/);
        expect(landmarkAssetProblem({ name: 'x', asset: 'assets/village/hospiz.glb', size: [43, 15, 13] })).toBeNull();
    });

    test('the far levels round trip through the files', async () => {
        const world = await buildWorld(syntheticSource(), { stationSpacingM: 1000 });
        const level = { x0: -1000, z0: -1000, nx: 3, nz: 2, cell: 1000, heights: new Int16Array([1, 2, 3, 4, 5, -32768]), shares: new Uint8Array(24).map((_, i) => i) };
        const files = encodeFiles({ ...world, farLand: { levels: [level], cover0: new Uint8Array(world.far.nx * world.far.nz * 4), sink0: new Uint8Array(world.far.nx * world.far.nz).fill(8), copernicus: false } });
        const dir = tmp();
        for (const [p, b] of files) { fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true }); fs.writeFileSync(path.join(dir, p), b); }
        const decoded = decodeWorld(dir);
        expect(decoded.farLevels).toHaveLength(1);
        expect([...decoded.farLevels[0].heights]).toEqual([...level.heights]);
        expect([...decoded.farLevels[0].shares]).toEqual([...level.shares]);
        expect(decoded.manifest.farLevels[0]).toMatchObject({ file: 'far/l1.bin', cell: 1000, nx: 3, nz: 2 });
        expect(files.has('far/sink0.bin')).toBe(true);
    });
});
