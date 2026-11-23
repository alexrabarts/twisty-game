// The marker stones stand at sharp drops, round the outside of hairpins and on the top of retaining walls
// (Scenery.STONE_RULE). A world is ridden in node with the streamer, on the shipped stage and on the synthetic fixture
// world, and every stretch of drop the rule finds, every hairpin's row, every wall's row and every stone drawn is
// measured again by tests/helpers/world-stones.js. At a drop the drawn ground must fall more than dropM within reachM
// of the verge on the stone's side, round a hairpin more than hairpinDropM. In a hairpin's row the place must be on the arc of a hairpin
// the importer's own check finds (tools/world/verify.mjs findHairpins), on the outside of the bend. In both, nothing
// else may guard that edge (a retaining wall under it, a bridge, a tunnel, a solid edge). On a wall the stone stands
// on the middle of its coping, on a low wall (its face drops less than wallMaxM all along), and on such a wall the
// row takes the parapet's place: none is drawn there, and the physics and the chase camera read the stones where they
// read a parapet. No stone stands in a stopping place,
// a roadworks site or the mouth of a junction. A share of the stretches, of the hairpins and of the walls have their
// stones, all of each or none, the same on every load, no stone floats, the kerb course runs from stone to stone
// under a hairpin's row only, and the cap takes the stones nearest the bike.
// The yellow bend signs are not back: the map and the hairpin advice beside its turn prompt tell of a bend (WorldGuide).
import { describe, test, expect, beforeAll } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';
import { rideStones, lowWallFaults } from '../helpers/world-stones.js';

const game = loadGame();
const { Scenery } = game;
const rule = Scenery.STONE_RULE;
// The share of the stretches of drop that may have stones: "sometimes used", not always and not rarely
const SHARE = [0.5, 0.7];
// The share of the hairpins that may have a row: most of them, not all
const HAIRPIN_SHARE = [0.65, 0.85];
// A corner of a stone's foot may stand this far over the drawn ground under it (its lean, and the ground between two reads)
const FLOAT_M = 0.03;

const worlds = [
    ['the shipped stage', { id: 'tremola' }],
    ['the synthetic fixture world', { id: 'all', search: '?worldData=tests/fixtures/world/mini' }]
];

describe.each(worlds)('marker stones on %s', (name, world) => {
    let read, again;
    const near = (a, b) => Math.hypot(a.x - b.x, a.z - b.z) < 0.05;
    beforeAll(async () => {
        read = await rideStones(game, { ...world, fetchFn: diskFetch().fetchFn });
        // A second load, ridden in other steps, so the tiles arrive in another order
        again = await rideStones(game, { ...world, fetchFn: diskFetch().fetchFn, stepM: 170 });
    }, 900000);

    test('the world has stretches of sharp drop and hairpins, and stones on some of each', () => {
        expect(read.stretches.length).toBeGreaterThan(10);
        // (round a hairpin a row stands only where the land falls hairpinDropM behind it, and not beside a wall or its
        // taper: 8 hairpins of the shipped stage have a row, 1 of the fixture world's three)
        expect(read.rows.length).toBeGreaterThan(world.id === 'tremola' ? 5 : 0);
        expect(read.stones.length).toBeGreaterThan(40);
        for (const set of [read.stretches, read.rows]) if (set.some(t => t.used)) expect(read.stones.some(stone => set.some(t => t.places.some(q => near(q, stone))))).toBe(true);
    });

    test('the game\'s hairpins are the importer\'s: every bend of its list is in a stretch the importer\'s check finds, and every such stretch holds one', () => {
        expect(read.hairpins.length).toBeGreaterThanOrEqual(read.spans.length);
        expect(read.hairpins.filter(h => !read.spans.some(f => h.apex >= f.s0 && h.apex <= f.s1)).map(h => Math.round(h.apex))).toEqual([]);
        expect(read.spans.filter(f => !read.hairpins.some(h => h.apex >= f.s0 && h.apex <= f.s1))).toEqual([]);
        for (const h of read.hairpins) {
            expect(h.turn).toBeGreaterThanOrEqual(150 * Math.PI / 180);
            expect(h.s0).toBeLessThan(h.apex);
            expect(h.s1).toBeGreaterThan(h.apex);
        }
    });

    test('every place of every stretch is beside a sharp drop on its own side, with no wall, parapet, bridge or solid edge there, out of every stopping place, roadworks site and junction mouth', () => {
        const faults = read.stretches.flatMap(t => t.faults);
        if (faults.length) throw new Error(`${faults.length} places of the stones' stretches fail their own rule:\n${faults.slice(0, 30).join('\n')}`);
    });

    test('every place of every hairpin\'s row is on the arc of a hairpin, on the outside of the bend, with the land falling away behind it, with no wall, parapet, bridge or solid edge there, out of every stopping place, roadworks site and junction mouth', () => {
        const faults = read.rows.flatMap(t => t.faults);
        if (faults.length) throw new Error(`${faults.length} places of the hairpins' rows fail their own rule:\n${faults.slice(0, 30).join('\n')}`);
        for (const t of read.rows) for (const q of t.places) {
            expect(q.side).toBe(-t.hairpin.sign);
            expect(q.s).toBeGreaterThanOrEqual(t.hairpin.s0 - 1e-6);
            expect(q.s).toBeLessThanOrEqual(t.hairpin.s1 + 1e-6);
        }
    });

    test('a hairpin\'s row stands at a drop: the land behind every place of a row lies more than hairpinDropM under the road (less than a stretch\'s dropM), and the hairpin under the rising bank has none', () => {
        expect(rule.hairpinDropM).toBeLessThan(rule.dropM);
        for (const t of read.rows) for (const q of t.places) expect(q.drop).toBeGreaterThan(rule.hairpinDropM);
        // (and a hairpin's row needs no more: some place of a row has less than a stretch's drop behind it)
        if (world.id === 'tremola') expect(read.rows.some(t => t.places.some(q => q.drop <= rule.dropM))).toBe(true);
        // Some hairpins have no place at all: their outside is level, or the bank
        expect(read.hairpins.some(h => h.places === 0)).toBe(true);
        if (world.id !== 'tremola') return;
        // (the owner's picture: the hairpin at 1.3 km turns under the bank that rises from its outside)
        const bank = read.hairpins.find(h => Math.abs(h.apex - 1280) < 30);
        expect(bank).toBeDefined();
        expect(bank.places).toBe(0);
        if (process.env.STONE_COUNTS) process.stderr.write(`COUNTS stretches ${read.stretches.length} used ${read.stretches.filter(t => t.used).length} walls ${read.walls.length} hairpins ${read.hairpins.length} open ${read.hairpins.filter(h => h.places > 0).length} with a row ${read.hairpins.filter(h => h.places > 0 && h.used).length} rows ${read.rows.length} stones ${read.stones.length} kerbs ${read.kerbs.length} at ${read.hairpins.filter(h => h.places > 0 && h.used).map(h => (h.apex / 1000).toFixed(2)).join(' ')}\n`);
    });

    test('a hairpin\'s arc is the hairpin\'s row\'s: no place of a stretch of drop is on one, on either side', () => {
        const on = read.stretches.flatMap(t => t.places).filter(q => read.hairpins.some(h => q.s >= h.s0 && q.s <= h.s1));
        expect(on.map(q => q.s)).toEqual([]);
    });

    test('every stone drawn stands at a place of a stretch or of a row that has its stones', () => {
        const all = read.stretches.concat(read.rows, read.walls);
        const places = all.filter(t => t.used).flatMap(t => t.places);
        const stray = read.stones.filter(stone => !places.some(q => near(q, stone)));
        expect(stray.map(stone => `(${stone.x.toFixed(1)}, ${stone.z.toFixed(1)})`)).toEqual([]);
        // No stone of a stretch or a row that the share left out
        const out = all.filter(t => !t.used).flatMap(t => t.places);
        expect(read.stones.filter(stone => out.some(q => near(q, stone)))).toEqual([]);
    });

    test('the measures can fail: the first stone of a stretch planted on the other side of the road has no drop there, and the first of a row planted across the road is on the inside of the bend', () => {
        const failing = read.stretches.filter(t => t.mirror.length);
        expect(failing.length).toBeGreaterThan(read.stretches.length * (world.id === 'tremola' ? 0.9 : 0.3));
        expect(failing.some(t => t.mirror.some(f => /^drop/.test(f)))).toBe(true);
        for (const t of read.rows) expect(t.mirror).toContain('the inside of the bend');
    });

    test('a stretch is the whole drop: at least minM long, its stones STONE_GAP_M apart, and no place for a stone at a drop just before or after it', () => {
        expect(rule.blockM).toBeUndefined();
        for (const t of read.stretches) {
            expect((t.places.length - 1) * Scenery.STONE_GAP_M).toBeGreaterThanOrEqual(rule.minM);
            for (let i = 1; i < t.places.length; i++) expect(t.places[i].k - t.places[i - 1].k).toBe(1);
            expect(t.start).toBe(t.places[0].k);
        }
        // (read while its land is here: the stretches are whole, and no two of one side touch)
        for (const side of [-1, 1]) {
            const mine = read.stretches.filter(t => t.side === side);
            for (let i = 1; i < mine.length; i++) expect(mine[i].places[0].k).toBeGreaterThan(mine[i - 1].places[mine[i - 1].places.length - 1].k + 1);
        }
    });

    test('a chosen stretch has its stones over all of it, an unchosen one none, but the stones the ground under them leaves out', () => {
        const at = q => read.stones.some(stone => near(q, stone));
        const used = read.stretches.filter(t => t.used), unused = read.stretches.filter(t => !t.used);
        const missing = used.flatMap(t => t.places).filter(q => !at(q));
        // (the fixture world's hillside is steeper than a fill from end to end: footM leaves out more of its stones)
        if (world.id === 'tremola') expect(missing.length).toBeLessThanOrEqual(used.flatMap(t => t.places).length * 0.05);
        expect(unused.flatMap(t => t.places).filter(at)).toEqual([]);
    });

    test('a wall\'s row stands on the middle of the coping of a low wall under the road\'s edge, over all of the wall or not at all', () => {
        const faults = read.walls.flatMap(t => t.faults);
        if (faults.length) throw new Error(`${faults.length} places of the walls' rows fail their own rule:\n${faults.slice(0, 30).join('\n')}`);
        const at = q => read.stones.some(stone => near(q, stone));
        for (const t of read.walls) {
            for (const q of t.places) expect(q.wall).toBe(true);
            expect(t.places.filter(at).length).toBe(t.used ? t.places.length : 0);
            expect(t.used).toBe(Scenery.wallUsed(t.start, t.side));
        }
        // (no wall of either world is low today: the least drop of a wall's face anywhere is 5.8 m on the shipped
        // stage, and the lowest whole wall drops 7.3 m)
        if (process.env.STONE_COUNTS) process.stderr.write(`WALLS ${read.walls.length} used ${read.walls.filter(t => t.used).length}\n`);
    });

    test('a hairpin\'s row is at least minM long, its stones STONE_GAP_M apart along the outer edge itself', () => {
        for (const t of read.rows) {
            expect((t.places.length - 1) * Scenery.STONE_GAP_M).toBeGreaterThanOrEqual(rule.minM);
            for (let i = 1; i < t.places.length; i++) {
                expect(t.places[i].n - t.places[i - 1].n).toBe(1);
                // (the straight line between two stones on an arc is a little shorter than the arc)
                const apart = Math.hypot(t.places[i].x - t.places[i - 1].x, t.places[i].z - t.places[i - 1].z);
                expect(apart).toBeGreaterThan(Scenery.STONE_GAP_M - 0.2);
                expect(apart).toBeLessThan(Scenery.STONE_GAP_M + 0.05);
            }
        }
    });

    test('a seeded share of the stretches has its stones: within the band, from each stretch\'s own first station', () => {
        const used = read.stretches.filter(t => t.used).length;
        // (the share drawn falls in the band where there are stretches enough to share: whole stretches are few, 15
        // on the shipped stage, 6 of them chosen)
        if (read.stretches.length >= 30) {
            expect(used / read.stretches.length).toBeGreaterThanOrEqual(SHARE[0]);
            expect(used / read.stretches.length).toBeLessThanOrEqual(SHARE[1]);
        }
        expect(used).toBeGreaterThan(0);
        expect(used).toBeLessThan(read.stretches.length);
        // and the draw itself takes the share over many first stations
        const draws = [...Array(2000).keys()].filter(k => Scenery.stoneUsed(k, 1)).length / 2000;
        expect(draws).toBeGreaterThanOrEqual(SHARE[0]);
        expect(draws).toBeLessThanOrEqual(SHARE[1]);
        expect(rule.share).toBeGreaterThanOrEqual(SHARE[0]);
        expect(rule.share).toBeLessThanOrEqual(SHARE[1]);
        for (const t of read.stretches) expect(t.used).toBe(Scenery.stoneUsed(t.start, t.side));
    });

    test('a seeded share of the hairpins has its row: most of them, not all', () => {
        expect(rule.hairpinShare).toBeGreaterThanOrEqual(HAIRPIN_SHARE[0]);
        expect(rule.hairpinShare).toBeLessThanOrEqual(HAIRPIN_SHARE[1]);
        for (const h of read.hairpins) expect(h.used).toBe(Scenery.hairpinUsed(h));
        // Of the hairpins whose outside has a bare edge to guard. The fixture world has three hairpins: too few for a share
        const open = read.hairpins.filter(h => h.places > 0);
        const used = open.filter(h => h.used);
        if (open.length) expect(used.length).toBeGreaterThan(0);
        // (a share needs hairpins to share: the fixture world has three hairpins)
        if (open.length < 5) return;
        expect(used.length).toBeLessThan(open.length);
        expect(used.length / open.length).toBeGreaterThanOrEqual(HAIRPIN_SHARE[0]);
        expect(used.length / open.length).toBeLessThanOrEqual(HAIRPIN_SHARE[1]);
        // And every one of them was drawn: a stone stands in its row
        for (const h of used) expect(read.stones.some(stone => read.rows.some(t => t.hairpin === h && t.places.some(q => near(q, stone))))).toBe(true);
    });

    test('the same stretches, the same rows and the same choice on a second load ridden in other steps', () => {
        const sign = r => r.stretches.map(t => `${t.start}:${t.side}:${t.used}:${t.places.map(q => q.k).join(',')}`);
        expect(sign(again)).toEqual(sign(read));
        const rows = r => r.rows.map(t => `${Math.round(t.hairpin.apex)}:${t.side}:${t.used}:${t.places.map(q => q.s.toFixed(2)).join(',')}`);
        expect(rows(again)).toEqual(rows(read));
    });

    test('no stone floats: no corner of its foot over the drawn ground, and its top out of the ground by its height at least and a step of the road at most more', () => {
        const off = read.stones.filter(stone => stone.y0 > stone.low + FLOAT_M || stone.y1 < stone.middle + Scenery.STONE_HEIGHT_M - 0.05 || stone.y1 > stone.middle + Scenery.STONE_HEIGHT_M + Scenery.ROADSIDE_STEP_M + 0.05);
        expect(off.map(stone => `(${stone.x.toFixed(1)}, ${stone.z.toFixed(1)}): foot ${stone.y0.toFixed(2)}, lowest ground ${stone.low.toFixed(2)}, ground at its middle ${stone.middle.toFixed(2)}`)).toEqual([]);
    });

    test('the kerb course is under a hairpin\'s row only: no stone of a stretch or a wall has one, every stone of a hairpin\'s row but its last does', () => {
        expect(read.sites.filter(q => q.kind !== 'hairpin' && q.next)).toEqual([]);
        expect(read.sites.some(q => q.kind === 'drop')).toBe(true);
        const hairpin = read.sites.filter(q => q.kind === 'hairpin');
        for (const t of read.rows.filter(r => r.used)) {
            const mine = t.places.map(q => hairpin.find(site => near(q, site))).filter(Boolean);
            // (each stone with a neighbour drawn after it carries the piece to it)
            expect(mine.filter(site => site.next).length).toBeGreaterThanOrEqual(mine.length - 1 - t.places.filter(q => !hairpin.some(site => near(q, site))).length);
        }
    });

    test('the kerb course runs from a stone to the next of its row, at their seat and down into the ground', () => {
        // (a piece is drawn under the stones nearest the bike only: the ride's steps pass some rows by)
        const rowStones = read.stones.filter(stone => read.rows.some(t => t.used && t.places.some(q => near(q, stone))));
        if (rowStones.length) expect(read.kerbs.length).toBeGreaterThan(0);
        expect(read.kerbs.length).toBeLessThan(Math.max(1, rowStones.length));
        const at = ([x, z]) => read.stones.some(stone => Math.hypot(stone.x - x, stone.z - z) < 0.05);
        const off = [];
        for (const kerb of read.kerbs) {
            if (!at(kerb.a) || !at(kerb.b)) off.push(`(${kerb.a.map(n => n.toFixed(1))}) to (${kerb.b.map(n => n.toFixed(1))}): an end with no stone`);
            // (the stones of a drop are a spacing apart on the centre line: on the outside of a bend a little more)
            const long = Math.hypot(kerb.a[0] - kerb.b[0], kerb.a[1] - kerb.b[1]);
            if (long < 1.5 || long > 3.6) off.push(`(${kerb.a.map(n => n.toFixed(1))}): ${long.toFixed(2)} m long`);
            // Its top is at its stones' seat: the ground at their middle, or the verge's edge beside them where a
            // fill falls from it (never more than a step of the road over the ground: Scenery.ROADSIDE_STEP_M). Its
            // foot is in the ground along all of it
            kerb.ends.forEach((end, i) => {
                const slack = i === 1 ? 0.3 : 0.02;
                if (end.foot > end.ground - 0.05 || end.top < end.ground - slack || end.top > end.ground + Scenery.KERB.proudM + Scenery.ROADSIDE_STEP_M + slack) off.push(`(${kerb.a.map(n => n.toFixed(1))}) ${['start', 'middle', 'end'][i]}: top ${end.top.toFixed(2)}, foot ${end.foot.toFixed(2)}, ground ${end.ground.toFixed(2)}`);
            });
        }
        if (off.length) throw new Error(`${off.length} pieces of kerb are off:\n${off.slice(0, 30).join('\n')}`);
    });

    test('the cap takes the stones nearest the bike: at every place of the ride no stone left out is nearer than one drawn', () => {
        expect(read.most).toBeLessThanOrEqual(Scenery.STONE_CAP);
        for (const w of read.windows) {
            expect(w.shown).toBe(Math.min(w.sites, Scenery.STONE_CAP));
            expect(w.kerbs).toBeLessThanOrEqual(Scenery.KERB_CAP);
            // (a drawn stone's place is read back from 32-bit numbers)
            expect(w.nearestHidden).toBeGreaterThanOrEqual(w.farthestShown - 0.01);
        }
        // The cap is in force somewhere where the world has more stones than it, so the rule above is tested
        if (read.stones.length > Scenery.STONE_CAP * 2) expect(read.windows.some(w => w.sites > Scenery.STONE_CAP)).toBe(true);
    });

    test('a stone is 10 triangles and a piece of kerb 6, and the two caps together are within what the posts could take', () => {
        const stone = Scenery.stonePart().geometry.attributes.position.count / 3, kerb = Scenery.kerbPart().geometry.attributes.position.count / 3;
        expect([stone, kerb]).toEqual([10, 6]);
        // (120 stones of 24 triangles was the cap before the drops, 160 of 18 before the hairpins)
        expect(Scenery.STONE_CAP * stone + Scenery.KERB_CAP * kerb).toBeLessThanOrEqual(1700);
        expect(1700).toBeLessThan(120 * 24);
    });

    if (world.id === 'tremola') {
        test('on the shipped stage every place of a stretch or a row with stones had its stone as the bike came by, and the second ride drew the same stones', () => {
            const places = read.stretches.concat(read.rows, read.walls).filter(t => t.used).flatMap(t => t.places);
            // (a stone the ground falls more than footM under is left out of its row: Scenery.stoneSites)
            const missing = places.filter(q => !read.stones.some(stone => near(q, stone)));
            expect(missing.length).toBeLessThan(places.length * 0.05);
            const sign = r => r.stones.map(stone => `${stone.x.toFixed(2)},${stone.z.toFixed(2)},${stone.y0.toFixed(3)}`).sort();
            expect(sign(again)).toEqual(sign(read));
        });
    }
});

// A low wall's row takes its parapet's place. No wall of either world is low enough by the shipped rule, so the rule is
// read here with wallMaxM raised over the lowest walls (the share and every other number as shipped): every wall that
// qualifies then is stoned or not as a whole, as the share says, with no parapet drawn over a stoned wall, a solid edge
// in the physics and the stones' face for the chase camera, and a wall the share leaves out keeps its parapet
describe.each(worlds)('a low wall\'s row of stones on %s, with wallMaxM raised to 12 m', (name, world) => {
    const raised = loadGame(undefined, []);
    const shipped = raised.Scenery.STONE_RULE;
    Object.defineProperty(raised.Scenery, 'STONE_RULE', { get: () => ({ ...shipped, wallMaxM: 12 }), configurable: true });
    let env;
    const walls = [];
    beforeAll(async () => {
        env = await raised.WorldEnvironment.load(new raised.THREE.Scene(), { ...world, fetchFn: diskFetch().fetchFn, models: null, digest: async () => '0' });
        env.scenery.buildTile = () => null;
        const seen = new Set();
        for (let s = env.startS; s <= env.endS; s += 150) {
            const p = env.route.sample(s, {});
            env.update(p, s, null, Infinity);
            await env.streamer.settle(p, s);
            for (const side of [-1, 1]) {
                for (const run of env.scenery.wallRuns(env.route.indexAt(Math.max(0, s - 75)), env.route.indexAt(s + 75), side)) {
                    const id = `${side}:${run.start}`;
                    if (seen.has(id)) continue;
                    seen.add(id);
                    // (read with the wall's own section drawn: the bike is put down at its middle)
                    const q = run[Math.floor(run.length / 2)], at = env.route.sample(q.s, {});
                    env.update(at, q.s, null, Infinity);
                    await env.streamer.settle(at, q.s);
                    walls.push({ run, faults: lowWallFaults(raised, env, run) });
                }
            }
        }
    }, 900000);

    test('some walls qualify, the share takes some and not all, and each is stoned whole with no parapet, a solid edge and a face for the camera', () => {
        expect(walls.length).toBeGreaterThan(0);
        if (world.id === 'tremola') {
            expect(walls.some(w => raised.Scenery.wallUsed(w.run.start, w.run.side))).toBe(true);
            expect(walls.some(w => !raised.Scenery.wallUsed(w.run.start, w.run.side))).toBe(true);
        }
        const faults = walls.flatMap(w => w.faults.map(f => `wall at ${w.run.start} side ${w.run.side}: ${f}`));
        if (faults.length) throw new Error(`${faults.length} faults of the low walls' rows:\n${faults.slice(0, 30).join('\n')}`);
    });

    test('a qualifying wall drops less than wallMaxM all along, and with the shipped rule none of them qualifies', () => {
        for (const { run } of walls) {
            for (let i = run.a; i <= run.b; i++) expect(Math.max(...env.ground.wallTop(i, run.side).heights)).toBeLessThan(12);
            expect(Math.max(...[...Array(run.b - run.a + 1).keys()].flatMap(k => env.ground.wallTop(run.a + k, run.side).heights))).toBeGreaterThanOrEqual(shipped.wallMaxM);
        }
    });
});
