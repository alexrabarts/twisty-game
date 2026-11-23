/**
 * @jest-environment node
 */
// No land stands up beside the ride as a spike or a tent, and no wall ends open (tests/helpers/world-spikes.js reads
// the drawn triangles of the land, the stone and the ground the roads lay, every 300 m of the ride):
//   1. `stretched`: a land triangle within 30 m of the ride steeper than 1.5 over more than 2.5 m of height, not under
//      a road and not behind stone (`beside` within 10 m of the carriageway, `setback` farther)
//   2. `bare`: a face of land that closes a cut's step with no stone in front of it
//   3. `ends`: a wall's end with no face of stone across it, a foot over the ground, or an open flank
//   4. `overhangs`: an edge of the ground a road lays more than 1 m over everything drawn outside it
//   5. `flaps`: a wall's end with an open side beside it: an outer edge of the ground a road lays, within 3 m of the
//      end, more than 0.15 m over what is drawn outside it with no stone across it
//   6. `proud`: a wall's end that is open or stands more than 0.25 m over the wall's least height (RoadMesh.
//      WALL_MIN_UP_M over its road), a wall cut off at its full height (`closed`: the ends closed at about that
//      height; `tapers`: the ends whose face has fallen to nothing, none may; `joined`: the ends another road's wall
//      goes on from)
//   7. `fins`: an upright face of stone whose top falls more than 0.4 a metre faster than its road
//   8. `unfaced`: an upright face of stone, no parapet's, that is not laid and lit as its wall's face
//   9. `thin`: a piece of wall thinner than the wall: a piece of wall (but a return) whose top has less stone over
//      it than the wall's coping (RoadMesh.COPING_W_M: a marker stone and a margin either side), or any upright face of
//      stone with nothing drawn at its top behind it
//  10. `folds`: a piece of a wall's top (a coping, a parapet's top) folded over itself or over the piece beside it
//  11. `low`: a wall's top less than RoadMesh.WALL_MIN_UP_M (0.5 m) over the road under it
//  12. `jogs`: two walls side by side where one should go on: a wall's end that no wall goes on from with another
//      road's wall face or end within 2 m of it, or a joint of two roads' walls where the coping turns more than 35
//      degrees and one of the two pieces is shorter than 4 m (a short piece set across between two walls)
//  13. `strays`: a coping corner that stands out of the coping it meets (their inner corners more than 0.16 m apart
//      at a joint of two roads' walls: a wedge of coping toward the road), or a piece of a wall's top shorter than the
//      coping is deep (0.8 m) that shares no corner with any other top
//
// At 91af7da the junction at km 1.3 had one of each: the ride's wall ran on into the side road's mouth and the piece
// that joins it to the side road's wall stood across between the two walls, 3.4 m long at 44 degrees, its coping's
// inner corner 0.36 m out of the ride's (the owner's picture: "glitch in the wall at the junction"). The ride's wall
// now ends before the mouth (RoadMesh.atMouth) and the joining piece runs from there, 7.1 m at 15 degrees.
//
// At 732d95c, before the land was laid back (TerrainMesh.laidBack) and banked to the walls' ends (CUT_BANK): 1084
// stretched (245 beside, 839 set back, 14 of them in the wedge at km 7.8) and 149 overhangs. The importer gives a
// node the height its nearest road asks for, so on the midline between two stacked legs, and where a road's
// earthwork ends on a steep hillside, the land stepped 8 to 16 m in one 8 m cell: a row of triangles twice as steep
// as they are wide, the spikes at km 7.8. And the land a wall levelled closed to the wall's top over its last 6 m
// whatever its height: a tent against the stone.
//
// At 7bcc7cb 179 still stood beside the road and 69 overhangs. A wall's line took the first crossing of a triangle,
// and at a hairpin that was its own run on past its start, which closes nothing: the triangle its later course stands
// in was left whole, a ramp of land through the stone (the sand pyramid at the wall's end at km 7.9). And a wall
// ended over the strip of the leg below, where no bank down from its end could stand. Now a wall's line cuts every
// triangle its wall stands in, a wall goes on while a strip in front lies under the bank from its end
// (WorldEnvironment.edgeFoot `stepped`), the land at a wall's foot rises along the wall as a bank (`cap`), and a far
// ribbon ends its walls within 8 m of the rows the land is cut for.
//
// What still stands on the Tremola slice, held so it can only shrink:
//   - 127 beside the road: 64 are whole cells of strip nodes (road, bench or drop: the importer's own). Most are a
//     step between two legs that stands more than CUT_REACH_M from the upper road's edge, where no wall of that road
//     reaches it; 23 are whole cells with free land in them; 40 are parts of a triangle a wall cuts (the land
//     closing to a wall's top over its last 6 m, and side roads' walls)
//   - 354 set back: 269 of free land, most the fall of the land under a road's fill where the importer's earthwork
//     ends on the downhill side (left as it is: a road's fill is not undercut, LAY_HOLD), the rest a hillside
//     steeper than the lay-back's slope for more than its reach; 85 with a node of a road's strip
//   - 6 overhangs: the end of the ground under a verge where a wall ends at a structure, and slopes whose side stands
//     over land that falls away beside them. At 0019860 there were 10: four were a far ribbon at a side road's mouth
//     (km 0.0, 2.4, 5.2, 5.3). It kept a row every 16 m and passed over the mouth's rows, so the wall ran on into the
//     mouth to its full height (planFor walls a segment when any segment it spans is), and the slope laid from the
//     mouth's row stood open beside the wall's end, 1.8 m over the land levelled in front of the wall at km 2.4. Now
//     a far ribbon keeps a mouth's rows and the row either side of them (RoadMesh.section)
//   - 2 flaps (one gap counts once, beside however many wall ends): the ride's first row (two side roads' walls end
//     there: the ground under the ride's verge ends with the ride, 3.1 m over the land), and the ground under a verge
//     0.15 m over a junction's paving at km 4.4 (the one at km 2.4 went with the wall across that mouth)
//   - no proud end: the ends it counted (two side roads' walls at the ride's first row, one at its road's own end at
//     km 1.7, one at the junction at km 2.3) are closed at the least height
//
// At 4590977 a flap stood at 98 of the 128 wall ends (33 of 38 on the synthetic world), and 64 overhangs. A wall's
// end stands up to 2 m over the land in front of it (the land a wall levels lies under its top), and the slope laid
// on past the end had its side open over that land: the triangle of ground beside the stone at the end of the wall
// inside the hairpin at km 8.0, 0.6 m open. Now the side of a slope that starts at a wall's end is closed in stone
// (RoadMesh.edgeWorks `wing`), down into the land drawn under it. And a wall the land asks for over less than
// WALL_RUN_M is no wall, however far it could go on (RoadMesh.wallPlan `went`): 12 m of it stood on an open bank at
// km 11.3
//
// At c6889d5 96 of the 126 wall ends stood proud (36 of 38 on the synthetic world): a wall stopped at its full height
// over the land its cut levels, and the wing that closed the side of the slope past it was a slanted sheet of stone
// standing out from the wall's end, lit by its own slope and so paler than the wall (389 fins; 983 faces of stone
// not laid as their wall's face, the walls' returns among them): the wall inside the hairpin at km 2.4. Now a wall's
// face goes on along the road's edge past its end and tapers to nothing over TAPER_M, holding less and less of the
// slope's fall, and the slope starts at its foot (RoadMesh.edgeWorks `taper`); its parapet comes down to a kerb at
// the wall's end; a return is laid and lit as the wall's face. 103 ends taper, 11 end in the ground, 6 are joined.
// The slopes of two segments are joined at the row they share on the outside of a bend (9 overhangs and a flap
// less). The helper counts an upright piece of laid ground as holding its edges
//
// At e94e7fa 740 pieces of wall past a wall's end were thinner than the wall (229 on the synthetic world): the taper
// was the wall's face alone, its top the road's edge, so from above it read as a sheet of no thickness standing on
// the land round the apex of the hairpin at km 2.0. Now the wall that goes on past its end keeps its coping: a top
// of stone PARAPET_W_M wide over its face, the road meeting it on the inside, and a face across its end where it
// dies into the ground (RoadMesh.COPING_UP_M)
//
// At 6d78a4e every wall's top was the road's edge with only a parapet, where it had one, for its coping: read for a
// coping wide enough to hold a marker stone (0.8 m), 1 427 pieces of wall were thinner than that (525 on the
// synthetic world). Now every retaining wall's top is a level coping RoadMesh.COPING_W_M deep
//
// At 6d78a4e one piece of wall's top was folded (the piece that joins a side road's wall to the ride's at km 2.3,
// its coping laid along each run's own way and twisted across its face); with the copings RoadMesh.COPING_W_M deep,
// each piece laid square to its own segment, 4 more overlapped the piece beside them (a side road's wall past its end
// standing a hand from the piece that joins it to the ride's at km 2.4). Now a coping's pieces meet on one mitre at
// each row (RoadMesh.copingDepths), a joining piece's coping never twists, and a wall's end that a piece joins has no
// face past it
//
// At 2d1c6d3 every wall's top was its coping 3 cm over the road's edge, and past its end the wall sank to nothing:
// 1 429 tops of stone stood less than 0.5 m over the road under them (442 on the synthetic world), and 101 ends tapered
// to nothing (28). The owner asked for walls with a least height over the road, and for no wall to taper to nothing.
// Now every wall stands RoadMesh.WALL_MIN_UP_M over the road's edge, its block closed (its side to the road and its
// ends, `wallFace` 3), and past its end it keeps that height and ends closed. `proud` was a wall's end more than
// 0.5 m over the ground in front of it, which every closed end now is: it is now an end that is open or stands well
// over the least height over its own road (0 on both worlds, before and after: the 4 ends it counted on the Tremola
// slice, 3 on the synthetic world, are closed ends at the least height). The ground beside the ends closed with the
// wall too: 41 overhangs went to 9 (13 to 10)
import { describe, test, expect, beforeAll } from '@jest/globals';
import { loadGame } from '../helpers/load-game.js';
import { diskFetch } from '../helpers/world-fetch.js';
import { spikeWindow, spikeReport, SPIKE_LIMITS, SPIKE_RULES } from '../helpers/world-spikes.js';

const game = loadGame(undefined, []);
const { THREE, WorldEnvironment, WorldData, TerrainMesh, RoadMesh } = game;

const list = (items, n = 12) => items.slice(0, n).map(i => JSON.stringify(i)).join('\n');

// A world streamed along its ride, read every 300 m
async function read(options) {
    const { fetchFn } = diskFetch();
    const env = await WorldEnvironment.load(new THREE.Scene(), { fetchFn, models: null, digest: async () => '0', ...options });
    // Trees and houses are no land; their building is most of the streaming time
    env.scenery.buildTile = () => null;
    const store = {};
    const W = 300;
    for (let s = env.startS; s < env.endS; s += W) {
        const p = env.route.sample(s + W / 2, {});
        env.update(p, s, null, Infinity);
        await env.streamer.settle(p, s + W / 2);
        spikeWindow(game, env, store, p, 350, SPIKE_RULES);
    }
    return spikeReport(store, SPIKE_RULES.besideM);
}

describe('the land laid back (TerrainMesh.laidBack)', () => {
    const n = WorldData.TILE_N, zones = WorldData.ZONE;
    const tile = (tx, heightAt, zoneAt = () => zones.terrain) => {
        const heights = new Float32Array(n * n), zone = new Uint8Array(n * n);
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { heights[j * n + i] = heightAt(tx * (n - 1) + i, j); zone[j * n + i] = zoneAt(tx * (n - 1) + i, j); }
        return { tx, tz: 0, key: `${tx},0`, heights, zones: zone };
    };

    test('a step of 16 m in one cell becomes a bank no steeper than LAY_SLOPE, by lowering only', () => {
        const step = tile(0, i => (i < 30 ? 100 : 116));
        const laid = TerrainMesh.laidBack(step, null);
        const rise = TerrainMesh.LAY_SLOPE * WorldData.CELL_M;
        for (let i = 1; i < n; i++) expect(laid.at(i, 20) - laid.at(i - 1, 20)).toBeLessThanOrEqual(rise + 1e-3);
        for (let i = 0; i < n; i++) expect(laid.at(i, 20)).toBeLessThanOrEqual(step.heights[20 * n + i] + 1e-6);
        expect(laid.at(30, 20)).toBeCloseTo(100 + rise, 3);
        expect(laid.lowered.size).toBeGreaterThan(0);
        // Land with no step is not touched
        expect(TerrainMesh.laidBack(tile(0, i => 100 + i * 4), null).lowered.size).toBe(0);
    });

    test('a road\'s strip keeps its height, and holds the land beside it up', () => {
        // A road at 116 over land at 100, 8 m away: the node beside the strip is free, and stays within LAY_SLOPE
        // under the strip; the strip's own nodes do not move
        const road = tile(0, i => (i < 30 ? 100 : 116), i => (i >= 31 ? zones.road : zones.terrain));
        const laid = TerrainMesh.laidBack(road, null);
        expect(laid.at(31, 20)).toBe(116);
        expect(laid.at(30, 20)).toBeGreaterThanOrEqual(116 - TerrainMesh.LAY_SLOPE * WorldData.CELL_M - 1e-3);
    });

    test('two tiles lay the nodes they share alike', () => {
        const height = i => (i < 60 ? 100 : i < 70 ? 118 : 100 + (i % 7) * 3);
        const tiles = new Map([[`0,0`, tile(0, height)], [`1,0`, tile(1, height)]]);
        const near = key => tiles.get(key) || null;
        const a = TerrainMesh.laidBack(tiles.get('0,0'), near), b = TerrainMesh.laidBack(tiles.get('1,0'), near);
        let shared = 0;
        for (let j = 0; j < n; j++) {
            expect(a.at(n - 1, j)).toBeCloseTo(b.at(0, j), 5);
            if (a.lowered.has(j * n + n - 1)) shared++;
        }
        for (let j = 0; j < n; j++) expect(a.lowered.get(j * n + n - 1)).toBe(b.lowered.get(j * n));
        expect(a.lowered.size + b.lowered.size).toBeGreaterThan(0);
        expect(shared).toBeGreaterThanOrEqual(0);
    });
});

describe('the Tremola slice: no spike of land beside the ride, no open wall end', () => {
    let report;
    beforeAll(async () => {
        report = await read({ id: 'tremola' });
        const km = Object.entries(report.km).sort((a, b) => a[0] - b[0]).map(([k, c]) => `${k}:${c.beside}/${c.setback}/${c.bare}/${c.ends}/${c.overhangs}`).join(' ');
        console.log(`spikes: ${report.tiles} tiles; ${report.stretched.length} stretched (${report.beside.length} beside, ${report.setback.length} set back), ${report.bare.length} bare, ${report.ends.length} ends, ${report.overhangs.length} overhangs, ${report.flaps.length} flaps at ${report.wallEnds} wall ends (${report.tapers} taper, ${report.closed} closed, ${report.joined} joined, ${report.proud.length} proud), ${report.fins.length} fins, ${report.unfaced.length} unfaced, ${report.thin.length} thin, ${report.folds.length} folds, ${report.low.length} low\nby km (beside/setback/bare/ends/overhangs): ${km}`);
    }, 3600000);

    test('the land of the whole slice was read', () => {
        expect(report.tiles).toBeGreaterThan(40);
    });

    test('no land triangle stands up beside the ride', () => {
        if (report.beside.length > SPIKE_LIMITS.beside) throw new Error(`${report.beside.length} stretched land triangles within ${SPIKE_RULES.besideM} m of the ride (at most ${SPIKE_LIMITS.beside}):\n${list(report.beside)}`);
        if (report.setback.length > SPIKE_LIMITS.setback) throw new Error(`${report.setback.length} stretched land triangles ${SPIKE_RULES.besideM} to ${SPIKE_RULES.rideM} m from the ride (at most ${SPIKE_LIMITS.setback}):\n${list(report.setback)}`);
    });

    test('the spikes between the stacked legs at km 7.8 and 7.9 are gone', () => {
        // Between the wall of the leg above and the leg below (the wedge the owner's pictures show): 14 before
        const there = report.stretched.filter(o => Math.hypot(o.x + 1040, o.z - 9806) < 22);
        if (there.length) throw new Error(`${there.length} stretched land triangles in the wedge at km 7.8:\n${list(there)}`);
    });

    test('no land stands up at the end of the upper wall at the hairpin at km 7.9', () => {
        // Where the wall of the leg above ended over the outside of the hairpin below: a whole triangle from the
        // upper road's edge down to the lower road's bench (9 m in 8), under the wall's own line
        const there = report.stretched.filter(o => Math.hypot(o.x + 1115, o.z - 9777) < 14);
        if (there.length) throw new Error(`${there.length} stretched land triangles at the wall's end at km 7.9:\n${list(there)}`);
    });

    test('no face of land closes a step with no stone in front of it, and every wall end is closed', () => {
        if (report.bare.length > SPIKE_LIMITS.bare) throw new Error(`${report.bare.length} bare closing faces:\n${list(report.bare)}`);
        if (report.ends.length > SPIKE_LIMITS.ends) throw new Error(`${report.ends.length} wall ends open, hanging or with an open flank:\n${list(report.ends)}`);
    });

    test('no ground a road lays runs out over open air', () => {
        if (report.overhangs.length > SPIKE_LIMITS.overhangs) throw new Error(`${report.overhangs.length} edges of laid ground over open air (at most ${SPIKE_LIMITS.overhangs}):\n${list(report.overhangs)}`);
    });

    test('no wall ends with an open side beside it', () => {
        expect(report.wallEnds).toBeGreaterThan(100);
        if (report.flaps.length > SPIKE_LIMITS.flaps) throw new Error(`${report.flaps.length} wall ends with an open side beside them (at most ${SPIKE_LIMITS.flaps}):\n${list(report.flaps)}`);
    });

    test('no wall is cut off at its full height and none tapers to nothing: every end is closed at the least height', () => {
        if (report.proud.length > SPIKE_LIMITS.proud) throw new Error(`${report.proud.length} wall ends open or more than ${SPIKE_RULES.proudM} m over the least height (at most ${SPIKE_LIMITS.proud}):\n${list(report.proud)}`);
        expect(report.tapers).toBe(0);
        expect(report.closed).toBeGreaterThan(90);
    });

    test('every wall stands at least WALL_MIN_UP_M over the road', () => {
        expect(SPIKE_RULES.minUpM).toBe(RoadMesh.WALL_MIN_UP_M);
        if (report.low.length > SPIKE_LIMITS.low) throw new Error(`${report.low.length} tops of stone less than ${SPIKE_RULES.minUpM} m over the road (at most ${SPIKE_LIMITS.low}):\n${list(report.low)}`);
    });

    test('every upright face of stone is a wall\'s: none slanted out from a wall\'s end, none laid or lit apart from its wall', () => {
        if (report.fins.length > SPIKE_LIMITS.fins) throw new Error(`${report.fins.length} faces of stone whose top falls faster than their road:\n${list(report.fins)}`);
        if (report.unfaced.length > SPIKE_LIMITS.unfaced) throw new Error(`${report.unfaced.length} faces of stone not laid as their wall's face:\n${list(report.unfaced)}`);
    });

    test('no piece of wall is thinner than the wall: the wall past its end keeps its coping', () => {
        if (report.thin.length > SPIKE_LIMITS.thin) throw new Error(`${report.thin.length} pieces of wall thinner than the wall (at most ${SPIKE_LIMITS.thin}):\n${list(report.thin)}`);
        // (round the apex of the hairpin at km 2.0, where the owner saw a wall of no thickness on the grass: 10 before)
        expect(report.thin.filter(o => Math.hypot(o.x - 507.7, o.z - 11048.3) < 25)).toEqual([]);
    });

    test('no piece of a wall\'s top folds over itself or the piece beside it', () => {
        if (report.folds.length > SPIKE_LIMITS.folds) throw new Error(`${report.folds.length} pieces of a wall's top folded or over the piece beside them (at most ${SPIKE_LIMITS.folds}):\n${list(report.folds)}`);
    });

    test('where two walls meet they go on as one: no jog, no coping piece standing out or alone', () => {
        if (report.jogs.length > SPIKE_LIMITS.jogs) throw new Error(`${report.jogs.length} walls side by side where one should go on (at most ${SPIKE_LIMITS.jogs}):\n${list(report.jogs)}`);
        if (report.strays.length > SPIKE_LIMITS.strays) throw new Error(`${report.strays.length} coping pieces standing out or alone (at most ${SPIKE_LIMITS.strays}):\n${list(report.strays)}`);
    });

    test('the wall inside the hairpin at km 2.4 goes on round the bend and dies into the ground', () => {
        // Where the wall of the leg above started at its full height at the hairpin's apex, a pale fin past it (the
        // owner's picture): no end of a wall stands there now, and the run ends back round the bend with no height
        const near = (o, r) => Math.hypot(o.x - 239.1, o.z - 11139.1) < r;
        expect(report.proud.filter(o => near(o, 15))).toEqual([]);
        expect(report.fins.filter(o => near(o, 15))).toEqual([]);
        expect(report.flaps.filter(o => near(o, 15))).toEqual([]);
    });

    test('the side of the slope at the wall\'s end inside the hairpin at km 8.0 is closed', () => {
        // Where the wall of the leg above starts inside the hairpin (the owner's picture): 0.6 m open before
        const there = report.flaps.filter(o => Math.hypot(o.x + 1111.2, o.z - 9760.4) < 6);
        if (there.length) throw new Error(`an open side at the wall's end at km 8.0:\n${list(there)}`);
    });
});

describe('the synthetic world: the same check', () => {
    let report;
    beforeAll(async () => {
        report = await read({ id: 'all', search: '?worldData=tests/fixtures/world/mini' });
        console.log(`spikes (synthetic): ${report.tiles} tiles; ${report.stretched.length} stretched (${report.beside.length} beside, ${report.setback.length} set back), ${report.bare.length} bare, ${report.ends.length} ends, ${report.overhangs.length} overhangs, ${report.flaps.length} flaps at ${report.wallEnds} wall ends (${report.tapers} taper, ${report.closed} closed, ${report.joined} joined, ${report.proud.length} proud), ${report.fins.length} fins, ${report.unfaced.length} unfaced, ${report.thin.length} thin, ${report.folds.length} folds, ${report.low.length} low`);
    }, 3600000);

    test('every wall end is closed, with no open side beside it, and no closing face is bare', () => {
        expect(report.tiles).toBeGreaterThan(10);
        expect(report.bare).toEqual([]);
        expect(report.ends).toEqual([]);
        // (24: walls whose ends past them would stand a few metres apart now go on as one, `bridged`)
        expect(report.wallEnds).toBeGreaterThan(20);
        expect(report.flaps).toEqual([]);
        expect(report.unfaced).toEqual([]);
        expect(report.thin).toEqual([]);
        expect(report.folds).toEqual([]);
        expect(report.jogs).toEqual([]);
        expect(report.strays).toEqual([]);
        // (16 faces of two side roads' walls fall with roads steeper than 0.4, which the helper reads against the ride
        // only. Before the taper: 36 proud ends, 111 fins)
        expect(report.proud).toEqual([]);
        expect(report.low).toEqual([]);
        expect(report.fins.length).toBeLessThanOrEqual(16);
        expect(report.tapers).toBe(0);
    });

    // Its land is a made hillside steeper than the lay-back's slope from end to end: what is left is that hillside
    // (before: 283 beside, 2174 set back, 10 bare, 110 overhangs; 16 overhangs before the slopes' sides were closed).
    // 13 of its overhangs are the mouth of its one junction (s 4296), which the ride's walls stood across on both sides
    // until they ended before every mouth. 12 are the same at every level of detail: the ride falls and climbs about
    // 1 m a metre through the junction and its two side roads fall 3.3 m a metre down the made cliff (12.8 m in their
    // first 3.9 m: holdSide's ramp keeps that grade), so the sides of the ride's slopes at the mouth stand 1.9 to 12.4 m
    // over the land carved down beside them. That is the data, not a rule: no real road falls 3.3 m a metre. The other
    // was a far ribbon's wall run on into the mouth (kept whole now, RoadMesh.section); keeping the mouth's rows shows
    // one more on the far ribbon, which draws no verge and has no ground laid under one at a mouth: the end of the
    // ground under the verge at the mouth's last row, over the side road's fall
    test('what is left of its steep hillside can only shrink', () => {
        expect(report.beside.length).toBeLessThanOrEqual(265);
        expect(report.setback.length).toBeLessThanOrEqual(2188);
        expect(report.overhangs.length).toBeLessThanOrEqual(23);
    });
});
