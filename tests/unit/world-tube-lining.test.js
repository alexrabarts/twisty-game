/**
 * @jest-environment node
 */
// The inside of every tunnel and gallery (TubeLining, .agent/system/world.md "The inside of a tube"), read from the
// meshes as drawn, on the Gotthard leg (the ride's tubes, at the places that put each in the near window) and on the
// Tremola (its side roads' tubes):
//   lining     every segment of a tube has its roof, a wall on each side (concrete, rock, a gallery's pillars or
//              parapet) and, on the ride, a walkway each side out to the wall; the normals face into the tube
//   bays       the pour seams are 10 to 12 m apart
//   rock       a rock face stands in from the wall's line by no more than rockInM, never out past it
//   lamps      at LOD0 a lamp on the crown every lampM of the ride's tubes (and between them near a portal), a conduit and
//              a cable tray along the tube, and a pair of jet fans every fan.everyM in a tube of fan.minRunM or more
//   clear      no fitting stands in the carriageway's headroom or the camera's room: over the carriageway and its verge a
//              fitting is within 0.75 m of the roof (the camera keeps 1 m under it, Game.tunnelRoofY), and every fitting
//              is inside the tube's box
//   light      the road's share of the tube's light (roadTube) is none outside a tube and the full share deep inside
import { describe, test, expect, beforeAll } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';

const game = loadGame(undefined, []);
const { THREE, WorldEnvironment, TubeLining, RoadMesh, WorldRoute } = game;
const T = TubeLining.TUBE, K = TubeLining.KIND;

// Every triangle of the tube meshes drawn now, with its attributes at each corner
function tubeTriangles(env) {
    const out = [];
    const take = (mesh, road) => {
        const g = mesh.geometry, pos = g.attributes.position.array, tube = g.attributes.tube.array, aux = g.attributes.tubeAux.array, nor = g.attributes.normal.array;
        for (let v = 0; v + 2 < pos.length / 3; v += 3) {
            const corners = [0, 1, 2].map(j => ({ p: [pos[(v + j) * 3], pos[(v + j) * 3 + 1], pos[(v + j) * 3 + 2]], s: tube[(v + j) * 4], h: tube[(v + j) * 4 + 1], kind: Math.round(tube[(v + j) * 4 + 2]), share: tube[(v + j) * 4 + 3], lat: aux[(v + j) * 4 + 2], inM: aux[(v + j) * 4 + 3], n: [nor[(v + j) * 3], nor[(v + j) * 3 + 1], nor[(v + j) * 3 + 2]] }));
            out.push({ mesh: mesh.name, road, key: mesh.geometry.uuid, corners });
        }
    };
    for (const group of env.roadMeshes.values()) group.traverse(o => { if (o.isMesh && /^tube-/.test(o.name)) take(o, 'ride'); });
    for (const group of env.sideMeshes.values()) group.traverse(o => { if (o.isMesh && /^tube-/.test(o.name)) take(o, 'side'); });
    return out;
}

describe('the Gotthard leg: every ride tube is lined, lit and fitted, and its fittings keep clear', () => {
    let env, runs;
    const found = { segments: 0, unlined: [], inward: [], rockOut: [], lamps: [], missingLamps: [], fans: new Map(), trays: 0, conduits: 0, inCarriageway: [], outOfBox: [], shareOut: [], shareIn: [], sides: 0, sideUnlined: [] };
    beforeAll(async () => {
        const { fetchFn } = diskFetch();
        env = await WorldEnvironment.load(new THREE.Scene(), { id: 'gotthard-north', fetchFn, models: null, digest: async () => '0' });
        env.scenery.buildTile = () => null;
        runs = env.tubeInfo().runs;
        const route = env.route, points = route.points, sArray = route.sArray;
        const wholes = [...new Map(runs.map(r => [r.tube[0], r.tube])).values()];
        const seen = new Set();
        const linedBy = new Map(), lamps = new Set(), near = new Set(), lampNear = new Set();
        for (const [s0, s1] of wholes) {
            for (let s = s0 + 60; s < s1 + 200; s += 300) {
                const at = Math.min(s, s1 - 10);
                const p = route.sample(at, {});
                env.update(p, at, null, Infinity);
                await env.streamer.settle(p, at);
                env.group.updateMatrixWorld(true);
                const tris = tubeTriangles(env).filter(t => !seen.has(t.key));
                for (const t of tris) seen.add(t.key);
                // (each mesh once: its triangles by kind, near the bike's 400 m, where the sections are at LOD0)
                const ride = tris.filter(t => t.road === 'ride');
                for (const t of ride) if (t.mesh === 'tube-fittings' && t.corners.every(c => c.kind === K.lens)) lamps.add(Math.round(t.corners.reduce((m, c) => m + c.s, 0) / 3));
                for (const t of ride) {
                    for (const c of t.corners) {
                        // A fitting: in the box, and over the carriageway and its verge within 0.75 m of the roof
                        if (t.mesh === 'tube-fittings') {
                            const loc = route.project(c.p[0], c.p[2], null, {});
                            const half = points[loc.index].width / 2;
                            const roofY = loc.y + WorldRoute.ROOF_M;
                            if (Math.abs(loc.lateral) <= half + 0.7 && c.p[1] < roofY - 0.75 && c.kind !== K.door && c.kind !== K.sign) found.inCarriageway.push({ s: Math.round(loc.s), lat: +loc.lateral.toFixed(2), under: +(roofY - c.p[1]).toFixed(2), kind: c.kind });
                            if (Math.abs(loc.lateral) > half + RoadMesh.TUBE_WALL_M + 0.01 || c.p[1] > roofY + 0.01 || c.p[1] < loc.y - 0.01) found.outOfBox.push({ s: Math.round(loc.s), lat: +loc.lateral.toFixed(2), y: +(c.p[1] - loc.y).toFixed(2), kind: c.kind });
                        }
                        // A rock face: in from the wall's line by at most rockInM
                        if (c.kind === K.rock && c.h > T.plinthM) {
                            const loc = route.project(c.p[0], c.p[2], null, {});
                            const wall = points[loc.index].width / 2 + RoadMesh.TUBE_WALL_M;
                            const inM = wall - Math.abs(loc.lateral);
                            if (inM < -0.05 || inM > T.rockInM + 0.05) found.rockOut.push({ s: Math.round(loc.s), inM: +inM.toFixed(2) });
                        }
                    }
                    // The lining's normals face into the tube: a wall's toward the centre line, the roof's down
                    if (t.mesh === 'tube-lining') {
                        const c = t.corners[0];
                        if (c.kind === K.roof && !(c.n[1] < -0.9)) found.inward.push({ kind: 'roof', s: Math.round(c.s) });
                        if ((c.kind === K.concrete || c.kind === K.rock || c.kind === K.shotcrete) && Math.abs(c.n[1]) < 0.1 && Math.abs(c.lat) > 1) {
                            const mid = [0, 1, 2].map(j => (t.corners[0].p[j] + t.corners[1].p[j] + t.corners[2].p[j]) / 3);
                            const loc = route.project(mid[0], mid[2], null, {}), q = route.sample(loc.s, {});
                            const toCentre = [q.x - mid[0], q.z - mid[2]];
                            if (toCentre[0] * c.n[0] + toCentre[1] * c.n[2] < 0) found.inward.push({ kind: c.kind, s: Math.round(loc.s) });
                        }
                    }
                    if (t.mesh === 'tube-fittings' && t.corners.every(c => c.kind === K.fan)) found.fans.set(Math.round(t.corners[0].s / 10), (found.fans.get(Math.round(t.corners[0].s / 10)) || 0) + 1);
                    if (t.mesh === 'tube-fittings' && t.corners.every(c => c.kind === K.metal && Math.abs(c.lat) > 2) && Math.abs(t.corners[0].h - t.corners[1].h) < 0.2) found.trays++;
                    if (t.mesh === 'tube-fittings' && t.corners.every(c => c.kind === K.metal && Math.abs(c.lat - T.conduit.lat - T.conduit.wide / 2) < T.conduit.wide)) found.conduits++;
                }
                // Each segment of the ride's tube within the window is lined: its roof, both walls and both walkways
                for (const t of tris.filter(x => x.road === 'ride' && x.mesh === 'tube-lining')) {
                    const c = t.corners[0];
                    const seg = Math.floor((t.corners.reduce((m, q) => m + q.s, 0) / 3) / 4);
                    const kinds = linedBy.get(seg) || new Set();
                    const side = c.lat < 0 ? 'l' : 'r';
                    if (c.kind === K.roof) kinds.add('roof');
                    else if (c.kind === K.walk) kinds.add(`walk${side}`);
                    else kinds.add(`wall${side}`);
                    linedBy.set(seg, kinds);
                }
                for (let i = 0; i + 1 < points.length; i++) {
                    if (!((points[i].bits & 5) && (points[i + 1].bits & 5))) continue;
                    if (Math.abs(sArray[i] - at) <= 380) near.add(i);
                    if (Math.abs(sArray[i] - at) < 150) lampNear.add(i);
                }
                // The road's share of the tube's light, as its near ribbon carries it
                for (const group of env.roadMeshes.values()) group.traverse(o => {
                    if (!o.isMesh || !o.geometry.attributes.roadTube) return;
                    const a = o.geometry.attributes.roadTube.array;
                    for (let v = 0; v < a.length / 2; v++) {
                        const share = a[v * 2], inM = a[v * 2 + 1];
                        if (inM < 0 && share > 0) found.shareOut.push(inM);
                        if (inM > T.dayM + 1 && share < T.galleryShare - 0.01) found.shareIn.push({ inM, share });
                    }
                });
            }
        }
        for (const i of near) {
            found.segments++;
            const kinds = new Set([...(linedBy.get(Math.floor((sArray[i] + 0.5) / 4)) || []), ...(linedBy.get(Math.floor((sArray[i] + 2) / 4)) || []), ...(linedBy.get(Math.floor((sArray[i + 1] - 0.5) / 4)) || [])]);
            const missing = ['roof', 'walll', 'wallr', 'walkl', 'walkr'].filter(k => !kinds.has(k));
            if (missing.length) found.unlined.push({ s: Math.round(sArray[i]), missing });
        }
        // A lamp every lampM (the lamp whose middle is in a segment at LOD0, within 150 m of where the bike was put down)
        for (const i of lampNear) {
            for (let ls = Math.ceil(sArray[i] / T.lampM) * T.lampM; ls < sArray[i + 1]; ls += T.lampM) {
                found.lamps.push(ls);
                if (![...lamps].some(x => Math.abs(x - ls) <= 1)) found.missingLamps.push(Math.round(ls));
            }
        }
    }, 3600000);

    test('every segment of every tube is lined: roof, walls and walkways, normals into the tube', () => {
        console.log(`tube lining: ${found.segments} segments read, ${found.unlined.length} unlined, ${found.inward.length} faces turned out`);
        expect(found.segments).toBeGreaterThan(400);
        expect(found.unlined.slice(0, 10)).toEqual([]);
        expect(found.inward.slice(0, 10)).toEqual([]);
    });

    test('the pour bays are 10 to 12 m long', () => {
        for (const run of runs) {
            const seams = TubeLining.seams(run.s0, run.s1);
            for (let i = 1; i < seams.length; i++) {
                expect(seams[i] - seams[i - 1]).toBeGreaterThanOrEqual(T.bayM - T.bayJitterM - 1e-6);
                expect(seams[i] - seams[i - 1]).toBeLessThanOrEqual(T.bayM + T.bayJitterM + 1e-6);
            }
        }
        expect(T.bayM - T.bayJitterM).toBeGreaterThanOrEqual(10);
        expect(T.bayM + T.bayJitterM).toBeLessThanOrEqual(12);
    });

    test('a rock face stands in from the wall by no more than rockInM', () => {
        expect(found.rockOut.slice(0, 10)).toEqual([]);
    });

    test('a lamp every lampM on the crown, a conduit and a tray along it, jet fans in the long tubes', () => {
        console.log(`tube fittings: ${found.lamps.length} lamps looked for, ${found.missingLamps.length} missing; ${found.trays} tray and ${found.conduits} conduit triangles; fan triangles by 10 m: ${JSON.stringify([...found.fans])}`);
        expect(found.lamps.length).toBeGreaterThan(60);
        expect(found.missingLamps).toEqual([]);
        expect(found.trays).toBeGreaterThan(100);
        expect(found.conduits).toBeGreaterThan(100);
        // (the tubes of fan.minRunM or more: a pair every fan.everyM from fan.firstM in)
        const long = [...new Map(runs.map(r => [r.tube[0], r.tube])).values()].filter(([s0, s1]) => s1 - s0 >= T.fan.minRunM);
        expect(long.length).toBeGreaterThan(0);
        // (where the tube is a tunnel there; a gallery has none)
        const tunnelAt = s => runs.some(r => !r.gallery && s >= r.s0 && s < r.s1);
        let pairs = 0;
        for (const [s0, s1] of long) for (let s = s0 + T.fan.firstM; s <= s1 - T.fan.firstM; s += T.fan.everyM) {
            if (tunnelAt(s)) { expect(found.fans.get(Math.round(s / 10)) || 0).toBeGreaterThanOrEqual(2 * T.fan.sides); pairs++; } else expect(found.fans.get(Math.round(s / 10)) || 0).toBe(0);
        }
        expect(pairs).toBeGreaterThan(0);
    });

    test('no fitting stands in the carriageway\'s room or the camera\'s, nor out of the tube', () => {
        expect(found.inCarriageway.slice(0, 10)).toEqual([]);
        expect(found.outOfBox.slice(0, 10)).toEqual([]);
    });

    test('the road takes none of the tube\'s light outside a tube and all of it deep inside', () => {
        expect(found.shareOut.slice(0, 10)).toEqual([]);
        expect(found.shareIn.slice(0, 10)).toEqual([]);
    });
});

describe('the Tremola: every side road\'s tube drawn is lined', () => {
    test('a side tube has its roof and its two walls on every segment', async () => {
        const { fetchFn } = diskFetch();
        const env = await WorldEnvironment.load(new THREE.Scene(), { id: 'tremola', fetchFn, models: null, digest: async () => '0' });
        env.scenery.buildTile = () => null;
        let segments = 0;
        const unlined = [];
        const seen = new Set();
        for (let s = env.startS + 1; s < env.endS; s += 800) {
            const p = env.route.sample(s, {});
            env.update(p, s, null, Infinity);
            await env.streamer.settle(p, s);
            for (const group of env.sideMeshes.values()) {
                const tris = tubeTriangles({ roadMeshes: new Map(), sideMeshes: new Map([[0, group]]) });
                group.traverse(o => {
                    const d = o.userData;
                    if (!d || !Array.isArray(d.sides) || d.edge === undefined || !d.sides.some(side => side.bits & 5)) return;
                    d.sides.forEach((a, k) => {
                        const b = d.sides[k + 1];
                        if (!b || !(a.bits & b.bits & 5)) return;
                        const key = `${a.l[0].toFixed(2)},${a.l[2].toFixed(2)}`;
                        if (seen.has(key)) return;
                        seen.add(key);
                        segments++;
                        // (a triangle of the lining whose corners lie on this segment's walls or roof)
                        const mid = [(a.l[0] + a.r[0] + b.l[0] + b.r[0]) / 4, (a.l[2] + a.r[2] + b.l[2] + b.r[2]) / 4];
                        const reach = Math.hypot(b.l[0] - a.r[0], b.l[2] - a.r[2]) / 2 + 0.5;
                        const kinds = new Set(tris.filter(t => t.mesh === 'tube-lining' && t.corners.every(c => Math.hypot(c.p[0] - mid[0], c.p[2] - mid[1]) <= reach)).map(t => (t.corners[0].kind === K.roof ? 'roof' : t.corners[0].lat < 0 ? 'walll' : 'wallr')));
                        const missing = ['roof', 'walll', 'wallr'].filter(k => !kinds.has(k));
                        if (missing.length) unlined.push({ edge: d.edge, x: Math.round(a.l[0]), z: Math.round(a.l[2]), missing });
                    });
                });
            }
        }
        console.log(`side tubes: ${segments} segments, ${unlined.length} unlined`);
        expect(segments).toBeGreaterThan(0);
        expect(unlined.slice(0, 10)).toEqual([]);
    }, 3600000);
});
