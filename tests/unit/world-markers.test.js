// The checkpoint markers: at every checkpoint of the Tremola stage a pair of red and white roadworks boards stands on
// the verge, one each side, just outside the drawn carriageway and at the verge's drawn height. Only the start and the
// finish keep the gate arch. "Drawn" is the ride ribbon RoadMesh builds near the bike: the verge is part of it, at the
// road's height. The browser probe world-clearance (tools/terrain-check.mjs) casts on the drawn boards too.
import { describe, test, expect, beforeAll } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';

const game = loadGame();
const { THREE, WorldEnvironment, RoadMesh, Scenery } = game;

describe('the checkpoint markers', () => {
    let env, boards;
    beforeAll(async () => {
        const { fetchFn } = diskFetch();
        env = await WorldEnvironment.load(new THREE.Scene(), { id: 'tremola', fetchFn, models: null, digest: async () => '0' });
        await env.data.ensureChunks(env.data.manifest.chunks.map((_, k) => k));
        boards = [];
        const mesh = env.markerMesh;
        if (!mesh) return;
        // Every board, not only those near the bike (Scenery.placeMarkers)
        Scenery.placeMarkers(mesh, 0, 0, Infinity);
        mesh.geometry.computeBoundingBox();
        const box = mesh.geometry.boundingBox;
        const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
        for (let i = 0; i < mesh.count; i++) {
            mesh.getMatrixAt(i, matrix);
            matrix.decompose(position, rotation, scale);
            const at = env.route.project(position.x, position.z, null, {});
            // The footprint's half-width across the road: the boards face along it, so local x is across
            boards.push({ x: position.x, y: position.y, z: position.z, s: at.s, lateral: at.lateral, width: at.width, half: Math.max(-box.min.x, box.max.x), foot: box.min.y });
        }
    }, 300000);

    test('one instanced mesh holds every board', () => {
        expect(env.markerMesh).toBeTruthy();
        expect(env.markerMesh.isInstancedMesh).toBe(true);
        expect(env.markerMesh.name).toBe('world-markers');
        expect(env.markerMesh.userData.poses).toHaveLength(env.checkpoints.length * 2 * Scenery.MARKER_ALONG_M.length);
    });

    test('a board is a Swiss roadworks marker: about 2 m tall from its foot, about 0.19 m wide, in red and white bands', () => {
        const geometry = env.markerMesh.geometry;
        geometry.computeBoundingBox();
        const box = geometry.boundingBox;
        expect(box.max.y - box.min.y).toBeGreaterThan(1.9);
        expect(box.max.y - box.min.y).toBeLessThan(2.1);
        // The board and its stem (over the foot plate): its width across the road, and its colours (red at the foot and the top)
        const pos = geometry.attributes.position, color = geometry.attributes.color;
        let wide = 0;
        const red = [];
        for (let i = 0; i < pos.count; i++) {
            if (pos.getY(i) < 0.05) continue;
            wide = Math.max(wide, Math.abs(pos.getX(i)));
            if (color.getX(i) > 0.5 && color.getY(i) < 0.2) red.push(pos.getY(i));
        }
        expect(2 * wide).toBeGreaterThan(0.17);
        expect(2 * wide).toBeLessThan(0.21);
        expect(Math.min(...red)).toBeLessThan(0.2 + 0.01);
        expect(Math.max(...red)).toBeGreaterThan(box.max.y - 0.01);
    });

    test('only the boards near the bike are drawn', () => {
        const mesh = env.markerMesh;
        const gate = env.checkpoints[3];
        Scenery.placeMarkers(mesh, gate.position.x, gate.position.z);
        // The checkpoint's own boards and those of any checkpoint within reach across a bend, and nothing else
        const reach = mesh.userData.poses.filter(p => Math.hypot(p.x - gate.position.x, p.z - gate.position.z) < Scenery.MARKER_REACH_M);
        expect(reach.length).toBeGreaterThanOrEqual(2 * Scenery.MARKER_ALONG_M.length);
        expect(reach.length).toBeLessThan(mesh.userData.poses.length);
        expect(mesh.count).toBe(reach.length);
        Scenery.placeMarkers(mesh, gate.position.x + 5000, gate.position.z + 5000);
        expect(mesh.count).toBe(0);
        Scenery.placeMarkers(mesh, 0, 0, Infinity);
        expect(mesh.count).toBe(mesh.userData.poses.length);
    });

    test('every checkpoint has its boards on both sides, on the verge just outside the carriageway', () => {
        expect(env.checkpoints.length).toBeGreaterThan(5);
        const bad = [];
        for (const gate of env.checkpoints) {
            const near = boards.filter(b => Math.abs(b.s - gate.s) <= Scenery.GATE_SHIFT_M + 3);
            for (const sign of [-1, 1]) {
                const side = near.filter(b => Math.sign(b.lateral) === sign);
                if (side.length !== Scenery.MARKER_ALONG_M.length) bad.push(`checkpoint ${gate.index} at s ${Math.round(gate.s)}: ${side.length} boards on side ${sign}`);
                for (const b of side) {
                    const inner = Math.abs(b.lateral) - b.half - b.width / 2;
                    const outer = Math.abs(b.lateral) - b.width / 2;
                    if (inner < 0.3) bad.push(`checkpoint ${gate.index} side ${sign}: the board reaches ${inner.toFixed(2)} m past the carriageway edge, want 0.3 or more`);
                    if (outer > 2) bad.push(`checkpoint ${gate.index} side ${sign}: the board stands ${outer.toFixed(2)} m past the edge, want 2 or less`);
                }
            }
        }
        if (bad.length) throw new Error(bad.join('\n'));
    });

    test('every board stands on the drawn verge: not floating, not buried', () => {
        expect(boards.length).toBeGreaterThan(0);
        const points = env.route.points;
        const raycaster = new THREE.Raycaster();
        const down = new THREE.Vector3(0, -1, 0);
        const bad = [];
        for (const b of boards) {
            // The ride ribbon as RoadMesh draws it near the bike (its verge included), round the board
            let i = 0;
            while (i + 1 < points.length && points[i + 1].s <= b.s) i++;
            const ribbon = RoadMesh.nearRibbon(env.rowsOf(Math.max(0, i - 3), Math.min(points.length - 1, i + 4)));
            const mesh = new THREE.Mesh(ribbon.geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
            const foot = b.y + b.foot;
            // The foot plate's corners and centre, each over the drawn surface
            for (const [dx, dz] of [[0, 0], [-0.15, -0.15], [0.15, -0.15], [0.15, 0.15], [-0.15, 0.15]]) {
                raycaster.set(new THREE.Vector3(b.x + dx, foot + 5, b.z + dz), down);
                const hit = raycaster.intersectObject(mesh)[0];
                if (!hit) bad.push(`board at s ${Math.round(b.s)} side ${Math.sign(b.lateral)}: no drawn verge under (${dx}, ${dz})`);
                else if (Math.abs(foot - hit.point.y) > 0.05) bad.push(`board at s ${Math.round(b.s)} side ${Math.sign(b.lateral)}: foot ${foot.toFixed(3)}, drawn verge ${hit.point.y.toFixed(3)}`);
            }
            ribbon.geometry.dispose();
        }
        if (bad.length) throw new Error(bad.join('\n'));
    });

    test('no checkpoint keeps an arch; the start and the finish do', () => {
        const pos = env.gateMesh.geometry.attributes.position;
        const near = (st, r) => {
            for (let i = 0; i < pos.count; i++) if (Math.hypot(pos.getX(i) - st.position.x, pos.getZ(i) - st.position.z) < r) return true;
            return false;
        };
        const arches = env.checkpoints.filter(gate => near(gate, Scenery.GATE_SHIFT_M + 12)).map(gate => gate.index);
        expect(arches).toEqual([]);
        const start = env.route.sample(env.stationGates[0].s, {});
        expect(near({ position: start }, Scenery.GATE_SHIFT_M + 12)).toBe(true);
        expect(near(env.finishGate, Scenery.GATE_SHIFT_M + 12)).toBe(true);
    });
});
