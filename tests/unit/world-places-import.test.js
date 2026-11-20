/**
 * @jest-environment node
 */
// The importer's stopping places (tools/world/places.mjs): a mapped parking area along the ride becomes a place whose
// verge the bencher carves the land to, and where the map has none a level stretch of verge is found by rule. On
// made-up roads, on the synthetic world and on the committed Tremola slice. No cache and no network.
import { describe, test, expect, beforeAll } from '@jest/globals';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLACE, AREA_KINDS, padOf, mapPlaces, foundPlaces, applyPads, mouthsOf, numberPlaces, levelOff, wallRisk } from '../../tools/world/places.mjs';
import { createBencher, ZONE, TILE_N, TILE_M, CELL_M, VERGE_M, BATTER } from '../../tools/world/bench.mjs';
import { rideSamples } from '../../tools/world/stations.mjs';
import { buildWorld } from '../../tools/world/import.mjs';
import { syntheticSource } from '../../tools/world/synthetic.mjs';
import { encodeFiles, decodeWorld } from '../../tools/world/encode.mjs';
import { checkPlaces } from '../../tools/world/verify.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// A straight 10 m road along +z at x = x0 (heading 0: +x is its +lateral side, the rider's left), n samples 4 m apart
const edge = (x0, y, n = 40) => ({
    id: 0, onRide: true, x: Float64Array.from({ length: n }, () => x0), z: Float64Array.from({ length: n }, (_, i) => i * 4), y: Float64Array.from({ length: n }, () => y),
    heading: new Float64Array(n), width: new Float32Array(n).fill(10), flags: new Uint8Array(n), spacing: 4, length: (n - 1) * 4
});
const ride = [{ edgeId: 0, dir: 1 }];
const rect = (cls, x0, z0, x1, z1, name = null) => ({ cls, name, ring: [[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]] });
// Flat tiles under the road: `shape(x, z)` is each node's height
const tilesOf = (shape, zone = () => ZONE.terrain) => {
    const tiles = new Map();
    for (let tz = 0; tz < 5; tz++) {
        const heights = new Float32Array(TILE_N * TILE_N), zones = new Uint8Array(TILE_N * TILE_N);
        for (let j = 0; j < TILE_N; j++) for (let i = 0; i < TILE_N; i++) { heights[j * TILE_N + i] = shape(i * CELL_M, tz * TILE_M + j * CELL_M); zones[j * TILE_N + i] = zone(i * CELL_M, tz * TILE_M + j * CELL_M); }
        tiles.set(`0,${tz}`, { heights, zones });
    }
    return tiles;
};

describe('a mapped area along the ride is a place', () => {
    const e = edge(0, 1000, 100);
    const samples = rideSamples([e], ride);

    test('a car park that starts inside the drawn road is laid from the carriageway edge out, by its own width, on its side', () => {
        // Mapped 3.5 to 8 m from the centre line on the -x side: 4.5 m across, 40 m along
        const places = mapPlaces([rect('Oeffentliches Parkplatzareal', -8, 100, -3.5, 140)], samples, [], [e]);
        expect(places).toHaveLength(1);
        expect(places[0]).toMatchObject({ kind: 'carpark', source: 'map', side: -1, s: 100, taper: PLACE.taperM, surface: 'asphalt', name: null });
        // (to a sample of the ride along, 4 m, and to the 0.25 m step of the measure across)
        expect(places[0].length).toBeGreaterThanOrEqual(36);
        expect(places[0].length).toBeLessThanOrEqual(40);
        expect(places[0].depth).toBeGreaterThanOrEqual(4.2);
        expect(places[0].depth).toBeLessThanOrEqual(4.5);
    });

    test('its depth is capped, a public name is kept, and a rest area is a lay-by', () => {
        const [place] = mapPlaces([rect('Rastplatzareal', 6, 100, 30, 160, 'Rastplatz Nord')], samples, [], [e]);
        expect(place).toMatchObject({ kind: 'layby', side: 1, depth: PLACE.depthMaxM, surface: 'gravel', name: 'Rastplatz Nord' });
        expect(place.length).toBeGreaterThanOrEqual(56);
    });

    test('an area of another class, one away from the road, a sliver and a short one are no place', () => {
        expect(Object.keys(AREA_KINDS)).toEqual(['Oeffentliches Parkplatzareal', 'Rastplatzareal']);
        expect(mapPlaces([rect('Verkehrsflaeche', -8, 100, -3.5, 140)], samples, [], [e])).toEqual([]);
        expect(mapPlaces([rect('Privates Parkplatzareal', -8, 100, -3.5, 140)], samples, [], [e])).toEqual([]);
        expect(mapPlaces([rect('Oeffentliches Parkplatzareal', -30, 100, -5 - PLACE.edgeGapM - 1, 140)], samples, [], [e])).toEqual([]);
        expect(mapPlaces([rect('Oeffentliches Parkplatzareal', -5.5, 100, -4, 140)], samples, [], [e])).toEqual([]);
        expect(mapPlaces([rect('Oeffentliches Parkplatzareal', -8, 100, -3.5, 108)], samples, [], [e])).toEqual([]);
    });

    test('it keeps clear of a side road mouth on its own side, and of another road beside it', () => {
        const area = rect('Oeffentliches Parkplatzareal', -8, 100, -3.5, 180);
        const [cut] = mapPlaces([area], samples, [{ s: 100, side: -1 }], [e]);
        expect(cut.s).toBeGreaterThanOrEqual(100 + PLACE.mouthClearM);
        expect(cut.s + cut.length).toBeGreaterThanOrEqual(176);
        // A mouth on the other side of the ride does not move it
        expect(mapPlaces([area], samples, [{ s: 100, side: 1 }], [e])[0].s).toBe(100);
        // Another road 12 m off on that side: its band and verge lie in the strip
        const other = { ...edge(-12, 1000, 100), id: 1, onRide: false };
        expect(mapPlaces([area], samples, [], [e, other])).toEqual([]);
    });

    test('a mouth is on the side its branch leaves to', () => {
        const junctions = [{ incident: [{ edgeId: 0, heading: 0 }, { edgeId: 1, heading: Math.PI }, { edgeId: 2, heading: Math.PI / 2 }, { edgeId: 3, heading: -Math.PI / 2 }, { edgeId: 4, heading: 0.1 }], passes: [{ sIn: 80, inEdge: 1, outEdge: 0 }] }];
        // Heading pi / 2 runs toward +x, the +lateral side of a ride heading 0
        expect(mouthsOf(junctions, samples)).toEqual([{ s: 80, side: 1 }, { s: 80, side: -1 }, { s: 80, side: 0 }]);
    });

    test('the pad is the depth, tapered at each end, and is written on the side of the edge the ride has it on', () => {
        const place = { source: 'map', s: 100, side: -1, length: 40, depth: 4, taper: 6 };
        expect(padOf(place, 99)).toBe(0);
        expect(padOf(place, 103)).toBeCloseTo(2, 6);
        expect(padOf(place, 120)).toBe(4);
        expect(padOf(place, 138)).toBeCloseTo(4 / 3, 6);
        const with_ = edge(0, 1000, 100);
        applyPads([with_], ride, [place, { ...place, source: 'found', s: 300 }]);
        expect(with_.padP).toBeUndefined();
        expect(with_.padN[30]).toBe(4);
        expect(with_.padN[25]).toBe(0);
        expect(Math.max(...with_.padN.subarray(70))).toBe(0);
        // Ridden against its direction, the ride's right is the edge's +lateral side, and s runs from its far end
        const against = edge(0, 1000, 100);
        applyPads([against], [{ edgeId: 0, dir: -1 }], [place]);
        expect(against.padN).toBeUndefined();
        expect(against.padP[99 - 30]).toBe(4);
    });
});

describe('the bencher carves the land to a place', () => {
    test('a node inside the widened verge takes the road height on that side only; without the place it is fill', () => {
        // The road at x = 4, 10 m over the ground: the node at x = -8 lies 12 m from the centre line, 5.9 m past the verge
        const plain = edge(4, 1010);
        const padded = edge(4, 1010);
        applyPads([padded], ride, [{ source: 'map', s: 20, side: -1, length: 120, depth: 7, taper: 6 }]);
        const a = createBencher({ edges: [plain], demAt: () => 1000 }), b = createBencher({ edges: [padded], demAt: () => 1000 });
        expect(a.node(-1, 10).y).toBeLessThan(1010 - 3);
        expect(b.node(-1, 10).y).toBeCloseTo(1010, 6);
        expect(b.node(-1, 10).zone).toBe(ZONE.bench);
        expect(b.ground(-7, 80)).toEqual({ y: 1010, zone: ZONE.bench });
        // The fill starts at the place's edge
        expect(b.ground(-10, 80).y).toBeCloseTo(1010 - (14 - 5 - VERGE_M - 7) * BATTER, 6);
        // The other side, and the road outside the place, are as they were
        expect(b.node(2, 10)).toEqual(a.node(2, 10));
        expect(b.ground(13, 80)).toEqual(a.ground(13, 80));
        expect(b.node(-1, 0)).toEqual(a.node(-1, 0));
    });
});

describe('found places: where the map has none', () => {
    const e = edge(96, 1000, 500);
    const samples = rideSamples([e], ride);

    test('on level land there is one in every gap, on the rider\'s right, none nearer the start than half a gap', () => {
        const places = foundPlaces(samples, tilesOf(() => 1000), [], [e]);
        expect(places.length).toBeGreaterThanOrEqual(3);
        const at = [0, ...places.map(p => p.s), samples.s[samples.s.length - 1]];
        expect(places[0].s).toBeGreaterThanOrEqual(PLACE.foundGapM / 2);
        for (let k = 1; k < at.length - 1; k++) expect(at[k] - at[k - 1]).toBeLessThanOrEqual(PLACE.foundGapM + PLACE.foundLengthMaxM);
        for (const p of places) expect(p).toMatchObject({ kind: 'verge', source: 'found', side: -1, depth: PLACE.foundDepthM, taper: 0, surface: null, name: null });
    });

    test('where the right falls away the place is on the left; where both do, or a wall stands there, there is none', () => {
        const rightLow = tilesOf(x => (x < 96 ? 999 : 1000));
        expect(levelOff(rightLow, samples, 50, -1)).toBeGreaterThan(PLACE.foundLevelM);
        expect(levelOff(rightLow, samples, 50, 1)).toBe(0);
        expect(foundPlaces(samples, rightLow, [], [e]).every(p => p.side === 1)).toBe(true);
        expect(foundPlaces(samples, rightLow, [], [e]).length).toBeGreaterThan(0);
        expect(foundPlaces(samples, tilesOf(x => (x === 96 ? 1000 : 999)), [], [e])).toEqual([]);
        expect(foundPlaces(samples, tilesOf(() => 1000, x => (x === 96 ? ZONE.road : ZONE.wall)), [], [e])).toEqual([]);
    });

    test('none is found near a place the map has, at a junction, or beside another road', () => {
        const tiles = tilesOf(() => 1000);
        const taken = [{ s: 500, length: 60 }];
        const places = foundPlaces(samples, tiles, [], [e], taken);
        for (const p of places) expect(Math.min(Math.abs(p.s - 500), Math.abs(p.s - 560))).toBeGreaterThanOrEqual(PLACE.foundGapM / 2 - PLACE.foundLengthMaxM);
        const mouths = Array.from({ length: 80 }, (_, k) => ({ s: k * 25, side: 1 }));
        expect(foundPlaces(samples, tiles, mouths, [e])).toEqual([]);
        const other = { ...edge(96 - 10, 1000, 500), id: 1, onRide: false };
        expect(foundPlaces(samples, tiles, [], [e, other]).every(p => p.side === 1)).toBe(true);
    });

    test('none stands where the land falls away past its strip: the runtime builds a retaining wall there', () => {
        // Level for 2 m past the verge on the right, then 15 m down over the next 8 m: the strip itself is level, the edge would be walled
        const shelf = tilesOf(x => (x < 88 ? 985 : 1000));
        expect(levelOff(shelf, samples, 50, -1)).toBeLessThan(PLACE.foundLevelM);
        expect(wallRisk(shelf, samples, 50, -1)).toBe(true);
        expect(wallRisk(shelf, samples, 50, 1)).toBe(false);
        expect(foundPlaces(samples, shelf, [], [e]).every(p => p.side === 1)).toBe(true);
        expect(wallRisk(tilesOf(() => 1000, x => (x <= 88 ? ZONE.drop : ZONE.terrain)), samples, 50, -1)).toBe(true);
    });

    test('a place clear of a checkpoint\'s roadworks is taken before one in them', () => {
        const tiles = tilesOf(() => 1000);
        const gates = [1000];
        const places = foundPlaces(samples, tiles, [], [e], [], gates);
        expect(places.length).toBeGreaterThanOrEqual(2);
        for (const p of places) expect(p.s + p.length <= 1000 - PLACE.worksBackM || p.s >= 1000 + PLACE.worksPastM).toBe(true);
        // With works everywhere a place is still found
        expect(foundPlaces(samples, tiles, [], [e], [], [500, 1000, 1500, 2000]).length).toBeGreaterThan(0);
    });

    test('the places are numbered in order along the ride', () => {
        const all = numberPlaces([{ s: 900, side: 1 }, { s: 100, side: -1 }, { s: 400, side: 1 }]);
        expect(all.map(p => [p.id, p.s])).toEqual([['p0', 100], ['p1', 400], ['p2', 900]]);
    });
});

describe('the worlds the importer makes', () => {
    let world;
    beforeAll(async () => { world = await buildWorld(syntheticSource(), { stationSpacingM: 500 }); }, 120000);

    test('the synthetic world has its car park, in the manifest and under the data check', () => {
        expect(world.places).toHaveLength(1);
        expect(world.places[0]).toMatchObject({ id: 'p0', kind: 'carpark', source: 'map', side: -1, depth: PLACE.depthMaxM, surface: 'asphalt' });
        expect(world.places[0].s).toBeGreaterThan(295);
        expect(world.places[0].s + world.places[0].length).toBeLessThan(345);
        const manifest = JSON.parse(encodeFiles(world).get('manifest.json').toString());
        expect(manifest.places).toEqual(world.places);
        const mini = checkPlaces(decodeWorld(path.join(REPO, 'tests', 'fixtures', 'world', 'mini')));
        expect(mini.ok).toBe(true);
        expect(mini.details).toMatchObject({ places: 1, map: 1, found: 0 });
    });

    test('the committed Tremola slice passes the data check: one place from the map, the rest found, no gap over 1000 m', () => {
        const r = checkPlaces(decodeWorld(path.join(REPO, 'world')));
        expect(r.details.problems).toEqual([]);
        expect(r.ok).toBe(true);
        expect(r.details.map).toBe(1);
        expect(r.details.found).toBeGreaterThanOrEqual(15);
        expect(r.details.maxGapM).toBeLessThanOrEqual(1000);
        expect(r.details.landOverM).toBeLessThanOrEqual(0.15);
    });

    test('the check fails on a place moved onto a bend, and on one out of order', () => {
        const decoded = decodeWorld(path.join(REPO, 'world'));
        const places = decoded.manifest.places;
        const moved = { ...decoded, manifest: { ...decoded.manifest, places: places.map(p => (p.source === 'map' ? { ...p, s: 7890 } : p)).sort((a, b) => a.s - b.s) } };
        expect(checkPlaces(moved).ok).toBe(false);
        const swapped = { ...decoded, manifest: { ...decoded.manifest, places: [places[1], places[0], ...places.slice(2)] } };
        expect(checkPlaces(swapped).details.problems.join(' ')).toMatch(/out of order/);
    });
});
