// WorldEnvironment and the guide, over the shipped Tremola slice and the 6 km mini fixture, with real three
// in node and plain (unmodelled) trees and houses. The browser probes in tools/terrain-check.mjs (world-*)
// prove the same things in a page, against the drawn meshes.
import { describe, test, expect, beforeAll } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';
import { samplesOf, straight } from '../helpers/world-synthetic.js';

const game = loadGame();
const { THREE, WorldEnvironment, WorldGuide, WorldRoute, WorldPhysics, WorldStreamer, RoadMesh, TerrainMesh, WorldData } = game;
const LEG_BUDGET = { meshes: 800, triangles: 450000, instances: 1400 };

async function load(search = '', id = 'tremola') {
    const { fetchFn, calls } = diskFetch();
    const scene = new THREE.Scene();
    const env = await WorldEnvironment.load(scene, { id, search, fetchFn, models: null, digest: async () => '0' });
    return { env, scene, calls };
}

describe('asking for a world', () => {
    test('an unknown stage says what is known', async () => {
        await expect(load('', 'nowhere')).rejects.toThrow('unknown world "nowhere"; known: all, tremola');
    });

    test.each(['?worldData=https://example.com/', '?worldData=../../', '?worldData=//evil/world/'])('%s refuses to load and fetches nothing', async (search) => {
        const { fetchFn, calls } = diskFetch();
        await expect(WorldEnvironment.load(new THREE.Scene(), { id: 'all', search, fetchFn })).rejects.toThrow(/relative path/);
        expect(calls).toEqual([]);
    });

    test('the fixture folder loads, reads only itself, and never submits', async () => {
        const { env, calls } = await load('?worldData=tests/fixtures/world/mini', 'mini-1');
        expect(calls.every(url => url.startsWith('tests/fixtures/world/mini/'))).toBe(true);
        expect(env.submitAllowed).toBe(false);
        expect(env.stage.id).toBe('mini-1');
        expect(env.endS).toBeCloseTo(2002.66, 2);
        expect(env.checkpoints).toHaveLength(3);
        expect(env.finishGate.s).toBeCloseTo(2002.66, 1);
        env.dispose();
    });
});

// The edge works of the stacked hairpins (the audit's flat beige wedges and walls ending in the air, km 3.9 to 10.1):
// no apron triangle larger than 20 m^2, no apron vertex over another road's carriageway, and the foot of every retaining
// wall at or under the land drawn beside it (within 0.5 m)
describe('the edge works of the stacked hairpins', () => {
    let env;
    beforeAll(async () => {
        ({ env } = await load('', 'tremola'));
    }, 60000);

    test.each([3939, 8031, 8106, 9500, 9607, 10129])('at s %d', async (s) => {
        const p = env.route.sample(s, {});
        env.update(p, s, null, Infinity);
        await env.streamer.settle(p, s);
        const near = {};
        let biggest = 0, overBand = 0, hanging = 0, aprons = 0, walls = 0;
        const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
        for (const group of env.roadMeshes.values()) {
            group.traverse(o => {
                if (o.name !== 'road-works') return;
                const pos = o.geometry.attributes.position.array;
                for (const g of o.geometry.groups) {
                    for (let t = g.start / 3; t < (g.start + g.count) / 3; t++) {
                        for (let k = 0; k < 3; k++) v[k].fromArray(pos, (t * 3 + k) * 3);
                        if (g.materialIndex === 0) {
                            aprons++;
                            biggest = Math.max(biggest, new THREE.Triangle(v[0], v[1], v[2]).getArea());
                            for (const q of v) {
                                for (const i of env.route.cellSegments(q.x, q.z) || []) {
                                    env.route.nearestSegment(q.x, q.z, i, i, near);
                                    if (near.distance <= near.width / 2 - 0.1 && near.y < q.y - 0.3) { overBand++; break; }
                                }
                            }
                        } else if (g.materialIndex === 2) {
                            // A wall face: vertical, its foot more than 1 m under its top. A parapet's face is not a wall:
                            // it stands on the road's edge (its foot at the road's height) and follows the road's grade
                            // along a whole segment, so one triangle of it can span more than 1 m
                            const top = Math.max(v[0].y, v[1].y, v[2].y), foot = v.reduce((a, b) => (b.y < a.y ? b : a));
                            const n = new THREE.Triangle(v[0], v[1], v[2]).getNormal(new THREE.Vector3());
                            if (Math.abs(n.y) > 0.1 || top - foot.y < 1) continue;
                            if (foot.y >= env.route.project(foot.x, foot.z, null, near).y - 0.1) continue;
                            walls++;
                            const land = env.ground.tileHeight(foot.x, foot.z);
                            if (land !== null && foot.y > land + 0.5) hanging++;
                        }
                    }
                }
            });
        }
        expect(aprons + walls).toBeGreaterThan(0);
        expect({ s, biggestOver20: biggest > 20 ? Math.round(biggest) : 0, overBand, hanging }).toEqual({ s, biggestOver20: 0, overBand: 0, hanging: 0 });
    }, 60000);
});

// Every pier of a side road's deck stands on the land: its foot at or under the lowest land the tile draws at any
// level of detail under each of its corners, and no wider than 2 m (a side road's pier, not a wall)
describe('the piers of the side-road decks', () => {
    test('reach the land at every level of detail and are a pier\'s width', async () => {
        const { env } = await load('', 'tremola');
        const bad = [];
        let piers = 0;
        for (const s of [1731, 5133, 6481, 6533, 10867]) {
            const p = env.route.sample(s, {});
            env.update(p, s, null, Infinity);
            await env.streamer.settle(p, s);
            for (const group of env.sideMeshes.values()) {
                for (const road of group.children) {
                    for (const pier of road.userData.piers || []) {
                        piers++;
                        const fs = Math.sin(pier.heading), fc = Math.cos(pier.heading);
                        let land = Infinity;
                        for (const [u, v] of [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
                            const y = env.landLowAt(pier.x + (u * pier.width / 2) * fc + (v * pier.depth / 2) * fs, pier.z - (u * pier.width / 2) * fs + (v * pier.depth / 2) * fc);
                            if (y !== null) land = Math.min(land, y);
                        }
                        if (pier.foot > land || pier.width > 2) bad.push({ s, x: Math.round(pier.x), z: Math.round(pier.z), gapM: Math.round((pier.foot - land) * 100) / 100, width: pier.width });
                    }
                }
            }
        }
        expect(piers).toBeGreaterThan(10);
        expect(bad).toEqual([]);
    }, 120000);
});

describe('the Tremola slice', () => {
    let env, scene, bike;
    beforeAll(async () => {
        ({ env, scene } = await load('', 'tremola'));
        bike = env.startPosition();
        await env.streamer.settle(bike, env.startS);
    }, 60000);

    test('it answers what the game reads of an environment, and builds none of what a leg builds', () => {
        expect(env.isWorld).toBe(true);
        expect(env.physics).toBe(WorldPhysics);
        expect(env.roadWidth).toBe(10);
        expect(env.sections).toBeNull();
        expect(env.terrain).toBeNull();
        expect(env.terrainGeometry).toBeNull();
        for (const list of [env.roadworksZones, env.roadworkObstacles, env.jumpRamps, env.boulders, env.setPieces]) expect(list).toEqual([]);
        expect(env.config.render.shadowSpan).toBeGreaterThan(0);
        // A world's road surface is its wetness: rain wets it by its intensity, any other weather leaves it dry
        expect(env.resolveRoadSurface('rain', 0.6)).toEqual({ wet: 0.6 });
        expect(env.resolveRoadSurface('fog', 1)).toEqual({ wet: 0 });
    });

    // The window's mesh count must not grow with what a chunk holds: every resident side chunk is at most three meshes
    // (its stub ribbons, its far ribbons, its works), however many roads are in it
    test('a side chunk is a few meshes, however many roads it holds', () => {
        const chunks = [...env.sideMeshes.values()];
        expect(chunks.length).toBeGreaterThan(5);
        const counts = chunks.map(group => {
            let meshes = 0, roads = 0;
            group.traverse(o => { if (o.isMesh) meshes++; if (o.name === 'world-road-side' || o.name === 'world-road-stub') roads++; });
            return { meshes, roads };
        });
        expect(counts.filter(c => c.meshes > 3)).toEqual([]);
        // Some chunks hold many roads: the count is not just small chunks
        expect(Math.max(...counts.map(c => c.roads))).toBeGreaterThan(5);
    });

    test('the stage has its 12 gates in order and a finish at the end of the ride', () => {
        expect(env.checkpoints).toHaveLength(12);
        env.checkpoints.forEach((cp, i) => {
            expect(cp.index).toBe(i);
            expect(cp.passed).toBe(false);
            if (i) expect(cp.s).toBeGreaterThan(env.checkpoints[i - 1].s);
        });
        expect(env.finishGate.s).toBeCloseTo(env.route.length, 0);
        expect(env.finishGate.kind).toBe('finish');
        expect(env.checkpoints[0].width).toBe(8);
        expect(env.startPosition().x).toBeCloseTo(env.route.sample(env.startS, {}).x, 9);
    });

    test('the first window is inside the budgets', () => {
        const counts = env.counts();
        expect(counts.meshes).toBeLessThanOrEqual(LEG_BUDGET.meshes);
        expect(counts.triangles).toBeLessThanOrEqual(LEG_BUDGET.triangles);
        expect(counts.instances).toBeLessThanOrEqual(LEG_BUDGET.instances);
        expect(counts.tiles).toBeGreaterThan(5);
        expect(counts.tiles).toBeLessThanOrEqual(60);
        expect(counts.queue).toBe(0);
    });

    test('the tiles within 900 m are drawn and held', () => {
        const near = env.streamer.tilesNear(bike.x, bike.z, WorldStreamer.BIKE_TILE_M);
        expect(near.size).toBeGreaterThan(0);
        for (const key of near) {
            expect(env.streamer.refs.get(key)).toBeGreaterThanOrEqual(1);
            expect(env.tileMeshes.has(key)).toBe(true);
        }
    });

    test('the horizon, the gates, the signposts and the barriers are in the scene', () => {
        const names = [];
        env.group.traverse(o => names.push(o.name));
        for (const name of ['world-horizon', 'world-gates', 'world-barriers', 'world-signposts']) expect(names).toContain(name);
        expect(scene.children).toContain(env.group);
    });

    test('the ground under the road is the route, and is never NaN away from it', () => {
        const route = env.route;
        for (const s of [30, 500, 2000, 6000, 12000]) {
            const p = route.sample(s, {});
            const u = Math.floor(route.toUnits(s));
            const loc = {};
            expect(env.ground.groundY(p.x, p.z, { start: u - 10, end: u + 10 }, false, loc)).toBeCloseTo(p.y, 4);
            for (const lateral of [-60, -12, 8, 40, 300]) {
                const y = env.ground.groundY(p.x + lateral * Math.cos(p.heading), p.z - lateral * Math.sin(p.heading), { start: u - 10, end: u + 10 }, false, {});
                expect(Number.isFinite(y)).toBe(true);
            }
        }
    });

    test('the junction the rider reaches closes its other branches, and only that junction', () => {
        const junction = env.graph.junctions.find(j => j.passes.some(p => p.inEdge !== null && p.barriers.length));
        const pass = junction.passes.find(p => p.inEdge !== null && p.barriers.length);
        const p = env.route.sample(Math.max(0, pass.sIn - 150), {});
        env.update(p, pass.sIn - 150);
        const active = env.activeBarriers.filter(b => b.junctionId === junction.id).map(b => b.edgeId).sort((a, b) => a - b);
        expect(active).toEqual(pass.barriers.map(b => b.edgeId).sort((a, b) => a - b));
        expect(active).not.toContain(pass.outEdge);
        expect(env.barrierMesh.count).toBe(env.activeBarriers.length);
        // Where each barrier was placed (moved off the ride and the other roads: WorldGraph.barrierPose) is a wall
        for (const b of env.activeBarriers.filter(x => x.junctionId === junction.id)) {
            const loc = { x: b.x, z: b.z, index: 0, lateral: 100 };
            expect(env.ground.zoneAt(loc, 5).kind).toBe('wall');
        }
        // Far down the ride the junction's barriers are gone
        env.update(env.route.sample(env.route.length - 10, {}), env.route.length - 10);
        expect(env.activeBarriers.filter(b => b.junctionId === junction.id)).toEqual([]);
    });

    test('update builds within the frame budget and the guide runs from the state it is given', () => {
        const p = env.route.sample(env.startS, {});
        const state = { projection: env.route.project(p.x, p.z, null, {}), speed: 20, yaw: p.heading, dt: 1 / 60, position: p };
        env.update(p, env.startS, state, 4);
        expect(env.guide.cause).toBeNull();
        expect(env.guide.promptText).toEqual(expect.any(String));
    });

    test('a restart far from the bike holds the ground under the gate, and lets go once the bike is there', async () => {
        const s = env.route.length * 0.8;
        const keys = await env.place(s);
        const p = env.route.sample(s, {});
        expect(keys.length).toBeGreaterThan(0);
        for (const key of keys) expect(env.data.tile(key)).not.toBeNull();
        expect(env.streamer.owners.get('placing').size).toBe(keys.length);
        // The ground answers a number before any mesh is built there
        expect(Number.isFinite(env.ground.groundY(p.x, p.z, { start: 0, end: 5 }, false, {}))).toBe(true);
        env.update(p, s);
        expect(env.streamer.owners.get('placing').size).toBe(0);
        expect(env.streamer.refs.size).toBeGreaterThan(0);
    });

    test('the disposal clock runs on simulated time, the same at 120 Hz, 30 fps and with no step at all', () => {
        const p = env.route.sample(env.startS, {});
        const clock = () => env.streamer.clock();
        let before = clock();
        for (let i = 0; i < 120; i++) env.update(p, env.startS, null, 4, 1 / 120);
        expect(clock() - before).toBeCloseTo(1000, 6);
        before = clock();
        for (let i = 0; i < 30; i++) env.update(p, env.startS, null, 4, 1 / 30);
        expect(clock() - before).toBeCloseTo(1000, 6);
        before = clock();
        env.update(p, env.startS, null, 4);
        expect(clock()).toBe(before);
    });

    test('disposing leaves nothing of the world in the scene', () => {
        env.dispose();
        expect(scene.children).not.toContain(env.group);
    });
});

describe('a side road at a junction stays under the ride', () => {
    // The ride climbs along +z at 10%, 10 m wide; a side road leaves it at z = 200 heading +x, level at the height
    // of the junction node plus 0.15 m, as an imported side road can be
    const ride = new WorldRoute(samplesOf(straight(400, { y: 0 }).map(p => ({ ...p, y: p.z * 0.1 }))), {});
    const env = Object.assign(Object.create(WorldEnvironment.prototype), { route: ride });
    const sideRows = Array.from({ length: 6 }, (_, i) => ({ x: i * 16, y: 20.15, z: 200, heading: Math.PI / 2, width: 6, bits: 0 }));
    const rideY = z => z * 0.1;
    const raycaster = new THREE.Raycaster();
    const drawnY = (group, x, z) => {
        raycaster.set(new THREE.Vector3(x, 100, z), new THREE.Vector3(0, -1, 0));
        const hit = raycaster.intersectObject(group, true)[0];
        return hit ? hit.point.y : null;
    };
    // Points inside the ride's band that the side road covers
    const band = [];
    for (let x = -4.5; x <= 4.5; x += 0.5) for (let z = 197.5; z <= 202.5; z += 0.5) band.push([x, z]);

    test.each([[true], [false]])('nowhere in the ride band is the side road (stub %s) above the ride surface', (stub) => {
        const group = RoadMesh.sideRoad(env.holdSide(sideRows), stub, env.sideHold());
        group.updateMatrixWorld(true);
        let covered = 0;
        for (const [x, z] of band) {
            const y = drawnY(group, x, z);
            if (y === null) continue;
            covered++;
            expect([x, z, y <= rideY(z)]).toEqual([x, z, true]);
        }
        expect(covered).toBeGreaterThan(20);
        // Outside the band it climbs back to its own height
        expect(drawnY(group, 40, 201.5)).toBeCloseTo(20.15 + RoadMesh.LIFT_M, 4);
    });

    test('the side road is untouched where it is clear of the ride, and a road over the ride keeps its height', () => {
        const far = sideRows.map(r => ({ ...r, x: r.x + 100 }));
        expect(env.holdSide(far)).toBe(far);
        const over = sideRows.map(r => ({ ...r, y: 30 }));
        expect(env.holdSide(over)).toBe(over);
    });

    test('a level of detail keeps the rows the hold put in', () => {
        const rows = env.holdSide(sideRows);
        const kept = rows.filter(r => r.keep);
        expect(kept.length).toBeGreaterThan(1);
        const decimated = RoadMesh.decimate(rows);
        for (const r of kept) expect(decimated).toContain(r);
    });

    test('a carved terrain vertex in the ride band is drawn under the ride surface', () => {
        const N = WorldData.TILE_N;
        // A tile at the origin carved as road everywhere, standing 0.3 m over the ride
        const tile = { key: '0,0', tx: 0, tz: 0, heights: new Float32Array(N * N).map((_, k) => Math.floor(k / N) * WorldData.CELL_M * 0.1 + 0.3), zones: new Uint8Array(N * N).fill(WorldData.ZONE.road) };
        const hold = (x, y, z) => { const low = env.rideSurfaceAt(x, z, y); return low === null ? y : Math.min(y, low - TerrainMesh.SINK_M); };
        const held = TerrainMesh.build(tile, null, 0, hold).mesh.geometry.attributes.position.array;
        const plain = TerrainMesh.build(tile, null, 0).mesh.geometry.attributes.position.array;
        const at = (array, i, j) => array[(j * N + i) * 3 + 1];
        // Vertex (0, 25) is on the ride's centre line at z = 200; (3, 25) is 24 m off it
        expect(at(plain, 0, 25)).toBeGreaterThan(rideY(200));
        expect(at(held, 0, 25)).toBeCloseTo(rideY(200) - TerrainMesh.SINK_M, 4);
        expect(at(held, 3, 25)).toBe(at(plain, 3, 25));
    });
});

describe('WorldGuide', () => {
    const route = new WorldRoute(samplesOf(straight(2000, { y: 0 })), {});
    const environment = { route, credit: '© swisstopo', sideEdges: new Map() };
    const onRoad = { s: 100, lateral: 1, heading: 0, distance: 1 };
    const frame = (projection, over = {}) => ({ projection, speed: 20, yaw: 0, dt: 1 / 60, position: { x: 0, z: 0 }, ...over });

    function run(guide, seconds, state) {
        const events = [];
        for (let tick = 0; tick < seconds * 60; tick++) {
            const fired = guide.update(state);
            events.push([tick / 60, guide.warning, fired]);
        }
        return events;
    }

    test('50 m off the ride line warns at once and restarts 10 s later', () => {
        const guide = new WorldGuide(environment);
        const reasons = [];
        guide.onRestart = reason => reasons.push(reason);
        const events = run(guide, 12, frame({ ...onRoad, lateral: 50 }));
        expect(events[0][1]).toBe('Wrong way');
        const fired = events.find(e => e[2] === 'restart');
        expect(fired[0]).toBeGreaterThan(9.9);
        expect(fired[0]).toBeLessThan(10.1);
        expect(reasons).toEqual(['off-route']);
    });

    test('riding backwards warns after 5 s and restarts 10 s after that', () => {
        const guide = new WorldGuide(environment);
        const reasons = [];
        guide.onRestart = reason => reasons.push(reason);
        const events = run(guide, 17, frame(onRoad, { speed: 10, yaw: Math.PI }));
        const warned = events.find(e => e[1]);
        expect(warned[0]).toBeGreaterThan(4.9);
        expect(warned[0]).toBeLessThan(5.2);
        const fired = events.find(e => e[2] === 'restart');
        expect(fired[0] - warned[0]).toBeGreaterThan(9.9);
        expect(fired[0] - warned[0]).toBeLessThan(10.2);
        expect(reasons).toEqual(['wrong-way']);
    });

    test('riding the road normally never warns (the control)', () => {
        const guide = new WorldGuide(environment);
        guide.onRestart = () => { throw new Error('restart'); };
        const events = run(guide, 100, frame(onRoad));
        expect(events.some(e => e[1] || e[2])).toBe(false);
    });

    test('creeping backwards under 3 m/s is not riding the wrong way', () => {
        const guide = new WorldGuide(environment);
        const events = run(guide, 20, frame(onRoad, { speed: 2.5, yaw: Math.PI }));
        expect(events.some(e => e[1])).toBe(false);
    });

    test('a restart resets both timers, so one excursion costs one penalty', () => {
        const guide = new WorldGuide(environment);
        let restarts = 0;
        guide.onRestart = () => { restarts++; };
        run(guide, 8, frame({ ...onRoad, lateral: 60 }));
        guide.reset();
        // Still off route after the reset: a new 10 s must run before the next restart
        const events = run(guide, 9, frame({ ...onRoad, lateral: 60 }));
        expect(restarts).toBe(0);
        expect(events.some(e => e[2] === 'restart')).toBe(false);
        run(guide, 2, frame({ ...onRoad, lateral: 60 }));
        expect(restarts).toBe(1);
    });

    test('getting back on the road clears the warning and the clock', () => {
        const guide = new WorldGuide(environment);
        let restarts = 0;
        guide.onRestart = () => { restarts++; };
        run(guide, 6, frame({ ...onRoad, lateral: 60 }));
        expect(guide.warning).toBe('Wrong way');
        run(guide, 1, frame(onRoad));
        expect(guide.warning).toBeNull();
        run(guide, 6, frame({ ...onRoad, lateral: 60 }));
        expect(restarts).toBe(0);
    });

    test('the prompt names the next junction, its distance and the way to go', () => {
        const graph = {
            junctions: [{ id: 'j', name: 'Via Gottardo', node: 0, incident: [{ edgeId: 1, heading: Math.PI }, { edgeId: 2, heading: 0.6 }], passes: [{ sIn: 400, inEdge: 1, outEdge: 2, barriers: [] }] }]
        };
        const guide = new WorldGuide({ ...environment, route: new WorldRoute(samplesOf(straight(2000)), { graph }) });
        expect(guide.promptAt(100)).toBe('Keep left, 300 m · Via Gottardo');
        expect(guide.promptAt(396)).toBe('Keep left, 10 m · Via Gottardo');
        expect(guide.promptAt(600)).toBe('');
    });
});
