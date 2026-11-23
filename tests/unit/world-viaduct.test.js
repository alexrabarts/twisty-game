/**
 * @jest-environment node
 */
// The arched viaducts (RoadMesh.VIADUCT, WorldEnvironment.viaducts, RoadMesh.viaduct, TerrainMesh.pitCuts):
//   1. an arch's underside is a circle through its two springings: semicircular, or segmental to its rise
//   2. the land under a pit is held to its ground, lowered only, with the triangle's whole area kept and a face of land
//      at the pit's own edge
//   3. on the shipped stage and the synthetic world, each viaduct the rule picks: its rows carry the bridge bit and its
//      layout, no wall stands on them and walls stand under both edges into its ends, its bays are whole, no land stands
//      over an arch's intrados inside its bay and no land round it is wound upside down, the physics' parapet is its own, and the chase camera has its faces (down to
//      the ground, as the walls' were) and its arches' sides
//   4. its stone is a retaining wall's: the same material, its faces laid and lit as a wall's face, the stone under its
//      deck lit as its arch's face turned down, never more than that face
import { describe, test, expect, beforeAll } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';

const game = loadGame(undefined, []);
const { THREE, WorldEnvironment, WorldData, TerrainMesh, RoadMesh, WorldGround } = game;
const V = RoadMesh.VIADUCT;

describe('an arch', () => {
    test('a semicircle springs at its ends and rises half its span', () => {
        const bay = { a0: 10, a1: 18, spring: 100, rise: 4 };
        expect(RoadMesh.archY(bay, 10)).toBeCloseTo(100, 9);
        expect(RoadMesh.archY(bay, 18)).toBeCloseTo(100, 9);
        expect(RoadMesh.archY(bay, 14)).toBeCloseTo(104, 9);
        expect(RoadMesh.archY(bay, 12)).toBeCloseTo(100 + Math.sqrt(16 - 4), 9);
        expect(RoadMesh.archY(bay, 9)).toBeNull();
    });

    test('a segmental arch springs at its ends and rises its rise', () => {
        const bay = { a0: 0, a1: 9, spring: 50, rise: 1.5 };
        expect(RoadMesh.archY(bay, 0)).toBeCloseTo(50, 9);
        expect(RoadMesh.archY(bay, 9)).toBeCloseTo(50, 9);
        expect(RoadMesh.archY(bay, 4.5)).toBeCloseTo(51.5, 9);
        for (let s = 0; s <= 9; s += 0.5) expect(RoadMesh.archY(bay, s)).toBeLessThanOrEqual(51.5 + 1e-9);
    });
});

describe('the ground under a viaduct (TerrainMesh.pitCuts)', () => {
    const n = WorldData.TILE_N;
    const tile = () => {
        const heights = new Float32Array(n * n), zones = new Uint8Array(n * n);
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) heights[j * n + i] = 100 + 0.5 * i;
        return { key: '0,0', tx: 0, tz: 0, heights, zones };
    };
    // A pit 6 m wide from x 100 to 140 along z 200, its ground at 80
    const quad = { c: [[100, 197], [140, 197], [140, 203], [100, 203]], f: [80, 80], outer: [true, true, true, true] };
    const pits = [{ quads: [quad], box: [98, 195, 142, 205] }];

    test('inside it the land is the ground, outside it is as it was, and every cut triangle keeps its area', () => {
        const t = tile();
        const cuts = TerrainMesh.cuts(t, [], null, null, pits);
        expect(cuts).not.toBeNull();
        expect(TerrainMesh.heightAt(t, 120, 200, cuts)).toBeCloseTo(80, 6);
        expect(TerrainMesh.heightAt(t, 120, 210, cuts)).toBeCloseTo(100 + 0.5 * 15, 6);
        // (just outside its edge, on the cut triangle's own plane)
        expect(TerrainMesh.heightAt(t, 120, 196.9, cuts)).toBeCloseTo(100 + 0.5 * 15, 6);
        let records = 0;
        for (const record of cuts.values()) {
            if (!record.pit) continue;
            records++;
            let area = 0;
            for (const part of record.parts) for (const [a, b, c] of part.tris) {
                const A = part.verts[a], B = part.verts[b], C = part.verts[c];
                area += Math.abs((B.x - A.x) * (C.z - A.z) - (C.x - A.x) * (B.z - A.z)) / 2;
            }
            expect(area).toBeCloseTo((WorldData.CELL_M * WorldData.CELL_M) / 2, 6);
        }
        expect(records).toBeGreaterThan(10);
    });

    test('a face of land closes the step at its edge, and the land is lowered only', () => {
        const t = tile();
        const low = { ...quad, f: [200, 200] };
        const cuts = TerrainMesh.cuts(t, [], null, null, [{ quads: [low], box: pits[0].box }]);
        // (a ground over the land leaves it as it is)
        expect(TerrainMesh.heightAt(t, 120, 200, cuts)).toBeCloseTo(100 + 0.5 * 15, 6);
        const built = TerrainMesh.build(t, null, 0, null, null, TerrainMesh.cuts(t, [], null, null, pits));
        expect(built.mesh.userData.parts.faces[1]).toBeGreaterThan(0);
    });
});

// The viaducts of a world, streamed along `spans` of its ride
async function streamed(options, spans) {
    const { fetchFn } = diskFetch();
    const env = await WorldEnvironment.load(new THREE.Scene(), { fetchFn, models: null, digest: async () => '0', ...options });
    env.scenery.buildTile = () => null;
    for (const [from, to] of spans) {
        for (let s = from; s < to; s += 300) {
            const p = env.route.sample(s + 150, {});
            env.update(p, s, null, Infinity);
            await env.streamer.settle(p, s + 150);
        }
    }
    return env;
}

// What every viaduct of a world holds to
function holds(env) {
    const points = env.route.points;
    expect(env.viaducts.length).toBeGreaterThan(0);
    for (const via of env.viaducts) {
        const where = `viaduct at ${via.s0.toFixed(0)}`;
        // A structure's rows: the bridge bit, its layout, no wall
        for (let i = via.from; i <= via.to; i++) {
            expect(points[i].bits & 2).toBe(2);
            expect(points[i].flags.bridge).toBe(true);
            expect(points[i].viaduct).toBe(via);
            if (i < via.to) for (const sign of [-1, 1]) expect(env.walledAt(i, sign)).toBe(false);
        }
        // Walls under both edges into its ends: its abutments
        for (const sign of [-1, 1]) {
            expect([where, env.walledAt(via.from - 1, sign)]).toEqual([where, true]);
            expect([where, env.walledAt(via.to, sign)]).toEqual([where, true]);
        }
        // Whole bays from end to end, each arch clear of the ground under it
        expect(via.bays.length).toBeGreaterThanOrEqual(V.minBays);
        expect(via.bays[0].b0).toBeCloseTo(via.s0, 6);
        expect(via.bays[via.bays.length - 1].b1).toBeCloseTo(via.s1, 6);
        for (const bay of via.bays) {
            const span = bay.b1 - bay.b0, c = bay.a1 - bay.a0;
            expect(span).toBeGreaterThanOrEqual(V.spanMin - 1e-6);
            expect(span).toBeLessThanOrEqual(V.spanMax + 1e-6);
            expect(bay.rise).toBeGreaterThanOrEqual(c * V.riseMin - 1e-6);
            expect(bay.rise).toBeLessThanOrEqual(c / 2 + 1e-6);
            expect(bay.open.l || bay.open.r).toBe(true);
            const floor = Math.max(...via.rows.filter(r => r.s >= bay.b0 - 1e-6 && r.s <= bay.b1 + 1e-6).map(r => r.floor));
            expect(bay.spring).toBeGreaterThanOrEqual(floor + V.springM - 1e-6);
            // No land over the arch's intrados anywhere inside the bay: along its opening every 25 cm, across from an
            // open face's own line to the back of a blind face's stone (2 cutBackM in from it) every 5% of the way
            for (let s = bay.a0; s <= bay.a1 + 1e-9; s += 0.25) {
                const p = env.route.sample(s, {}), top = RoadMesh.archY(bay, s), face = p.width / 2 + RoadMesh.VIADUCT_FACE_M;
                const reach = key => (bay.open[key] ? face : face - 2 * V.cutBackM) - 0.01;
                for (let k = -20; k <= 20; k++) {
                    const lat = (k / 20) * reach(k < 0 ? 'l' : 'r');
                    const land = env.ground.tileHeight(p.x + lat * Math.cos(p.heading), p.z - lat * Math.sin(p.heading));
                    expect([where, s.toFixed(2), lat.toFixed(2), land !== null && land < top]).toEqual([where, s.toFixed(2), lat.toFixed(2), true]);
                }
            }
        }
        // No land triangle round it wound upside down, and none lit against its face: lit from under, a piece of the
        // pit's land drew as a black wedge in an arch's mouth, and land on nodes the pit cut all round drew black
        for (const [key, entry] of env.tileMeshes) {
            const mesh = entry.mesh;
            if (!mesh || mesh.userData.lod !== 0) continue;
            const [tx, tz] = key.split(',').map(Number), M = WorldData.TILE_M, [x0, z0, x1, z1] = via.box;
            if (x1 < tx * M || x0 > (tx + 1) * M || z1 < tz * M || z0 > (tz + 1) * M) continue;
            const pos = mesh.geometry.attributes.position, index = mesh.geometry.index, normal = mesh.geometry.attributes.normal;
            const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), n = new THREE.Vector3(), e = new THREE.Vector3(), m = new THREE.Vector3();
            let down = 0, against = 0;
            for (let t = 0; t < index.count; t += 3) {
                A.fromBufferAttribute(pos, index.getX(t)); B.fromBufferAttribute(pos, index.getX(t + 1)); C.fromBufferAttribute(pos, index.getX(t + 2));
                const cx = (A.x + B.x + C.x) / 3, cz = (A.z + B.z + C.z) / 3;
                if (cx < x0 || cx > x1 || cz < z0 || cz > z1) continue;
                n.subVectors(C, B).cross(e.subVectors(A, B));
                if (n.length() > 0.02 && n.normalize().y < -0.05) down++;
                // (a closing face stands upright and is lit as the land over it: only the land itself is read)
                if (n.y > 0.3) for (let k = 0; k < 3; k++) if (m.fromBufferAttribute(normal, index.getX(t + k)).dot(n) < 0.2) against++;
            }
            expect([where, key, down, against]).toEqual([where, key, 0, 0]);
        }
        // The physics: the road out to its parapet, its parapet a wall there, no wall band
        const mid = (via.s0 + via.s1) / 2, i = env.route.indexAt(mid), p = points[i], half = p.width / 2;
        const parapet = half + WorldGround.viaductParapet();
        for (const sign of [-1, 1]) {
            const zone = env.ground.zoneAt({ index: i, lateral: sign * (parapet + 0.1), t: 0 }, half);
            expect(zone.kind).toBe('wall');
            expect(zone.start).toBeCloseTo(parapet, 6);
            expect(env.ground.wallBand({ index: i, lateral: sign * (half + 0.5), t: 0, flags: p.flags }, half)).toBeNull();
            expect(env.ground.heightAt({ index: i, lateral: sign * (parapet - 0.1), roadY: p.y, t: 0, flags: p.flags, x: p.x + sign * (parapet - 0.1) * Math.cos(p.heading), z: p.z - sign * (parapet - 0.1) * Math.sin(p.heading) })).toBeCloseTo(p.y, 6);
        }
        // The chase camera: its faces down to the ground (under its springings), and its arches' sides
        const faces = env.cameraFaces(p.x, p.z, 30), F = game.WorldCamera.FACE;
        const low = Math.min(...via.bays.map(bay => bay.spring));
        let deep = 0, sides = 0;
        for (let k = 0; k < faces.count; k++) {
            const top = faces.data[k * F + 4], foot = faces.data[k * F + 6];
            if (Math.abs(top - (p.y + V.parapetH)) < 2 && foot < low) deep++;
            if (via.bays.some(bay => Math.abs(top - bay.spring) < 1e-6)) sides++;
        }
        expect(deep).toBeGreaterThan(0);
        expect(sides).toBeGreaterThan(0);
    }
}

// A viaduct's stone is a retaining wall's: the same material, its faces laid and lit as a wall's face (`wallFace` 1,
// a level normal), and the stone under its deck (vaults, arches' sides, a blind face's back: group 5, the same
// material) lit as the face its arch opens in, turned down VAULT_TILT: for any sun above the horizon no more light falls
// on it than on that face. Lit by their own way, the arches' insides glowed white in the rain at km 7.9
function stone(env) {
    let meshes = 0, faces = 0, under = 0;
    const tilt = RoadMesh.VAULT_TILT;
    expect(tilt).toBeGreaterThan(0);
    env.group.traverse(o => {
        if (!o.isMesh || o.name !== 'road-works') return;
        const g = o.geometry, group = g.groups.find(x => x.materialIndex === 4);
        if (!group) return;
        meshes++;
        expect(o.material[4]).toBe(o.material[2]);
        expect(o.material[5]).toBe(o.material[2]);
        const normal = g.attributes.normal, face = g.attributes.wallFace, pos = g.attributes.position;
        for (let v = group.start; v < group.start + group.count; v++) if (face.getY(v) === 1) {
            faces++;
            expect(Math.abs(normal.getY(v))).toBeLessThan(1e-6);
        }
        const vault = g.groups.find(x => x.materialIndex === 5);
        for (const [start, count] of g.userData.viaduct.soffits) for (let v = start; v < start + count; v++) expect(v >= vault.start && v < vault.start + vault.count).toBe(true);
        for (let v = vault.start; v < vault.start + vault.count; v++) {
            under++;
            const nx = normal.getX(v), ny = normal.getY(v), nz = normal.getZ(v);
            expect([v, ny]).toEqual([v, expect.closeTo(-Math.sin(tilt), 6)]);
            expect(Math.hypot(nx, nz)).toBeCloseTo(Math.cos(tilt), 6);
            // (its level part is the outward of an open face of the viaduct it is under: the nearest one's)
            const x = pos.getX(v), z = pos.getZ(v);
            let best = null;
            for (const via of env.viaducts) for (let i = via.from; i <= via.to; i++) {
                const p = env.route.points[i], d = Math.hypot(p.x - x, p.z - z);
                if (!best || d < best.d) best = { d, p, via };
            }
            const ox = Math.cos(best.p.heading), oz = -Math.sin(best.p.heading), along = Math.abs(nx * ox + nz * oz) / Math.cos(tilt);
            expect(along).toBeGreaterThan(0.9);
            expect(face.getY(v)).toBe(1);
        }
    });
    expect(meshes).toBeGreaterThan(0);
    expect(faces).toBeGreaterThan(0);
    expect(under).toBeGreaterThan(0);
}

describe('the shipped stage', () => {
    let env;
    beforeAll(async () => {
        env = await streamed({ id: 'tremola' }, [[7700, 8300], [10800, 11200]]);
        console.log(`viaducts (shipped): ${env.viaducts.map(v => `${v.s0.toFixed(0)}-${v.s1.toFixed(0)} (${v.bays.length} bays, open ${v.bays.map(b => (b.open.l ? 'L' : '') + (b.open.r ? 'R' : '')).join(' ')})`).join(', ')}`);
    }, 1800000);

    test('the stack of hairpins at km 7.9 to 8.1 has its viaducts', () => {
        expect(env.viaducts.filter(v => v.s0 > 7850 && v.s1 < 8150).length).toBeGreaterThanOrEqual(2);
    });

    test('every viaduct holds to the rules', () => holds(env));

    test('its stone is a retaining wall\'s, and its vaults face down', () => stone(env));
});

describe('the synthetic world', () => {
    let env;
    beforeAll(async () => {
        env = await streamed({ id: 'all', search: '?worldData=tests/fixtures/world/mini' }, [[0, 7000]]);
        console.log(`viaducts (synthetic): ${env.viaducts.map(v => `${v.s0.toFixed(0)}-${v.s1.toFixed(0)}`).join(', ')}`);
    }, 1800000);

    test('every viaduct holds to the rules', () => holds(env));

    test('its stone is a retaining wall\'s, and its vaults face down', () => stone(env));

    test('the stretch over the ride\'s own lower leg has none: no pier can stand clear of it', () => {
        expect(env.viaducts.filter(v => v.s1 > 1659 && v.s0 < 1735)).toEqual([]);
    });
});
