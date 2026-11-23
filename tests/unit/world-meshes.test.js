// The meshes of a world (road, terrain, horizon, scenery) built headless with real three: their
// counts, that every vertex is a number, and the rules each one keeps (no folded ribbon, skirts under the
// edges, no tree on the road, the same trees every time).
import { describe, test, expect } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';
import { fakeData, allTiles, samplesOf, straight } from '../helpers/world-synthetic.js';

const game = loadGame();
const { THREE, RoadMesh, RoadSurface, TerrainMesh, Horizon, FarLand, LandShade, Scenery, WorldGround, WorldRoute, WorldData, WorldPhysics, Route } = game;

const finite = geometry => Array.from(geometry.attributes.position.array).every(Number.isFinite);
const row = (x, z, heading, over = {}) => ({ x, y: 100, z, heading, width: 10, bits: 0, ...over });

// A road along +z, `n` rows 4 m apart
const line = (n, over = {}) => Array.from({ length: n }, (_, i) => row(0, i * 4, 0, over));

// A bend of radius `radius` turning right through `turn` radians, rows 4 m apart
function bend(radius, turn) {
    const rows = [];
    const steps = Math.ceil((radius * turn) / 4);
    for (let i = 0; i <= steps; i++) {
        const a = (turn * i) / steps;
        // Centre of the bend is on the right of the start; heading grows as it turns right
        rows.push(row(radius * (1 - Math.cos(a)), radius * Math.sin(a), a));
    }
    return rows;
}

describe('RoadMesh', () => {
    test('LOD0 is six strips a row (verge, four across the carriageway, verge) with the road coordinates for the shader', () => {
        const { geometry, triangles, clamped, near } = RoadMesh.ribbon(line(11), 0);
        expect(near).toBe(true);
        expect(triangles).toBe(10 * 6 * 2);
        expect(clamped).toBe(0);
        expect(finite(geometry)).toBe(true);
        const count = geometry.attributes.position.count;
        for (const name of ['uv', 'roadArc', 'roadPlane', 'road', 'edge', 'roadBase']) expect(geometry.attributes[name].count).toBe(count);
        // UV: metres across (verge, edge, edge, verge) and metres along
        const uv = geometry.attributes.uv.array;
        expect(Array.from(uv.slice(0, 14)).map(v => Math.round(v * 100) / 100)).toEqual([-5 - RoadSurface.VERGE_M, 0, -5, 0, -2.5, 0, 0, 0, 2.5, 0, 5, 0, 5 + RoadSurface.VERGE_M, 0]);
        expect(uv[uv.length - 1]).toBeCloseTo(40, 5);
        expect(geometry.attributes.road.array[0]).toBe(5);
    });

    test('the along-road UV restarts at a multiple of the shared period, so patterns meet across a section joint', () => {
        const rows = line(4).map((r, i) => ({ ...r, s: 1000 + i * 4 }));
        const { geometry } = RoadMesh.ribbon(rows, 0);
        const base = Math.floor(1000 / RoadSurface.PERIOD_M);
        expect(geometry.attributes.roadBase.array[0]).toBe(base);
        expect(geometry.attributes.uv.array[1]).toBeCloseTo(1000 - base * RoadSurface.PERIOD_M, 4);
        // Every pattern's period divides it: the setts, the asphalt, each dash pattern
        const m = RoadSurface.MARKINGS;
        for (const period of [RoadSurface.SETTS_M, RoadSurface.ASPHALT_M, RoadSurface.PERIOD_M / 13, m.broken.dashM + m.broken.gapM, m.warning.dashM + m.warning.gapM, m.mouth.dashM + m.mouth.gapM]) {
            const copies = RoadSurface.PERIOD_M / period;
            expect(Math.abs(copies - Math.round(copies))).toBeLessThan(1e-9);
        }
    });

    // A ribbon's vertex k * 7 + j read back as the shader reads it: metres across, metres along the centre and the
    // heading (divided out of their projective form), the ground-plane coordinates and the position
    const vertexOf = (geometry, i) => {
        const a = geometry.attributes;
        const q = a.roadArc.array[i * 3 + 2];
        return {
            lat: a.uv.array[i * 2], along: a.roadArc.array[i * 3] / q, turn: a.roadArc.array[i * 3 + 1] / q, q,
            base: a.roadBase.array[i], plane: [a.roadPlane.array[i * 2], a.roadPlane.array[i * 2 + 1]],
            x: a.position.array[i * 3], z: a.position.array[i * 3 + 2], road: Array.from(a.road.array.slice(i * 4, i * 4 + 4)), edge: Array.from(a.edge.array.slice(i * 4, i * 4 + 4))
        };
    };

    test('the textures keep their size across the road in a 10 m hairpin: the inside is not squashed', () => {
        const rows = bend(10, Math.PI);
        for (const surface of ['setts', 'asphalt']) {
            const { geometry, clamped } = RoadMesh.ribbon(rows.map(r => ({ ...r, bits: surface === 'setts' ? 8 : 0 })), 0);
            expect(clamped).toBe(0);
            // Metres of texture per metre of ground along each column (both edges and the quarter lines), row to row
            const density = {};
            for (const j of [1, 2, 4, 5]) {
                density[j] = [];
                for (let k = 0; k + 1 < rows.length; k++) {
                    const a = vertexOf(geometry, k * 7 + j), b = vertexOf(geometry, (k + 1) * 7 + j);
                    const ground = Math.hypot(b.x - a.x, b.z - a.z);
                    const texture = surface === 'setts'
                        ? Math.abs(RoadSurface.settAlong(b.along, b.turn, b.lat) - RoadSurface.settAlong(a.along, a.turn, a.lat))
                        : Math.hypot(b.plane[0] - a.plane[0], b.plane[1] - a.plane[1]);
                    density[j].push(texture / ground);
                }
            }
            const all = Object.values(density).flat();
            // The centre's metres along would give 2.0 on the inside edge (5 m radius) and 0.67 on the outside (15 m)
            if (surface === 'setts') {
                for (const d of all) expect(Math.abs(Math.log(d))).toBeLessThan(Math.log(1.2));
                expect(Math.max(...all) / Math.min(...all)).toBeLessThan(1.25);
            } else {
                for (const d of all) expect(d).toBeCloseTo(1, 3);
            }
        }
    });

    test('a line across the road stays straight across a quad in a bend: the along and the heading are projective', () => {
        const radius = 10;
        const rows = bend(radius, Math.PI);
        const { geometry } = RoadMesh.ribbon(rows, 0);
        const curve = RoadMesh.curvature(rows);
        // q is each column's share of the centre's length: 1 - offset * curvature, the inside shorter
        const k = 4;
        expect(vertexOf(geometry, k * 7 + 3).q).toBeCloseTo(1, 6);
        expect(vertexOf(geometry, k * 7 + 5).q).toBeCloseTo(1 - 5 * curve[k], 5);
        expect(vertexOf(geometry, k * 7 + 1).q).toBeCloseTo(1 + 5 * curve[k], 5);
        // Ground points inside the quad between rows k and k + 1 and the inside quarter line and edge (2.5 to 5 m), on
        // radial lines of the bend: each lies a share f of the way from row k to row k + 1, so the centre's metres there
        // are row k's plus f of the step. Read them as the GPU interpolates a triangle, projectively and affinely
        const a = [k * 7 + 4, k * 7 + 5, (k + 1) * 7 + 4, (k + 1) * 7 + 5].map(i => vertexOf(geometry, i));
        const triangles = [[a[0], a[1], a[2]], [a[1], a[3], a[2]]];
        const angle = i => rows[i].heading;
        let worstProjective = 0, worstAffine = 0;
        for (const f of [0.2, 0.5, 0.8]) {
            for (const offset of [2.8, 3.75, 4.7]) {
                const t = angle(k) + (angle(k + 1) - angle(k)) * f;
                const px = radius - (radius - offset) * Math.cos(t), pz = (radius - offset) * Math.sin(t);
                const truth = a[0].along + (a[2].along - a[0].along) * f;
                for (const [p, q, r] of triangles) {
                    const det = (q.x - p.x) * (r.z - p.z) - (r.x - p.x) * (q.z - p.z);
                    const u = ((px - p.x) * (r.z - p.z) - (r.x - p.x) * (pz - p.z)) / det;
                    const v = ((q.x - p.x) * (pz - p.z) - (px - p.x) * (q.z - p.z)) / det;
                    const w = 1 - u - v;
                    if (u < -1e-9 || v < -1e-9 || w < -1e-9) continue;
                    const projective = (w * p.along * p.q + u * q.along * q.q + v * r.along * r.q) / (w * p.q + u * q.q + v * r.q);
                    const affine = w * p.along + u * q.along + v * r.along;
                    worstProjective = Math.max(worstProjective, Math.abs(projective - truth));
                    worstAffine = Math.max(worstAffine, Math.abs(affine - truth));
                }
            }
        }
        // Projective: a few centimetres (the chords stand for arcs); affine kinks the line by decimetres
        expect(worstProjective).toBeLessThan(0.05);
        expect(worstAffine).toBeGreaterThan(worstProjective * 3);
    });

    test('markings, setts and grain line up across a section joint in a hairpin', () => {
        // 40 m straight, a 10 m hairpin, 40 m straight; rows 4 m apart from s = 1000, with the ride's markings
        const rows = [];
        let x = 0, z = 0, heading = 0;
        for (let i = 0; i < 40; i++) {
            const s = 1000 + i * 4;
            rows.push(row(x, z, heading, { s, cls: '8m Strasse' }));
            const turn = s >= 1040 && s < 1040 + 10 * Math.PI ? 4 / 10 : 0;
            heading += turn / 2;
            x += 4 * Math.sin(heading);
            z += 4 * Math.cos(heading);
            heading += turn / 2;
        }
        const styles = RoadSurface.styles(rows);
        const styled = rows.map((r, i) => ({ ...r, ...styles[i] }));
        expect(styled.some(r => r.centre !== RoadSurface.CENTRE.none)).toBe(true);
        // Two sections that share row 14, in the bend, as the environment builds them (one row past each end)
        const m = 14;
        const A = RoadMesh.ribbon(styled.slice(0, m + 1), 0).geometry;
        const B = RoadMesh.ribbon(styled.slice(m), 0).geometry;
        const P = RoadSurface.PERIOD_M, S = RoadSurface.SETTS_M;
        const mod = (v, p) => ((v % p) + p) % p;
        const circular = (a, b, p) => Math.min(Math.abs(mod(a, p) - mod(b, p)), p - Math.abs(mod(a, p) - mod(b, p)));
        const dashSum = (v, d, p) => Math.floor(v / p) * d + Math.min(mod(v, p), d);
        const marks = RoadSurface.MARKINGS;
        let differentBase = false;
        for (let j = 0; j < 7; j++) {
            const a = vertexOf(A, m * 7 + j), b = vertexOf(B, j);
            if (a.base !== b.base) differentBase = true;
            expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(1e-6);
            expect(a.lat).toBeCloseTo(b.lat, 6);
            expect(a.road).toEqual(b.road);
            expect(a.edge).toEqual(b.edge);
            const sA = a.along + a.base * P, sB = b.along + b.base * P;
            expect(Math.abs(sA - sB)).toBeLessThan(1e-3);
            expect(Math.abs(a.turn - b.turn)).toBeLessThan(1e-5);
            // The centre's dashes and an edge's mouth dashes (spaced along the edge) read the same on both sides
            for (const [d, g] of [[marks.broken.dashM, marks.broken.gapM], [marks.warning.dashM, marks.warning.gapM]]) {
                expect(Math.abs(dashSum(sA, d, d + g) - dashSum(sB, d, d + g))).toBeLessThan(1e-3);
            }
            const lineC = 5 - marks.edge.insetM;
            expect(Math.abs(dashSum(sA - lineC * a.turn, 0.5, 1) - dashSum(sB - lineC * b.turn, 0.5, 1))).toBeLessThan(1e-3);
            // The setts: the same place in the tile and the same copy of it (each sett toned the same)
            const tA = RoadSurface.settAlong(a.along, a.turn, a.lat), tB = RoadSurface.settAlong(b.along, b.turn, b.lat);
            expect(circular(tA, tB, S)).toBeLessThan(1e-3);
            expect(RoadSurface.settCopy(tA, a.lat) + a.base * (P / S)).toBe(RoadSurface.settCopy(tB, b.lat) + b.base * (P / S));
            // The grain: the same place in both of its tiles
            for (const period of [RoadSurface.ASPHALT_M, P / 13]) {
                for (const c of [0, 1]) expect(circular(a.plane[c], b.plane[c], period)).toBeLessThan(1e-3);
            }
        }
        expect(differentBase).toBe(true);
        // Along the centre line the metres run on through the joint at the rows' spacing: no step in the dashes
        const before = vertexOf(A, (m - 1) * 7 + 3), after = vertexOf(B, 7 + 3);
        expect((after.along + after.base * P) - (before.along + before.base * P)).toBeCloseTo(8, 3);
    });

    test('LOD1 is one strip of the textures\' mean colour and far fewer triangles', () => {
        const rows = line(100);
        const near = RoadMesh.ribbon(rows, 0);
        const far = RoadMesh.ribbon(rows, 1);
        expect(far.near).toBe(false);
        expect(far.triangles).toBeLessThan(near.triangles / 6);
        expect(far.triangles % 2).toBe(0);
        const c = far.geometry.attributes.color.array;
        expect([c[0], c[1], c[2]]).toEqual(RoadMesh.COLORS.asphalt.map(v => Math.fround(v)));
    });

    test('decimation keeps the ends, every row of a hairpin, and a bend at least every 0.18 rad', () => {
        const tight = bend(12, Math.PI);
        // 4 m rows already turn 0.33 rad each: nothing may be dropped, or the hairpin becomes chords
        expect(RoadMesh.decimate(tight)).toHaveLength(tight.length);
        const gentle = bend(40, Math.PI);
        const kept = RoadMesh.decimate(gentle);
        expect(kept[0]).toBe(gentle[0]);
        expect(kept[kept.length - 1]).toBe(gentle[gentle.length - 1]);
        expect(kept.length).toBeLessThan(gentle.length);
        for (let i = 1; i < kept.length; i++) expect(Math.abs(kept[i].heading - kept[i - 1].heading)).toBeLessThanOrEqual(0.18 + 0.11);
        // A straight road keeps a row every 16 m: 396 m is 25 rows and the end
        expect(RoadMesh.decimate(line(100)).length).toBeLessThanOrEqual(26);
    });

    test('the inside of a hairpin tighter than the road is wide is held inside the bend and never folds', () => {
        const rows = bend(6, Math.PI);
        const { geometry, clamped } = RoadMesh.ribbon(rows, 0);
        expect(clamped).toBeGreaterThan(0);
        expect(finite(geometry)).toBe(true);
        // The bend turns right about a centre at (radius, 0): no vertex may pass the centre of the bend
        const p = geometry.attributes.position.array;
        const centre = new THREE.Vector2(6, 0);
        for (let i = 0; i < p.length; i += 3) {
            expect(Math.hypot(p[i] - centre.x, p[i + 2] - centre.y)).toBeGreaterThan(0.5);
        }
    });

    test('a bend gentler than the road is wide is left alone', () => {
        expect(RoadMesh.ribbon(bend(60, 1), 0).clamped).toBe(0);
    });

    test('cobbles are flagged for the setts and never painted', () => {
        const rows = line(6, { bits: 8, cls: '8m Strasse' });
        const road = RoadMesh.ribbon(rows, 0).geometry.attributes.road.array;
        const edge = RoadMesh.ribbon(rows, 0).geometry.attributes.edge.array;
        for (let i = 0; i < road.length; i += 4) {
            expect(road[i + 1]).toBe(1);
            expect(road[i + 2]).toBe(RoadSurface.CENTRE.none);
            expect(edge[i]).toBe(RoadSurface.EDGE.none);
            expect(edge[i + 1]).toBe(RoadSurface.EDGE.none);
        }
        const far = RoadMesh.ribbon(line(30, { bits: 8 }), 1).geometry.attributes.color.array;
        expect([far[0], far[1], far[2]]).toEqual(RoadMesh.COLORS.cobbles.map(v => Math.fround(v)));
    });

    test('a tunnel run gets a tube and portals, a bridge run a deck, parapets and piers', () => {
        const rows = line(40).map((r, i) => ({ ...r, bits: i >= 5 && i < 15 ? 1 : i >= 20 && i < 30 ? 2 : 0 }));
        const group = RoadMesh.section(rows, 0, { groundAt: () => 60 });
        // The structures share one mesh (the window counts meshes), in the structures' material group
        const names = group.children.map(c => c.name);
        expect(names).toEqual(['road-ribbon', 'road-works']);
        for (const child of group.children) expect(finite(child.geometry)).toBe(true);
        const works = group.children[1].geometry;
        expect(works.groups.filter(g => g.count > 0).map(g => g.materialIndex)).toEqual([1]);
        // Piers stand from the deck to the ground 40 m below
        works.computeBoundingBox();
        expect(works.boundingBox.min.y).toBeLessThan(70);
        expect(group.userData.triangles).toBeGreaterThan(group.children[0].geometry.attributes.position.count / 3);
        // The tunnel's roof is the route's own roof height over the road
        expect(works.boundingBox.max.y).toBeCloseTo(100 + WorldRoute.ROOF_M + 1.2, 4);
    });

    test('a road whose land meets its edges is the ribbon alone', () => {
        expect(RoadMesh.section(line(10), 1).children.map(c => c.name)).toEqual(['road-ribbon']);
        expect(RoadMesh.section(line(10), 1, { foot: () => null }).children.map(c => c.name)).toEqual(['road-ribbon']);
        expect(RoadMesh.sideRoad(line(10), true).name).toBe('world-road-stub');
        expect(RoadMesh.sideRoad(line(10), false).name).toBe('world-road-side');
    });

    // Every road surface more than PARAPET_DROP_M over the land stands on a structure: a side road too, flagged or not
    test('a raised or bridge-flagged side road rides on a deck with piers, and a point of it high over the land is never bare', () => {
        const ground = 70;
        const under = (group, x, y, z) => {
            const ray = new THREE.Raycaster(new THREE.Vector3(x, y - 0.03, z), new THREE.Vector3(0, -1, 0), 0, 1.5);
            return ray.intersectObjects(group.children.filter(c => c.name === 'road-works'), false).length > 0;
        };
        for (const [what, rows] of [['flagged', line(12, { bits: 2 })], ['high over the land', line(12)]]) {
            for (const stub of [true, false]) {
                const group = RoadMesh.sideRoad(rows, stub, null, () => null, { groundAt: () => ground });
                expect(group.children.map(c => c.name)).toEqual(['road-side', 'road-works']);
                const works = group.children[1].geometry;
                works.computeBoundingBox();
                // Piers reach the land
                expect(works.boundingBox.min.y).toBeLessThan(ground + 0.5);
                let bare = 0, points = 0;
                for (const side of group.userData.sides) {
                    expect(side.bits & 2).toBe(2);
                    const c = [0, 1, 2].map(k => (side.l[k] + side.r[k]) / 2);
                    // The edge points a centimetre in: a ray down the very edge of the soffit can miss it by rounding
                    const inset = q => q.map((v, k) => v + (c[k] - v) * (0.01 / Math.max(1e-6, Math.hypot(c[0] - q[0], c[2] - q[2]))));
                    for (const p of [inset(side.l), c, inset(side.r)]) {
                        points++;
                        if (p[1] - ground > RoadMesh.PARAPET_DROP_M && !under(group, p[0], p[1], p[2])) bare++;
                    }
                }
                expect({ what, stub, points: points > 0, bare }).toEqual({ what, stub, points: true, bare: 0 });
            }
        }
        // On the land, nothing: the land meets it
        const low = RoadMesh.sideRoad(line(12), false, null, () => null, { groundAt: () => 99.5 });
        expect(low.children.map(c => c.name)).toEqual(['road-side']);
        expect(low.userData.structures).toEqual([]);
        // The caller that batches side roads gets the structures to draw in its one mesh
        const batched = RoadMesh.sideRoad(line(12, { bits: 2 }), false, null, null, { groundAt: () => ground });
        expect(batched.children.map(c => c.name)).toEqual(['road-side']);
        expect(batched.userData.structures[0].positions.length).toBeGreaterThan(0);
    });

    // Every change of surface along the road is blended over RoadMesh.FEATHER_M: asphalt to setts, onto a structure
    test('a change of surface is feathered: no surface weight steps more than 0.3 a metre between rows', () => {
        const steepest = (weights, along) => Math.max(...weights.slice(1).map((w, k) => Math.abs(w - weights[k]) / (along[k + 1] - along[k])));
        for (const bit of [8, 2]) {
            const rows = line(40).map((r, i) => ({ ...r, s: i * 4, bits: i >= 20 && i < 30 ? bit : 0 }));
            const road = RoadMesh.ribbon(rows, 0).geometry.attributes.road.array;
            const lane = bit === 8 ? 1 : 3;
            const weights = rows.map((_, k) => road[k * 7 * 4 + lane]);
            expect({ bit, steepest: steepest(weights, rows.map(r => r.s)) <= 0.3 }).toEqual({ bit, steepest: true });
            // The blend spans FEATHER_M or more: from the last row wholly the one surface to the first wholly the other
            const lastBare = rows[weights.findIndex(w => w > 0) - 1].s, firstFull = rows[weights.indexOf(1)].s;
            expect(firstFull - lastBare).toBeGreaterThanOrEqual(RoadMesh.FEATHER_M);
            // Fully the one surface away from the change, fully the other inside it
            expect(weights[0]).toBe(0);
            expect(weights[25]).toBe(1);
        }
        // Rows held closer (a side road's inserted rows): still no more than 0.3 a metre
        const close = line(40).map((r, i) => ({ ...r, z: i, s: i, bits: i >= 20 ? 8 : 0 }));
        const road = RoadMesh.ribbon(close, 0).geometry.attributes.road.array;
        expect(steepest(close.map((_, k) => road[k * 7 * 4 + 1]), close.map(r => r.s))).toBeLessThanOrEqual(0.3);
        // The shader blends the two surfaces by the weight: it never switches on it
        const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
        RoadSurface.nearMaterial().onBeforeCompile(shader);
        expect(shader.fragmentShader).not.toMatch(/step\(0\.5, vRoad\.y\)/);
        expect(shader.fragmentShader).toContain('mix(roadAA, roadAS, roadSett)');
        // The far ribbon's colour blends the same way
        const rows = line(80).map((r, i) => ({ ...r, s: i * 4, bits: i >= 40 ? 8 : 0 }));
        const far = RoadMesh.ribbon(rows, 1);
        const colour = far.geometry.attributes.color.array, pos = far.geometry.attributes.position.array;
        const a = RoadMesh.COLORS.asphalt, c = RoadMesh.COLORS.cobbles;
        const share = v => (colour[v * 3] - a[0]) / (c[0] - a[0]);
        const byZ = new Map();
        for (let v = 0; v < pos.length / 3; v++) byZ.set(Math.round(pos[v * 3 + 2] * 100) / 100, share(v));
        const zs = [...byZ.keys()].sort((p, q) => p - q);
        expect(steepest(zs.map(z => byZ.get(z)), zs)).toBeLessThanOrEqual(0.3);
        expect(byZ.get(zs[0])).toBeCloseTo(0, 5);
        expect(byZ.get(zs[zs.length - 1])).toBeCloseTo(1, 5);
    });

    // Every face of a box faces out: wound inward, a front-side material (the marker stones) culled the faces
    // toward the viewer and lit the far ones from inside
    test('every face of a box has its normal pointing away from the box centre, at any heading', () => {
        for (const heading of [0, 0.7, Math.PI / 2, 2.5, -1.2]) {
            const out = { positions: [], shades: [] };
            const c = [3, 4, -2];
            RoadMesh.box(out, c[0], c[1], c[2], 1.2, 0.8, 2.5, heading, [0.5, 0.5, 0.5]);
            const p = out.positions;
            expect(p.length / 9).toBe(12);
            for (let t = 0; t < p.length; t += 9) {
                const a = new THREE.Vector3(p[t], p[t + 1], p[t + 2]), b = new THREE.Vector3(p[t + 3], p[t + 4], p[t + 5]), d = new THREE.Vector3(p[t + 6], p[t + 7], p[t + 8]);
                const n = b.clone().sub(a).cross(d.clone().sub(a));
                const mid = a.clone().add(b).add(d).divideScalar(3).sub(new THREE.Vector3(...c));
                expect(n.dot(mid)).toBeGreaterThan(0);
            }
        }
    });

    test('the edge works: an apron at the batter down to lower land, a wall with a parapet, a deck with a soffit, none on a structure', () => {
        const rows = line(10);
        const near = RoadMesh.ribbon(rows, 0);
        // A road's works stand at the verge's outer edge at both levels of detail (a wall never steps when its section
        // changes level, nor stands on the carriageway), a side road's as the ride's
        expect(Math.abs(near.sides[0].l[0] - rows[0].x)).toBeCloseTo(rows[0].width / 2 + RoadSurface.VERGE_M, 4);
        expect(Math.abs(RoadMesh.ribbon(rows, 1).sides[0].r[0] - rows[0].x)).toBeCloseTo(rows[0].width / 2 + RoadSurface.VERGE_M, 4);
        expect(Math.abs(RoadMesh.ribbon(rows, 1).sides[0].rc[0] - rows[0].x)).toBeCloseTo(rows[0].width / 2, 4);
        expect(Math.abs(RoadMesh.ribbon(rows, 1, null, true).sides[0].r[0] - rows[0].x)).toBeCloseTo(rows[0].width / 2 + RoadSurface.VERGE_M, 4);
        const ys = parts => parts.positions.filter((_, i) => i % 3 === 1);
        const xs = parts => parts.positions.filter((_, i) => i % 3 === 0);
        const edgeY = 100 + RoadMesh.LIFT_M, edgeX = rows[0].width / 2 + RoadSurface.VERGE_M;
        // An apron 3 m down runs out about 4.5 m at 1:1.5 from just under the verge: never a vertical face
        const apron = RoadMesh.edgeWorks(near.sides, () => ({ kind: 'apron', y: edgeY - 3 }));
        expect(apron.wall.positions).toHaveLength(0);
        expect(Math.min(...ys(apron.apron))).toBeCloseTo(edgeY - 3, 4);
        expect(Math.max(...xs(apron.apron))).toBeCloseTo(edgeX + (3 - RoadMesh.APRON_UNDER_M) / RoadMesh.BATTER, 3);
        // A retaining wall is stone: it drops to its foot and carries a stone parapet over the edge
        const wall = RoadMesh.edgeWorks(near.sides, () => ({ kind: 'wall', y: edgeY - 6 }));
        // Ground lies under the verge on a wall, and nowhere else (the verge thins out to nothing at its outer edge):
        // never over a carriageway, another road's or another leg of its own
        expect(Math.min(...ys(wall.apron))).toBeCloseTo(edgeY - RoadMesh.APRON_UNDER_M, 4);
        expect(Math.max(...ys(wall.apron))).toBeCloseTo(edgeY - RoadMesh.APRON_UNDER_M, 4);
        expect(Math.max(...xs(wall.apron).map(Math.abs))).toBeCloseTo(edgeX, 4);
        expect(Math.min(...xs(wall.apron).map(Math.abs))).toBeCloseTo(rows[0].width / 2, 4);
        const inRoad = { clear: () => true, depth: () => null, any: () => 0.5, ceiling: () => null };
        expect(RoadMesh.edgeWorks(near.sides, () => ({ kind: 'wall', y: edgeY - 6 }), inRoad).apron.positions).toHaveLength(0);
        expect(wall.wall.positions).toHaveLength(0);
        // A junction's paving (`foot.gore`) is road, a part of its own, and no ground lies under the verge there: the
        // rows have no verge, and a side road lies at the edge
        const gore = () => ({ kind: 'apron', y: edgeY - 3 });
        gore.gore = (x, y, z, ox, oz) => [x + ox * 3, y - 0.13, z + oz * 3];
        const paved = RoadMesh.edgeWorks(near.sides, gore);
        expect(paved.paving.positions.length).toBeGreaterThan(0);
        expect(Math.max(...ys(paved.paving))).toBeLessThanOrEqual(edgeY - RoadMesh.PAVING_UNDER_M + 1e-4);
        expect(Math.min(...xs(paved.apron).map(Math.abs))).toBeGreaterThan(edgeX - 1e-3);
        expect(apron.paving.positions).toHaveLength(0);
        // nor the slope from the verge's edge: it stood in the side road as a sliver of land
        expect(paved.apron.positions).toHaveLength(0);
        // A wall's end that a piece of wall joins to another road's has no return under the road (two quads less
        // an end)
        const joinedFoot = () => ({ kind: 'wall', y: edgeY - 6 });
        joinedFoot.joined = () => true;
        expect(wall.stone.positions.length - RoadMesh.edgeWorks(near.sides, joinedFoot).stone.positions.length).toBe(2 * 2 * 18);
        const pavedGroup = new THREE.Group();
        RoadMesh.addEdgeWorks(pavedGroup, near.sides, gore);
        expect(pavedGroup.children[0].geometry.groups.map(g => g.materialIndex)).toContain(3);
        expect(pavedGroup.children[0].material[3]).toBe(RoadSurface.pavingMaterial());
        expect(pavedGroup.children[0].material[3].map).toBe(RoadSurface.textures().asphalt.map);
        expect(pavedGroup.children[0].geometry.attributes.uv.count).toBe(pavedGroup.children[0].geometry.attributes.position.count);
        expect(Math.min(...ys(wall.stone))).toBeCloseTo(edgeY - 6, 4);
        // (its parapet stands on its coping)
        expect(Math.max(...ys(wall.stone))).toBeCloseTo(edgeY + RoadMesh.COPING_UP_M + RoadMesh.PARAPET_H_M, 4);
        // A step lower than PARAPET_DROP_M has no parapet (the physics rides off it, as WorldPhysics.dropDepthM says):
        // its top is its coping, COPING_UP_M over the edge and COPING_W_M deep from its face, wide enough for a marker
        // stone and a margin either side
        const step = RoadMesh.edgeWorks(near.sides, () => ({ kind: 'wall', y: edgeY - 1.5 }));
        expect(Math.max(...ys(step.stone))).toBeCloseTo(edgeY + RoadMesh.COPING_UP_M, 4);
        const tops = xs(step.stone).filter((x, i) => Math.abs(ys(step.stone)[i] - edgeY - RoadMesh.COPING_UP_M) < 1e-4 && x > 0);
        expect(Math.max(...tops) - Math.min(...tops)).toBeCloseTo(RoadMesh.COPING_W_M, 4);
        expect(RoadMesh.COPING_W_M).toBeCloseTo(Scenery.STONE_WIDTH_M + 2 * RoadMesh.COPING_MARGIN_M, 6);
        expect(RoadMesh.COPING_MARGIN_M).toBeGreaterThan(0);
        expect(RoadMesh.PARAPET_DROP_M).toBe(WorldPhysics.dropDepthM);
        // A deck hangs DECK_M with a soffit under the road
        const deck = RoadMesh.edgeWorks(near.sides, () => ({ kind: 'deck' }));
        expect(Math.min(...ys(deck.wall))).toBeCloseTo(edgeY - RoadMesh.DECK_M, 4);
        expect(deck.stone.positions).toHaveLength(0);
        // (its soffit runs under the road from one edge to the other)
        const under = xs(deck.wall).filter((x, i) => Math.abs(ys(deck.wall)[i] - (edgeY - RoadMesh.DECK_M)) < 1e-4);
        expect(Math.min(...under)).toBeLessThan(0);
        expect(Math.max(...under)).toBeGreaterThan(0);
        expect(RoadMesh.edgeWorks(near.sides, () => null).apron.positions).toHaveLength(0);
        const roofed = RoadMesh.ribbon(rows.map(r => ({ ...r, bits: 2 })), 0);
        const none = RoadMesh.edgeWorks(roofed.sides, () => ({ kind: 'wall', y: 0 }));
        expect(none.wall.positions.length + none.apron.positions.length + none.stone.positions.length).toBe(0);
        const group = RoadMesh.section(rows, 0, { foot: () => ({ kind: 'apron', y: edgeY - 2 }) });
        expect(group.children.map(c => c.name)).toEqual(['road-ribbon', 'road-works']);
    });

    test('past its end a wall goes on along the edge, as thick and as high as the wall, with its parapet, and ends closed; the slope starts at its foot', () => {
        // A wall along the first 20 m (asked for at the rows to 16 m: a segment is a wall when either row is), then a
        // slope 3 m down; the land in front of the wall 2 m under the edge
        const rows = line(10);
        const near = RoadMesh.ribbon(rows, 0);
        const edgeY = 100 + RoadMesh.LIFT_M, land = edgeY - 2;
        const foot = (x, y, z, ox, oz, walled) => (walled !== false && z <= 16 ? { kind: 'wall', y: y - 6 } : { kind: 'apron', y: y - 3 });
        foot.wall = (x, y, z) => (z <= 16 ? { y: y - 6 } : null);
        foot.land = () => land;
        const works = RoadMesh.edgeWorks(near.sides, foot);
        const points = part => { const out = []; for (let i = 0; i < part.positions.length; i += 3) out.push(part.positions.slice(i, i + 3)); return out; };
        const stone = points(works.stone), apron = points(works.apron);
        const has = (list, p) => list.some(q => Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) < 1e-4);
        const T = RoadMesh.TAPER_M;
        for (const key of ['l', 'r']) {
            const edge = near.sides[5][key], sign = Math.sign(edge[0]), own = q => Math.sign(q[0]) === sign;
            // At the wall's end the face goes on from the wall's own top corner (STONE_PROUD_M out, at its coping), and
            // the parapet goes on over it at its full height: no kerb, and no end of it there
            const corner = [edge[0] + sign * RoadMesh.STONE_PROUD_M, edge[1] + RoadMesh.COPING_UP_M, 20];
            const rail = RoadMesh.COPING_UP_M + RoadMesh.PARAPET_H_M;
            expect(stone.filter(q => Math.hypot(q[0] - corner[0], q[1] - corner[1], q[2] - corner[2]) < 1e-4).length).toBeGreaterThan(3);
            expect(has(stone, [corner[0], edge[1] + rail, 20])).toBe(true);
            expect(has(stone, [corner[0], near.sides[4][key][1] + rail, 16])).toBe(true);
            expect(stone.filter(q => own(q) && Math.abs(q[2] - 20) < 1e-6 && q[1] > corner[1] + 1e-4 && q[1] < edge[1] + rail - 1e-4)).toEqual([]);
            // and the slope has no width there: no ground of this side stands out from the edge at the wall's last row
            expect(apron.filter(q => own(q) && Math.abs(q[2] - 20) < 1e-6 && Math.abs(q[0]) > Math.abs(edge[0]) + 0.01)).toEqual([]);
            // A third of the way along the taper (the next row) the stone holds two thirds of the 3 m the slope
            // falls: its face stands on the wall's line, its top the wall's level coping over the edge, and the slope
            // starts 2 m under the edge
            const row = 20 + T / 3, P = RoadMesh.STONE_PROUD_M, W = RoadMesh.COPING_W_M - P;
            expect(has(stone, [corner[0], edge[1] + RoadMesh.COPING_UP_M, row])).toBe(true);
            expect(has(stone, [edge[0] - sign * W, edge[1] + RoadMesh.COPING_UP_M, row])).toBe(true);
            // (its foot no higher than the wall's own, 6 m under the edge at its end, carried on and rising along it)
            expect(has(stone, [corner[0], edge[1] - 4, row])).toBe(true);
            expect(has(apron, [edge[0], edge[1] - 2, row])).toBe(true);
            // A segment the stone holds whole is one piece of face and one of coping: none stands at the strip
            // between two rows
            expect(stone.filter(q => own(q) && Math.abs(q[2] - (20 + T / 6)) < 1e-6)).toEqual([]);
            // Where it ends it still stands WALL_MIN_UP_M over the edge, its coping as wide as before, and its end is
            // closed across its thickness from the coping down to its foot in the ground under the slope's top
            // (its foot in the land drawn in front of it, as along the taper)
            const tip = 20 + T, deep = Math.min(edge[1] - RoadMesh.APRON_UNDER_M - RoadMesh.TAPER_UNDER_M, land - RoadMesh.TAPER_UNDER_M);
            expect(RoadMesh.COPING_UP_M).toBe(RoadMesh.WALL_MIN_UP_M);
            expect(RoadMesh.WALL_MIN_UP_M).toBeGreaterThanOrEqual(0.5);
            for (const p of [[corner[0], edge[1] + RoadMesh.COPING_UP_M], [edge[0] - sign * W, edge[1] + RoadMesh.COPING_UP_M], [corner[0], deep], [edge[0] - sign * W, deep]]) expect(has(stone, [p[0], p[1], tip])).toBe(true);
            expect(stone.filter(q => own(q) && Math.abs(q[2] - tip) < 1e-6 && q[1] < deep - 1e-4)).toEqual([]);
            expect(Math.abs(corner[0] - (edge[0] - sign * W))).toBeCloseTo(W + P, 6);
            // and its parapet ends there with it, at its full height, flush with the wall's closed end and closed across
            // its own end (from the stone's face in by PARAPET_W_M)
            const inside = edge[0] - sign * RoadMesh.PARAPET_W_M;
            for (const p of [[corner[0], edge[1] + rail], [inside, edge[1] + rail], [inside, edge[1] + RoadMesh.COPING_UP_M]]) expect(has(stone, [p[0], p[1], tip])).toBe(true);
            // Past it there is no stone, and the slope starts at the edge as any slope does
            expect(stone.filter(q => own(q) && q[2] > 20 + T + 1e-6)).toEqual([]);
            expect(has(apron, [edge[0], edge[1] - RoadMesh.APRON_UNDER_M, 20 + T])).toBe(true);
        }
        // Every upright face of it is laid and lit as the wall's own face (`face`: 1, 2 where it is drawn from its
        // front only, 3 its side to the road and its closed end), with the wall's metres; the rest is its coping, lit by its own slope as a parapet's is, near
        // level and as wide as the wall's coping all along
        const face = works.stone.face;
        let faces = 0, copings = 0;
        for (let i = 0; i + 2 < stone.length; i += 3) {
            const t = [stone[i], stone[i + 1], stone[i + 2]];
            if (!t.every(q => q[2] > 20 - 1e-6) || t.every(q => Math.abs(q[2] - 20) < 1e-6)) continue;
            // (not its parapet's, which stands over the coping)
            if (t.some(q => q[1] > edgeY + RoadMesh.COPING_UP_M + 1e-3)) continue;
            const plan = Math.abs((t[1][0] - t[0][0]) * (t[2][2] - t[0][2]) - (t[2][0] - t[0][0]) * (t[1][2] - t[0][2]));
            if (plan < 1e-3) {
                faces++;
                for (let v = i; v < i + 3; v++) expect(face[v * 4 + 1]).toBeGreaterThanOrEqual(1);
                continue;
            }
            copings++;
            for (let v = i; v < i + 3; v++) expect(face[v * 4 + 1]).toBe(0);
            expect(Math.max(...t.map(q => q[1])) - Math.min(...t.map(q => q[1]))).toBeLessThan(0.1);
            const xs = t.map(q => Math.abs(q[0]));
            expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(RoadMesh.COPING_W_M, 4);
        }
        expect(faces).toBeGreaterThan(8);
        expect(copings).toBeGreaterThan(8);
        // and no stone stands out from the edge: the wing that closed the slope's side is gone
        expect(stone.filter(q => Math.abs(q[0]) > Math.abs(near.sides[5].l[0]) + 0.2)).toEqual([]);
    });

    test('a wall too short to stand does not stand because it went on', () => {
        const rows = line(10);
        const sides = RoadMesh.ribbon(rows, 0).sides;
        // The land asks for a wall at one row (two segments, 8 m: under WALL_RUN_M), and lets a wall go on a row more
        const short = { wall: (x, y, z, ox, oz, forced, on) => (z === 16 || (on && z === 20) ? { y: y - 6 } : null) };
        expect(RoadMesh.wallPlan(sides, short).seg.l.some(Boolean)).toBe(false);
        // Asked for at two rows (12 m), it stands, and goes on
        const long = { wall: (x, y, z, ox, oz, forced, on) => (z === 12 || z === 16 || (on && z === 20) ? { y: y - 6 } : null) };
        expect(RoadMesh.wallPlan(sides, long).seg.l.filter(Boolean)).toHaveLength(4);
    });
});

describe('TerrainMesh', () => {
    const N = WorldData.TILE_N;
    const tile = (over = {}) => {
        const heights = new Float32Array(N * N).fill(1000);
        const zones = new Uint8Array(N * N);
        return { key: '0,0', tx: 0, tz: 0, heights, zones, ...over };
    };

    test.each([[0, 8704], [1, 2048 + 256], [2, 512 + 128]])('LOD%i has the triangles its cells and skirts add up to', (lod, expected) => {
        const { mesh, triangles } = TerrainMesh.build(tile(), null, lod);
        expect(triangles).toBe(expected);
        expect(TerrainMesh.triangles(lod)).toBe(expected);
        expect(finite(mesh.geometry)).toBe(true);
        expect(mesh.geometry.index.count / 3).toBe(expected);
    });

    test('the mesh spans its 512 m square and the faces look up', () => {
        const { mesh } = TerrainMesh.build(tile({ tx: 2, tz: -1, key: '2,-1' }), null, 1);
        mesh.geometry.computeBoundingBox();
        expect(mesh.geometry.boundingBox.min.x).toBe(1024);
        expect(mesh.geometry.boundingBox.max.x).toBe(1536);
        expect(mesh.geometry.boundingBox.min.z).toBe(-512);
        const normals = mesh.geometry.attributes.normal.array;
        // Inside the tile the grid's own vertices face up on flat ground (the edge vertices share their normal with the skirt)
        for (let b = 1; b < 32; b++) for (let a = 1; a < 32; a++) expect(normals[(b * 33 + a) * 3 + 1]).toBeGreaterThan(0.99);
    });

    test('the skirt hangs 3 m under the edge it hides a crack in', () => {
        const { mesh } = TerrainMesh.build(tile(), null, 2);
        mesh.geometry.computeBoundingBox();
        expect(mesh.geometry.boundingBox.min.y).toBe(1000 - TerrainMesh.SKIRT_M);
    });

    test('carved road and bench are drawn under the height the physics reads', () => {
        const t = tile();
        t.zones[10 * N + 10] = 1;
        t.zones[10 * N + 11] = 2;
        const { mesh } = TerrainMesh.build(t, null, 0);
        const y = at => mesh.geometry.attributes.position.array[at * 3 + 1];
        expect(y(10 * N + 10)).toBeCloseTo(1000 - TerrainMesh.SINK_M, 4);
        expect(y(10 * N + 11)).toBeCloseTo(1000 - TerrainMesh.SINK_M, 4);
        expect(y(10 * N + 12)).toBe(1000);
    });

    test('land cover picks the colour; steep ground is rock, and snow lies only high up and facing north', () => {
        const cover = new Uint8Array(32 * 32).fill(1);
        expect(TerrainMesh.colorAt(tile(), cover, 4, 4, 1200)).toEqual(TerrainMesh.COVER_COLORS[1]);
        const t = tile();
        t.zones[4 * N + 4] = 5;
        expect(TerrainMesh.colorAt(t, cover, 4, 4, 1200)).toEqual(TerrainMesh.COVER_COLORS[7]);
        const grass = new Uint8Array(32 * 32).fill(5);
        // A 60 degree slope of grass is rock
        const steep = TerrainMesh.colorAt(tile(), grass, 4, 4, 1500, 0.5, 0, 100, 100);
        expect([LandShade.PALETTE.rock, LandShade.PALETTE.scree]).toContainEqual(steep);
        // High ground facing north in late summer carries snow somewhere; facing south it carries none
        const brightest = north => Math.max(...Array.from({ length: 40 }, (_, k) => TerrainMesh.colorAt(tile(), grass, 4, 4, 3100, 0.1, north, k * 37, k * 53)[2]));
        expect(brightest(1)).toBeGreaterThan(0.85);
        expect(brightest(-1)).toBeLessThan(0.6);
    });

    test('a carved cell is a worn verge, not a bare band: the road shows more ground than the bench', () => {
        const grass = new Uint8Array(32 * 32).fill(5);
        const t = tile();
        t.zones[4 * N + 4] = WorldData.ZONE.road;
        t.zones[4 * N + 6] = WorldData.ZONE.bench;
        const road = TerrainMesh.colorAt(t, grass, 4, 4, 1200, 0, 0, 10, 10);
        const bench = TerrainMesh.colorAt(t, grass, 6, 4, 1200, 0, 0, 10, 10);
        const open = TerrainMesh.colorAt(tile(), grass, 6, 4, 1200, 0, 0, 10, 10);
        const toBare = c => Math.hypot(...c.map((v, k) => v - TerrainMesh.BARE[k]));
        expect(toBare(road)).toBeLessThan(toBare(bench));
        expect(toBare(bench)).toBeLessThan(toBare(open));
    });

    test('forest at LOD1 carries crown clumps in the tile\'s own geometry; none at LOD0, LOD2 or on open ground', () => {
        const forest = new Uint8Array(32 * 32).fill(1);
        const base = TerrainMesh.triangles(1);
        const near = TerrainMesh.build(tile(), forest, 0);
        expect(near.triangles).toBe(TerrainMesh.triangles(0));
        const mid = TerrainMesh.build(tile(), forest, 1);
        const clumps = TerrainMesh.clumps(tile(), forest, 1);
        expect(clumps.length).toBeGreaterThan(250);
        expect(mid.triangles).toBe(base + clumps.length * TerrainMesh.CLUMP_SIDES);
        expect(finite(mid.mesh.geometry)).toBe(true);
        expect(TerrainMesh.clumps(tile(), new Uint8Array(32 * 32).fill(5), 1)).toHaveLength(0);
        // The same clumps every time, and none beyond 2 km
        expect(TerrainMesh.clumps(tile(), forest, 1)).toEqual(clumps);
        expect(TerrainMesh.clumps(tile(), forest, 2)).toHaveLength(0);
    });

    test('a tile\'s colours are made once, linear, and kept across LOD changes', () => {
        const forest = new Uint8Array(32 * 32).fill(1);
        const t = tile();
        const first = TerrainMesh.colours(t, forest);
        expect(TerrainMesh.colours(t, forest)).toBe(first);
        const { mesh } = TerrainMesh.build(t, forest, 2);
        expect(mesh.geometry.userData.linearColors).toBe(true);
        expect(first[0]).toBeCloseTo(TerrainMesh.toLinear(TerrainMesh.COVER_COLORS[1][0]), 3);
        // A new cover is new colours
        expect(TerrainMesh.colours(t, new Uint8Array(32 * 32).fill(5))).not.toBe(first);
    });
});

describe('Horizon', () => {
    const far = (nx, nz, fill = 1500) => ({ x0: 0, z0: 0, nx, nz, cell: 100, data: new Int16Array(nx * nz).fill(fill) });

    test('a small grid is drawn whole, a cell under the tiles height', () => {
        const { mesh, triangles } = Horizon.build(far(11, 11));
        expect(triangles).toBe(10 * 10 * 2);
        mesh.geometry.computeBoundingBox();
        expect(mesh.geometry.boundingBox.max.y).toBe(1500 - Horizon.SINK_M);
    });

    test('a cell with no data is left out', () => {
        const grid = far(11, 11);
        grid.data[5 * 11 + 5] = -32768;
        expect(Horizon.build(grid).triangles).toBe(100 * 2 - 4 * 2);
    });

    test('each vertex is sunk by its own metres when the importer gives them (far/sink0.bin)', () => {
        const sinks = new Uint8Array(11 * 11).fill(8);
        sinks[5 * 11 + 5] = 40;
        const { mesh } = Horizon.build(far(11, 11), null, sinks);
        const y = mesh.geometry.attributes.position.array;
        expect(y[(5 * 11 + 5) * 3 + 1]).toBe(1500 - 40);
        expect(y[1]).toBe(1500 - 8);
    });

    test('cover shares colour the far land: forest is darker than open grass at the same height', () => {
        const cover = n => new Uint8Array(11 * 11 * 4).map((_, i) => (i % 4 === 0 ? n : i % 4 === 3 ? 255 : 0));
        const mean = mesh => { const c = mesh.geometry.attributes.color.array; let s = 0; for (const v of c) s += v; return s / c.length; };
        expect(mean(Horizon.build(far(11, 11), cover(255)).mesh)).toBeLessThan(mean(Horizon.build(far(11, 11), cover(0)).mesh) * 0.7);
    });

    test('a large grid is thinned to the triangle budget', () => {
        const grid = far(751, 851);
        expect(Horizon.strideFor(grid)).toBeGreaterThan(1);
        expect(Horizon.build(grid).triangles).toBeLessThanOrEqual(Horizon.MAX_TRIANGLES);
    });
});

describe('Scenery', () => {
    // Tile (0,0): a road along x = 100 (zone road), grass cover with forest everywhere
    const road = (x) => Math.abs(x - 100) <= 5;
    const data = fakeData({ tiles: allTiles(0, 0, 0, 0), shape: () => 1000, zone: x => (road(x) ? 1 : 0) });
    const route = new WorldRoute(samplesOf(straight(400)), {});
    const ground = new WorldGround(route, data);
    const forest = new Uint8Array(32 * 32).fill(1);
    const tile = data.tile('0,0');

    test('the same tile has the same trees every time, in the same places', () => {
        const a = new Scenery(ground, data).treeSites(tile, forest);
        const b = new Scenery(ground, data).treeSites(tile, forest);
        expect(a.length).toBeGreaterThan(50);
        expect(a.map(s => [s.x, s.z, s.shape.name, s.scale])).toEqual(b.map(s => [s.x, s.z, s.shape.name, s.scale]));
    });

    test('no tree stands on the road, its bench, or within a few metres of them', () => {
        const sites = new Scenery(ground, data).treeSites(tile, forest);
        for (const site of sites) expect(Math.abs(site.x - 100)).toBeGreaterThan(5 + Scenery.ROAD_CLEAR_M - 1e-6);
    });

    test('trees stand on the ground the physics reads and no cover means no trees', () => {
        const scenery = new Scenery(ground, data);
        for (const site of scenery.treeSites(tile, forest).slice(0, 20)) expect(site.y).toBe(1000);
        expect(scenery.treeSites(tile, null)).toEqual([]);
        expect(scenery.treeSites(tile, new Uint8Array(32 * 32).fill(3))).toEqual([]);
    });

    test('a tile is built nearest first within the caps, and freed without freeing the shared shapes', () => {
        const scenery = new Scenery(ground, data);
        const bike = { x: 100, z: 100 };
        const group = scenery.buildTile(tile, forest, [], bike);
        expect(group).not.toBeNull();
        const count = group.children.filter(mesh => mesh.name.startsWith('trees:')).reduce((n, mesh) => n + mesh.count, 0);
        expect(count).toBe(scenery.treeCount);
        expect(scenery.treeCount).toBeLessThanOrEqual(Scenery.TREES_PER_TILE);
        expect(scenery.triangles).toBeLessThanOrEqual(Scenery.TRIANGLE_CAP);
        const shape = group.children[0].geometry;
        scenery.disposeTile('0,0');
        expect(scenery.treeCount).toBe(0);
        expect(scenery.triangles).toBe(0);
        expect(scenery.perTile.size).toBe(0);
        // The shared geometry is still usable
        expect(shape.attributes.position.count).toBeGreaterThan(0);
    });

    test('the tree cap holds across tiles', () => {
        const scenery = new Scenery(ground, data);
        scenery.treeCount = Scenery.TREE_CAP - 10;
        const group = scenery.buildTile(tile, forest, [], { x: 100, z: 100 });
        expect(scenery.treeCount).toBeLessThanOrEqual(Scenery.TREE_CAP);
        expect(group.children.filter(mesh => mesh.name.startsWith('trees:')).reduce((n, mesh) => n + mesh.count, 0)).toBeLessThanOrEqual(10);
    });

    test('houses stand on open ground within reach, nearest first, capped by their triangles', () => {
        const scenery = new Scenery(ground, data);
        const houses = Array.from({ length: 80 }, (_, i) => ({ x: 200 + (i % 10) * 20, z: 50 + Math.floor(i / 10) * 20, w: 8, d: 10, heading: 0.3, h: 6, kind: 1 }));
        houses.push({ x: 100, z: 100, w: 8, d: 10, heading: 0, h: 6, kind: 1 }, { x: 5000, z: 5000, w: 8, d: 10, heading: 0, h: 6, kind: 1 });
        const group = scenery.buildTile(tile, null, houses, { x: 200, z: 50 });
        const meshes = group.children.filter(m => m.name.startsWith('houses:') && m.name !== 'houses:footing');
        // A shape of several parts is one mesh for each part, with the same name and count
        const placed = [...new Map(meshes.map(m => [m.name, m.count])).values()].reduce((n, c) => n + c, 0);
        expect(placed).toBeGreaterThan(0);
        expect(placed).toBeLessThanOrEqual(houses.length - 2);
        expect(scenery.houseInstances).toBeLessThanOrEqual(Scenery.BUILDING_CAP);
        // Each house has its footing, from under the land (flat at 1000 here) up into the walls; the floor is on the land
        const footing = group.children.find(m => m.name === 'houses:footing');
        expect(footing.material).toBe(RoadMesh.stoneMaterial());
        expect(footing.userData.footings).toHaveLength(placed);
        const body = new THREE.Matrix4();
        meshes[0].getMatrixAt(0, body);
        const floor = new THREE.Vector3().setFromMatrixPosition(body).y;
        const first = footing.userData.footings[0];
        // (the instance matrices are float32)
        expect(first.bottom).toBeCloseTo(1000 - Scenery.FOOTING_UNDER_M, 6);
        expect(floor).toBeCloseTo(1000 - Scenery.FLOOR_SINK_M, 3);
        expect(first.top).toBeCloseTo(floor + Scenery.FOOTING_OVER_M, 3);
        // No house on the road (x = 100), none beyond reach
        const matrix = new THREE.Matrix4();
        for (const mesh of meshes) {
            for (let i = 0; i < mesh.count; i++) {
                mesh.getMatrixAt(i, matrix);
                const at = new THREE.Vector3().setFromMatrixPosition(matrix);
                expect(Math.abs(at.x - 100)).toBeGreaterThan(5);
                expect(Math.hypot(at.x - 200, at.z - 50)).toBeLessThanOrEqual(Scenery.BUILDING_REACH_M);
            }
        }
    });

    test('a modelled house is drawn inside its mapped footprint, and a footprint too small for one is a box of its size', () => {
        // A model shaped as the village houses are: 16 m along its front, 11 m deep, the front on z = 0
        const body = new THREE.BoxGeometry(16, 10, 11.4);
        body.translate(0, 5, 4.3);
        const material = new THREE.MeshStandardMaterial();
        const models = { trees: [], houses: [{ name: 'house_test', parts: [{ geometry: body, material }] }] };
        const scenery = new Scenery(ground, data, models);
        const houses = [
            { x: 200, z: 60, w: 12, d: 9, heading: 0.4, h: 7, kind: 1 },
            { x: 240, z: 60, w: 9, d: 14, heading: -1.1, h: 7, kind: 1 },
            { x: 280, z: 60, w: 30, d: 25, heading: 2.0, h: 9, kind: 1 },
            { x: 320, z: 60, w: 4, d: 3, heading: 0.7, h: 3.5, kind: 3 }
        ];
        const group = scenery.buildTile(tile, null, houses, { x: 250, z: 60 });
        const matrix = new THREE.Matrix4();
        const corner = new THREE.Vector3();
        let drawn = 0;
        for (const mesh of group.children.filter(m => m.name.startsWith('houses:') && m.name !== 'houses:footing')) {
            mesh.geometry.computeBoundingBox();
            const box = mesh.geometry.boundingBox;
            for (let i = 0; i < mesh.count; i++) {
                mesh.getMatrixAt(i, matrix);
                const at = new THREE.Vector3().setFromMatrixPosition(matrix);
                const b = houses.reduce((best, h) => (Math.hypot(h.x - at.x, h.z - at.z) < Math.hypot(best.x - at.x, best.z - at.z) ? h : best));
                for (const x of [box.min.x, box.max.x]) for (const z of [box.min.z, box.max.z]) {
                    corner.set(x, 0, z).applyMatrix4(matrix);
                    const dx = corner.x - b.x, dz = corner.z - b.z;
                    const along = dx * Math.sin(b.heading) + dz * Math.cos(b.heading);
                    const across = dx * Math.cos(b.heading) - dz * Math.sin(b.heading);
                    expect(Math.abs(along)).toBeLessThanOrEqual(b.d / 2 + 1e-6);
                    expect(Math.abs(across)).toBeLessThanOrEqual(b.w / 2 + 1e-6);
                }
                drawn++;
            }
        }
        // The hut (the shed's footprint is too small for a house) is two parts, walls and roof
        expect(drawn).toBe(houses.length + 1);
        expect(group.children.filter(m => m.name === 'houses:plain_hut').reduce((n, m) => n + m.count, 0)).toBe(2);
    });

    test('marker stones stand along a sharp drop, on the side it falls, each in the ground at its own place', () => {
        // A road along x = 100 at the land's height. Past x = 106 the land falls 1 in 1: 8 m under the road 10 m past
        // the verge on that side, and level on the other
        const fall = fakeData({ tiles: allTiles(0, 0, 0, 0), shape: x => (x > 106 ? 1000 - (x - 106) : 1000), zone: () => 0 });
        const route = new WorldRoute(samplesOf(straight(400, { y: 1000 }).map(q => ({ ...q, x: 100 }))), {});
        const ground = new WorldGround(route, fall);
        const scenery = new Scenery(ground, fall);
        const rule = Scenery.STONE_RULE, gap = Scenery.STONE_GAP_M, each = 24, last = Math.floor(route.length / gap);
        const p = route.sample(100, {});
        const lateral = q => (q.x - p.x) * Math.cos(p.heading) - (q.z - p.z) * Math.sin(p.heading);
        const down = Math.sign(lateral({ x: 110, z: p.z }));
        // The whole drop is one stretch on the falling side, read on past the stations asked for to its ends; none on
        // the level side
        const stretches = scenery.stoneStretches(each, each + 2, down);
        expect(stretches).toHaveLength(1);
        const stretch = stretches[0];
        expect(stretch[0].k).toBeLessThan(each);
        expect(stretch[stretch.length - 1].k).toBeGreaterThan(each + 2);
        for (let i = 1; i < stretch.length; i++) expect(stretch[i].k - stretch[i - 1].k).toBe(1);
        expect(scenery.stoneStretches(0, last, down).map(run => run.map(q => q.k))).toEqual([stretch.map(q => q.k)]);
        expect(scenery.stoneStretches(0, last, -down)).toEqual([]);
        const place = scenery.stonePlace(each + 3, down);
        expect(place.drop).toBeGreaterThan(rule.dropM);
        expect(Math.sign(lateral(place))).toBe(down);
        expect(scenery.roads.clearance(place.x, place.z)).toBeGreaterThanOrEqual(Scenery.STONE_RADIUS_M + Scenery.CLEAR_M.stone - 1e-9);
        // A share of the stretches has its stones, drawn from the stretch's first station and side: the same every
        // time, and not all of them
        const firsts = [...Array(400).keys()];
        const chosen = firsts.filter(k => Scenery.stoneUsed(k, down));
        expect(chosen.length).toBeGreaterThan(400 * (rule.share - 0.1));
        expect(chosen.length).toBeLessThan(400 * (rule.share + 0.1));
        expect(firsts.filter(k => Scenery.stoneUsed(k, down))).toEqual(chosen);
        // A chosen stretch has a stone at every station of it, and no kerb course under them: a drop's row is its blocks
        const used = Scenery.stoneUsed;
        Scenery.stoneUsed = () => true;
        const group = scenery.buildTile(fall.tile('0,0'), null, [], { x: 100, z: 100 });
        Scenery.stoneUsed = () => false;
        const none = scenery.stoneSites(fall.tile('0,0'));
        Scenery.stoneUsed = used;
        expect(none).toEqual([]);
        const stones = group.children.find(m => m.name === 'stones');
        expect(stones.isInstancedMesh).toBe(true);
        expect(group.children.find(m => m.name === 'stone-kerbs')).toBeUndefined();
        expect(stones.count).toBe(Math.min(stretch.length, Scenery.STONE_CAP));
        expect(stones.geometry.attributes.position.count / 3).toBe(10);
        stones.geometry.computeBoundingBox();
        expect([stones.geometry.boundingBox.min.y, stones.geometry.boundingBox.max.y]).toEqual([-Scenery.STONE_ROOT_M, Scenery.STONE_SINK_M + Scenery.STONE_HEIGHT_M].map(n => expect.closeTo(n, 5)));
        const matrix = new THREE.Matrix4(), at = new THREE.Vector3();
        const along = [];
        for (let i = 0; i < stones.count; i++) {
            stones.getMatrixAt(i, matrix);
            at.setFromMatrixPosition(matrix);
            expect(Math.sign(lateral(at))).toBe(down);
            // In the ground: sunk under its seat (the verge's edge beside it, at the road's height: the fill falls
            // from there, and the ground at its own middle is under it), and its root goes on under every corner
            expect(ground.groundY(at.x, at.z, null)).toBeLessThan(1000);
            expect(1000 - at.y).toBeCloseTo(Scenery.STONE_SINK_M, 3);
            for (const [a, c] of [[-0.3, -0.3], [0.3, -0.3], [0.3, 0.3], [-0.3, 0.3]]) expect(at.y + stones.geometry.boundingBox.min.y).toBeLessThan(ground.groundY(at.x + a, at.z + c, null));
            along.push(route.project(at.x, at.z, null, {}).s);
        }
        along.sort((a, b) => a - b);
        for (let i = 1; i < along.length; i++) expect((along[i] - along[i - 1]) / gap).toBeCloseTo(Math.round((along[i] - along[i - 1]) / gap), 3);
        // A stretch shorter than minM gets no stones: the drop on 5 m of the road only
        const short = new Scenery(ground, fall);
        const stonePlace = short.stonePlace.bind(short);
        short.stonePlace = (k, side) => (k >= each && k <= each + 2 ? stonePlace(k, side) : null);
        expect(short.stoneStretches(0, last, down)).toEqual([]);
        // A level road has none, and nor has a drop the fill of a plain bank makes (1 in 1.5)
        const level = fakeData({ tiles: allTiles(0, 0, 0, 0), shape: () => 1000, zone: () => 0 });
        expect(new Scenery(new WorldGround(route, level), level).stoneSites(level.tile('0,0'))).toEqual([]);
        const bank = fakeData({ tiles: allTiles(0, 0, 0, 0), shape: x => (x > 106 ? 1000 - (x - 106) / 1.5 : 1000), zone: () => 0 });
        expect(new Scenery(new WorldGround(route, bank), bank).stoneSites(bank.tile('0,0'))).toEqual([]);
        // Where a wall or a bridge guards the edge, where a rider stops and in a roadworks site: none at a drop
        const walled = new Scenery(ground, fall);
        ground.walledAt = () => true;
        expect(walled.stoneStretches(0, last, down)).toEqual([]);
        delete ground.walledAt;
        const works = new Scenery(ground, fall);
        works.stoneShut = [{ s0: 95, s1: 110 }];
        expect(works.stoneStretches(0, last, down).flat().map(q => q.k * gap).filter(s => s >= 95 - rule.worksM && s <= 110 + rule.worksM)).toEqual([]);
        expect(works.stoneStretches(0, last, down).flat().length).toBeGreaterThan(0);
        // And no ground to stand on: no stone, not a stone in the air
        const bare = new Scenery(ground, fall);
        bare.footY = () => null;
        expect(bare.stoneSites(fall.tile('0,0'))).toEqual([]);
    });

    test('marker stones stand on the top of a low wall that holds the road up, on the middle of its coping, over all of it, and none on a wall that drops wallMaxM or more', () => {
        // A road along x = 100 on level land, and a wall under its edge on one side from 150 m to 250 m (as
        // WorldEnvironment.wallTop gives it from the wall plan)
        const flat = fakeData({ tiles: allTiles(0, 0, 0, 0), shape: () => 1000, zone: () => 0 });
        const route = new WorldRoute(samplesOf(straight(400, { y: 1000 }).map(q => ({ ...q, x: 100 }))), {});
        const ground = new WorldGround(route, flat);
        const scenery = new Scenery(ground, flat);
        const points = route.points, side = 1;
        const edge = i => { const q = points[i], o = side * (q.width / 2 + RoadSurface.VERGE_M); return [q.x + o * Math.cos(q.heading), q.y, q.z - o * Math.sin(q.heading)]; };
        const out = i => [side * Math.cos(points[i].heading), -side * Math.sin(points[i].heading)];
        let abuts = false, heights = [1.5, 1.6];
        ground.wallTop = (i, sign) => (sign === side && points[i].s >= 150 && points[i + 1].s <= 250 ? { a: edge(i), b: edge(i + 1), oa: out(i), ob: out(i + 1), abuts, railed: abuts || Math.max(...heights) >= RoadMesh.PARAPET_DROP_M, heights } : null);
        const runs = scenery.wallRuns(0, points.length - 2, side);
        expect(runs).toHaveLength(1);
        const run = runs[0];
        expect(run.start).toBe(Math.round(points.find(q => q.s >= 150).s));
        // The whole wall, STONE_GAP_M apart along it, each on the middle of the coping (COPING_W_M from the face, which
        // stands STONE_PROUD_M out from the edge), seated on its top
        expect(run.length).toBe(Math.floor((run[run.length - 1].s - run[0].s) / Scenery.STONE_GAP_M + 1e-6) + 1);
        expect(run[0].s).toBeLessThan(150 + Scenery.STONE_GAP_M + 1);
        expect(run[run.length - 1].s).toBeGreaterThan(250 - Scenery.STONE_GAP_M - 1);
        const half = points[0].width / 2 + RoadSurface.VERGE_M + RoadMesh.STONE_PROUD_M - RoadMesh.COPING_W_M / 2;
        for (const q of run) {
            expect(q.wall).toBe(true);
            expect(Math.abs(route.project(q.x, q.z, null, {}).lateral)).toBeCloseTo(half, 3);
            expect(q.seat).toBeCloseTo(1000 + RoadMesh.COPING_UP_M, 3);
        }
        // The coping holds the stone and a margin either side
        expect(RoadMesh.COPING_W_M - Scenery.STONE_WIDTH_M).toBeCloseTo(2 * RoadMesh.COPING_MARGIN_M, 6);
        // Drawn when the wall is chosen, each block alone (no kerb course on a wall's top), on the coping
        const used = Scenery.wallUsed;
        Scenery.wallUsed = () => true;
        const sites = scenery.stoneSites(flat.tile('0,0'));
        Scenery.wallUsed = used;
        expect(sites).toHaveLength(run.length);
        for (const q of sites) {
            expect(q.kind).toBe('wall');
            expect(q.next).toBeNull();
            expect(q.y).toBeCloseTo(1000 + RoadMesh.COPING_UP_M - Scenery.STONE_SINK_M, 3);
        }
        // A share of the walls has its row, from the wall's first row and side
        const starts = [...Array(400).keys()];
        const chosen = starts.filter(k => Scenery.wallUsed(k, side)).length;
        expect(chosen).toBeGreaterThan(400 * (Scenery.STONE_RULE.wallShare - 0.1));
        expect(chosen).toBeLessThan(400 * (Scenery.STONE_RULE.wallShare + 0.1));
        // A wall high enough for a parapet but under wallMaxM is low: its row takes the parapet's place
        heights = [Scenery.STONE_RULE.wallMaxM - 0.5, RoadMesh.PARAPET_DROP_M + 0.1];
        expect(new Scenery(ground, flat).wallRuns(0, points.length - 2, side)).toHaveLength(1);
        // None on a wall that drops wallMaxM or more anywhere along it, that meets a structure, or that does not hold
        // the road up
        heights = [1.5, Scenery.STONE_RULE.wallMaxM];
        expect(new Scenery(ground, flat).wallRuns(0, points.length - 2, side)).toEqual([]);
        heights = [1.5, 1.6];
        abuts = true;
        expect(new Scenery(ground, flat).wallRuns(0, points.length - 2, side)).toEqual([]);
        abuts = false;
        heights = [0.1, 1.5];
        expect(new Scenery(ground, flat).wallRuns(0, points.length - 2, side)).toEqual([]);
        heights = [1.5, 1.6];
        // nor on one where a stone would stand in a stopping place or a roadworks site: all of the wall or none
        const works = new Scenery(ground, flat);
        works.stoneShut = [{ s0: 200, s1: 205 }];
        expect(works.wallRuns(0, points.length - 2, side)).toEqual([]);
        // and the drop rule leaves the wall to its own row
        expect(new Scenery(ground, flat).stoneStretches(0, Math.floor(route.length / Scenery.STONE_GAP_M), side)).toEqual([]);
    });

    test('tufts stand on the open strip beside the ride, clear of the road, each on the ground at its own place', () => {
        const scenery = new Scenery(ground, data);
        const sites = scenery.tuftSites(tile);
        expect(sites.length).toBeGreaterThan(50);
        expect(scenery.tuftSites(tile)).toEqual(sites);
        for (const t of sites) {
            const past = scenery.roads.clearance(t.x, t.z);
            expect(past).toBeGreaterThanOrEqual(Scenery.CLEAR_M.tuft + Scenery.tuftRadius(t.green, t.size) * Math.SQRT2 - 1e-9);
            expect(past).toBeLessThanOrEqual(Scenery.TUFT_REACH_M + 1e-9);
            expect(t.y).toBeCloseTo(ground.groundY(t.x, t.z, null) - Scenery.TUFT_SINK_M, 9);
        }
        const group = scenery.buildTile(tile, null, [], { x: 100, z: 100 });
        const mesh = group.children.find(m => m.name === 'tufts');
        // One mesh and no instances, 3 triangles a tussock and 4 a green clump, nearest the bike first within the caps
        expect(mesh.isInstancedMesh).toBeFalsy();
        expect(scenery.tuftCount).toBe(Math.min(sites.length, Scenery.TUFTS_PER_TILE, Scenery.TUFT_CAP));
        expect(mesh.geometry.attributes.position.count).toBe(mesh.userData.tufts.length * 9 + mesh.userData.tufts.filter(s => s.green).length * 3);
        expect(mesh.userData.tufts).toHaveLength(scenery.tuftCount);
        expect(Scenery.TUFT_CAP * 4).toBeLessThanOrEqual(140000 - Scenery.TRIANGLE_CAP);
        scenery.disposeTile('0,0');
        expect(scenery.tuftCount).toBe(0);
    });

    test('a landmark is its model beside the road, front to the road; a placeholder box or a missing model is never drawn', () => {
        const scenery = new Scenery(ground, data);
        const part = { geometry: new THREE.BoxGeometry(43, 15, 13), material: new THREE.MeshBasicMaterial() };
        scenery.landmarkModels = new Map([['assets/village/hospiz.glb', { meshes: new Map([['landmark_hospiz', [part]], ['landmark_hospiz:left', []]]) }]]);
        const group = scenery.landmarks([
            { name: 'Hospiz', asset: 'assets/village/hospiz.glb', size: [43, 15, 13], s: 100 },
            { name: 'Placeholder', asset: 'box', size: [28, 10, 14], s: 150 },
            { name: 'Bridge', asset: 'assets/bridge/stone.glb', size: [60, 20, 10], s: 200 }
        ], route);
        expect(group.children.map(c => c.name)).toEqual(['landmark:Hospiz', 'landmark:Hospiz:footing']);
        const node = group.children[0];
        expect(node.children).toHaveLength(1);
        expect(node.children[0].geometry).toBe(part.geometry);
        // The road is along x = 0 here: the plan box, its 13 m depth square to the road, clears the road's half width,
        // the verge and the landmark margin, and stands no further out than it must
        const clear = 13 / 2 + 5 + RoadSurface.VERGE_M + Scenery.CLEAR_M.landmark;
        expect(Math.abs(node.position.x)).toBeGreaterThanOrEqual(clear - 1e-6);
        expect(Math.abs(node.position.x)).toBeLessThanOrEqual(clear + 2 + 1e-6);
        // Its floor on the land (flat at 1000), its footing from under it
        expect(node.position.y).toBeCloseTo(1000 - Scenery.FLOOR_SINK_M, 6);
        expect(group.children[1].userData.footings[0].bottom).toBeCloseTo(1000 - Scenery.FOOTING_UNDER_M, 6);
        expect(group.children[1].material).toBe(RoadMesh.stoneMaterial());
        // The model's front (-z) looks at the road
        const front = new THREE.Vector3(0, 0, -1).applyEuler(node.rotation);
        expect(Math.sign(front.x)).toBe(-Math.sign(node.position.x));
        expect(Math.abs(front.x)).toBeCloseTo(1, 6);
    });
});

describe('the dry-stone walls', () => {
    // A real dry-stone wall: blocks 0.3 to 0.6 m long in courses of uneven height. Longer, even blocks read as brick
    test('the stone pattern draws blocks 0.3 to 0.6 m long in courses of uneven height, as the shader does', () => {
        const blocks = new Map();
        for (let u = 0; u < 12; u += 0.02) {
            for (let y = 0; y < 3; y += 0.02) {
                const c = LandShade.stoneCell(u, y);
                const key = `${c.row}:${c.col}`;
                if (!blocks.has(key)) blocks.set(key, c);
            }
        }
        const list = [...blocks.values()];
        const mean = list.reduce((p, c) => p + c.lengthM, 0) / list.length;
        const courses = [...new Set(list.map(c => c.row))].map(row => list.find(c => c.row === row).courseM);
        expect(mean).toBeGreaterThanOrEqual(0.3);
        expect(mean).toBeLessThanOrEqual(0.6);
        expect(Math.min(...courses)).toBeGreaterThanOrEqual(0.15);
        expect(Math.max(...courses)).toBeLessThanOrEqual(0.4);
        // Uneven: the courses differ by 5 cm or more
        expect(Math.max(...courses) - Math.min(...courses)).toBeGreaterThan(0.05);
        // Blocks a square metre of face (36 m^2 here): dry stone, not ashlar or brick
        expect(list.length / 36).toBeGreaterThan(4);
        // The shader is built from the same numbers
        const material = RoadMesh.stoneMaterial();
        const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
        material.onBeforeCompile(shader);
        const S = LandShade.STONE;
        for (const v of [S.bandM, S.lengthMin, S.lengthMax - S.lengthMin, S.splitMin]) expect(shader.fragmentShader).toContain(`${v}`);
    });
});

describe('FarLand', () => {
    const level = (x0, z0, n, cell, h = 1500) => ({ x0, z0, nx: n, nz: n, cell, heights: new Int16Array(n * n).fill(h), shares: new Uint8Array(n * n * 4) });
    const inner = { x0: 0, z0: 0, nx: 11, nz: 11, cell: 100, data: new Int16Array(121).fill(1500) };

    test('a level leaves out the cells inside the level within it and sinks its vertices there, so no seam opens', () => {
        // A 250 m level over -1000..1500: the cells wholly inside 0..1000 are left out
        const [built] = FarLand.build([level(-1000, -1000, 11, 250)], inner);
        const kept = 10 * 10 - 4 * 4;
        expect(built.triangles).toBe(kept * 2);
        const y = built.mesh.geometry.attributes.position.array;
        // Vertex (6, 6) is (500, 500): inside the inner box, sunk; vertex (0, 0) is outside, at its height
        expect(y[(6 * 11 + 6) * 3 + 1]).toBe(1500 - FarLand.SINK_M[0]);
        expect(y[1]).toBe(1500);
    });

    test('the second level is cut by the first, not by far.bin', () => {
        const levels = [level(-1000, -1000, 11, 250), level(-10000, -10000, 11, 2000)];
        const [, outer] = FarLand.build(levels, inner);
        // The first level spans -1000..1500: only the 2 km cells wholly inside it would go, and none is
        expect(outer.triangles).toBe(10 * 10 * 2);
    });

    test('far meshes drop with the curvature of the Earth in their shader, the tiles do not', () => {
        expect(LandShade.DROP_PER_M2 * 40000 * 40000).toBeCloseTo(109, 0);
        expect(Horizon.material().customProgramCacheKey()).toBe('land-110');
        expect(TerrainMesh.material().customProgramCacheKey()).toBe('land-010');
        // Retaining walls: the land's lighting and the stone courses, flat (no curvature, no ground noise)
        expect(RoadMesh.stoneMaterial().customProgramCacheKey()).toBe('land-001');
    });
});

describe('RoadSurface', () => {
    const along = (n, over = {}) => Array.from({ length: n }, (_, i) => ({ s: i * 4, heading: 0, bits: 0, ...over }));

    test('every line is white, 15 cm wide, with the Swiss dash rhythms', () => {
        const m = RoadSurface.MARKINGS;
        // White paint: no channel far below the others (a yellow centre line is not a Swiss marking)
        expect(Math.min(...m.paint)).toBeGreaterThan(0.8);
        expect(Math.max(...m.paint) - Math.min(...m.paint)).toBeLessThan(0.05);
        expect(m.lineWidthM).toBe(0.15);
        expect([m.broken.dashM, m.broken.gapM]).toEqual([3, 6]);
        expect([m.warning.dashM, m.warning.gapM, m.warning.lengthM]).toEqual([4, 2, 60]);
        expect([m.mouth.dashM, m.mouth.gapM]).toEqual([0.5, 0.5]);
        expect(m.edge.minWidthM).toBe(5.2);
        expect(m.centre.minWidthM).toBe(6);
    });

    test('a narrow road has no lines, a 6 m road edge lines and a broken centre line, a cobbled road none', () => {
        const C = RoadSurface.CENTRE, E = RoadSurface.EDGE;
        const narrow = RoadSurface.styles(along(20), '4m Strasse');
        expect(narrow.every(r => r.centre === C.none && r.left === E.none && r.right === E.none)).toBe(true);
        const main = RoadSurface.styles(along(20), '6m Strasse');
        expect(main.every(r => r.centre === C.broken && r.left === E.solid && r.right === E.solid)).toBe(true);
        const setts = RoadSurface.styles(along(20, { bits: 8 }), '8m Strasse');
        expect(setts.every(r => r.centre === C.none && r.left === E.none)).toBe(true);
        // Unknown class: a narrow road
        expect(RoadSurface.styles(along(5)).every(r => r.centre === C.none)).toBe(true);
    });

    test('a tight bend takes a continuous centre line with 60 m of warning line before and after it', () => {
        const C = RoadSurface.CENTRE;
        // 400 m straight, a bend of 40 m radius through 90 degrees, 400 m straight; rows 4 m apart
        const rows = [];
        let heading = 0;
        for (let s = 0; s <= 900; s += 4) {
            if (s > 400 && s <= 400 + 40 * Math.PI / 2) heading += 4 / 40;
            rows.push({ s, heading, bits: 0 });
        }
        const styles = RoadSurface.styles(rows, '8m Strasse');
        const kinds = styles.map(r => r.centre);
        const first = kinds.indexOf(C.solid), last = kinds.lastIndexOf(C.solid);
        expect(first).toBeGreaterThan(0);
        expect(rows[first].s).toBeLessThan(410);
        expect(rows[last].s).toBeGreaterThan(450);
        const warnBefore = rows.filter((r, i) => kinds[i] === C.warning && r.s < rows[first].s);
        expect(rows[first].s - warnBefore[0].s).toBeGreaterThanOrEqual(56);
        expect(rows.filter((r, i) => kinds[i] === C.warning && r.s > rows[last].s).length).toBeGreaterThan(10);
        // Kinds change one step at a time (they are interpolated between rows)
        for (let i = 1; i < kinds.length; i++) expect(Math.abs(kinds[i] - kinds[i - 1])).toBeLessThanOrEqual(1);
        expect(kinds[0]).toBe(C.broken);
    });

    test('the asphalt and sett textures are made with normal maps, mipmaps and anisotropic filtering', () => {
        const t = RoadSurface.textures();
        for (const surface of [t.asphalt, t.setts]) {
            for (const texture of [surface.map, surface.normal]) {
                expect(texture.isDataTexture).toBe(true);
                expect(texture.image.width).toBe(RoadSurface.SIZE);
                expect(texture.image.data.length).toBe(RoadSurface.SIZE * RoadSurface.SIZE * 4);
                expect(texture.generateMipmaps).toBe(true);
                expect(texture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
                expect(texture.anisotropy).toBeGreaterThanOrEqual(8);
                expect(texture.wrapS).toBe(THREE.RepeatWrapping);
            }
            expect(surface.map.encoding).toBe(THREE.sRGBEncoding);
            expect(surface.normal.encoding).not.toBe(THREE.sRGBEncoding);
            // A normal map points out of the surface on average, and is not flat
            const d = surface.normal.image.data;
            let z = 0, spread = 0;
            for (let i = 0; i < d.length; i += 4) { z += d[i + 2]; spread += Math.abs(d[i] - 128); }
            expect(z / (d.length / 4)).toBeGreaterThan(200);
            expect(spread / (d.length / 4)).toBeGreaterThan(3);
        }
        // The setts are paler than the asphalt; the asphalt a mid-dark grey
        expect(t.setts.mean[1]).toBeGreaterThan(t.asphalt.mean[1]);
        expect(t.asphalt.mean[1]).toBeGreaterThan(0.25);
        expect(t.asphalt.mean[1]).toBeLessThan(0.4);
        expect(t.bytes).toBeLessThan(6 * 1024 * 1024);
    });

    test('both textures tile with no seam, and a sett cut by the tile\'s edge is toned as one sett', () => {
        const t = RoadSurface.textures();
        const n = RoadSurface.SIZE;
        for (const surface of [t.asphalt, t.setts]) {
            const d = surface.map.image.data;
            const at = (x, y) => (((y + n) % n) * n + ((x + n) % n)) * 4;
            const step = (dx, dy, x0, y0) => {
                let sum = 0, count = 0;
                for (let k = 0; k < n; k++) {
                    const x = dx ? x0 : k, y = dy ? y0 : k;
                    for (let c = 0; c < 3; c++) sum += Math.abs(d[at(x + dx, y + dy) + c] - d[at(x, y) + c]);
                    count++;
                }
                return sum / count;
            };
            // Across the wrap (last column to the first, last row to the first) the texture changes no more than
            // between any two neighbouring columns or rows inside it; the box-filtered mips then tile too
            let inside = 0;
            for (let x = 1; x < n - 2; x += 37) inside = Math.max(inside, step(1, 0, x, 0), step(0, 1, 0, x));
            expect(step(1, 0, n - 1, 0)).toBeLessThanOrEqual(inside * 1.2);
            expect(step(0, 1, 0, n - 1)).toBeLessThanOrEqual(inside * 1.2);
        }
        // A sett on the tile's last row continues on the next copy's first: it keeps its copy, so the shader tones
        // the two halves alike (the pixel's own copy would split it)
        const s = RoadSurface.setts(), px = RoadSurface.SETTS_M / n, S = RoadSurface.SETTS_M;
        let split = 0;
        for (let x = 0; x < n; x++) {
            const last = s.normal[((n - 1) * n + x) * 4 + 3], first = s.normal[x * 4 + 3];
            if (last === 0 || last !== first) continue;
            const lat = x * px;
            expect(RoadSurface.settCopy((n - 1) * px, lat)).toBe(RoadSurface.settCopy(S, lat));
            if (Math.floor(((n - 1) * px) / S) !== Math.floor(S / S)) split++;
        }
        expect(split).toBeGreaterThan(n / 4);
    });

    test('fine detail fades by the patch of texture a pixel covers, both ways, allowing for the anisotropic filter', () => {
        // Looking straight down: 1 cm a pixel each way
        expect(RoadSurface.footprint([0.01, 0], [0, 0.01])).toBeCloseTo(0.01, 6);
        // Edge-on: 1 cm across and 1.2 m along a pixel is no sharper than the long axis over the filter's taps
        expect(RoadSurface.footprint([0.01, 0], [0, 1.2])).toBeCloseTo(1.2 / RoadSurface.FOOTPRINT_TAPS, 6);
        expect(RoadSurface.footprint([0.01, 0], [0, 1.2])).toBeGreaterThan(0.06);
        const material = RoadSurface.nearMaterial();
        const lib = THREE.ShaderLib.physical;
        const shader = { uniforms: THREE.UniformsUtils.clone(lib.uniforms), vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader };
        material.onBeforeCompile(shader, null);
        // The fades read the footprint, not the smaller of the two widths (which stays small edge-on)
        expect(shader.fragmentShader).toContain('roadFineS = roadFootprint(gxS, gyS)');
        expect(shader.fragmentShader).toContain('roadFineA = roadFootprint(gxA, gyA)');
        expect(shader.fragmentShader).not.toMatch(/min\(roadFwLat, roadFwAlong\)/);
        expect(shader.uniforms.roadSettRough.value).toBeGreaterThan(0.5);
        expect(shader.uniforms.roadSettRough.value).toBeLessThan(1);
    });

    test('the near material reads both surfaces and compiles its shader chunks', () => {
        const material = RoadSurface.nearMaterial();
        expect(material.map).toBe(RoadSurface.textures().asphalt.map);
        expect(material.normalMap).toBe(RoadSurface.textures().asphalt.normal);
        expect(material.alphaToCoverage).toBe(true);
        const lib = THREE.ShaderLib.physical;
        const shader = { uniforms: THREE.UniformsUtils.clone(lib.uniforms), vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader };
        material.onBeforeCompile(shader, null);
        expect(shader.uniforms.roadSettMap.value).toBe(RoadSurface.textures().setts.map);
        expect(shader.fragmentShader).toContain('textureGrad(roadSettMap');
        expect(shader.fragmentShader).not.toContain('#include <map_fragment>');
        expect(shader.vertexShader).toContain('attribute vec4 road;');
    });
});

describe('a coping round a bend (RoadMesh.copingDepths)', () => {
    // A face line and each point's way in: the inner edge at point i is face[i] + inward[i] * depth[i]
    const inner = (face, inward, depth) => face.map((p, i) => [p[0] + inward[i][0] * depth[i], p[2] + inward[i][1] * depth[i]]);
    const runsOn = (face, ins) => face.slice(1).every((p, i) => (ins[i + 1][0] - ins[i][0]) * (p[0] - face[i][0]) + (ins[i + 1][1] - ins[i][1]) * (p[2] - face[i][2]) > 0);

    test('a straight wall\'s coping is COPING_W_M deep at every row', () => {
        const face = [0, 1, 2, 3].map(i => [i * 3, 0, 0]), inward = face.map(() => [0, 1]);
        for (const d of RoadMesh.copingDepths(face, inward)) expect(d).toBeCloseTo(RoadMesh.COPING_W_M, 6);
    });

    test('at a corner the two pieces meet on one mitre, COPING_W_M square to each', () => {
        // A right angle, the road inside it: the mitre halves the turn
        const face = [[-3, 0, 0], [0, 0, 0], [0, 0, 3]], h = Math.SQRT1_2;
        const depths = RoadMesh.copingDepths(face, [[0, 1], [-h, h], [-1, 0]]);
        expect(depths[1]).toBeCloseTo(RoadMesh.COPING_W_M * Math.SQRT2, 6);
        expect(depths[0]).toBeCloseTo(RoadMesh.COPING_W_M, 6);
        expect(depths[2]).toBeCloseTo(RoadMesh.COPING_W_M, 6);
    });

    test('round a bend tighter than the coping is deep, the coping narrows and never folds, to no less than its floor', () => {
        // Half a circle 0.6 m across, the road inside it: laid COPING_W_M deep, each piece's inner edge ran back
        const face = [], inward = [];
        for (let i = 0; i <= 8; i++) {
            const a = Math.PI * i / 8;
            face.push([0.6 * Math.cos(a), 0, 0.6 * Math.sin(a)]);
            inward.push([-Math.cos(a), -Math.sin(a)]);
        }
        const full = face.map(() => RoadMesh.COPING_W_M);
        expect(runsOn(face, inner(face, inward, full))).toBe(false);
        const depths = RoadMesh.copingDepths(face, inward);
        expect(runsOn(face, inner(face, inward, depths))).toBe(true);
        for (const d of depths) expect(d).toBeGreaterThanOrEqual(RoadMesh.PARAPET_W_M - 1e-9);
        expect(Math.min(...depths)).toBeLessThan(RoadMesh.COPING_W_M);
        // (where a marker stone may stand, never narrower than the stone and its margins)
        for (const d of RoadMesh.copingDepths(face, inward, () => RoadMesh.COPING_W_M)) expect(d).toBeGreaterThanOrEqual(RoadMesh.COPING_W_M - 1e-9);
    });

    test('the piece that joins two roads\' walls keeps its coping on its own side, however the runs face at its ends', () => {
        // One run faces the piece's own way and the other into the road: laid along each, the coping crossed its face
        const out = { positions: [], shades: [] }, face = [];
        RoadMesh.wallJoin(out, face, { a: [0, 10, 0], b: [4, 10, 0], footA: 4, footB: 4, outA: [0.6, 0.8], outB: [0, -1], o: [0, -1], parapet: false });
        const p = out.positions, tops = [];
        for (let i = 0; i + 17 < p.length; i += 18) {
            const q = [0, 1, 2, 5].map(k => [p[i + k * 3], p[i + k * 3 + 1], p[i + k * 3 + 2]]);
            if (q.every(c => Math.abs(c[1] - q[0][1]) < 1e-6)) tops.push(q);
        }
        expect(tops).toHaveLength(1);
        const [a, b, c, d] = tops[0];
        expect((c[0] - d[0]) * (b[0] - a[0]) + (c[2] - d[2]) * (b[2] - a[2])).toBeGreaterThan(0);
        expect(Math.min(c[2], d[2])).toBeGreaterThan(0);
    });
});
