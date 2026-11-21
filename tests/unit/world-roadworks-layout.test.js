// What stands in a roadworks site's closed lane (js/world/roadworks.js, Roadworks.layout): the works in groups drawn
// from the site's id, no kind more often than Roadworks.MOST allows, no site with its neighbour's layout, the ramps'
// line clear of every solid thing, the repair surface only between the tapers, and no more triangles in the whole
// stage than its roadworks cost before. The lights, the contact and the rides are tests/unit/world-roadworks.test.js.
import { describe, test, expect, beforeAll } from '@jest/globals';
import { loadGame, loadScript } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';

const game = loadGame();
const { THREE, WorldEnvironment, Roadworks, RoadSurface, Vehicle } = game;

// The triangles the roadworks of the whole Tremola stage drew before its checkpoints were halved (commit 70fce04: 12
// sites, each no dearer than before the works stood in groups), with every board, sign face and lamp
const TRIANGLES_BEFORE = 28844;
// A closed lane this long in its full width is a long site
const LONG_M = 150;
const FIXED = new Set(['gate', 'triangle', 'light', 'beacon', 'cone', 'planks']);

let env, works, geo, junctionS;
beforeAll(async () => {
    const { fetchFn } = diskFetch();
    env = await WorldEnvironment.load(new THREE.Scene(), { id: 'tremola', fetchFn, models: null, digest: async () => '0' });
    works = env.roadworks;
    geo = Roadworks.geometries();
    junctionS = [];
    for (const j of (env.graph && env.graph.junctions) || []) for (const pass of j.passes) junctionS.push(pass.sIn);
}, 300000);

const trianglesOf = kind => (geo[kind].index ? geo[kind].index.count : geo[kind].attributes.position.count) / 3;
const countsOf = (items) => {
    const counts = {};
    for (const item of items) counts[item.kind] = (counts[item.kind] || 0) + 1;
    return counts;
};
// A closed lane of `core` metres in its full width on a road `half` wide each side, with no route behind it
const lane = (id, core, half = 5, surface = 'asphalt') => {
    const site = { id, side: 1, open: -1, half, surface, sb: 100, sc: 100 + core };
    site.sa = site.sb - Roadworks.TAPER_M;
    site.sd = site.sc + Roadworks.TAPER_M;
    site.items = Roadworks.layout(site);
    return site;
};

describe('the caps', () => {
    test('no site of the stage has more than 2 diggers, or more of any kind than Roadworks.MOST', () => {
        expect(Roadworks.MOST.digger).toBe(2);
        for (const site of works.closed) {
            const counts = countsOf(site.elements);
            for (const [kind, most] of Object.entries(Roadworks.MOST)) expect([site.id, kind, counts[kind] || 0]).toEqual([site.id, kind, Math.min(counts[kind] || 0, most)]);
        }
        // The stage has a digger, so the cap is not held by an empty stage
        expect(works.elements.some(e => e.kind === 'digger')).toBe(true);
    });

    test('the longest site there can be keeps the caps, for every id and both road surfaces', () => {
        const core = Roadworks.LENGTH_MAX_M - 2 * (Roadworks.STOP_M + Roadworks.BLEND_M + Roadworks.TAPER_LAG_M);
        let diggers = 0;
        for (let id = 0; id < 400; id++) {
            for (const surface of ['asphalt', 'cobbles']) {
                const site = lane(id, core, 5, surface);
                const counts = countsOf(site.items);
                for (const [kind, most] of Object.entries(Roadworks.MOST)) if ((counts[kind] || 0) > most) throw new Error(`id ${id} on ${surface}: ${counts[kind]} ${kind}, at most ${most}`);
                for (const [name, group] of Object.entries(Roadworks.GROUPS)) {
                    const stood = site.groups.filter(g => g.name === name).length;
                    if (stood > (group.most || Infinity)) throw new Error(`id ${id}: the group ${name} stands ${stood} times`);
                    if (stood && group.on && group.on !== surface) throw new Error(`id ${id}: the group ${name} on ${surface}`);
                }
                diggers = Math.max(diggers, counts.digger || 0);
            }
        }
        expect(diggers).toBe(2);
    });

    test('every table names kinds that are drawn and solid as drawn, and a new model is cheap', () => {
        const role = Roadworks.ROLE;
        for (const [kind, piece] of Object.entries(Roadworks.PIECES)) {
            expect(geo[kind]).toBeTruthy();
            expect(role[kind]).toBeTruthy();
            // A solid piece's half width in the table is its drawn one (the ramps' line is kept clear by it)
            if (role[kind] === 'heavy') {
                const box = geo[kind].boundingBox;
                expect(piece.wide).toBeGreaterThanOrEqual(Math.max(-box.min.x, box.max.x) - 1e-6);
                expect(Roadworks.NAMES[kind]).toBeTruthy();
                expect(piece.out + piece.wide).toBeLessThanOrEqual(Roadworks.STRIP_M + 1e-9);
            }
            expect(piece.length).toBeGreaterThanOrEqual(geo[kind].boundingBox.max.z - geo[kind].boundingBox.min.z - 1e-6);
        }
        for (const kind of Object.keys(Roadworks.MOST)) expect(Roadworks.PIECES[kind]).toBeTruthy();
        for (const group of Object.values(Roadworks.GROUPS)) {
            for (const kind of [...group.strip, ...(group.extra || [])]) expect(Roadworks.PIECES[kind]).toBeTruthy();
            for (const kind of group.mid) expect(Roadworks.RAMPS[kind]).toBeGreaterThan(0);
        }
        for (const kind of ['pipes', 'kerbs', 'setts', 'compressor', 'cabin', 'toilet', 'van']) expect(trianglesOf(kind)).toBeLessThanOrEqual(150);
    });
});

describe('the variety', () => {
    test('every site of the stage has a layout of its own, and a long site has at least 3 different groups', () => {
        const layouts = works.closed.map(site => site.layout);
        // (6 sites since the checkpoints were halved: each draws until its layout is none of the sites' before it)
        expect(new Set(layouts).size).toBe(works.closed.length);
        for (let i = 1; i < layouts.length; i++) expect([works.closed[i].id, layouts[i]]).not.toEqual([works.closed[i].id, layouts[i - 1]]);
        const long = works.closed.filter(site => site.sc - site.sb >= LONG_M);
        expect(long.length).toBeGreaterThan(0);
        for (const site of long) expect(new Set(site.groups.map(g => g.name)).size).toBeGreaterThanOrEqual(3);
        // Four of the five groups of the tables stand somewhere in the stage (6 sites, four of them one or two groups
        // long: the draws of the three on asphalt gave no surfacing), and none that the tables do not name
        const stood = new Set(works.closed.flatMap(site => site.groups.map(g => g.name)));
        for (const name of stood) expect(Object.keys(Roadworks.GROUPS)).toContain(name);
        expect([...stood].sort()).toEqual(['dig', 'setts', 'stores', 'welfare']);
        for (const site of works.closed) {
            expect(site.groups.length).toBeGreaterThan(0);
            for (const g of site.groups) expect([undefined, site.surface]).toContain(Roadworks.GROUPS[g.name].on);
        }
    });

    test('a site that would have its neighbour\'s layout draws again, for any ids, and takes a layout no site before it has where its draws give one', () => {
        const stations = [];
        for (let id = 1; id <= 60; id++) stations.push({ id, s: works.closed[0].s });
        // (the same straight for every station: only the id differs, and each most)
        const sites = Roadworks.plan(env.route, stations, junctionS).filter(site => site.closed);
        expect(sites.length).toBeGreaterThan(30);
        let same = 0;
        for (let i = 1; i < sites.length; i++) if (sites[i].layout === sites[i - 1].layout) same++;
        expect(same).toBe(0);
        expect(new Set(sites.map(site => site.layout)).size).toBeGreaterThanOrEqual(8);
    });

    test('between two groups the closed lane is plain: beacons and cones only, for at least the least gap', () => {
        const bad = [];
        for (const site of works.closed) {
            for (let i = 1; i < site.groups.length; i++) {
                const from = site.groups[i - 1].s1, to = site.groups[i].s0;
                if (to - from < Roadworks.GROUP_GAP_M[0] - 1e-6) bad.push(`site ${site.id}: ${(to - from).toFixed(1)} m between ${site.groups[i - 1].name} and ${site.groups[i].name}`);
                for (const item of site.items) {
                    if (item.kind === 'beacon' || item.kind === 'cone') continue;
                    const half = (geo[item.kind].boundingBox.max.z - geo[item.kind].boundingBox.min.z) / 2;
                    if (item.s + half > from + 0.01 && item.s - half < to - 0.01) bad.push(`site ${site.id}: a ${item.kind} at ${item.s.toFixed(1)} in the open stretch ${from.toFixed(1)} to ${to.toFixed(1)}`);
                }
            }
            // Everything of the works stands in the lane's full width, between the tapers
            for (const item of site.items) {
                if (FIXED.has(item.kind)) continue;
                if (item.s < site.sb || item.s > site.sc) bad.push(`site ${site.id}: a ${item.kind} at ${item.s.toFixed(1)} outside ${site.sb.toFixed(1)} to ${site.sc.toFixed(1)}`);
                if (item.lat * site.side <= 0) bad.push(`site ${site.id}: a ${item.kind} on the open side`);
            }
        }
        if (bad.length) throw new Error(bad.slice(0, 20).join('\n'));
    });

    test('every closed site has a ramp, the stage has all three, and the ramps\' line is clear of every solid thing', () => {
        const ramps = ['plankRamp', 'plateRamp', 'sandRamp'];
        const bad = [];
        for (const site of works.closed) {
            if (!site.elements.some(e => ramps.includes(e.kind))) bad.push(`site ${site.id} has no ramp`);
            for (const e of site.elements) {
                if (ramps.includes(e.kind) && Math.abs(Math.abs(e.lat) - site.rampLat) > 1e-9) bad.push(`site ${site.id}: a ramp off the ramps' line`);
                if (e.role !== 'heavy' || e.kind === 'gate' || e.kind === 'light') continue;
                const inner = Math.abs(e.lat) - Math.max(-e.box.x0, e.box.x1);
                if (inner < site.rampLat + Roadworks.BIKE_R + Roadworks.LINE_CLEAR_M - 1e-6) bad.push(`site ${site.id}: a ${e.kind} reaches ${inner.toFixed(2)} m, the bike on the ramps' line ${(site.rampLat + Roadworks.BIKE_R).toFixed(2)} m`);
            }
        }
        if (bad.length) throw new Error(bad.slice(0, 20).join('\n'));
        for (const kind of ramps) expect(works.elements.some(e => e.kind === kind)).toBe(true);
        // On the narrowest road a closure may stand on, the line is still clear and the ramps keep off the beacons
        for (let id = 0; id < 200; id++) {
            const half = Roadworks.OPEN_MIN_M + Roadworks.BEACON_HALF_M - Roadworks.BEACON_LAT_M;
            const site = lane(id, 300, half);
            for (const item of site.items) {
                const piece = Roadworks.PIECES[item.kind];
                if (!piece || !piece.wide) continue;
                if (Math.abs(item.lat) - piece.wide < site.rampLat + Roadworks.BIKE_R) throw new Error(`id ${id}: a ${item.kind} on the ramps' line of a narrow road`);
            }
            expect(site.rampLat - 1).toBeGreaterThanOrEqual(Roadworks.BEACON_LAT_M + Roadworks.BEACON_HALF_M - 1e-9);
        }
    });
});

describe('the same site on every ride and every machine', () => {
    test('a site planned and built again has the same things in the same places, and draws nothing from Math.random', () => {
        const real = Math.random;
        let draws = 0;
        Math.random = () => { draws++; return real(); };
        let plan;
        try {
            plan = Roadworks.plan(env.route, Roadworks.checkpointStations(env.stationGates), junctionS);
        } finally {
            Math.random = real;
        }
        expect(draws).toBe(0);
        // (built outside the count: three names each mesh and material it makes with Math.random, which places nothing)
        const again = new Roadworks(env, env.stationGates);
        const placed = site => site.items.map(item => [item.kind, item.s, item.lat, item.yaw]);
        expect(plan.map(placed)).toEqual(works.sites.map(placed));
        expect(plan.map(site => [site.layout, site.groups, site.phaseOffsetS])).toEqual(works.sites.map(site => [site.layout, site.groups, site.phaseOffsetS]));
        const built = list => list.map(e => [e.kind, e.x, e.y, e.z, e.yaw]);
        expect(built(again.elements)).toEqual(built(works.elements));
        // (the route's lane tables are the same again: env.roadworks still owns them)
        expect(works.elements.length).toBeGreaterThan(300);
    });

    test('a site\'s layout is its own id\'s: another id on the same lane has another', () => {
        const keys = new Set();
        for (let id = 1; id <= 40; id++) keys.add(JSON.stringify(lane(id, 200).items.filter(item => !FIXED.has(item.kind))));
        expect(keys.size).toBe(40);
        expect(lane(7, 200).items).toEqual(lane(7, 200).items);
    });
});

describe('the repair surface', () => {
    // RoadSurface.shader's roadWorksAt, with its noise at `rag` (the widest it reaches is RAG_M either way)
    const RAG_M = 0.5 * 0.3 + 0.5 * 0.08;
    const weight = (S, L, s, lat, rag) => {
        const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
        const t = clamp(Math.min((s - S.x) / Math.max(S.y - S.x, 0.01), (S.w - s) / Math.max(S.w - S.z, 0.01)), 0, 1);
        const inner = (L.z - 0.35) + (L.y - (L.z - 0.35)) * t;
        const x = lat * L.x;
        const d = Math.min(Math.min(x - inner, L.z + 0.05 - x), Math.min(s - S.x, S.w - s)) + rag;
        const u = clamp((d + 0.12) / 0.24, 0, 1);
        return u * u * (3 - 2 * u);
    };
    // The uniforms RoadSurface.setWorks gives the shader for a site
    const uniformsOf = (site) => {
        const keep = { near: RoadSurface.near, works: RoadSurface.works };
        const u = { roadWorksS: { value: [new THREE.Vector4(), new THREE.Vector4()] }, roadWorksL: { value: [new THREE.Vector4(), new THREE.Vector4()] }, roadWorksC: { value: [new THREE.Vector4(), new THREE.Vector4()] } };
        RoadSurface.near = { userData: { roadUniforms: u } };
        try {
            RoadSurface.setWorks([site]);
        } finally {
            RoadSurface.near = keep.near;
            RoadSurface.works = keep.works;
        }
        return { S: u.roadWorksS.value[0], L: u.roadWorksL.value[0] };
    };

    test('the port here is the shader\'s rule', () => {
        const source = loadScript('world/roadsurface.js');
        expect(source).toContain('float rag = (landNoise(vec2(s * 1.7, lat * 1.7 + 3.0)) - 0.5) * 0.3 + (landNoise(vec2(s * 6.1, lat * 6.1)) - 0.5) * 0.08;');
        expect(source).toContain('float d = min(min(x - inner, L.z + 0.05 - x), min(s - S.x, S.w - s)) + rag;');
        expect(source).toContain('float w = smoothstep(-0.12, 0.12, d);');
        expect(source).toContain('float t = clamp(min((s - S.x) / max(S.y - S.x, 0.01), (S.w - s) / max(S.w - S.z, 0.01)), 0.0, 1.0);');
        expect(Roadworks.REPAIR_INSET_M).toBeGreaterThan(RAG_M + 0.12);
    });

    test('under every sample of both tapers the drawn surface is the road\'s own, and the repair surface covers the closed stretch between them', () => {
        const bad = [];
        for (const site of works.closed) {
            const [from, to] = Roadworks.repairSpan(site);
            expect(from).toBeGreaterThan(site.sb);
            expect(to).toBeLessThan(site.sc);
            expect(from - site.sb).toBeLessThan(1);
            expect(site.sc - to).toBeLessThan(1);
            const { S, L } = uniformsOf(site);
            // The tapers, from the first beacon to the lane's full width, and all the road before and after them: at the
            // noise that carries the surface furthest out, across the whole road
            for (const [a, b] of [[site.s0 - 20, site.sb], [site.sc, site.s1 + 20]]) {
                for (let s = a; s <= b + 1e-9; s += 0.25) {
                    for (let lat = -site.half; lat <= site.half + 1e-9; lat += 0.25) {
                        for (const rag of [RAG_M, 0, -RAG_M]) {
                            const w = weight(S, L, Math.min(b, s), lat, rag);
                            if (w > 0 && bad.length < 20) bad.push(`site ${site.id}: repair surface ${w.toFixed(2)} at s ${s.toFixed(2)} (taper ${site.sa.toFixed(1)} to ${site.sb.toFixed(1)}, ${site.sc.toFixed(1)} to ${site.sd.toFixed(1)}), lat ${lat.toFixed(2)}`);
                        }
                    }
                }
            }
            // The closed stretch: all repair surface from the beacons' feet to the edge, at the noise that holds it back
            // most, and none of it in the open lane
            const inner = Roadworks.BEACON_LAT_M + Roadworks.BEACON_HALF_M;
            for (let s = from + RAG_M + 0.13; s <= to - RAG_M - 0.13; s += 0.5) {
                for (let x = inner + RAG_M + 0.13; x <= site.half - RAG_M - 0.08; x += 0.25) {
                    if (weight(S, L, s, x * site.side, -RAG_M) < 1 && bad.length < 20) bad.push(`site ${site.id}: no repair surface at s ${s.toFixed(1)}, ${x.toFixed(2)} m into the closed lane`);
                    if (weight(S, L, s, -x * site.side, RAG_M) > 0 && bad.length < 20) bad.push(`site ${site.id}: repair surface in the open lane at s ${s.toFixed(1)}`);
                }
            }
        }
        if (bad.length) throw new Error(bad.join('\n'));
    });

    test('the bike reads the road\'s own grip through a site, under the tapers and between them', () => {
        const v = new Vehicle(new THREE.Scene());
        v.environment = env;
        const bad = [];
        for (const site of works.closed) {
            for (let s = site.s0; s <= site.s1; s += 0.5) {
                v.routeS = s;
                v.syncWorldSurface();
                const own = (env.route.sample(s, {}).flags || {}).cobbles ? env.physics.cobbleGrip : 1;
                if (v.worldSurfaceGrip !== own) bad.push(`site ${site.id} at ${s}: grip ${v.worldSurfaceGrip}, the road's ${own}`);
            }
        }
        if (bad.length) throw new Error(bad.slice(0, 20).join('\n'));
        // (no grip, bump or drag comes from a site: the ridden surfaces are heights only)
        expect(Object.getOwnPropertyNames(Roadworks.prototype).filter(name => /grip|drag|bump/i.test(name))).toEqual([]);
    });
});

describe('the triangles', () => {
    test('the roadworks of the whole stage draw no more triangles than they did before', () => {
        const lamp = trianglesOf('lamp');
        const rows = works.sites.map((site) => {
            let n = 0;
            for (const e of site.elements) {
                n += trianglesOf(e.kind);
                if (e.board) n += trianglesOf('beaconBoard');
                if (e.face) n += trianglesOf('signFace');
                if (e.kind === 'light') n += 3 * lamp;
            }
            return [site.id, n];
        });
        expect(rows.map(([id]) => id)).toEqual(works.sites.map(site => site.id));
        const total = rows.reduce((sum, [, n]) => sum + n, 0);
        expect(total).toBeGreaterThan(5000);
        expect(total).toBeLessThanOrEqual(TRIANGLES_BEFORE);
        // What is drawn is what was counted: every element has its mesh, and each mesh holds all of its kind
        for (const kind of new Set(works.elements.map(e => e.kind))) {
            expect(works.meshes[kind]).toBeTruthy();
            expect(works.meshes[kind].instanceMatrix.count).toBe(works.elements.filter(e => e.kind === kind).length);
        }
    });
});
