/**
 * @jest-environment node
 */
// The stops at a leg's ends (tools/world/stops.mjs): the area by rule, the way in, the slots, and the stage's end
// moved to before the turn-in. Then the shipped folder worlds/gotthard: each stop's slots in its area, its path from
// the ride to the slots, and every stage end with a stop STOP.leadM before the turn-in.
import { describe, test, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findStops, slotsIn, areaDistance, groundPlane, viewOf, STOP } from '../../tools/world/stops.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// A straight ride north (+z... heading 0 runs along +z) 2 km long, sampled every 4 m
function straight(length = 2000) {
    const n = length / 4 + 1;
    const samples = { s: new Float64Array(n), x: new Float64Array(n), z: new Float64Array(n), y: new Float64Array(n), heading: new Float64Array(n), width: new Float32Array(n).fill(10), flags: new Uint8Array(n), radius: new Float64Array(n).fill(Infinity) };
    for (let i = 0; i < n; i++) { samples.s[i] = i * 4; samples.z[i] = i * 4; }
    const ride = { id: 0, a: 0, b: 1, onRide: true, x: Float64Array.from([0, 0]), z: Float64Array.from([0, length]), length };
    return { samples, ride };
}

const box = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]];

describe('the rule', () => {
    test('a car park beside the ride is a direct stop; the stage ends leadM before its turn-in', () => {
        const { samples, ride } = straight();
        const bounds = [{ id: 'a', from: 0, to: 2000 }];
        const areas = [{ cls: 'Oeffentliches Parkplatzareal', name: null, ring: box(-30, 1900, -7, 1960) }];
        const stops = findStops({ stopDefs: [{ stage: 0, at: 'end', kind: 'lookout', x: -20, z: 1930 }], samples, edges: [ride], ride: [{ edgeId: 0, dir: 1 }], areas, bounds });
        expect(stops).toHaveLength(1);
        expect(stops[0]).toMatchObject({ kind: 'lookout', access: 'direct', at: 'end', stage: 'a' });
        // the first sample whose edge comes within directM of the area: the area begins at z 1900
        expect(stops[0].s).toBeGreaterThanOrEqual(1880);
        expect(stops[0].s).toBeLessThanOrEqual(1900);
        expect(bounds[0].to).toBeCloseTo(stops[0].s - STOP.leadM, 1);
        // The ride's left is -x for a heading of 0 (lateral along (cos h, -sin h) = +x): the area at -x is side -1
        expect(stops[0].side).toBe(-1);
        expect(stops[0].slots).toHaveLength(STOP.slots);
        for (const slot of stops[0].slots) expect(areaDistance(stops[0].ring, slot.x, slot.z)).toBe(0);
    });

    test('a car park off the ride is reached along a side road from a node of the ride', () => {
        const { samples } = straight();
        const ride = [{ edgeId: 0, dir: 1 }, { edgeId: 1, dir: 1 }];
        const edges = [
            { id: 0, a: 0, b: 1, onRide: true, x: Float64Array.from([0, 0]), z: Float64Array.from([0, 1500]), length: 1500 },
            { id: 1, a: 1, b: 2, onRide: true, x: Float64Array.from([0, 0]), z: Float64Array.from([1500, 2000]), length: 500 },
            { id: 2, a: 1, b: 3, onRide: false, x: Float64Array.from([0, 30, 60, 90, 120]), z: Float64Array.from([1500, 1500, 1500, 1500, 1500]), length: 120 }
        ];
        const areas = [{ cls: 'Oeffentliches Parkplatzareal', name: null, ring: box(100, 1480, 140, 1520) }, { cls: 'Privates Parkplatzareal', name: null, ring: box(-40, 1990, -8, 2010) }];
        const bounds = [{ id: 'a', from: 0, to: 2000 }, { id: 'b', from: 2000, to: 2000 }];
        const stops = findStops({ stopDefs: [{ stage: 0, at: 'end', kind: 'restaurant', x: 120, z: 1500 }], samples, edges, ride, areas, bounds });
        expect(stops[0]).toMatchObject({ access: 'road', s: 1500 });
        expect(stops[0].path[0]).toEqual([0, 1500]);
        expect(bounds[0].to).toBe(1440);
        expect(bounds[1].from).toBe(1440);
    });

    test('no area near the coordinate, an unknown kind, or an area too small for the group stops the import', () => {
        const { samples, ride } = straight();
        const run = (areas, kind = 'hotel') => () => findStops({ stopDefs: [{ stage: 0, at: 'end', kind, x: -20, z: 1930 }], samples, edges: [ride], ride: [{ edgeId: 0, dir: 1 }], areas, bounds: [{ id: 'a', from: 0, to: 2000 }] });
        expect(run([])).toThrow(/no public car park/);
        expect(run([{ cls: 'Oeffentliches Parkplatzareal', ring: box(-30, 1900, -7, 1960) }], 'castle')).toThrow(/kind/);
        expect(run([{ cls: 'Oeffentliches Parkplatzareal', ring: box(-12, 1925, -7, 1930) }])).toThrow(/room for/);
    });

    test('the ground of an area is the plane of its land, its grade held to gradeMax; the view is where the land falls', () => {
        const ring = box(0, 0, 40, 20);
        const plane = groundPlane(ring, 20, 10, (x, z) => 1000 + 0.02 * x - 0.01 * z);
        expect(plane.y).toBeCloseTo(1000 + 0.02 * 20 - 0.01 * 10, 1);
        expect(plane.gx).toBeCloseTo(0.02, 3);
        expect(plane.gz).toBeCloseTo(-0.01, 3);
        const steep = groundPlane(ring, 20, 10, (x) => 1000 + 0.3 * x);
        expect(Math.hypot(steep.gx, steep.gz)).toBeCloseTo(STOP.gradeMax, 4);
        // Land that falls away to +x (heading pi/2) past the area
        const view = viewOf(ring, 20, 10, { y: 1000, gx: 0, gz: 0 }, (x) => (x > 40 ? 1000 - (x - 40) : 1000));
        expect(view).toBeCloseTo(Math.PI / 2, 3);
    });

    test('slots stand side by side along the area\'s long axis, inside it by the margin', () => {
        const slots = slotsIn(box(0, 0, 40, 10));
        expect(slots).toHaveLength(STOP.slots);
        // the long axis is x: every slot on the middle row (z 5), noses along z
        for (const slot of slots) {
            expect(slot.z).toBeCloseTo(5, 5);
            expect(Math.abs(Math.sin(slot.heading))).toBeLessThan(1e-3);
        }
        const xs = slots.map(s => s.x).sort((a, b) => a - b);
        for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeCloseTo(STOP.slotGapM, 5);
    });
});

describe('the Tremola\'s stops (world/)', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'world', 'manifest.json'), 'utf8'));
    const ride = JSON.parse(fs.readFileSync(path.join(REPO, 'world', 'ride.json'), 'utf8'));
    const courses = JSON.parse(fs.readFileSync(path.join(REPO, 'functions', 'world-courses.json'), 'utf8'));

    test('a stop at each end: the station car park by road at its start, the hospice square behind its kept line', () => {
        const start = manifest.stops.find(s => s.at === 'start'), end = manifest.stops.find(s => s.at === 'end');
        expect(start).toMatchObject({ id: 'tremola-start', kind: 'carpark', access: 'road', s: 0 });
        expect(end).toMatchObject({ id: 'tremola-end', kind: 'restaurant', keepLine: true });
        for (const stop of [start, end]) {
            expect(stop.slots).toHaveLength(STOP.slots);
            for (const slot of stop.slots) expect(areaDistance(stop.ring, slot.x, slot.z)).toBe(0);
        }
        // (the way in from the start is longer than an end's may be, within a start's)
        let way = 0;
        for (let i = 1; i < start.path.length; i++) way += Math.hypot(start.path[i][0] - start.path[i - 1][0], start.path[i][1] - start.path[i - 1][1]);
        expect(way).toBeGreaterThan(STOP.pathMaxM);
        expect(way).toBeLessThanOrEqual(STOP.startPathMaxM + 100);
    });

    test('the line, the stage and the board stay as they were', () => {
        expect(ride.stages).toEqual([{ id: 'tremola', name: 'Tremola, Airolo to the Gotthard summit', from: 0, to: 13187.4 }]);
        expect(manifest.stops.find(s => s.at === 'end').s).toBeLessThan(ride.stages[0].to - 500);
        expect(courses['world-tremola-v1']).toMatchObject({ gates: 6, metres: 13187, floorMs: 208315 });
    });
});

describe('the shipped stops (worlds/gotthard)', () => {
    const dir = path.join(REPO, 'worlds', 'gotthard');
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    const ride = JSON.parse(fs.readFileSync(path.join(dir, 'ride.json'), 'utf8'));

    test('the hospice square is a stop on the way: found by the same rule, within the stage, moving no end', () => {
        const via = manifest.stops.filter(s => s.at === 'via');
        // (and the car park at Hospental, where leg 11 of the tour starts: a stop where the group gathers, `legStart`)
        expect(via.map(s => s.kind)).toEqual(['restaurant', 'carpark']);
        expect(via.map(s => !!s.legStart)).toEqual([false, true]);
        for (const stop of via) {
            const stage = ride.stages.find(s => s.id === stop.stage);
            expect(stop.s).toBeGreaterThan(stage.from + 500);
            expect(stop.s).toBeLessThan(stage.to - 500);
            expect(stop.slots).toHaveLength(STOP.slots);
            for (const slot of stop.slots) expect(areaDistance(stop.ring, slot.x, slot.z)).toBe(0);
        }
        expect(manifest.stages.filter(s => !s.base)).toHaveLength(1);
    });

    test('a stop on the way is looked for round the ride sample nearest its coordinate and moves no stage end', () => {
        const { samples, ride } = straight();
        const bounds = [{ id: 'a', from: 0, to: 2000 }];
        const areas = [{ cls: 'Oeffentliches Parkplatzareal', name: null, ring: box(-30, 900, -7, 960) }];
        const stops = findStops({ stopDefs: [{ stage: 0, at: 'via', kind: 'restaurant', x: -20, z: 930 }], samples, edges: [ride], ride: [{ edgeId: 0, dir: 1 }], areas, bounds });
        expect(stops[0]).toMatchObject({ id: 'a-via-1', at: 'via', access: 'direct' });
        expect(stops[0].s).toBeGreaterThanOrEqual(880);
        expect(stops[0].s).toBeLessThanOrEqual(900);
        expect(bounds[0]).toEqual({ id: 'a', from: 0, to: 2000 });
    });

    test('every stage has a stop at its start and its end, with room for the group in its area', () => {
        for (const stage of manifest.stages) {
            for (const at of ['start', 'end']) {
                // (a leg of the tour names its stops: js/world/tour.js)
                const named = at === 'start' ? stage.startStop : stage.endStop;
                const stop = named ? manifest.stops.find(s => s.id === named) : manifest.stops.find(s => s.stage === stage.id && s.at === at);
                expect(stop).toBeDefined();
                expect(stop.slots).toHaveLength(STOP.slots);
                for (const slot of stop.slots) expect(areaDistance(stop.ring, slot.x, slot.z)).toBe(0);
                expect(stop.path.length).toBeGreaterThan(0);
            }
        }
    });

    test('each stage with a stop at its end ends leadM before the turn-in, and the ride runs on to it', () => {
        for (const stop of manifest.stops.filter(s => s.at === 'end')) {
            const stage = ride.stages.find(s => s.id === stop.stage);
            expect(stage.to).toBeCloseTo(stop.s - STOP.leadM, 1);
            expect(ride.length).toBeGreaterThanOrEqual(stop.s - 0.1);
        }
    });

    test('a leg of the tour starts at its start stop\'s turn-in and ends leadM before its end stop\'s, as it rides', () => {
        for (const folder of ['world', 'worlds/gotthard', 'worlds/airolo']) {
            const m = JSON.parse(fs.readFileSync(path.join(REPO, folder, 'manifest.json'), 'utf8'));
            const L = JSON.parse(fs.readFileSync(path.join(REPO, folder, 'ride.json'), 'utf8')).length;
            for (const stage of m.stages.filter(s => s.base)) {
                const turn = id => { const st = m.stops.find(s => s.id === id); return stage.dir === -1 ? L - (st.s1 ?? st.s) : st.s; };
                const [from, to] = stage.dir === -1 ? [L - stage.to, L - stage.from] : [stage.from, stage.to];
                expect([stage.id, from]).toEqual([stage.id, expect.closeTo(turn(stage.startStop), 1)]);
                expect([stage.id, to]).toEqual([stage.id, expect.closeTo(turn(stage.endStop) - STOP.leadM, 1)]);
            }
        }
    });

    test('every stop has its levelled ground, and the lookout faces the land that falls away from it', () => {
        for (const stop of manifest.stops) {
            expect(stop.plane).toBeDefined();
            expect(Math.hypot(stop.plane.gx, stop.plane.gz)).toBeLessThanOrEqual(STOP.gradeMax + 1e-4);
        }
        const lookout = manifest.stops.find(s => s.kind === 'lookout');
        expect(Number.isFinite(lookout.view)).toBe(true);
    });

    test('the start stop is the map place it parks in, kept open at the stage start', () => {
        const stop = manifest.stops.find(s => s.at === 'start' && s.stage === manifest.stages[0].id);
        if (stop.access === 'direct') expect(manifest.places.some(p => p.stop === stop.id)).toBe(true);
    });
});
