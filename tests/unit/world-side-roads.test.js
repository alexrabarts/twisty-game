/**
 * @jest-environment node
 */
// A side road is open. The red-and-white barriers that closed each side road a few metres past its junction are gone,
// drawn and solid (the owner: "I don't like the angled barriers- just remove them?"), so the off-route rule
// (WorldGuide) brings back a rider who turns off the ride: more than Route.OFF_ROUTE_M from the ride shows "Wrong way"
// (as does riding against the ride for WorldGuide.REVERSE_WARN_S), and WorldGuide.RESTART_AFTER_S after that first
// warning the rider is put back where the bike left the road, 5 s down ("Off route, back on the road +5 s").
//
// The Tremola slice is streamed in node and a real Vehicle is ridden into every side road that leaves a ride junction
// at 10 m/s, from 40 m before the junction, along the side road and on through the roads it meets (the straightest
// one at each node), straight on over the land where they end. Held here:
//   - nothing of a barrier is in the scene once the bike has been at every junction
//   - a rider who keeps to the roads is put back by the rule, 10 s after the first warning and within RESTART_M of
//     the junction (the most: a side road at km 6.1 runs toward the next leg of the ride, within 40 m of it for 120 m)
//   - the bike stays on the land the world has in detail (WorldGround.mapped) until then, so it never rides off the
//     end of a drawn road into nothing, and nothing stops it on a road: a crash is on the land, by a drawn cause (a
//     turn too sharp for 10 m/s onto a steep bank)
// Before the barriers went, a rider on four of these roads met a wall or a drop that nothing drew, within the stub:
// the physics read the zone 2 to 7 m from the bike (WorldGround.framePoint, Vehicle.checkWallCollision), took a side
// road that runs down behind the ride's wall for that wall, and read the ride's wall 88 m out (WORKS_REACH_M).
import { describe, test, expect, beforeAll } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';
import { stagesFor } from '../helpers/world-stages.js';
import { diskFetch } from '../helpers/world-fetch.js';

const DT = 1 / 60, G = 9.81, SPEED = 10;
// Metres along the way from the junction by which the rule has put the rider back (the most measured: 216)
const RESTART_M = 250;

const log = [];
const game = loadGame(undefined, log);
const { THREE, WorldEnvironment, WorldGuide, Route, Vehicle } = game;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

// The way a rider who keeps to the side road goes: the ride's last 40 m before the junction, the side road, and at each
// node the road that goes on straightest (never the ride), then straight on for 400 m where none does. Each point
// carries `m`, the metres along the way from the junction (negative before it)
function wayFrom(env, junction, pass, edgeId) {
    const graph = env.graph, route = env.route;
    const way = [];
    for (let s = Math.max(0, pass.sIn - 40); s < pass.sIn; s += 2) {
        const p = route.sample(s, {});
        way.push({ x: p.x, z: p.z, m: s - pass.sIn, road: 'ride' });
    }
    const node0 = route.sample(pass.sIn, {});
    way.push({ x: node0.x, z: node0.z, m: 0, road: 'ride' });
    let edge = graph.edge(edgeId), node = junction.node, m = 0;
    const used = new Set();
    while (edge && m < 800) {
        used.add(edge.id);
        const e = graph.samples(edge.id);
        if (!e) break;
        const forward = edge.a === node;
        for (let j = 1; j < edge.count; j++) {
            const i = forward ? j : edge.count - 1 - j;
            const last = way[way.length - 1];
            m += Math.hypot(e.x[i] - last.x, e.z[i] - last.z);
            way.push({ x: e.x[i], z: e.z[i], m, road: edge.id });
        }
        node = forward ? edge.b : edge.a;
        const last = way[way.length - 1], prior = way[way.length - 2];
        const heading = Math.atan2(last.x - prior.x, last.z - prior.z);
        let best = null;
        for (const next of graph.edges) {
            if (used.has(next.id) || graph.rideEdgeIds.has(next.id) || (next.a !== node && next.b !== node)) continue;
            const n = graph.samples(next.id);
            if (!n || next.count < 2) continue;
            const [i0, i1] = next.a === node ? [0, 1] : [next.count - 1, next.count - 2];
            const turn = Math.abs(wrap(Math.atan2(n.x[i1] - n.x[i0], n.z[i1] - n.z[i0]) - heading));
            if (!best || turn < best.turn) best = { next, turn };
        }
        edge = best ? best.next : null;
    }
    const last = way[way.length - 1], prior = way[way.length - 2];
    const heading = Math.atan2(last.x - prior.x, last.z - prior.z);
    for (let d = 4; d <= 400; d += 4) way.push({ x: last.x + d * Math.sin(heading), z: last.z + d * Math.cos(heading), m: m + d, road: 'land' });
    return way;
}

// Rides `way` at SPEED with the guide's rule running, as Game runs it: {warnedM, warnedT, cause, restartM, restartT,
// crash, crashM, onRoad, unmapped, sideM}: where along the way and when the first warning came and the restart fired,
// the first crash line, where and whether it was on a road, the first place off the mapped land, and the last metre
// ridden on a side road
async function rideWay(env, way) {
    const route = env.route;
    const v = new Vehicle(new THREE.Scene(), null);
    v.environment = env;
    const a = way[0], b = way[1];
    v.position.set(a.x, route.sample(0, {}).y, a.z);
    v.yawAngle = Math.atan2(b.x - a.x, b.z - a.z);
    v.findNearestRoadSegment();
    v.position.y = env.ground.groundY(a.x, a.z, null, false, {});
    v.speed = SPEED;
    env.guide.reset();
    let reason = null;
    env.guide.onRestart = why => { reason = why; };
    log.length = 0;
    const out = { warnedM: null, warnedT: null, cause: null, restartM: null, restartT: null, crash: null, unmapped: null, sideM: 0 };
    let k = 0, settled = { x: a.x, z: a.z };
    await env.streamer.settle(settled, v.projection.s);
    for (let tick = 0; tick < 60 * 90; tick++) {
        const here = v.position;
        for (let j = k; j < Math.min(way.length, k + 60); j++) if (Math.hypot(way[j].x - here.x, way[j].z - here.z) < Math.hypot(way[k].x - here.x, way[k].z - here.z)) k = j;
        const m = way[k].m;
        if (Math.hypot(here.x - settled.x, here.z - settled.z) > 60) {
            settled = { x: here.x, z: here.z };
            env.update(settled, v.projection.s, null, Infinity);
            await env.streamer.settle(settled, v.projection.s);
        }
        const reach = Math.max(5, Math.min(30, 3 + 0.7 * v.speed));
        let t = k;
        while (t < way.length - 1 && way[t].m - m < reach) t++;
        const err = wrap(Math.atan2(way[t].x - here.x, way[t].z - here.z) - v.yawAngle);
        const capTan = Math.tan(v.worldPhysics.leanCapDeg * Math.PI / 180) * Math.max(0.01, v.worldMultipliers().lateralFriction);
        const most = Math.min(1 / v.worldPhysics.radiusFloor, G * capTan / Math.max(1, v.speed * v.speed));
        const wanted = Math.max(-most, Math.min(most, 2 * Math.sin(err) / reach));
        const lean = -Math.sign(wanted) * Math.atan(v.speed * v.speed * Math.abs(wanted) / G);
        const input = Math.max(-1, Math.min(1, (v.leanAngle - lean) * 8));
        const before = { x: v.position.x, z: v.position.z, y: v.position.y };
        v.update(DT, input, v.speed < SPEED ? 1 : 0, v.speed > SPEED + 1 ? 1 : 0, 0);
        if (out.unmapped === null && !env.ground.mapped(v.position.x, v.position.z)) out.unmapped = Math.round(m);
        if (env.ground.sideRoadY(v.position.x, v.position.z) !== null && m > 0) out.sideM = Math.round(m);
        if (v.crashed) {
            out.crash = (log.filter(l => /CRASH/.test(l)).pop() || 'crash').slice(0, 120);
            out.crashM = Math.round(m);
            // Where it crashed: on a road (the ride's carriageway or a side road's) or off every road, on the land
            const at = env.route.project(before.x, before.z, null, {});
            out.onRoad = at.distance <= at.width / 2 || env.ground.sideRoadY(before.x, before.z) !== null;
            return out;
        }
        const fired = env.guide.step({ projection: v.projection, speed: v.speed, yaw: v.yawAngle, dt: DT });
        if (out.warnedM === null && env.guide.cause) Object.assign(out, { warnedM: Math.round(m), warnedT: tick * DT });
        if (fired === 'restart') {
            Object.assign(out, { cause: reason, restartM: Math.round(m), restartT: tick * DT });
            return out;
        }
    }
    return out;
}

// What each stage may still have, measured, and may only fall: `steep` side roads that leave at a hairpin's angle,
// which a rider at 10 m/s cannot turn into (a crash off the road by its drawn cause); `unrestarted` rides the rule
// did not bring back within RESTART_M, at all, or 10 s after its first warning (a side road that runs near the ride or
// back onto it, or a wrong way that becomes off route); `onRoad`
// crashes on a side road's own carriageway. The Tremola has none of the last two. The Gotthard folder's (the
// Gotthard leg and the two tour legs made from it) and the airolo folder's `onRoad` are walls of side roads the
// rider meets at 10 m/s, found when this test first rode them (2026-11-26), not made by riding the other way: the
// Gotthard leg itself has the same 5
const DEBT = {
    tremola: { steep: 2, unrestarted: 0, onRoad: 0 },
    'gotthard-north': { steep: 3, unrestarted: 2, onRoad: 5 },
    'airolo-lookout': { steep: 2, unrestarted: 4, onRoad: 2 },
    'lookout-andermatt': { steep: 7, unrestarted: 1, onRoad: 5 },
    'hospental-summit': { steep: 3, unrestarted: 2, onRoad: 5 },
    'summit-airolo': { steep: 7, unrestarted: 3, onRoad: 0 }
};

describe.each(stagesFor())('the %s stage: a side road is open, and the off-route rule brings back a rider who takes one', (stage) => {
    let env;
    const rides = [];
    beforeAll(async () => {
        const { fetchFn } = diskFetch();
        env = await WorldEnvironment.load(new THREE.Scene(), { id: stage, fetchFn, models: null, digest: async () => '0' });
        // Trees and houses do not change where a road goes; their building is most of the streaming time
        env.scenery.buildTile = () => null;
        for (const junction of env.graph.junctions) {
            for (const pass of junction.passes) {
                const p = env.route.sample(pass.sIn, {});
                env.update(p, pass.sIn, null, Infinity);
                await env.streamer.settle(p, pass.sIn);
                for (const { edgeId } of junction.incident) {
                    if (env.graph.rideEdgeIds.has(edgeId)) continue;
                    const way = wayFrom(env, junction, pass, edgeId);
                    rides.push({ junction: junction.id, km: Math.round(pass.sIn / 100) / 10, edge: edgeId, ...(await rideWay(env, way)) });
                }
            }
        }
        console.log(rides.map(r => JSON.stringify(r)).join('\n'));
    }, 1200000);

    test('every side road that leaves the ride was ridden', () => {
        expect(rides.length).toBe(env.graph.sideStubs().size);
    });

    test('no barrier is drawn: nothing in the scene is one', () => {
        const names = [];
        env.group.traverse(o => { if (/barrier/i.test(o.name) || /barrier/i.test(String(o.userData.world || ''))) names.push(o.name); });
        expect(names).toEqual([]);
        expect(RoadMeshHas('barriers')).toBe(false);
    });

    test('a rider who keeps to the roads is put back by the rule, 10 s after the first warning, within RESTART_M', () => {
        const kept = rides.filter(r => r.crash === null);
        const debt = DEBT[stage] || { steep: 2, unrestarted: 0, onRoad: 0 };
        const bad = kept.filter(r => r.restartM === null || r.restartM > RESTART_M || Math.abs(r.restartT - r.warnedT - WorldGuide.RESTART_AFTER_S) > 2 * DT);
        if (bad.length > debt.unrestarted) throw new Error(`${bad.length} rides not brought back within ${RESTART_M} m (at most ${debt.unrestarted}):\n${bad.map(r => JSON.stringify(r)).join('\n')}`);
        // The roads that leave at a hairpin's angle are the only ones a rider at 10 m/s cannot turn into
        expect(rides.filter(r => r.crash && !r.onRoad).length).toBeLessThanOrEqual(debt.steep);
    });

    test('nothing stops a rider on a road, and none leaves the mapped land before the rule fires', () => {
        expect(rides.filter(r => r.unmapped !== null)).toEqual([]);
        const debt = DEBT[stage] || { onRoad: 0 };
        expect(rides.filter(r => /barrier/i.test(r.crash || ''))).toEqual([]);
        const onRoad = rides.filter(r => r.crash && r.onRoad);
        if (onRoad.length > debt.onRoad) throw new Error(`${onRoad.length} crashes on a side road (at most ${debt.onRoad}):\n${onRoad.map(r => JSON.stringify(r)).join('\n')}`);
        // (off a road a crash is by its drawn cause: the bank or the drop the side road's mouth leads onto)
        if (stage === 'tremola') expect(rides.filter(r => r.crash && /wall|edge/i.test(r.crash))).toEqual([]);
    });
});

function RoadMeshHas(name) {
    return typeof game.RoadMesh[name] === 'function';
}
