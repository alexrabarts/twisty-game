// Every sign, post, chevron, marker and gate pole stands clear of a wall: no
// vertex of one lies in a wall band (Terrain.zoneAt) at its nearest segment,
// on any leg. Builds the real legs with the real three r150.
import { describe, test, expect, beforeAll } from '@jest/globals';
import { loadGame, buildEnvironment } from '../helpers/load-game.js';

const LEG_COUNT = 8;

describe('roadside signs', () => {
    let game;

    beforeAll(() => {
        game = loadGame();
    });

    // Every vertex of every object tagged userData.sign that lies in a wall band,
    // with how deep into the band it reaches
    function embedded(env, scene) {
        const { Terrain, THREE } = game;
        const halfRoad = env.roadWidth / 2;
        const last = Math.min(env.roadPath.length - 1, env.endSegment + 20);
        const nearest = (x, z) => {
            let best = Infinity;
            let at = env.startSegment;
            for (let s = env.startSegment; s <= last; s++) {
                const p = env.roadPath[s];
                const d = (x - p.x) ** 2 + (z - p.z) ** 2;
                if (d < best) { best = d; at = s; }
            }
            const p = env.roadPath[at];
            return { segment: at, lateral: (x - p.x) * Math.cos(p.heading) - (z - p.z) * Math.sin(p.heading) };
        };
        const signs = [];
        scene.traverse(object => { if (object.userData.sign) signs.push(object); });
        const found = [];
        const v = new THREE.Vector3();
        signs.forEach(sign => sign.traverse(mesh => {
            if (!mesh.isMesh) return;
            const position = mesh.geometry.attributes.position;
            for (let k = 0; k < position.count; k++) {
                v.fromBufferAttribute(position, k).applyMatrix4(mesh.matrixWorld);
                const { segment, lateral } = nearest(v.x, v.z);
                const zone = Terrain.zoneAt(env.terrain, segment, lateral, halfRoad);
                if (zone.kind === 'wall') found.push({ segment, lateral, depth: Math.abs(lateral) - zone.start });
            }
        }));
        return { signs, found };
    }

    test.each(Array.from({ length: LEG_COUNT }, (_, i) => i))('leg %i: no sign reaches into a wall band', index => {
        const { env, scene } = buildEnvironment(game, index);
        const { signs, found } = embedded(env, scene);
        // Delineator posts and the gates at least, on every leg
        expect(signs.length).toBeGreaterThan(50);
        expect(found).toEqual([]);
    });

    test('the probe sees a sign set into a wall', () => {
        // High-pass has a wall on its left: a post a metre and a half past that edge is in it
        const { env, scene } = buildEnvironment(game, 4);
        const point = env.roadPath[340];
        const lateral = -(env.roadWidth / 2 + 1.5);
        const post = new game.THREE.Mesh(new game.THREE.CylinderGeometry(0.1, 0.1, 1.5));
        post.position.set(point.x + Math.cos(point.heading) * lateral, point.y, point.z - Math.sin(point.heading) * lateral);
        post.userData.sign = true;
        scene.add(post);
        scene.updateMatrixWorld(true);
        expect(embedded(env, scene).found.length).toBeGreaterThan(0);
    });

    test('high-pass warning boards stand on the drop side, clear of the wall', () => {
        const { env } = buildEnvironment(game, 4);
        const boards = env.groundedObjects.filter(({ label }) => /^hairpin warning sign|^construction sign/.test(label));
        expect(boards.length).toBe(6);
        boards.forEach(({ object }) => {
            const p = env.roadPath[env.roadPath.reduce((best, q, i) => (Math.hypot(q.x - object.position.x, q.z - object.position.z) < Math.hypot(env.roadPath[best].x - object.position.x, env.roadPath[best].z - object.position.z) ? i : best), env.startSegment)];
            const lateral = (object.position.x - p.x) * Math.cos(p.heading) - (object.position.z - p.z) * Math.sin(p.heading);
            expect(lateral).toBeCloseTo(env.roadWidth / 2 + 1.2, 1);
        });
    });
});
