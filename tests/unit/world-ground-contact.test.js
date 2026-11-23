/**
 * @jest-environment node
 */
// The bike stands on the drawn ground (Vehicle.groundPose; .agent/system/handling.md, "The bike stands on the ground").
// The owner: "the player body (and bike?) should remain normal to the ground so they are correctly orientated on a slope
// and don't sink into the ground".
//
// The bike drew its pitch from the route's grade at its station, whichever way it faced, and its height from one point
// under its middle, eased: on the steepest grade of the shipped stage, stopped facing down it, its rear tyre stood 0.20 m
// in the road and it was pitched 14 degrees off the road; across it, 7 degrees. On each world (the shipped stage and the
// synthetic fixture world), on the steepest grade of its road and the steepest open land beside it, facing up, down and
// across, moving and stopped, every frame is read from what is drawn (tests/helpers/ground-contact.js): the ground by a
// ray down onto the drawn road, verge, fill and land, the wheels and the boot from their own vertices.
//   - no point of a tyre is more than UNDER_M in the ground, and each tyre's nearest point is within GAP_M of it
//   - the bike's forward axis lies along the ground and its up axis is the ground's normal, bar the lean it is drawn
//     with, within ANGLE_DEG
//   - stopped, the rider's foot is down: no point of the boot more than UNDER_M in the ground, the nearest within FOOT_M
// A wheelie there turns about the rear axle on the ground, and a bike at the edge of a bridge deck reads the land 40 m
// under it as a face, not as ground.
// On the land the drawn tile stands up to TerrainMesh.SINK_M under the land the physics reads, beside a node the importer
// carved for a road (TerrainMesh.heightAt reads the tile's own heights), so a wheel may stand that much more over it.
import { describe, test, expect, beforeAll } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';
import { groundMeshes, steepest, steepestLand, standAt, measureBike, wheelContact } from '../helpers/ground-contact.js';
import { samplesOf, fakeData, allTiles, straight } from '../helpers/world-synthetic.js';

const game = loadGame(undefined, []);
const { THREE, WorldEnvironment, TerrainMesh, WorldPhysics, WorldRoute, WorldGround, Vehicle, RoadMesh } = game;

const UNDER_M = 0.01, GAP_M = 0.04, FOOT_M = 0.03, ANGLE_DEG = 1;
const LAND_GAP_M = GAP_M + TerrainMesh.SINK_M, LAND_FOOT_M = FOOT_M + TerrainMesh.SINK_M;
// The open land is looked for every LAND_EVERY m of the ride, LAND_OUTS m past the verge, under LAND_MOST (rise over
// run): the steepest place where the physics lets the bike stand and ride all six ways is the one read. The crash rules
// read the land 1.5 m ahead (Vehicle.worldLand), so a place on open land by the tile's zones can still be a drop or a
// slope too steep to hold, or by a parapet
const LAND_MOST = 0.7, LAND_EVERY = 100, LAND_OUTS = [3, 5, 8, 12], LAND_TRIES = 30;
const WORLDS = [['the shipped stage', 'tremola', ''], ['the synthetic fixture world', 'all', '?worldData=tests/fixtures/world/mini']];
const WAYS = ['uphill', 'downhill', 'across'];

async function loadWorld(id, search) {
    const scene = new THREE.Scene();
    const { fetchFn } = diskFetch();
    const env = await WorldEnvironment.load(scene, { id, search, fetchFn, models: null, digest: async () => '0' });
    const settle = async (s) => {
        const p = env.route.sample(s, {});
        env.update(p, s, null, Infinity);
        await env.streamer.settle(p, s);
        return p;
    };
    return { scene, env, settle };
}

// Each way up, down and across from `up` (radians, facing up the slope), moving at `pace` and stopped: what is measured
async function rides(world, at, s, up, pace) {
    const { scene, env, settle } = world;
    await settle(s);
    const meshes = groundMeshes(scene);
    const out = [];
    WAYS.forEach((way, k) => {
        const heading = up + [0, Math.PI, Math.PI / 2][k];
        for (const speed of [pace, 0]) {
            // Across the road a moving bike is read before it reaches the verge
            const frames = speed ? (way === 'across' ? 12 : 30) : 45;
            const v = standAt(game, env, { x: at.x, y: at.y, z: at.z, heading, speed, frames });
            out.push({ name: `${way} ${speed ? `at ${speed} m/s` : 'stopped'}`, speed, v, ...measureBike(game, meshes, v) });
        }
    });
    return out;
}

const r3 = x => Math.round(x * 1000) / 1000;
const report = rows => rows.map(r => `${r.name}${r.crashed ? ` (crashed: ${r.v.crashCause})` : ''}: under ${r3(r.under)}, gap ${r3(r.gap)}, pitch ${r3(r.pitch)}, roll ${r3(r.roll)}${r.footUnder === null ? '' : `, foot under ${r3(r.footUnder)} gap ${r3(r.footGap)}`}`).join('\n');

describe.each(WORLDS)('the bike on the ground of %s', (name, id, search) => {
    let world;
    beforeAll(async () => { world = await loadWorld(id, search); }, 600000);

    test('on the steepest grade of the road, up, down and across it, moving and stopped', async () => {
        const best = steepest(world.env);
        expect(Math.abs(best.grade)).toBeGreaterThan(0.08);
        const p = world.env.route.sample(best.s, {});
        const rows = await rides(world, p, best.s, best.grade > 0 ? p.heading : p.heading + Math.PI, 8);
        console.log(`${name}, the road at s ${best.s}, grade ${r3(best.grade)}:\n${report(rows)}`);
        for (const r of rows) {
            expect([r.name, r.crashed]).toEqual([r.name, false]);
            expect([r.name, r.under <= UNDER_M]).toEqual([r.name, true]);
            expect([r.name, r.gap <= GAP_M]).toEqual([r.name, true]);
            expect([r.name, Math.abs(r.pitch) <= ANGLE_DEG, Math.abs(r.roll) <= ANGLE_DEG]).toEqual([r.name, true, true]);
            if (r.speed) continue;
            expect([r.name, r.footUnder !== null]).toEqual([r.name, true]);
            expect([r.name, r.footUnder <= UNDER_M, r.footGap <= FOOT_M]).toEqual([r.name, true, true]);
        }
    }, 900000);

    test('on the steepest open land beside the road, up, down and across it, moving and stopped', async () => {
        const places = await steepestLand(world.env, world.settle, { most: LAND_MOST, every: LAND_EVERY, outs: LAND_OUTS });
        let land = null, rows = null, tried = 0;
        for (const place of places.slice(0, LAND_TRIES)) {
            tried++;
            rows = await rides(world, place, place.s, place.heading, 4);
            if (rows.every(r => !r.crashed)) { land = place; break; }
        }
        expect(land).not.toBeNull();
        expect(land.slope).toBeGreaterThan(0.3);
        console.log(`${name}, the land at (${r3(land.x)}, ${r3(land.z)}), slope ${r3(land.slope)}, the steepest of ${places.length} places the bike stands on all six ways (${tried - 1} steeper did not):\n${report(rows)}`);
        for (const r of rows) {
            expect([r.name, r.crashed]).toEqual([r.name, false]);
            expect([r.name, r.under <= UNDER_M]).toEqual([r.name, true]);
            expect([r.name, r.gap <= LAND_GAP_M]).toEqual([r.name, true]);
            expect([r.name, Math.abs(r.pitch) <= ANGLE_DEG, Math.abs(r.roll) <= ANGLE_DEG]).toEqual([r.name, true, true]);
            if (r.speed) continue;
            expect([r.name, r.footUnder !== null]).toEqual([r.name, true]);
            expect([r.name, r.footUnder <= UNDER_M, r.footGap <= LAND_FOOT_M]).toEqual([r.name, true, true]);
        }
    }, 1800000);

    test('a wheelie on the steepest grade turns about the rear axle where the ground puts it', async () => {
        const best = steepest(world.env);
        const p = await world.settle(best.s);
        const meshes = groundMeshes(world.scene);
        for (const heading of [p.heading, p.heading + Math.PI]) {
            const v = standAt(game, world.env, { x: p.x, y: p.y, z: p.z, heading, speed: 8, frames: 30 });
            const level = v.group.rotation.x;
            v.isWheelie = true;
            v.wheelieAngle = 0.4;
            v.updateMesh();
            const rear = wheelContact(game, meshes, v.rearWheel);
            const front = wheelContact(game, meshes, v.frontWheel);
            expect(rear.under).toBeLessThanOrEqual(UNDER_M);
            expect(rear.gap).toBeLessThanOrEqual(GAP_M);
            expect(front.gap).toBeGreaterThan(0.2);
            expect(v.group.rotation.x).toBeCloseTo(level - 0.4, 2);
        }
    }, 600000);
});

// Ground read over a face beside the bike is not ground under it: past the edge of a bridge's deck the drawn ground is
// the land 40 m under it (what a parapet, a wall or the lip of a drop reads as). A bike at the deck's edge stands
// square to its deck, with the face to its left or to its right
describe('a face beside the bike', () => {
    test('at the edge of a bridge deck, with the land 40 m under it beside the bike, it stands square to the deck', () => {
        const route = new WorldRoute(samplesOf(straight(400), { flags: WorldRoute.FLAG.bridge }), {});
        const ground = new WorldGround(route, fakeData({ tiles: allTiles(-1, 0, -1, 1), shape: () => 60, zone: x => (Math.abs(x) <= 5 ? 1 : 0) }));
        for (const heading of [0, Math.PI]) {
            const v = new Vehicle(new THREE.Scene(), null, game.CHARACTERS[0], undefined, { model: false });
            v.environment = { physics: WorldPhysics, route, ground };
            v.position.set(4.8, 100, 200);
            v.yawAngle = heading;
            v.findNearestRoadSegment();
            v.speed = 8;
            v.updateMesh();
            expect(ground.drawnY(ground.locate(5.2, 200, null, {}))).toBeLessThan(61);
            expect(Math.abs(v.groundTilt)).toBeLessThan(1e-9);
            expect(Math.abs(v.group.rotation.x)).toBeLessThan(1e-9);
            expect(v.group.position.y).toBeCloseTo(100 + RoadMesh.LIFT_M, 9);
        }
    });
});
