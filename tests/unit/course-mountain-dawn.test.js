// Leg 1, Mountain Dawn, at full length (js/course.js): 700 segments in six
// parts from the plain into the mountains, a gate about every kilometre, real
// climbs and a crest, built by section like every converted leg.
import { describe, test, expect, beforeAll } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { loadGame } from '../helpers/load-game.js';
import { quietly, build, buildAll, sectionHash, seamReport, groundReport } from '../helpers/sections.js';

const LEG = 0;

describe('Mountain Dawn, the course', () => {
    let game;
    let course;
    beforeAll(() => {
        game = loadGame();
        course = game.Course.LEGS['mountain-dawn'];
    });

    test('the course passes every rule of the validator', () => {
        expect(game.Terrain.validateCourse(course)).toEqual([]);
    });

    test('it is 700 segments (14 km) in the six parts of the outline, each with its landmark', () => {
        expect(course.segments).toBe(700);
        expect(course.parts.map((part) => [part.id, part.from, part.to])).toEqual([
            ['meadow', 0, 120], ['wood', 120, 250], ['valley', 250, 400],
            ['village', 400, 470], ['lake', 470, 620], ['pass', 620, 700]
        ]);
        course.parts.forEach((part) => {
            expect(part.landmark.at).toBeGreaterThanOrEqual(part.from);
            expect(part.landmark.at).toBeLessThan(part.to);
        });
    });

    test('gates: 14, one about every kilometre, the last 6 segments before the finish line', () => {
        expect(course.gates).toHaveLength(14);
        course.gates.forEach((gate, n) => {
            const gap = gate - (n === 0 ? 5 : course.gates[n - 1]);
            expect(gap).toBeGreaterThanOrEqual(40);
            expect(gap).toBeLessThanOrEqual(60);
        });
        expect(course.segments + 4 - course.gates[13]).toBe(6);
    });

    test('a new board, mountain-dawn-v3, and the server\'s copy of its row', () => {
        expect(game.TourSystem.boardId('mountain-dawn')).toBe('mountain-dawn-v3');
        const table = JSON.parse(readFileSync(new URL('../../functions/courses.json', import.meta.url), 'utf8'));
        expect(game.Course.boardTable()).toEqual(table);
        expect(table).toEqual({ 'mountain-dawn-v3': { gates: 14, segments: 700 } });
    });
});

describe('Mountain Dawn, as built', () => {
    let game;
    let env;
    let cones;
    beforeAll(() => {
        game = loadGame();
        ({ env, cones } = build(game, LEG));
        buildAll(env);
    });

    test('the road is 700 segments plus the 30-segment tail, with 28 sections', () => {
        expect([env.startSegment, env.endSegment]).toEqual([0, 699]);
        expect(env.roadPath).toHaveLength(730);
        expect(env.sections).toHaveLength(28);
        expect(env.checkpoints.map((gate) => gate.segmentIndex)).toEqual([50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600, 650, 698]);
        expect(env.finishGate.segmentIndex).toBe(704);
    });

    test('climbs: relief of 150 m or more, no step over 1.2 m, a 50 m climb and a crest', () => {
        const heights = env.roadPath.slice(0, 700).map((point) => point.y);
        const relief = Math.max(...heights) - Math.min(...heights);
        expect(relief).toBeGreaterThanOrEqual(150);
        let step = 0;
        for (let i = 1; i < heights.length; i++) step = Math.max(step, Math.abs(heights[i] - heights[i - 1]));
        expect(step).toBeLessThanOrEqual(1.2);
        // The longest unbroken climb (the road never drops more than 1 m on it)
        let best = 0;
        let low = heights[0];
        for (const y of heights) {
            if (y < low) low = y;
            best = Math.max(best, y - low);
        }
        expect(best).toBeGreaterThanOrEqual(50);
        // The crest of the pass: the highest point stands between 640 and 680 and the road falls after it
        const top = heights.indexOf(Math.max(...heights));
        expect(top).toBeGreaterThan(640);
        expect(top).toBeLessThan(680);
        expect(heights[699]).toBeLessThan(heights[top] - 10);
    });

    test('each part has its own ground: river, wood, closing valley, village, lake, ridge', () => {
        const kind = (s) => game.Terrain.floorAt(env.terrain, s).kind;
        expect([60, 185, 325, 435, 545, 660].map(kind)).toEqual(['river', 'none', 'river', 'river', 'lake', 'lake']);
        // Set piece spans as Terrain.setPieces gives them: the last segment inclusive
        expect(env.setPieces).toEqual([{ type: 'bridge', from: 180, to: 182 }, { type: 'village', from: 410, to: 431 }]);
        const look = (s) => game.Terrain.lookAt(env.config, s);
        expect([60, 185, 325, 435, 545, 660].map((s) => look(s).timeOfDay)).toEqual(['dawn', 'dawn', 'dawn', 'golden', 'golden', 'golden']);
        expect(new Set([60, 185, 325, 435, 545, 660].map((s) => look(s).grassColor)).size).toBe(6);
    });

    test('the atmosphere track has its six looks, all clear (no weather intensity), dawn to golden', () => {
        const leg = new game.TourSystem().legs[LEG];
        const track = game.AtmosphereTrack.forLeg(leg, env.config, env);
        expect(track.parts.map((part) => [part.startSegment, part.look.timeOfDay, part.look.weather, part.look.weatherIntensity]))
            .toEqual([[0, 'dawn', 'clear', 0], [120, 'dawn', 'clear', 0], [250, 'dawn', 'clear', 0], [400, 'golden', 'clear', 0], [470, 'golden', 'clear', 0], [620, 'golden', 'clear', 0]]);
        // The height fog's base is each part's low road: the lake and the pass sit far above the plain
        const bases = track.parts.map((part) => part.look.baseY);
        expect(Math.max(...bases) - Math.min(...bases)).toBeGreaterThanOrEqual(50);
    });

    test('the leg builds with nothing floating and nothing over the road', () => {
        const log = [];
        const own = loadGame(undefined, log);
        const { env: built } = build(own, LEG);
        buildAll(built);
        expect(built.validateGrounding()).toEqual([]);
        expect(built.validateAllTerrainClearance()).toEqual([]);
    });

    test('roadworks plant stands only on run-off ground, near road height, never up a wall', () => {
        const plant = env.groundedObjects.filter(({ label }) => /^(construction bulldozer|construction barrier|work truck)/.test(label));
        const at = new game.THREE.Vector3();
        plant.forEach(({ object, label }) => {
            object.getWorldPosition(at);
            const found = game.Terrain.locate(env.roadPath, at.x, at.z, 0, env.roadPath.length - 1, {});
            const side = game.Terrain.sideAt(env.terrain, Math.sign(found.lateral) || 1, found.index);
            expect([label, !!side.runoff]).toEqual([label, true]);
            expect(Math.abs(at.y - env.roadPath[found.index].y)).toBeLessThan(3);
        });
        // The meadow-side zone has its plant; the lake road's zone (a wall on its left) has none
        expect(plant.some(({ object }) => object.position.distanceTo(new game.THREE.Vector3(env.roadPath[230].x, object.position.y, env.roadPath[230].z)) < 120)).toBe(true);
    });

    test('wall decals lie on the drawn face: no crack, seepage, vine or snow patch stands 1.5 m off its plane', () => {
        const point = new game.THREE.Vector3();
        const centre = new game.THREE.Vector3();
        const normal = new game.THREE.Vector3();
        let decals = 0;
        let worst = { off: 0 };
        env.sections.forEach((section) => section.group.traverse((object) => {
            if (!object.isMesh || !['crack', 'branch', 'seepage', 'vine', 'snow'].includes(object.userData.decal)) return;
            decals++;
            object.updateWorldMatrix(true, false);
            object.getWorldPosition(centre);
            // The face at the decal: its height there and its plane
            const surface = env.surfaceAt(centre.x, centre.z);
            normal.set(surface.nx, surface.ny, surface.nz).normalize();
            const base = new game.THREE.Vector3(centre.x, surface.y, centre.z);
            const position = object.geometry.attributes.position;
            for (let v = 0; v < position.count; v++) {
                point.fromBufferAttribute(position, v).applyMatrix4(object.matrixWorld);
                const off = Math.abs(point.clone().sub(base).dot(normal));
                if (off > worst.off) worst = { off, decal: object.userData.decal, centreAboveFace: centre.y - surface.y };
            }
        }));
        expect(decals).toBeGreaterThan(20);
        expect(worst.off).toBeLessThanOrEqual(1.5);
    });

    // A landmark peak once stood across the road at the head of the valley
    // (segments 392 to 411): the road ran into a mountain's flank. A vertical
    // line through the road and 40 m either side of its edges, at every
    // segment, meets no mountain mesh (landmark or backdrop) less than 5 m
    // under the road.
    test('no mountain stands on or over the road, or within 40 m of its edges', () => {
        const THREE = game.THREE;
        env.scene.updateMatrixWorld(true);
        const mountains = [];
        env.scene.traverse((object) => { if (object.isMesh && object.userData.type === 'mountain') mountains.push(object); });
        expect(mountains.length).toBeGreaterThanOrEqual(3);
        const ray = new THREE.Raycaster();
        const down = new THREE.Vector3(0, -1, 0);
        const from = new THREE.Vector3();
        const hits = [];
        const reach = env.roadWidth / 2 + 40;
        env.roadPath.forEach((point, i) => {
            for (let lateral = -reach; lateral <= reach; lateral += 10) {
                from.set(point.x + Math.cos(point.heading) * lateral, point.y + 3000, point.z - Math.sin(point.heading) * lateral);
                ray.set(from, down);
                const hit = ray.intersectObjects(mountains, false)[0];
                if (hit && hit.point.y > point.y - 5) hits.push([i, lateral, hit.object.parent.name]);
            }
        });
        expect(hits.slice(0, 5)).toEqual([]);
    });

    test('every landmark is built, named for its part', () => {
        ['meadow', 'wood', 'valley', 'village', 'lake', 'pass'].forEach((id) => {
            const group = env.scene.getObjectByName(`landmark-${id}`);
            let meshes = 0;
            group.traverse((object) => { if (object.isMesh) meshes++; });
            expect(meshes).toBeGreaterThan(0);
        });
    });

    test('sections join with no seam and the ground read is the ground drawn', () => {
        const seams = seamReport(game, env);
        expect(seams.seams).toBe(54);
        expect(seams.mismatches).toBe(0);
        expect(seams.worstNormal).toBeLessThanOrEqual(1e-6);
        const ground = groundReport(game, env, 200);
        expect(ground.missed).toBe(0);
        expect(ground.worst).toBeLessThanOrEqual(0.01);
        expect(ground.worstShoulder).toBeLessThanOrEqual(0.15);
    });

    test('cones: the leg\'s count, between 3 and 8 a kilometre', () => {
        expect(cones.cones).toHaveLength(82);
        expect(cones.cones.length / 14).toBeGreaterThanOrEqual(3);
        expect(cones.cones.length / 14).toBeLessThanOrEqual(8);
    });
});

describe('Mountain Dawn, build order', () => {
    test('every section is the same built forward, backward and by gate windows', () => {
        const game = loadGame();
        const forward = build(game, LEG).env;
        buildAll(forward);
        const backward = build(game, LEG, { window: 699 }).env;
        quietly(() => [...backward.sections].reverse().forEach((section) => backward.buildSectionNow(section)));
        const gates = build(game, LEG).env;
        quietly(() => {
            gates.sections.forEach((section) => section.state !== 'empty' && gates.disposeSection(section));
            // The leg start, then a restart window at each gate
            [0, ...gates.checkpoints.map((gate) => gate.segmentIndex)].forEach((s) => gates.ensureWindow(s, { sync: true }));
        });
        const hashes = [forward, backward, gates].map((env) => env.sections.map(sectionHash));
        expect(new Set(hashes[0]).size).toBe(28);
        expect(hashes[1]).toEqual(hashes[0]);
        expect(hashes[2]).toEqual(hashes[0]);
    }, 120000);
});

// The ground drawn from the road has no open edge in sight. A side once
// ended in the air at its last row, a sheet with no back, and the window
// ended 1 to 1.5 km ahead with the sides' cross-section: both showed from
// the road as pale slabs with straight edges (beyond the village, where the
// valley jogs). Every edge of the drawn ground (the window's ribbons and
// the far ground past it) that only one triangle uses, with both ends more
// than 5 m over the road, lies behind the bike or where the fog of its part
// has hidden 99% of it.
describe('Mountain Dawn, the edges of the drawn ground', () => {
    let game;
    let env;
    beforeAll(() => {
        game = loadGame();
        ({ env } = build(game, LEG));
    });

    test.each([1, 4, 7, 10, 13, 15, 16, 18, 20, 22, 24, 26])('window at section %i: no open edge of the ground stands over the road in sight', (k) => {
        const segment = k * 25 + 12;
        quietly(() => env.ensureWindow(segment, { sync: true }));
        const bike = env.roadPath[segment];
        const meshes = [];
        env.visibleSections().forEach((section) => section.group.traverse((object) => {
            if (object.isMesh && object.userData.side !== undefined && object.userData.firstColumn !== undefined) meshes.push(object);
        }));
        const far = env.fixed.getObjectByName('far-ground');
        if (far) meshes.push(far);
        const key = (array, i) => `${Math.round(array[i * 3] * 50)},${Math.round(array[i * 3 + 1] * 50)},${Math.round(array[i * 3 + 2] * 50)}`;
        const edges = new Map();
        meshes.forEach((mesh) => {
            const position = mesh.geometry.attributes.position.array;
            const index = mesh.geometry.index.array;
            for (let t = 0; t < index.length; t += 3) {
                // A triangle with no area closes no edge
                const corners = [0, 1, 2].map((e) => key(position, index[t + e]));
                if (new Set(corners).size < 3) continue;
                for (let e = 0; e < 3; e++) {
                    const a = index[t + e];
                    const b = index[t + (e + 1) % 3];
                    const ka = corners[e];
                    const kb = corners[(e + 1) % 3];
                    const id = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
                    const entry = edges.get(id);
                    if (entry) entry.n++;
                    else edges.set(id, { n: 1, a: [position[a * 3], position[a * 3 + 1], position[a * 3 + 2]], b: [position[b * 3], position[b * 3 + 1], position[b * 3 + 2]] });
                }
            }
        });
        const open = [];
        for (const { n, a, b } of edges.values()) {
            if (n !== 1) continue;
            const x = (a[0] + b[0]) / 2;
            const z = (a[2] + b[2]) / 2;
            const found = game.Terrain.locate(env.roadPath, x, z, 0, env.roadPath.length - 1, {});
            const road = env.roadPath[found.index];
            if (Math.min(a[1], b[1]) < road.y + 5) continue;
            if (found.index < segment) continue;
            const distance = Math.hypot(x - bike.x, (a[1] + b[1]) / 2 - bike.y, z - bike.z);
            const fog = game.Terrain.lookAt(env.config, found.index).fogDensity;
            if (1 - Math.exp(-((fog * distance) ** 2)) >= 0.99) continue;
            open.push([found.index, Math.round(distance), Math.round(Math.min(a[1], b[1]) - road.y)]);
        }
        expect(open.slice(0, 5)).toEqual([]);
    });
});
