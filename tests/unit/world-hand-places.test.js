// The stopping places laid by hand (WorldPlaces.HAND): each is a place as the importer's are (drawn in the ribbon's
// own columns, the road's height out to its edge, verge to the bike), on land the importer already benched level with
// the road, so nothing is re-imported. On the streamed stage that holds it: the place is open and stands where it was
// asked for, no land stands over it, the physics ground is the ribbon, a rider waits in its slots and brakes along it
// on hard standing, nothing is planted on it, its angled bays lie on its hard standing, and its props are solid.
import { describe, test, expect, beforeAll } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';
import { sceneryOf } from '../helpers/world-clearance.js';

const DT = 1 / 60;
const game = loadGame();
const { THREE, WorldEnvironment, WorldPlaces, PlaceMesh, RoadMesh, RoadSurface, TerrainMesh, Vehicle } = game;
const V = RoadSurface.VERGE_M;

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

// Where (x, z) lies along a place's own stretch of the ride: {s, lateral}. Not WorldRoute.project, which takes the
// nearer leg where a place lies in a hairpin's tongue, closer to the other leg than to its own
function onPlace(env, place, x, z) {
    let best = null;
    for (let s = place.s - 2; s <= place.s + place.length + 2; s += 0.1) {
        const p = env.route.sample(s, {});
        const dx = x - p.x, dz = z - p.z, along = dx * Math.sin(p.heading) + dz * Math.cos(p.heading);
        if (!best || Math.abs(along) < best.along) best = { along: Math.abs(along), s, lateral: dx * Math.cos(p.heading) - dz * Math.sin(p.heading), width: p.width };
    }
    return best.along < 0.2 ? best : { s: -Infinity, lateral: 0, width: 0 };
}

const stages = [...new Set(WorldPlaces.HAND.map(p => p.stage))];

describe.each(stages)('the hand-laid places of %s', (stage) => {
    let env;
    const hand = () => env.places.all.filter(p => p.source === 'hand');
    beforeAll(async () => {
        const { fetchFn } = diskFetch();
        env = await WorldEnvironment.load(new THREE.Scene(), { id: stage, fetchFn, models: null, digest: async () => '0' });
    }, 120000);

    test('each is open and offered to the group, and the hairpin car park stands on the inside of its hairpin, past the apex on a straight', () => {
        const mine = WorldPlaces.HAND.filter(p => p.stage === stage);
        expect(hand().map(p => p.id)).toEqual(mine.map(p => p.id));
        for (const place of hand()) {
            expect(place.open).toBe(true);
            expect(env.places.list).toContain(place);
            expect(env.places.next(place.s - 50, place.side)).toBe(place);
            expect(place.slots).toBeGreaterThanOrEqual(8);
            if (place.kind !== 'carpark') continue;
            // The hairpin it belongs to ends at most 60 m before it, turns toward its side, and the pad's road bends
            // no more than a straight's few degrees (a radius of 300 m or more)
            const pin = env.route.hairpins().find(h => place.s - h.s1 >= 0 && place.s - h.s1 <= 60);
            expect(pin).toBeTruthy();
            expect(pin.sign).toBe(place.side);
            const turn = Math.abs(env.route.sample(place.s + place.length, {}).heading - env.route.sample(place.s, {}).heading);
            expect(turn).toBeLessThan(place.length / 300);
        }
    });

    test('each is drawn: the ribbon reaches its edge, the ground under a bike is the ribbon, and no land stands over it', async () => {
        for (const place of hand()) {
            const mid = env.route.sample(place.s + place.length / 2, {});
            await env.streamer.settle({ x: mid.x, z: mid.z }, place.s);
            const from = env.route.indexAt(place.s) - 1, to = env.route.indexAt(place.s + place.length) + 2;
            const rows = env.rowsOf(from, to);
            const ribbon = RoadMesh.nearRibbon(rows);
            const key = place.side > 0 ? 'r' : 'l', inner = place.side > 0 ? 'rc' : 'lc';
            let deepest = 0, worst = -Infinity;
            const hint = { start: env.route.indexAt(place.s - 30), end: env.route.indexAt(place.s + place.length + 30) };
            rows.forEach((row, k) => {
                const pad = WorldPlaces.padOf(place, row.s);
                const side = ribbon.sides[k];
                // (a row past the place may have a verge of its own: the one before a portal is narrower)
                if (pad <= 0) return;
                const reach = Math.hypot(side[key][0] - side[inner][0], side[key][2] - side[inner][2]);
                expect(reach).toBeCloseTo(V + pad, 2);
                deepest = Math.max(deepest, reach);
                // Across the place, every 0.25 m: the physics ground is the ribbon's height, and the land is carved
                // and not over it (the land of a carved node is drawn TerrainMesh.SINK_M under its height)
                for (let share = 0.02; share <= 1.0001; share += 0.25 / reach) {
                    const x = side[inner][0] + (side[key][0] - side[inner][0]) * share, z = side[inner][2] + (side[key][2] - side[inner][2]) * share;
                    const ribbonY = side[inner][1] + (side[key][1] - side[inner][1]) * share - RoadMesh.LIFT_M;
                    // (with the bike's own hint: its stretch of the ride, not the other leg of the hairpin)
                    expect(Math.abs(env.ground.groundY(x, z, hint) - ribbonY)).toBeLessThan(0.05);
                    const land = env.ground.tileHeight(x, z);
                    expect(land).not.toBeNull();
                    const drawn = TerrainMesh.carved(env.ground.tileZone(x, z)) ? land - TerrainMesh.SINK_M : land;
                    worst = Math.max(worst, drawn - row.y);
                }
            });
            expect(worst).toBeLessThan(0.02);
            expect(deepest).toBeCloseTo(V + place.depth, 2);
            expect(RoadMesh.nearRibbon(rows.map(r => ({ ...r, padN: 0, padP: 0 }))).triangles).toBe(ribbon.triangles);
        }
    }, 120000);

    test('a rider waits in its slots and brakes along it on the hard standing, and nothing is planted there', async () => {
        const problems = [];
        for (const place of hand()) {
            const mid = env.route.sample(place.s + place.length / 2, {});
            env.lastBike = { x: mid.x, z: mid.z };
            await env.streamer.settle({ x: mid.x, z: mid.z }, place.s);
            const say = m => problems.push(`${place.id} at s ${place.s}: ${m}`);
            for (let k = 0; k < place.slots; k++) {
                const stop = env.places.stopAt(place, k, env.ground, {});
                const loc = {};
                const y = env.ground.groundY(stop.x, stop.z, null, false, loc);
                if (Math.abs(y - loc.roadY) > 0.05) say(`slot ${k} stands ${Math.abs(y - loc.roadY).toFixed(2)} m off the road's height`);
                const v = bikeAt(env, stop.lateral, stop.s, 0);
                for (let i = 0; i < 90; i++) v.update(DT, 0, 0, 0, 0);
                if (v.crashed || v.runoff) say(`a bike at rest in slot ${k} ${v.crashed ? 'crashed' : 'is on the land'}`);
            }
            // Pulling in from the carriageway at 7 m/s and braking to a stop along the pad
            const last = env.places.stopAt(place, place.slots - 1, env.ground, {});
            const v = bikeAt(env, last.lateral, place.s + place.taper + 1, 7);
            let land = 0;
            for (let i = 0; i < 60 * 6 && v.speed > 0.05; i++) { v.update(DT, 0, 0, 1, 0); if (v.runoff) land++; }
            if (v.crashed) say('a bike braking along it crashed');
            if (land) say(`a bike braking along it was on the land for ${land} steps`);
            for (const t of sceneryOf(THREE, env.sceneryGroup)) {
                if (!['tree', 'boulder', 'stone', 'tuft'].includes(t.type)) continue;
                const at = onPlace(env, place, t.x, t.z);
                if (at.s < place.s || at.s > place.s + place.length || Math.sign(at.lateral) !== place.side) continue;
                const past = Math.abs(at.lateral) - at.width / 2;
                if (past < V + WorldPlaces.padOf(place, at.s)) say(`a ${t.type} stands ${past.toFixed(2)} m past the edge, on the pad`);
            }
        }
        if (problems.length) throw new Error(problems.join('\n'));
    }, 600000);

    test('its angled bays lie on the hard standing in front of the stone course, and its props are solid and out of the slots', () => {
        const props = env.placeMesh;
        for (const place of hand()) {
            const part = props.parts.find(p => p.place === place.id);
            expect(part).toBeTruthy();
            if (place.bays) {
                const lines = props.echelonLines(place);
                expect(lines.length).toBeGreaterThanOrEqual(6);
                const angle = place.bays.angleDeg * Math.PI / 180;
                for (const line of lines) {
                    for (const end of [-1, 1]) {
                        const s = line.s + end * line.length / 2 * Math.cos(angle);
                        const lateral = Math.abs(line.lateral) + end * line.length / 2 * Math.sin(angle);
                        const half = env.route.sample(s, {}).width / 2;
                        expect(s).toBeGreaterThanOrEqual(place.s + place.taper - 0.01);
                        expect(s).toBeLessThanOrEqual(place.s + place.length - place.taper + 0.01);
                        expect(lateral).toBeGreaterThan(half + 1);
                        expect(lateral).toBeLessThanOrEqual(half + V + WorldPlaces.padOf(place, s) - PlaceMesh.BACK_M + 0.01);
                    }
                }
            }
            const mine = props.solids.filter(w => { const at = onPlace(env, place, w.x, w.z); return at.s >= place.s - 1 && at.s <= place.s + place.length + 1 && Math.sign(at.lateral) === place.side; });
            const want = ['waste bin', ...(place.edge === 'stone' ? ['stone edge'] : []), ...(place.bench ? ['bench'] : [])];
            for (const label of want) expect(mine.some(w => w.label === label)).toBe(true);
            const stop = env.places.stopAt(place, 0, null, {});
            for (const w of mine) {
                const at = onPlace(env, place, w.x, w.z);
                expect(Math.abs(at.lateral) - w.across / 2).toBeGreaterThan(Math.abs(stop.lateral) + 0.6);
                expect(env.scenery.houseAt(w.x, w.z, 0)).toBe(w);
            }
        }
    });
});
