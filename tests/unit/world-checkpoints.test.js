/**
 * @jest-environment node
 */
// The checkpoints of a world ride (tools/world/stations.mjs, js/world/roadworks.js; .agent/system/world-data.md,
// "Stations"). The owner: "maybe we need half the number of checkpoints ... they can just be used for split timing ...
// move the checkpoint to the beginning of the roadworks, not the end", and "roadworks must not be empty".
//
// The shipped stage had 12 checkpoints, two of them the bare gates (no site fitted before their stations). Now the
// importer puts a station only where a full roadworks site fits ahead of it, at twice the spacing; the timing line is
// the site's entry; and every site has works. The finish time of a ride does not depend on where the splits are.
// (tests/unit/world-roadworks-layout.test.js holds the triangles of the whole stage's roadworks at no more than before.)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, test, expect, beforeAll } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';
import { stagesFor, TOUR_STAGES } from '../helpers/world-stages.js';
import { diskFetch } from '../helpers/world-fetch.js';
import { rideSpan } from '../helpers/world-rider.js';
import { decodeWorld } from '../../tools/world/encode.mjs';
import { rideSamples, placeStations, siteProblem, SITE, SPACING_M } from '../../tools/world/stations.mjs';
import { FLAG } from '../../tools/world/profile.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// The branch head before the change: 12 checkpoints, a restart at the last one
const BEFORE = '70fce04';
const GATES_BEFORE = 12;
// The scripted careful rider (tests/helpers/world-rider.js, the pilot at 7 m/s) over the whole stage at that commit,
// in steps of 1/60 s, start line to finish line: 1 888.1 s (113 286 steps). The same rider on the bike with the owner's
// tuning of 2026-11-21 in its defaults (a lean rate of 1.50, a brake of 0.70: .agent/system/handling.md, "The
// defaults") takes 113 154 steps, 2.2 s less: the bike changed, the splits did not
const RIDE_TICKS_BEFORE = 113154;
const game = loadGame();
const { THREE, WorldEnvironment, Roadworks } = game;

let env, works, world, samples, junctionS, mapped;
beforeAll(async () => {
    const { fetchFn } = diskFetch();
    env = await WorldEnvironment.load(new THREE.Scene(), { id: 'tremola', fetchFn, models: null, digest: async () => '0' });
    works = env.roadworks;
    world = decodeWorld(path.join(REPO, 'world'));
    samples = rideSamples(world.edges, world.ride.path);
    junctionS = world.junctions.flatMap(j => j.passes.map(p => p.sIn));
    mapped = (world.manifest.places || []).filter(p => p.source === 'map');
}, 300000);

describe('the shipped stage', () => {
    test('about half the checkpoints: 6 where there were 12, at twice the spacing', () => {
        const stage = world.manifest.stages.find(st => st.id === 'tremola');
        expect(SPACING_M).toBe(2000);
        expect(world.manifest.stationSpacingM).toBe(2000);
        expect(stage.gates).toBe(6);
        expect(stage.gates).toBe(GATES_BEFORE / 2);
        expect(env.checkpoints).toHaveLength(6);
        expect(env.stationGates.map(st => st.kind)).toEqual(['start', 'gate', 'gate', 'gate', 'gate', 'gate', 'gate', 'end']);
        expect(env.stationGates.slice(1, -1).map(st => st.s)).toEqual([2132.26, 3824.69, 5725.26, 7501.85, 9216.46, 11477.21]);
        // No two timing lines nearer than half the spacing, none further apart than twice it
        const s = env.stationGates.map(st => st.s);
        for (let i = 1; i < s.length; i++) {
            expect(s[i] - s[i - 1]).toBeGreaterThanOrEqual(1000);
            expect(s[i] - s[i - 1]).toBeLessThanOrEqual(4000);
        }
    });

    test('the stations are where the placement rule puts them, on the decoded ride', () => {
        const bounds = world.manifest.stages.map(st => ({ id: st.id, from: st.from, to: st.to }));
        const placed = placeStations(samples, bounds, junctionS, { spacingM: world.manifest.stationSpacingM, places: mapped });
        expect(placed.dropped).toEqual([]);
        const again = placed.perStage[0].s;
        const shipped = env.stationGates.map(st => st.s);
        expect(again).toHaveLength(shipped.length);
        again.forEach((s, i) => expect(Math.abs(s - shipped[i])).toBeLessThan(0.5));
    });

    test('only the station files of world/ differ from the data before, and the land under the found places, the stops, the bridges\' ends and the junctions laid since: every other file is the same bytes', () => {
        const sums = text => new Map(text.trim().split('\n').map(line => { const [hash, file] = line.trim().split(/\s+/); return [file, hash]; }));
        const before = sums(execFileSync('git', ['show', `${BEFORE}:world/SHA256SUMS`], { cwd: REPO, encoding: 'utf8', maxBuffer: 1 << 26 }));
        const now = sums(readFileSync(path.join(REPO, 'world', 'SHA256SUMS'), 'utf8'));
        expect([...now.keys()].sort()).toEqual([...before.keys()].sort());
        const changed = [...now.keys()].filter(file => now.get(file) !== before.get(file)).sort();
        // (the found places are carved since: the height tiles their pads and its earthwork reach may differ)
        const tile = n => (n < 0 ? `m${-n}` : `${n}`);
        const carved = new Set();
        for (const p of world.manifest.places || []) {
            if (p.source !== 'found' || !p.surface) continue;
            for (let i = 0; i < samples.s.length; i++) {
                if (samples.s[i] < p.s - 30 || samples.s[i] > p.s + p.length + 30) continue;
                for (const out of [0, samples.width[i] / 2 + 1.1 + p.depth + 24]) {
                    const x = samples.x[i] + p.side * out * Math.cos(samples.heading[i]), z = samples.z[i] - p.side * out * Math.sin(samples.heading[i]);
                    for (const [dx, dz] of [[0, 0], [8, 0], [-8, 0], [0, 8], [0, -8]]) carved.add(`height/h-${tile(Math.floor((x + dx) / 512))}_${tile(Math.floor((z + dz) / 512))}.bin`);
                }
            }
        }
        // (and the land the re-import of 2026-11-25 laid by the importer's rules of 6f: at a bridge's ends, where no land
        // stands over the deck and the land meets the road's line past it (bench.mjs BRIDGE_UNDER_M), and round a
        // junction, where the ride owns the nodes just past its verge against a lower side road (RIDE_OWN_PAST_M); with
        // the horizon's sinks under the tiles, far/sink0.bin)
        const reachM = 25;
        const near = [];
        for (const e of world.edges) for (let i = 0; i < e.x.length; i++) {
            const on = e.flags[i] & 2, before = i > 0 && e.flags[i - 1] & 2, after = i + 1 < e.x.length && e.flags[i + 1] & 2;
            if (on && (!before || !after)) near.push([e.x[i], e.z[i]]);
        }
        for (const n of world.nodes) if (n.degree >= 3) near.push([n.x, n.z]);
        for (const [x, z] of near) for (let dx = -reachM; dx <= reachM; dx += reachM) for (let dz = -reachM; dz <= reachM; dz += reachM) carved.add(`height/h-${tile(Math.floor((x + dx) / 512))}_${tile(Math.floor((z + dz) / 512))}.bin`);
        carved.add('far/sink0.bin');
        // (and the land the stops' areas are laid on: tools/world/bench.mjs `pads`, a few metres past each outline)
        for (const stop of world.manifest.stops || []) for (const [x, z] of stop.ring) for (const [dx, dz] of [[0, 0], [16, 0], [-16, 0], [0, 16], [0, -16]]) carved.add(`height/h-${tile(Math.floor((x + dx) / 512))}_${tile(Math.floor((z + dz) / 512))}.bin`);
        expect(changed).toEqual(expect.arrayContaining(['manifest.json', 'ride.json']));
        expect(changed.filter(file => !['manifest.json', 'ride.json'].includes(file) && !carved.has(file))).toEqual([]);
    });

    test('the board of the stage keeps its id: the row has the new gates and floors under the same key', () => {
        const row = text => JSON.parse(text);
        const before = row(execFileSync('git', ['show', `${BEFORE}:functions/world-courses.json`], { cwd: REPO, encoding: 'utf8' }));
        // (the rows of the other data folders, worlds/*, stand beside it: the Tremola's own rows are the ones of world/)
        const now = Object.fromEntries(Object.entries(row(readFileSync(path.join(REPO, 'functions', 'world-courses.json'), 'utf8'))).filter(([id]) => /^world-(tremola|tour)-v\d+$/.test(id)));
        expect(Object.keys(now)).toEqual(Object.keys(before));
        expect(Object.keys(now)).toEqual(['world-tremola-v1']);
        expect([before['world-tremola-v1'].gates, now['world-tremola-v1'].gates]).toEqual([12, 6]);
        expect(now['world-tremola-v1'].gateFloorsMs).toHaveLength(7);
        expect(now['world-tremola-v1'].metres).toBe(before['world-tremola-v1'].metres);
    });
});

describe('every checkpoint is real roadworks', () => {
    test('no checkpoint is the bare gates, has no works, too few solid pieces or a long bare stretch: each that is, is named with its reason', () => {
        expect(works.sites).toHaveLength(env.checkpoints.length);
        const named = works.sites.flatMap(site => Roadworks.problems(site).map(problem => `checkpoint ${site.id} at s ${site.s}: ${problem}`));
        if (named.length) throw new Error(named.join('\n'));
        for (const site of works.sites) {
            expect(site.closed).toBe(true);
            expect(site.groups.length).toBeGreaterThanOrEqual(1);
            expect(Roadworks.solid(site)).toBeGreaterThanOrEqual(Roadworks.SOLID_MIN);
            expect(Roadworks.bare(site)).toBeLessThanOrEqual(Roadworks.BARE_MAX_M);
            // The last works stand within the bare limit of the lane's end: no site ends with nothing
            expect(site.sc - site.groups[site.groups.length - 1].s1).toBeLessThanOrEqual(Roadworks.BARE_MAX_M);
        }
        expect(Roadworks.SOLID_MIN).toBeGreaterThanOrEqual(3);
        expect(Roadworks.BARE_MAX_M).toBe(30);
    });

    test('the check is not silent: the bare gates, an empty lane, a thin one and a bare one are each named', () => {
        const real = works.sites[0];
        expect(Roadworks.problems({ closed: false, reason: 'the straight after it is 20 m long' })).toEqual(['no lane is closed: the straight after it is 20 m long']);
        expect(Roadworks.problems({ ...real, groups: [], items: [] }).join('; ')).toMatch(/no works stand in its closed lane of \d+ m; 0 solid pieces .* under 3; \d+\.\d m of its closed lane is bare, over 30 m/);
        expect(Roadworks.problems({ ...real, items: real.items.filter(item => !Roadworks.PIECES[item.kind]) }).join('; ')).toMatch(/^0 solid pieces/);
        expect(Roadworks.problems({ ...real, groups: real.groups.slice(0, 1).map(g => ({ ...g, s0: real.sb + 40, s1: real.sb + 45 })) }).join('; ')).toMatch(/of its closed lane is bare/);
    });

    test('for any id and any lane a full site can have, the layout holds the least solid pieces and the bare limit', () => {
        const least = SITE.lengthM - 2 * (Roadworks.STOP_M + Roadworks.BLEND_M + Roadworks.TAPER_LAG_M);
        const bad = [];
        for (let id = 0; id < 300; id++) {
            for (const core of [least, least + 7, 60, 90, 140, 260, 494]) {
                for (const surface of ['asphalt', 'cobbles']) {
                    const site = { id, closed: true, side: 1, open: -1, half: 5, surface, sb: 100, sc: 100 + core };
                    site.sa = site.sb - Roadworks.TAPER_M;
                    site.sd = site.sc + Roadworks.TAPER_M;
                    site.items = Roadworks.layout(site);
                    const problems = Roadworks.problems(site);
                    if (problems.length) bad.push(`id ${id}, ${core} m of ${surface}: ${problems.join('; ')}`);
                }
            }
        }
        if (bad.length) throw new Error(`${bad.length} lanes:\n${bad.slice(0, 20).join('\n')}`);
    });
});

// The tour's legs (js/world/tour.js): each checkpoint of each leg, as it is ridden, is real roadworks too. A leg ridden
// against a stage has its own stations (tools/world/tour.mjs), with the works in the lane it rides
describe.each(stagesFor(TOUR_STAGES))('every checkpoint of the tour\'s %s leg is real roadworks', (stage) => {
    let leg;
    beforeAll(async () => {
        const { fetchFn } = diskFetch();
        leg = await WorldEnvironment.load(new THREE.Scene(), { id: stage, fetchFn, models: null, digest: async () => '0' });
    }, 300000);

    test('a site at every checkpoint, each closed with its works, none bare', () => {
        expect(leg.checkpoints.length).toBeGreaterThan(0);
        expect(leg.roadworks.sites).toHaveLength(leg.checkpoints.length);
        const named = leg.roadworks.sites.flatMap(site => Roadworks.problems(site).map(problem => `checkpoint ${site.id} at s ${site.s}: ${problem}`));
        if (named.length) throw new Error(named.join('\n'));
        for (const site of leg.roadworks.sites) {
            expect(site.closed).toBe(true);
            expect(Roadworks.solid(site)).toBeGreaterThanOrEqual(Roadworks.SOLID_MIN);
            expect(Roadworks.bare(site)).toBeLessThanOrEqual(Roadworks.BARE_MAX_M);
        }
    });

    test('the stations run from the start to the finish in the way the leg is ridden, the first at its start', () => {
        const s = leg.stationGates.map(st => st.s);
        expect(s[0]).toBeCloseTo(leg.stage.from, 1);
        expect(s[s.length - 1]).toBeCloseTo(leg.stage.to, 1);
        for (let k = 1; k < s.length; k++) expect(s[k]).toBeGreaterThan(s[k - 1] + 900);
        // (the finish is the stage's end, and the start line START_M past its start)
        expect(leg.finishGate.s).toBeCloseTo(leg.endS, 1);
        expect(leg.startS).toBeGreaterThan(leg.stage.from);
    });
});

describe('the split is taken where the site begins', () => {
    test('the timing line is the site\'s entry: at the entry gate, before the first stop line, the works and the exit', () => {
        for (const [i, site] of works.sites.entries()) {
            const line = env.checkpoints[i].s;
            expect(site.s).toBe(line);
            expect(site.s0).toBe(line);
            expect(line).toBeLessThanOrEqual(site.stopIn);
            expect(site.stopIn - line).toBe(Roadworks.STOP_M);
            expect(site.stopIn).toBeLessThan(site.sa);
            expect(site.s1 - line).toBe(site.length);
            for (const item of site.items) expect(item.s).toBeGreaterThan(line);
            // Its boards: an end gate on each verge at the line, the other pair at the site's far end
            const gates = site.elements.filter(e => e.kind === 'gate').map(e => e.s).sort((a, b) => a - b);
            expect(gates).toEqual([line, line, site.s1, site.s1]);
            const lights = site.elements.filter(e => e.kind === 'light').map(e => e.s).sort((a, b) => a - b);
            expect(lights).toEqual([site.stopIn, site.stopOut]);
        }
    });

    test('a site runs on from its station while the road is straight, wide enough and clear of a junction and a structure', () => {
        const p = {};
        for (const site of works.sites) {
            expect(site.length).toBeGreaterThanOrEqual(SITE.lengthM);
            expect(site.length).toBeLessThanOrEqual(site.most);
            for (let s = site.s0; s <= site.s1; s += 1) {
                env.route.sample(s, p);
                expect(Math.abs(env.route.curvatureAt(s - 4, 8))).toBeLessThan(Roadworks.CURVE_MAX);
                expect(p.width / 2 - Roadworks.BEACON_HALF_M + Roadworks.BEACON_LAT_M).toBeGreaterThanOrEqual(Roadworks.OPEN_MIN_M);
                expect(!!(p.flags && (p.flags.tunnel || p.flags.gallery || p.flags.bridge))).toBe(false);
                expect(junctionS.some(j => Math.abs(j - s) < Roadworks.JUNCTION_CLEAR_M)).toBe(false);
            }
        }
    });
});

describe('the placement rule', () => {
    // A straight ride of 4 m samples, 10 m wide, with what a test puts on it
    const road = (length, edit = () => {}) => {
        const n = Math.floor(length / 4) + 1;
        const out = { s: new Float64Array(n), heading: new Float64Array(n), width: new Float32Array(n).fill(10), flags: new Uint8Array(n), radius: new Float64Array(n).fill(Infinity) };
        for (let i = 0; i < n; i++) out.s[i] = i * 4;
        edit(out);
        return out;
    };
    const bend = (out, from, to, radius) => { let h = 0; for (let i = 0; i < out.s.length; i++) { if (out.s[i] > from && out.s[i] <= to) h += 4 / radius; out.heading[i] = h; } };
    const stage = length => [{ id: 'a', from: 0, to: length }];

    test('the limits are inside the game\'s own, so the game builds a full site at every station', () => {
        expect(1 / SITE.radiusM).toBeLessThan(Roadworks.CURVE_MAX);
        expect(SITE.widthM / 2 - Roadworks.BEACON_HALF_M + Roadworks.BEACON_LAT_M).toBeGreaterThan(Roadworks.OPEN_MIN_M);
        expect(SITE.junctionM).toBeGreaterThan(Roadworks.JUNCTION_CLEAR_M);
        expect(SITE.lengthM).toBeGreaterThan(Roadworks.LENGTH_MIN_M);
        expect(SITE.lengthM).toBeLessThanOrEqual(Roadworks.LENGTH_SHORT_M);
    });

    test('a site that does not fit says why: a bend, a narrow road, a structure, a junction, a stopping place, the stage\'s end', () => {
        expect(siteProblem(road(1000), 400, [])).toBeNull();
        expect(siteProblem(road(1000, out => bend(out, 440, 470, 30)), 400, [])).toBe('a bend');
        expect(siteProblem(road(1000, out => bend(out, 440, 470, 80)), 400, [])).toBeNull();
        expect(siteProblem(road(1000, out => out.width.fill(6, 110, 115)), 400, [])).toBe('a narrow road');
        expect(siteProblem(road(1000, out => out.flags.fill(FLAG.bridge, 110, 115)), 400, [])).toBe('a structure');
        expect(siteProblem(road(1000), 400, [520])).toBe('a junction');
        expect(siteProblem(road(1000), 400, [540])).toBeNull();
        expect(siteProblem(road(1000), 400, [], [{ s: 450, length: 24 }])).toBe('a stopping place');
        expect(siteProblem(road(1000), 400, [], [{ s: 530, length: 24 }])).toBeNull();
        expect(siteProblem(road(1000), 400, [], [], 560)).toBe('the end of the stage');
    });

    test('on an open road the stations stand at their targets, one for each 2 km', () => {
        const placed = placeStations(road(12000), stage(12000), []);
        expect(placed.perStage[0].s).toEqual([0, 2000, 4000, 6000, 8000, 10000, 12000]);
        expect(placed.dropped).toEqual([]);
    });

    test('where no site fits at the target the station moves along the ride to the nearest place one does, within its reach', () => {
        // Hairpins from 3 900 to 4 150: the nearest fit is just past them (4 m of the same road before the site)
        const placed = placeStations(road(12000, out => bend(out, 3900, 4150, 12)), stage(12000), []);
        const moved = placed.perStage[0].s[2];
        expect(moved).toBe(4156);
        expect(siteProblem(road(12000, out => bend(out, 3900, 4150, 12)), moved, [])).toBeNull();
        expect(placed.dropped).toEqual([]);
    });

    test('where none fits within the reach there is no checkpoint, never a bare gate, and the import says why', () => {
        const samples = road(12000, out => bend(out, 3300, 4700, 12));
        const placed = placeStations(samples, stage(12000), []);
        expect(placed.perStage[0].s).toEqual([0, 2000, 6000, 8000, 10000, 12000]);
        expect(placed.dropped).toEqual([{ stage: 'a', target: 4000, reason: 'a bend' }]);
        expect(placed.maxGapM).toBe(4000);
        // And a gap past twice the spacing stops the import
        expect(() => placeStations(road(12000, out => bend(out, 3300, 6700, 12)), stage(12000), [])).toThrow(/gap of 6000 m/);
    });

    test('the same ride gives the same stations twice', () => {
        const a = placeStations(samples, world.manifest.stages.map(st => ({ id: st.id, from: st.from, to: st.to })), junctionS, { spacingM: 2000, places: mapped });
        const b = placeStations(samples, world.manifest.stages.map(st => ({ id: st.id, from: st.from, to: st.to })), junctionS, { spacingM: 2000, places: mapped });
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });
});

describe('the finish time does not depend on the splits', () => {
    test('the scripted careful rider finishes the stage in the time it took before, within a thousandth, with 6 splits and no crash', async () => {
        const ride = await rideSpan(game, env, { s0: env.startS, s1: Infinity, speed: 7, most: 60 * 4000 });
        expect([ride.crashed, ride.cut]).toEqual([false, false]);
        expect(ride.stations.map(st => st.index)).toEqual([1, 2, 3, 4, 5, 6, 7]);
        expect(ride.stations[6].tick).toBe(ride.ticks);
        // (the rider keeps the open lane through a site, and there are 6 sites where there were 10 closed ones: the
        // way round them was 0.9 s of 1 888 s)
        expect(Math.abs(ride.ticks - RIDE_TICKS_BEFORE)).toBeLessThanOrEqual(RIDE_TICKS_BEFORE / 1000);
        for (let i = 1; i < ride.stations.length; i++) expect(ride.stations[i].tick).toBeGreaterThan(ride.stations[i - 1].tick);
    }, 900000);
});
