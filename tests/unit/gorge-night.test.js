// The gorge (foggy-gorge): canyon, tunnel, a cliff road with the wall on the
// left, a second tunnel, and the cliff road with the wall on the right. The
// night forest (night-ride) with its tunnel and village. Spans with a roof,
// the set-piece list, the camera under the roof, rockfalls off the walls in
// force, and the bike at the edges of each piece. Real modules on real three r150.
import { buildEnvironment, gameMethods, loadGame, loadScript } from '../helpers/load-game.js';

const DT = 1 / 60;
const GORGE = 3;
const NIGHT = 6;
const CRASHES = /CRASHED|FALLING/;

// Park-Miller, so a fall is repeatable
function seeded(seed = 1) {
    let state = seed;
    return () => {
        state = (state * 16807) % 2147483647;
        return state / 2147483647;
    };
}

describe('canyon and night forest profiles (pure)', () => {
    const game = loadGame();
    const { Terrain } = game;
    const canyon = Terrain.profiles.canyon;
    const night = Terrain.profiles.forestNight;
    const [gorgeTunnel, cliffWallLeft, secondTunnel, cliffWallRight] = canyon.spans;
    const [tunnel, village] = night.spans;
    const ctxFor = (halfRoad, roadY, s) => ({ halfRoad, roadY, column: 0, index: Math.floor(s), s, pathLength: 744 });

    test('the gorge: a wall on each side, 1 m past the road edge, 45 to 70 m high', () => {
        const zone = lateral => Terrain.zoneAt(canyon, 240, lateral, 10).kind;
        expect([10.5, 11, 11.01, -11.01, -11.5].map(zone)).toEqual(['shoulder', 'shoulder', 'wall', 'wall', 'wall']);
        [canyon.left, canyon.right].forEach(side => {
            expect(side.face).toMatchObject({ kind: 'rise', height: 57, variation: 0.2, snow: false });
        });
        // The tallest and lowest the wall's height multiplier reaches over the whole road
        const ctx = ctxFor(10, 0, 0);
        let lowest = Infinity;
        let highest = -Infinity;
        for (let index = 0; index < 744; index++) {
            const top = Terrain.row(canyon.left, Terrain.ROWS, { ...ctx, index, pathLength: 744 }, {}).rise;
            lowest = Math.min(lowest, top);
            highest = Math.max(highest, top);
        }
        expect(lowest).toBeGreaterThanOrEqual(45);
        expect(highest).toBeLessThanOrEqual(70);
    });

    test('the mountain wall is untouched by the variation option', () => {
        expect(Terrain.profiles.cliffLake.left.face).toEqual({ kind: 'rise', height: 40, rockSpread: 20 });
    });

    test('the two profiles carry their set pieces as typed spans, on global segments', () => {
        expect(Terrain.setPieces(canyon)).toEqual([{ type: 'tunnel', from: 265, to: 271 }, { type: 'tunnel', from: 286, to: 293 }]);
        expect(Terrain.setPieces(night)).toEqual([{ type: 'tunnel', from: 514, to: 521 }, { type: 'village', from: 583, to: 590 }]);
        ['cliffLake', 'cliffLakeMirrored', 'valleyFloor', 'forest', 'coast', 'ridge'].forEach(name => {
            expect(Terrain.setPieces(Terrain.profiles[name])).toEqual([]);
        });
        expect(Terrain.LEGS[6].profile).toBe(night);
        expect(Terrain.LEGS[5].profile).not.toBe(night);
        expect(Terrain.LEGS[5].profile.id).toBe(night.id);
    });

    test('a span with a ceiling is a roof from `from` to the segment before `to`, and nothing else is', () => {
        expect([513, 514, 517, 521, 522].map(segment => Terrain.ceilingAt(night, segment))).toEqual([undefined, 7.5, 7.5, 7.5, undefined]);
        expect(Terrain.ceilingAt(night, 586)).toBeUndefined();
        expect([264, 265, 268, 271, 272, 278, 285, 286, 290, 293, 294, 300].map(segment => Terrain.ceilingAt(canyon, segment)))
            .toEqual([undefined, 7.5, 7.5, 7.5, undefined, undefined, undefined, 7.5, 7.5, 7.5, undefined, undefined]);
        expect(Terrain.ceilingAt(Terrain.profiles.cliffLake, 517)).toBeUndefined();
    });

    test('edges: P21, the tunnels, the village and the cliff roads change what the side is, at the segment and nowhere else', () => {
        const zone = (profile, segment, lateral, halfRoad) => Terrain.zoneAt(profile, segment, lateral, halfRoad).kind;
        // Leg 7 (halfRoad 8): the tunnel wall stands 1 m past the road edge, the forest run-off 25 m
        expect([513, 514, 517, 521, 522].map(segment => zone(night, segment, 9.5, 8))).toEqual(['runoff', 'wall', 'wall', 'wall', 'runoff']);
        expect([513, 514, 521, 522].map(segment => zone(night, segment, -9.5, 8))).toEqual(['runoff', 'wall', 'wall', 'runoff']);
        // The village pavement is run-off (slow, not a crash) to 3 m past the edge, then house fronts
        expect([582, 583, 586, 590, 591].map(segment => zone(night, segment, 10.9, 8))).toEqual(['runoff', 'runoff', 'runoff', 'runoff', 'runoff']);
        expect([582, 583, 586, 590, 591].map(segment => zone(night, segment, 11.5, 8))).toEqual(['runoff', 'wall', 'wall', 'wall', 'runoff']);
        expect([583, 590].map(segment => zone(night, segment, -11.5, 8))).toEqual(['wall', 'wall']);
        // Leg 4 (halfRoad 10): canyon, tunnel, wall left and drop right, tunnel, drop left and wall right
        const segments = [264, 265, 271, 272, 285, 286, 293, 294, 320];
        expect(segments.map(segment => zone(canyon, segment, 11.5, 10))).toEqual(['wall', 'wall', 'wall', 'shoulder', 'shoulder', 'wall', 'wall', 'wall', 'wall']);
        expect(segments.map(segment => zone(canyon, segment, 12.5, 10))).toEqual(['wall', 'wall', 'wall', 'fall', 'fall', 'wall', 'wall', 'wall', 'wall']);
        expect(segments.map(segment => zone(canyon, segment, -11.5, 10))).toEqual(['wall', 'wall', 'wall', 'wall', 'wall', 'wall', 'wall', 'shoulder', 'shoulder']);
        expect(segments.map(segment => zone(canyon, segment, -12.5, 10))).toEqual(['wall', 'wall', 'wall', 'wall', 'wall', 'wall', 'wall', 'fall', 'fall']);
    });

    test('rideable limit and gate reach follow the side in force at each piece', () => {
        expect([513, 517, 522].map(segment => Terrain.rideableLimit(night, segment, 1, 8))).toEqual([33, 9, 33]);
        expect([582, 586, 591].map(segment => Terrain.rideableLimit(night, segment, -1, 8))).toEqual([33, 11, 33]);
        expect([240, 268, 278, 290, 300].map(segment => Terrain.rideableLimit(canyon, segment, 1, 10))).toEqual([11, 11, 12, 11, 11]);
        expect([240, 268, 278, 290, 300].map(segment => Terrain.rideableLimit(canyon, segment, -1, 10))).toEqual([11, 11, 11, 11, 12]);
        // Run-off ground reaches 2 further; a wall or hill keeps the ledge
        expect(Terrain.gateReach(night, 586, 1, 8)).toBe(13);
        expect(Terrain.gateReach(night, 517, 1, 8)).toBe(10);
        expect(Terrain.gateReach(canyon, 278, 1, 10)).toBe(12);
        expect(Terrain.gateReach(canyon, 300, -1, 10)).toBe(12);
    });

    test('ground in a span: above the road beside a tunnel, a drop beside a cliff road, level pavement in the village', () => {
        const geo = { path: Array.from({ length: 700 }, (_, i) => ({ x: 0, z: i * 20 + 10, y: 40, heading: 0 })), roadWidth: 16, startSegment: 510, endSegment: 607 };
        const at = (profile, segment, lateral, width = 16) => Terrain.groundY(profile, { ...geo, roadWidth: width }, lateral, segment * 20 + 10, 0, 699, false) - 40;
        expect(at(night, 517, 12)).toBeCloseTo(9.55, 2);
        expect(at(night, 586, 10)).toBe(0);
        expect(at(night, 586, 12)).toBeGreaterThan(6);
        // The gorge's tunnel: the rock climbs 9 m over the 1.5 m from the lining to the crest
        expect(at(canyon, 268, 12, 20)).toBeCloseTo(6, 6);
        // The cliff roads: 1.33 down per metre past the 2 m ledge on the drop, 1.6 up on the wall
        expect(at(canyon, 278, 20, 20)).toBeCloseTo(-8 * 1.33, 6);
        expect(at(canyon, 278, -20, 20)).toBeCloseTo(8 * 1.6, 6);
        expect(at(canyon, 300, -20, 20)).toBeCloseTo(-8 * 1.33, 6);
        expect(at(canyon, 300, 20, 20)).toBeCloseTo(8 * 1.6, 6);
        // The drop ends at the gorge's lake
        expect(at(canyon, 278, 120, 20) + 40).toBe(-28);
    });

    test('rows blend over one segment at each edge of a span, centred on the segment boundary', () => {
        const row = (profile, s, j) => Terrain.rowAt(profile, 1, j, ctxFor(8, 20, s), {});
        const own = (side, s, j) => Terrain.row(side, j, ctxFor(8, 20, s), {});
        [0, 7, 20, 35].forEach(j => {
            // The front edge: the forest before, the hill from segment 514
            expect(row(night, 512.9, j)).toEqual(own(night.right, 512.9, j));
            expect(row(night, 514, j)).toEqual(own(tunnel.right, 514, j));
            // The back edge: the hill through segment 521, the forest again from segment 522
            expect(row(night, 521, j)).toEqual(own(tunnel.right, 521, j));
            expect(row(night, 522, j)).toEqual(own(night.right, 522, j));
            const halfway = row(night, 521.5, j);
            const a = own(tunnel.right, 521.5, j);
            const b = own(night.right, 521.5, j);
            expect(halfway.d).toBeCloseTo((a.d + b.d) / 2, 9);
            expect(halfway.y).toBeCloseTo((a.y + b.y) / 2, 9);
        });
        // One span follows the other: nothing between the tunnel and the village
        expect(row(night, 550, 20)).toEqual(own(night.right, 550, 20));
    });

    test('the walls in force shed rocks: both in the canyon, one on each cliff road; a cliff leg, one', () => {
        expect(Terrain.wallSignsAt(canyon, 250)).toEqual([-1, 1]);
        expect(Terrain.wallSignsAt(canyon, 278)).toEqual([-1]);
        expect(Terrain.wallSignsAt(canyon, 300)).toEqual([1]);
        expect(Terrain.wallSignsAt(Terrain.profiles.cliffLake, 270)).toEqual([-1]);
        expect(Terrain.wallSignsAt(Terrain.profiles.coast, 230)).toEqual([-1]);
        expect(Terrain.wallSignsAt(Terrain.profiles.forest, 100)).toEqual([-1, 1]);
        expect(Terrain.wallSign(canyon)).toBe(-1);
        expect(Terrain.wallSignsAt(Terrain.profiles.cliffLakeMirrored, 100)).toEqual([1]);
    });

    test('the gorge spans: two tunnels of seven and eight segments, and cliff roads whose drop swaps sides', () => {
        expect([gorgeTunnel.from, gorgeTunnel.to, secondTunnel.from, secondTunnel.to]).toEqual([265, 272, 286, 294]);
        expect(cliffWallLeft).toMatchObject({ from: 272, to: 286 });
        expect(cliffWallLeft.left).toBeUndefined();
        expect(cliffWallLeft.right.face.kind).toBe('drop');
        expect(cliffWallRight.from).toBe(294);
        expect(cliffWallRight.to).toBeUndefined();
        expect(cliffWallRight.right).toBeUndefined();
        expect(cliffWallRight.left.face.kind).toBe('drop');
        expect(Terrain.sideAt(canyon, -1, 278)).toBe(canyon.left);
        expect(Terrain.sideAt(canyon, 1, 300)).toBe(canyon.right);
        expect(canyon.floor).toEqual({ kind: 'lake', y: -28, restY: -27.5 });
    });

    test('rows blend from one span straight into the next: a tunnel hill into a drop', () => {
        const row = (s, j) => Terrain.rowAt(canyon, 1, j, ctxFor(10, 30, s), {});
        const own = (side, s, j) => Terrain.row(side, j, ctxFor(10, 30, s), {});
        [0, 12, 35].forEach(j => {
            expect(row(271, j)).toEqual(own(gorgeTunnel.right, 271, j));
            expect(row(272, j)).toEqual(own(cliffWallLeft.right, 272, j));
            const halfway = row(271.5, j);
            const a = own(gorgeTunnel.right, 271.5, j);
            const b = own(cliffWallLeft.right, 271.5, j);
            expect(halfway.d).toBeCloseTo((a.d + b.d) / 2, 9);
            expect(halfway.y).toBeCloseTo((a.y + b.y) / 2, 9);
        });
    });

    test.each([
        ['canyon', 10, 133],
        ['forestNight', 8, 133]
    ])('%s: no row of any side or span reaches past half the tightest bend radius of its leg', (name, halfRoad, limit) => {
        const profile = Terrain.profiles[name];
        const sides = [profile.left, profile.right, ...profile.spans.flatMap(span => [span.left, span.right])].filter(Boolean);
        sides.forEach(side => expect(Terrain.outermost(side, ctxFor(halfRoad, 30, 7))).toBeLessThanOrEqual(limit));
    });

    test('every side of a set piece ends where no ribbon stops against the haze: well above the road, or under the water', () => {
        [tunnel, village].forEach(span => {
            [span.left, span.right].forEach(side => expect(side.stations[side.stations.length - 1][1]).toBeGreaterThanOrEqual(30));
        });
        // The gorge's tunnel spurs climb beside the walls, then run down into the lake: they end
        // below the water at every road height of the leg (the lowest road is 32.5 - (-28) = 60.5 over it)
        const legs = new game.TourSystem().legs;
        const { startSegment, endSegment } = legs[GORGE];
        let highest = -Infinity;
        for (let i = startSegment; i <= endSegment + 20; i++) highest = Math.max(highest, Terrain.elevation(canyon, i, startSegment, endSegment));
        [gorgeTunnel, secondTunnel].forEach(span => {
            [span.left, span.right].forEach(side => {
                expect(side.rock).toBe(true);
                expect(Math.max(...side.stations.map(([, y]) => y))).toBeGreaterThanOrEqual(30);
                expect(highest + side.stations[side.stations.length - 1][1]).toBeLessThan(canyon.floor.y);
            });
        });
    });

    test('road heights: gentle steps along the whole path, and each leg has its own shape', () => {
        const legs = new game.TourSystem().legs;
        [[GORGE, canyon], [NIGHT, night]].forEach(([index, profile]) => {
            const { startSegment, endSegment } = legs[index];
            const y = Array.from({ length: 744 }, (_, i) => Terrain.elevation(profile, i, startSegment, endSegment));
            y.slice(1).forEach((value, n) => expect(Math.abs(value - y[n])).toBeLessThanOrEqual(0.5));
            expect(y.every(Number.isFinite)).toBe(true);
        });
        expect(Terrain.elevation(canyon, 234, 234, 321)).toBeCloseTo(30, 9);
        expect(Terrain.elevation(night, 510, 510, 607)).toBeCloseTo(26, 9);
        expect(Terrain.elevation(night, 510, 510, 607)).not.toBeCloseTo(Terrain.elevation(Terrain.profiles.forest, 510, 414, 509), 1);
    });

    test('heightAt is finite everywhere on the gorge, walked or not', () => {
        const geo = { path: Array.from({ length: 700 }, (_, i) => ({ x: 0, z: i * 20 + 10, y: 40, heading: 0 })), roadWidth: 20, startSegment: 234, endSegment: 321 };
        for (let lateral = -120; lateral <= 120; lateral += 3) {
            [false, true].forEach(exact => {
                [250, 270, 280, 300].forEach(segment => {
                    expect(Number.isFinite(Terrain.groundY(canyon, geo, lateral, segment * 20 + 10, 0, 699, exact))).toBe(true);
                });
            });
        }
    });
});

describe('the gorge and the night forest built', () => {
    let game;
    let log;
    const built = new Map();

    beforeAll(() => {
        log = [];
        game = loadGame(undefined, log);
    });

    function leg(index) {
        if (!built.has(index)) {
            log.length = 0;
            built.set(index, { ...buildEnvironment(game, index), log: [...log] });
        }
        return built.get(index);
    }

    const world = (env, segment, lateral) => {
        const point = env.roadPath[segment];
        return [point.x + Math.cos(point.heading) * lateral, point.z - Math.sin(point.heading) * lateral];
    };

    function meshesOf(scene, test) {
        const meshes = [];
        scene.traverse(object => {
            if (object.isMesh && test(object)) {
                object.material.side = game.THREE.DoubleSide;
                meshes.push(object);
            }
        });
        scene.updateMatrixWorld(true);
        return meshes;
    }

    // First hit along a ray against the given meshes: { y, distance }, or null
    function cast(meshes, origin, direction) {
        const raycaster = new game.THREE.Raycaster(new game.THREE.Vector3(...origin), new game.THREE.Vector3(...direction));
        const hit = raycaster.intersectObjects(meshes, false)[0];
        return hit ? { y: hit.point.y, distance: hit.distance, name: hit.object.parent && hit.object.parent.name } : null;
    }

    const ribbons = scene => meshesOf(scene, object => object.userData.part === 'ground' && object.geometry.attributes.color && !object.parent.userData.setPiece && object.parent.type === 'Group' && !object.parent.name);

    test.each([[GORGE, 10], [NIGHT, 8]])('leg %i: nothing floats, nothing overlaps the road', (index) => {
        const { log: lines } = leg(index);
        expect(lines.filter(line => /FLOATING|TERRAIN-ROAD OVERLAP/.test(line))).toEqual([]);
        expect(lines.some(line => line.includes('Grounding validation passed'))).toBe(true);
    });

    test('P-W8: set pieces sit where planned, on straights, clear of checkpoints and roadworks', () => {
        const expected = { [GORGE]: [['tunnel', 265, 271], ['tunnel', 286, 293]], [NIGHT]: [['tunnel', 514, 521], ['village', 583, 590]] };
        for (const index of [0, 1, 2, 3, 4, 5, 6, 7]) {
            const { env } = leg(index);
            expect(env.setPieces.map(({ type, from, to }) => [type, from, to])).toEqual(expected[index] || []);
            for (const { from, to } of env.setPieces) {
                let step = 0;
                for (let i = from; i < to; i++) step = Math.max(step, Math.abs(env.roadPath[i + 1].heading - env.roadPath[i].heading));
                expect(step).toBeLessThan(0.02);
                expect(env.checkpoints.filter(c => c.segmentIndex >= from && c.segmentIndex <= to)).toEqual([]);
                expect(env.roadworksZones.filter(z => z.endSegment >= from && z.startSegment <= to)).toEqual([]);
                // Widened by one segment, so a rock aimed beside the piece still keeps out
                expect(env.checkpoints.filter(c => c.segmentIndex >= from - 1 && c.segmentIndex <= to + 1)).toEqual([]);
            }
        }
    });

    // The night village's board once stood inside the houses (zone 592-593, board at 589)
    // and could only clear the fronts by hanging over the road
    test('no roadworks zone, board or cone stands on a set piece or the segment either side', () => {
        const props = /construction|warning cone|dirt ramp|work truck|shipping container/;
        const margin = 1;
        for (const index of [0, 1, 2, 3, 4, 5, 6, 7]) {
            const { env } = leg(index);
            const near = ({ from, to }, segment) => segment >= from - margin && segment <= to + margin;
            const last = Math.min(env.endSegment + 20, env.roadPath.length - 1);
            // The segment a prop stands on: the one whose stretch [i, i + 1) holds its foot
            const segmentOf = position => {
                let best = env.startSegment;
                const gap = i => Math.hypot(env.roadPath[i].x - position.x, env.roadPath[i].z - position.z);
                for (let i = env.startSegment; i <= last; i++) if (gap(i) < gap(best)) best = i;
                const point = env.roadPath[best];
                const next = env.roadPath[Math.min(best + 1, last)];
                const ahead = (position.x - point.x) * (next.x - point.x) + (position.z - point.z) * (next.z - point.z);
                return ahead < 0 ? best - 1 : best;
            };
            const placed = env.groundedObjects.filter(({ label }) => props.test(label));
            expect(placed.length).toBeGreaterThan(0);
            for (const piece of env.setPieces) {
                for (const zone of env.roadworksZones) {
                    const reach = env.roadworksReach(zone.startSegment, zone.endSegment, zone.type);
                    for (let segment = reach.from; segment <= reach.to; segment++) expect([index, zone.type, segment, near(piece, segment)]).toEqual([index, zone.type, segment, false]);
                }
                const inside = placed.filter(({ object }) => near(piece, segmentOf(object.getWorldPosition(new game.THREE.Vector3()))));
                expect(inside.map(({ label }) => label)).toEqual([]);
            }
        }
        // High-pass has no set piece and keeps its zones; the night village's minor zone
        // moves to the nearest start clear of the village and of a checkpoint (596)
        expect(leg(4).env.roadworksZones.map(z => [z.startSegment, z.endSegment])).toEqual([[372, 374], [399, 400]]);
        expect(leg(NIGHT).env.roadworksZones.map(z => [z.startSegment, z.endSegment])).toEqual([[563, 565], [597, 598]]);
        expect(leg(GORGE).env.roadworksZones.map(z => [z.startSegment, z.endSegment])).toEqual([[281, 283], [307, 308]]);
    });

    test('the cliff roads: the wall and the drop on the stated sides, each the surface a ray meets', () => {
        const { env, scene } = leg(GORGE);
        const ground = ribbons(scene);
        const roadY = segment => env.roadPath[segment].y;
        // Segment 278: wall on the left, drop on the right; segment 305: the other way round
        for (const [segment, wall] of [[278, -1], [305, 1]]) {
            for (const lateral of [15, 25]) {
                const [wx, wz] = world(env, segment, wall * lateral);
                expect(env.groundYAt(wx, wz) - roadY(segment)).toBeGreaterThanOrEqual(4);
                const [dx, dz] = world(env, segment, -wall * lateral);
                expect(roadY(segment) - env.groundYAt(dx, dz)).toBeGreaterThanOrEqual(3);
                [[wx, wz], [dx, dz]].forEach(([x, z]) => {
                    expect(Math.abs(cast(ground, [x, 500, z], [0, -1, 0]).y - env.groundYAt(x, z))).toBeLessThanOrEqual(5e-3);
                });
            }
        }
        // In the canyon both sides rise
        for (const lateral of [-15, 15]) {
            const [x, z] = world(env, 250, lateral);
            expect(env.groundYAt(x, z) - roadY(250)).toBeGreaterThanOrEqual(4);
        }
    });

    test('the gorge\'s lake lies far under the cliff roads, and a fall ends on it', () => {
        const { env, scene } = leg(GORGE);
        const lake = meshesOf(scene, object => object.userData.part === 'floor');
        expect(lake).toHaveLength(1);
        expect(lake[0].name).toBe('floor-lake');
        expect(lake[0].position.y).toBe(-28);
        const [x, z] = world(env, 278, 90);
        expect(env.groundYAt(x, z)).toBe(-28);
        expect(env.roadPath[278].y - -28).toBeGreaterThan(45);
    });

    test('the dressing follows the face in force: rocks and decals hang on the drop below the road and on the wall above it', () => {
        const { env, scene } = leg(GORGE);
        const nearest = (x, z) => {
            let best = Infinity;
            let found = env.startSegment;
            for (let i = env.startSegment; i <= env.endSegment + 20; i++) {
                const point = env.roadPath[i];
                const d = (x - point.x) ** 2 + (z - point.z) ** 2;
                if (d < best) { best = d; found = i; }
            }
            return found;
        };
        // A crack's branches are scattered about it and can sit under the road at a wall's foot
        const decals = [];
        scene.traverse(object => { if (object.userData.decal && object.userData.decal !== 'branch') decals.push(object); });
        let onDrop = 0;
        decals.forEach(decal => {
            const segment = nearest(decal.position.x, decal.position.z);
            const point = env.roadPath[segment];
            const lateral = (decal.position.x - point.x) * Math.cos(point.heading) - (decal.position.z - point.z) * Math.sin(point.heading);
            const drop = game.Terrain.sideAt(env.terrain, Math.sign(lateral), segment).face?.kind === 'drop';
            if (drop) {
                onDrop++;
                expect(decal.position.y).toBeLessThan(point.y);
            } else {
                expect(decal.position.y).toBeGreaterThan(point.y);
            }
        });
        expect(onDrop).toBeGreaterThan(0);
        // Debris on the road comes off a wall only: never beside the drop
        env.groundedObjects.filter(({ label }) => /^road debris rock/.test(label)).forEach(({ object }) => {
            const segment = nearest(object.position.x, object.position.z);
            const point = env.roadPath[segment];
            const lateral = (object.position.x - point.x) * Math.cos(point.heading) - (object.position.z - point.z) * Math.sin(point.heading);
            expect(game.Terrain.sideAt(env.terrain, Math.sign(lateral), segment).face?.kind).toBe('rise');
        });
    });

    test('the gorge has no trees, no roadworks plant on the wall, no mountain backdrop, and both walls are dressed', () => {
        const { env, scene } = leg(GORGE);
        // (the tunnels' lamp strips are instanced, and belong to their set piece)
        const instanced = meshesOf(scene, object => object.isInstancedMesh && !object.parent.userData.setPiece);
        expect(instanced).toEqual([]);
        const labels = env.groundedObjects.map(({ label }) => label);
        expect(labels.filter(label => /construction bulldozer|construction barrier|work truck/.test(label))).toEqual([]);
        expect(env.solidClutter).toBe(false);
        // The containers and the ramp are on the road and stay
        expect(labels.some(label => /shipping container/.test(label))).toBe(true);
        expect(labels.filter(label => /embedded cliff rock .*side -1\)$/.test(label)).length).toBeGreaterThan(10);
        expect(labels.filter(label => /embedded cliff rock .*side 1\)$/.test(label)).length).toBeGreaterThan(10);
        // None inside either tunnel
        const inTunnel = labels.filter(label => {
            const match = label.match(/segment (\d+)/);
            const segment = match && Number(match[1]);
            return match && ((segment >= 265 && segment <= 271) || (segment >= 286 && segment <= 293)) && /rock|bush|post/.test(label);
        });
        expect(inTunnel).toEqual([]);
        expect(env.boulders.filter(b => b.solid)).toEqual([]);
        expect(scene.children.some(child => child.userData.type === 'mountain')).toBe(false);
    });

    test('the gorge tunnels each have a roof 7.5 m up, of rock, and the cliff road between them has none', () => {
        const { env, scene } = leg(GORGE);
        const tunnels = scene.children.filter(child => child.name === 'tunnel');
        expect(tunnels).toHaveLength(2);
        const roof = meshesOf(scene, object => object.parent.name === 'tunnel');
        for (const segment of [268, 290]) {
            const [x, z] = world(env, segment, 0);
            const hit = cast(roof, [x, env.roadPath[segment].y + 0.5, z], [0, 1, 0]);
            expect(Math.abs(hit.distance + 0.5 - 7.5)).toBeLessThan(0.6);
        }
        const [x, z] = world(env, 278, 0);
        expect(cast(roof, [x, env.roadPath[278].y + 0.5, z], [0, 1, 0])).toBeNull();
        // The cap over each tunnel is the gorge's rock, not the forest's grass
        tunnels.forEach(group => expect(group.children[1].material.color.getHex()).toBe(0x5e5850));
    });

    test('P-W10: the tunnel has a roof 7.5 m up, and none outside it', () => {
        const { env, scene } = leg(NIGHT);
        const tunnel = meshesOf(scene, object => object.parent.name === 'tunnel');
        // Lining, hill, portals and a lamp strip
        expect(tunnel).toHaveLength(4);
        for (const lateral of [0, -3, 3]) {
            const [x, z] = world(env, 517, lateral);
            const hit = cast(tunnel, [x, env.roadPath[517].y + 0.5, z], [0, 1, 0]);
            expect(Math.abs(hit.distance + 0.5 - (lateral === 0 ? 7.5 : 7.5 * Math.sqrt(1 - (lateral / 9) ** 2)))).toBeLessThan(0.6);
        }
        const [x, z] = world(env, 530, 0);
        expect(cast(tunnel, [x, env.roadPath[530].y + 0.5, z], [0, 1, 0])).toBeNull();
        // Portals: a ray along the road from before the tunnel meets the portal face
        const before = env.roadPath[512];
        const forward = [Math.sin(before.heading), 0, Math.cos(before.heading)];
        const portal = cast(tunnel, [before.x, before.y + 8.5, before.z], forward);
        expect(portal).not.toBeNull();
        expect(Math.abs(portal.distance - 30)).toBeLessThan(1);
    });

    test('the camera stays under the roof: Game.tunnelRoofY reads the span at the bike and a segment either side', () => {
        const { env } = leg(NIGHT);
        const self = { environment: env, vehicle: { currentRoadSegment: 517 } };
        const { tunnelRoofY } = gameMethods(['tunnelRoofY'], self, { Terrain: game.Terrain });
        const road = segment => env.roadPath[segment].y;
        expect(tunnelRoofY()).toBeCloseTo(road(517) + 7.5, 9);
        // The camera trails the bike: just outside either end still counts
        self.vehicle.currentRoadSegment = 513;
        // ... and the roof rides on the lower of the road under it and the bike's own
        expect(tunnelRoofY()).toBeCloseTo(Math.min(road(513), road(514)) + 7.5, 9);
        self.vehicle.currentRoadSegment = 522;
        expect(tunnelRoofY()).toBeCloseTo(Math.min(road(522), road(521)) + 7.5, 9);
        self.vehicle.currentRoadSegment = 530;
        expect(tunnelRoofY()).toBeNull();
        self.vehicle.currentRoadSegment = 586;
        expect(tunnelRoofY()).toBeNull();
        // A leg with no set pieces never asks the profile
        const dawn = leg(0).env;
        expect(gameMethods(['tunnelRoofY'], { environment: dawn, vehicle: { currentRoadSegment: 517 } }, { Terrain: game.Terrain }).tunnelRoofY()).toBeNull();
    });

    test('the menu preview stands between the gorge walls and in the gap above the forest road', () => {
        const { Terrain } = game;
        expect(Terrain.legConfig('foggy-gorge').preview).toEqual({ radius: 3, height: 8 });
        expect(Terrain.legConfig('night-ride').preview).toEqual({ radius: 8, height: 5 });
        // Both radii are inside the road edge or the clear gap beside it
        expect(Terrain.legConfig('foggy-gorge').preview.radius).toBeLessThan(10);
        expect(Terrain.legConfig('night-ride').preview.radius).toBeLessThanOrEqual(8 + 5);
    });

    test('the camera clamp runs once in updateCamera, after the camera takes the position and after the shake', () => {
        const source = loadScript('main.js');
        const minimum = source.indexOf('const minCameraHeight');
        const apply = source.indexOf('this.camera.position.copy(this.currentCameraPos);', minimum);
        const shake = source.indexOf('this.camera.position.y += (Math.random() - 0.5) * shakeIntensity', apply);
        const clamp = source.indexOf('this.tunnelRoofY()');
        expect(minimum).toBeGreaterThan(0);
        expect(apply).toBeGreaterThan(minimum);
        expect(shake).toBeGreaterThan(apply);
        expect(clamp).toBeGreaterThan(shake);
        // One roof read and one clamp: the camera itself is held at roofY - 1.0
        expect(source.split('this.tunnelRoofY()')).toHaveLength(2);
        expect(source.split('roofY - 1.0')).toHaveLength(3);
        expect(source.slice(clamp, clamp + 400)).toMatch(/this\.camera\.position\.y = Math\.max\(roofY - 1\.0, minCameraHeight\)/);
    });

    test('P-W11: the village is a group of at most five meshes, standing at its own centre, and adds no light', () => {
        const { env, scene } = leg(NIGHT);
        const village = scene.children.find(child => child.name === 'village');
        const tunnel = scene.children.find(child => child.name === 'tunnel');
        expect(village.children.length).toBeLessThanOrEqual(5);
        expect(village.children.length).toBeGreaterThanOrEqual(4);
        let lights = 0;
        scene.traverse(object => { if (object.isLight) lights++; });
        expect(lights).toBe(0);
        // Each mesh stands at the middle of the piece, so culling by origin reads the piece
        const mid = env.roadPath[Math.floor((583 + 590) / 2)];
        village.children.forEach(mesh => {
            expect(mesh.position.x).toBeCloseTo(mid.x, 6);
            expect(mesh.position.z).toBeCloseTo(mid.z, 6);
        });
        tunnel.children.forEach(mesh => expect(mesh.position.x).not.toBe(0));
        // Houses stand past the pavement, on both sides, and some windows are lit
        const houses = village.children[0];
        houses.geometry.computeBoundingBox();
        expect(houses.geometry.boundingBox.max.y - houses.geometry.boundingBox.min.y).toBeGreaterThan(6);
        expect(village.children.some(mesh => mesh.material.emissive && mesh.material.emissive.getHex() !== 0)).toBe(true);
    });

    test('P-W5: night-ride has dense trees outside its set pieces and none in or beside them', () => {
        const { env, scene } = leg(NIGHT);
        const matrix = new game.THREE.Matrix4();
        const nearest = (x, z) => {
            let best = Infinity;
            let found = 0;
            for (let i = env.startSegment; i <= env.endSegment + 20; i++) {
                const point = env.roadPath[i];
                const d = (x - point.x) ** 2 + (z - point.z) ** 2;
                if (d < best) { best = d; found = i; }
            }
            return found;
        };
        let count = 0;
        let inside = 0;
        scene.traverse(object => {
            if (!object.isInstancedMesh || object.parent.userData.setPiece) return;
            for (let n = 0; n < object.count; n++) {
                object.getMatrixAt(n, matrix);
                const segment = nearest(matrix.elements[12], matrix.elements[14]);
                count++;
                if ((segment >= 513 && segment <= 522) || (segment >= 582 && segment <= 591)) inside++;
            }
        });
        expect(count).toBeGreaterThan(400);
        expect(count).toBeLessThanOrEqual(1400);
        expect(inside).toBe(0);
        expect(new game.RockfallSystem(scene, env).enabled).toBe(false);
    });

    test('the drawn ribbon agrees with the ground at the edges of each span', () => {
        for (const [index, segments, laterals] of [
            [NIGHT, [513, 514, 517, 521, 522, 583, 586, 590, 591], [-20, -12, -9.5, 9.5, 12, 20]],
            [GORGE, [264, 265, 268, 271, 272, 278, 285, 286, 290, 293, 294, 305], [-30, -20, -15, 15, 20, 30]]
        ]) {
            const { env, scene } = leg(index);
            const ground = ribbons(scene);
            expect(ground.length).toBeGreaterThan(0);
            for (const segment of segments) {
                for (const lateral of laterals) {
                    const [x, z] = world(env, segment, lateral);
                    const hit = cast(ground, [x, 500, z], [0, -1, 0]);
                    if (!hit) continue;
                    // The model reads the drawn triangles: the highest a ray meets, folds and blends alike
                    expect(Math.abs(hit.y - env.groundYAt(x, z))).toBeLessThanOrEqual(5e-3);
                }
            }
        }
    });
});

describe('the bike at the pieces', () => {
    let game;
    let log;
    const envs = new Map();

    beforeAll(() => {
        log = [];
        game = loadGame(undefined, log);
    });

    function environment(index) {
        if (!envs.has(index)) envs.set(index, buildEnvironment(game, index));
        const entry = envs.get(index);
        // Ground and walls, not the clutter on it
        entry.env.boulders = [];
        return entry;
    }

    function place(index, segment, lateral, speed) {
        const { env, scene } = environment(index);
        const vehicle = new game.Vehicle(scene);
        const point = env.roadPath[segment];
        vehicle.environment = env;
        vehicle.position.set(
            point.x + Math.cos(point.heading) * lateral,
            point.y,
            point.z - Math.sin(point.heading) * lateral
        );
        vehicle.yawAngle = point.heading;
        vehicle.speed = speed;
        vehicle.currentRoadSegment = segment;
        return vehicle;
    }

    function ride(vehicle, ticks) {
        log.length = 0;
        const history = [null];
        for (let tick = 1; tick <= ticks; tick++) {
            vehicle.update(DT, 0, 0, 0);
            history.push({ speed: vehicle.speed, crashed: vehicle.crashed, falling: vehicle.fallingOffCliff, offRoad: vehicle.offRoadTime });
        }
        const crashTick = history.findIndex(entry => entry && entry.crashed);
        return { history, crashTick: crashTick === -1 ? null : crashTick, lines: log.filter(line => CRASHES.test(line)) };
    }

    test('P22: the tunnel walls crash a bike at once, on either side, and the forest before and after is run-off', () => {
        for (const [lateral, side] of [[9.5, 'right'], [-9.5, 'left']]) {
            const { history, crashTick, lines } = ride(place(NIGHT, 517, lateral, 25), 5);
            expect(crashTick).toBe(1);
            expect(history[1].falling).toBe(false);
            expect(lines.some(line => line.startsWith(`CRASHED! Hit the ${side} wall at`))).toBe(true);
        }
        [510, 530].forEach(segment => {
            const { history, crashTick } = ride(place(NIGHT, segment, 9.5, 25), 60);
            expect(crashTick).toBeNull();
            expect(history[60].offRoad).toBeCloseTo(1.0, 1);
        });
    });

    test('the village: the pavement is run-off, the house fronts are walls', () => {
        const pavement = ride(place(NIGHT, 586, 10.5, 25), 90);
        expect(pavement.crashTick).toBeNull();
        expect(pavement.history[90].speed).toBeLessThan(pavement.history[1].speed);
        const front = ride(place(NIGHT, 586, 11.5, 25), 5);
        expect(front.crashTick).toBe(1);
        expect(front.lines.some(line => line.startsWith('CRASHED! Hit the right wall at'))).toBe(true);
        const leftFront = ride(place(NIGHT, 586, -11.5, 25), 5);
        expect(leftFront.crashTick).toBe(1);
    });

    test('the cliff roads: the drop side falls, the wall side crashes, the ledge is ridden, the tunnel lining crashes', () => {
        // Segment 278: wall left, drop right; segment 305: the other way round
        for (const [segment, wall, sideName] of [[278, -1, 'right'], [305, 1, 'left']]) {
            const over = ride(place(GORGE, segment, -wall * 12.5, 25), 5);
            // Over the lip within two ticks (the edge has half a metre of hysteresis)
            expect(over.crashTick).toBeLessThanOrEqual(2);
            expect(over.history[over.crashTick].falling).toBe(true);
            expect(over.lines.some(line => line.startsWith(`CRASHED! Fell off the ${sideName} edge`))).toBe(true);
            const into = ride(place(GORGE, segment, wall * 11.5, 25), 5);
            expect(into.crashTick).toBeLessThanOrEqual(2);
            expect(into.history[into.crashTick].falling).toBe(false);
            // A metre onto the drop's 2 m ledge (half a metre of hysteresis would put 11.5 on the lip)
            const ledge = ride(place(GORGE, segment, -wall * 11, 25), 5);
            expect(ledge.crashTick).toBeNull();
        }
        for (const segment of [268, 290]) {
            [11.5, -11.5].forEach(lateral => {
                const lining = ride(place(GORGE, segment, lateral, 25), 5);
                expect(lining.crashTick).toBe(1);
                expect(lining.history[1].falling).toBe(false);
            });
        }
    });

    test('P18: a wall on the right crashes a bike at once, with no fall', () => {
        const vehicle = place(GORGE, 240, 11.5, 25);
        const { history, crashTick, lines } = ride(vehicle, 5);
        expect(crashTick).toBe(1);
        expect(history[1].falling).toBe(false);
        expect(vehicle.crashAngle).toBeCloseTo(Math.PI / 6, 9);
        expect(lines.some(line => line.startsWith('CRASHED! Hit the right wall at'))).toBe(true);
        expect(history[1].speed).toBeLessThanOrEqual(5);
        // The second tunnel's lining, at its first segment, is a wall too
        expect(ride(place(GORGE, 286, 11.5, 25), 5).crashTick).toBe(1);
    });

    test('coasting on the road never crashes through the gorge tunnels, its cliff roads, the night tunnel or the village', () => {
        [[GORGE, 262], [GORGE, 268], [GORGE, 276], [GORGE, 290], [GORGE, 300], [NIGHT, 512], [NIGHT, 516], [NIGHT, 583]].forEach(([index, segment]) => {
            expect(ride(place(index, segment, 0, 25), 200).crashTick).toBeNull();
        });
    });
});

describe('rockfalls from the walls of the gorge (P-W12)', () => {
    let game;
    let env;
    let scene;

    beforeAll(() => {
        game = loadGame();
        ({ env, scene } = buildEnvironment(game, GORGE));
    });

    function nearestSegment(position) {
        let best = Infinity;
        let found = 0;
        for (let i = env.startSegment; i <= env.endSegment + 20; i++) {
            const point = env.roadPath[i];
            const d = (position.x - point.x) ** 2 + (position.z - point.z) ** 2;
            if (d < best) { best = d; found = i; }
        }
        return found;
    }

    function falls(start, times) {
        const results = [];
        const random = seeded(7);
        const restore = seedMath(random);
        try {
            for (let n = 0; n < times; n++) {
                const rockfalls = new game.RockfallSystem(scene, env);
                const target = rockfalls.triggerFall({ currentRoadSegment: start });
                const rocks = rockfalls.rocks.map(rock => {
                    const segment = nearestSegment(rock.mesh.position);
                    const point = env.roadPath[segment];
                    const perp = [Math.cos(point.heading), -Math.sin(point.heading)];
                    const lateral = (rock.mesh.position.x - point.x) * perp[0] + (rock.mesh.position.z - point.z) * perp[1];
                    const toward = rock.velocity.x * perp[0] + rock.velocity.z * perp[1];
                    return { segment, lateral, toward };
                });
                rockfalls.dispose();
                results.push({ target, rocks });
            }
        } finally {
            restore();
        }
        return results;
    }

    // Math.random replaced by a seeded stream for the length of a probe
    function seedMath(random) {
        const original = Math.random;
        Math.random = random;
        return () => { Math.random = original; };
    }

    test('the gorge sheds rocks at 0.5, and both walls are possible', () => {
        const rockfalls = new game.RockfallSystem(scene, env);
        expect([rockfalls.enabled, rockfalls.intensity]).toEqual([true, 0.5]);
        rockfalls.dispose();
    });

    test('from segment 240 (the canyon): 2 to 4 rocks a fall, from both walls, each moving toward the road', () => {
        const results = falls(240, 20);
        const signs = new Set();
        results.forEach(({ rocks }) => {
            expect(rocks.length).toBeGreaterThanOrEqual(2);
            expect(rocks.length).toBeLessThanOrEqual(4);
            rocks.forEach(({ lateral, toward }) => {
                signs.add(Math.sign(lateral));
                expect(Math.sign(lateral)).toBe(-Math.sign(toward));
            });
            // One wall sheds a whole fall
            expect(new Set(rocks.map(rock => Math.sign(rock.lateral))).size).toBe(1);
        });
        expect([...signs].sort()).toEqual([-1, 1]);
    });

    test('a fall aimed at a tunnel, or the segment beside one, adds no rock; and no rock starts in a tunnel', () => {
        const widened = target => (target >= 264 && target <= 272) || (target >= 285 && target <= 294);
        // Every target 3 to 6 segments ahead of these lies in a widened tunnel
        [261, 262, 266, 282, 284, 288].forEach(start => {
            falls(start, 20).forEach(({ target, rocks }) => {
                expect(widened(target)).toBe(true);
                expect(rocks).toEqual([]);
            });
        });
        [250, 256, 276, 278, 296].forEach(start => {
            falls(start, 20).forEach(({ target, rocks }) => {
                expect(rocks.length === 0).toBe(widened(target));
                rocks.forEach(({ segment }) => expect((segment >= 265 && segment <= 271) || (segment >= 286 && segment <= 293)).toBe(false));
            });
        });
    });

    test('on a cliff road every rock comes off the wall, never out of the drop', () => {
        for (const [start, wall] of [[274, -1], [300, 1]]) {
            const rocks = falls(start, 20).flatMap(result => result.rocks);
            expect(rocks.length).toBeGreaterThan(20);
            rocks.forEach(({ lateral, toward }) => {
                expect(Math.sign(lateral)).toBe(wall);
                expect(Math.sign(toward)).toBe(-wall);
            });
        }
    });

    test('a leg with one wall draws no extra random number for the choice of wall', () => {
        const { env: hairpin, scene: hairScene } = buildEnvironment(game, 4);
        const rockfalls = new game.RockfallSystem(hairScene, hairpin);
        let draws = 0;
        const original = Math.random;
        Math.random = () => { draws++; return 0.5; };
        try {
            rockfalls.triggerFall({ currentRoadSegment: 332 });
        } finally {
            Math.random = original;
        }
        // How far ahead, how many, then 18 for each rock: the count measured on the
        // code before a fall could choose between two walls
        expect(rockfalls.rocks.length).toBeGreaterThanOrEqual(2);
        expect(draws).toBe(2 + 18 * rockfalls.rocks.length);
    });

    // Rocks tumble for 10 s from where they are aimed; the share that gets as far as
    // the tarmac is what makes a fall a hazard
    function tumble(environment, environmentScene, start, falls) {
        const half = environment.roadWidth / 2;
        const restore = seedMath(seeded(11));
        const bySign = { '-1': { total: 0, reached: 0 }, 1: { total: 0, reached: 0 } };
        try {
            for (let n = 0; n < falls; n++) {
                const rockfalls = new game.RockfallSystem(environmentScene, environment);
                rockfalls.triggerFall({ currentRoadSegment: start });
                const rocks = rockfalls.rocks.slice();
                const closest = rocks.map(() => Infinity);
                const side = rocks.map(() => 0);
                for (let tick = 0; tick < 600; tick++) {
                    rockfalls.update(1 / 60, null);
                    rocks.forEach((rock, i) => {
                        let nearest = rockfalls.lastFallSegment;
                        let best = Infinity;
                        for (let k = rockfalls.lastFallSegment - 3; k <= rockfalls.lastFallSegment + 3; k++) {
                            const point = environment.roadPath[k];
                            const d = (rock.mesh.position.x - point.x) ** 2 + (rock.mesh.position.z - point.z) ** 2;
                            if (d < best) { best = d; nearest = k; }
                        }
                        const point = environment.roadPath[nearest];
                        const lateral = (rock.mesh.position.x - point.x) * Math.cos(point.heading) - (rock.mesh.position.z - point.z) * Math.sin(point.heading);
                        if (tick === 0) side[i] = Math.sign(lateral);
                        closest[i] = Math.min(closest[i], Math.abs(lateral));
                    });
                }
                rocks.forEach((rock, i) => {
                    bySign[side[i]].total++;
                    if (closest[i] < half) bySign[side[i]].reached++;
                });
                rockfalls.dispose();
            }
        } finally {
            restore();
        }
        return bySign;
    }

    test('rocks off the gorge walls reach the road from each wall', () => {
        const result = tumble(env, scene, 240, 60);
        expect(result['-1'].total).toBeGreaterThan(20);
        expect(result[1].total).toBeGreaterThan(20);
        expect(result['-1'].reached / result['-1'].total).toBeGreaterThan(0.9);
        expect(result[1].reached / result[1].total).toBeGreaterThan(0.9);
    }, 60000);

    test('on the hairpin leg the exact left wall (D6) keeps rocks reaching the road: 164 of 166 seeded rocks before, at least 158 now', () => {
        const { env: hairpin, scene: hairScene } = buildEnvironment(game, 4);
        const { '-1': left } = tumble(hairpin, hairScene, 332, 60);
        expect(left.total).toBe(166);
        expect(left.reached).toBeGreaterThanOrEqual(158);
    }, 60000);

    test('a rock that tumbles down a wall is gone within a minute: none rests on the wall for good', () => {
        const restore = seedMath(seeded(5));
        try {
            const rockfalls = new game.RockfallSystem(scene, env);
            rockfalls.triggerFall({ currentRoadSegment: 240 });
            expect(rockfalls.rocks.length).toBeGreaterThan(0);
            for (let tick = 0; tick < 60 * 60; tick++) rockfalls.update(1 / 60, null);
            expect(rockfalls.rocks).toEqual([]);
            rockfalls.dispose();
        } finally {
            restore();
        }
    }, 60000);
});

describe('what the roadworks plant left behind on the cliff legs (P23, amended)', () => {
    let game;
    let log;
    const built = new Map();

    beforeAll(() => {
        log = [];
        game = loadGame(undefined, log);
    });

    function leg(index) {
        if (!built.has(index)) built.set(index, buildEnvironment(game, index));
        const entry = built.get(index);
        entry.env.boulders = [];
        return entry;
    }

    test.each([[1, 10], [4, 8]])('leg %i: hairpin barrier entries sit where their mesh does, clear of the road edge', (index, halfRoad) => {
        const { env } = leg(index);
        const entries = env.roadworkObstacles.filter(o => o.type === 'hairpin_barrier');
        expect(entries.length).toBe(index === 4 ? 36 : 0);
        const barriers = env.groundedObjects.filter(({ label }) => /^hairpin barrier/.test(label));
        entries.forEach(entry => {
            const mesh = barriers.find(({ object }) => Math.abs(object.position.x - entry.position.x) < 1e-9 && Math.abs(object.position.z - entry.position.z) < 1e-9);
            expect(mesh).toBeDefined();
            expect(Math.abs(mesh.object.position.y - entry.position.y)).toBeLessThan(1e-9);
            // The collision distance (2) never reaches the tarmac from the barrier's lateral, halfRoad + 2.5
            const loc = game.Terrain.locate(env.roadPath, entry.position.x, entry.position.z, 0, env.roadPath.length - 1, {});
            expect(Math.abs(loc.lateral) - 2).toBeGreaterThanOrEqual(halfRoad);
        });
    });

    test.each([[1, 10], [4, 8]])('leg %i: riding past where the bulldozer, barrier and work truck stood crashes on none of them', (index, halfRoad) => {
        const { env, scene } = leg(index);
        const zones = env.roadworksZones;
        expect(zones.length).toBeGreaterThan(0);
        for (const zone of zones) {
            for (const segment of [zone.startSegment, Math.floor((zone.startSegment + zone.endSegment) / 2), zone.endSegment]) {
                const vehicle = new game.Vehicle(scene);
                const point = env.roadPath[segment];
                const lateral = -(halfRoad - 0.5);
                vehicle.environment = env;
                vehicle.position.set(point.x + Math.cos(point.heading) * lateral, point.y, point.z - Math.sin(point.heading) * lateral);
                vehicle.yawAngle = point.heading;
                vehicle.speed = 25;
                vehicle.currentRoadSegment = segment;
                log.length = 0;
                for (let tick = 0; tick < 60; tick++) vehicle.update(DT, 0, 0, 0);
                // A container on the road may be in the way: none of the three props is
                expect(log.filter(line => /Hit construction (bulldozer|barrier|worktruck)|Hit a (bulldozer|barrier|work truck)|Hit the left wall/.test(line))).toEqual([]);
            }
        }
    });

    test('all eight legs build with spans, set pieces and the exact wall: nothing floats, nothing overlaps the road (P24)', () => {
        for (let index = 0; index < 8; index++) {
            log.length = 0;
            const { env } = buildEnvironment(game, index);
            expect(log.filter(line => /FLOATING|TERRAIN-ROAD OVERLAP/.test(line))).toEqual([]);
            expect(log.some(line => line.includes('Grounding validation passed'))).toBe(true);
            expect(env.finishGate).not.toBeNull();
            expect(env.checkpoints).toHaveLength(5);
        }
    }, 60000);
});
