// The stopping places beside a world's ride (js/world/places.js, made by tools/world/places.mjs): what the game is
// told (env.places: the next place, where a rider stops in it), and that a place is ground and not scenery. On a
// straight synthetic world the rules are checked one by one; on the committed Tremola slice every place is visited.
// A map place widens the ride's verge on its side: the ribbon's own columns, so it costs no triangle.
import { describe, test, expect, beforeAll } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';
import { samplesOf, fakeData, allTiles, straight } from '../helpers/world-synthetic.js';
import { sceneryOf } from '../helpers/world-clearance.js';

const DT = 1 / 60;
const game = loadGame();
const { THREE, WorldRoute, WorldGround, WorldPhysics, WorldPlaces, PlaceMesh, WorldEnvironment, RoadMesh, RoadSurface, RoadClearance, Vehicle, Route } = game;
const V = RoadSurface.VERGE_M;

// A 10 m road along +z at height 100 on flat land, with a drawn car park on the rider's right and a found place on the left
const MAP = { id: 'p0', kind: 'carpark', source: 'map', s: 200, side: -1, length: 40, depth: 4, taper: 6, surface: 'asphalt', name: null };
const FOUND = { id: 'p1', kind: 'verge', source: 'found', s: 400, side: 1, length: 24, depth: 2, taper: 0, surface: null, name: null };
function world(list = [MAP, FOUND]) {
    const route = new WorldRoute(samplesOf(straight(1000)), {});
    const places = new WorldPlaces(list, route);
    const ground = new WorldGround(route, fakeData({ tiles: allTiles(-1, 0, -1, 2) }));
    return { physics: WorldPhysics, route, ground, places };
}
const rowsOf = (route, from, to) => route.points.slice(from, to + 1).map((p, i) => ({ x: p.x, y: p.y, z: p.z, heading: p.heading, width: p.width, bits: p.bits, s: p.s, i: from + i, padN: p.padN || 0, padP: p.padP || 0, padSurface: p.padSurface }));

// A bike put down at (lateral, s) heading along the road
function bikeAt(env, lateral, s, speed = 0) {
    const p = env.route.sample(s, {});
    const v = new Vehicle(new THREE.Scene());
    v.environment = env;
    v.assistLevel = 'off';
    v.position.set(p.x + lateral * Math.cos(p.heading), p.y, p.z - lateral * Math.sin(p.heading));
    v.yawAngle = p.heading;
    v.findNearestRoadSegment();
    v.speed = speed;
    return v;
}

describe('WorldPlaces on a straight synthetic road', () => {
    test('the places are in order, and the next one is the first that starts at or after s', () => {
        const { places } = world([FOUND, MAP]);
        expect(places.list.map(p => p.id)).toEqual(['p0', 'p1']);
        expect(places.next(0).id).toBe('p0');
        expect(places.next(200).id).toBe('p0');
        expect(places.next(200.1).id).toBe('p1');
        expect(places.next(0, Route.LEFT).id).toBe('p1');
        expect(places.next(401)).toBeNull();
        expect(places.at(210, -6).id).toBe('p0');
        expect(places.at(210, 6)).toBeNull();
    });

    test('a map place widens the verge on its own side only, tapered at each end; a found place widens nothing drawn', () => {
        const { route, ground } = world();
        const at = s => route.indexAt(s);
        expect(ground.vergeAt(at(220), -1)).toBeCloseTo(V + 4, 6);
        expect(ground.vergeAt(at(220), 1)).toBe(V);
        expect(ground.vergeAt(at(180), -1)).toBe(V);
        // 4 m into a 6 m taper, and half way between two rows
        expect(ground.vergeAt(at(204), -1)).toBeCloseTo(V + 4 * 4 / 6, 6);
        expect(ground.vergeAt(at(200), -1, 0.5)).toBeCloseTo(V + 4 * 2 / 6, 6);
        expect(ground.vergeAt(at(410), 1)).toBe(V);
        expect(ground.vergeAt(at(410), 1, 0, true)).toBeCloseTo(V + 2, 6);
        expect(ground.vergeAt(at(410), -1, 0, true)).toBe(V);
    });

    test('the ribbon draws the place with its own columns: the outer edge moves out, and no triangle is added', () => {
        const { route } = world();
        const from = route.indexAt(180), to = route.indexAt(260);
        const padded = RoadMesh.nearRibbon(rowsOf(route, from, to));
        const plain = RoadMesh.nearRibbon(rowsOf(route, from, to).map(r => ({ ...r, padN: 0, padP: 0 })));
        expect(padded.triangles).toBe(plain.triangles);
        const k = route.indexAt(220) - from;
        expect(padded.sides[k].l[0]).toBeCloseTo(-(5 + V + 4), 4);
        expect(padded.sides[k].r[0]).toBeCloseTo(5 + V, 4);
        expect(padded.sides[k].lc[0]).toBeCloseTo(-5, 4);
        // Every vertex of a row in the place says how deep it is and what it is made of
        const pad = padded.geometry.getAttribute('roadPad');
        expect([pad.getX(k * 7), pad.getY(k * 7), pad.getZ(k * 7)]).toEqual([4, 0, RoadSurface.PAD.asphalt]);
        expect(pad.getX(0)).toBe(0);
        // The edge works stand on the same edge at the lower level of detail
        const far = RoadMesh.farRibbon(rowsOf(route, from, to).map(r => ({ ...r, keep: true })));
        expect(far.sides[k].l[0]).toBeCloseTo(-(5 + V + 4), 4);
    });

    test('the physics ground on a map place is the drawn surface: the road\'s height out to the place\'s edge', () => {
        const env = world();
        // The land beside this road lies 3 m under it
        env.ground = new WorldGround(env.route, fakeData({ tiles: allTiles(-1, 0, -1, 2), shape: x => (Math.abs(x) <= 5 ? 100 : 97) }));
        for (const out of [0.5, 2, V + 3.9]) expect(env.ground.groundY(-(5 + out), 220)).toBeCloseTo(100, 6);
        expect(env.ground.groundY(-(5 + V + 4 + 1.5), 220)).toBeLessThan(99.5);
        // On the other side, and outside the place, the verge ends where it always did
        expect(env.ground.groundY(5 + V + 1.5, 220)).toBeLessThan(99.5);
        expect(env.ground.groundY(-(5 + V + 1.5), 150)).toBeLessThan(99.5);
    });

    test('in a place the strip is verge to the bike: no land rule runs there, and past it or beside it the land is land', () => {
        const env = world();
        const kindAt = (lateral, s) => {
            const v = bikeAt(env, lateral, s, 3);
            v.update(DT, 0, 0, 0, 0);
            return v.runoff ? 'land' : 'road or verge';
        };
        expect(kindAt(-(5 + V + 3), 220)).toBe('road or verge');
        expect(kindAt(-(5 + V + 5), 220)).toBe('land');
        expect(kindAt(5 + V + 3, 220)).toBe('land');
        expect(kindAt(5 + V + 1.5, 410)).toBe('road or verge');
        expect(kindAt(5 + V + 3, 410)).toBe('land');
        expect(kindAt(-(5 + V + 1.5), 410)).toBe('land');
    });

    test('a rider stops in each slot clear of the carriageway, the first to arrive at the far end, and stays up', () => {
        const env = world();
        for (const place of env.places.list) {
            expect(place.slots).toBeGreaterThan(2);
            const stops = [0, 1, 2].map(k => env.places.stopAt(place, k, env.ground, {}));
            expect(stops[0].s).toBeGreaterThan(stops[1].s);
            expect(stops[0].s - stops[1].s).toBeCloseTo(WorldPlaces.SLOT_M, 6);
            for (const stop of stops) {
                expect(stop.s).toBeGreaterThanOrEqual(place.s);
                expect(stop.s).toBeLessThanOrEqual(place.s + place.length);
                expect(Math.sign(stop.lateral)).toBe(place.side);
                expect(Math.abs(stop.lateral) - 5).toBeGreaterThanOrEqual(WorldPlaces.STAND_MIN_M);
                expect(Math.abs(stop.lateral) - 5).toBeLessThan(V + place.depth - 0.4);
                expect(stop.y).toBeCloseTo(100, 6);
            }
            // Braking to a stop along the strip from 8 m/s: no crash, never on the land
            const v = bikeAt(env, stops[2].lateral, place.s + (place.taper || 0) + 1, 8);
            let land = 0;
            for (let i = 0; i < 60 * 6 && v.speed > 0.05; i++) { v.update(DT, 0, 0, 1, 0); if (v.runoff) land++; }
            expect(v.crashed).toBe(false);
            expect(land).toBe(0);
        }
    });

    test('a place at a roadworks site or a gate is closed: it is not offered, and its ground stays ground', () => {
        const env = world();
        env.places.close([{ s0: 100, s1: 190 }]);
        expect(env.places.list.map(p => p.id)).toEqual(['p1']);
        expect(env.places.next(0).id).toBe('p1');
        expect(env.places.all).toHaveLength(2);
        expect(env.ground.vergeAt(env.route.indexAt(220), -1)).toBeCloseTo(V + 4, 6);
        // A stage holds only the places inside it
        const staged = new WorldPlaces([MAP, FOUND], env.route, { from: 300, to: 1000 });
        expect(staged.list.map(p => p.id)).toEqual(['p1']);
    });

    test('nothing is planted in a place: its strip is a road band to the scenery', () => {
        const { route } = world();
        const roads = new RoadClearance(route, null);
        const clear = (x, z) => roads.clearOfRoad(x, z, 0.3, 0.2);
        expect(clear(-(5 + V + 2), 220)).toBe(false);
        expect(clear(-(5 + V + 3.5), 220)).toBe(false);
        expect(clear(-(5 + V + 5), 220)).toBe(true);
        expect(clear(5 + V + 1, 220)).toBe(true);
        expect(clear(5 + V + 1, 410)).toBe(false);
        expect(clear(5 + V + 3, 410)).toBe(true);
    });
});

describe('the places of the Tremola slice', () => {
    let env;
    beforeAll(async () => {
        const { fetchFn } = diskFetch();
        env = await WorldEnvironment.load(new THREE.Scene(), { id: 'tremola', fetchFn, models: null, digest: async () => '0' });
    }, 120000);

    test('the data holds the summit car park from the map and found laybys and viewpoints for the rest, no gap over 1050 m', () => {
        const all = env.places.all;
        const map = all.filter(p => p.source === 'map'), found = all.filter(p => p.source === 'found');
        expect(map).toHaveLength(1);
        expect(map[0]).toMatchObject({ kind: 'carpark', side: Route.RIGHT, surface: 'asphalt', name: null });
        expect(map[0].s).toBeGreaterThan(12500);
        expect(map[0].s + map[0].length).toBeLessThan(12640);
        expect(found.length).toBeGreaterThanOrEqual(15);
        // A found place is a pull-in 3.7 m past the carriageway's edge with a taper at each end, gravel or asphalt by kind
        const surface = { layby: 'gravel', viewpoint: 'asphalt' };
        for (const p of found) {
            expect(['layby', 'viewpoint']).toContain(p.kind);
            expect(p).toMatchObject({ surface: surface[p.kind], name: null, depth: 2.6, taper: 6 });
            expect(WorldPlaces.drawn(p)).toBe(true);
            expect(p.slots).toBeGreaterThanOrEqual(4);
        }
        const kinds = all.reduce((n, p) => ({ ...n, [p.kind]: (n[p.kind] || 0) + 1 }), {});
        console.log(`places of the Tremola slice by kind: ${JSON.stringify(kinds)}; open ${env.places.list.length}`);
        expect(kinds.viewpoint).toBeGreaterThanOrEqual(2);
        expect(kinds.layby).toBeGreaterThanOrEqual(5);
        const at = [0, ...all.map(p => p.s), env.route.length];
        // (1 049 m from s 8 166 to 9 214: the ride has no level, unwalled verge between)
        for (let k = 1; k < at.length; k++) expect(at[k] - at[k - 1]).toBeLessThanOrEqual(1050);
        for (let k = 1; k < all.length; k++) expect(all[k].s).toBeGreaterThan(all[k - 1].s + all[k - 1].length);
    });

    test('no open place stands in a roadworks site or at a gate, and the car park is open', () => {
        const sites = env.roadworks.sites;
        for (const place of env.places.list) {
            for (const site of sites) expect(place.s > site.s1 + WorldPlaces.WORKS_CLEAR_M || place.s + place.length < site.s0 - WorldPlaces.WORKS_CLEAR_M).toBe(true);
        }
        expect(env.places.list.some(p => p.source === 'map')).toBe(true);
        // The works close a few: the open ones are still no more than 1 700 m apart (1 660 m from s 8 182 to 9 842,
        // over the stacked hairpins, where the only place, at s 9 210, is in a site)
        expect(env.places.list.length).toBeGreaterThanOrEqual(15);
        const open = [env.startS, ...env.places.list.map(p => p.s), env.endS];
        for (let k = 1; k < open.length; k++) expect(open[k] - open[k - 1]).toBeLessThanOrEqual(1700);
        let s = 0, seen = 0;
        for (let place = env.places.next(s); place; place = env.places.next(s)) { seen++; s = place.s + 0.01; }
        expect(seen).toBe(env.places.list.length);
    });

    test('at every place a rider stands on the drawn ground beside the carriageway, at rest and braking in, with nothing planted there', async () => {
        const problems = [];
        for (const place of env.places.all) {
            const mid = env.route.sample(place.s + place.length / 2, {});
            env.lastBike = { x: mid.x, z: mid.z };
            await env.streamer.settle({ x: mid.x, z: mid.z }, place.s);
            const say = m => problems.push(`${place.id} (${place.source}) at s ${place.s}: ${m}`);
            for (let k = 0; k < Math.min(3, place.slots); k++) {
                const stop = env.places.stopAt(place, k, env.ground, {});
                const p = env.route.sample(stop.s, {});
                const loc = {};
                const y = env.ground.groundY(stop.x, stop.z, null, false, loc);
                if (Math.abs(loc.lateral) - p.width / 2 < WorldPlaces.STAND_MIN_M - 0.05) say(`slot ${k} is ${(Math.abs(loc.lateral) - p.width / 2).toFixed(2)} m from the carriageway`);
                // A drawn place is the road's own surface (a layby cut into a bank has the 8 m land triangles up to
                // 0.05 m over it near its back: verify.mjs places holds them under 0.15); a found verge of the first
                // imports the verge and the level land beside it
                const off = Math.abs(y - loc.roadY);
                if (off > (WorldPlaces.drawn(place) ? 0.05 : 0.5)) say(`slot ${k} stands ${off.toFixed(2)} m off the road's height`);
                const zone = env.ground.zoneAt(loc, p.width / 2);
                if (zone.kind === 'wall' || zone.kind === 'fall') say(`slot ${k} is a ${zone.kind}`);
                const v = bikeAt(env, stop.lateral, stop.s, 0);
                for (let i = 0; i < 90; i++) v.update(DT, 0, 0, 0, 0);
                if (v.crashed || v.runoff) say(`a bike at rest in slot ${k} ${v.crashed ? 'crashed' : 'is on the land'}`);
            }
            if (place.slots < 2) say(`holds ${place.slots} bikes`);
            const last = env.places.stopAt(place, Math.min(2, place.slots - 1), env.ground, {});
            // (a found place's strip is whole from its first sample of the ride to its last: 4 m in at the most)
            const v = bikeAt(env, last.lateral, place.s + (place.taper || 0) + 4.5, 7);
            let land = 0;
            for (let i = 0; i < 60 * 6 && v.speed > 0.05; i++) { v.update(DT, 0, 0, 1, 0); if (v.runoff) land++; }
            if (v.crashed) say('a bike braking along it crashed');
            if (land) say(`a bike braking along it was on the land for ${land} steps`);
            // Scenery in the strip: every tree, boulder, marker stone and tuft the tiles here drew
            for (const t of sceneryOf(THREE, env.sceneryGroup)) {
                if (!['tree', 'boulder', 'stone', 'tuft'].includes(t.type)) continue;
                const at = env.route.project(t.x, t.z, null, {});
                if (at.s < place.s || at.s > place.s + place.length || Math.sign(at.lateral) !== place.side) continue;
                const past = Math.abs(at.lateral) - at.width / 2;
                if (past < V + place.depth) say(`a ${t.type} stands ${past.toFixed(2)} m past the edge, in the strip`);
            }
        }
        if (problems.length) throw new Error(problems.join('\n'));
    }, 600000);

    test.each(['carpark', 'layby', 'viewpoint'])('a %s is drawn: the ribbon reaches its edge, the ground under a bike is the ribbon, and no land stands over it', async (kind) => {
        const place = env.places.all.find(p => p.kind === kind);
        expect(place).toBeTruthy();
        const mid = env.route.sample(place.s + place.length / 2, {});
        await env.streamer.settle({ x: mid.x, z: mid.z }, place.s);
        const from = env.route.indexAt(place.s) - 1, to = env.route.indexAt(place.s + place.length) + 2;
        const rows = env.rowsOf(from, to);
        const ribbon = RoadMesh.nearRibbon(rows);
        const key = place.side > 0 ? 'r' : 'l', inner = place.side > 0 ? 'rc' : 'lc';
        let deepest = 0;
        rows.forEach((row, k) => {
            const pad = WorldPlaces.padOf(place, row.s);
            const side = ribbon.sides[k];
            const reach = Math.hypot(side[key][0] - side[inner][0], side[key][2] - side[inner][2]);
            expect(reach).toBeCloseTo(V + pad, 2);
            deepest = Math.max(deepest, reach);
            if (pad <= 0) return;
            // Across the place: the physics ground is the ribbon's height, and the land is not over it
            for (const share of [0.25, 0.5, 0.75, 0.97]) {
                const x = side[inner][0] + (side[key][0] - side[inner][0]) * share, z = side[inner][2] + (side[key][2] - side[inner][2]) * share;
                expect(Math.abs(env.ground.groundY(x, z) - (side[key][1] - RoadMesh.LIFT_M))).toBeLessThan(0.05);
                const land = env.ground.tileHeight(x, z);
                expect(land).not.toBeNull();
                expect(land - row.y).toBeLessThan(0.15);
            }
        });
        expect(deepest).toBeCloseTo(V + place.depth, 2);
        // The same rows without the place draw the same number of triangles
        expect(RoadMesh.nearRibbon(rows.map(r => ({ ...r, padN: 0, padP: 0 }))).triangles).toBe(ribbon.triangles);
    }, 120000);

    test('a car park\'s bay lines lie on its hard standing, never on the verge\'s gravel or grass', () => {
        const parks = env.places.list.filter(p => p.kind === 'carpark');
        expect(parks.length).toBeGreaterThan(0);
        for (const place of parks) {
            const lines = env.placeMesh.bayLines(place);
            expect(lines.length).toBeGreaterThan(1);
            for (const line of lines) {
                const half = env.route.sample(line.s, {}).width / 2;
                expect(line.inner).toBeGreaterThan(half);
                expect(line.outer).toBeLessThanOrEqual(half + WorldPlaces.padOf(place, line.s));
            }
        }
    });

    test('every open place has its props, off the carriageway and clear of the slots the riders wait in, solid to the bike, for a few triangles', () => {
        const props = env.placeMesh;
        expect(props).toBeInstanceOf(PlaceMesh);
        const byPlace = new Map(props.parts.map(part => [part.place, part]));
        const want = { viewpoint: ['stone edge', 'bench'], layby: ['marker post', 'waste bin'], carpark: ['waste bin'] };
        const problems = [];
        for (const place of env.places.list) {
            const say = m => problems.push(`${place.id} (${place.kind}) at s ${place.s}: ${m}`);
            if (!byPlace.has(place.id)) { say('has no props'); continue; }
            const mine = props.solids.filter(w => { const at = env.route.project(w.x, w.z, null, {}); return at.s >= place.s - 1 && at.s <= place.s + place.length + 1 && Math.sign(at.lateral) === place.side; });
            for (const label of want[place.kind]) if (!mine.some(w => w.label === label)) say(`has no ${label}`);
            // The slots: a waiting bike's box reaches this far out (WorldPlaces.stopAt, 0.8 m wide)
            const stop = env.places.stopAt(place, 0, null, {});
            const slotOut = Math.abs(stop.lateral) + 0.4;
            for (const w of mine) {
                const at = env.route.project(w.x, w.z, null, {});
                const inner = Math.abs(at.lateral) - w.across / 2;
                if (inner < at.width / 2 + V) say(`its ${w.label} reaches ${(inner - at.width / 2).toFixed(2)} m from the carriageway's edge`);
                if (inner < slotOut + 0.2 && at.s > stop.s - 2 - WorldPlaces.SLOT_M * (place.slots - 1) && at.s < stop.s + 2) say(`its ${w.label} stands in the slots`);
                // Solid: the bike's own test of a house's walls finds it
                if (env.scenery.houseAt(w.x, w.z, 0) !== w) say(`its ${w.label} is not solid`);
            }
        }
        if (problems.length) throw new Error(problems.join('\n'));
        // A bike riding into a bench crashes and the cause names it
        const bench = props.solids.find(w => w.label === 'bench');
        if (bench) expect(env.scenery.houseAt(bench.x, bench.z, 0.3).label).toBe('bench');
        console.log(`place props: ${props.parts.length} places, ${props.total} triangles, ${props.solids.length} solid things`);
        expect(props.total).toBeLessThan(15000);
        expect(props.total / props.parts.length).toBeLessThan(800);
        // Drawn as one mesh of the places near the bike: at a place, a few places' triangles
        const place = env.places.list.find(p => p.kind === 'viewpoint');
        const at = env.route.sample(place.s, {});
        props.update({ x: at.x, z: at.z });
        expect(props.mesh).toBeTruthy();
        expect(props.mesh.userData.places).toContain(place.id);
        // (2 000 until the props had round posts, tubes, slats and chamfers: Scenery.TRIANGLE_CAP pays the 1 000 more)
        expect(props.triangles).toBeLessThan(3000);
        expect(props.mesh.geometry.attributes.position.count / 3).toBe(props.triangles);
    });
});
