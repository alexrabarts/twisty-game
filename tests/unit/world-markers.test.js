// The checkpoint markers: every checkpoint of the Tremola stage is a Swiss roadworks site (js/world/roadworks.js). At
// each end, on each verge, three red and white boards side by side on one foot frame, the roadworks triangle on the
// closed lane's side; a single lane between them, closed on a side drawn from the station id, with Leitbaken along the
// centre line and a taper at each end; a mobile traffic light at each entry on the open lane's verge; and nothing at
// all in the open lane. Only the start and the finish keep the gate arch. The browser probe world-clearance
// (tools/terrain-check.mjs) casts on the drawn works too.
import { describe, test, expect, beforeAll } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';
import { roadworksWindow } from '../helpers/world-fairness.js';

const game = loadGame();
const { THREE, WorldEnvironment, RoadMesh, Roadworks, Route } = game;

const load = async () => {
    const { fetchFn } = diskFetch();
    const env = await WorldEnvironment.load(new THREE.Scene(), { id: 'tremola', fetchFn, models: null, digest: async () => '0' });
    await env.data.ensureChunks(env.data.manifest.chunks.map((_, k) => k));
    return env;
};

describe('the checkpoint roadworks sites', () => {
    let env, works, geo;
    beforeAll(async () => {
        env = await load();
        works = env.roadworks;
        geo = Roadworks.geometries();
    }, 300000);

    test('every checkpoint is a site; the old pair of boards is gone', () => {
        expect(works).toBeTruthy();
        expect(works.sites.map(site => site.id)).toEqual(env.checkpoints.map((_, i) => env.stationGates[i + 1].id));
        expect(env.markerMesh).toBeUndefined();
        expect(game.Scenery.placeMarkers).toBeUndefined();
        expect(env.group.getObjectByName('world-markers')).toBeUndefined();
    });

    test('an end gate is three square boards close side by side on one foot frame, each about 2.45 m tall in red and white bands', () => {
        const g = geo.gate;
        const box = g.boundingBox;
        // (a fifth to a quarter taller than the 2 m boards they were)
        expect(box.max.y - box.min.y).toBeGreaterThan(2.0 * 1.2);
        expect(box.max.y - box.min.y).toBeLessThan(2.0 * 1.25);
        const pos = g.attributes.position, color = g.attributes.color;
        // The boards' red faces: three columns across, each about 0.19 m wide, red at the foot and the top
        const columns = new Map();
        for (let i = 0; i < pos.count; i++) {
            if (!(color.getX(i) > 0.5 && color.getY(i) < 0.2)) continue;
            const key = Math.round(pos.getX(i) / 0.29);
            const c = columns.get(key) || { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
            c.x0 = Math.min(c.x0, pos.getX(i)); c.x1 = Math.max(c.x1, pos.getX(i));
            c.y0 = Math.min(c.y0, pos.getY(i)); c.y1 = Math.max(c.y1, pos.getY(i));
            columns.set(key, c);
        }
        expect([...columns.keys()].sort()).toEqual([-1, 0, 1]);
        const boards = [...columns.values()].sort((p, q) => p.x0 - q.x0);
        for (const b of boards) {
            expect(b.x1 - b.x0).toBeGreaterThan(0.17);
            expect(b.x1 - b.x0).toBeLessThan(0.21);
            expect(b.y0).toBeLessThan(0.11);
            expect(b.y1).toBeGreaterThan(box.max.y - 0.01);
        }
        // Close together: gaps of a few centimetres, not a road width
        for (let i = 1; i < boards.length; i++) {
            expect(boards[i].x0 - boards[i - 1].x1).toBeGreaterThan(0.02);
            expect(boards[i].x0 - boards[i - 1].x1).toBeLessThan(0.15);
        }
        // The foot frame spans all three
        expect(box.max.x - box.min.x).toBeGreaterThan(boards[2].x1 - boards[0].x0);
    });

    test('each site has an end gate on both verges at both ends, the triangle on the closed side facing the arriving traffic', () => {
        const bad = [];
        for (const site of works.sites) {
            const gates = site.elements.filter(e => e.kind === 'gate');
            const triangles = site.elements.filter(e => e.kind === 'triangle');
            if (gates.length !== 4) bad.push(`site ${site.id}: ${gates.length} gate groups, want 4`);
            if (triangles.length !== 2) bad.push(`site ${site.id}: ${triangles.length} triangles, want 2`);
            for (const gate of site.gates) {
                for (const sign of [Route.LEFT, Route.RIGHT]) {
                    const at = gates.filter(e => Math.abs(e.s - gate.s) < 0.01 && Math.sign(e.lat) === sign);
                    if (at.length !== 1) { bad.push(`site ${site.id} gate at ${Math.round(gate.s)} side ${sign}: ${at.length} groups`); continue; }
                    const half = env.route.sample(gate.s, {}).width / 2;
                    if (Math.abs(at[0].lat) - 0.45 < half) bad.push(`site ${site.id}: a gate group reaches the carriageway`);
                }
                const t = triangles.find(e => Math.abs(e.s - gate.s) < 0.01);
                if (!t) continue;
                if (Math.sign(t.lat) !== site.side) bad.push(`site ${site.id}: the triangle at ${Math.round(gate.s)} is not on the closed side`);
                // Its printed face looks along -z of its frame: toward decreasing s at the entry, increasing s at the exit
                const heading = env.route.sample(gate.s, {}).heading;
                const faces = Math.cos(t.yaw - heading) > 0 ? 1 : -1;
                if (faces !== gate.facing) bad.push(`site ${site.id}: the triangle at ${Math.round(gate.s)} faces away from its traffic`);
            }
        }
        if (bad.length) throw new Error(bad.join('\n'));
        // The triangle is printed from the atlas's triangle, a white face in a red border drawn in code
        const uv = geo.triangle.attributes.uv;
        let inTriangle = 0;
        for (let i = 0; i < 3; i++) if (uv.getX(i) <= 0.5 && uv.getY(i) >= 0.55) inTriangle++;
        expect(inTriangle).toBe(3);
    });

    test('a closed site has a traffic light at each entry, on the open lane\'s verge, facing its traffic, with three lamps', () => {
        const bad = [];
        for (const site of works.closed) {
            const lights = site.elements.filter(e => e.kind === 'light');
            if (lights.length !== 2) { bad.push(`site ${site.id}: ${lights.length} lights`); continue; }
            for (const light of lights) {
                const half = env.route.sample(light.s, {}).width / 2;
                if (Math.sign(light.lat) !== site.open || Math.abs(light.lat) - 0.3 < half) bad.push(`site ${site.id}: a light is not on the open lane's verge (${light.lat.toFixed(2)})`);
                const line = light.direction > 0 ? site.stopIn : site.stopOut;
                if (Math.abs(light.s - line) > 0.01) bad.push(`site ${site.id}: a light is not at its stop line`);
                const heading = env.route.sample(light.s, {}).heading;
                if ((Math.cos(light.yaw - heading) > 0 ? 1 : -1) !== light.direction) bad.push(`site ${site.id}: a light faces away from its traffic`);
            }
        }
        if (bad.length) throw new Error(bad.join('\n'));
        // A Swiss mobile light: a yellow housing over a post on a weighted base, about 2.6 m
        const box = geo.light.boundingBox;
        expect(box.max.y).toBeGreaterThan(2.4);
        expect(box.max.y).toBeLessThan(2.9);
        expect(works.meshes.lamps.instanceColor).toBeTruthy();
        expect(Roadworks.LAMP_Y).toHaveLength(3);
    });

    test('Leitbaken stand along the centre line every 6 to 8 m, tapering out to the closed edge over 15 to 20 m at each end, their chevrons toward the open lane', () => {
        expect(Roadworks.TAPER_M).toBeGreaterThanOrEqual(15);
        expect(Roadworks.TAPER_M).toBeLessThanOrEqual(20);
        const bad = [];
        for (const site of works.closed) {
            const beacons = site.elements.filter(e => e.kind === 'beacon').sort((p, q) => p.s - q.s);
            const core = beacons.filter(b => b.s >= site.sb - 0.01 && b.s <= site.sc + 0.01);
            for (let i = 1; i < core.length; i++) {
                const gap = core[i].s - core[i - 1].s;
                if (gap < 6 || gap > 8) bad.push(`site ${site.id}: beacons ${gap.toFixed(1)} m apart on the centre line`);
            }
            for (const b of core) if (Math.abs(b.lat - site.side * Roadworks.BEACON_LAT_M) > 0.01) bad.push(`site ${site.id}: a beacon off the centre line at ${b.lat.toFixed(2)}`);
            // The tapers: the first and last beacons near the closed edge, every one on the closed side
            const first = beacons[0], last = beacons[beacons.length - 1];
            if (first.lat * site.side < site.half - 0.6 || last.lat * site.side < site.half - 0.6) bad.push(`site ${site.id}: a taper does not start at the closed edge`);
            for (const b of beacons) if (b.lat * site.side <= 0) bad.push(`site ${site.id}: a beacon on the open side`);
            // The chevrons point toward the board frame's -x (the atlas), which the yaw turns toward the open lane
            for (const b of beacons) {
                const heading = env.route.sample(b.s, {}).heading;
                const minusX = -Math.cos(b.yaw - heading);
                if (Math.sign(minusX) !== site.open) bad.push(`site ${site.id}: a beacon's chevrons point to the closed lane`);
            }
        }
        if (bad.length) throw new Error(bad.slice(0, 20).join('\n'));
    });

    test('the closed side is drawn from the station id: the same on every load, and not the same at every site', async () => {
        const again = await load();
        expect(again.roadworks.sites.map(site => site.side)).toEqual(works.sites.map(site => site.side));
        for (const site of works.sites) expect(site.side).toBe(Roadworks.closedSide(site.id));
        const sides = new Set(works.closed.map(site => site.side));
        expect(sides.size).toBe(2);
        // A plan built on its own (a restart builds nothing new) agrees
        const replanned = Roadworks.plan(env.route, Roadworks.checkpointStations(env.stationGates), []);
        expect(replanned.map(site => site.side)).toEqual(works.sites.map(site => site.side));
    }, 300000);

    test('each closure runs from 64 m to its own most on the straight after its station, some of them long, its checkpoint line the station at its entry; no station is skipped', () => {
        for (const site of works.closed) {
            expect(site.s0).toBe(site.s);
            expect(site.s1).toBe(site.s + site.length);
            expect(site.length).toBeGreaterThanOrEqual(Roadworks.LENGTH_MIN_M);
            expect(site.length).toBeLessThanOrEqual(site.most);
            expect(site.most).toBe(Roadworks.mostOf(site.id));
            for (let s = site.s0; s <= site.s1; s += 4) expect(Math.abs(env.route.curvatureAt(s - 4, 8))).toBeLessThan(Roadworks.CURVE_MAX);
        }
        // The longest a site may be is five times the short closure; each station has a most of its own between the
        // two, and where the road gives the room a site is longer than the short closure
        expect(Roadworks.LENGTH_MAX_M).toBe(5 * Roadworks.LENGTH_SHORT_M);
        const mosts = works.sites.map(site => site.most);
        expect(Math.min(...mosts)).toBeGreaterThanOrEqual(Roadworks.LENGTH_SHORT_M);
        expect(Math.max(...mosts)).toBeLessThanOrEqual(Roadworks.LENGTH_MAX_M);
        expect(new Set(mosts).size).toBeGreaterThan(works.sites.length / 2);
        expect(works.closed.filter(site => site.length > Roadworks.LENGTH_SHORT_M).length).toBeGreaterThanOrEqual(works.closed.length / 3);
        // The importer puts a station only where a full site fits (tools/world/stations.mjs): none has the gates only
        expect(works.sites.filter(site => !site.closed).map(site => `${site.id}: ${site.reason}`)).toEqual([]);
    });

    test('a station where no closure fits would have the gates only and say why: the end of the ride, a bend, a narrow road', () => {
        const route = env.route;
        // (stations nobody shipped: 30 m before the finish, and in the first hairpin of the stacked ladder)
        const end = Roadworks.site(route, { id: 90, s: env.endS - 30 }, []);
        expect(end.closed).toBe(false);
        expect(end.reason).toMatch(/the straight after it is \d+ m long \(it ends at .*\), under the 64 m a closure needs/);
        expect([end.s0, end.gates.map(g => g.s), end.lights, end.items]).toEqual([end.s, [end.s, end.s1], [], []]);
        expect(end.s1).toBeLessThanOrEqual(route.length);
        let bend = null;
        for (let s = 9400; s < 11400 && !bend; s += 4) if (Math.abs(route.curvatureAt(s - 4, 8)) > 0.05) bend = Roadworks.site(route, { id: 91, s }, []);
        expect(bend.closed).toBe(false);
        expect(bend.reason).toMatch(/it ends at a bend of \d+ m radius/);
        expect(Roadworks.problems(bend)).toEqual([`no lane is closed: ${bend.reason}`]);
        // A road too narrow for the open lane ends the stretch as a bend does
        const narrow = { length: route.length, sample: (s, out) => Object.assign(route.sample(s, out), { width: 6 }), curvatureAt: (s, span) => route.curvatureAt(s, span) };
        expect(Roadworks.stretch(narrow, works.sites[0].s, []).reason).toMatch(/a road that leaves an open lane of 3\.03 m/);
    });

    test('every open lane is at least 3.2 m wide and free of every drawn thing and physics zone', () => {
        const r = roadworksWindow(game, env);
        expect(r.sites).toBe(works.closed.length);
        expect(r.points).toBeGreaterThan(10000);
        expect(r.narrow).toEqual([]);
        expect(r.drawnOff).toEqual([]);
        expect(r.inOpen).toEqual([]);
        for (const site of works.closed) expect(site.openWidth).toBeGreaterThanOrEqual(Roadworks.OPEN_MIN_M);
    });

    test('only the sites near the bike are drawn', () => {
        const site = works.closed[2];
        const at = env.route.sample(site.s, {});
        works.place(at.x, at.z);
        expect(works.group.visible).toBe(true);
        expect(works.meshes.gate.count).toBeGreaterThanOrEqual(4);
        expect(works.meshes.gate.count).toBeLessThan(works.elements.filter(e => e.kind === 'gate').length);
        expect(works.meshes.lamps.count).toBe(works.near.reduce((n, s) => n + s.lights.length * 3, 0));
        works.place(at.x + 5000, at.z + 5000);
        expect(works.group.visible).toBe(false);
        expect(works.meshes.gate.count).toBe(0);
    });

    test('every gate and light stands on the drawn verge: not floating, not buried', () => {
        const points = env.route.points;
        const raycaster = new THREE.Raycaster();
        const down = new THREE.Vector3(0, -1, 0);
        const bad = [];
        for (const e of works.elements.filter(el => el.kind === 'gate' || el.kind === 'light')) {
            let i = 0;
            while (i + 1 < points.length && points[i + 1].s <= e.s) i++;
            const ribbon = RoadMesh.nearRibbon(env.rowsOf(Math.max(0, i - 3), Math.min(points.length - 1, i + 4)));
            const mesh = new THREE.Mesh(ribbon.geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
            const cos = Math.cos(e.yaw), sin = Math.sin(e.yaw);
            for (const [c, a] of [[0, 0], [e.box.x0, e.box.z0], [e.box.x1, e.box.z0], [e.box.x1, e.box.z1], [e.box.x0, e.box.z1]]) {
                const x = e.x + c * cos + a * sin, z = e.z - c * sin + a * cos;
                raycaster.set(new THREE.Vector3(x, e.y + 5, z), down);
                const hit = raycaster.intersectObject(mesh)[0];
                if (!hit) bad.push(`${e.kind} at s ${Math.round(e.s)} side ${Math.sign(e.lat)}: no drawn verge under (${c.toFixed(2)}, ${a.toFixed(2)})`);
                else if (Math.abs(e.y + e.box.y0 - hit.point.y) > 0.05) bad.push(`${e.kind} at s ${Math.round(e.s)}: foot ${(e.y + e.box.y0).toFixed(3)}, drawn verge ${hit.point.y.toFixed(3)}`);
            }
            ribbon.geometry.dispose();
        }
        if (bad.length) throw new Error(bad.slice(0, 20).join('\n'));
    });

    test('no checkpoint keeps an arch; the start and the finish do', () => {
        const pos = env.gateMesh.geometry.attributes.position;
        const near = (st, r) => {
            for (let i = 0; i < pos.count; i++) if (Math.hypot(pos.getX(i) - st.position.x, pos.getZ(i) - st.position.z) < r) return true;
            return false;
        };
        const arches = env.checkpoints.filter(gate => near(gate, game.Scenery.GATE_SHIFT_M + 12)).map(gate => gate.index);
        expect(arches).toEqual([]);
        const start = env.route.sample(env.stationGates[0].s, {});
        expect(near({ position: start }, game.Scenery.GATE_SHIFT_M + 12)).toBe(true);
        expect(near(env.finishGate, game.Scenery.GATE_SHIFT_M + 12)).toBe(true);
    });
});
